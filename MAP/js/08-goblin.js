// ============================================================
// GOBLIN — ŞARJ/HAMLE SALDIRISI, ÖNCEDEN BELLİ OLAN "TELEGRAPH" İLE
// Davranış ritmi aynı: hazırlan (telegraph) → şarj → toparlan (recover).
// YENİ: gerçek sprite entegrasyonu. Telegraph artık titreme değil,
// animasyonun kendisi — goblin meşalesini kaldırıyor (saldırı satırlarının
// ilk 3 karesi), şarj sırasında da ateşi savuruyor (son 3 kare). Saldırı
// yönüne göre 3 farklı satırdan biri seçiliyor (yana / öne / arkaya).
//
// ASSET: assets/enemies/goblin.png — 1344x960, 192x192'lik 5 satır x 7 sütun:
//   satır 0 = idle (meşale titremesi, 7 kare)
//   satır 1 = yürüyüş (6 kare)
//   satır 2 = saldırı YANA  (6 kare: 0-2 meşale kaldırma, 3-5 ateş savurma)
//   satır 3 = saldırı ÖNE   (aynı yapı)
//   satır 4 = saldırı ARKAYA(aynı yapı)
// Hasar/ölüm satırı YOK → vuruşta beyaz siluet flaşı, ölümde flaş+ezilme.
// ============================================================
// [BİYOM] Reskin: bataklıkta Dövüşçü Goblin sheet'i yüklenir. Farklı ızgaralı
// sheet'ler aynı iskelete otursun diye skin; HÜCRE boyutunu, SATIR düzenini ve
// KARE sayılarını kendisi getirir (00-core → BIOMES.swamp.skins.goblin).
var GOBLIN_SKIN = (typeof ACTIVE_BIOME !== "undefined" && ACTIVE_BIOME.skins && ACTIVE_BIOME.skins.goblin) || null;
const GOBLIN_CELL = GOBLIN_SKIN && GOBLIN_SKIN.cell ? GOBLIN_SKIN.cell : 192; // sprite karesinin px boyutu
// Karakter gövdesi 192'lik karenin içinde ~75-80px — kare büyük çizilir ki
// goblin ekranda "iri" (slime/askerden büyük, r=24'e uygun) görünsün.
const GOBLIN_DISPLAY = GOBLIN_SKIN && GOBLIN_SKIN.display ? GOBLIN_SKIN.display : 115; // görünen gövde ~47px (skin kendi boyunu getirebilir)
const GOBLIN_ROW_IDLE = GOBLIN_SKIN && GOBLIN_SKIN.rowIdle !== undefined ? GOBLIN_SKIN.rowIdle : 0,
      GOBLIN_ROW_WALK = GOBLIN_SKIN && GOBLIN_SKIN.rowWalk !== undefined ? GOBLIN_SKIN.rowWalk : 1;
const GOBLIN_ROW_ATK_SIDE = GOBLIN_SKIN && GOBLIN_SKIN.rowAtkSide !== undefined ? GOBLIN_SKIN.rowAtkSide : 2,
      GOBLIN_ROW_ATK_FRONT = GOBLIN_SKIN && GOBLIN_SKIN.rowAtkFront !== undefined ? GOBLIN_SKIN.rowAtkFront : 3,
      GOBLIN_ROW_ATK_BACK = GOBLIN_SKIN && GOBLIN_SKIN.rowAtkBack !== undefined ? GOBLIN_SKIN.rowAtkBack : 4;
const GOBLIN_FRAMES_IDLE = GOBLIN_SKIN && GOBLIN_SKIN.framesIdle ? GOBLIN_SKIN.framesIdle : 7,
      GOBLIN_FRAMES_WALK = GOBLIN_SKIN && GOBLIN_SKIN.framesWalk ? GOBLIN_SKIN.framesWalk : 6,
      GOBLIN_FRAMES_ATK = GOBLIN_SKIN && GOBLIN_SKIN.framesAtk ? GOBLIN_SKIN.framesAtk : 6;

if (typeof goblinImg === "undefined") {
  var goblinImg = new Image();
  var goblinImgReady = false;
  goblinImg.onload = () => { goblinImgReady = true; };
  goblinImg.src = GOBLIN_SKIN ? GOBLIN_SKIN.src : "assets/enemies/goblin.png"; // [BİYOM]
}

