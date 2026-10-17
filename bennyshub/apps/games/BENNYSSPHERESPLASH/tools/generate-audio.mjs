/**
 * Benny's Sphere Splash - every sound effect, the crowd and the music, synthesised offline.
 * Run from the game folder:  node tools/generate-audio.mjs
 *
 * Writes plain 16-bit PCM WAV (22,050 Hz, stereo) into audio/sfx, audio/crowd and audio/music,
 * and js/audio-files.generated.js (the music loop's length, for the gapless player in js/audio.js).
 * No recordings, samples, downloads or network: the recipes below are the whole source.
 *
 * Bryan picked every sound in listening rounds (2026-10-03), three options at a time:
 *   crowd   - the murmur and goal roar from the "behind the glass" crowd (Robot Football's
 *             noise-voice recipe, heard from inside the water sphere), with the sung "ooh"
 *             (danger) and "aww" (save) from the hummed, hiss-free crowd.
 *   sfx     - the "underwater" set: bloops, soft thumps and bubble trails.
 *   music   - the "island" menu theme (steel drum, marimba) and the "anthem" stings (synth brass).
 * Each recipe starts from the random seed it had in its listening round, so these files are
 * byte-for-byte the ones Bryan heard. Change a recipe and that is no longer true - listen again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 22050, TAU = Math.PI * 2;

let seed = 1;
function random() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
const noise = () => random() * 2 - 1;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = k => { k = clamp01(k); return k * k * (3 - 2 * k); };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

/* ══ shared building blocks ═════════════════════════════════════════════ */
const make = dur => [new Float32Array(Math.ceil(dur * RATE)), new Float32Array(Math.ceil(dur * RATE))];
function add(snd, start, dur, fn, gain = 1, pan = 0) {
  const b = Math.floor(start * RATE), e = Math.min(snd[0].length, Math.ceil((start + dur) * RATE));
  const l = Math.sqrt((1 - pan) / 2), r = Math.sqrt((1 + pan) / 2);
  for (let i = Math.max(0, b); i < e; i++) { const v = fn((i - b) / RATE) * gain; snd[0][i] += v * l; snd[1][i] += v * r; }
}
const lowPass = cut => { const a = 1 - Math.exp(-TAU * cut / RATE); let y = 0; return v => (y += (v - y) * a); };
/** A two-pole resonator whose centre can move every sample (a vowel that changes). */
function resonator(bw) {
  const rad = Math.exp(-Math.PI * bw / RATE); let y1 = 0, y2 = 0;
  return (v, f) => { const y = (1 - rad) * v + 2 * rad * Math.cos(TAU * f / RATE) * y1 - rad * rad * y2; y2 = y1; y1 = y; return y; };
}
/** Sparse early reflections: a big stadium (crowd) or a small room (effects). */
function reflect(snd, g, taps) {
  for (const ch of snd) for (const [s, a] of taps.map(([s, k]) => [s, g * k])) {
    const d = Math.floor(s * RATE); for (let i = ch.length - 1; i >= d; i--) ch[i] += ch[i - d] * a;
  }
}
const stadium = (snd, g) => reflect(snd, g, [[0.071, 1], [0.113, 0.65], [0.173, 0.4], [0.247, 0.22]]);
const room = (snd, g) => reflect(snd, g, [[0.053, 1], [0.089, 0.6], [0.131, 0.38], [0.197, 0.2]]);
function shape(snd, env) { for (const ch of snd) for (let i = 0; i < ch.length; i++) ch[i] *= env(i / RATE); }
const fades = (dur, a, r) => t => clamp01(t / a) * clamp01((dur - t) / r);
function loopSeam(snd, len = 0.25) {
  const n = Math.floor(len * RATE);
  return snd.map(ch => { const r = ch.slice(0, ch.length - n); for (let i = 0; i < n; i++) { const a = 0.5 - 0.5 * Math.cos(Math.PI * i / n); r[i] = ch[ch.length - n + i] * (1 - a) + ch[i] * a; } return r; });
}

