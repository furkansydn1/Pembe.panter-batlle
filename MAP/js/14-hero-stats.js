// ============================================================
// KAHRAMAN STATLARI (ANA OYUN → MAP)
// Ana oyundaki map.js, "Diyara Gir"e basıldığında oyuncunun gerçek
// statlarını localStorage'daki "ppbMapHeroStats" anahtarına yazar.
// Bu dosya o statları okur ve haritadaki oyuncuya uygular:
//   Saldırı  → canavara verilen hasar çarpanı
//   Savunma  → canavardan gelen hasarı azaltma
//   Can      → haritadaki maksimum can (hesaptaki maxHp birebir)
//   Hız      → saldırı bekleme süresini kısaltır (battle.js eğrisiyle aynı)
//   Kritik   → vuruşların bir kısmı 1.6x hasar (battle.js ile aynı çarpan)
//
// KURULUM: MAP/index.html'de bu satırı 12-main.js'ten ÖNCE ekle:
//   <script src="js/14-hero-stats.js"></script>
//
// DENGE (MAP 1 — Unutulmuş Orman): hiç eşyası olmayan oyuncu bugünkü
// zorlukta oynar (çarpan 1.0). Full sıradan eşyalı oyuncu ~2x hasar +
// ~%40 hasar azaltma alır (rahat keser), +basılmış eşyalarla daha da
// güçlenir. Üst haritalar geldiğinde canavar tarafı ayrıca ölçeklenecek.
// Ayar sabitleri aşağıda — denge oynamak istersen sadece bunları değiştir.
// ============================================================
(function () {
  // ---- AYAR SABİTLERİ (map1 dengesi) ----
  var ATK_SCALE = 30;        // eşyadan gelen bu kadar Saldırı = +1x hasar çarpanı
  var DMG_MULT_CAP = 6;      // hasar çarpanı tavanı (yüksek seviye map1'i ezsin ama sınırlı)
  var DEF_K = 40;            // savunma azalan-getiri sabiti: azaltma = def/(def+DEF_K)
  var DEF_REDUCTION_CAP = 0.8; // gelen hasar en fazla %80 azalır
  var CRIT_CHANCE_CAP = 0.5; // battle.js ile aynı: kritik şansı %50 tavan
  var CRIT_MULTIPLIER = 1.6; // battle.js ile aynı: kritik hasar çarpanı
  var BASE_CRIT_CHANCE = 0.05; // [V4] TABAN kritik: eşyasız oyuncu bile %5 kritik atar (core-config BASE_CRIT ile eşleşir)
  var SPD_HALF_VALUE = 25;   // battle.js ile aynı: bu kadar Hız, maks bonusun yarısı
  var MAX_ASPD_MULT = 3;     // battle.js ile aynı: hız tavanı

  // ---- STATLARI OKU ----
  var raw = null;
  try { raw = JSON.parse(localStorage.getItem("ppbMapHeroStats") || "null"); } catch (e) { raw = null; }
  var hero = raw || {};
  var baseAtk = Number(hero.baseAttack) || 0;
  var baseDef = Number(hero.baseDefense) || 0;
  var itemAtk = Math.max(0, (Number(hero.attack) || baseAtk) - baseAtk);
  var itemDef = Math.max(0, (Number(hero.defense) || baseDef) - baseDef);

  var dmgMult = Math.min(DMG_MULT_CAP, 1 + itemAtk / ATK_SCALE);
  var defReduction = Math.min(DEF_REDUCTION_CAP, itemDef / (itemDef + DEF_K));
  // Kritik = TABAN (%5) + eşyalardan gelen critStat. Böylece eşyasız oyuncu bile
  // %5 kritik atar, eşya topladıkça artar (tavan CRIT_CHANCE_CAP = %50).
  var critChance = Math.min(CRIT_CHANCE_CAP, BASE_CRIT_CHANCE + Math.max(0, (Number(hero.critStat) || 0) / 100));
  // [V4] Kritik olasılığını KÖPRÜ global'ine yaz — 05-effects.js'teki rollPlayerHit
  // bunu okuyup kritik zarını atıyor (görsel juice + KRİTİK yazısı orada). Böylece
  // kritik TEK yerde (rollPlayerHit) atılıyor, buradaki setter artık kritik ATMIYOR.
  if (typeof window !== "undefined") window.__mapCritChance = critChance;
  var spd = Math.max(0, Number(hero.speed) || 0);
  var aspdMult = 1 + (MAX_ASPD_MULT - 1) * (spd / (spd + SPD_HALF_VALUE));
  var heroMaxHp = Math.max(100, Math.round(Number(hero.maxHp) || 100));

  if (typeof player === "undefined") {
    console.warn("[Kahraman statları] player bulunamadı — script sırası bozuk olabilir, statlar uygulanmadı.");
    return;
  }

  // ---- CAN: bar 100 ölçeğinde kalır, bonus can hasar kırpmasına çevrilir ----
  // MAP'in can barı %100 = 100 HP varsayımıyla çizili; maxHp'yi 250 yapmak
  // barı tavana kilitliyordu. Bunun yerine can 100'de tutulur ve gelen hasar
  // (100 / gerçekCan) oranıyla küçültülür — hayatta kalma süresi matematiksel
  // olarak birebir aynı, bar ise her vuruşta doğru oranda düşer.
  var hpFactor = 100 / heroMaxHp; // heroMaxHp >= 100 garantili, faktör <= 1
  player.maxHp = 100;
  player.hp = 100;

  // ---- PUAN: HUD'daki yerel test sayacını (20) gerçek hesap puanıyla değiştir ----
  // Not: bu SADECE gösterge — gerçek ceza, hesap köprüsü üzerinden ölüm
  // sayısına göre ana oyunda işlenmeye devam ediyor (bkz. 13-account-bridge).
  if (typeof playerPoints !== "undefined" && typeof hero.points === "number") {
    playerPoints = Math.max(0, Math.round(hero.points));
    if (typeof pointsLabelEl !== "undefined" && pointsLabelEl) pointsLabelEl.textContent = playerPoints;
  }

  // ---- SAVUNMA: player.hp'ye gelen DÜŞÜŞLERİ azalt ----
  // Canavar dosyaları "player.hp -= hasar" yazar; buradaki setter araya
  // girip hasarı savunma oranıyla küçültür (en az 1 hasar geçer). Artışlar
  // (yeniden doğma vb.) olduğu gibi geçer. Canavar dosyalarına dokunmadan
  // savunmayı işletmenin en güvenli yolu bu.
  (function () {
    var hpVal = player.hp;
    Object.defineProperty(player, "hp", {
      configurable: true,
      get: function () { return hpVal; },
      set: function (v) {
        if (typeof v === "number" && v < hpVal) {
          var incoming = hpVal - v;
          var reduced = Math.max(1, Math.round(incoming * (1 - defReduction) * hpFactor));
          hpVal = hpVal - reduced;
        } else {
          hpVal = v;
        }
      }
    });
  })();

  // ---- HIZ: yeni saldırı bekleme süresi atanırken kısalt ----
  // Saldırı "player.attackCooldown = ATTACK_COOLDOWN" ile tazelenir (mevcut
  // değer <= 0 iken). Setter, sadece YUKARI yönlü atamaları (taze cooldown)
  // hız çarpanına böler; "-= dt" ile azalan atamalar olduğu gibi geçer.
  (function () {
    var cdVal = player.attackCooldown || 0;
    Object.defineProperty(player, "attackCooldown", {
      configurable: true,
      get: function () { return cdVal; },
      set: function (v) {
        if (typeof v === "number" && v > cdVal) cdVal = v / aspdMult;
        else cdVal = v;
      }
    });
  })();

  // ---- SALDIRI: canavar hp'sine gelen düşüşleri saldırı çarpanıyla büyüt ----
  // Canavar dosyaları "canavar.hp -= hasar" yazar; setter hasarı dmgMult ile
  // büyütür. [V4] KRİTİK BURADAN KALDIRILDI — kritik artık tek yerde,
  // rollPlayerHit'te (05-effects) atılıyor ve hitJuice görsel efekti + "KRİTİK"
  // yazısını orada gösteriyor. Burada da kritik atılırsa ÇİFT kritik olurdu.
  function instrumentEnemy(e) {
    if (!e || e.__heroStatsApplied) return;
    e.__heroStatsApplied = true;
    var hpVal = e.hp;
    Object.defineProperty(e, "hp", {
      configurable: true,
      get: function () { return hpVal; },
      set: function (v) {
        if (typeof v === "number" && v < hpVal) {
          var dmg = (hpVal - v) * dmgMult;
          hpVal = hpVal - dmg;
        } else {
          hpVal = v;
        }
      }
    });
  }

  function instrumentAll() {
    try {
      if (typeof orcs !== "undefined") for (var i = 0; i < orcs.length; i++) instrumentEnemy(orcs[i]);
      if (typeof soldiers !== "undefined") for (var j = 0; j < soldiers.length; j++) instrumentEnemy(soldiers[j]);
      if (typeof goblins !== "undefined") for (var k = 0; k < goblins.length; k++) instrumentEnemy(goblins[k]);
      if (typeof archers !== "undefined") for (var m = 0; m < archers.length; m++) instrumentEnemy(archers[m]); // [KALE]
    } catch (e) { /* diziler henüz kurulmadıysa sonraki taramada takılır */ }
  }
  instrumentAll();
  setInterval(instrumentAll, 250);

  console.log(
    "[Kahraman statları] Hasar x" + dmgMult.toFixed(2) +
    " | Hasar azaltma %" + Math.round(defReduction * 100) +
    " | Can " + heroMaxHp + " (bar 100 ölçeğinde)" +
    " | Saldırı hızı x" + aspdMult.toFixed(2) +
    " | Kritik %" + Math.round(critChance * 100)
  );
})();
