// ============================================================
// FIREBASE KURULUMU
// Kendi Firebase projenin config bilgilerini buraya yapıştır.
// Firebase Console > Project Settings > General > Your apps > SDK setup and configuration
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  collection, onSnapshot, query, orderBy, limit, serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCNAFsA3hiXwUJYu-KuNelIp-kIiaYjlsc",
  authDomain: "pembe-panter-battle.firebaseapp.com",
  projectId: "pembe-panter-battle",
  storageBucket: "pembe-panter-battle.firebasestorage.app",
  messagingSenderId: "403593143901",
  appId: "1:403593143901:web:93cc90857f3ebc47498fb4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const PLAYERS_COL = "players";
const LOG_COL = "battleLog";
const MAX_PLAYERS = 7;
const BASE_ATTACK = 10;
const BASE_DEFENSE = 10;
const ATTACK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 1 hafta

// ============================================================
// EŞYA VERİLERİ
// ============================================================
const SLOTS = [
  { key: "kask", label: "Kask", icon: "⛑️", type: "def" },
  { key: "zirh", label: "Zırh", icon: "🛡️", type: "def" },
  { key: "kilic", label: "Kılıç", icon: "🗡️", type: "atk" },
  { key: "eldiven", label: "Eldiven", icon: "🧤", type: "atk" },
  { key: "ayakkabi", label: "Ayakkabı", icon: "👢", type: "def" }
];
const SLOT_MAP = Object.fromEntries(SLOTS.map(s => [s.key, s]));

const STANDARD_NAMES = {
  kask: ["Paslı Miğfer", "Deri Başlık", "Çatlak Tolga", "Yamalı Külah", "Bakır Serpuş"],
  zirh: ["Yırtık Cübbe", "Kalın Yelek", "Pamuklu Zırh", "Eski Post", "Keçe Cepken"],
  kilic: ["Paslı Kama", "Kırık Pala", "Tahta Kılıç", "Mutfak Bıçağı", "Eğri Meç"],
  eldiven: ["Yün Eldiven", "Deri Eldiven", "Yamalı Eldiven", "Boks Eldiveni", "Bahçıvan Eldiveni"],
  ayakkabi: ["Eski Terlik", "Delik Çorap", "Lastik Ayakkabı", "Plastik Sandalet", "Keçi Postu Çarık"]
};
const RARE_NAMES = {
  kask: ["Gümüş Miğfer", "Ejder Kafatası Kaskı", "Buz Tacı", "Kartal Kaskı"],
  zirh: ["Çelik Zırh", "Ejder Pulu Zırhı", "Gölge Cübbesi", "Meteor Plakası"],
  kilic: ["Ateş Kılıcı", "Buz Kılıcı", "Şimşek Pala", "Kan İçen Meç"],
  eldiven: ["Demir Pençe", "Kadife Eldiven", "Zehir Eldiveni", "Fırtına Pençesi"],
  ayakkabi: ["Rüzgar Botları", "Çelik Nalın", "Gölge Ayakkabıları", "Kum Fırtınası Çarığı"]
};

