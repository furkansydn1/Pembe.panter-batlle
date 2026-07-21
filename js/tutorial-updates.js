import { closeNewFeaturesBtn, closeTutorialBtn, closeUpdatesBtn, howToBtn, legendaryShowcase, newFeaturesDots, newFeaturesModal, newFeaturesTrack, nfNextBtn, nfPrevBtn, nfSkipBtn, nfStepLabel, tutorialModal, updatesBtn, updatesDot, updatesList, updatesModal } from "./dom.js";
import { LEGENDARY_ITEMS, itemIconSvg } from "./items-data.js";
import { THRONE_BONUS_POINTS } from "./quests.js";

// ============================================================
// TUTORIAL (yana kaydırmalı carousel)
// ============================================================
export const tutorialTrack = document.getElementById("tutorialTrack");
export const tutorialDots = document.getElementById("tutorialDots");
export const tutPrevBtn = document.getElementById("tutPrevBtn");
export const tutNextBtn = document.getElementById("tutNextBtn");
export const tutSkipBtn = document.getElementById("tutSkipBtn");
export const tutStepLabel = document.getElementById("tutStepLabel");

export function renderLegendaryShowcase() {
  legendaryShowcase.innerHTML = LEGENDARY_ITEMS.map(it => `
    <div class="legend-card">
      <div class="legend-icon">${itemIconSvg(it.slot, "efsanevi", 30)}</div>
      <div class="legend-body">
        <div class="legend-name">${it.name}</div>
        <div class="legend-passive">✨ ${it.desc}</div>
      </div>
    </div>
  `).join("");
}

export function buildTutorialDots() {
  const slideCount = tutorialTrack.children.length;
  tutorialDots.innerHTML = "";
  for (let i = 0; i < slideCount; i++) {
    const dot = document.createElement("button");
    dot.className = "tut-dot" + (i === 0 ? " active" : "");
    dot.onclick = () => goToTutorialSlide(i);
    tutorialDots.appendChild(dot);
  }
}

export function currentTutorialIndex() {
  return Math.round(tutorialTrack.scrollLeft / tutorialTrack.clientWidth);
}

export function goToTutorialSlide(i) {
  const slideCount = tutorialTrack.children.length;
  const clamped = Math.max(0, Math.min(slideCount - 1, i));
  tutorialTrack.scrollTo({ left: clamped * tutorialTrack.clientWidth, behavior: "smooth" });
}

tutorialTrack.addEventListener("scroll", () => {
  const idx = currentTutorialIndex();
  const slideCount = tutorialTrack.children.length;
  [...tutorialDots.children].forEach((d, i) => d.classList.toggle("active", i === idx));
  tutPrevBtn.disabled = idx <= 0;
  tutNextBtn.disabled = idx >= slideCount - 1;
  if (tutStepLabel) tutStepLabel.textContent = `${idx + 1} / ${slideCount}`;
});
tutPrevBtn.onclick = () => goToTutorialSlide(currentTutorialIndex() - 1);
tutNextBtn.onclick = () => goToTutorialSlide(currentTutorialIndex() + 1);

