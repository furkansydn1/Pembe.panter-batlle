// ---------- KAMERA ----------
const camera = { x: 0, y: 0 };

// ============================================================
// JUICE MOTORU — hitstop + ses + kritik + vuruş/ölüm efektleri
// Tüm canavar dosyaları hitJuice/deathJuice çağırır; 12-main hitstop'u
// ve ölüm ekranını işletir. (v: vuruş hissi güncellemesi)
// ============================================================

// ---------- HITSTOP (donma karesi) ----------
// Kılıç değdiği an oyun ~50ms komple donar — "temas etti" hissinin bel kemiği.
let hitstopT = 0;
function triggerHitstop(dur) { hitstopT = Math.max(hitstopT, dur); }

// ---------- SES (SFX) ----------
// Dosyalar assets/sfx/ klasöründe. Aynı ses üst üste çalabilsin diye küçük
// havuz; pitchVar aynı sesin robotik tekrarını kırar (±%X rastgele tiz/pes).
const SFX_PATHS = {
  vurus: "assets/sfx/sword_clash.wav",
  adim: "assets/sfx/foley_footstep_gravel_1.wav",
  olum: "assets/sfx/vibraphone_negative.wav",
};
const sfxPool = {};
function playSfx(name, { volume = 1, pitch = 1, pitchVar = 0 } = {}) {
  const path = SFX_PATHS[name];
  if (!path) return;
  if (!sfxPool[name]) sfxPool[name] = [];
  let a = sfxPool[name].find(x => x.paused || x.ended);
  if (!a) {
    if (sfxPool[name].length >= 6) return; // havuz limiti — ses spam'i koruması
    a = new Audio(path);
    sfxPool[name].push(a);
  }
  a.volume = volume;
  a.playbackRate = Math.max(0.5, pitch + (Math.random() - 0.5) * 2 * pitchVar);
  a.currentTime = 0;
  a.play().catch(() => {}); // ilk kullanıcı dokunuşundan önce tarayıcı engelleyebilir — sessiz geç
}

// ---------- KRİTİK VURUŞ ----------
const CRIT_CHANCE = 0.15;
const CRIT_MULT = 2;
function rollPlayerHit(base) {
  const crit = Math.random() < CRIT_CHANCE;
  return { dmg: crit ? base * CRIT_MULT : base, crit };
}

// ---------- VURUŞ PAKETİ ----------
// Tek çağrıda: geri tepme + hitstop + shake + ses + yönlü hasar yazısı +
// vuruş yönünde kıvılcım. Canavar dosyalarındaki dağınık efekt kodunun yerine.
function hitJuice(e, hit, color) {
  const dirX = e.x - player.x, dirY = e.y - player.y;
  const d = Math.hypot(dirX, dirY) || 1;
  const kx = dirX / d, ky = dirY / d;

  // Canavar geri tepmesi (updateX içinde sönümlenerek uygulanır)
  e.kbVx = (e.kbVx || 0) + kx * (hit.crit ? 340 : 230);
  e.kbVy = (e.kbVy || 0) + ky * (hit.crit ? 340 : 230);

  triggerHitstop(hit.crit ? 0.09 : 0.05);
  triggerShake(hit.crit ? 7 : 4, hit.crit ? 0.16 : 0.1);
  playSfx("vurus", { volume: hit.crit ? 1 : 0.75, pitch: hit.crit ? 0.85 : 1.05, pitchVar: 0.08 });

  spawnFloatingText(
    e.x + kx * 10, e.y - e.r - 6,
    (hit.crit ? "KRİTİK -" : "-") + hit.dmg,
    hit.crit ? "#ffcc4d" : "#ffffff",
    { size: hit.crit ? 23 : 15, vx: kx * 70, rise: hit.crit ? 55 : 40 }
  );

  // Kıvılcımlar her yöne değil, VURUŞ YÖNÜNE saçılır (kesme hissi)
  const baseAngle = Math.atan2(ky, kx);
  const n = hit.crit ? 14 : 8;
  for (let i = 0; i < n; i++) {
    const a = baseAngle + (Math.random() - 0.5) * 1.6;
    const sp = 90 + Math.random() * (hit.crit ? 190 : 110);
    spawnParticle(e.x, e.y, {
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.32, size: Math.random() * 2.5 + 1.5, color,
    });
  }
}

