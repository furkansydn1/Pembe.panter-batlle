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
const MAX_PLAYERS = 9;
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
// ŞANSLI ÇARK
// Haftada bir kez bedava çevirme hakkı, küçük toz/puan bonusları verir.
// ============================================================
const WHEEL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // günde 1 çevirme
// "Karanlık Kader Çarkı" teması: her segmentin artık kompakt bir val/lbl
// (örn. "+5" / "TOZ") çifti ve kendine özgü bir "glow" (parlama) rengi var.
// JACKPOT'un eski uzun tek satırlık etiketi ("JACKPOT! +15 Puan +20 Toz")
// çemberden taşıyordu; artık val="JACKPOT" + lbl="+15⭐ +20✨" şeklinde iki
// kısa satıra bölündü ve rozet sabit bir maksimum genişlikte tutulduğu için
// taşma tamamen ortadan kalktı. dust/points/weight/type/id alanları ve ödül
// mantığı BİREBİR aynı kaldı, sadece görsel metadata eklendi.
const WHEEL_SEGMENTS = [
  { id: "dust_small", label: "+5 Toz", val: "+5", lbl: "TOZ", type: "dust", dust: 5, points: 0, weight: 28, color: "#1a2530", glow: "#8ba3b8" },
  { id: "points_small", label: "+3 Puan", val: "+3", lbl: "PUAN", type: "points", dust: 0, points: 3, weight: 22, color: "#0d2b1d", glow: "var(--green)" },
  { id: "dust_medium", label: "+12 Toz", val: "+12", lbl: "TOZ", type: "dust", dust: 12, points: 0, weight: 20, color: "#101e40", glow: "var(--blue)" },
  { id: "points_medium", label: "+6 Puan", val: "+6", lbl: "PUAN", type: "points", dust: 0, points: 6, weight: 12, color: "#3a0b2e", glow: "var(--accent)" },
  { id: "dust_big", label: "+25 Toz", val: "+25", lbl: "TOZ", type: "dust", dust: 25, points: 0, weight: 12, color: "#3b2a05", glow: "var(--gold)" },
  { id: "jackpot", label: "JACKPOT! +15 Puan +20 Toz", val: "JACKPOT", lbl: "+15⭐ +20✨", type: "combo", dust: 20, points: 15, weight: 6, color: "#000000", glow: "#ff2a2a" }
];
const WHEEL_SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;

// ============================================================
// KELLE AVCISI
// Herkesin görebileceği tek, paylaşımlı bir "ödül" ilanı. Bir oyuncu
// başka birinin üstüne toz koyar, o kişiyi saldırıda İLK yenen ödülü kapar.
// ============================================================
const META_COL = "gameMeta";
const BOUNTY_DOC_ID = "bounty";

// ============================================================
// HAFTALIK LİDERLİK TABLOSU
// Her hafta Pazar 00:00'da (bir sonraki Pazar 00:00'a kadar) o haftanın
// liderlik tablosu kapanır: 1. olan oyuncuya toz + garanti nadir eşya
// verilir ve haftalık şampiyonluk sayacı +1 olur, ardından HERKESİN puanı
// sıfırlanır ve yeni hafta 0'dan başlar. Paylaşımlı tek bir gameMeta
// dokümanı (weeklyLeaderboard) hangi haftanın işlendiğini tutar; hangi
// client önce fark ederse sıfırlamayı o yapar, diğerleri "zaten işlendi"
// deyip pas geçer (Kelle Avcısı ilanıyla aynı desen).
// ============================================================
const WEEKLY_LEADERBOARD_DOC_ID = "weeklyLeaderboard";
const WEEKLY_CHAMPION_DUST_REWARD = 25;

// ============================================================
// 1.LİK AVI
// Liderlik tablosunun zirvesindeki oyuncuyu saldırıda yenen kişi, normal
// kazanma ödülünün üstüne ekstra bonus puan alır. Kimse zirvede rahat oturamasın.
// ============================================================
const THRONE_BONUS_POINTS = 8;

// Aynı oyuncuya art arda saldırma hakkı sınırlı: bir hedefi üst üste bu sayıdan
// fazla kez seçemezsin, tek bir kurbanın sürekli hedef alınmasını engellemek için.
const MAX_CONSECUTIVE_ATTACKS_ON_TARGET = 3;
// Bir hedef üst üste 3 kez vurulduktan sonra kilitlenir; o hedefe tekrar
// saldırabilmek için önce en az bu kadar BAŞKA savaş yapman gerekir.
const TARGET_LOCK_COOLDOWN_ATTACKS = 3;

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
const QUEST_TIER_LABELS = { kolay: "Kolay", orta: "Orta", zor: "Zor", efsanevi: "Efsanevi" };

// ============================================================
// HAFTALIK & AYLIK GÖREVLER
// Günlük görevlerden ayrı bir havuz: aynı tiplere (kutu aç, savaşa gir vb.)
// dokunmadan, ayrıca Kahin Bahsi ve Kelle Avcısı'na özel niş görev tipleri
// de eklendi (oracle_win, bounty_win). Zorluk günlükten belirgin şekilde
// yüksek tutuldu; ödüller de buna göre ölçeklendi. Aylık görevlerden
// SADECE en zoru (tier "efsanevi") garanti efsanevi eşya veriyor, geri
// kalan tüm haftalık/aylık ödüller toz + puan (+ bazen garanti/şanslı
// nadir eşya) şeklinde.
// ============================================================
const WEEKLY_TIER_REWARDS = {
  orta: { dustMin: 14, dustMax: 20, pointsMin: 10, pointsMax: 15, itemChance: 0.4 },
  zor: { dustMin: 24, dustMax: 34, pointsMin: 18, pointsMax: 26, itemChance: 0.65 }
};
const MONTHLY_TIER_REWARDS = {
  zor: { dustMin: 45, dustMax: 65, pointsMin: 30, pointsMax: 45, itemChance: 1 },
  efsanevi: { dustMin: 55, dustMax: 80, pointsMin: 35, pointsMax: 50, itemChance: 0, legendary: true }
};

// Hedefler oyunun gerçek temposuna göre kasıtlı olarak zorlaştırıldı: kutu 4 saatte
// 1 (günde en fazla ~6), saldırı saat başına 1 (günde en fazla ~24), Kahin Bahsi
// günde en fazla 1 hakla sınırlı. Bu yüzden aşağıdaki hedeflerin hiçbiri tek bir
// günde, hatta çoğu tek bir hafta sonu grinding'iyle bile bitirilemeyecek şekilde
// ayarlandı; gerçekten haftayı/ayı yayarak oynamayı gerektiriyor.
const WEEKLY_QUEST_TEMPLATES = [
  { type: "open_box", tier: "orta", icon: "📦", target: 32, label: (t) => `${t} sandık aç` },
  { type: "attack_count", tier: "orta", icon: "⚔️", target: 70, label: (t) => `${t} savaşa gir` },
  { type: "battle_win", tier: "zor", icon: "🏆", target: 24, label: (t) => `${t} savaş kazan` },
  { type: "energy_task", tier: "orta", icon: "⚡", target: 35, label: (t) => `${t} kez enerji görevi yap` },
  { type: "oracle_win", tier: "zor", icon: "🔮", target: 5, label: (t) => `${t} kez Kahin Bahsi'ni doğru bil` },
  { type: "bounty_win", tier: "zor", icon: "💀", target: 4, label: (t) => `${t} kez Kelle Avcısı ödülünü kap` }
];

// Ayda her zaman bu en zor görev atanır (efsanevi eşya ödülü sadece bunda var).
const MONTHLY_HARD_TEMPLATE = { type: "battle_win", tier: "efsanevi", icon: "👑", target: 90, label: (t) => `Bu ay ${t} savaş kazan` };
// Bunun yanına, aşağıdaki havuzdan rastgele 2 farklı tip daha eklenir (toz/puan/garanti nadir eşya verir).
const MONTHLY_QUEST_POOL = [
  { type: "open_box", tier: "zor", icon: "📦", target: 140, label: (t) => `Bu ay ${t} sandık aç` },
  { type: "attack_count", tier: "zor", icon: "⚔️", target: 300, label: (t) => `Bu ay ${t} savaşa gir` },
  { type: "oracle_win", tier: "zor", icon: "🔮", target: 22, label: (t) => `Bu ay ${t} kez Kahin Bahsi'ni doğru bil` },
  { type: "bounty_win", tier: "zor", icon: "💀", target: 12, label: (t) => `Bu ay ${t} kez Kelle Avcısı ödülünü kap` },
  { type: "energy_task", tier: "zor", icon: "⚡", target: 130, label: (t) => `Bu ay ${t} kez enerji görevi yap` }
];

function rollQuestRewardGeneric(table, tier) {
  const r = table[tier];
  return {
    dust: randInt(r.dustMin, r.dustMax),
    points: randInt(r.pointsMin, r.pointsMax),
    item: !r.legendary && Math.random() < r.itemChance,
    legendary: !!r.legendary
  };
}

function buildPeriodQuest(template, idx, rewardTable, prefix) {
  const reward = rollQuestRewardGeneric(rewardTable, template.tier);
  let label = template.label;
  if (typeof label === "function") label = label(template.target);
  return {
    id: `${prefix}${idx}_${template.type}`, type: template.type, tier: template.tier, icon: template.icon,
    label, target: template.target, progress: 0, completed: false, claimed: false,
    rewardDust: reward.dust, rewardPoints: reward.points, rewardItem: reward.item, rewardLegendary: reward.legendary
  };
}

function getWeekStartDate(d = new Date()) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() + diff);
  return monday;
}
function weekIdStr(d = new Date()) { return dateStr(getWeekStartDate(d)); }
function monthIdStr(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

// Haftalık LİDERLİK sıfırlaması, görev haftasından (Pazartesi başlangıç) FARKLI
// olarak Pazar 00:00'da başlayıp bir sonraki Pazar 00:00'da biter. Yani "hafta"
// burada Pazar-Cumartesi aralığıdır; sınır tam Pazar gece yarısıdır.
function getSundayStartDate(d = new Date()) {
  const day = d.getDay(); // 0 = Pazar
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(d.getDate() - day);
  return start;
}
function leaderboardWeekIdStr(d = new Date()) { return dateStr(getSundayStartDate(d)); }
function getMsUntilNextSunday(d = new Date()) {
  const start = getSundayStartDate(d);
  const next = new Date(start);
  next.setDate(start.getDate() + 7);
  return next - d;
}

function shuffleArr(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// Görev hedefleri/ödülleri her değiştirildiğinde bu sürüm numarası da artırılmalı.
// Aksi halde bir oyuncu o hafta/ay için görevini ZATEN almışsa (questsWeek/questsMonth
// eşleşiyorsa) sistem "zaten atanmış" deyip eskisini korur ve yeni denge hiç yansımaz.
// Versiyon etiketi hafta/ay id'sine eklenince eski kayıt artık eşleşmediği için
// oyuncu bir sonraki girişinde otomatik olarak yeni (zorlaştırılmış) görevleri alır.
const WEEKLY_QUEST_VERSION = "v2";
const MONTHLY_QUEST_VERSION = "v2";

async function ensureWeeklyQuestsForThisWeek(data) {
  const wk = `${weekIdStr()}#${WEEKLY_QUEST_VERSION}`;
  if (data.questsWeek === wk && Array.isArray(data.weeklyQuests) && data.weeklyQuests.length) return;

  const shuffled = shuffleArr(WEEKLY_QUEST_TEMPLATES);
  const chosenTypes = new Set();
  const picked = [];
  for (const t of shuffled) {
    if (chosenTypes.has(t.type)) continue;
    chosenTypes.add(t.type);
    picked.push(t);
    if (picked.length === 3) break;
  }
  const quests = picked.map((t, i) => buildPeriodQuest(t, i, WEEKLY_TIER_REWARDS, "w"));

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
    weeklyQuests: quests,
    questsWeek: wk
  });
}

async function ensureMonthlyQuestsForThisMonth(data) {
  const mo = `${monthIdStr()}#${MONTHLY_QUEST_VERSION}`;
  if (data.questsMonth === mo && Array.isArray(data.monthlyQuests) && data.monthlyQuests.length) return;

  const shuffled = shuffleArr(MONTHLY_QUEST_POOL);
  const picked = shuffled.slice(0, 2);
  const templatesToUse = [MONTHLY_HARD_TEMPLATE, ...picked];
  const quests = templatesToUse.map((t, i) => buildPeriodQuest(t, i, MONTHLY_TIER_REWARDS, "m"));

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
    monthlyQuests: quests,
    questsMonth: mo
  });
}

// Paylaşımlı gameMeta/weeklyLeaderboard dokümanı hangi haftanın işlendiğini
// tutar. Hangi client bu haftanın henüz işlenmediğini fark ederse sıfırlamayı
// O yapar (transaction ile "önce ben kaptım" garantisi); diğer client'lar
// transaction içinde "zaten işlenmiş" görüp hiçbir şey yapmadan çıkar.
async function ensureWeeklyLeaderboardReset() {
  const currentWeekId = leaderboardWeekIdStr();
  const metaRef = doc(db, META_COL, WEEKLY_LEADERBOARD_DOC_ID);

  // Oyuncu listesinin referanslarını transaction dışında al (Firestore
  // transaction'ları serbest sorgu değil, bilinen doküman referansları ister).
  const playersSnap = await getDocs(collection(db, PLAYERS_COL));
  const playerRefs = playersSnap.docs.map(d => doc(db, PLAYERS_COL, d.id));

  try {
    await runTransaction(db, async (tx) => {
      const metaSnap = await tx.get(metaRef);
      const meta = metaSnap.exists() ? metaSnap.data() : null;

      // Not: bugün (5 Temmuz 2026) zaten Pazar olduğu için meta doküman hiç
      // yoksa bile aşağıdaki mantık ilk sıfırlamayı hemen bu haftaya (bu gece)
      // uygular; bir sonraki sıfırlama ise doğal olarak gelecek Pazar 00:00'da
      // (yeni hafta id'si değiştiğinde) tetiklenir.
      if (meta && meta.lastProcessedWeek === currentWeekId) return; // zaten işlendi

      // Tüm okumalar (yazmalardan önce) tamamlanmalı.
      const freshPlayers = [];
      for (let i = 0; i < playerRefs.length; i++) {
        const snap = await tx.get(playerRefs[i]);
        if (snap.exists()) freshPlayers.push({ ref: playerRefs[i], id: playersSnap.docs[i].id, data: snap.data() });
      }

      if (!freshPlayers.length) {
        tx.set(metaRef, { lastProcessedWeek: currentWeekId, processedAt: Date.now() }, { merge: true });
        return;
      }

      // Kazananı belirle: en yüksek puana sahip oyuncu (0 puanla kimse "kazanmış" sayılmaz).
      const winner = freshPlayers.reduce((a, b) => (b.data.points || 0) > (a.data.points || 0) ? b : a, freshPlayers[0]);
      const hasWinner = (winner.data.points || 0) > 0;

      if (hasWinner) {
        const itemGrant = buildItemGrantPayloadGeneric(winner.data, "nadir");
        delete itemGrant._grantedItem;
        tx.update(winner.ref, {
          ...itemGrant,
          dust: (winner.data.dust || 0) + WEEKLY_CHAMPION_DUST_REWARD,
          weeklyChampionCount: (winner.data.weeklyChampionCount || 0) + 1,
          points: 0
        });
      }

      // Kazanan hariç (kazanan zaten yukarıda points:0 ile güncellendi) herkesin puanı sıfırlanır.
      for (const p of freshPlayers) {
        if (hasWinner && p.id === winner.id) continue;
        tx.update(p.ref, { points: 0 });
      }

      tx.set(metaRef, {
        lastProcessedWeek: currentWeekId,
        processedAt: Date.now(),
        lastWinnerName: hasWinner ? winner.data.name : null,
        lastWinnerPoints: hasWinner ? (winner.data.points || 0) : 0
      }, { merge: true });
    });
  } catch (e) {
    console.error("Haftalık liderlik sıfırlama hatası:", e);
  }
}

const QUEST_TEMPLATES = [
  { type: "login", tier: "kolay", icon: "👋", label: "Bugün giriş yap", target: 1, autoComplete: true },
  { type: "open_box", tier: "kolay", icon: "📦", target: 1, label: (t) => `${t} sandık aç` },
  { type: "open_box", tier: "orta", icon: "📦", target: 3, label: (t) => `${t} sandık aç` },
  { type: "open_box", tier: "zor", icon: "📦", target: 5, label: (t) => `${t} sandık aç` },
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
  { key: "kalkan", label: "Kalkan", icon: "🔰", type: "def" },
  { key: "kilic", label: "Kılıç", icon: "🗡️", type: "atk" },
  { key: "eldiven", label: "Eldiven", icon: "🧤", type: "atk" },
  { key: "kupe", label: "Küpe", icon: "💎", type: "atk" },
  { key: "kolye", label: "Kolye", icon: "📿", type: "atk" },
  { key: "ayakkabi", label: "Ayakkabı", icon: "👢", type: "def" }
];
const SLOT_MAP = Object.fromEntries(SLOTS.map(s => [s.key, s]));

