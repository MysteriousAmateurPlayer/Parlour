/* ==========================================================================
   MAP · 站点交互脚本
   1. 明暗主题切换（记忆到 localStorage）
   2. 移动端导航
   3. 页头滚动状态
   4. 滚动入场动画
   5. 同人创作标签筛选
   没有依赖，没有框架。
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var STORAGE_KEY = 'map-theme';

  /* ---------- 1. 明暗主题 ---------- */
  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme, remember) {
    root.setAttribute('data-theme', theme);
  var fav = document.getElementById('favicon');
  if (fav) fav.setAttribute('href', (fav.getAttribute('data-base') || fav.getAttribute('href')).replace(/favicon(-dark)?\.svg/, theme === 'dark' ? 'favicon-dark.svg' : 'favicon.svg'));

    if (remember) {
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    }
  }

  var toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });
  }

  // 用户没有手动选择时，跟随系统设置
  var pref = root.getAttribute('data-theme-pref') || 'auto';
  if (pref === 'auto' && window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function (e) {
      var saved = null;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch (err) {}
      if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------- 2. 移动端导航 ---------- */
  var navToggle = document.getElementById('nav-toggle');
  var mobileNav = document.getElementById('mobile-nav');
  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', function () {
      var open = mobileNav.hasAttribute('hidden');
      if (open) mobileNav.removeAttribute('hidden');
      else mobileNav.setAttribute('hidden', '');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.classList.toggle('is-open', open);
    });

    mobileNav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        mobileNav.setAttribute('hidden', '');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.classList.remove('is-open');
      }
    });
  }

  /* ---------- 3. 页头滚动状态 ---------- */
  var header = document.getElementById('site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- 4. 滚动入场 ---------- */
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reveals.length) {
    /* 无事可做 */
  } else if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    // 首屏内的元素直接显示：observer 的首次判定若因布局尚未稳定而落空，
    // 静态元素（例如 sticky 侧栏）之后再没有滚动事件可触发，会永久停在做动画前的隐藏态。
    var vh = window.innerHeight || document.documentElement.clientHeight;
    reveals.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      if (rect.top < vh * 0.9 && rect.bottom > 0) el.classList.add('is-visible');
      else observer.observe(el);
    });
  }

  /* ---------- 5. 标签筛选（同人创作记录） ---------- */
  var bar = document.querySelector('[data-filter-bar]');
  var target = document.querySelector('[data-filter-target]');
  var emptyHint = document.querySelector('[data-filter-empty]');

  if (bar && target) {
    var cards = Array.prototype.slice.call(target.querySelectorAll('.post-card'));

    var applyFilter = function (tag) {
      var visible = 0;
      cards.forEach(function (card) {
        var tags = (card.getAttribute('data-tags') || '')
          .split(',')
          .map(function (t) { return t.trim(); })
          .filter(Boolean);
        var match = tag === '__all__' || tags.indexOf(tag) !== -1;
        card.hidden = !match;
        if (match) visible += 1;
      });
      if (emptyHint) emptyHint.hidden = visible !== 0;
    };

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-bar__btn');
      if (!btn) return;
      Array.prototype.forEach.call(bar.querySelectorAll('.filter-bar__btn'), function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      applyFilter(btn.getAttribute('data-filter'));
    });
  }
})();


/* ==========================================================================
   首屏粒子流场：紧贴太阳星轨的椭圆盘面，分"背面/正面"两层绘制，
   从而有 3D 层次——背面那一半被太阳盘面遮住，正面那一半压在太阳之上。
   粒子沿椭圆切向流动并带径向脉动，聚成一股一股的丝缕；其中一部分是闪耀的星芒。
   ========================================================================== */
