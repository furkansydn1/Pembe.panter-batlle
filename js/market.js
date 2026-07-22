import { performBoxOpen } from "./box-open.js";
import { getGold, getScrap } from "./core-config.js";
import { buyEfsaneviChestBtn, buyKabusBoxBtn, buyMitikBoxBtn, buyNadirChestBtn, marketDailyGridEl, marketListingsGridEl, myListingsGridEl, tradeBanBannerEl, tradeBanReasonTextEl, tradeLogsFeedEl } from "./dom.js";
import { MARKET_LISTINGS_COL, PLAYERS_COL, TRADE_LOGS_COL, collection, db, doc, getDoc, getDocs, query, runTransaction, updateDoc, where, writeBatch } from "./firebase-setup.js";
import { getSlotInventory } from "./inventory.js";
import { BOOK_TIER_ICONS, BOOK_TIER_NAMES, RARITY_LABELS_TR, RARITY_ORDER, TIER_STAT_RANGE, canEquipItem, computeStatsFromEquipment, getBooks } from "./item-systems.js";
import { SLOT_MAP, getLiveEffectDesc, itemIconSvg } from "./items-data.js";
import { emptyEquipment } from "./map.js";
import { getSlotInventoryGeneric } from "./quests.js";
import { S } from "./state.js";

// ============================================================
// MARKET (V2 Faz 4 — kısmen uygulandı)
// ------------------------------------------------------------
// Üç ayrı satın alma yüzeyi:
// 1) Günlük Market: her gün 5 rastgele eşya, statları GÖRÜNÜR halde (Kutu'nun
//    aksine sürpriz yok), Altın karşılığı satın alınıyor. Faz 4 notu: "şimdiki
//    itemlerle yap, sonra yeni eşya isimleri eklenecek" — bu yüzden rarity havuzu
//    şimdilik sadece standart/nadir/efsanevi (STANDARD_NAMES/RARE_NAMES/
//    LEGENDARY_ITEMS), Mitik/Kabus isim havuzu eklenince genişletilebilir.
// 2) Kalıcı Nadir/Efsanevi Sandık: rotasyona dahil değil, her zaman satın
//    alınabilir, Günlük Sandık'taki performBoxOpen() akışını (aynı animasyon/
//    popup) costGold parametresiyle yeniden kullanıyor. Eskiden Kutu
//    sekmesinde Hurda karşılığı bir "Garanti Nadir/Efsanevi" butonu vardı
//    (guaranteeRareBtn/guaranteeLegendaryBtn, HURDA_COST_RARE_BOX/
//    HURDA_COST_LEGENDARY_BOX) — kullanıcı isteğiyle TAMAMEN kaldırıldı,
//    Nadir/Efsanevi'ye ulaşmanın tek satın alma yolu artık burası.
// 3) Kabus/Mitik Özel Kutu: SADECE fiyat/UI iskeleti var. generateLootItemForRarity()
//    "mitik"/"kabus" dalını bilerek desteklemiyor (bkz. o fonksiyonun altındaki not
//    — isim havuzu yok, pick(undefined) çöker). Buton bu yüzden şu an bilgi
//    mesajı gösteriyor, gerçek satın alma bağlanmadı; isim havuzları eklenince
//    buyPermanentChest() ile aynı desene bağlanabilir.
export const MARKET_DAILY_ITEM_COUNT = 5;
// Günlük Market'in kendi rarity ağırlığı — Kutu'dan (artık standart-only) farklı
// olarak burada Nadir/Efsanevi de çıkabiliyor, çünkü bu "drop" değil, statı görünen
// bilinçli bir satın alma. Yüzdeler toplamı 100.
// [ORAN DÜZELTME] Efsanevi %8 → %2: 5 slotluk günlük markette %8, "aynı gün
// 2 efsanevi" durumunu ~%5 ihtimalle (2-3 haftada bir) üretiyordu — "çok düşük
// olmalı" hedefine göre fazlaydı. %2 ile: efsanevi ~10 günde bir tek görünür,
// aynı gün 2 tanesi ~%0.4 (yılda bir-iki kez).
export const MARKET_RARITY_WEIGHTS = { efsanevi: 2, nadir: 33, standart: 65 };
// Taban fiyatlar = her rarity'nin Altın aralığının ORTA NOKTASI (tam sayı).
// computeFairTradeGoldPrice() (oyuncular arası pazarda "adil fiyat" hesabı)
// hâlâ bu objeyi kullanıyor, o yüzden silinmedi.
export const MARKET_GOLD_PRICE_BASE = { standart: 250, nadir: 550, efsanevi: 1100 };
// V2 güncelleme: eskiden fiyat "taban ± yüzde" (ör. 90 ± %15) ile üretiliyordu.
// Yüzdelik yöntem bazı rarity'lerde küsüratlı oranlar gerektirdiği için TAMAMEN
// kaldırıldı. Artık her rarity'nin kesin, küsüratsız MIN-MAX Altın aralığı var:
export const MARKET_GOLD_PRICE_RANGE = {
  standart: [150, 350],
  nadir: [400, 700],
  efsanevi: [800, 1400],
};
// ÖNEMLİ: fiyatı üreten kod (muhtemelen game-core.js içinde, dailyMarket
// oluşturulurken) eskiden `Math.round(base * (1 + (Math.random()*2-1) * MARKET_PRICE_VARIANCE))`
// benzeri bir satır kullanıyorduysa, artık şuna güncellenmeli:
//   const [min, max] = MARKET_GOLD_PRICE_RANGE[rarity];
//   const price = min + Math.round(Math.random() * (max - min));
// O dosyayı atarsan çağrı noktasını bulup güncelleyip doğrularım.

// Kalıcı ürünler — "çok yüksek altın fiyatı" (Günlük Market'in en pahalı
// standart kalemine göre kabaca 10x/40x). Dengeleme/tuning sonradan kolayca
// değiştirilebilir, tek kaynak burası.
export const MARKET_PERMANENT_CHEST_PRICE = { nadir: 1000, efsanevi: 4000 };

// Kabus/Mitik özel kutu — fiyat placeholder, satın alma akışı henüz bağlı değil.
export const MARKET_SPECIAL_BOX_PRICE = { mitik: 25000, kabus: 70000 };

