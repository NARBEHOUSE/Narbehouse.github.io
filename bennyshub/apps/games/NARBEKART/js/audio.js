/**
 * NARBE Racer — audio.
 *
 * Every sound in the game is synthesised here, in plain JavaScript, as PCM
 * samples; wrapped in a 16-bit WAV header; handed to the page as a Blob URL;
 * and played through ordinary HTML5 <audio> elements. The Web Audio API is
 * never touched: the hub rulebook bans it because it has taken the Electron
 * renderer down (DESIGN.md §1.10, §11). There are no asset files to ship or
 * fail to load, and the Blob URLs are never fetched (the desktop CSP allows
 * blob: for media but not for fetch).
 *
 * ── Public API (NK.audio) ──────────────────────────────────────────────────
 *   init()                    start rendering in idle slices, menu sounds first (idempotent)
 *   ready() → bool            every one-shot and engine loop is rendered and handed to <audio>
 *   resume()                  call from a user gesture: retries anything autoplay blocked
 *   tick(dt)                  every frame: speech ducking, fades, gapless loop swaps
 *   setSfx(on) · sfxOn()      sound effects on / off (NK.game persists nk-settings)
 *   setMusic(on) · musicOn()  music on / off
 *   play(name, { vol, pan })  any catalogue name; pan -1 / 0 / +1 picks a pre-panned
 *                             stereo variant when the sound has one
 *
 *   Named one-shots — each also takes an optional trailing { vol, pan }:
 *     menuMove() menuSelect() menuBlocked()
 *     countdown(n)            n = 3, 2, 1 beep · 0 = GO
 *     boxSmash() rouletteTick(i) itemGet(id) itemUse(id)
 *     hit(kind)               'spin' | 'wobble'
 *     coin(n)                 n = coins now held; the pitch climbs with n
 *     driftLevel(level) turbo(level)          level 1..3
 *     boostPad() bump() railRub() wallScrape() jump() trick() land() fall() drone()
 *     splash() whoosh()       through a waterfall · into a loop-the-loop
 *     lap() finalLap() finish(place) placeUp() placeDown()
 *     cue(dir, player)        dir -1 low · 0 middle · +1 high; player 0 bell, 1 marimba.
 *                             In one-player races pass { pan: dir } for the panned cue.
 *     scanMatch(player)       Press-to-Step scanner reached the guidance lane
 *     pauseTick(sec)          rising beep while a pause switch is held
 *     horn() bombBlast() zap() shrink() peelDrop() ballLaunch() beeLaunch() zapperSiren()
 *
 *   Loops:
 *     dangerStart(player) · dangerStop(player)   warning pulse, timbre per player
 *     starStart(player) · starStop(player)       Super Star jingle; the music dips under it
 *     engine(humanIdx) → { start(vehicleId, pan), update(speedNorm, boosting, drifting), stop() }
 *                             speedNorm 0..1 · boosting bool · drifting false | true | level 1..3
 *
 *   Music ('menu' 'meadow' 'shores' 'candy' 'dunes' 'frost' 'spooky' 'lava'
 *          'starlight' 'jungle' 'isles' 'reef' 'dino' 'toybox' 'carnival'
 *          'neon' 'factory' 'podium' 'results'):
 *     music(songId)           rendered the first time it is asked for, then cached;
 *                             changing song crossfades
 *     musicTempo(mult)        e.g. 1.12 on the final lap (pitch preserved)
 *     musicStop()
 *
 *   Extras: stopAll() silences every loop and one-shot (Exit Game) · stats()
 *   render timings and loop-swap measurements (lab page, harness) · synth, the
 *   pure PCM core (tools/audio_check.js require()s this file under node).
 *
 * ── How it is built ───────────────────────────────────────────────────────
 *   1. DSP core: oscillators with phase accumulation, envelopes, seeded noise,
 *      biquad / state-variable filters, a small plate reverb, a ping-pong echo,
 *      a look-ahead limiter, a loudness meter and a WAV writer. Pure functions
 *      of sample time with no browser APIs, so node renders the same bytes.
 *   2. Instruments shared by the effects and the music.
 *   3. The sound-effect catalogue: every one-shot is a small recipe.
 *   4. Loops: engines, boost roar, drift crackle, danger pulses.
 *   5. Music: each song is data (tempo, chords, melody, bass, arpeggio / pad
 *      patterns, drums) rendered by a sequencer into a seamless stereo loop.
 *   6. Render jobs: generators that yield, so the browser renders in small
 *      idle slices and boot never stalls.
 *   7. The browser layer: SafeAudio one-shots, gapless two-element loops,
 *      ducking under speech, and the API above.
 */
