'use strict';
/* NARBE Build n Ride - Build, Quick Build and My Tracks, in plain Node (no browser).
 *
 *   node tests/build.test.cjs [sessions]
 *
 * Build sessions laid by random presses (with Undo): Connect always closes the loop; stations
 * appear on level ground-level straights, one per zone, and anything crossing a station later
 * goes high over it; a finished loop saves to a small record that comes back exactly; the
 * events picked for it never start before a station stop they would play behind. Quick Build
 * lays exactly the Ride's track and stations. The track's partial redraw matches a full one.
 * My Tracks keeps, names and deletes loops. The endless world shows every landscape, with
 * snow and desert (almost) never side by side.
 */
const path = require('path');
const H = require(path.join(__dirname, '..', 'tools', 'harness.cjs'));
const { BNR, THREE } = H.boot();
BNR.Geo.init(THREE);
const { Build, Track, Tracks, Routes, World, Util } = BNR;

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } }

const LEVEL = Track.LEVEL, STEP = Track.STEP;

/** Every station's cells: nothing else there lower than a level and a half. */
function stationsClear(s, tag) {
    const t = s.track;
    s.sites.forEach(function (site) {
        site.pieces.forEach(function (pi) {
            const p = t.pieces[pi];
            ok(p.type === 'S' && t.liftIn(pi) === 0 && t.liftOut(pi) === 0, tag + ': station ' + site.name + ' stands on level ground-level straights');
            t.cellPieces(p.cx, p.cz).forEach(function (j) {
                if (site.pieces.indexOf(j) >= 0) return;
                const lo = Math.min(t.liftIn(j), t.liftOut(j));
                ok(lo >= LEVEL + STEP - 1e-6, tag + ': track crossing station ' + site.name + ' goes high over it (' + lo + ')');
            });
        });
    });
}

/** A station stop never falls between an event's start and its anchor. */
function eventsClear(track, sites, events, tag) {
    const c = track.centerline(), L = c.length;
    const stops = sites.map(s => c.s[c.startIndex[s.piece]] + track.pieces[s.piece].len * (s.at || 0.5));
    events.forEach(function (e) {
        const K = BNR.Events.info(e.type);
        ok(!!K, tag + ': event ' + e.type + ' exists');
        const lead = e.lead !== undefined ? e.lead : (K && K.lead !== undefined ? K.lead : 90);
        const anchor = c.s[c.startIndex[e.piece]] + track.pieces[e.piece].len / 2;
        stops.forEach(function (st) {
            const d = ((anchor - st) % L + L) % L;
            ok(!(d <= lead + 1e-6), tag + ': ' + e.type + ' at piece ' + e.piece + ' does not start behind a station stop (' + d.toFixed(0) + ' < ' + lead + ')');
        });
    });
}

