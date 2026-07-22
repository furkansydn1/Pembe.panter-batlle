import { BASE_HP } from "./battle.js";
import { BASE_ATTACK, BASE_DEFENSE, BASE_LEGENDARY_CHANCE, BASE_RARE_CHANCE, LEVEL_XP_BASE, LEVEL_XP_GROWTH, getScrap } from "./core-config.js";
import { genItemId, getTodaysEvent, pick, randInt } from "./events-badges.js";
import { PLAYERS_COL, db, doc, updateDoc } from "./firebase-setup.js";
import { getSlotInventory } from "./inventory.js";
import { LEGENDARY_BY_SLOT, RARE_NAMES, SLOTS, SLOT_MAP, STANDARD_NAMES } from "./items-data.js";
import { emptyEquipment } from "./map.js";
import { S } from "./state.js";

// ============================================================
// İTEM STAT ARALIKLARI (V2 Faz 2)
// Önceden sadece "nadir" için vardı (RARE_STAT_MIN/MAX, rollRareStat).
// Artık TÜM tier'ler (efsanevi dahil — LEGENDARY_ITEMS'taki sabit atk/def
// alanları oyun içi hesaplamada KULLANILMIYOR, sadece tarihsel referans)
// aynı genel mekanizmadan RNG stat çekiyor:
// - "primary": eşyanın ana statı (slot.type'a göre atk ya da def)
// - "secondary": karşı statı, çok daha küçük bir katkı
// ÜST SINIRI (max) yakalama ihtimali her tier'de sabit ~%20 tutuluyor;
// böylece aynı tier/isimdeki iki eşya bile birbirinden güç olarak
// ayrışıyor, en güçlü versiyonu yakalamak şanslı bir an oluyor.
// ============================================================
export const TIER_STAT_RANGE = {
  standart: [3, 8],
  nadir: [8, 18],
  efsanevi: [20, 32],
  mitik: [34, 50],
  kabus: [52, 75]
};
export const TIER_SECONDARY_STAT_RANGE = {
  standart: [0, 2],
  nadir: [1, 4],
  efsanevi: [2, 6],
  mitik: [4, 9],
  kabus: [6, 14]
};
export const TIER_STAT_MAX_CHANCE = 0.20;
export function rollTierStat(rarity) {
  const [min, max] = TIER_STAT_RANGE[rarity] || [0, 0];
  if (Math.random() < TIER_STAT_MAX_CHANCE) return max;
  return randInt(min, max - 1);
}
export function rollTierSecondaryStat(rarity) {
  const [min, max] = TIER_SECONDARY_STAT_RANGE[rarity] || [0, 0];
  return randInt(min, max);
}

// ============================================================
// EFSUN (ENCHANT) SİSTEMİ
// Her eşya, düştüğü anda nadirliğine göre değişen oranda ekstra bir
// "efsun" bonusu KAZANABİLİR. Bu bonus, eşyanın ana statına (saldırı tipi
// eşyalarda saldırıya, savunma tipi eşyalarda savunmaya) yüzdesel olarak
// eklenir ve eşyanın nihai atk/def değerine gömülür. Böylece aynı isimli
// iki eşya bile efsun farkından dolayı hafif farklı güç verebilir.
//
// V2 Faz 2: önceden HER eşya %100 ihtimalle efsun alıyordu, sadece yüzdesi
// nadirliğe göre değişiyordu. Artık efsunun TUTMA İHTİMALİ de tier'e bağlı
// (ENCHANT_CHANCE_BY_RARITY): Sıradan'da neredeyse hiç çıkmaz, tier
// yükseldikçe artar, Kabus'ta garanti (%100) tutar. Tutmazsa enchantPct 0
// döner ve eşyanın statı hiç değişmez (bkz. applyEnchant).
// ============================================================
export const ENCHANT_CHANCE_BY_RARITY = {
  standart: 0.08,
  nadir: 0.35,
  efsanevi: 0.70,
  mitik: 0.92,
  kabus: 1.00
};
export const ENCHANT_PCT_RANGE = {
  standart: [1, 3],
  nadir: [5, 9],
  efsanevi: [12, 18],
  mitik: [20, 28],
  kabus: [30, 40]
};
export function rollEnchantPct(rarity) {
  const chance = ENCHANT_CHANCE_BY_RARITY[rarity] ?? 0;
  if (Math.random() >= chance) return 0; // efsun bu sefer tutmadı
  const [min, max] = ENCHANT_PCT_RANGE[rarity] || [0, 0];
  return randInt(min, max);
}

// Kutudan çıkma şansı gösterimi için (temel oranlar; günün olayı ve pity
// bunu anlık değiştirebilir ama envanterde gösterilen değer temel orandır).
export const RARITY_CHANCE_LABELS = {
  standart: "~%88",
  nadir: `~%${BASE_RARE_CHANCE}`,
  efsanevi: `~%${BASE_LEGENDARY_CHANCE}`
};
// V2 Faz 2: rarity sistemi 3 tier'den 5 tier'e çıkarıldı. İç anahtar isimleri
// ("standart" dahil) mevcut Firestore verisiyle (players.*.items[].rarity)
// geriye dönük uyumluluk için DEĞİŞTİRİLMEDİ — sadece iki yeni tier eklendi.
// RARITY_ORDER, düşükten yükseğe sıralamayı temsil eder (gelecekte sıralama/
// karşılaştırma mantığı için kullanılabilir).
export const RARITY_ORDER = ["standart", "nadir", "efsanevi", "mitik", "kabus"];
export const RARITY_LABELS_TR = {
  standart: "Standart",
  nadir: "Nadir",
  efsanevi: "Efsanevi",
  mitik: "Mitik",
  kabus: "Kabus"
};
// V2 Faz 2 (madde 4): 5 tier için ikon PLACEHOLDER'ı — gerçek/özel çizim
// yerine düz emoji kullanılıyor. UI'da rarity gösterilen her yerde (rozet,
// materyal paneli, ileride drop-rate satırı vb.) aynı ikonlar kullanılmalı
// ki tutarlı kalsın. Gerçek sanat eserleri/sprite'lar gelince sadece bu
// haritayı güncellemek yeterli.
export const RARITY_ICONS = {
  standart: "⚪",
  nadir: "🔷",
  efsanevi: "🌟",
  mitik: "🔮",
  kabus: "💀"
};

