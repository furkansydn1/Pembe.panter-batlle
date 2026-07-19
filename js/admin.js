import { getGold } from "./core-config.js";
import { LOG_COL, PLAYERS_COL, collection, db, doc, getDocs, updateDoc, writeBatch } from "./firebase-setup.js";
import { BOOK_TIER_NAMES, getBooks } from "./item-systems.js";
import { S } from "./state.js";
import { META_COL } from "./wheel-bounty-oracle.js";

// ============================================================
// ADMIN YETKİLENDİRME (V2 Faz 9 — Son Temizlik)
// ------------------------------------------------------------
// ÖNEMLİ SINIRLAMA: Oyun Firebase Auth kullanmadığı için (bkz. Şifre
// Hash'leme notu) burada "gerçek" bir yetkilendirme yok — bu sadece
// konsoldan admin fonksiyonlarını çağırabilecek oyuncuları Nick'e göre
// sınırlayan bir savunma katmanı. Önceden bu fonksiyonlar SADECE "hiçbir
// UI elementine bağlı değil" prensibine güveniyordu, ama bu da devtools
// açan HERHANGİ bir oyuncunun kendi kendine sınırsız Altın/Kitap
// verebilmesi anlamına geliyordu. Kendi Nick'ini/Nick'lerini aşağıya
// ekle — boş bırakılırsa hiç kimse (admin dahil) bu fonksiyonları
// çalıştıramaz, bu yüzden en az bir gerçek admin Nick'i girilmeli.
export const ADMIN_NICKS = [
  "Furkan",
];

export function isAdminPlayer() {
  return !!S.currentPlayerData?.nick && ADMIN_NICKS.includes(S.currentPlayerData.nick);
}

export function requireAdmin(fnLabel) {
  if (isAdminPlayer()) return true;
  console.error(
    `❌ ${fnLabel} iptal edildi: giriş yapılmış oyuncu (${S.currentPlayerData?.nick || "giriş yok"}) ADMIN_NICKS listesinde değil.`
  );
  return false;
}

// ============================================================
// ADMIN: TAM VERİTABANI WIPE (SADECE TARAYICI KONSOLUNDAN)
// ------------------------------------------------------------
// KRİTİK: Bu fonksiyon KASITLI OLARAK hiçbir UI elementine (buton, link,
// form) bağlı değil ve hiçbir "açık endpoint" yok — index.html'de bu
// fonksiyonu tetikleyen tek bir satır bile bulunmuyor. Çağırmanın tek
// yolu, oyunu bir tarayıcıda açıp geliştirici konsolunu (F12) açmak ve
// elle şunu yazmak:
//
//     adminWipeDatabase("WIPE-ONAYLA")
//
// Yanlışlıkla (örn. konsola rastgele bir şey yapıştırırken) tetiklenmeyi
// engellemek için sabit bir onay metni zorunlu tutuluyor; metin
// eşleşmezse hiçbir silme işlemi yapılmadan fonksiyon sessizce iptal olur.
// `players`, `battleLog` ve `gameMeta` koleksiyonlarındaki TÜM
// dokümanlar kalıcı olarak silinir — geri alması yoktur.
// ============================================================
export const WIPE_CONFIRMATION_PHRASE = "WIPE-ONAYLA";

export async function deleteAllDocsInCollection(colName) {
  const snap = await getDocs(collection(db, colName));
  const refs = snap.docs.map(d => d.ref);
  const BATCH_LIMIT = 400; // Firestore batch limiti 500, güvenli pay bırakıldı
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH_LIMIT).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
  return refs.length;
}

export async function adminWipeDatabase(confirmationPhrase) {
  if (!requireAdmin("adminWipeDatabase")) return { ok: false, reason: "not_admin" };
  if (confirmationPhrase !== WIPE_CONFIRMATION_PHRASE) {
    console.error(
      `❌ Wipe iptal edildi: onay metni yanlış veya eksik. Çağırmak için:\n` +
      `adminWipeDatabase("${WIPE_CONFIRMATION_PHRASE}")`
    );
    return { ok: false, reason: "confirmation_mismatch" };
  }

  console.warn("⚠️ VERİTABANI WIPE BAŞLADI — players, battleLog, gameMeta koleksiyonları siliniyor...");
  try {
    const [playersDeleted, logDeleted, metaDeleted] = await Promise.all([
      deleteAllDocsInCollection(PLAYERS_COL),
      deleteAllDocsInCollection(LOG_COL),
      deleteAllDocsInCollection(META_COL)
    ]);
    console.warn(
      `✅ Wipe tamamlandı. Silinen: ${playersDeleted} oyuncu, ${logDeleted} savaş logu, ${metaDeleted} meta doküman.`
    );
    return { ok: true, playersDeleted, logDeleted, metaDeleted };
  } catch (e) {
    console.error("Wipe sırasında hata oluştu:", e);
    return { ok: false, reason: "error", error: e.message };
  }
}

