// ---------- OYUNCU ----------
const player = {
  x: WORLD_W / 2,
  y: WORLD_H / 2,
  r: 20,               // çarpışma yarıçapı
  speed: 220,           // px/saniye (tam hız)
  vx: 0, vy: 0,         // gerçek hız (ivme/sürtünmeyle yumuşatılıyor)
  facing: "down",       // "up" | "down" | "left" | "right"
  moving: false,
  animT: 0,             // yürüme animasyonu zaman sayacı
  spriteFrameT: 0,      // sprite karesi zaman sayacı (walk/idle için)
  attacking: false,
  attackT: 0,           // saldırı animasyon zaman sayacı (0..ATTACK_DURATION)
  aimAngle: 0,          // [DİKEY] oto-saldırının hedeflediği açı (en yakın düşmana)
  attackCooldown: 0,
  hp: 100,
  maxHp: 100,
  invulnT: 0,           // hasar sonrası kısa dokunulmazlık (i-frame) süresi
  knockVx: 0, knockVy: 0, // canavar vurunca oluşan geri tepme hızı (ayrı tutulur, hareketle çakışmasın)
};

const ACCEL = 1600;     // px/s^2 — hızlanma
const FRICTION = 1800;  // px/s^2 — durma sürtünmesi
const ATTACK_DURATION = 0.28; // saniye
const ATTACK_COOLDOWN = 0.22; // saniye (art arda çok hızlı vuramasın)
const ATTACK_BUFFER = 0.18;   // saniye — erken basılan saldırı bu kadar süre "hatırlanır" (input buffering)
const ATTACK_LUNGE = 150;     // saldırıda ileri atılma itişi (px/s, knock kanalından sönümlenir)
// [DİKEY] Oto-saldırı: cleave (yay) yarı açısı. Prototipteki ±38°'yi baz aldık;
// oto-hedef zaten en yakına nişanlandığı için bu açı "yanındaki KAÇ düşmanı da
// biçer"i belirler. Dengeli değer; istersen buradan tek yerden ayarla.
const PLAYER_ARC_HALF = 40 * Math.PI / 180; // ±40° (toplam 80° cleave)
const AUTO_ENGAGE_MARGIN = 12;  // menzile bu kadar pay eklenince saldırı tetiklenir
let attackBufferT = 0;        // saldırı tamponu sayacı (artık kullanılmıyor — oto-saldırı)
let footstepT = 0;            // adım sesi zamanlayıcısı


