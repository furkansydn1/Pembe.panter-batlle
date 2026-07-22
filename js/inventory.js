import { HURDA_FROM_RARITY, getScrap } from "./core-config.js";
import { closeCollectionBtn, closeInventoryBtn, collectionBtn, collectionList, collectionModal, collectionProgress, inventoryList, inventoryModal, inventoryModalTitle } from "./dom.js";
import { genItemId, getTodaysEvent } from "./events-badges.js";
import { PLAYERS_COL, db, doc, updateDoc } from "./firebase-setup.js";
import { BOOK_TIER_ICONS, LEVEL_REQUIREMENT_BY_RARITY, MAX_UPGRADE_LEVEL, RARITY_CHANCE_LABELS, RARITY_LABELS_TR, canEquipItem, canUpgradeItem, computeStatsFromEquipment, getUpgradeCost, getUpgradeSuccessChance, upgradeItem } from "./item-systems.js";
import { ALL_ITEMS_BY_SLOT, SLOTS, SLOT_MAP, TOTAL_ITEM_COUNT, getLiveEffectDesc, itemIconSvg } from "./items-data.js";
import { emptyEquipment } from "./map.js";
import { createMarketListing } from "./market.js";
import { S } from "./state.js";

// ============================================================
// SEVİYE-DIŞI EŞYA OTOMATİK SÖKÜMÜ (kalıcı çözüm)
// ------------------------------------------------------------
// SORUN: Geçmişte (level kontrolü eklenmeden önce) kutu/pazar "slot boşsa
// otomatik kuşan" akışı seviyeye bakmadan eşya takıyordu. box-open/market
// düzeltmesi YENİ kuşanmaları engelledi ama ZATEN takılı olanları sökmedi —
// bu yüzden bazı oyuncularda hâlâ seviyesinin üstünde eşya takılı kalıyor.
// ÇÖZÜM: Bu fonksiyon oyuncu verisi yüklendiğinde çağrılır; kuşanılı ama
// seviyesi yetmeyen her eşyayı slottan çıkarıp envantere geri koyar (kaybol-
// maz), statları yeniden hesaplayıp Firestore'a yazar. Böylece admin komutuna
// gerek kalmadan HERKES girişte otomatik temizlenir — kalıcı, tek seferlik.
// Değişiklik yoksa Firestore'a hiç yazmaz (gereksiz yazma yok).
export async function autoUnequipOverleveledItems() {
  const data = S.currentPlayerData;
  if (!data || !S.currentPlayerId || !data.equipment) return;
  const level = data.level || 1;
  const newEquipment = { ...data.equipment };
  const newInventory = { ...(data.inventory || {}) };
  let changed = false;

  for (const slot in newEquipment) {
    const item = newEquipment[slot];
    if (!item || !item.rarity) continue;
    const req = LEVEL_REQUIREMENT_BY_RARITY[item.rarity] ?? 1;
    if (level < req) {
      newInventory[slot] = [...(newInventory[slot] || []), item];
      newEquipment[slot] = null;
      changed = true;
    }
  }

  if (!changed) return; // seviye-dışı eşya yok, dokunma
  try {
    const patch = { equipment: newEquipment, inventory: newInventory };
    // statlar ekipmandan yeniden hesaplanabiliyorsa güncelle
    try {
      const stats = computeStatsFromEquipment(newEquipment);
      if (stats && typeof stats.attack === "number") { patch.attack = stats.attack; patch.defense = stats.defense; }
    } catch (e) { /* stat hesaplama imzası farklıysa sadece ekipman/envanteri yaz */ }
    await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), patch);
    // yerel veriyi de güncelle ki UI hemen doğru göstersin
    S.currentPlayerData.equipment = newEquipment;
    S.currentPlayerData.inventory = newInventory;
    if (patch.attack !== undefined) { S.currentPlayerData.attack = patch.attack; S.currentPlayerData.defense = patch.defense; }
    console.warn("[Otomatik söküm] Seviyeni aşan eşyalar envantere alındı.");
  } catch (e) {
    console.error("[Otomatik söküm] hata:", e);
  }
}

