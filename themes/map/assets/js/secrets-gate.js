/* ==========================================================================
   另一个维度 · 页面门禁
   --------------------------------------------------------------------------
   只做一件事：按 window.MapSecrets 里的解锁状态，决定显示「去找那颗星星」
   还是显示隐藏内容。真正的问答与星图点灯都在 secrets-modal.js 里。
   ========================================================================== */
(function () {
  'use strict';

  var S = window.MapSecrets;
  var root = document.querySelector('[data-secrets-gate]');
  if (!S || !root) return;

  var lock = root.querySelector('[data-secrets-lock]');
  var content = root.querySelector('[data-secrets-content]');

  function paint() {
    var on = S.isUnlocked();
    if (lock) lock.hidden = on;
    if (content) content.hidden = !on;
    S.paintHeaderEntries();
  }

  paint();
  // 弹窗里解锁后会整页跳转过来，这里再兜一次（比如从别的标签页解锁）
  window.addEventListener('pageshow', paint);
})();
