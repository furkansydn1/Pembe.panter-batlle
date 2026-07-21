// ---------- DÜNYA / HARİTA ----------
// Harita, ekrandan (canvas) daha büyük: kamera oyuncuyu takip ediyor.
// ASSET: Bu düz renkli zemin yerine ileride bir tileset/zemin dokusu gelecek.
const WORLD_W = 1600;
const WORLD_H = 1000;

// Basit engeller (kaya/ağaç yerine geçen daireler). ASSET: gerçek sprite'larla değişecek.
// [BİYOM] Engeller artık aktif biyomdan gelir (00-core → BIOMES[...].obstacles)
const obstacles = ACTIVE_BIOME.obstacles;
