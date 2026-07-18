// ============================================================
// ORC — YILMAZ KOVALAYICI, SERİ BALTA VURUŞLARI (slime'ın yerine geçti)
// Rolü slime ile aynı: "temel" düşman. Ama karakteri farklı — orc oyuncuyu
// fark edince KOVALAMAYI BIRAKMAZ ve menzile girince ileri sıçrayarak hızlı
// ama zayıf balta vuruşları yapar. Asker ile karşılaştırma:
//   asker → mesafe tutar, durur, YAVAŞ ve AĞIR vurur (12 hasar)
//   orc   → sürekli baskı yapar, SERİ ve HAFİF vurur (8 hasar)
// İki saldırı animasyonu sırayla kullanılır (kombo hissi).
//
// ASSET: assets/enemies/orc.png — 800x600, 100x100'lük 6 satır x 8 sütun:
//   satır 0 = idle       (6 kare)
//   satır 1 = yürüyüş    (8 kare)
//   satır 2 = saldırı 1  (6 kare)
//   satır 3 = saldırı 2  (6 kare)
//   satır 4 = hasar alma (4 kare)
//   satır 5 = ölüm       (4 kare)
// ============================================================
const ORC_FRAME = 100;
// Gövde 100'lük karede ~22px — kare büyük çizilir ki orc normal boyutta görünsün.
const ORC_DISPLAY = 210;        // görünen gövde ~46px genişlik (slime r=22 ile uyumlu)
const ORC_ROW_IDLE = 0, ORC_ROW_WALK = 1, ORC_ROW_ATK1 = 2, ORC_ROW_ATK2 = 3, ORC_ROW_HURT = 4, ORC_ROW_DEATH = 5;
const ORC_FRAMES_IDLE = 6, ORC_FRAMES_WALK = 8, ORC_FRAMES_ATK = 6, ORC_FRAMES_HURT = 4, ORC_FRAMES_DEATH = 4;

if (typeof orcImg === "undefined") {
  var orcImg = new Image();
  var orcImgReady = false;
  orcImg.onload = () => { orcImgReady = true; };
  orcImg.src = "assets/enemies/orc.png";
}

// Vuruş flaşı için izole ara canvas (beyaz sadece siluete oturur,
// ana canvas'ta yapılsa etrafında beyaz KARE çıkar — bilinen hata).
const orcFxCanvas = document.createElement("canvas");
orcFxCanvas.width = ORC_FRAME;
orcFxCanvas.height = ORC_FRAME;
const orcFxCtx = orcFxCanvas.getContext("2d");

const ORC_ATTACK_TOTAL = 0.45;     // saldırı animasyonunun toplam süresi (askerden hızlı)
const ORC_ATTACK_HIT_FRAME = 3;    // baltanın vurduğu kare (0-indeksli)
const ORC_ATTACK_COOLDOWN = 0.4;   // vuruşlar arası kısa nefes (asker: 0.7 — orc daha seri)
const ORC_LUNGE_SPEED = 120;       // saldırı sırasında ileri sıçrama hızı (baskı hissi)

function makeOrc(x, y) {
  return {
    type: "orc",
    x, y,
    r: 22,
    hp: 33, maxHp: 33,
    walkSpeed: 78,       // slime'dan (70) birazcık hızlı — "yılmaz" hissi
    aggroRange: 190,
    attackRange: 48,
    state: "wander",     // "wander" | "chase" | "attack" | "cooldown"
    stateT: 0,
    facing: 1,
    attackVariant: 0,    // 0/1 — iki saldırı animasyonu sırayla (kombo hissi)
    hasHitThisAttack: false,
    wanderAngle: Math.random() * Math.PI * 2,
    wanderT: Math.random() * 2,
    animT: 0,
    hurtT: 0,
    hitFlashT: 0,
    justHit: false,
    dead: false,
    deathT: 0,
  };
}
let orcs = [];

