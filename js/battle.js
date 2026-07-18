import { ATTACK_COOLDOWN_MS, BASE_ATTACK, BASE_DEFENSE, XP_PER_BATTLE_LOSS, XP_PER_BATTLE_WIN, getAttackWindowIndex, getScrap } from "./core-config.js";
import { IS_LOW_POWER, attackStatus, attackTargetsEl, closeResultBtn, resultContent, resultModal, vsAttackerAtk, vsAttackerDef, vsAttackerName, vsBgFlash, vsBurst, vsClashText, vsCountdownEl, vsDefenderAtk, vsDefenderDef, vsDefenderName, vsFighterLeft, vsFighterRight, vsFrame, vsHypeLabel, vsLightning, vsModal, vsSparksLayer, vsTensionFill } from "./dom.js";
import { getTodaysEvent, pick } from "./events-badges.js";
import { LOG_COL, PLAYERS_COL, collection, db, doc, runTransaction } from "./firebase-setup.js";
import { applyXpGain, getMinorTraitBonusPct } from "./item-systems.js";
import { SLOTS } from "./items-data.js";
import { dateStr, formatRemaining } from "./map.js";
import { MAX_CONSECUTIVE_ATTACKS_ON_TARGET, TARGET_LOCK_COOLDOWN_ATTACKS, THRONE_BONUS_POINTS, incrementQuestProgress } from "./quests.js";
import { S } from "./state.js";
import { playSound, tone } from "./ui-misc.js";
import { BOUNTY_DOC_ID, META_COL } from "./wheel-bounty-oracle.js";

// ============================================================
// SAVAŞ SİMÜLASYONU (V2 Faz 5) — 3 saniyelik gerçek çarpışma
// Savaş artık tek seferlik bir "güç karşılaştırması" değil: her iki taraf
// da KENDİ Saldırı Hızı'na göre bağımsız vuruyor, KENDİ Can barı eriyor.
// 3 saniye dolmadan biri Can'ı 0'a inerse NAKAVT olur. Süre dolarsa kalan
// Can YÜZDESİ (ham hasar değil) kazananı belirler.
//
// Hız ve Kritik statları TABANDA 0'dır, Can TABANDA BASE_HP'dir; hepsi
// SADECE eşyalardan (şansa bağlı, bkz. rollBonusStat) gelir. Oyuncu bu
// statlara stat puanı yatıramaz (statAllocated sadece Saldırı/Savunma'ya
// izin veriyor) — bu bilinçli bir tasarım, bkz. aşağıdaki "AS STACKING
// KİLİTLERİ" notu.
// ============================================================
export const BATTLE_DURATION_MS = 3000;        // savaş 3 saniye sürer
export const BATTLE_TICK_MS = 50;              // simülasyon çözünürlüğü (60 tick)
export const BASE_HP = 100;                    // taban Can (hiç Can bonusu olmayan oyuncu)
export const DEF_MITIGATION = 0.4;             // savunmanın hasarı azaltma oranı
export const CRIT_MULTIPLIER = 1.6;            // kritik vuruş hasar çarpanı
export const CRIT_CHANCE_CAP = 0.5;            // kritik şansı %50 tavan

// --- AS STACKING KİLİDİ #1: asimptotik hız eğrisi ---
// Sonsuz Hız = sonsuz vuruş DEĞİL. Saniyedeki vuruş sayısı, Hız statı ne
// kadar büyürse büyüsün BASE_ATTACKS_PER_SECOND * MAX_ATTACK_SPEED_MULTIPLIER
// tavanına yaklaşır ama ASLA ulaşmaz (klasik "azalan getiri" eğrisi).
export const BASE_ATTACKS_PER_SECOND = 1;      // Hız=0 iken saniyede 1 vuruş
export const MAX_ATTACK_SPEED_MULTIPLIER = 3;  // Hız ne kadar yığılırsa yığılsın bu katı ASLA aşamaz
export const SPD_HALF_VALUE = 25;              // bu kadar Hız statı, maksimum bonusun YARISINI verir

export function critChanceFromStat(critStat) {
  return Math.min(CRIT_CHANCE_CAP, Math.max(0, (critStat || 0) / 100));
}

export function attacksPerSecondFromSpeed(spd) {
  const s = Math.max(0, spd || 0);
  const bonus = (MAX_ATTACK_SPEED_MULTIPLIER - 1) * (s / (s + SPD_HALF_VALUE));
  return BASE_ATTACKS_PER_SECOND * (1 + bonus);
}

// attacker/defender: { atk, def, spd, crit, hp }
export function simulateBattle3s(attacker, defender) {
  const aHp0 = Math.max(1, attacker.hp || BASE_HP);
  const dHp0 = Math.max(1, defender.hp || BASE_HP);
  let aHp = aHp0, dHp = dHp0;

  const aAps = attacksPerSecondFromSpeed(attacker.spd);
  const dAps = attacksPerSecondFromSpeed(defender.spd);
  const aCritChance = critChanceFromStat(attacker.crit);
  const dCritChance = critChanceFromStat(defender.crit);

  let aGauge = 0, dGauge = 0;
  let hitsA = 0, hitsD = 0, critHitsA = 0, critHitsD = 0;
  let dmgDealtA = 0, dmgDealtD = 0;
  let ko = null; // "attacker" | "defender" | null

  const tickSec = BATTLE_TICK_MS / 1000;
  const totalTicks = Math.round(BATTLE_DURATION_MS / BATTLE_TICK_MS);

  for (let t = 0; t < totalTicks; t++) {
    aGauge += aAps * tickSec;
    dGauge += dAps * tickSec;

    while (aGauge >= 1 && dHp > 0) {
      aGauge -= 1;
      hitsA++;
      // AS STACKING KİLİDİ #2: savunma her vuruşta SABİT çıkarılıyor, yani
      // "çok ama zayıf vuruş" stratejisi savunmaya karşı orantısız kayıp yaşar.
      const base = Math.max(1, attacker.atk - defender.def * DEF_MITIGATION);
      const isCrit = Math.random() < aCritChance;
      const dmg = isCrit ? base * CRIT_MULTIPLIER : base;
      if (isCrit) critHitsA++;
      dmgDealtA += dmg;
      dHp -= dmg;
      if (dHp <= 0) { ko = "attacker"; break; }
    }
    if (ko) break;

    while (dGauge >= 1 && aHp > 0) {
      dGauge -= 1;
      hitsD++;
      const base = Math.max(1, defender.atk - attacker.def * DEF_MITIGATION);
      const isCrit = Math.random() < dCritChance;
      const dmg = isCrit ? base * CRIT_MULTIPLIER : base;
      if (isCrit) critHitsD++;
      dmgDealtD += dmg;
      aHp -= dmg;
      if (aHp <= 0) { ko = "defender"; break; }
    }
    if (ko) break;
  }

  let attackerWins;
  if (ko === "attacker") attackerWins = true;
  else if (ko === "defender") attackerWins = false;
  else {
    // Süre doldu: ham hasar değil, kalan Can YÜZDESİ karar verir — yüksek
    // Can'lı bir tank, sırf çok kez vurulduğu için haksız yere kaybetmesin.
    const aHpPct = Math.max(0, aHp) / aHp0;
    const dHpPct = Math.max(0, dHp) / dHp0;
    attackerWins = dHpPct <= aHpPct;
  }

  return {
    attackerWins, ko: ko || "timeout",
    hitsA, hitsD, critHitsA, critHitsD,
    dmgDealtA: Math.round(dmgDealtA), dmgDealtD: Math.round(dmgDealtD),
    remainingHpA: Math.max(0, Math.round(aHp)), remainingHpD: Math.max(0, Math.round(dHp)),
    maxHpA: aHp0, maxHpD: dHp0
  };
}

