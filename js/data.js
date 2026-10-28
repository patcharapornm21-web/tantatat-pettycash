// ชั้นข้อมูล Firestore ทั้งหมดอยู่ที่นี่ — ออกแบบให้ใช้ Read/Write น้อยที่สุด
//
//  meta/summary        1 เอกสาร เก็บยอดทั้ง 100 สาขา (ฟิลด์ระดับบนสุด = รหัสสาขา "001".."100")
//  branches/{id}       สำเนายอดของสาขาเดียว (พนักงานสาขาอ่านเฉพาะของตัวเอง) + ตัวนับเลขที่เอกสาร
//  requests/{id}       ใบเบิก (ไม่มีรูป เพื่อให้ Listener ของฝ่ายบัญชีเบา)
//  receipts/{id__n}    รูปใบเสร็จ Base64 ≤40KB ต่อรายการ (โหลดเฉพาะตอนเปิดดูรายละเอียด)
//  replenishments/{id} ประวัติการโอนเงินชดเชย
//  users/{uid}         โปรไฟล์ + สิทธิ์ (role, branchId, region, active)
import {
  db, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, limit, increment, serverTimestamp, writeBatch, runTransaction, arrayUnion,
} from "./fb.js";
import { makeDocNo, monthKey, round2, STATUS } from "./utils.js";
import { uploadToCloudinary, cloudinaryEnabled } from "./image.js";

export const summaryRef = () => doc(db, "meta", "summary");
export const branchRef = (id) => doc(db, "branches", id);
export const requestRef = (id) => doc(db, "requests", id);

const pad3 = (n) => String(n).padStart(3, "0");

// ------------------------------------------------------------------
//  Subscriptions (คืนค่า unsubscribe)
// ------------------------------------------------------------------
export const subSummary = (cb, err) =>
  onSnapshot(summaryRef(), (s) => cb(s.exists() ? s.data() : {}), err);

export const subBranch = (id, cb, err) =>
  onSnapshot(branchRef(id), (s) => cb(s.exists() ? { id, ...s.data() } : null), err);

export const subRegionBranches = (region, cb, err) =>
  onSnapshot(query(collection(db, "branches"), where("region", "==", region)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), err);

// ใบเบิกของสาขา เฉพาะเดือนที่เลือก (จำกัด 100 รายการ)
export const subBranchMonth = (branchId, month, cb, err) =>
  onSnapshot(query(collection(db, "requests"), where("branchId", "==", branchId), where("month", "==", month), limit(100)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), err);

// งานค้างของสาขาไม่ว่าเดือนไหน (รออนุมัติ/ถูกส่งกลับ)
export const subBranchOpen = (branchId, cb, err) =>
  onSnapshot(query(collection(db, "requests"), where("branchId", "==", branchId), where("status", "in", ["pending", "returned"]), limit(50)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), err);

// คิวรออนุมัติ (ฝ่ายบัญชี = ทุกสาขา, ผู้อนุมัติ = เฉพาะเขต) — ใช้ตรวจจับ "ใบใหม่" แบบ Real-time
export const subPending = (region, cb, err) => {
  const cons = [where("status", "==", "pending")];
  if (region) cons.unshift(where("region", "==", region));
  return onSnapshot(query(collection(db, "requests"), ...cons, limit(200)), (s) => {
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() })), s.docChanges().filter((c) => c.type === "added").map((c) => ({ id: c.doc.id, ...c.doc.data() })), s.metadata.hasPendingWrites);
  }, err);
};

// กิจกรรมล่าสุดทั้งระบบ (ฝ่ายบัญชี) 30 รายการ
export const subLatest = (cb, err, n = 30) =>
  onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(n)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), err);

export const subRequest = (id, cb, err) =>
  onSnapshot(requestRef(id), (s) => cb(s.exists() ? { id, ...s.data() } : null), err);

// ------------------------------------------------------------------
//  Seed / จัดการสาขา
// ------------------------------------------------------------------
/** สร้างสาขา 001..N (ข้ามสาขาที่มีอยู่แล้ว) — เขียน 1 summary + N branches ด้วย batch
 *  openFirst = เปิดใช้งานกี่สาขาแรก (สาขาที่ยังไม่เปิดจะเบิกไม่ได้/คนอื่นมองไม่เห็นจนกว่าบัญชีจะเปิด) */
