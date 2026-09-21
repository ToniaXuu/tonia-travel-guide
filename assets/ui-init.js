/* ══════════════════════════════════════════════════════════════
   Tonia Travel · 主题防闪烁初始化
   ---------------------------------------------------------------
   ⚠️ 必须以「同步脚本」引入，并放在 <head> 的最前面（在样式表之前）。
      同步脚本会阻塞渲染，浏览器不会先画出浅色再跳成深色，
      所以这里必须外链同步、不能加 defer / async。

   用法（每个页面 <head> 第一行）：
       <script src="../assets/ui-init.js"></script>
   ══════════════════════════════════════════════════════════════ */
(function () {
    var KEY = 'tg-theme-v1';

    function resolve(cfg) {
        if (cfg.mode === 'dark') return true;
        if (cfg.mode === 'light') return false;
        if (cfg.mode === 'schedule') {
            var d = new Date(), cur = d.getHours() * 60 + d.getMinutes();
            var s = String(cfg.darkStart || '19:00').split(':');
            var e = String(cfg.darkEnd || '07:00').split(':');
            var sm = parseInt(s[0], 10) * 60 + parseInt(s[1], 10);
            var em = parseInt(e[0], 10) * 60 + parseInt(e[1], 10);
            if (sm === em) return false;
            /* 支持跨零点，例如 19:00 → 07:00 */
            return sm < em ? (cur >= sm && cur < em) : (cur >= sm || cur < em);
        }
        return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    var dark = false;
    try {
        var raw = localStorage.getItem(KEY);
        var cfg = raw ? JSON.parse(raw) : { mode: 'system', darkStart: '19:00', darkEnd: '07:00' };
        dark = resolve(cfg);
    } catch (err) {
        dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme-ready', '1');
})();
