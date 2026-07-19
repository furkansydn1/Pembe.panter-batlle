# Pembe Panterler — MAP `index.html` Rehberi

Bu dosya, harita oyununun **iskeleti**dir: HUD elemanları, dokunmatik kontroller, overlay'ler ve script yükleme sırası burada yaşar. Oyun mantığı burada YOK — mantık `js/` klasöründe, görünüm `css/style.css`'te.

> **AI'ya iş yaptırırken:** Bu README + `index.html`'i beraber yükle. Aşağıdaki tablolar hangi bloğa dokunmanın güvenli olduğunu, hangi id'lerin oyun koduna kilitli olduğunu söyler.

---

## ⚠️ Altın Kurallar

1. **`<script>` satırlarının sırasını ASLA değiştirme.** Dosyalar birbirinin global değişkenlerini kullanır; sıra bozulursa oyun hiç açılmaz. Özel durum: `12-main.js` sondan bir önce, `15-hud.js` en sonda — bu bilinçli, dokunma.
2. **id'ler oyun koduna kilitli.** Aşağıdaki "id Kilit Tablosu"ndaki hiçbir id'yi yeniden adlandırma/silme — JS dosyaları `getElementById` ile doğrudan bunlara yazar. id silinirse oyun sessizce ya da gürültüyle kırılır.
3. **Görünüm değişikliği buraya yazılmaz.** Renk, boyut, konum → `css/style.css`. index.html'e `<style>` bloğu ekleme; iki yerde stil olursa takibi kabusa döner.
4. **`<meta name="viewport">` satırındaki `viewport-fit=cover` silinmemeli.** CSS'teki `env(safe-area-inset-*)` değerleri (çentikli/home-bar'lı telefonlarda kontrolleri doğru konumlandıran sistem) ancak bununla çalışır.

---

## 📑 index.html'in Blok Haritası (yukarıdan aşağı)

| Blok | Ne işe yarar | Dokunmak güvenli mi? |
|---|---|---|
| `<head>` / viewport + css link | Mobil ölçekleme, stil dosyası | `viewport-fit=cover` kalmalı; css yolu `css/style.css` |
| `<canvas id="game">` | Oyunun çizildiği yüzey | width/height (900×600) oyun içi çözünürlük — değiştirme, CSS zaten ekrana sığdırıyor |
| `#backToGameBtn` | Ana oyuna dönüş linki | Href/metin değiştirilebilir |
| `.char-frame` (sol üst) | Seviye mührü, isim, CAN + EXP barları | HTML iskeleti sabit; id'ler kilitli (tabloya bak) |
| `.resource-panel` (sağ üst) | Altın / Kitap / Hurda sayaçları | Görünen adlar (`ALTIN` vs.) değiştirilebilir; id'ler kilitli ve **isimleri yanıltıcı** (aşağıya bak) |
| `.fps-badge` | FPS göstergesi | Silinebilir ama `fpsLabel` id'sini 12-main.js arar — silersen JS tarafını da temizle |
| `#touchControls` | Joystick + saldırı butonu | İskelet sabit; boyut/konum CSS'te |
| `#hintBox` | Alt ipucu yazısı | Metni serbest; id kilitli (10-input.js mobилde metni değiştirir) |
| `#mapClearOverlay` | "Harita Temizlendi" ekranı | İskelet sabit; id'ler kilitli |
| Script blokları | Yükleme sırası + tam ekran/yatay kilit | Sıra kutsal; en alttaki inline script mobil tam ekran içindir |

---

## 🔒 id Kilit Tablosu (hangi JS dosyası hangi id'ye yazar)

| id | Kim kullanır | Not |
|---|---|---|
| `game` | 00-core (canvas kurulumu) | |
| `levelLabel`, `heroNameLabel`, `expBarFill`, `expCurLabel`, `expMaxLabel`, `expBarBox` | 15-hud, 14-hero-stats | Seviye/EXP görselleştirme |
| `hpLabel`, `hpMaxLabel`, `hpBarFill`, `hpBarBox` | 03-player, canavar dosyaları, 15-hud | 15-hud düşük canda `.low` sınıfı ekler |
| `pointsLabel` | 04-economy, 14-hero-stats | |
| `rareLabel` | 04-economy | ⚠️ **ALTIN** sayacı (adı "rare" ama altın) |
| `itemsLabel` | 04-economy | ⚠️ **KİTAP** sayacı |
| `legendaryLabel` | 04-economy | ⚠️ **HURDA** sayacı |
| `fpsLabel` | 12-main | |
| `touchControls`, `joystickZone`, `joystickStick`, `attackBtn`, `hintBox` | 10-input | Dokunmatik kontrol sistemi |
| `mapClearOverlay`, `mapClearCountdownLabel`, `clearItemsLabel`, `clearRareLabel`, `clearLegendaryLabel` | 09-wave | Harita temizlendi ekranı |
| `clearDustLabel` | 09-wave | Gizli (`display:none`) ama SİLME — 09-wave hâlâ yazıyor (Toz emekli) |

