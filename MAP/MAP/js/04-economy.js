// Gerçek entegrasyonda bu, oyuncunun hesabındaki (liderlik tablosundaki)
// points alanı olacak. Prototip içinde test amaçlı 20'den başlatıldı ki
// ölüm cezasının etkisi (-DEATH_POINT_PENALTY) görünür olsun.
let playerPoints = 20;
const DEATH_POINT_PENALTY = 1; // her ölümde kaybedilen puan
let sessionDust = 0;      // bu oturumda toplanan toz
let sessionItems = 0;     // "Sıradan Kitap" sayısı
let sessionRare = 0;      // "Altın" sayısı
let sessionLegendary = 0; // "Hurda" sayısı
let sessionLegendaryItem = 0; // Efsanevi Eşya sayısı
let sessionRareItem = 0;      // Nadir Eşya sayısı
let sessionStandardItem = 0;  // Sıradan Eşya sayısı
let sessionExp = 0;            // toplam kazanılan EXP
let sessionDeaths = 0;         // toplam ölüm sayısı (hesap köprüsü ceza için okur)
// NOT: yukarıdaki sayaçlar KESİNLİKLE KALICI — hiçbir istisna yok, ölüm dahil
// hiçbir olay bunları sıfırlamaz. Oturum artık hiç bitmiyor.
let atMainScreen = false;  // harita tamamen temizlenince true olur, yeni dalga gelene kadar oyun donar
const dustLabelEl = document.getElementById("dustLabel");
const itemsLabelEl = document.getElementById("itemsLabel");
const rareLabelEl = document.getElementById("rareLabel");
const legendaryLabelEl = document.getElementById("legendaryLabel");
// Efsanevi/Nadir/Sıradan Eşya + EXP için index.html'de henüz karşılık gelen
// id'ler yok — bu yüzden getElementById null dönebilir. setLabel() bunu
// güvenli şekilde ele alır (el yoksa sessizce atlar, sayaç yine de tutulur).
// Canlı bir gösterge istersen index.html'e şu id'leri ekle: legendaryItemLabel,
// rareItemLabel, standardItemLabel, expLabel.
const legendaryItemLabelEl = document.getElementById("legendaryItemLabel");
const rareItemLabelEl = document.getElementById("rareItemLabel");
const standardItemLabelEl = document.getElementById("standardItemLabel");
const expLabelEl = document.getElementById("expLabel");
function setLabel(el, value) {
  if (el) el.textContent = value;
}
const hpLabelEl = document.getElementById("hpLabel");
const pointsLabelEl = document.getElementById("pointsLabel");
const mapClearOverlayEl = document.getElementById("mapClearOverlay");
const clearDustLabelEl = document.getElementById("clearDustLabel");
const clearItemsLabelEl = document.getElementById("clearItemsLabel");
const clearRareLabelEl = document.getElementById("clearRareLabel");
const clearLegendaryLabelEl = document.getElementById("clearLegendaryLabel");
const mapClearCountdownLabelEl = document.getElementById("mapClearCountdownLabel");

// ---------- LOOT (EŞYA DAMLASI) SİSTEMİ — KİTAP / ALTIN / HURDA ----------
// Eski "en nadirden başlayıp tek damla" mantığı kaldırıldı. Artık 3 damla
// türü birbirinden TAMAMEN BAĞIMSIZ zar atışlarıyla kontrol ediliyor —
// aynı ölümde hem kitap, hem altın, hem hurda birden düşebilir (veya hiçbiri).
// "Sıradan Kitap" ana oyundaki (Pembe Panterler Battle) kitap sistemiyle aynı isim;
// bu prototipte gerçek envanter yok, bu yüzden sayaç olarak mevcut
// itemsLabelEl/rareLabelEl/legendaryLabelEl DOM etiketleri yeniden kullanıldı
// (yeni HTML elementi eklemeden çalışsın diye — ayrı etiketler istersen
// index.html'e yeni id'ler ekleyip haber ver).
const DROP_CHANCE_BOOK = 0.06;    // %6 (istenen %4-%7 aralığında)  — Sıradan Kitap — tüm canavarlarda ortak (maybeDropItem tek merkez, orc/soldier/goblin hepsi buradan geçiyor)
const DROP_CHANCE_GOLD = 0.25;    // %25     — Altın (1 adet) — enflasyon önleme: %85'ten indirildi
const DROP_CHANCE_SCRAP = 0.10;   // %10     — Hurda (1 adet) — enflasyon önleme: %87.5'ten indirildi

