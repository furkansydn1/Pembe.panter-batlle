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
    const endX = camera.x + canvas.width;
    const endY = camera.y + canvas.height;

    for (let wx = startX; wx < endX; wx += T) {
      for (let wy = startY; wy < endY; wy += T) {
        const sx = wx - camera.x, sy = wy - camera.y;
        // Karo indeksine göre flip yönü (dama tahtası varyasyonu)
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
  } else {
    // YEDEK: görsel yüklenmediyse eski düz zemin + nokta grid
    ctx.fillStyle = "#2a3d1f";
    ctx.fillRect(-camera.x, -camera.y, WORLD_W, WORLD_H);
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    const gridSize = 48;
    const gsx = Math.floor(camera.x / gridSize) * gridSize;
    const gsy = Math.floor(camera.y / gridSize) * gridSize;
    for (let gx = gsx; gx < camera.x + canvas.width + gridSize; gx += gridSize) {
      for (let gy = gsy; gy < camera.y + canvas.height + gridSize; gy += gridSize) {
        ctx.fillRect(gx - camera.x, gy - camera.y, 2, 2);
      }
    }
  }

  // Harita kenar çizgisi
  ctx.strokeStyle = "rgba(255,45,135,0.4)";
  ctx.lineWidth = 4;
  ctx.strokeRect(-camera.x, -camera.y, WORLD_W, WORLD_H);
}

function drawObstacles() {
  for (const o of obstacles) {
    const sx = o.x - camera.x, sy = o.y - camera.y;
    if (sx < -120 || sx > canvas.width + 120 || sy < -160 || sy > canvas.height + 120) continue;

    // gölge (yere oturma hissi) — kayada sprite genişliğine uyacak şekilde geniş
    const shadowRx = (o.type === "rock" && rockImgReady) ? o.r * 1.4 : o.r * 0.9;
    ctx.beginPath();
    ctx.ellipse(sx, sy + o.r * 0.7, shadowRx, o.r * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    if (o.type === "rock") {
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
  // Şu an ekstra HUD yok (HTML üzerindeki .hud-top zaten var), sadece debug
  // amaçlı oyuncu koordinatlarını gösterelim (test için faydalı).
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "11px monospace";
  ctx.fillText(`x:${player.x.toFixed(0)} y:${player.y.toFixed(0)} facing:${player.facing}`, 10, canvas.height - 10);
}