// ============================================================
// GÜNCELLEME (UPDATE)
// ============================================================
function updatePlayer(dt) {
  // Ölüm ekranı aktifken oyuncu tamamen donar (12-main geri sayımı işletir)
  if (deathSeq.active) return;

  // Hedef yön vektörü: klavye veya joystick
  let ix = 0, iy = 0;
  if (keys["w"] || keys["arrowup"]) iy -= 1;
  if (keys["s"] || keys["arrowdown"]) iy += 1;
  if (keys["a"] || keys["arrowleft"]) ix -= 1;
  if (keys["d"] || keys["arrowright"]) ix += 1;
  if (ix === 0 && iy === 0 && (joyVec.x !== 0 || joyVec.y !== 0)) {
    ix = joyVec.x; iy = joyVec.y;
  }
  const len = Math.hypot(ix, iy);
  if (len > 1) { ix /= len; iy /= len; }

  player.moving = len > 0.05;

  // Yön (facing) güncelle — sadece anlamlı bir hareket varsa VE saldırı anında
  // değilse (oto-saldırı yönü hedefe kilitli kalsın, hareketle bozulmasın).
  if (player.moving && !player.attacking) {
    if (Math.abs(ix) > Math.abs(iy)) player.facing = ix > 0 ? "right" : "left";
    else player.facing = iy > 0 ? "down" : "up";
  }

  // İvmeli hareket: hedef hıza doğru accel, hareket yoksa friction ile dur
  const targetVx = ix * player.speed;
  const targetVy = iy * player.speed;

  function approach(current, target, rate) {
    if (current < target) return Math.min(current + rate * dt, target);
    if (current > target) return Math.max(current - rate * dt, target);
    return current;
  }
  const rateX = player.moving ? ACCEL : FRICTION;
  const rateY = player.moving ? ACCEL : FRICTION;
  player.vx = approach(player.vx, targetVx, rateX);
  player.vy = approach(player.vy, targetVy, rateY);

  // Geri tepme (knockback): normal hareketten bağımsız, hızla sönümlenen ekstra bir itiş
  player.knockVx *= Math.max(0, 1 - dt * 6);
  player.knockVy *= Math.max(0, 1 - dt * 6);
  if (Math.abs(player.knockVx) < 2) player.knockVx = 0;
  if (Math.abs(player.knockVy) < 2) player.knockVy = 0;

  const totalVx = player.vx + player.knockVx;
  const totalVy = player.vy + player.knockVy;

  // Hareket öncesi konum, çarpışma testi için X/Y ayrı ayrı denenir (duvara
  // sürtünerek kayabilsin diye — sadece X veya sadece Y bloklanabilir).
  const nx = player.x + totalVx * dt;
  const ny = player.y + totalVy * dt;

  if (!collidesWithObstacles(nx, player.y, player.r)) player.x = nx;
  else player.vx = 0;
  if (!collidesWithObstacles(player.x, ny, player.r)) player.y = ny;
  else player.vy = 0;

  // Harita sınırları
  player.x = Math.max(player.r, Math.min(WORLD_W - player.r, player.x));
  player.y = Math.max(player.r, Math.min(WORLD_H - player.r, player.y));

  if (player.invulnT > 0) player.invulnT -= dt;

  if (player.hp <= 0) {
    // handlePlayerDeath artık DOĞRUDAN çağrılmıyor — önce 3 sn'lik ölüm
    // ekranı oynar (05-effects), süre dolunca 12-main cezayı/respawn'ı işletir.
    startDeathSequence();
  }
  hpLabelEl.textContent = player.hp;

  // Yürüme animasyon sayacı (his: bacak/gövde sallanması için)
  if (player.moving) player.animT += dt * 8;

  // Sprite kare sayacı: yürürken WALK_FPS, dururken IDLE_FPS hızında ilerler.
  // Saldırı sırasında ayrı bir zamanlama (attackT'ye bağlı) kullanıldığı için
  // burada dokunulmuyor.
  if (!player.attacking) {
    player.spriteFrameT += dt * (player.moving ? WALK_FPS : IDLE_FPS);
  }

  // Adım sesi: yürürken ritmik, her adımda pitch hafif değişir (robotik tekrar kırılır)
  if (footstepT > 0) footstepT -= dt;
  if (player.moving && footstepT <= 0) {
    footstepT = 0.3;
    playSfx("adim", { volume: 0.22, pitchVar: 0.15 });
  }

  // Adım tozu parçacıkları (hafif, seyrek)
  if (player.moving && Math.random() < 0.35) {
    spawnParticle(player.x, player.y + player.r * 0.7, {
      vx: -player.vx * 0.08 + (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 10,
      life: 0.35, size: Math.random() * 2 + 1.5,
      color: "rgba(255,255,255,0.35)"
    });
  }

  // [DİKEY] OTOMATİK SALDIRI — saldırı butonu yok. Her uygun anda (cooldown
  // bitince) en yakın düşman hedeflenir; menzildeyse kılıç ona doğru savrulur.
  // Oyuncu sadece hareket/kaçınmaya odaklanır. Hız statı hâlâ attackCooldown
  // setter'ından (14-hero-stats) geçtiği için aynen çalışır.
  if (player.attackCooldown > 0) player.attackCooldown -= dt;
  if (!player.attacking && player.attackCooldown <= 0) {
    let near = null, nd = Infinity;
    function scanEnemies(arr) {
      if (typeof arr === "undefined") return;
      for (const e of arr) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < nd) { nd = d; near = e; }
      }
    }
    scanEnemies(typeof orcs !== "undefined" ? orcs : undefined);
    scanEnemies(typeof soldiers !== "undefined" ? soldiers : undefined);
    scanEnemies(typeof goblins !== "undefined" ? goblins : undefined);

    if (near) {
      // İsabet testiyle aynı erişim (player.r + 30 + hedef.r) + küçük pay
      const reach = player.r + 30 + near.r + AUTO_ENGAGE_MARGIN;
      if (nd <= reach) {
        player.aimAngle = Math.atan2(near.y - player.y, near.x - player.x);
        // Sprite için 4 yönlü facing (hedefin açısına en yakın yön)
        player.facing = Math.abs(Math.cos(player.aimAngle)) > Math.abs(Math.sin(player.aimAngle))
          ? (Math.cos(player.aimAngle) > 0 ? "right" : "left")
          : (Math.sin(player.aimAngle) > 0 ? "down" : "up");
        player.attacking = true;
        player.attackT = 0;
        player.attackCooldown = ATTACK_COOLDOWN;

        // Lunge: hedefe doğru fiziksel atılma (knock kanalı — çarpışmaya saygılı)
        player.knockVx += Math.cos(player.aimAngle) * ATTACK_LUNGE;
        player.knockVy += Math.sin(player.aimAngle) * ATTACK_LUNGE;

        triggerShake(3, 0.12);
        spawnSwingParticles();
      }
    }
  }

  if (player.attacking) {
    player.attackT += dt;
    if (player.attackT >= ATTACK_DURATION) {
      player.attacking = false;
      player.attackT = 0;
    }
  }
}

