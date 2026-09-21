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
   首屏粒子流场（第三版）
   思路参考流场/curl 噪声的做法（flow field 驱动 + 分组种子）：
   · 分组：7 股，每股有自己的速度、噪声种子、上下浮动频率与相位 → 组间运动明显不同
   · 灵活：粒子在"沿椭圆流动"之上叠加一个会衰减回位的流场位移，
          并由 curl 噪声给出乱流般的横向漂移，因而不再僵硬地贴着椭圆
   · 立体：每颗粒子还有上下浮动（与星轨上 30 个图标同一种思路），并有远近明暗
   · 轻淡：粒子更小更多，透明度低，拖尾只是一小段
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
  var colStreak = 'rgba(240,235,225,.4)', colSpark = 'rgba(230,200,140,.7)';

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
    // ② 透明度整体压得更低，存在感更弱
    colStreak = toRgba(cssColor('--flow-streak', dark ? '#e8c98d' : '#221f1c'), dark ? 0.3 : 0.22);
    colSpark = toRgba(cssColor('--flow-spark', dark ? '#eccb8a' : '#8f4a2c'), dark ? 0.55 : 0.4);
  }

  var STRANDS = 7;
  var st = [];
  (function () {
    for (var i = 0; i < STRANDS; i++) {
      st.push({
        speed: 0.75 + Math.random() * 0.7,          // 股间速度差异明显
        seed: Math.random() * 6.28,                 // 噪声种子
        bobF: 1 + Math.random() * 2.2,              // 上下浮动频率
        bobA: 0.5 + Math.random() * 0.9,            // 上下浮动幅度
        bobP: Math.random() * 6.28,
        drift: 0.6 + Math.random() * 0.9            // 横向漂移幅度
      });
    }
  })();

  function spawn(i) {
    var s = (i == null ? Math.floor(Math.random() * STRANDS) : i % STRANDS);
    return {
      a: Math.random() * Math.PI * 2,
      s: s,
      t: 0.8 + (s + 0.5) / STRANDS * 0.2 + (Math.random() - 0.5) * 0.03,
      ox: 0, oy: 0,
      age: 0, life: 500 + Math.random() * 900,
      hot: Math.random() < 0.16,
      tw: Math.random() * Math.PI * 2, tws: 0.4 + Math.random() * 1.4
    };
  }

  /* 流场：以粒子位置与股种子求一个平滑向量（curl 噪声的廉价近似） */
  function flow(x, y, seed, out) {
    var nx = x / Math.max(1, W), ny = y / Math.max(1, H);
    out[0] = Math.cos((ny * 3.1 + seed) * 2.0) * 0.6 + Math.cos((nx + ny) * 4.2 + seed * 1.7) * 0.4;
    out[1] = Math.sin((nx * 3.4 - seed * 0.7) * 2.0) * 0.6 + Math.sin((nx - ny) * 4.6 + seed * 2.3) * 0.4;
  }

  function resize() {
    var r = back.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cx = W / 2; cy = H / 2;
    rx = W / 2; ry = H / 2;
    var ringSvg = document.querySelector('.hero__star-ring');
    if (ringSvg) {
      var o = (ringSvg.getAttribute('data-outer') || '').split(',').map(Number);
      var vb = (ringSvg.getAttribute('viewBox') || '0 0 1636 596').split(/\s+/).map(Number);
      if (o.length === 2 && vb.length === 4 && vb[2] && vb[3]) { rx = W * (o[0] / vb[2]); ry = H * (o[1] / vb[3]); }
    }
    back.width = Math.round(W * dpr); back.height = Math.round(H * dpr);
    front.width = back.width; front.height = back.height;
    cb.setTransform(dpr, 0, 0, dpr, 0, 0);
    cf.setTransform(dpr, 0, 0, dpr, 0, 0);
    var disc = document.querySelector('.sun-disc');
    var dr = disc ? disc.getBoundingClientRect() : null;
    sunR = (dr && r.width) ? (dr.width / 2) * (W / r.width) : W * 0.17;
    // ③ 粒子数大幅增加（小而不显眼）
    var n = Math.max(700, Math.min(2600, Math.round((W + H) * 2.2)));
    parts = [];
    for (var i = 0; i < n; i++) parts.push(spawn(i));
  }

  var t0 = 0, tmp = [0, 0];
  function advance(steps) {
    var dt = 16;
    for (var k = 0; k < steps; k++) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], S = st[p.s];
        // 沿星轨的切向流动（股间速度不同）
        p.a += 0.00072 * S.speed;
        // 流场位移：漂移 + 衰减回位 → 灵活但不跑散
        var ex = cx + rx * p.t * Math.cos(p.a), ey = cy + ry * p.t * Math.sin(p.a);
        flow(ex, ey, S.seed, tmp);
        p.ox += (tmp[0] * 26 * S.drift - p.ox * 0.05) * (dt / 16);
        p.oy += (tmp[1] * 26 * S.drift - p.oy * 0.05) * (dt / 16);
        p.age++;
        if (p.age > p.life) parts[i] = spawn(p.s);
      }
      t0 += dt;
    }
  }

  function drawFrame() {
    cb.clearRect(0, 0, W, H);
    cf.clearRect(0, 0, W, H);
    cb.globalCompositeOperation = 'lighter';
    cf.globalCompositeOperation = 'lighter';
    cb.lineCap = cf.lineCap = 'round';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], S = st[p.s];
      var a = p.a, t = p.t;
      var x = cx + rx * t * Math.cos(a) + p.ox;
      var y = cy + ry * t * Math.sin(a) + p.oy;
      // ③ 上下浮动（与星轨图标同一思路）：每股频率/幅度/相位都不同
      y += ry * 0.09 * S.bobA * Math.sin(S.bobF * 2 + S.bobP + t0 * 0.00022);
      // 拖尾用的上一位置
      var a0 = a - 0.02, x0 = cx + rx * t * Math.cos(a0) + p.ox * 0.9, y0 = cy + ry * t * Math.sin(a0) + p.oy * 0.9;
      y0 += ry * 0.09 * S.bobA * Math.sin(S.bobF * 2 + S.bobP + (t0 - 60) * 0.00022);

      var near = Math.sin(a) >= 0;
      var ctx = near ? cf : cb;
      if (!near && Math.hypot(x - cx, y - cy) < sunR * 1.02) continue;
      var depth = (near ? 1 : 0.5) * (0.55 + 0.45 * Math.min(1, t));
      var fadeIn = Math.min(1, p.age / 70);
      var fadeOut = Math.min(1, (p.life - p.age) / 110);
      var fade = fadeIn * fadeOut;
      var tw = 0.55 + 0.45 * Math.sin(p.tw + t0 * 0.0012 * p.tws);

      // ② 粒子很小、很淡；拖尾只是一小段
      ctx.strokeStyle = p.hot ? colSpark : colStreak;
      ctx.globalAlpha = Math.max(0.015, (p.hot ? 0.55 : 0.3) * fade * tw * depth);
      ctx.lineWidth = (p.hot ? 0.9 : 0.55) * (0.6 + 0.6 * depth);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (p.hot) {
        ctx.globalAlpha = Math.max(0.03, 0.5 * fade * tw * depth);
        ctx.beginPath();
        ctx.arc(x, y, 0.7 + 0.5 * tw, 0, Math.PI * 2);
        ctx.fillStyle = colSpark;
        ctx.fill();
      }
    }
    cb.globalAlpha = cf.globalAlpha = 1;
    cb.globalCompositeOperation = cf.globalCompositeOperation = 'source-over';
  }

  var raf = 0;
  readColors();
  resize();
  advance(160);
  drawFrame();
  if (reduce) return;
  function frame() { advance(1); drawFrame(); raf = requestAnimationFrame(frame); }
  raf = requestAnimationFrame(frame);
  window.addEventListener('resize', function () { resize(); advance(60); drawFrame(); }, { passive: true });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !raf) { raf = requestAnimationFrame(frame); }
        else if (!e.isIntersecting && raf) { cancelAnimationFrame(raf); raf = 0; }
      });
    }, { threshold: 0 }).observe(back);
  }
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