// ============================================================
// YİNELENEN ENVANTER ID'Sİ TEMİZLİĞİ (kalıcı çözüm)
// ------------------------------------------------------------
// SORUN [v2 hotfix]: equipItem()'in bir önceki (hatalı) hali, eski kuşanılı
// eşyayı hem getSlotInventory'nin ekranlık "otomatik ekleme"siyle hem de kendi
// "eski eşyayı envantere geri koy" adımıyla İKİ KEZ envantere yazabiliyordu.
// Sonuç: aynı id'ye sahip 2 kopya aynı slotta beliriyordu ("rastgele item
// spawn oldu" bug'ı). equipItem artık düzeltildi ama bu bug'ı equip
// düğmesine basmış olan hesaplarda kalıntı zaten oluşmuş olabilir.
// ÇÖZÜM: Her slotta aynı id'yi taşıyan fazladan kopyaları (ilkini koru,
// gerisini sil) otomatik temizler. Gerçekten farklı 2 eşya (farklı id) asla
// silinmez — sadece BİREBİR id çakışması temizlenir.
export async function dedupeDuplicateInventoryItems() {
  const data = S.currentPlayerData;
  if (!data || !S.currentPlayerId || !data.inventory) return;
  const newInventory = { ...data.inventory };
  let changed = false;

  for (const slot in newInventory) {
    const list = newInventory[slot] || [];
    const seenIds = new Set();
    const seenFingerprints = new Set();
    const deduped = list.filter(it => {
      if (it.id) {
        if (seenIds.has(it.id)) return false;
        seenIds.add(it.id);
        return true;
      }
      // [v2.2 fix] id'siz eski kalıntılar: aynı içerikte (isim+nadirlik+statlar) birden
      // fazlaysa bu da equipItem'in eski hâlinin bıraktığı bir kopyadır — ilkini koru.
      const fp = itemFingerprint(it);
      if (seenFingerprints.has(fp)) return false;
      seenFingerprints.add(fp);
      return true;
    });
    if (deduped.length !== list.length) {
      newInventory[slot] = deduped;
      changed = true;
    }
  }

  if (!changed) return;
  try {
    await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), { inventory: newInventory });
    S.currentPlayerData.inventory = newInventory;
    console.warn("[Yinelenen eşya temizliği] Aynı id'li fazladan eşya kopyaları silindi.");
  } catch (e) {
    console.error("[Yinelenen eşya temizliği] hata:", e);
  }
}

// ============================================================
// HAYALET EŞYA TEMİZLİĞİ (kalıcı çözüm)
// ------------------------------------------------------------
// SORUN: equipItem() (eski hali) eşyayı equipment[slot]'a kopyalıyordu ama
// inventory[slot] dizisinden hiç silmiyordu. Sonuç: kuşanılan eşya aynı id
// ile envanterde de kalıyor, getSlotInventory bunu tekrar tekrar üste EKLEMİYOR
// (id zaten var diye) ama SİLMİYOR de — kart "✅ KUŞANILI" rozetiyle envanterde
// görünmeye devam ediyor, satma/hurdaya çevirme kilitli kalıyor. Bu bug'ı
// yaşamış oyuncularda (equipItem düzeltilmeden ÖNCE kuşanmış olanlarda) veri
// zaten bozuk durumda — kod düzelse bile geçmiş kayıt kendiliğinden temizlenmez.
// ÇÖZÜM: Bu fonksiyon oyuncu verisi yüklendiğinde çağrılır; her slotta,
// equipment[slot]'un id'siyle AYNI id'ye sahip envanter kayıtlarını (hayalet
// kopyaları) siler. Gerçek eşya kaybolmaz — zaten equipment'ta duruyor,
// sadece envanterdeki fazlalık kopya temizlenir. Değişiklik yoksa Firestore'a
// hiç yazmaz.
export async function cleanupGhostEquippedItems() {
  const data = S.currentPlayerData;
  if (!data || !S.currentPlayerId || !data.equipment) return;
  const newInventory = { ...(data.inventory || {}) };
  let changed = false;

  for (const slot in data.equipment) {
    const equipped = data.equipment[slot];
    if (!equipped) continue;
    const rawList = newInventory[slot] || [];
    let filtered;
    if (equipped.id) {
      filtered = rawList.filter(it => it.id !== equipped.id);
    } else {
      // [v2.2 fix] Kuşanılı eşyanın kendisi id'siz (çok eski kayıt) — bu durumda
      // önceden hiç temizlenmiyordu. İçerik parmak izi eşleşen envanter
      // kayıtlarını (kuşanılı eşyanın hayalet kopyaları) temizle.
      const equippedFp = itemFingerprint(equipped);
      filtered = rawList.filter(it => it.id || itemFingerprint(it) !== equippedFp);
    }
    if (filtered.length !== rawList.length) {
      newInventory[slot] = filtered;
      changed = true;
    }
  }

  if (!changed) return; // hayalet kopya yok, dokunma
  try {
    await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), { inventory: newInventory });
    S.currentPlayerData.inventory = newInventory;
    console.warn("[Hayalet eşya temizliği] Kuşanılı eşyaların envanterdeki kalıntı kopyaları silindi.");
  } catch (e) {
    console.error("[Hayalet eşya temizliği] hata:", e);
  }
}