// ============================================================
// OYUNCULAR ARASI PAZAR (Trade) + ANTI-ABUSE (V2 Faz 4, madde 4/5)
// ------------------------------------------------------------
// İki yeni top-level koleksiyon (player alt-koleksiyonu DEĞİL, players ile
// aynı seviyede — güvenlik kuralları için bkz. ayrı `firestore.rules`
// dosyası, Faz 9'da teslim edildi):
//   marketListings/{id}: { sellerId, sellerNick, item, priceGold, status:
//     "active"|"sold"|"cancelled"|"reversed", createdAt, buyerId?, buyerNick?, soldAt? }
//   tradeLogs/{id}: { listingId, sellerId, sellerNick, buyerId, buyerNick,
//     item, priceGold, fairPriceGold, timestamp, flagged, flagReason, reversed }
//
// [V2 Faz 9 düzeltmesi]: Bu yorum önceden "dosyanın sonundaki FIRESTORE_RULES
// yorumuna" atıfta bulunuyordu ama böyle bir blok hiçbir zaman yazılmamıştı —
// gerçek kurallar artık ayrı bir `firestore.rules` dosyasında + test paketiyle
// birlikte teslim edildi (bkz. SKILL.md "GÜVENLİK KURALLARI" bölümü).
//
// ANTI-ABUSE ("Çok Kritik" — sadece loglamıyor, otomatik engelliyor/geri alıyor):
// İki ayrı tespit ekseni var:
//   1) Fiyat dengesizliği: computeFairTradeGoldPrice(item) ile hesaplanan
//      "adil fiyat"ın ±%TRADE_FAIR_PRICE_TOLERANCE dışına çıkan bir satın
//      alma, buyMarketListing()'in İÇİNDEKİ runTransaction'da tespit edilir.
//      ÖNEMLİ TASARIM NOTU: Bu istemci-taraflı bir oyun olduğu için (Cloud
//      Functions/sunucu yok), "otomatik iade" burada "önce gerçekleştir,
//      sonra geri al" olarak DEĞİL, "aynı atomik transaction commit
//      edilmeden reddet" olarak uygulandı — net sonuç birebir aynı (ne
//      altın ne eşya asla el değiştirmiyor) ama daha güvenli: gerçekten
//      "yap sonra geri al" modelinde biri işlemin ortasında bağlantıyı
//      kesip sahte bir kazanç penceresi yaratabilirdi, atomik red bu
//      riski baştan ortadan kaldırıyor. Kullanıcıya gösterilen sonuç
//      ("ticaret engellendi + banlandı") davranışsal olarak istenenle aynı.
//   2) İkili ticaret hızı: aynı satıcı+alıcı ikilisi TRADE_PAIR_WINDOW_MS
//      içinde TRADE_PAIR_MAX_TRADES'ten fazla ticaret tamamlamışsa (fiyat
//      adil olsa bile — küçük miktarlarda tekrarlanan altın/eşya transferi
//      klasik bir hesap-arası kaynak aktarma/RMT deseni), yeni denemeler
//      transaction'a hiç girmeden reddedilir ve ikisi de banlanır.
// Her iki durumda da tradeLogs'a flagged:true bir kayıt düşülür; gerçekten
// tamamlanan (dengesiz OLMAYAN) ticaretler flagged:false ile loglanır —
// yani tradeLogs "sadece loglama" değil, aynı zamanda denetim izi.
export const TRADE_FAIR_PRICE_TOLERANCE = 0.35; // adil fiyatın ±%35'i dışı = dengesiz
export const TRADE_PAIR_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 saat
export const TRADE_PAIR_MAX_TRADES = 3; // aynı ikili, bu pencerede en fazla 3 tamamlanmış ticaret
export const TRADE_LISTING_MAX_ACTIVE_PER_PLAYER = 5; // spam'i önlemek için basit bir üst sınır

// Bir eşyanın "adil" Altın değeri: Günlük Market'in taban fiyatını (rarity)
// baz alıp, o rarity'nin stat aralığında (TIER_STAT_RANGE) nereye düştüğüne
// göre %70-%130 arasında ince ayar yapar. Mitik/Kabus şu an droplanmıyor
// ama biri ileride admin/test yoluyla üretirse diye taban fiyatları da var.
export const MARKET_GOLD_PRICE_BASE_EXT = { ...MARKET_GOLD_PRICE_BASE, mitik: 800, kabus: 2500 };
export function computeFairTradeGoldPrice(item) {
  const base = MARKET_GOLD_PRICE_BASE_EXT[item.rarity] ?? MARKET_GOLD_PRICE_BASE_EXT.standart;
  const slotInfo = SLOT_MAP[item.slot];
  const range = TIER_STAT_RANGE[item.rarity];
  let qualityMult = 1;
  if (slotInfo && range) {
    const [min, max] = range;
    const primary = slotInfo.type === "atk" ? item.atk : item.def;
    const q = max > min ? Math.min(1, Math.max(0, (primary - min) / (max - min))) : 0.5;
    qualityMult = 0.7 + q * 0.6; // %70 - %130 arası
  }
  return Math.max(1, Math.round(base * qualityMult));
}

// Savaşta ezici stat üstünlüğü (bu kat kadar fazla güç) varsa şansa bakılmaksızın kazanılır.
export const DOMINANCE_RATIO = 1.5;

// ============================================================
// MARKET (V2 Faz 4 — Günlük Market + Kalıcı Nadir/Efsanevi + Özel Kutu)
// ============================================================

