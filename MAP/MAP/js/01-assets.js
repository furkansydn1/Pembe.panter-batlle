// ============================================================
// ASSET YÜKLEYİCİ — base64 YOK, tüm görseller assets/ klasöründen yüklenir.
// Yeni asset eklemek = assets/ içine PNG koy + burada 3 satırlık blok ekle.
//
// NOT: Görsel henüz yoksa/yüklenemezse oyun ÇÖKMEZ — ...Ready bayrağı false
// kalır ve ilgili çizim fonksiyonu yedek (placeholder) çizime düşer.
//
// Sprite sheet düzeni beklentisi (Universal LPC standardı):
// 64x64 hücreler, her eylem 4 satır (sıra: yukarı, sol, aşağı, sağ).
// ============================================================
const SPRITE_CELL = 64;
const SPRITE_ROWS = {
  walk:   { up: 8,  left: 9,  down: 10, right: 11 },
  slash:  { up: 12, left: 13, down: 14, right: 15 },
  idle:   { up: 22, left: 23, down: 24, right: 25 },
};
const SPRITE_FRAME_COUNTS = { walk: 9, slash: 6, idle: 2 };
const WALK_FPS = 10;   // saniyede kaç yürüme karesi
const IDLE_FPS = 2.5;  // saniyede kaç bekleme (nefes) karesi

// ---- OVERSIZE SLASH (KILIÇLI SALDIRI) ----
// LPC'de longsword normal 64'lük slash satırlarında GÖRÜNMEZ; kılıçlı saldırı
// animasyonu sheet'in altındaki 192x192'lik "oversize" bölümdedir. Aynı
// karakter.png içinde — ekstra dosya yok, sadece farklı bölgeden kırpılır.
// Karakter gövdesi 192'lik karenin tam ORTASINDAKİ 64'lük alanda durur
// (kılıç taşsın diye her yönde 64px pay) — çizim ofseti buna göre hesaplanır.
const OVERSIZE_START_Y = 3456;                        // oversize bölümün sheet'teki başlangıcı
const OVERSIZE_CELL = 192;                            // oversize hücre boyutu
const OVERSIZE_SLASH_ROWS = { up: 0, left: 1, down: 2, right: 3 }; // bölüm içi satırlar
const OVERSIZE_SLASH_FRAMES = 6;

// ---- KARAKTER SPRITE SHEET ----
const characterSheet = new Image();
let characterSheetReady = false;
characterSheet.onload = () => { characterSheetReady = true; };
characterSheet.src = "assets/player/karakter.png";

// ---- KILIÇ SALLAMA İZİ (VFX) ----
const swordSwipeImg = new Image();
let swordSwipeReady = false;
swordSwipeImg.onload = () => { swordSwipeReady = true; };
swordSwipeImg.src = "assets/player/kilic-iz.png";

// ---- HARİTA ASSETLERİ: ZEMİN + AĞAÇ + KAYA ----
// zemin-full.png: 1600x1000, HARİTANIN TAMAMINI kaplayan TEK PARÇA zemin
// (WORLD_W x WORLD_H ile aynı boyut — harita büyürse bu görsel de yenilenmeli).
// agac.png: 119x190 tek çam ağacı.
// kaya.png: tek kaya sprite'ı (Rock4.png'den kırpıldı).
const groundImg = new Image();
let groundImgReady = false;
groundImg.onload = () => { groundImgReady = true; };
groundImg.src = "assets/map/zemin-full.png";

const treeImg = new Image();
let treeImgReady = false;
treeImg.onload = () => { treeImgReady = true; };
treeImg.src = "assets/map/agac.png";

const rockImg = new Image();
let rockImgReady = false;
rockImg.onload = () => { rockImgReady = true; };
rockImg.src = "assets/map/kaya.png";
