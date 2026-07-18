# CSS Klasörü Rehberi — Pembe Panterler Battle

Eski `styles.css` (2759 satır, ~120 KB) 8 parçaya bölündü. Bu 8 dosya
arka arkaya eklendiğinde eski dosyayla **birebir aynı** — hiçbir kural
değiştirilmedi, silinmedi, taşınmadı. Sadece kesildi.

---

## 1. KURULUM — index.html'de ne değişecek?

Eski satırı sil:

```html
<link rel="stylesheet" href="styles.css">
```

Yerine bu 8 satırı **tam bu sırayla** koy:

```html
<link rel="stylesheet" href="css/01-temel.css">
<link rel="stylesheet" href="css/02-yerlesim.css">
<link rel="stylesheet" href="css/03-paneller-gorevler.css">
<link rel="stylesheet" href="css/04-savas-modallar.css">
<link rel="stylesheet" href="css/05-karakter-cark.css">
<link rel="stylesheet" href="css/06-envanter-rozetler.css">
<link rel="stylesheet" href="css/07-efekt-motorlari.css">
<link rel="stylesheet" href="css/08-fadeless-prototip.css">
```

Hepsi bu. app.js'e, index.html'in geri kalanına dokunmana gerek yok.

---

## 2. ⚠️ ALTIN KURAL: SIRALAMAYI ASLA BOZMA

CSS'te sonra gelen kural, öncekini ezer. Bu projede bu bilerek
kullanılıyor: **08-fadeless-prototip.css** dosyası, yukarıdaki
dosyalarda tanımlı `.res-chip`, `.realm-card`, `.resource-strip` gibi
sınıfları **kasıtlı olarak eziyor** (fadeless-prototip.html'den birebir
kopyalanan blok bu).

Yani:
- 08 numaralı dosya HER ZAMAN en sonda yüklenmeli.
- 01 numaralı dosya HER ZAMAN en başta (çünkü tüm `--accent`, `--gold`
  gibi renk değişkenleri orada tanımlı, diğer dosyalar bunları kullanıyor).
- Aradaki dosyaların da sırası korunmalı; bazı bloklar öncekilerin
  üstüne yazıyor (dosya içi yorumlarda "önceki sürümün üstüne yazar"
  diye belirtilmiş yerler var).

Sıra bozulursa oyun ÇÖKMEZ ama görünüm bozulur: yanlış renkler, eski
tasarımın geri gelmesi, üst üste binen paneller görürsün.

---

## 3. HANGİ DOSYADA NE VAR? (Arama haritası)

| Dosya | İçerik | "Şunu değiştireceğim" dersen |
|---|---|---|
| **01-temel.css** | `:root` renk değişkenleri, reset, body arkaplanı, scrollbar, genel buton stili | Renk paleti, font, marka rengi, buton görünümü |
| **02-yerlesim.css** | Login ekranı, top bar, sabit kaynak şeridi (Puan/Hurda), marka alevi, sekme container, alt navigasyon barı + ışıklı gösterge | Giriş ekranı, alt menü, üstteki para/puan şeridi |
| **03-paneller-gorevler.css** | Leaderboard, kutu/kuşanım/saldırı iç alanları, nadirlik "nabız" animasyonları, günlük görevler, altıgen ekipman grid'i, seviye/XP/stat paneli | Görev listesi, ekipman slotları, liderlik tablosu |
| **04-savas-modallar.css** | Saldırı hedefleri, battle log, modallar, tutorial carousel, güncellemeler/yol haritası, koleksiyon kitabı, PIN, günün olayı, eski envanter | Modal pencereler, öğretici, savaş kayıtları |
| **05-karakter-cark.css** | v1.8–1.9 blokları: sekme banner'ları, Metin2 tarzı karakter sahnesi (paper doll), savaş geçmişi rozetleri, Günün Yıldızı/Sürtüğü, Şanslı Çark, Kelle Avcısı, istatistik sekmesi | Karakter ekranı, çark, sekme başlıkları |
| **06-envanter-rozetler.css** | v1.10–1.14: Kahin Bahsi, haftalık liderlik kutusu, rozetler, kutu şansı şeridi, yeni envanter kartları (inv-item-v2, swipe), eşya pasifleri, SVG eşya ikonları + efekt animasyonları | Envanter kartları, eşya ikonları, rozetler |
| **07-efekt-motorlari.css** | v1.15–1.16 + V2: sandık açılış motoru (şarj/patlama/açılış), VS saldırı ekranı, anma modalı, seviye atlama animasyonu, harita sekmesi + Kâşif Sahnesi | Sandık animasyonu, VS ekranı, level-up efekti, harita |
| **08-fadeless-prototip.css** | Fadeless prototipinden BİREBİR kopyalanan bileşenler: f-panel, f-btn, kaynak şeridi, sekme kapı taşı, Cephanelik, Çarşı, Diyar kartları. **Öncekileri ezer, en sonda kalmalı.** | Yeni fadeless görünümün kendisi |

