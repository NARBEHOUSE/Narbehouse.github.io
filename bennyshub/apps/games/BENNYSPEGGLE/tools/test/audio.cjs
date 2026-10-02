#!/usr/bin/env node
/**
 * Benny's P3GL — headless audio test (dev only).
 *
 * Renders every music track, every stinger, every sound effect (each mode
 * variant and each step of the parametric ones) and every peg note the three
 * modes can play, with exactly the code the game runs (js/audio.js loads
 * under node and exports its pure renderer), and measures each render.
 *
 * Fails (exit 1) on: NaN or Infinity; a peak above 0.98 (-0.2 dBFS; the
 * limiter aims for -1 dBFS); a silent render; a one-shot that does not end
 * on zero; a play volume that had to be capped below its target; a loop
 * whose seam is rougher than the rest of the loop; a WAV tail that is not a
 * copy of the loop's opening (the gapless player crossfades across it); a
 * track outside its length spec; music loudness outside -17..-11 dB; a
 * rendered song WAV over 8 MB; a render step longer than the slice budget
 * allows (see MAX_STEP_MS); a non-deterministic render; peg notes that leave
 * the scale, fall, or climb past the cap; music or effects that are too bright
 * (energy above 4.5 kHz, for sound-sensitive players); or the Web Audio constructor name
 * appearing anywhere in js/audio.js.
 *
 * Usage:  node tools/test/audio.cjs [--wav DIR] [--only SUBSTRING] [--quiet]
 *   --wav DIR   also write every render as a .wav for listening outside the game
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'js', 'audio.js');
const A = require(FILE);
const SR = A.SR;

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const WAV_DIR = opt('wav');
const ONLY = opt('only');
const QUIET = args.includes('--quiet');
if (WAV_DIR) fs.mkdirSync(WAV_DIR, { recursive: true });

// The browser renders in idle slices of at most 8 ms; one generator step must
// leave room for that. Node on a dev machine is about as fast as Chromium, so
// a step over 12 ms here means a real stall on a slower tablet.
const MAX_STEP_MS = 12;
const PEAK_MAX = 0.98;
const LOOP_LUFS = [-17, -11];
const STING_LUFS = [-15, -10];
const MAX_WAV_BYTES = 8 * 1024 * 1024;
// Brightness caps (share of energy above 4.5 kHz): this hub's players may be sound-sensitive.
const HF_MAX_MUSIC = 0.05, HF_MAX_SFX = 0.12;
const LEN_SPEC = {
  title: [45, 75], 'menu-cozy': [30, 45], 'menu-vivid': [30, 45], 'menu-hyper': [30, 45],
  'win-cozy': [3, 5], 'win-vivid': [3, 5], 'win-hyper': [3, 5], finale: [5, 7], lose: [2, 3], 'campaign-complete': [8, 10]
};
const lenSpec = (id) => LEN_SPEC[id] || [45, 75];

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const fmt = (x, d) => (isFinite(x) ? x.toFixed(d === undefined ? 1 : d) : String(x));
const failures = [], warnings = [];
const fail = (what, why) => failures.push(what + ': ' + why);
const ms = (t) => Number(process.hrtime.bigint() - t) / 1e6;

/* ── Measurements ────────────────────────────────────────────────────────── */

function stats(chs) {
  let peak = 0, ss = 0, bad = 0, n = 0;
  for (const x of chs) for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!isFinite(v)) { bad++; continue; }
    const a = Math.abs(v);
    if (a > peak) peak = a;
    ss += v * v; n++;
  }
  return { peak, rms: Math.sqrt(ss / Math.max(1, n)), bad };
}

/** Share of the energy above 4.5 kHz: how bright (and potentially piercing) a render is. */
function hfShare(chs) {
  let hi = 0, all = 0;
  for (const x of chs) {
    const bq = new A.Biquad().set('hp', 4500, 0.707);
    for (let i = 0; i < x.length; i++) { const y = bq.run(x[i]); hi += y * y; all += x[i] * x[i]; }
  }
  return all > 0 ? hi / all : 0;
}

