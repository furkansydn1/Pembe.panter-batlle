// ============================================================
// DOM
// ============================================================
export const loginScreen = document.getElementById("loginScreen");
export const loginTabBtn = document.getElementById("loginTabBtn");
export const registerTabBtn = document.getElementById("registerTabBtn");
export const loginFormBox = document.getElementById("loginFormBox");
export const registerFormBox = document.getElementById("registerFormBox");
export const loginUsername = document.getElementById("loginUsername");
export const loginPassword = document.getElementById("loginPassword");
export const loginSubmitBtn = document.getElementById("loginSubmitBtn");
export const registerUsername = document.getElementById("registerUsername");
export const registerPassword = document.getElementById("registerPassword");
export const registerPassword2 = document.getElementById("registerPassword2");
export const registerNick = document.getElementById("registerNick");
export const registerSubmitBtn = document.getElementById("registerSubmitBtn");
export const gameScreen = document.getElementById("gameScreen");
export const loginError = document.getElementById("loginError");

export const tutorialModal = document.getElementById("tutorialModal");
export const legendaryShowcase = document.getElementById("legendaryShowcase");
export const closeTutorialBtn = document.getElementById("closeTutorialBtn");
export const howToBtn = document.getElementById("howToBtn");
export const switchPlayerBtn = document.getElementById("switchPlayerBtn");

export const updatesBtn = document.getElementById("updatesBtn");
export const updatesDot = document.getElementById("updatesDot");
export const updatesModal = document.getElementById("updatesModal");
export const updatesList = document.getElementById("updatesList");
export const closeUpdatesBtn = document.getElementById("closeUpdatesBtn");

export const collectionBtn = document.getElementById("collectionBtn");
export const collectionModal = document.getElementById("collectionModal");
export const collectionList = document.getElementById("collectionList");
export const collectionProgress = document.getElementById("collectionProgress");
export const closeCollectionBtn = document.getElementById("closeCollectionBtn");

export const inventoryModal = document.getElementById("inventoryModal");
export const inventoryModalTitle = document.getElementById("inventoryModalTitle");
export const inventoryList = document.getElementById("inventoryList");
export const closeInventoryBtn = document.getElementById("closeInventoryBtn");

export const viewEquipmentModal = document.getElementById("viewEquipmentModal");
export const viewEquipmentTitle = document.getElementById("viewEquipmentTitle");
export const viewEquipmentGrid = document.getElementById("viewEquipmentGrid");
export const closeViewEquipmentBtn = document.getElementById("closeViewEquipmentBtn");

export const dailyEventBanner = document.getElementById("dailyEventBanner");

export const currentPlayerNameEl = document.getElementById("currentPlayerName");
export const leaderboardEl = document.getElementById("leaderboard");
export const weeklyLeaderboardInfoEl = document.getElementById("weeklyLeaderboardInfo");
export const bagGridEl = document.getElementById("bagGrid");
export const charStageSlotsEl = document.getElementById("charStageSlots");
export const myAttackEl = document.getElementById("myAttack");
export const myDefenseEl = document.getElementById("myDefense");
export const myPointsEl = document.getElementById("myPoints");
export const myScrapEl = document.getElementById("myScrap");
export const myStreakEl = document.getElementById("myStreak");
export const streakChip = document.getElementById("streakChip");
export const myScrapBoxEl = document.getElementById("myScrapBox");
export const myAttackWarEl = document.getElementById("myAttackWar");
export const myDefenseWarEl = document.getElementById("myDefenseWar");
export const myPointsWarEl = document.getElementById("myPointsWar");
export const myScrapWarEl = document.getElementById("myScrapWar");
export const myAttackEnvEl = document.getElementById("myAttackEnv");
export const myDefenseEnvEl = document.getElementById("myDefenseEnv");
export const myPointsEnvEl = document.getElementById("myPointsEnv");
export const myScrapEnvEl = document.getElementById("myScrapEnv");
export const materialsGridEl = document.getElementById("materialsGrid");

// V2 Faz 4: Altın chip'leri (Puan/Hurda ile aynı çoklu-kopya deseni —
// renderMyStats() hepsini tek seferde günceller). myGoldMarketEl ayrıca
// Market sekmesindeki asıl para birimi göstergesi.
export const myGoldBoxEl = document.getElementById("myGoldBox");
export const myGoldWarEl = document.getElementById("myGoldWar");
export const myGoldEnvEl = document.getElementById("myGoldEnv");
export const myGoldMarketEl = document.getElementById("myGoldMarket");

// FADELESS: sabit üst kaynak şeridi — mevcut çoklu-kopya desenine (myGoldBoxEl
// vb.) EK olarak eklendi, hiçbirinin yerine geçmiyor.
export const topPointsValEl = document.getElementById("topPointsVal");
export const topScrapValEl = document.getElementById("topScrapVal");
export const topGoldValEl = document.getElementById("topGoldVal");
export const topEnergyFillEl = document.getElementById("topEnergyFillEl");
export const topEnergyLabelEl = document.getElementById("topEnergyLabelEl");

