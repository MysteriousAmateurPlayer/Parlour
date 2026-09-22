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
  function frame() { advance(1); drawFrame(); raf = requestAnimationFrame(frame); }
  raf = requestAnimationFrame(frame);
  window.addEventListener('resize', function () { resize(); advance(80); drawFrame(); }, { passive: true });
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
    if (c.indexOf('--ring') >= 0) return { n: 74, mode: 'ellipse', s0: 0.16, s1: 0.4, rx: 49, ry: 15, r0: 0.66, r1: 1.02 }; // 太阳星轨椭圆
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
        el: s, rg: rg,
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
    st.born = performance.now();
  }

  function opacityAt(t) {
    if (t < 0.22) return ease(t / 0.22);                 // 丝滑淡入
    if (t < 0.58) return 1;                              // 稳定存在一小会（满亮）
    return 1 - ease((t - 0.58) / 0.42);                  // 丝滑淡出
  }

  function frame(now) {
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var t = (now - st.born) / st.life;
      if (t >= 1) { respawn(st); t = 0; }
      // ① 整体亮度降 25%
      var o = opacityAt(t) * 0.75;
      st.el.style.opacity = o < 0.02 ? '0' : o.toFixed(3);
    }
    requestAnimationFrame(frame);
  }

  /* ---- 旋臂上的星：SVG 内部元素，坐标天然贴着螺线 ---- */
  var svgStars = [];
  Array.prototype.forEach.call(document.querySelectorAll('.galaxy__sparkle'), function (el) {
    var st = { el: el, life: 3000 + rnd() * 2000, born: performance.now() - rnd() * 5000 };
    el.setAttribute('opacity', (opacityAt(Math.min(0.999, rnd())) * 0.75).toFixed(3));  // 首屏立即呈现
    svgStars.push(st);
  });
  function frameSvg(now) {
    for (var i = 0; i < svgStars.length; i++) {
      var st = svgStars[i];
      var t = (now - st.born) / st.life;
      if (t >= 1) { st.born = now; st.life = 3000 + rnd() * 2000; t = 0; }
      var o = opacityAt(t) * 0.75;                     // ① 与其它星同样降 25%
      st.el.setAttribute('opacity', o < 0.02 ? '0' : o.toFixed(3));
    }
    requestAnimationFrame(frameSvg);
  }

  if (reduce) {                                          // 减少动效：静态微亮
    for (var i = 0; i < stars.length; i++) stars[i].el.style.opacity = '0.26';
    for (var i2 = 0; i2 < svgStars.length; i2++) svgStars[i2].el.setAttribute('opacity', '0.2');
    return;
  }
  requestAnimationFrame(frame);
  if (svgStars.length) requestAnimationFrame(frameSvg);
  // 布局变化后（例如页脚进入视口）重新测量容器尺寸无需处理：坐标是百分比，天然自适应
})();