// --- Build sessions ----------------------------------------------------------------------------
const COUNT = +(process.argv[2] || 40);
let totalStations = 0, kinds = {}, connectMs = 0, records = 0;
for (let i = 0; i < COUNT; i++) {
    const rnd = Util.mulberry(700 + i);
    const s = Build.create({ seed: 1000 + i * 17 });
    ok(s.sites.length === 1 && s.sites[0].start, 'session ' + i + ': the start station is there');
    ok(!s.canUndo(), 'session ' + i + ': nothing to undo at first');
    ok(s.undo() === null, 'session ' + i + ': undo never takes the start station');
    const n = 10 + Math.floor(rnd() * 90);
    for (let k = 0; k < n && !s.closed(); k++) {
        const r = rnd();
        if (r < 0.08 && s.canUndo()) {
            const before = s.track.pieces.length, last = s.lastGroup().length;
            const u = s.undo();
            ok(u && s.track.pieces.length === before - last, 'session ' + i + ': undo takes back the last press (' + last + ' pieces)');
            continue;
        }
        const kind = r < 0.3 ? 'LS' : r < 0.55 ? 'S' : r < 0.78 ? 'L' : 'R';
        const pv = s.preview(kind);
        const chk = s.check(kind);
        const res = s.add(kind);
        if (!res) break;
        if (res.blocked) {
            ok(!chk.ok && res.placed.length === 0, 'session ' + i + ': a refused press (' + res.blocked + ') lays nothing');
            continue;
        }
        ok(res.placed.length === pv.pieces.length && res.placed.every((p, j) => p.cx === pv.pieces[j].cx && p.cz === pv.pieces[j].cz && s.track.liftOut(p.i) === pv.pieces[j].liftOut),
            'session ' + i + ': the preview shows exactly what the press lays');
        res.kinds.forEach(x => { kinds[x] = (kinds[x] || 0) + 1; });
    }
    if (!s.closed()) {
        const t0 = Date.now();
        let steps = 0;
        for (const st of s.connectSteps()) { steps++; if (steps > 5000) break; }
        connectMs += Date.now() - t0;
    }
    ok(s.closed(), 'session ' + i + ': Connect closed the loop');
    ok(s.add('S') === null, 'session ' + i + ': a closed loop takes no more pieces');
    const zones = new Set(s.sites.map(x => x.zone));
    ok(zones.size === s.sites.length, 'session ' + i + ': one station per zone');
    const names = new Set(s.sites.map(x => x.name));
    ok(names.size === s.sites.length, 'session ' + i + ': every station has its own name');
    stationsClear(s, 'session ' + i);
    totalStations += s.sites.length;
    // Save and restore: exactly the same loop.
    const rec = JSON.parse(JSON.stringify(s.record()));
    records++;
    ok(JSON.stringify(rec).length < 6000, 'session ' + i + ': the record is small (' + JSON.stringify(rec).length + ' bytes)');
    const back = Build.restore(rec);
    ok(back.closed(), 'session ' + i + ': the saved loop comes back closed');
    ok(back.track.types() === s.track.types(), 'session ' + i + ': same pieces');
    ok(JSON.stringify(back.track.lifts()) === JSON.stringify(s.track.lifts()), 'session ' + i + ': same heights');
    ok(back.sites.length === s.sites.length && back.sites.every((x, j) => x.piece === s.sites[j].piece && x.side === s.sites[j].side && x.name === s.sites[j].name), 'session ' + i + ': same stations');
    // Things to see on it.
    const ev = Build.eventsFor(back.track, back.world, back.sites);
    ok(ev.length >= 2 || back.track.centerline().length < 520, 'session ' + i + ': things to see on the ride (' + ev.length + ')');
    eventsClear(back.track, back.sites, ev, 'session ' + i);
}
console.log('  ' + COUNT + ' build sessions: ' + totalStations + ' stations (' + (totalStations / COUNT).toFixed(1) + ' a loop), Connect ' + (connectMs / COUNT).toFixed(1) +
    ' ms a loop, words: ' + JSON.stringify(kinds));
ok(totalStations > COUNT * 1.3, 'stations appear as the track reaches new country (' + totalStations + ')');
ok((kinds.bridge || 0) + (kinds.tunnel || 0) + (kinds.overpass || 0) > COUNT / 2, 'bridges, tunnels and overpasses happen by themselves');

// A long, straight run east reaches several regions and gets several stations.
const far = Build.create({ seed: 4242 });
for (let k = 0; k < 40; k++) far.add('LS');
ok(far.sites.length >= 3, 'a long run east gets a station in each new zone (' + far.sites.map(x => x.name).join(', ') + ')');
// Undo past a station takes it away again.
const nBefore = far.sites.length;
while (far.canUndo() && far.sites.length === nBefore) far.undo();
ok(far.sites.length === nBefore - 1, 'undoing a station\'s straights takes the station away');

// --- Quick Build: exactly the Ride's track ------------------------------------------------------
const quickPresses = [];
Routes.LIST.forEach(function (r) {
    const q = Build.quick(r.id);
    const full = Routes.build(r.id).track;
    const first = full.stationSites()[0];
    ok(q.sites.length >= 1 && q.sites[0].piece === first.piece, r.id + ': Quick Build starts at the first station');
    let presses = 0;
    while (!q.closed() && presses < 500) {
        const before = q.track.pieces.length;
        const peek = q.peek();
        const res = q.next();
        ok(res && peek.length === res.placed.length && peek.every((p, j) => p.cx === res.placed[j].cx && p.cz === res.placed[j].cz && p.type === res.placed[j].type),
            r.id + ': the preview shows exactly what Build lays');
        presses++;
        ok(q.pressed() === presses, r.id + ': each press is one piece of the design (' + q.pressed() + ')');
        const laid = q.track.pieces.length - before;
        ok(laid >= 1 && laid <= 5 && (laid >= 3 || q.closed()), r.id + ': a piece of the design is 3 to 5 track sections (' + laid + ')');
        if (!res) break;
    }
    ok(q.closed(), r.id + ': Quick Build closes the loop');
    // What its tile says: one piece a press, exactly as many as it takes.
    const facts = Build.quickFacts(r.id);
    ok(q.presses === presses && facts.presses === presses, r.id + ': the design is ' + presses + ' pieces, one a press (tile ' + facts.presses + ', session ' + q.presses + ')');
    quickPresses.push(r.id + ' ' + presses);
    ok(q.track.types() === full.types(), r.id + ': the same pieces as the Ride');
    ok(JSON.stringify(q.track.lifts()) === JSON.stringify(full.lifts()), r.id + ': the same heights (overpasses) as the Ride');
    ok(q.sites.length === full.stationSites().length, r.id + ': every station shows (' + q.sites.length + ')');
    ok(q.progress() === 1, r.id + ': progress reaches 100%');
});

