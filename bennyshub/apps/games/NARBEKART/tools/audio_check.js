#!/usr/bin/env node
/**
 * NARBE Racer — headless audio check (dev only).
 *
 * Renders every one-shot (and each pre-panned variant), every loop and every
 * song with exactly the code the game runs — js/audio.js is require()-able —
 * and measures each render:
 *   duration · peak and RMS (dBFS) · loudness (K-weighted: loudest 250 ms for
 *   effects, whole loop for loops and songs) · the play volume the game will
 *   use and the level that lands at · DC offset · clipped samples · NaN
 *   · loop-seam continuity · render time.
 *
 * It fails (exit 1) on: NaN or Infinity, any clipped sample, a render that is
 * silent, a one-shot that does not end on zero, a play volume that had to be
 * capped below its target, a loop whose seam is rougher than the rest of the
 * loop, a WAV tail that is not a copy of the loop's opening, a song outside
 * 30–50 s, or the forbidden audio API appearing in any of the audio files.
 *
 * The seam test: the second difference (x[i-1] - 2x[i] + x[i+1], which is
 * near zero for anything smooth and large for a click) is taken across the
 * seam and compared with the same measure at 400 random points of the same
 * loop, each relative to the roughness of its own neighbourhood. A clean seam
 * is indistinguishable from any other point of the loop.
 *
 * Usage:  node tools/audio_check.js [--wav DIR] [--only SUBSTRING] [--quiet]
 *   --wav DIR   also write every render as a .wav (for listening outside the game)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const A = require(path.join(HERE, '..', 'js', 'audio.js'));
const SR = A.SR;

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const WAV_DIR = opt('wav');
const ONLY = opt('only');
const QUIET = args.includes('--quiet');
if (WAV_DIR) fs.mkdirSync(WAV_DIR, { recursive: true });

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const fmt = (x, d) => (isFinite(x) ? x.toFixed(d === undefined ? 1 : d) : String(x));
const failures = [];
const rows = [];

/* ── Measurements ────────────────────────────────────────────────────────── */

function basicStats(chs) {
  let peak = 0, ss = 0, bad = 0, clip = 0, n = 0;
  const dc = [];
  for (const x of chs) {
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (!isFinite(v)) { bad++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.9999) clip++;
      ss += v * v; sum += v; n++;
    }
    dc.push(sum / x.length);
  }
  return { peak, rms: Math.sqrt(ss / Math.max(1, n)), bad, clip, dc: Math.max(...dc.map(Math.abs)) };
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

/**
 * Seam score against the same score elsewhere in the loop: 400 random points
 * (a fixed seed, so runs repeat) and, for songs, every other bar line — the
 * loop starts on a downbeat, where a kick and new notes begin, so the fair
 * comparison for the seam is the other downbeats.
 */
function seamCheck(chs, barLines) {
  let worst = null;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  for (const x of chs) {
    const seam = clickScore(x, 0);
    const ref = [];
    for (let k = 0; k < 400; k++) ref.push(clickScore(x, 300 + Math.floor(rnd() * (x.length - 600))));
    ref.sort((p, q) => p - q);
    const p99 = ref[Math.floor(ref.length * 0.99)];
    let bars = 0;
    if (barLines) for (const i of barLines) bars = Math.max(bars, clickScore(x, i));
    // A seam passes when it is no rougher than the loop's own 99th-percentile
    // point, or than its roughest other downbeat.
    const limit = Math.max(6, p99 * 1.5, bars * 1.25);
    const r = { seam, ref: Math.max(p99, bars), ok: seam <= limit, margin: seam / limit };
    if (!worst || r.margin > worst.margin) worst = r;
  }
  return worst;
}

/** The WAV the game plays: the loop followed by a copy of its opening. Check the copy is exact. */
function tailCheck(chs, tailSec) {
  const tail = Math.round(tailSec * SR);
  const bytes = A.wavBytes(chs, tail);
  const nc = chs.length, n = chs[0].length, pcm = new Int16Array(bytes, 44, (n + tail) * nc);
  for (let i = 0; i < tail * nc; i++) if (pcm[n * nc + i] !== pcm[i]) return { ok: false, bytes };
  return { ok: true, bytes };
}

function writeWav(name, bytes) {
  if (!WAV_DIR) return;
  fs.writeFileSync(path.join(WAV_DIR, name.replace(/[^\w.@-]+/g, '_') + '.wav'), Buffer.from(bytes));
}