export async function seedBranches({ count = 100, floatAmt = 5000, openFirst = 10, namePattern = "สาขา {n}" }) {
  const snap = await getDoc(summaryRef());
  const existing = snap.exists() ? snap.data() : {};
  const toAdd = {};
  for (let i = 1; i <= count; i++) {
    const id = pad3(i);
    if (existing[id]) continue;
    toAdd[id] = {
      id, name: namePattern.replace("{n}", id), abbr: "B" + id, region: "-",
      float: Number(floatAmt), balance: Number(floatAmt), pendingAmt: 0, pendingCnt: 0, open: i <= openFirst,
    };
  }
  const ids = Object.keys(toAdd);
  if (!ids.length) return { added: 0, skipped: count };
  const batch = writeBatch(db);
  batch.set(summaryRef(), toAdd, { merge: true });
  ids.forEach((id) => batch.set(branchRef(id), { ...toAdd[id], seq: {} }));
  await batch.commit();
  return { added: ids.length, skipped: count - ids.length };
}

/** แก้ข้อมูลสาขา — ถ้าเปลี่ยนวงเงินและติ๊ก adjustBalance จะปรับยอดคงเหลือตามส่วนต่างวงเงินด้วย */
export async function updateBranchInfo(id, { name, abbr, float, balance, open }, { adjustBalanceBy = 0 } = {}) {
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (abbr !== undefined) patch.abbr = abbr;
  if (float !== undefined) patch.float = Number(float);
  if (open !== undefined) patch.open = !!open;
  if (balance !== undefined && balance !== null && balance !== "" && !isNaN(Number(balance))) patch.balance = Number(balance);
  else if (adjustBalanceBy) patch.balance = increment(adjustBalanceBy);
  const batch = writeBatch(db);
  batch.update(branchRef(id), patch);
  batch.update(summaryRef(), Object.fromEntries(Object.entries(patch).map(([k, v]) => [`${id}.${k}`, v])));
  await batch.commit();
}

/** เปิด/ปิดสาขาหลายแห่งพร้อมกัน */
export async function setBranchesOpen(ids, open) {
  for (let i = 0; i < ids.length; i += 200) {
    const batch = writeBatch(db);
    ids.slice(i, i + 200).forEach((id) => {
      batch.update(branchRef(id), { open: !!open });
      batch.update(summaryRef(), { [`${id}.open`]: !!open });
    });
    await batch.commit();
  }
}

/** กำหนดสาขาให้ ROM (region = รหัสกลุ่มของ ROM คนนั้น) — ย้ายใบเบิกที่ยังค้างอยู่ตามไปด้วย */
export async function assignBranchRegions(changes /* [{id, region}] */) {
  for (const { id, region } of changes) {
    const open = await getDocs(query(collection(db, "requests"), where("branchId", "==", id), where("status", "in", ["pending", "returned"]), limit(100)));
    const ops = [];
    ops.push((b) => { b.update(branchRef(id), { region }); b.update(summaryRef(), { [`${id}.region`]: region }); });
    open.docs.forEach((d) => {
      ops.push((b) => b.update(d.ref, { region }));
      (d.data().items || []).forEach((it, i) => { if (it.hasReceipt) ops.push((b) => b.update(doc(db, "receipts", receiptId(d.id, i)), { region })); });
    });
    for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
  }
}

// ----- ตั้งค่าระบบ (meta/settings) -----
export const subSettings = (cb, err) => onSnapshot(doc(db, "meta", "settings"), (s) => cb(s.exists() ? s.data() : {}), err);
export const saveSettings = (data) => setDoc(doc(db, "meta", "settings"), data, { merge: true });

// ------------------------------------------------------------------
//  ใบเบิก
// ------------------------------------------------------------------
const receiptId = (reqId, i) => `${reqId}__${i}`;

export async function loadReceipts(req) {
  const out = {};
  await Promise.all((req.items || []).map(async (it, i) => {
    if (!it.hasReceipt) return;
    const s = await getDoc(doc(db, "receipts", receiptId(req.id, i)));
    if (s.exists()) out[i] = s.data().url || s.data().data;
  }));
  return out;
}

/**
 * ส่งใบเบิกใหม่ หรือ ส่งซ้ำหลังถูกตีกลับ (editReq)
 * form = { date, note, items:[{desc,category,qty,amount,receipt(dataURL|null)}] }
 */