(function (root) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════
   * 1. DSP core — pure functions of sample time, no browser APIs
   * ══════════════════════════════════════════════════════════════════════ */

  const SR = 22050;               // one rate for everything: plenty for small speakers
  const TAU = Math.PI * 2;
  const CEIL = 0.891;             // -1 dBFS: the peak every render is limited to
  const dbToGain = (db) => Math.pow(10, db / 20);
  const gainToDb = (g) => 20 * Math.log10(Math.max(1e-9, g));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* Deterministic randomness: every render is a pure function of its name, so
   * the node check tool measures exactly what the game plays. */
  function prng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  /* White noise for filters and excitations: xorshift32, reseeded per render. */
  let nzs = 1;
  function nzSeed(s) { nzs = (s >>> 0) || 0x9e3779b9; }
  function nz() {
    nzs ^= nzs << 13; nzs ^= nzs >>> 17; nzs ^= nzs << 5;
    return (nzs >>> 0) / 2147483648 - 1;
  }

  /* sin(2πp) for a phase in cycles: table lookup with linear interpolation,
   * several times cheaper than Math.sin in the inner loops. */
  const SIN_N = 4096;
  const SIN = new Float32Array(SIN_N + 1);
  for (let i = 0; i <= SIN_N; i++) SIN[i] = Math.sin(TAU * i / SIN_N);
  function sn(p) {
    p -= Math.floor(p);
    const x = p * SIN_N, i = x | 0;
    return SIN[i] + (SIN[i + 1] - SIN[i]) * (x - i);
  }

  /* Band-limited saw and pulse (PolyBLEP): naive ones alias into a harsh fizz
   * at 22 kHz, audible on every high lead note and pitch sweep. */
  function blep(t, dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }
  function saw(p, dt) { return 2 * p - 1 - blep(p, dt); }
  function pulse(p, dt, duty) {
    let q = p - duty;
    if (q < 0) q += 1;
    return (p < duty ? 1 : -1) + blep(p, dt) - blep(q, dt);
  }
  function tri(p) { return p < 0.5 ? 4 * p - 1 : 3 - 4 * p; }

  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function onePoleA(f) { return 1 - Math.exp(-TAU * Math.min(f, SR * 0.45) / SR); }

  /** RBJ-cookbook biquad. set() is cheap enough to call every 16 samples in a sweep. */
  function Biquad() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  Biquad.prototype.set = function (type, f, q, db) {
    const w = TAU * Math.min(Math.max(f, 10), SR * 0.45) / SR;
    const c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else {                       // 'hs' high shelf, gain db (the loudness meter's K-weighting)
      const A = Math.pow(10, db / 40), sq = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * c + sq); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - sq);
      a0 = (A + 1) - (A - 1) * c + sq; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sq;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  };
  Biquad.prototype.run = function (x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  };

  /** Topology-preserving state-variable filter (Simper): stable while its cutoff moves. */
  function Svf() { this.ic1 = 0; this.ic2 = 0; this.a1 = 1; this.a2 = 0; this.a3 = 0; this.k = 1.4; }
  Svf.prototype.set = function (f, q) {
    const g = Math.tan(Math.PI * Math.min(Math.max(f, 20), SR * 0.45) / SR);
    this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
    return this;
  };
  Svf.prototype.lp = function (x) {
    const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    return v2;
  };
  Svf.prototype.bp = function (x) {
    const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    return v1;
  };

  /* ── Loop-aware processing ────────────────────────────────────────────────
   * A loop must sound the same across its seam as anywhere else: reverb,
   * echo and filter tails from the end of the loop have to be audible at its
   * start. Every stateful pass over a loop therefore runs over the last few
   * seconds first ("priming") and only then over the whole loop, so its
   * delay lines already hold what the seam would have carried.
   */
  function ringIndex(t, prime, n) { return t < prime ? n - prime + t : t - prime; }

  /** One damped comb of the reverb, accumulated into out. */
  function combPass(inp, out, d, fb, damp, prime) {
    const n = inp.length, buf = new Float32Array(d);
    let k = 0, f = 0;
    const total = prime + n;
    for (let t = 0; t < total; t++) {
      const i = t < prime ? n - prime + t : t - prime;
      const y = buf[k];
      f = y * (1 - damp) + f * damp;
      buf[k] = inp[i] + f * fb;
      if (++k === d) k = 0;
      if (t >= prime) out[i] += y;
    }
  }
  /** Freeverb-style allpass, in place. */
  function allpassPass(x, d, prime) {
    const n = x.length, buf = new Float32Array(d);
    let k = 0;
    const total = prime + n;
    for (let t = 0; t < total; t++) {
      const i = t < prime ? n - prime + t : t - prime;
      const bo = buf[k], xi = x[i];
      buf[k] = xi + bo * 0.5;
      if (++k === d) k = 0;
      if (t >= prime) x[i] = bo - xi;
    }
  }

  /**
   * A light plate: Freeverb's topology (six damped combs in parallel, three
   * allpasses in series), delay lengths halved for 22.05 kHz, the right
   * channel detuned for width. Mono send in, stereo wet added to L/R.
   */
  const COMBS = [558, 594, 638, 678, 711, 745];
  const APASS = [278, 220, 170];
  function* reverbGen(send, L, R, size, damp, g, circ) {
    const n = send.length;
    const prime = circ ? Math.min(n, Math.round(2.5 * SR)) : 0;
    const inp = new Float32Array(n);
    for (let i = 0; i < n; i++) inp[i] = send[i] * 0.24;
    for (let ch = 0; ch < 2; ch++) {
      const wet = new Float32Array(n), spread = ch ? 11 : 0;
      for (let c = 0; c < COMBS.length; c++) { combPass(inp, wet, COMBS[c] + spread, size, damp, prime); yield; }
      for (let a = 0; a < APASS.length; a++) { allpassPass(wet, APASS[a] + spread, prime); yield; }
      const out = ch ? R : L;
      for (let i = 0; i < n; i++) out[i] += wet[i] * g;
    }
  }
  function reverb(send, L, R, size, damp, g, circ) { drain(reverbGen(send, L, R, size, damp, g, circ)); }

  /** Run a generator to completion (node, and the effects that are small enough not to slice). */
  function drain(gen) {
    let r = gen.next();
    while (!r.done) r = gen.next();
    return r.value;
  }

  /** Tempo-synced ping-pong echo: first repeat left, then right, softened each time round. */
  function echo(send, L, R, d, fb, lpHz, g, circ) {
    const n = send.length;
    if (d < 2) return;
    const bl = new Float32Array(d), br = new Float32Array(d), a = onePoleA(lpHz);
    const repeats = Math.log(0.001) / Math.log(Math.max(0.05, fb));
    const prime = circ ? Math.min(n, Math.ceil(d * 2 * repeats)) : 0;
    let k = 0, lp = 0;
    const total = prime + n;
    for (let t = 0; t < total; t++) {
      const i = t < prime ? n - prime + t : t - prime;
      const ol = bl[k], or = br[k];
      lp += a * (or - lp);
      bl[k] = send[i] + lp * fb;
      br[k] = ol;
      if (++k === d) k = 0;
      if (t >= prime) { L[i] += ol * g; R[i] += or * g; }
    }
  }

  /** One-pole high-pass (DC and sub-rumble removal), in place, loop-aware. */
  function highpass(x, f, circ) {
    const n = x.length, a = Math.exp(-TAU * f / SR);
    const prime = circ ? Math.min(n, Math.round(0.5 * SR)) : 0;
    let px = 0, py = 0;
    for (let t = 0; t < prime + n; t++) {
      const i = t < prime ? n - prime + t : t - prime;
      const xi = x[i], y = a * (py + xi - px);
      px = xi; py = y;
      if (t >= prime) x[i] = y;
    }
  }

  /** Loop-aware biquad pass, in place. */
  function biquadPass(x, type, f, q, circ) {
    const n = x.length, bq = new Biquad().set(type, f, q);
    const prime = circ ? Math.min(n, Math.round(0.4 * SR)) : 0;
    for (let t = 0; t < prime + n; t++) {
      const i = t < prime ? n - prime + t : t - prime;
      const y = bq.run(x[i]);
      if (t >= prime) x[i] = y;
    }
  }

  /**
   * Brick-wall limiter at CEIL. The gain each sample needs is smoothed with an
   * instant-but-backward attack (2 ms look-ahead feel) and an 80 ms release,
   * so peaks are caught without clicks and the output can never exceed CEIL.
   */
  function* limitGen(chs, ceil, circ) {
    const n = chs[0].length, g = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let pk = 0;
      for (let c = 0; c < chs.length; c++) { const v = Math.abs(chs[c][i]); if (v > pk) pk = v; }
      g[i] = pk > ceil ? ceil / pk : 1;
    }
    yield;
    const rel = Math.exp(-1 / (0.08 * SR)), att = Math.exp(-1 / (0.002 * SR));
    const passes = circ ? 2 : 1;
    let s = 1;
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < n; i++) {
        s = Math.min(g[i], 1 - (1 - s) * rel);
        if (p === passes - 1) g[i] = s;
      }
    }
    yield;
    s = 1;
    for (let p = 0; p < passes; p++) {
      for (let i = n - 1; i >= 0; i--) {
        s = Math.min(g[i], 1 - (1 - s) * att);
        if (p === passes - 1) g[i] = s;
      }
    }
    yield;
    for (let c = 0; c < chs.length; c++) { const x = chs[c]; for (let i = 0; i < n; i++) x[i] *= g[i]; }
  }
  function limit(chs, ceil, circ) { drain(limitGen(chs, ceil, circ)); }

  function peakOf(chs) {
    let pk = 0;
    for (let c = 0; c < chs.length; c++) { const x = chs[c]; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > pk) pk = v; } }
    return pk;
  }
  function scale(chs, g) { for (let c = 0; c < chs.length; c++) { const x = chs[c]; for (let i = 0; i < x.length; i++) x[i] *= g; } }

  /**
   * Loudness in dB (a simplified LUFS: K-weighted, channels summed). With
   * `win` seconds it is the loudest window — how loud a short effect feels;
   * with 0 it is the whole buffer — how loud a loop sits in the mix. A mono
   * file plays out of both speakers, so it counts twice (+3 dB).
   */
  function loudness(chs, win) {
    const n = chs[0].length, sq = new Float32Array(n);
    for (let c = 0; c < chs.length; c++) {
      const hs = new Biquad().set('hs', 1681, 0.707, 4), hp = new Biquad().set('hp', 38, 0.5);
      const x = chs[c];
      for (let i = 0; i < n; i++) { const y = hp.run(hs.run(x[i])); sq[i] += y * y; }
    }
    const both = chs.length === 1 ? 2 : 1;
    let best = 0;
    if (!win) {
      let s = 0;
      for (let i = 0; i < n; i++) s += sq[i];
      best = s / n;
    } else {
      const W = Math.max(1, Math.min(n, Math.round(win * SR)));
      let s = 0;
      for (let i = 0; i < W; i++) s += sq[i];
      best = s / W;
      for (let i = W; i < n; i++) { s += sq[i] - sq[i - W]; if (s / W > best) best = s / W; }
    }
    return 10 * Math.log10(Math.max(1e-12, best * both));
  }

  /**
   * 16-bit PCM WAV. `tail` samples from the start are appended after the end:
   * the gapless loop player needs the loop's opening seconds twice.
   */
  function* wavGen(chs, tail) {
    const nc = chs.length, n = chs[0].length, total = n + (tail || 0);
    const buf = new ArrayBuffer(44 + total * nc * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + total * nc * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, total * nc * 2, true);
    const pcm = new Int16Array(buf, 44, total * nc);
    let k = 0;
    for (let i = 0; i < total; i++) {
      const j = i < n ? i : i - n;
      for (let c = 0; c < nc; c++) {
        let x = chs[c][j];
        x = x < -1 ? -1 : x > 1 ? 1 : x;
        pcm[k++] = Math.round(x < 0 ? x * 32768 : x * 32767);
      }
      if ((i & 131071) === 131071) yield;
    }
    return buf;
  }
  function wavBytes(chs, tail) { return drain(wavGen(chs, tail)); }

  /** Constant-power pan of a mono render into a stereo pair (p -1..+1). */
  function panStereo(mono, p) {
    const th = (p + 1) * Math.PI / 4, gl = Math.cos(th) * Math.SQRT2, gr = Math.sin(th) * Math.SQRT2;
    const n = mono.length, L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) { L[i] = mono[i] * gl; R[i] = mono[i] * gr; }
    return [L, R];
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 2. Instruments — shared by the effects and the music
   * ══════════════════════════════════════════════════════════════════════
   * Each draws ONE note into a buffer: fn(o, t0, f, dur, vel, P) starts t0
   * seconds in, holds the gate for `dur` seconds and rings out for at most
   * the instrument's `rel` afterwards. Chord instruments take an array of Hz.
   * Every note ends on an exact zero (a 4 ms fade) so buffers never click.
   */

  function span(o, t0, dur, rel) {
    const i0 = Math.max(0, Math.round(t0 * SR));
    return { i0, n: Math.min(o.length - i0, Math.ceil((dur + rel) * SR)) };
  }

  /** Two-operator FM: bells, glockenspiel, steel pan, toy piano, electric piano. */
  function fmNote(o, t0, f, dur, vel, P) {
    const rel = P.rel, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const on = P.ring ? n : dur * SR, aN = Math.max(1, (P.a || 0.001) * SR), fade = Math.min(n, 0.004 * SR);
    const dk = Math.exp(-1 / (P.tau * SR)), rk = Math.exp(-5 / (rel * SR));
    const ik = Math.exp(-1 / (P.ixTau * SR)), ixEnd = P.ixEnd || 0;
    const dc = f * (P.cr || 1) / SR, dm = f * P.mr / SR;
    const p2 = P.p2, d2 = p2 ? f * p2[0] / SR : 0, k2 = p2 ? Math.exp(-1 / (p2[2] * SR)) : 0;
    const sus = P.sus || 0, g = vel * (P.g || 0.5);
    let pc = 0, pm = 0, q2 = 0, e = 1, lvl = 1, ix = P.ix, e2 = p2 && f * p2[0] < SR * 0.45 ? p2[1] : 0;
    for (let i = 0; i < n; i++) {
      pm += dm; if (pm >= 1) pm -= 1;
      pc += dc; if (pc >= 1) pc -= 1;
      let v = sn(pc + ix * 0.1591549 * sn(pm));
      if (e2) { q2 += d2; if (q2 >= 1) q2 -= 1; v += e2 * sn(q2); e2 *= k2; }
      if (i < on) { lvl = sus + (1 - sus) * e; e *= dk; } else lvl *= rk;
      let env = lvl;
      if (i < aN) env *= i / aN;
      if (i > n - fade) env *= (n - i) / fade;
      o[i0 + i] += v * env * g;
      ix = ixEnd + (ix - ixEnd) * ik;
    }
  }

  /**
   * Struck bars (marimba, xylophone, kalimba, vibraphone): decaying partials
   * plus a mallet click; `trem` adds the vibraphone motor's tremolo (depth,
   * rate `tr` Hz), starting each note at full level.
   */
  function malletNote(o, t0, f, dur, vel, P) {
    const sp = span(o, t0, dur, P.rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const parts = P.parts, np = parts.length;
    const ph = new Float64Array(np), dp = new Float64Array(np), amp = new Float64Array(np), dk = new Float64Array(np);
    for (let k = 0; k < np; k++) {
      dp[k] = f * parts[k][0] / SR;
      amp[k] = f * parts[k][0] < SR * 0.45 ? parts[k][1] : 0;
      dk[k] = Math.exp(-1 / (parts[k][2] * SR));
    }
    const fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.5), clickN = Math.round(0.004 * SR), click = P.click || 0;
    const trem = P.trem || 0, tr = (P.tr || 5.5) / SR;
    let lpc = 0;
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let k = 0; k < np; k++) { ph[k] += dp[k]; if (ph[k] >= 1) ph[k] -= 1; v += amp[k] * sn(ph[k]); amp[k] *= dk[k]; }
      if (i < clickN) { lpc += 0.5 * (nz() - lpc); v += click * lpc * (1 - i / clickN); }
      if (trem) v *= 1 - trem * (0.5 - 0.5 * sn(i * tr + 0.25));
      let env = i < 12 ? i / 12 : 1;
      if (i > n - fade) env *= (n - i) / fade;
      o[i0 + i] += v * env * g;
    }
  }

  /**
   * Karplus-Strong string: a noise burst circulating in a delay line one
   * period long, averaged every trip (so the highs die first, like a real
   * string). Fractional delay keeps high notes in tune.
   */
  function pluckNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.08, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const per = Math.max(2.5, SR / f - 0.5), M = Math.floor(per) + 4;
    const line = new Float32Array(M), br = P.bright === undefined ? 0.5 : P.bright;
    // Excitation: noise low-passed by the brightness, DC removed, scaled to a
    // fixed RMS so a dull pluck is not simply a quiet one.
    const lpa = 0.08 + 0.92 * br * br;
    let s = 0, mean = 0, ms = 0;
    for (let k = 0; k < M; k++) { s += lpa * (nz() - s); line[k] = s; mean += s; }
    mean /= M;
    for (let k = 0; k < M; k++) { line[k] -= mean; ms += line[k] * line[k]; }
    const norm = 0.6 / Math.sqrt(ms / M + 1e-9);
    for (let k = 0; k < M; k++) line[k] *= norm;
    const t60 = P.t60 || 1.5;
    const dk = Math.pow(0.001, 1 / (f * t60)), dOff = Math.pow(0.001, 1 / (f * Math.max(0.03, rel)));
    const on = dur * SR, fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.5);
    const body = P.body || 0, bd = f / SR, bk = Math.exp(-1 / (0.3 * SR));
    const vib = P.vib || 0, vr = (P.vr || 5) / SR;
    let w = 0, prev = 0, bp = 0, be = 1;
    for (let i = 0; i < n; i++) {
      // Read one period back (fractional, so high notes stay in tune); a
      // vibrato (the surf guitar's whammy shimmer) just wobbles the read point.
      let pos = w - per;
      if (vib) pos -= vib * per * (0.5 + 0.5 * sn(i * vr));
      if (pos < 0) pos += M;
      const r1 = pos | 0, fr = pos - r1, r2 = r1 + 1 === M ? 0 : r1 + 1;
      const y = line[r1] * (1 - fr) + line[r2] * fr;
      line[w] = (i < on ? dk : dOff) * 0.5 * (y + prev);
      prev = y;
      if (++w === M) w = 0;
      let v = y;
      if (body) { bp += bd; if (bp >= 1) bp -= 1; v += body * be * sn(bp); be *= bk; }
      const env = i > n - fade ? (n - i) / fade : 1;
      o[i0 + i] += v * env * g;
    }
  }

  /** Shared ADSR step used by the synth voices: returns the new level. */
  function adsrStep(i, lvl, aN, on, sus, dk, rk) {
    if (i >= on) return lvl * rk;
    if (i < aN) return i / aN;
    return sus + (lvl - sus) * dk;
  }

  /** Pulse-wave lead with optional pulse-width sweep, delayed vibrato and a scoop into pitch. */
  function leadNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.1, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const on = dur * SR, aN = Math.max(1, (P.a || 0.005) * SR);
    const dk = Math.exp(-1 / ((P.d || 0.3) * SR)), sus = P.s === undefined ? 0.75 : P.s, rk = Math.exp(-5 / (rel * SR));
    const duty = P.duty || 0.35, pwm = P.pwm || 0, pwr = (P.pwr || 0.8) / SR;
    const vib = P.vib || 0, vr = (P.vr || 5.5) / SR, vd = (P.vd || 0.2) * SR, vramp = 0.25 * SR;
    const scoop = P.scoop || 0, scN = 0.04 * SR;
    const lpA = onePoleA(P.cut || 3500), fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.5);
    let p = 0, lvl = 0, y = 0;
    for (let i = 0; i < n; i++) {
      lvl = adsrStep(i, lvl, aN, on, sus, dk, rk);
      let fm = 1;
      if (vib && i > vd) fm += vib * Math.min(1, (i - vd) / vramp) * sn(i * vr);
      if (scoop && i < scN) fm *= 1 - scoop * (1 - i / scN);
      const dt = f * fm / SR;
      p += dt; if (p >= 1) p -= 1;
      y += lpA * (pulse(p, dt, pwm ? duty + pwm * sn(i * pwr) : duty) - y);
      const env = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += y * env * g;
    }
  }

  /**
   * Two detuned saws through a state-variable low-pass whose cutoff opens on
   * the attack: saw leads, rock leads (with drive) and brass (slow opening,
   * scoop into pitch — the "bwah" of a horn section).
   */
  function sawNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.1, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const on = dur * SR, aN = Math.max(1, (P.a || 0.006) * SR);
    const dk = Math.exp(-1 / ((P.d || 0.4) * SR)), sus = P.s === undefined ? 0.8 : P.s, rk = Math.exp(-5 / (rel * SR));
    const det = P.det === undefined ? 0.004 : P.det;
    const cut = P.cut || 2600, cutEnv = P.cutEnv || 0, ck = Math.exp(-1 / ((P.cutTau || 0.15) * SR));
    const cutAtk = (P.cutAtk || 0) * SR, q = P.q || 0.8, drive = P.drive || 0, dn = drive ? Math.tanh(1 + drive) : 1;
    const vib = P.vib || 0, vr = (P.vr || 5.5) / SR, vd = (P.vd || 0.2) * SR, vramp = 0.25 * SR;
    const scoop = P.scoop || 0, scN = 0.05 * SR;
    const fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.5);
    const svf = new Svf();
    let p1 = 0, p2 = 0.37, lvl = 0, ce = 1;
    for (let i = 0; i < n; i++) {
      lvl = adsrStep(i, lvl, aN, on, sus, dk, rk);
      let fm = 1;
      if (vib && i > vd) fm += vib * Math.min(1, (i - vd) / vramp) * sn(i * vr);
      if (scoop && i < scN) fm *= 1 - scoop * (1 - i / scN);
      const d1 = f * fm * (1 + det) / SR, d2 = f * fm * (1 - det) / SR;
      p1 += d1; if (p1 >= 1) p1 -= 1;
      p2 += d2; if (p2 >= 1) p2 -= 1;
      if ((i & 15) === 0) {
        const open = cutAtk ? Math.min(1, 0.3 + 0.7 * i / cutAtk) : 1;
        svf.set(cut * open * (1 + cutEnv * vel * ce), q);
      }
      ce *= ck;
      let v = svf.lp(0.5 * (saw(p1, d1) + saw(p2, d2)));
      if (drive) v = Math.tanh(v * (1 + drive)) / dn;
      const env = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += v * env * g;
    }
  }

  /** Tonewheel-style organ: drawbar harmonics, a gentle chorus wobble and a key click. */
  const ORGAN_RATIOS = [0.5, 1, 1.5, 2, 3, 4, 6, 8];
  function organNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.05, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const bars = P.bars || [0.5, 1, 0.45, 0.55, 0.3, 0.2, 0.08, 0.05], nb = bars.length;
    const ph = new Float64Array(nb), dp = new Float64Array(nb), amp = new Float64Array(nb);
    let tot = 0;
    for (let k = 0; k < nb; k++) { dp[k] = f * ORGAN_RATIOS[k] / SR; amp[k] = f * ORGAN_RATIOS[k] < SR * 0.45 ? bars[k] : 0; tot += amp[k]; }
    for (let k = 0; k < nb; k++) amp[k] /= Math.max(1, tot * 0.6);
    const on = dur * SR, aN = 0.004 * SR, rk = Math.exp(-5 / (rel * SR)), fade = Math.min(n, 0.004 * SR);
    const vr = 6.4 / SR, vd = P.vib === undefined ? 0.0025 : P.vib, g = vel * (P.g || 0.5), clickN = 0.003 * SR;
    let lvl = 0, lpc = 0;
    for (let i = 0; i < n; i++) {
      lvl = adsrStep(i, lvl, aN, on, 1, 1, rk);
      const wob = 1 + vd * sn(i * vr);
      let v = 0;
      for (let k = 0; k < nb; k++) { ph[k] += dp[k] * wob; if (ph[k] >= 1) ph[k] -= 1; v += amp[k] * sn(ph[k]); }
      if (i < clickN) { lpc += 0.6 * (nz() - lpc); v += 0.25 * lpc; }
      const env = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += v * env * g;
    }
  }

  /** Breathy wind voice (flute, whistle, ney): a few harmonics, band-passed breath, delayed vibrato. */
  function fluteNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.1, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const on = dur * SR, aN = Math.max(1, (P.a || 0.04) * SR), rk = Math.exp(-5 / (rel * SR));
    const h2 = P.h2 || 0, h3 = P.h3 || 0, breath = P.breath || 0;
    const vib = P.vib || 0, vr = (P.vr || 5.2) / SR, vd = (P.vd || 0.18) * SR, vramp = 0.3 * SR;
    const scoop = P.scoop || 0, scN = 0.035 * SR, fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.5);
    const bq = new Biquad().set('bp', Math.min(f * 2.2, SR * 0.4), 1.8);
    let p = 0, lvl = 0;
    for (let i = 0; i < n; i++) {
      lvl = adsrStep(i, lvl, aN, on, 1, 1, rk);
      let fm = 1;
      if (vib && i > vd) fm += vib * Math.min(1, (i - vd) / vramp) * sn(i * vr);
      if (scoop && i < scN) fm *= 1 - scoop * (1 - i / scN);
      p += f * fm / SR; if (p >= 1) p -= 1;
      let v = sn(p) + h2 * sn(2 * p) + h3 * sn(3 * p);
      // Breath is strongest on the attack, like a real player's chiff.
      if (breath) v += breath * (1 + 2 * Math.max(0, 1 - i / aN)) * bq.run(nz());
      const env = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += v * env * g;
    }
  }

  /** Chord pad: each tone a pair (or trio) of detuned saws or triangles, one low-pass, slow swell. */
  function padChord(o, t0, fs, dur, vel, P) {
    const rel = P.rel || 0.5, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const uni = P.uni || 2, det = P.det || 0.0035, triWave = P.wave === 'tri';
    const no = fs.length * uni, ph = new Float64Array(no), dp = new Float64Array(no);
    for (let k = 0; k < no; k++) {
      const v = Math.floor(k / uni), u = k % uni, spread = uni === 1 ? 0 : (u / (uni - 1)) * 2 - 1;
      dp[k] = fs[v] * (1 + det * spread) / SR;
      ph[k] = (k * 0.618) % 1;
    }
    const on = dur * SR, aN = Math.max(1, (P.a || 0.25) * SR), rk = Math.exp(-5 / (rel * SR));
    const fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.3) / Math.sqrt(no);
    const svf = new Svf().set(P.cut || 1700, P.q || 0.7);
    let lvl = 0;
    for (let i = 0; i < n; i++) {
      lvl = adsrStep(i, lvl, aN, on, 1, 1, rk);
      let v = 0;
      for (let k = 0; k < no; k++) {
        let q = ph[k] + dp[k]; if (q >= 1) q -= 1; ph[k] = q;
        v += triWave ? tri(q) : saw(q, dp[k]);
      }
      v = svf.lp(v);
      const env = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += v * env * g;
    }
  }

  /** Distorted power chord (root, fifth, octave); `mute` gives the palm-muted chug. */
  function powerChord(o, t0, fs, dur, vel, P) {
    const rel = P.rel || 0.08, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const no = fs.length * 2, ph = new Float64Array(no), dp = new Float64Array(no);
    for (let k = 0; k < no; k++) { dp[k] = fs[k >> 1] * (k & 1 ? 1.003 : 0.997) / SR; ph[k] = (k * 0.37) % 1; }
    const on = dur * SR, aN = 0.003 * SR, rk = Math.exp(-5 / (rel * SR));
    const dk = Math.exp(-1 / ((P.mute ? 0.085 : 0.9) * SR)), sus = P.mute ? 0 : 0.6;
    const drive = P.drive || 4, dn = Math.tanh(drive), fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.4);
    const svf = new Svf().set(P.cut || 2300, 0.8), hp = new Svf().set(90, 0.7);
    let lvl = 0;
    for (let i = 0; i < n; i++) {
      lvl = adsrStep(i, lvl, aN, on, sus, dk, rk);
      let v = 0;
      for (let k = 0; k < no; k++) { let q = ph[k] + dp[k]; if (q >= 1) q -= 1; ph[k] = q; v += saw(q, dp[k]); }
      v = Math.tanh(v * 0.5 * drive) / dn;
      v = svf.lp(v - hp.lp(v));
      const env = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += v * env * g;
    }
  }

  /** Strummed chord from another instrument (calypso guitar, marimba off-beats, organ stabs). */
  function strumChord(o, t0, fs, dur, vel, P) {
    const inst = INSTR[P.inst], Q = Object.assign({}, inst.P, P.over || {});
    for (let k = 0; k < fs.length; k++) inst.fn(o, t0 + k * (P.strum || 0), fs[k], dur, vel * (k ? 0.85 : 1), Q);
  }

  /** Synth bass: saw or square through an envelope-swept low-pass, with a sine sub an octave down. */
  function bassNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.06, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const on = dur * SR, aN = 0.003 * SR, dk = Math.exp(-1 / ((P.d || 0.25) * SR)), sus = P.s === undefined ? 0.7 : P.s;
    const rk = Math.exp(-5 / (rel * SR)), sq = P.wave === 'sq', sub = P.sub || 0;
    const cut = P.cut || 500, env = P.env || 2, ek = Math.exp(-1 / ((P.envTau || 0.12) * SR));
    const fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.6), svf = new Svf();
    let p = 0, ps = 0, lvl = 0, ce = 1;
    for (let i = 0; i < n; i++) {
      lvl = adsrStep(i, lvl, aN, on, sus, dk, rk);
      const dt = f / SR;
      p += dt; if (p >= 1) p -= 1;
      ps += dt * 0.5; if (ps >= 1) ps -= 1;
      if ((i & 15) === 0) svf.set(cut * (1 + env * ce), P.q || 1.1);
      ce *= ek;
      let v = svf.lp(sq ? pulse(p, dt, 0.5) * 0.8 : saw(p, dt)) + sub * sn(ps);
      const e2 = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += v * e2 * g;
    }
  }

  /** Round sub bass: a sine with a touch of second harmonic and a punchy decay. */
  function subNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.07, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const on = dur * SR, aN = 0.004 * SR, dk = Math.exp(-1 / ((P.d || 0.3) * SR)), sus = P.s === undefined ? 0.65 : P.s;
    const rk = Math.exp(-5 / (rel * SR)), h2 = P.h2 || 0.2, fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.7);
    let p = 0, lvl = 0;
    for (let i = 0; i < n; i++) {
      lvl = adsrStep(i, lvl, aN, on, sus, dk, rk);
      p += f / SR; if (p >= 1) p -= 1;
      const v = sn(p) + h2 * sn(2 * p);
      const e2 = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += v * e2 * g;
    }
  }

  /** Candy "bloop": a sine that drops into pitch from above, like a bubble popping. */
  function bloopNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.15, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const drop = P.drop === undefined ? 1 : P.drop, dropK = Math.exp(-1 / (0.03 * SR));
    const dk = Math.exp(-1 / ((P.tau || 0.09) * SR)), fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.5);
    let p = 0, e = 1, bend = drop;
    for (let i = 0; i < n; i++) {
      p += f * (1 + bend) / SR; if (p >= 1) p -= 1;
      bend *= dropK;
      let env = e * (i < 20 ? i / 20 : 1);
      if (i > n - fade) env *= (n - i) / fade;
      o[i0 + i] += sn(p) * env * g;
      e *= dk;
    }
  }

  /**
   * Tuned timpani for bass-style parts, so the drum follows the chords (the
   * kits' timp is fixed in pitch): the kit drum's recipe at any pitch. A drum
   * is not damped by the gate; it rings for `rel` from every stroke.
   */
  function timpNote(o, t0, f, dur, vel, P) {
    const len = P.rel || 1.2, g = vel * (P.g || 0.6);
    tone(o, t0, len, f * 1.03, f, { w: 'sine', a: 0.004, d: P.tau || 0.55, g: 0.8 * g });
    tone(o, t0, len * 0.65, f * 1.51, f * 1.5, { w: 'sine', a: 0.004, d: 0.3, g: 0.3 * g });
    tone(o, t0, len * 0.4, f * 1.99, f * 1.98, { w: 'sine', a: 0.004, d: 0.2, g: 0.18 * g });
    noise(o, t0, 0.08, { type: 'lp', f0: 600, q: 0.7, d: 0.03, g: 0.3 * g });
  }

  /* The instrument table: parts and effects name an instrument and may
   * override any of its parameters. */
  const INSTR = {
    bell:     { rel: 1.3, fn: fmNote,     P: { mr: 3.5, ix: 3.0, ixEnd: 0.5, ixTau: 0.3, tau: 0.8, ring: 1, g: 0.42 } },
    bellSoft: { rel: 1.0, fn: fmNote,     P: { mr: 3.5, ix: 1.4, ixEnd: 0.3, ixTau: 0.2, tau: 0.55, ring: 1, g: 0.42 } },
    glock:    { rel: 0.9, fn: fmNote,     P: { mr: 4, ix: 1.1, ixEnd: 0.1, ixTau: 0.05, tau: 0.45, ring: 1, g: 0.42, p2: [2.76, 0.28, 0.12] } },
    celesta:  { rel: 1.0, fn: fmNote,     P: { mr: 5, ix: 0.8, ixEnd: 0.05, ixTau: 0.08, tau: 0.7, ring: 1, g: 0.42, p2: [2.0, 0.3, 0.3] } },
    steel:    { rel: 0.8, fn: fmNote,     P: { mr: 2, ix: 2.1, ixEnd: 0.45, ixTau: 0.09, tau: 0.5, ring: 1, g: 0.45, p2: [3.0, 0.16, 0.2] } },
    toy:      { rel: 0.6, fn: fmNote,     P: { mr: 3, ix: 1.9, ixEnd: 0.2, ixTau: 0.04, tau: 0.3, ring: 1, g: 0.45, p2: [5.2, 0.2, 0.03] } },
    ep:       { rel: 0.35, fn: fmNote,    P: { mr: 1, ix: 1.5, ixEnd: 0.35, ixTau: 0.25, tau: 1.0, sus: 0.25, g: 0.45, p2: [14, 0.08, 0.012] } },
    marimba:  { rel: 0.7, fn: malletNote, P: { parts: [[1, 1, 0.38], [3.98, 0.3, 0.07], [9.9, 0.07, 0.02]], click: 0.1, g: 0.55 } },
    xylo:     { rel: 0.45, fn: malletNote, P: { parts: [[1, 1, 0.18], [3.0, 0.42, 0.05], [6.1, 0.12, 0.02]], click: 0.15, g: 0.5 } },
    kalimba:  { rel: 0.8, fn: malletNote, P: { parts: [[1, 1, 0.5], [5.4, 0.2, 0.04], [2.0, 0.06, 0.2]], click: 0.06, g: 0.55 } },
    vibes:    { rel: 1.4, fn: malletNote, P: { parts: [[1, 1, 0.75], [4, 0.14, 0.1], [10, 0.03, 0.025]], click: 0.03, trem: 0.3, tr: 5.2, g: 0.5 } },
    pluck:    { rel: 0.3, fn: pluckNote,  P: { bright: 0.6, t60: 1.4, g: 0.55 } },
    surf:     { rel: 0.45, fn: pluckNote, P: { bright: 0.8, t60: 2.2, vib: 0.004, vr: 5.5, g: 0.5 } },
    oud:      { rel: 0.3, fn: pluckNote,  P: { bright: 0.88, t60: 1.1, g: 0.55 } },
    harp:     { rel: 1.0, fn: pluckNote,  P: { bright: 0.45, t60: 2.6, g: 0.5 } },
    pizz:     { rel: 0.12, fn: pluckNote, P: { bright: 0.5, t60: 0.45, g: 0.6 } },
    bassPluck:{ rel: 0.1, fn: pluckNote,  P: { bright: 0.28, t60: 1.2, body: 0.55, g: 0.7 } },
    lead:     { rel: 0.1, fn: leadNote,   P: { duty: 0.35, pwm: 0.08, vib: 0.005, cut: 3600, g: 0.4 } },
    chip:     { rel: 0.06, fn: leadNote,  P: { duty: 0.25, d: 0.08, s: 0, cut: 5200, g: 0.34 } },
    kazoo:    { rel: 0.08, fn: leadNote,  P: { duty: 0.13, pwm: 0.025, pwr: 1.3, vib: 0.011, vr: 6.2, vd: 0.06, scoop: 0.05, a: 0.01, d: 0.2, s: 0.85, cut: 2300, g: 0.42 } },
    sawLead:  { rel: 0.14, fn: sawNote,   P: { det: 0.004, cut: 2800, cutEnv: 0.8, cutTau: 0.2, vib: 0.006, g: 0.4 } },
    rockLead: { rel: 0.14, fn: sawNote,   P: { det: 0.003, cut: 2600, cutEnv: 0.5, cutTau: 0.25, vib: 0.008, drive: 2, g: 0.34 } },
    brass:    { rel: 0.1, fn: sawNote,    P: { det: 0.003, cut: 1900, cutAtk: 0.05, cutEnv: 0.9, cutTau: 0.18, q: 1.1, scoop: 0.025, vib: 0.005, vd: 0.25, a: 0.02, g: 0.45 } },
    organ:    { rel: 0.05, fn: organNote, P: { g: 0.45 } },
    flute:    { rel: 0.12, fn: fluteNote, P: { h2: 0.25, h3: 0.08, breath: 0.1, a: 0.04, vib: 0.006, g: 0.5 } },
    whistle:  { rel: 0.08, fn: fluteNote, P: { h2: 0.02, h3: 0.05, breath: 0.035, a: 0.015, vib: 0.008, scoop: 0.03, g: 0.5 } },
    ney:      { rel: 0.2, fn: fluteNote,  P: { h2: 0.18, h3: 0.1, breath: 0.22, a: 0.07, vib: 0.01, vr: 4.8, g: 0.5 } },
    calliope: { rel: 0.06, fn: fluteNote, P: { h2: 0.4, h3: 0.28, breath: 0.12, a: 0.012, vib: 0.014, vr: 7, vd: 0.05, scoop: 0.015, g: 0.45 } },
    pad:      { rel: 0.6, chord: 1, fn: padChord,   P: { uni: 2, det: 0.0035, cut: 1700, a: 0.25, g: 0.3 } },
    warmPad:  { rel: 0.8, chord: 1, fn: padChord,   P: { wave: 'tri', uni: 2, det: 0.003, cut: 1400, a: 0.4, g: 0.36 } },
    supersaw: { rel: 0.5, chord: 1, fn: padChord,   P: { uni: 3, det: 0.006, cut: 2400, a: 0.08, g: 0.28 } },
    power:    { rel: 0.08, chord: 1, fn: powerChord, P: { g: 0.4 } },
    stab:     { rel: 0.3, chord: 1, fn: strumChord, P: { inst: 'pluck', strum: 0.009, over: { t60: 0.5 } } },
    marStab:  { rel: 0.7, chord: 1, fn: strumChord, P: { inst: 'marimba', strum: 0.004 } },
    organStab:{ rel: 0.05, chord: 1, fn: strumChord, P: { inst: 'organ', strum: 0 } },
    epStab:   { rel: 0.35, chord: 1, fn: strumChord, P: { inst: 'ep', strum: 0.003 } },
    bass:     { rel: 0.06, fn: bassNote,  P: { wave: 'saw', cut: 480, env: 3, envTau: 0.12, sub: 0.45, g: 0.6 } },
    bassSq:   { rel: 0.06, fn: bassNote,  P: { wave: 'sq', cut: 650, env: 2, envTau: 0.1, sub: 0.35, g: 0.55 } },
    sub:      { rel: 0.08, fn: subNote,   P: { h2: 0.22, g: 0.72 } },
    timp:     { rel: 1.2, fn: timpNote,   P: { tau: 0.55, g: 0.6 } },
    bloop:    { rel: 0.16, fn: bloopNote, P: { drop: 1, tau: 0.09, g: 0.5 } }
  };

  /** Draw a note with a named instrument: inst('bell', o, t0, hz, dur, vel, { overrides }). */
  function inst(name, o, t0, f, dur, vel, over) {
    const I = INSTR[name];
    I.fn(o, t0, f, dur, vel, over ? Object.assign({}, I.P, { rel: I.rel }, over) : Object.assign({ rel: I.rel }, I.P));
  }

  /* ── Drum kit ─────────────────────────────────────────────────────────────
   * Each drum renders once per song into its own buffer, then every hit is a
   * scaled copy — far cheaper than synthesising each hit.
   */
  const DRUMS = {
    kick(P) {
      const o = new Float32Array(Math.round(0.45 * SR)), f0 = P.f0 || 150, f1 = P.f1 || 48, tau = P.tau || 0.17;
      const pk = Math.exp(-1 / (0.035 * SR)), ak = Math.exp(-1 / (tau * SR));
      let p = 0, bend = 1, a = 1, lpc = 0;
      for (let i = 0; i < o.length; i++) {
        p += (f1 + (f0 - f1) * bend) / SR; if (p >= 1) p -= 1;
        bend *= pk;
        let v = sn(p) * a;
        if (i < 0.003 * SR) { lpc += 0.4 * (nz() - lpc); v += (P.click === undefined ? 0.35 : P.click) * lpc; }
        o[i] = Math.tanh(v * 1.6) * 0.9;
        a *= ak;
      }
      return fadeEnd(o);
    },
    snare(P) {
      const o = new Float32Array(Math.round(0.35 * SR)), tone0 = P.tone || 185;
      tone(o, 0, 0.12, tone0 * 1.25, tone0, { w: 'sine', a: 0.001, d: 0.045, g: 0.55 });
      tone(o, 0, 0.08, tone0 * 1.8, tone0 * 1.7, { w: 'sine', a: 0.001, d: 0.03, g: 0.25 });
      noise(o, 0, 0.3, { type: 'hp', f0: P.hp || 1400, q: 0.7, a: 0.001, d: P.snap || 0.1, g: 0.7 });
      noise(o, 0, 0.1, { type: 'bp', f0: 4200, q: 0.9, a: 0.001, d: 0.04, g: 0.35 });
      return fadeEnd(o);
    },
    clap(P) {
      const o = new Float32Array(Math.round(0.3 * SR));
      for (let k = 0; k < 3; k++) noise(o, k * 0.009, 0.012, { type: 'bp', f0: 1300, q: 1.3, a: 0.0005, d: 0.004, g: 0.8 });
      noise(o, 0.025, 0.25, { type: 'bp', f0: 1200, q: 1.1, a: 0.001, d: P.tail || 0.07, g: 0.7 });
      return fadeEnd(o);
    },
    hat(P) {
      const tau = P.tau || 0.035, o = new Float32Array(Math.round(Math.min(0.6, tau * 7 + 0.02) * SR));
      noise(o, 0, o.length / SR, { type: 'hp', f0: P.hp || 7200, q: 0.8, a: 0.0005, d: tau, g: 0.8 });
      noise(o, 0, o.length / SR, { type: 'bp', f0: 9000, q: 1.5, a: 0.0005, d: tau * 0.8, g: 0.4 });
      return fadeEnd(o);
    },
    shaker(P) {
      const o = new Float32Array(Math.round(0.12 * SR));
      noise(o, 0, 0.11, { type: 'bp', f0: P.f || 5800, q: 1.1, a: 0.012, d: 0.035, g: 0.8 });
      return fadeEnd(o);
    },
    tamb(P) {
      const o = new Float32Array(Math.round(0.3 * SR));
      noise(o, 0, 0.28, { type: 'bp', f0: 6800, q: 2.2, a: 0.002, d: 0.08, g: 0.8, am: [28, 0.5] });
      [5100, 6320, 7450].forEach((f) => tone(o, 0, 0.2, f, f, { w: 'sine', a: 0.001, d: 0.05, g: 0.12 }));
      return fadeEnd(o);
    },
    crash(P) {
      const o = new Float32Array(Math.round(1.6 * SR));
      noise(o, 0, 1.6, { type: 'hp', f0: 3000, q: 0.6, a: 0.002, d: P.tau || 0.55, g: 0.7 });
      noise(o, 0, 1.2, { type: 'bp', f0: 5200, q: 1.2, a: 0.002, d: 0.35, g: 0.35 });
      [333, 478, 587, 741, 902].forEach((f, k) => tone(o, 0, 1.2, f * 3.1, f * 3.1, { w: 'sq', a: 0.001, d: 0.25 + k * 0.05, g: 0.03 }));
      highpass(o, 900, false);
      return fadeEnd(o);
    },
    ride(P) {
      const o = new Float32Array(Math.round(0.9 * SR));
      noise(o, 0, 0.9, { type: 'hp', f0: 5500, q: 0.8, a: 0.001, d: 0.28, g: 0.35 });
      [3130, 4410, 5270].forEach((f) => tone(o, 0, 0.8, f, f, { w: 'sine', a: 0.001, d: 0.3, g: 0.15 }));
      return fadeEnd(o);
    },
    tom(P) {
      const f = P.f || 130, o = new Float32Array(Math.round(0.45 * SR));
      tone(o, 0, 0.42, f * 1.6, f, { w: 'sine', a: 0.001, d: 0.14, g: 0.8 });
      noise(o, 0, 0.03, { type: 'lp', f0: 2500, q: 0.7, d: 0.01, g: 0.15 });
      return fadeEnd(o);
    },
    conga(P) {
      const f = P.f || 300, o = new Float32Array(Math.round(0.3 * SR));
      tone(o, 0, 0.28, f * 1.12, f, { w: 'sine', a: 0.0015, d: P.tau || 0.09, g: 0.8 });
      tone(o, 0, 0.1, f * 2.3, f * 2.2, { w: 'sine', a: 0.001, d: 0.02, g: 0.12 });
      noise(o, 0, 0.012, { type: 'bp', f0: 2200, q: 1, d: 0.004, g: 0.25 });
      return fadeEnd(o);
    },
    doum(P) {                    // darbuka low stroke
      const o = new Float32Array(Math.round(0.4 * SR));
      tone(o, 0, 0.38, 140, 92, { w: 'sine', a: 0.001, d: 0.16, g: 0.85 });
      tone(o, 0, 0.2, 200, 185, { w: 'sine', a: 0.001, d: 0.06, g: 0.2 });
      return fadeEnd(o);
    },
    tek(P) {                     // darbuka rim stroke
      const o = new Float32Array(Math.round(0.14 * SR));
      noise(o, 0, 0.1, { type: 'bp', f0: P.f || 3200, q: 2, a: 0.0005, d: 0.02, g: 0.8 });
      tone(o, 0, 0.06, 720, 700, { w: 'sine', a: 0.0005, d: 0.018, g: 0.35 });
      return fadeEnd(o);
    },
    clave(P) {
      const o = new Float32Array(Math.round(0.12 * SR)), f = P.f || 2500;
      tone(o, 0, 0.1, f, f, { w: 'sine', a: 0.0005, d: 0.022, g: 0.8 });
      return fadeEnd(o);
    },
    rim(P) {
      const o = new Float32Array(Math.round(0.08 * SR));
      noise(o, 0, 0.06, { type: 'bp', f0: 1700, q: 6, a: 0.0005, d: 0.012, g: 1.2 });
      tone(o, 0, 0.04, 820, 800, { w: 'tri', d: 0.01, g: 0.3 });
      return fadeEnd(o);
    },
    wood(P) {
      const o = new Float32Array(Math.round(0.1 * SR)), f = P.f || 1150;
      tone(o, 0, 0.09, f, f * 0.98, { w: 'sine', a: 0.0005, d: 0.03, g: 0.8 });
      tone(o, 0, 0.03, f * 2.7, f * 2.7, { w: 'sine', a: 0.0005, d: 0.006, g: 0.2 });
      return fadeEnd(o);
    },
    sleigh(P) {
      const o = new Float32Array(Math.round(0.25 * SR)), r = prng(77);
      for (let k = 0; k < 6; k++) noise(o, r() * 0.06, 0.12, { type: 'bp', f0: 6500 + r() * 2500, q: 5, a: 0.001, d: 0.03, g: 0.5 });
      return fadeEnd(o);
    },
    timp(P) {
      const f = P.f || 98, o = new Float32Array(Math.round(1.3 * SR));
      tone(o, 0, 1.25, f * 1.03, f, { w: 'sine', a: 0.004, d: 0.55, g: 0.8 });
      tone(o, 0, 0.8, f * 1.51, f * 1.5, { w: 'sine', a: 0.004, d: 0.3, g: 0.3 });
      tone(o, 0, 0.5, f * 1.99, f * 1.98, { w: 'sine', a: 0.004, d: 0.2, g: 0.18 });
      noise(o, 0, 0.08, { type: 'lp', f0: 600, q: 0.7, d: 0.03, g: 0.3 });
      return fadeEnd(o);
    },
    snap(P) {
      const o = new Float32Array(Math.round(0.08 * SR));
      noise(o, 0, 0.06, { type: 'bp', f0: 2300, q: 2.5, a: 0.0005, d: 0.012, g: 1.1 });
      return fadeEnd(o);
    },
    brush(P) {
      const o = new Float32Array(Math.round(0.25 * SR));
      noise(o, 0, 0.24, { type: 'bp', f0: 3600, q: 0.8, a: 0.015, d: 0.07, g: 0.7 });
      return fadeEnd(o);
    },
    anvil(P) {                   // a struck steel bar: a hard strike, then a bright inharmonic clang
      const f = P.f || 780, o = new Float32Array(Math.round(0.8 * SR));
      [[1, 0.5, 0.3], [2.76, 0.3, 0.18], [5.4, 0.18, 0.1], [8.93, 0.08, 0.05]].forEach(([r, g, d]) =>
        tone(o, 0, 0.78, f * r, f * r, { w: 'sine', a: 0.0005, d, g }));
      noise(o, 0, 0.03, { type: 'bp', f0: 3500, q: 1.2, a: 0.0003, d: 0.006, g: 0.6 });
      return fadeEnd(o);
    }
  };

  function fadeEnd(o) {
    const f = Math.min(o.length, Math.round(0.004 * SR));
    for (let i = 0; i < f; i++) o[o.length - 1 - i] *= i / f;
    return o;
  }

  /* ── Effect-drawing helpers ───────────────────────────────────────────── */

  const WAVE_ID = { sine: 0, tri: 1, saw: 2, sq: 3 };

  /**
   * An oscillator note added into o: pitch f0 → f1 on an exponential glide,
   * optional vibrato [rateHz, depth], attack a, exponential decay time d
   * (0 = none), linear release r at the end, optional one-pole lowpass lp.
   */
  function tone(o, t0, dur, f0, f1, q) {
    const w = WAVE_ID[q.w || 'sine'], g = q.g === undefined ? 0.5 : q.g, a = q.a === undefined ? 0.004 : q.a;
    const r = q.r === undefined ? Math.min(0.04, dur * 0.3) : q.r;
    const i0 = Math.round(t0 * SR), n = Math.min(Math.round(dur * SR), o.length - i0);
    if (n <= 0 || i0 < 0) return;
    const fk = Math.pow(f1 / f0, 1 / n), dk = q.d ? Math.exp(-1 / (q.d * SR)) : 1;
    const aN = Math.max(1, a * SR), rN = Math.max(1, r * SR);
    const vr = q.vib ? q.vib[0] / SR : 0, vd = q.vib ? q.vib[1] : 0;
    const lpA = q.lp ? onePoleA(q.lp) : 1, duty = q.duty || 0.5;
    let f = f0, p = q.ph || 0, e = 1, y = 0;
    for (let i = 0; i < n; i++) {
      const fi = vd ? f * (1 + vd * sn(i * vr)) : f;
      const dt = fi / SR;
      p += dt; if (p >= 1) p -= Math.floor(p);
      const v = w === 0 ? sn(p) : w === 1 ? tri(p) : w === 2 ? saw(p, dt) : pulse(p, dt, duty);
      y += lpA * (v - y);
      let env = e;
      if (i < aN) env *= i / aN;
      if (i > n - rN) env *= (n - i) / rN;
      o[i0 + i] += y * env * g;
      f *= fk; e *= dk;
    }
  }

  /**
   * Filtered noise added into o: filter type 'lp' | 'hp' | 'bp' | 'none' with
   * cutoff sweeping f0 → f1, colour 'white' | 'pink' | 'brown', amplitude
   * modulation am [rateHz, depth] (crackle, flutter), envelope as for tone().
   */
  function noise(o, t0, dur, q) {
    const g = q.g === undefined ? 0.5 : q.g, a = q.a === undefined ? 0.002 : q.a;
    const r = q.r === undefined ? Math.min(0.04, dur * 0.3) : q.r;
    const i0 = Math.round(t0 * SR), n = Math.min(Math.round(dur * SR), o.length - i0);
    if (n <= 0 || i0 < 0) return;
    const type = q.type || 'lp', f0 = q.f0 || 1000, f1 = q.f1 || f0, fk = Math.pow(f1 / f0, 1 / n), Q = q.q || 0.707;
    const bq = new Biquad(), dk = q.d ? Math.exp(-1 / (q.d * SR)) : 1;
    const aN = Math.max(1, a * SR), rN = Math.max(1, r * SR);
    const amr = q.am ? q.am[0] / SR : 0, amd = q.am ? q.am[1] : 0, color = q.color || 'white';
    let f = f0, e = 1, b0 = 0, b1 = 0, b2 = 0, br = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0 && type !== 'none') bq.set(type, f, Q);
      let x = nz();
      if (color === 'pink') {       // Paul Kellet's economy pink filter
        b0 = 0.99765 * b0 + x * 0.099046; b1 = 0.963 * b1 + x * 0.2965164; b2 = 0.57 * b2 + x * 1.0526913;
        x = (b0 + b1 + b2 + x * 0.1848) * 0.2;
      } else if (color === 'brown') { br = (br + 0.02 * x) / 1.02; x = br * 3.5; }
      const y = type === 'none' ? x : bq.run(x);
      let env = e;
      if (i < aN) env *= i / aN;
      if (i > n - rN) env *= (n - i) / rN;
      if (amd) env *= 1 - amd * (0.5 + 0.5 * sn(i * amr));
      o[i0 + i] += y * env * g;
      f *= fk; e *= dk;
    }
  }

  /** Random crackle: sparse, sharp clicks (sparks, gravel, electricity). */
  function crackle(o, t0, dur, rate, g, rnd, hpHz) {
    const tmp = new Float32Array(o.length);
    const count = Math.round(rate * dur);
    for (let k = 0; k < count; k++) {
      const t = t0 + rnd() * dur, i = Math.round(t * SR);
      const amp = g * (0.3 + 0.7 * rnd()) * (rnd() < 0.5 ? -1 : 1), len = 8 + Math.floor(rnd() * 30);
      for (let j = 0; j < len && i + j < o.length; j++) tmp[i + j] += amp * Math.exp(-j / (len * 0.3)) * nz();
    }
    biquadPass(tmp, 'hp', hpHz || 1800, 0.7, false);
    for (let i = 0; i < o.length; i++) o[i] += tmp[i];
  }

  /** Add a short plate reverb tail to a mono one-shot. */
  function verb(o, wet, size) {
    const L = new Float32Array(o.length), R = new Float32Array(o.length);
    reverb(o, L, R, size || 0.75, 0.35, 1, false);
    for (let i = 0; i < o.length; i++) o[i] += (L[i] + R[i]) * 0.5 * wet;
  }

  /** Mix a pre-rendered drum into an effect at t seconds. */
  function addDrum(o, name, P, t, g) {
    const d = DRUMS[name](P || {}), i0 = Math.round(t * SR);
    for (let i = 0; i < d.length && i0 + i < o.length; i++) o[i0 + i] += d[i] * g;
  }

  /** A bright metallic coin "tiing" (glockenspiel-like partials, no second note). */
  function coinPing(o, t0, f, g) {
    malletNote(o, t0, f, 0.05, g, { parts: [[1, 1, 0.16], [2.76, 0.45, 0.05], [5.4, 0.16, 0.018]], click: 0.05, rel: 0.45, g: 0.6 });
    malletNote(o, t0 + 0.028, f * 2, 0.05, g * 0.35, { parts: [[1, 1, 0.08]], click: 0, rel: 0.3, g: 0.6 });
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 3. Sound-effect catalogue
   * ══════════════════════════════════════════════════════════════════════
   * def(name, seconds, level, draw, opts)
   *   level  target loudness in dB (loudest 250 ms). The render is peak
   *          normalised to -1 dBFS for resolution and its play volume is
   *          derived from this, so every effect lands where it was designed
   *          to sit in the mix instead of wherever its waveform happened to.
   *   opts.crit  never ducked under speech (menus, countdown, guidance)
   *   opts.pans  'LR' | 'L' | 'R': also render pre-panned stereo variants,
   *              chosen by play(name, { pan }) in split-screen races
   *   opts.verb  [wet, size]: a short plate tail
   *   opts.lim   dB driven into the limiter (denser explosions and impacts)
   * All originals: no melody, rhythm or timbre borrowed from any other game.
   */
  const SFX = {};
  function def(name, len, level, draw, opts) {
    const o = opts || {};
    SFX[name] = { name, len, level, draw, crit: !!o.crit, pans: o.pans || '', verb: o.verb || null, lim: o.lim || 0 };
  }

  /* ── Menus ───────────────────────────────────────────────────────────── */
  def('menuMove', 0.09, -26, (o) => {
    // A soft wooden tick, short enough to sit under the spoken label.
    tone(o, 0, 0.055, 1250, 1180, { w: 'tri', a: 0.0015, d: 0.016, g: 0.8 });
    tone(o, 0, 0.03, 2500, 2400, { w: 'sine', a: 0.001, d: 0.007, g: 0.25 });
  }, { crit: 1 });

  def('menuSelect', 0.5, -23, (o) => {
    // Two rising bell notes: "yes, that one".
    inst('bellSoft', o, 0, midiHz(84), 0.1, 0.8);
    inst('bellSoft', o, 0.075, midiHz(91), 0.2, 0.9);
  }, { crit: 1 });

  def('menuBlocked', 0.28, -25, (o) => {
    // A dull, low double bump: clearly "not available", never harsh.
    tone(o, 0, 0.09, 210, 180, { w: 'tri', a: 0.003, d: 0.04, g: 0.7, lp: 1200 });
    tone(o, 0.11, 0.12, 180, 150, { w: 'tri', a: 0.003, d: 0.05, g: 0.7, lp: 1000 });
  }, { crit: 1 });

  /* ── Start ───────────────────────────────────────────────────────────── */
  def('countdown', 0.42, -21, (o) => {
    // 3 · 2 · 1: a round, bright beep (softened pulse over a sine body).
    tone(o, 0, 0.26, 659.3, 659.3, { w: 'sq', a: 0.004, r: 0.05, g: 0.3, lp: 2600 });
    tone(o, 0, 0.26, 659.3, 659.3, { w: 'sine', a: 0.004, r: 0.05, g: 0.4 });
    tone(o, 0, 0.18, 1318.5, 1318.5, { w: 'sine', a: 0.004, d: 0.06, g: 0.12 });
  }, { crit: 1, verb: [0.12, 0.6] });

  def('go', 1.2, -18, (o) => {
    // GO: an octave up with a fifth on top, a lift underneath and a whoosh.
    tone(o, 0, 0.62, 1318.5, 1318.5, { w: 'sq', a: 0.004, r: 0.2, g: 0.24, lp: 3200 });
    tone(o, 0, 0.62, 1318.5, 1318.5, { w: 'sine', a: 0.004, r: 0.2, g: 0.35 });
    tone(o, 0, 0.62, 1975.5, 1975.5, { w: 'sine', a: 0.004, r: 0.2, g: 0.15 });
    tone(o, 0, 0.5, 220, 660, { w: 'saw', a: 0.01, r: 0.2, g: 0.12, lp: 1800 });
    noise(o, 0, 0.7, { type: 'bp', f0: 600, f1: 4000, q: 1.2, a: 0.05, r: 0.3, g: 0.25 });
  }, { crit: 1, verb: [0.15, 0.7] });

  /* ── Power Boxes and items ───────────────────────────────────────────── */
  def('boxSmash', 0.62, -22, (o, r) => {
    // The box bursts: a plastic crack, a hollow thump, bright shards, then a sparkle.
    noise(o, 0, 0.16, { type: 'hp', f0: 2000, q: 0.7, a: 0.0005, d: 0.04, g: 0.6 });
    noise(o, 0, 0.07, { type: 'bp', f0: 900, q: 1.3, a: 0.0005, d: 0.025, g: 0.45 });
    tone(o, 0, 0.1, 190, 95, { w: 'sine', a: 0.001, d: 0.035, g: 0.55 });
    for (let k = 0; k < 8; k++) {
      const t = 0.004 + r() * 0.11, f = 2300 + r() * 3000;
      tone(o, t, 0.05, f, f * 0.92, { w: 'sine', a: 0.0005, d: 0.014, g: 0.16 });
    }
    [88, 92, 95, 100].forEach((m, k) => inst('glock', o, 0.05 + k * 0.035, midiHz(m), 0.08, 0.45 - k * 0.05));
  }, { pans: 'LR' });

  // Roulette: tick and tock alternate; the last few drop lower as the wheel slows.
  [[0, 1568], [1, 1175], [2, 1319], [3, 988]].forEach(([k, f]) => def('rouletteTick:' + k, 0.06, -27, (o) => {
    tone(o, 0, 0.035, f, f * 0.98, { w: 'tri', a: 0.0008, d: 0.011, g: 0.8 });
    tone(o, 0, 0.012, f * 2, f * 2, { w: 'sine', a: 0.0005, d: 0.004, g: 0.2 });
  }));

  // Item reveal, three flavours: common, good, rare (see ITEM_FLAVOR).
  def('itemGet:common', 0.75, -22, (o) => {
    inst('bell', o, 0, midiHz(88), 0.12, 0.7);
    inst('bell', o, 0.09, midiHz(95), 0.3, 0.8);
  }, { verb: [0.15, 0.7] });
  def('itemGet:good', 0.95, -21, (o) => {
    [84, 88, 91, 96].forEach((m, k) => inst('bell', o, k * 0.07, midiHz(m), 0.15, 0.6 + k * 0.08));
  }, { verb: [0.18, 0.75] });
  def('itemGet:rare', 1.35, -20, (o) => {
    [0, 2, 4, 7, 9, 12, 14, 16].forEach((d, k) => inst('glock', o, k * 0.035, midiHz(79 + d), 0.1, 0.35 + k * 0.04));
    [84, 88, 91].forEach((m) => inst('bell', o, 0.32, midiHz(m + 12), 0.5, 0.42));
    noise(o, 0.3, 0.9, { type: 'hp', f0: 6000, q: 0.7, a: 0.05, d: 0.3, g: 0.06, am: [18, 0.7] });
  }, { verb: [0.22, 0.8] });

  def('use:rocket', 1.0, -20, (o, r) => {
    // Rocket: an ignition pop, a roaring whoosh that climbs, a rising engine note.
    noise(o, 0, 0.05, { type: 'lp', f0: 1200, q: 0.7, d: 0.02, g: 0.5 });
    noise(o, 0.02, 0.9, { type: 'bp', f0: 380, f1: 3200, q: 1.1, a: 0.03, r: 0.35, g: 0.7 });
    noise(o, 0.02, 0.9, { type: 'lp', f0: 300, f1: 900, q: 0.7, a: 0.02, r: 0.4, g: 0.35, color: 'brown' });
    tone(o, 0.02, 0.8, 140, 520, { w: 'saw', a: 0.02, r: 0.3, g: 0.14, lp: 1600 });
    crackle(o, 0.05, 0.7, 60, 0.35, r, 2500);
  }, { pans: 'LR' });

  def('use:goldrocket', 1.5, -19, (o, r) => {
    // Golden Rocket: the rocket roar, longer and richer, with a golden sparkle on top.
    noise(o, 0, 0.05, { type: 'lp', f0: 1200, q: 0.7, d: 0.02, g: 0.5 });
    noise(o, 0.02, 1.35, { type: 'bp', f0: 330, f1: 3600, q: 1.1, a: 0.03, r: 0.5, g: 0.7 });
    tone(o, 0.02, 1.2, 130, 620, { w: 'saw', a: 0.02, r: 0.4, g: 0.15, lp: 1800 });
    crackle(o, 0.05, 1.1, 70, 0.3, r, 2500);
    [84, 88, 91, 96, 100].forEach((m, k) => inst('glock', o, 0.1 + k * 0.06, midiHz(m), 0.1, 0.4));
  }, { pans: 'LR' });

  def('use:jet', 1.4, -19, (o, r) => {
    // Jet Mode: a deep afterburner roar that settles into a steady thrust.
    noise(o, 0, 1.35, { type: 'lp', f0: 400, f1: 1800, q: 0.8, a: 0.05, r: 0.5, g: 0.8, color: 'brown' });
    noise(o, 0, 1.35, { type: 'bp', f0: 900, f1: 2400, q: 1.4, a: 0.1, r: 0.5, g: 0.35 });
    tone(o, 0, 1.3, 70, 130, { w: 'saw', a: 0.05, r: 0.5, g: 0.22, lp: 700 });
    tone(o, 0.1, 1.2, 880, 1760, { w: 'sine', a: 0.2, r: 0.5, g: 0.06 });
    crackle(o, 0, 1.2, 50, 0.25, r, 2200);
  }, { pans: 'LR' });

  def('use:mega', 1.25, -20, (o) => {
    // Mega Grow: a climbing square-wave arpeggio over a deepening growth "whoomp".
    [48, 52, 55, 60, 64, 67, 72].forEach((m, k) => tone(o, k * 0.08, 0.14, midiHz(m + 12), midiHz(m + 12), { w: 'sq', a: 0.003, d: 0.08, g: 0.2, lp: 2600 }));
    tone(o, 0, 1.15, 180, 55, { w: 'saw', a: 0.02, r: 0.3, g: 0.22, lp: 700 });
    tone(o, 0, 1.15, 90, 28, { w: 'sine', a: 0.02, r: 0.3, g: 0.4 });
  }, { pans: 'LR' });

  def('use:coins', 0.85, -22, (o) => {
    // Coin Bag: three bright pings tumbling out of a pouch.
    [0, 0.08, 0.15].forEach((t, k) => coinPing(o, t, midiHz(88 + [0, 4, 7][k]), 0.7));
    noise(o, 0, 0.06, { type: 'lp', f0: 800, q: 0.7, d: 0.02, g: 0.3 });
  }, { pans: 'LR' });

  def('use:bomb', 0.85, -22, (o) => {
    // Boom Box lobbed: a launch thump, a rising lob whistle and a fizzing fuse.
    tone(o, 0, 0.12, 160, 90, { w: 'sine', a: 0.002, d: 0.05, g: 0.6 });
    tone(o, 0.05, 0.55, 500, 900, { w: 'sine', a: 0.02, r: 0.15, g: 0.18 });
    noise(o, 0.05, 0.7, { type: 'bp', f0: 5000, q: 2, a: 0.02, r: 0.2, g: 0.18, am: [37, 0.7] });
  }, { pans: 'LR' });

  def('use:star', 1.05, -20, (o) => {
    // Super Star sting: a glittering climb (the looping jingle is starStart()).
    [0, 4, 7, 11, 12, 16, 19, 23].forEach((d, k) => inst('glock', o, k * 0.045, midiHz(76 + d), 0.1, 0.4 + k * 0.03));
    noise(o, 0, 0.95, { type: 'hp', f0: 5000, q: 0.7, a: 0.2, r: 0.3, g: 0.07, am: [24, 0.8] });
  }, { pans: 'LR', verb: [0.2, 0.8] });

  def('peelDrop', 0.45, -23, (o) => {
    // A banana peel slapped onto the road: a wet splat and a slippery squeak.
    tone(o, 0, 0.12, 420, 120, { w: 'sine', a: 0.001, d: 0.05, g: 0.6 });
    noise(o, 0, 0.12, { type: 'lp', f0: 1800, f1: 500, q: 0.8, a: 0.001, d: 0.04, g: 0.5 });
    tone(o, 0.12, 0.18, 900, 1500, { w: 'sine', a: 0.01, r: 0.06, g: 0.18, vib: [22, 0.05] });
  }, { pans: 'LR' });

  def('ballLaunch', 0.7, -21, (o) => {
    // Bumper Ball: a punchy "thoomp" out of the launcher, a boing, then a rolling rumble.
    tone(o, 0, 0.14, 220, 70, { w: 'sine', a: 0.001, d: 0.06, g: 0.8 });
    noise(o, 0, 0.06, { type: 'lp', f0: 900, q: 0.7, d: 0.02, g: 0.35 });
    tone(o, 0.05, 0.25, 260, 520, { w: 'tri', a: 0.01, r: 0.08, g: 0.25, vib: [11, 0.04] });
    noise(o, 0.1, 0.55, { type: 'lp', f0: 260, q: 1.5, a: 0.05, r: 0.3, g: 0.35, am: [13, 0.6] });
  }, { pans: 'LR' });

  def('beeLaunch', 1.0, -21, (o) => {
    // Homing Bee: an angry buzz that zips off ahead.
    tone(o, 0, 0.95, 190, 290, { w: 'saw', a: 0.02, r: 0.4, g: 0.25, lp: 2200, vib: [31, 0.06] });
    tone(o, 0, 0.95, 380, 580, { w: 'sq', duty: 0.3, a: 0.02, r: 0.4, g: 0.1, lp: 3000, vib: [29, 0.05] });
    noise(o, 0, 0.9, { type: 'bp', f0: 1800, q: 2, a: 0.02, r: 0.4, g: 0.12, am: [31, 0.8] });
  }, { pans: 'LR' });

  def('zapperSiren', 1.8, -22, (o, r) => {
    // Leader Zapper overhead: a warbling siren that climbs, with electric fizz.
    tone(o, 0, 1.7, 620, 900, { w: 'tri', a: 0.08, r: 0.4, g: 0.45, vib: [4.5, 0.16] });
    tone(o, 0, 1.7, 1240, 1800, { w: 'sine', a: 0.08, r: 0.4, g: 0.12, vib: [4.5, 0.16] });
    crackle(o, 0.1, 1.5, 45, 0.25, r, 3000);
  });

  def('zap', 1.0, -18, (o, r) => {
    // The Zapper strikes: a lightning crack, a falling zap, sizzle and a thunder body.
    noise(o, 0, 0.12, { type: 'hp', f0: 1500, q: 0.7, a: 0.0005, d: 0.035, g: 0.8 });
    tone(o, 0, 0.5, 2400, 180, { w: 'saw', a: 0.001, d: 0.15, g: 0.3, lp: 5000 });
    crackle(o, 0.02, 0.7, 140, 0.5, r, 2000);
    noise(o, 0, 0.9, { type: 'lp', f0: 160, q: 0.7, a: 0.002, d: 0.25, g: 0.5, color: 'brown' });
  }, { lim: 4 });

  def('shrink', 1.0, -21, (o) => {
    // Shrink Ray: a wobbling "pew-wooo" that falls away.
    tone(o, 0, 0.9, 1400, 160, { w: 'sine', a: 0.005, r: 0.2, g: 0.5, vib: [9, 0.12] });
    tone(o, 0, 0.9, 2100, 240, { w: 'tri', a: 0.005, r: 0.2, g: 0.15, vib: [9, 0.12] });
  }, { verb: [0.18, 0.7] });

  def('horn', 1.0, -18, (o) => {
    // Honk Horn: a big two-honk "HONK-HONK" plus the shockwave's boom.
    const honk = (t, f) => {
      tone(o, t, 0.34, f, f * 0.985, { w: 'saw', a: 0.012, r: 0.06, g: 0.3, lp: 1700 });
      tone(o, t, 0.34, f * 1.26, f * 1.24, { w: 'sq', duty: 0.4, a: 0.012, r: 0.06, g: 0.18, lp: 1500 });
    };
    honk(0, 233); honk(0.36, 233);
    tone(o, 0.02, 0.7, 110, 38, { w: 'sine', a: 0.003, d: 0.25, g: 0.6 });
    noise(o, 0.02, 0.6, { type: 'lp', f0: 700, f1: 120, q: 0.7, a: 0.003, d: 0.2, g: 0.4 });
  }, { lim: 3 });

  def('bombBlast', 1.6, -16, (o, r) => {
    // Boom Box bursts: a sharp crack, a falling roar and a deep boom, debris after.
    noise(o, 0, 0.08, { type: 'hp', f0: 1200, q: 0.7, a: 0.0005, d: 0.03, g: 0.7 });
    noise(o, 0, 1.5, { type: 'lp', f0: 3200, f1: 180, q: 0.8, a: 0.001, d: 0.35, g: 0.9 });
    tone(o, 0, 1.2, 75, 32, { w: 'sine', a: 0.002, d: 0.4, g: 0.9 });
    crackle(o, 0.08, 1.0, 50, 0.3, r, 1500);
  }, { lim: 5 });

  /* ── Hits and coins ──────────────────────────────────────────────────── */
  def('hit:spin', 1.1, -19, (o) => {
    // Spin-out: a thump, a tyre squeal and a cartoon slide-whistle spiralling down.
    tone(o, 0, 0.12, 160, 60, { w: 'sine', a: 0.001, d: 0.05, g: 0.7 });
    noise(o, 0, 0.1, { type: 'lp', f0: 1800, q: 0.7, d: 0.03, g: 0.4 });
    noise(o, 0.03, 0.6, { type: 'bp', f0: 2600, f1: 1900, q: 9, a: 0.02, r: 0.2, g: 0.35 });
    tone(o, 0.05, 0.95, 1300, 260, { w: 'sine', a: 0.02, r: 0.25, g: 0.4, vib: [7, 0.08] });
  }, { pans: 'LR' });

  def('hit:wobble', 0.7, -21, (o) => {
    // No-Fail wobble: a soft bonk and a "wub-wub". Clearly a bump, never a punishment.
    tone(o, 0, 0.1, 220, 140, { w: 'sine', a: 0.001, d: 0.04, g: 0.6 });
    tone(o, 0.04, 0.6, 330, 250, { w: 'tri', a: 0.02, r: 0.2, g: 0.45, vib: [6.5, 0.1], lp: 1800 });
  }, { pans: 'LR' });

  // Coins: one bright ping whose pitch climbs a pentatonic run as the purse fills.
  const COIN_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  COIN_STEPS.forEach((d, k) => def('coin:' + (k + 1), 0.5, -23, (o) => {
    coinPing(o, 0, midiHz(81 + d), 0.8);
  }));

  /* ── Driving ─────────────────────────────────────────────────────────── */
  [1, 2, 3].forEach((lv) => def('driftLevel:' + lv, 0.75, -25 + lv, (o, r) => {
    // A drift charge level (blue, orange, purple sparks): one more chime per level.
    const notes = [[88], [88, 95], [88, 92, 95, 100]][lv - 1];
    notes.forEach((m, k) => inst('glock', o, k * 0.05, midiHz(m), 0.1, 0.55 + 0.1 * k));
    crackle(o, 0, 0.3, 30 * lv, 0.15, r, 3500);
  }, { pans: 'LR' }));

  [1, 2, 3].forEach((lv) => def('turbo:' + lv, 0.55 + 0.25 * lv, -22 + lv, (o, r) => {
    // Mini-turbo: a spark pop and an exhaust "vrrm", bigger for each level.
    const d = 0.35 + 0.2 * lv;
    noise(o, 0, 0.05, { type: 'hp', f0: 2500, q: 0.7, d: 0.015, g: 0.5 });
    noise(o, 0.01, d, { type: 'bp', f0: 500, f1: 2600 + 600 * lv, q: 1.2, a: 0.01, r: d * 0.5, g: 0.6 });
    tone(o, 0.01, d, 110 + 20 * lv, 330 + 80 * lv, { w: 'saw', a: 0.01, r: d * 0.5, g: 0.18, lp: 1400 + 400 * lv });
    crackle(o, 0.02, d, 40 * lv, 0.3, r, 2000);
  }, { pans: 'LR' }));

  def('boostPad', 0.7, -21, (o) => {
    // Boost Pad: a bright electric "zzzip" rising through the chevrons.
    tone(o, 0, 0.5, 300, 1600, { w: 'sq', duty: 0.3, a: 0.005, r: 0.15, g: 0.18, lp: 3000, vib: [40, 0.03] });
    tone(o, 0, 0.5, 600, 3200, { w: 'sine', a: 0.005, r: 0.15, g: 0.12 });
    noise(o, 0, 0.6, { type: 'bp', f0: 800, f1: 5000, q: 1.3, a: 0.01, r: 0.25, g: 0.4 });
  }, { pans: 'LR' });

  def('bump', 0.25, -23, (o) => {
    // Kart against kart: a rubbery bumper thud.
    tone(o, 0, 0.14, 150, 70, { w: 'sine', a: 0.001, d: 0.045, g: 0.8 });
    tone(o, 0, 0.08, 420, 260, { w: 'tri', a: 0.001, d: 0.02, g: 0.2 });
    noise(o, 0, 0.05, { type: 'lp', f0: 1500, q: 0.7, d: 0.015, g: 0.35 });
  }, { pans: 'LR' });

  def('railRub', 0.4, -26, (o, r) => {
    // Guardrail scrape: bright metal grinding.
    noise(o, 0, 0.38, { type: 'bp', f0: 3100, q: 7, a: 0.01, r: 0.12, g: 0.8, am: [53, 0.6] });
    noise(o, 0, 0.38, { type: 'bp', f0: 5300, q: 9, a: 0.01, r: 0.12, g: 0.4, am: [71, 0.7] });
    crackle(o, 0, 0.35, 80, 0.2, r, 4000);
  }, { pans: 'LR' });

  def('wallScrape', 0.4, -25, (o, r) => {
    // Stone wall scrape: gritty and lower than the rail.
    noise(o, 0, 0.38, { type: 'lp', f0: 1300, q: 0.9, a: 0.01, r: 0.12, g: 0.8, am: [37, 0.7] });
    crackle(o, 0, 0.35, 120, 0.3, r, 1200);
  }, { pans: 'LR' });

  def('jump', 0.4, -23, (o) => {
    // Off the ramp: a springy lift.
    tone(o, 0, 0.3, 260, 740, { w: 'sine', a: 0.004, r: 0.1, g: 0.5 });
    tone(o, 0, 0.3, 520, 1480, { w: 'tri', a: 0.004, r: 0.1, g: 0.12 });
    noise(o, 0, 0.35, { type: 'bp', f0: 700, f1: 2400, q: 1, a: 0.03, r: 0.15, g: 0.25 });
  }, { pans: 'LR' });

  def('trick', 0.85, -21, (o) => {
    // A trick in the air: a whoosh and a "ta-da" sparkle.
    noise(o, 0, 0.35, { type: 'bp', f0: 600, f1: 3000, q: 1.2, a: 0.05, r: 0.15, g: 0.4 });
    inst('bell', o, 0.12, midiHz(91), 0.1, 0.6);
    inst('bell', o, 0.2, midiHz(96), 0.3, 0.75);
  }, { pans: 'LR', verb: [0.15, 0.7] });

  def('land', 0.35, -23, (o) => {
    // Touchdown: a solid thump and a tyre chirp.
    tone(o, 0, 0.2, 110, 45, { w: 'sine', a: 0.001, d: 0.07, g: 0.85 });
    noise(o, 0, 0.08, { type: 'lp', f0: 1200, q: 0.7, d: 0.025, g: 0.45 });
    noise(o, 0.02, 0.12, { type: 'bp', f0: 2400, q: 6, a: 0.005, d: 0.04, g: 0.2 });
  }, { pans: 'LR' });

  def('fall', 1.3, -21, (o) => {
    // Off the edge: a cartoon slide-whistle all the way down, then a far-off "poof".
    tone(o, 0, 1.05, 1100, 140, { w: 'sine', a: 0.02, r: 0.2, g: 0.5, vib: [6, 0.04] });
    noise(o, 0, 1.0, { type: 'bp', f0: 2000, f1: 400, q: 1, a: 0.05, r: 0.3, g: 0.18 });
    noise(o, 1.0, 0.28, { type: 'lp', f0: 700, q: 0.7, a: 0.005, d: 0.08, g: 0.3 });
  }, { pans: 'LR' });

  def('drone', 1.6, -23, (o) => {
    // Rescue Drone: whirring propellers lifting in, then a friendly chirp.
    tone(o, 0, 1.4, 100, 150, { w: 'saw', a: 0.15, r: 0.3, g: 0.22, lp: 1200, vib: [23, 0.05] });
    noise(o, 0, 1.4, { type: 'bp', f0: 700, q: 1.5, a: 0.15, r: 0.3, g: 0.25, am: [23, 0.8] });
    inst('bellSoft', o, 1.0, midiHz(84), 0.08, 0.5);
    inst('bellSoft', o, 1.1, midiHz(88), 0.15, 0.55);
  }, { pans: 'LR' });

  /* Set pieces (Wonder Cup). Both are heard often and close to the ear, so
   * they stay soft and round: pink and brown noise, nothing that leads above
   * about 2.5 kHz, slow attacks rather than cracks. */
  def('splash', 0.85, -23, (o, r) => {
    // Through the waterfall: a rush of spray that swells in fast, a soft wet
    // slap as the curtain parts, then droplets pattering away behind.
    noise(o, 0, 0.55, { type: 'bp', f0: 650, f1: 1500, q: 0.8, a: 0.05, d: 0.2, r: 0.2, g: 0.75, color: 'pink' });
    noise(o, 0.03, 0.75, { type: 'lp', f0: 2300, f1: 700, q: 0.7, a: 0.03, d: 0.22, r: 0.3, g: 0.45, am: [19, 0.45] });
    noise(o, 0.04, 0.14, { type: 'lp', f0: 900, q: 0.8, a: 0.004, d: 0.045, g: 0.4, color: 'brown' });
    tone(o, 0.04, 0.14, 240, 130, { w: 'sine', a: 0.003, d: 0.05, g: 0.12 });
    for (let k = 0; k < 10; k++) {
      // Each droplet a tiny rising "plip", fewer and quieter as they fall away.
      const t = 0.16 + 0.6 * k / 10 + r() * 0.05, f = 650 + r() * 750;
      tone(o, t, 0.05, f, f * 1.45, { w: 'sine', a: 0.002, d: 0.013, g: 0.16 * (1 - k / 13) });
    }
  }, { pans: 'LR', verb: [0.12, 0.6] });

  def('whoosh', 1.1, -24, (o) => {
    // Into the loop-the-loop: air rushing past, swelling and climbing as the
    // kart tips up the wall, then easing away; a hum underneath rises with it.
    noise(o, 0, 1.05, { type: 'bp', f0: 380, f1: 1700, q: 1.1, a: 0.45, r: 0.5, g: 0.95, color: 'pink' });
    noise(o, 0, 1.05, { type: 'lp', f0: 350, f1: 900, q: 0.7, a: 0.35, r: 0.55, g: 0.3, color: 'brown' });
    tone(o, 0.05, 0.95, 150, 330, { w: 'sine', a: 0.35, r: 0.45, g: 0.09, vib: [5, 0.01] });
    tone(o, 0.05, 0.95, 300, 660, { w: 'tri', a: 0.4, r: 0.45, g: 0.035, lp: 1200 });
  }, { pans: 'LR' });

  /* ── Laps, places, finishing ─────────────────────────────────────────── */
  def('lap', 1.15, -20, (o) => {
    // A new lap: a bright rising bell triad.
    [84, 88, 91].forEach((m, k) => inst('bell', o, k * 0.09, midiHz(m), 0.2, 0.7 + 0.05 * k));
  }, { verb: [0.2, 0.75] });

  def('finalLap', 2.0, -18, (o) => {
    // FINAL LAP: a snare roll into a brass "ba-da-da-DAAA" on D major.
    for (let k = 0; k < 10; k++) addDrum(o, 'snare', { snap: 0.06 }, k * 0.032, 0.12 + 0.05 * k);
    [[0.33, 74], [0.44, 74], [0.55, 74]].forEach(([t, m]) => {
      inst('brass', o, t, midiHz(m), 0.07, 0.85);
      inst('brass', o, t, midiHz(m - 5), 0.07, 0.55);
    });
    [81, 78, 74].forEach((m, k) => inst('brass', o, 0.68, midiHz(m), 0.85, k ? 0.6 : 0.9));
    addDrum(o, 'crash', {}, 0.68, 0.35);
  }, { verb: [0.18, 0.75] });

  def('finish:win', 3.2, -17, (o) => {
    // First place: a brass fanfare climbing to a held C major chord, bells and timpani.
    [[0, 67], [0.12, 72], [0.24, 76], [0.36, 79], [0.6, 76], [0.72, 79]].forEach(([t, m]) => {
      inst('brass', o, t, midiHz(m), 0.1, 0.85);
      inst('brass', o, t, midiHz(m - 12), 0.1, 0.4);
    });
    [84, 79, 76, 72].forEach((m, k) => inst('brass', o, 0.96, midiHz(m), 1.4, k ? 0.55 : 0.9));
    [84, 88, 91, 96].forEach((m, k) => inst('bell', o, 0.96 + k * 0.08, midiHz(m), 0.4, 0.5));
    addDrum(o, 'timp', { f: 65.4 }, 0, 0.5);
    addDrum(o, 'timp', { f: 98 }, 0.48, 0.45);
    addDrum(o, 'timp', { f: 65.4 }, 0.96, 0.6);
    addDrum(o, 'crash', {}, 0.96, 0.4);
  }, { verb: [0.2, 0.8] });

  def('finish:podium', 2.6, -18, (o) => {
    // Second or third: a bouncy marimba run up to a bright bell chord.
    [72, 76, 79, 84, 79, 84].forEach((m, k) => inst('marimba', o, k * 0.11, midiHz(m), 0.1, 0.85));
    [76, 79, 84, 88].forEach((m, k) => inst('bell', o, 0.7 + k * 0.06, midiHz(m), 0.5, 0.55));
    addDrum(o, 'crash', {}, 0.7, 0.25);
  }, { verb: [0.2, 0.8] });

  def('finish:other', 2.2, -19, (o) => {
    // Anywhere else: still a cheerful "da-da-da-dum!", because finishing is the win.
    [[0, 72], [0.13, 74], [0.26, 76], [0.45, 79]].forEach(([t, m], k) => inst('marimba', o, t, midiHz(m), 0.12, 0.8 + 0.05 * k));
    [79, 84].forEach((m) => inst('bellSoft', o, 0.45, midiHz(m), 0.5, 0.5));
  }, { verb: [0.2, 0.75] });

  def('placeUp', 0.45, -24, (o) => {
    inst('marimba', o, 0, midiHz(79), 0.08, 0.7);
    inst('marimba', o, 0.07, midiHz(84), 0.15, 0.8);
  });
  def('placeDown', 0.45, -25, (o) => {
    inst('marimba', o, 0, midiHz(79), 0.08, 0.7);
    inst('marimba', o, 0.07, midiHz(74), 0.15, 0.62);
  });

  /* ── Guidance ────────────────────────────────────────────────────────────
   * Pitch carries the direction (low = left, high = right: Race Tracks'
   * figures) and timbre carries the player (P1 bell, P2 marimba), so two
   * players on one set of speakers can tell whose cue it is (DESIGN §11).
   */
  const CUE_NOTES = { '-1': [67, 72], '0': [72, 72], '1': [76, 81] };
  [-1, 0, 1].forEach((dir) => [0, 1].forEach((pl) => def('cue:' + dir + ':' + pl, 0.65, -20, (o) => {
    CUE_NOTES[dir].forEach((m, k) => {
      const v = dir === 0 && k ? 0.55 : 0.85;
      if (pl === 0) inst('bell', o, k * 0.12, midiHz(m), 0.14, v, { ix: 2.2, tau: 0.35 });
      else inst('marimba', o, k * 0.12, midiHz(m), 0.14, v);
    });
  }, { crit: 1, pans: pl === 0 && dir !== 0 ? (dir < 0 ? 'L' : 'R') : '' })));

  def('scanMatch:0', 0.45, -23, (o) => { inst('bellSoft', o, 0, midiHz(91), 0.1, 0.7); }, { crit: 1 });
  def('scanMatch:1', 0.45, -23, (o) => { inst('marimba', o, 0, midiHz(91), 0.1, 0.8); }, { crit: 1 });

  // Pause hold: a rising major arpeggio, one note per second held.
  [72, 76, 79, 84, 88].forEach((m, k) => def('pauseTick:' + (k + 1), 0.18, -22, (o) => {
    const f = midiHz(m);
    tone(o, 0, 0.1, f, f, { w: 'sq', a: 0.002, r: 0.03, g: 0.25, lp: 3000 });
    tone(o, 0, 0.1, f, f, { w: 'sine', a: 0.002, r: 0.03, g: 0.35 });
  }, { crit: 1 }));

  /* ══════════════════════════════════════════════════════════════════════
   * 4. Loops — engines, boost roar, drift crackle, danger pulses
   * ══════════════════════════════════════════════════════════════════════
   * A loop must repeat with no seam at all: every periodic part completes a
   * whole number of cycles in the loop (frequencies are multiples of 1/loop
   * length), noise is generated once and filtered round the ring, and random
   * events that start near the end wrap onto the start.
   */

  /** Sparse spark clicks placed round a ring. */
  function crackleRing(o, rate, g, rnd, hpHz) {
    const n = o.length, tmp = new Float32Array(n), count = Math.round(rate * n / SR);
    for (let k = 0; k < count; k++) {
      const i = Math.floor(rnd() * n), amp = g * (0.3 + 0.7 * rnd()), len = 8 + Math.floor(rnd() * 30);
      for (let j = 0; j < len; j++) tmp[(i + j) % n] += amp * Math.exp(-j / (len * 0.3)) * nz();
    }
    biquadPass(tmp, 'hp', hpHz, 0.7, true);
    for (let i = 0; i < n; i++) o[i] += tmp[i];
  }

  /** White noise round a ring, shaped by loop-aware biquad passes. */
  function ringNoise(n, type, f, q, twice) {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = nz();
    biquadPass(x, type, f, q, true);
    if (twice) biquadPass(x, type, f, q, true);
    return x;
  }

  /**
   * Piston engines: a narrow pulse at the firing rate (each firing a little
   * stronger or weaker; alternate ones weaker still for a V-twin lope), a sub
   * an octave down, through an exhaust formant and soft drive. In the game
   * the loop's playbackRate follows speed, so these are the idle-to-mid tones.
   */
  function drawPiston(o, P, rnd) {
    const n = o.length, f0 = P.f0, dt = f0 / SR, cycles = Math.round(f0 * n / SR);
    const jit = new Float32Array(cycles);
    for (let c = 0; c < cycles; c++) jit[c] = (1 + P.jit * (rnd() * 2 - 1)) * ((c & 1) && P.lope ? 1 - P.lope : 1);
    const src = new Float32Array(n);
    let p = 0, ps = 0;
    for (let i = 0; i < n; i++) {
      p += dt; if (p >= 1) p -= 1;
      ps += dt * 0.5; if (ps >= 1) ps -= 1;
      src[i] = pulse(p, dt, P.duty) * jit[Math.floor(i * f0 / SR) % cycles] + P.sub * sn(ps);
    }
    // Exhaust: a formant band blended with a low-passed body, run twice round the ring.
    const form = new Svf().set(P.form, P.formQ), body = new Svf().set(P.lp, 0.7), dn = Math.tanh(P.drive);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const x = src[i], v = P.formMix * 2 * form.bp(x) + (1 - P.formMix) * body.lp(x);
        if (pass) o[i] = Math.tanh(v * P.drive) / dn;
      }
    }
    // Mechanical hiss that pulses with each firing.
    const h = ringNoise(n, 'bp', 3200, 1.2, false);
    let q = 0;
    for (let i = 0; i < n; i++) { q += dt; if (q >= 1) q -= 1; o[i] += P.hiss * h[i] * (0.4 + 0.6 * (1 - q)); }
  }

  /** Hover kart: a smooth, slowly beating whine with a turbine shimmer and air. */
  function drawHover(o) {
    const n = o.length, air = ringNoise(n, 'bp', 1800, 0.8, false);
    let p1 = 0, p2 = 0, pw = 0;
    for (let i = 0; i < n; i++) {
      p1 += 150 / SR; if (p1 >= 1) p1 -= 1;
      p2 += 150.5 / SR; if (p2 >= 1) p2 -= 1;                  // beats at 0.5 Hz: two per loop
      pw += 1320 * (1 + 0.004 * sn(0.5 * i / SR)) / SR; if (pw >= 1) pw -= 1;
      o[i] = 0.5 * sn(p1) + 0.3 * sn(p2) + 0.2 * sn(2 * p1) + 0.07 * sn(3 * p1) + 0.12 * sn(pw) + 0.1 * air[i];
    }
  }

  /** Boost layer: a jet-flame roar (noise body, a mid band, a throbbing rumble, sparks). */
  function drawBoost(o, rnd) {
    const n = o.length, body = ringNoise(n, 'lp', 1300, 0.7, true), mid = ringNoise(n, 'bp', 700, 0.9, false);
    let pr = 0;
    for (let i = 0; i < n; i++) {
      pr += 55 / SR; if (pr >= 1) pr -= 1;
      const throb = 0.7 + 0.3 * sn(i * 7 / SR);                // 7 Hz: 21 cycles in 3 s
      o[i] = 1.4 * body[i] + 0.8 * mid[i] + 0.35 * sn(pr) * throb;
    }
    crackleRing(o, 40, 0.5, rnd, 2500);
  }

  /** Drift: a rubber squeal whose pitch wanders (stick-slip), gravel hiss and spark crackle. */
  function drawDrift(o, rnd) {
    const n = o.length, x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = nz();
    const svf = new Svf();
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        if ((i & 15) === 0) {
          const t = i / SR;                                      // 0.5 Hz and 1.5 Hz: whole cycles in 2 s
          svf.set(2100 * (1 + 0.06 * sn(0.5 * t) + 0.03 * sn(1.5 * t)), 14);
        }
        const v = svf.bp(x[i]);
        if (pass) o[i] = v * 2.2;
      }
    }
    const grit = ringNoise(n, 'lp', 900, 0.7, false);
    for (let i = 0; i < n; i++) o[i] += 0.35 * grit[i];
    crackleRing(o, 70, 0.6, rnd, 3000);
  }

  /*
   * sec: loop length (everything periodic completes whole cycles in it).
   * tail: seconds of the loop's opening appended after its end, which the
   *   gapless player crossfades across (section 7).
   * simple: short pulse loops that end in silence; the element's own loop
   *   flag is fine for them because its re-seek gap lands in the silence.
   */
  const LOOPS = {
    'engine:kart':  { sec: 4, tail: 2.5, level: -27, draw: (o, r) => drawPiston(o, { f0: 72, duty: 0.2, sub: 0.25, form: 460, formQ: 1.4, formMix: 0.55, lp: 2600, drive: 1.6, jit: 0.12, lope: 0, hiss: 0.05 }, r) },
    'engine:bike':  { sec: 4, tail: 2.5, level: -27, draw: (o, r) => drawPiston(o, { f0: 96, duty: 0.3, sub: 0.1, form: 950, formQ: 1.6, formMix: 0.6, lp: 3400, drive: 2.2, jit: 0.15, lope: 0, hiss: 0.07 }, r) },
    'engine:buggy': { sec: 4, tail: 2.5, level: -26, draw: (o, r) => drawPiston(o, { f0: 52, duty: 0.15, sub: 0.45, form: 300, formQ: 1.2, formMix: 0.5, lp: 1500, drive: 2.6, jit: 0.2, lope: 0.35, hiss: 0.03 }, r) },
    'engine:hover': { sec: 4, tail: 2.5, level: -28, draw: (o) => drawHover(o) },
    'boost':        { sec: 3, tail: 2.5, level: -25, draw: (o, r) => drawBoost(o, r) },
    'drift':        { sec: 2, tail: 2.0, level: -29, draw: (o, r) => drawDrift(o, r) },
    // Danger, timbre per player: P1 a buzzy double pulse, P2 a hollow wooden knock.
    'danger:0':     { sec: 0.92, simple: true, level: -24, draw: (o) => {
      tone(o, 0, 0.11, 196, 196, { w: 'sq', a: 0.003, r: 0.03, g: 0.4, lp: 1500 });
      tone(o, 0.13, 0.13, 147, 147, { w: 'sq', a: 0.003, r: 0.04, g: 0.34, lp: 1300 });
    } },
    'danger:1':     { sec: 0.92, simple: true, level: -24, draw: (o) => {
      inst('marimba', o, 0, midiHz(55), 0.1, 0.9);
      inst('marimba', o, 0.13, midiHz(50), 0.12, 0.85);
    } }
  };

  /* ══════════════════════════════════════════════════════════════════════
   * 5. Music — songs are data; a small sequencer renders each to a loop
   * ══════════════════════════════════════════════════════════════════════
   * A song has a tempo, swing (0 straight … 1 full triplet feel), a key and
   * mode (for diatonic harmony lines), chords (one '|' per bar), parts and
   * drums. A step is a sixteenth note, 16 to the bar.
   *
   * Melody strings: bars split by '|'; tokens NOTE:len (len in sixteenths),
   * r:len rests, -:len ties onto the previous note, a trailing ! accents.
   * Every bar must add up to 16 — the parser throws if one does not, so a
   * typo in a tune fails tools/audio_check.js instead of reaching an ear.
   *
   * Generated parts follow the chords:
   *   bass   one char per sixteenth: 1 root, 3 third, 5 fifth, 7 seventh,
   *          8 octave, 6 sixth, 2 ninth, 4 fourth, < fifth below, a approach
   *          (a semitone under the next chord's root), . hold, - rest
   *   arp    rhythm 'x' onsets walk `arp` (indices into the chord tones from
   *          lo to hi, ascending; indices past the top continue an octave up)
   *   chord  rhythm 'x' onsets voice the chord between lo and hi, each voicing
   *          moving as little as possible from the last; a held chord is
   *          re-struck when the harmony changes under it
   *   power  like chord, voiced root + fifth + octave (rock guitar)
   * The whole song renders into a ring the length of the loop, so any note,
   * echo or reverb tail that runs past the end lands back at the start.
   *
   * Three-four: a waltz sets meter: 12 (the bar length the accents, and the
   * arpeggio restarts, follow) and writes its tune and chords in waltz bars
   * re-barred onto the grid by rebar(); patterns 12 or 24 long keep their
   * place across grid bars, and bars must be a multiple of three.
   */

  const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function pcOf(s) { return (PCS[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? 11 : 0)) % 12; }
  function midiOf(name) {
    const m = /^([A-G])([#b]?)(\d)$/.exec(name);
    if (!m) throw new Error('bad note "' + name + '"');
    return (+m[3] + 1) * 12 + PCS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  const QUALITY = {
    '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
    dim: [0, 3, 6], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7],
    '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], add9: [0, 4, 7, 14], '5': [0, 7]
  };
  function parseChord(sym) {
    const m = /^([A-G][#b]?)(maj7|m7b5|m7|m6|m|dim|aug|sus2|sus4|add9|7|6|5)?(?:\/([A-G][#b]?))?$/.exec(sym);
    if (!m) throw new Error('bad chord "' + sym + '"');
    const root = pcOf(m[1]), iv = QUALITY[m[2] || ''];
    return { root, iv, bass: m[3] ? pcOf(m[3]) : root, pcs: iv.map((x) => (root + x) % 12) };
  }
  function parseChords(song) {
    const bars = song.chords.split('|').map((b) => b.trim());
    if (bars.length !== song.bars) throw new Error(song.id + ': ' + bars.length + ' chord bars, song has ' + song.bars);
    const out = [];
    bars.forEach((b, bi) => {
      const toks = b.split(/\s+/);
      let pos = 0;
      toks.forEach((tk) => {
        const bits = tk.split(':'), len = bits[1] ? +bits[1] : 16 / toks.length;
        out.push({ step: bi * 16 + pos, len, ch: parseChord(bits[0]) });
        pos += len;
      });
      if (Math.abs(pos - 16) > 1e-9) throw new Error(song.id + ': chord bar ' + (bi + 1) + ' is ' + pos + ' steps');
    });
    return out;
  }
  function chordAt(list, step) {
    let c = list[0];
    for (let i = 0; i < list.length && list[i].step <= step; i++) c = list[i];
    return c;
  }

  const MODES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10]
  };
  /** Move a note `steps` scale degrees (a harmony a third below is -2). Chromatic notes keep their offset. */
  function diatonic(m, steps, key, mode) {
    const sc = MODES[mode], rel = m - key;
    let oct = Math.floor(rel / 12);
    const pc = rel - oct * 12;
    let deg = sc.indexOf(pc), chroma = 0;
    if (deg < 0) { let q = pc; while (sc.indexOf(q) < 0) q--; deg = sc.indexOf(q); chroma = pc - q; }
    let d = deg + steps;
    oct += Math.floor(d / 7);
    d = ((d % 7) + 7) % 7;
    return key + oct * 12 + sc[d] + chroma;
  }

  function parseMelody(song, str, fromBar, where) {
    const out = [], bars = str.split('|');
    if (fromBar - 1 + bars.length > song.bars) throw new Error(song.id + ' ' + where + ': melody runs past bar ' + song.bars);
    bars.forEach((bar, bi) => {
      const toks = bar.trim().split(/\s+/).filter(Boolean);
      let pos = 0;
      toks.forEach((tk) => {
        const m = /^([A-G][#b]?\d|r|-)(?::(\d+))?(!?)$/.exec(tk);
        if (!m) throw new Error(song.id + ' ' + where + ': bad token "' + tk + '" in bar ' + (fromBar + bi));
        const len = m[2] ? +m[2] : 2, step = (fromBar - 1 + bi) * 16 + pos;
        if (m[1] === '-') { if (out.length) out[out.length - 1].len += len; }
        else if (m[1] !== 'r') out.push({ step, len, m: midiOf(m[1]), acc: !!m[3] });
        pos += len;
      });
      if (pos !== 16) throw new Error(song.id + ' ' + where + ': bar ' + (fromBar + bi) + ' has ' + pos + ' sixteenths');
    });
    return out;
  }

  /**
   * Re-bar a tune (or, with chords set, a chord chart) written in bars of
   * `from` sixteenths into the grid's 16-step bars: a note crossing a grid bar
   * line is split and tied, a rest split, a chord written twice. Four waltz
   * bars (from = 12) fill three grid bars. Throws on a bar of the wrong length.
   */
  function rebar(str, from, chords) {
    const items = [];
    str.split('|').forEach((bar, bi) => {
      const toks = bar.trim().split(/\s+/).filter(Boolean);
      let pos = 0;
      toks.forEach((tk) => {
        const m = /^([^:!]+)(?::(\d+))?(!?)$/.exec(tk);
        if (!m) throw new Error('rebar: bad token "' + tk + '"');
        const len = m[2] ? +m[2] : chords ? from / toks.length : 2;
        items.push({ sym: m[1], len, acc: m[3] });
        pos += len;
      });
      if (pos !== from) throw new Error('rebar: bar ' + (bi + 1) + ' has ' + pos + ' sixteenths, not ' + from);
    });
    const out = [];
    let bar = [], room = 16;
    items.forEach((it) => {
      let left = it.len, first = true;
      while (left > 0) {
        const n = Math.min(left, room);
        bar.push((first || chords || it.sym === 'r' ? it.sym : '-') + ':' + n + (first ? it.acc : ''));
        left -= n; room -= n; first = false;
        if (!room) { out.push(bar.join(' ')); bar = []; room = 16; }
      }
    });
    if (bar.length) throw new Error('rebar: the tune does not fill whole 16-step bars');
    return out.join(' | ');
  }

  function barRange(song, part) { return part.bars ? part.bars : [1, song.bars]; }

  function degreeNote(c, ch, next, lo, prev) {
    const at = (pc) => lo + ((pc - lo) % 12 + 12) % 12;
    const r = at(ch.root), third = ch.iv.indexOf(3) >= 0 ? 3 : 4;
    const fifth = ch.iv.indexOf(6) >= 0 ? 6 : ch.iv.indexOf(8) >= 0 ? 8 : 7;
    switch (c) {
      case '1': return at(ch.bass);
      case '8': return at(ch.bass) + 12;
      case '3': return r + third;
      case '5': return r + fifth;
      case '<': return r + fifth - 12;
      case '7': return r + (ch.iv.indexOf(11) >= 0 ? 11 : 10);
      case '6': return r + 9;
      case '4': return r + 5;
      case '2': return r + 2;
      case 'a': { const nr = at(next.bass); return prev !== null && Math.abs(nr + 1 - prev) < Math.abs(nr - 1 - prev) ? nr + 1 : nr - 1; }
    }
    throw new Error('bad bass degree "' + c + '"');
  }

  function bassEvents(song, part, chords) {
    const pat = part.bass.replace(/\s+/g, ''), plen = pat.length, br = barRange(song, part);
    const lo = midiOf(part.lo || 'E1'), total = song.bars * 16, meter = song.meter || 16, out = [];
    let last = null, prev = null;
    for (let s = (br[0] - 1) * 16, k = 0; s < br[1] * 16; s++, k++) {
      const c = pat[k % plen];
      if (c === '.') { if (last) last.len++; continue; }
      if (c === '-') { last = null; continue; }
      const cd = chordAt(chords, s), nx = chordAt(chords, (cd.step + cd.len) % total);
      const m = degreeNote(c, cd.ch, nx.ch, lo, prev);
      last = { step: s, len: 1, m, acc: s % meter === 0 };
      prev = m;
      out.push(last);
    }
    return out;
  }

  function toneList(ch, lo, hi) {
    const out = [];
    for (let m = lo; m <= hi; m++) if (ch.pcs.indexOf(m % 12) >= 0) out.push(m);
    return out;
  }

  function arpEvents(song, part, chords) {
    const rh = part.rhythm.replace(/\s+/g, ''), rl = rh.length, br = barRange(song, part);
    const seq = part.arp.trim().split(/\s+/).map(Number), lo = midiOf(part.lo), hi = midiOf(part.hi), out = [];
    const meter = song.meter || 16;
    let last = null, si = 0;
    for (let s = (br[0] - 1) * 16, k = 0; s < br[1] * 16; s++, k++) {
      if (s % meter === 0) si = 0;                            // the pattern restarts every bar
      const c = rh[k % rl];
      if (c === '.') { if (last) last.len++; continue; }
      if (c === '-') { last = null; continue; }
      const tl = toneList(chordAt(chords, s).ch, lo, hi), idx = seq[si++ % seq.length];
      const m = tl[idx % tl.length] + 12 * Math.floor(idx / tl.length);
      last = { step: s, len: 1, m, acc: s % meter === 0 };
      out.push(last);
    }
    return out;
  }

  /** Voice a chord near the previous voicing: root, third, seventh, fifth in that order of importance. */
  function voiceChord(ch, lo, hi, voices, prev) {
    const order = [0, 1, 3, 2, 4].filter((i) => i < ch.iv.length);
    const pcs = order.map((i) => (ch.root + ch.iv[i]) % 12).slice(0, voices);
    while (pcs.length < voices) pcs.push(ch.root);
    let centre = (lo + hi) / 2;
    if (prev) { centre = 0; for (let i = 0; i < prev.length; i++) centre += prev[i]; centre /= prev.length; }
    const notes = pcs.map((pc) => {
      let best = -1;
      for (let m = lo; m <= hi; m++) if (m % 12 === pc && (best < 0 || Math.abs(m - centre) < Math.abs(best - centre))) best = m;
      return best < 0 ? lo + ((pc - lo) % 12 + 12) % 12 : best;
    }).sort((a, b) => a - b);
    for (let i = 1; i < notes.length; i++) if (notes[i] === notes[i - 1]) notes[i] += 12;
    return notes.sort((a, b) => a - b);
  }

  function chordEvents(song, part, chords, power) {
    const rh = (power ? part.power : part.chord).replace(/\s+/g, ''), rl = rh.length, br = barRange(song, part);
    const lo = midiOf(part.lo), hi = part.hi ? midiOf(part.hi) : lo + 24, out = [];
    let prev = null, last = null;
    for (let s = (br[0] - 1) * 16, k = 0; s < br[1] * 16; s++, k++) {
      const c = rh[k % rl], cd = chordAt(chords, s);
      if (c === '-') { last = null; continue; }
      if (c === '.' && last && last.cd === cd) { last.len++; continue; }
      if (c === '.' && !last) continue;
      const ms = power ? [0, 7, 12].map((x) => lo + ((cd.ch.root - lo) % 12 + 12) % 12 + x) : voiceChord(cd.ch, lo, hi, part.voices || 3, prev);
      prev = ms;
      last = { step: s, len: 1, ms, cd, acc: s % (song.meter || 16) === 0 };
      out.push(last);
    }
    return out;
  }

  function partEvents(song, part, chords) {
    if (part.n) {
      const from = part.from || 1;
      let evs = parseMelody(song, part.n, from, part.v);
      if (part.rep) {
        const patBars = part.n.split('|').length, out = [];
        for (let b = from; b <= song.bars; b += patBars) {
          for (let i = 0; i < evs.length; i++) {
            const s = evs[i].step + (b - from) * 16;
            if (s < song.bars * 16) out.push({ step: s, len: evs[i].len, m: evs[i].m, acc: evs[i].acc });
          }
        }
        evs = out;
      }
      return evs;
    }
    if (part.bass) return bassEvents(song, part, chords);
    if (part.arp) return arpEvents(song, part, chords);
    if (part.chord) return chordEvents(song, part, chords, false);
    if (part.power) return chordEvents(song, part, chords, true);
    throw new Error(song.id + ': a part has no notes');
  }

  /** Sixteenth position → time in sixteenths, the off-beat eighth pushed late by swing. */
  function swingPos(step, swing) {
    if (!swing) return step;
    const beat = Math.floor(step / 4), u = step - beat * 4, sh = swing * 0.667;
    return beat * 4 + (u < 2 ? u * (2 + sh) / 2 : 2 + sh + (u - 2) * (2 - sh) / 2);
  }

  /** Downbeats a touch louder, off-beats softer: the difference between a groove and a grid. */
  function metric(step, acc, meter) {
    const bar = meter || 16, s = step % bar;
    const v = s === 0 ? 1.08 : s === 8 && bar === 16 ? 1.04 : s % 4 === 0 ? 1 : s % 2 === 0 ? 0.94 : 0.9;
    return acc ? v * 1.12 : v;
  }

  /** Add a buffer into the loop's buses, wrapping round the ring. */
  function mixRing(src, start, vel, gl, gr, gv, gd, L, R, V, D) {
    const N = L.length;
    let j = start % N;
    if (j < 0) j += N;
    for (let i = 0; i < src.length; i++) {
      const x = src[i] * vel;
      L[j] += x * gl; R[j] += x * gr;
      if (gv) V[j] += x * gv;
      if (gd) D[j] += x * gd;
      if (++j === N) j = 0;
    }
  }

  /**
   * The theremin: one continuous voice for a whole part, gliding between
   * notes (and scooping in after a rest) with a wide, slow vibrato. It is
   * rendered straight through from before the loop start to just past its
   * end, and the overrun is crossfaded onto the start so the seam matches.
   */
  function* legatoGen(evs, tOf, N, P, vel, gl, gr, gv, gd, L, R, V, D) {
    const list = [];
    for (let c = -1; c <= 1; c++) {
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i];
        list.push({ s0: Math.round(tOf(e.step) * SR) + c * N, s1: Math.round(tOf(e.step + e.len) * SR) + c * N, lf: Math.log2(midiHz(e.m)) });
      }
    }
    list.sort((a, b) => a.s0 - b.s0);
    const pre = Math.min(N, Math.round(2 * SR)), xf = Math.round(0.06 * SR);
    const tmp = new Float32Array(N), ov = new Float32Array(xf);
    const gk = Math.exp(-1 / (P.glide * SR)), ak = Math.exp(-1 / (P.a * SR)), rk = Math.exp(-1 / (P.r * SR));
    const dipK = Math.exp(-1 / (0.03 * SR)), vr = P.vr / SR;
    let k = 0, cur = -1, lf = list[0].lf, tf = lf, amp = 0, ph = 0, dip = 0, wasOn = false;
    for (let t = -pre; t < N + xf; t++) {
      while (k < list.length && list[k].s1 <= t) k++;
      const on = k < list.length && list[k].s0 <= t;
      if (on && k !== cur) {
        tf = list[k].lf;
        if (wasOn) dip = 0.25; else lf = tf - 0.03;
        cur = k;
      }
      wasOn = on;
      lf = tf + (lf - tf) * gk;
      amp = on ? 1 + (amp - 1) * ak : amp * rk;
      dip *= dipK;
      const f = Math.pow(2, lf) * (1 + P.vib * Math.min(1, amp * 1.5) * sn((t + pre) * vr));
      ph += f / SR;
      ph -= Math.floor(ph);
      const y = amp * (1 - dip) * (sn(ph) + 0.12 * sn(2 * ph) + 0.04 * sn(3 * ph));
      if (t >= 0 && t < N) tmp[t] = y; else if (t >= N) ov[t - N] = y;
      if ((t & 32767) === 0) yield;
    }
    for (let i = 0; i < xf; i++) { const w = 1 - i / xf; tmp[i] = tmp[i] * (1 - w) + ov[i] * w; }
    mixRing(tmp, 0, vel, gl, gr, gv, gd, L, R, V, D);
  }

  /* Drum kits: voice char → [drum, params, gain, pan, reverb send]. */
  const KITS = {
    pop: {
      k: ['kick', { f0: 150, f1: 48, tau: 0.17 }, 0.95, 0, 0], s: ['snare', { tone: 190 }, 0.5, 0.05, 0.14],
      c: ['clap', {}, 0.42, -0.05, 0.16], h: ['hat', { tau: 0.03 }, 0.2, 0.3, 0], o: ['hat', { tau: 0.2 }, 0.18, 0.3, 0.04],
      x: ['crash', {}, 0.3, -0.25, 0.1], t: ['tom', { f: 160 }, 0.45, 0.3, 0.1], u: ['tom', { f: 110 }, 0.45, -0.3, 0.1],
      m: ['tamb', {}, 0.16, 0.4, 0.05], S: ['shaker', {}, 0.18, -0.35, 0]
    },
    acoustic: {
      k: ['kick', { f0: 130, f1: 52, tau: 0.14, click: 0.25 }, 0.9, 0, 0], s: ['snare', { tone: 205, snap: 0.12 }, 0.5, 0.05, 0.15],
      c: ['clap', {}, 0.35, -0.1, 0.15], h: ['hat', { tau: 0.035 }, 0.18, 0.3, 0], S: ['shaker', {}, 0.2, -0.3, 0],
      m: ['tamb', {}, 0.16, 0.35, 0.05], x: ['crash', {}, 0.28, -0.25, 0.1], t: ['tom', { f: 170 }, 0.42, 0.3, 0.1],
      u: ['tom', { f: 120 }, 0.42, -0.3, 0.1]
    },
    calypso: {
      k: ['kick', { f0: 120, f1: 55, tau: 0.12, click: 0.2 }, 0.75, 0, 0], r: ['rim', {}, 0.3, 0.15, 0.1],
      q: ['conga', { f: 220, tau: 0.12 }, 0.4, -0.3, 0.08], w: ['conga', { f: 330, tau: 0.08 }, 0.36, 0.3, 0.08],
      S: ['shaker', {}, 0.2, 0.4, 0], l: ['clave', {}, 0.22, -0.4, 0.1], x: ['crash', {}, 0.22, -0.2, 0.1]
    },
    darbuka: {
      d: ['doum', {}, 0.7, 0, 0.1], t: ['tek', {}, 0.4, 0.15, 0.1], e: ['tek', { f: 2400 }, 0.22, -0.2, 0.1],
      S: ['shaker', {}, 0.18, 0.35, 0], k: ['kick', { f0: 110, f1: 45, tau: 0.16, click: 0.1 }, 0.5, 0, 0], x: ['crash', {}, 0.2, -0.25, 0.1]
    },
    swing: {
      k: ['kick', { f0: 110, f1: 50, tau: 0.16, click: 0.12 }, 0.6, 0, 0], b: ['brush', {}, 0.35, 0.1, 0.15],
      n: ['snap', {}, 0.3, -0.25, 0.2], r: ['ride', {}, 0.22, 0.3, 0.05], x: ['crash', {}, 0.22, -0.25, 0.1],
      t: ['tom', { f: 150 }, 0.4, 0.3, 0.15], u: ['tom', { f: 105 }, 0.4, -0.3, 0.15]
    },
    rock: {
      k: ['kick', { f0: 170, f1: 50, tau: 0.2, click: 0.45 }, 1.0, 0, 0], s: ['snare', { tone: 180, snap: 0.14 }, 0.6, 0.05, 0.12],
      h: ['hat', { tau: 0.035 }, 0.2, 0.3, 0], r: ['ride', {}, 0.2, 0.3, 0.04], x: ['crash', {}, 0.34, -0.25, 0.1],
      t: ['tom', { f: 150 }, 0.5, 0.3, 0.1], u: ['tom', { f: 100 }, 0.5, -0.3, 0.1]
    },
    electro: {
      k: ['kick', { f0: 130, f1: 42, tau: 0.24, click: 0.3 }, 1.0, 0, 0], c: ['clap', { tail: 0.09 }, 0.45, 0, 0.2],
      h: ['hat', { tau: 0.025 }, 0.16, 0.3, 0], o: ['hat', { tau: 0.15 }, 0.16, -0.3, 0.05], x: ['crash', {}, 0.28, -0.25, 0.15],
      S: ['sleigh', {}, 0.2, 0.4, 0.1], t: ['tom', { f: 150 }, 0.42, 0.3, 0.15], u: ['tom', { f: 105 }, 0.42, -0.3, 0.15]
    },
    march: {
      T: ['timp', { f: 65.4 }, 0.6, -0.15, 0.2], V: ['timp', { f: 98 }, 0.55, 0.15, 0.2],
      s: ['snare', { tone: 210, snap: 0.08 }, 0.4, 0.2, 0.2], x: ['crash', {}, 0.3, -0.25, 0.15]
    },
    // Tribal: a mid tom on the backbeat and a floor tom in the gaps instead of
    // a snare, a pair of congas, shaker and a wood-block clave.
    jungle: {
      k: ['kick', { f0: 125, f1: 50, tau: 0.15, click: 0.2 }, 0.85, 0, 0], t: ['tom', { f: 150 }, 0.42, 0.25, 0.12],
      u: ['tom', { f: 98 }, 0.5, -0.25, 0.12], q: ['conga', { f: 210, tau: 0.12 }, 0.38, -0.35, 0.08],
      w: ['conga', { f: 315, tau: 0.08 }, 0.32, 0.35, 0.08], S: ['shaker', {}, 0.2, 0.4, 0],
      b: ['wood', { f: 1050 }, 0.2, -0.45, 0.1], x: ['crash', {}, 0.22, -0.2, 0.1]
    },
    // Toy box: a small tight bass drum, a high snappy toy snare, a wood block,
    // a tambourine, a little cymbal and two toy toms.
    toy: {
      k: ['kick', { f0: 170, f1: 70, tau: 0.09, click: 0.25 }, 0.7, 0, 0], s: ['snare', { tone: 260, snap: 0.07, hp: 2400 }, 0.42, 0.15, 0.15],
      b: ['wood', { f: 1500 }, 0.22, -0.4, 0.08], m: ['tamb', {}, 0.13, 0.4, 0.05], x: ['crash', {}, 0.2, -0.25, 0.1],
      t: ['tom', { f: 230 }, 0.36, 0.3, 0.1], u: ['tom', { f: 170 }, 0.36, -0.3, 0.1]
    },
    // Clockwork: a tight kick and snare, a two-pitch wood block for the tick
    // and the tock, a rim, a closed hat, a hiss of steam (a long, darker open
    // hat) and an anvil clank.
    clock: {
      k: ['kick', { f0: 140, f1: 48, tau: 0.13, click: 0.35 }, 0.9, 0, 0], s: ['snare', { tone: 200, snap: 0.07 }, 0.45, 0.05, 0.12],
      i: ['wood', { f: 1900 }, 0.2, 0.4, 0.05], j: ['wood', { f: 1250 }, 0.22, -0.4, 0.05], r: ['rim', {}, 0.2, 0.2, 0.08],
      h: ['hat', { tau: 0.022 }, 0.13, 0.25, 0], o: ['hat', { tau: 0.16, hp: 3800 }, 0.1, -0.2, 0.08],
      a: ['anvil', { f: 784 }, 0.2, 0.15, 0.15], x: ['crash', {}, 0.24, -0.25, 0.1]
    }
  };
  const VEL = { X: 1, x: 0.8, o: 0.45 };

  /**
   * Render a song (generator): parts, drums, side-chain pump, echo, reverb,
   * then loudness-normalise and limit. Returns { chs:[L,R], sec }.
   */
  function* songGen(id) {
    const song = SONGS[id];
    if (!song) throw new Error('unknown song ' + id);
    nzSeed(hashStr(song.id));
    const rnd = prng(hashStr(song.id) ^ 0xa5a5a5a5);
    const stepSec = 60 / song.bpm / 4, N = Math.round(song.bars * 16 * stepSec * SR);
    const tOf = (s) => swingPos(s, song.swing || 0) * stepSec;
    const L = new Float32Array(N), R = new Float32Array(N), V = new Float32Array(N), D = new Float32Array(N);
    const mix = song.mix, PL = mix.pump ? new Float32Array(N) : null, PR = mix.pump ? new Float32Array(N) : null;
    const chords = parseChords(song), key = pcOf(song.key[0]), mode = song.key[1];

    for (let pi = 0; pi < song.parts.length; pi++) {
      const part = song.parts[pi];
      let evs = partEvents(song, part, chords);
      if (part.harm) evs = evs.map((e) => ({ step: e.step, len: e.len, acc: e.acc, m: diatonic(e.m, part.harm, key, mode) }));
      if (part.oct) evs.forEach((e) => { if (e.ms) e.ms = e.ms.map((x) => x + 12 * part.oct); else e.m += 12 * part.oct; });
      const g = part.g === undefined ? 0.5 : part.g, th = ((part.pan || 0) + 1) * Math.PI / 4;
      const gl = g * Math.cos(th), gr = g * Math.sin(th), gv = g * (part.rev || 0), gd = g * (part.dly || 0);
      const toL = part.pump && PL ? PL : L, toR = part.pump && PR ? PR : R, vel0 = part.vel || 0.9;
      if (part.legato) {
        const P = Object.assign({ glide: 0.06, vib: 0.012, vr: 5.2, a: 0.05, r: 0.12 }, part.P || {});
        yield* legatoGen(evs, tOf, N, P, vel0, gl, gr, gv, gd, toL, toR, V, D);
        continue;
      }
      const I = INSTR[part.v];
      if (!I) throw new Error(song.id + ': unknown instrument ' + part.v);
      const P = Object.assign({ rel: I.rel }, I.P, part.P || {});
      const gate = part.gate || (I.chord ? 0.96 : 0.9), cache = new Map();
      let count = 0;
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i], ts = tOf(e.step), dur = Math.max(0.02, (tOf(e.step + e.len) - ts) * gate);
        const nkey = (e.ms ? e.ms.join(',') : e.m) + '|' + Math.round(dur * SR);
        let buf = cache.get(nkey);
        if (!buf) {
          // Notes render at full velocity and are scaled on the way in, so a
          // repeated bass or arpeggio note is synthesised once per song.
          buf = new Float32Array(Math.ceil((dur + I.rel) * SR) + 8);
          I.fn(buf, 0, e.ms ? e.ms.map(midiHz) : midiHz(e.m), dur, 1, P);
          cache.set(nkey, buf);
        }
        const vel = vel0 * metric(e.step, e.acc, song.meter) * (1 + (rnd() - 0.5) * 0.08);
        mixRing(buf, Math.round(ts * SR), vel, gl, gr, gv, gd, toL, toR, V, D);
        if ((++count & 7) === 0) yield;
      }
      yield;
    }

    // Drums: each kit voice renders once, every hit is a scaled copy.
    const dr = song.drums, kit = Object.assign({}, KITS[dr.kit], dr.over || {}), bufs = {};
    for (const c in kit) bufs[c] = DRUMS[kit[c][0]](kit[c][1]);
    const order = dr.order.replace(/[\s|]/g, ''), kicks = [];
    if (order.length !== song.bars) throw new Error(song.id + ': drum order has ' + order.length + ' bars');
    const hit = (c, step, v) => {
      const kd = kit[c];
      if (!kd) throw new Error(song.id + ': no kit voice "' + c + '"');
      const t = tOf(step) + (c === 'k' ? 0 : (rnd() - 0.5) * 0.002), start = Math.round(t * SR);
      const th = (kd[3] + 1) * Math.PI / 4, g = kd[2] * v * (1 + (rnd() - 0.5) * 0.06);
      mixRing(bufs[c], start, 1, g * Math.cos(th), g * Math.sin(th), g * (kd[4] || 0), 0, L, R, V, D);
      if (c === 'k') kicks.push(start);
    };
    for (let bar = 0; bar < song.bars; bar++) {
      const pat = dr.pat[order[bar]];
      if (!pat) throw new Error(song.id + ': no drum pattern "' + order[bar] + '"');
      for (const c in pat) {
        const str = pat[c].replace(/\s+/g, ''), len = str.length;
        for (let s = 0; s < 16; s++) { const v = VEL[str[(bar * 16 + s) % len]]; if (v) hit(c, bar * 16 + s, v); }
      }
      if (dr.crash && dr.crash.indexOf(bar + 1) >= 0 && kit.x) hit('x', bar * 16, 1);
      yield;
    }

    // Side-chain pump: pad and arpeggio duck under every kick and swell back.
    if (PL) {
      const env = new Float32Array(N).fill(1), depth = mix.pump[0], relN = mix.pump[1] * SR, aN = 0.004 * SR, len = Math.round(relN * 5);
      for (let q = 0; q < kicks.length; q++) {
        for (let j = 0; j < len; j++) {
          const idx = (kicks[q] + j) % N, gg = 1 - depth * (j < aN ? j / aN : Math.exp(-(j - aN) / relN));
          if (gg < env[idx]) env[idx] = gg;
        }
      }
      for (let i = 0; i < N; i++) { L[i] += PL[i] * env[i]; R[i] += PR[i] * env[i]; }
      yield;
    }

    if (mix.dly) { echo(D, L, R, Math.round(mix.dly[0] * 60 / song.bpm * SR), mix.dly[1], mix.dly[2], mix.dly[3], true); yield; }
    if (mix.rev) yield* reverbGen(V, L, R, mix.rev[0], mix.rev[1], mix.rev[2], true);
    highpass(L, 28, true); highpass(R, 28, true);
    yield;
    // Master: bring every song to the same loudness, then limit to -1 dBFS
    // (at most a few dB of limiting, so transients keep their snap).
    const loud = loudness([L, R], 0);
    yield;
    const gain = Math.min(dbToGain((mix.lv || -13) - loud), CEIL / Math.max(1e-6, peakOf([L, R])) * dbToGain(4));
    scale([L, R], gain);
    yield;
    yield* limitGen([L, R], CEIL, true);
    return { chs: [L, R], sec: N / SR };
  }

  /* ── The songs ────────────────────────────────────────────────────────────
   * All original. Each is a real little piece: a hook built from a short
   * rhythmic motif, answered and varied, over a progression that turns back
   * to bar 1 so the loop never sounds like it restarts.
   */
  const SONGS = {};

  /* Menu — "Green Light Anthem" (D major, 150): a bright racing anthem. The
   * hook's "da-da-da DAAA" motif climbs the D chord, answers itself on G,
   * then the second time round a horn line doubles it a third below; the
   * bridge soars over B minor and turns home on A7. */
  const MENU_A = 'A4:2 D5:2 F#5:2 A5:4 F#5:2 A5:2 B5:2 | A5:6 G5:2 F#5:2 E5:2 D5:4 | B4:2 D5:2 G5:2 B5:4 A5:2 G5:2 A5:2 | A5:4 G5:2 F#5:2 E5:8 | ' +
    'F#5:2 F#5:2 F#5:2 B5:4 A5:2 F#5:2 D5:2 | E5:2 F#5:2 G5:2 B5:4 A5:2 G5:2 E5:2 | G5:4 F#5:2 E5:2 F#5:2 G5:2 A5:2 C#6:2 | D6:6 A5:2 F#5:4 r:4';
  const MENU_B = 'D5:4 F#5:4 B5:6 A5:2 | G5:4 F#5:4 D5:8 | F#5:4 A5:4 D6:6 C#6:2 | B5:4 A5:4 E5:8 | ' +
    'D5:4 F#5:4 B5:6 A5:2 | G5:4 B5:4 D6:8 | E6:4 D6:2 B5:2 G5:4 E5:4 | C#6:2 B5:2 A5:2 G5:2 F#5:2 E5:2 D5:2 C#5:2';
  SONGS.menu = {
    id: 'menu', title: 'Green Light Anthem', bpm: 150, bars: 24, key: ['D', 'major'],
    chords: 'D | D/F# | G | A | Bm | G | Em7 A | D | D | D/F# | G | A | Bm | G | Em7 A | D | Bm | G | D | A | Bm | G | Em | A7',
    parts: [
      { v: 'brass', n: MENU_A + ' | ' + MENU_A + ' | ' + MENU_B, g: 0.5, rev: 0.18, dly: 0.12 },
      { v: 'lead', n: MENU_A + ' | ' + MENU_A + ' | ' + MENU_B, g: 0.16, pan: 0.15, dly: 0.1 },
      { v: 'brass', n: MENU_A, from: 9, harm: -2, g: 0.3, pan: -0.3, rev: 0.2 },
      { v: 'bass', bass: '1-8-1-8-1-8-1-8-', lo: 'D2', bars: [1, 16], g: 0.55 },
      { v: 'bass', bass: '1.1.1.1.1.1.1.1.', lo: 'D2', bars: [17, 24], g: 0.55 },
      { v: 'supersaw', chord: 'x...............', lo: 'F#3', hi: 'D5', voices: 4, g: 0.16, rev: 0.25 },
      { v: 'chip', arp: '0 1 2 3 2 1 2 3 0 1 2 3 2 1 2 3', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'A5', hi: 'A6', bars: [9, 24], g: 0.1, pan: 0.35, dly: 0.15 }
    ],
    drums: {
      kit: 'pop',
      pat: {
        A: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..............x.' },
        B: { k: 'x.......x.x.....', s: '........x.......', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', m: '..x...x...x...x.' },
        F: { k: 'x...x...x...x.x.', s: '....x...xoxoXxXX', h: 'x.x.x.x.........', t: '..........x.x...', u: '...........x.x..' }
      },
      order: 'AAAAAAAF AAAAAAAF BBBBBBBF', crash: [1, 9, 17]
    },
    mix: { rev: [0.8, 0.35, 0.5], dly: [0.75, 0.28, 2600, 0.5], lv: -13 }
  };

  /* Meadow — "Sunny Meadow Dash" (G major, 140): a whistled tune on a bouncy
   * dotted rhythm over oom-pah bass and off-beat plucks; a gentler Em middle
   * with a flute a third below; a glockenspiel turnaround. */
  const MEADOW_A = 'D5:3 B4:1 D5:2 G5:2 F#5:2 G5:2 A5:4 | G5:3 E5:1 C5:2 E5:2 G5:4 r:4 | D5:3 B4:1 D5:2 G5:2 A5:2 B5:2 C6:2 B5:2 | A5:6 F#5:2 D5:4 r:4 | ' +
    'D5:3 B4:1 D5:2 G5:2 F#5:2 G5:2 B5:4 | C6:3 B5:1 A5:2 G5:2 E5:4 G5:4 | A5:2 G5:2 E5:2 C5:2 D5:2 E5:2 F#5:2 A5:2 | G5:8 r:4 D5:2 E5:2';
  const MEADOW_B = 'B4:4 E5:4 G5:4 F#5:2 E5:2 | E5:6 D5:2 C5:4 E5:4 | D5:4 G5:4 B5:4 A5:2 G5:2 | A5:8 F#5:4 D5:4 | ' +
    'B4:4 E5:4 G5:4 B5:2 A5:2 | G5:6 E5:2 C6:4 B5:4 | A5:4 G5:2 E5:2 C5:4 E5:4 | F#5:4 A5:4 D6:4 C6:4';
  const MEADOW_C = 'G5:2 C6:2 E6:2 C6:2 G5:4 E5:4 | A5:2 D6:2 F#6:2 D6:2 A5:4 F#5:4 | F#5:2 B5:2 D6:4 G5:2 B5:2 E6:4 | C6:2 B5:2 A5:2 G5:2 F#5:2 E5:2 D5:2 C5:2';
  SONGS.meadow = {
    id: 'meadow', title: 'Sunny Meadow Dash', bpm: 140, bars: 20, key: ['G', 'major'],
    chords: 'G | C | G | D | G | C | Am7 D7 | G | Em | C | G | D | Em | C | Am | D7 | C | D | Bm Em | Am7 D7',
    parts: [
      { v: 'whistle', n: MEADOW_A + ' | ' + MEADOW_B, g: 0.5, rev: 0.2, dly: 0.1 },
      { v: 'flute', n: MEADOW_B, from: 9, harm: -2, g: 0.22, pan: -0.3, rev: 0.25 },
      { v: 'glock', n: MEADOW_C, from: 17, g: 0.42, pan: 0.15, rev: 0.25, dly: 0.15 },
      { v: 'pluck', n: MEADOW_C, from: 17, oct: -1, g: 0.25, pan: -0.25 },
      { v: 'bassPluck', bass: '1.-.5.-.1.-.5.-.', lo: 'G1', bars: [1, 8], g: 0.6 },
      { v: 'bassPluck', bass: '1.-.3.-.5.-.8.-.', lo: 'G1', bars: [9, 16], g: 0.6 },
      { v: 'bassPluck', bass: '1.-.5.-.1.-.5.5.', lo: 'G1', bars: [17, 20], g: 0.6 },
      { v: 'stab', chord: '..x...x...x...x.', lo: 'D4', hi: 'D5', voices: 3, g: 0.28, pan: 0.3 },
      { v: 'warmPad', chord: 'x...............', lo: 'G3', hi: 'D5', voices: 3, g: 0.14, rev: 0.3 }
    ],
    drums: {
      kit: 'acoustic',
      pat: {
        A: { k: 'x.......x.......', s: '....x.......x...', S: 'XoxoXoxoXoxoXoxo' },
        B: { k: 'x.......x.x.....', s: '....x.......x...', S: 'XoxoXoxoXoxoXoxo', m: '..x...x...x...x.' },
        C: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', S: 'XoxoXoxoXoxoXoxo' },
        F: { k: 'x.......x.x.....', s: '....x.......xoxx', S: 'XoxoXoxo........', t: '........x.x.....', u: '..........x.x...' }
      },
      order: 'AAAAAAAF BBBBBBBF CCCF', crash: [1, 9, 17]
    },
    mix: { rev: [0.78, 0.4, 0.45], dly: [0.75, 0.25, 2800, 0.4], lv: -13 }
  };

  /* Shores — "Coconut Current" (C major, 120): calypso. A steel pan sings
   * syncopated phrases (the rest on the second eighth is the lilt); marimba
   * strums the off-beats over a tresillo bass and a 3-2 clave; in the middle a
   * twangy surf guitar arpeggiates through an echo. */
  const SHORES_A = 'E5:2 G5:2 r:1 C6:3 A5:2 G5:2 E5:4 | F5:2 A5:2 r:1 C6:3 A5:2 F5:6 | D5:2 G5:2 r:1 B5:3 D6:2 B5:2 G5:4 | E5:3 D5:3 C5:2 G5:8 | ' +
    'E5:2 G5:2 r:1 C6:3 D6:2 E6:2 C6:4 | A5:2 C6:2 r:1 F6:3 E6:2 D6:2 C6:4 | B5:3 C6:3 D6:2 F5:3 E5:3 D5:2 | C5:6 r:2 G4:2 C5:2 E5:2 G5:2';
  const SHORES_B = 'A5:4 C6:4 E6:6 D6:2 | C6:4 A5:4 F5:8 | G5:4 C6:4 E6:4 D6:2 C6:2 | D6:8 B5:4 G5:4 | ' +
    'A5:2 B5:2 C6:4 E6:4 A5:4 | F5:2 G5:2 A5:4 C6:4 F5:4 | F#5:4 A5:4 C6:4 D6:4 | B5:3 A5:3 G5:2 F5:3 E5:3 D5:2';
  const SHORES_C = 'A5:2 C6:2 r:1 A5:3 G5:2 F5:6 | B5:2 D6:2 r:1 B5:3 A5:2 G5:6 | G5:2 E5:2 B4:4 A4:2 C5:2 E5:4 | F5:2 D5:2 A4:4 B4:2 D5:2 F5:2 G5:2';
  SONGS.shores = {
    id: 'shores', title: 'Coconut Current', bpm: 120, bars: 20, key: ['C', 'major'],
    chords: 'C | F | G | C | C | F | G7 | C | Am | F | C | G | Am | F | D7 | G7 | F | G | Em Am | Dm7 G7',
    parts: [
      { v: 'steel', n: SHORES_A + ' | ' + SHORES_B + ' | ' + SHORES_C, g: 0.55, pan: 0.1, rev: 0.22, dly: 0.08 },
      { v: 'surf', arp: '0 1 2 3', rhythm: 'x...x...x...x...', lo: 'E3', hi: 'E5', bars: [9, 16], g: 0.32, pan: -0.35, rev: 0.35, dly: 0.25 },
      { v: 'marStab', chord: '..x...x...x...x.', lo: 'E4', hi: 'E5', voices: 3, g: 0.28, pan: -0.2, rev: 0.15 },
      { v: 'bassPluck', bass: '1..5..8.1..5..8.', lo: 'C2', g: 0.6 },
      { v: 'warmPad', chord: 'x...............', lo: 'G3', hi: 'E5', voices: 3, bars: [9, 16], g: 0.12, rev: 0.3 }
    ],
    drums: {
      kit: 'calypso',
      pat: {
        A: { k: 'x..x....x..x....', r: '....x.......x...', q: 'x.....x.x.....x.', w: '...x.x.....x.x..', S: 'xoxoxoxoxoxoxoxo', l: 'x.....x.....x.......x...x.......' },
        F: { k: 'x..x....x..x....', r: '....x.......x...', q: 'x.x.x.x.xxxx....', w: '.x.x.x.x....xxxx', S: 'xoxoxoxoxoxoxoxo' }
      },
      order: 'AAAAAAAF AAAAAAAF AAAF', crash: [1, 9, 17]
    },
    mix: { rev: [0.75, 0.4, 0.45], dly: [0.5, 0.3, 2400, 0.45], lv: -13 }
  };

  /* Candy — "Gumdrop Groove" (F major, 132, light swing): a staccato toy
   * piano that hops up the chord and tumbles down, a xylophone middle, a cheeky
   * lift through D♭ and E♭ at the end, and bubbles popping all the way. */
  const CANDY_A = 'C5:1 r:1 F5:1 r:1 A5:2 G5:1 F5:1 G5:2 A5:2 C6:4 | D6:2 C6:2 A5:2 F5:2 D5:4 r:4 | Bb4:1 r:1 D5:1 r:1 G5:2 F5:1 D5:1 F5:2 G5:2 Bb5:4 | C6:2 Bb5:2 G5:2 E5:2 C5:4 r:4 | ' +
    'C5:1 r:1 F5:1 r:1 A5:2 G5:1 F5:1 G5:2 A5:2 F6:4 | E6:2 D6:2 C6:2 A5:2 F5:4 D5:4 | D5:2 F5:2 Bb5:4 C6:2 Bb5:2 G5:2 E5:2 | F5:4 A5:2 C6:2 F5:4 r:4';
  const CANDY_B = 'F5:3 D5:1 F5:2 Bb5:2 D6:4 C6:4 | E5:3 C5:1 E5:2 G5:2 C6:4 Bb5:4 | A5:2 C6:2 E6:2 C6:2 A5:4 E5:4 | F5:2 A5:2 D6:2 A5:2 F5:4 D5:4 | ' +
    'G5:3 Bb5:1 D6:2 Bb5:2 G5:4 F5:4 | E5:3 G5:1 C6:2 G5:2 E5:4 C5:4 | D5:2 F5:2 Bb5:2 D6:2 F6:4 D6:4 | E6:2 D6:2 C6:2 Bb5:2 G5:2 E5:2 C5:4';
  const CANDY_C = 'F5:2 Ab5:2 Db6:4 C6:2 Ab5:2 F5:4 | G5:2 Bb5:2 Eb6:4 D6:2 Bb5:2 G5:4 | A5:2 C6:2 F6:4 E6:2 C6:2 A5:4 | G5:2 E5:2 C5:2 E5:2 G5:2 Bb5:2 C6:4';
  const CANDY_BUBBLES = 'r:6 C6:2 r:6 F6:2 | r:4 A5:2 r:6 C6:2 r:2 | r:6 G5:2 r:4 D6:2 r:2 | r:2 F6:2 r:8 C6:2 r:2';
  SONGS.candy = {
    id: 'candy', title: 'Gumdrop Groove', bpm: 132, swing: 0.25, bars: 20, key: ['F', 'major'],
    chords: 'F | Dm | Gm7 | C7 | F | Dm | Bb C | F | Bb | C | Am | Dm | Gm | C | Bb | C7 | Db | Eb | F | C7',
    parts: [
      { v: 'toy', n: CANDY_A, g: 0.55, pan: 0.05, rev: 0.2, dly: 0.12 },
      { v: 'xylo', n: CANDY_B, from: 9, g: 0.55, pan: 0.05, rev: 0.2 },
      { v: 'toy', n: CANDY_C, from: 17, g: 0.55, rev: 0.22, dly: 0.12 },
      { v: 'glock', n: CANDY_C, from: 17, g: 0.2, pan: 0.3 },
      { v: 'bloop', n: CANDY_BUBBLES, rep: true, g: 0.3, pan: -0.35, dly: 0.2 },
      { v: 'bassPluck', bass: '1-5-8-5-1-5-8-5-', lo: 'F1', g: 0.6 },
      { v: 'epStab', chord: '..x..x....x..x..', lo: 'C4', hi: 'C5', voices: 3, g: 0.22, pan: -0.25 }
    ],
    drums: {
      kit: 'pop',
      pat: {
        A: { k: 'x.....x.x.......', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', S: '..x...x...x...x.' },
        B: { k: 'x.....x.x.....x.', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', m: '..x...x...x...x.' },
        F: { k: 'x.....x.x.......', c: '....x.......x.xx', h: 'x.x.x.x.........', t: '........x.x.....', u: '............x.x.' }
      },
      order: 'AAAAAAAF BBBBBBBF AAAF', crash: [1, 9, 17]
    },
    mix: { rev: [0.72, 0.4, 0.4], dly: [0.75, 0.3, 3000, 0.45], lv: -13 }
  };

  /* Dunes — "Mirage Run" (D minor, 116): an oud-like pluck over a darbuka
   * maqsum groove. The exotic colour is used with a light hand: the
   * augmented second (B♭ to C♯) appears only over the A7 chord, where the
   * harmonic minor makes it sound inevitable; a breathy ney takes the middle. */
  const DUNES_A = 'D5:2 E5:2 F5:4 E5:2 D5:2 A4:4 | F5:2 G5:2 A5:3 G5:1 F5:2 E5:2 D5:4 | G5:2 A5:2 Bb5:4 A5:2 G5:2 D5:4 | A5:2 Bb5:2 C#6:4 Bb5:2 A5:2 E5:4 | ' +
    'D6:4 C#6:2 D6:2 A5:4 F5:4 | F5:2 G5:2 A5:2 Bb5:2 D6:4 Bb5:4 | G5:2 Bb5:2 A5:2 G5:2 F5:2 E5:2 C#5:2 E5:2 | D5:8 r:4 D5:2 F5:2';
  const DUNES_B = 'F5:6 D5:2 Bb4:4 D5:4 | E5:6 G5:2 C6:4 Bb5:4 | A5:8 F5:4 D5:4 | E5:4 F5:2 E5:2 C#5:4 A4:4 | ' +
    'D5:4 F5:4 Bb5:6 A5:2 | G5:4 E5:4 C5:6 E5:2 | D5:2 G5:2 Bb5:4 A5:2 G5:2 F5:4 | E5:4 C#5:4 A4:4 C#5:2 E5:2';
  const DUNES_C = 'A5:2 G5:2 F5:2 E5:2 D5:4 A4:4 | Bb5:2 A5:2 G5:2 F5:2 G5:4 D5:4 | F5:2 G5:2 A5:4 Bb5:2 A5:2 G5:2 F5:2 | E5:4 D5:4 C#5:2 D5:2 E5:4';
  SONGS.dunes = {
    id: 'dunes', title: 'Mirage Run', bpm: 116, bars: 20, key: ['D', 'harmonic'],
    chords: 'Dm | Dm | Gm | A7 | Dm | Bb | Gm A7 | Dm | Bb | C | Dm | A7 | Bb | C | Gm | A7 | Dm | Gm | Bb A7 | Dm A7',
    parts: [
      { v: 'oud', n: DUNES_A, g: 0.6, pan: 0.1, rev: 0.2, dly: 0.08 },
      { v: 'ney', n: DUNES_B, from: 9, g: 0.5, rev: 0.32, dly: 0.14 },
      { v: 'oud', n: DUNES_C, from: 17, g: 0.6, pan: 0.1, rev: 0.2 },
      { v: 'pluck', arp: '0 1 2 1 0 1 2 3', rhythm: 'x.x.x.x.x.x.x.x.', lo: 'D4', hi: 'D5', bars: [9, 16], g: 0.18, pan: -0.35, rev: 0.2 },
      { v: 'bassPluck', bass: '1..8..1.5..8..1.', lo: 'D2', g: 0.6 },
      { v: 'warmPad', chord: 'x...............', lo: 'A3', hi: 'F5', voices: 3, g: 0.16, rev: 0.35 }
    ],
    drums: {
      kit: 'darbuka',
      pat: {
        A: { d: 'x.......x.......', t: '..x...x.....x...', e: '...o...o.o.o...o', S: 'x.xxx.xxx.xxx.xx', k: 'x.......x.......' },
        F: { d: 'x.......x...x...', t: '..x...x.xxxx.xxx', e: '.o.o.o.o........', S: 'x.xxx.xxx.xxx.xx', k: 'x.......x...x...' }
      },
      order: 'AAAAAAAF AAAAAAAF AAAF', crash: [1, 9, 17]
    },
    mix: { rev: [0.8, 0.45, 0.5], dly: [0.75, 0.28, 2400, 0.4], lv: -13 }
  };

  /* Frost — "Crystal Carve" (A major, 140): bells ring out a wide, leaping
   * tune with sparkling echoes; a celesta twinkles in sixteenths above; strings
   * underneath, a crisp beat with sleigh bells on the off-beats. */
  const FROST_A = 'E5:2 A5:2 C#6:2 E6:4 C#6:2 B5:2 A5:2 | B5:6 G#5:2 E5:4 r:4 | C#5:2 F#5:2 A5:2 C#6:4 B5:2 A5:2 F#5:2 | A5:6 F#5:2 D5:4 E5:4 | ' +
    'E5:2 A5:2 C#6:2 E6:4 F#6:2 E6:2 C#6:2 | B5:4 E6:4 G#5:4 B5:4 | F#5:2 A5:2 D6:4 E6:2 D6:2 B5:2 G#5:2 | A5:8 r:4 E5:2 G#5:2';
  const FROST_B = 'A5:4 F#5:4 D6:6 C#6:2 | B5:4 G#5:4 E6:8 | E6:4 C#6:4 G#5:4 E5:4 | F#5:4 A5:4 C#6:8 | ' +
    'D6:4 B5:4 F#5:4 D5:4 | E5:4 G#5:4 B5:6 A5:2 | F#5:2 A5:2 D6:2 F#6:2 E6:4 D6:4 | D6:4 B5:4 G#5:4 E5:4';
  const FROST_C = 'C#6:2 B5:2 A5:2 F#5:2 A5:4 C#6:4 | D6:2 C#6:2 A5:2 F#5:2 A5:4 D6:4 | F#6:4 D6:4 B5:4 A5:4 | G#5:2 B5:2 D6:2 E6:2 D6:2 B5:2 G#5:2 E5:2';
  SONGS.frost = {
    id: 'frost', title: 'Crystal Carve', bpm: 140, bars: 20, key: ['A', 'major'],
    chords: 'A | E/G# | F#m | D | A | E | D E | A | D | E | C#m | F#m | Bm | E | D | E7 | F#m | D | Bm7 | E7',
    parts: [
      { v: 'bell', n: FROST_A + ' | ' + FROST_B + ' | ' + FROST_C, g: 0.5, rev: 0.3, dly: 0.2 },
      { v: 'celesta', arp: '0 1 2 3 4 3 2 1 0 1 2 3 4 3 2 1', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'A5', hi: 'A6', bars: [9, 20], g: 0.1, pan: 0.35, rev: 0.25 },
      { v: 'pad', chord: 'x...............', lo: 'E3', hi: 'C#5', voices: 4, g: 0.18, rev: 0.35 },
      { v: 'sub', bass: '1...1.8.1...1.5.', lo: 'A1', g: 0.65 },
      { v: 'stab', chord: '..x...x...x...x.', lo: 'C#4', hi: 'C#5', voices: 3, g: 0.18, pan: -0.3 }
    ],
    drums: {
      kit: 'electro',
      pat: {
        A: { k: 'x.....x...x.....', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', S: '..x...x...x...x.' },
        B: { k: 'x...x...x...x...', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', S: '..x...x...x...x.', o: '..............x.' },
        F: { k: 'x.....x...x.x...', c: '....x.......xxxx', h: 'xoxoxoxo........', t: '........x..x....', u: '..........x..x..' }
      },
      order: 'AAAAAAAF BBBBBBBF AAAF', crash: [1, 9, 17]
    },
    mix: { rev: [0.84, 0.3, 0.55], dly: [0.75, 0.32, 3500, 0.45], lv: -13 }
  };

  /* Spooky — "Boo-gie Woods" (D minor, 120, swung): a gliding theremin tune
   * with a creeping chromatic neighbour note, walking bass, organ stabs on two
   * and four and xylophone "bones"; the middle hands the tune to the organ. */
  const SPOOKY_A = 'D5:4 F5:2 A5:2 G#5:2 A5:6 | F5:2 E5:2 D5:2 C#5:2 D5:8 | G5:4 Bb5:2 D6:2 C#6:2 D6:6 | A5:2 G5:2 F5:2 E5:2 D5:8 | ' +
    'F5:4 Ab5:2 Bb5:2 D6:4 C6:2 Bb5:2 | C#6:4 A5:2 E5:2 G5:4 F5:2 E5:2 | D5:2 F5:2 A5:2 D6:2 C#6:2 A5:2 F5:4 | E5:4 G5:4 C#6:4 A5:4';
  const SPOOKY_B = 'G5:2 A5:2 Bb5:2 D6:2 G5:8 | Bb5:2 A5:2 G5:2 F#5:2 G5:8 | F5:2 G5:2 A5:2 D6:2 A5:8 | C#6:2 D6:2 A5:2 F5:2 D5:8 | ' +
    'G5:2 Bb5:2 D6:2 E6:2 D6:4 Bb5:4 | C#6:2 E6:2 G6:4 E6:2 C#6:2 A5:4 | D6:4 A5:4 F5:4 D5:4 | E5:2 F5:2 G5:2 A5:2 Bb5:2 C#6:2 E6:4';
  const SPOOKY_C = 'D6:4 C6:2 Bb5:2 F5:8 | E6:4 D6:2 C#6:2 A5:8 | F5:2 A5:2 D6:4 D6:2 C6:2 Bb5:2 F5:2 | E5:2 G5:2 Bb5:2 C#6:2 E6:4 C#6:2 A5:2';
  SONGS.spooky = {
    id: 'spooky', title: 'Boo-gie Woods', bpm: 120, swing: 0.62, bars: 20, key: ['D', 'harmonic'],
    chords: 'Dm | Dm | Gm | Dm | Bb7 | A7 | Dm | A7 | Gm | Gm | Dm | Dm | Em7b5 | A7 | Dm | A7 | Bb | A7 | Dm Bb | A7',
    parts: [
      { v: 'theremin', legato: 1, n: SPOOKY_A, g: 0.42, rev: 0.35, dly: 0.14 },
      { v: 'organ', n: SPOOKY_B, from: 9, g: 0.34, pan: -0.1, rev: 0.28 },
      { v: 'xylo', n: SPOOKY_B, from: 9, oct: 1, g: 0.2, pan: 0.3 },
      { v: 'theremin', legato: 1, n: SPOOKY_C, from: 17, g: 0.42, rev: 0.35, dly: 0.14 },
      { v: 'xylo', arp: '2 1 2 3', rhythm: '..x...x...x...x.', lo: 'D5', hi: 'D6', bars: [1, 8], g: 0.22, pan: 0.4 },
      { v: 'organStab', chord: '....x.......x...', lo: 'F3', hi: 'D5', voices: 3, g: 0.2, pan: -0.3, gate: 0.5 },
      { v: 'bassPluck', bass: '1...3...5...a...', lo: 'D2', g: 0.7 }
    ],
    drums: {
      kit: 'swing',
      pat: {
        A: { k: 'x.......x.......', b: '....x.......x...', n: '....x.......x...', r: 'x...x.x.x...x.x.' },
        F: { k: 'x.......x.......', b: '....x...x.x.xxxx', r: 'x...x.x.x.......', t: '........x..x....', u: '..........x..x..' }
      },
      order: 'AAAAAAAF AAAAAAAF AAAF', crash: [1, 9, 17]
    },
    mix: { rev: [0.86, 0.35, 0.6], dly: [0.667, 0.3, 2200, 0.4], lv: -13.5 }
  };

  /* Lava — "Magma Rush" (E minor, 152): driving minor rock. Palm-muted power
   * chords chug in eighths; a gritty lead states the riff-tune, a big major-
   * lift chorus rings out over open chords, then the tune returns as a twin
   * lead in thirds. */
  const LAVA_A = 'E5:4 G5:2 A5:2 B5:6 A5:2 | G5:2 F#5:2 E5:2 D5:2 E5:8 | E5:2 G5:2 C6:4 B5:2 A5:2 G5:4 | F#5:2 A5:2 D6:4 C6:2 B5:2 A5:4 | ' +
    'B5:4 E6:4 D6:2 B5:2 G5:4 | A5:2 G5:2 F#5:2 G5:2 E5:8 | E5:2 G5:2 C6:4 D6:2 C6:2 B5:2 A5:2 | B5:8 r:4 E5:2 F#5:2';
  const LAVA_B = 'A5:4 C6:4 E6:6 D6:2 | C6:4 B5:4 G5:8 | B5:4 D6:4 G6:6 F#6:2 | F#6:4 E6:2 D6:2 A5:8 | ' +
    'A5:4 C6:4 E6:6 D6:2 | E6:4 D6:2 C6:2 G5:8 | F#5:4 A5:4 B5:4 D#6:4 | F#6:8 D#6:4 B5:4';
  SONGS.lava = {
    id: 'lava', title: 'Magma Rush', bpm: 152, bars: 24, key: ['E', 'minor'],
    chords: 'Em | Em | C | D | Em | Em | C D | Em | Am | C | G | D | Am | C | B7 | B7 | Em | Em | C | D | Em | Em | C D | Em',
    parts: [
      { v: 'rockLead', n: LAVA_A + ' | ' + LAVA_B + ' | ' + LAVA_A, g: 0.46, pan: 0.08, rev: 0.18, dly: 0.12 },
      { v: 'rockLead', n: LAVA_A, from: 17, harm: -2, g: 0.28, pan: -0.28, rev: 0.18 },
      { v: 'power', power: 'x.x.x.x.x.x.x.x.', lo: 'E2', bars: [1, 8], g: 0.34, pan: -0.3, P: { mute: 1 } },
      { v: 'power', power: 'x.......x...x...', lo: 'E2', bars: [9, 16], g: 0.3, pan: -0.3 },
      { v: 'power', power: 'x.......x...x...', lo: 'E2', bars: [9, 16], oct: 1, g: 0.2, pan: 0.35 },
      { v: 'power', power: 'x.x.x.x.x.x.x.x.', lo: 'E2', bars: [17, 24], g: 0.34, pan: -0.3, P: { mute: 1 } },
      { v: 'bass', bass: '1.1.1.1.1.1.1.1.', lo: 'E1', g: 0.55 },
      { v: 'pad', chord: 'x...............', lo: 'E3', hi: 'E5', voices: 3, bars: [9, 16], g: 0.14, rev: 0.3 }
    ],
    drums: {
      kit: 'rock',
      pat: {
        A: { k: 'x.......x.x.....', s: '....x.......x...', h: 'X.x.X.x.X.x.X.x.' },
        B: { k: 'x...x...x...x...', s: '....x.......x...', r: 'x.x.x.x.x.x.x.x.' },
        F: { k: 'x.......x.x.....', s: '....x...xxxxXXXX', h: 'X.x.X.x.........', t: '........x.x.....', u: '..........x.x...' }
      },
      order: 'AAAAAAAF BBBBBBBF AAAAAAAF', crash: [1, 5, 9, 13, 17, 21]
    },
    mix: { rev: [0.7, 0.45, 0.35], dly: [0.75, 0.25, 2200, 0.35], lv: -12.5 }
  };

  /* Starlight — "Nebula Drive" (A minor, 132): soaring synth. Sixteenth-note
   * arpeggios and a supersaw pad breathe with a side-chain pump; a big saw lead
   * climbs to G6; then a bell melody over a breakdown that builds back in. */
  const STAR_A = 'E5:6 A5:2 B5:4 C6:4 | C6:4 A5:4 F5:8 | G5:6 C6:2 D6:4 E6:4 | D6:8 B5:4 G5:4 | ' +
    'E6:6 D6:2 C6:4 A5:4 | F6:6 E6:2 C6:4 A5:4 | G5:4 C6:4 E6:4 G6:4 | G6:8 D6:4 B5:4';
  const STAR_B = 'C6:6 A5:2 F5:4 A5:4 | D6:6 B5:2 G5:4 B5:4 | E6:8 C6:4 A5:4 | B5:4 C6:4 D6:4 E6:4 | ' +
    'F6:6 E6:2 C6:4 A5:4 | G6:6 F6:2 D6:4 B5:4 | G#5:4 B5:4 D6:4 E6:4 | E6:12 r:4';
  const STAR_C = 'A5:4 C6:4 E6:8 | F5:4 A5:4 C6:8 | E5:4 G5:4 C6:8 | D5:4 G5:4 B5:8 | ' +
    'A5:4 C6:4 E6:4 A6:4 | A6:4 F6:4 C6:4 A5:4 | G5:4 C6:4 E6:4 G6:4 | G6:4 F6:4 D6:4 B5:4';
  SONGS.starlight = {
    id: 'starlight', title: 'Nebula Drive', bpm: 132, bars: 24, key: ['A', 'minor'],
    chords: 'Am | F | C | G | Am | F | C | G | F | G | Am | Am | F | G | E7 | E7 | Am | F | C | G | Am | F | C | G',
    parts: [
      { v: 'sawLead', n: STAR_A + ' | ' + STAR_B, g: 0.42, rev: 0.25, dly: 0.3 },
      { v: 'bell', n: STAR_C, from: 17, g: 0.45, rev: 0.35, dly: 0.3 },
      { v: 'chip', arp: '0 1 2 3 4 5 4 3 2 1 2 3 4 5 6 5', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'A3', hi: 'A5', g: 0.2, pan: 0.25, dly: 0.2, pump: 1 },
      { v: 'supersaw', chord: 'x...............', lo: 'E3', hi: 'E5', voices: 4, g: 0.2, rev: 0.3, pump: 1 },
      { v: 'bass', bass: '--1.--1.--1.--1.', lo: 'A1', bars: [1, 16], g: 0.55 },
      { v: 'bass', bass: '--1.--1.--1.--1.', lo: 'A1', bars: [21, 24], g: 0.55 }
    ],
    drums: {
      kit: 'electro',
      pat: {
        A: { k: 'x...x...x...x...', c: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' },
        D: { h: 'x.x.x.x.x.x.x.x.', o: '..............x.' },
        E: { k: 'x...x...x...x...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' },
        R: { k: 'x...x...x...x...', c: 'x.x.x.x.xxxxXXXX', h: 'xxxxxxxxxxxxxxxx' }
      },
      order: 'AAAAAAAA AAAAAAAA DDDD EEER', crash: [1, 9, 17, 21]
    },
    mix: { rev: [0.85, 0.3, 0.5], dly: [0.75, 0.38, 3000, 0.5], pump: [0.5, 0.13], lv: -13 }
  };

  /* Jungle — "Canopy Chase" (B♭ major with a mixolydian A♭, 128, a touch of
   * swing): an explorer's march through the canopy. A marimba hook on a
   * 3-3-2 rhythm climbs the chord and tumbles back down over A♭ (the
   * "adventure" chord); floor toms, congas and a wood-block clave drive it,
   * and a bird whistles back from the trees through the echo. The middle is a
   * bold brass call over G minor (in thirds the second time), the end a flute
   * turnaround on the hook's rhythm whose ii–V lands back on bar 1. */
  const JUNGLE_A = 'D5:3 F5:3 A5:2 Bb5:2 C6:2 D6:4 | C6:3 Ab5:3 F5:2 Eb5:2 F5:2 Ab5:4 | Eb5:3 G5:3 Bb5:2 Eb6:2 F6:2 Eb6:2 Bb5:2 | C6:6 A5:2 F5:4 r:4 | ' +
    'D5:3 F5:3 A5:2 Bb5:2 C6:2 D6:2 F6:2 | Eb6:3 C6:3 Bb5:2 Ab5:2 Bb5:2 C6:4 | Bb5:2 G5:2 Eb5:2 G5:2 A5:2 C6:2 F6:2 Eb6:2 | D6:6 C6:2 Bb5:4 r:4';
  const JUNGLE_B1 = 'G5:3 G5:1 D6:6 C6:2 Bb5:2 A5:2 | Bb5:6 G5:2 Eb5:8 | G5:3 G5:1 Eb6:6 D6:2 C6:2 Bb5:2 | A5:6 C6:2 F5:8';
  const JUNGLE_B2 = 'Bb5:3 C6:1 D6:6 F6:2 D6:2 Bb5:2 | Eb6:6 D6:2 Bb5:4 G5:4 | Ab5:3 Bb5:1 C6:4 Eb6:4 C6:4 | D6:6 Bb5:2 F6:8';
  const JUNGLE_B2H = 'G5:3 G5:1 Bb5:6 D6:2 Bb5:2 G5:2 | G5:6 F5:2 G5:4 Eb5:4 | Eb5:3 Eb5:1 Ab5:4 C6:4 Ab5:4 | Bb5:6 F5:2 D6:8';
  const JUNGLE_C = 'Eb6:3 Bb5:3 G5:2 Bb5:2 C6:2 Eb6:4 | F6:3 C6:3 A5:2 C6:2 D6:2 F6:4 | G6:3 D6:3 Bb5:2 G5:2 Bb5:2 Eb6:4 | C6:2 Bb5:2 G5:2 Eb5:2 Eb6:2 C6:2 A5:2 F5:2';
  const JUNGLE_BIRD = 'r:16 | r:16 | r:16 | r:12 F6:1 D6:1 F6:1 r:1 | r:16 | r:16 | r:16 | r:12 F6:1 D6:1 F6:1 r:1 | r:16 | r:16 | r:16 | r:13 C6:1 A5:1 C6:1';
  SONGS.jungle = {
    id: 'jungle', title: 'Canopy Chase', bpm: 128, swing: 0.15, bars: 20, key: ['Bb', 'mixolydian'],
    chords: 'Bb | Ab | Eb | F | Bb | Ab | Eb F | Bb | Gm | Eb | Cm | F | Gm | Eb | Ab | Bb | Eb | F | Gm Eb | Cm7 F7',
    parts: [
      { v: 'marimba', n: JUNGLE_A, g: 0.62, pan: 0.05, rev: 0.18, dly: 0.1 },
      { v: 'brass', n: JUNGLE_B1 + ' | ' + JUNGLE_B2, from: 9, g: 0.8, rev: 0.22, dly: 0.08 },
      { v: 'brass', n: JUNGLE_B2H, from: 13, g: 0.55, pan: -0.3, rev: 0.22 },
      { v: 'flute', n: JUNGLE_C, from: 17, g: 0.5, pan: 0.05, rev: 0.25, dly: 0.12 },
      { v: 'marimba', n: JUNGLE_C, from: 17, oct: -1, g: 0.3, pan: -0.25 },
      { v: 'whistle', n: JUNGLE_BIRD, g: 0.26, pan: 0.45, rev: 0.2, dly: 0.35, P: { scoop: 0.12, vib: 0 } },
      { v: 'kalimba', arp: '0 2 1 3 2 4 3 1', rhythm: 'x.x.x.x.x.x.x.x.', lo: 'F4', hi: 'F5', bars: [9, 20], g: 0.22, pan: -0.35, rev: 0.15 },
      { v: 'stab', chord: '..x..x...x..x...', lo: 'Bb3', hi: 'Bb4', voices: 3, g: 0.2, pan: 0.3 },
      { v: 'bassPluck', bass: '1..8..5.--1.5.a.', lo: 'G1', g: 0.62 },
      { v: 'warmPad', chord: 'x...............', lo: 'F3', hi: 'D5', voices: 3, bars: [9, 20], g: 0.13, rev: 0.3 }
    ],
    drums: {
      kit: 'jungle',
      pat: {
        A: { k: 'x.....x.x.......', t: '....x.......x...', u: '...o......x..o..', w: '..x...x...x...x.', S: 'xoxoxoxoxoxoxoxo', b: 'x..x..x...x.x...' },
        B: { k: 'x.....x.x.....x.', t: '....x.......x...', u: '..x..x....x..x..', q: 'x.......x.......', w: '..x.x.x...x.x.x.', S: 'XoxoXoxoXoxoXoxo' },
        C: { k: 'x.....x.x.......', t: '....x.......x...', q: '......x.......x.', w: '..x...x...x...x.', S: 'xoxoxoxoxoxoxoxo', b: 'x..x..x...x.x...' },
        F: { k: 'x.......x.......', t: '....x...x.x.x...', u: '.........x.x.xXX', S: 'xoxoxoxo........', b: 'x..x..x.........' }
      },
      order: 'AAAAAAAF BBBBBBBF CCCF', crash: [1, 9, 17]
    },
    mix: { rev: [0.78, 0.38, 0.45], dly: [0.75, 0.3, 2600, 0.4], lv: -13 }
  };

  /* Isles — "Cloud Hopper" (E♭ major, 136): sky-high and weightless. Flute
   * and glockenspiel hop up a sixth, island to island, over harp arpeggios
   * (a second flute joins in thirds); the chorus soars on a bright pulse lead
   * with bells and chiptune sparkle; then the beat falls away to celesta, harp
   * sweeps and a low gliding voice (the sky whale), and a ♭VI–♭VII lift
   * (C♭, D♭) carries it back up to E♭ at the top. */
  const ISLES_A1 = 'Eb5:2 G5:2 Eb6:6 D6:2 Bb5:4 | C5:2 Eb5:2 C6:6 Bb5:2 Ab5:4 | G5:2 C6:2 Eb6:6 F6:2 Eb6:2 D6:2 | D6:8 Bb5:4 r:4';
  const ISLES_A2 = 'Eb5:2 G5:2 Eb6:6 F6:2 G6:4 | Ab6:6 G6:2 Eb6:4 C6:4 | C6:2 Ab5:2 F5:2 Ab5:2 Bb5:2 D6:2 F6:4 | G6:6 F6:2 Eb6:4 r:2 Bb5:2';
  const ISLES_A2H = 'Bb4:2 Eb5:2 G5:6 Ab5:2 Bb5:4 | C6:6 Bb5:2 C6:4 Ab5:4 | Ab5:2 F5:2 C5:2 F5:2 F5:2 Bb5:2 D6:4 | Bb5:6 Ab5:2 G5:4 r:4';
  const ISLES_B = 'C6:6 Bb5:2 Ab5:2 Bb5:2 C6:4 | D6:6 C6:2 Bb5:2 C6:2 D6:4 | Bb5:4 D6:4 G6:6 F6:2 | Eb6:6 D6:2 C6:4 G5:4 | ' +
    'C6:6 Bb5:2 Ab5:2 Bb5:2 C6:4 | D6:6 C6:2 Bb5:2 D6:2 F6:4 | Bb5:2 Eb6:2 G6:4 Ab6:6 G6:2 | F6:12 D6:2 Bb5:2';
  const ISLES_C = 'G5:4 Eb6:8 D6:2 C6:2 | C6:4 Ab6:8 G6:2 Eb6:2 | Bb5:4 G6:8 F6:2 Eb6:2 | F6:4 Eb6:4 D6:8';
  const ISLES_WHALE = 'r:4 G3:6 C4:6 | r:4 Ab3:4 Eb4:8 | r:4 Bb3:4 G4:8 | F4:8 D4:4 r:4';
  const ISLES_D = 'Ab5:2 C6:2 Eb6:4 C6:2 Eb6:2 Ab6:4 | Bb5:2 D6:2 F6:4 D6:2 F6:2 Bb6:4 | G6:4 F6:2 D6:2 Eb6:4 G6:4 | Eb6:2 Gb6:2 Eb6:2 Cb6:2 F6:2 Ab6:2 F6:2 Db6:2';
  SONGS.isles = {
    id: 'isles', title: 'Cloud Hopper', bpm: 136, bars: 24, key: ['Eb', 'major'],
    chords: 'Eb | Ab | Cm | Bb | Eb | Ab | Fm7 Bb | Eb | Ab | Bb | Gm | Cm | Ab | Bb | Eb/G Ab | Bb | Cm | Ab | Eb | Bbsus4 Bb | Ab | Bb | Gm Cm | Cb Db',
    parts: [
      { v: 'flute', n: ISLES_A1 + ' | ' + ISLES_A2, g: 0.36, rev: 0.28, dly: 0.16 },
      { v: 'glock', n: ISLES_A1 + ' | ' + ISLES_A2, g: 0.14, pan: 0.3, rev: 0.25 },
      { v: 'flute', n: ISLES_A2H, from: 5, g: 0.17, pan: -0.3, rev: 0.28 },
      { v: 'lead', n: ISLES_B, from: 9, g: 0.5, rev: 0.22, dly: 0.2 },
      { v: 'bell', n: ISLES_B, from: 9, g: 0.32, pan: -0.2, rev: 0.3 },
      { v: 'sawLead', n: ISLES_B, from: 9, oct: -1, g: 0.2, pan: 0.25 },
      { v: 'celesta', n: ISLES_C, from: 17, g: 0.36, rev: 0.35, dly: 0.25 },
      { v: 'theremin', legato: 1, n: ISLES_WHALE, from: 17, g: 0.1, pan: -0.25, rev: 0.55, P: { glide: 0.2, vib: 0.016, vr: 3.4, a: 0.22, r: 0.45 } },
      { v: 'lead', n: ISLES_D, from: 21, g: 0.46, rev: 0.22, dly: 0.2 },
      { v: 'bell', n: ISLES_D, from: 21, g: 0.3, pan: -0.2, rev: 0.3 },
      { v: 'harp', arp: '0 1 2 3 4 3 2 1', rhythm: 'x.x.x.x.x.x.x.x.', lo: 'Bb3', hi: 'Bb5', bars: [1, 8], g: 0.2, pan: -0.3, rev: 0.3 },
      { v: 'harp', arp: '0 1 2 3 4 5 6 7', rhythm: 'xxxxxxxx........', lo: 'Bb3', hi: 'Bb5', bars: [17, 20], g: 0.3, pan: -0.3, rev: 0.4 },
      { v: 'chip', arp: '0 1 2 1 3 2 4 3 0 1 2 1 3 2 4 3', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'Bb4', hi: 'Bb6', bars: [9, 16], g: 0.12, pan: 0.35, dly: 0.15 },
      { v: 'chip', arp: '0 1 2 1 3 2 4 3 0 1 2 1 3 2 4 3', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'Bb4', hi: 'Bb6', bars: [21, 24], g: 0.12, pan: 0.35, dly: 0.15 },
      { v: 'supersaw', chord: 'x...............', lo: 'G3', hi: 'Eb5', voices: 4, bars: [1, 8], g: 0.13, rev: 0.3 },
      { v: 'supersaw', chord: 'x...............', lo: 'G3', hi: 'Eb5', voices: 4, bars: [9, 16], g: 0.2, rev: 0.3 },
      { v: 'warmPad', chord: 'x...............', lo: 'G3', hi: 'Eb5', voices: 4, bars: [17, 20], g: 0.16, rev: 0.4 },
      { v: 'supersaw', chord: 'x.......x.......', lo: 'G3', hi: 'Eb5', voices: 4, bars: [21, 24], g: 0.2, rev: 0.3 },
      { v: 'sub', bass: '1.......5...1...', lo: 'Ab1', bars: [1, 8], g: 0.45 },
      { v: 'bass', bass: '1..1..1.8..8..5.', lo: 'Ab1', bars: [9, 16], g: 0.5 },
      { v: 'sub', bass: '1...............', lo: 'Ab1', bars: [17, 20], g: 0.4 },
      { v: 'bass', bass: '1..1..1.8..8..5.', lo: 'Ab1', bars: [21, 24], g: 0.5 }
    ],
    drums: {
      kit: 'pop',
      pat: {
        A: { k: 'x.......x.x.....', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', S: '..x...x...x...x.' },
        B: { k: 'x...x...x...x...', c: '....x.......x...', o: '..x...x...x...x.', S: 'xoxoxoxoxoxoxoxo', m: '....x.......x...' },
        D: { k: 'x...............', S: 'x.o.x.o.x.o.x.o.' },
        E: { k: 'x...x...x...x...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', S: 'xoxoxoxoxoxoxoxo' },
        F: { k: 'x.......x.x.....', c: '....x.......x.xx', h: 'x.x.x.x.........', t: '........x.x.....', u: '............x.x.' },
        R: { k: 'x...x...x...x...', s: 'o.o.o.o.x.x.xxXX', h: 'x.x.x.x.x.x.....' }
      },
      order: 'AAAAAAAF BBBBBBBF DDDD EEER', crash: [1, 9, 17, 21]
    },
    mix: { rev: [0.86, 0.3, 0.55], dly: [0.75, 0.35, 3000, 0.45], lv: -13 }
  };

  /* Reef — "Bubble Lagoon" (E major, 122, a light lilt): swimming along the
   * coral. A kalimba hook hops up the chord and stops for breath while a
   * bubble pops in the gap, a celesta shimmering with it; an organ skank on
   * two and four, a rubbery bass and a kick on every beat keep it bobbing.
   * The middle hands the tune to a vibraphone over rippling harp, drifts
   * through C major (sunlight through the water) and turns back to the hook. */
  const REEF_A = 'B4:2 E5:2 G#5:1 r:1 B5:2 r:2 G#5:2 B5:2 C#6:2 | B5:6 G#5:2 E5:2 F#5:2 G#5:4 | A4:2 C#5:2 E5:1 r:1 A5:2 r:2 E5:2 A5:2 B5:2 | B5:6 A5:2 F#5:2 D#5:2 F#5:4 | ' +
    'C#5:2 E5:2 G#5:1 r:1 C#6:2 r:2 G#5:2 C#6:2 D#6:2 | E6:6 C#6:2 A5:2 B5:2 C#6:4 | A5:2 F#5:2 A5:2 C#6:2 E6:2 C#6:2 A5:2 C#6:2 | D#6:6 C#6:2 B5:2 A5:2 F#5:2 G#5:2';
  const REEF_B = 'E5:2 A5:2 C#6:6 B5:2 A5:4 | F#5:2 B5:2 D#6:6 C#6:2 B5:4 | G#5:2 B5:2 D#6:2 G#6:6 D#6:4 | E6:6 C#6:2 G#5:8 | ' +
    'E5:2 A5:2 C#6:6 E6:2 C#6:4 | F#5:2 B5:2 D#6:6 F#6:2 D#6:4 | G5:2 C6:2 E6:6 D6:2 C6:2 B5:2 | A5:6 F#5:2 D#5:4 B4:4';
  const REEF_C = 'E6:2 B5:2 G#5:1 r:1 E6:2 r:2 B5:2 E6:2 F#6:2 | G#6:6 E6:2 C#6:2 B5:2 C#6:4 | A5:2 C#6:2 E6:1 r:1 A6:2 r:2 F#6:2 E6:2 C#6:2 | D#6:6 C#6:2 B5:2 A5:2 F#5:2 D#5:2';
  SONGS.reef = {
    id: 'reef', title: 'Bubble Lagoon', bpm: 122, swing: 0.2, bars: 20, key: ['E', 'major'],
    chords: 'E | E/G# | A | B | C#m | A | F#m7 | B7 | A | B | G#m | C#m | A | B | C | B7 | E | C#m | A F#m7 | B7',
    parts: [
      { v: 'kalimba', n: REEF_A, g: 0.62, pan: 0.05, rev: 0.22, dly: 0.12 },
      { v: 'celesta', n: REEF_A, g: 0.16, pan: 0.3, rev: 0.3 },
      { v: 'vibes', n: REEF_B, from: 9, g: 0.62, rev: 0.3, dly: 0.18 },
      { v: 'kalimba', n: REEF_C, from: 17, g: 0.62, pan: 0.05, rev: 0.22, dly: 0.12 },
      { v: 'celesta', n: REEF_C, from: 17, g: 0.16, pan: 0.3, rev: 0.3 },
      { v: 'harp', arp: '0 1 2 3 4 5 4 3 1 2 3 4 5 6 5 4', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'E4', hi: 'E6', bars: [9, 20], g: 0.18, pan: -0.35, rev: 0.3, dly: 0.15 },
      { v: 'bloop', arp: '3 5 2', rhythm: '--------x.x-----' + '----x.......x.x.', lo: 'E5', hi: 'E7', g: 0.3, pan: -0.3, dly: 0.25 },
      { v: 'organStab', chord: '....x.......x...', lo: 'G#3', hi: 'G#4', voices: 3, g: 0.16, pan: 0.3, gate: 0.35, P: { over: { bars: [0, 0.8, 0.3, 0.6, 0.25, 0.3, 0.1, 0] } } },
      { v: 'bass', bass: '1..1..8.--5.8.5.', lo: 'E1', g: 0.62, P: { cut: 360, env: 4, envTau: 0.07, d: 0.18, s: 0.45 } },
      { v: 'warmPad', chord: 'x...............', lo: 'G#3', hi: 'E5', voices: 3, g: 0.1, rev: 0.4, P: { a: 0.6 } }
    ],
    drums: {
      kit: 'calypso',
      over: { k: ['kick', { f0: 120, f1: 55, tau: 0.12, click: 0.2 }, 0.9, 0, 0], h: ['hat', { tau: 0.025 }, 0.13, 0.35, 0], m: ['tamb', {}, 0.12, -0.4, 0.05] },
      pat: {
        A: { k: 'x...x...x...x...', r: '....x.......x...', S: 'xoxoxoxoxoxoxoxo', q: 'x.......x.....x.', w: '..x...x...x..x..' },
        B: { k: 'x...x...x...x...', r: '....x.......x...', S: 'xoxoxoxoxoxoxoxo', q: 'x.....x.x.......', w: '..x..x....x..x..', h: '..x...x...x...x.', m: '....x.......x...' },
        F: { k: 'x...x...x...x...', r: '....x.......x...', S: 'xoxoxoxo........', q: '........x.x.xx..', w: '.........x.x..xx' }
      },
      order: 'AAAAAAAF BBBBBBBF AAAF', crash: [1, 9, 17]
    },
    mix: { rev: [0.84, 0.35, 0.55], dly: [0.75, 0.33, 2400, 0.45], lv: -13 }
  };

  /* Dino — "Stomp Valley" (A♭ major, 144): giant, friendly footsteps.
   * Timpani follow the chords and stomp with the kick, toms and claps drive a
   * tribal groove, and the brass hook leaps up a fourth and a fifth over an
   * A♭ pedal that lifts through B♭ major (the bright, heroic lydian chord).
   * Little xylophone feet scamper in the gaps; the second time round a horn
   * harmony and a soaring flute join in, and the bridge climbs through F
   * minor and G♭ before an E♭7 sends it back to the top. */
  const DINO_A = 'Eb5:3 Ab5:1 Ab5:4 C6:6 Bb5:2 | Bb5:2 C6:2 D6:6 C6:2 Bb5:4 | Ab5:3 Db6:1 Db6:4 F6:6 Eb6:2 | Eb6:4 C6:2 Ab5:2 Eb5:8 | ' +
    'F5:3 Ab5:1 C6:4 F6:6 Eb6:2 | Db6:2 C6:2 Ab5:4 F5:6 Ab5:2 | Bb5:3 Db6:1 F6:4 Eb6:3 Db6:1 Bb5:4 | Ab5:8 r:4 C5:2 Db5:2';
  const DINO_AH = 'C5:3 Eb5:1 Eb5:4 Ab5:6 G5:2 | F5:2 Ab5:2 Bb5:6 Ab5:2 F5:4 | F5:3 Ab5:1 Ab5:4 Db6:6 C6:2 | C6:4 Ab5:2 Eb5:2 C5:8 | ' +
    'C5:3 F5:1 Ab5:4 C6:6 Bb5:2 | Ab5:2 Ab5:2 F5:4 Db5:6 F5:2 | F5:3 Bb5:1 Db6:4 Bb5:3 Bb5:1 G5:4 | Eb5:8 r:4 Ab4:2 Bb4:2';
  const DINO_B = 'F5:4 Ab5:4 Db6:6 C6:2 | Bb5:4 G5:4 Eb5:8 | Eb5:4 G5:4 C6:6 Bb5:2 | Ab5:4 C6:2 Ab5:2 F5:8 | ' +
    'F5:4 Ab5:4 Db6:4 F6:4 | Gb6:6 F6:2 Db6:4 Bb5:4 | F6:4 Db6:2 Bb5:2 Ab5:4 F5:4 | G5:2 Bb5:2 Db6:2 Eb6:6 Bb5:2 G5:1 F5:1';
  const DINO_SKY = 'Eb6:16 | F6:16 | F6:16 | Eb6:16 | C6:16 | Db6:8 F6:8 | F6:8 G6:8 | Ab6:12 r:4';
  const DINO_FEET = 'r:16 | r:16 | r:16 | r:8 Eb6:1 F6:1 Ab6:1 r:1 C7:1 r:1 Ab6:2 | r:16 | r:16 | r:16 | r:8 Ab6:1 Eb6:1 C6:1 Eb6:1 Ab6:2 r:2';
  SONGS.dino = {
    id: 'dino', title: 'Stomp Valley', bpm: 144, bars: 24, key: ['Ab', 'major'],
    chords: 'Ab | Bb/Ab | Db/Ab | Ab | Fm | Db | Bbm7 Eb | Ab | Ab | Bb/Ab | Db/Ab | Ab | Fm | Db | Bbm7 Eb | Ab | Db | Eb | Cm | Fm | Db | Gb | Bbm7 | Eb7',
    parts: [
      { v: 'brass', n: DINO_A + ' | ' + DINO_A + ' | ' + DINO_B, g: 0.5, rev: 0.2, dly: 0.08 },
      { v: 'brass', n: DINO_AH, from: 9, g: 0.3, pan: -0.3, rev: 0.22 },
      { v: 'brass', n: DINO_B, from: 17, oct: -1, g: 0.22, pan: 0.3, rev: 0.22 },
      { v: 'flute', n: DINO_SKY, from: 9, g: 0.13, pan: 0.25, rev: 0.35, dly: 0.12 },
      { v: 'xylo', n: DINO_FEET + ' | ' + DINO_FEET, g: 0.3, pan: 0.35, rev: 0.15 },
      { v: 'timp', bass: '1.......5.......', lo: 'Ab1', bars: [1, 16], g: 0.5, rev: 0.2 },
      { v: 'timp', bass: '1...5...1...5...', lo: 'Ab1', bars: [17, 24], g: 0.45, rev: 0.2 },
      { v: 'bass', bass: '1.1.1.1.1.1.1.1.', lo: 'Ab1', g: 0.5, P: { cut: 420, env: 2.5 } },
      { v: 'pad', chord: 'x...............', lo: 'Eb3', hi: 'C5', voices: 4, g: 0.12, rev: 0.3 }
    ],
    drums: {
      kit: 'jungle',
      over: { k: ['kick', { f0: 105, f1: 38, tau: 0.3, click: 0.3 }, 1.0, 0, 0.05], c: ['clap', { tail: 0.1 }, 0.42, 0, 0.2] },
      pat: {
        A: { k: 'x.......x.x.....', c: '....x.......x...', t: '...x.......x....', u: '......x.......x.', S: 'xoxoxoxoxoxoxoxo' },
        B: { k: 'x.....x.x.x.....', c: '....x.......x...', t: '...x.......x....', u: '..x...x...x..xx.', w: 'x.x.x.x.x.x.x.x.', S: 'XoxoXoxoXoxoXoxo' },
        C: { k: 'x.......x.......', c: '....x.......x...', t: 'x..x..x...x.....', u: '.....x..x...x.x.', b: 'x..x..x...x.x...', S: 'xoxoxoxoxoxoxoxo' },
        F: { k: 'x.......x.......', c: '....x...........', t: '....x.x.x...x...', u: '.........x.x.xXX', S: 'xoxoxoxo........' }
      },
      order: 'AAAAAAAF BBBBBBBF CCCCCCCF', crash: [1, 9, 17, 21]
    },
    mix: { rev: [0.85, 0.4, 0.55], dly: [0.75, 0.2, 2400, 0.3], lv: -13 }
  };

  /* Toy box — "Toy Parade" (D♭ major, 160): the toys march out. A cheeky
   * kazoo leads in dotted march steps with a chromatic wiggle, over an
   * oom-pah of square bass and xylophone; the toy piano and a music-box
   * glockenspiel take the middle (with a sly turn to G♭ minor), then the
   * kazoo comes back in B♭ minor with the toy piano an octave above and
   * tumbles down a scale into the top again. Xylophone runs fill the gaps. */
  const TOY_A = 'Ab4:3 Db5:1 F5:2 Ab5:2 F5:2 Db5:2 Ab4:4 | C5:3 Eb5:1 Gb5:2 Ab5:2 Gb5:1 F5:1 Eb5:2 C5:4 | Db5:3 F5:1 Ab5:2 Db6:2 C6:1 Db6:1 Eb6:2 Db6:4 | Bb5:2 Ab5:2 Gb5:2 Eb5:2 Db5:4 r:4 | ' +
    'Ab4:3 Db5:1 F5:2 Ab5:2 F5:2 Db5:2 Ab4:4 | Bb4:3 Db5:1 F5:2 Bb5:2 Ab5:1 Bb5:1 C6:2 Db6:4 | Eb6:2 Db6:2 C6:2 Bb5:2 Ab5:2 Gb5:2 F5:2 Eb5:2 | Db5:2 r:2 Ab4:2 r:2 Db5:4 r:4';
  const TOY_B = 'Gb5:2 Bb5:2 Db6:2 Gb6:2 F6:1 Gb6:1 Db6:2 Bb5:4 | F5:2 Ab5:2 Db6:2 F6:2 E6:1 F6:1 Db6:2 Ab5:4 | Eb5:2 Ab5:2 C6:2 Eb6:2 D6:1 Eb6:1 C6:2 Gb5:4 | F5:2 Ab5:2 Db6:4 Ab5:2 F5:2 Db5:4 | ' +
    'Gb5:2 Bb5:2 Db6:2 Gb6:2 F6:1 Gb6:1 Bb6:2 Gb6:4 | A6:2 Gb6:2 Db6:2 A5:2 Bb5:1 A5:1 Gb5:2 Db5:4 | F5:2 Ab5:2 Db6:2 F6:2 Eb6:2 C6:2 Ab5:2 Gb5:2 | Db6:4 Ab5:2 F5:2 Db5:4 r:4';
  const TOY_C = 'F5:3 F5:1 Bb5:2 Db6:2 F6:2 Db6:2 Bb5:4 | A5:3 A5:1 C6:2 Eb6:2 Db6:1 C6:1 A5:2 F5:4 | Bb5:3 Bb5:1 Db6:2 F6:2 Gb6:1 F6:1 Db6:2 Bb5:4 | G5:3 G5:1 Bb5:2 Db6:2 Eb6:4 r:4 | ' +
    'Gb5:2 Bb5:2 Db6:2 Gb6:2 F6:1 Gb6:1 Ab6:2 Gb6:4 | Db6:4 Ab5:2 F5:2 Ab5:4 Db6:4 | Eb6:2 Db6:2 Bb5:2 G5:2 Eb5:4 G5:4 | Ab5:2 r:2 Ab5:2 r:2 C6:1 Bb5:1 Ab5:1 Gb5:1 F5:1 Eb5:1 D5:1 Eb5:1';
  const TOY_RUNS = 'r:16 | r:16 | r:16 | r:12 Db6:1 Eb6:1 F6:1 Gb6:1 | r:16 | r:16 | r:16 | r:12 Ab5:1 Bb5:1 C6:1 Db6:1 | ' +
    'r:16 | r:16 | r:16 | r:16 | r:16 | r:16 | r:16 | r:12 F5:1 Gb5:1 Ab5:1 Bb5:1 | r:16 | r:16 | r:16 | r:12 G6:1 F6:1 Eb6:1 Db6:1';
  SONGS.toybox = {
    id: 'toybox', title: 'Toy Parade', bpm: 160, bars: 24, key: ['Db', 'major'],
    chords: 'Db | Ab7 | Db | Gb | Db | Bbm | Eb7 Ab7 | Db | Gb | Db | Ab7 | Db | Gb | Gbm | Db/Ab Ab7 | Db | Bbm | F7 | Bbm | Eb7 | Gb | Db/Ab | Eb7 | Ab7',
    parts: [
      { v: 'kazoo', n: TOY_A, g: 0.7, rev: 0.15, dly: 0.08 },
      { v: 'toy', n: TOY_B, from: 9, g: 0.55, pan: 0.05, rev: 0.2, dly: 0.1 },
      { v: 'glock', n: TOY_B, from: 9, g: 0.16, pan: 0.3, rev: 0.25 },
      { v: 'kazoo', n: TOY_C, from: 17, g: 0.7, rev: 0.15, dly: 0.08 },
      { v: 'toy', n: TOY_C, from: 17, oct: 1, g: 0.18, pan: 0.3, rev: 0.2 },
      { v: 'xylo', n: TOY_RUNS, g: 0.32, pan: -0.3, rev: 0.15 },
      { v: 'xylo', arp: '1', rhythm: '....x.......x...', lo: 'F4', hi: 'F5', g: 0.2, pan: -0.25, rev: 0.1 },
      { v: 'xylo', arp: '2', rhythm: '....x.......x...', lo: 'F4', hi: 'F5', g: 0.2, pan: -0.25, rev: 0.1 },
      { v: 'bassSq', bass: '1...5...1...5...', lo: 'Ab1', g: 0.45, gate: 0.55 }
    ],
    drums: {
      kit: 'toy',
      pat: {
        A: { k: 'x.......x.......', s: '....x..o....x.oo', m: '..x...x...x...x.' },
        B: { k: 'x.......x.....x.', s: '....x..o....x.oo', m: '..x...x...x...x.', b: '.......x.......x' },
        F: { k: 'x.......x.......', s: 'x..ox..ox.xoXXXX', m: '..x...x.........', t: '........x.......', u: '..........x.....' }
      },
      order: 'AAAAAAAF BBBBBBBF AAAAAAAF', crash: [1, 9, 17]
    },
    mix: { rev: [0.72, 0.4, 0.4], dly: [0.5, 0.25, 3000, 0.35], lv: -13 }
  };

  /* Carnival — "Midway Mayhem" (B major, 172, a fast waltz): sunset at the
   * funfair. A steam calliope, with the band organ's glockenspiel, swirls up
   * the chord and turns about itself over a tuba oom and organ pah-pahs; a
   * horn harmony joins it the second time; the trio moves up to E for a big
   * brass tune with calliope whoops in the gaps, then a swirling sequence
   * slips through E minor (the carousel's sigh) and an F♯7 spins it back to
   * the top. Written in three-four (eight waltz bars to six grid bars). */
  const CARN_A = 'F#5:4 B5:4 D#6:4 | F#6:8 D#6:4 | E6:2 D#6:2 E6:2 F#6:2 G#6:4 | F#6:8 D#6:4 | ' +
    'D#6:2 C#6:2 B5:2 C#6:2 D#6:4 | E#6:2 D#6:2 C#6:2 B5:2 G#5:4 | A#5:2 C#6:2 E6:4 F#6:4 | E6:4 C#6:4 A#5:2 C#6:2';
  const CARN_A2 = 'F#5:4 B5:4 D#6:4 | F#6:8 D#6:4 | E6:2 D#6:2 E6:2 F#6:2 G#6:4 | F#6:8 D#6:4 | ' +
    'D#6:2 C#6:2 B5:2 C#6:2 D#6:4 | G#6:6 E6:2 B5:4 | A#5:2 C#6:2 E6:2 D#6:2 C#6:4 | B5:8 r:4';
  const CARN_A2H = 'D#5:4 F#5:4 B5:4 | D#6:8 B5:4 | B5:2 B5:2 B5:2 D#6:2 E6:4 | D#6:8 B5:4 | ' +
    'B5:2 A#5:2 G#5:2 A#5:2 B5:4 | E6:6 B5:2 G#5:4 | F#5:2 A#5:2 C#6:2 B5:2 A#5:4 | D#5:8 r:4';
  const CARN_TRIO = 'B4:4 E5:4 G#5:4 | B5:8 G#5:4 | A5:4 F#5:4 D#5:4 | B5:8 A5:4 | ' +
    'G#5:4 B5:4 E6:4 | E6:6 C#6:2 A5:4 | A#5:4 C#6:2 E6:2 F#6:4 | E6:4 C#6:4 A#5:4';
  const CARN_WHOOP = 'r:12 | r:4 E6:2 F#6:2 G#6:2 B6:2 | r:12 | r:4 D#6:2 E6:2 F#6:2 A6:2 | r:12 | r:12 | r:12 | r:4 C#6:2 E6:2 F#6:2 A#6:2';
  const CARN_C = 'D#6:2 E6:2 D#6:2 C#6:2 B5:4 | C#6:2 D#6:2 C#6:2 A#5:2 G5:4 | B5:2 C#6:2 B5:2 A#5:2 G#5:4 | A5:4 D#6:4 F#6:4 | ' +
    'G#6:6 F#6:2 E6:4 | G6:6 F#6:2 E6:4 | D#6:4 B5:4 F#5:4 | A#5:4 C#6:2 E6:2 A#5:2 C#6:2';
  SONGS.carnival = {
    id: 'carnival', title: 'Midway Mayhem', bpm: 172, meter: 12, bars: 24, key: ['B', 'major'],
    chords: rebar('B | B | E | B | G#m | C#7 | F#7 | F#7 | B | B | E | B | G#m | E | F#7 | B | ' +
      'E | E | B7 | B7 | E | A | F#7 | F#7 | B | D#7 | G#m | B7 | E | Em | B/F# | F#7', 12, true),
    parts: [
      { v: 'calliope', n: rebar(CARN_A + ' | ' + CARN_A2, 12), g: 0.46, rev: 0.2, dly: 0.08 },
      { v: 'glock', n: rebar(CARN_A + ' | ' + CARN_A2, 12), g: 0.13, pan: 0.3, rev: 0.25 },
      { v: 'brass', n: rebar(CARN_A2H, 12), from: 7, g: 0.4, pan: -0.3, rev: 0.22 },
      { v: 'brass', n: rebar(CARN_TRIO, 12), from: 13, g: 0.85, rev: 0.2, dly: 0.08 },
      { v: 'calliope', n: rebar(CARN_WHOOP, 12), from: 13, g: 0.3, pan: 0.2, rev: 0.25, dly: 0.15 },
      { v: 'calliope', n: rebar(CARN_C, 12), from: 19, g: 0.46, rev: 0.2, dly: 0.08 },
      { v: 'glock', n: rebar(CARN_C, 12), from: 19, g: 0.13, pan: 0.3, rev: 0.25 },
      { v: 'brass', n: rebar(CARN_C, 12), from: 19, oct: -1, g: 0.24, pan: -0.3, rev: 0.22 },
      { v: 'organStab', chord: '----x...x...', lo: 'D#4', hi: 'D#5', voices: 3, g: 0.2, pan: -0.2, gate: 0.6 },
      { v: 'brass', bass: '1...--------5...--------', lo: 'B1', g: 0.55, P: { cut: 700, cutEnv: 1.2, cutTau: 0.1, vib: 0, a: 0.012, d: 0.25, s: 0.6 } },
      { v: 'sub', bass: '1...--------5...--------', lo: 'B1', g: 0.3 }
    ],
    drums: {
      kit: 'pop',
      over: { k: ['kick', { f0: 120, f1: 50, tau: 0.15, click: 0.2 }, 0.8, 0, 0], r: ['ride', {}, 0.16, 0.3, 0.05] },
      pat: {
        W: { k: 'x...........', r: 'x...........', s: '....o...o...', h: '..x...x...x.' },
        T: { k: 'x...........', r: 'x...........', c: '....x...x...', h: 'x.x.x.x.x.x.', m: '....x...x...' },
        C: { k: 'x.......x...', r: 'x...........', s: '....x...x...', h: 'x.x.x.x.x.x.', m: '..x...x...x.' },
        F: { k: '....x.......x...', s: 'o...x.o.x.x.xxXX', h: 'x.x.x...........', t: '........x.......', u: '..........x.....' }
      },
      order: 'WWWWWF WWWWWF TTTTTF CCCCCF', crash: [1, 7, 13, 19]
    },
    mix: { rev: [0.8, 0.4, 0.45], dly: [1, 0.22, 2600, 0.3], lv: -13 }
  };

  /* Neon — "Neon Nights" (F♯ minor, 118): synthwave down a glowing city at
   * night. A big saw lead sings a syncopated tune over the i–VI–III–VII
   * turn, a galloping octave bass and a snare drenched in reverb; the chorus
   * lifts through B minor and A major 7 with the lead doubled an octave
   * below and syncopated supersaw stabs pumping under the kick; then a
   * glassy electric piano sings a slower verse while the arpeggio keeps
   * spinning, and C♯7 drops it back to the start. */
  const NEON_A = 'C#5:3 F#5:3 A5:4 G#5:2 A5:2 C#6:2 | C#6:6 A5:2 F#5:4 D5:4 | C#5:3 E5:3 A5:4 G#5:2 A5:2 B5:2 | B5:6 G#5:2 E5:4 r:4 | ' +
    'C#5:3 F#5:3 A5:4 C#6:2 F#6:4 | F#6:6 C#6:2 A5:4 F#5:4 | D6:3 C#6:3 B5:2 A5:2 F#5:2 D5:4 | C#5:4 F#5:4 E#5:4 G#5:4';
  const NEON_B = 'F#6:6 E6:2 D6:4 B5:4 | E6:6 D6:2 B5:4 G#5:4 | C#6:4 E6:4 G#6:6 E6:2 | F#6:8 C#6:4 A5:4 | ' +
    'F#6:6 E6:2 D6:4 B5:2 D6:2 | E6:4 G#6:4 B6:6 G#6:2 | G#6:4 E#6:4 C#6:4 B5:4 | E#6:6 C#6:2 G#5:4 E#5:4';
  const NEON_C = 'A5:4 C#6:4 F#6:8 | G#6:6 F#6:2 E6:4 B5:4 | D6:4 F#6:4 A6:8 | G#6:6 E#6:2 C#6:4 G#5:4';
  SONGS.neon = {
    id: 'neon', title: 'Neon Nights', bpm: 118, bars: 20, key: ['F#', 'minor'],
    chords: 'F#m | Dmaj7 | A | E | F#m | Dmaj7 | Bm7 | C#sus4 C# | Bm7 | E | Amaj7 | Dmaj7 | Bm7 | E | C#7 | C#7 | Dmaj7 | E | Bm7 | C#7',
    parts: [
      { v: 'sawLead', n: NEON_A + ' | ' + NEON_B, g: 0.52, rev: 0.25, dly: 0.28 },
      { v: 'lead', n: NEON_B, from: 9, oct: -1, g: 0.2, pan: -0.25, dly: 0.15 },
      { v: 'ep', n: NEON_C, from: 17, g: 0.32, rev: 0.3, dly: 0.3 },
      { v: 'bellSoft', n: NEON_C, from: 17, g: 0.12, pan: 0.3, rev: 0.35 },
      { v: 'sawLead', arp: '0 1 2 0 1 2 0 1 2 0 1 2 0 1 2 3', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'F#4', hi: 'F#5', g: 0.22, pan: 0.3, dly: 0.2, pump: 1,
        P: { d: 0.1, s: 0, cut: 1600, cutEnv: 2.5, cutTau: 0.06, vib: 0, det: 0.006 } },
      { v: 'pad', chord: 'x...............', lo: 'E3', hi: 'E5', voices: 4, bars: [1, 8], g: 0.15, rev: 0.3, pump: 1 },
      { v: 'supersaw', chord: 'x..x..x.x..x..x.', lo: 'E3', hi: 'E5', voices: 4, bars: [9, 16], g: 0.18, rev: 0.25, pump: 1, gate: 0.75 },
      { v: 'warmPad', chord: 'x...............', lo: 'E3', hi: 'E5', voices: 4, bars: [17, 20], g: 0.17, rev: 0.4, pump: 1 },
      { v: 'bass', bass: '1.181.181.181.18', lo: 'F#1', g: 0.45, P: { cut: 420, env: 3, envTau: 0.08 } }
    ],
    drums: {
      kit: 'electro',
      over: { s: ['snare', { tone: 185, snap: 0.2 }, 0.5, 0, 0.5] },
      pat: {
        A: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '......x.......x.' },
        B: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' },
        F: { k: 'x.......x.x.....', s: '....x.......x.xx', h: 'x.x.x.x.........', t: '........x..x....', u: '..........x..x..' },
        D: { k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.' },
        R: { k: 'x...x...x...x...', s: 'o.o.o.o.x.o.x.xX', h: 'x.x.x.x.x.x.x.x.' }
      },
      order: 'AAAAAAAF BBBBBBBF DDDR', crash: [1, 9, 17]
    },
    mix: { rev: [0.88, 0.3, 0.6], dly: [0.75, 0.4, 2600, 0.5], pump: [0.45, 0.14], lv: -13 }
  };

  /* Factory — "Gearworks" (G minor, 134): a clockwork factory running like
   * a watch. A whistled hook ticks out staccato over pizzicato and a plucked
   * ostinato that mesh like gears, the bass steps down a chromatic line (G,
   * F♯, F, E, E♭) and the wood blocks go tick-tock; the middle swaps to
   * brass stabs answered by the whistle swinging up and down like a
   * pendulum, an anvil clanking on the downbeat, and the end builds steam on
   * D7 to wind it back to the top. */
  const FACTORY_A = 'G5:2 r:2 D5:2 r:2 G5:2 A5:2 Bb5:2 r:2 | Bb5:2 r:2 D5:2 r:2 Bb5:2 A5:2 G5:2 r:2 | G5:2 r:2 D5:2 r:2 G5:2 A5:2 Bb5:2 D6:2 | C6:4 G5:2 E5:2 G5:4 r:4 | ' +
    'Bb5:2 r:2 G5:2 r:2 Bb5:2 C6:2 Eb6:2 r:2 | Eb6:2 D6:2 C6:2 G5:2 Eb5:4 r:4 | C6:2 A5:2 Eb5:2 G5:2 F#5:2 A5:2 C6:2 D6:2 | Bb5:4 G5:2 D5:2 G5:2 r:6';
  const FACTORY_STABS = 'D5:2 r:1 D5:1 F5:2 Bb5:2 r:8 | C5:2 r:1 C5:1 F5:2 A5:2 r:8 | Bb4:2 r:1 Bb4:1 D5:2 G5:2 r:8 | A4:2 r:1 A4:1 D5:2 F#5:2 r:8 | ' +
    'G5:2 r:1 G5:1 Bb5:2 Eb6:2 r:8 | F5:2 r:1 F5:1 Bb5:2 D6:2 r:8 | Eb5:2 r:1 Eb5:1 G5:2 C6:2 r:2 Bb5:2 r:4 | F#5:2 r:1 F#5:1 A5:2 D6:2 r:2 C6:2 r:2 A5:2';
  const FACTORY_SWING = 'r:8 F5:2 Bb5:2 D6:4 | r:8 C6:2 A5:2 F5:4 | r:8 G5:2 Bb5:2 D6:4 | r:8 C6:2 A5:2 F#5:2 D5:2 | ' +
    'r:8 Eb6:2 D6:2 Bb5:4 | r:8 F5:2 Bb5:2 D6:4 | r:8 Eb6:2 r:6 | r:16';
  const FACTORY_C = 'Bb5:6 G5:2 Eb5:4 G5:4 | C6:6 G5:2 Eb5:4 G5:4 | A5:4 C6:4 F#5:4 A5:4 | D6:4 C6:2 A5:2 F#5:2 D5:2 F#5:2 A5:2';
  const FACTORY_CH = 'G5:6 Eb5:2 Bb4:4 Eb5:4 | G5:6 Eb5:2 C5:4 Eb5:4 | F#5:4 A5:4 D5:4 F#5:4 | A5:4 A5:2 F#5:2 D5:2 A4:2 D5:2 F#5:2';
  SONGS.factory = {
    id: 'factory', title: 'Gearworks', bpm: 134, bars: 20, key: ['G', 'minor'],
    chords: 'Gm | Gm/F# | Gm/F | C/E | Eb | Cm | Am7b5 D7 | Gm | Bb | F/A | Gm | D7 | Eb | Bb/D | Cm7 | D7 | Eb | Cm | D7 | D7',
    parts: [
      { v: 'whistle', n: FACTORY_A, g: 0.58, rev: 0.18, dly: 0.12, P: { scoop: 0.05 } },
      { v: 'brass', n: FACTORY_STABS, from: 9, g: 0.85, rev: 0.18, gate: 0.7 },
      { v: 'whistle', n: FACTORY_SWING, from: 9, g: 0.42, pan: 0.15, rev: 0.2, dly: 0.15, P: { scoop: 0.05 } },
      { v: 'whistle', n: FACTORY_C, from: 17, g: 0.42, rev: 0.2, dly: 0.12, P: { scoop: 0.05 } },
      { v: 'brass', n: FACTORY_CH, from: 17, g: 0.32, pan: -0.3, rev: 0.2 },
      { v: 'pizz', arp: '0 2 1 2 0 2 1 2', rhythm: 'x.x.x.x.x.x.x.x.', lo: 'G3', hi: 'G4', g: 0.3, pan: -0.3, rev: 0.12 },
      { v: 'pluck', arp: '3 4 3 5 3 4 3 5', rhythm: '.x.x.x.x.x.x.x.x', lo: 'G4', hi: 'D6', g: 0.3, pan: 0.35, rev: 0.12, P: { t60: 0.45, bright: 0.75 } },
      { v: 'bassPluck', bass: '1.1.1.1.1.1.1.5.', lo: 'C2', g: 0.5, gate: 0.6 },
      { v: 'warmPad', chord: 'x...............', lo: 'G3', hi: 'D5', voices: 3, g: 0.09, rev: 0.3 }
    ],
    drums: {
      kit: 'clock',
      pat: {
        A: { k: 'x.....x...x.....', s: '....x.......x...', i: 'x.......x.......', j: '....x.......x...', h: '..x...x...x...x.' },
        B: { k: 'x.....x.x.x.....', s: '....x.......x...', i: 'x...x...x...x...', j: '..x...x...x...x.', h: 'xxxxxxxxxxxxxxxx', a: 'x...............' },
        C: { k: 'x.....x.x.x.....', s: '....x.......x...', i: 'x...x...x...x...', j: '..x...x...x...x.', h: 'x.x.x.x.x.x.x.x.', a: 'x...............' },
        F: { k: 'x.....x.x.......', s: '....x...x.x.xxxx', i: 'x.x.x.x.........', o: '............x...' }
      },
      order: 'AAAAAAAF BBBBBBBF CCCF', crash: [1, 9, 17]
    },
    mix: { rev: [0.7, 0.45, 0.35], dly: [0.5, 0.22, 2600, 0.3], lv: -13 }
  };

  /* Podium — "Victory Lap Fanfare" (C major, 108): a brass choir in three
   * parts (tune, a third below, an octave below), timpani on the roots and a
   * marching snare. It ends on G7 so the loop lands back on the opening call. */
  const PODIUM = 'G4:2 C5:2 E5:2 G5:10 | E5:3 F5:1 G5:4 C6:8 | A5:3 G5:1 F5:4 C6:6 A5:2 | G5:12 r:4 | ' +
    'E5:3 F5:1 E5:4 A5:6 G5:2 | F5:3 G5:1 A5:4 C6:6 A5:2 | D6:4 B5:4 G5:4 A5:2 B5:2 | D6:12 G4:2 B4:2 | ' +
    'C5:2 E5:2 G5:2 C6:10 | B5:3 C6:1 B5:4 G#5:6 E5:2 | A5:3 B5:1 C6:4 E6:8 | F6:4 E6:2 D6:2 C6:8 | ' +
    'D6:3 C6:1 A5:4 F5:6 A5:2 | G5:3 A5:1 B5:4 D6:8 | E6:4 D6:2 C6:2 G5:4 E5:4 | B5:4 A5:2 G5:2 F5:2 E5:2 D5:4';
  SONGS.podium = {
    id: 'podium', title: 'Victory Lap Fanfare', bpm: 108, bars: 16, key: ['C', 'major'],
    chords: 'C | C | F | C | Am | F | G | G | C | E7 | Am | F | Dm7 | G | C | G7',
    parts: [
      { v: 'brass', n: PODIUM, g: 0.5, rev: 0.3, dly: 0.06 },
      { v: 'brass', n: PODIUM, harm: -2, g: 0.28, pan: -0.3, rev: 0.3 },
      { v: 'brass', n: PODIUM, oct: -1, g: 0.2, pan: 0.3, rev: 0.25 },
      { v: 'pad', chord: 'x.......x.......', lo: 'G3', hi: 'E5', voices: 4, g: 0.18, rev: 0.35 },
      { v: 'glock', arp: '0 1 2 3', rhythm: 'x...x...x...x...', lo: 'C6', hi: 'C7', bars: [9, 16], g: 0.14, pan: 0.35, rev: 0.3 },
      { v: 'sub', bass: '1.......5.......', lo: 'C2', g: 0.6 }
    ],
    drums: {
      kit: 'march',
      pat: {
        A: { T: 'x...............', V: '........x.......', s: 'X..ox.o.X..ox.o.' },
        F: { T: 'x.......x.x.x.x.', V: '........x.x.x.x.', s: 'xxxxxxxxXXXXXXXX' }
      },
      order: 'AAAAAAAF AAAAAAAF', crash: [1, 9]
    },
    mix: { rev: [0.88, 0.35, 0.6], dly: [0.5, 0.2, 2400, 0.3], lv: -13.5 }
  };

  /* Results — "Checkered Grin" (G major, 126): a light electric-piano jingle
   * with a funky square bass and off-beat guitar; the second half answers the
   * hook with a glockenspiel doubling. */
  const RESULTS_A = 'D5:2 G5:2 B5:2 D6:4 B5:2 A5:2 G5:2 | E5:2 G5:2 B5:4 A5:2 G5:2 E5:4 | E5:2 G5:2 C6:2 E6:4 D6:2 C6:2 A5:2 | D6:6 C6:2 A5:4 F#5:4 | ' +
    'D5:2 G5:2 B5:2 D6:4 E6:2 D6:2 B5:2 | G5:2 B5:2 E6:4 D6:2 B5:2 G5:4 | C6:2 B5:2 A5:2 G5:2 F#5:2 A5:2 C6:2 D6:2 | B5:8 G5:4 r:4';
  const RESULTS_B = 'E6:4 D6:2 C6:2 G5:4 E5:4 | F#5:4 A5:2 D6:2 C6:4 A5:4 | B5:4 D6:2 F#6:2 D6:4 B5:4 | G5:4 B5:2 E6:2 D6:4 B5:4 | ' +
    'C6:4 B5:2 A5:2 E5:4 G5:4 | F#5:4 A5:2 C6:2 D6:4 C6:4 | B5:2 A5:2 G5:2 D5:2 G5:4 B5:4 | A5:2 C6:2 F#5:2 A5:2 D5:4 r:4';
  SONGS.results = {
    id: 'results', title: 'Checkered Grin', bpm: 126, bars: 16, key: ['G', 'major'],
    chords: 'G | Em | C | D | G | Em | Am7 D7 | G | C | D | Bm | Em | Am7 | D7 | G | D7',
    parts: [
      { v: 'ep', n: RESULTS_A + ' | ' + RESULTS_B, g: 0.5, rev: 0.2, dly: 0.12 },
      { v: 'glock', n: RESULTS_B, from: 9, g: 0.18, pan: 0.3 },
      { v: 'stab', chord: '..x...x...x...x.', lo: 'D4', hi: 'D5', voices: 3, g: 0.22, pan: -0.3 },
      { v: 'bassSq', bass: '1..1..5.1...5.8.', lo: 'G1', g: 0.55 }
    ],
    drums: {
      kit: 'acoustic',
      pat: {
        A: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        B: { k: 'x.....x.x.....x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', m: '..x...x...x...x.' },
        F: { k: 'x.....x.x.......', s: '....x.......xxxx', h: 'x.x.x.x.........', t: '........x.x.....' }
      },
      order: 'AAAAAAAF BBBBBBBF', crash: [1, 9]
    },
    mix: { rev: [0.75, 0.4, 0.4], dly: [0.75, 0.25, 2800, 0.35], lv: -13.5 }
  };

  /* Super Star — the invincibility jingle (E major, 168), four fast bars of
   * glittering broken chords; played by starStart(), not music(). */
  const STARJ = 'E6:1 B5:1 G#5:1 B5:1 E6:1 B5:1 G#5:1 B5:1 E6:2 F#6:2 G#6:4 | D6:1 A5:1 F#5:1 A5:1 D6:1 A5:1 F#5:1 A5:1 D6:2 E6:2 F#6:4 | ' +
    'C#6:1 A5:1 E5:1 A5:1 C#6:1 A5:1 E5:1 A5:1 C#6:2 D6:2 E6:4 | D#6:2 F#6:2 B6:4 A6:2 F#6:2 D#6:4';
  SONGS.star = {
    id: 'star', title: 'Super Star', hidden: true, bpm: 168, bars: 4, key: ['E', 'major'],
    chords: 'E | D | A | B',
    parts: [
      { v: 'chip', n: STARJ, g: 0.4, dly: 0.12 },
      { v: 'glock', n: STARJ, g: 0.22, pan: 0.3 },
      { v: 'bassSq', bass: '1.8.1.8.1.8.1.8.', lo: 'E2', g: 0.5 }
    ],
    drums: {
      kit: 'pop',
      pat: { A: { k: 'x...x...x...x...', c: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' } },
      order: 'AAAA'
    },
    mix: { rev: [0.6, 0.4, 0.25], dly: [0.5, 0.2, 3000, 0.3], lv: -12 }
  };

  /* ══════════════════════════════════════════════════════════════════════
   * 6. Rendering entry points, and the synth API (node's module.exports)
   * ══════════════════════════════════════════════════════════════════════ */

  const PAN_AMT = 0.55;       // pre-panned variants sit well to one side, never hard-panned
  const SONG_TAIL = 3.0;      // seconds of a song's opening repeated after its end
  const STAR_TAIL = 2.0;

  /** Items → which reveal chime they get, and which sound using them makes. */
  const ITEM_FLAVOR = {
    rocket: 'common', peel: 'common', ball: 'common', coins: 'common',
    rocket3: 'good', peel3: 'good', bee: 'good', bomb: 'good', horn: 'good',
    goldrocket: 'rare', star: 'rare', jet: 'rare', mega: 'rare', shrink: 'rare', zapper: 'rare'
  };
  const ITEM_USE = {
    rocket: 'use:rocket', rocket3: 'use:rocket', goldrocket: 'use:goldrocket', peel: 'peelDrop', peel3: 'peelDrop',
    ball: 'ballLaunch', bee: 'beeLaunch', zapper: 'zapperSiren', star: 'use:star', shrink: 'shrink', jet: 'use:jet',
    horn: 'horn', mega: 'use:mega', coins: 'use:coins', bomb: 'use:bomb'
  };

  /** Peak-normalise a one-shot to -1 dBFS (driving the limiter first where asked) and end on an exact zero. */
  function finishOneShot(chs, lim) {
    const pk = Math.max(1e-6, peakOf(chs));
    if (lim) { scale(chs, CEIL / pk * dbToGain(lim)); limit(chs, CEIL, false); }
    else scale(chs, CEIL / pk);
    const f = Math.round(0.004 * SR);
    for (let c = 0; c < chs.length; c++) { const x = chs[c]; for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f; }
  }

  /**
   * Render one effect. side '' = centre (a mono file), 'L' / 'R' = pre-panned
   * stereo. `vol` is the play volume that seats it at its designed level.
   */
  function renderSfx(name, side) {
    const d = SFX[name];
    if (!d) throw new Error('unknown sound "' + name + '"');
    const o = new Float32Array(Math.round(d.len * SR));
    nzSeed(hashStr(name));
    d.draw(o, prng(hashStr(name) ^ 0x2545f491));
    if (d.verb) verb(o, d.verb[0], d.verb[1]);
    highpass(o, 25, false);
    let chs = [o];
    finishOneShot(chs, d.lim);
    if (side) { chs = panStereo(o, side === 'L' ? -PAN_AMT : PAN_AMT); finishOneShot(chs, 0); }
    const loud = loudness(chs, 0.25);
    return { chs, sec: d.len, crit: d.crit, level: d.level, loud, vol: clamp(dbToGain(d.level - loud), 0, 1) };
  }

  /** Render one loop (engines, boost, drift, danger); the tail is added when the WAV is written. */
  function renderLoop(name, side) {
    const d = LOOPS[name];
    if (!d) throw new Error('unknown loop "' + name + '"');
    const o = new Float32Array(Math.round(d.sec * SR));
    nzSeed(hashStr(name));
    d.draw(o, prng(hashStr(name) ^ 0x7f4a7c15));
    highpass(o, 25, !d.simple);
    let chs = [o];
    scale(chs, CEIL / Math.max(1e-6, peakOf(chs)));
    if (side) { chs = panStereo(o, side === 'L' ? -PAN_AMT : PAN_AMT); scale(chs, CEIL / Math.max(1e-6, peakOf(chs))); }
    const loud = loudness(chs, d.simple ? 0.25 : 0);
    return { chs, sec: d.sec, tail: d.simple ? 0 : d.tail, simple: !!d.simple, level: d.level, loud, vol: clamp(dbToGain(d.level - loud), 0, 1) };
  }

  const synth = {
    SR, CEIL, PAN_AMT, SONG_TAIL, STAR_TAIL,
    sfxList: () => Object.keys(SFX).map((k) => ({ name: k, sec: SFX[k].len, level: SFX[k].level, crit: SFX[k].crit, pans: SFX[k].pans })),
    loopList: () => Object.keys(LOOPS).map((k) => ({ name: k, sec: LOOPS[k].sec, tail: LOOPS[k].simple ? 0 : LOOPS[k].tail, simple: !!LOOPS[k].simple, level: LOOPS[k].level })),
    songList: () => Object.keys(SONGS).map((k) => ({ id: k, title: SONGS[k].title, bpm: SONGS[k].bpm, bars: SONGS[k].bars,
      sec: SONGS[k].bars * 240 / SONGS[k].bpm, hidden: !!SONGS[k].hidden })),
    renderSfx, renderLoop, songGen,
    renderSong: (id) => drain(songGen(id)),
    wavBytes, wavGen, loudness, peakOf, drain,
    itemFlavor: ITEM_FLAVOR, itemUse: ITEM_USE
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = synth;
  if (typeof document === 'undefined') return;       // node: synthesis only

  /* ══════════════════════════════════════════════════════════════════════
   * 7. Browser layer — SafeAudio one-shots, gapless loops, ducking, the API
   * ══════════════════════════════════════════════════════════════════════ */

  const NK = root.NK = root.NK || {};
  const now = () => performance.now();
  const PREFIX = 'nk-';        // SafeAudio names: never a built-in name (select, hover …) — see DESIGN §11
  const SLICE_MS = 8;          // most idle time one render slice may take
  const MUSIC_VOL = 0.25;      // songs are mastered to about -13 dB; this seats them under the effects
  const STAR_VOL = 0.32;
  const DUCK_MUSIC = 0.25;     // while text-to-speech is talking
  const DUCK_SFX = 0.5;
  const MAX_SONGS = 4;         // rendered songs kept (about 3.7 MB each); least recently used is dropped

  let inited = false, sfxOn = true, musicOn = true, hidden = false, gestureHooked = false;
  let duckM = 1, duckS = 1, lastStep = 0;
  const sounds = new Map();      // one-shot key ('coin:3', 'bump@L') → { vol, crit, sec, url }
  const loopAssets = new Map();  // loop key ('engine:kart', 'drift@R', 'star') → { url, sec, tail, simple, vol }
  const songAssets = new Map();  // song id → { url, sec, tail, kb, used }
  const warned = new Set();
  const perf = { initAt: 0, readyAt: 0, sfxMs: 0, loopMs: 0, songs: {}, slices: 0, maxSliceMs: 0, errors: 0 };

  function warnOnce(msg) { if (!warned.has(msg)) { warned.add(msg); console.warn('[NK.audio] ' + msg); } }

  /* ── Idle-slice render queue ─────────────────────────────────────────────
   * Every render is a generator. Idle callbacks advance the most urgent job
   * for at most SLICE_MS, so boot and the race intro never stall; menu
   * sounds come first, then what a race needs at its start, then the rest.
   */
  const jobs = [];
  let coreLeft = 0, scheduled = false;

  function addJob(key, pri, core, make, done) {
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      if (j.key === key) { if (pri > j.pri) j.pri = pri; if (done) j.done.push(done); schedule(); return j; }
    }
    const j = { key, pri, core, make, gen: null, done: done ? [done] : [], cpu: 0 };
    jobs.push(j);
    if (core) coreLeft++;
    schedule();
    return j;
  }
  function removeJob(j) {
    const i = jobs.indexOf(j);
    if (i >= 0) jobs.splice(i, 1);
    if (j.core && --coreLeft === 0 && !perf.readyAt) perf.readyAt = now();
  }
  function stepJob(j) {
    const t = now();
    let r;
    try {
      if (!j.gen) j.gen = j.make();
      r = j.gen.next();
    } catch (e) {
      console.warn('[NK.audio] could not render ' + j.key + ':', e);
      perf.errors++;
      removeJob(j);
      return;
    }
    j.cpu += now() - t;
    if (r.done) {
      removeJob(j);
      for (let i = 0; i < j.done.length; i++) j.done[i](r.value, j);
    }
  }
  function pickJob() {
    let b = jobs[0];
    for (let i = 1; i < jobs.length; i++) if (jobs[i].pri > b.pri) b = jobs[i];
    return b;
  }
  function schedule() {
    if (scheduled || !jobs.length) return;
    scheduled = true;
    const run = (deadline) => {
      scheduled = false;
      if (!jobs.length) return;
      const t = now();
      const idle = deadline && !deadline.didTimeout && typeof deadline.timeRemaining === 'function' ? deadline.timeRemaining() : 0;
      const end = t + clamp(idle - 1, 3, SLICE_MS);
      do { stepJob(pickJob()); } while (jobs.length && now() < end);
      const took = now() - t;
      perf.slices++;
      if (took > perf.maxSliceMs) perf.maxSliceMs = took;
      schedule();
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 50 });
    else setTimeout(run, 0);
  }
  /** Finish one job immediately: a sound asked for before its turn (about a millisecond of work). */
  function finishNow(key) {
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      if (j.key === key) { while (jobs.indexOf(j) >= 0) stepJob(j); return; }
    }
  }

  function blobUrl(bytes) { return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })); }
  function splitKey(key) { const at = key.indexOf('@'); return at < 0 ? [key, ''] : [key.slice(0, at), key.slice(at + 1)]; }

  function queueSfx(key, pri) {
    if (sounds.has(key)) return;
    addJob(key, pri, true, function* () {
      const k = splitKey(key), r = renderSfx(k[0], k[1]);
      yield;
      return { url: blobUrl(wavBytes(r.chs, 0)), vol: r.vol, crit: r.crit, sec: r.sec };
    }, (a, j) => {
      perf.sfxMs += j.cpu;
      sounds.set(key, a);
      preloadOneShot(PREFIX + key, a.url);
    });
  }

  function queueLoop(key, pri, core, done) {
    const have = loopAssets.get(key);
    if (have) { if (done) done(have); return; }
    addJob(key, pri, core, function* () {
      const k = splitKey(key);
      if (k[0] === 'star') {
        const r = yield* songGen('star');
        const bytes = yield* wavGen(r.chs, Math.round(STAR_TAIL * SR));
        return { url: blobUrl(bytes), sec: r.sec, tail: STAR_TAIL, simple: false, vol: STAR_VOL };
      }
      const r = renderLoop(k[0], k[1]);
      yield;
      return { url: blobUrl(wavBytes(r.chs, Math.round(r.tail * SR))), sec: r.sec, tail: r.tail, simple: r.simple, vol: r.vol };
    }, (a, j) => {
      perf.loopMs += j.cpu;
      loopAssets.set(key, a);
      if (done) done(a);
    });
  }

  function queueSong(id, pri, done) {
    const have = songAssets.get(id);
    if (have) { have.used = now(); if (done) done(have); return; }
    const t0 = now();
    addJob('song:' + id, pri, false, function* () {
      const r = yield* songGen(id);
      const bytes = yield* wavGen(r.chs, Math.round(SONG_TAIL * SR));
      return { url: blobUrl(bytes), sec: r.sec, tail: SONG_TAIL, kb: Math.round(bytes.byteLength / 1024) };
    }, (a, j) => {
      a.used = now();
      songAssets.set(id, a);
      perf.songs[id] = { cpuMs: Math.round(j.cpu), wallMs: Math.round(now() - t0), kb: a.kb, sec: +a.sec.toFixed(2) };
      evictSongs();
      if (done) done(a);
    });
  }
  function evictSongs() {
    while (songAssets.size > MAX_SONGS) {
      let oldId = null, oldUsed = Infinity;
      songAssets.forEach((a, id) => { if (!songInUse(id) && a.used < oldUsed) { oldUsed = a.used; oldId = id; } });
      if (oldId === null) return;
      try { URL.revokeObjectURL(songAssets.get(oldId).url); } catch (e) { /* ignore */ }
      songAssets.delete(oldId);
    }
  }
  function songInUse(id) {
    if (music.cur && music.cur.id === id) return true;
    for (let i = 0; i < music.old.length; i++) if (music.old[i].id === id) return true;
    return false;
  }

  /* ── One-shots through SafeAudio (3-deep pools), with a tiny fallback ─── */
  const fallbackPools = new Map();
  function preloadOneShot(name, url) {
    const S = window.SafeAudio;
    if (S && typeof S.preload === 'function') { S.preload(name, url); return; }
    const els = [];
    for (let i = 0; i < 3; i++) { const a = new Audio(); a.preload = 'auto'; a.src = url; els.push(a); }
    fallbackPools.set(name, { els, i: 0 });
  }
  function playOneShot(name, v) {
    const S = window.SafeAudio;
    if (S && typeof S.play === 'function') { S.play(name, v); return; }
    const p = fallbackPools.get(name);
    if (!p) return;
    const a = p.els[p.i];
    p.i = (p.i + 1) % p.els.length;
    try { a.volume = v; a.currentTime = 0; const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* ignore */ }
  }
  function stopOneShots() {
    const S = window.SafeAudio;
    sounds.forEach((s, key) => { try { if (S && S.stop) S.stop(PREFIX + key); } catch (e) { /* ignore */ } });
    fallbackPools.forEach((p) => p.els.forEach((a) => { try { a.pause(); } catch (e) { /* ignore */ } }));
  }

  /** Play a catalogue sound. pan -1 / +1 picks a pre-panned variant when one exists. */
  function play(name, opts) {
    if (!inited) init();
    const d = SFX[name];
    if (!d) { warnOnce('unknown sound "' + name + '"'); return false; }
    if (!sfxOn || hidden) return false;
    const o = opts && typeof opts === 'object' ? opts : null;
    let key = name;
    if (o && o.pan && d.pans) {
      const side = o.pan < 0 ? 'L' : 'R';
      if (d.pans.indexOf(side) >= 0) key = name + '@' + side;
    }
    let s = sounds.get(key);
    if (!s) {
      queueSfx(key, 1000);
      finishNow(key);
      s = sounds.get(key);
      if (!s) return false;
    }
    const v = clamp(s.vol * (o && o.vol !== undefined ? +o.vol : 1) * (s.crit ? 1 : duckS), 0, 1);
    playOneShot(PREFIX + key, v);
    return true;
  }

  /* ── Gapless loops without the Web Audio API ─────────────────────────────
   * <audio loop> re-seeks at the end of the file and Chromium leaves about
   * 90 ms of silence every time (measured in Electron 40): a stutter on every
   * pass of an engine or a song. So a loop file holds the loop plus a copy of
   * its opening seconds (the tail), and two elements take turns. While the
   * audible one (A) plays into its tail, the other (B) starts silently at the
   * matching point, is nudged into alignment by running a touch fast or slow
   * (two media clocks agree to about a millisecond, and the offset is
   * measured every frame), is crossfaded in, and A rewinds for its next turn.
   * A swap that cannot align in time crossfades anyway; if nothing drives the
   * swaps at all, A carries on from the matching point when it ends.
   */
  function makeEl(url, keepPitch, loop) {
    const a = new Audio();
    a.preload = 'auto';
    a.loop = !!loop;
    a.preservesPitch = !!keepPitch;
    a.volume = 0;
    a.src = url;
    return a;
  }

  function LoopPlayer(url, sec, tail, opt) {
    this.sec = sec; this.tail = tail;
    this.tol = opt.tol || 0.002; this.xf = opt.xf || 0.2;
    this.els = [makeEl(url, opt.preservePitch, !tail), makeEl(url, opt.preservePitch, !tail)];
    this.cur = 0; this.state = 'idle';            // idle | run | start | align | fade | paused
    this.rate = 1; this.vol = 0; this.base = 1;
    this.vSet = [-1, -1]; this.rSet = [-1, -1];
    this.lag = [0.03, 0.03];                      // learned start latency of each element, seconds
    this.hist = new Float64Array(5); this.sorted = new Float64Array(5); this.hn = 0;
    this.ok = 0; this.fadeT = 0; this.seek = 0; this.learned = false;
    this.blocked = false; this.idleFor = 0;
    this.log = { swaps: 0, late: 0, maxOffMs: 0, lastOffMs: 0 };
    const self = this;
    this.els.forEach((el) => el.addEventListener('ended', () => self.onEnded(el)));
  }
  LoopPlayer.prototype.kick = function (el) {
    const self = this;
    try {
      const p = el.play();
      if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotAllowedError') self.blocked = true; });
    } catch (e) { /* not loaded yet; resume() retries */ }
  };
  LoopPlayer.prototype.play = function () {
    this.abortSwap();
    const A = this.els[this.cur];
    try { A.currentTime = 0; } catch (e) { /* ignore */ }
    this.state = 'run';
    this.setRateOn(this.cur, this.rate);
    this.applyVol();
    this.kick(A);
  };
  LoopPlayer.prototype.pause = function () {
    if (this.state === 'idle' || this.state === 'paused') return;
    this.abortSwap();
    this.els[this.cur].pause();
    this.state = 'paused';
  };
  LoopPlayer.prototype.resume = function () {
    if (this.state !== 'paused') return;
    this.state = 'run';
    this.applyVol();
    this.kick(this.els[this.cur]);
  };
  LoopPlayer.prototype.stop = function () {
    this.abortSwap();
    const A = this.els[this.cur];
    A.pause();
    try { A.currentTime = 0; } catch (e) { /* ignore */ }
    this.state = 'idle';
  };
  LoopPlayer.prototype.dispose = function () {
    this.stop();
    this.els.forEach((el) => { try { el.removeAttribute('src'); el.load(); } catch (e) { /* ignore */ } });
  };
  LoopPlayer.prototype.abortSwap = function () {
    if (this.state !== 'start' && this.state !== 'align' && this.state !== 'fade') return;
    const B = this.els[1 - this.cur];
    B.pause();
    try { B.currentTime = 0; } catch (e) { /* ignore */ }
    this.state = 'run';
    this.fadeT = 0;
    this.applyVol();
  };
  LoopPlayer.prototype.setVolume = function (v) { this.vol = v; this.applyVol(); };
  LoopPlayer.prototype.applyVol = function () {
    const f = this.state === 'fade' ? this.fadeT : 0;
    this.setVolOn(this.cur, this.vol * (1 - f));
    this.setVolOn(1 - this.cur, this.vol * f);
  };
  LoopPlayer.prototype.setVolOn = function (i, v) {
    v = clamp(v, 0, 1);
    if (Math.abs(this.vSet[i] - v) > 0.002 || (v === 0 && this.vSet[i] !== 0)) { this.els[i].volume = v; this.vSet[i] = v; }
  };
  LoopPlayer.prototype.setRate = function (r) {
    this.rate = r;
    this.setRateOn(this.cur, r);
    if (this.state === 'start') this.setRateOn(1 - this.cur, r);   // align / fade correct B themselves
  };
  LoopPlayer.prototype.setRateOn = function (i, r) {
    if (Math.abs(this.rSet[i] - r) > 0.0008) { this.els[i].playbackRate = r; this.rSet[i] = r; }
  };
  LoopPlayer.prototype.step = function (dt) {
    const st = this.state;
    if (!this.tail || st === 'idle' || st === 'paused') return;
    const A = this.els[this.cur], B = this.els[1 - this.cur], sec = this.sec, a = A.currentTime;
    if (st === 'run') {
      if (!A.paused && a >= sec + 0.03 && a < sec + this.tail - 0.3 * this.rate) this.startSwap(B, a);
      return;
    }
    const late = a > sec + this.tail - 0.35 * this.rate;
    if (st === 'start') {
      if (!B.paused && B.currentTime > this.seek + 0.002) { this.state = 'align'; this.hn = 0; this.ok = 0; }
      else if (late) this.abortSwap();                  // B never got going: A carries on
      return;
    }
    // align / fade: how far B trails A's position one loop earlier
    this.pushOff(a - sec - B.currentTime);
    if (this.hn < 3) return;
    const off = this.medianOff();
    if (!this.learned) { this.learned = true; this.lag[1 - this.cur] += off / this.rate; }
    if (st === 'align') {
      this.setRateOn(1 - this.cur, this.rate * (1 + clamp(off * 6 / this.rate, -0.08, 0.08)));
      this.ok = Math.abs(off) < this.tol ? this.ok + 1 : 0;
      if (this.ok >= 3 || late) {
        if (this.ok < 3) this.log.late++;
        const ms = +(Math.abs(off) * 1000).toFixed(2);
        this.log.lastOffMs = ms;
        if (ms > this.log.maxOffMs) this.log.maxOffMs = ms;
        this.state = 'fade';
        this.fadeT = 0;
      }
    } else {
      this.setRateOn(1 - this.cur, this.rate * (1 + clamp(off * 4 / this.rate, -0.03, 0.03)));
      this.fadeT = Math.min(1, this.fadeT + dt / this.xf);
      this.applyVol();
      if (this.fadeT >= 1) this.endSwap();
    }
  };
  LoopPlayer.prototype.startSwap = function (B, a) {
    const other = 1 - this.cur;
    this.seek = Math.max(0, a - this.sec + this.lag[other] * this.rate);
    try { B.currentTime = this.seek; } catch (e) { return; }
    this.setVolOn(other, 0);
    this.setRateOn(other, this.rate);
    this.hn = 0; this.ok = 0; this.learned = false; this.fadeT = 0;
    this.state = 'start';
    this.kick(B);
  };
  LoopPlayer.prototype.endSwap = function () {
    const A = this.els[this.cur];
    A.pause();
    try { A.currentTime = 0; } catch (e) { /* ignore */ }
    this.cur = 1 - this.cur;
    this.state = 'run';
    this.fadeT = 0;
    this.setRateOn(this.cur, this.rate);
    this.applyVol();
    this.log.swaps++;
  };
  LoopPlayer.prototype.onEnded = function (el) {
    if (el !== this.els[this.cur] || this.state === 'idle' || this.state === 'paused') return;
    if ((this.state === 'align' || this.state === 'fade') && !this.els[1 - this.cur].paused) { this.endSwap(); return; }
    // Nothing drove the swap: continue from the matching point of the loop.
    this.abortSwap();
    try { el.currentTime = this.tail % this.sec; } catch (e) { /* ignore */ }
    this.kick(el);
  };
  LoopPlayer.prototype.pushOff = function (d) {
    if (this.hn < 5) { this.hist[this.hn++] = d; return; }
    for (let i = 0; i < 4; i++) this.hist[i] = this.hist[i + 1];
    this.hist[4] = d;
  };
  LoopPlayer.prototype.medianOff = function () {
    const n = this.hn, s = this.sorted;
    for (let i = 0; i < n; i++) {
      const v = this.hist[i];
      let j = i - 1;
      while (j >= 0 && s[j] > v) { s[j + 1] = s[j]; j--; }
      s[j + 1] = v;
    }
    return s[n >> 1];
  };

  /* ── Music ───────────────────────────────────────────────────────────── */
  const music = { want: null, cur: null, old: [], tempo: 1 };   // cur/old: { id, lp, fade }

  function musicPlay(id) {
    if (!inited) init();
    const song = SONGS[id];
    if (!song || song.hidden) { warnOnce('unknown song "' + id + '"'); return; }
    if (music.want === id) return;
    music.want = id;
    music.tempo = 1;
    if (music.cur) { music.old.push(music.cur); music.cur = null; }
    if (musicOn) startWanted();
  }
  function startWanted() {
    const id = music.want;
    if (!id || music.cur) return;
    queueSong(id, 90, (a) => {
      if (music.want !== id || music.cur || !musicOn) return;
      const lp = new LoopPlayer(a.url, a.sec, a.tail, { preservePitch: true, tol: 0.0015, xf: 0.2 });
      lp.setRate(music.tempo);
      music.cur = { id, lp, fade: 0 };
      if (!hidden) lp.play();
    });
  }
  function musicStop() {
    music.want = null;
    if (music.cur) { music.old.push(music.cur); music.cur = null; }
  }
  function musicTempo(mult) {
    music.tempo = clamp(+mult || 1, 0.5, 2);
    if (music.cur) music.cur.lp.setRate(music.tempo);
  }
  function setMusic(on) {
    musicOn = !!on;
    if (musicOn) { startWanted(); return; }
    if (music.cur) { music.cur.lp.dispose(); music.cur = null; }
    for (let i = 0; i < music.old.length; i++) music.old[i].lp.dispose();
    music.old.length = 0;
  }
  function stepMusic(dt) {
    // Speech ducks the music; the Super Star jingle nearly replaces it.
    const mv = MUSIC_VOL * duckM * (1 - 0.72 * star.fade);
    if (music.cur) {
      const c = music.cur;
      c.fade = Math.min(1, c.fade + dt / 0.8);
      c.lp.setVolume(mv * c.fade);
      c.lp.step(dt);
    }
    for (let i = music.old.length - 1; i >= 0; i--) {
      const s = music.old[i];
      s.fade -= dt / 0.9;
      if (s.fade <= 0) { s.lp.dispose(); music.old.splice(i, 1); }
      else { s.lp.setVolume(mv * s.fade); s.lp.step(dt); }
    }
  }

  /* ── Engines: one per human ──────────────────────────────────────────────
   * Three layers per kart, all gapless loops: the engine hum (its
   * playbackRate follows speed, pitch not preserved), a boost roar and a
   * drift squeal that fade in on demand. In two-player races each engine
   * uses stereo renders panned toward its player's half of the screen.
   */
  const VEHICLES = { kart: 1, bike: 1, buggy: 1, hover: 1 };
  function Engine(idx) {
    this.idx = idx; this.want = false; this.vehicle = 'kart'; this.side = '';
    this.layers = null; this.pending = false;
    this.speed = 0; this.boosting = false; this.drifting = 0;
    this.sm = 0; this.bm = 0; this.dm = 0; this.level = 0;
  }
  Engine.prototype.start = function (vehicleId, pan) {
    if (!inited) init();
    const v = VEHICLES[vehicleId] ? vehicleId : 'kart', side = pan < 0 ? '@L' : pan > 0 ? '@R' : '';
    if (this.layers && (v !== this.vehicle || side !== this.side)) this.release();
    this.vehicle = v; this.side = side; this.want = true;
    this.speed = 0; this.sm = 0; this.bm = 0; this.dm = 0; this.boosting = false; this.drifting = 0;
    this.build();
    return this;
  };
  Engine.prototype.update = function (speedNorm, boosting, drifting) {
    this.speed = clamp(+speedNorm || 0, 0, 1);
    this.boosting = !!boosting;
    this.drifting = drifting === true ? 1 : clamp(+drifting || 0, 0, 3);
  };
  Engine.prototype.stop = function () { this.want = false; };
  Engine.prototype.build = function () {
    if (this.layers || this.pending || !this.want || !sfxOn || hidden) return;
    const keys = ['engine:' + this.vehicle + this.side, 'boost' + this.side, 'drift' + this.side];
    let left = 0;
    for (let i = 0; i < keys.length; i++) if (!loopAssets.has(keys[i])) left++;
    if (left) {
      this.pending = true;
      const self = this;
      keys.forEach((k) => { if (!loopAssets.has(k)) queueLoop(k, 95, false, () => { if (--left === 0) { self.pending = false; self.build(); } }); });
      return;
    }
    const mk = (k) => {
      const a = loopAssets.get(k), lp = new LoopPlayer(a.url, a.sec, a.tail, { preservePitch: false, tol: 0.004, xf: 0.15 });
      lp.base = a.vol;
      return lp;
    };
    this.layers = { hum: mk(keys[0]), boost: mk(keys[1]), drift: mk(keys[2]) };
    this.level = 0;
    this.layers.hum.setVolume(0);
    this.layers.hum.play();
  };
  Engine.prototype.release = function () {
    if (!this.layers) return;
    this.layers.hum.dispose(); this.layers.boost.dispose(); this.layers.drift.dispose();
    this.layers = null;
    this.level = 0;
  };
  Engine.prototype.step = function (dt) {
    const L = this.layers, on = this.want && sfxOn && !hidden;
    if (!L) { if (on) this.build(); return; }
    this.level = on ? Math.min(1, this.level + dt / 0.25) : this.level - dt / 0.18;
    if (this.level <= 0) { this.release(); return; }
    this.sm += (this.speed - this.sm) * (1 - Math.exp(-dt * 10));
    const bt = this.boosting ? 1 : 0, dg = this.drifting ? 1 : 0;
    this.bm += (bt - this.bm) * (1 - Math.exp(-dt * (bt > this.bm ? 14 : 3)));
    this.dm += (dg - this.dm) * (1 - Math.exp(-dt * (dg > this.dm ? 12 : 5)));
    const g = this.level * duckS;
    L.hum.setRate(0.7 + 1.2 * this.sm + 0.08 * this.bm);
    L.hum.setVolume(L.hum.base * g * (0.55 + 0.45 * this.sm));
    L.hum.step(dt);
    layer(L.boost, L.boost.base * g * this.bm, 0.85 + 0.35 * this.sm, dt);
    // The squeal climbs a little with each drift charge level.
    layer(L.drift, L.drift.base * g * this.dm, 0.94 + 0.06 * Math.max(1, this.drifting), dt);
  };
  /** A boost or drift layer only plays while it can be heard, and rests after a second of silence. */
  function layer(lp, v, rate, dt) {
    lp.setRate(rate);
    lp.setVolume(v);
    if (v > 0.002) { lp.idleFor = 0; if (lp.state === 'idle') lp.play(); }
    else if (lp.state !== 'idle') { lp.idleFor += dt; if (lp.idleFor > 1) lp.stop(); }
    lp.step(dt);
  }
  const engines = [new Engine(0), new Engine(1)];

  /* ── Super Star jingle and danger pulses ─────────────────────────────── */
  const star = { on: [false, false], lp: null, fade: 0, loading: false };
  function starSet(player, on) {
    if (!inited) init();
    star.on[player === 1 ? 1 : 0] = !!on;
    if (!on || star.lp || star.loading) return;
    star.loading = true;
    queueLoop('star', 95, true, (a) => {
      star.loading = false;
      if (!star.lp) star.lp = new LoopPlayer(a.url, a.sec, a.tail, { preservePitch: true, tol: 0.002, xf: 0.15 });
      star.lp.base = a.vol;
    });
  }
  function stepStar(dt) {
    const want = sfxOn && !hidden && (star.on[0] || star.on[1]);
    star.fade = want ? Math.min(1, star.fade + dt / 0.12) : Math.max(0, star.fade - dt / 0.35);
    const lp = star.lp;
    if (!lp) return;
    if (star.fade > 0 && lp.state === 'idle') lp.play();
    lp.setVolume(lp.base * star.fade * duckS);
    if (star.fade <= 0 && lp.state !== 'idle') lp.stop();
    lp.step(dt);
  }

  const danger = [{ on: false, el: null, vol: 1 }, { on: false, el: null, vol: 1 }];
  function dangerSet(player, on) {
    if (!inited) init();
    const p = player === 1 ? 1 : 0, d = danger[p];
    if (d.on === !!on) return;
    d.on = !!on;
    if (!on) { if (d.el) d.el.pause(); return; }
    if (d.el) { startDanger(d); return; }
    queueLoop('danger:' + p, 95, true, (a) => {
      if (!d.el) { d.el = makeEl(a.url, false, true); d.vol = a.vol; }
      if (d.on) startDanger(d);
    });
  }
  function startDanger(d) {
    if (!sfxOn || hidden) return;
    d.el.volume = clamp(d.vol, 0, 1);                 // guidance: never ducked
    try { d.el.currentTime = 0; const pr = d.el.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* ignore */ }
  }

  /* ── The frame step: ducking, fades, loop swaps ───────────────────────── */
  function step(t) {
    const dt = lastStep ? Math.min(0.1, (t - lastStep) / 1000) : 1 / 60;
    lastStep = t;
    const ss = window.speechSynthesis, speaking = !!(ss && ss.speaking);
    const tm = speaking ? DUCK_MUSIC : 1, ts = speaking ? DUCK_SFX : 1;
    // Duck fast when a voice starts, come back gently once it stops.
    duckM += (tm - duckM) * (1 - Math.exp(-dt * (tm < duckM ? 10 : 1.6)));
    duckS += (ts - duckS) * (1 - Math.exp(-dt * (ts < duckS ? 10 : 1.6)));
    stepStar(dt);
    stepMusic(dt);
    engines[0].step(dt);
    engines[1].step(dt);
  }
  /** Called every frame by the game. Uses the wall clock, so a paused race (dt = 0) still fades. */
  function tick() {
    if (!inited) return;
    const t = now();
    if (t - lastStep >= 4) step(t);
  }

  function onVisibility() {
    const h = document.visibilityState === 'hidden';
    if (h === hidden) return;
    hidden = h;
    if (hidden) {
      if (music.cur) music.cur.lp.pause();
      for (let i = 0; i < music.old.length; i++) music.old[i].lp.dispose();
      music.old.length = 0;
      engines[0].release(); engines[1].release();
      star.fade = 0;
      if (star.lp) star.lp.stop();
      danger.forEach((d) => { if (d.el) d.el.pause(); });
      stopOneShots();
    } else {
      lastStep = 0;
      if (music.cur && musicOn) { if (music.cur.lp.state === 'paused') music.cur.lp.resume(); else if (music.cur.lp.state === 'idle') music.cur.lp.play(); }
      danger.forEach((d) => { if (d.on && d.el) startDanger(d); });
    }
  }

  function resume() {
    if (!inited) init();
    const retry = (lp) => {
      if (lp && lp.blocked && lp.state !== 'idle' && lp.state !== 'paused') { lp.blocked = false; lp.kick(lp.els[lp.cur]); }
    };
    if (music.cur) retry(music.cur.lp);
    engines.forEach((e) => { if (e.layers) { retry(e.layers.hum); retry(e.layers.boost); retry(e.layers.drift); } });
    retry(star.lp);
    danger.forEach((d) => { if (d.on && d.el && d.el.paused) startDanger(d); });
  }
  /* The first real gesture also retries (browsers that block autoplay until
   * one); passive, never stops propagation, removed after it fires. */
  function onGesture() {
    resume();
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.removeEventListener(ev, onGesture, true));
  }

  function setSfx(on) {
    sfxOn = !!on;
    if (!sfxOn) { stopOneShots(); danger.forEach((d) => { if (d.el) d.el.pause(); }); }
    else danger.forEach((d) => { if (d.on && d.el) startDanger(d); });
    // Engines and the star fade out (or rebuild) in step().
  }

  function stopAll() {
    musicStop();
    for (let i = 0; i < music.old.length; i++) music.old[i].lp.dispose();
    music.old.length = 0;
    engines.forEach((e) => { e.want = false; e.release(); });
    star.on[0] = star.on[1] = false;
    star.fade = 0;
    if (star.lp) star.lp.stop();
    danger.forEach((d) => { d.on = false; if (d.el) d.el.pause(); });
    stopOneShots();
  }

  function readSettings() {
    try {
      const s = NK.util && NK.util.load ? NK.util.load('settings', null) : JSON.parse(localStorage.getItem('nk-settings') || 'null');
      if (s && typeof s === 'object') { if (s.sfx === false) sfxOn = false; if (s.music === false) musicOn = false; }
    } catch (e) { /* defaults: both on */ }
  }

  function init() {
    if (inited) return api;
    inited = true;
    perf.initAt = now();
    readSettings();
    const names = Object.keys(SFX);
    const FIRST = { menuMove: 1, menuSelect: 1, menuBlocked: 1 };
    const EARLY = { countdown: 1, go: 1, boxSmash: 1, 'rouletteTick:0': 1, 'rouletteTick:1': 1, 'scanMatch:0': 1, 'scanMatch:1': 1 };
    names.forEach((n) => queueSfx(n, FIRST[n] ? 100 : (EARLY[n] || /^(cue|pauseTick):/.test(n)) ? 70 : 50));
    ['engine:kart', 'engine:bike', 'engine:buggy', 'engine:hover', 'boost', 'drift', 'danger:0', 'danger:1'].forEach((k) => queueLoop(k, 60, true));
    queueLoop('star', 30, true);
    // Pre-panned variants last; a two-player race asks for any it reaches first.
    names.forEach((n) => {
      const p = SFX[n].pans;
      if (p.indexOf('L') >= 0) queueSfx(n + '@L', 20);
      if (p.indexOf('R') >= 0) queueSfx(n + '@R', 20);
    });
    document.addEventListener('visibilitychange', onVisibility);
    if (!gestureHooked) {
      gestureHooked = true;
      ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, onGesture, { capture: true, passive: true }));
    }
    // A backstop pump: fades and loop swaps keep running even if nothing calls tick().
    setInterval(() => { if (now() - lastStep > 40) step(now()); }, 50);
    return api;
  }

  function ready() { return inited && coreLeft === 0; }

  function lpInfo(lp) {
    return lp ? { state: lp.state, swaps: lp.log.swaps, late: lp.log.late, maxOffMs: lp.log.maxOffMs, lastOffMs: lp.log.lastOffMs,
      rate: +lp.rate.toFixed(3), vol: +lp.vol.toFixed(3) } : null;
  }
  function stats() {
    return {
      ready: ready(), bootMs: perf.readyAt ? Math.round(perf.readyAt - perf.initAt) : null,
      oneShots: sounds.size, loops: loopAssets.size, songsCached: Array.from(songAssets.keys()),
      cpuMs: { sfx: Math.round(perf.sfxMs), loops: Math.round(perf.loopMs) }, songs: JSON.parse(JSON.stringify(perf.songs)),
      slices: perf.slices, maxSliceMs: +perf.maxSliceMs.toFixed(2), pending: jobs.length, errors: perf.errors,
      sfxOn, musicOn, duck: { music: +duckM.toFixed(3), sfx: +duckS.toFixed(3) },
      music: music.cur ? Object.assign({ id: music.cur.id, fade: +music.cur.fade.toFixed(2), tempo: music.tempo }, lpInfo(music.cur.lp)) : null,
      engines: engines.map((e) => (e.layers ? { vehicle: e.vehicle, side: e.side, hum: lpInfo(e.layers.hum), boost: lpInfo(e.layers.boost), drift: lpInfo(e.layers.drift) } : null)),
      star: lpInfo(star.lp), starOn: star.fade > 0, danger: danger.map((d) => d.on)
    };
  }

  const clampLevel = (l) => clamp(Math.round(+l) || 1, 1, 3);
  const api = {
    init, ready, resume, tick, play, stopAll, stats, synth,
    setSfx, sfxOn: () => sfxOn,
    setMusic, musicOn: () => musicOn,
    music: musicPlay, musicTempo, musicStop,
    engine: (humanIdx) => engines[humanIdx === 1 ? 1 : 0],
    dangerStart: (player) => dangerSet(player, true),
    dangerStop: (player) => dangerSet(player, false),
    starStart: (player) => starSet(player, true),
    starStop: (player) => starSet(player, false),

    menuMove: (o) => play('menuMove', o),
    menuSelect: (o) => play('menuSelect', o),
    menuBlocked: (o) => play('menuBlocked', o),
    countdown: (n, o) => play(n > 0 ? 'countdown' : 'go', o),
    boxSmash: (o) => play('boxSmash', o),
    rouletteTick: (i, o) => { const k = Math.max(0, Math.round(+i) || 0); return play('rouletteTick:' + ((k & 1) + (k >= 8 ? 2 : 0)), o); },
    itemGet: (id, o) => play('itemGet:' + (ITEM_FLAVOR[id] || 'common'), o),
    itemUse: (id, o) => play(ITEM_USE[id] || 'use:rocket', o),
    hit: (kind, o) => play(kind === 'wobble' ? 'hit:wobble' : 'hit:spin', o),
    coin: (n, o) => play('coin:' + clamp(Math.round(+n) || 1, 1, 10), o),
    driftLevel: (level, o) => play('driftLevel:' + clampLevel(level), o),
    turbo: (level, o) => play('turbo:' + clampLevel(level), o),
    boostPad: (o) => play('boostPad', o),
    bump: (o) => play('bump', o),
    railRub: (o) => play('railRub', o),
    wallScrape: (o) => play('wallScrape', o),
    jump: (o) => play('jump', o),
    trick: (o) => play('trick', o),
    land: (o) => play('land', o),
    fall: (o) => play('fall', o),
    drone: (o) => play('drone', o),
    splash: (o) => play('splash', o),
    whoosh: (o) => play('whoosh', o),
    lap: (o) => play('lap', o),
    finalLap: (o) => play('finalLap', o),
    finish: (place, o) => play(place === 1 ? 'finish:win' : place <= 3 ? 'finish:podium' : 'finish:other', o),
    placeUp: (o) => play('placeUp', o),
    placeDown: (o) => play('placeDown', o),
    cue: (dir, player, o) => play('cue:' + (dir < 0 ? -1 : dir > 0 ? 1 : 0) + ':' + (player === 1 ? 1 : 0), o),
    scanMatch: (player, o) => play('scanMatch:' + (player === 1 ? 1 : 0), o),
    // controls.js calls pauseTick(sec, playerIdx); options, if any, come last.
    pauseTick: function (sec) {
      const last = arguments[arguments.length - 1];
      return play('pauseTick:' + clamp(Math.round(+sec) || 1, 1, 5), last && typeof last === 'object' ? last : null);
    },
    horn: (o) => play('horn', o),
    bombBlast: (o) => play('bombBlast', o),
    zap: (o) => play('zap', o),
    shrink: (o) => play('shrink', o),
    peelDrop: (o) => play('peelDrop', o),
    ballLaunch: (o) => play('ballLaunch', o),
    beeLaunch: (o) => play('beeLaunch', o),
    zapperSiren: (o) => play('zapperSiren', o),

    /* Test hooks for tools/audio_lab.html and the harness (not for game code). */
    _dev: {
      musicPlayer: () => (music.cur ? music.cur.lp : null),
      enginePlayer: (i) => (engines[i === 1 ? 1 : 0].layers ? engines[i === 1 ? 1 : 0].layers.hum : null),
      soundKeys: () => Array.from(sounds.keys()),
      loopKeys: () => Array.from(loopAssets.keys())
    }
  };

  NK.audio = api;
})(typeof window !== 'undefined' ? window : globalThis);