// ---------- İTEM NADİRLİK KATMANI — efsanevi/nadir/sıradan EŞYA ----------
// Kitap/Altın/Hurda'dan AYRI bir sistem. Bu üçü eski tasarımdaki gibi
// SIRALI kontrol edilir ve TEK damla verir (aynı ölümde hem efsanevi hem
// nadir eşya birden düşmez — en nadirden başlanır, ilk tutan kazanır).
const DROP_CHANCE_LEGENDARY_ITEM = 0.001; // %0.1 (binde bir) — Efsanevi Eşya
const DROP_CHANCE_RARE_ITEM = 0.04;       // %4   — Nadir Eşya
const DROP_CHANCE_STANDARD_ITEM = 0.07;   // %7   — Sıradan Eşya

function maybeDropItem(x, y) {
  let dropY = y - 26; // art arda düşen yazılar üst üste binmesin diye kayan y

  // ---- Efsanevi / Nadir / Sıradan Eşya sistemi KALDIRILDI ----
  // Bu damlalar hesaba işlenmiyordu (gerçek eşya üretimi kutu motorunun işi),
  // oyuncuya boş vaat gibi göründüğü için haritadan tamamen çıkarıldı.
  // Gerçek eşya kazanımı ileride kutu motoru entegrasyonuyla gelecek —
  // sabitler ve sayaçlar o gün için yukarıda duruyor, davranışta yoklar.

  // ---- Kitap / Altın / Hurda (birbirinden bağımsız) ----
  if (Math.random() < DROP_CHANCE_BOOK) {
    sessionItems += 1; // sayaç: "Sıradan Kitap"
    setLabel(itemsLabelEl, sessionItems);
    spawnFloatingText(x, dropY, "📖 Sıradan Kitap", "#8fd9ff");
    dropY -= 16;
  }
  if (Math.random() < DROP_CHANCE_GOLD) {
    sessionRare += 1; // sayaç: "Altın"
    setLabel(rareLabelEl, sessionRare);
    spawnFloatingText(x, dropY, "🪙 Altın", "#ffd24d");
    dropY -= 16;
  }
  if (Math.random() < DROP_CHANCE_SCRAP) {
    sessionLegendary += 1; // sayaç: "Hurda"
    setLabel(legendaryLabelEl, sessionLegendary);
    spawnFloatingText(x, dropY, "🔩 Hurda", "#c9c9c9");
    dropY -= 16;
  }

  // ---- EXP — %95 ihtimalle 1 (neredeyse her kesim EXP verir; kasılma
  // hissi olmasın diye yükseltildi, seviye hızını asıl xp eğrisi dengeler) ----
  if (Math.random() < 0.95) {
    sessionExp += 1;
    setLabel(expLabelEl, sessionExp);
    spawnFloatingText(x, dropY, "⭐ +1 EXP", "#b5ff8f");
  }
}

// ---------- ÖLÜM / PUAN CEZASI SİSTEMİ ----------
// Yarım canlı (yaralı ama ölmemiş) canavarları tam cana döndürür.
// ZATEN ölmüş canavarlara dokunmaz — bilinçli tasarım: ölüm bir bedel
// taşısın (kazanılan ilerleme tamamen silinmesin) diye.
function reviveWoundedEnemies() {
  for (const o of orcs) if (!o.dead) o.hp = o.maxHp;
  for (const so of soldiers) if (!so.dead) so.hp = so.maxHp;
  for (const g of goblins) if (!g.dead) g.hp = g.maxHp;
}

function handlePlayerDeath() {
  // Toz/eşya sayaçlarına ASLA dokunulmuyor — kalıcılar. Sadece puan cezası var.
  sessionDeaths += 1; // hesap köprüsü bu sayaçtan gerçek puan cezasını işler
  playerPoints = Math.max(0, playerPoints - DEATH_POINT_PENALTY);
  pointsLabelEl.textContent = playerPoints;
  reviveWoundedEnemies();
  spawnFloatingText(player.x, player.y - player.r - 30, `-${DEATH_POINT_PENALTY} Puan`, "#ff5c6c");
  triggerShake(10, 0.35);

  // Yeniden doğma: can dolar, harita ortasına ışınlanır, kısa süre dokunulmaz olur.
  player.hp = player.maxHp;
  player.x = WORLD_W / 2; player.y = WORLD_H / 2;
  player.invulnT = 1.5;
}
