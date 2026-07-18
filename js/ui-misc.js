import { canAttackNow } from "./battle.js";
import { canOpenBoxNow } from "./box-open.js";
import { getAttackWindowIndex } from "./core-config.js";
import { battleLogEl } from "./dom.js";
import { S } from "./state.js";
import { WHEEL_SEGMENT_ANGLE } from "./wheel-bounty-oracle.js";

// ============================================================
// RENDER: SAVAŞ GEÇMİŞİ
// ============================================================
export function renderBattleLog(entries) {
  if (!entries.length) {
    battleLogEl.innerHTML = `<p class="box-status">Henüz savaş yok, ilk saldırıyı sen yap!</p>`;
    return;
  }
  battleLogEl.innerHTML = entries.map(e => {
    const cls = e.legendary ? "legendary-trigger" : (e.winner ? "win" : "");
    const time = e.timestamp ? new Date(e.timestamp).toLocaleString("tr-TR") : "";
    const attackerWon = e.winner && e.winner === e.attacker;

    let badge;
    if (!e.winner) badge = `<span class="log-badge skip">💨 Pas Geçti</span>`;
    else if (attackerWon) badge = `<span class="log-badge win">🏆 Kazandı</span>`;
    else badge = `<span class="log-badge lose">🛡️ Savundu</span>`;
    const legendaryBadge = e.legendary ? `<span class="log-badge legendary">✨ Efsanevi Etki</span>` : "";

    // Efsanevi eşya etkileri artık ana savaş cümlesiyle aynı paragrafta karışık
    // gösterilmiyor; ayrı, madde işaretli bir liste halinde altında gösteriliyor.
    const effectsHtml = (e.effects && e.effects.length)
      ? `<ul style="margin:6px 0 0 18px; padding:0; font-size:0.85em; opacity:0.9; line-height:1.5;">${e.effects.map(x => `<li>${x}</li>`).join("")}</ul>`
      : "";

    return `
      <div class="log-entry ${cls}">
        <div class="log-entry-top">
          <span class="log-fighters">${e.attacker} <span class="log-vs">⚔️</span> ${e.defender}</span>
          <span class="log-badges">${badge}${legendaryBadge}</span>
        </div>
        <p class="log-message">${e.message}</p>
        ${effectsHtml}
        <span class="log-time">🕐 ${time}</span>
      </div>`;
  }).join("");
}

// ============================================================
// SES EFEKTLERİ
// Tasarım prototipindeki gibi, dışarıdan hiçbir ses dosyası kullanılmadan
// Web Audio API osilatörleriyle anlık üretiliyor. Oyunun mevcut mantığına
// (skor/kutu/saldırı hesapları) dokunmuyor, sadece geri bildirim katmanı.
// ============================================================

// ============================================================
// GERÇEK SES DOSYALARI
// Tüm ses dosyaları repo kökündeki "sesler/" klasöründe durur.
// Yeni ses eklerken: dosyayı sesler/ içine at + aşağıya bir satır ekle
// (örn. kilic: "sesler/Kilic_Sesi.mp3") + ilgili yerden playSound("kilic")
// ile çağır. Kutu açma efektleri hâlâ Web Audio ile sentezleniyor.
// ============================================================
export const SOUND_FILES = {
  click: "sesler/Click_Sesi.mp3",
  attack: "sesler/Saldırma_sesi.mp3",
  attack2: "sesler/Saldırma_Sesi_2.wav",
  win: "sesler/Kazanma_Sesi.mp3",
  lose: "sesler/Kaybetme_sesi.mp3",
  wheel: "sesler/Çark_sesi.mp3"
};

export const audioCache = {};
export function getAudio(key) {
  const file = SOUND_FILES[key];
  if (!file) return null;
  if (!audioCache[key]) {
    const a = new Audio(encodeURI(file));
    a.preload = "auto";
    audioCache[key] = a;
  }
  return audioCache[key];
}
// Aynı ses üst üste hızlı tetiklenebildiği için (örn. art arda tık) her
// çalışta node klonlanıyor, böylece önceki çalma kesilmeden yenisi başlıyor.
export function playSound(key, { volume = 1 } = {}) {
  if (!S.soundOn) return;
  const base = getAudio(key);
  if (!base) return;
  try {
    const node = base.cloneNode(true);
    node.volume = volume;
    node.play().catch((err) => console.warn(`Ses çalınamadı (${SOUND_FILES[key]}):`, err.message));
  } catch (e) { console.warn(`Ses çalınamadı (${SOUND_FILES[key]}):`, e.message); }
}

export function ensureAudioCtx() {
  if (!S.audioCtx) S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (S.audioCtx.state === "suspended") S.audioCtx.resume();
  return S.audioCtx;
}

