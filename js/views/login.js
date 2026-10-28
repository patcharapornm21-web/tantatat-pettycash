import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, deleteUser, signOut } from "../fb.js";
import { bootstrapAvailable, bootstrapAdmin } from "../data.js";
import { esc, $ } from "../utils.js";
import { toast, busy, friendlyError } from "../ui.js";
import { APP_SETTINGS } from "../firebase-config.js";

export default async function login(root, { msg } = {}) {
  let role = "";
  let mode = "login"; // login | setup
  const draw = (canSetup) => {
    root.innerHTML = `
    <div class="login">
      <div class="login-head">
        <div class="pill-glass"><div class="avatar" style="width:32px;height:32px;border-radius:10px;background:var(--ink);color:#fff"><span class="material-symbols-outlined" style="font-size:20px;font-variation-settings:'FILL' 1">dentistry</span></div>
          <div><b style="display:block;line-height:16px">${esc(APP_SETTINGS.orgName)}</b><span class="tiny muted">${esc(APP_SETTINGS.systemName)}</span></div></div>
        <span class="live"><i></i>Cloud Online</span>
      </div>
      <div class="login-card">
        <div class="emblem"><span class="material-symbols-outlined" style="font-size:28px;font-variation-settings:'FILL' 1">${mode === "setup" ? "admin_panel_settings" : "login"}</span></div>
        <h1 style="text-align:center">${mode === "setup" ? "ตั้งค่าครั้งแรก" : "เข้าสู่ระบบ"}</h1>
        <p class="muted center" style="margin:.5rem 0 0">${mode === "setup" ? "สร้างบัญชีผู้ดูแลระบบ (บัญชีส่วนกลาง) คนแรก — ทำได้เพียงครั้งเดียว" : "ระบบเบิกจ่ายเงินสดย่อย (Petty Cash Gateway)"}</p>
        ${mode === "login" ? `<div class="rolepills" id="rp">
          <button type="button" data-r="branch">สาขา</button><button type="button" data-r="approver">ผู้อนุมัติ/ROM</button><button type="button" data-r="accounting">บัญชีกลาง</button></div>` : '<div style="height:1rem"></div>'}
        ${msg ? `<div class="notice bad" style="width:100%;margin-bottom:1rem"><span class="material-symbols-outlined">error</span><div>${esc(msg)}</div></div>` : ""}
        <form id="f" autocomplete="on">
          ${mode === "setup" ? `<div class="field"><label>ชื่อ-นามสกุล</label><div class="iconinp"><span class="material-symbols-outlined">person</span><input class="inp" id="name" required placeholder="เช่น สมชาย ใจดี"></div></div>` : ""}
          <div class="field"><label for="email">อีเมล</label><div class="iconinp"><span class="material-symbols-outlined">mail</span>
            <input class="inp" id="email" type="email" required placeholder="name@company.com" autocomplete="username"></div></div>
          <div class="field"><label for="pw">รหัสผ่าน</label><div class="iconinp"><span class="material-symbols-outlined">lock</span>
            <input class="inp" id="pw" type="password" required minlength="6" placeholder="อย่างน้อย 6 ตัวอักษร" autocomplete="${mode === "setup" ? "new-password" : "current-password"}">
            <button class="icon-btn eye" type="button" id="eye" aria-label="แสดงรหัสผ่าน"><span class="material-symbols-outlined">visibility_off</span></button></div></div>
          <button class="btn primary block" id="go" type="submit" style="margin-top:.5rem;min-height:48px">${mode === "setup" ? "สร้างบัญชีผู้ดูแล" : "เข้าสู่ระบบ (Sign In)"}<span class="material-symbols-outlined">arrow_forward</span></button>
        </form>
        <div class="row between" style="width:100%;margin-top:1rem">
          ${mode === "login" ? `<a href="#" id="forgot" class="small">ลืมรหัสผ่าน?</a>` : `<a href="#" id="back" class="small">← กลับไปหน้าเข้าสู่ระบบ</a>`}
          ${canSetup && mode === "login" ? `<a href="#" id="setup" class="small">ตั้งค่าครั้งแรก</a>` : ""}
        </div>
        <div class="small muted center" style="margin-top:1rem">ไม่มีบัญชี? ติดต่อฝ่ายบัญชีส่วนกลางเพื่อขอสร้างผู้ใช้</div>
      </div>
    </div>`;
    wire(canSetup);
  };

  const wire = (canSetup) => {
    $("#eye").onclick = () => {
      const p = $("#pw"); const show = p.type === "password"; p.type = show ? "text" : "password";
      $("#eye .material-symbols-outlined").textContent = show ? "visibility" : "visibility_off";
    };
    const rp = $("#rp");
    if (rp) rp.onclick = (e) => {
      const b = e.target.closest("button[data-r]"); if (!b) return;
      role = role === b.dataset.r ? "" : b.dataset.r;
      [...rp.children].forEach((x) => x.classList.toggle("on", x.dataset.r === role));
    };
    const fg = $("#forgot");
    if (fg) fg.onclick = async (e) => {
      e.preventDefault();
      const em = $("#email").value.trim();
      if (!em) return toast("กรอกอีเมลก่อน แล้วกด “ลืมรหัสผ่าน?” อีกครั้ง", "warn");
      try { await sendPasswordResetEmail(auth, em); toast("ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว", "ok"); }
      catch (err) { toast(friendlyError(err), "err"); }
    };
    const su = $("#setup"); if (su) su.onclick = (e) => { e.preventDefault(); mode = "setup"; msg = ""; draw(canSetup); };
    const bk = $("#back"); if (bk) bk.onclick = (e) => { e.preventDefault(); mode = "login"; msg = ""; draw(canSetup); };

    $("#f").onsubmit = async (e) => {
      e.preventDefault();
      const email = $("#email").value.trim(), pw = $("#pw").value;
      try {
        if (mode === "setup") {
          await busy(async () => {
            if (!(await bootstrapAvailable())) throw new Error("มีผู้ดูแลระบบแล้ว กรุณาเข้าสู่ระบบตามปกติ");
            const cred = await createUserWithEmailAndPassword(auth, email, pw);
            try { await bootstrapAdmin(cred.user.uid, email, $("#name").value.trim()); }
            catch (err) { await deleteUser(cred.user).catch(() => {}); await signOut(auth); throw err; }
          }, "กำลังสร้างบัญชีผู้ดูแล…");
          location.hash = "#/overview"; location.reload();
        } else {
          window.__expectedRole = role || null;
          await busy(() => signInWithEmailAndPassword(auth, email, pw), "กำลังเข้าสู่ระบบ…");
        }
      } catch (err) {
        window.__expectedRole = null;
        msg = friendlyError(err); draw(canSetup);
        $("#email").value = email;
      }
    };
  };

  draw(false);
  try { const can = await bootstrapAvailable(); if (can) draw(true); } catch { /* ignore */ }
}
