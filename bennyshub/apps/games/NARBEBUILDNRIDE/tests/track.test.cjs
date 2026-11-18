'use strict';
/* NARBE Build n Ride - the grid track, the world and the routes, in plain Node.
 *
 *   node tests/track.test.cjs
 *
 * Pieces are relative to the heading; every press is placeable; crossings go over with
 * ramps no steeper than a STEP per piece; undo restores exactly; loops close level;
 * grades stay gentle; the world is repeatable; every route closes and has stations,
 * a tunnel and a bridge.
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const GAME = path.join(__dirname, '..');
global.window = global;
['util', 'biomes', 'world', 'track', 'routes'].forEach(n =>
    vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js', n + '.js'), 'utf8'), { filename: n + '.js' }));
const { Track, World, Routes, Util } = global.BNR;

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } }
function section(name) { console.log(name); }

// --- pieces are relative to the heading ------------------------------------------------
section('pieces');
{
    const t = Track.create({ world: null, start: { cx: 0, cz: 0, h: 1 } });   // heading east
    t.add('S');
    ok(t.end().cx === 1 && t.end().cz === 0 && t.end().h === 1, 'straight east moves one cell east');
    t.add('L');
    ok(t.end().h === 0 && t.end().cx === 1 && t.end().cz === -1, 'left from east heads north into the cell above');
    t.add('R');
    ok(t.end().h === 1 && t.end().cx === 2 && t.end().cz === -1, 'right from north heads east');
    t.add(['S', 'S', 'S']);
    ok(t.pieces.length === 6 && t.end().cx === 5, 'long straight is three pieces');
    ok(t.undo() === 3 && t.pieces.length === 3, 'undo removes the whole long straight');
    // Curves are continuous with their neighbours (entry of one = exit of the last).
    for (let i = 1; i < t.pieces.length; i++) {
        const a = Track.piecePoint(t.pieces[i - 1], 1), b = Track.piecePoint(t.pieces[i], 0);
        ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-9, 'joint ' + i + ' meets');
        ok(Math.abs(a.tx - b.tx) < 1e-9 && Math.abs(a.tz - b.tz) < 1e-9, 'joint ' + i + ' has no kink');
    }
    const c = t.centerline();
    let maxGap = 0;
    for (let i = 1; i < c.n; i++) maxGap = Math.max(maxGap, Math.hypot(c.x[i] - c.x[i - 1], c.z[i] - c.z[i - 1]));
    ok(maxGap < 1.2, 'centre line samples are about 1 unit apart (max ' + maxGap.toFixed(2) + ')');
}

// --- four rights make a square that closes -----------------------------------------------
section('closing');
{
    const t = Track.create({ world: null, start: { cx: 0, cz: 0, h: 1 } });
    t.add(['S', 'R', 'R', 'S', 'R']);
    ok(!t.closed(), 'not closed one short');
    t.add('R');
    ok(t.closed(), 'S R R S R R closes back at the start heading east');
    ok(t.add('S').length === 0, 'nothing can be added to a closed loop');
    const c = t.centerline();
    ok(c.closed && Math.abs(c.length - (2 * 14 + 2 * Math.PI * 7)) < 1e-6, 'loop length is two straights and a full circle');
}

// --- crossings go over, with ramps ---------------------------------------------------------
section('crossings');
{
    // A plus-shaped crossing: east along row 0, then come back north through (2, 0).
    const t = Track.create({ world: null, start: { cx: 0, cz: 0, h: 1 } });
    t.add(['S', 'S', 'S', 'S', 'S']);                 // (0..4, 0) heading east
    t.add(['R', 'S', 'R', 'S', 'R']);                 // down and back west along row 2 ... then north
    // Now heading north at (2, 2)? Walk until we enter row 0 again.
    const e = t.end();
    ok(e.h === 0, 'heading north (got ' + Track.NAMES[e.h] + ')');
    const before = t.pieces.length;
    while (t.end().cz > 0) t.add('S');
    const p = t.add('S')[0];                            // into the occupied cell
    ok(t.cellPieces(p.cx, p.cz).length === 2, 'two pieces share the crossing cell');
    ok(t.liftIn(p.i) === Track.LEVEL && t.liftOut(p.i) === Track.LEVEL, 'the crossing piece is one level up');
    ok(t.liftOut(p.i - 1) === Track.LEVEL && t.liftIn(p.i - 1) === Track.LEVEL - Track.STEP, 'the piece before ramps up a step');
    const steps = Math.round(Track.LEVEL / Track.STEP);
    ok(t.liftIn(p.i - steps) === 0 && t.liftOut(p.i - steps) === Track.STEP, 'the ramp starts on the ground ' + steps + ' pieces back');
    ok(Track.LEVEL >= 4.72 + 1.1 + 0.5, 'a level leaves room for the train (4.72) under a girder (1.1)');
    const q = t.add('S')[0];
    ok(t.liftOut(q.i) === Track.LEVEL - Track.STEP, 'after the crossing it eases down a step');
    for (let k = 1; k < steps; k++) t.add('S');
    ok(t.end().lift === 0, 'and is back on the ground');
    // Undo restores the ramp that the crossing raised.
    while (t.pieces.length > before) t.undo();
    ok(t.end().lift === 0 && t.liftIn(before - 1) === 0, 'undo lowers the ramp again');
    // Ramps are never steeper than a STEP per piece (outside the fallback).
    const t2 = Track.create({ world: null, start: { cx: 0, cz: 0, h: 1 } });
    const rnd = Util.mulberry(99);
    let steep = 0;
    for (let k = 0; k < 600; k++) {
        const r = rnd();
        t2.add(r < 0.5 ? 'S' : r < 0.75 ? 'L' : 'R');
    }
    for (let i = 0; i < t2.pieces.length; i++) if (Math.abs(t2.liftOut(i) - t2.liftIn(i)) > Track.STEP + 1e-9) steep++;
    ok(steep < 6, 'random 600-piece tangle: ' + steep + ' steep ramp pieces (fallback only)');
    // Every pair of touching pieces in a cell is separated by a full level.
    let clash = 0;
    const seen = new Set();
    t2.pieces.forEach(function (p) {
        const k = p.cx + ',' + p.cz;
        if (seen.has(k)) return;
        seen.add(k);
        const list = t2.cellPieces(p.cx, p.cz);
        for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
            const A = t2.pieces[list[a]], B = t2.pieces[list[b]];
            const pa = Track.portsOf(A.h, A.type), pb = Track.portsOf(B.h, B.type);
            const touch = (A.type === 'S' && B.type === 'S') || pa.some(x => pb.includes(x));
            if (!touch) continue;
            const ra = [Math.min(t2.liftIn(A.i), t2.liftOut(A.i)), Math.max(t2.liftIn(A.i), t2.liftOut(A.i))];
            const rb = [Math.min(t2.liftIn(B.i), t2.liftOut(B.i)), Math.max(t2.liftIn(B.i), t2.liftOut(B.i))];
            if (!(ra[0] >= rb[1] + Track.LEVEL - 1e-6 || rb[0] >= ra[1] + Track.LEVEL - 1e-6)) clash++;
        }
    });
    ok(clash === 0, 'random tangle: no two touching pieces closer than a level (' + clash + ')');
    // Opposite-corner curves share a cell without a bridge.
    const t3 = Track.create({ world: null, start: { cx: 0, cz: 0, h: 1 } });
    t3.add(['L', 'R']);                     // (0,0) east->north curve; then (0,-1) north->east
    ok(Track.portsOf(1, 'L').join() === '3,0', 'east-to-north curve uses west and north ports');
}

// --- preview does not change the track -------------------------------------------------------
section('preview');
{
    const t = Track.create({ world: null, start: { cx: 0, cz: 0, h: 1 } });
    t.add(['S', 'S', 'S', 'S', 'R', 'R', 'S', 'S', 'R']);
    const v = t.version(), n = t.pieces.length, lifts = t.pieces.map(p => t.liftIn(p.i)).join();
    const pv = t.preview('S');
    ok(pv.pieces.length === 1, 'preview returns the piece');
    ok(t.version() === v && t.pieces.length === n && t.pieces.map(p => t.liftIn(p.i)).join() === lifts, 'preview leaves the track as it was');
    const pv2 = t.preview(['S', 'S', 'S']);
    ok(pv2.pieces.length === 3 && pv2.pieces.some(p => p.liftIn > 0) && pv2.raised.length > 0, 'previewing a crossing shows the lift and the raised ramp');
}

// --- the world --------------------------------------------------------------------------------
section('world');
{
    const def = Routes.get('countryside').world;
    const a = World.create(def), b = World.create(def);
    let same = true;
    for (let k = 0; k < 200; k++) {
        const x = (k * 37) % 500 - 100, z = (k * 53) % 400 - 120;
        if (a.height(x, z) !== b.height(x, z) || a.datum(x, z) !== b.datum(x, z)) same = false;
    }
    ok(same, 'the same world definition gives the same world');
    // The datum is gentle everywhere: worst slope over many 14-unit steps.
    const worst = function (w, span) {
        let m = 0;
        const rnd = Util.mulberry(7);
        for (let k = 0; k < 3000; k++) {
            const x = (rnd() - 0.5) * span, z = (rnd() - 0.5) * span, ang = rnd() * Math.PI * 2;
            const g = Math.abs(w.datum(x + Math.cos(ang) * 14, z + Math.sin(ang) * 14) - w.datum(x, z)) / 14;
            m = Math.max(m, g);
        }
        return m;
    };
    const g1 = worst(a, 900);
    ok(g1 < 0.09, 'route datum grade under 9% (worst ' + (g1 * 100).toFixed(1) + '%)');
    const p = World.create({ seed: 77, procedural: true });
    const g2 = worst(p, 3000);
    ok(g2 < 0.1, 'endless world datum grade under 10% (worst ' + (g2 * 100).toFixed(1) + '%)');
    // Procedural biomes: the start is a meadow and every biome turns up somewhere.
    ok(p.biomeAt(0, 0) === 'meadow', 'the endless world starts in a meadow');
    const found = new Set();
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) found.add(p.biomeAt(i * 380, j * 380));
    ['meadow', 'forest', 'lake', 'mountains', 'desert', 'snowfield', 'town'].forEach(id => ok(found.has(id), 'endless world has ' + id));
    // Weights add up to one.
    const m = p.mix(123, -456);
    ['color', 'relief', 'datum'].forEach(k => { const s = Object.values(m[k]).reduce((x, y) => x + y, 0); ok(Math.abs(s - 1) < 0.01, k + ' weights sum to 1 (' + s.toFixed(3) + ')'); });
}

// --- the routes ----------------------------------------------------------------------------------
section('routes');
Routes.LIST.forEach(function (r) {
    const t0 = Date.now();
    const b = Routes.build(r.id);
    const t = b.track;
    ok(t.closed(), r.id + ': the loop closes');
    const c = t.centerline();
    const counts = { ground: 0, bridge: 0, tunnel: 0 };
    c.struct.forEach(s => counts[s]++);
    ok(counts.tunnel > 10, r.id + ': has a tunnel (' + counts.tunnel + ' units)');
    ok(counts.bridge > 10, r.id + ': has a bridge (' + counts.bridge + ' units)');
    let maxGrade = 0;
    for (let i = 1; i < c.n; i++) {
        const lift = Math.abs(c.lift[i] - c.lift[i - 1]) > 0.01;
        if (lift) continue;   // ramps are steeper by design
        maxGrade = Math.max(maxGrade, Math.abs(c.y[i] - c.y[i - 1]) / Math.max(0.3, c.s[i] - c.s[i - 1]));
    }
    ok(maxGrade < 0.1, r.id + ': gentle grade off the ramps (worst ' + (maxGrade * 100).toFixed(1) + '%)');
    const st = t.stationSites();
    ok(st.length >= 3, r.id + ': at least 3 stations (' + st.map(s => s.name).join(', ') + ')');
    console.log('  ' + r.id + ': ' + t.pieces.length + ' pieces, ' + Math.round(c.length) + ' units, ' + JSON.stringify(counts) +
        ', stations ' + st.map(s => s.name + '@' + s.piece).join(' / ') + ' (' + (Date.now() - t0) + ' ms)');
});

console.log('\n' + (checks - failures) + ' of ' + checks + ' checks passed');
if (failures) process.exit(1);
