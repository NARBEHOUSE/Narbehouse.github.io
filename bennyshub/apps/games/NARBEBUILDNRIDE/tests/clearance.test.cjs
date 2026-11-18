'use strict';
/* NARBE Build n Ride - the track never runs through itself (plain Node, no browser).
 *
 *   node tests/clearance.test.cjs [random sessions]
 *
 * Builds loops from patterns of repeated turns (corkscrews of rights and lefts, U-turns
 * back alongside, zigzags, S-bends, square spirals, mixes) and from random presses, then
 * Connect, and checks the open track before Connect and the closed loop after it:
 *  - wherever two stretches of track pass within a train's width of each other, one is
 *    high enough over the other for the train (4.72 tall) to fit under its girders (1.3);
 *  - no pier, leg, frame leg or abutment stands where other track or its train runs, and
 *    no ramp wall or stone viaduct comes down onto track below it;
 *  - nothing goes above the ceiling (two levels); no press makes a ramp steeper than a STEP;
 *  - a press is never refused unless a reason applies, and some press is always possible
 *    until the track runs out (then Connect);
 *  - Connect always closes the loop; the player's pieces count down plainly (one a press,
 *    Undo gives one back, Connect is free), the same for every button, and a long way home
 *    is still checked.
 * The six routes (and their side lines) get the same clearance checks.
 */
const path = require('path');
const H = require(path.join(__dirname, '..', 'tools', 'harness.cjs'));
const { BNR, THREE } = H.boot();
BNR.Geo.init(THREE);
const { Build, Track, Routes, Util } = BNR;

let failures = 0, checks = 0;
const failSeen = new Map();
function ok(cond, msg) {
    checks++;
    if (cond) return;
    failures++;
    const k = msg.replace(/[0-9.\-]+/g, '#');
    const n = (failSeen.get(k) || 0) + 1;
    failSeen.set(k, n);
    if (n <= 6) console.log('  FAIL ' + msg);
}

const TRAIN_H = 4.72, GIRDER = 1.1, TRAIN_W = 1.42, OTHER = 2.2;
const NEAR = TRAIN_W + 2.1 + 0.08;             // centre lines this close: a train would touch the other's girders
const CLEAR = TRAIN_H + GIRDER + 0.15;          // so one must be this far above the other (with room to spare)
const GAP = 20;                                 // samples this close along the track are the same stretch
const MAX = Track.MAX_LIFT;

function gridOf(c) {
    const g = new Map();
    for (let i = 0; i < c.n; i++) {
        const k = Math.floor(c.x[i] / 4) + ',' + Math.floor(c.z[i] / 4);
        if (!g.has(k)) g.set(k, []);
        g.get(k).push(i);
    }
    return g;
}
function near(g, x, z, r, fn) {
    const R = Math.ceil(r / 4), gx = Math.floor(x / 4), gz = Math.floor(z / 4);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const list = g.get((gx + dx) + ',' + (gz + dz));
        if (list) list.forEach(fn);
    }
}
function apart(c, i, j) { let d = Math.abs(i - j); if (c.closed) d = Math.min(d, c.n - d); return d; }

/** Two stretches of one track, or of two tracks (b), passing too close. Returns the worst. */
function clashes(c, tag, b) {
    const other = b || c, g = gridOf(other);
    let worst = Infinity, bad = 0;
    for (let i = 0; i < c.n; i++) {
        near(g, c.x[i], c.z[i], NEAR, function (j) {
            if (!b && (j <= i || apart(c, i, j) <= GAP)) return;
            if (Math.hypot(c.x[i] - other.x[j], c.z[i] - other.z[j]) >= NEAR) return;
            const dy = Math.abs(c.y[i] - other.y[j]);
            worst = Math.min(worst, dy);
            if (dy < CLEAR) bad++;
        });
    }
    ok(bad === 0, tag + ': ' + bad + ' places where track runs through track (closest ' + worst.toFixed(2) + ' apart, need ' + CLEAR.toFixed(2) + ')');
    return worst;
}

