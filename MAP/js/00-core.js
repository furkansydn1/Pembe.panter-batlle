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
