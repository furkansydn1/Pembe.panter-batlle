// ============================================================
// ASKER — MENZİLİ TUTAN YAKIN DÖVÜŞ DÜŞMANI (SADECE HAREKET/SALDIRI PATERNİ)
// Slime'ın düz kovalamasından, yarasanın kaçamak dalışından ve goblin'in
// şarjından farklı bir his: asker oyuncuyu fark edince YÜRÜYEREK yaklaşır,
// menzile girince DURUR ve kılıcını sallar (saldırı animasyonunun belirli
// bir karesinde hasar uygular), kısa bir bekleme sonra tekrar dener.
// Yani "kaçmaz, kovalar, sabit menzilden vurur" — tutan/tank hissi.
//
// ASSET: assets/enemies/soldier.png — 900x700, 100x100'lük 7 satır x 9 sütun
// sprite sheet. Kullanılan satırlar:
//   satır 0 = idle      (6 kare)
//   satır 1 = yürüyüş   (8 kare)
//   satır 2 = saldırı   (6 kare)
//   satır 5 = hasar alma(4 kare)
//   satır 6 = ölüm      (4 kare)
// (satır 3 ve 4 şimdilik kullanılmıyor — ileride 2. saldırı/koşu için durur)
// ============================================================
const SOLDIER_FRAME = 100;      // her karenin px cinsinden genişlik/yüksekliği
// DİKKAT: sprite karesi 100x100 ama karakterin kendisi karenin ortasında
// sadece ~16-34px yer kaplıyor (Aseprite bol boşluklu export etmiş).
// O yüzden kare BÜYÜK çiziliyor ki içindeki asker normal boyutta görünsün.
const SOLDIER_DISPLAY = 230;    // ekranda çizilecek kare boyutu → görünen asker ~37px
// [BİYOM] Reskin: bataklıkta Demon sheet'i. Demon'da hurt=4, death=5. satırda
// (askerde 5/6) — satır numaraları skin'den gelir, kare sayıları aynı.
var SOLDIER_SKIN = (typeof ACTIVE_BIOME !== "undefined" && ACTIVE_BIOME.skins && ACTIVE_BIOME.skins.soldier) || null;
const SOLDIER_ROW_IDLE = 0, SOLDIER_ROW_WALK = 1, SOLDIER_ROW_ATTACK = 2,
      SOLDIER_ROW_HURT = SOLDIER_SKIN ? SOLDIER_SKIN.rowHurt : 5,
      SOLDIER_ROW_DEATH = SOLDIER_SKIN ? SOLDIER_SKIN.rowDeath : 6;
const SOLDIER_FRAMES_IDLE = 6, SOLDIER_FRAMES_WALK = 8, SOLDIER_FRAMES_ATTACK = 6, SOLDIER_FRAMES_HURT = 4, SOLDIER_FRAMES_DEATH = 4;

// Bu resim normalde 01-assets.js'te yüklenir; o dosyaya elin değmediyse
// (ör. henüz eklemediysen) burada da çalışsın diye burada tanımlandı.
// 01-assets.js'e taşımak istersen bu 5 satırı oraya kopyalayıp buradan silebilirsin.
if (typeof soldierImg === "undefined") {
  var soldierImg = new Image();
  var soldierImgReady = false;
  soldierImg.onload = () => { soldierImgReady = true; };
  soldierImg.src = SOLDIER_SKIN ? SOLDIER_SKIN.src : "assets/enemies/soldier.png"; // [BİYOM]
}

const SOLDIER_CONTACT_COOLDOWN = 0.9;   // saldırı vuruşları arası, oyuncunun tekrar hasar alabilmesi için minimum süre

// Vuruş flaşı için ara (offscreen) canvas: beyaz bindirme burada, izole
// şekilde yapılır — ana canvas'ta yapılsaydı altındaki zemini de beyaza
// boyar, sprite'ın etrafında beyaz bir KARE görünürdü (yaşanmış hata!).
const soldierFxCanvas = document.createElement("canvas");
soldierFxCanvas.width = SOLDIER_FRAME;
soldierFxCanvas.height = SOLDIER_FRAME;
const soldierFxCtx = soldierFxCanvas.getContext("2d");
const SOLDIER_ATTACK_TOTAL = 0.6;       // saldırı animasyonunun toplam süresi (6 kare boyunca)
const SOLDIER_ATTACK_HIT_FRAME = 3;     // kılıcın gerçekten "vurduğu" kare (0-indeksli) — telegraph burada biter
const SOLDIER_ATTACK_COOLDOWN = 0.7;    // bir saldırıdan sonraki bekleme