// Günlük Market kartı: statlar baştan görünür (Kutu'nun aksine sürpriz yok),
// bag-panel'deki .inv-item-v2 kartlarıyla aynı görsel dil kullanılıyor.
export function renderMarketTab() {
  if (!S.currentPlayerData || !marketDailyGridEl) return;

  const gold = getGold(S.currentPlayerData);
  // FADELESS Çarşı cüzdanı: Altın + Hurda göstergelerini doldur.
  const goldEl = document.getElementById("myGoldMarket");
  const scrapEl = document.getElementById("myScrapMarket");
  if (goldEl) goldEl.textContent = gold;
  if (scrapEl) scrapEl.textContent = getScrap(S.currentPlayerData);
  const items = Array.isArray(S.currentPlayerData.dailyMarket) ? S.currentPlayerData.dailyMarket : [];

  if (!items.length) {
    marketDailyGridEl.innerHTML = `<p class="box-status">Günlük Market hazırlanıyor, birazdan gelir...</p>`;
  } else {
    marketDailyGridEl.innerHTML = items.map(it => {
      const canAfford = gold >= it.price;
      const statLabel = SLOT_MAP[it.slot]?.type === "atk" ? "Saldırı" : "Savunma";
      // FADELESS Çarşı v2: premium stat-pill görünümü (css/10-carsi.css →
      // #tabMarket .mkt-wares). İKON DEĞİŞMEDİ — hâlâ itemIconSvg(slot,rarity)
      // ile slot'a bağlı çiziliyor, o yüzden isim↔ikon eşleşmesi kaymaz.
      // data-market-buy / .price-tag / r-{rarity} hook'ları da korunuyor.
      const slotLabel = SLOT_MAP[it.slot]?.label || "";
      const liveDesc = getLiveEffectDesc(it);
      const pills = [
        `<span class="wp">⚔️ <b>+${it.atk}</b></span>`,
        `<span class="wp">🛡️ <b>+${it.def}</b></span>`
      ];
      if (it.enchantPct) pills.push(`<span class="wp">✨ <b>+%${it.enchantPct}</b> ${statLabel}</span>`);
      if (liveDesc) pills.push(`<span class="wp">${liveDesc}</span>`);
      if (it.minorTrait) pills.push(`<span class="wp">${it.minorTrait.icon} ${it.minorTrait.name}</span>`);
      return `
        <div class="ware-card r-${it.rarity}">
          <div class="ware-ico">${itemIconSvg(it.slot, it.rarity, 30)}</div>
          <div class="ware-body">
            <div class="ware-name">${it.name}</div>
            <div class="ware-rar">${RARITY_LABELS_TR[it.rarity]} · ${slotLabel}</div>
            <div class="ware-pills">${pills.join("")}</div>
          </div>
          <button type="button" class="price-tag ${it.purchased || !canAfford ? "sold" : ""}" data-market-buy="${it.id}" ${it.purchased || !canAfford ? "disabled" : ""}>
            ${it.purchased ? "✅ Alındı" : `◉ ${it.price}`}
          </button>
        </div>`;
    }).join("");

    marketDailyGridEl.querySelectorAll("[data-market-buy]").forEach(btn => {
      btn.onclick = () => buyMarketItem(btn.getAttribute("data-market-buy"));
    });
  }

  // Not: `disabled` ATANMIYOR — disabled buton click event'i hiç ateşlemez,
  // yani altın yetersizken buyPermanentChest/buySpecialBox içindeki "Yeterli
  // Altının yok" uyarısı hiç tetiklenemezdi (Nadir/Efsanevi'nin eski kilit
  // bug'ı buydu). Bunun yerine sadece görsel "soluk" class'ı toggle'lanıyor;
  // buton tıklanabilir kalır, uyarıyı fonksiyonların kendisi verir. 4'ü aynı.
  if (buyNadirChestBtn) {
    buyNadirChestBtn.classList.toggle("cant-afford", gold < MARKET_PERMANENT_CHEST_PRICE.nadir);
    buyNadirChestBtn.querySelector(".co-p-val").textContent = MARKET_PERMANENT_CHEST_PRICE.nadir;
  }
  if (buyEfsaneviChestBtn) {
    buyEfsaneviChestBtn.classList.toggle("cant-afford", gold < MARKET_PERMANENT_CHEST_PRICE.efsanevi);
    buyEfsaneviChestBtn.querySelector(".co-p-val").textContent = MARKET_PERMANENT_CHEST_PRICE.efsanevi;
  }
  if (buyMitikBoxBtn) {
    buyMitikBoxBtn.classList.toggle("cant-afford", gold < MARKET_SPECIAL_BOX_PRICE.mitik);
    buyMitikBoxBtn.querySelector(".co-p-val").textContent = MARKET_SPECIAL_BOX_PRICE.mitik;
  }
  if (buyKabusBoxBtn) {
    buyKabusBoxBtn.classList.toggle("cant-afford", gold < MARKET_SPECIAL_BOX_PRICE.kabus);
    buyKabusBoxBtn.querySelector(".co-p-val").textContent = MARKET_SPECIAL_BOX_PRICE.kabus;
  }
}

// Günlük Market'ten tek bir eşya satın alır: Kutu akışının aksine animasyon
// yok, statlar zaten görünürdü — direkt envantere/kuşanıma ekleniyor.
export async function buyMarketItem(itemId) {
  if (!S.currentPlayerData) return;
  const data = S.currentPlayerData;
  const items = Array.isArray(data.dailyMarket) ? data.dailyMarket : [];
  const idx = items.findIndex(it => it.id === itemId);
  if (idx === -1) { alert("Bu eşya artık Market'te değil."); return; }
  const target = items[idx];
  if (target.purchased) { alert("Bu eşyayı zaten aldın."); return; }
  if (getGold(data) < target.price) { alert("Yeterli Altının yok."); return; }

  const slot = target.slot;
  const item = { ...target };
  delete item.price;
  delete item.purchased;

  // Slot boşsa otomatik kuşanma davranışı SADECE oyuncu bu eşyanın seviye
  // gereksinimini karşılıyorsa uygulanır — aksi halde eşya envantere düşer
  // ama kuşanılmaz (bkz. item-systems.js canEquipItem/LEVEL_REQUIREMENT_BY_RARITY).
  const wasEmpty = !(data.equipment && data.equipment[slot]) && canEquipItem(item, data).ok;
  const newInvArr = [...getSlotInventory(slot), item];
  const newEquipment = wasEmpty
    ? { ...(data.equipment || emptyEquipment()), [slot]: item }
    : (data.equipment || emptyEquipment());
  const stats = computeStatsFromEquipment(newEquipment, data.statAllocated);
  const newDiscovered = Array.from(new Set([...(data.discoveredItems || []), item.name]));

  const newDailyMarket = [...items];
  newDailyMarket[idx] = { ...target, purchased: true };

  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), {
    equipment: newEquipment,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    critStat: stats.critStat,
    maxHp: stats.maxHp,
    [`inventory.${slot}`]: newInvArr,
    discoveredItems: newDiscovered,
    gold: getGold(data) - target.price,
    dailyMarket: newDailyMarket
  });
}