// ============================================================
// ELO / LİG SİSTEMİ (V2 Faz 5)
// Çaylak'tan Efsane'ye 5 kademeli bir lig. Her oyuncunun `elo` alanı
// (Firestore'da yeni, eski dokümanlarda yok -> getElo() ile STARTING_ELO
// varsayılır) standart Elo formülüyle (bkz. computeEloDelta) her savaştan
// sonra güncellenir. Kademe SAKLANMAZ, her zaman elo'dan CANLI hesaplanır
// (getLeagueTier) — böylece elo/kademe asla birbirinden kopmaz.
// ============================================================
export const STARTING_ELO = 1000;
export const ELO_K_FACTOR = 24; // normal bir savaşta elo ne kadar hızlı değişir
export const LEAGUE_TIERS = [
  { id: "caylak", label: "Çaylak", icon: "🐾", minElo: 0 },
  { id: "avci", label: "Avcı", icon: "🎯", minElo: 1000 },
  { id: "sampiyon", label: "Şampiyon", icon: "🏆", minElo: 1200 },
  { id: "elit", label: "Elit", icon: "💎", minElo: 1400 },
  { id: "efsane", label: "Efsane", icon: "👑", minElo: 1600 }
];
export function getElo(data) {
  return data?.elo ?? STARTING_ELO;
}
export function getLeagueTier(elo) {
  const e = elo ?? STARTING_ELO;
  let tier = LEAGUE_TIERS[0];
  for (const t of LEAGUE_TIERS) {
    if (e >= t.minElo) tier = t;
  }
  return tier;
}
export function expectedEloScore(myElo, oppElo) {
  return 1 / (1 + Math.pow(10, (oppElo - myElo) / 400));
}
// actualScore: kazanan için 1, kaybeden için 0
export function computeEloDelta(myElo, oppElo, actualScore, kFactor) {
  const expected = expectedEloScore(myElo, oppElo);
  return Math.round((kFactor ?? ELO_K_FACTOR) * (actualScore - expected));
}

// ============================================================
// ANTİ-GRİEFİNG (V2 Faz 5)
// Bir oyuncu kendinden ÇOK daha güçsüz (ham Saldırı+Savunma toplamı) YA DA
// Elo'su çok düşük birine saldırıp kazanırsa, ödül neredeyse sıfıra iner ve
// savunan hiçbir şey kaybetmez. Bu, güçlü oyuncuların zayıf/yeni oyuncuları
// sürekli hedef alarak kolay puan/Elo çiftliği kurmasını (griefing) önler.
// İKİ koşuldan HERHANGİ biri yeterlidir (güç farkı VEYA elo farkı).
// ============================================================
export const GRIEFING_POWER_RATIO = 2.0;   // saldıranın toplam gücü savunanınkinin bu katından fazlaysa
export const GRIEFING_ELO_GAP = 300;       // saldıranın Elo'su savunandan bu kadar fazlaysa (yaklaşık 2 kademe)
export const GRIEFING_MIN_WIN_PTS = 1;     // güçsüze/düşük Elo'ya saldırıp kazanınca alınacak puan (neredeyse yok)
export const GRIEFING_ELO_K_FACTOR = 4;    // griefing durumunda Elo kazancı da neredeyse bastırılır

// ============================================================
// SALDIRI HEDEFLERİ
// ============================================================
export function canAttackNow() {
  if (!S.currentPlayerData) return false;
  const lastWindow = S.currentPlayerData.lastAttackWindow ?? -1;
  return lastWindow !== getAttackWindowIndex();
}

