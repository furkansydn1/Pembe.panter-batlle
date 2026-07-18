const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === " ") e.preventDefault();
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

let attackRequested = false;
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === " " || k === "j") attackRequested = true;
});

// ---------- DOKUNMATİK KONTROLLER ----------
const isTouchDevice = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
if (isTouchDevice) {
  document.getElementById("touchControls").classList.add("active");
  document.getElementById("hintBox").textContent = "Joystick ile hareket et, ⚔️ butonuna dokun";
}

const joystickZone = document.getElementById("joystickZone");
const joystickStick = document.getElementById("joystickStick");
let joyActive = false;
let joyVec = { x: 0, y: 0 }; // -1..1 aralığında normalize yön vektörü
let joyTouchId = null;
const JOY_MAX_DIST = 46;

function joyStart(clientX, clientY, id) {
  joyActive = true;
  joyTouchId = id;
  joyCenter = joystickZone.getBoundingClientRect();
}
let joyCenter = null;
function joyMove(clientX, clientY) {
  if (!joyActive || !joyCenter) return;
  const cx = joyCenter.left + joyCenter.width / 2;
  const cy = joyCenter.top + joyCenter.height / 2;
  let dx = clientX - cx, dy = clientY - cy;
  const dist = Math.min(JOY_MAX_DIST, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const sx = Math.cos(angle) * dist, sy = Math.sin(angle) * dist;
  joystickStick.style.transform = `translate(${sx}px, ${sy}px)`;
  joyVec.x = dist > 6 ? Math.cos(angle) * (dist / JOY_MAX_DIST) : 0;
  joyVec.y = dist > 6 ? Math.sin(angle) * (dist / JOY_MAX_DIST) : 0;
}
function joyEnd() {
  joyActive = false; joyTouchId = null;
  joyVec.x = 0; joyVec.y = 0;
  joystickStick.style.transform = `translate(0px, 0px)`;
}

joystickZone.addEventListener("touchstart", (e) => {
  const t = e.changedTouches[0];
  joyStart(t.clientX, t.clientY, t.identifier);
  joyMove(t.clientX, t.clientY);
  e.preventDefault();
}, { passive: false });
joystickZone.addEventListener("touchmove", (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyTouchId) joyMove(t.clientX, t.clientY);
  }
  e.preventDefault();
}, { passive: false });
window.addEventListener("touchend", (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyTouchId) joyEnd();
  }
});

document.getElementById("attackBtn").addEventListener("touchstart", (e) => {
  attackRequested = true;
  e.preventDefault();
}, { passive: false });
