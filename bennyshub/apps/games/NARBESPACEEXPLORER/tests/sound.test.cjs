'use strict';
/* NARBE Space Explorer - every sound renders, the frequent ones stay short, soft and low,
 * the rare ones are allowed to shine, the alien voices have variants and are never shrill,
 * the music loops are seamless, low, hiss-free and on one scale, and the runtime (SafeAudio
 * one-shots, crossfading music) behaves. Node only, no browser.
 * (Modelled on NARBE Build n Ride's tests/sound.test.cjs.)
 *
 *   node tests/sound.test.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const GAME = path.join(__dirname, '..');

global.window = global;
global.performance = global.performance || { now: () => Date.now() };
global.URL.createObjectURL = () => 'blob:test';
global.NSE = {};
vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js/sound.js'), 'utf8'), { filename: 'sound.js' });
const Sound = global.NSE.Sound;

let failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } }

const SR = Sound._rate;
const t0 = Date.now();
const all = Sound._render();
const renderMs = Date.now() - t0;
const byName = n => all.filter(r => r.name === n);

function hp(fc) {
    const w = 2 * Math.PI * fc / SR, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * 0.707);
    return [(1 + cs) / 2 / (1 + a), -(1 + cs) / (1 + a), (1 + cs) / 2 / (1 + a), -2 * cs / (1 + a), (1 - a) / (1 + a)];
}
/** Share of a sound's energy above fc (a second-order high-pass). */
function shareAbove(x, fc) {
    const [b0, b1, b2, a1, a2] = hp(fc);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, eh = 0, e = 0;
    for (let i = 0; i < x.length; i++) {
        const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
        eh += y * y; e += x[i] * x[i];
    }
    return e ? eh / e : 0;
}
/**
 * Median (over 20 ms windows) of the signal through a steep (4th-order) high-pass at fc:
 * a hiss bed keeps it up all the time, while sparse notes and low tones leave it near zero.
 * (A gentle 2nd-order filter lets mid-range notes leak through and can't tell the two apart;
 * a faint lowpassed noise bed mixed into a loop reads ~0.0009 here, the music ~0.00001.)
 */
function highpassMedian(x, fc) {
    const [b0, b1, b2, a1, a2] = hp(fc);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, z1 = 0, z2 = 0, acc = 0, k = 0;
    const env = [];
    for (let i = 0; i < x.length; i++) {
        const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
        const z = b0 * y + b1 * u1 + b2 * u2 - a1 * z1 - a2 * z2;
        u2 = u1; u1 = y; z2 = z1; z1 = z;
        acc += Math.abs(z); k++;
        if (k === 441) { env.push(acc / k); acc = 0; k = 0; }
    }
    env.sort((p, q) => p - q);
    return env[Math.floor(env.length / 2)] || 0;
}
function stats(x) {
    let peak = 0, sq = 0, bad = false;
    for (let i = 0; i < x.length; i++) { const v = x[i]; if (!isFinite(v)) bad = true; peak = Math.max(peak, Math.abs(v)); sq += v * v; }
    return { peak: peak, rms: Math.sqrt(sq / x.length), bad: bad, secs: x.length / SR };
}

// Everything renders: finite, audible, and never near clipping.
all.forEach(function (r) {
    const s = stats(r.samples);
    ok(!s.bad, r.name + ' has no NaN/Infinity');
    ok(s.peak > 0.05 && s.peak <= 0.9, r.name + ' peak ' + s.peak.toFixed(2) + ' within 0.05..0.9');
});

// Every listed name renders, and the lists are complete.
Sound.NAMES.forEach(n => ok(byName(n).some(r => !r.loop), 'one-shot "' + n + '" renders'));
Sound.MUSIC.forEach(n => ok(byName(n).some(r => r.loop), 'music "' + n + '" renders'));
['blip', 'choose', 'chime', 'warp', 'arrive', 'thrust', 'faster', 'slower', 'scan', 'log', 'hail',
    'alien-friendly', 'alien-curious', 'alien-grumpy', 'alien-loud', 'flyby', 'pop'].forEach(n => ok(Sound.NAMES.includes(n), 'NAMES has "' + n + '"'));