/** Roughness at sample i of a ring: |second difference|, relative to its neighbourhood. */
function clickScore(x, i) {
  const n = x.length, at = (k) => x[((k % n) + n) % n];
  const d2 = (k) => Math.abs(at(k - 1) - 2 * at(k) + at(k + 1));
  const here = Math.max(d2(i), d2(i - 1));
  let s = 0, c = 0;
  for (let k = 8; k <= 256; k++) { s += d2(i - k) ** 2 + d2(i + k) ** 2; c += 2; }
  return here / (Math.sqrt(s / c) + 1e-7);
}
/** The seam (sample 0 of the ring) must be no rougher than the loop's own rough spots or other downbeats. */
function seamCheck(chs, barLines) {
  let worst = null, seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  for (const x of chs) {
    const seam = clickScore(x, 0), ref = [];
    for (let k = 0; k < 400; k++) ref.push(clickScore(x, 300 + Math.floor(rnd() * (x.length - 600))));
    ref.sort((p, q) => p - q);
    const p99 = ref[Math.floor(ref.length * 0.99)];
    let bars = 0;
    for (const i of barLines) bars = Math.max(bars, clickScore(x, i));
    const limit = Math.max(6, p99 * 1.5, bars * 1.25);
    const r = { seam, ref: Math.max(p99, bars), ok: seam <= limit, margin: seam / limit };
    if (!worst || r.margin > worst.margin) worst = r;
  }
  return worst;
}

/** The WAV the game plays for a loop: the loop followed by a copy of its opening. */
function tailCheck(chs, tailSec) {
  const tail = Math.round(tailSec * SR), bytes = A.wavBytes(chs, tail);
  const nc = chs.length, n = chs[0].length, pcm = new Int16Array(bytes, 44, (n + tail) * nc);
  for (let i = 0; i < tail * nc; i++) if (pcm[n * nc + i] !== pcm[i]) return { ok: false, bytes };
  return { ok: true, bytes };
}

function writeWav(name, bytes) {
  if (WAV_DIR) fs.writeFileSync(path.join(WAV_DIR, name.replace(/[^\w.@-]+/g, '_') + '.wav'), Buffer.from(bytes));
}

/** Render a song through its generator, timing every step. */
function renderSong(id) {
  const g = A.songGen(id), t0 = process.hrtime.bigint();
  let r, maxStep = 0, steps = 0;
  for (;;) {
    const t = process.hrtime.bigint();
    r = g.next();
    const d = ms(t);
    if (d > maxStep) maxStep = d;
    steps++;
    if (r.done) break;
  }
  return { r: r.value, ms: ms(t0), maxStep, steps };
}

const T0 = Date.now();
const rows = [];
const row = (kind, id, sec, st, extra, t) => rows.push({ kind, id, sec, peak: db(st.peak), rms: db(st.rms), extra, ms: t });

/* ── The forbidden API ───────────────────────────────────────────────────── */
const src = fs.readFileSync(FILE, 'utf8');
if (/AudioContext/.test(src)) fail('js/audio.js', 'mentions the Web Audio constructor');
if (!/const PREFIX = 'p3-'/.test(src)) fail('js/audio.js', "SafeAudio names are not prefixed 'p3-'");