function makeSoldier(x, y) {
  return {
    type: "soldier",
    x, y,
    homeX: x, homeY: y,
    r: 16,
    hp: Math.round(35 * MOB_HP_MULT), maxHp: Math.round(35 * MOB_HP_MULT), // [DENGE] biyom can çarpanı
    walkSpeed: 95,
    aggroRange: 240,     // bu menzile girmeden asker fark etmez, home noktasında bekler
    attackRange: 58,     // bu mesafeye girince durup saldırıya geçer
    state: "idle",       // "idle" | "chase" | "attack" | "cooldown"
    stateT: 0,
    facing: 1,           // 1 = sağa bakıyor, -1 = sola (sprite'a göre ayna)
    hasHitThisAttack: false,
    contactCooldown: 0,
    hurtT: 0,            // >0 iken kısa süreliğine "hasar alma" karesi gösterilir
    hitFlashT: 0,
    animT: 0,            // idle/walk döngü animasyon zamanı
    justHit: false,
    dead: false,
    deathT: 0,
  };
}
let soldiers = [];

function updateSoldiers(dt) {
  for (const s of soldiers) {
    if (s.dead) { s.deathT += dt; continue; }
    if (s.contactCooldown > 0) s.contactCooldown -= dt;
    if (s.hitFlashT > 0) s.hitFlashT -= dt;
    if (s.hurtT > 0) s.hurtT -= dt;
    s.animT += dt;

    // Vuruş geri tepmesi (hitJuice yazar): hızla sönümlenen itiş
    if (s.kbVx || s.kbVy) {
      s.x += s.kbVx * dt; s.y += s.kbVy * dt;
      s.kbVx *= Math.max(0, 1 - dt * 10);
      s.kbVy *= Math.max(0, 1 - dt * 10);
      if (Math.abs(s.kbVx) < 4) s.kbVx = 0;
      if (Math.abs(s.kbVy) < 4) s.kbVy = 0;
    }

    const dx = player.x - s.x, dy = player.y - s.y;
    const dist = Math.hypot(dx, dy);
    if (dx !== 0) s.facing = dx > 0 ? 1 : -1;

    if (s.state === "idle") {
      // Home noktasında sabit bekler, sadece idle animasyonu oynar.
      if (dist < s.aggroRange) {
        s.state = "chase";
      }
    } else if (s.state === "chase") {
      // [BATAKLIK ZEKÂSI] Demon — GÖLGE ADIMI: birkaç saniyede bir gölgeye
      // karışıp oyuncunun YANINA yırtılarak belirir (düz kovalamaz, sinsi
      // yaklaşır). İniş noktası engele denk gelirse o tur vazgeçer.
      if (SOLDIER_SKIN) {
        if (s.blinkT === undefined) s.blinkT = 2 + Math.random() * 3;
        s.blinkT -= dt;
        if (s.blinkT <= 0) {
          s.blinkT = 4 + Math.random() * 2.5;
          if (dist > 130 && dist < 320) {
            const n2 = dist || 1, side = Math.random() < 0.5 ? 1 : -1;
            const jump = Math.min(110, dist - 60);
            let nx2 = s.x + (dx / n2) * jump - (dy / n2) * side * 40;
            let ny2 = s.y + (dy / n2) * jump + (dx / n2) * side * 40;
            nx2 = Math.max(30, Math.min(WORLD_W - 30, nx2));
            ny2 = Math.max(30, Math.min(WORLD_H - 30, ny2));
            let blocked = false;
            for (const ob of obstacles) {
              if (Math.hypot(nx2 - ob.x, ny2 - ob.y) < ob.r + s.r + 6) { blocked = true; break; }
            }
            if (!blocked) {
              if (typeof spawnPoofAt === "function") spawnPoofAt(s.x, s.y); // kaybolma dumanı
              s.x = nx2; s.y = ny2;
              if (typeof spawnPoofAt === "function") spawnPoofAt(s.x, s.y); // beliriş dumanı
            }
          }
        }
      }
      if (dist > s.aggroRange * 1.5) {
        // Oyuncu çok uzaklaştı, pes edip eve dön
        s.state = "idle";
      } else if (dist <= s.attackRange) {
        s.state = "attack";
        s.stateT = 0;
        s.hasHitThisAttack = false;
      } else {
        const tdist = dist || 1;
        s.x += (dx / tdist) * s.walkSpeed * dt;
        s.y += (dy / tdist) * s.walkSpeed * dt;
      }
    } else if (s.state === "attack") {
      s.stateT += dt;
      const frame = Math.min(SOLDIER_FRAMES_ATTACK - 1, Math.floor((s.stateT / SOLDIER_ATTACK_TOTAL) * SOLDIER_FRAMES_ATTACK));
      // Kılıç vuruşu — animasyonun belirli karesinde, sadece bir kez uygulanır.
      if (!s.hasHitThisAttack && frame >= SOLDIER_ATTACK_HIT_FRAME) {
        s.hasHitThisAttack = true;
        const hitDist = Math.hypot(player.x - s.x, player.y - s.y);
        if (hitDist < s.attackRange + 22 && player.invulnT <= 0) {
          const dmgHit = Math.round(11 * MOB_DMG_MULT); // [DENGE] biyom hasar çarpanı
          player.hp = Math.max(0, player.hp - dmgHit);
          player.invulnT = 0.6;
          triggerShake(5, 0.18);
          spawnFloatingText(player.x, player.y - player.r - 6, "-" + dmgHit, "#ff5c6c");
          const kx = (player.x - s.x) / (hitDist || 1), ky = (player.y - s.y) / (hitDist || 1);
          player.knockVx = kx * 200; player.knockVy = ky * 200;
          hpLabelEl.textContent = player.hp;
        }
      }
      if (s.stateT >= SOLDIER_ATTACK_TOTAL) {
        s.state = "cooldown";
        s.stateT = 0;
      }
    } else if (s.state === "cooldown") {
      s.stateT += dt;
      if (s.stateT >= SOLDIER_ATTACK_COOLDOWN) {
        s.state = dist <= s.attackRange ? "attack" : "chase";
        s.stateT = 0;
        s.hasHitThisAttack = false;
        if (dist > s.aggroRange * 1.5) s.state = "idle";
      }
    }

    s.x = Math.max(s.r, Math.min(WORLD_W - s.r, s.x));
    s.y = Math.max(s.r, Math.min(WORLD_H - s.r, s.y));

    // ---- Oyuncunun saldırısına yakalanma (diğer düşmanlarla aynı isabet testi) ----
    if (player.attacking && player.attackT < 0.14) {
      const dirVec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.facing];
      const toX = s.x - player.x, toY = s.y - player.y;
      const toDist = Math.hypot(toX, toY);
      const attackRangeP = player.r + 30 + s.r;
      if (toDist < attackRangeP && !s.justHit) {
        const angleTo = Math.atan2(toY, toX);
        const facingAngle = (typeof player.aimAngle === "number") ? player.aimAngle : Math.atan2(dirVec[1], dirVec[0]); // [DIKEY] oto-hedef acisi
        let diff = Math.abs(angleTo - facingAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < PLAYER_ARC_HALF) { // [DIKEY] daraltilmis cleave acisi
          s.justHit = true;
          const hit = rollPlayerHit(9); // %15 kritik şansı, kritikte 2x (05-effects)
          s.hp -= hit.dmg;
          s.hitFlashT = 0.15;
          s.hurtT = 0.3;
          hitJuice(s, hit, "rgba(200,60,60,0.9)");
          if (s.hp <= 0 && !s.dead) {
            s.dead = true;
            s.deathT = 0;
            // Toz kazanımı KALDIRILDI — hesaba işlenmiyordu, harita ekonomisi
            // sadeleştirildi (gerçek damlalar: maybeDropItem içinde).
            maybeDropItem(s.x, s.y, "soldier");
            deathJuice(s, "rgba(200,60,60,0.85)", 16);
          }
        }
      }
    }
    if (!player.attacking) s.justHit = false;
  }
}

