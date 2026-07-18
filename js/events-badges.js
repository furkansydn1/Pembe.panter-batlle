import { BOX_COOLDOWN_MS, getScrap } from "./core-config.js";
import { PLAYERS_COL, db, doc, updateDoc } from "./firebase-setup.js";
import { generateLootItemForRarity } from "./item-systems.js";
import { LEGENDARY_ITEMS, SLOTS, TOTAL_ITEM_COUNT } from "./items-data.js";
import { dateStr } from "./map.js";
import { MARKET_DAILY_ITEM_COUNT, MARKET_GOLD_PRICE_RANGE, MARKET_RARITY_WEIGHTS } from "./market.js";
import { S } from "./state.js";

// ============================================================
// ROZETLER
// Tamamen mevcut/kalıcı sayaçlardan türetilir, ayrı bir "kazanıldı" listesi
// tutmaya gerek yok: her rozetin check(data) fonksiyonu, oyuncunun güncel
// verisine bakıp o an hak edilip edilmediğini anlık hesaplar. Böylece geriye
// dönük de (eski oyuncular için) otomatik doğru çalışır.
// ============================================================
export function countDiscoveredLegendary(data) {
  const discovered = new Set(data.discoveredItems || []);
  return LEGENDARY_ITEMS.filter(it => discovered.has(it.name)).length;
}
export function countEquippedLegendary(data) {
  const eq = data.equipment || {};
  return SLOTS.filter(s => eq[s.key] && eq[s.key].rarity === "efsanevi").length;
}
export function collectionPct(data) {
  return Math.floor(((data.discoveredItems || []).length / TOTAL_ITEM_COUNT) * 100);
}

