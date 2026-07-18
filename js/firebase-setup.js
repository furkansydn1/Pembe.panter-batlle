// ============================================================
// FIREBASE KURULUMU
// Kendi Firebase projenin config bilgilerini buraya yapıştır.
// Firebase Console > Project Settings > General > Your apps > SDK setup and configuration
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  collection, onSnapshot, query, orderBy, limit, where, serverTimestamp,
  runTransaction, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCNAFsA3hiXwUJYu-KuNelIp-kIiaYjlsc",
  authDomain: "pembe-panter-battle.firebaseapp.com",
  projectId: "pembe-panter-battle",
  storageBucket: "pembe-panter-battle.firebasestorage.app",
  messagingSenderId: "403593143901",
  appId: "1:403593143901:web:93cc90857f3ebc47498fb4"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const PLAYERS_COL = "players";
export const LOG_COL = "battleLog";
// V2 Faz 4 (madde 4/5): Oyuncular Arası Pazar — players ile aynı seviyede,
// top-level iki yeni koleksiyon. Detaylar için "OYUNCULAR ARASI PAZAR" bloğuna bak.
export const MARKET_LISTINGS_COL = "marketListings";
export const TRADE_LOGS_COL = "tradeLogs";
export const MAX_PLAYERS = 10;

// Diğer modüllerin kullanması için Firestore fonksiyonlarını yeniden export et
export { initializeApp, getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, onSnapshot, query, orderBy, limit, where, serverTimestamp, runTransaction, writeBatch };

