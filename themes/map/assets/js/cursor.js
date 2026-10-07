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

  var EVERY = 280;       // 每隔多久放一个（原来 150 太密了）
  var LIFE = 1100;       // 每个活多久（原来 620，扩散显得太急）
  var R_DAY = 22;        // 日间最大半径（很小）
  var R_NIGHT = 26;      // 夜间最大半径
  var MAX = 14;          // 同时最多几个
  var HUE_SPAN = 52;     // 单个极光环在自己一生里走多少度色相
  var HUE_SWING = 70;    // 极光基色的摆动幅度（围绕 200°）

  var items = [];
  var mx = -1, my = -1;
  var next = 0;
  var raf = 0;

  /* 极光基色：围绕 200°（青蓝）做 ±70° 的缓慢摆动 —— 也就是 130°~270°，
     正好是绿 → 青 → 蓝 → 紫这一段，不会漂到不像极光的红黄去。 */
  function baseHue(now) {
    return 200 + Math.sin(now * 0.00018) * HUE_SWING;
  }
  /* 把色相夹在极光那一段里循环（140°~290°）——
     否则「一环之内渐变 + 色标再向外偏移」会一路加到 380°，变成粉红。 */
  function wrapHue(v) {
    var span = 150, u = (v - 140) % span;
    if (u < 0) u += span;
    return 140 + u;
  }

  function spawn(now) {
    var night = dark;
    items.push({
      x: mx, y: my, born: now,
      life: LIFE * (0.85 + Math.random() * 0.3),
      maxR: (night ? R_NIGHT : R_DAY) * (0.82 + Math.random() * 0.36),
      peak: night ? 0.5 : 0.46,                       // 亮度上限，压得比光标本体低
      // 初相 = 当前的极光基色 + 一点点抖动（所以整体色调会随时间缓缓流动，
      // 但不是每个都从头随机，不会花）
      h0: night ? baseHue(now) + (Math.random() - 0.5) * 26 : 0
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

      var ease = Math.pow(t, 0.75);                   // 略先快后慢，整体比原来慢得多
      var r = it.maxR * (0.25 + 0.75 * ease);
      var a = it.peak * (1 - t) * (1 - t);            // 二次淡出，尾巴收得干净
      if (a <= 0.01) continue;

      var r0 = r * 0.6, r1 = r;
      var g = ctx.createRadialGradient(it.x, it.y, r0, it.x, it.y, r1);

      if (dark) {
        // 色相在它自己的一生里再往前走 HUE_SPAN 度 —— 一圈之内也是渐变的；
        // 全程用 wrapHue 夹在极光的 140°~290° 区间里循环。
        var h = it.h0 + t * HUE_SPAN;
        g.addColorStop(0.00, 'hsla(' + wrapHue(h).toFixed(0) + ',78%,72%,0)');
        g.addColorStop(0.32, 'hsla(' + wrapHue(h).toFixed(0) + ',78%,72%,' + a.toFixed(3) + ')');
        g.addColorStop(0.68, 'hsla(' + wrapHue(h + 30).toFixed(0) + ',74%,66%,' + (a * 0.7).toFixed(3) + ')');
        g.addColorStop(1.00, 'hsla(' + wrapHue(h + 52).toFixed(0) + ',70%,62%,0)');
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