// ============================================================
// YENİ GÜNCELLEME TANITIM EKRANI (otomatik, sayfa sayfa)
// Her yeni sürümde (LATEST_UPDATE_VERSION bump'landığında) burada da
// NEW_FEATURE_SLIDES güncellenmeli. Oyuna giren, tutorial'ı zaten görmüş
// ama bu sürümü henüz görmemiş herkese otomatik gösterilir.
// ============================================================
export const NEW_FEATURE_SLIDES = {
  "2.2": [
    { icon: "🜄", title: "ZEHİRLİ BATAKLIK AÇILDI", text: "Diyar haritasındaki o kilitli ikinci kapı sonunda aralandı. Seviye 15'i gören her savaşçı artık Zehirli Bataklık'a adım atabilir: zehir yeşili bir sisin altında, kıvrıla kıvrıla uzanan gölcüklerin arasında, ormandakinden çok daha tehlikeli bir av sahası. Orman bir okuldu — bataklık ise sınav. Gir, ama ayakkabılarını kirletmeye hazır gir." },
    { icon: "🎨", title: "GERÇEK BİR BATAKLIK — ELLE İŞLENMİŞ", text: "Bu diyarın zemini bir doku değil, bir arazi: derin suların ortası koyulaşıyor, kıyılar ıslak çamurla kararıyor, tümsekler yosunla aydınlanıyor. Suyun üstünde çentikli nilüferler yüzüyor, kenarlarında kamış başlı sazlıklar sallanıyor, yüzeyde su mercimeği kümeleri ve tek tük parıltılar geziniyor. Durup etrafına bakmak bile başlı başına bir deneyim — ama fazla durma, bakan sadece sen değilsin." },
    { icon: "📱", title: "OYUN ARTIK AVUCUNUN İÇİNDE", text: "Diyar savaşları baştan aşağı dikey moda taşındı: telefon tek elle tutulur, oyun tek parmakla oynanır. Joystick köşede seni beklemiyor — parmağını ekranın neresine koyarsan orada beliriyor. Kamera kahramanına yakınlaştı, aksiyon yüzüne yüzüne oynuyor; ekran dışında pusuya yatan her canavarı ise kenarlardaki renkli oklar ele veriyor. İstersen ⚙️ ayarından görüşü kendine göre yakınlaştır, uzaklaştır — tercihin kaydedilir, herkes kendi keyfince oynar." },
    { icon: "⚔️", title: "KILIÇ ARTIK KENDİ KONUŞUYOR", text: "Saldırı butonu emekli edildi. Kılıcın artık en yakın düşmanı kendisi buluyor, kendisi hedefliyor, kendisi savuruyor — sen sadece hareketi, kaçışı ve konumu düşünüyorsun. Bu bir kolaylık değil, bir odak değişimi: parmağın vurmakla değil, hayatta kalmakla meşgul. Saldırı Hızı statın kılıcın ritmini, Kritik statın patlamalarını belirliyor. Karakterin ne kadar güçlüyse, kılıç o kadar konuşkan." },
    { icon: "👹", title: "ÜÇ YENİ CANAVAR, ÜÇ AYRI KİŞİLİK", text: "Bataklığın üç sakini var ve hiçbiri diğerine benzemiyor. KAN CANAVARI yengeç gibi salınarak yaklaşır; canı azaldığında kudurur — hızlanır, seri vurur, yaralı halinden korkacaksın. İBLİS düz kovalamaz: gölgeye karışır, birkaç saniyede bir yanında beliriverir. DÖVÜŞÇÜ GOBLİN ise asla yalnız avlanmaz — yoldaşına sokulur, yanında sürüsü varken cesaretlenip daha çabuk şarj eder. Üstelik hepsi ormandakilerin iki katı canla ve çok daha ağır yumrukla geziyor. Nadir eşyalarını kuşan — burada lazım olacaklar." },
    { icon: "💰", title: "CÖMERT AMA ACIMASIZ BİR EKONOMİ", text: "Bataklık emeğin karşılığını peşin öder: kestiğin HER canavar 1-4 Altın ve 1-4 Hurda bırakır, her kelle 3 ile 7 arası EXP getirir — en tehlikeli av olan İblis, en cömert olanıdır. Kitaplar da düşer, ve dikkatli ol: Kan Canavarı bu bataklığın şanslı yaratığıdır, eşya düşürme ihtimali diğerlerinin neredeyse iki katı. Kimi keseceğini seçmek de artık bir strateji." },
    { icon: "🗡️", title: "HARİTADAN GERÇEK EŞYA DÜŞÜYOR", text: "Ve büyük haber: diyarda düşen eşyalar artık sadece bir yazı değil. Kestiğin canavardan çıkan her Sıradan ve Nadir eşya — evet, binde birlik o NADİR damla dahil — oyuna döndüğünde GERÇEK envanterine giriyor: gerçek isim, gerçek stat, gerçek efsun. Kutudan çıkmış gibi Koleksiyon Kitabı'na keşif olarak işleniyor. Harita ekranındaki yeni SIRADAN ve NADİR sayaçları o oturumda ne biriktirdiğini anlık gösteriyor. Artık bataklıkta geçen her dakika, çantana dönen bir yatırım." },
    { icon: "🍄", title: "BATAKLIK YAŞIYOR (VE KONUŞUYOR)", text: "Bu diyar sadece dövüşmüyor, nefes alıyor: yürürken ayağının altında vıcık vıcık bataklık sesi, eşya düştüğünde tatmin edici bir çınlama, düştüğünde ise ekranda beliren kurukafalı yepyeni bir ölüm sahnesi. Yolunu çürük balkabakları ve kurukafalı tabelalar keser, zeminde kemikler ürpertir. Ve mantarlar... mantarlarla aranı iyi tut. Kendi hallerinde konuşurlar, kılıcın değerse sitem ederler. Ne dediklerini yazmayacağız — git, kendin duy." },
    { icon: "⚖️", title: "GÜNLÜK MARKET HİZAYA GELDİ", text: "Günlük Market'te efsanevi eşyaların fazla sık boy gösterdiğini fark ettik — aynı gün iki efsanevi birden vitrine düşebiliyordu ve bu, 'efsanevi' kelimesinin hakkını yemekti. Oran ciddi şekilde aşağı çekildi: artık vitrinde bir efsanevi görmek gerçek bir olay, iki tanesini aynı anda görmekse yılda bir anlatacağın bir anı. Nadirlik, yeniden nadir." },
    { icon: "🔥", title: "İKİNCİ DİYAR DÜŞTÜ — SIRA ÜÇÜNCÜDE", text: "Fadeless'ın haritasına bak: beş diyar var ve ikisi artık senin. Orman öğretti, bataklık sınıyor — Yıkık Kale ise ufukta bekliyor. Her güncellemeyle bu dünya biraz daha derinleşiyor, biraz daha senin oluyor; ve bunu birlikte inşa ediyoruz — her geri bildirimin bir sonraki taşı koyuyor. Gelişiyoruz, ve bu daha başlangıç. Şimdi çizmelerini giy: bataklık, ilk efsanesini bekliyor." }
  ],
  "2.1": [
    { icon: "⚔️", title: "SAVAŞ ARTIK GERÇEK BİR DÜELLO", text: "Saldırı ekranı baştan yazıldı. Artık savaşlar bir 'güç karşılaştırması' değil, sıralı bir düello: iki savaşçı tur tur birbirine vuruyor, biri düşene kadar. İlk saldıran ilk kanı alır, ama gerisini beş statın belirler. Kimin kazanacağı artık şansa değil, kurduğun karaktere bağlı — ve her vuruş ekranda canlı canlı işleniyor." },
    { icon: "🎙️", title: "CANLI SPİKER ANLATIMI", text: "Düellonun her anı, bir arena spikerinin ağzından anlatılıyor. Kritik vuruşlar, hız serileri, öldürücü darbeler — hepsi yüzlerce farklı, coşkulu cümleyle betimleniyor. Aynı anlatıma iki kez denk gelmek neredeyse imkansız. Savaşını sadece izlemeyeceksin; dinleyeceksin." },
    { icon: "🎯", title: "STATLARIN GERÇEK ETKİSİ", text: "Beş savaş statı — Saldırı, Savunma, Can, Hız, Kritik — binlerce maçlık simülasyonla dengeye oturtuldu. Artık her biri kazanmaya somut katkı yapıyor: Kritik güçlendirildi (1.6x → 2.5x), Savunma'nın aşırı üstünlüğü kırıldı, Hız ise artık kimin önce vuracağını da belirliyor. Hangi stata yatırırsan yatır, seçimin bir karşılık buluyor." },
    { icon: "🔗", title: "TEK KARAKTER, İKİ DÜNYA", text: "Ormanda topladığın güç artık arenada da senin. Eşyalarından gelen Kritik ve Saldırı Hızı, canavar keserken de gerçek etki yaratıyor; kuşandığın her parça hem PvP savaşına hem gerçek zamanlı ormana birebir yansıyor. Herkes taban %5 kritikle başlıyor, eşya topladıkça yükseliyor. Artık iki ayrı oyun değil — tek bir kahramanın iki yüzü." },
    { icon: "🏅", title: "KADEMELER YENİLENDİ", text: "Elo kademeleri baştan düzenlendi: Çaylak, Savaşçı, Usta, Şampiyon ve en tepede Efsane. Herkes sıfırdan, 100 puanla Çaylak'tan başlıyor; kazandıkça tırmanıyor, kaybettikçe düşüyor. Ve artık liderlik tablosunda ve saldırı ekranında her oyuncunun seviyesi, kademesi ve son 5 maçının sonucu şık bir plakada görünüyor — rakibini tanımadan saldırmıyorsun." },
    { icon: "⚖️", title: "ADİL SAVAŞ, ADİL ÖDÜL", text: "Zorbalık önleme sistemi yeniden ayarlandı. Artık sadece gerçekten ezici bir güç farkı (senin 3,5 katın) ya da iki kademe Elo farkı 'zorbalık' sayılıyor. Kendine yakın rakiplerle yaptığın dürüst savaşlar artık hak ettiğin tam puanı veriyor. Total güç hesabı da beş statı birden içeriyor — sadece kağıt üstünde güçlü görünen değil, gerçekten güçlü olan kazanıyor." },
    { icon: "🎒", title: "ENVANTER SORUNLARI GİDERİLDİ", text: "Eşyalarla ilgili sinir bozucu hatalar kökünden çözüldü: aynı slottaki iki eşya artık birbirine karışmıyor, hepsi ayrı ayrı satılabiliyor ve kuşanılabiliyor. Ve en önemlisi — seviyenin üstünde bir eşya bir şekilde üstünde kaldıysa, oyuna girdiğinde otomatik olarak çantana geri konuyor. Artık hak etmediğin bir güçle dolaşmıyorsun; sistem kendini temizliyor." },
    { icon: "🌿", title: "ORMAN GÜZELLEŞTİ", text: "Unutulmuş Orman'ın zemini elden geçildi: kalitesiz, karolu görünüm gitti; yerine dikişsiz, doğal, elle işlenmiş bir çim dokusu geldi. Vuruş hissi de derinleşti — kılıç değdiği an temas noktasında bir kıvılcım patlaması, vuruş yönünde parlayan bir kesme izi ve fırlayıp zıplayan hasar sayıları eklendi. Kesmek artık çok daha tatmin edici." },
    { icon: "🛠️", title: "SESSİZ AMA ÖNEMLİ İYİLEŞTİRMELER", text: "Perde arkasında onlarca düzeltme yapıldı: mobil kontroller yeniden boyutlandırıldı, performansı düşüren efektler optimize edildi (FPS'i eriten cam-bulanıklık katmanı kaldırıldı), görev ödülleri denge için yeniden düzenlendi ve Kabus/Mitik özel kutuları artık gerçekten açılıyor. Küçük görünen ama oynanışı akıcılaştıran bir sürü dokunuş." },
    { icon: "🔥", title: "OYUN BÜYÜMEYE DEVAM EDİYOR", text: "Fadeless durmuyor. Her güncellemeyle savaş daha derin, ekonomi daha dengeli, dünya daha canlı oluyor. Bu sürüm, özellikle savaşın kalbini — düelloyu, statları ve adaleti — yeniden inşa etti. Geri bildirimlerin bu yolculuğun bir parçası; oynadıkça şekilleniyor. Şimdi kılıcını al ve yeni arenada yerini kanıtla." }
  ],
  "2.0": [
    { icon: "🕯️", title: "FADELESS DOĞDU", text: "Pembe Panterler Battle'ı tanıyordun. Onu unut. Oyun küllerinden yeni bir isimle doğdu: FADELESS — sönmeyen mumun oyunu. İsimle birlikte teni de değişti: pembe neonlar gitti, yerine karanlık taş, is ve gravür altınından örülmüş yepyeni bir tasarım geldi. Ekranlar, barlar, ikonlar, harita — hepsi bu yeni dünyanın diliyle konuşuyor. Mumu al, gerisini bu sayfalarda anlatacağız." },
    { icon: "📈", title: "SEVİYE ÇAĞI BAŞLADI", text: "Fadeless artık bir gelişim oyunu: kazandığın her EXP seni gerçek bir seviye merdiveninde yukarı taşıyor. Ve her seviye boş bir rakam değil — her atladığın seviye sana 1 Stat Puanı verir. O puanı Saldırı'ya mı basarsın, Savunma'ya mı, karar senin. İki oyuncu aynı seviyede olabilir; aynı güçte olması gerekmez. Karakterini sen yontacaksın." },
    { icon: "💨", title: "ÜÇ YENİ STAT: KRİTİK, HIZ, CAN", text: "Saldırı ve Savunma'nın yanına üç sessiz ortak katıldı: Kritik Vuruş şansı tuttuğunda hasarını 1.6 katına patlatır, Saldırı Hızı kılıcını serileştirir, Can seni herkesten uzun ayakta tutar. Bu üçü stat puanıyla basılmaz — yalnızca eşyalardan gelir: düşen her eşyanın bir ihtimalle üzerinde bu bonuslardan biri yazar. Envanterini iyi oku; iki 'aynı' eşya, hiç aynı değildir." },
    { icon: "🏛️", title: "ELO — KADEMENİ KANITLA", text: "Savaşların artık bir hafızası var: Elo. Herkes en alttan, Çaylak'tan başlar; kazandıkça Savaşçı, Usta, Kahraman basamaklarını tırmanır. En tepede ise yalnızca sunucunun seçilmişlerine yer var: kızıl harflerle yazılan EFSANE. Kademen profilinde herkesin gözü önünde taşınır — saklanamazsın. Sistem henüz genç, geliştirilmeye devam ediyor; ama sıralama bugünden itibaren yazılıyor." },
    { icon: "⚗️", title: "TOZ ÖLDÜ — HURDA VE ALTIN DOĞDU", text: "Eski ekonominin tozu süpürüldü, kelimenin tam anlamıyla: Toz oyundan tamamen kaldırıldı. Tahtına iki yeni değer oturdu — dişlilerin ve demircinin hammaddesi HURDA, ve ticaretin evrensel dili ALTIN. İkisi de bol değil, ikisi de bilerek kıt: cebinde biriken her Hurda ve Altın gerçek bir emeğin karşılığı. Har vurup harman savuran, demirci kapısında ağlar." },
    { icon: "📖", title: "KİTAPLAR VE DEMİRCİNİN ÇEKİCİ (+ BASMA)", text: "Eşyalar artık doğdukları gibi ölmüyor: Kitaplar ve + Basma sistemi geldi. Kitapları ve Hurda'nı demirciye taşı, eşyanı +9'a kadar bileyle. İlk dört basamak (+1'den +4'e) güven içindedir, çekiç asla şaşmaz. Ama +5'ten itibaren her vuruş bir kumardır ve tepeye yaklaştıkça şans acımasızlaşır — +9 kapısında on denemeden ancak biri geçer. Tesellin şu: başarısızlıkta eşyan ASLA yanmaz, yalnızca bastığın malzemeler kül olur. Cesaret senden, fatura da senden." },
    { icon: "🗡️", title: "EŞYALAR YENİ İSİMLERİYLE ANILIYOR", text: "Tüm eşya isimleri baştan yazıldı ve artık her isim, taşıdığı gücü fısıldıyor: Sıradan raflarda Demir Kılıç, Keten Zırh gibi mütevazı işçilikler; Nadir'de Gümüş ve Avcı dokunuşları; Efsanevi katında ise Ruh Kılıcı, Fırtına, Güneş gibi adına yemin edilen parçalar. Ve merdivenin görünmeyen iki basamağı: MİTİK 'Ejderha Hükümdarı' ile KABUS 'Kıyamet Habercisi' setleri — bunlar kutudan çıkmaz, yalnızca Haftalık Dünya Boss'unun cesedinden sökülür." },
    { icon: "🌲", title: "UNUTULMUŞ ORMAN AÇILDI", text: "Ve büyük kapı: Diyar sekmesindeki 'Diyara Gir' seni gerçek zamanlı bir savaş haritasına taşıyor. Orada karakterin gerçekten yürüyor, kılıç gerçekten sallanıyor — ve tüm statların (Saldırı, Savunma, Can, Hız, Kritik) seninle geliyor. Kestiğin canavarlardan düşen Altın, Hurda, Kitap ve EXP, oyuna döndüğünde otomatik hesabına işlenir; her ölüm ise puanından 1 alır. Bekleme ekranı yok: her canavar, ölümünden 10 saniye sonra ormanın başka köşesinde yeniden doğar. Orman hiç boşalmaz." },
    { icon: "⚖️", title: "ÇARŞI KURULDU", text: "Artık yalnız kasmıyorsun — ticaret geldi. Oyuncular Arası Pazar'da eşyanı satışa çıkarabilir, başkasının malına göz koyabilir, servetini kılıçla değil kurnazlıkla da büyütebilirsin. Ormandan cebine akan Altın tam da bunun için birikiyor. Unutma: pazarda ucuza kapatılan bir eşya, savaşta kazanılmış sayılır." },
    { icon: "🔥", title: "KÜLLERDEN BAŞLIYORUZ", text: "Yeni bir çağ, temiz bir sayfa ister: tüm hesaplar sıfırlandı. Dünkü zenginlikler, eski seviyeler, geçmiş zaferler — hepsi küle döndü. Herkes aynı çizgiden, Çaylak kademesinden, birinci seviyeden başlıyor; kimin efsaneleşeceğine bu kez baştan sona senin emeğin karar verecek. Mum yandı, demirci ateşi harlandı, orman bekliyor. İlk efsaneyi yazmaya var mısın?" }
  ],
  "1.16": [
    { icon: "🆕", title: "v1.16 Yenilikleri!", text: "Bu güncelleme oyunun hissiyatını ve teknik altyapısını birlikte güçlendiriyor: bildirimler geldi, sandık ve çark açılışları baştan animasyonlandı, saldırı anı için sıfırdan bir VS ekranı yazıldı, tüm eşyalar yeni SVG ikonlarına kavuştu ve kapaklarda onlarca hata/performans düzeltmesi yapıldı. Hadi tek tek bakalım." },
    { icon: "🔔", title: "Bildirimler", text: "Artık izin verirsen, sandığın hazır olduğunda ve saatlik saldırı hakkın açıldığında tarayıcı bildirimiyle haberdar oluyorsun; sekmeyi kapatmış olsan bile. Sağ üstteki 🔕 ikonuna dokunup açman yeterli, tamamen isteğe bağlı ve hiçbir oyun verisine dokunmuyor." },
    { icon: "📦", title: "Yeni Sandık Açılış Motoru", text: "Sandık açılışı sıfırdan yazıldı: katmanlı bir sandık (gövde, kapak, enerji mührü, güç kristali) artık gerçek bir şarj → patlama → açılış sırasıyla oynuyor. Nadirliğe göre renk paleti değişiyor, ekran flaşı, şok dalgası ve kıvılcım patlaması eşlik ediyor." },
    { icon: "🎡", title: "Şanslı Çark Yenilendi", text: "Çark artık 'Karanlık Kader Çarkı' temasında: dönen rün çemberi, şeytan gözü göbek, kanlı ibre ve kazanınca patlayan şok dalgası + ekran sarsıntısı + fizik motorlu kor parçacıklarıyla çok daha epik bir deneyim sunuyor." },
    { icon: "⚔️", title: "Yepyeni Saldırı (VS) Ekranı", text: "Artık saldırmadan önce, seninle rakibinin gerçek isim ve statlarının göründüğü gerilimli bir VS ekranı açılıyor: kartlar kayarak giriyor, kıvılcımlar saçılıyor, sayaç son 3 saniyede kırmızıya dönüp hızlanıyor, dönen 'hype' cümleleri seni geriyor ve süre bitince iki savaşçı birbirine hamle yapıp çarpışıyor." },
    { icon: "🧰", title: "Ekipman İkonları ve Animasyonları", text: "Her eşya artık emoji yerine, nadirliğine göre (standart/nadir/efsanevi) tamamen farklı çizilmiş bir SVG ikonla gösteriliyor. Standart eşyalar sade, nadir eşyalar mavi/çelik temalı, efsanevi eşyalar ise sürekli parlayan, süzülen ve dönen özel efektler taşıyor; bu görseller kuşanım, envanter, çanta ve kutu açılış popup'ının hepsinde tutarlı şekilde kullanılıyor." },
    { icon: "🐛", title: "Bir Sürü Hata Düzeltmesi ve Performans İyileştirmesi", text: "Bu sürümde ayrıca gözle görülmeyen ama hissedilen bir sürü iyileştirme var: haftalık liderlik sıfırlaması, Kahin Bahsi sonuçlandırma ve Kelle Avcısı ilanı gibi paylaşımlı işlemler artık yarış durumlarına (race condition) karşı tamamen güvenli. Oyuncu değiştirirken eski dinleyicilerin temizlenmesi, gereksiz yeniden çizimlerin azaltılması ve genel kod optimizasyonlarıyla oyun artık daha akıcı ve daha kararlı çalışıyor." }
  ],
  "1.14": [
    { icon: "🆕", title: "v1.14 Yenilikleri!", text: "Bu güncelleme oyunun ekipman derinliğini ciddi şekilde artırıyor: 3 yeni slot, 69 yeni eşya, yepyeni bir Efsun sistemi, yenilenmiş bir envanter tasarımı ve daha adil bir savaş algoritması geldi. Hadi tek tek bakalım." },
    { icon: "🔰", title: "3 Yeni Slot: Kalkan, Küpe, Kolye", text: "Kuşanım artık 5 değil 8 slot: Kask, Zırh ve Ayakkabı'nın yanına savunma tipinde 🔰 Kalkan; Kılıç ve Eldiven'in yanına ise saldırı tipinde 💎 Küpe ve 📿 Kolye eklendi. Karakter sahnesinde bu 3 slot da panterin üzerinde uygun anatomik konumlarda (kolyede boyunda, kalkan elinde, küpe kulağında) gösteriliyor." },
    { icon: "🧰", title: "69 Yeni Eşya", text: "Yeni slotların her birine tam 20 eşya eklendi: 11 standart, 6 nadir, 3 efsanevi. Toplamda 60 standart/nadir + 9 yepyeni efsanevi eşya oyuna katıldı. Yeni efsanevi eşyaların hepsinin gerçek pasif etkileri var; örneğin Kaymağın Kalkanı savunmayı %15 güçlendiriyor, Nazarlıklı Amcanın Kolyesi rakibe lanet okuyor, Işıltılı Dedikodu Küpesi ise %10 ihtimalle anında kazandırıyor." },
    { icon: "✨", title: "Efsun (Enchant) Sistemi", text: "Artık kutudan çıkan HER eşya, nadirliğine göre değişen oranda ekstra bir Efsun bonusu taşıyor: Standart eşyalarda ~%1-3, Nadir eşyalarda ~%5-9, Efsanevi eşyalarda ~%12-18 arası. Bu bonus otomatik olarak eşyanın ana statına (saldırı tipi eşyalarda saldırıya, savunma tipinde savunmaya) ekleniyor, yani aynı isimli iki eşya bile artık birbirinden farklı güçte çıkabilir. Efsun oranı eşyanın göründüğü her yerde ✨ rozetiyle gösteriliyor." },
    { icon: "📖", title: "Yenilenen Envanter Tasarımı", text: "Envanter ekranı sıfırdan tasarlandı: her eşya artık nadirliğine göre renklenen bir ikon rozeti, ayrı ayrı 'saldırı / savunma / efsun' etiketleri ve nadirlik + kutudan çıkma şansı bilgisiyle gösteriliyor. Envanterin en üstünde ise o slotun temel kutu şanslarını (Standart / Nadir / Efsanevi) özetleyen yeni bir bilgi şeridi var." },
    { icon: "⚔️", title: "Daha Adil Savaş Algoritması", text: "Önceden savaşta sadece 'rol statı' bakılıyordu (saldıranın sadece saldırısı, savunanın sadece savunması). Bu yüzden saldırısı düşük ama savunması çok yüksek biri saldırıya geçtiğinde, kendinden çok daha zayıf ekipmanlı birine bile otomatik kaybedebiliyordu. Artık her iki tarafın DİĞER statı da küçük bir ağırlıkla hesaba katılıyor, yani toplam ekipman yatırımın savaşta gerçekten işine yarıyor." }
  ],
  "1.13": [
    { icon: "🆕", title: "v1.13 Yenilikleri!", text: "Bu güncelleme oyunun görünüşüne ve kulağa gelişine odaklanıyor, ayrıca can sıkan bir haftalık liderlik hatası da düzeltildi. Hadi bakalım." },
    { icon: "🔤", title: "Yeni Yazı Tipleri", text: "Oyunun geneli artık daha yuvarlak ve kalın bir fontla (Fredoka) yazılıyor. Logo ve büyük başlık şeritleri ise daha iddialı, kalın bir font olan Luckiest Guy ile gösteriliyor." },
    { icon: "🔊", title: "Gerçek Ses Efektleri", text: "Buton tıklaması, saldırı anı, savaş/Kahin Bahsi/Gizemli Yabancı sonuçlarındaki kazanma-kaybetme sesleri ve Şanslı Çark'ın dönüşü artık sentetik biplerden gerçek ses kayıtlarına geçti." },
    { icon: "🏆", title: "Haftalık Liderlik Sıfırlaması Düzeltildi", text: "Sıfırlama artık sadece girişte değil, oyun açıkken de dakikada bir otomatik kontrol ediliyor. Pazar 00:00 geldiğinde uygulama açık kalsa bile puanlar gerçekten sıfırlanıp şampiyon ödülünü kapıyor." }
  ],
  "1.12": [
    { icon: "🆕", title: "v1.12 Yenilikleri!", text: "Bu güncelleme oyuna sezonluk bir rekabet katıyor: Haftalık Liderlik Tablosu ve Rozetler geldi. Hadi bakalım." },
    { icon: "🏆", title: "Haftalık Liderlik Sıfırlaması", text: "Liderlik tablosu artık her Pazar 00:00'da sıfırlanıyor! O haftayı 1. bitiren oyuncu hurda + garanti bir nadir eşya kazanıyor. ÖNEMLİ: sıfırlama anında kazanan da dahil HERKESİN puanı 0'a dönüyor, yani her hafta sıfırdan yeni bir yarış başlıyor." },
    { icon: "🎖️", title: "Rozetler", text: "Profil altındaki İstatistik sekmesine yeni bir 🎖️ Rozetler paneli eklendi. Toplam 44 farklı rozet var: galibiyet serileri, efsanevi eşya koleksiyonu, Kahin Bahsi'nde 'Bahis Baronu' olmak, Kelle Avcısı'nda 'Cellat' olmak, haftanın birinciliği ve daha fazlası. Rozetler otomatik hesaplanıyor, kazandıkça anında açılıyor." }
  ],
  "1.11": [
    { icon: "🆕", title: "v1.11 Yenilikleri!", text: "Bu güncellemede görev sistemine yeni bir katman eklendi ve Kahin Bahsi'nde birkaç önemli kural netleşti. Hadi bakalım neler değişti." },
    { icon: "🗓️", title: "Haftalık Görevler", text: "Görev sekmesine yeni bir 🗓️ Haftalık Görevler paneli eklendi. Her hafta Pazartesi sıfırlanan bu görevlerden 3 tanesi rastgele atanıyor (örn. çokça kutu aç, savaş kazan, Kahin Bahsi'ni doğru bil, Kelle Avcısı ödülünü kap). Zorluk günlük görevlerden belirgin şekilde yüksek, ödüller de (hurda + puan + bazen garanti/şanslı nadir eşya) buna göre büyütüldü." },
    { icon: "📅", title: "Aylık Görevler", text: "Yeni 📅 Aylık Görevler panelinde her ay 3 görev var. Bunlardan biri her zaman sabit ve gerçekten zor: 'Bu ay 30 savaş kazan'. Bu görevi tamamlayan tek ödül olarak garanti bir efsanevi eşya kazanıyor! Diğer iki aylık görev ise (kutu açma, saldırı, Kahin Bahsi veya Kelle Avcısı temelli) büyük miktarda hurda, puan ve garanti nadir eşya veriyor." },
    { icon: "🔮", title: "Kahin Bahsi'nde Netleşen Kurallar", text: "Kahin Bahsi'nde artık kendine bahis oynayamıyorsun, hedef listende kendi ismin görünmüyor. Ayrıca tek seferde yatırabileceğin hurda miktarı en fazla 10 hurda ile sınırlandı. Bu değişiklikler bahsin herkes için adil ve dengeli kalması içindi." },
    { icon: "🔊", title: "Ses Efektleri Sağlam", text: "Bir önceki güncellemede eklenen yumuşak buton tıklama sesi ve saldırıdaki metalik 'çınnn' efekti bu sürümde de aynen korunuyor, sağlam ve sorunsuz çalışıyor." }
  ],
  "1.10": [
    { icon: "🆕", title: "v1.10 Yenilikleri!", text: "Bu güncellemede 1 yeni sistem ve oyunun kulaklara daha iyi gelmesi için bir ses güncellemesi var. Hadi bakalım." },
    { icon: "🔮", title: "Kahin Bahsi", text: "Yeni 🔮 Kahin Bahsi, Sıra sekmesine eklendi. Günün sonunda liderlik tablosunun 1.'sinin kim olacağını tahmin edip hurda yatırıyorsun. Günde 1 hakkın var: doğru bilirsen yatırdığın hurda 2 katına çıkar, yanlış bilirsen gider. Sonucu bir sonraki girişinde otomatik öğrenirsin." },
    { icon: "🔊", title: "Daha Tatlı Sesler", text: "Genel buton tıklama sesi artık çok daha yumuşak ve kulak yormuyor. Saldırı butonuna basınca ise gerçek bir kılıç çarpışması gibi metalik bir 'çınnn' sesi duyuyorsun." }
  ],
  "1.9": [
    { icon: "🆕", title: "v1.9 Yenilikleri!", text: "Bu güncellemede oyuna 4 yepyeni sistem ve ana ekrana günlük bir performans panosu eklendi. Hadi hızlıca gezelim." },
    { icon: "📊", title: "Kişisel İstatistik", text: "Yeni 📊 İstatistik sekmesinde toplam kazanma/kaybetme oranını, en çok yendiğin ve en çok yenildiğin kişiyi, şu anki ve şimdiye kadarki en uzun kazanma serini görebilirsin." },
    { icon: "🎡", title: "Şanslı Çark", text: "Kutu sekmesine eklendi. Haftada bir kez tamamen bedava çevirebilirsin, küçük hurda/puan ödülleri ve nadiren büyük bir jackpot kazandırır." },
    { icon: "💀", title: "Kelle Avcısı", text: "Savaş sekmesinde artık hurdanı harcayarak istediğin bir oyuncunun kellesine ödül koyabilirsin. Bu ilan herkese aynı anda görünür, o kişiyi İLK yenen ödülü kapar." },
    { icon: "👑", title: "1.lik Avı", text: `Liderlik tablosunun zirvesindeki oyuncu artık 👑 rozetiyle işaretleniyor. Onu saldırıda yenersen normal kazancının üstüne +${THRONE_BONUS_POINTS} ekstra bonus puan kazanırsın.` },
    { icon: "🦁", title: "Allahın Aslanı & Grubun Sürtüğü", text: "Ana ekranın üstünde artık günün en çok savaş kazanan oyuncusu 🦁 'Allahın Aslanı', en çok kaybedeni ise 🤡 'Grubun Sürtüğü' olarak gösteriliyor. Her gün sıfırdan başlıyor." }
  ]
};