// Kalıcı Nadir/Efsanevi Sandık: rotasyona dahil değil, Günlük Sandık'taki
// aynı açılış animasyonunu/popup'ını costGold ile yeniden kullanıyor.
export function buyPermanentChest(rarity) {
  if (!S.currentPlayerData) return;
  const price = MARKET_PERMANENT_CHEST_PRICE[rarity];
  if (getGold(S.currentPlayerData) < price) { alert("Yeterli Altının yok."); return; }
  performBoxOpen({ forcedRarity: rarity, costGold: price, isFree: false });
}

buyNadirChestBtn.onclick = () => buyPermanentChest("nadir");
buyEfsaneviChestBtn.onclick = () => buyPermanentChest("efsanevi");

// Kabus/Mitik Özel Kutu: isim havuzları (MITIK_NAMES/KABUS_NAMES) ve
// generateLootItemForRarity'nin mitik/kabus dalı EKLENDİ — artık gerçek
// satın alma bağlı. buyPermanentChest ile birebir aynı desen: forcedRarity
// ile performBoxOpen çağrılır, kutu açma animasyonu/popup'ı mitik/kabus
// renk ve parçacıklarıyla (bkz. box-open CHEST_RARITY_STYLES) oynar.
export function buySpecialBox(tier) {
  if (!S.currentPlayerData) return;
  const price = MARKET_SPECIAL_BOX_PRICE[tier];
  if (getGold(S.currentPlayerData) < price) { alert("Yeterli Altının yok."); return; }
  performBoxOpen({ forcedRarity: tier, costGold: price, isFree: false });
}
buyMitikBoxBtn.onclick = () => buySpecialBox("mitik");
buyKabusBoxBtn.onclick = () => buySpecialBox("kabus");

// ============================================================
// OYUNCULAR ARASI PAZAR — SATIN ALMA/LİSTELEME/İPTAL + ANTI-ABUSE
// (bkz. dosyanın başındaki "OYUNCULAR ARASI PAZAR" yorum bloğu — tasarım
// gerekçeleri, tolerans sabitleri ve koleksiyon şeması orada.)
// ============================================================

export function renderTradeBanBanner() {
  if (!tradeBanBannerEl || !S.currentPlayerData) return;
  // [TİCARET SERBEST] ban banner'ı her zaman gizli — banner ve sebep metni artık hiç gösterilmez.
  tradeBanBannerEl.classList.toggle("hidden", true);
}

// Bir oyuncunun o an aktif kaç listelemesi var — spam limiti (TRADE_LISTING_MAX_ACTIVE_PER_PLAYER)
// için S.allMarketListings'in canlı önbelleğinden okunuyor (ekstra bir sorguya gerek yok).
export function getMyActiveListings() {
  if (!S.currentPlayerId) return [];
  return S.allMarketListings.filter(l => l.sellerId === S.currentPlayerId && l.status === "active");
}

// Aynı satıcı+alıcı ikilisi kısa sürede çok fazla ticaret tamamlamış mı?
// Composite index gerektirmeyen tek-alanlı bir sorgu (sellerId == X), pencere/
// karşı taraf filtresi client-side yapılıyor — 9-10 kişilik bir oyun için
// bu sorgu hacmi önemsiz.
// Denetim izine tek satır "işaretli" ticaret kaydı yazar (ban YOK).
async function __writeTradeFlagLog(sellerId, buyerId, reason, flagReason) {
  const batch = writeBatch(db);
  batch.set(doc(collection(db, TRADE_LOGS_COL)), {
    sellerId, buyerId, timestamp: Date.now(),
    flagged: true, flagReason: flagReason || "manuel_inceleme", reason, autoBan: false
  });
  await batch.commit();
}

export async function checkTradePairVelocity(sellerId, buyerId) {
  const cutoff = Date.now() - TRADE_PAIR_WINDOW_MS;
  const q = query(collection(db, TRADE_LOGS_COL), where("sellerId", "==", sellerId));
  const snap = await getDocs(q);
  let count = 0;
  snap.forEach(d => {
    const t = d.data();
    if (t.buyerId === buyerId && !t.reversed && (t.timestamp || 0) >= cutoff) count++;
  });
  return count >= TRADE_PAIR_MAX_TRADES;
}

// Ticaret gerçekleşmeden ÖNCE (transaction'a hiç girmeden) tespit edilen
// ikili-hız istismarı için: ikisini de banla + denetim izine bir kayıt düş.
// [OTO-BAN KALDIRILDI] Eski flagAndBanTradePair ikisini de banlıyordu; artık
// SADECE denetim izine kayıt düşer (admin elle banlar). İsim korunur ki başka
// çağrı varsa kırılmasın; ban satırları çıkarıldı.
export async function logTradeFlag(sellerId, buyerId, reason, flagReason) {
  try {
    await __writeTradeFlagLog(sellerId, buyerId, reason, flagReason);
  } catch (e) { console.warn("[ticaret] flag log yazılamadı:", e); }
}
export async function flagAndBanTradePair(sellerId, buyerId, reason) {
  // [OTO-BAN KALDIRILDI] ban update'leri silindi; sadece log kalıyor.
  const batch = writeBatch(db);
  batch.set(doc(collection(db, TRADE_LOGS_COL)), {
    listingId: null, sellerId, sellerNick: null, buyerId, buyerNick: null,
    item: null, priceGold: null, fairPriceGold: null,
    timestamp: Date.now(), flagged: true, flagReason: "pair_velocity", reversed: false
  });
  await batch.commit();
}

// Envanterden bir eşyayı Pazar'a listeler (bkz. renderInventoryModal → "🪙 Pazara Çıkar").
export async function createMarketListing(slot, itemId, priceGold) {
  if (!S.currentPlayerData || !S.currentPlayerId) return;
  // [TİCARET SERBEST] yasak kontrolü kaldırıldı
  const price = Math.round(Number(priceGold));
  if (!Number.isFinite(price) || price <= 0) { alert("Geçerli bir Altın fiyatı gir."); return; }
  const equippedId = S.currentPlayerData.equipment?.[slot]?.id;
  if (equippedId === itemId) { alert("Kuşanılı eşyayı satışa çıkaramazsın, önce başka bir eşya kuşan."); return; }
  const target = getSlotInventory(slot).find(it => it.id === itemId);
  if (!target) { alert("Eşya bulunamadı."); return; }
  if (getMyActiveListings().length >= TRADE_LISTING_MAX_ACTIVE_PER_PLAYER) {
    alert(`En fazla ${TRADE_LISTING_MAX_ACTIVE_PER_PLAYER} aktif listelemen olabilir.`);
    return;
  }

  const newInvArr = getSlotInventory(slot).filter(it => it.id !== itemId);
  const listingRef = doc(collection(db, MARKET_LISTINGS_COL));
  const batch = writeBatch(db);
  batch.update(doc(db, PLAYERS_COL, S.currentPlayerId), { [`inventory.${slot}`]: newInvArr });
  batch.set(listingRef, {
    sellerId: S.currentPlayerId,
    sellerNick: S.currentPlayerData.nick || "?",
    item: target,
    priceGold: price,
    status: "active",
    createdAt: Date.now()
  });
  await batch.commit();
}