// ============================================================
// EŞYA SEVİYE GEREKSİNİMİ (Level Requirement)
// Her nadirlik tier'i, KUŞANILABİLMESİ için oyuncunun asgari bir seviyeye
// ulaşmasını gerektirir. Amaç: yüksek tier eşyaların (özellikle şanslı bir
// erken Mitik/Kabus düşüşünün) düşük seviyeli bir oyuncuyu anında aşırı
// güçlendirip erken oyunu dengesizleştirmesini engellemek.
// SADECE kuşanma (equip) etkilenir — hurdaya çevirme, Pazar'a çıkarma,
// yükseltme (+basma) gibi diğer işlemler seviyeden bağımsız serbest kalır
// (düşük seviyeli bir oyuncu bulduğu/kutudan çıkan yüksek tier eşyayı
// satabilir ya da hurdaya çevirebilir, sadece henüz üstüne giyemez).
// ============================================================
export const LEVEL_REQUIREMENT_BY_RARITY = {
  standart: 1,
  nadir: 15,
  efsanevi: 35,
  mitik: 50,
  kabus: 70
};
// Bir oyuncunun bir eşyayı kuşanıp kuşanamayacağını kontrol eder — hem
// UI'da "Kuşan" butonunu aktif/pasif yapmak hem de equipItem() / satın
// alma akışlarındaki gerçek işlemden ÖNCE doğrulamak için kullanılır.
export function canEquipItem(item, playerData) {
  if (!item) return { ok: false, reason: "Eşya yok.", req: 1 };
  const req = LEVEL_REQUIREMENT_BY_RARITY[item.rarity] ?? 1;
  const level = playerData?.level || 1;
  if (level < req) {
    return { ok: false, reason: `Bu eşyayı kuşanmak için Seviye ${req} gerekli (sen Seviye ${level}'sin).`, req };
  }
  return { ok: true, req };
}

// ============================================================
// KİTAP (BOOK) MATERYALİ (V2 Faz 2, madde 2/3)
// Hurda gibi stack'lenen bir tüketilebilir materyal — eşya değil. Rarity'e
// PARALEL 5 kademeli (Sıradan Kitap ... Kabus Kitabı), eşya yükseltme
// (+basma) sisteminde Hurda'nın yanında ikinci kaynak olarak kullanılır.
// [V2 — henüz uygulanmadı, Faz 3]: gerçek harita/canavar drop mantığı yok.
// Şu an için tek giriş yolu adminGrantBooks() (aşağıda, test amaçlı).
// ============================================================
export const BOOK_TIER_NAMES = {
  standart: "Sıradan Kitap",
  nadir: "Nadir Kitap",
  efsanevi: "Efsanevi Kitap",
  mitik: "Mitik Kitap",
  kabus: "Kabus Kitabı"
};
// Task 4: kitap ikonu da placeholder — gerçek sprite Faz 3'te (harita drop
// sistemiyle birlikte) gelecek.
export const BOOK_TIER_ICONS = {
  standart: "📘",
  nadir: "📗",
  efsanevi: "📙",
  mitik: "📕",
  kabus: "📓"
};
export function emptyBooks() {
  return { standart: 0, nadir: 0, efsanevi: 0, mitik: 0, kabus: 0 };
}
// getScrap() ile aynı mantık: eski oyuncu dokümanlarında "books" alanı hiç
// yoktur (bu güncellemeden önce oluşturuldular) — bu yüzden okurken hep bu
// fonksiyon kullanılır, data.books doğrudan okunmaz.
export function getBooks(data) {
  return (data && data.books) || emptyBooks();
}

// Efsun bonusunu, eşyanın ana statına (slot tipine göre atk ya da def)
// yüzdesel olarak ekler ve son atk/def değerlerini döndürür.
export function applyEnchant(slotInfo, atk, def, rarity) {
  const enchantPct = rollEnchantPct(rarity);
  if (slotInfo.type === "atk") {
    atk = Math.round(atk * (1 + enchantPct / 100));
  } else {
    def = Math.round(def * (1 + enchantPct / 100));
  }
  return { atk, def, enchantPct };
}

