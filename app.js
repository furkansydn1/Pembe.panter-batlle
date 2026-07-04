// ============================================================
// FIREBASE KURULUMU
// Kendi Firebase projenin config bilgilerini buraya yapıştır.
// Firebase Console > Project Settings > General > Your apps > SDK setup and configuration
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  collection, onSnapshot, query, orderBy, limit, serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCNAFsA3hiXwUJYu-KuNelIp-kIiaYjlsc",
  authDomain: "pembe-panter-battle.firebaseapp.com",
  projectId: "pembe-panter-battle",
  storageBucket: "pembe-panter-battle.firebasestorage.app",
  messagingSenderId: "403593143901",
  appId: "1:403593143901:web:93cc90857f3ebc47498fb4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const PLAYERS_COL = "players";
const LOG_COL = "battleLog";
const MAX_PLAYERS = 7;
const BASE_ATTACK = 10;
const BASE_DEFENSE = 10;
const ATTACK_COOLDOWN_MS = 1 * 60 * 60 * 1000;       // 1 saatte 1 saldırı
// Saldırı hakları artık herkes için AYNI, saat başına hizalanmış (senkron) pencerelerde açılır
// (örn. 14:00-14:59, 15:00-15:59...). Kişisel "son saldırıdan bu yana geçen süre" YERİNE
// global pencere index'i kullanılır: bir oyuncu o pencerede saldırmazsa hakkı kaybolur,
// bir sonraki saat başına kadar beklemesi gerekir. Böylece kimse "geç giriş yaparak"
// hakkını sonraya taşıyamaz, herkesin saldırı saati birebir aynı olur.
function getAttackWindowIndex(t = Date.now()) {
  return Math.floor(t / ATTACK_COOLDOWN_MS);
}
const BOX_COOLDOWN_MS = 4 * 60 * 60 * 1000;          // 4 saatte 1 kutu

// Enerji sistemi: kutu/savaş beklerken oynanacak, cooldown'u olmayan dolgu aktivite.
// Ana ekonomiye (gerçek eşya düşürme) dokunmaz, sadece toz ekonomisini besler.
const ENERGY_MAX = 100;
const ENERGY_REGEN_MS_PER_POINT = 3 * 60 * 1000; // her 3 dakikada +1 enerji

// Enerji harcanan "görevler": tek bir jenerik buton yerine, farklı isim/maliyet/ödüle
// sahip görev kartları. Zorluk arttıkça toz/enerji oranı hafifçe iyileşiyor (sabır
// ödüllendiriliyor) ama enerji 100 ile sınırlı olduğu için ekonomi bozulmuyor, herkes
// hızlıca her şeye sahip olamıyor.
const ENERGY_TASKS = [
  { id: "gasp", name: "Gasp Et", icon: "👛", cost: 10, dustMin: 1, dustMax: 3, bonusChance: 0.08, bonusDust: 6 },
  { id: "zorbala", name: "Arkadaşını Zorbala", icon: "😈", cost: 20, dustMin: 3, dustMax: 5, bonusChance: 0.08, bonusDust: 8 },
  { id: "kafautule", name: "Hafız Döv", icon: "🗣️", cost: 35, dustMin: 6, dustMax: 9, bonusChance: 0.10, bonusDust: 12 },
  { id: "manipule", name: "Umumi Mastürbasyon", icon: "🕶️", cost: 50, dustMin: 9, dustMax: 13, bonusChance: 0.12, bonusDust: 18 }
];

// Temel şans oranları (yüzde). Nadir %9, Efsanevi %3.
const BASE_LEGENDARY_CHANCE = 3;
const BASE_RARE_CHANCE = 9;

// Pity (şans telafisi) eşikleri: uzun süre efsanevi/nadir çıkmayana şansı yavaşça artar,
// belli bir noktadan sonra garanti verir.
const RARE_PITY_SOFT_START = 8;    // 8 kutudan sonra nadir şansı artmaya başlar
const RARE_PITY_HARD = 15;         // 15 kutudur nadir yoksa garanti nadir
const LEGENDARY_PITY_SOFT_START = 15; // 15 kutudan sonra efsanevi şansı artmaya başlar
const LEGENDARY_PITY_HARD = 40;       // 40 kutudur efsanevi yoksa garanti efsanevi

// Toz (dust) ekonomisi: eski eşya yeni eşyayla değişince nadirliğine göre toz kazanılır.
const DUST_FROM_RARITY = { standart: 1, nadir: 3, efsanevi: 8 };
const DUST_COST_RARE_BOX = 18;
const DUST_COST_LEGENDARY_BOX = 55;

// Savaşta ezici stat üstünlüğü (bu kat kadar fazla güç) varsa şansa bakılmaksızın kazanılır.
const DOMINANCE_RATIO = 1.5;

// ============================================================
// GÜNLÜK GÖREVLER
// Her gün, her oyuncuya 3 rastgele görev atanır (1'i her zaman "giriş yap").
// Zorluğa göre ödül (toz + puan + nadir eşya şansı) ölçekleniyor. Dengeyi
// korumak için "zor" görevler bile tek başına ekonomiyi patlatmayacak
// ölçüde ödül veriyor.
// ============================================================
const QUEST_TIER_REWARDS = {
  kolay: { dustMin: 1, dustMax: 2, pointsMin: 1, pointsMax: 2, itemChance: 0 },
  orta: { dustMin: 4, dustMax: 7, pointsMin: 3, pointsMax: 5, itemChance: 0.2 },
  zor: { dustMin: 9, dustMax: 14, pointsMin: 6, pointsMax: 10, itemChance: 1 }
};
const QUEST_TIER_LABELS = { kolay: "Kolay", orta: "Orta", zor: "Zor" };

const QUEST_TEMPLATES = [
  { type: "login", tier: "kolay", icon: "👋", label: "Bugün giriş yap", target: 1, autoComplete: true },
  { type: "open_box", tier: "kolay", icon: "📦", target: 1, label: (t) => `${t} kutu aç` },
  { type: "open_box", tier: "orta", icon: "📦", target: 3, label: (t) => `${t} kutu aç` },
  { type: "open_box", tier: "zor", icon: "📦", target: 5, label: (t) => `${t} kutu aç` },
  { type: "attack_count", tier: "kolay", icon: "⚔️", target: 1, label: (t) => `${t} savaşa gir` },
  { type: "attack_count", tier: "orta", icon: "⚔️", target: 2, label: (t) => `${t} savaşa gir` },
  { type: "battle_win", tier: "orta", icon: "🏆", target: 1, label: (t) => `${t} savaş kazan` },
  { type: "battle_win", tier: "zor", icon: "🏆", target: 2, label: (t) => `${t} savaş kazan` },
  { type: "energy_task", tier: "kolay", icon: "⚡", target: 1, label: (t) => `${t} kez enerji görevi yap` },
  { type: "energy_task", tier: "orta", icon: "⚡", target: 3, label: (t) => `${t} kez enerji görevi yap` },
  { type: "defeat_player", tier: "zor", icon: "🎯", target: 1, label: null }
];

// ============================================================
// EŞYA VERİLERİ
// ============================================================
const SLOTS = [
  { key: "kask", label: "Kask", icon: "⛑️", type: "def" },
  { key: "zirh", label: "Zırh", icon: "🛡️", type: "def" },
  { key: "kilic", label: "Kılıç", icon: "🗡️", type: "atk" },
  { key: "eldiven", label: "Eldiven", icon: "🧤", type: "atk" },
  { key: "ayakkabi", label: "Ayakkabı", icon: "👢", type: "def" }
];
const SLOT_MAP = Object.fromEntries(SLOTS.map(s => [s.key, s]));

const STANDARD_NAMES = {
  kask: ["Paslı Miğfer", "Deri Başlık", "Çatlak Tolga", "Yamalı Külah", "Bakır Serpuş",
    "Kirli Bandana", "Yün Bere", "Naylon Kasket", "Çorap Şapka", "Ters Takılmış Kova",
    "Delik Fötr", "Eski Bisiklet Kaskı"],
  zirh: ["Yırtık Cübbe", "Kalın Yelek", "Pamuklu Zırh", "Eski Post", "Keçe Cepken",
    "Yamalı Anorak", "Naylon Yağmurluk", "Kirli Önlük", "Kalın Kazak", "Eski Ceket",
    "Softa Cübbesi", "İşçi Tulumu"],
  kilic: ["Paslı Kama", "Kırık Pala", "Tahta Kılıç", "Mutfak Bıçağı", "Eğri Meç",
    "Ekmek Bıçağı", "Plastik Kılıç", "Jilet Uçlu Çubuk", "Paslı Testere", "Sopa",
    "Şiş", "Çakı"],
  eldiven: ["Yün Eldiven", "Deri Eldiven", "Yamalı Eldiven", "Boks Eldiveni", "Bahçıvan Eldiveni",
    "Fırın Eldiveni", "Bulaşık Eldiveni", "Tek Parmaksız Eldiven", "Kirli İş Eldiveni", "Naylon Eldiven",
    "Kayak Eldiveni", "Motosiklet Eldiveni"],
  ayakkabi: ["Eski Terlik", "Delik Çorap", "Lastik Ayakkabı", "Plastik Sandalet", "Keçi Postu Çarık",
    "Yırtık Spor Ayakkabı", "Ters Giyilmiş Terlik", "Naylon Galoş", "Eski Bot", "Tek Tekli Ayakkabı",
    "Islak Çorap", "Plastik Crocs"]
};
const RARE_NAMES = {
  kask: ["Gümüş Miğfer", "Ejder Kafatası Kaskı", "Buz Tacı", "Kartal Kaskı", "Meteor Miğferi", "Gölge Külahı"],
  zirh: ["Çelik Zırh", "Ejder Pulu Zırhı", "Gölge Cübbesi", "Meteor Plakası", "Buz Zırhı", "Kurt Postu Zırhı"],
  kilic: ["Ateş Kılıcı", "Buz Kılıcı", "Şimşek Pala", "Kan İçen Meç", "Gölge Bıçağı", "Ejder Dişi Kılıcı"],
  eldiven: ["Demir Pençe", "Kadife Eldiven", "Zehir Eldiveni", "Fırtına Pençesi", "Örümcek Eldiveni", "Alev Eldiveni"],
  ayakkabi: ["Rüzgar Botları", "Çelik Nalın", "Gölge Ayakkabıları", "Kum Fırtınası Çarığı", "Buz Patenleri", "Şimşek Çizmeleri"]
};