// ============================================================
// EKİPMAN SVG İKONLARI (YENİ GÖRÜNÜŞLER)
// Her slot için 3 ayrı nadirlik seviyesinde tamamen farklı çizilmiş SVG
// içerikleri. Standart eşyalar sade/eskimiş görünür, nadir eşyalar mavi
// (--item-nadir) çelik/gümüş temalı, efsanevi eşyalar ise altın
// (--item-efsanevi) rengiyle sürekli parlayan/süzülen/dönen özel efektler
// taşır. Bu üçü ASLA karışmaz: her eşya sadece kendi rarity'sine ait
// çizimi kullanır.
// ============================================================
const ITEM_ICON_SVG_PARTS = {
  kilic: {
    standart: `
      <g transform="rotate(45, 50, 50)">
        <path d="M 46 25 L 50 20 L 54 25 L 53 65 L 47 65 Z" fill="#475569" />
        <path d="M 46 25 L 50 20 L 50 65 L 47 65 Z" fill="#64748b" />
        <circle cx="53" cy="40" r="1.5" fill="#1e293b"/>
        <rect x="44" y="65" width="12" height="4" fill="#334155" />
        <rect x="47" y="69" width="6" height="15" fill="#5c4033" />
      </g>`,
    nadir: `
      <g transform="rotate(45, 50, 50)">
        <path d="M 47 10 L 50 2 L 53 10 L 53 65 L 47 65 Z" fill="#e2e8f0" />
        <path d="M 47 10 L 50 2 L 50 65 L 47 65 Z" fill="#ffffff" opacity="0.6"/>
        <line x1="50" y1="15" x2="50" y2="60" stroke="#94a3b8" stroke-width="1.5"/>
        <path d="M 25 65 Q 50 70 75 65 L 75 70 Q 50 75 25 70 Z" fill="#1e293b" stroke="var(--item-nadir)" stroke-width="1.5"/>
        <circle cx="50" cy="68.5" r="4" fill="var(--item-nadir)" />
        <rect x="46" y="72" width="8" height="18" fill="#334155" />
        <line x1="46" y1="75" x2="54" y2="78" stroke="var(--item-nadir)" stroke-width="1.5"/>
        <line x1="46" y1="81" x2="54" y2="84" stroke="var(--item-nadir)" stroke-width="1.5"/>
        <polygon points="45,90 55,90 50,98" fill="#94a3b8" />
      </g>`,
    efsanevi: `
      <g transform="rotate(45, 50, 50)">
        <ellipse cx="50" cy="50" rx="40" ry="10" fill="none" stroke="var(--item-efsanevi)" stroke-width="1" class="fx-energy" />
        <path d="M 49 0 L 51 0 L 51 70 L 49 70 Z" fill="#fff" class="fx-pulse" />
        <polygon points="40,15 47,5 47,30 40,35" fill="var(--item-efsanevi)" class="fx-float" />
        <polygon points="60,15 53,5 53,30 60,35" fill="var(--item-efsanevi)" class="fx-float" style="animation-delay:-2s;" />
        <polygon points="42,40 48,35 48,60 42,55" fill="var(--item-efsanevi)" class="fx-float" style="animation-delay:-1s;" />
        <polygon points="58,40 52,35 52,60 58,55" fill="var(--item-efsanevi)" class="fx-float" style="animation-delay:-3s;" />
        <path d="M 15 65 Q 50 45 85 65 L 80 75 Q 50 65 20 75 Z" fill="var(--item-efsanevi)" />
        <circle cx="50" cy="65" r="8" fill="#fff" class="fx-pulse" />
        <rect x="46" y="70" width="8" height="20" fill="#0f172a" />
        <polygon points="40,90 60,90 50,105" fill="var(--item-efsanevi)" />
      </g>`
  },
  kalkan: {
    standart: `
      <circle cx="50" cy="50" r="35" fill="#5c4033" />
      <line x1="30" y1="20" x2="30" y2="80" stroke="#3e2b22" stroke-width="2"/>
      <line x1="50" y1="15" x2="50" y2="85" stroke="#3e2b22" stroke-width="2"/>
      <line x1="70" y1="20" x2="70" y2="80" stroke="#3e2b22" stroke-width="2"/>
      <circle cx="50" cy="50" r="35" fill="none" stroke="#475569" stroke-width="5" stroke-dasharray="20 5" />
      <circle cx="50" cy="50" r="8" fill="#64748b" />`,
    nadir: `
      <path d="M 20 15 L 80 15 L 85 45 Q 85 90 50 95 Q 15 90 15 45 Z" fill="#94a3b8" />
      <path d="M 25 20 L 75 20 L 80 45 Q 80 85 50 90 Q 20 85 20 45 Z" fill="#64748b" />
      <rect x="45" y="25" width="10" height="60" fill="var(--item-nadir)" />
      <rect x="30" y="40" width="40" height="10" fill="var(--item-nadir)" />
      <path d="M 20 15 L 80 15 L 85 45 Q 85 90 50 95 Q 15 90 15 45 Z" fill="none" stroke="#e2e8f0" stroke-width="4" />
      <circle cx="30" cy="25" r="2" fill="#fff" />
      <circle cx="70" cy="25" r="2" fill="#fff" />`,
    efsanevi: `
      <circle cx="50" cy="50" r="45" fill="none" stroke="var(--item-efsanevi)" stroke-width="2" stroke-dasharray="15 10" class="fx-spin" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="var(--item-efsanevi)" stroke-width="1" stroke-dasharray="5 5" class="fx-spin" style="animation-direction:reverse;animation-duration:4s;" />
      <polygon points="50,10 90,30 90,70 50,90 10,70 10,30" fill="var(--item-efsanevi)" opacity="0.2" class="fx-pulse" />
      <polygon points="50,15 80,30 80,65 50,85 20,65 20,30" fill="none" stroke="var(--item-efsanevi)" stroke-width="4" class="fx-float" />
      <polygon points="50,30 55,45 70,50 55,55 50,70 45,55 30,50 45,45" fill="#fff" class="fx-pulse" />
      <circle cx="50" cy="50" r="5" fill="var(--item-efsanevi)" />`
  },
  zirh: {
    standart: `
      <path d="M 30 20 C 40 10, 60 10, 70 20 L 75 45 C 75 75, 65 90, 50 95 C 35 90, 25 75, 25 45 Z" fill="#78350f" />
      <rect x="35" y="40" width="15" height="15" fill="#5c2b0c" transform="rotate(15, 42, 47)" />
      <line x1="35" y1="40" x2="50" y2="55" stroke="#000" stroke-width="1" transform="rotate(15, 42, 47)"/>
      <rect x="55" y="65" width="12" height="12" fill="#451a03" transform="rotate(-10, 61, 71)" />
      <path d="M 50 25 L 50 90" fill="none" stroke="#451a03" stroke-width="3" stroke-dasharray="4 2" />`,
    nadir: `
      <path d="M 15 35 C 15 15, 40 15, 45 25 L 25 45 Z" fill="var(--item-nadir)" />
      <path d="M 85 35 C 85 15, 60 15, 55 25 L 75 45 Z" fill="var(--item-nadir)" />
      <path d="M 30 20 C 40 25, 60 25, 70 20 L 80 45 C 80 75, 65 95, 50 95 C 35 95, 20 75, 20 45 Z" fill="#94a3b8" />
      <path d="M 50 22 L 75 45 C 75 75, 65 90, 50 90 Z" fill="#ffffff" opacity="0.2" />
      <path d="M 35 60 Q 50 65 65 60" fill="none" stroke="#64748b" stroke-width="3" />
      <path d="M 38 75 Q 50 80 62 75" fill="none" stroke="#64748b" stroke-width="3" />
      <polygon points="50,30 60,40 50,55 40,40" fill="#e2e8f0" />
      <polygon points="50,35 55,40 50,48 45,40" fill="var(--item-nadir)" />`,
    efsanevi: `
      <path d="M 20 20 L 80 20 L 90 90 L 10 90 Z" fill="var(--item-efsanevi)" opacity="0.3" class="fx-pulse" />
      <path d="M 5 35 C -5 -5, 50 0, 45 20 L 25 45 Z" fill="none" stroke="var(--item-efsanevi)" stroke-width="4" class="fx-float" />
      <path d="M 95 35 C 105 -5, 50 0, 55 20 L 75 45 Z" fill="none" stroke="var(--item-efsanevi)" stroke-width="4" class="fx-float" style="animation-delay:-2s;" />
      <path d="M 25 25 C 40 30, 60 30, 75 25 L 85 50 C 85 85, 65 100, 50 100 C 35 100, 15 85, 15 50 Z" fill="#0f172a" stroke="var(--item-efsanevi)" stroke-width="3" />
      <circle cx="50" cy="45" r="15" fill="#000" stroke="var(--item-efsanevi)" stroke-width="3" />
      <circle cx="50" cy="45" r="8" fill="#fff" class="fx-pulse" />
      <path d="M 50 60 L 50 95" stroke="var(--item-efsanevi)" stroke-width="4" class="fx-pulse" />
      <path d="M 35 70 L 50 80 L 65 70" fill="none" stroke="var(--item-efsanevi)" stroke-width="2" class="fx-pulse" />`
  },
  kask: {
    standart: `
      <path d="M 20 60 C 20 10, 80 10, 80 60 L 80 70 C 65 75, 35 75, 20 70 Z" fill="#64748b" />
      <rect x="45" y="60" width="10" height="25" fill="#475569" />
      <circle cx="30" cy="60" r="2" fill="#1e293b"/>
      <circle cx="70" cy="60" r="2" fill="#1e293b"/>`,
    nadir: `
      <path d="M 50 25 C 60 5, 85 10, 80 35 C 75 25, 60 25, 50 25 Z" fill="var(--item-nadir)" />
      <path d="M 20 50 C 20 10, 80 10, 80 50 L 80 80 C 60 90, 40 90, 20 80 Z" fill="#94a3b8" />
      <path d="M 15 45 C 40 60, 60 60, 85 45 L 80 75 C 60 85, 40 85, 20 75 Z" fill="#cbd5e1" stroke="#475569" stroke-width="2" />
      <polygon points="25,52 45,58 45,63 25,58" fill="#0f172a" />
      <polygon points="75,52 55,58 55,63 75,58" fill="#0f172a" />`,
    efsanevi: `
      <path d="M 50 30 C 70 -10, 100 20, 60 50 Z" fill="var(--item-efsanevi)" opacity="0.6" class="fx-pulse" />
      <path d="M 50 30 C 30 -10, 0 20, 40 50 Z" fill="var(--item-efsanevi)" opacity="0.6" class="fx-pulse" style="animation-delay:-1s;" />
      <path d="M 25 50 C 25 20, 75 20, 75 50 L 70 85 C 60 90, 40 90, 30 85 Z" fill="#0f172a" stroke="var(--item-efsanevi)" stroke-width="2" />
      <path d="M 30 55 L 45 62 L 35 65 Z" fill="#fff" />
      <path d="M 70 55 L 55 62 L 65 65 Z" fill="#fff" />
      <polygon points="50,15 60,35 40,35" fill="var(--item-efsanevi)" class="fx-float" />
      <path d="M 10 40 Q -5 10 30 25" fill="none" stroke="var(--item-efsanevi)" stroke-width="4" stroke-linecap="round" class="fx-float" style="animation-delay:-1s;" />
      <path d="M 90 40 Q 105 10 70 25" fill="none" stroke="var(--item-efsanevi)" stroke-width="4" stroke-linecap="round" class="fx-float" style="animation-delay:-2s;" />`
  },
  kolye: {
    standart: `
      <path d="M 20 20 C 20 70, 80 70, 80 20" fill="none" stroke="#78350f" stroke-width="3" />
      <polygon points="50,65 58,75 50,85 42,75" fill="#64748b" />`,
    nadir: `
      <path d="M 20 20 C 20 70, 80 70, 80 20" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 2" />
      <polygon points="50,60 62,75 50,95 38,75" fill="var(--item-nadir)" />
      <polygon points="50,60 56,75 50,85 44,75" fill="#fff" opacity="0.4" />`,
    efsanevi: `
      <path d="M 20 10 C 30 50, 45 60, 50 65" fill="none" stroke="var(--item-efsanevi)" stroke-width="1.5" stroke-dasharray="5 5" class="fx-pulse" />
      <path d="M 80 10 C 70 50, 55 60, 50 65" fill="none" stroke="var(--item-efsanevi)" stroke-width="1.5" stroke-dasharray="5 5" class="fx-pulse" />
      <g class="fx-float">
        <polygon points="50,55 65,75 50,95 35,75" fill="#fff" />
        <ellipse cx="50" cy="75" rx="25" ry="5" fill="none" stroke="var(--item-efsanevi)" stroke-width="2" class="fx-spin" />
        <circle cx="25" cy="75" r="3" fill="var(--item-efsanevi)" class="fx-pulse" />
        <circle cx="75" cy="75" r="3" fill="var(--item-efsanevi)" class="fx-pulse" style="animation-delay:-1s;"/>
      </g>`
  },
  kupe: {
    standart: `
      <circle cx="50" cy="40" r="15" fill="none" stroke="#64748b" stroke-width="4" />
      <line x1="50" y1="25" x2="50" y2="15" stroke="#64748b" stroke-width="2" />`,
    nadir: `
      <circle cx="50" cy="25" r="8" fill="none" stroke="#cbd5e1" stroke-width="2" />
      <path d="M 50 33 L 50 45" stroke="#cbd5e1" stroke-width="2" />
      <path d="M 50 45 C 60 55, 60 75, 50 85 C 40 75, 40 55, 50 45 Z" fill="var(--item-nadir)" />
      <path d="M 50 50 C 55 60, 55 70, 50 80 Z" fill="#fff" opacity="0.4" />`,
    efsanevi: `
      <circle cx="50" cy="20" r="5" fill="none" stroke="var(--item-efsanevi)" stroke-width="2" />
      <line x1="50" y1="25" x2="50" y2="90" stroke="var(--item-efsanevi)" stroke-width="1" stroke-dasharray="10 5" class="fx-pulse" />
      <g class="fx-float">
        <polygon points="50,40 70,70 30,70" fill="none" stroke="var(--item-efsanevi)" stroke-width="3" />
        <polygon points="50,80 70,50 30,50" fill="none" stroke="var(--item-efsanevi)" stroke-width="3" />
        <circle cx="50" cy="60" r="8" fill="#fff" class="fx-pulse" />
      </g>`
  },
  eldiven: {
    standart: `
      <path d="M 30 40 L 70 40 L 75 90 C 75 95, 25 95, 25 90 Z" fill="#78350f" />
      <rect x="30" y="25" width="10" height="15" fill="#78350f" rx="3" />
      <rect x="45" y="20" width="10" height="20" fill="#78350f" rx="3" />
      <rect x="60" y="25" width="10" height="15" fill="#78350f" rx="3" />
      <line x1="40" y1="60" x2="60" y2="70" stroke="#451a03" stroke-width="2" />
      <line x1="35" y1="70" x2="50" y2="80" stroke="#451a03" stroke-width="2" />`,
    nadir: `
      <path d="M 25 50 L 75 50 L 80 95 L 20 95 Z" fill="#94a3b8" />
      <path d="M 23 65 L 77 65" stroke="#64748b" stroke-width="3" />
      <path d="M 21 80 L 79 80" stroke="#64748b" stroke-width="3" />
      <path d="M 30 15 L 40 15 L 42 50 L 28 50 Z" fill="#cbd5e1" />
      <path d="M 45 10 L 55 10 L 57 50 L 43 50 Z" fill="#cbd5e1" />
      <path d="M 60 15 L 70 15 L 72 50 L 58 50 Z" fill="#cbd5e1" />
      <circle cx="35" cy="45" r="4" fill="var(--item-nadir)" />
      <circle cx="50" cy="45" r="4" fill="var(--item-nadir)" />
      <circle cx="65" cy="45" r="4" fill="var(--item-nadir)" />`,
    efsanevi: `
      <path d="M 20 50 L 80 50 L 90 100 L 10 100 Z" fill="#0f172a" stroke="var(--item-efsanevi)" stroke-width="2" />
      <path d="M 35 45 L 25 5 L 45 45 Z" fill="var(--item-efsanevi)" class="fx-pulse" />
      <path d="M 50 45 L 50 0 L 55 45 Z" fill="var(--item-efsanevi)" class="fx-pulse" style="animation-delay:-1s;" />
      <path d="M 65 45 L 75 5 L 55 45 Z" fill="var(--item-efsanevi)" class="fx-pulse" style="animation-delay:-2s;" />
      <g class="fx-float">
        <circle cx="50" cy="75" r="15" fill="none" stroke="var(--item-efsanevi)" stroke-width="3" />
        <polygon points="50,60 65,82 35,82" fill="none" stroke="var(--item-efsanevi)" stroke-width="2" />
        <circle cx="50" cy="75" r="4" fill="#fff" />
      </g>`
  },
  ayakkabi: {
    standart: `
      <path d="M 35 20 L 65 20 L 70 60 L 85 85 L 25 85 L 30 60 Z" fill="#5c4033" />
      <path d="M 20 85 L 90 85 L 90 95 L 20 95 Z" fill="#3e2b22" />
      <line x1="35" y1="40" x2="65" y2="40" stroke="#3e2b22" stroke-width="2" />
      <line x1="32" y1="60" x2="68" y2="60" stroke="#3e2b22" stroke-width="2" />`,
    nadir: `
      <path d="M 35 15 L 65 15 L 70 65 L 30 65 Z" fill="#cbd5e1" />
      <path d="M 45 15 L 55 15 L 55 65 L 45 65 Z" fill="var(--item-nadir)" opacity="0.8" />
      <path d="M 30 65 L 70 65 L 85 90 L 15 90 Z" fill="#94a3b8" />
      <path d="M 10 90 L 90 90 L 90 98 L 10 98 Z" fill="#64748b" />
      <circle cx="50" cy="75" r="4" fill="#fff" />`,
    efsanevi: `
      <path d="M 35 40 Q 5 20 0 60 Q 15 65 30 65 Z" fill="var(--item-efsanevi)" opacity="0.8" class="fx-pulse" />
      <path d="M 65 40 Q 95 20 100 60 Q 85 65 70 65 Z" fill="var(--item-efsanevi)" opacity="0.8" class="fx-pulse" style="animation-delay:-1s;" />
      <path d="M 30 20 L 70 20 L 75 60 L 25 60 Z" fill="#0f172a" stroke="var(--item-efsanevi)" stroke-width="2" class="fx-float" />
      <polygon points="20,70 80,70 90,90 10,90" fill="none" stroke="var(--item-efsanevi)" stroke-width="3" class="fx-float" style="animation-delay:-0.5s;" />
      <path d="M 20 95 L 80 95 L 50 108 Z" fill="#fff" class="fx-pulse" />`
  }
};

// Verilen slot + nadirlik için hazır SVG ikon markup'ı üretir. size piksel
// cinsinden genişlik/yükseklik. Bilinmeyen slot/rarity kombinasyonunda
// (olmamalı ama önlem olsun) boş bir kalkan taşı gösterilir.
function itemIconSvg(slot, rarity, size = 32) {
  const parts = (ITEM_ICON_SVG_PARTS[slot] && ITEM_ICON_SVG_PARTS[slot][rarity]) || "";
  return `<svg class="item-svg-icon" viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${parts}</svg>`;
}

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
    "Islak Çorap", "Plastik Crocs"],
  kalkan: ["Çöp Kapağı Kalkanı", "Tepsi Kalkan", "Karton Kalkan", "Paslı Çukur Kapak", "Bahçe Kapısı Parçası",
    "Eski Radyatör Kapağı", "Delik Tencere Kapağı", "Çürük Tahta Kalkan", "Naylon Şemsiye Kalkanı",
    "Yassı Taş Kalkan", "Kırık Masa Tablası"],
  kupe: ["Plastik Küpe", "Paslı Halka Küpe", "Kırık Boncuk Küpe", "Ucuz Taklit Küpe", "Tahta Küpe",
    "Bakır Tel Küpe", "Anahtarlık Küpe", "Kapak Küpe", "Zımba Teli Küpe", "Sakız Kağıdı Küpe",
    "Misina Küpe"],
  kolye: ["İp Kolye", "Kertenkele Dişi Kolye", "Plastik Boncuk Kolye", "Paslı Zincir Kolye", "Deniz Kabuğu Kolye",
    "Taş Kolye", "Anahtar Kolye", "Düğme Kolye", "Lastik Bant Kolye", "Tel Örgü Kolye",
    "Kurutulmuş Meyve Kolye"]
};
const RARE_NAMES = {
  kask: ["Gümüş Miğfer", "Ejder Kafatası Kaskı", "Buz Tacı", "Kartal Kaskı", "Meteor Miğferi", "Gölge Külahı"],
  zirh: ["Çelik Zırh", "Ejder Pulu Zırhı", "Gölge Cübbesi", "Meteor Plakası", "Buz Zırhı", "Kurt Postu Zırhı"],
  kilic: ["Ateş Kılıcı", "Buz Kılıcı", "Şimşek Pala", "Kan İçen Meç", "Gölge Bıçağı", "Ejder Dişi Kılıcı"],
  eldiven: ["Demir Pençe", "Kadife Eldiven", "Zehir Eldiveni", "Fırtına Pençesi", "Örümcek Eldiveni", "Alev Eldiveni"],
  ayakkabi: ["Rüzgar Botları", "Çelik Nalın", "Gölge Ayakkabıları", "Kum Fırtınası Çarığı", "Buz Patenleri", "Şimşek Çizmeleri"],
  kalkan: ["Çelik Örümcek Kalkanı", "Ejder Pulu Kalkanı", "Buz Duvarı Kalkanı", "Gölge Siperi", "Meteor Parçası Kalkan", "Fırtına Kalkanı"],
  kupe: ["Gümüş Yılan Küpe", "Ejder Gözü Küpe", "Şimşek Küpe", "Ay Işığı Küpe", "Zehir Damlası Küpe", "Rüzgar Fısıltısı Küpe"],
  kolye: ["Ejder Kalbi Kolye", "Gölge Taşı Kolye", "Buz Kristali Kolye", "Şimşek Zinciri Kolye", "Alev Küresi Kolye", "Ay Taşı Kolye"]
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
    desc: "Kazanırsa 3 puan fazladan alır, ama %20 ihtimalle o seferki saldırıyı pas geçer." },

  // ---- v1.14: Kalkan, Küpe, Kolye efsanevi eşyaları ----
  { name: "Kaymağın kalkanı", slot: "kalkan", atk: 3, def: 25, effect: "defense_multiplier",
    desc: "Savunma gücü hesaplamasında %15 fazladan bonus verir." },
  { name: "Devrik minderin kalkanı", slot: "kalkan", atk: 4, def: 24, effect: "no_loss_on_defense_lose",
    desc: "Savunmadayken maçı kaybetse bile puanı asla düşmez." },
  { name: "Sallanan dişin kalkanı", slot: "kalkan", atk: 3, def: 23, effect: "lucky_defense_roll",
    desc: "Savunmadayken zar atışı 2 katı sayılır, şansı yaver gider." },
  { name: "Kelebeğin küpesi", slot: "kupe", atk: 25, def: 4, effect: "attack_multiplier",
    desc: "Saldırı gücü hesaplamasında %15 fazladan bonus verir." },
  { name: "Sarhoş amcanın küpesi", slot: "kupe", atk: 26, def: 3, effect: "steal_extra_on_big_win",
    desc: "Saldırıda 5'ten fazla güç farkıyla kazanırsa rakipten ekstra 2 puan çalar." },
  { name: "Işıltılı dedikodu küpesi", slot: "kupe", atk: 24, def: 5, effect: "crit_instant_win",
    desc: "Saldırıda %10 ihtimalle güç hesabına bakmadan anında ısırıp kazanır." },
  { name: "Nazarlıklı amcanın kolyesi", slot: "kolye", atk: 25, def: 4, effect: "curse_defense_next",
    desc: "Saldırıda kazanırsa rakibe lanet okur: rakibin bir sonraki savaşında savunması %20 düşer." },
  { name: "Keyifli akşamın kolyesi", slot: "kolye", atk: 21, def: 6, effect: "chill_risk",
    desc: "Kazanırsa 3 puan fazladan alır, ama %20 ihtimalle o seferki saldırıyı pas geçer." },
  { name: "Gıcık komşunun kolyesi", slot: "kolye", atk: 24, def: 5, effect: "attack_multiplier",
    desc: "Saldırı gücü hesaplamasında %15 fazladan bonus verir." }
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
// ROZETLER
// Tamamen mevcut/kalıcı sayaçlardan türetilir, ayrı bir "kazanıldı" listesi
// tutmaya gerek yok: her rozetin check(data) fonksiyonu, oyuncunun güncel
// verisine bakıp o an hak edilip edilmediğini anlık hesaplar. Böylece geriye
// dönük de (eski oyuncular için) otomatik doğru çalışır.
// ============================================================
function countDiscoveredLegendary(data) {
  const discovered = new Set(data.discoveredItems || []);
  return LEGENDARY_ITEMS.filter(it => discovered.has(it.name)).length;
}
function countEquippedLegendary(data) {
  const eq = data.equipment || {};
  return SLOTS.filter(s => eq[s.key] && eq[s.key].rarity === "efsanevi").length;
}
function collectionPct(data) {
  return Math.floor(((data.discoveredItems || []).length / TOTAL_ITEM_COUNT) * 100);
}