// ============================================================
// KOLEKSİYON KİTABI
// ============================================================
export function renderCollection() {
  const discovered = new Set(S.currentPlayerData?.discoveredItems || []);

  collectionList.innerHTML = SLOTS.map(s => {
    const items = ALL_ITEMS_BY_SLOT[s.key];
    const ownedCount = items.filter(it => discovered.has(it.name)).length;
    const chips = items.map(it => {
      const owned = discovered.has(it.name);
      return `<div class="coll-chip ${owned ? `owned rarity-${it.rarity}` : "locked"}">${owned ? it.name : "???"}</div>`;
    }).join("");
    return `
      <div class="coll-section">
        <div class="coll-section-title">${s.icon} ${s.label} <span>${ownedCount}/${items.length}</span></div>
        <div class="coll-grid">${chips}</div>
      </div>`;
  }).join("");

  const totalOwned = discovered.size;
  collectionProgress.textContent = `${totalOwned} / ${TOTAL_ITEM_COUNT} eşya keşfedildi`;
}

collectionBtn.onclick = () => {
  renderCollection();
  collectionModal.classList.remove("hidden");
};
closeCollectionBtn.onclick = () => collectionModal.classList.add("hidden");

// ============================================================
// ENVANTER SİSTEMİ
// Her slotta artık BİRDEN FAZLA eşya biriktirilebilir. Yeni eşya sadece
// slot boşsa otomatik kuşanılır; doluysa envantere eklenir ve oyuncu
// istediği eşyayı manuel olarak kuşanabilir ya da hurdaya çevirebilir.
// ============================================================
// [v2.2 fix] ORTAK ID NORMALİZASYONU
// ------------------------------------------------------------
// SORUN: getSlotInventory() eskiden id'siz/çakışan eşyalara SADECE ekranda
// gösterirken geçici bir id uyduruyordu (Firestore'a hiç yazılmıyordu).
// equipItem() ise "hangi eşyaya basıldığını" bu ekranlık id ile öğreniyor
// ama envanterden SİLERKEN ham (Firestore) diziyi kullanıyordu — ham dizideki
// öğenin gerçek id'si (genelde undefined) ekranlık id ile hiç eşleşmiyordu.
// Sonuç: filtre hiçbir şey silmiyor, kuşanılan eski eşya envanterde ekstra
// kopya olarak kalıyordu (dedupe/ghost-cleanup da id'siz olduğu için bunu
// yakalayamıyordu, çünkü onlar da gerçek `id` alanına bakıyor).
// ÇÖZÜM: Normalizasyonu TEK yerde yapıp hem ekranda hem equipItem'in
// filtrelemesinde/yazmasında AYNI id'leri kullanıyoruz. equipItem artık bu
// normalize edilmiş listeyi Firestore'a geri yazdığı için id'ler kalıcı hale
// gelir — bir eşya bir kez kuşanılıp bırakıldığında o slottaki tüm id'ler
// sabitlenmiş olur, bug bir daha o slotta tekrarlanmaz.
function normalizeSlotItems(list, slot) {
  const seen = new Set();
  return (list || []).map((it, idx) => {
    if (it.id && !seen.has(it.id)) { seen.add(it.id); return it; }
    let newId = it.id ? `${it.id}-dup${idx}` : `legacy-${slot}-${idx}`;
    while (seen.has(newId)) newId += "x";
    seen.add(newId);
    return { ...it, id: newId };
  });
}

