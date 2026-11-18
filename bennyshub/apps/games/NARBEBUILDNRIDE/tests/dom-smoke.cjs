'use strict';
/* NARBE Build n Ride - whole sessions played through the real page, headless, by switch presses.
 *
 * Loads index.html in jsdom (a Node DOM: no browser, no rendering, no GPU - safe on this PC)
 * with the hub's real shared scanner, voice manager, graphics manager and input guard and the
 * real three.js scene graph. Only speech, canvas 2D, media and the WebGL renderer are faked
 * (the renderer is swapped for a no-op one as three.min.js is served). A driver presses Space
 * and Enter (keydown/keyup, like a switch interface):
 *   menu (opens unhighlighted) > Ride > Pick a Ride (opens unhighlighted) > Countryside > Horn
 *   > Speed x3 (Fast > Slow > Medium) > View x3 (Third Person > Conductor > Bird's Eye > Third Person)
 *   > Look (and it drifts back by itself) > Pause > every Settings row > How to Play > Resume
 *   > Pause > Main Menu.
 * Then Build: the see-through preview follows the highlight, Straight / Long Straight / Turn
 *   Left / Turn Right lay track, Undo takes it back, Connect lays the way home piece by piece,
 *   the finished loop is saved to My Tracks and Ride rides it. My Tracks: the track's card,
 *   Delete asks first (Keep It first in the scan), then deletes. Quick Build: Build lays a
 *   few pieces a press, and holding Enter keeps building (two switches).
 * Then the same with Auto Scan (one switch: Enter only). Any script error fails the run.
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
            if (/NARBEBUILDNRIDE\/vendor\/three\.min\.js$/.test(rel)) buf = Buffer.concat([buf, Buffer.from(FAKE_RENDERER)]);
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
    // Node counts timers from its event loop's cached clock, so after a busy frame a timer can
    // fire a few ms "early" by Date.now(). The shared scanner's Auto Scan checks Date.now() >= due
    // when its timer fires and does not re-arm, so in Node it can stall for good. Browsers count
    // from the moment of scheduling, so this is a test-only quirk: pad longer timers here.
    const realSetTimeout = w.setTimeout.bind(w);
    w.setTimeout = function (fn, delay) {
        const args = Array.prototype.slice.call(arguments, 2);
        return realSetTimeout.apply(null, [fn, delay >= 200 ? delay + 60 : delay].concat(args));
    };
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
        url: ORIGIN + 'apps/games/NARBEBUILDNRIDE/index.html', runScripts: 'dangerously', resources: new HubFiles(),
        pretendToBeVisual: true, virtualConsole: vc,
        beforeParse(w) {
            // Both spellings of a 1 s scan: the desktop reads scanInterval, the website scanSpeedIndex.
            w.localStorage.setItem('narbe-scan-settings', JSON.stringify(Object.assign({ autoScan: false, scanInterval: 1000, scanSpeedIndex: 0 }, scan)));
            stub(w, errors);
        }
    });
    const w = dom.window;
    const dbg = () => (w.__bnr ? w.__bnr() : { screen: 'boot' });
    for (let i = 0; i < 400 && dbg().screen !== 'menu'; i++) {
        await sleep(50);
        if (dbg().screen === 'error') break;
    }
    if (dbg().screen !== 'menu') throw new Error(label + ': never reached the menu (' + dbg().screen + ')\n' + errors.concat(warns).join('\n'));
    const auto = !!scan.autoScan;

    async function press(code, hold) {
        const ev = type => new w.KeyboardEvent(type, { code: code, key: code === 'Space' ? ' ' : 'Enter', bubbles: true, cancelable: true });
        w.document.body.dispatchEvent(ev('keydown'));
        await sleep(hold || 30);
        w.document.body.dispatchEvent(ev('keyup'));
        await sleep(260);   // past the input guard's cooldown
    }
    async function choose(id) { await reach(id); await press('Enter'); return true; }
    async function reach(id) {
        const until = Date.now() + 120000;
        for (let k = 0; auto ? Date.now() < until : k < 40; k++) {
            if (dbg().highlighted === id) return true;
            if (auto) await sleep(20); else await press('Space');
        }
        const st = w.BNR.Input.state() || {};
        throw new Error(label + ': could not reach ' + id + ' on ' + dbg().screen + ' (highlighted ' + dbg().highlighted + ')' +
            '\n  scanner: ' + JSON.stringify(st) + '\n  root: ' + JSON.stringify(Object.assign({}, w.document.getElementById('bnr').dataset)) +
            '\n  scan settings: ' + JSON.stringify(w.NarbeScanManager.getSettings()) +
            '\n  speaking: ' + w.speechSynthesis.speaking + ' last spoken: ' + JSON.stringify(w.spoken.slice(-4)));
    }
    async function until(fn, ms, what) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { if (fn()) return; await sleep(50); }
        throw new Error(label + ': timed out waiting for ' + what + ' (' + JSON.stringify(dbg()) + ')');
    }
    const expectScreen = async (s, ms) => until(() => dbg().screen === s, ms || 3000, 'screen ' + s);

    // Menus open with nothing highlighted.
    if (dbg().highlighted) throw new Error(label + ': menu opened with ' + dbg().highlighted + ' highlighted');
    await choose('menu:ride'); await expectScreen('select');
    if (dbg().highlighted) throw new Error(label + ': Pick a Ride opened highlighted');
    if (!w.document.querySelector('[data-route="countryside"]')) throw new Error(label + ': no Countryside tile');
    await choose('select:countryside'); await expectScreen('play');
    if (dbg().highlighted) throw new Error(label + ': play opened highlighted');
    if (dbg().mode !== 'ride' || dbg().route !== 'countryside') throw new Error(label + ': not riding the countryside: ' + JSON.stringify(dbg()));
    const s0 = dbg().s;

    // Horn: the callout says so (the sound and the steam go with it).
    await choose('play:horn');
    const callout = w.document.querySelector('.bnr-callout');
    if (!callout || callout.textContent !== 'Toot toot!') throw new Error(label + ': the horn showed ' + (callout && callout.textContent));
    // Speed cycles Medium > Fast > Slow > Medium.
    const speeds = [];
    for (let k = 0; k < 3; k++) {
        if (dbg().highlighted === 'play:speed') await press('Enter'); else await choose('play:speed');
        speeds.push(dbg().speed);
    }
    if (speeds.join() !== 'Fast,Slow,Medium') throw new Error(label + ': speed cycle was ' + speeds.join());

    // View cycles Third Person > Conductor > Bird's Eye > Third Person.
    const views = [];
    for (let k = 0; k < 3; k++) {
        if (dbg().highlighted === 'play:view') await press('Enter'); else await choose('play:view');
        views.push(dbg().view);
    }
    if (views.join() !== 'cab,bird,chase') throw new Error(label + ': view cycle was ' + views.join());

    // Look turns, then drifts back by itself after about six seconds.
    await choose('play:look');
    if (dbg().look === 'Behind') throw new Error(label + ': Look did not turn');
    await until(() => dbg().look === 'Behind', 9000, 'Look to drift back');

    // The train is moving.
    if (!(dbg().s > s0 + 5)) throw new Error(label + ': the train did not move (' + s0 + ' -> ' + dbg().s + ')');

    // Pause, every settings row, How to Play, Resume.
    await choose('play:pause'); await expectScreen('pause');
    if (!dbg().paused) throw new Error(label + ': the game did not pause');
    const sp = dbg().s;
    await sleep(500);
    if (dbg().s !== sp) throw new Error(label + ': the train kept moving while paused');
    await choose('pause:settings'); await expectScreen('settings');
    const rows = Array.from(w.document.querySelectorAll('.bnr-row')).map(r => r.dataset.setting).filter(id => id !== 'back' && id !== 'tts' && id !== 'auto');
    for (const id of rows) {
        await choose('set:' + id);
        if (dbg().screen !== 'settings') throw new Error(label + ': set:' + id + ' left settings');
    }
    if (w.BNR.Settings.get('comfort') !== true) throw new Error(label + ': Comfort Mode did not turn on');
    await choose('set:back'); await expectScreen('pause');
    await choose('pause:help'); await expectScreen('help');
    await choose('help:back'); await expectScreen('pause');
    await choose('pause:resume'); await expectScreen('play');
    if (dbg().paused) throw new Error(label + ': still paused after Resume');

    await choose('play:pause'); await expectScreen('pause');
    await choose('pause:menu'); await expectScreen('menu');
    if (dbg().mode !== 'menu') throw new Error(label + ': the stage stayed in ride mode');
    // Back out of Pick a Ride as well.
    await choose('menu:ride'); await expectScreen('select');
    await choose('select:back'); await expectScreen('menu');

    // --- Build -------------------------------------------------------------------------------
    const ghostOf = () => { let g = null; w.BNR.Scene.scene().traverse(o => { if (/^ghost /.test(o.name)) g = o.name; }); return g; };
    // Pieces: one a press (a Long Straight is one piece; a Quick Build press lays one piece of the
    // design); sections: the track sections underneath.
    const built = () => (dbg().build || {}).pieces;
    const sections = () => (dbg().build || {}).sections;
    const tracks0 = dbg().tracks;            // Build saves the track in progress itself: count from here
    await choose('menu:build'); await expectScreen('build');
    if (dbg().highlighted) throw new Error(label + ': Build opened highlighted');
    if (dbg().game !== 'build' || built() !== 0) throw new Error(label + ': not a fresh build: ' + JSON.stringify(dbg()));
    await reach('build:S');
    if (ghostOf() !== 'ghost next') throw new Error(label + ': no preview while Straight is lit (' + ghostOf() + ')');
    await press('Enter'); await until(() => built() === 1, 3000, 'a straight');
    await choose('build:LS'); await until(() => built() === 2, 3000, 'a long straight');
    if (sections() !== 4) throw new Error(label + ': a Long Straight is one piece, three sections long (' + sections() + ')');
    await choose('build:L'); await until(() => built() === 3, 3000, 'a left turn');
    await choose('build:R'); await until(() => built() === 4, 3000, 'a right turn');
    // Zoom stands the camera back (remembered), and round again to where it was.
    const zoomAt = () => w.BNR.Settings.get('buildZoomIndex');
    const z0 = zoomAt();
    await choose('build:zoom'); await until(() => zoomAt() === (z0 + 1) % 3, 3000, 'Zoom to stand back');
    await choose('build:zoom'); await choose('build:zoom'); await until(() => zoomAt() === z0, 3000, 'Zoom round again');
    await reach('build:undo');
    if (ghostOf() !== 'ghost undo') throw new Error(label + ': no red preview on Undo (' + ghostOf() + ')');
    await press('Enter'); await until(() => built() === 3, 3000, 'undo');
    await reach('build:connect');
    if (ghostOf() !== 'ghost plan') throw new Error(label + ': no gold preview on Connect (' + ghostOf() + ')');
    await press('Enter');
    await until(() => (dbg().build || {}).busy, 3000, 'Connect to start');
    await until(() => (dbg().build || {}).closed && !(dbg().build || {}).busy, 60000, 'Connect to close the loop');
    if (dbg().tracks !== tracks0 + 1) throw new Error(label + ': the loop was not saved to My Tracks');
    if (!/Loop complete/.test(w.document.querySelector('.bnr-callout').textContent)) throw new Error(label + ': no celebration');
    await choose('build:ride'); await expectScreen('play');
    if (!/^track:/.test(dbg().route) || !dbg().custom) throw new Error(label + ': not riding the home-made loop: ' + JSON.stringify(dbg()));
    await until(() => dbg().s > 0 && dbg().v > 0, 15000, 'the train to set off on the home-made loop');
    await choose('play:pause'); await expectScreen('pause');
    await choose('pause:menu'); await expectScreen('menu');

    // --- My Tracks: Edit (asks first) opens the loop again, unfinished until it is connected ------
    await choose('menu:tracks'); await expectScreen('select');
    const tile = w.document.querySelector('.bnr-grid [data-route]');
    if (!tile) throw new Error(label + ': My Tracks shows no track');
    const tileId = tile.dataset.route;
    await choose('select:' + tileId); await expectScreen('track');
    await choose('track:edit'); await expectScreen('confirm');
    if (w.BNR.UI.scannables()[0].id !== 'confirm:no') throw new Error(label + ': Keep It is not first when editing');
    await choose('confirm:yes'); await expectScreen('build', 15000);
    if ((dbg().build || {}).closed || !(built() > 0)) throw new Error(label + ': Edit did not open the loop to build on: ' + JSON.stringify(dbg().build));
    const e0 = built();
    await reach('build:undo'); await press('Enter'); await until(() => built() === e0 - 1, 3000, 'Undo while editing');
    await choose('build:pause'); await expectScreen('pause');
    await choose('pause:menu'); await expectScreen('menu');
    await choose('menu:tracks'); await expectScreen('select');
    await choose('select:' + tileId); await expectScreen('track');
    const ids = w.BNR.UI.scannables().map(it => it.id);
    if (ids.indexOf('track:keep') < 0 || ids.indexOf('track:ride') >= 0) throw new Error(label + ': an edited loop should be unfinished (Keep Building, no Ride): ' + ids.join(', '));
    if (dbg().tracks !== tracks0 + 1) throw new Error(label + ': editing made a second copy (' + dbg().tracks + ')');

    // --- My Tracks: the card, Delete asks first (Keep It first), then deletes ---------------------
    await choose('track:delete'); await expectScreen('confirm');
    if (dbg().highlighted) throw new Error(label + ': Are You Sure opened highlighted');
    if (w.BNR.UI.scannables()[0].id !== 'confirm:no') throw new Error(label + ': Keep It is not first');
    await choose('confirm:no'); await expectScreen('track');
    if (dbg().tracks !== tracks0 + 1) throw new Error(label + ': Keep It deleted the track');
    await choose('track:delete'); await expectScreen('confirm');
    await choose('confirm:yes'); await expectScreen('select');
    if (dbg().tracks !== tracks0) throw new Error(label + ': Delete did not delete');
    await choose('select:back'); await expectScreen('menu');

    // --- Quick Build ------------------------------------------------------------------------------
    await choose('menu:quick'); await expectScreen('select');
    await choose('select:countryside'); await expectScreen('build');
    if (dbg().game !== 'quick') throw new Error(label + ': not Quick Build: ' + JSON.stringify(dbg()));
    const q0 = built(), qs0 = sections();
    if (q0 !== 0 || !(dbg().build.total > 20)) throw new Error(label + ': Quick Build starts at piece 0 of its design (' + q0 + ' of ' + dbg().build.total + ')');
    await reach('build:quick');
    if (ghostOf() !== 'ghost next') throw new Error(label + ': no preview while Build is lit (' + ghostOf() + ')');
    await press('Enter'); await until(() => built() > q0, 3000, 'Quick Build to lay pieces');
    const q1 = built(), qs1 = sections();
    if (q1 - q0 !== 1) throw new Error(label + ': one press laid ' + (q1 - q0) + ' pieces (one press is one piece)');
    if (qs1 - qs0 < 3 || qs1 - qs0 > 5) throw new Error(label + ': one press laid ' + (qs1 - qs0) + ' track sections');
    if (!auto) {
        // Hold Enter on Build: after 3 s it builds by itself, once a second, until the switch comes up.
        await reach('build:quick');
        await press('Enter', 4300);
        await until(() => built() >= q1 + 2, 3000, 'hold to keep building');
    }
    await choose('build:pause'); await expectScreen('pause');
    await choose('pause:menu'); await expectScreen('menu');

    await sleep(300);
    const spoken = w.spoken.slice();
    const chunks = dbg().chunks;
    w.close();
    const bad = errors.filter(e => !/AudioContext/.test(e)).concat(warns.filter(m => /failed|threw|Could not/i.test(m)));
    if (bad.length) throw new Error(label + ': errors\n' + bad.join('\n'));
    return { spoken: spoken, warns: warns, chunks: chunks };
}

(async function main() {
    const t0 = Date.now();
    const only = process.env.SESSION;   // 'two' or 'one' runs just that session
    if (only !== 'one') {
        const two = await session('two switches', { autoScan: false });
        console.log('ok two switches  (' + two.spoken.length + ' lines spoken, e.g. ' + JSON.stringify(two.spoken.filter(s => /view|Look|From|Riding|Countryside|Speed/i.test(s)).slice(0, 8)) + '; ' + two.chunks + ' chunks built)');
        if (two.warns.length) console.log('  warnings: ' + two.warns.slice(0, 5).join(' | '));
    }
    if (only !== 'two') {
        const one = await session('one switch', { autoScan: true, scanInterval: 1000 });
        console.log('ok one switch (Auto Scan)  (' + one.spoken.length + ' lines spoken)');
    }
    console.log('\nall dom smoke sessions passed in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
})().catch(e => { console.error(e.message || e); process.exit(1); });
