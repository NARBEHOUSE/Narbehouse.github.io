'use strict';
/* NARBE Build n Ride - every sound renders, the frequent ones stay soft and low, loops are
 * seamless, and every sound name the game plays exists.
 *
 *   node tests/sound.test.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const GAME = path.join(__dirname, '..');

global.window = global;
global.performance = global.performance || { now: () => Date.now() };
global.URL.createObjectURL = () => 'blob:test';
global.BNR = {};
vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js/sound.js'), 'utf8'), { filename: 'sound.js' });
const Sound = global.BNR.Sound;

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } }

const SR = Sound._rate;
const all = Sound._render();
const fams = new Set(all.map(r => r.family));

/** Share of a sound's energy above 2.5 kHz (a second-order high-pass). */
function highShare(x) {
    const w = 2 * Math.PI * 2500 / SR, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * 0.707);
    const b0 = (1 + cs) / 2 / (1 + a), b1 = -(1 + cs) / (1 + a), b2 = (1 + cs) / 2 / (1 + a), a1 = -2 * cs / (1 + a), a2 = (1 - a) / (1 + a);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, eh = 0, e = 0;
    for (let i = 0; i < x.length; i++) {
        const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
        eh += y * y; e += x[i] * x[i];
    }
    return e ? eh / e : 0;
}

all.forEach(function (r) {
    let peak = 0, bad = false;
    for (let i = 0; i < r.samples.length; i++) { const v = r.samples[i]; if (!isFinite(v)) bad = true; peak = Math.max(peak, Math.abs(v)); }
    ok(!bad && peak > 0.02 && peak <= 1, r.family + ' renders (peak ' + peak.toFixed(2) + ')');
});

// Frequent cues: soft and low.
['blip', 'chuff', 'clack'].forEach(function (f) {
    const list = all.filter(r => r.family === f);
    list.forEach(function (r, k) {
        let peak = 0;
        for (let i = 0; i < r.samples.length; i++) peak = Math.max(peak, Math.abs(r.samples[i]));
        const h = highShare(r.samples);
        ok(peak <= 0.45, f + ' ' + k + ' is soft (peak ' + peak.toFixed(2) + ')');
        ok(h < 0.12, f + ' ' + k + ' stays under 2.5 kHz (' + (h * 100).toFixed(1) + '% above)');
        ok(r.samples.length / SR < 0.35, f + ' ' + k + ' is short (' + (r.samples.length / SR).toFixed(2) + ' s)');
    });
});
// The horn is warm, not shrill.
all.filter(r => r.family === 'horn').forEach((r, k) => { const h = highShare(r.samples); ok(h < 0.08, 'horn ' + k + ' is warm (' + (h * 100).toFixed(1) + '% above 2.5 kHz)'); });

// Loops: long enough and seamless (the end flows into the start).
all.filter(r => r.loop).forEach(function (r) {
    const x = r.samples, n = x.length;
    let rms = 0;
    for (let i = 0; i < n; i++) rms += x[i] * x[i];
    rms = Math.sqrt(rms / n);
    const seam = Math.abs(x[n - 1] - x[0]);
    ok(n / SR > 4, r.family + ' loop is ' + (n / SR).toFixed(1) + ' s');
    // (A wrapped loop's join is its copied start, checked below.)
    if (!r.wrap) ok(seam < Math.max(0.05, rms * 2.5), r.family + ' loop seam ' + seam.toFixed(3) + ' (rms ' + rms.toFixed(3) + ')');
});

