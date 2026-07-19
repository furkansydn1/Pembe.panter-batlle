import { showLoginScreen } from "./auth-ui.js";
import { getElo, getLeagueTier, renderAttackTargets } from "./battle.js";
import { renderBoxStatus, renderCharacterStage } from "./box-open.js";
import { BASE_ATTACK, BASE_DEFENSE, ENERGY_MAX, ENERGY_REGEN_MS_PER_POINT, ENERGY_TASKS, getGold, getScrap } from "./core-config.js";
import { badgesGridEl, badgesProgressEl, charAllocAtkEl, charAllocDefEl, charLevelBadgeEl, charStatPointsCountEl, charStatPointsRowEl, charXpFillEl, charXpLabelEl, closeViewEquipmentBtn, collectionModal, currentPlayerNameEl, dailyEventBanner, energyBarFill, energyStatus, energyTasksRow, gameScreen, inventoryModal, leaderboardEl, levelUpConfettiLayer, levelUpLevelNumberEl, levelUpOverlay, loginScreen, materialsGridEl, myAttackEl, myAttackEnvEl, myAttackWarEl, myDefenseEl, myDefenseEnvEl, myDefenseWarEl, myGoldBoxEl, myGoldEnvEl, myGoldMarketEl, myGoldWarEl, myPointsEl, myPointsEnvEl, myPointsWarEl, myScrapBoxEl, myScrapEl, myScrapEnvEl, myScrapWarEl, myStreakEl, statAllocAtkBtn, statAllocDefBtn, statsOpponentsEl, statsOverviewEl, statsStreakEl, streakChip, topEnergyFillEl, topEnergyLabelEl, topGoldValEl, topPerformersBanner, topPointsValEl, topScrapValEl, tpBestName, tpWorstName, viewEquipmentGrid, viewEquipmentModal, viewEquipmentTitle, weeklyLeaderboardInfoEl } from "./dom.js";
import { BADGES, ensurePersonalDailyEventForToday, getTodaysEvent, randInt } from "./events-badges.js";
import { LOG_COL, MARKET_LISTINGS_COL, PLAYERS_COL, TRADE_LOGS_COL, collection, db, doc, getDoc, limit, onSnapshot, orderBy, query, updateDoc } from "./firebase-setup.js";
import { autoUnequipOverleveledItems, renderCollection, renderInventoryModal } from "./inventory.js";
import { BOOK_TIER_ICONS, BOOK_TIER_NAMES, RARITY_ORDER, computeStatsFromEquipment, getBooks, xpNeededForLevel } from "./item-systems.js";
import { SLOTS, itemIconSvg } from "./items-data.js";
import { dateStr, emptyEquipment, formatRemaining, renderMapTab } from "./map.js";
import { renderMarketListingsGrid, renderMarketTab, renderMyListingsPanel, renderTradeBanBanner, renderTradeLogsFeed } from "./market.js";
import { WEEKLY_LEADERBOARD_DOC_ID, ensureDailyMarketForToday, ensureDailyQuestsForToday, ensureMonthlyQuestsForThisMonth, ensureWeeklyLeaderboardReset, ensureWeeklyQuestsForThisWeek, getMsUntilNextSunday, incrementQuestProgress, renderBagGrid, renderQuests } from "./quests.js";
import { S, clearActiveListeners } from "./state.js";
import { maybeShowNewFeatures, maybeShowTutorialV2 } from "./tutorial-updates.js";
import { checkTimeBasedNotifications, renderBattleLog, sfxLevelUp } from "./ui-misc.js";
import { BOUNTY_DOC_ID, META_COL, ensureOracleBetResolved, renderBounty, renderBountyForm, renderOracleForm, renderOraclePanel, renderWheel } from "./wheel-bounty-oracle.js";
import { ensureWorldBossForThisWeek } from "./worldboss.js";