function drawSoldiers() {
  for (const s of soldiers) {
    const sx = s.x - camera.x, sy = s.y - camera.y;
    const cullM = SOLDIER_DISPLAY / 2 + 20;
    if (sx < -cullM || sx > VIEW_W + cullM || sy < -cullM || sy > VIEW_H + cullM) continue;

    let row, frame, alpha = 1;

    if (s.dead) {
      const deathAnimDur = SOLDIER_FRAMES_DEATH * 0.125; // 0.5s
      row = SOLDIER_ROW_DEATH;
      if (s.deathT <= deathAnimDur) {
        frame = Math.min(SOLDIER_FRAMES_DEATH - 1, Math.floor((s.deathT / deathAnimDur) * SOLDIER_FRAMES_DEATH));
        alpha = 1;
      } else {
        frame = SOLDIER_FRAMES_DEATH - 1;
        alpha = Math.max(0, 1 - (s.deathT - deathAnimDur) / 0.4);
      }
      if (alpha <= 0) continue;
    } else if (s.hurtT > 0) {
      row = SOLDIER_ROW_HURT;
      frame = Math.min(SOLDIER_FRAMES_HURT - 1, Math.floor((0.3 - s.hurtT) / (0.3 / SOLDIER_FRAMES_HURT)));
    } else if (s.state === "attack") {
      row = SOLDIER_ROW_ATTACK;
      frame = Math.min(SOLDIER_FRAMES_ATTACK - 1, Math.floor((s.stateT / SOLDIER_ATTACK_TOTAL) * SOLDIER_FRAMES_ATTACK));
    } else if (s.state === "chase") {
      row = SOLDIER_ROW_WALK;
      frame = Math.floor(s.animT * 10) % SOLDIER_FRAMES_WALK;
    } else {
      row = SOLDIER_ROW_IDLE;
      frame = Math.floor(s.animT * 6) % SOLDIER_FRAMES_IDLE;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy);
    ctx.scale(s.facing, 1);

    if (soldierImgReady) {
      if (s.hitFlashT > 0) {
        // 1) Kareyi izole ara canvas'a çiz, 2) beyazı SADECE sprite
        // piksellerine bindir (source-atop burada güvenli çünkü canvas'ta
        // başka içerik yok), 3) sonucu ana ekrana bas.
        soldierFxCtx.clearRect(0, 0, SOLDIER_FRAME, SOLDIER_FRAME);
        soldierFxCtx.drawImage(soldierImg, frame * SOLDIER_FRAME, row * SOLDIER_FRAME, SOLDIER_FRAME, SOLDIER_FRAME,
          0, 0, SOLDIER_FRAME, SOLDIER_FRAME);
        soldierFxCtx.globalCompositeOperation = "source-atop";
        soldierFxCtx.fillStyle = "rgba(255,255,255,0.75)";
        soldierFxCtx.fillRect(0, 0, SOLDIER_FRAME, SOLDIER_FRAME);
        soldierFxCtx.globalCompositeOperation = "source-over";
        ctx.drawImage(soldierFxCanvas,
          -SOLDIER_DISPLAY / 2, -SOLDIER_DISPLAY / 2, SOLDIER_DISPLAY, SOLDIER_DISPLAY);
      } else {
        ctx.drawImage(soldierImg, frame * SOLDIER_FRAME, row * SOLDIER_FRAME, SOLDIER_FRAME, SOLDIER_FRAME,
          -SOLDIER_DISPLAY / 2, -SOLDIER_DISPLAY / 2, SOLDIER_DISPLAY, SOLDIER_DISPLAY);
      }
    } else {
      // Görsel henüz yüklenmediyse eski placeholder çizime düş
      ctx.beginPath();
      ctx.arc(0, 0, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.hitFlashT > 0 ? "#ffffff" : "#7a8a99";
      ctx.fill();
    }
    ctx.restore();

    if (!s.dead && s.hp < s.maxHp) {
      const barW = 30, barH = 4;
      // Bar, KARENİN değil görünen asker gövdesinin (~37px) hemen üstünde dursun
      const bx = sx - barW / 2, by = sy - 30;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = "#e05a5a";
      ctx.fillRect(bx, by, barW * Math.max(0, s.hp / s.maxHp), barH);
    }
  }
}
