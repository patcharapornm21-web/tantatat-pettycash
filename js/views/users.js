import { esc, ROLE_LABEL, $, $$, debounce } from "../utils.js";
import { pageHeader, toast, openModal, busy, friendlyError } from "../ui.js";
import { listUsers, saveProfile } from "../data.js";
import { secondaryAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, auth } from "../fb.js";

export default async function view(root, ctx) {
  let users = [], q = "";
  root.innerHTML = pageHeader({ title: "ผู้ใช้งาน", crumb: "บัญชีส่วนกลาง › จัดการผู้ใช้ & สิทธิ์", live: false,
    actions: `<button class="btn sky" id="add"><span class="material-symbols-outlined">person_add</span>เพิ่มผู้ใช้</button>` }) + `
  <div class="card flat"><div class="filters" style="padding:1.25rem 1.5rem"><div class="field grow"><label>ค้นหา</label><div class="search"><span class="material-symbols-outlined">search</span><input class="inp" id="q" placeholder="ชื่อ / อีเมล / สาขา"></div></div>
    <button class="btn ghost" id="rf"><span class="material-symbols-outlined">refresh</span>โหลดใหม่</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th><th>สาขา / เขต</th><th>สถานะ</th><th class="r">จัดการ</th></tr></thead><tbody id="tb"></tbody></table></div></div>`;

  const paint = () => {
    const s = q.trim().toLowerCase();
    const L = users.filter((u) => !s || `${u.name} ${u.email} ${u.branchId || ""} ${u.region || ""}`.toLowerCase().includes(s)).sort((a, b) => (a.role + a.name > b.role + b.name ? 1 : -1));
    $("#tb").innerHTML = L.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td><span class="tag ${u.role === "accounting" ? "" : "gray"}">${ROLE_LABEL[u.role] || u.role}</span></td>
      <td>${u.role === "branch" ? esc(u.branchId) : u.role === "approver" ? "เขต " + esc(u.region || "-") : "ทุกสาขา"}</td>
      <td>${u.active ? '<span class="chip st-approved">ใช้งาน</span>' : '<span class="chip st-rejected">ปิดใช้งาน</span>'}</td>
      <td class="r" style="white-space:nowrap"><button class="icon-btn" data-edit="${u.uid}" aria-label="แก้ไข"><span class="material-symbols-outlined">edit</span></button>
        <button class="icon-btn" data-reset="${esc(u.email)}" aria-label="ส่งลิงก์รีเซ็ตรหัสผ่าน" title="ส่งลิงก์รีเซ็ตรหัสผ่าน"><span class="material-symbols-outlined">lock_reset</span></button></td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">ยังไม่มีผู้ใช้</div></td></tr>`;
    $$("[data-edit]").forEach((b) => (b.onclick = () => form(users.find((u) => u.uid === b.dataset.edit))));
    $$("[data-reset]").forEach((b) => (b.onclick = async () => { try { await sendPasswordResetEmail(auth, b.dataset.reset); toast("ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว", "ok"); } catch (e) { toast(friendlyError(e), "err"); } }));
  };
  const load = async () => { try { users = await busy(listUsers, "กำลังโหลดผู้ใช้…"); paint(); } catch (e) { toast(friendlyError(e), "err", 7000); } };

  function form(u) {
    const isNew = !u; u = u || { role: "branch", active: true, name: "", email: "", branchId: "", region: "" };
    const m = openModal(`<div class="modal-body"><h3 class="modal-title">${isNew ? "เพิ่มผู้ใช้ใหม่" : "แก้ไขผู้ใช้"}</h3>
      <div class="field"><label>ชื่อ-นามสกุล *</label><input class="inp" id="u-name" value="${esc(u.name)}"></div>
      <div class="field"><label>อีเมล *</label><input class="inp" id="u-email" type="email" value="${esc(u.email)}" ${isNew ? "" : "readonly"}></div>
      ${isNew ? `<div class="field"><label>รหัสผ่านเริ่มต้น * (อย่างน้อย 6 ตัว)</label><input class="inp" id="u-pw" type="text" autocomplete="off" value=""></div>` : ""}
      <div class="field"><label>สิทธิ์ *</label><select class="inp" id="u-role">${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${k === u.role ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field" id="g-b"><label>รหัสสาขา (เช่น 001) *</label><input class="inp" id="u-b" value="${esc(u.branchId || "")}" maxlength="3" inputmode="numeric"></div>
      <div class="field" id="g-r"><label>เขตที่รับผิดชอบ (เช่น R01) *</label><input class="inp" id="u-r" value="${esc(u.region || "")}" maxlength="8"></div>
      <label class="row" style="gap:.5rem"><input type="checkbox" id="u-a" ${u.active ? "checked" : ""}> เปิดใช้งานบัญชี</label>
      <div class="small muted" id="u-e" style="color:var(--bad)"></div></div>
      <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn sky" id="u-go">บันทึก</button></div>`);
    const q = (s) => m.el.querySelector(s);
    const sync = () => { q("#g-b").classList.toggle("hide", q("#u-role").value !== "branch"); q("#g-r").classList.toggle("hide", q("#u-role").value !== "approver"); };
    q("#u-role").onchange = sync; sync();
    q("#u-go").onclick = async () => {
      const data = { name: q("#u-name").value.trim(), email: q("#u-email").value.trim(), role: q("#u-role").value, active: q("#u-a").checked };
      if (data.role === "branch") data.branchId = q("#u-b").value.trim().padStart(3, "0"); else data.branchId = null;
      if (data.role === "approver") data.region = q("#u-r").value.trim().toUpperCase(); else data.region = null;
      const err = !data.name ? "กรอกชื่อ" : !data.email ? "กรอกอีเมล" : data.role === "branch" && !/^\d{3}$/.test(data.branchId) ? "รหัสสาขาต้องเป็นเลข 3 หลัก"
        : data.role === "branch" && !(ctx.summary && ctx.summary[data.branchId]) ? `ไม่พบสาขา ${data.branchId} ในระบบ (Seed สาขาก่อน)` : data.role === "approver" && !data.region ? "กรอกเขต"
        : isNew && (q("#u-pw").value.length < 6) ? "รหัสผ่านอย่างน้อย 6 ตัวอักษร" : "";
      if (err) { q("#u-e").textContent = err; return; }
      try {
        await busy(async () => {
          let uid = u.uid;
          if (isNew) { // สร้างผ่านแอปตัวที่สอง เพื่อไม่ให้ผู้ดูแลหลุดออกจากระบบ
            const sa = secondaryAuth();
            const cred = await createUserWithEmailAndPassword(sa, data.email, q("#u-pw").value);
            uid = cred.user.uid; await signOut(sa);
            data.createdAt = Date.now();
          }
          await saveProfile(uid, data);
        }, "กำลังบันทึก…");
        toast(isNew ? `สร้างผู้ใช้ ${esc(data.email)} แล้ว — แจ้งรหัสผ่านเริ่มต้นให้ผู้ใช้` : "บันทึกแล้ว", "ok", 6000); m.close(); load();
      } catch (e) { console.error(e); q("#u-e").textContent = friendlyError(e); }
    };
  }
  $("#add").onclick = () => form(null); $("#rf").onclick = load;
  $("#q").oninput = debounce((e) => { if (!$("#tb")) return; q = e.target.value; paint(); }, 150);
  load();
}
