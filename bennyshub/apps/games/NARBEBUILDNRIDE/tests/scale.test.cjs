'use strict';
/* NARBE Build n Ride - a big loop costs no more to ride than a small one (plain Node, no browser).
 *
 *   node tests/scale.test.cjs
 *
 * In the game only the track and land near the camera are built. This builds a loop with all
 * the pieces Build allows (MAX_PIECES presses), rides it all the way round, the camera set as
 * the game sets it, and
 * checks that what is held (land chunks, track chunks, station meshes drawn, buffer memory) stays
 * about what a short ride holds; that track built a few chunks at a time near the camera is
 * exactly the track a full build makes there; and that Build stays quick at that size.
 */
const path = require('path');
const H = require(path.join(__dirname, '..', 'tools', 'harness.cjs'));
const { BNR, THREE } = H.boot();
BNR.Geo.init(THREE);
if (!BNR.Scene.scene()) BNR.Scene.init(THREE);

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } }
function now() { return Number(process.hrtime.bigint()) / 1e6; }
function memory(root) {
    let b = 0;
    root.traverse(function (o) {
        if (!o.isMesh || !o.geometry) return;
        Object.values(o.geometry.attributes).forEach(a => { b += a.array.byteLength; });
        if (o.isInstancedMesh) b += o.instanceMatrix.array.byteLength;
    });
    return b / 1048576;
}
const sum = m => { const a = m.geometry.attributes.position.array; let t = 0; for (let i = 0; i < a.length; i += 5) t += a[i] * ((i % 11) + 1); return a.length + ':' + t.toFixed(2); };

// --- track built near the camera is the track a full build makes ----------------------------------
{
    const r = BNR.Routes.build('seasidecliffs');
    const sc = new THREE.Scene();
    const full = BNR.TrackView.create(THREE, { world: r.world, track: r.track, scene: sc });
    const lazy = BNR.TrackView.create(THREE, { world: r.world, track: r.track, scene: sc, lazy: true });
    ok(lazy.builtCount() === 0, 'a lazy track view builds nothing until it knows where the camera is');
    const c = r.track.centerline();
    let same = 0, differ = 0, seen = 0;
    [0, 0.25, 0.5, 0.75].forEach(function (u) {
        const i = Math.floor(c.n * u);
        lazy.update(c.x[i], c.z[i], 300, true);
        lazy.meshes().forEach(function (m, k) { seen++; const f = full.meshes().get(k); if (f && sum(f) === sum(m)) same++; else differ++; });
        ok(lazy.builtCount() <= full.builtCount(), 'only some of the track is built near the camera (' + lazy.builtCount() + ' of ' + full.builtCount() + ')');
    });
    ok(seen > 0 && differ === 0, 'every chunk built near the camera matches a full build (' + same + ' same, ' + differ + ' differ)');
    full.dispose(); lazy.dispose();
}

// --- the biggest loop Build allows ----------------------------------------------------------------
const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 1400);
BNR.Scene.setViewer(cam);
const s = BNR.Build.create({ seed: 4004 });
BNR.Scene.loadBuild(s, { quality: 'high', budget: -1 });
const rnd = BNR.Util.mulberry(4004);
let presses = 0, pressMs = 0, worstPress = 0;
for (let k = 0; k < 6000 && !s.closed(); k++) {
    const b = s.blocked();
    const okKinds = Object.keys(b).filter(x => !b[x]);
    if (!okKinds.length) break;
    const kind = rnd() < 0.45 && okKinds.indexOf('LS') >= 0 ? 'LS' : okKinds[Math.floor(rnd() * okKinds.length)];
    const t0 = now();
    s.add(kind);
    BNR.Scene.buildChanged();
    BNR.Scene.update(1 / 30);
    const dt = now() - t0;
    presses++; pressMs += dt; worstPress = Math.max(worstPress, dt);
    ok(BNR.Scene.view().builtCount() <= 140, 'Build keeps only the track near the camera built (' + BNR.Scene.view().builtCount() + ')');
}
const t1 = now();
for (const st of s.connectSteps()) BNR.Scene.buildChanged({ removed: st.removed });
const connectMs = now() - t1;
ok(s.closed(), 'Connect closes the biggest loop');
const n = s.track.pieces.length;
ok(s.pieceCount() === BNR.Build.MAX_PIECES, 'every piece Build allows went down (' + s.pieceCount() + ' of ' + BNR.Build.MAX_PIECES + ')');
console.log('  built ' + n + ' sections in ' + presses + ' presses: ' + (pressMs / presses).toFixed(1) + ' ms a press (worst ' + worstPress.toFixed(0) + '), Connect ' + connectMs.toFixed(0) + ' ms');
ok(pressMs / presses < 120, 'a press stays quick at this size');

/** Ride it once round at Fast: the most it ever holds. */
function rideRound(spec) {
    BNR.Scene.load(spec, { quality: 'high', season: 'summer', budget: 30, speed: 2 });
    const S = BNR.Scene, L = S.track().centerline().length;
    S.ride().setSpeed(2);
    const s0 = S.state.s;
    let land = 0, trackChunks = 0, mb = 0, drawn = 0;
    for (let k = 0; k < 60 * 60 * 20 && S.state.s - s0 < L; k++) {
        S.update(1 / 20);
        if (k % 40 === 0) {
            const p = S.train().position();
            cam.position.set(p.x, p.y + 8, p.z); cam.updateMatrixWorld(true);
            land = Math.max(land, S.terrain().count());
            trackChunks = Math.max(trackChunks, S.view().builtCount());
            mb = Math.max(mb, memory(S.scene()));
            drawn = Math.max(drawn, S.stations().list.filter(st => st.group.visible).length);
        }
    }
    return { land: land, track: trackChunks, mb: mb, drawn: drawn, stations: S.stations().list.length, minutes: (L / BNR.Ride.SPEEDS[1].v + S.stations().list.length * 7) / 60 };
}
const big = rideRound({ world: s.world, track: s.track, sites: s.sites.slice(), routeDef: { name: 'big', events: BNR.Build.eventsFor(s.track, s.world, s.sites) } });
const small = rideRound({ route: 'countryside' });
console.log('  riding the biggest loop (' + big.minutes.toFixed(1) + ' min a lap, ' + big.stations + ' stations): at most ' + big.land + ' land chunks, ' + big.track + ' track chunks, ' +
    big.drawn + ' stations drawn, ' + big.mb.toFixed(0) + ' MB; Countryside: ' + small.land + ', ' + small.track + ', ' + small.drawn + ', ' + small.mb.toFixed(0) + ' MB');
ok(big.land <= small.land * 1.3 + 10, 'riding the biggest loop holds about as much land as a short ride (' + big.land + ' vs ' + small.land + ')');
ok(big.track <= 140, 'and only the track near the train (' + big.track + ' chunks)');
ok(big.drawn < big.stations || big.stations <= 3, 'far stations are not drawn (' + big.drawn + ' of ' + big.stations + ')');
ok(big.mb <= small.mb * 1.6 + 20, 'and about the same memory (' + big.mb.toFixed(0) + ' MB vs ' + small.mb.toFixed(0) + ' MB)');

console.log('\n' + (checks - failures) + ' of ' + checks + ' checks passed');
process.exit(failures ? 1 : 0);