// ---------- ÖLÜM PAKETİ ----------
// Canavar ölümü ödül gibi hissettirsin: tok ses + donma + halka patlaması.
function deathJuice(e, color, count = 20) {
  triggerHitstop(0.07);
  triggerShake(6, 0.14);
  playSfx("vurus", { volume: 1, pitch: 0.68, pitchVar: 0.05 }); // pes pitch = "son darbe" tınısı
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4; // düzgün halka + hafif rastgelelik
    const speed = 70 + Math.random() * 130;
    spawnParticle(e.x, e.y, {
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 0.55, size: Math.random() * 3 + 1.5, color,
    });
  }
}

// ---------- OYUNCU ÖLÜM EKRANI ----------
// startDeathSequence: 03-player tetikler → dünya donar, karartma + "ÖLDÜN"
// + geri sayım çizilir (canvas üstüne, HTML/CSS gerekmez) → 3 sn sonra
// 12-main handlePlayerDeath()'i çağırıp oyunu devam ettirir.
const deathSeq = { active: false, t: 0, dur: 3 };
function startDeathSequence() {
  if (deathSeq.active) return;
  deathSeq.active = true;
  deathSeq.t = 0;
  playSfx("olum", { volume: 0.9 });
  triggerShake(10, 0.4);
}

function drawDeathOverlay() {
  const t = deathSeq.t;
  const fade = Math.min(1, t / 0.45);
  ctx.save();
  ctx.fillStyle = `rgba(10,6,8,${0.78 * fade})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = fade;
  ctx.textAlign = "center";

  // Başlık hafif "damga vurulmuş" gibi büyüyerek oturur
  const pop = 1 + Math.max(0, 0.25 - t) * 1.4;
  ctx.fillStyle = "#d94b3f";
  ctx.font = `600 ${Math.round(46 * pop)}px Georgia, "Times New Roman", serif`;
  ctx.fillText("ÖLDÜN", canvas.width / 2, canvas.height / 2 - 8);

  const kalan = Math.max(1, Math.ceil(deathSeq.dur - t));
  ctx.fillStyle = "#e7e0d0";
  ctx.font = '15px Georgia, "Times New Roman", serif';
  ctx.fillText("Yeniden doğuş: " + kalan, canvas.width / 2, canvas.height / 2 + 30);

  ctx.restore();
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}

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
const floatingTexts = []; // {x,y,text,color,t,life,size,vx,rise}
// opts (hepsi opsiyonel, eski 4-argümanlı çağrılar aynen çalışır):
//   size: font boyutu (varsayılan 14) · vx: yatay fırlama hızı (vuruş yönü)
//   rise: yukarı süzülme hızı (varsayılan 40)
function spawnFloatingText(x, y, text, color = "#ffcc4d", opts = {}) {
  floatingTexts.push({
    x, y, text, color, t: 0, life: 0.9,
    size: opts.size ?? 14,
    vx: opts.vx ?? 0,
    rise: opts.rise ?? 40,
  });
}

function updateFloatingTexts(dt) {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const f = floatingTexts[i];
    f.t += dt;
    f.x += f.vx * dt;
    f.vx *= Math.max(0, 1 - dt * 5); // yatay fırlama hızla söner, yazı "oturur"
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
    const sx = f.x - camera.x, sy = f.y - camera.y - f.t * f.rise; // yukarı doğru süzülür
    const alpha = 1 - f.t / f.life;
    // Pop-in: ilk ~0.12 sn'de büyükten normale oturur — sayı "çarpma" hissi verir
    const pop = 1 + Math.max(0, 0.12 - f.t) * 5;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `bold ${Math.round(f.size * pop)}px -apple-system, Arial, sans-serif`;
    ctx.textAlign = "center";
    // Koyu kontur — kalabalık savaşta sayılar zeminden ayrışsın
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(f.text, sx, sy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, sx, sy);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "left";
}
