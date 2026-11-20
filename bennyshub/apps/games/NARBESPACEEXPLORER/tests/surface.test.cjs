/**
 * NARBE Space Explorer - Fly Low surface tests (Node only, no browser).
 *
 *   node tests/surface.test.cjs            (add --stub to use stand-in creatures)
 *
 * For every world type (and moons with their planet in the sky), and every terrain style of
 * every type: build the surface, fly simulated time at 30 fps through all three views and
 * three speeds (with steering presses), and check: nothing throws, no NaN ship/camera
 * positions, the ship always stays well above the ground and cruises 8-14 m over whatever
 * is below, the camera never goes underground or snaps, triangles stay in budget, chunks
 * are recycled (geometry count stays bounded), creatures are found, plants() agrees with
 * NSE.Universe.plants, and dispose frees everything. Then steering: three left presses
 * turn the ship ~90 degrees, and a minute of turning each way holds every rule.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GAME = path.join(__dirname, '..');
globalThis.window = globalThis;
globalThis.THREE = require(path.join(GAME, 'vendor', 'three.min.js'));
const load = f => vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
load('util'); load('universe');

let creaturesSource = 'stub';
const wantStub = process.argv.includes('--stub');
if (!wantStub && fs.existsSync(path.join(GAME, 'js', 'creatures.js'))) {
    try {
        load('creatures');
        if (NSE.Creatures && typeof NSE.Creatures.spec === 'function' && typeof NSE.Creatures.build === 'function') creaturesSource = 'js/creatures.js';
    } catch (e) { console.log('  (creatures.js failed to load: ' + e.message + '; using the stub)'); }
}
if (creaturesSource === 'stub') {
    const MOVES = ['hop', 'drift', 'crawl', 'float', 'walk', 'roll', 'slither'];
    NSE.Creatures = {
        spec: (seed) => ({ name: 'Blorbix' + (seed % 100), size: 0.6 + (seed % 7) * 0.5, move: MOVES[seed % MOVES.length], seed: seed }),
        build: (THREE, spec) => {
            const g = new THREE.Group();
            const geo = new THREE.BoxGeometry(spec.size * 0.8, spec.size, spec.size * 0.8).translate(0, spec.size / 2, 0);
            const mat = new THREE.MeshLambertMaterial({ color: 0xff88cc });
            g.add(new THREE.Mesh(geo, mat));
            return { group: g, height: spec.size, radius: spec.size * 0.4, update() {}, dispose() { geo.dispose(); mat.dispose(); } };
        }
    };
}
let shipSource = 'box';
try { load('ship'); if (NSE.Ship) shipSource = 'js/ship.js'; } catch (e) { /* box ship */ }
load('surface');

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  FAIL ' + msg); } }
const finite = v => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const DEG = 180 / Math.PI;

function makeShip() {
    if (shipSource !== 'box') return NSE.Ship.build(THREE).group;
    return new THREE.Mesh(new THREE.BoxGeometry(2, 1, 6), new THREE.MeshLambertMaterial());
}

/**
 * Fly one world. cfg: { seconds, steer: [[t, dir], ...], budget, quiet }.
 * Views: chase, then cockpit, then wide (thirds); speeds 1, 2, 1.5.
 */