/* ── Music: loops and stingers ───────────────────────────────────────────── */
const songs = A.songList();
const want = A.LOOP_IDS.concat(A.STINGER_IDS);
for (const id of want) if (!songs.find((s) => s.id === id)) fail('song ' + id, 'missing');
let songMs = 0, worstStep = { ms: 0, id: '' };
for (const s of songs) {
  if (ONLY && s.id.indexOf(ONLY) < 0) continue;
  const what = (s.oneShot ? 'stinger ' : 'track ') + s.id;
  if (!(s.bpm > 0) || !s.key || !Array.isArray(s.scale) || !s.scale.length) fail(what, 'needs bpm, key and scale');
  let R;
  try { R = renderSong(s.id); } catch (e) { fail(what, e.message); continue; }
  songMs += R.ms;
  if (R.maxStep > worstStep.ms) worstStep = { ms: R.maxStep, id: s.id };
  const r = R.r, st = stats(r.chs), loud = A.loudness(r.chs, s.oneShot ? 1 : 0), hf = hfShare(r.chs);
  const sec = s.oneShot ? r.sec : r.loopSec, spec = lenSpec(s.id);
  if (st.bad) fail(what, st.bad + ' NaN/Infinity samples');
  if (st.peak > PEAK_MAX) fail(what, 'peak ' + fmt(db(st.peak), 2) + ' dBFS');
  if (st.peak < 0.05) fail(what, 'nearly silent');
  if (sec < spec[0] - 0.05 || sec > spec[1] + 0.05) fail(what, fmt(sec) + ' s is outside ' + spec[0] + '-' + spec[1] + ' s');
  const win = s.oneShot ? STING_LUFS : LOOP_LUFS;
  if (loud < win[0] || loud > win[1]) fail(what, 'loudness ' + fmt(loud) + ' dB outside ' + win[0] + '..' + win[1]);
  if (R.maxStep > MAX_STEP_MS) fail(what, 'a render step took ' + fmt(R.maxStep) + ' ms');
  if (hf > HF_MAX_MUSIC) fail(what, 'too bright: ' + (hf * 100).toFixed(1) + '% of its energy above 4.5 kHz');
  let extra = 'LU ' + fmt(loud).padStart(5) + '  hf ' + (hf * 100).toFixed(1).padStart(4) + '%  step ' + fmt(R.maxStep).padStart(4) + 'ms';
  if (!s.oneShot) {
    const tc = tailCheck(r.chs, A.SONG_TAIL);
    if (!tc.ok) fail(what, 'WAV tail is not a copy of the loop opening');
    if (tc.bytes.byteLength > MAX_WAV_BYTES) fail(what, 'WAV is ' + (tc.bytes.byteLength / 1048576).toFixed(1) + ' MB');
    const barLen = r.chs[0].length / s.bars, lines = [];
    for (let b = 1; b < s.bars; b++) lines.push(Math.round(b * barLen));
    const sc = seamCheck(r.chs, lines);
    if (!sc.ok) fail(what, 'seam click (score ' + fmt(sc.seam, 2) + ' vs ' + fmt(sc.ref, 2) + ')');
    extra += '  seam ' + fmt(sc.seam, 1) + '/' + fmt(sc.ref, 1) + '  wav ' + (tc.bytes.byteLength / 1048576).toFixed(1) + 'MB';
    writeWav('song-' + s.id, tc.bytes);
  } else {
    const end = Math.max(...r.chs.map((x) => Math.abs(x[x.length - 1])));
    if (end > 1e-3) fail(what, 'does not end on silence');
    writeWav('sting-' + s.id, A.wavBytes(r.chs, 0));
  }
  row(s.oneShot ? 'sting' : 'loop', s.id, sec, st, s.bpm + 'bpm ' + s.key.padEnd(10) + extra, R.ms);
}

// Determinism: the browser and this test must hear the same bytes.
if (!ONLY) {
  const a = A.renderSong('menu-cozy').chs[0], b = A.renderSong('menu-cozy').chs[0];
  let same = a.length === b.length;
  for (let i = 0; same && i < a.length; i += 7) if (a[i] !== b[i]) same = false;
  if (!same) fail('menu-cozy', 'two renders differ');
}

/* ── Sound effects ───────────────────────────────────────────────────────── */
let sfxMs = 0, sfxCount = 0, worstSfx = { ms: 0, id: '' };
for (const s of A.sfxList()) {
  if (ONLY && s.name.indexOf(ONLY) < 0) continue;
  let r, t;
  try {
    A.renderSfx(s.name);                     // warm the JIT, then time the render the game would do
    const t0 = process.hrtime.bigint();
    r = A.renderSfx(s.name);
    t = ms(t0);
  } catch (e) { fail('sfx ' + s.name, e.message); continue; }
  sfxMs += t; sfxCount++;
  if (t > worstSfx.ms) worstSfx = { ms: t, id: s.name };
  const st = stats(r.chs), eff = r.loud + db(r.vol), what = 'sfx ' + s.name;
  if (st.bad) fail(what, st.bad + ' NaN/Infinity samples');
  if (st.peak > PEAK_MAX) fail(what, 'peak ' + fmt(db(st.peak), 2) + ' dBFS');
  if (st.peak < 0.05) fail(what, 'silent');
  if (Math.abs(r.chs[0][r.chs[0].length - 1]) > 1e-4) fail(what, 'does not end on zero');
  if (r.vol >= 0.999 && eff < r.level - 1) fail(what, 'volume capped: lands at ' + fmt(eff) + ' dB for ' + r.level);
  if (t > MAX_STEP_MS) fail(what, 'render took ' + fmt(t) + ' ms (one slice)');
  const hf = hfShare(r.chs);
  if (hf > HF_MAX_SFX) fail(what, 'too bright: ' + (hf * 100).toFixed(1) + '% of its energy above 4.5 kHz');
  row('sfx', s.name, s.sec, st, 'lvl ' + String(r.level).padStart(4) + '  vol ' + r.vol.toFixed(2) + '  hf ' + (hf * 100).toFixed(1) + '%', t);
  writeWav('sfx-' + s.name, A.wavBytes(r.chs, 0));
}

