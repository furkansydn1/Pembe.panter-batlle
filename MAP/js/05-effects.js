// ---------- KAMERA ----------
const camera = { x: 0, y: 0 };

// ============================================================
// JUICE MOTORU — hitstop + ses + kritik + vuruş/ölüm efektleri
// Tüm canavar dosyaları hitJuice/deathJuice çağırır; 12-main hitstop'u
// ve ölüm ekranını işletir. (v: vuruş hissi güncellemesi)
// ============================================================

// ---------- HITSTOP (donma karesi) ----------
// Kılıç değdiği an oyun kısa süre komple donar — "temas etti" hissinin bel kemiği.
let hitstopT = 0;
function triggerHitstop(dur) { hitstopT = Math.max(hitstopT, dur); }

// ---------- JUICE AYAR PANELİ ----------
// Vuruş hissinin TÜM şiddet ayarları tek yerde. Az/çok gelirse buradan oyna;
// bir efekti komple kapatıp FPS'e etkisini test etmek için değeri 0 yap.
const JUICE = {
  hitstop:     0.09,  // normal vuruşta donma (sn)
  hitstopCrit: 0.15,  // kritik vuruşta donma
  hitstopKill: 0.12,  // öldürücü darbede donma
  kb:          310,   // normal vuruş geri tepmesi (px/s)
  kbCrit:      480,   // kritik geri tepme
  shake:       5,     // normal vuruş sarsıntısı
  shakeCrit:   9,     // kritik sarsıntı
  particles:   true,  // kıvılcım/patlama parçacıkları (FPS testi için false yap)
  sfx:         true,  // tüm sesler (FPS testi için false yap)
  // --- YENİ HİS KATMANLARI (beğenmezsen tek tek false yap, eski hale döner) ---
  impactFrame: true,  // vuruş anında temas noktasında beyaz patlama flaşı (1-2 kare)
  slashTrail:  true,  // vuruş yönünde parlayan kısa kesme yayı
  numberPop:   true,  // hasar sayısı fırlayıp zıplasın (düz süzülme yerine)
};

// Vuruş anı flaşları ve kesme izleri — kısa ömürlü, her karede sönerek çizilir.
const impactFlashes = []; // {x,y,t,life,crit}
const slashTrails = [];   // {x,y,ang,t,life,crit}