// Efsanevi eşyalar - her birinin gerçek oyun içi pasif etkisi var (effect kodu ile).
const LEGENDARY_ITEMS = [
  { name: "Yasin ercile zırhı", slot: "zirh", atk: 4, def: 26, effect: "no_loss_on_defense_lose",
    desc: "Savunmadayken maçı kaybetse bile puanı asla düşmez." },
  { name: "Portakal suyu kılıcı", slot: "kilic", atk: 27, def: 3, effect: "steal_extra_on_big_win",
    desc: "Saldırıda 5'ten fazla güç farkıyla kazanırsa rakipten ekstra 2 puan çalar." },
  { name: "Çingene eldiveni", slot: "eldiven", atk: 25, def: 5, effect: "curse_defense_next",
    desc: "Saldırıda kazanırsa rakibe lanet okur: rakibin bir sonraki savaşında savunması %20 düşer." },
  { name: "Cüce botları", slot: "ayakkabi", atk: 3, def: 24, effect: "revenge_steal",
    desc: "Savunmada kaybetse bile intikam alır, saldırandan 3 puan çalar." },
  { name: "Dana kaskı", slot: "kask", atk: 4, def: 25, effect: "bonus_win_defense",
    desc: "Savunmada kazanırsa normal ödülün üstüne 5 puan daha kazanır." },
  { name: "Sarı diş kılıcı", slot: "kilic", atk: 26, def: 4, effect: "crit_instant_win",
    desc: "Saldırıda %10 ihtimalle güç hesabına bakmadan anında ısırıp kazanır." },
  { name: "Kambur zırhı", slot: "zirh", atk: 3, def: 23, effect: "defense_multiplier",
    desc: "Savunma gücü hesaplamasında %15 fazladan bonus verir." },
  { name: "Yırtık menüsküs ayakkabıları", slot: "ayakkabi", atk: 2, def: 22, effect: "reduced_loss",
    desc: "Savunmada kaybederse sadece 2 puan kaybeder, 5 değil." },
  { name: "Kıl dönmesi kılıcı", slot: "kilic", atk: 24, def: 5, effect: "attack_multiplier",
    desc: "Saldırı gücü hesaplamasında %15 fazladan bonus verir." },
  { name: "Nargile kılıcı", slot: "kilic", atk: 22, def: 6, effect: "chill_risk",
    desc: "Kazanırsa 3 puan fazladan alır, ama %20 ihtimalle nargile keyfine dalıp bu sefer saldıramaz." },
  { name: "Yeşil kaş Kaskı", slot: "kask", atk: 3, def: 24, effect: "lucky_defense_roll",
    desc: "Savunmadayken zar atışı 2 katı sayılır, şansı yaver gider." },
  { name: "Karanın Airpodsları Kaskı", slot: "kask", atk: 4, def: 24, effect: "revenge_steal",
    desc: "Savunmada kaybetse bile taş çatlasa saldırandan 3 puan çalar." },
  { name: "Götün zırhı", slot: "zirh", atk: 3, def: 25, effect: "no_loss_on_defense_lose",
    desc: "Savunmadayken maçı kaybetse bile puanı asla düşmez." },
  { name: "Harput ayakkabıları", slot: "ayakkabi", atk: 2, def: 23, effect: "lucky_defense_roll",
    desc: "Yavaş ama sağlam: savunmadayken zar atışı 2 katı sayılır." },
  { name: "Emrenin yamuk parmak eldiveni", slot: "eldiven", atk: 25, def: 4, effect: "attack_multiplier",
    desc: "Saldırı gücü hesaplamasında %15 fazladan bonus verir." },
  { name: "Gay eldiveni", slot: "eldiven", atk: 21, def: 6, effect: "chill_risk",
    desc: "Kazanırsa 3 puan fazladan alır, ama %20 ihtimalle o seferki saldırıyı pas geçer." }
];
const LEGENDARY_BY_SLOT = LEGENDARY_ITEMS.reduce((acc, it) => {
  (acc[it.slot] ||= []).push(it);
  return acc;
}, {});

// Koleksiyon kitabı için: her slotun tüm olası eşyaları (nadirlik etiketiyle birlikte)
const ALL_ITEMS_BY_SLOT = Object.fromEntries(SLOTS.map(s => {
  const items = [
    ...STANDARD_NAMES[s.key].map(name => ({ name, rarity: "standart" })),
    ...RARE_NAMES[s.key].map(name => ({ name, rarity: "nadir" })),
    ...(LEGENDARY_BY_SLOT[s.key] || []).map(it => ({ name: it.name, rarity: "efsanevi" }))
  ];
  return [s.key, items];
}));
const TOTAL_ITEM_COUNT = Object.values(ALL_ITEMS_BY_SLOT).reduce((sum, arr) => sum + arr.length, 0);