// ============================================================
// HIZ / KRİTİK / CAN BONUS STAT (şansa bağlı)
// Her eşya, düştüğü anda %BONUS_STAT_CHANCE ihtimalle EK olarak Hız, Kritik
// ya da Can statlarından SADECE BİRİNİ kazanır (üçü asla birlikte gelmez).
// Slot tipinden (atk/def) bağımsızdır. ÖNEMLİ (AS stacking kilidi): bu bonus
// her zaman eşyanın esas Saldırı/Savunma değerinin YANINDA gelir — yani
// "Saldırı'dan feragat edip sadece Hız'a yatırım yapma" seçeneği hiç yoktur,
// bu tamamen bir RNG ikramiyesidir, oyuncu tarafından seçilemez.
// ============================================================
export const BONUS_STAT_CHANCE = 0.25; // eşyanın bonus stat alma ihtimali
export const BONUS_STAT_TYPES = ["spd", "crit", "hp"];
export const BONUS_STAT_RANGE = { // Hız ve Kritik için
  standart: [3, 6],
  nadir: [6, 12],
  efsanevi: [12, 20]
};
export const HP_BONUS_RANGE = { // Can, ölçeği farklı olduğu için ayrı aralık
  standart: [15, 30],
  nadir: [30, 55],
  efsanevi: [55, 90]
};
export function rollBonusStat(rarity) {
  if (Math.random() >= BONUS_STAT_CHANCE) return { spd: 0, crit: 0, hp: 0 };
  const type = pick(BONUS_STAT_TYPES);
  if (type === "hp") {
    const [min, max] = HP_BONUS_RANGE[rarity] || [0, 0];
    return { spd: 0, crit: 0, hp: randInt(min, max) };
  }
  const [min, max] = BONUS_STAT_RANGE[rarity] || [0, 0];
  const val = randInt(min, max);
  return type === "spd" ? { spd: val, crit: 0, hp: 0 } : { spd: 0, crit: val, hp: 0 };
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
export const MINOR_TRAIT_POOL = [
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
    desc: (pct) => `Kelle Avcısı ödülünü kaparsan %${pct} fazla hurda kazandırır.` },
  { id: "scrap_boost", icon: "✨", name: "Hurdalı",
    range: { standart: [8, 15], nadir: [15, 25] },
    desc: (pct) => `Bu eşyayı hurdaya çevirirsen %${pct} fazla hurda verir.` }
];

// Efsanevi eşyalar bu sistemi kullanmadığı için sadece standart/nadir için çağrılır.
export function rollMinorTrait(rarity) {
  const def = pick(MINOR_TRAIT_POOL);
  const [min, max] = def.range[rarity];
  const pct = randInt(min, max);
  return { id: def.id, icon: def.icon, name: def.name, pct, desc: def.desc(pct) };
}

// Bir oyuncunun kuşandığı TÜM eşyalar arasında, belirli bir ufak pasif
// özelliğe sahip olanların yüzdelerini toplar (birden fazla eşyada aynı
// özellik varsa üst üste biner, ama her biri zaten küçük olduğu için
// toplamı da makul kalır).
export function getMinorTraitBonusPct(equipment, traitId) {
  let total = 0;
  for (const s of SLOTS) {
    const item = equipment?.[s.key];
    if (item?.minorTrait?.id === traitId) total += item.minorTrait.pct;
  }
  return total;
}

// ============================================================
// EFSANEVİ PASİF ÖZELLİK HAVUZU (V3 — eski sabit "effect" sistemi kaldırıldı)
// ------------------------------------------------------------
// ESKİ SİSTEM: her efsanevi eşyanın LEGENDARY_ITEMS'ta SABİT, %100 garanti
// bir savaş etkisi (effect/desc) vardı — kullanıcı isteğiyle TAMAMEN
// kaldırıldı (bkz. items-data.js, LEGENDARY_ITEMS artık effect/desc içermiyor).
// YENİ SİSTEM: garanti DEĞİL — her efsanevi eşya sadece %EFSANEVI_TRAIT_CHANCE
// ihtimalle bu havuzdan TEK bir pasif kazanır (tutmazsa efsaneviTrait: null,
// eşyanın statı hiç değişmez). Tutarsa büyüklüğü EFSANEVI_TRAIT_PCT_RANGE
// içinde (10-15) kendi içinde roll'lanır. Havuz, oyunun güncel yapısına göre
// seçildi: EXP (level sistemi), Hurda/Altın (MAP'in yeni ekonomisi — MAP şu an
// bağımsız bir prototip olsa da ileride bağlanabilir, isimlendirme buna göre
// hazır), saldırı hızı/kritik/can (mevcut spd/crit/hp bonus stat sistemiyle
// AYNI ölçekte ama ayrı bir veri alanında, üst üste binmesin/ezmesin diye).
// DENGE NOTU: mitik/kabus'un EXCLUSIVE_BONUS_POOL'u hâlâ %100 garanti ve daha
// büyük yüzdeli (bkz. yukarısı) — efsanevi bilerek hem daha düşük ihtimalli
// (%30) hem daha düşük tavanlı (15) tutuldu ki üstündeki 2 tier'e göre hâlâ
// daha zayıf hissettirsin, power creep yaratmasın.
// ============================================================
export const EFSANEVI_TRAIT_CHANCE = 0.30; // %30 ihtimalle aşağıdaki havuzdan biri gelir
export const EFSANEVI_TRAIT_PCT_RANGE = [10, 15]; // tutarsa büyüklük bu aralıkta roll'lanır
export const EFSANEVI_TRAIT_POOL = [
  { id: "exp_boost", icon: "📚", name: "Bilgelik", appliesTo: "any",
    desc: (pct) => `Kazanılan EXP'yi %${pct} artırır.` },
  { id: "attack_speed", icon: "⚡", name: "Hızlı Eller", appliesTo: "atk",
    desc: (pct) => `Saldırı hızını %${pct} artırır.` },
  { id: "crit_chance", icon: "🎯", name: "Keskin Nişancı", appliesTo: "atk",
    desc: (pct) => `Kritik vuruş şansını %${pct} artırır.` },
  { id: "extra_hp", icon: "❤️", name: "Dayanıklılık", appliesTo: "def",
    desc: (pct) => `Maksimum Canı %${pct} artırır.` },
  { id: "scrap_find", icon: "🔩", name: "Hurda Avcısı", appliesTo: "any",
    desc: (pct) => `Kazanılan Hurda miktarını %${pct} artırır.` },
  { id: "gold_find", icon: "🪙", name: "Definebilir", appliesTo: "any",
    desc: (pct) => `Kazanılan Altın miktarını %${pct} artırır.` }
];
// slotInfo verilirse (type: "atk"/"def") sadece o slota UYGUN pasifler arasından
// seçer (örn. bir kalkana "Saldırı Hızı" gelmez) — "any" olanlar her slotta uygun.
export function rollEfsaneviTrait(slotInfo) {
  if (Math.random() >= EFSANEVI_TRAIT_CHANCE) return null;
  const eligible = EFSANEVI_TRAIT_POOL.filter(t => t.appliesTo === "any" || t.appliesTo === slotInfo?.type);
  const pool = eligible.length ? eligible : EFSANEVI_TRAIT_POOL;
  const def = pick(pool);
  const [min, max] = EFSANEVI_TRAIT_PCT_RANGE;
  const pct = randInt(min, max);
  return { id: def.id, icon: def.icon, name: def.name, pct, desc: def.desc(pct) };
}