export function tone(freq, start, dur, type = "sine", gain = 0.18) {
  if (!S.soundOn) return;
  try {
    const ctx = ensureAudioCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.value = 0;
    osc.connect(g); g.connect(ctx.destination);
    const t0 = ctx.currentTime + start;
    g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  } catch (e) { /* ses opsiyonel bir katman, hata olursa sessiz geç */ }
}

// Genel tık sesi: kullanıcının sağladığı gerçek ses dosyası.
export function sfxClick() {
  playSound("click");
}
export function sfxShake() { tone(140, 0, 0.09, "sawtooth", 0.12); tone(110, 0.06, 0.09, "sawtooth", 0.10); }
export function sfxOpenStandart() { tone(660, 0, 0.12, "triangle"); tone(880, 0.08, 0.15, "triangle"); }
export function sfxOpenRare() { tone(520, 0, 0.1, "triangle"); tone(780, 0.09, 0.12, "triangle"); tone(1040, 0.18, 0.2, "triangle"); }
export function sfxOpenLegendary() {
  [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.09, 0.35, "triangle", 0.16));
  tone(1568, 0.45, 0.5, "sine", 0.14);
}
// [V2 Faz 3] Seviye atlama fanfarı: yükselen bir arpej + tutan zafer notası.
export function sfxLevelUp() {
  [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.1, 0.28, "triangle", 0.17));
  tone(1568, 0.42, 0.55, "sine", 0.15);
}
// Çark dönerken segment geçişinde çalan kısa "tık" sesi
export function sfxWheelTick() {
  tone(1100, 0, 0.028, "square", 0.05);
  tone(650, 0.005, 0.02, "square", 0.03);
}
// Çarkın o anki gerçek dönüş açısını (derece) CSS transform matrisinden okur
export function getWheelRotationDeg(el) {
  const st = getComputedStyle(el);
  const tr = st.transform;
  if (!tr || tr === "none") return 0;
  const match = tr.match(/^matrix\(([^)]+)\)$/);
  if (!match) return 0;
  const v = match[1].split(",").map(parseFloat);
  let angle = Math.atan2(v[1], v[0]) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}
// Segmentler arası koyu "demir parmaklık" ayraçları için conic-gradient
// (Karanlık Kader Çarkı temasından uyarlandı).
export function buildWheelSpokesGradient() {
  return `repeating-conic-gradient(from -1.5deg, transparent 0deg, transparent ${WHEEL_SEGMENT_ANGLE - 3}deg, #111 ${WHEEL_SEGMENT_ANGLE - 3}deg, #111 ${WHEEL_SEGMENT_ANGLE}deg)`;
}
// Saldırı sesi: kullanıcının sağladığı 2 gerçek ses dosyasından rastgele biri
// çalınır, böylece art arda saldırılarda ses tekdüze olmaz.
export function sfxAttack() {
  playSound(Math.random() < 0.5 ? "attack" : "attack2");
}

export const soundToggleBtn = document.getElementById("soundToggleBtn");
export function refreshSoundBtn() {
  if (!soundToggleBtn) return;
  soundToggleBtn.textContent = S.soundOn ? "🔊" : "🔇";
}
refreshSoundBtn();
if (soundToggleBtn) {
  soundToggleBtn.onclick = () => {
    S.soundOn = !S.soundOn;
    localStorage.setItem("gacha_sound_on", S.soundOn ? "1" : "0");
    refreshSoundBtn();
    if (S.soundOn) sfxClick();
  };
}

// Genel tık sesi: mevcut butonların davranışını değiştirmeden, her buton
// tıklamasında kısa bir "click" sesi çalar (event delegation).
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || btn.disabled) return;
  if (btn.id === "soundToggleBtn") return; // kendi sesini kendi yönetiyor
  sfxClick();
}, true);

// ============================================================
// BİLDİRİMLER (Web Notification API)
// Kullanıcı açıkça izin verip özelliği açtıysa (opt-in), sandık açmaya hazır
// olduğunda ve o saatlik saldırı penceresi açıldığında tarayıcı bildirimi
// gönderilir. Sekme kapalıyken bile (izin varsa) çalışır, oyuncunun tekrar
// oyuna dönmesini teşvik eder. Sadece bilgilendirme katmanıdır, hiçbir oyun
// verisine dokunmaz.
// ============================================================
export const notifToggleBtn = document.getElementById("notifToggleBtn");

export function refreshNotifBtn() {
  if (!notifToggleBtn) return;
  if (!("Notification" in window)) { notifToggleBtn.classList.add("hidden"); return; }
  const active = S.notifOn && Notification.permission === "granted";
  notifToggleBtn.textContent = active ? "🔔" : "🔕";
}
refreshNotifBtn();

if (notifToggleBtn) {
  notifToggleBtn.onclick = async () => {
    if (!("Notification" in window)) return;
    if (!S.notifOn || Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        S.notifOn = true;
        localStorage.setItem("gacha_notif_on", "1");
        new Notification("🔥 Fadeless", {
          body: "Bildirimler açıldı! Sandığın hazır olduğunda ve saldırı hakkın açıldığında haber vereceğiz."
        });
      }
    } else {
      S.notifOn = false;
      localStorage.setItem("gacha_notif_on", "0");
    }
    refreshNotifBtn();
  };
}

