// ============================================================
// HUD CANLANDIRMA (15-hud.js)
// Sayaçları oyun kodu doldurur (04-economy → rareLabel/itemsLabel/
// legendaryLabel, 03-player → hpLabel, 14-hero-stats → pointsLabel).
// Bu dosya süsleme katmanıdır:
//   1) Can barı: genişlik + maksimum can + düşük-can nabzı
//   2) EXP barı: gerçek seviye ilerlemesi (Diyara Gir'den gelen xp/xpNeed
//      + haritada kazanılan sessionExp) — dolunca altın ışıma
//   3) Mühürdeki seviye + plakadaki oyuncu adı
//   4) Sayaç değişince altın "pıt" animasyonu
// index.html'de 12-main.js'ten SONRA yüklenir.
// ============================================================
(function () {
  function boot() {
    console.log("[HUD] aktif — bar canlandirma calisiyor");

    // ---- 3) Seviye + oyuncu adı + EXP taban verisi ----
    var heroData = null;
    try { heroData = JSON.parse(localStorage.getItem("ppbMapHeroStats") || "null"); } catch (e) { heroData = null; }
    if (heroData) {
      var lvlEl = document.getElementById("levelLabel");
      if (lvlEl && heroData.level) lvlEl.textContent = heroData.level;
      var nameEl = document.getElementById("heroNameLabel");
      if (nameEl && heroData.nick) nameEl.textContent = heroData.nick;
    }
    var xpBase = heroData && typeof heroData.xp === "number" ? heroData.xp : 0;
    var xpNeed = heroData && typeof heroData.xpNeed === "number" && heroData.xpNeed > 0
      ? heroData.xpNeed : 100; // veri yoksa 100'lük yedek bar

    // ---- 4) Sayaç değişince "pıt" ----
    var bumpIds = ["rareLabel", "itemsLabel", "legendaryLabel", "pointsLabel", "expCurLabel", "standardItemLabel", "rareItemLabel"];
    for (var i = 0; i < bumpIds.length; i++) {
      (function (el) {
        if (!el || typeof MutationObserver === "undefined") return;
        new MutationObserver(function () {
          el.classList.remove("bump");
          void el.offsetWidth; // reflow: animasyon yeniden tetiklensin
          el.classList.add("bump");
        }).observe(el, { childList: true, characterData: true, subtree: true });
      })(document.getElementById(bumpIds[i]));
    }

    // ---- 1) Can barı + 2) EXP barı ----
    var hpFill = document.getElementById("hpBarFill");
    var hpMaxEl = document.getElementById("hpMaxLabel");
    var hpBox = document.getElementById("hpBarBox");
    var expFill = document.getElementById("expBarFill");
    var expBox = document.getElementById("expBarBox");
    var expCurEl = document.getElementById("expCurLabel");
    var expMaxEl = document.getElementById("expMaxLabel");
    if (expMaxEl) expMaxEl.textContent = xpNeed;

    var prevHp = -1, prevMax = -1, prevExp = -1;
    setInterval(function () {
      try {
        // CAN
        if (typeof player !== "undefined" && typeof player.hp === "number") {
          var hp = Math.max(0, Math.round(player.hp));
          var mx = Math.max(1, Math.round(player.maxHp || 100));
          if (hp !== prevHp || mx !== prevMax) {
            prevHp = hp; prevMax = mx;
            if (hpMaxEl) hpMaxEl.textContent = mx;
            if (hpFill) hpFill.style.width = Math.max(0, Math.min(100, (hp / mx) * 100)) + "%";
            if (hpBox) hpBox.classList.toggle("low", hp / mx < 0.3);
          }
        }
        // EXP — hesap XP'si + bu oturumda kazanılan
        if (typeof sessionExp === "number" && sessionExp !== prevExp) {
          prevExp = sessionExp;
          var cur = xpBase + sessionExp;
          if (expCurEl) expCurEl.textContent = cur;
          var frac = Math.max(0, Math.min(1, cur / xpNeed));
          if (expFill) expFill.style.width = (frac * 100) + "%";
          if (expBox) expBox.classList.toggle("full", cur >= xpNeed);
        }
      } catch (e) { /* oyun globalleri hazır değilse sonraki turda */ }
    }, 100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
