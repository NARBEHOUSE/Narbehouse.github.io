/**
 * NARBE Build n Bash - boot the game's own modules in plain Node (dev-only).
 *
 * No browser, no GPU (they froze the development PC): Three.js builds the
 * real scene graph, ammo.js runs the real physics, and tools/node_render.cjs
 * draws pictures on the CPU. The UI modules (settings, sound, stage, input,
 * ui, main) are not loaded; everything they drive is in BNB.Sim.
 *
 *   const H = require('./harness.cjs');
 *   const { BNB, THREE } = H.boot();                 // no physics (sync)
 *   const { BNB, THREE } = await H.bootPhysics();    // with ammo.js
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('./node_render.cjs');

const GAME = path.join(__dirname, '..');
const HUB_TMP = path.join(GAME, '..', '..', '..', '..', 'tmp', 'bnb-shots');
/** The headless modules, in index.html order. */
const MODULES = ['shapes', 'builds', 'chunks', 'fx', 'physics', 'worlds', 'worlds2', 'bashers', 'sim'];

let booted = null;

function boot(opts) {
    if (booted) return booted;
    opts = opts || {};
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
    g.BNB = {};
    MODULES.forEach((name) => {
        const file = path.join(GAME, 'js', name + '.js');
        if (!fs.existsSync(file)) return;
        vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: 'js/' + name + '.js' });
    });
    booted = { BNB: g.BNB, THREE: g.THREE };
    return booted;
}

let physicsReady = null;
function bootPhysics(opts) {
    const b = boot(opts);
    if (!physicsReady) {
        globalThis.Ammo = require(path.join(GAME, 'vendor/ammo.js'));
        physicsReady = b.BNB.Physics.init().then(() => b);
    }
    return physicsReady;
}

/** A sim with a build loaded. o: { seed, quality, chunked, calm }. */
function sim(id, o) {
    o = o || {};
    const { BNB, THREE } = boot();
    if (!BNB.Sim.scene()) BNB.Sim.init(THREE, { seed: o.seed || 12345 });
    BNB.Sim.setOptions({ chunked: o.chunked !== false, calm: !!o.calm });
    BNB.Sim.load(id, { quality: o.quality || 'high', world: o.world });
    return BNB.Sim;
}

/** Step the sim for `secs` at a fixed dt. */
function run(S, secs, dt) {
    dt = dt || 1 / 60;
    for (let i = 0, n = Math.round(secs / dt); i < n; i++) S.update(dt);
}

/** The game camera for the current frame. view: { az, el, dist } offsets. */
function camera(S, w, h, view) {
    const { THREE } = boot();
    view = view || {};
    const f = S.frame();
    const cam = new THREE.PerspectiveCamera(view.fov || f.fov, w / h, 0.1, 600);
    // Follow a destroyer's focus hint the way js/stage.js does (lean halfway, pull back).
    const focus = view.focus === false ? null : S.focus();
    const look = view.look ? new THREE.Vector3().fromArray(view.look) : f.center.clone();
    let dist = view.dist || 1;
    if (focus && !view.look) {
        look.lerp(focus.point, 0.5);
        look.y = Math.max(look.y, f.center.y * 0.7);
        dist *= focus.dist;
    }
    const pos = S.cameraPos(f, view.az || 0, view.el || 0, dist).add(look).sub(f.center);
    cam.position.copy(pos);
    cam.lookAt(look);
    // Shift the subject in the frame as the game does: down by Sim.VIEW_SHIFT_Y (more sky
    // above the build) unless view.shiftY says otherwise; view.shiftX 0.15 = 15% right.
    const sy = view.shiftY === undefined ? BNB().Sim.VIEW_SHIFT_Y : view.shiftY;
    if (view.shiftX || sy) {
        cam.setViewOffset(w, h, -Math.round(w * (view.shiftX || 0)), -Math.round(h * sy), w, h);
        cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld(true);
    return cam;
}

/** Render the sim's scene from the game camera. Returns an image { W, H, data }. */
function shot(S, o) {
    o = o || {};
    const { THREE } = boot();
    const w = o.w || 400, h = o.h || 300;
    const cam = o.camera || camera(S, w, h, o.view);
    const world = S.world(), f = S.frame();
    const img = R.render(THREE, S.scene(), cam, w, h, {
        ss: o.ss || 2, sky: world.sky, voidSky: world.zeroG,
        shadow: world.zeroG ? null : { center: [f.center.x, 0, f.center.z], radius: Math.max(9, BNB().Builds.plotRadius(S.build()) + 6), darken: 0.45 }
    });
    if (o.label) R.text(img, 4, 4, String(o.label).toUpperCase(), 1, [255, 255, 255]);
    return img;
}
function BNB() { return boot().BNB; }

/** Write a PNG under the hub's tmp/bnb-shots (unique name: the Read tool caches by path). */
function save(img, name) {
    const file = path.join(HUB_TMP, name.replace(/\.png$/, '') + '-' + Date.now().toString(36) + '.png');
    R.writePNG(file, img);
    return file;
}

module.exports = { boot, bootPhysics, sim, run, camera, shot, save, R, GAME, HUB_TMP };