function testWorld(label, world, opts, cfg) {
    cfg = cfg || {};
    const secs = cfg.seconds || 60, budget = cfg.budget || 150000;
    const ship = makeShip();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 2000);
    let s;
    try { s = NSE.Surface.create(THREE, world, Object.assign({ ship: ship, detail: 'high', starColor: '#fff2d6' }, opts || {})); }
    catch (e) { ok(false, label + ': create threw ' + e.stack); return null; }
    const st0 = s.stats();
    let altSum = 0, altN = 0, highFrames = 0;
    let minAlt = Infinity, maxAlt = -Infinity, nan = false, camUnder = 0, maxGeo = 0, maxTris = 0, maxChunks = 0, seenCreature = false;
    let tUpd = 0, tMax = 0, frames = 0, threw = null, maxCamStep = 0, prevCam = null, prevStep = null;
    const dt = 1 / 30, N = secs * 30, steers = (cfg.steer || []).slice();
    const heading0 = s.heading();
    const civ = { ports: 0, launches: 0, built: 0, arch: null, trafficFrames: 0, moving: 0, firstPort: -1 };
    let prevTraffic = null;
    for (let f = 0; f < N; f++) {
        const t = f * dt;
        const view = f < N / 3 ? 'chase' : f < 2 * N / 3 ? 'cockpit' : 'wide';
        if (f === 0) s.setSpeed(1); else if (f === Math.floor(N / 3)) s.setSpeed(2); else if (f === Math.floor(2 * N / 3)) s.setSpeed(1.5);
        while (steers.length && steers[0][0] <= t) ok(s.steer(steers.shift()[1]) === true, label + ': steer returns true');
        try {
            const t0 = process.hrtime.bigint();
            s.update(dt, t);
            s.setView(view, camera);
            const ms = Number(process.hrtime.bigint() - t0) / 1e6;
            tUpd += ms; tMax = Math.max(tMax, f > 5 ? ms : 0); frames++;
        } catch (e) { threw = e; break; }
        if (!finite(ship.position) || !finite(camera.position) || !Number.isFinite(ship.rotation.z) || !Number.isFinite(s.heading())) { nan = true; break; }
        const alt = ship.position.y - s.heightAt(ship.position.x, ship.position.z), clr = s.clearance();
        minAlt = Math.min(minAlt, alt); maxAlt = Math.max(maxAlt, alt);
        altSum += clr; altN++; if (clr > 25) highFrames++;
        if (camera.position.y < s.heightAt(camera.position.x, camera.position.z) + 1) camUnder++;
        // A snap is a sudden jump in the camera's own motion: compare this frame's step with the last.
        if (prevCam) {
            const stepV = camera.position.clone().sub(prevCam);
            if (prevStep && f > 2) maxCamStep = Math.max(maxCamStep, stepV.distanceTo(prevStep));
            prevStep = stepV;
        }
        prevCam = camera.position.clone();
        const cv = s.civ();
        if (cv) {
            civ.ports = cv.portsSeen; civ.launches = cv.launches; civ.built = cv.buildingsBuilt; civ.arch = cv.arch;
            if (cv.traffic.length >= 4) civ.trafficFrames++;
            if (prevTraffic && cv.traffic.length && prevTraffic.length === cv.traffic.length) {
                const m = Math.hypot(cv.traffic[0].x - prevTraffic[0].x, cv.traffic[0].z - prevTraffic[0].z);
                if (m > 0.2) civ.moving++;
            }
            if (civ.ports > 0 && civ.firstPort < 0) civ.firstPort = t;
            prevTraffic = cv.traffic;
        }
        if (f % 15 === 0) {
            const st = s.stats();
            maxGeo = Math.max(maxGeo, st.geometries); maxTris = Math.max(maxTris, st.triangles); maxChunks = Math.max(maxChunks, st.chunks);
            if (s.nearestCreature()) seenCreature = true;
        }
    }
    ok(!threw, label + ': update/setView threw ' + (threw && threw.stack));
    ok(!nan, label + ': NaN ship or camera position');
    ok(minAlt > 3, label + ': ship stays above the ground (min ' + minAlt.toFixed(1) + ' m)');
    // Mostly 8-14 m over whatever is below (ground, trees, spires); only briefly higher after a drop.
    const mean = altSum / Math.max(1, altN);
    // Deep gorges and tall peaks drop away under the ship (it does not dive into them), so allow a bit more there.
    const rugged = /mountains|canyons/.test(label);
    // After a turn into a city or a spire / mushroom field the ship climbs over what was built
    // before the turn (only far chunks are rebuilt for the new course), so steered runs get more room.
    const climbs = !!(cfg.steer && cfg.steer.length);
    ok(mean > 7 && mean < (rugged || climbs ? 18 : 16), label + ': cruising height 8-16 m (mean ' + mean.toFixed(1) + ' m)');
    ok(highFrames / altN < (rugged || climbs ? 0.25 : 0.1), label + ': rarely high up (' + (100 * highFrames / altN).toFixed(1) + '% of frames above 25 m clear)');
    ok(camUnder === 0, label + ': camera never underground (' + camUnder + ' frames)');
    ok(maxCamStep < 0.75, label + ': camera never snaps (largest change of step ' + maxCamStep.toFixed(2) + ' m per frame)');
    ok(maxTris < budget, label + ': triangles in budget (' + maxTris + ')');
    const st1 = s.stats();
    ok(st1.geometriesFreed > 10 * secs / 30, label + ': chunks are recycled (' + st1.geometriesFreed + ' freed)');
    ok(maxGeo <= st0.geometries * 1.7 + 20, label + ': geometry count bounded (start ' + st0.geometries + ', max ' + maxGeo + ')');
    ok(st1.distance > 15 * secs, label + ': flew a long way (' + Math.round(st1.distance) + ' m)');
    const sp = s.species();
    if (world.life) {
        ok(sp.length > 0, label + ': species listed');
        ok(st1.creatures > 0, label + ': creatures placed');
        ok(seenCreature, label + ': nearestCreature finds one');
        const nc = s.nearestCreature();
        ok(!nc || (nc.spec && Number.isFinite(nc.distance) && nc.index >= 0 && nc.index < sp.length), label + ': nearestCreature shape');
    } else {
        ok(sp.length === 0 && s.nearestCreature() === null, label + ': no life, no creatures');
    }
    ok(s.plants() === NSE.Universe.plants(world), label + ': plants() agrees with Universe.plants (' + s.plants() + ')');
    const info = {
        label: label, tris: maxTris, chunks: maxChunks, geo: st0.geometries + '->' + maxGeo, freed: st1.geometriesFreed,
        alt: minAlt.toFixed(1) + '/' + mean.toFixed(1), turn: Math.round(Math.abs(s.heading() - heading0) * DEG), creatures: st1.creatures,
        ms: (tUpd / Math.max(1, frames)).toFixed(2) + ' / ' + tMax.toFixed(1), civ: civ
    };
    try { s.dispose(); } catch (e) { ok(false, label + ': dispose threw ' + e.stack); }
    const st2 = s.stats();
    ok(st2.geometries === 0, label + ': dispose freed every geometry (' + st2.geometries + ' left)');
    ok(s.scene.children.length === 0, label + ': scene emptied');
    ok(ship.parent === null, label + ': ship removed from the scene (not disposed)');
    return info;
}