export async function submitRequest(profile, branch, form, editReq = null, settings = null) {
  const items = form.items.map((it) => ({
    date: it.date, docType: it.docType, category: it.category, supplier: (it.supplier || "").trim(),
    requester: (it.requester || "").trim(), note: (it.note || "").trim(),
    amount: round2(it.amount), hasReceipt: !!it.receipt,
    ...(it.wht && it.wht.rate ? { wht: { rate: Number(it.wht.rate), before: round2(it.wht.before), amount: round2(it.wht.amount) } } : {}),
  }));
  const total = round2(items.reduce((s, i) => s + i.amount, 0));
  if (!items.length || total <= 0) throw new Error("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ และยอดรวมต้องมากกว่า 0");

  // เตรียมรูป (Cloudinary → เก็บ URL, ปกติเก็บ Base64) ก่อนเปิด Transaction
  const receiptPayload = [];
  for (let i = 0; i < form.items.length; i++) {
    const r = form.items[i].receipt;
    if (!r) { receiptPayload.push(null); continue; }
    if (r.startsWith("http") || !cloudinaryEnabled()) receiptPayload.push(r.startsWith("http") ? { url: r } : { data: r });
    else receiptPayload.push({ url: await uploadToCloudinary(r) });
  }

  if (editReq && !(form.editReason || "").trim()) throw new Error("กรุณาระบุเหตุผลที่แก้ไขเอกสาร");
  const bid = profile.branchId;
  const ym = editReq ? editReq.month : monthKey(form.date);
  const now = Date.now();

  return runTransaction(db, async (tx) => {
    const bSnap = await tx.get(branchRef(bid));
    if (!bSnap.exists()) throw new Error("ยังไม่มีข้อมูลสาขานี้ในระบบ กรุณาแจ้งฝ่ายบัญชีให้ Seed สาขาก่อน");
    const b = bSnap.data();
    if (b.open !== true) throw new Error("สาขานี้ยังไม่เปิดใช้งาน กรุณาติดต่อฝ่ายบัญชี");
    // ยอดที่ต้องหักเพิ่มจากยอดคงเหลือ: ใบใหม่/ใบที่ถูกคืนยอดแล้ว = ทั้งใบ, ใบที่หักไปแล้ว (รออนุมัติ/อนุมัติแล้ว) = เฉพาะส่วนต่าง
    let cur = null;
    if (editReq) {
      const cs = await tx.get(requestRef(editReq.id));
      if (!cs.exists()) throw new Error("ไม่พบใบเบิกนี้");
      cur = cs.data();
      if (!["pending", "returned", "approved"].includes(cur.status)) throw new Error("เอกสารนี้แก้ไขไม่ได้แล้ว (สถานะ: " + (STATUS[cur.status]?.label || cur.status) + ")");
    }
    const held = cur && cur.status !== "returned" ? cur.total : 0;
    const dDeduct = round2(total - held);
    if (settings && settings.allowNegative === false && dDeduct > 0 && (Number(b.balance) || 0) - dDeduct < 0) throw new Error("ยอดเบิกเกินยอดคงเหลือ และระบบตั้งค่าไม่อนุญาตให้ยอดติดลบ");

    let id, docNo;
    const dPend = cur ? (cur.status === "pending" ? total - cur.total : total) : total;
    const dCnt = cur && cur.status === "pending" ? 0 : 1;
    const bPatch = { pendingAmt: increment(dPend), pendingCnt: increment(dCnt), balance: increment(-dDeduct) }; // เบิก = หักยอดคงเหลือทันที
    if (editReq) {
      id = editReq.id; docNo = editReq.docNo;
    } else {
      const seq = ((b.seq || {})[ym] || 0) + 1;
      docNo = makeDocNo(b.abbr || "B" + bid, ym, seq);
      id = `${bid}_${ym.replace("-", "")}_${pad3(seq)}`;
      bPatch[`seq.${ym}`] = seq;
    }

    const history = [...(cur?.history || []), {
      action: editReq ? (cur.status === "returned" ? "resubmit" : "edited") : "submit", by: profile.name, role: "branch", at: now,
      comment: editReq ? form.editReason.trim() : "",
    }];
    const base = {
      docNo, branchId: bid, branchName: b.name, region: b.region, month: ym,
      date: form.date, note: (form.note || "").trim(),
      requesterUid: profile.uid, requesterName: profile.name,
      items, total, status: "pending", history, comment: "",
      createdAt: editReq ? editReq.createdAt : serverTimestamp(), updatedAt: now,
      requesterSig: profile.signature || "",
      ...(editReq ? { editCount: (cur.editCount || 0) + 1, lastEditReason: form.editReason.trim() } : {}),
    };
    tx.set(requestRef(id), base);

    receiptPayload.forEach((p, i) => {
      if (p) tx.set(doc(db, "receipts", receiptId(id, i)), { requestId: id, branchId: bid, region: b.region, ...p });
    });
    if (editReq) { // ลบรูปส่วนเกินของรายการที่ถูกลบออก
      for (let i = items.length; i < (editReq.items || []).length; i++)
        if (editReq.items[i].hasReceipt) tx.delete(doc(db, "receipts", receiptId(id, i)));
    }

    tx.update(branchRef(bid), bPatch);
    tx.update(summaryRef(), { [`${bid}.pendingAmt`]: increment(dPend), [`${bid}.pendingCnt`]: increment(dCnt), [`${bid}.balance`]: increment(-dDeduct) });
    return { id, docNo, total };
  });
}

