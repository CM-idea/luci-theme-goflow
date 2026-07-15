/* =====================================================================
   RouterOS Dashboard — Arayüz etkileşimleri (Vanilla JS, bağımlılık yok)
   - Karanlık / aydınlık tema (localStorage'da saklanır)
   - Sidebar aç/kapat (masaüstü: daralt, mobil: off-canvas)
   - Sidebar açılır alt menüler (akordiyon)
   - Canvas ile canlı trafik grafiği (degrade dolgulu, demo verisi)
   - CPU/RAM, hız ve uptime değerlerinin simüle güncellenmesi
   ===================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var app = document.querySelector(".app");
  var MOBILE_BREAKPOINT = 768;

  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  /* ---------------- Tema (dark / light) ---------------- */
  var themeToggle = document.getElementById("theme-toggle");

  themeToggle.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    drawChart(); // grafik renkleri CSS değişkenlerinden okunuyor, yeniden çiz
  });

  /* ---------------- Sidebar aç/kapat ---------------- */
  var sidebarToggle = document.getElementById("sidebar-toggle");
  var overlay = document.getElementById("overlay");

  sidebarToggle.addEventListener("click", function () {
    if (isMobile()) {
      app.classList.toggle("app--sidebar-open");
    } else {
      app.classList.toggle("app--sidebar-collapsed");
    }
  });

  overlay.addEventListener("click", function () {
    app.classList.remove("app--sidebar-open");
  });

  // Ekran boyutu değişince mobil/masaüstü durum sınıflarını temizle
  window.addEventListener("resize", function () {
    if (isMobile()) {
      app.classList.remove("app--sidebar-collapsed");
    } else {
      app.classList.remove("app--sidebar-open");
    }
  });

  /* ---------------- Açılır alt menüler (akordiyon) ---------------- */
  var groups = document.querySelectorAll(".sidebar__group");

  groups.forEach(function (group) {
    var toggle = group.querySelector(".sidebar__item--toggle");

    toggle.addEventListener("click", function () {
      // Daraltılmış sidebar'da gruba tıklanınca önce menüyü genişlet
      if (!isMobile() && app.classList.contains("app--sidebar-collapsed")) {
        app.classList.remove("app--sidebar-collapsed");
        group.classList.add("sidebar__group--open");
        return;
      }

      var willOpen = !group.classList.contains("sidebar__group--open");

      // Akordiyon davranışı: aynı anda tek grup açık kalsın
      groups.forEach(function (other) {
        other.classList.remove("sidebar__group--open");
      });

      if (willOpen) {
        group.classList.add("sidebar__group--open");
      }
    });
  });

  /* ---------------- Aktif menü öğesi + sayfa başlığı ---------------- */
  var navLinks = document.querySelectorAll(".sidebar__item[data-page], .sidebar__subitem[data-page]");
  var pageTitle = document.getElementById("page-title");

  navLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();

      // Tüm aktif işaretlerini temizle
      navLinks.forEach(function (other) {
        other.classList.remove("sidebar__item--active", "sidebar__subitem--active");
      });

      // Öğenin türüne göre doğru aktif sınıfını uygula
      if (link.classList.contains("sidebar__subitem")) {
        link.classList.add("sidebar__subitem--active");
      } else {
        link.classList.add("sidebar__item--active");
        // Düz bir öğe seçilince açık akordiyonları kapat
        groups.forEach(function (g) { g.classList.remove("sidebar__group--open"); });
      }

      pageTitle.textContent = link.getAttribute("data-page");

      if (isMobile()) {
        app.classList.remove("app--sidebar-open");
      }
    });
  });

  /* ---------------- CBI sekmeleri (ayar sayfası) ---------------- */
  var tabLinks = document.querySelectorAll(".tabs a");
  tabLinks.forEach(function (tab) {
    tab.addEventListener("click", function (e) {
      e.preventDefault();
      tabLinks.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
    });
  });

  /* =====================================================================
     Trafik grafiği (Canvas — kütüphanesiz hafif çizim)
     ===================================================================== */
  // Grafik yalnızca panelde (index.html) var; ayar/login sayfalarında yok.
  var canvas = document.getElementById("traffic-chart");
  var ctx = canvas ? canvas.getContext("2d") : null;

  var POINTS = 40;          // grafikte tutulan örnek sayısı
  var MAX_MBPS = 120;       // dikey eksen üst sınırı
  var CHART_HEIGHT = 400;
  var downData = [];
  var upData = [];

  for (var i = 0; i < POINTS; i++) {
    downData.push(60 + Math.random() * 40);
    upData.push(8 + Math.random() * 10);
  }

  function cssVar(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  // "#rrggbb" değerini rgba() karşılığına çevir (degrade dolgu için)
  function hexToRgba(hex, alpha) {
    var v = hex.replace("#", "");
    if (v.length === 3) {
      v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    }
    var n = parseInt(v, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  function resizeCanvas() {
    // CSS genişliğine göre gerçek piksel çözünürlüğünü eşle (retina desteği)
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = CHART_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawSeries(data, color, w, h) {
    var stepX = w / (POINTS - 1);

    // Eğri çizgi (quadratic ara noktalarla yumuşatılmış)
    ctx.beginPath();
    data.forEach(function (value, idx) {
      var x = idx * stepX;
      var y = h - (value / MAX_MBPS) * h;
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        var prevX = (idx - 1) * stepX;
        var prevY = h - (data[idx - 1] / MAX_MBPS) * h;
        var midX = (prevX + x) / 2;
        ctx.quadraticCurveTo(prevX, prevY, midX, (prevY + y) / 2);
      }
    });
    // Son noktaya bağla
    ctx.lineTo(w, h - (data[POINTS - 1] / MAX_MBPS) * h);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Çizgi altına dikey degrade dolgu
    var gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, hexToRgba(color, 0.22));
    gradient.addColorStop(1, hexToRgba(color, 0));

    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function drawChart() {
    var rect = canvas.getBoundingClientRect();
    var w = rect.width;
    var h = CHART_HEIGHT;

    ctx.clearRect(0, 0, w, h);

    // Yatay kılavuz çizgileri ve Mbps etiketleri
    ctx.strokeStyle = cssVar("--c-border") || "#e3e8f1";
    ctx.fillStyle = cssVar("--c-text-muted") || "#7c879c";
    ctx.font = "11px sans-serif";
    ctx.lineWidth = 1;

    for (var g = 0; g <= 4; g++) {
      var gy = (h / 4) * g;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();

      var label = Math.round(MAX_MBPS - (MAX_MBPS / 4) * g);
      if (g < 4) ctx.fillText(label + " Mbps", 6, gy + 14);
    }

    drawSeries(downData, cssVar("--c-primary") || "#3b6ef5", w, h);
    drawSeries(upData, cssVar("--c-warning") || "#ef8c3b", w, h);
  }

  /* ---------------- Canlı veri simülasyonu ---------------- */
  var statDownload = document.getElementById("stat-download");
  var statUpload = document.getElementById("stat-upload");
  var cpuBar = document.getElementById("cpu-bar");
  var cpuValue = document.getElementById("cpu-value");
  var ramBar = document.getElementById("ram-bar");
  var ramValue = document.getElementById("ram-value");

  function nextValue(current, min, max, jitter) {
    var value = current + (Math.random() - 0.5) * jitter;
    return Math.min(max, Math.max(min, value));
  }

  function tick() {
    // Trafik: yeni örnek ekle, en eskisini at
    var newDown = nextValue(downData[POINTS - 1], 20, 115, 25);
    var newUp = nextValue(upData[POINTS - 1], 3, 30, 8);
    downData.push(newDown);
    downData.shift();
    upData.push(newUp);
    upData.shift();

    statDownload.textContent = newDown.toFixed(1);
    statUpload.textContent = newUp.toFixed(1);

    // CPU / RAM
    var cpu = Math.round(nextValue(parseInt(cpuValue.textContent, 10), 8, 95, 14));
    var ram = Math.round(nextValue(parseInt(ramValue.textContent, 10), 40, 85, 6));

    cpuValue.textContent = cpu + "%";
    cpuBar.style.width = cpu + "%";
    cpuBar.className = "progress__bar " +
      (cpu > 80 ? "progress__bar--danger" : "progress__bar--blue");

    ramValue.textContent = ram + "%";
    ramBar.style.width = ram + "%";

    drawChart();
  }

  /* ---------------- Çalışma süresi sayacı ---------------- */
  var uptimeEl = document.getElementById("uptime");
  var uptimeSeconds = 14 * 86400 + 6 * 3600 + 42 * 60 + 18;

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function renderUptime() {
    uptimeSeconds++;
    var days = Math.floor(uptimeSeconds / 86400);
    var hours = Math.floor((uptimeSeconds % 86400) / 3600);
    var mins = Math.floor((uptimeSeconds % 3600) / 60);
    var secs = uptimeSeconds % 60;
    uptimeEl.textContent = days + " gün " + pad(hours) + ":" + pad(mins) + ":" + pad(secs);
  }

  /* ---------------- Başlat ---------------- */
  if (canvas) {
    window.addEventListener("resize", function () {
      resizeCanvas();
      drawChart();
    });

    resizeCanvas();
    drawChart();

    setInterval(tick, 2000);       // trafik + sistem metrikleri
  }

  if (uptimeEl) {
    setInterval(renderUptime, 1000); // uptime saati
  }
})();