// ============================================================
// OYUN BAŞLATMA
// ============================================================
export async function startGame() {
  clearActiveListeners();
  const ref = doc(db, PLAYERS_COL, S.currentPlayerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    localStorage.removeItem("gacha_player_id");
    S.currentPlayerId = null;
    showLoginScreen();
    return;
  }

  loginScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  currentPlayerNameEl.textContent = snap.data().nick;
  // Girişte mevcut seviyeyi baz alarak ilklendir; böylece ilk snapshot
  // "seviye atladın" animasyonunu yanlışlıkla tetiklemez.
  S.lastKnownLevel = snap.data().level || 1;

  renderDailyEventBanner(snap.data());
  const openedTutorial = maybeShowTutorialV2();
  if (!openedTutorial) maybeShowNewFeatures();
  await ensurePersonalDailyEventForToday(snap.data());
  await ensureDailyQuestsForToday(snap.data());
  await ensureWeeklyQuestsForThisWeek(snap.data());
  await ensureMonthlyQuestsForThisMonth(snap.data());
  await ensureWeeklyLeaderboardReset();
  await ensureWorldBossForThisWeek();
  await ensureDailyMarketForToday(snap.data());

  // Kendi oyuncu belgemi canlı dinle
  S.activeUnsubscribers.push(onSnapshot(ref, (docSnap) => {
    if (!docSnap.exists()) return;
    S.currentPlayerData = { id: docSnap.id, ...docSnap.data() };
    // [Kalıcı fix] Seviyeni aşan takılı eşyaları bir kez otomatik sök (girişte).
    // Yalnızca ilk yüklemede tetiklenir; değişiklik varsa Firestore'a yazar,
    // onSnapshot tekrar çalışır ama __autoUnequipDone bayrağı ikinci kez engeller.
    if (!S.__autoUnequipDone) {
      S.__autoUnequipDone = true;
      autoUnequipOverleveledItems();
    }
    currentPlayerNameEl.textContent = S.currentPlayerData.nick;
    renderMyStats();
    renderCharacterLevel();
    renderBagGrid();
    renderCharacterStage();
    renderBoxStatus();
    renderAttackTargets();
    renderDailyEventBanner();
    renderTradeBanBanner();
    renderMyListingsPanel();
    renderEnergy();
    renderQuests();
    renderWheel();
    renderStatsTab();
    renderBadges();
    renderOraclePanel();
    renderMapTab();
    ensureOracleBetResolved();
    checkTimeBasedNotifications();
    if (!collectionModal.classList.contains("hidden")) renderCollection();
    if (!inventoryModal.classList.contains("hidden")) renderInventoryModal();
  }));

  // Tüm oyuncuları canlı dinle (liderlik tablosu + saldırı hedefleri)
  const playersQuery = query(collection(db, PLAYERS_COL), orderBy("points", "desc"));
  S.activeUnsubscribers.push(onSnapshot(playersQuery, (snap) => {
    S.allPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLeaderboard();
    renderAttackTargets();
    renderTopPerformers();
    renderBountyForm();
    renderOracleForm();
    ensureOracleBetResolved();
  }));

  // Kelle Avcısı ilanını (paylaşımlı doküman) canlı dinle
  S.activeUnsubscribers.push(onSnapshot(doc(db, META_COL, BOUNTY_DOC_ID), (docSnap) => {
    S.currentBounty = docSnap.exists() ? docSnap.data() : null;
    renderBounty();
  }));

  // Haftalık liderlik meta dokümanını (geçen haftanın şampiyonu) canlı dinle
  S.activeUnsubscribers.push(onSnapshot(doc(db, META_COL, WEEKLY_LEADERBOARD_DOC_ID), (docSnap) => {
    S.weeklyLeaderboardMeta = docSnap.exists() ? docSnap.data() : null;
    renderWeeklyLeaderboardInfo();
  }));

  // Savaş geçmişini canlı dinle
  const logQuery = query(collection(db, LOG_COL), orderBy("timestamp", "desc"), limit(40));
  S.activeUnsubscribers.push(onSnapshot(logQuery, (snap) => {
    renderBattleLog(snap.docs.map(d => d.data()));
  }));

  // V2 Faz 4: Pazar listelemelerini ve Ticaret Loglarını canlı dinle.
  // Composite index gerektirmemek için tek alanlı orderBy kullanılıyor,
  // "sadece aktif olanlar" filtresi render fonksiyonunda client-side yapılıyor.
  const marketListingsQuery = query(collection(db, MARKET_LISTINGS_COL), orderBy("createdAt", "desc"), limit(150));
  S.activeUnsubscribers.push(onSnapshot(marketListingsQuery, (snap) => {
    S.allMarketListings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMarketListingsGrid();
    renderMyListingsPanel();
  }));

  const tradeLogsQuery = query(collection(db, TRADE_LOGS_COL), orderBy("timestamp", "desc"), limit(40));
  S.activeUnsubscribers.push(onSnapshot(tradeLogsQuery, (snap) => {
    renderTradeLogsFeed(snap.docs.map(d => d.data()));
  }));
}