/* ══ the crowd ══════════════════════════════════════════════════════════ */
/** Noise voices: vowel-shaped breath (Robot Football's recipe), a low wash and applause. */
function noiseCrowd(dur, o) {
  const snd = make(dur);
  for (let v = 0; v < o.voices; v++) {
    const pan = noise() * 0.95, k = 0.75 + random() * 0.55, r1 = resonator(110 + random() * 150), r2 = resonator(220);
    const br = lowPass(o.breath), ph = random() * TAU, rate = 0.18 + random() * 0.52, k2 = 0.9 + random() * 0.25;
    add(snd, 0, dur, t => {
      const x = br(noise()), rise = (1 - o.sway) + o.sway * Math.pow(0.5 + 0.5 * Math.sin(t * TAU * rate + ph), 2);
      return (r1(x, o.f1(t) * k) * 0.7 + r2(x, o.f2(t) * k * k2) * 0.3) * rise * o.amp(t);
    }, 0.2, pan);
  }
  for (let c = 0; c < 2; c++) { const w = lowPass(180); for (let i = 0; i < snd[c].length; i++) snd[c][i] += w(noise()) * o.wash * o.amp(i / RATE); }
  for (let s = 0.05; s < dur;) {
    const rate = o.claps(s); if (rate <= 0) { s += 0.1; continue; }
    const hit = lowPass(o.clapCut * (0.7 + random() * 0.6));
    add(snd, s, 0.12, t => hit(noise()) * Math.exp(-t * 50), (0.1 + random() * 0.16), noise());
    s += (0.5 + random()) / rate;
  }
  return snd;
}
/** Behind the glass: the stadium crowd heard from inside the water sphere (darker, softer). */
const GLASS = { voices: 36, breath: 800, wash: 0.16, clapCut: 900, sway: 0.5 };
function glassFinish(s) {
  for (const ch of s) { const f = lowPass(750), g = lowPass(750), h = lowPass(750); for (let i = 0; i < ch.length; i++) ch[i] = h(g(f(ch[i]))); }
  stadium(s, 0.3);
  return s;
}
/** Hummed voices, no noise anywhere: harmonics of a speech-like pitch through two vowel resonators. */
function humCrowd(dur, o) {
  const snd = make(dur);
  for (let v = 0; v < o.voices; v++) {
    const pan = noise() * 0.95, low = random() < 0.5;
    const base = low ? 95 + random() * 60 : 175 + random() * 90;
    const r1 = resonator(90), r2 = resonator(160);
    const ip = [random() * TAU, random() * TAU, random() * TAU], ir = [0.3 + random() * 0.5, 0.9 + random() * 0.8, 3 + random() * 2.5];
    const vk = 0.85 + random() * 0.3, late = random() * 0.25;
    let ph = 0;
    add(snd, 0, dur, t => {
      const tt = Math.max(0, t - late * o.spreadOnset);
      const inton = 1 + o.talk * (0.07 * Math.sin(TAU * ir[0] * t + ip[0]) + 0.04 * Math.sin(TAU * ir[1] * t + ip[1]));
      const f = base * inton * o.pitch(tt) * (1 + 0.012 * Math.sin(TAU * 5.3 * t + ip[2]));
      ph += TAU * f / RATE;
      let x = 0; for (let h = 1; h <= 7; h++) x += Math.sin(ph * h) / h;
      const syl = 1 - o.talk * 0.75 * Math.pow(0.5 + 0.5 * Math.sin(TAU * ir[2] * t + ip[1]), 3);
      const vow = o.talk * 0.18 * Math.sin(TAU * ir[0] * 1.7 * t + ip[2]);
      return (r1(x, o.f1(tt) * vk * (1 + vow)) * 0.75 + r2(x, o.f2(tt) * vk * (1 - vow)) * 0.35) * syl * o.amp(tt);
    }, 0.06, pan);
  }
  return snd;
}
function humFinish(s) {
  for (const ch of s) { const f = lowPass(2400), g = lowPass(2400), h = lowPass(2400); for (let i = 0; i < ch.length; i++) ch[i] = h(g(f(ch[i]))); }
  stadium(s, 0.24);
  return s;
}
const HUM = { voices: 44, spreadOnset: 0, talk: 1, pitch: () => 1 };