export function renderNewFeaturesSlides(version) {
  const slides = NEW_FEATURE_SLIDES[version] || [];
  newFeaturesTrack.innerHTML = slides.map(s => `
    <div class="tutorial-slide">
      <div class="tut-hero">${s.icon}</div>
      <h2 class="tut-title">${s.title}</h2>
      <p class="tut-text">${s.text}</p>
    </div>
  `).join("");
}

export function currentNewFeaturesIndex() {
  return Math.round(newFeaturesTrack.scrollLeft / newFeaturesTrack.clientWidth);
}
export function goToNewFeaturesSlide(i) {
  const slideCount = newFeaturesTrack.children.length;
  const clamped = Math.max(0, Math.min(slideCount - 1, i));
  newFeaturesTrack.scrollTo({ left: clamped * newFeaturesTrack.clientWidth, behavior: "smooth" });
}
export function buildNewFeaturesDots() {
  const slideCount = newFeaturesTrack.children.length;
  newFeaturesDots.innerHTML = "";
  for (let i = 0; i < slideCount; i++) {
    const dot = document.createElement("button");
    dot.className = "tut-dot" + (i === 0 ? " active" : "");
    dot.onclick = () => goToNewFeaturesSlide(i);
    newFeaturesDots.appendChild(dot);
  }
}
if (newFeaturesTrack) {
  newFeaturesTrack.addEventListener("scroll", () => {
    const idx = currentNewFeaturesIndex();
    const slideCount = newFeaturesTrack.children.length;
    [...newFeaturesDots.children].forEach((d, i) => d.classList.toggle("active", i === idx));
    nfPrevBtn.disabled = idx <= 0;
    nfNextBtn.disabled = idx >= slideCount - 1;
    if (nfStepLabel) nfStepLabel.textContent = `${idx + 1} / ${slideCount}`;
  });
  nfPrevBtn.onclick = () => goToNewFeaturesSlide(currentNewFeaturesIndex() - 1);
  nfNextBtn.onclick = () => goToNewFeaturesSlide(currentNewFeaturesIndex() + 1);
}

