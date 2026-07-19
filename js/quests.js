import { loadPlayersOnce } from "./auth-ui.js";
import { XP_PER_QUEST_DAILY, XP_PER_QUEST_MONTHLY, XP_PER_QUEST_WEEKLY, getScrap } from "./core-config.js";
import { bagGridEl, itemPopup, itemPopupInner, monthlyQuestsListEl, questsListEl, weeklyQuestsListEl } from "./dom.js";
import { pick, pickSlotWeighted, randInt, rollDailyMarketItems } from "./events-badges.js";
import { PLAYERS_COL, collection, db, doc, getDoc, getDocs, runTransaction, updateDoc } from "./firebase-setup.js";
import { getSlotInventory, openInventoryModal } from "./inventory.js";
import { BOOK_TIER_ICONS, BOOK_TIER_NAMES, RARITY_CHANCE_LABELS, applyXpGain, computeStatsFromEquipment, generateLootItemForRarity, getBooks } from "./item-systems.js";
import { SLOTS, SLOT_MAP, getLiveEffectDesc, itemIconSvg } from "./items-data.js";
import { dateStr, emptyEquipment } from "./map.js";
import { S } from "./state.js";
import { META_COL } from "./wheel-bounty-oracle.js";
import { QUEST_TEMPLATES } from "./worldboss.js";

// ============================================================
// HAFTALIK LİDERLİK TABLOSU
// Her hafta Pazar 00:00'da (bir sonraki Pazar 00:00'a kadar) o haftanın
// liderlik tablosu kapanır: 1. olan oyuncuya hurda + garanti nadir eşya
// verilir ve haftalık şampiyonluk sayacı +1 olur, ardından HERKESİN puanı
// sıfırlanır ve yeni hafta 0'dan başlar. Paylaşımlı tek bir gameMeta
// dokümanı (weeklyLeaderboard) hangi haftanın işlendiğini tutar; hangi
// client önce fark ederse sıfırlamayı o yapar, diğerleri "zaten işlendi"
// deyip pas geçer (Kelle Avcısı ilanıyla aynı desen).
// ============================================================
export const WEEKLY_LEADERBOARD_DOC_ID = "weeklyLeaderboard";
export const WEEKLY_CHAMPION_HURDA_REWARD = 25;

// ============================================================
// 1.LİK AVI
// Liderlik tablosunun zirvesindeki oyuncuyu saldırıda yenen kişi, normal
// kazanma ödülünün üstüne ekstra bonus puan alır. Kimse zirvede rahat oturamasın.
// ============================================================
export const THRONE_BONUS_POINTS = 8;

// Aynı oyuncuya art arda saldırma hakkı sınırlı: bir hedefi üst üste bu sayıdan
// fazla kez seçemezsin, tek bir kurbanın sürekli hedef alınmasını engellemek için.
export const MAX_CONSECUTIVE_ATTACKS_ON_TARGET = 3;
// Bir hedef üst üste 3 kez vurulduktan sonra kilitlenir; o hedefe tekrar
// saldırabilmek için önce en az bu kadar BAŞKA savaş yapman gerekir.
export const TARGET_LOCK_COOLDOWN_ATTACKS = 3;

// ============================================================
// GÜNLÜK GÖREVLER
// Her gün, her oyuncuya 3 rastgele görev atanır (1'i her zaman "giriş yap").
// Zorluğa göre ödül (hurda + puan + nadir eşya şansı) ölçekleniyor. Dengeyi
// korumak için "zor" görevler bile tek başına ekonomiyi patlatmayacak
// ölçüde ödül veriyor.
// ============================================================
// [V2 Faz 6] V2 ekonomisine göre yeniden dengelendi: Faz 2'nin Kitap
// materyali (upgrade sisteminin ikinci kaynağı) devreye girdiğinden beri
// görevler bunu hiç vermiyordu — Harita/Dünya Boss dışında Kitap kazanmanın
// bir yolu yoktu ve Harita henüz UI'a bağlı değil. "zor" günlük görev artık
// düşük ihtimalle 1 Sıradan Kitap da veriyor; hurda/puan aralıkları da
// UPGRADE_HURDA_BASE_COST/HURDA_COST_RARE_BOX ile orantılı şekilde hafifçe
// yükseltildi (zorlaştıkça ödül daha dik artıyor).
export const QUEST_TIER_REWARDS = {
  kolay: { scrapMin: 1, scrapMax: 2, pointsMin: 1, pointsMax: 2, itemChance: 0 },
  orta: { scrapMin: 3, scrapMax: 5, pointsMin: 3, pointsMax: 6, itemChance: 0 },
  zor: { scrapMin: 6, scrapMax: 9, pointsMin: 7, pointsMax: 12, itemChance: 0 }
};
export const QUEST_TIER_LABELS = { kolay: "Kolay", orta: "Orta", zor: "Zor", efsanevi: "Efsanevi" };

