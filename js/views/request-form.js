import { esc, baht, money, round2, todayISO, thDate, $, $$ } from "../utils.js";
import { openModal, toast, busy, friendlyError, pageHeader, confirmDialog } from "../ui.js";
import { compressImage } from "../image.js";
import { submitRequest, loadReceipts, requestRef } from "../data.js";
import { getDoc } from "../fb.js";
import { APP_SETTINGS } from "../firebase-config.js";
import { bus } from "../app.js";

export default async function view(root, ctx, { params }) {
  const editId = params[0] || null;
  let editReq = null;
  const form = { date: todayISO(), note: "", items: [], editReason: "" };

  if (ctx.branch && ctx.branch.open !== true) {
    root.innerHTML = pageHeader({ title: "ขอเบิกเงินสดย่อย", live: false }) +
      `<div class="notice warn"><span class="material-symbols-outlined">lock</span><div><b>สาขานี้ยังไม่เปิดใช้งาน</b><br>กรุณาติดต่อฝ่ายบัญชีส่วนกลางเพื่อเปิดสาขาก่อนจึงจะขอเบิกได้</div></div>`;
    return;
  }

  if (editId) {
    root.innerHTML = `<div class="empty"><div class="spin" style="margin:0 auto 1rem"></div>กำลังโหลดใบเบิก…</div>`;
    const s = await getDoc(requestRef(editId));
    if (!s.exists()) { root.innerHTML = `<div class="notice bad">ไม่พบใบเบิก</div>`; return; }
    editReq = { id: editId, ...s.data() };
    if (editReq.branchId !== ctx.profile.branchId || !["returned", "pending", "approved"].includes(editReq.status)) {
      root.innerHTML = `<div class="notice warn"><span class="material-symbols-outlined">info</span><div>แก้ไขได้เฉพาะใบเบิกของสาขาตัวเองที่ยังไม่โอนชดเชย</div></div>`; return;
    }
    const rc = await loadReceipts(editReq);
    form.date = editReq.date; form.note = editReq.note || "";
    form.items = editReq.items.map((it, i) => ({ ...it, date: it.date || editReq.date, requester: it.requester || editReq.requesterName, receipt: rc[i] || null }));
  }

  let submitted = false;
  const dirtyGuard = (e) => { if (form.items.length && !submitted) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", dirtyGuard);
  const total = () => round2(form.items.reduce((s, i) => s + (Number(i.amount) || 0), 0));
  const allowNeg = () => ctx.settings.allowNegative !== false;

  const draw = () => {
    const b = ctx.branch; const t = total();
    const after = b ? (Number(b.balance) || 0) - t : 0;
    const blocked = !allowNeg() && after < 0;
    root.innerHTML = pageHeader({
      title: editReq ? `แก้ไขใบเบิก ${esc(editReq.docNo)}` : "ขอเบิกเงินสดย่อย",
      crumb: `<a href="#/overview">ภาพรวม</a> › ${editReq ? "แก้ไขและส่งใหม่" : "สร้างใบขอเบิก"}`, live: false,
    }) + `
    ${editReq && editReq.status !== "returned" ? `<div class="notice info" style="margin-bottom:1.25rem"><span class="material-symbols-outlined">edit_note</span><div>การแก้ไขจะ<b>ส่งขออนุมัติใหม่ทุกครั้ง</b> (เลขที่เอกสารเดิม ${esc(editReq.docNo)}) และต้องระบุเหตุผล${editReq.status === "approved" ? " — เอกสารนี้อนุมัติแล้ว จะกลับไปรออนุมัติอีกครั้ง" : ""}</div></div>` : ""}
    ${editReq?.status === "returned" && editReq?.comment ? `<div class="notice warn" style="margin-bottom:1.25rem"><span class="material-symbols-outlined">undo</span><div><b>เหตุผลที่ถูกส่งกลับ:</b> ${esc(editReq.comment)}</div></div>` : ""}
    <div class="grid g-main">
      <div class="stack">
        <div class="card">
          <div class="card-h"><h3>ข้อมูลใบเบิก</h3><span class="tag">${editReq ? esc(editReq.docNo) : "เลขที่ออกให้อัตโนมัติเมื่อส่ง"}</span></div>
          <div class="grid g3 keep" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
            <div class="field"><label>สาขา</label><input class="inp" readonly value="${esc(b ? (String(b.name).startsWith(b.id) ? b.name : `${b.id}-${b.name}`) : ctx.profile.branchId)}"></div>
            <div class="field"><label>ผู้ยื่นใบเบิก</label><input class="inp" readonly value="${esc(ctx.profile.name)}"></div>
            <div class="field"><label for="fdate">วันที่ยื่นเบิก *</label><input class="inp" id="fdate" type="date" value="${form.date}" max="${todayISO()}" ${editReq ? "disabled" : ""}></div>
          </div>
          <div class="field" style="margin-top:1rem"><label for="fnote">หมายเหตุใบเบิก</label>
            <textarea class="inp" id="fnote" placeholder="เช่น ค่าใช้จ่ายประจำเดือน">${esc(form.note)}</textarea></div>
          ${editReq ? `<div class="field" style="margin-top:1rem"><label for="freason">เหตุผลที่แก้ไข *</label>
            <textarea class="inp" id="freason" placeholder="เช่น กรอกยอดผิด / เลือกหมวดหมู่ผิด">${esc(form.editReason)}</textarea></div>` : ""}
        </div>

        <div class="card">
          <div class="card-h"><h3>รายการค่าใช้จ่าย <span class="muted small">(${form.items.length}/${APP_SETTINGS.maxItemsPerRequest})</span></h3>
            <button class="btn soft sm" id="add"><span class="material-symbols-outlined">add</span>เพิ่มรายการ</button></div>
          ${form.items.length ? `
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>วันที่</th><th>Supplier / ผู้รับเงิน</th><th>รูปแบบเอกสาร</th><th>หมวดหมู่</th><th>ผู้ขอเบิก</th><th class="r">จำนวนเงิน</th><th class="c">ใบเสร็จ</th><th></th></tr></thead><tbody>
          ${form.items.map((it, i) => `<tr><td>${i + 1}</td><td>${thDate(it.date)}</td>
            <td><b>${esc(it.supplier || it.desc || "-")}</b>${it.note ? `<div class="tiny muted">${esc(it.note)}</div>` : ""}${it.wht ? `<div><span class="tag">WHT ${it.wht.rate}%</span></div>` : ""}</td>
            <td class="small">${esc(it.docType || "-")}</td><td><span class="cat-chip">${esc(it.category)}</span></td><td>${esc(it.requester || "")}</td>
            <td class="r num"><b>${money(it.amount)}</b></td>
            <td class="c">${it.receipt ? `<img class="thumb" src="${it.receipt}" data-zoom="${i}" alt="ใบเสร็จ">` : `<span class="chip st-pending">ไม่มีรูป</span>`}</td>
            <td class="r" style="white-space:nowrap"><button class="icon-btn" data-edit="${i}" aria-label="แก้ไข"><span class="material-symbols-outlined">edit</span></button>
              <button class="icon-btn" data-del="${i}" aria-label="ลบ"><span class="material-symbols-outlined" style="color:var(--bad)">delete</span></button></td></tr>`).join("")}
          </tbody></table></div>` :
          `<div class="items-empty"><span class="material-symbols-outlined" style="font-size:40px;color:#7dd3fc">receipt_long</span>
            <p>ยังไม่มีรายการ — กด “เพิ่มรายการ” เพื่อบันทึกค่าใช้จ่ายและแนบรูปใบเสร็จ</p><button class="btn sky" id="add2"><span class="material-symbols-outlined">add</span>เพิ่มรายการ</button></div>`}
        </div>
      </div>

      <div class="stack">
        <div class="card" style="position:sticky;top:1rem">
          <h3 style="margin-bottom:1rem">สรุปยอด</h3>
          <div class="totalbar"><span class="muted">ยอดรวมสุทธิ</span><b class="num">${baht(t)}</b></div>
          <div class="stack" style="gap:.5rem;margin:1rem 0;font-size:13px">
            <div class="row between"><span class="muted">จำนวนรายการ</span><b>${form.items.length}</b></div>
            <div class="row between"><span class="muted">แนบใบเสร็จแล้ว</span><b>${form.items.filter((i) => i.receipt).length}/${form.items.length}</b></div>
            <div class="row between"><span class="muted">คงเหลือหลังส่งเบิก</span><b class="num" style="${after < 0 ? "color:var(--bad)" : ""}">${baht(after)}</b></div>
          </div>
          ${after < 0 ? `<div class="notice ${blocked ? "bad" : "warn"}" style="margin-bottom:1rem"><span class="material-symbols-outlined">${blocked ? "block" : "warning"}</span><div>${blocked ? "ยอดเบิกเกินยอดคงเหลือ และระบบไม่อนุญาตให้ติดลบ" : "ยอดเบิกเกินวงเงินคงเหลือ — ยอดจะติดลบ (สาขาสำรองจ่าย) จนกว่าบริษัทโอนชดเชย"}</div></div>` : ""}
          <button class="btn ok block" id="submit" style="min-height:48px" ${form.items.length && !blocked ? "" : "disabled"}><span class="material-symbols-outlined">send</span>${editReq ? "ส่งใหม่เพื่อขออนุมัติ" : "ส่งขออนุมัติ"}</button>
          <a class="btn ghost block" href="#/overview" style="margin-top:.6rem">ยกเลิก</a>
        </div>
      </div>
    </div>`;
    wire();
  };

  const wire = () => {
    const syncTop = () => { form.note = $("#fnote").value; if ($("#freason")) form.editReason = $("#freason").value; if (!editReq) form.date = $("#fdate").value || todayISO(); };
    $("#fnote").oninput = syncTop; if ($("#fdate")) $("#fdate").onchange = syncTop;
    const open = (idx = null) => { syncTop(); itemModal(idx); };
    $("#add") && ($("#add").onclick = () => open());
    $("#add2") && ($("#add2").onclick = () => open());
    $$("[data-edit]").forEach((b) => (b.onclick = () => open(+b.dataset.edit)));
    $$("[data-del]").forEach((b) => (b.onclick = async () => {
      if (await confirmDialog("ลบรายการนี้ออกจากใบเบิก?", { danger: true, okText: "ลบ" })) { syncTop(); form.items.splice(+b.dataset.del, 1); draw(); }
    }));
    $$("[data-zoom]").forEach((im) => (im.onclick = () => zoom(form.items[+im.dataset.zoom].receipt)));
    $("#submit").onclick = async () => {
      syncTop();
      if (!form.items.length) return;
      if (editReq && !form.editReason.trim()) { $("#freason").classList.add("err"); $("#freason").focus(); return toast("กรุณาระบุเหตุผลที่แก้ไข", "warn"); }
      const noRc = form.items.filter((i) => !i.receipt).length;
      const msg = `ยืนยันส่งใบเบิกยอดรวม ${baht(total())} (${form.items.length} รายการ)\n${editReq && editReq.status !== "returned" ? "ยอดคงเหลือจะปรับตามส่วนต่าง" : "ยอดคงเหลือจะถูกหักทันที"}` + (noRc ? `\n\n⚠️ มี ${noRc} รายการที่ไม่ได้แนบใบเสร็จ` : "");
      if (!(await confirmDialog(msg, { okText: "ส่งขออนุมัติ" }))) return;
      try {
        const r = await busy(() => submitRequest(ctx.profile, ctx.branch, form, editReq, ctx.settings), "กำลังส่งใบเบิก…");
        submitted = true;
        toast(`ส่งใบเบิก <b>${esc(r.docNo)}</b> เรียบร้อย — รอผู้อนุมัติ`, "ok", 5000);
        ctx.nav(`#/request/${r.id}`);
      } catch (e) { console.error(e); toast(friendlyError(e), "err", 7000); }
    };
  };

  function itemModal(idx) {
    if (idx == null && form.items.length >= APP_SETTINGS.maxItemsPerRequest) return toast(`เพิ่มได้สูงสุด ${APP_SETTINGS.maxItemsPerRequest} รายการต่อใบเบิก`, "warn");
    const cur = idx != null ? { ...form.items[idx] } : { date: form.date, docType: "", category: "", amount: "", supplier: "", requester: ctx.profile.name, note: "", wht: null, receipt: null };
    let receipt = cur.receipt; let rcInfo = receipt ? "แนบแล้ว" : "";
    const hasWht = !!cur.wht;
    const m = openModal(`
      <div class="modal-body">
        <div class="row between"><h3 class="modal-title">${idx != null ? "แก้ไขรายการ" : "บันทึกค่าใช้จ่าย"}</h3><button class="icon-btn" data-close aria-label="ปิด"><span class="material-symbols-outlined">close</span></button></div>
        <div class="grid g2 keep" style="grid-template-columns:1fr 1fr;gap:.75rem">
          <div class="field"><label for="i-date">วันที่ *</label><input class="inp" id="i-date" type="date" value="${cur.date}" max="${todayISO()}"></div>
          <div class="field"><label for="i-doc">รูปแบบเอกสาร *</label><select class="inp" id="i-doc"><option value="">— เลือกรูปแบบ —</option>${APP_SETTINGS.docTypes.map((d) => `<option ${d === cur.docType ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>
          <div class="field"><label for="i-cat">หมวดหมู่ *</label><select class="inp" id="i-cat"><option value="">— เลือกหมวดหมู่ —</option>${APP_SETTINGS.categories.map((c) => `<option ${c === cur.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
          <div class="field"><label for="i-amt">จำนวนเงิน (บาท) *</label><input class="inp num" id="i-amt" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" value="${cur.amount}"></div>
        </div>
        <div class="notice info" style="align-items:center;flex-wrap:wrap"><b>ภาษีหัก ณ ที่จ่าย (WHT):</b>
          <label class="row" style="gap:.35rem"><input type="radio" name="wht" value="no" ${hasWht ? "" : "checked"}> ไม่มี WHT</label>
          <label class="row" style="gap:.35rem"><input type="radio" name="wht" value="yes" ${hasWht ? "checked" : ""}> มี WHT</label></div>
        <div id="wht-panel" class="${hasWht ? "" : "hide"}"><div class="grid g3 keep" style="grid-template-columns:1fr 1fr 1fr;gap:.75rem">
          <div class="field"><label>อัตราภาษี *</label><select class="inp" id="w-rate"><option value="">— เลือก —</option>${APP_SETTINGS.whtRates.map(([r, l]) => `<option value="${r}" ${cur.wht && cur.wht.rate === r ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
          <div class="field"><label>ยอดก่อนหักภาษี (฿) *</label><input class="inp num" id="w-before" type="number" min="0.01" step="0.01" value="${cur.wht ? cur.wht.before : ""}"></div>
          <div class="field"><label>ภาษีที่หัก / จ่ายสุทธิ</label><div class="inp" id="w-out" style="background:#fff7ed;color:#c2410c;font-weight:700">—</div></div></div></div>
        <div class="grid g2 keep" style="grid-template-columns:1fr 1fr;gap:.75rem">
          <div class="field"><label for="i-sup">Supplier / ผู้รับเงิน</label><input class="inp" id="i-sup" maxlength="100" placeholder="ชื่อร้านค้า / ผู้รับเงิน" value="${esc(cur.supplier || "")}"></div>
          <div class="field"><label for="i-req">ผู้ขอเบิก *</label><input class="inp" id="i-req" maxlength="60" placeholder="ชื่อพนักงานที่ขอเบิก" value="${esc(cur.requester || "")}"></div>
        </div>
        <div class="field"><label for="i-note">หมายเหตุ</label><input class="inp" id="i-note" maxlength="150" placeholder="(ถ้ามี)" value="${esc(cur.note || "")}"></div>
        <div class="field"><label>รูปใบเสร็จ / สแกนเอกสาร</label>
          <div class="dropzone" id="dz"><div id="dz-in"></div></div>
          <div class="row wrap" style="margin-top:.5rem"><button class="btn ghost sm" type="button" id="pick"><span class="material-symbols-outlined">photo_library</span>เลือกรูป</button>
            <button class="btn ghost sm" type="button" id="cam"><span class="material-symbols-outlined">photo_camera</span>ถ่ายรูป</button>
            <button class="btn ghost sm hide" type="button" id="rm"><span class="material-symbols-outlined">delete</span>เอารูปออก</button></div>
          <input type="file" id="f1" accept="image/*" class="hide"><input type="file" id="f2" accept="image/*" capture="environment" class="hide">
        </div>
        <div id="i-err" class="small" style="color:var(--bad)"></div>
      </div>
      <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn sky" id="i-save">บันทึกรายการ</button></div>`, { wide: true });
    const el = m.el; const q = (s) => el.querySelector(s);
    const whtOn = () => el.querySelector("input[name=wht]:checked").value === "yes";

    const calcWht = () => {
      if (!whtOn()) { q("#i-amt").readOnly = false; return; }
      const rate = +q("#w-rate").value, before = +q("#w-before").value;
      q("#i-amt").readOnly = true;
      if (!rate || !(before > 0)) { q("#w-out").textContent = "—"; q("#i-amt").value = ""; return; }
      const tax = round2((before * rate) / 100), net = round2(before - tax);
      q("#w-out").textContent = `${money(tax)} / ${money(net)}`; q("#i-amt").value = net;
    };
    el.querySelectorAll("input[name=wht]").forEach((r) => (r.onchange = () => { q("#wht-panel").classList.toggle("hide", !whtOn()); calcWht(); }));
    q("#w-rate").onchange = calcWht; q("#w-before").oninput = calcWht;
    if (hasWht) calcWht();

    const paintDz = () => {
      q("#dz-in").innerHTML = receipt
        ? `<img src="${receipt}" alt="ตัวอย่างใบเสร็จ"><div class="small muted">${esc(rcInfo)}</div>`
        : `<span class="material-symbols-outlined" style="font-size:36px;color:var(--primary)">cloud_upload</span><div><b>ลากรูปมาวาง หรือแตะเพื่อเลือก</b></div><div class="small muted">ระบบย่อ/บีบอัดอัตโนมัติให้ ≤ ${APP_SETTINGS.maxImageKB}KB</div>`;
      q("#rm").classList.toggle("hide", !receipt);
    };
    const handle = async (file) => {
      if (!file) return; q("#i-err").textContent = "";
      try {
        const r = await busy(() => compressImage(file), "กำลังบีบอัดรูป…");
        receipt = r.dataUrl; rcInfo = `${r.width}×${r.height}px · ${(r.bytes / 1024).toFixed(1)} KB (${r.mime.replace("image/", "").toUpperCase()}) — บีบอัดแล้ว`; paintDz();
      } catch (e) { q("#i-err").textContent = e.message; }
    };
    q("#dz").onclick = () => q("#f1").click(); q("#pick").onclick = () => q("#f1").click(); q("#cam").onclick = () => q("#f2").click();
    q("#f1").onchange = (e) => handle(e.target.files[0]); q("#f2").onchange = (e) => handle(e.target.files[0]);
    q("#rm").onclick = () => { receipt = null; rcInfo = ""; paintDz(); };
    ["dragenter", "dragover"].forEach((ev) => q("#dz").addEventListener(ev, (e) => { e.preventDefault(); q("#dz").classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => q("#dz").addEventListener(ev, (e) => { e.preventDefault(); q("#dz").classList.remove("drag"); }));
    q("#dz").addEventListener("drop", (e) => handle(e.dataTransfer.files[0]));
    el.addEventListener("paste", (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) handle(f); });
    paintDz();

    q("#i-save").onclick = () => {
      const v = { date: q("#i-date").value, docType: q("#i-doc").value, category: q("#i-cat").value, amount: +q("#i-amt").value, requester: q("#i-req").value.trim() };
      const bad = !v.date ? "#i-date" : !v.docType ? "#i-doc" : !v.category ? "#i-cat" : !(v.amount > 0) ? "#i-amt" : !v.requester ? "#i-req" : "";
      let wht = null;
      if (!bad && whtOn()) { const rate = +q("#w-rate").value, before = +q("#w-before").value; if (!rate || !(before > 0)) { q("#i-err").textContent = "กรอกอัตราภาษีและยอดก่อนหักภาษี"; return; } wht = { rate, before, amount: round2((before * rate) / 100) }; }
      if (bad) { q("#i-err").textContent = "กรอกข้อมูลที่มี * ให้ครบ"; q(bad).classList.add("err"); return; }
      const item = { ...v, amount: round2(v.amount), supplier: q("#i-sup").value.trim(), note: q("#i-note").value.trim(), wht, receipt };
      if (idx != null) form.items[idx] = item; else form.items.push(item);
      m.close(); draw();
    };
  }

  draw();
  const off = bus.on("settings", draw);
  return () => { window.removeEventListener("beforeunload", dirtyGuard); off(); };
}

export function zoom(src) {
  const d = document.createElement("div"); d.className = "lightbox"; d.innerHTML = `<img src="${src}" alt="ใบเสร็จ">`;
  d.onclick = () => d.remove(); document.body.appendChild(d);
}