['amb-yellow', 'amb-orange', 'amb-red', 'amb-blue', 'amb-white', 'amb-binary', 'amb-nebula', 'amb-blackhole',
    'amb-deep', 'amb-surface', 'amb-menu'].forEach(n => ok(Sound.MUSIC.includes(n), 'MUSIC has "' + n + '"'));

// Frequent cues (heard hundreds of times a session): short, soft attack, quiet, low.
['blip', 'choose', 'thrust', 'faster', 'slower', 'pop'].forEach(function (n) {
    byName(n).forEach(function (r, k) {
        const s = stats(r.samples), h = shareAbove(r.samples, 2500);
        let early = 0;
        for (let i = 0; i < Math.floor(0.002 * SR); i++) early = Math.max(early, Math.abs(r.samples[i]));
        ok(s.secs < 0.4, n + ' ' + k + ' is short (' + s.secs.toFixed(2) + ' s)');
        ok(s.peak <= 0.4, n + ' ' + k + ' is quiet (peak ' + s.peak.toFixed(2) + ')');
        ok(h < 0.05, n + ' ' + k + ' stays under 2.5 kHz (' + (h * 100).toFixed(2) + '% above)');
        ok(early < s.peak * 0.5, n + ' ' + k + ' has a soft attack (first 2 ms ' + (early / s.peak * 100).toFixed(0) + '% of peak)');
    });
});
ok(stats(byName('blip')[0].samples).peak <= 0.25, 'blip is the softest cue');
byName('thrust').forEach((r, k) => { const h = shareAbove(r.samples, 1000); ok(h < 0.05, 'thrust ' + k + ' is a low puff (' + (h * 100).toFixed(1) + '% above 1 kHz)'); });
ok(byName('thrust').length >= 2, 'thrust has variants');

// The rare, special moments are allowed to be bigger, but are still not harsh.
const chime = stats(byName('chime')[0].samples), warp = stats(byName('warp')[0].samples);
ok(chime.peak >= 0.5, 'chime stands out (peak ' + chime.peak.toFixed(2) + ')');
ok(chime.secs >= 1.0 && chime.secs <= 1.8, 'chime is about 1.2 s (' + chime.secs.toFixed(2) + ' s)');
ok(warp.peak >= 0.6, 'warp is big (peak ' + warp.peak.toFixed(2) + ')');
ok(warp.secs >= 3.5 && warp.secs <= 4.8, 'warp is about 4 s (' + warp.secs.toFixed(2) + ' s)');
ok(shareAbove(byName('warp')[0].samples, 2500) < 0.03, 'warp is rounded, no white-noise blast (' + (shareAbove(byName('warp')[0].samples, 2500) * 100).toFixed(2) + '% above 2.5 kHz)');
{ const m = highpassMedian(byName('warp')[0].samples, 4000); ok(m < 0.001, 'warp has no broadband hiss (median above 4 kHz ' + m.toFixed(5) + ')'); }
['arrive', 'scan', 'log', 'hail', 'flyby'].forEach(n => byName(n).forEach(r => {
    const h = shareAbove(r.samples, 2500), s = stats(r.samples);
    ok(h < 0.08, n + ' is soft-toned (' + (h * 100).toFixed(2) + '% above 2.5 kHz)');
    ok(s.peak <= 0.5, n + ' is modest (peak ' + s.peak.toFixed(2) + ')');
}));
ok(Math.abs(stats(byName('scan')[0].samples).secs - 0.9) < 0.25, 'scan is about 0.9 s');
ok(Math.abs(stats(byName('arrive')[0].samples).secs - 1.5) < 0.3, 'arrive is about 1.5 s');
ok(Math.abs(stats(byName('flyby')[0].samples).secs - 1.2) < 0.3, 'flyby is about 1.2 s');

