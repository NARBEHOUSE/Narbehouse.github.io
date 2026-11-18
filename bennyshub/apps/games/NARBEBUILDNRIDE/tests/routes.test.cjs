'use strict';
/* NARBE Build n Ride - the six preset routes, in plain Node.
 *
 *   node tests/routes.test.cjs
 *
 * The routes escalate: each is longer than the one before, with more pieces and at
 * least as many overpasses. Every route closes, has a real bridge and a tunnel, stations
 * with their own names spread well apart and never under a crossing, at least five events
 * that always run, and every event can start where it is placed.
 *
 * Then the safety rule: nothing that walks across the line (deer, the tractor) is ever
 * within 3 units of the train while it is on the rails - at Slow, Medium and Fast, and when
 * the speed changes while it is crossing. Tumbleweeds roll right across: the train never
 * runs through one (it bumps one it reaches off the line, which is off the rails in moments).
 */
const H = require('../tools/harness.cjs');
const { BNR } = H.boot();

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } }

const ORDER = ['countryside', 'mountainpass', 'desertcanyon', 'snowyforest', 'seasidecliffs', 'nightcity'];
// Station counts and overpasses (crossings) each route aims for: [min, max].
const TARGET = {
    countryside: { stations: [5, 5], crossings: [1, 1] },
    mountainpass: { stations: [5, 6], crossings: [1, 2] },
    desertcanyon: { stations: [6, 6], crossings: [2, 2] },
    snowyforest: { stations: [6, 7], crossings: [2, 3] },
    seasidecliffs: { stations: [7, 8], crossings: [3, 3] },
    nightcity: { stations: [8, 10], crossings: [4, 99] }
};
const MIN_GAP = 180;        // between station stops along the loop
const CLEAR_OF_XING = 34;   // a station's middle from any crossing (platform + building)
const MOVERS = ['deer', 'tumbleweed', 'tractor'];

// --- the routes, as built ---------------------------------------------------------------------
console.log('routes');
ok(JSON.stringify(BNR.Routes.LIST.map(r => r.id)) === JSON.stringify(ORDER), 'the six routes, in order (' + BNR.Routes.LIST.map(r => r.id).join(', ') + ')');

const wrap = (d, L) => ((d % L) + L) % L;
const facts = BNR.Routes.LIST.map(function (r) {
    const b = BNR.Routes.build(r.id);
    const t = b.track, c = t.centerline(), L = c.length;
    const cells = new Map();
    t.pieces.forEach(p => { const k = p.cx + ',' + p.cz; cells.set(k, (cells.get(k) || 0) + 1); });
    const crossed = t.pieces.filter(p => cells.get(p.cx + ',' + p.cz) > 1).map(p => c.s[c.startIndex[p.i]] + p.len / 2);
    let bridge = 0, tunnel = 0;
    for (let i = 0; i < c.n; i++) {
        if (c.struct[i] === 'tunnel') tunnel++;
        if (c.struct[i] === 'bridge' && c.lift[i] < 0.01) bridge++;   // over water or a valley, not an overpass ramp
    }
    const st = t.stationSites().map(s => ({ name: s.name, s: c.s[c.startIndex[s.piece]] + t.pieces[s.piece].len * s.at })).sort((a, b) => a.s - b.s);
    const gaps = st.map((s, i) => wrap(st[(i + 1) % st.length].s - s.s, L) || L);
    return {
        r: r, pieces: t.pieces.length, length: L, closed: t.closed(), crossings: crossed.length / 2, crossed: crossed,
        bridge: bridge, tunnel: tunnel, stations: st, gaps: gaps,
        ungated: (r.events || []).filter(e => !e.when).length
    };
});