// ============================================================
// EFSANEVİ-ÜSTÜ ÖZEL BONUSLAR (V2 Faz 2 — SADECE Mitik ve Kabus)
// ÇOK ÖNEMLİ: bu, MINOR_TRAIT_POOL'dan (standart/nadir) ve ENCHANT_PCT_RANGE
// (genel efsun) sisteminden BİLEREK ayrı, kendi veri alanına ("exclusiveBonus")
// sahip bir havuz. Alt tier'lerde (standart/nadir/efsanevi) bu bonus tipleri
// ASLA çıkmaz — sadece Mitik ve Kabus eşyalara özgü, üst tier'i gerçekten
// farklı hissettiren bonuslar burada tutulur. Genel efsun havuzuyla karıştırma.
// ============================================================
export const EXCLUSIVE_BONUS_POOL = [
  { id: "monster_power", icon: "🐲", name: "Canavarlara Karşı Güç",
    range: { mitik: [10, 18], kabus: [20, 35] },
    desc: (pct) => `Dünya/canavar hedeflerine karşı savaşta gücünü %${pct} artırır.` },
  { id: "lucky_loot", icon: "🎁", name: "Şanslı Yağma",
    range: { mitik: [5, 10], kabus: [12, 20] },
    desc: (pct) => `Kutu/canavar drop'unda %${pct} ihtimalle çift eşya düşürür.` },
  { id: "nightmare_ward", icon: "💀", name: "Kabus Zırhı",
    range: { mitik: [15, 25], kabus: [30, 50] },
    desc: (pct) => `Savunmada kaybedersen %${pct} ihtimalle hiç puan kaybetmezsin.` }
];
// Sadece mitik/kabus için çağrılır; alt tier'lerde her zaman null döner.
export function rollExclusiveBonus(rarity) {
  if (rarity !== "mitik" && rarity !== "kabus") return null;
  const def = pick(EXCLUSIVE_BONUS_POOL);
  const [min, max] = def.range[rarity];
  const pct = randInt(min, max);
  return { id: def.id, icon: def.icon, name: def.name, pct, desc: def.desc(pct) };
}

// ============================================================
// SET BONUSU SİSTEMİ (Task 6)
// Belirli eşyalar bir "set"e ait olabilir (item.set alanı, varsayılan null).
// Aynı sete ait yeterli parça kuşanıldığında ekstra atk/def yüzdesi devreye
// girer (kademeli: 2 parça / tam set gibi). ÖNEMLİ: şu an hiçbir
// LEGENDARY_ITEMS girdisi bir sete ATANMADI — bu saf içerik/dengeleme kararı
// (hangi eşya hangi sete ait) ayrı bir görev; burada sadece mekanizmanın
// kendisi kuruldu. ITEM_SETS'e yeni bir set eklemek için tek yapman gereken
// aşağıya bir anahtar eklemek + ilgili eşyalara set: "anahtarAdi" vermek.
// ============================================================
export const ITEM_SETS = {
  // V3: 9'ar parçalık (her slotta 1 set parçası) iki gerçek set. Kademeler
  // 3/6/9 parça; yüzdeler dengeleme kararı, serbestçe ayarlanabilir.
  ejderha_hukumdari: {
    name: "Ejderha Hükümdarı",
    icon: "🐉",
    bonuses: [
      { count: 3, atkPct: 6, defPct: 6, desc: "3 parça: Saldırı ve Savunma +%6" },
      { count: 6, atkPct: 14, defPct: 14, desc: "6 parça: Saldırı ve Savunma +%14" },
      { count: 9, atkPct: 25, defPct: 25, desc: "9 parça (tam set): Saldırı ve Savunma +%25" }
    ]
  },
  kiyamet_habercisi: {
    name: "Kıyamet Habercisi",
    icon: "💀",
    bonuses: [
      { count: 3, atkPct: 8, defPct: 8, desc: "3 parça: Saldırı ve Savunma +%8" },
      { count: 6, atkPct: 18, defPct: 18, desc: "6 parça: Saldırı ve Savunma +%18" },
      { count: 9, atkPct: 32, defPct: 32, desc: "9 parça (tam set): Saldırı ve Savunma +%32" }
    ]
  }
};
// Kuşanılan ekipmandaki aktif set bonuslarının listesini döndürür (her set
// için sadece erişilen en yüksek kademe sayılır, kümülatif değil).
export function getActiveSetBonuses(equipment) {
  const counts = {};
  for (const s of SLOTS) {
    const item = equipment?.[s.key];
    if (item?.set) counts[item.set] = (counts[item.set] || 0) + 1;
  }
  const active = [];
  for (const setKey of Object.keys(counts)) {
    const setDef = ITEM_SETS[setKey];
    if (!setDef) continue;
    let best = null;
    for (const b of setDef.bonuses) {
      if (counts[setKey] >= b.count) best = b;
    }
    if (best) active.push({ setKey, setName: setDef.name, icon: setDef.icon, count: counts[setKey], ...best });
  }
  return active;
}
// Tüm aktif setlerin atk/def yüzdelerini toplar (computeStatsFromEquipment içinde kullanılır).
export function getSetBonusPct(equipment) {
  return getActiveSetBonuses(equipment).reduce((acc, b) => ({
    atkPct: acc.atkPct + (b.atkPct || 0),
    defPct: acc.defPct + (b.defPct || 0)
  }), { atkPct: 0, defPct: 0 });
}

