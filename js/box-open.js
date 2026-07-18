import { XP_PER_BOX_OPEN, getGold, getScrap } from "./core-config.js";
import { IS_LOW_POWER, boxStatus, boxWrapper, buyEfsaneviChestBtn, buyNadirChestBtn, charStageSlotsEl, chestFlashEl, chestShockwaveEl, epicChestEl, itemPopup, itemPopupInner, openBoxBtn } from "./dom.js";
import { getEffectiveBoxCooldown, getTodaysEvent, pickSlotWeighted, randInt, rollRarity } from "./events-badges.js";
import { PLAYERS_COL, db, doc, updateDoc } from "./firebase-setup.js";
import { computeScrapGainForItem, disenchantItem, equipItem, getSlotInventory, openInventoryModal } from "./inventory.js";
import { RARITY_CHANCE_LABELS, applyXpGain, computeStatsFromEquipment, generateLootItemForRarity } from "./item-systems.js";
import { SLOTS, SLOT_MAP, getLiveEffectDesc, itemIconSvg } from "./items-data.js";
import { dateStr, emptyEquipment, formatRemaining, isConsecutiveDay } from "./map.js";
import { incrementQuestProgress } from "./quests.js";
import { S } from "./state.js";
import { sfxOpenLegendary, sfxOpenRare, sfxOpenStandart, sfxShake } from "./ui-misc.js";

// ============================================================
// KARAKTER SAHNESİ (Profil sekmesi üstü)
// Ekipmanları düz bir liste yerine, panterin üstünde anatomik olarak
// doğru yerlerde gösterir: kask başta, zırh gövdede, kılıç ve eldiven
// ellerde, ayakkabı ayakta. Salt görsel bir özet; tıklanınca ilgili
// slotun envanterini açar (equipmentGrid ile aynı davranış).
// ============================================================
export function renderCharacterStage() {
  if (!charStageSlotsEl) return;
  const eq = S.currentPlayerData?.equipment || emptyEquipment();
  charStageSlotsEl.innerHTML = SLOTS.map(s => {
    const item = eq[s.key];
    // FADELESS: prototipteki .gear-slot/.gs-r-{rarity}/.gs-label sınıfları
    // birebir kullanılıyor (eski .char-slot/.rarity-X/.char-slot-label
    // isimlendirmesi bırakıldı). Konumlandırma hâlâ SLOTS'tan gelen
    // slot-pos-${key} yüzde-tabanlı sınıfla yapılıyor, o değişmedi.
    const rarityClass = item ? `gs-r-${item.rarity}` : "";
    return `
      <button type="button" class="gear-slot slot-pos-${s.key} ${item ? "filled" : "empty"} ${rarityClass}" data-slot="${s.key}" title="${s.label}${item ? ": " + item.name : " (boş)"}">
        <span class="char-slot-icon">${item ? itemIconSvg(s.key, item.rarity, 30) : s.icon}</span>
        <span class="gs-label">${s.label}</span>
      </button>`;
  }).join("");

  charStageSlotsEl.querySelectorAll("button[data-slot]").forEach(btn => {
    btn.onclick = () => openInventoryModal(btn.getAttribute("data-slot"));
  });
}

// ============================================================
// KUTU AÇMA
// ============================================================
export function canOpenBoxNow() {
  if (!S.currentPlayerData) return false;
  const last = S.currentPlayerData.lastBoxOpenTime || 0;
  return Date.now() - last >= getEffectiveBoxCooldown();
}

export function renderBoxStatus() {
  const able = canOpenBoxNow();
  openBoxBtn.disabled = !able;

  if (able) {
    boxStatus.textContent = "Sandık açmaya hazır!";
  } else {
    const remain = getEffectiveBoxCooldown() - (Date.now() - (S.currentPlayerData.lastBoxOpenTime || 0));
    boxStatus.textContent = `Sıradaki sandığa ${formatRemaining(remain)} kaldı.`;
  }
}