/** Piers, legs, abutments, ramp walls and stone viaduct walls keep off other track. */
function standsClear(view, c, tag) {
    const g = gridOf(c);
    let bad = 0, what = '';
    view.standing().forEach(function (s) {
        let i0 = -1, bd = Infinity;
        near(g, s.x, s.z, 6, function (j) { const d = Math.hypot(s.x - c.x[j], s.z - c.z[j]); if (d < bd) { bd = d; i0 = j; } });
        near(g, s.x, s.z, s.reach + OTHER, function (j) {
            if (i0 >= 0 && apart(c, i0, j) <= GAP) return;          // its own stretch
            if (Math.hypot(s.x - c.x[j], s.z - c.z[j]) >= s.reach + OTHER - 0.05) return;
            if (c.y[j] - GIRDER >= s.top || c.y[j] + TRAIN_H <= s.bottom) return;
            bad++; what = s.what;
        });
    });
    const P = view.plan();
    const styleAt = new Array(P.n).fill(null);
    P.runs.forEach(r => { for (let i = r.a; i <= r.b; i++) styleAt[((i % P.n) + P.n) % P.n] = r.style; });
    for (let i = 0; i < P.n; i++) {
        const walls = P.kind[i] === 'ramp' || (P.kind[i] === 'bridge' && styleAt[i] === 'stone');
        if (!walls) continue;
        near(g, c.x[i], c.z[i], 2.1 + OTHER, function (j) {
            if (apart(c, i, j) <= GAP) return;
            if (Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]) >= 2.1 + OTHER) return;
            if (c.y[j] - GIRDER >= c.y[i] - 0.7 || c.y[j] + TRAIN_H <= c.ground[i] - 1.2) return;
            bad++; what = P.kind[i] + ' wall';
        });
    }
    ok(bad === 0, tag + ': ' + bad + ' supports or walls standing on other track (' + what + ')');
}

/** Everything about one track: heights, ramps, clearance, supports. */
function inspect(t, tag, o) {
    o = o || {};
    const c = t.centerline();
    let top = 0;
    for (let i = 0; i <= t.pieces.length; i++) top = Math.max(top, t.liftIn(Math.min(i, t.pieces.length - 1)), t.liftOut(Math.min(i, t.pieces.length - 1)));
    if (o.ceiling !== false) ok(top <= MAX + 1e-6, tag + ': never above the ceiling (' + top + ' > ' + MAX + ')');
    const worst = clashes(c, tag);
    const view = BNR.TrackView.create(THREE, { world: t.world, track: t, scene: new THREE.Scene() });
    view.rebuild(false);
    standsClear(view, c, tag);
    view.dispose();
    return { top: top, worst: worst };
}

/** Lay presses, skipping refused ones (and checking they had a reason). */
function lay(s, presses, tag, stats) {
    presses.forEach(function (k) {
        if (s.closed()) return;
        const before = s.track.pieces.length;
        const chk = s.check(k);
        const res = s.add(k);
        if (res && res.blocked) {
            ok(!chk.ok && chk.why === res.blocked, tag + ': a refused press says why (' + res.blocked + ')');
            ok(s.track.pieces.length === before, tag + ': a refused press lays nothing');
            stats.refused[res.blocked] = (stats.refused[res.blocked] || 0) + 1;
            return;
        }
        ok(chk.ok, tag + ': a press laid only when check said yes');
        for (let i = 0; i < s.track.pieces.length; i++) {
            if (Math.abs(s.track.liftOut(i) - s.track.liftIn(i)) > Track.STEP + 1e-6 && i >= 3) { stats.steepPress++; break; }
        }
        const b = s.blocked();
        const any = Object.keys(b).some(x => !b[x]);
        if (!any && !s.closed()) {
            const why = Object.keys(b).map(x => b[x]);
            if (why.every(w => w === 'full')) stats.full++;
            else { stats.deadEnds++; if (stats.deadEnds <= 3) console.log('    dead end in ' + tag + ' after ' + s.track.types().slice(3) + ': ' + JSON.stringify(b)); }
        }
    });
}

function connect(s) {
    const it = s.connectSteps();
    let steps = 0;
    for (let r = it.next(); !r.done; r = it.next()) steps++;
    return steps;
}

function expand(spec) {
    // 'R*4,S' items; '(R,R,S)*8' groups.
    const out = [];
    const re = /\(([^)]*)\)\*(\d+)|(LS|S|L|R)(?:\*(\d+))?/g;
    let m;
    while ((m = re.exec(spec))) {
        if (m[1] !== undefined) for (let k = 0; k < +m[2]; k++) out.push(...expand(m[1]));
        else for (let k = 0; k < (m[4] ? +m[4] : 1); k++) out.push(m[3]);
    }
    return out;
}

