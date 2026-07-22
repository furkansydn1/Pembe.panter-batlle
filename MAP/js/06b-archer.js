// ============================================================
// ARCHER — MENZİLLİ DÜŞMAN (Yıkık Kale'nin yeni davranışı)
// Ritim: mesafe koru → NİŞAN AL (telegraph, yay gerilir) → OK FIRLAT →
// bekle (cooldown). Oyuncu çok yaklaşırsa (kaçış menzili) koşarak açılır.
// Ok gerçek bir mermi: uçar, engele/oyuncuya/haritaya çarpınca söner.
//
// ASSET: 192x192 hücreli Tiny Swords okçu sheet'i (biyom skins.archer.src):
//   satır 0 = idle (6 kare)          satır 1 = koşu (6 kare)
//   satır 2 = atış YUKARI (8 kare)   satır 4 = atış YANA (8 kare)
//   satır 6 = atış AŞAĞI (8 kare)    (çapraz satırlar 3/5 kullanılmıyor)
// Atışın ilk 5 karesi = yay gerilme (nişan/telegraph), son 3 kare = bırakış.
// Hasar/ölüm satırı YOK → goblin tekniği: beyaz siluet flaşı + ezilerek sönme.
// Bu dosya SADECE biyomda skins.archer varsa canavar üretir; orman/bataklık
// hiç etkilenmez (archers dizisi boş kalır).
// ============================================================
var ARCHER_SKIN = (typeof ACTIVE_BIOME !== "undefined" && ACTIVE_BIOME.skins && ACTIVE_BIOME.skins.archer) || null;
const ARCHER_CELL = (ARCHER_SKIN && ARCHER_SKIN.cell) || 192;
const ARCHER_DISPLAY = (ARCHER_SKIN && ARCHER_SKIN.display) || 139; // gövde 62px/192 → ekranda ~45px (oyuncu 64 referans)
const ARCHER_ROW_IDLE = 0, ARCHER_ROW_WALK = 1;
const ARCHER_ROW_SHOOT_UP = 2, ARCHER_ROW_SHOOT_SIDE = 4, ARCHER_ROW_SHOOT_DOWN = 6;
const ARCHER_FRAMES_IDLE = 6, ARCHER_FRAMES_WALK = 6, ARCHER_FRAMES_SHOOT = 8;

if (typeof archerImg === "undefined") {
  var archerImg = new Image();
  var archerImgReady = false;
  archerImg.onload = () => { archerImgReady = true; };
  if (ARCHER_SKIN) archerImg.src = ARCHER_SKIN.src; // skin yoksa hiç yükleme (biyomda okçu yok)
}

// Vuruş flaşı için izole ara canvas (goblin/asker tekniğiyle aynı)
const archerFxCanvas = document.createElement("canvas");
archerFxCanvas.width = ARCHER_CELL;
archerFxCanvas.height = ARCHER_CELL;
const archerFxCtx = archerFxCanvas.getContext("2d");

// ---- Denge sabitleri ----
const ARCHER_AIM_DUR = 0.55;      // yay gerilme (telegraph) süresi
const ARCHER_RELEASE_DUR = 0.25;  // bırakış animasyonu
const ARCHER_SHOOT_COOLDOWN = 1.4;// iki atış arası bekleme
const ARCHER_SHOOT_RANGE = 250;   // bu menzilde atış yapar — ekran içinden, "nereden geldi bu ok" olmasın
const ARCHER_FLEE_RANGE = 130;    // oyuncu bundan yakınsa kaçar
const ARCHER_AGGRO_RANGE = 320;   // fark etme menzili
const ARROW_SPEED = 330;
const ARROW_LIFE = 1.5;           // sn — süresi dolan ok kaybolur
const ARROW_DMG_BASE = 9;         // x MOB_DMG_MULT

