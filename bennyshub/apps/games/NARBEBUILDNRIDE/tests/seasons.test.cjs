'use strict';
/* NARBE Build n Ride - seasons change slowly, and their weather comes first.
 *
 * Choosing Winter mid-ride: it starts snowing while the land is still green, then the
 * land whitens a little at a time, in patches, never in one jump. Spring thaws with rain,
 * fall brings drifting leaves, a locked "Clear" sky stays clear, and a ride loads settled.
 *
 *   node tests/seasons.test.cjs
 */
const path = require('path');
const H = require(path.join(__dirname, '..', 'tools', 'harness.cjs'));
const { BNR } = H.boot();
const W = BNR.Weather;

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); }

/** Mean brightness of the ground near the train (0..1), from the drawn vertex colours. */
function groundLight() {
    const p = BNR.Scene.train().position();
    let sum = 0, n = 0;
    BNR.Scene.terrain().root.children.forEach(function (g) {
        if (!g.visible) return;
        const m = g.children[0];
        if (!m || !m.geometry || !m.geometry.attributes.color) return;
        const bs = m.geometry.boundingSphere;
        if (bs && Math.hypot(bs.center.x - p.x, bs.center.z - p.z) > 160) return;
        const c = m.geometry.attributes.color.array;
        for (let i = 0; i < c.length; i += 9) { sum += (c[i] + c[i + 1] + c[i + 2]) / 3; n++; }
    });
    return n ? sum / n : 0;
}

/** Run the world for `secs`, calling fn(t) each second. */
function run(secs, fn) {
    const dt = 1 / 15;
    for (let s = 0; s < secs; s++) {
        H.simulate(1, dt);
        if (fn) fn(s + 1);
    }
}

// --- Winter chosen mid-ride -----------------------------------------------------------------
W.setModes({ time: 'day', season: 'summer', weather: 'auto' });
H.load('countryside', { season: 'summer' });
W.setModes({ time: 'day', season: 'summer', weather: 'auto' });
W.jump({ weather: 'clear' });
run(3);
const summer = groundLight();
W.setModes({ time: 'day', season: 'winter', weather: 'auto' });
const trace = [];
let snowingBeforeWhite = null;
run(75, function (t) {
    const L = W.look();
    trace.push({ t: t, light: groundLight(), k: L.k, snowy: W.state.snowy, season: W.season() });
    if (snowingBeforeWhite === null && L.k > 0) snowingBeforeWhite = W.state.snowy;
});
const winter = groundLight();
console.log('ground light: summer ' + summer.toFixed(3) + ' -> winter ' + winter.toFixed(3));
console.log(trace.filter((r, i) => i % 5 === 4).map(r => r.t + 's ' + r.light.toFixed(3) + ' k' + r.k.toFixed(2) + ' snow' + r.snowy.toFixed(2)).join(' | '));
ok(winter > summer + 0.15, 'the land turns white for winter');
ok(snowingBeforeWhite !== null && snowingBeforeWhite > 0.8, 'it is snowing before the land starts to whiten (' + (snowingBeforeWhite || 0).toFixed(2) + ')');
const leadEnd = trace.find(r => r.k > 0);
ok(leadEnd && leadEnd.t >= 6 && Math.abs(trace[Math.max(0, leadEnd.t - 2)].light - summer) < 0.01, 'the land stays green for the first seconds of snowfall');
const span = winter - summer;
let biggest = 0;
for (let i = 1; i < trace.length; i++) biggest = Math.max(biggest, Math.abs(trace[i].light - trace[i - 1].light));
ok(biggest < span * 0.12, 'no sudden jump: at most ' + (biggest / span * 100).toFixed(1) + '% of the change in any one second');
const quarter = trace.find(r => r.light > summer + span * 0.25), threeQ = trace.find(r => r.light > summer + span * 0.75);
ok(quarter && threeQ && threeQ.t - quarter.t >= 15, 'the whitening takes its time (25% -> 75% over ' + (quarter && threeQ ? threeQ.t - quarter.t : '?') + ' s)');
ok(trace.slice(-10).every(r => r.snowy > 0.5), 'snow keeps falling after the land is white');
ok(W.season() === 'winter' && !W.state.trans, 'the change finishes in winter');
ok(BNR.Scene.env.season === 'winter', 'events see winter');

// --- Spring after winter: rain, and the snow melts slowly -------------------------------------
W.setModes({ time: 'day', season: 'spring', weather: 'auto' });
let rainedFirst = null;
const melt = [];
run(70, function () {
    if (rainedFirst === null && W.look().k > 0) rainedFirst = W.state.wet;
    melt.push(groundLight());
});
ok(rainedFirst !== null && rainedFirst > 0.8, 'spring rain comes before the thaw (' + (rainedFirst || 0).toFixed(2) + ')');
ok(melt[melt.length - 1] < winter - 0.15, 'the snow melts away');
let meltJump = 0;
for (let i = 1; i < melt.length; i++) meltJump = Math.max(meltJump, Math.abs(melt[i] - melt[i - 1]));
ok(meltJump < span * 0.12, 'the thaw is gradual too (' + (meltJump / span * 100).toFixed(1) + '% max per second)');

// --- Fall: leaves drift down while the trees turn ---------------------------------------------
W.setModes({ time: 'day', season: 'fall', weather: 'auto' });
let leaves = 0;
run(30, function () { leaves = Math.max(leaves, W.state.leaves); });
ok(leaves > 0.7, 'falling leaves bring fall in (' + leaves.toFixed(2) + ')');

// --- A locked Clear sky stays clear --------------------------------------------------------------
W.setModes({ time: 'day', season: 'winter', weather: 'clear' });
let maxSnow = 0;
run(30, function () { maxSnow = Math.max(maxSnow, W.state.snowy); });
ok(maxSnow < 0.05, 'Weather: Clear is respected during the change (' + maxSnow.toFixed(2) + ')');

// --- Auto Cycle: the season changes slowly on its own ---------------------------------------
W.setModes({ time: 'day', season: 'auto', weather: 'auto' });
H.load('countryside', { season: 'summer' });
ok(!W.state.trans && W.season() === 'summer', 'a ride loads settled in its season');
W.state.seasonT = W.SEASON - 1;
run(4);
ok(W.state.trans && W.state.trans.to === 'fall' && W.state.trans.dur >= 60, 'Auto Cycle starts a slow change to fall (over ' + (W.state.trans ? W.state.trans.dur : '?') + ' s)');
W.settle();
ok(!W.state.trans && W.season() === 'fall', 'settle finishes the change at once');

console.log((checks - failures) + ' of ' + checks + ' checks passed');
if (failures) process.exit(1);
