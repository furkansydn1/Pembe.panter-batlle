import { BASE_ATTACK, BASE_DEFENSE, getScrap } from "./core-config.js";
import { mapExplorerExitBtnEl, mapExplorerSceneEl, mapExplorerTitleEl, mapResultBodyEl, mapResultCardEl, mapTierGridEl } from "./dom.js";
import { randInt } from "./events-badges.js";
import { PLAYERS_COL, db, doc, updateDoc } from "./firebase-setup.js";
import { getCurrentEnergy } from "./game-core.js";
import { BOOK_TIER_ICONS, BOOK_TIER_NAMES, applyXpGain, generateLootItemForRarity, getBooks } from "./item-systems.js";
import { SLOTS } from "./items-data.js";
import { DOMINANCE_RATIO } from "./market.js";
import { S } from "./state.js";

// ============================================================
// HARİTA (MAP) SİSTEMİ — VERİ VE MANTIK (V2 Faz 3, madde 3/4)
// ÖNEMLİ: Bu SADECE veri/hesaplama katmanı. Görsel harita (2.5D canavar
// kesme motoru, sprite'lar) prototip-6-sprite-entegre.html'de ayrı duruyor
// ve şu an bu skill'in kapsamında değil (bkz. SKILL.md üst notu) — burada
// yalnızca "hangi harita ne kadar zor, ne düşürür, ölünce ne kaybedilir"
// mantığı var. #tabHarita UI'ı (buton/ekran) ayrı bir adımda bu fonksiyonlara
// bağlanacak; hiçbiri şu an hiçbir DOM elementinden çağrılmıyor.
//
// Varsayım notu: İstekte geçen "puan/altın" cezası — oyunda henüz ayrı bir
// "altın" alanı yok (o, Faz 4 Ekonomi/Pazar ile gelecek). Bu yüzden ceza
// şu an mevcut iki ekonomik alan olan points (puan) ve scrap (hurda)
// üzerinden uygulanıyor. Gold alanı eklendiğinde applyMapDeathPenalty()'ye
// tek bir satır eklemek yeterli olacak.
// ============================================================

// Aynı DOMINANCE_RATIO/spread-roll mantığını PvP'den (resolveArenaAttack)
// ödünç alıyoruz ki savaş "hissi" tutarlı kalsın: ezici güç farkı varsa
// kesin sonuç, yakın güçte ise ±%15 şans payı.
export const MAP_OFFROLE_WEIGHT = 0.5; // haritada tek rol var (atk+def birlikte sayılır)
export const MAP_ROLL_SPREAD = 0.15;