function collidesWithObstacles(x, y, r) {
  for (const o of obstacles) {
    const dx = x - o.x, dy = y - o.y;
    const dist = Math.hypot(dx, dy);
    if (dist < r + o.r) return true;
  }
  return false;
}

// Saldırı anında, oyuncunun baktığı yöne doğru birkaç kıvılcım/parçacık
// fırlat (canavar olmadığı için "havaya vuruş" hissi, ama en azından
// zamanlama ve görsel geri bildirim test edilebiliyor).
function spawnSwingParticles() {
  const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.facing];
  const baseAngle = Math.atan2(dir[1], dir[0]);
  const swingRange = 60 * (Math.PI / 180);
  for (let i = 0; i < 10; i++) {
    const a = baseAngle + (Math.random() - 0.5) * swingRange;
    const dist = player.r + 26 + Math.random() * 10;
    spawnParticle(
      player.x + Math.cos(a) * dist,
      player.y + Math.sin(a) * dist,
      {
        vx: Math.cos(a) * 140,
        vy: Math.sin(a) * 140,
        life: 0.22, size: Math.random() * 2.5 + 1.5,
        color: "rgba(255,204,77,0.9)"
      }
    );
  }
}

// ASSET: Bu fonksiyon ileride tek bir sprite/spritesheet çizimiyle
// değiştirilecek. Şimdilik çizilmiş şekillerle (placeholder) "kapsül gövde +
// yön göstergesi" mantığında bir karakter, yürüme bobbing'i ve saldırı
// animasyonuyla birlikte çiziliyor.
function drawPlayer() {
  const sx = player.x - camera.x, sy = player.y - camera.y;

  // Yürüme bobbing'i (yukarı-aşağı hafif sekme)
  const bob = player.moving ? Math.sin(player.animT) * 3 : Math.sin(performance.now() / 500) * 1.2;

  // gölge (zeminde sabit, karakterle birlikte boblamaz)
  ctx.beginPath();
  ctx.ellipse(sx, sy + player.r * 0.75, player.r * 0.85, player.r * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fill();

  const bodyY = sy + bob;

  // Saldırı anında hafif "lunge" (öne atılma) hissi
  let lungeX = 0, lungeY = 0;
  if (player.attacking) {
    const progress = player.attackT / ATTACK_DURATION;
    const lunge = Math.sin(progress * Math.PI) * 8;
    const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.facing];
    lungeX = dir[0] * lunge; lungeY = dir[1] * lunge;
  }

  const px = sx + lungeX, py = bodyY + lungeY;

  // Hasar sonrası kısa dokunulmazlık süresinde yanıp sönme
  if (player.invulnT > 0 && Math.floor(player.invulnT * 16) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }

  const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.facing];

  if (characterSheetReady) {
    // ---- SPRITE ÇİZİMİ: karakter sheet'inden doğru satır/kareyi seç ----
    const drawSize = player.r * 3.4;

    if (player.attacking) {
      // KILIÇLI SALDIRI: 192x192 oversize bölümden. Gövde, oversize karenin
      // tam ortasındaki 64'lük alanda olduğu için çizim 3 kat büyük yapılır
      // ve 1 gövde-boyu sol/üst kaydırılır — böylece karakter normal
      // karelerdeki konumuyla birebir hizalı kalır, sadece kılıç dışarı taşar.
      const frame = Math.min(OVERSIZE_SLASH_FRAMES - 1,
        Math.floor((player.attackT / ATTACK_DURATION) * OVERSIZE_SLASH_FRAMES));
      const row = OVERSIZE_SLASH_ROWS[player.facing];
      const bigSize = drawSize * 3;
      ctx.drawImage(
        characterSheet,
        frame * OVERSIZE_CELL, OVERSIZE_START_Y + row * OVERSIZE_CELL,
        OVERSIZE_CELL, OVERSIZE_CELL,
        px - drawSize / 2 - drawSize, py - drawSize * 0.72 - drawSize,
        bigSize, bigSize
      );
    } else {
      let action = "idle", frameCount = SPRITE_FRAME_COUNTS.idle;
      if (player.moving) { action = "walk"; frameCount = SPRITE_FRAME_COUNTS.walk; }

      const row = SPRITE_ROWS[action][player.facing];
      const frame = Math.floor(player.spriteFrameT) % frameCount;

      const sheetX = frame * SPRITE_CELL, sheetY = row * SPRITE_CELL;
      // Sprite hücresi 64x64; oyuncuyu belirgin göstermek için çapının ~3
      // katı büyüklükte, ayakları player.y hizasına gelecek şekilde çiziliyor.
      ctx.drawImage(
        characterSheet,
        sheetX, sheetY, SPRITE_CELL, SPRITE_CELL,
        px - drawSize / 2, py - drawSize * 0.72, drawSize, drawSize
      );
    }
  } else {
    // Sprite henüz yüklenmediyse eski placeholder gövdeyle çiz (yedek)
    ctx.beginPath();
    ctx.ellipse(px, py, player.r * 0.85, player.r, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(px - 6, py - 10, 4, px, py, player.r * 1.1);
    grad.addColorStop(0, "#ff9fc9");
    grad.addColorStop(1, "#ff2d87");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#c2005f";
    ctx.stroke();
  }

  // ---- YEDEK SALDIRI GÖRSELİ: sprite sheet henüz yüklenmediyse eski sarı
  // yay çizilir. Sheet hazırsa buna gerek yok — kılıç animasyonu sprite'ın
  // kendisinde (oversize slash) olduğu için yay/iz VFX'i kaldırıldı.
  if (player.attacking && !characterSheetReady) {
    const progress = player.attackT / ATTACK_DURATION; // 0..1
    const baseAngle = Math.atan2(dir[1], dir[0]);
    const swingArc = 100 * (Math.PI / 180);
    const swingProgress = Math.sin(progress * Math.PI); // 0 -> 1 -> 0 şeklinde yumuşak
    const radius = player.r + 18 + swingProgress * 14;

    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - progress * 0.4);
    ctx.strokeStyle = "#ffcc4d";
    ctx.lineWidth = 6 * (1 - progress * 0.5);
    ctx.beginPath();
    ctx.arc(px, py, radius, baseAngle - swingArc / 2, baseAngle + swingArc / 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.globalAlpha = 1; // i-frame flaşından kalan alpha'yı sıfırla, sonraki kareye sızmasın
}

