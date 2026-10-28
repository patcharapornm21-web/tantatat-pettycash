import { esc, ROLE_LABEL, $, $$, debounce, toCSV, downloadFile } from "../utils.js";
import { pageHeader, toast, openModal, busy, friendlyError, confirmDialog } from "../ui.js";
import { listUsers, saveProfile, assignBranchRegions } from "../data.js";
import { branchLabel, isOpen } from "../utils.js";
import { secondaryAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, auth } from "../fb.js";

export default async function view(root, ctx) {
  let users = [], q = "";
  root.innerHTML = pageHeader({ title: "ผู้ใช้งาน", crumb: "บัญชีส่วนกลาง › จัดการผู้ใช้ & สิทธิ์", live: false,
    actions: `<button class="btn ghost" id="imp"><span class="material-symbols-outlined">upload_file</span>นำเข้าผู้ใช้สาขา (CSV)</button> <button class="btn sky" id="add"><span class="material-symbols-outlined">person_add</span>เพิ่มผู้ใช้</button>` }) + `
  <div class="card flat"><div class="filters" style="padding:1.25rem 1.5rem"><div class="field grow"><label>ค้นหา</label><div class="search"><span class="material-symbols-outlined">search</span><input class="inp" id="q" placeholder="ชื่อ / อีเมล / สาขา"></div></div>
    <button class="btn ghost" id="rf"><span class="material-symbols-outlined">refresh</span>โหลดใหม่</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th><th>สาขา / ขอบเขต</th><th>สถานะ</th><th class="r">จัดการ</th></tr></thead><tbody id="tb"></tbody></table></div></div>`;

  const paint = () => {
    const s = q.trim().toLowerCase();
    const L = users.filter((u) => !s || `${u.name} ${u.email} ${u.branchId || ""} ${u.region || ""}`.toLowerCase().includes(s)).sort((a, b) => (a.role + a.name > b.role + b.name ? 1 : -1));
    $("#tb").innerHTML = L.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td><span class="tag ${u.role === "accounting" ? "" : "gray"}">${ROLE_LABEL[u.role] || u.role}</span></td>
      <td>${u.role === "branch" ? esc(u.branchId) : u.role === "approver" ? `ดูแล ${Object.values(ctx.summary || {}).filter((b) => b && b.region === u.region && u.region).length} สาขา` : "ทุกสาขา"}</td>
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
      <div class="field" id="g-r"><label>สาขาที่ ROM คนนี้ดูแล * <span class="muted" id="g-cnt"></span></label>
        <div class="row" style="gap:.5rem"><input class="inp" id="g-q" placeholder="ค้นหาสาขา…"><button class="btn ghost sm" type="button" id="g-all">เลือกที่แสดงทั้งหมด</button><button class="btn ghost sm" type="button" id="g-none">ล้าง</button></div>
        <div id="g-list" style="max-height:240px;overflow:auto;border-radius:14px;background:#f1f5f9;padding:.5rem"></div>
        <div class="small muted">ถ้าเลือกสาขาที่ ROM คนอื่นดูแลอยู่ สาขานั้นจะถูกย้ายมาให้คนนี้ (ใบเบิกที่ค้างอนุมัติจะย้ายตามไปด้วย)</div></div>
      <label class="row" style="gap:.5rem"><input type="checkbox" id="u-a" ${u.active ? "checked" : ""}> เปิดใช้งานบัญชี</label>
      <div class="small muted" id="u-e" style="color:var(--bad)"></div></div>
      <div class="modal-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn sky" id="u-go">บันทึก</button></div>`);
    const q = (s) => m.el.querySelector(s);
    const sync = () => { q("#g-b").classList.toggle("hide", q("#u-role").value !== "branch"); q("#g-r").classList.toggle("hide", q("#u-role").value !== "approver"); };
    q("#u-role").onchange = sync; sync();
    const holders = Object.fromEntries(users.filter((x) => x.role === "approver" && x.region).map((x) => [x.region, x]));
    const allB = Object.values(ctx.summary || {}).filter((b) => b && b.id).sort((a, b) => (a.id > b.id ? 1 : -1));
    const owned = new Set(u.region ? allB.filter((b) => b.region === u.region).map((b) => b.id) : []);
    const sel = new Set(owned);
    const paintList = () => {
      const f = q("#g-q").value.trim().toLowerCase();
      const shown = allB.filter((b) => !f || `${b.id} ${b.name}`.toLowerCase().includes(f));
      q("#g-list").innerHTML = shown.map((b) => { const h = holders[b.region]; const other = h && h.uid !== u.uid;
        return `<label class="row" style="gap:.5rem;padding:.3rem .4rem;border-radius:8px;cursor:pointer"><input type="checkbox" data-b="${b.id}" ${sel.has(b.id) ? "checked" : ""}> <span class="grow">${esc(branchLabel(b))}</span>
        ${isOpen(b) ? "" : '<span class="tag gray">ยังไม่เปิด</span>'}${other ? `<span class="tag">${esc(h.name)}</span>` : ""}</label>`; }).join("") || '<div class="muted small" style="padding:.5rem">ไม่พบสาขา</div>';
      q("#g-cnt").textContent = `(เลือกแล้ว ${sel.size})`;
      q("#g-list").querySelectorAll("[data-b]").forEach((c) => (c.onchange = () => { c.checked ? sel.add(c.dataset.b) : sel.delete(c.dataset.b); q("#g-cnt").textContent = `(เลือกแล้ว ${sel.size})`; }));
    };
    q("#g-q").oninput = paintList;
    q("#g-all").onclick = () => { q("#g-list").querySelectorAll("[data-b]").forEach((c) => sel.add(c.dataset.b)); paintList(); };
    q("#g-none").onclick = () => { sel.clear(); paintList(); };
    paintList();
    q("#u-go").onclick = async () => {
      const data = { name: q("#u-name").value.trim(), email: q("#u-email").value.trim(), role: q("#u-role").value, active: q("#u-a").checked };
      if (data.role === "branch") data.branchId = q("#u-b").value.trim().padStart(3, "0"); else data.branchId = null;
      data.region = data.role === "approver" ? (u.region || null) : null;
      const err = !data.name ? "กรอกชื่อ" : !data.email ? "กรอกอีเมล" : data.role === "branch" && !/^\d{3}$/.test(data.branchId) ? "รหัสสาขาต้องเป็นเลข 3 หลัก"
        : data.role === "branch" && !(ctx.summary && ctx.summary[data.branchId]) ? `ไม่พบสาขา ${data.branchId} ในระบบ (Seed สาขาก่อน)` : data.role === "approver" && !sel.size ? "เลือกสาขาที่ ROM ดูแลอย่างน้อย 1 สาขา"
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
          if (data.role === "approver" && !data.region) data.region = "ROM_" + uid.slice(0, 6).toUpperCase();
          if (data.role === "approver") data.branchIds = [...sel].sort(); else data.branchIds = null;
          await saveProfile(uid, data);
          if (data.role === "approver") {
            // สาขาที่ถูกย้ายมาจาก ROM คนอื่น → ตัดออกจากรายการของคนนั้น
            for (const id of sel) { const old = allB.find((b) => b.id === id)?.region; const h = old && old !== data.region ? holders[old] : null;
              if (h && Array.isArray(h.branchIds)) { h.branchIds = h.branchIds.filter((x) => x !== id); await saveProfile(h.uid, { branchIds: h.branchIds }); } }
            const changes = [...sel].filter((id) => !owned.has(id)).map((id) => ({ id, region: data.region }))
              .concat([...owned].filter((id) => !sel.has(id)).map((id) => ({ id, region: "-" })));
            if (changes.length) await assignBranchRegions(changes);
          }
        }, "กำลังบันทึก…");
        toast(isNew ? `สร้างผู้ใช้ ${esc(data.email)} แล้ว — แจ้งรหัสผ่านเริ่มต้นให้ผู้ใช้` : "บันทึกแล้ว", "ok", 6000); m.close(); load();
      } catch (e) { console.error(e); q("#u-e").textContent = friendlyError(e); }
    };
  }
  // ---------- นำเข้าผู้ใช้สาขาจาก CSV / วางข้อความ (ROM ต้องเพิ่มเองเพื่อเลือกสาขา) ----------
  function importForm() {
    const m = openModal(`<div class="modal-body"><div class="row between"><h3 class="modal-title">นำเข้าผู้ใช้สาขา</h3><button class="icon-btn" data-close aria-label="ปิด"><span class="material-symbols-outlined">close</span></button></div>
      <p class="small muted" style="margin:0 0 .5rem">1 บรรทัด = 1 ผู้ใช้ รูปแบบ: <b>รหัสสาขา, อีเมล, รหัสผ่านเริ่มต้น, ชื่อ(ไม่ใส่ก็ได้)</b> — สร้างเป็นสิทธิ์ “พนักงานสาขา” เท่านั้น ส่วน ROM ให้กดเพิ่มผู้ใช้แล้วติ๊กเลือกสาขาเอง</p>
      <div class="row" style="gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem"><button class="btn ghost sm" id="im-tpl"><span class="material-symbols-outlined">download</span>ดาวน์โหลดไฟล์ตัวอย่าง</button>
        <label class="btn ghost sm" style="cursor:pointer"><span class="material-symbols-outlined">attach_file</span>เลือกไฟล์ .csv<input type="file" id="im-file" accept=".csv,.txt,text/csv" hidden></label></div>
      <textarea class="inp" id="im-txt" rows="7" placeholder="001,sriracha@clinic.com,Pass1234,พนักงานศรีราชา&#10;002,bangsaen@clinic.com,Pass1234"></textarea>
      <div id="im-res" class="small" style="margin-top:.75rem;max-height:220px;overflow:auto"></div></div>
      <div class="modal-foot"><button class="btn ghost" data-close>ปิด</button><button class="btn sky" id="im-go"><span class="material-symbols-outlined">group_add</span>ตรวจสอบและสร้างผู้ใช้</button></div>`, { wide: true });
    const q2 = (s) => m.el.querySelector(s);
    q2("#im-tpl").onclick = () => downloadFile("users-template.csv", toCSV([["รหัสสาขา", "อีเมล", "รหัสผ่านเริ่มต้น", "ชื่อ"], ["001", "sriracha@example.com", "Pass1234", "พนักงานศรีราชา"], ["002", "bangsaen@example.com", "Pass1234", ""]]));
    q2("#im-file").onchange = async (e) => { const f = e.target.files[0]; if (f) q2("#im-txt").value = await f.text(); };
    const parse = () => q2("#im-txt").value.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .map((l) => l.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, "")))
      .filter((c) => !/^(รหัสสาขา|branch)/i.test(c[0]));
    q2("#im-go").onclick = async () => {
      const rows = parse(); const res = q2("#im-res");
      if (!rows.length) return toast("ยังไม่มีข้อมูลให้นำเข้า", "warn");
      const seen = new Set(users.map((x) => (x.email || "").toLowerCase()));
      const jobs = rows.map((c) => { const [b, email, pw, nm] = c; const bid = String(b || "").padStart(3, "0"); const em = (email || "").toLowerCase();
        const err = !/^\d{3}$/.test(bid) ? "รหัสสาขาต้องเป็นเลข" : !(ctx.summary && ctx.summary[bid]) ? `ไม่พบสาขา ${bid}` : !/^\S+@\S+\.\S+$/.test(em) ? "อีเมลไม่ถูกต้อง" : (pw || "").length < 6 ? "รหัสผ่านอย่างน้อย 6 ตัว" : seen.has(em) ? "อีเมลนี้มีในรายการ/ระบบแล้ว" : "";
        if (!err) seen.add(em); return { bid, em, pw, name: nm || `พนักงาน ${ctx.summary?.[bid]?.name || bid}`, err }; });
      const bad = jobs.filter((j) => j.err);
      if (bad.length && !(await confirmDialog(`มี ${bad.length} บรรทัดที่ไม่ผ่านการตรวจสอบ (จะข้ามบรรทัดเหล่านั้น) ดำเนินการต่อกับอีก ${jobs.length - bad.length} บรรทัด?`))) { res.innerHTML = bad.map((j) => `<div style="color:var(--bad)">✗ ${esc(j.em || "-")} (${esc(j.bid)}) — ${esc(j.err)}</div>`).join(""); return; }
      q2("#im-go").disabled = true; let okN = 0; const lines = [];
      for (const j of jobs) {
        if (j.err) { lines.push(`<div style="color:var(--bad)">✗ ${esc(j.em)} — ${esc(j.err)}</div>`); continue; }
        try {
          const sa = secondaryAuth(); const cred = await createUserWithEmailAndPassword(sa, j.em, j.pw); await signOut(sa);
          await saveProfile(cred.user.uid, { name: j.name, email: j.em, role: "branch", branchId: j.bid, region: null, active: true, createdAt: Date.now() });
          okN++; lines.push(`<div style="color:var(--ok,#059669)">✓ ${esc(j.em)} → สาขา ${esc(j.bid)}</div>`);
        } catch (e) { lines.push(`<div style="color:var(--bad)">✗ ${esc(j.em)} — ${esc(friendlyError(e))}</div>`); }
        res.innerHTML = lines.join("");
      }
      res.innerHTML = `<b>สร้างสำเร็จ ${okN}/${jobs.length} ราย</b>` + lines.join(""); q2("#im-go").disabled = false; load();
    };
  }
  $("#imp").onclick = importForm;
  $("#add").onclick = () => form(null); $("#rf").onclick = load;
  $("#q").oninput = debounce((e) => { if (!$("#tb")) return; q = e.target.value; paint(); }, 150);
  load();
}
