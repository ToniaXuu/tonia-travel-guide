/*!
 * TravelWeather — 旅行攻略页统一实时天气模块
 * 数据源：Open-Meteo（免 API Key / 支持跨域 / 全球 16 天预报 + 历史实况）
 *   · 未来 16 天内  → forecast API（实时 + 逐日预报 + 日出日落）
 *   · 已过去的日期  → archive API（当日真实历史天气）
 *
 * 用法（属性驱动，改 HTML 即可，无需写 JS）：
 *   1) 页面引入：<script src="../assets/weather.js"></script>
 *   2) 逐日预报格子：
 *      <div class="weather-day" data-date="2026-10-02" data-lat="38.914" data-lng="121.615" data-city="大连">
 *        <div class="weather-city">大连</div><div class="weather-date">10/02 周五</div>
 *        <div class="weather-icon">—</div><div class="weather-temp">—</div><div class="weather-desc">加载中</div>
 *      </div>
 *      · 坐标可从最近的祖先 [data-w-lat][data-w-lng] 继承（整块同城时更省事）
 *      · data-cards="#day1" → 往该容器内 .timeline-card 注入白天/夜间天气徽章
 *      · data-sun="1"      → 在描述后附日出/日落时间
 *   3) 实时天气条：<div data-weather-now><span data-now-city data-lat=".." data-lng=".." data-city="大连"></span></div>
 *   4) 更新时间：<span data-wtime></span> 或 <span id="weather-update-time"></span>
 *   5) 手动刷新某个容器：TravelWeather.refresh(element)
 */