export function renderAttackTargets() {
  if (!S.currentPlayerData) return;
  const able = canAttackNow() && !S.attackInProgress;
  const cooldowns = S.currentPlayerData.targetCooldowns || {};
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

  const targets = S.allPlayers.filter(p => p.id !== S.currentPlayerId);
  const throneId = S.allPlayers.length && (S.allPlayers[0].points || 0) > 0 ? S.allPlayers[0].id : null;
  const bountyTargetId = S.currentBounty && S.currentBounty.active ? S.currentBounty.targetId : null;

  attackTargetsEl.innerHTML = targets.map(p => {
    const cooldownLeft = cooldowns[p.id] || 0;
    const isLocked = cooldownLeft > 0;
    const canHitThis = able && !isLocked;
    const isCurrentStreakTarget = !isLocked && p.id === S.currentPlayerData.lastAttackedId && (S.currentPlayerData.attackStreakOnTarget || 0) > 0;
    const badge = isLocked
      ? `<span class="target-streak-badge locked">🔒 ${cooldownLeft} savaş</span>`
      : isCurrentStreakTarget
        ? `<span class="target-streak-badge">${S.currentPlayerData.attackStreakOnTarget}/${MAX_CONSECUTIVE_ATTACKS_ON_TARGET}</span>`
        : "";
    const throneBadge = p.id === throneId ? `<span class="throne-crown" title="Yenersen +${THRONE_BONUS_POINTS} bonus puan">👑</span>` : "";
    const bountyBadge = p.id === bountyTargetId ? `<span class="target-streak-badge bounty-badge">💀 ${S.currentBounty.amount} hurda</span>` : "";
    return `
    <div class="attack-target-row ${isLocked ? "locked" : ""}">
      <div class="name">${throneBadge}${p.nick} ${badge}${bountyBadge}</div>
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
export function getEffect(equipment, effectName) {
  for (const s of SLOTS) {
    const item = equipment?.[s.key];
    if (item && item.effect === effectName) return item;
  }
  return null;
}

// ============================================================
// EFSANEVİ EŞYA EFEKTLERİNİN AKTİVASYON ŞANSI
// Önceden her efsanevi eşyanın özel efekti, ilgili koşul sağlandığında
// (kazanınca/kaybedince/vb.) %100 KESİN tetikleniyordu. Bu, birden fazla
// efsanevi eşya aynı anda kuşanıldığında (örn. 5 slotun hepsi efsanevi)
// savaşı neredeyse tamamen deterministik ve aşırı güçlü hale getiriyordu.
// Artık her efekt türünün kendi "aktivasyon şansı" var: koşul sağlansa
// bile efekt bu ihtimalle devreye giriyor, aksi halde sessizce hiç
// tetiklenmemiş gibi geçiliyor. crit_instant_win zaten kendi %10'unu
// koruyor, bu tabloya dahil değil (ayrıca yönetiliyor).
// ============================================================
export const EFFECT_ACTIVATION_CHANCE = {
  no_loss_on_defense_lose: 0.30,   // en güçlü efekt (puan kaybını tamamen siler), en düşük şans
  revenge_steal: 0.35,
  curse_defense_next: 0.35,
  reduced_loss: 0.45,
  bonus_win_defense: 0.45,
  steal_extra_on_big_win: 0.50,
  defense_multiplier: 0.50,
  attack_multiplier: 0.50,
  lucky_defense_roll: 0.50,
  chill_risk: 0.50 // sadece "kazanınca +3 puan" kısmı; %5'lik saldıramama riski ayrı ve sabit kalıyor
};
export function effectActivates(effectName) {
  const chance = EFFECT_ACTIVATION_CHANCE[effectName];
  return chance === undefined ? true : Math.random() < chance;
}

// ============================================================
// SAVAŞ LOGU MESAJ ÇEŞİTLİLİĞİ (V2 Faz 5 — TAMAMEN REVİZE EDİLDİ)
// Eski havuzlardaki küfür/hakaret/cinsel içerikli tüm ifadeler kaldırıldı.
// Yeni havuz "tatlı-rekabetçi" bir tonda: kazanan gururlu, kaybeden mahcup
// ama HİÇBİR ifade gerçek bir hakaret ya da kaba söz içermiyor — en fazla
// arena diline uygun, oyunbaz bir "kızdırma" (zorbalık değil, dostane
// rekabet) var. Durum bazlı havuzlar önceki 3'ten (WIN/LOSE/REPEAT) çok
// daha geniş: WIN 16, LOSE 16, REPEAT_WIN 8, REPEAT_LOSE 8 farklı mesaj.
// ============================================================
export const WIN_MESSAGES = [
  "{attacker}, pençesini savurdu ve {defender}'i yerle bir etti! (+{winPts} / -{losePts})",
  "{attacker} arenaya girdi, {defender} tozu dumana kattı. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'i bir çırpıda dize getirdi! (+{winPts} / -{losePts})",
  "Zafer {attacker}'ın oldu, {defender} bu turu unutmak isteyecek. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'e küçük ama unutulmaz bir panter dersi verdi. (+{winPts} / -{losePts})",
  "{defender} direndi ama {attacker} bu tur çok daha güçlüydü. (+{winPts} / -{losePts})",
  "{attacker}, arenanın yeni yıldızı gibi parladı, {defender} gölgede kaldı. (+{winPts} / -{losePts})",
  "{attacker}'ın pençe darbeleri karşısında {defender} savunmasız kaldı. (+{winPts} / -{losePts})",
  "{attacker} kükredi, {defender} geri çekilmek zorunda kaldı. (+{winPts} / -{losePts})",
  "{defender}, {attacker} karşısında tutunamadı. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'e 'bu senin günün değildi' dedirtti. (+{winPts} / -{losePts})",
  "{attacker}'ın taktikleri işe yaradı, {defender} şaşkına döndü. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'i mağlup ederek tacını biraz daha parlattı. (+{winPts} / -{losePts})",
  "{defender}, {attacker}'ın hızına bu sefer yetişemedi. (+{winPts} / -{losePts})",
  "{attacker}, minik ama vahşi bir zafer kazandı — {defender} şimdi rövanş peşinde olacak. (+{winPts} / -{losePts})",
  "{attacker} arenadan alnının akıyla ayrıldı, {defender} bir dahaki sefere daha hazırlıklı gelmeli. (+{winPts} / -{losePts})"
];
export const LOSE_MESSAGES = [
  "{attacker} saldırdı ama {defender} sağlam durdu. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, {attacker}'ın saldırısını geri püskürttü! ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker} cesurdu ama {defender} bu sefer daha güçlüydü. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, kalesini {attacker}'a karşı başarıyla savundu. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker}, {defender}'in savunmasını bir türlü aşamadı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender} sürpriz yaptı ve {attacker}'ı geri çevirdi. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker}'ın planı bu sefer tutmadı, kazanan {defender} oldu. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, {attacker}'ın karşısında dimdik ayakta kaldı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker} bu turu kaybetti, {defender} arenada gövde gösterisi yaptı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}'in pençesi {attacker}'dan daha hızlı çıktı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker} eli boş döndü, {defender} bugün favoriydi. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, {attacker}'a küçük ama gururlu bir ders verdi. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker}'ın saldırısı boşa gitti, {defender} rahat bir zafer aldı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender} sakin kaldı, {attacker} telaşa kapılıp turu kaybetti. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker}, {defender}'in azmi karşısında geri adım atmak zorunda kaldı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker} bu sefer haddini bildi, {defender} zaferini kutluyor. ({defender} +{winPts} / {attacker} -{losePts})"
];
export const REPEAT_WIN_MESSAGES = [
  "{attacker}, {defender}'i yine hedef aldı ve yine kazandı! ({repeatCount}. kez üst üste) (+{winPts} / -{losePts})",
  "{attacker}'ın {defender} ile bitmeyen bir hesabı var galiba, üst üste {repeatCount}. kez kazandı. (+{winPts} / -{losePts})",
  "{defender}, {attacker}'ın gölgesinden bir türlü kurtulamıyor — {repeatCount}. kez üst üste yenildi. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'i favori rakibi seçmiş gibi görünüyor — {repeatCount}. galibiyet. (+{winPts} / -{losePts})",
  "{defender} için zorlu bir seri sürüyor: {attacker}'a karşı {repeatCount}. kez yenildi. (+{winPts} / -{losePts})",
  "{attacker}, {defender}'in peşini bırakmıyor, seri devam ediyor ({repeatCount}. galibiyet). (+{winPts} / -{losePts})",
  "{defender}, {attacker} karşısında {repeatCount}. kez de çaresiz kaldı. (+{winPts} / -{losePts})",
  "{attacker}, {defender} üzerindeki üstünlüğünü {repeatCount}. kez tescilledi. (+{winPts} / -{losePts})"
];
export const REPEAT_LOSE_MESSAGES = [
  "{attacker}, {defender}'e {repeatCount}. kez saldırdı ve yine eli boş döndü, inat mı bu? ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker} bu sefer de {defender}'i geçemedi, {repeatCount}. deneme de boşa gitti. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, {attacker}'ın {repeatCount}. saldırısını da geri çevirdi, artık ısrar komik kaçıyor. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker}, {defender} karşısında {repeatCount}. kez de tutunamadı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, {attacker}'a karşı yenilmezlik serisini {repeatCount}. kez uzattı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker} pes etmiyor ama {defender} de {repeatCount}. kez kapıyı kapattı. ({defender} +{winPts} / {attacker} -{losePts})",
  "{defender}, {attacker}'ın {repeatCount}. girişimini de gülümseyerek savuşturdu. ({defender} +{winPts} / {attacker} -{losePts})",
  "{attacker}, {defender}'e karşı {repeatCount}. denemesinde de umduğunu bulamadı. ({defender} +{winPts} / {attacker} -{losePts})"
];

export function pickBattleMessage({ attackerWins, attackerName, defenderName, winPts, losePts, isRepeat, repeatCount }) {
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

// ============================================================
// SALDIRI (VS) EKRANI
// Kullanıcının sağladığı bağımsız "vs-ekrani-prototip.html" prototipinden
// uyarlandı: gerçek saldıran/savunan isim+statlarını gösteren, kıvılcım
// patlamalı, dönen "hype" cümleli, son 3 saniyesi kırmızıya dönen bir
// gerilim ekranı. Saf görsel/işitsel bir katmandır: runAttack() bu ekranı
// oynattıktan SONRA asıl savaş transaction'ını olduğu gibi çalıştırır,
// yani hiçbir oyun mantığına/dengeye dokunmaz.
// ============================================================
export const VS_TOTAL_SECONDS = 5; // orijinal prototip 10sn'ydi; sık kullanılan bir
// aksiyon olduğu için (saatte 1 saldırı hakkı) gerilimi korurken daha akıcı
// olsun diye kısaltıldı. Son 3 saniye kuralı (secondsLeft <= 3) aynen duruyor.

export const VS_HYPE_PHRASES = [
  "Kim daha güçlü?! 🐾",
  "Pençeler Savaşıyor! 🐾",
  "Kim kimi devirecek?!",
  "Gerilim tavan yapıyor...",
  "Ekipman mı, şans mı kazanacak?",
  "Arena nefesini tutuyor...",
  "Bu maç efsane olabilir!",
  "Kaderin çizgisi çiziliyor...",
  "Biri bugün dize gelecek...",
  "Panter pençesini gösterecek mi?!"
];
export function startVsHypeRotation() {
  let idx = 0;
  vsHypeLabel.classList.remove("fade");
  vsHypeLabel.textContent = VS_HYPE_PHRASES[0];
  if (S.vsHypeInterval) clearInterval(S.vsHypeInterval);
  S.vsHypeInterval = setInterval(() => {
    idx = (idx + 1) % VS_HYPE_PHRASES.length;
    vsHypeLabel.classList.add("fade");
    setTimeout(() => {
      vsHypeLabel.textContent = VS_HYPE_PHRASES[idx];
      vsHypeLabel.classList.remove("fade");
    }, 200);
  }, 1100);
}
export function stopVsHypeRotation() {
  if (S.vsHypeInterval) clearInterval(S.vsHypeInterval);
  S.vsHypeInterval = null;
}

// Açılış/çarpışma anlarındaki kıvılcım patlaması (sandık/çark ile aynı Web
// Animations API deseni, sadece kendi katmanına (vsSparksLayer) çiziliyor).
export function explodeVsSparks(colors, count) {
  if (!vsSparksLayer) return;
  for (let i = 0; i < count; i++) {
    const spark = document.createElement("div");
    spark.className = "vs-spark";
    const color = pick(colors);
    spark.style.background = color;
    spark.style.boxShadow = `0 0 10px 2px ${color}`;
    spark.style.left = "50%";
    spark.style.top = "50%";
    vsSparksLayer.appendChild(spark);

    const angle = Math.random() * Math.PI * 2;
    const velocity = 60 + Math.random() * 160;
    const tx = Math.cos(angle) * velocity;
    const ty = Math.sin(angle) * velocity;

    spark.animate([
      { transform: "translate(-50%,-50%) scale(1.4)", opacity: 1 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`, opacity: 0 }
    ], {
      duration: 700 + Math.random() * 600,
      easing: "cubic-bezier(.15,.85,.35,1)",
      fill: "forwards"
    });
    setTimeout(() => spark.remove(), 1500);
  }
}

