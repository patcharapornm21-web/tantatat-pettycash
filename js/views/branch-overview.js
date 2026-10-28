import { bus } from "../app.js";
import { esc, baht, money, thDate, thMonth, lastMonths, curMonth, statusChip, $, $$ } from "../utils.js";
import { subBranchMonth } from "../data.js";
import { pageHeader } from "../ui.js";
import { APP_SETTINGS } from "../firebase-config.js";

export default async function view(root, ctx) {
  let month = curMonth();
  let extra = null, unsubExtra = null;
  const offs = [];

  const draw = () => {
    const b = ctx.branch;
    if (!b) { root.innerHTML = pageHeader({ title: "ภาพรวมสาขา" }) + `<div class="notice warn"><span class="material-symbols-outlined">hourglass_top</span><div>กำลังโหลดข้อมูลสาขา… ถ้าไม่ขึ้น แปลว่าฝ่ายบัญชียังไม่ได้ Seed สาขา ${esc(ctx.profile.branchId)}</div></div>`; return; }
    if (b.open !== true) { root.innerHTML = pageHeader({ title: "ภาพรวมสาขา", live: false }) + `<div class="notice warn"><span class="material-symbols-outlined">lock</span><div><b>สาขา ${esc(b.name)} ยังไม่เปิดใช้งาน</b><br>กรุณาติดต่อฝ่ายบัญชีส่วนกลางเพื่อเปิดสาขาก่อนเริ่มใช้งาน</div></div>`; return; }
    const fl = Number(b.float) || 0, bal = Number(b.balance) || 0;
    const used = fl - bal;
    const pct = fl > 0 ? Math.max(0, Math.min(100, (bal / fl) * 100)) : 0;
    const low = pct < APP_SETTINGS.lowBalancePct, crit = pct < APP_SETTINGS.lowBalancePct / 2;
    const reqs = (month === curMonth() ? ctx.branchReqs.filter((r) => r.month === month || r.status === "pending" || r.status === "returned") : (extra || []))
      .slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.updatedAt || 0) - (a.updatedAt || 0));
    const returned = ctx.branchReqs.filter((r) => r.status === "returned");

    root.innerHTML = pageHeader({
      title: "ภาพรวมสาขา",
      crumb: `<span class="material-symbols-outlined" style="font-size:14px">location_on</span> ${esc(String(b.name).startsWith(b.id) ? b.name : b.id + "-" + b.name)}`,
      actions: `<a class="btn sky" href="#/new"><span class="material-symbols-outlined">add</span>ขอเบิกเงินสดย่อย</a>`,
    }) + `
    ${returned.length ? `<div class="notice warn" style="margin-bottom:1.25rem"><span class="material-symbols-outlined">undo</span>
      <div><b>มี ${returned.length} ใบเบิกถูกส่งกลับให้แก้ไข</b> — ${returned.map((r) => `<a href="#/request/${r.id}">${esc(r.docNo)}</a>`).join(", ")}</div></div>` : ""}
    <div class="grid g-main" style="margin-bottom:1.25rem">
      <div class="card kpi bal">
        <div class="lbl"><span class="material-symbols-outlined">account_balance_wallet</span>วงเงินสดย่อยคงเหลือในลิ้นชัก
          <span class="chip ${crit ? "st-rejected" : low ? "st-pending" : "st-approved"}" style="margin-left:auto">${crit ? "ควรเติมด่วน" : low ? "เหลือน้อย" : "ปกติพร้อมเบิก"}</span></div>
        <div class="val ${bal < 0 ? "neg" : ""}">${baht(bal)}</div>
        <div class="progress ${crit ? "crit" : low ? "low" : ""}" style="margin:.5rem 0"><div style="width:${pct}%"></div></div>
        <div class="row between small muted"><span>${pct.toFixed(0)}% ของวงเงินตั้งต้น ${baht(fl)}</span><span>ใช้ไปแล้ว ${baht(used)}</span></div>
      </div>
      <div class="grid g2 keep" style="grid-template-columns:1fr 1fr">
        <div class="card kpi"><div class="lbl"><span class="material-symbols-outlined">schedule</span>รออนุมัติ (หักจากยอดแล้ว)</div><div class="val">${baht(b.pendingAmt || 0)}</div><div class="sub">${b.pendingCnt || 0} ใบเบิก</div></div>
        <div class="card kpi"><div class="lbl"><span class="material-symbols-outlined">savings</span>ควรได้รับชดเชย</div><div class="val">${baht(Math.max(0, used))}</div><div class="sub">วงเงิน − คงเหลือ</div></div>
      </div>
    </div>

    <div class="card flat">
      <div class="card-h" style="padding:1.25rem 1.5rem 0">
        <h3>ใบเบิกของสาขา</h3>
        <div class="row"><select class="inp" id="mon" style="width:auto">${lastMonths(12).map((m) => `<option value="${m}" ${m === month ? "selected" : ""}>${thMonth(m)}</option>`).join("")}</select></div>
      </div>
      ${reqs.length ? `
      <div class="tbl-wrap mob-hide"><table class="tbl"><thead><tr><th>เลขที่เอกสาร</th><th>วันที่</th><th>ผู้ขอเบิก</th><th class="c">รายการ</th><th class="r">ยอดรวม</th><th>สถานะ</th></tr></thead><tbody>
        ${reqs.map((r) => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.docNo)}</b></td><td>${thDate(r.date)}</td><td>${esc(r.requesterName)}</td><td class="c">${r.items?.length || 0}</td><td class="r num"><b>${money(r.total)}</b></td><td>${statusChip(r.status)}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="reqcards" style="padding:1rem">${reqs.map((r) => `<div class="reqcard" data-id="${r.id}"><div class="row between"><b>${esc(r.docNo)}</b>${statusChip(r.status)}</div>
        <div class="row between small muted"><span>${thDate(r.date)} · ${r.items?.length || 0} รายการ</span><b class="num" style="color:var(--ink);font-size:15px">${baht(r.total)}</b></div></div>`).join("")}</div>`
      : `<div class="empty"><span class="material-symbols-outlined">receipt_long</span>ยังไม่มีใบเบิกในเดือนนี้<br><a class="btn sky sm" style="margin-top:1rem" href="#/new">+ ขอเบิกเงินสดย่อย</a></div>`}
    </div>`;
    root.querySelectorAll("[data-id]").forEach((el) => el.addEventListener("click", () => ctx.nav(`#/request/${el.dataset.id}`)));
    const mon = $("#mon");
    mon.onchange = () => {
      month = mon.value; if (unsubExtra) { unsubExtra(); unsubExtra = null; }
      if (month !== curMonth()) unsubExtra = subBranchMonth(ctx.profile.branchId, month, (l) => { extra = l; draw(); }, () => {});
      else draw();
    };
  };

  offs.push(bus.on("branch", draw), bus.on("branchReqs", draw));
  draw();
  return () => { offs.forEach((f) => f()); if (unsubExtra) unsubExtra(); };
}