// ============================================================
// GÜNÜN OLAYI
// Her gün (tarihe göre deterministik, sunucuya ihtiyaç duymadan) tüm
// oyuncuları aynı anda etkileyen bir buff/nerf/nötr olay seçilir.
// ============================================================
const DAILY_EVENTS = [
  { id: "lucky", icon: "🍀", type: "buff", title: "Şanslı Gün",
    desc: "Bugün nadir ve efsanevi eşya düşme ihtimali %50 daha yüksek.",
    legendaryChanceMult: 1.5, rareChanceMult: 1.5, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, dustMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "dry", icon: "🌪️", type: "nerf", title: "Kurak Gün",
    desc: "Bugün nadir ve efsanevi eşya düşme ihtimali %30 daha düşük.",
    legendaryChanceMult: 0.7, rareChanceMult: 0.7, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, dustMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "war", icon: "⚔️", type: "buff", title: "Savaş Çılgınlığı",
    desc: "Bugün kazanılan tüm savaş puanları %50 fazla veriliyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1.5, attackMult: 1, defenseMult: 1, varianceMult: 1, dustMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "fragile_armor", icon: "🛡️", type: "nerf", title: "Kırık Zırh Günü",
    desc: "Bugün tüm savunma güçleri hesaplamada %15 zayıf sayılıyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 0.85, varianceMult: 1, dustMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "power_surge", icon: "💪", type: "buff", title: "Güç Günü",
    desc: "Bugün tüm saldırı güçleri hesaplamada %15 fazla sayılıyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1.15, defenseMult: 1, varianceMult: 1, dustMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "dust_storm", icon: "✨", type: "buff", title: "Toz Fırtınası",
    desc: "Bugün eşyaları toza çevirdiğinde 2 kat toz kazanıyorsun.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, dustMult: 2, boxCooldownMult: 1, pityMult: 1 },
  { id: "precision", icon: "🎯", type: "buff", title: "Kesinlik Günü",
    desc: "Bugün savaşta şansın etkisi azaldı, statlar her zamankinden daha belirleyici.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 0.4, dustMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "chaos", icon: "🌀", type: "nerf", title: "Kaos Günü",
    desc: "Bugün savaşta şansın etkisi arttı, sürprizlere açık ol.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 2, dustMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "slow_boxes", icon: "😴", type: "nerf", title: "Tembellik Günü",
    desc: "Bugün kutu açma süresi 4 yerine 6 saat.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, dustMult: 1, boxCooldownMult: 1.5, pityMult: 1 },
  { id: "fast_boxes", icon: "⚡", type: "buff", title: "Hız Günü",
    desc: "Bugün kutu açma süresi 4 yerine 3 saat.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, dustMult: 1, boxCooldownMult: 0.75, pityMult: 1 },
  { id: "compensation", icon: "🍀", type: "buff", title: "Telafi Günü",
    desc: "Bugün şanssızlık telafisi (pity) 2 kat hızlı birikiyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, dustMult: 1, boxCooldownMult: 1, pityMult: 2 },
  { id: "calm", icon: "🌤️", type: "neutral", title: "Sakin Gün",
    desc: "Bugün özel bir etki yok, her şey normal seyrinde.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, dustMult: 1, boxCooldownMult: 1, pityMult: 1 }
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}
function getTodaysEvent() {
  const idx = hashString(dateStr()) % DAILY_EVENTS.length;
  return DAILY_EVENTS[idx];
}
function getEffectiveBoxCooldown() {
  return BOX_COOLDOWN_MS * (getTodaysEvent().boxCooldownMult || 1);
}

// ============================================================
// GİZEMLİ YABANCI
// ============================================================
const STRANGER_NAMES = [
  "Mahmut Demirgan", "Cemal", "Kara", "İnce Yusuf", "Lahit Memet",
  "Harput Ayakkabının Sahibi", "Hasan", "Yusuf Durmuş", "Abdulgafur", "Kenanpo"
];
const STRANGER_APPEAR_CHANCE = 0.18;
const STRANGER_DUST_REWARD = 10;

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function genItemId() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// Pity'li şans hesabı: pityRare/pityLegendary = son nadir/efsanevi'den beri kaç kutu açıldı.
function rollRarity(pityRare, pityLegendary, event) {
  if (pityLegendary >= LEGENDARY_PITY_HARD) return "efsanevi";
  if (pityRare >= RARE_PITY_HARD) return "nadir";

  const legChance = (BASE_LEGENDARY_CHANCE + Math.max(0, pityLegendary - LEGENDARY_PITY_SOFT_START) * 0.4) * event.legendaryChanceMult;
  const rareChance = (BASE_RARE_CHANCE + Math.max(0, pityRare - RARE_PITY_SOFT_START) * 1) * event.rareChanceMult;

  const r = Math.random() * 100;
  if (r < legChance) return "efsanevi";
  if (r < legChance + rareChance) return "nadir";
  return "standart";
}

// Aynı slotun (örn. hep Kılıç) üst üste çıkmasını engelleyen ağırlıklı slot seçimi.
function pickSlotWeighted(recentSlots) {
  const keys = SLOTS.map(s => s.key);
  const last3 = recentSlots.slice(-3);

  // Sert kural: son 3 kutuda da aynı slot çıktıysa bu sefer kesin farklı bir slot seç.
  let candidates = keys;
  if (last3.length === 3 && last3.every(s => s === last3[0])) {
    candidates = keys.filter(k => k !== last3[0]);
  }

  // Yumuşak kural: son 6 kutuda ne kadar sık çıktıysa ağırlığı o kadar düşsün.
  const recent6 = recentSlots.slice(-6);
  const weights = candidates.map(key => {
    const count = recent6.filter(s => s === key).length;
    return Math.max(0.15, 1 - count * 0.25);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// Nadir eşyalarda ana stat artık sabit bir aralıkta düz rastgele değil: belirlenen
// alt/üst sınır (8-18) arasında, ÜST SINIRI (max) yakalama ihtimali kasıtlı olarak
// düşük tutuluyor (~%20). Geri kalan %80'lik zamanda min ile max-1 arasında bir
// değer düşüyor. Böylece aynı nadir eşya bile her kutuda aynı gücü vermiyor, ve
// en güçlü versiyonunu yakalamak gerçekten şanslı bir an oluyor.
const RARE_STAT_MIN = 8;
const RARE_STAT_MAX = 18;
const RARE_STAT_MAX_CHANCE = 0.20;
function rollRareStat() {
  if (Math.random() < RARE_STAT_MAX_CHANCE) return RARE_STAT_MAX;
  return randInt(RARE_STAT_MIN, RARE_STAT_MAX - 1);
}

function generateLootItemForRarity(slot, rarity) {
  const slotInfo = SLOT_MAP[slot];
  const id = genItemId();

  if (rarity === "efsanevi") {
    const options = LEGENDARY_BY_SLOT[slot];
    const base = pick(options);
    return {
      id, name: base.name, slot, rarity,
      atk: base.atk, def: base.def,
      effect: base.effect, effectDesc: base.desc
    };
  }

  if (rarity === "nadir") {
    const name = pick(RARE_NAMES[slot]);
    const primary = rollRareStat();
    const secondary = randInt(1, 4);
    return {
      id, name, slot, rarity,
      atk: slotInfo.type === "atk" ? primary : secondary,
      def: slotInfo.type === "def" ? primary : secondary,
      effect: null, effectDesc: null
    };
  }

  // standart
  const name = pick(STANDARD_NAMES[slot]);
  const primary = randInt(3, 8);
  const secondary = randInt(0, 2);
  return {
    id, name, slot, rarity,
    atk: slotInfo.type === "atk" ? primary : secondary,
    def: slotInfo.type === "def" ? primary : secondary,
    effect: null, effectDesc: null
  };
}

function computeStatsFromEquipment(equipment) {
  let atk = BASE_ATTACK, def = BASE_DEFENSE;
  for (const s of SLOTS) {
    const item = equipment?.[s.key];
    if (item) { atk += item.atk || 0; def += item.def || 0; }
  }
  return { attack: atk, defense: def };
}

function dateStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isConsecutiveDay(prevStr, currStr) {
  if (!prevStr) return false;
  const prev = new Date(prevStr + "T00:00:00");
  const curr = new Date(currStr + "T00:00:00");
  return Math.round((curr - prev) / 86400000) === 1;
}
function formatRemaining(ms) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} sa ${m} dk`;
  return `${m} dk`;
}

function emptyEquipment() {
  return { kask: null, zirh: null, kilic: null, eldiven: null, ayakkabi: null };
}

// ============================================================
// STATE
// ============================================================
let currentPlayerId = localStorage.getItem("gacha_player_id") || null;
let currentPlayerData = null;
let allPlayers = [];

// ============================================================
// DOM
// ============================================================
const loginScreen = document.getElementById("loginScreen");
const gameScreen = document.getElementById("gameScreen");
const playerListLogin = document.getElementById("playerListLogin");
const newPlayerBox = document.getElementById("newPlayerBox");
const newPlayerName = document.getElementById("newPlayerName");
const newPlayerPin = document.getElementById("newPlayerPin");
const newPlayerBtn = document.getElementById("newPlayerBtn");
const loginError = document.getElementById("loginError");

const pinModal = document.getElementById("pinModal");
const pinModalTitle = document.getElementById("pinModalTitle");
const pinInput = document.getElementById("pinInput");
const pinError = document.getElementById("pinError");
const pinCancelBtn = document.getElementById("pinCancelBtn");
const pinConfirmBtn = document.getElementById("pinConfirmBtn");

const tutorialModal = document.getElementById("tutorialModal");
const legendaryShowcase = document.getElementById("legendaryShowcase");
const closeTutorialBtn = document.getElementById("closeTutorialBtn");
const howToBtn = document.getElementById("howToBtn");
const switchPlayerBtn = document.getElementById("switchPlayerBtn");

const updatesBtn = document.getElementById("updatesBtn");
const updatesDot = document.getElementById("updatesDot");
const updatesModal = document.getElementById("updatesModal");
const updatesList = document.getElementById("updatesList");
const closeUpdatesBtn = document.getElementById("closeUpdatesBtn");

const collectionBtn = document.getElementById("collectionBtn");
const collectionModal = document.getElementById("collectionModal");
const collectionList = document.getElementById("collectionList");
const collectionProgress = document.getElementById("collectionProgress");
const closeCollectionBtn = document.getElementById("closeCollectionBtn");

const inventoryModal = document.getElementById("inventoryModal");
const inventoryModalTitle = document.getElementById("inventoryModalTitle");
const inventoryList = document.getElementById("inventoryList");
const closeInventoryBtn = document.getElementById("closeInventoryBtn");

const viewEquipmentModal = document.getElementById("viewEquipmentModal");
const viewEquipmentTitle = document.getElementById("viewEquipmentTitle");
const viewEquipmentGrid = document.getElementById("viewEquipmentGrid");
const closeViewEquipmentBtn = document.getElementById("closeViewEquipmentBtn");

const dailyEventBanner = document.getElementById("dailyEventBanner");
const strangerBanner = document.getElementById("strangerBanner");
const strangerNameEl = document.getElementById("strangerName");
const strangerDuelBtn = document.getElementById("strangerDuelBtn");

const currentPlayerNameEl = document.getElementById("currentPlayerName");
const leaderboardEl = document.getElementById("leaderboard");
const equipmentGridEl = document.getElementById("equipmentGrid");
const myAttackEl = document.getElementById("myAttack");
const myDefenseEl = document.getElementById("myDefense");
const myPointsEl = document.getElementById("myPoints");
const myDustEl = document.getElementById("myDust");
const myStreakEl = document.getElementById("myStreak");
const streakChip = document.getElementById("streakChip");

const lootBox = document.getElementById("lootBox");
const boxWrapper = document.getElementById("boxWrapper");
const openBoxBtn = document.getElementById("openBoxBtn");
const boxStatus = document.getElementById("boxStatus");
const itemPopup = document.getElementById("itemPopup");
const itemPopupInner = document.getElementById("itemPopupInner");
const guaranteeRareBtn = document.getElementById("guaranteeRareBtn");
const guaranteeLegendaryBtn = document.getElementById("guaranteeLegendaryBtn");

const energyBarFill = document.getElementById("energyBarFill");
const energyStatus = document.getElementById("energyStatus");
const energyTasksRow = document.getElementById("energyTasksRow");

const attackTargetsEl = document.getElementById("attackTargets");
const attackStatus = document.getElementById("attackStatus");

const questsListEl = document.getElementById("questsList");

const resultModal = document.getElementById("resultModal");
const resultContent = document.getElementById("resultContent");
const closeResultBtn = document.getElementById("closeResultBtn");

const battleLogEl = document.getElementById("battleLog");

// ============================================================
// TUTORIAL (yana kaydırmalı carousel)
// ============================================================
const tutorialTrack = document.getElementById("tutorialTrack");
const tutorialDots = document.getElementById("tutorialDots");
const tutPrevBtn = document.getElementById("tutPrevBtn");
const tutNextBtn = document.getElementById("tutNextBtn");

function renderLegendaryShowcase() {
  legendaryShowcase.innerHTML = LEGENDARY_ITEMS.map(it => `
    <div class="legend-card">
      <div class="legend-icon">${SLOT_MAP[it.slot].icon}</div>
      <div class="legend-body">
        <div class="legend-name">${it.name}</div>
        <div class="legend-passive">✨ ${it.desc}</div>
      </div>
    </div>
  `).join("");
}

function buildTutorialDots() {
  const slideCount = tutorialTrack.children.length;
  tutorialDots.innerHTML = "";
  for (let i = 0; i < slideCount; i++) {
    const dot = document.createElement("button");
    dot.className = "tut-dot" + (i === 0 ? " active" : "");
    dot.onclick = () => goToTutorialSlide(i);
    tutorialDots.appendChild(dot);
  }
}

function currentTutorialIndex() {
  return Math.round(tutorialTrack.scrollLeft / tutorialTrack.clientWidth);
}

function goToTutorialSlide(i) {
  const slideCount = tutorialTrack.children.length;
  const clamped = Math.max(0, Math.min(slideCount - 1, i));
  tutorialTrack.scrollTo({ left: clamped * tutorialTrack.clientWidth, behavior: "smooth" });
}

tutorialTrack.addEventListener("scroll", () => {
  const idx = currentTutorialIndex();
  [...tutorialDots.children].forEach((d, i) => d.classList.toggle("active", i === idx));
});
tutPrevBtn.onclick = () => goToTutorialSlide(currentTutorialIndex() - 1);
tutNextBtn.onclick = () => goToTutorialSlide(currentTutorialIndex() + 1);

function maybeShowTutorial() {
  if (!localStorage.getItem("gacha_tutorial_seen")) {
    openTutorial();
  }
}
function openTutorial() {
  renderLegendaryShowcase();
  buildTutorialDots();
  tutorialModal.classList.remove("hidden");
  // Modal ilk kez görünür olduğunda scrollLeft/clientWidth doğru okunsun diye ufak bir gecikme
  requestAnimationFrame(() => { tutorialTrack.scrollLeft = 0; });
}
closeTutorialBtn.onclick = () => {
  localStorage.setItem("gacha_tutorial_seen", "1");
  tutorialModal.classList.add("hidden");
};
howToBtn.onclick = () => openTutorial();

// ============================================================
// YENİLİKLER / YOL HARİTASI
// Her yeni özellik bittiğinde status'u "soon" -> "done" yapıp
// LATEST_UPDATE_VERSION'ı artırman yeterli, rozet otomatik güncellenir.
// ============================================================
const LATEST_UPDATE_VERSION = "1.7";

const RELEASES = [
  {
    version: "1.7",
    date: "4 Temmuz 2026",
    items: [
      "Saldırı sistemi tamamen senkron hale getirildi: saldırı hakkı artık 'son saldırından bu yana X saat' mantığıyla değil, herkes için birebir aynı, saat başına hizalanmış pencerelerle çalışıyor (örn. 14:00-14:59, 15:00-15:59). O saatlik pencerede saldırmazsan hakkın kaybolur ve bir sonraki saat başına kadar beklersin; kimse geç giriş yaparak hakkını sonraya taşıyamaz. Ayrıca saldırı bekleme süresi 2 saatten 1 saate düşürüldü, yani artık günde çok daha fazla saldırı hakkı var.",
      "Enerji yenilenme hızı 5 dakikada +1'den 3 dakikada +1'e çıkarıldı, enerji dolum süresi kısaldı.",
      "Nadir ve Efsanevi eşya düşme ihtimalleri artırıldı: Nadir %6'dan %9'a, Efsanevi %0.5'ten %3'e yükseltildi. Buna karşılık ekonomik dengeyi korumak için toz karşılığı garanti kutu maliyetleri de artırıldı: Garanti Nadir 12'den 18 toza, Garanti Efsanevi 35'ten 55 toza çıkarıldı.",
      "Nadir eşyalarda artık her eşya aynı gücü vermiyor: ana stat 8 ile 18 arasında bir üst/alt sınıra göre belirleniyor, ama üst sınırı (en güçlü versiyonu) yakalamak kasıtlı olarak zor tutuldu (~%20 ihtimal). Geri kalan zamanlarda daha düşük ama yine de kullanılabilir bir değer düşüyor, böylece aynı isimli nadir eşyayı tekrar açmak hep bir sürpriz taşıyor.",
      "Oyuncular artık birbirinin o an kuşanılı olan eşyalarını görebiliyor: Liderlik Tablosu'nda kendi dışındaki bir oyuncunun satırına dokunmak, o oyuncunun 5 slotuna ne taktığını (isim + güç değerleri) salt okunur şekilde gösteren bir ekran açıyor.",
      "Enerji görev kartlarından ikisinin ismi değiştirildi: 'Kafa Ütüle' → 'Hafız Döv', 'Tam Manipülasyon' → 'Umumi Mastürbasyon'. (Sadece isim değişikliği, maliyet/ödül aynı kaldı.)",
      "Not: Günlük görevler ve seri (streak) bonusu zaten takvim gününe göre (gece 00:00'dan bir sonraki gece 00:00'a kadar) çalışıyordu; kimin ne zaman giriş yaptığına bakılmaksızın herkes için aynı gün sınırı geçerli, bu davranış bu sürümde de korundu."
    ]
  },
  {
    version: "1.6",
    date: "4 Temmuz 2026",
    items: [
      "Enerji Harca butonu kaldırıldı: yerine 'Gasp Et', 'Arkadaşını Zorbala', 'Kafa Ütüle' ve 'Tam Manipülasyon' gibi isimli görev kartları geldi. Görev ne kadar zor (enerji maliyeti yüksek) ise toz ödülü de o kadar iyi, ama enerjinin 100 ile sınırlı olması sayesinde ekonomi dengede kalıyor.",
      "Günlük Görevler sistemi eklendi: her gün herkese 1'i her zaman 'giriş yap' olmak üzere 3 rastgele görev atanıyor (kutu aç, savaşa gir, savaş kazan, belirli bir oyuncuyu yen, enerji görevi yap gibi). Görevler zorluğuna göre (kolay/orta/zor) toz, puan ve zor görevlerde garanti nadir eşya ödülü veriyor."
    ]
  },
  {
    version: "1.5",
    date: "4 Temmuz 2026",
    items: [
      "Enerji sistemi eklendi: kutu ve savaş beklerken harcanabilen, otomatik dolan ayrı bir kaynak. Enerji harcayarak anında toz kazanılabiliyor.",
      "Saldırı cooldown'u günde 1'den 2 saatte 1'e düşürüldü."
    ]
  },
  {
    version: "1.4",
    date: "4 Temmuz 2026",
    items: [
      "Envanter sistemi: eşyalar artık otomatik kuşanılmıyor. Slot boşsa yeni eşya otomatik kuşanılır, doluysa envantere eklenir ve istediğin eşyayi seçip kuşanabilir veya toza çevirebilirsin.",
      "Savaş algoritması yeniden dengelendi: güç farkının belirleyiciliği artırıldı, büyük bir stat üstünlüğü artık şansa bakılmaksızın kazandırıyor.",
      "Günün Olayı sistemi eklendi: her gün tüm oyuncuları aynı anda etkileyen rastgele bir buff, nerf ya da nötr etki devreye giriyor.",
      "Gizemli Yabancı eklendi: günde belirli bir ihtimalle karşına çıkan, kaybetsen bile risk taşımayan bonus düello.",
      "Güvenlik: hesap girişine 4 haneli PIN zorunluluğu getirildi, başkasının hesabına yanlışlıkla girilmesi engellendi."
    ]
  },
  {
    version: "1.3",
    date: "3 Temmuz 2026",
    items: [
      "Puanlama dengesi güncellendi: saldırıp kaybetmenin bedeli 5 puandan 3 puana düşürüldü, savunmada kazanma ödülü 5 puan olarak sabitlendi.",
      "Eşya Koleksiyon Kitabı eklendi: keşfedilen ve keşfedilmeyen tüm eşyalar tek ekranda takip edilebiliyor.",
      "Savaş kayıtlarına duruma özel (kazanma / kaybetme / aynı hedefe tekrar saldırma) çeşitlendirilmiş mesajlar eklendi."
    ]
  },
  {
    version: "1.2",
    date: "3 Temmuz 2026",
    items: [
      "Kutu açma süresi günde 1'den 4 saatte 1'e düşürüldü, buna karşılık nadir ve efsanevi eşya oranları belirgin şekilde azaltıldı.",
      "Pity sistemi eklendi: uzun süre şanssız kalan oyuncuların olasılığı kademeli olarak artırılıyor.",
      "Günlük seri (streak) bonusu eklendi.",
      "Toz ekonomisi ve garantili kutu satın alma seçeneği eklendi.",
      "Eşit dağılım sistemi eklendi: aynı eşya türünün art arda düşmesi engellendi.",
      "Kutu açma animasyonları nadirliğe göre zenginleştirildi."
    ]
  },
  {
    version: "1.1",
    date: "3 Temmuz 2026",
    items: [
      "Oyun adı Pembe Panterler Battle olarak güncellendi.",
      "Tanıtım ekranı, oyunun sistemlerini adım adım anlatan bir slayt akışına dönüştürüldü."
    ]
  },
  {
    version: "1.0",
    date: "3 Temmuz 2026",
    items: [
      "İlk sürüm: kutu açma, kuşanım, savaş, liderlik tablosu ve savaş geçmişi sistemleriyle yayına alındı."
    ]
  }
];

const ROADMAP = [
  "Rövanş hakkı: kaybedilen bir savaşın ardından, günlük cooldown'dan bağımsız bir intikam saldırısı hakkı.",
  "Dengeli hedef seçimi: sıralamada yakın oyunculara saldırıyı teşvik eden bir kısıtlama.",
  "Günün MVP'si: günün en iyi performansına özel bir rozet.",
  "Rozet ve unvan sistemi: oyun içi başarımların profilde gösterilmesi.",
  "Haftalık/aylık sezonlar ve geçmiş şampiyonların tutulduğu bir arşiv.",
  "Anlık bildirimler: efsanevi eşya bulunduğunda veya saldırı anında ekran bildirimi.",
  "Karakter avatarı seçimi.",
  "Ses efektleri.",
  "Confetti efekti.",
  "Sunucu Boss'u: haftalık ortak raid etkinliği."
];

function renderUpdatesList() {
  const releasesHtml = RELEASES.map(r => `
    <div class="release-block">
      <div class="release-header">
        <span class="release-version">v${r.version}</span>
        <span class="release-date">${r.date}</span>
      </div>
      <ul class="release-items">${r.items.map(t => `<li>${t}</li>`).join("")}</ul>
    </div>
  `).join("");

  const roadmapHtml = `
    <div class="roadmap-block">
      <div class="roadmap-header">🔮 Yol Haritası</div>
      <ul class="release-items roadmap-items">${ROADMAP.map(t => `<li>${t}</li>`).join("")}</ul>
    </div>`;

  updatesList.innerHTML = releasesHtml + roadmapHtml;
}

function refreshUpdatesDot() {
  const seen = localStorage.getItem("gacha_last_seen_update");
  updatesDot.classList.toggle("hidden", seen === LATEST_UPDATE_VERSION);
}

updatesBtn.onclick = () => {
  renderUpdatesList();
  updatesModal.classList.remove("hidden");
  localStorage.setItem("gacha_last_seen_update", LATEST_UPDATE_VERSION);
  refreshUpdatesDot();
};
closeUpdatesBtn.onclick = () => updatesModal.classList.add("hidden");

refreshUpdatesDot();

// ============================================================
// KOLEKSİYON KİTABI
// ============================================================
function renderCollection() {
  const discovered = new Set(currentPlayerData?.discoveredItems || []);

  collectionList.innerHTML = SLOTS.map(s => {
    const items = ALL_ITEMS_BY_SLOT[s.key];
    const ownedCount = items.filter(it => discovered.has(it.name)).length;
    const chips = items.map(it => {
      const owned = discovered.has(it.name);
      return `<div class="coll-chip ${owned ? `owned rarity-${it.rarity}` : "locked"}">${owned ? it.name : "???"}</div>`;
    }).join("");
    return `
      <div class="coll-section">
        <div class="coll-section-title">${s.icon} ${s.label} <span>${ownedCount}/${items.length}</span></div>
        <div class="coll-grid">${chips}</div>
      </div>`;
  }).join("");

  const totalOwned = discovered.size;
  collectionProgress.textContent = `${totalOwned} / ${TOTAL_ITEM_COUNT} eşya keşfedildi`;
}

collectionBtn.onclick = () => {
  renderCollection();
  collectionModal.classList.remove("hidden");
};
closeCollectionBtn.onclick = () => collectionModal.classList.add("hidden");

// ============================================================
// ENVANTER SİSTEMİ
// Her slotta artık BİRDEN FAZLA eşya biriktirilebilir. Yeni eşya sadece
// slot boşsa otomatik kuşanılır; doluysa envantere eklenir ve oyuncu
// istediği eşyayı manuel olarak kuşanabilir ya da toza çevirebilir.
// ============================================================
function getSlotInventory(slot) {
  const inv = (currentPlayerData?.inventory && currentPlayerData.inventory[slot]) || [];
  const equipped = currentPlayerData?.equipment && currentPlayerData.equipment[slot];
  // Bu güncellemeden önce kuşanılmış (id'siz) eşyalar için geriye dönük uyumluluk
  if (equipped && !inv.some(it => it.id && equipped.id && it.id === equipped.id)) {
    const legacyId = equipped.id || `legacy-${slot}`;
    return [{ ...equipped, id: legacyId }, ...inv];
  }
  return inv;
}

async function equipItem(slot, itemId) {
  if (!currentPlayerData) return;
  const target = getSlotInventory(slot).find(it => it.id === itemId);
  if (!target) { alert("Eşya bulunamadı."); return; }
  const newEquipment = { ...(currentPlayerData.equipment || emptyEquipment()), [slot]: target };
  const stats = computeStatsFromEquipment(newEquipment);
  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
    equipment: newEquipment,
    attack: stats.attack,
    defense: stats.defense
  });
}

async function disenchantItem(slot, itemId) {
  if (!currentPlayerData) return;
  const equippedId = currentPlayerData.equipment?.[slot]?.id;
  if (equippedId === itemId) { alert("Kuşanılı eşyayı toza çeviremezsin, önce başka bir eşya kuşan."); return; }
  const target = getSlotInventory(slot).find(it => it.id === itemId);
  if (!target) { alert("Eşya bulunamadı."); return; }
  const newInvArr = getSlotInventory(slot).filter(it => it.id !== itemId);
  const dustGain = Math.round((DUST_FROM_RARITY[target.rarity] || 0) * getTodaysEvent().dustMult);
  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
    [`inventory.${slot}`]: newInvArr,
    dust: (currentPlayerData.dust || 0) + dustGain
  });
}

let currentInventorySlot = null;

function openInventoryModal(slot) {
  currentInventorySlot = slot;
  renderInventoryModal();
  inventoryModal.classList.remove("hidden");
}

function renderInventoryModal() {
  if (!currentInventorySlot) return;
  const slot = currentInventorySlot;
  const s = SLOT_MAP[slot];
  inventoryModalTitle.textContent = `${s.icon} ${s.label} Envanteri`;

  const rarityOrder = { efsanevi: 0, nadir: 1, standart: 2 };
  const items = getSlotInventory(slot).slice().sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);
  const equippedId = currentPlayerData?.equipment?.[slot]?.id;

  if (!items.length) {
    inventoryList.innerHTML = `<p class="box-status">Bu slotta henüz eşyan yok, kutu aç ve şansını dene!</p>`;
    return;
  }

  inventoryList.innerHTML = items.map(it => {
    const isEquipped = it.id === equippedId;
    return `
      <div class="inv-item rarity-${it.rarity}">
        <div class="inv-item-top">
          <span class="inv-item-name">${it.name}</span>
          ${isEquipped ? `<span class="update-badge done">✅ KUŞANILI</span>` : ""}
        </div>
        <div class="inv-item-stats">⚔️ +${it.atk} &nbsp; 🛡️ +${it.def} &nbsp; · ${it.rarity.toUpperCase()}</div>
        ${it.effectDesc ? `<div class="item-popup-passive" style="margin-top:6px;">✨ ${it.effectDesc}</div>` : ""}
        <div class="inv-item-actions">
          <button class="btn-mini nadir-mini" data-action="equip" data-id="${it.id}" ${isEquipped ? "disabled" : ""}>Kuşan</button>
          <button class="btn-mini" data-action="dust" data-id="${it.id}" ${isEquipped ? "disabled" : ""}>Toza Çevir</button>
        </div>
      </div>`;
  }).join("");

  inventoryList.querySelectorAll("button[data-action]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      inventoryList.querySelectorAll("button").forEach(b => b.disabled = true);
      if (action === "equip") await equipItem(slot, id);
      else await disenchantItem(slot, id);
      renderInventoryModal();
    };
  });
}
closeInventoryBtn.onclick = () => { inventoryModal.classList.add("hidden"); currentInventorySlot = null; };

// ============================================================
// LOGIN / OYUNCU SEÇİMİ
// ============================================================
async function loadPlayersOnce() {
  const snap = await getDocs(collection(db, PLAYERS_COL));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function showLoginScreen() {
  loginScreen.classList.remove("hidden");
  gameScreen.classList.add("hidden");
  loginError.textContent = "";

  const players = await loadPlayersOnce();
  playerListLogin.innerHTML = "";
  players.forEach(p => {
    const btn = document.createElement("button");
    btn.innerHTML = `<span>${p.name}</span><span style="color:var(--gold)">${p.points ?? 0} ⭐</span>`;
    btn.onclick = () => askForPin(p.id, p.name);
    playerListLogin.appendChild(btn);
  });

  if (players.length >= MAX_PLAYERS) {
    newPlayerBox.classList.add("hidden");
    if (players.length > 0) {
      const note = document.createElement("p");
      note.className = "login-sub";
      note.textContent = "7 oyuncu kontenjanı dolu, listeden ismini seç.";
      playerListLogin.appendChild(note);
    }
  } else {
    newPlayerBox.classList.remove("hidden");
  }
}

newPlayerBtn.onclick = async () => {
  const name = newPlayerName.value.trim();
  const pin = newPlayerPin.value.trim();
  if (!name) { loginError.textContent = "Bir isim yaz kral."; return; }
  if (name.length > 16) { loginError.textContent = "İsim çok uzun."; return; }
  if (!/^\d{4}$/.test(pin)) { loginError.textContent = "4 haneli bir PIN belirle (sadece rakam)."; return; }

  const players = await loadPlayersOnce();
  if (players.length >= MAX_PLAYERS) { loginError.textContent = "Kontenjan dolu (7/7)."; return; }
  if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    loginError.textContent = "Bu isim zaten alınmış."; return;
  }

  newPlayerBtn.disabled = true;
  try {
    const newDoc = await addDoc(collection(db, PLAYERS_COL), {
      name,
      pin,
      points: 0,
      attack: BASE_ATTACK,
      defense: BASE_DEFENSE,
      equipment: emptyEquipment(),
      inventory: { kask: [], zirh: [], kilic: [], eldiven: [], ayakkabi: [] },
      lastBoxOpenTime: 0,
      lastAttackTime: 0,
      lastAttackWindow: -1,
      curseNextAttack: null,
      dust: 0,
      energy: ENERGY_MAX,
      lastEnergyUpdate: Date.now(),
      pityRare: 0,
      pityLegendary: 0,
      boxStreak: 0,
      lastBoxOpenDay: null,
      recentSlots: [],
      lastAttackedId: null,
      attackStreakOnTarget: 0,
      discoveredItems: [],
      strangerDay: null,
      strangerAvailable: false,
      strangerUsed: false,
      strangerName: null,
      createdAt: serverTimestamp()
    });
    selectPlayer(newDoc.id);
  } catch (e) {
    loginError.textContent = "Bir hata oldu: " + e.message;
  } finally {
    newPlayerBtn.disabled = false;
  }
};

function selectPlayer(id) {
  currentPlayerId = id;
  localStorage.setItem("gacha_player_id", id);
  startGame();
}

// ============================================================
// PIN DOĞRULAMA
// Login listesinden bir isme tıklayınca, o oyuncunun 4 haneli PIN'i
// doğrulanmadan hesaba giriş yapılamaz. Bu sadece arkadaş grubu içinde
// "yanlışlıkla/şaka olsun diye başkasının hesabına girme" durumunu
// engellemek içindir, kriptografik güvenlik iddiası taşımaz.
// ============================================================
let pendingPlayerId = null;

function askForPin(playerId, playerName) {
  pendingPlayerId = playerId;
  pinModalTitle.textContent = `🔒 ${playerName}`;
  pinInput.value = "";
  pinError.textContent = "";
  pinModal.classList.remove("hidden");
  setTimeout(() => pinInput.focus(), 50);
}

async function confirmPin() {
  const val = pinInput.value.trim();
  if (!/^\d{4}$/.test(val)) { pinError.textContent = "4 haneli PIN gir."; return; }

  pinConfirmBtn.disabled = true;
  try {
    const snap = await getDoc(doc(db, PLAYERS_COL, pendingPlayerId));
    if (!snap.exists()) { pinError.textContent = "Oyuncu bulunamadı."; return; }
    const existingPin = snap.data().pin;

    // Bu güncellemeden önce oluşturulmuş oyuncuların PIN'i yok.
    // İlk girişte girdikleri 4 hane, o andan itibaren PIN'leri olarak kaydedilir.
    if (!existingPin) {
      await updateDoc(doc(db, PLAYERS_COL, pendingPlayerId), { pin: val });
      pinModal.classList.add("hidden");
      selectPlayer(pendingPlayerId);
      return;
    }

    if (existingPin !== val) { pinError.textContent = "PIN yanlış."; pinInput.value = ""; pinInput.focus(); return; }
    pinModal.classList.add("hidden");
    selectPlayer(pendingPlayerId);
  } finally {
    pinConfirmBtn.disabled = false;
  }
}

pinConfirmBtn.onclick = confirmPin;
pinCancelBtn.onclick = () => { pinModal.classList.add("hidden"); pendingPlayerId = null; };
pinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmPin(); });

switchPlayerBtn.onclick = () => {
  localStorage.removeItem("gacha_player_id");
  currentPlayerId = null;
  currentPlayerData = null;
  showLoginScreen();
};

// ============================================================
// OYUN BAŞLATMA
// ============================================================
async function startGame() {
  const ref = doc(db, PLAYERS_COL, currentPlayerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    localStorage.removeItem("gacha_player_id");
    currentPlayerId = null;
    showLoginScreen();
    return;
  }

  loginScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  currentPlayerNameEl.textContent = snap.data().name;

  renderDailyEventBanner();
  maybeShowTutorial();
  await ensureStrangerForToday(snap.data());
  await ensureDailyQuestsForToday(snap.data());

  // Kendi oyuncu belgemi canlı dinle
  onSnapshot(ref, (docSnap) => {
    if (!docSnap.exists()) return;
    currentPlayerData = { id: docSnap.id, ...docSnap.data() };
    renderMyStats();
    renderEquipment();
    renderBoxStatus();
    renderAttackTargets();
    renderStrangerBanner();
    renderEnergy();
    renderQuests();
    if (!collectionModal.classList.contains("hidden")) renderCollection();
    if (!inventoryModal.classList.contains("hidden")) renderInventoryModal();
  });

  // Tüm oyuncuları canlı dinle (liderlik tablosu + saldırı hedefleri)
  const playersQuery = query(collection(db, PLAYERS_COL), orderBy("points", "desc"));
  onSnapshot(playersQuery, (snap) => {
    allPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLeaderboard();
    renderAttackTargets();
  });

  // Savaş geçmişini canlı dinle
  const logQuery = query(collection(db, LOG_COL), orderBy("timestamp", "desc"), limit(40));
  onSnapshot(logQuery, (snap) => {
    renderBattleLog(snap.docs.map(d => d.data()));
  });
}

// ============================================================
// RENDER: LİDERLİK TABLOSU
// ============================================================
function renderLeaderboard() {
  leaderboardEl.innerHTML = allPlayers.map((p, i) => {
    const isMe = p.id === currentPlayerId;
    const rankClass = i === 0 ? "gold" : "";
    return `
      <div class="lb-row ${isMe ? "me" : ""}" data-id="${p.id}" ${isMe ? "" : 'style="cursor:pointer;"'}>
        <div class="lb-rank ${rankClass}">${i + 1}</div>
        <div class="lb-info">
          <div class="lb-name">${p.name}${isMe ? " (sen)" : ""}</div>
          <div class="lb-stats">⚔️ ${p.attack ?? BASE_ATTACK} &nbsp; 🛡️ ${p.defense ?? BASE_DEFENSE}</div>
        </div>
        <div class="lb-points">${p.points ?? 0}</div>
      </div>`;
  }).join("");

  leaderboardEl.querySelectorAll(".lb-row[data-id]").forEach(row => {
    if (row.classList.contains("me")) return;
    row.onclick = () => {
      const player = allPlayers.find(p => p.id === row.getAttribute("data-id"));
      if (player) openViewEquipment(player);
    };
  });
}

// ============================================================
// BAŞKA OYUNCUNUN EKİPMANINI GÖRÜNTÜLEME (salt okunur)
// Herkes birbirinin o an kuşanılı olan eşyalarını görebilsin diye
// liderlik tablosundaki bir oyuncuya tıklanınca açılan salt okunur ekran.
// ============================================================
function openViewEquipment(player) {
  viewEquipmentTitle.textContent = `🛡️ ${player.name}'in Ekipmanı`;
  const eq = player.equipment || emptyEquipment();
  viewEquipmentGrid.innerHTML = SLOTS.map(s => {
    const item = eq[s.key];
    const rarityClass = item ? `rarity-${item.rarity}` : "";
    return `
      <div class="equip-slot view-only ${item ? `filled ${rarityClass}` : ""}" style="cursor:default;">
        <div class="equip-slot-icon">${s.icon}</div>
        <div class="equip-slot-label">${s.label}</div>
        <div class="equip-slot-item ${item ? "" : "empty"}">${item ? item.name : "Boş"}</div>
        ${item ? `<div class="equip-slot-count">⚔️${item.atk} 🛡️${item.def}</div>` : ""}
      </div>`;
  }).join("");
  viewEquipmentModal.classList.remove("hidden");
}
closeViewEquipmentBtn.onclick = () => viewEquipmentModal.classList.add("hidden");

// ============================================================
// RENDER: BENİM İSTATİSTİKLERİM
// ============================================================
function renderMyStats() {
  if (!currentPlayerData) return;
  myAttackEl.textContent = currentPlayerData.attack ?? BASE_ATTACK;
  myDefenseEl.textContent = currentPlayerData.defense ?? BASE_DEFENSE;
  myPointsEl.textContent = currentPlayerData.points ?? 0;
  myDustEl.textContent = currentPlayerData.dust ?? 0;
  const streak = currentPlayerData.boxStreak ?? 0;
  myStreakEl.textContent = streak;
  streakChip.classList.toggle("hidden", streak < 2);
}

// ============================================================
// RENDER: KUŞANIM
// ============================================================
// ============================================================
// ENERJİ SİSTEMİ
// ============================================================
function getCurrentEnergy(data) {
  const stored = data.energy ?? ENERGY_MAX;
  const last = data.lastEnergyUpdate || Date.now();
  const regen = Math.floor((Date.now() - last) / ENERGY_REGEN_MS_PER_POINT);
  return Math.min(ENERGY_MAX, stored + regen);
}

function renderEnergy() {
  if (!currentPlayerData) return;
  const current = getCurrentEnergy(currentPlayerData);
  energyBarFill.style.width = `${(current / ENERGY_MAX) * 100}%`;
  energyStatus.textContent = `${current} / ${ENERGY_MAX} enerji`;
  renderEnergyTasks(current);
}

function renderEnergyTasks(current) {
  if (!energyTasksRow) return;
  current = current ?? getCurrentEnergy(currentPlayerData || { energy: ENERGY_MAX });
  energyTasksRow.innerHTML = ENERGY_TASKS.map(t => `
    <button type="button" class="btn-mini nadir-mini energy-task-btn" data-task="${t.id}" ${current < t.cost ? "disabled" : ""}>
      ${t.icon} ${t.name}
      <span>${t.cost} enerji · ~${t.dustMin}-${t.dustMax} toz</span>
    </button>
  `).join("");

  energyTasksRow.querySelectorAll("button[data-task]").forEach(btn => {
    btn.onclick = () => useEnergyAction(btn.getAttribute("data-task"));
  });
}

async function useEnergyAction(taskId) {
  if (!currentPlayerData) return;
  const task = ENERGY_TASKS.find(t => t.id === taskId);
  if (!task) return;
  const current = getCurrentEnergy(currentPlayerData);
  if (current < task.cost) return;

  energyTasksRow.querySelectorAll("button").forEach(b => b.disabled = true);
  const bonus = Math.random() < task.bonusChance;
  const dustGain = bonus ? task.bonusDust : randInt(task.dustMin, task.dustMax);

  const newQuests = incrementQuestProgress(currentPlayerData.dailyQuests, "energy_task", 1);

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
    energy: current - task.cost,
    lastEnergyUpdate: Date.now(),
    dust: (currentPlayerData.dust || 0) + dustGain,
    ...(newQuests !== currentPlayerData.dailyQuests ? { dailyQuests: newQuests } : {})
  });

  energyStatus.textContent = bonus
    ? `🎉 ${task.name} sırasında şanslı buluş! +${dustGain} toz kazandın!`
    : `${task.name}: +${dustGain} toz kazandın.`;
  setTimeout(renderEnergy, 1800);
}
setInterval(renderEnergy, 30000);

function renderDailyEventBanner() {
  const event = getTodaysEvent();
  dailyEventBanner.className = `daily-event-banner type-${event.type}`;
  dailyEventBanner.innerHTML = `<span class="event-icon">${event.icon}</span><span class="event-text"><b>${event.title}</b> — ${event.desc}</span>`;
}

// Bugün için henüz karar verilmediyse (yeni gün), gizemli yabancının çıkıp çıkmayacağına
// deterministik olmayan tek seferlik bir rastgelelikle karar verip Firestore'a yazar.
async function ensureStrangerForToday(data) {
  const today = dateStr();
  if (data.strangerDay === today) return;
  const appears = Math.random() < STRANGER_APPEAR_CHANCE;
  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
    strangerDay: today,
    strangerAvailable: appears,
    strangerUsed: false,
    strangerName: appears ? pick(STRANGER_NAMES) : null
  });
}

function renderStrangerBanner() {
  const show = currentPlayerData?.strangerAvailable && !currentPlayerData?.strangerUsed;
  strangerBanner.classList.toggle("hidden", !show);
  if (show) strangerNameEl.textContent = currentPlayerData.strangerName;
}

strangerDuelBtn.onclick = async () => {
  if (!currentPlayerData?.strangerAvailable || currentPlayerData.strangerUsed) return;
  strangerDuelBtn.disabled = true;

  const myPower = ((currentPlayerData.attack || BASE_ATTACK) + (currentPlayerData.defense || BASE_DEFENSE)) / 2;
  const npcPower = myPower * (0.7 + Math.random() * 0.5);
  const won = myPower >= npcPower;
  const reward = won ? STRANGER_DUST_REWARD : 0;
  const strangerName = currentPlayerData.strangerName;

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
    strangerUsed: true,
    dust: (currentPlayerData.dust || 0) + reward
  });

  showResultModal({ stranger: true, won, name: strangerName, reward });
  strangerDuelBtn.disabled = false;
};