// Sadece konsoldan erişilebilmesi için global scope'a bilinçli olarak
// bağlanıyor; index.html içinde bu isme referans veren HİÇBİR element yok.
if (typeof window !== "undefined") {
  window.adminWipeDatabase = adminWipeDatabase;
}

// ============================================================
// ADMIN: TEST AMAÇLI KİTAP HEDİYESİ (SADECE TARAYICI KONSOLUNDAN) — GEÇİCİ
// ------------------------------------------------------------
// V2 Faz 2 (madde 3): Kitap'ın gerçek harita/canavar drop mantığı Faz 3'te
// kurulacak (bkz. BOOK_TIER_NAMES tanımının üstündeki not). O zamana kadar
// +basma sistemini test edebilmek için TEK giriş yolu bu fonksiyon.
// adminWipeDatabase gibi hiçbir UI elementine bağlı değil, sadece o an
// tarayıcıda giriş yapılmış oyuncuya (S.currentPlayerData/S.currentPlayerId)
// kitap ekler. Konsolden çağrım örneği:
//     adminGrantBooks("kabus", 3)
// ÖNEMLİ: Faz 3'te gerçek drop sistemi kurulunca bu fonksiyon (ve window'a
// bağlanması) kaldırılmalı — kalıcı bir "hile" kapısı olarak bırakılmamalı.
export async function adminGrantBooks(tier, amount = 1) {
  if (!requireAdmin("adminGrantBooks")) return { ok: false, reason: "not_admin" };
  if (!S.currentPlayerData || !S.currentPlayerId) {
    console.error("❌ Giriş yapılmış bir oyuncu yok.");
    return { ok: false, reason: "not_logged_in" };
  }
  if (!BOOK_TIER_NAMES[tier]) {
    console.error(`❌ Geçersiz kitap tier'i. Geçerli değerler: ${Object.keys(BOOK_TIER_NAMES).join(", ")}`);
    return { ok: false, reason: "invalid_tier" };
  }
  const newBooks = { ...getBooks(S.currentPlayerData) };
  newBooks[tier] = (newBooks[tier] || 0) + amount;
  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), { books: newBooks });
  console.warn(`✅ ${amount}x ${BOOK_TIER_NAMES[tier]} eklendi. Yeni miktar: ${newBooks[tier]}`);
  return { ok: true, tier, amount, newTotal: newBooks[tier] };
}
if (typeof window !== "undefined") {
  window.adminGrantBooks = adminGrantBooks;
}

// ============================================================
// ADMIN: TEST AMAÇLI ALTIN HEDİYESİ (SADECE TARAYICI KONSOLUNDAN) — GEÇİCİ
// ------------------------------------------------------------
// V2 Faz 4: Altın'ın gerçek kazanım kaynağı (görev/savaş/liderlik ödülü vb.)
// bilinçli olarak henüz kurulmadı — kullanıcı "şimdilik hiçbiri, admin ile
// veriyorum, kazanım kaynağını sonra ayrı konuşuruz" dedi. adminGrantBooks
// ile birebir aynı desen: hiçbir UI elementine bağlı değil, sadece o an
// giriş yapılmış oyuncuya (S.currentPlayerData/S.currentPlayerId) altın ekler.
// Konsolden çağrım örneği:
//     adminGrantGold(5000)
// ÖNEMLİ: Gerçek bir kazanım kaynağı kurulunca bu fonksiyon (ve window'a
// bağlanması) kaldırılmalı — kalıcı bir "hile" kapısı olarak bırakılmamalı.
export async function adminGrantGold(amount = 100) {
  if (!requireAdmin("adminGrantGold")) return { ok: false, reason: "not_admin" };
  if (!S.currentPlayerData || !S.currentPlayerId) {
    console.error("❌ Giriş yapılmış bir oyuncu yok.");
    return { ok: false, reason: "not_logged_in" };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("❌ Geçersiz miktar.");
    return { ok: false, reason: "invalid_amount" };
  }
  const newGold = getGold(S.currentPlayerData) + amount;
  await updateDoc(doc(db, PLAYERS_COL, S.currentPlayerId), { gold: newGold });
  console.warn(`✅ ${amount} Altın eklendi. Yeni miktar: ${newGold}`);
  return { ok: true, amount, newTotal: newGold };
}
if (typeof window !== "undefined") {
  window.adminGrantGold = adminGrantGold;
}

