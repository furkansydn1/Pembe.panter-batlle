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
export const ENERGY_TASKS = [
  { id: "gasp", name: "Gasp Et", icon: "👛", cost: 10, scrapMin: 1, scrapMax: 3, bonusChance: 0.08, bonusScrap: 6 },
  { id: "zorbala", name: "Arkadaşını Zorbala", icon: "😈", cost: 20, scrapMin: 4, scrapMax: 7, bonusChance: 0.08, bonusScrap: 10 },
  { id: "kafautule", name: "Hafız Döv", icon: "🗣️", cost: 35, scrapMin: 8, scrapMax: 11, bonusChance: 0.10, bonusScrap: 15 },
  { id: "manipule", name: "Umumi Mastürbasyon", icon: "🕶️", cost: 50, scrapMin: 12, scrapMax: 16, bonusChance: 0.12, bonusScrap: 22 }
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