**Pratik ipucu:** Hangi dosyada olduğunu bilmiyorsan VS Code'da
Ctrl+Shift+F (tüm dosyalarda ara) ile sınıf adını arat. Ya da
tarayıcıda öğeye sağ tık → İncele → Styles panelinde kuralın hangi
dosyadan geldiği zaten yazar (örn. `05-karakter-cark.css:212`).

---

## 4. YENİ ÖZELLİK EKLERKEN NEREYE YAZACAKSIN?

Basit kural:

1. **Yeni bir sekme/sistem mi?** → İlgili tema dosyasının EN ALTINA
   ekle (örn. yeni bir savaş efekti → 07'nin sonuna).
2. **Mevcut bir şeyi mi değiştiriyorsun?** → Kuralın olduğu yerde,
   yerinde düzenle. Aynı selector'ı başka dosyaya bir daha yazma —
   iki tanım olursa hangisinin kazandığını takip etmek kabusa döner.
3. **Yeni renk/değişken mi?** → Sadece 01-temel.css'teki `:root`'a ekle.
4. **Fadeless görünümüne dokunuyorsan** → Sadece 08'de çalış.
5. **Kararsızsan** → 07'nin sonuna yaz, çalıştığını görünce doğru
   dosyaya taşı.

---

## 5. KRİTİK UYARILAR (dosya içi notlardan derlendi)

- `--gold`, `--blue`, `--item-mitik`, `--item-kabus` gibi nadirlik
  renkleri **app.js içindeki hardcoded renklerle** (spawnSparks,
  CHEST_RARITY_STYLES, glow keyframes) birebir kilitli. Birini
  değiştirirsen diğerini de değiştirmen gerekir, yoksa efektler
  yanlış renkte patlar.
- Dosyada `#ffcc4d55` gibi onlarca literal alfa-varyant var; ana
  renkleri değiştirmek bunları otomatik güncellemez.
- 07'deki Kâşif Sahnesi bloğunda `html,body{overflow:hidden}` kuralı
  BİLEREK yok — ekleme, tüm sayfanın scroll'unu kilitler.
- Prototip değişkenleri (`--etch`, `--ember`, `--r-*` vb.) 01'deki
  `:root` içinde oyun değişkenleriyle beraber duruyor; ikisi de lazım,
  silme.

---

## 6. BİR ŞEY BOZULURSA

1. Önce Ctrl+F5 (hard refresh) — tarayıcı eski CSS'i cache'lemiş olabilir.
2. F12 → Console'da 404 var mı bak: dosya yolu (`css/` klasörü) yanlış
   yazılmış olabilir.
3. Görünüm "eskiye dönmüş" gibiyse → 08 numaralı dosya eksik veya
   sırası bozuk demektir.
4. En kötü ihtimal: 8 dosyayı sırayla birleştirip tek styles.css'e
   dönebilirsin, birleşim orijinalle birebir aynı:
   `cat 01*.css 02*.css 03*.css 04*.css 05*.css 06*.css 07*.css 08*.css > styles.css`

---

## 7. FIREBASE HOSTING NOTU

`css/` klasörünü projenin köküne (index.html'in yanına) koy ve normal
deploy et, başka bir ayar gerekmiyor. 8 ayrı istek performans için
sorun değil; dosyalar bir kere iner ve cache'lenir.
