'use strict';
/* NARBE Build n Ride - buildings: fixed lots, free Build clears them, Quick Build never (plain Node, no browser).
 *
 *   node tests/buildings.test.cjs [sessions]
 *
 * The world's buildings (houses, chalets, adobes, city blocks) stand on fixed lots: the same
 * every time and at every graphics level (a lower level keeps some of the same ones). Free
 * Build lets track go anywhere: buildings in its way make way, each with one puff of dust
 * (Build.clearedBy), and only those. The terrain draws exactly the world's buildings. Quick
 * Build's ground is ready for the whole route from the start: the same buildings as the Ride,
 * and none make way while the track goes down.
 */
const path = require('path');
const H = require(path.join(__dirname, '..', 'tools', 'harness.cjs'));
const { BNR, THREE } = H.boot();
BNR.Geo.init(THREE);
const { Build, Track, World, Util } = BNR;

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } }
function section(name) { console.log(name); }

/** The building instances the terrain is drawing: [{ kind, x, z }]. */
function drawnBuildings() {
    const out = [];
    const m = new THREE.Matrix4();
    BNR.Scene.terrain().root.traverse(function (o) {
        if (!o.isInstancedMesh || !o.name) return;
        const parts = o.name.split(':');
        const d = BNR.Props.def(parts[0]);
        if (!d || !d.house || parts[1] !== 'fixed') return;
        for (let n = 0; n < o.count; n++) { o.getMatrixAt(n, m); out.push({ kind: parts[0], x: m.elements[12], z: m.elements[14] }); }
    });
    return out;
}
const keyOf = b => b.kind + '@' + b.x.toFixed(2) + ',' + b.z.toFixed(2);

// --- the world's buildings ---------------------------------------------------------------------
section('the world\'s buildings');
// Worlds with a town, a city, a snowy village and an oasis close to the start, so random
// building reaches them.
const WORLDS = {};
for (let s = 1; s < 900 && Object.keys(WORLDS).length < 4; s++) {
    const w = World.create({ seed: s, procedural: true });
    const list = w.buildingsIn(-260, -260, 260, 260);
    const by = {};
    list.forEach(b => { const k = b.kind.replace(/\d+$/, ''); by[k] = (by[k] || 0) + 1; });
    Object.keys(by).forEach(k => { if (!WORLDS[k] && by[k] >= 10) WORLDS[k] = { seed: s, world: w, kind: k }; });
}
console.log('  worlds: ' + Object.keys(WORLDS).map(k => k + ' ' + WORLDS[k].seed).join(', '));
ok(WORLDS.house && WORLDS.building, 'worlds with a town and a city near the start');
const T = WORLDS.building || WORLDS.house || Object.values(WORLDS)[0];
{
    const all = T.world.buildingsIn(-700, -700, 700, 700);
    const again = World.create({ seed: T.seed, procedural: true }).buildingsIn(-700, -700, 700, 700);
    ok(again.length === all.length && again.every((b, i) => keyOf(b) === keyOf(all[i])), 'the same buildings every time (' + all.length + ')');
    const keys = new Set(all.map(b => b.key));
    const low = T.world.buildingsIn(-700, -700, 700, 700, World.DETAIL.low);
    ok(low.length < all.length && low.every(b => keys.has(b.key)), 'a lower graphics level keeps some of the same ones (' + low.length + ' of ' + all.length + ')');
    let overlap = 0;
    all.forEach((a, i) => all.forEach((b, j) => { if (j > i && Math.hypot(a.x - b.x, a.z - b.z) < (a.radius + b.radius) * 0.5) overlap++; }));
    ok(overlap === 0, 'buildings stand apart (' + overlap + ' overlapping)');
    const kinds = {};
    all.forEach(b => { const k = b.kind.replace(/\d+$/, ''); kinds[k] = (kinds[k] || 0) + 1; });
    console.log('  world ' + T.seed + ': ' + JSON.stringify(kinds) + ' within 700 of the start');
}