// ============================================================
// EŞYA YÜKSELTME ("+ BASMA") SİSTEMİ (V2 Faz 2, madde 2)
// Hurda + Kitap (item'ın kendi rarity'sine denk kitap tier'i) harcayarak
// bir eşyayı +1'den +MAX_UPGRADE_LEVEL'e kadar güçlendirir. Her seviye
// eşyanın TABAN atk/def'ine (upgradeLevel=0 anındaki hali — baseAtk/baseDef
// alanında saklanır) sabit bir yüzde ekler; böylece art arda yükseltmelerde
// yuvarlama hatası birikmez (her sefer aynı tabandan hesaplanır).
//
// GÜÇ DENGESİ TABLOSU (UPGRADE_HURDA_BASE_COST + UPGRADE_COST_MULTIPLIER +
// UPGRADE_BOOK_COST):
// Hurda maliyeti hem tier'e (Sıradan ucuz, Kabus pahalı) hem hedef seviyeye
// göre ölçeklenir. +1'den +2'ye geçiş hâlâ ucuzken (multiplier 1→3), +2'den
// itibaren çarpan HIZLA büyüyor (kademeli ama dik bir eğri — üstel gibi
// davranıyor, sabit oranlı artış DEĞİL). Kitap maliyeti de aynı mantıkla
// +2'den sonra her seviyede artık artıyor (eskiden 3 seviyede bir +1'di).
// Tam +10 bir eşya taban gücünün %60 fazlasını verir (bu değişmedi,
// UPGRADE_PCT_PER_LEVEL sabit kaldı — sadece MALİYET zorlaştı).
// ============================================================
export const MAX_UPGRADE_LEVEL = 9;
export const UPGRADE_PCT_PER_LEVEL = 6; // her seviye +%6 (taban üstünden, kümülatif değil)
export const UPGRADE_HURDA_BASE_COST = {
  standart: 4,
  nadir: 10,
  efsanevi: 22,
  mitik: 40,
  kabus: 70
};
// Hedef seviyeye göre Hurda çarpanı. +1 hâlâ kolay (1x), +2'den itibaren
// çarpan her basamakta ÇOK belirgin şekilde büyüyor (agresif üstel eğri —
// +9'a ulaşmak artık gerçek bir "endgame" hedefi).
export const UPGRADE_COST_MULTIPLIER = {
  1: 1,
  2: 4,
  3: 9,
  4: 16,
  5: 28,
  6: 48,
  7: 80,
  8: 130,
  9: 200
};
// Hedef seviyeye göre gereken Kitap sayısı (rarity'nin kendi tier'inden).
// +2'den itibaren her seviyede belirgin şekilde artıyor.
export const UPGRADE_BOOK_COST = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 7,
  6: 10,
  7: 14,
  8: 19,
  9: 25
};

