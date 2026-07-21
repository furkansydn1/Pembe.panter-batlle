// ============================================================
// ANA DÖNGÜ (+ hitstop ve ölüm ekranı entegrasyonu)
// ============================================================
let lastTime = performance.now();
let fpsAcc = 0, fpsFrames = 0, fpsLabelEl = document.getElementById("fpsLabel");

function loop(now) {
  const rawDt = Math.min(0.05, (now - lastTime) / 1000); // dt cap (sekme arka plana atınca zıplama olmasın)
  lastTime = now;

  // HITSTOP: kılıç temasında oyun ~50ms komple donar (05-effects tetikler).
  // rawDt gerçek zamanı sayar, dt=0 ile tüm update'ler o kare durur —
  // çizim devam ettiği için ekran kararmaz, sadece "an" donar.
  let dt = rawDt;
  if (hitstopT > 0) {
    hitstopT -= rawDt;
    dt = 0;
  }

  if (!atMainScreen) {
    if (!deathSeq.active) {
      // ÖLÜM EKRANI aktifken dünya donar — sadece parçacık/yazı/kamera akar
      updatePlayer(dt);
      updateOrcs(dt);
      updateSoldiers(dt);
      updateGoblins(dt);
    }
    updateFloatingTexts(dt);
    updateParticles(dt);
    updateCamera(dt);
  }
  updateWaveManager(dt); // "ana ekran"da da respawn sayacı işlemeye devam etsin

  // ÖLÜM SIRASI: 3 sn geri sayım (gerçek zamanla, hitstop'tan etkilenmez),
  // süre dolunca oyunun kendi ölüm cezası/respawn'ı (04-economy) çalışır.
  if (deathSeq.active) {
    deathSeq.t += rawDt;
    if (deathSeq.t >= deathSeq.dur) {
      deathSeq.active = false;
      handlePlayerDeath();
      if (player.hp <= 0) player.hp = player.maxHp; // emniyet: ceza fonksiyonu canı doldurmadıysa doldur
      hpLabelEl.textContent = player.hp;
    }
  }

  // [DİKEY] ---- DÜNYA KATMANI: ZOOM ile ölçekli çizilir ----
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // NOT: çizim fonksiyonları zaten "sx = worldX - camera.x" ile kamera kaydırmasını
  // KENDİLERİ yapıyor. O yüzden burada SADECE ZOOM ölçeği uygulanır — ayrıca
  // translate(-camera) YAPILMAZ (yaparsak kamera iki kez çıkar, dünya kayar).
  ctx.save();
  ctx.scale(ZOOM, ZOOM);
  drawGround();
  drawObstacles();
  drawGoblins();
  drawOrcs();
  drawSoldiers();
  drawParticles();
  drawPlayer();
  drawFloatingTexts();
  ctx.restore();

  // [DİKEY] ---- EKRAN KATMANI: transform sıfır (ekran px) ----
  if (typeof drawEdgeArrows === "function") drawEdgeArrows(); // ekran-dışı düşman okları
  if (deathSeq.active) drawDeathOverlay();                    // karartma + ÖLDÜN + sayaç

  fpsAcc += rawDt; fpsFrames++;
  if (fpsAcc >= 0.5) {
    fpsLabelEl.textContent = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0; fpsFrames = 0;
  }

  requestAnimationFrame(loop);
}
spawnNewWave(); // ilk dalga: her türden 5 canavar, haritaya dağıtılmış şekilde
requestAnimationFrame(loop);