// İki eşyanın "aynı eşya" olup olmadığını id'siz durumlarda da anlamak için
// içerik parmak izi (isim+nadirlik+atk+def+efsun+minor trait). Sadece id'si
// olmayan kalıntıları temizlerken kullanılır, id'si olan eşyalere dokunmaz.
function itemFingerprint(it) {
  if (!it) return "";
  return [it.name, it.rarity, it.atk, it.def, it.enchantPct || 0, it.minorTrait?.id || ""].join("|");
}

export function getSlotInventory(slot) {
  const invRaw = (S.currentPlayerData?.inventory && S.currentPlayerData.inventory[slot]) || [];
  // [v2.3 fix] ESKİ HÂL: kuşanılı eşya envanter dizisinde yoksa (ki equipItem
  // doğru çalıştığından beri HER ZAMAN öyle olur) onu ekranlık olarak listenin
  // başına geri ekliyordu — bu yüzden az önce kuşandığın/uzun süredir takılı
  // olan HER eşya, envanter listesinde de "ekstra bir kart" gibi görünüyordu
  // (veri bozuk değildi, salt görüntüleme kaynaklıydı — bkz. teşhis).
  // Kuşanılı eşya zaten karakter/kuşanım ekranında gösteriliyor; envanter
  // listesinde ayrıca göstermeye gerek yok, bu yüzden bu ekleme tamamen kaldırıldı.
  return normalizeSlotItems(invRaw, slot);
}

export async function equipItem(slot, itemId) {
  if (!S.currentPlayerData) return false;
  const target = getSlotInventory(slot).find(it => it.id === itemId);
  if (!target) { alert("Eşya bulunamadı."); return false; }
  const levelCheck = canEquipItem(target, S.currentPlayerData);
  if (!levelCheck.ok) { alert(levelCheck.reason); return false; }

  const prevEquipped = S.currentPlayerData.equipment?.[slot] || null;
  const newEquipment = { ...(S.currentPlayerData.equipment || emptyEquipment()), [slot]: target };
  const stats = computeStatsFromEquipment(newEquipment, S.currentPlayerData.statAllocated);

  // BUG FIX (v2): HAM (ham Firestore) envanter dizisinden çalış — getSlotInventory()'nin
  // döndürdüğü liste EKRANLIK olarak kuşanılı eşyayı zaten otomatik ekliyor (geriye dönük
  // uyumluluk için). O listeyi baz alıp üstüne bir de "eski kuşanılıyı geri koy" yaparsak
  // eşya İKİ KEZ envantere yazılır (yaşanan "rastgele item spawn" bug'ı buydu). Bu yüzden
  // ham diziyi kullanıyoruz.
  // BUG FIX (v2.2): itemId, getSlotInventory()'nin ekranda ürettiği id — ham dizideki
  // öğenin gerçek id'si onunla eşleşmeyebilir (id'siz/çakışan eski eşyalarda hep böyleydi,
  // bu yüzden filtre hiçbir şey silmiyordu ve kuşanılan eşya envanterde ekstra kalıyordu).
  // Çözüm: ham diziyi ÖNCE getSlotInventory ile AYNI mantıkla normalize et, filtrelemeyi ve
  // yazmayı bu normalize edilmiş (id'leri ekranla birebir aynı) liste üzerinden yap. Böylece
  // hem doğru öğe silinir hem de id'ler Firestore'a kalıcı yazılır (bug o slotta bir daha
  // tekrarlanmaz).
  const rawList = S.currentPlayerData.inventory?.[slot] || [];
  let newInvArr = normalizeSlotItems(rawList, slot).filter(it => it.id !== itemId);

  // Eski kuşanılı eşya varsa ve HAM listede zaten yoksa (id eşleşmiyorsa) envantere geri koy.
  if (prevEquipped && prevEquipped.id !== target.id) {
    const alreadyInInventory = rawList.some(it => it.id && prevEquipped.id && it.id === prevEquipped.id);
    if (!alreadyInInventory) {
      const fixedPrev = prevEquipped.id ? prevEquipped : { ...prevEquipped, id: genItemId() };
      newInvArr = [...newInvArr, fixedPrev];
    }
  }

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
    equipment: newEquipment,
    [`inventory.${slot}`]: newInvArr,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    critStat: stats.critStat,
    maxHp: stats.maxHp,
  });
  return true;
}

