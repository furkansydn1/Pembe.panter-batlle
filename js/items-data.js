// ============================================================
// EŞYA VERİLERİ
// ============================================================
export const SLOTS = [
  { key: "kask", label: "Kask", icon: "⛑️", type: "def" },
  { key: "zirh", label: "Zırh", icon: "🛡️", type: "def" },
  { key: "kalkan", label: "Kalkan", icon: "🔰", type: "def" },
  { key: "kilic", label: "Kılıç", icon: "🗡️", type: "atk" },
  { key: "eldiven", label: "Eldiven", icon: "🧤", type: "atk" },
  { key: "kupe", label: "Küpe", icon: "💎", type: "atk" },
  { key: "kolye", label: "Kolye", icon: "📿", type: "atk" },
  { key: "ayakkabi", label: "Ayakkabı", icon: "👢", type: "def" },
  // V2 Faz 2: anahtar bilerek "ring" — styles.css'teki .char-slot.slot-pos-ring
  // (paper-doll üzerindeki hazır ama dekoratif/tıklanamaz yer tutucu) bu isimle
  // eşleşiyor. type "atk" seçildi (5 atk / 4 def slotu); dengeleme kararı
  // olarak "def"e çevirmek istersen tek satır.
  { key: "ring", label: "Yüzük", icon: "💍", type: "atk" }
];
export const SLOT_MAP = Object.fromEntries(SLOTS.map(s => [s.key, s]));