// ============================================================
// GÜNLÜK GÖREVLER — mantık
// ============================================================
function rollQuestReward(tier) {
  const r = QUEST_TIER_REWARDS[tier];
  return {
    dust: randInt(r.dustMin, r.dustMax),
    points: randInt(r.pointsMin, r.pointsMax),
    item: Math.random() < r.itemChance
  };
}

function buildQuestFromTemplate(template, idx, otherPlayers) {
  const reward = rollQuestReward(template.tier);
  let label = template.label;

  if (template.type === "defeat_player") {
    if (!otherPlayers.length) return null;
    const t = pick(otherPlayers);
    label = `${t.name}'i savaşta yen`;
    return {
      id: `q${idx}_${template.type}`, type: template.type, tier: template.tier, icon: template.icon,
      label, target: template.target, progress: 0, completed: false, claimed: false,
      rewardDust: reward.dust, rewardPoints: reward.points, rewardItem: reward.item,
      targetPlayerId: t.id, targetPlayerName: t.name
    };
  }

  if (typeof label === "function") label = label(template.target);

  return {
    id: `q${idx}_${template.type}`, type: template.type, tier: template.tier, icon: template.icon,
    label, target: template.target,
    progress: template.autoComplete ? template.target : 0,
    completed: !!template.autoComplete,
    claimed: false,
    rewardDust: reward.dust, rewardPoints: reward.points, rewardItem: reward.item,
    targetPlayerId: null, targetPlayerName: null
  };
}

