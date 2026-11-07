'use strict';
/* NARBE Build n Bash - whole sessions played through the real page, headless, by switch presses.
 *
 * Loads index.html in jsdom (a Node DOM: no browser, no rendering, no GPU - safe on this PC)
 * with the hub's real shared scanner, voice manager and input guard, real three.js scene
 * graph and real ammo.js physics. Only speech, canvas 2D, media and the WebGL renderer are
 * faked (the renderer is swapped for a no-op one as three.min.js is served). A driver presses
 * Space and Enter (keydown/keyup, like a switch interface): menu > Build Select (both pages) >
 * build the Tiny House > Destroy > Build Again > Hold to Build (short and long holds, held to
 * the end) > Destroy > Build Again > half a build > Pause > every Settings row (turns Hold to
 * Build off) > How to Play > Continue > a long hold builds one > Destroy halfway > Pick Another > Back > menu. Then the same with
 * Auto Scan (one switch: Enter only). Any script error fails the run.
 *
 * jsdom is not a hub dependency:  JSDOM=<dir>/node_modules/jsdom node tests/dom-smoke.cjs
 */
const path = require('path'), fs = require('fs');
const jsdom = require(process.env.JSDOM || 'jsdom');
const { JSDOM, VirtualConsole } = jsdom;
const GAME = path.join(__dirname, '..');
const HUB = path.join(GAME, '..', '..', '..');
const ORIGIN = 'http://hub.local/';

/** A WebGLRenderer that draws nothing (jsdom has no WebGL). Appended to three.min.js as served. */
const FAKE_RENDERER = `
;(function () {
  function Fake(opts) {
    opts = opts || {};
    this.domElement = opts.canvas || document.createElement('canvas');
    this.shadowMap = { enabled: false, type: 0 };
    this.outputColorSpace = 'srgb'; this.toneMapping = 0; this.toneMappingExposure = 1;
    this._ratio = 1; this.renders = 0;
  }
  Fake.prototype.setPixelRatio = function (r) { this._ratio = r; };
  Fake.prototype.getPixelRatio = function () { return this._ratio; };
  Fake.prototype.setSize = function () {};
  Fake.prototype.render = function (scene, camera) { this.renders++; scene.updateMatrixWorld(); };
  Fake.prototype.dispose = function () {};
  Fake.prototype.forceContextLoss = function () {};
  THREE.WebGLRenderer = Fake;
})();`;

class HubFiles extends jsdom.ResourceLoader {
    fetch(url, options) {
        if (!url.startsWith(ORIGIN)) return super.fetch(url, options);
        const rel = decodeURIComponent(url.slice(ORIGIN.length).split('?')[0]);
        const file = path.join(HUB, rel);
        const p = new Promise((resolve, reject) => fs.readFile(file, (err, buf) => {
            if (err) return reject(err);
            if (/NARBEBUILDNBASH\/vendor\/three\.min\.js$/.test(rel)) buf = Buffer.concat([buf, Buffer.from(FAKE_RENDERER)]);
            resolve(buf);
        }));
        p.abort = () => {};
        return p;
    }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fakeContext() {
    const grad = { addColorStop() {} };
    const target = {
        canvas: null, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
        createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => ({ setTransform() {} }),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w.width || w) * (h || w.height || 1) * 4)), width: w.width || w, height: h || w.height }),
        putImageData: () => {},
        measureText: t => ({ width: String(t).length * 8 })
    };
    return new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}

function stub(w, errors) {
    w.addEventListener('error', e => errors.push('window error: ' + (e.error && e.error.stack || e.message)));
    w.addEventListener('unhandledrejection', e => errors.push('unhandled rejection: ' + (e.reason && e.reason.stack || e.reason)));
    const voices = [{ name: 'Fake English', lang: 'en-US', default: true }];
    let current = null;
    w.spoken = [];
    w.SpeechSynthesisUtterance = function (text) { this.text = text; };
    w.speechSynthesis = {
        speaking: false, pending: false,
        getVoices: () => voices,
        speak(u) {
            this.speaking = true; current = u; w.spoken.push(u.text);
            setTimeout(() => { if (current !== u) return; u.onstart && u.onstart(); }, 2);
            setTimeout(() => { if (current !== u) return; current = null; this.speaking = false; u.onend && u.onend(); }, 4 + String(u.text).length);
        },
        cancel() { const u = current; current = null; this.speaking = false; if (u && u.onerror) u.onerror({ error: 'interrupted' }); },
        addEventListener() {}, removeEventListener() {}
    };
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    w.HTMLMediaElement.prototype.pause = function () {};
    w.HTMLMediaElement.prototype.load = function () {};
    w.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {}, finish() {} }; };
    w.HTMLCanvasElement.prototype.getContext = function () { const c = fakeContext(); c.canvas = this; return c; };
    w.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/jpeg;base64,AAAA'; };
    w.URL.createObjectURL = () => 'blob:fake';
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