// ============================================================
// EKİPMAN SVG İKONLARI (YENİ GÖRÜNÜŞLER)
// Her slot için 3 ayrı nadirlik seviyesinde tamamen farklı çizilmiş SVG
// içerikleri. Standart eşyalar sade/eskimiş görünür, nadir eşyalar mavi
// (--item-nadir) çelik/gümüş temalı, efsanevi eşyalar ise altın
// (--item-efsanevi) rengiyle sürekli parlayan/süzülen/dönen özel efektler
// taşır. Bu üçü ASLA karışmaz: her eşya sadece kendi rarity'sine ait
// çizimi kullanır.
// ============================================================
export const ITEM_ICON_SVG_PARTS = {
  kilic: {
    standart: `
      <g transform="rotate(45, 50, 50)">
        <path d="M 46 25 L 50 20 L 54 25 L 53 65 L 47 65 Z" fill="#475569" />
        <path d="M 46 25 L 50 20 L 50 65 L 47 65 Z" fill="#64748b" />
        <circle cx="53" cy="40" r="1.5" fill="#1e293b"/>
        <rect x="44" y="65" width="12" height="4" fill="#334155" />
        <rect x="47" y="69" width="6" height="15" fill="#5c4033" />
      </g>`,
    nadir: `
      <g transform="rotate(45, 50, 50)">
        <path d="M 47 10 L 50 2 L 53 10 L 53 65 L 47 65 Z" fill="#e2e8f0" />
        <path d="M 47 10 L 50 2 L 50 65 L 47 65 Z" fill="#ffffff" opacity="0.6"/>
        <line x1="50" y1="15" x2="50" y2="60" stroke="#94a3b8" stroke-width="1.5"/>
        <path d="M 25 65 Q 50 70 75 65 L 75 70 Q 50 75 25 70 Z" fill="#1e293b" stroke="var(--item-nadir)" stroke-width="1.5"/>
        <circle cx="50" cy="68.5" r="4" fill="var(--item-nadir)" />
        <rect x="46" y="72" width="8" height="18" fill="#334155" />
        <line x1="46" y1="75" x2="54" y2="78" stroke="var(--item-nadir)" stroke-width="1.5"/>
        <line x1="46" y1="81" x2="54" y2="84" stroke="var(--item-nadir)" stroke-width="1.5"/>
        <polygon points="45,90 55,90 50,98" fill="#94a3b8" />
      </g>`,
    efsanevi: `
      <g transform="rotate(45, 50, 50)">
        <ellipse cx="50" cy="50" rx="40" ry="10" fill="none" stroke="var(--item-efsanevi)" stroke-width="1" class="fx-energy" />
        <path d="M 49 0 L 51 0 L 51 70 L 49 70 Z" fill="#fff" class="fx-pulse" />
        <polygon points="40,15 47,5 47,30 40,35" fill="var(--item-efsanevi)" class="fx-float" />
        <polygon points="60,15 53,5 53,30 60,35" fill="var(--item-efsanevi)" class="fx-float" style="animation-delay:-2s;" />
        <polygon points="42,40 48,35 48,60 42,55" fill="var(--item-efsanevi)" class="fx-float" style="animation-delay:-1s;" />
        <polygon points="58,40 52,35 52,60 58,55" fill="var(--item-efsanevi)" class="fx-float" style="animation-delay:-3s;" />
        <path d="M 15 65 Q 50 45 85 65 L 80 75 Q 50 65 20 75 Z" fill="var(--item-efsanevi)" />
        <circle cx="50" cy="65" r="8" fill="#fff" class="fx-pulse" />
        <rect x="46" y="70" width="8" height="20" fill="#0f172a" />
        <polygon points="40,90 60,90 50,105" fill="var(--item-efsanevi)" />
      </g>`
  },
  kalkan: {
    standart: `
      <circle cx="50" cy="50" r="35" fill="#5c4033" />
      <line x1="30" y1="20" x2="30" y2="80" stroke="#3e2b22" stroke-width="2"/>
      <line x1="50" y1="15" x2="50" y2="85" stroke="#3e2b22" stroke-width="2"/>
      <line x1="70" y1="20" x2="70" y2="80" stroke="#3e2b22" stroke-width="2"/>
      <circle cx="50" cy="50" r="35" fill="none" stroke="#475569" stroke-width="5" stroke-dasharray="20 5" />
      <circle cx="50" cy="50" r="8" fill="#64748b" />`,
    nadir: `
      <path d="M 20 15 L 80 15 L 85 45 Q 85 90 50 95 Q 15 90 15 45 Z" fill="#94a3b8" />
      <path d="M 25 20 L 75 20 L 80 45 Q 80 85 50 90 Q 20 85 20 45 Z" fill="#64748b" />
      <rect x="45" y="25" width="10" height="60" fill="var(--item-nadir)" />
      <rect x="30" y="40" width="40" height="10" fill="var(--item-nadir)" />
      <path d="M 20 15 L 80 15 L 85 45 Q 85 90 50 95 Q 15 90 15 45 Z" fill="none" stroke="#e2e8f0" stroke-width="4" />
      <circle cx="30" cy="25" r="2" fill="#fff" />
      <circle cx="70" cy="25" r="2" fill="#fff" />`,
    efsanevi: `
      <circle cx="50" cy="50" r="45" fill="none" stroke="var(--item-efsanevi)" stroke-width="2" stroke-dasharray="15 10" class="fx-spin" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="var(--item-efsanevi)" stroke-width="1" stroke-dasharray="5 5" class="fx-spin" style="animation-direction:reverse;animation-duration:4s;" />
      <polygon points="50,10 90,30 90,70 50,90 10,70 10,30" fill="var(--item-efsanevi)" opacity="0.2" class="fx-pulse" />
      <polygon points="50,15 80,30 80,65 50,85 20,65 20,30" fill="none" stroke="var(--item-efsanevi)" stroke-width="4" class="fx-float" />
      <polygon points="50,30 55,45 70,50 55,55 50,70 45,55 30,50 45,45" fill="#fff" class="fx-pulse" />
      <circle cx="50" cy="50" r="5" fill="var(--item-efsanevi)" />`
  },
  zirh: {
    standart: `
      <path d="M 30 20 C 40 10, 60 10, 70 20 L 75 45 C 75 75, 65 90, 50 95 C 35 90, 25 75, 25 45 Z" fill="#78350f" />
      <rect x="35" y="40" width="15" height="15" fill="#5c2b0c" transform="rotate(15, 42, 47)" />
      <line x1="35" y1="40" x2="50" y2="55" stroke="#000" stroke-width="1" transform="rotate(15, 42, 47)"/>
      <rect x="55" y="65" width="12" height="12" fill="#451a03" transform="rotate(-10, 61, 71)" />
      <path d="M 50 25 L 50 90" fill="none" stroke="#451a03" stroke-width="3" stroke-dasharray="4 2" />`,
    nadir: `
      <path d="M 15 35 C 15 15, 40 15, 45 25 L 25 45 Z" fill="var(--item-nadir)" />
      <path d="M 85 35 C 85 15, 60 15, 55 25 L 75 45 Z" fill="var(--item-nadir)" />
      <path d="M 30 20 C 40 25, 60 25, 70 20 L 80 45 C 80 75, 65 95, 50 95 C 35 95, 20 75, 20 45 Z" fill="#94a3b8" />
      <path d="M 50 22 L 75 45 C 75 75, 65 90, 50 90 Z" fill="#ffffff" opacity="0.2" />
      <path d="M 35 60 Q 50 65 65 60" fill="none" stroke="#64748b" stroke-width="3" />
      <path d="M 38 75 Q 50 80 62 75" fill="none" stroke="#64748b" stroke-width="3" />
      <polygon points="50,30 60,40 50,55 40,40" fill="#e2e8f0" />
      <polygon points="50,35 55,40 50,48 45,40" fill="var(--item-nadir)" />`,
    efsanevi: `
      <path d="M 20 20 L 80 20 L 90 90 L 10 90 Z" fill="var(--item-efsanevi)" opacity="0.3" class="fx-pulse" />
      <path d="M 5 35 C -5 -5, 50 0, 45 20 L 25 45 Z" fill="none" stroke="var(--item-efsanevi)" stroke-width="4" class="fx-float" />
      <path d="M 95 35 C 105 -5, 50 0, 55 20 L 75 45 Z" fill="none" stroke="var(--item-efsanevi)" stroke-width="4" class="fx-float" style="animation-delay:-2s;" />
      <path d="M 25 25 C 40 30, 60 30, 75 25 L 85 50 C 85 85, 65 100, 50 100 C 35 100, 15 85, 15 50 Z" fill="#0f172a" stroke="var(--item-efsanevi)" stroke-width="3" />
      <circle cx="50" cy="45" r="15" fill="#000" stroke="var(--item-efsanevi)" stroke-width="3" />
      <circle cx="50" cy="45" r="8" fill="#fff" class="fx-pulse" />
      <path d="M 50 60 L 50 95" stroke="var(--item-efsanevi)" stroke-width="4" class="fx-pulse" />
      <path d="M 35 70 L 50 80 L 65 70" fill="none" stroke="var(--item-efsanevi)" stroke-width="2" class="fx-pulse" />`
  },
  kask: {
    standart: `
      <path d="M 20 60 C 20 10, 80 10, 80 60 L 80 70 C 65 75, 35 75, 20 70 Z" fill="#64748b" />
      <rect x="45" y="60" width="10" height="25" fill="#475569" />
      <circle cx="30" cy="60" r="2" fill="#1e293b"/>
      <circle cx="70" cy="60" r="2" fill="#1e293b"/>`,
    nadir: `
      <path d="M 50 25 C 60 5, 85 10, 80 35 C 75 25, 60 25, 50 25 Z" fill="var(--item-nadir)" />
      <path d="M 20 50 C 20 10, 80 10, 80 50 L 80 80 C 60 90, 40 90, 20 80 Z" fill="#94a3b8" />
      <path d="M 15 45 C 40 60, 60 60, 85 45 L 80 75 C 60 85, 40 85, 20 75 Z" fill="#cbd5e1" stroke="#475569" stroke-width="2" />
      <polygon points="25,52 45,58 45,63 25,58" fill="#0f172a" />
      <polygon points="75,52 55,58 55,63 75,58" fill="#0f172a" />`,
    efsanevi: `
      <path d="M 50 30 C 70 -10, 100 20, 60 50 Z" fill="var(--item-efsanevi)" opacity="0.6" class="fx-pulse" />
      <path d="M 50 30 C 30 -10, 0 20, 40 50 Z" fill="var(--item-efsanevi)" opacity="0.6" class="fx-pulse" style="animation-delay:-1s;" />
      <path d="M 25 50 C 25 20, 75 20, 75 50 L 70 85 C 60 90, 40 90, 30 85 Z" fill="#0f172a" stroke="var(--item-efsanevi)" stroke-width="2" />
      <path d="M 30 55 L 45 62 L 35 65 Z" fill="#fff" />
      <path d="M 70 55 L 55 62 L 65 65 Z" fill="#fff" />
      <polygon points="50,15 60,35 40,35" fill="var(--item-efsanevi)" class="fx-float" />
      <path d="M 10 40 Q -5 10 30 25" fill="none" stroke="var(--item-efsanevi)" stroke-width="4" stroke-linecap="round" class="fx-float" style="animation-delay:-1s;" />
      <path d="M 90 40 Q 105 10 70 25" fill="none" stroke="var(--item-efsanevi)" stroke-width="4" stroke-linecap="round" class="fx-float" style="animation-delay:-2s;" />`
  },
  kolye: {
    standart: `
      <path d="M 20 20 C 20 70, 80 70, 80 20" fill="none" stroke="#78350f" stroke-width="3" />
      <polygon points="50,65 58,75 50,85 42,75" fill="#64748b" />`,
    nadir: `
      <path d="M 20 20 C 20 70, 80 70, 80 20" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 2" />
      <polygon points="50,60 62,75 50,95 38,75" fill="var(--item-nadir)" />
      <polygon points="50,60 56,75 50,85 44,75" fill="#fff" opacity="0.4" />`,
    efsanevi: `
      <path d="M 20 10 C 30 50, 45 60, 50 65" fill="none" stroke="var(--item-efsanevi)" stroke-width="1.5" stroke-dasharray="5 5" class="fx-pulse" />
      <path d="M 80 10 C 70 50, 55 60, 50 65" fill="none" stroke="var(--item-efsanevi)" stroke-width="1.5" stroke-dasharray="5 5" class="fx-pulse" />
      <g class="fx-float">
        <polygon points="50,55 65,75 50,95 35,75" fill="#fff" />
        <ellipse cx="50" cy="75" rx="25" ry="5" fill="none" stroke="var(--item-efsanevi)" stroke-width="2" class="fx-spin" />
        <circle cx="25" cy="75" r="3" fill="var(--item-efsanevi)" class="fx-pulse" />
        <circle cx="75" cy="75" r="3" fill="var(--item-efsanevi)" class="fx-pulse" style="animation-delay:-1s;"/>
      </g>`
  },
  kupe: {
    standart: `
      <circle cx="50" cy="40" r="15" fill="none" stroke="#64748b" stroke-width="4" />
      <line x1="50" y1="25" x2="50" y2="15" stroke="#64748b" stroke-width="2" />`,
    nadir: `
      <circle cx="50" cy="25" r="8" fill="none" stroke="#cbd5e1" stroke-width="2" />
      <path d="M 50 33 L 50 45" stroke="#cbd5e1" stroke-width="2" />
      <path d="M 50 45 C 60 55, 60 75, 50 85 C 40 75, 40 55, 50 45 Z" fill="var(--item-nadir)" />
      <path d="M 50 50 C 55 60, 55 70, 50 80 Z" fill="#fff" opacity="0.4" />`,
    efsanevi: `
      <circle cx="50" cy="20" r="5" fill="none" stroke="var(--item-efsanevi)" stroke-width="2" />
      <line x1="50" y1="25" x2="50" y2="90" stroke="var(--item-efsanevi)" stroke-width="1" stroke-dasharray="10 5" class="fx-pulse" />
      <g class="fx-float">
        <polygon points="50,40 70,70 30,70" fill="none" stroke="var(--item-efsanevi)" stroke-width="3" />
        <polygon points="50,80 70,50 30,50" fill="none" stroke="var(--item-efsanevi)" stroke-width="3" />
        <circle cx="50" cy="60" r="8" fill="#fff" class="fx-pulse" />
      </g>`
  },
  eldiven: {
    standart: `
      <path d="M 30 40 L 70 40 L 75 90 C 75 95, 25 95, 25 90 Z" fill="#78350f" />
      <rect x="30" y="25" width="10" height="15" fill="#78350f" rx="3" />
      <rect x="45" y="20" width="10" height="20" fill="#78350f" rx="3" />
      <rect x="60" y="25" width="10" height="15" fill="#78350f" rx="3" />
      <line x1="40" y1="60" x2="60" y2="70" stroke="#451a03" stroke-width="2" />
      <line x1="35" y1="70" x2="50" y2="80" stroke="#451a03" stroke-width="2" />`,
    nadir: `
      <path d="M 25 50 L 75 50 L 80 95 L 20 95 Z" fill="#94a3b8" />
      <path d="M 23 65 L 77 65" stroke="#64748b" stroke-width="3" />
      <path d="M 21 80 L 79 80" stroke="#64748b" stroke-width="3" />
      <path d="M 30 15 L 40 15 L 42 50 L 28 50 Z" fill="#cbd5e1" />
      <path d="M 45 10 L 55 10 L 57 50 L 43 50 Z" fill="#cbd5e1" />
      <path d="M 60 15 L 70 15 L 72 50 L 58 50 Z" fill="#cbd5e1" />
      <circle cx="35" cy="45" r="4" fill="var(--item-nadir)" />
      <circle cx="50" cy="45" r="4" fill="var(--item-nadir)" />
      <circle cx="65" cy="45" r="4" fill="var(--item-nadir)" />`,
    efsanevi: `
      <path d="M 20 50 L 80 50 L 90 100 L 10 100 Z" fill="#0f172a" stroke="var(--item-efsanevi)" stroke-width="2" />
      <path d="M 35 45 L 25 5 L 45 45 Z" fill="var(--item-efsanevi)" class="fx-pulse" />
      <path d="M 50 45 L 50 0 L 55 45 Z" fill="var(--item-efsanevi)" class="fx-pulse" style="animation-delay:-1s;" />
      <path d="M 65 45 L 75 5 L 55 45 Z" fill="var(--item-efsanevi)" class="fx-pulse" style="animation-delay:-2s;" />
      <g class="fx-float">
        <circle cx="50" cy="75" r="15" fill="none" stroke="var(--item-efsanevi)" stroke-width="3" />
        <polygon points="50,60 65,82 35,82" fill="none" stroke="var(--item-efsanevi)" stroke-width="2" />
        <circle cx="50" cy="75" r="4" fill="#fff" />
      </g>`
  },
  ayakkabi: {
    standart: `
      <path d="M 35 20 L 65 20 L 70 60 L 85 85 L 25 85 L 30 60 Z" fill="#5c4033" />
      <path d="M 20 85 L 90 85 L 90 95 L 20 95 Z" fill="#3e2b22" />
      <line x1="35" y1="40" x2="65" y2="40" stroke="#3e2b22" stroke-width="2" />
      <line x1="32" y1="60" x2="68" y2="60" stroke="#3e2b22" stroke-width="2" />`,
    nadir: `
      <path d="M 35 15 L 65 15 L 70 65 L 30 65 Z" fill="#cbd5e1" />
      <path d="M 45 15 L 55 15 L 55 65 L 45 65 Z" fill="var(--item-nadir)" opacity="0.8" />
      <path d="M 30 65 L 70 65 L 85 90 L 15 90 Z" fill="#94a3b8" />
      <path d="M 10 90 L 90 90 L 90 98 L 10 98 Z" fill="#64748b" />
      <circle cx="50" cy="75" r="4" fill="#fff" />`,
    efsanevi: `
      <path d="M 35 40 Q 5 20 0 60 Q 15 65 30 65 Z" fill="var(--item-efsanevi)" opacity="0.8" class="fx-pulse" />
      <path d="M 65 40 Q 95 20 100 60 Q 85 65 70 65 Z" fill="var(--item-efsanevi)" opacity="0.8" class="fx-pulse" style="animation-delay:-1s;" />
      <path d="M 30 20 L 70 20 L 75 60 L 25 60 Z" fill="#0f172a" stroke="var(--item-efsanevi)" stroke-width="2" class="fx-float" />
      <polygon points="20,70 80,70 90,90 10,90" fill="none" stroke="var(--item-efsanevi)" stroke-width="3" class="fx-float" style="animation-delay:-0.5s;" />
      <path d="M 20 95 L 80 95 L 50 108 Z" fill="#fff" class="fx-pulse" />`
  },
  ring: {
    standart: `
      <circle cx="50" cy="58" r="22" fill="none" stroke="#78716c" stroke-width="7" />
      <rect x="43" y="30" width="14" height="10" fill="#94a3b8" rx="1" />`,
    nadir: `
      <circle cx="50" cy="58" r="22" fill="none" stroke="var(--item-nadir)" stroke-width="6" />
      <circle cx="50" cy="58" r="22" fill="none" stroke="#fff" stroke-width="1" opacity="0.5" />
      <polygon points="50,26 58,38 42,38" fill="#cbd5e1" />
      <circle cx="50" cy="34" r="5" fill="var(--item-nadir)" />`,
    efsanevi: `
      <circle cx="50" cy="58" r="22" fill="none" stroke="var(--item-efsanevi)" stroke-width="6" class="fx-pulse" />
      <circle cx="50" cy="58" r="22" fill="none" stroke="#fff" stroke-width="1" opacity="0.6" />
      <g class="fx-float">
        <polygon points="50,20 62,36 38,36" fill="var(--item-efsanevi)" />
        <circle cx="50" cy="30" r="6" fill="#fff" />
      </g>`
  }
};