facts.forEach(function (f, i) {
    const r = f.r, T = TARGET[r.id] || { stations: [3, 99], crossings: [0, 99] };
    ok(f.closed, r.id + ': the loop closes');
    ok(typeof r.name === 'string' && r.name.length > 0 && typeof r.blurb === 'string' && r.blurb.length > 20, r.id + ': has a name and a blurb');
    ok(r.thumb && r.thumb.piece >= 0 && r.thumb.piece < f.pieces, r.id + ': its thumb picture is on the track');
    if (i > 0) {
        const p = facts[i - 1];
        ok(f.pieces > p.pieces, r.id + ': more pieces than ' + p.r.id + ' (' + f.pieces + ' > ' + p.pieces + ')');
        ok(f.length > p.length, r.id + ': longer than ' + p.r.id + ' (' + Math.round(f.length) + ' > ' + Math.round(p.length) + ')');
        ok(f.crossings >= p.crossings, r.id + ': at least as many overpasses as ' + p.r.id + ' (' + f.crossings + ' >= ' + p.crossings + ')');
    }
    ok(f.crossings >= T.crossings[0] && f.crossings <= T.crossings[1], r.id + ': ' + f.crossings + ' overpasses (aim ' + T.crossings.join('-') + ')');
    ok(f.tunnel > 10, r.id + ': a tunnel (' + f.tunnel + ' units)');
    ok(f.bridge > 10, r.id + ': a bridge over water or a valley (' + f.bridge + ' units)');
    // Stations: the right number, their own names, spread out, never under an overpass.
    const n = f.stations.length;
    ok(n >= T.stations[0] && n <= T.stations[1], r.id + ': ' + n + ' stations (aim ' + T.stations.join('-') + ')');
    const names = f.stations.map(s => s.name);
    ok(names.every(x => x && names.indexOf(x) === names.lastIndexOf(x)), r.id + ': every station has its own name (' + names.join(', ') + ')');
    ok(Math.min.apply(null, f.gaps) >= MIN_GAP, r.id + ': stations at least ' + MIN_GAP + ' apart (closest ' + Math.round(Math.min.apply(null, f.gaps)) + ')');
    const under = f.stations.filter(s => f.crossed.some(x => Math.min(wrap(x - s.s, f.length), wrap(s.s - x, f.length)) < CLEAR_OF_XING));
    ok(under.length === 0, r.id + ': no station under or beside an overpass (' + under.map(s => s.name).join(', ') + ')');
    // Events: at least five that always run (no `when`), of kinds that exist, on decorative lines that exist.
    ok(f.ungated >= 5, r.id + ': at least 5 events that always run (' + f.ungated + ')');
    (r.events || []).forEach(function (e) {
        ok(!!BNR.Events.info(e.type), r.id + ': event kind ' + e.type + ' exists');
        ok(e.piece >= 0 && e.piece < f.pieces, r.id + ': ' + e.type + ' at piece ' + e.piece + ' is on the track');
        if (e.type === 'freight') ok(!!(r.lines || [])[e.line || 0], r.id + ': the freight has its line');
    });
    if (r.prefer) ok(['day', 'night', undefined].indexOf(r.prefer.time) >= 0 && ['spring', 'summer', 'fall', 'winter', undefined].indexOf(r.prefer.season) >= 0, r.id + ': prefer is a time and/or season');
    const minutes = (f.length / BNR.Ride.SPEEDS[1].v + n * 7) / 60;
    console.log('  ' + r.id + ': ' + f.pieces + ' pieces, ' + Math.round(f.length) + ' units, about ' + minutes.toFixed(1) + ' min at Medium, ' + f.crossings + ' overpasses, ' +
        n + ' stations (' + names.join(' / ') + '), ' + (r.events || []).length + ' events (' + f.ungated + ' always)');
});
ok(facts[facts.length - 1].length > facts[0].length * 1.8, 'the last route is far longer than the first');

// --- every event can start where it is placed (water for the whale, the waterfall's landmark ...) ---
console.log('events start');
BNR.Routes.LIST.forEach(function (r) {
    const S = H.load(r.id, { quiet: true });
    const c = S.track().centerline();
    (r.events || []).forEach(function (def) {
        const K = BNR.Events.info(def.type);
        if (!K) return;
        const lead = def.lead !== undefined ? def.lead : K.lead;
        const sAnchor = c.s[c.startIndex[def.piece]] + S.track().pieces[def.piece].len / 2;
        S.events().clear();
        const started = S.events().start(def, { trainS: sAnchor - lead, lead: lead });
        ok(!!started, r.id + ': ' + def.type + ' at piece ' + def.piece + ' starts');
        S.events().clear();
    });
});

