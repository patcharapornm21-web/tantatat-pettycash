// รวมการนำเข้า Firebase v10 (Modular SDK ผ่าน CDN) ไว้ที่เดียว
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, sendPasswordResetEmail, deleteUser,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, increment, serverTimestamp,
  writeBatch, runTransaction, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// แอปตัวที่สอง ใช้ตอนฝ่ายบัญชีสร้างผู้ใช้ใหม่ (เพื่อไม่ให้ตัวเอง Sign-out)
let _secAuth = null;
export function secondaryAuth() {
  if (!_secAuth) _secAuth = getAuth(initializeApp(firebaseConfig, "secondary"));
  return _secAuth;
}

export {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, sendPasswordResetEmail, deleteUser,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, increment, serverTimestamp,
  writeBatch, runTransaction, arrayUnion,
};