export function closeNewFeatures() {
  localStorage.setItem("gacha_last_seen_update", LATEST_UPDATE_VERSION);
  newFeaturesModal.classList.add("hidden");
  refreshUpdatesDot();
}
if (closeNewFeaturesBtn) closeNewFeaturesBtn.onclick = closeNewFeatures;
if (nfSkipBtn) nfSkipBtn.onclick = closeNewFeatures;

// seen === LATEST_UPDATE_VERSION zaten ise (yenilikler ekranı açılmayacaksa)
// çağıran taraf (startGame) bunu bilip anma modalını kendisi tetikleyebilsin
// diye fonksiyon artık modalın gerçekten açılıp açılmadığını (true/false)
// döndürüyor.
export function maybeShowNewFeatures() {
  const seen = localStorage.getItem("gacha_last_seen_update");
  if (seen === LATEST_UPDATE_VERSION) return false;
  if (!NEW_FEATURE_SLIDES[LATEST_UPDATE_VERSION]) { closeNewFeatures(); return false; }
  renderNewFeaturesSlides(LATEST_UPDATE_VERSION);
  buildNewFeaturesDots();
  newFeaturesModal.classList.remove("hidden");
  nfPrevBtn.disabled = true;
  nfNextBtn.disabled = newFeaturesTrack.children.length <= 1;
  if (nfStepLabel) nfStepLabel.textContent = `1 / ${newFeaturesTrack.children.length}`;
  requestAnimationFrame(() => { newFeaturesTrack.scrollLeft = 0; });
  return true;
}

