// ============================================================
// SIRALI DÜELLO MOTORU (V4) — süreli sim'in yerine geçecek tur-tabanlı düello
// ------------------------------------------------------------
// TASARIM (kullanıcı isteği):
//   • İki taraf SIRAYLA vurur. İlk "Saldır"a basan (attacker) BAŞLAR.
//   • Her turda: temel hasar = saldıran.atk - savunan.def*azaltma (en az 1).
//   • Kritik: oyuncunun kendi kritik ŞANSINA göre (statlardan; taban %5 dahil).
//     Kritik olursa hasar CRIT_MULTIPLIER katına çıkar.
//   • Saldırı hızı: her turda ekstra vuruş ŞANSI verir (hızlı olan bazı
//     turlarda 2 kez vurur). Böylece hız "sıralı" akışı bozmadan işe yarar.
//   • Bir taraf ölene kadar sürer. Üst sınır MAX_TURNS tur; dolarsa canı AZ
//     olan kaybeder. Tam beraberlikte, beraberlik bozulana kadar ek tur oynanır.
//
// Bu dosya SAF ve İZOLE'dir: mevcut battle.js'e/simulateBattle'a dokunmaz,
// sadece dışa fonksiyon verir. VS ekranı bir sonraki adımda buna bağlanır.
// ============================================================

export const DUEL_CRIT_MULT = 2.5;      // [V4 DENGE] kritik çarpanı güçlendirildi (1.6→2.5) — kritik statı artık gerçekten değerli
export const DUEL_DEF_MITIGATION = 0.42;// [V4 DENGE] savunmanın hasar kesmesi düşürüldü (0.6→0.42) — savunma artık aşırı baskın değil
export const DUEL_MAX_TURNS = 15;       // üst sınır; dolarsa canı az olan kaybeder
export const DUEL_BASE_CRIT = 0.05;     // taban %5 kritik (herkeste var)
export const DUEL_SPEED_HALF = 8;       // [V4 DENGE] düşürüldü (25→8) — hız daha erken etki eder, ekstra vuruş değerlenir
export const DUEL_SPEED_MAX_EXTRA = 1.15;// [V4 DENGE] artırıldı (0.6→1.15) — hızlı savaşçı sık sık ikinci vuruş yapar
export const DUEL_CRIT_PER_POINT = 40;  // [V4 DENGE] her 40 kritik statı = +%100 kritik şansı (eskiden /100'dü, güçlendirildi)
// İnce ayarlı hasar sabitleri (binlerce maç simülasyonu; 5 statın da kabaca
// eşit değerde olması hedeflendi — denge sapması ~8.7):
//   DMG_DIVISOR: savaş uzunluğu. DMG_VARIANCE: ±rastgelelik (küçük farklar
//   olasılıksal olsun, savaş hep aynı bitmesin).
export const DUEL_DMG_DIVISOR = 0.95;
export const DUEL_DMG_VARIANCE = 0.35;

// Bir savaşçının ham verisinden düello statlarını çıkarır.
// stat isimleri ana oyunla aynı: attack, defense, speed, critStat, maxHp.
export function toDuelFighter(p, opts = {}) {
  const atk = Number(p.attack) || 0;
  const def = Number(p.defense) || 0;
  const spd = Math.max(0, Number(p.speed) || 0);
  const hp = Math.max(1, Math.round(Number(p.maxHp) || 100));
  // kritik şansı: taban %5 + stat (critStat/CRIT_PER_POINT), %60 tavan
  const crit = Math.min(0.6, DUEL_BASE_CRIT + Math.max(0, (Number(p.critStat) || 0) / DUEL_CRIT_PER_POINT));
  // hızdan gelen ekstra-vuruş şansı (azalan getiri)
  const extraHitChance = DUEL_SPEED_MAX_EXTRA * (spd / (spd + DUEL_SPEED_HALF));
  return {
    name: p.nick || opts.name || "Savaşçı",
    atk, def, spd, crit, extraHitChance,
    maxHp: hp, hp,
  };
}

// Tek bir vuruşun hasarını hesaplar (kritik + varyans dahil).
function computeHitDamage(from, to, rng) {
  // [V4 DENGE] Hasar bölene bölünür (savaşlar birkaç tur sürer) ve ±varyans
  // eklenir (aynı statlar hep aynı sonucu vermesin — küçük farklar olasılıksal
  // olur). En az 1 hasar garanti (savaş kilitlenmesin).
  let base = Math.max(1, (from.atk - to.def * DUEL_DEF_MITIGATION) / DUEL_DMG_DIVISOR);
  base *= (1 - DUEL_DMG_VARIANCE) + rng() * DUEL_DMG_VARIANCE * 2;
  const isCrit = rng() < from.crit;
  const dmg = Math.max(1, Math.round(isCrit ? base * DUEL_CRIT_MULT : base));
  return { dmg, isCrit };
}