// ============================================================
// HAFTALIK & AYLIK GÖREVLER
// Günlük görevlerden ayrı bir havuz: aynı tiplere (kutu aç, savaşa gir vb.)
// dokunmadan, ayrıca Kahin Bahsi ve Kelle Avcısı'na özel niş görev tipleri
// de eklendi (oracle_win, bounty_win). Zorluk günlükten belirgin şekilde
// yüksek tutuldu; ödüller de buna göre ölçeklendi. Aylık görevlerden
// SADECE en zoru (tier "efsanevi") garanti efsanevi eşya veriyor, geri
// kalan tüm haftalık/aylık ödüller hurda + puan (+ bazen garanti/şanslı
// nadir eşya) şeklinde.
// ============================================================
// [V2 Faz 6] Haftalık: "orta" artık Nadir Kitap, "zor" artık Efsanevi Kitap
// şansı da veriyor — haftalık görevler, upgrade sisteminin en pahalı
// materyal ihtiyacına (efsanevi/kabus tier Kitap) erken-orta oyun için makul
// bir kaynak sağlıyor. Hurda/puan aralıkları da V2 fiyatlarına (Market'teki
// Nadir Sandık 3000 Altın, upgrade maliyetleri vb.) göre hafifçe yükseltildi.
export const WEEKLY_TIER_REWARDS = {
  orta: { scrapMin: 10, scrapMax: 15, pointsMin: 12, pointsMax: 18, itemChance: 0 },
  zor: { scrapMin: 18, scrapMax: 26, pointsMin: 22, pointsMax: 32, itemChance: 0 }
};
// [V2 Faz 6] Aylık: en zor ("efsanevi" tier, ayın TEK garanti Efsanevi eşya
// ödülü) artık ayrıca garanti 1 Mitik Kitap da veriyor — Mitik eşya
// yükseltmenin (UPGRADE_HURDA_BASE_COST.mitik = 40 Hurda + Mitik Kitap)
// TEK öngörülebilir/garanti kaynağı bu görev oluyor bilerek; Dünya Boss'u
// (Faz 6, aynı fazda eklendi) düşük ihtimalli/şansa bağlı ikinci kaynak.
export const MONTHLY_TIER_REWARDS = {
  zor: { scrapMin: 34, scrapMax: 48, pointsMin: 40, pointsMax: 58, itemChance: 0 },
  efsanevi: { scrapMin: 42, scrapMax: 62, pointsMin: 48, pointsMax: 68, itemChance: 0, rareItem: true }
};

// Hedefler oyunun gerçek temposuna göre kasıtlı olarak zorlaştırıldı: kutu 4 saatte
// 1 (günde en fazla ~6), saldırı saat başına 1 (günde en fazla ~24), Kahin Bahsi
// günde en fazla 1 hakla sınırlı. Bu yüzden aşağıdaki hedeflerin hiçbiri tek bir
// günde, hatta çoğu tek bir hafta sonu grinding'iyle bile bitirilemeyecek şekilde
// ayarlandı; gerçekten haftayı/ayı yayarak oynamayı gerektiriyor.
export const WEEKLY_QUEST_TEMPLATES = [
  { type: "open_box", tier: "orta", icon: "📦", target: 32, label: (t) => `${t} sandık aç` },
  { type: "attack_count", tier: "orta", icon: "⚔️", target: 70, label: (t) => `${t} savaşa gir` },
  { type: "battle_win", tier: "zor", icon: "🏆", target: 24, label: (t) => `${t} savaş kazan` },
  { type: "energy_task", tier: "orta", icon: "⚡", target: 35, label: (t) => `${t} kez enerji görevi yap` },
  { type: "oracle_win", tier: "zor", icon: "🔮", target: 5, label: (t) => `${t} kez Kahin Bahsi'ni doğru bil` },
  { type: "bounty_win", tier: "zor", icon: "💀", target: 4, label: (t) => `${t} kez Kelle Avcısı ödülünü kap` }
];

