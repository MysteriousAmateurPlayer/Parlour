/* ==========================================================================
   里版入口 · 答案校验
   --------------------------------------------------------------------------
   原理：把访客输入的答案做 SHA-256，与页面上的 data-hash 比对。
        答案本身不会出现在 HTML 里，但仍属于「软门禁」——
        真正的私密内容请见 README 里的加密方案说明。
   扩展点：如果你想改成多道谜题、或者解出后解锁别的东西，
        只要在 unlock() 里追加逻辑即可。
   ========================================================================== */
(function () {
  'use strict';

  var gate = document.querySelector('[data-vault-gate]');
  if (!gate) return;

  var hash = (gate.getAttribute('data-hash') || '').toLowerCase();
  var storageKey = gate.getAttribute('data-storage-key') || 'map-vault-unlocked';
  var lockPanel = gate.querySelector('[data-vault-lock]');
  var content = gate.querySelector('[data-vault-content]');
  var form = gate.querySelector('[data-vault-form]');
  var input = gate.querySelector('#vault-answer');
  var msg = gate.querySelector('[data-vault-msg]');
  var relock = gate.querySelector('[data-vault-lock-again]');

  /* ---------- 工具 ---------- */
  function normalize(value) {
    // 去掉首尾空白与所有空格，统一大写，让答案更宽容一点
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
      for (var i = 0; i < view.length; i++) {
        out += view[i].toString(16).padStart(2, '0');
      }
      return out;
    });
  }

  function setMessage(text, kind) {
    if (!msg) return;
    msg.textContent = text || '';
    msg.classList.remove('gate__msg--ok', 'gate__msg--error');
    if (kind) msg.classList.add('gate__msg--' + kind);
  }

  /* ---------- 解锁 / 上锁 ---------- */
  function unlock(remember) {
    if (lockPanel) lockPanel.hidden = true;
    if (content) content.hidden = false;
    if (remember) {
      try { sessionStorage.setItem(storageKey, hash); } catch (e) {}
    }
  }

  function lock() {
    if (content) content.hidden = true;
    if (lockPanel) lockPanel.hidden = false;
    setMessage('', null);
    if (input) input.value = '';
    try { sessionStorage.removeItem(storageKey); } catch (e) {}
    if (input) input.focus();
  }

  /* ---------- 本次会话里已经解过就直接放行 ---------- */
  var unlocked = false;
  try { unlocked = sessionStorage.getItem(storageKey) === hash; } catch (e) {}
  if (unlocked) unlock(false);

  /* ---------- 提交答案 ---------- */
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = normalize(input ? input.value : '');
      if (!value) {
        setMessage('先写点什么吧。', 'error');
        return;
      }

      setMessage('正在核对…', null);
      sha256(value).then(function (digest) {
        if (digest === hash) {
          setMessage('答案正确。', 'ok');
          unlock(true);
        } else {
          setMessage('不对。再想想？', 'error');
          gate.classList.add('is-shaking');
          window.setTimeout(function () { gate.classList.remove('is-shaking'); }, 500);
          if (input) { input.select(); }
        }
      }).catch(function (err) {
        setMessage('校验失败：' + err.message, 'error');
      });
    });
  }

  if (relock) relock.addEventListener('click', lock);
})();
