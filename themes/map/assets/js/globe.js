/* ==========================================================================
   地球仪：正交投影的手绘 SVG 球体
   --------------------------------------------------------------------------
   · 球面有真实海岸线（world-data.js，简化自 Natural Earth 公共领域数据）
   · 再加一层「拼图式片区」：每个片区是一个板块，用柔和渐变上色（边缘不突变），
     片区里放该板块的图标；空位留给以后的板块
   · 交互：鼠标/手指拖动 = 沿地轴旋转；左右按钮 = 一格一格转；未交互时缓慢自转
   · 零依赖；读屏/无脚本用户有下面的文字索引兜底
   ========================================================================== */
(function () {
  'use strict';

  var dataEl = document.getElementById('globe-data');
  var stage = document.getElementById('globe-stage');
  var gridG = document.getElementById('globe-grid');
  var piecesG = document.getElementById('globe-pieces');
  var coastG = document.getElementById('globe-coasts');
  if (!dataEl || !stage || !gridG || !piecesG) return;

  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var CX = parseFloat(stage.getAttribute('data-cx')) || 550;
  var CY = parseFloat(stage.getAttribute('data-cy')) || 430;
  var R = parseFloat(stage.getAttribute('data-r')) || 400;

  var items = (data.sections || []).slice();
  var cols = Math.max(2, parseInt(data.cols, 10) || 4);
  var capacity = Math.max(items.length, parseInt(data.capacity, 10) || 12, cols * 2);
  var rows = Math.max(2, Math.ceil(capacity / cols));

  var LAT_TOP = 78;                // 片区一直铺到接近极地，首屏球冠里也能看到板块
  var LAT_BOTTOM = -78;
  var bandH = (LAT_TOP - LAT_BOTTOM) / rows;
  var lonW = 360 / cols;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* ---------- 按时间显示当季星座（每季 2 个拱极 + 5 个当季，沿圆周均匀分布） ---------- */
  function applySeason() {
    var groups = document.querySelectorAll('.sky-season');
    if (!groups.length) return;
    var want = null;
    try { want = new URLSearchParams(window.location.search).get('season'); } catch (e) {}
    if (!want) {
      var m = new Date().getMonth() + 1;
      want = (m >= 3 && m <= 5) ? 'spring' : (m >= 6 && m <= 8) ? 'summer' : (m >= 9 && m <= 11) ? 'autumn' : 'winter';
    }
    Array.prototype.forEach.call(groups, function (g) {
      if (g.getAttribute('data-season') === want) g.classList.add('is-active');
      else g.classList.remove('is-active');
    });
  }
  applySeason();


  var autoRotate = !reduceMotion;
  var theta = -90;                // 地球初始角度：让有内容的片区正对观众
  /* ① 自动旋转用"速度模型"而不是直接改角度：
     每帧把当前角速度缓动逼近目标角速度，于是启动与停止都是丝滑的加减速。 */
  var spinVel = 0;                // 当前角速度
  var spinTarget = 0;             // 目标角速度
  var SPIN_BASE = 0.05;           // 默认转速（原 0.04 的 1.25 倍）
  // ?rotate=90 可以直接打开某个角度（方便分享特定视角，也便于自检）
  try {
    var rq = new URLSearchParams(window.location.search).get('rotate');
    if (rq !== null && rq !== '' && !isNaN(parseFloat(rq))) { theta = parseFloat(rq); autoRotate = false; }
  } catch (e) {}
  var active = false, dragging = false, lastX = 0, moved = 0;
  var resumeTimer = null;
  /* 手动拖动或按钮转动后，停手一会儿就恢复默认的缓慢自转 */
  function scheduleResume() {
    if (reduceMotion) return;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () { autoRotate = true; }, 3200);
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ---------- 投影（正交） ---------- */
  function unit(lat, lon) {
    var p = lat * Math.PI / 180;
    var l = (lon + theta) * Math.PI / 180;
    return { x: Math.cos(p) * Math.sin(l), y: Math.sin(p), z: Math.cos(p) * Math.cos(l) };
  }
  function screen(lat, lon) {
    var u = unit(lat, lon);
    var d = Math.sqrt(u.x * u.x + u.y * u.y);
    var k = (u.z < 0 && d > 0) ? 1 / d : 1;      // 背面的点压到球体轮廓上
    return { x: CX + R * u.x * k, y: CY - R * u.y * k, z: u.z };
  }
  function zOf(lat, lon) {
    var p = lat * Math.PI / 180, l = (lon + theta) * Math.PI / 180;
    return Math.cos(p) * Math.cos(l);
  }

  /* ---------- ① 海岸线 ---------- */
  var rings = [];
  (window.MAP_WORLD || []).forEach(function (s) {
    var pts = [], sum = [0, 0];
    s.split(';').forEach(function (pair) {
      var ab = pair.split(',');
      var lon = parseFloat(ab[0]), lat = parseFloat(ab[1]);
      if (isNaN(lon) || isNaN(lat)) return;
      pts.push([lat, lon]);
      sum[0] += lat; sum[1] += lon;
    });
    if (pts.length < 3) return;
    rings.push({ pts: pts, clat: sum[0] / pts.length, clon: sum[1] / pts.length });
  });
  var coastPaths = [], coastWash = [];
  var washG = document.getElementById('globe-coast-wash');
  if (coastG) {
    rings.forEach(function () {
      if (washG) {
        var w = el('path', { 'class': 'globe__coast-wash' });
        washG.appendChild(w);
        coastWash.push(w);
      }
      var p = el('path', { 'class': 'globe__coast' });
      coastG.appendChild(p);
      coastPaths.push(p);
    });
  }

  /* ---------- ② 片区（含拼图凹凸） ---------- */
  var pieces = [];
  for (var i = 0; i < rows * cols; i++) {
    var row = Math.floor(i / cols), col = i % cols;
    var lat1 = LAT_TOP - row * bandH;
    var offset = (row % 2) ? lonW / 2 : 0;
    pieces.push({
      lat1: lat1, lat2: lat1 - bandH,
      lon1: col * lonW + offset, lon2: col * lonW + offset + lonW,
      item: null
    });
  }
  // 板块按「列优先」落位：起始角度下所有板块都在正面
  var slotOrder = [];
  for (var c0 = 0; c0 < cols; c0++) for (var r0 = 0; r0 < rows; r0++) slotOrder.push(r0 * cols + c0);
  /* ④ 每个板块在地球上出现两份，而且两份的经纬度都不同：
     原槽位 + "下一行、隔两列"的槽位（行/列都变 → 经纬度都不同）。 */
  var placements = items.map(function (it, k) { return { it: it, slot: slotOrder[k] }; });
  items.forEach(function (it, k) {
    var s0 = slotOrder[k];
    if (s0 == null) return;
    var row = Math.floor(s0 / cols), col = s0 % cols;
    var s2 = ((row + 1) % rows) * cols + ((col + 2) % cols);
    if (s2 === s0) return;
    if (placements.some(function (p) { return p.slot === s2; })) return;
    placements.push({ it: it, slot: s2 });
  });
  placements.forEach(function (p) { if (p.slot != null && pieces[p.slot]) pieces[p.slot].item = p.it; });
  console.log('[地球] 板块落位：' + placements.map(function (p) { return p.it.title + '@' + p.slot; }).join('、'));

  var TAB = 7;
  function tabBump(t) {
    return (t > 0.4 && t < 0.6) ? Math.sin((t - 0.4) / 0.2 * Math.PI) * TAB : 0;
  }
  var SAMPLES = 14;

  /* 可见范围在经纬度上就是个区间：(lon + theta) ∈ [-90°, 90°]。
     所以把片区的经度区间与它求交，按交出来的矩形采样边界即可：
       · 不需要裁剪、不需要补弧，永远不会自交
       · 沿经线的那两条边投影出来正好落在球体轮廓上（z=0），边缘天然正确 */
  function cellOutline(pc) {
    var L1 = pc.lon1 + theta, L2 = pc.lon2 + theta;
    var mid = (L1 + L2) / 2;
    var k = Math.round(mid / 360) * 360;
    L1 -= k; L2 -= k;
    if (L2 < -90 || L1 > 90) return null;              // 整块都在背面
    var a = Math.max(L1, -90), b = Math.min(L2, 90);
    if (b - a < 0.05) return null;                     // 只剩一条线
    var leftClip = a > L1 + 1e-6, rightClip = b < L2 - 1e-6;
    var lonA = a - theta, lonB = b - theta;
    var pts = [], n, t, S = SAMPLES;
    for (n = 0; n <= S; n++) { t = n / S; pts.push([pc.lat1, lonA + (lonB - lonA) * t]); }
    for (n = 1; n <= S; n++) { t = n / S; pts.push([pc.lat1 + (pc.lat2 - pc.lat1) * t, lonB + (rightClip ? 0 : tabBump(t))]); }
    for (n = 1; n <= S; n++) { t = n / S; pts.push([pc.lat2, lonB - (lonB - lonA) * t]); }
    for (n = 1; n < S; n++) { t = n / S; pts.push([pc.lat2 + (pc.lat1 - pc.lat2) * t, lonA + (leftClip ? 0 : tabBump(t))]); }
    return pts;
  }

  /* ---------- 建 DOM（一次），之后每帧只改属性 ---------- */
  var gridPaths = [];
  for (var r = 0; r <= rows; r++) gridPaths.push(el('path', { 'class': 'globe__line' }));
  for (var m = 0; m < cols * 2; m++) gridPaths.push(el('path', { 'class': 'globe__line globe__line--meridian' }));
  gridPaths.forEach(function (p) { gridG.appendChild(p); });

  // 每个片区一条柔和的径向渐变（中心有颜色、边缘淡到 0，避免边缘突变）
  var defs = el('defs', {});
  (stage.ownerSVGElement || stage).insertBefore(defs, stage);
  var grads = pieces.map(function (pc, idx) {
    var g = el('radialGradient', { id: 'piece-grad-' + idx, gradientUnits: 'userSpaceOnUse', cx: CX, cy: CY, r: R });
    var a = pc.item ? pc.item.accent : null;
    var s1 = el('stop', { offset: '0.2', 'stop-color': a || 'currentColor', 'stop-opacity': a ? 0.34 : 0.1 });
    var s2 = el('stop', { offset: '1', 'stop-color': a || 'currentColor', 'stop-opacity': 0 });
    g.appendChild(s1); g.appendChild(s2);
    defs.appendChild(g);
    return g;
  });

  var nodes = pieces.map(function (pc, idx) {
    var g = el('g', { 'class': 'globe__cell' });
    var path = el('path', {
      'class': 'globe__piece' + (pc.item ? '' : ' globe__piece--empty'),
      fill: pc.item ? 'url(#piece-grad-' + idx + ')' : 'none'
    });
    var icon = pc.item ? el('use', {
      'class': 'globe__icon',
      href: '#globe-icon-' + pc.item.key
    }) : null;

    if (pc.item) {
      var a = el('a', { 'class': 'globe__link', href: pc.item.href, 'aria-label': pc.item.title + '：进入这个板块' });
      a.setAttribute('data-name', pc.item.title);
      a.appendChild(path);
      if (icon) a.appendChild(icon);
      g.appendChild(a);
    } else {
      g.appendChild(path);
    }
    piecesG.appendChild(g);
    return { g: g, path: path, icon: icon, pc: pc, item: pc.item, cz: -1, wasFront: null };
  });

  /* ---------- 每帧更新 ---------- */
  // 把一段连续可见的点画成平滑曲线（Catmull-Rom 转三次贝塞尔），海岸线就不会那么锐利
  function smoothRun(run) {
    if (run.length < 2) return '';
    if (run.length === 2) return 'M' + run[0].x.toFixed(1) + ' ' + run[0].y.toFixed(1) + 'L' + run[1].x.toFixed(1) + ' ' + run[1].y.toFixed(1);
    var d = 'M' + run[0].x.toFixed(1) + ' ' + run[0].y.toFixed(1);
    for (var i = 0; i < run.length - 1; i++) {
      var p0 = run[i - 1] || run[i], p1 = run[i], p2 = run[i + 1], p3 = run[i + 2] || p2;
      var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += 'C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
    }
    return d;
  }

  function drawCoasts() {
    for (var i = 0; i < rings.length; i++) {
      var rg = rings[i];
      // 不能按"整环重心"剔除：非洲/欧亚这种大环的重心离环本身很远，
      // 重心一转过去整条海岸线就会被误隐藏（看着像非洲突然消失）。
      // 这里逐点判定，只画朝向观众的那几段。
      var d = '', run = [], k, s;
      for (k = 0; k < rg.pts.length; k++) {
        s = screen(rg.pts[k][0], rg.pts[k][1]);
        if (s.z >= 0) run.push(s);
        else { if (run.length > 1) d += smoothRun(run); run = []; }
      }
      if (run.length > 1) d += smoothRun(run);
      coastPaths[i].setAttribute('d', d);
      coastPaths[i].style.visibility = d ? 'visible' : 'hidden';
      if (coastWash[i]) {                       // ③ 底衬：沙色晕染，做出复古地表的厚度
        coastWash[i].setAttribute('d', d);
        coastWash[i].style.visibility = d ? 'visible' : 'hidden';
      }
    }
  }

  function drawGrid() {
    var i, j, d, s, visible;
    for (i = 0; i <= rows; i++) {
      var lat = LAT_TOP - i * bandH;
      d = ''; visible = false;
      for (j = 0; j <= 72; j++) {
        s = screen(lat, j * 5);
        if (s.z >= 0) { d += (visible ? 'L' : 'M') + s.x.toFixed(1) + ' ' + s.y.toFixed(1); visible = true; }
        else visible = false;
      }
      gridPaths[i].setAttribute('d', d);
    }
    for (i = 0; i < cols * 2; i++) {
      var lon = i * (lonW / 2);
      d = ''; visible = false;
      for (j = 0; j <= 40; j++) {
        s = screen(LAT_BOTTOM + (LAT_TOP - LAT_BOTTOM) * (j / 40), lon);
        if (s.z >= 0) { d += (visible ? 'L' : 'M') + s.x.toFixed(1) + ' ' + s.y.toFixed(1); visible = true; }
        else visible = false;
      }
      gridPaths[rows + 1 + i].setAttribute('d', d);
    }
  }

  var lastOrder = '';

  function polyArea(poly) {
    var s = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  }
  function toPath(poly) {
    var d = 'M' + poly[0].x.toFixed(1) + ' ' + poly[0].y.toFixed(1);
    for (var i = 1; i < poly.length; i++) d += 'L' + poly[i].x.toFixed(1) + ' ' + poly[i].y.toFixed(1);
    return d + 'Z';
  }

  function drawPieces() {
    nodes.forEach(function (n, idx) {
      var pts = cellOutline(n.pc);
      if (!pts) {
        if (n.wasFront !== false) {
          n.path.style.visibility = 'hidden';
          n.g.style.pointerEvents = 'none';
          if (n.icon) n.icon.style.visibility = 'hidden';
          n.wasFront = false;
        }
        return;
      }
      if (n.wasFront !== true) {
        n.path.style.visibility = 'visible';
        n.g.style.pointerEvents = 'auto';
        n.wasFront = true;
      }

      // 投影 + 生成路径（不做任何裁剪，交出来的矩形本身就是可见区域）
      var screenPts = [], sx = 0, sy = 0, k, s;
      for (k = 0; k < pts.length; k++) {
        s = screen(pts[k][0], pts[k][1]);
        screenPts.push(s);
        sx += s.x; sy += s.y;
      }
      n.path.setAttribute('d', toPath(screenPts));

      var c = screen((n.pc.lat1 + n.pc.lat2) / 2, (n.pc.lon1 + n.pc.lon2) / 2);
      n.cz = c.z;
      var fade = Math.max(0, Math.min(1, (c.z - 0.2) / 0.42));

      if (n.item) {
        var mx = sx / screenPts.length, my = sy / screenPts.length;
        var rmax = 1;
        for (k = 0; k < screenPts.length; k++) {
          var dd = Math.hypot(screenPts[k].x - mx, screenPts[k].y - my);
          if (dd > rmax) rmax = dd;
        }
        var gr = grads[idx];
        gr.setAttribute('cx', mx.toFixed(1));
        gr.setAttribute('cy', my.toFixed(1));
        gr.setAttribute('r', (rmax > 2 ? rmax * 0.82 : 2).toFixed(1));
      }

      if (!n.icon) return;
      var show = fade > 0.04;
      n.icon.style.visibility = show ? 'visible' : 'hidden';
      if (!show) return;
      n.icon.style.opacity = fade.toFixed(2);
      var size = 58 + fade * 40;
      var sc = size / 24;
      n.icon.setAttribute('transform',
        'translate(' + c.x.toFixed(1) + ',' + c.y.toFixed(1) + ') scale(' + sc.toFixed(2) + ') translate(-12,-12)');
    });

    // 远的先画、近的后画（签名只用身份序列：相对顺序变了才动 DOM）
    var order = nodes.slice().sort(function (a, b) { return a.cz - b.cz; });
    var sig = order.map(function (n) { return n.pc.lon1 + ':' + n.pc.lat1; }).join('|');
    if (sig !== lastOrder) {
      lastOrder = sig;
      order.forEach(function (n) { piecesG.appendChild(n.g); });
    }
  }

  function render() { drawCoasts(); drawGrid(); drawPieces(); }

  /* ---------- 拖动旋转 ---------- */
  stage.addEventListener('pointerdown', function (e) {
    dragging = true; moved = 0; lastX = e.clientX; autoRotate = false;
    stage.classList.add('is-dragging');
    if (stage.setPointerCapture) { try { stage.setPointerCapture(e.pointerId); } catch (err) {} }
  });
  window.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX;
    lastX = e.clientX;
    moved += Math.abs(dx);
    theta += dx * (90 / R) * 0.9;
    render();
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    window.addEventListener(ev, function () {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('is-dragging');
      scheduleResume();
    });
  });
  piecesG.addEventListener('click', function (e) {
    if (moved > 6) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ---------- 按钮：一格一格转 ---------- */
  function tweenTo(target) {
    if (reduceMotion) { theta = target; render(); return; }
    var start = theta, t0 = performance.now(), dur = 520;
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      theta = start + (target - start) * e;
      render();
      if (k < 1) requestAnimationFrame(step); else scheduleResume();
    })(t0);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-globe-rotate]'), function (btn) {
    btn.addEventListener('click', function () {
      autoRotate = false;
      var dir = parseFloat(btn.getAttribute('data-globe-rotate')) || 1;
      tweenTo(theta + dir * lonW);
    });
  });

  /* ---------- 只在可见时自转（省电） ---------- */
  var host = stage.closest ? (stage.closest('.globe-band') || stage) : stage;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        active = en.isIntersecting;
        if (active) render();
      });
    }, { threshold: 0.1 }).observe(host);
  } else {
    active = true;
  }

  (function loop() {
    spinTarget = (active && autoRotate && !dragging) ? SPIN_BASE : 0;
    if (Math.abs(spinVel - spinTarget) > 1e-4) {
      spinVel += (spinTarget - spinVel) * 0.045;      // 指数缓动：起停都丝滑
      theta += spinVel;
      render();
    } else if (Math.abs(spinVel) > 1e-4) {
      spinVel = spinTarget;
      theta += spinVel;
      render();
    }
    requestAnimationFrame(loop);
  })();



  render();
})();

