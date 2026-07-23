import { showResultModal } from "./battle.js";
import { getScrap } from "./core-config.js";
import { IS_LOW_POWER, bountyActive, bountyAmountEl, bountyAmountInput, bountyForm, bountyPlacer, bountyStatus, bountyTargetName, bountyTargetSelect, luckyWheel, oracleAmountInput, oracleAmountLabel, oracleForm, oraclePending, oracleStatus, oracleTargetLabel, oracleTargetSelect, placeBountyBtn, placeOracleBtn, spinWheelBtn, wheelBgGlow, wheelOuter, wheelPanelEl, wheelScene, wheelShockwaveEl, wheelStatus } from "./dom.js";
import { PLAYERS_COL, db, doc, runTransaction, updateDoc } from "./firebase-setup.js";
import { getMinorTraitBonusPct } from "./item-systems.js";
import { dateStr, formatRemaining } from "./map.js";
import { incrementQuestProgress } from "./quests.js";
import { S } from "./state.js";
import { buildWheelSpokesGradient, getWheelRotationDeg, playSound, sfxOpenLegendary, sfxOpenRare, sfxOpenStandart, sfxWheelTick } from "./ui-misc.js";

// ============================================================
// ŞANSLI ÇARK
// 12 saatte bir bedava çevirme hakkı, küçük hurda/puan bonusları verir.
// ============================================================
export const WHEEL_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 saatte 1 çevirme
// "Karanlık Kader Çarkı" teması: her segmentin artık kompakt bir val/lbl
// (örn. "+5" / "HURDA") çifti ve kendine özgü bir "glow" (parlama) rengi var.
// JACKPOT'un eski uzun tek satırlık etiketi ("JACKPOT! +15 Puan +20 Hurda")
// çemberden taşıyordu; artık val="JACKPOT" + lbl="+15⭐ +20✨" şeklinde iki
// kısa satıra bölündü ve rozet sabit bir maksimum genişlikte tutulduğu için
// taşma tamamen ortadan kalktı. scrap/points/weight/type/id alanları ve ödül
// mantığı BİREBİR aynı kaldı, sadece görsel metadata eklendi.
export const WHEEL_SEGMENTS = [
  { id: "scrap_small", label: "+5 Hurda", val: "+5", lbl: "HURDA", type: "scrap", scrap: 5, points: 0, weight: 28, color: "#1a2530", glow: "#8ba3b8" },
  { id: "points_small", label: "+3 Puan", val: "+3", lbl: "PUAN", type: "points", scrap: 0, points: 3, weight: 22, color: "#0d2b1d", glow: "var(--green)" },
  { id: "scrap_medium", label: "+12 Hurda", val: "+12", lbl: "HURDA", type: "scrap", scrap: 12, points: 0, weight: 20, color: "#101e40", glow: "var(--blue)" },
  { id: "points_medium", label: "+6 Puan", val: "+6", lbl: "PUAN", type: "points", scrap: 0, points: 6, weight: 12, color: "#3a0b2e", glow: "var(--accent)" },
  { id: "scrap_big", label: "+25 Hurda", val: "+25", lbl: "HURDA", type: "scrap", scrap: 25, points: 0, weight: 12, color: "#3b2a05", glow: "var(--gold)" },
  { id: "jackpot", label: "JACKPOT! +15 Puan +20 Hurda", val: "JACKPOT", lbl: "+15⭐ +20✨", type: "combo", scrap: 20, points: 15, weight: 6, color: "#000000", glow: "#ff2a2a" }
];
export const WHEEL_SEGMENT_ANGLE = 360 / WHEEL_SEGMENTS.length;

