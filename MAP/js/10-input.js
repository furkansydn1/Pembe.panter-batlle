// ============================================================
// GİRDİ — [DİKEY ENTEGRASYON] DİNAMİK TEK-PARMAK JOYSTICK + OTO-SALDIRI
// Saldırı butonu KALDIRILDI (saldırı artık otomatik, 03-player). Joystick
// sabit köşede değil: oyun alanının alt kısmına PARMAĞINI NEREYE KOYARSAN
// orada belirir (Archero/VS tarzı). Böylece tek elle, tek parmakla oynanır
// ve iOS'un yan/alt kenar swipe'larıyla çakışma azalır.
// Üst HUD şeridine (ilk ~92px) dokunmalar joystick açmaz.
// Klavye (WASD/ok) masaüstü testi için korundu.
// ============================================================
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === " ") e.preventDefault();
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

// Eski buton kancası kaldırıldı; değişken tanımlı kalsın (başka yerde referans olursa çökmesin).
let attackRequested = false;

// ---------- DOKUNMATİK: DİNAMİK JOYSTICK ----------
const isTouchDevice = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
const touchControls = document.getElementById("touchControls");
const joystickZone = document.getElementById("joystickZone");
const joystickStick = document.getElementById("joystickStick");
const hintBox = document.getElementById("hintBox");
if (isTouchDevice && touchControls) {
  touchControls.classList.add("active");
  if (hintBox) hintBox.textContent = "Alt tarafa bas & sürükle — kılıç otomatik";
}
// Joystick başta gizli; dokununca belirir.
if (joystickZone) joystickZone.style.display = "none";

let joyVec = { x: 0, y: 0 };            // -1..1 normalize yön (03-player okur)
let joyActive = false, joyTouchId = null, joyOX = 0, joyOY = 0;
const JOY_MAX_DIST = 48;                // topuz menzili (px)
const HUD_SAFE_TOP = 92;                // üst HUD şeridi — buraya dokunma joystick açmaz

function settingsOpen() {
  const p = document.getElementById("settingsPanel");
  return !!(p && p.classList.contains("on"));
}

function joyStart(x, y, id) {
  joyActive = true; joyTouchId = id; joyOX = x; joyOY = y;
  if (joystickZone) {
    const w = joystickZone.offsetWidth || 112, h = joystickZone.offsetHeight || 112;
    joystickZone.style.display = "block";
    joystickZone.style.left = (x - w / 2) + "px";
    joystickZone.style.top = (y - h / 2) + "px";
    joystickZone.style.bottom = "auto";
    joystickZone.style.right = "auto";
  }
  if (joystickStick) joystickStick.style.transform = "translate(0px, 0px)";
  joyVec.x = 0; joyVec.y = 0;
}
function joyMove(x, y) {
  if (!joyActive) return;
  let dx = x - joyOX, dy = y - joyOY;
  const dist = Math.min(JOY_MAX_DIST, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const sx = Math.cos(angle) * dist, sy = Math.sin(angle) * dist;
  if (joystickStick) joystickStick.style.transform = `translate(${sx}px, ${sy}px)`;
  joyVec.x = dist > 6 ? Math.cos(angle) * (dist / JOY_MAX_DIST) : 0;
  joyVec.y = dist > 6 ? Math.sin(angle) * (dist / JOY_MAX_DIST) : 0;
}
function joyEnd() {
  joyActive = false; joyTouchId = null; joyVec.x = 0; joyVec.y = 0;
  if (joystickZone) joystickZone.style.display = "none";
}

const inputRoot = document.getElementById("gameWrap") || document.body;

function onGearOrPanel(target) {
  return !!(target && target.closest && target.closest("#settingsGear, #settingsPanel, #backToGameBtn"));
}

inputRoot.addEventListener("touchstart", (e) => {
  if (joyActive || settingsOpen() || onGearOrPanel(e.target)) return;
  const t = e.changedTouches[0];
  if (t.clientY < HUD_SAFE_TOP) return; // üst HUD alanı
  joyStart(t.clientX, t.clientY, t.identifier);
  e.preventDefault();
}, { passive: false });

inputRoot.addEventListener("touchmove", (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyTouchId) { joyMove(t.clientX, t.clientY); e.preventDefault(); }
  }
}, { passive: false });

window.addEventListener("touchend", (e) => {
  for (const t of e.changedTouches) { if (t.identifier === joyTouchId) joyEnd(); }
});
window.addEventListener("touchcancel", (e) => {
  for (const t of e.changedTouches) { if (t.identifier === joyTouchId) joyEnd(); }
});

// ---------- MASAÜSTÜ: fare ile de dinamik joystick (test) ----------
let mouseJoy = false;
inputRoot.addEventListener("mousedown", (e) => {
  if (settingsOpen() || onGearOrPanel(e.target) || e.clientY < HUD_SAFE_TOP) return;
  mouseJoy = true; joyStart(e.clientX, e.clientY, "mouse");
});
window.addEventListener("mousemove", (e) => { if (mouseJoy) joyMove(e.clientX, e.clientY); });
window.addEventListener("mouseup", () => { if (mouseJoy) { mouseJoy = false; joyEnd(); } });