// order: 1→5 zorluk sırası. mobAtkMult/mobDefMult: canavarın gücü
// BASE_ATTACK/BASE_DEFENSE'in kaç katı olacağını belirler — sıradaki
// haritaya geçtikçe katlar büyüyerek zorluk eğrisini oluşturur.
// bookTier: bu haritanın RARITY_ORDER ile paralel Kitap ödülü (kendi
// seviyesine uygun materyal — üst haritalar üst tier kitap düşürür).
// recommendedLevel: sert bir engel değil, canEnterMap()'te yumuşak bir alt
// sınır (MAP_LEVEL_LENIENCY kadar esneklik var).
export const MAP_LEVEL_LENIENCY = 3;
// [DİYAR KİLİDİ] MAP tarafında gerçekten inşa edilmiş diyar sayısı (order olarak).
// Yeni bir diyar MAP mini-oyununda hazır oldukça bu sayıyı 1 artırman yeterli —
// kartındaki "🔒 Yakında" kendiliğinden "Diyara Gir"e döner. Şu an: 1=Unutulmuş
// Orman, 2=Zehirli Bataklık hazır; 3-5 (Yıkık Kale, Gölge Uçurumu, Kâbus Diyarı) yakında.
export const IMPLEMENTED_MAP_MAX_ORDER = 3;
export const MAP_TIERS = [
  {
    id: "unutulmus-orman", order: 1, label: "Unutulmuş Orman",
    recommendedLevel: 1, energyCost: 5,
    mobAtkMult: 0.8, mobDefMult: 0.7,
    bookTier: "standart", bookDropChance: 35, bookDropMin: 1, bookDropMax: 2,
    scrapMin: 2, scrapMax: 4, pointsMin: 2, pointsMax: 4,
    xpReward: 10, deathPenaltyPct: 4
  },
  {
    id: "zehirli-bataklik", order: 2, label: "Zehirli Bataklık",
    recommendedLevel: 15, energyCost: 8,
    mobAtkMult: 1.1, mobDefMult: 1.0,
    bookTier: "nadir", bookDropChance: 25, bookDropMin: 1, bookDropMax: 2,
    scrapMin: 3, scrapMax: 6, pointsMin: 4, pointsMax: 7,
    xpReward: 16, deathPenaltyPct: 6
  },
  {
    id: "yikik-kale", order: 3, label: "Yıkık Kale",
    recommendedLevel: 35, minLevel: 35, energyCost: 12, // [KALE] 35 seviyeyi geçen HERKES girer (hoşgörü yok, kesin sınır)
    mobAtkMult: 1.5, mobDefMult: 1.4,
    bookTier: "efsanevi", bookDropChance: 16, bookDropMin: 1, bookDropMax: 1,
    scrapMin: 5, scrapMax: 9, pointsMin: 7, pointsMax: 11,
    xpReward: 24, deathPenaltyPct: 8
  },
  {
    id: "golge-ucurumu", order: 4, label: "Gölge Uçurumu",
    recommendedLevel: 50, energyCost: 18,
    mobAtkMult: 2.0, mobDefMult: 1.9,
    bookTier: "mitik", bookDropChance: 9, bookDropMin: 1, bookDropMax: 1,
    scrapMin: 8, scrapMax: 13, pointsMin: 11, pointsMax: 16,
    xpReward: 34, deathPenaltyPct: 10
  },
  {
    id: "kabus-diyari", order: 5, label: "Kâbus Diyarı",
    recommendedLevel: 70, energyCost: 25,
    mobAtkMult: 2.7, mobDefMult: 2.5,
    bookTier: "kabus", bookDropChance: 5, bookDropMin: 1, bookDropMax: 1,
    scrapMin: 12, scrapMax: 19, pointsMin: 16, pointsMax: 24,
    xpReward: 46, deathPenaltyPct: 13
  }
];

export function getMapById(mapId) {
  return MAP_TIERS.find(m => m.id === mapId) || null;
}

// Oyuncunun ekipman+statAllocated'tan gelen atk/defense'ini (zaten
// S.currentPlayerData.attack/defense olarak Firestore'da hazır duruyor,
// bkz. computeStatsFromEquipment) tek bir "harita gücü" sayısına indirger.
export function getMapPlayerPower(playerData) {
  const atk = playerData.attack || BASE_ATTACK;
  const def = playerData.defense || BASE_DEFENSE;
  return atk + def * MAP_OFFROLE_WEIGHT;
}

// Haritanın canavar atk/def'ini ve tek sayılık "gücünü" döndürür.
export function getMapMonsterPower(map) {
  const monsterAtk = Math.round(BASE_ATTACK * map.mobAtkMult);
  const monsterDef = Math.round(BASE_DEFENSE * map.mobDefMult);
  return { monsterAtk, monsterDef, power: monsterAtk + monsterDef * MAP_OFFROLE_WEIGHT };
}

// Bir haritaya girilip girilemeyeceğini kontrol eder (enerji + yumuşak
// seviye sınırı). UI, butonu aktif/pasif yapmak için bunu kullanabilir.
export function canEnterMap(map, playerData) {
  if (!map) return { ok: false, reason: "Harita bulunamadı." };
  const energy = getCurrentEnergy(playerData);
  if (energy < map.energyCost) {
    return { ok: false, reason: `Yetersiz enerji (gerekli: ${map.energyCost}, mevcut: ${energy}).` };
  }
  const level = playerData.level || 1;
  // [KALE] minLevel: diyara özel KESİN alt sınır (varsa hoşgörü uygulanmaz).
  const gateLevel = map.minLevel !== undefined ? map.minLevel : map.recommendedLevel - MAP_LEVEL_LENIENCY;
  if (level < gateLevel) {
    return { ok: false, reason: `Bu harita için önerilen seviye ${map.recommendedLevel}. Şu anki seviyen: ${level}.` };
  }
  return { ok: true };
}

