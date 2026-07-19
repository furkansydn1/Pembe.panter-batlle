# Pembe Panterler — MAP (Modüler Yapı)

Eski tek dosyalık `Prototip-1.html` (415 KB) parçalandı. Kod birebir aynı, sadece dosyalara bölündü.
Oyunu çalıştırmak için `index.html`'i aç — tarayıcı JS dosyalarını sırayla kendisi yükler.

## ⚠️ Altın Kurallar

1. **`index.html` içindeki script sırasını ASLA değiştirme.** Dosyalar birbirinin değişkenlerini kullanıyor, sıra bozulursa oyun açılmaz.
2. **Görseller artık kodda DEĞİL, `assets/` klasöründe PNG olarak durur.** `js/01-assets.js` sadece 1.4 KB'lık bir yükleyicidir — yeni asset = PNG'yi klasöre koy + bu dosyaya 3 satırlık blok ekle.
3. Yeni bir dosya eklersen `index.html`'e `<script>` satırını da eklemeyi unutma (main'den önce olmalı).
4. Testi **VS Code Live Server** ile yap (dosyayı çift tıklayıp `file://` ile açma — bazı tarayıcılar öyle resim yüklemez). GitHub Pages'te sorun olmaz.

## 📁 Dosya Yapısı

| Dosya | İçerik | Boyut |
|---|---|---|
| `index.html` | HTML iskeleti, HUD, overlay, script yükleme sırası | küçük |
| `assets/player/` | karakter.png + kilic-iz.png buraya konulacak | — |
| `assets/enemies/` | Canavar sprite'ları buraya | — |
| `assets/map/` | Zemin/ağaç/kaya sprite'ları buraya | — |
| `css/style.css` | Tüm görsel stiller (HUD, joystick, butonlar, renkler) | küçük |
| `js/00-core.js` | Genel tasarım notu + canvas kurulumu | ~1 KB |
| `js/01-assets.js` | Asset yükleyici (PNG yollarını gösterir) + sprite sabitleri | ~1.4 KB |
| `js/02-world.js` | Harita boyutu (WORLD_W/H) + engeller (kaya/ağaç) | ~1 KB |
| `js/03-player.js` | Oyuncu objesi, hareket/saldırı, çarpışma, oyuncu çizimi | ~11 KB |
| `js/04-economy.js` | Puan, toz/eşya sayaçları, loot şansları, ölüm cezası, HUD DOM referansları | ~4 KB |
| `js/05-effects.js` | Kamera, ekran sarsıntısı, parçacıklar, yüzen yazılar | ~3 KB |
| `js/06-slime.js` | Slime: yaratma, yapay zeka, çizim | ~8 KB |
| `js/07-bat.js` | Yarasa: yaratma, kaçamak hareket paterni, çizim | ~10 KB |
| `js/08-goblin.js` | Goblin: telegraph + şarj saldırısı, çizim | ~10 KB |
| `js/09-wave.js` | Dalga/respawn yönetimi, spawn noktası seçimi, 15 dk sayaç | ~4 KB |
| `js/10-input.js` | Klavye + dokunmatik joystick/saldırı butonu | ~2 KB |
| `js/11-render.js` | Zemin, engel çizimi, debug HUD | ~2 KB |
| `js/12-main.js` | Ana oyun döngüsü (update + draw sırası), FPS sayacı | ~1 KB |

## 🎯 Ne Yapacaksan Hangi Dosyaları Yükle?

AI'ya iş yaptırırken **sadece ilgili dosyaları** yükle. `index.html` genelde gerekmez (DOM'a yeni eleman eklemiyorsan).

| Yapmak istediğin iş | Yüklenecek dosyalar |
|---|---|
| Karaktere özellik ekle (dash, can, hız, yeni saldırı) | `03-player.js` (+ efekt gerekiyorsa `05-effects.js`) |
| Karakter görünümünü/animasyonunu değiştir | `03-player.js` + `01-assets.js` + yeni PNG |
| Slime davranışını değiştir | `06-slime.js` |
| Yarasa davranışını değiştir | `07-bat.js` |
| Goblin davranışını değiştir | `08-goblin.js` |
| **Yeni canavar türü ekle** | Örnek olarak `06-slime.js` + `09-wave.js` (spawn'a eklemek için) + `12-main.js` (döngüye update/draw eklemek için) + `index.html` (script satırı) |
| Loot/drop oranları, puan, ölüm cezası | `04-economy.js` |
| HUD / arayüz / overlay değişikliği | `index.html` + `css/style.css` (+ sayaç mantığıysa `04-economy.js`) |
| Harita: boyut, engeller, yeni engel türü | `02-world.js` + `11-render.js` (çizimi için) |
| Zemin/görsel harita iyileştirmesi | `11-render.js` |
| Dalga sistemi (süre, canavar sayısı, spawn kuralları) | `09-wave.js` |
| Kontroller (tuşlar, joystick hissi) | `10-input.js` |
| Efektler (parçacık, sarsıntı, yüzen yazı, kamera) | `05-effects.js` |
| Performans / oyun döngüsü / FPS | `12-main.js` |
| Ölüm/yeniden doğma mantığı | `04-economy.js` + `03-player.js` |
| Mobil kontrol sorunları | `10-input.js` + `css/style.css` |

**Emin değilsen:** işin dokunduğu sistemin dosyası + `12-main.js` (her şeyin nasıl bağlandığını gösteren en küçük dosya) genelde yeterli bağlam sağlar.

## 🖼️ Yeni Asset Ekleme Şablonu

PNG'yi ilgili `assets/` klasörüne koy, `js/01-assets.js`'e şunu ekle:

```javascript
const slimeImg = new Image();
let slimeImgReady = false;
slimeImg.onload = () => { slimeImgReady = true; };
slimeImg.src = "assets/enemies/slime.png";
```

Sonra ilgili `drawX()` fonksiyonunda `if (slimeImgReady) { ctx.drawImage(...) } else { eski çizim }` deseniyle kullan. Görsel yüklenemezse oyun çökmez, eski placeholder çizime düşer.

AI'ya iş yaptırırken: **PNG + ilgili canavar dosyası + 01-assets.js** yüklemen yeterli (~12 KB).

## 🔗 Dosyalar Arası Önemli Bağlantılar

- `slimes`, `bats`, `goblins` dizileri kendi dosyalarında tanımlı; `09-wave.js` ve `04-economy.js` bunları kullanır.
- `spawnFloatingText`, `spawnParticle`, `triggerShake` → `05-effects.js`'te tanımlı, her canavar dosyası kullanır.
- `maybeDropItem` → `04-economy.js`'te, canavarlar ölünce çağrılır.
- `player` objesi → `03-player.js`'te, neredeyse her dosya okur.
- Yeni canavar eklerken şablon: `makeX()` + `updateX(dt)` + `drawX()` yaz, `09-wave.js`'te spawn'a, `12-main.js`'te döngüye ekle.
