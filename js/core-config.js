// ============================================================
// ŞİFRE HASH'LEME (Web Crypto API — PBKDF2/SHA-256)
// ------------------------------------------------------------
// ÖNEMLİ NOT (dürüstlük payı): Bu bir client-side, backend'siz bir
// Firestore uygulaması. Şifreler asla düz metin olarak saklanmıyor —
// her kullanıcı için rastgele bir salt üretilip PBKDF2 ile 100.000
// iterasyon SHA-256 hash'i alınıyor ve sadece salt+hash Firestore'a
// yazılıyor. Bu, "plaintext şifre" saklamaktan çok daha güvenlidir ve
// Firestore veritabanı sızarsa şifrelerin doğrudan okunmasını engeller.
// Ancak gerçek bir kimlik doğrulama sunucusu (örn. Firebase
// Authentication) kadar güvenli DEĞİLDİR: bu kod istemci tarafında
// çalıştığı için teorik olarak okunabilir/değiştirilebilir ve gerçek
// yetkilendirme Firestore güvenlik kurallarına bağlıdır. Arkadaş
// grubu ölçeğinde bir oyun için makul bir denge, ama banka/kritik
// veri için yeterli değildir.
// ============================================================
export const PBKDF2_ITERATIONS = 100000;

export function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes.buffer;
}

export function randomSaltHex(byteLength = 16) {
  const arr = new Uint8Array(byteLength);
  crypto.getRandomValues(arr);
  return bufferToHex(arr.buffer);
}