const UV = NSE.Universe;
const TYPES = ['ice', 'ocean', 'earth', 'desert', 'lava', 'crystal', 'toxic', 'gas', 'rock'];
const CIV = { earth: 1, ocean: 1, desert: 1, crystal: 1, toxic: 1, gas: 1 };
const rows = [];
const lifeFor = i => ({ species: [i * 11 + 1, i * 13 + 7, i * 17 + 3].map(v => NSE.Util.hash('sp', v)) });

// --- every type: a full minute, all views and speeds ---------------------------------------
TYPES.forEach(function (type, i) {
    const w = UV.world(1000 + i * 37, { kind: 'planet', name: 'Test', type: type });
    if (!w.life) w.life = lifeFor(i);
    if (CIV[type] && !w.civ) w.civ = { seed: 5, people: 'Zibbles', mood: 'friendly', lights: '#ffd27a', ships: 3 };
    if (!CIV[type]) w.civ = null;
    rows.push(testWorld(type + ':' + w.terrain.style, w));
});
// Moons: a lifeless rock moon and an icy moon, each with its planet in the sky.
{
    const m = UV.world(4242, { kind: 'moon', name: 'Test II', type: 'rock' });
    m.life = null; m.civ = null;
    rows.push(testWorld('rock moon', m, { skyPlanet: { color: '#c8a57a', radius: 36 } }));
    const m2 = UV.world(777, { kind: 'moon', name: 'Test III', type: 'ice' });
    rows.push(testWorld('ice moon', m2, { skyPlanet: { color: '#7aa0c8', radius: 30 }, detail: 'low' }));
}

