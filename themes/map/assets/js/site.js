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
   首屏粒子流场（第四版）
   关键修正：
   · 拖尾改为"记录粒子真实历史位置"再连成曲线 —— 因此拖尾必然与运动方向一致，
     并且自然弯曲，严格贴合该粒子自己的轨迹（不再靠参数反推，方向不会错）
   · 漂移幅度收敛、回位更快 → 粒子始终贴着所属的那一股，看得出成束结构
   · 上下浮动保留（与星轨 30 个图标同一思路），但幅度收敛，不再是乱动
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
    colStreak = toRgba(cssColor('--flow-streak', dark ? '#e8c98d' : '#221f1c'), dark ? 0.26 : 0.2);
    colSpark = toRgba(cssColor('--flow-spark', dark ? '#eccb8a' : '#8f4a2c'), dark ? 0.5 : 0.4);
  }

  var STRANDS = 3;                                  // 继续加粗：3 束，每束最粗
  var st = [];
  (function () {
    for (var i = 0; i < STRANDS; i++) {
      st.push({
        speed: 0.9 + Math.random() * 0.25,        // 股间速度只作小幅区分（不再乱）
        seed: Math.random() * 6.28,
        bobF: 0.8 + Math.random() * 1.4,          // 上下浮动：每股频率/幅度/相位不同
        bobA: 0.45 + Math.random() * 0.55,
        bobP: Math.random() * 6.28,
        drift: 0.5 + Math.random() * 0.6
      });
    }
  })();

  var HIST = 4, SAMPLE = 3;                        // 历史 4 点、每 3 帧采一次 → 一小段可弯的拖尾
  function spawn(i) {
    var s = (i == null ? Math.floor(Math.random() * STRANDS) : i % STRANDS);
    return {
      a: Math.random() * Math.PI * 2,
      s: s,
      // 束的粗细=束内抖动：0.05 → 0.085（再粗 1.7 倍）；束心间距 0.32/3 ≈ 0.107 > 0.085 → 仍分得开
      t: 0.76 + (s + 0.5) / STRANDS * 0.32 + (Math.random() - 0.5) * 0.085,
      ox: 0, oy: 0,
      hx: [], hy: [],
      age: 0, life: 600 + Math.random() * 1000, wave: 0,
      hot: Math.random() < 0.06,
      tw: Math.random() * Math.PI * 2, tws: 0.4 + Math.random() * 1.4
    };
  }

  function flow(x, y, seed, out) {
    var nx = x / Math.max(1, W), ny = y / Math.max(1, H);
    out[0] = Math.cos((ny * 3.1 + seed) * 2.0) * 0.6 + Math.cos((nx + ny) * 4.2 + seed * 1.7) * 0.4;
    out[1] = Math.sin((nx * 3.4 - seed * 0.7) * 2.0) * 0.6 + Math.sin((nx - ny) * 4.6 + seed * 2.3) * 0.4;
  }

  function resize() {
    var r = back.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cx = W / 2; cy = H / 2; rx = W / 2; ry = H / 2;
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
    var n = Math.max(3000, Math.min(11000, Math.round((W + H) * 8.6)));   // 更粗的束需要更多粒子
    parts = [];
    for (var i = 0; i < n; i++) parts.push(spawn(i));
  }

  var t0 = 0, tick = 0, tmp = [0, 0];
  function advance(steps) {
    for (var k = 0; k < steps; k++) {
      tick++;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], S = st[p.s];
        p.a += 0.00086 * S.speed;      // 略提速（+20%），仍与星轨同量级
        var ex = cx + rx * p.t * Math.cos(p.a), ey = cy + ry * p.t * Math.sin(p.a);
        flow(ex, ey, S.seed, tmp);
        // 漂移收敛（幅度小、回位快）→ 始终贴着所属的那一股
        p.ox += tmp[0] * 9 * S.drift - p.ox * 0.15;
        p.oy += tmp[1] * 9 * S.drift - p.oy * 0.15;
        p.age++;
        if (p.age > p.life) parts[i] = spawn(p.s);
        // 束内行进波：整束一起蜿蜒（组内一致），并随时间缓慢推进
        p.wave = 0.022 * Math.sin(2 * p.a + S.seed + t0 * 0.00009)
               + 0.010 * Math.sin(3 * p.a - S.bobP + t0 * 0.00013);
        // 每 SAMPLE 帧记一次真实位置 → 拖尾直接连这些点
        if (tick % SAMPLE === 0 && parts[i] === p) {
          p.hx.push(p.x == null ? ex + p.ox : p.x);
          p.hy.push(p.y == null ? ey + p.oy : p.y);
          if (p.hx.length > HIST) { p.hx.shift(); p.hy.shift(); }
        }
        // 当前位置（含上下浮动）
        var w = p.wave || 0;
        p.x = cx + rx * (p.t + w) * Math.cos(p.a) + p.ox;
        p.y = cy + ry * (p.t + w) * Math.sin(p.a) + p.oy
              + ry * 0.055 * S.bobA * (0.7 + 0.3 * Math.sin(3 * p.a + S.seed + t0 * 0.0001))
                * Math.sin(S.bobF * 2 + S.bobP + t0 * 0.00028);
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
    cb.lineJoin = cf.lineJoin = 'round';
    cf.fillStyle = colStreak;
    cb.fillStyle = colStreak;
    var lastA = -1;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.x == null) continue;
      var near = Math.sin(p.a) >= 0;
      var ctx = near ? cf : cb;
      if (!near && Math.hypot(p.x - cx, p.y - cy) < sunR * 1.02) continue;
      var depth = (near ? 1 : 0.5) * (0.55 + 0.45 * Math.min(1, p.t));
      var fade = Math.min(1, p.age / 80) * Math.min(1, (p.life - p.age) / 130);
      var tw = 0.55 + 0.45 * Math.sin(p.tw + t0 * 0.0012 * p.tws);

      ctx.strokeStyle = colSpark;
      ctx.globalAlpha = Math.max(0.03, 0.7 * fade * tw * depth);
      ctx.lineWidth = 0.9 * (0.6 + 0.6 * depth);
      var n = p.hx.length;
      var aq = Math.round(Math.max(0.015, (p.hot ? 0.7 : 0.42) * fade * tw * depth) * 7);   // 量化成 8 档
      if (aq !== lastA) { ctx.globalAlpha = aq / 7; lastA = aq; }
      if (!p.hot) {
        // 普通粒子：一个极小的实心点（数量大也不拖慢；不改 fillStyle）
        var sz = 0.9 * (0.6 + 0.6 * depth);
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
        continue;
      }
      if (n >= 3) {
        // 用真实历史点画曲线：方向必然一致，且随轨迹弯曲
        ctx.beginPath();
        ctx.moveTo(p.hx[0], p.hy[0]);
        for (var k = 1; k < n - 1; k++) {
          var mx = (p.hx[k] + p.hx[k + 1]) / 2, my = (p.hy[k] + p.hy[k + 1]) / 2;
          ctx.quadraticCurveTo(p.hx[k], p.hy[k], mx, my);
        }
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 0.01, p.y);
        ctx.stroke();
      }
      if (p.hot) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.7 + 0.5 * tw, 0, Math.PI * 2);
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
  advance(180);          // 预热（含历史点，首屏就有弯曲拖尾）
  drawFrame();
  if (reduce) return;
  function frame() { advance(1); drawFrame(); raf = requestAnimationFrame(function () { frame(Date.now()); }); }
  raf = requestAnimationFrame(function () { frame(Date.now()); });
  window.addEventListener('resize', function () { resize(); advance(80); drawFrame(); }, { passive: true });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !raf) { raf = requestAnimationFrame(function () { frame(Date.now()); }); }
        else if (!e.isIntersecting && raf) { cancelAnimationFrame(raf); raf = 0; }
      });
    }, { threshold: 0 }).observe(back);
  }
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();


/* ==========================================================================
   花带上的流场星特效：粒子沿"星之波浪"的切线流动，带个体速度差与闪烁。
   与页面主色的流场同一套语言，但更轻更小，只作花带的呼吸感。
   ========================================================================== */