(function () {
  var back = document.querySelector('.hero__flow--back');
  var front = document.querySelector('.hero__flow--front');
  if (!back || !front || !back.getContext) return;
  var cb = back.getContext('2d'), cf = front.getContext('2d');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(2, window.devicePixelRatio || 1);

  var W = 0, H = 0, cx = 0, cy = 0, rx = 0, ry = 0, sunR = 0;
  var parts = [];
  var colStreak = 'rgba(240,235,225,.5)', colSpark = 'rgba(230,185,138,.9)';

  /* CSS 变量里可能是 color-mix(...)，用探针取真实颜色 */
  var probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0';
  document.body.appendChild(probe);
  function toRgba(c, a) {
    c = (c || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    var m2 = /^rgba?\(([^)]+)\)$/.exec(c);
    if (m2) { var p = m2[1].split(','); return 'rgba(' + p[0].trim() + ',' + p[1].trim() + ',' + p[2].trim() + ',' + a + ')'; }
    return 'rgba(240,235,225,' + a + ')';
  }
  function cssColor(name, fallback) {
    var v = '';
    try { probe.style.color = ''; probe.style.color = 'var(' + name + ')'; v = getComputedStyle(probe).color; } catch (e) {}
    return (!v || v === 'rgba(0, 0, 0, 0)') ? fallback : v;
  }
  function readColors() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    colStreak = toRgba(cssColor('--flow-streak', dark ? '#e8c98d' : '#b08a4a'), dark ? 0.55 : 0.42);
    colSpark = toRgba(cssColor('--flow-spark', dark ? '#eccb8a' : '#c99a3f'), dark ? 0.95 : 0.8);
  }

  var STRANDS = 7;                                   // 七股丝缕，缠绕在星轨上
  // 每股一套固定参数：速度、径向相位、纵向（离椭圆）相位 —— 组内一致、组间有别
  var strandSpeed = [], strandPh = [], strandVert = [];
  (function () {
    for (var i = 0; i < STRANDS; i++) {
      strandSpeed.push(0.86 + Math.random() * 0.3);   // 股间速度略有差别
      strandPh.push(Math.random() * Math.PI * 2);
      strandVert.push(Math.random() * Math.PI * 2);
    }
  })();
  function spawn(i) {
    var s = (i == null ? Math.floor(Math.random() * STRANDS) : i % STRANDS);
    return {
      a: Math.random() * Math.PI * 2,
      s: s,
      // 每股占一条窄带：0.82~1.02，正好缠在星轨椭圆上（不进入内侧，不会挡太阳）
      t: 0.82 + (s + 0.5) / STRANDS * 0.2 + (Math.random() - 0.5) * 0.02,
      sw: s * (Math.PI * 2 / STRANDS),               // 每股自己的相位 → 分股
      jit: (Math.random() - 0.5) * 0.05,             // 组内极小差异
      spin: 0.9 + Math.random() * 0.2,               // 组内速度基本一致
      age: 0, life: 400 + Math.random() * 700,
      hot: Math.random() < 0.24,                     // 闪耀的星芒
      tw: Math.random() * Math.PI * 2, tws: 0.4 + Math.random() * 1.2
    };
  }

  function pt(p, dA) {
    var a = p.a + (dA || 0) + p.jit;
    var s = p.s;
    // 径向摆动（粗细成股）：同一股共用一条波形
    var t = p.t + 0.026 * Math.sin(3 * a + strandPh[s] + t0 * 0.00005);
    if (t > 1.07) t = 1.07; if (t < 0.76) t = 0.76;
    var x = cx + rx * t * Math.cos(a);
    var y = cy + ry * t * Math.sin(a);
    // 纵向偏移：让流束不再严格贴着椭圆，而是像流体一样上下浮动
    y += ry * 0.055 * Math.sin(2 * a + strandVert[s] - t0 * 0.00006) + ry * 0.02 * Math.sin(5 * a + strandPh[s]);
    return [x, y, Math.sin(a)];
  }

  function resize() {
    var r = back.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cx = W / 2; cy = H / 2;
    // ① 用星轨外轨的真实离心率，别用整个图层外框（否则形状对不上）
    rx = W / 2; ry = H / 2;
    var ringSvg = document.querySelector('.hero__star-ring');
    if (ringSvg) {
      var o = (ringSvg.getAttribute('data-outer') || '').split(',').map(Number);
      var vb = (ringSvg.getAttribute('viewBox') || '0 0 1600 560').split(/\s+/).map(Number);
      if (o.length === 2 && vb.length === 4 && vb[2] && vb[3]) {
        rx = W * (o[0] / vb[2]);
        ry = H * (o[1] / vb[3]);
      }
    }
    back.width = Math.round(W * dpr); back.height = Math.round(H * dpr);
    front.width = back.width; front.height = back.height;
    cb.setTransform(dpr, 0, 0, dpr, 0, 0);
    cf.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 太阳盘面半径（换算到画布局部坐标）：背面的粒子落在这里就不画 → 被太阳挡住
    var disc = document.querySelector('.sun-disc');
    var dr = disc ? disc.getBoundingClientRect() : null;
    sunR = (dr && r.width) ? (dr.width / 2) * (W / r.width) : W * 0.17;
    var n = Math.max(320, Math.min(950, Math.round((W + H) * 1.05)));
    parts = [];
    for (var i = 0; i < n; i++) parts.push(spawn(i));
  }

  var t0 = 0;
  function advance(steps) {
    for (var s = 0; s < steps; s++) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.a += 0.00055 * (0.85 + strandSpeed[p.s] * 0.35) * p.spin;   // 提速 30%，仍与星轨同量级
        p.age++;
        if (p.age > p.life) parts[i] = spawn(p.s);
      }
      t0 += 16;
    }
  }

  function drawFrame() {
    cb.clearRect(0, 0, W, H);
    cf.clearRect(0, 0, W, H);
    cb.globalCompositeOperation = 'lighter';
    cf.globalCompositeOperation = 'lighter';
    cb.lineCap = cf.lineCap = 'round';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var q = pt(p, 0), q0 = pt(p, -0.03 * (0.45 + p.spin) / (0.3 + p.t));   // 拖尾更短，视觉比重更低
      var near = q[2] >= 0;                      // 椭圆下半 = 近侧（压在太阳之上）
      var ctx = near ? cf : cb;
      if (!near && Math.hypot(q[0] - cx, q[1] - cy) < sunR * 1.02) continue;   // 背面被太阳遮住
      var depth = near ? 1 : 0.52;               // 远侧更小更暗 → 立体
      var fadeIn = Math.min(1, p.age / 60);
      var fadeOut = Math.min(1, (p.life - p.age) / 90);
      var fade = fadeIn * fadeOut;   // ② 两端都是渐变
      var tw = 0.65 + 0.35 * Math.sin(p.tw + t0 * 0.001 * p.tws);
      // ④ 拖尾用分段递变：尾细尾淡、头粗头亮 → 有粗细与透明度的渐变
      var SEG = 2;
      ctx.strokeStyle = p.hot ? colSpark : colStreak;
      for (var sg = 0; sg < SEG; sg++) {
        var k1 = sg / SEG, k2 = (sg + 1) / SEG;
        var xa = q0[0] + (q[0] - q0[0]) * k1, ya = q0[1] + (q[1] - q0[1]) * k1;
        var xb = q0[0] + (q[0] - q0[0]) * k2, yb = q0[1] + (q[1] - q0[1]) * k2;
        ctx.globalAlpha = Math.max(0.02, (p.hot ? 0.6 : 0.34) * fade * tw * depth * (0.2 + 0.8 * k2));
        ctx.lineWidth = (p.hot ? 1.1 : 0.8) * depth * (0.3 + 0.7 * k2);
        ctx.beginPath();
        ctx.moveTo(xa, ya);
        ctx.lineTo(xb, yb);
        ctx.stroke();
      }
      if (p.hot) {                               // 星芒：一个亮点 + 十字
        ctx.globalAlpha = Math.max(0.08, 0.9 * fade * tw * depth);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(q[0] - 3.4, q[1]); ctx.lineTo(q[0] + 3.4, q[1]);
        ctx.moveTo(q[0], q[1] - 3.4); ctx.lineTo(q[0], q[1] + 3.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(q[0], q[1], 0.9 + 0.7 * tw, 0, Math.PI * 2);
        ctx.fillStyle = colSpark;
        ctx.fill();
      }
    }
    cb.globalAlpha = cf.globalAlpha = 1;
    cb.globalCompositeOperation = cf.globalCompositeOperation = 'source-over';
  }

  var raf = 0, visible = true;
  readColors();
  resize();
  advance(120);          // 预热：首屏立刻就有流场（无头截图也能验证）
  drawFrame();
  if (reduce) return;    // 减少动效：只保留这一帧静态流场
  function frame() { advance(1); drawFrame(); raf = requestAnimationFrame(frame); }
  raf = requestAnimationFrame(frame);
  window.addEventListener('resize', function () { resize(); advance(40); drawFrame(); }, { passive: true });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(frame);
        if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
      });
    }, { threshold: 0 }).observe(back);
  }
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