// Efsanevi eşyalar - her birinin gerçek oyun içi pasif etkisi var (effect kodu ile).
const LEGENDARY_ITEMS = [
  { name: "Yasin ercile zırhı", slot: "zirh", atk: 4, def: 26, effect: "no_loss_on_defense_lose",
    desc: "Savunmadayken maçı kaybetse bile puanı asla düşmez." },
  { name: "Portakal suyu kılıcı", slot: "kilic", atk: 27, def: 3, effect: "steal_extra_on_big_win",
    desc: "Saldırıda 5'ten fazla güç farkıyla kazanırsa rakipten ekstra 2 puan çalar." },
  { name: "Çingene eldiveni", slot: "eldiven", atk: 25, def: 5, effect: "curse_defense_next",
    desc: "Saldırıda kazanırsa rakibe lanet okur: rakibin bir sonraki savaşında savunması %20 düşer." },
  { name: "Cüce botları", slot: "ayakkabi", atk: 3, def: 24, effect: "revenge_steal",
    desc: "Savunmada kaybetse bile intikam alır, saldırandan 3 puan çalar." },
  { name: "Dana kaskı", slot: "kask", atk: 4, def: 25, effect: "bonus_win_defense",
    desc: "Savunmada kazanırsa normal ödülün üstüne 5 puan daha kazanır." },
  { name: "Sarı diş kılıcı", slot: "kilic", atk: 26, def: 4, effect: "crit_instant_win",
    desc: "Saldırıda %10 ihtimalle güç hesabına bakmadan anında ısırıp kazanır." },
  { name: "Kambur zırhı", slot: "zirh", atk: 3, def: 23, effect: "defense_multiplier",
    desc: "Savunma gücü hesaplamasında %15 fazladan bonus verir." },
  { name: "Yırtık menüsküs ayakkabıları", slot: "ayakkabi", atk: 2, def: 22, effect: "reduced_loss",
    desc: "Savunmada kaybederse sadece 2 puan kaybeder, 5 değil." },
  { name: "Kıl dönmesi kılıcı", slot: "kilic", atk: 24, def: 5, effect: "attack_multiplier",
    desc: "Saldırı gücü hesaplamasında %15 fazladan bonus verir." },
  { name: "Nargile kılıcı", slot: "kilic", atk: 22, def: 6, effect: "chill_risk",
    desc: "Kazanırsa 3 puan fazladan alır, ama %20 ihtimalle nargile keyfine dalıp o hafta saldıramaz." },
  { name: "Yeşil kaş Kaskı", slot: "kask", atk: 3, def: 24, effect: "lucky_defense_roll",
    desc: "Savunmadayken zar atışı 2 katı sayılır, şansı yaver gider." }
];
const LEGENDARY_BY_SLOT = LEGENDARY_ITEMS.reduce((acc, it) => {
  (acc[it.slot] ||= []).push(it);
  return acc;
}, {});

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

function rollRarity() {
  const r = Math.random() * 100;
  if (r < 5) return "efsanevi";
  if (r < 20) return "nadir";
  return "standart";
}

function generateLootItem(slot) {
  const slotInfo = SLOT_MAP[slot];
  const rarity = rollRarity();

  if (rarity === "efsanevi") {
    const options = LEGENDARY_BY_SLOT[slot];
    const base = pick(options);
    return {
      name: base.name, slot, rarity,
      atk: base.atk, def: base.def,
      effect: base.effect, effectDesc: base.desc
    };
  }

  if (rarity === "nadir") {
    const name = pick(RARE_NAMES[slot]);
    const primary = randInt(8, 15);
    const secondary = randInt(1, 4);
    return {
      name, slot, rarity,
      atk: slotInfo.type === "atk" ? primary : secondary,
      def: slotInfo.type === "def" ? primary : secondary,
      effect: null, effectDesc: null
    };
  }

  // standart
  const name = pick(STANDARD_NAMES[slot]);
  const primary = randInt(3, 8);
  const secondary = randInt(0, 2);
  return {
    name, slot, rarity,
    atk: slotInfo.type === "atk" ? primary : secondary,
    def: slotInfo.type === "def" ? primary : secondary,
    effect: null, effectDesc: null
  };
}

