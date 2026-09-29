/* ==========================================================================
   鼠标特效 · 拖尾（一条连续的缎带）
   --------------------------------------------------------------------------
   把拖尾当成一条线 A→B：
     A = 光标所在的那端（最宽、最实）
     B = 尾梢（宽度与不透明度都光滑地收到 0）

   · 路径：记最近若干个鼠标位置，做一次三点平滑，再逐点算法线，构造左右边界；
     所以它是一条真正连续的带子，不是一串点。
   · 极光（夜间）：颜色沿**长度方向** A→B 渐变（青绿 → 蓝紫），并随时间缓缓流动。
   · 彩虹（日间）：颜色在**垂直于 AB 的方向**上从红渐变到紫（横截面就是一道虹）。
   · 收尾：宽度 ∝ (1-t)^0.85、不透明度 ∝ (1-t)^1.7 —— 两样都在 B 点平滑归零。
   · 亮度整体压得比光标本体低；触屏与 prefers-reduced-motion 一律不启用。
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

  var MAX = 26;          // 轨迹点上限（越多尾巴越长）
  var LIFE = 520;        // 每个点活多久（毫秒）
  var W0 = 20;           // A 端的带宽（像素）
  var A0 = 0.38;         // A 端的不透明度上限
  var BANDS = 9;         // 彩虹的横向色带数
  var SEG = 7;           // 沿长度切成几段（每段一个不透明度）

  var pts = [];          // {x, y, t}，最新的在末尾
  var lastX = null, lastY = null;
  var raf = 0;

  /* 三点平滑：让折线变成圆滑的曲线 */
  function smooth(p) {
    var out = [];
    for (var i = 0; i < p.length; i++) {
      var a = p[i > 0 ? i - 1 : 0], b = p[i], c = p[i < p.length - 1 ? i + 1 : i];
      out.push({ x: (a.x + b.x * 2 + c.x) / 4, y: (a.y + b.y * 2 + c.y) / 4 });
    }
    return out;
  }
  /* 每个点处的单位法线 */
  function normals(p) {
    var out = [];
    for (var i = 0; i < p.length; i++) {
      var a = p[i > 0 ? i - 1 : 0], b = p[i < p.length - 1 ? i + 1 : i];
      var dx = b.x - a.x, dy = b.y - a.y;
      var L = Math.sqrt(dx * dx + dy * dy) || 1;
      out.push({ x: -dy / L, y: dx / L });
    }
    return out;
  }

  /* 画一段带子：off 是横向偏移（-0.5..0.5 = 横跨整条带），half 是它自己的半宽比例
     colorAt(i) 直接返回带 alpha 的颜色；useGrad 时每段内部再插一个线性渐变，
     这样相邻段的 alpha 是连续过渡的，不会露出阶梯。 */
  function band(path, nor, n, wAt, colorAt, off, half, segs, useGrad) {
    for (var s = 0; s < segs; s++) {
      var i0 = Math.floor(s * (n - 1) / segs);
      var i1 = Math.min(n - 1, Math.floor((s + 1) * (n - 1) / segs) + 1);   // 多带一个点，段间不留缝
      if (i1 <= i0) continue;
      if (useGrad) {
        var c0 = colorAt(i0), c1 = colorAt(i1);
        if (c0 === null && c1 === null) continue;
      } else if (colorAt((i0 + i1) / 2) === null) {
        continue;
      }

      ctx.beginPath();
      for (var i = i0; i <= i1; i++) {
        var w = wAt(i);
        var cx = path[i].x + nor[i].x * off * w;
        var cy = path[i].y + nor[i].y * off * w;
        var hw = w * half;
        var px = cx + nor[i].x * hw, py = cy + nor[i].y * hw;
        if (i === i0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      for (var j = i1; j >= i0; j--) {
        var w2 = wAt(j);
        var cx2 = path[j].x + nor[j].x * off * w2;
        var cy2 = path[j].y + nor[j].y * off * w2;
        var hw2 = w2 * half;
        ctx.lineTo(cx2 - nor[j].x * hw2, cy2 - nor[j].y * hw2);
      }
      ctx.closePath();

      if (useGrad && i1 > i0) {
        var g = ctx.createLinearGradient(path[i0].x, path[i0].y, path[i1].x, path[i1].y);
        g.addColorStop(0, colorAt(i0));
        g.addColorStop(1, colorAt(i1));
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = colorAt((i0 + i1) / 2);
      }
      ctx.fill();
    }
  }

  function tick() {
    var now = performance.now();
    while (pts.length && now - pts[0].t > LIFE) pts.shift();

    ctx.clearRect(0, 0, W, H);
    if (pts.length < 3) { raf = 0; return; }

    // 从光标那头（新）到尾梢（旧）
    var raw = [];
    for (var i = pts.length - 1; i >= 0; i--) raw.push(pts[i]);
    var path = smooth(raw);
    var nor = normals(path);
    var n = path.length;

    // t=0 在光标处（最宽最实），t=1 在尾梢（宽度与不透明度都归零）
    function wAt(i) { var t = i / (n - 1); return W0 * Math.pow(1 - t, 0.85); }
    function aAt(i) { var t = i / (n - 1); return A0 * Math.pow(1 - t, 1.7); }

    ctx.globalCompositeOperation = 'lighter';

    if (dark) {
      // 极光：沿长度方向渐变，并随时间缓缓流动（段内再插渐变，杜绝阶梯感）
      var flow = Math.sin(now * 0.00055) * 26 + Math.sin(now * 0.0017) * 10;
      band(path, nor, n, wAt, function (i) {
        var t = i / (n - 1);
        var al = aAt(i);
        if (al <= 0.005) return null;
        var hue = 140 + 150 * t + flow * (0.35 + t);      // 绿 → 青 → 蓝 → 紫
        var li = 64 + 13 * Math.sin(now * 0.002 + t * 3.2);
        return 'hsla(' + hue.toFixed(0) + ',74%,' + li.toFixed(0) + '%,' + al.toFixed(3) + ')';
      }, 0, 0.5, 16, true);
    } else {
      // 彩虹：横向（垂直于 AB）从红到紫；横向本身有色彩变化，纵向用单一 alpha 也看不出台阶
      for (var k = 0; k < BANDS; k++) {
        var u = k / (BANDS - 1);
        band(path, nor, n, wAt, (function (hue) {
          return function (i) {
            var al = aAt(i);
            if (al <= 0.005) return null;
            return 'hsla(' + hue.toFixed(0) + ',88%,62%,' + al.toFixed(3) + ')';
          };
        })(u * 288), u - 0.5, 0.5 / BANDS * 1.15, SEG, false);
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(tick);
  }

  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  window.addEventListener('mousemove', function (e) {
    if (lastX !== null) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (dx * dx + dy * dy < 6) return;      // 挪得太少就不记，免得堆点
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
