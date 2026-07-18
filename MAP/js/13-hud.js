// ============================================================
// 13-hud.js — HUD KÖPRÜSÜ
// Mevcut JS dosyalarına DOKUNMADAN yeni arayüzü canlı tutar.
// Diğer dosyalar sadece hpLabel/dustLabel vb. textContent'ini
// güncellemeye devam eder; burası o değişiklikleri yakalayıp
// barlara ve parlama animasyonlarına çevirir.
// ============================================================

// ---- Yeni kaynaklar (Altın, Hurda, EXP, Kitap) ----
// İstersen diğer dosyalardan doğrudan bu fonksiyonları çağırabilirsin:
//   addGold(5);  addScrap(2);  addExp(10);  addBook(1);
let playerGold = 0;
let playerScrap = 0;
let playerExp = 0;
let playerExpMax = 100;
let playerLevel = 1;
let sessionBooks = 0;

const goldLabelEl   = document.getElementById("goldLabel");
const scrapLabelEl  = document.getElementById("scrapLabel");
const expLabelEl    = document.getElementById("expLabel");
const expMaxLabelEl = document.getElementById("expMaxLabel");
const levelLabelEl  = document.getElementById("levelLabel");
const bookLabelEl   = document.getElementById("bookLabel");
const hpBarFillEl   = document.getElementById("hpBarFill");
const expBarFillEl  = document.getElementById("expBarFill");
const hpMaxLabelEl  = document.getElementById("hpMaxLabel");

function bumpEl(el){
  const chip = el.closest(".res-chip, .loot-slot");
  if (!chip) return;
  chip.classList.remove("bump");
  void chip.offsetWidth; // animasyonu yeniden tetikle
  chip.classList.add("bump");
}

function addGold(n){
  playerGold += n;
  goldLabelEl.textContent = playerGold;
  bumpEl(goldLabelEl);
}
function addScrap(n){
  playerScrap += n;
  scrapLabelEl.textContent = playerScrap;
  bumpEl(scrapLabelEl);
}
function addBook(n){
  sessionBooks += n;
  bookLabelEl.textContent = sessionBooks;
  bumpEl(bookLabelEl);
}
function addExp(n){
  playerExp += n;
  while (playerExp >= playerExpMax){
    playerExp -= playerExpMax;
    playerLevel += 1;
    playerExpMax = Math.round(playerExpMax * 1.25); // her seviyede %25 daha zor
    levelLabelEl.textContent = playerLevel;
    if (typeof spawnFloatingText === "function" && typeof player !== "undefined"){
      spawnFloatingText(player.x, player.y - player.r - 40, `⬆ SEVİYE ${playerLevel}!`, "#ffcc4d");
    }
    if (typeof triggerShake === "function") triggerShake(5, 0.2);
  }
  expLabelEl.textContent = playerExp;
  expMaxLabelEl.textContent = playerExpMax;
  expBarFillEl.style.width = (100 * playerExp / playerExpMax) + "%";
}

// ---- HP barı: hpLabel'ı izleyip barı otomatik güncelle ----
// (Böylece 03-player.js / 04-economy.js hiç değişmeden çalışır.)
function syncHpBar(){
  const hp = parseInt(hpLabelEl.textContent, 10) || 0;
  const maxHp = (typeof player !== "undefined" && player.maxHp) ? player.maxHp : 100;
  hpMaxLabelEl.textContent = maxHp;
  const pct = Math.max(0, Math.min(100, 100 * hp / maxHp));
  hpBarFillEl.style.width = pct + "%";
  hpBarFillEl.parentElement.classList.toggle("low", pct <= 30);
}
new MutationObserver(syncHpBar).observe(hpLabelEl, { childList: true, characterData: true, subtree: true });
syncHpBar();

// ---- Kaynak/eşya sayaçları değişince parlasın ----
for (const el of [itemsLabelEl, rareLabelEl, legendaryLabelEl]){
  new MutationObserver(() => bumpEl(el)).observe(el, { childList: true, characterData: true, subtree: true });
}