// The aliens: 2-3 variants of each mood, 1.3-2.1 s, never shrill; loud is louder.
const moodRms = {};
['friendly', 'curious', 'grumpy', 'loud'].forEach(function (m) {
    const list = byName('alien-' + m);
    ok(list.length >= 2, 'alien-' + m + ' has ' + list.length + ' variants');
    let rms = 0;
    list.forEach(function (r, k) {
        const s = stats(r.samples), h = shareAbove(r.samples, 2500);
        // how long it really speaks (to the last sample above 2% of peak)
        let last = 0;
        for (let i = 0; i < r.samples.length; i++) if (Math.abs(r.samples[i]) > s.peak * 0.02) last = i;
        const spoke = last / SR;
        ok(spoke >= 1.2 && spoke <= 2.05, 'alien-' + m + ' ' + k + ' babbles ' + spoke.toFixed(2) + ' s');
        ok(h < 0.04, 'alien-' + m + ' ' + k + ' is not shrill (' + (h * 100).toFixed(2) + '% above 2.5 kHz)');
        rms += s.rms / list.length;
    });
    moodRms[m] = rms;
    // the variants really differ
    if (list.length >= 2) {
        let diff = 0;
        const a = list[0].samples, b = list[1].samples;
        for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
        ok(diff / a.length > 0.005, 'alien-' + m + ' variants sound different');
    }
});
ok(moodRms.loud > moodRms.friendly && moodRms.loud > moodRms.curious, 'alien-loud is the loudest (' + Object.keys(moodRms).map(m => m + ' ' + moodRms[m].toFixed(3)).join(', ') + ')');
/** Median voice pitch (autocorrelation over loud 40 ms frames, 70-500 Hz). */
function medianPitch(x) {
    const W = Math.floor(0.04 * SR), lo = Math.floor(SR / 500), hi = Math.floor(SR / 70), out = [];
    let peak = 0;
    for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
    for (let s = 0; s + W + hi < x.length; s += W) {
        let e = 0;
        for (let i = 0; i < W; i++) e += x[s + i] * x[s + i];
        if (Math.sqrt(e / W) < peak * 0.15) continue;
        let best = 0, bestLag = 0;
        for (let L = lo; L <= hi; L++) {
            let c = 0, e2 = 0;
            for (let i = 0; i < W; i++) { c += x[s + i] * x[s + i + L]; e2 += x[s + i + L] * x[s + i + L]; }
            const r = c / Math.sqrt(e * e2 + 1e-12);
            if (r > best) { best = r; bestLag = L; }
        }
        if (best > 0.5) out.push(SR / bestLag);
    }
    out.sort((p, q) => p - q);
    return out[Math.floor(out.length / 2)] || 0;
}
const pitchOf = m => byName('alien-' + m).reduce((s, r) => s + medianPitch(r.samples), 0) / byName('alien-' + m).length;
const pGrumpy = pitchOf('grumpy'), pFriendly = pitchOf('friendly'), pCurious = pitchOf('curious'), pLoud = pitchOf('loud');
ok(pGrumpy > 60 && pGrumpy < 150, 'grumpy voices are low (' + pGrumpy.toFixed(0) + ' Hz)');
ok(pFriendly > pGrumpy * 1.6, 'friendly voices are high and bouncy (' + pFriendly.toFixed(0) + ' Hz)');
ok(pLoud < 400, 'loud voices are mid-pitched, not shrill (' + pLoud.toFixed(0) + ' Hz)');
console.log('alien pitch: friendly ' + pFriendly.toFixed(0) + ' Hz, curious ' + pCurious.toFixed(0) + ' Hz, grumpy ' + pGrumpy.toFixed(0) + ' Hz, loud ' + pLoud.toFixed(0) + ' Hz');

