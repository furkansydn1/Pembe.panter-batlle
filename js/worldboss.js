import { CRIT_CHANCE_CAP, CRIT_MULTIPLIER } from "./battle.js";
import { BASE_ATTACK, getScrap } from "./core-config.js";
import { getTodaysEvent, pick, randInt } from "./events-badges.js";
import { PLAYERS_COL, collection, db, doc, getDoc, getDocs, runTransaction, updateDoc } from "./firebase-setup.js";
import { getCurrentEnergy } from "./game-core.js";
import { getBooks } from "./item-systems.js";
import { formatRemaining } from "./map.js";
import { buildItemGrantPayloadGeneric, leaderboardWeekIdStr } from "./quests.js";
import { S } from "./state.js";
import { META_COL } from "./wheel-bounty-oracle.js";

// ============================================================
// HAFTALIK DÜNYA BOSS'U (V2 Faz 6)
// Paylaşımlı, tüm oyuncuların ortaklaşa dövdüğü TEK bir Can barı — META_COL
// içinde tek doküman, ensureWeeklyLeaderboardReset() ile BİREBİR AYNI "önce
// ben kaptım" transaction deseni: hafta değiştiğinde (leaderboard'la aynı
// Pazar-Pazar döngüsü, leaderboardWeekIdStr() tekrar kullanılıyor) hangi
// client fark ederse o yeni boss'u başlatır.
//
// [V2 — henüz uygulanmadı]: Bu SADECE veri/mantık katmanı — attackWorldBoss()
// hiçbir DOM elementine/butona bağlı DEĞİL (MAP_TIERS/enterMap() ile aynı
// desen, bkz. Faz 3 notu). Can barı, "Boss'a Saldır" butonu, yeni bir
// sekme/panel index.html + styles.css gerektirdiği için ayrı bir oturumda
// bağlanmalı — bu görev "sadece app.js oku" talimatıyla verildiği için UI
// bilerek eklenmedi. Test/manuel kullanım için attackWorldBoss() ve
// getWorldBossState() window'a bağlandı (adminGrantBooks ile aynı konsol-only
// desen): tarayıcı konsolundan `attackWorldBoss()` / `getWorldBossState()`.
// ============================================================
export const WORLD_BOSS_DOC_ID = "worldBoss";
export const WORLD_BOSS_NAMES = [
  "Kabus Efendisi Malgrath", "Unutulmuş Tanrı Vyrn", "Kanlı Ay Canavarı",
  "Çürüyen Dev Skarn", "Gölge Ejderi Nyx", "Kâbus Doğuran Ana"
];
// Oyuncu sayısına göre hafifçe ölçeklenir: 10 kişilik dolu bir grupta da,
// erken/küçük bir grupta da makul bir hafta içinde (ama TEK BAŞINA asla)
// bitirilebilecek bir Can barı hedefleniyor.
export const WORLD_BOSS_HP_BASE = 12000;
export const WORLD_BOSS_HP_PER_PLAYER = 2400;

// PvP'nin saatlik saldırı hakkından TAMAMEN AYRI kendi cooldown/enerji
// maliyeti — Boss'a vurmak normal saldırı hakkını tüketmez.
export const WORLD_BOSS_ATTACK_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 saatte 1 vuruş
export const WORLD_BOSS_ENERGY_COST = 20;

// Vuruş başına ufak taban ödül (esas ödül boss ölünce dağıtılıyor, bkz. altta).
export const WORLD_BOSS_HIT_SCRAP_MIN = 2;
export const WORLD_BOSS_HIT_SCRAP_MAX = 5;
export const WORLD_BOSS_HIT_POINTS_MIN = 1;
export const WORLD_BOSS_HIT_POINTS_MAX = 3;

