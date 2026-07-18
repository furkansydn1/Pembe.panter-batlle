// ---------- KAMERA ----------
const camera = { x: 0, y: 0 };

// ---------- EKRAN SARSINTISI (juice) ----------
let shakeT = 0, shakeMag = 0;
function triggerShake(mag, dur) { shakeMag = mag; shakeT = dur; }

// ---------- PARÇACIKLAR (adım tozu + saldırı efekti) ----------
const particles = []; // {x,y,vx,vy,life,maxLife,color,size}
function spawnParticle(x, y, opts = {}) {
  particles.push({
    x, y,
    vx: opts.vx ?? (Math.random() - 0.5) * 60,
    vy: opts.vy ?? (Math.random() - 0.5) * 60,
    life: opts.life ?? 0.4,
    maxLife: opts.life ?? 0.4,
    color: opts.color ?? "rgba(255,255,255,0.6)",
    size: opts.size ?? 3,
  });
}


// Yükselen "+X Toz" / hasar yazıları (hem canavar öldüğünde hem oyuncu
// hasar aldığında kullanılıyor).
const floatingTexts = []; // {x,y,text,color,t,life}
function spawnFloatingText(x, y, text, color = "#ffcc4d") {
  floatingTexts.push({ x, y, text, color, t: 0, life: 0.9 });
}

function updateFloatingTexts(dt) {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const f = floatingTexts[i];
    f.t += dt;
    if (f.t >= f.life) floatingTexts.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.9; p.vy *= 0.9;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateCamera(dt) {
  // Oyuncuyu merkezde tutmaya çalış, harita sınırlarına clamp et
  const targetX = player.x - canvas.width / 2;
  const targetY = player.y - canvas.height / 2;
  camera.x += (targetX - camera.x) * Math.min(1, dt * 6);
  camera.y += (targetY - camera.y) * Math.min(1, dt * 6);
  camera.x = Math.max(0, Math.min(WORLD_W - canvas.width, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_H - canvas.height, camera.y));

  if (shakeT > 0) {
    shakeT -= dt;
    camera.x += (Math.random() - 0.5) * shakeMag;
    camera.y += (Math.random() - 0.5) * shakeMag;
  }
}

function drawParticles() {
  for (const p of particles) {
    const sx = p.x - camera.x, sy = p.y - camera.y;
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawFloatingTexts() {
  for (const f of floatingTexts) {
    const sx = f.x - camera.x, sy = f.y - camera.y - f.t * 40; // yukarı doğru süzülür
    const alpha = 1 - f.t / f.life;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = "bold 14px -apple-system, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, sx, sy);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "left";
}