// ============================================================
// + BASMA BAŞARI ŞANSI (kademeli risk)
// Sadece +1 garanti (%100). +2'den itibaren şans her seviyede düşer ve
// üst seviyelerde gerçek bir risk hâline gelir (+9'a basmak artık %10
// şansla bir kumar). Anahtar = ULAŞILMAYA ÇALIŞILAN seviye (hedef seviye),
// değer = başarı olasılığı (0-1 arası). Başarısız olursa harcanan Hurda +
// Kitap YİNE DE düşer, eşya sadece bir sonraki seviyeye geçmez (bkz.
// upgradeItem). Bu tablo saf dengeleme kararı — sayıları değiştirmek
// istersen sadece burayı düzenlemen yeterli, başka hiçbir yeri
// değiştirmene gerek yok.
// ============================================================
export const UPGRADE_SUCCESS_CHANCE = {
  1: 1.00,
  2: 0.95,
  3: 0.85,
  4: 0.70,
  5: 0.55,
  6: 0.40,
  7: 0.28,
  8: 0.18,
  9: 0.10
};
export function getUpgradeSuccessChance(targetLevel) {
  return UPGRADE_SUCCESS_CHANCE[targetLevel] ?? 1;
}
// Bir sonraki seviyeye geçmenin maliyetini döndürür (Hurda + hangi tier'den
// kaç Kitap gerektiği). Hem Hurda hem Kitap artık ULAŞILMAYA ÇALIŞILAN
// (hedef) seviyeye göre UPGRADE_COST_MULTIPLIER / UPGRADE_BOOK_COST
// tablolarından okunuyor — +2'den itibaren belirgin şekilde dikleşiyor.
export function getUpgradeCost(item) {
  const level = item.upgradeLevel || 0;
  const targetLevel = level + 1;
  const baseHurda = UPGRADE_HURDA_BASE_COST[item.rarity] || UPGRADE_HURDA_BASE_COST.standart;
  const hurdaCost = Math.round(baseHurda * (UPGRADE_COST_MULTIPLIER[targetLevel] ?? targetLevel));
  const bookCost = UPGRADE_BOOK_COST[targetLevel] ?? (1 + Math.floor(level / 3));
  return { hurdaCost, bookCost, bookTier: item.rarity };
}
// Bir oyuncunun bir eşyayı yükseltip yükseltemeyeceğini kontrol eder; hem
// UI'da butonu aktif/pasif yapmak hem de gerçek işlemden önce doğrulamak
// için kullanılır.
export function canUpgradeItem(item, playerData) {
  if (!item) return { ok: false, reason: "Eşya yok." };
  const level = item.upgradeLevel || 0;
  if (level >= MAX_UPGRADE_LEVEL) return { ok: false, reason: `Bu eşya zaten maksimum seviyede (+${MAX_UPGRADE_LEVEL}).` };
  const { hurdaCost, bookCost, bookTier } = getUpgradeCost(item);
  const scrap = getScrap(playerData);
  const books = getBooks(playerData);
  if (scrap < hurdaCost) return { ok: false, reason: `Yetersiz hurda (gerekli: ${hurdaCost}).` };
  if ((books[bookTier] || 0) < bookCost) return { ok: false, reason: `Yetersiz ${BOOK_TIER_NAMES[bookTier]} (gerekli: ${bookCost}, mevcut: ${books[bookTier] || 0}).` };
  return { ok: true, hurdaCost, bookCost, bookTier };
}
// SAF hesaplama: eşyanın yükseltilmiş halini döndürür, hiçbir yan etkisi
// (Firestore yazma, Hurda/Kitap düşme) yoktur — bkz. upgradeItem().
export function applyUpgradeToItem(item) {
  const level = (item.upgradeLevel || 0) + 1;
  const baseAtk = item.baseAtk ?? item.atk;
  const baseDef = item.baseDef ?? item.def;
  const mult = 1 + (level * UPGRADE_PCT_PER_LEVEL) / 100;
  return {
    ...item,
    baseAtk, baseDef,
    upgradeLevel: level,
    atk: Math.round(baseAtk * mult),
    def: Math.round(baseDef * mult)
  };
}
// Gerçek Firestore işlemi: maliyeti doğrular, eşyayı günceller (envanterde
// ve kuşanılıysa ekipmanda), Hurda/Kitap düşer, atk/def toplamlarını
// yeniden hesaplar. equipItem()/disenchantItem() ile aynı basit updateDoc
// kalıbını izler (bu, oyuncunun SADECE kendi verisini değiştirdiği,
// çakışma riski olmayan bir işlem — bounty/oracle gibi tx gerekmiyor).
// Dönüş değeri: { success, item, targetLevel, chance } — inventory.js bu
// objeyi başarı/başarısızlık ekranını göstermek için kullanır. Doğrulama
// hataları (eşya yok / kaynak yetersiz) hâlâ alert() ile gösterilip null
// döner — bunlar zaten kaynak harcanmadan önceki kontroller, bir "sonuç
// ekranı" gerektirmiyor.
export async function upgradeItem(slot, itemId) {
  if (!S.currentPlayerData) return null;
  // [BUG FIX] Kuşanılı eşya envanter dizisinde DEĞİL (equipment'ta) — bu yüzden
  // getSlotInventory'de bulunamıyordu ve kuşanılı eşyaya "+Basma"da "bulunamadı"
  // hatası çıkıyordu. Önce envanterde ara, yoksa kuşanılı slota düş. Fonksiyonun
  // devamı (isEquipped → equipment güncelleme) zaten kuşanılıyı yükseltmeyi destekliyor.
  let target = getSlotInventory(slot).find(it => it.id === itemId);
  if (!target && S.currentPlayerData.equipment?.[slot]?.id === itemId) {
    target = S.currentPlayerData.equipment[slot];
  }
  if (!target) { alert("Eşya bulunamadı."); return null; }
  const check = canUpgradeItem(target, S.currentPlayerData);
  if (!check.ok) { alert(check.reason); return null; }

  const targetLevel = (target.upgradeLevel || 0) + 1;
  const chance = getUpgradeSuccessChance(targetLevel);
  const success = Math.random() < chance;

  // Kaynak (Hurda + Kitap) başarı/başarısızlık FARK ETMEKSİZİN harcanır —
  // başarısızlıkta sadece eşya bir sonraki seviyeye geçmez.
  const finalItem = success ? applyUpgradeToItem(target) : target;
  const newInvArr = getSlotInventory(slot).map(it => it.id === itemId ? finalItem : it);
  const isEquipped = S.currentPlayerData.equipment?.[slot]?.id === itemId;
  const newEquipment = (isEquipped && success)
    ? { ...(S.currentPlayerData.equipment || emptyEquipment()), [slot]: finalItem }
    : (S.currentPlayerData.equipment || emptyEquipment());
  const stats = computeStatsFromEquipment(newEquipment, S.currentPlayerData.statAllocated);
  const newBooks = { ...getBooks(S.currentPlayerData) };
  newBooks[check.bookTier] = (newBooks[check.bookTier] || 0) - check.bookCost;

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
    [`inventory.${slot}`]: newInvArr,
    equipment: newEquipment,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    critStat: stats.critStat,
    maxHp: stats.maxHp,
    scrap: getScrap(S.currentPlayerData) - check.hurdaCost,
    books: newBooks
  });

  return { success, item: finalItem, targetLevel, chance, hurdaCost: check.hurdaCost, bookCost: check.bookCost, bookTier: check.bookTier };
}