// Bugün için henüz görev atanmadıysa, 1 "giriş yap" + farklı tipte 2 rastgele
// görev daha seçip Firestore'a yazar (Gizemli Yabancı ile aynı desen).
async function ensureDailyQuestsForToday(data) {
  const today = dateStr();
  if (data.questsDate === today && Array.isArray(data.dailyQuests) && data.dailyQuests.length) return;

  const players = await loadPlayersOnce();
  const others = players.filter(p => p.id !== currentPlayerId);

  const rest = QUEST_TEMPLATES.filter(t => t.type !== "login" && (t.type !== "defeat_player" || others.length > 0));
  const shuffled = [...rest].sort(() => Math.random() - 0.5);
  const chosenTypes = new Set();
  const picked = [];
  for (const t of shuffled) {
    if (chosenTypes.has(t.type)) continue;
    chosenTypes.add(t.type);
    picked.push(t);
    if (picked.length === 2) break;
  }

  const loginTemplate = QUEST_TEMPLATES.find(t => t.type === "login");
  const templatesToUse = [loginTemplate, ...picked];
  const quests = templatesToUse.map((t, i) => buildQuestFromTemplate(t, i, others)).filter(Boolean);

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
    dailyQuests: quests,
    questsDate: today
  });
}

// Belirli tipte, tamamlanmamış görevlerin ilerlemesini artırır. defeat_player
// tipinde sadece targetPlayerId eşleşiyorsa sayılır.
function incrementQuestProgress(quests, type, amount = 1, opts = {}) {
  if (!quests || !quests.length) return quests;
  let changed = false;
  const updated = quests.map(q => {
    if (q.completed || q.type !== type) return q;
    if (type === "defeat_player" && q.targetPlayerId !== opts.targetPlayerId) return q;
    const newProgress = Math.min(q.target, (q.progress || 0) + amount);
    if (newProgress === (q.progress || 0)) return q;
    changed = true;
    return { ...q, progress: newProgress, completed: newProgress >= q.target };
  });
  return changed ? updated : quests;
}

