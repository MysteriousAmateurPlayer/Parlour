/* ==========================================================================
   另一个维度 · 页面门禁
   --------------------------------------------------------------------------
   1) 按 window.MapSecrets 里的解锁状态，决定显示「去找那颗星星」还是隐藏内容
   2) 「重新上锁」：清掉钥匙与解锁标记，回到最初的入口，好把整场演出再看一遍
   真正的问答与星图点灯都在 secrets-modal.js 里。
   ========================================================================== */
(function () {
  'use strict';

  var S = window.MapSecrets;
  var root = document.querySelector('[data-secrets-gate]');
  if (!S || !root) return;

  var lock = root.querySelector('[data-secrets-lock]');
  var content = root.querySelector('[data-secrets-content]');
  var home = root.getAttribute('data-home') || '/';

  function paint() {
    var on = S.isUnlocked();
    if (lock) lock.hidden = on;
    if (content) content.hidden = !on;
    S.paintHeaderEntries();
  }

  var relock = root.querySelector('[data-secrets-relock]');
  if (relock) {
    relock.addEventListener('click', function () {
      S.putOn();
      paint();
      window.location.href = home;      // 回到首页，从头找那颗星星
    });
  }

  paint();
  // 弹窗里解锁后会整页跳转过来，这里再兜一次（比如从别的标签页解锁）
  window.addEventListener('pageshow', paint);
})();