// Bir eşyanın hurdaya çevrilince kaç hurda vereceğini hesaplar (nadirlik + günün
// olayı + "Hurdalı" ufak pasifi dahil). Hem gerçek hurdaya çevirme işleminde hem
// de envanter ekranında butonun üstünde önizleme olarak gösterilir.
export function computeScrapGainForItem(item) {
  let scrapGain = Math.round((HURDA_FROM_RARITY[item.rarity] || 0) * getTodaysEvent(S.currentPlayerData).scrapMult);
  if (item.minorTrait?.id === "scrap_boost") {
    scrapGain = Math.round(scrapGain * (1 + item.minorTrait.pct / 100));
  }
  return scrapGain;
}

export async function disenchantItem(slot, itemId) {
  if (!S.currentPlayerData) return;
  const equippedId = S.currentPlayerData.equipment?.[slot]?.id;
  if (equippedId === itemId) { alert("Kuşanılı eşyayı hurdaya çeviremezsin, önce başka bir eşya kuşan."); return; }
  const target = getSlotInventory(slot).find(it => it.id === itemId);
  if (!target) { alert("Eşya bulunamadı."); return; }
  const newInvArr = getSlotInventory(slot).filter(it => it.id !== itemId);
  const scrapGain = computeScrapGainForItem(target);
  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
    [`inventory.${slot}`]: newInvArr,
    scrap: getScrap(S.currentPlayerData) + scrapGain
  });
}


export function openInventoryModal(slot) {
  S.currentInventorySlot = slot;
  renderInventoryModal();
  inventoryModal.classList.remove("hidden");
}

// Envanter modalının üstünde, o slotun 3 nadirliğinin de temel kutu şansını
// gösteren küçük bir bilgi şeridi. Salt bilgilendirme amaçlı, hesaplamayı
// etkilemez.
export function renderDropRatesInfoHtml() {
  return `
    <div class="drop-rates-info">
      <span class="drop-rate-chip rarity-standart">⚪ Standart <b>${RARITY_CHANCE_LABELS.standart}</b></span>
      <span class="drop-rate-chip rarity-nadir">🔷 Nadir <b>${RARITY_CHANCE_LABELS.nadir}</b></span>
      <span class="drop-rate-chip rarity-efsanevi">🌟 Efsanevi <b>${RARITY_CHANCE_LABELS.efsanevi}</b></span>
    </div>`;
}

// ============================================================
// MOBİL SWIPE (KAYDIRMA) İLE EŞYA KUŞANMA/TAKAS
// ------------------------------------------------------------
// V2 Faz 9: Envanter modalındaki (#inventoryModal) her eşya kartı artık
// dokunmatik cihazlarda sağa/sola kaydırılabiliyor. Sağa kaydırma =
// Kuşan (o slotta zaten kuşanılı başka bir eşya varsa otomatik olarak
// yer değiştirir/takas edilir — equipItem() zaten equipment[slot]'un
// üstüne yazdığı için "takas" ayrıca bir kod gerektirmiyor). Sola
// kaydırma = Hurdaya Çevir. Kuşanılı eşya (isEquipped) baştan
// "swipeable" class'ı almıyor (bkz. renderInventoryModal), bu yüzden
// burada ayrıca kontrol etmeye gerek yok — sadece swipeable kartlara
// dokunuluyor. Var olan buton tabanlı akış (data-action) DOKUNULMADI,
// bu sadece ek/alternatif bir giriş yöntemi — masaüstünde mouse ile
// hiçbir şey değişmiyor (touch event'leri fare tıklamalarını etkilemez).
// ============================================================
export const INV_SWIPE_THRESHOLD_PX = 70;
export const INV_SWIPE_MAX_DRAG_PX = 110;

