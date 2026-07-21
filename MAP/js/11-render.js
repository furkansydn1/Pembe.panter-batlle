// ============================================================
// ÇİZİM (RENDER)
// ============================================================
function drawGround() {
  if (groundImgReady) {
    // DİKİŞSİZ ÇİM DÖŞEME: 256'lık karo, sadece görünen alana döşenir (performans).
    // Tekrar desenini gizlemek için karolar dama-tahtası gibi yatay/dikey
    // çevrilir (flip) — aynı karo 4 farklı yönde göründüğü için göz tekrarı
    // zor fark eder. Kamera kesirli olsa da karo hizası dünyaya sabit kalır.
    const T = GROUND_TILE;
    // Görünen alanın dünya koordinatındaki sınırları
    const startX = Math.floor(camera.x / T) * T;
    const startY = Math.floor(camera.y / T) * T;
    const endX = camera.x + VIEW_W; // [DİKEY] görünen dünya genişliği (zoom'a bağlı)
    const endY = camera.y + VIEW_H;

    for (let wx = startX; wx < endX; wx += T) {
      for (let wy = startY; wy < endY; wy += T) {
        const sx = wx - camera.x, sy = wy - camera.y;
        // Karo indeksine göre flip yönü (dama tahtası varyasyonu)
        if (ACTIVE_BIOME.groundFlip === false) {
          // [ZEMİN v3] Flip'siz düz döşeme: yönlü detaylı karolar için
          ctx.drawImage(groundImg, sx, sy, T, T);
        } else {
          const ix = Math.round(wx / T), iy = Math.round(wy / T);
          const flipX = (ix % 2 === 0) ? 1 : -1;
          const flipY = (iy % 2 === 0) ? 1 : -1;
          ctx.save();
          ctx.translate(sx + (flipX < 0 ? T : 0), sy + (flipY < 0 ? T : 0));
          ctx.scale(flipX, flipY);
          ctx.drawImage(groundImg, 0, 0, T, T);
          ctx.restore();
        }
      }
    }
  } else {
    // YEDEK: görsel yüklenmediyse eski düz zemin + nokta grid
    ctx.fillStyle = "#2a3d1f";
    ctx.fillRect(-camera.x, -camera.y, WORLD_W, WORLD_H);
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    const gridSize = 48;
    const gsx = Math.floor(camera.x / gridSize) * gridSize;
    const gsy = Math.floor(camera.y / gridSize) * gridSize;
    for (let gx = gsx; gx < camera.x + VIEW_W + gridSize; gx += gridSize) {
      for (let gy = gsy; gy < camera.y + VIEW_H + gridSize; gy += gridSize) {
        ctx.fillRect(gx - camera.x, gy - camera.y, 2, 2);
      }
    }
  }

  // [BİYOM] Süsler (kemik/mantar) — zeminin üstü, zehir tonunun ALTI:
  // ton süslerin de üstüne serilince ortam bütünleşir.
  if (typeof drawDecor === "function") drawDecor();

  // [BİYOM] Zehir/sis tonu — zeminin üstüne, obstacle/canavarların ALTINA serilir.
  // Görünen alanı (world-pass'te 0,0..VIEW_W,VIEW_H) kaplar, çok hafif.
  if (ACTIVE_BIOME.tint) {
    ctx.fillStyle = ACTIVE_BIOME.tint;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // Harita kenar çizgisi (biyoma göre renk)
  ctx.strokeStyle = ACTIVE_BIOME.borderColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(-camera.x, -camera.y, WORLD_W, WORLD_H);
}

function drawObstacles() {
  for (const o of obstacles) {
    const sx = o.x - camera.x, sy = o.y - camera.y;
    if (sx < -120 || sx > VIEW_W + 120 || sy < -160 || sy > VIEW_H + 120) continue;

    // gölge (yere oturma hissi) — kayada sprite genişliğine uyacak şekilde geniş
    const shadowRx = (o.type === "rock" && rockImgReady) ? o.r * 1.4 : o.r * 0.9;
    ctx.beginPath();
    ctx.ellipse(sx, sy + o.r * 0.7, shadowRx, o.r * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    if (o.type === "pumpkin" || o.type === "sign") {
      // [BİYOM] Bataklık engelleri: çürük balkabağı + kurukafalı tabela.
      // Tabela uzun sprite (64x128) — tabanı çarpışma noktasına oturur, üstü taşar.
      const im = o.type === "pumpkin" ? (balkabagiReady ? balkabagiImg : null)
                                      : (tabelaReady ? tabelaImg : null);
      if (im) {
        const w = o.r * (o.type === "sign" ? 2.4 : 2.9);
        const h = w * (im.height / im.width);
        // kırpılmış görsel: dibi = nesnenin dibi → tabanı sy'ye (hafif gömülü) otur
        ctx.drawImage(im, sx - w / 2, sy + o.r * 0.55 - h, w, h);
      } else {
        // YEDEK: görsel yoksa düz daire
        ctx.beginPath(); ctx.arc(sx, sy, o.r, 0, Math.PI * 2);
        ctx.fillStyle = o.type === "pumpkin" ? "#a8622a" : "#7a5a3a"; ctx.fill();
      }
    } else if (o.type === "rock") {
      if (rockImgReady) {
        // Piksel-art kaya: çarpışma dairesine (r) göre ölçeklenir, tabanı
        // gölgenin üstüne, zemine tam oturur.
        const w = o.r * 3.0;
        const h = w * (rockImg.height / rockImg.width);
        ctx.drawImage(rockImg, sx - w / 2, sy + o.r * 0.9 - h, w, h);
      } else {
        // YEDEK: eski daire kaya
        ctx.beginPath();
        ctx.arc(sx, sy, o.r, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(sx - o.r * 0.3, sy - o.r * 0.3, o.r * 0.1, sx, sy, o.r);
        grad.addColorStop(0, "#9a9aa8");
        grad.addColorStop(1, "#4a4a58");
        ctx.fillStyle = grad;
        ctx.fill();
      }
    } else {
      if (treeImgReady) {
        // Ağacın gövde dibi çarpışma noktasına oturur; tepesi yukarı taşar.
        const w = o.r * 2.6;
        const h = w * (treeImg.height / treeImg.width);
        ctx.drawImage(treeImg, sx - w / 2, sy + o.r * 0.8 - h, w, h);
      } else {
        // YEDEK: eski gövde + yaprak küresi
        ctx.fillStyle = "#5c4033";
        ctx.fillRect(sx - 6, sy - 4, 12, o.r * 0.8);
        ctx.beginPath();
        ctx.arc(sx, sy - o.r * 0.5, o.r * 0.8, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(sx - o.r * 0.2, sy - o.r * 0.8, o.r * 0.1, sx, sy - o.r * 0.5, o.r * 0.8);
        grad.addColorStop(0, "#4d9b5f");
        grad.addColorStop(1, "#1f5c30");
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }
  }
}

function drawHUD() {
  // (Debug koordinat yazısı kaldırıldı — dikey ekranda gereksizdi.)
}

// ============================================================
// [DİKEY] EKRAN-DIŞI DÜŞMAN OKLARI
// Zoom yüzünden ekran dışında kalan düşmanların yönünü/türünü ekran kenarında
// küçük renkli oklarla gösterir. EKRAN-UZAYINDA çizilir (12-main'de dünya
// çiziminden SONRA, transform sıfırlanmış halde çağrılır). Renk = tür.
// ============================================================
function drawEdgeArrows() {
  const cx = canvas.width / 2, cy = canvas.height / 2, pad = 24;
  const lists = [];
  if (typeof orcs !== "undefined") lists.push(orcs);
  if (typeof soldiers !== "undefined") lists.push(soldiers);
  if (typeof goblins !== "undefined") lists.push(goblins);
  for (const arr of lists) {
    for (const e of arr) {
      if (e.dead) continue;
      const sx = (e.x - camera.x) * ZOOM, sy = (e.y - camera.y) * ZOOM;
      if (sx >= -8 && sx <= canvas.width + 8 && sy >= -8 && sy <= canvas.height + 8) continue; // ekranda
      const ang = Math.atan2(sy - cy, sx - cx);
      let ex = cx + Math.cos(ang) * (cx - pad), ey = cy + Math.sin(ang) * (cy - pad);
      ex = Math.max(pad, Math.min(canvas.width - pad, ex));
      ey = Math.max(pad, Math.min(canvas.height - pad, ey));
      ctx.save();
      ctx.translate(ex, ey); ctx.rotate(ang); ctx.globalAlpha = 0.72;
      ctx.fillStyle = e.type === "goblin" ? "#8fd98f" : e.type === "soldier" ? "#aab4c8" : "#c9a24a";
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -7); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// [BİYOM] SÜS ÇİZİMİ — kemik/mantar. Çarpışmaz; drawGround sonunda,
// zehir tonundan önce çağrılır. Görsel yüklenmediyse sessizce atlanır.
// Süs görselleri artık İÇERİĞE KIRPILI (saydam kenar yok) → PNG'nin dibi =
// nesnenin dibi. Bu yüzden tabanı doğrudan d.y hizasına oturtuyoruz + gölge.
const DECOR_W = { kemik1: 30, kemik2: 22, mantar: 48 }; // ekran genişliği (world); mantar büyütüldü
function drawDecor() {
  const list = ACTIVE_BIOME.decor;
  if (!list) return;
  for (const d of list) {
    const sx = d.x - camera.x, sy = d.y - camera.y;
    if (sx < -70 || sx > VIEW_W + 70 || sy < -70 || sy > VIEW_H + 70) continue;
    let im = null;
    if (d.type === "kemik1" && kemik1Ready) im = kemik1Img;
    else if (d.type === "kemik2" && kemik2Ready) im = kemik2Img;
    else if (d.type === "mantar" && mantarReady) im = mantarImg;
    if (!im) continue;
    const w = DECOR_W[d.type] || 28;
    const h = w * (im.height / im.width);
    // yere oturma gölgesi (nesne genişliğine göre elips)
    ctx.beginPath();
    ctx.ellipse(sx, sy + 1, w * 0.42, w * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fill();
    // taban d.y'ye otursun (2px zemine gömülü dursun)
    ctx.drawImage(im, sx - w / 2, sy - h + 2, w, h);

    // MANTAR KONUŞMASI: aktif satır varsa kabarcıkla üstünde göster
    if (d.type === "mantar" && d._line && d._lineT > 0) {
      drawMantarBubble(sx, sy - h - 4, d._line, d._lineT);
    }
  }
}

// ---- Mantar konuşma sistemi ----
const MANTAR_LINES = [
  "Bana her şey uyar kanka",
  "kitap okumak meditasyon yapmak moruk ya",
  "hııııı başka",
  "Halla Hallaaa",
  "Yine benim üstüme kalıcak aq ya",
];
function mantarSay(d, text) {
  d._line = text || MANTAR_LINES[(Math.random() * MANTAR_LINES.length) | 0];
  d._lineT = 2.6;          // ekranda kalma süresi (sn)
  d._next = 4 + Math.random() * 5; // sonraki lafa kadar (sn)
}
// Her mantarın kendi sayaçlarını işletir; sırayla, çakışmasın diye rastgele gecikmeli.
function updateDecor(dt) {
  const list = ACTIVE_BIOME.decor;
  if (!list) return;
  for (const d of list) {
    if (d.type !== "mantar") continue;
    if (d._next === undefined) { d._next = 1 + Math.random() * 6; d._lineT = 0; } // ilk gecikme
    if (d._lineT > 0) d._lineT -= dt;
    d._next -= dt;
    if (d._next <= 0) mantarSay(d);
  }
}
// Konuşma kabarcığı (dünya-uzayında, zoom ile ölçeklenir)
function drawMantarBubble(cx, topY, text, lifeT) {
  const alpha = Math.min(1, lifeT / 0.4); // sönerken solsun
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '600 11px -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = "center";
  const tw = Math.min(150, ctx.measureText(text).width);
  const padX = 7, padY = 5, bw = tw + padX * 2, bh = 20;
  const bx = cx - bw / 2, by = topY - bh;
  // kabarcık gövdesi
  ctx.fillStyle = "rgba(18,19,25,0.92)";
  ctx.strokeStyle = "rgba(150,190,90,0.6)";
  ctx.lineWidth = 1;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill(); ctx.stroke(); }
  else { ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh); }
  // kuyruk
  ctx.beginPath();
  ctx.moveTo(cx - 4, by + bh); ctx.lineTo(cx + 4, by + bh); ctx.lineTo(cx, by + bh + 5);
  ctx.closePath(); ctx.fillStyle = "rgba(18,19,25,0.92)"; ctx.fill();
  // yazı
  ctx.fillStyle = "#dfe8c2";
  ctx.fillText(text, cx, by + 14, 150);
  ctx.restore();
  ctx.textAlign = "left";
}