// Haritanın kendi Kitap tier'inden (bookTier) 0 ile bookDropMax arası
// düşürür — SADECE kazanınca çağrılır. HURDA_FROM_RARITY'deki gibi basit
// şans-tablosu mantığı: bookDropChance % ihtimalle düşer, aksi halde 0.
export function rollMapBookDrop(map) {
  if (randInt(1, 100) > map.bookDropChance) return { tier: map.bookTier, amount: 0 };
  return { tier: map.bookTier, amount: randInt(map.bookDropMin, map.bookDropMax) };
}

// ÖLÜM CEZASI (Task 4): haritada kaybedilince puan ve hurdanın bir kısmı
// kaybedilir. Oran haritanın deathPenaltyPct'i kadar (%4 → %13 arası,
// zorluk eğrisiyle birlikte artıyor) — dengeli bir kayıp, oyuncuyu asla
// 0'ın altına düşürmez ve puanın/hurdanın TAMAMINI silmez.
export function applyMapDeathPenalty(playerData, map) {
  const points = playerData.points || 0;
  const scrap = getScrap(playerData);
  const pct = map.deathPenaltyPct / 100;
  const pointsLost = Math.min(points, Math.round(points * pct));
  const scrapLost = Math.min(scrap, Math.round(scrap * pct));
  return {
    pointsLost, scrapLost,
    newPoints: points - pointsLost,
    newScrap: scrap - scrapLost
  };
}

// SAF hesaplama: bir harita denemesinin sonucunu (kazanma/kaybetme, ödül ya
// da ceza) belirler, hiçbir yan etkisi (Firestore yazma) yoktur — gerçek
// işlem için bkz. enterMap().
export function resolveMapRun(map, playerData) {
  const playerPower = getMapPlayerPower(playerData);
  const monsterPower = getMapMonsterPower(map).power;

  let won;
  if (playerPower >= monsterPower * DOMINANCE_RATIO) {
    won = true;
  } else if (monsterPower >= playerPower * DOMINANCE_RATIO) {
    won = false;
  } else {
    const playerRoll = playerPower * ((1 - MAP_ROLL_SPREAD) + Math.random() * MAP_ROLL_SPREAD * 2);
    const monsterRoll = monsterPower * ((1 - MAP_ROLL_SPREAD) + Math.random() * MAP_ROLL_SPREAD * 2);
    won = playerRoll >= monsterRoll;
  }

  if (won) {
    return {
      won: true, mapId: map.id,
      bookDrop: rollMapBookDrop(map),
      scrapGain: randInt(map.scrapMin, map.scrapMax),
      pointsGain: randInt(map.pointsMin, map.pointsMax),
      xpGain: map.xpReward
    };
  }

  // Kaybedince XP_PER_BATTLE_LOSS'taki "teselli XP'si" mantığıyla paralel:
  // küçük bir kısmi XP + Ölüm Cezası.
  return {
    won: false, mapId: map.id,
    xpGain: Math.round(map.xpReward / 3),
    ...applyMapDeathPenalty(playerData, map)
  };
}

// Gerçek Firestore işlemi: canEnterMap() ile doğrular, resolveMapRun() ile
// sonucu hesaplar, enerji/puan/hurda/kitap/XP güncellemesini TEK updateDoc
// ile yazar. upgradeItem()/disenchantItem() ile aynı basit updateDoc kalıbı
// (sadece oyuncunun kendi verisi değişiyor, PvP'deki gibi iki taraflı bir
// çakışma riski yok, bu yüzden runTransaction gerekmiyor).
export async function enterMap(mapId) {
  if (!S.currentPlayerData) return null;
  const map = getMapById(mapId);
  const check = canEnterMap(map, S.currentPlayerData);
  if (!check.ok) { alert(check.reason); return null; }

  const result = resolveMapRun(map, S.currentPlayerData);
  const xpResult = applyXpGain(S.currentPlayerData, result.xpGain);

  const payload = {
    energy: getCurrentEnergy(S.currentPlayerData) - map.energyCost,
    level: xpResult.level,
    xp: xpResult.xp,
    statPoints: xpResult.statPoints
  };

  if (result.won) {
    if (result.bookDrop.amount > 0) {
      const newBooks = { ...getBooks(S.currentPlayerData) };
      newBooks[result.bookDrop.tier] = (newBooks[result.bookDrop.tier] || 0) + result.bookDrop.amount;
      payload.books = newBooks;
    }
    payload.scrap = getScrap(S.currentPlayerData) + result.scrapGain;
    payload.points = (S.currentPlayerData.points || 0) + result.pointsGain;
  } else {
    payload.points = result.newPoints;
    payload.scrap = result.newScrap;
  }

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), payload);
  return result;
}