function computeStatsFromEquipment(equipment) {
  let atk = BASE_ATTACK, def = BASE_DEFENSE;
  for (const s of SLOTS) {
    const item = equipment?.[s.key];
    if (item) { atk += item.atk || 0; def += item.def || 0; }
  }
  return { attack: atk, defense: def };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function emptyEquipment() {
  return { kask: null, zirh: null, kilic: null, eldiven: null, ayakkabi: null };
}

// ============================================================
// STATE
// ============================================================
let currentPlayerId = localStorage.getItem("gacha_player_id") || null;
let currentPlayerData = null;
let allPlayers = [];

// ============================================================
// DOM
// ============================================================
const loginScreen = document.getElementById("loginScreen");
const gameScreen = document.getElementById("gameScreen");
const playerListLogin = document.getElementById("playerListLogin");
const newPlayerBox = document.getElementById("newPlayerBox");
const newPlayerName = document.getElementById("newPlayerName");
const newPlayerBtn = document.getElementById("newPlayerBtn");
const loginError = document.getElementById("loginError");

const tutorialModal = document.getElementById("tutorialModal");
const legendaryShowcase = document.getElementById("legendaryShowcase");
const closeTutorialBtn = document.getElementById("closeTutorialBtn");
const howToBtn = document.getElementById("howToBtn");
const switchPlayerBtn = document.getElementById("switchPlayerBtn");

const currentPlayerNameEl = document.getElementById("currentPlayerName");
const leaderboardEl = document.getElementById("leaderboard");
const equipmentGridEl = document.getElementById("equipmentGrid");
const myAttackEl = document.getElementById("myAttack");
const myDefenseEl = document.getElementById("myDefense");
const myPointsEl = document.getElementById("myPoints");

const lootBox = document.getElementById("lootBox");
const openBoxBtn = document.getElementById("openBoxBtn");
const boxStatus = document.getElementById("boxStatus");
const itemPopup = document.getElementById("itemPopup");
const itemPopupInner = document.getElementById("itemPopupInner");

const attackTargetsEl = document.getElementById("attackTargets");
const attackStatus = document.getElementById("attackStatus");

const resultModal = document.getElementById("resultModal");
const resultContent = document.getElementById("resultContent");
const closeResultBtn = document.getElementById("closeResultBtn");

const battleLogEl = document.getElementById("battleLog");

// ============================================================
// TUTORIAL
// ============================================================
function renderLegendaryShowcase() {
  legendaryShowcase.innerHTML = LEGENDARY_ITEMS.map(it =>
    `<div class="legendary-chip">${SLOT_MAP[it.slot].icon} ${it.name}</div>`
  ).join("");
}
function maybeShowTutorial() {
  if (!localStorage.getItem("gacha_tutorial_seen")) {
    renderLegendaryShowcase();
    tutorialModal.classList.remove("hidden");
  }
}
closeTutorialBtn.onclick = () => {
  localStorage.setItem("gacha_tutorial_seen", "1");
  tutorialModal.classList.add("hidden");
};
howToBtn.onclick = () => {
  renderLegendaryShowcase();
  tutorialModal.classList.remove("hidden");
};

// ============================================================
// LOGIN / OYUNCU SEÇİMİ
// ============================================================
async function loadPlayersOnce() {
  const snap = await getDocs(collection(db, PLAYERS_COL));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function showLoginScreen() {
  loginScreen.classList.remove("hidden");
  gameScreen.classList.add("hidden");
  loginError.textContent = "";

  const players = await loadPlayersOnce();
  playerListLogin.innerHTML = "";
  players.forEach(p => {
    const btn = document.createElement("button");
    btn.innerHTML = `<span>${p.name}</span><span style="color:var(--gold)">${p.points ?? 0} ⭐</span>`;
    btn.onclick = () => selectPlayer(p.id);
    playerListLogin.appendChild(btn);
  });

  if (players.length >= MAX_PLAYERS) {
    newPlayerBox.classList.add("hidden");
    if (players.length > 0) {
      const note = document.createElement("p");
      note.className = "login-sub";
      note.textContent = "7 oyuncu kontenjanı dolu, listeden ismini seç.";
      playerListLogin.appendChild(note);
    }
  } else {
    newPlayerBox.classList.remove("hidden");
  }
}

newPlayerBtn.onclick = async () => {
  const name = newPlayerName.value.trim();
  if (!name) { loginError.textContent = "Bir isim yaz kral."; return; }
  if (name.length > 16) { loginError.textContent = "İsim çok uzun."; return; }

  const players = await loadPlayersOnce();
  if (players.length >= MAX_PLAYERS) { loginError.textContent = "Kontenjan dolu (7/7)."; return; }
  if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    loginError.textContent = "Bu isim zaten alınmış."; return;
  }

  newPlayerBtn.disabled = true;
  try {
    const newDoc = await addDoc(collection(db, PLAYERS_COL), {
      name,
      points: 0,
      attack: BASE_ATTACK,
      defense: BASE_DEFENSE,
      equipment: emptyEquipment(),
      lastBoxOpenDate: null,
      lastAttackTime: 0,
      curseNextAttack: null,
      createdAt: serverTimestamp()
    });
    selectPlayer(newDoc.id);
  } catch (e) {
    loginError.textContent = "Bir hata oldu: " + e.message;
  } finally {
    newPlayerBtn.disabled = false;
  }
};

function selectPlayer(id) {
  currentPlayerId = id;
  localStorage.setItem("gacha_player_id", id);
  startGame();
}

switchPlayerBtn.onclick = () => {
  localStorage.removeItem("gacha_player_id");
  currentPlayerId = null;
  currentPlayerData = null;
  showLoginScreen();
};

// ============================================================
// OYUN BAŞLATMA
// ============================================================
async function startGame() {
  const ref = doc(db, PLAYERS_COL, currentPlayerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    localStorage.removeItem("gacha_player_id");
    currentPlayerId = null;
    showLoginScreen();
    return;
  }

  loginScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  currentPlayerNameEl.textContent = snap.data().name;

  maybeShowTutorial();

  // Kendi oyuncu belgemi canlı dinle
  onSnapshot(ref, (docSnap) => {
    if (!docSnap.exists()) return;
    currentPlayerData = { id: docSnap.id, ...docSnap.data() };
    renderMyStats();
    renderEquipment();
    renderBoxStatus();
    renderAttackTargets();
  });

  // Tüm oyuncuları canlı dinle (liderlik tablosu + saldırı hedefleri)
  const playersQuery = query(collection(db, PLAYERS_COL), orderBy("points", "desc"));
  onSnapshot(playersQuery, (snap) => {
    allPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLeaderboard();
    renderAttackTargets();
  });

  // Savaş geçmişini canlı dinle
  const logQuery = query(collection(db, LOG_COL), orderBy("timestamp", "desc"), limit(40));
  onSnapshot(logQuery, (snap) => {
    renderBattleLog(snap.docs.map(d => d.data()));
  });
}

// ============================================================
// RENDER: LİDERLİK TABLOSU
// ============================================================
function renderLeaderboard() {
  leaderboardEl.innerHTML = allPlayers.map((p, i) => {
    const isMe = p.id === currentPlayerId;
    const rankClass = i === 0 ? "gold" : "";
    return `
      <div class="lb-row ${isMe ? "me" : ""}">
        <div class="lb-rank ${rankClass}">${i + 1}</div>
        <div class="lb-info">
          <div class="lb-name">${p.name}${isMe ? " (sen)" : ""}</div>
          <div class="lb-stats">⚔️ ${p.attack ?? BASE_ATTACK} &nbsp; 🛡️ ${p.defense ?? BASE_DEFENSE}</div>
        </div>
        <div class="lb-points">${p.points ?? 0}</div>
      </div>`;
  }).join("");
}

// ============================================================
// RENDER: BENİM İSTATİSTİKLERİM
// ============================================================
function renderMyStats() {
  if (!currentPlayerData) return;
  myAttackEl.textContent = currentPlayerData.attack ?? BASE_ATTACK;
  myDefenseEl.textContent = currentPlayerData.defense ?? BASE_DEFENSE;
  myPointsEl.textContent = currentPlayerData.points ?? 0;
}

// ============================================================
// RENDER: KUŞANIM
// ============================================================
function renderEquipment() {
  const eq = currentPlayerData?.equipment || emptyEquipment();
  equipmentGridEl.innerHTML = SLOTS.map(s => {
    const item = eq[s.key];
    const rarityClass = item ? `rarity-${item.rarity}` : "";
    return `
      <div class="equip-slot ${item ? "filled" : ""} ${rarityClass}">
        <div class="equip-slot-icon">${s.icon}</div>
        <div class="equip-slot-label">${s.label}</div>
        <div class="equip-slot-item ${item ? "" : "empty"}">${item ? item.name : "Boş"}</div>
      </div>`;
  }).join("");
}

// ============================================================
// KUTU AÇMA
// ============================================================
function renderBoxStatus() {
  const opened = currentPlayerData?.lastBoxOpenDate === todayStr();
  openBoxBtn.disabled = opened;
  boxStatus.textContent = opened
    ? "Bugünlük kutunu açtın, yarın tekrar gel."
    : "Günde 1 kez kutu açabilirsin.";
}

openBoxBtn.onclick = async () => {
  if (!currentPlayerData) return;
  if (currentPlayerData.lastBoxOpenDate === todayStr()) return;

  openBoxBtn.disabled = true;
  itemPopup.classList.add("hidden");

  const slot = pick(SLOTS).key;
  const item = generateLootItem(slot);

  lootBox.className = `loot-box burst-${item.rarity}`;

  // Kutu titresin, patlasın, sonra eşya zıplayarak gelsin
  await new Promise(r => setTimeout(r, 1250));

  itemPopupInner.className = `item-popup-inner rarity-${item.rarity}`;
  itemPopupInner.innerHTML = `
    <div class="item-popup-icon">${SLOT_MAP[item.slot].icon}</div>
    <div class="item-popup-name rarity-${item.rarity}">${item.name}</div>
    <div class="item-popup-stats">⚔️ +${item.atk} &nbsp; 🛡️ +${item.def} &nbsp; · ${item.rarity.toUpperCase()}</div>
    ${item.effectDesc ? `<div class="item-popup-passive">✨ ${item.effectDesc}</div>` : ""}
  `;
  itemPopup.classList.remove("hidden");

  // Firestore güncelle: eşyayı kuşan, statları yeniden hesapla
  const newEquipment = { ...(currentPlayerData.equipment || emptyEquipment()), [slot]: item };
  const stats = computeStatsFromEquipment(newEquipment);

  await updateDoc(doc(db, PLAYERS_COL, currentPlayerId), {
    equipment: newEquipment,
    attack: stats.attack,
    defense: stats.defense,
    lastBoxOpenDate: todayStr()
  });

  lootBox.className = "loot-box";

  setTimeout(() => itemPopup.classList.add("hidden"), 3500);
};

// ============================================================
// SALDIRI HEDEFLERİ
// ============================================================
function canAttackNow() {
  if (!currentPlayerData) return false;
  const last = currentPlayerData.lastAttackTime || 0;
  return Date.now() - last >= ATTACK_COOLDOWN_MS;
}

function renderAttackTargets() {
  if (!currentPlayerData) return;
  const able = canAttackNow();

  if (!able) {
    const last = currentPlayerData.lastAttackTime || 0;
    const remainMs = ATTACK_COOLDOWN_MS - (Date.now() - last);
    const days = Math.max(0, Math.ceil(remainMs / (24 * 60 * 60 * 1000)));
    attackStatus.textContent = last === 0
      ? "Saldırı hakkın hazır!"
      : `Bu haftaki saldırı hakkını kullandın. ~${days} gün sonra tekrar saldırabilirsin.`;
  } else {
    attackStatus.textContent = "Haftalık saldırı hakkın hazır, birini seç!";
  }

  const targets = allPlayers.filter(p => p.id !== currentPlayerId);
  attackTargetsEl.innerHTML = targets.map(p => `
    <div class="attack-target-row">
      <div class="name">${p.name}</div>
      <div class="stats">⚔️${p.attack ?? BASE_ATTACK} 🛡️${p.defense ?? BASE_DEFENSE} · ${p.points ?? 0}⭐</div>
      <button data-id="${p.id}" ${able ? "" : "disabled"} style="${able ? "" : "opacity:.35;cursor:not-allowed;"}">Saldır</button>
    </div>
  `).join("");

  attackTargetsEl.querySelectorAll("button[data-id]").forEach(btn => {
    btn.onclick = () => runAttack(btn.getAttribute("data-id"));
  });
}

// ============================================================
// SAVAŞ ALGORİTMASI
// Statlar belirleyici, zar sadece küçük bir sürpriz.
// (Güç * 0.8) + (1-10 arası zar)  -- efsanevi pasifler bunun üstüne binebilir.
// ============================================================
function getEffect(equipment, effectName) {
  for (const s of SLOTS) {
    const item = equipment?.[s.key];
    if (item && item.effect === effectName) return item;
  }
  return null;
}

async function runAttack(defenderId) {
  attackTargetsEl.querySelectorAll("button").forEach(b => b.disabled = true);

  try {
    await runTransaction(db, async (tx) => {
      const attackerRef = doc(db, PLAYERS_COL, currentPlayerId);
      const defenderRef = doc(db, PLAYERS_COL, defenderId);
      const attackerSnap = await tx.get(attackerRef);
      const defenderSnap = await tx.get(defenderRef);
      if (!attackerSnap.exists() || !defenderSnap.exists()) throw new Error("Oyuncu bulunamadı.");

      const attacker = attackerSnap.data();
      const defender = defenderSnap.data();

      if (Date.now() - (attacker.lastAttackTime || 0) < ATTACK_COOLDOWN_MS) {
        throw new Error("Bu haftaki saldırı hakkını zaten kullandın.");
      }

      const logDetails = [];
      const legendaryLog = [];

      // --- Nargile kılıcı: %20 ihtimalle saldıramaz ---
      const chillItem = getEffect(attacker.equipment, "chill_risk");
      if (chillItem && Math.random() < 0.2) {
        tx.update(attackerRef, { lastAttackTime: Date.now() });
        logDetails.push(`${attacker.name}, Nargile Kılıcı'nın keyfine daldı ve saldıramadan haftasını harcadı.`);
        tx.set(doc(collection(db, LOG_COL)), {
          attacker: attacker.name, defender: defender.name,
          message: logDetails.join(" "),
          winner: null, legendary: true,
          timestamp: Date.now()
        });
        return { skipped: true };
      }

      // --- Temel güç hesaplama ---
      let attackPower = attacker.attack * 0.8;
      let defensePower = defender.defense * 0.8;

      // Lanet: defender bir önceki saldırıdan lanetliyse savunması düşer
      if (defender.curseNextAttack && defender.curseNextAttack.active) {
        defensePower *= (1 - defender.curseNextAttack.reduction);
        legendaryLog.push(`${defender.name} üzerindeki Çingene Eldiveni laneti devreye girdi, savunması zayıfladı.`);
      }

      // Kambur zırhı / Kıl dönmesi kılıcı çarpanları
      if (getEffect(defender.equipment, "defense_multiplier")) {
        defensePower *= 1.15;
        legendaryLog.push(`${defender.name}'in Kambur Zırhı savunmasını güçlendirdi.`);
      }
      if (getEffect(attacker.equipment, "attack_multiplier")) {
        attackPower *= 1.15;
        legendaryLog.push(`${attacker.name}'in Kıl Dönmesi Kılıcı saldırısını güçlendirdi.`);
      }

      // Zarlar
      let attackerRoll = randInt(1, 10);
      let defenderRoll = randInt(1, 10);

      // Yeşil kaş kaskı: savunma zarı 2 katı
      if (getEffect(defender.equipment, "lucky_defense_roll")) {
        defenderRoll *= 2;
        legendaryLog.push(`${defender.name}'in Yeşil Kaş Kaskı şansı yaver gitti, zarı 2 katına çıktı.`);
      }

      attackPower += attackerRoll;
      defensePower += defenderRoll;

      // Sarı diş kılıcı: %10 anında kazanma
      const critItem = getEffect(attacker.equipment, "crit_instant_win");
      let attackerWins;
      let critTriggered = false;
      if (critItem && Math.random() < 0.1) {
        attackerWins = true;
        critTriggered = true;
        legendaryLog.push(`${attacker.name}'in Sarı Diş Kılıcı aniden ısırdı, hesaplama boşa gitti ve anında kazandı!`);
      } else {
        attackerWins = attackPower >= defensePower;
      }

      const diff = Math.abs(attackPower - defensePower);

      let attackerPoints = attacker.points || 0;
      let defenderPoints = defender.points || 0;

      let newCurseForDefenderTarget = null; // çingene eldiveni tetiklenirse rakibe (sıradaki savunmasına) yansır

      if (attackerWins) {
        let winPts = 10, losePts = 5;

        // Portakal suyu kılıcı: fark 5'ten büyükse ekstra 2 çalar
        if (!critTriggered && getEffect(attacker.equipment, "steal_extra_on_big_win") && diff > 5) {
          winPts += 2; losePts += 2;
          legendaryLog.push(`${attacker.name}'in Portakal Suyu Kılıcı ezici farktan ekstra 2 puan çaldı.`);
        }
        // Nargile kılıcı: kazanırsa +3 ekstra
        if (getEffect(attacker.equipment, "chill_risk")) {
          winPts += 3;
          legendaryLog.push(`${attacker.name}'in Nargile Kılıcı keyifli bir zafer bonusu verdi (+3).`);
        }
        // Yasin ercile zırhı: defender kaybetse de puan kaybetmez
        if (getEffect(defender.equipment, "no_loss_on_defense_lose")) {
          losePts = 0;
          legendaryLog.push(`${defender.name}'in Yasin Ercile Zırhı sayesinde hiç puan kaybetmedi.`);
        }
        // Yırtık menüsküs: kaybederse sadece 2 kaybeder
        else if (getEffect(defender.equipment, "reduced_loss")) {
          losePts = Math.min(losePts, 2);
          legendaryLog.push(`${defender.name}'in Yırtık Menüsküs Ayakkabıları sayesinde daha az puan kaybetti.`);
        }
        // Cüce botları: defender kaybetse bile intikamla 3 puan çalar
        if (getEffect(defender.equipment, "revenge_steal")) {
          winPts = Math.max(0, winPts - 3);
          defenderPoints += 3;
          legendaryLog.push(`${defender.name}'in Cüce Botları intikam alıp saldırandan 3 puan çaldı.`);
        }

        attackerPoints += winPts;
        defenderPoints = Math.max(0, defenderPoints - losePts);

        // Çingene eldiveni: kazanırsa rakibe lanet
        if (getEffect(attacker.equipment, "curse_defense_next")) {
          newCurseForDefenderTarget = { active: true, reduction: 0.2 };
          legendaryLog.push(`${attacker.name}'in Çingene Eldiveni ${defender.name}'e lanet okudu.`);
        }

        logDetails.push(`${attacker.name}, ${defender.name}'e saldırdı ve kazandı! (+${winPts} / -${losePts})`);
      } else {
        let winPts = 10, losePts = 5;

        // Dana kaskı: savunmada kazanırsa +5 ekstra
        if (getEffect(defender.equipment, "bonus_win_defense")) {
          winPts += 5;
          legendaryLog.push(`${defender.name}'in Dana Kaskı savunma zaferine +5 bonus kattı.`);
        }

        defenderPoints += winPts;
        attackerPoints = Math.max(0, attackerPoints - losePts);

        logDetails.push(`${attacker.name}, ${defender.name}'e saldırdı ama kaybetti! (${defender.name} +${winPts} / ${attacker.name} -${losePts})`);
      }

      // Attacker'ın kendi laneti varsa bu savaşta kullanılmış olur (temizle)
      const attackerCurseClear = attacker.curseNextAttack ? null : undefined;

      tx.update(attackerRef, {
        points: attackerPoints,
        lastAttackTime: Date.now(),
        ...(attacker.curseNextAttack ? { curseNextAttack: null } : {})
      });
      tx.update(defenderRef, {
        points: defenderPoints,
        ...(newCurseForDefenderTarget ? { curseNextAttack: newCurseForDefenderTarget } : {})
      });

      const fullMessage = [...logDetails, ...legendaryLog].join(" ");
      tx.set(doc(collection(db, LOG_COL)), {
        attacker: attacker.name,
        defender: defender.name,
        message: fullMessage,
        winner: attackerWins ? attacker.name : defender.name,
        legendary: legendaryLog.length > 0,
        timestamp: Date.now()
      });

      return {
        skipped: false,
        attackerWins, attackPower: Math.round(attackPower), defensePower: Math.round(defensePower),
        message: fullMessage, legendaryLog
      };
    }).then(result => {
      if (result && !result.skipped) showResultModal(result);
      else if (result && result.skipped) showResultModal({ skipped: true });
    });
  } catch (e) {
    alert("Saldırı gönderilemedi: " + e.message);
  } finally {
    renderAttackTargets();
  }
}

function showResultModal(result) {
  if (result.skipped) {
    resultContent.innerHTML = `
      <div class="result-title lose">💨 Nargile Keyfi</div>
      <p class="result-line">Bu hafta saldıramadan haftan geçti.</p>`;
  } else {
    const won = result.attackerWins;
    resultContent.innerHTML = `
      <div class="result-title ${won ? "win" : "lose"}">${won ? "🏆 Kazandın!" : "💀 Kaybettin!"}</div>
      <p class="result-line">Senin Gücün: ${result.attackPower} &nbsp;|&nbsp; Rakip Gücü: ${result.defensePower}</p>
      ${result.legendaryLog.length ? `<div class="result-passive">${result.legendaryLog.join("<br>")}</div>` : ""}
    `;
  }
  resultModal.classList.remove("hidden");
}
closeResultBtn.onclick = () => resultModal.classList.add("hidden");

// ============================================================
// RENDER: SAVAŞ GEÇMİŞİ
// ============================================================
function renderBattleLog(entries) {
  if (!entries.length) {
    battleLogEl.innerHTML = `<p class="box-status">Henüz savaş yok, ilk saldırıyı sen yap!</p>`;
    return;
  }
  battleLogEl.innerHTML = entries.map(e => {
    const cls = e.legendary ? "legendary-trigger" : (e.winner ? "win" : "");
    const time = e.timestamp ? new Date(e.timestamp).toLocaleString("tr-TR") : "";
    return `<div class="log-entry ${cls}">${e.message}<span class="log-time">${time}</span></div>`;
  }).join("");
}

// ============================================================
// BAŞLAT
// ============================================================
if (currentPlayerId) {
  startGame().catch(() => showLoginScreen());
} else {
  showLoginScreen();
}
