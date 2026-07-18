// ============================================================
// ANA DÖNGÜ
// ============================================================
let lastTime = performance.now();
let fpsAcc = 0, fpsFrames = 0, fpsLabelEl = document.getElementById("fpsLabel");

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000); // dt cap (sekme arka plana atınca zıplama olmasın)
  lastTime = now;

  if (!atMainScreen) {
    updatePlayer(dt);
    updateOrcs(dt);
    updateSoldiers(dt);
    updateGoblins(dt);
    updateFloatingTexts(dt);
    updateParticles(dt);
    updateCamera(dt);
  }
  updateWaveManager(dt); // "ana ekran"da da respawn sayacı işlemeye devam etsin

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGround();
  drawObstacles();
  drawGoblins();
  drawOrcs();
  drawSoldiers();
  drawParticles();
  drawPlayer();
  drawFloatingTexts();
  drawHUD();

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) {
    fpsLabelEl.textContent = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0; fpsFrames = 0;
  }

  requestAnimationFrame(loop);
}
spawnNewWave(); // ilk dalga: her türden 5 canavar, haritaya dağıtılmış şekilde
requestAnimationFrame(loop);
