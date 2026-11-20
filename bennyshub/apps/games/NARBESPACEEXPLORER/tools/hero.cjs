/**
 * NARBE Space Explorer - the hub picture's 3D part, rendered on the CPU (dev-only).
 *
 *   node tools/hero.cjs <out.png>
 *   python tools/hub-image.py <out.png> <hub>/bennyshub/images/games/narbespaceexplorer.png
 *
 * Browsers, Electron and software WebGL are off-limits on the development PC (they froze it),
 * so this draws the game's real planet and ship meshes with NARBE Build n Ride's CPU renderer
 * (../NARBEBUILDNRIDE/tools/node_render.cjs). That renderer has no point lights or sprites,
 * so the picture uses a directional "sun" instead of the star's light.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const GAME = path.join(__dirname, '..');
const R = require(path.join(GAME, '..', 'NARBEBUILDNRIDE', 'tools', 'node_render.cjs'));
const g = globalThis;
g.window = g; g.devicePixelRatio = 1;
g.document = { createElement: t => (t === 'canvas' ? new R.MiniCanvas() : { style: {} }), getElementById: () => null, addEventListener() {} };
const store = new Map();
g.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
g.THREE = require(path.join(GAME, 'vendor/three.min.js'));
for (const f of ['util', 'universe', 'settings', 'planets', 'ship']) vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js', f + '.js'), 'utf8'), { filename: f });
const THREE = g.THREE, UV = NSE.Universe;
NSE.Planets.init(THREE, 'high');

const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0x8090c0, 0.35));
const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
sun.position.set(-0.7, 0.5, 1);
scene.add(sun);

// A ringed gas giant and an earth-like world from the home galaxy's seeds.
const giant = UV.world(1001, { kind: 'planet', name: 'Giant', type: 'gas' });
giant.rings = giant.rings || { inner: giant.radius * 1.6, outer: giant.radius * 2.5, color: giant.palette.peak, tilt: 0.25 };
giant.rings.tilt = 0.32;
const home = UV.world(2003, { kind: 'planet', name: 'Home', type: 'earth' });
const gm = NSE.Planets.worldMesh(giant, { orbit: true });
const hm = NSE.Planets.worldMesh(home, { orbit: true });
NSE.Planets.flush();
gm.group.position.set(60, 18, -150);
gm.group.rotation.y = 0.6;
hm.group.position.set(-50, -15, -78);
hm.group.scale.setScalar(0.75);
scene.add(gm.group, hm.group);
scene.traverse(o => { if (o.material && o.material.isShaderMaterial) o.visible = false; });

const ship = NSE.Ship.build(THREE);
ship.group.position.set(-6, -4, -24);
ship.group.lookAt(-6 - 0.6, -4 + 0.12, -24 + 1);      // nose (-Z) heads up and to the right
ship.body.rotation.z = -0.35;
scene.add(ship.group);

// Background stars.
const r = NSE.Util.rng(9);
const pts = [], cols = [];
for (let i = 0; i < 1800; i++) {
    pts.push(r.range(-900, 900), r.range(-520, 520), -800);
    const b = Math.pow(r(), 2) * 0.9 + 0.1;
    cols.push(b, b, b * 1.05);
}
const sg = new THREE.BufferGeometry();
sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true })));

const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 5000);
cam.position.set(0, 0, 0);
cam.lookAt(0, 0, -100);
const img = R.render(THREE, scene, cam, 1280, 720, { sky: ['#06081c', '#0c1236', '#1a1450'] });
const out = process.argv[2] || path.join(GAME, '..', '..', '..', '..', 'tmp', 'nse-hero.png');
R.writePNG(out, img);
console.log(out);