export function attachInventorySwipeGestures(slot) {
  inventoryList.querySelectorAll(".inv-item.swipeable").forEach(card => {
    const content = card.querySelector(".inv-swipe-content");
    const itemId = card.getAttribute("data-id");
    if (!content || !itemId) return;

    let startX = 0, startY = 0, dx = 0, axisLocked = null, dragging = false;

    function setTransform(x, animate) {
      content.style.transition = animate ? "transform .18s ease-out" : "none";
      content.style.transform = `translateX(${x}px)`;
    }

    function reset() { setTransform(0, true); }

    async function commit(direction) {
      // Kartı ekran dışına tamamlayıp kilitle, sonra gerçek işlemi çalıştır.
      // equipItem seviye yetersizse false dönebilir — bu durumda da (uyarı
      // zaten equipItem içinde gösterildi) renderInventoryModal() kartı
      // baştan çizip normal haline döndürüyor, ayrıca bir "reset" gerekmiyor.
      setTransform(direction * (card.offsetWidth || 300), true);
      content.style.pointerEvents = "none";
      inventoryList.querySelectorAll("button").forEach(b => b.disabled = true);
      if (direction > 0) await equipItem(slot, itemId);
      else await disenchantItem(slot, itemId);
      renderInventoryModal();
    }

    content.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0; axisLocked = null; dragging = true;
      content.style.transition = "none";
    }, { passive: true });

    content.addEventListener("touchmove", (e) => {
      if (!dragging || e.touches.length !== 1) return;
      const curX = e.touches[0].clientX;
      const curY = e.touches[0].clientY;
      const rawDx = curX - startX;
      const rawDy = curY - startY;
      if (!axisLocked) {
        if (Math.abs(rawDx) < 8 && Math.abs(rawDy) < 8) return; // henüz karar verilmedi
        axisLocked = Math.abs(rawDx) > Math.abs(rawDy) ? "x" : "y";
      }
      if (axisLocked === "y") return; // dikey kaydırma: listeyi normal scroll'a bırak
      e.preventDefault(); // yatay kaydırma: sayfanın kaymasını engelle
      dx = Math.max(-INV_SWIPE_MAX_DRAG_PX, Math.min(INV_SWIPE_MAX_DRAG_PX, rawDx));
      setTransform(dx, false);
    }, { passive: false });

    content.addEventListener("touchend", () => {
      dragging = false;
      if (axisLocked !== "x") { axisLocked = null; return; }
      axisLocked = null;
      if (dx >= INV_SWIPE_THRESHOLD_PX) commit(1);       // sağa kaydırma → Kuşan
      else if (dx <= -INV_SWIPE_THRESHOLD_PX) commit(-1); // sola kaydırma → Hurdaya Çevir
      else reset();
    });

    content.addEventListener("touchcancel", () => { dragging = false; axisLocked = null; reset(); });
  });
}