// ============================================================
// AFİLLİ SANDIK AÇILIŞ MOTORU
// Kullanıcının sağladığı bağımsız prototipten uyarlandı: nadirliğe göre
// renk paleti (--chest-*) uygulanıyor, sırasıyla ŞARJ (titreme) ->
// PATLAMA (mühür/kristal parçalanır + kıvılcım + ekran flaşı + şok
// dalgası) -> AÇILDI (kapak açılır, tanrısal ışıklar) durumları oynatılıyor.
// Ardından mevcut item popup sistemi devreye giriyor (dokunulmadı).
// ============================================================
// NOT: glow değerleri styles.css :root'taki --item-mitik/--item-kabus ile
// bilerek birebir aynı tutuluyor (bkz. SKILL.md "Kritik uyarı") — biri
// değişirse diğeri de güncellenmeli, yoksa sandık patlaması ile eşya ikon
// glow'u renk olarak tutarsız görünür.
export const CHEST_RARITY_STYLES = {
  standart: { body1: "#2d241c", body2: "#1a130e", trim1: "#7a7a7a", trim2: "#333333", glow: "#e2e8f0" },
  nadir: { body1: "#161f36", body2: "#0b1122", trim1: "#b0e0e6", trim2: "#2a5b8f", glow: "#4d9bff" },
  efsanevi: { body1: "#360b1b", body2: "#1c040d", trim1: "#ffcc4d", trim2: "#c98a12", glow: "#ffae00" },
  mitik: { body1: "#2b0a42", body2: "#160424", trim1: "#d9a3ff", trim2: "#8b2fd6", glow: "#b845ff" },
  kabus: { body1: "#2a0006", body2: "#140003", trim1: "#ff6b85", trim2: "#8f0022", glow: "#ff1a4d" }
};

export function setChestRarity(rarity) {
  const r = CHEST_RARITY_STYLES[rarity] || CHEST_RARITY_STYLES.standart;
  boxWrapper.style.setProperty("--chest-body-1", r.body1);
  boxWrapper.style.setProperty("--chest-body-2", r.body2);
  boxWrapper.style.setProperty("--chest-trim-1", r.trim1);
  boxWrapper.style.setProperty("--chest-trim-2", r.trim2);
  boxWrapper.style.setProperty("--chest-glow", r.glow);
  boxWrapper.style.setProperty("--chest-glow-dim", r.glow);
}