const stats = { refused: {}, steepPress: 0, deadEnds: 0, full: 0, connectSteep: 0, tops: [], biggest: 0 };

// --- patterns of repeated turns -------------------------------------------------------------
const spiral = [];
for (let k = 1; k <= 9; k++) { for (let j = 0; j < k; j++) spiral.push('S'); spiral.push('R'); for (let j = 0; j < k; j++) spiral.push('S'); spiral.push('R'); }
const PATTERNS = {
    'rights x24': 'R*24',
    'lefts x24': 'L*24',
    'straight then rights': 'S,R*24',
    'two straights then lefts': 'S*2,L*24',
    'corkscrew, out, corkscrew': 'LS,R*8,S,R*8,S,R*8',
    'loops with a straight': '(R*4,S)*6',
    'left loops with a straight': '(L*4,S)*6',
    'right-right-straight': '(R,R,S)*8',
    'left-left-straight': '(L,L,S)*8',
    'U-turns alongside': '(R,R,S,S)*6',
    'zigzag': '(R,L)*12',
    'wiggle': '(R,L,L,R)*6',
    'stairs': '(S,R)*12',
    'long U-turns': '(LS,R,R)*6',
    'S-bends': '(R,R,LS,L,L,LS)*4',
    'three and three': '(R*3,L*3)*4',
    'five rights a left': '(R*5,L)*4',
    'five lefts a right': '(L*5,R)*4',
    'corkscrews with straights': 'R*6,S,R*6,S,R*6,S,L*6',
    'square spiral in': spiral.reverse().join(','),
    'back over the start': 'S,R,R,LS,LS,R,R,S*2,R*8',
    'tight figure eights': '(R*4,L*4)*4'
};
Object.keys(PATTERNS).forEach(function (name, n) {
    const s = Build.create({ seed: 5000 + n * 31 });
    lay(s, expand(PATTERNS[name]), name, stats);
    const open = inspect(s.track, name + ' (open)');
    stats.tops.push(open.top);
    connect(s);
    ok(s.closed(), name + ': Connect closes the loop');
    inspect(s.track, name + ' (closed)');
    for (let i = 3; i < s.track.pieces.length; i++) if (Math.abs(s.track.liftOut(i) - s.track.liftIn(i)) > Track.STEP + 1e-6) stats.connectSteep++;
});

// --- random building --------------------------------------------------------------------------
const COUNT = +(process.argv[2] || 160);
const KINDS = ['S', 'LS', 'L', 'R', 'R', 'L'];
let maxPieces = 0;
for (let i = 0; i < COUNT; i++) {
    const rnd = Util.mulberry(9100 + i);
    const s = Build.create({ seed: 7000 + i * 13 });
    const n = 20 + Math.floor(rnd() * 140);
    const tag = 'random ' + i;
    const presses = [];
    for (let k = 0; k < n; k++) presses.push(rnd() < 0.06 ? 'U' : KINDS[Math.floor(rnd() * KINDS.length)]);
    presses.forEach(function (k) {
        if (s.closed()) return;
        if (k === 'U') { if (s.canUndo()) s.undo(); return; }
        lay(s, [k], tag, stats);
    });
    if (i % 4 === 0) inspect(s.track, tag + ' (open)');
    connect(s);
    ok(s.closed(), tag + ': Connect closes the loop');
    maxPieces = Math.max(maxPieces, s.track.pieces.length);
    for (let j = 3; j < s.track.pieces.length; j++) if (Math.abs(s.track.liftOut(j) - s.track.liftIn(j)) > Track.STEP + 1e-6) stats.connectSteep++;
    if (i % 2 === 0) inspect(s.track, tag + ' (closed)');
    else { const c = s.track.centerline(); clashes(c, tag + ' (closed)'); }
}