const CROWD = {
  // The murmur under every match: a 10 s loop.
  bed: [0x4fe3a001, () => loopSeam(glassFinish(noiseCrowd(10.25, Object.assign({}, GLASS, { f1: () => 470, f2: () => 1150, amp: () => 1, claps: () => 2.5 }))))],
  // Danger: a sung "ooooh" that rises as a shot goes in.
  swell: [0x8f14ab3e, () => {
    const s = humFinish(humCrowd(3.2, Object.assign({}, HUM, { talk: 0.15, spreadOnset: 1, pitch: t => 1 + 0.32 * smooth(t / 2.6), f1: t => lerp(330, 430, t / 3.2), f2: t => lerp(760, 900, t / 3.2), amp: t => 0.3 + 0.9 * smooth(t / 2.4) })));
    shape(s, fades(3.2, 0.25, 0.7)); return s;
  }],
  // A goal: an open "aaay" roar with applause, settling back.
  roar: [0xa4da63c5, () => {
    const s = glassFinish(noiseCrowd(4.6, Object.assign({}, GLASS, { sway: 0.25, voices: 48, f1: () => 720, f2: () => 1650, amp: t => t < 0.18 ? t / 0.18 * 1.6 : 1.6 - 0.75 * smooth((t - 0.6) / 3.6), claps: t => t > 0.25 ? 26 - t * 4 : 0 })));
    shape(s, fades(4.6, 0.04, 1.2)); return s;
  }],
  // A save or a miss: a sung, falling "awww".
  groan: [0xabb90412, () => {
    const s = humFinish(humCrowd(2.4, Object.assign({}, HUM, { talk: 0.1, spreadOnset: 0.5, pitch: t => lerp(1.2, 0.86, smooth(t / 2.2)), f1: t => lerp(640, 480, t / 2.4), f2: t => lerp(1050, 830, t / 2.4), amp: t => t < 0.15 ? t / 0.15 : 1 - 0.7 * smooth((t - 0.3) / 2) })));
    shape(s, fades(2.4, 0.06, 0.6)); return s;
  }],
};
// The crowd's bed in the old crowd loudness (RMS) terms; the reactions a little louder.
const CROWD_RMS = { bed: 0.07, swell: 0.13, roar: 0.13, groan: 0.13 };

/* ══ match sounds: the underwater set ═══════════════════════════════════ */
const env = (t, dur, a = 0.004, r = 0.05) => clamp01(t / a) * clamp01((dur - t) / r);
function sweep(f, wave = Math.sin) { let ph = 0; return t => { ph += TAU * f(t) / RATE; return wave(ph); }; }
const nasal = ph => Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.33 * Math.sin(3 * ph) + 0.25 * Math.sin(4 * ph) + 0.2 * Math.sin(5 * ph);
function muffle(snd, cut) { for (const ch of snd) { const f = lowPass(cut), g = lowPass(cut); for (let i = 0; i < ch.length; i++) ch[i] = g(f(ch[i])); } }
/** One underwater bubble: a sine whose pitch rises as it dies away (no noise). */
function bubble(snd, start, f0, gain = 0.3, pan = 0) {
  const dur = 0.05 + 18 / f0, s = sweep(t => f0 * (1 + 1.6 * t / dur));
  add(snd, start, dur, t => s(t) * Math.exp(-t * 6 / dur) * env(t, dur, 0.002, 0.01), gain, pan);
}
function bubbleRun(snd, start, n, span, lo, hi, gain = 0.25) {
  for (let i = 0; i < n; i++) bubble(snd, start + random() * span, lo + random() * (hi - lo), gain * (0.5 + random() * 0.5), noise() * 0.7);
}
/** A soft struck bar (marimba). */
function bar(snd, start, f, { dur = 0.6, gain = 0.4, pan = 0 } = {}) {
  add(snd, start, dur, t => (Math.sin(TAU * f * t) + 0.22 * Math.sin(TAU * f * 4 * t) * Math.exp(-t * 30)) * Math.exp(-t * 6) * env(t, dur, 0.002, 0.08), gain, pan);
}
function thud(snd, start, f0, f1, dur, gain = 1) { const s = sweep(t => f0 + (f1 - f0) * Math.min(1, t / dur)); add(snd, start, dur, t => s(t) * Math.exp(-t * 7 / dur) * env(t, dur, 0.002, 0.03), gain); }
function whoosh(snd, start, dur, f0, f1, gain = 0.5, cut = 3000) {
  const r = resonator(500), lp = lowPass(cut);
  add(snd, start, dur, t => r(lp(noise()), f0 + (f1 - f0) * t / dur) * Math.sin(Math.PI * t / dur) ** 2, gain);
}