// Ayda her zaman bu en zor görev atanır (efsanevi eşya ödülü sadece bunda var).
export const MONTHLY_HARD_TEMPLATE = { type: "battle_win", tier: "efsanevi", icon: "👑", target: 90, label: (t) => `Bu ay ${t} savaş kazan` };
// Bunun yanına, aşağıdaki havuzdan rastgele 2 farklı tip daha eklenir (hurda/puan/garanti nadir eşya verir).
export const MONTHLY_QUEST_POOL = [
  { type: "open_box", tier: "zor", icon: "📦", target: 140, label: (t) => `Bu ay ${t} sandık aç` },
  { type: "attack_count", tier: "zor", icon: "⚔️", target: 300, label: (t) => `Bu ay ${t} savaşa gir` },
  { type: "oracle_win", tier: "zor", icon: "🔮", target: 22, label: (t) => `Bu ay ${t} kez Kahin Bahsi'ni doğru bil` },
  { type: "bounty_win", tier: "zor", icon: "💀", target: 12, label: (t) => `Bu ay ${t} kez Kelle Avcısı ödülünü kap` },
  { type: "energy_task", tier: "zor", icon: "⚡", target: 130, label: (t) => `Bu ay ${t} kez enerji görevi yap` }
];

export function rollQuestRewardGeneric(table, tier) {
  const r = table[tier];
  const rewardBook = !!(r.bookChance && Math.random() < r.bookChance);
  return {
    scrap: randInt(r.scrapMin, r.scrapMax),
    points: randInt(r.pointsMin, r.pointsMax),
    // rareItem (aylık en zor görev) → garanti nadir eşya; yoksa itemChance'a bak
    item: r.rareItem ? true : (!r.legendary && Math.random() < r.itemChance),
    legendary: !!r.legendary,
    bookTier: rewardBook ? r.bookTier : null,
    bookAmount: rewardBook ? (r.bookAmount || 1) : 0
  };
}

export function buildPeriodQuest(template, idx, rewardTable, prefix) {
  const reward = rollQuestRewardGeneric(rewardTable, template.tier);
  let label = template.label;
  if (typeof label === "function") label = label(template.target);
  return {
    id: `${prefix}${idx}_${template.type}`, type: template.type, tier: template.tier, icon: template.icon,
    label, target: template.target, progress: 0, completed: false, claimed: false,
    rewardScrap: reward.scrap, rewardPoints: reward.points, rewardItem: reward.item, rewardLegendary: reward.legendary,
    rewardBookTier: reward.bookTier, rewardBookAmount: reward.bookAmount
  };
}

export function getWeekStartDate(d = new Date()) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() + diff);
  return monday;
}
export function weekIdStr(d = new Date()) { return dateStr(getWeekStartDate(d)); }
export function monthIdStr(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

// Haftalık LİDERLİK sıfırlaması, görev haftasından (Pazartesi başlangıç) FARKLI
// olarak Pazar 00:00'da başlayıp bir sonraki Pazar 00:00'da biter. Yani "hafta"
// burada Pazar-Cumartesi aralığıdır; sınır tam Pazar gece yarısıdır.
export function getSundayStartDate(d = new Date()) {
  const day = d.getDay(); // 0 = Pazar
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(d.getDate() - day);
  return start;
}
export function leaderboardWeekIdStr(d = new Date()) { return dateStr(getSundayStartDate(d)); }
export function getMsUntilNextSunday(d = new Date()) {
  const start = getSundayStartDate(d);
  const next = new Date(start);
  next.setDate(start.getDate() + 7);
  return next - d;
}

export function shuffleArr(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// Görev hedefleri/ödülleri her değiştirildiğinde bu sürüm numarası da artırılmalı.
// Aksi halde bir oyuncu o hafta/ay için görevini ZATEN almışsa (questsWeek/questsMonth
// eşleşiyorsa) sistem "zaten atanmış" deyip eskisini korur ve yeni denge hiç yansımaz.
// Versiyon etiketi hafta/ay id'sine eklenince eski kayıt artık eşleşmediği için
// oyuncu bir sonraki girişinde otomatik olarak yeni (zorlaştırılmış) görevleri alır.
// [V2 Faz 6] Ödül tabloları (WEEKLY_TIER_REWARDS/MONTHLY_TIER_REWARDS, Kitap
// ödülü eklendi) değiştiği için versiyon "v2" → "v3" yükseltildi; aksi halde
// mevcut oyuncular eski (kitapsız) ödüllerini korurdu.
export const WEEKLY_QUEST_VERSION = "v4";
export const MONTHLY_QUEST_VERSION = "v4";

export async function ensureWeeklyQuestsForThisWeek(data) {
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

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
    weeklyQuests: quests,
    questsWeek: wk
  });
}

