// ============================================================
// PROTOTİP 5 — MMO TARZI ÖLÜM CEZASI (CAN HAKKI SİSTEMİ KALDIRILDI)
// Önceki "3 can hakkı, 4. ölümde oturum biter ve her şey silinir" sistemi
// tamamen kaldırıldı. Artık klasik bir MMO/RPG mantığı var:
//
//   - Oturum SÜRESİZ ve ASLA bitmiyor, "game over" ekranı yok.
//   - Toplanan toz/eşya (sessionDust/Items/Rare/Legendary) ARTIK HİÇBİR
//     ZAMAN silinmiyor — ölsen de, ne kadar ölürsen öl, kazandığın kalıcı.
//   - Ölünce sadece PUAN cezası var (bkz. DEATH_POINT_PENALTY, şu an 5).
//     Bu puan, gerçek entegrasyonda oyuncunun hesabındaki (liderlik
//     tablosundaki) points alanına karşılık gelecek; burada prototip
//     içinde ayrı bir değişkenle (playerPoints) simüle ediliyor.
//   - Ölünce: puan düşer, yarım canlı (ölmemiş ama yaralı) canavarlar tam
//     cana döner (reviveWoundedEnemies — nefes molası versin diye), oyuncu
//     harita ortasına ışınlanıp kısa bir dokunulmazlık süresiyle
//     yeniden doğar. ZATEN ölmüş canavarlara dokunulmaz.
//   - Haritadaki TÜM canavarlar temizlenince bir sayaç başlıyor (bkz.
//     updateWaveManager), süre bitince her türden ENEMIES_PER_TYPE kadar
//     canavar haritaya YENİDEN, birbirinden ve önceki konumlardan bağımsız
//     şekilde dağıtılarak spawn ediliyor (bkz. spawnNewWave/pickSpawnPoint
//     — min. mesafe kontrolüyle sıkışık spawn'lar engelleniyor).
//   - Eşya damlaları (loot) 3 nadirlik katmanında düşüyor (standart %35,
//     nadir %6, efsanevi %0.5 — DROP_CHANCE_* sabitleri), tozdan ayrı ve
//     ekonomiyi bozmasın diye düşük tutuldu.
// ============================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false; // piksel-art netliği için