function makeArcher(x, y) {
  return {
    type: "archer",
    x, y,
    r: 20,
    hp: Math.round(40 * MOB_HP_MULT), maxHp: Math.round(40 * MOB_HP_MULT),
    walkSpeed: 62,
    fleeSpeed: 95,
    state: "walk",       // "walk" | "aim" | "release"
    stateT: 0,
    shootCooldown: 0,
    aimDirX: 1, aimDirY: 0, // atış yönü (nişanda kilitlenir)
    facing: 1,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderT: Math.random() * 2,
    strafeDir: Math.random() < 0.5 ? 1 : -1,  // [ZEKÂ] bekleme sırasında yan adım yönü
    strafeT: 1 + Math.random() * 2,
    animT: 0,
    hitFlashT: 0,
    squish: 0,
    justHit: false,
    dead: false,
    deathT: 0,
  };
}
let archers = [];
let arrows = []; // aktif oklar: {x,y,vx,vy,angle,life}

function spawnArrow(a) {
  arrows.push({
    x: a.x + a.aimDirX * 14, y: a.y - 8 + a.aimDirY * 14,
    vx: a.aimDirX * ARROW_SPEED, vy: a.aimDirY * ARROW_SPEED,
    angle: Math.atan2(a.aimDirY, a.aimDirX),
    life: ARROW_LIFE,
  });
  if (typeof playSfx === "function" && typeof JUICE !== "undefined" && JUICE.sfx)
    playSfx("vurus", { volume: 0.25, pitch: 1.5, pitchVar: 0.1 }); // kısa "vınn" — mevcut sesten pitch'le türetildi
}

function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const ar = arrows[i];
    ar.x += ar.vx * dt; ar.y += ar.vy * dt;
    ar.life -= dt;
    let kill = ar.life <= 0 ||
      ar.x < 0 || ar.x > WORLD_W || ar.y < 0 || ar.y > WORLD_H;
    // engele saplanma
    if (!kill) {
      for (const o of obstacles) {
        if (Math.hypot(ar.x - o.x, ar.y - o.y) < o.r) { kill = true; break; }
      }
    }
    // oyuncuya isabet
    if (!kill && player.invulnT <= 0 &&
        Math.hypot(ar.x - player.x, ar.y - player.y) < player.r + 5) {
      const dmg = Math.round(ARROW_DMG_BASE * MOB_DMG_MULT);
      player.hp = Math.max(0, player.hp - dmg);
      player.invulnT = 0.5;
      triggerShake(6, 0.18);
      spawnFloatingText(player.x, player.y - player.r - 6, "-" + dmg, "#ff5c6c");
      const kn = Math.hypot(ar.vx, ar.vy) || 1;
      player.knockVx = (ar.vx / kn) * 240; player.knockVy = (ar.vy / kn) * 240;
      hpLabelEl.textContent = player.hp;
      kill = true;
    }
    if (kill) arrows.splice(i, 1);
  }
}