// [seed, recipe, loudness]. Every-turn sounds stay short, low and quiet (NARBE Mini Golf's rule).
const SFX = {
  whistle: [0x2b0b5eed, 0.07, () => { const s = make(0.5); const w = sweep(t => 1550 + 40 * Math.sin(TAU * 9 * t)); add(s, 0, 0.32, t => w(t) * env(t, 0.32, 0.03, 0.12), 0.6); muffle(s, 1800); room(s, 0.15); return s; }],
  pass: [0x19d5480b, 0.06, () => { const s = make(0.5); const b = sweep(t => 520 - 1100 * t); add(s, 0, 0.28, t => b(t) * Math.exp(-t * 9) * env(t, 0.28), 0.5); bubbleRun(s, 0.08, 4, 0.25, 500, 1100, 0.18); muffle(s, 2600); return s; }],
  catch: [0x7b717177, 0.06, () => { const s = make(0.35); thud(s, 0, 220, 110, 0.18, 0.7); bubble(s, 0.04, 700, 0.2); bubble(s, 0.09, 950, 0.14); muffle(s, 2200); return s; }],
  shot: [0x679793c3, 0.11, () => { const s = make(0.9); thud(s, 0, 300, 90, 0.4, 0.8); whoosh(s, 0.02, 0.55, 300, 900, 0.5, 1200); bubbleRun(s, 0.1, 10, 0.6, 350, 1200, 0.2); muffle(s, 2400); room(s, 0.12); return s; }],
  tackle: [0xebf25da9, 0.11, () => { const s = make(0.8); thud(s, 0, 140, 45, 0.5, 1); thud(s, 0.03, 90, 40, 0.4, 0.5); bubbleRun(s, 0.05, 14, 0.45, 250, 900, 0.22); muffle(s, 1400); room(s, 0.14); return s; }],
  block: [0xa4c88a14, 0.09, () => { const s = make(0.6); thud(s, 0, 240, 140, 0.25, 0.7); const r = resonator(60); add(s, 0, 0.25, t => r(t < 0.004 ? 1 : 0, 330) * 8, 0.5); bubbleRun(s, 0.03, 6, 0.3, 400, 1000, 0.2); muffle(s, 1800); return s; }],
  save: [0xe6492437, 0.11, () => { const s = make(0.9); thud(s, 0, 260, 120, 0.25, 0.8); bubbleRun(s, 0.04, 16, 0.6, 400, 1500, 0.2); muffle(s, 2600); room(s, 0.14); return s; }],
  goal: [0x12350de8, 0.13, () => { const s = make(2.2); [98, 147, 196].forEach((f, i) => { const h = sweep(t => f * (1 + 0.015 * Math.sin(TAU * 4 * t))); add(s, 0.05, 1.6, t => nasal(h(t)) * env(t, 1.6, 0.08, 0.5), 0.22 - i * 0.04); });
    bubbleRun(s, 0, 30, 1.2, 300, 1400, 0.22); muffle(s, 900); room(s, 0.22); return s; }],
  tech: [0xd0a80659, 0.11, () => { const s = make(1.3); const w = sweep(t => 200 + 900 * (t / 1.0) ** 2); add(s, 0, 1.0, t => w(t) * env(t, 1.0, 0.2, 0.3), 0.25); for (let i = 0; i < 28; i++) bubble(s, i * 0.035, 400 + i * 45 + random() * 80, 0.2, noise() * 0.8); muffle(s, 3000); room(s, 0.18); return s; }],
  decision: [0x793872ac, 0.08, () => { const s = make(0.9); bar(s, 0, 392, { gain: 0.5 }); bar(s, 0.14, 523.25, { gain: 0.5, dur: 0.7 }); room(s, 0.1); return s; }],
  move: [0x793872ac, 0.05, () => { const s = make(0.12); const d = sweep(t => 700 + 5000 * t); add(s, 0, 0.09, t => d(t) * Math.exp(-t * 40) * env(t, 0.09, 0.002, 0.02), 0.6); return s; }],
  select: [0x793872ac, 0.06, () => { const s = make(0.5); const d = sweep(t => 600 + 4000 * t); add(s, 0, 0.1, t => d(t) * Math.exp(-t * 35) * env(t, 0.1, 0.002, 0.02), 0.5); bar(s, 0.05, 523.25, { gain: 0.45, dur: 0.4 }); return s; }],
};
// The pause hold: one tick per second, each a step higher, so it works eyes-closed (M2's ticks, unchanged).
const TICKS = [660, 784, 988, 1175, 1319];
function tick(f) {
  const s = make(0.14), n = s[0].length, fade = Math.floor(RATE * 0.004);
  for (let i = 0; i < n; i++) {
    const t = i / RATE, e = (t < 0.003 ? t / 0.003 : Math.max(0, 1 - (t - 0.003) / (0.14 - 0.003)) ** 1.5) * (i < fade ? i / fade : i > n - fade ? (n - i) / fade : 1);
    s[0][i] = s[1][i] = (Math.sin(TAU * f * t) * 0.35 + Math.sign(Math.sin(TAU * f * t)) * 0.08) * e;
  }
  return s;
}