// Mitik/Kabus item/kitap düşürme şansları — istenen gibi ÇOK DÜŞÜK (%1-2).
// Item ve Kitap ihtimalleri birbirinden BAĞIMSIZ denenir (bkz.
// rollWorldBossBonusDrop); aynı vuruşta ikisi birden de (nadiren) çıkabilir.
export const WORLD_BOSS_MITIK_ITEM_CHANCE = 0.02;   // %2
export const WORLD_BOSS_KABUS_ITEM_CHANCE = 0.01;   // %1
export const WORLD_BOSS_MITIK_BOOK_CHANCE = 0.02;   // %2
export const WORLD_BOSS_KABUS_BOOK_CHANCE = 0.01;   // %1
// Günün olayı (bkz. DAILY_EVENTS → worldBossBonusChanceMult) bu şansları
// hafifçe oynatabilir ama "çok düşük" sözüne sadık kalmak için burada sert
// bir tavan var — mult ne olursa olsun efektif şans bu değeri aşamaz.
export const WORLD_BOSS_BONUS_CHANCE_HARD_CAP = 0.08; // %8

// Boss düşünce: en çok hasar veren ilk N oyuncu "Katkı Ödülü" olarak garanti
// Efsanevi eşya + bol hurda/puan kazanır; en az 1 vuruş yapmış HERKES daha
// mütevazı bir katılım ödülü alır. "En çok uğraşan kazansın" + "herkes bir
// şey kapsın" dengesi.
export const WORLD_BOSS_TOP_REWARD_COUNT = 3;
export const WORLD_BOSS_TOP_REWARD_SCRAP = 40;
export const WORLD_BOSS_TOP_REWARD_POINTS = 20;
export const WORLD_BOSS_PARTICIPATION_SCRAP = 12;
export const WORLD_BOSS_PARTICIPATION_POINTS = 6;

export function pickWorldBossName() { return pick(WORLD_BOSS_NAMES); }

export function computeWorldBossMaxHp(playerCount) {
  return WORLD_BOSS_HP_BASE + WORLD_BOSS_HP_PER_PLAYER * Math.max(0, playerCount - 1);
}

// Bir vuruşta ne kadar hasar verileceği: PvP'deki gibi Saldırı statına
// dayanır (boss "savunma" yapmıyor, düz bir Can barı eritiliyor), Kritik
// statı da devreye girer. Hız hesaba katılmıyor — o PvP'nin 3 saniyelik
// simülasyonuna özgü bir mekanik (bkz. AS stacking notu), burada tek
// vuruşluk bir aksiyon var.
export function computeWorldBossDamage(playerData) {
  const event = getTodaysEvent(playerData);
  const atk = playerData.attack || BASE_ATTACK;
  const critChance = Math.min(CRIT_CHANCE_CAP, (playerData.critStat || 0) / 100);
  const isCrit = Math.random() < critChance;
  const spread = 0.85 + Math.random() * 0.3; // ±%15 doğal dalgalanma
  let dmg = atk * spread * (event.bossDamageMult || 1);
  if (isCrit) dmg *= CRIT_MULTIPLIER;
  return { damage: Math.max(1, Math.round(dmg)), isCrit };
}

// Vuruş başına düşük ihtimalli bonus loot: item VEYA kitap, mitik VEYA kabus
// — dördü de birbirinden bağımsız rulet. Pratikte çoğu vuruş hiçbir bonus
// getirmez, "1-2% gibi çok düşük" isteğine sadık kalınıyor (hard cap ile).
export function rollWorldBossBonusDrop(playerData) {
  const event = getTodaysEvent(playerData);
  const mult = Math.min(3, event.worldBossBonusChanceMult || 1);
  const cap = WORLD_BOSS_BONUS_CHANCE_HARD_CAP;
  const drops = [];
  if (Math.random() < Math.min(cap, WORLD_BOSS_KABUS_ITEM_CHANCE * mult)) {
    drops.push({ kind: "item", rarity: "kabus" });
  } else if (Math.random() < Math.min(cap, WORLD_BOSS_MITIK_ITEM_CHANCE * mult)) {
    drops.push({ kind: "item", rarity: "mitik" });
  }
  if (Math.random() < Math.min(cap, WORLD_BOSS_KABUS_BOOK_CHANCE * mult)) {
    drops.push({ kind: "book", rarity: "kabus" });
  } else if (Math.random() < Math.min(cap, WORLD_BOSS_MITIK_BOOK_CHANCE * mult)) {
    drops.push({ kind: "book", rarity: "mitik" });
  }
  return drops;
}