export function explodeChestSparks(color) {
  const particleCount = IS_LOW_POWER ? 22 : 50;
  for (let i = 0; i < particleCount; i++) {
    const spark = document.createElement("div");
    spark.className = "chest-spark";
    spark.style.backgroundColor = color;
    spark.style.boxShadow = `0 0 12px 3px ${color}`;
    spark.style.left = "50%";
    spark.style.top = "50%";
    boxWrapper.appendChild(spark);

    const angle = Math.random() * Math.PI * 2;
    const velocity = 90 + Math.random() * 180;
    const tx = Math.cos(angle) * velocity;
    const ty = Math.sin(angle) * velocity - 60;

    spark.animate([
      { transform: "translate(-50%, -50%) scale(1.5)", opacity: 1 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`, opacity: 0 }
    ], {
      duration: 900 + Math.random() * 900,
      easing: "cubic-bezier(0.15, 0.85, 0.35, 1)",
      fill: "forwards"
    });
    setTimeout(() => spark.remove(), 2000);
  }
}

// Şarj -> Patlama -> Açıldı durum makinesini oynatır, sonunda sandık
// "açık" halde kalır (Firestore güncellemesi ve item popup'ı bu await'in
// hemen ardından devreye girer, resetChestVisual() ile sandık idle'a döner).
export async function playChestOpenAnimation(rarity) {
  const chestPanel = boxWrapper.closest(".panel");
  setChestRarity(rarity);
  epicChestEl.classList.remove("is-opened", "is-bursting");
  boxWrapper.classList.remove("scene-opened");

  epicChestEl.classList.add("is-charging");
  if (chestPanel) chestPanel.classList.add("is-shaking");
  sfxShake();

  await new Promise(r => setTimeout(r, 1200));

  epicChestEl.classList.remove("is-charging");
  if (chestPanel) chestPanel.classList.remove("is-shaking");
  epicChestEl.classList.add("is-bursting");
  chestShockwaveEl.classList.add("shockwave-active");
  chestFlashEl.classList.add("is-flashing");
  explodeChestSparks((CHEST_RARITY_STYLES[rarity] || CHEST_RARITY_STYLES.standart).glow);

  await new Promise(r => setTimeout(r, 200));

  epicChestEl.classList.remove("is-bursting");
  epicChestEl.classList.add("is-opened");
  boxWrapper.classList.add("scene-opened");

  if (rarity === "efsanevi") sfxOpenLegendary();
  else if (rarity === "nadir") sfxOpenRare();
  else sfxOpenStandart();

  const holdMs = rarity === "efsanevi" ? 1200 : rarity === "nadir" ? 500 : 100;
  await new Promise(r => setTimeout(r, holdMs));
}

// Sandığı bir sonraki açılış için idle haline sıfırlar.
export function resetChestVisual() {
  chestShockwaveEl.classList.remove("shockwave-active");
  chestFlashEl.classList.remove("is-flashing");
  setTimeout(() => {
    epicChestEl.classList.remove("is-opened");
    boxWrapper.classList.remove("scene-opened");
  }, 500);
}

// Nadirliğe göre epik parçacık (spark) efekti
export function spawnSparks(rarity) {
  // Renkler CHEST_RARITY_STYLES.glow ve styles.css --item-mitik/--item-kabus
  // ile senkron tutuluyor (bkz. SKILL.md "Kritik uyarı").
  const counts = { standart: 5, nadir: 9, efsanevi: 16, mitik: 22, kabus: 30 };
  const colors = { standart: "#ffffff", nadir: "#4d9bff", efsanevi: "#ffcc4d", mitik: "#b845ff", kabus: "#ff1a4d" };
  const count = counts[rarity] || 5;
  const color = colors[rarity] || "#ffffff";
  const dist = rarity === "kabus" ? 130 : rarity === "mitik" ? 110 : rarity === "efsanevi" ? 90 : rarity === "nadir" ? 65 : 45;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const radius = dist * (0.6 + Math.random() * 0.6);
    const tx = Math.cos(angle) * radius;
    const ty = Math.sin(angle) * radius;

    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.setProperty("--tx", `${tx}px`);
    spark.style.setProperty("--ty", `${ty}px`);
    spark.style.background = color;
    spark.style.boxShadow = `0 0 8px ${color}`;
    spark.style.animationDuration = rarity === "efsanevi" ? "1.1s" : "0.8s";
    boxWrapper.appendChild(spark);
    setTimeout(() => spark.remove(), 1300);
  }

  if (rarity === "efsanevi") {
    const flash = document.createElement("div");
    flash.className = "box-flash";
    boxWrapper.appendChild(flash);
    setTimeout(() => flash.remove(), 700);
  }
}

// ============================================================
// ÜCRETSİZ (4 SAATLİK COOLDOWN'LU) SANDIK — SABİT ŞANS TABLOSU
// [V2 Faz 8] Bedava sandık artık rollRarity()/pity sistemini KULLANMIYOR,
// kendine ait sabit olasılık tablosu var. Efsanevi/Mitik/Kabus bu sandıktan
// HİÇBİR ZAMAN çıkmaz — bunlar sadece paralı "Nadir Sandık"/"Efsanevi Sandık"
// satın alma butonlarının (forcedRarity ile çağrılan, aşağıdaki eski/paralı
// dala düşen) işi. Yüzdeler toplamda tam %100:
//   %1  Nadir eşya
//   %50 Sıradan eşya
//   %29 30-100 Altın
//   %20 5-15 Hurda
// Not: pityRare/pityLegendary sayaçları bu sandıkta artık HİÇ dokunulmuyor —
// bu sandık pity ladder'ının bir parçası değil; pity sadece paralı sandıklarda
// (forcedRarity yoksa rollRarity() çağrılan dalda) işliyor.
// ============================================================
export const FREE_BOX_OUTCOME_TABLE = [
  { type: "item", rarity: "nadir", chance: 0.01 },
  { type: "item", rarity: "standart", chance: 0.50 },
  { type: "gold", min: 30, max: 100, chance: 0.29 },
  { type: "scrap", min: 5, max: 15, chance: 0.20 }
];

function rollFreeBoxOutcome() {
  const r = Math.random();
  let acc = 0;
  for (const o of FREE_BOX_OUTCOME_TABLE) {
    acc += o.chance;
    if (r < acc) return o;
  }
  return FREE_BOX_OUTCOME_TABLE[FREE_BOX_OUTCOME_TABLE.length - 1];
}

export async function performBoxOpen({ forcedRarity = null, costScrap = 0, costGold = 0, isFree = false }) {
  if (!S.currentPlayerData) return;

  openBoxBtn.disabled = true;
  if (buyNadirChestBtn) buyNadirChestBtn.disabled = true;
  if (buyEfsaneviChestBtn) buyEfsaneviChestBtn.disabled = true;
  itemPopup.classList.add("hidden");

  const data = S.currentPlayerData;
  const event = getTodaysEvent(data);
  const pityRare = data.pityRare || 0;
  const pityLegendary = data.pityLegendary || 0;
  const recentSlots = data.recentSlots || [];

  // Streak hesabı sadece ücretsiz (cooldown'lu) kutuda geçerli
  let newStreak = data.boxStreak || 0;
  let newLastBoxOpenDay = data.lastBoxOpenDay || null;
  if (isFree) {
    const today = dateStr();
    if (data.lastBoxOpenDay !== today) {
      newStreak = isConsecutiveDay(data.lastBoxOpenDay, today) ? (data.boxStreak || 0) + 1 : 1;
      newLastBoxOpenDay = today;
    }
  }

  // Ortak: sandık açılırken açılan her sandıkta (ödül ne olursa olsun) ilerleyen
  // şeyler — görev sayaçları, XP, toplam sandık sayacı, streak alanları.
  const newQuests = incrementQuestProgress(data.dailyQuests, "open_box", 1);
  const newWeeklyQuests = incrementQuestProgress(data.weeklyQuests, "open_box", 1);
  const newMonthlyQuests = incrementQuestProgress(data.monthlyQuests, "open_box", 1);
  // [V2 Faz 3] Sandık açmak da az miktarda XP verir.
  const boxXpResult = applyXpGain(data, XP_PER_BOX_OPEN);

  const basePayload = {
    totalBoxesOpened: (data.totalBoxesOpened || 0) + 1,
    level: boxXpResult.level,
    xp: boxXpResult.xp,
    statPoints: boxXpResult.statPoints,
    ...(newQuests !== data.dailyQuests ? { dailyQuests: newQuests } : {}),
    ...(newWeeklyQuests !== data.weeklyQuests ? { weeklyQuests: newWeeklyQuests } : {}),
    ...(newMonthlyQuests !== data.monthlyQuests ? { monthlyQuests: newMonthlyQuests } : {})
  };
  if (isFree) {
    basePayload.lastBoxOpenTime = Date.now();
    basePayload.boxStreak = newStreak;
    basePayload.lastBoxOpenDay = newLastBoxOpenDay;
  }

  // ============================================================
  // DAL 1 — ÜCRETSİZ SANDIK: yukarıdaki sabit tablo
  // ============================================================
  if (isFree && !forcedRarity) {
    const outcome = rollFreeBoxOutcome();

    if (outcome.type === "item") {
      const slot = pickSlotWeighted(recentSlots);
      const item = generateLootItemForRarity(slot, outcome.rarity);

      await playChestOpenAnimation(item.rarity);

      const wasEmpty = !(data.equipment && data.equipment[slot]);
      const newInvArr = [...getSlotInventory(slot), item];
      const newEquipment = wasEmpty
        ? { ...(data.equipment || emptyEquipment()), [slot]: item }
        : (data.equipment || emptyEquipment());
      const stats = computeStatsFromEquipment(newEquipment, data.statAllocated);
      const newRecentSlots = [...recentSlots, slot].slice(-8);
      const newDiscovered = Array.from(new Set([...(data.discoveredItems || []), item.name]));
      const newScrap = Math.max(0, getScrap(data) - costScrap);
      const newGold = Math.max(0, getGold(data) - costGold);

      const updatePayload = {
        ...basePayload,
        equipment: newEquipment,
        attack: stats.attack,
        defense: stats.defense,
        speed: stats.speed,
        critStat: stats.critStat,
        maxHp: stats.maxHp,
        [`inventory.${slot}`]: newInvArr,
        scrap: newScrap,
        gold: newGold,
        recentSlots: newRecentSlots,
        discoveredItems: newDiscovered
      };

      await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), updatePayload);

      itemPopupInner.className = `item-popup-inner rarity-${item.rarity}`;
      itemPopupInner.innerHTML = `
        <div class="item-popup-icon">${itemIconSvg(item.slot, item.rarity, 52)}</div>
        <div class="item-popup-name rarity-${item.rarity}">${item.name}</div>
        <div class="item-popup-stats">⚔️ +${item.atk} &nbsp; 🛡️ +${item.def} &nbsp; · ${item.rarity.toUpperCase()} (${RARITY_CHANCE_LABELS[item.rarity]} şans)</div>
        ${item.enchantPct ? `<div class="item-popup-passive" style="color:var(--accent-2)">✨ Efsun: +%${item.enchantPct} ${SLOT_MAP[item.slot].type === "atk" ? "Saldırı" : "Savunma"}</div>` : ""}
        ${getLiveEffectDesc(item) ? `<div class="item-popup-passive">✨ ${getLiveEffectDesc(item)}</div>` : ""}
        ${item.minorTrait ? `<div class="item-popup-passive minor-passive">${item.minorTrait.icon} ${item.minorTrait.name}: ${item.minorTrait.desc}</div>` : ""}
        ${wasEmpty
          ? `<div class="item-popup-passive" style="color:var(--green)">✅ Boş slota otomatik kuşanıldı!</div>`
          : `<div class="popup-quick-actions">
              <button id="popupEquipBtn" class="btn-mini nadir-mini">✅ Şimdi Kuşan</button>
              <button id="popupScrapBtn" class="btn-mini">✨ Hurdaya Çevir<span>+${computeScrapGainForItem(item)} Hurda</span></button>
            </div>`}
      `;
      itemPopup.classList.remove("hidden");

      if (!wasEmpty) {
        document.getElementById("popupEquipBtn").onclick = () => { equipItem(slot, item.id); itemPopup.classList.add("hidden"); };
        document.getElementById("popupScrapBtn").onclick = () => { disenchantItem(slot, item.id); itemPopup.classList.add("hidden"); };
      }
    } else {
      // Altın veya Hurda ödülü — eşya yok, sandık görsel olarak "standart"
      // temada oynar (currency ödülleri için ayrı bir sandık teması yok).
      await playChestOpenAnimation("standart");

      const amount = randInt(outcome.min, outcome.max);
      const isGold = outcome.type === "gold";
      const newScrap = Math.max(0, getScrap(data) - costScrap) + (isGold ? 0 : amount);
      const newGold = Math.max(0, getGold(data) - costGold) + (isGold ? amount : 0);

      const updatePayload = { ...basePayload, scrap: newScrap, gold: newGold };
      await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), updatePayload);

      itemPopupInner.className = "item-popup-inner rarity-standart";
      itemPopupInner.innerHTML = `
        <div class="item-popup-icon" style="font-size:40px">${isGold ? "🪙" : "🔩"}</div>
        <div class="item-popup-name rarity-standart">+${amount} ${isGold ? "Altın" : "Hurda"}</div>
      `;
      itemPopup.classList.remove("hidden");
    }

    resetChestVisual();
    setTimeout(() => itemPopup.classList.add("hidden"), 5000);
    return;
  }

  // ============================================================
  // DAL 2 — PARALI SANDIK (Nadir Sandık / Efsanevi Sandık satın alma,
  // forcedRarity ile çağrılır): ESKİ DAVRANIŞ, DOKUNULMADI.
  // rollRarity()/pity sistemi sadece burada işliyor.
  // ============================================================
  const rarity = forcedRarity || rollRarity(pityRare, pityLegendary, event);
  const slot = pickSlotWeighted(recentSlots);
  const item = generateLootItemForRarity(slot, rarity);

  await playChestOpenAnimation(item.rarity);

  // Pity sayaçlarını güncelle (günün olayı pity'yi hızlandırabilir)
  let newPityRare = rarity === "nadir" || rarity === "efsanevi" ? 0 : pityRare + (event.pityMult || 1);
  let newPityLegendary = rarity === "efsanevi" ? 0 : pityLegendary + (event.pityMult || 1);

  // Slot boşsa otomatik kuşanılır, doluysa envantere eklenir (oyuncu kendi seçer)
  const wasEmpty = !(data.equipment && data.equipment[slot]);
  const newInvArr = [...getSlotInventory(slot), item];
  const newEquipment = wasEmpty
    ? { ...(data.equipment || emptyEquipment()), [slot]: item }
    : (data.equipment || emptyEquipment());
  const stats = computeStatsFromEquipment(newEquipment, data.statAllocated);

  const newRecentSlots = [...recentSlots, slot].slice(-8);
  const newDiscovered = Array.from(new Set([...(data.discoveredItems || []), item.name]));
  const newScrap = Math.max(0, getScrap(data) - costScrap);
  const newGold = Math.max(0, getGold(data) - costGold);

  const updatePayload = {
    ...basePayload,
    equipment: newEquipment,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    critStat: stats.critStat,
    maxHp: stats.maxHp,
    [`inventory.${slot}`]: newInvArr,
    pityRare: newPityRare,
    pityLegendary: newPityLegendary,
    scrap: newScrap,
    gold: newGold,
    recentSlots: newRecentSlots,
    discoveredItems: newDiscovered
  };

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), updatePayload);

  itemPopupInner.className = `item-popup-inner rarity-${item.rarity}`;
  itemPopupInner.innerHTML = `
    <div class="item-popup-icon">${itemIconSvg(item.slot, item.rarity, 52)}</div>
    <div class="item-popup-name rarity-${item.rarity}">${item.name}</div>
    <div class="item-popup-stats">⚔️ +${item.atk} &nbsp; 🛡️ +${item.def} &nbsp; · ${item.rarity.toUpperCase()} (${RARITY_CHANCE_LABELS[item.rarity]} şans)</div>
    ${item.enchantPct ? `<div class="item-popup-passive" style="color:var(--accent-2)">✨ Efsun: +%${item.enchantPct} ${SLOT_MAP[item.slot].type === "atk" ? "Saldırı" : "Savunma"}</div>` : ""}
    ${getLiveEffectDesc(item) ? `<div class="item-popup-passive">✨ ${getLiveEffectDesc(item)}</div>` : ""}
    ${item.minorTrait ? `<div class="item-popup-passive minor-passive">${item.minorTrait.icon} ${item.minorTrait.name}: ${item.minorTrait.desc}</div>` : ""}
    ${wasEmpty
      ? `<div class="item-popup-passive" style="color:var(--green)">✅ Boş slota otomatik kuşanıldı!</div>`
      : `<div class="popup-quick-actions">
          <button id="popupEquipBtn" class="btn-mini nadir-mini">✅ Şimdi Kuşan</button>
          <button id="popupScrapBtn" class="btn-mini">✨ Hurdaya Çevir<span>+${computeScrapGainForItem(item)} Hurda</span></button>
        </div>`}
  `;
  itemPopup.classList.remove("hidden");

  if (!wasEmpty) {
    document.getElementById("popupEquipBtn").onclick = () => { equipItem(slot, item.id); itemPopup.classList.add("hidden"); };
    document.getElementById("popupScrapBtn").onclick = () => { disenchantItem(slot, item.id); itemPopup.classList.add("hidden"); };
  }

  resetChestVisual();
  setTimeout(() => itemPopup.classList.add("hidden"), 5000);
}

openBoxBtn.onclick = () => {
  if (!canOpenBoxNow()) return;
  performBoxOpen({ isFree: true });
};

