import { esc } from "./utils.js";

// ---------- Toast + เสียงแจ้งเตือน ----------
let soundOn = (() => { try { return localStorage.getItem("pc_sound") !== "off"; } catch { return true; } })();
export const isSoundOn = () => soundOn;
export const setSound = (v) => { soundOn = v; try { localStorage.setItem("pc_sound", v ? "on" : "off"); } catch {} };

let actx;
export function beep() {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    [[880, 0], [1175, 0.14]].forEach(([f, d]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
      o.connect(g).connect(actx.destination); o.start(t + d); o.stop(t + d + 0.25);
    });
  } catch {}
}

export function toast(msg, type = "info", ms = 4200, onClick) {
  let host = document.getElementById("toasts");
  if (!host) { host = document.createElement("div"); host.id = "toasts"; document.body.appendChild(host); }
  const icon = { info: "info", ok: "check_circle", warn: "warning", err: "error", new: "notifications_active" }[type] || "info";
  const t = document.createElement("div");
  t.className = `toast t-${type}`;
  t.innerHTML = `<span class="material-symbols-outlined">${icon}</span><div>${msg}</div>`;
  if (onClick) { t.style.cursor = "pointer"; t.addEventListener("click", () => { onClick(); t.remove(); }); }
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- Modal ----------
export function openModal(html, { wide = false, onClose } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "modal-wrap";
  wrap.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  document.body.classList.add("no-scroll");
  requestAnimationFrame(() => wrap.classList.add("show"));
  const close = () => {
    wrap.classList.remove("show");
    setTimeout(() => { wrap.remove(); if (!document.querySelector(".modal-wrap")) document.body.classList.remove("no-scroll"); }, 200);
    onClose && onClose();
  };
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(); });
  wrap.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
  return { el: wrap.firstElementChild, wrap, close };
}

export function confirmDialog(message, { okText = "ยืนยัน", danger = false, title = "ยืนยันการทำรายการ" } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(`
      <div class="modal-body">
        <h3 class="modal-title">${esc(title)}</h3>
        <p class="muted" style="white-space:pre-line">${esc(message)}</p>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" data-close>ยกเลิก</button>
        <button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(okText)}</button>
      </div>`, { onClose: () => { if (!done) { done = true; resolve(false); } } });
    m.el.querySelector("[data-ok]").addEventListener("click", () => { done = true; resolve(true); m.close(); });
  });
}

// ---------- Busy overlay ----------
let busyCount = 0;
export async function busy(fn, label = "กำลังบันทึก…") {
  let o = document.getElementById("busy");
  if (!o) { o = document.createElement("div"); o.id = "busy"; document.body.appendChild(o); }
  busyCount++; o.innerHTML = `<div class="busy-card"><div class="spin"></div><span>${esc(label)}</span></div>`; o.classList.add("show");
  try { return await fn(); }
  finally { if (--busyCount <= 0) { busyCount = 0; o.classList.remove("show"); } }
}

export const friendlyError = (e) => {
  const c = e?.code || "";
  const map = {
    "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
    "auth/user-not-found": "ไม่พบผู้ใช้นี้",
    "auth/wrong-password": "รหัสผ่านไม่ถูกต้อง",
    "auth/too-many-requests": "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่",
    "auth/email-already-in-use": "อีเมลนี้ถูกใช้งานแล้ว",
    "auth/weak-password": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
    "auth/network-request-failed": "เชื่อมต่ออินเทอร์เน็ตไม่ได้",
    "permission-denied": "ไม่มีสิทธิ์ทำรายการนี้ (Security Rules ปฏิเสธ)",
    "unavailable": "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต",
    "resource-exhausted": "โควต้าฟรีของ Firebase วันนี้เต็มแล้ว (จะรีเซ็ตเวลาเที่ยงคืนตามเวลาแปซิฟิก)",
  };
  return map[c] || e?.message || "เกิดข้อผิดพลาด";
};

export function pageHeader({ title, crumb = "", actions = "", live = true }) {
  return `<div class="topbar"><div>
    <div class="crumb">${crumb}</div><h1>${title}</h1></div>
    <div class="row wrap">${live ? `<span class="live" data-live><i></i>Real-time</span>` : ""}${actions}</div></div>`;
}