// ============================================================
// RENDER: LİDERLİK TABLOSU
// ============================================================
// Geçen haftanın şampiyonu + bir sonraki Pazar 00:00'a kalan süre.
export function renderWeeklyLeaderboardInfo() {
  if (!weeklyLeaderboardInfoEl) return;
  const msLeft = getMsUntilNextSunday();
  const champion = S.weeklyLeaderboardMeta?.lastWinnerName;
  const championPts = S.weeklyLeaderboardMeta?.lastWinnerPoints;
  weeklyLeaderboardInfoEl.innerHTML = `
    ${champion ? `<div class="wl-champion">🏆 Geçen haftanın şampiyonu: <b>${champion}</b> (${championPts} puan) — ödül olarak hurda + garanti nadir eşya kazandı!</div>` : ""}
    <div class="wl-countdown">⏳ Liderlik tablosu her Pazar 00:00'da sıfırlanır, 1. olan hurda + garanti nadir eşya kazanır. Kalan süre: <b>${formatRemaining(msLeft)}</b></div>
  `;
}
setInterval(renderWeeklyLeaderboardInfo, 60000);
// ÖNEMLİ DÜZELTME: ensureWeeklyLeaderboardReset() önceden SADECE startGame()
// içinde, yani girişte bir kez çağrılıyordu. Pazar 00:00'ı uygulama açıkken
// (sekme kapatılmadan) geçiren biri için bu satır bir daha hiç çalışmıyordu;
// sadece yukarıdaki 60 saniyelik interval ekrandaki geri sayımı ("bir sonraki
// pazara ... kaldı") güncellediği için sıfırlama sanki olmuş gibi görünüyordu,
// ama Firestore'daki puanlar hiç sıfırlanmıyordu. Artık oyun açıkken de her
// dakika kontrol ediliyor; hafta değiştiği an (transaction içindeki
// lastProcessedWeek kontrolü sayesinde tek seferlik ve güvenli şekilde) puanlar
// gerçekten sıfırlanıp şampiyon ödülü veriliyor.
setInterval(() => {
  if (S.currentPlayerId) ensureWeeklyLeaderboardReset().catch((e) => console.error("Haftalık sıfırlama kontrolü hatası:", e));
}, 600000);

export function renderLeaderboard() {
  leaderboardEl.innerHTML = S.allPlayers.map((p, i) => {
    const isMe = p.id === S.currentPlayerId;
    const rankClass = i === 0 ? "gold" : "";
    const isThrone = i === 0 && (p.points || 0) > 0;
    const elo = getElo(p);
    const tier = getLeagueTier(elo);
    const level = p.level ?? 1;
    // NAMEPLATE: tüm görsel stil 03-paneller-gorevler.css'teki .nameplate'te.
    // Kademe rengi --np-c değişkeniyle geçiyor, 5 kademe tek CSS bloğuyla boyanıyor.
    const nameplate = `
      <span class="nameplate" style="--np-c:${tier.color};">
        <b class="np-lvl">Sv.${level}</b>
        <span class="np-sep"></span>
        <span class="np-tier">${tier.icon} ${tier.label}</span>
        <span class="np-elo">${elo}</span>
      </span>`;
    const topClass = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
    return `
      <div class="lb-row ${isMe ? "me" : ""} ${topClass}" data-id="${p.id}" ${isMe ? "" : 'style="cursor:pointer;"'}>
        <div class="lb-rank ${rankClass}">${i + 1}</div>
        <div class="lb-info">
          <div class="lb-name">${isThrone ? '<span class="throne-crown" title="1.lik Avı hedefi">👑</span> ' : ""}${p.nick}${isMe ? " (sen)" : ""}</div>
          <div class="lb-stats">⚔️ ${p.attack ?? BASE_ATTACK} &nbsp; 🛡️ ${p.defense ?? BASE_DEFENSE}</div>
          ${nameplate}
        </div>
        <div class="lb-points">${p.points ?? 0}</div>
      </div>`;
  }).join("");

  leaderboardEl.querySelectorAll(".lb-row[data-id]").forEach(row => {
    if (row.classList.contains("me")) return;
    row.onclick = () => {
      const player = S.allPlayers.find(p => p.id === row.getAttribute("data-id"));
      if (player) openViewEquipment(player);
    };
  });
}

