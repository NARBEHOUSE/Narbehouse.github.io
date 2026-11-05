// Headless play-tester for Benny's Baseball (BENNYSBASEBALL2).
// Runs the REAL page (real Phaser 3.60 in HEADLESS mode, real game code, real
// shared scan/voice scripts) inside jsdom — no browser, no GPU, no rendering.
// Time is virtual: every timer, rAF and performance.now() is driven here, so a
// 9-inning game runs in seconds. A bot presses Space/Enter like a switch user.
//
//   Setup (once, outside the hub — jsdom is not a hub dependency):
//     mkdir <scratch> && cd <scratch> && npm i jsdom@24.1.3
//     curl -o <scratch>/phaser-3.60.0.min.js https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js
//   Run:
//     JSDOM=<scratch>/node_modules/jsdom PHASER=<scratch>/phaser-3.60.0.min.js //       node art/play_headless.cjs [seed=1] [games=1] [maxMinutesPerGame=60]
//   Env: UNASSISTED_BIAS=0.8 makes the bot favour "Take it to the bag";
//        OUT=<dir> for failure reports; OVERRIDE_DIR=<dir> serves js/ files
//        from <dir> instead (A/B against a backup); VERBOSE=1 shows page logs.
//   "safety-net" counts moves BaseballPlayerMotion gave up on after
//   STALL_LIMIT seconds blocked (each would have frozen the game before
//   2026-11-05). A healthy game shows only scrum / dugout-queue ones.
//
// Reports: uncaught errors (these FREEZE the real game: Phaser 3.60 schedules
// the next frame only after the current one returns) and soft stalls (no menu
// or swing prompt for 60 virtual seconds) with a full diagnostic dump.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { JSDOM, ResourceLoader, VirtualConsole } = require(process.env.JSDOM || 'jsdom');

const HUB = path.resolve(process.env.HUB || path.join(__dirname, '..', '..', '..', '..'));
const GAME_DIR = process.env.GAME_DIR || 'apps/games/BENNYSBASEBALL2';
const PHASER = process.env.PHASER || path.join(__dirname, 'phaser-3.60.0.min.js');
const SEED = +(process.argv[2] || 1), GAMES = +(process.argv[3] || 1), MAX_MIN = +(process.argv[4] || 60);
const VERBOSE = !!process.env.VERBOSE;
const UNASSISTED_BIAS = +(process.env.UNASSISTED_BIAS || 0);

const MIME = { '.js':'application/javascript', '.css':'text/css', '.html':'text/html', '.png':'image/png',
    '.json':'application/json', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(HUB, rel);
    // OVERRIDE_DIR=<dir>: serve that dir's copies of the game's js files (A/B runs).
    if (process.env.OVERRIDE_DIR && rel.startsWith('/' + GAME_DIR + '/js/')) {
        const alt = path.join(process.env.OVERRIDE_DIR, path.basename(rel));
        if (fs.existsSync(alt)) { fs.readFile(alt, (e, d) => { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end(d); }); return; }
    }
    if (!file.startsWith(HUB)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
    });
});

function pngSize(buf) {
    if (buf.length > 24 && buf.readUInt32BE(12) === 0x49484452) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    return { w: 64, h: 64 };
}

class Loader extends ResourceLoader {
    fetch(url, options) {
        if (/phaser(\.min)?\.js/.test(url) && url.includes('cdnjs')) {
            const src = fs.readFileSync(PHASER, 'utf8') +
                '\n;(function(){var G=Phaser.Game;Phaser.Game=function(c){c.type=Phaser.CANVAS;return new G(c);};Phaser.Game.prototype=G.prototype;})();\n';
            return Promise.resolve(Buffer.from(src));
        }
        if (/^https?:\/\/(?!127\.0\.0\.1)/.test(url)) return Promise.resolve(Buffer.from(''));   // no network
        return super.fetch(url, options);
    }
}