// ============================================================
// [V2 Faz 9] HARİTA SEKMESİ UI — veri katmanını (yukarıdaki enterMap() vb.)
// gerçek DOM'a bağlıyor. İki ayrı akış var:
//   1) "Haritaya Gir" → enterMap() → ANLIK sonuç (kutu açma ile aynı UX).
//   2) "Kâşif Sahnesi" → index.html'e gömülü, kullanıcının sağladığı
//      bağımsız 2.5D motoru (ayrı <script>, window.MapExplorerBridge
//      üzerinden konuşuyoruz) açılır; GÖRSEL/atmosferik bir keşif ekranı.
//      Sahne içindeki ödül/ceza oranları artık gerçek harita verisinden
//      (mgCurrentMap() → window.MapExplorerBridge.currentMap) okunuyor,
//      "Sahneden Çık" ile bu oturumda birikeni TEK bir updateDoc ile
//      gerçek oyuncuya yazıyoruz (books/scrap/points/xp).
// ============================================================
export const MAP_TIER_ICONS = {
  "unutulmus-orman": "🌲", "zehirli-bataklik": "🜄", "yikik-kale": "🏚",
  "golge-ucurumu": "🜏", "kabus-diyari": "💀"
};
export const RARITY_LABELS_REALM = { standart: "Sıradan", nadir: "Nadir", efsanevi: "Efsanevi", mitik: "Mitik", kabus: "Kabus" };

