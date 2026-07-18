// ============================================================
// HESAP KÖPRÜSÜ (MAP → ANA OYUN)
// Bu dosya 04-economy.js'teki oturum sayaçlarını izler ve kazanılan
// farkı birkaç saniyede bir localStorage'daki "ppbMapPending" anahtarına
// BİRİKTİREREK yazar. Ana oyundaki js/map.js (claimMapFarmRewards) bu
// anahtarı okuyup gerçek Firebase hesabına işler ve temizler.
//
// KURULUM: MAP/index.html'de bu satırı 12-main.js'ten ÖNCE ekle:
//   <script src="js/13-account-bridge.js"></script>
//
// Hesaba işlenenler: Sıradan Kitap → books.standart, Hurda → scrap,
// EXP → xp/seviye, her ölüm → -1 Puan.
// Hesaba İŞLENMEYENLER (ana oyunda karşılığı olan alan/sistem yok):
// Altın (gold alanı Faz 4'te gelecek), Toz, Efsanevi/Nadir/Sıradan Eşya
// (gerçek eşya üretimi kutu motorundan geçmeli). Bunlar şimdilik sadece
// harita içi gösterge olarak kalıyor.
// ============================================================
(function () {
  const KEY = "ppbMapPending";
  const SYNC_INTERVAL_MS = 3000;

  // Son senkronda sayaçlar ne durumdaydı — fark (delta) bunun üstünden hesaplanır.
  let last = { book: 0, scrap: 0, xp: 0, deaths: 0, gold: 0 };

  function readCounters() {
    // Sayaçlar 04-economy.js'te top-level let olarak tanımlı; tüm klasik
    // script'ler aynı global kapsamı paylaştığı için buradan görünürler.
    // typeof kontrolü: dosya sırası bozulursa köprü çökmesin, sessizce dursun.
    return {
      book: typeof sessionItems === "number" ? sessionItems : 0,        // "Sıradan Kitap"
      scrap: typeof sessionLegendary === "number" ? sessionLegendary : 0, // "Hurda" sayacı
      xp: typeof sessionExp === "number" ? sessionExp : 0,
      deaths: typeof sessionDeaths === "number" ? sessionDeaths : 0,
      gold: typeof sessionRare === "number" ? sessionRare : 0             // "Altın" sayacı
    };
  }

  function flush() {
    const cur = readCounters();
    const delta = {
      book: cur.book - last.book,
      scrap: cur.scrap - last.scrap,
      xp: cur.xp - last.xp,
      deaths: cur.deaths - last.deaths,
      gold: cur.gold - last.gold
    };
    if (delta.book <= 0 && delta.scrap <= 0 && delta.xp <= 0 && delta.deaths <= 0 && delta.gold <= 0) return;

    let pending = {};
    try { pending = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { pending = {}; }
    pending.bookStandart = (pending.bookStandart || 0) + Math.max(0, delta.book);
    pending.scrap = (pending.scrap || 0) + Math.max(0, delta.scrap);
    pending.xp = (pending.xp || 0) + Math.max(0, delta.xp);
    pending.deaths = (pending.deaths || 0) + Math.max(0, delta.deaths);
    pending.gold = (pending.gold || 0) + Math.max(0, delta.gold);
    pending.updatedAt = Date.now();

    try {
      localStorage.setItem(KEY, JSON.stringify(pending));
      last = cur; // yazma başarılıysa senkron noktasını ilerlet
    } catch (e) {
      // localStorage doluysa/kapalıysa bir sonraki denemede tekrar yazılır;
      // last ilerletilmediği için hiçbir kazanç kaybolmaz.
    }
  }

  // Düzenli senkron + sayfadan ayrılırken / sekme arka plana geçerken son yazım.
  setInterval(flush, SYNC_INTERVAL_MS);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) flush();
  });
})();
