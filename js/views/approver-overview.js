import { esc, baht, money, thDate, branchLabel, isOpen, $, $$, statusChip } from "../utils.js";
import { pageHeader } from "../ui.js";
import { bus } from "../app.js";
import { APP_SETTINGS } from "../firebase-config.js";

export default async function view(root, ctx) {
  const p = ctx.profile;
  const draw = () => {
    const P = ctx.pending; const B = (ctx.regionBranches || []).filter(isOpen).sort((a, b) => (a.id > b.id ? 1 : -1));
    const sum = P.reduce((s, r) => s + r.total, 0);
    root.innerHTML = pageHeader({ title: "คิวรออนุมัติ", crumb: "ผู้อนุมัติ (ROM) › สาขาที่ดูแล" }) + `
    <div class="grid g3 keep2" style="margin-bottom:1.25rem">
      <div class="card kpi"><div class="lbl"><span class="material-symbols-outlined">inbox</span>ใบเบิกรออนุมัติ</div><div class="val num">${P.length}</div><div class="sub">ในสาขาที่ดูแล</div></div>
      <div class="card kpi"><div class="lbl"><span class="material-symbols-outlined">payments</span>มูลค่ารวม</div><div class="val num">${baht(sum)}</div></div>
      <div class="card kpi"><div class="lbl"><span class="material-symbols-outlined">store</span>สาขาในเขต</div><div class="val num">${B.length}</div></div>
    </div>
    <div class="card flat" style="margin-bottom:1.25rem">
      <div class="card-h" style="padding:1.25rem 1.5rem 0"><h3>ใบเบิกที่ต้องพิจารณา</h3></div>
      ${P.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>เลขที่เอกสาร</th><th>สาขา</th><th>ผู้ขอเบิก</th><th>วันที่</th><th class="c">รายการ</th><th class="r">ยอดรวม</th><th></th></tr></thead><tbody>
      ${P.map((r) => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.docNo)}</b></td><td>${esc(r.branchName)}</td><td>${esc(r.requesterName)}</td><td>${thDate(r.date)}</td><td class="c">${r.items?.length || 0}</td><td class="r num"><b>${money(r.total)}</b></td><td class="r"><span class="btn soft sm">ตรวจสอบ</span></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><span class="material-symbols-outlined">task_alt</span>ไม่มีใบเบิกค้างอนุมัติ 🎉</div>`}
    </div>
    <div class="card flat"><div class="card-h" style="padding:1.25rem 1.5rem 0"><h3>เงินสดย่อยสาขาที่ดูแล</h3></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th colspan="2">สาขา</th><th class="r">วงเงิน</th><th class="r">คงเหลือ</th><th class="r">รออนุมัติ</th></tr></thead><tbody>
      ${B.map((b) => `<tr><td colspan="2"><b>${esc(branchLabel(b))}</b></td><td class="r num">${money(b.float)}</td>
        <td class="r num" style="font-weight:700;${b.balance < (b.float * APP_SETTINGS.lowBalancePct) / 100 ? "color:var(--warn)" : ""}">${money(b.balance)}</td><td class="r num">${b.pendingCnt ? money(b.pendingAmt) : "-"}</td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">ยังไม่มีสาขาที่เปิดใช้งานในความดูแล</div></td></tr>`}
      </tbody></table></div></div>`;
    $$("[data-id]", root).forEach((el) => (el.onclick = () => ctx.nav(`#/request/${el.dataset.id}`)));
  };
  draw();
  const offs = [bus.on("pending", draw), bus.on("regionBranches", draw)];
  return () => offs.forEach((f) => f());
}
