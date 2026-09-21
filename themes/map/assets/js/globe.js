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
  var theta = -60;                 // 起始角度：正对亚洲/非洲这一侧，大陆看得清楚
  var autoRotate = !reduceMotion;
  // ?rotate=90 可以直接打开某个角度（方便分享特定视角，也便于自检）
  try {
    var rq = new URLSearchParams(window.location.search).get('rotate');
    if (rq !== null && rq !== '' && !isNaN(parseFloat(rq))) { theta = parseFloat(rq); autoRotate = false; }
  } catch (e) {}
  var active = false, dragging = false, lastX = 0, moved = 0;

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
  var coastPaths = [];
  if (coastG) {
    rings.forEach(function () {
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
  items.forEach(function (it, k) {
    var slot = slotOrder[k];
    if (slot != null && pieces[slot]) pieces[slot].item = it;
  });

  var TAB = 7;
  function tabBump(t) {
    return (t > 0.4 && t < 0.6) ? Math.sin((t - 0.4) / 0.2 * Math.PI) * TAB : 0;
  }
  var SAMPLES = 14;
  function outline(pc) {
    var pts = [], n, t;
    for (n = 0; n <= SAMPLES; n++) { t = n / SAMPLES; pts.push([pc.lat1, pc.lon1 + (pc.lon2 - pc.lon1) * t]); }
    for (n = 1; n <= SAMPLES; n++) { t = n / SAMPLES; pts.push([pc.lat1 + (pc.lat2 - pc.lat1) * t, pc.lon2 + tabBump(t)]); }
    for (n = 1; n <= SAMPLES; n++) { t = n / SAMPLES; pts.push([pc.lat2, pc.lon2 - (pc.lon2 - pc.lon1) * t]); }
    for (n = 1; n < SAMPLES; n++) { t = n / SAMPLES; pts.push([pc.lat2 + (pc.lat1 - pc.lat2) * t, pc.lon1 + tabBump(t)]); }
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
      var t = el('title');
      t.textContent = pc.item.title + ' · 进入板块';
      a.appendChild(t); a.appendChild(path);
      if (icon) a.appendChild(icon);
      g.appendChild(a);
    } else {
      g.appendChild(path);
    }
    piecesG.appendChild(g);
    return { g: g, path: path, icon: icon, pc: pc, item: pc.item, cz: -1 };
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
      if (zOf(rg.clat, rg.clon) < -0.12) { coastPaths[i].style.visibility = 'hidden'; continue; }
      var d = '', run = [], k, s;
      for (k = 0; k < rg.pts.length; k++) {
        s = screen(rg.pts[k][0], rg.pts[k][1]);
        if (s.z >= 0) run.push(s);
        else { if (run.length > 1) d += smoothRun(run); run = []; }
      }
      if (run.length > 1) d += smoothRun(run);
      coastPaths[i].setAttribute('d', d);
      coastPaths[i].style.visibility = d ? 'visible' : 'hidden';
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
  function drawPieces() {
    nodes.forEach(function (n, idx) {
      var pts = outline(n.pc);
      var d = '';
      var sx = 0, sy = 0, k, s;
      var maxZ = -1;
      var screenPts = [];
      for (k = 0; k < pts.length; k++) {
        s = screen(pts[k][0], pts[k][1]);
        screenPts.push(s);
        if (s.z > maxZ) maxZ = s.z;      // 片区任意一部分还在正面就算可见
        sx += s.x; sy += s.y;
        d += (k ? 'L' : 'M') + s.x.toFixed(1) + ' ' + s.y.toFixed(1);
      }
      n.path.setAttribute('d', d + 'Z');

      var c = screen((n.pc.lat1 + n.pc.lat2) / 2, (n.pc.lon1 + n.pc.lon2) / 2);
      n.cz = c.z;

      // 文字/图标不跟球面弯，那就越靠边越淡，到球体轮廓处正好淡成 0
      var fade = Math.max(0, Math.min(1, (c.z - 0.2) / 0.42));
      // 只要片区还有一部分朝向观众就画（透明度不变，像海岸线那样转过去而已）
      var front = maxZ > 0.02;
      var show = front && fade > 0.04;

      n.path.style.visibility = front ? 'visible' : 'hidden';
      n.g.style.pointerEvents = front ? 'auto' : 'none';

      // 渐变跟着片区走：中心在片区重心，半径约到片区边缘 → 颜色从中心向外淡出
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
        // 半径必须有下限：贴到球体边缘时投影会退化，r=0 的渐变会让整块闪没
        var rr = rmax > 2 ? rmax * 0.82 : 2;
        gr.setAttribute('r', rr.toFixed(1));
      }

      if (!n.icon) return;
      n.icon.style.visibility = show ? 'visible' : 'hidden';
      if (!show) return;
      n.icon.style.opacity = fade.toFixed(2);
      var size = 58 + fade * 40;
      var sc = size / 24;
      n.icon.setAttribute('transform',
        'translate(' + c.x.toFixed(1) + ',' + c.y.toFixed(1) + ') scale(' + sc.toFixed(2) + ') translate(-12,-12)');
    });

    // 远的先画、近的后画，避免球体边缘互相压盖
    var order = nodes.slice().sort(function (a, b) { return a.cz - b.cz; });
    // 签名要跟着真实深度变，否则片区的绘制顺序永远停在第一帧（转到边缘会互相压盖、看着像跳）
    var sig = order.map(function (n) { return n.pc.lon1 + ':' + n.pc.lat1 + ':' + n.cz.toFixed(3); }).join('|');
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
      if (k < 1) requestAnimationFrame(step);
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
    if (active && autoRotate && !dragging) { theta += 0.04; render(); }
    requestAnimationFrame(loop);
  })();

  render();
})();
