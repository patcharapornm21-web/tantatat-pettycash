// แกนกลางของ SPA: Auth → โปรไฟล์/สิทธิ์ → Layout (Sidebar/Dock) → Router (hash)
import { auth, onAuthStateChanged, signOut } from "./fb.js";
import { isConfigured, APP_SETTINGS } from "./firebase-config.js";
import { getProfile, subSettings, subBranch, subPending, subBranchMonth, subBranchOpen, subRegionBranches, subSummary } from "./data.js";
import { esc, $, $$, curMonth, baht, ROLE_LABEL, statusChip } from "./utils.js";
import { toast, beep, friendlyError } from "./ui.js";

const root = document.getElementById("app");

// ---------- Event bus + shared context ----------
const listeners = {};
export const bus = {
  on(ev, fn) { (listeners[ev] ||= new Set()).add(fn); return () => listeners[ev].delete(fn); },
  emit(ev, data) { (listeners[ev] || []).forEach((fn) => fn(data)); },
};
export const ctx = {
  profile: null, role: null,
  branch: null,            // เอกสารสาขาของตัวเอง (พนักงานสาขา)
  summary: null,           // meta/summary (ฝ่ายบัญชี)
  regionBranches: null,    // สาขาในเขต (ผู้อนุมัติ)
  pending: [],             // ใบเบิกรออนุมัติ (ฝ่ายบัญชี=ทั้งหมด / ผู้อนุมัติ=ในเขต)
  branchReqs: [],          // ใบเบิกของสาขา (เดือนปัจจุบัน + งานค้าง)
  settings: { ...APP_SETTINGS.defaultSettings }, // ตั้งค่าระบบ (meta/settings)
  live: false,
  nav: (h) => { location.hash = h; },
  bus,
};

let sessionUnsubs = [];
let viewCleanup = null;

// =====================================================================
//  Boot
// =====================================================================
if (!isConfigured()) {
  root.innerHTML = `
    <div class="login"><div class="login-card" style="max-width:560px;align-items:flex-start">
      <div class="emblem"><span class="material-symbols-outlined">settings</span></div>
      <h2>ยังไม่ได้ตั้งค่า Firebase</h2>
      <p class="muted">เปิดไฟล์ <b>js/firebase-config.js</b> แล้วนำค่า <code>firebaseConfig</code> จาก Firebase Console มาวางแทนค่า <code>YOUR_...</code>
      จากนั้นรีเฟรชหน้านี้ (ดูขั้นตอนละเอียดใน <b>README-TH.md</b> ข้อ 3)</p></div></div>`;
} else {
  onAuthStateChanged(auth, async (user) => {
    stopSession();
    if (!user) return showLogin();
    try {
      const profile = await getProfile(user.uid);
      if (!profile || profile.active !== true) return showNoAccess(user, !profile);
      if (window.__expectedRole && window.__expectedRole !== profile.role) {
        const want = ROLE_LABEL[window.__expectedRole];
        window.__expectedRole = null;
        await signOut(auth);
        return showLogin(`บัญชีนี้ไม่ใช่สิทธิ์ "${want}" (สิทธิ์จริง: ${ROLE_LABEL[profile.role]}) — กรุณาเลือกแท็บให้ตรง หรือไม่ต้องเลือกแท็บ`);
      }
      window.__expectedRole = null;
      startSession(profile);
    } catch (e) {
      console.error(e);
      showLogin(friendlyError(e));
    }
  });
  window.addEventListener("hashchange", route);
}

async function showLogin(msg) {
  stopSession(); document.body.classList.remove("in-app");
  const m = await import("./views/login.js");
  m.default(root, { msg });
}
function showNoAccess(user, noProfile) {
  root.innerHTML = `<div class="login"><div class="login-card">
    <div class="emblem" style="color:var(--warn)"><span class="material-symbols-outlined">lock</span></div>
    <h2>${noProfile ? "บัญชียังไม่ได้รับสิทธิ์ใช้งาน" : "บัญชีนี้ถูกปิดการใช้งาน"}</h2>
    <p class="muted center">${esc(user.email)}<br>กรุณาแจ้งฝ่ายบัญชีส่วนกลางให้เพิ่ม/เปิดใช้งานบัญชีของคุณในเมนู “ผู้ใช้งาน”</p>
    <button class="btn primary block" id="lo">ออกจากระบบ</button></div></div>`;
  $("#lo").onclick = () => signOut(auth);
}

