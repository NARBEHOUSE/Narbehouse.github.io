/**
 * NARBE Space Explorer - universe + flight tests (Node only, no browser).
 *
 *   node tests/flight.test.cjs
 *
 * Checks: the universe is deterministic (same seed, same everything), names are
 * clean and sayable, systems never crowd each other, and the ship can go from
 * a start point to a "Do you want to go here?" prompt, into orbit, to a moon,
 * back out, and on to the next place with Next Stop, never flying through a
 * planet or star, in several galaxies.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GAME = path.join(__dirname, '..');
globalThis.window = globalThis;
for (const f of ['util', 'universe', 'flight']) vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js', f + '.js'), 'utf8'), { filename: f + '.js' });

let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  FAIL ' + msg); } }

const UV = NSE.Universe;

// --- determinism ---------------------------------------------------------------------------
{
    const a = JSON.stringify(UV.systemsNear(7, { x: 5000, y: 0, z: -3000 }, 1).map(s => [s.id, s.name, s.kind, s.planets.map(p => [p.name, p.type, p.radius, p.moons.length, !!p.life, !!p.civ])]));
    // A fresh universe (cleared caches) must agree.
    vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js', 'universe.js'), 'utf8'));
    const b = JSON.stringify(NSE.Universe.systemsNear(7, { x: 5000, y: 0, z: -3000 }, 1).map(s => [s.id, s.name, s.kind, s.planets.map(p => [p.name, p.type, p.radius, p.moons.length, !!p.life, !!p.civ])]));
    ok(a === b, 'same seed gives the same systems');
    ok(NSE.Universe.galaxy(1).name === UV.galaxy(1).name, 'galaxy names stable');
}
const U2 = NSE.Universe;

// --- names, spacing, ids -------------------------------------------------------------------
{
    let rude = 0, longest = 0;
    for (let i = 0; i < 100000; i++) { const n = U2.placeName(i); if (U2.rude(n)) rude++; longest = Math.max(longest, n.length); }
    ok(rude === 0, 'no rude names');
    ok(longest <= 11, 'names are short enough to say (' + longest + ')');
    const near = U2.systemsNear(3, { x: 0, y: 0, z: 0 }, 3);
    let minGap = Infinity;
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
        const a = near[i], b = near[j];
        minGap = Math.min(minGap, U2.dist(a.pos, b.pos) - a.radius - b.radius);
    }
    ok(minGap > 150, 'systems never overlap (closest edge gap ' + Math.round(minGap) + ')');
    let worlds = 0, moons = 0, types = new Set();
    near.forEach(s => s.planets.forEach(p => { worlds++; types.add(p.type); moons += p.moons.length;
        ok(U2.findById(p.id).planet === p, 'findById planet ' + p.id);
        p.moons.forEach(m => ok(U2.findById(m.id).moon === m, 'findById moon ' + m.id));
        // Planets keep clear of each other.
        s.planets.forEach(q => { if (q !== p) ok(U2.dist(p.pos, q.pos) > p.radius + q.radius + 40, 'planets apart'); });
    }));
    ok(types.size >= 7, 'many planet types appear (' + [...types].join(',') + ')');
    console.log('universe: ' + near.length + ' systems, ' + worlds + ' planets, ' + moons + ' moons near the origin');
}

// --- Explore System's shot over a system: spread-out orbits and bigger worlds never touch ----------
{
    const r = NSE.Util.rng(4242);
    let systems = 0, grown = 0, worst = Infinity;
    const ext = p => (p.rings ? p.rings.outer : p.radius * 1.08);
    const lerp3 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
    for (const g of [1, 2, 7, 99, 12345, 31337]) {
        for (let k = 0; k < 6; k++) {
            const list = U2.systemsNear(g, { x: r.range(-40, 40) * U2.SECTOR, y: r.range(-2, 2) * U2.SECTOR, z: r.range(-40, 40) * U2.SECTOR }, 1);
            for (const sys of list) {
                if (!sys.planets.length) continue;
                systems++;
                const c = sys.pos, P = sys.planets;
                const spread = U2.surveySpread(sys);
                // Diagram rings: same order, the last one stays put.
                let order = true;
                P.forEach((p, i) => { if (i && P[i - 1].orbit * spread[P[i - 1].id] >= p.orbit * spread[p.id]) order = false; });
                ok(order && Math.abs(spread[P[P.length - 1].id] - 1) < 1e-9, sys.name + ': spread rings keep their order');
                // A ship somewhere in or near the system (never inside a world).
                let ship = null;
                for (let t = 0; t < 20 && !ship; t++) {
                    const a = r.range(0, Math.PI * 2), d = r.range(0.1, 1.2) * sys.radius;
                    const s = { x: c.x + Math.cos(a) * d, y: c.y + r.range(-60, 60), z: c.z + Math.sin(a) * d };
                    if (P.every(p => U2.dist(s, p.pos) > ext(p) * 1.5 + 8)) ship = s;
                }
                for (const want of [40, 90, 200]) {
                    const lay = U2.surveyLayout(sys, want, ship);
                    const starCore = sys.kind === 'blackhole' ? sys.disk.outer : (sys.stars.length > 1 ? sys.pairGap * 2 : 0) + Math.max(...sys.stars.map(s => s.radius)) * (lay.scale.star || 1);
                    // Along the whole slide out (and back), at a few points of the way.
                    for (const kk of [0.25, 0.5, 0.75, 1]) {
                        const at = p => lerp3(p.pos, { x: c.x + (p.pos.x - c.x) * spread[p.id], y: c.y + (p.pos.y - c.y) * spread[p.id], z: c.z + (p.pos.z - c.z) * spread[p.id] }, kk);
                        const size = p => ext(p) * (1 + (lay.scale[p.id] - 1) * kk);
                        P.forEach(function (p, i) {
                            const s = lay.scale[p.id];
                            ok(s >= 1 && s <= 8 + 1e-9, sys.name + ': ' + p.name + ' drawn x' + s);
                            if (kk === 1 && s > 1.5) grown++;
                            const gapStar = U2.dist(at(p), c) - size(p) - starCore;
                            worst = Math.min(worst, gapStar);
                            ok(gapStar > 0, sys.name + ': ' + p.name + ' touches its star in the shot (k ' + kk + ')');
                            if (ship) ok(U2.dist(at(p), ship) > size(p), sys.name + ': ' + p.name + ' is drawn over the ship (k ' + kk + ')');
                            P.slice(i + 1).forEach(q => ok(U2.dist(at(p), at(q)) > size(p) + size(q), sys.name + ': ' + p.name + ' and ' + q.name + ' touch in the shot (k ' + kk + ')'));
                        });
                    }
                }
            }
        }
    }
    ok(systems > 100, 'explore shot checked over ' + systems + ' systems');
    ok(grown > systems, 'worlds are drawn bigger in the shot (' + grown + ' grown)');
    console.log('explore shot: ' + systems + ' systems, ' + grown + ' worlds drawn bigger, closest to a star ' + worst.toFixed(0));
}

// --- a flight -------------------------------------------------------------------------------
function journey(galaxy) {
    const F = NSE.Flight.create();
    const st = U2.startNear(galaxy);
    F.place(galaxy, st.pos, st.yaw, 0);
    const log = [];
    let prompted = null, arrived = null, left = null;
    F.on('discover', o => { prompted = o; log.push('discover ' + o.kind + ' ' + o.name); });
    F.on('arrive', o => { arrived = o; log.push('arrive ' + o.name); });
    F.on('left', o => { left = o; log.push('left ' + o.name); });
    let minClear = Infinity;
    const dt = 1 / 30;
    function run(sec, until) {
        for (let t = 0; t < sec; t += dt) {
            F.step(dt);
            const s = F.state;
            ok(isFinite(s.pos.x) && isFinite(s.pos.y) && isFinite(s.pos.z), 'position finite');
            if (s.near[0]) U2.objectsOf(s.near[0]).forEach(o => { minClear = Math.min(minClear, (U2.dist(o.pos, s.pos) - o.radius) / o.radius); });
            if (until && until()) return true;
        }
        return false;
    }
    // 1. Fly at the system: a prompt comes up.
    ok(run(120, () => prompted), 'g' + galaxy + ': a prompt within two minutes of starting');
    const first = prompted;
    // Say No: no prompt for that object again while near it.
    F.answer(false);
    prompted = null;
    run(3, () => prompted && prompted.id === first.id);
    ok(!(prompted && prompted.id === first.id), 'No is respected');
    // 2. Next Stop finds somewhere, and we get asked about it.
    prompted = null;
    const target = F.nextStop();
    ok(!!target, 'Next Stop finds a target');
    ok(run(180, () => prompted), 'Next Stop leads to a prompt');
    // 3. Yes: into orbit.
    const o = prompted;
    F.answer(true);
    ok(F.state.mode === 'travel', 'travelling into orbit');
    ok(run(12, () => arrived), 'arrives in orbit');
    ok(F.state.mode === 'orbit', 'orbiting');
    // Orbit stays at the right height.
    const R = F.orbitRadius(o);
    run(10);
    ok(Math.abs(U2.dist(F.state.pos, F.centreOf(o)) - R) < 2, 'orbit radius held');
    // 4. A moon, if it has one, then back out.
    if (o.kind === 'planet' && o.world.moons.length) {
        arrived = null;
        const m = F.moonObject(o.world, o.world.moons[0]);
        F.visit(m);
        ok(run(10, () => arrived), 'reaches the moon');
        run(5);
        ok(Math.abs(U2.dist(F.state.pos, F.centreOf(m)) - F.orbitRadius(m)) < 2, 'moon orbit follows the moving moon');
    }
    F.leaveOrbit();
    ok(run(8, () => left), 'leaves orbit');
    ok(F.state.mode === 'fly', 'flying again');
    // 5. Steering: one press, one smooth step.
    const y0 = F.state.yaw;
    F.turn(1);
    run(4);
    ok(Math.abs(F.state.yaw - y0 - Math.PI / 6) < 0.02, 'Turn Left turns 30 degrees');
    F.climb(1); F.climb(1); F.climb(1); F.climb(1);
    run(4);
    ok(F.pitchLimit(), 'climb stops at the limit');
    F.climb(-1); F.climb(-1); F.climb(-1); F.climb(-1);
    run(4);
    // 6. Keep exploring for a while with Next Stop + Yes, Leave: never inside anything.
    let visits = 0;
    for (let k = 0; k < 4; k++) {
        arrived = null; left = null;
        // A prompt may already be waiting (it came up while steering): answer that one.
        prompted = F.state.prompting;
        if (!prompted) {
            if (!F.nextStop()) break;
            if (!run(200, () => prompted)) break;
        }
        F.answer(true);
        if (!run(12, () => arrived)) break;
        visits++;
        run(3);
        F.leaveOrbit();
        run(8, () => left);
    }
    ok(visits >= 3, 'g' + galaxy + ': explored ' + visits + ' more places');
    ok(minClear > 0.6, 'never inside a star or planet (closest ' + minClear.toFixed(2) + ' radii above the surface)');
    console.log('galaxy ' + galaxy + ' (' + U2.galaxy(galaxy).name + '): ' + log.slice(0, 8).join(' | ') + (log.length > 8 ? ' ...' : ''));
}

[1, 2, 99, 12345].forEach(journey);

console.log((fails ? 'FAILED ' : 'ok ') + (checks - fails) + '/' + checks + ' checks');
process.exit(fails ? 1 : 0);
