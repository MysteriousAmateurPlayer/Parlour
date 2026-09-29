/* ==========================================================================
   另一个维度 · 被吸进黑洞的那一段演出
   --------------------------------------------------------------------------
   点灯过关之后播放：
     · 星空被拉成放射状的细线，越靠中心转得越快（开普勒式的差速）
     · 中心的黑洞影子指数级膨胀，最后吞掉整个画面
     · 同时把钟表那一段（.page-head）朝黑洞方向放大 + 缓慢旋转
     · 收尾渐黑，黑屏停一下，再把控制权交回去（通常是跳转到另一个维度）
   全部用 canvas 软件绘制：不缩放整个 body、不给大范围元素加合成层，
   只对 .page-head 做一次 transform（动画结束就撤掉），避开当年顶栏闪烁的坑。
   ========================================================================== */
window.MapSuck = (function () {
  'use strict';

  var running = false;

  function play(origin, done) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (running) return;
    running = true;

    var ov = document.createElement('div');
    ov.className = 'suck';
    var cv = document.createElement('canvas');
    ov.appendChild(cv);
    document.body.appendChild(ov);

    var ctx = cv.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = 0, H = 0, maxDim = 0;

    var stage = document.querySelector('.page-head') || document.querySelector('main');

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      maxDim = Math.max(W, H);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    var ox = origin && origin.x != null ? origin.x : W / 2;
    var oy = origin && origin.y != null ? origin.y : H / 2;
    if (stage) stage.style.transformOrigin = ox + 'px ' + oy + 'px';

    /* ---------- 星尘：从外围被卷进去 ---------- */
    var N = reduce ? 0 : 300, stars = [];
    function respawn(st, first) {
      st.r = maxDim * (first ? (0.15 + Math.random() * 0.95) : (0.62 + Math.random() * 0.5));
      st.a = Math.random() * Math.PI * 2;
      st.sp = 0.55 + Math.random() * 0.9;
      st.w = 0.7 + Math.random() * 1.5;
      st.hue = Math.random() < 0.35 ? 1 : 0;   // 0 暖金 / 1 淡蓝
    }
    for (var i = 0; i < N; i++) { stars.push({}); respawn(stars[i], true); }

    var DUR = reduce ? 1100 : 4300;      // 减少动效时只留一段很短的渐黑，不至于「什么都没有」
    var t0 = performance.now();
    var raf = 0;
    var last = t0;

    function frame(now) {
      var p = Math.min(1, (now - t0) / DUR);
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // 前 72% 用来推进镜头，之后画面基本已被吞掉
      var pageP = Math.min(1, p / 0.72);
      if (stage) {
        var e = pageP * pageP;
        stage.style.transform = 'scale(' + (1 + e * 0.5).toFixed(4) + ') rotate(' + (e * 5).toFixed(3) + 'deg)';
      }

      ctx.clearRect(0, 0, W, H);

      // ① 黑幕：整页逐渐暗下去（盖住下面的真实页面）
      var veil = Math.min(1, Math.pow(p, 1.6) * 1.25);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(4,5,8,' + veil.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);

      // ② 星尘：越靠中心转得越快、走得越快
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (var j = 0; j < N; j++) {
        var s = stars[j];
        var oldR = s.r, oldA = s.a;
        s.r -= (55 + 26000 / (s.r + 60)) * s.sp * dt;
        s.a += (1.5 + 5200 / (s.r + 40)) * s.sp * dt;
        if (s.r < 5) { respawn(s, false); continue; }

        var x0 = ox + Math.cos(oldA) * oldR, y0 = oy + Math.sin(oldA) * oldR;
        var x1 = ox + Math.cos(s.a) * s.r, y1 = oy + Math.sin(s.a) * s.r;
        var near = 1 - Math.min(1, s.r / (maxDim * 0.7));
        var al = (0.10 + 0.62 * near) * (1 - veil * 0.55);
        if (al <= 0.01) continue;
        ctx.strokeStyle = s.hue
          ? 'rgba(150,190,246,' + al.toFixed(3) + ')'
          : 'rgba(226,196,132,' + al.toFixed(3) + ')';
        ctx.lineWidth = s.w * (0.5 + near * 1.6);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      // ③ 黑洞影子：指数级膨胀，最后吞掉整个画面
      var grow = Math.pow(p, 3.1);
      var coreR = 6 + maxDim * 1.55 * grow;
      ctx.globalCompositeOperation = 'source-over';

      // 视界外侧的一圈吸积光
      if (veil < 0.98) {
        var halo = ctx.createRadialGradient(ox, oy, coreR * 0.96, ox, oy, coreR * 2.1);
        halo.addColorStop(0, 'rgba(226,196,132,0.30)');
        halo.addColorStop(0.35, 'rgba(180,140,70,0.12)');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.arc(ox, oy, coreR * 2.1, 0, Math.PI * 2);
        ctx.fillStyle = halo; ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.beginPath(); ctx.arc(ox, oy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = '#030407';
      ctx.fill();

      // ④ 收尾：全黑之后再停一下
      if (p >= 1) {
        ctx.fillStyle = '#030407';
        ctx.fillRect(0, 0, W, H);
        window.setTimeout(finish, 260);
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function finish() {
      cancelAnimationFrame(raf);
      if (stage) stage.style.transform = '';
      if (done) done();
      window.setTimeout(function () {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        running = false;
      }, 400);
    }

    raf = requestAnimationFrame(frame);
  }

  return { play: play };
})();