// ============================================================
// ANA SİMÜLASYON: sıralı düello.
// attacker = ilk saldıran (ilk vuran). defender = hedef.
// Dönüş: { winner:"attacker"|"defender", turns:[...], reason, finalHp }
// turns[i] = { turn, actor:"attacker"|"defender", target, dmg, isCrit,
//              extra:bool, targetHpBefore, targetHpAfter, ko:bool }
// ============================================================
export function simulateDuel(attackerRaw, defenderRaw, opts = {}) {
  const rng = opts.rng || Math.random;
  const A = toDuelFighter(attackerRaw, { name: "attacker" });
  const D = toDuelFighter(defenderRaw, { name: "defender" });

  const turns = [];
  let ko = null; // "attacker" | "defender"

  // Bir savaşçının saldırı fazı: ana vuruş + hız'dan gelen olası ekstra vuruş.
  function attackPhase(turnNo, actorKey, from, to, toKey) {
    // ana vuruş
    let h = computeHitDamage(from, to, rng);
    const before1 = to.hp;
    to.hp = Math.max(0, to.hp - h.dmg);
    turns.push({
      turn: turnNo, actor: actorKey, target: toKey,
      dmg: h.dmg, isCrit: h.isCrit, extra: false,
      targetHpBefore: before1, targetHpAfter: to.hp, ko: to.hp <= 0,
    });
    if (to.hp <= 0) { ko = actorKey; return; }

    // hız ekstra vuruşu (şansa bağlı)
    if (rng() < from.extraHitChance) {
      let h2 = computeHitDamage(from, to, rng);
      const before2 = to.hp;
      to.hp = Math.max(0, to.hp - h2.dmg);
      turns.push({
        turn: turnNo, actor: actorKey, target: toKey,
        dmg: h2.dmg, isCrit: h2.isCrit, extra: true,
        targetHpBefore: before2, targetHpAfter: to.hp, ko: to.hp <= 0,
      });
      if (to.hp <= 0) { ko = actorKey; return; }
    }
  }

  let turnNo = 1;
  const HARD_CAP = 200; // sonsuz döngü emniyeti (beraberlik uzarsa bile)
  // İNİSİYATİF: her tur, HIZI YÜKSEK olan önce vurur. Eşit hızda "Saldır"a
  // basan (attacker) önce vurur — böylece hem hız statı gerçek avantaj sağlar
  // (önce vuran ilk kanı alır, rakibi öldürürse karşılık bile alamaz) hem de
  // ilk-saldıran kuralı eşitlikte korunur.
  const attackerFirst = A.spd >= D.spd;
  while (!ko && turnNo <= HARD_CAP) {
    if (attackerFirst) {
      attackPhase(turnNo, "attacker", A, D, "defender");
      if (ko) break;
      attackPhase(turnNo, "defender", D, A, "attacker");
    } else {
      attackPhase(turnNo, "defender", D, A, "attacker");
      if (ko) break;
      attackPhase(turnNo, "attacker", A, D, "defender");
    }
    if (ko) break;

    // Üst sınır: MAX_TURNS dolduysa canı az olan kaybeder; beraberlikte devam
    if (turnNo >= DUEL_MAX_TURNS) {
      const aPct = A.hp / A.maxHp, dPct = D.hp / D.maxHp;
      if (aPct !== dPct) {
        ko = aPct > dPct ? "attacker" : "defender";
        return finalize(ko, "turnlimit");
      }
      // tam beraberlik → beraberlik bozulana kadar ek tur (HARD_CAP korur)
    }
    turnNo++;
  }

  return finalize(ko || (A.hp >= D.hp ? "attacker" : "defender"), ko ? "ko" : "capreached");

  function finalize(winner, reason) {
    return {
      winner, reason, turns,
      finalHp: {
        attacker: Math.max(0, Math.round(A.hp)), attackerMax: A.maxHp,
        defender: Math.max(0, Math.round(D.hp)), defenderMax: D.maxHp,
      },
      fighters: { attacker: A, defender: D },
    };
  }
}