// ============================================================
// BAŞKA OYUNCUNUN EKİPMANINI GÖRÜNTÜLEME (salt okunur)
// Herkes birbirinin o an kuşanılı olan eşyalarını görebilsin diye
// liderlik tablosundaki bir oyuncuya tıklanınca açılan salt okunur ekran.
// ============================================================
export function openViewEquipment(player) {
  viewEquipmentTitle.textContent = `🛡️ ${player.nick}'in Ekipmanı`;
  const eq = player.equipment || emptyEquipment();
  viewEquipmentGrid.innerHTML = SLOTS.map(s => {
    const item = eq[s.key];
    const rarityClass = item ? `rarity-${item.rarity}` : "";
    return `
      <div class="equip-slot view-only ${item ? `filled ${rarityClass}` : ""}" style="cursor:default;">
        <div class="equip-slot-icon">${item ? itemIconSvg(s.key, item.rarity, 34) : s.icon}</div>
        <div class="equip-slot-label">${s.label}</div>
        <div class="equip-slot-item ${item ? "" : "empty"}">${item ? item.name : "Boş"}</div>
        ${item ? `<div class="equip-slot-count">⚔️${item.atk} 🛡️${item.def}${item.upgradeLevel ? ` · <b>+${item.upgradeLevel}</b>` : ""}${item.enchantPct ? ` · ✨+%${item.enchantPct}` : ""}${item.minorTrait ? ` · ${item.minorTrait.icon}%${item.minorTrait.pct}` : ""}</div>` : ""}
      </div>`;
  }).join("");
  viewEquipmentModal.classList.remove("hidden");
}
closeViewEquipmentBtn.onclick = () => viewEquipmentModal.classList.add("hidden");

// ============================================================
// RENDER: BENİM İSTATİSTİKLERİM
// ============================================================
export function renderMyStats() {
  if (!S.currentPlayerData) return;
  myAttackEl.textContent = S.currentPlayerData.attack ?? BASE_ATTACK;
  myDefenseEl.textContent = S.currentPlayerData.defense ?? BASE_DEFENSE;
  myPointsEl.textContent = S.currentPlayerData.points ?? 0;
  myScrapEl.textContent = getScrap(S.currentPlayerData);
  if (myScrapBoxEl) myScrapBoxEl.textContent = getScrap(S.currentPlayerData);
  if (myAttackWarEl) myAttackWarEl.textContent = S.currentPlayerData.attack ?? BASE_ATTACK;
  if (myDefenseWarEl) myDefenseWarEl.textContent = S.currentPlayerData.defense ?? BASE_DEFENSE;
  if (myPointsWarEl) myPointsWarEl.textContent = S.currentPlayerData.points ?? 0;
  if (myScrapWarEl) myScrapWarEl.textContent = getScrap(S.currentPlayerData);
  if (myAttackEnvEl) myAttackEnvEl.textContent = S.currentPlayerData.attack ?? BASE_ATTACK;
  if (myDefenseEnvEl) myDefenseEnvEl.textContent = S.currentPlayerData.defense ?? BASE_DEFENSE;
  if (myPointsEnvEl) myPointsEnvEl.textContent = S.currentPlayerData.points ?? 0;
  if (myScrapEnvEl) myScrapEnvEl.textContent = getScrap(S.currentPlayerData);
  if (myGoldBoxEl) myGoldBoxEl.textContent = getGold(S.currentPlayerData);
  if (myGoldWarEl) myGoldWarEl.textContent = getGold(S.currentPlayerData);
  if (myGoldEnvEl) myGoldEnvEl.textContent = getGold(S.currentPlayerData);
  if (myGoldMarketEl) myGoldMarketEl.textContent = getGold(S.currentPlayerData);
  if (topPointsValEl) topPointsValEl.textContent = S.currentPlayerData.points ?? 0;
  if (topScrapValEl) topScrapValEl.textContent = getScrap(S.currentPlayerData);
  if (topGoldValEl) topGoldValEl.textContent = getGold(S.currentPlayerData);
  const streak = S.currentPlayerData.boxStreak ?? 0;
  myStreakEl.textContent = streak;
  streakChip.classList.toggle("hidden", streak < 2);
  renderMaterialsPanel();
  renderMarketTab();
}

// ============================================================
// [V2 Faz 3] RENDER: KARAKTER — SEVİYE / XP / STAT PUANI
// ============================================================
// startGame() içinde oyuncunun mevcut seviyesiyle ilklendirilir; sonraki her
// onSnapshot güncellemesinde seviye bu değerden büyükse "seviye atladın"
// animasyonu tetiklenir. null bırakılırsa (henüz ilklendirilmediyse) ilk
// snapshot'ta animasyon yanlışlıkla tetiklenmez.