export function renderMapTab() {
  if (!mapTierGridEl || !S.currentPlayerData) return;
  // Sağ üstte Bestiyari (bilgi) butonu + oyunun kendi realm-card/realm-stats
  // sınıflarıyla kurulmuş bilgi paneli — diyar kartlarıyla aynı temada görünür.
  const infoRow = `
    <div style="grid-column:1/-1; display:flex; justify-content:flex-end; margin-bottom:2px;">
      <button id="mapInfoBtn" class="btn-mini" title="Harita bilgisi">🕮 Bilgi</button>
    </div>
    <div id="mapInfoPanel" class="realm-card hidden" style="grid-column:1/-1;">
      <div class="realm-top">
        <span class="realm-name"><span class="rn-ico">🕮</span> Bestiyari</span>
        <span class="realm-lvl">Harita Kaydı</span>
      </div>
      <div class="realm-stats"><span class="drop">🪓 <b>Ork</b> · peşini bırakmaz</span><span>❤ <b>30</b></span><span class="death">⚔ <b>-8</b></span><span>🔩 <b>%10 Hurda</b></span></div>
      <div class="realm-stats"><span class="drop">🛡️ <b>Asker</b> · hattı tutar</span><span>❤ <b>32</b></span><span class="death">⚔ <b>-12</b></span><span>🔩 <b>%10 Hurda</b></span></div>
      <div class="realm-stats"><span class="drop">🔥 <b>Goblin</b> · şarj eder</span><span>❤ <b>45</b></span><span class="death">⚔ <b>-16</b></span><span>🔩 <b>%10 Hurda</b></span></div>
      <div class="realm-stats"><span class="drop">Damlalar</span><span>📖 <b>%8 Kitap</b></span><span>🔩 <b>%10 Hurda</b></span><span>⭐ <b>%95 EXP</b></span></div>
      <div class="realm-stats"><span class="death">💀 Ölüm bedeli <b>-1 Puan</b></span><span>🔄 Yeni dalga <b>10 sn</b></span></div>
      <p class="box-status" style="margin:6px 0 0;">Toz ve eşyaların ölümde korunur. Kitap, Hurda ve EXP kazançların hesabına otomatik işlenir.</p>
    </div>`;

  mapTierGridEl.innerHTML = infoRow + MAP_TIERS.map(map => {
    const check = canEnterMap(map, S.currentPlayerData);
    const locked = !check.ok;
    // FADELESS: kart gövdesi (realm-top + realm-stats) prototipteki
    // .realm-card yapısıyla BİREBİR aynı üç span'i kullanıyor (Kitap tier
    // adı / Düşme % / Ölüm bedeli %) — enerji maliyeti prototipte yoktu,
    // bu yüzden buradan kaldırılıp "Diyara Gir" butonunun title'ına taşındı.
    return `
      <div class="realm-card rlm-${map.order} ${locked ? "locked" : ""}">
        <div class="realm-top">
          <span class="realm-name"><span class="rn-ico">${MAP_TIER_ICONS[map.id] || "🗺"}</span> ${map.label}</span>
          <span class="realm-lvl">Sv. ${map.recommendedLevel}+</span>
        </div>
        <div class="realm-stats">
          <span class="drop">Kitap <b>${RARITY_LABELS_REALM[map.bookTier]}</b></span><span>Düşme <b>%${map.bookDropChance}</b></span><span class="death">Ölüm bedeli <b>%${map.deathPenaltyPct}</b></span>
        </div>
        ${locked ? `<p class="box-status" style="margin:6px 0;">${check.reason}</p>` : ""}
        <div class="realm-actions">
          ${map.order <= IMPLEMENTED_MAP_MAX_ORDER
            ? `<button class="btn-mini nadir-mini" data-map-enter="${map.id}" ${locked ? "disabled" : ""}>Diyara Gir</button>`
            : `<button class="btn-mini" disabled style="opacity:0.55; cursor:default;">🔒 Yakında</button>`}
        </div>
      </div>`;
  }).join("");

  mapTierGridEl.querySelectorAll("[data-map-enter]").forEach(btn => {
    btn.onclick = () => {
      const map = getMapById(btn.getAttribute("data-map-enter"));
      // Oyuncunun GERÇEK statlarını MAP sayfasına taşı — MAP/js/14-hero-stats.js
      // bunu okuyup hasar/savunma/can/hız/kritik hesabına uygular.
      const p = S.currentPlayerData || {};
      // Sonraki seviyeye kalan XP'yi applyXpGain ile ikili aramayla bul —
      // formülü kopyalamak yerine gerçek fonksiyona sorarak, formül ileride
      // değişse bile doğru kalır. (~40 saf çağrı, maliyeti yok.)
      let xpNeedTotal = null;
      try {
        const xpNow = p.xp || 0;
        let hi = 1;
        while (applyXpGain(p, hi).levelsGained < 1 && hi < 1000000) hi *= 2;
        let lo = 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (applyXpGain(p, mid).levelsGained >= 1) hi = mid; else lo = mid + 1;
        }
        xpNeedTotal = xpNow + lo; // bu seviyenin toplam barı: mevcut + kalan
      } catch (e) { xpNeedTotal = null; }
      try {
        localStorage.setItem("ppbMapHeroStats", JSON.stringify({
          attack: p.attack || BASE_ATTACK,
          defense: p.defense || BASE_DEFENSE,
          speed: p.speed || 0,
          critStat: p.critStat || 0,
          maxHp: p.maxHp || 100,
          level: p.level || 1,
          points: p.points || 0,
          nick: p.nick || "Kahraman",
          xp: p.xp || 0,
          xpNeed: xpNeedTotal,
          baseAttack: BASE_ATTACK,
          baseDefense: BASE_DEFENSE,
          ts: Date.now()
        }));
      } catch (e) { /* localStorage kapalıysa MAP taban statlarla açılır */ }
      // map1, map2... — diyarın sırası harita numarasıdır. Şimdilik hepsi
      // aynı prototipi açıyor; MAP tarafı bu parametreyi okuyup ileride
      // haritaya göre canavar/zorluk/loot değiştirecek.
      window.location.href = `MAP/index.html?map=${map ? map.order : 1}`;
    };
  });
  const infoBtn = document.getElementById("mapInfoBtn");
  const infoPanel = document.getElementById("mapInfoPanel");
  if (infoBtn && infoPanel) infoBtn.onclick = () => infoPanel.classList.toggle("hidden");
}