/** สาขายกเลิกเอกสาร (เลขที่เอกสารยังคงอยู่ ไม่ถูกนำกลับมาใช้) — ต้องระบุเหตุผล */
export async function cancelRequest(reqId, reason, profile) {
  if (!reason?.trim()) throw new Error("กรุณาระบุเหตุผลที่ยกเลิกเอกสาร");
  return runTransaction(db, async (tx) => {
    const s = await tx.get(requestRef(reqId));
    if (!s.exists()) throw new Error("ไม่พบใบเบิกนี้");
    const r = s.data();
    if (r.branchId !== profile.branchId) throw new Error("ยกเลิกได้เฉพาะเอกสารของสาขาตัวเอง");
    if (!["pending", "returned", "approved"].includes(r.status)) throw new Error("เอกสารนี้ยกเลิกไม่ได้แล้ว (สถานะ: " + (STATUS[r.status]?.label || r.status) + ")");
    const now = Date.now();
    const history = [...(r.history || []), { action: "cancelled", by: profile.name, role: "branch", at: now, comment: reason.trim() }];
    tx.update(requestRef(reqId), { status: "cancelled", history, comment: reason.trim(), cancelReason: reason.trim(), decidedByName: profile.name, updatedAt: now });
    if (r.status !== "returned") { // คืนยอดที่หักไปแล้ว
      const bp = { balance: increment(r.total) };
      if (r.status === "pending") { bp.pendingAmt = increment(-r.total); bp.pendingCnt = increment(-1); }
      tx.update(branchRef(r.branchId), bp);
      tx.update(summaryRef(), Object.fromEntries(Object.entries(bp).map(([k, v]) => [`${r.branchId}.${k}`, v])));
    }
    return r;
  });
}

/** อนุมัติ / ปฏิเสธ / ตีกลับ — ตรวจสถานะซ้ำใน Transaction กันกดชนกัน */
export async function decideRequest(reqId, action, comment, profile) {
  if (!["approved", "rejected", "returned"].includes(action)) throw new Error("action ไม่ถูกต้อง");
  if (action !== "approved" && !comment?.trim()) throw new Error("กรุณาระบุเหตุผลเมื่อปฏิเสธหรือส่งกลับแก้ไข");
  return runTransaction(db, async (tx) => {
    const s = await tx.get(requestRef(reqId));
    if (!s.exists()) throw new Error("ไม่พบใบเบิกนี้");
    const r = s.data();
    if (r.status !== "pending") throw new Error("ใบเบิกนี้ถูกดำเนินการไปแล้ว (" + r.status + ")");
    const history = [...(r.history || []), { action, by: profile.name, role: profile.role, at: Date.now(), comment: comment || "" }];
    tx.update(requestRef(reqId), {
      status: action, history, comment: comment || "", decidedBy: profile.uid, decidedByName: profile.name,
      decidedAt: Date.now(), updatedAt: Date.now(),
      ...(action === "approved" ? { approverSig: profile.signature || "", approverName: profile.name } : {}),
    });
    const dBal = action === "approved" ? 0 : r.total; // อนุมัติ: ยอดหักไปแล้วตอนเบิก / ปฏิเสธ-ตีกลับ: คืนยอด
    const bp = { pendingAmt: increment(-r.total), pendingCnt: increment(-1) };
    if (dBal) bp.balance = increment(dBal);
    tx.update(branchRef(r.branchId), bp);
    tx.update(summaryRef(), Object.fromEntries(Object.entries(bp).map(([k, v]) => [`${r.branchId}.${k}`, v])));
    return r;
  });
}