export function sendNotification(title, body) {
  if (!S.notifOn || !("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(title, { body }); } catch (e) { /* bildirim opsiyonel bir katman, hata olursa sessiz geç */ }
}

// Sandık hazır mı ve saldırı penceresi açık mı kontrol edip, daha önce o
// spesifik an için bildirim gönderilmediyse bir kez bildirim yollar.
// S.notifiedBoxOpenTime / S.notifiedAttackWindow anahtarları sayesinde aynı
// hazır durum için tekrar tekrar bildirim spam'lenmiyor.
export function checkTimeBasedNotifications() {
  if (!S.currentPlayerData || !S.notifOn) return;
  if (canOpenBoxNow() && S.notifiedBoxOpenTime !== (S.currentPlayerData.lastBoxOpenTime ?? 0)) {
    sendNotification("📦 Sandığın Hazır!", "Yeni bir sandık açabilirsin, şansını dene!");
    S.notifiedBoxOpenTime = S.currentPlayerData.lastBoxOpenTime ?? 0;
  }
  if (canAttackNow() && S.notifiedAttackWindow !== getAttackWindowIndex()) {
    sendNotification("⚔️ Saldırı Hakkın Açıldı!", "Bu saatlik saldırı hakkını kullanmayı unutma, yoksa kaybolur!");
    S.notifiedAttackWindow = getAttackWindowIndex();
  }
}
setInterval(checkTimeBasedNotifications, 15000);

// ============================================================
// SEKMELER (GERÇEK TAB SİSTEMİ)
// Her sekme SADECE kendi içeriğini gösterir, diğerleri tamamen gizlenir:
// Kutu -> yalnız kutu açma + enerji, Görev -> yalnız günlük görevler,
// Savaş -> yalnız saldırı hedefleri + savaş geçmişi, Sıra -> yalnız
// liderlik tablosu, Profil -> yalnız kuşanım/envanter ve kendi bilgilerimiz.
// ============================================================
export const bottomNav = document.getElementById("bottomNav");
export const tabPanels = [...document.querySelectorAll(".tab-panel")];
export const navActiveIndicator = document.getElementById("navActiveIndicator");

// Gösterge konumu, offsetLeft/offsetWidth yerine getBoundingClientRect FARKI
// ile hesaplanıyor. Bu, gap/max-width/justify-content gibi düzen detaylarından
// tamamen bağımsız çalışır ve gösterge HER ZAMAN tıklanan sekmenin ikonunun
// tam ortasında hizalanır (eski hesaplamada bazı sekmelerde/ekran
// genişliklerinde birkaç piksel kayma oluyordu, artık oluşmuyor).
export function moveNavIndicator(btn) {
  if (!navActiveIndicator || !btn || !bottomNav) return;
  const navRect = bottomNav.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const indicatorWidth = navActiveIndicator.offsetWidth || 40;
  const targetLeft = (btnRect.left - navRect.left) + (btnRect.width / 2) - (indicatorWidth / 2);
  navActiveIndicator.style.transform = `translateX(${targetLeft}px)`;
  navActiveIndicator.classList.add("ready");
}

export function activateTab(targetId) {
  tabPanels.forEach(panel => panel.classList.toggle("active", panel.id === targetId));
  if (bottomNav) {
    let activeBtn = null;
    bottomNav.querySelectorAll(".nav-btn").forEach(b => {
      const isActive = b.getAttribute("data-target") === targetId;
      b.classList.toggle("active", isActive);
      if (isActive) activeBtn = b;
    });
    // Bir sonraki çizim karesinde ölç: class değişiminin (ikon büyümesi vb.)
    // layout'a yansıması garanti olsun diye.
    requestAnimationFrame(() => moveNavIndicator(activeBtn));
  }
}

if (bottomNav) {
  bottomNav.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => activateTab(btn.getAttribute("data-target")));
  });

  // İlk konumlandırma: webfontlar (Fredoka/Luckiest Guy) yüklenmeden ölçüm
  // alınırsa buton genişlikleri sonradan değişip göstergeyi kaydırabilir,
  // bu yüzden fontlar hazır olunca ve pencere yeniden boyutlandığında/
  // döndürüldüğünde de yeniden hizalanıyor.
  const initNavIndicator = () => {
    const active = bottomNav.querySelector(".nav-btn.active") || bottomNav.querySelector(".nav-btn");
    requestAnimationFrame(() => moveNavIndicator(active));
  };
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(initNavIndicator).catch(initNavIndicator);
  } else {
    initNavIndicator();
  }
  window.addEventListener("load", initNavIndicator);
  window.addEventListener("resize", () => {
    moveNavIndicator(bottomNav.querySelector(".nav-btn.active"));
  });
}

