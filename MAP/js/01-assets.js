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
// cim-tile.png: 256x256 DİKİŞSİZ (seamless) çim karosu — harita boyutundan
// bağımsız, 11-render.js tarafından tüm haritaya boşluksuz döşenir (harita
// büyürse görsel değişmez, sadece daha çok kez döşenir). Karo dama-tahtası
// gibi dönüşümlü çevrilerek tekrar deseni gizlenir.
// agac.png: 119x190 tek çam ağacı.
// kaya.png: tek kaya sprite'ı (Rock4.png'den kırpıldı).
const groundImg = new Image();
let groundImgReady = false;
groundImg.onload = () => { groundImgReady = true; };
groundImg.src = ACTIVE_BIOME.groundTile; // [BİYOM] zemin karosu biyoma göre
const GROUND_TILE = ACTIVE_BIOME.groundTileSize || 256; // [BİYOM] karo px boyutu (orman 256, bataklık 512)

const treeImg = new Image();
let treeImgReady = false;
treeImg.onload = () => { treeImgReady = true; };
treeImg.src = ACTIVE_BIOME.treeSprite; // [BİYOM]

const rockImg = new Image();
let rockImgReady = false;
rockImg.onload = () => { rockImgReady = true; };
rockImg.src = ACTIVE_BIOME.rockSprite; // [BİYOM]

// ---- [BİYOM] BATAKLIK PROP'LARI + ÖLÜM EKRANI KURUKAFASI ----
// balkabağı/tabela = engel sprite'ı, kemik/mantar = süs (drawDecor).
// dead-skull.png: 128px hücre, 2 satır x 7 kare (satır 0 = beliriş) — 05-effects
// ölüm ekranında oynatır. Canavar reskin sheet'leri kendi dosyalarında yüklenir.
const balkabagiImg = new Image(); let balkabagiReady = false;
balkabagiImg.onload = () => { balkabagiReady = true; }; balkabagiImg.src = "assets/map/balkabagi.png";
const tabelaImg = new Image(); let tabelaReady = false;
tabelaImg.onload = () => { tabelaReady = true; }; tabelaImg.src = "assets/map/tabela.png";
const kemik1Img = new Image(); let kemik1Ready = false;
kemik1Img.onload = () => { kemik1Ready = true; }; kemik1Img.src = "assets/map/kemik1.png";
const kemik2Img = new Image(); let kemik2Ready = false;
kemik2Img.onload = () => { kemik2Ready = true; }; kemik2Img.src = "assets/map/kemik2.png";
const mantarImg = new Image(); let mantarReady = false;
mantarImg.onload = () => { mantarReady = true; }; mantarImg.src = "assets/map/mantar.png";
const deadImg = new Image(); let deadImgReady = false;
deadImg.onload = () => { deadImgReady = true; }; deadImg.src = "assets/enemies/dead-skull.png";