export async function ensureMonthlyQuestsForThisMonth(data) {
  const mo = `${monthIdStr()}#${MONTHLY_QUEST_VERSION}`;
  if (data.questsMonth === mo && Array.isArray(data.monthlyQuests) && data.monthlyQuests.length) return;

  const shuffled = shuffleArr(MONTHLY_QUEST_POOL);
  const picked = shuffled.slice(0, 2);
  const templatesToUse = [MONTHLY_HARD_TEMPLATE, ...picked];
  const quests = templatesToUse.map((t, i) => buildPeriodQuest(t, i, MONTHLY_TIER_REWARDS, "m"));

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
    monthlyQuests: quests,
    questsMonth: mo
  });
}

// Paylaşımlı gameMeta/weeklyLeaderboard dokümanı hangi haftanın işlendiğini
// tutar. Hangi client bu haftanın henüz işlenmediğini fark ederse sıfırlamayı
// O yapar (transaction ile "önce ben kaptım" garantisi); diğer client'lar
// transaction içinde "zaten işlenmiş" görüp hiçbir şey yapmadan çıkar.
export async function ensureWeeklyLeaderboardReset() {
  const currentWeekId = leaderboardWeekIdStr();
  const metaRef = doc(db, META_COL, WEEKLY_LEADERBOARD_DOC_ID);

  // ÖNEMLİ (kota tüketimi düzeltmesi): Önceden bu fonksiyon HER ÇAĞRIDA
  // (dakikada bir, her açık client için) tüm oyuncu koleksiyonunu (MAX_PLAYERS'a
  // kadar doküman)
  // okuyordu — hafta değişmemiş olsa bile. Bu, Firestore'un günlük ücretsiz
  // okuma kotasını çok hızlı tüketip normal işlemlerin (saldırı, kutu açma
  // vb.) "Quota exceeded" hatası almasına sebep oluyordu. Artık önce tek bir
  // meta dokümanı okunuyor; hafta zaten işlenmişse hiçbir oyuncu dokümanı
  // okunmadan hemen çıkılıyor.
  const preSnap = await getDoc(metaRef);
  if (preSnap.exists() && preSnap.data().lastProcessedWeek === currentWeekId) return;

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
          scrap: getScrap(winner.data) + WEEKLY_CHAMPION_HURDA_REWARD,
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
        lastWinnerName: hasWinner ? winner.data.nick : null,
        lastWinnerPoints: hasWinner ? (winner.data.points || 0) : 0
      }, { merge: true });
    });
  } catch (e) {
    console.error("Haftalık liderlik sıfırlama hatası:", e);
  }
}


// ============================================================
// GÜNLÜK GÖREVLER — mantık
// ============================================================
export function rollQuestReward(tier) {
  const r = QUEST_TIER_REWARDS[tier];
  const rewardBook = !!(r.bookChance && Math.random() < r.bookChance);
  return {
    scrap: randInt(r.scrapMin, r.scrapMax),
    points: randInt(r.pointsMin, r.pointsMax),
    item: Math.random() < r.itemChance,
    bookTier: rewardBook ? r.bookTier : null,
    bookAmount: rewardBook ? 1 : 0
  };
}