export const BADGES = [
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

  // ---- Hurda biriktirme ----
  { id: "scrap_100", icon: "✨", name: "Hurda Biriktiren", desc: "Aynı anda 100 hurdaya sahip ol.", check: (d) => getScrap(d) >= 100 },
  { id: "scrap_300", icon: "✨", name: "Hurda Zengini", desc: "Aynı anda 300 hurdaya sahip ol.", check: (d) => getScrap(d) >= 300 },
  { id: "scrap_600", icon: "💰", name: "Hurda Kralı", desc: "Aynı anda 600 hurdaya sahip ol.", check: (d) => getScrap(d) >= 600 },

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
// [V2 Faz 6 — DEĞİŞTİ] Önceden tarihe göre deterministik TEK bir küresel
// olay tüm oyuncuları aynı anda etkiliyordu (hashString(dateStr()) ile).
// Artık her oyuncu KENDİ kişisel olayını çekiyor (bkz.
// ensurePersonalDailyEventForToday — tek seferlik gerçek rastgelelik,
// Firestore'a yazılıp gün boyu sabit kalıyor) — "her oyuncuya farklı rastgele özellikler gelsin" isteği için.
// PvP DENGESİ: bir savaşta saldıranın kendi olayı SADECE kendi Saldırısını/
// puan kazancını, savunanın kendi olayı SADECE kendi Savunmasını/şansını
// etkiler (bkz. runAttack içindeki attackerEvent/defenderEvent ayrımı) —
// yani iki oyuncu asla "aynı savaşta farklı küresel çarpanlarla" adaletsiz
// biçimde karşılaşmıyor, her biri sadece kendi payına düşen buff/debuff'ı
// getiriyor. getTodaysEvent(data) parametresiz çağrılırsa (veya data'da
// bugüne ait dailyEventId yoksa) eski tarih-hash yöntemine düşer — geriye
// dönük uyumluluk, sistem hiçbir zaman çökmez.
// Havuz Faz 6'da 12'den ~28'e çıkarıldı: hâlâ hiçbiri tek başına oyunu
// bozacak kadar büyük değil (mevcut aralık: ±%50 puan, ±%15-20 atk/def,
// enerji/XP/box cooldown/pity/Dünya Boss hasarı gibi ek eksenlerde ufak
// oynamalar).
// ============================================================
export const DAILY_EVENTS = [
  { id: "lucky", icon: "🍀", type: "buff", title: "Şanslı Gün",
    desc: "Bugün nadir ve efsanevi eşya düşme ihtimali %50 daha yüksek.",
    legendaryChanceMult: 1.5, rareChanceMult: 1.5, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "dry", icon: "🌪️", type: "nerf", title: "Kurak Gün",
    desc: "Bugün nadir ve efsanevi eşya düşme ihtimali %30 daha düşük.",
    legendaryChanceMult: 0.7, rareChanceMult: 0.7, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "war", icon: "⚔️", type: "buff", title: "Savaş Çılgınlığı",
    desc: "Bugün kazanılan tüm savaş puanları %50 fazla veriliyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1.5, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "fragile_armor", icon: "🛡️", type: "nerf", title: "Kırık Zırh Günü",
    desc: "Bugün tüm savunma güçleri hesaplamada %15 zayıf sayılıyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 0.85, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "power_surge", icon: "💪", type: "buff", title: "Güç Günü",
    desc: "Bugün tüm saldırı güçleri hesaplamada %15 fazla sayılıyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1.15, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "scrap_storm", icon: "✨", type: "buff", title: "Hurda Fırtınası",
    desc: "Bugün eşyaları hurdaya çevirdiğinde 2 kat hurda kazanıyorsun.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 2, boxCooldownMult: 1, pityMult: 1 },
  { id: "precision", icon: "🎯", type: "buff", title: "Kesinlik Günü",
    desc: "Bugün savaşta şansın etkisi azaldı, statlar her zamankinden daha belirleyici.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 0.4, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "chaos", icon: "🌀", type: "nerf", title: "Kaos Günü",
    desc: "Bugün savaşta şansın etkisi arttı, sürprizlere açık ol.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 2, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "slow_boxes", icon: "😴", type: "nerf", title: "Tembellik Günü",
    desc: "Bugün sandık açma süresi 4 yerine 6 saat.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1.5, pityMult: 1 },
  { id: "fast_boxes", icon: "⚡", type: "buff", title: "Hız Günü",
    desc: "Bugün sandık açma süresi 4 yerine 3 saat.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 0.75, pityMult: 1 },
  { id: "compensation", icon: "🍀", type: "buff", title: "Telafi Günü",
    desc: "Bugün şanssızlık telafisi (pity) 2 kat hızlı birikiyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 2 },
  { id: "calm", icon: "🌤️", type: "neutral", title: "Sakin Gün",
    desc: "Bugün özel bir etki yok, her şey normal seyrinde.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },

  // ---- V2 Faz 6: havuz genişletmesi (16 yeni olay) ----
  { id: "energetic", icon: "🔋", type: "buff", title: "Enerjik Gün",
    desc: "Bugün enerjin %40 daha hızlı yenileniyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1, energyRegenMult: 1.4 },
  { id: "sluggish", icon: "🐌", type: "nerf", title: "Uyuşuk Gün",
    desc: "Bugün enerjin %25 daha yavaş yenileniyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1, energyRegenMult: 0.75 },
  { id: "scholar", icon: "📖", type: "buff", title: "Bilgelik Günü",
    desc: "Bugün kazandığın XP %30 fazla.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1, xpMult: 1.3 },
  { id: "distracted", icon: "😵‍💫", type: "nerf", title: "Dağınık Gün",
    desc: "Bugün kazandığın XP %20 az.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1, xpMult: 0.8 },
  { id: "giant_slayer", icon: "🗡️", type: "buff", title: "Dev Avcısı Günü",
    desc: "Bugün Haftalık Dünya Boss'una verdiğin hasar %25 fazla.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1, bossDamageMult: 1.25 },
  { id: "boss_ward", icon: "🐲", type: "nerf", title: "Boss'un Zırhı Günü",
    desc: "Bugün Haftalık Dünya Boss'una verdiğin hasar %15 az.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1, bossDamageMult: 0.85 },
  { id: "boss_frenzy", icon: "🎁", type: "buff", title: "Boss Ganimeti Günü",
    desc: "Bugün Dünya Boss'undan Mitik/Kabus ganimet düşme ihtimalin biraz daha yüksek (yine de çok düşük kalır).",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1, worldBossBonusChanceMult: 1.5 },
  { id: "boss_stingy", icon: "🙅", type: "nerf", title: "Cimri Boss Günü",
    desc: "Bugün Dünya Boss'undan Mitik/Kabus ganimet düşme ihtimalin biraz daha düşük.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1, worldBossBonusChanceMult: 0.5 },
  { id: "quick_recovery", icon: "🌀", type: "buff", title: "Çabuk Toparlanma Günü",
    desc: "Bugün enerjin %25 hızlı yenileniyor, sandık açma süren de biraz kısaldı.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 0.9, pityMult: 1, energyRegenMult: 1.25 },
  { id: "heavy_grind", icon: "🥱", type: "nerf", title: "Zahmetli Gün",
    desc: "Bugün sandık açma süren biraz uzadı, enerjin de biraz yavaş yenileniyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1.25, pityMult: 1, energyRegenMult: 0.9 },
  { id: "focused_mind", icon: "🧘", type: "buff", title: "Odaklanma Günü",
    desc: "Bugün savaşta şansın etkisi biraz azaldı, kazandığın puanlar da hafif fazla.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1.1, attackMult: 1, defenseMult: 1, varianceMult: 0.7, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "reckless", icon: "🎲", type: "neutral", title: "Pervasız Gün",
    desc: "Bugün saldırı gücün %10 fazla ama savaşta şansın etkisi de arttı — sürpriz sonuçlara açık ol.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1.1, defenseMult: 1, varianceMult: 1.5, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "champion_training", icon: "🏅", type: "buff", title: "Şampiyon Antrenmanı",
    desc: "Bugün kazandığın savaş puanı %25, XP'n de %15 fazla.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1.25, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1, xpMult: 1.15 },
  { id: "cursed_fog", icon: "🌫️", type: "nerf", title: "Lanetli Sis Günü",
    desc: "Bugün nadir ve efsanevi eşya düşme ihtimalin %40 daha düşük.",
    legendaryChanceMult: 0.6, rareChanceMult: 0.6, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "blessed_hunt", icon: "🌟", type: "buff", title: "Kutsanmış Av Günü",
    desc: "Bugün nadir eşya düşme ihtimalin %40, efsanevi %60 daha yüksek.",
    legendaryChanceMult: 1.6, rareChanceMult: 1.4, pointsMult: 1, attackMult: 1, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "iron_focus", icon: "🧱", type: "buff", title: "Demir Odak Günü",
    desc: "Bugün savunma gücün %15 fazla sayılıyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 1, defenseMult: 1.15, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 },
  { id: "brittle_gear", icon: "🔩", type: "nerf", title: "Kırılgan Ekipman Günü",
    desc: "Bugün saldırı gücün %12 az sayılıyor.",
    legendaryChanceMult: 1, rareChanceMult: 1, pointsMult: 1, attackMult: 0.88, defenseMult: 1, varianceMult: 1, scrapMult: 1, boxCooldownMult: 1, pityMult: 1 }
];

export function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}
// [V2 Faz 6] data verilirse VE data'da bugüne ait (dailyEventDate === bugün)
// bir dailyEventId varsa, o oyuncunun KENDİ kişisel olayını döndürür. Aksi
// halde (data yok, henüz ensurePersonalDailyEventForToday hiç çalışmadı,
// veya eski/geçersiz bir id varsa) eski tarih-hash yöntemine düşer — geriye
// dönük uyumluluk, hiçbir çağrı noktası çökmez.
export function getTodaysEvent(data) {
  if (data && data.dailyEventDate === dateStr() && data.dailyEventId) {
    const found = DAILY_EVENTS.find(e => e.id === data.dailyEventId);
    if (found) return found;
  }
  const idx = hashString(dateStr()) % DAILY_EVENTS.length;
  return DAILY_EVENTS[idx];
}
export function getEffectiveBoxCooldown() {
  return BOX_COOLDOWN_MS * (getTodaysEvent(S.currentPlayerData).boxCooldownMult || 1);
}

// Bugün için henüz kişisel bir Günün Olayı atanmadıysa (yeni gün), bu
// oyuncuya ÖZEL, diğer oyunculardan BAĞIMSIZ, gerçek (tarih-hash değil)
// rastgelelikle bir olay seçip Firestore'a yazar (ensureDailyQuestsForToday
// gibi diğer "ensure*ForToday" fonksiyonlarıyla aynı desen).
export async function ensurePersonalDailyEventForToday(data) {
  const today = dateStr();
  if (data.dailyEventDate === today && data.dailyEventId) return;
  const event = pick(DAILY_EVENTS);
  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
    dailyEventDate: today,
    dailyEventId: event.id
  });
}

export function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
export function genItemId() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

// [Faz 4 erken uygulama — kullanıcı isteği üzerine]: Dünyadan/canavardan (Günlük
// Sandık) düşen Nadir ve Efsanevi ihtimali TAMAMEN SIFIRLANDI. Sandık artık sadece
// Hurda ve Sıradan eşya veriyor. Pity sabitleri (RARE_PITY_*, LEGENDARY_PITY_*) ve
// BASE_RARE_CHANCE/BASE_LEGENDARY_CHANCE bilerek silinmedi — kod tabanında referans
// olarak duruyorlar ama aşağıdaki early-return yüzünden artık hiçbir etkileri yok.
// Nadir/Efsanevi'ye ulaşmanın TEK yolu artık Market sekmesindeki "Nadir/Efsanevi
// Sandık" kalıcı satın alımları (buyNadirChestBtn/buyEfsaneviChestBtn, Altın
// karşılığı forcedRarity) — eskiden Kutu sekmesinde Hurda karşılığı bir eşdeğeri
// vardı, kullanıcı isteğiyle tamamen kaldırıldı.
export function rollRarity(pityRare, pityLegendary, event) {
  return "standart";
}

// Aynı slotun (örn. hep Kılıç) üst üste çıkmasını engelleyen ağırlıklı slot seçimi.
export function pickSlotWeighted(recentSlots) {
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

export function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Günlük Market'in kendi (Kutu'dan bağımsız) rarity ağırlığı — bkz. MARKET_RARITY_WEIGHTS.
export function rollMarketRarity() {
  const r = Math.random() * 100;
  if (r < MARKET_RARITY_WEIGHTS.efsanevi) return "efsanevi";
  if (r < MARKET_RARITY_WEIGHTS.efsanevi + MARKET_RARITY_WEIGHTS.nadir) return "nadir";
  return "standart";
}

// 5 farklı slottan (SLOTS'ta 9 slot var, tekrar yok ki aynı gün 2 kılıç
// görünmesin), her biri gerçek/görünür statlarla, gerçek eşya isim havuzundan
// (generateLootItemForRarity → şimdiki STANDARD_NAMES/RARE_NAMES/LEGENDARY_ITEMS)
// üretilir. Firestore'a yazılıp günün geri kalanında SABİT kalması gerektiği
// için burada sadece üretim var; kalıcılaştırma ensureDailyMarketForToday()'de.
export function rollDailyMarketItems() {
  const slots = shuffleArray(SLOTS.map(s => s.key)).slice(0, MARKET_DAILY_ITEM_COUNT);
  return slots.map(slot => {
    const rarity = rollMarketRarity();
    const item = generateLootItemForRarity(slot, rarity);
    const [min, max] = MARKET_GOLD_PRICE_RANGE[rarity];
    const price = min + Math.round(Math.random() * (max - min));
    return { ...item, price, purchased: false };
  });
}

