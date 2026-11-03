/* 次要窗口（报告/游戏/故事卡/分享/星星）启动时套用皮肤与辅助功能 */
(function () {
  try {
    document.documentElement.dataset.skin = window.PET_SKIN || 'default';
    var a = window.PET_ACCESS || {};
    function apply() {
      document.body.classList.toggle('reduce-motion', !!a.reduceMotion);
      document.body.classList.toggle('high-contrast', !!a.highContrast);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
    else apply();
  } catch (_) {}
})();
