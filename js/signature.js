// ลายเซ็นดิจิทัล: วาดบน Canvas → PNG Base64 → เก็บใน users/{uid}.signature
import { openModal, toast, busy, friendlyError } from "./ui.js";
import { saveMySignature } from "./data.js";
import { esc } from "./utils.js";

const W = 480, H = 180;

/** เปิดหน้าต่างเซ็นชื่อ คืนค่า dataURL ที่บันทึกแล้ว หรือ null ถ้ายกเลิก */
export function openSignaturePad(ctx, { title = "ลายเซ็นของฉัน", note = "" } = {}) {
  return new Promise((resolve) => {
    let done = false, drawing = false, dirty = false, last = null;
    const cur = ctx.profile.signature || "";
    const m = openModal(`
      <div class="modal-body">
        <div class="row between"><h3 class="modal-title">${esc(title)}</h3><button class="icon-btn" data-close aria-label="ปิด"><span class="material-symbols-outlined">close</span></button></div>
        <p class="small muted" style="margin:0 0 .75rem">${esc(note) || "เซ็นชื่อในกรอบด้วยนิ้วหรือเมาส์ ระบบจะจดจำไว้และนำไปแสดงบนใบเบิกและรายงานให้อัตโนมัติ ไม่ต้องเซ็นใหม่"}</p>
        ${cur ? `<div class="small muted" style="margin-bottom:.35rem">ลายเซ็นปัจจุบัน</div><img src="${cur}" alt="ลายเซ็นปัจจุบัน" style="max-height:64px;border:1px dashed var(--line,#cbd5e1);border-radius:8px;padding:4px;margin-bottom:.75rem;background:#fff">` : ""}
        <div style="border:1.5px dashed var(--primary,#0ea5e9);border-radius:12px;background:#fff;touch-action:none"><canvas id="sg" style="width:100%;height:${H}px;display:block;touch-action:none;cursor:crosshair"></canvas></div>
        <div class="row" style="justify-content:space-between;margin-top:.75rem;gap:.5rem;flex-wrap:wrap">
          <button class="btn ghost" id="sg-clear"><span class="material-symbols-outlined">ink_eraser</span>ล้าง</button>
          <div class="row" style="gap:.5rem"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn ok" id="sg-save"><span class="material-symbols-outlined">draw</span>บันทึกลายเซ็น</button></div>
        </div>
      </div>`, { onClose: () => { if (!done) { done = true; resolve(null); } } });
    const cv = m.el.querySelector("#sg"); const g = cv.getContext("2d");
    const fit = () => { const r = cv.getBoundingClientRect(); const k = Math.max(1, window.devicePixelRatio || 1); cv.width = Math.round(r.width * k); cv.height = Math.round(H * k); g.setTransform(k, 0, 0, k, 0, 0); g.lineWidth = 2.4; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#0f172a"; };
    requestAnimationFrame(fit);
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener("pointerdown", (e) => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); g.beginPath(); g.arc(last.x, last.y, 1.2, 0, 7); g.fillStyle = "#0f172a"; g.fill(); dirty = true; e.preventDefault(); });
    cv.addEventListener("pointermove", (e) => { if (!drawing) return; const p = pos(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; e.preventDefault(); });
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => cv.addEventListener(ev, () => { drawing = false; }));
    m.el.querySelector("#sg-clear").onclick = () => { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.restore(); dirty = false; };
    m.el.querySelector("#sg-save").onclick = async () => {
      if (!dirty) return toast("กรุณาเซ็นชื่อในกรอบก่อน", "warn");
      const data = exportTrimmed(cv);
      if (!data) return toast("ลายเซ็นเล็กเกินไป กรุณาเซ็นใหม่", "warn");
      try {
        await busy(() => saveMySignature(ctx.profile.uid, data), "กำลังบันทึกลายเซ็น…");
        ctx.profile.signature = data;
        done = true; m.close(); toast("บันทึกลายเซ็นเรียบร้อย", "ok"); resolve(data);
      } catch (e) { console.error(e); toast(friendlyError(e), "err", 7000); }
    };
  });
}

/** ถ้ายังไม่มีลายเซ็น ให้เซ็นก่อน (ใช้ตอนอนุมัติครั้งแรก) คืน true ถ้ามีลายเซ็นพร้อมใช้ */
export async function ensureSignature(ctx) {
  if (ctx.profile.signature) return true;
  return !!(await openSignaturePad(ctx, { title: "เซ็นชื่อครั้งแรก", note: "ยังไม่มีลายเซ็นในระบบ กรุณาเซ็นชื่อ 1 ครั้ง ระบบจะบันทึกและใช้กับเอกสารที่คุณอนุมัติต่อไปโดยอัตโนมัติ" }));
}

// ตัดขอบว่าง + ย่อให้พอดี แล้วบีบจน ≤ ~40KB
function exportTrimmed(cv) {
  const w = cv.width, h = cv.height;
  const px = cv.getContext("2d").getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 - x0 < 8 || y1 - y0 < 4) return null;
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  let scale = Math.min(1, W / cw);
  for (let i = 0; i < 6; i++) {
    const o = document.createElement("canvas"); o.width = Math.max(1, Math.round(cw * scale)); o.height = Math.max(1, Math.round(ch * scale));
    o.getContext("2d").drawImage(cv, x0, y0, cw, ch, 0, 0, o.width, o.height);
    const d = o.toDataURL("image/png");
    if (d.length <= 55000) return d;
    scale *= 0.75;
  }
  return null;
}