// V2 Faz 4: Market sekmesi elemanları
export const marketDailyGridEl = document.getElementById("marketDailyGrid");
export const buyNadirChestBtn = document.getElementById("buyNadirChestBtn");
export const buyEfsaneviChestBtn = document.getElementById("buyEfsaneviChestBtn");
export const buyMitikBoxBtn = document.getElementById("buyMitikBoxBtn");
export const buyKabusBoxBtn = document.getElementById("buyKabusBoxBtn");

// V2 Faz 4 (madde 4/5): Oyuncular Arası Pazar + Ticaret Logları elemanları
export const marketListingsGridEl = document.getElementById("marketListingsGrid");
export const myListingsGridEl = document.getElementById("myListingsGrid");
export const tradeLogsFeedEl = document.getElementById("tradeLogsFeed");
export const tradeBanBannerEl = document.getElementById("tradeBanBanner");
export const tradeBanReasonTextEl = document.getElementById("tradeBanReasonText");

// V2 Faz 9: Harita sekmesi elemanları (tier kartları + sonuç kartı + Kâşif Sahnesi)
export const mapTierGridEl = document.getElementById("mapTierGrid");
export const mapResultCardEl = document.getElementById("mapResultCard");
export const mapResultBodyEl = document.getElementById("mapResultBody");
export const mapExplorerSceneEl = document.getElementById("mapExplorerScene");
export const mapExplorerExitBtnEl = document.getElementById("mapExplorerExitBtn");
export const mapExplorerTitleEl = document.getElementById("mapExplorerTitle");


// [V2 Faz 3] Karakter — Seviye/XP/Stat Puanı UI elemanları
export const charLevelBadgeEl = document.getElementById("charLevelBadge");
export const charXpLabelEl = document.getElementById("charXpLabel");
export const charXpFillEl = document.getElementById("charXpFill");
export const charStatPointsRowEl = document.getElementById("charStatPointsRow");
export const charStatPointsCountEl = document.getElementById("charStatPointsCount");
export const charAllocAtkEl = document.getElementById("charAllocAtk");
export const charAllocDefEl = document.getElementById("charAllocDef");
export const statAllocAtkBtn = document.getElementById("statAllocAtkBtn");
export const statAllocDefBtn = document.getElementById("statAllocDefBtn");

// [V2 Faz 3] Seviye atlama animasyonu overlay'i
export const levelUpOverlay = document.getElementById("levelUpOverlay");
export const levelUpConfettiLayer = document.getElementById("levelUpConfettiLayer");
export const levelUpLevelNumberEl = document.getElementById("levelUpLevelNumber");

export const boxWrapper = document.getElementById("boxWrapper");
export const epicChestEl = document.getElementById("epicChest");
export const chestShockwaveEl = document.getElementById("chestShockwaveEl");
export const chestFlashEl = document.getElementById("chestFlashEl");
export const openBoxBtn = document.getElementById("openBoxBtn");
export const boxStatus = document.getElementById("boxStatus");
export const itemPopup = document.getElementById("itemPopup");
export const itemPopupInner = document.getElementById("itemPopupInner");

export const energyBarFill = document.getElementById("energyBarFill");
export const energyStatus = document.getElementById("energyStatus");
export const energyTasksRow = document.getElementById("energyTasksRow");

export const attackTargetsEl = document.getElementById("attackTargets");
export const attackStatus = document.getElementById("attackStatus");

export const questsListEl = document.getElementById("questsList");
export const weeklyQuestsListEl = document.getElementById("weeklyQuestsList");
export const monthlyQuestsListEl = document.getElementById("monthlyQuestsList");

export const topPerformersBanner = document.getElementById("topPerformersBanner");
export const tpBestName = document.getElementById("tpBestName");
export const tpWorstName = document.getElementById("tpWorstName");

export const luckyWheel = document.getElementById("luckyWheel");
export const spinWheelBtn = document.getElementById("spinWheelBtn");
export const wheelStatus = document.getElementById("wheelStatus");
export const wheelScene = document.getElementById("wheelScene");
export const wheelOuter = document.getElementById("wheelOuter");
export const wheelBgGlow = document.getElementById("wheelBgGlow");
export const wheelShockwaveEl = document.getElementById("wheelShockwaveEl");
export const wheelPanelEl = document.getElementById("wheelPanel");

export const bountyActive = document.getElementById("bountyActive");
export const bountyTargetName = document.getElementById("bountyTargetName");
export const bountyAmountEl = document.getElementById("bountyAmount");
export const bountyPlacer = document.getElementById("bountyPlacer");
export const bountyForm = document.getElementById("bountyForm");
export const bountyTargetSelect = document.getElementById("bountyTargetSelect");
export const bountyAmountInput = document.getElementById("bountyAmountInput");
export const placeBountyBtn = document.getElementById("placeBountyBtn");
export const bountyStatus = document.getElementById("bountyStatus");