function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function playOne(port, seed) {
    const rng = mulberry(seed), botRng = mulberry(seed * 7919 + 13);
    let vnow = 0, timerId = 1;
    const timers = new Map(), raf = new Map();
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('error', (...a) => errors.push({ kind: 'console.error', t: vnow, msg: a.map(x => x && x.stack || String(x)).join(' ') }));
    vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) errors.push({ kind: 'jsdomError', t: vnow, msg: e.stack || e.message, detail: e.detail && (e.detail.stack || String(e.detail)) }); });
    if (VERBOSE) vc.on('log', (...a) => console.log('[page]', ...a));
    vc.on('warn', (...a) => { if (VERBOSE) console.log('[warn]', ...a); });

    const html = fs.readFileSync(path.join(HUB, GAME_DIR, 'index.html'), 'utf8');
    const dom = new JSDOM(html, {
        url: `http://127.0.0.1:${port}/${GAME_DIR}/index.html`,
        runScripts: 'dangerously', resources: new Loader(), pretendToBeVisual: true, virtualConsole: vc,
        beforeParse(window) {
            window.Math.random = rng;
            const baseDate = Date.UTC(2026, 10, 5, 15);
            window.Date.now = () => baseDate + Math.floor(vnow);
            Object.defineProperty(window.performance, 'now', { value: () => vnow, configurable: true });
            window.setTimeout = (fn, ms, ...args) => { const id = timerId++; timers.set(id, { at: vnow + Math.max(0, +ms || 0), fn, args }); return id; };
            window.setInterval = (fn, ms, ...args) => { const id = timerId++; timers.set(id, { at: vnow + Math.max(1, +ms || 0), fn, args, every: Math.max(1, +ms || 0) }); return id; };
            window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
            window.requestAnimationFrame = fn => { const id = timerId++; raf.set(id, fn); return id; };
            window.cancelAnimationFrame = id => { raf.delete(id); };
            window.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
            window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
            window.HTMLMediaElement.prototype.pause = function () {};
            window.HTMLMediaElement.prototype.load = function () {};
            // Speech: lines take ~65ms/char of virtual time, like a real voice.
            class Utter {
                constructor(text) { this.text = text || ''; this.l = {}; this.rate = 1; this.pitch = 1; this.volume = 1; }
                addEventListener(k, f) { (this.l[k] = this.l[k] || []).push(f); }
                removeEventListener(k, f) { this.l[k] = (this.l[k] || []).filter(x => x !== f); }
                _fire(k) { const ev = { type: k, utterance: this, charIndex: 0 }; try { this['on' + k] && this['on' + k](ev); (this.l[k] || []).forEach(f => f(ev)); } catch (e) { errors.push({ kind: 'speech-callback', t: vnow, msg: e.stack }); } }
            }
            const synth = { speaking: false, pending: false, paused: false, _cur: null, _timer: null, _q: [],
                getVoices: () => [], addEventListener() {}, removeEventListener() {}, onvoiceschanged: null,
                speak(u) { this._q.push(u); if (!this._cur) this._next(); },
                _next() { const u = this._q.shift(); if (!u) { this._cur = null; this.speaking = false; return; }
                    this._cur = u; this.speaking = true; window.setTimeout(() => u._fire('start'), 5);
                    this._timer = window.setTimeout(() => { this._cur = null; u._fire('end'); this._next(); }, 250 + 65 * u.text.length); },
                cancel() { const all = [this._cur, ...this._q].filter(Boolean); this._q = []; if (this._timer) window.clearTimeout(this._timer);
                    this._cur = null; this.speaking = false; all.forEach(u => u._fire('end')); },
                pause() {}, resume() {} };
            window.speechSynthesis = synth; window.SpeechSynthesisUtterance = Utter;
            // Web Audio: an inert graph that accepts every call.
            const inert = () => { const f = function () {}; return new Proxy(f, {
                get(t, k) { if (k === 'then') return undefined; if (k === 'currentTime') return vnow / 1000; if (k === 'state') return 'running';
                    if (k === 'sampleRate') return 44100; if (k === 'value') return t._v || 0; if (k === 'duration') return 1;
                    if (k === 'resume' || k === 'suspend' || k === 'close') return () => Promise.resolve();
                    if (k === 'decodeAudioData') return () => Promise.reject(new Error('no decode'));
                    if (k === 'getChannelData') return () => new Float32Array(16);
                    if (k in t) return t[k]; return inert(); },
                set(t, k, v) { if (k === 'value') t._v = v; else t[k] = v; return true; },
                apply() { return inert(); }, construct() { return inert(); } }); };
            window.AudioContext = window.webkitAudioContext = function () { return inert(); };
            // Canvas: a 2D context that accepts everything; image data is tiny.
            const ctx2d = canvas => new Proxy({}, {
                get(t, k) {
                    if (k in t) return t[k];
                    if (k === 'canvas') return canvas;
                    if (k === 'measureText') return s => ({ width: String(s).length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 4,
                        actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(s).length * 8, fontBoundingBoxAscent: 12, fontBoundingBoxDescent: 4 });
                    if (k === 'getImageData' || k === 'createImageData') return () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) });
                    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
                    if (k === 'getLineDash') return () => [];
                    if (k === 'isPointInPath' || k === 'isPointInStroke') return () => false;
                    if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
                    if (k === 'getContextAttributes') return () => ({});
                    return () => {};
                },
                set(t, k, v) { t[k] = v; return true; } });
            window.HTMLCanvasElement.prototype.getContext = function (type) { if (type !== '2d') return null; return this.__ctx || (this.__ctx = ctx2d(this)); };
            window.CanvasRenderingContext2D = function CanvasRenderingContext2D() {};
            window.Path2D = class { constructor() {} addPath() {} closePath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} arc() {} arcTo() {} ellipse() {} rect() {} roundRect() {} };
            window.HTMLCanvasElement.prototype.toDataURL = () => 'data:,';
            window.HTMLCanvasElement.prototype.toBlob = cb => cb(null);
            // Images: report the real PNG size, fire load.
            const blobs = new Map(); let blobN = 0;
            window.URL.createObjectURL = blob => { const id = 'blob:hub/' + (++blobN); blobs.set(id, blob); return id; };
            window.URL.revokeObjectURL = id => blobs.delete(id);
            const IP = window.HTMLImageElement.prototype;
            for (const k of ['width', 'height', 'naturalWidth', 'naturalHeight'])
                Object.defineProperty(IP, k, { configurable: true, get() { return this['__' + k.replace('natural', '').toLowerCase()] || 0; }, set(v) { this['__' + k.toLowerCase()] = v; } });
            Object.defineProperty(IP, 'complete', { configurable: true, get() { return !!this.__done; } });
            Object.defineProperty(IP, 'src', { configurable: true, get() { return this.__src || ''; }, set(v) {
                this.__src = v; this.__done = false;
                const finish = (buf, ok = true) => { const s = buf ? pngSize(buf) : { w: 64, h: 64 }; this.__width = s.w; this.__height = s.h; this.__done = true;
                    const ev = new window.Event(ok ? 'load' : 'error'); try { this.dispatchEvent(ev); }
                    catch (e) { errors.push({ kind: 'image-onload', t: vnow, msg: e.stack }); } };
                if (v.startsWith('blob:')) { const b = blobs.get(v); if (!b) return setImmediate(() => finish(null, false));
                    const fr = new window.FileReader(); fr.onload = () => finish(Buffer.from(fr.result)); fr.onerror = () => finish(null, false); fr.readAsArrayBuffer(b); }
                else if (v.startsWith('data:')) { const m = /base64,(.*)$/.exec(v); setImmediate(() => finish(m ? Buffer.from(m[1], 'base64') : null)); }
                else { const u = new URL(v, window.location.href); const f = path.join(HUB, decodeURIComponent(u.pathname));
                    fs.readFile(f, (e, d) => finish(e ? null : d, !e)); }
            } });
            window.addEventListener('error', e => errors.push({ kind: 'window.onerror', t: vnow, msg: (e.error && e.error.stack) || e.message }));
            window.addEventListener('unhandledrejection', e => errors.push({ kind: 'unhandledrejection', t: vnow, msg: String(e.reason && e.reason.stack || e.reason) }));
        }
    });
    const win = dom.window;

    // ── virtual clock ──
    const FRAME = 1000 / 60;
    let frozen = null;
    function runTimers() {
        for (;;) {
            let best = null;
            for (const [id, t] of timers) if (t.at <= vnow && (!best || t.at < best[1].at)) best = [id, t];
            if (!best) break;
            const [id, t] = best;
            if (t.every) t.at += t.every; else timers.delete(id);
            try { t.fn(...t.args); } catch (e) { errors.push({ kind: 'timer-throw', t: vnow, msg: e.stack }); }
        }
    }
    function runFrame() {
        const cbs = [...raf.entries()]; raf.clear();
        for (const [, fn] of cbs) {
            try { fn(vnow); }
            catch (e) { frozen = { t: vnow, msg: e.stack }; errors.push({ kind: 'FRAME-THROW (game freezes)', t: vnow, msg: e.stack }); }
        }
    }
    const step = async () => { vnow += FRAME; runTimers(); runFrame(); await new Promise(r => setImmediate(r)); };

    // Boot
    let game = null;
    for (let i = 0; i < 4000 && !game; i++) { await step(); game = win.__baseball2Game; }
    if (!game) return { seed, fatal: 'game never constructed', errors };
    for (let i = 0; i < 6000; i++) { await step(); const t = game.scene.getScene('TitleScene'); if (t && t.sys.isActive()) break; }
    if (VERBOSE) console.log('boot done at', Math.round(vnow), 'active scenes:', game.scene.getScenes(true).map(x => x.sys.settings.key));

    // Trace GameScene methods (ring buffer).
    const trace = [];
    const GS = game.scene.getScene('GameScene').constructor.prototype;
    const skip = new Set(['update', 'constructor', 'playerMotion', 'updateSwingMeter', 'updatePowerMeter', 'interactivePitchPoint', 'paintPitchCue',
        'pitchProfile', 'pitchReadPoint', 'layoutMessageOverlay', 'isPlayerBatting', 'battingColor', 'fieldingColor', 'stopPlayerMovement', 'syncDepth']);
    for (const k of Object.getOwnPropertyNames(GS)) {
        const d = Object.getOwnPropertyDescriptor(GS, k);
        if (typeof d.value !== 'function' || skip.has(k)) continue;
        const orig = d.value;
        GS[k] = function (...a) {
            const arg = a.length && (typeof a[0] === 'string' || typeof a[0] === 'number') ? '(' + a[0] + ')' : '';
            const last = trace[trace.length - 1];
            if (last && last.name === k + arg) last.n++; else trace.push({ t: Math.round(vnow), name: k + arg, n: 1 });
            if (trace.length > 400) trace.shift();
            return orig.apply(this, a);
        };
    }

    const colors = ['Red', 'Blue', 'Green', 'Orange', 'Purple', 'Yellow', 'Black', 'Pink', 'Teal'];
    const COLOR_OPTIONS = win.eval('typeof COLOR_OPTIONS!=="undefined"?COLOR_OPTIONS.map(c=>c.name):null') || colors;
    const pc = COLOR_OPTIONS[Math.floor(botRng() * COLOR_OPTIONS.length)];
    let oc; do { oc = COLOR_OPTIONS[Math.floor(botRng() * COLOR_OPTIONS.length)]; } while (oc === pc);
    game.scene.getScene('TitleScene').scene.start('GameScene', { isSeason: false, playerColorName: pc, opponentColorName: oc });

    // ── bot ──
    const key = (type, code) => {
        const kc = code === 'Space' ? 32 : 13;
        win.dispatchEvent(new win.KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : 'Enter', keyCode: kc, which: kc, bubbles: true, cancelable: true }));
    };
    let busyUntil = 0, plan = null, lastPrompt = 0, prompts = 0, swings = 0, menusDone = 0;
    const S = () => game.scene.getScene('GameScene');
    const limit = MAX_MIN * 60000;
    let result = null;
    const stallEvents = [];
    const start = vnow;
    while (vnow - start < limit) {
        await step();
        if (frozen) { result = 'FROZE (uncaught error in frame)'; break; }
        const s = S();
        const rs = game.scene.getScene('ResultScene');
        if (rs && rs.sys.isActive()) { result = 'completed'; break; }
        if (!s || !s.sys.isActive() || !s.gs) continue;
        if (s.gs.gameOver) { if (vnow - (s.__overAt = s.__overAt || vnow) > 30000) { result = 'gameOver but no ResultScene'; break; } continue; }
        const mo = s._playerMotion;
        if (mo) for (const m of mo.moves.values()) if (m.stalled > 2.5 && !m.__logged) {
            m.__logged = true;
            const who = Object.entries(s.fielders || {}).find(([, f]) => f === m.p);
            stallEvents.push({ t: Math.round(vnow), who: who ? 'F:' + who[0] : (m.p === s.batter ? 'batter' : 'runner->' + m.p._runnerBase),
                at: [Math.round(m.p.x), Math.round(m.p.y)], goal: [Math.round(m.goal.x), Math.round(m.goal.y)],
                others: mo.players().filter(q => q !== m.p && Math.hypot(q.x - m.goal.x, q.y - m.goal.y) < 30).map(q => { const w = Object.entries(s.fielders || {}).find(([, f]) => f === q); return (w ? 'F:' + w[0] : 'R') + '@' + Math.round(q.x) + ',' + Math.round(q.y) + (mo.moves.has(q) ? '(moving)' : ''); }),
                trace: trace.slice(-12).map(e => e.name).join(' > ') });
        }
        const charge = s.ib && s.ib.active && (s.ib.waitingForSwing || s.ib.swingPressed);
        const menu = s.menu && s.menu.active ? s.menu : null;
        if (charge || menu) lastPrompt = vnow;
        if (vnow - lastPrompt > 60000 && lastPrompt > 0) { result = 'STALL: no menu or swing prompt for 60s'; break; }
        if (vnow < busyUntil) continue;
        if (plan && plan.type === 'charge') {
            if (!s.ib.swingPressed && !plan.down) { key('keydown', 'Enter'); plan.down = vnow; continue; }
            if (plan.down && vnow - plan.down >= plan.hold) { key('keyup', 'Enter'); plan = null; swings++; busyUntil = vnow + 400; }
            continue;
        }
        if (plan && plan.type === 'menu') {
            if (!menu || menu !== plan.menu) { plan = null; continue; }
            if (menu.index !== plan.target && plan.presses < menu.options.length + 3) {
                key('keydown', 'Space'); key('keyup', 'Space'); plan.presses++; busyUntil = vnow + 250 + botRng() * 300; continue;
            }
            key('keydown', 'Enter'); key('keyup', 'Enter'); plan = null; menusDone++; busyUntil = vnow + 300; continue;
        }
        if (charge && s.ib.waitingForSwing) {
            // Wait a random bit into the pitch, then hold for a random swing length.
            busyUntil = vnow + botRng() * 900;
            plan = { type: 'charge', hold: 150 + botRng() * 5500 }; prompts++; continue;
        }
        if (menu && menu.options && menu.options.length) {
            const opts = menu.options.map((o, i) => ({ o, i }));
            const tag = o => String(o.value) + ' ' + String(o.label || '');
            let pool;
            const resume = opts.find(x => x.o.value === 'resume');
            if (resume) pool = botRng() < 0.15 ? opts.filter(x => x.o.value === 'batting') : [resume];
            else {
                pool = opts.filter(x => !/quit|help|pause|graphics|voice|tts|music|sound|track/i.test(tag(x.o)));
                const ua = opts.filter(x => x.o.unassisted);
                if (ua.length && botRng() < UNASSISTED_BIAS) pool = ua;
                if (botRng() < 0.03) pool = opts.filter(x => /pause/i.test(tag(x.o)));
            }
            if (!pool.length) pool = opts.filter(x => !/quit|help/i.test(tag(x.o)));
            if (!pool.length) pool = opts;
            const pick = pool[Math.floor(botRng() * pool.length)];
            plan = { type: 'menu', menu, target: pick.i, presses: 0, value: pick.o.value };
            busyUntil = vnow + 500 + botRng() * 1200; prompts++; continue;
        }
    }
    if (!result) result = 'time limit';
    const s = S();
    const out = { seed, result, stallEvents, virtualMinutes: +((vnow - start) / 60000).toFixed(1), prompts, menusDone, swings, errors };
    if (s && s.gs) out.gs = { inning: s.gs.inning, half: s.gs.half, outs: s.gs.outs, balls: s.gs.balls, strikes: s.gs.strikes,
        score: s.gs.score, bases: s.gs.bases, gameOver: s.gs.gameOver };
    if (result !== 'completed') out.diag = diagnose(s, win, trace, timers, vnow);
    win.close();
    return out;
}

