/* ==========================================================================
   鼠标特效 · 拖尾（一条连续的缎带）
   --------------------------------------------------------------------------
   把拖尾当成一条线 A→B：
     A = 光标所在那端（位置严格等于光标；宽度与不透明度在这里**快速**升起）
     B = 尾梢（宽度与不透明度都缓慢收到 0）

   几个关键处理：

   1) 路径重采样
      记最近若干个鼠标位置 → Catmull-Rom 重采样成 64 个等参数光滑点。
      u=0 处严格等于原始首点，所以 A 端精确落在光标上；
      每次 mousemove 也会把最新那个点钉到当前坐标，光标停住时拖尾不会落后。

   2) A 端快速渐变（不再"一大条突然冒出来"）
      宽度 ∝ rise^0.5、不透明度 ∝ rise^0.6，其中 rise = min(1, t/0.10)
      —— 在头 10% 长度内就升到接近满值，然后按 (1-t)^0.85 / (1-t)^1.9 缓慢收到 0。
      所以两端都有渐变，但 A 端比 B 端快得多。

   3) 不重叠（②③ 的根因与解法）
      ② 「带宽大于间隔」：原来是 i1 = floor(...) + 1，相邻微元**整整重叠一个点距**，
         两段的 alpha 一叠加就深一块浅一块。现在去掉 +1，相邻段只共享端点、内部不交叠。
      ③ 「转弯处扇形重叠」：沿法线切分时，内侧的法线会交叉 —— 带宽一旦超过局部曲率半径
         就必然自交。所以给每个点算**外接圆曲率半径 R**，把该点的实际半宽压到 R*0.82 以内：
             w(i) = min(基础宽度, R(i) * 0.82)
         急弯处带子自动收窄，永远不会叠在一起。这就是"聪明的算法"。
      另：带宽整体从 20px 收到 16px，留出余量。

   4) 颜色
      极光（夜间）：色相沿长度 140 → 290（绿→青→蓝→紫），并随时间缓缓流动。
      彩虹（日间）：每段一个**横向线性渐变**，垂直于 AB 方向由红到紫，
                    饱和度 58% / 亮度 76%，柔和偏白。
   亮度整体压得比光标本体低；触屏与 prefers-reduced-motion 一律不启用。
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
  var SEG = 26;          // 沿长度切成几段（只共享端点，不重叠）
  var W0 = 16;           // A 端的带宽（像素）
  var A0 = 0.40;         // A 端的不透明度上限
  var RISE = 0.10;       // A 端用多长的比例升到满值（比 B 端快得多）
  var CURV_K = 0.82;     // 带宽不得超过局部曲率半径的这个比例
  var STOPS = 7;         // 彩虹横向渐变的色标数

  var pts = [];          // {x, y, t}，最新的在末尾
  var lastX = null, lastY = null;
  var raf = 0;

  /* Catmull-Rom 重采样：把稀疏、快慢不均的轨迹变成等参数光滑点 */
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

  /* 每个点允许的最大**半**宽 = 局部曲率半径 × CURV_K。
     用三点外接圆半径当曲率半径；直线段给一个大数。 */
  function halfWidthLimit(p, n) {
    var lim = new Array(n);
    for (var i = 0; i < n; i++) {
      var a = p[i > 0 ? i - 1 : 0], b = p[i], c = p[i < n - 1 ? i + 1 : i];
      var abx = b.x - a.x, aby = b.y - a.y;
      var bcx = c.x - b.x, bcy = c.y - b.y;
      var cross = abx * bcy - aby * bcx;
      var la = Math.sqrt(abx * abx + aby * aby);
      var lb = Math.sqrt(bcx * bcx + bcy * bcy);
      if (la < 1e-4 || lb < 1e-4 || Math.abs(cross) < 1e-3) { lim[i] = 1e6; continue; }
      var lc = Math.sqrt((c.x - a.x) * (c.x - a.x) + (c.y - a.y) * (c.y - a.y));
      lim[i] = (la * lb * lc) / (2 * Math.abs(cross)) * CURV_K;
    }
    return lim;
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
    var lim = halfWidthLimit(path, n);

    // t=0 在光标处，t=1 在尾梢；两端都有渐变，但 A 端快得多
    function wAt(i) {
      var t = i / (n - 1);
      var rise = Math.min(1, t / RISE);
      var base = W0 * Math.pow(rise, 0.5) * Math.pow(1 - t, 0.85);
      var cap = lim[i] * 2;                       // 急弯处自动收窄，杜绝自交
      return base < cap ? base : cap;
    }
    function aAt(i) {
      var t = i / (n - 1);
      var rise = Math.min(1, t / RISE);
      return A0 * Math.pow(rise, 0.6) * Math.pow(1 - t, 1.9);
    }

    // 相邻微元只共享端点（i1 就是下一段的 i0），内部绝不交叠
    function segRange(s) {
      var i0 = Math.round(s * (n - 1) / SEG);
      var i1 = Math.round((s + 1) * (n - 1) / SEG);
      return [i0, i1];
    }

    ctx.globalCompositeOperation = 'lighter';

    if (dark) {
      // 极光：色相沿长度 140 → 290，并随时间缓缓流动
      var flow = Math.sin(now * 0.00055) * 26 + Math.sin(now * 0.0017) * 10;
      for (var s = 0; s < SEG; s++) {
        var r0 = segRange(s), a0i = r0[0], a1i = r0[1];
        if (a1i <= a0i) continue;
        var mid = (a0i + a1i) / 2;
        var al = aAt(mid);
        if (al <= 0.005) continue;
        var tt = mid / (n - 1);
        var hue = 140 + 150 * tt + flow * (0.35 + tt);
        var li = 64 + 13 * Math.sin(now * 0.002 + tt * 3.2);
        outline(path, nor, a0i, a1i, wAt);
        ctx.fillStyle = 'hsla(' + hue.toFixed(0) + ',74%,' + li.toFixed(0) + '%,' + al.toFixed(3) + ')';
        ctx.fill();
      }
    } else {
      // 彩虹：每段一个横向渐变，垂直于 AB 由红到紫
      for (var s2 = 0; s2 < SEG; s2++) {
        var q = segRange(s2), b0 = q[0], b1 = q[1];
        if (b1 <= b0) continue;
        var mid2 = (b0 + b1) / 2;
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
          g.addColorStop(u, 'hsla(' + (u * 288).toFixed(0) + ',58%,76%,' + al2.toFixed(3) + ')');
        }
        outline(path, nor, b0, b1, wAt);
        ctx.fillStyle = g;
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(tick);
  }

  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  window.addEventListener('mousemove', function (e) {
    var x = e.clientX, y = e.clientY;
    if (pts.length) {
      // 最新那个点始终钉在光标上，A 端不会有任何滞后
      pts[pts.length - 1].x = x;
      pts[pts.length - 1].y = y;
      pts[pts.length - 1].t = performance.now();
    }
    if (lastX !== null) {
      var dx = x - lastX, dy = y - lastY;
      if (dx * dx + dy * dy < 6) { kick(); return; }
    }
    lastX = x; lastY = y;
    pts.push({ x: x, y: y, t: performance.now() });
    if (pts.length > MAXPT) pts.shift();
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