// Music: wrapped loops of 24 s, seamless, low, hiss-free, calm.
all.filter(r => r.loop).forEach(function (r) {
    const x = r.samples, xf = Math.round(r.xf * SR), n = x.length - xf, s = stats(x);
    ok(Math.abs(n / SR - 24) < 0.01, r.name + ' loop is 24 s (' + (n / SR).toFixed(2) + ')');
    let same = true;
    for (let i = 0; i < xf; i++) if (x[n + i] !== x[i]) { same = false; break; }
    ok(same, r.name + ' ends on a copy of its start (the players crossfade over it)');
    // the fold itself is smooth: the step from the last sample of the period to the first
    // is no bigger than the music's ordinary sample-to-sample movement
    let md = 0;
    for (let i = 1; i < n; i++) md = Math.max(md, Math.abs(x[i] - x[i - 1]));
    const seam = Math.abs(x[n - 1] - x[0]);
    ok(seam <= md * 1.05 + 1e-6, r.name + ' joins smoothly (seam ' + seam.toFixed(4) + ', max step ' + md.toFixed(4) + ')');
    // no big gaps of silence and no sudden loud spikes
    ok(s.rms > 0.02 && s.rms < 0.12, r.name + ' sits at a calm level (rms ' + s.rms.toFixed(3) + ')');
    ok(s.peak <= 0.22, r.name + ' never jumps out (peak ' + s.peak.toFixed(2) + ')');
    const h1 = shareAbove(x, 1200), h2 = shareAbove(x, 2500), m = highpassMedian(x, 3000);
    ok(h1 < 0.03, r.name + ' stays under 1.2 kHz (' + (h1 * 100).toFixed(2) + '% above)');
    ok(h2 < 0.003, r.name + ' has nothing shrill (' + (h2 * 100).toFixed(3) + '% above 2.5 kHz)');
    ok(m < 0.0002, r.name + ' has no hiss bed (median above 3 kHz ' + m.toFixed(6) + ')');
});
// One scale: the music's notes are all C D E G A (checked in the source: every note name used).
{
    const src = fs.readFileSync(path.join(GAME, 'js/sound.js'), 'utf8');
    const music = src.slice(src.indexOf("addMusic('amb-menu'"));
    const used = new Set((music.match(/'([A-G])\d'/g) || []).map(s => s[1]));
    ok([...used].every(l => 'CDEGA'.includes(l)), 'music keeps to C D E G A (' + [...used].sort().join(' ') + ')');
}