// [V2] Faz 7: bu fonksiyon artık hiçbir yerden çağrılmıyor (startGame()
// artık maybeShowTutorialV2()'yi kullanıyor). Kod tabanında referans/geri
// dönüş imkânı için bilerek silinmedi, ölü kod olarak duruyor.
export function maybeShowTutorial() {
  if (!localStorage.getItem("gacha_tutorial_seen")) {
    openTutorial();
    return true;
  }
  return false;
}
export function openTutorial() {
  renderLegendaryShowcase();
  buildTutorialDots();
  tutorialModal.classList.remove("hidden");
  tutPrevBtn.disabled = true;
  tutNextBtn.disabled = tutorialTrack.children.length <= 1;
  if (tutStepLabel) tutStepLabel.textContent = `1 / ${tutorialTrack.children.length}`;
  // Modal ilk kez görünür olduğunda scrollLeft/clientWidth doğru okunsun diye ufak bir gecikme
  requestAnimationFrame(() => { tutorialTrack.scrollLeft = 0; });
}
export function closeTutorial() {
  localStorage.setItem("gacha_tutorial_seen", "1");
  // Yeni öğretici zaten bu sürümün tüm yeniliklerini anlattığı için, ayrıca
  // "Yeni Güncelleme" ekranını tekrar göstermeye gerek yok.
  localStorage.setItem("gacha_last_seen_update", LATEST_UPDATE_VERSION);
  refreshUpdatesDot();
  tutorialModal.classList.add("hidden");
}
closeTutorialBtn.onclick = closeTutorial;
if (tutSkipBtn) tutSkipBtn.onclick = closeTutorial;
howToBtn.onclick = () => openTutorialV2();

// ============================================================
// [V2] YENİ TUTORIAL AKIŞI (Faz 7 — içerik dolduruldu, V1 devre dışı)
// ------------------------------------------------------------
// #tutorialModal (V1) kod tabanında hâlâ duruyor ve teknik olarak
// çalışıyor, ama içeriği artık GÜNCEL DEĞİL (PIN sistemi, 5 slot,
// sabit +10/-5 puan gibi V1 döneminden kalma bilgiler içeriyor).
// Bu yüzden hem startGame()'deki otomatik tetikleme hem de howToBtn
// (yardım) artık aşağıdaki #tutorialModalV2'ye yönlendiriliyor.
//
// createSlideCarouselEngine, V1'deki tutorial/yenilikler ekranlarında
// az farklarla iki kez tekrar eden kaydırma/dot/nav mantığını tek bir
// yerde topluyor; V1'e dokunmadan sadece V2 için kullanılıyor.
// ============================================================
export function createSlideCarouselEngine({ track, dots, prevBtn, nextBtn, stepLabel }) {
  function currentIndex() {
    if (!track.clientWidth) return 0;
    return Math.round(track.scrollLeft / track.clientWidth);
  }
  function goTo(i) {
    const slideCount = track.children.length;
    if (!slideCount) return;
    const clamped = Math.max(0, Math.min(slideCount - 1, i));
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  }
  function buildDots() {
    const slideCount = track.children.length;
    dots.innerHTML = "";
    for (let i = 0; i < slideCount; i++) {
      const dot = document.createElement("button");
      dot.className = "tut-dot" + (i === 0 ? " active" : "");
      dot.onclick = () => goTo(i);
      dots.appendChild(dot);
    }
  }
  function syncControls() {
    const idx = currentIndex();
    const slideCount = track.children.length;
    [...dots.children].forEach((d, i) => d.classList.toggle("active", i === idx));
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = slideCount === 0 || idx >= slideCount - 1;
    if (stepLabel) stepLabel.textContent = slideCount ? `${idx + 1} / ${slideCount}` : "0 / 0";
  }
  track.addEventListener("scroll", syncControls);
  prevBtn.onclick = () => goTo(currentIndex() - 1);
  nextBtn.onclick = () => goTo(currentIndex() + 1);

  function reset() {
    buildDots();
    prevBtn.disabled = true;
    nextBtn.disabled = track.children.length <= 1;
    if (stepLabel) stepLabel.textContent = `${track.children.length ? 1 : 0} / ${track.children.length}`;
    requestAnimationFrame(() => { track.scrollLeft = 0; });
  }

  return { goTo, currentIndex, buildDots, syncControls, reset };
}

export const tutorialModalV2 = document.getElementById("tutorialModalV2");
export const tutorialTrackV2 = document.getElementById("tutorialTrackV2");
export const tutorialDotsV2 = document.getElementById("tutorialDotsV2");
export const tutV2PrevBtn = document.getElementById("tutV2PrevBtn");
export const tutV2NextBtn = document.getElementById("tutV2NextBtn");
export const tutStepLabelV2 = document.getElementById("tutStepLabelV2");
export const tutV2SkipBtn = document.getElementById("tutV2SkipBtn");
export const closeTutorialV2Btn = document.getElementById("closeTutorialV2Btn");

export const tutorialV2Engine = createSlideCarouselEngine({
  track: tutorialTrackV2, dots: tutorialDotsV2,
  prevBtn: tutV2PrevBtn, nextBtn: tutV2NextBtn, stepLabel: tutStepLabelV2
});

export function openTutorialV2() {
  tutorialModalV2.classList.remove("hidden");
  tutorialV2Engine.reset();
}
export function closeTutorialV2() {
  localStorage.setItem("gacha_tutorial_v2_seen", "1");
  tutorialModalV2.classList.add("hidden");
}
closeTutorialV2Btn.onclick = closeTutorialV2;
if (tutV2SkipBtn) tutV2SkipBtn.onclick = closeTutorialV2;

// startGame() içindeki otomatik tetikleme ve howToBtn (yardım butonu)
// bu fonksiyonu çağırıyor; V1 (#tutorialModal) artık otomatik açılmıyor.
export function maybeShowTutorialV2() {
  if (tutorialTrackV2.children.length === 0) return false;
  if (localStorage.getItem("gacha_tutorial_v2_seen")) return false;
  openTutorialV2();
  return true;
}

// ============================================================
// ANMA MODALI (siyah-beyaz, tek seferlik)
// Oyunun İLK açılışında (tutorial ya da yenilikler ekranı kapatıldıktan
// hemen sonra) bir kereliğine gösterilir. "Helvanı al" butonuna basınca
// bir daha asla görünmez ve oyuncuya +10 hurda hediye edilir.
// ============================================================
// ============================================================
// YENİLİKLER / YOL HARİTASI
// Her yeni özellik bittiğinde status'u "soon" -> "done" yapıp
// LATEST_UPDATE_VERSION'ı artırman yeterli, rozet otomatik güncellenir.
// ============================================================
export const LATEST_UPDATE_VERSION = "2.2";