// Verilen slot + nadirlik için hazır SVG ikon markup'ı üretir. size piksel
// cinsinden genişlik/yükseklik. Bilinmeyen slot/rarity kombinasyonunda
// (olmamalı ama önlem olsun) boş bir kalkan taşı gösterilir.
export function itemIconSvg(slot, rarity, size = 32) {
  const parts = (ITEM_ICON_SVG_PARTS[slot] && ITEM_ICON_SVG_PARTS[slot][rarity]) || "";
  return `<svg class="item-svg-icon" viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${parts}</svg>`;
}

export const STANDARD_NAMES = {
  kask: ["Başlık", "Kapüşon", "Düz Kask", "Açık Kask", "Deri Kask"],
  zirh: ["Keten Zırh", "Deri Zırh", "Basit Zırh", "Yıpranmış Zırh", "Hafif Zırh"],
  kilic: ["Demir Kılıç", "Çelik Kılıç", "Keskin Kılıç", "Kısa Kılıç", "Ağır Kılıç"],
  eldiven: ["Keten Eldiven", "Deri Eldiven", "Basit Eldiven", "İş Eldiveni", "Pamuk Eldiven"],
  ayakkabi: ["Yürüyüş Ayakkabısı", "Deri Ayakkabı", "Kumaş Ayakkabı", "Basit Ayakkabı", "Hızlı Ayakkabı"],
  kalkan: ["Tahta Kalkan", "Küçük Kalkan", "Düz Kalkan", "Yuvarlak Kalkan", "Sağlam Kalkan"],
  kupe: ["Bakır Küpe", "Halka Küpe", "Küçük Küpe", "Sade Küpe", "İnce Küpe"],
  kolye: ["İp Kolye", "Taş Kolye", "Boncuk Kolye", "Gümüş Kolye", "Düz Kolye"],
  ring: ["Demir Yüzük", "Halka Yüzük", "Sade Yüzük", "İnce Yüzük", "Taşlı Yüzük"]
};
export const RARE_NAMES = {
  kask: ["Vizörlü Kask", "Miğfer", "Çelik Kask", "Yüz Siperi", "Koruma Kaskı"],
  zirh: ["Zincir Zırh", "Pullu Zırh", "Sert Zırh", "Güçlü Zırh", "Asker Zırhı"],
  kilic: ["Bronz Kılıç", "Gümüş Kılıç", "İnce Kılıç", "Parlak Kılıç", "Avcı Kılıcı"],
  eldiven: ["Çelik Eldiven", "Zincir Eldiven", "Koruma Eldiveni", "Sert Eldiven", "Savaş Eldiveni"],
  // PDF'te 5. isim tek başına "Bot" idi; taban isim olarak kullanıldı, 5.'ye "Savaş Botu" verildi.
  ayakkabi: ["Çevik Bot", "Hızlı Bot", "Sert Bot", "Tabanlı Bot", "Savaş Botu"],
  kalkan: ["Demir Kalkan", "Kenarlı Kalkan", "İşlemeli Kalkan", "Hafif Kalkan", "Asker Kalkanı"],
  kupe: ["Gümüş Küpe", "Kristal Küpe", "Ay Küpesi", "Yıldız Küpesi", "Oyma Küpe"],
  kolye: ["Altın Kolye", "Safir Kolye", "Yakut Kolye", "İşlemeli Kolye", "Zincir Kolye"],
  // PDF'te "Taşlı" hem Sıradan hem Nadir'de vardı; çakışmayı önlemek için Nadir "Mücevherli Yüzük" yapıldı.
  ring: ["Altın Yüzük", "Gümüş Yüzük", "İşlemeli Yüzük", "Parlak Yüzük", "Mücevherli Yüzük"]
};