// =====================================================================
//  Session
// =====================================================================
function stopSession() {
  sessionUnsubs.forEach((u) => { try { u(); } catch {} });
  sessionUnsubs = [];
  if (viewCleanup) { try { viewCleanup(); } catch {} viewCleanup = null; }
  Object.assign(ctx, { settings: { ...APP_SETTINGS.defaultSettings }, profile: null, role: null, branch: null, summary: null, regionBranches: null, pending: [], branchReqs: [], live: false });
}

function startSession(profile) {
  ctx.profile = profile; ctx.role = profile.role;
  const onErr = (e) => { console.error(e); toast(friendlyError(e), "err", 6000); };
  let firstPending = true;
  sessionUnsubs.push(subSettings((st) => { ctx.settings = { ...APP_SETTINGS.defaultSettings, ...st }; bus.emit("settings", ctx.settings); }, () => {}));

  if (profile.role === "branch") {
    sessionUnsubs.push(subBranch(profile.branchId, (b) => { ctx.branch = b; ctx.live = true; bus.emit("branch", b); renderBadges(); }, onErr));
    // ใบเบิกเดือนปัจจุบัน + งานค้าง → ใช้ร่วมกันทุกหน้า (ประหยัด Read) และแจ้งเตือนเมื่อสถานะเปลี่ยน
    const prevStatus = new Map(); let monthList = [], openList = [];
    const publish = () => {
      const m = new Map(); monthList.forEach((r) => m.set(r.id, r)); openList.forEach((r) => { if (!m.has(r.id)) m.set(r.id, r); });
      ctx.branchReqs = [...m.values()]; bus.emit("branchReqs", ctx.branchReqs);
    };
    const detect = (list) => list.forEach((r) => {
      const p = prevStatus.get(r.id);
      if (p && p !== r.status) {
        const t = r.status === "approved" ? ["ok", "ได้รับการอนุมัติ ✅"] : r.status === "rejected" ? ["err", "ถูกปฏิเสธ"] :
                  r.status === "returned" ? ["warn", "ถูกส่งกลับให้แก้ไข"] : r.status === "replenished" ? ["ok", "โอนเงินชดเชยแล้ว 💸"] : null;
        if (t) { toast(`<b>${esc(r.docNo)}</b> ${t[1]}`, t[0], 6000, () => ctx.nav(`#/request/${r.id}`)); beep(); }
      }
      prevStatus.set(r.id, r.status);
    });
    sessionUnsubs.push(subBranchMonth(profile.branchId, curMonth(), (l) => { detect(l); monthList = l; publish(); }, onErr));
    sessionUnsubs.push(subBranchOpen(profile.branchId, (l) => {
      const now = new Set(l.map((r) => r.id));
      openList.forEach((r) => { // ใบจากเดือนเก่าที่หลุดจากรายการ "ค้าง" = ถูกดำเนินการแล้ว
        if (!now.has(r.id) && !monthList.some((m) => m.id === r.id)) { toast(`<b>${esc(r.docNo)}</b> มีการอัปเดตสถานะ`, "info", 6000, () => ctx.nav(`#/request/${r.id}`)); beep(); }
      });
      detect(l); openList = l; publish();
    }, onErr));
  } else {
    // ผู้อนุมัติ/ฝ่ายบัญชี: ฟังคิวรออนุมัติแบบ Real-time ตลอดเวลา ไม่ว่าอยู่หน้าไหน
    const region = profile.role === "approver" ? profile.region : null;
    if (profile.role === "approver" && !region) toast("บัญชี ROM ยังไม่ได้กำหนดสาขาที่ดูแล กรุณาแจ้งฝ่ายบัญชี", "warn", 8000);
    else sessionUnsubs.push(subPending(region, (list, added) => {
      ctx.pending = list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); ctx.live = true;
      if (!firstPending && added.length) {
        added.forEach((r) => toast(`📥 ใบเบิกใหม่ <b>${esc(r.docNo)}</b><br><span class="small">${esc(r.branchName || r.branchId)} · ${baht(r.total)} · ${esc(r.requesterName || "")}</span>`,
          "new", 7000, () => ctx.nav(`#/request/${r.id}`)));
        if (added.length) beep();
        document.title = `(${ctx.pending.length}) ใบเบิกรออนุมัติ`;
      }
      firstPending = false;
      if (!ctx.pending.length) document.title = APP_SETTINGS.systemName;
      bus.emit("pending", ctx.pending); renderBadges();
    }, onErr));
    if (profile.role === "accounting") sessionUnsubs.push(subSummary((s) => { ctx.summary = s; bus.emit("summary", s); }, onErr));
    else if (region) sessionUnsubs.push(subRegionBranches(region, (l) => { ctx.regionBranches = l; bus.emit("regionBranches", l); }, onErr));
  }

  document.body.classList.add("in-app");
  buildShell();
  if (!location.hash || location.hash === "#/" || location.hash === "#/login") location.hash = "#/overview";
  route();
}

