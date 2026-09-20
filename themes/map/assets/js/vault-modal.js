/* ==========================================================================
   里版问答弹窗
   --------------------------------------------------------------------------
   点首页场景里的星星 / 彩虹 / 潮汐（或页头的锁、页脚的里版入口）时弹出。
   答对后：把解锁标记写进 sessionStorage，然后跳到里版页——里版页的
   vault-gate.js 会读到这个标记，直接显示内容。
   答案校验方式与 vault-gate.js 完全一致：去掉空白 → 转大写 → SHA-256。
   ========================================================================== */
(function () {
  'use strict';

  var modal = document.getElementById('vault-modal');
  if (!modal) return;

  var hash = (modal.getAttribute('data-hash') || '').toLowerCase();
  var storageKey = modal.getAttribute('data-storage-key') || 'map-vault-unlocked';
  var targetUrl = modal.getAttribute('data-url') || '/vault/';
  var form = modal.querySelector('[data-vault-form]');
  var input = modal.querySelector('#vault-modal-answer');
  var msg = modal.querySelector('[data-vault-msg]');
  var card = modal.querySelector('.vault-modal__card');
  var lastFocus = null;

  function normalize(value) {
    return (value || '').replace(/\s+/g, '').toUpperCase();
  }

  function sha256(text) {
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error('当前环境不支持 Web Crypto'));
    }
    var bytes = new TextEncoder().encode(text);
    return window.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      var view = new Uint8Array(buf);
      var out = '';
      for (var i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0');
      return out;
    });
  }

  function setMessage(text, kind) {
    if (!msg) return;
    msg.textContent = text || '';
    msg.classList.remove('gate__msg--ok', 'gate__msg--error');
    if (kind) msg.classList.add('gate__msg--' + kind);
  }

  function open() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('is-modal-open');
    setMessage('', null);
    // 让入场动画每次都跑一遍
    if (card) { card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; }
    if (input) { input.value = ''; setTimeout(function () { input.focus(); }, 60); }
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('is-modal-open');
    setMessage('', null);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- 触发点：任何带 data-vault-open 的链接 ---------- */
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest ? e.target.closest('[data-vault-open]') : null;
    if (!trigger) return;
    // 已经解锁过（本次会话答对过）就直接去里版，不再问一遍
    var unlocked = false;
    try { unlocked = sessionStorage.getItem(storageKey) === hash; } catch (err) {}
    if (unlocked) return;             // 让它按普通链接跳转
    e.preventDefault();
    open();
  });

  modal.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-vault-close]')) close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  /* ---------- 提交答案 ---------- */
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = normalize(input ? input.value : '');
      if (!value) { setMessage('先写点什么吧。', 'error'); return; }

      setMessage('正在核对…', null);
      sha256(value).then(function (digest) {
        if (digest === hash) {
          setMessage('答案正确，正在进入里版…', 'ok');
          try { sessionStorage.setItem(storageKey, hash); } catch (err) {}
          setTimeout(function () { window.location.href = targetUrl; }, 450);
        } else {
          setMessage('不对。再想想？', 'error');
          if (card) {
            card.classList.add('is-shaking');
            setTimeout(function () { card.classList.remove('is-shaking'); }, 500);
          }
          if (input) input.select();
        }
      }).catch(function (err) {
        setMessage('校验失败：' + err.message + '（可以直接打开里版页试试）', 'error');
      });
    });
  }

  /* ---------- 用 ?vault=1 打开就能直接看到弹窗（方便测试/分享） ---------- */
  try {
    if (new URLSearchParams(window.location.search).get('vault') === '1') open();
  } catch (e) {}
})();