// Every sound and music name the game's other modules ask for exists.
const usedFx = new Set(), usedMusic = new Set();
fs.readdirSync(path.join(GAME, 'js')).filter(f => f.endsWith('.js') && f !== 'sound.js').forEach(function (f) {
    const src = fs.readFileSync(path.join(GAME, 'js', f), 'utf8');
    let m;
    const reA = /Sound\.play\(\s*'([a-z-]+)'(\s*\+)?/g, reB = /Sound\.setMusic\(\s*'([a-z-]+)'/g;
    while ((m = reA.exec(src))) {
        // 'alien-' + mood: every mood must exist.
        if (m[2]) ['friendly', 'curious', 'grumpy', 'loud'].forEach(x => usedFx.add(m[1] + x));
        else usedFx.add(m[1]);
    }
    // Names picked by a condition: Sound.play(dir > 0 ? 'faster' : 'slower', ...).
    const reC = /Sound\.play\([^,)]*\?\s*'([a-z-]+)'\s*:\s*'([a-z-]+)'/g;
    while ((m = reC.exec(src))) { usedFx.add(m[1]); usedFx.add(m[2]); }
    while ((m = reB.exec(src))) usedMusic.add(m[1]);
    // Music names are built from the star type in js/main.js: 'amb-' + type.
    if (/'amb-' \+/.test(src)) ['yellow', 'orange', 'red', 'blue', 'white', 'binary', 'nebula', 'blackhole'].forEach(x => usedMusic.add('amb-' + x));
});
usedFx.forEach(n => ok(Sound.NAMES.includes(n), 'the game\'s sound "' + n + '" exists'));
usedMusic.forEach(n => ok(Sound.MUSIC.includes(n), 'the game\'s music "' + n + '" exists'));

// --- the runtime, with a fake SafeAudio, fake <audio> and fake Settings -------------------------
(async function () {
    const played = [], preloaded = {};
    global.SafeAudio = {
        preload: (id, url) => { preloaded[id] = url; },
        play: (id, vol) => played.push({ id: id, vol: vol }),
        stop: () => {}, isEnabled: () => true
    };
    const els = [];
    global.Audio = class {
        constructor(url) { this.src = url; this.paused = true; this.currentTime = 0; this.volume = 1; this.ended = false; els.push(this); }
        play() { this.paused = false; return Promise.resolve(); }
        pause() { this.paused = true; }
    };
    let soundOn = true, vol = 0.8, mus = 0.6;
    global.NSE.Settings = { get: k => (k === 'sound' ? soundOn : undefined), volume: () => vol, musicVolume: () => mus };

    ok(Sound.play('chime') === false, 'play() before init returns false');
    Sound.setMusic('amb-nebula');   // asked for before it is built: it should jump the queue
    const i0 = Date.now();
    Sound.init();
    Sound.init();                   // twice is harmless
    while (Sound.status().built < Sound.status().total) await new Promise(r => setTimeout(r, 5));
    const initMs = Date.now() - i0, st = Sound.status();
    ok(st.loops.length === Sound.MUSIC.length, 'init built every music loop (' + st.loops.length + ')');
    ok(Sound.NAMES.every(n => st.sounds.includes(n)), 'init preloaded every one-shot');
    ok(Object.keys(preloaded).every(id => id.indexOf('nse-') === 0), 'SafeAudio names are all unique nse- names');

    played.length = 0;
    ok(Sound.play('chime') === true, 'play() returns true once built');
    ok(Math.abs(played[0].vol - 0.8) < 1e-9, 'play() uses the effects volume');
    Sound.play('chime', 0.5);
    ok(Math.abs(played[1].vol - 0.4) < 1e-9, 'play() scales by gain');
    ok(Sound.blip() === true && played[2].vol < 0.8, 'blip() plays softer than full volume');
    const seen = new Set();
    let repeats = 0, prev = null;
    for (let k = 0; k < 40; k++) { played.length = 0; Sound.play('alien-loud'); seen.add(played[0].id); if (played[0].id === prev) repeats++; prev = played[0].id; }
    ok(seen.size >= 2 && repeats === 0, 'alien variants vary and never repeat back to back (' + seen.size + ' used)');
    soundOn = false;
    ok(Sound.play('chime') === false, 'master off: play() returns false');
    soundOn = true;
    vol = 0;
    ok(Sound.play('chime') === false, 'effects volume 0: play() returns false');
    vol = 0.8;
    ok(Sound.sample() === true, 'sample() plays');
    ok(Sound.setMusic('nope') === false, 'unknown music is refused');

    // Music: nebula fades in, then a crossfade to deep, then off.
    const frames = (secs) => {
        for (let t = 0; t < secs; t += 1 / 30) {
            els.forEach(a => { if (!a.paused) { a.currentTime += 1 / 30; } });
            Sound.update(1 / 30);
        }
    };
    frames(4);
    let s = Sound.status();
    ok(s.playing.some(p => p.name === 'amb-nebula' && p.vol === 1), 'requested music faded fully in');
    frames(30);   // through a loop join
    const nebEls = els.slice(0, 2);
    ok(nebEls.some(a => !a.paused), 'the loop keeps playing through its join');
    Sound.setMusic('amb-deep');
    frames(1.5);
    s = Sound.status();
    const neb = s.playing.find(p => p.name === 'amb-nebula'), deep = s.playing.find(p => p.name === 'amb-deep');
    ok(neb && deep && neb.vol > 0.3 && neb.vol < 0.7 && deep.vol > 0.3 && deep.vol < 0.7, 'halfway through a ~3 s crossfade both loops are playing');
    frames(2);
    s = Sound.status();
    ok(!s.playing.some(p => p.name === 'amb-nebula') && s.playing.some(p => p.name === 'amb-deep'), 'after the crossfade only the new loop plays');
    mus = 0;
    frames(0.2);
    ok(Sound.status().playing.length === 0 && els.every(a => a.paused), 'music volume 0 pauses the music');
    mus = 0.6;
    frames(0.5);
    ok(Sound.status().playing.some(p => p.name === 'amb-deep'), 'music comes back when the volume returns');
    soundOn = false;
    frames(0.2);
    ok(els.every(a => a.paused), 'master off pauses the music');
    soundOn = true;
    frames(0.5);
    Sound.silence();
    ok(els.every(a => a.paused) && Sound.status().music === null, 'silence() stops everything');
    Sound.setMusic('amb-menu');
    frames(1);
    Sound.setMusic(null);
    frames(4);
    ok(els.every(a => a.paused), 'setMusic(null) fades all out');

    const bytes = all.reduce((sum, r) => sum + 44 + r.samples.length * 2, 0);
    console.log(all.length + ' sounds rendered (' + Sound.NAMES.length + ' one-shots, ' + Sound.MUSIC.length + ' music loops), ' +
        (bytes / 1048576).toFixed(1) + ' MB of WAV; _render ' + renderMs + ' ms, staggered init ' + initMs + ' ms wall (' + st.renderMs + ' ms rendering)');
    console.log('names used by the game: ' + [...usedFx].join(', ') + (usedMusic.size ? ' | music: ' + [...usedMusic].join(', ') : ''));
    console.log((checks - failures) + ' of ' + checks + ' checks passed');
    if (failures) process.exit(1);
})();