// Hafta değiştiyse (Pazar 00:00, leaderboard'la aynı pencere) yeni bir boss
// başlatır. Önceki hafta boss ölmeden bitmişse (kimse bitiremediyse) o
// haftanın büyük "defeat" ödülü VERİLMEZ — sadece her vuruşta zaten kazanılan
// ufak taban ödüller (scrap/puan/bonus loot şansı) kalır. Bu, boss'u gerçekten
// öldürmeye teşvik eden bilinçli bir tasarım kararı; ölmemiş bir boss'un
// hasar tablosunu haftalar sonra transaction içinde tekrar okuyup dağıtmak
// (Firestore transaction'larının "önce tüm okumalar, sonra yazmalar" kuralı
// yüzünden) gereksiz karmaşıklık/kırılganlık getireceği için bilinçli olarak
// basit tutuldu.
export async function ensureWorldBossForThisWeek() {
  const currentWeekId = leaderboardWeekIdStr();
  const metaRef = doc(db, META_COL, WORLD_BOSS_DOC_ID);

  const preSnap = await getDoc(metaRef);
  if (preSnap.exists() && preSnap.data().weekId === currentWeekId) return;

  const playersSnap = await getDocs(collection(db, PLAYERS_COL));
  const playerCount = playersSnap.size;

  try {
    await runTransaction(db, async (tx) => {
      const metaSnap = await tx.get(metaRef);
      const meta = metaSnap.exists() ? metaSnap.data() : null;
      if (meta && meta.weekId === currentWeekId) return; // zaten işlendi

      const maxHp = computeWorldBossMaxHp(playerCount);
      tx.set(metaRef, {
        weekId: currentWeekId,
        bossName: pickWorldBossName(),
        maxHp,
        currentHp: maxHp,
        damageByPlayer: {},
        defeated: false,
        rewardsGranted: false,
        startedAt: Date.now()
      });
    });
  } catch (e) {
    console.error("Haftalık Dünya Boss'u sıfırlama hatası:", e);
  }
}