function updateArchers(dt) {
  updateArrows(dt);
  for (const a of archers) {
    if (a.dead) { a.deathT += dt; continue; }
    if (a.shootCooldown > 0) a.shootCooldown -= dt;
    if (a.hitFlashT > 0) a.hitFlashT -= dt;
    a.squish = Math.max(0, a.squish - dt * 4);
    a.animT += dt;

    // vuruş geri tepmesi (hitJuice yazar)
    if (a.kbVx || a.kbVy) {
      a.x += a.kbVx * dt; a.y += a.kbVy * dt;
      a.kbVx *= Math.max(0, 1 - dt * 10);
      a.kbVy *= Math.max(0, 1 - dt * 10);
      if (Math.abs(a.kbVx) < 4) a.kbVx = 0;
      if (Math.abs(a.kbVy) < 4) a.kbVy = 0;
    }

    const dx = player.x - a.x, dy = player.y - a.y;
    const dist = Math.hypot(dx, dy);

    if (a.state === "walk") {
      if (dist < ARCHER_FLEE_RANGE) {
        // ÇOK YAKIN → ters yöne koşarak açıl (nişan bozulur)
        const nx = dx / (dist || 1), ny = dy / (dist || 1);
        a.x -= nx * a.fleeSpeed * dt;
        a.y -= ny * a.fleeSpeed * dt;
        if (nx !== 0) a.facing = nx > 0 ? 1 : -1; // kaçarken de oyuncuya bakar
      } else if (dist < ARCHER_SHOOT_RANGE && a.shootCooldown <= 0) {
        // MENZİLDE → nişan al (yön kilitlenir, telegraph başlar)
        a.state = "aim"; a.stateT = 0;
        a.aimDirX = dx / (dist || 1); a.aimDirY = dy / (dist || 1);
        if (a.aimDirX !== 0) a.facing = a.aimDirX > 0 ? 1 : -1;
      } else if (dist < ARCHER_AGGRO_RANGE) {
        // fark etti: menzil dışıysa sokul; menzildeyken ok beklerken YAN ADIM atar
        // (sabit hedef olmaz, oyuncunun etrafında yay çizer — vurması zorlaşır)
        const nx = dx / (dist || 1), ny = dy / (dist || 1);
        if (dist > ARCHER_SHOOT_RANGE * 0.8) {
          a.x += nx * a.walkSpeed * dt; a.y += ny * a.walkSpeed * dt;
        } else if (a.shootCooldown > 0) {
          a.strafeT -= dt;
          if (a.strafeT <= 0) { a.strafeDir *= -1; a.strafeT = 1.2 + Math.random() * 1.6; }
          a.x += -ny * a.strafeDir * a.walkSpeed * 0.8 * dt;  // dik yönde kay
          a.y +=  nx * a.strafeDir * a.walkSpeed * 0.8 * dt;
        }
        if (nx !== 0) a.facing = nx > 0 ? 1 : -1;
      } else {
        // aggro dışı serseri gezinme
        a.wanderT -= dt;
        if (a.wanderT <= 0) {
          a.wanderAngle = Math.random() * Math.PI * 2;
          a.wanderT = 1.8 + Math.random() * 1.6;
        }
        const wx = Math.cos(a.wanderAngle);
        a.x += wx * (a.walkSpeed * 0.4) * dt;
        a.y += Math.sin(a.wanderAngle) * (a.walkSpeed * 0.4) * dt;
        if (Math.abs(wx) > 0.2) a.facing = wx > 0 ? 1 : -1;
      }
    } else if (a.state === "aim") {
      a.stateT += dt;
      // Nişan sırasında yön hafifçe oyuncuyu izler (tam aim-bot olmasın diye yavaş)
      const nd = Math.hypot(dx, dy) || 1;
      a.aimDirX += ((dx / nd) - a.aimDirX) * dt * 2.5;
      a.aimDirY += ((dy / nd) - a.aimDirY) * dt * 2.5;
      const L = Math.hypot(a.aimDirX, a.aimDirY) || 1;
      a.aimDirX /= L; a.aimDirY /= L;
      if (a.aimDirX !== 0) a.facing = a.aimDirX > 0 ? 1 : -1;
      if (a.stateT >= ARCHER_AIM_DUR) {
        a.state = "release"; a.stateT = 0;
        spawnArrow(a); // ok bırakışın İLK anında çıkar
        a.shootCooldown = ARCHER_SHOOT_COOLDOWN;
      }
    } else if (a.state === "release") {
      a.stateT += dt;
      if (a.stateT >= ARCHER_RELEASE_DUR) a.state = "walk";
    }

    a.x = Math.max(a.r, Math.min(WORLD_W - a.r, a.x));
    a.y = Math.max(a.r, Math.min(WORLD_H - a.r, a.y));

    // ---- Oyuncunun saldırısına yakalanma (goblin ile aynı isabet testi) ----
    if (player.attacking && player.attackT < 0.14) {
      const dirVec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.facing];
      const toX = a.x - player.x, toY = a.y - player.y;
      const toDist = Math.hypot(toX, toY);
      const attackRange = player.r + 30 + a.r;
      if (toDist < attackRange && !a.justHit) {
        const angleTo = Math.atan2(toY, toX);
        const facingAngle = (typeof player.aimAngle === "number") ? player.aimAngle : Math.atan2(dirVec[1], dirVec[0]);
        let diff = Math.abs(angleTo - facingAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < PLAYER_ARC_HALF) {
          a.justHit = true;
          const hit = rollPlayerHit(14);
          a.hp -= hit.dmg;
          a.hitFlashT = 0.15;
          a.squish = 1;
          hitJuice(a, hit, "rgba(120,170,220,0.9)");
          // vurulunca nişanı bozulur — okçuya baskı kurmak işe yarar
          if (a.state === "aim") { a.state = "walk"; a.stateT = 0; }
          if (a.hp <= 0 && !a.dead) {
            a.dead = true;
            a.deathT = 0;
            maybeDropItem(a.x, a.y, "archer");
            deathJuice(a, "rgba(120,170,220,0.85)", 16);
          }
        }
      }
    }
    if (!player.attacking) a.justHit = false;
  }
}

