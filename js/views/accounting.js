// Central Accounting Console — ภาพรวม 100 สาขาจาก Summary Document (อ่านแค่ 1 เอกสาร) + Real-time
import { esc, baht, money, thDate, thDateTime, statusChip, debounce, $, $$, round2 } from "../utils.js";
import { pageHeader, toast, openModal, busy, friendlyError, isSoundOn, setSound, beep, confirmDialog } from "../ui.js";
import { seedBranches, updateBranchInfo, subLatest } from "../data.js";
import { openReplenishModal } from "./replenish.js";
import { APP_SETTINGS } from "../firebase-config.js";
import { bus } from "../app.js";

const PAGE = 25;

export default async function view(root, ctx) {
  const st = { q: "", region: "", flt: "all", sort: "code", dir: 1, page: 0, latest: [] };
  const offs = [];
  let alive = true;
  const list = () => Object.values(ctx.summary || {}).filter((x) => x && typeof x === "object" && x.id);
  const pct = (b) => (b.float > 0 ? (b.balance / b.float) * 100 : 0);

  root.innerHTML = pageHeader({
    title: "Central Accounting Console",
    crumb: "บัญชีส่วนกลาง › ภาพรวมทุกสาขา",
    actions: `<button class="btn ghost" id="snd"><span class="material-symbols-outlined">${isSoundOn() ? "volume_up" : "volume_off"}</span><span id="sndt">${isSoundOn() ? "เสียง: เปิด" : "เสียง: ปิด"}</span></button>
      <button class="btn ghost" id="bulk"><span class="material-symbols-outlined">edit_note</span>แก้ชื่อหลายสาขา</button>
      <button class="btn sky" id="seed"><span class="material-symbols-outlined">database</span>Seed สาขา</button>`,
  }) + `
    <div class="grid g4 keep2" id="kpis" style="margin-bottom:1.25rem"></div>
    <div class="grid g-main" style="margin-bottom:1.25rem">
      <div class="card flat"><div class="card-h" style="padding:1.25rem 1.5rem 0"><h3><span class="material-symbols-outlined" style="color:var(--tertiary)">inbox</span> ใบเบิกเข้าใหม่ (รออนุมัติ) <span class="badge blue" id="pcnt">0</span></h3>
        <span class="live"><i></i>Real-time</span></div><div id="incoming"></div></div>
      <div class="card"><div class="card-h"><h3>กิจกรรมล่าสุด</h3><span class="small muted">30 รายการ</span></div><div id="feed" class="timeline"></div></div>
    </div>
    <div class="card flat">
      <div class="card-h" style="padding:1.25rem 1.5rem 0"><h3>สถานะ 100 สาขา <span class="muted small" id="bcount"></span></h3></div>
      <div class="filters" style="padding:0 1.5rem 1rem">
        <div class="field grow" style="min-width:220px"><label>ค้นหา</label><div class="search"><span class="material-symbols-outlined">search</span><input class="inp" id="q" placeholder="รหัส / ชื่อสาขา"></div></div>
        <div class="field"><label>เขต</label><select class="inp" id="reg"></select></div>
        <div class="field"><label>แสดง</label><select class="inp" id="flt">
          <option value="all">ทุกสาขา</option><option value="pending">มีใบเบิกรออนุมัติ</option><option value="low">เงินคงเหลือต่ำ</option><option value="need">ควรโอนชดเชย (ใช้ไป &gt; 0)</option><option value="neg">ยอดติดลบ</option></select></div>
        <div class="field"><label>เรียงตาม</label><select class="inp" id="sort"><option value="code">รหัสสาขา</option><option value="balance">คงเหลือ (น้อย→มาก)</option><option value="used">ใช้ไป (มาก→น้อย)</option><option value="pending">รออนุมัติ</option></select></div>
      </div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>รหัส</th><th>ชื่อสาขา</th><th>เขต</th><th class="r">วงเงิน</th><th style="min-width:170px">คงเหลือ</th><th class="r">ใช้ไป</th><th class="r">รออนุมัติ</th><th class="r">จัดการ</th></tr></thead><tbody id="tb"></tbody></table></div>
      <div class="pager"><span class="small muted" id="pginfo"></span><div class="row"><button class="btn ghost sm" id="pv">‹ ก่อนหน้า</button><button class="btn ghost sm" id="nx">ถัดไป ›</button></div></div>
    </div>`;

  // ---------- KPI ----------
  const drawKpi = () => {
    const L = list();
    const sum = (k) => round2(L.reduce((s, b) => s + (Number(b[k]) || 0), 0));
    const fl = sum("float"), bal = sum("balance"), pen = sum("pendingAmt"), pc = L.reduce((s, b) => s + (b.pendingCnt || 0), 0);
    const low = L.filter((b) => pct(b) < APP_SETTINGS.lowBalancePct).length;
    $("#kpis").innerHTML = [
      ["account_balance", "วงเงินรวมทุกสาขา", baht(fl), `${L.length} สาขา`],
      ["account_balance_wallet", "เงินคงเหลือรวม", baht(bal), `ใช้ไปแล้ว ${baht(fl - bal)}`],
      ["schedule", "รออนุมัติ", baht(pen), `${pc} ใบเบิก`],
      ["warning", "สาขาเงินเหลือต่ำ", String(low), `ต่ำกว่า ${APP_SETTINGS.lowBalancePct}% ของวงเงิน`],
    ].map(([ic, l, v, s]) => `<div class="card kpi"><div class="lbl"><span class="material-symbols-outlined">${ic}</span>${l}</div><div class="val num">${v}</div><div class="sub">${s}</div></div>`).join("");
  };

  // ---------- Incoming / feed ----------
  let seen = new Set();
  const drawIncoming = () => {
    const P = ctx.pending; $("#pcnt").textContent = P.length;
    $("#incoming").innerHTML = P.length ? `<div class="tbl-wrap" style="max-height:340px;overflow-y:auto"><table class="tbl"><tbody>${P.slice(0, 50).map((r) => `
      <tr class="click ${seen.size && !seen.has(r.id) ? "flash" : ""}" data-id="${r.id}"><td><b>${esc(r.docNo)}</b><div class="small muted">${esc(r.branchName)} · ${esc(r.requesterName)}</div></td>
      <td class="small muted">${thDate(r.date)}</td><td class="r num"><b>${money(r.total)}</b></td><td class="r"><span class="material-symbols-outlined" style="color:var(--mute)">chevron_right</span></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><span class="material-symbols-outlined">task_alt</span>ไม่มีใบเบิกค้างอนุมัติ</div>`;
    seen = new Set(P.map((r) => r.id));
    $$("#incoming [data-id]").forEach((el) => (el.onclick = () => ctx.nav(`#/request/${el.dataset.id}`)));
  };
  const drawFeed = () => {
    $("#feed").innerHTML = st.latest.length ? st.latest.slice(0, 12).map((r) => `<div class="tl click" style="cursor:pointer" data-id="${r.id}"><div class="pt"></div><div class="grow"><div class="row between"><b>${esc(r.docNo)}</b>${statusChip(r.status)}</div>
      <div class="small muted">${esc(r.branchName)} · ${baht(r.total)}</div></div></div>`).join("") : `<div class="muted small">ยังไม่มีกิจกรรม</div>`;
    $$("#feed [data-id]").forEach((el) => (el.onclick = () => ctx.nav(`#/request/${el.dataset.id}`)));
  };

  // ---------- ตารางสาขา ----------
  const drawTable = () => {
    let L = list();
    const regions = [...new Set(L.map((b) => b.region))].sort();
    const rs = $("#reg"); if (rs.options.length !== regions.length + 1) rs.innerHTML = `<option value="">ทุกเขต</option>` + regions.map((r) => `<option ${r === st.region ? "selected" : ""}>${esc(r)}</option>`).join("");
    const q = st.q.trim().toLowerCase();
    L = L.filter((b) => (!q || `${b.id} ${b.name} ${b.abbr}`.toLowerCase().includes(q)) && (!st.region || b.region === st.region) &&
      (st.flt === "all" || (st.flt === "pending" && b.pendingCnt > 0) || (st.flt === "low" && pct(b) < APP_SETTINGS.lowBalancePct) ||
       (st.flt === "need" && b.float - b.balance > 0.004) || (st.flt === "neg" && b.balance < 0)));
    const key = { code: (b) => b.id, balance: (b) => b.balance, used: (b) => -(b.float - b.balance), pending: (b) => -(b.pendingAmt || 0) }[st.sort];
    L.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0));
    const pages = Math.max(1, Math.ceil(L.length / PAGE)); st.page = Math.min(st.page, pages - 1);
    const rows = L.slice(st.page * PAGE, st.page * PAGE + PAGE);
    $("#bcount").textContent = `(${L.length} จาก ${list().length})`;
    if (ctx.summary === null) { $("#tb").innerHTML = `<tr><td colspan="8"><div class="empty"><div class="spin" style="margin:0 auto 1rem"></div>กำลังโหลด…</div></td></tr>`; return; }
    if (!list().length) {
      $("#tb").innerHTML = `<tr><td colspan="8"><div class="empty"><span class="material-symbols-outlined">database</span><b>ยังไม่มีข้อมูลสาขา</b><br>กดปุ่ม “Seed สาขา” เพื่อสร้างสาขา 001–100 ในคลิกเดียว<br><button class="btn sky" style="margin-top:1rem" id="seed2">Seed 100 สาขา</button></div></td></tr>`;
      $("#seed2").onclick = openSeed;
    } else $("#tb").innerHTML = rows.map((b) => {
      const p = Math.max(0, Math.min(100, pct(b))), used = b.float - b.balance;
      const cls = p < APP_SETTINGS.lowBalancePct / 2 ? "crit" : p < APP_SETTINGS.lowBalancePct ? "low" : "";
      return `<tr><td><b>${esc(b.id)}</b></td><td>${esc(b.name)}<div class="tiny muted">${esc(b.abbr || "")}</div></td><td><span class="tag gray">${esc(b.region || "-")}</span></td>
        <td class="r num">${money(b.float)}</td>
        <td><div class="num" style="font-weight:700;${b.balance < 0 ? "color:var(--bad)" : ""}">${money(b.balance)}</div><div class="progress ${cls}" style="height:6px;margin-top:4px"><div style="width:${p}%"></div></div></td>
        <td class="r num">${money(used)}</td>
        <td class="r num">${b.pendingCnt ? `<span class="chip st-pending">${b.pendingCnt} · ${money(b.pendingAmt)}</span>` : '<span class="muted">-</span>'}</td>
        <td class="r" style="white-space:nowrap"><button class="btn ok sm" data-repl="${esc(b.id)}" ${used > 0.004 ? "" : "disabled"}><span class="material-symbols-outlined">payments</span>ชดเชย</button>
          <button class="icon-btn" data-edit="${esc(b.id)}" aria-label="แก้ไขสาขา"><span class="material-symbols-outlined">edit</span></button></td></tr>`;
    }).join("");
    $("#pginfo").textContent = `หน้า ${st.page + 1}/${pages}`; $("#pv").disabled = st.page === 0; $("#nx").disabled = st.page >= pages - 1;
    $$("[data-repl]").forEach((b) => (b.onclick = () => openReplenishModal(ctx, ctx.summary[b.dataset.repl])));
    $$("[data-edit]").forEach((b) => (b.onclick = () => openEdit(ctx.summary[b.dataset.edit])));
  };

  // ---------- Modals ----------
  function openEdit(b) {
    const m = openModal(`<div class="modal-body"><h3 class="modal-title">แก้ไขสาขา ${esc(b.id)}</h3>
      <div class="field"><label>ชื่อสาขา</label><input class="inp" id="e-name" value="${esc(b.name)}" maxlength="60"></div>
      <div class="grid g2 keep" style="grid-template-columns:1fr 1fr;gap:.75rem"><div class="field"><label>ตัวย่อสาขา (ใช้ในเลขที่เอกสาร)</label><input class="inp" id="e-abbr" value="${esc(b.abbr || "")}" maxlength="6"></div>
        <div class="field"><label>เขต (Region)</label><input class="inp" id="e-reg" value="${esc(b.region || "")}" maxlength="8"></div></div>
      <div class="field"><label>วงเงินสดย่อยตั้งต้น (บาท)</label><input class="inp num" id="e-float" type="number" min="0" step="0.01" value="${b.float}"></div>
      <div class="small muted">ตัวอย่างเลขที่เอกสาร: <b id="e-prev"></b></div></div>
      <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn sky" id="e-save">บันทึก</button></div>`);
    const q = (s) => m.el.querySelector(s);
    const prev = () => { q("#e-prev").textContent = `${(q("#e-abbr").value || "XX").toUpperCase()}-PC${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-001`; };
    q("#e-abbr").oninput = prev; prev();
    q("#e-save").onclick = async () => {
      const name = q("#e-name").value.trim(), abbr = q("#e-abbr").value.trim().toUpperCase(), region = q("#e-reg").value.trim().toUpperCase();
      if (!name || !abbr || !region) return toast("กรอกข้อมูลให้ครบ", "warn");
      try { await busy(() => updateBranchInfo(b.id, { name, abbr, region, float: q("#e-float").value })); toast("บันทึกสาขาแล้ว", "ok"); m.close(); }
      catch (e) { toast(friendlyError(e), "err", 7000); }
    };
  }

  function openSeed() {
    const m = openModal(`<div class="modal-body"><h3 class="modal-title">Seed สาขาเริ่มต้น</h3>
      <div class="notice info"><span class="material-symbols-outlined">info</span><div>สร้างสาขา 001…N พร้อมวงเงินตั้งต้นในคลิกเดียว <b>ข้ามสาขาที่มีอยู่แล้ว</b> (ไม่ทับข้อมูลเดิม) (เขียนข้อมูลครั้งเดียวแบบ batch)</div></div>
      <div class="grid g2 keep" style="grid-template-columns:1fr 1fr;gap:.75rem">
        <div class="field"><label>จำนวนสาขา</label><input class="inp num" id="s-n" type="number" min="1" max="200" value="100"></div>
        <div class="field"><label>วงเงินตั้งต้น/สาขา (บาท)</label><input class="inp num" id="s-f" type="number" min="0" step="0.01" value="5000"></div>
        <div class="field"><label>จำนวนสาขาต่อเขต</label><input class="inp num" id="s-r" type="number" min="1" value="10"></div>
        <div class="field"><label>รูปแบบชื่อ ({n} = รหัส)</label><input class="inp" id="s-p" value="สาขา {n}"></div></div></div>
      <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn sky" id="s-go"><span class="material-symbols-outlined">database</span>สร้างสาขา</button></div>`);
    const q = (s) => m.el.querySelector(s);
    q("#s-go").onclick = async () => {
      try {
        const r = await busy(() => seedBranches({ count: +q("#s-n").value, floatAmt: +q("#s-f").value, perRegion: +q("#s-r").value || 10, namePattern: q("#s-p").value || "สาขา {n}" }), "กำลังสร้างสาขา…");
        toast(`สร้างสาขาใหม่ ${r.added} แห่ง (ข้ามที่มีอยู่แล้ว ${r.skipped})`, "ok", 6000); m.close();
      } catch (e) { console.error(e); toast(friendlyError(e), "err", 8000); }
    };
  }

  function openBulk() {
    const L = list().sort((a, b) => (a.id > b.id ? 1 : -1));
    const m = openModal(`<div class="modal-body"><h3 class="modal-title">แก้ชื่อ/เขต หลายสาขาพร้อมกัน</h3>
      <p class="small muted" style="margin:0">วางข้อมูลจาก Excel (คั่นด้วย Tab หรือ ,) รูปแบบ <b>รหัส, ชื่อสาขา, เขต(ถ้ามี), ตัวย่อ(ถ้ามี)</b> บรรทัดละ 1 สาขา</p>
      <textarea class="inp" id="b-t" style="min-height:240px;font-family:ui-monospace,monospace;font-size:12px" placeholder="001,สาขารังสิต,R01,RS&#10;002,สาขาบางแสน,R01,BS">${esc(L.slice(0, 3).map((b) => `${b.id},${b.name},${b.region},${b.abbr}`).join("\n"))}</textarea><div id="b-r" class="small"></div></div>
      <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn sky" id="b-go">บันทึกทั้งหมด</button></div>`, { wide: true });
    const q = (s) => m.el.querySelector(s);
    q("#b-go").onclick = async () => {
      const lines = q("#b-t").value.split(/\r?\n/).map((l) => l.split(/\t|,/).map((x) => x.trim())).filter((a) => a[0]);
      const bad = lines.filter((a) => !ctx.summary[a[0]]).map((a) => a[0]);
      if (bad.length) { q("#b-r").style.color = "var(--bad)"; q("#b-r").textContent = `ไม่พบรหัสสาขา: ${bad.join(", ")}`; return; }
      if (!(await confirmDialog(`แก้ไข ${lines.length} สาขา?`))) return;
      try {
        await busy(async () => { for (const a of lines) { const o = ctx.summary[a[0]];
          await updateBranchInfo(a[0], { name: a[1] || o.name, region: (a[2] || o.region).toUpperCase(), abbr: (a[3] || o.abbr).toUpperCase(), float: o.float }); } }, "กำลังบันทึก…");
        toast(`แก้ไข ${lines.length} สาขาเรียบร้อย`, "ok"); m.close();
      } catch (e) { toast(friendlyError(e), "err", 7000); }
    };
  }

  // ---------- Wire ----------
  $("#seed").onclick = openSeed; $("#bulk").onclick = openBulk;
  $("#snd").onclick = () => { setSound(!isSoundOn()); $("#sndt").textContent = isSoundOn() ? "เสียง: เปิด" : "เสียง: ปิด"; $("#snd .material-symbols-outlined").textContent = isSoundOn() ? "volume_up" : "volume_off"; if (isSoundOn()) beep(); };
  $("#q").oninput = debounce((e) => { if (!alive) return; st.q = e.target.value; st.page = 0; drawTable(); }, 150);
  $("#reg").onchange = (e) => { st.region = e.target.value; st.page = 0; drawTable(); };
  $("#flt").onchange = (e) => { st.flt = e.target.value; st.page = 0; drawTable(); };
  $("#sort").onchange = (e) => { st.sort = e.target.value; drawTable(); };
  $("#pv").onclick = () => { st.page--; drawTable(); }; $("#nx").onclick = () => { st.page++; drawTable(); };

  drawKpi(); drawIncoming(); drawFeed(); drawTable();
  offs.push(bus.on("summary", () => { drawKpi(); drawTable(); }));
  offs.push(bus.on("pending", drawIncoming));
  offs.push(subLatest((l) => { if (!alive) return; st.latest = l; drawFeed(); }, (e) => toast(friendlyError(e), "err")));
  return () => { alive = false; offs.forEach((f) => f()); };
}
