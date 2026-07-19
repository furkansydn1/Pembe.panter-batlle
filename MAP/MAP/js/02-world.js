// ---------- DÜNYA / HARİTA ----------
// Harita, ekrandan (canvas) daha büyük: kamera oyuncuyu takip ediyor.
// ASSET: Bu düz renkli zemin yerine ileride bir tileset/zemin dokusu gelecek.
const WORLD_W = 1600;
const WORLD_H = 1000;

// Basit engeller (kaya/ağaç yerine geçen daireler). ASSET: gerçek sprite'larla değişecek.
const obstacles = [
  { x: 300, y: 250, r: 34, type: "rock" },
  { x: 520, y: 480, r: 44, type: "tree" },
  { x: 900, y: 200, r: 30, type: "rock" },
  { x: 1150, y: 650, r: 50, type: "tree" },
  { x: 700, y: 800, r: 36, type: "rock" },
  { x: 1300, y: 350, r: 40, type: "tree" },
  { x: 200, y: 700, r: 32, type: "rock" },
];