function updateOrcs(dt) {
  for (const o of orcs) {
    if (o.dead) { o.deathT += dt; continue; }
    if (o.hitFlashT > 0) o.hitFlashT -= dt;
    if (o.hurtT > 0) o.hurtT -= dt;
    o.animT += dt;

    const dx = player.x - o.x, dy = player.y - o.y;
    const dist = Math.hypot(dx, dy);

    if (o.state === "wander") {
      // Amaçsız dolanma (slime'ın wander'ı korundu)
      o.wanderT -= dt;
      if (o.wanderT <= 0) {
        o.wanderAngle = Math.random() * Math.PI * 2;
        o.wanderT = 1.5 + Math.random() * 1.5;
      }
      const wx = Math.cos(o.wanderAngle);
      o.x += wx * (o.walkSpeed * 0.35) * dt;
      o.y += Math.sin(o.wanderAngle) * (o.walkSpeed * 0.35) * dt;
      if (Math.abs(wx) > 0.2) o.facing = wx > 0 ? 1 : -1;
      if (dist < o.aggroRange) o.state = "chase";
    } else if (o.state === "chase") {
      // YILMAZ: bir kez fark etti mi menzil ne olursa olsun peşini bırakmaz.
      // (Temel düşman zaten yavaş — kaçmak hâlâ mümkün ama rahat bırakmıyor.)
      if (dist <= o.attackRange) {
        o.state = "attack";
        o.stateT = 0;
        o.hasHitThisAttack = false;
        o.attackVariant = 1 - o.attackVariant; // her saldırıda animasyon değişsin
      } else {
        const n = dist || 1;
        o.x += (dx / n) * o.walkSpeed * dt;
        o.y += (dy / n) * o.walkSpeed * dt;
        if (dx !== 0) o.facing = dx > 0 ? 1 : -1;
      }
    } else if (o.state === "attack") {
      o.stateT += dt;
      // Saldırı sırasında oyuncuya doğru hafif İLERİ SIÇRAMA — kaçarak
      // vuruş iptal ettirmek zorlaşır, "üstüne geliyor" baskısı oluşur.
      if (o.stateT < ORC_ATTACK_TOTAL * 0.6 && dist > 10) {
        const n = dist || 1;
        o.x += (dx / n) * ORC_LUNGE_SPEED * dt;
        o.y += (dy / n) * ORC_LUNGE_SPEED * dt;
      }
      const frame = Math.min(ORC_FRAMES_ATK - 1, Math.floor((o.stateT / ORC_ATTACK_TOTAL) * ORC_FRAMES_ATK));
      if (!o.hasHitThisAttack && frame >= ORC_ATTACK_HIT_FRAME) {
        o.hasHitThisAttack = true;
        const hitDist = Math.hypot(player.x - o.x, player.y - o.y);
        if (hitDist < o.attackRange + 20 && player.invulnT <= 0) {
          player.hp = Math.max(0, player.hp - 7);
          player.invulnT = 0.6;
          triggerShake(4, 0.15);
          spawnFloatingText(player.x, player.y - player.r - 6, "-7", "#ff5c6c");
          const kx = (player.x - o.x) / (hitDist || 1), ky = (player.y - o.y) / (hitDist || 1);
          player.knockVx = kx * 180; player.knockVy = ky * 180;
          hpLabelEl.textContent = player.hp;
        }
      }
      if (o.stateT >= ORC_ATTACK_TOTAL) {
        o.state = "cooldown";
        o.stateT = 0;
      }
    } else if (o.state === "cooldown") {
      o.stateT += dt;
      if (o.stateT >= ORC_ATTACK_COOLDOWN) {
        o.state = "chase";
        o.stateT = 0;
      }
    }

    o.x = Math.max(o.r, Math.min(WORLD_W - o.r, o.x));
    o.y = Math.max(o.r, Math.min(WORLD_H - o.r, o.y));

    // ---- Oyuncunun saldırısına yakalanma (diğer düşmanlarla aynı isabet testi) ----
    if (player.attacking && player.attackT < 0.14) {
      const dirVec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.facing];
      const toX = o.x - player.x, toY = o.y - player.y;
      const toDist = Math.hypot(toX, toY);
      const attackRangeP = player.r + 30 + o.r;
      if (toDist < attackRangeP && !o.justHit) {
        const angleTo = Math.atan2(toY, toX);
        const facingAngle = Math.atan2(dirVec[1], dirVec[0]);
        let diff = Math.abs(angleTo - facingAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < (100 * Math.PI / 180) / 2) {
          o.justHit = true;
          const dmg = 12;
          o.hp -= dmg;
          o.hitFlashT = 0.15;
          o.hurtT = 0.28;
          spawnFloatingText(o.x, o.y - o.r - 4, "-" + dmg, "#fff");
          triggerShake(4, 0.1);
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            spawnParticle(o.x, o.y, {
              vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
              life: 0.3, size: Math.random() * 2 + 1.5, color: "rgba(140,170,90,0.9)"
            });
          }
          if (o.hp <= 0 && !o.dead) {
            o.dead = true;
            o.deathT = 0;
            // Toz kazanımı KALDIRILDI — hesaba işlenmiyordu, harita ekonomisi
            // sadeleştirildi (gerçek damlalar: maybeDropItem içinde).
            maybeDropItem(o.x, o.y);
            for (let i = 0; i < 16; i++) {
              const a = Math.random() * Math.PI * 2;
              const speed = 60 + Math.random() * 100;
              spawnParticle(o.x, o.y, {
                vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
                life: 0.5, size: Math.random() * 3 + 1.5, color: "rgba(140,170,90,0.85)"
              });
            }
          }
        }
      }
    }
    if (!player.attacking) o.justHit = false;
  }
}