// Oyuncunun Dünya Boss'una tek bir vuruş yapmasını sağlar: cooldown + enerji
// kontrolü, hasar hesabı, boss Can barını günceller, vuruş başı ufak ödül +
// düşük ihtimalli bonus loot verir. Boss bu vuruşla ölürse (justDefeated)
// dağıtımı hemen tetikler (bkz. distributeWorldBossRewards).
export async function attackWorldBoss() {
  if (!S.currentPlayerData) return { ok: false, reason: "Giriş yapılmamış." };

  const last = S.currentPlayerData.lastWorldBossAttackAt || 0;
  if (Date.now() - last < WORLD_BOSS_ATTACK_COOLDOWN_MS) {
    return { ok: false, reason: `Dünya Boss'una tekrar saldırmak için ${formatRemaining(WORLD_BOSS_ATTACK_COOLDOWN_MS - (Date.now() - last))} beklemelisin.` };
  }
  const energy = getCurrentEnergy(S.currentPlayerData);
  if (energy < WORLD_BOSS_ENERGY_COST) {
    return { ok: false, reason: `Yetersiz enerji (gerekli: ${WORLD_BOSS_ENERGY_COST}, mevcut: ${energy}).` };
  }

  const metaRef = doc(db, META_COL, WORLD_BOSS_DOC_ID);
  const playerRef = doc(db, PLAYERS_COL, S.currentPlayerId);
  let result = { ok: false, reason: "Bilinmeyen hata." };

  try {
    await runTransaction(db, async (tx) => {
      const metaSnap = await tx.get(metaRef);
      const playerSnap = await tx.get(playerRef);
      if (!metaSnap.exists()) throw new Error("Bu hafta için Dünya Boss'u henüz hazır değil, birazdan tekrar dene.");
      if (!playerSnap.exists()) throw new Error("Oyuncu bulunamadı.");

      const meta = metaSnap.data();
      const player = playerSnap.data();

      if (meta.weekId !== leaderboardWeekIdStr()) throw new Error("Dünya Boss'u bu hafta için henüz yenilenmedi, birazdan tekrar dene.");
      if (meta.defeated || meta.currentHp <= 0) throw new Error(`${meta.bossName} bu hafta zaten yenildi. Yeni boss Pazar 00:00'da gelecek.`);

      const freshLast = player.lastWorldBossAttackAt || 0;
      if (Date.now() - freshLast < WORLD_BOSS_ATTACK_COOLDOWN_MS) throw new Error("Cooldown dolmadı.");
      const freshEnergy = getCurrentEnergy(player);
      if (freshEnergy < WORLD_BOSS_ENERGY_COST) throw new Error("Yetersiz enerji.");

      const { damage, isCrit } = computeWorldBossDamage(player);
      const newHp = Math.max(0, meta.currentHp - damage);
      const justDefeated = newHp <= 0 && meta.currentHp > 0;

      const newDamageByPlayer = { ...(meta.damageByPlayer || {}) };
      const prevEntry = newDamageByPlayer[S.currentPlayerId] || { damage: 0, hits: 0 };
      newDamageByPlayer[S.currentPlayerId] = {
        nick: player.nick,
        damage: prevEntry.damage + damage,
        hits: prevEntry.hits + 1
      };

      const hitScrap = randInt(WORLD_BOSS_HIT_SCRAP_MIN, WORLD_BOSS_HIT_SCRAP_MAX);
      const hitPoints = randInt(WORLD_BOSS_HIT_POINTS_MIN, WORLD_BOSS_HIT_POINTS_MAX);
      const bonusDrops = rollWorldBossBonusDrop(player);

      let playerPayload = {
        lastWorldBossAttackAt: Date.now(),
        energy: freshEnergy - WORLD_BOSS_ENERGY_COST,
        lastEnergyUpdate: Date.now(),
        scrap: getScrap(player) + hitScrap,
        points: (player.points || 0) + hitPoints,
        worldBossDamageDone: (player.worldBossDamageDone || 0) + damage
      };

      let grantedItem = null;
      let grantedBookTier = null;
      for (const drop of bonusDrops) {
        const mergedState = { ...player, ...playerPayload };
        if (drop.kind === "item") {
          const itemGrant = buildItemGrantPayloadGeneric(mergedState, drop.rarity);
          grantedItem = itemGrant._grantedItem;
          delete itemGrant._grantedItem;
          playerPayload = { ...playerPayload, ...itemGrant };
        } else if (drop.kind === "book") {
          const curBooks = { ...getBooks(mergedState) };
          curBooks[drop.rarity] = (curBooks[drop.rarity] || 0) + 1;
          playerPayload.books = curBooks;
          grantedBookTier = drop.rarity;
        }
      }

      tx.update(playerRef, playerPayload);
      tx.update(metaRef, {
        currentHp: newHp,
        damageByPlayer: newDamageByPlayer,
        defeated: justDefeated,
        defeatedAt: justDefeated ? Date.now() : (meta.defeatedAt || null)
      });

      result = {
        ok: true, damage, isCrit, newHp, maxHp: meta.maxHp, bossName: meta.bossName,
        justDefeated, grantedItem, grantedBookTier, hitScrap, hitPoints
      };
    });

    if (result.ok && result.justDefeated) {
      await distributeWorldBossRewards();
    }
  } catch (e) {
    console.error("Dünya Boss'una saldırı hatası:", e);
    return { ok: false, reason: e.message || "Bilinmeyen hata." };
  }

  return result;
}