export function renderCharacterLevel() {
  if (!S.currentPlayerData || !charLevelBadgeEl) return;
  const level = S.currentPlayerData.level || 1;
  const xp = S.currentPlayerData.xp || 0;
  const needed = xpNeededForLevel(level);
  const statPoints = S.currentPlayerData.statPoints || 0;
  const alloc = S.currentPlayerData.statAllocated || { attack: 0, defense: 0 };

  if (S.lastKnownLevel !== null && level > S.lastKnownLevel) {
    playLevelUpAnimation(level);
  }
  S.lastKnownLevel = level;

  charLevelBadgeEl.textContent = `Seviye ${level}`;
  charXpLabelEl.textContent = `${xp} / ${needed} XP`;
  charXpFillEl.style.width = `${Math.min(100, Math.round((xp / needed) * 100))}%`;

  charStatPointsRowEl.classList.toggle("hidden", statPoints <= 0);
  charStatPointsCountEl.textContent = statPoints;
  charAllocAtkEl.textContent = alloc.attack || 0;
  charAllocDefEl.textContent = alloc.defense || 0;
  statAllocAtkBtn.disabled = statPoints <= 0;
  statAllocDefBtn.disabled = statPoints <= 0;
}

// Bir Stat Puanını kalıcı olarak saldırı veya savunmaya yatırır. Ekipmandan
// bağımsız statAllocated sayacına eklenir, sonra computeStatsFromEquipment
// ile mevcut ekipman bonusuyla (ve varsa set bonusu yüzdesiyle) birleştirilip
// attack/defense alanları güncellenir (bkz. dosya başındaki not: bu ikisi
// her ekipman değişiminde de tekrar hesaplanıyor, statAllocated ise hiç
// sıfırlanmıyor).
export async function allocateStatPoint(stat) {
  if (!S.currentPlayerData) return;
  const available = S.currentPlayerData.statPoints || 0;
  if (available <= 0) return;
  const statAllocated = { ...(S.currentPlayerData.statAllocated || { attack: 0, defense: 0 }) };
  statAllocated[stat] = (statAllocated[stat] || 0) + 1;
  const stats = computeStatsFromEquipment(S.currentPlayerData.equipment || emptyEquipment(), statAllocated);
  statAllocAtkBtn.disabled = true;
  statAllocDefBtn.disabled = true;
  try {
    await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
      statAllocated,
      statPoints: available - 1,
      attack: stats.attack,
      defense: stats.defense,
      speed: stats.speed,
      critStat: stats.critStat,
      maxHp: stats.maxHp,
    });
  } catch (e) {
    console.error("Stat puanı dağıtılamadı:", e.message);
  }
}
if (statAllocAtkBtn) statAllocAtkBtn.onclick = () => allocateStatPoint("attack");
if (statAllocDefBtn) statAllocDefBtn.onclick = () => allocateStatPoint("defense");

// ============================================================
// [V2 Faz 3] SEVİYE ATLAMA ANİMASYONU
// ============================================================