/* ── Pegs: the scale logic, then every note each mode can play ───────────── */
const pegNotes = new Set();
for (const id of A.LOOP_IDS) {
  const meta = A.songMeta(id), list = A.pegScale(id), what = 'pegs ' + id;
  const pc0 = list[0] % 12;
  for (let i = 1; i < list.length; i++) if (list[i] <= list[i - 1]) fail(what, 'scale notes do not ascend');
  if (list[list.length - 1] > 98) fail(what, 'climbs past D7');
  if (list[list.length - 1] - list[0] > 36) fail(what, 'spans more than three octaves');
  if (list[0] < 60 || list[0] > 71) fail(what, 'root ' + list[0] + ' is not in C4..B4');
  for (const m of list) if (meta.scale.indexOf(((m - pc0) % 12 + 12) % 12) < 0) fail(what, 'note ' + m + ' is outside the scale');
  const top = list[list.length - 1];
  let prev = -1;
  for (let c = 1; c <= 60; c++) {
    const m = A.pegMidi(id, c);
    if (c <= list.length && m <= prev) fail(what, 'chain ' + c + ' does not climb');
    if (c > list.length && (m > top || m <= top - 12)) fail(what, 'chain ' + c + ' leaves the top octave');
    prev = m;
    pegNotes.add(m);
  }
}
let pegMs = 0, pegCount = 0;
for (const mode of A.PEG_MODES) {
  for (const m of Array.from(pegNotes).sort((a, b) => a - b)) {
    if (ONLY && ('peg:' + mode).indexOf(ONLY) < 0) continue;
    const t0 = process.hrtime.bigint(), r = A.renderPeg(mode, m), t = ms(t0);
    pegMs += t; pegCount++;
    const st = stats(r.chs), what = 'peg ' + mode + ' ' + m;
    if (st.bad) fail(what, 'NaN/Infinity');
    if (st.peak > PEAK_MAX) fail(what, 'peak ' + fmt(db(st.peak), 2) + ' dBFS');
    if (Math.abs(r.chs[0][r.chs[0].length - 1]) > 1e-4) fail(what, 'does not end on zero');
    if (r.vol >= 0.999 && r.loud < r.level - 1) fail(what, 'volume capped');
    if (t > MAX_STEP_MS) fail(what, 'render took ' + fmt(t) + ' ms');
    writeWav('peg-' + mode + '-' + m, A.wavBytes(r.chs, 0));
  }
  // A few chain positions over the title track, for the table.
  for (const c of [1, 5, 10, 16, 30]) {
    const m = A.pegMidi('title', c), r = A.renderPeg(mode, m);
    row('peg', mode + ' chain ' + c + ' (midi ' + m + ')', r.sec, stats(r.chs), 'vol ' + r.vol.toFixed(2), 0);
  }
}

/* ── Report ──────────────────────────────────────────────────────────────── */
const TOTAL = Date.now() - T0;
const show = rows.filter((r) => !QUIET || r.kind !== 'sfx');
console.log('kind   id                               sec   peak dB  RMS dB   ms     notes');
for (const r of show) {
  console.log(r.kind.padEnd(6) + ' ' + r.id.padEnd(30) + ' ' + fmt(r.sec).padStart(6) + ' ' + fmt(r.peak, 2).padStart(8) + ' ' +
    fmt(r.rms).padStart(7) + ' ' + (r.ms ? fmt(r.ms, 0) : '').padStart(6) + '   ' + r.extra);
}
console.log('');
console.log('songs: ' + rows.filter((r) => r.kind === 'loop').length + ' loops + ' + rows.filter((r) => r.kind === 'sting').length +
  ' stingers rendered in ' + fmt(songMs / 1000, 2) + ' s; longest render step ' + fmt(worstStep.ms, 1) + ' ms (' + worstStep.id + ')');
console.log('sfx:   ' + sfxCount + ' sounds in ' + fmt(sfxMs, 0) + ' ms; slowest ' + worstSfx.id + ' ' + fmt(worstSfx.ms, 1) + ' ms');
console.log('pegs:  ' + pegCount + ' notes (' + pegNotes.size + ' pitches x ' + A.PEG_MODES.length + ' modes) in ' + fmt(pegMs, 0) + ' ms');
console.log('total: ' + fmt(TOTAL / 1000, 1) + ' s' + (WAV_DIR ? '; WAVs written to ' + WAV_DIR : ''));
for (const w of warnings) console.log('warning: ' + w);
if (failures.length) {
  console.log('\nFAILED (' + failures.length + '):');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log('\nPASS');
