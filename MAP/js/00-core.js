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
