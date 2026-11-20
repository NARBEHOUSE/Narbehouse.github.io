'use strict';
/* NARBE Space Explorer - whole sessions played through the real page, headless, by switch presses.
 * (Harness from NARBE Build n Ride's tests/dom-smoke.cjs.)
 *
 * Loads index.html in jsdom (a Node DOM: no browser, no rendering, no GPU - safe on this PC) with
 * the hub's real shared scanner, voice manager, graphics manager and input guard and the real
 * three.js scene graph. Only speech, canvas 2D, media and the WebGL renderer are faked. A driver
 * presses Space and Enter (keydown/keyup, like a switch interface):
 *   menu (opens unhighlighted) > Start Exploring > Turn Left, Speed Up, View x3 > Next Stop
 *   > (the ship is moved near a planet) "Do you want to go here?" (opens unhighlighted) > No
 *   > asked again later > Yes > glide > orbit (logbook entry) > Scan > Back > Fly Low > Scan
 *   > Back > Back to Orbit > a moon and back > Leave Orbit > Explore System (the camera rises
 *   over the system, rings light up on the worlds, bigger worlds never touch) > a world > orbit
 *   > Nearby Stars > a star > its system from above > Back > flying > an inhabited planet:
 *   ships, an alien call, Wave Hello, Say Goodbye > Warp > galaxy map > new galaxy > Pause
 *   > every Settings row (Reset Logbook arms first, a scan away disarms) > How to Play
 *   > Logbook > an entry > Next > Back > Back > Continue > Pause > Main Menu > Exit Game.
 * Then a shorter run with Auto Scan (one switch: Enter only). Any script error fails the run, and
 * so does a choice (or the painted highlight) that is not on the screen being shown.
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
    this.domElement.width = 1280; this.domElement.height = 720;
    this.shadowMap = { enabled: false, type: 0 };
    this.outputColorSpace = 'srgb'; this.toneMapping = 0; this.toneMappingExposure = 1;
    this._ratio = 1; this.renders = 0;
  }
  Fake.prototype.setPixelRatio = function (r) { this._ratio = r; };
  Fake.prototype.getPixelRatio = function () { return this._ratio; };
  Fake.prototype.setSize = function () {};
  Fake.prototype.render = function (scene, camera) { this.renders++; scene.updateMatrixWorld(); camera.updateMatrixWorld(); };
  ['setScissor', 'setScissorTest', 'setViewport', 'setClearColor', 'clear', 'dispose', 'forceContextLoss'].forEach(function (k) { Fake.prototype[k] = function () {}; });
  THREE.WebGLRenderer = Fake;
})();`;

class HubFiles extends jsdom.ResourceLoader {
    fetch(url, options) {
        if (!url.startsWith(ORIGIN)) return Promise.resolve(Buffer.from(''));   // fonts etc: nothing
        const rel = decodeURIComponent(url.slice(ORIGIN.length).split('?')[0]);
        const file = path.join(HUB, rel);
        const p = new Promise((resolve, reject) => fs.readFile(file, (err, buf) => {
            if (err) return reject(err);
            if (/NARBESPACEEXPLORER\/vendor\/three\.min\.js$/.test(rel)) buf = Buffer.concat([buf, Buffer.from(FAKE_RENDERER)]);
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
    // Node counts timers from its event loop's cached clock; pad longer timers so the shared
    // scanner's Auto Scan never stalls (a test-only quirk; see Build n Ride's test).
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
            this.speaking = true; current = u; w.spoken.push({ text: u.text, pitch: u.pitch, rate: u.rate });
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
    w.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/jpeg;base64,' + 'A'.repeat(400); };
    w.URL.createObjectURL = () => 'blob:fake';
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.posted = [];
}

async function session(label, scan, full) {
    const errors = [], warns = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => { if (!/Not implemented: (navigation|window\.scrollTo|HTMLCanvasElement)|Could not load link/.test(e.message)) errors.push('jsdom: ' + e.message); });
    vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));
    vc.on('warn', (...a) => { const m = a.map(String).join(' '); if (!/deprecated with r150|not loaded/.test(m)) warns.push(m); });
    const dom = new JSDOM(fs.readFileSync(path.join(GAME, 'index.html'), 'utf8'), {
        url: ORIGIN + 'apps/games/NARBESPACEEXPLORER/index.html', runScripts: 'dangerously', resources: new HubFiles(),
        pretendToBeVisual: true, virtualConsole: vc,
        beforeParse(w) {
            w.localStorage.setItem('narbe-scan-settings', JSON.stringify(Object.assign({ autoScan: false, scanInterval: 1000, scanSpeedIndex: 0 }, scan)));
            w.localStorage.setItem('nse-settings-v1', JSON.stringify({ hails: 'often' }));
            stub(w, errors);
        }
    });
    const w = dom.window;
    const dbg = () => (w.__nse ? w.__nse() : { screen: 'boot' });
    for (let i = 0; i < 400 && dbg().screen !== 'menu'; i++) { await sleep(50); if (dbg().screen === 'error') break; }
    if (dbg().screen !== 'menu') throw new Error(label + ': never reached the menu (' + dbg().screen + ')\n' + errors.concat(warns).join('\n'));
    const auto = !!scan.autoScan;
    const log = [];
    const fail = msg => { throw new Error(label + ': ' + msg + '\n  state: ' + JSON.stringify(dbg()) + '\n  last spoken: ' + JSON.stringify(w.spoken.slice(-5).map(x => x.text)) + '\n  errors: ' + errors.join('\n')); };

    async function press(code, hold) {
        const ev = type => new w.KeyboardEvent(type, { code: code, key: code === 'Space' ? ' ' : 'Enter', bubbles: true, cancelable: true });
        w.document.body.dispatchEvent(ev('keydown'));
        await sleep(hold || 30);
        w.document.body.dispatchEvent(ev('keyup'));
        await sleep(260);
    }
    /** Is it really on screen? jsdom has no layout, so walk the page the way the CSS shows it:
     *  not in a hidden screen or HUD, not in another mode's button bar. */
    function onScreen(node) {
        if (!node || !node.isConnected) return false;
        const mode = w.document.querySelector('.nse-hud').dataset.mode;
        for (let p = node; p && p !== w.document.body; p = p.parentElement) {
            const c = p.classList;
            if (p.hidden) return false;
            if ((c.contains('nse-screen') || c.contains('nse-hud')) && !c.contains('show')) return false;
            if (c.contains('nse-bar') && !c.contains('nse-' + mode + '-bar')) return false;
            if (c.contains('nse-pause-btn') && /^(prompt|hail|warp)$/.test(mode)) return false;
        }
        return true;
    }
    const where = n => (n.textContent || '').trim().slice(0, 30) + ' in ' + ((n.closest('.nse-screen') || n.closest('.nse-bar') || n.parentElement || {}).className || '?');
    /** Every choice on this screen, and whatever the highlight is painted on, can be seen
     *  (Steer's Back once pointed at the scanner's hidden Back: clicks missed, the highlight vanished). */
    function visibleChoices() {
        for (const it of w.NSE.UI.scannables() || []) if (!onScreen(it.el)) fail('the choice ' + it.id + ' is not on screen (' + where(it.el) + ')');
        const id = dbg().highlighted, lit = w.document.querySelector('.nse-focus, .nse-focus-full');
        if (id && !lit) fail(id + ' is highlighted but nothing is painted');
        if (lit && !onScreen(lit)) fail('the highlight is painted on something not on screen (' + where(lit) + ')');
    }
    async function reach(id) {
        const until = Date.now() + 90000;
        for (let k = 0; auto ? Date.now() < until : k < 40; k++) {
            visibleChoices();
            if (dbg().highlighted === id) return true;
            if (auto) await sleep(20); else await press('Space');
        }
        fail('could not reach ' + id + ' (highlighted ' + dbg().highlighted + ')');
    }
    async function choose(id) { await reach(id); await press('Enter'); log.push(id); }
    async function until(fn, ms, what) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { if (fn()) return; await sleep(50); }
        fail('timed out waiting for ' + what);
    }
    const screen = async (s, ms) => until(() => dbg().screen === s, ms || 4000, 'screen ' + s);
    const blank = async where => { if (dbg().highlighted) fail(where + ' opened with ' + dbg().highlighted + ' highlighted'); };
    const F = () => w.__nseFlight;
    const UV = () => w.NSE.Universe;

    /** Put the ship just outside a world's prompt distance, facing it. */
    function nearTo(pred) {
        const s = F().state;
        const systems = UV().systemsNear(s.galaxy, s.pos, 3);
        for (const sys of systems) {
            const o = UV().objectsOf(sys).find(pred);
            if (!o) continue;
            const d = o.trigger + 40;
            const pos = { x: o.pos.x + d, y: o.pos.y + 5, z: o.pos.z };
            F().place(s.galaxy, pos, Math.PI / 2, 0);   // yaw +90 deg faces -X, toward it
            return o;
        }
        return null;
    }

    // --- the main menu ---------------------------------------------------------------------
    await blank('main menu');
    await until(() => w.spoken.some(s => /Space Explorer/.test(s.text)), 4000, 'the menu title to be spoken');
    await choose('menu:start'); await screen('fly');
    await blank('flying');
    if (dbg().paused) fail('paused while flying');

    if (full) {
        // The flying scan is short: Next Stop, Explore, Warp, Steer, Pause.
        const flyIds = w.NSE.UI.scannables().map(x => x.id).join();
        if (flyIds !== 'fly:next,fly:explore,fly:warp,fly:steer,hud:pause') fail('flying scan was ' + flyIds);
        // Steer opens the steering controls; one press, one smooth turn; Speed cycles; Back returns.
        await choose('fly:steer'); await screen('steer');
        await blank('Steer');
        const yaw0 = F().state.yawTarget;
        await choose('steer:left');
        if (Math.abs(F().state.yawTarget - yaw0 - Math.PI / 6) > 0.01) fail('Turn Left did not turn 30 degrees');
        await choose('steer:speed');
        if (w.NSE.Settings.speedName() !== 'Fast') fail('Speed gave ' + w.NSE.Settings.speedName());
        await choose('steer:back'); await screen('fly');
        if (dbg().highlighted !== 'fly:steer') fail('Back from Steer did not return to Steer (' + dbg().highlighted + ')');
        // Mouse and touch: a click on the Back button that is on the Steer row.
        await choose('fly:steer'); await screen('steer');
        w.document.querySelector('.nse-steer-bar .nse-hud-btn:last-child').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        await screen('fly', 1500);
        // View lives in the Pause menu.
        await choose('hud:pause'); await screen('pause');
        const views = [];
        for (let k = 0; k < 3; k++) { await choose('pause:view'); views.push(dbg().view); }
        if (views.join() !== 'chase,wide,cockpit') fail('view cycle was ' + views.join());
        await choose('pause:continue'); await screen('fly');
        await choose('fly:next');
        if (!dbg().autopilot) fail('Next Stop picked nothing');
    }

    // --- Do you want to go here? ---------------------------------------------------------------
    const planet = nearTo(o => o.kind === 'planet' && (o.world.moons.length > 0 || !full) && !o.world.civ);
    if (!planet) fail('no planet nearby');
    await screen('prompt', 6000);
    await blank('the prompt');
    await until(() => w.spoken.some(s => /Do you want to go here/.test(s.text)), 4000, 'the prompt to be spoken');
    if (full) {
        await choose('prompt:no'); await screen('fly');
        if (F().state.prompting) fail('No left a question open');
        nearTo(o => o.id === planet.id);   // fly back: asked again
        await screen('prompt', 6000);
    }
    await choose('prompt:yes');
    await until(() => dbg().screen === 'glide' || dbg().screen === 'orbit', 3000, 'gliding');
    await screen('orbit', 12000);
    await blank('orbit');
    if (dbg().logbook < 1) fail('orbit did not write the logbook');
    // The logbook picture arrives once the maps are painted.
    // (Whatever was asked about: near a close-in planet, its star may have asked first.)
    await until(() => (w.NSE.Logbook.list()[0] || {}).picture, 12000, 'a logbook picture');
    if (full && dbg().target !== planet.name) fail('orbiting ' + dbg().target + ', not ' + planet.name);

    if (full) {
        // Scan from orbit.
        await choose('orbit:scan'); await screen('scanner');
        await until(() => w.spoken.some(s => /^Scanning/.test(s.text)), 4000, 'the scan to be spoken');
        if (w.document.querySelector('.nse-scan-list [hidden]') === null && w.NSE.UI.data().count < 2) fail('Next Creature shown for one creature');
        await choose('scan:back'); await screen('orbit');
        // Fly Low, scan there, back.
        // Fly Low dives down through the atmosphere first (no cut), then skims.
        await choose('orbit:low'); await screen('warp');
        await screen('low', 9000);
        if (!dbg().surface) fail('Fly Low built no surface');
        await blank('Fly Low');
        await choose('low:left');
        await choose('low:right');
        await choose('low:scan'); await screen('scanner');
        await choose('scan:back'); await screen('low');
        await choose('low:back'); await screen('warp');
        await screen('orbit', 8000);
        if (dbg().surface) fail('surface not cleared');
        // A moon, and back.
        await choose('orbit:moon');
        if (dbg().screen === 'moons') { await blank('moons'); await choose('moon:0'); }
        await screen('glide');
        await screen('orbit', 12000);
        if (!/ I$| II$| III$| IV$/.test(dbg().target)) fail('not at a moon: ' + dbg().target);
        await choose('orbit:moon'); await screen('glide'); await screen('orbit', 12000);
        if (dbg().target !== planet.name) fail('not back at ' + planet.name);
    }
    await choose('orbit:leave'); await screen('glide'); await screen('fly', 10000);

    if (full) {
        // --- Explore System: the camera rises over the system, each world lights up where it is ------
        {
            const sys0 = F().state.system;
            if (!sys0) nearTo(o => o.kind === 'star');
            await until(() => w.NSE.UI.current() === 'fly' || w.NSE.UI.current() === 'prompt', 4000, 'flying');
            if (w.NSE.UI.current() === 'prompt') { await choose('prompt:no'); await screen('fly'); }
            await until(() => F().state.system, 4000, 'being in a system');
            await choose('fly:explore'); await screen('system');
            await blank('Explore System');
            if (!dbg().survey) fail('Explore System did not take the camera up over the system');
            if (!F().state.held) fail('the ship kept flying under the shot over the system');
            if (w.document.querySelector('.nse-system-grid, .nse-sys-tile, .nse-card-system')) fail('the old menu card is still there');
            const items = w.NSE.UI.scannables().map(x => x.id);
            if (items[0] !== 'sys:w0' || items[items.length - 1] !== 'sys:back') fail('explore list was ' + items.join());
            const objs = w.NSE.UI.data().objs;
            if (w.document.querySelectorAll('.nse-pin').length !== objs.length) fail('not one ring per world (' + w.document.querySelectorAll('.nse-pin').length + ' for ' + objs.length + ')');
            await until(() => w.NSE.Stage.surveyAmount() >= 0.999, 6000, 'the camera to rise over the system');
            // Up there the orbits spread out and the planets are drawn bigger, never touching each
            // other, the star or the ship; each ring sits where its planet is drawn.
            const sysNow = F().state.system, ship = F().state.pos;
            const mesh = p => w.NSE.Space.partFor(p.id).mesh.group;
            const at = p => ({ x: mesh(p).position.x, y: mesh(p).position.y, z: mesh(p).position.z });
            const ext = p => (p.rings ? p.rings.outer : p.radius * 1.08) * mesh(p).scale.x;
            let grown = 0, spread = 0;
            sysNow.planets.forEach(function (p, i) {
                if (mesh(p).scale.x > 1.5) grown++;
                if (UV().dist(at(p), p.pos) > 1) spread++;
                if (UV().dist(at(p), w.NSE.Space.shownPos(p.id)) > 1e-6) fail(p.name + '\'s ring is not where it is drawn');
                if (UV().dist(at(p), ship) <= ext(p)) fail(p.name + ' grew over the ship');
                if (UV().dist(at(p), sysNow.pos) <= ext(p) + sysNow.stars[0].radius) fail(p.name + ' grew into its star');
                sysNow.planets.slice(i + 1).forEach(function (q) { if (UV().dist(at(p), at(q)) <= ext(p) + ext(q)) fail(p.name + ' and ' + q.name + ' touch in the shot'); });
            });
            if (sysNow.planets.length && !grown) fail('no planet was drawn bigger in the shot');
            if (sysNow.planets.length > 1 && !spread) fail('the orbits did not spread out in the shot');
            // A ring lights up on the world itself, and the panel says what it is.
            await reach('sys:w0');
            if (!w.document.querySelector('.nse-pin.nse-focus, .nse-pin.nse-focus-full')) fail('the highlighted world has no ring');
            await until(() => w.document.querySelector('.nse-cap-name').textContent === objs[0].name, 2000, 'the panel to name ' + objs[0].name);
            await choose('sys:w1'); await screen('glide');
            if (dbg().survey) fail('the camera stayed up over the system');
            await until(() => w.NSE.Stage.surveyAmount() === 0, 6000, 'the camera to come back down to the ship');
            sysNow.planets.forEach(function (p) {
                if (Math.abs(mesh(p).scale.x - 1) > 1e-6) fail(p.name + ' stayed big after the shot');
                if (UV().dist(at(p), p.pos) > 1e-6) fail(p.name + ' did not go back to its orbit after the shot');
            });
            sysNow.planets.forEach(function (p) { p.moons.forEach(function (m) { const part = w.NSE.Space.partFor(m.id); if (part && (!part.mesh.group.visible || part.mesh.group.scale.x !== 1)) fail(m.name + ' did not come back after the shot'); }); });
            await screen('orbit', 12000);
            await choose('orbit:leave'); await screen('glide'); await screen('fly', 10000);
        }
        // --- Nearby Stars: from deep space, glide to a system, then its worlds are offered ----------
        {
            const s = F().state;
            // Halfway between sectors, well away from any system.
            const S = w.NSE.Universe.SECTOR;
            let spot = null;
            for (let k = 0; k < 40 && !spot; k++) {
                const p = { x: (Math.floor(s.pos.x / S) + k) * S, y: 0, z: Math.floor(s.pos.z / S) * S };
                const near = w.NSE.Universe.systemsNear(s.galaxy, p, 1);
                if (!near.length || w.NSE.Universe.dist(near[0].pos, p) > near[0].radius + 1200) spot = p;
            }
            if (!spot) fail('no deep space found');
            F().place(s.galaxy, spot, 0, 0);
            await until(() => !F().state.system, 3000, 'deep space');
            await choose('fly:explore'); await screen('system');
            if (!dbg().survey) fail('Nearby Stars did not take the camera up');
            const items = w.NSE.UI.scannables().map(x => x.id);
            if (items[0] !== 'sys:s0') fail('nearby stars list was ' + items.join());
            await choose('sys:s0'); await screen('glide');
            if (dbg().survey) fail('the camera stayed up for the trip');
            await screen('system', 12000);
            const dd = w.NSE.UI.data();
            if (dd.mode !== 'worlds' || !dd.arrived || !dbg().survey) fail('arriving did not rise over the new system');
            await until(() => w.spoken.some(s => /You have reached the .* system/.test(s.text)), 4000, 'arriving to be announced');
            await choose('sys:back'); await screen('fly');
            if (dbg().survey) fail('Back left the camera up');
        }

        // --- an inhabited planet: welcome ships and an alien call --------------------------------
        let civ = nearTo(o => o.kind === 'planet' && o.world.civ);
        for (let k = 0; !civ && k < 30; k++) {
            const s = F().state;
            F().place(s.galaxy, { x: s.pos.x + 6000 * 3, y: 0, z: s.pos.z + 6000 * (k % 5) }, 0, 0);
            civ = nearTo(o => o.kind === 'planet' && o.world.civ);
        }
        if (!civ) fail('no inhabited planet found');
        await screen('prompt', 6000);
        // With Alien Calls on Often, someone calls on 9 of 10 arrivals (main.js onArrive). Make this
        // arrival's roll a call, so the run never fails one time in ten; only that one roll is fixed.
        const realRandom = w.Math.random;
        w.Math.random = function () { const caller = (new Error().stack || '').split('\n')[2] || ''; return /\bonArrive\b/.test(caller) ? 0 : realRandom(); };
        try { await choose('prompt:yes'); await screen('orbit', 12000); } finally { w.Math.random = realRandom; }
        if (!w.NSE.Space.greeting()) fail('no welcome ships');
        await screen('hail', 30000);   // 7 s of game time; jsdom's slow frames stretch it
        await blank('the alien call');
        await until(() => w.spoken.some(s => s.pitch && s.pitch !== 1), 8000, 'the alien to speak in an alien voice');
        await choose('hail:wave'); await screen('hail');
        await choose('hail:bye'); await screen('orbit');
        // Scanning an inhabited world shows its people first (an advanced civilisation).
        await choose('orbit:scan'); await screen('scanner');
        const sd = w.NSE.UI.data();
        if (!/^The /.test(sd.name) || !(sd.lines || []).some(l => /advanced civilisation/i.test(l))) fail('the people were not first in the scanner: ' + sd.name);
        await choose('scan:back'); await screen('orbit');
        await choose('orbit:leave'); await screen('fly', 12000);

        // --- warp ------------------------------------------------------------------------------
        const g0 = dbg().galaxy;
        await choose('fly:warp'); await screen('map');
        await blank('galaxy map');
        await choose('map:galaxy'); await screen('warp');
        // The new galaxy is shown whole first, then you choose to fly in.
        await screen('galaxy', 10000);
        await blank('the new galaxy');
        if (dbg().galaxy === g0) fail('warp stayed in the same galaxy');
        await until(() => w.spoken.some(s => /Welcome to the .* fly in and explore/.test(s.text)), 4000, 'the new galaxy to be announced');
        const g1 = dbg().galaxy;
        await choose('galaxy:another'); await screen('galaxy', 10000);
        if (dbg().galaxy === g1) fail('Find Another Galaxy stayed put');
        await choose('galaxy:in'); await screen('warp');
        await screen('fly', 8000);
        await until(() => w.spoken.some(s => /Exploring the/.test(s.text)), 4000, 'flying in to be announced');

        // --- pause, settings, help, logbook ----------------------------------------------------------
        await choose('hud:pause'); await screen('pause');
        if (!dbg().paused) fail('Pause did not pause');
        await blank('pause');
        await choose('pause:settings'); await screen('settings');
        await blank('settings');
        const rows = ['tts', 'voice', 'flight', 'hails', 'facts', 'motion', 'graphics', 'hlstyle', 'hlcolor', 'speed', 'sound', 'volume', 'music'];
        for (const r of rows) await choose('set:' + r);
        // Text to Speech and Sound Effects were switched off: switch them back on.
        await choose('set:tts');
        if (!w.NarbeVoiceManager.getSettings().ttsEnabled) fail('Text to Speech did not come back on');
        await choose('set:sound');
        if (!w.NSE.Settings.get('sound')) fail('Sound Effects did not come back on');
        // Reset Logbook arms on the first choose and erases only on the second.
        const n = dbg().logbook;
        await choose('set:reset');
        if (dbg().logbook !== n) fail('Reset Logbook erased on the first choose');
        await press('Space');   // scanning away disarms it
        await choose('set:reset');
        if (dbg().logbook !== n) fail('Reset Logbook erased after being disarmed');
        await choose('set:back'); await screen('pause');
        await choose('pause:help'); await screen('help');
        await choose('help:back'); await screen('pause');
        await choose('pause:log'); await screen('logbook');
        await blank('logbook');
        const first = w.NSE.Logbook.list()[0];
        await choose('log:' + first.id); await screen('entry');
        await until(() => w.spoken.some(s => s.text.indexOf(first.name) === 0), 4000, 'the entry to be read aloud');
        await choose('entry:next');
        await choose('entry:back'); await screen('logbook');
        await choose('log:back'); await screen('pause');
        await choose('pause:continue'); await screen('fly');
        if (dbg().paused) fail('Continue did not resume');
    }

    // --- out to the hub ------------------------------------------------------------------------------
    await choose('hud:pause'); await screen('pause');
    await choose('pause:menu'); await screen('menu');
    await blank('main menu again');
    await reach('menu:exit');
    const navigated = new Promise(r => { vc.on('jsdomError', e => { if (/navigation/.test(e.message)) r(true); }); setTimeout(() => r(false), 3000); });
    await press('Enter');
    const left = await navigated;
    if (!left) fail('Exit Game did not go back to the hub');

    const bad = errors.concat(warns.filter(m => /\[NSE\]/.test(m)));
    dom.window.close();
    if (bad.length) throw new Error(label + ': errors:\n' + bad.join('\n'));
    console.log('ok ' + label + ': ' + log.length + ' choices (' + log.slice(0, 6).join(', ') + ' ...)');
}

(async function () {
    try {
        await session('two switches', { autoScan: false }, true);
        await session('one switch (Auto Scan)', { autoScan: true }, false);
        console.log('ok all sessions');
        process.exit(0);
    } catch (e) {
        console.error(e.message || e);
        process.exit(1);
    }
})();
