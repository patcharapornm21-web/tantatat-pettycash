import { esc, baht, money, round2, branchLabel, isOpen, shortDate, thDate, thMonth, lastMonths, curMonth, statusChip, STATUS, toCSV, downloadFile, $, $$ } from "../utils.js";
import { pageHeader, toast, busy, friendlyError, confirmDialog, openModal } from "../ui.js";
import { fetchReportRequests, purgeRequests } from "../data.js";
import { APP_SETTINGS } from "../firebase-config.js";

const COLORS = ["#0ea5e9", "#0d9488", "#6366f1", "#f59e0b", "#e11d48", "#7c3aed", "#22c55e", "#64748b"];

export default async function view(root, ctx) {
  const role = ctx.role;
  const months = lastMonths(24);
  const st = { from: months[2], to: months[0], branchId: "", category: "", status: "ok", data: null, exported: new Set() };
  const branches = () => (role === "accounting" ? Object.values(ctx.summary || {}).filter((b) => b && b.id)
    : role === "approver" ? (ctx.regionBranches || []) : []).filter(isOpen).sort((a, b) => (a.id > b.id ? 1 : -1));
  const monOpts = (sel) => months.map((m) => `<option value="${m}" ${m === sel ? "selected" : ""}>${thMonth(m)}</option>`).join("");

  root.innerHTML = pageHeader({
    title: "รายงานเงินสดย่อย", crumb: "รายงาน › สรุปและส่งออก", live: false,
    actions: `<button class="btn ghost" id="prt" disabled><span class="material-symbols-outlined">print</span>พิมพ์ใบสรุป</button>
      <button class="btn ghost" id="exp" disabled><span class="material-symbols-outlined">download</span>Export Excel (CSV)</button>
      ${role === "accounting" ? `<button class="btn danger" id="purge" disabled><span class="material-symbols-outlined">delete_sweep</span>ล้างข้อมูลที่ Export แล้ว</button>` : ""}`,
  }) + `
  <div class="card" style="margin-bottom:1.25rem"><div class="filters">
    <div class="field"><label>ตั้งแต่เดือน</label><select class="inp" id="f-from">${monOpts(st.from)}</select></div>
    <div class="field"><label>ถึงเดือน</label><select class="inp" id="f-to">${monOpts(st.to)}</select></div>
    ${role !== "branch" ? `<div class="field"><label>สาขา</label><select class="inp" id="f-br"><option value="">ทุกสาขา${role === "approver" ? "ในเขต" : ""}</option>${branches().map((b) => `<option value="${esc(b.id)}">${esc(branchLabel(b))}</option>`).join("")}</select></div>` : ""}
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
    $("#exp").disabled = !L.length; $("#prt").disabled = !L.length;
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
    <div class="card flat"><div class="card-h" style="padding:1.25rem 1.5rem 0"><h3>รายละเอียดรายการ</h3><span class="small muted">แสดง ${Math.min(200, L.length)} จาก ${L.length} (ไฟล์ CSV มีครบทั้งหมด)</span></div><div class="tbl-wrap" style="max-height:480px;overflow:auto"><table class="tbl"><thead><tr><th>เลขที่ PC</th><th>วันที่</th><th>สาขา</th><th>Supplier</th><th>หมวดหมู่</th><th class="r">ยอด</th><th>สถานะ</th></tr></thead><tbody>
      ${L.slice(0, 200).map(({ r, it }) => `<tr class="click" data-id="${r.id}"><td>${esc(r.docNo)}</td><td>${thDate(it.date || r.date)}</td><td>${esc(r.branchName)}</td><td>${esc(it.supplier || it.desc || "-")}</td><td><span class="cat-chip">${esc(it.category)}</span></td><td class="r num">${money(it.amount)}</td><td>${statusChip(r.status)}</td></tr>`).join("")}</tbody></table></div></div>`;
    $$("[data-id]", root).forEach((el) => (el.onclick = () => ctx.nav(`#/request/${el.dataset.id}`)));
  };

  const updatePurge = () => {
    const p = $("#purge"); if (!p) return;
    p.disabled = !purgeable().length;
  };
  // ล้างได้เฉพาะใบที่ Export แล้ว + ปิดงานแล้ว (โอนชดเชยแล้ว/ปฏิเสธ) + ไม่ได้กรองหมวดหมู่
  const purgeable = () => st.category ? [] : filtered().filter((r) => st.exported.has(r.id) && ["replenished", "rejected", "cancelled"].includes(r.status));

  const csvRows = () => {
    const head = ["เลขที่ PC", "วันที่ใบเบิก", "วันที่รายการ", "เดือน", "รหัสสาขา", "ชื่อสาขา", "ผู้ยื่นเบิก", "ผู้ขอเบิก", "ลำดับ", "Supplier/ผู้รับเงิน", "รูปแบบเอกสาร", "หมวดหมู่", "หมายเหตุ", "อัตรา WHT %", "ยอดก่อนหักภาษี", "ภาษีหัก ณ ที่จ่าย", "จำนวนเงิน", "ยอดรวมใบเบิก", "สถานะ", "ผู้พิจารณา", "ความเห็น", "มีใบเสร็จ"];
    const body = lines().map(({ r, it, i }) => [r.docNo, r.date, it.date || r.date, r.month, r.branchId, r.branchName, r.requesterName, it.requester || "", i + 1, it.supplier || it.desc || "", it.docType || "", it.category, it.note || "", it.wht?.rate ?? "", it.wht ? it.wht.before.toFixed(2) : "", it.wht ? it.wht.amount.toFixed(2) : "", it.amount.toFixed(2), r.total.toFixed(2), STATUS[r.status]?.label || r.status, r.decidedByName || "", r.comment || "", it.hasReceipt ? "มี" : "ไม่มี"]);
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

  // ---------- พิมพ์ใบสรุปเงินสดย่อย (ต่อ 1 สาขา = 1 หน้า) ----------
  const printReport = () => {
    const L = lines(); const groups = {};
    L.forEach((x) => (groups[x.r.branchId] ||= { name: x.r.branchName, id: x.r.branchId, rows: [] }).rows.push(x));
    const monthLabel = st.from === st.to ? thMonth(st.from) : `${thMonth(st.from)} – ${thMonth(st.to)}`;
    const now = new Date(); const pr = `${shortDate(now.toISOString())} ${String(now.getHours()).padStart(2, "0")}.${String(now.getMinutes()).padStart(2, "0")} น.`;
    const names = (rows, pick) => [...new Set(rows.flatMap(pick).filter(Boolean))].join(", ");
    const pages = Object.values(groups).sort((a, b) => (a.id > b.id ? 1 : -1)).map((g) => {
      const rows = g.rows.slice().sort((a, b) => (a.it.date || a.r.date).localeCompare(b.it.date || b.r.date) || a.r.docNo.localeCompare(b.r.docNo));
      const sum = round2(rows.reduce((s, x) => s + x.it.amount, 0));
      const hist = (role2, acts) => rows.flatMap((x) => (x.r.history || []).filter((h) => h.role === role2 && acts.includes(h.action)).map((h) => h.by));
      const reqNames = names(rows, (x) => [x.it.requester || x.r.requesterName]);
      const romNames = [...new Set(hist("approver", ["approved"]))].join(", ");
      const accNames = [...new Set([...hist("accounting", ["approved", "replenished"])])].join(", ");
      return `<section class="pg"><div class="hd"><div class="t1">บริษัท ทันตะทัตถ์ คลินิก จำกัด (TANTATAT CLINIC COMPANY LIMITED)</div>
        <div class="t2">ใบสรุปเงินสดย่อย · Petty Cash Summary Report</div><div class="t3">ประจำเดือน ${esc(monthLabel)} · สาขา: ${esc(branchLabel({ id: g.id, name: g.name }))}</div></div>
        <div class="meta"><span><b>สาขา:</b> ${esc(branchLabel({ id: g.id, name: g.name }))}</span><span><b>วันที่พิมพ์:</b> ${pr}</span><span><b>ผู้พิมพ์:</b> ${esc(ctx.profile.name)}</span></div>
        <table><thead><tr><th>ลำดับ</th><th>วันที่</th><th>ผู้ขอเบิก</th><th>Supplier / รายการ</th><th>รูปแบบเอกสาร</th><th>หมวดหมู่</th><th class="r">จำนวนเงิน (฿)</th><th>เลขที่ PC</th><th>หมายเหตุ</th></tr></thead><tbody>
        ${rows.map((x, i) => `<tr><td class="c">${i + 1}</td><td class="c">${shortDate(x.it.date || x.r.date)}</td><td>${esc(x.it.requester || x.r.requesterName)}</td><td>${esc(x.it.supplier || x.it.desc || "-")}</td><td>${esc(x.it.docType || "-")}</td><td>${esc(x.it.category)}</td><td class="r"><b>${money(x.it.amount)}</b></td><td class="c">${esc(x.r.docNo)}</td><td>${esc(x.it.note || "")}${x.it.wht ? ` (WHT ${x.it.wht.rate}%)` : ""}</td></tr>`).join("")}</tbody></table>
        <div class="tot"><span>รวมค่าใช้จ่ายทั้งหมด ${rows.length} รายการ</span><b>${money(sum)} บาท</b></div>
        <div class="sig">${[["ผู้ขอเบิก", "Requester", reqNames], ["ผู้อนุมัติ (ROM)", "Approver", romNames], ["ผู้รับเอกสาร (บัญชี)", "Accounting", accNames]].map(([a, b, n]) => `<div><div class="ln"></div><div class="nm">${esc(n) || "&nbsp;"}</div><div class="rl">( ${a} / ${b} )</div><div class="dt">วันที่ __ / __ / ____</div></div>`).join("")}</div>
        <div class="ft">ระบบเงินสดย่อยดิจิทัล | บริษัท ทันตะทัตถ์ คลินิก จำกัด</div></section>`;
    }).join("");
    const css = `<style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:'Prompt','Noto Sans Thai',sans-serif;color:#111;font-size:11px;margin:0}
      .pg{page-break-after:always;padding:2mm}.pg:last-child{page-break-after:auto}.hd{background:#2b2b2b;color:#fff;padding:3mm 5mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .t1{font-weight:700;font-size:14px}.t2{font-size:13px;margin-top:1mm;color:#ddd}.t3{font-size:11px;margin-top:1mm;color:#ccc}
      .meta{display:flex;gap:10mm;padding:2mm 0;border-bottom:1px solid #999;margin-bottom:2mm}
      table{width:100%;border-collapse:collapse}th{background:#555;color:#fff;padding:2mm;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;border:.5pt solid #999}
      td{padding:1.6mm 2mm;border:.5pt solid #bbb;vertical-align:top}tbody tr:nth-child(even){background:#f4f4f4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .r{text-align:right}.c{text-align:center}.tot{display:flex;justify-content:space-between;background:#2b2b2b;color:#fff;padding:3mm 5mm;margin-top:2mm;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .sig{display:flex;gap:10mm;margin-top:14mm;break-inside:avoid}.sig>div{flex:1;text-align:center}.ln{border-bottom:.75pt solid #333;height:14mm}
      .nm{font-size:10px;margin-top:1mm;min-height:4mm}.rl{font-weight:700;font-size:10px;margin-top:1mm}.dt{font-size:9px;color:#555;margin-top:1mm}.ft{margin-top:6mm;font-size:8px;color:#999;border-top:1px solid #ddd;padding-top:2mm}</style>`;
    const fonts = `<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700&display=swap" rel="stylesheet">`;
    const ifr = document.createElement("iframe"); ifr.style.cssText = "position:fixed;top:-9999px;width:1px;height:1px;border:0";
    document.body.appendChild(ifr);
    const doc = ifr.contentDocument; doc.open(); doc.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">${fonts}${css}</head><body>${pages}</body></html>`); doc.close();
    const go = () => { ifr.contentWindow.focus(); ifr.contentWindow.print(); setTimeout(() => ifr.remove(), 2000); };
    let printed = false; const once = () => { if (!printed) { printed = true; go(); } };
    ifr.contentWindow.onload = () => setTimeout(once, 400); setTimeout(once, 1500);
  };
  $("#prt").onclick = printReport;

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