// Efsanevi eşyalar - V3 GÜNCELLEMESİ: eskiden her efsanevi eşyanın SABİT ve
// GARANTİ bir savaş etkisi (effect/desc) vardı — bu sistem kaldırıldı. Yerine
// item-systems.js'teki EFSANEVI_TRAIT_POOL geldi: %30 ihtimalle (garanti
// DEĞİL), yeni oyun yapısına (MAP/EXP/Hurda/Altın dahil) uygun bir pasif
// kazanabiliyor artık. atk/def alanları zaten tarihsel referanstı (gerçek
// statlar rollTierStat() ile RNG üretiliyor), effect/desc de aynı şekilde
// tarihsel referans olarak kaldırıldı — isim/slot havuzu olarak kullanılmaya
// devam ediyor.
export const LEGENDARY_ITEMS = [
  // ---- Kılıç (atk) ----
  { name: "Ruh Kılıcı", slot: "kilic", atk: 25, def: 4 },
  { name: "Yemin Kılıcı", slot: "kilic", atk: 25, def: 4 },
  { name: "Güneş Kılıcı", slot: "kilic", atk: 25, def: 4 },
  { name: "Ay Kılıcı", slot: "kilic", atk: 25, def: 4 },
  { name: "Fırtına Kılıcı", slot: "kilic", atk: 25, def: 4 },

  // ---- Kalkan (def) ----
  { name: "Şövalye Kalkanı", slot: "kalkan", atk: 4, def: 25 },
  { name: "Kale Kalkanı", slot: "kalkan", atk: 4, def: 25 },
  { name: "Muhafız Kalkanı", slot: "kalkan", atk: 4, def: 25 },
  { name: "Dev Kalkanı", slot: "kalkan", atk: 4, def: 25 },
  { name: "Ejder Kalkanı", slot: "kalkan", atk: 4, def: 25 },

  // ---- Zırh (def) ----
  { name: "Kraliyet Zırhı", slot: "zirh", atk: 4, def: 25 },
  { name: "Asil Zırh", slot: "zirh", atk: 4, def: 25 },
  { name: "Parlak Zırh", slot: "zirh", atk: 4, def: 25 },
  { name: "Şanlı Zırh", slot: "zirh", atk: 4, def: 25 },
  { name: "Kadim Zırh", slot: "zirh", atk: 4, def: 25 },

  // ---- Kolye (atk) ----
  { name: "Bilge Kolyesi", slot: "kolye", atk: 25, def: 4 },
  { name: "Yıldız Kolyesi", slot: "kolye", atk: 25, def: 4 },
  { name: "Güç Kolyesi", slot: "kolye", atk: 25, def: 4 },
  { name: "Hayat Kolyesi", slot: "kolye", atk: 25, def: 4 },
  { name: "Ruh Kolyesi", slot: "kolye", atk: 25, def: 4 },

  // ---- Küpe (atk) ----
  { name: "Fısıltı Küpesi", slot: "kupe", atk: 25, def: 4 },
  { name: "Yankı Küpesi", slot: "kupe", atk: 25, def: 4 },
  { name: "Ses Küpesi", slot: "kupe", atk: 25, def: 4 },
  { name: "Rüzgar Küpesi", slot: "kupe", atk: 25, def: 4 },
  { name: "Ezgi Küpesi", slot: "kupe", atk: 25, def: 4 },

  // ---- Ayakkabı (def) — tier ilerlemesi: Ayakkabı → Bot → Çizme ----
  { name: "Rüzgar Çizmesi", slot: "ayakkabi", atk: 4, def: 25 },
  { name: "Gökyüzü Çizmesi", slot: "ayakkabi", atk: 4, def: 25 },
  { name: "Hafif Çizme", slot: "ayakkabi", atk: 4, def: 25 },
  { name: "Koşu Çizmesi", slot: "ayakkabi", atk: 4, def: 25 },
  { name: "Hız Çizmesi", slot: "ayakkabi", atk: 4, def: 25 },

  // ---- Eldiven (atk) — PDF'teki tek kelimelik "El", "Ulu El Eldiveni" olarak uyarlandı ----
  { name: "Usta Eldiveni", slot: "eldiven", atk: 25, def: 4 },
  { name: "Güç Eldiveni", slot: "eldiven", atk: 25, def: 4 },
  { name: "Kavrama Eldiveni", slot: "eldiven", atk: 25, def: 4 },
  { name: "Dokunuş Eldiveni", slot: "eldiven", atk: 25, def: 4 },
  { name: "Ulu El Eldiveni", slot: "eldiven", atk: 25, def: 4 },

  // ---- Yüzük (atk) ----
  { name: "Kader Yüzüğü", slot: "ring", atk: 25, def: 4 },
  { name: "Yemin Yüzüğü", slot: "ring", atk: 25, def: 4 },
  { name: "Güç Yüzüğü", slot: "ring", atk: 25, def: 4 },
  { name: "Aşk Yüzüğü", slot: "ring", atk: 25, def: 4 },
  { name: "Ruh Yüzüğü", slot: "ring", atk: 25, def: 4 },

  // ---- Kask (def) — PDF'teki "Tac/Şeref/Bilgelik/Görkem/Miğfer" taç-miğfer temasıyla adlandırıldı ----
  { name: "Yüce Taç", slot: "kask", atk: 4, def: 25 },
  { name: "Şeref Tacı", slot: "kask", atk: 4, def: 25 },
  { name: "Bilgelik Tacı", slot: "kask", atk: 4, def: 25 },
  { name: "Görkem Tacı", slot: "kask", atk: 4, def: 25 },
  { name: "Şanlı Miğfer", slot: "kask", atk: 4, def: 25 }
];
export const LEGENDARY_BY_SLOT = LEGENDARY_ITEMS.reduce((acc, it) => {
  (acc[it.slot] ||= []).push(it);
  return acc;
}, {});

