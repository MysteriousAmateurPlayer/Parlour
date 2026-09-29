/* ==========================================================================
   另一个维度 · 锁（所有相关脚本共用）
   --------------------------------------------------------------------------
   三样东西存在 localStorage 里：
     map-secrets-key      : "1"  —— 在首页那颗特殊星星上答对日期题，拿到钥匙
     map-secrets-unlocked : "1"  —— 用钥匙打开钟心的黑洞、点灯过关（或跳过）
     map-secrets-fails    : {ym:"2026-9", n:2} —— 当月答错次数，换月自动清零

   两道门是分开的：
     ① 首页星星 → 日期题 → 钥匙
     ② 随性笔记页钟心黑洞（需要钥匙才点得动）→ 星图点灯 → 演出 → 另一个维度

   门禁是「软」的：答案以 SHA-256 存放，源码里看不到明文，
   但懂行的人清掉 localStorage 就能重来。这是仪式感，不是保险箱。
   ========================================================================== */
window.MapSecrets = (function () {
  'use strict';

  var KEY_STORE = 'map-secrets-key';
  var UNLOCK_KEY = 'map-secrets-unlocked';
  var FAIL_KEY = 'map-secrets-fails';

  function safe(fn, dflt) {
    try { return fn(); } catch (e) { return dflt; }
  }
  function monthKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1);
  }

  /* ---------- 第一道门：钥匙 ---------- */
  function hasKey() {
    return safe(function () { return localStorage.getItem(KEY_STORE) === '1'; }, false);
  }
  function giveKey() {
    safe(function () { localStorage.setItem(KEY_STORE, '1'); });
  }

  /* ---------- 第二道门：解锁状态 ---------- */
  function isUnlocked() {
    return safe(function () { return localStorage.getItem(UNLOCK_KEY) === '1'; }, false);
  }
  function unlock() {
    safe(function () { localStorage.setItem(UNLOCK_KEY, '1'); });
  }

  /* ---------- 重新上锁：清掉一切，好把整场演出再看一遍 ---------- */
  function putOn() {
    safe(function () {
      localStorage.removeItem(KEY_STORE);
      localStorage.removeItem(UNLOCK_KEY);
      localStorage.removeItem(FAIL_KEY);
    });
  }

  /* ---------- 当月答错次数 ---------- */
  function failState() {
    return safe(function () {
      var raw = localStorage.getItem(FAIL_KEY);
      if (!raw) return { ym: monthKey(), n: 0 };
      var o = JSON.parse(raw);
      if (!o || o.ym !== monthKey()) return { ym: monthKey(), n: 0 };
      return { ym: o.ym, n: o.n | 0 };
    }, { ym: monthKey(), n: 0 });
  }
  function fails() { return failState().n; }
  function addFail() {
    var s = failState();
    s.n += 1;
    safe(function () { localStorage.setItem(FAIL_KEY, JSON.stringify(s)); });
    return s.n;
  }
  function isLocked(max) {
    var m = typeof max === 'number' ? max : 3;
    return fails() > m;
  }
  function resetFails() {
    safe(function () { localStorage.removeItem(FAIL_KEY); });
  }

  /* ---------- 答案校验 ---------- */
  function sha256(text) {
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error('当前浏览器不支持 Web Crypto'));
    }
    var bytes = new TextEncoder().encode(text);
    return window.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      var view = new Uint8Array(buf), out = '';
      for (var i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0');
      return out;
    });
  }
  // 把「月」「日」拼成 M-D 再哈希（与 hugo.toml 里 answerHash 的生成方式一致）
  function answerHash(month, day) {
    return sha256(month + '-' + day);
  }

  /* ---------- 星图点灯（Lights Out）：经典的翻转谜题 ----------
     点一颗，它自己和上下左右一起翻转；全部点亮即通过。
     局面从「全亮」倒着点若干次生成，所以一定有解。 */
  function mountPuzzle(host, size, onSolved) {
    if (!host) return null;
    var n = Math.max(2, Math.min(8, (size | 0) || 4));
    var total = n * n;
    var state = [];
    var cells = [];
    var solved = false;
    var left = 0;

    function toggle(i) {
      var r = (i / n) | 0, c = i % n;
      var d = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
      for (var k = 0; k < d.length; k++) {
        var rr = r + d[k][0], cc = c + d[k][1];
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        state[rr * n + cc] = !state[rr * n + cc];
      }
    }
    function countOff() {
      var c2 = 0;
      for (var i = 0; i < total; i++) if (!state[i]) c2++;
      return c2;
    }
    function allOn() { return countOff() === 0; }
    function paint() {
      left = countOff();
      for (var i = 0; i < total; i++) {
        if (state[i]) cells[i].classList.add('is-on');
        else cells[i].classList.remove('is-on');
      }
      if (host) host.setAttribute('data-left', String(left));
    }
    function reset() {
      solved = false;
      state = [];
      for (var i = 0; i < total; i++) state.push(true);
      var k = Math.max(3, Math.round(total * 0.3)) + Math.floor(Math.random() * 4);
      for (var j = 0; j < k; j++) toggle(Math.floor(Math.random() * total));
      if (allOn()) return reset();
      paint();
    }

    host.innerHTML = '';
    host.style.setProperty('--n', n);
    for (var i = 0; i < total; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'star-puzzle__cell';
      b.setAttribute('data-i', i);
      b.setAttribute('aria-label', '第 ' + (i + 1) + ' 颗星');
      host.appendChild(b);
      cells.push(b);
    }
    host.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.star-puzzle__cell') : null;
      if (!btn || solved) return;
      toggle(parseInt(btn.getAttribute('data-i'), 10));
      paint();
      if (allOn()) {
        solved = true;
        if (onSolved) onSolved();
      }
    });
    reset();
    return { reset: reset, left: function () { return left; } };
  }

  /* ---------- 落地页：把「刚被吸进来」的黑幕收掉 ---------- */
  function clearArriving() {
    var el = document.documentElement;
    if (!el.classList.contains('is-arriving')) return;
    // 淡出动画 1.6s；等它跑完再摘掉类，免得中途重排把黑幕又拉回不透明
    window.setTimeout(function () { el.classList.remove('is-arriving'); }, 1900);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', clearArriving);
  } else {
    clearArriving();
  }

  /* ---------- 页眉上的入口：拿到钥匙且解锁之后才露出来 ---------- */
  function paintHeaderEntries() {
    var nodes = document.querySelectorAll('[data-secrets-only]');
    var on = isUnlocked();
    for (var i = 0; i < nodes.length; i++) {
      if (on) nodes[i].removeAttribute('hidden');
      else nodes[i].setAttribute('hidden', '');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paintHeaderEntries);
  } else {
    paintHeaderEntries();
  }

  return {
    hasKey: hasKey,
    giveKey: giveKey,
    isUnlocked: isUnlocked,
    unlock: unlock,
    putOn: putOn,
    fails: fails,
    addFail: addFail,
    isLocked: isLocked,
    resetFails: resetFails,
    answerHash: answerHash,
    monthKey: monthKey,
    mountPuzzle: mountPuzzle,
    paintHeaderEntries: paintHeaderEntries
  };
})();