// ------------------------------------------------------------------
//  โอนเงินชดเชย (Replenish)
// ------------------------------------------------------------------
export async function getApprovedUnpaid(branchId) {
  const s = await getDocs(query(collection(db, "requests"), where("branchId", "==", branchId), where("status", "==", "approved"), limit(400)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function replenish(branchId, amount, note, profile) {
  amount = round2(amount);
  if (!(amount > 0)) throw new Error("จำนวนเงินต้องมากกว่า 0");
  const unpaid = await getApprovedUnpaid(branchId);
  const replRef = doc(collection(db, "replenishments"));
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(replRef, {
    branchId, amount, note: note || "", by: profile.name, byUid: profile.uid, at: now,
    month: new Date(now).toISOString().slice(0, 7), requestIds: unpaid.map((u) => u.id),
  });
  batch.update(branchRef(branchId), { balance: increment(amount) });
  batch.update(summaryRef(), { [`${branchId}.balance`]: increment(amount), [`${branchId}.lastReplenishAt`]: now });
  unpaid.forEach((u) => batch.update(requestRef(u.id), {
    status: "replenished", replenishId: replRef.id, replenishedAt: now, updatedAt: now,
    history: arrayUnion({ action: "replenished", by: profile.name, role: "accounting", at: now, comment: `โอนชดเชย ${amount.toFixed(2)} บาท` }),
  }));
  await batch.commit();
  return { count: unpaid.length };
}

// ------------------------------------------------------------------
//  รายงาน / ล้างข้อมูลเก่า
// ------------------------------------------------------------------
/** ค้นหาใบเบิกด้วยตัวกรองแบบ equality (ไม่ต้องสร้าง Composite Index) — ไม่มีตัวกรอง = ล่าสุด N รายการ */
export async function queryRequests({ role, region, branchId, month, status, lim = 100 }) {
  const c = [];
  if (role === "branch") c.push(where("branchId", "==", branchId));
  else {
    if (role === "approver") c.push(where("region", "==", region));
    if (branchId) c.push(where("branchId", "==", branchId));
  }
  if (month) c.push(where("month", "==", month));
  if (status) c.push(where("status", "==", status));
  const q = c.length ? query(collection(db, "requests"), ...c, limit(lim)) : query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(lim));
  return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** โหลดใบเบิกตามช่วงเดือน — ประหยัด Read: ถ้าเลือกสาขา/เขต ใช้ equality แล้วกรองเดือนฝั่งเบราว์เซอร์ */
export async function fetchReportRequests({ role, region, branchId, fromMonth, toMonth }) {
  let q;
  if (role === "branch") q = query(collection(db, "requests"), where("branchId", "==", branchId), limit(1000));
  else if (role === "approver") q = branchId
    ? query(collection(db, "requests"), where("branchId", "==", branchId), limit(1000))
    : query(collection(db, "requests"), where("region", "==", region), limit(1500));
  else if (branchId) q = query(collection(db, "requests"), where("branchId", "==", branchId), limit(1000));
  else q = query(collection(db, "requests"), where("month", ">=", fromMonth), where("month", "<=", toMonth), limit(3000));
  const s = await getDocs(q);
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.month >= fromMonth && r.month <= toMonth);
}

/** ลบใบเบิก + รูปที่เกี่ยวข้อง (เฉพาะฝ่ายบัญชี) — แบ่ง batch ละ ≤ 450 operations */
export async function purgeRequests(reqs) {
  const refs = [];
  reqs.forEach((r) => {
    refs.push(requestRef(r.id));
    (r.items || []).forEach((it, i) => { if (it.hasReceipt) refs.push(doc(db, "receipts", receiptId(r.id, i))); });
  });
  for (let i = 0; i < refs.length; i += 450) {
    const b = writeBatch(db);
    refs.slice(i, i + 450).forEach((ref) => b.delete(ref));
    await b.commit();
  }
  return refs.length;
}

// ------------------------------------------------------------------
//  ผู้ใช้
// ------------------------------------------------------------------
export const getProfile = async (uid) => {
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { uid, ...s.data() } : null;
};
export const listUsers = async () =>
  (await getDocs(query(collection(db, "users"), limit(300)))).docs.map((d) => ({ uid: d.id, ...d.data() }));
export const saveMySignature = (uid, signature) => setDoc(doc(db, "users", uid), { signature, signatureAt: Date.now() }, { merge: true });
export const saveProfile = (uid, data) => setDoc(doc(db, "users", uid), data, { merge: true });
export const bootstrapAvailable = async () => !(await getDoc(doc(db, "meta", "bootstrap"))).exists();
export async function bootstrapAdmin(uid, email, name) {
  const b = writeBatch(db);
  b.set(doc(db, "users", uid), { email, name, role: "accounting", active: true, createdAt: Date.now() });
  b.set(doc(db, "meta", "bootstrap"), { by: uid, at: Date.now() });
  await b.commit();
}
export { serverTimestamp };
