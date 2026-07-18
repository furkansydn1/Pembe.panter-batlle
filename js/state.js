// ============================================================
// PAYLAŞILAN STATE
// Tüm modüllerin ortak kullandığı canlı oyun durumu. ES modül
// import'ları salt-okunur bağlandığı için mutable state tek bir
// S objesinde tutulur; her yerden S.currentPlayerData gibi erişilir.
// ============================================================
export const S = {
  currentPlayerId: localStorage.getItem("gacha_player_id") || null,
  currentPlayerData: null,
  allPlayers: [],
  allMarketListings: [],
  activeUnsubscribers: [],
  currentBounty: null,
  weeklyLeaderboardMeta: null,
  attackInProgress: false,
  currentInventorySlot: null,
  lastKnownLevel: null,
  levelUpHideTimer: null,
  oracleResolving: false,
  vsHypeInterval: null,
  audioCtx: null,
  soundOn: localStorage.getItem("gacha_sound_on") !== "0",
  notifOn: localStorage.getItem("gacha_notif_on") === "1",
  notifiedBoxOpenTime: null,
  notifiedAttackWindow: null,
};

// Oyuncu değişiminde eski onSnapshot dinleyicilerini kapatır (race condition önlemi).
export function clearActiveListeners() {
  S.activeUnsubscribers.forEach(unsub => { try { unsub(); } catch (e) { /* zaten kapanmış olabilir */ } });
  S.activeUnsubscribers = [];
}
