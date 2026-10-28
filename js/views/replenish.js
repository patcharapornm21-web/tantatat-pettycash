import { esc, baht, round2, branchLabel, todayISO, $ } from "../utils.js";
import { openModal, toast, busy, friendlyError } from "../ui.js";
import { replenish, getApprovedUnpaid } from "../data.js";

/** Modal โอนเงินชดเชย: เติมวงเงินกลับให้เท่าวงเงินตั้งต้น (หรือจำนวนที่กำหนดเอง) */
export async function openReplenishModal(ctx, b) {
  const used = Math.max(0, (Number(b.float) || 0) - (Number(b.balance) || 0));
  let unpaid = [];
  try { unpaid = await getApprovedUnpaid(b.id); } catch (e) { toast(friendlyError(e), "err"); return; }
  const approvedSum = round2(unpaid.reduce((s, r) => s + r.total, 0));
  const m = openModal(`
    <div class="modal-body">
      <div class="row between"><h3 class="modal-title">โอนเงินชดเชย — ${esc(branchLabel(b))}</h3>
        <button class="icon-btn" data-close aria-label="ปิด"><span class="material-symbols-outlined">close</span></button></div>
      <div class="grid g2 keep" style="grid-template-columns:1fr 1fr;gap:.75rem">
        <div class="card kpi" style="padding:1rem;box-shadow:none;background:#f1f5f9"><div class="lbl">คงเหลือปัจจุบัน</div><div class="val num ${b.balance < 0 ? "neg" : ""}" style="font-size:20px">${baht(b.balance)}</div></div>
        <div class="card kpi" style="padding:1rem;box-shadow:none;background:#f1f5f9"><div class="lbl">วงเงินตั้งต้น</div><div class="val num" style="font-size:20px">${baht(b.float)}</div></div>
      </div>
      <div class="notice info"><span class="material-symbols-outlined">info</span><div>ใบเบิกที่อนุมัติแล้วรอชดเชย <b>${unpaid.length}</b> ใบ รวม <b>${baht(approvedSum)}</b> (ยอดรวมที่ควรโอน) — จะถูกปิดเป็น “โอนชดเชยแล้ว”<br>
        <span class="small">ยอดใช้ไป (วงเงิน − คงเหลือ) = ${baht(used)} (รวมใบที่ยังรออนุมัติ)</span></div></div>
      <div class="field"><label for="r-amt">จำนวนเงินที่โอน (บาท) * <span class="small muted">— แนะนำ = ยอดอนุมัติรวม</span></label><input class="inp num" id="r-amt" type="number" min="0.01" step="0.01" value="${(approvedSum > 0 ? approvedSum : used).toFixed(2)}"></div>
      <div class="field"><label for="r-date">วันที่โอนเงินให้สาขา *</label><input class="inp" id="r-date" type="date" value="${todayISO()}" max="${todayISO()}"></div>
      <div class="field"><label for="r-note">อ้างอิง / หมายเหตุ (เช่น เลขที่รายการโอน)</label><input class="inp" id="r-note" maxlength="120"></div>
      <div class="small muted" id="r-after"></div>
    </div>
    <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn ok" id="r-go"><span class="material-symbols-outlined">payments</span>ยืนยันโอนชดเชย</button></div>`);
  const q = (s) => m.el.querySelector(s);
  const after = () => { q("#r-after").textContent = `คงเหลือหลังชดเชย: ${baht((Number(b.balance) || 0) + (+q("#r-amt").value || 0))}`; };
  q("#r-amt").oninput = after; after();
  q("#r-go").onclick = async () => {
    const amt = +q("#r-amt").value;
    if (!(amt > 0)) return toast("กรอกจำนวนเงินให้ถูกต้อง", "warn");
    if (!q("#r-date").value) { q("#r-date").classList.add("err"); return toast("กรุณาระบุวันที่โอนเงิน", "warn"); }
    try {
      const r = await busy(() => replenish(b.id, amt, q("#r-note").value.trim(), ctx.profile, q("#r-date").value), "กำลังบันทึกการโอน…");
      toast(`โอนชดเชย ${esc(b.name)} ${baht(amt)} เรียบร้อย (ปิด ${r.count} ใบเบิก)`, "ok", 6000);
      m.close();
    } catch (e) { console.error(e); toast(friendlyError(e), "err", 7000); }
  };
}
