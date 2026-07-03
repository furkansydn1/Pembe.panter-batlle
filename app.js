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
const ATTACK_COOLDOWN_MS = 24 * 60 * 60 * 1000;      // günde 1 saldırı
const BOX_COOLDOWN_MS = 4 * 60 * 60 * 1000;          // 4 saatte 1 kutu

// Temel şans oranları (yüzde). 4 saatte bir açıldığı için (günde ~6 kutu)
// eskisinden çok daha zor: efsanevi ve nadir oranları düşürüldü.
const BASE_LEGENDARY_CHANCE = 0.5;
const BASE_RARE_CHANCE = 6;

// Pity (şans telafisi) eşikleri: uzun süre efsanevi/nadir çıkmayana şansı yavaşça artar,
// belli bir noktadan sonra garanti verir.
const RARE_PITY_SOFT_START = 8;    // 8 kutudan sonra nadir şansı artmaya başlar
const RARE_PITY_HARD = 15;         // 15 kutudur nadir yoksa garanti nadir
const LEGENDARY_PITY_SOFT_START = 15; // 15 kutudan sonra efsanevi şansı artmaya başlar
const LEGENDARY_PITY_HARD = 40;       // 40 kutudur efsanevi yoksa garanti efsanevi

// Toz (dust) ekonomisi: eski eşya yeni eşyayla değişince nadirliğine göre toz kazanılır.
const DUST_FROM_RARITY = { standart: 1, nadir: 3, efsanevi: 8 };
const DUST_COST_RARE_BOX = 12;
const DUST_COST_LEGENDARY_BOX = 35;

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
    desc: "Kazanırsa 3 puan fazladan alır, ama %20 ihtimalle nargile keyfine dalıp o gün saldıramaz." },
  { name: "Yeşil kaş Kaskı", slot: "kask", atk: 3, def: 24, effect: "lucky_defense_roll",
    desc: "Savunmadayken zar atışı 2 katı sayılır, şansı yaver gider." },
  { name: "Kirli Kel Kaskı", slot: "kask", atk: 4, def: 24, effect: "revenge_steal",
    desc: "Savunmada kaybetse bile taş çatlasa saldırandan 3 puan çalar." },
  { name: "Yamuk Ömer zırhı", slot: "zirh", atk: 3, def: 25, effect: "no_loss_on_defense_lose",
    desc: "Savunmadayken maçı kaybetse bile puanı asla düşmez." },
  { name: "Salyangoz ayakkabıları", slot: "ayakkabi", atk: 2, def: 23, effect: "lucky_defense_roll",
    desc: "Yavaş ama sağlam: savunmadayken zar atışı 2 katı sayılır." },
  { name: "Deli Necmi eldiveni", slot: "eldiven", atk: 25, def: 4, effect: "attack_multiplier",
    desc: "Saldırı gücü hesaplamasında %15 fazladan bonus verir." },
  { name: "Pas geçen eldiven", slot: "eldiven", atk: 21, def: 6, effect: "chill_risk",
    desc: "Kazanırsa 3 puan fazladan alır, ama %20 ihtimalle o gün saldırıyı pas geçer." }
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

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