// ============================================================
// KİTAP / HURDA SATIŞI (Pazar — stack'lenen materyal listelemesi)
// ------------------------------------------------------------
// Eşya listelemelerinden (createMarketListing) farklı olarak burada
// listelenen şey benzersiz bir eşya değil, stack'lenen bir materyal
// (Hurda ya da belirli bir tier Kitabı). Bu yüzden `item` alanı slot/atk/
// def içermez, bunun yerine { kind: "scrap"|"book", tier?, amount, name,
// icon } şeklindedir. Aynı marketListings koleksiyonunu kullanır — render/
// satın alma/iptal fonksiyonları item.kind alanına bakarak dallanır.
// ÖNEMLİ (adil fiyat kontrolü): computeFairTradeGoldPrice() eşyaların
// rarity+stat aralığına göre kurulu, stack'lenen materyaller için anlamlı
// bir "adil fiyat" tanımı yok (satıcı 1 Hurda'ya da 1000 Hurda'ya da
// istediği fiyatı biçebilir) — bu yüzden kitap/hurda listelemeleri
// TRADE_FAIR_PRICE_TOLERANCE / otomatik-engelleme mekanizmasına dahil
// DEĞİL (bkz. buyMarketListing). İkili-hız (RMT) kontrolü ise fiyattan
// bağımsız olduğu için tüm listeleme tiplerinde aynı şekilde uygulanmaya
// devam ediyor.
// ============================================================
export function buildResourceListingItem(kind, tier, amount) {
  if (kind === "scrap") return { kind: "scrap", amount, name: "Hurda", icon: "✨" };
  return { kind: "book", tier, amount, name: BOOK_TIER_NAMES[tier], icon: BOOK_TIER_ICONS[tier] };
}

export async function createResourceListing(kind, tier, amount, priceGold) {
  if (!S.currentPlayerData || !S.currentPlayerId) return;
  // [TİCARET SERBEST] yasak kontrolü kaldırıldı
  const price = Math.round(Number(priceGold));
  if (!Number.isFinite(price) || price <= 0) { alert("Geçerli bir Altın fiyatı gir."); return; }
  const amt = Math.round(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) { alert("Geçerli bir miktar gir."); return; }
  if (getMyActiveListings().length >= TRADE_LISTING_MAX_ACTIVE_PER_PLAYER) {
    alert(`En fazla ${TRADE_LISTING_MAX_ACTIVE_PER_PLAYER} aktif listelemen olabilir.`);
    return;
  }

  let updatePayload;
  if (kind === "scrap") {
    const scrap = getScrap(S.currentPlayerData);
    if (scrap < amt) { alert("Yeterli Hurdan yok."); return; }
    updatePayload = { scrap: scrap - amt };
  } else if (kind === "book") {
    const books = getBooks(S.currentPlayerData);
    if (!tier || !(tier in books)) { alert("Geçersiz kitap türü."); return; }
    if ((books[tier] || 0) < amt) { alert(`Yeterli ${BOOK_TIER_NAMES[tier]} yok (elinde: ${books[tier] || 0}).`); return; }
    updatePayload = { books: { ...books, [tier]: books[tier] - amt } };
  } else {
    return;
  }

  const item = buildResourceListingItem(kind, tier, amt);
  const listingRef = doc(collection(db, MARKET_LISTINGS_COL));
  const batch = writeBatch(db);
  batch.update(doc(db, PLAYERS_COL, S.currentPlayerId), updatePayload);
  batch.set(listingRef, {
    sellerId: S.currentPlayerId,
    sellerNick: S.currentPlayerData.nick || "?",
    item,
    priceGold: price,
    status: "active",
    createdAt: Date.now()
  });
  await batch.commit();
}

// Envanter panelinin altına eklenen basit "Hurda/Kitap Sat" bloğu — mevcut
// prompt() tabanlı fiyat girişiyle aynı deseni izliyor (bkz. inventory.js
// "Pazara Çıkar" butonu). renderMyListingsPanel() tarafından çağrılır.
export function renderSellResourcePanelHtml() {
  if (!S.currentPlayerData) return "";
  const scrap = getScrap(S.currentPlayerData);
  const books = getBooks(S.currentPlayerData);
  const bookButtons = RARITY_ORDER.map(tier => `
    <button class="btn-mini" data-sell-book="${tier}" ${(books[tier] || 0) > 0 ? "" : "disabled"}>
      ${BOOK_TIER_ICONS[tier]} ${BOOK_TIER_NAMES[tier]}<span>Elinde: ${books[tier] || 0}</span>
    </button>`).join("");
  return `
    <div class="sell-resource-panel">
      <div class="sell-resource-title">📦 Hurda / Kitap Sat</div>
      <div class="sell-resource-actions">
        <button class="btn-mini gold-mini" data-sell-scrap="1" ${scrap > 0 ? "" : "disabled"}>✨ Hurda<span>Elinde: ${scrap}</span></button>
        ${bookButtons}
      </div>
    </div>`;
}

async function promptSellScrap() {
  if (!S.currentPlayerData) return;
  const scrap = getScrap(S.currentPlayerData);
  const amountStr = prompt(`Kaç Hurda satmak istiyorsun? (Elinde: ${scrap})`);
  if (amountStr === null) return;
  const amount = Math.round(Number(amountStr));
  if (!Number.isFinite(amount) || amount <= 0 || amount > scrap) { alert("Geçerli bir miktar gir."); return; }
  const priceStr = prompt("Toplamda kaç Altına satışa çıkarmak istiyorsun?");
  if (priceStr === null) return;
  const price = Math.round(Number(priceStr));
  if (!Number.isFinite(price) || price <= 0) { alert("Geçerli bir Altın fiyatı gir."); return; }
  await createResourceListing("scrap", null, amount, price);
  renderMyListingsPanel();
}