// ============================================================
// KELLE AVCISI
// Herkesin görebileceği tek, paylaşımlı bir "ödül" ilanı. Bir oyuncu
// başka birinin üstüne hurda koyar, o kişiyi saldırıda İLK yenen ödülü kapar.
// ============================================================
export const META_COL = "gameMeta";
export const BOUNTY_DOC_ID = "bounty";
// [V2 Faz 6] V2 ekonomisine göre alt sınır eklendi. Kelle Avcısı TAMAMEN
// oyuncular arası (peer-funded) bir sistem — ilan sahibi kendi hurdasını
// koyar, tavan zaten o oyuncunun bakiyesiyle doğal olarak sınırlanıyordu. Ama
// alt sınır hiç yoktu (sadece "amount < 1" kontrolü): aynı anda sadece TEK
// bir aktif ilan olabildiği için (paylaşımlı gameMeta/bounty dokümanı) 1
// hurdalık anlamsız bir ilan, herkesin ortak kullandığı o tek slotu
// değersizce işgal edebiliyordu. Eşik, yeni WEEKLY_TIER_REWARDS.orta.scrapMin
// (18) ile aynı mertebeye çekildi.
export const BOUNTY_MIN_AMOUNT = 15;
// [v2.2] Üst sınır eklendi: tek ortak ilan slotunun çok zengin bir oyuncu
// tarafından aşırı yüksek bir ödülle uzun süre "kilitlenmesini" önlemek için.
export const BOUNTY_MAX_AMOUNT = 100;



// ŞANSLI ÇARK — mantık
// 12 saatte bir çevrilebilen, küçük hurda/puan ödülleri veren çark.
// ============================================================
export function canSpinWheelNow() {
  if (!S.currentPlayerData) return false;
  const last = S.currentPlayerData.lastWheelSpinTime || 0;
  return Date.now() - last >= WHEEL_COOLDOWN_MS;
}