// Pity'li şans hesabı: pityRare/pityLegendary = son nadir/efsanevi'den beri kaç kutu açıldı.
function rollRarity(pityRare, pityLegendary) {
  if (pityLegendary >= LEGENDARY_PITY_HARD) return "efsanevi";
  if (pityRare >= RARE_PITY_HARD) return "nadir";

  const legChance = BASE_LEGENDARY_CHANCE + Math.max(0, pityLegendary - LEGENDARY_PITY_SOFT_START) * 0.4;
  const rareChance = BASE_RARE_CHANCE + Math.max(0, pityRare - RARE_PITY_SOFT_START) * 1;

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

function generateLootItemForRarity(slot, rarity) {
  const slotInfo = SLOT_MAP[slot];

  if (rarity === "efsanevi") {
    const options = LEGENDARY_BY_SLOT[slot];
    const base = pick(options);
    return {
      name: base.name, slot, rarity,
      atk: base.atk, def: base.def,
      effect: base.effect, effectDesc: base.desc
    };
  }

  if (rarity === "nadir") {
    const name = pick(RARE_NAMES[slot]);
    const primary = randInt(8, 15);
    const secondary = randInt(1, 4);
    return {
      name, slot, rarity,
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
    name, slot, rarity,
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
const newPlayerBtn = document.getElementById("newPlayerBtn");
const loginError = document.getElementById("loginError");

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

const attackTargetsEl = document.getElementById("attackTargets");
const attackStatus = document.getElementById("attackStatus");

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
const LATEST_UPDATE_VERSION = "1.3";

const CHANGELOG = [
  { version: "1.3", status: "done", title: "⚖️ Puanlama Dengesi",
    desc: "Saldırıp kazanırsan +10/-5 aynı kalıyor. Ama saldırıp kaybedersen artık sadece -3 puan kaybediyorsun, savunan kazanınca +5 alıyor. Saldırmak daha az riskli." },
  { version: "1.3", status: "done", title: "📖 Eşya Koleksiyon Kitabı",
    desc: "Bugüne kadar bulduğun tüm eşyalar bir kitapta toplanıyor, bulamadıkların '???' olarak görünüyor. Her slotta 20+ farklı eşya var, hepsini toplamaya çalış!" },
  { version: "1.3", status: "done", title: "💬 Çeşitlenmiş Savaş Logları",
    desc: "Kazanma, kaybetme ve aynı kişiye üst üste saldırma durumlarına özel, birbirinden farklı komik mesajlar eklendi." },
  { version: "1.2", status: "done", title: "⏱️ 4 Saatte Bir Kutu, Günde 1 Savaş",
    desc: "Kutu açma hakkı artık 4 saatte bir yenileniyor ama nadir/efsanevi düşme şansı ciddi şekilde zorlaştırıldı. Savaş hakkı da haftalıktan günlüğe indi." },
  { version: "1.2", status: "done", title: "🍀 Pity Sistemi",
    desc: "Uzun süredir efsanevi/nadir düşmeyene şans yavaşça artar, belli bir noktadan sonra garanti verilir." },
  { version: "1.2", status: "done", title: "🔥 Streak Bonusu",
    desc: "Art arda gün kutu açtıkça seri oluşur: 3 günde garanti nadir, 7 günde (ve katlarında) garanti efsanevi bonusu." },
  { version: "1.2", status: "done", title: "♻️ Toz & Garanti Kutu",
    desc: "Yeni eşya eskisinin yerini alırken eski eşya toza çevrilir. Biriken tozla garantili Nadir ya da Efsanevi kutu satın alınabilir." },
  { version: "1.2", status: "done", title: "🎯 Eşit Dağılım Sistemi",
    desc: "Aynı slotun (örn. hep Kılıç) üst üste çıkması engellendi, düşme şansı diğer slotlara göre otomatik dengeleniyor." },
  { version: "1.2", status: "done", title: "✨ Epik Kutu Animasyonları",
    desc: "Nadirlik arttıkça animasyon da büyüyor: parçacık patlamaları, efsanevide ekran flaşı ve daha uzun sahne." },
  { version: "1.1", status: "done", title: "Yeni İsim & Yana Kaydırmalı Tanıtım",
    desc: "Oyun adı Pembe Panterler Battle oldu, tanıtım ekranı slaytlarla anlatan bir carousel'e dönüştü." },
  { version: "1.0", status: "done", title: "Oyunun Temeli",
    desc: "Kutu açma, kuşanım, savaş, liderlik tablosu ve savaş geçmişi ile ilk sürüm yayında." },
  { version: "soon", status: "soon", title: "😤 Rövanş Hakkı",
    desc: "Kaybettiğin savaştan sonra o kişiye özel, günlük cooldown'dan bağımsız bir intikam saldırısı." },
  { version: "soon", status: "soon", title: "⚖️ Dengeli Hedef Seçimi",
    desc: "Sadece sıralamada sana yakın olanlara saldırabilme, güçlünün zayıfı ezmesini engelleme." },
  { version: "soon", status: "soon", title: "🥇 Günün MVP'si",
    desc: "O gün en iyi performansı gösteren oyuncuya özel rozet." },
  { version: "soon", status: "soon", title: "🏅 Rozet & Unvan Sistemi",
    desc: "'3 hafta üst üste 1. oldu', '5 efsanevi eşya topladı' gibi başarımlar profilde görünsün." },
  { version: "soon", status: "soon", title: "📅 Haftalık/Aylık Sezon",
    desc: "Liderlik tablosu periyodik sıfırlansın, geçmiş şampiyonlar Hall of Fame listesinde tutulsun." },
  { version: "soon", status: "soon", title: "🔔 Anlık Bildirimler",
    desc: "Biri efsanevi eşya bulduğunda ya da sana saldırdığında ekranda anlık bir bildirim çıksın." },
  { version: "soon", status: "soon", title: "🙂 Karakter Avatarı",
    desc: "Kayıt olurken emoji/renk seçimi, liderlik tablosunda ve savaş logunda görünsün." },
  { version: "soon", status: "soon", title: "🔊 Ses Efektleri",
    desc: "Kutu açılışı ve savaş kazanma/kaybetmede kısa ses efektleri." },
  { version: "soon", status: "soon", title: "🎉 Confetti Efekti",
    desc: "Efsanevi eşya çıktığında ekranda altın confetti patlasın." },
  { version: "soon", status: "soon", title: "🐉 Sunucu Boss'u",
    desc: "Haftada bir gün herkesin ortak saldırabileceği devasa bir boss çıksın, en çok hasar veren ekstra ödül alsın." }
];

function renderUpdatesList() {
  updatesList.innerHTML = CHANGELOG.map(u => `
    <div class="update-entry ${u.status}">
      <div class="update-entry-top">
        <div class="update-entry-title">${u.title}</div>
        <span class="update-badge ${u.status}">${u.status === "done" ? "✅ EKLENDİ" : "⏳ YAKINDA"}</span>
      </div>
      <div class="update-entry-desc">${u.desc}</div>
    </div>
  `).join("");
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
    btn.onclick = () => selectPlayer(p.id);
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
  if (!name) { loginError.textContent = "Bir isim yaz kral."; return; }
  if (name.length > 16) { loginError.textContent = "İsim çok uzun."; return; }

  const players = await loadPlayersOnce();
  if (players.length >= MAX_PLAYERS) { loginError.textContent = "Kontenjan dolu (7/7)."; return; }
  if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    loginError.textContent = "Bu isim zaten alınmış."; return;
  }

  newPlayerBtn.disabled = true;
  try {
    const newDoc = await addDoc(collection(db, PLAYERS_COL), {
      name,
      points: 0,
      attack: BASE_ATTACK,
      defense: BASE_DEFENSE,
      equipment: emptyEquipment(),
      lastBoxOpenTime: 0,
      lastAttackTime: 0,
      curseNextAttack: null,
      dust: 0,
      pityRare: 0,
      pityLegendary: 0,
      boxStreak: 0,
      lastBoxOpenDay: null,
      recentSlots: [],
      lastAttackedId: null,
      attackStreakOnTarget: 0,
      discoveredItems: [],
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

  maybeShowTutorial();

  // Kendi oyuncu belgemi canlı dinle
  onSnapshot(ref, (docSnap) => {
    if (!docSnap.exists()) return;
    currentPlayerData = { id: docSnap.id, ...docSnap.data() };
    renderMyStats();
    renderEquipment();
    renderBoxStatus();
    renderAttackTargets();
    if (!collectionModal.classList.contains("hidden")) renderCollection();
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
      <div class="lb-row ${isMe ? "me" : ""}">
        <div class="lb-rank ${rankClass}">${i + 1}</div>
        <div class="lb-info">
          <div class="lb-name">${p.name}${isMe ? " (sen)" : ""}</div>
          <div class="lb-stats">⚔️ ${p.attack ?? BASE_ATTACK} &nbsp; 🛡️ ${p.defense ?? BASE_DEFENSE}</div>
        </div>
        <div class="lb-points">${p.points ?? 0}</div>
      </div>`;
  }).join("");
}

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
function renderEquipment() {
  const eq = currentPlayerData?.equipment || emptyEquipment();
  equipmentGridEl.innerHTML = SLOTS.map(s => {
    const item = eq[s.key];
    const rarityClass = item ? `rarity-${item.rarity}` : "";
    return `
      <div class="equip-slot ${item ? "filled" : ""} ${rarityClass}">
        <div class="equip-slot-icon">${s.icon}</div>
        <div class="equip-slot-label">${s.label}</div>
        <div class="equip-slot-item ${item ? "" : "empty"}">${item ? item.name : "Boş"}</div>
      </div>`;
  }).join("");
}

// ============================================================
// KUTU AÇMA
// ============================================================
function canOpenBoxNow() {
  if (!currentPlayerData) return false;
  const last = currentPlayerData.lastBoxOpenTime || 0;
  return Date.now() - last >= BOX_COOLDOWN_MS;
}

function renderBoxStatus() {
  const able = canOpenBoxNow();
  openBoxBtn.disabled = !able;

  if (able) {
    boxStatus.textContent = "Kutu açmaya hazır! (4 saatte 1 kez)";
  } else {
    const remain = BOX_COOLDOWN_MS - (Date.now() - (currentPlayerData.lastBoxOpenTime || 0));
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
  const rarity = finalForcedRarity || rollRarity(pityRare, pityLegendary);
  const slot = pickSlotWeighted(recentSlots);
  const item = generateLootItemForRarity(slot, rarity);

  const streakBonusFired = !!streakForcedRarity && !forcedRarity;

  lootBox.className = `loot-box burst-${item.rarity}`;
  spawnSparks(item.rarity);

  const animDuration = item.rarity === "efsanevi" ? 1900 : item.rarity === "nadir" ? 1400 : 1000;
  await new Promise(r => setTimeout(r, animDuration));

  itemPopupInner.className = `item-popup-inner rarity-${item.rarity}`;
  itemPopupInner.innerHTML = `
    ${streakBonusFired ? `<div class="streak-bonus-tag">🔥 ${newStreak} Günlük Seri Bonusu!</div>` : ""}
    <div class="item-popup-icon">${SLOT_MAP[item.slot].icon}</div>
    <div class="item-popup-name rarity-${item.rarity}">${item.name}</div>
    <div class="item-popup-stats">⚔️ +${item.atk} &nbsp; 🛡️ +${item.def} &nbsp; · ${item.rarity.toUpperCase()}</div>
    ${item.effectDesc ? `<div class="item-popup-passive">✨ ${item.effectDesc}</div>` : ""}
  `;
  itemPopup.classList.remove("hidden");

  // Pity sayaçlarını güncelle
  let newPityRare = pityRare + 1;
  let newPityLegendary = pityLegendary + 1;
  if (rarity === "nadir" || rarity === "efsanevi") newPityRare = 0;
  if (rarity === "efsanevi") newPityLegendary = 0;

  // Eski eşya varsa toza çevrilir
  const oldItem = (data.equipment || emptyEquipment())[slot];
  const dustGain = oldItem ? (DUST_FROM_RARITY[oldItem.rarity] || 0) : 0;
  const newDust = Math.max(0, (data.dust || 0) + dustGain - costDust);

  const newRecentSlots = [...recentSlots, slot].slice(-8);
  const newEquipment = { ...(data.equipment || emptyEquipment()), [slot]: item };
  const stats = computeStatsFromEquipment(newEquipment);
  const newDiscovered = Array.from(new Set([...(data.discoveredItems || []), item.name]));

  const updatePayload = {
    equipment: newEquipment,
    attack: stats.attack,
    defense: stats.defense,
    pityRare: newPityRare,
    pityLegendary: newPityLegendary,
    dust: newDust,
    recentSlots: newRecentSlots,
    discoveredItems: newDiscovered
  };
  if (isFree) {
    updatePayload.lastBoxOpenTime = Date.now();
    updatePayload.boxStreak = newStreak;
    updatePayload.lastBoxOpenDay = newLastBoxOpenDay;
  }

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), updatePayload);

  lootBox.className = "loot-box";
  setTimeout(() => itemPopup.classList.add("hidden"), 3800);
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
  const last = currentPlayerData.lastAttackTime || 0;
  return Date.now() - last >= ATTACK_COOLDOWN_MS;
}

function renderAttackTargets() {
  if (!currentPlayerData) return;
  const able = canAttackNow();

  if (!able) {
    const last = currentPlayerData.lastAttackTime || 0;
    const remainMs = ATTACK_COOLDOWN_MS - (Date.now() - last);
    attackStatus.textContent = last === 0
      ? "Saldırı hakkın hazır!"
      : `Bugünkü saldırı hakkını kullandın. ${formatRemaining(remainMs)} sonra tekrar saldırabilirsin.`;
  } else {
    attackStatus.textContent = "Günlük saldırı hakkın hazır, birini seç!";
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
  "{attacker}, {defender}'i yerle bir etti! (+{winPts} / -{losePts})",
  "{attacker}, {defender}'e resmen tarih dersi verdi. (+{winPts} / -{losePts})",
  "{attacker} kazandı, {defender} sahayı ağlayarak terk etti. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'i turnayı gözünden vurdu. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'e diz çöktürdü. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'e götten girdi. (+{winPts} / -{losePts})",
  "{attacker} bu maçı fondip yaptı, {defender} elendi. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'i evine gönderdi. (+{winPts} / -{losePts})"
];
const LOSE_MESSAGES = [
  "{attacker}, {defender}'e saldırdı ama fena çuvalladı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker}, {defender}'in savunmasına toslayıp geri döndü. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, gelen {attacker}'ı ters köşeye yatırdı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker} cesurca saldırdı ama {defender} onu eve yolladı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, {attacker}'ın saldırısını fiyaskoyla savuşturdu. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker} bu sefer çok iddialıydı ama {defender} güldü geçti. ({defender} +{winPts} / {attacker} -{losePts})"
];
const REPEAT_WIN_MESSAGES = [
  "{attacker}, {defender}'i yine hedef seçti ve yine kazandı! Bu artık gelenek oldu. ({repeatCount}. kez üst üste) (+{winPts} / -{losePts})",
  "{attacker}'ın {defender} ile özel bir derdi var galiba, üst üste {repeatCount}. kez saldırdı ve yine kazandı. (+{winPts} / -{losePts})",
  "{defender}, {attacker}'dan resmen çekiniyor olmalı, {repeatCount}. kez üst üste yenildi. (+{winPts} / -{losePts})"
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

  try {
    await runTransaction(db, async (tx) => {
      const attackerRef = doc(db, PLAYERS_COL, currentPlayerId);
      const defenderRef = doc(db, PLAYERS_COL, defenderId);
      const attackerSnap = await tx.get(attackerRef);
      const defenderSnap = await tx.get(defenderRef);
      if (!attackerSnap.exists() || !defenderSnap.exists()) throw new Error("Oyuncu bulunamadı.");

      const attacker = attackerSnap.data();
      const defender = defenderSnap.data();

      if (Date.now() - (attacker.lastAttackTime || 0) < ATTACK_COOLDOWN_MS) {
        throw new Error("Bugünkü saldırı hakkını zaten kullandın.");
      }

      const logDetails = [];
      const legendaryLog = [];

      // Aynı kişiye üst üste kaçıncı kez saldırdığını hesapla (mesaj çeşitliliği için)
      const isRepeat = attacker.lastAttackedId === defenderId;
      const repeatCount = isRepeat ? (attacker.attackStreakOnTarget || 1) + 1 : 1;

      // --- Nargile kılıcı: %20 ihtimalle saldıramaz ---
      const chillItem = getEffect(attacker.equipment, "chill_risk");
      if (chillItem && Math.random() < 0.2) {
        tx.update(attackerRef, { lastAttackTime: Date.now() });
        logDetails.push(`${attacker.name}, Nargile Kılıcı'nın keyfine daldı ve saldıramadan gününü harcadı.`);
        tx.set(doc(collection(db, LOG_COL)), {
          attacker: attacker.name, defender: defender.name,
          message: logDetails.join(" "),
          winner: null, legendary: true,
          timestamp: Date.now()
        });
        return { skipped: true };
      }

      // --- Temel güç hesaplama ---
      let attackPower = attacker.attack * 0.8;
      let defensePower = defender.defense * 0.8;

      // Lanet: defender bir önceki saldırıdan lanetliyse savunması düşer
      if (defender.curseNextAttack && defender.curseNextAttack.active) {
        defensePower *= (1 - defender.curseNextAttack.reduction);
        legendaryLog.push(`${defender.name} üzerindeki Çingene Eldiveni laneti devreye girdi, savunması zayıfladı.`);
      }

      // Kambur zırhı / Kıl dönmesi kılıcı çarpanları
      if (getEffect(defender.equipment, "defense_multiplier")) {
        defensePower *= 1.15;
        legendaryLog.push(`${defender.name}'in Kambur Zırhı savunmasını güçlendirdi.`);
      }
      if (getEffect(attacker.equipment, "attack_multiplier")) {
        attackPower *= 1.15;
        legendaryLog.push(`${attacker.name}'in Kıl Dönmesi Kılıcı saldırısını güçlendirdi.`);
      }

      // Zarlar
      let attackerRoll = randInt(1, 10);
      let defenderRoll = randInt(1, 10);

      // Yeşil kaş kaskı: savunma zarı 2 katı
      if (getEffect(defender.equipment, "lucky_defense_roll")) {
        defenderRoll *= 2;
        legendaryLog.push(`${defender.name}'in Yeşil Kaş Kaskı şansı yaver gitti, zarı 2 katına çıktı.`);
      }

      attackPower += attackerRoll;
      defensePower += defenderRoll;

      // Sarı diş kılıcı: %10 anında kazanma
      const critItem = getEffect(attacker.equipment, "crit_instant_win");
      let attackerWins;
      let critTriggered = false;
      if (critItem && Math.random() < 0.1) {
        attackerWins = true;
        critTriggered = true;
        legendaryLog.push(`${attacker.name}'in Sarı Diş Kılıcı aniden ısırdı, hesaplama boşa gitti ve anında kazandı!`);
      } else {
        attackerWins = attackPower >= defensePower;
      }

      const diff = Math.abs(attackPower - defensePower);

      let attackerPoints = attacker.points || 0;
      let defenderPoints = defender.points || 0;

      let newCurseForDefenderTarget = null; // çingene eldiveni tetiklenirse rakibe (sıradaki savunmasına) yansır

      if (attackerWins) {
        let winPts = 10, losePts = 5;

        // Portakal suyu kılıcı: fark 5'ten büyükse ekstra 2 çalar
        if (!critTriggered && getEffect(attacker.equipment, "steal_extra_on_big_win") && diff > 5) {
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

        attackerPoints += winPts;
        defenderPoints = Math.max(0, defenderPoints - losePts);

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

        defenderPoints += winPts;
        attackerPoints = Math.max(0, attackerPoints - losePts);

        logDetails.push(pickBattleMessage({ attackerWins: false, attackerName: attacker.name, defenderName: defender.name, winPts, losePts, isRepeat, repeatCount }));
      }

      // Attacker'ın kendi laneti varsa bu savaşta kullanılmış olur (temizle)
      const attackerCurseClear = attacker.curseNextAttack ? null : undefined;

      tx.update(attackerRef, {
        points: attackerPoints,
        lastAttackTime: Date.now(),
        lastAttackedId: defenderId,
        attackStreakOnTarget: repeatCount,
        ...(attacker.curseNextAttack ? { curseNextAttack: null } : {})
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
  if (result.skipped) {
    resultContent.innerHTML = `
      <div class="result-title lose">💨 Nargile Keyfi</div>
      <p class="result-line">Bugün saldıramadan günün geçti.</p>`;
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
// BAŞLAT
// ============================================================
if (currentPlayerId) {
  startGame().catch(() => showLoginScreen());
} else {
  showLoginScreen();
}