// Ses efektleri: dosyada zaten var olan gerçek ses dosyaları (Click,
// Saldırma_sesi/2) yeni anlar için yeniden kullanılıyor + üzerine ince bir
// sentetik katman (tone()) ekleniyor ki açılış darbesi ve final çarpışması
// daha "ağır" hissettirsin. Ayrı, özel VS dosyaları eklenmek istenirse
// SOUND_FILES nesnesine yeni bir anahtar eklenip burada playSound() ile
// çağrılması yeterli.
export function sfxVsTick(danger) {
  playSound("click", { volume: danger ? 1 : 0.55 });
}
export function sfxVsImpact() {
  playSound(Math.random() < 0.5 ? "attack" : "attack2", { volume: 0.9 });
  tone(120, 0, 0.1, "sawtooth", 0.12);
}
export function sfxVsClash() {
  playSound(Math.random() < 0.5 ? "attack" : "attack2", { volume: 1 });
  tone(110, 0, 0.14, "sawtooth", 0.2);
  tone(1046, 0.04, 0.2, "triangle", 0.15);
  tone(1568, 0.14, 0.28, "sine", 0.12);
}

// Ana sekans: attacker/defender isim + güncel statlarını alır, animasyonu
// oynatır ve bittiğinde (Promise resolve ile) çağırana geri döner. runAttack()
// bu Promise'i await ederek gerçek savaş hesaplamasını ancak bundan SONRA yapar.
export function playVsSequence({ attackerName, attackerAtk, attackerDef, defenderName, defenderAtk, defenderDef }) {
  return new Promise((resolve) => {
    vsAttackerName.textContent = attackerName;
    vsAttackerAtk.textContent = attackerAtk;
    vsAttackerDef.textContent = attackerDef;
    vsDefenderName.textContent = defenderName;
    vsDefenderAtk.textContent = defenderAtk;
    vsDefenderDef.textContent = defenderDef;

    vsModal.classList.remove("hidden");
    vsFrame.classList.remove("shake");
    vsBgFlash.classList.remove("go");
    vsLightning.classList.remove("go");
    vsClashText.classList.remove("go");
    vsBurst.classList.remove("go");
    vsFighterLeft.classList.remove("in", "lunge");
    vsFighterRight.classList.remove("in", "lunge");
    vsCountdownEl.classList.remove("danger", "tick");
    vsTensionFill.style.width = "0%";
    vsSparksLayer.innerHTML = "";

    let secondsLeft = VS_TOTAL_SECONDS;
    vsCountdownEl.textContent = secondsLeft;

    // Reflow zorlayıp animasyonların baştan oynamasını garanti et
    void vsFrame.offsetWidth;
    requestAnimationFrame(() => {
      vsFighterLeft.classList.add("in");
      vsFighterRight.classList.add("in");
    });
    vsFrame.classList.add("shake");
    vsBgFlash.classList.add("go");
    vsLightning.classList.add("go");
    startVsHypeRotation();

    setTimeout(() => {
      vsBurst.classList.add("go");
      explodeVsSparks(["#ffcc4d", "#ff2d87", "#4d9bff"], IS_LOW_POWER ? 8 : 18);
      sfxVsImpact();
    }, 550);

    const startTime = performance.now();
    function stepTension(now) {
      const elapsed = (now - startTime) / 1000;
      const pct = Math.min(100, (elapsed / VS_TOTAL_SECONDS) * 100);
      vsTensionFill.style.width = pct + "%";
      if (pct < 100) requestAnimationFrame(stepTension);
    }
    requestAnimationFrame(stepTension);

    const tickInterval = setInterval(() => {
      secondsLeft--;
      const danger = secondsLeft <= 3;
      if (secondsLeft > 0) {
        vsCountdownEl.textContent = secondsLeft;
        vsCountdownEl.classList.toggle("danger", danger);
        vsCountdownEl.classList.remove("tick");
        void vsCountdownEl.offsetWidth;
        vsCountdownEl.classList.add("tick");
        sfxVsTick(danger);
      } else {
        clearInterval(tickInterval);
        stopVsHypeRotation();
        vsCountdownEl.textContent = "⚔️";
        vsCountdownEl.classList.add("danger");
        vsFrame.classList.remove("shake");
        void vsFrame.offsetWidth;
        vsFrame.classList.add("shake");
        vsFighterLeft.classList.add("lunge");
        vsFighterRight.classList.add("lunge");
        vsClashText.classList.add("go");
        explodeVsSparks(["#fff", "#ffcc4d", "#ff5c6c"], IS_LOW_POWER ? 14 : 30);
        sfxVsClash();
        setTimeout(() => {
          vsModal.classList.add("hidden");
          resolve();
        }, 900);
      }
    }, 1000);
  });
}

