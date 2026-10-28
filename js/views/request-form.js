import { esc, baht, money, round2, todayISO, monthKey, thDate, $, $$ } from "../utils.js";
import { openModal, toast, busy, friendlyError, pageHeader, confirmDialog } from "../ui.js";
import { compressImage } from "../image.js";
import { submitRequest, loadReceipts } from "../data.js";
import { getDoc } from "../fb.js";
import { requestRef } from "../data.js";
import { APP_SETTINGS } from "../firebase-config.js";

export default async function view(root, ctx, { params }) {
  const editId = params[0] || null;
  let editReq = null;
  const form = { date: todayISO(), note: "", items: [] };

  if (editId) {
    root.innerHTML = `<div class="empty"><div class="spin" style="margin:0 auto 1rem"></div>กำลังโหลดใบเบิก…</div>`;
    const s = await getDoc(requestRef(editId));
    if (!s.exists()) { root.innerHTML = `<div class="notice bad">ไม่พบใบเบิก</div>`; return; }
    editReq = { id: editId, ...s.data() };
    if (editReq.branchId !== ctx.profile.branchId || editReq.status !== "returned") {
      root.innerHTML = `<div class="notice warn"><span class="material-symbols-outlined">info</span><div>แก้ไขได้เฉพาะใบเบิกของสาขาตัวเองที่ถูกส่งกลับ</div></div>`; return;
    }
    const rc = await loadReceipts(editReq);
    form.date = editReq.date; form.note = editReq.note || "";
    form.items = editReq.items.map((it, i) => ({ ...it, receipt: rc[i] || null }));
  }

  const dirtyGuard = (e) => { if (form.items.length && !submitted) { e.preventDefault(); e.returnValue = ""; } };
  let submitted = false;
  window.addEventListener("beforeunload", dirtyGuard);

  const total = () => round2(form.items.reduce((s, i) => s + (Number(i.amount) || 0), 0));

  const draw = () => {
    const b = ctx.branch; const t = total();
    const after = b ? (Number(b.balance) || 0) - t : 0;
    root.innerHTML = pageHeader({
      title: editReq ? `แก้ไขใบเบิก ${esc(editReq.docNo)}` : "ขอเบิกเงินสดย่อย",
      crumb: `<a href="#/overview">ภาพรวม</a> › ${editReq ? "แก้ไขและส่งใหม่" : "สร้างใบขอเบิก"}`, live: false,
    }) + `
    ${editReq?.comment ? `<div class="notice warn" style="margin-bottom:1.25rem"><span class="material-symbols-outlined">undo</span><div><b>เหตุผลที่ถูกส่งกลับ:</b> ${esc(editReq.comment)}</div></div>` : ""}
    <div class="grid g-main">
      <div class="stack">
        <div class="card">
          <div class="card-h"><h3>ข้อมูลใบเบิก</h3><span class="tag">${editReq ? esc(editReq.docNo) : "เลขที่ออกให้อัตโนมัติเมื่อส่ง"}</span></div>
          <div class="grid g3 keep" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
            <div class="field"><label>สาขา</label><input class="inp" readonly value="${esc(b ? `${b.name} (${b.id})` : ctx.profile.branchId)}"></div>
            <div class="field"><label>ผู้ขอเบิก</label><input class="inp" readonly value="${esc(ctx.profile.name)}"></div>
            <div class="field"><label for="fdate">วันที่ขอเบิก *</label><input class="inp" id="fdate" type="date" value="${form.date}" max="${todayISO()}" ${editReq ? "disabled" : ""}></div>
          </div>
          <div class="field" style="margin-top:1rem"><label for="fnote">วัตถุประสงค์ / หมายเหตุ</label>
            <textarea class="inp" id="fnote" placeholder="เช่น ซื้อวัสดุสำนักงานประจำเดือน">${esc(form.note)}</textarea></div>
        </div>

        <div class="card">
          <div class="card-h"><h3>รายการค่าใช้จ่าย <span class="muted small">(${form.items.length}/${APP_SETTINGS.maxItemsPerRequest})</span></h3>
            <button class="btn soft sm" id="add"><span class="material-symbols-outlined">add</span>เพิ่มรายการ</button></div>
          ${form.items.length ? `
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>รายการ</th><th>หมวดหมู่</th><th class="c">จำนวน</th><th class="r">ราคา/หน่วย</th><th class="r">รวม</th><th class="c">ใบเสร็จ</th><th></th></tr></thead><tbody>
          ${form.items.map((it, i) => `<tr><td>${i + 1}</td><td><b>${esc(it.desc)}</b></td><td><span class="cat-chip">${esc(it.category)}</span></td>
            <td class="c num">${it.qty}</td><td class="r num">${money(it.unitPrice ?? it.amount)}</td><td class="r num"><b>${money(it.amount)}</b></td>
            <td class="c">${it.receipt ? `<img class="thumb" src="${it.receipt}" data-zoom="${i}" alt="ใบเสร็จ">` : `<span class="chip st-pending">ไม่มีรูป</span>`}</td>
            <td class="r" style="white-space:nowrap"><button class="icon-btn" data-edit="${i}" aria-label="แก้ไข"><span class="material-symbols-outlined">edit</span></button>
              <button class="icon-btn" data-del="${i}" aria-label="ลบ"><span class="material-symbols-outlined" style="color:var(--bad)">delete</span></button></td></tr>`).join("")}
          </tbody></table></div>` :
          `<div class="items-empty"><span class="material-symbols-outlined" style="font-size:40px;color:#7dd3fc">receipt_long</span>
            <p>ยังไม่มีรายการ — กด “เพิ่มรายการ” เพื่อใส่ค่าใช้จ่ายและแนบรูปใบเสร็จ</p><button class="btn sky" id="add2"><span class="material-symbols-outlined">add</span>เพิ่มรายการ</button></div>`}
        </div>
      </div>

      <div class="stack">
        <div class="card" style="position:sticky;top:1rem">
          <h3 style="margin-bottom:1rem">สรุปยอด</h3>
          <div class="totalbar"><span class="muted">ยอดรวมสุทธิ</span><b class="num">${baht(t)}</b></div>
          <div class="stack" style="gap:.5rem;margin:1rem 0;font-size:13px">
            <div class="row between"><span class="muted">จำนวนรายการ</span><b>${form.items.length}</b></div>
            <div class="row between"><span class="muted">แนบใบเสร็จแล้ว</span><b>${form.items.filter((i) => i.receipt).length}/${form.items.length}</b></div>
            <div class="row between"><span class="muted">คงเหลือหลังส่งเบิก</span><b class="num ${after < 0 ? "neg" : ""}" style="${after < 0 ? "color:var(--bad)" : ""}">${baht(after)}</b></div>
          </div>
          ${after < 0 ? `<div class="notice warn" style="margin-bottom:1rem"><span class="material-symbols-outlined">warning</span><div>ยอดเบิกเกินวงเงินคงเหลือ — ยอดจะติดลบจนกว่าฝ่ายบัญชีโอนเติม</div></div>` : ""}
          <button class="btn ok block" id="submit" style="min-height:48px" ${form.items.length ? "" : "disabled"}><span class="material-symbols-outlined">send</span>${editReq ? "ส่งใหม่เพื่อขออนุมัติ" : "ส่งขออนุมัติ"}</button>
          <a class="btn ghost block" href="#/overview" style="margin-top:.6rem">ยกเลิก</a>
        </div>
      </div>
    </div>`;
    wire();
  };

  const wire = () => {
    const syncTop = () => { form.note = $("#fnote").value; if (!editReq) form.date = $("#fdate").value || todayISO(); };
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
      const noRc = form.items.filter((i) => !i.receipt).length;
      const msg = `ยืนยันส่งใบเบิกยอดรวม ${baht(total())} (${form.items.length} รายการ)` + (noRc ? `\n\n⚠️ มี ${noRc} รายการที่ไม่ได้แนบใบเสร็จ` : "");
      if (!(await confirmDialog(msg, { okText: "ส่งขออนุมัติ" }))) return;
      try {
        const r = await busy(() => submitRequest(ctx.profile, ctx.branch, form, editReq), "กำลังส่งใบเบิก…");
        submitted = true;
        toast(`ส่งใบเบิก <b>${esc(r.docNo)}</b> เรียบร้อย — รอผู้อนุมัติ`, "ok", 5000);
        ctx.nav(`#/request/${r.id}`);
      } catch (e) { console.error(e); toast(friendlyError(e), "err", 7000); }
    };
  };

  function itemModal(idx) {
    const cur = idx != null ? { ...form.items[idx] } : { desc: "", category: APP_SETTINGS.categories[0], qty: 1, unitPrice: "", amount: 0, receipt: null };
    if (idx == null && form.items.length >= APP_SETTINGS.maxItemsPerRequest) return toast(`เพิ่มได้สูงสุด ${APP_SETTINGS.maxItemsPerRequest} รายการต่อใบเบิก`, "warn");
    let receipt = cur.receipt; let rcInfo = receipt ? "แนบแล้ว" : "";
    const m = openModal(`
      <div class="modal-body">
        <div class="row between"><h3 class="modal-title">${idx != null ? "แก้ไขรายการ" : "เพิ่มรายการค่าใช้จ่าย"}</h3><button class="icon-btn" data-close aria-label="ปิด"><span class="material-symbols-outlined">close</span></button></div>
        <div class="field"><label for="i-desc">รายละเอียดรายการ *</label><input class="inp" id="i-desc" maxlength="120" placeholder="เช่น กระดาษ A4 5 รีม" value="${esc(cur.desc)}"></div>
        <div class="field"><label for="i-cat">หมวดหมู่ *</label><select class="inp" id="i-cat">${APP_SETTINGS.categories.map((c) => `<option ${c === cur.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
        <div class="grid g2 keep" style="grid-template-columns:1fr 1fr;gap:.75rem">
          <div class="field"><label for="i-qty">จำนวน</label><input class="inp num" id="i-qty" type="number" min="1" step="1" inputmode="numeric" value="${cur.qty}"></div>
          <div class="field"><label for="i-up">ราคาต่อหน่วย (บาท) *</label><input class="inp num" id="i-up" type="number" min="0" step="0.01" inputmode="decimal" value="${cur.unitPrice ?? ""}"></div>
        </div>
        <div class="totalbar"><span class="muted">ยอดรวมรายการนี้</span><b class="num" id="i-tot">${baht(cur.amount)}</b></div>
        <div class="field"><label>รูปใบเสร็จ / บิล</label>
          <div class="dropzone" id="dz"><div id="dz-in"></div></div>
          <div class="row wrap" style="margin-top:.5rem"><button class="btn ghost sm" type="button" id="pick"><span class="material-symbols-outlined">photo_library</span>เลือกรูป</button>
            <button class="btn ghost sm" type="button" id="cam"><span class="material-symbols-outlined">photo_camera</span>ถ่ายรูป</button>
            <button class="btn ghost sm hide" type="button" id="rm"><span class="material-symbols-outlined">delete</span>เอารูปออก</button></div>
          <input type="file" id="f1" accept="image/*" class="hide"><input type="file" id="f2" accept="image/*" capture="environment" class="hide">
        </div>
        <div id="i-err" class="small" style="color:var(--bad)"></div>
      </div>
      <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn sky" id="i-save">บันทึกรายการ</button></div>`, { wide: false });
    const el = m.el; const q = (s) => el.querySelector(s);

    const paintDz = () => {
      q("#dz-in").innerHTML = receipt
        ? `<img src="${receipt}" alt="ตัวอย่างใบเสร็จ"><div class="small muted">${esc(rcInfo)}</div>`
        : `<span class="material-symbols-outlined" style="font-size:36px;color:var(--primary)">cloud_upload</span><div><b>ลากรูปมาวาง หรือแตะเพื่อเลือก</b></div><div class="small muted">ระบบย่อ/บีบอัดอัตโนมัติให้ ≤ ${APP_SETTINGS.maxImageKB}KB</div>`;
      q("#rm").classList.toggle("hide", !receipt);
    };
    const handle = async (file) => {
      if (!file) return;
      q("#i-err").textContent = "";
      try {
        const r = await busy(() => compressImage(file), "กำลังบีบอัดรูป…");
        receipt = r.dataUrl; rcInfo = `${r.width}×${r.height}px · ${(r.bytes / 1024).toFixed(1)} KB (${r.mime.replace("image/", "").toUpperCase()}) — บีบอัดแล้ว`; paintDz();
      } catch (e) { q("#i-err").textContent = e.message; }
    };
    const calc = () => { const t = round2((+q("#i-qty").value || 0) * (+q("#i-up").value || 0)); q("#i-tot").textContent = baht(t); return t; };
    q("#i-qty").oninput = calc; q("#i-up").oninput = calc; calc();
    q("#dz").onclick = () => q("#f1").click();
    q("#pick").onclick = () => q("#f1").click(); q("#cam").onclick = () => q("#f2").click();
    q("#f1").onchange = (e) => handle(e.target.files[0]); q("#f2").onchange = (e) => handle(e.target.files[0]);
    q("#rm").onclick = () => { receipt = null; rcInfo = ""; paintDz(); };
    ["dragenter", "dragover"].forEach((ev) => q("#dz").addEventListener(ev, (e) => { e.preventDefault(); q("#dz").classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => q("#dz").addEventListener(ev, (e) => { e.preventDefault(); q("#dz").classList.remove("drag"); }));
    q("#dz").addEventListener("drop", (e) => handle(e.dataTransfer.files[0]));
    el.addEventListener("paste", (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) handle(f); });
    paintDz();
    q("#i-save").onclick = () => {
      const desc = q("#i-desc").value.trim(), up = +q("#i-up").value, qty = Math.max(1, Math.floor(+q("#i-qty").value || 1));
      const err = !desc ? "กรุณาระบุรายละเอียดรายการ" : !(up > 0) ? "กรุณาระบุราคาต่อหน่วยมากกว่า 0" : "";
      if (err) { q("#i-err").textContent = err; (!desc ? q("#i-desc") : q("#i-up")).classList.add("err"); return; }
      const item = { desc, category: q("#i-cat").value, qty, unitPrice: round2(up), amount: round2(qty * up), receipt };
      if (idx != null) form.items[idx] = item; else form.items.push(item);
      m.close(); draw();
    };
    setTimeout(() => q("#i-desc").focus(), 250);
  }

  draw();
  return () => window.removeEventListener("beforeunload", dirtyGuard);
}

export function zoom(src) {
  const d = document.createElement("div"); d.className = "lightbox"; d.innerHTML = `<img src="${src}" alt="ใบเสร็จ">`;
  d.onclick = () => d.remove(); document.body.appendChild(d);
}