// ============================================================
// ADMIN: TÜM OYUNCULARIN GÜNÜN TEZGAHINI ZORLA YENİLE (SADECE KONSOL)
// ------------------------------------------------------------
// Sebep: ensureDailyMarketForToday() sadece "data.marketDate !== today"
// olduğunda yeni rulo üretiyor. Fiyat sabitleri (MARKET_GOLD_PRICE_RANGE)
// kod tarafında değişse bile, bir oyuncunun Firestore'daki marketDate'i
// zaten "bugün" ise dailyMarket dizisi ESKİ fiyatlarla donmuş kalır —
// yeni kod bugünkü veriye hiç dokunmaz. Bu fonksiyon TÜM `players`
// dokümanlarında marketDate + dailyMarket alanlarını temizler; her
// oyuncu bir sonraki girişinde (veya sayfa yenilemesinde, çünkü
// ensureDailyMarketForToday her açılışta çağrılıyor) YENİ fiyatlarla
// taze bir rulo alır. deleteAllDocsInCollection ile aynı BATCH_LIMIT
// deseni kullanılır. Konsolden çağrım örneği:
//     adminResetAllDailyMarkets()
export async function adminResetAllDailyMarkets() {
  if (!requireAdmin("adminResetAllDailyMarkets")) return { ok: false, reason: "not_admin" };

  console.warn("⚠️ TÜM oyuncuların Günün Tezgahı ruloları sıfırlanıyor...");
  try {
    const snap = await getDocs(collection(db, PLAYERS_COL));
    const refs = snap.docs.map(d => d.ref);
    const BATCH_LIMIT = 400; // Firestore batch limiti 500, güvenli pay bırakıldı
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      refs.slice(i, i + BATCH_LIMIT).forEach(ref => {
        batch.update(ref, { marketDate: null, dailyMarket: [] });
      });
      await batch.commit();
    }
    console.warn(`✅ ${refs.length} oyuncunun Günün Tezgahı sıfırlandı. Bir sonraki girişte yeni fiyatlarla yeniden üretilecek.`);
    return { ok: true, playersReset: refs.length };
  } catch (e) {
    console.error("Market sıfırlama sırasında hata oluştu:", e);
    return { ok: false, reason: "error", error: e.message };
  }
}
if (typeof window !== "undefined") {
  window.adminResetAllDailyMarkets = adminResetAllDailyMarkets;
}

// ============================================================
// ADMIN: TÜM OYUNCULARIN GÜNLÜK GÖREVLERİNİ ZORLA SIFIRLA (SADECE KONSOL)
// ------------------------------------------------------------
// Sebep: ensureDailyQuestsForToday() sadece "data.questsDate !== today"
// olduğunda yeni görev üretir. Görev ödülleri (QUEST_TIER_REWARDS) kod
// tarafında değişse bile, bir oyuncunun questsDate'i zaten "bugün" ise
// dailyQuests dizisi ESKİ ödüllerle (örn. hâlâ nadir eşya veren zor görev)
// donmuş kalır. Bu fonksiyon TÜM players dokümanlarında questsDate +
// dailyQuests alanlarını temizler; her oyuncu bir sonraki girişinde
// (veya sayfa yenilemesinde) YENİ ödüllerle taze görev alır — böylece
// kimse eski ödül tablosundan bedava nadir eşya alamaz.
// adminResetAllDailyMarkets ile birebir aynı desen. Konsolden:
//     adminResetAllDailyQuests()
export async function adminResetAllDailyQuests() {
  if (!requireAdmin("adminResetAllDailyQuests")) return { ok: false, reason: "not_admin" };

  console.warn("⚠️ TÜM oyuncuların günlük görevleri sıfırlanıyor...");
  try {
    const snap = await getDocs(collection(db, PLAYERS_COL));
    const refs = snap.docs.map(d => d.ref);
    const BATCH_LIMIT = 400; // Firestore batch limiti 500, güvenli pay bırakıldı
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      refs.slice(i, i + BATCH_LIMIT).forEach(ref => {
        batch.update(ref, { questsDate: null, dailyQuests: [] });
      });
      await batch.commit();
    }
    console.warn(`✅ ${refs.length} oyuncunun günlük görevi sıfırlandı. Bir sonraki girişte yeni ödüllerle yeniden üretilecek.`);
    return { ok: true, playersReset: refs.length };
  } catch (e) {
    console.error("Görev sıfırlama sırasında hata oluştu:", e);
    return { ok: false, reason: "error", error: e.message };
  }
}
if (typeof window !== "undefined") {
  window.adminResetAllDailyQuests = adminResetAllDailyQuests;
}