// Vuruş flaşı için izole ara canvas (askerdeki teknikle aynı — beyaz sadece
// sprite siluetine oturur, ana canvas'ta yapılsa etrafında beyaz KARE çıkar).
const goblinFxCanvas = document.createElement("canvas");
goblinFxCanvas.width = GOBLIN_CELL;
goblinFxCanvas.height = GOBLIN_CELL;
const goblinFxCtx = goblinFxCanvas.getContext("2d");

const GOBLIN_CONTACT_COOLDOWN = 0.9;
const GOBLIN_TELEGRAPH_DUR = 0.55;
const GOBLIN_CHARGE_DUR = 0.4;
const GOBLIN_RECOVER_DUR = 0.7;
function makeGoblin(x, y) {
  return {
    type: "goblin",
    x, y,
    r: 24,
    hp: Math.round(50 * MOB_HP_MULT), maxHp: Math.round(50 * MOB_HP_MULT), // [DENGE] biyom can çarpanı
    walkSpeed: 55,
    chargeSpeed: 300,
    aggroRange: 220,   // bu menzile girince fark eder ve yaklaşmaya başlar
    chargeRange: 150,  // bu menzile girince telegrafa/şarja hazırlanır
    state: "walk",      // "walk" | "telegraph" | "charge" | "recover"
    stateT: 0,
    chargeDirX: 0, chargeDirY: 0,
    facing: 1,          // 1 = sağa, -1 = sola (yana bakan sprite'lar için ayna)
    wanderAngle: Math.random() * Math.PI * 2,
    wanderT: Math.random() * 2,
    animT: 0,           // idle/walk döngü animasyonu
    contactCooldown: 0,
    hitFlashT: 0,
    squish: 0,
    justHit: false,
    dead: false,
    deathT: 0,
  };
}
let goblins = [];

