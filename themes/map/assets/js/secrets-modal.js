/* ==========================================================================
   另一个维度 · 入门弹窗
   --------------------------------------------------------------------------
   触发点：星野里那颗五角星（任何带 data-secrets-open 的元素）。
   流程：选日期 →（对）→ 星图点灯 →（过）→ 解锁并进入。
        选日期当月答错超过 maxFails 次，本月就不能再试。
   所有状态都在 window.MapSecrets 里，和 secrets-gate.js 共用。
   ========================================================================== */
(function () {
  'use strict';

  var S = window.MapSecrets;

  /* ==========================================================================
     入口星：每次进页面都随机挑一颗星座星点落脚。
     · 形态是五角星（其他星都是四角），大小、亮度、颜色跟落脚的那颗完全一致，
       所以它藏在星野里，不特意看是发现不了的。
     · 落点排除地球圆盘内（那儿被遮罩挡住了，点不到）。
     ========================================================================== */
  (function () {
    var star = document.querySelector('.secrets-star');
    if (!star || !star.parentNode) return;
    var drift = star.parentNode;
    var core = star.querySelector('.secrets-star__core');

    function place() {
      var all = drift.querySelectorAll('use');
      var pool = [];
      for (var i = 0; i < all.length; i++) {
        var u = all[i];
        if ((u.getAttribute('href') || u.getAttribute('xlink:href')) !== '#star4') continue;
        var tf = u.getAttribute('transform') || '';
        // 注意：globe.js 会在运行时给每颗星补一个 rotate()，所以逐个提取而不是整体匹配
        var mt = /translate\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)\s*\)/.exec(tf);
        var ms = /scale\(\s*(-?[\d.]+)/.exec(tf);
        if (!mt || !ms) continue;
        var x = parseFloat(mt[1]), y = parseFloat(mt[2]), s = parseFloat(ms[1]);
        if (!(s > 0)) continue;
        var dx = x - 750, dy = y - 640;
        if (Math.sqrt(dx * dx + dy * dy) < 480) continue;      // 落在地球上就看不见了
        if (x < 70 || x > 1430 || y < -40 || y > 1320) continue; // 也别落在星野画布外面
        if (s < 0.3) continue;                                  // 太小的星点看不出形状、也点不着
        var mr = /rotate\(\s*(-?[\d.]+)/.exec(tf);
        pool.push({
          x: x, y: y, s: s,
          r: mr ? mr[1] : '',
          o: u.style.opacity || u.getAttribute('opacity') || ''
        });
      }
      if (!pool.length) return false;
      var p = pool[Math.floor(Math.random() * pool.length)];
      star.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
      if (core) {
        core.setAttribute('transform', (p.r ? 'rotate(' + p.r + ') ' : '') + 'scale(' + p.s + ')');
        if (p.o) core.style.opacity = p.o;
      }
      return true;
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
    else if (!place()) window.addEventListener('load', function () { place(); });
  })();

  var modal = document.getElementById('secrets-modal');
  if (!S || !modal) return;

  var hash = (modal.getAttribute('data-hash') || '').toLowerCase();
  var maxFails = parseInt(modal.getAttribute('data-maxfails'), 10);
  if (isNaN(maxFails)) maxFails = 3;
  var usePuzzle = modal.getAttribute('data-puzzle') === '1';
  var puzzleSize = parseInt(modal.getAttribute('data-puzzle-size'), 10) || 4;
  var targetUrl = modal.getAttribute('data-url') || '../secrets/';

  var stepDate = modal.querySelector('[data-secrets-step="date"]');
  var stepPuzzle = modal.querySelector('[data-secrets-step="puzzle"]');
  var form = modal.querySelector('[data-secrets-form]');
  var selMonth = modal.querySelector('[data-secrets-month]');
  var selDay = modal.querySelector('[data-secrets-day]');
  var msg = modal.querySelector('[data-secrets-msg]');
  var failsLine = modal.querySelector('[data-secrets-fails]');
  var puzzleMsg = modal.querySelector('[data-secrets-puzzle-msg]');
  var puzzleHost = modal.querySelector('[data-secrets-puzzle]');
  var puzzleResetBtn = modal.querySelector('[data-secrets-puzzle-reset]');
  var card = modal.querySelector('.secrets-modal__card');
  var lastFocus = null;
  var puzzle = null;

  function setMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('gate__msg--ok', 'gate__msg--error');
    if (kind) el.classList.add('gate__msg--' + kind);
  }

  function shake() {
    if (!card) return;
    card.classList.add('is-shaking');
    setTimeout(function () { card.classList.remove('is-shaking'); }, 500);
  }

  /* 「本月还剩几次」 */
  function paintFails() {
    if (!failsLine) return;
    if (S.isLocked(maxFails)) {
      failsLine.textContent = '本月已经没有机会了，下个月再来吧。';
      failsLine.classList.add('gate__fails--out');
      return;
    }
    var left = maxFails - S.fails();
    failsLine.classList.remove('gate__fails--out');
    failsLine.textContent = left >= maxFails ? '' : ('本月还剩 ' + left + ' 次机会。');
  }

  function goPuzzle() {
    if (!usePuzzle) { finish(); return; }
    if (stepDate) stepDate.hidden = true;
    if (stepPuzzle) stepPuzzle.hidden = false;
    if (!puzzle) puzzle = S.mountPuzzle(puzzleHost, puzzleSize, finish);
    else puzzle.reset();
    setMsg(puzzleMsg, '', null);
  }

  function finish() {
    S.unlock();
    S.paintHeaderEntries();
    setMsg(puzzleMsg, '门开了，正在进入另一个维度…', 'ok');
    setTimeout(function () { window.location.href = targetUrl; }, 600);
  }

  function open() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('is-modal-open');
    if (card) { card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; }
    if (stepPuzzle) stepPuzzle.hidden = true;
    if (stepDate) stepDate.hidden = false;
    setMsg(msg, '', null);
    setMsg(puzzleMsg, '', null);
    paintFails();

    var locked = S.isLocked(maxFails);
    if (form) form.hidden = locked;
    if (selMonth) selMonth.value = '';
    if (selDay) selDay.value = '';
    if (locked) setMsg(msg, '这个月你已经试过太多次了。下个月再来，星星会等你。', 'error');
    else setTimeout(function () { if (selMonth) selMonth.focus(); }, 60);
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('is-modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- 触发点 ---------- */
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest ? e.target.closest('[data-secrets-open]') : null;
    if (!trigger) return;
    if (S.isUnlocked()) return;          // 已解锁：当普通链接跳过去
    e.preventDefault();
    open();
  });

  modal.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-secrets-close]')) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  /* ---------- 第一道锁：日期 ---------- */
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (S.isLocked(maxFails)) { paintFails(); setMsg(msg, '本月已经没有机会了。', 'error'); return; }
      var m = selMonth ? selMonth.value : '';
      var d = selDay ? selDay.value : '';
      if (!m || !d) { setMsg(msg, '月和日都要选。', 'error'); return; }

      setMsg(msg, '正在核对…', null);
      S.answerHash(m, d).then(function (digest) {
        if (digest === hash) {
          setMsg(msg, '对上了。', 'ok');
          setTimeout(goPuzzle, 420);
          return;
        }
        var n = S.addFail();
        shake();
        paintFails();
        if (n > maxFails) {
          if (form) form.hidden = true;
          setMsg(msg, '不是这一天。本月的机会用完了 —— 下个月再来。', 'error');
        } else {
          setMsg(msg, '不是这一天。再想想？', 'error');
        }
      }).catch(function (err) {
        setMsg(msg, '校验失败：' + err.message, 'error');
      });
    });
  }

  if (puzzleResetBtn) {
    puzzleResetBtn.addEventListener('click', function () {
      if (puzzle) puzzle.reset();
      setMsg(puzzleMsg, '', null);
    });
  }

  /* 方便测试：?secrets=1 直接打开 */
  try {
    if (new URLSearchParams(window.location.search).get('secrets') === '1') open();
  } catch (e) {}
})();
