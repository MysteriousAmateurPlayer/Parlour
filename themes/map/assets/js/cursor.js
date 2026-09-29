/* ==========================================================================
   鼠标特效 · 拖尾（一条连续的缎带）
   --------------------------------------------------------------------------
   把拖尾当成一条线 A→B：
     A = 光标所在的那端（最宽、最实，且**紧贴光标**）
     B = 尾梢（宽度与不透明度都光滑地收到 0）

   · 路径：记最近若干个鼠标位置 → **Catmull-Rom 重采样成 64 个等参数点**，
     所以不管鼠标快慢，带子的边界都是光滑曲线，不会出现折角或疏密不均。
     插值在 u=0 处恰好等于原始首点，所以 A 端精确落在光标上；
     另外每次 mousemove 都会把最新那个点更新成当前坐标（哪怕位移很小没进数组），
     这样光标停住时拖尾也不会落在后面。
   · 微元：沿长度切成 24 段。
       彩虹 —— 每段再叠一个**横向渐变**（红→紫），既有横向的连续虹，纵向也够密；
       极光 —— 每段一个纯色，色相沿长度 140→290 走，24 段的步进已经看不出阶梯。
   · 收尾：宽度 ∝ (1-t)^0.85、不透明度 ∝ (1-t)^1.7，两样都在 B 点平滑归零。
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

  var MAXPT = 24;        // 原始轨迹点上限
  var LIFE = 520;        // 每个点活多久（毫秒）
  var RES = 64;          // 重采样后的点数
  var SEG = 24;          // 沿长度切成几段
  var W0 = 20;           // A 端的带宽（像素）
  var A0 = 0.38;         // A 端的不透明度上限
  var STOPS = 7;         // 彩虹横向渐变的色标数

  var pts = [];          // {x, y, t}，最新的在末尾
  var curX = null, curY = null;
  var lastX = null, lastY = null;
  var raf = 0;

  /* Catmull-Rom 重采样：把稀疏、快慢不均的轨迹变成 64 个光滑等参数点 */
  function resample(p, count) {
    var m = p.length;
    if (m < 2) return p.slice();
    var segs = m - 1, out = [];
    for (var k = 0; k < count; k++) {
      var u = k / (count - 1) * segs;
      var i = Math.min(segs - 1, Math.floor(u));
      var t = u - i, t2 = t * t, t3 = t2 * t;
      var p0 = p[i > 0 ? i - 1 : 0], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2 < m ? i + 2 : m - 1];
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      });
    }
    return out;
  }

  /* 每个点处的单位法线 */
  function normals(p) {
    var out = [], n = p.length;
    for (var i = 0; i < n; i++) {
      var a = p[i > 0 ? i - 1 : 0], b = p[i < n - 1 ? i + 1 : i];
      var dx = b.x - a.x, dy = b.y - a.y;
      var L = Math.sqrt(dx * dx + dy * dy) || 1;
      out.push({ x: -dy / L, y: dx / L });
    }
    return out;
  }

  /* 取第 i0..i1 之间的那一段带子的闭合轮廓 */
  function outline(path, nor, i0, i1, wAt) {
    ctx.beginPath();
    for (var i = i0; i <= i1; i++) {
      var w = wAt(i) * 0.5;
      var px = path[i].x + nor[i].x * w, py = path[i].y + nor[i].y * w;
      if (i === i0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    for (var j = i1; j >= i0; j--) {
      var w2 = wAt(j) * 0.5;
      ctx.lineTo(path[j].x - nor[j].x * w2, path[j].y - nor[j].y * w2);
    }
    ctx.closePath();
  }

  function tick() {
    var now = performance.now();
    while (pts.length && now - pts[0].t > LIFE) pts.shift();

    ctx.clearRect(0, 0, W, H);
    if (pts.length < 3) { raf = 0; return; }

    // 从光标那头（新）到尾梢（旧）
    var raw = [];
    for (var i = pts.length - 1; i >= 0; i--) raw.push(pts[i]);
    var path = resample(raw, RES);
    var nor = normals(path);
    var n = path.length;

    // t=0 在光标处（最宽最实），t=1 在尾梢（宽度与不透明度都归零）
    function wAt(i) { var t = i / (n - 1); return W0 * Math.pow(1 - t, 0.85); }
    function aAt(i) { var t = i / (n - 1); return A0 * Math.pow(1 - t, 1.7); }

    ctx.globalCompositeOperation = 'lighter';

    if (dark) {
      // 极光：色相沿长度 140 → 290（绿→青→蓝→紫），并随时间缓缓流动
      var flow = Math.sin(now * 0.00055) * 26 + Math.sin(now * 0.0017) * 10;
      for (var s = 0; s < SEG; s++) {
        var i0 = Math.floor(s * (n - 1) / SEG);
        var i1 = Math.min(n - 1, Math.floor((s + 1) * (n - 1) / SEG) + 1);
        if (i1 <= i0) continue;
        var mid = (i0 + i1) / 2;
        var al = aAt(mid);
        if (al <= 0.005) continue;
        var tt = mid / (n - 1);
        var hue = 140 + 150 * tt + flow * (0.35 + tt);
        var li = 64 + 13 * Math.sin(now * 0.002 + tt * 3.2);
        outline(path, nor, i0, i1, wAt);
        ctx.fillStyle = 'hsla(' + hue.toFixed(0) + ',74%,' + li.toFixed(0) + '%,' + al.toFixed(3) + ')';
        ctx.fill();
      }
    } else {
      // 彩虹：横向（垂直于 AB）从红到紫，每段一个横向渐变
      for (var s2 = 0; s2 < SEG; s2++) {
        var j0 = Math.floor(s2 * (n - 1) / SEG);
        var j1 = Math.min(n - 1, Math.floor((s2 + 1) * (n - 1) / SEG) + 1);
        if (j1 <= j0) continue;
        var mid2 = (j0 + j1) / 2;
        var al2 = aAt(mid2);
        if (al2 <= 0.005) continue;

        var mi = Math.round(mid2);
        var hw = wAt(mi) * 0.5;
        var g = ctx.createLinearGradient(
          path[mi].x + nor[mi].x * hw, path[mi].y + nor[mi].y * hw,
          path[mi].x - nor[mi].x * hw, path[mi].y - nor[mi].y * hw
        );
        for (var k = 0; k < STOPS; k++) {
          var u = k / (STOPS - 1);
          // 饱和度压到 58%、亮度提到 76% —— 比原来柔和、更偏白
          g.addColorStop(u, 'hsla(' + (u * 288).toFixed(0) + ',58%,76%,' + al2.toFixed(3) + ')');
        }
        outline(path, nor, j0, j1, wAt);
        ctx.fillStyle = g;
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(tick);
  }

  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  window.addEventListener('mousemove', function (e) {
    curX = e.clientX; curY = e.clientY;
    if (pts.length) {
      // 最新那个点始终钉在光标上，这样 A 端不会有任何滞后
      pts[pts.length - 1].x = curX;
      pts[pts.length - 1].y = curY;
      pts[pts.length - 1].t = performance.now();
    }
    if (lastX !== null) {
      var dx = curX - lastX, dy = curY - lastY;
      if (dx * dx + dy * dy < 6) { kick(); return; }   // 挪得少就不新起一个点，但仍要刷新
    }
    lastX = curX; lastY = curY;
    pts.push({ x: curX, y: curY, t: performance.now() });
    if (pts.length > MAXPT) pts.shift();
    kick();
  }, { passive: true });

  function clear() {
    pts.length = 0;
    curX = curY = lastX = lastY = null;
    ctx.clearRect(0, 0, W, H);
  }
  document.addEventListener('mouseleave', clear);
  window.addEventListener('blur', clear);
  window.addEventListener('resize', function () { resize(); clear(); }, { passive: true });
})();