export async function runAttack(defenderId) {
  if (S.attackInProgress) return; // aynı anda ikinci bir saldırı asla başlamasın
  S.attackInProgress = true;
  attackTargetsEl.querySelectorAll("button").forEach(b => b.disabled = true);

  // VS ekranı gerçek verilerle: saldıranın (kendi) ve savunanın o anki
  // isim + saldırı/savunma statları S.allPlayers/S.currentPlayerData'dan alınır.
  const defenderPreview = S.allPlayers.find(p => p.id === defenderId);
  await playVsSequence({
    attackerName: S.currentPlayerData?.nick || "Sen",
    attackerAtk: S.currentPlayerData?.attack ?? BASE_ATTACK,
    attackerDef: S.currentPlayerData?.defense ?? BASE_DEFENSE,
    defenderName: defenderPreview?.nick || "Rakip",
    defenderAtk: defenderPreview?.attack ?? BASE_ATTACK,
    defenderDef: defenderPreview?.defense ?? BASE_DEFENSE
  });

  // 1.lik Avı: saldırı anında liderlik tablosunun (istemci tarafında bilinen)
  // zirvesindeki oyuncu bu hedef mi, önceden belirlenir.
  const isThroneTarget = S.allPlayers.length > 0 && S.allPlayers[0].id === defenderId && (S.allPlayers[0].points || 0) > 0;

  try {
    await runTransaction(db, async (tx) => {
      const attackerRef = doc(db, PLAYERS_COL, S.currentPlayerId);
      const defenderRef = doc(db, PLAYERS_COL, defenderId);
      const bountyRef = doc(db, META_COL, BOUNTY_DOC_ID);
      const attackerSnap = await tx.get(attackerRef);
      const defenderSnap = await tx.get(defenderRef);
      const bountySnap = await tx.get(bountyRef);
      if (!attackerSnap.exists() || !defenderSnap.exists()) throw new Error("Oyuncu bulunamadı.");

      const attacker = attackerSnap.data();
      const defender = defenderSnap.data();
      const bounty = bountySnap.exists() ? bountySnap.data() : null;

      // [V2 Faz 6] Günün Olayı artık KİŞİSEL: saldıranın kendi olayı SADECE
      // kendi Saldırısını/puan kazancını, savunanın kendi olayı SADECE kendi
      // Savunmasını/şans faktörünü etkiler — böylece iki farklı olay aynı
      // savaşta bir araya gelse bile PvP adaletsiz bir küresel çarpana maruz
      // kalmaz, her oyuncu sadece kendi payına düşeni getirir.
      const attackerEvent = getTodaysEvent(attacker);
      const defenderEvent = getTodaysEvent(defender);

      // Anti-Griefing (V2 Faz 5): saldırı geçerli sayılmadan ÖNCE, ham stat/Elo
      // farkına bakarak "bu bir zorbalık mı?" tespiti yapılır. Sonuç, aşağıdaki
      // puan/Elo hesaplamasında (sadece attackerWins durumunda) kullanılır.
      const attackerElo = getElo(attacker);
      const defenderElo = getElo(defender);
      const attackerTotalPower = (attacker.attack || BASE_ATTACK) + (attacker.defense || BASE_DEFENSE);
      const defenderTotalPower = (defender.attack || BASE_ATTACK) + (defender.defense || BASE_DEFENSE);
      const isPowerGriefing = attackerTotalPower >= defenderTotalPower * GRIEFING_POWER_RATIO;
      const isEloGriefing = (attackerElo - defenderElo) >= GRIEFING_ELO_GAP;
      const isGriefing = isPowerGriefing || isEloGriefing;

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

      // --- Nargile kılıcı: nadiren (%5 ihtimalle) saldıramaz ---
      const chillItem = getEffect(attacker.equipment, "chill_risk");
      if (chillItem && Math.random() < 0.05) {
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
        logDetails.push(`${attacker.nick}, ${chillItem.name}'in keyfine daldı ve saldıramadan bu seferki hakkını harcadı.`);
        tx.set(doc(collection(db, LOG_COL)), {
          attacker: attacker.nick, defender: defender.nick,
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
        legendaryLog.push(`${defender.nick} üzerindeki ${curseItemName} laneti devreye girdi, savunması zayıfladı.`);
      }

      // Kambur zırhı / Kaymağın kalkanı: savunma çarpanı (artık %50 ihtimalle devreye girer)
      const defMultItem = getEffect(defender.equipment, "defense_multiplier");
      if (defMultItem && effectActivates(defMultItem.effect)) {
        baseDefense *= 1.15;
        legendaryLog.push(`${defender.nick}'in ${defMultItem.name} savunmasını güçlendirdi.`);
      }
      // Kıl dönmesi kılıcı / Emrenin yamuk parmak eldiveni / Gıcık komşunun kolyesi: saldırı çarpanı (%50 ihtimalle)
      const atkMultItem = getEffect(attacker.equipment, "attack_multiplier");
      if (atkMultItem && effectActivates(atkMultItem.effect)) {
        baseAttack *= 1.15;
        legendaryLog.push(`${attacker.nick}'in ${atkMultItem.name} saldırısını güçlendirdi.`);
      }

      // Standart/Nadir eşyalardaki ufak "Keskin/Sağlam" pasifleri: efsanevi
      // çarpanların (~%15) çok altında kalan küçük çeşni bonusları (%2-7 arası,
      // eşya başına). Savaş logunu kalabalıklaştırmamak için sessizce uygulanır.
      const minorAtkPct = getMinorTraitBonusPct(attacker.equipment, "atk_boost");
      if (minorAtkPct > 0) baseAttack *= (1 + minorAtkPct / 100);
      const minorDefPct = getMinorTraitBonusPct(defender.equipment, "def_boost");
      if (minorDefPct > 0) baseDefense *= (1 + minorDefPct / 100);

      // [V2 Faz 6] Günün olayı artık KİŞİSEL: attacker kendi olayının
      // attackMult'unu, defender kendi olayının defenseMult'unu getiriyor.
      baseAttack *= attackerEvent.attackMult;
      baseDefense *= defenderEvent.defenseMult;

      // --- Savaş Simülasyonu (V2 Faz 5) ---
      // Eski tek atışlık "dominance ratio + zar" modeli tamamen kaldırıldı.
      // Artık iki taraf da kendi Saldırı Hızı'na göre bağımsız vuran, Can
      // barını eriten 3 saniyelik gerçek bir çarpışma simüle ediliyor (bkz.
      // simulateBattle3s). Attacker'ın atağı hâlâ baseAttack (yukarıda
      // hesaplanan, curse/çarpan/günün-olayı dahil edilmiş rol statı),
      // defender'ın savunması hâlâ baseDefense (lucky-defense-roll dahil) —
      // ama artık karşı taraf da GERÇEKTEN vuruyor: defender kendi ham
      // Saldırısıyla, attacker kendi ham Savunmasıyla karşılık veriyor.
      let effectiveDefense = baseDefense;
      const luckyDefItem = getEffect(defender.equipment, "lucky_defense_roll");
      if (luckyDefItem && effectActivates(luckyDefItem.effect)) {
        const spread = 0.15 * defenderEvent.varianceMult;
        const rollA = baseDefense * ((1 - spread) + Math.random() * (spread * 2));
        const rollB = baseDefense * ((1 - spread) + Math.random() * (spread * 2));
        effectiveDefense = Math.max(rollA, rollB);
        legendaryLog.push(`${defender.nick}'in şanslı eşyası savunmasını 2 kez yuvarladı, iyisini seçti.`);
      }

      const critItem = getEffect(attacker.equipment, "crit_instant_win");
      const critTriggered = !!(critItem && Math.random() < 0.1);

      let attackPower, defensePower, attackerWins, battleSim = null;

      if (critTriggered) {
        attackPower = baseAttack; defensePower = effectiveDefense;
        attackerWins = true;
        legendaryLog.push(`${attacker.nick}'in ${critItem.name} aniden ısırdı, hesaplama boşa gitti ve anında kazandı!`);
      } else {
        battleSim = simulateBattle3s(
          { atk: baseAttack, def: attacker.defense || BASE_DEFENSE, spd: attacker.speed || 0, crit: attacker.critStat || 0, hp: attacker.maxHp || BASE_HP },
          { atk: defender.attack || BASE_ATTACK, def: effectiveDefense, spd: defender.speed || 0, crit: defender.critStat || 0, hp: defender.maxHp || BASE_HP }
        );
        attackerWins = battleSim.attackerWins;
        attackPower = battleSim.dmgDealtA;
        defensePower = battleSim.dmgDealtD;
        legendaryLog.push(
          battleSim.ko === "timeout"
            ? `3 saniye doldu: ${attacker.nick} ${battleSim.hitsA} vuruş (${battleSim.critHitsA} kritik), ${defender.nick} ${battleSim.hitsD} vuruş (${battleSim.critHitsD} kritik) yaptı — kalan Can yüzdesine göre ${attackerWins ? attacker.nick : defender.nick} kazandı.`
            : `${attackerWins ? defender.nick : attacker.nick} nakavt oldu! (${attacker.nick}: ${battleSim.hitsA} vuruş/${battleSim.critHitsA} kritik, ${defender.nick}: ${battleSim.hitsD} vuruş/${battleSim.critHitsD} kritik)`
        );
      }

      const diff = Math.abs(attackPower - defensePower);

      let attackerPoints = attacker.points || 0;
      let defenderPoints = defender.points || 0;

      let newCurseForDefenderTarget = null; // çingene eldiveni tetiklenirse rakibe (sıradaki savunmasına) yansır

      if (attackerWins) {
        let winPts, losePts;

        if (isGriefing) {
          // Anti-Griefing: eşya bonusları/efektleri DEVRE DIŞI — güçlü/yüksek
          // Elo'lu bir oyuncu çok güçsüz/düşük Elo'lu birine saldırıp
          // kazandığında ödül simgesel (GRIEFING_MIN_WIN_PTS) kalır, savunan
          // hiçbir şey kaybetmez.
          winPts = GRIEFING_MIN_WIN_PTS;
          losePts = 0;
          legendaryLog.push(`⚖️ Anti-Griefing: ${attacker.nick}, kendinden çok daha güçsüz/düşük ligden ${defender.nick}'e saldırdığı için sadece ${GRIEFING_MIN_WIN_PTS} puan kazandı, ${defender.nick} hiçbir şey kaybetmedi.`);
        } else {
          winPts = 10; losePts = 5;

          // Portakal suyu kılıcı / Sarhoş amcanın küpesi: rakip gücünün %30'undan fazla farkla kazanırsa %50 ihtimalle ekstra 2 çalar
          const stealItem = getEffect(attacker.equipment, "steal_extra_on_big_win");
          if (!critTriggered && stealItem && diff > defensePower * 0.3 && effectActivates(stealItem.effect)) {
            winPts += 2; losePts += 2;
            legendaryLog.push(`${attacker.nick}'in ${stealItem.name} ezici farktan ekstra 2 puan çaldı.`);
          }
          // Nargile kılıcı / Gay eldiveni / Keyifli akşamın kolyesi: kazanırsa %50 ihtimalle +3 ekstra
          if (chillItem && effectActivates(chillItem.effect)) {
            winPts += 3;
            legendaryLog.push(`${attacker.nick}'in ${chillItem.name} keyifli bir zafer bonusu verdi (+3).`);
          }
          // Yasin ercile zırhı / Götün zırhı / Devrik minderin kalkanı: defender kaybetse de %30 ihtimalle puan kaybetmez
          const noLossItem = getEffect(defender.equipment, "no_loss_on_defense_lose");
          const reducedLossItem = getEffect(defender.equipment, "reduced_loss");
          const noLossActive = !!(noLossItem && effectActivates(noLossItem.effect));
          const reducedLossActive = !noLossActive && !!(reducedLossItem && effectActivates(reducedLossItem.effect));
          if (noLossActive) {
            losePts = 0;
            legendaryLog.push(`${defender.nick}'in ${noLossItem.name} sayesinde hiç puan kaybetmedi.`);
          }
          // Yırtık menüsküs: kaybederse %45 ihtimalle sadece 2 kaybeder
          else if (reducedLossActive) {
            losePts = Math.min(losePts, 2);
            legendaryLog.push(`${defender.nick}'in ${reducedLossItem.name} sayesinde daha az puan kaybetti.`);
          }
          // Cüce botları / Karanın Airpodsları Kaskı: defender kaybetse bile %35 ihtimalle intikamla 3 puan çalar
          const revengeItem = getEffect(defender.equipment, "revenge_steal");
          if (revengeItem && effectActivates(revengeItem.effect)) {
            winPts = Math.max(0, winPts - 3);
            defenderPoints += 3;
            legendaryLog.push(`${defender.nick}'in ${revengeItem.name} intikam alıp saldırandan 3 puan çaldı.`);
          }
        }

        attackerPoints += Math.round(winPts * attackerEvent.pointsMult);
        defenderPoints = Math.max(0, defenderPoints - Math.round(losePts * attackerEvent.pointsMult));

        // Çingene eldiveni / Nazarlıklı amcanın kolyesi: kazanırsa %35 ihtimalle rakibe lanet
        // (Anti-Griefing sırasında devre dışı: güçsüz savunanı ekstra bir statüsle cezalandırmamak için)
        const curseItem = getEffect(attacker.equipment, "curse_defense_next");
        if (!isGriefing && curseItem && effectActivates(curseItem.effect)) {
          newCurseForDefenderTarget = { active: true, reduction: 0.2, itemName: curseItem.name };
          legendaryLog.push(`${attacker.nick}'in ${curseItem.name} ${defender.nick}'e lanet okudu.`);
        }

        logDetails.push(pickBattleMessage({ attackerWins: true, attackerName: attacker.nick, defenderName: defender.nick, winPts, losePts, isRepeat, repeatCount }));
      } else {
        let winPts = 5, losePts = 3;

        // Dana kaskı: savunmada kazanırsa %45 ihtimalle +5 ekstra
        const bonusDefItem = getEffect(defender.equipment, "bonus_win_defense");
        if (bonusDefItem && effectActivates(bonusDefItem.effect)) {
          winPts += 5;
          legendaryLog.push(`${defender.nick}'in ${bonusDefItem.name} savunma zaferine +5 bonus kattı.`);
        }

        defenderPoints += Math.round(winPts * attackerEvent.pointsMult);
        attackerPoints = Math.max(0, attackerPoints - Math.round(losePts * attackerEvent.pointsMult));

        logDetails.push(pickBattleMessage({ attackerWins: false, attackerName: attacker.nick, defenderName: defender.nick, winPts, losePts, isRepeat, repeatCount }));
      }

      // 👑 1.lik Avı: zirvedeki oyuncuyu yenersen ekstra bonus puan
      if (attackerWins && isThroneTarget) {
        attackerPoints += THRONE_BONUS_POINTS;
        legendaryLog.push(`👑 ${attacker.nick}, zirvedeki ${defender.nick}'i deviren 1.lik Avı bonusuyla +${THRONE_BONUS_POINTS} ekstra puan kazandı!`);
      }

      // 💀 Kelle Avcısı: aktif ilan bu hedefse ve saldıran kazandıysa ödülü kapar
      let attackerScrapGain = 0;
      let bountyClearPayload = null;
      if (attackerWins && bounty && bounty.active && bounty.targetId === defenderId) {
        const bountyBoostPct = getMinorTraitBonusPct(attacker.equipment, "bounty_boost");
        attackerScrapGain = Math.round((bounty.amount || 0) * (1 + bountyBoostPct / 100));
        bountyClearPayload = { active: false, targetId: null, targetName: null, amount: 0, placedById: null, placedByName: null };
        legendaryLog.push(`💀 ${attacker.nick}, ${defender.nick}'in kellesindeki ödülü kapıp ${attackerScrapGain} hurda kazandı!`);
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
      const defenderStats = computeUpdatedStats(defender, !attackerWins, false, S.currentPlayerId);

      // [V2 Faz 5] Elo/Lig güncellemesi: standart Elo formülü, ama Anti-Griefing
      // durumunda (güçlüyken çok zayıfı yenmek) K-faktörü ÇOK küçültülür — yani
      // griefing puanı bastırdığı gibi Elo kazancını da neredeyse bastırır.
      const eloKFactor = (isGriefing && attackerWins) ? GRIEFING_ELO_K_FACTOR : ELO_K_FACTOR;
      const attackerEloDelta = computeEloDelta(attackerElo, defenderElo, attackerWins ? 1 : 0, eloKFactor);
      const defenderEloDelta = computeEloDelta(defenderElo, attackerElo, attackerWins ? 0 : 1, eloKFactor);
      const newAttackerElo = Math.max(0, attackerElo + attackerEloDelta);
      const newDefenderElo = Math.max(0, defenderElo + defenderEloDelta);

      // [V2 Faz 3] Savaş XP: kazanan daha çok, kaybeden az miktarda teselli XP'si alır.
      const attackerXpResult = applyXpGain(attacker, attackerWins ? XP_PER_BATTLE_WIN : XP_PER_BATTLE_LOSS);
      const defenderXpResult = applyXpGain(defender, attackerWins ? XP_PER_BATTLE_LOSS : XP_PER_BATTLE_WIN);

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
      if (attackerScrapGain > 0) {
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
        elo: newAttackerElo,
        scrap: getScrap(attacker) + attackerScrapGain,
        lastAttackTime: Date.now(),
        lastAttackWindow: currentWindow,
        lastAttackedId: defenderId,
        attackStreakOnTarget: repeatCount,
        targetCooldowns: newTargetCooldowns,
        stats: attackerStats,
        dailyStatsDay: today,
        dailyWins: attackerDailyWins,
        dailyLosses: attackerDailyLosses,
        level: attackerXpResult.level,
        xp: attackerXpResult.xp,
        statPoints: attackerXpResult.statPoints,
        ...(attackerScrapGain > 0 ? { bountyWinsTotal: (attacker.bountyWinsTotal || 0) + 1 } : {}),
        ...(attacker.curseNextAttack ? { curseNextAttack: null } : {}),
        ...(attackerQuests !== attacker.dailyQuests ? { dailyQuests: attackerQuests } : {}),
        ...(attackerWeeklyQuests !== attacker.weeklyQuests ? { weeklyQuests: attackerWeeklyQuests } : {}),
        ...(attackerMonthlyQuests !== attacker.monthlyQuests ? { monthlyQuests: attackerMonthlyQuests } : {})
      });
      tx.update(defenderRef, {
        points: defenderPoints,
        elo: newDefenderElo,
        stats: defenderStats,
        dailyStatsDay: today,
        dailyWins: defenderDailyWins,
        dailyLosses: defenderDailyLosses,
        level: defenderXpResult.level,
        xp: defenderXpResult.xp,
        statPoints: defenderXpResult.statPoints,
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
        attacker: attacker.nick,
        defender: defender.nick,
        message: mainMessage,
        effects: legendaryLog,
        winner: attackerWins ? attacker.nick : defender.nick,
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
    S.attackInProgress = false;
    renderAttackTargets();
  }
}

export function showResultModal(result) {
  if (result.oracle) {
    playSound(result.won ? "win" : "lose");
    resultContent.innerHTML = `
      <div class="result-title ${result.won ? "win" : "lose"}">${result.won ? "🔮 Kahin Haklı Çıktı!" : "🔮 Kahin Yanıldı"}</div>
      <p class="result-line">${result.targetName} için ${result.amount} hurda yatırmıştın.</p>
      <p class="result-line">${result.won ? `Tahminin doğru çıktı, +${result.reward} hurda kazandın!` : "Bu sefer tutmadı, yatırdığın hurda gitti."}</p>`;
    resultModal.classList.remove("hidden");
    return;
  }
  if (result.skipped) {
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

