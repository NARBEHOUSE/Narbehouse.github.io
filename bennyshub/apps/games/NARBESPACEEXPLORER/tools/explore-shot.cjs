/**
 * NARBE Space Explorer - a picture of Explore System's shot over a system (dev-only check).
 *
 *   JSDOM=<dir>/node_modules/jsdom node tools/explore-shot.cjs <out-dir> [highlight] [min planets]
 *   python tools/explore-overlay.py <out-dir>
 *
 * Plays the real game headless in jsdom (as tests/dom-smoke.cjs does), flies into a system with
 * several planets, chooses Explore System, presses Space to highlight a world, waits for the
 * camera to rise, then draws the 3D scene from the game's own camera using NARBE Build n
 * Ride's CPU renderer. That renderer has no sprites, point lights,
 * lines or shader shells, so a stand-in light from the camera's side lights the worlds and the
 * orbit lines are drawn as dots. Where each ring, name, the star's glow and the page's panels go is
 * written to shot.json; explore-overlay.py draws them on top (a mock-up of the page, not the page).
 * Browsers, Electron and software WebGL are off-limits on the development PC (they froze it).
 */
'use strict';
const path = require('path'), fs = require('fs');
const jsdom = require(process.env.JSDOM || 'jsdom');
const { JSDOM, VirtualConsole } = jsdom;
const GAME = path.join(__dirname, '..');
const HUB = path.join(GAME, '..', '..', '..');
const R = require(path.join(GAME, '..', 'NARBEBUILDNRIDE', 'tools', 'node_render.cjs'));
const ORIGIN = 'http://hub.local/';
const OUT = process.argv[2] || path.join(HUB, '..', 'tmp', 'nse-explore-shot');
const FOCUS = Number(process.argv[3] || 3);          // which ring to highlight (1 = the star)
const MIN_PLANETS = Number(process.argv[4] || 5);
const W = 1280, H = 720;

const FAKE_RENDERER = `
;(function () {
  function Fake(opts) {
    opts = opts || {};
    this.domElement = opts.canvas || document.createElement('canvas');
    this.domElement.width = 1280; this.domElement.height = 720;
    this.shadowMap = { enabled: false, type: 0 };
    this.outputColorSpace = 'srgb'; this.toneMapping = 0; this.toneMappingExposure = 1;
    this._ratio = 1;
  }
  Fake.prototype.setPixelRatio = function (r) { this._ratio = r; };
  Fake.prototype.getPixelRatio = function () { return this._ratio; };
  Fake.prototype.setSize = function () {};
  Fake.prototype.render = function (scene, camera) { scene.updateMatrixWorld(); camera.updateMatrixWorld(); };
  ['setScissor', 'setScissorTest', 'setViewport', 'setClearColor', 'clear', 'dispose', 'forceContextLoss'].forEach(function (k) { Fake.prototype[k] = function () {}; });
  THREE.WebGLRenderer = Fake;
})();`;

class HubFiles extends jsdom.ResourceLoader {
    fetch(url) {
        if (!url.startsWith(ORIGIN)) return Promise.resolve(Buffer.from(''));
        const rel = decodeURIComponent(url.slice(ORIGIN.length).split('?')[0]);
        const p = new Promise((resolve, reject) => fs.readFile(path.join(HUB, rel), (err, buf) => {
            if (err) return reject(err);
            if (/NARBESPACEEXPLORER\/vendor\/three\.min\.js$/.test(rel)) buf = Buffer.concat([buf, Buffer.from(FAKE_RENDERER)]);
            resolve(buf);
        }));
        p.abort = () => {};
        return p;
    }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function stub(w) {
    w.SpeechSynthesisUtterance = function (text) { this.text = text; };
    w.speechSynthesis = { speaking: false, pending: false, getVoices: () => [{ name: 'Fake', lang: 'en-US', default: true }], speak(u) { setTimeout(() => u.onend && u.onend(), 5); }, cancel() {}, addEventListener() {}, removeEventListener() {} };
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    w.HTMLMediaElement.prototype.pause = function () {};
    w.HTMLMediaElement.prototype.load = function () {};
    w.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {}, finish() {} }; };
    const grad = { addColorStop() {} };
    w.HTMLCanvasElement.prototype.getContext = function () {
        const t = { canvas: this, createLinearGradient: () => grad, createRadialGradient: () => grad, getImageData: (x, y, ww, hh) => ({ data: new Uint8ClampedArray(Math.max(1, ww * hh * 4)) }), measureText: s => ({ width: String(s).length * 8 }) };
        return new Proxy(t, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
    };
    w.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/jpeg;base64,AAAA'; };
    w.URL.createObjectURL = () => 'blob:fake';
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    // A 1280 x 720 screen, so the game frames its shot and places its rings for real.
    Object.defineProperty(w, 'innerWidth', { configurable: true, get() { return W; } });
    Object.defineProperty(w, 'innerHeight', { configurable: true, get() { return H; } });
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return W; } });
    Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return H; } });
    w.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0 }; };
}

