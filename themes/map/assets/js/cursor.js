/* ==========================================================================
   鼠标特效 · 拖尾
   --------------------------------------------------------------------------
   光标本体是 CSS 画的古典箭头（见 main.css 的 --cursor-arrow / --cursor-link），
   这里只负责身后那串拖尾：
     · 日间：明亮的彩虹，色相沿拖尾推进
     · 夜间：极光，青绿 → 蓝紫，外圈再罩一层柔光
   亮度压得很低（alpha 上限约 0.2）、半径也小 —— 拖尾绝不能比光标本体还抢眼。
   只在真有指针的设备上跑；触屏、prefers-reduced-motion 一律不启用。
   ========================================================================== */
(function () {
  'use strict';

  if (!window.matchMedia) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var cv = document.createElement('canvas');
  cv.className = 'cursor-trail';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  var ctx = cv.getContext('2d');

  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var W = 0, H = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  var dark = false;
  function readTheme() {
    dark = document.documentElement.getAttribute('data-theme') === 'dark';
  }
  readTheme();
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  var MAX = 20;                 // 拖尾长度
  var LIFE = 460;               // 每个点活多久（毫秒）
  var pts = [];
  var lastX = null, lastY = null;
  var raf = 0;

  function tick() {
    var now = performance.now();
    while (pts.length && now - pts[0].t > LIFE) pts.shift();

    ctx.clearRect(0, 0, W, H);
    if (!pts.length) { raf = 0; return; }

    ctx.globalCompositeOperation = 'lighter';
    var n = pts.length;
    var hueShift = (now * 0.06) % 360;

    for (var i = 0; i < n; i++) {
      var p = pts[i];
      var u = (i + 1) / n;                                   // 0 尾梢 → 1 头部
      var age = Math.min(1, (now - p.t) / LIFE);
      var fade = (1 - age) * u * u;                          // 尾部又旧又淡
      if (fade <= 0.01) continue;

      var r = 1.1 + 6.4 * u * (1 - age * 0.45);
      var a = 0.035 + 0.135 * fade;                          // 上限刻意压得很低

      if (dark) {
        // 极光：青绿 → 蓝紫，外面再罩一层很淡的柔光
        var hue2 = 152 + 62 * u;
        ctx.fillStyle = 'hsla(' + hue2.toFixed(0) + ',82%,64%,' + (a * 0.42).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'hsla(' + hue2.toFixed(0) + ',88%,70%,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      } else {
        // 日间：彩虹，色相沿拖尾推进
        var hue = (hueShift + i * 20) % 360;
        ctx.fillStyle = 'hsla(' + hue.toFixed(0) + ',88%,60%,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(tick);
  }

  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  window.addEventListener('mousemove', function (e) {
    if (lastX !== null) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (dx * dx + dy * dy < 9) return;                     // 挪得太少就不记，免得原地堆点
    }
    lastX = e.clientX; lastY = e.clientY;
    pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (pts.length > MAX) pts.shift();
    kick();
  }, { passive: true });

  function clear() {
    pts.length = 0;
    lastX = lastY = null;
    ctx.clearRect(0, 0, W, H);
  }
  document.addEventListener('mouseleave', clear);
  window.addEventListener('blur', clear);
  window.addEventListener('resize', function () { resize(); clear(); }, { passive: true });
})();