export async function pbkdf2Hash(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBuffer(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bufferToHex(derivedBits);
}

// Yeni bir şifre için rastgele salt üretir ve hash'ler.
export async function createPasswordRecord(password) {
  const passwordSalt = randomSaltHex();
  const passwordHash = await pbkdf2Hash(password, passwordSalt);
  return { passwordSalt, passwordHash };
}

// Girilen şifreyi kayıtlı salt ile hash'leyip kayıtlı hash ile karşılaştırır.
export async function verifyPasswordRecord(password, passwordSalt, expectedHash) {
  if (!passwordSalt || !expectedHash) return false;
  const computed = await pbkdf2Hash(password, passwordSalt);
  return computed === expectedHash;
}

export function normalizeUsername(u) {
  return (u || "").trim().toLowerCase();
}
export const BASE_ATTACK = 10;
export const BASE_DEFENSE = 10;
// [V4 Entegrasyon] Kritik ve Saldırı Hızı için başlangıç (varsayılan) statları.
// Eşyası hiç olmayan HERKES bu değerlerle başlar; eşyalardan gelen critStat/speed
// bunların ÜSTÜNE eklenir. Böylece hem ana oyunda hem MAP'te (14-hero-stats köprüsü)
// taban bir kritik/hız garanti olur, eşya topladıkça artar.
//   BASE_CRIT: MAP'te doğrudan kritik ŞANSI olarak okunur (5 → %5 taban kritik).
//   BASE_SPEED: Hız statının tabanı; 0 = normal hız (çarpan 1.0), eşya arttırır.
export const BASE_CRIT = 5;
export const BASE_SPEED = 0;

// ============================================================
// [V2 Faz 3] LEVEL / EXP / STAT PUANI SİSTEMİ
// ============================================================
// Bir sonraki seviyeye geçmek için gereken XP, LEVEL_XP_GROWTH oranıyla
// katlanarak artıyor (üstel eğri) — bu yüzden seviye atlamak gittikçe
// zorlaşıyor. Seviye 1->2: 40 XP, Seviye 10->11: ~176 XP, vs.
export const LEVEL_XP_BASE = 40;
export const LEVEL_XP_GROWTH = 1.18;
// Maksimum seviye: 99. Bir oyuncu 99'a ulaştığında XP kazanmaya devam edebilir
// ama seviyesi bu tavanın üzerine çıkmaz (level-up mantığı bu sabiti kullanmalı).
export const LEVEL_MAX = 99;
// XP kaynakları
export const XP_PER_BATTLE_WIN = 15;
export const XP_PER_BATTLE_LOSS = 5;   // kaybeden de küçük bir teselli XP'si alır
export const XP_PER_BOX_OPEN = 4;
export const XP_PER_QUEST_DAILY = 10;
export const XP_PER_QUEST_WEEKLY = 25;
export const XP_PER_QUEST_MONTHLY = 50;
export const ATTACK_COOLDOWN_MS = 1 * 60 * 60 * 1000;       // 1 saatte 1 saldırı
// Saldırı hakları artık herkes için AYNI, saat başına hizalanmış (senkron) pencerelerde açılır
// (örn. 14:00-14:59, 15:00-15:59...). Kişisel "son saldırıdan bu yana geçen süre" YERİNE
// global pencere index'i kullanılır: bir oyuncu o pencerede saldırmazsa hakkı kaybolur,
// bir sonraki saat başına kadar beklemesi gerekir. Böylece kimse "geç giriş yaparak"
// hakkını sonraya taşıyamaz, herkesin saldırı saati birebir aynı olur.
export function getAttackWindowIndex(t = Date.now()) {
  return Math.floor(t / ATTACK_COOLDOWN_MS);
}
export const BOX_COOLDOWN_MS = 4 * 60 * 60 * 1000;          // 4 saatte 1 kutu

// Enerji sistemi: kutu/savaş beklerken oynanacak, cooldown'u olmayan dolgu aktivite.
// Ana ekonomiye (gerçek eşya düşürme) dokunmaz, sadece hurda ekonomisini besler.
export const ENERGY_MAX = 100;
export const ENERGY_REGEN_MS_PER_POINT = 3 * 60 * 1000; // her 3 dakikada +1 enerji

// Enerji harcanan "görevler": tek bir jenerik buton yerine, farklı isim/maliyet/ödüle
// sahip görev kartları. Zorluk arttıkça hurda/enerji oranı hafifçe iyileşiyor (sabır
// ödüllendiriliyor) ama enerji 100 ile sınırlı olduğu için ekonomi bozulmuyor, herkes
// hızlıca her şeye sahip olamıyor.
// [v2.2] İki değişiklik:
//   1) İSİMLER: "Fadeless" (sönmeyen/solmayan) karanlık temasına oturtuldu —
//      gölgede sinsice başlayıp yasak bir ayine tırmanan bir merdiven.
//      ⚠️ id'ler BİLEREK aynı bırakıldı: Firestore'daki eski oyuncu kayıtlarında ve
//      görev sayaçlarında bu id'ler geçiyor olabilir, sadece görünen ad değişti.
//   2) EXP: Artık her görev hurdanın yanında ciddi miktarda EXP de veriyor.
//      Enerji tavanı 100, dolum 3dk/puan (saatte 20, günde ~480 enerji).
//      Enerji/EXP verimi: 1.0 → 1.5 → 2.57 → 3.0 (sabır belirgin ödüllendiriliyor).
//      ⚠️ DENGE UYARISI: Günlük tüm enerji en verimli görevde harcanırsa ~1400 EXP
//      eder. Seviye eğrisi (LEVEL_XP_BASE 40, GROWTH 1.18) buna göre: seviye 20'ye
//      kadar günde birkaç seviye atlanır, sonra eğri yakalar. Enerji artık ana XP
//      kaynağı — savaş (15) / sandık (4) / günlük görev (10) yanında baskın.
//      Bilerek böyleyse sorun yok; hızlı gelirse SADECE aşağıdaki xp/bonusXp
//      değerlerini düşür, başka hiçbir yeri değiştirme.
export const ENERGY_TASKS = [
  { id: "gasp",      name: "Gölge Avı",      icon: "🕯️", cost: 10, scrapMin: 1,  scrapMax: 3,  xp: 10,  bonusChance: 0.08, bonusScrap: 6,  bonusXp: 6 },
  { id: "zorbala",   name: "Kan Vergisi",    icon: "🩸", cost: 20, scrapMin: 4,  scrapMax: 7,  xp: 30,  bonusChance: 0.08, bonusScrap: 10, bonusXp: 18 },
  { id: "kafautule", name: "Mezar Talanı",   icon: "💀", cost: 35, scrapMin: 8,  scrapMax: 11, xp: 90,  bonusChance: 0.10, bonusScrap: 15, bonusXp: 50 },
  { id: "manipule",  name: "Sönmeyen Ayin",  icon: "🌑", cost: 50, scrapMin: 12, scrapMax: 16, xp: 150, bonusChance: 0.12, bonusScrap: 22, bonusXp: 90 }
];

// Temel şans oranları (yüzde). Nadir %9, Efsanevi %3.
export const BASE_LEGENDARY_CHANCE = 3;
export const BASE_RARE_CHANCE = 9;

// Pity (şans telafisi) eşikleri: uzun süre efsanevi/nadir çıkmayana şansı yavaşça artar,
// belli bir noktadan sonra garanti verir.
export const RARE_PITY_SOFT_START = 8;    // 8 kutudan sonra nadir şansı artmaya başlar
export const RARE_PITY_HARD = 15;         // 15 kutudur nadir yoksa garanti nadir
export const LEGENDARY_PITY_SOFT_START = 15; // 15 kutudan sonra efsanevi şansı artmaya başlar
export const LEGENDARY_PITY_HARD = 40;       // 40 kutudur efsanevi yoksa garanti efsanevi

// Hurda (scrap) ekonomisi: eski eşya yeni eşyayla değişince nadirliğine göre hurda kazanılır.
// V2 Faz 2: "dust" alanı "scrap"e yeniden adlandırıldı (Toz→Hurda refactor).
// ÖNEMLİ (geriye dönük uyumluluk): Firestore'daki ESKİ oyuncu dokümanlarında
// hâlâ "dust" alanı var, "scrap" alanı henüz yok. Bu yüzden bir oyuncunun
// hurda miktarı OKUNURKEN asla data.scrap doğrudan okunmaz, her zaman bu
// fonksiyon kullanılır. İlk hurda kazanma/harcama işleminde alan otomatik
// "scrap" olarak Firestore'a yazılır ("dust" bir daha güncellenmez) — yani
// ayrı bir migration script'ine gerek yok, geçiş kendiliğinden olur.
export function getScrap(data) {
  return (data && (data.scrap ?? data.dust)) || 0;
}
// V2 Faz 4: Altın — Market'te (Günlük Market + kalıcı Nadir/Efsanevi/Özel
// Kutu satın alımları) kullanılan yeni para birimi. Hurda'nın aksine hiç
// eski/farklı isimli bir alandan gelmiyor (yepyeni alan), bu yüzden dust
// gibi bir geriye-dönük-uyumluluk fallback'ine gerek yok — yine de OKUMA
// hep bu fonksiyon üzerinden yapılmalı (ileride bir kazanım kaynağı
// eklendiğinde tek yerden değişsin diye).
export function getGold(data) {
  return (data && data.gold) || 0;
}
export const HURDA_FROM_RARITY = { standart: 1, nadir: 3, efsanevi: 8 };