console.log('  Quick Build designs (pieces = presses): ' + quickPresses.join(', '));

// --- The track's partial redraw matches a full one ------------------------------------------------
(function () {
    const sc = new THREE.Scene();
    const sum = m => { const a = m.geometry.attributes.position.array; let t = 0; for (let i = 0; i < a.length; i += 5) t += a[i] * ((i % 11) + 1); return a.length + ':' + t.toFixed(2); };
    // Keyed by chunk and sorted (a partial redraw re-adds its chunks at the end of the map).
    const snap = v => { const o = {}; Array.from(v.meshes().keys()).sort().forEach(k => { o[k] = sum(v.meshes().get(k)); }); return o; };
    const s = Build.create({ seed: 99 });
    const A = BNR.TrackView.create(THREE, { world: s.world, track: s.track, scene: sc });
    const B = BNR.TrackView.create(THREE, { world: s.world, track: s.track, scene: sc });
    const rnd = Util.mulberry(5);
    let same = 0, steps = 0;
    for (let k = 0; k < 120; k++) {
        const r = rnd();
        if (r < 0.1 && s.canUndo()) s.undo(); else s.add(r < 0.4 ? 'S' : r < 0.6 ? 'LS' : r < 0.8 ? 'L' : 'R');
        A.rebuild(true); B.rebuild(false);
        const a = snap(A), b = snap(B);
        steps++;
        if (JSON.stringify(a) === JSON.stringify(b)) same++;
    }
    for (const st of s.connectSteps()) { A.rebuild(true); B.rebuild(false); void st; }
    const a = snap(A), b = snap(B);
    ok(same === steps && JSON.stringify(a) === JSON.stringify(b), 'redrawing only the changed chunks matches redrawing everything (' + same + ' of ' + steps + ')');
})();

// --- My Tracks ---------------------------------------------------------------------------------------
(function () {
    localStorage.removeItem('bnr-tracks-v1');
    ok(Tracks.list().length === 0, 'My Tracks starts empty');
    const made = [];
    for (let k = 0; k < 3; k++) {
        const s = Build.create({ seed: 300 + k });
        s.add('LS'); s.add('L'); s.add('LS');
        for (const st of s.connectSteps()) void st;
        const rec = Tracks.save(s.record(), s.world, s.track);
        made.push(rec);
        ok(rec.saved && rec.id && rec.name, 'a finished loop saves (' + rec.name + ')');
        ok(rec.minutes >= 1 && rec.stations >= 1, 'it knows how long a lap takes and its stations');
    }
    const list = Tracks.list();
    ok(list.length === 3 && list[0].id === made[2].id, 'newest first');
    ok(new Set(list.map(r => r.name)).size === 3, 'every track has its own name (' + list.map(r => r.name).join(', ') + ')');
    ok(Tracks.get(made[1].id).types === made[1].types, 'a track can be read back');
    const s2 = Build.restore(Tracks.get(made[1].id));
    ok(s2.closed(), 'a saved track opens closed, ready to ride');
    Tracks.remove(made[1].id);
    ok(Tracks.list().length === 2 && !Tracks.get(made[1].id), 'Delete removes just that track');
    for (let k = 0; k < Tracks.MAX + 3; k++) Tracks.save(made[0], null, null);
    ok(Tracks.list().length === Tracks.MAX, 'My Tracks keeps the newest ' + Tracks.MAX);
    localStorage.removeItem('bnr-tracks-v1');
})();