// V3 GÜNCELLEMESİ: LEGENDARY_ITEMS artık sabit "desc" içermiyor (eski garanti
// effect sistemi kaldırıldı, bkz. EFSANEVI_TRAIT_POOL notu yukarıda). Bu
// yüzden LEGENDARY_DESC_BY_NAME kaldırıldı — artık ekranda gösterilecek pasif
// açıklama, eşyanın ÜZERİNDE kayıtlı (düştüğü anda roll'lanmış) alanlardan
// canlı olarak okunuyor: efsanevi → efsaneviTrait, mitik/kabus → exclusiveBonus,
// standart/nadir → minorTrait. Üçü de aynı şekle sahip ({..., desc: "..."}).
// GERİYE DÖNÜK UYUMLULUK: Firestore'da eski sistemden kalma (ÖNCEDEN
// düşmüş/kuşanılmış) efsanevi eşyalarda hâlâ eski "effectDesc" alanı olabilir
// — o eşyalar hiçbir zaman efsaneviTrait almadığı için (o alan sadece yeni
// üretilen eşyalarda dolar) son çare olarak eski effectDesc'e düşülüyor, yani
// zaten sahip olunan eski eşyalar üzerlerindeki eski (donmuş) metni göstermeye
// devam eder. Tamamen kaldırmak istersen (yeni sistemle hiç karışmasın diye)
// bir admin migration fonksiyonu yazabilirim — mevcut equipment/envanterdeki
// effect/effectDesc alanlarını Firestore'dan silen.
export function getLiveEffectDesc(item) {
  if (!item) return null;
  return item.efsaneviTrait?.desc || item.exclusiveBonus?.desc || item.minorTrait?.desc || item.effectDesc || null;
}

// Koleksiyon kitabı için: her slotun tüm olası eşyaları (nadirlik etiketiyle birlikte)
export const ALL_ITEMS_BY_SLOT = Object.fromEntries(SLOTS.map(s => {
  const items = [
    ...STANDARD_NAMES[s.key].map(name => ({ name, rarity: "standart" })),
    ...RARE_NAMES[s.key].map(name => ({ name, rarity: "nadir" })),
    ...(LEGENDARY_BY_SLOT[s.key] || []).map(it => ({ name: it.name, rarity: "efsanevi" }))
  ];
  return [s.key, items];
}));
export const TOTAL_ITEM_COUNT = Object.values(ALL_ITEMS_BY_SLOT).reduce((sum, arr) => sum + arr.length, 0);

