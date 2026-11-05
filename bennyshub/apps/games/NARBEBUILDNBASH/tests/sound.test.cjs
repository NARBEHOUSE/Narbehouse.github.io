/**
 * NARBE Build n Bash - every synthesised sound renders, and every name used exists.
 *
 *   node tests/sound.test.cjs
 *
 * Runs js/sound.js in Node with SafeAudio, Blob and URL stubbed, renders every
 * recipe, and checks: no NaN, no silence, nothing clipped past 1, and that
 * every ctx.sound('name') in js/bashers.js and js/sim.js is a real family.
 * Also measures the frequent cues (blip, land, tok) stay short.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GAME = path.join(__dirname, '..');
const wavs = new Map();
global.window = global;
global.performance = global.performance || { now: () => Date.now() };
global.Blob = class { constructor(parts) { this.buf = parts[0]; } };
global.URL.createObjectURL = (blob) => { const id = 'blob:' + wavs.size; wavs.set(id, blob.buf); return id; };
const loaded = new Map();
global.SafeAudio = { preload: (name, url) => loaded.set(name, url), play: () => {} };
global.BNB = { Settings: { get: () => true, volume: () => 1 } };
vm.runInThisContext(fs.readFileSync(path.join(GAME, 'js/sound.js'), 'utf8'), { filename: 'sound.js' });

let failures = 0;
const fail = (m) => { failures++; console.log('  FAIL ' + m); };

// Render everything synchronously.
const real = global.setTimeout;
global.setTimeout = (fn) => fn();
BNB.Sound.init();
global.setTimeout = real;
const st = BNB.Sound.status();
console.log('rendered ' + st.built + ' of ' + st.total + ' recordings in ' + st.families.length + ' families');
if (st.built !== st.total) fail('not every recipe rendered');

const SR = 22050;
const info = {};
for (const [name, url] of loaded) {
    const buf = wavs.get(url);
    const view = new DataView(buf);
    const n = (buf.byteLength - 44) / 2;
    let peak = 0, nan = false;
    for (let i = 0; i < n; i++) { const v = view.getInt16(44 + i * 2, true) / 32767; if (Number.isNaN(v)) nan = true; peak = Math.max(peak, Math.abs(v)); }
    const fam = name.replace(/^bnb-/, '').replace(/-\d+$/, '');
    if (nan) fail(name + ' has NaN');
    if (peak < 0.05) fail(name + ' is silent');
    (info[fam] = info[fam] || []).push({ secs: n / SR, peak: peak });
}
// Frequent cues stay short and soft.
[['blip', 0.12], ['land-0', 0.35], ['land-1', 0.35], ['land-2', 0.35], ['land-3', 0.35], ['tok', 0.25]].forEach(([f, max]) => {
    (info[f] || []).forEach(r => { if (r.secs > max) fail(f + ' lasts ' + r.secs.toFixed(2) + 's'); if (r.peak > 0.5) fail(f + ' too loud (' + r.peak.toFixed(2) + ')'); });
    if (!info[f]) fail('missing ' + f);
});

// Every sound name the game asks for exists.
const used = new Set();
['js/bashers.js', 'js/sim.js', 'js/main.js'].forEach(file => {
    const src = fs.readFileSync(path.join(GAME, file), 'utf8');
    // Every quoted name inside a sound( ... ) call, ternaries included.
    for (const call of src.matchAll(/sound\(([^;]*?)\)\s*[;,)]/g)) {
        for (const m of call[1].matchAll(/'([a-z0-9-]+)'/g)) used.add(m[1]);
    }
    for (const m of src.matchAll(/name:\s*'([a-z0-9-]+)',\s*gain/g)) used.add(m[1]);
    for (const m of src.matchAll(/Sound\.play\(\s*'([a-z0-9-]+)'/g)) used.add(m[1]);
});
used.forEach(n => { if (!info[n]) fail('the game plays "' + n + '" but no such sound exists'); });
console.log('names used by the game: ' + Array.from(used).sort().join(', '));
console.log(failures ? '\n' + failures + ' problem(s)' : '\nall sound checks passed');
process.exit(failures ? 1 : 0);
