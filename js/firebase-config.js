// =====================================================================
//  ✏️  ไฟล์นี้เป็นไฟล์เดียวที่คุณต้องแก้ไข (ดูขั้นตอนใน README-TH.md ข้อ 3)
//  นำค่า firebaseConfig จาก Firebase Console มาวางแทนที่ค่า "YOUR_..." ด้านล่าง
// =====================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyD4cRm2FCd5Zn-0y46eORPNO_CnkOs86_Q",
  authDomain: "tantatat-pettycash.firebaseapp.com",
  projectId: "tantatat-pettycash",
  storageBucket: "tantatat-pettycash.firebasestorage.app", // ไม่ได้ใช้ Storage แต่ config จะมีให้
  messagingSenderId: "748290892097",
  appId: "1:748290892097:web:774a807fe173e5ddfc81c0",
};

export const APP_SETTINGS = {
  orgName: "Tantatat Clinic",
  systemName: "Petty Cash Central Portal",
  // วงเงินคงเหลือต่ำกว่า % นี้ของวงเงินตั้งต้น = แจ้งเตือนสีเหลือง/แดงในหน้าบัญชี
  lowBalancePct: 30,
  // ขนาดรูปใบเสร็จสูงสุดหลังบีบอัด (KB) — 40KB x 10,000 ใบ ≈ 400MB (โควต้าฟรี 1GB)
  maxImageKB: 40,
  // จำนวนใบเสร็จสูงสุดต่อ 1 ใบเบิก (เอกสาร Firestore จำกัด 1MB)
  maxItemsPerRequest: 20,
  // (ทางเลือก) ใช้ Cloudinary ฟรีเก็บรูปแทน Base64 — ใส่ทั้งสองค่าเพื่อเปิดใช้
  cloudinary: { cloudName: "", uploadPreset: "" },
  // หมวดหมู่ / รูปแบบเอกสาร / อัตรา WHT (เหมือนระบบเดิม)
  categories: [
    "ค่าพาหนะและเดินทาง",
    "ค่าไปรษณีย์และขนส่ง",
    "ค่าน้ำดื่ม",
    "ค่าสวัสดิการพนักงาน",
    "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "ค่าใช้จ่ายเบ็ดเตล็ด",
    "อื่นๆ (ระบุในหมายเหตุ)",
  ],
  docTypes: ["บิลเงินสด", "ใบรับรองแทนใบเสร็จ", "ใบเสร็จรับเงิน/ใบกำกับภาษี"],
  whtRates: [[1, "1% (ค่าขนส่ง)"], [2, "2% (โฆษณา)"], [3, "3% (ค่าบริการ / จ้างทำของ)"], [5, "5% (ค่าเช่า)"]],
  // ค่าเริ่มต้นของการตั้งค่าระบบ (บัญชีเปลี่ยนได้ในหน้า Console → ตั้งค่าระบบ)
  defaultSettings: { allowNegative: true },

};

export const isConfigured = () =>
  !!firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("YOUR_");
