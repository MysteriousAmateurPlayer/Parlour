/* ==========================================================================
   地球仪：正交投影的手绘 SVG 球体
   --------------------------------------------------------------------------
   · 球面按「纬度带 × 经度格」切成一块块拼图般的片区，交错排列
   · 每个片区对应一个板块（数据来自 data/sections.yaml，写在 #globe-data 里）
   · 多出来的片区留空（虚线淡描），以后加板块会自动填进去
   · 交互：鼠标/手指拖动 = 沿地轴旋转；左右按钮 = 一格一格转；未交互时缓慢自转
   · 零依赖，不加载任何三维库；读屏/无脚本用户还有下面的文字索引兜底
   ========================================================================== */
(function () {
  'use strict';

  var dataEl = document.getElementById('globe-data');
  var stage = document.getElementById('globe-stage');
  var gridG = document.getElementById('globe-grid');
  var piecesG = document.getElementById('globe-pieces');
  if (!dataEl || !stage || !gridG || !piecesG) return;

  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var CX = parseFloat(stage.getAttribute('data-cx')) || 600;
  var CY = parseFloat(stage.getAttribute('data-cy')) || 380;
  var R = parseFloat(stage.getAttribute('data-r')) || 250;

  var items = (data.sections || []).slice();
  var cols = Math.max(2, parseInt(data.cols, 10) || 4);
  var capacity = Math.max(items.length, parseInt(data.capacity, 10) || 12, cols * 2);
  var rows = Math.max(2, Math.ceil(capacity / cols));

  var LAT_TOP = 68;
  var LAT_BOTTOM = -68;
  var bandH = (LAT_TOP - LAT_BOTTOM) / rows;
  var lonW = 360 / cols;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var theta = -90;                // 起始角度：让第 0、1 列（也就是全部板块）正对观众
  var autoRotate = !reduceMotion;
  var active = false;
  var dragging = false;
  var lastX = 0;
  var moved = 0;

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
    var k = (u.z < 0 && d > 0) ? 1 / d : 1;    // 背面的点压到球体轮廓上
    return { x: CX + R * u.x * k, y: CY - R * u.y * k, z: u.z };
  }

  /* ---------- 片区定义（纬度带 × 经度格，交错半格） ---------- */
  var pieces = [];
  for (var i = 0; i < rows * cols; i++) {
    var row = Math.floor(i / cols);
    var col = i % cols;
    var lat1 = LAT_TOP - row * bandH;
    var offset = (row % 2) ? lonW / 2 : 0;
    pieces.push({
      lat1: lat1, lat2: lat1 - bandH,
      lon1: col * lonW + offset, lon2: col * lonW + offset + lonW,
      item: null
    });
  }

  // 板块按「列优先」落位：这样起始角度下所有板块都在正面，不用先转一圈去找
  var slotOrder = [];
  for (var c0 = 0; c0 < cols; c0++) for (var r0 = 0; r0 < rows; r0++) slotOrder.push(r0 * cols + c0);
  items.forEach(function (it, k) {
    var slot = slotOrder[k];
    if (slot != null && pieces[slot]) pieces[slot].item = it;
  });

  // 拼图的凹凸：左右两条经线边上加一个半圆凸起（相邻两格共用同一条曲线，所以能咬合）
  var TAB = 7;
  function tabBump(t) {
    return (t > 0.4 && t < 0.6) ? Math.sin((t - 0.4) / 0.2 * Math.PI) * TAB : 0;
  }

  var SAMPLES = 14;
  function outline(pc) {
    var pts = [], n, t;
    for (n = 0; n <= SAMPLES; n++) {           // 上边（直的）
      t = n / SAMPLES; pts.push([pc.lat1, pc.lon1 + (pc.lon2 - pc.lon1) * t]);
    }
    for (n = 1; n <= SAMPLES; n++) {           // 右边（带凸起）
      t = n / SAMPLES; pts.push([pc.lat1 + (pc.lat2 - pc.lat1) * t, pc.lon2 + tabBump(t)]);
    }
    for (n = 1; n <= SAMPLES; n++) {           // 下边（直的）
      t = n / SAMPLES; pts.push([pc.lat2, pc.lon2 - (pc.lon2 - pc.lon1) * t]);
    }
    for (n = 1; n < SAMPLES; n++) {            // 左边（同一条曲线 → 咬合）
      t = n / SAMPLES; pts.push([pc.lat2 + (pc.lat1 - pc.lat2) * t, pc.lon1 + tabBump(t)]);
    }
    return pts;
  }

  /* ---------- 建 DOM（一次），之后每帧只改属性 ---------- */
  var gridPaths = [];
  for (var r = 0; r <= rows; r++) gridPaths.push(el('path', { 'class': 'globe__line' }));
  for (var m = 0; m < cols * 2; m++) gridPaths.push(el('path', { 'class': 'globe__line globe__line--meridian' }));
  gridPaths.forEach(function (p) { gridG.appendChild(p); });

  var nodes = pieces.map(function (pc) {
    var g = el('g', { 'class': 'globe__cell' });
    var path = el('path', { 'class': 'globe__piece' + (pc.item ? '' : ' globe__piece--empty') });
    var text = el('text', { 'class': 'globe__label', 'text-anchor': 'middle' });
    if (pc.item) {
      text.textContent = pc.item.title;
      path.style.setProperty('--cell-accent', pc.item.accent);
      var a = el('a', { 'class': 'globe__link', href: pc.item.href, 'aria-label': pc.item.title + '：进入这个板块' });
      var t = el('title');
      t.textContent = pc.item.title + ' · 进入板块';
      a.appendChild(t);
      a.appendChild(path);
      a.appendChild(text);
      g.appendChild(a);
    } else {
      g.appendChild(path);
      g.appendChild(text);
    }
    piecesG.appendChild(g);
    return { g: g, path: path, text: text, pc: pc, item: pc.item, cz: -1 };
  });

  /* ---------- 每帧更新 ---------- */
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
    nodes.forEach(function (n) {
      var pts = outline(n.pc);
      var d = '';
      for (var k = 0; k < pts.length; k++) {
        var s = screen(pts[k][0], pts[k][1]);
        d += (k ? 'L' : 'M') + s.x.toFixed(1) + ' ' + s.y.toFixed(1);
      }
      n.path.setAttribute('d', d + 'Z');

      var c = screen((n.pc.lat1 + n.pc.lat2) / 2, (n.pc.lon1 + n.pc.lon2) / 2);
      n.cz = c.z;
      // 文字不跟球面弯，那就越靠边越淡，到球体轮廓处正好淡成 0
      // （否则横平竖直的字贴在球体边缘很难看）
      var fade = Math.max(0, Math.min(1, (c.z - 0.16) / 0.42));
      var front = c.z > 0.02;
      var show = front && fade > 0.04;

      n.path.style.visibility = front ? 'visible' : 'hidden';
      n.g.style.pointerEvents = front ? 'auto' : 'none';
      n.text.style.visibility = show ? 'visible' : 'hidden';
      if (!show) return;

      n.text.setAttribute('x', c.x.toFixed(1));
      n.text.setAttribute('y', (c.y + 1).toFixed(1));
      n.text.setAttribute('font-size', (17 + fade * 9).toFixed(1));
      n.text.style.opacity = fade.toFixed(2);
    });

    // 远的先画、近的后画，避免球体边缘互相压盖
    var order = nodes.slice().sort(function (a, b) { return a.cz - b.cz; });
    var sig = order.map(function (n) { return n.pc.lon1 + ':' + n.pc.lat1; }).join('|');
    if (sig !== lastOrder) {
      lastOrder = sig;
      order.forEach(function (n) { piecesG.appendChild(n.g); });
    }
  }

  function render() { drawGrid(); drawPieces(); }

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
  // 拖动结束的那一下不要误触"进入板块"
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
    }, { threshold: 0.12 }).observe(host);
  } else {
    active = true;
  }

  (function loop() {
    if (active && autoRotate && !dragging) { theta += 0.05; render(); }
    requestAnimationFrame(loop);
  })();

  render();
})();