/* ==========================================================================
   太阳星轨：刻度与天体沿椭圆运行
   --------------------------------------------------------------------------
   椭圆不是旋转对称的，所以不能靠"绕中心旋转"来动它们（会跑离轨道、还会被压扁）。
   这里直接按参数角算位置：P(a) = (cx + rx·cos a, cy + ry·sin a)，
   并把刻度按椭圆法线取向（θ = atan2(rx·sin a, ry·cos a)）。
   ========================================================================== */
(function () {
  var svg = document.querySelector('.hero__star-ring');
  if (!svg) return;
  var items = svg.querySelectorAll('.ring-item');
  if (!items.length) return;

  var sunRsvg = -1;
  var occludePath = svg.querySelector('#sun-occlude-path');
  /* 把"太阳上半盘"作为遮罩：远侧内容落进这里就不画（近侧仍可压在太阳上） */
  function updateOcclude() {
    if (!occludePath) return;
    var disc = document.querySelector('.sun-disc');
    var layer = svg.getBoundingClientRect();
    if (!disc || !layer.width) { occludePath.setAttribute('d', ''); return; }
    var r = (disc.getBoundingClientRect().width / 2) * (1636 / layer.width);   // 换成 SVG 用户单位
    sunRsvg = r;
    occludePath.setAttribute('d', 'M' + (CX - r).toFixed(1) + ' ' + CY + 'A' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 0 1 ' + (CX + r).toFixed(1) + ' ' + CY + 'Z');
  }
  var CX = parseFloat(svg.getAttribute('data-cx')) || 800;
  var CY = parseFloat(svg.getAttribute('data-cy')) || 280;
  var orbits = {
    outer: (svg.getAttribute('data-outer') || '806,236').split(',').map(Number),
    main: (svg.getAttribute('data-main') || '740,215').split(',').map(Number),
    inner: (svg.getAttribute('data-inner') || '566,168').split(',').map(Number)
  };
  var list = Array.prototype.map.call(items, function (el) {
    var o = orbits[el.getAttribute('data-orbit')] || orbits.main;
    // 刻度要贴着椭圆法线；天体/公式这类装饰只轻微倾斜，保持可读
    var glyph = !!el.querySelector('.ring-glyph, .ring-dot');
    var sp = parseFloat(el.getAttribute('data-sp'));
    return {
      el: el, rx: o[0], ry: o[1], a: parseFloat(el.getAttribute('data-a')) || 0,
      glyph: glyph,
      bob: el.getAttribute('data-bob') === '1',
      tilt: parseFloat(el.getAttribute('data-tilt')) || 0,   // 固定倾角：旋转时朝向不变
      axis: el.getAttribute('data-kind') === 'axis',
      sp: isNaN(sp) ? 1 : sp          // 星尘速度略有差异 → 缓慢流动
    };
  });

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t = 0, visible = false, last = 0;

  function draw(now) {
    if (now == null) now = 0;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var a = it.a + t * it.sp;
      if (it.axis) {
        // 太阳盘面半径（换成 SVG 单位）：背面的轴线落进盘面就不画 → 不会被太阳"穿透"
        if (sunRsvg < 0) {
          var disc = document.querySelector('.sun-disc');
          var layer = svg.getBoundingClientRect();
          sunRsvg = (disc && layer.width) ? (disc.getBoundingClientRect().width / 2) * (1600 / layer.width) : 0;
        }
        // 四条轴线：两端贴内外椭圆，随环一起转，看起来就是被压扁在椭圆上运动
        var oi = orbits.inner, oo = orbits.outer;
        var ax1 = CX + oi[0] * 0.6 * Math.cos(a), ay1 = CY + oi[1] * 0.6 * Math.sin(a);
        var ax2 = CX + oo[0] * 1.008 * Math.cos(a), ay2 = CY + oo[1] * 1.008 * Math.sin(a);
        var mx = ax1 + (ax2 - ax1) * 0.74, my = ay1 + (ay2 - ay1) * 0.74;
        var d = 'M' + ax1.toFixed(1) + ' ' + ay1.toFixed(1) + 'L' + ax2.toFixed(1) + ' ' + ay2.toFixed(1) +
                'M' + (mx - 5).toFixed(1) + ' ' + my.toFixed(1) + 'H' + (mx + 5).toFixed(1);
        it.el.firstChild.setAttribute('d', d);
        continue;
      }
      var x = CX + it.rx * Math.cos(a);
      var y = CY + it.ry * Math.sin(a);
      // 沿环做正弦上下浮动：相位随角度累进，整整一圈正好 7 个波长
      if (it.bob) y += 9 * Math.sin(7 * a + now * 0.0006);
      var th = Math.atan2(it.rx * Math.sin(a), it.ry * Math.cos(a)) * 180 / Math.PI;
      it.el.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') rotate(' + (it.glyph ? it.tilt : th).toFixed(2) + ')');
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { visible = e.isIntersecting; });
    }, { threshold: 0 }).observe(svg);
  } else { visible = true; }

  function loop(now) {
    if (visible && !reduce) {
      if (!last) last = now;
      var dt = Math.min(100, now - last);
      last = now;
      t += dt * (Math.PI * 2 / 300000);   // 一圈 5 分钟
      draw(now);
    } else { last = 0; }
    requestAnimationFrame(loop);
  }
  updateOcclude();
  draw(0);
  requestAnimationFrame(loop);
})();

/* ==========================================================================
   悬停名牌：星座名 / 板块名（替换浏览器默认 tooltip）
   ========================================================================== */
(function () {
  var tip = document.createElement('div');
  tip.className = 'hover-tip';
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);
  var cur = null;

  function show(el) {
    var name = el.getAttribute('data-name');
    if (!name) return;
    tip.textContent = name;
    tip.classList.add('is-on');
    cur = el;
  }
  function hide() { tip.classList.remove('is-on'); cur = null; }
  function move(e) {
    if (!tip.classList.contains('is-on')) return;
    var pad = 14;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var x = e.clientX + 16, y = e.clientY + 18;
    if (x + w + pad > window.innerWidth) x = e.clientX - w - 16;
    if (y + h + pad > window.innerHeight) y = e.clientY - h - 20;
    tip.style.transform = 'translate(' + Math.max(pad, x) + 'px,' + Math.max(pad, y) + 'px)';
  }

  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest ? e.target.closest('[data-name]') : null;
    if (el) { if (el !== cur) show(el); move(e); } else hide();
  });
  document.addEventListener('mousemove', move);
  window.addEventListener('scroll', hide, { passive: true });
  document.addEventListener('mouseleave', hide);
})();