export const RELEASES = [
  {
    version: "2.1",
    date: "19 Temmuz 2026",
    items: [
      "⚔️ Savaş sistemi baştan yazıldı — sıralı düello: Saldırı artık tek seferlik bir güç karşılaştırması değil, tur tur işleyen gerçek bir düello. İlk saldıran başlar, iki taraf sırayla vurur, biri düşene kadar (en fazla 15 tur; süre dolarsa canı fazla olan kazanır). Kim kazanacağını tamamen beş statın belirliyor.",
      "🎙️ Canlı spiker anlatımı eklendi: düellonun her turu, arena spikeri edasıyla ve 140'tan fazla farklı cümleden oluşan bir havuzdan anlatılıyor. Normal vuruş, kritik, hız serisi ve öldürücü darbe için ayrı ayrı, coşkulu betimlemeler — aynı anlatıma denk gelmek neredeyse imkânsız.",
      "🎯 Statlar dengeye alındı: beş savaş statı (Saldırı, Savunma, Can, Hız, Kritik) binlerce maçlık simülasyonla ölçülüp yeniden ayarlandı. Kritik çarpanı 1.6x'ten 2.5x'e çıkarıldı, Savunma'nın aşırı baskınlığı kırıldı, Hız artık kimin önce vuracağını da belirliyor. Her stat artık kazanmaya somut katkı yapıyor.",
      "🔗 Orman ile arena tam entegre edildi: ana oyundaki tüm statlar (Kritik ve Saldırı Hızı dahil) gerçek zamanlı ormanda birebir geçerli. Herkes taban %5 kritikle başlıyor, eşyalardan gelen bonuslar bunun üstüne ekleniyor. Kuşandığın her parça artık hem PvP'de hem canavar keserken aynı etkiyi gösteriyor.",
      "🏅 Elo kademeleri yenilendi: kademeler Çaylak, Savaşçı, Usta, Şampiyon ve Efsane olarak düzenlendi. Başlangıç Elo'su 100'e çekildi; herkes Çaylak'tan başlıyor. Liderlik tablosunda ve saldırı ekranında her oyuncunun seviyesi, kademesi ve son 5 maç sonucu artık renkli bir plakada gösteriliyor.",
      "⚖️ Zorbalık önleme dengelendi: 'griefing' eşiği gevşetildi — artık yalnızca gerçekten ezici güç farkı (3,5 kat) ya da 2 kademe Elo farkı ceza tetikliyor. Kendine yakın rakiplerle yapılan dürüst savaşlar tam puan veriyor. Total güç hesabı da artık beş statı birden içeriyor.",
      "🎒 Envanter hataları giderildi: aynı slotta birden fazla eşya olduğunda kartların birbirine karışması ve satılamama sorunu kökünden çözüldü (her eşyaya benzersiz kimlik verildi). Ayrıca seviyesinin üstünde eşya kuşanmış oyuncuların bu eşyaları, oyuna girişte otomatik olarak envantere geri alınıyor.",
      "🌿 Orman zemini yenilendi: eski karolu, kalitesiz çim dokusu kaldırıldı; yerine dikişsiz, doğal görünen elle işlenmiş bir çim geldi. Ayrıca vuruş hissi derinleştirildi — temas anında kıvılcım patlaması, vuruş yönünde parlayan kesme izi ve fırlayıp zıplayan hasar sayıları eklendi.",
      "🛠️ Performans ve arayüz iyileştirmeleri: FPS düşüren cam-bulanıklık (backdrop-filter) katmanı kaldırıldı, ses sistemi optimize edildi, mobil dokunmatik kontroller yeniden boyutlandırıldı, Kabus ve Mitik özel kutuları artık gerçekten açılabiliyor ve görev ödülleri denge için yeniden düzenlendi (günlük görevler artık nadir eşya vermiyor, aylık en zor görev tek bir nadir eşya veriyor)."
    ]
  },
  {
    version: "2.0",
    date: "19 Temmuz 2026",
    items: [
      "🕯️ Oyunun adı ve kimliği değişti: Pembe Panterler Battle artık FADELESS. Karanlık taş, is ve gravür altını temalı yepyeni bir tasarım oyunun tamamına işlendi.",
      "📈 Seviye sistemi geldi: kazanılan EXP gerçek bir seviye merdiveninde ilerletiyor ve her seviye atlayışı 1 Stat Puanı veriyor — puanını Saldırı'ya ya da Savunma'ya basarak karakterini kendin şekillendiriyorsun.",
      "💨 3 yeni stat eklendi: Kritik Vuruş (şans tuttuğunda 1.6x hasar), Saldırı Hızı ve Can. Bu statlar puanla basılmıyor; yalnızca düşen eşyaların üzerinde şansa bağlı bonus olarak geliyor — aynı isimli iki eşya artık farklı değerde olabilir.",
      "🏛️ Elo sistemi geldi (geliştirilmeye devam ediyor): herkes Çaylak'tan başlıyor, kazandıkça Savaşçı, Usta, Kahraman ve en tepede Efsane kademelerine tırmanıyor. Kademen profilinde herkese görünür.",
      "⚗️ Ekonomi baştan kuruldu: Toz oyundan tamamen kaldırıldı; yerine demircinin hammaddesi HURDA ve ticaretin para birimi ALTIN geldi. İkisi de bilinçli olarak kıt — enflasyon bu çağda yasak.",
      "📖 Kitaplar ve + Basma (demirci) sistemi geldi: eşyalar Kitap + Hurda harcayarak +9'a kadar geliştirilebiliyor. +1'den +4'e basımlar %100 garanti; +5'ten itibaren her basamakta başarısızlık ihtimali artıyor (+9 kapısında şans onda bire düşüyor). Başarısızlıkta eşya ASLA yok olmuyor, yalnızca harcanan malzemeler gidiyor.",
      "🗡️ Tüm eşya isimleri güncellendi: Sıradan/Nadir/Efsanevi katmanların her biri kendi karakterinde yeni isim havuzlarına kavuştu (Demir Kılıç'tan Ruh Kılıcı'na uzanan bir merdiven). Ayrıca MİTİK 'Ejderha Hükümdarı' ve KABUS 'Kıyamet Habercisi' setleri eklendi — yalnızca Haftalık Dünya Boss'undan düşüyorlar.",
      "🌲 Unutulmuş Orman açıldı: 'Diyara Gir' artık gerçek zamanlı bir aksiyon haritası açıyor. Tüm statların (Saldırı/Savunma/Can/Hız/Kritik) haritada birebir geçerli; düşen Altın, Hurda, Kitap ve EXP dönüşte otomatik hesaba işleniyor; her ölüm 1 puan bedel ödetiyor. Bekleme ekranı yok — her canavar ölümünden 10 saniye sonra yeniden doğuyor.",
      "🖥️ Harita arayüzü sıfırdan tasarlandı: mühürlü seviye diski, gerçek adının yazdığı kahraman plakası, akan can barı, gerçek seviye ilerlemene bağlı altın EXP barı ve Altın/Kitap/Hurda kaynak defteri.",
      "⚖️ Oyuncular Arası Pazar kuruldu: eşyalarını diğer oyunculara satışa çıkarabilir, başkalarının satışlarından alışveriş yapabilirsin. Ticaret çağı resmen başladı.",
      "🔥 Temiz başlangıç: tüm hesaplar sıfırlandı; herkes 1. seviyeden ve Çaylak kademesinden başlıyor. Yeni çağın ilk efsanesi henüz yazılmadı."
    ]
  },
  {
    version: "1.16",
    date: "7 Temmuz 2026",
    items: [
      "🔔 Bildirimler eklendi: izin verirsen artık sandığın hazır olduğunda ve saatlik saldırı hakkın açıldığında tarayıcı bildirimiyle haberdar oluyorsun, sekme kapalıyken bile. Sağ üstteki 🔕 ikonundan tamamen isteğe bağlı olarak açıp kapatabilirsin.",
      "📦 Sandık açılış motoru baştan yazıldı: katmanlı bir sandık (gövde + kapak + enerji mührü + güç kristali) artık gerçek bir şarj → patlama → açılış durum makinesiyle oynuyor. Nadirliğe göre renk paleti değişiyor, ekran flaşı + şok dalgası + kıvılcım patlaması eşlik ediyor.",
      "🎡 Şanslı Çark yenilendi: 'Karanlık Kader Çarkı' temasında dönen rün çemberi, şeytan gözü göbek, kanlı ibre ve kazanınca patlayan şok dalgası + ekran sarsıntısı + fizik motorlu kor parçacıkları eklendi.",
      "⚔️ Yepyeni bir Saldırı (VS) ekranı eklendi: saldırmadan önce seninle rakibinin gerçek isim ve statlarının göründüğü gerilimli bir ekran açılıyor; kartlar kayarak giriyor, kıvılcımlar saçılıyor, sayaç son 3 saniyede kırmızıya dönüp hızlanıyor, dönen 'hype' cümleleri geriyor ve süre bitince iki savaşçı birbirine hamle yapıp çarpışıyor.",
      "🧰 Tüm eşyalar yeni SVG ikonlarına kavuştu: her eşya artık nadirliğine göre tamamen farklı çizilmiş bir ikonla gösteriliyor; efsanevi eşyalar sürekli parlayan/süzülen/dönen özel efektler taşıyor. Kuşanım, envanter, çanta ve kutu açılış popup'ının hepsinde tutarlı.",
      "🐛 Bir sürü hata düzeltmesi: haftalık liderlik sıfırlaması, Kahin Bahsi sonuçlandırma ve Kelle Avcısı ilanı gibi paylaşımlı işlemler artık yarış durumlarına (race condition) karşı tamamen güvenli hale getirildi.",
      "⚡ Performans iyileştirmeleri: oyuncu değiştirirken eski dinleyicilerin düzgün temizlenmesi, gereksiz yeniden çizimlerin azaltılması ve genel kod optimizasyonlarıyla oyun artık daha akıcı ve daha kararlı çalışıyor."
    ]
  },
  {
    version: "1.14",
    date: "5 Temmuz 2026",
    items: [
      "🔰💎📿 3 yeni ekipman slotu eklendi: Kalkan, Küpe ve Kolye! Kalkan savunma tipinde, Küpe ve Kolye saldırı tipinde çalışıyor. Artık kuşanım toplam 8 slota çıktı: Kask, Zırh, Kalkan, Kılıç, Eldiven, Küpe, Kolye, Ayakkabı. Karakter sahnesinde de bu 3 yeni slot, panterin üzerinde anatomik olarak doğru konumlarda (kolye boyunda, kalkan bir elde, küpe kulakta) gösteriliyor.",
      "🧰 Her yeni slot için 20'şer eşya eklendi (toplam 60 yeni standart/nadir eşya + 9 yeni efsanevi eşya = 69 yeni eşya): Kalkan, Küpe ve Kolye'nin her birinde 11 standart, 6 nadir ve 3 efsanevi eşya var. Yeni efsanevi eşyalar da diğerleri gibi gerçek pasif etkilere sahip (örn. 'Kaymağın Kalkanı' savunmayı %15 güçlendiriyor, 'Nazarlıklı Amcanın Kolyesi' rakibe lanet okuyor).",
      "✨ EFSUN (Enchant) sistemi eklendi: Artık her düşen eşya, nadirliğine göre değişen oranda ek bir 'efsun' bonusu kazanıyor ve bu bonus eşyanın ana statına (saldırı tipi eşyalarda saldırıya, savunma tipi eşyalarda savunmaya) otomatik ekleniyor. Standart eşyalarda efsun ~%1-3, Nadir eşyalarda ~%5-9, Efsanevi eşyalarda ~%12-18 arası. Bu sayede aynı isimli iki eşya bile efsun farkından dolayı birbirinden az ya da çok güçlü çıkabiliyor. Efsun oranı, eşyanın olduğu her yerde (envanter, kutu açılış popup'ı, görev ödülü popup'ı, başkasının ekipmanı ekranı) ✨ rozetiyle gösteriliyor.",
      "📖 Envanter ekranı baştan tasarlandı: her eşya artık nadirliğine göre renklenen bir ikon rozetiyle, ayrı stat 'hap'leriyle (⚔️ saldırı / 🛡️ savunma / ✨ efsun) ve nadirlik + kutu şansı etiketiyle birlikte çok daha okunaklı bir kart halinde gösteriliyor. Ayrıca envanterin en üstüne, o an geçerli temel kutu şanslarını (Standart/Nadir/Efsanevi) gösteren bir bilgi şeridi eklendi.",
      "⚔️ Savaş algoritması dengelendi: önceden sadece 'rol statı' (saldıranın saldırısı, savunanın savunması) hesaba katılıyordu. Artık her tarafın diğer statı da (örn. saldıranın savunması, savunanın saldırısı) küçük bir ağırlıkla hesaba katılıyor. Böylece saldırısı düşük ama savunması çok yüksek (yani toplam ekipmanı güçlü) biri saldırıya geçtiğinde eskisi gibi otomatik ezilmiyor, toplam ekipman yatırımı da işin içine giriyor."
    ]
  },
  {
    version: "1.13",
    date: "5 Temmuz 2026",
    items: [
      "🔤 Yeni yazı tipleri: Oyunun geneli artık yuvarlak, kalın ve daha 'oyunsu' bir fontla (Fredoka) yazılıyor; logo ve büyük başlık şeritleri (🐆 Pembe Panterler Battle, sekme başlıkları, öğretici ve yenilikler ekranlarındaki başlıklar) ise daha iddialı, kalın bir font olan Luckiest Guy ile gösteriliyor.",
      "🔊 Gerçek ses efektleri: Genel buton tıklaması, saldırı anı (2 farklı ses arasında rastgele seçiliyor), savaş/Kahin Bahsi/Gizemli Yabancı sonuçlarında kazanma-kaybetme sesleri ve Şanslı Çark'ın dönüş sesi artık sentetik bip yerine gerçek ses kayıtlarıyla çalıyor.",
      "🏆 Haftalık Liderlik Tablosu düzeltmesi: sıfırlama kontrolü önceden sadece oyuna giriş yapıldığında çalışıyordu, bu yüzden uygulama Pazar 00:00'ı açık bir sekmede geçirenlerde hiç tetiklenmiyordu. Artık oyun açıkken de dakikada bir otomatik kontrol ediliyor, hafta döndüğü an puanlar gerçekten sıfırlanıp şampiyon ödülünü kapıyor."
    ]
  },
  {
    version: "1.12",
    date: "5 Temmuz 2026",
    items: [
      "🏆 Haftalık Liderlik Tablosu eklendi: liderlik tablosu artık her Pazar 00:00'da otomatik sıfırlanıyor. O haftayı 1. bitiren oyuncu hurda + garanti bir nadir eşya kazanıyor ve 'haftalık şampiyonluk' sayacı +1 oluyor. Sıfırlama anında kazanan da dahil HERKESİN puanı 0'a dönüyor, yeni hafta sıfırdan başlıyor. Liderlik sekmesinde geçen haftanın şampiyonu ve bir sonraki sıfırlamaya kalan süre gösteriliyor.",
      "🎖️ Rozetler eklendi (İstatistik sekmesi): toplam 44 farklı rozet. Galibiyet sayısı ve serisi, efsanevi eşya koleksiyonu, aynı anda kuşanılan efsanevi eşya sayısı, kutu açma, hurda biriktirme, haftalık şampiyonluk, Kahin Bahsi ('Bahis Baronu'na kadar), Kelle Avcısı ('Cellat'a kadar), Gizemli Yabancı, Şanslı Çark jackpot'u ve koleksiyon tamamlama gibi kategorilerde. Rozetler otomatik hesaplanıyor, ekstra bir işlem gerekmiyor."
    ]
  },
  {
    version: "1.11",
    date: "5 Temmuz 2026",
    items: [
      "🗓️ Haftalık Görevler eklendi (Görev sekmesi): her hafta Pazartesi sıfırlanan, günlük görevlerden belirgin şekilde zor 3 rastgele görev atanıyor (kutu açma, savaşa girme, savaş kazanma, enerji görevi, Kahin Bahsi'ni doğru bilme veya Kelle Avcısı ödülü kapma temelli). Ödüller de zorluğa göre büyütüldü: daha fazla hurda/puan ve şansa bağlı ya da garanti nadir eşya.",
      "📅 Aylık Görevler eklendi (Görev sekmesi): her ay 3 görev atanıyor. Bunlardan biri her zaman sabit ve gerçekten zorlayıcı: 'Bu ay 30 savaş kazan'. Bu görevi tamamlayan TEK ödül olarak garanti bir efsanevi eşya kazanıyor. Diğer iki aylık görev ise büyük miktarda hurda, puan ve garanti nadir eşya veriyor.",
      "🔮 Kahin Bahsi'nde denge güncellemesi: artık kimse kendine bahis oynayamıyor (hedef listesinde kendi ismin görünmüyor) ve tek seferde yatırılabilecek hurda miktarı en fazla 10 hurda ile sınırlandırıldı.",
      "🔊 Ses efektleri (buton tıklaması ve saldırı çınlaması) bu sürümde de değişmeden, sağlam şekilde korunuyor."
    ]
  },
  {
    version: "1.10",
    date: "5 Temmuz 2026",
    items: [
      "🔮 Kahin Bahsi eklendi (Sıra sekmesi): günün sonunda liderlik tablosunun 1.'sinin kim olacağını tahmin edip hurda yatırabilirsin. Günde 1 tahmin hakkın var, doğru bilirsen yatırdığın hurda 2 katına çıkıyor, yanlış bilirsen yatırdığın hurda gidiyor. Sonuç, ertesi gün oyuna giriş yapınca otomatik açıklanıyor.",
      "🔊 Ses efektleri iyileştirildi: genel buton tıklama sesi çok daha yumuşak ve kulak yormayan bir 'tık' sesine çevrildi. Saldırı butonuna basınca artık gerçek bir kılıç çarpışması gibi metalik bir 'çınnn' + vuruş sesi çalıyor."
    ]
  },
  {
    version: "1.9",
    date: "5 Temmuz 2026",
    items: [
      "📊 Kişisel İstatistik sekmesi eklendi: toplam kazanma/kaybetme oranın, en çok yendiğin kişi, en çok yenildiğin kişi ve şimdiye kadarki en uzun kazanma serin artık tek bir ekranda, detaylı bir kariyer karnesi halinde görüntüleniyor.",
      "🎡 Şanslı Çark eklendi (Kutu sekmesi): haftada bir kez tamamen bedava çevirebiliyorsun. Çark küçük hurda veya puan ödülleri veriyor, nadiren de büyük bir 'jackpot' (hem hurda hem puan) çıkabiliyor.",
      "💀 Kelle Avcısı eklendi (Savaş sekmesi): hurdanı harcayarak herhangi bir oyuncunun kellesine ödül koyabilirsin. Bu ödül herkese aynı anda görünür, o kişiyi savaşta İLK yenen oyuncu ödülü kapar ve ilan sıfırlanır.",
      "👑 1.lik Avı eklendi: liderlik tablosunun zirvesindeki oyuncuyu saldırıda yenersen normal kazanç puanının üstüne +8 ekstra bonus puan kazanıyorsun. Zirvedeki isim artık liderlik tablosunda ve saldırı hedef listesinde 👑 rozetiyle işaretleniyor.",
      "🦁🤡 Ana ekrana günlük performans banner'ı eklendi: o gün en çok savaş kazanan oyuncu 'Allahın Aslanı', en çok savaş kaybeden oyuncu ise 'Grubun Sürtüğü' olarak gösteriliyor. Sayaçlar her takvim günü sıfırlanıyor.",
      "Yeni bir güncelleme geldiğinde artık oyuna giriş yapan herkese, o güncellemede neyin değiştiğini sayfa sayfa anlatan otomatik bir 'Yenilikler' tanıtım ekranı gösteriliyor (öğretici ile aynı kaydırmalı yapı, ama sadece o güncellemeye özel)."
    ]
  },
  {
    version: "1.8",
    date: "5 Temmuz 2026",
    items: [
      "Arayüz baştan aşağı gerçek bir sekme (tab) sistemine geçirildi: 📦 Kutu, 🎯 Görev, ⚔️ Savaş, 🏆 Sıra ve 🐆 Profil sekmelerinin her biri artık SADECE kendi içeriğini gösteriyor (örn. Kutu sekmesinde yalnızca kutu açma ve enerji ekranı var, Savaş sekmesinde yalnızca saldırı hedefleri ve savaş geçmişi var, Profil'de yalnızca kuşanım/envanter ve kişisel istatistikler var). Ekranın altına, sekmeler arasında tek dokunuşla geçiş sağlayan sabit bir navigasyon çubuğu eklendi.",
      "Dengeleme — hedef kilitleme sistemi: aynı oyuncuya art arda en fazla 3 kez saldırılabiliyor. Bir hedef 3. saldırıdan sonra kilitleniyor ve kilidin açılması için önce farklı hedeflere en az 3 savaş daha yapman gerekiyor. Bu sayede tek bir oyuncunun sürekli aynı kurbanı seçerek onu bezdirmesi engellendi; hedef listesinde kilitli oyuncular 🔒 rozetiyle ve kalan savaş sayısıyla birlikte gösteriliyor.",
      "Profil sekmesine, ekipmanları panterin üstünde anatomik olarak doğru konumlarda gösteren yeni bir 'karakter sahnesi' eklendi: kask başta, zırh gövdede, kılıç ve eldiven ellerde, ayakkabı ayakta. Bu görsel özetin altında, eşyalara dokunup değiştirebileceğin klasik kuşanım/envanter listesi olduğu gibi duruyor.",
      "Eşyaların nadirliğe göre görsel kimliği güçlendirildi: nadir eşyalarda yumuşak mavi bir parıltı, efsanevi eşyalarda ise sürekli nabız gibi atan altın bir hale animasyonu eklendi. Bu efekt artık kuşanım slotlarında, karakter sahnesinde, envanter listesinde ve kutu açılış popup'ında tutarlı şekilde uygulanıyor.",
      "Savaş Geçmişi yeniden tasarlandı: her kayıtta artık saldıran/savunan isimleri üstte ayrı bir başlık satırında, KAZANDI / SAVUNDU / PAS GEÇTİ / EFSANEVİ ETKİ rozetleriyle birlikte gösteriliyor; renkli flavor-metin altta daha okunaklı bir şekilde yer alıyor.",
      "İlk giriş öğreticisi (tutorial) kullanışlı hale getirildi: adım sayacı eklendi (örn. '3 / 6'), ilk ve son slaytlarda ileri/geri okları otomatik pasifleşiyor, sağ üstteki 'Atla ✕' butonuyla öğretici istenildiğinde anında kapatılabiliyor.",
      "Yenilikler & Yol Haritası ekranı akordeon (aç/kapa) yapısına geçti: en güncel sürüm otomatik açık geliyor ve üstünde 'Yeni' rozetiyle işaretleniyor, eski sürümler tıklanınca açılıp kapanıyor; böylece uzun liste çok daha kolay taranabiliyor.",
      "Her sekmenin üstüne, o bölümün ne işe yaradığını netleştiren şerit tarzı bir başlık (örn. '⚔️ Savaş Arenası', '🏆 Liderlik Tablosu') eklendi; oyunun genel görsel kimliği (pembe panter teması, kalın 3D butonlar, altıgen slotlar) tüm sekmelere tutarlı şekilde yayıldı.",
      "Bir önceki sürümde eklenen ses efektleri (kutu açılışı, saldırı, buton tıklamaları) ve ses aç/kapa düğmesi bu sürümde de korunuyor; yeni sekme geçişleri de aynı geri bildirim sesleriyle çalışıyor."
    ]
  },
  {
    version: "1.7",
    date: "4 Temmuz 2026",
    items: [
      "Saldırı sistemi tamamen senkron hale getirildi: saldırı hakkı artık 'son saldırından bu yana X saat' mantığıyla değil, herkes için birebir aynı, saat başına hizalanmış pencerelerle çalışıyor (örn. 14:00-14:59, 15:00-15:59). O saatlik pencerede saldırmazsan hakkın kaybolur ve bir sonraki saat başına kadar beklersin; kimse geç giriş yaparak hakkını sonraya taşıyamaz. Ayrıca saldırı bekleme süresi 2 saatten 1 saate düşürüldü, yani artık günde çok daha fazla saldırı hakkı var.",
      "Enerji yenilenme hızı 5 dakikada +1'den 3 dakikada +1'e çıkarıldı, enerji dolum süresi kısaldı.",
      "Nadir ve Efsanevi eşya düşme ihtimalleri artırıldı: Nadir %6'dan %9'a, Efsanevi %0.5'ten %3'e yükseltildi. Buna karşılık ekonomik dengeyi korumak için hurda karşılığı garanti kutu maliyetleri de artırıldı: Garanti Nadir 12'den 18 hurdaya, Garanti Efsanevi 35'ten 55 hurdaya çıkarıldı.",
      "Nadir eşyalarda artık her eşya aynı gücü vermiyor: ana stat 8 ile 18 arasında bir üst/alt sınıra göre belirleniyor, ama üst sınırı (en güçlü versiyonu) yakalamak kasıtlı olarak zor tutuldu (~%20 ihtimal). Geri kalan zamanlarda daha düşük ama yine de kullanılabilir bir değer düşüyor, böylece aynı isimli nadir eşyayı tekrar açmak hep bir sürpriz taşıyor.",
      "Oyuncular artık birbirinin o an kuşanılı olan eşyalarını görebiliyor: Liderlik Tablosu'nda kendi dışındaki bir oyuncunun satırına dokunmak, o oyuncunun 5 slotuna ne taktığını (isim + güç değerleri) salt okunur şekilde gösteren bir ekran açıyor.",
      "Enerji görev kartlarından ikisinin ismi değiştirildi: 'Kafa Ütüle' → 'Hafız Döv', 'Tam Manipülasyon' → 'Umumi Mastürbasyon'. (Sadece isim değişikliği, maliyet/ödül aynı kaldı.)",
      "Not: Günlük görevler ve seri (streak) bonusu zaten takvim gününe göre (gece 00:00'dan bir sonraki gece 00:00'a kadar) çalışıyordu; kimin ne zaman giriş yaptığına bakılmaksızın herkes için aynı gün sınırı geçerli, bu davranış bu sürümde de korundu."
    ]
  },
  {
    version: "1.6",
    date: "4 Temmuz 2026",
    items: [
      "Enerji Harca butonu kaldırıldı: yerine 'Gasp Et', 'Arkadaşını Zorbala', 'Kafa Ütüle' ve 'Tam Manipülasyon' gibi isimli görev kartları geldi. Görev ne kadar zor (enerji maliyeti yüksek) ise hurda ödülü de o kadar iyi, ama enerjinin 100 ile sınırlı olması sayesinde ekonomi dengede kalıyor.",
      "Günlük Görevler sistemi eklendi: her gün herkese 1'i her zaman 'giriş yap' olmak üzere 3 rastgele görev atanıyor (kutu aç, savaşa gir, savaş kazan, belirli bir oyuncuyu yen, enerji görevi yap gibi). Görevler zorluğuna göre (kolay/orta/zor) hurda, puan ve zor görevlerde garanti nadir eşya ödülü veriyor."
    ]
  },
  {
    version: "1.5",
    date: "4 Temmuz 2026",
    items: [
      "Enerji sistemi eklendi: kutu ve savaş beklerken harcanabilen, otomatik dolan ayrı bir kaynak. Enerji harcayarak anında hurda kazanılabiliyor.",
      "Saldırı cooldown'u günde 1'den 2 saatte 1'e düşürüldü."
    ]
  },
  {
    version: "1.4",
    date: "4 Temmuz 2026",
    items: [
      "Envanter sistemi: eşyalar artık otomatik kuşanılmıyor. Slot boşsa yeni eşya otomatik kuşanılır, doluysa envantere eklenir ve istediğin eşyayi seçip kuşanabilir veya hurdaya çevirebilirsin.",
      "Savaş algoritması yeniden dengelendi: güç farkının belirleyiciliği artırıldı, büyük bir stat üstünlüğü artık şansa bakılmaksızın kazandırıyor.",
      "Günün Olayı sistemi eklendi: her gün tüm oyuncuları aynı anda etkileyen rastgele bir buff, nerf ya da nötr etki devreye giriyor.",
      "Gizemli Yabancı eklendi: günde belirli bir ihtimalle karşına çıkan, kaybetsen bile risk taşımayan bonus düello.",
      "Güvenlik: hesap girişine 4 haneli PIN zorunluluğu getirildi, başkasının hesabına yanlışlıkla girilmesi engellendi."
    ]
  },
  {
    version: "1.3",
    date: "3 Temmuz 2026",
    items: [
      "Puanlama dengesi güncellendi: saldırıp kaybetmenin bedeli 5 puandan 3 puana düşürüldü, savunmada kazanma ödülü 5 puan olarak sabitlendi.",
      "Eşya Koleksiyon Kitabı eklendi: keşfedilen ve keşfedilmeyen tüm eşyalar tek ekranda takip edilebiliyor.",
      "Savaş kayıtlarına duruma özel (kazanma / kaybetme / aynı hedefe tekrar saldırma) çeşitlendirilmiş mesajlar eklendi."
    ]
  },
  {
    version: "1.2",
    date: "3 Temmuz 2026",
    items: [
      "Kutu açma süresi günde 1'den 4 saatte 1'e düşürüldü, buna karşılık nadir ve efsanevi eşya oranları belirgin şekilde azaltıldı.",
      "Pity sistemi eklendi: uzun süre şanssız kalan oyuncuların olasılığı kademeli olarak artırılıyor.",
      "Günlük seri (streak) bonusu eklendi.",
      "Hurda ekonomisi ve garantili kutu satın alma seçeneği eklendi.",
      "Eşit dağılım sistemi eklendi: aynı eşya türünün art arda düşmesi engellendi.",
      "Kutu açma animasyonları nadirliğe göre zenginleştirildi."
    ]
  },
  {
    version: "1.1",
    date: "3 Temmuz 2026",
    items: [
      "Oyun adı Pembe Panterler Battle olarak güncellendi.",
      "Tanıtım ekranı, oyunun sistemlerini adım adım anlatan bir slayt akışına dönüştürüldü."
    ]
  },
  {
    version: "1.0",
    date: "3 Temmuz 2026",
    items: [
      "İlk sürüm: kutu açma, kuşanım, savaş, liderlik tablosu ve savaş geçmişi sistemleriyle yayına alındı."
    ]
  }
];