// Peaceful: no loop sits on a steady bed of hiss. A noise bed leaves a high-frequency floor
// all the time; sparse birdsong and drops do not, so the MEDIAN of the high-passed signal
// stays near zero.
function highpassMedian(x, fc) {
    const w = 2 * Math.PI * fc / SR, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * 0.707);
    const b0 = (1 + cs) / 2 / (1 + a), b1 = -(1 + cs) / (1 + a), b2 = (1 + cs) / 2 / (1 + a), a1 = -2 * cs / (1 + a), a2 = (1 - a) / (1 + a);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    const env = [];
    let acc = 0, k = 0;
    for (let i = 0; i < x.length; i++) {
        const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
        acc += Math.abs(y); k++;
        if (k === 441) { env.push(acc / k); acc = 0; k = 0; }   // 20 ms windows
    }
    env.sort((p, q) => p - q);
    return env[Math.floor(env.length / 2)] || 0;
}
all.filter(r => r.loop).forEach(function (r) {
    const m = highpassMedian(r.samples, 1000);
    ok(m < 0.004, r.family + ' has no hiss under it (median above 1 kHz ' + m.toFixed(4) + ')');
});
// Soothing, not squeaky: the zone music and the rain (heard all ride long) keep almost all
// their sound under 1.2 kHz and nearly none above 2.5 kHz, and the music joins seamlessly
// (a wrapped loop ends with a copy of its start, which the player crossfades over).
function shareAbove(x, fc) {
    const w = 2 * Math.PI * fc / SR, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * 0.707);
    const b0 = (1 + cs) / 2 / (1 + a), b1 = -(1 + cs) / (1 + a), b2 = (1 + cs) / 2 / (1 + a), a1 = -2 * cs / (1 + a), a2 = (1 - a) / (1 + a);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, eh = 0, e = 0;
    for (let i = 0; i < x.length; i++) {
        const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
        eh += y * y; e += x[i] * x[i];
    }
    return e ? eh / e : 0;
}
all.filter(r => r.loop && (Sound.AMBIENTS.includes(r.family) || r.family === 'rain')).forEach(function (r) {
    const h1 = shareAbove(r.samples, 1200), h2 = shareAbove(r.samples, 2500);
    ok(h1 < 0.04, r.family + ' stays low and soft (' + (h1 * 100).toFixed(2) + '% above 1.2 kHz)');
    ok(h2 < 0.005, r.family + ' has nothing shrill (' + (h2 * 100).toFixed(3) + '% above 2.5 kHz)');
    ok(r.wrap, r.family + ' is a wrapped music loop');
    if (r.wrap) {
        const x = Math.round(r.xf * SR), n = r.samples.length - x;
        let same = true;
        for (let i = 0; i < x; i++) if (r.samples[n + i] !== r.samples[i]) { same = false; break; }
        ok(same, r.family + ' ends on a copy of its start (seamless join)');
        ok(n / SR >= 12, r.family + ' is long enough not to sound repetitive (' + (n / SR).toFixed(0) + ' s)');
    }
});
// Event calls heard out in the country stay soft too.
['gull', 'flutter'].forEach(f => all.filter(r => r.family === f).forEach(r => {
    const h = shareAbove(r.samples, 1200);
    ok(h < 0.1, f + ' is not squeaky (' + (h * 100).toFixed(1) + '% above 1.2 kHz)');
}));

all.filter(r => r.family === 'chuff').forEach(function (r, k) {
    let e = 0, eh = 0;
    const w = 2 * Math.PI * 1000 / SR, cs = Math.cos(w), sn = Math.sin(w), a = sn / 1.414;
    const b0 = (1 + cs) / 2 / (1 + a), b1 = -(1 + cs) / (1 + a), b2 = (1 + cs) / 2 / (1 + a), a1 = -2 * cs / (1 + a), a2 = (1 - a) / (1 + a);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < r.samples.length; i++) { const x = r.samples[i]; const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; e += x * x; eh += y * y; }
    ok(eh / e < 0.03, 'chuff ' + k + ' is a soft low puff (' + (eh / e * 100).toFixed(1) + '% above 1 kHz)');
});

// Every sound the game asks for by name exists.
const used = new Set();
fs.readdirSync(path.join(GAME, 'js')).forEach(function (f) {
    const src = fs.readFileSync(path.join(GAME, 'js', f), 'utf8');
    let m;
    const reA = /Sound\.play\('([a-z-]+)'/g, reB = /emit\('sound', \{ name: '([a-z-]+)'/g, reC = /play\('([a-z-]+)'/g;
    while ((m = reA.exec(src))) used.add(m[1]);
    while ((m = reB.exec(src))) used.add(m[1]);
    if (f === 'sound.js') while ((m = reC.exec(src))) used.add(m[1]);
});
used.forEach(n => ok(fams.has(n), 'sound "' + n + '" exists'));
Sound.AMBIENTS.concat(['tunnel']).forEach(n => ok(all.some(r => r.loop && r.family === n), 'loop "' + n + '" exists'));
const ambients = new Set();
vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js/util.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js/biomes.js'), 'utf8'));
Object.values(global.BNR.Biomes.LIST).forEach(b => ambients.add('amb-' + b.ambient));
ambients.forEach(n => ok(Sound.AMBIENTS.includes(n), 'every biome\'s ambience has a loop (' + n + ')'));

console.log(all.length + ' sounds rendered (' + fams.size + ' families), ' + used.size + ' names used by the game');
console.log((checks - failures) + ' of ' + checks + ' checks passed');
if (failures) process.exit(1);