export function buildWheelGradient() {
  let acc = 0;
  const stops = WHEEL_SEGMENTS.map(seg => {
    const start = acc;
    acc += WHEEL_SEGMENT_ANGLE;
    return `${seg.color} ${start}deg ${acc}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

export function renderWheel() {
  if (!luckyWheel || !S.currentPlayerData) return;
  if (!luckyWheel.dataset.built) {
    luckyWheel.style.background = buildWheelGradient();
    const spokes = `<div class="wheel-spokes" style="background:${buildWheelSpokesGradient()}"></div>`;
    // Her segment için: çemberin merkezinden dışa doğru, dilimin tam ortasına
    // hizalanan kompakt bir rozet (val üstte büyük, lbl altta küçük). Rozet
    // sabit bir maksimum genişlikte tutulduğu için (bkz. styles.css) JACKPOT
    // dahil hiçbir etiket artık çemberden taşmıyor. Şeytan gözü göbek ve bıçak
    // ibre artık statik HTML'de (index.html), dönen kadranın İÇİNDE değil,
    // bu yüzden JS tarafında ayrıca eklenmelerine gerek yok.
    const labels = WHEEL_SEGMENTS.map((seg, i) => {
      const centerAngle = WHEEL_SEGMENT_ANGLE * i + WHEEL_SEGMENT_ANGLE / 2;
      const isJackpot = seg.id === "jackpot";
      return `
        <div class="wheel-seg-container" style="transform: rotate(${centerAngle - 90}deg);">
          <div class="wheel-text-badge ${isJackpot ? "jackpot-badge" : ""}">
            <span class="wheel-text-val">${seg.val}</span>
            <span class="wheel-text-lbl">${seg.lbl}</span>
          </div>
        </div>`;
    }).join("");
    luckyWheel.innerHTML = spokes + labels;
    luckyWheel.dataset.built = "1";
  }
  const able = canSpinWheelNow();
  spinWheelBtn.disabled = !able;
  if (able) {
    wheelStatus.textContent = "Çarkı çevirmeye hazır!";
  } else {
    const remain = WHEEL_COOLDOWN_MS - (Date.now() - (S.currentPlayerData.lastWheelSpinTime || 0));
    wheelStatus.textContent = `Sıradaki çevirme hakkına ${formatRemaining(remain)} kaldı.`;
  }
}

export function pickWheelSegmentIndex() {
  const total = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    r -= WHEEL_SEGMENTS[i].weight;
    if (r <= 0) return i;
  }
  return WHEEL_SEGMENTS.length - 1;
}

// Karanlık Kader Çarkı'ndaki gibi yerçekimi + sürtünmeli, gerçekçi bir
// kor/kıvılcım patlaması. Sadece görsel bir katman, hiçbir oyun verisine
// dokunmuyor.
export function explodeWheelEmbers(color, count) {
  if (!wheelScene) return;
  for (let i = 0; i < count; i++) {
    const ember = document.createElement("div");
    ember.className = "wheel-ember";
    ember.style.background = "#fff";
    ember.style.boxShadow = `0 0 12px 3px ${color}, 0 0 4px 2px #fff`;
    ember.style.left = "50%";
    ember.style.top = "50%";
    wheelScene.appendChild(ember);

    const angle = Math.random() * Math.PI * 2;
    const velocity = 7 + Math.random() * 13;
    let vx = Math.cos(angle) * velocity;
    let vy = Math.sin(angle) * velocity;
    let x = 0, y = 0, life = 1.0;
    const gravity = 0.35, friction = 0.94;

    function stepEmber() {
      if (life <= 0) { ember.remove(); return; }
      vx *= friction; vy *= friction; vy += gravity;
      x += vx; y += vy; life -= 0.02;
      ember.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${Math.max(life, 0)})`;
      ember.style.opacity = String(Math.max(life, 0));
      requestAnimationFrame(stepEmber);
    }
    requestAnimationFrame(stepEmber);
  }
}

export async function spinTheWheel() {
  if (!S.currentPlayerData || !canSpinWheelNow()) return;
  spinWheelBtn.disabled = true;

  const idx = pickWheelSegmentIndex();
  const seg = WHEEL_SEGMENTS[idx];
  const segCenter = WHEEL_SEGMENT_ANGLE * idx + WHEEL_SEGMENT_ANGLE / 2;
  const currentRotation = parseFloat(luckyWheel.dataset.rotation || "0");
  const extraSpins = 4;
  const spinDurationMs = 3200;
  // Pointer 0 derecede (üstte) sabit, çark bu segmentin merkezi üste gelecek şekilde döner
  const targetRotation = currentRotation - (currentRotation % 360) + extraSpins * 360 + (360 - segCenter);

  luckyWheel.style.transition = `transform ${spinDurationMs / 1000}s cubic-bezier(.17,.67,.2,1)`;
  luckyWheel.style.transform = `rotate(${targetRotation}deg)`;
  luckyWheel.dataset.rotation = String(targetRotation);
  playSound("wheel");
  if (wheelScene) wheelScene.classList.add("is-spinning"); // şeytani ibre sekme efekti

  // Dönüş sırasında her segment sınırını geçtiğinde kısa bir "tık" sesi çal
  const endTime = Date.now() + spinDurationMs + 100;
  let lastSeg = Math.floor(getWheelRotationDeg(luckyWheel) / WHEEL_SEGMENT_ANGLE);
  function pollTick() {
    const deg = getWheelRotationDeg(luckyWheel);
    const segNow = Math.floor(deg / WHEEL_SEGMENT_ANGLE);
    if (segNow !== lastSeg) { sfxWheelTick(); lastSeg = segNow; }
    if (Date.now() < endTime) requestAnimationFrame(pollTick);
  }
  requestAnimationFrame(pollTick);

  wheelStatus.textContent = "Çark dönüyor...";
  await new Promise(r => setTimeout(r, spinDurationMs + 100));

  if (wheelScene) wheelScene.classList.remove("is-spinning");

  // --- EPİK SONUÇ EFEKTLERİ (Karanlık Kader Çarkı) ---
  // Kazanılan segmentin rengine göre: çark kasasının etrafında parlama,
  // panelde ekran sarsıntısı, şok dalgası patlaması ve kor parçacıkları.
  if (wheelScene) wheelScene.style.setProperty("--wheel-glow", seg.glow);
  if (wheelPanelEl) {
    wheelPanelEl.classList.add("wheel-is-shaking");
    setTimeout(() => wheelPanelEl.classList.remove("wheel-is-shaking"), 400);
  }
  if (wheelOuter) {
    wheelOuter.classList.remove("win-highlight");
    void wheelOuter.offsetWidth; // animasyonu yeniden başlatmak için reflow
    wheelOuter.classList.add("win-highlight");
  }
  if (wheelBgGlow) {
    wheelBgGlow.style.opacity = "0.6";
    wheelBgGlow.style.boxShadow = `0 0 90px 45px ${seg.glow}`;
  }
  if (wheelShockwaveEl) {
    wheelShockwaveEl.style.borderColor = seg.glow;
    wheelShockwaveEl.classList.remove("blast");
    void wheelShockwaveEl.offsetWidth; // reflow
    wheelShockwaveEl.classList.add("blast");
  }
  explodeWheelEmbers(seg.glow, IS_LOW_POWER ? (seg.id === "jackpot" ? 22 : 10) : (seg.id === "jackpot" ? 46 : 22));

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
    lastWheelSpinTime: Date.now(),
    scrap: getScrap(S.currentPlayerData) + seg.scrap,
    points: (S.currentPlayerData.points || 0) + seg.points,
    ...(seg.type === "combo" ? { wheelJackpotsTotal: (S.currentPlayerData.wheelJackpotsTotal || 0) + 1 } : {})
  });

  wheelStatus.innerHTML = seg.type === "combo"
    ? `<span style="color:${seg.glow}; text-shadow:0 0 8px ${seg.glow};">🔥 JACKPOT! +${seg.points} puan ve +${seg.scrap} hurda kazandın!</span>`
    : `<span style="color:${seg.glow};">${seg.label} kazandın!</span>`;

  // Ödülün büyüklüğüne göre farklı sonuç sesi: jackpot'ta efsanevi fanfar
  if (seg.type === "combo") sfxOpenLegendary();
  else if (seg.scrap >= 12 || seg.points >= 6) sfxOpenRare();
  else sfxOpenStandart();

  setTimeout(() => {
    if (wheelBgGlow) { wheelBgGlow.style.opacity = "0.15"; wheelBgGlow.style.boxShadow = "none"; }
  }, 3500);
}
if (spinWheelBtn) spinWheelBtn.onclick = spinTheWheel;

// ============================================================
// KELLE AVCISI — mantık
// Paylaşımlı tek bir ilan (gameMeta/bounty). Hurda koyarak bir hedefe ödül
// konur, o hedefi saldırıda İLK yenen kişi ödülü kapar.
// ============================================================
export function renderBountyForm() {
  if (!bountyTargetSelect || !S.currentPlayerId) return;
  const options = S.allPlayers.filter(p => p.id !== S.currentPlayerId);
  bountyTargetSelect.innerHTML = options.map(p => `<option value="${p.id}">${p.nick}</option>`).join("");
  if (bountyAmountInput) {
    bountyAmountInput.max = String(BOUNTY_MAX_AMOUNT);
  }
}

export function renderBounty() {
  if (!bountyActive) return;
  if (S.currentBounty && S.currentBounty.active) {
    bountyActive.classList.remove("hidden");
    bountyForm.classList.add("hidden");
    bountyTargetName.textContent = S.currentBounty.targetName;
    bountyAmountEl.textContent = S.currentBounty.amount;
    bountyPlacer.textContent = S.currentBounty.placedByName;
  } else {
    bountyActive.classList.add("hidden");
    bountyForm.classList.remove("hidden");
  }
}

if (placeBountyBtn) {
  placeBountyBtn.onclick = async () => {
    if (!S.currentPlayerData) return;
    const targetId = bountyTargetSelect.value;
    const targetPlayer = S.allPlayers.find(p => p.id === targetId);
    const amount = parseInt(bountyAmountInput.value, 10);

    if (!targetPlayer) { bountyStatus.textContent = "Bir hedef seç."; return; }
    if (!amount || amount < BOUNTY_MIN_AMOUNT) { bountyStatus.textContent = `En az ${BOUNTY_MIN_AMOUNT} hurda koymalısın.`; return; }
    if (amount > BOUNTY_MAX_AMOUNT) { bountyStatus.textContent = `En fazla ${BOUNTY_MAX_AMOUNT} hurda koyabilirsin.`; return; }
    if (getScrap(S.currentPlayerData) < amount) { bountyStatus.textContent = "Yeterli hurdan yok."; return; }
    if (S.currentBounty && S.currentBounty.active) { bountyStatus.textContent = "Zaten aktif bir ödül ilanı var."; return; }

    placeBountyBtn.disabled = true;
    try {
      // ÖNCEDEN: kontrol (aktif ilan var mı) ile yazma (hurda düşürme + ilan oluşturma) ayrı
      // ayrı, birbirinden bağımsız iki adımdı. İki oyuncu TAM aynı anda ilan etmeye
      // çalışırsa, ikisi de "aktif ilan yok" görüp devam edebiliyordu; ikinci yazan
      // birincinin ilanının üzerine yazıyordu — birinci oyuncunun hurdası düşüyor ama ilanı
      // sessizce kayboluyor, ödülü de kendi hedefi değil ikinci oyuncunun hedefi kapıyordu.
      // Artık kontrol + yazma tek bir transaction içinde atomik yapılıyor.
      await runTransaction(db, async (tx) => {
        const bountyRef = doc(db, META_COL, BOUNTY_DOC_ID);
        const playerRef = doc(db, PLAYERS_COL, S.currentPlayerId);
        const bountySnap = await tx.get(bountyRef);
        const playerSnap = await tx.get(playerRef);
        if (!playerSnap.exists()) throw new Error("Oyuncu bulunamadı.");
        const freshBounty = bountySnap.exists() ? bountySnap.data() : null;
        const freshPlayer = playerSnap.data();
        if (freshBounty && freshBounty.active) throw new Error("Zaten aktif bir ödül ilanı var.");
        if (amount < BOUNTY_MIN_AMOUNT) throw new Error(`En az ${BOUNTY_MIN_AMOUNT} hurda koymalısın.`);
        if (amount > BOUNTY_MAX_AMOUNT) throw new Error(`En fazla ${BOUNTY_MAX_AMOUNT} hurda koyabilirsin.`);
        if (getScrap(freshPlayer) < amount) throw new Error("Yeterli hurdan yok.");

        tx.update(playerRef, { scrap: getScrap(freshPlayer) - amount });
        tx.set(bountyRef, {
          active: true,
          targetId,
          targetName: targetPlayer.nick,
          amount,
          placedById: S.currentPlayerId,
          placedByName: S.currentPlayerData.nick,
          createdAt: Date.now()
        });
      });
      bountyStatus.textContent = "Ödül ilan edildi!";
      bountyAmountInput.value = "";
    } catch (e) {
      bountyStatus.textContent = (e.message === "Zaten aktif bir ödül ilanı var." || e.message === "Yeterli hurdan yok." || e.message === `En az ${BOUNTY_MIN_AMOUNT} hurda koymalısın.` || e.message === `En fazla ${BOUNTY_MAX_AMOUNT} hurda koyabilirsin.`)
        ? e.message
        : ("Bir hata oldu: " + e.message);
    } finally {
      placeBountyBtn.disabled = false;
    }
  };
}

// ============================================================
// KAHİN BAHSİ
// Gün başında, günün sonunda liderlik tablosunun 1.'sinin kim olacağını
// tahmin edip hurda yatırıyorsun. Doğru bilirsen yatırdığın hurda 2 katına
// çıkıyor, yanlışsa yatırdığın hurda gidiyor. Günde sadece 1 tahmin hakkı var.
// Sonuç, ertesi gün oyuna giriş yapınca (o anki liderlik tablosuyla
// kıyaslanarak) otomatik açıklanır.
// [V2 Faz 6] V2 ekonomisine göre yeniden dengelendi: Faz 2-6 arasında Hurda
// akışı belirgin şekilde büyüdü (görev ödülleri artık günlükte 17'ye,
// haftalıkta 46'ya, aylıkta 110'a kadar çıkıyor; Dünya Boss'u da ayrı bir
// kaynak eklendi — bkz. QUEST_TIER_REWARDS/WORLD_BOSS_HIT_SCRAP_*). Eski
// ORACLE_MAX_BET=10 artık gerçek dışı küçük kalıyordu (tek bir "zor" günlük
// görev bile bundan fazla veriyor). Alt sınır da eklendi ki 1 hurdalık
// anlamsız bir bahis, günün TEK bahis hakkını boşa harcamasın.
// BİLEREK DEĞİŞMEYEN: 2x ödül çarpanı ve "günde 1 hakla sınırlı" kuralı —
// bunlar bir para birimi ölçeği sorunu değil, bir olasılık/risk dengesi
// kararı, bu görevin kapsamı dışında bırakıldı.
// ALTIN (gold) BİLEREK bu bahse dahil edilmedi: Faz 4 notunda da
// belirtildiği gibi Altın'ın normal oyunculara açık gerçek bir kazanım
// kaynağı henüz yok (sadece adminGrantGold ile test amaçlı veriliyor) —
// Altın'ı burada ödül/bahis birimi yapmak, o kasıtlı olarak ertelenmiş
// kararı (Faz 4 "Devam Ediyor" notu) bu görevin kapsamında sessizce almış
// olurdu.
// ============================================================

export const ORACLE_MIN_BET = 3;
export const ORACLE_MAX_BET = 25;

export function renderOracleForm() {
  if (!oracleTargetSelect || !S.currentPlayerId) return;
  // Kimse kendine bahis oynayamasın diye seçim listesinden kendi ismi çıkarılıyor.
  const options = S.allPlayers.filter(p => p.id !== S.currentPlayerId);
  oracleTargetSelect.innerHTML = options.map(p => `<option value="${p.id}">${p.nick}</option>`).join("");
  if (oracleAmountInput) {
    oracleAmountInput.max = String(ORACLE_MAX_BET);
    oracleAmountInput.min = String(ORACLE_MIN_BET);
  }
}

export function renderOraclePanel() {
  if (!oraclePending || !S.currentPlayerData) return;
  const bet = S.currentPlayerData.oracleBet;
  const hasBetToday = bet && bet.day === dateStr();
  oraclePending.classList.toggle("hidden", !hasBetToday);
  oracleForm.classList.toggle("hidden", !!hasBetToday);
  if (hasBetToday) {
    oracleTargetLabel.textContent = bet.targetName;
    oracleAmountLabel.textContent = bet.amount;
  }
}

if (placeOracleBtn) {
  placeOracleBtn.onclick = async () => {
    if (!S.currentPlayerData) return;
    const today = dateStr();
    if (S.currentPlayerData.oracleBet && S.currentPlayerData.oracleBet.day === today) {
      oracleStatus.textContent = "Bugün için zaten bir tahminin var."; return;
    }
    const targetId = oracleTargetSelect.value;
    const targetPlayer = S.allPlayers.find(p => p.id === targetId);
    const amount = parseInt(oracleAmountInput.value, 10);

    if (!targetPlayer) { oracleStatus.textContent = "Bir oyuncu seç."; return; }
    if (targetId === S.currentPlayerId) { oracleStatus.textContent = "Kendine bahis oynayamazsın."; return; }
    if (!amount || amount < ORACLE_MIN_BET) { oracleStatus.textContent = `En az ${ORACLE_MIN_BET} hurda yatırmalısın.`; return; }
    if (amount > ORACLE_MAX_BET) { oracleStatus.textContent = `En fazla ${ORACLE_MAX_BET} hurda yatırabilirsin.`; return; }
    if (getScrap(S.currentPlayerData) < amount) { oracleStatus.textContent = "Yeterli hurdan yok."; return; }

    placeOracleBtn.disabled = true;
    try {
      await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
        scrap: getScrap(S.currentPlayerData) - amount,
        oracleBet: { day: today, targetId, targetName: targetPlayer.nick, amount }
      });
      oracleStatus.textContent = "Tahminin kaydedildi, yarın sonucunu öğreneceksin!";
      oracleAmountInput.value = "";
    } catch (e) {
      oracleStatus.textContent = "Bir hata oldu: " + e.message;
    } finally {
      placeOracleBtn.disabled = false;
    }
  };
}

// Önceki günden kalan bir tahmin varsa, o anki liderlik tablosuyla kıyaslayıp
// sonucu açıklar ve tahmini temizler. Hem kendi oyuncu dokümanı hem de tüm
// oyuncular listesi yüklendiğinde (iki ayrı onSnapshot) tetiklenmesi güvenlidir.
export async function ensureOracleBetResolved() {
  if (!S.currentPlayerData || !S.allPlayers.length || S.oracleResolving) return;
  const bet = S.currentPlayerData.oracleBet;
  if (!bet || bet.day === dateStr()) return;

  S.oracleResolving = true;
  try {
    const topId = S.allPlayers[0]?.id;
    const won = bet.targetId === topId;

    // ÖNCEDEN: bu fonksiyon yerel (bayat olabilecek) S.currentPlayerData üzerinden düz bir
    // updateDoc yapıyordu. Saldırı/kutu açma/enerji görevi gibi başka bir işlem tam bu
    // sırada (aynı anda) Firestore'a yazarsa, buradaki updateDoc o işlemin AZ ÖNCE eklediği
    // görev ilerlemesini fark etmeden üzerine yazıp SİLİYORDU — "Kahin Bahsi'ni doğru
    // bildim ama görev sayacında saymadı" şikayetinin sebebi büyük ihtimalle buydu.
    // Artık en güncel veriyi transaction içinde okuyup üzerine yazıyoruz.
    let resolvedResult = null;
    await runTransaction(db, async (tx) => {
      const ref = doc(db, PLAYERS_COL, S.currentPlayerId);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const freshBet = data.oracleBet;
      // Bu bahis başka bir sekme/çağrı tarafından zaten çözülmüş ya da değişmiş olabilir.
      if (!freshBet || freshBet.day !== bet.day || freshBet.targetId !== bet.targetId || freshBet.amount !== bet.amount) return;

      const oracleBoostPct = won ? getMinorTraitBonusPct(data.equipment, "oracle_boost") : 0;
      const reward = won ? Math.round((freshBet.amount || 0) * 2 * (1 + oracleBoostPct / 100)) : 0;
      const oracleWeeklyQuests = won ? incrementQuestProgress(data.weeklyQuests, "oracle_win", 1) : data.weeklyQuests;
      const oracleMonthlyQuests = won ? incrementQuestProgress(data.monthlyQuests, "oracle_win", 1) : data.monthlyQuests;

      tx.update(ref, {
        scrap: getScrap(data) + reward,
        oracleBet: null,
        ...(won ? { oracleWinsTotal: (data.oracleWinsTotal || 0) + 1 } : {}),
        ...(oracleWeeklyQuests !== data.weeklyQuests ? { weeklyQuests: oracleWeeklyQuests } : {}),
        ...(oracleMonthlyQuests !== data.monthlyQuests ? { monthlyQuests: oracleMonthlyQuests } : {})
      });

      resolvedResult = { won, targetName: freshBet.targetName, amount: freshBet.amount, reward };
    });

    if (resolvedResult) {
      showResultModal({ oracle: true, ...resolvedResult });
    }
  } finally {
    S.oracleResolving = false;
  }
}