/* ══ music: the island theme and the anthem stings ══════════════════════ */
function mix(sec) { const n = Math.ceil(sec * RATE); return { dry: [new Float32Array(n), new Float32Array(n)], wet: [new Float32Array(n), new Float32Array(n)] }; }
function put(m, start, dur, fn, gain, pan, send) {
  const b = Math.floor(start * RATE), e = Math.min(m.dry[0].length, Math.ceil((start + dur) * RATE));
  const l = Math.sqrt((1 - pan) / 2), r = Math.sqrt((1 + pan) / 2);
  for (let i = Math.max(0, b); i < e; i++) {
    const v = fn((i - b) / RATE) * gain;
    m.dry[0][i] += v * l; m.dry[1][i] += v * r; m.wet[0][i] += v * l * send; m.wet[1][i] += v * r * send;
  }
}
/** Schroeder reverb: four damped combs into two allpasses, offset per side. */
function reverb(input, size = 1, fb = 0.8) {
  return input.map((x, side) => {
    const out = new Float32Array(x.length);
    for (const d0 of [558, 594, 638, 678]) {
      const d = Math.round((d0 + side * 12) * size), buf = new Float32Array(d); let idx = 0, damp = 0;
      for (let i = 0; i < x.length; i++) { const y = buf[idx]; damp += (y - damp) * 0.6; buf[idx] = x[i] + damp * fb; idx = (idx + 1) % d; out[i] += y * 0.25; }
    }
    for (const d0 of [113, 278]) {
      const d = Math.round((d0 + side * 7) * size), buf = new Float32Array(d); let idx = 0;
      for (let i = 0; i < x.length; i++) { const b = buf[idx], y = -out[i] * 0.5 + b; buf[idx] = out[i] + b * 0.5; idx = (idx + 1) % d; out[i] = y; }
    }
    return out;
  });
}
const I = {
  steel(m, s, n, d, v = 1, p = 0) {
    const f = hz(n), len = Math.min(d + 0.7, 1.5);
    put(m, s, len, t => { const g = f * (1 + 0.012 * Math.exp(-t * 40));
      return (Math.sin(TAU * g * t) + 0.45 * Math.sin(TAU * 2 * g * t) * Math.exp(-t * 4) + 0.2 * Math.sin(TAU * 3 * g * t) * Math.exp(-t * 7) + 0.07 * Math.sin(TAU * 4.1 * g * t) * Math.exp(-t * 12)) *
        Math.exp(-t * 3) * clamp01(t / 0.003) * clamp01((len - t) / 0.05); }, 0.2 * v, p, 0.35);
  },
  marimba(m, s, n, d, v = 1, p = 0) {
    const f = hz(n), len = 0.5;
    put(m, s, len, t => (Math.sin(TAU * f * t) + 0.22 * Math.sin(TAU * 4 * f * t) * Math.exp(-t * 30)) * Math.exp(-t * 8) * clamp01(t / 0.002) * clamp01((len - t) / 0.05), 0.12 * v, p, 0.25);
  },
  bass(m, s, n, d, v = 1, p = 0) {
    const f = hz(n), len = d + 0.05;
    put(m, s, len, t => (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t) + 0.08 * Math.sin(TAU * 3 * f * t)) * (0.55 + 0.45 * Math.exp(-t * 5)) * clamp01(t / 0.006) * clamp01((len - t) / 0.05), 0.22 * v, p, 0.05);
  },
  brass(m, s, n, d, v = 1, p = 0) {
    const f = hz(n), len = d + 0.12;
    let ph = 0;
    put(m, s, len, t => { ph += TAU * f * (1 + (t > 0.25 ? 0.006 * Math.sin(TAU * 5.5 * t) : 0)) / RATE;
      const bright = 0.3 + 0.5 * clamp01(t / 0.05) * (0.6 + 0.4 * Math.exp(-t * 3));
      let x = 0, w = 1; for (let k = 1; k <= 10; k++) { x += Math.sin(k * ph) * w / k; w *= bright; }
      return x * clamp01(t / 0.025) * clamp01((len - t) / 0.12); }, 0.11 * v, p, 0.3);
  },
  kick(m, s, n, d, v = 1) { let ph = 0; put(m, s, 0.3, t => { ph += TAU * (45 + 75 * Math.exp(-t * 30)) / RATE; return Math.sin(ph) * Math.exp(-t * 11) * clamp01(t / 0.002); }, 0.42 * v, 0, 0.02); },
  shaker(m, s, n, d, v = 1) { const lp = lowPass(5200), lo = lowPass(2500); put(m, s, 0.07, t => { const x = lp(noise()); return (x - lo(x)) * Math.exp(-t * 70); }, 0.22 * v, 0.3, 0.1); },
  rim(m, s, n, d, v = 1) { put(m, s, 0.06, t => (Math.sin(TAU * 1700 * t) * 0.6 + Math.sin(TAU * 820 * t) * 0.4) * Math.exp(-t * 90), 0.13 * v, -0.25, 0.2); },
  clap(m, s, n, d, v = 1) { const r = resonator(900); put(m, s, 0.2, t => { const burst = [0, 0.011, 0.022].some(o => t >= o && t < o + 0.006) || t > 0.022; return r(burst ? noise() : 0, 1300) * Math.exp(-Math.max(0, t - 0.022) * 25); }, 0.5 * v, 0, 0.35); },
};
/** A tiny sequencer: parts are [beat, midi, beats, vel?], per bar or for the whole piece. A loop's
 *  tail (echo, ringing notes) is folded back onto its start, so the end rings into the beginning. */