// --- nothing is ever run over -------------------------------------------------------------------
console.log('safety');
const tumbleStats = [];
{
    const SP = BNR.Ride.SPEEDS;
    // Scenarios: steady Slow, Medium, Fast; speeding up Slow -> Fast as soon as something starts
    // to cross; slowing Fast -> Slow likewise.
    const SCENARIOS = [
        { name: 'Slow', speed: 0 }, { name: 'Medium', speed: 1 }, { name: 'Fast', speed: 2 },
        { name: 'Slow then Fast mid-crossing', speed: 0, then: 2 }, { name: 'Fast then Slow mid-crossing', speed: 2, then: 0 },
        // The train already close when it starts (a tumbleweed meets the train: bumped, not run through).
        { name: 'Fast, train already close', speed: 2, close: 28 }, { name: 'Medium, train already close', speed: 1, close: 20 }
    ];
    BNR.Routes.LIST.forEach(function (r) {
        const movers = (r.events || []).filter(e => MOVERS.indexOf(e.type) >= 0);
        if (!movers.length) return;
        const S = H.load(r.id, { quiet: true });
        const c = S.track().centerline(), L = c.length, ride = S.ride();
        // The nearest ground-level rail to a point: { d, s } (bridges, tunnels and overpasses don't count).
        const nearRail = function (x, z) {
            let best = Infinity, bi = -1;
            for (let i = 0; i < c.n; i += 2) {
                if (c.struct[i] !== 'ground' || c.lift[i] > 0.01) continue;
                const d = (x - c.x[i]) * (x - c.x[i]) + (z - c.z[i]) * (z - c.z[i]);
                if (d < best) { best = d; bi = i; }
            }
            return { d: Math.sqrt(best), s: bi >= 0 ? c.s[bi] : 0 };
        };
        movers.forEach(function (def) {
            const K = BNR.Events.info(def.type);
            const lead = def.lead !== undefined ? def.lead : K.lead;
            const sAnchor = c.s[c.startIndex[def.piece]] + S.track().pieces[def.piece].len / 2;
            SCENARIOS.forEach(function (sc) {
                S.events().clear();
                S.placeAt(wrap(sAnchor - (sc.close || lead + 50), L));
                if (sc.close) S.events().start(def, { trainS: S.state.s, lead: sc.close });
                ride.setSpeed(sc.speed);
                ride.v = SP[sc.speed].v;
                let worst = Infinity, onLine = 0, changed = false, sawMover = false, runThrough = 0, bumped = 0;
                const knockedOnLine = {};
                const dt = 1 / 20;
                for (let k = 0; k < 20 * 75; k++) {
                    S.update(dt);
                    const actors = S.events().actors();
                    if (actors.length) sawMover = true;
                    const head = S.state.s, len = S.train().length;
                    actors.forEach(function (a) {
                        const q = nearRail(a.x, a.z);
                        if (q.d < 6 && sc.then !== undefined && !changed) { changed = true; ride.setSpeed(sc.then); }
                        if (q.d >= 3) return;
                        onLine++;
                        // Where along the train is it? 0 = the head, len = the tail.
                        const back = wrap(head - q.s, L);
                        const fwd = wrap(q.s - head, L);
                        const gap = back <= len ? 0 : Math.min(back - len, fwd);
                        if (a.kind === 'tumbleweed') {
                            // Tumbleweeds roll right across: one the train reaches is bumped off the
                            // line before the train gets to it, and is off the rails in moments. It
                            // touches the train within its own size of the widest car (the loco's 1.42).
                            if (a.knocked) { knockedOnLine[a.id] = (knockedOnLine[a.id] || 0) + 1; bumped++; }
                            else if (gap === 0 && q.d < 1.42 + a.r) runThrough++;
                            return;
                        }
                        worst = Math.min(worst, gap);
                    });
                }
                ok(sawMover, r.id + ': ' + def.type + ' at piece ' + def.piece + ' set off (' + sc.name + ')');
                if (def.type === 'tumbleweed') {
                    const longest = Math.max(0, ...Object.values(knockedOnLine));
                    ok(runThrough === 0, r.id + ': the train never runs through a tumbleweed (' + sc.name + '; ' + runThrough + ' steps)');
                    ok(longest <= 12, r.id + ': a bumped tumbleweed is off the rails in moments (' + sc.name + '; ' + longest + ' steps)');
                    tumbleStats.push(sc.name + (bumped ? ' bumped' : ' crossed'));
                    return;
                }
                ok(worst >= 3, r.id + ': ' + def.type + ' at piece ' + def.piece + ' never within 3 of the train (' + sc.name + '; closest ' + (worst === Infinity ? 'never on the line with it near' : worst.toFixed(1)) + ', ' + onLine + ' steps on the rails)');
            });
            S.events().clear();
        });
    });
}

console.log('  tumbleweeds: ' + tumbleStats.join(', '));
console.log('\n' + (checks - failures) + ' of ' + checks + ' checks passed');
if (failures) process.exit(1);