// --- free Build: buildings make way, each with one puff of dust -------------------------------------
section('build');
const COUNT = +(process.argv[2] || 60);
let loops = 0, stations = 0, cleared = 0;
const worldList = Object.values(WORLDS);
const kb = b => b.key;
/** Is this building within the room scenery leaves track (or on a station's ground)? */
function madeWay(s, b) {
    const c = s.track.centerline();
    for (let i = c.startIndex[3]; i < c.n; i++) {
        if (c.struct[i] === 'tunnel' && c.ground[i] - c.y[i] >= 12) continue;
        if (Math.hypot(c.x[i] - b.x, c.z[i] - b.z) < 3.4 + b.radius) return true;
    }
    return s.sites.some(function (site) {
        if (site.start) return false;
        const p = s.track.pieces[site.piece], m = Track.piecePoint(p, 0.5);
        const d = Track.DIRS[p.h], rx = -d[1] * site.side, rz = d[0] * site.side;
        const dx = b.x - m.x, dz = b.z - m.z, a = dx * d[0] + dz * d[1], w = dx * rx + dz * rz;
        return Math.hypot(Math.max(Math.abs(a) - 23.5, 0), Math.max(1.55 - w, w - 10.6, 0)) < 2;
    });
}
for (let i = 0; i < COUNT; i++) {
    const rnd = Util.mulberry(300 + i);
    const s = Build.create({ seed: worldList[i % worldList.length].seed });
    // The buildings cleared away now (one Connect takes back comes back, and may be cleared again).
    const puffs = new Map();
    let twice = 0, total = 0;
    const note = function (res) { Build.clearedBy(s, res).forEach(b => { if (puffs.has(kb(b))) twice++; puffs.set(kb(b), b); total++; }); };
    const back = function () { for (const [k, b] of puffs) if (!madeWay(s, b)) puffs.delete(k); };
    const n = 30 + Math.floor(rnd() * 130);
    for (let k = 0; k < n && !s.closed(); k++) {
        const r = rnd();
        const kind = r < 0.3 ? 'LS' : r < 0.55 ? 'S' : r < 0.78 ? 'L' : 'R';
        const res = s.add(kind);
        ok(!res || res.blocked !== 'building', 'loop ' + i + ': free Build never refuses a press for a building');
        if (res && !res.blocked) note(res);
    }
    for (const st of s.connectSteps()) { if (st.op === 'undo') back(); else note(st); }
    ok(s.closed(), 'loop ' + i + ': Connect closes it');
    loops++;
    stations += s.sites.length;
    cleared += total;
    ok(twice === 0, 'loop ' + i + ': no building still cleared gets another puff (' + twice + ')');
    // Every building that made way got its puff, and only those.
    const near = s.world.buildingsIn(-2500, -2500, 2500, 2500).filter(b => madeWay(s, b));
    const missing = near.filter(b => !puffs.has(kb(b)));
    const wrong = [...puffs.values()].filter(b => !madeWay(s, b));
    ok(missing.length === 0, 'loop ' + i + ': every building that made way had a puff of dust (' + missing.length + ' missed)');
    ok(wrong.length === 0, 'loop ' + i + ': a puff only where a building made way (' + wrong.length + ' wrong)');
}
console.log('  ' + loops + ' loops, ' + stations + ' stations, ' + cleared + ' buildings made way (one puff each)');
ok(cleared > 0, 'free Build goes through towns: buildings make way');

// --- the terrain draws exactly the world's buildings ---------------------------------------------
section('terrain');
{
    if (!BNR.Scene.scene()) BNR.Scene.init(THREE);
    const s = Build.create({ seed: T.seed });
    BNR.Scene.loadBuild(s, { quality: 'high', budget: -1 });
    const ws = T.world.buildingsIn(-260, -260, 260, 260).filter(b => Math.hypot(b.x, b.z) > 60);
    const b0 = ws[0];
    BNR.Scene.terrain().buildAll(b0.x, b0.z, 240);
    const drawn = new Set(drawnBuildings().map(keyOf));
    const near = T.world.buildingsIn(b0.x - 110, b0.z - 110, b0.x + 110, b0.z + 110);
    ok(near.length > 0 && near.every(b => drawn.has(keyOf(b))), 'every building of the world there is drawn (' + near.filter(b => drawn.has(keyOf(b))).length + ' of ' + near.length + ')');
    const world = new Set(T.world.buildingsIn(b0.x - 400, b0.z - 400, b0.x + 400, b0.z + 400).map(keyOf));
    const extra = drawnBuildings().filter(b => !world.has(keyOf(b)) && Math.hypot(b.x - b0.x, b.z - b0.z) < 200);
    ok(extra.length === 0, 'and no others (' + extra.length + ')');
}

// --- Quick Build: the ground is ready for the whole route ------------------------------------------
section('quick build');
['nightcity', 'countryside'].forEach(function (id) {
    const S = H.load(id, { quiet: true });
    const p = S.train().position();
    const inRide = new Set(drawnBuildings().filter(b => Math.hypot(b.x - p.x, b.z - p.z) < 300).map(keyOf));
    const q = Build.quick(id);
    BNR.Scene.loadBuild(q, { quality: 'high', budget: -1 });
    BNR.Scene.terrain().buildAll(p.x, p.z, 400);
    const first = new Set(drawnBuildings().filter(b => Math.hypot(b.x - p.x, b.z - p.z) < 300).map(keyOf));
    const same = inRide.size === first.size && [...inRide].every(k => first.has(k));
    ok(same, id + ': Quick Build shows the Ride\'s buildings from the start (' + first.size + ' vs ' + inRide.size + ')');
    let presses = 0;
    while (!q.closed() && presses < 400) { q.next(); BNR.Scene.buildChanged(); presses++; }
    BNR.Scene.terrain().buildAll(p.x, p.z, 400);
    const last = new Set(drawnBuildings().filter(b => Math.hypot(b.x - p.x, b.z - p.z) < 300).map(keyOf));
    ok(q.closed() && last.size === first.size && [...first].every(k => last.has(k)), id + ': no building vanishes while it is laid (' + last.size + ' of ' + first.size + ')');
    console.log('  ' + id + ': ' + first.size + ' buildings near the start, all still there when the loop is done');
});

console.log('\n' + (checks - failures) + ' of ' + checks + ' checks passed');
process.exit(failures ? 1 : 0);