function render({ bpm, bars, parts, wet = 0.25, size = 1, loop = true, tail = 3 }) {
  const spb = 60 / bpm, len = bars * 4 * spb, m = mix(len + tail);
  for (const part of parts) {
    const ins = I[part.ins];
    const emit = (b, n, l, v) => ins(m, b * spb, n, l * spb, (v || 1) * (part.vel || 1), part.pan || 0);
    if (part.bar) for (let bar = 0; bar < bars; bar++) { const notes = part.bar(bar); if (notes) for (const [b, n, l, v] of notes) emit(bar * 4 + b, n, l, v); }
    if (part.notes) for (const [b, n, l, v] of part.notes) emit(b, n, l, v);
  }
  const w = reverb(m.wet, size);
  const all = m.dry.map((ch, c) => ch.map((v, i) => v + w[c][i] * wet));
  if (!loop) return all;
  const n = Math.round(len * RATE);
  return all.map(ch => { const r = ch.slice(0, n); for (let i = n; i < ch.length; i++) r[i - n] += ch[i]; return r; });
}
const seq = (barsOfNotes, from = 0) => barsOfNotes.flatMap((b, i) => b.map(([x, n, l, v]) => [(from + i) * 4 + x, n, l, v]));
const chord = (b, notes, l, v) => notes.map(n => [b, n, l, v]);