export const statsOverviewEl = document.getElementById("statsOverview");
export const statsOpponentsEl = document.getElementById("statsOpponents");
export const statsStreakEl = document.getElementById("statsStreak");
export const badgesGridEl = document.getElementById("badgesGrid");
export const badgesProgressEl = document.getElementById("badgesProgress");

export const oraclePending = document.getElementById("oraclePending");
export const oracleTargetLabel = document.getElementById("oracleTargetLabel");
export const oracleAmountLabel = document.getElementById("oracleAmountLabel");
export const oracleForm = document.getElementById("oracleForm");
export const oracleTargetSelect = document.getElementById("oracleTargetSelect");
export const oracleAmountInput = document.getElementById("oracleAmountInput");
export const placeOracleBtn = document.getElementById("placeOracleBtn");
export const oracleStatus = document.getElementById("oracleStatus");

export const newFeaturesModal = document.getElementById("newFeaturesModal");
export const newFeaturesTrack = document.getElementById("newFeaturesTrack");
export const newFeaturesDots = document.getElementById("newFeaturesDots");
export const nfPrevBtn = document.getElementById("nfPrevBtn");
export const nfNextBtn = document.getElementById("nfNextBtn");
export const nfSkipBtn = document.getElementById("nfSkipBtn");
export const nfStepLabel = document.getElementById("nfStepLabel");
export const closeNewFeaturesBtn = document.getElementById("closeNewFeaturesBtn");


// Bir saldırı işlemi (VS animasyonu + gerçek Firestore transaction'ı) sürerken
// true olur. Bu süre boyunca (özellikle mobilde network daha yavaş olduğu için
// birkaç saniye sürebiliyor) S.allPlayers/S.currentPlayerData dinleyicileri araya
// girip renderAttackTargets()'ı tekrar çizerse butonlar yeniden aktif oluyordu;
// bu da aynı saatlik pencerede ikinci bir saldırı denemesine ve "Saldırı
// gönderilemedi" hatasına yol açıyordu. Artık bu kilit açıkken able=false
// zorlanıyor, butonlar hep kapalı kalıyor.

// Düşük güçlü / dokunmatik cihazlarda (çoğunlukla mobil) parçacık efektlerinin
// sayısını azaltarak hissedilen gecikmeyi (jank) düşürmek için kullanılıyor.
export const IS_LOW_POWER = (window.matchMedia && matchMedia("(pointer: coarse)").matches) || window.innerWidth < 480;

// ============================================================
// SALDIRI (VS) EKRANI — DOM referansları
// ============================================================
export const vsModal = document.getElementById("vsModal");
export const vsFrame = document.getElementById("vsFrame");
export const vsBgFlash = document.getElementById("vsBgFlash");
export const vsLightning = document.getElementById("vsLightning");
export const vsSparksLayer = document.getElementById("vsSparksLayer");
export const vsCountdownEl = document.getElementById("vsCountdownEl");
export const vsTensionFill = document.getElementById("vsTensionFill");
export const vsHypeLabel = document.getElementById("vsHypeLabel");
export const vsClashText = document.getElementById("vsClashText");
export const vsBurst = document.getElementById("vsBurst");
export const vsFighterLeft = document.getElementById("vsFighterLeft");
export const vsFighterRight = document.getElementById("vsFighterRight");
export const vsAttackerName = document.getElementById("vsAttackerName");
export const vsAttackerAtk = document.getElementById("vsAttackerAtk");
export const vsAttackerDef = document.getElementById("vsAttackerDef");
export const vsDefenderName = document.getElementById("vsDefenderName");
export const vsDefenderAtk = document.getElementById("vsDefenderAtk");
export const vsDefenderDef = document.getElementById("vsDefenderDef");

export const resultModal = document.getElementById("resultModal");
export const resultContent = document.getElementById("resultContent");
export const closeResultBtn = document.getElementById("closeResultBtn");

export const battleLogEl = document.getElementById("battleLog");

// ============================================================
// v4 CANLI DÜELLO EKRANI — DOM referansları (duel-engine.js sonucunu
// tur tur oynatan kart + can barı + spiker log ekranı)
// ============================================================
export const vsDuelLive = document.getElementById("vsDuelLive");
export const vsDuelCardA = document.getElementById("vsDuelCardA");
export const vsDuelCardB = document.getElementById("vsDuelCardB");
export const vsDuelNameA = document.getElementById("vsDuelNameA");
export const vsDuelNameB = document.getElementById("vsDuelNameB");
export const vsDuelHpFillA = document.getElementById("vsDuelHpFillA");
export const vsDuelHpFillB = document.getElementById("vsDuelHpFillB");
export const vsDuelHpTxtA = document.getElementById("vsDuelHpTxtA");
export const vsDuelHpTxtB = document.getElementById("vsDuelHpTxtB");
export const vsDuelLog = document.getElementById("vsDuelLog");
export const vsDuelResult = document.getElementById("vsDuelResult");
export const vsDuelContinueBtn = document.getElementById("vsDuelContinueBtn");

