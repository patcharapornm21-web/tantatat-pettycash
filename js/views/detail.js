import { esc, baht, money, thDate, thDateTime, statusChip, STATUS, $, $$ } from "../utils.js";
import { subRequest, loadReceipts, decideRequest, cancelRequest } from "../data.js";
import { pageHeader, toast, busy, friendlyError, confirmDialog, openModal } from "../ui.js";
import { zoom } from "./request-form.js";
import { openReplenishModal } from "./replenish.js";
import { bus } from "../app.js";
import { ensureSignature } from "../signature.js";

const ACTION_LABEL = { submit: "ส่งใบเบิก", resubmit: "แก้ไขและส่งใหม่", approved: "อนุมัติ", rejected: "ปฏิเสธ", returned: "ส่งกลับแก้ไข", replenished: "โอนชดเชย", edited: "แก้ไขและส่งอนุมัติใหม่", cancelled: "ยกเลิกเอกสาร" };

export default async function view(root, ctx, { params }) {
  const id = params[0];
  let req = null, receipts = {}, rcKey = "";
  let first = true;

  const canDecide = () => req && req.status === "pending" && (ctx.role === "accounting" || (ctx.role === "approver" && req.region === ctx.profile.region));

  const draw = () => {
    if (!req) { root.innerHTML = first ? `<div class="empty"><div class="spin" style="margin:0 auto 1rem"></div>กำลังโหลด…</div>` : `<div class="notice bad"><span class="material-symbols-outlined">error</span><div>ไม่พบใบเบิก หรือถูกลบแล้ว</div></div>`; return; }
    const r = req; const st = r.status;
    const back = ctx.role === "branch" ? "#/overview" : "#/overview";
    const mine = ctx.role === "branch" && r.branchId === ctx.profile.branchId;
    const s2 = st === "pending" ? "cur" : (st === "rejected" || st === "cancelled") ? "bad" : st === "returned" ? "rev" : "done";
    const s3 = st === "replenished" ? "done" : st === "approved" ? "cur" : "";
    root.innerHTML = pageHeader({
      title: `รายละเอียดใบเบิก`,
      crumb: `<a href="${back}">ภาพรวม</a> › <a href="#/requests">ใบเบิก</a> › ${esc(r.docNo)}`,
      actions: `<button class="btn ghost no-print" id="print"><span class="material-symbols-outlined">print</span>พิมพ์ / PDF</button>
        ${mine && ["returned", "pending", "approved"].includes(st) ? `<a class="btn sky" href="#/new/${r.id}"><span class="material-symbols-outlined">edit</span>แก้ไขและส่งใหม่</a>
        <button class="btn ghost" id="cancel-doc" style="color:var(--bad)"><span class="material-symbols-outlined">block</span>ยกเลิกเอกสาร</button>` : ""}
        ${ctx.role === "accounting" && st === "approved" ? `<button class="btn ok" id="repl"><span class="material-symbols-outlined">payments</span>โอนชดเชยสาขานี้</button>` : ""}`,
    }) + `
    <div class="grid g-main">
      <div class="stack">
        <div class="card">
          <div class="row between wrap" style="margin-bottom:1rem">
            <div class="row wrap"><span class="docbadge">${esc(r.docNo)}</span>${statusChip(st)}</div>
            <div class="right"><div class="small muted">ยอดรวมสุทธิ</div><div class="num" style="font-size:30px;font-weight:700;line-height:36px">${baht(r.total)}</div></div>
          </div>
          <div class="grid g3 keep" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));font-size:13px">
            <div><div class="small muted">สาขา</div><b>${esc(r.branchName)}</b> <span class="tag">${esc(r.branchId)}</span></div>
            <div><div class="small muted">ผู้ขอเบิก</div><b>${esc(r.requesterName)}</b></div>
            <div><div class="small muted">วันที่ขอเบิก</div><b>${thDate(r.date)}</b></div>
          </div>
          ${r.note ? `<div style="margin-top:1rem" class="small"><span class="muted">หมายเหตุ:</span> ${esc(r.note)}</div>` : ""}
        </div>

        <div class="card flat">
          <div class="card-h" style="padding:1.25rem 1.5rem 0"><h3>รายการค่าใช้จ่าย (${r.items.length})</h3></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>วันที่</th><th>Supplier / ผู้รับเงิน</th><th>รูปแบบเอกสาร</th><th>หมวดหมู่</th><th>ผู้ขอเบิก</th><th class="r">จำนวนเงิน</th><th class="c">หลักฐาน</th></tr></thead><tbody>
          ${r.items.map((it, i) => `<tr><td>${i + 1}</td><td>${thDate(it.date || r.date)}</td>
            <td><b>${esc(it.supplier || it.desc || "-")}</b>${it.note ? `<div class="tiny muted">${esc(it.note)}</div>` : ""}${it.wht ? `<div><span class="tag">WHT ${it.wht.rate}% · ก่อนหัก ${money(it.wht.before)} · หัก ${money(it.wht.amount)}</span></div>` : ""}</td>
            <td class="small">${esc(it.docType || "-")}</td><td><span class="cat-chip">${esc(it.category)}</span></td><td>${esc(it.requester || r.requesterName || "")}</td>
            <td class="r num"><b>${money(it.amount)}</b></td>
            <td class="c">${!it.hasReceipt ? `<span class="chip st-pending">ไม่มีรูป</span>` : receipts[i] ? `<img class="thumb" src="${receipts[i]}" data-zoom="${i}" alt="ใบเสร็จ">` : `<span class="small muted">กำลังโหลด…</span>`}</td></tr>`).join("")}
          </tbody><tfoot><tr><td colspan="6" class="r muted">รวมทั้งสิ้น</td><td class="r num"><b style="font-size:16px">${money(r.total)}</b></td><td></td></tr></tfoot></table></div>
        </div>

        ${r.requesterSig || r.approverSig ? `<div class="card"><h3 style="margin-bottom:1rem">ลายเซ็น</h3><div class="row wrap" style="gap:2rem;align-items:flex-end">
          ${r.requesterSig ? `<div class="c"><img src="${r.requesterSig}" alt="ลายเซ็นผู้ขอ" style="max-height:70px;max-width:220px"><div class="small muted" style="border-top:1px solid #94a3b8;padding-top:.25rem">ผู้ขอเบิก: ${esc(r.requesterName)}</div></div>` : ""}
          ${r.approverSig ? `<div class="c"><img src="${r.approverSig}" alt="ลายเซ็นผู้อนุมัติ" style="max-height:70px;max-width:220px"><div class="small muted" style="border-top:1px solid #94a3b8;padding-top:.25rem">ผู้อนุมัติ: ${esc(r.approverName || r.decidedByName || "")}</div></div>` : ""}
        </div></div>` : ""}

        ${r.items.some((i) => i.hasReceipt) ? `<div class="card"><h3 style="margin-bottom:1rem">เอกสารแนบ</h3><div class="rcpt-grid">
          ${r.items.map((it, i) => it.hasReceipt && receipts[i] ? `<div class="rcpt" data-zoom="${i}"><img src="${receipts[i]}" alt=""><div><b>${esc(it.supplier || it.desc || "")}</b><br><span class="muted">${baht(it.amount)}</span></div></div>` : "").join("")}
        </div></div>` : ""}
      </div>

      <div class="stack">
        <div class="card">
          <h3 style="margin-bottom:1rem">ขั้นตอนอนุมัติ</h3>
          <div class="stepper">
            <div class="step done"><div class="dot"><span class="material-symbols-outlined">check</span></div>สาขาส่งคำขอ</div>
            <div class="step ${s2}"><div class="dot"><span class="material-symbols-outlined">${s2 === "bad" ? "close" : s2 === "rev" ? "undo" : s2 === "done" ? "check" : "hourglass_top"}</span></div>ตรวจสอบ/อนุมัติ</div>
            <div class="step ${s3}"><div class="dot"><span class="material-symbols-outlined">${s3 === "done" ? "check" : "payments"}</span></div>โอนชดเชย</div>
          </div>
        </div>

        ${canDecide() ? `<div class="card no-print">
          <h3 style="margin-bottom:.25rem">การพิจารณา</h3><p class="small muted" style="margin:0 0 1rem">ตรวจสอบรายการและรูปใบเสร็จก่อนตัดสินใจ</p>
          <div class="field"><label for="cmt">ความเห็น (จำเป็นเมื่อปฏิเสธ/ส่งกลับ)</label><textarea class="inp" id="cmt" placeholder="ระบุเหตุผล…"></textarea></div>
          <div class="decide" style="margin-top:1rem">
            <button class="btn ok block" id="ap" style="min-height:48px"><span class="material-symbols-outlined">verified</span>อนุมัติเอกสาร</button>
            <button class="btn warn block" id="rt"><span class="material-symbols-outlined">undo</span>ส่งกลับแก้ไข</button>
            <button class="btn ghost block" id="rj" style="color:var(--bad)"><span class="material-symbols-outlined">cancel</span>ปฏิเสธคำขอ</button>
          </div></div>` : ""}

        ${r.comment && st !== "pending" ? `<div class="notice ${st === "approved" || st === "replenished" ? "info" : (st === "rejected" || st === "cancelled") ? "bad" : "warn"}"><span class="material-symbols-outlined">chat</span><div><b>${st === "cancelled" ? "เหตุผลที่ยกเลิก" : `ความเห็นผู้พิจารณา (${esc(r.decidedByName || "")})`}</b><br>${esc(r.comment)}</div></div>` : ""}

        <div class="card">
          <h3 style="margin-bottom:1rem">ประวัติการดำเนินการ (Audit Trail)</h3>
          <div class="timeline">
            ${[...(r.history || [])].reverse().map((h) => `<div class="tl"><div class="pt"></div><div><b>${ACTION_LABEL[h.action] || h.action}</b> <span class="muted">โดย ${esc(h.by)}</span><div class="small muted">${thDateTime(h.at)}</div>${h.comment ? `<div class="small">${esc(h.comment)}</div>` : ""}</div></div>`).join("") || '<div class="muted small">ไม่มีประวัติ</div>'}
          </div>
        </div>
      </div>
    </div>`;
    wire();
  };

  const wire = () => {
    $("#print").onclick = () => window.print();
    $$("[data-zoom]").forEach((el) => (el.onclick = () => zoom(receipts[+el.dataset.zoom])));
    const cd = $("#cancel-doc");
    if (cd) cd.onclick = () => {
      const m = openModal(`<div class="modal-body"><h3 class="modal-title">ยกเลิกเอกสาร ${esc(req.docNo)}</h3>
        <p class="muted small">เลขที่เอกสารจะยังคงอยู่ในระบบ (ไม่ถูกนำกลับมาใช้) และ${req.status === "returned" ? "" : "ยอดที่หักไว้จะถูกคืนเข้ายอดคงเหลือ"}</p>
        <div class="field"><label for="cx-r">เหตุผลที่ยกเลิก *</label><textarea class="inp" id="cx-r" placeholder="เช่น บันทึกซ้ำ / ไม่ได้ใช้จ่ายจริง"></textarea></div>
        <div class="row" style="justify-content:flex-end;gap:.5rem;margin-top:1rem"><button class="btn ghost" data-close>ไม่ยกเลิก</button><button class="btn warn" id="cx-go">ยืนยันยกเลิกเอกสาร</button></div></div>`);
      m.el.querySelector("#cx-go").onclick = async () => {
        const reason = m.el.querySelector("#cx-r").value.trim();
        if (!reason) { m.el.querySelector("#cx-r").classList.add("err"); return toast("กรุณาระบุเหตุผลที่ยกเลิก", "warn"); }
        try { await busy(() => cancelRequest(req.id, reason, ctx.profile)); m.close(); toast(`ยกเลิก ${esc(req.docNo)} แล้ว`, "info"); }
        catch (e) { console.error(e); toast(friendlyError(e), "err", 7000); }
      };
    };
    const rp = $("#repl");
    if (rp) rp.onclick = () => { const b = ctx.summary && ctx.summary[req.branchId]; if (b) openReplenishModal(ctx, b); else toast("ยังไม่พบข้อมูลสาขาใน Summary", "warn"); };
    const act = (action, label, danger) => async () => {
      const comment = $("#cmt").value.trim();
      if (action !== "approved" && !comment) { $("#cmt").classList.add("err"); $("#cmt").focus(); return toast("กรุณาระบุเหตุผล", "warn"); }
      if (action === "approved" && !(await ensureSignature(ctx))) return toast("ต้องมีลายเซ็นก่อนอนุมัติ", "warn");
      if (!(await confirmDialog(`${label} ${req.docNo} ยอด ${baht(req.total)}?`, { okText: label, danger }))) return;
      try {
        await busy(() => decideRequest(req.id, action, comment, ctx.profile));
        toast(`${label} ${esc(req.docNo)} เรียบร้อย`, action === "approved" ? "ok" : "info");
      } catch (e) { console.error(e); toast(friendlyError(e), "err", 7000); }
    };
    if ($("#ap")) { $("#ap").onclick = act("approved", "อนุมัติ"); $("#rt").onclick = act("returned", "ส่งกลับแก้ไข"); $("#rj").onclick = act("rejected", "ปฏิเสธ", true); }
  };

  const unsub = subRequest(id, async (r) => {
    req = r; first = false;
    if (r) {
      const key = r.items.map((i) => i.hasReceipt ? 1 : 0).join("") + r.items.length;
      draw();
      if (key !== rcKey) { rcKey = key; receipts = {}; try { receipts = await loadReceipts(r); } catch (e) { console.error(e); } if (req) draw(); }
    } else draw();
  }, (e) => { root.innerHTML = `<div class="notice bad"><span class="material-symbols-outlined">lock</span><div>${esc(friendlyError(e))}</div></div>`; });
  draw();
  return unsub;
}