// Atış yönüne göre satır: çoğunluk yatay → YANA (sola aynalanır),
// aşağı → AŞAĞI satırı, yukarı → YUKARI satırı (ön/arka aynalanmaz).
function archerShootRow(a) {
  if (Math.abs(a.aimDirX) >= Math.abs(a.aimDirY)) return ARCHER_ROW_SHOOT_SIDE;
  return a.aimDirY > 0 ? ARCHER_ROW_SHOOT_DOWN : ARCHER_ROW_SHOOT_UP;
}

function drawArrows() {
  for (const ar of arrows) {
    const sx = ar.x - camera.x, sy = ar.y - camera.y;
    if (sx < -30 || sx > VIEW_W + 30 || sy < -30 || sy > VIEW_H + 30) continue;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ar.angle);
    // gövde (ince çubuk) + uç (üçgen) + tüy — piksel-art okuyla uyumlu sade çizim
    ctx.strokeStyle = "#8a6a42"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(8, 0); ctx.stroke();
    ctx.fillStyle = "#d9dde2";
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(6, -3); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#c9524a";
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-14, -3); ctx.lineTo(-14, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawArchers() {
  for (const a of archers) {
    const sx = a.x - camera.x, sy = a.y - camera.y;
    const cullM = ARCHER_DISPLAY / 2 + 20;
    if (sx < -cullM || sx > VIEW_W + cullM || sy < -cullM || sy > VIEW_H + cullM) continue;

    // ---- ÖLÜM: hasar/ölüm satırı yok → beyaz flaş + ezilerek sönme ----
    if (a.dead) {
      const t = Math.min(1, a.deathT / 0.35);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.translate(sx, sy);
      ctx.scale((1 + t * 0.4) * a.facing, 1 - t * 0.8);
      if (archerImgReady) {
        if (a.deathT < 0.1) {
          archerFxCtx.clearRect(0, 0, ARCHER_CELL, ARCHER_CELL);
          archerFxCtx.drawImage(archerImg, 0, ARCHER_ROW_IDLE * ARCHER_CELL, ARCHER_CELL, ARCHER_CELL, 0, 0, ARCHER_CELL, ARCHER_CELL);
          archerFxCtx.globalCompositeOperation = "source-atop";
          archerFxCtx.fillStyle = "rgba(255,255,255,0.85)";
          archerFxCtx.fillRect(0, 0, ARCHER_CELL, ARCHER_CELL);
          archerFxCtx.globalCompositeOperation = "source-over";
          ctx.drawImage(archerFxCanvas, -ARCHER_DISPLAY / 2, -ARCHER_DISPLAY / 2, ARCHER_DISPLAY, ARCHER_DISPLAY);
        } else {
          ctx.drawImage(archerImg, 0, ARCHER_ROW_IDLE * ARCHER_CELL, ARCHER_CELL, ARCHER_CELL,
            -ARCHER_DISPLAY / 2, -ARCHER_DISPLAY / 2, ARCHER_DISPLAY, ARCHER_DISPLAY);
        }
      } else {
        ctx.beginPath(); ctx.arc(0, 0, a.r, 0, Math.PI * 2);
        ctx.fillStyle = "#4a6a8a"; ctx.fill();
      }
      ctx.restore();
      continue;
    }

    // gölge
    ctx.beginPath();
    ctx.ellipse(sx, sy + a.r * 0.7, a.r * 0.85, a.r * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    // ---- Kare seçimi ----
    let row, frame, flipX = a.facing;
    if (a.state === "aim") {
      // yay gerilme: atış satırının İLK 5 karesi, aim süresine yayılmış
      row = archerShootRow(a);
      frame = Math.min(4, Math.floor((a.stateT / ARCHER_AIM_DUR) * 5));
      if (row !== ARCHER_ROW_SHOOT_SIDE) flipX = 1;
    } else if (a.state === "release") {
      // bırakış: SON 3 kare
      row = archerShootRow(a);
      frame = 5 + Math.min(2, Math.floor((a.stateT / ARCHER_RELEASE_DUR) * 3));
      if (row !== ARCHER_ROW_SHOOT_SIDE) flipX = 1;
    } else {
      // hareket halindeyse koşu, değilse idle
      const moving = Math.abs(a.kbVx || 0) > 4 || true; // walk state'te hep hafif hareket var
      row = ARCHER_ROW_WALK;
      frame = Math.floor(a.animT * 8) % ARCHER_FRAMES_WALK;
    }

    const squishAmt = a.squish * 0.25;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(flipX * (1 + squishAmt), 1 - squishAmt);
    if (archerImgReady) {
      if (a.hitFlashT > 0) {
        archerFxCtx.clearRect(0, 0, ARCHER_CELL, ARCHER_CELL);
        archerFxCtx.drawImage(archerImg, frame * ARCHER_CELL, row * ARCHER_CELL, ARCHER_CELL, ARCHER_CELL, 0, 0, ARCHER_CELL, ARCHER_CELL);
        archerFxCtx.globalCompositeOperation = "source-atop";
        archerFxCtx.fillStyle = "rgba(255,255,255,0.75)";
        archerFxCtx.fillRect(0, 0, ARCHER_CELL, ARCHER_CELL);
        archerFxCtx.globalCompositeOperation = "source-over";
        ctx.drawImage(archerFxCanvas, -ARCHER_DISPLAY / 2, -ARCHER_DISPLAY / 2, ARCHER_DISPLAY, ARCHER_DISPLAY);
      } else {
        ctx.drawImage(archerImg, frame * ARCHER_CELL, row * ARCHER_CELL, ARCHER_CELL, ARCHER_CELL,
          -ARCHER_DISPLAY / 2, -ARCHER_DISPLAY / 2, ARCHER_DISPLAY, ARCHER_DISPLAY);
      }
    } else {
      ctx.beginPath(); ctx.arc(0, 0, a.r, 0, Math.PI * 2);
      ctx.fillStyle = a.hitFlashT > 0 ? "#ffffff" : a.state === "aim" ? "#ffcc4d" : "#4a7aa8";
      ctx.fill();
    }
    ctx.restore();

    // NİŞAN ÇİZGİSİ (telegraph): atış yönünde solan kesik çizgi — "ok geliyor" uyarısı
    if (a.state === "aim") {
      const t = a.stateT / ARCHER_AIM_DUR;
      ctx.save();
      ctx.globalAlpha = 0.25 + t * 0.35;
      ctx.strokeStyle = "#ffcc4d";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(sx + a.aimDirX * 18, sy + a.aimDirY * 12);
      ctx.lineTo(sx + a.aimDirX * (60 + t * 80), sy + a.aimDirY * (60 + t * 80));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (a.hp < a.maxHp) {
      const barW = 40, barH = 5;
      const bx = sx - barW / 2, by = sy - 34;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = "#6aa8d8";
      ctx.fillRect(bx, by, barW * Math.max(0, a.hp / a.maxHp), barH);
    }
  }
}