// The island theme: F major, 116 bpm, 16 bars. Steel drum melody, marimba off-beats, bouncy bass.
const A_CH = [[57, 60, 65], [57, 62, 65], [58, 62, 65], [55, 60, 64]];   // F Dm Bb C
const A_ROOT = [41, 38, 34, 36];
const A_MEL1 = [
  [[0, 72, 1], [1, 69, .5], [1.5, 72, .5], [2, 74, 1], [3, 72, 1]], [[0, 69, 1.5], [1.5, 65, .5], [2, 69, 1], [3, 74, 1]],
  [[0, 74, 1], [1, 77, 1], [2, 74, .5], [2.5, 72, .5], [3, 70, 1]], [[0, 72, 2], [2.5, 67, .5], [3, 69, .5], [3.5, 70, .5]],
  [[0, 72, .5], [.5, 77, 1], [1.5, 76, .5], [2, 74, .5], [2.5, 72, 1.5]], [[0, 74, 1], [1, 69, 1], [2, 65, 1], [3, 69, 1]],
  [[0, 70, 1], [1, 74, 1], [2, 77, 1], [3, 79, 1]], [[0, 76, 1], [1, 72, 1], [2, 67, 2]],
];
const A_MEL2 = [
  [[0, 81, 1], [1, 79, .5], [1.5, 77, .5], [2, 79, 1], [3, 77, 1]], [[0, 74, 1], [1, 77, 1], [2, 81, 2]],
  [[0, 79, 1], [1, 77, .5], [1.5, 74, .5], [2, 77, 1], [3, 74, 1]], [[0, 76, 1], [1, 79, 1], [2, 76, 1], [3, 72, 1]],
  [[0, 77, 1], [1, 72, 1], [2, 69, .5], [2.5, 72, .5], [3, 77, 1]], [[0, 76, .5], [.5, 74, 1.5], [2, 69, 1], [3, 74, 1]],
  [[0, 77, 1], [1, 74, 1], [2, 70, 1], [3, 74, 1]], [[0, 76, 1], [1, 79, 1], [2, 72, 2]],
];
const THEME = { bpm: 116, bars: 16 };
const theme = () => render({ bpm: THEME.bpm, bars: THEME.bars, wet: 0.22, parts: [
  { ins: 'marimba', bar: b => [0.5, 1.5, 2.5, 3.5].flatMap(x => chord(x, A_CH[b % 4], 0.3, x === 1.5 ? 1 : 0.8)), pan: -0.2 },
  { ins: 'bass', bar: b => { const r = A_ROOT[b % 4]; return [[0, r, 1], [1.5, r + 7, .5], [2, r, 1], [3, r + 12, .5], [3.5, r + 7, .5]]; } },
  { ins: 'kick', bar: b => [[0], [2], ...(b % 2 ? [[2.5, 0, 0, 0.6]] : [])] },
  { ins: 'rim', bar: () => [[1], [3]] },
  { ins: 'shaker', bar: () => [0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map(x => [x, 0, 0, x % 1 ? 1 : 0.5]) },
  { ins: 'steel', notes: [...seq(A_MEL1), ...seq(A_MEL2, 8)], pan: 0.15 },
] });

// The anthem stings: D major synth brass.
const STINGS = {
  goal: [0x6234078c, () => render({ bpm: 140, bars: 1, loop: false, tail: 1.5, wet: 0.2, parts: [
    { ins: 'brass', notes: [...chord(0, [62, 66, 69, 74], .4), ...chord(.75, [62, 66, 69, 74], .4), ...chord(1.5, [62, 66, 69, 74], .4), ...chord(2.25, [64, 69, 73, 76], 1.6)] },
    { ins: 'bass', notes: [[0, 38, .4], [.75, 38, .4], [1.5, 38, .4], [2.25, 45, 1.6]] },
    { ins: 'kick', notes: [[0], [.75], [1.5], [2.25]] }, { ins: 'clap', notes: [[2.25]] }] })],
  win: [0x554340fe, () => render({ bpm: 120, bars: 2, loop: false, tail: 1.8, wet: 0.22, parts: [
    { ins: 'brass', notes: [[0, 74, .5], [.5, 74, .5], [1, 78, .5], [1.5, 81, 1], [2.5, 79, .5], [3, 83, 1], [4, 86, 3]] },
    { ins: 'brass', notes: [...chord(0, [62, 66, 69], 1, .5), ...chord(1.5, [59, 62, 67], 1, .5), ...chord(3, [61, 64, 69], 1, .5), ...chord(4, [62, 66, 69, 74], 3, .6)] },
    { ins: 'bass', notes: [[0, 38, 1.5], [1.5, 43, 1.5], [3, 45, 1], [4, 38, 3]] }, { ins: 'kick', notes: [[0], [1.5], [3], [4]] }, { ins: 'clap', notes: [[4]] }] })],
  // The "nice try": a kind, gently falling line, never a sad trombone.
  lose: [0x22ea99fa, () => render({ bpm: 92, bars: 2, loop: false, tail: 2, wet: 0.28, parts: [
    { ins: 'brass', notes: [[0, 74, 1, .6], [1, 73, 1, .55], [2, 71, 1, .55], [3, 69, 3, .55]] },
    { ins: 'brass', notes: [...chord(0, [59, 62, 66], 2, .3), ...chord(2, [59, 62, 67], 1, .3), ...chord(3, [62, 66, 69], 2.5, .3)] },
    { ins: 'bass', notes: [[0, 35, 2, .7], [2, 43, 1, .7], [3, 38, 2.5, .7]] }] })],
};
const THEME_TAIL = 3.0;   // seconds of the theme's opening repeated after its end, for the gapless player

/* ══ writing the files ══════════════════════════════════════════════════ */
const report = [];
/** Loudness by RMS (over the part that sounds, for the short effects), capped so it never clips.
 *  `extra` = samples written after the measured part at the same gain (the loop's tail). */
async function save(dir, name, snd, rms, { active = false, trim = false, extra = null } = {}) {
  const peakMax = 0.89;
  if (trim) {   // a sting ends when its ring has died away (-54 dB), with a short fade
    let pk0 = 0; for (const ch of snd) for (const v of ch) pk0 = Math.max(pk0, Math.abs(v));
    let end = snd[0].length - 1; while (end > 0 && Math.max(Math.abs(snd[0][end]), Math.abs(snd[1][end])) < pk0 * 0.002) end--;
    const keep = Math.min(snd[0].length, end + Math.round(0.05 * RATE)), fade = Math.round(0.3 * RATE);
    snd = snd.map(ch => { const r = ch.slice(0, keep); for (let i = 0; i < fade && i < keep; i++) r[keep - 1 - i] *= i / fade; return r; });
  }
  let sq = 0, pk = 0, n = 0;
  for (const ch of snd) for (const v of ch) { sq += v * v; pk = Math.max(pk, Math.abs(v)); n++; }
  let cur = Math.sqrt(sq / n);
  if (active) {
    let act = 0, actN = 0; const thr = pk * 0.05;
    for (let i = 0; i < snd[0].length; i++) { const v = (Math.abs(snd[0][i]) + Math.abs(snd[1][i])) / 2; if (v > thr) { act += snd[0][i] ** 2 + snd[1][i] ** 2; actN += 2; } }
    cur = Math.sqrt(act / Math.max(1, actN));
  }
  const g = Math.min(rms / cur, peakMax / pk);
  const body = extra ? snd.map((ch, c) => { const r = new Float32Array(ch.length + extra[c].length); r.set(ch); r.set(extra[c], ch.length); return r; }) : snd;
  const frames = body[0].length, buf = Buffer.alloc(44 + frames * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + frames * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, body[c][i] * g)) * 32767), 44 + (i * 2 + c) * 2);
  await writeFile(path.join(GAME, 'audio', dir, name + '.wav'), buf);
  report.push(`${(dir + '/' + name).padEnd(16)} ${(frames / RATE).toFixed(2).padStart(6)} s  ${(buf.length / 1024).toFixed(0).padStart(5)} KB  rms ${(20 * Math.log10(cur * g)).toFixed(1)} dB`);
  return buf.length;
}