// =====================================================================
//  Shell
// =====================================================================
const NAV = {
  branch: [
    ["overview", "dashboard", "ภาพรวมสาขา"],
    ["new", "add_circle", "ขอเบิกเงินสดย่อย"],
    ["requests", "receipt_long", "รายการของฉัน"],
    ["reports", "analytics", "รายงาน"],
  ],
  approver: [
    ["overview", "fact_check", "รออนุมัติ", "pending"],
    ["requests", "receipt_long", "รายการทั้งเขต"],
    ["reports", "analytics", "รายงาน"],
  ],
  accounting: [
    ["overview", "account_balance_wallet", "Console บัญชี", "pending"],
    ["requests", "receipt_long", "ใบเบิกทั้งหมด"],
    ["reports", "analytics", "รายงาน"],
    ["users", "group", "ผู้ใช้งาน"],
  ],
};

function buildShell() {
  const p = ctx.profile; const items = NAV[p.role];
  const initials = (p.name || p.email || "?").trim().slice(0, 1).toUpperCase();
  const link = (it, cls = "") => `<a href="#/${it[0]}" data-nav="${it[0]}" class="${cls}"><span class="l"><span class="material-symbols-outlined">${it[1]}</span><span class="t">${it[2]}</span></span>${it[3] ? `<span class="badge hide" data-badge="${it[3]}"></span>` : ""}</a>`;
  const dock = items.filter((i) => i[0] !== "new").slice(0, 4);
  const dockHtml = p.role === "branch"
    ? [dock[0], null, dock[1], dock[2]].map((it) => it ? `<a href="#/${it[0]}" data-nav="${it[0]}"><span class="material-symbols-outlined">${it[1]}</span>${it[2].replace("รายการของฉัน", "รายการ").replace("ภาพรวมสาขา", "ภาพรวม")}</a>` :
        `<a href="#/new" class="fab" data-nav="new" aria-label="ขอเบิก"><span class="material-symbols-outlined">add</span></a>`).join("") + `<a id="mlogout"><span class="material-symbols-outlined">logout</span>ออก</a>`
    : dock.map((it) => `<a href="#/${it[0]}" data-nav="${it[0]}">${it[3] ? `<span class="badge hide" data-badge="pending"></span>` : ""}<span class="material-symbols-outlined">${it[1]}</span>${it[2].replace("ใบเบิกทั้งหมด", "ใบเบิก").replace("รายการทั้งเขต", "ทั้งเขต").replace("Console บัญชี", "Console")}</a>`).join("") + `<a id="mlogout"><span class="material-symbols-outlined">logout</span>ออก</a>`;
  root.innerHTML = `
  <div class="shell">
    <aside class="side">
      <div>
        <div class="brand"><div class="logo"><span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1">dentistry</span></div>
          <div><b>${esc(APP_SETTINGS.orgName)}</b><small>PETTY CASH SYSTEM</small></div></div>
        <div class="navlabel">เมนูหลัก</div>
        <nav class="nav">${items.map((it) => link(it)).join("")}</nav>
      </div>
      <div class="stack" style="gap:.6rem">
        <div class="userbox"><div class="avatar">${esc(initials)}</div>
          <div class="u grow" style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name || p.email)}</b>
            <span class="small muted">${ROLE_LABEL[p.role]}${p.role === "branch" ? " · " + esc(p.branchId) : ""}</span></div></div>
        <button class="btn ghost sm" id="mysig"><span class="material-symbols-outlined">draw</span><span class="hide-sm">ลายเซ็นของฉัน</span></button>
        <button class="btn ghost sm" id="logout"><span class="material-symbols-outlined">logout</span><span class="hide-sm">ออกจากระบบ</span></button>
      </div>
    </aside>
    <header class="mtop">
      <div class="row" style="gap:.5rem;min-width:0"><div class="avatar" style="background:var(--primary-soft)"><span class="material-symbols-outlined" style="font-size:20px">dentistry</span></div>
        <div style="min-width:0"><div class="tiny" style="color:var(--primary-d);font-weight:700;letter-spacing:.06em">${esc(APP_SETTINGS.orgName.toUpperCase())}</div>
        <b id="mtitle" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:62vw">${esc(p.name || "")}</b></div></div>
      <span class="row" style="gap:.5rem"><button class="icon-btn" id="mysig2" aria-label="ลายเซ็นของฉัน"><span class="material-symbols-outlined">draw</span></button><span class="live" id="mlive"><i></i>Live</span></span>
    </header>
    <main class="main"><div class="page" id="view"></div></main>
    <nav class="dock">${dockHtml}</nav>
  </div>`;
  $("#logout").onclick = () => signOut(auth);
  const openSig = () => import("./signature.js").then((m) => m.openSignaturePad(ctx));
  $("#mysig").onclick = openSig; $("#mysig2").onclick = openSig;
  const ml = $("#mlogout"); if (ml) ml.onclick = () => signOut(auth);
  renderBadges();
}

