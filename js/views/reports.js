import { esc, baht, money, round2, thDate, thMonth, lastMonths, curMonth, statusChip, STATUS, toCSV, downloadFile, $, $$ } from "../utils.js";
import { pageHeader, toast, busy, friendlyError, confirmDialog, openModal } from "../ui.js";
import { fetchReportRequests, purgeRequests } from "../data.js";
import { APP_SETTINGS } from "../firebase-config.js";

const COLORS = ["#0ea5e9", "#0d9488", "#6366f1", "#f59e0b", "#e11d48", "#7c3aed", "#22c55e", "#64748b"];

export default async function view(root, ctx) {
  const role = ctx.role;
  const months = lastMonths(24);
  const st = { from: months[2], to: months[0], branchId: "", category: "", status: "ok", data: null, exported: new Set() };
  const branches = () => role === "accounting" ? Object.values(ctx.summary || {}).filter((b) => b && b.id).sort((a, b) => (a.id > b.id ? 1 : -1))
    : role === "approver" ? (ctx.regionBranches || []).slice().sort((a, b) => (a.id > b.id ? 1 : -1)) : [];
  const monOpts = (sel) => months.map((m) => `<option value="${m}" ${m === sel ? "selected" : ""}>${thMonth(m)}</option>`).join("");

  root.innerHTML = pageHeader({
    title: "รายงานเงินสดย่อย", crumb: "รายงาน › สรุปและส่งออก", live: false,
    actions: `<button class="btn ghost" id="exp" disabled><span class="material-symbols-outlined">download</span>Export Excel (CSV)</button>
      ${role === "accounting" ? `<button class="btn danger" id="purge" disabled><span class="material-symbols-outlined">delete_sweep</span>ล้างข้อมูลที่ Export แล้ว</button>` : ""}`,
  }) + `
  <div class="card" style="margin-bottom:1.25rem"><div class="filters">
    <div class="field"><label>ตั้งแต่เดือน</label><select class="inp" id="f-from">${monOpts(st.from)}</select></div>
    <div class="field"><label>ถึงเดือน</label><select class="inp" id="f-to">${monOpts(st.to)}</select></div>
    ${role !== "branch" ? `<div class="field"><label>สาขา</label><select class="inp" id="f-br"><option value="">ทุกสาขา${role === "approver" ? "ในเขต" : ""}</option>${branches().map((b) => `<option value="${esc(b.id)}">${esc(b.id)} ${esc(b.name)}</option>`).join("")}</select></div>` : ""}
    <div class="field"><label>หมวดหมู่</label><select class="inp" id="f-cat"><option value="">ทุกหมวด</option>${APP_SETTINGS.categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select></div>
    <div class="field"><label>สถานะ</label><select class="inp" id="f-st"><option value="ok">อนุมัติแล้ว + ชดเชยแล้ว</option><option value="all">ทุกสถานะ</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></div>
    <button class="btn sky" id="run"><span class="material-symbols-outlined">search</span>สร้างรายงาน</button>
  </div>
  <div class="small muted" style="margin-top:.75rem">💡 รายงานอ่านข้อมูลตามจำนวนใบเบิกที่ตรงเงื่อนไขเท่านั้น (ไม่ดึงรูปภาพ) — เลือกสาขาเพื่อประหยัดโควต้า</div></div>
  <div id="rep"><div class="card"><div class="empty"><span class="material-symbols-outlined">analytics</span>เลือกเงื่อนไข แล้วกด “สร้างรายงาน”</div></div></div>`;

  const filtered = () => {
    let L = st.data || [];
    L = L.filter((r) => st.status === "all" ? true : st.status === "ok" ? ["approved", "replenished"].includes(r.status) : r.status === st.status);
    if (st.branchId && role !== "branch") L = L.filter((r) => r.branchId === st.branchId);
    return L;
  };
  // แตกเป็นระดับรายการย่อย + กรองหมวดหมู่
  const lines = () => filtered().flatMap((r) => r.items.map((it, i) => ({ r, it, i }))).filter((x) => !st.category || x.it.category === st.category);

  const paint = () => {
    const L = lines(); const docs = new Set(L.map((x) => x.r.id));
    const total = round2(L.reduce((s, x) => s + x.it.amount, 0));
    const byMonth = {}, byCat = {}, byBr = {};
    L.forEach(({ r, it }) => {
      byMonth[r.month] = round2((byMonth[r.month] || 0) + it.amount);
      byCat[it.category] = round2((byCat[it.category] || 0) + it.amount);
      const b = (byBr[r.branchId] ||= { id: r.branchId, name: r.branchName, amt: 0, docs: new Set() });
      b.amt = round2(b.amt + it.amount); b.docs.add(r.id);
    });
    const mKeys = Object.keys(byMonth).sort(); const mMax = Math.max(1, ...Object.values(byMonth));
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    let acc = 0; const grad = cats.map(([, v], i) => { const s = (acc / total) * 100; acc += v; return `${COLORS[i % 8]} ${s}% ${(acc / total) * 100}%`; }).join(",");
    const brs = Object.values(byBr).sort((a, b) => b.amt - a.amt);
    $("#exp").disabled = !L.length;
    updatePurge();
    $("#rep").innerHTML = !L.length ? `<div class="card"><div class="empty"><span class="material-symbols-outlined">search_off</span>ไม่พบข้อมูลตามเงื่อนไข</div></div>` : `
    <div class="grid g4 keep2" style="margin-bottom:1.25rem">
      <div class="card kpi"><div class="lbl"><span class="material-symbols-outlined">payments</span>ยอดเบิกรวม</div><div class="val num">${baht(total)}</div></div>
      <div class="card kpi"><div class="lbl"><span class="material-symbols-outlined">receipt_long</span>จำนวนใบเบิก</div><div class="val num">${docs.size}</div><div class="sub">${L.length} รายการย่อย</div></div>
      <div class="card kpi"><div class="lbl"><span class="material-symbols-outlined">calculate</span>เฉลี่ย/ใบเบิก</div><div class="val num">${baht(total / docs.size)}</div></div>
      <div class="card kpi"><div class="lbl"><span class="material-symbols-outlined">store</span>จำนวนสาขา</div><div class="val num">${brs.length}</div></div>
    </div>
    <div class="grid g2" style="margin-bottom:1.25rem;grid-template-columns:3fr 2fr">
      <div class="card"><div class="card-h"><h3>แนวโน้มรายเดือน</h3></div><div class="bars">${mKeys.map((k) => `<div class="b"><em>${money(byMonth[k]).replace(/\.00$/, "")}</em><i style="height:${(byMonth[k] / mMax) * 100}%"></i><span>${thMonth(k).split(" ")[0].slice(0, 6)}</span></div>`).join("")}</div></div>
      <div class="card"><div class="card-h"><h3>สัดส่วนตามหมวดหมู่</h3></div><div class="row" style="align-items:center"><div class="donut" style="background:conic-gradient(${grad})"></div>
        <div class="legend">${cats.map(([c, v], i) => `<div><i style="background:${COLORS[i % 8]}"></i><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c)}</span><b>${((v / total) * 100).toFixed(0)}%</b></div>`).join("")}</div></div></div>
    </div>
    <div class="card flat" style="margin-bottom:1.25rem"><div class="card-h" style="padding:1.25rem 1.5rem 0"><h3>สรุปรายสาขา</h3></div><div class="tbl-wrap" style="max-height:420px;overflow:auto"><table class="tbl"><thead><tr><th>รหัส</th><th>สาขา</th><th class="c">ใบเบิก</th><th class="r">ยอดรวม</th><th class="r">สัดส่วน</th></tr></thead><tbody>
      ${brs.map((b) => `<tr><td><b>${esc(b.id)}</b></td><td>${esc(b.name)}</td><td class="c">${b.docs.size}</td><td class="r num"><b>${money(b.amt)}</b></td><td class="r num">${((b.amt / total) * 100).toFixed(1)}%</td></tr>`).join("")}</tbody></table></div></div>
    <div class="card flat"><div class="card-h" style="padding:1.25rem 1.5rem 0"><h3>รายละเอียดรายการ</h3><span class="small muted">แสดง ${Math.min(200, L.length)} จาก ${L.length} (ไฟล์ CSV มีครบทั้งหมด)</span></div><div class="tbl-wrap" style="max-height:480px;overflow:auto"><table class="tbl"><thead><tr><th>เลขที่เอกสาร</th><th>วันที่</th><th>สาขา</th><th>รายการ</th><th>หมวดหมู่</th><th class="r">ยอด</th><th>สถานะ</th></tr></thead><tbody>
      ${L.slice(0, 200).map(({ r, it }) => `<tr class="click" data-id="${r.id}"><td>${esc(r.docNo)}</td><td>${thDate(r.date)}</td><td>${esc(r.branchName)}</td><td>${esc(it.desc)}</td><td><span class="cat-chip">${esc(it.category)}</span></td><td class="r num">${money(it.amount)}</td><td>${statusChip(r.status)}</td></tr>`).join("")}</tbody></table></div></div>`;
    $$("[data-id]", root).forEach((el) => (el.onclick = () => ctx.nav(`#/request/${el.dataset.id}`)));
  };

  const updatePurge = () => {
    const p = $("#purge"); if (!p) return;
    p.disabled = !purgeable().length;
  };
  // ล้างได้เฉพาะใบที่ Export แล้ว + ปิดงานแล้ว (โอนชดเชยแล้ว/ปฏิเสธ) + ไม่ได้กรองหมวดหมู่
  const purgeable = () => st.category ? [] : filtered().filter((r) => st.exported.has(r.id) && ["replenished", "rejected"].includes(r.status));

  const csvRows = () => {
    const head = ["เลขที่เอกสาร", "วันที่", "เดือน", "รหัสสาขา", "ชื่อสาขา", "เขต", "ผู้ขอเบิก", "ลำดับ", "รายการ", "หมวดหมู่", "จำนวน", "ราคา/หน่วย", "ยอดรายการ", "ยอดรวมใบเบิก", "สถานะ", "ผู้พิจารณา", "ความเห็น", "มีใบเสร็จ"];
    const body = lines().map(({ r, it, i }) => [r.docNo, r.date, r.month, r.branchId, r.branchName, r.region, r.requesterName, i + 1, it.desc, it.category, it.qty, (it.unitPrice ?? it.amount).toFixed(2), it.amount.toFixed(2), r.total.toFixed(2), STATUS[r.status]?.label || r.status, r.decidedByName || "", r.comment || "", it.hasReceipt ? "มี" : "ไม่มี"]);
    return [head, ...body];
  };

  $("#run").onclick = async () => {
    st.from = $("#f-from").value; st.to = $("#f-to").value;
    if (st.from > st.to) { [st.from, st.to] = [st.to, st.from]; }
    st.branchId = $("#f-br") ? $("#f-br").value : ""; st.category = $("#f-cat").value; st.status = $("#f-st").value;
    try {
      st.data = await busy(() => fetchReportRequests({ role, region: ctx.profile.region, branchId: role === "branch" ? ctx.profile.branchId : st.branchId, fromMonth: st.from, toMonth: st.to }), "กำลังสร้างรายงาน…");
      st.exported = new Set(); paint();
      toast(`โหลด ${st.data.length} ใบเบิก`, "info");
    } catch (e) { console.error(e); toast(friendlyError(e), "err", 8000); }
  };
  ["f-cat", "f-st"].forEach((id) => ($("#" + id).onchange = () => { if (!st.data) return; st.category = $("#f-cat").value; st.status = $("#f-st").value; paint(); }));

  $("#exp").onclick = () => {
    const name = `petty-cash_${st.from}_${st.to}${st.branchId ? "_" + st.branchId : ""}.csv`;
    downloadFile(name, toCSV(csvRows()));
    filtered().forEach((r) => st.exported.add(r.id));
    updatePurge();
    toast(`ส่งออก ${name} แล้ว — เปิดด้วย Excel ได้ทันที${role === "accounting" ? " (ปุ่ม “ล้างข้อมูลที่ Export แล้ว” พร้อมใช้งาน)" : ""}`, "ok", 6000);
  };

  if ($("#purge")) $("#purge").onclick = async () => {
    const T = purgeable(); if (!T.length) return;
    const imgs = T.reduce((s, r) => s + r.items.filter((i) => i.hasReceipt).length, 0);
    const m = openModal(`<div class="modal-body"><h3 class="modal-title" style="color:var(--bad)">ล้างข้อมูลที่ Export แล้ว</h3>
      <div class="notice bad"><span class="material-symbols-outlined">warning</span><div>จะ <b>ลบถาวร</b> ใบเบิก ${T.length} ใบ และรูปใบเสร็จ ${imgs} รูป ออกจากฐานข้อมูล (เฉพาะสถานะ “โอนชดเชยแล้ว/ปฏิเสธ”) — กู้คืนไม่ได้ ตรวจสอบว่าไฟล์ CSV ที่ดาวน์โหลดเปิดได้ครบถ้วนก่อน</div></div>
      <p class="small muted" style="margin:0">ตัวเลขยอดคงเหลือสาขาไม่ได้รับผลกระทบ (เก็บใน Summary แยกต่างหาก)</p>
      <div class="field"><label for="pt">พิมพ์คำว่า <b>ลบ</b> เพื่อยืนยัน</label><input class="inp" id="pt" autocomplete="off"></div></div>
      <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn danger" id="pg" disabled>ลบถาวร</button></div>`);
    const q = (s) => m.el.querySelector(s);
    q("#pt").oninput = () => (q("#pg").disabled = q("#pt").value.trim() !== "ลบ");
    q("#pg").onclick = async () => {
      try {
        const n = await busy(() => purgeRequests(T), "กำลังลบข้อมูล…");
        const gone = new Set(T.map((r) => r.id)); st.data = st.data.filter((r) => !gone.has(r.id)); T.forEach((r) => st.exported.delete(r.id));
        toast(`ลบเรียบร้อย (${n} เอกสาร) — ประหยัดพื้นที่ฐานข้อมูลแล้ว`, "ok", 6000); m.close(); paint();
      } catch (e) { console.error(e); toast(friendlyError(e), "err", 8000); }
    };
  };
}