for (const d of ['sfx', 'crowd', 'music']) await mkdir(path.join(GAME, 'audio', d), { recursive: true });
let bytes = 0;
for (const [name, [s, fn]] of Object.entries(CROWD)) { seed = s; bytes += await save('crowd', name, fn(), CROWD_RMS[name]); }
for (const [name, [s, rms, fn]] of Object.entries(SFX)) { seed = s; bytes += await save('sfx', name, fn(), rms, { active: true }); }
for (let i = 0; i < TICKS.length; i++) bytes += await save('sfx', 'tick' + (i + 1), tick(TICKS[i]), 0.1, { active: true });
seed = 0x0c0ffee5;
const loop = theme(), tailN = Math.round(THEME_TAIL * RATE);
bytes += await save('music', 'theme', loop, 0.1, { extra: loop.map(ch => ch.slice(0, tailN)) });
for (const [name, [s, fn]] of Object.entries(STINGS)) { seed = s; bytes += await save('music', name, fn(), 0.12, { trim: true }); }

const loopSec = loop[0].length / RATE;
await writeFile(path.join(GAME, 'js', 'audio-files.generated.js'),
  '/* Written by tools/generate-audio.mjs - do not edit. The music loop\'s length, for js/audio.js\'s gapless player. */\n' +
  'SS.AUDIO_FILES = ' + JSON.stringify({ theme: { sec: +loopSec.toFixed(6), tail: THEME_TAIL } }) + ';\n');
console.log(report.join('\n') + `\n${(bytes / 1048576).toFixed(2)} MB in all`);