(async function () {
    const vc = new VirtualConsole();
    vc.on('error', (...a) => console.error('[page]', ...a));
    const dom = new JSDOM(fs.readFileSync(path.join(GAME, 'index.html'), 'utf8'), {
        url: ORIGIN + 'apps/games/NARBESPACEEXPLORER/index.html', runScripts: 'dangerously', resources: new HubFiles(), pretendToBeVisual: true, virtualConsole: vc,
        beforeParse(w) {
            w.localStorage.setItem('narbe-scan-settings', JSON.stringify({ autoScan: false, scanInterval: 1000 }));
            w.localStorage.setItem('nse-settings-v1', JSON.stringify({ hails: 'off', view: 'chase' }));
            stub(w);
        }
    });
    const w = dom.window;
    for (let i = 0; i < 400 && !(w.__nse && w.__nse().screen === 'menu'); i++) await sleep(50);
    if (!(w.__nse && w.__nse().screen === 'menu')) throw new Error('the game never reached its menu');
    const T = w.THREE, UV = w.NSE.Universe, F = w.__nseFlight;
    w.NSE.Game.startExploring();
    const s = F.state;
    let sys = null;
    if (process.argv[5] === 'stars') {
        // Nearby Stars: halfway between sectors, well away from any system.
        const S = UV.SECTOR;
        for (let k = 0; k < 40; k++) {
            const p = { x: (Math.floor(s.pos.x / S) + k) * S, y: 0, z: Math.floor(s.pos.z / S) * S };
            const near = UV.systemsNear(s.galaxy, p, 1);
            if (!near.length || UV.dist(near[0].pos, p) > near[0].radius + 1200) { F.place(s.galaxy, p, 0.4, 0); break; }
        }
        for (let i = 0; i < 100 && F.state.system; i++) await sleep(30);
    } else {
        // A system with several planets; come in just inside it, opposite its outermost planet, facing the star.
        sys = UV.systemsNear(s.galaxy, s.pos, 3).find(x => x.planets.length >= MIN_PLANETS && x.kind !== 'blackhole') || UV.systemsNear(s.galaxy, s.pos, 3).find(x => x.planets.length >= 2);
        const last = sys.planets[sys.planets.length - 1];
        const away = last.angle + Math.PI;
        const pos = { x: sys.pos.x + Math.cos(away) * (sys.radius - 40), y: sys.pos.y + 30, z: sys.pos.z + Math.sin(away) * (sys.radius - 40) };
        const look = w.NSE.Flight.anglesOf({ x: sys.pos.x - pos.x, y: 0, z: sys.pos.z - pos.z });
        F.place(s.galaxy, pos, look.yaw, 0);
        for (let i = 0; i < 100 && !(F.state.system && F.state.system.id === sys.id); i++) await sleep(30);
    }
    if (w.NSE.UI.current() === 'prompt') w.NSE.Game.answer(false);
    w.NSE.Game.explore();
    // Highlight a world the way a switch does (Space presses).
    for (let k = 0; k < FOCUS; k++) {
        const ev = type => new w.KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true, cancelable: true });
        w.document.body.dispatchEvent(ev('keydown')); await sleep(30); w.document.body.dispatchEvent(ev('keyup')); await sleep(200);
    }
    for (let i = 0; i < 200 && w.NSE.Stage.surveyAmount() < 1; i++) await sleep(30);
    w.NSE.Planets.flush();
    await sleep(1200);                                   // the lift eases off and the lens settles

    // The game's own camera (Explore System has no lift: it frames its own shot).
    const sc = w.NSE.Stage.camera();
    const cam = new T.PerspectiveCamera(sc.fov, W / H, sc.near, sc.far);
    cam.position.copy(sc.position);
    cam.quaternion.copy(sc.quaternion);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    // Read the page's rings now, before the scene is changed for the CPU renderer.
    const pinEls = Array.from(w.document.querySelectorAll('.nse-pin'));
    const pagePins = pinEls.map(el => ({ name: el.querySelector('.nse-pin-name').textContent, x: el._cx, y: el._cy, R: el._r, on: !el._off, quiet: !!el._quiet, focus: el.classList.contains('nse-focus') || el.classList.contains('nse-focus-full') }));
    const youEl = w.document.querySelector('.nse-pin-you');

    const scene = w.NSE.Space.scene();
    scene.traverse(o => { if (o.material && o.material.isShaderMaterial) o.visible = false; });
    // Orbit lines as dense dots (the CPU renderer draws no lines).
    const orbits = scene.getObjectByName('orbits');
    if (orbits) orbits.children.slice().forEach(function (line) {
        const a = line.geometry.attributes.position, pts = [];
        for (let i = 0; i < a.count - 1; i++) for (let k = 0; k < 8; k++) {
            const t = k / 8;
            pts.push(a.getX(i) + (a.getX(i + 1) - a.getX(i)) * t, a.getY(i) + (a.getY(i + 1) - a.getY(i)) * t, a.getZ(i) + (a.getZ(i + 1) - a.getZ(i)) * t);
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
        orbits.add(new T.Points(g, new T.PointsMaterial({ color: 0x4a6ca8, size: 1.5, sizeAttenuation: false })));
    });
    // A stand-in for the star's light (point lights are not drawn): from the camera's side.
    if (sys) {
        const sun = new T.DirectionalLight(0xfff2dc, 1.1 * Math.PI);
        sun.position.copy(cam.position);
        sun.target.position.set(sys.pos.x, sys.pos.y, sys.pos.z);
        scene.add(sun, sun.target);
    }
    scene.updateMatrixWorld(true);
    const img = R.render(T, scene, cam, W, H, { sky: ['#02030a', '#02030a', '#03040e'], ss: 2 });
    fs.mkdirSync(OUT, { recursive: true });
    R.writePNG(path.join(OUT, 'shot.png'), img.W === W ? img : downsample(img, W, H));

    // Where the page put each ring (js/ui.js placePin, quietNames), the star's glow and the panels.
    const data = w.NSE.UI.data();
    const focusId = (w.NSE.Input.state() || {}).id;
    const pins = pagePins.map(function (p, i) {
        const o = (data.objs || [])[i];
        return Object.assign(p, { scale: o ? (o.kind === 'star' ? w.NSE.Space.shownScale('star') : w.NSE.Space.shownScale(o.id)) : 1 });
    });
    const st = !sys || sys.kind === 'blackhole' ? null : sys.stars[0];
    const starPx = st ? w.NSE.Stage.projectSphere(sys.pos, st.radius * w.NSE.Space.shownScale('star')) : null;
    const toPx = () => ({ x: youEl._cx, y: youEl._cy, on: !youEl.classList.contains('off') });
    const q = s => (w.document.querySelector(s) || {}).textContent || '';
    const info = {
        size: [W, H], system: sys ? sys.name : 'nearby stars', planets: sys ? sys.planets.length : 0, focusId: focusId,
        highlight: w.NSE.Settings.highlightColor(), ink: w.NSE.Settings.highlightInk(),
        head: [q('.nse-survey-head .nse-info-name'), q('.nse-survey-head .nse-info-sub')],
        caption: [q('.nse-cap-name'), q('.nse-cap-what'), q('.nse-cap-tags')],
        orb: (data.objs || []).filter((o, i) => focusId === 'sys:w' + i).map(o => o.kind === 'star' ? { star: o.star.color } : { high: o.world.palette.high, mid: o.world.palette.mid, low: o.world.seaLevel > 0.3 ? o.world.palette.sea : o.world.palette.low, rings: !!o.world.rings })[0] || null,
        star: starPx ? { x: starPx.x, y: starPx.y, r: starPx.r, color: st.color, light: st.light } : null,
        you: toPx(), pins: pins,
        camera: { distance: sys ? sc.position.distanceTo(new T.Vector3(sys.pos.x, sys.pos.y, sys.pos.z)) : sc.position.distanceTo(new T.Vector3(F.state.pos.x, F.state.pos.y, F.state.pos.z)), fov: sc.fov }
    };
    fs.writeFileSync(path.join(OUT, 'shot.json'), JSON.stringify(info, null, 1));
    console.log((sys ? 'the ' + sys.name + ' system, ' + sys.planets.length + ' planets' : 'nearby stars') + '; highlighted ' + focusId + '; camera ' + Math.round(info.camera.distance) + (sys ? ' from the star' : ' from the ship'));
    pins.forEach(p => console.log('  ' + (p.focus ? '>' : ' ') + ' ' + p.name.padEnd(14) + ' at ' + Math.round(p.x) + ',' + Math.round(p.y) + ' ring ' + p.R + 'px, drawn x' + p.scale.toFixed(2) + (p.quiet ? ', name hidden' : '') + (p.on ? '' : ' (off screen)')));
    console.log(path.join(OUT, 'shot.png'));
    dom.window.close();
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

function downsample(img, w2, h2) {
    const ss = img.W / w2, out = Buffer.alloc(w2 * h2 * 3);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) sum += img.data[((y * ss + j) * img.W + x * ss + i) * 3 + c];
        out[(y * w2 + x) * 3 + c] = Math.round(sum / (ss * ss));
    }
    return { W: w2, H: h2, data: out };
}