// ============================================================
// ADMIN: SEVİYE-DIŞI KUŞANILMIŞ EŞYALARI SÖK (SADECE KONSOL)
// ------------------------------------------------------------
// Sebep: Kutu açma / Pazar'da "slot boşsa otomatik kuşan" akışı eskiden
// canEquipItem seviye kontrolünü ATLIYORDU — düşük seviyeli oyuncular
// kendi seviyelerinin çok üstünde eşya takmış olabilir (örn. Sv.5 oyuncu
// Sv.15 gerektiren Nadir eşya takılı). box-open/market düzeltmesi yeni
// kuşanmaları engeller ama ZATEN takılı olanları sökmez — bu fonksiyon
// onları temizler: her oyuncuda seviyesinin yetmediği kuşanılı eşyayı
// slottan çıkarıp inventory'ye geri koyar ve statları yeniden hesaplar.
// Konsolden:  adminUnequipOverleveledItems()
export async function adminUnequipOverleveledItems() {
  if (!requireAdmin("adminUnequipOverleveledItems")) return { ok: false, reason: "not_admin" };

  // canEquipItem'i burada import etmemek için seviye tablosunu doğrudan kullanıyoruz.
  const REQ = { standart: 1, nadir: 15, efsanevi: 35, mitik: 50, kabus: 70 };

  console.warn("⚠️ Seviye-dışı kuşanılmış eşyalar taranıyor...");
  try {
    const snap = await getDocs(collection(db, PLAYERS_COL));
    let fixedPlayers = 0, unequippedItems = 0;
    const BATCH_LIMIT = 400;
    let batch = writeBatch(db), pending = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const level = data.level || 1;
      const equipment = data.equipment;
      if (!equipment) continue;

      const newEquipment = { ...equipment };
      const newInventory = { ...(data.inventory || {}) };
      let changed = false;

      for (const slot in newEquipment) {
        const item = newEquipment[slot];
        if (!item || !item.rarity) continue;
        const req = REQ[item.rarity] ?? 1;
        if (level < req) {
          // Slottan çıkar, aynı slotun envanterine geri koy (kaybolmasın)
          newInventory[slot] = [...(newInventory[slot] || []), item];
          newEquipment[slot] = null;
          changed = true;
          unequippedItems++;
        }
      }

      if (changed) {
        batch.update(d.ref, { equipment: newEquipment, inventory: newInventory });
        fixedPlayers++;
        pending++;
        if (pending >= BATCH_LIMIT) { await batch.commit(); batch = writeBatch(db); pending = 0; }
      }
    }
    if (pending > 0) await batch.commit();

    console.warn(`✅ ${fixedPlayers} oyuncuda toplam ${unequippedItems} seviye-dışı eşya söküldü ve envantere iade edildi.`);
    console.warn("NOT: Statlar oyuncular bir sonraki girişte ekipmandan yeniden hesaplanır; sende hemen görmek için sayfayı yenile.");
    return { ok: true, fixedPlayers, unequippedItems };
  } catch (e) {
    console.error("Eşya sökme sırasında hata oluştu:", e);
    return { ok: false, reason: "error", error: e.message };
  }
}
if (typeof window !== "undefined") {
  window.adminUnequipOverleveledItems = adminUnequipOverleveledItems;
}

// ============================================================
// ADMIN: TÜM OYUNCULARIN ELO'SUNU SIFIRLA (SADECE KONSOL)
// ------------------------------------------------------------
// Sebep: STARTING_ELO 1000→100'e çekildi ve kademe isimleri/eşikleri
// değişti. Mevcut oyuncuların Firestore'daki elo alanı hâlâ eski (1000
// veya savaşlarla oynamış) değerde — bu fonksiyon HERKESİ yeni başlangıç
// elosuna (100) çeker, yani herkes en alt kademe Çaylak'tan başlar.
// Kademe elo'dan canlı hesaplandığı (getLeagueTier) için ayrıca kademe
// yazmaya gerek yok. Konsolden:  adminResetAllElo()
const RESET_ELO_VALUE = 100; // battle.js STARTING_ELO ile aynı tutulmalı
export async function adminResetAllElo() {
  if (!requireAdmin("adminResetAllElo")) return { ok: false, reason: "not_admin" };

  console.warn(`⚠️ TÜM oyuncuların Elo'su ${RESET_ELO_VALUE}'e (Çaylak) sıfırlanıyor...`);
  try {
    const snap = await getDocs(collection(db, PLAYERS_COL));
    const refs = snap.docs.map(d => d.ref);
    const BATCH_LIMIT = 400;
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      refs.slice(i, i + BATCH_LIMIT).forEach(ref => batch.update(ref, { elo: RESET_ELO_VALUE }));
      await batch.commit();
    }
    console.warn(`✅ ${refs.length} oyuncunun Elo'su ${RESET_ELO_VALUE}'e sıfırlandı. Herkes Çaylak kademesinden başlıyor.`);
    return { ok: true, playersReset: refs.length };
  } catch (e) {
    console.error("Elo sıfırlama sırasında hata oluştu:", e);
    return { ok: false, reason: "error", error: e.message };
  }
}
if (typeof window !== "undefined") {
  window.adminResetAllElo = adminResetAllElo;
}