// ============================================================
// [DİKEY ENTEGRASYON] RESPONSIVE PORTRAIT CANVAS + ZOOM (GÖRÜŞ) SİSTEMİ
// Canvas artık sabit 900x600 değil — ekranı tam kaplar (dikey). Tüm dünya
// çizimi ZOOM ile ölçeklenir: "kaç dünya-birimi genişlik görünsün" (VIEW_W_TARGET)
// küçüldükçe yakınlaşır. Oyuncu tercihi ⚙️ ayarından (16-settings) gelir ve
// localStorage["ppbMapZoom"]'da saklanır. DPR=1 (buffer = CSS px) — tüm eski
// canvas.width/height mantığı "ekran px" olarak aynen çalışsın diye bilinçli.
// ============================================================
var VIEW_W_TARGET = 400; // görünen dünya genişliği (world birimi) — küçük = daha yakın
var VIEW_W = 400, VIEW_H = 700, ZOOM = 1;
(function () {
  try { var z = parseFloat(localStorage.getItem("ppbMapZoom")); if (z >= 300 && z <= 580) VIEW_W_TARGET = z; } catch (e) {}
})();
function computeView() {
  ZOOM = canvas.width / VIEW_W_TARGET;   // ekran px / dünya birimi
  VIEW_W = VIEW_W_TARGET;                 // görünen dünya genişliği (world)
  VIEW_H = canvas.height / ZOOM;          // görünen dünya yüksekliği (world)
}
function resizeCanvas() {
  canvas.width = Math.max(1, Math.round(window.innerWidth));
  canvas.height = Math.max(1, Math.round(window.innerHeight));
  ctx.imageSmoothingEnabled = false;
  computeView();
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", function () { setTimeout(resizeCanvas, 120); });

// ============================================================
// [BİYOM SİSTEMİ] Aynı motor birden çok "diyar"ı yükler. Hangi biyom
// yükleneceği "Diyara Gir" URL'sindeki ?map= parametresinden gelir
// (ör. MAP/index.html?map=zehirli-bataklik). Bilinmeyen/boş = orman (varsayılan).
// Her biyom: zemin karosu, kenar rengi, zehir/sis tonu, obstacle sprite'ları
// ve obstacle yerleşimini belirler. Canavar kadrosu şimdilik ortak (bataklık
// canavarları geldiğinde 09-wave biyoma göre ayrılacak — Adım 3).
// ============================================================
var BIOMES = {
  forest: {
    id: "forest", name: "Unutulmuş Orman",
    groundTile: "assets/map/cim-tile.png",
    borderColor: "rgba(255,45,135,0.4)",
    tint: null,
    rockSprite: "assets/map/kaya.png",
    treeSprite: "assets/map/agac.png",
    obstacles: [
      { x: 300, y: 250, r: 34, type: "rock" },
      { x: 520, y: 480, r: 44, type: "tree" },
      { x: 900, y: 200, r: 30, type: "rock" },
      { x: 1150, y: 650, r: 50, type: "tree" },
      { x: 700, y: 800, r: 36, type: "rock" },
      { x: 1300, y: 350, r: 40, type: "tree" },
      { x: 200, y: 700, r: 32, type: "rock" },
    ],
  },
  swamp: {
    id: "swamp", name: "Zehirli Bataklık",
    groundTile: "assets/map/batak-tile.png",
    groundTileSize: 512,   // [ZEMİN v3] 512'lik zengin karo (4x çeşitlilik, tekrar hissi ölür)
    groundFlip: false,     // [ZEMİN v3] flip KAPALI: yönlü detaylar (yukarı sazlar, üstten ışık) aynada ters dönerdi
    borderColor: "rgba(120,180,60,0.40)",
    tint: "rgba(74,116,44,0.10)",   // hafif zehir tonu — zemin+süsler üstüne serilir
    rockSprite: "assets/map/kaya.png",
    treeSprite: "assets/map/agac.png",
    footstep: "assets/sfx/batak-yurume.wav", // [BİYOM] vıcık bataklık adımı
    // [DENGE] Seviye-15 diyarı: oyuncular artık nadir eşya taşıyor → mobların
    // canı 2x, hasarı 1.6x (canavar dosyaları MOB_HP_MULT/MOB_DMG_MULT okur).
    mobHpMult: 2.0,
    mobDmgMult: 1.6,
    // [LOOT] Bataklık drop tablosu (04-economy okur; orman ESKİ sistemde kalır).
    // İç tip adları: orc=Blood Monster (ŞANSLI canavar), soldier=Demon, goblin=Pawn.
    loot: {
      bookPct: 0.035,                                  // %3.5 kitap (hepsinden)
      rareItemPct: 0.005,                              // %0.5 NADİR eşya (hepsinden — 200 kesimde ~1)
      stdItemPct: { orc: 0.02, soldier: 0.02, goblin: 0.02 },    // sıradan eşya %2 (hepsinde eşit — denge ayarı)
      goldW:  [[1, 50], [2, 40], [3, 30], [4, 10]],    // her kesim 1-4 altın (ağırlık 50/40/30/10)
      scrapW: [[1, 50], [2, 40], [3, 30], [4, 10]],    // hurda aynı oranlar
      exp: { orc: [3, 7], soldier: [5, 7], goblin: [3, 5] }, // min3-max7; en tehlikeli (Demon) en cömert
    },
    // ENGELLER: balkabağı + tabela (çarpışır). Çizim: 11-render drawObstacles.
    obstacles: [
      { x: 320,  y: 260, r: 24, type: "pumpkin" },
      { x: 860,  y: 190, r: 20, type: "sign" },
      { x: 1240, y: 330, r: 24, type: "pumpkin" },
      { x: 470,  y: 700, r: 20, type: "sign" },
      { x: 1050, y: 780, r: 24, type: "pumpkin" },
      { x: 180,  y: 520, r: 20, type: "sign" },
      { x: 1420, y: 600, r: 24, type: "pumpkin" },
    ],
    // SÜSLER: kemik/mantar — çarpışmaz, üstünden geçilir (11-render drawDecor).
    decor: [
      { x: 240,  y: 350, type: "kemik1" }, { x: 700,  y: 260, type: "kemik2" },
      { x: 980,  y: 420, type: "kemik1" }, { x: 1330, y: 210, type: "kemik2" },
      { x: 420,  y: 560, type: "kemik2" }, { x: 1180, y: 640, type: "kemik1" },
      { x: 640,  y: 860, type: "kemik1" }, { x: 1460, y: 860, type: "kemik2" },
      { x: 150,  y: 830, type: "kemik2" }, { x: 890,  y: 930, type: "kemik1" },
      { x: 360,  y: 180, type: "mantar" }, { x: 760,  y: 620, type: "mantar" },
      { x: 1120, y: 240, type: "mantar" }, { x: 1500, y: 430, type: "mantar" },
      { x: 250,  y: 940, type: "mantar" }, { x: 1290, y: 950, type: "mantar" },
    ],
    // CANAVAR RESKİNLERİ: aynı iskelet/AI, farklı sprite (06/07/08 okur).
    skins: {
      orc:     { src: "assets/enemies/blood.png" },                              // düzen orc ile birebir aynı
      soldier: { src: "assets/enemies/demon.png", rowHurt: 4, rowDeath: 5 },     // demon'da hurt/death satırı farklı
      goblin:  { src: "assets/enemies/fighter.png", cell: 128, display: 138,
                 rowIdle: 3, rowWalk: 4, rowAtkSide: 0, rowAtkFront: 0, rowAtkBack: 0,
                 framesIdle: 8, framesWalk: 8, framesAtk: 6 }, // Dövüşçü Goblin (128px ızgara: satır0 saldırı, 3 idle, 4 koşu)
    },
  },
};
function detectBiome() {
  try {
    var q = new URLSearchParams(location.search);
    var m = (q.get("map") || q.get("biome") || "").toLowerCase();
    if (m === "2" || /batak|swamp|zehir|poison/.test(m)) return "swamp"; // ana oyun "Diyara Gir"de ?map=SIRA gönderir (Zehirli Bataklık = 2)
  } catch (e) {}
  return "forest";
}
var ACTIVE_BIOME = BIOMES[detectBiome()] || BIOMES.forest;
var MOB_HP_MULT = ACTIVE_BIOME.mobHpMult || 1;   // canavar can çarpanı (06/07/08 spawn'da)
var MOB_DMG_MULT = ACTIVE_BIOME.mobDmgMult || 1; // canavar hasar çarpanı (vuruş anında)
console.log("[Biyom] aktif:", ACTIVE_BIOME.name);