function record(kind, name, chs, extra) {
  const st = basicStats(chs);
  const row = Object.assign({ kind, name, sec: chs[0].length / SR, ch: chs.length, peakDb: db(st.peak), rmsDb: db(st.rms), dc: st.dc, clip: st.clip, bad: st.bad }, extra);
  const fail = (why) => { failures.push(kind + ' ' + name + ': ' + why); row.fail = (row.fail ? row.fail + '; ' : '') + why; };
  if (st.bad) fail(st.bad + ' NaN/Infinity samples');
  if (st.clip) fail(st.clip + ' clipped samples');
  if (st.peak > A.CEIL + 0.002) fail('peak ' + fmt(db(st.peak), 2) + ' dBFS is above -1 dBFS');
  if (st.peak < 0.02) fail('silent (peak ' + fmt(db(st.peak)) + ' dBFS)');
  if (st.dc > 0.005) fail('DC offset ' + st.dc.toFixed(4));
  rows.push(row);
  return row;
}

/* ── One-shots ───────────────────────────────────────────────────────────── */
const T0 = Date.now();
let sfxMs = 0, sfxCount = 0;
for (const s of A.sfxList()) {
  const sides = [''].concat(s.pans ? s.pans.split('') : []);
  for (const side of sides) {
    const key = s.name + (side ? '@' + side : '');
    if (ONLY && key.indexOf(ONLY) < 0) continue;
    const t = process.hrtime.bigint();
    const r = A.renderSfx(s.name, side);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    sfxMs += ms; sfxCount++;
    const eff = r.loud + db(r.vol);
    const row = record('sfx', key, r.chs, { ms, loud: r.loud, vol: r.vol, level: r.level, eff, crit: r.crit });
    const endAbs = Math.max(...r.chs.map((x) => Math.abs(x[x.length - 1])));
    if (endAbs > 1e-4) { failures.push('sfx ' + key + ': does not end on zero (' + endAbs.toExponential(2) + ')'); row.fail = 'end ' + endAbs.toExponential(2); }
    if (r.vol >= 0.999 && eff < r.level - 0.5) { failures.push('sfx ' + key + ': volume capped, lands at ' + fmt(eff) + ' dB for a ' + r.level + ' dB target'); row.fail = 'vol capped'; }
    writeWav('sfx-' + key, A.wavBytes(r.chs, 0));
  }
}

/* ── Loops ───────────────────────────────────────────────────────────────── */
let loopMs = 0;
for (const l of A.loopList()) {
  for (const side of l.simple ? [''] : ['', 'L', 'R']) {
    const key = l.name + (side ? '@' + side : '');
    if (ONLY && key.indexOf(ONLY) < 0) continue;
    const t = process.hrtime.bigint();
    const r = A.renderLoop(l.name, side);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    loopMs += ms;
    const extra = { ms, loud: r.loud, vol: r.vol, level: r.level, eff: r.loud + db(r.vol) };
    if (!r.simple) {
      const sc = seamCheck(r.chs), tc = tailCheck(r.chs, r.tail);
      Object.assign(extra, { seam: sc.seam, seamRef: sc.ref });
      const row = record('loop', key, r.chs, extra);
      if (!sc.ok) { failures.push('loop ' + key + ': seam click (score ' + fmt(sc.seam, 2) + ' vs loop p99 ' + fmt(sc.ref, 2) + ')'); row.fail = 'seam'; }
      if (!tc.ok) { failures.push('loop ' + key + ': WAV tail is not a copy of the opening'); row.fail = 'tail'; }
      writeWav('loop-' + key, tc.bytes);
    } else {
      record('loop', key, r.chs, extra);
      writeWav('loop-' + key, A.wavBytes(r.chs, 0));
    }
  }
}