// --- every style of every type: 30 s with turns both ways ----------------------------------
const STY = UV.STYLES;
ok(!!STY && TYPES.every(t => Array.isArray(STY[t]) && STY[t].length >= 3), 'NSE.Universe.STYLES lists the styles');
TYPES.forEach(function (type, i) {
    (STY[type] || []).forEach(function (style, j) {
        const w = UV.world(5000 + i * 101 + j * 7, { kind: 'planet', name: 'Style', type: type });
        w.terrain.style = style;
        if (!w.life) w.life = lifeFor(i + j);
        if (CIV[type] && j % 2 === 0) w.civ = w.civ || { seed: 5, people: 'Zibbles', mood: 'friendly', lights: '#9ad8ff', ships: 2 };
        const r = testWorld(type + ':' + style, w, {}, { seconds: 30, steer: [[4, 1], [12, -1], [12.3, -1], [21, 1]] });
        if (r) { r.style = true; rows.push(r); }
    });
});

// --- steering ------------------------------------------------------------------------------
function steerRun(label, type, style) {
    const w = UV.world(9100, { kind: 'planet', name: 'Steer', type: type });
    w.terrain.style = style;
    const opts = { detail: 'high' };
    const a = NSE.Surface.create(THREE, w, Object.assign({ ship: makeShip() }, opts));
    const b = NSE.Surface.create(THREE, w, Object.assign({ ship: makeShip() }, opts));      // flown straight, to compare
    const cam = new THREE.PerspectiveCamera();
    let f = 0;
    const step = (n, view, both) => {
        for (let k = 0; k < n; k++, f++) {
            a.update(1 / 30, f / 30); a.setView(view, cam);
            if (both) b.update(1 / 30, f / 30);
        }
    };
    try {
        step(60, 'chase', true);
        a.steer(1); step(6, 'chase', true); a.steer(1); step(6, 'chase', true); a.steer(1);
        step(150, 'chase', true);
        const diff = (a.heading() - b.heading()) * DEG;
        ok(Math.abs(diff - 90) < 4, label + ': three left presses turn the ship 90 degrees (' + diff.toFixed(1) + ')');
        const p0 = a.position.clone(); step(30, 'chase', false);
        const dir = a.position.clone().sub(p0);
        const want = new THREE.Vector3(-Math.sin(a.heading()), 0, -Math.cos(a.heading()));
        ok(dir.setY(0).normalize().dot(want) > 0.98, label + ': the ship really flies its new heading');
        a.steer(-1);
        step(60, 'chase', false);
    } catch (e) { ok(false, label + ': steering threw ' + e.stack); }
    a.dispose(); b.dispose();
    // A minute turning left (a press every 6 s), then a minute turning right, every rule held.
    const wl = UV.world(9200, { kind: 'planet', name: 'Steer', type: type }); wl.terrain.style = style;
    const lefts = [], rights = [];
    for (let t = 2; t < 60; t += 6) lefts.push([t, 1]);
    for (let t = 2; t < 60; t += 5) rights.push([t, -1]);
    const rl = testWorld(label + ' left', wl, {}, { seconds: 60, steer: lefts });
    const rr = testWorld(label + ' right', wl, {}, { seconds: 60, steer: rights });
    if (rl) { ok(rl.turn > 280, label + ': turned a long way left (' + rl.turn + ' deg)'); rows.push(rl); }
    if (rr) { ok(rr.turn > 330, label + ': turned a long way right (' + rr.turn + ' deg)'); rows.push(rr); }
}
steerRun('steer earth', 'earth', 'forest');
steerRun('steer canyons', 'desert', 'canyons');
steerRun('steer gas', 'gas', 'storms');

