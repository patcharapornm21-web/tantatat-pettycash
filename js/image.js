// บีบอัดรูปใบเสร็จด้วย <canvas> ให้ ≤ maxKB (WebP ก่อน ถ้าเบราว์เซอร์ไม่รองรับใช้ JPEG)
import { APP_SETTINGS } from "./firebase-config.js";

const approxBytes = (dataUrl) => Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("ไม่สามารถอ่านไฟล์รูปนี้ได้")); };
    img.src = url;
  });
}

function supportsWebP() {
  try {
    const c = document.createElement("canvas"); c.width = c.height = 1;
    return c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch { return false; }
}

/** คืนค่า { dataUrl, bytes, width, height, mime } */
export async function compressImage(file, maxKB = APP_SETTINGS.maxImageKB) {
  if (!file || !file.type.startsWith("image/")) throw new Error("กรุณาเลือกไฟล์รูปภาพ");
  const img = await loadBitmap(file);
  const mime = supportsWebP() ? "image/webp" : "image/jpeg";
  const limit = maxKB * 1024;
  let maxDim = 1280;               // ด้านยาวสุดเริ่มต้น (อ่านตัวหนังสือในใบเสร็จได้)
  let best = null;

  while (maxDim >= 360) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); // กันพื้นหลังโปร่งใสกลายเป็นดำใน JPEG
    ctx.drawImage(img, 0, 0, w, h);

    // ค้นหาคุณภาพสูงสุดที่ยังไม่เกินขนาด (binary search 6 รอบ)
    let lo = 0.25, hi = 0.9, found = null;
    for (let i = 0; i < 6; i++) {
      const q = (lo + hi) / 2;
      const url = canvas.toDataURL(mime, q);
      if (approxBytes(url) <= limit) { found = url; lo = q; } else { hi = q; }
    }
    if (!found) { // ลองคุณภาพต่ำสุดก่อนย่อขนาด
      const url = canvas.toDataURL(mime, 0.25);
      if (approxBytes(url) <= limit) found = url;
    }
    if (found) { best = { dataUrl: found, bytes: approxBytes(found), width: w, height: h, mime }; break; }
    maxDim = Math.round(maxDim * 0.82);
  }
  if (!best) throw new Error("ไม่สามารถบีบอัดรูปให้เล็กพอได้ กรุณาถ่ายใหม่ให้ใกล้ขึ้น");
  return best;
}

/** (ทางเลือก) อัปโหลดไป Cloudinary ฟรี แล้วเก็บเฉพาะ URL */
export async function uploadToCloudinary(dataUrl) {
  const { cloudName, uploadPreset } = APP_SETTINGS.cloudinary;
  const fd = new FormData();
  fd.append("file", dataUrl);
  fd.append("upload_preset", uploadPreset);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: fd });
  if (!r.ok) throw new Error("อัปโหลดรูปไป Cloudinary ไม่สำเร็จ");
  return (await r.json()).secure_url;
}
export const cloudinaryEnabled = () => !!(APP_SETTINGS.cloudinary.cloudName && APP_SETTINGS.cloudinary.uploadPreset);