export async function handleEnterMap(mapId) {
  mapTierGridEl.querySelectorAll("button").forEach(b => b.disabled = true);
  mapResultCardEl.classList.add("hidden");
  const result = await enterMap(mapId);
  if (result) showMapResult(result);
  renderMapTab();
}

export function showMapResult(result) {
  const map = getMapById(result.mapId);
  mapResultCardEl.classList.remove("hidden");
  if (result.won) {
    mapResultBodyEl.innerHTML = `
      <p class="tut-text">✅ <b>${map.label}</b> haritasını temizledin!</p>
      <div class="inv-item-stat-pills">
        <span class="inv-stat-pill">✨ +${result.scrapGain} Hurda</span>
        <span class="inv-stat-pill">⭐ +${result.pointsGain} Puan</span>
        <span class="inv-stat-pill">📈 +${result.xpGain} XP</span>
        ${result.bookDrop.amount > 0 ? `<span class="inv-stat-pill enchant">${BOOK_TIER_ICONS[result.bookDrop.tier]} +${result.bookDrop.amount} ${BOOK_TIER_NAMES[result.bookDrop.tier]}</span>` : ""}
      </div>`;
  } else {
    mapResultBodyEl.innerHTML = `
      <p class="tut-text">💀 <b>${map.label}</b> haritasında kaybettin.</p>
      <div class="inv-item-stat-pills">
        <span class="inv-stat-pill">✨ -${result.scrapLost} Hurda</span>
        <span class="inv-stat-pill">⭐ -${result.pointsLost} Puan</span>
        <span class="inv-stat-pill">📈 +${result.xpGain} XP (teselli)</span>
      </div>`;
  }
}

// Kâşif Sahnesi açılınca ayrı <script>'e (window.MapExplorerBridge) hangi
// haritanın açık olduğunu bildiriyoruz; motor mgCurrentMap() ile bunu okuyup
// ödül/ceza oranlarını buna göre uyguluyor (bkz. index.html içindeki script).
export function openMapExplorerScene(mapId) {
  const map = getMapById(mapId);
  if (!map || !window.MapExplorerBridge) return;
  window.MapExplorerBridge.currentMap = map;
  if (window.MapExplorerBridge.resetSession) window.MapExplorerBridge.resetSession();
  if (mapExplorerTitleEl) mapExplorerTitleEl.textContent = `🗺️ ${map.label}`;
  mapExplorerSceneEl.classList.remove("hidden");
  mapExplorerSceneEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Sahneden çıkınca o oturumda motorun biriktirdiği scrap/points/xp/book
// miktarını TEK bir updateDoc ile gerçek oyuncuya yazıyoruz — enterMap()
// ile aynı "tek yazma" deseni, sadece kaynak anlık değil oturum-biriktirmeli.
export async function closeMapExplorerScene() {
  if (!S.currentPlayerData || !window.MapExplorerBridge || !window.MapExplorerBridge.getSessionResult) {
    mapExplorerSceneEl.classList.add("hidden");
    return;
  }
  const session = window.MapExplorerBridge.getSessionResult();
  mapExplorerSceneEl.classList.add("hidden");
  if (session.scrapGain <= 0 && session.pointsGain <= 0 && session.bookGain <= 0 && session.xpGain <= 0) {
    return; // hiçbir şey kazanılmadıysa boşuna yazma yapma
  }
  const xpResult = applyXpGain(S.currentPlayerData, session.xpGain);
  const payload = {
    scrap: getScrap(S.currentPlayerData) + session.scrapGain,
    points: (S.currentPlayerData.points || 0) + session.pointsGain,
    level: xpResult.level, xp: xpResult.xp, statPoints: xpResult.statPoints
  };
  if (session.bookGain > 0 && session.bookTier) {
    const newBooks = { ...getBooks(S.currentPlayerData) };
    newBooks[session.bookTier] = (newBooks[session.bookTier] || 0) + session.bookGain;
    payload.books = newBooks;
  }
  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), payload);
  if (window.MapExplorerBridge.resetSession) window.MapExplorerBridge.resetSession();
}

