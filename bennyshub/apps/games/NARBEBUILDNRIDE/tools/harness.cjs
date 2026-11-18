/**
 * NARBE Build n Ride - boot the game's own modules in plain Node (dev-only).
 *
 * No browser, no GPU (they froze the development PC): three.js builds the real
 * scene graph and tools/node_render.cjs draws pictures of it on the CPU. The
 * browser-only modules (settings, sound, stage, input, ui, main) are not loaded.
 *
 *   const H = require('./harness.cjs');
 *   const { BNR, THREE } = H.boot();
 *   H.load('countryside');               the route, every chunk built
 *   const cam = H.rideCamera('chase', s); the game's own camera rig, settled at s
 *   H.save(H.shot(cam), 'name');
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('./node_render.cjs');

const GAME = path.join(__dirname, '..');
const HUB_TMP = path.join(GAME, '..', '..', '..', '..', 'tmp', 'bnr-shots');
/** The headless modules, in index.html order. */
const MODULES = ['util', 'biomes', 'world', 'track', 'routes', 'path', 'build', 'tracks', 'geo', 'animals', 'props', 'terrain', 'trackview', 'train', 'stations', 'ride', 'sky', 'weather', 'fx', 'events', 'buildview', 'scene', 'cameras'];

let booted = null;

function boot() {
    if (booted) return booted;
    const g = globalThis;
    g.window = g; g.self = g; g.devicePixelRatio = 1; g.innerWidth = 1280; g.innerHeight = 720;
    g.addEventListener = () => {}; g.removeEventListener = () => {};
    g.document = {
        createElement: (t) => (t === 'canvas' ? new R.MiniCanvas() : { style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }),
        getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} }, querySelector: () => null
    };
    const store = new Map();
    g.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    g.requestAnimationFrame = () => 0;
    if (!g.performance) g.performance = { now: () => Date.now() };
    const warn = console.warn;
    console.warn = (...a) => { if (!String(a[0]).includes('deprecated with r150')) warn(...a); };
    g.THREE = require(path.join(GAME, 'vendor/three.min.js'));
    g.BNR = {};
    MODULES.forEach((name) => {
        const file = path.join(GAME, 'js', name + '.js');
        vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: 'js/' + name + '.js' });
    });
    booted = { BNR: g.BNR, THREE: g.THREE };
    return booted;
}

/** Load a route with every chunk built. o: { quality, season, startS }. */
function load(id, o) {
    o = o || {};
    const { BNR, THREE } = boot();
    if (!BNR.Scene.scene()) BNR.Scene.init(THREE);
    const t0 = Date.now();
    BNR.Scene.load(typeof id === 'string' ? { route: id } : id, { quality: o.quality || 'high', season: o.season || 'summer', startS: o.startS, budget: 0 });
    const p = BNR.Scene.train().position();
    BNR.Scene.terrain().buildAll(p.x, p.z, 4000);
    if (!o.quiet) console.log('loaded', typeof id === 'string' ? id : 'track', 'in', Date.now() - t0, 'ms;', BNR.Scene.terrain().count(), 'chunks');
    return BNR.Scene;
}

/** Put the train's head at s (standing still) and settle the game's camera rig there. */
function rideCamera(viewName, s, o) {
    o = o || {};
    const { BNR, THREE } = boot();
    const S = BNR.Scene;
    const cam = new THREE.PerspectiveCamera(55, (o.w || 640) / (o.h || 360), 0.3, 1400);
    const rig = BNR.Cameras.create(THREE, cam);
    rig.setView(viewName);
    rig.snap();
    if (s !== null && s !== undefined) S.placeAt(s); else s = S.state.s;
    for (let k = 0; k < (o.looks || 0); k++) rig.cycleLook();
    const st = S.trainState();
    for (let k = 0; k < 120; k++) {
        rig.update(1 / 30, { sampler: S.sampler(), s: s, train: S.train(), inTunnel: st.inTunnel, covered: st.covered, comfort: !!o.comfort });
    }
    const p = S.train().position();
    S.sky().update(0, p.x, p.y, p.z);
    cam.updateMatrixWorld(true);
    return cam;
}

/** Run the scene for `secs` (the ride, stations, events) at a fixed step. */
function simulate(secs, dt) {
    const { BNR } = boot();
    dt = dt || 1 / 30;
    for (let i = 0, n = Math.round(secs / dt); i < n; i++) BNR.Scene.update(dt);
}

/** A camera looking straight down on the whole loop (a map). */
function mapCamera(w, h, pad) {
    const { BNR, THREE } = boot();
    const c = BNR.Scene.track().centerline();
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < c.n; i++) { x0 = Math.min(x0, c.x[i]); x1 = Math.max(x1, c.x[i]); z0 = Math.min(z0, c.z[i]); z1 = Math.max(z1, c.z[i]); }
    pad = pad || 60;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, span = Math.max((x1 - x0) * h / w, z1 - z0) / 2 + pad;
    const cam = new THREE.PerspectiveCamera(40, w / h, 5, 4000);
    const dist = span / Math.tan(20 * Math.PI / 180);
    cam.position.set(cx, dist, cz + dist * 0.18);
    cam.lookAt(cx, 0, cz);
    cam.updateMatrixWorld(true);
    BNR.Scene.sky().update(0, cx, 0, cz);
    return cam;
}

/** Render the scene from a camera. Returns an image { W, H, data }. */
function shot(cam, o) {
    o = o || {};
    const { BNR, THREE } = boot();
    const w = o.w || 640, h = o.h || 360;
    cam.aspect = w / h; cam.updateProjectionMatrix();
    const pal = BNR.Scene.sky().palette();
    const p = BNR.Scene.train().position();
    const scene = BNR.Scene.scene(), fog = scene.fog;
    if (o.fog === false) scene.fog = null;
    const clouds = BNR.Scene.sky().group.children.filter(ch => ch.isInstancedMesh);
    if (o.clouds === false) clouds.forEach(ch => { ch.visible = false; });
    const img = R.render(THREE, scene, cam, w, h, {
        ss: o.ss || 2, sky: [pal.top, pal.mid, pal.horizon],
        shadow: o.shadow === false ? null : { center: [p.x, p.y, p.z], radius: o.shadowR || 80, darken: 0.42 }
    });
    scene.fog = fog;
    clouds.forEach(ch => { ch.visible = true; });
    if (o.label) R.text(img, 4, 4, String(o.label).toUpperCase(), 1, [255, 255, 255]);
    return img;
}

/** Write a PNG under the hub's tmp/bnr-shots (unique name: the Read tool caches by path). */
function save(img, name) {
    const file = path.join(HUB_TMP, name.replace(/\.png$/, '') + '-' + Date.now().toString(36) + '.png');
    fs.mkdirSync(HUB_TMP, { recursive: true });
    R.writePNG(file, img);
    return file;
}

module.exports = { boot, load, rideCamera, simulate, mapCamera, shot, save, R, GAME, HUB_TMP };