// ---------- SES (SFX) — WebAudio sürümü ----------
// ESKİ SORUN: new Audio() + play() mobilde ana thread'i tıkıyordu; adım sesi
// her 0.3 sn'de çaldığı için oyuna ritmik KASMA olarak biniyordu.
// YENİ: sesler ilk dokunuşta BİR KERE belleğe çözülür (decodeAudioData),
// sonrası neredeyse bedava — pitch/volume dahil hiçbir maliyeti yok.
const SFX_PATHS = {
  vurus: "assets/sfx/sword_clash.wav",
  adim: "assets/sfx/foley_footstep_gravel_1.wav",
  olum: "assets/sfx/vibraphone_negative.wav",
};
let audioCtx = null;
const sfxBuffers = {};
function initAudio() {
  if (audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  for (const name in SFX_PATHS) {
    fetch(SFX_PATHS[name])
      .then(r => r.arrayBuffer())
      .then(b => audioCtx.decodeAudioData(b))
      .then(buf => { sfxBuffers[name] = buf; })
      .catch(() => {}); // dosya yoksa sessiz geç — oyun sessiz ama akıcı devam eder
  }
}
// Tarayıcı ses iznini ilk kullanıcı jestiyle verir — üç kanaldan da yakala
window.addEventListener("touchstart", initAudio, { once: true, passive: true });
window.addEventListener("keydown", initAudio, { once: true });
window.addEventListener("mousedown", initAudio, { once: true });

function playSfx(name, { volume = 1, pitch = 1, pitchVar = 0 } = {}) {
  if (!audioCtx || !sfxBuffers[name]) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  const src = audioCtx.createBufferSource();
  src.buffer = sfxBuffers[name];
  src.playbackRate.value = Math.max(0.5, pitch + (Math.random() - 0.5) * 2 * pitchVar);
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  src.connect(gain);
  gain.connect(audioCtx.destination);
  src.start();
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
  e.kbVx = (e.kbVx || 0) + kx * (hit.crit ? JUICE.kbCrit : JUICE.kb);
  e.kbVy = (e.kbVy || 0) + ky * (hit.crit ? JUICE.kbCrit : JUICE.kb);

  triggerHitstop(hit.crit ? JUICE.hitstopCrit : JUICE.hitstop);
  triggerShake(hit.crit ? JUICE.shakeCrit : JUICE.shake, hit.crit ? 0.16 : 0.1);
  if (JUICE.sfx) playSfx("vurus", { volume: hit.crit ? 1 : 0.75, pitch: hit.crit ? 0.85 : 1.05, pitchVar: 0.08 });

  // IMPACT FRAME: temas noktasında bir anlık beyaz patlama flaşı — "sert değdi" hissi
  if (JUICE.impactFrame) {
    impactFlashes.push({ x: e.x, y: e.y, t: 0, life: hit.crit ? 0.14 : 0.1, crit: hit.crit });
  }
  // SLASH TRAIL: vuruş yönünde parlayan kısa kesme yayı
  if (JUICE.slashTrail) {
    slashTrails.push({ x: player.x, y: player.y, ang: Math.atan2(ky, kx), t: 0, life: 0.14, crit: hit.crit });
  }

  // Hasar sayısı: numberPop açıksa yerçekimiyle fırlar/zıplar, değilse düz süzülür
  if (JUICE.numberPop) {
    spawnFloatingText(
      e.x + kx * 10, e.y - e.r - 6,
      (hit.crit ? "KRİTİK -" : "-") + hit.dmg,
      hit.crit ? "#ffcc4d" : "#ffffff",
      { size: hit.crit ? 24 : 15, vx: kx * 90 + (Math.random()-0.5)*40, rise: 0, pop: true, crit: hit.crit }
    );
  } else {
    spawnFloatingText(
      e.x + kx * 10, e.y - e.r - 6,
      (hit.crit ? "KRİTİK -" : "-") + hit.dmg,
      hit.crit ? "#ffcc4d" : "#ffffff",
      { size: hit.crit ? 23 : 15, vx: kx * 70, rise: hit.crit ? 55 : 40 }
    );
  }

  // Kıvılcımlar her yöne değil, VURUŞ YÖNÜNE saçılır (kesme hissi)
  if (JUICE.particles) {
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
}

// ---------- ÖLÜM PAKETİ ----------
// Canavar ölümü ödül gibi hissettirsin: tok ses + donma + halka patlaması.
function deathJuice(e, color, count = 20) {
  triggerHitstop(JUICE.hitstopKill);
  triggerShake(6, 0.14);
  if (JUICE.sfx) playSfx("vurus", { volume: 1, pitch: 0.68, pitchVar: 0.05 }); // pes pitch = "son darbe" tınısı
  // Öldürücü darbede daha büyük bir impact flaşı — "son vuruş" tatmini
  if (JUICE.impactFrame) {
    impactFlashes.push({ x: e.x, y: e.y, t: 0, life: 0.18, crit: true });
  }
  if (JUICE.particles) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4; // düzgün halka + hafif rastgelelik
      const speed = 70 + Math.random() * 130;
      spawnParticle(e.x, e.y, {
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.55, size: Math.random() * 3 + 1.5, color,
      });
    }
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
  if (particles.length > 220) particles.shift(); // mobil emniyeti: tavan aşılırsa en eskisi silinir
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
const floatingTexts = []; // {x,y,text,color,t,life,size,vx,rise,pop,vy}
// opts (hepsi opsiyonel, eski 4-argümanlı çağrılar aynen çalışır):
//   size: font boyutu (varsayılan 14) · vx: yatay fırlama hızı (vuruş yönü)
//   rise: yukarı süzülme hızı (varsayılan 40) · pop: true ise yerçekimiyle
//   fırlayıp zıplar (rise yerine); crit: kritikse daha güçlü zıplar
function spawnFloatingText(x, y, text, color = "#ffcc4d", opts = {}) {
  floatingTexts.push({
    x, y, text, color, t: 0, life: opts.pop ? 0.7 : 0.9,
    size: opts.size ?? 14,
    vx: opts.vx ?? 0,
    pop: !!opts.pop,
    vy: opts.pop ? -(opts.crit ? 260 : 200) : 0, // pop: yukarı fırlama başlangıç hızı
    rise: opts.rise ?? 40,
  });
}

function updateFloatingTexts(dt) {
  updateImpactEffects(dt); // impact/slash de burada güncellensin (12-main'e dokunmadan)
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const f = floatingTexts[i];
    f.t += dt;
    f.x += f.vx * dt;
    f.vx *= Math.max(0, 1 - dt * 5); // yatay fırlama hızla söner, yazı "oturur"
    if (f.pop) {
      // Yerçekimli zıplama: yukarı fırlar, yavaşlar, düşer — sayı "çarptı" hissi
      f.y += f.vy * dt;
      f.vy += 900 * dt; // yerçekimi
    }
    if (f.t >= f.life) floatingTexts.splice(i, 1);
  }
}

// Impact flaşları + slash izleri: kısa ömürlü, her karede zaman ilerler
function updateImpactEffects(dt) {
  for (let i = impactFlashes.length - 1; i >= 0; i--) {
    impactFlashes[i].t += dt;
    if (impactFlashes[i].t >= impactFlashes[i].life) impactFlashes.splice(i, 1);
  }
  for (let i = slashTrails.length - 1; i >= 0; i--) {
    slashTrails[i].t += dt;
    if (slashTrails[i].t >= slashTrails[i].life) slashTrails.splice(i, 1);
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
  drawImpactEffects(); // impact flaş + slash izi sayılardan ÖNCE (arkada) çizilsin
  for (const f of floatingTexts) {
    // pop modunda y'yi fizik yönetir (rise=0); değilse eskisi gibi yukarı süzülür
    const sx = f.x - camera.x, sy = f.y - camera.y - f.t * f.rise;
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

// IMPACT + SLASH çizimi: parçacıklardan sonra, hasar sayısından önce çizilir
// (12-main render sırasına ekleniyor). Kısa ömürlü, hızla sönen katman.
function drawImpactEffects() {
  // Slash izleri: vuruş yönünde parlayan hilal/yay
  for (const s of slashTrails) {
    const prog = s.t / s.life;           // 0→1
    const alpha = 1 - prog;
    const sx = s.x - camera.x, sy = s.y - camera.y;
    const reach = 46;                    // yayın oyuncudan uzanma mesafesi
    const cx = sx + Math.cos(s.ang) * reach * 0.7;
    const cy = sy + Math.sin(s.ang) * reach * 0.7;
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.translate(cx, cy);
    ctx.rotate(s.ang);
    ctx.lineCap = "round";
    // dıştan içe iki kavis: geniş renkli + ince beyaz
    const spread = s.crit ? 1.5 : 1.2;
    ctx.strokeStyle = s.crit ? "#ffd766" : "rgba(255,255,255,0.9)";
    ctx.lineWidth = s.crit ? 7 : 5;
    ctx.beginPath();
    ctx.arc(0, 0, reach * 0.6, -spread/2, spread/2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, reach * 0.6, -spread/2, spread/2);
    ctx.stroke();
    ctx.restore();
  }
  // Impact flaşları: temas noktasında büyüyüp sönen beyaz yıldız-patlama
  for (const f of impactFlashes) {
    const prog = f.t / f.life;
    const alpha = 1 - prog;
    const sx = f.x - camera.x, sy = f.y - camera.y;
    const r = (f.crit ? 22 : 15) * (0.5 + prog * 0.8); // büyüyerek söner
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy);
    // 4 kollu parlama yıldızı
    ctx.strokeStyle = f.crit ? "#fff2c2" : "#ffffff";
    ctx.lineWidth = f.crit ? 4 : 3;
    ctx.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.stroke();
    }
    // merkez parlama
    ctx.fillStyle = f.crit ? "rgba(255,240,190,0.9)" : "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