// --- Unfinished tracks: saved as they are built, built on again exactly; Edit opens a loop -------
(function () {
    localStorage.removeItem('bnr-tracks-v1');
    const same = (a, b) => a.track.types() === b.track.types() && JSON.stringify(a.track.lifts()) === JSON.stringify(b.track.lifts()) &&
        a.sites.map(x => x.name + '@' + x.piece + ':' + x.side).join('|') === b.sites.map(x => x.name + '@' + x.piece + ':' + x.side).join('|');
    const rnd = Util.mulberry(808);
    const s = Build.create({ seed: 515 });
    for (let k = 0; k < 120; k++) {
        if (rnd() < 0.1 && s.canUndo()) { s.undo(); continue; }
        const b = s.blocked(), kinds = Object.keys(b).filter(x => !b[x]);
        if (!kinds.length) break;
        s.add(kinds[Math.floor(rnd() * kinds.length)]);
        if (s.closed()) break;
    }
    if (s.closed()) throw new Error('the test track closed by itself: pick another seed');
    const wip = Tracks.put(s.record(), s.world, s.track, null);
    ok(wip.saved && wip.finished === false && wip.presses.length === s.pieceCount(), 'a track in progress saves, unfinished, with its ' + s.pieceCount() + ' presses');
    const back = Build.resume(Tracks.get(wip.id));
    ok(!back.closed() && same(s, back) && back.pieceCount() === s.pieceCount(), 'it comes back exactly as it was left (pieces, heights, stations)');
    let undoSame = true;
    for (let k = 0; k < 6 && s.canUndo(); k++) { s.undo(); back.undo(); if (!same(s, back)) undoSame = false; }
    ok(undoSame, 'and Undo goes back a press at a time, just as before');
    back.add('S'); back.add('L');
    for (const st of back.connectSteps()) void st;
    const done = Tracks.put(back.record(), back.world, back.track, wip.id);
    ok(back.closed() && done.id === wip.id && done.name === wip.name && done.finished === true && Tracks.list().length === 1, 'finished, it is saved over itself: one track, same name, now a loop to ride');
    // Edit: back to where Connect took over, open, the player's own presses.
    const ed = Build.resume(Tracks.get(done.id));
    ok(!ed.closed() && ed.pieceCount() === done.presses.length && back.track.types().indexOf(ed.track.types()) === 0, 'Edit opens the loop where Connect took over (' + ed.pieceCount() + ' presses)');
    ok(ed.canUndo() && ed.piecesLeft() === Build.MAX_PIECES - ed.pieceCount(), 'and it can be undone and built on');
    // A loop saved before presses were kept opens at its last piece.
    const old = Object.assign({}, Tracks.get(done.id));
    delete old.presses; old.v = 2;
    const o2 = Build.resume(old);
    ok(!o2.closed() && o2.track.pieces.length === back.track.pieces.length - 1, 'an older save opens one piece short of closing');
    localStorage.removeItem('bnr-tracks-v1');
})();

// --- The endless world: every landscape, in climate bands ---------------------------------------------
(function () {
    const seen = {};
    let clash = 0, pairs = 0;
    const band = b => /snow|alpine/.test(b) ? 'c' : /desert|dunes|redrock|oasis/.test(b) ? 'h' : 'm';
    [77, 5, 9001].forEach(function (seed) {
        const w = World.create({ seed: seed, procedural: true });
        const R = World.REGION;
        for (let j = -9; j <= 9; j++) for (let i = -9; i <= 9; i++) {
            const b = w.zoneAt(i * R, j * R).biome;
            seen[b] = (seen[b] || 0) + 1;
            if (i < 9) {
                const b2 = w.zoneAt((i + 1) * R, j * R).biome;
                pairs++;
                if ((band(b) === 'c' && band(b2) === 'h') || (band(b) === 'h' && band(b2) === 'c')) clash++;
            }
        }
        ok(w.zoneAt(0, 0).biome === 'meadow', 'Build starts in a meadow (seed ' + seed + ')');
    });
    const all = Object.keys(BNR.Biomes.LIST || {}).filter(id => !['leaf', 'pine', 'bush', 'grass'].includes(id));
    console.log('  endless world landscapes: ' + Object.keys(seen).length + ' (' + Object.keys(seen).join(', ') + '); snow beside desert ' + clash + ' of ' + pairs);
    ok(Object.keys(seen).length >= 16, 'the endless world shows every landscape (' + Object.keys(seen).length + ')');
    ok(clash / pairs < 0.02, 'snow and desert are (almost) never side by side (' + clash + ' of ' + pairs + ')');
    void all;
})();

console.log('\n' + (checks - failures) + ' of ' + checks + ' checks passed');
if (failures) process.exit(1);