// [V2 Faz 6 — TAMAMLANDI] Mitik/Kabus eşya isim havuzları: önceden bu iki
// tier'in kendi isim havuzu (MITIK_NAMES/KABUS_NAMES) yoktu, bu yüzden
// rollRarity() sadece standart/nadir/efsanevi döndürüyordu — mitik/kabus hiç
// droplanmıyordu. TIER_STAT_RANGE/ENCHANT_*/rollExclusiveBonus zaten hazırdı,
// sadece isim eksikti. Bu havuzlar SADECE Haftalık Dünya Boss'unun
// düşürebileceği eşyalar için kullanılıyor — rollRarity() (Kutu/Market akışı)
// hâlâ koşulsuz "standart" döndürüyor, bundan etkilenmedi.
export const MITIK_NAMES = {
  // Her slotun İLK ismi "Ejderha Hükümdarı" set parçasıdır (SET_PIECE_SET_KEY).
  kask: ["Ejderha Miğferi", "Hükümdar Tacı", "Gökyüzü Başlığı", "Ruh Maskesi", "Bilge Kaskı"],
  zirh: ["Ejderha Göğüslüğü", "Cennet Zırhı", "Yıldız Dokusu", "Ruhani Plaka", "İhtişamın Kabuğu"],
  kalkan: ["Ejderha Pullu Siper", "Gaia'nın Kalkanı", "Sismik Duvar", "Aigis Muhafızı", "Okyanusun Kalbi"],
  kilic: ["Ejderha Nefesi", "Titan Öfkesi", "Güneş Kıran", "Semavi Çelik", "Yıldırımın İzi"],
  eldiven: ["Ejderha Kavrayışı", "Midas'ın Eli", "Güneşin Dokunuşu", "Çelik Pençe", "Kudret Eldiveni"],
  kupe: ["Ejderha İşiti", "Siren Şarkısı", "Rüzgarın Sesi", "Yankı Taşı", "Yıldız Fısıltısı"],
  kolye: ["Ejderha Kalbi", "Ebediyet Mührü", "Bilgelik Pınarı", "Ruh Bağı", "Zamanın Taşı"],
  ayakkabi: ["Ejderha Pençesi", "Hız Tanrısı", "Hafif Adım", "Bulut Yürüyüşü", "Şimşek Çizmesi"],
  ring: ["Ejderha Gözü", "Kaderin Yüzüğü", "Sonsuzluk Halkası", "Büyücü Mührü", "Alevin İmzası"]
};
export const KABUS_NAMES = {
  // Her slotun İLK ismi "Kıyamet Habercisi" set parçasıdır (SET_PIECE_SET_KEY).
  kask: ["Kıyamet Maskesi", "Ölümün Yüzü", "Karanlık Miğfer", "İşkence Tacı", "Boşluk Başlığı"],
  zirh: ["Kıyamet Kabuğu", "Gölgelerin Zırhı", "Yıkım Plakası", "Mezarcı Zırhı", "Kara Zırh"],
  kalkan: ["Kıyamet Duvarı", "İşkence Siperi", "Kederin Kalkanı", "Lanetli Bariyer", "Obsidyen Blok"],
  kilic: ["Kıyamet Kılıcı", "Ruh Yiyen", "Kanlı Vasiyet", "Karanlık Şafak", "Hiçlik Bıçağı"],
  eldiven: ["Kıyamet Pençesi", "Ruh Emici", "Karanlık Dokunuş", "İşkenceci Eli", "Boşluk Kavrayışı"],
  kupe: ["Kıyamet Fısıltısı", "Çığlık Halkası", "Lanetin Sesi", "Acı Yankısı", "Karanlık Ezgi"],
  kolye: ["Kıyamet Mührü", "Ölüm Kolyesi", "Kan Bağı", "Ruh Zinciri", "Hiçliğin İmzası"],
  ayakkabi: ["Kıyamet Adımı", "Gölge Koşucusu", "Kanlı Çizme", "Ölülerin İzi", "Sessiz Adım"],
  ring: ["Kıyamet Hükmü", "Mezarlık Yüzüğü", "Lanetli Halka", "Gölge Gözü", "Kan Yüzüğü"]
};

// Set parçası isimlerinden set anahtarına harita. generateLootItemForRarity
// mitik/kabus üretirken bu haritaya bakar; isim burada varsa item.set dolar,
// yoksa null kalır (özgün/set-dışı eşya). Her iki havuzda da set parçası
// listelerin İLK elemanı — bu haritayı elle değil, o kuraldan türetiyoruz.
export const SET_PIECE_SET_KEY = Object.fromEntries([
  ...Object.values(MITIK_NAMES).map(arr => [arr[0], "ejderha_hukumdari"]),
  ...Object.values(KABUS_NAMES).map(arr => [arr[0], "kiyamet_habercisi"])
]);