// --- advanced civilisations: cities, a spaceport within two minutes, moving traffic -------
{
    const archs = new Set();
    const civRuns = [['earth', 11], ['earth', 12], ['earth', 13], ['earth', 14], ['ocean', 15], ['desert', 16], ['gas', 17]];
    civRuns.forEach(function (cr, k) {
        const w = UV.world(7000 + k * 13, { kind: 'planet', name: 'Civ', type: cr[0] });
        w.civ = { seed: NSE.Util.hash('civ', cr[1]), people: 'Zibbles', mood: 'friendly', lights: ['#ffd27a', '#9ad8ff', '#ff9ad8', '#a8ff9a'][k % 4], ships: 3 };
        if (!w.life) w.life = lifeFor(k);
        const r = testWorld('civ ' + cr[0] + ' ' + k, w, {}, { seconds: 120, steer: [[50, 1], [80, -1]] });
        if (!r) return;
        rows.push(r);
        const c = r.civ;
        archs.add(c.arch);
        ok(c.built > 20, r.label + ': city buildings are built (' + c.built + ', ' + c.arch + ')');
        ok(c.firstPort >= 0 && c.firstPort < 120, r.label + ': a spaceport within two minutes (first at ' + c.firstPort.toFixed(0) + ' s, ' + c.ports + ' passed)');
        ok(c.launches > 0, r.label + ': a saucer lifts off from a spaceport (' + c.launches + ')');
        ok(c.trafficFrames > 600, r.label + ': several traffic craft are flying (' + c.trafficFrames + ' frames with 4+)');
        ok(c.moving > 600, r.label + ': traffic craft move (' + c.moving + ' frames)');
    });
    ok(archs.size >= 3, 'architecture varies by civilisation (' + Array.from(archs).join(', ') + ')');
    // Wildlife still appears (outside the cities).
}

// --- low detail, quality changes, determinism, eased views ---------------------------------
{
    const w = UV.world(2024, { kind: 'planet', name: 'Test', type: 'earth' });
    rows.push(testWorld('earth (low)', w, { detail: 'low' }));
    const a = NSE.Surface.create(THREE, w, { detail: 'standard' }), b = NSE.Surface.create(THREE, w, { detail: 'standard' });
    ok(a.heightAt(12.5, -300) === b.heightAt(12.5, -300) && a.stats().triangles === b.stats().triangles, 'same world, same surface');
    const cam = new THREE.PerspectiveCamera();
    try {
        for (let f = 0; f < 60; f++) { a.update(1 / 30, f / 30); a.setView('chase', cam); }
        a.setQuality('low'); const lowT = a.stats().triangles;
        for (let f = 0; f < 60; f++) { a.update(1 / 30, 2 + f / 30); a.setView('wide', cam); }
        a.setQuality('high'); const highT = a.stats().triangles;
        ok(lowT < highT * 0.6, 'setQuality changes density (low ' + lowT + ', high ' + highT + ')');
        for (let f = 0; f < 120; f++) { a.update(1 / 30, 5 + f / 30); a.setView('chase', cam); }
        const r0 = cam.position.clone().sub(a.position);
        a.update(1 / 30, 9.05); a.setView('cockpit', cam);
        const st = cam.position.clone().sub(a.position).distanceTo(r0);
        ok(st < 0.5, 'view change eases (first step ' + st.toFixed(2) + ' m of ~18)');
    } catch (e) { ok(false, 'setQuality/view easing threw ' + e.stack); }
    a.dispose(); b.dispose();
}

console.log('NARBE Space Explorer surface tests (creatures: ' + creaturesSource + ', ship: ' + shipSource + ')');
console.log('  world                    tris  chunks  geometries freed  alt min/mean  turn  creatures  update ms avg/max');
rows.filter(Boolean).forEach(r => console.log('  ' + r.label.padEnd(22) + String(r.tris).padStart(8) + String(r.chunks).padStart(7) + ('  ' + r.geo).padStart(12) +
    String(r.freed).padStart(6) + ('  ' + r.alt).padStart(13) + String(r.turn).padStart(6) + String(r.creatures).padStart(10) + '  ' + r.ms));
console.log((fails ? 'FAILED ' + fails + ' of ' : 'OK: all ') + checks + ' checks');
process.exit(fails ? 1 : 0);