export function buildQuestFromTemplate(template, idx, otherPlayers) {
  const reward = rollQuestReward(template.tier);
  let label = template.label;

  if (template.type === "defeat_player") {
    if (!otherPlayers.length) return null;
    const t = pick(otherPlayers);
    label = `${t.nick}'i savaşta yen`;
    return {
      id: `q${idx}_${template.type}`, type: template.type, tier: template.tier, icon: template.icon,
      label, target: template.target, progress: 0, completed: false, claimed: false,
      rewardScrap: reward.scrap, rewardPoints: reward.points, rewardItem: reward.item,
      rewardBookTier: reward.bookTier, rewardBookAmount: reward.bookAmount,
      targetPlayerId: t.id, targetPlayerName: t.nick
    };
  }

  if (typeof label === "function") label = label(template.target);

  return {
    id: `q${idx}_${template.type}`, type: template.type, tier: template.tier, icon: template.icon,
    label, target: template.target,
    progress: template.autoComplete ? template.target : 0,
    completed: !!template.autoComplete,
    claimed: false,
    rewardScrap: reward.scrap, rewardPoints: reward.points, rewardItem: reward.item,
    rewardBookTier: reward.bookTier, rewardBookAmount: reward.bookAmount,
    targetPlayerId: null, targetPlayerName: null
  };
}

// Bugün için henüz görev atanmadıysa, 1 "giriş yap" + farklı tipte 2 rastgele
// görev daha seçip Firestore'a yazar (Gizemli Yabancı ile aynı desen).
export async function ensureDailyQuestsForToday(data) {
  const today = dateStr();
  if (data.questsDate === today && Array.isArray(data.dailyQuests) && data.dailyQuests.length) return;

  const players = await loadPlayersOnce();
  const others = players.filter(p => p.id !== S.currentPlayerId);

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

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
    dailyQuests: quests,
    questsDate: today
  });
}

// Bugün için Günlük Market rulosu henüz yoksa (veya gün değiştiyse) 5 yeni
// eşya üretip Firestore'a yazar — ensureDailyQuestsForToday ile birebir aynı
// desen. Item'lar burada SABİTLENİYOR ki sayfa yenilense/render tekrarlansa
// bile aynı gün içinde fiyat/statlar değişmesin.
export async function ensureDailyMarketForToday(data) {
  const today = dateStr();
  if (data.marketDate === today && Array.isArray(data.dailyMarket) && data.dailyMarket.length) return;

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
    dailyMarket: rollDailyMarketItems(),
    marketDate: today
  });
}

