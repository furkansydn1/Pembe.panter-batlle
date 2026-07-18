# Pembe Panterler Battle — Modüler Yapı Rehberi

Eski 7.338 satırlık tek `app.js`, davranışı hiç değişmeden 21 dosyaya bölündü. `index.html`'de **hiçbir değişiklik gerekmiyor** — `app.js` hâlâ giriş noktası, ama artık sadece diğer modülleri yükleyen 34 satırlık bir dosya.

## En önemli mimari değişiklik: S objesi

`currentPlayerData`, `allPlayers`, `soundOn` gibi tüm modüllerin ortak kullandığı canlı değişkenler artık `js/state.js` içindeki tek bir `S` objesinde yaşıyor. Kod genelinde `currentPlayerData` yazan her yer artık `S.currentPlayerData`. Yeni bir ortak canlı değişken eklemek istersen `js/state.js`'teki `S` objesine ekle, her yerden `S.adı` ile kullan. (Sebep: ES modüllerinde import edilen bir değişkene başka dosyadan atama yapılamaz; obje property'si bu sorunu çözer.)

## Hangi iş için hangi dosya?

| Görev | Dosya |
|---|---|
| Giriş noktası — DOKUNMA, kod ekleme | `app.js` |
| Ortak canlı state (S objesi) | `js/state.js` |
| Firebase config, koleksiyon adları | `js/firebase-setup.js` |
| Şifre hash, seviye/XP, enerji, cooldown, pity sabitleri | `js/core-config.js` |
| Eşya isim havuzları + ekipman SVG ikonları | `js/items-data.js` |
| Stat aralıkları, efsun, Kitap, bonus stat, trait, set bonusu, +basma | `js/item-systems.js` |
| Rozetler + Günün Olayı | `js/events-badges.js` |
| Günlük/haftalık/aylık görevler (şablonlar + mantık + render) | `js/quests.js` |
| Haftalık Dünya Boss'u | `js/worldboss.js` |
| Harita veri/mantık katmanı (MAP_TIERS, enterMap, ölüm cezası) | `js/map.js` |
| Konsol admin fonksiyonları (wipe, grant, ADMIN_NICKS) | `js/admin.js` |
| Tüm DOM referansları (getElementById'ler) — import'suz kalmalı! | `js/dom.js` |
| Tutorial V1/V2, yenilikler ekranı, anma modalı, yol haritası | `js/tutorial-updates.js` |
| Koleksiyon kitabı + envanter + mobil swipe | `js/inventory.js` |
| Login/kayıt + nick değiştirme | `js/auth-ui.js` |
| startGame, liderlik tablosu, profil/stat renderları, enerji | `js/game-core.js` |
| Şanslı Çark + Kelle Avcısı + Kahin Bahsi | `js/wheel-bounty-oracle.js` |
| Karakter sahnesi + kutu açma motoru | `js/box-open.js` |
| Market + Oyuncular Arası Pazar + anti-abuse | `js/market.js` |
| Savaş simülasyonu, Elo/Lig, griefing, VS ekranı, saldırı | `js/battle.js` |
| Savaş geçmişi, sesler, bildirimler, sekme sistemi | `js/ui-misc.js` |

## Yeni dosya eklerken 3 kural

1. Yeni modülü `js/` altına koy, `app.js`'e bir satır `import "./js/yeni-dosya.js";` ekle.
2. Başka dosyada tanımlı bir fonksiyon/sabit kullanacaksan dosyanın başına import et: `import { performBoxOpen } from "./box-open.js";` (her top-level tanım zaten `export` edilmiş durumda).
3. `js/dom.js` hiçbir dosyadan import yapmıyor ve **yapmamalı** — DOM referansları en önce yüklensin diye bilerek bağımsız. Yeni DOM referansı ekle, ama oraya mantık/event kodu ekleme.

## GitHub Pages'e yükleme

1. Repo'nda `github.com/kullanıcı/repo` sayfasını aç → **Add file → Upload files**.
2. Bilgisayarındaki `js` klasörünü **klasör olarak sürükle** (GitHub klasör yapısını korur) ve yeni `app.js`'i de sürükle — eski `app.js`'in üzerine yazılır.
3. "Commit changes" de. Pages 1-2 dakika içinde otomatik yeniden yayınlar.
4. Oyunu açarken **Ctrl+F5** (sert yenileme) yap — tarayıcı eski app.js'i önbellekten gösterebilir.
5. `index.html` ve `styles.css`'e dokunmana gerek yok. Ses dosyaları ve varsa harita prototip script'i de olduğu yerde kalıyor.

Bir şeyler ters giderse: repo'nun commit geçmişinden eski tek parça `app.js`'e tek tıkla dönebilirsin (Revert).

## Test listesi (yükledikten sonra 2 dakika)

Giriş yap → kutu aç → envanterden eşya kuşan → bir savaş yap → market sekmesini aç → çarkı çevir. Bunlar çalışıyorsa bölme sorunsuz demektir.