function drawOrcs() {
  for (const o of orcs) {
    const sx = o.x - camera.x, sy = o.y - camera.y;
    const cullM = ORC_DISPLAY / 2 + 20;
    if (sx < -cullM || sx > canvas.width + cullM || sy < -cullM || sy > canvas.height + cullM) continue;

    let row, frame, alpha = 1;

    if (o.dead) {
      const deathAnimDur = ORC_FRAMES_DEATH * 0.125; // 0.5s
      row = ORC_ROW_DEATH;
      if (o.deathT <= deathAnimDur) {
        frame = Math.min(ORC_FRAMES_DEATH - 1, Math.floor((o.deathT / deathAnimDur) * ORC_FRAMES_DEATH));
      } else {
        frame = ORC_FRAMES_DEATH - 1;
        alpha = Math.max(0, 1 - (o.deathT - deathAnimDur) / 0.4);
      }
      if (alpha <= 0) continue;
    } else if (o.hurtT > 0) {
      row = ORC_ROW_HURT;
      frame = Math.min(ORC_FRAMES_HURT - 1, Math.floor((0.28 - o.hurtT) / (0.28 / ORC_FRAMES_HURT)));
    } else if (o.state === "attack") {
      row = o.attackVariant === 0 ? ORC_ROW_ATK1 : ORC_ROW_ATK2;
      frame = Math.min(ORC_FRAMES_ATK - 1, Math.floor((o.stateT / ORC_ATTACK_TOTAL) * ORC_FRAMES_ATK));
    } else if (o.state === "chase") {
      row = ORC_ROW_WALK;
      frame = Math.floor(o.animT * 11) % ORC_FRAMES_WALK; // chase'te hızlı adım
    } else if (o.state === "wander") {
      row = ORC_ROW_WALK;
      frame = Math.floor(o.animT * 6) % ORC_FRAMES_WALK;  // wander'da ağır adım
    } else {
      row = ORC_ROW_IDLE;
      frame = Math.floor(o.animT * 6) % ORC_FRAMES_IDLE;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy);
    ctx.scale(o.facing, 1);

    if (orcImgReady) {
      if (o.hitFlashT > 0) {
        orcFxCtx.clearRect(0, 0, ORC_FRAME, ORC_FRAME);
        orcFxCtx.drawImage(orcImg, frame * ORC_FRAME, row * ORC_FRAME, ORC_FRAME, ORC_FRAME, 0, 0, ORC_FRAME, ORC_FRAME);
        orcFxCtx.globalCompositeOperation = "source-atop";
        orcFxCtx.fillStyle = "rgba(255,255,255,0.75)";
        orcFxCtx.fillRect(0, 0, ORC_FRAME, ORC_FRAME);
        orcFxCtx.globalCompositeOperation = "source-over";
        ctx.drawImage(orcFxCanvas, -ORC_DISPLAY / 2, -ORC_DISPLAY / 2, ORC_DISPLAY, ORC_DISPLAY);
      } else {
        ctx.drawImage(orcImg, frame * ORC_FRAME, row * ORC_FRAME, ORC_FRAME, ORC_FRAME,
          -ORC_DISPLAY / 2, -ORC_DISPLAY / 2, ORC_DISPLAY, ORC_DISPLAY);
      }
    } else {
      // Görsel yüklenmediyse placeholder daire (eski slime yeşili)
      ctx.beginPath();
      ctx.arc(0, 0, o.r, 0, Math.PI * 2);
      ctx.fillStyle = o.hitFlashT > 0 ? "#ffffff" : "#6b8f3f";
      ctx.fill();
    }
    ctx.restore();

    if (!o.dead && o.hp < o.maxHp) {
      const barW = 34, barH = 5;
      // bar görünen gövdenin hemen üstünde (kareye göre değil)
      const bx = sx - barW / 2, by = sy - 28;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = "#8fbf4d";
      ctx.fillRect(bx, by, barW * Math.max(0, o.hp / o.maxHp), barH);
    }
  }
}
