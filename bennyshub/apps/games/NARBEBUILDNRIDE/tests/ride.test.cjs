'use strict';
/* NARBE Build n Ride - riding a loop, in plain Node.
 *
 *   node tests/ride.test.cjs
 *
 * The ride controller: stops at every station in order for about 3 seconds, never jolts
 * (acceleration and braking stay gentle), keeps to the chosen speed, changes speed smoothly,
 * fires each event once a lap. Then whole laps of every route through the real scene
 * (stations, events, chuffs and clacks), checking that every station is reached, every
 * event starts and finishes, and no station stop sits between an event's trigger and its spot.
 */
const H = require('../tools/harness.cjs');
const { BNR } = H.boot();

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } }

// --- the controller on its own --------------------------------------------------------------
console.log('controller');
{
    const L = 1000;
    const stations = [{ sStop: 120, name: 'A' }, { sStop: 480, name: 'B' }, { sStop: 820, name: 'C' }];
    const events = [{ sTrigger: 300, def: { type: 'x' } }, { sTrigger: 950, def: { type: 'y' } }];
    const r = BNR.Ride.create({ length: L, stations: stations, events: events, startS: 0, speed: 1 });
    const dt = 1 / 60;
    const log = [];
    let t = 0, vPrev = 0, maxA = 0, maxV = 0, dwellStart = 0;
    const dwells = [];
    for (let k = 0; k < 60 * 60 * 6 && r.laps < 2; k++) {
        const out = r.update(dt);
        t += dt;
        out.forEach(h => {
            log.push(h.type + ':' + (h.station ? h.station.name : h.event.def.type));
            if (h.type === 'arrive') dwellStart = t;
            if (h.type === 'depart') dwells.push(t - dwellStart);
        });
        if (r.phase === 'run') maxA = Math.max(maxA, Math.abs(r.v - vPrev) / dt);
        maxV = Math.max(maxV, r.v);
        vPrev = r.v;
    }
    const lap = log.slice(0, 8).join(' ');
    ok(lap === 'arrive:A depart:A event:x arrive:B depart:B arrive:C depart:C event:y', 'one lap in order: ' + lap);
    ok(dwells.length >= 3 && dwells.every(d => d > 2.9 && d < 3.1), 'stands about 3 s at each station (' + dwells.map(d => d.toFixed(2)).join(', ') + ')');
    ok(maxV <= 9 + 1e-6, 'never faster than Medium (' + maxV.toFixed(2) + ')');
    ok(maxA < 2.2, 'no jolts: worst acceleration ' + maxA.toFixed(2) + ' units/s/s');
    ok(log.filter(x => x === 'event:x').length === 2, 'each event fires once a lap');
    // Speed changes ease.
    const r2 = BNR.Ride.create({ length: L, stations: [], events: [], startS: 0, speed: 2 });
    for (let k = 0; k < 60 * 12; k++) r2.update(dt);
    ok(Math.abs(r2.v - 14) < 0.01, 'reaches Fast within 12 s (' + r2.v.toFixed(2) + ')');
    r2.setSpeed(0);
    let worst = 0, pv = r2.v;
    for (let k = 0; k < 600; k++) { r2.update(dt); worst = Math.max(worst, (pv - r2.v) / dt); pv = r2.v; }
    ok(Math.abs(r2.v - 5) < 0.01 && worst < 2.2, 'eases down to Slow (' + r2.v.toFixed(2) + ', worst ' + worst.toFixed(2) + ')');
}

// --- whole laps of every route through the real scene ---------------------------------------
console.log('routes');
BNR.Routes.LIST.forEach(function (route) {
    const t0 = Date.now();
    const S = H.load(route.id, { quiet: true });
    const c = S.track().centerline();
    const ride = S.ride();
    const L = c.length;
    // No station stop between an event's trigger and its anchor.
    route.events.forEach(function (def) {
        const K = BNR.Events.info(def.type);
        ok(!!K, route.id + ': event kind ' + def.type + ' exists');
        const lead = def.lead !== undefined ? def.lead : K.lead;
        const sAnchor = c.s[c.startIndex[def.piece]] + S.track().pieces[def.piece].len / 2;
        const clash = ride.stations.filter(st => { const d = ((sAnchor - st.sStop) % L + L) % L; return d < lead && lead > 0; });
        ok(clash.length === 0, route.id + ': ' + def.type + ' at piece ' + def.piece + ' has no station stop in its lead (' + clash.map(x => x.name).join(', ') + ')');
    });
    ok(route.events.length >= 5, route.id + ': at least 5 events (' + route.events.length + ')');
    const seen = { arrive: [], event: [], chuff: 0, clack: 0, starts: {} };
    S.on('arrive', st => seen.arrive.push(st.name));
    S.on('event', e => { seen.event.push(e.def.type); });
    S.on('chuff', () => seen.chuff++);
    S.on('clack', () => seen.clack++);
    ride.setSpeed(2);
    let maxLive = 0, steps = 0;
    const startLap = ride.laps;
    while (ride.laps < startLap + 1 && steps < 30 * 60 * 10) {
        S.update(1 / 30);
        maxLive = Math.max(maxLive, S.events().count());
        steps++;
    }
    // No new events now; let the lap's last ones finish (the freight takes longest).
    const events = S.events(), start = events.start;
    events.start = function () { return null; };
    for (let k = 0; k < 30 * 100; k++) S.update(1 / 30);
    events.start = start;
    const names = S.stations().list.map(s => s.name);
    ok(names.every(n => seen.arrive.includes(n)), route.id + ': stopped at every station (' + seen.arrive.join(', ') + ')');
    ok(route.events.filter(e => !e.when).every(e => seen.event.includes(e.type)), route.id + ': every event (without a when) started (' + seen.event.join(', ') + ')');
    ok(seen.chuff > L / 2.2 * 0.9, route.id + ': chuffs all the way round (' + seen.chuff + ')');
    ok(seen.clack >= S.track().pieces.length * 0.95, route.id + ': a clack at every joint (' + seen.clack + ' for ' + S.track().pieces.length + ' pieces)');
    ok(S.events().count() === 0, route.id + ': events finish and tidy up (' + S.events().count() + ' still running: ' + S.events().kinds().join(',') + '; at most ' + maxLive + ' at once)');
    console.log('  ' + route.id + ': lap in ' + (steps / 30).toFixed(0) + ' s at Fast, stations ' + names.join(' / ') + ', events ' + seen.event.join(' ') + ' (' + (Date.now() - t0) + ' ms)');
});

console.log('\n' + (checks - failures) + ' of ' + checks + ' checks passed');
if (failures) process.exit(1);