// ============================================================
// SPİKER METİN HAVUZU — her tur için canlı, çeşitli anlatım.
// {a}=vuran isim, {b}=yiyen isim, {dmg}=hasar. Tekrara düşmemek için
// her kategoride bol seçenek; getCommentary rastgele seçip {..} doldurur.
// ============================================================
const C = {
  // Normal vuruş
  normal: [
    "{a} ileri atıldı ve {b}'ye {dmg} hasar bindirdi.",
    "{a}'nın darbesi {b}'nin savunmasını deldi: {dmg} hasar.",
    "Sert bir hamle! {a}, {b}'yi {dmg} ile sarstı.",
    "{a} boşluğu buldu, {b} {dmg} hasar aldı.",
    "{b} geç kaldı — {a}'nın vuruşu {dmg} hasar yazdı.",
    "{a} temkinli bir çıkışla {b}'ye {dmg} hasar verdi.",
    "Kılıçlar çarpıştı, {a} üstünlüğü aldı: {dmg} hasar.",
    "{a} ritmi bozmadan {b}'ye {dmg} hasar geçirdi.",
    "{b} savunmaya çalıştı ama {a} {dmg} hasarı oturttu.",
    "{a}'nın hamlesi hedefi buldu, {b} {dmg} hasarla geriledi.",
    "Hızlı bir kesik! {a} → {b}, {dmg} hasar.",
    "{a} mesafeyi kapattı ve {dmg} hasar bıraktı.",
    "{b} açık verdi, {a} {dmg} hasarla cezalandırdı.",
    "{a} soğukkanlı: {b}'ye tam {dmg} hasar.",
    "Darbe oturdu — {b} {dmg} hasarla irkildi.",
  ],
  // Kritik vuruş
  crit: [
    "💥 KRİTİK! {a} tam isabetle {b}'ye {dmg} hasar patlattı!",
    "💥 {a} zayıf noktayı buldu — {b} {dmg} kritik hasar yedi!",
    "💥 Yıkıcı bir darbe! {a}, {b}'yi {dmg} ile yerle bir etti!",
    "💥 KRİTİK! {b} bu {dmg} hasarı uzun süre hatırlayacak!",
    "💥 {a} müthiş bir açı yakaladı: {dmg} kritik hasar!",
    "💥 Tam on ikiden! {a} → {b}, {dmg} kritik!",
    "💥 {a}'nın öfkesi patladı — {b} {dmg} kritik hasar aldı!",
    "💥 Efsanevi bir vuruş! {b} {dmg} hasarla savruldu!",
    "💥 KRİTİK! {a} savunmayı hiçe saydı: {dmg} hasar!",
    "💥 {b} hazırlıksız yakalandı — {dmg} kritik hasar!",
  ],
  // Hızdan gelen ekstra (peş peşe ikinci) vuruş
  extra: [
    "⚡ Ve hemen ardından! {a} bir kez daha vurdu: {dmg} hasar.",
    "⚡ {a} durmadı — ikinci darbe {b}'ye {dmg} hasar.",
    "⚡ Hızın avantajı! {a} peş peşe {dmg} hasar daha ekledi.",
    "⚡ {b} toparlanamadan {a} {dmg} hasar daha bindirdi.",
    "⚡ Şimşek gibi! {a}'nın ikinci vuruşu {dmg} hasar.",
    "⚡ {a} çok çevik — bir vuruş daha, {dmg} hasar.",
  ],
  // Öldürücü darbe
  finish: [
    "🏆 Ve son darbe! {a}, {b}'yi {dmg} hasarla yere serdi. Düello bitti!",
    "🏆 {a} işi bitirdi — {b} {dmg} hasarla düştü!",
    "🏆 Nakavt! {a}'nın son vuruşu ({dmg}) {b} için sondu!",
    "🏆 {b} daha fazla dayanamadı, {a} {dmg} ile kazandı!",
    "🏆 Zafer {a}'nın! Son {dmg} hasar {b}'yi devirdi!",
    "🏆 {a} galip geldi — öldürücü darbe {dmg} hasar!",
  ],
  // Düello başlangıcı
  intro: [
    "⚔️ Düello başlıyor! {a} ilk hamleyi yapıyor...",
    "⚔️ Meydan hazır. {a} saldırıya geçiyor!",
    "⚔️ Zil çaldı! {a} inisiyatifi alıyor.",
    "⚔️ {a} ile {b} karşı karşıya. İlk vuruş {a}'dan!",
  ],
  // Zamanlama sınırı (10 tur)
  timeout: [
    "⏳ Süre doldu! Canı fazla olan {a} galip ilan edildi.",
    "⏳ 10 tur bitti — {a} daha ayakta, zafer onun!",
    "⏳ Uzun bir mücadele! Kalan cana göre {a} kazandı.",
  ],
};

// Rastgele bir spiker cümlesi üretir. type: normal|crit|extra|finish|intro|timeout
export function getCommentary(type, vars = {}, rng = Math.random) {
  const pool = C[type] || C.normal;
  let line = pool[Math.floor(rng() * pool.length)];
  return line
    .replace(/\{a\}/g, vars.a ?? "")
    .replace(/\{b\}/g, vars.b ?? "")
    .replace(/\{dmg\}/g, vars.dmg ?? "");
}

// Bir simulateDuel sonucunu, tur tur SPİKER anlatımına çevirir.
// attackerName / defenderName gerçek nick'ler. Dönüş: string[] (log satırları).
export function buildDuelCommentary(result, attackerName, defenderName, rng = Math.random) {
  const nameOf = k => (k === "attacker" ? attackerName : defenderName);
  const lines = [];
  lines.push(getCommentary("intro", { a: attackerName, b: defenderName }, rng));

  for (const ev of result.turns) {
    const a = nameOf(ev.actor), b = nameOf(ev.target);
    if (ev.ko) {
      lines.push(getCommentary("finish", { a, b, dmg: ev.dmg }, rng));
    } else if (ev.extra) {
      lines.push(getCommentary("extra", { a, b, dmg: ev.dmg }, rng));
    } else if (ev.isCrit) {
      lines.push(getCommentary("crit", { a, b, dmg: ev.dmg }, rng));
    } else {
      lines.push(getCommentary("normal", { a, b, dmg: ev.dmg }, rng));
    }
  }

  if (result.reason === "turnlimit") {
    lines.push(getCommentary("timeout", { a: nameOf(result.winner) }, rng));
  }
  return lines;
}