export function spawnLevelUpConfetti() {
  if (!levelUpConfettiLayer) return;
  const colors = ["#ffcc4d", "#ff2d87", "#ff6fb0", "#4dd68a", "#4d9bff", "#fff8fb"];
  const count = 28;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "levelup-confetti-piece";
    const angle = Math.random() * Math.PI * 2;
    const dist = 110 + Math.random() * 170;
    piece.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
    piece.style.setProperty("--ty", `${Math.sin(angle) * dist - 40}px`);
    piece.style.setProperty("--rot", `${Math.round(Math.random() * 720 - 360)}deg`);
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${(Math.random() * 0.15).toFixed(2)}s`;
    levelUpConfettiLayer.appendChild(piece);
    setTimeout(() => piece.remove(), 1900);
  }
}

// "Coşkulu", gelişim hissi veren tam ekran seviye atlama animasyonu: ışın
// patlaması + konfeti + zıplayarak beliren seviye rozeti. renderCharacterLevel()
// tarafından, Firestore'dan gelen level alanı bir öncekinden büyük olduğunda
// otomatik tetiklenir (bkz. S.lastKnownLevel) — XP'nin nereden kazanıldığından
// bağımsız çalışır (savaş, sandık, görev...).
export function playLevelUpAnimation(newLevel) {
  if (!levelUpOverlay) return;
  levelUpLevelNumberEl.textContent = newLevel;
  levelUpOverlay.classList.remove("hidden");
  levelUpOverlay.classList.remove("is-active");
  // Reflow: aynı animasyonun art arda tetiklenmesi durumunda CSS animasyonunu
  // sıfırdan yeniden başlatabilmek için.
  void levelUpOverlay.offsetWidth;
  levelUpOverlay.classList.add("is-active");
  spawnLevelUpConfetti();
  sfxLevelUp();

  clearTimeout(S.levelUpHideTimer);
  S.levelUpHideTimer = setTimeout(() => {
    levelUpOverlay.classList.remove("is-active");
    setTimeout(() => levelUpOverlay.classList.add("hidden"), 400);
  }, 2400);
}
if (levelUpOverlay) {
  levelUpOverlay.onclick = () => {
    clearTimeout(S.levelUpHideTimer);
    levelUpOverlay.classList.remove("is-active");
    setTimeout(() => levelUpOverlay.classList.add("hidden"), 300);
  };
}

// Envanter sekmesindeki Materyaller panelini doldurur: Hurda + 5 tier
// Kitap sayısı, her biri RARITY_ICONS/BOOK_TIER_ICONS placeholder'ıyla
// (bkz. Task 4). .drop-rate-chip mevcut stiliyle aynı görünüme sahip,
// yeni bir CSS sınıfı gerekmiyor.
export function renderMaterialsPanel() {
  if (!materialsGridEl || !S.currentPlayerData) return;
  const books = getBooks(S.currentPlayerData);
  const chips = [
    `<div class="mat-cell"><span class="mc-ico">✨</span><div><span class="mc-n">Hurda</span><span class="mc-v">${getScrap(S.currentPlayerData)}</span></div></div>`,
    ...RARITY_ORDER.map(r =>
      `<div class="mat-cell"><span class="mc-ico">${BOOK_TIER_ICONS[r]}</span><div><span class="mc-n">${BOOK_TIER_NAMES[r]}</span><span class="mc-v">${books[r] || 0}</span></div></div>`)
  ];
  materialsGridEl.innerHTML = chips.join("");
}

// ============================================================
// RENDER: İSTATİSTİK SEKMESİ
// Kariyer boyu kazanma/kaybetme oranı, en çok yendiğin/yenildiğin kişi
// ve en uzun kazanma serin.
// ============================================================
export function renderStatsTab() {
  if (!S.currentPlayerData || !statsOverviewEl) return;
  const s = S.currentPlayerData.stats || {
    totalWins: 0, totalLosses: 0, attackWins: 0, attackLosses: 0,
    defenseWins: 0, defenseLosses: 0, currentStreak: 0, longestStreak: 0,
    winsByOpponent: {}, lossesByOpponent: {}
  };
  const total = s.totalWins + s.totalLosses;
  const winRate = total > 0 ? Math.round((s.totalWins / total) * 100) : 0;

  statsOverviewEl.innerHTML = `
    <div class="stat-summary" style="margin-bottom:6px;">
      <span class="stat-chip pts">🏆 Kazanma: <b>${s.totalWins}</b></span>
      <span class="stat-chip atk">💀 Kaybetme: <b>${s.totalLosses}</b></span>
      <span class="stat-chip def">📈 Oran: <b>%${winRate}</b></span>
    </div>
    <div class="stats-mini-grid">
      <div class="stats-mini-cell"><span>⚔️ Saldırıda</span><b>${s.attackWins}G / ${s.attackLosses}M</b></div>
      <div class="stats-mini-cell"><span>🛡️ Savunmada</span><b>${s.defenseWins}G / ${s.defenseLosses}M</b></div>
    </div>`;

  const opponentEntries = Object.entries(s.winsByOpponent || {});
  const lossEntries = Object.entries(s.lossesByOpponent || {});
  const nameFor = (id) => (S.allPlayers.find(p => p.id === id)?.nick) || "Silinmiş Oyuncu";

  const topBeaten = opponentEntries.sort((a, b) => b[1] - a[1])[0];
  const topBeatenBy = lossEntries.sort((a, b) => b[1] - a[1])[0];

  statsOpponentsEl.innerHTML = `
    <div class="stats-opp-row">
      <span class="stats-opp-icon">🎯</span>
      <div class="stats-opp-body">
        <div class="stats-opp-label">En Çok Yendiğin</div>
        <div class="stats-opp-value">${topBeaten ? `${nameFor(topBeaten[0])} <b>(${topBeaten[1]} kez)</b>` : "Henüz yok"}</div>
      </div>
    </div>
    <div class="stats-opp-row">
      <span class="stats-opp-icon">😵</span>
      <div class="stats-opp-body">
        <div class="stats-opp-label">En Çok Yenildiğin</div>
        <div class="stats-opp-value">${topBeatenBy ? `${nameFor(topBeatenBy[0])} <b>(${topBeatenBy[1]} kez)</b>` : "Henüz yok"}</div>
      </div>
    </div>`;

  statsStreakEl.innerHTML = `
    <div class="stat-summary">
      <span class="stat-chip pts">🔥 Şu Anki Seri: <b>${s.currentStreak}</b></span>
      <span class="stat-chip atk">👑 En Uzun Seri: <b>${s.longestStreak}</b></span>
    </div>`;
}

// ============================================================
// RENDER: ROZETLER
// Tamamen anlık hesaplanır (bkz. BADGES tanımı), ekstra bir doküman
// alanı gerektirmez.
// ============================================================
export function renderBadges() {
  if (!S.currentPlayerData || !badgesGridEl) return;
  const unlocked = BADGES.filter(b => b.check(S.currentPlayerData));
  const unlockedIds = new Set(unlocked.map(b => b.id));

  if (badgesProgressEl) badgesProgressEl.textContent = `${unlocked.length} / ${BADGES.length} rozet kazanıldı`;

  badgesGridEl.innerHTML = BADGES.map(b => {
    const owned = unlockedIds.has(b.id);
    return `
      <div class="badge-chip ${owned ? "owned" : "locked"}">
        <span class="badge-icon">${owned ? b.icon : "🔒"}</span>
        <span class="badge-name">${b.name}</span>
        <span class="badge-desc">${b.desc}</span>
      </div>`;
  }).join("");
}

// ============================================================
// RENDER: KUŞANIM
// ============================================================
// ============================================================
// ENERJİ SİSTEMİ
// ============================================================
// [V2 Faz 6] energyRegenMult desteği eklendi (bkz. DAILY_EVENTS →
// "energetic"/"sluggish" gibi olaylar) — mult ne kadar yüksekse enerji
// puanı başına geçen efektif süre o kadar kısalır.
export function getCurrentEnergy(data) {
  const stored = data.energy ?? ENERGY_MAX;
  const last = data.lastEnergyUpdate || Date.now();
  const event = getTodaysEvent(data);
  const effectiveMsPerPoint = ENERGY_REGEN_MS_PER_POINT / (event.energyRegenMult || 1);
  const regen = Math.floor((Date.now() - last) / effectiveMsPerPoint);
  return Math.min(ENERGY_MAX, stored + regen);
}

export function renderEnergy() {
  if (!S.currentPlayerData) return;
  const current = getCurrentEnergy(S.currentPlayerData);
  energyBarFill.style.width = `${(current / ENERGY_MAX) * 100}%`;
  energyStatus.textContent = `${current} / ${ENERGY_MAX} enerji`;
  if (topEnergyFillEl) topEnergyFillEl.style.width = `${(current / ENERGY_MAX) * 100}%`;
  if (topEnergyLabelEl) topEnergyLabelEl.textContent = `${current}/${ENERGY_MAX}`;
  renderEnergyTasks(current);
}

export function renderEnergyTasks(current) {
  if (!energyTasksRow) return;
  current = current ?? getCurrentEnergy(S.currentPlayerData || { energy: ENERGY_MAX });
  energyTasksRow.innerHTML = ENERGY_TASKS.map(t => `
    <button type="button" class="btn-mini nadir-mini energy-task-btn" data-task="${t.id}" ${current < t.cost ? "disabled" : ""}>
      ${t.icon} ${t.name}
      <span>${t.cost} enerji · ~${t.scrapMin}-${t.scrapMax} hurda</span>
    </button>
  `).join("");

  energyTasksRow.querySelectorAll("button[data-task]").forEach(btn => {
    btn.onclick = () => useEnergyAction(btn.getAttribute("data-task"));
  });
}

export async function useEnergyAction(taskId) {
  if (!S.currentPlayerData) return;
  const task = ENERGY_TASKS.find(t => t.id === taskId);
  if (!task) return;
  const current = getCurrentEnergy(S.currentPlayerData);
  if (current < task.cost) return;

  energyTasksRow.querySelectorAll("button").forEach(b => b.disabled = true);
  const bonus = Math.random() < task.bonusChance;
  const scrapGain = bonus ? task.bonusScrap : randInt(task.scrapMin, task.scrapMax);

  const newQuests = incrementQuestProgress(S.currentPlayerData.dailyQuests, "energy_task", 1);
  const newWeeklyQuests = incrementQuestProgress(S.currentPlayerData.weeklyQuests, "energy_task", 1);
  const newMonthlyQuests = incrementQuestProgress(S.currentPlayerData.monthlyQuests, "energy_task", 1);

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
    energy: current - task.cost,
    lastEnergyUpdate: Date.now(),
    scrap: getScrap(S.currentPlayerData) + scrapGain,
    ...(newQuests !== S.currentPlayerData.dailyQuests ? { dailyQuests: newQuests } : {}),
    ...(newWeeklyQuests !== S.currentPlayerData.weeklyQuests ? { weeklyQuests: newWeeklyQuests } : {}),
    ...(newMonthlyQuests !== S.currentPlayerData.monthlyQuests ? { monthlyQuests: newMonthlyQuests } : {})
  });

  energyStatus.textContent = bonus
    ? `🎉 ${task.name} sırasında şanslı buluş! +${scrapGain} hurda kazandın!`
    : `${task.name}: +${scrapGain} hurda kazandın.`;
  setTimeout(renderEnergy, 1800);
}
setInterval(renderEnergy, 30000);

export function renderDailyEventBanner(data) {
  const event = getTodaysEvent(data || S.currentPlayerData);
  dailyEventBanner.className = `daily-event-banner type-${event.type}`;
  dailyEventBanner.innerHTML = `<span class="event-icon">${event.icon}</span><span class="event-text"><b>${event.title}</b> — ${event.desc}</span>`;
}

// ============================================================
// GÜNÜN YILDIZI / GÜNÜN SÜRTÜĞÜ
// S.allPlayers üzerinden, sadece BUGÜN (dailyStatsDay === bugün) savaşa
// girmiş oyuncular arasında en çok kazanan ve en çok kaybeden bulunur.
// ============================================================
export function renderTopPerformers() {
  if (!topPerformersBanner) return;
  const today = dateStr();
  const activeToday = S.allPlayers.filter(p => p.dailyStatsDay === today && ((p.dailyWins || 0) + (p.dailyLosses || 0)) > 0);

  if (!activeToday.length) {
    tpBestName.textContent = "Henüz kimse savaşmadı";
    tpWorstName.textContent = "Henüz kimse savaşmadı";
    return;
  }

  const bestPlayer = activeToday.reduce((a, b) => (b.dailyWins || 0) > (a.dailyWins || 0) ? b : a, activeToday[0]);
  const worstPlayer = activeToday.reduce((a, b) => (b.dailyLosses || 0) > (a.dailyLosses || 0) ? b : a, activeToday[0]);

  tpBestName.textContent = (bestPlayer.dailyWins || 0) > 0 ? `${bestPlayer.nick} (${bestPlayer.dailyWins} galibiyet)` : "Henüz kimse kazanmadı";
  tpWorstName.textContent = (worstPlayer.dailyLosses || 0) > 0 ? `${worstPlayer.nick} (${worstPlayer.dailyLosses} mağlubiyet)` : "Henüz kimse kaybetmedi";
}

// [V2 Faz 6 — TAMAMLANDI] "Gizemli Yabancı" özelliği (ensureStrangerForToday/
// renderStrangerBanner/strangerDuelBtn akışı + STRANGER_NAMES/
// STRANGER_APPEAR_CHANCE/STRANGER_HURDA_REWARD sabitleri) kalıcı olarak
// kaldırıldı. Oyuncu dokümanındaki eski strangerDay/strangerAvailable/
// strangerUsed/strangerName/strangerWinsTotal alanları YENİ oyuncularda hiç
// yazılmıyor; ESKİ oyuncu dokümanlarında bu alanlar hâlâ durabilir ama artık
// hiçbir kod tarafından okunmuyor/yazılmıyor (zararsız, kullanılmayan veri).
// NOT (index.html/styles.css bu görev kapsamında OKUNMADI): #strangerBanner/
// #strangerName/#strangerDuelBtn DOM elemanları index.html'de hâlâ duruyor
// olabilir, artık hiçbir app.js kodu onlara referans vermiyor — bir sonraki
// UI/temizlik oturumunda o elemanların da HTML/CSS'ten kaldırılması gerekir.

