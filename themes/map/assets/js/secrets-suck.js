/* ==========================================================================
   另一个维度 · 被吸进黑洞的那一段演出
   --------------------------------------------------------------------------
   点灯过关之后播放：
     · 星尘沿**对数螺线**落向中心：角速度按开普勒定律 ∝ r^-1.35，越近转得越快，
       径向速度也随 r 减小而增大 —— 所以轨迹天然是越缠越紧的螺旋，不是直线
     · 每颗星保留一小段真实历史位置，再用二次曲线连成**平滑的弧**，没有折角
     · 黑洞影子指数级膨胀，最后吞掉整个画面
     · 同时把钟表那一段（.page-head）朝黑洞方向放大 + 缓慢旋转
     · 收尾渐黑后跳转；落地页由 <head> 里的内联脚本接管，缓慢淡入而不是闪现
   全部用 canvas 软件绘制：不缩放整个 body、不给大范围元素加合成层，
   只对 .page-head 做一次 transform（动画结束就撤掉），避开当年顶栏闪烁的坑。
   ========================================================================== */
window.MapSuck = (function () {
  'use strict';

  var running = false;
  var TAU = Math.PI * 2;

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

    /* ---------- 星尘：沿螺旋被卷进去 ---------- */
    var N = reduce ? 0 : 230;
    var TAIL = 7;                       // 每颗星保留几个历史点
    var stars = [];

    function respawn(st, first) {
      st.r = maxDim * (first ? (0.10 + Math.random() * 1.05) : (0.72 + Math.random() * 0.42));
      st.a = Math.random() * TAU;
      st.sp = 0.6 + Math.random() * 0.8;
      st.w = 0.6 + Math.random() * 1.3;
      st.hue = Math.random() < 0.35 ? 1 : 0;   // 0 暖金 / 1 淡蓝
      st.hist = [];
    }
    for (var i = 0; i < N; i++) { stars.push({}); respawn(stars[i], true); }

    var DUR = reduce ? 1200 : 4400;
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

      // ② 星尘：开普勒式螺旋，尾巴用二次曲线连成平滑的弧
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (var j = 0; j < N; j++) {
        var s = stars[j];

        // 角速度 ∝ r^-1.35（越近转得越快），径向速度随 r 减小而增大
        s.a += (0.3 + 700 / (s.r + 50)) * s.sp * dt;
        s.r -= (120 + 120000 / (s.r + 60)) * s.sp * dt;
        if (s.r < 5) { respawn(s, false); continue; }

        s.hist.push({ x: ox + Math.cos(s.a) * s.r, y: oy + Math.sin(s.a) * s.r });
        if (s.hist.length > TAIL) s.hist.shift();

        var h = s.hist;
        if (h.length < 2) continue;

        var near = 1 - Math.min(1, s.r / (maxDim * 0.7));
        var al = (0.09 + 0.66 * near) * (1 - veil * 0.5);
        if (al <= 0.012) continue;

        ctx.strokeStyle = s.hue
          ? 'rgba(150,190,246,' + al.toFixed(3) + ')'
          : 'rgba(226,196,132,' + al.toFixed(3) + ')';
        ctx.lineWidth = s.w * (0.45 + near * 1.5);

        ctx.beginPath();
        ctx.moveTo(h[0].x, h[0].y);
        if (h.length === 2) {
          ctx.lineTo(h[1].x, h[1].y);
        } else {
          for (var k = 1; k < h.length - 1; k++) {
            var mx = (h[k].x + h[k + 1].x) / 2, my = (h[k].y + h[k + 1].y) / 2;
            ctx.quadraticCurveTo(h[k].x, h[k].y, mx, my);
          }
          var lp = h[h.length - 1];
          ctx.lineTo(lp.x, lp.y);
        }
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
        ctx.beginPath(); ctx.arc(ox, oy, coreR * 2.1, 0, TAU);
        ctx.fillStyle = halo; ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.beginPath(); ctx.arc(ox, oy, coreR, 0, TAU);
      ctx.fillStyle = '#030407';
      ctx.fill();

      // ④ 收尾：全黑之后再停一下，然后交给落地页淡入
      if (p >= 1) {
        ctx.fillStyle = '#030407';
        ctx.fillRect(0, 0, W, H);
        window.setTimeout(finish, 300);
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
      }, 600);
    }

    raf = requestAnimationFrame(frame);
  }

  return { play: play };
})();