(function (global) {
    'use strict';

    var FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
    var ARCHIVE_API = 'https://archive-api.open-meteo.com/v1/archive';
    var TIMEZONE = 'Asia/Shanghai';
    var CACHE_TTL = 20 * 60 * 1000;   // 20 分钟缓存，避免切页签重复请求
    var FORECAST_DAYS = 16;           // Open-Meteo 上限

    /* ── WMO 天气码 → 图标 / 中文描述 / 严重度（用于昼夜主天气判定） ── */
    var WMO = {
        0: ['☀️', '晴', 0],
        1: ['🌤️', '晴间少云', 0],
        2: ['⛅', '多云', 1],
        3: ['☁️', '阴', 1],
        45: ['🌫️', '雾', 2], 48: ['🌫️', '雾凇', 2],
        51: ['🌦️', '毛毛雨', 3], 53: ['🌦️', '毛毛雨', 3], 55: ['🌧️', '毛毛雨', 4],
        56: ['🌧️', '冻毛毛雨', 5], 57: ['🌧️', '冻毛毛雨', 5],
        61: ['🌦️', '小雨', 4], 63: ['🌧️', '中雨', 5], 65: ['🌧️', '大雨', 6],
        66: ['🌧️', '冻雨', 6], 67: ['🌧️', '冻雨', 6],
        71: ['🌨️', '小雪', 5], 73: ['🌨️', '中雪', 6], 75: ['❄️', '大雪', 7], 77: ['🌨️', '米雪', 4],
        80: ['🌦️', '阵雨', 4], 81: ['🌧️', '阵雨', 5], 82: ['⛈️', '强阵雨', 7],
        85: ['🌨️', '阵雪', 5], 86: ['🌨️', '强阵雪', 6],
        95: ['⛈️', '雷阵雨', 7], 96: ['⛈️', '雷阵雨伴冰雹', 8], 99: ['⛈️', '强雷暴伴冰雹', 9]
    };

    function info(code) {
        var w = WMO[code];
        return w ? { icon: w[0], text: w[1], sev: w[2] } : { icon: '🌤️', text: '未知', sev: 0 };
    }

    /* ── 工具 ── */
    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function nowParts() {
        // 固定按东八区取"今天"，避免用户机器时区不同导致 archive/forecast 选错
        var d = new Date(Date.now() + (480 + new Date().getTimezoneOffset()) * 60000);
        return {
            ymd: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
            hhmm: pad(d.getHours()) + ':' + pad(d.getMinutes())
        };
    }

    function addDays(ymd, n) {
        var p = ymd.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
        d.setUTCDate(d.getUTCDate() + n);
        return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }

    function weekLabel(ymd) {
        var p = ymd.split('-'), w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
        return p[1] + '/' + p[2] + ' ' + w[d.getUTCDay()];
    }

    function cacheGet(key) {
        try {
            var raw = sessionStorage.getItem(key);
            if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || Date.now() - o.t > CACHE_TTL) return null;
            return o.d;
        } catch (e) { return null; }
    }

    function cacheSet(key, data) {
        try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch (e) { }
    }

    function q(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

    function nearest(node, sel) {
        while (node && node.nodeType === 1) {
            if (node.matches && node.matches(sel)) return node;
            node = node.parentNode;
        }
        return null;
    }

    /* ── 网络：批量坐标请求（一次拿多个城市）；历史日期与未来日期分开走不同接口 ── */
    function buildUrl(locs, dates, mode) {
        var lat = locs.map(function (l) { return l.lat; }).join(',');
        var lng = locs.map(function (l) { return l.lng; }).join(',');
        var url = (mode === 'history' ? ARCHIVE_API : FORECAST_API)
            + '?latitude=' + lat + '&longitude=' + lng
            + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
            + '&timezone=' + encodeURIComponent(TIMEZONE);
        if (mode === 'history') {
            var sorted = dates.slice().sort();
            url += '&start_date=' + sorted[0] + '&end_date=' + sorted[sorted.length - 1]
                + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max';
        } else {
            url += '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code'
                + '&hourly=weather_code,temperature_2m'
                + '&forecast_days=' + FORECAST_DAYS;
        }
        return url;
    }

    /* 在途请求去重：同一 URL 被多处触发时（如模块自动初始化 + 页面手动 load）只发一次 */
    var inflight = {};

    function requestJson(url, cb) {
        if (inflight[url]) { inflight[url].push(cb); return; }
        inflight[url] = [cb];
        function finish(err, data) {
            var cbs = inflight[url];
            delete inflight[url];
            (cbs || []).forEach(function (f) { try { f(err, data); } catch (e) { } });
        }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.timeout = 12000;
        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                try { finish(null, JSON.parse(xhr.responseText)); }
                catch (e) { finish(e); }
            } else { finish(new Error('HTTP ' + xhr.status)); }
        };
        xhr.onerror = function () { finish(new Error('network')); };
        xhr.ontimeout = function () { finish(new Error('timeout')); };
        try { xhr.send(); } catch (e) { finish(e); }
    }

    /* ── 昼夜分段：把逐小时天气码归到白天(08-18) / 夜间 ── */
    function splitDayNight(hourly, date) {
        var dayCodes = [], nightCodes = [], dayT = [], nightT = [];
        if (!hourly || !hourly.time) return null;
        for (var i = 0; i < hourly.time.length; i++) {
            var t = hourly.time[i];
            if (t.slice(0, 10) !== date) continue;
            var h = parseInt(t.slice(11, 13), 10);
            var c = hourly.weather_code ? hourly.weather_code[i] : null;
            var tp = hourly.temperature_2m ? hourly.temperature_2m[i] : null;
            if (h >= 8 && h <= 18) { if (c !== null) dayCodes.push(c); if (tp !== null) dayT.push(tp); }
            else { if (c !== null) nightCodes.push(c); if (tp !== null) nightT.push(tp); }
        }
        function dominant(codes) {
            if (!codes.length) return null;
            var best = codes[0], bestScore = -1;
            var seen = {};
            for (var k = 0; k < codes.length; k++) {
                var c = codes[k];
                seen[c] = (seen[c] || 0) + 1;
                var score = info(c).sev * 100 + seen[c];
                if (score > bestScore) { bestScore = score; best = c; }
            }
            return best;
        }
        return {
            day: dominant(dayCodes),
            night: dominant(nightCodes),
            dayTemp: dayT.length ? Math.round(Math.max.apply(null, dayT)) : null,
            nightTemp: nightT.length ? Math.round(Math.min.apply(null, nightT)) : null
        };
    }

    /* ── 渲染 ── */
    function setText(node, text) { if (node) node.textContent = text; }

    function renderDayCell(cell, d, extra) {
        if (!cell || !d) return;
        var di = d.day === null || d.day === undefined ? null : info(d.day);
        var ni = d.night === null || d.night === undefined ? null : info(d.night);
        var mainIcon = (di || ni || { icon: '🌤️' });
        var hi = d.tmax !== null && d.tmax !== undefined ? Math.round(d.tmax) : '--';
        var lo = d.tmin !== null && d.tmin !== undefined ? Math.round(d.tmin) : '--';
        var desc = di && ni && di.text !== ni.text ? di.text + '→' + ni.text : ((di || ni || {}).text || '--');
        if (extra && extra.sun && d.sunrise && d.sunset && d.sunrise.indexOf('T') > -1) {
            desc += ' · 日出 ' + d.sunrise.slice(11, 16) + ' / 日落 ' + d.sunset.slice(11, 16);
        }
        var dateEl = cell.querySelector('.weather-date');
        if (dateEl && cell.getAttribute('data-date')) {
            dateEl.textContent = weekLabel(cell.getAttribute('data-date'));
        }
        setText(cell.querySelector('.weather-icon'), mainIcon.icon);
        setText(cell.querySelector('.weather-temp'), lo + '~' + hi + '°C');
        setText(cell.querySelector('.weather-desc'), desc);
        cell.setAttribute('data-w-state', 'ok');
        cell.title = (d.pop !== null && d.pop !== undefined) ? ('降水概率 ' + d.pop + '%') : '';
    }

    function failCell(cell) {
        if (!cell) return;
        setText(cell.querySelector('.weather-icon'), '⚠️');
        setText(cell.querySelector('.weather-temp'), '--');
        setText(cell.querySelector('.weather-desc'), '天气获取失败');
        cell.setAttribute('data-w-state', 'fail');
    }

    function renderNow(span, cur, cityFallback) {
        if (!span || !cur) return;
        var i = info(cur.weather_code);
        var city = span.getAttribute('data-city') || cityFallback || '';
        var parts = [i.icon + ' ' + (city ? city + ' ' : '') + Math.round(cur.temperature_2m) + '° ' + i.text];
        if (cur.relative_humidity_2m !== undefined && cur.relative_humidity_2m !== null) {
            parts.push('湿度 ' + cur.relative_humidity_2m + '%');
        }
        if (cur.wind_speed_10m !== undefined && cur.wind_speed_10m !== null) {
            parts.push('风 ' + Math.round(cur.wind_speed_10m) + 'km/h');
        }
        span.textContent = parts.join(' · ');
        span.setAttribute('data-w-state', 'ok');
    }

    function renderCards(sel, d) {
        if (!sel || !d) return;
        var box = document.querySelector(sel);
        if (!box) return;
        var di = d.day === null || d.day === undefined ? null : info(d.day);
        var ni = d.night === null || d.night === undefined ? null : info(d.night);
        var list = q(box, '.timeline-card');
        list.forEach(function (card) {
            var timeEl = card.querySelector('.card-time');
            if (!timeEl) return;
            var m = timeEl.textContent.match(/(\d{1,2}):\d{2}/);
            var h = m ? parseInt(m[1], 10) : 12;
            var night = (h >= 18 || h < 4);
            var pick = night ? ni : di;
            var temp = night ? d.tmin : d.tmax;
            var old = card.querySelector('.card-weather');
            if (old) old.parentNode.removeChild(old);
            if (!pick) return;
            var badge = document.createElement('span');
            badge.className = 'card-weather';
            badge.style.cssText = 'font-size:.7rem;padding:1px 7px;border-radius:10px;background:rgba(245,158,11,.12);color:#f59e0b;font-weight:500;margin-left:auto;margin-right:8px;white-space:nowrap';
            badge.textContent = pick.icon + ' ' + (temp === null || temp === undefined ? '' : Math.round(temp) + '°');
            var cat = card.querySelector('.card-cat');
            var head = card.querySelector('.card-header');
            if (cat && head) head.insertBefore(badge, cat); else if (head) head.appendChild(badge);
        });
    }

    /* ── 主流程：扫描 → 分组 → 请求 → 渲染 ── */
    function collectTargets(root) {
        var cells = q(root, '[data-date][data-lat], .weather-day[data-date], [data-weather-day]').filter(function (c) {
            return c.getAttribute('data-date');
        });
        var nows = q(root, '[data-weather-now]');
        return { cells: cells, nows: nows };
    }

    function cellLoc(cell) {
        var lat = cell.getAttribute('data-lat'), lng = cell.getAttribute('data-lng');
        if (lat === null || lng === null) {
            var host = nearest(cell.parentNode, '[data-w-lat][data-w-lng]');
            if (host) { lat = host.getAttribute('data-w-lat'); lng = host.getAttribute('data-w-lng'); }
        }
        if (lat === null || lng === null) {
            var host2 = nearest(cell.parentNode, '[data-lat][data-lng]');
            if (host2) { lat = host2.getAttribute('data-lat'); lng = host2.getAttribute('data-lng'); }
        }
        return { lat: parseFloat(lat), lng: parseFloat(lng) };
    }

    function load(root) {
        root = root || document;
        var t = collectTargets(root);
        if (!t.cells.length && !t.nows.length) return;

        var today = nowParts().ymd;
        var updateEls = q(root, '[data-wtime], #weather-update-time');
        // batch: key = 'forecast' | 'history' → { locs:[], dates:[], cells:{key:[cell]}, nows:{key:[span]} }
        var batches = { forecast: null, history: null };

        function batch(mode) {
            if (!batches[mode]) batches[mode] = { locs: [], dates: [], cells: {}, nows: {} };
            return batches[mode];
        }
        function slot(b, key) {
            var i = b.locs.findIndex(function (l) { return l.key === key; });
            if (i < 0) { b.locs.push({ key: key, lat: 0, lng: 0 }); i = b.locs.length - 1; }
            return i;
        }

        t.cells.forEach(function (cell) {
            var loc = cellLoc(cell);
            if (isNaN(loc.lat) || isNaN(loc.lng)) return;
            var date = cell.getAttribute('data-date');
            var mode = date < today ? 'history' : 'forecast';
            var b = batch(mode);
            var key = loc.lat.toFixed(3) + ',' + loc.lng.toFixed(3);
            var i = slot(b, key);
            b.locs[i].lat = loc.lat; b.locs[i].lng = loc.lng;
            b.dates.push(date);
            (b.cells[i] = b.cells[i] || []).push(cell);
        });

        t.nows.forEach(function (box) {
            var spans = q(box, '[data-now-city], [data-lat]');
            if (!spans.length && box.getAttribute('data-lat')) spans = [box];
            spans.forEach(function (span) {
                var lat = parseFloat(span.getAttribute('data-lat'));
                var lng = parseFloat(span.getAttribute('data-lng'));
                if (isNaN(lat) || isNaN(lng)) return;
                var b = batch('forecast');
                var key = lat.toFixed(3) + ',' + lng.toFixed(3);
                var i = slot(b, key);
                b.locs[i].lat = lat; b.locs[i].lng = lng;
                b.dates.push(today);
                (b.nows[i] = b.nows[i] || []).push(span);
            });
        });

        var pending = 0, failed = false;
        ['forecast', 'history'].forEach(function (mode) {
            var b = batches[mode];
            if (!b || !b.locs.length) return;
            pending++;

            var cacheKey = 'tw:' + mode + ':' + b.locs.map(function (l) { return l.key; }).sort().join('|') + ':' + today;
            var cached = cacheGet(cacheKey);
            if (cached) { applyBatch(b, cached, mode); if (!--pending && !failed) stampUpdate(updateEls, batches); return; }

            requestJson(buildUrl(b.locs, b.dates, mode), function (err, data) {
                if (err || !data) {
                    failed = true;
                    Object.keys(b.cells).forEach(function (k) {
                        b.cells[k].forEach(failCell);
                    });
                } else {
                    var list = Array.isArray(data) ? data : [data];
                    cacheSet(cacheKey, list);
                    applyBatch(b, list, mode);
                }
                if (!--pending) stampUpdate(updateEls, batches);
            });
        });
        if (!pending) return;
    }

    function stampUpdate(updateEls, batches) {
        var hasF = !!(batches.forecast && batches.forecast.locs.length);
        var hasH = !!(batches.history && batches.history.locs.length);
        var mode = hasH && hasF ? '历史实况 + 实时' : (hasH ? '历史实况' : '实时更新');
        var stamp = nowParts().hhmm;
        updateEls.forEach(function (el) { el.textContent = mode + ' ' + stamp; });
    }

    function applyBatch(b, list, mode) {
        Object.keys(b.cells || {}).forEach(function (idx) {
            var payload = list[idx] || null;
            var cells = b.cells[idx];
            if (!payload) { cells.forEach(failCell); return; }
            var daily = payload.daily || {};
            var idxByDate = {};
            (daily.time || []).forEach(function (d, i) { idxByDate[d] = i; });

            cells.forEach(function (cell) {
                var date = cell.getAttribute('data-date');
                var i = idxByDate[date];
                if (i === undefined) { failCell(cell); return; }
                var d;
                var seg = payload.hourly ? splitDayNight(payload.hourly, date) : null;
                if (seg) {
                    d = { day: seg.day, night: seg.night, tmax: daily.temperature_2m_max[i], tmin: daily.temperature_2m_min[i] };
                } else {
                    // 历史实况：无逐小时天气码，昼夜同描述，温度取当日最高/最低
                    d = { day: daily.weather_code[i], night: null, tmax: daily.temperature_2m_max[i], tmin: daily.temperature_2m_min[i] };
                }
                d.pop = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null;
                d.sunrise = daily.sunrise ? daily.sunrise[i] : null;
                d.sunset = daily.sunset ? daily.sunset[i] : null;
                renderDayCell(cell, d, { sun: cell.getAttribute('data-sun') === '1' });
                var cardsSel = cell.getAttribute('data-cards');
                if (cardsSel) {
                    renderCards(cardsSel, { day: d.day, night: d.night === null ? d.day : d.night, tmax: d.tmax, tmin: d.tmin });
                }
            });
        });

        Object.keys(b.nows || {}).forEach(function (idx) {
            var payload = list[idx] || null;
            if (!payload) return;
            var cur = payload.current;
            if (!cur) {
                var daily = payload.daily || {}, today = nowParts().ymd;
                var i = (daily.time || []).indexOf(today);
                if (i >= 0) {
                    cur = { temperature_2m: daily.temperature_2m_max[i], weather_code: daily.weather_code[i] };
                }
            }
            if (!cur) return;
            b.nows[idx].forEach(function (span) { renderNow(span, cur, span.getAttribute('data-city')); });
        });
    }

    /* ── 对外接口 + 自动初始化 ── */
    var TravelWeather = {
        version: '1.0.0',
        load: load,
        refresh: function (el) {
            try {
                var keys = [];
                for (var k in sessionStorage) {
                    if (k.indexOf('tw:') === 0) keys.push(k);
                }
                keys.forEach(function (k) { sessionStorage.removeItem(k); });
            } catch (e) { }
            load(el || document);
        },
        _info: info
    };
    global.TravelWeather = TravelWeather;

    function boot() { load(document); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);
