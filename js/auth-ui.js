import { BASE_ATTACK, BASE_DEFENSE, ENERGY_MAX, createPasswordRecord, normalizeUsername, verifyPasswordRecord } from "./core-config.js";
import { gameScreen, loginError, loginFormBox, loginPassword, loginScreen, loginSubmitBtn, loginTabBtn, loginUsername, registerFormBox, registerNick, registerPassword, registerPassword2, registerSubmitBtn, registerTabBtn, registerUsername, switchPlayerBtn } from "./dom.js";
import { MAX_PLAYERS, PLAYERS_COL, addDoc, collection, db, getDocs, query, serverTimestamp, where } from "./firebase-setup.js";
import { startGame } from "./game-core.js";
import { emptyBooks } from "./item-systems.js";
import { emptyEquipment } from "./map.js";
import { S, clearActiveListeners } from "./state.js";

// ============================================================
// LOGIN / KAYIT (Kullanıcı Adı + Şifre)
// ------------------------------------------------------------
// `username`/`usernameLower`: sadece giriş için, oyunda hiçbir yerde
// gösterilmez. `nick`/`nickLower`: oyun içinde herkese görünen isim,
// login kullanıcı adından tamamen bağımsız ve Profil sekmesinden
// istenildiği zaman değiştirilebilir. Şifreler asla düz metin
// tutulmuyor, bkz. yukarıdaki "ŞİFRE HASH'LEME" bloğu.
// ============================================================
export async function loadPlayersOnce() {
  const snap = await getDocs(collection(db, PLAYERS_COL));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function setAuthTab(mode) {
  loginError.textContent = "";
  const isLogin = mode === "login";
  loginTabBtn.classList.toggle("active", isLogin);
  registerTabBtn.classList.toggle("active", !isLogin);
  loginFormBox.classList.toggle("hidden", !isLogin);
  registerFormBox.classList.toggle("hidden", isLogin);
}
loginTabBtn.onclick = () => setAuthTab("login");
registerTabBtn.onclick = () => setAuthTab("register");

export async function showLoginScreen() {
  loginScreen.classList.remove("hidden");
  gameScreen.classList.add("hidden");
  loginError.textContent = "";
  loginPassword.value = "";
  registerPassword.value = "";
  registerPassword2.value = "";
  setAuthTab("login");
}

export async function findPlayerByUsername(usernameLower) {
  const q = query(collection(db, PLAYERS_COL), where("usernameLower", "==", usernameLower));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function findPlayerByNick(nickLower) {
  const q = query(collection(db, PLAYERS_COL), where("nickLower", "==", nickLower));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

loginSubmitBtn.onclick = async () => {
  const usernameLower = normalizeUsername(loginUsername.value);
  const password = loginPassword.value;
  if (!usernameLower) { loginError.textContent = "Kullanıcı adını yaz."; return; }
  if (!password) { loginError.textContent = "Şifreni yaz."; return; }

  loginSubmitBtn.disabled = true;
  loginError.textContent = "";
  try {
    const player = await findPlayerByUsername(usernameLower);
    if (!player) { loginError.textContent = "Kullanıcı adı veya şifre hatalı."; return; }
    const ok = await verifyPasswordRecord(password, player.passwordSalt, player.passwordHash);
    if (!ok) { loginError.textContent = "Kullanıcı adı veya şifre hatalı."; return; }
    selectPlayer(player.id);
  } catch (e) {
    loginError.textContent = "Bir hata oldu: " + e.message;
  } finally {
    loginSubmitBtn.disabled = false;
  }
};
loginPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") loginSubmitBtn.onclick(); });

registerSubmitBtn.onclick = async () => {
  const usernameRaw = registerUsername.value.trim();
  const usernameLower = normalizeUsername(usernameRaw);
  const password = registerPassword.value;
  const password2 = registerPassword2.value;
  const nick = registerNick.value.trim();
  const nickLower = nick.toLowerCase();

  if (!usernameLower) { loginError.textContent = "Bir kullanıcı adı yaz kral."; return; }
  if (usernameLower.length < 3 || usernameLower.length > 24) { loginError.textContent = "Kullanıcı adı 3-24 karakter olmalı."; return; }
  if (!/^[a-z0-9_.]+$/.test(usernameLower)) { loginError.textContent = "Kullanıcı adı sadece harf, rakam, _ ve . içerebilir."; return; }
  if (!nick) { loginError.textContent = "Bir Nick belirle (oyunda görünecek isim)."; return; }
  if (nick.length > 16) { loginError.textContent = "Nick çok uzun (max 16 karakter)."; return; }
  if (password.length < 6) { loginError.textContent = "Şifre en az 6 karakter olmalı."; return; }
  if (password !== password2) { loginError.textContent = "Şifreler eşleşmiyor."; return; }

  registerSubmitBtn.disabled = true;
  loginError.textContent = "";
  try {
    const players = await loadPlayersOnce();
    if (players.length >= MAX_PLAYERS) { loginError.textContent = `Kontenjan dolu (${MAX_PLAYERS}/${MAX_PLAYERS}).`; return; }
    if (players.some(p => p.usernameLower === usernameLower)) {
      loginError.textContent = "Bu kullanıcı adı zaten alınmış."; return;
    }
    if (players.some(p => p.nickLower === nickLower)) {
      loginError.textContent = "Bu Nick zaten alınmış, başka bir tane seç."; return;
    }

    const { passwordSalt, passwordHash } = await createPasswordRecord(password);
    const newDoc = await addDoc(collection(db, PLAYERS_COL), {
      username: usernameRaw,
      usernameLower,
      passwordSalt,
      passwordHash,
      nick,
      nickLower,
      points: 0,
      attack: BASE_ATTACK,
      defense: BASE_DEFENSE,
      level: 1,
      xp: 0,
      statPoints: 0,
      statAllocated: { attack: 0, defense: 0 },
      equipment: emptyEquipment(),
      inventory: { kask: [], zirh: [], kalkan: [], kilic: [], eldiven: [], kupe: [], kolye: [], ayakkabi: [], ring: [] },
      lastBoxOpenTime: 0,
      lastAttackTime: 0,
      lastAttackWindow: -1,
      curseNextAttack: null,
      scrap: 0,
      books: emptyBooks(),
      energy: ENERGY_MAX,
      lastEnergyUpdate: Date.now(),
      pityRare: 0,
      pityLegendary: 0,
      boxStreak: 0,
      lastBoxOpenDay: null,
      recentSlots: [],
      lastAttackedId: null,
      attackStreakOnTarget: 0,
      targetCooldowns: {},
      discoveredItems: [],
      lastWheelSpinTime: 0,
      oracleBet: null,
      dailyStatsDay: null,
      dailyWins: 0,
      dailyLosses: 0,
      weeklyQuests: [],
      questsWeek: null,
      monthlyQuests: [],
      questsMonth: null,
      totalBoxesOpened: 0,
      oracleWinsTotal: 0,
      bountyWinsTotal: 0,
      wheelJackpotsTotal: 0,
      weeklyChampionCount: 0,
      stats: {
        totalWins: 0,
        totalLosses: 0,
        attackWins: 0,
        attackLosses: 0,
        defenseWins: 0,
        defenseLosses: 0,
        currentStreak: 0,
        longestStreak: 0,
        winsByOpponent: {},
        lossesByOpponent: {}
      },
      createdAt: serverTimestamp()
    });
    selectPlayer(newDoc.id);
  } catch (e) {
    loginError.textContent = "Bir hata oldu: " + e.message;
  } finally {
    registerSubmitBtn.disabled = false;
  }
};
registerPassword2.addEventListener("keydown", (e) => { if (e.key === "Enter") registerSubmitBtn.onclick(); });

export function selectPlayer(id) {
  S.currentPlayerId = id;
  localStorage.setItem("gacha_player_id", id);
  startGame();
}

switchPlayerBtn.onclick = () => {
  clearActiveListeners();
  localStorage.removeItem("gacha_player_id");
  S.currentPlayerId = null;
  S.currentPlayerData = null;
  showLoginScreen();
};