// Belirli tipte, tamamlanmamış görevlerin ilerlemesini artırır. defeat_player
// tipinde sadece targetPlayerId eşleşiyorsa sayılır.
export function incrementQuestProgress(quests, type, amount = 1, opts = {}) {
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
export function buildItemGrantPayload(data, rarity) {
  const recentSlots = data.recentSlots || [];
  const slot = pickSlotWeighted(recentSlots);
  const item = generateLootItemForRarity(slot, rarity);
  const wasEmpty = !(data.equipment && data.equipment[slot]);
  const newInvArr = [...getSlotInventory(slot), item];
  const newEquipment = wasEmpty
    ? { ...(data.equipment || emptyEquipment()), [slot]: item }
    : (data.equipment || emptyEquipment());
  const stats = computeStatsFromEquipment(newEquipment, data.statAllocated);
  const newDiscovered = Array.from(new Set([...(data.discoveredItems || []), item.name]));
  const newRecentSlots = [...recentSlots, slot].slice(-8);
  return {
    equipment: newEquipment,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    critStat: stats.critStat,
    maxHp: stats.maxHp,
    [`inventory.${slot}`]: newInvArr,
    discoveredItems: newDiscovered,
    recentSlots: newRecentSlots,
    _grantedItem: item
  };
}

// buildItemGrantPayload'ın S.currentPlayerData'ya bağımlı olmayan genel hali:
// haftalık liderlik şampiyonu gibi, o an giriş yapmış oyuncu OLMAYABİLECEK
// başka bir oyuncuya eşya vermek için kullanılır (getSlotInventory yerine
// doğrudan verilen "data" parametresinden envanteri okur).
export function getSlotInventoryGeneric(data, slot) {
  const inv = (data?.inventory && data.inventory[slot]) || [];
  const equipped = data?.equipment && data.equipment[slot];
  if (equipped && !inv.some(it => it.id && equipped.id && it.id === equipped.id)) {
    const legacyId = equipped.id || `legacy-${slot}`;
    return [{ ...equipped, id: legacyId }, ...inv];
  }
  return inv;
}
export function buildItemGrantPayloadGeneric(data, rarity) {
  const recentSlots = data.recentSlots || [];
  const slot = pickSlotWeighted(recentSlots);
  const item = generateLootItemForRarity(slot, rarity);
  const wasEmpty = !(data.equipment && data.equipment[slot]);
  const newInvArr = [...getSlotInventoryGeneric(data, slot), item];
  const newEquipment = wasEmpty
    ? { ...(data.equipment || emptyEquipment()), [slot]: item }
    : (data.equipment || emptyEquipment());
  const stats = computeStatsFromEquipment(newEquipment, data.statAllocated);
  const newDiscovered = Array.from(new Set([...(data.discoveredItems || []), item.name]));
  const newRecentSlots = [...recentSlots, slot].slice(-8);
  return {
    equipment: newEquipment,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    critStat: stats.critStat,
    maxHp: stats.maxHp,
    [`inventory.${slot}`]: newInvArr,
    discoveredItems: newDiscovered,
    recentSlots: newRecentSlots,
    _grantedItem: item
  };
}

export function questCardHtml(q) {
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
          <span class="quest-reward">✨${q.rewardScrap} · ⭐${q.rewardPoints}${q.rewardItem ? " · 🔷 Nadir Eşya" : ""}${q.rewardLegendary ? " · 🌟 Efsanevi Eşya" : ""}${q.rewardBookTier ? ` · ${BOOK_TIER_ICONS[q.rewardBookTier]} ${q.rewardBookAmount > 1 ? q.rewardBookAmount + "x " : ""}${BOOK_TIER_NAMES[q.rewardBookTier]}` : ""}</span>
          ${q.claimed
            ? `<span class="quest-claimed-tag">✅ Alındı</span>`
            : `<button class="btn-mini nadir-mini quest-claim-btn" data-id="${q.id}" ${readyToClaim ? "" : "disabled"}>Ödülü Al</button>`}
        </div>
      </div>`;
}

export function renderQuestList(container, quests, period, emptyMsg) {
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

export function renderQuests() {
  if (!S.currentPlayerData) return;
  renderQuestList(questsListEl, S.currentPlayerData.dailyQuests || [], "dailyQuests", "Bugünkü görevler yükleniyor...");
  renderQuestList(weeklyQuestsListEl, S.currentPlayerData.weeklyQuests || [], "weeklyQuests", "Haftalık görevler yükleniyor...");
  renderQuestList(monthlyQuestsListEl, S.currentPlayerData.monthlyQuests || [], "monthlyQuests", "Aylık görevler yükleniyor...");
}

export async function claimQuest(period, questId) {
  if (!S.currentPlayerData) return;
  const quests = S.currentPlayerData[period] || [];
  const quest = quests.find(q => q.id === questId);
  if (!quest || !quest.completed || quest.claimed) return;

  document.querySelectorAll(".quest-claim-btn").forEach(b => b.disabled = true);

  // [V2 Faz 3] Görev ödülü XP: periyoda göre (günlük/haftalık/aylık) artan miktarda.
  const questXpAmount = period === "monthlyQuests" ? XP_PER_QUEST_MONTHLY
    : period === "weeklyQuests" ? XP_PER_QUEST_WEEKLY
    : XP_PER_QUEST_DAILY;
  const questXpResult = applyXpGain(S.currentPlayerData, questXpAmount);

  let payload = {
    scrap: getScrap(S.currentPlayerData) + (quest.rewardScrap || 0),
    points: (S.currentPlayerData.points || 0) + (quest.rewardPoints || 0),
    level: questXpResult.level,
    xp: questXpResult.xp,
    statPoints: questXpResult.statPoints
  };

  let grantedItem = null;
  if (quest.rewardLegendary) {
    const itemGrant = buildItemGrantPayload(S.currentPlayerData, "efsanevi");
    grantedItem = itemGrant._grantedItem;
    delete itemGrant._grantedItem;
    payload = { ...payload, ...itemGrant };
  } else if (quest.rewardItem) {
    const itemGrant = buildItemGrantPayload(S.currentPlayerData, "nadir");
    grantedItem = itemGrant._grantedItem;
    delete itemGrant._grantedItem;
    payload = { ...payload, ...itemGrant };
  }

  // [V2 Faz 6] Görev ödülüne eklenen Kitap materyali (bkz. QUEST_TIER_REWARDS/
  // WEEKLY_TIER_REWARDS/MONTHLY_TIER_REWARDS'taki bookChance/bookTier/bookAmount).
  if (quest.rewardBookTier && quest.rewardBookAmount) {
    const newBooks = { ...getBooks(S.currentPlayerData) };
    newBooks[quest.rewardBookTier] = (newBooks[quest.rewardBookTier] || 0) + quest.rewardBookAmount;
    payload.books = newBooks;
  }

  const newQuests = quests.map(q => q.id === questId ? { ...q, claimed: true } : q);
  payload[period] = newQuests;

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), payload);

  if (grantedItem) {
    itemPopupInner.className = `item-popup-inner rarity-${grantedItem.rarity}`;
    itemPopupInner.innerHTML = `
      <div class="streak-bonus-tag">🎯 Görev Ödülü!</div>
      <div class="item-popup-icon">${itemIconSvg(grantedItem.slot, grantedItem.rarity, 52)}</div>
      <div class="item-popup-name rarity-${grantedItem.rarity}">${grantedItem.name}</div>
      <div class="item-popup-stats">⚔️ +${grantedItem.atk} &nbsp; 🛡️ +${grantedItem.def} &nbsp; · ${grantedItem.rarity.toUpperCase()} (${RARITY_CHANCE_LABELS[grantedItem.rarity]} şans)</div>
      ${grantedItem.enchantPct ? `<div class="item-popup-passive" style="color:var(--accent-2)">✨ Efsun: +%${grantedItem.enchantPct} ${SLOT_MAP[grantedItem.slot].type === "atk" ? "Saldırı" : "Savunma"}</div>` : ""}
      ${getLiveEffectDesc(grantedItem) ? `<div class="item-popup-passive">✨ ${getLiveEffectDesc(grantedItem)}</div>` : ""}
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
// açar (kuşan / hurdaya çevir seçenekleriyle) — mevcut openInventoryModal ile aynı.
export function renderBagGrid() {
  if (!bagGridEl || !S.currentPlayerData) return;
  const items = [];
  for (const s of SLOTS) {
    const equippedId = S.currentPlayerData.equipment?.[s.key]?.id;
    const slotItems = getSlotInventory(s.key).filter(it => it.id !== equippedId);
    items.push(...slotItems);
  }
  const rarityOrder = { efsanevi: 0, nadir: 1, standart: 2 };
  items.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);

  // Boş kareler de gösterilir ki gerçek bir "çanta" gibi görünsün (Metin2'deki gibi).
  const minSlots = Math.max(24, Math.ceil(Math.max(items.length, 1) / 4) * 4);

  let html = items.map(it => `
    <button type="button" class="bag-item r-${it.rarity}" data-slot="${it.slot}" title="${it.name}">
      <span class="bag-slot-icon">${itemIconSvg(it.slot, it.rarity, 30)}</span>
      ${it.upgradeLevel ? `<span class="bi-lvl">+${it.upgradeLevel}</span>` : ""}
    </button>`).join("");
  for (let i = items.length; i < minSlots; i++) {
    html += `<div class="bag-item empty-slot"></div>`;
  }
  bagGridEl.innerHTML = html;

  bagGridEl.querySelectorAll("button[data-slot]").forEach(btn => {
    btn.onclick = () => openInventoryModal(btn.getAttribute("data-slot"));
  });

  const bagSlotCountLabel = document.getElementById("bagSlotCountLabel");
  if (bagSlotCountLabel) bagSlotCountLabel.textContent = `(${minSlots} Slot)`;
}