// Boss öldükten sonra hasar tablosundaki TÜM katılımcılara ödül dağıtır.
// ensureWeeklyLeaderboardReset ile aynı iki-aşamalı desen: önce (transaction
// dışında) kimlere yazılacağı belirlenir, sonra tek bir transaction içinde
// TÜM okumalar yapılıp TÜM yazmalar yapılır. rewardsGranted bayrağı, aynı
// anda birden fazla client boss'u bitirse bile ödülün İKİ KEZ verilmesini
// engeller (ilk giren kapar, diğerleri transaction içinde "zaten dağıtılmış"
// görüp çıkar).
export async function distributeWorldBossRewards() {
  const metaRef = doc(db, META_COL, WORLD_BOSS_DOC_ID);
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) return;
  const meta = metaSnap.data();
  if (!meta.defeated || meta.rewardsGranted) return;

  const damageByPlayer = meta.damageByPlayer || {};
  const participantIds = Object.keys(damageByPlayer);
  if (!participantIds.length) {
    await updateDoc(metaRef, { rewardsGranted: true });
    return;
  }

  const sortedIds = [...participantIds].sort((a, b) => (damageByPlayer[b].damage || 0) - (damageByPlayer[a].damage || 0));
  const topIds = new Set(sortedIds.slice(0, WORLD_BOSS_TOP_REWARD_COUNT));
  const playerRefs = participantIds.map(id => doc(db, PLAYERS_COL, id));

  try {
    await runTransaction(db, async (tx) => {
      const freshMetaSnap = await tx.get(metaRef);
      const freshMeta = freshMetaSnap.exists() ? freshMetaSnap.data() : null;
      if (!freshMeta || !freshMeta.defeated || freshMeta.rewardsGranted) return; // başka client zaten dağıttı

      const freshPlayers = [];
      for (let i = 0; i < playerRefs.length; i++) {
        const snap = await tx.get(playerRefs[i]);
        if (snap.exists()) freshPlayers.push({ ref: playerRefs[i], id: participantIds[i], data: snap.data() });
      }

      for (const p of freshPlayers) {
        const isTop = topIds.has(p.id);
        const scrapReward = isTop ? WORLD_BOSS_TOP_REWARD_SCRAP : WORLD_BOSS_PARTICIPATION_SCRAP;
        const pointsReward = isTop ? WORLD_BOSS_TOP_REWARD_POINTS : WORLD_BOSS_PARTICIPATION_POINTS;
        let payload = {
          scrap: getScrap(p.data) + scrapReward,
          points: (p.data.points || 0) + pointsReward
        };
        if (isTop) {
          payload.worldBossTopFinisherCount = (p.data.worldBossTopFinisherCount || 0) + 1;
          const itemGrant = buildItemGrantPayloadGeneric({ ...p.data, ...payload }, "efsanevi");
          delete itemGrant._grantedItem;
          payload = { ...payload, ...itemGrant };
        }
        tx.update(p.ref, payload);
      }

      tx.update(metaRef, { rewardsGranted: true, rewardedAt: Date.now() });
    });
  } catch (e) {
    console.error("Dünya Boss'u ödül dağıtımı hatası:", e);
  }
}

export async function getWorldBossState() {
  const snap = await getDoc(doc(db, META_COL, WORLD_BOSS_DOC_ID));
  return snap.exists() ? snap.data() : null;
}
// adminGrantBooks/adminWipeDatabase ile aynı "konsol-only" desen: UI henüz
// bağlı olmadığı için test/manuel kullanım tarayıcı konsolundan yapılıyor.
window.attackWorldBoss = attackWorldBoss;
window.getWorldBossState = getWorldBossState;

export const QUEST_TEMPLATES = [
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

