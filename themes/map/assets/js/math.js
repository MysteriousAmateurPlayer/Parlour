/* ==========================================================================
   KaTeX 自动渲染：把正文里的 $$...$$ 与 \(...\) / $...$ 渲染成公式
   仅在 front matter 写了 math: true 的页面加载本脚本。
   ========================================================================== */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    if (typeof window.renderMathInElement !== 'function') {
      // KaTeX 没加载成功时不要报错刷屏，安静退出
      return;
    }

    var target = document.querySelector('.prose') || document.body;

    window.renderMathInElement(target, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false }
      ],
      // \ce{...} 由 mhchem 扩展提供（已随 KaTeX 一起加载）
      throwOnError: false,
      errorColor: '#b03a35',
      strict: false,
      trust: false
    });
  });
})();