// --- the piece budget: a plain count down -----------------------------------------------------------
{
    const s = Build.create({ seed: 4321, maxPieces: 40 });
    let laid = 0, refused = null;
    for (let k = 0; k < 60 && !refused; k++) { const r = s.add(k % 3 ? 'LS' : 'S'); if (r.blocked) refused = r.blocked; else laid++; }
    ok(laid === 40 && refused === 'full', 'the track runs out after exactly the pieces there are (' + laid + ', ' + refused + ')');
    ok(s.piecesLeft() === 0 && s.pieceCount() === 40, 'none left, 40 laid: a Long Straight is one piece (' + s.pieceCount() + ')');
    const b = s.blocked();
    ok(Object.keys(b).every(k => b[k] === 'full'), 'every piece button says out of track, whichever way it points (' + JSON.stringify(b) + ')');
    s.undo();
    ok(s.piecesLeft() === 1 && s.check('L').ok, 'Undo gives one back');
    s.add('L');
    ok(s.piecesLeft() === 0, 'and it can be used again');
    connect(s);
    ok(s.closed() && s.pieceCount() === 40, 'Connect brings it home, free (' + s.pieceCount() + ' pieces)');
}
// The longest way home: every piece a Long Straight, straight out (no limit for the test's sake).
{
    const s = Build.create({ seed: 4321, maxPieces: 120 });
    for (let k = 0; k < 120; k++) s.add('LS');
    connect(s);
    ok(s.closed(), 'Connect brings a long straight run home');
    stats.biggest = s.track.pieces.length;
    inspect(s.track, 'long track (closed)');
}

// --- saved loops from before the taller overpasses come back scaled ----------------------------
{
    const s = Build.create({ seed: 8080 });
    lay(s, expand('LS,R,R,LS,R,R,S*3,L,S*2'), 'save', stats);
    connect(s);
    const rec = s.record();
    ok(rec.v === 3 && rec.unit === Track.STEP && typeof rec.presses === 'string', 'a new save records its lift unit and its presses');
    const back = Build.restore(rec);
    ok(back.closed() && back.track.lifts().every((l, j) => Math.abs(l - s.track.lifts()[j]) < 1e-9), 'a new save comes back exactly');
    // An old (v1) save: lifts in steps of 2.5 under 5-unit levels.
    const old = { v: 1, seed: rec.seed, start: rec.start, types: rec.types, lifts: s.track.lifts().map(l => Math.round(l / Track.STEP) * 2 / 3), sites: rec.sites };
    old.lifts = old.lifts.map(l => Math.round(l));
    const ob = Build.restore(old);
    const L1 = ob.track.lifts();
    ok(ob.closed(), 'an old save still comes back closed');
    ok(L1.every((l, j) => Math.abs(l - old.lifts[j] * 2.5 * Track.LEVEL / 5) < 1e-9), 'an old save is scaled to today\'s level height');
    ok(Build.record(ob).lifts.every((l, j) => l === old.lifts[j]) && Build.record(ob).unit === 2.5 * Track.LEVEL / 5, 'an old save saves again unchanged');
}

// --- the six routes ---------------------------------------------------------------------------
Routes.LIST.forEach(function (r) {
    const full = Routes.build(r.id);
    const tag = 'route ' + r.id;
    const res = inspect(full.track, tag, { ceiling: true });
    (full.lines || []).forEach(function (line, k) {
        clashes(line.centerline(), tag + ' side line ' + k, full.track.centerline());
    });
    console.log('  ' + r.id + ': highest ' + res.top + ', closest stacked track ' + (res.worst === Infinity ? 'none' : res.worst.toFixed(2)));
});

console.log('  patterns: ' + Object.keys(PATTERNS).length + ', random sessions: ' + COUNT + '; presses refused ' + JSON.stringify(stats.refused) +
    '; tops ' + Math.max(...stats.tops) + '; out of track ' + stats.full + ' times; dead ends ' + stats.deadEnds +
    '; steep presses ' + stats.steepPress + '; steep pieces from Connect ' + stats.connectSteep + '; biggest random loop ' + maxPieces + ', straight-out loop ' + stats.biggest + ' pieces');
ok(stats.deadEnds === 0, 'some press is always possible until the track runs out (' + stats.deadEnds + ' dead ends)');
ok(stats.steepPress === 0, 'no press makes a ramp steeper than a STEP (' + stats.steepPress + ')');

console.log('\n' + (checks - failures) + ' of ' + checks + ' checks passed');
process.exit(failures ? 1 : 0);