export function renderInventoryModal() {
  if (!S.currentInventorySlot) return;
  const slot = S.currentInventorySlot;
  const s = SLOT_MAP[slot];
  inventoryModalTitle.textContent = `${s.icon} ${s.label} Envanteri`;

  const rarityOrder = { efsanevi: 0, nadir: 1, standart: 2 };
  // [v2.4 fix] "Bu slotta eşyan yok" BUG'I:
  // Bir eşya kuşanılınca envanter dizisinden çıkıp equipment'a taşınır; slotta
  // yalnızca o eşya varsa envanter dizisi BOŞ kalıyor ve ekran yanlışlıkla
  // "eşyan yok" diyordu. Çözüm: getSlotInventory (VERİ listesi — yazım güvenli,
  // kuşanılıyı İÇERMEZ, çoğaltma bug'ı önlenir) çıktısına kuşanılı eşyayı
  // SADECE EKRAN İÇİN, id ile tekilleştirerek geri ekliyoruz. Firestore'a yazan
  // hiçbir çağrı bu listeyi kullanmaz (onlar getSlotInventory'yi doğrudan çağırır).
  const equipped = S.currentPlayerData?.equipment?.[slot] || null;
  const equippedId = equipped?.id;
  const dataItems = getSlotInventory(slot);
  let items = dataItems.slice();
  if (equipped && !items.some(it => it.id && equippedId && it.id === equippedId)) {
    items.unshift(equipped); // kuşanılı eşyayı listenin başına (ekranlık)
  }
  items.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);

  const dropRatesHtml = renderDropRatesInfoHtml();

  if (!items.length) {
    inventoryList.innerHTML = dropRatesHtml + `<p class="box-status">Bu slotta henüz eşyan yok, sandık aç ve şansını dene!</p>`;
    return;
  }

  inventoryList.innerHTML = dropRatesHtml + items.map(it => {
    const isEquipped = it.id === equippedId;
    const statLabel = SLOT_MAP[it.slot]?.type === "atk" ? "Saldırı" : "Savunma";
    const upgradeLevel = it.upgradeLevel || 0;
    const upgradeCheck = canUpgradeItem(it, S.currentPlayerData);
    const upCost = getUpgradeCost(it);
    const equipCheck = canEquipItem(it, S.currentPlayerData);
    const levelReq = LEVEL_REQUIREMENT_BY_RARITY[it.rarity] ?? 1;
    const isSwipeable = !isEquipped; // Kuşanılı eşya kaydırılamaz (ne kuşanma ne hurdaya çevirme gerekir)
    return `
      <div class="inv-item inv-item-v2 rarity-${it.rarity} ${isSwipeable ? "swipeable" : ""}" data-id="${it.id}">
        ${isSwipeable ? `
        <div class="inv-swipe-hint inv-swipe-hint-right">✅ Kuşan</div>
        <div class="inv-swipe-hint inv-swipe-hint-left">✨ Hurdaya Çevir</div>` : ""}
        <div class="inv-swipe-content">
        <div class="inv-item-head">
          <div class="inv-item-icon-badge rarity-${it.rarity}">${itemIconSvg(it.slot, it.rarity, 26)}</div>
          <div class="inv-item-head-body">
            <span class="inv-item-name">${it.name}${upgradeLevel ? ` <b class="update-badge done">+${upgradeLevel}${upgradeLevel >= MAX_UPGRADE_LEVEL ? " MAKS" : ""}</b>` : ""}</span>
            <span class="inv-item-rarity-tag rarity-${it.rarity}">${RARITY_LABELS_TR[it.rarity]} · ${RARITY_CHANCE_LABELS[it.rarity]} şans · 🔒 Sv. ${levelReq}+</span>
          </div>
          ${isEquipped ? `<span class="update-badge done">✅ KUŞANILI</span>` : ""}
        </div>
        <div class="inv-item-stat-pills">
          <span class="inv-stat-pill atk">⚔️ +${it.atk}</span>
          <span class="inv-stat-pill def">🛡️ +${it.def}</span>
          ${it.enchantPct ? `<span class="inv-stat-pill enchant">✨ Efsun +%${it.enchantPct} ${statLabel}</span>` : ""}
        </div>
        ${getLiveEffectDesc(it) ? `<div class="item-popup-passive" style="margin-top:6px;">✨ ${getLiveEffectDesc(it)}</div>` : ""}
        ${it.minorTrait ? `<div class="item-popup-passive minor-passive" style="margin-top:6px;">${it.minorTrait.icon} <b>${it.minorTrait.name}:</b> ${it.minorTrait.desc}</div>` : ""}
        <div class="inv-item-actions">
          <button class="btn-mini nadir-mini" data-action="equip" data-id="${it.id}" ${isEquipped || !equipCheck.ok ? "disabled" : ""} title="${equipCheck.ok ? "" : equipCheck.reason}">Kuşan${equipCheck.ok ? "" : ` (🔒 Sv. ${levelReq})`}</button>
          <button class="btn-mini" data-action="scrap" data-id="${it.id}" ${isEquipped ? "disabled" : ""}>Hurdaya Çevir<span>✨ +${computeScrapGainForItem(it)} Hurda</span></button>
          <button class="btn-mini nadir-mini" data-action="upgrade" data-id="${it.id}" ${upgradeCheck.ok ? "" : "disabled"} title="${upgradeCheck.ok ? "" : upgradeCheck.reason}">+ Basma (+${upgradeLevel} → +${upgradeLevel + 1}) · %${Math.round(getUpgradeSuccessChance(upgradeLevel + 1) * 100)} şans<span>✨ ${upCost.hurdaCost} Hurda + ${upCost.bookCost}x ${BOOK_TIER_ICONS[it.rarity]}</span></button>
          <button class="btn-mini gold-mini" data-action="sell" data-id="${it.id}" ${isEquipped ? "disabled" : ""} title="Oyuncular Arası Pazar'a listele">🪙 Pazara Çıkar</button>
        </div>
        </div>
      </div>`;
  }).join("");

  inventoryList.querySelectorAll("button[data-action]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      if (action === "sell") {
        // Basit fiyat girişi — codebase'in geri kalanı da (miktar girişleri,
        // hurda bahis input'u vb.) prompt() yerine küçük input alanları
        // kullanıyor ama burada tek seferlik bir sayı istendiği için native
        // prompt() en az kod ile aynı işi görüyor.
        const priceStr = prompt("Kaç Altına satışa çıkarmak istiyorsun?");
        if (priceStr === null) return;
        const price = Number(priceStr);
        if (!Number.isFinite(price) || price <= 0) { alert("Geçerli bir Altın miktarı gir."); return; }
        await createMarketListing(slot, id, price);
        renderInventoryModal();
        return;
      }
      inventoryList.querySelectorAll("button").forEach(b => b.disabled = true);
      if (action === "equip") await equipItem(slot, id);
      else if (action === "upgrade") {
        const result = await upgradeItem(slot, id);
        if (result) showUpgradeResultModal(result);
      }
      else await disenchantItem(slot, id);
      renderInventoryModal();
    };
  });

  attachInventorySwipeGestures(slot);
}
closeInventoryBtn.onclick = () => { inventoryModal.classList.add("hidden"); S.currentInventorySlot = null; };