// Görev ödülü olarak nadir eşya verilirken kutu açmayla aynı deseni kullanır:
// slot boşsa otomatik kuşanılır, doluysa envantere eklenir.
function buildItemGrantPayload(data, rarity) {
  const recentSlots = data.recentSlots || [];
  const slot = pickSlotWeighted(recentSlots);
  const item = generateLootItemForRarity(slot, rarity);
  const wasEmpty = !(data.equipment && data.equipment[slot]);
  const newInvArr = [...getSlotInventory(slot), item];
  const newEquipment = wasEmpty
    ? { ...(data.equipment || emptyEquipment()), [slot]: item }
    : (data.equipment || emptyEquipment());
  const stats = computeStatsFromEquipment(newEquipment);
  const newDiscovered = Array.from(new Set([...(data.discoveredItems || []), item.name]));
  const newRecentSlots = [...recentSlots, slot].slice(-8);
  return {
    equipment: newEquipment,
    attack: stats.attack,
    defense: stats.defense,
    [`inventory.${slot}`]: newInvArr,
    discoveredItems: newDiscovered,
    recentSlots: newRecentSlots,
    _grantedItem: item
  };
}

function renderQuests() {
  if (!currentPlayerData || !questsListEl) return;
  const quests = currentPlayerData.dailyQuests || [];
  if (!quests.length) {
    questsListEl.innerHTML = `<p class="box-status">Bugünkü görevler yükleniyor...</p>`;
    return;
  }

  questsListEl.innerHTML = quests.map(q => {
    const pct = Math.min(100, Math.round(((q.progress || 0) / q.target) * 100));
    const readyToClaim = q.completed && !q.claimed;
    return `
      <div class="quest-card tier-${q.tier} ${q.claimed ? "claimed" : ""} ${readyToClaim ? "ready" : ""}">
        <div class="quest-top">
          <span class="quest-icon">${q.icon}</span>
          <span class="quest-label">${q.label}</span>
          <span class="quest-tier-badge tier-${q.tier}">${QUEST_TIER_LABELS[q.tier]}</span>
        </div>
        <div class="quest-progress-track"><div class="quest-progress-fill" style="width:${pct}%"></div></div>
        <div class="quest-bottom">
          <span class="quest-progress-text">${q.progress || 0}/${q.target}</span>
          <span class="quest-reward">✨${q.rewardDust} · ⭐${q.rewardPoints}${q.rewardItem ? " · 🔷 Nadir Eşya" : ""}</span>
          ${q.claimed
            ? `<span class="quest-claimed-tag">✅ Alındı</span>`
            : `<button class="btn-mini nadir-mini quest-claim-btn" data-id="${q.id}" ${readyToClaim ? "" : "disabled"}>Ödülü Al</button>`}
        </div>
      </div>`;
  }).join("");

  questsListEl.querySelectorAll(".quest-claim-btn").forEach(btn => {
    btn.onclick = () => claimQuest(btn.getAttribute("data-id"));
  });
}

async function claimQuest(questId) {
  if (!currentPlayerData) return;
  const quests = currentPlayerData.dailyQuests || [];
  const quest = quests.find(q => q.id === questId);
  if (!quest || !quest.completed || quest.claimed) return;

  questsListEl.querySelectorAll(".quest-claim-btn").forEach(b => b.disabled = true);

  let payload = {
    dust: (currentPlayerData.dust || 0) + (quest.rewardDust || 0),
    points: (currentPlayerData.points || 0) + (quest.rewardPoints || 0)
  };

  let grantedItem = null;
  if (quest.rewardItem) {
    const itemGrant = buildItemGrantPayload(currentPlayerData, "nadir");
    grantedItem = itemGrant._grantedItem;
    delete itemGrant._grantedItem;
    payload = { ...payload, ...itemGrant };
  }

  const newQuests = quests.map(q => q.id === questId ? { ...q, claimed: true } : q);
  payload.dailyQuests = newQuests;

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), payload);

  if (grantedItem) {
    itemPopupInner.className = `item-popup-inner rarity-${grantedItem.rarity}`;
    itemPopupInner.innerHTML = `
      <div class="streak-bonus-tag">🎯 Görev Ödülü!</div>
      <div class="item-popup-icon">${SLOT_MAP[grantedItem.slot].icon}</div>
      <div class="item-popup-name rarity-${grantedItem.rarity}">${grantedItem.name}</div>
      <div class="item-popup-stats">⚔️ +${grantedItem.atk} &nbsp; 🛡️ +${grantedItem.def} &nbsp; · ${grantedItem.rarity.toUpperCase()}</div>
      ${grantedItem.effectDesc ? `<div class="item-popup-passive">✨ ${grantedItem.effectDesc}</div>` : ""}
    `;
    itemPopup.classList.remove("hidden");
    setTimeout(() => itemPopup.classList.add("hidden"), 5000);
  }
}

function renderEquipment() {
  const eq = currentPlayerData?.equipment || emptyEquipment();
  equipmentGridEl.innerHTML = SLOTS.map(s => {
    const item = eq[s.key];
    const rarityClass = item ? `rarity-${item.rarity}` : "";
    const count = getSlotInventory(s.key).length;
    return `
      <button type="button" class="equip-slot ${item ? "filled" : ""} ${rarityClass}" data-slot="${s.key}">
        <div class="equip-slot-icon">${s.icon}</div>
        <div class="equip-slot-label">${s.label}</div>
        <div class="equip-slot-item ${item ? "" : "empty"}">${item ? item.name : "Boş"}</div>
        ${count > 0 ? `<div class="equip-slot-count">${count} eşya</div>` : ""}
      </button>`;
  }).join("");

  equipmentGridEl.querySelectorAll("button[data-slot]").forEach(btn => {
    btn.onclick = () => openInventoryModal(btn.getAttribute("data-slot"));
  });
}

// ============================================================
// KUTU AÇMA
// ============================================================
function canOpenBoxNow() {
  if (!currentPlayerData) return false;
  const last = currentPlayerData.lastBoxOpenTime || 0;
  return Date.now() - last >= getEffectiveBoxCooldown();
}

function renderBoxStatus() {
  const able = canOpenBoxNow();
  openBoxBtn.disabled = !able;

  if (able) {
    boxStatus.textContent = "Kutu açmaya hazır!";
  } else {
    const remain = getEffectiveBoxCooldown() - (Date.now() - (currentPlayerData.lastBoxOpenTime || 0));
    boxStatus.textContent = `Sıradaki kutuya ${formatRemaining(remain)} kaldı.`;
  }

  const dust = currentPlayerData?.dust ?? 0;
  guaranteeRareBtn.disabled = dust < DUST_COST_RARE_BOX;
  guaranteeLegendaryBtn.disabled = dust < DUST_COST_LEGENDARY_BOX;
}

// Nadirliğe göre epik parçacık (spark) efekti
function spawnSparks(rarity) {
  const counts = { standart: 5, nadir: 9, efsanevi: 16 };
  const colors = { standart: "#ffffff", nadir: "#4d9bff", efsanevi: "#ffcc4d" };
  const count = counts[rarity] || 5;
  const color = colors[rarity] || "#ffffff";
  const dist = rarity === "efsanevi" ? 90 : rarity === "nadir" ? 65 : 45;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const radius = dist * (0.6 + Math.random() * 0.6);
    const tx = Math.cos(angle) * radius;
    const ty = Math.sin(angle) * radius;

    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.setProperty("--tx", `${tx}px`);
    spark.style.setProperty("--ty", `${ty}px`);
    spark.style.background = color;
    spark.style.boxShadow = `0 0 8px ${color}`;
    spark.style.animationDuration = rarity === "efsanevi" ? "1.1s" : "0.8s";
    boxWrapper.appendChild(spark);
    setTimeout(() => spark.remove(), 1300);
  }

  if (rarity === "efsanevi") {
    const flash = document.createElement("div");
    flash.className = "box-flash";
    boxWrapper.appendChild(flash);
    setTimeout(() => flash.remove(), 700);
  }
}

async function performBoxOpen({ forcedRarity = null, costDust = 0, isFree = false }) {
  if (!currentPlayerData) return;

  openBoxBtn.disabled = true;
  guaranteeRareBtn.disabled = true;
  guaranteeLegendaryBtn.disabled = true;
  itemPopup.classList.add("hidden");

  const data = currentPlayerData;
  const event = getTodaysEvent();
  const pityRare = data.pityRare || 0;
  const pityLegendary = data.pityLegendary || 0;
  const recentSlots = data.recentSlots || [];

  // Streak hesabı sadece ücretsiz (cooldown'lu) kutuda geçerli
  let newStreak = data.boxStreak || 0;
  let newLastBoxOpenDay = data.lastBoxOpenDay || null;
  let streakForcedRarity = null;
  if (isFree) {
    const today = dateStr();
    if (data.lastBoxOpenDay !== today) {
      newStreak = isConsecutiveDay(data.lastBoxOpenDay, today) ? (data.boxStreak || 0) + 1 : 1;
      newLastBoxOpenDay = today;
      if (newStreak % 7 === 0) streakForcedRarity = "efsanevi";
      else if (newStreak % 3 === 0) streakForcedRarity = "nadir";
    }
  }

  const finalForcedRarity = forcedRarity || streakForcedRarity;
  const rarity = finalForcedRarity || rollRarity(pityRare, pityLegendary, event);
  const slot = pickSlotWeighted(recentSlots);
  const item = generateLootItemForRarity(slot, rarity);

  const streakBonusFired = !!streakForcedRarity && !forcedRarity;

  lootBox.className = `loot-box burst-${item.rarity}`;
  spawnSparks(item.rarity);
  sfxShake();
  if (item.rarity === "efsanevi") setTimeout(sfxOpenLegendary, 500);
  else if (item.rarity === "nadir") setTimeout(sfxOpenRare, 500);
  else setTimeout(sfxOpenStandart, 500);

  const animDuration = item.rarity === "efsanevi" ? 1900 : item.rarity === "nadir" ? 1400 : 1000;
  await new Promise(r => setTimeout(r, animDuration));

  // Pity sayaçlarını güncelle (günün olayı pity'yi hızlandırabilir)
  let newPityRare = rarity === "nadir" || rarity === "efsanevi" ? 0 : pityRare + (event.pityMult || 1);
  let newPityLegendary = rarity === "efsanevi" ? 0 : pityLegendary + (event.pityMult || 1);

  // Slot boşsa otomatik kuşanılır, doluysa envantere eklenir (oyuncu kendi seçer)
  const wasEmpty = !(data.equipment && data.equipment[slot]);
  const newInvArr = [...getSlotInventory(slot), item];
  const newEquipment = wasEmpty
    ? { ...(data.equipment || emptyEquipment()), [slot]: item }
    : (data.equipment || emptyEquipment());
  const stats = computeStatsFromEquipment(newEquipment);

  const newRecentSlots = [...recentSlots, slot].slice(-8);
  const newDiscovered = Array.from(new Set([...(data.discoveredItems || []), item.name]));
  const newDust = Math.max(0, (data.dust || 0) - costDust);
  const newQuests = incrementQuestProgress(data.dailyQuests, "open_box", 1);

  const updatePayload = {
    equipment: newEquipment,
    attack: stats.attack,
    defense: stats.defense,
    [`inventory.${slot}`]: newInvArr,
    pityRare: newPityRare,
    pityLegendary: newPityLegendary,
    dust: newDust,
    recentSlots: newRecentSlots,
    discoveredItems: newDiscovered,
    ...(newQuests !== data.dailyQuests ? { dailyQuests: newQuests } : {})
  };
  if (isFree) {
    updatePayload.lastBoxOpenTime = Date.now();
    updatePayload.boxStreak = newStreak;
    updatePayload.lastBoxOpenDay = newLastBoxOpenDay;
  }

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), updatePayload);

  itemPopupInner.className = `item-popup-inner rarity-${item.rarity}`;
  itemPopupInner.innerHTML = `
    ${streakBonusFired ? `<div class="streak-bonus-tag">🔥 ${newStreak} Günlük Seri Bonusu!</div>` : ""}
    <div class="item-popup-icon">${SLOT_MAP[item.slot].icon}</div>
    <div class="item-popup-name rarity-${item.rarity}">${item.name}</div>
    <div class="item-popup-stats">⚔️ +${item.atk} &nbsp; 🛡️ +${item.def} &nbsp; · ${item.rarity.toUpperCase()}</div>
    ${item.effectDesc ? `<div class="item-popup-passive">✨ ${item.effectDesc}</div>` : ""}
    ${wasEmpty
      ? `<div class="item-popup-passive" style="color:var(--green)">✅ Boş slota otomatik kuşanıldı!</div>`
      : `<div class="popup-quick-actions">
          <button id="popupEquipBtn" class="btn-mini nadir-mini">✅ Şimdi Kuşan</button>
          <button id="popupDustBtn" class="btn-mini">✨ Toza Çevir</button>
        </div>`}
  `;
  itemPopup.classList.remove("hidden");

  if (!wasEmpty) {
    document.getElementById("popupEquipBtn").onclick = () => { equipItem(slot, item.id); itemPopup.classList.add("hidden"); };
    document.getElementById("popupDustBtn").onclick = () => { disenchantItem(slot, item.id); itemPopup.classList.add("hidden"); };
  }

  lootBox.className = "loot-box";
  setTimeout(() => itemPopup.classList.add("hidden"), 5000);
}