export function dateStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function isConsecutiveDay(prevStr, currStr) {
  if (!prevStr) return false;
  const prev = new Date(prevStr + "T00:00:00");
  const curr = new Date(currStr + "T00:00:00");
  return Math.round((curr - prev) / 86400000) === 1;
}
export function formatRemaining(ms) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} sa ${m} dk`;
  return `${m} dk`;
}

export function emptyEquipment() {
  return { kask: null, zirh: null, kalkan: null, kilic: null, eldiven: null, kupe: null, kolye: null, ayakkabi: null, ring: null };
}


// ============================================================
// MAP FARM KÖPRÜSÜ — "Diyara Gir" ile açılan MAP/index.html sayfası,
// kazançları localStorage'daki "ppbMapPending" anahtarına yazar
// (bkz. MAP/js/13-account-bridge.js). Ana oyun açıldığında / sekmeye
// geri dönüldüğünde burası o birikimi okur, TEK bir updateDoc ile
// gerçek oyuncuya işler ve anahtarı temizler. closeMapExplorerScene()
// ile aynı "oturum-biriktir, tek yazma" deseni — sadece kaynak ayrı sayfa.
// ============================================================
const MAP_PENDING_KEY = "ppbMapPending";
const MAP_FARM_DEATH_PENALTY = 1; // MAP tarafındaki her ölüm için puan cezası

export async function claimMapFarmRewards() {
  if (!S.currentPlayerData || !S.currentPlayerId) return;
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(MAP_PENDING_KEY) || "null"); } catch (e) { pending = null; }
  if (!pending) return;

  const bookGain = Math.max(0, Math.floor(pending.bookStandart || 0));
  const scrapGain = Math.max(0, Math.floor(pending.scrap || 0));
  const xpGain = Math.max(0, Math.floor(pending.xp || 0));
  const deaths = Math.max(0, Math.floor(pending.deaths || 0));
  const goldGain = Math.max(0, Math.floor(pending.gold || 0));

  // [MAP EŞYA KASASI] Haritada düşen Sıradan/Nadir eşyalar AYRI anahtarda
  // birikir (MAP/js/13-account-bridge.js yazar; eski sürümler bu anahtara hiç
  // dokunmadığı için kayıp riski yoktur). Burada kutu motorunun fabrikasıyla
  // (generateLootItemForRarity — Günlük Market de aynısını kullanır) GERÇEK
  // eşyaya çevrilip envantere basılır.
  const MAP_ITEMS_KEY = "ppbMapPendingItems";
  let pendingItems = null;
  try { pendingItems = JSON.parse(localStorage.getItem(MAP_ITEMS_KEY) || "null"); } catch (e) { pendingItems = null; }
  const stdItemCount = Math.max(0, Math.floor((pendingItems && pendingItems.std) || 0));
  const rareItemCount = Math.max(0, Math.floor((pendingItems && pendingItems.rare) || 0));
  const rareBookCount = Math.max(0, Math.floor((pendingItems && pendingItems.rareBook) || 0)); // [KİTAP] Nadir Kitap
  const legItemCount = Math.max(0, Math.floor((pendingItems && pendingItems.leg) || 0));        // [KALE] Efsanevi Eşya
  const legBookCount = Math.max(0, Math.floor((pendingItems && pendingItems.legBook) || 0));    // [KALE] Efsanevi Kitap

  if (bookGain <= 0 && scrapGain <= 0 && xpGain <= 0 && deaths <= 0 && goldGain <= 0
      && stdItemCount <= 0 && rareItemCount <= 0 && rareBookCount <= 0
      && legItemCount <= 0 && legBookCount <= 0) {
    localStorage.removeItem(MAP_PENDING_KEY);
    localStorage.removeItem(MAP_ITEMS_KEY);
    return;
  }

  const xpResult = applyXpGain(S.currentPlayerData, xpGain);
  const payload = {
    level: xpResult.level, xp: xpResult.xp, statPoints: xpResult.statPoints,
    scrap: getScrap(S.currentPlayerData) + scrapGain,
    gold: Math.max(0, (S.currentPlayerData.gold || 0) + goldGain),
    points: Math.max(0, (S.currentPlayerData.points || 0) - deaths * MAP_FARM_DEATH_PENALTY)
  };
  if (bookGain > 0 || rareBookCount > 0 || legBookCount > 0) {
    const newBooks = { ...getBooks(S.currentPlayerData) };
    if (bookGain > 0) newBooks.standart = (newBooks.standart || 0) + bookGain;
    if (rareBookCount > 0) newBooks.nadir = (newBooks.nadir || 0) + rareBookCount; // [KİTAP] bataklık nadir kitabı
    if (legBookCount > 0) newBooks.efsanevi = (newBooks.efsanevi || 0) + legBookCount; // [KALE] efsanevi kitap
    payload.books = newBooks;
  }

  // [MAP EŞYA KASASI] Eşyaları bas: rastgele slota, kutu motoruyla birebir aynı
  // fabrikadan (isim havuzu, stat, efsun, id — hepsi gerçek). Tek turda en fazla
  // 40 eşya işlenir (Firestore yazım emniyeti); artan olursa kasada bekler,
  // bir sonraki kontrol turunda (2 sn'de bir / odakta) işlenir.
  const totalItems = Math.min(40, stdItemCount + rareItemCount + legItemCount);
  const processedLeg = Math.min(legItemCount, totalItems);                 // [KALE] en nadir en önce basılır
  const processedRare = Math.min(rareItemCount, totalItems - processedLeg);
  const processedStd = totalItems - processedLeg - processedRare;
  if (totalItems > 0) {
    const invUpdates = {};
    const newNames = [];
    for (let i = 0; i < totalItems; i++) {
      const rarity = i < processedLeg ? "efsanevi" : (i < processedLeg + processedRare ? "nadir" : "standart"); // [KALE]
      const slot = SLOTS[randInt(0, SLOTS.length - 1)].key;
      const item = generateLootItemForRarity(slot, rarity);
      if (!invUpdates[slot]) {
        const cur = (S.currentPlayerData.inventory && S.currentPlayerData.inventory[slot]) || [];
        invUpdates[slot] = [...cur];
      }
      invUpdates[slot].push(item);
      newNames.push(item.name);
    }
    for (const slot of Object.keys(invUpdates)) payload[`inventory.${slot}`] = invUpdates[slot];
    // Koleksiyon kitabı da haberdar olsun (kutudan çıkmış gibi keşfedilir)
    payload.discoveredItems = Array.from(new Set([...(S.currentPlayerData.discoveredItems || []), ...newNames]));
  }

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), payload);
  localStorage.removeItem(MAP_PENDING_KEY);
  // Kasa: işlenen düşülür; artan varsa (40 sınırı) sonraki tura kalır.
  // Nadir kitap ucuz işlenir (sadece sayaç), 40-item sınırına takılmaz → hep tam işlenir.
  const remStd = stdItemCount - processedStd, remRare = rareItemCount - processedRare, remLeg = legItemCount - processedLeg;
  if (remStd > 0 || remRare > 0 || remLeg > 0) {
    try { localStorage.setItem(MAP_ITEMS_KEY, JSON.stringify({ std: remStd, rare: remRare, leg: remLeg, rareBook: 0, legBook: 0, updatedAt: Date.now() })); } catch (e) {}
  } else {
    localStorage.removeItem(MAP_ITEMS_KEY);
  }
  console.log(`[MAP köprüsü] Hesaba işlendi: +${bookGain} Sıradan Kitap, +${scrapGain} Hurda, +${goldGain} Altın, +${xpGain} XP, +${processedStd} Sıradan Eşya, +${processedRare} Nadir Eşya, +${rareBookCount} Nadir Kitap, +${legBookCount} Efsanevi Kitap, +${processedLeg} Efsanevi Eşya, -${deaths * MAP_FARM_DEATH_PENALTY} Puan (${deaths} ölüm)`);
}

// Oyuncu giriş yaptıktan sonra bir kez bekleyen ödülleri işle; ayrıca
// MAP sekmesinden geri dönüldüğünde (sayfa odak kazandığında) tekrar dene.
const mapClaimBootTimer = setInterval(() => {
  if (S.currentPlayerData && S.currentPlayerId) {
    clearInterval(mapClaimBootTimer);
    claimMapFarmRewards();
  }
}, 2000);
window.addEventListener("focus", () => { claimMapFarmRewards(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) claimMapFarmRewards(); });

// (dom.js bölümünden taşındı — Kâşif Sahnesi çıkış butonu bağlama)
if (mapExplorerExitBtnEl) mapExplorerExitBtnEl.onclick = closeMapExplorerScene;
