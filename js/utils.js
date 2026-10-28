// ฟังก์ชันช่วยเหลือทั่วไป (ไม่ผูกกับ Firebase จึงทดสอบได้ง่าย)
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const nf = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => nf.format(round2(n || 0));
export const baht = (n) => "฿" + money(n);

export const pad = (n, w = 2) => String(n).padStart(w, "0");
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const monthKey = (iso) => String(iso).slice(0, 7); // "2026-10"
export const curMonth = () => todayISO().slice(0, 7);

const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
export const thMonth = (key) => {
  const [y, m] = String(key).split("-").map(Number);
  return `${TH_MONTHS[(m || 1) - 1]} ${(y || 0) + 543}`;
};
export const thDate = (iso) => {
  if (!iso) return "-";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${d}/${pad(m)}/${y + 543}`;
};
export const thDateTime = (ms) => {
  if (!ms) return "-";
  const d = new Date(ms);
  return `${d.getDate()}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())} น.`;
};
export const lastMonths = (n = 12) => {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
};

// เลขที่เอกสาร: [ABBR]-PC[YYYY][MM]-[SEQ]  เช่น RS-PC202610-001 (รันแยกตามสาขา/เดือน)
export const makeDocNo = (abbr, ym, seq) =>
  `${abbr}-PC${ym.replace("-", "")}-${pad(seq, 3)}`;

export const STATUS = {
  pending:    { label: "รออนุมัติ",        cls: "st-pending",  icon: "schedule" },
  approved:   { label: "อนุมัติแล้ว",       cls: "st-approved", icon: "check_circle" },
  replenished:{ label: "โอนชดเชยแล้ว",     cls: "st-paid",     icon: "payments" },
  rejected:   { label: "ปฏิเสธ",           cls: "st-rejected", icon: "cancel" },
  returned:   { label: "ส่งกลับแก้ไข",      cls: "st-review",   icon: "undo" },
};
export const statusChip = (s) => {
  const x = STATUS[s] || { label: s, cls: "", icon: "help" };
  return `<span class="chip ${x.cls}"><span class="material-symbols-outlined">${x.icon}</span>${esc(x.label)}</span>`;
};

export const ROLE_LABEL = { branch: "พนักงานสาขา", approver: "ผู้อนุมัติ/ผู้จัดการเขต", accounting: "บัญชีส่วนกลาง" };

// ----- CSV (เปิดใน Excel ภาษาไทยได้: ใส่ BOM) -----
export function toCSV(rows) {
  const cell = (v) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // กัน CSV/Formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
export function downloadFile(name, text, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const debounce = (fn, ms = 200) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