openBoxBtn.onclick = () => {
  if (!canOpenBoxNow()) return;
  performBoxOpen({ isFree: true });
};

guaranteeRareBtn.onclick = () => {
  if ((currentPlayerData?.dust || 0) < DUST_COST_RARE_BOX) return;
  performBoxOpen({ forcedRarity: "nadir", costDust: DUST_COST_RARE_BOX, isFree: false });
};

guaranteeLegendaryBtn.onclick = () => {
  if ((currentPlayerData?.dust || 0) < DUST_COST_LEGENDARY_BOX) return;
  performBoxOpen({ forcedRarity: "efsanevi", costDust: DUST_COST_LEGENDARY_BOX, isFree: false });
};

// ============================================================
// SALDIRI HEDEFLERİ
// ============================================================
function canAttackNow() {
  if (!currentPlayerData) return false;
  const lastWindow = currentPlayerData.lastAttackWindow ?? -1;
  return lastWindow !== getAttackWindowIndex();
}

function renderAttackTargets() {
  if (!currentPlayerData) return;
  const able = canAttackNow();

  if (!able) {
    const windowIdx = getAttackWindowIndex();
    const windowEnd = (windowIdx + 1) * ATTACK_COOLDOWN_MS;
    const remainMs = windowEnd - Date.now();
    attackStatus.textContent = `Bu saatlik saldırı hakkını kullandın. Sıradaki saldırı penceresi ${formatRemaining(remainMs)} sonra açılıyor.`;
  } else {
    attackStatus.textContent = "Saldırı hakkın hazır, birini seç! (Kullanmazsan bu pencere kapanır, bir daha kullanamazsın.)";
  }

  const targets = allPlayers.filter(p => p.id !== currentPlayerId);
  attackTargetsEl.innerHTML = targets.map(p => `
    <div class="attack-target-row">
      <div class="name">${p.name}</div>
      <div class="stats">⚔️${p.attack ?? BASE_ATTACK} 🛡️${p.defense ?? BASE_DEFENSE} · ${p.points ?? 0}⭐</div>
      <button data-id="${p.id}" ${able ? "" : "disabled"} style="${able ? "" : "opacity:.35;cursor:not-allowed;"}">Saldır</button>
    </div>
  `).join("");

  attackTargetsEl.querySelectorAll("button[data-id]").forEach(btn => {
    btn.onclick = () => runAttack(btn.getAttribute("data-id"));
  });
}

// ============================================================
// SAVAŞ ALGORİTMASI
// Statlar belirleyici, zar sadece küçük bir sürpriz.
// (Güç * 0.8) + (1-10 arası zar)  -- efsanevi pasifler bunun üstüne binebilir.
// ============================================================
function getEffect(equipment, effectName) {
  for (const s of SLOTS) {
    const item = equipment?.[s.key];
    if (item && item.effect === effectName) return item;
  }
  return null;
}

// ============================================================
// SAVAŞ LOGU MESAJ ÇEŞİTLİLİĞİ
// Durum bazlı (kazandı / kaybetti / aynı kişiye üst üste saldırdı)
// en az 5-6 farklı, eğlenceli mesaj havuzu.
// ============================================================
const WIN_MESSAGES = [
  "{attacker}, {defender}'in Amını götünü dağıttı! (+{winPts} / -{losePts})",
  "{attacker}, {defender}'e resmen köpeği yapıp Merkezefendi parkında gezdirdi. (+{winPts} / -{losePts})",
  "{attacker} sikti, {defender} Götünü tutarak kaçtı. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'i kanalize ederek darp etti. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'i Dinden çıkardı. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'e götten girdi. (+{winPts} / -{losePts})",
  "{attacker} Bu savaşa eli sikinde girdi, {defender} Korkudan bayıldı. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'i Götüne iki şaplak atıp gönderdi. (+{winPts} / -{losePts})"
];
const LOSE_MESSAGES = [
  "{attacker}, {defender}'e saldırdı ama siki tuttu. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker}, {defender}'in önünde secdeye kapanıp süphaneke okudu. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, gelen {attacker}'ı Alkol içirip arkadaşıyla sikti. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker} cesurca saldırdı ama {defender}'ı Sikine bile takmadı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, {attacker}'ın saldırısını Sikiyle savuşturdu. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker} bu sefer çok iddialıydı ama {defender} Cemalden izin alıp Mcdonalds tuvaletinde domalttı. ({defender} +{winPts} / {attacker} -{losePts})"
];
const REPEAT_WIN_MESSAGES = [
  "{attacker}, {defender}'i yine hedef seçti ve yine kazandı! Sikmeye Doyamadı bir türlü. ({repeatCount}. kez üst üste) (+{winPts} / -{losePts})",
  "{attacker}'ın {defender} ile özel bir derdi var galiba, üst üste {repeatCount}. kez saldırdı ve yine kazandı. (+{winPts} / -{losePts})",
  "{defender}, {attacker}'dan resmen çekiniyor olmalı, {repeatCount}. kez üst üste domaldı. (+{winPts} / -{losePts})"
];
const REPEAT_LOSE_MESSAGES = [
  "{attacker}, {defender}'e {repeatCount}. kez saldırdı ve yine eli boş döndü, inat mı bu? ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker} bu sefer de {defender}'i geçemedi, {repeatCount}. deneme de boşa gitti. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, {attacker}'ın {repeatCount}. saldırısını da geri çevirdi, artık gülünç oluyor. ({defender} +{winPts} / {attacker} -{losePts})"
];

function pickBattleMessage({ attackerWins, attackerName, defenderName, winPts, losePts, isRepeat, repeatCount }) {
  let pool;
  if (isRepeat && repeatCount >= 2) {
    pool = attackerWins ? REPEAT_WIN_MESSAGES : REPEAT_LOSE_MESSAGES;
  } else {
    pool = attackerWins ? WIN_MESSAGES : LOSE_MESSAGES;
  }
  const template = pick(pool);
  return template
    .replaceAll("{attacker}", attackerName)
    .replaceAll("{defender}", defenderName)
    .replaceAll("{winPts}", winPts)
    .replaceAll("{losePts}", losePts)
    .replaceAll("{repeatCount}", repeatCount);
}