export const ROADMAP = [
  "Rövanş hakkı: kaybedilen bir savaşın ardından, günlük cooldown'dan bağımsız bir intikam saldırısı hakkı.",
  "Dengeli hedef seçimi: sıralamada yakın oyunculara saldırıyı teşvik eden bir kısıtlama.",
  "Rozet ve unvan sistemi: oyun içi başarımların profilde gösterilmesi.",
  "Haftalık/aylık sezonlar ve geçmiş şampiyonların tutulduğu bir arşiv.",
  "Anlık bildirimler: efsanevi eşya bulunduğunda veya saldırı anında ekran bildirimi.",
  "Karakter avatarı seçimi.",
  "Ses efektleri.",
  "Confetti efekti.",
  "Sunucu Boss'u: haftalık ortak raid etkinliği."
];

export function renderUpdatesList() {
  const releasesHtml = RELEASES.map((r, i) => `
    <div class="release-block ${i === 0 ? "open" : ""}">
      <button type="button" class="release-header" data-idx="${i}">
        <span class="release-version">v${r.version}</span>
        <span class="release-date">${r.date}</span>
        ${i === 0 ? `<span class="update-badge done">Yeni</span>` : ""}
        <span class="release-chevron">⌄</span>
      </button>
      <ul class="release-items">${r.items.map(t => `<li>${t}</li>`).join("")}</ul>
    </div>
  `).join("");

  const roadmapHtml = `
    <div class="roadmap-block">
      <div class="roadmap-header">🔮 Yol Haritası</div>
      <ul class="release-items roadmap-items">${ROADMAP.map(t => `<li>${t}</li>`).join("")}</ul>
    </div>`;

  updatesList.innerHTML = releasesHtml + roadmapHtml;

  updatesList.querySelectorAll(".release-header").forEach(btn => {
    btn.onclick = () => btn.closest(".release-block").classList.toggle("open");
  });
}

export function refreshUpdatesDot() {
  const seen = localStorage.getItem("gacha_last_seen_update");
  updatesDot.classList.toggle("hidden", seen === LATEST_UPDATE_VERSION);
}

updatesBtn.onclick = () => {
  renderUpdatesList();
  updatesModal.classList.remove("hidden");
  localStorage.setItem("gacha_last_seen_update", LATEST_UPDATE_VERSION);
  refreshUpdatesDot();
};
closeUpdatesBtn.onclick = () => updatesModal.classList.add("hidden");

refreshUpdatesDot();