function renderBadges() {
  $$("[data-badge='pending']").forEach((b) => {
    const n = ctx.pending.length; b.textContent = n > 99 ? "99+" : n; b.classList.toggle("hide", !n);
  });
  const t = $("#mtitle");
  if (t && ctx.role === "branch" && ctx.branch) t.textContent = `${ctx.branch.name} (${ctx.branch.id})`;
  const ml = $("#mlive"); if (ml) ml.classList.toggle("off", !ctx.live);
}

// =====================================================================
//  Router
// =====================================================================
const VIEWS = {
  overview: { branch: () => import("./views/branch-overview.js"), approver: () => import("./views/approver-overview.js"), accounting: () => import("./views/accounting.js") },
  new: { branch: () => import("./views/request-form.js") },
  requests: { branch: () => import("./views/requests.js"), approver: () => import("./views/requests.js"), accounting: () => import("./views/requests.js") },
  request: { branch: () => import("./views/detail.js"), approver: () => import("./views/detail.js"), accounting: () => import("./views/detail.js") },
  reports: { branch: () => import("./views/reports.js"), approver: () => import("./views/reports.js"), accounting: () => import("./views/reports.js") },
  users: { accounting: () => import("./views/users.js") },
};

let routeToken = 0;
async function route() {
  if (!ctx.profile) return;
  const token = ++routeToken;
  const [, name = "overview", ...rest] = (location.hash || "#/overview").split("/");
  const entry = VIEWS[name] && VIEWS[name][ctx.role];
  if (viewCleanup) { try { viewCleanup(); } catch {} viewCleanup = null; }
  const view = $("#view");
  $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === name || (name === "request" && a.dataset.nav === "requests")));
  if (!entry) { location.hash = "#/overview"; return; }
  view.innerHTML = `<div class="empty"><div class="spin" style="margin:0 auto 1rem"></div>กำลังโหลด…</div>`;
  window.scrollTo({ top: 0 });
  try {
    const mod = await entry();
    if (token !== routeToken) return;
    view.innerHTML = "";
    const cleanup = await mod.default(view, ctx, { params: rest.map(decodeURIComponent), name });
    if (token !== routeToken) { cleanup && cleanup(); return; }
    viewCleanup = cleanup || null;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="notice bad"><span class="material-symbols-outlined">error</span><div><b>โหลดหน้านี้ไม่สำเร็จ</b><br>${esc(friendlyError(e))}</div></div>`;
  }
}
