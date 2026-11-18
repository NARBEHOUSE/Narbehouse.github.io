'use strict';
/* NARBE Build n Ride - Connect always closes the loop, in plain Node.
 *
 *   node tests/path.test.cjs [count]
 *
 * Random tangles (straights, turns, long straights, crossings, spirals, tracks that cross
 * the start's approach) each followed by Connect: the loop must close every time, at ground
 * level, with the start's heading; and the approach stays clear underneath crossings.
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const GAME = path.join(__dirname, '..');
global.window = global;
['util', 'biomes', 'world', 'track', 'path'].forEach(n =>
    vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js', n + '.js'), 'utf8'), { filename: n + '.js' }));
const { Track, Path, Util, World } = global.BNR;

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } }

function buildTrack(world) {
    const t = Track.create({ world: world, start: { cx: 0, cz: 0, h: 1 }, locked: 3, corridor: true });
    t.add(['S', 'S', 'S']);
    return t;
}

/**
 * Build's rule for a press (js/build.js check): within the ceiling, no steeper than a STEP, and
 * as much room ahead (six pieces) as the best choice has. Returns kind -> allowed.
 */
const CHOICES = { S: 'S', LS: ['S', 'S', 'S'], L: 'L', R: 'R' };
function rules(t) {
    const res = {};
    let best = -1;
    Object.keys(CHOICES).forEach(function (k) { const pv = t.preview(CHOICES[k], { look: 6 }); res[k] = pv; if (pv.ok) best = Math.max(best, pv.reach); });
    return k => res[k].ok && res[k].reach >= best;
}

function randomTangle(t, rnd, n, style) {
    for (let k = 0; k < n && !t.closed(); k++) {
        const r = rnd();
        let type;
        if (style === 'spiral') type = r < 0.7 ? 'R' : 'S';
        else if (style === 'home' && k < n * 0.6) {
            // Head back toward the start and cross its approach a few times, then wander.
            const e = t.end();
            const want = e.cx > 2 ? 3 : e.cx < -6 ? 1 : (k % 9 < 4 ? 0 : 2);
            type = e.h === want ? 'S' : ((want - e.h + 4) % 4 === 1 ? 'R' : 'L');
        } else type = r < 0.5 ? 'S' : r < 0.75 ? 'L' : 'R';
        let kind = type === 'S' && rnd() < 0.2 ? 'LS' : type;
        // Only what Build would let a player lay (else the first choice it would).
        const can = rules(t);
        if (!can(kind)) kind = ['S', 'L', 'R', 'LS'].find(can);
        if (!kind) break;
        t.add(CHOICES[kind]);
    }
}

const COUNT = +(process.argv[2] || 300);
let steep = 0, maxLen = 0, totalMs = 0, closedByThemselves = 0, replans = 0, rewinds = 0, rewoundPieces = 0, rewindsOutsideHome = 0;
const styles = ['random', 'spiral', 'home'];
for (let i = 0; i < COUNT; i++) {
    const rnd = Util.mulberry(1000 + i);
    const t = buildTrack(null);
    const style = styles[i % styles.length];
    randomTangle(t, rnd, 8 + Math.floor(rnd() * 140), style);
    if (t.closed()) { closedByThemselves++; continue; }
    const t0 = Date.now();
    const before = t.pieces.length;
    const types = Path.connect(t);
    if (types && types.steep) steep++;
    if (types) maxLen = Math.max(maxLen, types.length);
    const closed = Path.close(t);
    totalMs += Date.now() - t0;
    const st = Path.close.last;
    if (st.plans > 1) replans++;
    if (st.rewound) { rewinds++; rewoundPieces += st.rewound; if (style !== 'home') rewindsOutsideHome++; }
    ok(closed, 'tangle ' + i + ' (' + style + ', ' + before + ' pieces): Connect closes the loop');
    // The approach is protected: anything crossing it is high enough for the way in beneath.
    for (let k = 1; k <= Track.CORR; k++) {
        t.cellPieces(-k, 0).forEach(function (pi) {
            const p = t.pieces[pi];
            if (p.h === 1 && p.type === 'S') return;                                       // heading home
            if (k === Track.CORR && p.type !== 'S' && (p.h + Track.TYPES[p.type].turn + 4) % 4 === 1) return;   // turning in
            const lo = Math.min(t.liftIn(pi), t.liftOut(pi));
            ok(lo >= Track.corridorNeed(k) - 1e-6, 'tangle ' + i + ': crossing at approach cell ' + k + ' is high enough (' + lo + ')');
        });
    }
}
console.log('  ' + COUNT + ' tangles (' + closedByThemselves + ' closed by themselves): Connect took ' + (totalMs / Math.max(1, COUNT - closedByThemselves)).toFixed(1) +
    ' ms on average, longest path ' + maxLen + ' pieces, steep ' + steep + ' times, re-planned ' + replans + ' times, rewound ' + rewinds + ' times (' + rewoundPieces + ' pieces; ' + rewindsOutsideHome + ' outside the approach-tangling style)');
ok(rewindsOutsideHome <= COUNT * 0.15, 'rewinding (only when the way home is walled in) stays uncommon even in chaotic tangles (' + rewindsOutsideHome + ')');

// With a real world too (heights from the datum), a few tangles.
const world = World.create({ seed: 77, procedural: true });
for (let i = 0; i < 12; i++) {
    const rnd = Util.mulberry(5000 + i);
    const t = buildTrack(world);
    randomTangle(t, rnd, 30 + Math.floor(rnd() * 80), styles[i % 3]);
    if (t.closed()) continue;
    ok(Path.close(t), 'world tangle ' + i + ' closes');
    const c = t.centerline();
    ok(c.closed, 'world tangle ' + i + ': the centre line is a loop');
}

console.log('\n' + (checks - failures) + ' of ' + checks + ' checks passed');
if (failures) process.exit(1);
