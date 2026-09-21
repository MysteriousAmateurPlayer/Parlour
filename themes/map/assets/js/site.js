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
   首屏粒子流场：无散度流场（正弦叠加 + 绕太阳的涡旋）驱动大量粒子，
   画成短短的流线，叠加成波浪与大海涡流般的流动星空。
   ========================================================================== */
(function () {
  var cv = document.querySelector('.hero__flow');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var W = 0, H = 0, parts = [], color = 'rgba(255,255,255,.8)', glow = 'rgba(255,255,255,.5)';

  /* CSS 变量里可能是 color-mix(...) 表达式，直接丢给 canvas 是非法值（会变成黑色看不见）。
     用一个隐藏探针元素把变量的真实颜色算出来。 */
  var probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0';
  document.body.appendChild(probe);
  function cssColor(varName, fallback) {
    var v = '';
    try {
      probe.style.color = '';
      probe.style.color = 'var(' + varName + ')';
      v = getComputedStyle(probe).color;
    } catch (e) { v = ''; }
    if (!v || v === 'rgba(0, 0, 0, 0)' || v === 'transparent') return fallback;
    return v;
  }
  /* canvas 不接受 color-mix(...)，所以只读实色变量并自己拼 rgba */
  function toRgba(c, a) {
    c = (c || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    var m2 = /^rgba?\(([^)]+)\)$/.exec(c);
    if (m2) {
      var p = m2[1].split(',').map(function (x) { return x.trim(); });
      return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')';
    }
    return 'rgba(' + (a > 0.5 ? '240,235,225' : '60,55,48') + ',' + a + ')';
  }
  function readColors() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var ink = cssColor('--ink', dark ? '#e9e4db' : '#221f1c');
    var acc = cssColor('--accent', dark ? '#d08a74' : '#8f3a2c');
    color = toRgba(ink, dark ? 0.5 : 0.4);
    glow = toRgba(acc, dark ? 0.75 : 0.6);
  }

  function resize() {
    var r = cv.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.max(280, Math.min(720, Math.round(W * H / 1900)));
    parts = [];
    for (var i = 0; i < n; i++) parts.push(spawn());
  }

  function spawn() {
    var x = Math.random() * W, y = Math.random() * H;
    return {
      x: x,
      y: y,
      px: x, py: y,
      life: 60 + Math.random() * 240,
      age: 0,
      hot: Math.random() < 0.14
    };
  }

  /* 流场：u = ∂ψ/∂y，v = -∂ψ/∂x（无散度），再叠加绕太阳的涡旋 */
  function field(x, y, t, out) {
    var u = Math.cos(y / 68 + t * 0.00030) * 0.38
          + Math.cos((x + y) / 118 + t * 0.00022) * 0.12;
    var v = Math.sin(x / 82 - t * 0.00026) * 0.30
          + Math.cos((x + y) / 118 + t * 0.00022) * 0.12;
    var cx = W * 0.5, cy = H * 0.30;
    var dx = x - cx, dy = y - cy;
    var d2 = dx * dx + dy * dy + 4200;
    var k = -2600 / d2;                      // 涡旋强度
    u += -dy * k * 0.0016;
    v += dx * k * 0.0016;
    out[0] = u * 380;
    out[1] = v * 380;
  }

  var tmp = [0, 0];
  /* 先推进若干步、再画一帧：这样首屏立刻就有流场（也让无头截图能验证） */
  function advance(now, steps) {
    for (var s = 0; s < steps; s++) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        field(p.x, p.y, now, tmp);
        p.x += tmp[0] * 0.016;
        p.y += tmp[1] * 0.016;
        p.age++;
        if (p.age > p.life || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) parts[i] = spawn();
      }
      now += 16;
    }
    return now;
  }

  function drawOnce(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.px = p.x - 0.0001; p.py = p.y;
      field(p.x, p.y, now, tmp);
      p.x += tmp[0] * 0.016;
      p.y += tmp[1] * 0.016;
      p.age++;
      if (p.age > p.life || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) {
        parts[i] = spawn();
        continue;
      }
      var speed = Math.hypot(tmp[0], tmp[1]);
      var a = Math.min(0.92, 0.3 + speed / 110) * (1 - p.age / p.life);
      // 沿运动方向拉出一段轨迹：这才是"潮水动线"的关键（只画一步就是一个点）
      var TRAIL = 0.055;
      ctx.strokeStyle = p.hot ? glow : color;
      ctx.globalAlpha = Math.max(0.15, a);
      ctx.lineWidth = p.hot ? 2 : 1.3;
      ctx.beginPath();
      ctx.moveTo(p.x - tmp[0] * TRAIL, p.y - tmp[1] * TRAIL);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    drawOnce(now);
    raf = requestAnimationFrame(frame);
  }

  var raf = 0, visible = true;
  readColors();
  resize();
  // 预热：先让粒子在流场里跑一会儿，再画一帧
  var t0 = 0;
  t0 = advance(t0, 90);
  drawOnce(t0);
  if (reduce) return;              // 减少动效：只留这一帧静态流场
  raf = requestAnimationFrame(frame);
  window.addEventListener('resize', function () { resize(); }, { passive: true });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(frame);
        if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
      });
    }, { threshold: 0 }).observe(cv);
  }
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