function updateGoblins(dt) {
  for (const g of goblins) {
    if (g.dead) { g.deathT += dt; continue; }
    if (g.contactCooldown > 0) g.contactCooldown -= dt;
    if (g.hitFlashT > 0) g.hitFlashT -= dt;
    g.squish = Math.max(0, g.squish - dt * 4);
    g.animT += dt;

    // Vuruş geri tepmesi (hitJuice yazar): hızla sönümlenen itiş.
    // Şarj sırasında da uygulanır — iyi zamanlanmış vuruş goblini yolundan saptırır.
    if (g.kbVx || g.kbVy) {
      g.x += g.kbVx * dt; g.y += g.kbVy * dt;
      g.kbVx *= Math.max(0, 1 - dt * 10);
      g.kbVy *= Math.max(0, 1 - dt * 10);
      if (Math.abs(g.kbVx) < 4) g.kbVx = 0;
      if (Math.abs(g.kbVy) < 4) g.kbVy = 0;
    }

    const dx = player.x - g.x, dy = player.y - g.y;
    const dist = Math.hypot(dx, dy);

    if (g.state === "walk") {
      if (dist < g.aggroRange) {
        if (dist < g.chargeRange) {
          // Hazır: telegrafa (hazırlık evresine) geç
          g.state = "telegraph";
          g.stateT = 0;
          g.chargeDirX = dx / (dist || 1);
          g.chargeDirY = dy / (dist || 1);
          if (g.chargeDirX !== 0) g.facing = g.chargeDirX > 0 ? 1 : -1;
        } else {
          const nx = dx / (dist || 1), ny = dy / (dist || 1);
          // [BATAKLIK ZEKÂSI] Pawn — SÜRÜ İÇGÜDÜSÜ: işçiler yalnız avlanmaz.
          // En yakın yoldaşına hafifçe sokulur; yanında yoldaş varken (220px)
          // CESARETLENİR: %18 hızlanır ve şarj hazırlığı kısalır (telegraph).
          let spdG = g.walkSpeed;
          if (GOBLIN_SKIN) {
            let mate = null, md = 1e9;
            for (const og of goblins) {
              if (og === g || og.dead) continue;
              const dd = Math.hypot(og.x - g.x, og.y - g.y);
              if (dd < md) { md = dd; mate = og; }
            }
            g.packBrave = !!(mate && md < 220);
            if (g.packBrave) spdG *= 1.18;
            if (mate && md > 80 && md < 420) {
              g.x += ((mate.x - g.x) / md) * 30 * dt;
              g.y += ((mate.y - g.y) / md) * 30 * dt;
            }
          }
          g.x += nx * spdG * dt;
          g.y += ny * spdG * dt;
          if (nx !== 0) g.facing = nx > 0 ? 1 : -1;
        }
      } else {
        g.wanderT -= dt;
        if (g.wanderT <= 0) {
          g.wanderAngle = Math.random() * Math.PI * 2;
          g.wanderT = 1.8 + Math.random() * 1.6;
        }
        const wx = Math.cos(g.wanderAngle);
        g.x += wx * (g.walkSpeed * 0.4) * dt;
        g.y += Math.sin(g.wanderAngle) * (g.walkSpeed * 0.4) * dt;
        if (Math.abs(wx) > 0.2) g.facing = wx > 0 ? 1 : -1;
      }
    } else if (g.state === "telegraph") {
      g.stateT += dt;
      // Telegraf sırasında yerinde durur — meşaleyi kaldırma animasyonu oynar
      // [BATAKLIK ZEKÂSI] Cesaretli pawn şarja daha çabuk kalkar
      if (g.stateT >= (GOBLIN_SKIN && g.packBrave ? GOBLIN_TELEGRAPH_DUR * 0.72 : GOBLIN_TELEGRAPH_DUR)) {
        g.state = "charge";
        g.stateT = 0;
      }
    } else if (g.state === "charge") {
      g.stateT += dt;
      g.x += g.chargeDirX * g.chargeSpeed * dt;
      g.y += g.chargeDirY * g.chargeSpeed * dt;
      if (g.stateT >= GOBLIN_CHARGE_DUR) {
        g.state = "recover";
        g.stateT = 0;
      }
    } else if (g.state === "recover") {
      g.stateT += dt;
      // Toparlanma sırasında hareketsiz ve savunmasız kalır (ileride: bu
      // evrede alınan hasar artırılabilir — "punish window" için yer tutucu)
      if (g.stateT >= GOBLIN_RECOVER_DUR) {
        g.state = "walk";
      }
    }

    g.x = Math.max(g.r, Math.min(WORLD_W - g.r, g.x));
    g.y = Math.max(g.r, Math.min(WORLD_H - g.r, g.y));

    // ---- Şarj (gerçek saldırı) hasarı — SADECE g.state === "charge" iken.
    // Önceden bu blok her state'te (walk/telegraph/recover) çalışıyordu, yani
    // goblin sana yürürken bile değse hasar veriyordu. Artık sadece ateşle
    // üstüne geldiği o kısa şarj anında temas edersen hasar alıyorsun.
    if (g.state === "charge") {
      const cdx = player.x - g.x, cdy = player.y - g.y;
      const cdist = Math.hypot(cdx, cdy);
      if (cdist < g.r + player.r && g.contactCooldown <= 0 && player.invulnT <= 0) {
        const dmg = Math.round(14 * MOB_DMG_MULT); // [DENGE] biyom hasar çarpanı
        player.hp = Math.max(0, player.hp - dmg);
        player.invulnT = 0.6;
        g.contactCooldown = GOBLIN_CONTACT_COOLDOWN;
        triggerShake(9, 0.25);
        spawnFloatingText(player.x, player.y - player.r - 6, "-" + dmg, "#ff5c6c");
        const kx = cdx / (cdist || 1), ky = cdy / (cdist || 1);
        player.knockVx = -kx * 420; player.knockVy = -ky * 420;
        hpLabelEl.textContent = player.hp;
        // Oyuncuya çarparsa bir duvara çarpmış gibi hemen toparlanma
        // evresine geçer (yoksa şarjı bitirene kadar üstüne binebilir).
        g.state = "recover"; g.stateT = 0;
      }
    }

    // ---- Oyuncunun saldırısına yakalanma (aynı isabet testi) ----
    if (player.attacking && player.attackT < 0.14) {
      const dirVec = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.facing];
      const toX = g.x - player.x, toY = g.y - player.y;
      const toDist = Math.hypot(toX, toY);
      const attackRange = player.r + 30 + g.r;
      if (toDist < attackRange && !g.justHit) {
        const angleTo = Math.atan2(toY, toX);
        const facingAngle = (typeof player.aimAngle === "number") ? player.aimAngle : Math.atan2(dirVec[1], dirVec[0]); // [DIKEY] oto-hedef acisi
        let diff = Math.abs(angleTo - facingAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < PLAYER_ARC_HALF) { // [DIKEY] daraltilmis cleave acisi
          g.justHit = true;
          const hit = rollPlayerHit(14); // %15 kritik şansı, kritikte 2x (05-effects)
          g.hp -= hit.dmg;
          g.hitFlashT = 0.15;
          g.squish = 1;
          hitJuice(g, hit, "rgba(200,160,90,0.9)");
          if (g.hp <= 0 && !g.dead) {
            g.dead = true;
            g.deathT = 0;
            // Toz kazanımı KALDIRILDI — hesaba işlenmiyordu, harita ekonomisi
            // sadeleştirildi (gerçek damlalar: maybeDropItem içinde).
            maybeDropItem(g.x, g.y, "goblin");
            deathJuice(g, "rgba(200,160,90,0.85)", 20); // en iri düşman → en büyük patlama
          }
        }
      }
    }
    if (!player.attacking) g.justHit = false;
  }
}