async function promptSellBook(tier) {
  if (!S.currentPlayerData) return;
  const books = getBooks(S.currentPlayerData);
  const have = books[tier] || 0;
  const amountStr = prompt(`Kaç ${BOOK_TIER_NAMES[tier]} satmak istiyorsun? (Elinde: ${have})`);
  if (amountStr === null) return;
  const amount = Math.round(Number(amountStr));
  if (!Number.isFinite(amount) || amount <= 0 || amount > have) { alert("Geçerli bir miktar gir."); return; }
  const priceStr = prompt("Toplamda kaç Altına satışa çıkarmak istiyorsun?");
  if (priceStr === null) return;
  const price = Math.round(Number(priceStr));
  if (!Number.isFinite(price) || price <= 0) { alert("Geçerli bir Altın fiyatı gir."); return; }
  await createResourceListing("book", tier, amount, price);
  renderMyListingsPanel();
}

// Kendi aktif listelemeni iptal eder, eşya envantere geri döner.
export async function cancelMarketListing(listingId) {
  if (!S.currentPlayerData || !S.currentPlayerId) return;
  const listingRef = doc(db, MARKET_LISTINGS_COL, listingId);
  try {
    await runTransaction(db, async (tx) => {
      const listingSnap = await tx.get(listingRef);
      if (!listingSnap.exists()) throw new Error("Listeleme bulunamadı.");
      const listing = listingSnap.data();
      if (listing.sellerId !== S.currentPlayerId) throw new Error("Bu listeleme sana ait değil.");
      if (listing.status !== "active") throw new Error("Bu listeleme zaten kapanmış.");

      const sellerRef = doc(db, PLAYERS_COL, S.currentPlayerId);
      const sellerSnap = await tx.get(sellerRef);
      if (!sellerSnap.exists()) throw new Error("Oyuncu bulunamadı.");
      const sellerData = sellerSnap.data();
      const item = listing.item;

      if (item.kind === "scrap") {
        tx.update(sellerRef, { scrap: getScrap(sellerData) + item.amount });
      } else if (item.kind === "book") {
        const books = getBooks(sellerData);
        tx.update(sellerRef, { books: { ...books, [item.tier]: (books[item.tier] || 0) + item.amount } });
      } else {
        const slot = item.slot;
        const newInvArr = [...getSlotInventoryGeneric(sellerData, slot), item];
        tx.update(sellerRef, { [`inventory.${slot}`]: newInvArr });
      }
      tx.update(listingRef, { status: "cancelled", cancelledAt: Date.now() });
    });
  } catch (e) {
    alert("Listeleme iptal edilemedi: " + e.message);
  }
}

// Bir Pazar listelemesini satın alır. Anti-abuse akışı için bkz. dosyanın
// başındaki "OYUNCULAR ARASI PAZAR" yorum bloğu.
export async function buyMarketListing(listingId) {
  if (!S.currentPlayerData || !S.currentPlayerId) return;
  // [TİCARET SERBEST] yasak kontrolü kaldırıldı

  const preSnap = await getDoc(doc(db, MARKET_LISTINGS_COL, listingId));
  if (!preSnap.exists()) { alert("Bu listeleme artık mevcut değil."); return; }
  const preListing = preSnap.data();
  if (preListing.status !== "active") { alert("Bu listeleme artık aktif değil."); return; }
  if (preListing.sellerId === S.currentPlayerId) { alert("Kendi eşyanı satın alamazsın."); return; }

  // 1) İkili-hız kontrolü — [OTO-BAN KALDIRILDI] artık engellemez/banlamaz,
  // SADECE denetim izine "işaretli" bir kayıt düşer; admin elle bakıp banlar.
  try {
    const pairAbuse = await checkTradePairVelocity(preListing.sellerId, S.currentPlayerId);
    if (pairAbuse) {
      const reason = `Aynı ikili arasında ${Math.round(TRADE_PAIR_WINDOW_MS / 3600000)} saat içinde ${TRADE_PAIR_MAX_TRADES}'ten fazla ticaret (olası aktarım — İNCELE)`;
      await logTradeFlag(preListing.sellerId, S.currentPlayerId, reason, "ikili_hiz");
    }
  } catch (e) { /* loglama ticareti engellemesin */ }

  try {
    const result = await runTransaction(db, async (tx) => {
      const listingRef = doc(db, MARKET_LISTINGS_COL, listingId);
      const buyerRef = doc(db, PLAYERS_COL, S.currentPlayerId);
      const listingSnap = await tx.get(listingRef);
      if (!listingSnap.exists()) throw new Error("Bu listeleme artık mevcut değil.");
      const listing = listingSnap.data();
      if (listing.status !== "active") throw new Error("Bu listeleme artık aktif değil.");
      if (listing.sellerId === S.currentPlayerId) throw new Error("Kendi eşyanı satın alamazsın.");

      const sellerRef = doc(db, PLAYERS_COL, listing.sellerId);
      const sellerSnap = await tx.get(sellerRef);
      const buyerSnap = await tx.get(buyerRef);
      if (!sellerSnap.exists() || !buyerSnap.exists()) throw new Error("Oyuncu bulunamadı.");
      const sellerData = sellerSnap.data();
      const buyerData = buyerSnap.data();
      // [TİCARET SERBEST] taraf-yasağı kontrolü kaldırıldı
      if (getGold(buyerData) < listing.priceGold) throw new Error("Yeterli Altının yok.");

      const item = listing.item;
      const isResource = item.kind === "scrap" || item.kind === "book";
      // Adil fiyat kontrolü SADECE benzersiz eşya listelemeleri için anlamlı
      // (bkz. dosyanın "KİTAP / HURDA SATIŞI" bölümündeki tasarım notu) —
      // stack'lenen materyaller için otomatik-engelleme uygulanmaz.
      const fairPrice = isResource ? null : computeFairTradeGoldPrice(item);
      const isUnfair = !isResource && (
        listing.priceGold < fairPrice * (1 - TRADE_FAIR_PRICE_TOLERANCE) ||
        listing.priceGold > fairPrice * (1 + TRADE_FAIR_PRICE_TOLERANCE)
      );
      const logRef = doc(collection(db, TRADE_LOGS_COL));

      // [TİCARET SERBEST] Dengesiz fiyat ticareti ENGELLEMEZ; satış normal
      // tamamlanır, sadece denetim izine "işaretli" (autoBan yok) kayıt düşer.
      if (isUnfair) {
        tx.set(logRef, {
          listingId, sellerId: listing.sellerId, sellerNick: listing.sellerNick,
          buyerId: S.currentPlayerId, buyerNick: buyerData.nick || "?",
          item, priceGold: listing.priceGold, fairPriceGold: fairPrice,
          timestamp: Date.now(), flagged: true, flagReason: "dengesiz_fiyat", reversed: false, autoBan: false
        });
      }

      // Adil ticaret (ya da fiyat kontrolüne tabi olmayan kitap/hurda satışı).
      if (item.kind === "scrap") {
        tx.update(buyerRef, {
          gold: getGold(buyerData) - listing.priceGold,
          scrap: getScrap(buyerData) + item.amount
        });
      } else if (item.kind === "book") {
        const buyerBooks = getBooks(buyerData);
        tx.update(buyerRef, {
          gold: getGold(buyerData) - listing.priceGold,
          books: { ...buyerBooks, [item.tier]: (buyerBooks[item.tier] || 0) + item.amount }
        });
      } else {
        // Eşya kuşanım/envanter mantığı Kutu/Market ile aynı desen — otomatik
        // kuşanma yalnızca slot boşsa VE seviye gereksinimi karşılanıyorsa
        // uygulanır (bkz. item-systems.js canEquipItem).
        const newBuyerInv = [...getSlotInventoryGeneric(buyerData, item.slot), item];
        const buyerWasEmpty = !(buyerData.equipment && buyerData.equipment[item.slot]) && canEquipItem(item, buyerData).ok;
        const newBuyerEquipment = buyerWasEmpty
          ? { ...(buyerData.equipment || emptyEquipment()), [item.slot]: item }
          : (buyerData.equipment || emptyEquipment());
        const buyerStats = computeStatsFromEquipment(newBuyerEquipment, buyerData.statAllocated);
        const newBuyerDiscovered = Array.from(new Set([...(buyerData.discoveredItems || []), item.name]));

        tx.update(buyerRef, {
          gold: getGold(buyerData) - listing.priceGold,
          equipment: newBuyerEquipment,
          attack: buyerStats.attack,
          defense: buyerStats.defense,
          speed: buyerStats.speed,
          critStat: buyerStats.critStat,
          maxHp: buyerStats.maxHp,
          [`inventory.${item.slot}`]: newBuyerInv,
          discoveredItems: newBuyerDiscovered
        });
      }
      tx.update(sellerRef, { gold: getGold(sellerData) + listing.priceGold });
      tx.update(listingRef, { status: "sold", buyerId: S.currentPlayerId, buyerNick: buyerData.nick || "?", soldAt: Date.now() });
      tx.set(logRef, {
        listingId, sellerId: listing.sellerId, sellerNick: listing.sellerNick,
        buyerId: S.currentPlayerId, buyerNick: buyerData.nick || "?",
        item, priceGold: listing.priceGold, fairPriceGold: fairPrice,
        timestamp: Date.now(), flagged: false, flagReason: null, reversed: false
      });
      return { blocked: false };
    });

    // [TİCARET SERBEST] engelleme yok; dengesiz fiyat yalnızca loglanır.
  } catch (e) {
    alert("Satın alma tamamlanamadı: " + e.message);
  }
}

