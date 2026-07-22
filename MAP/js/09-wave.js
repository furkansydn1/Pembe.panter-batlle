// ============================================================
// SÜREKLİ RESPAWN YÖNETİMİ (dalga sistemi emekli edildi)
// Eski davranış: tüm harita temizlenince "Harita Temizlendi" ekranı +
// toplu bekleme. Yeni davranış: her canavar, KENDİ ölümünden
// RESPAWN_DELAY saniye sonra tek başına, haritanın uygun bir noktasında
// yeniden doğar. Bekleme ekranı hiç açılmaz, oyun hiç durmaz —
// haritada her zaman canavar akışı vardır.
// Canavar dosyaları ölümde deathT sayacını zaten işletiyor (deathT += dt);
// burası o sayaca bakarak süresi dolan ölüyü taze bir canavarla değiştirir.
// ============================================================
const RESPAWN_DELAY = 10;     // saniye — her canavar ölümünden bu kadar sonra döner
const ENEMIES_PER_TYPE = 6;   // spawnNewWave hâlâ ilk kurulumda kullanılır
const SPAWN_MARGIN = 130;     // harita kenarına bu kadar yaklaşmasın
const MIN_SPAWN_DIST = 150;   // spawn noktaları birbirine bu mesafeden yakın olmasın

// Eski dalga sisteminden kalan bayrak: artık hiç "waiting"e geçmiyoruz,
// atMainScreen hep false kalıyor (04-economy'de tanımlı, oyun donmaz).
let waveState = "active";

// Rastgele bir nokta seçer; verilen noktalara MIN_SPAWN_DIST'ten yakınsa,
// bir engelin üstündeyse veya oyuncunun dibindeyse reddedip tekrar dener.
function pickSpawnPoint(existingPoints) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = SPAWN_MARGIN + Math.random() * (WORLD_W - SPAWN_MARGIN * 2);
    const y = SPAWN_MARGIN + Math.random() * (WORLD_H - SPAWN_MARGIN * 2);
    let ok = true;
    for (const p of existingPoints) {
      if (Math.hypot(x - p.x, y - p.y) < MIN_SPAWN_DIST) { ok = false; break; }
    }
    if (ok) {
      for (const o of obstacles) {
        if (Math.hypot(x - o.x, y - o.y) < o.r + 40) { ok = false; break; }
      }
    }
    if (ok && Math.hypot(x - player.x, y - player.y) < 220) ok = false; // oyuncunun dibine ani spawn olmasın
    if (ok) return { x, y };
  }
  // 40 denemede boş yer yoksa (çok nadir) yine de bir yer döndür.
  return {
    x: SPAWN_MARGIN + Math.random() * (WORLD_W - SPAWN_MARGIN * 2),
    y: SPAWN_MARGIN + Math.random() * (WORLD_H - SPAWN_MARGIN * 2),
  };
}

// Hayatta olan tüm canavarların konumları — yeni doğan, bunların dibine düşmesin.
function livingPoints() {
  const pts = [];
  for (const o of orcs) if (!o.dead) pts.push({ x: o.x, y: o.y });
  for (const s of soldiers) if (!s.dead) pts.push({ x: s.x, y: s.y });
  for (const g of goblins) if (!g.dead) pts.push({ x: g.x, y: g.y });
  if (typeof archers !== "undefined") for (const a of archers) if (!a.dead) pts.push({ x: a.x, y: a.y }); // [KALE]
  return pts;
}

// Küçük bir "belirme" efekti — yeni canavar sessizce ışınlanmasın,
// göz ucuyla fark edilsin (efekt fonksiyonu yoksa sessizce atlanır).
function spawnPoofAt(x, y) {
  if (typeof spawnParticle !== "function") return;
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    spawnParticle(x, y, {
      vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
      life: 0.4, size: Math.random() * 2.5 + 1.5,
      color: "rgba(216,178,106,0.7)"
    });
  }
}

// Süresi dolan ölüleri kendi dizisi içinde, yerinde tazeler.
function respawnExpired(arr, maker) {
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e.dead && e.deathT >= RESPAWN_DELAY) {
      const p = pickSpawnPoint(livingPoints());
      arr[i] = maker(p.x, p.y);
      spawnPoofAt(p.x, p.y);
    }
  }
}

function updateWaveManager(dt) {
  respawnExpired(orcs, makeOrc);
  respawnExpired(soldiers, makeSoldier);
  respawnExpired(goblins, makeGoblin);
  if (typeof archers !== "undefined" && typeof makeArcher === "function") respawnExpired(archers, makeArcher); // [KALE]
}

// İlk kurulum / toplu dağıtım — 12-main açılışta bunu çağırmaya devam eder.
function spawnNewWave() {
  // [KADRO] Biyom kendi kadrosunu getirebilir (kale: soldier yok, 5 okçu var).
  const R = ACTIVE_BIOME.roster || { orc: ENEMIES_PER_TYPE, soldier: ENEMIES_PER_TYPE, goblin: ENEMIES_PER_TYPE, archer: 0 };
  const points = [];
  orcs = []; soldiers = []; goblins = [];
  if (typeof archers !== "undefined") archers = [];
  for (let i = 0; i < (R.orc || 0); i++) {
    const p = pickSpawnPoint(points); points.push(p);
    orcs.push(makeOrc(p.x, p.y));
  }
  for (let i = 0; i < (R.soldier || 0); i++) {
    const p = pickSpawnPoint(points); points.push(p);
    soldiers.push(makeSoldier(p.x, p.y));
  }
  for (let i = 0; i < (R.goblin || 0); i++) {
    const p = pickSpawnPoint(points); points.push(p);
    goblins.push(makeGoblin(p.x, p.y));
  }
  if ((R.archer || 0) > 0 && typeof makeArcher === "function") {
    for (let i = 0; i < R.archer; i++) {
      const p = pickSpawnPoint(points); points.push(p);
      archers.push(makeArcher(p.x, p.y));
    }
  }
}

// Eski sistemden kalan yardımcılar — başka dosyalar referans veriyor
// olabilir diye korunuyor, davranışta rolleri yok.
function allEnemiesDead() {
  return orcs.every(o => o.dead) && soldiers.every(s => s.dead) && goblins.every(g => g.dead) && (typeof archers === "undefined" || archers.every(a => a.dead));
}
function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}