// Saldırı (telegraph+charge) yönüne göre doğru sprite satırını seç:
// çoğunlukla yatay → YANA satırı (sola gidiyorsa aynalanır),
// aşağı doğru → ÖNE, yukarı doğru → ARKAYA.
function goblinAttackRow(g) {
  if (Math.abs(g.chargeDirX) >= Math.abs(g.chargeDirY)) return GOBLIN_ROW_ATK_SIDE;
  return g.chargeDirY > 0 ? GOBLIN_ROW_ATK_FRONT : GOBLIN_ROW_ATK_BACK;
}

function drawGoblins() {
  for (const g of goblins) {
    const sx = g.x - camera.x, sy = g.y - camera.y;
    const cullM = GOBLIN_DISPLAY / 2 + 20;
    if (sx < -cullM || sx > VIEW_W + cullM || sy < -cullM || sy > VIEW_H + cullM) continue;

    // ---- ÖLÜM: hasar/ölüm satırı olmadığı için beyaz flaş + ezilerek sönme ----
    if (g.dead) {
      const t = Math.min(1, g.deathT / 0.35);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.translate(sx, sy);
      ctx.scale((1 + t * 0.4) * g.facing, 1 - t * 0.8);
      if (goblinImgReady) {
        // ilk 0.1 sn beyaz siluet, sonrası normal sprite (idle karesi) sönerek
        if (g.deathT < 0.1) {
          goblinFxCtx.clearRect(0, 0, GOBLIN_CELL, GOBLIN_CELL);
          goblinFxCtx.drawImage(goblinImg, 0, GOBLIN_ROW_IDLE * GOBLIN_CELL, GOBLIN_CELL, GOBLIN_CELL, 0, 0, GOBLIN_CELL, GOBLIN_CELL);
          goblinFxCtx.globalCompositeOperation = "source-atop";
          goblinFxCtx.fillStyle = "rgba(255,255,255,0.85)";
          goblinFxCtx.fillRect(0, 0, GOBLIN_CELL, GOBLIN_CELL);
          goblinFxCtx.globalCompositeOperation = "source-over";
          ctx.drawImage(goblinFxCanvas, -GOBLIN_DISPLAY / 2, -GOBLIN_DISPLAY / 2, GOBLIN_DISPLAY, GOBLIN_DISPLAY);
        } else {
          ctx.drawImage(goblinImg, 0, GOBLIN_ROW_IDLE * GOBLIN_CELL, GOBLIN_CELL, GOBLIN_CELL,
            -GOBLIN_DISPLAY / 2, -GOBLIN_DISPLAY / 2, GOBLIN_DISPLAY, GOBLIN_DISPLAY);
        }
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, g.r, 0, Math.PI * 2);
        ctx.fillStyle = "#7a5a2e";
        ctx.fill();
      }
      ctx.restore();
      continue;
    }

    // gölge
    ctx.beginPath();
    ctx.ellipse(sx, sy + g.r * 0.7, g.r * 0.85, g.r * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    // ---- Kare seçimi (state'e göre satır + kare) ----
    let row, frame, flipX = g.facing;
    if (g.state === "telegraph") {
      // meşaleyi kaldırma: saldırı satırının İLK 3 karesi, telegraph süresine yayılmış
      row = goblinAttackRow(g);
      frame = Math.min(2, Math.floor((g.stateT / GOBLIN_TELEGRAPH_DUR) * 3));
      if (row !== GOBLIN_ROW_ATK_SIDE) flipX = 1; // ön/arka satırları aynalanmaz
    } else if (g.state === "charge") {
      // ateşi savurma: saldırı satırının SON 3 karesi, şarj süresine yayılmış
      row = goblinAttackRow(g);
      frame = 3 + Math.min(2, Math.floor((g.stateT / GOBLIN_CHARGE_DUR) * 3));
      if (row !== GOBLIN_ROW_ATK_SIDE) flipX = 1;
    } else if (g.state === "recover") {
      // savunmasız duruş: idle'ın ilk karesi, sabit (yorgun/donuk his)
      row = GOBLIN_ROW_IDLE;
      frame = 0;
    } else {
      // walk state: gerçekten yürüyorsa yürüme, wander'da yavaşsa da yürüme
      // (aggro dışı wander da bir yürüyüş), animasyon hızı sabit
      row = GOBLIN_ROW_WALK;
      frame = Math.floor(g.animT * 8) % GOBLIN_FRAMES_WALK;
    }

    const squishAmt = g.squish * 0.25;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(flipX * (1 + squishAmt), 1 - squishAmt);

    if (goblinImgReady) {
      if (g.hitFlashT > 0) {
        goblinFxCtx.clearRect(0, 0, GOBLIN_CELL, GOBLIN_CELL);
        goblinFxCtx.drawImage(goblinImg, frame * GOBLIN_CELL, row * GOBLIN_CELL, GOBLIN_CELL, GOBLIN_CELL, 0, 0, GOBLIN_CELL, GOBLIN_CELL);
        goblinFxCtx.globalCompositeOperation = "source-atop";
        goblinFxCtx.fillStyle = "rgba(255,255,255,0.75)";
        goblinFxCtx.fillRect(0, 0, GOBLIN_CELL, GOBLIN_CELL);
        goblinFxCtx.globalCompositeOperation = "source-over";
        ctx.drawImage(goblinFxCanvas, -GOBLIN_DISPLAY / 2, -GOBLIN_DISPLAY / 2, GOBLIN_DISPLAY, GOBLIN_DISPLAY);
      } else {
        ctx.drawImage(goblinImg, frame * GOBLIN_CELL, row * GOBLIN_CELL, GOBLIN_CELL, GOBLIN_CELL,
          -GOBLIN_DISPLAY / 2, -GOBLIN_DISPLAY / 2, GOBLIN_DISPLAY, GOBLIN_DISPLAY);
      }
    } else {
      // Görsel yüklenmediyse eski placeholder daireye düş
      ctx.beginPath();
      ctx.arc(0, 0, g.r, 0, Math.PI * 2);
      let fillColor = "#7a9b4a";
      if (g.hitFlashT > 0) fillColor = "#ffffff";
      else if (g.state === "telegraph") fillColor = "#ffcc4d";
      else if (g.state === "charge") fillColor = "#ff8a4d";
      else if (g.state === "recover") fillColor = "#5c7a3a";
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    ctx.restore();

    // telegraph halkası KORUNDU: animasyon tek başına yeterince okunmayabilir,
    // sarı halka "saldırı geliyor" uyarısını netleştirir (istersen kaldırırız)
    if (g.state === "telegraph") {
      const ringT = g.stateT / GOBLIN_TELEGRAPH_DUR;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = "#ffcc4d";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, g.r + 6 + ringT * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (g.hp < g.maxHp) {
      const barW = 40, barH = 5;
      // bar görünen gövdenin (~47px) hemen üstünde
      const bx = sx - barW / 2, by = sy - 34;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = "#c9924d";
      ctx.fillRect(bx, by, barW * Math.max(0, g.hp / g.maxHp), barH);
    }
  }
}