const BADGES = [
  // ---- Savaş galibiyetleri ----
  { id: "win_10", icon: "⚔️", name: "Çaylak Savaşçı", desc: "Toplam 10 savaş kazan.", check: (d) => (d.stats?.totalWins || 0) >= 10 },
  { id: "win_30", icon: "🗡️", name: "Otuzlar Kulübü", desc: "Toplam 30 savaş kazan.", check: (d) => (d.stats?.totalWins || 0) >= 30 },
  { id: "win_75", icon: "🛡️", name: "Savaş Ustası", desc: "Toplam 75 savaş kazan.", check: (d) => (d.stats?.totalWins || 0) >= 75 },
  { id: "win_150", icon: "🎖️", name: "Yüz Elli Kılıç", desc: "Toplam 150 savaş kazan.", check: (d) => (d.stats?.totalWins || 0) >= 150 },
  { id: "win_300", icon: "🏆", name: "Efsanevi Şampiyon", desc: "Toplam 300 savaş kazan.", check: (d) => (d.stats?.totalWins || 0) >= 300 },

  // ---- Galibiyet serisi ----
  { id: "streak_5", icon: "🔥", name: "Isınıyor", desc: "5 galibiyetlik seri yakala.", check: (d) => (d.stats?.longestStreak || 0) >= 5 },
  { id: "streak_10", icon: "🔥", name: "Ateş Hattı", desc: "10 galibiyetlik seri yakala.", check: (d) => (d.stats?.longestStreak || 0) >= 10 },
  { id: "streak_20", icon: "☄️", name: "Durdurulamaz", desc: "20 galibiyetlik seri yakala.", check: (d) => (d.stats?.longestStreak || 0) >= 20 },
  { id: "streak_30", icon: "🌋", name: "Kıyamet Serisi", desc: "30 galibiyetlik seri yakala.", check: (d) => (d.stats?.longestStreak || 0) >= 30 },

  // ---- Efsanevi eşya koleksiyonu (keşfedilen) ----
  { id: "legendary_1", icon: "🌟", name: "Efsane Avcısı", desc: "En az 1 efsanevi eşya keşfet.", check: (d) => countDiscoveredLegendary(d) >= 1 },
  { id: "legendary_3", icon: "✨", name: "Efsane Koleksiyoncusu", desc: "En az 3 farklı efsanevi eşya keşfet.", check: (d) => countDiscoveredLegendary(d) >= 3 },
  { id: "legendary_6", icon: "💫", name: "Efsane Kâşifi", desc: "En az 6 farklı efsanevi eşya keşfet.", check: (d) => countDiscoveredLegendary(d) >= 6 },
  { id: "legendary_10", icon: "🌠", name: "Efsane Mimarı", desc: "En az 10 farklı efsanevi eşya keşfet.", check: (d) => countDiscoveredLegendary(d) >= 10 },
  { id: "legendary_all", icon: "👑", name: "Efsanelerin Efendisi", desc: "Tüm efsanevi eşyaları keşfet.", check: (d) => countDiscoveredLegendary(d) >= LEGENDARY_ITEMS.length },

  // ---- Aynı anda kuşanılı efsanevi eşya ----
  { id: "equip_legendary_1", icon: "🛡️", name: "Efsane Kuşanımı", desc: "Aynı anda 1 efsanevi eşya kuşan.", check: (d) => countEquippedLegendary(d) >= 1 },
  { id: "equip_legendary_3", icon: "⚡", name: "3 Efsaneye Sahip", desc: "Aynı anda 3 efsanevi eşyaya sahip ol (kuşanılı).", check: (d) => countEquippedLegendary(d) >= 3 },
  { id: "equip_legendary_5", icon: "🐆", name: "Tam Donanımlı Panter", desc: "Aynı anda tüm 5 slotu efsanevi eşyayla kuşan.", check: (d) => countEquippedLegendary(d) >= 5 },

  // ---- Kutu açma ----
  { id: "box_50", icon: "📦", name: "Sandık Meraklısı", desc: "Toplamda 50 sandık aç.", check: (d) => (d.totalBoxesOpened || 0) >= 50 },
  { id: "box_150", icon: "📦", name: "Sandık Bağımlısı", desc: "Toplamda 150 sandık aç.", check: (d) => (d.totalBoxesOpened || 0) >= 150 },
  { id: "box_300", icon: "📦", name: "Sandık Canavarı", desc: "Toplamda 300 sandık aç.", check: (d) => (d.totalBoxesOpened || 0) >= 300 },
  { id: "box_600", icon: "📦", name: "Sandık Efendisi", desc: "Toplamda 600 sandık aç.", check: (d) => (d.totalBoxesOpened || 0) >= 600 },

  // ---- Toz biriktirme ----
  { id: "dust_100", icon: "✨", name: "Toz Biriktiren", desc: "Aynı anda 100 toza sahip ol.", check: (d) => (d.dust || 0) >= 100 },
  { id: "dust_300", icon: "✨", name: "Toz Zengini", desc: "Aynı anda 300 toza sahip ol.", check: (d) => (d.dust || 0) >= 300 },
  { id: "dust_600", icon: "💰", name: "Toz Kralı", desc: "Aynı anda 600 toza sahip ol.", check: (d) => (d.dust || 0) >= 600 },

  // ---- Haftalık liderlik şampiyonluğu ----
  { id: "weekly_1", icon: "🥇", name: "Haftanın Birincisi", desc: "Bir haftayı liderlik tablosunun 1.si olarak bitir.", check: (d) => (d.weeklyChampionCount || 0) >= 1 },
  { id: "weekly_3", icon: "👑", name: "Taht Sahibi", desc: "3 kez haftanın birincisi ol.", check: (d) => (d.weeklyChampionCount || 0) >= 3 },
  { id: "weekly_5", icon: "👑", name: "Hanedan", desc: "5 kez haftanın birincisi ol.", check: (d) => (d.weeklyChampionCount || 0) >= 5 },
  { id: "weekly_10", icon: "🏰", name: "Sonsuz Saltanat", desc: "10 kez haftanın birincisi ol.", check: (d) => (d.weeklyChampionCount || 0) >= 10 },

  // ---- Kahin Bahsi ----
  { id: "oracle_5", icon: "🔮", name: "Kahin Çırağı", desc: "Kahin Bahsi'ni 5 kez doğru bil.", check: (d) => (d.oracleWinsTotal || 0) >= 5 },
  { id: "oracle_15", icon: "🔮", name: "Falcı Ustası", desc: "Kahin Bahsi'ni 15 kez doğru bil.", check: (d) => (d.oracleWinsTotal || 0) >= 15 },
  { id: "oracle_30", icon: "🔮", name: "Bahis Baronu", desc: "Kahin Bahsi'ni 30 kez doğru bil.", check: (d) => (d.oracleWinsTotal || 0) >= 30 },

  // ---- Kelle Avcısı ----
  { id: "bounty_3", icon: "💀", name: "Kelle Toplayıcı", desc: "3 kez Kelle Avcısı ödülünü kap.", check: (d) => (d.bountyWinsTotal || 0) >= 3 },
  { id: "bounty_10", icon: "💀", name: "Ödül Avcısı", desc: "10 kez Kelle Avcısı ödülünü kap.", check: (d) => (d.bountyWinsTotal || 0) >= 10 },
  { id: "bounty_25", icon: "⚰️", name: "Cellat", desc: "25 kez Kelle Avcısı ödülünü kap.", check: (d) => (d.bountyWinsTotal || 0) >= 25 },

  // ---- Gizemli Yabancı ----
  { id: "stranger_5", icon: "🕵️", name: "Yabancı Avcısı", desc: "Gizemli Yabancı'yı 5 kez yen.", check: (d) => (d.strangerWinsTotal || 0) >= 5 },
  { id: "stranger_15", icon: "🕶️", name: "Gölge Takipçisi", desc: "Gizemli Yabancı'yı 15 kez yen.", check: (d) => (d.strangerWinsTotal || 0) >= 15 },

  // ---- Şanslı Çark ----
  { id: "jackpot_1", icon: "🎡", name: "Jackpot Avcısı", desc: "Şanslı Çark'ta 1 kez jackpot vur.", check: (d) => (d.wheelJackpotsTotal || 0) >= 1 },
  { id: "jackpot_3", icon: "🎰", name: "Çark Ustası", desc: "Şanslı Çark'ta 3 kez jackpot vur.", check: (d) => (d.wheelJackpotsTotal || 0) >= 3 },

  // ---- Koleksiyon tamamlama ----
  { id: "collect_25", icon: "📖", name: "Çırak Koleksiyoncu", desc: "Tüm eşyaların %25'ini keşfet.", check: (d) => collectionPct(d) >= 25 },
  { id: "collect_50", icon: "📖", name: "Kıdemli Koleksiyoncu", desc: "Tüm eşyaların %50'sini keşfet.", check: (d) => collectionPct(d) >= 50 },
  { id: "collect_75", icon: "📚", name: "Uzman Koleksiyoncu", desc: "Tüm eşyaların %75'ini keşfet.", check: (d) => collectionPct(d) >= 75 },
  { id: "collect_100", icon: "🏛️", name: "Tam Koleksiyoncu", desc: "Oyundaki tüm eşyaları keşfet.", check: (d) => collectionPct(d) >= 100 },

  // ---- Kazanma oranı / dayanıklılık ----
  {
    id: "unbeatable", icon: "🦁", name: "Yenilmez", desc: "En az 20 savaşta %70+ kazanma oranı yakala.",
    check: (d) => {
      const s = d.stats || {};
      const total = (s.totalWins || 0) + (s.totalLosses || 0);
      return total >= 20 && (s.totalWins || 0) / total >= 0.7;
    }
  },
  { id: "resilient", icon: "🥊", name: "Vazgeçmeyen", desc: "Toplamda 50 kere kaybet ama oynamaya devam et.", check: (d) => (d.stats?.totalLosses || 0) >= 50 }
];

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
    desc: "Bugün sandık açma süresi 4 yerine 6 saat.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, dustMult: 1, boxCooldownMult: 1.5, pityMult: 1 },
  { id: "fast_boxes", icon: "⚡", type: "buff", title: "Hız Günü",
    desc: "Bugün sandık açma süresi 4 yerine 3 saat.",
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

// ============================================================
// EFSUN (ENCHANT) SİSTEMİ
// Her eşya, düştüğü anda nadirliğine göre değişen oranda ekstra bir
// "efsun" bonusu kazanır. Bu bonus, eşyanın ana statına (saldırı tipi
// eşyalarda saldırıya, savunma tipi eşyalarda savunmaya) yüzdesel olarak
// eklenir ve eşyanın nihai atk/def değerine gömülür. Böylece aynı isimli
// iki eşya bile efsun farkından dolayı hafif farklı güç verebilir.
// Nadirlik arttıkça efsun aralığı da büyür: standart eşyalarda ufak bir
// katkı, nadirde belirgin, efsanevi de ise en güçlü katkı.
// ============================================================
const ENCHANT_PCT_RANGE = {
  standart: [1, 3],
  nadir: [5, 9],
  efsanevi: [12, 18]
};
function rollEnchantPct(rarity) {
  const [min, max] = ENCHANT_PCT_RANGE[rarity] || [0, 0];
  return randInt(min, max);
}

// Kutudan çıkma şansı gösterimi için (temel oranlar; günün olayı ve pity
// bunu anlık değiştirebilir ama envanterde gösterilen değer temel orandır).
const RARITY_CHANCE_LABELS = {
  standart: "~%88",
  nadir: `~%${BASE_RARE_CHANCE}`,
  efsanevi: `~%${BASE_LEGENDARY_CHANCE}`
};
const RARITY_LABELS_TR = { standart: "Standart", nadir: "Nadir", efsanevi: "Efsanevi" };

// Efsun bonusunu, eşyanın ana statına (slot tipine göre atk ya da def)
// yüzdesel olarak ekler ve son atk/def değerlerini döndürür.
function applyEnchant(slotInfo, atk, def, rarity) {
  const enchantPct = rollEnchantPct(rarity);
  if (slotInfo.type === "atk") {
    atk = Math.round(atk * (1 + enchantPct / 100));
  } else {
    def = Math.round(def * (1 + enchantPct / 100));
  }
  return { atk, def, enchantPct };
}

// ============================================================
// UFAK PASİF ÖZELLİKLER (Standart & Nadir eşyalar için)
// Efsanevi eşyalardaki gibi güçlü/spesifik pasifler DEĞİL: her standart/nadir
// eşya, düştüğü anda bu havuzdan rastgele TEK bir "çeşni" özelliği kazanır.
// Büyüklükler kasıtlı olarak küçük tutuldu (efsanevi çarpanların ~%15'inin
// çok altında) ve nadirlik arttıkça sadece hafifçe büyüyor. Amaç: standart/
// nadir eşyaları biraz daha karakterli/eğlenceli yapmak, dengeyi bozmamak.
// Efsanevi eşyalar bu sistemi kullanmaz, kendi özel "effect" alanları var.
// ============================================================
const MINOR_TRAIT_POOL = [
  { id: "atk_boost", icon: "⚔️", name: "Keskin",
    range: { standart: [2, 4], nadir: [4, 7] },
    desc: (pct) => `Saldırı gücünü savaşta %${pct} artırır.` },
  { id: "def_boost", icon: "🛡️", name: "Sağlam",
    range: { standart: [2, 4], nadir: [4, 7] },
    desc: (pct) => `Savunma gücünü savaşta %${pct} artırır.` },
  { id: "oracle_boost", icon: "🔮", name: "Kahin Dostu",
    range: { standart: [4, 8], nadir: [8, 14] },
    desc: (pct) => `Kahin Bahsi'ni kazanırsan ödülüne %${pct} bonus katar.` },
  { id: "bounty_boost", icon: "💀", name: "Ödül Avcısı",
    range: { standart: [4, 8], nadir: [8, 14] },
    desc: (pct) => `Kelle Avcısı ödülünü kaparsan %${pct} fazla toz kazandırır.` },
  { id: "dust_boost", icon: "✨", name: "Tozlu",
    range: { standart: [8, 15], nadir: [15, 25] },
    desc: (pct) => `Bu eşyayı toza çevirirsen %${pct} fazla toz verir.` }
];

// Efsanevi eşyalar bu sistemi kullanmadığı için sadece standart/nadir için çağrılır.
function rollMinorTrait(rarity) {
  const def = pick(MINOR_TRAIT_POOL);
  const [min, max] = def.range[rarity];
  const pct = randInt(min, max);
  return { id: def.id, icon: def.icon, name: def.name, pct, desc: def.desc(pct) };
}

// Bir oyuncunun kuşandığı TÜM eşyalar arasında, belirli bir ufak pasif
// özelliğe sahip olanların yüzdelerini toplar (birden fazla eşyada aynı
// özellik varsa üst üste biner, ama her biri zaten küçük olduğu için
// toplamı da makul kalır).
function getMinorTraitBonusPct(equipment, traitId) {
  let total = 0;
  for (const s of SLOTS) {
    const item = equipment?.[s.key];
    if (item?.minorTrait?.id === traitId) total += item.minorTrait.pct;
  }
  return total;
}

function generateLootItemForRarity(slot, rarity) {
  const slotInfo = SLOT_MAP[slot];
  const id = genItemId();

  if (rarity === "efsanevi") {
    const options = LEGENDARY_BY_SLOT[slot];
    const base = pick(options);
    const { atk, def, enchantPct } = applyEnchant(slotInfo, base.atk, base.def, rarity);
    return {
      id, name: base.name, slot, rarity,
      atk, def, enchantPct,
      effect: base.effect, effectDesc: base.desc,
      minorTrait: null
    };
  }

  if (rarity === "nadir") {
    const name = pick(RARE_NAMES[slot]);
    const primary = rollRareStat();
    const secondary = randInt(1, 4);
    const rawAtk = slotInfo.type === "atk" ? primary : secondary;
    const rawDef = slotInfo.type === "def" ? primary : secondary;
    const { atk, def, enchantPct } = applyEnchant(slotInfo, rawAtk, rawDef, rarity);
    return {
      id, name, slot, rarity,
      atk, def, enchantPct,
      effect: null, effectDesc: null,
      minorTrait: rollMinorTrait(rarity)
    };
  }

  // standart
  const name = pick(STANDARD_NAMES[slot]);
  const primary = randInt(3, 8);
  const secondary = randInt(0, 2);
  const rawAtk = slotInfo.type === "atk" ? primary : secondary;
  const rawDef = slotInfo.type === "def" ? primary : secondary;
  const { atk, def, enchantPct } = applyEnchant(slotInfo, rawAtk, rawDef, rarity);
  return {
    id, name, slot, rarity,
    atk, def, enchantPct,
    effect: null, effectDesc: null,
    minorTrait: rollMinorTrait(rarity)
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
  return { kask: null, zirh: null, kalkan: null, kilic: null, eldiven: null, kupe: null, kolye: null, ayakkabi: null };
}

// ============================================================
// STATE
// ============================================================
let currentPlayerId = localStorage.getItem("gacha_player_id") || null;
let currentPlayerData = null;
let allPlayers = [];

// Oyuncu değiştirilip yeniden giriş yapıldığında startGame() tekrar çağrılıyordu ama
// eskiden açılan onSnapshot dinleyicileri hiç kapatılmıyordu. Bu hem gereksiz tekrar
// render'a hem de (asıl önemlisi) aynı anda birden fazla "kahin bahsi sonuçlandırma" /
// "haftalık liderlik sıfırlama" kontrolünün üst üste tetiklenip birbirinin yazdığı görev
// ilerlemesini ezmesine (kayıp güncelleme / race condition) yol açıyordu. Artık yeni bir
// oyun oturumu başlamadan önce eski tüm dinleyiciler kapatılıyor.
let activeUnsubscribers = [];
function clearActiveListeners() {
  activeUnsubscribers.forEach(unsub => { try { unsub(); } catch (e) { /* zaten kapanmış olabilir */ } });
  activeUnsubscribers = [];
}

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
const weeklyLeaderboardInfoEl = document.getElementById("weeklyLeaderboardInfo");
const bagGridEl = document.getElementById("bagGrid");
const charStageSlotsEl = document.getElementById("charStageSlots");
const myAttackEl = document.getElementById("myAttack");
const myDefenseEl = document.getElementById("myDefense");
const myPointsEl = document.getElementById("myPoints");
const myDustEl = document.getElementById("myDust");
const myStreakEl = document.getElementById("myStreak");
const streakChip = document.getElementById("streakChip");

const boxWrapper = document.getElementById("boxWrapper");
const epicChestEl = document.getElementById("epicChest");
const chestShockwaveEl = document.getElementById("chestShockwaveEl");
const chestFlashEl = document.getElementById("chestFlashEl");
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
const weeklyQuestsListEl = document.getElementById("weeklyQuestsList");
const monthlyQuestsListEl = document.getElementById("monthlyQuestsList");

const topPerformersBanner = document.getElementById("topPerformersBanner");
const tpBestName = document.getElementById("tpBestName");
const tpWorstName = document.getElementById("tpWorstName");

const luckyWheel = document.getElementById("luckyWheel");
const spinWheelBtn = document.getElementById("spinWheelBtn");
const wheelStatus = document.getElementById("wheelStatus");
const wheelScene = document.getElementById("wheelScene");
const wheelOuter = document.getElementById("wheelOuter");
const wheelBgGlow = document.getElementById("wheelBgGlow");
const wheelShockwaveEl = document.getElementById("wheelShockwaveEl");
const wheelPanelEl = document.getElementById("wheelPanel");

const bountyActive = document.getElementById("bountyActive");
const bountyTargetName = document.getElementById("bountyTargetName");
const bountyAmountEl = document.getElementById("bountyAmount");
const bountyPlacer = document.getElementById("bountyPlacer");
const bountyForm = document.getElementById("bountyForm");
const bountyTargetSelect = document.getElementById("bountyTargetSelect");
const bountyAmountInput = document.getElementById("bountyAmountInput");
const placeBountyBtn = document.getElementById("placeBountyBtn");
const bountyStatus = document.getElementById("bountyStatus");

const statsOverviewEl = document.getElementById("statsOverview");
const statsOpponentsEl = document.getElementById("statsOpponents");
const statsStreakEl = document.getElementById("statsStreak");
const badgesGridEl = document.getElementById("badgesGrid");
const badgesProgressEl = document.getElementById("badgesProgress");

const oraclePending = document.getElementById("oraclePending");
const oracleTargetLabel = document.getElementById("oracleTargetLabel");
const oracleAmountLabel = document.getElementById("oracleAmountLabel");
const oracleForm = document.getElementById("oracleForm");
const oracleTargetSelect = document.getElementById("oracleTargetSelect");
const oracleAmountInput = document.getElementById("oracleAmountInput");
const placeOracleBtn = document.getElementById("placeOracleBtn");
const oracleStatus = document.getElementById("oracleStatus");

const newFeaturesModal = document.getElementById("newFeaturesModal");
const newFeaturesTrack = document.getElementById("newFeaturesTrack");
const newFeaturesDots = document.getElementById("newFeaturesDots");
const nfPrevBtn = document.getElementById("nfPrevBtn");
const nfNextBtn = document.getElementById("nfNextBtn");
const nfSkipBtn = document.getElementById("nfSkipBtn");
const nfStepLabel = document.getElementById("nfStepLabel");
const closeNewFeaturesBtn = document.getElementById("closeNewFeaturesBtn");

let currentBounty = null; // gameMeta/bounty dokümanının canlı kopyası
let weeklyLeaderboardMeta = null; // gameMeta/weeklyLeaderboard dokümanının canlı kopyası

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
const tutSkipBtn = document.getElementById("tutSkipBtn");
const tutStepLabel = document.getElementById("tutStepLabel");

function renderLegendaryShowcase() {
  legendaryShowcase.innerHTML = LEGENDARY_ITEMS.map(it => `
    <div class="legend-card">
      <div class="legend-icon">${itemIconSvg(it.slot, "efsanevi", 30)}</div>
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
  const slideCount = tutorialTrack.children.length;
  [...tutorialDots.children].forEach((d, i) => d.classList.toggle("active", i === idx));
  tutPrevBtn.disabled = idx <= 0;
  tutNextBtn.disabled = idx >= slideCount - 1;
  if (tutStepLabel) tutStepLabel.textContent = `${idx + 1} / ${slideCount}`;
});
tutPrevBtn.onclick = () => goToTutorialSlide(currentTutorialIndex() - 1);
tutNextBtn.onclick = () => goToTutorialSlide(currentTutorialIndex() + 1);

// ============================================================
// YENİ GÜNCELLEME TANITIM EKRANI (otomatik, sayfa sayfa)
// Her yeni sürümde (LATEST_UPDATE_VERSION bump'landığında) burada da
// NEW_FEATURE_SLIDES güncellenmeli. Oyuna giren, tutorial'ı zaten görmüş
// ama bu sürümü henüz görmemiş herkese otomatik gösterilir.
// ============================================================
const NEW_FEATURE_SLIDES = {
  "1.14": [
    { icon: "🆕", title: "v1.14 Yenilikleri!", text: "Bu güncelleme oyunun ekipman derinliğini ciddi şekilde artırıyor: 3 yeni slot, 69 yeni eşya, yepyeni bir Efsun sistemi, yenilenmiş bir envanter tasarımı ve daha adil bir savaş algoritması geldi. Hadi tek tek bakalım." },
    { icon: "🔰", title: "3 Yeni Slot: Kalkan, Küpe, Kolye", text: "Kuşanım artık 5 değil 8 slot: Kask, Zırh ve Ayakkabı'nın yanına savunma tipinde 🔰 Kalkan; Kılıç ve Eldiven'in yanına ise saldırı tipinde 💎 Küpe ve 📿 Kolye eklendi. Karakter sahnesinde bu 3 slot da panterin üzerinde uygun anatomik konumlarda (kolyede boyunda, kalkan elinde, küpe kulağında) gösteriliyor." },
    { icon: "🧰", title: "69 Yeni Eşya", text: "Yeni slotların her birine tam 20 eşya eklendi: 11 standart, 6 nadir, 3 efsanevi. Toplamda 60 standart/nadir + 9 yepyeni efsanevi eşya oyuna katıldı. Yeni efsanevi eşyaların hepsinin gerçek pasif etkileri var; örneğin Kaymağın Kalkanı savunmayı %15 güçlendiriyor, Nazarlıklı Amcanın Kolyesi rakibe lanet okuyor, Işıltılı Dedikodu Küpesi ise %10 ihtimalle anında kazandırıyor." },
    { icon: "✨", title: "Efsun (Enchant) Sistemi", text: "Artık kutudan çıkan HER eşya, nadirliğine göre değişen oranda ekstra bir Efsun bonusu taşıyor: Standart eşyalarda ~%1-3, Nadir eşyalarda ~%5-9, Efsanevi eşyalarda ~%12-18 arası. Bu bonus otomatik olarak eşyanın ana statına (saldırı tipi eşyalarda saldırıya, savunma tipinde savunmaya) ekleniyor, yani aynı isimli iki eşya bile artık birbirinden farklı güçte çıkabilir. Efsun oranı eşyanın göründüğü her yerde ✨ rozetiyle gösteriliyor." },
    { icon: "📖", title: "Yenilenen Envanter Tasarımı", text: "Envanter ekranı sıfırdan tasarlandı: her eşya artık nadirliğine göre renklenen bir ikon rozeti, ayrı ayrı 'saldırı / savunma / efsun' etiketleri ve nadirlik + kutudan çıkma şansı bilgisiyle gösteriliyor. Envanterin en üstünde ise o slotun temel kutu şanslarını (Standart / Nadir / Efsanevi) özetleyen yeni bir bilgi şeridi var." },
    { icon: "⚔️", title: "Daha Adil Savaş Algoritması", text: "Önceden savaşta sadece 'rol statı' bakılıyordu (saldıranın sadece saldırısı, savunanın sadece savunması). Bu yüzden saldırısı düşük ama savunması çok yüksek biri saldırıya geçtiğinde, kendinden çok daha zayıf ekipmanlı birine bile otomatik kaybedebiliyordu. Artık her iki tarafın DİĞER statı da küçük bir ağırlıkla hesaba katılıyor, yani toplam ekipman yatırımın savaşta gerçekten işine yarıyor." }
  ],
  "1.13": [
    { icon: "🆕", title: "v1.13 Yenilikleri!", text: "Bu güncelleme oyunun görünüşüne ve kulağa gelişine odaklanıyor, ayrıca can sıkan bir haftalık liderlik hatası da düzeltildi. Hadi bakalım." },
    { icon: "🔤", title: "Yeni Yazı Tipleri", text: "Oyunun geneli artık daha yuvarlak ve kalın bir fontla (Fredoka) yazılıyor. Logo ve büyük başlık şeritleri ise daha iddialı, kalın bir font olan Luckiest Guy ile gösteriliyor." },
    { icon: "🔊", title: "Gerçek Ses Efektleri", text: "Buton tıklaması, saldırı anı, savaş/Kahin Bahsi/Gizemli Yabancı sonuçlarındaki kazanma-kaybetme sesleri ve Şanslı Çark'ın dönüşü artık sentetik biplerden gerçek ses kayıtlarına geçti." },
    { icon: "🏆", title: "Haftalık Liderlik Sıfırlaması Düzeltildi", text: "Sıfırlama artık sadece girişte değil, oyun açıkken de dakikada bir otomatik kontrol ediliyor. Pazar 00:00 geldiğinde uygulama açık kalsa bile puanlar gerçekten sıfırlanıp şampiyon ödülünü kapıyor." }
  ],
  "1.12": [
    { icon: "🆕", title: "v1.12 Yenilikleri!", text: "Bu güncelleme oyuna sezonluk bir rekabet katıyor: Haftalık Liderlik Tablosu ve Rozetler geldi. Hadi bakalım." },
    { icon: "🏆", title: "Haftalık Liderlik Sıfırlaması", text: "Liderlik tablosu artık her Pazar 00:00'da sıfırlanıyor! O haftayı 1. bitiren oyuncu toz + garanti bir nadir eşya kazanıyor. ÖNEMLİ: sıfırlama anında kazanan da dahil HERKESİN puanı 0'a dönüyor, yani her hafta sıfırdan yeni bir yarış başlıyor." },
    { icon: "🎖️", title: "Rozetler", text: "Profil altındaki İstatistik sekmesine yeni bir 🎖️ Rozetler paneli eklendi. Toplam 44 farklı rozet var: galibiyet serileri, efsanevi eşya koleksiyonu, Kahin Bahsi'nde 'Bahis Baronu' olmak, Kelle Avcısı'nda 'Cellat' olmak, haftanın birinciliği ve daha fazlası. Rozetler otomatik hesaplanıyor, kazandıkça anında açılıyor." }
  ],
  "1.11": [
    { icon: "🆕", title: "v1.11 Yenilikleri!", text: "Bu güncellemede görev sistemine yeni bir katman eklendi ve Kahin Bahsi'nde birkaç önemli kural netleşti. Hadi bakalım neler değişti." },
    { icon: "🗓️", title: "Haftalık Görevler", text: "Görev sekmesine yeni bir 🗓️ Haftalık Görevler paneli eklendi. Her hafta Pazartesi sıfırlanan bu görevlerden 3 tanesi rastgele atanıyor (örn. çokça kutu aç, savaş kazan, Kahin Bahsi'ni doğru bil, Kelle Avcısı ödülünü kap). Zorluk günlük görevlerden belirgin şekilde yüksek, ödüller de (toz + puan + bazen garanti/şanslı nadir eşya) buna göre büyütüldü." },
    { icon: "📅", title: "Aylık Görevler", text: "Yeni 📅 Aylık Görevler panelinde her ay 3 görev var. Bunlardan biri her zaman sabit ve gerçekten zor: 'Bu ay 30 savaş kazan'. Bu görevi tamamlayan tek ödül olarak garanti bir efsanevi eşya kazanıyor! Diğer iki aylık görev ise (kutu açma, saldırı, Kahin Bahsi veya Kelle Avcısı temelli) büyük miktarda toz, puan ve garanti nadir eşya veriyor." },
    { icon: "🔮", title: "Kahin Bahsi'nde Netleşen Kurallar", text: "Kahin Bahsi'nde artık kendine bahis oynayamıyorsun, hedef listende kendi ismin görünmüyor. Ayrıca tek seferde yatırabileceğin toz miktarı en fazla 10 toz ile sınırlandı. Bu değişiklikler bahsin herkes için adil ve dengeli kalması içindi." },
    { icon: "🔊", title: "Ses Efektleri Sağlam", text: "Bir önceki güncellemede eklenen yumuşak buton tıklama sesi ve saldırıdaki metalik 'çınnn' efekti bu sürümde de aynen korunuyor, sağlam ve sorunsuz çalışıyor." }
  ],
  "1.10": [
    { icon: "🆕", title: "v1.10 Yenilikleri!", text: "Bu güncellemede 1 yeni sistem ve oyunun kulaklara daha iyi gelmesi için bir ses güncellemesi var. Hadi bakalım." },
    { icon: "🔮", title: "Kahin Bahsi", text: "Yeni 🔮 Kahin Bahsi, Sıra sekmesine eklendi. Günün sonunda liderlik tablosunun 1.'sinin kim olacağını tahmin edip toz yatırıyorsun. Günde 1 hakkın var: doğru bilirsen yatırdığın toz 2 katına çıkar, yanlış bilirsen gider. Sonucu bir sonraki girişinde otomatik öğrenirsin." },
    { icon: "🔊", title: "Daha Tatlı Sesler", text: "Genel buton tıklama sesi artık çok daha yumuşak ve kulak yormuyor. Saldırı butonuna basınca ise gerçek bir kılıç çarpışması gibi metalik bir 'çınnn' sesi duyuyorsun." }
  ],
  "1.9": [
    { icon: "🆕", title: "v1.9 Yenilikleri!", text: "Bu güncellemede oyuna 4 yepyeni sistem ve ana ekrana günlük bir performans panosu eklendi. Hadi hızlıca gezelim." },
    { icon: "📊", title: "Kişisel İstatistik", text: "Yeni 📊 İstatistik sekmesinde toplam kazanma/kaybetme oranını, en çok yendiğin ve en çok yenildiğin kişiyi, şu anki ve şimdiye kadarki en uzun kazanma serini görebilirsin." },
    { icon: "🎡", title: "Şanslı Çark", text: "Kutu sekmesine eklendi. Haftada bir kez tamamen bedava çevirebilirsin, küçük toz/puan ödülleri ve nadiren büyük bir jackpot kazandırır." },
    { icon: "💀", title: "Kelle Avcısı", text: "Savaş sekmesinde artık tozunu harcayarak istediğin bir oyuncunun kellesine ödül koyabilirsin. Bu ilan herkese aynı anda görünür, o kişiyi İLK yenen ödülü kapar." },
    { icon: "👑", title: "1.lik Avı", text: `Liderlik tablosunun zirvesindeki oyuncu artık 👑 rozetiyle işaretleniyor. Onu saldırıda yenersen normal kazancının üstüne +${THRONE_BONUS_POINTS} ekstra bonus puan kazanırsın.` },
    { icon: "🦁", title: "Allahın Aslanı & Grubun Sürtüğü", text: "Ana ekranın üstünde artık günün en çok savaş kazanan oyuncusu 🦁 'Allahın Aslanı', en çok kaybedeni ise 🤡 'Grubun Sürtüğü' olarak gösteriliyor. Her gün sıfırdan başlıyor." }
  ]
};

function renderNewFeaturesSlides(version) {
  const slides = NEW_FEATURE_SLIDES[version] || [];
  newFeaturesTrack.innerHTML = slides.map(s => `
    <div class="tutorial-slide">
      <div class="tut-hero">${s.icon}</div>
      <h2 class="tut-title">${s.title}</h2>
      <p class="tut-text">${s.text}</p>
    </div>
  `).join("");
}

function currentNewFeaturesIndex() {
  return Math.round(newFeaturesTrack.scrollLeft / newFeaturesTrack.clientWidth);
}
function goToNewFeaturesSlide(i) {
  const slideCount = newFeaturesTrack.children.length;
  const clamped = Math.max(0, Math.min(slideCount - 1, i));
  newFeaturesTrack.scrollTo({ left: clamped * newFeaturesTrack.clientWidth, behavior: "smooth" });
}
function buildNewFeaturesDots() {
  const slideCount = newFeaturesTrack.children.length;
  newFeaturesDots.innerHTML = "";
  for (let i = 0; i < slideCount; i++) {
    const dot = document.createElement("button");
    dot.className = "tut-dot" + (i === 0 ? " active" : "");
    dot.onclick = () => goToNewFeaturesSlide(i);
    newFeaturesDots.appendChild(dot);
  }
}
if (newFeaturesTrack) {
  newFeaturesTrack.addEventListener("scroll", () => {
    const idx = currentNewFeaturesIndex();
    const slideCount = newFeaturesTrack.children.length;
    [...newFeaturesDots.children].forEach((d, i) => d.classList.toggle("active", i === idx));
    nfPrevBtn.disabled = idx <= 0;
    nfNextBtn.disabled = idx >= slideCount - 1;
    if (nfStepLabel) nfStepLabel.textContent = `${idx + 1} / ${slideCount}`;
  });
  nfPrevBtn.onclick = () => goToNewFeaturesSlide(currentNewFeaturesIndex() - 1);
  nfNextBtn.onclick = () => goToNewFeaturesSlide(currentNewFeaturesIndex() + 1);
}

function closeNewFeatures() {
  localStorage.setItem("gacha_last_seen_update", LATEST_UPDATE_VERSION);
  newFeaturesModal.classList.add("hidden");
  refreshUpdatesDot();
}
if (closeNewFeaturesBtn) closeNewFeaturesBtn.onclick = closeNewFeatures;
if (nfSkipBtn) nfSkipBtn.onclick = closeNewFeatures;

function maybeShowNewFeatures() {
  const seen = localStorage.getItem("gacha_last_seen_update");
  if (seen === LATEST_UPDATE_VERSION) return;
  if (!NEW_FEATURE_SLIDES[LATEST_UPDATE_VERSION]) { closeNewFeatures(); return; }
  renderNewFeaturesSlides(LATEST_UPDATE_VERSION);
  buildNewFeaturesDots();
  newFeaturesModal.classList.remove("hidden");
  nfPrevBtn.disabled = true;
  nfNextBtn.disabled = newFeaturesTrack.children.length <= 1;
  if (nfStepLabel) nfStepLabel.textContent = `1 / ${newFeaturesTrack.children.length}`;
  requestAnimationFrame(() => { newFeaturesTrack.scrollLeft = 0; });
}

function maybeShowTutorial() {
  if (!localStorage.getItem("gacha_tutorial_seen")) {
    openTutorial();
    return true;
  }
  return false;
}
function openTutorial() {
  renderLegendaryShowcase();
  buildTutorialDots();
  tutorialModal.classList.remove("hidden");
  tutPrevBtn.disabled = true;
  tutNextBtn.disabled = tutorialTrack.children.length <= 1;
  if (tutStepLabel) tutStepLabel.textContent = `1 / ${tutorialTrack.children.length}`;
  // Modal ilk kez görünür olduğunda scrollLeft/clientWidth doğru okunsun diye ufak bir gecikme
  requestAnimationFrame(() => { tutorialTrack.scrollLeft = 0; });
}
function closeTutorial() {
  localStorage.setItem("gacha_tutorial_seen", "1");
  // Yeni öğretici zaten bu sürümün tüm yeniliklerini anlattığı için, ayrıca
  // "Yeni Güncelleme" ekranını tekrar göstermeye gerek yok.
  localStorage.setItem("gacha_last_seen_update", LATEST_UPDATE_VERSION);
  refreshUpdatesDot();
  tutorialModal.classList.add("hidden");
}
closeTutorialBtn.onclick = closeTutorial;
if (tutSkipBtn) tutSkipBtn.onclick = closeTutorial;
howToBtn.onclick = () => openTutorial();

// ============================================================
// YENİLİKLER / YOL HARİTASI
// Her yeni özellik bittiğinde status'u "soon" -> "done" yapıp
// LATEST_UPDATE_VERSION'ı artırman yeterli, rozet otomatik güncellenir.
// ============================================================
const LATEST_UPDATE_VERSION = "1.14";

const RELEASES = [
  {
    version: "1.14",
    date: "5 Temmuz 2026",
    items: [
      "🔰💎📿 3 yeni ekipman slotu eklendi: Kalkan, Küpe ve Kolye! Kalkan savunma tipinde, Küpe ve Kolye saldırı tipinde çalışıyor. Artık kuşanım toplam 8 slota çıktı: Kask, Zırh, Kalkan, Kılıç, Eldiven, Küpe, Kolye, Ayakkabı. Karakter sahnesinde de bu 3 yeni slot, panterin üzerinde anatomik olarak doğru konumlarda (kolye boyunda, kalkan bir elde, küpe kulakta) gösteriliyor.",
      "🧰 Her yeni slot için 20'şer eşya eklendi (toplam 60 yeni standart/nadir eşya + 9 yeni efsanevi eşya = 69 yeni eşya): Kalkan, Küpe ve Kolye'nin her birinde 11 standart, 6 nadir ve 3 efsanevi eşya var. Yeni efsanevi eşyalar da diğerleri gibi gerçek pasif etkilere sahip (örn. 'Kaymağın Kalkanı' savunmayı %15 güçlendiriyor, 'Nazarlıklı Amcanın Kolyesi' rakibe lanet okuyor).",
      "✨ EFSUN (Enchant) sistemi eklendi: Artık her düşen eşya, nadirliğine göre değişen oranda ek bir 'efsun' bonusu kazanıyor ve bu bonus eşyanın ana statına (saldırı tipi eşyalarda saldırıya, savunma tipi eşyalarda savunmaya) otomatik ekleniyor. Standart eşyalarda efsun ~%1-3, Nadir eşyalarda ~%5-9, Efsanevi eşyalarda ~%12-18 arası. Bu sayede aynı isimli iki eşya bile efsun farkından dolayı birbirinden az ya da çok güçlü çıkabiliyor. Efsun oranı, eşyanın olduğu her yerde (envanter, kutu açılış popup'ı, görev ödülü popup'ı, başkasının ekipmanı ekranı) ✨ rozetiyle gösteriliyor.",
      "📖 Envanter ekranı baştan tasarlandı: her eşya artık nadirliğine göre renklenen bir ikon rozetiyle, ayrı stat 'hap'leriyle (⚔️ saldırı / 🛡️ savunma / ✨ efsun) ve nadirlik + kutu şansı etiketiyle birlikte çok daha okunaklı bir kart halinde gösteriliyor. Ayrıca envanterin en üstüne, o an geçerli temel kutu şanslarını (Standart/Nadir/Efsanevi) gösteren bir bilgi şeridi eklendi.",
      "⚔️ Savaş algoritması dengelendi: önceden sadece 'rol statı' (saldıranın saldırısı, savunanın savunması) hesaba katılıyordu. Artık her tarafın diğer statı da (örn. saldıranın savunması, savunanın saldırısı) küçük bir ağırlıkla hesaba katılıyor. Böylece saldırısı düşük ama savunması çok yüksek (yani toplam ekipmanı güçlü) biri saldırıya geçtiğinde eskisi gibi otomatik ezilmiyor, toplam ekipman yatırımı da işin içine giriyor."
    ]
  },
  {
    version: "1.13",
    date: "5 Temmuz 2026",
    items: [
      "🔤 Yeni yazı tipleri: Oyunun geneli artık yuvarlak, kalın ve daha 'oyunsu' bir fontla (Fredoka) yazılıyor; logo ve büyük başlık şeritleri (🐆 Pembe Panterler Battle, sekme başlıkları, öğretici ve yenilikler ekranlarındaki başlıklar) ise daha iddialı, kalın bir font olan Luckiest Guy ile gösteriliyor.",
      "🔊 Gerçek ses efektleri: Genel buton tıklaması, saldırı anı (2 farklı ses arasında rastgele seçiliyor), savaş/Kahin Bahsi/Gizemli Yabancı sonuçlarında kazanma-kaybetme sesleri ve Şanslı Çark'ın dönüş sesi artık sentetik bip yerine gerçek ses kayıtlarıyla çalıyor.",
      "🏆 Haftalık Liderlik Tablosu düzeltmesi: sıfırlama kontrolü önceden sadece oyuna giriş yapıldığında çalışıyordu, bu yüzden uygulama Pazar 00:00'ı açık bir sekmede geçirenlerde hiç tetiklenmiyordu. Artık oyun açıkken de dakikada bir otomatik kontrol ediliyor, hafta döndüğü an puanlar gerçekten sıfırlanıp şampiyon ödülünü kapıyor."
    ]
  },
  {
    version: "1.12",
    date: "5 Temmuz 2026",
    items: [
      "🏆 Haftalık Liderlik Tablosu eklendi: liderlik tablosu artık her Pazar 00:00'da otomatik sıfırlanıyor. O haftayı 1. bitiren oyuncu toz + garanti bir nadir eşya kazanıyor ve 'haftalık şampiyonluk' sayacı +1 oluyor. Sıfırlama anında kazanan da dahil HERKESİN puanı 0'a dönüyor, yeni hafta sıfırdan başlıyor. Liderlik sekmesinde geçen haftanın şampiyonu ve bir sonraki sıfırlamaya kalan süre gösteriliyor.",
      "🎖️ Rozetler eklendi (İstatistik sekmesi): toplam 44 farklı rozet. Galibiyet sayısı ve serisi, efsanevi eşya koleksiyonu, aynı anda kuşanılan efsanevi eşya sayısı, kutu açma, toz biriktirme, haftalık şampiyonluk, Kahin Bahsi ('Bahis Baronu'na kadar), Kelle Avcısı ('Cellat'a kadar), Gizemli Yabancı, Şanslı Çark jackpot'u ve koleksiyon tamamlama gibi kategorilerde. Rozetler otomatik hesaplanıyor, ekstra bir işlem gerekmiyor."
    ]
  },
  {
    version: "1.11",
    date: "5 Temmuz 2026",
    items: [
      "🗓️ Haftalık Görevler eklendi (Görev sekmesi): her hafta Pazartesi sıfırlanan, günlük görevlerden belirgin şekilde zor 3 rastgele görev atanıyor (kutu açma, savaşa girme, savaş kazanma, enerji görevi, Kahin Bahsi'ni doğru bilme veya Kelle Avcısı ödülü kapma temelli). Ödüller de zorluğa göre büyütüldü: daha fazla toz/puan ve şansa bağlı ya da garanti nadir eşya.",
      "📅 Aylık Görevler eklendi (Görev sekmesi): her ay 3 görev atanıyor. Bunlardan biri her zaman sabit ve gerçekten zorlayıcı: 'Bu ay 30 savaş kazan'. Bu görevi tamamlayan TEK ödül olarak garanti bir efsanevi eşya kazanıyor. Diğer iki aylık görev ise büyük miktarda toz, puan ve garanti nadir eşya veriyor.",
      "🔮 Kahin Bahsi'nde denge güncellemesi: artık kimse kendine bahis oynayamıyor (hedef listesinde kendi ismin görünmüyor) ve tek seferde yatırılabilecek toz miktarı en fazla 10 toz ile sınırlandırıldı.",
      "🔊 Ses efektleri (buton tıklaması ve saldırı çınlaması) bu sürümde de değişmeden, sağlam şekilde korunuyor."
    ]
  },
  {
    version: "1.10",
    date: "5 Temmuz 2026",
    items: [
      "🔮 Kahin Bahsi eklendi (Sıra sekmesi): günün sonunda liderlik tablosunun 1.'sinin kim olacağını tahmin edip toz yatırabilirsin. Günde 1 tahmin hakkın var, doğru bilirsen yatırdığın toz 2 katına çıkıyor, yanlış bilirsen yatırdığın toz gidiyor. Sonuç, ertesi gün oyuna giriş yapınca otomatik açıklanıyor.",
      "🔊 Ses efektleri iyileştirildi: genel buton tıklama sesi çok daha yumuşak ve kulak yormayan bir 'tık' sesine çevrildi. Saldırı butonuna basınca artık gerçek bir kılıç çarpışması gibi metalik bir 'çınnn' + vuruş sesi çalıyor."
    ]
  },
  {
    version: "1.9",
    date: "5 Temmuz 2026",
    items: [
      "📊 Kişisel İstatistik sekmesi eklendi: toplam kazanma/kaybetme oranın, en çok yendiğin kişi, en çok yenildiğin kişi ve şimdiye kadarki en uzun kazanma serin artık tek bir ekranda, detaylı bir kariyer karnesi halinde görüntüleniyor.",
      "🎡 Şanslı Çark eklendi (Kutu sekmesi): haftada bir kez tamamen bedava çevirebiliyorsun. Çark küçük toz veya puan ödülleri veriyor, nadiren de büyük bir 'jackpot' (hem toz hem puan) çıkabiliyor.",
      "💀 Kelle Avcısı eklendi (Savaş sekmesi): tozunu harcayarak herhangi bir oyuncunun kellesine ödül koyabilirsin. Bu ödül herkese aynı anda görünür, o kişiyi savaşta İLK yenen oyuncu ödülü kapar ve ilan sıfırlanır.",
      "👑 1.lik Avı eklendi: liderlik tablosunun zirvesindeki oyuncuyu saldırıda yenersen normal kazanç puanının üstüne +8 ekstra bonus puan kazanıyorsun. Zirvedeki isim artık liderlik tablosunda ve saldırı hedef listesinde 👑 rozetiyle işaretleniyor.",
      "🦁🤡 Ana ekrana günlük performans banner'ı eklendi: o gün en çok savaş kazanan oyuncu 'Allahın Aslanı', en çok savaş kaybeden oyuncu ise 'Grubun Sürtüğü' olarak gösteriliyor. Sayaçlar her takvim günü sıfırlanıyor.",
      "Yeni bir güncelleme geldiğinde artık oyuna giriş yapan herkese, o güncellemede neyin değiştiğini sayfa sayfa anlatan otomatik bir 'Yenilikler' tanıtım ekranı gösteriliyor (öğretici ile aynı kaydırmalı yapı, ama sadece o güncellemeye özel)."
    ]
  },
  {
    version: "1.8",
    date: "5 Temmuz 2026",
    items: [
      "Arayüz baştan aşağı gerçek bir sekme (tab) sistemine geçirildi: 📦 Kutu, 🎯 Görev, ⚔️ Savaş, 🏆 Sıra ve 🐆 Profil sekmelerinin her biri artık SADECE kendi içeriğini gösteriyor (örn. Kutu sekmesinde yalnızca kutu açma ve enerji ekranı var, Savaş sekmesinde yalnızca saldırı hedefleri ve savaş geçmişi var, Profil'de yalnızca kuşanım/envanter ve kişisel istatistikler var). Ekranın altına, sekmeler arasında tek dokunuşla geçiş sağlayan sabit bir navigasyon çubuğu eklendi.",
      "Dengeleme — hedef kilitleme sistemi: aynı oyuncuya art arda en fazla 3 kez saldırılabiliyor. Bir hedef 3. saldırıdan sonra kilitleniyor ve kilidin açılması için önce farklı hedeflere en az 3 savaş daha yapman gerekiyor. Bu sayede tek bir oyuncunun sürekli aynı kurbanı seçerek onu bezdirmesi engellendi; hedef listesinde kilitli oyuncular 🔒 rozetiyle ve kalan savaş sayısıyla birlikte gösteriliyor.",
      "Profil sekmesine, ekipmanları panterin üstünde anatomik olarak doğru konumlarda gösteren yeni bir 'karakter sahnesi' eklendi: kask başta, zırh gövdede, kılıç ve eldiven ellerde, ayakkabı ayakta. Bu görsel özetin altında, eşyalara dokunup değiştirebileceğin klasik kuşanım/envanter listesi olduğu gibi duruyor.",
      "Eşyaların nadirliğe göre görsel kimliği güçlendirildi: nadir eşyalarda yumuşak mavi bir parıltı, efsanevi eşyalarda ise sürekli nabız gibi atan altın bir hale animasyonu eklendi. Bu efekt artık kuşanım slotlarında, karakter sahnesinde, envanter listesinde ve kutu açılış popup'ında tutarlı şekilde uygulanıyor.",
      "Savaş Geçmişi yeniden tasarlandı: her kayıtta artık saldıran/savunan isimleri üstte ayrı bir başlık satırında, KAZANDI / SAVUNDU / PAS GEÇTİ / EFSANEVİ ETKİ rozetleriyle birlikte gösteriliyor; renkli flavor-metin altta daha okunaklı bir şekilde yer alıyor.",
      "İlk giriş öğreticisi (tutorial) kullanışlı hale getirildi: adım sayacı eklendi (örn. '3 / 6'), ilk ve son slaytlarda ileri/geri okları otomatik pasifleşiyor, sağ üstteki 'Atla ✕' butonuyla öğretici istenildiğinde anında kapatılabiliyor.",
      "Yenilikler & Yol Haritası ekranı akordeon (aç/kapa) yapısına geçti: en güncel sürüm otomatik açık geliyor ve üstünde 'Yeni' rozetiyle işaretleniyor, eski sürümler tıklanınca açılıp kapanıyor; böylece uzun liste çok daha kolay taranabiliyor.",
      "Her sekmenin üstüne, o bölümün ne işe yaradığını netleştiren şerit tarzı bir başlık (örn. '⚔️ Savaş Arenası', '🏆 Liderlik Tablosu') eklendi; oyunun genel görsel kimliği (pembe panter teması, kalın 3D butonlar, altıgen slotlar) tüm sekmelere tutarlı şekilde yayıldı.",
      "Bir önceki sürümde eklenen ses efektleri (kutu açılışı, saldırı, buton tıklamaları) ve ses aç/kapa düğmesi bu sürümde de korunuyor; yeni sekme geçişleri de aynı geri bildirim sesleriyle çalışıyor."
    ]
  },
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
  "Rozet ve unvan sistemi: oyun içi başarımların profilde gösterilmesi.",
  "Haftalık/aylık sezonlar ve geçmiş şampiyonların tutulduğu bir arşiv.",
  "Anlık bildirimler: efsanevi eşya bulunduğunda veya saldırı anında ekran bildirimi.",
  "Karakter avatarı seçimi.",
  "Ses efektleri.",
  "Confetti efekti.",
  "Sunucu Boss'u: haftalık ortak raid etkinliği."
];

function renderUpdatesList() {
  const releasesHtml = RELEASES.map((r, i) => `
    <div class="release-block ${i === 0 ? "open" : ""}">
      <button type="button" class="release-header" data-idx="${i}">
        <span class="release-version">v${r.version}</span>
        <span class="release-date">${r.date}</span>
        ${i === 0 ? `<span class="update-badge done">Yeni</span>` : ""}
        <span class="release-chevron">⌄</span>
      </button>
      <ul class="release-items">${r.items.map(t => `<li>${t}</li>`).join("")}</ul>
    </div>
  `).join("");

  const roadmapHtml = `
    <div class="roadmap-block">
      <div class="roadmap-header">🔮 Yol Haritası</div>
      <ul class="release-items roadmap-items">${ROADMAP.map(t => `<li>${t}</li>`).join("")}</ul>
    </div>`;

  updatesList.innerHTML = releasesHtml + roadmapHtml;

  updatesList.querySelectorAll(".release-header").forEach(btn => {
    btn.onclick = () => btn.closest(".release-block").classList.toggle("open");
  });
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
  let dustGain = Math.round((DUST_FROM_RARITY[target.rarity] || 0) * getTodaysEvent().dustMult);
  if (target.minorTrait?.id === "dust_boost") {
    dustGain = Math.round(dustGain * (1 + target.minorTrait.pct / 100));
  }
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

// Envanter modalının üstünde, o slotun 3 nadirliğinin de temel kutu şansını
// gösteren küçük bir bilgi şeridi. Salt bilgilendirme amaçlı, hesaplamayı
// etkilemez.
function renderDropRatesInfoHtml() {
  return `
    <div class="drop-rates-info">
      <span class="drop-rate-chip rarity-standart">⚪ Standart <b>${RARITY_CHANCE_LABELS.standart}</b></span>
      <span class="drop-rate-chip rarity-nadir">🔷 Nadir <b>${RARITY_CHANCE_LABELS.nadir}</b></span>
      <span class="drop-rate-chip rarity-efsanevi">🌟 Efsanevi <b>${RARITY_CHANCE_LABELS.efsanevi}</b></span>
    </div>`;
}

function renderInventoryModal() {
  if (!currentInventorySlot) return;
  const slot = currentInventorySlot;
  const s = SLOT_MAP[slot];
  inventoryModalTitle.textContent = `${s.icon} ${s.label} Envanteri`;

  const rarityOrder = { efsanevi: 0, nadir: 1, standart: 2 };
  const items = getSlotInventory(slot).slice().sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);
  const equippedId = currentPlayerData?.equipment?.[slot]?.id;

  const dropRatesHtml = renderDropRatesInfoHtml();

  if (!items.length) {
    inventoryList.innerHTML = dropRatesHtml + `<p class="box-status">Bu slotta henüz eşyan yok, sandık aç ve şansını dene!</p>`;
    return;
  }

  inventoryList.innerHTML = dropRatesHtml + items.map(it => {
    const isEquipped = it.id === equippedId;
    const statLabel = SLOT_MAP[it.slot]?.type === "atk" ? "Saldırı" : "Savunma";
    return `
      <div class="inv-item inv-item-v2 rarity-${it.rarity}">
        <div class="inv-item-head">
          <div class="inv-item-icon-badge rarity-${it.rarity}">${itemIconSvg(it.slot, it.rarity, 26)}</div>
          <div class="inv-item-head-body">
            <span class="inv-item-name">${it.name}</span>
            <span class="inv-item-rarity-tag rarity-${it.rarity}">${RARITY_LABELS_TR[it.rarity]} · ${RARITY_CHANCE_LABELS[it.rarity]} şans</span>
          </div>
          ${isEquipped ? `<span class="update-badge done">✅ KUŞANILI</span>` : ""}
        </div>
        <div class="inv-item-stat-pills">
          <span class="inv-stat-pill atk">⚔️ +${it.atk}</span>
          <span class="inv-stat-pill def">🛡️ +${it.def}</span>
          ${it.enchantPct ? `<span class="inv-stat-pill enchant">✨ Efsun +%${it.enchantPct} ${statLabel}</span>` : ""}
        </div>
        ${it.effectDesc ? `<div class="item-popup-passive" style="margin-top:6px;">✨ ${it.effectDesc}</div>` : ""}
        ${it.minorTrait ? `<div class="item-popup-passive minor-passive" style="margin-top:6px;">${it.minorTrait.icon} <b>${it.minorTrait.name}:</b> ${it.minorTrait.desc}</div>` : ""}
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
      note.textContent = "9 oyuncu kontenjanı dolu, listeden ismini seç.";
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
  if (players.length >= MAX_PLAYERS) { loginError.textContent = `Kontenjan dolu (${MAX_PLAYERS}/${MAX_PLAYERS}).`; return; }
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
      inventory: { kask: [], zirh: [], kalkan: [], kilic: [], eldiven: [], kupe: [], kolye: [], ayakkabi: [] },
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
      targetCooldowns: {},
      discoveredItems: [],
      strangerDay: null,
      strangerAvailable: false,
      strangerUsed: false,
      strangerName: null,
      lastWheelSpinTime: 0,
      oracleBet: null,
      dailyStatsDay: null,
      dailyWins: 0,
      dailyLosses: 0,
      weeklyQuests: [],
      questsWeek: null,
      monthlyQuests: [],
      questsMonth: null,
      totalBoxesOpened: 0,
      oracleWinsTotal: 0,
      bountyWinsTotal: 0,
      strangerWinsTotal: 0,
      wheelJackpotsTotal: 0,
      weeklyChampionCount: 0,
      stats: {
        totalWins: 0,
        totalLosses: 0,
        attackWins: 0,
        attackLosses: 0,
        defenseWins: 0,
        defenseLosses: 0,
        currentStreak: 0,
        longestStreak: 0,
        winsByOpponent: {},
        lossesByOpponent: {}
      },
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
  clearActiveListeners();
  localStorage.removeItem("gacha_player_id");
  currentPlayerId = null;
  currentPlayerData = null;
  showLoginScreen();
};

// ============================================================
// OYUN BAŞLATMA
// ============================================================
async function startGame() {
  clearActiveListeners();
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
  const openedTutorial = maybeShowTutorial();
  if (!openedTutorial) maybeShowNewFeatures();
  await ensureStrangerForToday(snap.data());
  await ensureDailyQuestsForToday(snap.data());
  await ensureWeeklyQuestsForThisWeek(snap.data());
  await ensureMonthlyQuestsForThisMonth(snap.data());
  await ensureWeeklyLeaderboardReset();

  // Kendi oyuncu belgemi canlı dinle
  activeUnsubscribers.push(onSnapshot(ref, (docSnap) => {
    if (!docSnap.exists()) return;
    currentPlayerData = { id: docSnap.id, ...docSnap.data() };
    renderMyStats();
    renderBagGrid();
    renderCharacterStage();
    renderBoxStatus();
    renderAttackTargets();
    renderStrangerBanner();
    renderEnergy();
    renderQuests();
    renderWheel();
    renderStatsTab();
    renderBadges();
    renderOraclePanel();
    ensureOracleBetResolved();
    if (!collectionModal.classList.contains("hidden")) renderCollection();
    if (!inventoryModal.classList.contains("hidden")) renderInventoryModal();
  }));

  // Tüm oyuncuları canlı dinle (liderlik tablosu + saldırı hedefleri)
  const playersQuery = query(collection(db, PLAYERS_COL), orderBy("points", "desc"));
  activeUnsubscribers.push(onSnapshot(playersQuery, (snap) => {
    allPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLeaderboard();
    renderAttackTargets();
    renderTopPerformers();
    renderBountyForm();
    renderOracleForm();
    ensureOracleBetResolved();
  }));

  // Kelle Avcısı ilanını (paylaşımlı doküman) canlı dinle
  activeUnsubscribers.push(onSnapshot(doc(db, META_COL, BOUNTY_DOC_ID), (docSnap) => {
    currentBounty = docSnap.exists() ? docSnap.data() : null;
    renderBounty();
  }));

  // Haftalık liderlik meta dokümanını (geçen haftanın şampiyonu) canlı dinle
  activeUnsubscribers.push(onSnapshot(doc(db, META_COL, WEEKLY_LEADERBOARD_DOC_ID), (docSnap) => {
    weeklyLeaderboardMeta = docSnap.exists() ? docSnap.data() : null;
    renderWeeklyLeaderboardInfo();
  }));

  // Savaş geçmişini canlı dinle
  const logQuery = query(collection(db, LOG_COL), orderBy("timestamp", "desc"), limit(40));
  activeUnsubscribers.push(onSnapshot(logQuery, (snap) => {
    renderBattleLog(snap.docs.map(d => d.data()));
  }));
}

// ============================================================
// RENDER: LİDERLİK TABLOSU
// ============================================================
// Geçen haftanın şampiyonu + bir sonraki Pazar 00:00'a kalan süre.
function renderWeeklyLeaderboardInfo() {
  if (!weeklyLeaderboardInfoEl) return;
  const msLeft = getMsUntilNextSunday();
  const champion = weeklyLeaderboardMeta?.lastWinnerName;
  const championPts = weeklyLeaderboardMeta?.lastWinnerPoints;
  weeklyLeaderboardInfoEl.innerHTML = `
    ${champion ? `<div class="wl-champion">🏆 Geçen haftanın şampiyonu: <b>${champion}</b> (${championPts} puan) — ödül olarak toz + garanti nadir eşya kazandı!</div>` : ""}
    <div class="wl-countdown">⏳ Liderlik tablosu her Pazar 00:00'da sıfırlanır, 1. olan toz + garanti nadir eşya kazanır. Kalan süre: <b>${formatRemaining(msLeft)}</b></div>
  `;
}
setInterval(renderWeeklyLeaderboardInfo, 60000);
// ÖNEMLİ DÜZELTME: ensureWeeklyLeaderboardReset() önceden SADECE startGame()
// içinde, yani girişte bir kez çağrılıyordu. Pazar 00:00'ı uygulama açıkken
// (sekme kapatılmadan) geçiren biri için bu satır bir daha hiç çalışmıyordu;
// sadece yukarıdaki 60 saniyelik interval ekrandaki geri sayımı ("bir sonraki
// pazara ... kaldı") güncellediği için sıfırlama sanki olmuş gibi görünüyordu,
// ama Firestore'daki puanlar hiç sıfırlanmıyordu. Artık oyun açıkken de her
// dakika kontrol ediliyor; hafta değiştiği an (transaction içindeki
// lastProcessedWeek kontrolü sayesinde tek seferlik ve güvenli şekilde) puanlar
// gerçekten sıfırlanıp şampiyon ödülü veriliyor.
setInterval(() => {
  if (currentPlayerId) ensureWeeklyLeaderboardReset().catch((e) => console.error("Haftalık sıfırlama kontrolü hatası:", e));
}, 60000);

function renderLeaderboard() {
  leaderboardEl.innerHTML = allPlayers.map((p, i) => {
    const isMe = p.id === currentPlayerId;
    const rankClass = i === 0 ? "gold" : "";
    const isThrone = i === 0 && (p.points || 0) > 0;
    return `
      <div class="lb-row ${isMe ? "me" : ""}" data-id="${p.id}" ${isMe ? "" : 'style="cursor:pointer;"'}>
        <div class="lb-rank ${rankClass}">${i + 1}</div>
        <div class="lb-info">
          <div class="lb-name">${isThrone ? '<span class="throne-crown" title="1.lik Avı hedefi">👑</span> ' : ""}${p.name}${isMe ? " (sen)" : ""}</div>
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
        <div class="equip-slot-icon">${item ? itemIconSvg(s.key, item.rarity, 34) : s.icon}</div>
        <div class="equip-slot-label">${s.label}</div>
        <div class="equip-slot-item ${item ? "" : "empty"}">${item ? item.name : "Boş"}</div>
        ${item ? `<div class="equip-slot-count">⚔️${item.atk} 🛡️${item.def}${item.enchantPct ? ` · ✨+%${item.enchantPct}` : ""}${item.minorTrait ? ` · ${item.minorTrait.icon}%${item.minorTrait.pct}` : ""}</div>` : ""}
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
// RENDER: İSTATİSTİK SEKMESİ
// Kariyer boyu kazanma/kaybetme oranı, en çok yendiğin/yenildiğin kişi
// ve en uzun kazanma serin.
// ============================================================
function renderStatsTab() {
  if (!currentPlayerData || !statsOverviewEl) return;
  const s = currentPlayerData.stats || {
    totalWins: 0, totalLosses: 0, attackWins: 0, attackLosses: 0,
    defenseWins: 0, defenseLosses: 0, currentStreak: 0, longestStreak: 0,
    winsByOpponent: {}, lossesByOpponent: {}
  };
  const total = s.totalWins + s.totalLosses;
  const winRate = total > 0 ? Math.round((s.totalWins / total) * 100) : 0;

  statsOverviewEl.innerHTML = `
    <div class="stat-summary" style="margin-bottom:6px;">
      <span class="stat-chip pts">🏆 Kazanma: <b>${s.totalWins}</b></span>
      <span class="stat-chip atk">💀 Kaybetme: <b>${s.totalLosses}</b></span>
      <span class="stat-chip def">📈 Oran: <b>%${winRate}</b></span>
    </div>
    <div class="stats-mini-grid">
      <div class="stats-mini-cell"><span>⚔️ Saldırıda</span><b>${s.attackWins}G / ${s.attackLosses}M</b></div>
      <div class="stats-mini-cell"><span>🛡️ Savunmada</span><b>${s.defenseWins}G / ${s.defenseLosses}M</b></div>
    </div>`;

  const opponentEntries = Object.entries(s.winsByOpponent || {});
  const lossEntries = Object.entries(s.lossesByOpponent || {});
  const nameFor = (id) => (allPlayers.find(p => p.id === id)?.name) || "Silinmiş Oyuncu";

  const topBeaten = opponentEntries.sort((a, b) => b[1] - a[1])[0];
  const topBeatenBy = lossEntries.sort((a, b) => b[1] - a[1])[0];

  statsOpponentsEl.innerHTML = `
    <div class="stats-opp-row">
      <span class="stats-opp-icon">🎯</span>
      <div class="stats-opp-body">
        <div class="stats-opp-label">En Çok Yendiğin</div>
        <div class="stats-opp-value">${topBeaten ? `${nameFor(topBeaten[0])} <b>(${topBeaten[1]} kez)</b>` : "Henüz yok"}</div>
      </div>
    </div>
    <div class="stats-opp-row">
      <span class="stats-opp-icon">😵</span>
      <div class="stats-opp-body">
        <div class="stats-opp-label">En Çok Yenildiğin</div>
        <div class="stats-opp-value">${topBeatenBy ? `${nameFor(topBeatenBy[0])} <b>(${topBeatenBy[1]} kez)</b>` : "Henüz yok"}</div>
      </div>
    </div>`;

  statsStreakEl.innerHTML = `
    <div class="stat-summary">
      <span class="stat-chip pts">🔥 Şu Anki Seri: <b>${s.currentStreak}</b></span>
      <span class="stat-chip atk">👑 En Uzun Seri: <b>${s.longestStreak}</b></span>
    </div>`;
}

// ============================================================
// RENDER: ROZETLER
// Tamamen anlık hesaplanır (bkz. BADGES tanımı), ekstra bir doküman
// alanı gerektirmez.
// ============================================================
function renderBadges() {
  if (!currentPlayerData || !badgesGridEl) return;
  const unlocked = BADGES.filter(b => b.check(currentPlayerData));
  const unlockedIds = new Set(unlocked.map(b => b.id));

  if (badgesProgressEl) badgesProgressEl.textContent = `${unlocked.length} / ${BADGES.length} rozet kazanıldı`;

  badgesGridEl.innerHTML = BADGES.map(b => {
    const owned = unlockedIds.has(b.id);
    return `
      <div class="badge-chip ${owned ? "owned" : "locked"}">
        <span class="badge-icon">${owned ? b.icon : "🔒"}</span>
        <span class="badge-name">${b.name}</span>
        <span class="badge-desc">${b.desc}</span>
      </div>`;
  }).join("");
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
  const newWeeklyQuests = incrementQuestProgress(currentPlayerData.weeklyQuests, "energy_task", 1);
  const newMonthlyQuests = incrementQuestProgress(currentPlayerData.monthlyQuests, "energy_task", 1);

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
    energy: current - task.cost,
    lastEnergyUpdate: Date.now(),
    dust: (currentPlayerData.dust || 0) + dustGain,
    ...(newQuests !== currentPlayerData.dailyQuests ? { dailyQuests: newQuests } : {}),
    ...(newWeeklyQuests !== currentPlayerData.weeklyQuests ? { weeklyQuests: newWeeklyQuests } : {}),
    ...(newMonthlyQuests !== currentPlayerData.monthlyQuests ? { monthlyQuests: newMonthlyQuests } : {})
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

// ============================================================
// GÜNÜN YILDIZI / GÜNÜN SÜRTÜĞÜ
// allPlayers üzerinden, sadece BUGÜN (dailyStatsDay === bugün) savaşa
// girmiş oyuncular arasında en çok kazanan ve en çok kaybeden bulunur.
// ============================================================
function renderTopPerformers() {
  if (!topPerformersBanner) return;
  const today = dateStr();
  const activeToday = allPlayers.filter(p => p.dailyStatsDay === today && ((p.dailyWins || 0) + (p.dailyLosses || 0)) > 0);

  if (!activeToday.length) {
    tpBestName.textContent = "Henüz kimse savaşmadı";
    tpWorstName.textContent = "Henüz kimse savaşmadı";
    return;
  }

  const bestPlayer = activeToday.reduce((a, b) => (b.dailyWins || 0) > (a.dailyWins || 0) ? b : a, activeToday[0]);
  const worstPlayer = activeToday.reduce((a, b) => (b.dailyLosses || 0) > (a.dailyLosses || 0) ? b : a, activeToday[0]);

  tpBestName.textContent = (bestPlayer.dailyWins || 0) > 0 ? `${bestPlayer.name} (${bestPlayer.dailyWins} galibiyet)` : "Henüz kimse kazanmadı";
  tpWorstName.textContent = (worstPlayer.dailyLosses || 0) > 0 ? `${worstPlayer.name} (${worstPlayer.dailyLosses} mağlubiyet)` : "Henüz kimse kaybetmedi";
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
    dust: (currentPlayerData.dust || 0) + reward,
    ...(won ? { strangerWinsTotal: (currentPlayerData.strangerWinsTotal || 0) + 1 } : {})
  });

  showResultModal({ stranger: true, won, name: strangerName, reward });
  strangerDuelBtn.disabled = false;
};

// ============================================================
// ŞANSLI ÇARK — mantık
// Haftada bir kez bedava çevrilebilen, küçük toz/puan ödülleri veren çark.
// ============================================================
function canSpinWheelNow() {
  if (!currentPlayerData) return false;
  const last = currentPlayerData.lastWheelSpinTime || 0;
  return Date.now() - last >= WHEEL_COOLDOWN_MS;
}

function buildWheelGradient() {
  let acc = 0;
  const stops = WHEEL_SEGMENTS.map(seg => {
    const start = acc;
    acc += WHEEL_SEGMENT_ANGLE;
    return `${seg.color} ${start}deg ${acc}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function renderWheel() {
  if (!luckyWheel || !currentPlayerData) return;
  if (!luckyWheel.dataset.built) {
    luckyWheel.style.background = buildWheelGradient();
    const spokes = `<div class="wheel-spokes" style="background:${buildWheelSpokesGradient()}"></div>`;
    // Her segment için: çemberin merkezinden dışa doğru, dilimin tam ortasına
    // hizalanan kompakt bir rozet (val üstte büyük, lbl altta küçük). Rozet
    // sabit bir maksimum genişlikte tutulduğu için (bkz. styles.css) JACKPOT
    // dahil hiçbir etiket artık çemberden taşmıyor. Şeytan gözü göbek ve bıçak
    // ibre artık statik HTML'de (index.html), dönen kadranın İÇİNDE değil,
    // bu yüzden JS tarafında ayrıca eklenmelerine gerek yok.
    const labels = WHEEL_SEGMENTS.map((seg, i) => {
      const centerAngle = WHEEL_SEGMENT_ANGLE * i + WHEEL_SEGMENT_ANGLE / 2;
      const isJackpot = seg.id === "jackpot";
      return `
        <div class="wheel-seg-container" style="transform: rotate(${centerAngle - 90}deg);">
          <div class="wheel-text-badge ${isJackpot ? "jackpot-badge" : ""}">
            <span class="wheel-text-val">${seg.val}</span>
            <span class="wheel-text-lbl">${seg.lbl}</span>
          </div>
        </div>`;
    }).join("");
    luckyWheel.innerHTML = spokes + labels;
    luckyWheel.dataset.built = "1";
  }
  const able = canSpinWheelNow();
  spinWheelBtn.disabled = !able;
  if (able) {
    wheelStatus.textContent = "Çarkı çevirmeye hazır!";
  } else {
    const remain = WHEEL_COOLDOWN_MS - (Date.now() - (currentPlayerData.lastWheelSpinTime || 0));
    wheelStatus.textContent = `Sıradaki çevirme hakkına ${formatRemaining(remain)} kaldı.`;
  }
}

function pickWheelSegmentIndex() {
  const total = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    r -= WHEEL_SEGMENTS[i].weight;
    if (r <= 0) return i;
  }
  return WHEEL_SEGMENTS.length - 1;
}

// Karanlık Kader Çarkı'ndaki gibi yerçekimi + sürtünmeli, gerçekçi bir
// kor/kıvılcım patlaması. Sadece görsel bir katman, hiçbir oyun verisine
// dokunmuyor.
function explodeWheelEmbers(color, count) {
  if (!wheelScene) return;
  for (let i = 0; i < count; i++) {
    const ember = document.createElement("div");
    ember.className = "wheel-ember";
    ember.style.background = "#fff";
    ember.style.boxShadow = `0 0 12px 3px ${color}, 0 0 4px 2px #fff`;
    ember.style.left = "50%";
    ember.style.top = "50%";
    wheelScene.appendChild(ember);

    const angle = Math.random() * Math.PI * 2;
    const velocity = 7 + Math.random() * 13;
    let vx = Math.cos(angle) * velocity;
    let vy = Math.sin(angle) * velocity;
    let x = 0, y = 0, life = 1.0;
    const gravity = 0.35, friction = 0.94;

    function stepEmber() {
      if (life <= 0) { ember.remove(); return; }
      vx *= friction; vy *= friction; vy += gravity;
      x += vx; y += vy; life -= 0.02;
      ember.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${Math.max(life, 0)})`;
      ember.style.opacity = String(Math.max(life, 0));
      requestAnimationFrame(stepEmber);
    }
    requestAnimationFrame(stepEmber);
  }
}

async function spinTheWheel() {
  if (!currentPlayerData || !canSpinWheelNow()) return;
  spinWheelBtn.disabled = true;

  const idx = pickWheelSegmentIndex();
  const seg = WHEEL_SEGMENTS[idx];
  const segCenter = WHEEL_SEGMENT_ANGLE * idx + WHEEL_SEGMENT_ANGLE / 2;
  const currentRotation = parseFloat(luckyWheel.dataset.rotation || "0");
  const extraSpins = 4;
  const spinDurationMs = 3200;
  // Pointer 0 derecede (üstte) sabit, çark bu segmentin merkezi üste gelecek şekilde döner
  const targetRotation = currentRotation - (currentRotation % 360) + extraSpins * 360 + (360 - segCenter);

  luckyWheel.style.transition = `transform ${spinDurationMs / 1000}s cubic-bezier(.17,.67,.2,1)`;
  luckyWheel.style.transform = `rotate(${targetRotation}deg)`;
  luckyWheel.dataset.rotation = String(targetRotation);
  playSound("wheel");
  if (wheelScene) wheelScene.classList.add("is-spinning"); // şeytani ibre sekme efekti

  // Dönüş sırasında her segment sınırını geçtiğinde kısa bir "tık" sesi çal
  const endTime = Date.now() + spinDurationMs + 100;
  let lastSeg = Math.floor(getWheelRotationDeg(luckyWheel) / WHEEL_SEGMENT_ANGLE);
  function pollTick() {
    const deg = getWheelRotationDeg(luckyWheel);
    const segNow = Math.floor(deg / WHEEL_SEGMENT_ANGLE);
    if (segNow !== lastSeg) { sfxWheelTick(); lastSeg = segNow; }
    if (Date.now() < endTime) requestAnimationFrame(pollTick);
  }
  requestAnimationFrame(pollTick);

  wheelStatus.textContent = "Çark dönüyor...";
  await new Promise(r => setTimeout(r, spinDurationMs + 100));

  if (wheelScene) wheelScene.classList.remove("is-spinning");

  // --- EPİK SONUÇ EFEKTLERİ (Karanlık Kader Çarkı) ---
  // Kazanılan segmentin rengine göre: çark kasasının etrafında parlama,
  // panelde ekran sarsıntısı, şok dalgası patlaması ve kor parçacıkları.
  if (wheelScene) wheelScene.style.setProperty("--wheel-glow", seg.glow);
  if (wheelPanelEl) {
    wheelPanelEl.classList.add("wheel-is-shaking");
    setTimeout(() => wheelPanelEl.classList.remove("wheel-is-shaking"), 400);
  }
  if (wheelOuter) {
    wheelOuter.classList.remove("win-highlight");
    void wheelOuter.offsetWidth; // animasyonu yeniden başlatmak için reflow
    wheelOuter.classList.add("win-highlight");
  }
  if (wheelBgGlow) {
    wheelBgGlow.style.opacity = "0.6";
    wheelBgGlow.style.boxShadow = `0 0 90px 45px ${seg.glow}`;
  }
  if (wheelShockwaveEl) {
    wheelShockwaveEl.style.borderColor = seg.glow;
    wheelShockwaveEl.classList.remove("blast");
    void wheelShockwaveEl.offsetWidth; // reflow
    wheelShockwaveEl.classList.add("blast");
  }
  explodeWheelEmbers(seg.glow, seg.id === "jackpot" ? 46 : 22);

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
    lastWheelSpinTime: Date.now(),
    dust: (currentPlayerData.dust || 0) + seg.dust,
    points: (currentPlayerData.points || 0) + seg.points,
    ...(seg.type === "combo" ? { wheelJackpotsTotal: (currentPlayerData.wheelJackpotsTotal || 0) + 1 } : {})
  });

  wheelStatus.innerHTML = seg.type === "combo"
    ? `<span style="color:${seg.glow}; text-shadow:0 0 8px ${seg.glow};">🔥 JACKPOT! +${seg.points} puan ve +${seg.dust} toz kazandın!</span>`
    : `<span style="color:${seg.glow};">${seg.label} kazandın!</span>`;

  // Ödülün büyüklüğüne göre farklı sonuç sesi: jackpot'ta efsanevi fanfar
  if (seg.type === "combo") sfxOpenLegendary();
  else if (seg.dust >= 12 || seg.points >= 6) sfxOpenRare();
  else sfxOpenStandart();

  setTimeout(() => {
    if (wheelBgGlow) { wheelBgGlow.style.opacity = "0.15"; wheelBgGlow.style.boxShadow = "none"; }
  }, 3500);
}
if (spinWheelBtn) spinWheelBtn.onclick = spinTheWheel;

// ============================================================
// KELLE AVCISI — mantık
// Paylaşımlı tek bir ilan (gameMeta/bounty). Toz koyarak bir hedefe ödül
// konur, o hedefi saldırıda İLK yenen kişi ödülü kapar.
// ============================================================
function renderBountyForm() {
  if (!bountyTargetSelect || !currentPlayerId) return;
  const options = allPlayers.filter(p => p.id !== currentPlayerId);
  bountyTargetSelect.innerHTML = options.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
}

function renderBounty() {
  if (!bountyActive) return;
  if (currentBounty && currentBounty.active) {
    bountyActive.classList.remove("hidden");
    bountyForm.classList.add("hidden");
    bountyTargetName.textContent = currentBounty.targetName;
    bountyAmountEl.textContent = currentBounty.amount;
    bountyPlacer.textContent = currentBounty.placedByName;
  } else {
    bountyActive.classList.add("hidden");
    bountyForm.classList.remove("hidden");
  }
}

if (placeBountyBtn) {
  placeBountyBtn.onclick = async () => {
    if (!currentPlayerData) return;
    const targetId = bountyTargetSelect.value;
    const targetPlayer = allPlayers.find(p => p.id === targetId);
    const amount = parseInt(bountyAmountInput.value, 10);

    if (!targetPlayer) { bountyStatus.textContent = "Bir hedef seç."; return; }
    if (!amount || amount < 1) { bountyStatus.textContent = "Geçerli bir toz miktarı gir."; return; }
    if ((currentPlayerData.dust || 0) < amount) { bountyStatus.textContent = "Yeterli tozun yok."; return; }
    if (currentBounty && currentBounty.active) { bountyStatus.textContent = "Zaten aktif bir ödül ilanı var."; return; }

    placeBountyBtn.disabled = true;
    try {
      // ÖNCEDEN: kontrol (aktif ilan var mı) ile yazma (toz düşürme + ilan oluşturma) ayrı
      // ayrı, birbirinden bağımsız iki adımdı. İki oyuncu TAM aynı anda ilan etmeye
      // çalışırsa, ikisi de "aktif ilan yok" görüp devam edebiliyordu; ikinci yazan
      // birincinin ilanının üzerine yazıyordu — birinci oyuncunun tozu düşüyor ama ilanı
      // sessizce kayboluyor, ödülü de kendi hedefi değil ikinci oyuncunun hedefi kapıyordu.
      // Artık kontrol + yazma tek bir transaction içinde atomik yapılıyor.
      await runTransaction(db, async (tx) => {
        const bountyRef = doc(db, META_COL, BOUNTY_DOC_ID);
        const playerRef = doc(db, PLAYERS_COL, currentPlayerId);
        const bountySnap = await tx.get(bountyRef);
        const playerSnap = await tx.get(playerRef);
        if (!playerSnap.exists()) throw new Error("Oyuncu bulunamadı.");
        const freshBounty = bountySnap.exists() ? bountySnap.data() : null;
        const freshPlayer = playerSnap.data();
        if (freshBounty && freshBounty.active) throw new Error("Zaten aktif bir ödül ilanı var.");
        if ((freshPlayer.dust || 0) < amount) throw new Error("Yeterli tozun yok.");

        tx.update(playerRef, { dust: (freshPlayer.dust || 0) - amount });
        tx.set(bountyRef, {
          active: true,
          targetId,
          targetName: targetPlayer.name,
          amount,
          placedById: currentPlayerId,
          placedByName: currentPlayerData.name,
          createdAt: Date.now()
        });
      });
      bountyStatus.textContent = "Ödül ilan edildi!";
      bountyAmountInput.value = "";
    } catch (e) {
      bountyStatus.textContent = (e.message === "Zaten aktif bir ödül ilanı var." || e.message === "Yeterli tozun yok.")
        ? e.message
        : ("Bir hata oldu: " + e.message);
    } finally {
      placeBountyBtn.disabled = false;
    }
  };
}

// ============================================================
// KAHİN BAHSİ
// Gün başında, günün sonunda liderlik tablosunun 1.'sinin kim olacağını
// tahmin edip toz yatırıyorsun. Doğru bilirsen yatırdığın toz 2 katına
// çıkıyor, yanlışsa yatırdığın toz gidiyor. Günde sadece 1 tahmin hakkı var.
// Sonuç, ertesi gün oyuna giriş yapınca (o anki liderlik tablosuyla
// kıyaslanarak) otomatik açıklanır.
// ============================================================
let oracleResolving = false;

const ORACLE_MAX_BET = 10;

function renderOracleForm() {
  if (!oracleTargetSelect || !currentPlayerId) return;
  // Kimse kendine bahis oynayamasın diye seçim listesinden kendi ismi çıkarılıyor.
  const options = allPlayers.filter(p => p.id !== currentPlayerId);
  oracleTargetSelect.innerHTML = options.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  if (oracleAmountInput) oracleAmountInput.max = String(ORACLE_MAX_BET);
}

function renderOraclePanel() {
  if (!oraclePending || !currentPlayerData) return;
  const bet = currentPlayerData.oracleBet;
  const hasBetToday = bet && bet.day === dateStr();
  oraclePending.classList.toggle("hidden", !hasBetToday);
  oracleForm.classList.toggle("hidden", !!hasBetToday);
  if (hasBetToday) {
    oracleTargetLabel.textContent = bet.targetName;
    oracleAmountLabel.textContent = bet.amount;
  }
}

if (placeOracleBtn) {
  placeOracleBtn.onclick = async () => {
    if (!currentPlayerData) return;
    const today = dateStr();
    if (currentPlayerData.oracleBet && currentPlayerData.oracleBet.day === today) {
      oracleStatus.textContent = "Bugün için zaten bir tahminin var."; return;
    }
    const targetId = oracleTargetSelect.value;
    const targetPlayer = allPlayers.find(p => p.id === targetId);
    const amount = parseInt(oracleAmountInput.value, 10);

    if (!targetPlayer) { oracleStatus.textContent = "Bir oyuncu seç."; return; }
    if (targetId === currentPlayerId) { oracleStatus.textContent = "Kendine bahis oynayamazsın."; return; }
    if (!amount || amount < 1) { oracleStatus.textContent = "Geçerli bir toz miktarı gir."; return; }
    if (amount > ORACLE_MAX_BET) { oracleStatus.textContent = `En fazla ${ORACLE_MAX_BET} toz yatırabilirsin.`; return; }
    if ((currentPlayerData.dust || 0) < amount) { oracleStatus.textContent = "Yeterli tozun yok."; return; }

    placeOracleBtn.disabled = true;
    try {
      await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
        dust: (currentPlayerData.dust || 0) - amount,
        oracleBet: { day: today, targetId, targetName: targetPlayer.name, amount }
      });
      oracleStatus.textContent = "Tahminin kaydedildi, yarın sonucunu öğreneceksin!";
      oracleAmountInput.value = "";
    } catch (e) {
      oracleStatus.textContent = "Bir hata oldu: " + e.message;
    } finally {
      placeOracleBtn.disabled = false;
    }
  };
}

// Önceki günden kalan bir tahmin varsa, o anki liderlik tablosuyla kıyaslayıp
// sonucu açıklar ve tahmini temizler. Hem kendi oyuncu dokümanı hem de tüm
// oyuncular listesi yüklendiğinde (iki ayrı onSnapshot) tetiklenmesi güvenlidir.
async function ensureOracleBetResolved() {
  if (!currentPlayerData || !allPlayers.length || oracleResolving) return;
  const bet = currentPlayerData.oracleBet;
  if (!bet || bet.day === dateStr()) return;

  oracleResolving = true;
  try {
    const topId = allPlayers[0]?.id;
    const won = bet.targetId === topId;

    // ÖNCEDEN: bu fonksiyon yerel (bayat olabilecek) currentPlayerData üzerinden düz bir
    // updateDoc yapıyordu. Saldırı/kutu açma/enerji görevi gibi başka bir işlem tam bu
    // sırada (aynı anda) Firestore'a yazarsa, buradaki updateDoc o işlemin AZ ÖNCE eklediği
    // görev ilerlemesini fark etmeden üzerine yazıp SİLİYORDU — "Kahin Bahsi'ni doğru
    // bildim ama görev sayacında saymadı" şikayetinin sebebi büyük ihtimalle buydu.
    // Artık en güncel veriyi transaction içinde okuyup üzerine yazıyoruz.
    let resolvedResult = null;
    await runTransaction(db, async (tx) => {
      const ref = doc(db, PLAYERS_COL, currentPlayerId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const freshBet = data.oracleBet;
      // Bu bahis başka bir sekme/çağrı tarafından zaten çözülmüş ya da değişmiş olabilir.
      if (!freshBet || freshBet.day !== bet.day || freshBet.targetId !== bet.targetId || freshBet.amount !== bet.amount) return;

      const oracleBoostPct = won ? getMinorTraitBonusPct(data.equipment, "oracle_boost") : 0;
      const reward = won ? Math.round((freshBet.amount || 0) * 2 * (1 + oracleBoostPct / 100)) : 0;
      const oracleWeeklyQuests = won ? incrementQuestProgress(data.weeklyQuests, "oracle_win", 1) : data.weeklyQuests;
      const oracleMonthlyQuests = won ? incrementQuestProgress(data.monthlyQuests, "oracle_win", 1) : data.monthlyQuests;

      tx.update(ref, {
        dust: (data.dust || 0) + reward,
        oracleBet: null,
        ...(won ? { oracleWinsTotal: (data.oracleWinsTotal || 0) + 1 } : {}),
        ...(oracleWeeklyQuests !== data.weeklyQuests ? { weeklyQuests: oracleWeeklyQuests } : {}),
        ...(oracleMonthlyQuests !== data.monthlyQuests ? { monthlyQuests: oracleMonthlyQuests } : {})
      });

      resolvedResult = { won, targetName: freshBet.targetName, amount: freshBet.amount, reward };
    });

    if (resolvedResult) {
      showResultModal({ oracle: true, ...resolvedResult });
    }
  } finally {
    oracleResolving = false;
  }
}

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

// buildItemGrantPayload'ın currentPlayerData'ya bağımlı olmayan genel hali:
// haftalık liderlik şampiyonu gibi, o an giriş yapmış oyuncu OLMAYABİLECEK
// başka bir oyuncuya eşya vermek için kullanılır (getSlotInventory yerine
// doğrudan verilen "data" parametresinden envanteri okur).
function getSlotInventoryGeneric(data, slot) {
  const inv = (data?.inventory && data.inventory[slot]) || [];
  const equipped = data?.equipment && data.equipment[slot];
  if (equipped && !inv.some(it => it.id && equipped.id && it.id === equipped.id)) {
    const legacyId = equipped.id || `legacy-${slot}`;
    return [{ ...equipped, id: legacyId }, ...inv];
  }
  return inv;
}
function buildItemGrantPayloadGeneric(data, rarity) {
  const recentSlots = data.recentSlots || [];
  const slot = pickSlotWeighted(recentSlots);
  const item = generateLootItemForRarity(slot, rarity);
  const wasEmpty = !(data.equipment && data.equipment[slot]);
  const newInvArr = [...getSlotInventoryGeneric(data, slot), item];
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

function questCardHtml(q) {
  const pct = Math.min(100, Math.round(((q.progress || 0) / q.target) * 100));
  const readyToClaim = q.completed && !q.claimed;
  return `
      <div class="quest-card tier-${q.tier} ${q.claimed ? "claimed" : ""} ${readyToClaim ? "ready" : ""}">
        <div class="quest-top">
          <span class="quest-icon">${q.icon}</span>
          <span class="quest-label">${q.label}</span>
          <span class="quest-tier-badge tier-${q.tier}">${QUEST_TIER_LABELS[q.tier] || q.tier}</span>
        </div>
        <div class="quest-progress-track"><div class="quest-progress-fill" style="width:${pct}%"></div></div>
        <div class="quest-bottom">
          <span class="quest-progress-text">${q.progress || 0}/${q.target}</span>
          <span class="quest-reward">✨${q.rewardDust} · ⭐${q.rewardPoints}${q.rewardItem ? " · 🔷 Nadir Eşya" : ""}${q.rewardLegendary ? " · 🌟 Efsanevi Eşya" : ""}</span>
          ${q.claimed
            ? `<span class="quest-claimed-tag">✅ Alındı</span>`
            : `<button class="btn-mini nadir-mini quest-claim-btn" data-id="${q.id}" ${readyToClaim ? "" : "disabled"}>Ödülü Al</button>`}
        </div>
      </div>`;
}

function renderQuestList(container, quests, period, emptyMsg) {
  if (!container) return;
  if (!quests.length) {
    container.innerHTML = `<p class="box-status">${emptyMsg}</p>`;
    return;
  }
  container.innerHTML = quests.map(questCardHtml).join("");
  container.querySelectorAll(".quest-claim-btn").forEach(btn => {
    btn.onclick = () => claimQuest(period, btn.getAttribute("data-id"));
  });
}

function renderQuests() {
  if (!currentPlayerData) return;
  renderQuestList(questsListEl, currentPlayerData.dailyQuests || [], "dailyQuests", "Bugünkü görevler yükleniyor...");
  renderQuestList(weeklyQuestsListEl, currentPlayerData.weeklyQuests || [], "weeklyQuests", "Haftalık görevler yükleniyor...");
  renderQuestList(monthlyQuestsListEl, currentPlayerData.monthlyQuests || [], "monthlyQuests", "Aylık görevler yükleniyor...");
}

async function claimQuest(period, questId) {
  if (!currentPlayerData) return;
  const quests = currentPlayerData[period] || [];
  const quest = quests.find(q => q.id === questId);
  if (!quest || !quest.completed || quest.claimed) return;

  document.querySelectorAll(".quest-claim-btn").forEach(b => b.disabled = true);

  let payload = {
    dust: (currentPlayerData.dust || 0) + (quest.rewardDust || 0),
    points: (currentPlayerData.points || 0) + (quest.rewardPoints || 0)
  };

  let grantedItem = null;
  if (quest.rewardLegendary) {
    const itemGrant = buildItemGrantPayload(currentPlayerData, "efsanevi");
    grantedItem = itemGrant._grantedItem;
    delete itemGrant._grantedItem;
    payload = { ...payload, ...itemGrant };
  } else if (quest.rewardItem) {
    const itemGrant = buildItemGrantPayload(currentPlayerData, "nadir");
    grantedItem = itemGrant._grantedItem;
    delete itemGrant._grantedItem;
    payload = { ...payload, ...itemGrant };
  }

  const newQuests = quests.map(q => q.id === questId ? { ...q, claimed: true } : q);
  payload[period] = newQuests;

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), payload);

  if (grantedItem) {
    itemPopupInner.className = `item-popup-inner rarity-${grantedItem.rarity}`;
    itemPopupInner.innerHTML = `
      <div class="streak-bonus-tag">🎯 Görev Ödülü!</div>
      <div class="item-popup-icon">${itemIconSvg(grantedItem.slot, grantedItem.rarity, 52)}</div>
      <div class="item-popup-name rarity-${grantedItem.rarity}">${grantedItem.name}</div>
      <div class="item-popup-stats">⚔️ +${grantedItem.atk} &nbsp; 🛡️ +${grantedItem.def} &nbsp; · ${grantedItem.rarity.toUpperCase()} (${RARITY_CHANCE_LABELS[grantedItem.rarity]} şans)</div>
      ${grantedItem.enchantPct ? `<div class="item-popup-passive" style="color:var(--accent-2)">✨ Efsun: +%${grantedItem.enchantPct} ${SLOT_MAP[grantedItem.slot].type === "atk" ? "Saldırı" : "Savunma"}</div>` : ""}
      ${grantedItem.effectDesc ? `<div class="item-popup-passive">✨ ${grantedItem.effectDesc}</div>` : ""}
      ${grantedItem.minorTrait ? `<div class="item-popup-passive minor-passive">${grantedItem.minorTrait.icon} ${grantedItem.minorTrait.name}: ${grantedItem.minorTrait.desc}</div>` : ""}
    `;
    itemPopup.classList.remove("hidden");
    setTimeout(() => itemPopup.classList.add("hidden"), 5000);
  }
}

// Metin2 tarzı çanta: kuşanılı OLMAYAN tüm eşyalar (slot türü fark etmeksizin)
// tek bir grid içinde, her biri kendi kare "slot"unda gösterilir. Kutudan
// çıkan / görevden kazanılan her yeni eşya otomatik olarak bu çantada belirir
// (slot boşsa zaten doğrudan kuşanılıp paper doll'da görünür, dolu ise buraya
// düşer). Bir çanta eşyasına dokunmak, o eşyanın türüne ait envanter modalını
// açar (kuşan / toza çevir seçenekleriyle) — mevcut openInventoryModal ile aynı.
function renderBagGrid() {
  if (!bagGridEl || !currentPlayerData) return;
  const items = [];
  for (const s of SLOTS) {
    const equippedId = currentPlayerData.equipment?.[s.key]?.id;
    const slotItems = getSlotInventory(s.key).filter(it => it.id !== equippedId);
    items.push(...slotItems);
  }
  const rarityOrder = { efsanevi: 0, nadir: 1, standart: 2 };
  items.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);

  // Boş kareler de gösterilir ki gerçek bir "çanta" gibi görünsün (Metin2'deki gibi).
  const minSlots = Math.max(24, Math.ceil(Math.max(items.length, 1) / 6) * 6);

  let html = items.map(it => `
    <button type="button" class="bag-slot rarity-${it.rarity}" data-slot="${it.slot}" title="${it.name}">
      <span class="bag-slot-icon">${itemIconSvg(it.slot, it.rarity, 30)}</span>
    </button>`).join("");
  for (let i = items.length; i < minSlots; i++) {
    html += `<div class="bag-slot empty"></div>`;
  }
  bagGridEl.innerHTML = html;

  bagGridEl.querySelectorAll("button[data-slot]").forEach(btn => {
    btn.onclick = () => openInventoryModal(btn.getAttribute("data-slot"));
  });

  const bagSlotCountLabel = document.getElementById("bagSlotCountLabel");
  if (bagSlotCountLabel) bagSlotCountLabel.textContent = `(${minSlots} Slot)`;
}

// ============================================================
// KARAKTER SAHNESİ (Profil sekmesi üstü)
// Ekipmanları düz bir liste yerine, panterin üstünde anatomik olarak
// doğru yerlerde gösterir: kask başta, zırh gövdede, kılıç ve eldiven
// ellerde, ayakkabı ayakta. Salt görsel bir özet; tıklanınca ilgili
// slotun envanterini açar (equipmentGrid ile aynı davranış).
// ============================================================
function renderCharacterStage() {
  if (!charStageSlotsEl) return;
  const eq = currentPlayerData?.equipment || emptyEquipment();
  charStageSlotsEl.innerHTML = SLOTS.map(s => {
    const item = eq[s.key];
    const rarityClass = item ? `rarity-${item.rarity}` : "";
    return `
      <button type="button" class="char-slot slot-pos-${s.key} ${item ? "filled" : "empty"} ${rarityClass}" data-slot="${s.key}" title="${s.label}${item ? ": " + item.name : " (boş)"}">
        <span class="char-slot-icon">${item ? itemIconSvg(s.key, item.rarity, 30) : s.icon}</span>
      </button>`;
  }).join("");

  charStageSlotsEl.querySelectorAll("button[data-slot]").forEach(btn => {
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
    boxStatus.textContent = "Sandık açmaya hazır!";
  } else {
    const remain = getEffectiveBoxCooldown() - (Date.now() - (currentPlayerData.lastBoxOpenTime || 0));
    boxStatus.textContent = `Sıradaki sandığa ${formatRemaining(remain)} kaldı.`;
  }

  const dust = currentPlayerData?.dust ?? 0;
  guaranteeRareBtn.disabled = dust < DUST_COST_RARE_BOX;
  guaranteeLegendaryBtn.disabled = dust < DUST_COST_LEGENDARY_BOX;
}

// ============================================================
// AFİLLİ SANDIK AÇILIŞ MOTORU
// Kullanıcının sağladığı bağımsız prototipten uyarlandı: nadirliğe göre
// renk paleti (--chest-*) uygulanıyor, sırasıyla ŞARJ (titreme) ->
// PATLAMA (mühür/kristal parçalanır + kıvılcım + ekran flaşı + şok
// dalgası) -> AÇILDI (kapak açılır, tanrısal ışıklar) durumları oynatılıyor.
// Ardından mevcut item popup sistemi devreye giriyor (dokunulmadı).
// ============================================================
const CHEST_RARITY_STYLES = {
  standart: { body1: "#2d241c", body2: "#1a130e", trim1: "#7a7a7a", trim2: "#333333", glow: "#e2e8f0" },
  nadir: { body1: "#161f36", body2: "#0b1122", trim1: "#b0e0e6", trim2: "#2a5b8f", glow: "#4d9bff" },
  efsanevi: { body1: "#360b1b", body2: "#1c040d", trim1: "#ffcc4d", trim2: "#c98a12", glow: "#ffae00" }
};

function setChestRarity(rarity) {
  const r = CHEST_RARITY_STYLES[rarity] || CHEST_RARITY_STYLES.standart;
  boxWrapper.style.setProperty("--chest-body-1", r.body1);
  boxWrapper.style.setProperty("--chest-body-2", r.body2);
  boxWrapper.style.setProperty("--chest-trim-1", r.trim1);
  boxWrapper.style.setProperty("--chest-trim-2", r.trim2);
  boxWrapper.style.setProperty("--chest-glow", r.glow);
  boxWrapper.style.setProperty("--chest-glow-dim", r.glow);
}

function explodeChestSparks(color) {
  const particleCount = 50;
  for (let i = 0; i < particleCount; i++) {
    const spark = document.createElement("div");
    spark.className = "chest-spark";
    spark.style.backgroundColor = color;
    spark.style.boxShadow = `0 0 12px 3px ${color}`;
    spark.style.left = "50%";
    spark.style.top = "50%";
    boxWrapper.appendChild(spark);

    const angle = Math.random() * Math.PI * 2;
    const velocity = 90 + Math.random() * 180;
    const tx = Math.cos(angle) * velocity;
    const ty = Math.sin(angle) * velocity - 60;

    spark.animate([
      { transform: "translate(-50%, -50%) scale(1.5)", opacity: 1 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`, opacity: 0 }
    ], {
      duration: 900 + Math.random() * 900,
      easing: "cubic-bezier(0.15, 0.85, 0.35, 1)",
      fill: "forwards"
    });
    setTimeout(() => spark.remove(), 2000);
  }
}

// Şarj -> Patlama -> Açıldı durum makinesini oynatır, sonunda sandık
// "açık" halde kalır (Firestore güncellemesi ve item popup'ı bu await'in
// hemen ardından devreye girer, resetChestVisual() ile sandık idle'a döner).
async function playChestOpenAnimation(rarity) {
  const chestPanel = boxWrapper.closest(".panel");
  setChestRarity(rarity);
  epicChestEl.classList.remove("is-opened", "is-bursting");
  boxWrapper.classList.remove("scene-opened");

  epicChestEl.classList.add("is-charging");
  if (chestPanel) chestPanel.classList.add("is-shaking");
  sfxShake();

  await new Promise(r => setTimeout(r, 1200));

  epicChestEl.classList.remove("is-charging");
  if (chestPanel) chestPanel.classList.remove("is-shaking");
  epicChestEl.classList.add("is-bursting");
  chestShockwaveEl.classList.add("shockwave-active");
  chestFlashEl.classList.add("is-flashing");
  explodeChestSparks((CHEST_RARITY_STYLES[rarity] || CHEST_RARITY_STYLES.standart).glow);

  await new Promise(r => setTimeout(r, 200));

  epicChestEl.classList.remove("is-bursting");
  epicChestEl.classList.add("is-opened");
  boxWrapper.classList.add("scene-opened");

  if (rarity === "efsanevi") sfxOpenLegendary();
  else if (rarity === "nadir") sfxOpenRare();
  else sfxOpenStandart();

  const holdMs = rarity === "efsanevi" ? 1200 : rarity === "nadir" ? 500 : 100;
  await new Promise(r => setTimeout(r, holdMs));
}

// Sandığı bir sonraki açılış için idle haline sıfırlar.
function resetChestVisual() {
  chestShockwaveEl.classList.remove("shockwave-active");
  chestFlashEl.classList.remove("is-flashing");
  setTimeout(() => {
    epicChestEl.classList.remove("is-opened");
    boxWrapper.classList.remove("scene-opened");
  }, 500);
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

  await playChestOpenAnimation(item.rarity);

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
  const newWeeklyQuests = incrementQuestProgress(data.weeklyQuests, "open_box", 1);
  const newMonthlyQuests = incrementQuestProgress(data.monthlyQuests, "open_box", 1);

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
    totalBoxesOpened: (data.totalBoxesOpened || 0) + 1,
    ...(newQuests !== data.dailyQuests ? { dailyQuests: newQuests } : {}),
    ...(newWeeklyQuests !== data.weeklyQuests ? { weeklyQuests: newWeeklyQuests } : {}),
    ...(newMonthlyQuests !== data.monthlyQuests ? { monthlyQuests: newMonthlyQuests } : {})
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
    <div class="item-popup-icon">${itemIconSvg(item.slot, item.rarity, 52)}</div>
    <div class="item-popup-name rarity-${item.rarity}">${item.name}</div>
    <div class="item-popup-stats">⚔️ +${item.atk} &nbsp; 🛡️ +${item.def} &nbsp; · ${item.rarity.toUpperCase()} (${RARITY_CHANCE_LABELS[item.rarity]} şans)</div>
    ${item.enchantPct ? `<div class="item-popup-passive" style="color:var(--accent-2)">✨ Efsun: +%${item.enchantPct} ${SLOT_MAP[item.slot].type === "atk" ? "Saldırı" : "Savunma"}</div>` : ""}
    ${item.effectDesc ? `<div class="item-popup-passive">✨ ${item.effectDesc}</div>` : ""}
    ${item.minorTrait ? `<div class="item-popup-passive minor-passive">${item.minorTrait.icon} ${item.minorTrait.name}: ${item.minorTrait.desc}</div>` : ""}
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

  resetChestVisual();
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
  const cooldowns = currentPlayerData.targetCooldowns || {};
  const anyLocked = Object.values(cooldowns).some(v => v > 0);

  if (!able) {
    const windowIdx = getAttackWindowIndex();
    const windowEnd = (windowIdx + 1) * ATTACK_COOLDOWN_MS;
    const remainMs = windowEnd - Date.now();
    attackStatus.textContent = `Bu saatlik saldırı hakkını kullandın. Sıradaki saldırı penceresi ${formatRemaining(remainMs)} sonra açılıyor.`;
  } else if (anyLocked) {
    attackStatus.textContent = `Bazı hedefler art arda ${MAX_CONSECUTIVE_ATTACKS_ON_TARGET} saldırı yüzünden kilitli. Kilidi açmak için önce farklı hedeflere saldırmalısın.`;
  } else {
    attackStatus.textContent = "Saldırı hakkın hazır, birini seç! (Kullanmazsan bu pencere kapanır, bir daha kullanamazsın.)";
  }

  const targets = allPlayers.filter(p => p.id !== currentPlayerId);
  const throneId = allPlayers.length && (allPlayers[0].points || 0) > 0 ? allPlayers[0].id : null;
  const bountyTargetId = currentBounty && currentBounty.active ? currentBounty.targetId : null;

  attackTargetsEl.innerHTML = targets.map(p => {
    const cooldownLeft = cooldowns[p.id] || 0;
    const isLocked = cooldownLeft > 0;
    const canHitThis = able && !isLocked;
    const isCurrentStreakTarget = !isLocked && p.id === currentPlayerData.lastAttackedId && (currentPlayerData.attackStreakOnTarget || 0) > 0;
    const badge = isLocked
      ? `<span class="target-streak-badge locked">🔒 ${cooldownLeft} savaş</span>`
      : isCurrentStreakTarget
        ? `<span class="target-streak-badge">${currentPlayerData.attackStreakOnTarget}/${MAX_CONSECUTIVE_ATTACKS_ON_TARGET}</span>`
        : "";
    const throneBadge = p.id === throneId ? `<span class="throne-crown" title="Yenersen +${THRONE_BONUS_POINTS} bonus puan">👑</span>` : "";
    const bountyBadge = p.id === bountyTargetId ? `<span class="target-streak-badge bounty-badge">💀 ${currentBounty.amount} toz</span>` : "";
    return `
    <div class="attack-target-row ${isLocked ? "locked" : ""}">
      <div class="name">${throneBadge}${p.name} ${badge}${bountyBadge}</div>
      <div class="stats">⚔️${p.attack ?? BASE_ATTACK} 🛡️${p.defense ?? BASE_DEFENSE} · ${p.points ?? 0}⭐</div>
      <button data-id="${p.id}" ${canHitThis ? "" : "disabled"} style="${canHitThis ? "" : "opacity:.35;cursor:not-allowed;"}">${isLocked ? "Kilitli" : "Saldır"}</button>
    </div>`;
  }).join("");

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

  // 1.lik Avı: saldırı anında liderlik tablosunun (istemci tarafında bilinen)
  // zirvesindeki oyuncu bu hedef mi, önceden belirlenir.
  const isThroneTarget = allPlayers.length > 0 && allPlayers[0].id === defenderId && (allPlayers[0].points || 0) > 0;

  try {
    await runTransaction(db, async (tx) => {
      const attackerRef = doc(db, PLAYERS_COL, currentPlayerId);
      const defenderRef = doc(db, PLAYERS_COL, defenderId);
      const bountyRef = doc(db, META_COL, BOUNTY_DOC_ID);
      const attackerSnap = await tx.get(attackerRef);
      const defenderSnap = await tx.get(defenderRef);
      const bountySnap = await tx.get(bountyRef);
      if (!attackerSnap.exists() || !defenderSnap.exists()) throw new Error("Oyuncu bulunamadı.");

      const attacker = attackerSnap.data();
      const defender = defenderSnap.data();
      const bounty = bountySnap.exists() ? bountySnap.data() : null;

      const currentWindow = getAttackWindowIndex();
      if ((attacker.lastAttackWindow ?? -1) === currentWindow) {
        throw new Error("Bu saatlik saldırı penceresini zaten kullandın.");
      }

      // Aynı hedefe art arda saldırı sınırı: bir oyuncuyu üst üste 3 kereden
      // fazla hedef alamazsın. 3'e ulaşınca o hedef kilitlenir; kilidin açılması
      // için önce başka hedeflere en az TARGET_LOCK_COOLDOWN_ATTACKS kez daha
      // saldırman (savaşa girmen) gerekir.
      const targetCooldowns = attacker.targetCooldowns || {};
      const remainingLock = targetCooldowns[defenderId] || 0;
      if (remainingLock > 0) {
        throw new Error(`Bu kişiye tekrar saldırabilmek için önce en az ${remainingLock} savaş daha yapmalısın.`);
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
        const skippedWeeklyQuests = incrementQuestProgress(attacker.weeklyQuests, "attack_count", 1);
        const skippedMonthlyQuests = incrementQuestProgress(attacker.monthlyQuests, "attack_count", 1);
        tx.update(attackerRef, {
          lastAttackTime: Date.now(),
          lastAttackWindow: currentWindow,
          ...(skippedQuests !== attacker.dailyQuests ? { dailyQuests: skippedQuests } : {}),
          ...(skippedWeeklyQuests !== attacker.weeklyQuests ? { weeklyQuests: skippedWeeklyQuests } : {}),
          ...(skippedMonthlyQuests !== attacker.monthlyQuests ? { monthlyQuests: skippedMonthlyQuests } : {})
        });
        logDetails.push(`${attacker.name}, ${chillItem.name}'in keyfine daldı ve saldıramadan bu seferki hakkını harcadı.`);
        tx.set(doc(collection(db, LOG_COL)), {
          attacker: attacker.name, defender: defender.name,
          message: logDetails.join(" "),
          effects: [],
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
      //
      // v1.14 DÜZELTMESİ: Önceden SADECE rol statı (saldıranın saldırısı,
      // savunanın savunması) hesaba katılıyordu. Bu yüzden örneğin savunması
      // 20 ama saldırısı sadece 3 olan, yani toplamda ÇOK güçlü ekipmanlı biri
      // saldırıya geçtiğinde, savunması sadece 5 olan çok daha zayıf ekipmanlı
      // birine karşı bile otomatik eziliyordu (3, 5*1.5=7.5'in altında kaldığı
      // için). Bu adil değildi: kişinin toplam ekipman yatırımı görmezden
      // geliniyordu. Artık her tarafın "rol dışı" statı da küçük bir ağırlıkla
      // (OFFROLE_STAT_WEIGHT) hesaba katılıyor, böylece güçlü/dengeli ekipmanlı
      // biri yanlış rolde bile tamamen çaresiz kalmıyor.
      const OFFROLE_STAT_WEIGHT = 0.25;
      let baseAttack = attacker.attack + (attacker.defense || BASE_DEFENSE) * OFFROLE_STAT_WEIGHT;
      let baseDefense = defender.defense + (defender.attack || BASE_ATTACK) * OFFROLE_STAT_WEIGHT;

      // Lanet: defender bir önceki saldırıdan lanetliyse savunması düşer
      if (defender.curseNextAttack && defender.curseNextAttack.active) {
        baseDefense *= (1 - defender.curseNextAttack.reduction);
        const curseItemName = defender.curseNextAttack.itemName || "Lanet";
        legendaryLog.push(`${defender.name} üzerindeki ${curseItemName} laneti devreye girdi, savunması zayıfladı.`);
      }

      // Kambur zırhı / Kaymağın kalkanı: savunma çarpanı
      const defMultItem = getEffect(defender.equipment, "defense_multiplier");
      if (defMultItem) {
        baseDefense *= 1.15;
        legendaryLog.push(`${defender.name}'in ${defMultItem.name} savunmasını güçlendirdi.`);
      }
      // Kıl dönmesi kılıcı / Emrenin yamuk parmak eldiveni / Gıcık komşunun kolyesi: saldırı çarpanı
      const atkMultItem = getEffect(attacker.equipment, "attack_multiplier");
      if (atkMultItem) {
        baseAttack *= 1.15;
        legendaryLog.push(`${attacker.name}'in ${atkMultItem.name} saldırısını güçlendirdi.`);
      }

      // Standart/Nadir eşyalardaki ufak "Keskin/Sağlam" pasifleri: efsanevi
      // çarpanların (~%15) çok altında kalan küçük çeşni bonusları (%2-7 arası,
      // eşya başına). Savaş logunu kalabalıklaştırmamak için sessizce uygulanır.
      const minorAtkPct = getMinorTraitBonusPct(attacker.equipment, "atk_boost");
      if (minorAtkPct > 0) baseAttack *= (1 + minorAtkPct / 100);
      const minorDefPct = getMinorTraitBonusPct(defender.equipment, "def_boost");
      if (minorDefPct > 0) baseDefense *= (1 + minorDefPct / 100);

      // Günün olayı: küresel saldırı/savunma/şans çarpanları
      baseAttack *= dailyEvent.attackMult;
      baseDefense *= dailyEvent.defenseMult;

      const critItem = getEffect(attacker.equipment, "crit_instant_win");
      const critTriggered = !!(critItem && Math.random() < 0.1);

      let attackPower, defensePower, attackerWins;

      if (critTriggered) {
        attackPower = baseAttack; defensePower = baseDefense;
        attackerWins = true;
        legendaryLog.push(`${attacker.name}'in ${critItem.name} aniden ısırdı, hesaplama boşa gitti ve anında kazandı!`);
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

        // Portakal suyu kılıcı / Sarhoş amcanın küpesi: rakip gücünün %30'undan fazla farkla kazanırsa ekstra 2 çalar
        const stealItem = getEffect(attacker.equipment, "steal_extra_on_big_win");
        if (!critTriggered && stealItem && diff > defensePower * 0.3) {
          winPts += 2; losePts += 2;
          legendaryLog.push(`${attacker.name}'in ${stealItem.name} ezici farktan ekstra 2 puan çaldı.`);
        }
        // Nargile kılıcı / Gay eldiveni / Keyifli akşamın kolyesi: kazanırsa +3 ekstra
        if (chillItem) {
          winPts += 3;
          legendaryLog.push(`${attacker.name}'in ${chillItem.name} keyifli bir zafer bonusu verdi (+3).`);
        }
        // Yasin ercile zırhı / Götün zırhı / Devrik minderin kalkanı: defender kaybetse de puan kaybetmez
        const noLossItem = getEffect(defender.equipment, "no_loss_on_defense_lose");
        const reducedLossItem = getEffect(defender.equipment, "reduced_loss");
        if (noLossItem) {
          losePts = 0;
          legendaryLog.push(`${defender.name}'in ${noLossItem.name} sayesinde hiç puan kaybetmedi.`);
        }
        // Yırtık menüsküs: kaybederse sadece 2 kaybeder
        else if (reducedLossItem) {
          losePts = Math.min(losePts, 2);
          legendaryLog.push(`${defender.name}'in ${reducedLossItem.name} sayesinde daha az puan kaybetti.`);
        }
        // Cüce botları / Karanın Airpodsları Kaskı: defender kaybetse bile intikamla 3 puan çalar
        const revengeItem = getEffect(defender.equipment, "revenge_steal");
        if (revengeItem) {
          winPts = Math.max(0, winPts - 3);
          defenderPoints += 3;
          legendaryLog.push(`${defender.name}'in ${revengeItem.name} intikam alıp saldırandan 3 puan çaldı.`);
        }

        attackerPoints += Math.round(winPts * dailyEvent.pointsMult);
        defenderPoints = Math.max(0, defenderPoints - Math.round(losePts * dailyEvent.pointsMult));

        // Çingene eldiveni / Nazarlıklı amcanın kolyesi: kazanırsa rakibe lanet
        const curseItem = getEffect(attacker.equipment, "curse_defense_next");
        if (curseItem) {
          newCurseForDefenderTarget = { active: true, reduction: 0.2, itemName: curseItem.name };
          legendaryLog.push(`${attacker.name}'in ${curseItem.name} ${defender.name}'e lanet okudu.`);
        }

        logDetails.push(pickBattleMessage({ attackerWins: true, attackerName: attacker.name, defenderName: defender.name, winPts, losePts, isRepeat, repeatCount }));
      } else {
        let winPts = 5, losePts = 3;

        // Dana kaskı: savunmada kazanırsa +5 ekstra
        const bonusDefItem = getEffect(defender.equipment, "bonus_win_defense");
        if (bonusDefItem) {
          winPts += 5;
          legendaryLog.push(`${defender.name}'in ${bonusDefItem.name} savunma zaferine +5 bonus kattı.`);
        }

        defenderPoints += Math.round(winPts * dailyEvent.pointsMult);
        attackerPoints = Math.max(0, attackerPoints - Math.round(losePts * dailyEvent.pointsMult));

        logDetails.push(pickBattleMessage({ attackerWins: false, attackerName: attacker.name, defenderName: defender.name, winPts, losePts, isRepeat, repeatCount }));
      }

      // 👑 1.lik Avı: zirvedeki oyuncuyu yenersen ekstra bonus puan
      if (attackerWins && isThroneTarget) {
        attackerPoints += THRONE_BONUS_POINTS;
        legendaryLog.push(`👑 ${attacker.name}, zirvedeki ${defender.name}'i deviren 1.lik Avı bonusuyla +${THRONE_BONUS_POINTS} ekstra puan kazandı!`);
      }

      // 💀 Kelle Avcısı: aktif ilan bu hedefse ve saldıran kazandıysa ödülü kapar
      let attackerDustGain = 0;
      let bountyClearPayload = null;
      if (attackerWins && bounty && bounty.active && bounty.targetId === defenderId) {
        const bountyBoostPct = getMinorTraitBonusPct(attacker.equipment, "bounty_boost");
        attackerDustGain = Math.round((bounty.amount || 0) * (1 + bountyBoostPct / 100));
        bountyClearPayload = { active: false, targetId: null, targetName: null, amount: 0, placedById: null, placedByName: null };
        legendaryLog.push(`💀 ${attacker.name}, ${defender.name}'in kellesindeki ödülü kapıp ${attackerDustGain} toz kazandı!`);
      }

      // ---- Kariyer istatistikleri (İstatistik sekmesi) ve günlük galibiyet/mağlubiyet sayaçları ----
      const today = dateStr();
      function computeUpdatedStats(playerData, won, isAttackRole, opponentId) {
        const st = playerData.stats || {};
        const winsByOpponent = { ...(st.winsByOpponent || {}) };
        const lossesByOpponent = { ...(st.lossesByOpponent || {}) };
        let totalWins = st.totalWins || 0, totalLosses = st.totalLosses || 0;
        let attackWins = st.attackWins || 0, attackLosses = st.attackLosses || 0;
        let defenseWins = st.defenseWins || 0, defenseLosses = st.defenseLosses || 0;
        let currentStreak = st.currentStreak || 0, longestStreak = st.longestStreak || 0;
        if (won) {
          totalWins++;
          if (isAttackRole) attackWins++; else defenseWins++;
          winsByOpponent[opponentId] = (winsByOpponent[opponentId] || 0) + 1;
          currentStreak++;
          longestStreak = Math.max(longestStreak, currentStreak);
        } else {
          totalLosses++;
          if (isAttackRole) attackLosses++; else defenseLosses++;
          lossesByOpponent[opponentId] = (lossesByOpponent[opponentId] || 0) + 1;
          currentStreak = 0;
        }
        return { totalWins, totalLosses, attackWins, attackLosses, defenseWins, defenseLosses, currentStreak, longestStreak, winsByOpponent, lossesByOpponent };
      }
      const attackerStats = computeUpdatedStats(attacker, attackerWins, true, defenderId);
      const defenderStats = computeUpdatedStats(defender, !attackerWins, false, currentPlayerId);

      const attackerDailyWins = (attacker.dailyStatsDay === today ? (attacker.dailyWins || 0) : 0) + (attackerWins ? 1 : 0);
      const attackerDailyLosses = (attacker.dailyStatsDay === today ? (attacker.dailyLosses || 0) : 0) + (attackerWins ? 0 : 1);
      const defenderDailyWins = (defender.dailyStatsDay === today ? (defender.dailyWins || 0) : 0) + (attackerWins ? 0 : 1);
      const defenderDailyLosses = (defender.dailyStatsDay === today ? (defender.dailyLosses || 0) : 0) + (attackerWins ? 1 : 0);

      // Attacker'ın kendi laneti varsa bu savaşta kullanılmış olur (temizle)
      const attackerCurseClear = attacker.curseNextAttack ? null : undefined;

      // Günlük görev ilerlemesi: her saldırı denemesi, kazanılan savaş, ve
      // varsa "şu oyuncuyu yen" hedefi
      let attackerQuests = incrementQuestProgress(attacker.dailyQuests, "attack_count", 1);
      let attackerWeeklyQuests = incrementQuestProgress(attacker.weeklyQuests, "attack_count", 1);
      let attackerMonthlyQuests = incrementQuestProgress(attacker.monthlyQuests, "attack_count", 1);
      if (attackerWins) {
        attackerQuests = incrementQuestProgress(attackerQuests, "battle_win", 1);
        attackerQuests = incrementQuestProgress(attackerQuests, "defeat_player", 1, { targetPlayerId: defenderId });
        attackerWeeklyQuests = incrementQuestProgress(attackerWeeklyQuests, "battle_win", 1);
        attackerMonthlyQuests = incrementQuestProgress(attackerMonthlyQuests, "battle_win", 1);
      }
      if (attackerDustGain > 0) {
        attackerWeeklyQuests = incrementQuestProgress(attackerWeeklyQuests, "bounty_win", 1);
        attackerMonthlyQuests = incrementQuestProgress(attackerMonthlyQuests, "bounty_win", 1);
      }

      // Aynı hedefe art arda saldırı sınırı için cooldown haritasını güncelle:
      // diğer kilitli hedeflerin kilidi bu savaş sayıldığı için 1 azalır,
      // bu savaşta aynı kişiye 3. kez üst üste vurulduysa o hedef kilitlenir.
      const newTargetCooldowns = {};
      for (const [tid, remain] of Object.entries(targetCooldowns)) {
        const dec = (remain || 0) - 1;
        if (dec > 0) newTargetCooldowns[tid] = dec;
      }
      if (isRepeat && repeatCount >= MAX_CONSECUTIVE_ATTACKS_ON_TARGET) {
        newTargetCooldowns[defenderId] = TARGET_LOCK_COOLDOWN_ATTACKS;
      }

      tx.update(attackerRef, {
        points: attackerPoints,
        dust: (attacker.dust || 0) + attackerDustGain,
        lastAttackTime: Date.now(),
        lastAttackWindow: currentWindow,
        lastAttackedId: defenderId,
        attackStreakOnTarget: repeatCount,
        targetCooldowns: newTargetCooldowns,
        stats: attackerStats,
        dailyStatsDay: today,
        dailyWins: attackerDailyWins,
        dailyLosses: attackerDailyLosses,
        ...(attackerDustGain > 0 ? { bountyWinsTotal: (attacker.bountyWinsTotal || 0) + 1 } : {}),
        ...(attacker.curseNextAttack ? { curseNextAttack: null } : {}),
        ...(attackerQuests !== attacker.dailyQuests ? { dailyQuests: attackerQuests } : {}),
        ...(attackerWeeklyQuests !== attacker.weeklyQuests ? { weeklyQuests: attackerWeeklyQuests } : {}),
        ...(attackerMonthlyQuests !== attacker.monthlyQuests ? { monthlyQuests: attackerMonthlyQuests } : {})
      });
      tx.update(defenderRef, {
        points: defenderPoints,
        stats: defenderStats,
        dailyStatsDay: today,
        dailyWins: defenderDailyWins,
        dailyLosses: defenderDailyLosses,
        ...(newCurseForDefenderTarget ? { curseNextAttack: newCurseForDefenderTarget } : {})
      });
      if (bountyClearPayload) {
        tx.update(bountyRef, bountyClearPayload);
      }

      // Ana savaş cümlesi (kazandı/kaybetti) ile efsanevi eşya etkilerinin açıklamaları
      // önceden tek bir paragrafta birleştiriliyordu, bu da okunurken karışıyordu.
      // Artık ikisi ayrı tutulup ayrı gösteriliyor (bkz. renderBattleLog / showResultModal).
      const mainMessage = logDetails.join(" ");
      tx.set(doc(collection(db, LOG_COL)), {
        attacker: attacker.name,
        defender: defender.name,
        message: mainMessage,
        effects: legendaryLog,
        winner: attackerWins ? attacker.name : defender.name,
        legendary: legendaryLog.length > 0,
        timestamp: Date.now()
      });

      return {
        skipped: false,
        attackerWins, attackPower: Math.round(attackPower), defensePower: Math.round(defensePower),
        message: mainMessage, legendaryLog
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
  if (result.oracle) {
    playSound(result.won ? "win" : "lose");
    resultContent.innerHTML = `
      <div class="result-title ${result.won ? "win" : "lose"}">${result.won ? "🔮 Kahin Haklı Çıktı!" : "🔮 Kahin Yanıldı"}</div>
      <p class="result-line">${result.targetName} için ${result.amount} toz yatırmıştın.</p>
      <p class="result-line">${result.won ? `Tahminin doğru çıktı, +${result.reward} toz kazandın!` : "Bu sefer tutmadı, yatırdığın toz gitti."}</p>`;
    resultModal.classList.remove("hidden");
    return;
  }
  if (result.stranger) {
    playSound(result.won ? "win" : "lose");
    resultContent.innerHTML = `
      <div class="result-title ${result.won ? "win" : "lose"}">${result.won ? "🏆 Kazandın!" : "🤝 Bu Sefer Olmadı"}</div>
      <p class="result-line">${result.name} ile girdiğin düellodan ${result.won ? `+${result.reward} toz kazanarak` : "hiçbir kayıp olmadan"} çıktın.</p>`;
  } else if (result.skipped) {
    resultContent.innerHTML = `
      <div class="result-title lose">💨 Nargile Keyfi</div>
      <p class="result-line">Bu sefer saldıramadan hakkın harcandı.</p>`;
  } else {
    const won = result.attackerWins;
    playSound(won ? "win" : "lose");
    resultContent.innerHTML = `
      <div class="result-title ${won ? "win" : "lose"}">${won ? "🏆 Kazandın!" : "💀 Kaybettin!"}</div>
      <p class="result-line">Senin Gücün: ${result.attackPower} &nbsp;|&nbsp; Rakip Gücü: ${result.defensePower}</p>
      ${result.legendaryLog.length ? `<div class="result-passive">${result.legendaryLog.map(x => `• ${x}`).join("<br>")}</div>` : ""}
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
    const attackerWon = e.winner && e.winner === e.attacker;

    let badge;
    if (!e.winner) badge = `<span class="log-badge skip">💨 Pas Geçti</span>`;
    else if (attackerWon) badge = `<span class="log-badge win">🏆 Kazandı</span>`;
    else badge = `<span class="log-badge lose">🛡️ Savundu</span>`;
    const legendaryBadge = e.legendary ? `<span class="log-badge legendary">✨ Efsanevi Etki</span>` : "";

    // Efsanevi eşya etkileri artık ana savaş cümlesiyle aynı paragrafta karışık
    // gösterilmiyor; ayrı, madde işaretli bir liste halinde altında gösteriliyor.
    const effectsHtml = (e.effects && e.effects.length)
      ? `<ul style="margin:6px 0 0 18px; padding:0; font-size:0.85em; opacity:0.9; line-height:1.5;">${e.effects.map(x => `<li>${x}</li>`).join("")}</ul>`
      : "";

    return `
      <div class="log-entry ${cls}">
        <div class="log-entry-top">
          <span class="log-fighters">${e.attacker} <span class="log-vs">⚔️</span> ${e.defender}</span>
          <span class="log-badges">${badge}${legendaryBadge}</span>
        </div>
        <p class="log-message">${e.message}</p>
        ${effectsHtml}
        <span class="log-time">🕐 ${time}</span>
      </div>`;
  }).join("");
}

// ============================================================
// SES EFEKTLERİ
// Tasarım prototipindeki gibi, dışarıdan hiçbir ses dosyası kullanılmadan
// Web Audio API osilatörleriyle anlık üretiliyor. Oyunun mevcut mantığına
// (skor/kutu/saldırı hesapları) dokunmuyor, sadece geri bildirim katmanı.
// ============================================================
let audioCtx = null;
let soundOn = localStorage.getItem("gacha_sound_on") !== "0";

// ============================================================
// GERÇEK SES DOSYALARI
// Aşağıdaki dosyaları index.html ile AYNI klasöre koy (veya yolları
// kendi klasör yapına göre güncelle, örn. "sounds/Click_Sesi.mp3").
// Sadece bu 5 aksiyon gerçek ses dosyasıyla değiştirildi (tıklama,
// saldırı, kazanma, kaybetme, çark); kutu açma efektleri hâlâ
// Web Audio ile sentezleniyor (o dosyalar ayrıca eklenecek).
// ============================================================
const SOUND_FILES = {
  click: "Click_Sesi.mp3",
  attack: "Saldırma_sesi.mp3",
  attack2: "Saldırma_Sesi_2.wav",
  win: "Kazanma_Sesi.mp3",
  lose: "Kaybetme_sesi.mp3",
  wheel: "Çark_sesi.mp3"
};

const audioCache = {};
function getAudio(key) {
  const file = SOUND_FILES[key];
  if (!file) return null;
  if (!audioCache[key]) {
    const a = new Audio(encodeURI(file));
    a.preload = "auto";
    audioCache[key] = a;
  }
  return audioCache[key];
}
// Aynı ses üst üste hızlı tetiklenebildiği için (örn. art arda tık) her
// çalışta node klonlanıyor, böylece önceki çalma kesilmeden yenisi başlıyor.
function playSound(key, { volume = 1 } = {}) {
  if (!soundOn) return;
  const base = getAudio(key);
  if (!base) return;
  try {
    const node = base.cloneNode(true);
    node.volume = volume;
    node.play().catch((err) => console.warn(`Ses çalınamadı (${SOUND_FILES[key]}):`, err.message));
  } catch (e) { console.warn(`Ses çalınamadı (${SOUND_FILES[key]}):`, e.message); }
}

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
  } catch (e) { /* ses opsiyonel bir katman, hata olursa sessiz geç */ }
}

// Genel tık sesi: kullanıcının sağladığı gerçek ses dosyası.
function sfxClick() {
  playSound("click");
}
function sfxShake() { tone(140, 0, 0.09, "sawtooth", 0.12); tone(110, 0.06, 0.09, "sawtooth", 0.10); }
function sfxOpenStandart() { tone(660, 0, 0.12, "triangle"); tone(880, 0.08, 0.15, "triangle"); }
function sfxOpenRare() { tone(520, 0, 0.1, "triangle"); tone(780, 0.09, 0.12, "triangle"); tone(1040, 0.18, 0.2, "triangle"); }
function sfxOpenLegendary() {
  [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.09, 0.35, "triangle", 0.16));
  tone(1568, 0.45, 0.5, "sine", 0.14);
}
// Çark dönerken segment geçişinde çalan kısa "tık" sesi
function sfxWheelTick() {
  tone(1100, 0, 0.028, "square", 0.05);
  tone(650, 0.005, 0.02, "square", 0.03);
}
// Çarkın o anki gerçek dönüş açısını (derece) CSS transform matrisinden okur
function getWheelRotationDeg(el) {
  const st = getComputedStyle(el);
  const tr = st.transform;
  if (!tr || tr === "none") return 0;
  const match = tr.match(/^matrix\(([^)]+)\)$/);
  if (!match) return 0;
  const v = match[1].split(",").map(parseFloat);
  let angle = Math.atan2(v[1], v[0]) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}
// Segmentler arası koyu "demir parmaklık" ayraçları için conic-gradient
// (Karanlık Kader Çarkı temasından uyarlandı).
function buildWheelSpokesGradient() {
  return `repeating-conic-gradient(from -1.5deg, transparent 0deg, transparent ${WHEEL_SEGMENT_ANGLE - 3}deg, #111 ${WHEEL_SEGMENT_ANGLE - 3}deg, #111 ${WHEEL_SEGMENT_ANGLE}deg)`;
}
// Saldırı sesi: kullanıcının sağladığı 2 gerçek ses dosyasından rastgele biri
// çalınır, böylece art arda saldırılarda ses tekdüze olmaz.
function sfxAttack() {
  playSound(Math.random() < 0.5 ? "attack" : "attack2");
}

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

// Genel tık sesi: mevcut butonların davranışını değiştirmeden, her buton
// tıklamasında kısa bir "click" sesi çalar (event delegation).
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || btn.disabled) return;
  if (btn.id === "soundToggleBtn") return; // kendi sesini kendi yönetiyor
  sfxClick();
}, true);

// ============================================================
// SEKMELER (GERÇEK TAB SİSTEMİ)
// Her sekme SADECE kendi içeriğini gösterir, diğerleri tamamen gizlenir:
// Kutu -> yalnız kutu açma + enerji, Görev -> yalnız günlük görevler,
// Savaş -> yalnız saldırı hedefleri + savaş geçmişi, Sıra -> yalnız
// liderlik tablosu, Profil -> yalnız kuşanım/envanter ve kendi bilgilerimiz.
// ============================================================
const bottomNav = document.getElementById("bottomNav");
const tabPanels = [...document.querySelectorAll(".tab-panel")];
const navActiveIndicator = document.getElementById("navActiveIndicator");

// Gösterge konumu, offsetLeft/offsetWidth yerine getBoundingClientRect FARKI
// ile hesaplanıyor. Bu, gap/max-width/justify-content gibi düzen detaylarından
// tamamen bağımsız çalışır ve gösterge HER ZAMAN tıklanan sekmenin ikonunun
// tam ortasında hizalanır (eski hesaplamada bazı sekmelerde/ekran
// genişliklerinde birkaç piksel kayma oluyordu, artık oluşmuyor).
function moveNavIndicator(btn) {
  if (!navActiveIndicator || !btn || !bottomNav) return;
  const navRect = bottomNav.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const indicatorWidth = navActiveIndicator.offsetWidth || 40;
  const targetLeft = (btnRect.left - navRect.left) + (btnRect.width / 2) - (indicatorWidth / 2);
  navActiveIndicator.style.transform = `translateX(${targetLeft}px)`;
  navActiveIndicator.classList.add("ready");
}

function activateTab(targetId) {
  tabPanels.forEach(panel => panel.classList.toggle("active", panel.id === targetId));
  if (bottomNav) {
    let activeBtn = null;
    bottomNav.querySelectorAll(".nav-btn").forEach(b => {
      const isActive = b.getAttribute("data-target") === targetId;
      b.classList.toggle("active", isActive);
      if (isActive) activeBtn = b;
    });
    // Bir sonraki çizim karesinde ölç: class değişiminin (ikon büyümesi vb.)
    // layout'a yansıması garanti olsun diye.
    requestAnimationFrame(() => moveNavIndicator(activeBtn));
  }
}

if (bottomNav) {
  bottomNav.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => activateTab(btn.getAttribute("data-target")));
  });

  // İlk konumlandırma: webfontlar (Fredoka/Luckiest Guy) yüklenmeden ölçüm
  // alınırsa buton genişlikleri sonradan değişip göstergeyi kaydırabilir,
  // bu yüzden fontlar hazır olunca ve pencere yeniden boyutlandığında/
  // döndürüldüğünde de yeniden hizalanıyor.
  const initNavIndicator = () => {
    const active = bottomNav.querySelector(".nav-btn.active") || bottomNav.querySelector(".nav-btn");
    requestAnimationFrame(() => moveNavIndicator(active));
  };
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(initNavIndicator).catch(initNavIndicator);
  } else {
    initNavIndicator();
  }
  window.addEventListener("load", initNavIndicator);
  window.addEventListener("resize", () => {
    moveNavIndicator(bottomNav.querySelector(".nav-btn.active"));
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
