// ============================================================
// AYARLAR — [DİKEY] GÖRÜŞ/YAKINLIK (OPSİYONEL, KALICI)
// ⚙️ butonu bir panel açar; kaydırıcı görünen dünya genişliğini (VIEW_W_TARGET)
// değiştirir → oyun anında yakınlaşır/uzaklaşır. Tercih localStorage
// ["ppbMapZoom"]'da saklanır, bir sonraki girişte otomatik uygulanır (00-core
// okur). Bu ayar tamamen kozmetik/konfor — oyun mantığına, dengeye, köprülere
// DOKUNMAZ. Herkes kendi keyfine göre oynar.
// index.html'de 12-main.js'ten SONRA yüklenir.
// ============================================================
(function () {
  function boot() {
    var gear = document.getElementById("settingsGear");
    var panel = document.getElementById("settingsPanel");
    var slider = document.getElementById("zoomSlider");
    var valEl = document.getElementById("zoomVal");
    var closeBtn = document.getElementById("settingsClose");
    if (!gear || !panel || !slider) return;

    function label(v) {
      return v < 340 ? "Çok yakın" : v < 400 ? "Yakın" : v < 470 ? "Orta" : v < 540 ? "Uzak" : "Çok uzak";
    }

    // Başlangıç: 00-core'un okuduğu kayıtlı değer
    try { if (typeof VIEW_W_TARGET !== "undefined") slider.value = VIEW_W_TARGET; } catch (e) {}
    if (valEl) valEl.textContent = label(+slider.value);

    gear.addEventListener("click", function () { panel.classList.add("on"); });
    if (closeBtn) closeBtn.addEventListener("click", function () { panel.classList.remove("on"); });
    // Panelin boşluğuna dokununca da kapansın (karta değil)
    panel.addEventListener("click", function (e) { if (e.target === panel) panel.classList.remove("on"); });

    slider.addEventListener("input", function () {
      var v = +slider.value;
      if (typeof VIEW_W_TARGET !== "undefined") {
        VIEW_W_TARGET = v;
        if (typeof computeView === "function") computeView();
      }
      if (valEl) valEl.textContent = label(v);
      try { localStorage.setItem("ppbMapZoom", String(v)); } catch (e) {}
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