/* ── Songs ───────────────────────────────────────────────────────────────── */
let songMs = 0;
for (const s of A.songList()) {
  if (ONLY && s.id.indexOf(ONLY) < 0) continue;
  const t = process.hrtime.bigint();
  let r;
  try { r = A.renderSong(s.id); } catch (e) { failures.push('song ' + s.id + ': ' + e.message); continue; }
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  songMs += ms;
  const barLen = r.chs[0].length / s.bars, lines = [];
  for (let b = 1; b < s.bars; b++) lines.push(Math.round(b * barLen));
  const loud = A.loudness(r.chs, 0), sc = seamCheck(r.chs, lines);
  const tailSec = s.hidden ? A.STAR_TAIL : A.SONG_TAIL, tc = tailCheck(r.chs, tailSec);
  const row = record('song', s.id, r.chs, { ms, loud, seam: sc.seam, seamRef: sc.ref, bpm: s.bpm, bars: s.bars });
  if (!sc.ok) { failures.push('song ' + s.id + ': seam click (score ' + fmt(sc.seam, 2) + ' vs loop p99 ' + fmt(sc.ref, 2) + ')'); row.fail = 'seam'; }
  if (!tc.ok) { failures.push('song ' + s.id + ': WAV tail is not a copy of the opening'); row.fail = 'tail'; }
  if (!s.hidden && (r.sec < 30 || r.sec > 50)) { failures.push('song ' + s.id + ': ' + fmt(r.sec) + ' s is outside 30-50 s'); row.fail = 'length'; }
  writeWav('song-' + s.id, tc.bytes);
}
const TOTAL = Date.now() - T0;

/* ── The forbidden API: prove none of the audio files mention it ─────────── */
const BANNED = new RegExp(['Audio' + 'Context', 'webkit' + 'Audio' + 'Context', 'create' + 'Oscillator', 'decode' + 'Audio' + 'Data'].join('|'));
const mine = [path.join(HERE, '..', 'js', 'audio.js'), path.join(HERE, 'audio_check.js'), path.join(HERE, 'audio_lab.html')];
const harnessDir = path.join(HERE, 'harness');
if (fs.existsSync(harnessDir)) for (const f of fs.readdirSync(harnessDir)) if (/^audio-.*\.cjs$/.test(f)) mine.push(path.join(harnessDir, f));
const grep = [];
for (const f of mine) {
  if (!fs.existsSync(f)) continue;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => { if (BANNED.test(line)) grep.push(path.basename(f) + ':' + (i + 1)); });
}
if (grep.length) failures.push('forbidden audio API found: ' + grep.join(', '));

/* ── Report ──────────────────────────────────────────────────────────────── */
if (!QUIET) {
  const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
  const lpad = (s, n) => (' '.repeat(n) + String(s)).slice(-n);
  console.log(pad('kind', 5) + pad('name', 24) + lpad('sec', 6) + lpad('ch', 3) + lpad('peak', 7) + lpad('rms', 7) + lpad('loud', 7) +
    lpad('vol', 6) + lpad('lands', 7) + lpad('dc', 8) + lpad('seam', 12) + lpad('ms', 7) + '  ' + 'status');
  for (const r of rows) {
    console.log(pad(r.kind, 5) + pad(r.name, 24) + lpad(fmt(r.sec, 2), 6) + lpad(r.ch, 3) + lpad(fmt(r.peakDb), 7) + lpad(fmt(r.rmsDb), 7) +
      lpad(r.loud !== undefined ? fmt(r.loud) : '', 7) + lpad(r.vol !== undefined ? fmt(r.vol, 2) : '', 6) + lpad(r.eff !== undefined ? fmt(r.eff) : '', 7) +
      lpad(r.dc.toExponential(0), 8) + lpad(r.seam !== undefined ? fmt(r.seam, 1) + '/' + fmt(r.seamRef, 1) : '', 12) + lpad(fmt(r.ms, 1), 7) +
      '  ' + (r.fail ? 'FAIL ' + r.fail : 'ok'));
  }
}
console.log('\nrendered ' + sfxCount + ' one-shots in ' + fmt(sfxMs, 0) + ' ms, ' + rows.filter((r) => r.kind === 'loop').length +
  ' loops in ' + fmt(loopMs, 0) + ' ms, ' + rows.filter((r) => r.kind === 'song').length + ' songs in ' + fmt(songMs, 0) + ' ms (total ' + TOTAL + ' ms)');
const songsRows = rows.filter((r) => r.kind === 'song');
if (songsRows.length) {
  const L = songsRows.map((r) => r.loud);
  console.log('song loudness ' + fmt(Math.min(...L)) + ' … ' + fmt(Math.max(...L)) + ' dB, peaks ' +
    fmt(Math.min(...songsRows.map((r) => r.peakDb))) + ' … ' + fmt(Math.max(...songsRows.map((r) => r.peakDb))) + ' dBFS, slowest ' +
    fmt(Math.max(...songsRows.map((r) => r.ms)), 0) + ' ms');
}
console.log('forbidden-API grep over ' + mine.filter((f) => fs.existsSync(f)).length + ' audio files: ' + (grep.length ? grep.length + ' hits' : 'none'));
if (failures.length) {
  console.log('\nFAILED (' + failures.length + '):\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