export function generateLootItemForRarity(slot, rarity) {
  const slotInfo = SLOT_MAP[slot];
  const id = genItemId();

  if (rarity === "mitik" || rarity === "kabus") {
    const pool = rarity === "mitik" ? MITIK_NAMES : KABUS_NAMES;
    const name = pick(pool[slot]);
    const primary = rollTierStat(rarity);
    const secondary = rollTierSecondaryStat(rarity);
    const rawAtk = slotInfo.type === "atk" ? primary : secondary;
    const rawDef = slotInfo.type === "def" ? primary : secondary;
    const { atk, def, enchantPct } = applyEnchant(slotInfo, rawAtk, rawDef, rarity);
    const bonusStat = rollBonusStat(rarity);
    return {
      id, name, slot, rarity,
      atk, def, enchantPct,
      spd: bonusStat.spd, crit: bonusStat.crit, hp: bonusStat.hp,
      effect: null, effectDesc: null,
      minorTrait: null,
      exclusiveBonus: rollExclusiveBonus(rarity),
      efsaneviTrait: null,
      set: SET_PIECE_SET_KEY[name] || null
    };
  }

  if (rarity === "efsanevi") {
    const options = LEGENDARY_BY_SLOT[slot];
    const base = pick(options);
    // V2 Faz 2: base.atk/base.def artık kullanılmıyor (RNG'ye çevrildi, bkz.
    // "İTEM STAT ARALIKLARI"). base.set varsa (Set Bonusu sistemi) korunur.
    const primary = rollTierStat(rarity);
    const secondary = rollTierSecondaryStat(rarity);
    const rawAtk = slotInfo.type === "atk" ? primary : secondary;
    const rawDef = slotInfo.type === "def" ? primary : secondary;
    const { atk, def, enchantPct } = applyEnchant(slotInfo, rawAtk, rawDef, rarity);
    const bonusStat = rollBonusStat(rarity);
    return {
      id, name: base.name, slot, rarity,
      atk, def, enchantPct,
      spd: bonusStat.spd, crit: bonusStat.crit, hp: bonusStat.hp,
      effect: null, effectDesc: null,
      minorTrait: null,
      exclusiveBonus: null,
      efsaneviTrait: rollEfsaneviTrait(slotInfo),
      set: base.set || null
    };
  }

  if (rarity === "nadir") {
    const name = pick(RARE_NAMES[slot]);
    const primary = rollTierStat(rarity);
    const secondary = rollTierSecondaryStat(rarity);
    const rawAtk = slotInfo.type === "atk" ? primary : secondary;
    const rawDef = slotInfo.type === "def" ? primary : secondary;
    const { atk, def, enchantPct } = applyEnchant(slotInfo, rawAtk, rawDef, rarity);
    const bonusStat = rollBonusStat(rarity);
    return {
      id, name, slot, rarity,
      atk, def, enchantPct,
      spd: bonusStat.spd, crit: bonusStat.crit, hp: bonusStat.hp,
      effect: null, effectDesc: null,
      minorTrait: rollMinorTrait(rarity),
      exclusiveBonus: null,
      efsaneviTrait: null,
      set: null
    };
  }

  // standart
  const name = pick(STANDARD_NAMES[slot]);
  const primary = rollTierStat(rarity);
  const secondary = rollTierSecondaryStat(rarity);
  const rawAtk = slotInfo.type === "atk" ? primary : secondary;
  const rawDef = slotInfo.type === "def" ? primary : secondary;
  const { atk, def, enchantPct } = applyEnchant(slotInfo, rawAtk, rawDef, rarity);
  const bonusStat = rollBonusStat(rarity);
  return {
    id, name, slot, rarity,
    atk, def, enchantPct,
    spd: bonusStat.spd, crit: bonusStat.crit, hp: bonusStat.hp,
    effect: null, effectDesc: null,
    minorTrait: rollMinorTrait(rarity),
    exclusiveBonus: null,
    efsaneviTrait: null,
    set: null
  };
}
// [V2 Faz 6 — TAMAMLANDI] Mitik/Kabus dalı artık yukarıda mevcut (bkz.
// MITIK_NAMES/KABUS_NAMES ve fonksiyonun başındaki ilk if bloğu).

// statAllocated: oyuncunun seviye atlayınca kazandığı Stat Puanlarını kalıcı
// olarak yatırdığı { attack, defense } sayacı. Ekipmandan bağımsız, bu yüzden
// her equipItem/kutu açma gibi ekipman değişiminde de eklenmesi gerekiyor
// (yoksa yeni eşya kuşanınca stat puanı yatırımı sıfırlanmış gibi görünür).
// Set Bonusu'ndan ÖNCE eklenir ki yatırılan puanlar da set bonusunun
// yüzdesel çarpanından faydalansın (taban stat gibi davranır).
export function computeStatsFromEquipment(equipment, statAllocated) {
  let atk = BASE_ATTACK, def = BASE_DEFENSE;
  let spd = 0, crit = 0, hp = BASE_HP;
  for (const s of SLOTS) {
    const item = equipment?.[s.key];
    if (item) {
      atk += item.atk || 0; def += item.def || 0;
      spd += item.spd || 0; crit += item.crit || 0; hp += item.hp || 0;
    }
  }
  atk += statAllocated?.attack || 0;
  def += statAllocated?.defense || 0;
  // Set Bonusu (Task 6): eşya toplamından SONRA, taban dahil toplam güce
  // yüzdesel olarak uygulanır.
  const setBonus = getSetBonusPct(equipment);
  if (setBonus.atkPct) atk = Math.round(atk * (1 + setBonus.atkPct / 100));
  if (setBonus.defPct) def = Math.round(def * (1 + setBonus.defPct / 100));
  return { attack: atk, defense: def, speed: spd, critStat: crit, maxHp: hp };
}

// [V2 Faz 3] Belirli bir seviyeden bir sonrakine geçmek için gereken XP.
// Üstel artış (LEVEL_XP_GROWTH > 1) sayesinde her seviye bir öncekinden
// daha zor oluyor.
export function xpNeededForLevel(level) {
  return Math.round(LEVEL_XP_BASE * Math.pow(LEVEL_XP_GROWTH, Math.max(1, level) - 1));
}

// Bir oyuncu verisine XP eklerken seviye atlama(lar)ını merkezi olarak
// hesaplayan tek fonksiyon. Tek seferde birden fazla seviye atlanabilir
// (örn. büyük bir görev ödülü). Her seviye atlaması 1 Stat Puanı verir.
// Not: Bu fonksiyon sadece hesaplama yapar, Firestore'a yazmaz — çağıran
// yer, dönen { level, xp, statPoints } değerlerini kendi updateDoc/tx.update
// payload'ına eklemeli.
// [V2 Faz 6] xpMult desteği eklendi (bkz. DAILY_EVENTS → "scholar"/
// "distracted" gibi olaylar) — TÜM XP kazanımları bu tek fonksiyondan
// geçtiği için (savaş/kutu/görev/enerji görevi) tek noktadan uygulanıyor.
export function applyXpGain(data, xpGain) {
  const event = getTodaysEvent(data);
  let level = data?.level || 1;
  let xp = (data?.xp || 0) + Math.max(0, Math.round((xpGain || 0) * (event.xpMult || 1)));
  let statPoints = data?.statPoints || 0;
  let levelsGained = 0;
  let needed = xpNeededForLevel(level);
  while (xp >= needed) {
    xp -= needed;
    level++;
    statPoints++;
    levelsGained++;
    needed = xpNeededForLevel(level);
  }
  return { level, xp, statPoints, levelsGained };
}