async function runAttack(defenderId) {
  attackTargetsEl.querySelectorAll("button").forEach(b => b.disabled = true);
  sfxAttack();
  const dailyEvent = getTodaysEvent();

  try {
    await runTransaction(db, async (tx) => {
      const attackerRef = doc(db, PLAYERS_COL, currentPlayerId);
      const defenderRef = doc(db, PLAYERS_COL, defenderId);
      const attackerSnap = await tx.get(attackerRef);
      const defenderSnap = await tx.get(defenderRef);
      if (!attackerSnap.exists() || !defenderSnap.exists()) throw new Error("Oyuncu bulunamadı.");

      const attacker = attackerSnap.data();
      const defender = defenderSnap.data();

      const currentWindow = getAttackWindowIndex();
      if ((attacker.lastAttackWindow ?? -1) === currentWindow) {
        throw new Error("Bu saatlik saldırı penceresini zaten kullandın.");
      }

      const logDetails = [];
      const legendaryLog = [];

      // Aynı kişiye üst üste kaçıncı kez saldırdığını hesapla (mesaj çeşitliliği için)
      const isRepeat = attacker.lastAttackedId === defenderId;
      const repeatCount = isRepeat ? (attacker.attackStreakOnTarget || 1) + 1 : 1;

      // --- Nargile kılıcı: %20 ihtimalle saldıramaz ---
      const chillItem = getEffect(attacker.equipment, "chill_risk");
      if (chillItem && Math.random() < 0.2) {
        const skippedQuests = incrementQuestProgress(attacker.dailyQuests, "attack_count", 1);
        tx.update(attackerRef, {
          lastAttackTime: Date.now(),
          lastAttackWindow: currentWindow,
          ...(skippedQuests !== attacker.dailyQuests ? { dailyQuests: skippedQuests } : {})
        });
        logDetails.push(`${attacker.name}, Nargile Kılıcı'nın keyfine daldı ve saldıramadan bu seferki hakkını harcadı.`);
        tx.set(doc(collection(db, LOG_COL)), {
          attacker: attacker.name, defender: defender.name,
          message: logDetails.join(" "),
          winner: null, legendary: true,
          timestamp: Date.now()
        });
        return { skipped: true };
      }

      // --- Temel güç hesaplama (yeni, daha adil algoritma) ---
      // Zar artık sabit bir sayı değil: her taraf KENDİ gücünün ±%15'i kadar
      // oransal bir şans payı alıyor. Böylece düşük statlı biri yüksek statlıyı
      // sürekli yenemiyor, ama yakın maçlarda hâlâ ufak bir sürpriz kalıyor.
      // Ezici bir stat üstünlüğü (1.5 kat +) varsa şansa bakılmaksızın kazanılır.
      let baseAttack = attacker.attack;
      let baseDefense = defender.defense;

      // Lanet: defender bir önceki saldırıdan lanetliyse savunması düşer
      if (defender.curseNextAttack && defender.curseNextAttack.active) {
        baseDefense *= (1 - defender.curseNextAttack.reduction);
        legendaryLog.push(`${defender.name} üzerindeki Çingene Eldiveni laneti devreye girdi, savunması zayıfladı.`);
      }

      // Kambur zırhı / Kıl dönmesi kılıcı çarpanları
      if (getEffect(defender.equipment, "defense_multiplier")) {
        baseDefense *= 1.15;
        legendaryLog.push(`${defender.name}'in Kambur Zırhı savunmasını güçlendirdi.`);
      }
      if (getEffect(attacker.equipment, "attack_multiplier")) {
        baseAttack *= 1.15;
        legendaryLog.push(`${attacker.name}'in Kıl Dönmesi Kılıcı saldırısını güçlendirdi.`);
      }

      // Günün olayı: küresel saldırı/savunma/şans çarpanları
      baseAttack *= dailyEvent.attackMult;
      baseDefense *= dailyEvent.defenseMult;

      const critItem = getEffect(attacker.equipment, "crit_instant_win");
      const critTriggered = !!(critItem && Math.random() < 0.1);

      let attackPower, defensePower, attackerWins;

      if (critTriggered) {
        attackPower = baseAttack; defensePower = baseDefense;
        attackerWins = true;
        legendaryLog.push(`${attacker.name}'in Sarı Diş Kılıcı aniden ısırdı, hesaplama boşa gitti ve anında kazandı!`);
      } else if (baseAttack >= baseDefense * DOMINANCE_RATIO) {
        attackPower = baseAttack; defensePower = baseDefense;
        attackerWins = true;
      } else if (baseDefense >= baseAttack * DOMINANCE_RATIO) {
        attackPower = baseAttack; defensePower = baseDefense;
        attackerWins = false;
      } else {
        const spread = 0.15 * dailyEvent.varianceMult;
        let attackRoll = (1 - spread) + Math.random() * (spread * 2);
        let defenseRoll = (1 - spread) + Math.random() * (spread * 2);

        // Şanslı savunma eşyaları: zar 2 kez atılır, iyisi sayılır (avantaj mekaniği)
        if (getEffect(defender.equipment, "lucky_defense_roll")) {
          const secondRoll = (1 - spread) + Math.random() * (spread * 2);
          defenseRoll = Math.max(defenseRoll, secondRoll);
          legendaryLog.push(`${defender.name}'in şanslı eşyası zarı 2 kez attı, iyisini seçti.`);
        }

        attackPower = baseAttack * attackRoll;
        defensePower = baseDefense * defenseRoll;
        attackerWins = attackPower >= defensePower;
      }

      const diff = Math.abs(attackPower - defensePower);

      let attackerPoints = attacker.points || 0;
      let defenderPoints = defender.points || 0;

      let newCurseForDefenderTarget = null; // çingene eldiveni tetiklenirse rakibe (sıradaki savunmasına) yansır

      if (attackerWins) {
        let winPts = 10, losePts = 5;

        // Portakal suyu kılıcı: rakip gücünün %30'undan fazla farkla kazanırsa ekstra 2 çalar
        if (!critTriggered && getEffect(attacker.equipment, "steal_extra_on_big_win") && diff > defensePower * 0.3) {
          winPts += 2; losePts += 2;
          legendaryLog.push(`${attacker.name}'in Portakal Suyu Kılıcı ezici farktan ekstra 2 puan çaldı.`);
        }
        // Nargile kılıcı: kazanırsa +3 ekstra
        if (getEffect(attacker.equipment, "chill_risk")) {
          winPts += 3;
          legendaryLog.push(`${attacker.name}'in Nargile Kılıcı keyifli bir zafer bonusu verdi (+3).`);
        }
        // Yasin ercile zırhı: defender kaybetse de puan kaybetmez
        if (getEffect(defender.equipment, "no_loss_on_defense_lose")) {
          losePts = 0;
          legendaryLog.push(`${defender.name}'in Yasin Ercile Zırhı sayesinde hiç puan kaybetmedi.`);
        }
        // Yırtık menüsküs: kaybederse sadece 2 kaybeder
        else if (getEffect(defender.equipment, "reduced_loss")) {
          losePts = Math.min(losePts, 2);
          legendaryLog.push(`${defender.name}'in Yırtık Menüsküs Ayakkabıları sayesinde daha az puan kaybetti.`);
        }
        // Cüce botları: defender kaybetse bile intikamla 3 puan çalar
        if (getEffect(defender.equipment, "revenge_steal")) {
          winPts = Math.max(0, winPts - 3);
          defenderPoints += 3;
          legendaryLog.push(`${defender.name}'in Cüce Botları intikam alıp saldırandan 3 puan çaldı.`);
        }

        attackerPoints += Math.round(winPts * dailyEvent.pointsMult);
        defenderPoints = Math.max(0, defenderPoints - Math.round(losePts * dailyEvent.pointsMult));

        // Çingene eldiveni: kazanırsa rakibe lanet
        if (getEffect(attacker.equipment, "curse_defense_next")) {
          newCurseForDefenderTarget = { active: true, reduction: 0.2 };
          legendaryLog.push(`${attacker.name}'in Çingene Eldiveni ${defender.name}'e lanet okudu.`);
        }

        logDetails.push(pickBattleMessage({ attackerWins: true, attackerName: attacker.name, defenderName: defender.name, winPts, losePts, isRepeat, repeatCount }));
      } else {
        let winPts = 5, losePts = 3;

        // Dana kaskı: savunmada kazanırsa +5 ekstra
        if (getEffect(defender.equipment, "bonus_win_defense")) {
          winPts += 5;
          legendaryLog.push(`${defender.name}'in Dana Kaskı savunma zaferine +5 bonus kattı.`);
        }

        defenderPoints += Math.round(winPts * dailyEvent.pointsMult);
        attackerPoints = Math.max(0, attackerPoints - Math.round(losePts * dailyEvent.pointsMult));

        logDetails.push(pickBattleMessage({ attackerWins: false, attackerName: attacker.name, defenderName: defender.name, winPts, losePts, isRepeat, repeatCount }));
      }

      // Attacker'ın kendi laneti varsa bu savaşta kullanılmış olur (temizle)
      const attackerCurseClear = attacker.curseNextAttack ? null : undefined;

      // Günlük görev ilerlemesi: her saldırı denemesi, kazanılan savaş, ve
      // varsa "şu oyuncuyu yen" hedefi
      let attackerQuests = incrementQuestProgress(attacker.dailyQuests, "attack_count", 1);
      if (attackerWins) {
        attackerQuests = incrementQuestProgress(attackerQuests, "battle_win", 1);
        attackerQuests = incrementQuestProgress(attackerQuests, "defeat_player", 1, { targetPlayerId: defenderId });
      }

      tx.update(attackerRef, {
        points: attackerPoints,
        lastAttackTime: Date.now(),
        lastAttackWindow: currentWindow,
        lastAttackedId: defenderId,
        attackStreakOnTarget: repeatCount,
        ...(attacker.curseNextAttack ? { curseNextAttack: null } : {}),
        ...(attackerQuests !== attacker.dailyQuests ? { dailyQuests: attackerQuests } : {})
      });
      tx.update(defenderRef, {
        points: defenderPoints,
        ...(newCurseForDefenderTarget ? { curseNextAttack: newCurseForDefenderTarget } : {})
      });

      const fullMessage = [...logDetails, ...legendaryLog].join(" ");
      tx.set(doc(collection(db, LOG_COL)), {
        attacker: attacker.name,
        defender: defender.name,
        message: fullMessage,
        winner: attackerWins ? attacker.name : defender.name,
        legendary: legendaryLog.length > 0,
        timestamp: Date.now()
      });

      return {
        skipped: false,
        attackerWins, attackPower: Math.round(attackPower), defensePower: Math.round(defensePower),
        message: fullMessage, legendaryLog
      };
    }).then(result => {
      if (result && !result.skipped) showResultModal(result);
      else if (result && result.skipped) showResultModal({ skipped: true });
    });
  } catch (e) {
    alert("Saldırı gönderilemedi: " + e.message);
  } finally {
    renderAttackTargets();
  }
}

function showResultModal(result) {
  if (result.stranger) {
    resultContent.innerHTML = `
      <div class="result-title ${result.won ? "win" : "lose"}">${result.won ? "🏆 Kazandın!" : "🤝 Bu Sefer Olmadı"}</div>
      <p class="result-line">${result.name} ile girdiğin düellodan ${result.won ? `+${result.reward} toz kazanarak` : "hiçbir kayıp olmadan"} çıktın.</p>`;
  } else if (result.skipped) {
    resultContent.innerHTML = `
      <div class="result-title lose">💨 Nargile Keyfi</div>
      <p class="result-line">Bu sefer saldıramadan hakkın harcandı.</p>`;
  } else {
    const won = result.attackerWins;
    resultContent.innerHTML = `
      <div class="result-title ${won ? "win" : "lose"}">${won ? "🏆 Kazandın!" : "💀 Kaybettin!"}</div>
      <p class="result-line">Senin Gücün: ${result.attackPower} &nbsp;|&nbsp; Rakip Gücü: ${result.defensePower}</p>
      ${result.legendaryLog.length ? `<div class="result-passive">${result.legendaryLog.join("<br>")}</div>` : ""}
    `;
  }
  resultModal.classList.remove("hidden");
}
closeResultBtn.onclick = () => resultModal.classList.add("hidden");

// ============================================================
// RENDER: SAVAŞ GEÇMİŞİ
// ============================================================
function renderBattleLog(entries) {
  if (!entries.length) {
    battleLogEl.innerHTML = `<p class="box-status">Henüz savaş yok, ilk saldırıyı sen yap!</p>`;
    return;
  }
  battleLogEl.innerHTML = entries.map(e => {
    const cls = e.legendary ? "legendary-trigger" : (e.winner ? "win" : "");
    const time = e.timestamp ? new Date(e.timestamp).toLocaleString("tr-TR") : "";
    return `<div class="log-entry ${cls}">${e.message}<span class="log-time">${time}</span></div>`;
  }).join("");
}

// ============================================================
// SES EFEKTLERİ
// Tasarım prototipindeki gibi, dışarıdan hiçbir ses dosyası kullanılmadan
// Web Audio API osilatörleriyle anlık üretiliyor. Oyunun mevcut mantığına
// dokunmadan (skor/kutu/saldırı hesapları aynı), sadece geri bildirim katmanı.
// ============================================================
let audioCtx = null;
let soundOn = localStorage.getItem("gacha_sound_on") !== "0";

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(freq, start, dur, type = "sine", gain = 0.18) {
  if (!soundOn) return;
  try {
    const ctx = ensureAudioCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.value = 0;
    osc.connect(g); g.connect(ctx.destination);
    const t0 = ctx.currentTime + start;
    g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  } catch (e) { /* sessiz geç, ses opsiyonel bir katman */ }
}

function sfxClick() { tone(520, 0, 0.08, "square", 0.10); }
function sfxShake() { tone(140, 0, 0.09, "sawtooth", 0.12); tone(110, 0.06, 0.09, "sawtooth", 0.10); }
function sfxOpenStandart() { tone(660, 0, 0.12, "triangle"); tone(880, 0.08, 0.15, "triangle"); }
function sfxOpenRare() { tone(520, 0, 0.1, "triangle"); tone(780, 0.09, 0.12, "triangle"); tone(1040, 0.18, 0.2, "triangle"); }
function sfxOpenLegendary() {
  [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.09, 0.35, "triangle", 0.16));
  tone(1568, 0.45, 0.5, "sine", 0.14);
}
function sfxAttack() { tone(200, 0, 0.05, "sawtooth", 0.15); tone(90, 0.05, 0.18, "sawtooth", 0.18); }

const soundToggleBtn = document.getElementById("soundToggleBtn");
function refreshSoundBtn() {
  if (!soundToggleBtn) return;
  soundToggleBtn.textContent = soundOn ? "🔊" : "🔇";
}
refreshSoundBtn();
if (soundToggleBtn) {
  soundToggleBtn.onclick = () => {
    soundOn = !soundOn;
    localStorage.setItem("gacha_sound_on", soundOn ? "1" : "0");
    refreshSoundBtn();
    if (soundOn) sfxClick();
  };
}

// Genel tık sesi: mevcut butonların hiçbirinin davranışını değiştirmeden,
// sadece her buton tıklamasında kısa bir "click" sesi çalar (event delegation).
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || btn.disabled) return;
  if (btn.id === "soundToggleBtn") return; // kendi sesini kendi yönetiyor
  sfxClick();
}, true);

// ============================================================
// ALT NAVİGASYON BARI (tasarım prototipindeki gibi)
// Oyunun tek sayfalık grid yapısını bozmadan, ilgili bölüme yumuşak
// kaydırma yapar ve aktif sekmeyi işaretler.
// ============================================================
const bottomNav = document.getElementById("bottomNav");
if (bottomNav) {
  const navButtons = [...bottomNav.querySelectorAll(".nav-btn")];
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      navButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-target");
      const target = document.getElementById(targetId);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

// ============================================================
// BAŞLAT
// ============================================================
if (currentPlayerId) {
  startGame().catch(() => showLoginScreen());
} else {
  showLoginScreen();
}