(function () {
  var bands = document.querySelectorAll('.wave-flow');
  if (!bands.length || !window.requestAnimationFrame) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var col = 'rgba(240,235,225,.3)', colHot = 'rgba(230,200,140,.6)';

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
    col = toRgba(cssColor('--flow-streak', dark ? '#e8c98d' : '#221f1c'), dark ? 0.4 : 0.3);
    colHot = toRgba(cssColor('--flow-spark', dark ? '#eccb8a' : '#8f4a2c'), dark ? 0.7 : 0.55);
  }

  var items = [];
  Array.prototype.forEach.call(bands, function (cv) {
    var P = parseFloat(cv.getAttribute('data-p')) || 240;
    var A = parseFloat(cv.getAttribute('data-a')) || 7.5;
    var Hh = parseFloat(cv.getAttribute('data-h')) || 44;
    var ctx = cv.getContext('2d');
    var st = { cv: cv, ctx: ctx, P: P, A: A, H: Hh, W: 0, H0: 0, parts: [],
               phase: Math.random() * P,              // 匀速改变的初相位
               lanes: [] };
    // ② 五条平行曲线：纵向错开，各自略有差异的幅度与相位 → 形成有厚度的河
    for (var L = 0; L < 5; L++) {
      st.lanes.push({
        off: (L - 2) * 6.2,
        amp: A,                                   // 同振幅 → 平行
        ph: 0,                                    // 无相位差：各条严格平行
        dash: [30 + L * 9, 46 + (4 - L) * 11],     // 长短与间隔错落
        dash0: -(L * (30 + L * 9 + 46 + (4 - L) * 11)) / 5,   // ② 初始虚线偏移按 1/5 周期错开
        // ① 速度剖面：距中心越远越慢（上下慢、中间快）
        speed: 0.052 * (1 - 0.62 * Math.pow(Math.abs(L - 2) / 2, 1.35))
      });
    }
    items.push(st);
    resizeOne(st);
  });

  function waveY(st, x, lane) {
    var ph = st.phase + (lane ? lane.ph : 0);
    var amp = lane ? lane.amp : st.A;
    return st.H0 / 2 + (lane ? lane.off : 0) + amp * Math.sin(((x + ph) / st.P) * Math.PI * 2);
  }
  function waveSlope(st, x, lane) {
    var ph = st.phase + (lane ? lane.ph : 0);
    var amp = lane ? lane.amp : st.A;
    return amp * (Math.PI * 2 / st.P) * Math.cos(((x + ph) / st.P) * Math.PI * 2);
  }

  function spawn(st, atStart) {
    return {
      x: atStart ? -8 : (spawn.i0 != null ? spawn.i0 : Math.random() * st.W),
      sp: 0.55 + Math.random() * 0.9,          // 个体速度差
      off: ((Math.random() + Math.random() + Math.random()) / 1.5 - 1) * 5,   // 沿波上下铺开成一条河（中间密、两侧疏）
      lane: Math.floor(Math.random() * 5),
      tw: Math.random() * Math.PI * 2, tws: 0.5 + Math.random() * 1.6,
      hot: Math.random() < 0.09
    };
  }
  function resizeOne(st) {
    var r = st.cv.getBoundingClientRect();
    st.W = Math.max(1, r.width);
    st.H0 = Math.max(44, r.height);
    if (st.W < 20) {      // ④ 布局未就绪时的兜底，保证页脚河流也画得出
      var pw = st.cv.parentElement ? st.cv.parentElement.getBoundingClientRect().width : 0;
      st.W = Math.max(st.W, pw || 0, (window.innerWidth || 0) - 40, 320);
    }
    st.cv.width = Math.round(st.W * dpr);
    st.cv.height = Math.round(st.H0 * dpr);
    st.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.max(40, Math.min(150, Math.round(st.W / 11)));  // ⑤ 再减弱
    st.parts = [];
    for (var i = 0; i < n; i++) {
      var p = spawn(st, false);
      // ② 初始按等距网格 + 抖动铺开（每层的起点再错开，形成最交错的分布）
      var lane = i % 5;
      p.lane = lane;
      p.x = ((Math.floor(i / 5) + lane / 5) / (n / 5)) * st.W + (Math.random() - 0.5) * 6;
      st.parts.push(p);
    }
  }

  function drawOne(st, dt) {
    var ctx = st.ctx;
    ctx.clearRect(0, 0, st.W, st.H0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    /* ① 匀速改变初相位 → 整条河缓缓起伏推移 */
    st.phase -= dt * 0.016;

    /* ② 多条平行曲线：各自虚线错落，虚线偏移持续移动 → 川流不息 */
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = col;
    for (var L = 0; L < st.lanes.length; L++) {
      var lane = st.lanes[L];
      lane.offDash = (lane.offDash == null ? lane.dash0 : lane.offDash) - dt * lane.speed;
      ctx.lineWidth = 0.7;
      ctx.setLineDash(lane.dash);
      ctx.lineDashOffset = lane.offDash;
      ctx.beginPath();
      for (var x = -20; x <= st.W + 20; x += 8) {
        var yy = waveY(st, x, lane);
        if (x <= -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    var lastA = -1;
    for (var i = 0; i < st.parts.length; i++) {
      var p = st.parts[i];
      var x0 = p.x;
      p.x += p.sp * 0.024 * dt;      // 缓缓流动：约 20~55 px/s
      if (p.x > st.W + 10) { st.parts[i] = spawn(st, true); continue; }   // 出右端 → 回左端，循环均匀
      var lane = st.lanes[p.lane || 0];
      var y0 = waveY(st, x0, lane) + p.off;
      var y1 = waveY(st, p.x, lane) + p.off;
      var tw = 0.5 + 0.5 * Math.sin(p.tw + performance.now() * 0.0012 * p.tws);
      var aq = Math.round(Math.max(0.03, (p.hot ? 0.38 : 0.2) * tw) * 7);
      if (aq !== lastA) { ctx.globalAlpha = aq / 7; lastA = aq; }
      ctx.strokeStyle = p.hot ? colHot : col;
      ctx.lineWidth = p.hot ? 1.1 : 0.7;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(p.x, y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  var last = 0;
  function loop(now) {
    if (!last) last = now;
    var dt = Math.min(60, now - last); last = now;
    for (var i = 0; i < items.length; i++) drawOne(items[i], dt);
    requestAnimationFrame(loop);
  }

  readColors();
  // 粒子出生即均匀分布在全宽上；这里只轻轻推进几帧（不可推进过头，否则会全部重生到左端）
  for (var t2 = 0; t2 < 12; t2++) {
    for (var i2 = 0; i2 < items.length; i2++) {
      items[i2].parts.forEach(function (p) {
        p.x += p.sp * 0.024 * 16;
        if (p.x > items[i2].W + 10) p.x = -8;      // 循环回到左端，保持整段均匀
      });
    }
  }
  for (var k = 0; k < items.length; k++) drawOne(items[k], 0);
  if (reduce) return;
  requestAnimationFrame(loop);
  /* ④ 自检兜底：若某个画布（尤其页脚的星河）没画出任何像素，
     说明首次测量时布局还没就绪 —— 用视口宽重测并重绘，确保每条河都有星。 */
  function audit() {
    for (var a = 0; a < items.length; a++) {
      var st = items[a];
      var empty = false;
      try {
        var d = st.ctx.getImageData(0, 0, Math.max(1, Math.min(120, st.cv.width)), Math.max(1, Math.min(60, st.cv.height))).data;
        empty = true;
        for (var i2 = 3; i2 < d.length; i2 += 4) { if (d[i2] > 0) { empty = false; break; } }
      } catch (e) { empty = false; }
      if (empty) {
        st.W = Math.max(320, (window.innerWidth || 900) - 40);
        var r2 = st.cv.getBoundingClientRect();
        st.H0 = Math.max(44, r2.height || 44);
        st.cv.width = Math.round(st.W * dpr);
        st.cv.height = Math.round(st.H0 * dpr);
        st.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var n2 = Math.max(40, Math.min(150, Math.round(st.W / 11)));
        st.parts = [];
        for (var i3 = 0; i3 < n2; i3++) st.parts.push(spawn(st, false));
        drawOne(st, 0);
      }
    }
  }
  setTimeout(audit, 400);
  setTimeout(audit, 1600);
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () {
      for (var k3 = 0; k3 < items.length; k3++) { resizeOne(items[k3]); drawOne(items[k3], 0); }
    });
    for (var k4 = 0; k4 < items.length; k4++) ro.observe(items[k4].cv);
  }
  window.addEventListener('resize', function () {
    for (var i = 0; i < items.length; i++) { resizeOne(items[i]); drawOne(items[i], 0); }
  }, { passive: true });
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();

/* ==========================================================================
   闪烁星（重写版）：每颗星是一个独立的状态机，由 JS 逐帧驱动。
   · 生命周期 3~5 秒随机：0 → 0.22 丝滑淡入；0.22 → 0.58 稳定在最亮；
     0.58 → 1 丝滑淡出；寿命结束后在**同一区域内重新随机取点**重生。
   · 因为重生时透明度本来就是 0，所以换位置永远不会被看见（不存在瞬移）。
   · 区域：页眉河流、页脚河流、页脚版面、首页太阳星轨椭圆、板块页旋臂。
   ========================================================================== */
(function () {
  var fields = document.querySelectorAll('.sparkle-field');
  if (!fields.length) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 数值安全的伪随机 ---- */
  var seed = 20260924;
  function rnd() {
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  var ease = function (t) { return t * t * (3 - 2 * t); };   // smoothstep，淡入淡出丝滑

  /* ---- 区域定义：数量、尺寸、取样方式 ---- */
  function regionOf(el) {
    var c = el.className;
    if (c.indexOf('--header') >= 0) return { n: 62, mode: 'band', s0: 0.16, s1: 0.34 };   // 页眉河流
    if (c.indexOf('--footer-band') >= 0) return { n: 62, mode: 'band', s0: 0.14, s1: 0.3 }; // 页脚河流
    if (c.indexOf('--footer') >= 0) return { n: 78, mode: 'fill', s0: 0.16, s1: 0.38, pad: 46 }; // 页脚版面
    // ② 星轨：与太阳星轨椭圆完全对齐（主轨 rx736 ry214 → 45.0%/35.9%；外轨 49.3%/39.6%）
    if (c.indexOf('--ring') >= 0) return { n: 82, mode: 'ellipse', s0: 0.16, s1: 0.4,
                                           rx: 45.0, ry: 35.9, r0: 0.972, r1: 1.095 };
    // 旋臂上的星由 SVG 内部元素承担（.galaxy__sparkle，与螺线同坐标系），此处不生成
    if (c.indexOf('--galaxy') >= 0) return null;

    return null;
  }

  /* ---- 在区域内均匀取点（返回百分比） ---- */
  function pick(rg) {
    var a, r;
    if (rg.mode === 'band') {                 // 河流：整条带子内均匀，纵向略向中间收
      return { x: rnd() * 100, y: 22 + rnd() * 56 };
    }
    if (rg.mode === 'spiral') {               // ② 沿对数螺线取样（两臂交替 + 轻微抖动）
      var sp = rg.sp;
      var th = 0.35 + Math.pow(rnd(), 0.85) * (sp.thMax - 0.35);
      var rr = sp.a * Math.exp(sp.b * th) * (0.87 + rnd() * 0.26);
      var aa = th + (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.05;
      return { x: sp.cx + (rr * Math.cos(aa)) / sp.kx, y: sp.cy + (rr * Math.sin(aa)) / sp.ky };
    }
    if (rg.mode === 'ellipse') {              // 星轨：椭圆环带内均匀（角度均匀 + 半径按环带随机）
      a = rnd() * Math.PI * 2;
      r = rg.r0 + Math.sqrt(rnd()) * (rg.r1 - rg.r0);
      return { x: 50 + Math.cos(a) * rg.rx * r, y: 50 + Math.sin(a) * rg.ry * r };
    }
    return { x: rnd() * 100, y: rnd() * 100 };  // 版面：整块均匀
  }

  /* ---- 建立星点 ---- */
  var stars = [], fieldList = [];
  Array.prototype.forEach.call(fields, function (el) {
    var rg = regionOf(el);
    if (!rg) return;
    el.classList.add('sparkle-field--live');
    fieldList.push({ el: el, rg: rg });
    for (var i = 0; i < rg.n; i++) {
      var s = document.createElement('i');
      s.className = 'spark';
      var p = pick(rg);
      s.style.left = p.x.toFixed(2) + '%';
      s.style.top = p.y.toFixed(2) + '%';
      var base = rg.s0 + rnd() * (rg.s1 - rg.s0);
      s.style.width = (1.5 * base).toFixed(2) + 'rem';
      s.style.height = (1.5 * base).toFixed(2) + 'rem';
      s.style.opacity = '0';
      s.style.opacity = opacityAt(Math.min(0.999, rnd())).toFixed(3);   // 首屏立即呈现
      el.appendChild(s);
      stars.push({
        el: s, rg: rg, acc: rnd() * 3000,
        life: 3000 + rnd() * 2000,                 // 生命周期 3~5 秒
        born: performance.now() - rnd() * 5000     // 初始相位打散，避免同时闪
      });
    }
  });
  if (!stars.length) return;

  /* ---- 单颗星：按寿命推进，结束后在区域内重生 ---- */
  function respawn(st) {
    var rg = st.rg;
    var p = pick(rg);
    st.el.style.left = p.x.toFixed(2) + '%';
    st.el.style.top = p.y.toFixed(2) + '%';
    var base = rg.s0 + rnd() * (rg.s1 - rg.s0);   // 重生时才改尺寸（此刻 opacity 为 0，看不见跳变）
    st.el.style.width = (1.5 * base).toFixed(2) + 'rem';
    st.el.style.height = (1.5 * base).toFixed(2) + 'rem';
    st.life = 3000 + rnd() * 2000;
    st.born = Date.now();
  }

  function opacityAt(t) {
    if (t < 0.22) return ease(t / 0.22);                 // 丝滑淡入
    if (t < 0.58) return 1;                              // 稳定存在一小会（满亮）
    return 1 - ease((t - 0.58) / 0.42);                  // 丝滑淡出
  }


  /* ---- 旋臂上的星：SVG 内部四角星，与螺线同一坐标系 ----
     取点规则：约 70% 贴着旋臂（带小抖动），30% 散布在整个区域内。 ---- */
  var svgStars = [];
  var SPG = document.querySelector('.galaxy__sparkles');
  var SP = null;
  if (SPG) {
    SP = {
      a: parseFloat(SPG.getAttribute('data-a')) || 22,
      b: parseFloat(SPG.getAttribute('data-b')) || 0.2,
      thmax: parseFloat(SPG.getAttribute('data-thmax')) || 15.08,
      cx: parseFloat(SPG.getAttribute('data-cx')) || 1190,
      cy: parseFloat(SPG.getAttribute('data-cy')) || 152,
      w: parseFloat(SPG.getAttribute('data-w')) || 1500,
      h: parseFloat(SPG.getAttribute('data-h')) || 300
    };
  }
  function sparkD(x, y, R) {          // 四角星（与生成器同形）
    var k = R * 0.16;
    var p = [[x, y - R], [x + k, y - k], [x + R, y], [x + k, y + k],
             [x, y + R], [x - k, y + k], [x - R, y], [x - k, y - k]];
    var d = 'M';
    for (var q = 0; q < p.length; q++) d += p[q][0].toFixed(1) + ' ' + p[q][1].toFixed(1) + (q < 7 ? 'L' : 'Z');
    return d;
  }
  function pickPoint() {
    var arm = rnd() < 0.5 ? 0 : 1;
    if (rnd() < 0.7) {                // 贴臂
      var th = 0.35 + Math.pow(rnd(), 0.85) * (SP.thmax - 0.35);
      var rr = SP.a * Math.exp(SP.b * th) * (0.92 + rnd() * 0.2);
      var aa = th + (arm ? Math.PI : 0) + (rnd() - 0.5) * 0.06;
      return [SP.cx + rr * Math.cos(aa), SP.cy + rr * Math.sin(aa)];
    }
    return [rnd() * SP.w, rnd() * SP.h];   // 非旋臂区域
  }
  Array.prototype.forEach.call(document.querySelectorAll('.galaxy__sparkle'), function (el) {
    var st = { el: el, R: 2.6 + rnd() * 2.6, life: 3000 + rnd() * 2000, born: Date.now() - rnd() * 5000 };
    var p = pickPoint();
    el.setAttribute('d', sparkD(p[0], p[1], st.R));
    el.setAttribute('opacity', (opacityAt(Math.min(0.999, rnd())) * 0.75).toFixed(3));  // 首屏立即呈现
    st.pick = pickPoint;
    svgStars.push(st);
  });
  /* ---- 首页天空里的背景随机星（非星座）：取 35% 用同一套状态机闪烁。
     只改 opacity，绝不触碰 transform —— 因此它们仍按原速随天空旋转。 ---- */
  var skyStars = [];
  (function () {
    var all = document.querySelectorAll('.sky-field use');
    var picked = [], bgTotal = 0;
    for (var i3 = 0; i3 < all.length; i3++) {
      var el3 = all[i3];
      if (el3.closest && el3.closest('.sky-set')) continue;   // 星座连线上的星不参与
      var season = el3.closest ? el3.closest('.sky-season') : null;
      if (season && !season.classList.contains('is-active')) continue;   // 隐藏季节组里的星不管
      bgTotal++;
      picked.push(el3);                                     // 100%：全部可见背景星都参与
      if (picked.length >= 900) break;                        // 上限兜底（100% 时约 523 颗）
    }

    for (var j3 = 0; j3 < picked.length; j3++) {
      var e3 = picked[j3];
      var base = parseFloat(e3.style.opacity || e3.getAttribute('opacity') || '0.6');
      if (!isFinite(base) || base <= 0) base = 0.6;
      var peak = base;                      // 亮度上限＝原始亮度（原版观感）
      /* ④ 朝向：四角星有朝向（转 45° 就是「×」、0° 是「+」）。
         基准指向地球（天空画布中心 750,640），再叠加一个随机初始偏移量；
         因为位置与朝向会一起随天空自转，所以它们始终朝着地球。 */
      var tf = e3.getAttribute('transform') || '';
      var mm = /translate\(([-\d.]+),([-\d.]+)\)\s*scale\(([\d.]+)\)/.exec(tf);
      if (mm) {
        var sx = parseFloat(mm[1]), sy = parseFloat(mm[2]), sc = parseFloat(mm[3]);
        var ang = Math.atan2(640 - sy, 750 - sx) * 180 / Math.PI + (rnd() - 0.5) * 60;
        e3.setAttribute('transform',
          'translate(' + sx + ',' + sy + ') rotate(' + ang.toFixed(1) + ') scale(' + sc.toFixed(3) + ')');
      }      // （已撤销尺寸放大：保持原版贴图与大小）
      var st3 = { el: e3, base: peak, life: 3000 + rnd() * 2000, born: Date.now() - rnd() * 5000 };
      e3.style.opacity = (peak * opacityAt(Math.min(0.999, rnd()))).toFixed(3);   // 首屏立即呈现
      skyStars.push(st3);
      svgStars.push(st3);        // 与旋臂星共用同一个逐帧循环
    }
    try {                                   // 供自检读取的统计
      var mn = 2, mx = -1, vis = 0;
      for (var q3 = 0; q3 < skyStars.length; q3++) {
        var o3 = parseFloat(skyStars[q3].el.style.opacity || '0');
        if (o3 < mn) mn = o3;
        if (o3 > mx) mx = o3;
        if (o3 > 0.01) vis++;
      }
      document.documentElement.setAttribute('data-sky-bg', String(bgTotal));
      document.documentElement.setAttribute('data-sky-spark', String(picked.length));
      document.documentElement.setAttribute('data-sky-vis', String(vis));
      document.documentElement.setAttribute('data-sky-op', mn.toFixed(2) + '~' + mx.toFixed(2));
    } catch (e0) {}
  })();

  var svgFrames = 0, skySample = '';
  /* 帧步进驱动：每 40ms 推进一次，每颗星按自己的寿命累积进度。
     不依赖 Date.now / performance.now / requestAnimationFrame，
     因此在后台标签页、无头环境、被节流的场景下都不会停。 */
  function tick(dt) {
    svgFrames++;
    // a) 旋臂四角星 + 天空背景星（同在一个数组里）
    for (var i2 = 0; i2 < svgStars.length; i2++) {
      var st = svgStars[i2];
      st.acc = (st.acc || 0) + dt;
      if (st.acc >= st.life) {
        st.acc -= st.life;
        st.life = 3000 + rnd() * 2000;
        if (st.pick) {                       // 旋臂星：重生时重新取点
          var p2 = st.pick();
          st.el.setAttribute('d', sparkD(p2[0], p2[1], st.R));
        }
      }
      var t2 = st.acc / st.life;
      var o2 = opacityAt(t2) * (st.base != null ? st.base : 0.75);
      var v2 = o2 < 0.02 ? '0' : o2.toFixed(3);
      if (st.base != null) st.el.style.opacity = v2;   // 天空 <use>：用 style（保留 transform）
      else st.el.setAttribute('opacity', v2);          // 旋臂 <path>：用属性
    }
    // b) 页眉 / 页脚 / 星轨等 DOM 星
    for (var j2 = 0; j2 < stars.length; j2++) {
      var s2 = stars[j2];
      s2.acc = (s2.acc || 0) + dt;
      if (s2.acc >= s2.life) {
        s2.acc -= s2.life;
        s2.life = 3000 + rnd() * 2000;
        var pp = pick(s2.rg);
        s2.el.style.left = pp.x.toFixed(2) + '%';
        s2.el.style.top = pp.y.toFixed(2) + '%';
        var b2 = s2.rg.s0 + rnd() * (s2.rg.s1 - s2.rg.s0);
        s2.el.style.width = (1.5 * b2).toFixed(2) + 'rem';
        s2.el.style.height = (1.5 * b2).toFixed(2) + 'rem';
      }
      var oo = opacityAt(s2.acc / s2.life) * 0.75;
      s2.el.style.opacity = oo < 0.02 ? '0' : oo.toFixed(3);
    }
    // c) 自证：帧在推进 + 天空星亮度在变化
    if (svgFrames % 20 === 0 && skyStars.length) {
      try {
        document.documentElement.setAttribute('data-sky-frames', String(svgFrames));
        skySample = (skySample ? skySample + ' ' : '') + (skyStars[0].el.style.opacity || '');
        if (skySample.length > 120) skySample = skySample.slice(-120);
        document.documentElement.setAttribute('data-sky-track', skySample);
      } catch (e4) {}
    }
  }

  if (reduce) {                                          // 减少动效：静态微亮
    for (var i = 0; i < stars.length; i++) stars[i].el.style.opacity = '0.26';
    for (var i2 = 0; i2 < svgStars.length; i2++) {
      var s3 = svgStars[i2];
      var v3 = s3.base != null ? s3.base : 0.2;
      if (s3.el.tagName.toLowerCase() === 'use') s3.el.style.opacity = String(v3);
      else s3.el.setAttribute('opacity', String(v3));
    }
    return;
  }
  /* 单一驱动：每 40ms 推进一次，全部闪烁星（页眉/页脚/星轨/旋臂/天空）共用。 */
  setInterval(function () { tick(40); }, 40);
  // 布局变化后（例如页脚进入视口）重新测量容器尺寸无需处理：坐标是百分比，天然自适应
})();

/* ==========================================================================
   ③ 布拉格天文钟：由访问者本地时间驱动三根指针（无数字时间显示）。
   · 时针：24 小时一圈（Orloj 的小时环就是 24 小时制）
   · 太阳针：按太阳黄经（春分≈3/21 为 0°）指示其在黄道上的位置
   · 月亮针：按朔望月周期 29.53059 天推进
   ========================================================================== */
(function () {
  var root = document.querySelector('[data-clock]');
  if (!root) return;
  var hh = root.querySelector('[data-hand="hour"]');
  var sun = root.querySelector('[data-hand="sun"]');
  var moon = root.querySelector('[data-hand="moon"]');
  var CX = 440, CY = 306;   // 与生成器一致（布拉格钟盘心）
  function daysInYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365; }
  function draw() {
    var d = new Date();
    var hours = d.getHours(), mins = d.getMinutes(), secs = d.getSeconds();
    // ① 时针：24 小时一圈 → 每小时 15°
    var aH = ((hours + mins / 60 + secs / 3600) / 24) * 360;
    // ② 太阳针：一年一圈，春分（约 3/21）为 0°
    var start = new Date(d.getFullYear(), 0, 0);
    var doy = Math.floor((d - start) / 86400000) + (hours * 3600 + mins * 60 + secs) / 86400;
    var aS = (((doy - 80) / daysInYear(d.getFullYear())) * 360 + 360) % 360;
    // ③ 月亮针：朔望月 29.53059 天一圈（历元 2000-01-06 18:14 UTC 新月）
    var age = ((d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % 29.53059;
    var aM = (age / 29.53059) * 360;
    if (hh) hh.setAttribute('transform', 'rotate(' + aH.toFixed(2) + ' ' + CX + ' ' + CY + ')');
    if (sun) sun.setAttribute('transform', 'rotate(' + aS.toFixed(2) + ' ' + CX + ' ' + CY + ')');
    if (moon) moon.setAttribute('transform', 'rotate(' + aM.toFixed(2) + ' ' + CX + ' ' + CY + ')');
  }
  draw();
  setInterval(draw, 1000);
})();

/* ==========================================================================
   天球仪（关于本站页）：canvas 软件渲染的 3D 空心圆柱环 + 立体太阳。
   每帧：把三个环的法向量绕竖直轴旋转（真三维旋转）→ 重算透视投影 →
   背面剔除 → 所有可见面/线/刻度统一按深度排序 → 绘制。
   用 var(--bg) 填充面 → 遮挡正确；用 var(--ring-line) 描边 → 素描感。
   全部是 canvas 2D 软件绘制，不涉及 CSS 3D transform，因此不会产生合成层、
   也不会导致固定顶栏闪烁。
   ========================================================================== */
(function () {
  var cv = document.querySelector('.arm3d-canvas');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var dpr = Math.min(2, window.devicePixelRatio || 1);

  var W = 1000, H = 1000, CX = 500, CY = 500;
  var R = 370, TILT = 24 * Math.PI / 180, FOCAL = 2.6 * R;
  var SUN_R = 46, EARTH_R = 15, MOON_R = 6;
  var EARTH_ORBIT = 120, MOON_ORBIT = 22;
  var ORBIT_INC = 16 * Math.PI / 180;
  var rings = [
    { r: 354, w: 10, h: 16, lon: 96, lat: 18, dir: 1, self: 0, prec: 0 },
    { r: 291, w: 10, h: 16, lon: 88, lat: -26, dir: -1, self: 0, prec: 0 },
    { r: 229, w: 10, h: 16, lon: 58, lat: 6, dir: 1, self: 0, prec: 0 }
  ];
  var COL_BG = '#16171a', COL_LINE = '#cfc7ba', COL_TICK = '#cfc7ba';
  var COL_LAND = 'rgba(214,166,82,0.55)', COL_SUN = 'rgba(230,180,90,0.4)';
  var COL_LIT = 'rgba(228,192,132,0.98)', COL_SHADE = 'rgba(18,19,23,0.98)';
  // 简化大陆轮廓（经纬度多边形），地球自转时经度整体平移
  var CONTINENTS = [
    [{ lon: -17, lat: 35 }, { lon: 10, lat: 37 }, { lon: 30, lat: 32 }, { lon: 40, lat: 15 }, { lon: 50, lat: 12 }, { lon: 43, lat: -5 }, { lon: 35, lat: -20 }, { lon: 28, lat: -33 }, { lon: 18, lat: -35 }, { lon: 12, lat: -18 }, { lon: 5, lat: -5 }, { lon: -8, lat: 4 }, { lon: -15, lat: 12 }],
    [{ lon: -9, lat: 36 }, { lon: -9, lat: 44 }, { lon: 0, lat: 45 }, { lon: 12, lat: 46 }, { lon: 22, lat: 50 }, { lon: 35, lat: 55 }, { lon: 60, lat: 56 }, { lon: 85, lat: 53 }, { lon: 105, lat: 56 }, { lon: 125, lat: 56 }, { lon: 140, lat: 50 }, { lon: 150, lat: 55 }, { lon: 170, lat: 48 }, { lon: 180, lat: 45 }, { lon: 170, lat: 30 }, { lon: 150, lat: 22 }, { lon: 135, lat: 18 }, { lon: 118, lat: 12 }, { lon: 108, lat: 8 }, { lon: 98, lat: 7 }, { lon: 90, lat: 10 }, { lon: 78, lat: 12 }, { lon: 68, lat: 15 }, { lon: 58, lat: 20 }, { lon: 48, lat: 26 }, { lon: 38, lat: 29 }, { lon: 28, lat: 30 }, { lon: 18, lat: 24 }, { lon: 8, lat: 20 }, { lon: -2, lat: 14 }],
    [{ lon: -130, lat: 55 }, { lon: -122, lat: 60 }, { lon: -108, lat: 63 }, { lon: -92, lat: 62 }, { lon: -75, lat: 60 }, { lon: -62, lat: 55 }, { lon: -54, lat: 50 }, { lon: -55, lat: 44 }, { lon: -62, lat: 40 }, { lon: -72, lat: 38 }, { lon: -78, lat: 34 }, { lon: -84, lat: 30 }, { lon: -94, lat: 26 }, { lon: -105, lat: 28 }, { lon: -115, lat: 32 }, { lon: -124, lat: 38 }, { lon: -130, lat: 48 }],
    [{ lon: -80, lat: 10 }, { lon: -70, lat: 12 }, { lon: -60, lat: 8 }, { lon: -50, lat: 4 }, { lon: -42, lat: -2 }, { lon: -36, lat: -10 }, { lon: -36, lat: -20 }, { lon: -42, lat: -26 }, { lon: -50, lat: -32 }, { lon: -58, lat: -38 }, { lon: -65, lat: -43 }, { lon: -70, lat: -44 }, { lon: -74, lat: -36 }, { lon: -76, lat: -26 }, { lon: -78, lat: -16 }, { lon: -80, lat: -2 }],
    [{ lon: 113, lat: -22 }, { lon: 122, lat: -14 }, { lon: 130, lat: -12 }, { lon: 138, lat: -15 }, { lon: 145, lat: -18 }, { lon: 150, lat: -22 }, { lon: 153, lat: -28 }, { lon: 148, lat: -35 }, { lon: 140, lat: -38 }, { lon: 130, lat: -35 }, { lon: 122, lat: -30 }, { lon: 115, lat: -26 }],
    [{ lon: -45, lat: 60 }, { lon: -32, lat: 68 }, { lon: -22, lat: 75 }, { lon: -30, lat: 82 }, { lon: -45, lat: 83 }, { lon: -58, lat: 78 }, { lon: -58, lat: 70 }, { lon: -50, lat: 64 }],
    [{ lon: 95, lat: 5 }, { lon: 105, lat: 0 }, { lon: 115, lat: -5 }, { lon: 125, lat: -8 }, { lon: 135, lat: -4 }, { lon: 140, lat: -1 }, { lon: 130, lat: 6 }, { lon: 118, lat: 5 }, { lon: 108, lat: 8 }, { lon: 98, lat: 8 }]
  ];
  function cssVar(name, fallback) {
    var v = '';
    try { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) {}
    return v || fallback;
  }
  function readColors() {
    COL_BG = cssVar('--bg', '#16171a');
    COL_LINE = cssVar('--ink-soft', '#57504a');   // 线条用文字/内容色（次级文字），而非近背景的 --ring-line
    COL_TICK = COL_LINE;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    COL_LAND = dark ? 'rgba(214,166,82,0.6)' : 'rgba(186,86,56,0.55)';
    COL_SUN = dark ? 'rgba(230,180,90,0.4)' : 'rgba(196,110,70,0.32)';
    COL_LIT = dark ? 'rgba(228,192,132,0.98)' : 'rgba(226,146,100,0.95)';
    COL_SHADE = dark ? 'rgba(18,19,23,0.98)' : 'rgba(206,199,186,0.95)';
  }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function proj(x, y, z) {
    var s = FOCAL / (FOCAL + z);
    return { x: CX + x * s, y: CY - y * s, z: z };
  }
  function tilts(v) {
    var y2 = v.y * Math.cos(TILT) - v.z * Math.sin(TILT);
    var z2 = v.y * Math.sin(TILT) + v.z * Math.cos(TILT);
    return { x: v.x, y: y2, z: z2 };
  }
  function rotY(v, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
  }
  function norm(v) { var l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }
  function neg(v) { return { x: -v.x, y: -v.y, z: -v.z }; }
  function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
  function rotAxis(v, axis, a) {
    var c = Math.cos(a), s = Math.sin(a), d = 1 - c;
    var x = axis.x, y = axis.y, z = axis.z;
    return {
      x: (d * x * x + c) * v.x + (d * x * y - s * z) * v.y + (d * x * z + s * y) * v.z,
      y: (d * y * x + s * z) * v.x + (d * y * y + c) * v.y + (d * y * z - s * x) * v.z,
      z: (d * z * x - s * y) * v.x + (d * z * y + s * x) * v.y + (d * z * z + c) * v.z
    };
  }

  /* 单环：返回可见元素列表（带深度）。
     姿态 = 初始朝向 →（进动）绕一根"平行于环面"的轴缓慢旋转 →（自转）绕法向 n 旋转。 */
  function ringItems(rg, self, prec) {
    var la = rg.lon * Math.PI / 180, ph = rg.lat * Math.PI / 180;
    var n0 = norm({ x: Math.cos(ph) * Math.cos(la), y: Math.sin(ph), z: Math.cos(ph) * Math.sin(la) });
    var t10 = norm({ x: -Math.sin(la), y: 0, z: Math.cos(la) });
    var t20 = cross(n0, t10);
    // ③ 进动轴：垂直于 n0 且水平（即平行于环面）→ 环面缓慢"翻倾"
    var axis = norm(cross(n0, { x: 0, y: 1, z: 0 }));
    if (Math.hypot(axis.x, axis.y, axis.z) < 0.001) axis = { x: 1, y: 0, z: 0 };
    // 进动：整个环坐标系绕 axis 转 prec
    var n = rotAxis(n0, axis, prec);
    var t1 = rotAxis(t10, axis, prec);
    var t2 = rotAxis(t20, axis, prec);
    // 自转：绕 n 转 self
    t1 = rotAxis(t1, n, self);
    t2 = rotAxis(t2, n, self);
    var Ri = rg.r - rg.w, Ro = rg.r + rg.w, h = rg.h;
    function W(th, rho, zl) {
      var rd = th * Math.PI / 180;
      var u = { x: t1.x * Math.cos(rd) + t2.x * Math.sin(rd), y: t1.y * Math.cos(rd) + t2.y * Math.sin(rd), z: t1.z * Math.cos(rd) + t2.z * Math.sin(rd) };
      var X = rho * u.x + zl * n.x, Y = rho * u.y + zl * n.y, Z = rho * u.z + zl * n.z;
      return tilts({ x: X, y: Y, z: Z });
    }
    function uT(th) {
      var rd = th * Math.PI / 180;
      return tilts({ x: t1.x * Math.cos(rd) + t2.x * Math.sin(rd), y: t1.y * Math.cos(rd) + t2.y * Math.sin(rd), z: t1.z * Math.cos(rd) + t2.z * Math.sin(rd) });
    }
    function pt(th, rho, zl) { var w = W(th, rho, zl); return proj(w.x, w.y, w.z); }
    function facing(cw, N) {
      var vx = -cw.x, vy = -cw.y, vz = -FOCAL - cw.z;
      return N.x * vx + N.y * vy + N.z * vz > 0;
    }
    var nT = tilts(n);
    var items = [];
    // 顶/底面（6° 分片，与刻度步长对齐），记录每个分片的最小深度供刻度/圆线引用
    var faceMin = {};
    [[h / 2, nT], [-h / 2, neg(nT)]].forEach(function (pair) {
      var zl = pair[0], N = pair[1];
      var key = zl > 0 ? 't' : 'b';
      for (var th = 0; th < 360; th += 6) {
        var mw = W(th + 3, (Ro + Ri) / 2, zl);
        if (!facing(mw, N)) continue;
        var outer = [], inner = [];
        for (var a = th; a <= th + 6; a += 1.5) { outer.push(pt(a, Ro, zl)); inner.push(pt(a, Ri, zl)); }
        var d = outer.concat(inner.slice().reverse());
        var z = 0, zmin = Infinity;
        for (var k = 0; k < d.length; k++) { z += d[k].z; if (d[k].z < zmin) zmin = d[k].z; }
        z /= d.length;
        items.push({ z: z, kind: 'face', pts: d, side: false });
        faceMin[key + ':' + th] = zmin;
      }
    });
    // 外/内侧面（6° 分片，更细，边缘更圆滑、不再有"被切一块"的棱角）
    for (var th2 = 0; th2 < 360; th2 += 6) {
      [[Ro, 1], [Ri, -1]].forEach(function (pair) {
        var rho = pair[0], sgn = pair[1];
        var N = sgn > 0 ? uT(th2 + 3) : neg(uT(th2 + 3));
        var mw = W(th2 + 3, rho, 0);
        if (!facing(mw, N)) return;
        var top = [], bot = [];
        for (var a = th2; a <= th2 + 6; a += 1.5) { top.push(pt(a, rho, h / 2)); bot.push(pt(a, rho, -h / 2)); }
        var d = top.concat(bot.slice().reverse());
        var z = 0; for (var k2 = 0; k2 < d.length; k2++) z += d[k2].z; z /= d.length;
        items.push({ z: z, kind: 'face', pts: d, side: true });
      });
    }
    // 圆线（6° 段）：环顶/底面的内外圆轮廓线，深度 = 对应端面分片最小深度 - 0.3
    [[Ro, h / 2, nT], [Ri, h / 2, nT], [Ro, -h / 2, neg(nT)], [Ri, -h / 2, neg(nT)]].forEach(function (p) {
      var rho = p[0], zl = p[1], N = p[2];
      var key = zl > 0 ? 't' : 'b';
      for (var th3 = 0; th3 < 360; th3 += 6) {
        var mw = W(th3 + 3, rho, zl);
        if (!facing(mw, N)) continue;
        var a2 = pt(th3, rho, zl), b2 = pt(th3 + 6, rho, zl);
        var fz = faceMin[key + ':' + th3];
        if (fz === undefined) fz = (a2.z + b2.z) / 2;
        items.push({ z: fz - 0.3, kind: 'line', a: a2, b: b2 });
      }
    });
    // ① 刻度：环面（端面）上的径向短刻度——主 30° 从内圆到外圆全长、
    //    次级 6° 只延伸约一半；深度 = 对应端面分片最小深度 - 0.5，画在环面之上。
    [[h / 2, nT], [-h / 2, neg(nT)]].forEach(function (pair) {
      var zl = pair[0], N = pair[1];
      var key = zl > 0 ? 't' : 'b';
      for (var th4 = 0; th4 < 360; th4 += 6) {
        var mw2 = W(th4, (Ro + Ri) / 2, zl);
        if (!facing(mw2, N)) continue;
        var major = (th4 % 30 === 0);
        var a3 = pt(th4, Ri, zl);
        var b3 = pt(th4, major ? Ro : Ri + (Ro - Ri) * 0.6, zl);   // 次级延伸约 60%
        var fz = faceMin[key + ':' + th4];
        if (fz === undefined) fz = (a3.z + b3.z) / 2;
        items.push({ z: fz - 0.5, kind: major ? 'tick' : 'tick-fine', a: a3, b: b3 });
      }
    });
    return items;
  }

  /* ---------- 3D 太阳系：太阳居球心；地球绕日公转 + 自转（大陆纹理）；月亮绕地公转 ---------- */
  function spherePoint(center, r, lonRad, latDeg) {
    var ph = latDeg * Math.PI / 180;
    return { x: center.x + r * Math.cos(ph) * Math.cos(lonRad), y: center.y + r * Math.sin(ph), z: center.z + r * Math.cos(ph) * Math.sin(lonRad) };
  }
  // 多边形裁剪到前半球（tilted z <= 0）
  function clipZ(poly) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var ain = a.z <= 0, bin = b.z <= 0;
      if (ain) out.push(a);
      if (ain !== bin) {
        var t = a.z / (a.z - b.z);
        out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: 0 });
      }
    }
    return out;
  }
  // 球体 disc：填充圆 + 轮廓。isSun=true 用径向渐变（光源本身）；
  // 否则用线性光照渐变：朝向 lightFrom（太阳屏幕位置）的半球亮、背向暗。
  function discItem(center, r, lw, lightFrom, isSun) {
    var tc = tilts(center);
    var pc = proj(tc.x, tc.y, tc.z);
    return { z: tc.z, kind: 'disc', x: pc.x, y: pc.y, r: r * (FOCAL / (FOCAL + tc.z)), lw: lw, lx: lightFrom ? lightFrom.x : null, ly: lightFrom ? lightFrom.y : null, sun: !!isSun };
  }
  // 球体 + 经纬线网格（只画前半球 z<=0），返回 items；网格均匀对称，自转时不闪烁跳变。
  // 球体 + 经纬线网格：地轴正朝上（屏幕竖直）的平视视角。
  // 球面点用屏幕空间坐标（dx 水平、dy 竖直向上、dz 深度），背面(dz>0)逐段剔除。
  function sphereGridItems(center, r, rotLon) {
    var items = [];
    var tc = tilts(center);
    var pc = proj(tc.x, tc.y, tc.z);
    var rs = r * (FOCAL / (FOCAL + tc.z));
    var s = rs / r;   // 投影缩放
    items.push({ z: tc.z, kind: 'disc', x: pc.x, y: pc.y, r: rs, lw: 0.31 });
    var rotDeg = rotLon * 180 / Math.PI;
    // 经线（地轴竖直：从北极到南极的弧）
    for (var lon = 0; lon < 360; lon += 30) {
      var la = (lon + rotDeg) * Math.PI / 180;
      var pts = [];
      for (var lat = -90; lat <= 90; lat += 6) {
        var ph = lat * Math.PI / 180;
        var dx = r * Math.cos(ph) * Math.cos(la);
        var dy = r * Math.sin(ph);
        var dz = r * Math.cos(ph) * Math.sin(la);
        pts.push({ x: pc.x + dx * s, y: pc.y - dy * s, z: tc.z + dz, back: dz > 0 });
      }
      for (var k = 0; k < pts.length - 1; k++) {
        if (pts[k].back || pts[k + 1].back) continue;
        items.push({ z: (pts[k].z + pts[k + 1].z) / 2, kind: 'line', lw: 0.14, a: { x: pts[k].x, y: pts[k].y }, b: { x: pts[k + 1].x, y: pts[k + 1].y } });
      }
    }
    // 纬线（水平圆，投影成水平线段）
    for (var lat2 = -75; lat2 <= 75; lat2 += 30) {
      var ph2 = lat2 * Math.PI / 180;
      var dy2 = r * Math.sin(ph2);
      var rho2 = r * Math.cos(ph2);
      var pts2 = [];
      for (var a2 = 0; a2 <= 360; a2 += 6) {
        var rr = (a2 + rotDeg) * Math.PI / 180;
        var dx2 = rho2 * Math.cos(rr);
        var dz2 = rho2 * Math.sin(rr);
        pts2.push({ x: pc.x + dx2 * s, y: pc.y - dy2 * s, z: tc.z + dz2, back: dz2 > 0 });
      }
      for (var k2 = 0; k2 < pts2.length - 1; k2++) {
        if (pts2[k2].back || pts2[k2 + 1].back) continue;
        items.push({ z: (pts2[k2].z + pts2[k2 + 1].z) / 2, kind: 'line', lw: 0.14, a: { x: pts2[k2].x, y: pts2[k2].y }, b: { x: pts2[k2 + 1].x, y: pts2[k2 + 1].y } });
      }
    }
    return items;
  }
  // 太阳火焰：曼荼罗式旋转对称火焰——内层 24 瓣短白金焰舌 + 外层 12 瓣橙红焰舌
  // （交错在每两瓣之间），紧贴太阳球体，带轻微"呼吸"脉动。
  function drawFlame(cx, cy, r, t) {
    var pulse = 1 + 0.05 * Math.sin(t * 1.6);
    var rot = t * 0.1;   // 整体缓慢旋转
    // 内层：24 瓣短白金焰舌（每 15° 一瓣，完美旋转对称）
    for (var i = 0; i < 24; i++) {
      var a0 = i * Math.PI / 12 + rot;
      var tip = r + 8 * pulse;
      var sp = Math.PI / 26;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0 - sp) * (r - 1), cy + Math.sin(a0 - sp) * (r - 1));
      ctx.quadraticCurveTo(cx + Math.cos(a0) * tip, cy + Math.sin(a0) * tip, cx + Math.cos(a0 + sp) * (r - 1), cy + Math.sin(a0 + sp) * (r - 1));
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,244,210,0.8)';
      ctx.fill();
    }
    // 外层：12 瓣橙红焰舌（每 30° 一瓣，交错在每两瓣之间）
    for (var j = 0; j < 12; j++) {
      var a1 = (j + 0.5) * Math.PI / 6 + rot;
      var tip2 = r + 17 * pulse;
      var sp2 = Math.PI / 16;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1 - sp2) * (r - 1), cy + Math.sin(a1 - sp2) * (r - 1));
      ctx.quadraticCurveTo(cx + Math.cos(a1) * tip2, cy + Math.sin(a1) * tip2, cx + Math.cos(a1 + sp2) * (r - 1), cy + Math.sin(a1 + sp2) * (r - 1));
      ctx.closePath();
      ctx.fillStyle = COL_SUN;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // 大陆：球面多边形 → 裁剪前半球 → 投影填充
  function continentItems(center, r, rotLon, poly) {
    var poly3d = [];
    for (var i = 0; i < poly.length; i++) {
      var p0 = poly[i], p1 = poly[(i + 1) % poly.length];
      var dLon = p1.lon - p0.lon, dLat = p1.lat - p0.lat;
      var steps = Math.max(2, Math.ceil(Math.hypot(dLon, dLat) / 7));
      for (var s = 0; s < steps; s++) {
        poly3d.push(tilts(spherePoint(center, r, (p0.lon + dLon * s / steps) * Math.PI / 180 + rotLon, p0.lat + dLat * s / steps)));
      }
    }
    var clipped = clipZ(poly3d);
    if (clipped.length < 3) return [];
    var sp = [], z = 0;
    for (var k = 0; k < clipped.length; k++) { z += clipped[k].z; sp.push(proj(clipped[k].x, clipped[k].y, clipped[k].z)); }
    z /= clipped.length;
    return [{ z: z, kind: 'continent', pts: sp }];
  }
  // 整个太阳系 → items（t 为累计时间）
  function solarItems(t) {
    var items = [];
    // 太阳火焰：背景发光，z 远大于地球轨道最大深度（约 73），
    // 保证永远先画、永远被地球/月亮盖住（发光只照亮背景，不遮挡天体）。
    items.push({ z: 89, kind: 'flame', x: CX, y: CY, r: SUN_R, t: t });
    // 太阳球体：光源（径向渐变），球心原点
    items.push(discItem({ x: 0, y: 0, z: 0 }, SUN_R, 0.43, null, true));
    // 地球公转：轨道面绕 x 轴倾斜 ORBIT_INC，再绕 y 轴缓慢进动（3D 运动），中心恒为太阳
    var ea = t * 0.3;
    var prec = t * 0.12;
    var earthRaw = { x: EARTH_ORBIT * Math.cos(ea), y: -EARTH_ORBIT * Math.sin(ea) * Math.sin(ORBIT_INC), z: EARTH_ORBIT * Math.sin(ea) * Math.cos(ORBIT_INC) };
    var earth = rotY(earthRaw, prec);
    // 地球公转轨道
    var orbPts = [];
    for (var oi = 0; oi <= 360; oi += 6) {
      var oa = oi * Math.PI / 180;
      var orbRaw = { x: EARTH_ORBIT * Math.cos(oa), y: -EARTH_ORBIT * Math.sin(oa) * Math.sin(ORBIT_INC), z: EARTH_ORBIT * Math.sin(oa) * Math.cos(ORBIT_INC) };
      orbPts.push(tilts(rotY(orbRaw, prec)));
    }
    for (var ok = 0; ok < orbPts.length - 1; ok++) {
      var back = orbPts[ok].z > 0 && orbPts[ok + 1].z > 0;
      items.push({ z: (orbPts[ok].z + orbPts[ok + 1].z) / 2 + 20, kind: 'orbit', a: proj(orbPts[ok].x, orbPts[ok].y, orbPts[ok].z), b: proj(orbPts[ok + 1].x, orbPts[ok + 1].y, orbPts[ok + 1].z), back: back });
    }
    // 地球：球体 + 经纬线网格（自转，网格对称稳定、不闪烁）
    var earthSelf = t * 0.55;
    items = items.concat(sphereGridItems(earth, EARTH_R, earthSelf));
    // 月亮绕地球（在轨道面内，轨道面随进动）
    var ma = t * 1.3;
    var radial = norm(earth);
    var Norb = rotY({ x: 0, y: Math.cos(ORBIT_INC), z: Math.sin(ORBIT_INC) }, prec);
    var e2 = norm(cross(Norb, radial));
    var moon = {
      x: earth.x + MOON_ORBIT * (radial.x * Math.cos(ma) + e2.x * Math.sin(ma)),
      y: earth.y + MOON_ORBIT * (radial.y * Math.cos(ma) + e2.y * Math.sin(ma)),
      z: earth.z + MOON_ORBIT * (radial.z * Math.cos(ma) + e2.z * Math.sin(ma))
    };
    // 月亮：纯球体（无表面）
    items.push(discItem(moon, MOON_R, 0.27));
    return items;
  }

  // 最外圈固定环（正对镜头，花边沿自身平面缓慢自转）：双层沟边 + 内部流线花边，画在背景层
  function drawOuterRing(t) {
    var Ri = 435, Ro = 495, cx = CX, cy = CY;
    ctx.beginPath();
    ctx.arc(cx, cy, Ro, 0, Math.PI * 2);
    ctx.arc(cx, cy, Ri, 0, Math.PI * 2, true);
    ctx.fillStyle = COL_BG;
    ctx.fill();
    // 双层沟边：外圆、外沟内线、内沟内线、内圆（4 条同心圆）
    var edges = [Ro, Ro - 10, Ri + 10, Ri];
    for (var e = 0; e < edges.length; e++) {
      ctx.beginPath();
      ctx.arc(cx, cy, edges[e], 0, Math.PI * 2);
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = (e === 0 || e === 3) ? 0.36 : 0.22;
      ctx.stroke();
    }
    // 内部流线花边：三条交错波浪线（柔和流线，沿圆周连续，整体缓慢自转）
    var Rm = (Ri + Ro) / 2;
    var rot = t * 0.05;   // 花边沿自身平面缓慢自转
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 0.22;
    for (var w = 0; w < 3; w++) {
      var baseR = Rm + (w - 1) * 10;
      var phase = w * 2 * Math.PI / 3;
      ctx.beginPath();
      for (var i = 0; i <= 360; i++) {
        var a = i * Math.PI / 180;
        var wave = Math.sin((a + rot) * 24 + phase) * 6;
        var r = baseR + wave;
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // 星空与星座（固定随机位置，随球缓慢旋转 + 轻微径向浮动）
  var stars = [], constellations = [];
  (function initStars() {
    for (var i = 0; i < 150; i++) {
      var lon = Math.random() * 360;
      var lat = Math.asin(Math.random() * 2 - 1) * 180 / Math.PI;
      var r = 425 * (0.3 + Math.random() * 0.55);
      stars.push({ lon: lon, lat: lat, r: r, size: 0.4 + Math.random() * 1.1, bright: 0.25 + Math.random() * 0.65, phase: Math.random() * Math.PI * 2 });
    }
    // 固定星座（真实星座简化图案，非随机）
    var CONSDATA = [
      { cl: 150, cb: 55, r: 340, s: [[0,0],[10,2],[18,4],[26,6],[40,8],[52,10],[58,12]], e: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[3,0]] },
      { cl: 20, cb: 62, r: 300, s: [[-10,5],[-5,0],[0,8],[5,0],[10,5]], e: [[0,1],[1,2],[2,3],[3,4]] },
      { cl: 80, cb: 0, r: 360, s: [[-15,12],[-10,14],[0,0],[5,0],[10,0],[8,-14],[-8,-14]], e: [[0,1],[1,2],[2,4],[4,6],[6,5],[5,3],[3,0]] },
      { cl: 300, cb: 40, r: 320, s: [[0,12],[-8,0],[0,0],[8,0],[0,-16]], e: [[0,2],[1,2],[3,2],[2,4]] },
      { cl: 280, cb: 38, r: 300, s: [[0,14],[-6,5],[6,5],[-3,0],[3,0]], e: [[0,1],[0,2],[1,3],[2,4],[3,4]] },
      { cl: 250, cb: -30, r: 340, s: [[0,0],[-12,8],[-8,18],[-2,24],[8,18],[14,6]], e: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]] },
      { cl: 160, cb: 15, r: 320, s: [[0,0],[-10,6],[-18,12],[-8,10],[2,14],[14,8],[4,0]], e: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,0]] },
      { cl: 340, cb: 20, r: 340, s: [[-14,10],[14,10],[14,-10],[-14,-10]], e: [[0,1],[1,2],[2,3],[3,0]] }
    ];
    for (var c = 0; c < CONSDATA.length; c++) {
      var cd = CONSDATA[c];
      var cs = [];
      for (var si = 0; si < cd.s.length; si++) {
        cs.push({ lon: cd.cl + cd.s[si][0], lat: cd.cb + cd.s[si][1], r: cd.r });
      }
      constellations.push({ stars: cs, edges: cd.e, driftLon: (Math.random() - 0.5) * 0.015, driftLat: (Math.random() - 0.5) * 0.01 });
    }
  })();
  function starProject(st, rotDeg) {
    var la = (st.lon + rotDeg) * Math.PI / 180, ph = st.lat * Math.PI / 180;
    var x = st.r * Math.cos(ph) * Math.cos(la), y = st.r * Math.sin(ph), z = st.r * Math.cos(ph) * Math.sin(la);
    var tp = tilts({ x: x, y: y, z: z });
    return { x: CX + tp.x, y: CY - tp.y, z: tp.z };
  }
  function drawStars(t) {
    var rotDeg = t * 0.06 * 180 / Math.PI;
    ctx.fillStyle = COL_LINE;
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var rr = st.r * (1 + 0.03 * Math.sin(t * 0.5 + st.phase));
      var p = starProject({ lon: st.lon, lat: st.lat, r: rr }, rotDeg);
      ctx.globalAlpha = st.bright * 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, st.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (var c = 0; c < constellations.length; c++) {
      var cg = constellations[c];
      var cs = cg.stars;
      var dLon = cg.driftLon * t;   // 星座缓慢漂移
      var dLat = cg.driftLat * t;
      var pps = [];
      for (var s = 0; s < cs.length; s++) {
        pps.push(starProject({ lon: cs[s].lon + dLon, lat: cs[s].lat + dLat, r: cs[s].r }, rotDeg));
      }
      ctx.strokeStyle = COL_LINE; ctx.lineWidth = 0.3; ctx.globalAlpha = 0.4;
      ctx.beginPath();
      for (var e = 0; e < cg.edges.length; e++) {
        var ea = pps[cg.edges[e][0]], eb = pps[cg.edges[e][1]];
        ctx.moveTo(ea.x, ea.y);
        ctx.lineTo(eb.x, eb.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.8; ctx.fillStyle = COL_LINE;
      for (var s2 = 0; s2 < pps.length; s2++) {
        ctx.beginPath();
        ctx.arc(pps[s2].x, pps[s2].y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // 镂空经纬线球（3D、缓慢自转、只显示经纬线）：12 条经线 + 10 条纬线
  function sphereWireframe(t) {
    var R = 420;   // 球半径略小于外圈环内径 435，完全处于环内部
    var items = [];
    var rotDeg = t * 0.06 * 180 / Math.PI;   // 缓慢自转
    // 12 条经线（每 30°）
    for (var lon = 0; lon < 360; lon += 30) {
      var la = (lon + rotDeg) * Math.PI / 180;
      var pts = [];
      for (var lat = -90; lat <= 90; lat += 4) {
        var ph = lat * Math.PI / 180;
        var wp = { x: R * Math.cos(ph) * Math.cos(la), y: R * Math.sin(ph), z: R * Math.cos(ph) * Math.sin(la) };
        pts.push(tilts(wp));
      }
      for (var k = 0; k < pts.length - 1; k++) {
        // 透视投影（与可动环一致，保证图层关系正确）
        var zz = (pts[k].z + pts[k + 1].z) / 2 + 2;   // 真实深度 + 2 偏置，避免与可动环面片同深度时排序冲突
        items.push({ z: zz, kind: 'wire', a: proj(pts[k].x, pts[k].y, pts[k].z), b: proj(pts[k + 1].x, pts[k + 1].y, pts[k + 1].z) });
      }
    }
    // 10 条纬线
    var lats = [-72, -56, -40, -24, -8, 8, 24, 40, 56, 72];
    for (var li = 0; li < lats.length; li++) {
      var ph2 = lats[li] * Math.PI / 180;
      var rho = R * Math.cos(ph2);
      var yc = R * Math.sin(ph2);
      var pts2 = [];
      for (var a2 = 0; a2 <= 360; a2 += 4) {
        var rr = (a2 + rotDeg) * Math.PI / 180;
        var wp2 = { x: rho * Math.cos(rr), y: yc, z: rho * Math.sin(rr) };
        pts2.push(tilts(wp2));
      }
      for (var k2 = 0; k2 < pts2.length - 1; k2++) {
        var zz2 = (pts2[k2].z + pts2[k2 + 1].z) / 2 + 2;
        items.push({ z: zz2, kind: 'wire', a: proj(pts2[k2].x, pts2[k2].y, pts2[k2].z), b: proj(pts2[k2 + 1].x, pts2[k2 + 1].y, pts2[k2 + 1].z) });
      }
    }
    return items;
  }

  function draw(items) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 'face') {
        ctx.beginPath();
        for (var k = 0; k < it.pts.length; k++) {
          if (k === 0) ctx.moveTo(it.pts[k].x, it.pts[k].y); else ctx.lineTo(it.pts[k].x, it.pts[k].y);
        }
        ctx.closePath();
        ctx.fillStyle = COL_BG; ctx.fill();
        ctx.strokeStyle = COL_LINE; ctx.lineWidth = it.side ? 0.25 : 0.31; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
      } else if (it.kind === 'disc') {
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
        if (it.sun) {
          // 太阳：轻微的径向渐变（中心暖亮、边缘背景），表现圆面发光
          var sg = ctx.createRadialGradient(it.x, it.y, it.r * 0.4, it.x, it.y, it.r);
          sg.addColorStop(0, COL_LIT);
          sg.addColorStop(1, COL_BG);
          ctx.fillStyle = sg;
        } else {
          // 地球/月亮：纯背景色填充（去掉光影，避免与板块贴图冲突）
          ctx.fillStyle = COL_BG;
        }
        ctx.fill();
        ctx.strokeStyle = COL_LINE; ctx.lineWidth = it.lw || 0.36; ctx.stroke();
      } else if (it.kind === 'flame') {
        drawFlame(it.x, it.y, it.r, it.t);
      } else if (it.kind === 'orbit') {
        ctx.strokeStyle = COL_LINE; ctx.lineWidth = 0.16;
        ctx.globalAlpha = 0.5;   // 轨道前后深浅粗细一致
        ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (it.kind === 'wire') {
        ctx.strokeStyle = COL_LINE; ctx.lineWidth = 3.5;   // 粗细增大 5 倍
        ctx.globalAlpha = 0.0625;   // 不透明度再变为原来的 50%
        ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = COL_LINE;
        ctx.lineWidth = it.lw || (it.kind === 'tick' ? 0.25 : (it.kind === 'tick-fine' ? 0.22 : 0.31));
        ctx.globalAlpha = it.kind === 'tick' ? 0.5 : (it.kind === 'tick-fine' ? 0.55 : 0.6);
        ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  var T = 0;                                   // 太阳系动画累计时间（秒）
  function render() {
    var rect = cv.getBoundingClientRect();
    if (!rect.width) return;
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    var sc = dpr * rect.width / W;
    var sy = dpr * rect.height / H;
    ctx.setTransform(sc, 0, 0, sy, 0, 0);
    ctx.clearRect(0, 0, W, H);
    readColors();
    drawOuterRing(T);  // 最外圈花边环（背景层，花边沿自身平面缓慢自转）
    drawStars(T);      // 星空与星座（背景层，球笼内浮动）
    var items = [];
    items = items.concat(sphereWireframe(T));   // 镂空经纬线球（背景层）
    rings.forEach(function (rg) { items = items.concat(ringItems(rg, rg.self, rg.prec)); });
    items = items.concat(solarItems(T));
    items.sort(function (p, q) { return q.z - p.z; });
    draw(items);
  }
  function loop() {
    rings.forEach(function (rg) {
      rg.self += rg.dir * 0.0016;
      rg.prec += rg.dir * 0.0009;
      if (rg.self > Math.PI * 2) rg.self -= Math.PI * 2;
      if (rg.prec > Math.PI * 2) rg.prec -= Math.PI * 2;
    });
    T += 0.016;
    if (T > 10000) T = 0;
    render();
    requestAnimationFrame(loop);
  }
  render();
  if (reduce) return;                        // 减少动效：静态一帧
  requestAnimationFrame(loop);
  window.addEventListener('resize', render, { passive: true });
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