> Kısacası: sayaç id'lerinin adları tarihi sebeplerle yanıltıcı (`rareLabel` = Altın). id'yi değil, yanındaki `<small>` etiketindeki görünen adı değiştir.

---

## 🎮 Mobil Kontroller: Boyut/Konum Ayarı Nereden?

Joystick ve saldırı butonu **`css/style.css`** içinde `DOKUNMATİK KONTROLLER` başlığı altında. Güncel değerler (mobil fix sonrası):

| Ne | Selector | Değer | Eski değer |
|---|---|---|---|
| Joystick halka boyutu | `#joystickZone` width/height | **96px** | 130px |
| Joystick konumu | `#joystickZone` bottom | **38px** + safe-area | 24px |
| Joystick topuzu | `#joystickStick` width/height | **40px** (margin -20px) | 56px |
| Saldırı butonu boyutu | `#attackBtn` width/height | **68px** | 84px |
| Saldırı butonu konumu | `#attackBtn` bottom | **46px** + safe-area | 32px |
| Buton ikonu | `#attackBtn svg` | **28px** | 34px |

**Kritik bağlantı:** `js/10-input.js` içindeki `JOY_MAX_DIST` (şu an **32**), topuzun merkezden kayabildiği piksel menzilidir ve halka boyutuna kilitlidir. Kaba formül: `JOY_MAX_DIST ≈ (halka - topuz) / 2 + ~4`. Halkayı büyütüp/küçültürsen bu sabiti de beraber güncelle — yoksa topuz ya halkadan taşar ya da halkayı dolduramaz.

**Topuz margin kuralı:** `#joystickStick`'in margin'i her zaman boyutunun yarısının negatifi olmalı (40px → -20px). Ortalamayı bu sağlıyor.

**Safe-area:** Tüm `bottom` değerleri `calc(Xpx + env(safe-area-inset-bottom, 0px))` biçiminde — telefonun alt home çubuğunu otomatik hesaba katar. `env(...)` kısmını asla silme, sadece `Xpx` ile oyna.

---

## 📱 En Alttaki Inline Script (Tam Ekran + Yatay Kilit)

İlk dokunuşta bir kez tam ekrana geçmeyi ve yatay kilidi dener. iOS Safari yatay kilidi desteklemez — script bunu sessizce yutar, hata değil. Bu bloğa dokunma ihtiyacı doğarsa tek güvenli oynama alanı: `landscape` yerine başka bir kilit modu yazmak. `{ once: true }` kalmalı, yoksa her dokunuşta tam ekran isteği spam'lenir.

---

## 🔧 Sık İşler → Nereye Dokun

| İş | Dosya(lar) |
|---|---|
| Kontrolleri büyüt/küçült/taşı | `css/style.css` (+ halka boyutu değiştiyse `10-input.js` → `JOY_MAX_DIST`) |
| HUD'a yeni sayaç ekle | `index.html` (yeni `.res-cell` + benzersiz id) + `04-economy.js` (yazma mantığı) + gerekirse `css/style.css` |
| İpucu metnini değiştir | `index.html` (PC metni) + `10-input.js` (mobil metni — JS üzerine yazıyor!) |
| "Harita Temizlendi" ekranını değiştir | `index.html` (iskelet) + `css/style.css` (görünüm) + `09-wave.js` (mantık) |
| Yeni script dosyası ekle | `index.html`'e `<script>` satırı — `12-main.js`'ten ÖNCE (HUD işiyse 15'ten önce de olabilir) |

---

## 🆘 Bozulursa

1. Telefonda cache çok inatçı: site verilerini temizle ya da gizli sekmede aç (Ctrl+F5 dengi).
2. Kontroller hiç görünmüyorsa → F12 Console'da `touchControls` hatası ara; `#touchControls.active` sınıfını 10-input.js dokunmatik cihazda ekler, masaüstünde görünmemesi NORMAL.
3. Kontroller ekranın dibine yapışıksa → viewport satırında `viewport-fit=cover` duruyor mu kontrol et.
4. Topuz halkadan taşıyorsa → `JOY_MAX_DIST` ile halka boyutu uyumsuz, yukarıdaki formüle bak.