// ============================================================
// + BASMA SONUÇ EKRANI (başarı / başarısızlık)
// ------------------------------------------------------------
// index.html'de hazır bir modal id'si olmadığı için tamamen kendi kendine
// yeten (inline stilli), DOM'a runtime'da eklenip kaldırılan bir overlay.
// Mevcut CSS dosyalarına dokunmuyor, bu yüzden css/ dosyaları değişmeden
// çalışır. Sadece bir kere <style> etiketi enjekte edilir (ilk çağrıda).
// ============================================================
let upgradeResultStyleInjected = false;
function ensureUpgradeResultStyles() {
  if (upgradeResultStyleInjected) return;
  upgradeResultStyleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .upg-result-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.72);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity .18s ease-out;
      padding: 20px;
    }
    .upg-result-overlay.show { opacity: 1; }
    .upg-result-card {
      width: 100%; max-width: 340px;
      background: linear-gradient(160deg, #201626, #150e1a);
      border-radius: 18px;
      padding: 26px 22px 22px;
      text-align: center;
      box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      transform: scale(.85); transition: transform .22s cubic-bezier(.34,1.56,.64,1);
    }
    .upg-result-overlay.show .upg-result-card { transform: scale(1); }
    .upg-result-card.success { border: 2px solid #ffcc4d; }
    .upg-result-card.fail { border: 2px solid #ff5566; animation: upgShake .4s ease; }
    @keyframes upgShake {
      0%, 100% { transform: translateX(0) scale(1); }
      20% { transform: translateX(-8px) scale(1); }
      40% { transform: translateX(8px) scale(1); }
      60% { transform: translateX(-5px) scale(1); }
      80% { transform: translateX(5px) scale(1); }
    }
    .upg-result-icon { font-size: 44px; line-height: 1; margin-bottom: 10px; }
    .upg-result-title { font-size: 19px; font-weight: 800; margin-bottom: 6px; }
    .upg-result-card.success .upg-result-title { color: #ffcc4d; }
    .upg-result-card.fail .upg-result-title { color: #ff5566; }
    .upg-result-item { font-size: 14px; color: #e9e2f2; margin-bottom: 4px; font-weight: 600; }
    .upg-result-sub { font-size: 13px; color: #b9adc9; margin-bottom: 18px; }
    .upg-result-btn {
      background: linear-gradient(135deg, #ff6fa5, #a855f7);
      color: #fff; border: none; border-radius: 12px;
      padding: 11px 0; width: 100%; font-size: 15px; font-weight: 700;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

export function showUpgradeResultModal(result) {
  ensureUpgradeResultStyles();
  const { success, item, targetLevel, hurdaCost, bookCost, bookTier } = result;

  const overlay = document.createElement("div");
  overlay.className = "upg-result-overlay";
  overlay.innerHTML = `
    <div class="upg-result-card ${success ? "success" : "fail"}">
      <div class="upg-result-icon">${success ? "✨" : "❌"}</div>
      <div class="upg-result-title">${success ? "Başarılı!" : "Başarısız!"}</div>
      <div class="upg-result-item">${item.name} ${success ? `+${targetLevel}'e yükseldi` : "yükseltilemedi"}</div>
      <div class="upg-result-sub">${success
        ? "Yeni gücüyle savaşa hazır."
        : `${hurdaCost} Hurda + ${bookCost}x ${BOOK_TIER_ICONS[bookTier]} boşa gitti, eşya +${targetLevel - 1} seviyesinde kaldı.`}</div>
      <button class="upg-result-btn">Tamam</button>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const close = () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 180);
  };
  overlay.querySelector(".upg-result-btn").onclick = close;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