// Diğer oyuncuların aktif listelemeleri (kendi listelemelerim hariç — onlar
// ayrı panelde, "Listelemelerim").
export function renderMarketListingsGrid() {
  if (!marketListingsGridEl) return;
  const gold = getGold(S.currentPlayerData);
  const listings = S.allMarketListings.filter(l => l.status === "active" && l.sellerId !== S.currentPlayerId);

  if (!listings.length) {
    marketListingsGridEl.innerHTML = `<p class="box-status">Şu an satışta eşya yok. İlk listeleyen sen ol!</p>`;
    return;
  }

  marketListingsGridEl.innerHTML = listings.map(l => {
    const it = l.item;
    const canAfford = gold >= l.priceGold;
    const banned = false; // [TİCARET SERBEST]
    const isResource = it.kind === "scrap" || it.kind === "book";
    const rarityClass = isResource ? (it.tier ? `rarity-${it.tier}` : "") : `rarity-${it.rarity}`;
    const headBody = isResource ? `
        <div class="inv-item-head">
          <div class="inv-item-icon-badge ${rarityClass}">${it.icon}</div>
          <div class="inv-item-head-body">
            <span class="inv-item-name">${it.name} x${it.amount}</span>
            <span class="inv-item-rarity-tag ${rarityClass}">👤 ${l.sellerNick}</span>
          </div>
        </div>` : `
        <div class="inv-item-head">
          <div class="inv-item-icon-badge ${rarityClass}">${itemIconSvg(it.slot, it.rarity, 26)}</div>
          <div class="inv-item-head-body">
            <span class="inv-item-name">${it.name}</span>
            <span class="inv-item-rarity-tag ${rarityClass}">${RARITY_LABELS_TR[it.rarity]} · 👤 ${l.sellerNick}</span>
          </div>
        </div>
        <div class="inv-item-stat-pills">
          <span class="inv-stat-pill atk">⚔️ +${it.atk}</span>
          <span class="inv-stat-pill def">🛡️ +${it.def}</span>
          ${it.enchantPct ? `<span class="inv-stat-pill enchant">✨ Efsun +%${it.enchantPct}</span>` : ""}
        </div>`;
    return `
      <div class="inv-item inv-item-v2 ${rarityClass}">
        ${headBody}
        <div class="inv-item-actions">
          <button class="btn-mini gold-mini" data-buy-listing="${l.id}" ${!canAfford ? "disabled" : ""}>
            💰 Satın Al <span>${l.priceGold} Altın</span>
          </button>
        </div>
      </div>`;
  }).join("");

  marketListingsGridEl.querySelectorAll("[data-buy-listing]").forEach(btn => {
    btn.onclick = () => {
      btn.disabled = true;
      buyMarketListing(btn.getAttribute("data-buy-listing"));
    };
  });
}

