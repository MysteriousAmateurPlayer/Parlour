/* ==========================================================================
   鼠标特效 · 光标处定时释放的小涟漪
   --------------------------------------------------------------------------
   之前做的是「沿鼠标轨迹连成一条带子」，那条路必须处理任意曲线的取样、法线、
   自交、接缝……任何一处没算好都会露馅。现在换成完全离散的做法：

     · 鼠标停在哪儿，就每隔 EVERY 毫秒在**那个点**放一个小特效；
     · 每个特效的形状是**固定**的、只跟自己的寿命有关 —— 不存在「连不连续」的问题；
     · 日间：一圈向外扩散的彩虹环，径向由内到外是「紫 → 青 → 黄 → 红」；
     · 夜间：随机色相（绿 → 紫）的极光柔环，再叠一道随机角度与长度的亮弧；
     · 尺寸很小（半径 22 / 26 像素封顶），扩散先快后慢、透明度二次曲线淡出。

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
  function readTheme() { dark = document.documentElement.getAttribute('data-theme') === 'dark'; }
  readTheme();
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  var EVERY = 150;       // 每隔多久放一个
  var LIFE = 620;        // 每个活多久
  var R_DAY = 22;        // 日间最大半径（很小）
  var R_NIGHT = 26;      // 夜间最大半径
  var MAX = 14;          // 同时最多几个

  var items = [];
  var mx = -1, my = -1;
  var next = 0;
  var raf = 0;

  function spawn(now) {
    var night = dark;
    items.push({
      x: mx, y: my, born: now,
      life: LIFE * (0.85 + Math.random() * 0.3),
      maxR: (night ? R_NIGHT : R_DAY) * (0.82 + Math.random() * 0.36),
      peak: night ? 0.5 : 0.46,                       // 亮度上限，压得比光标本体低
      hue: night ? (138 + Math.random() * 152) : 0,   // 夜间每个随机一个极光色相
      arcA: Math.random() * Math.PI * 2,              // 那道亮弧的起始角与长度
      arcLen: 0.5 + Math.random() * 1.5,
      arcW: 1.4 + Math.random() * 1.4
    });
    if (items.length > MAX) items.shift();
  }

  function tick() {
    var now = performance.now();
    ctx.clearRect(0, 0, W, H);

    if (mx >= 0 && now >= next) {
      spawn(now);
      next = now + EVERY * (0.75 + Math.random() * 0.5);
    }

    var keep = [];
    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var t = (now - it.born) / it.life;
      if (t >= 1) continue;
      keep.push(it);

      var ease = 1 - (1 - t) * (1 - t);               // 先快后慢地扩散
      var r = it.maxR * (0.25 + 0.75 * ease);
      var a = it.peak * (1 - t) * (1 - t);            // 二次淡出，尾巴收得干净
      if (a <= 0.01) continue;

      var r0 = r * 0.6, r1 = r;
      var g = ctx.createRadialGradient(it.x, it.y, r0, it.x, it.y, r1);

      if (dark) {
        var h = it.hue;
        g.addColorStop(0.00, 'hsla(' + h.toFixed(0) + ',78%,72%,0)');
        g.addColorStop(0.32, 'hsla(' + h.toFixed(0) + ',78%,72%,' + a.toFixed(3) + ')');
        g.addColorStop(0.68, 'hsla(' + (h + 34).toFixed(0) + ',74%,66%,' + (a * 0.7).toFixed(3) + ')');
        g.addColorStop(1.00, 'hsla(' + (h + 62).toFixed(0) + ',70%,62%,0)');
      } else {
        // 外红内紫：色标从内圈（紫）一路排到外圈（红）
        g.addColorStop(0.00, 'hsla(288,86%,70%,0)');
        g.addColorStop(0.22, 'hsla(288,86%,70%,' + a.toFixed(3) + ')');
        g.addColorStop(0.45, 'hsla(196,86%,66%,' + a.toFixed(3) + ')');
        g.addColorStop(0.68, 'hsla(52,88%,64%,' + a.toFixed(3) + ')');
        g.addColorStop(0.86, 'hsla(4,86%,63%,' + a.toFixed(3) + ')');
        g.addColorStop(1.00, 'hsla(4,86%,63%,0)');
      }

      ctx.beginPath();
      ctx.arc(it.x, it.y, r1, 0, Math.PI * 2);
      ctx.arc(it.x, it.y, r0, 0, Math.PI * 2, true);
      ctx.fillStyle = g;
      ctx.fill();

      // 夜间那道随机的极光帘弧
      if (dark) {
        ctx.beginPath();
        ctx.arc(it.x, it.y, r1 * 0.82, it.arcA, it.arcA + it.arcLen);
        ctx.lineWidth = it.arcW * (0.4 + 0.6 * (1 - t));
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'hsla(' + it.hue.toFixed(0) + ',88%,78%,' + (a * 0.95).toFixed(3) + ')';
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    items = keep;

    // 鼠标不在窗口里、也没有残留特效了，就停掉 rAF，别白烧 CPU
    if (mx < 0 && !items.length) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
  }

  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  window.addEventListener('mousemove', function (e) {
    mx = e.clientX; my = e.clientY;
    kick();
  }, { passive: true });

  function clear() {
    items.length = 0;
    mx = my = -1;
    ctx.clearRect(0, 0, W, H);
  }
  document.addEventListener('mouseleave', clear);
  window.addEventListener('blur', clear);
  window.addEventListener('resize', function () { resize(); clear(); }, { passive: true });
})();