async function session(label, scan) {
    const errors = [], warns = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => { if (!/Not implemented: (navigation|window\.scrollTo|HTMLCanvasElement)/.test(e.message)) errors.push('jsdom: ' + e.message); });
    vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));
    vc.on('warn', (...a) => { const m = a.map(String).join(' '); if (!/deprecated with r150/.test(m)) warns.push(m); });
    const dom = new JSDOM(fs.readFileSync(path.join(GAME, 'index.html'), 'utf8'), {
        url: ORIGIN + 'apps/games/NARBEBUILDNBASH/index.html', runScripts: 'dangerously', resources: new HubFiles(),
        pretendToBeVisual: true, virtualConsole: vc,
        beforeParse(w) {
            // Both spellings of a 1 s scan: the desktop reads scanInterval, the website scanSpeedIndex.
            w.localStorage.setItem('narbe-scan-settings', JSON.stringify(Object.assign({ autoScan: false, scanInterval: 1000, scanSpeedIndex: 0 }, scan)));
            stub(w, errors);
        }
    });
    const w = dom.window;
    const dbg = () => (w.__bnb ? w.__bnb() : { screen: 'boot' });
    for (let i = 0; i < 300 && dbg().screen !== 'menu'; i++) {
        await sleep(50);
        if (dbg().screen === 'error') break;
    }
    if (dbg().screen !== 'menu') throw new Error(label + ': never reached the menu (' + dbg().screen + ')\n' + errors.concat(warns).join('\n'));
    const auto = !!scan.autoScan;

    async function press(code, hold) {
        const ev = type => new w.KeyboardEvent(type, { code: code, key: code === 'Space' ? ' ' : 'Enter', bubbles: true, cancelable: true });
        w.document.body.dispatchEvent(ev('keydown'));
        const t = Date.now();
        await sleep(hold || 30);
        const held = Date.now() - t;   // jsdom can be busy: the real hold may run long
        w.document.body.dispatchEvent(ev('keyup'));
        await sleep(260);   // past the input guard's cooldown
        return held;
    }
    /** Two switches: Space steps to `id`, Enter chooses. One switch: wait for the highlight, then Enter. */
    async function choose(id) { await reach(id); await press('Enter'); return true; }
    /** Hold Enter on `id` for `ms` (reaching it first, as choose() does). */
    async function holdOn(id, ms) { await reach(id); return press('Enter', ms); }
    async function reach(id) {
        const trail = [], until = Date.now() + 120000;   // Auto Scan: up to two minutes for the highlight to come round
        for (let k = 0; auto ? Date.now() < until : k < 40; k++) {
            if (dbg().highlighted === id) return true;
            if (auto) await sleep(20); else await press('Space');
            if (process.env.DEBUG && trail[trail.length - 1] !== dbg().highlighted) trail.push(dbg().highlighted);
        }
        if (process.env.DEBUG) console.log('  trail: ' + trail.join(' > '));
        const st = w.BNB.Input.state() || {};
        throw new Error(label + ': could not reach ' + id + ' on ' + dbg().screen + ' (highlighted ' + dbg().highlighted + ')\n  scanner: ' +
            JSON.stringify(st) + '\n  root: ' + JSON.stringify(Object.assign({}, w.document.getElementById('bnb').dataset)) +
            '\n  scan settings: ' + JSON.stringify(w.NarbeScanManager.getSettings()));
    }
    async function until(fn, ms, what) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { if (fn()) return; await sleep(50); }
        throw new Error(label + ': timed out waiting for ' + what + ' (' + JSON.stringify(dbg()) + ')');
    }
    const expectScreen = async (s) => until(() => dbg().screen === s, 3000, 'screen ' + s);

    // Menus open with nothing highlighted.
    if (dbg().highlighted) throw new Error(label + ': menu opened with ' + dbg().highlighted + ' highlighted');
    await choose('menu:build'); await expectScreen('select');
    if (dbg().highlighted) throw new Error(label + ': Build Select opened highlighted');
    if (w.BNB.Builds.LIST.length > 9) {
        await choose('select:page'); await expectScreen('select');
        if (!w.document.querySelector('[data-build="station"], [data-build="castle"]')) throw new Error(label + ': page 2 shows no huge builds');
        await choose('select:page');
    }
    await choose('select:house'); await expectScreen('play');
    if (dbg().build !== 'house') throw new Error(label + ': wrong build ' + dbg().build);

    // Build the whole house by choosing Build again and again.
    await choose('play:build');
    for (let k = 0; k < 20 && dbg().placed < dbg().total; k++) {
        if (dbg().highlighted === 'play:build') await press('Enter'); else await choose('play:build');
    }
    await until(() => dbg().sim === 'complete', 4000, 'the house to finish');
    if (w.document.querySelector('.bnb-build-btn').hidden !== true) throw new Error(label + ': Build still showing after the build finished');

    // Knock it down; the popup follows.
    await choose('play:destroy');
    await until(() => dbg().screen === 'done', 15000, 'All knocked down');
    if (dbg().highlighted) throw new Error(label + ': done popup opened highlighted');
    await choose('done:again'); await expectScreen('play');
    await until(() => dbg().sim === 'empty', 4000, 'the rubble to clear');

    // Hold to Build (on by default): under 3 s is one block on release; held, one at 3 s and
    // one a second after; the release after a hold adds nothing.
    const placedIs = (n, what) => { if (dbg().placed !== n) throw new Error(label + ': ' + what + ': ' + dbg().placed + ' placed, expected ' + n); };
    /** Blocks a hold of `ms` builds with Hold to Build on (a block lands at 3 s, 4 s, 5 s ...). */
    const holdBlocks = ms => ms < 3000 ? 1 : Math.floor((ms - 3000) / 1000) + 1;
    async function holdBuilds(ms, what) {
        const before = dbg().placed, held = await holdOn('play:build', ms);
        const got = dbg().placed - before, want = Math.min(holdBlocks(held), dbg().total - before);
        // Within 150 ms of a step the release and the timer race; either count is right.
        const near = (held % 1000 > 850 || held % 1000 < 150) && held > 2850;
        if (got !== want && !(near && Math.abs(got - want) === 1)) throw new Error(label + ': ' + what + ' (' + held + ' ms): ' + got + ' blocks, expected ' + want);
    }
    await choose('play:build'); placedIs(1, 'first press');
    await holdBuilds(2500, 'a 2.5 s hold');
    await holdBuilds(5500, 'a 5.5 s hold (3 s, 4 s, 5 s)');
    // Held to the end: Build goes away at the last block and the release must not choose Destroy.
    await holdBuilds(7500, 'holding to the end'); placedIs(7, 'holding to the end');
    await until(() => dbg().sim === 'complete', 4000, 'the held build to finish');
    await sleep(400);
    if (dbg().sim !== 'complete') throw new Error(label + ': releasing a finished hold did ' + dbg().sim);
    if (w.document.querySelector('.bnb-build-btn.is-charging, .bnb-build-btn.is-repeating')) throw new Error(label + ': hold meter still showing');
    await choose('play:destroy');
    await until(() => dbg().screen === 'done', 15000, 'All knocked down after the hold');
    await choose('done:again'); await expectScreen('play');
    await until(() => dbg().sim === 'empty', 4000, 'the rubble to clear again');

    // Half a build, then the pause menu and every settings row.
    await choose('play:build'); await press('Enter'); await press('Enter');
    await choose('play:pause'); await expectScreen('pause');
    if (!dbg().paused) throw new Error(label + ': the game did not pause');
    await choose('pause:settings'); await expectScreen('settings');
    const rows = Array.from(w.document.querySelectorAll('.bnb-row')).map(r => r.dataset.setting).filter(id => id !== 'back' && id !== 'tts' && id !== 'auto');
    for (const id of rows) {
        await choose('set:' + id);
        if (id === 'reset') await choose('set:reset');
        if (dbg().screen !== 'settings') throw new Error(label + ': set:' + id + ' left settings');
    }
    await choose('set:back'); await expectScreen('pause');
    await choose('pause:help'); await expectScreen('help');
    await choose('help:back'); await expectScreen('pause');
    await choose('pause:continue'); await expectScreen('play');

    // The settings pass turned Hold to Build off: a long hold is one block, on release.
    if (w.BNB.Settings.get('holdBuild') !== false) throw new Error(label + ': Hold to Build did not turn off');
    const halfway = dbg().placed;
    await choose('play:build'); placedIs(halfway + 1, 'a press with Hold to Build off');
    await holdOn('play:build', 4500); placedIs(halfway + 2, 'a 4.5 s hold with Hold to Build off');

    // Destroy halfway: with only a few blocks, one press does it.
    await choose('play:destroy');
    await until(() => dbg().screen === 'done', 15000, 'the half build to come down');
    await choose('done:another'); await expectScreen('select');
    await choose('select:back'); await expectScreen('menu');

    await sleep(300);
    const spoken = w.spoken.slice();
    w.close();
    const bad = errors.filter(e => !/AudioContext/.test(e)).concat(warns.filter(m => /failed|threw|Could not/i.test(m)));
    if (bad.length) throw new Error(label + ': errors\n' + bad.join('\n'));
    return { spoken: spoken, warns: warns };
}

(async function main() {
    const t0 = Date.now();
    const only = process.env.SESSION;   // 'two' or 'one' runs just that session
    if (only !== 'one') {
        const two = await session('two switches', { autoScan: false });
        console.log('ok two switches  (' + two.spoken.length + ' lines spoken, e.g. ' + JSON.stringify(two.spoken.filter(s => /built|Wrecking|!|knocked/i.test(s)).slice(0, 5)) + ')');
        if (two.warns.length) console.log('  warnings: ' + two.warns.slice(0, 5).join(' | '));
    }
    if (only !== 'two') {
        const one = await session('one switch', { autoScan: true, scanInterval: 1000 });
        console.log('ok one switch (Auto Scan)  (' + one.spoken.length + ' lines spoken)');
    }
    console.log('\nall dom smoke sessions passed in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
})().catch(e => { console.error(e.message || e); process.exit(1); });