export function renderMyListingsPanel() {
  if (!myListingsGridEl) return;
  const mine = getMyActiveListings();
  const sellPanelHtml = renderSellResourcePanelHtml();
  const listingsHtml = !mine.length
    ? `<p class="box-status">Aktif listelemen yok.</p>`
    : mine.map(l => {
        const it = l.item;
        const isResource = it.kind === "scrap" || it.kind === "book";
        const rarityClass = isResource ? (it.tier ? `rarity-${it.tier}` : "") : `rarity-${it.rarity}`;
        const headBody = isResource ? `
        <div class="inv-item-head">
          <div class="inv-item-icon-badge ${rarityClass}">${it.icon}</div>
          <div class="inv-item-head-body">
            <span class="inv-item-name">${it.name} x${it.amount}</span>
            <span class="inv-item-rarity-tag ${rarityClass}">${l.priceGold} Altın</span>
          </div>
        </div>` : `
        <div class="inv-item-head">
          <div class="inv-item-icon-badge ${rarityClass}">${itemIconSvg(it.slot, it.rarity, 26)}</div>
          <div class="inv-item-head-body">
            <span class="inv-item-name">${it.name}</span>
            <span class="inv-item-rarity-tag ${rarityClass}">${RARITY_LABELS_TR[it.rarity]} · ${l.priceGold} Altın</span>
          </div>
        </div>`;
        return `
      <div class="inv-item inv-item-v2 ${rarityClass}">
        ${headBody}
        <div class="inv-item-actions">
          <button class="btn-mini" data-cancel-listing="${l.id}">İptal Et</button>
        </div>
      </div>`;
      }).join("");

  myListingsGridEl.innerHTML = sellPanelHtml + listingsHtml;

  myListingsGridEl.querySelectorAll("[data-cancel-listing]").forEach(btn => {
    btn.onclick = () => {
      btn.disabled = true;
      cancelMarketListing(btn.getAttribute("data-cancel-listing"));
    };
  });
  myListingsGridEl.querySelectorAll("[data-sell-scrap]").forEach(btn => {
    btn.onclick = () => promptSellScrap();
  });
  myListingsGridEl.querySelectorAll("[data-sell-book]").forEach(btn => {
    btn.onclick = () => promptSellBook(btn.getAttribute("data-sell-book"));
  });
}

// Herkese açık ticaret denetim izi — tamamlanan VE otomatik engellenen/geri
// alınan ticaretler aynı feed'de, rozetle ayırt ediliyor.
export function renderTradeLogsFeed(entries) {
  if (!tradeLogsFeedEl) return;
  if (!entries.length) {
    tradeLogsFeedEl.innerHTML = `<p class="box-status">Henüz hiç ticaret yok.</p>`;
    return;
  }
  tradeLogsFeedEl.innerHTML = entries.map(e => {
    const time = e.timestamp ? new Date(e.timestamp).toLocaleString("tr-TR") : "";
    if (!e.item) {
      // pair_velocity gibi eşyasız/fiyatsız kayıtlar (ticaret hiç başlamadan engellendi)
      return `
        <div class="log-entry reversed">
          <div class="log-entry-top">
            <span class="log-fighters">${e.sellerId || "?"} <span class="log-vs">🚫</span> ${e.buyerId || "?"}</span>
            <span class="log-badges"><span class="log-badge reversed">🚫 Engellendi</span></span>
          </div>
          <p class="log-message">${e.flagReason === "pair_velocity" ? "Kısa sürede çok fazla tekrarlanan ticaret tespit edildi, ikisi de banlandı." : "Ticaret engellendi."}</p>
          <span class="log-time">${time}</span>
        </div>`;
    }
    const badge = e.reversed
      ? `<span class="log-badge reversed">🚫 Engellendi/İade</span>`
      : `<span class="log-badge gold">✅ Tamamlandı</span>`;
    const isResource = e.item.kind === "scrap" || e.item.kind === "book";
    const itemLabel = isResource
      ? `${e.item.name} x${e.item.amount}`
      : `${e.item.name} (${RARITY_LABELS_TR[e.item.rarity] || e.item.rarity})`;
    return `
      <div class="log-entry ${e.reversed ? "reversed" : ""}">
        <div class="log-entry-top">
          <span class="log-fighters">${e.sellerNick || "?"} <span class="log-vs">🤝</span> ${e.buyerNick || "?"}</span>
          <span class="log-badges">${badge}</span>
        </div>
        <p class="log-message">${itemLabel} · ${e.priceGold} Altın${e.reversed ? ` — adil fiyat ~${e.fairPriceGold} Altın` : ""}</p>
        <span class="log-time">${time}</span>
      </div>`;
  }).join("");
}


// ============================================================
// FADELESS ÇARŞI — alt sekme geçişi (Kutular / Silahlar / Pazar)
// + Günün Tezgâhı için yerel gece yarısına geri sayım.
// Statik HTML (.mkt-seg / .mkt-pane) üzerinde tek seferlik bağlanır;
// grid'lerin içinde değil, o yüzden renderMarketTab yeniden çizince
// bozulmaz. İkonlar ve satın-alma hook'ları bundan etkilenmez.
// ============================================================
function initCarsiSubtabs() {
  // root'a değil document'a bağlıyoruz: #tabMarket ilk bağlama anında DOM'da
  // olmayabilir (tab lazy-render edilebilir) — delegasyon her koşulda çalışır.
  document.addEventListener("click", (e) => {
    const seg = e.target.closest(".mkt-seg");
    if (!seg) return;
    const root = seg.closest("#tabMarket");
    if (!root) return;
    const key = seg.getAttribute("data-mkt");
    root.querySelectorAll(".mkt-seg").forEach(s => {
      const on = s === seg;
      s.classList.toggle("is-active", on);
      s.setAttribute("aria-selected", on ? "true" : "false");
    });
    root.querySelectorAll(".mkt-pane").forEach(p => p.classList.toggle("is-active", p.getAttribute("data-pane") === key));
  });
}

function tickCarsiDailyTimer() {
  const el = document.getElementById("mktDailyTimer");
  if (!el) return;
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // yerel gece yarısı = günlük market yenilenmesi
  const s = Math.max(0, Math.floor((next - now) / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  el.textContent = `${h}:${m}:${ss}`;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { initCarsiSubtabs(); tickCarsiDailyTimer(); });
  } else {
    initCarsiSubtabs();
    tickCarsiDailyTimer();
  }
  setInterval(tickCarsiDailyTimer, 1000);
}