function diagnose(s, win, trace, timers, vnow) {
    if (!s || !s.cameras || !s.cameras.main) return { note: 'GameScene not running', scenes: s && s.game ? s.game.scene.getScenes(true).map(x => x.sys.settings.key) : null, trace: trace.slice(-60).map(e => `${e.t} ${e.name}${e.n > 1 ? ' x' + e.n : ''}`) };
    const name = p => { if (!p) return null; for (const [k, f] of Object.entries(s.fielders || {})) if (f === p) return 'F:' + k;
        for (const [k, f] of Object.entries(s.runnerDots || {})) if (f === p) return 'R@' + k;
        if (p === s.batter) return 'batter'; if (p === s.onDeckBatter) return 'onDeck';
        return (p._runnerBase ? 'runner->' + p._runnerBase : 'player') + (p._label || ''); };
    const r = v => Math.round(v * 10) / 10;
    const moves = s._playerMotion ? [...s._playerMotion.moves.values()].map(m => ({ who: name(m.p), at: [r(m.p.x), r(m.p.y)], goal: [r(m.goal.x), r(m.goal.y)],
        path: m.path.map(q => [r(q.x), r(q.y)]), waited: r(m.waited), progress: r(m.progress), gait: m.gait, anim: m.p._anim })) : [];
    const players = s._playerMotion ? s._playerMotion.players().map(p => ({ who: name(p), at: [r(p.x), r(p.y)], anim: p._anim, runnerBase: p._runnerBase, out: p._runnerOut })) : [];
    const cam = s.cameras.main;
    return {
        flags: { _lineupBusy: s._lineupBusy, _teamEntry: s._teamEntry, _sidesChanging: s._sidesChanging, _returnPending: s._returnPending,
            _ballBusy: s._ballBusy, ballVisible: s.ball && s.ball.visible, ball: s.ball && [r(s.ball.x), r(s.ball.y)], menu: !!s.menu, menuActive: !!(s.menu && s.menu.active),
            ib: s.ib && { active: s.ib.active, waitingForSwing: s.ib.waitingForSwing, swingPressed: s.ib.swingPressed },
            battingCam: s._battingCam, extraBaseRun: s._extraBaseRun && { ready: s._extraBaseRun.ready, arrivedAt: s._extraBaseRun.arrivedAt },
            playRunners: s.playRunners && Object.keys(s.playRunners), hudVisible: (s.hudAll || []).map(o => o.visible).every(Boolean) },
        camera: { zoom: r(cam.zoom / (s._renderScale || 1)), scroll: [r(cam.scrollX), r(cam.scrollY)] },
        moves, players,
        sceneTimers: s.time._active ? s.time._active.map(e => ({ delay: e.delay, left: r(e.delay - e.elapsed), loop: e.loop, cb: String(e.callback).slice(0, 120) })) : null,
        tweens: s.tweens.getTweens ? s.tweens.getTweens().length : null,
        windowTimers: timers.size,
        trace: trace.slice(-60).map(e => `${e.t} ${e.name}${e.n > 1 ? ' x' + e.n : ''}`)
    };
}

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const summary = [];
    for (let g = 0; g < GAMES; g++) {
        const seed = SEED + g;
        const t0 = Date.now();
        let res;
        try { res = await playOne(port, seed); } catch (e) { res = { seed, result: 'HARNESS ERROR', msg: e.stack }; }
        res.realSeconds = +((Date.now() - t0) / 1000).toFixed(1);
        const short = `seed ${seed}: ${res.result} — ${res.virtualMinutes} virtual min, ${res.prompts} prompts, ${res.errors ? res.errors.length : 0} errors, ${res.stallEvents ? res.stallEvents.length : 0} safety-net, ${res.realSeconds}s real` +
            (res.gs ? ` | inn ${res.gs.half} ${res.gs.inning}, outs ${res.gs.outs}, score ${JSON.stringify(res.gs.score)}` : '');
        console.log(short);
        summary.push(res);
        if (res.result !== 'completed' || (res.errors && res.errors.length) || (res.stallEvents && res.stallEvents.length)) {
            const f = path.resolve(process.env.OUT || path.join(require('os').tmpdir(), 'bb2-headless'), `seed-${seed}.json`);
            fs.mkdirSync(path.dirname(f), { recursive: true });
            fs.writeFileSync(f, JSON.stringify(res, null, 2));
            console.log('   details →', f);
        }
    }
    server.close();
    const bad = summary.filter(r => r.result !== 'completed');
    console.log(`\n${summary.length - bad.length}/${summary.length} games completed.`);
    process.exit(0);
})();
