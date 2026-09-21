/* ══════════════════════════════════════════════════════════════
   Tonia Travel · 全站共享交互层
   ---------------------------------------------------------------
   ① 主题管理：手动浅色 / 手动深色 / 自定义时段（支持跨零点）/ 跟随系统
   ② 增强粒子背景：鼠标斥力 + 光标光晕 + 点击涟漪冲击波
   ③ 首屏加载动画（自动填充 #loader 内容）
   ④ 左侧导航交互：方案页签切换（data-plan）/ 章节锚点滚动（data-target）

   页面只需放好 DOM 骨架，行为全部由本文件接管：
     <canvas id="fx"></canvas>
     <div id="loader"></div>
     <aside class="rail"> … </aside>

   对外 API（window.TG）：
     TG.loaderDone()      提前结束加载动画（如等地图就绪后）
     TG.setTheme(mode)    代码方式切换主题
     TG.theme             当前生效的 'light' | 'dark'
   派发事件：
     document 'tg:theme'  {dark, mode}   主题变化
     document 'tg:plan'   {plan}         方案页签切换
     document 'tg:anchor' {id}           锚点被点击
   ══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var THEME_KEY = 'tg-theme-v1';
    var TG = window.TG = window.TG || {};

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    function reduceMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /* ══════════════════════════════════════════════════════════
       ① 主题管理
       ══════════════════════════════════════════════════════════ */
    var Theme = (function () {
        var DEFAULTS = { mode: 'system', darkStart: '19:00', darkEnd: '07:00' };
        var cfg = { mode: DEFAULTS.mode, darkStart: DEFAULTS.darkStart, darkEnd: DEFAULTS.darkEnd };
        try {
            var raw = localStorage.getItem(THEME_KEY);
            if (raw) {
                var saved = JSON.parse(raw) || {};
                if (saved.mode) cfg.mode = saved.mode;
                if (saved.darkStart) cfg.darkStart = saved.darkStart;
                if (saved.darkEnd) cfg.darkEnd = saved.darkEnd;
            }
        } catch (e) { }

        var root = document.documentElement;
        var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
        var ticker = null;

        function toMin(s) {
            var a = String(s || '').split(':');
            var h = parseInt(a[0], 10), m = parseInt(a[1], 10);
            if (isNaN(h)) h = 0;
            if (isNaN(m)) m = 0;
            return h * 60 + m;
        }
        /* 支持跨零点，例如 19:00 → 07:00 */
        function inSchedule() {
            var d = new Date(), cur = d.getHours() * 60 + d.getMinutes();
            var s = toMin(cfg.darkStart), e = toMin(cfg.darkEnd);
            if (s === e) return false;
            return s < e ? (cur >= s && cur < e) : (cur >= s || cur < e);
        }
        function resolve() {
            if (cfg.mode === 'dark') return true;
            if (cfg.mode === 'light') return false;
            if (cfg.mode === 'schedule') return inSchedule();
            return !!(mql && mql.matches);
        }
        function label() {
            if (cfg.mode === 'light') return '浅色 · 手动';
            if (cfg.mode === 'dark') return '深色 · 手动';
            if (cfg.mode === 'schedule') {
                return (inSchedule() ? '深色' : '浅色') + ' · ' + cfg.darkStart + '–' + cfg.darkEnd + ' 时段';
            }
            return (mql && mql.matches ? '深色' : '浅色') + ' · 跟随系统';
        }

        function apply(silent) {
            if (ticker) { clearInterval(ticker); ticker = null; }
            var dark = resolve();
            root.setAttribute('data-theme', dark ? 'dark' : 'light');
            TG.theme = dark ? 'dark' : 'light';
            if (!silent) {
                document.dispatchEvent(new CustomEvent('tg:theme', { detail: { dark: dark, mode: cfg.mode } }));
            }
            var txt = $('#rt-now-text');
            if (txt) txt.textContent = label();
            var dot = $('#rt-now-dot');
            if (dot) dot.style.color = dark ? '#38bdf8' : '#f59e0b';
            $$('.rt-btn').forEach(function (b) {
                b.classList.toggle('active', b.getAttribute('data-mode') === cfg.mode);
            });
            var sc = $('#rt-schedule');
            if (sc) sc.classList.toggle('on', cfg.mode === 'schedule');
            /* 按时段模式：每 30 秒核对一次，跨过设定时间点自动切换 */
            if (cfg.mode === 'schedule') {
                ticker = setInterval(function () {
                    var want = inSchedule();
                    if ((root.getAttribute('data-theme') === 'dark') !== want) apply(false);
                }, 30000);
            }
        }
        function save() { try { localStorage.setItem(THEME_KEY, JSON.stringify(cfg)); } catch (e) { } }

        function init() {
            var ds = $('#rt-dark-start'), de = $('#rt-dark-end');
            if (ds) ds.value = cfg.darkStart;
            if (de) de.value = cfg.darkEnd;
            apply(true);
            /* 首屏脚本已设过一次 data-theme，这里补齐按钮态 + 派发事件同步粒子配色 */
            document.dispatchEvent(new CustomEvent('tg:theme', { detail: { dark: resolve(), mode: cfg.mode } }));

            $$('.rt-btn').forEach(function (btn) {
                function go() {
                    cfg.mode = btn.getAttribute('data-mode');
                    save(); apply(false);
                }
                btn.addEventListener('click', go);
                btn.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
                });
            });

            function onTime() {
                if (ds && ds.value) cfg.darkStart = ds.value;
                if (de && de.value) cfg.darkEnd = de.value;
                save();
                if (cfg.mode !== 'schedule') cfg.mode = 'schedule';
                apply(false);
            }
            if (ds) ds.addEventListener('change', onTime);
            if (de) de.addEventListener('change', onTime);

            if (mql) {
                var onSys = function () { if (cfg.mode === 'system') apply(false); };
                if (mql.addEventListener) mql.addEventListener('change', onSys);
                else if (mql.addListener) mql.addListener(onSys);
            }

            /* 移动端浮动开关 */
            var fab = $('#rt-fab'), panel = $('#rail-theme');
            if (fab && panel) {
                fab.addEventListener('click', function (e) {
                    e.stopPropagation();
                    panel.classList.toggle('open');
                });
                document.addEventListener('click', function (e) {
                    if (!panel.classList.contains('open')) return;
                    if (panel.contains(e.target) || e.target === fab) return;
                    panel.classList.remove('open');
                });
            }

            /* 其他标签页改了主题 → 同步 */
            window.addEventListener('storage', function (e) {
                if (e.key !== THEME_KEY || !e.newValue) return;
                try {
                    var s = JSON.parse(e.newValue) || {};
                    if (s.mode) cfg.mode = s.mode;
                    if (s.darkStart) { cfg.darkStart = s.darkStart; if (ds) ds.value = s.darkStart; }
                    if (s.darkEnd) { cfg.darkEnd = s.darkEnd; if (de) de.value = s.darkEnd; }
                    apply(false);
                } catch (err) { }
            });
        }
        return { init: init, apply: apply, current: resolve };
    })();

    TG.setTheme = function (mode) {
        try { localStorage.setItem(THEME_KEY, JSON.stringify({ mode: mode })); } catch (e) { }
        location.reload();
    };

    /* ══════════════════════════════════════════════════════════
       ② 增强粒子背景
       ══════════════════════════════════════════════════════════ */
    function initFX() {
        var canvas = document.getElementById('fx');
        if (!canvas || !canvas.getContext) return;
        if (reduceMotion()) return;

        var ctx = canvas.getContext('2d');
        var W = 0, H = 0, DPR = 1;
        var parts = [], N = 0;
        var mouse = { x: -9999, y: -9999, px: -9999, py: -9999, vx: 0, vy: 0, active: false };
        var ripples = [], bursts = [];
        var raf = null, running = true;
        var LINK = 130;        /* 粒子互相连线距离 */
        var MOUSE_R = 170;     /* 鼠标影响半径 */

        function css(name, fb) {
            var v = getComputedStyle(document.documentElement).getPropertyValue(name);
            return (v || '').trim() || fb;
        }
        var DOT = css('--fx-dot', '110,160,210');
        var LINE = css('--fx-line', '90,140,195');
        function refreshColors() {
            DOT = css('--fx-dot', '110,160,210');
            LINE = css('--fx-line', '90,140,195');
        }

        function rnd(a, b) { return a + Math.random() * (b - a); }

        function makeParticle() {
            var dir = Math.random() * Math.PI * 2;
            var speed = rnd(0.10, 0.36);
            return {
                x: Math.random() * W, y: Math.random() * H,
                vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed,
                r: rnd(0.8, 2.0), o: rnd(0.26, 0.72),
                ph: Math.random() * Math.PI * 2, sp: rnd(0.006, 0.018),
                temp: false
            };
        }
        function build() {
            parts = [];
            for (var i = 0; i < N; i++) parts.push(makeParticle());
        }
        function size() {
            DPR = Math.min(window.devicePixelRatio || 1, 2);
            W = canvas.clientWidth || window.innerWidth;
            H = canvas.clientHeight || window.innerHeight;
            canvas.width = Math.floor(W * DPR);
            canvas.height = Math.floor(H * DPR);
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            /* 粒子数按视口面积自适应：小屏省电，大屏够密 */
            N = Math.round(Math.min(112, Math.max(32, (W * H) / 16000)));
            build();
        }

        function step() {
            ctx.clearRect(0, 0, W, H);

            /* 鼠标位移速度 → 用于"带着粒子走"的拖尾感 */
            mouse.vx = mouse.x - mouse.px;
            mouse.vy = mouse.y - mouse.py;
            mouse.px = mouse.x; mouse.py = mouse.y;
            var mvx = Math.max(-14, Math.min(14, mouse.vx));
            var mvy = Math.max(-14, Math.min(14, mouse.vy));

            /* ── 物理更新 ── */
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i];
                p.ph += p.sp;

                if (p.temp) {
                    /* 点击迸发出的临时粒子：快速衰减后移除 */
                    p.vx *= 0.94; p.vy *= 0.94;
                    if (Math.abs(p.vx) < 0.06 && Math.abs(p.vy) < 0.06) { parts.splice(i, 1); i--; continue; }
                } else if (mouse.active) {
                    var dx = p.x - mouse.x, dy = p.y - mouse.y;
                    var d2 = dx * dx + dy * dy;
                    if (d2 < MOUSE_R * MOUSE_R && d2 > 0.02) {
                        var d = Math.sqrt(d2);
                        var f = 1 - d / MOUSE_R;
                        f = f * f * 0.9;                  /* 越近排斥越强 */
                        p.vx += (dx / d) * f;
                        p.vy += (dy / d) * f;
                        p.vx += mvx * 0.014 * (1 - d / MOUSE_R);
                        p.vy += mvy * 0.014 * (1 - d / MOUSE_R);
                    }
                }

                /* 阻尼 + 限速，避免被鼠标推到失控 */
                p.vx *= 0.975; p.vy *= 0.975;
                var s2 = p.vx * p.vx + p.vy * p.vy;
                var MIN = 0.06, MAX = 2.6;
                if (s2 > MAX * MAX) { var k = MAX / Math.sqrt(s2); p.vx *= k; p.vy *= k; }
                else if (!p.temp && s2 < MIN * MIN) {
                    var a = Math.random() * Math.PI * 2;
                    p.vx += Math.cos(a) * 0.045; p.vy += Math.sin(a) * 0.045;
                }

                p.x += p.vx; p.y += p.vy;

                /* 出界环绕，保证密度恒定 */
                if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
                if (p.y < -20) p.y = H + 20; else if (p.y > H + 20) p.y = -20;
            }

            /* ── 连线 ── */
            ctx.lineWidth = 0.7;
            for (var a = 0; a < parts.length; a++) {
                var pa = parts[a];
                for (var b = a + 1; b < parts.length; b++) {
                    var pb = parts[b];
                    var ddx = pa.x - pb.x, ddy = pa.y - pb.y;
                    if (ddx > LINK || ddx < -LINK || ddy > LINK || ddy < -LINK) continue;
                    var dd = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (dd > LINK) continue;
                    ctx.strokeStyle = 'rgba(' + LINE + ',' + ((1 - dd / LINK) * 0.30).toFixed(3) + ')';
                    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
                }
                /* 与鼠标连线：越近越亮，这是"手伸进星空"的核心观感 */
                if (mouse.active) {
                    var mdx = pa.x - mouse.x, mdy = pa.y - mouse.y;
                    var md = Math.sqrt(mdx * mdx + mdy * mdy);
                    if (md < MOUSE_R) {
                        ctx.strokeStyle = 'rgba(' + DOT + ',' + ((1 - md / MOUSE_R) * 0.5).toFixed(3) + ')';
                        ctx.lineWidth = 1.0;
                        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
                        ctx.lineWidth = 0.7;
                    }
                }
            }

            /* ── 粒子本体（各自呼吸） ── */
            for (var c = 0; c < parts.length; c++) {
                var q = parts[c];
                ctx.fillStyle = 'rgba(' + DOT + ',' + (q.o * (0.72 + 0.28 * Math.sin(q.ph))).toFixed(3) + ')';
                ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.2832); ctx.fill();
            }

            /* ── 光标光晕 ── */
            if (mouse.active) {
                var g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, MOUSE_R * 0.95);
                g.addColorStop(0, 'rgba(' + DOT + ',0.15)');
                g.addColorStop(1, 'rgba(' + DOT + ',0)');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(mouse.x, mouse.y, MOUSE_R * 0.95, 0, 6.2832); ctx.fill();
            }

            /* ── 点击涟漪 ── */
            for (var r = ripples.length - 1; r >= 0; r--) {
                var rp = ripples[r];
                rp.t++;
                var prog = rp.t / rp.life;
                if (prog >= 1) { ripples.splice(r, 1); continue; }
                ctx.strokeStyle = 'rgba(' + DOT + ',' + ((1 - prog) * 0.55).toFixed(3) + ')';
                ctx.lineWidth = 2 * (1 - prog) + 0.4;
                ctx.beginPath(); ctx.arc(rp.x, rp.y, prog * 132, 0, 6.2832); ctx.stroke();
            }
            ctx.lineWidth = 0.7;

            for (var t = bursts.length - 1; t >= 0; t--) {
                bursts[t].t++;
                if (bursts[t].t > bursts[t].life) bursts.splice(t, 1);
            }

            if (running) raf = requestAnimationFrame(step);
        }

        function addBurst(x, y) {
            bursts.push({ t: 0, life: 60 });
            if (bursts.length > 6) bursts.shift();
            var dir = Math.random() * Math.PI * 2;
            parts.push({
                x: x, y: y, vx: Math.cos(dir) * 1.5, vy: Math.sin(dir) * 1.5,
                r: rnd(1.0, 1.8), o: 0.95, ph: 0, sp: 0.02, temp: true
            });
            if (parts.length > N + 24) parts.splice(N, 1);
        }

        function setMouse(e) {
            var rect = canvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
            if (!mouse.active) { mouse.px = mouse.x; mouse.py = mouse.y; }
            mouse.active = true;
        }
        function clearMouse() { mouse.active = false; mouse.x = mouse.y = -9999; }

        window.addEventListener('mousemove', setMouse, { passive: true });
        document.addEventListener('mouseleave', clearMouse);
        window.addEventListener('touchmove', function (e) {
            if (e.touches && e.touches[0]) setMouse(e.touches[0]);
        }, { passive: true });
        window.addEventListener('touchend', clearMouse, { passive: true });

        window.addEventListener('click', function (e) {
            var rect = canvas.getBoundingClientRect();
            var x = e.clientX - rect.left, y = e.clientY - rect.top;
            ripples.push({ x: x, y: y, t: 0, life: 52 });
            if (ripples.length > 5) ripples.shift();
            addBurst(x, y);
            /* 点击冲击波：把周围粒子往外推一下 */
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i];
                var dx = p.x - x, dy = p.y - y, d = Math.sqrt(dx * dx + dy * dy);
                if (d < 190 && d > 0.02) {
                    var f = (1 - d / 190) * 3.4;
                    p.vx += (dx / d) * f; p.vy += (dy / d) * f;
                }
            }
        });

        /* 切主题时刷新粒子配色（浅色=雾蓝，深色=霓虹青） */
        document.addEventListener('tg:theme', refreshColors);

        /* 切到后台就停，省电 */
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                running = false;
                if (raf) { cancelAnimationFrame(raf); raf = null; }
            } else if (!running) {
                running = true;
                raf = requestAnimationFrame(step);
            }
        });

        var rz;
        window.addEventListener('resize', function () {
            clearTimeout(rz);
            rz = setTimeout(size, 180);
        });

        size();
        raf = requestAnimationFrame(step);
    }

    /* ══════════════════════════════════════════════════════════
       ③ 首屏加载动画
       ══════════════════════════════════════════════════════════ */
    var loaderDone = false;
    function initLoader() {
        var box = document.getElementById('loader');
        if (!box) return;

        /* 页面只写 <div id="loader"></div>，内容由这里补齐 */
        if (!box.children.length) {
            var title = box.getAttribute('data-title') || 'TONIA TRAVEL JOURNAL';
            var sub = box.getAttribute('data-sub') || 'T R A V E L   G U I D E';
            box.innerHTML =
                '<div class="ld-mark">' +
                  '<div class="ld-ring"></div>' +
                  '<div class="ld-ring arc"></div>' +
                  '<div class="ld-ring arc2"></div>' +
                  '<div class="ld-pct" data-ld-pct>0%</div>' +
                '</div>' +
                '<div class="ld-title">' + title + '</div>' +
                '<div class="ld-sub">' + sub + '</div>' +
                '<div class="ld-bar"><i data-ld-bar></i></div>' +
                '<div class="ld-hint" data-ld-hint></div>';
        }

        var pctEl = box.querySelector('[data-ld-pct]');
        var barEl = box.querySelector('[data-ld-bar]');
        var hintEl = box.querySelector('[data-ld-hint]');
        var hints = (box.getAttribute('data-hints') || '正在准备行程…|校准轮渡时刻…|接入实时天气…|加载交互地图…|就绪').split('|');
        var p = 0, hi = -1, done = false;

        function paint() {
            if (pctEl) pctEl.textContent = Math.round(p) + '%';
            if (barEl) barEl.style.width = p + '%';
            var span = 92 / hints.length;
            var idx = Math.min(hints.length - 1, Math.floor(p / span));
            if (idx !== hi) { hi = idx; if (hintEl) hintEl.textContent = hints[idx]; }
        }

        /* 缓慢逼近 92%，真正就绪时再冲 100%——避免"进度条骗人"的观感 */
        var timer = setInterval(function () {
            if (done) return;
            p += Math.max(1.2, (92 - p) * 0.12);
            if (p > 92) p = 92;
            paint();
        }, 90);

        function finish() {
            if (done) return;
            done = true; loaderDone = true;
            clearInterval(timer);
            p = 100; paint();
            if (hintEl) hintEl.textContent = hints[hints.length - 1];
            setTimeout(function () {
                box.classList.add('done');
                setTimeout(function () { box.style.display = 'none'; }, 700);
            }, 220);
        }
        TG.loaderDone = finish;

        paint();
        /* 页面没有主动结束时，load 事件 + 3.2s 兜底，绝不卡住首屏 */
        var t0 = Date.now();
        (function wait() {
            if (done) return;
            if (Date.now() - t0 > 3200) { finish(); return; }
            setTimeout(wait, 150);
        })();
        window.addEventListener('load', function () { setTimeout(finish, 700); });
    }

    /* ══════════════════════════════════════════════════════════
       ④ 左侧导航
       ══════════════════════════════════════════════════════════ */
    function initRail() {
        var tabs = $$('.rail-tabs .ps-tab');
        if (!tabs.length) return;

        var planTabs = tabs.filter(function (t) { return t.hasAttribute('data-plan'); });
        var anchorTabs = tabs.filter(function (t) { return t.hasAttribute('data-target'); });
        /* 点击后短暂锁定自动高亮，避免平滑滚动途中的 scroll 事件抢走高亮 */
        var lockUntil = 0, ticking = false;

        function activate(tab) {
            tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
        }
        function onTab(tab) {
            if (tab.hasAttribute('data-plan')) {
                var plan = tab.getAttribute('data-plan');
                activate(tab);
                $$('.plan-view').forEach(function (v) {
                    v.classList.toggle('active', v.getAttribute('data-plan') === plan);
                });
                document.dispatchEvent(new CustomEvent('tg:plan', { detail: { plan: plan } }));
                /* 左侧栏切成顶栏时（<980px），滚动到顶；桌面端内容区自身滚动即可 */
                if (window.innerWidth <= 980 && window.scrollY > 0) {
                    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
                }
            } else if (tab.hasAttribute('data-target')) {
                var id = tab.getAttribute('data-target');
                var el = document.getElementById(id);
                if (!el) return;
                activate(tab);
                lockUntil = Date.now() + 700;
                var top = el.getBoundingClientRect().top + window.scrollY - 72;
                window.scrollTo({ top: top, behavior: reduceMotion() ? 'auto' : 'smooth' });
                document.dispatchEvent(new CustomEvent('tg:anchor', { detail: { id: id, el: el } }));
            }
        }

        /* 事件委托：替代 inline onclick，且键盘可达 */
        document.addEventListener('click', function (e) {
            var t = e.target.closest && e.target.closest('.rail-tabs .ps-tab');
            if (t) onTab(t);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var t = e.target.closest && e.target.closest('.rail-tabs .ps-tab');
            if (t) { e.preventDefault(); onTab(t); }
        });

        /* ── 锚点：滚动联动高亮 ── */
        if (!anchorTabs.length) return;

        function sync() {
            ticking = false;
            if (Date.now() < lockUntil) return;
            var ids = anchorTabs.map(function (t) { return t.getAttribute('data-target'); });
            var probe = window.scrollY + 120;
            var cur = ids[0];
            for (var i = 0; i < ids.length; i++) {
                var el = document.getElementById(ids[i]);
                if (el && el.offsetTop <= probe) cur = ids[i];
            }
            /* 滚到底部时高亮最后一个，否则末节永远点不亮 */
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
                cur = ids[ids.length - 1];
            }
            anchorTabs.forEach(function (t) {
                t.classList.toggle('active', t.getAttribute('data-target') === cur);
            });
        }
        function onScroll() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(sync);
        }
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        sync();
    }

    /* ══════════════════════════════════════════════════════════
       启动
       ══════════════════════════════════════════════════════════ */
    function boot() {
        Theme.init();
        initFX();
        initRail();
        initLoader();
        document.documentElement.setAttribute('data-ui-ready', '1');
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
