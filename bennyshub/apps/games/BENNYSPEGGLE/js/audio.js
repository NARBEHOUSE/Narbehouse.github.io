/**
 * Benny's P3GL — audio.
 *
 * Every sound in the game is synthesised here, in plain JavaScript, as PCM
 * samples; wrapped in a 16-bit WAV header; handed to the page as a Blob URL;
 * and played through ordinary HTML5 <audio> elements. The Web Audio API is
 * never touched — it has taken the hub's Electron renderer down before
 * (ACCESSIBILITY.md §5) — and there are no asset files to ship or fail to
 * load. One-shots go through the hub's SafeAudio (every name prefixed p3-,
 * so none can shadow a SafeAudio built-in); music plays through this file's
 * own pairs of <audio> elements.
 *
 * The engine is NARBE Racer's (apps/games/NARBEKART/js/audio.js), carried
 * over and extended: the same DSP core, instruments, data-driven sequencer,
 * idle-slice render queue and gapless two-element loop player, plus a felt
 * piano, Rhodes, vibraphone, music box, choir and string pads, tape wobble
 * and vinyl warmth for Cozy, trance gates and risers for Hyper, waltz time,
 * humanised timing, one-shot stingers, and pegs that play the music's scale.
 *
 * ── Public API (P3.audio) ──────────────────────────────────────────────────
 *   init()                 idempotent; starts slice-rendering the effects. Safe before a gesture.
 *   unlock()               call from the first user gesture (iOS); harmless otherwise
 *   setMode(mode)          'cozy' | 'vivid' | 'hyper': peg timbre and the softer Cozy variants
 *   play(name, opts)       one-shot; opts { chain, index, step, speed, level, value, n, volume, mode }.
 *                          Returns true if it played. A sound still rendering is skipped (and
 *                          jumps the render queue so it is ready next time).
 *   music(id, opts)        crossfade to a looping track (opts.fade seconds, default 1.2); the same
 *                          id is a no-op; null or '' fades out. The old track keeps playing until
 *                          the new one has rendered.
 *   stinger(id)            'win-cozy' | 'win-vivid' | 'win-hyper' | 'finale' | 'lose' |
 *                          'campaign-complete'; the music ducks under it. Follows the music switch.
 *   stopMusic(fade)
 *   setMusicEnabled(b) setSfxEnabled(b) isMusicEnabled() isSfxEnabled()
 *   setMusicVolume(0..1) setSfxVolume(0..1)
 *   setMusicDuck(0..1)     extra music level, e.g. 0.4 while the pause menu is open
 *   suspend() resume()     pause / restart all audio (visibility changes, app pause)
 *   beat()                 { bpm, beat, phase, bar, playing, id }, read from the music element's
 *                          clock, so visuals can pulse in time
 *   currentTrack()         the track id asked for last (null when none)
 *   say(text)              speak now, interrupting (menus, important lines)
 *   sayQueued(text)        speak after whatever is speaking (outcome lines)
 *   sayIfIdle(text)        speak only if nothing is speaking, otherwise drop (chatter)
 *   isSpeaking()  whenQuiet(maxMs) → Promise
 *                          Speech goes through NarbeVoiceManager; its TTS switch is the only one.
 *   ready(id)              is this song, stinger or sound rendered ('peg': the current peg set)
 *   Extras: tick() optional per-frame pump · prefetch(id) · stopSfx(name) · tracks() ·
 *   trackInfo(id) · pegNote(chain) · stats() · synth (the pure renderer)
 *
 * ── How it is built ───────────────────────────────────────────────────────
 *   1. DSP core: oscillators, envelopes, seeded noise, filters, a plate
 *      reverb, a ping-pong echo, tape wobble, a look-ahead limiter, a
 *      loudness meter and a WAV writer. Pure functions of sample time with no
 *      browser APIs, so node renders exactly the bytes the game plays. Every
 *      long pass is a generator that yields every few milliseconds of work.
 *   2. Instruments shared by the effects and the music.
 *   3. The drum kit.          4. Effect-drawing helpers.
 *   5. The sound-effect catalogue: every one-shot is a small recipe.
 *   6. Pegs: each hit in a shot plays the next note of the current track's
 *      scale, in a timbre that belongs to the play mode.
 *   7. Music: each song is data (tempo, chords, melodies, generated bass /
 *      arpeggio / chord parts, drums, mix) rendered by a sequencer into a
 *      seamless stereo loop, or into a one-shot stinger.
 *   8. The songs.  9. The stingers.  10. Render entry points (the synth API,
 *      module.exports under node).
 *   11. The browser layer: an idle-slice render queue, SafeAudio one-shots,
 *      gapless two-element loops, ducking under speech and stingers, speech.
 */
(function (root) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════
   * 1. DSP core — pure functions of sample time, no browser APIs
   * ══════════════════════════════════════════════════════════════════════ */

  const SR = 22050;               // the hub's rate: plenty for tablet and laptop speakers
  const TAU = Math.PI * 2;
  const CEIL = 0.891;             // -1 dBFS: the peak every render is limited to
  const YM = 32767;               // long per-sample passes yield every 32 k samples
  const dbToGain = (db) => Math.pow(10, db / 20);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* Deterministic randomness: every render is a pure function of its name, so
   * the node test measures exactly what the game plays. */
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

  /* sin(2πp) for a phase in cycles: table lookup with linear interpolation. */
  const SIN_N = 4096;
  const SIN = new Float32Array(SIN_N + 1);
  for (let i = 0; i <= SIN_N; i++) SIN[i] = Math.sin(TAU * i / SIN_N);
  function sn(p) {
    p -= Math.floor(p);
    const x = p * SIN_N, i = x | 0;
    return SIN[i] + (SIN[i + 1] - SIN[i]) * (x - i);
  }

  /* Band-limited saw and pulse (PolyBLEP): naive ones alias into a harsh fizz. */
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
  /** Band-pass normalised to unity gain at the centre. */
  Svf.prototype.bp = function (x) {
    const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    return v1 * this.k;
  };

  /** Run a generator to completion (node, and the renders small enough not to slice). */
  function drain(gen) {
    let r = gen.next();
    while (!r.done) r = gen.next();
    return r.value;
  }

  /* ── Loop-aware processing ────────────────────────────────────────────────
   * A loop must sound the same across its seam as anywhere else: reverb,
   * echo and filter tails from the end of the loop have to be audible at its
   * start. Every stateful pass over a loop therefore runs over the last few
   * seconds first ("priming") and only then over the whole loop, so its
   * delay lines already hold what the seam would have carried.
   */

  /** One damped comb of the reverb, accumulated into out. */
  function* combGen(inp, out, d, fb, damp, prime) {
    const n = inp.length, buf = new Float32Array(d), total = prime + n;
    let k = 0, f = 0;
    for (let t = 0; t < total; t++) {
      const i = t < prime ? n - prime + t : t - prime;
      const y = buf[k];
      f = y * (1 - damp) + f * damp;
      buf[k] = inp[i] + f * fb;
      if (++k === d) k = 0;
      if (t >= prime) out[i] += y;
      if ((t & YM) === YM) yield;
    }
  }
  /** Freeverb-style allpass, in place. */
  function* allpassGen(x, d, prime) {
    const n = x.length, buf = new Float32Array(d), total = prime + n;
    let k = 0;
    for (let t = 0; t < total; t++) {
      const i = t < prime ? n - prime + t : t - prime;
      const bo = buf[k], xi = x[i];
      buf[k] = xi + bo * 0.5;
      if (++k === d) k = 0;
      if (t >= prime) x[i] = bo - xi;
      if ((t & YM) === YM) yield;
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
    const n = send.length, prime = circ ? Math.min(n, Math.round(2.5 * SR)) : 0;
    const inp = new Float32Array(n);
    for (let i = 0; i < n; i++) { inp[i] = send[i] * 0.24; if ((i & YM) === YM) yield; }
    for (let ch = 0; ch < 2; ch++) {
      const wet = new Float32Array(n), spread = ch ? 11 : 0;
      for (let c = 0; c < COMBS.length; c++) yield* combGen(inp, wet, COMBS[c] + spread, size, damp, prime);
      for (let a = 0; a < APASS.length; a++) yield* allpassGen(wet, APASS[a] + spread, prime);
      const out = ch ? R : L;
      for (let i = 0; i < n; i++) { out[i] += wet[i] * g; if ((i & YM) === YM) yield; }
    }
  }

  /** Tempo-synced ping-pong echo: first repeat left, then right, softened each time round. */
  function* echoGen(send, L, R, d, fb, lpHz, g, circ) {
    const n = send.length;
    if (d < 2) return;
    const bl = new Float32Array(d), br = new Float32Array(d), a = onePoleA(lpHz);
    const repeats = Math.log(0.001) / Math.log(Math.max(0.05, fb));
    const prime = circ ? Math.min(n, Math.ceil(d * 2 * repeats)) : 0, total = prime + n;
    let k = 0, lp = 0;
    for (let t = 0; t < total; t++) {
      const i = t < prime ? n - prime + t : t - prime;
      const ol = bl[k], or = br[k];
      lp += a * (or - lp);
      bl[k] = send[i] + lp * fb;
      br[k] = ol;
      if (++k === d) k = 0;
      if (t >= prime) { L[i] += ol * g; R[i] += or * g; }
      if ((t & YM) === YM) yield;
    }
  }

  /** One-pole high-pass (DC and sub-rumble removal), in place, loop-aware. */
  function* highpassGen(x, f, circ) {
    const n = x.length, a = Math.exp(-TAU * f / SR);
    const prime = circ ? Math.min(n, Math.round(0.5 * SR)) : 0;
    let px = 0, py = 0;
    for (let t = 0; t < prime + n; t++) {
      const i = t < prime ? n - prime + t : t - prime;
      const xi = x[i], y = a * (py + xi - px);
      px = xi; py = y;
      if (t >= prime) x[i] = y;
      if ((t & YM) === YM) yield;
    }
  }

  /** Loop-aware biquad pass, in place. */
  function* biquadGen(x, type, f, q, circ) {
    const n = x.length, bq = new Biquad().set(type, f, q);
    const prime = circ ? Math.min(n, Math.round(0.4 * SR)) : 0;
    for (let t = 0; t < prime + n; t++) {
      const i = t < prime ? n - prime + t : t - prime;
      const y = bq.run(x[i]);
      if (t >= prime) x[i] = y;
      if ((t & YM) === YM) yield;
    }
  }

  /**
   * Tape wobble ("wow"): every sample is read back through a delay that
   * swings slowly by a fraction of a millisecond, so the pitch drifts a few
   * cents either way, like a cassette deck. On a loop the LFO completes a
   * whole number of cycles and the read wraps round the ring, so the seam is
   * invisible.
   */
  function* wowGen(chs, ms, hz, circ) {
    const n = chs[0].length, depth = ms * SR / 1000;
    const cyc = circ ? Math.max(1, Math.round(hz * n / SR)) : hz * n / SR, w = cyc / n;
    for (let c = 0; c < chs.length; c++) {
      const x = chs[c], src = x.slice();
      yield;
      for (let i = 0; i < n; i++) {
        let p = i - 1 - depth * (0.5 + 0.5 * sn(i * w));
        if (p < 0) p = circ ? p + n : 0;
        const a = Math.floor(p), fr = p - a, b = a + 1 >= n ? (circ ? 0 : n - 1) : a + 1;
        x[i] = src[a] * (1 - fr) + src[b] * fr;
        if ((i & YM) === YM) yield;
      }
    }
  }

  /**
   * Vinyl warmth: a whisper of band-limited hiss and a few soft ticks a
   * second, generated round the ring so the loop seam carries no click.
   */
  function* vinylGen(L, R, g, rnd, circ) {
    const n = L.length, h = new Float32Array(n), c = new Float32Array(n);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const x = nz();                                  // Paul Kellet's economy pink filter
      b0 = 0.99765 * b0 + x * 0.099046; b1 = 0.963 * b1 + x * 0.2965164; b2 = 0.57 * b2 + x * 1.0526913;
      h[i] = (b0 + b1 + b2 + x * 0.1848) * 0.2;
      if ((i & YM) === YM) yield;
    }
    yield* biquadGen(h, 'lp', 3800, 0.7, circ);
    yield* biquadGen(h, 'hp', 400, 0.7, circ);
    const count = Math.round(4 * n / SR);
    for (let k = 0; k < count; k++) {
      const i = Math.floor(rnd() * n), amp = (0.2 + 0.8 * rnd() * rnd()) * (rnd() < 0.5 ? -1 : 1), len = 4 + Math.floor(rnd() * 12);
      for (let j = 0; j < len; j++) {
        const idx = circ ? (i + j) % n : i + j;
        if (idx < n) c[idx] += amp * Math.exp(-j / (len * 0.35));
      }
    }
    yield* biquadGen(c, 'bp', 2400, 0.8, circ);
    for (let i = 0; i < n; i++) {
      const v = (h[i] * 0.25 + c[i]) * g;
      L[i] += v; R[i] += v * 0.9;
      if ((i & YM) === YM) yield;
    }
  }

  /**
   * Brick-wall limiter at CEIL. The gain each sample needs is smoothed with an
   * instant-but-backward attack (2 ms look-ahead feel) and an 80 ms release,
   * so peaks are caught without clicks and the output can never exceed CEIL.
   */
  function* limitGen(chs, ceil, circ) {
    const n = chs[0].length, g = new Float32Array(n), nc = chs.length;
    for (let i = 0; i < n; i++) {
      let pk = 0;
      for (let c = 0; c < nc; c++) { const v = Math.abs(chs[c][i]); if (v > pk) pk = v; }
      g[i] = pk > ceil ? ceil / pk : 1;
      if ((i & YM) === YM) yield;
    }
    const rel = Math.exp(-1 / (0.08 * SR)), att = Math.exp(-1 / (0.002 * SR)), passes = circ ? 2 : 1;
    let s = 1;
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < n; i++) {
        s = Math.min(g[i], 1 - (1 - s) * rel);
        if (p === passes - 1) g[i] = s;
        if ((i & YM) === YM) yield;
      }
    }
    s = 1;
    for (let p = 0; p < passes; p++) {
      for (let i = n - 1; i >= 0; i--) {
        s = Math.min(g[i], 1 - (1 - s) * att);
        if (p === passes - 1) g[i] = s;
        if ((i & YM) === 0) yield;
      }
    }
    for (let c = 0; c < nc; c++) {
      const x = chs[c];
      for (let i = 0; i < n; i++) { x[i] *= g[i]; if ((i & YM) === YM) yield; }
    }
  }
  function limit(chs, ceil, circ) { drain(limitGen(chs, ceil, circ)); }

  function* peakGen(chs) {
    let pk = 0;
    for (let c = 0; c < chs.length; c++) {
      const x = chs[c];
      for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > pk) pk = v; if ((i & YM) === YM) yield; }
    }
    return pk;
  }
  function peakOf(chs) { return drain(peakGen(chs)); }
  function* scaleGen(chs, g) {
    for (let c = 0; c < chs.length; c++) {
      const x = chs[c];
      for (let i = 0; i < x.length; i++) { x[i] *= g; if ((i & YM) === YM) yield; }
    }
  }
  function scale(chs, g) { drain(scaleGen(chs, g)); }

  /**
   * Loudness in dB (a simplified LUFS: K-weighted, channels summed). With
   * `win` seconds it is the loudest window — how loud a short effect feels;
   * with 0 it is the whole buffer — how loud a loop sits in the mix. A mono
   * file plays out of both speakers, so it counts twice (+3 dB).
   */
  function* loudnessGen(chs, win) {
    const n = chs[0].length, sq = new Float32Array(n);
    for (let c = 0; c < chs.length; c++) {
      const hs = new Biquad().set('hs', 1681, 0.707, 4), hp = new Biquad().set('hp', 38, 0.5), x = chs[c];
      for (let i = 0; i < n; i++) { const y = hp.run(hs.run(x[i])); sq[i] += y * y; if ((i & YM) === YM) yield; }
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
      for (let i = W; i < n; i++) { s += sq[i] - sq[i - W]; if (s / W > best) best = s / W; if ((i & YM) === YM) yield; }
    }
    return 10 * Math.log10(Math.max(1e-12, best * both));
  }
  function loudness(chs, win) { return drain(loudnessGen(chs, win)); }

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
      if ((i & YM) === YM) yield;
    }
    return buf;
  }
  function wavBytes(chs, tail) { return drain(wavGen(chs, tail)); }

  /* ══════════════════════════════════════════════════════════════════════
   * 2. Instruments — shared by the effects and the music
   * ══════════════════════════════════════════════════════════════════════
   * Each draws ONE note into a buffer: fn(o, t0, f, dur, vel, P) starts t0
   * seconds in, holds the gate for `dur` seconds and rings out for at most
   * the instrument's `rel` afterwards. Chord instruments (pads, choir) take
   * an array of Hz and are generators, because a long pad chord is too much
   * work for one render slice. Every note ends on an exact zero (a 4 ms
   * fade) so buffers never click.
   */

  function span(o, t0, dur, rel) {
    const i0 = Math.max(0, Math.round(t0 * SR));
    return { i0, n: Math.min(o.length - i0, Math.ceil((dur + rel) * SR)) };
  }

  /** Shared ADSR step used by the synth voices: returns the new level. */
  function adsrStep(i, lvl, aN, on, sus, dk, rk) {
    if (i >= on) return lvl * rk;
    if (i < aN) return i / aN;
    return sus + (lvl - sus) * dk;
  }

  /**
   * Two-operator FM: bells, glockenspiel, celesta, steel pan, toy piano and
   * the electric pianos. trem: [rateHz, depth] amplitude tremolo (Rhodes).
   */
  function fmNote(o, t0, f, dur, vel, P) {
    const rel = P.rel, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const on = P.ring ? n : dur * SR, aN = Math.max(1, (P.a || 0.001) * SR), fade = Math.min(n, 0.004 * SR);
    const dk = Math.exp(-1 / (P.tau * SR)), rk = Math.exp(-5 / (rel * SR));
    const ik = Math.exp(-1 / (P.ixTau * SR)), ixEnd = P.ixEnd || 0;
    const dc = f * (P.cr || 1) / SR, dm = f * P.mr / SR;
    const p2 = P.p2, d2 = p2 ? f * p2[0] / SR : 0, k2 = p2 ? Math.exp(-1 / (p2[2] * SR)) : 0;
    const sus = P.sus || 0, g = vel * (P.g || 0.5);
    const tr = P.trem ? P.trem[0] / SR : 0, td = P.trem ? P.trem[1] : 0;
    // A softer touch opens the FM index less: quiet notes are rounder, not just quieter.
    let pc = 0, pm = 0, q2 = 0, e = 1, lvl = 1, ix = P.ix * (0.55 + 0.45 * vel);
    let e2 = p2 && f * p2[0] < SR * 0.45 ? p2[1] : 0;
    for (let i = 0; i < n; i++) {
      pm += dm; if (pm >= 1) pm -= 1;
      pc += dc; if (pc >= 1) pc -= 1;
      let v = sn(pc + ix * 0.1591549 * sn(pm));
      if (e2) { q2 += d2; if (q2 >= 1) q2 -= 1; v += e2 * sn(q2); e2 *= k2; }
      if (i < on) { lvl = sus + (1 - sus) * e; e *= dk; } else lvl *= rk;
      let env = lvl;
      if (i < aN) env *= i / aN;
      if (td) env *= 1 - td * (0.5 - 0.5 * sn(i * tr + 0.25));
      if (i > n - fade) env *= (n - i) / fade;
      o[i0 + i] += v * env * g;
      ix = ixEnd + (ix - ixEnd) * ik;
    }
  }

  /**
   * Struck bars and tines (marimba, xylophone, kalimba, vibraphone, music
   * box): decaying partials [ratio, amp, tau] plus a mallet click. Each
   * partial is summed only until it has died away, so the bright upper
   * modes cost almost nothing. A softer stroke dims the upper partials
   * (velBright); trem [rateHz, depth] is the vibraphone's motor.
   */
  function malletNote(o, t0, f, dur, vel, P) {
    const sp = span(o, t0, dur, P.rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const tmp = new Float32Array(n), parts = P.parts, vb = P.velBright === undefined ? 0.6 : P.velBright;
    for (let k = 0; k < parts.length; k++) {
      const fk = f * parts[k][0];
      if (fk >= SR * 0.45) continue;
      const dt = fk / SR, dk = Math.exp(-1 / (parts[k][2] * SR));
      let amp = parts[k][1] * (k ? Math.pow(vel, vb) : 1), ph = (k * 0.21) % 1;
      const end = Math.min(n, Math.ceil(parts[k][2] * SR * 9.3));
      for (let i = 0; i < end; i++) { ph += dt; if (ph >= 1) ph -= 1; tmp[i] += amp * sn(ph); amp *= dk; }
    }
    const click = P.click || 0;
    if (click) {
      const cN = Math.min(n, Math.round(0.004 * SR)), ca = P.clickLp ? onePoleA(P.clickLp) : 0.5;
      let lpc = 0;
      for (let i = 0; i < cN; i++) { lpc += ca * (nz() - lpc); tmp[i] += click * lpc * (1 - i / cN); }
    }
    const aN = Math.max(1, (P.a || 0.0006) * SR), fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.5);
    const tr = P.trem ? P.trem[0] / SR : 0, td = P.trem ? P.trem[1] : 0;
    for (let i = 0; i < n; i++) {
      let env = i < aN ? i / aN : 1;
      if (td) env *= 1 - td * (0.5 - 0.5 * sn(i * tr + 0.25));
      if (i > n - fade) env *= (n - i) / fade;
      o[i0 + i] += tmp[i] * env * g;
    }
  }

  /**
   * Felt piano: a struck string as a handful of slightly stretched partials,
   * each decaying faster than the one below; the lowest two beat gently like
   * the strings of a unison; a soft, low-passed hammer thump; the damper
   * closes at note-off. A softer touch is darker as well as quieter.
   */
  function feltNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.3, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const tmp = new Float32Array(n), on = Math.min(n, Math.round(dur * SR));
    const B = P.inh === undefined ? 0.00035 : P.inh;
    const dull = (P.dull === undefined ? 0.6 : P.dull) * (1.3 - 0.5 * vel);
    const tau0 = (P.tau || 2.2) * Math.pow(262 / f, 0.45);   // low strings ring longer
    const K = P.parts || 9;
    for (let k = 1; k <= K; k++) {
      const fk = f * k * Math.sqrt(1 + B * k * k);
      if (fk > SR * 0.42) break;
      let a = Math.pow(k, -1.2) * Math.exp(-(k - 1) * dull);
      if (k === 3) a *= 0.75;                            // the hammer sits near a node of the third mode
      const tau = tau0 / (1 + 0.6 * (k - 1)), dk = Math.exp(-1 / (tau * SR));
      const end = Math.min(n, Math.ceil(tau * SR * 9.3)), pairs = k <= 2 ? 2 : 1;
      for (let s = 0; s < pairs; s++) {
        const d = fk * (pairs === 2 ? (s ? 1.0008 : 0.9992) : 1) / SR;
        let ph = (k * 0.137) % 1, amp = a / pairs;   // the pair starts in phase and drifts into a slow beat
        for (let i = 0; i < end; i++) { ph += d; if (ph >= 1) ph -= 1; tmp[i] += amp * sn(ph); amp *= dk; }
      }
    }
    const hammer = P.hammer === undefined ? 0.3 : P.hammer;
    if (hammer) {
      const hk = onePoleA(P.hammerHz || 900), hN = Math.min(n, Math.round(0.014 * SR));
      let lp = 0;
      for (let i = 0; i < hN; i++) { lp += hk * (nz() - lp); tmp[i] += lp * hammer * vel * (1 - i / hN); }
    }
    const aN = Math.max(1, (P.a || 0.0025) * SR), rk = Math.exp(-5 / (rel * SR)), fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.42);
    let e = 1;
    for (let i = 0; i < n; i++) {
      if (i >= on) e *= rk;
      let env = e;
      if (i < aN) env *= i / aN;
      if (i > n - fade) env *= (n - i) / fade;
      o[i0 + i] += tmp[i] * env * g;
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
    let w = 0, prev = 0, bp = 0, be = 1;
    for (let i = 0; i < n; i++) {
      let pos = w - per;
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
   * the attack: saw leads, synth plucks, arpeggios, synth brass and the
   * bowed cello voice. keyTrack lifts the cutoff with pitch so high notes do
   * not go dull.
   */
  function sawNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.1, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const on = dur * SR, aN = Math.max(1, (P.a || 0.006) * SR);
    const dk = Math.exp(-1 / ((P.d || 0.4) * SR)), sus = P.s === undefined ? 0.8 : P.s, rk = Math.exp(-5 / (rel * SR));
    const det = P.det === undefined ? 0.004 : P.det;
    const cut = Math.max(P.cut || 2600, f * (P.keyTrack || 0)), cutEnv = P.cutEnv || 0, ck = Math.exp(-1 / ((P.cutTau || 0.15) * SR));
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

  /** Tonewheel-style organ and the carnival calliope: drawbar harmonics, a chorus wobble, a key click. */
  const ORGAN_RATIOS = [0.5, 1, 1.5, 2, 3, 4, 6, 8];
  function organNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.05, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const bars = P.bars || [0.5, 1, 0.45, 0.55, 0.3, 0.2, 0.08, 0.05], nb = bars.length;
    const ph = new Float64Array(nb), dp = new Float64Array(nb), amp = new Float64Array(nb);
    let tot = 0;
    for (let k = 0; k < nb; k++) { dp[k] = f * ORGAN_RATIOS[k] / SR; amp[k] = f * ORGAN_RATIOS[k] < SR * 0.45 ? bars[k] : 0; tot += amp[k]; }
    for (let k = 0; k < nb; k++) amp[k] /= Math.max(1, tot * 0.6);
    const on = dur * SR, aN = (P.a || 0.004) * SR, rk = Math.exp(-5 / (rel * SR)), fade = Math.min(n, 0.004 * SR);
    const vr = (P.vr || 6.4) / SR, vd = P.vib === undefined ? 0.0025 : P.vib, g = vel * (P.g || 0.5), clickN = 0.003 * SR;
    let lvl = 0, lpc = 0;
    for (let i = 0; i < n; i++) {
      lvl = adsrStep(i, lvl, aN, on, 1, 1, rk);
      const wob = 1 + vd * sn(i * vr);
      let v = 0;
      for (let k = 0; k < nb; k++) { ph[k] += dp[k] * wob; if (ph[k] >= 1) ph[k] -= 1; v += amp[k] * sn(ph[k]); }
      if (i < clickN) { lpc += 0.6 * (nz() - lpc); v += (P.click === undefined ? 0.25 : P.click) * lpc; }
      const env = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += v * env * g;
    }
  }

  /** Breathy wind voice (flute, whistle, ocarina): a few harmonics, band-passed breath, delayed vibrato. */
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
      if (breath) v += breath * (1 + 2 * Math.max(0, 1 - i / aN)) * bq.run(nz());
      const env = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += v * env * g;
    }
  }

  /** Synth bass: saw or square through an envelope-swept low-pass, a sine sub an octave down, an optional slap click. */
  function bassNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.06, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const on = dur * SR, aN = 0.003 * SR, dk = Math.exp(-1 / ((P.d || 0.25) * SR)), sus = P.s === undefined ? 0.7 : P.s;
    const rk = Math.exp(-5 / (rel * SR)), sq = P.wave === 'sq', sub = P.sub || 0;
    const cut = P.cut || 500, env = P.env || 2, ek = Math.exp(-1 / ((P.envTau || 0.12) * SR));
    const click = P.click || 0, clickN = Math.round(0.005 * SR);
    const fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.6), svf = new Svf();
    let p = 0, ps = 0, lvl = 0, ce = 1, lpc = 0;
    for (let i = 0; i < n; i++) {
      lvl = adsrStep(i, lvl, aN, on, sus, dk, rk);
      const dt = f / SR;
      p += dt; if (p >= 1) p -= 1;
      ps += dt * 0.5; if (ps >= 1) ps -= 1;
      if ((i & 15) === 0) svf.set(cut * (1 + env * vel * ce), P.q || 1.1);
      ce *= ek;
      let v = svf.lp(sq ? pulse(p, dt, 0.5) * 0.8 : saw(p, dt)) + sub * sn(ps);
      if (click && i < clickN) { lpc += 0.45 * (nz() - lpc); v += click * lpc * (1 - i / clickN); }
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

  /** Bubble "bloop": a sine that drops into pitch from above. */
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

  /** Laser "pew": a soft triangle-saw that swoops down into its pitch and dies quickly. */
  function laserNote(o, t0, f, dur, vel, P) {
    const rel = P.rel || 0.15, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const gk = Math.exp(-1 / ((P.glide || 0.05) * SR)), dk = Math.exp(-1 / ((P.tau || 0.1) * SR));
    const lpA = onePoleA(P.cut || 2600), fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.4);
    let p = 0, bend = (P.from || 3) - 1, e = 1, y = 0;
    for (let i = 0; i < n; i++) {
      const dt = f * (1 + bend) / SR;
      p += dt; if (p >= 1) p -= 1;
      y += lpA * (0.6 * tri(p) + 0.4 * saw(p, dt) - y);
      let env = e * (i < 30 ? i / 30 : 1);
      if (i > n - fade) env *= (n - i) / fade;
      o[i0 + i] += y * env * g;
      bend *= gk; e *= dk;
    }
  }

  /** Riser: band-passed noise sweeping up across the whole note, swelling, with a faint rising tone. */
  function* riserNote(o, t0, f, dur, vel, P) {
    const sp = span(o, t0, dur, 0.03), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const f0 = P.f0 || 300, f1 = P.f1 || 3200, on = Math.max(1, Math.min(n, Math.round(dur * SR)));
    const bq = new Biquad(), g = vel * (P.g || 0.35), fade = Math.min(n, Math.round(0.03 * SR)), tn = P.tone || 0;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const u = Math.min(1, i / on);
      if ((i & 15) === 0) bq.set('bp', f0 * Math.pow(f1 / f0, u), P.q || 1.4);
      let v = bq.run(nz());
      if (tn) { ph += f * Math.pow(2, u * (P.oct || 2)) / SR; ph -= Math.floor(ph); v += tn * sn(ph); }
      let env = u * u;
      if (i > n - fade) env *= (n - i) / fade;
      o[i0 + i] += v * env * g;
      if ((i & 8191) === 8191) yield;
    }
  }

  /**
   * Chord pad (generator): each tone a few detuned saws, triangles or sines,
   * one low-pass, slow swell. vib: per-voice vibrato (strings), lfo: [Hz,
   * depth] a slow filter breath, air: a little filtered breath noise.
   */
  function* padGen(o, t0, fs, dur, vel, P) {
    if (!Array.isArray(fs)) fs = [fs];
    const rel = P.rel || 0.6, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const uni = P.uni || 2, det = P.det || 0.0035, wave = P.wave === 'tri' ? 1 : P.wave === 'sine' ? 2 : 0;
    const no = fs.length * uni, ph = new Float64Array(no), dp = new Float64Array(no), wob = new Float64Array(no).fill(1);
    for (let k = 0; k < no; k++) {
      const v = Math.floor(k / uni), u = k % uni, spread = uni === 1 ? 0 : (u / (uni - 1)) * 2 - 1;
      dp[k] = fs[v] * (1 + det * spread) / SR;
      ph[k] = (k * 0.618) % 1;
    }
    const on = dur * SR, aN = Math.max(1, (P.a || 0.25) * SR), rk = Math.exp(-5 / (rel * SR));
    const fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.3) / Math.sqrt(no);
    const cut = P.cut || 1700, q = P.q || 0.7, svf = new Svf().set(cut, q);
    const vib = P.vib || 0, vr = (P.vr || 5) / SR, lr = P.lfo ? P.lfo[0] / SR : 0, ld = P.lfo ? P.lfo[1] : 0;
    const air = (P.air || 0) * Math.sqrt(no);
    let lvl = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) {
        if (vib) for (let k = 0; k < no; k++) wob[k] = 1 + vib * sn(i * vr + k * 0.37);
        if (ld) svf.set(cut * (1 + ld * sn(i * lr + 0.75)), q);
      }
      lvl = adsrStep(i, lvl, aN, on, 1, 1, rk);
      let v = 0;
      for (let k = 0; k < no; k++) {
        const d = dp[k] * wob[k];
        let p = ph[k] + d; if (p >= 1) p -= 1; ph[k] = p;
        v += wave === 0 ? saw(p, d) : wave === 1 ? tri(p) : sn(p);
      }
      if (air) v += air * nz();
      v = svf.lp(v);
      const env = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += v * env * g;
      if ((i & 8191) === 8191) yield;
    }
  }

  /**
   * Choir "aah" (generator): paired saws per tone with a shared, slowly
   * deepening vibrato, shaped by three vowel formants and a soft low-pass.
   */
  const AAH = [[760, 5, 1], [1150, 6, 0.5], [2700, 8, 0.16]];
  function* choirGen(o, t0, fs, dur, vel, P) {
    if (!Array.isArray(fs)) fs = [fs];
    const rel = P.rel || 0.7, sp = span(o, t0, dur, rel), i0 = sp.i0, n = sp.n;
    if (n <= 0) return;
    const no = fs.length * 2, ph = new Float64Array(no), dp = new Float64Array(no);
    for (let k = 0; k < no; k++) { dp[k] = fs[k >> 1] * (k & 1 ? 1.0035 : 0.9965) / SR; ph[k] = (k * 0.381) % 1; }
    const F = P.formants || AAH, fl = F.map((x) => new Svf().set(x[0], x[1])), body = new Svf().set(P.cut || 2600, 0.7);
    const on = dur * SR, aN = Math.max(1, (P.a || 0.35) * SR), rk = Math.exp(-5 / (rel * SR));
    const fade = Math.min(n, 0.004 * SR), g = vel * (P.g || 0.36) / Math.sqrt(no);
    const vib = P.vib || 0.005, vr = (P.vr || 5.2) / SR, vgrow = 0.5 * SR;
    let lvl = 0, w = 1;
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) w = 1 + vib * Math.min(1, i / vgrow) * sn(i * vr);
      lvl = adsrStep(i, lvl, aN, on, 1, 1, rk);
      let v = 0;
      for (let k = 0; k < no; k++) {
        const d = dp[k] * w;
        let p = ph[k] + d; if (p >= 1) p -= 1; ph[k] = p;
        v += saw(p, d);
      }
      let y = 0;
      for (let f = 0; f < fl.length; f++) y += F[f][2] * fl[f].bp(v);
      y = body.lp(y * 1.6 + v * 0.06);
      const env = i > n - fade ? lvl * (n - i) / fade : lvl;
      o[i0 + i] += y * env * g;
      if ((i & 8191) === 8191) yield;
    }
  }

  /* The instrument table: parts and effects name an instrument and may
   * override any of its parameters. `gen` instruments are generators. */
  const INSTR = {
    // FM bells and keys
    bell:      { rel: 1.3, fn: fmNote, P: { mr: 3.5, ix: 2.6, ixEnd: 0.4, ixTau: 0.3, tau: 0.8, ring: 1, g: 0.42 } },
    bellSoft:  { rel: 1.0, fn: fmNote, P: { mr: 3.5, ix: 1.3, ixEnd: 0.25, ixTau: 0.2, tau: 0.55, ring: 1, g: 0.42 } },
    glock:     { rel: 0.9, fn: fmNote, P: { mr: 4, ix: 1.0, ixEnd: 0.1, ixTau: 0.05, tau: 0.45, ring: 1, g: 0.4, p2: [2.76, 0.22, 0.1] } },
    celesta:   { rel: 1.0, fn: fmNote, P: { mr: 5, ix: 0.8, ixEnd: 0.05, ixTau: 0.08, tau: 0.7, ring: 1, g: 0.44, p2: [2.0, 0.3, 0.3] } },
    glassArp:  { rel: 0.5, fn: fmNote, P: { mr: 2, ix: 1.4, ixEnd: 0.2, ixTau: 0.05, tau: 0.22, ring: 1, g: 0.42 } },
    steel:     { rel: 0.8, fn: fmNote, P: { mr: 2, ix: 2.0, ixEnd: 0.45, ixTau: 0.09, tau: 0.5, ring: 1, g: 0.45, p2: [3.0, 0.14, 0.2] } },
    toy:       { rel: 0.6, fn: fmNote, P: { mr: 3, ix: 1.7, ixEnd: 0.2, ixTau: 0.04, tau: 0.3, ring: 1, g: 0.45, p2: [5.2, 0.16, 0.03] } },
    ep:        { rel: 0.35, fn: fmNote, P: { mr: 1, ix: 1.4, ixEnd: 0.35, ixTau: 0.25, tau: 1.0, sus: 0.25, g: 0.45, p2: [14, 0.06, 0.012] } },
    rhodes:    { rel: 0.45, fn: fmNote, P: { mr: 1, ix: 1.05, ixEnd: 0.16, ixTau: 0.3, tau: 1.4, sus: 0.22, g: 0.46, p2: [14, 0.045, 0.01] } },
    // Struck bars and tines
    marimba:   { rel: 0.7, fn: malletNote, P: { parts: [[1, 1, 0.38], [3.98, 0.3, 0.07], [9.9, 0.06, 0.02]], click: 0.1, g: 0.55 } },
    xylo:      { rel: 0.45, fn: malletNote, P: { parts: [[1, 1, 0.18], [3.0, 0.38, 0.05], [6.1, 0.1, 0.02]], click: 0.12, g: 0.5 } },
    kalimba:   { rel: 0.9, fn: malletNote, P: { parts: [[1, 1, 0.55], [5.4, 0.16, 0.04], [2.0, 0.05, 0.2]], click: 0.04, clickLp: 2500, velBright: 0.8, g: 0.55 } },
    vibes:     { rel: 1.5, fn: malletNote, P: { parts: [[1, 1, 1.1], [4.0, 0.28, 0.2], [10.0, 0.04, 0.04]], click: 0.03, clickLp: 2000, trem: [5.4, 0.3], g: 0.5 } },
    musicBox:  { rel: 1.2, fn: malletNote, P: { parts: [[1, 1, 0.95], [2.0, 0.1, 0.5], [5.95, 0.2, 0.08], [11.4, 0.04, 0.025]], click: 0.025, g: 0.5 } },
    // Keys
    felt:      { rel: 0.35, fn: feltNote, P: { tau: 2.2, dull: 0.6, hammer: 0.3, g: 0.45 } },
    // Plucked strings
    pluck:     { rel: 0.3, fn: pluckNote, P: { bright: 0.6, t60: 1.4, g: 0.55 } },
    harp:      { rel: 1.0, fn: pluckNote, P: { bright: 0.42, t60: 2.6, g: 0.85 } },
    pizz:      { rel: 0.12, fn: pluckNote, P: { bright: 0.5, t60: 0.45, g: 0.6 } },
    upright:   { rel: 0.12, fn: pluckNote, P: { bright: 0.2, t60: 1.0, body: 0.6, g: 0.75 } },
    bassPluck: { rel: 0.1, fn: pluckNote, P: { bright: 0.28, t60: 1.2, body: 0.55, g: 0.7 } },
    // Winds and organs
    flute:     { rel: 0.12, fn: fluteNote, P: { h2: 0.22, h3: 0.07, breath: 0.08, a: 0.04, vib: 0.006, g: 0.5 } },
    whistle:   { rel: 0.08, fn: fluteNote, P: { h2: 0.02, h3: 0.05, breath: 0.035, a: 0.015, vib: 0.008, scoop: 0.03, g: 0.5 } },
    ocarina:   { rel: 0.1, fn: fluteNote, P: { h2: 0.06, h3: 0.02, breath: 0.04, a: 0.03, vib: 0.006, g: 0.5 } },
    calliope:  { rel: 0.06, fn: organNote, P: { bars: [0, 1, 0, 0.6, 0.12, 0.1, 0, 0], vib: 0.0055, vr: 6.2, click: 0.12, a: 0.012, g: 0.45 } },
    organ:     { rel: 0.05, fn: organNote, P: { g: 0.45 } },
    // Synth voices
    lead:      { rel: 0.1, fn: leadNote, P: { duty: 0.35, pwm: 0.08, vib: 0.005, cut: 3200, g: 0.4 } },
    chip:      { rel: 0.06, fn: leadNote, P: { duty: 0.25, d: 0.08, s: 0, cut: 4200, g: 0.32 } },
    sawLead:   { rel: 0.14, fn: sawNote, P: { det: 0.004, cut: 2300, cutEnv: 0.8, cutTau: 0.2, vib: 0.006, g: 0.75 } },
    brass:     { rel: 0.1, fn: sawNote, P: { det: 0.003, cut: 1800, cutAtk: 0.05, cutEnv: 0.9, cutTau: 0.18, q: 1.1, scoop: 0.025, vib: 0.005, vd: 0.25, a: 0.02, g: 0.45 } },
    cello:     { rel: 0.25, fn: sawNote, P: { det: 0.0025, a: 0.1, d: 0.6, s: 0.85, cut: 1100, cutEnv: 0.25, cutTau: 0.3, vib: 0.006, vd: 0.2, g: 0.5 } },
    synthBrass:{ rel: 0.15, fn: sawNote, P: { det: 0.006, a: 0.025, cutAtk: 0.07, cut: 1400, cutEnv: 1.0, cutTau: 0.25, q: 1.0, s: 0.75, d: 0.5, g: 0.6 } },
    arpSaw:    { rel: 0.08, fn: sawNote, P: { det: 0.003, a: 0.002, d: 0.14, s: 0.05, cut: 800, cutEnv: 3.2, cutTau: 0.07, q: 1.2, keyTrack: 1.2, g: 0.6 } },
    pluckSynth:{ rel: 0.12, fn: sawNote, P: { det: 0.006, a: 0.002, d: 0.2, s: 0, cut: 1000, cutEnv: 3.6, cutTau: 0.08, q: 1.0, keyTrack: 1.3, g: 0.48 } },
    stabSynth: { rel: 0.08, fn: sawNote, P: { det: 0.007, a: 0.002, d: 0.12, s: 0, cut: 1300, cutEnv: 3, cutTau: 0.05, q: 0.9, g: 0.6 } },
    laser:     { rel: 0.15, fn: laserNote, P: { from: 3, glide: 0.05, tau: 0.12, cut: 2600, g: 0.5 } },
    riser:     { rel: 0.03, gen: 1, fn: riserNote, P: { f0: 300, f1: 3200, q: 1.4, tone: 0.12, oct: 2, g: 0.35 } },
    // Pads (generators)
    pad:       { rel: 0.6, chord: 1, gen: 1, fn: padGen, P: { uni: 2, det: 0.0035, cut: 1700, a: 0.25, g: 0.3 } },
    warmPad:   { rel: 0.8, chord: 1, gen: 1, fn: padGen, P: { wave: 'tri', uni: 2, det: 0.003, cut: 1400, a: 0.4, g: 0.36 } },
    airPad:    { rel: 1.2, chord: 1, gen: 1, fn: padGen, P: { wave: 'tri', uni: 2, det: 0.004, cut: 1500, a: 0.9, lfo: [0.15, 0.25], air: 0.012, g: 0.36 } },
    strings:   { rel: 0.7, chord: 1, gen: 1, fn: padGen, P: { uni: 3, det: 0.0045, cut: 1800, a: 0.35, vib: 0.0035, vr: 5, lfo: [0.2, 0.12], g: 0.3 } },
    supersaw:  { rel: 0.4, chord: 1, gen: 1, fn: padGen, P: { uni: 3, det: 0.007, cut: 2100, a: 0.06, g: 0.27 } },
    choir:     { rel: 0.7, chord: 1, gen: 1, fn: choirGen, P: { a: 0.35, vib: 0.005, g: 0.55 } },
    // Bass
    bass:      { rel: 0.06, fn: bassNote, P: { wave: 'saw', cut: 480, env: 3, envTau: 0.12, sub: 0.45, g: 0.6 } },
    synthBass: { rel: 0.05, fn: bassNote, P: { wave: 'saw', cut: 240, env: 4.5, envTau: 0.08, s: 0.5, d: 0.2, q: 1.25, sub: 0.5, g: 0.6 } },
    slap:      { rel: 0.06, fn: bassNote, P: { wave: 'saw', cut: 380, env: 6.5, envTau: 0.045, q: 1.6, s: 0.45, d: 0.22, sub: 0.45, click: 0.25, g: 0.6 } },
    sub:       { rel: 0.08, fn: subNote, P: { h2: 0.22, g: 0.72 } },
    // Effects
    bloop:     { rel: 0.16, fn: bloopNote, P: { drop: 1, tau: 0.09, g: 0.5 } }
  };

  /** Draw a note with a named instrument: inst('bell', o, t0, hz, dur, vel, { overrides }). */
  function inst(name, o, t0, f, dur, vel, over) {
    const I = INSTR[name];
    if (!I) throw new Error('unknown instrument ' + name);
    const P = Object.assign({ rel: I.rel }, I.P, over || {});
    if (I.gen) drain(I.fn(o, t0, f, dur, vel, P)); else I.fn(o, t0, f, dur, vel, P);
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 3. Drum kit
   * ══════════════════════════════════════════════════════════════════════
   * Each drum renders once per song into its own buffer, then every hit is a
   * scaled copy — far cheaper than synthesising each hit. Cymbals are kept
   * dark: nothing here should sting a sensitive ear.
   */
  const DRUMS = {
    kick(P) {
      const o = new Float32Array(Math.round(0.45 * SR)), f0 = P.f0 || 150, f1 = P.f1 || 48, tau = P.tau || 0.17;
      const pk = Math.exp(-1 / (0.035 * SR)), ak = Math.exp(-1 / (tau * SR)), click = P.click === undefined ? 0.35 : P.click;
      let p = 0, bend = 1, a = 1, lpc = 0;
      for (let i = 0; i < o.length; i++) {
        p += (f1 + (f0 - f1) * bend) / SR; if (p >= 1) p -= 1;
        bend *= pk;
        let v = sn(p) * a;
        if (i < 0.003 * SR) { lpc += 0.4 * (nz() - lpc); v += click * lpc; }
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
      noise(o, 0, 0.1, { type: 'bp', f0: 3800, q: 0.9, a: 0.001, d: 0.04, g: 0.3 });
      return fadeEnd(o);
    },
    /** A dark, dusty snare for the lo-fi kits. */
    snareLo(P) {
      const o = new Float32Array(Math.round(0.3 * SR)), t0 = P.tone || 190;
      tone(o, 0, 0.12, t0 * 1.2, t0, { w: 'sine', a: 0.001, d: 0.05, g: 0.5 });
      noise(o, 0, 0.28, { type: 'bp', f0: P.f || 2000, q: 0.6, a: 0.001, d: P.snap || 0.075, g: 0.8 });
      drain(biquadGen(o, 'lp', P.lp || 4800, 0.7, false));
      return fadeEnd(o);
    },
    /** The big synthwave snare: body, a clap's flams, and a gated "room" that holds then shuts. */
    bigSnare(P) {
      const o = new Float32Array(Math.round(0.42 * SR)), t0 = P.tone || 185;
      tone(o, 0, 0.14, t0 * 1.3, t0, { w: 'sine', a: 0.001, d: 0.05, g: 0.6 });
      noise(o, 0, 0.12, { type: 'hp', f0: 1300, q: 0.7, a: 0.0008, d: 0.06, g: 0.6 });
      for (let k = 0; k < 3; k++) noise(o, k * 0.008, 0.012, { type: 'bp', f0: 1400, q: 1.2, a: 0.0005, d: 0.004, g: 0.4 });
      noise(o, 0.01, 0.26, { type: 'bp', f0: 1900, q: 0.6, a: 0.004, r: 0.05, g: 0.26 });
      drain(biquadGen(o, 'lp', 7000, 0.7, false));
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
      noise(o, 0, o.length / SR, { type: 'hp', f0: P.hp || 6800, q: 0.8, a: 0.0005, d: tau, g: 0.8 });
      noise(o, 0, o.length / SR, { type: 'bp', f0: 8200, q: 1.5, a: 0.0005, d: tau * 0.8, g: 0.3 });
      return fadeEnd(o);
    },
    shaker(P) {
      const o = new Float32Array(Math.round(0.12 * SR));
      noise(o, 0, 0.11, { type: 'bp', f0: P.f || 5600, q: 1.1, a: 0.012, d: 0.035, g: 0.8 });
      return fadeEnd(o);
    },
    tamb(P) {
      const o = new Float32Array(Math.round(0.3 * SR));
      noise(o, 0, 0.28, { type: 'bp', f0: 6400, q: 2.2, a: 0.002, d: 0.08, g: 0.8, am: [28, 0.5] });
      [5100, 6320, 7450].forEach((f) => tone(o, 0, 0.2, f, f, { w: 'sine', a: 0.001, d: 0.05, g: 0.1 }));
      return fadeEnd(o);
    },
    crash(P) {
      const o = new Float32Array(Math.round(1.6 * SR));
      noise(o, 0, 1.6, { type: 'hp', f0: 2800, q: 0.6, a: 0.002, d: P.tau || 0.55, g: 0.7 });
      noise(o, 0, 1.2, { type: 'bp', f0: 4800, q: 1.2, a: 0.002, d: 0.35, g: 0.35 });
      [333, 478, 587, 741, 902].forEach((f, k) => tone(o, 0, 0.8, f * 3.1, f * 3.1, { w: 'sq', a: 0.001, d: 0.25 + k * 0.05, g: 0.025, lp: 6000 }));
      drain(highpassGen(o, 900, false));
      drain(biquadGen(o, 'lp', 7500, 0.7, false));
      return fadeEnd(o);
    },
    ride(P) {
      const o = new Float32Array(Math.round(0.9 * SR));
      noise(o, 0, 0.9, { type: 'hp', f0: 5000, q: 0.8, a: 0.001, d: 0.28, g: 0.3 });
      [3130, 4410, 5270].forEach((f) => tone(o, 0, 0.8, f, f, { w: 'sine', a: 0.001, d: 0.3, g: 0.13 }));
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
    rim(P) {
      const o = new Float32Array(Math.round(0.08 * SR));
      noise(o, 0, 0.06, { type: 'bp', f0: 1700, q: 6, a: 0.0005, d: 0.012, g: 1.1 });
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
      for (let k = 0; k < 6; k++) noise(o, r() * 0.06, 0.12, { type: 'bp', f0: 5600 + r() * 2000, q: 5, a: 0.001, d: 0.03, g: 0.5 });
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
      noise(o, 0, 0.24, { type: 'bp', f0: 3400, q: 0.8, a: 0.015, d: 0.07, g: 0.7 });
      return fadeEnd(o);
    },
    /** A slow brush sweep across the head. */
    swish(P) {
      const o = new Float32Array(Math.round(0.5 * SR));
      noise(o, 0, 0.48, { type: 'bp', f0: 2400, f1: 3400, q: 0.6, a: 0.12, r: 0.25, g: 0.6, color: 'pink' });
      return fadeEnd(o);
    },
    /** Samba surdo: a deep, open bass drum. */
    surdo(P) {
      const f = P.f || 72, o = new Float32Array(Math.round(0.6 * SR));
      tone(o, 0, 0.56, f * 1.25, f, { w: 'sine', a: 0.002, d: 0.22, g: 0.9 });
      noise(o, 0, 0.02, { type: 'lp', f0: 900, q: 0.7, d: 0.006, g: 0.25 });
      return fadeEnd(o);
    },
    agogo(P) {
      const f = P.f || 800, o = new Float32Array(Math.round(0.3 * SR));
      tone(o, 0, 0.26, f, f, { w: 'sine', a: 0.0008, d: 0.09, g: 0.6 });
      tone(o, 0, 0.15, f * 2.6, f * 2.6, { w: 'sine', a: 0.0008, d: 0.03, g: 0.16 });
      return fadeEnd(o);
    },
    tamborim(P) {
      const o = new Float32Array(Math.round(0.12 * SR));
      tone(o, 0, 0.1, 640, 560, { w: 'sine', a: 0.0005, d: 0.025, g: 0.7 });
      noise(o, 0, 0.05, { type: 'bp', f0: 3000, q: 1.2, d: 0.012, g: 0.3 });
      return fadeEnd(o);
    },
    caixa(P) {
      const o = new Float32Array(Math.round(0.2 * SR));
      tone(o, 0, 0.08, 280, 240, { w: 'sine', a: 0.0008, d: 0.025, g: 0.3 });
      noise(o, 0, 0.18, { type: 'hp', f0: 2200, q: 0.7, a: 0.0008, d: 0.045, g: 0.5 });
      return fadeEnd(o);
    },
    /** A deep sub "boom" for big downbeats. */
    boom(P) {
      const o = new Float32Array(Math.round(1.0 * SR));
      tone(o, 0, 0.95, P.f0 || 70, P.f1 || 30, { w: 'sine', a: 0.003, d: 0.35, g: 0.9 });
      noise(o, 0, 0.3, { type: 'lp', f0: 300, q: 0.7, d: 0.1, g: 0.3, color: 'brown' });
      return fadeEnd(o);
    }
  };

  function fadeEnd(o) {
    const f = Math.min(o.length, Math.round(0.004 * SR));
    for (let i = 0; i < f; i++) o[o.length - 1 - i] *= i / f;
    return o;
  }

  /* Drum kits: voice char → [drum, params, gain, pan, reverb send]. */
  const KITS = {
    soft: {
      k: ['kick', { f0: 120, f1: 50, tau: 0.16, click: 0.15 }, 0.7, 0, 0], s: ['snareLo', {}, 0.36, 0.05, 0.2],
      r: ['rim', {}, 0.22, -0.1, 0.12], h: ['hat', { tau: 0.028, hp: 6500 }, 0.12, 0.3, 0], o: ['hat', { tau: 0.14, hp: 6000 }, 0.1, 0.3, 0.05],
      S: ['shaker', {}, 0.15, -0.3, 0], m: ['tamb', {}, 0.1, 0.35, 0.05], x: ['crash', { tau: 0.5 }, 0.18, -0.25, 0.12],
      t: ['tom', { f: 150 }, 0.32, 0.3, 0.15], u: ['tom', { f: 105 }, 0.32, -0.3, 0.15], b: ['brush', {}, 0.3, 0.1, 0.15]
    },
    lofi: {
      k: ['kick', { f0: 105, f1: 46, tau: 0.2, click: 0.06 }, 0.72, 0, 0], s: ['snareLo', { f: 1900, snap: 0.08 }, 0.42, 0.05, 0.14],
      r: ['rim', {}, 0.2, -0.1, 0.1], h: ['hat', { tau: 0.022, hp: 5200 }, 0.13, 0.25, 0], o: ['hat', { tau: 0.12, hp: 5000 }, 0.09, 0.25, 0.03],
      S: ['shaker', { f: 5000 }, 0.12, -0.3, 0], n: ['snap', {}, 0.2, -0.2, 0.2], b: ['brush', {}, 0.26, 0.1, 0.12]
    },
    brushes: {
      k: ['kick', { f0: 100, f1: 48, tau: 0.18, click: 0.04 }, 0.6, 0, 0], b: ['brush', {}, 0.34, 0.1, 0.14],
      w: ['swish', {}, 0.22, -0.15, 0.12], r: ['ride', {}, 0.12, 0.3, 0.05], t: ['tom', { f: 140 }, 0.28, 0.3, 0.2],
      u: ['tom', { f: 98 }, 0.28, -0.3, 0.2], S: ['shaker', { f: 4800 }, 0.1, -0.3, 0], l: ['sleigh', {}, 0.07, 0.4, 0.1]
    },
    pop: {
      k: ['kick', { f0: 150, f1: 48, tau: 0.17 }, 0.85, 0, 0], s: ['snare', { tone: 190 }, 0.5, 0.05, 0.14],
      c: ['clap', {}, 0.42, -0.05, 0.16], h: ['hat', { tau: 0.03 }, 0.18, 0.3, 0], o: ['hat', { tau: 0.2 }, 0.16, 0.3, 0.04],
      x: ['crash', {}, 0.28, -0.25, 0.1], t: ['tom', { f: 160 }, 0.45, 0.3, 0.1], u: ['tom', { f: 110 }, 0.45, -0.3, 0.1],
      m: ['tamb', {}, 0.14, 0.4, 0.05], S: ['shaker', {}, 0.17, -0.35, 0]
    },
    funk: {
      k: ['kick', { f0: 140, f1: 50, tau: 0.15, click: 0.3 }, 0.82, 0, 0], s: ['snare', { tone: 200, snap: 0.08 }, 0.48, 0.05, 0.12],
      c: ['clap', { tail: 0.06 }, 0.4, -0.05, 0.14], h: ['hat', { tau: 0.025 }, 0.16, 0.3, 0], o: ['hat', { tau: 0.16 }, 0.14, 0.3, 0.04],
      S: ['shaker', {}, 0.16, -0.35, 0], m: ['tamb', {}, 0.13, 0.4, 0.05], q: ['conga', { f: 230, tau: 0.11 }, 0.34, -0.3, 0.06],
      w: ['conga', { f: 330, tau: 0.08 }, 0.3, 0.3, 0.06], x: ['crash', {}, 0.26, -0.25, 0.1], t: ['tom', { f: 165 }, 0.42, 0.3, 0.1],
      u: ['tom', { f: 115 }, 0.42, -0.3, 0.1]
    },
    samba: {
      k: ['surdo', {}, 0.8, 0, 0.04], t: ['tamborim', {}, 0.22, 0.35, 0.05], a: ['agogo', { f: 740 }, 0.17, -0.35, 0.08],
      A: ['agogo', { f: 990 }, 0.15, -0.35, 0.08], S: ['shaker', { f: 6000 }, 0.16, 0.25, 0], c: ['clap', {}, 0.32, 0, 0.14],
      s: ['caixa', {}, 0.18, 0.15, 0.08], q: ['conga', { f: 260 }, 0.3, -0.2, 0.06], w: ['conga', { f: 360 }, 0.28, 0.2, 0.06],
      x: ['crash', {}, 0.2, -0.25, 0.1]
    },
    tropical: {
      k: ['kick', { f0: 120, f1: 50, tau: 0.2, click: 0.15 }, 0.75, 0, 0], c: ['clap', { tail: 0.06 }, 0.3, 0, 0.15],
      n: ['snap', {}, 0.24, -0.2, 0.15], S: ['shaker', {}, 0.16, 0.3, 0], h: ['hat', { tau: 0.025 }, 0.12, 0.25, 0],
      o: ['hat', { tau: 0.12 }, 0.1, -0.25, 0.04], q: ['conga', { f: 250 }, 0.32, -0.3, 0.08], w: ['conga', { f: 340 }, 0.3, 0.3, 0.08],
      l: ['wood', { f: 1250 }, 0.14, 0.4, 0.1], x: ['crash', {}, 0.2, -0.25, 0.1], t: ['tom', { f: 160 }, 0.36, 0.3, 0.12],
      u: ['tom', { f: 115 }, 0.36, -0.3, 0.12]
    },
    synthwave: {
      k: ['kick', { f0: 140, f1: 45, tau: 0.26, click: 0.25 }, 0.78, 0, 0], s: ['bigSnare', {}, 0.5, 0, 0.3],
      c: ['clap', { tail: 0.1 }, 0.25, 0, 0.3], h: ['hat', { tau: 0.02, hp: 7000 }, 0.12, 0.3, 0], o: ['hat', { tau: 0.16, hp: 6500 }, 0.1, -0.3, 0.05],
      t: ['tom', { f: 160 }, 0.42, 0.35, 0.25], u: ['tom', { f: 110 }, 0.42, -0.35, 0.25], x: ['crash', { tau: 0.6 }, 0.24, -0.2, 0.15],
      n: ['snare', { tone: 200, snap: 0.06 }, 0.3, 0.1, 0.12]
    },
    hyper: {
      k: ['kick', { f0: 150, f1: 44, tau: 0.24, click: 0.3 }, 0.78, 0, 0], s: ['bigSnare', { tone: 200 }, 0.48, 0, 0.26],
      c: ['clap', { tail: 0.08 }, 0.3, 0, 0.22], h: ['hat', { tau: 0.018, hp: 7200 }, 0.12, 0.3, 0], o: ['hat', { tau: 0.14 }, 0.11, -0.3, 0.04],
      t: ['tom', { f: 170 }, 0.42, 0.35, 0.2], u: ['tom', { f: 115 }, 0.42, -0.35, 0.2], x: ['crash', { tau: 0.6 }, 0.24, -0.2, 0.15],
      n: ['snare', { tone: 210, snap: 0.06 }, 0.3, 0.1, 0.12], B: ['boom', {}, 0.5, 0, 0.2]
    },
    march: {
      T: ['timp', { f: 65.4 }, 0.6, -0.15, 0.2], V: ['timp', { f: 98 }, 0.55, 0.15, 0.2],
      s: ['snare', { tone: 210, snap: 0.08 }, 0.35, 0.2, 0.2], x: ['crash', {}, 0.3, -0.25, 0.15],
      k: ['kick', { f0: 90, f1: 38, tau: 0.4, click: 0.1 }, 0.7, 0, 0.05], B: ['boom', {}, 0.6, 0, 0.2]
    }
  };
  const VEL = { X: 1, x: 0.8, o: 0.45, g: 0.25 };

  /** A kit voice, rendered once per page with its own seed and shared by every song that uses it. */
  const drumCache = new Map();
  function drumBuf(name, P) {
    const key = name + JSON.stringify(P || {});
    let b = drumCache.get(key);
    if (!b) { nzSeed(hashStr('drum:' + key)); b = DRUMS[name](P || {}); drumCache.set(key, b); }
    return b;
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 4. Effect-drawing helpers
   * ══════════════════════════════════════════════════════════════════════ */

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
      if (color === 'pink') {
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

  /** Random crackle: sparse, soft clicks (sparks, grit, electricity). */
  function crackle(o, t0, dur, rate, g, rnd, hpHz) {
    const tmp = new Float32Array(o.length), count = Math.round(rate * dur);
    for (let k = 0; k < count; k++) {
      const t = t0 + rnd() * dur, i = Math.round(t * SR);
      const amp = g * (0.3 + 0.7 * rnd()) * (rnd() < 0.5 ? -1 : 1), len = 8 + Math.floor(rnd() * 30);
      for (let j = 0; j < len && i + j < o.length; j++) tmp[i + j] += amp * Math.exp(-j / (len * 0.3)) * nz();
    }
    drain(biquadGen(tmp, 'hp', hpHz || 1800, 0.7, false));
    for (let i = 0; i < o.length; i++) o[i] += tmp[i];
  }

  /** Add a short plate reverb tail to a mono one-shot. */
  function* verbGen(o, wet, size) {
    const L = new Float32Array(o.length), R = new Float32Array(o.length);
    yield* reverbGen(o, L, R, size || 0.75, 0.35, 1, false);
    for (let i = 0; i < o.length; i++) o[i] += (L[i] + R[i]) * 0.5 * wet;
  }

  /** Mix a freshly rendered drum into an effect at t seconds. */
  function addDrum(o, name, P, t, g) {
    const d = DRUMS[name](P || {}), i0 = Math.round(t * SR);
    for (let i = 0; i < d.length && i0 + i < o.length; i++) o[i0 + i] += d[i] * g;
  }

  /** A coin "tiing" (glockenspiel-like partials, rounded off so a cascade never glares). */
  function coinPing(o, t0, f, g) {
    malletNote(o, t0, f, 0.05, g, { parts: [[1, 1, 0.16], [2.76, 0.38, 0.05], [5.4, 0.1, 0.018]], click: 0.04, rel: 0.45, g: 0.6 });
    malletNote(o, t0 + 0.028, f * 2, 0.05, g * 0.3, { parts: [[1, 1, 0.08]], click: 0, rel: 0.3, g: 0.6 });
  }

  /** Bake a couple of softened echo repeats into a one-shot (the Hyper pegs' "touch of delay"). */
  function bakeEcho(o, d, gains, lpHz) {
    const src = o.slice(), dN = Math.round(d * SR), a = onePoleA(lpHz);
    for (let r = 0; r < gains.length; r++) {
      const off = dN * (r + 1);
      let y = 0;
      for (let i = 0; i + off < o.length; i++) { y += a * (src[i] - y); o[i + off] += y * gains[r]; }
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 5. Sound-effect catalogue
   * ══════════════════════════════════════════════════════════════════════
   * def(name, seconds, level, draw, opts)
   *   level  target loudness in dB (loudest 250 ms). The render is peak
   *          normalised to -1 dBFS for resolution and its play volume is
   *          derived from this, so every effect lands where it was designed
   *          to sit in the mix instead of wherever its waveform happened to.
   *   name   'blast@cozy' is the Cozy variant of 'blast'; 'holdTick:3' is one
   *          step of a parametric sound (play() picks it from opts).
   *   opts.crit  never ducked under speech (menus, hold-to-pause)
   *   opts.verb  [wet, size]: a short plate tail
   *   opts.lim   dB driven into the limiter (denser explosions and impacts)
   *   opts.lp    a final low-pass (keeps fizzy sounds soft)
   * All originals; the loudest moments are punchy rather than harsh.
   */
  const SFX = {};
  function def(name, len, level, draw, opts) {
    const o = opts || {};
    SFX[name] = { name, len, level, draw, crit: !!o.crit, verb: o.verb || null, lim: o.lim || 0, lp: o.lp || 0 };
  }

  /* ── Menus ───────────────────────────────────────────────────────────── */
  def('menuMove', 0.09, -27, (o) => {
    // A soft wooden tick, short enough to sit under the spoken label at any scan speed.
    tone(o, 0, 0.06, 1180, 1120, { w: 'tri', a: 0.0015, d: 0.014, g: 0.8, lp: 3000 });
    tone(o, 0, 0.05, 590, 560, { w: 'sine', a: 0.001, d: 0.018, g: 0.4 });
  }, { crit: 1 });

  def('menuSelect', 0.5, -22, (o) => {
    // Two rising mallet-bell notes: "yes, that one".
    inst('bellSoft', o, 0, midiHz(79), 0.1, 0.75);
    inst('bellSoft', o, 0.07, midiHz(86), 0.2, 0.9);
    inst('marimba', o, 0.07, midiHz(74), 0.1, 0.4);
  }, { crit: 1, verb: [0.1, 0.6], lp: 6000 });

  def('menuBack', 0.42, -24, (o) => {
    // The same colour falling: "back out".
    inst('bellSoft', o, 0, midiHz(84), 0.08, 0.65);
    inst('bellSoft', o, 0.07, midiHz(77), 0.18, 0.75);
  }, { crit: 1, verb: [0.08, 0.55], lp: 6000 });

  def('menuBlocked', 0.28, -25, (o) => {
    // A dull, low double bump: clearly "not available", never harsh.
    tone(o, 0, 0.09, 210, 180, { w: 'tri', a: 0.003, d: 0.04, g: 0.7, lp: 1100 });
    tone(o, 0.11, 0.12, 180, 150, { w: 'tri', a: 0.003, d: 0.05, g: 0.7, lp: 950 });
  }, { crit: 1 });

  def('pauseOpen', 0.6, -23, (o) => {
    // A soft falling air swirl and a low settling chime: the world holds its breath.
    noise(o, 0, 0.45, { type: 'bp', f0: 2400, f1: 500, q: 1.1, a: 0.02, r: 0.2, g: 0.35 });
    inst('bellSoft', o, 0.06, midiHz(76), 0.15, 0.6);
    inst('bellSoft', o, 0.14, midiHz(69), 0.3, 0.7);
  }, { crit: 1, verb: [0.15, 0.7] });

  def('pauseClose', 0.6, -23, (o) => {
    // The swirl rising again and the chime climbing back: off we go.
    noise(o, 0, 0.4, { type: 'bp', f0: 500, f1: 2400, q: 1.1, a: 0.05, r: 0.15, g: 0.35 });
    inst('bellSoft', o, 0.05, midiHz(69), 0.12, 0.6);
    inst('bellSoft', o, 0.13, midiHz(76), 0.3, 0.75);
  }, { crit: 1, verb: [0.15, 0.7] });

  // Hold-to-pause: one soft tick per second held, each a step up a major pentatonic.
  [72, 74, 76, 79, 84].forEach((m, k) => def('holdTick:' + k, 0.2, -22, (o) => {
    inst('marimba', o, 0, midiHz(m), 0.1, 0.9);
    tone(o, 0, 0.14, midiHz(m), midiHz(m), { w: 'sine', a: 0.003, d: 0.06, g: 0.35 });
  }, { crit: 1 }));

  def('toggle', 0.18, -24, (o) => {
    // A small two-part switch: click-clack, the second a little higher.
    tone(o, 0, 0.03, 900, 860, { w: 'tri', a: 0.0008, d: 0.008, g: 0.7, lp: 3200 });
    noise(o, 0, 0.012, { type: 'bp', f0: 2600, q: 1.5, d: 0.004, g: 0.25 });
    tone(o, 0.055, 0.04, 1350, 1300, { w: 'tri', a: 0.0008, d: 0.01, g: 0.7, lp: 3600 });
    noise(o, 0.055, 0.012, { type: 'bp', f0: 3000, q: 1.5, d: 0.004, g: 0.25 });
  }, { crit: 1 });

  /* ── Aim and launch ──────────────────────────────────────────────────── */
  def('aimTick', 0.05, -33, (o) => {
    // Barely there: a felt-soft tick, low enough never to tire the ear at slow aim speeds.
    tone(o, 0, 0.035, 1400, 1320, { w: 'sine', a: 0.0015, d: 0.006, g: 0.6 });
    noise(o, 0, 0.01, { type: 'bp', f0: 2000, q: 1.2, d: 0.003, g: 0.12 });
  });

  def('launch', 0.7, -19, (o) => {
    // Cannon: a round thump, a puff of air, and the whoosh of the ball leaving.
    tone(o, 0, 0.22, 130, 48, { w: 'sine', a: 0.001, d: 0.07, g: 0.9 });
    tone(o, 0, 0.06, 260, 140, { w: 'tri', a: 0.001, d: 0.02, g: 0.25 });
    noise(o, 0, 0.08, { type: 'lp', f0: 900, q: 0.7, a: 0.001, d: 0.025, g: 0.5 });
    noise(o, 0.015, 0.55, { type: 'bp', f0: 1500, f1: 450, q: 1.0, a: 0.02, r: 0.25, g: 0.4 });
  });
  def('launch@cozy', 0.7, -21, (o) => {
    // Cozy: a softer "fwump", more air than bang.
    tone(o, 0, 0.2, 110, 50, { w: 'sine', a: 0.004, d: 0.07, g: 0.75 });
    noise(o, 0, 0.6, { type: 'bp', f0: 1100, f1: 380, q: 0.9, a: 0.02, r: 0.3, g: 0.45 });
  });

  def('spray', 0.85, -18, (o) => {
    // Spray shot: three quick launches fanning out, each a touch higher.
    [0, 0.06, 0.12].forEach((t, k) => {
      tone(o, t, 0.18, 140 + 18 * k, 55, { w: 'sine', a: 0.001, d: 0.06, g: 0.7 });
      noise(o, t, 0.06, { type: 'lp', f0: 900, q: 0.7, d: 0.02, g: 0.35 });
      noise(o, t + 0.01, 0.4, { type: 'bp', f0: 1500 + 250 * k, f1: 500, q: 1.1, a: 0.015, r: 0.2, g: 0.28 });
    });
    [79, 83, 86].forEach((m, k) => inst('bellSoft', o, 0.05 + k * 0.06, midiHz(m), 0.06, 0.35));
  });

  /* ── Pegs and the board ──────────────────────────────────────────────── */
  // The clearing sequence after a shot: soft bubbly pops, a little higher each time.
  for (let k = 0; k < 12; k++) {
    const st = Math.pow(2, k / 12);
    def('pop:' + k, 0.16, -25 + 0.1 * k, (o) => {
      tone(o, 0, 0.09, 430 * st, 860 * st, { w: 'sine', a: 0.002, d: 0.028, g: 0.75 });
      tone(o, 0.004, 0.06, 860 * st, 1400 * st, { w: 'sine', a: 0.002, d: 0.014, g: 0.16 });
      noise(o, 0, 0.012, { type: 'bp', f0: 1600 * Math.sqrt(st), q: 1.2, d: 0.003, g: 0.1 });
    });
    def('pop:' + k + '@cozy', 0.18, -27 + 0.1 * k, (o) => {
      tone(o, 0, 0.12, 330 * st, 600 * st, { w: 'sine', a: 0.004, d: 0.035, g: 0.75 });
    });
    def('pop:' + k + '@hyper', 0.24, -25 + 0.1 * k, (o) => {
      // Hyper: a tiny synth blip with an echo.
      tone(o, 0, 0.06, 560 * st, 1120 * st, { w: 'tri', a: 0.001, d: 0.02, g: 0.55, lp: 3000 });
      tone(o, 0.11, 0.05, 560 * st, 1120 * st, { w: 'tri', a: 0.001, d: 0.018, g: 0.16, lp: 2200 });
    });
  }

  def('relight', 0.12, -30, (o) => {
    // A lit peg touched again: a tiny glassy tick, no note (the chain did not move).
    tone(o, 0, 0.06, 1900, 1820, { w: 'sine', a: 0.001, d: 0.012, g: 0.5 });
    tone(o, 0, 0.05, 950, 910, { w: 'sine', a: 0.001, d: 0.015, g: 0.35 });
  });

  def('lantern', 1.3, -21, (o) => {
    // A paper lantern catches: a soft breath of flame, then a warm chime chord.
    noise(o, 0, 0.5, { type: 'bp', f0: 300, f1: 1400, q: 0.9, a: 0.06, r: 0.25, g: 0.4, color: 'pink' });
    noise(o, 0.02, 0.35, { type: 'lp', f0: 600, q: 0.7, a: 0.04, d: 0.15, g: 0.35, color: 'brown' });
    [72, 76, 79, 83].forEach((m, k) => inst('bellSoft', o, 0.08 + k * 0.045, midiHz(m), 0.3, 0.5 - 0.04 * k));
  }, { verb: [0.2, 0.75] });

  def('gem', 1.0, -21, (o) => {
    // A gem: a quick sparkling run up and a soft shimmer, bright but never sharp.
    [0, 4, 7, 11, 14].forEach((d, k) => inst('glock', o, k * 0.035, midiHz(79 + d), 0.08, 0.4 + 0.05 * k, { tau: 0.35 }));
    inst('bellSoft', o, 0.17, midiHz(91), 0.3, 0.5);
    noise(o, 0.1, 0.7, { type: 'bp', f0: 4600, q: 1.5, a: 0.08, r: 0.3, g: 0.05, am: [22, 0.8] });
  }, { verb: [0.2, 0.75], lp: 7000 });

  def('bumper', 0.5, -21, (o) => {
    // A springy bumper: a rubbery thump and a playful "boing" that wobbles down.
    tone(o, 0, 0.1, 190, 110, { w: 'sine', a: 0.001, d: 0.035, g: 0.7 });
    tone(o, 0.005, 0.42, 520, 330, { w: 'sine', a: 0.004, r: 0.12, g: 0.5, vib: [14, 0.06], d: 0.16 });
    tone(o, 0.005, 0.3, 1040, 660, { w: 'tri', a: 0.004, r: 0.1, g: 0.12, vib: [14, 0.06], d: 0.1, lp: 2400 });
  });

  // Steel posts and walls: three strengths each; play() picks one from opts.speed and scales its volume.
  [0, 1, 2].forEach((k) => def('clank:' + k, 0.25 + 0.12 * k, -24 + k, (o) => {
    const f = 1250 + 120 * k, br = [0.35, 0.6, 0.85][k];
    malletNote(o, 0, f, 0.05, 1, { parts: [[1, 1, 0.06 + 0.04 * k], [2.76, 0.5 * br, 0.03 + 0.015 * k], [5.4, 0.18 * br, 0.012 + 0.006 * k]], click: 0.1 + 0.08 * k, rel: 0.4, g: 0.6 });
    tone(o, 0, 0.05, 330, 260, { w: 'sine', a: 0.001, d: 0.015, g: 0.25 });
  }));

  [0, 1, 2].forEach((k) => def('wall:' + k, 0.16, -26 + k, (o) => {
    // A soft wooden tock against the side wall.
    tone(o, 0, 0.1, 380 + 40 * k, 340 + 30 * k, { w: 'tri', a: 0.001, d: 0.022 + 0.006 * k, g: 0.6, lp: 1600 + 600 * k });
    tone(o, 0, 0.09, 160, 120, { w: 'sine', a: 0.001, d: 0.03, g: 0.45 });
    noise(o, 0, 0.02, { type: 'lp', f0: 1800 + 700 * k, q: 0.7, d: 0.005, g: 0.2 + 0.08 * k });
  }));

  def('crack', 0.32, -22, (o, r) => {
    // A brick takes a hit: a dry crack and a few grains falling away.
    noise(o, 0, 0.05, { type: 'bp', f0: 1600, q: 0.9, a: 0.0005, d: 0.012, g: 0.7 });
    tone(o, 0, 0.08, 280, 180, { w: 'tri', a: 0.0008, d: 0.025, g: 0.5, lp: 1400 });
    crackle(o, 0.02, 0.2, 60, 0.25, r, 1200);
  }, { lp: 6000 });

  def('brickBreak', 0.75, -20, (o, r) => {
    // The brick gives way: a solid thump, a crunchy crumble, rubble settling.
    tone(o, 0, 0.16, 150, 70, { w: 'sine', a: 0.001, d: 0.05, g: 0.8 });
    noise(o, 0, 0.09, { type: 'bp', f0: 1200, q: 0.8, a: 0.0005, d: 0.025, g: 0.6 });
    noise(o, 0.02, 0.55, { type: 'lp', f0: 2000, f1: 500, q: 0.8, a: 0.005, d: 0.16, g: 0.45, am: [26, 0.6] });
    crackle(o, 0.03, 0.55, 90, 0.35, r, 900);
    for (let k = 0; k < 5; k++) { const t = 0.06 + r() * 0.4, f = 500 + r() * 500; tone(o, t, 0.05, f, f * 0.85, { w: 'tri', a: 0.0008, d: 0.012, g: 0.18, lp: 2000 }); }
  }, { lp: 6000 });

  def('glass', 0.8, -22, (o, r) => {
    // Glass: a gentle shatter — a soft "tink" and a shower of small, rounded chimes.
    tone(o, 0, 0.12, 2300, 2200, { w: 'sine', a: 0.0008, d: 0.03, g: 0.5 });
    noise(o, 0, 0.35, { type: 'hp', f0: 2500, q: 0.7, a: 0.001, d: 0.08, g: 0.16 });
    for (let k = 0; k < 14; k++) {
      const t = 0.01 + r() * 0.4, f = 1500 + r() * 2000;
      tone(o, t, 0.12, f, f * 0.98, { w: 'sine', a: 0.0008, d: 0.03 + r() * 0.03, g: 0.12 + r() * 0.08 });
    }
  }, { verb: [0.15, 0.6], lp: 5500 });

  def('armor', 0.5, -21, (o) => {
    // Armour: a dull, heavy clank — the ball bounces off without a mark.
    malletNote(o, 0, 185, 0.1, 1, { parts: [[1, 1, 0.12], [1.52, 0.6, 0.09], [2.31, 0.35, 0.05], [3.6, 0.15, 0.03]], click: 0.2, clickLp: 1500, rel: 0.4, g: 0.55 });
    tone(o, 0, 0.12, 110, 70, { w: 'sine', a: 0.001, d: 0.04, g: 0.6 });
    noise(o, 0, 0.05, { type: 'lp', f0: 1200, q: 0.7, d: 0.015, g: 0.35 });
  });

  def('gate', 1.4, -20, (o) => {
    // A gate opens: a key-turn click-clunk, a magical upward harp shimmer, the bars dissolving into air.
    noise(o, 0, 0.02, { type: 'bp', f0: 2400, q: 2, d: 0.005, g: 0.4 });
    tone(o, 0.05, 0.1, 240, 160, { w: 'tri', a: 0.001, d: 0.03, g: 0.5, lp: 1200 });
    [0, 2, 4, 7, 9, 12, 14, 16].forEach((d, k) => inst('harp', o, 0.12 + k * 0.045, midiHz(67 + d), 0.2, 0.45 + 0.03 * k));
    noise(o, 0.2, 1.1, { type: 'bp', f0: 900, f1: 3800, q: 1.2, a: 0.25, r: 0.5, g: 0.16 });
    inst('bellSoft', o, 0.5, midiHz(91), 0.4, 0.4);
  }, { verb: [0.25, 0.8] });

  def('key', 0.8, -21, (o, r) => {
    // A key: a little jingle of rings and a bright two-note chime.
    for (let k = 0; k < 5; k++) { const t = r() * 0.08; noise(o, t, 0.08, { type: 'bp', f0: 2600 + r() * 1200, q: 6, a: 0.001, d: 0.02, g: 0.16 }); }
    inst('bellSoft', o, 0.06, midiHz(79), 0.1, 0.6);
    inst('bellSoft', o, 0.15, midiHz(86), 0.3, 0.7);
  }, { verb: [0.15, 0.7], lp: 5500 });

  def('portal', 0.9, -21, (o) => {
    // Through a portal: a swirling whoosh that rises and lands, with a glassy phase-tone.
    noise(o, 0, 0.8, { type: 'bp', f0: 400, f1: 2600, q: 2.2, a: 0.08, r: 0.35, g: 0.5, am: [9, 0.5] });
    tone(o, 0, 0.75, 300, 900, { w: 'sine', a: 0.05, r: 0.3, g: 0.28, vib: [9, 0.05] });
    tone(o, 0, 0.75, 450, 1350, { w: 'sine', a: 0.05, r: 0.3, g: 0.12, vib: [9, 0.05] });
  }, { verb: [0.2, 0.7] });

  def('plate', 0.35, -22, (o) => {
    // The base plate: a springy "bwoing" with a light wooden clack.
    tone(o, 0, 0.3, 300, 220, { w: 'sine', a: 0.002, d: 0.1, g: 0.6, vib: [18, 0.05] });
    tone(o, 0, 0.05, 700, 640, { w: 'tri', a: 0.0008, d: 0.012, g: 0.35, lp: 2200 });
    tone(o, 0, 0.12, 130, 90, { w: 'sine', a: 0.001, d: 0.035, g: 0.5 });
  });

  def('catch', 1.0, -19, (o) => {
    // Caught! a soft bucket thump, then a rising "free ball" chime.
    tone(o, 0, 0.14, 160, 80, { w: 'sine', a: 0.001, d: 0.045, g: 0.7 });
    noise(o, 0, 0.06, { type: 'lp', f0: 1000, q: 0.7, d: 0.02, g: 0.35 });
    [72, 76, 79, 84].forEach((m, k) => inst('marimba', o, 0.08 + k * 0.07, midiHz(m), 0.1, 0.65 + 0.07 * k));
    inst('bellSoft', o, 0.29, midiHz(88), 0.4, 0.55);
  }, { verb: [0.15, 0.7] });

  def('freeBall', 1.1, -19, (o) => {
    // One-up: a bright little hop up and back, landing on a held chord.
    [[0, 76], [0.08, 81], [0.16, 84], [0.24, 83], [0.32, 88]].forEach(([t, m], k) => inst('bell', o, t, midiHz(m), 0.08, 0.55 + 0.05 * k, { ix: 1.3, tau: 0.4 }));
    [76, 80, 83].forEach((m) => inst('marimba', o, 0.32, midiHz(m), 0.2, 0.4));
  }, { verb: [0.18, 0.75], lp: 6000 });

  def('drain', 0.7, -24, (o) => {
    // A ball leaves the board: a soft whoosh falling away.
    noise(o, 0, 0.6, { type: 'bp', f0: 1500, f1: 300, q: 1, a: 0.03, r: 0.3, g: 0.45 });
    tone(o, 0, 0.55, 420, 150, { w: 'sine', a: 0.02, r: 0.25, g: 0.25 });
  });

  def('net', 0.45, -23, (o) => {
    // Safety net: a soft, stretchy "thwump" and a creak of rope.
    tone(o, 0, 0.3, 120, 200, { w: 'sine', a: 0.005, d: 0.1, g: 0.65 });
    tone(o, 0.02, 0.25, 240, 400, { w: 'tri', a: 0.01, d: 0.08, g: 0.15, lp: 1500 });
    noise(o, 0.03, 0.2, { type: 'bp', f0: 900, f1: 1300, q: 3, a: 0.02, r: 0.08, g: 0.15, am: [40, 0.6] });
  });

  /* ── Powers ──────────────────────────────────────────────────────────── */
  def('multiball', 1.0, -19, (o) => {
    // Multiball: one ping splits into three that scatter upward.
    inst('bell', o, 0, midiHz(76), 0.08, 0.7, { ix: 1.3, tau: 0.35 });
    [[0.09, 79], [0.12, 84], [0.15, 88]].forEach(([t, m]) => inst('bell', o, t, midiHz(m), 0.1, 0.5, { ix: 1.3, tau: 0.4 }));
    noise(o, 0.05, 0.45, { type: 'bp', f0: 800, f1: 3000, q: 1.2, a: 0.03, r: 0.2, g: 0.25 });
    tone(o, 0.05, 0.4, 200, 600, { w: 'tri', a: 0.02, r: 0.15, g: 0.15, lp: 1600 });
  }, { verb: [0.18, 0.7], lp: 6000 });

  def('extra', 1.1, -19, (o) => {
    // Extra ball: a cheerful climb to a held major chord.
    [72, 76, 79, 84].forEach((m, k) => inst('marimba', o, k * 0.06, midiHz(m), 0.08, 0.7 + 0.06 * k));
    [84, 88, 91].forEach((m, k) => inst('bellSoft', o, 0.26 + k * 0.02, midiHz(m), 0.5, 0.5));
  }, { verb: [0.2, 0.75] });

  def('multiplier', 1.0, -19, (o) => {
    // Double points: two bold rising brass hits, the second an octave up.
    inst('brass', o, 0, midiHz(67), 0.12, 0.8); inst('brass', o, 0, midiHz(71), 0.12, 0.6);
    inst('brass', o, 0.16, midiHz(79), 0.4, 0.9); inst('brass', o, 0.16, midiHz(74), 0.4, 0.6);
    noise(o, 0.12, 0.5, { type: 'bp', f0: 1200, f1: 3400, q: 1.2, a: 0.04, r: 0.25, g: 0.12 });
  }, { verb: [0.15, 0.7] });

  def('zap', 0.9, -20, (o, r) => {
    // Lightning: a soft electric crackle racing across with a falling zap tone — fizzy, never sharp.
    crackle(o, 0, 0.6, 110, 0.4, r, 1500);
    tone(o, 0, 0.45, 1700, 260, { w: 'saw', a: 0.002, d: 0.14, g: 0.22, lp: 2600 });
    noise(o, 0, 0.7, { type: 'bp', f0: 2600, f1: 1400, q: 1.5, a: 0.005, d: 0.2, g: 0.25, am: [45, 0.7] });
    tone(o, 0, 0.6, 90, 55, { w: 'sine', a: 0.005, d: 0.2, g: 0.35 });
  }, { lim: 2, lp: 5200 });
  def('zap@cozy', 0.9, -22, (o, r) => {
    // Cozy lightning: a soft fizz and a twinkle that hops from peg to peg.
    crackle(o, 0, 0.45, 45, 0.22, r, 1500);
    noise(o, 0, 0.5, { type: 'bp', f0: 2200, f1: 1200, q: 1.2, a: 0.01, d: 0.15, g: 0.2, am: [30, 0.6] });
    [79, 84, 88, 83, 86, 91].forEach((m, k) => inst('bellSoft', o, 0.04 + k * 0.06, midiHz(m), 0.06, 0.35));
  }, { lp: 4500, verb: [0.15, 0.7] });

  def('powerSaved', 1.1, -22, (o) => {
    // A power tucked away for next shot: a shimmering upward tremolo and a soft "ready" chime.
    [0, 4, 7, 12, 7, 12, 16, 19].forEach((d, k) => inst('glock', o, k * 0.05, midiHz(79 + d), 0.06, 0.25 + 0.04 * k, { tau: 0.25 }));
    noise(o, 0, 0.9, { type: 'bp', f0: 2500, f1: 4500, q: 1.5, a: 0.2, r: 0.4, g: 0.05, am: [16, 0.8] });
    inst('bellSoft', o, 0.42, midiHz(84), 0.4, 0.5);
  }, { verb: [0.22, 0.8], lp: 7000 });

  def('blast', 1.4, -17, (o, r) => {
    // Blast ball: a punchy boom with a short, clean crack on top and a little debris.
    noise(o, 0, 0.06, { type: 'bp', f0: 1500, q: 0.7, a: 0.0005, d: 0.02, g: 0.55 });
    noise(o, 0, 1.2, { type: 'lp', f0: 2400, f1: 160, q: 0.8, a: 0.002, d: 0.28, g: 0.85 });
    tone(o, 0, 0.9, 80, 34, { w: 'sine', a: 0.002, d: 0.3, g: 0.95 });
    crackle(o, 0.06, 0.8, 35, 0.22, r, 1200);
  }, { lim: 3, lp: 6000 });
  def('blast@cozy', 1.2, -20, (o) => {
    // Cozy blast: a round, padded "fwoomp" with a sprinkle of sparkles.
    tone(o, 0, 0.7, 120, 45, { w: 'sine', a: 0.006, d: 0.22, g: 0.8 });
    noise(o, 0, 0.9, { type: 'lp', f0: 1400, f1: 200, q: 0.7, a: 0.01, d: 0.22, g: 0.6, color: 'pink' });
    [84, 88, 91, 96].forEach((m, k) => inst('bellSoft', o, 0.12 + k * 0.05, midiHz(m), 0.2, 0.3));
  }, { lim: 1, lp: 5000, verb: [0.15, 0.7] });

  def('fire', 1.0, -20, (o, r) => {
    // Fireball: a whooshing ignition and a warm crackling roar.
    noise(o, 0, 0.75, { type: 'bp', f0: 300, f1: 1800, q: 0.9, a: 0.03, r: 0.3, g: 0.6, color: 'pink' });
    noise(o, 0, 0.9, { type: 'lp', f0: 400, f1: 900, q: 0.7, a: 0.02, d: 0.35, g: 0.4, color: 'brown' });
    crackle(o, 0.05, 0.8, 70, 0.3, r, 1800);
    tone(o, 0, 0.5, 110, 220, { w: 'saw', a: 0.02, r: 0.2, g: 0.1, lp: 900 });
  }, { lp: 5500 });

  def('guide', 0.9, -22, (o) => {
    // Super guide: a gentle sparkle trail that drifts upward.
    [79, 83, 86, 91, 88].forEach((m, k) => inst('glock', o, k * 0.06, midiHz(m), 0.06, 0.3 + 0.05 * k, { tau: 0.3 }));
    noise(o, 0, 0.7, { type: 'bp', f0: 3000, f1: 4400, q: 1.6, a: 0.1, r: 0.3, g: 0.05, am: [20, 0.8] });
  }, { verb: [0.22, 0.8], lp: 7000 });

  /* ── Hazards ─────────────────────────────────────────────────────────── */
  def('thief', 0.85, -21, (o) => {
    // Thief: a quick swipe, then a sly tiptoe of two low plucks — "got one".
    noise(o, 0, 0.22, { type: 'bp', f0: 700, f1: 3000, q: 1.3, a: 0.01, r: 0.08, g: 0.45 });
    inst('pizz', o, 0.2, midiHz(51), 0.08, 0.8);
    inst('pizz', o, 0.36, midiHz(50), 0.12, 0.85);
    tone(o, 0.36, 0.3, midiHz(62), midiHz(62), { w: 'tri', a: 0.004, d: 0.1, g: 0.08, lp: 900 });
  });
  def('thief@cozy', 0.8, -23, (o) => {
    // Cozy thief: a feather-light swipe and a shrugging kalimba "oh well".
    noise(o, 0, 0.25, { type: 'bp', f0: 600, f1: 2200, q: 1, a: 0.03, r: 0.1, g: 0.35 });
    inst('kalimba', o, 0.18, midiHz(69), 0.1, 0.7);
    inst('kalimba', o, 0.32, midiHz(65), 0.2, 0.65);
  }, { verb: [0.15, 0.7] });

  def('shrink', 0.95, -21, (o) => {
    // Shrinker: a wobbling "pew-wooo" falling away.
    tone(o, 0, 0.85, 1100, 180, { w: 'sine', a: 0.005, r: 0.2, g: 0.5, vib: [9, 0.1] });
    tone(o, 0, 0.85, 1650, 270, { w: 'tri', a: 0.005, r: 0.2, g: 0.12, vib: [9, 0.1], lp: 2500 });
  }, { verb: [0.15, 0.6] });

  def('sludge', 0.7, -22, (o) => {
    // Sludge: a thick squelch and a couple of lazy bubbles.
    noise(o, 0, 0.35, { type: 'bp', f0: 900, f1: 220, q: 4, a: 0.01, d: 0.12, g: 0.7, color: 'pink' });
    tone(o, 0, 0.25, 260, 90, { w: 'sine', a: 0.004, d: 0.08, g: 0.45, vib: [24, 0.12] });
    inst('bloop', o, 0.28, 330, 0.05, 0.5, { drop: 0.6, tau: 0.06 });
    inst('bloop', o, 0.42, 260, 0.05, 0.4, { drop: 0.6, tau: 0.07 });
  });

  def('spike', 0.6, -20, (o) => {
    // Spike: the ball pops — a short burst, a low thud, a little deflating whistle.
    noise(o, 0, 0.07, { type: 'hp', f0: 1500, q: 0.7, a: 0.0005, d: 0.018, g: 0.6 });
    noise(o, 0, 0.2, { type: 'lp', f0: 1600, f1: 300, q: 0.8, a: 0.001, d: 0.05, g: 0.45 });
    tone(o, 0, 0.25, 140, 60, { w: 'sine', a: 0.001, d: 0.08, g: 0.75 });
    tone(o, 0.05, 0.35, 600, 200, { w: 'sine', a: 0.01, r: 0.15, g: 0.15 });
  }, { lim: 1.5, lp: 6000 });
  def('spike@cozy', 0.5, -23, (o) => {
    // Cozy pop: a soft "pff" and a little boop down — no bang.
    noise(o, 0, 0.18, { type: 'lp', f0: 1400, f1: 400, q: 0.7, a: 0.002, d: 0.05, g: 0.5, color: 'pink' });
    tone(o, 0.03, 0.3, 500, 220, { w: 'sine', a: 0.01, r: 0.12, g: 0.35 });
  });

  def('hole', 1.3, -21, (o) => {
    // Black hole: a swirling suck that spirals down into a deep hum.
    noise(o, 0, 1.2, { type: 'bp', f0: 2400, f1: 200, q: 2, a: 0.1, r: 0.3, g: 0.45, am: [7, 0.7] });
    tone(o, 0, 1.2, 700, 70, { w: 'sine', a: 0.05, r: 0.3, g: 0.4, vib: [7, 0.06] });
    tone(o, 0.4, 0.85, 55, 40, { w: 'sine', a: 0.2, r: 0.3, g: 0.45 });
  }, { verb: [0.15, 0.6] });

  /* ── Flow: fever, the final approach, the payoff ─────────────────────── */
  // Fever 2x / 3x / 5x: a rising sweep into a chord, each level longer, brighter and a step higher.
  [2, 3, 5].forEach((lv, k) => {
    const up = 0.65 + 0.25 * k;
    def('fever:' + lv, up + 0.75, -21 + k, (o) => {
      noise(o, 0, up, { type: 'bp', f0: 350, f1: 2400 + 500 * k, q: 1.2, a: up * 0.6, r: 0.08, g: 0.4 });
      tone(o, 0, up, 160 + 20 * k, 640 + 160 * k, { w: 'saw', a: up * 0.5, r: 0.06, g: 0.14, lp: 1500 + 400 * k });
      const chord = [[72, 76, 79], [72, 76, 79, 84], [72, 76, 79, 84, 88]][k];
      chord.forEach((m) => inst(k === 2 ? 'brass' : 'bellSoft', o, up, midiHz(m + 2 * k), 0.4, 0.5));
      if (k === 2) addDrum(o, 'crash', { tau: 0.5 }, up, 0.22);
    }, { verb: [0.18, 0.75] });
  });

  def('finalApproach', 1.7, -19, (o) => {
    // Final approach: a snare roll that swells under a rising tension tone. The game may cut it short.
    for (let k = 0; k < 26; k++) addDrum(o, 'snare', { tone: 200, snap: 0.05 }, k * 0.058, 0.07 + 0.022 * k);
    tone(o, 0, 1.6, 150, 600, { w: 'saw', a: 1.2, r: 0.1, g: 0.14, lp: 1400 });
    tone(o, 0, 1.6, 300, 1200, { w: 'sine', a: 1.2, r: 0.1, g: 0.1 });
    noise(o, 0, 1.6, { type: 'bp', f0: 400, f1: 2800, q: 1.2, a: 1.3, r: 0.1, g: 0.16 });
    addDrum(o, 'timp', { f: 73.4 }, 0, 0.35);
  }, { lp: 5000 });

  def('goalMet', 1.8, -16, (o) => {
    // Goal met: a big, clean impact — a deep boom, a bright major chord hit and a cymbal bloom.
    tone(o, 0, 1.2, 90, 38, { w: 'sine', a: 0.002, d: 0.35, g: 0.9 });
    addDrum(o, 'kick', { f0: 140, f1: 45, tau: 0.3, click: 0.3 }, 0, 0.8);
    addDrum(o, 'crash', { tau: 0.7 }, 0, 0.35);
    [60, 67, 72, 76, 79].forEach((m) => inst('brass', o, 0.005, midiHz(m), 0.5, 0.55));
    [84, 88, 91].forEach((m, k) => inst('bell', o, 0.02 + k * 0.03, midiHz(m), 0.6, 0.4));
  }, { lim: 3, verb: [0.25, 0.85] });

  // Bonus slots: a coin cascade, longer and brighter for a bigger prize (tier 1..3).
  [1, 2, 3].forEach((tier) => {
    const coins = [4, 8, 14][tier - 1], spanS = [0.32, 0.6, 1.0][tier - 1], top = [7, 12, 19][tier - 1];
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    def('slot:' + tier, spanS + 0.75, -23 + tier, (o, r) => {
      for (let k = 0; k < coins; k++) {
        const t = (k / coins) * spanS + r() * 0.015, s = steps.filter((x) => x <= top);
        coinPing(o, t, midiHz(76 + s[Math.round(k / Math.max(1, coins - 1) * (s.length - 1))]), 0.45 + 0.03 * k);
      }
      noise(o, 0, 0.05, { type: 'lp', f0: 900, q: 0.7, d: 0.02, g: 0.25 });
      if (tier === 3) [84, 88, 91].forEach((m) => inst('bellSoft', o, spanS, midiHz(m), 0.5, 0.45));
    }, { verb: [0.15, 0.7], lp: 7000 });
  });

  def('style', 0.9, -20, (o) => {
    // Style bonus: a quick, bright "ta-da!".
    inst('marimba', o, 0, midiHz(79), 0.08, 0.8);
    [76, 79, 84].forEach((m) => inst('brass', o, 0.1, midiHz(m), 0.3, 0.6));
    inst('bellSoft', o, 0.1, midiHz(88), 0.4, 0.45);
  }, { verb: [0.15, 0.7] });

  def('refill', 1.4, -22, (o) => {
    // Cozy refill: a soft, reassuring chime — "here are some more".
    [[0, 72], [0.12, 76], [0.24, 79], [0.36, 84]].forEach(([t, m]) => inst('kalimba', o, t, midiHz(m), 0.2, 0.6));
    [64, 67, 72].forEach((m) => inst('felt', o, 0.36, midiHz(m), 0.6, 0.45));
  }, { verb: [0.25, 0.8] });

  def('levelStart', 1.6, -21, (o) => {
    // A level opens: a gentle swell of air, a harp sweep up and a welcoming chime.
    noise(o, 0, 1.0, { type: 'bp', f0: 300, f1: 2400, q: 0.9, a: 0.6, r: 0.35, g: 0.25 });
    [0, 2, 4, 7, 9, 12, 14, 16, 19].forEach((d, k) => inst('harp', o, 0.15 + k * 0.05, midiHz(60 + d), 0.25, 0.4 + 0.03 * k));
    [72, 79, 84].forEach((m, k) => inst('bellSoft', o, 0.62 + k * 0.03, midiHz(m), 0.5, 0.45));
  }, { verb: [0.25, 0.85] });

  // Results stars: each star a step higher; the third adds a sparkle.
  [1, 2, 3].forEach((n) => def('star:' + n, 1.1, -22 + 0.5 * n, (o) => {
    const m = [76, 79, 84][n - 1];
    inst('bell', o, 0, midiHz(m), 0.2, 0.75, { ix: 1.4, tau: 0.55 });
    inst('bellSoft', o, 0.005, midiHz(m - 12), 0.25, 0.4);
    if (n === 3) [0, 4, 7, 12, 7, 12].forEach((d, k) => inst('glock', o, 0.08 + k * 0.04, midiHz(79 + d), 0.06, 0.25, { tau: 0.25 }));
  }, { verb: [0.2, 0.8], lp: 6000 }));

  def('unstick', 0.35, -25, (o) => {
    // A stuck ball freed: a soft "poof".
    noise(o, 0, 0.3, { type: 'lp', f0: 1500, f1: 400, q: 0.7, a: 0.01, d: 0.08, g: 0.6, color: 'pink' });
    tone(o, 0, 0.15, 300, 200, { w: 'sine', a: 0.003, d: 0.05, g: 0.3 });
  });

  def('ballReturned', 0.5, -23, (o) => {
    // Ball back: two friendly notes up.
    inst('marimba', o, 0, midiHz(72), 0.08, 0.7);
    inst('marimba', o, 0.09, midiHz(79), 0.15, 0.8);
  }, { verb: [0.1, 0.6] });

  /* ══════════════════════════════════════════════════════════════════════
   * 6. Pegs — the heart of the game's sound
   * ══════════════════════════════════════════════════════════════════════
   * Each consecutive hit in a shot plays the NEXT note of the current track's
   * scale, climbing from a root near middle C up to three octaves (capped at
   * D7, so the top never pierces), then cycling inside the top octave. The
   * timbre belongs to the mode: Cozy a kalimba tine over a felt mallet,
   * Vivid a marimba bar with a bell glint, Hyper a synth pluck with a touch
   * of delay. Notes are rendered per (mode, MIDI note), so a key change only
   * adds the few pitches the new scale needs.
   */
  const PEG_LO = 60, PEG_TOP = 98, PEG_SPAN = 36;
  const PEG_MODES = ['cozy', 'vivid', 'hyper'];
  const pegCache = new Map();

  /** The ascending peg notes for a song: its scale from a root in C4..B4, up to three octaves. */
  function pegScaleNotes(songId) {
    const id = SONGS[songId] ? songId : 'title';
    if (pegCache.has(id)) return pegCache.get(id);
    const s = SONGS[id], pc = pcOf(s.key[0]), start = PEG_LO + ((pc - PEG_LO) % 12 + 12) % 12;
    const out = [];
    for (let o = 0; o <= 3; o++) {
      for (let k = 0; k < s.scale.length; k++) {
        const m = start + 12 * o + s.scale[k];
        if (m - start <= PEG_SPAN && m <= PEG_TOP && out.indexOf(m) < 0) out.push(m);
      }
    }
    out.sort((a, b) => a - b);
    pegCache.set(id, out);
    return out;
  }

  /** The MIDI note for the chain-th hit of a shot (chain counts from 1). */
  function pegMidi(songId, chain) {
    const list = pegScaleNotes(songId), idx = Math.max(0, (Math.round(+chain) || 1) - 1);
    if (idx < list.length) return list[idx];
    const top = list[list.length - 1], cyc = list.filter((m) => m > top - 12);
    return cyc[(idx - list.length) % cyc.length];
  }

  const PEG_VOICE = {
    cozy: { len: 1.2, level: -21, verb: [0.16, 0.65], draw(o, f) {
      // A kalimba tine (round, short attack) over a soft felt-mallet body.
      malletNote(o, 0.002, f, 0.1, 0.9, { parts: [[1, 1, 0.42], [5.35, 0.1, 0.035], [2.0, 0.05, 0.16]], click: 0.03, clickLp: 1800, rel: 1.1, velBright: 0.8, g: 0.55 });
      feltNote(o, 0, f, 0.12, 0.55, { tau: 0.6, dull: 1.2, hammer: 0.25, hammerHz: 700, rel: 0.25, parts: 4, g: 0.2 });
    } },
    vivid: { len: 0.95, level: -20, verb: [0.12, 0.6], draw(o, f) {
      // A bright marimba bar with a bell glint an octave above.
      malletNote(o, 0, f, 0.1, 1, { parts: [[1, 1, 0.34], [3.98, 0.3, 0.06], [9.9, 0.04, 0.02]], click: 0.08, rel: 0.9, g: 0.55 });
      fmNote(o, 0.003, f * 2, 0.08, 0.5, { mr: 3.5, ix: 1.2, ixEnd: 0.2, ixTau: 0.12, tau: 0.32, ring: 1, rel: 0.8, g: 0.2 });
    } },
    hyper: { len: 1.05, level: -20, verb: [0.1, 0.55], draw(o, f) {
      // A synth pluck with a sine core (so the pitch reads cleanly) and two softened repeats.
      sawNote(o, 0, f, 0.09, 1, { det: 0.005, a: 0.002, d: 0.16, s: 0, rel: 0.12, cut: 900, keyTrack: 1.4, cutEnv: 4, cutTau: 0.05, q: 1.3, g: 0.5 });
      tone(o, 0, 0.14, f, f, { w: 'sine', a: 0.002, d: 0.06, g: 0.25 });
      bakeEcho(o, 0.19, [0.34, 0.13], 2600);
    } }
  };

  /** Render one peg note: the play volume seats every pitch at the same loudness, highs a touch softer. */
  function renderPeg(mode, midi) { return drain(renderPegGen(mode, midi)); }
  function* renderPegGen(mode, midi) {
    const V = PEG_VOICE[mode] || PEG_VOICE.vivid, o = new Float32Array(Math.round(V.len * SR));
    nzSeed(hashStr('peg:' + mode + ':' + midi));
    V.draw(o, midiHz(midi));
    yield;
    if (V.verb) yield* verbGen(o, V.verb[0], V.verb[1]);
    yield* highpassGen(o, 60, false);
    const chs = [o];
    finishOneShot(chs, 0);
    const level = V.level - Math.max(0, midi - 76) * 0.08, loud = loudness(chs, 0.25);
    return { chs, sec: V.len, level, loud, vol: clamp(dbToGain(level - loud), 0, 1), crit: false };
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 7. Music — songs are data; a small sequencer renders each one
   * ══════════════════════════════════════════════════════════════════════
   * A song has a tempo, swing (0 straight … 1 full triplet feel), steps per
   * bar (spb: 16 sixteenths in 4/4, 12 in 3/4), a key and mode (for diatonic
   * harmony lines), a peg scale, chords (one '|' per bar), parts, drums and
   * a mix.
   *
   * Melody strings: bars split by '|'; tokens NOTE:len (len in sixteenths),
   * r:len rests, -:len ties onto the previous note, a trailing ! accents.
   * Every bar must add up to the bar length — the parser throws if one does
   * not, so a typo in a tune fails tools/test/audio.cjs instead of reaching
   * an ear.
   *
   * Generated parts follow the chords:
   *   bass   one char per step: 1 root, 3 third, 5 fifth, 7 seventh,
   *          8 octave, 6 sixth, 2 ninth, 4 fourth, < fifth below, a approach
   *          (a semitone beside the next chord's root), . hold, - rest
   *   arp    rhythm 'x' onsets walk `arp` (indices into the chord tones from
   *          lo to hi, ascending; indices past the top continue an octave up)
   *   chord  rhythm 'x' onsets voice the chord between lo and hi, each voicing
   *          moving as little as possible from the last (rootless: drop the
   *          root and let the bass have it). On a single-note instrument the
   *          chord is rolled upward by `roll` seconds per note.
   * Part extras: harm (diatonic harmony steps), oct, g, pan, rev, dly, pump
   * (duck under the kick), gate, vel, hum (timing humanise, s), roll,
   * bars [first, last], fx { lp, hp, trem: [cycles per beat, depth],
   * gate: 16th-step pattern, autopan: [cycles per beat, depth] }.
   * A loop renders into a ring the length of the loop, so any note, echo or
   * reverb tail that runs past the end lands back at the start; a one-shot
   * (stinger) renders straight through with room for its tail.
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
    dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7],
    '7sus4': [0, 5, 7, 10], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14],
    '69': [0, 4, 7, 9, 14], '9': [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
    m11: [0, 3, 7, 10, 14, 17], '5': [0, 7]
  };
  const CHORD_RE = /^([A-G][#b]?)(maj9|maj7|m7b5|madd9|m11|m9|m7|m6|m|dim7|dim|aug|sus2|sus4|7sus4|add9|69|9|7|6|5)?(?:\/([A-G][#b]?))?$/;
  function parseChord(sym) {
    const m = CHORD_RE.exec(sym);
    if (!m) throw new Error('bad chord "' + sym + '"');
    const root = pcOf(m[1]), iv = QUALITY[m[2] || ''];
    return { root, iv, bass: m[3] ? pcOf(m[3]) : root, pcs: iv.map((x) => (root + x) % 12) };
  }
  function parseChords(song) {
    const spb = song.spb || 16, bars = song.chords.split('|').map((b) => b.trim());
    if (bars.length !== song.bars) throw new Error(song.id + ': ' + bars.length + ' chord bars, song has ' + song.bars);
    const out = [];
    bars.forEach((b, bi) => {
      const toks = b.split(/\s+/);
      let pos = 0;
      toks.forEach((tk) => {
        const bits = tk.split(':'), len = bits[1] ? +bits[1] : spb / toks.length;
        out.push({ step: bi * spb + pos, len, ch: parseChord(bits[0]) });
        pos += len;
      });
      if (Math.abs(pos - spb) > 1e-9) throw new Error(song.id + ': chord bar ' + (bi + 1) + ' is ' + pos + ' steps');
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
    dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11]
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
    const spb = song.spb || 16, out = [], bars = str.split('|');
    if (fromBar - 1 + bars.length > song.bars) throw new Error(song.id + ' ' + where + ': melody runs past bar ' + song.bars);
    bars.forEach((bar, bi) => {
      const toks = bar.trim().split(/\s+/).filter(Boolean);
      let pos = 0;
      toks.forEach((tk) => {
        const m = /^([A-G][#b]?\d|r|-)(?::(\d+))?(!?)$/.exec(tk);
        if (!m) throw new Error(song.id + ' ' + where + ': bad token "' + tk + '" in bar ' + (fromBar + bi));
        const len = m[2] ? +m[2] : 2, step = (fromBar - 1 + bi) * spb + pos;
        if (m[1] === '-') { if (out.length) out[out.length - 1].len += len; }
        else if (m[1] !== 'r') out.push({ step, len, m: midiOf(m[1]), acc: !!m[3] });
        pos += len;
      });
      if (pos !== spb) throw new Error(song.id + ' ' + where + ': bar ' + (fromBar + bi) + ' has ' + pos + ' steps, not ' + spb);
    });
    return out;
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
    const spb = song.spb || 16, pat = part.bass.replace(/\s+/g, ''), plen = pat.length, br = barRange(song, part);
    const lo = midiOf(part.lo || 'E1'), total = song.bars * spb, out = [];
    let last = null, prev = null;
    for (let s = (br[0] - 1) * spb, k = 0; s < br[1] * spb; s++, k++) {
      const c = pat[k % plen];
      if (c === '.') { if (last) last.len++; continue; }
      if (c === '-') { last = null; continue; }
      const cd = chordAt(chords, s), nx = chordAt(chords, (cd.step + cd.len) % total);
      const m = degreeNote(c, cd.ch, nx.ch, lo, prev);
      last = { step: s, len: 1, m, acc: s % spb === 0 };
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
    const spb = song.spb || 16, rh = part.rhythm.replace(/\s+/g, ''), rl = rh.length, br = barRange(song, part);
    const seq = part.arp.trim().split(/\s+/).map(Number), lo = midiOf(part.lo), hi = midiOf(part.hi), out = [];
    let last = null, si = 0;
    for (let s = (br[0] - 1) * spb, k = 0; s < br[1] * spb; s++, k++) {
      if (s % spb === 0) si = 0;                               // the pattern restarts every bar
      const c = rh[k % rl];
      if (c === '.') { if (last) last.len++; continue; }
      if (c === '-') { last = null; continue; }
      const tl = toneList(chordAt(chords, s).ch, lo, hi), idx = seq[si++ % seq.length];
      const m = tl[idx % tl.length] + 12 * Math.floor(idx / tl.length);
      last = { step: s, len: 1, m, acc: s % spb === 0 };
      out.push(last);
    }
    return out;
  }

  /** Voice a chord near the previous voicing: third, seventh, root, fifth, ninth in that order of importance. */
  function voiceChord(ch, lo, hi, voices, prev, rootless) {
    const iv = ch.iv, rl = rootless && iv.length >= 4;
    const order = (rl ? [1, 3, 4, 2, 5] : [0, 1, 3, 2, 4, 5]).filter((i) => i < iv.length);
    const pcs = order.map((i) => (ch.root + iv[i]) % 12).slice(0, voices);
    while (pcs.length < voices) pcs.push(pcs[0]);
    let centre = (lo + hi) / 2;
    if (prev) { centre = 0; for (let i = 0; i < prev.length; i++) centre += prev[i]; centre /= prev.length; }
    const notes = pcs.map((pc) => {
      let best = -1;
      for (let m = lo; m <= hi; m++) if (m % 12 === pc && (best < 0 || Math.abs(m - centre) < Math.abs(best - centre))) best = m;
      return best < 0 ? lo + ((pc - lo) % 12 + 12) % 12 : best;
    }).sort((a, b) => a - b);
    for (let i = 1; i < notes.length; i++) while (notes[i] <= notes[i - 1]) notes[i] += 12;   // a doubled tone goes up an octave
    return notes;
  }

  function chordEvents(song, part, chords) {
    const spb = song.spb || 16, rh = part.chord.replace(/\s+/g, ''), rl = rh.length, br = barRange(song, part);
    const lo = midiOf(part.lo), hi = part.hi ? midiOf(part.hi) : lo + 24, out = [];
    let prev = null, last = null;
    for (let s = (br[0] - 1) * spb, k = 0; s < br[1] * spb; s++, k++) {
      const c = rh[k % rl], cd = chordAt(chords, s);
      if (c === '-') { last = null; continue; }
      if (c === '.' && last && last.cd === cd) { last.len++; continue; }
      if (c === '.' && !last) continue;
      const ms = voiceChord(cd.ch, lo, hi, part.voices || 3, prev, part.rootless);
      prev = ms;
      last = { step: s, len: 1, ms, cd, acc: s % spb === 0 };
      out.push(last);
    }
    return out;
  }

  function partEvents(song, part, chords) {
    if (part.n) {
      const spb = song.spb || 16, from = part.from || 1;
      let evs = parseMelody(song, part.n, from, part.v);
      if (part.rep) {
        const patBars = part.n.split('|').length, last = part.until || song.bars, out = [];
        for (let b = from; b <= last; b += patBars) {
          for (let i = 0; i < evs.length; i++) {
            const s = evs[i].step + (b - from) * spb;
            if (s < last * spb) out.push({ step: s, len: evs[i].len, m: evs[i].m, acc: evs[i].acc });
          }
        }
        evs = out;
      }
      return evs;
    }
    if (part.bass) return bassEvents(song, part, chords);
    if (part.arp) return arpEvents(song, part, chords);
    if (part.chord) return chordEvents(song, part, chords);
    throw new Error(song.id + ': a part has no notes');
  }

  /** Step position → time in steps, the off-beat eighth pushed late by swing. */
  function swingPos(step, swing) {
    if (!swing) return step;
    const beat = Math.floor(step / 4), u = step - beat * 4, sh = swing * 0.667;
    return beat * 4 + (u < 2 ? u * (2 + sh) / 2 : 2 + sh + (u - 2) * (2 - sh) / 2);
  }

  /** Downbeats a touch louder, off-beats softer: the difference between a groove and a grid. */
  function metric(step, acc, spb) {
    const s = step % spb;
    const v = s === 0 ? 1.08 : spb === 16 && s === 8 ? 1.04 : s % 4 === 0 ? 1 : s % 2 === 0 ? 0.94 : 0.9;
    return acc ? v * 1.12 : v;
  }

  /** Add a buffer into the song's buses: wrapping round the ring for a loop, clipped for a one-shot. */
  function mixRing(src, start, vel, gl, gr, gv, gd, L, R, V, D, ring) {
    const N = L.length;
    let j = start, i = 0, n = src.length;
    if (ring) { j %= N; if (j < 0) j += N; }
    else { if (j < 0) { i = -j; j = 0; } n = Math.min(n, i + N - j); }
    for (; i < n; i++) {
      const x = src[i] * vel;
      L[j] += x * gl; R[j] += x * gr;
      if (gv) V[j] += x * gv;
      if (gd) D[j] += x * gd;
      if (++j === N) j = 0;
    }
  }
  function monoRing(src, start, vel, dst, ring) {
    const N = dst.length;
    let j = start, i = 0, n = src.length;
    if (ring) { j %= N; if (j < 0) j += N; }
    else { if (j < 0) { i = -j; j = 0; } n = Math.min(n, i + N - j); }
    for (; i < n; i++) { dst[j] += src[i] * vel; if (++j === N) j = 0; }
  }

  /** Per-part effects on a part rendered alone: filters, synced tremolo, a trance gate. */
  function* partFxGen(x, fx, song, ring) {
    const n = x.length, beatN = 60 / song.bpm * SR;
    if (fx.hp) yield* biquadGen(x, 'hp', fx.hp, 0.7, ring);
    if (fx.lp) yield* biquadGen(x, 'lp', fx.lp, fx.q || 0.7, ring);
    if (fx.trem) {
      const w = fx.trem[0] / beatN, d = fx.trem[1];
      for (let i = 0; i < n; i++) { x[i] *= 1 - d * (0.5 - 0.5 * sn(i * w + 0.25)); if ((i & YM) === YM) yield; }
    }
    if (fx.gate) {
      // Open steps chop in fast and sag a little across the step; closed steps sink to the floor.
      const pat = fx.gate.replace(/\s+/g, ''), pl = pat.length, stepN = beatN / 4, floor = 1 - (fx.depth || 0.85);
      const aA = 1 - Math.exp(-1 / (0.003 * SR)), aR = 1 - Math.exp(-1 / (0.02 * SR));
      const tgt = (i) => {
        const sp = i / stepN, k = Math.floor(sp);
        return pat[k % pl] === 'x' ? 1 - 0.3 * (sp - k) : floor;
      };
      let s = tgt(n - 1);
      for (let i = 0; i < n; i++) { const t = tgt(i); s += (t > s ? aA : aR) * (t - s); x[i] *= s; if ((i & YM) === YM) yield; }
    }
  }
  /** Mix a solo-rendered part into the buses, with an optional synced auto-pan. */
  function* mixSoloGen(x, fx, song, pan, g, gv, gd, L, R, V, D) {
    const n = x.length, ap = fx.autopan, w = ap ? ap[0] / (60 / song.bpm * SR) : 0, dep = ap ? ap[1] : 0;
    let gl = 0, gr = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) {
        const p = clamp(pan + dep * sn(i * w), -1, 1), th = (p + 1) * Math.PI / 4;
        gl = g * Math.cos(th); gr = g * Math.sin(th);
      }
      const v = x[i];
      L[i] += v * gl; R[i] += v * gr;
      if (gv) V[i] += v * gv;
      if (gd) D[i] += v * gd;
      if ((i & YM) === YM) yield;
    }
  }

  /* Note rendering yields on the clock: no more than BUDGET_MS of synthesis between yields. */
  const BUDGET_MS = 2;
  const clock = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();
  const SONG_TAIL = 3.0;     // seconds of a loop's opening repeated after its end (gapless player)

  /**
   * Render a song (generator): parts, drums, side-chain pump, echo, reverb,
   * vinyl, tape wobble, then loudness-normalise and limit.
   * Returns { chs: [L, R], sec, loopSec }.
   */
  function* songGen(id) {
    const song = SONGS[id];
    if (!song) throw new Error('unknown song ' + id);
    const spb = song.spb || 16, ring = !song.oneShot;
    nzSeed(hashStr(song.id));
    const rnd = prng(hashStr(song.id) ^ 0xa5a5a5a5);
    const stepSec = 60 / song.bpm / 4, loopN = Math.round(song.bars * spb * stepSec * SR);
    const N = ring ? loopN : loopN + Math.round((song.decay || 1.2) * SR);
    const tOf = (s) => swingPos(s, song.swing || 0) * stepSec;
    const L = new Float32Array(N), R = new Float32Array(N), V = new Float32Array(N), D = new Float32Array(N);
    const mix = song.mix || {};
    const PL = mix.pump ? new Float32Array(N) : null, PR = mix.pump ? new Float32Array(N) : null;
    const chords = parseChords(song), key = pcOf(song.key[0]), kmode = song.key[1];
    let mark = clock();

    for (let pi = 0; pi < song.parts.length; pi++) {
      const part = song.parts[pi];
      let evs = partEvents(song, part, chords);
      if (part.harm) evs = evs.map((e) => ({ step: e.step, len: e.len, acc: e.acc, m: diatonic(e.m, part.harm, key, kmode) }));
      if (part.oct) evs = evs.map((e) => (e.ms ? Object.assign({}, e, { ms: e.ms.map((x) => x + 12 * part.oct) }) : Object.assign({}, e, { m: e.m + 12 * part.oct })));
      const I = INSTR[part.v];
      if (!I) throw new Error(song.id + ': unknown instrument ' + part.v);
      const P = Object.assign({ rel: I.rel }, I.P, part.P || {}), rel = P.rel;
      const g = part.g === undefined ? 0.5 : part.g, th = ((part.pan || 0) + 1) * Math.PI / 4;
      const gl = g * Math.cos(th), gr = g * Math.sin(th), gv = g * (part.rev || 0), gd = g * (part.dly || 0);
      const toL = part.pump && PL ? PL : L, toR = part.pump && PR ? PR : R;
      const vel0 = part.vel || 0.9, gate = part.gate || (I.chord ? 0.96 : 0.9), roll = part.roll || 0;
      const hum = part.hum !== undefined ? part.hum : (song.human || 0);
      const vr = part.velRand !== undefined ? part.velRand : 0.08;
      const fx = part.fx || null, solo = fx ? new Float32Array(N) : null;
      const cache = new Map();
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i], ts = tOf(e.step), dur = Math.max(0.02, (tOf(e.step + e.len) - ts) * gate);
        const nkey = (e.ms ? e.ms.join(',') : e.m) + '|' + Math.round(dur * SR);
        let buf = cache.get(nkey);
        if (!buf) {
          if (e.ms && !I.chord) {
            // A chord on a single-note instrument: one note per tone, rolled upward, the top voice singing out.
            const nt = e.ms.length;
            buf = new Float32Array(Math.ceil((dur + rel + roll * nt) * SR) + 8);
            for (let k = 0; k < nt; k++) {
              const vk = k === nt - 1 ? 1 : 0.8, dk = Math.max(0.02, dur - k * roll);
              if (I.gen) yield* I.fn(buf, k * roll, midiHz(e.ms[k]), dk, vk, P);
              else I.fn(buf, k * roll, midiHz(e.ms[k]), dk, vk, P);
              if (clock() - mark > BUDGET_MS) { yield; mark = clock(); }
            }
          } else {
            buf = new Float32Array(Math.ceil((dur + rel) * SR) + 8);
            const arg = I.chord ? (e.ms || [e.m]).map(midiHz) : midiHz(e.m);
            if (I.gen) yield* I.fn(buf, 0, arg, dur, 1, P);
            else I.fn(buf, 0, arg, dur, 1, P);
          }
          cache.set(nkey, buf);
        }
        const vel = vel0 * metric(e.step, e.acc, spb) * (1 + (rnd() - 0.5) * vr);
        const jit = hum ? (rnd() - 0.5) * 2 * hum : 0;
        const start = Math.round((ts + jit) * SR);
        if (solo) monoRing(buf, start, vel, solo, ring);
        else mixRing(buf, start, vel, gl, gr, gv, gd, toL, toR, V, D, ring);
        if (clock() - mark > BUDGET_MS) { yield; mark = clock(); }
      }
      if (solo) {
        yield;
        yield* partFxGen(solo, fx, song, ring);
        yield* mixSoloGen(solo, fx, song, part.pan || 0, g, gv, gd, toL, toR, V, D);
      }
      yield;
    }

    // Drums: each kit voice renders once, every hit is a scaled copy.
    const dr = song.drums, kicks = [];
    if (dr) {
      if (!KITS[dr.kit]) throw new Error(song.id + ': no drum kit ' + dr.kit);
      const kit = Object.assign({}, KITS[dr.kit], dr.over || {}), bufs = {};
      for (const c in kit) { bufs[c] = drumBuf(kit[c][0], kit[c][1]); yield; }
      const order = dr.order.replace(/[\s|]/g, '');
      if (order.length !== song.bars) throw new Error(song.id + ': drum order has ' + order.length + ' bars, song has ' + song.bars);
      const dh = dr.human === undefined ? 0.002 : dr.human, push = dr.push || {}, dg = dr.g || 1;
      const hit = (c, step, v) => {
        const kd = kit[c];
        if (!kd) throw new Error(song.id + ': no kit voice "' + c + '"');
        const t = tOf(step) + (push[c] || 0) + (c === 'k' ? 0 : (rnd() - 0.5) * 2 * dh);
        const start = Math.round(t * SR);
        const th = (kd[3] + 1) * Math.PI / 4, gg = kd[2] * v * dg * (1 + (rnd() - 0.5) * 0.08);
        mixRing(bufs[c], start, 1, gg * Math.cos(th), gg * Math.sin(th), gg * (kd[4] || 0), 0, L, R, V, D, ring);
        if (c === 'k') kicks.push(start);
      };
      for (let bar = 0; bar < song.bars; bar++) {
        const pat = dr.pat[order[bar]];
        if (!pat) throw new Error(song.id + ': no drum pattern "' + order[bar] + '"');
        for (const c in pat) {
          const str = pat[c].replace(/\s+/g, ''), len = str.length;
          if (len % spb && spb % len) throw new Error(song.id + ': drum pattern ' + order[bar] + '.' + c + ' does not fit a ' + spb + '-step bar');
          for (let s = 0; s < spb; s++) { const v = VEL[str[(bar * spb + s) % len]]; if (v) hit(c, bar * spb + s, v); }
        }
        if (dr.crash && dr.crash.indexOf(bar + 1) >= 0 && kit.x) hit('x', bar * spb, 1);
        yield;
      }
    }

    nzSeed(hashStr(song.id + ':post'));   // what follows never depends on which drums were cached

    // Side-chain pump: the parts marked pump duck under every kick and swell back.
    if (PL) {
      const env = new Float32Array(N).fill(1), depth = mix.pump[0], relN = mix.pump[1] * SR, aN = 0.004 * SR, len = Math.round(relN * 5);
      const curve = new Float32Array(len);          // the duck shape, computed once
      for (let j = 0; j < len; j++) curve[j] = 1 - depth * (j < aN ? j / aN : Math.exp(-(j - aN) / relN));
      for (let q = 0; q < kicks.length; q++) {
        for (let j = 0; j < len; j++) {
          let idx = kicks[q] + j;
          if (ring) { idx %= N; if (idx < 0) idx += N; } else if (idx < 0 || idx >= N) continue;
          if (curve[j] < env[idx]) env[idx] = curve[j];
        }
        if ((q & 7) === 7) yield;
      }
      for (let i = 0; i < N; i++) { L[i] += PL[i] * env[i]; R[i] += PR[i] * env[i]; if ((i & YM) === YM) yield; }
    }

    if (mix.dly) yield* echoGen(D, L, R, Math.round(mix.dly[0] * 60 / song.bpm * SR), mix.dly[1], mix.dly[2], mix.dly[3], ring);
    if (mix.rev) yield* reverbGen(V, L, R, mix.rev[0], mix.rev[1], mix.rev[2], ring);
    if (mix.vinyl) yield* vinylGen(L, R, mix.vinyl, rnd, ring);
    yield* highpassGen(L, 28, ring);
    yield* highpassGen(R, 28, ring);
    if (mix.lp) { yield* biquadGen(L, 'lp', mix.lp, 0.7, ring); yield* biquadGen(R, 'lp', mix.lp, 0.7, ring); }
    if (mix.wow) yield* wowGen([L, R], mix.wow[0], mix.wow[1], ring);
    if (!ring) {                          // a stinger ends on silence: fade its last 0.3 s
      const f = Math.min(N, Math.round(0.3 * SR));
      for (let i = 0; i < f; i++) { const w = i / f; L[N - 1 - i] *= w; R[N - 1 - i] *= w; }
    }
    // Master: bring every song to its loudness, then limit to -1 dBFS (at most a
    // few dB of limiting, so transients keep their snap). A stinger is measured
    // over its loudest second, a loop over its whole length.
    const loud = yield* loudnessGen([L, R], ring ? 0 : 1.0);
    const pk = yield* peakGen([L, R]);
    const gain = Math.min(dbToGain((mix.lv || -14) - loud), CEIL / Math.max(1e-6, pk) * dbToGain(mix.limit || 4));
    yield* scaleGen([L, R], gain);
    yield* limitGen([L, R], CEIL, ring);
    return { chs: [L, R], sec: N / SR, loopSec: loopN / SR };
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 8. The songs
   * ══════════════════════════════════════════════════════════════════════
   * All original. Each is a real little piece: a hook built from a short
   * motif, answered and varied, sections that bring instruments in and out,
   * and a progression that turns back to bar 1 so the loop never sounds
   * like it restarts. `scale` is what the pegs climb (pentatonic, so every
   * peg note sits sweetly over every chord of the track).
   */
  const SONGS = {};
  const MAJ_PENT = [0, 2, 4, 7, 9], MIN_PENT = [0, 3, 5, 7, 10];

  /* ── Title — "Through the Lantern Door" (D major, 96) ─────────────────────
   * The front door: a breathy flute sings a hook that climbs the D chord and
   * blooms into a Gmaj7, over a harp's rolling eighths and soft felt-piano
   * chords. The second section hands the tune to a celesta while a cello
   * line answers underneath and strings swell in; the third lifts through
   * B♭ and C (a little magic) with a choir, and turns home on A7. */
  const TITLE_A = 'A4:2 D5:2 F#5:2 A5:6 F#5:2 G5:2 | A5:4 C#6:2 B5:2 A5:4 F#5:4 | G5:2 B5:2 D6:2 F#6:6 E6:2 D6:2 | E6:6 D6:2 C#6:4 A5:4 | ' +
    'B5:2 A5:2 F#5:2 D5:6 E5:2 F#5:2 | E5:4 C#5:2 E5:2 A5:8 | B5:2 A5:2 G5:2 F#5:2 G5:2 A5:2 B5:2 D6:2 | D6:8 C#6:6 r:2';
  const TITLE_B = 'D6:4 B5:4 G5:4 A5:4 | C#6:4 A5:4 E5:4 F#5:2 G5:2 | A5:6 F#5:2 C#5:4 E5:4 | D5:2 F#5:2 B5:4 A5:2 F#5:2 D5:4 | ' +
    'G5:4 B5:4 E6:6 D6:2 | C#6:4 A5:4 F#5:4 E5:4 | D5:2 E5:2 F#5:2 G5:2 B5:4 D6:4 | E6:8 C#6:4 r:4';
  const TITLE_C = 'D6:6 C6:2 Bb5:4 F5:4 | E6:6 D6:2 C6:4 G5:4 | F#6:8 E6:2 D6:2 C#6:2 A5:2 | D6:4 B5:4 A5:4 F#5:4 | ' +
    'G5:2 A5:2 B5:2 D6:6 B5:2 A5:2 | C#6:4 E6:4 A5:8 | B5:4 G5:2 E5:2 D6:4 B5:4 | C#6:4 B5:2 A5:2 G5:4 E5:4';
  const TITLE_CELLO = 'B3:8 D4:8 | C#4:8 E4:8 | F#4:12 E4:4 | D4:16 | E4:8 G4:8 | F#4:8 C#4:8 | D4:8 B3:8 | A3:8 C#4:8';
  SONGS.title = {
    id: 'title', title: 'Through the Lantern Door', bpm: 96, bars: 24, swing: 0.1, human: 0.005,
    key: ['D', 'major'], scale: MAJ_PENT,
    chords: 'Dmaj7 | F#m7 | Gmaj7 | A | Bm7 | F#m7 | Gmaj7 | Asus4 A | Gmaj7 | A | F#m7 | Bm | Em7 | F#m7 | Gmaj7 | Asus4 A | ' +
      'Bbmaj7 | C | Dmaj7 | Bm7 | Gmaj7 | A | Em7 | A7',
    parts: [
      { v: 'flute', n: TITLE_A, g: 0.42, rev: 0.28, dly: 0.14 },
      { v: 'celesta', n: TITLE_B, from: 9, g: 0.51, pan: 0.1, rev: 0.3, dly: 0.18 },
      { v: 'flute', n: TITLE_C, from: 17, g: 0.41, rev: 0.28, dly: 0.14 },
      { v: 'bellSoft', n: TITLE_C, from: 17, g: 0.24, pan: 0.25, rev: 0.3 },
      { v: 'cello', n: TITLE_CELLO, from: 9, g: 0.44, pan: -0.3, rev: 0.3 },
      { v: 'harp', arp: '0 1 2 3 4 3 2 1', rhythm: 'x.x.x.x.x.x.x.x.', lo: 'D3', hi: 'D5', g: 0.23, pan: -0.25, rev: 0.3 },
      { v: 'felt', chord: 'x.......x.......', lo: 'F#3', hi: 'D5', voices: 4, roll: 0.02, bars: [1, 16], g: 0.17, pan: 0.2, rev: 0.25, gate: 0.98 },
      { v: 'warmPad', chord: 'x...............', lo: 'A3', hi: 'F#5', voices: 4, bars: [1, 8], g: 0.16, rev: 0.3 },
      { v: 'strings', chord: 'x...............', lo: 'A3', hi: 'F#5', voices: 4, bars: [9, 24], g: 0.23, rev: 0.32 },
      { v: 'choir', chord: 'x...............', lo: 'D4', hi: 'A5', voices: 3, bars: [17, 24], g: 0.17, rev: 0.4 },
      { v: 'upright', bass: '1.......5.......', lo: 'A1', bars: [1, 8], g: 1.08 },
      { v: 'upright', bass: '1.....1.5...8.a.', lo: 'A1', bars: [9, 24], g: 0.72 }
    ],
    drums: {
      kit: 'soft', g: 0.77,
      pat: {
        A: { k: 'x.........x.....', r: '....x.......x...', S: 'x.o.x.o.x.o.x.o.' },
        B: { k: 'x.........x.x...', s: '....x.......x...', S: 'xoxoxoxoxoxoxoxo', m: '..o...o...o...o.' },
        C: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.', S: 'xoxoxoxoxoxoxoxo', m: '..x...x...x...x.' },
        F: { k: 'x.........x.....', s: '....x...........', t: '........x.o.....', u: '............x.o.', S: 'xoxoxoxo........' }
      },
      order: 'AAAAAAAF BBBBBBBF CCCCCCCF', crash: [9, 17]
    },
    mix: { rev: [0.84, 0.4, 0.5], dly: [0.75, 0.25, 2600, 0.35], lv: -14 }
  };

  /* ── Menu: Cozy — "Hearthside" (F major, 72, lazy swing) ──────────────────
   * Lo-fi by the fire: rootless Rhodes chords with a suitcase tremolo that
   * drifts across the room, a dusty boom-bap with a late snare, an upright
   * bass, vinyl crackle and a tape wobble. A kalimba hums a few lines; a
   * felt piano answers. */
  const MC_A = 'r:2 D5:2 F5:2 A5:4 C6:2 A5:4 | G5:3 E5:1 C5:4 E5:8 | r:2 Bb4:2 D5:2 F5:4 A5:2 G5:4 | F5:8 E5:4 D5:4 | ' +
    'r:2 D5:2 F5:2 A5:4 C6:2 D6:4 | C6:4 A5:2 G5:2 F#5:4 A5:4 | Bb5:6 A5:2 G5:4 D5:4 | E5:4 G5:2 Bb5:2 D6:4 r:4';
  const MC_B = 'A4:4 C5:2 E5:2 F5:6 E5:2 | D5:4 F5:2 A5:2 C6:8 | Bb5:4 A5:2 F5:2 D5:4 F5:4 | G5:8 F5:4 r:4';
  SONGS['menu-cozy'] = {
    id: 'menu-cozy', title: 'Hearthside', bpm: 72, bars: 12, swing: 0.32, human: 0.009,
    key: ['F', 'major'], scale: MAJ_PENT,
    chords: 'Bbmaj9 | Am7 | Gm9 | C7sus4 C9 | Bbmaj9 | Am7 D7 | Gm9 | C9 | Dm9 | Bbmaj9 | Gm9 | C7sus4',
    parts: [
      { v: 'kalimba', n: MC_A, g: 0.5, pan: 0.15, rev: 0.25, dly: 0.2 },
      { v: 'felt', n: MC_B, from: 9, g: 0.57, pan: 0.1, rev: 0.25, gate: 1 },
      { v: 'rhodes', chord: 'x.....x.........', lo: 'E3', hi: 'C5', voices: 4, rootless: 1, roll: 0.012, g: 0.16, rev: 0.2, fx: { trem: [4, 0.18], autopan: [0.25, 0.35] } },
      { v: 'upright', bass: '1.......1..5..a.', lo: 'A1', g: 0.7 },
      { v: 'airPad', chord: 'x...............', lo: 'C4', hi: 'A5', voices: 3, bars: [9, 12], g: 0.13, rev: 0.4 }
    ],
    drums: {
      kit: 'lofi', g: 0.67, push: { s: 0.012 },
      pat: {
        A: { k: 'x......x..x.....', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.' },
        B: { k: 'x......x..x.....', s: '....x.......x..g', h: 'x.o.x.oox.o.x.o.', S: '..o...o...o...o.' },
        F: { k: 'x.........x.....', s: '....x.......x.g.', h: 'x.o.x.o.x.o.....', n: '............x...' }
      },
      order: 'AAAAAAAF BBBF'
    },
    mix: { rev: [0.78, 0.5, 0.35], dly: [0.75, 0.3, 2000, 0.25], lv: -15, wow: [0.7, 0.4], vinyl: 0.05, lp: 7000 }
  };

  /* ── Menu: Vivid — "Confetti Pop" (G major, 114) ──────────────────────────
   * Bright and bouncy: a syncopated marimba hook over the IV–V–iii–vi lift,
   * plucky off-beat synth chords, a slap bass, claps and shakers. The second
   * half doubles the new hook with a synth pluck and a glockenspiel. */
  const MV_A = 'E5:2 G5:2 r:1 B5:3 A5:2 G5:2 E5:4 | F#5:2 A5:2 r:1 D6:3 C6:2 A5:2 F#5:4 | D6:3 B5:3 A5:2 F#5:3 A5:3 B5:2 | G5:6 E5:2 D5:4 r:4 | ' +
    'E5:2 A5:2 r:1 C6:3 B5:2 A5:2 G5:4 | F#5:2 A5:2 r:1 D6:3 E6:2 F#6:2 D6:4 | B5:3 D6:3 B5:2 G5:3 A5:3 B5:2 | D6:4 F5:2 G5:2 B5:4 r:4';
  const MV_B = 'G5:2 C6:2 E6:2 G6:2 E6:2 C6:2 B5:4 | A5:2 D6:2 F#6:4 E6:2 D6:2 A5:4 | F#6:4 D6:4 E6:2 D6:2 B5:4 | C6:3 B5:3 A5:2 E5:4 G5:4 | ' +
    'E6:3 D6:3 C6:2 G5:4 E5:4 | F#5:3 A5:3 D6:2 F#6:4 E6:4 | G6:4 E6:2 B5:2 C#6:4 E6:4 | E6:4 C6:2 A5:2 F#5:2 A5:2 C6:4';
  SONGS['menu-vivid'] = {
    id: 'menu-vivid', title: 'Confetti Pop', bpm: 114, bars: 16, swing: 0.08, human: 0.003,
    key: ['G', 'major'], scale: MAJ_PENT,
    chords: 'Cmaj7 | D | Bm7 | Em7 | Am7 | D | G | G7 | Cmaj7 | D | Bm7 E7 | Am7 | Cmaj7 | D | Em7 A7 | Am7 D7',
    parts: [
      { v: 'marimba', n: MV_A + ' | ' + MV_B, g: 0.5, pan: 0.05, rev: 0.16, dly: 0.1 },
      { v: 'pluckSynth', n: MV_B, from: 9, oct: -1, g: 0.54, pan: -0.25, dly: 0.2 },
      { v: 'glock', n: MV_B, from: 9, g: 0.18, pan: 0.35, rev: 0.2 },
      { v: 'stabSynth', chord: '..x...x...x..x..', lo: 'D4', hi: 'D5', voices: 3, g: 0.39, pan: 0.3, gate: 0.5 },
      { v: 'warmPad', chord: 'x...............', lo: 'G3', hi: 'E5', voices: 4, g: 0.14, rev: 0.3 },
      { v: 'slap', bass: '1..8..1.5..8.a..', lo: 'E1', g: 0.59 }
    ],
    drums: {
      kit: 'funk', g: 0.8,
      pat: {
        A: { k: 'x.....x...x.....', c: '....x.......x...', h: 'x.oxx.oxx.oxx.ox', S: 'xoxoxoxoxoxoxoxo' },
        B: { k: 'x.....x...x...x.', c: '....x.......x...', h: 'x.oxx.oxx.oxx.ox', m: '..x...x...x...x.', q: 'x.....x.x.......', w: '...x.....x..x...' },
        F: { k: 'x.....x...x.....', c: '....x.......x.xx', h: 'x.oxx.ox........', t: '........x.x.....', u: '..........x.x...' }
      },
      order: 'AAAAAAAF BBBBBBBF', crash: [1, 9]
    },
    mix: { rev: [0.72, 0.4, 0.35], dly: [0.75, 0.25, 3000, 0.35], lv: -14 }
  };

  /* ── Menu: Hyper — "Ignition Grid" (B minor, 128) ─────────────────────────
   * Synthwave at the starting line: a pulsing octave bass, sixteenth-note
   * arpeggios breathing with the kick, synth-brass stabs; a retro saw lead
   * takes the hook over a trance-gated pad, and a half-time breather turns
   * the loop. */
  const MH_LEAD = 'F#5:4 D5:2 B4:2 F#5:4 A5:4 | G5:6 F#5:2 D5:4 B4:4 | A5:4 F#5:2 D5:2 A5:4 C#6:4 | B5:6 A5:2 E5:8 | ' +
    'G5:4 B5:4 E6:6 D6:2 | D6:4 B5:2 G5:2 D6:4 B5:4 | A5:4 F#5:2 A5:2 D6:4 F#6:4 | E6:8 C#6:4 A5:4 | ' +
    'B5:4 G5:2 B5:2 E6:4 D6:4 | D6:4 B5:2 G5:2 B5:4 D6:4 | C#6:4 B5:4 C#6:4 B5:4 | A#5:8 C#6:4 F#5:4';
  SONGS['menu-hyper'] = {
    id: 'menu-hyper', title: 'Ignition Grid', bpm: 128, bars: 20,
    key: ['B', 'minor'], scale: MIN_PENT,
    chords: 'Bm | G | D | A | Bm | G | D | A | Em | G | D | A | Em | G | F#sus4 | F# | Bm | G | D | A',
    parts: [
      { v: 'sawLead', n: MH_LEAD, from: 5, g: 0.38, rev: 0.22, dly: 0.3 },
      { v: 'arpSaw', arp: '0 1 2 3 2 1 2 3', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'B3', hi: 'B5', g: 0.25, pan: 0.3, dly: 0.2, pump: 1 },
      { v: 'supersaw', chord: 'x...............', lo: 'D4', hi: 'B5', voices: 4, bars: [9, 16], g: 0.3, rev: 0.3, pump: 1, fx: { gate: 'x.xx.x.xx.x.x.xx' } },
      { v: 'synthBrass', chord: 'x.......x...x...', lo: 'D4', hi: 'D5', voices: 3, bars: [1, 8], g: 0.14, rev: 0.25, pump: 1 },
      { v: 'airPad', chord: 'x...............', lo: 'D4', hi: 'B5', voices: 4, bars: [17, 20], g: 0.17, rev: 0.4 },
      { v: 'synthBass', bass: '1.8.1.8.1.8.1.8.', lo: 'F#1', g: 0.38 },
      { v: 'riser', n: 'C5:16 | -:16', from: 15, g: 0.46, rev: 0.3 }
    ],
    drums: {
      kit: 'synthwave', g: 0.55,
      pat: {
        I: { k: 'x...x...x...x...', h: 'x.x.x.x.x.x.x.x.' },
        A: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', o: '..o...o...o...o.' },
        F: { k: 'x...x...x...x...', s: '....x.......x.xx', t: '........x.x.....', u: '..........x.x.x.', h: 'xoxoxoxo........' },
        H: { k: 'x.......x.......', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' }
      },
      order: 'IIIA AAAF AAAAAAAF HHHH', crash: [5, 9]
    },
    mix: { rev: [0.86, 0.3, 0.5], dly: [0.75, 0.35, 2800, 0.45], pump: [0.5, 0.12], lv: -13.5 }
  };

  /* ── Cozy 1 — "Lantern Garden" (E♭ major, 76, gentle swing) ───────────────
   * Dusk among paper lanterns: a felt piano sings over soft rolled chords
   * while kalimba fireflies blink in the high register, left and right.
   * The kalimba takes the second tune with the piano comping and an airy
   * pad; then the drums drop to brush swirls for a breath before the loop. */
  const LG_A = 'G5:4 Bb5:2 D6:2 C6:4 Bb5:4 | G5:6 F5:2 Eb5:4 D5:4 | C5:2 Eb5:2 G5:2 C6:6 Bb5:2 G5:2 | Ab5:8 F5:4 D5:4 | ' +
    'Bb4:2 Eb5:2 G5:2 Bb5:6 C6:2 D6:2 | D6:6 C6:2 Bb5:4 G5:4 | Ab5:4 G5:2 Eb5:2 C5:4 Eb5:4 | F5:6 Eb5:2 D5:8';
  const LG_B = 'Eb5:2 G5:2 Bb5:2 D6:2 C6:4 G5:4 | Bb5:3 G5:1 F5:4 D5:4 F5:4 | Eb5:2 Ab5:2 C6:2 Eb6:6 C6:2 Ab5:2 | D6:4 Bb5:4 G5:8 | ' +
    'Ab5:2 C6:2 Eb6:4 C6:2 Ab5:2 F5:4 | G5:4 Bb5:2 D6:2 F6:4 D6:4 | Eb6:6 C6:2 Ab5:4 G5:4 | F5:8 Eb5:4 r:4';
  const LG_C = 'C6:4 Bb5:4 G5:4 Eb5:4 | D5:4 F5:4 Bb5:8 | Ab5:4 G5:4 F5:4 C5:4 | Eb5:8 D5:4 F5:4';
  SONGS['lantern-garden'] = {
    id: 'lantern-garden', title: 'Lantern Garden', bpm: 76, bars: 20, swing: 0.25, human: 0.008,
    key: ['Eb', 'major'], scale: MAJ_PENT,
    chords: 'Ebmaj9 | Cm9 | Abmaj7 | Bb7sus4 Bb7 | Ebmaj9 | Gm7 | Abmaj9 | Fm7 Bb7 | ' +
      'Cm9 | Gm7 | Abmaj7 | Ebmaj7 | Fm9 | Gm7 | Abmaj7 | Bb7sus4 | Abmaj9 | Gm7 | Fm9 | Bb7sus4 Bb7',
    parts: [
      { v: 'felt', n: LG_A, g: 0.5, pan: 0.05, rev: 0.28, dly: 0.12, gate: 1 },
      { v: 'kalimba', n: LG_B, from: 9, g: 0.34, pan: 0.1, rev: 0.25, dly: 0.18 },
      { v: 'felt', n: LG_C, from: 17, g: 0.52, rev: 0.3, dly: 0.15, gate: 1 },
      { v: 'kalimba', arp: '4 2 3 1', rhythm: '..x.......x..x..', lo: 'Eb5', hi: 'Eb6', bars: [1, 8], g: 0.11, pan: -0.45, dly: 0.35, rev: 0.3 },
      { v: 'kalimba', arp: '3 5 2 4', rhythm: '......x.x.....x.', lo: 'Eb5', hi: 'Eb6', bars: [9, 20], g: 0.11, pan: 0.45, dly: 0.35, rev: 0.3 },
      { v: 'felt', chord: 'x...............', lo: 'Eb3', hi: 'Bb4', voices: 4, roll: 0.03, bars: [1, 8], g: 0.12, pan: -0.15, rev: 0.25, gate: 1 },
      { v: 'felt', chord: 'x.....x.....x...', lo: 'Eb3', hi: 'C5', voices: 4, rootless: 1, roll: 0.025, bars: [9, 16], g: 0.12, pan: -0.15, rev: 0.25 },
      { v: 'warmPad', chord: 'x...............', lo: 'G3', hi: 'Eb5', voices: 3, bars: [1, 8], g: 0.1, rev: 0.35 },
      { v: 'airPad', chord: 'x...............', lo: 'G3', hi: 'Eb5', voices: 4, bars: [9, 20], g: 0.11, rev: 0.4 },
      { v: 'upright', bass: '1.......5.....a.', lo: 'Bb1', bars: [1, 8], g: 0.58 },
      { v: 'upright', bass: '1.....1.5.....a.', lo: 'Bb1', bars: [9, 16], g: 0.52 },
      { v: 'upright', bass: '1...............', lo: 'Bb1', bars: [17, 20], g: 0.76 }
    ],
    drums: {
      kit: 'brushes', g: 0.63,
      pat: {
        A: { k: 'x.........x.....', b: '....x.......x...', w: 'o...o...o...o...' },
        B: { k: 'x.........x.x...', b: '....x.......x..g', w: 'o...o...o...o...', S: '..o...o...o...o.' },
        C: { w: 'o.......o.......', S: '..o...o...o...o.' },
        F: { k: 'x.........x.....', b: '....x...g.x.x.x.', w: 'o...o...........' }
      },
      order: 'AAAAAAAF BBBBBBBF CCCF'
    },
    mix: { rev: [0.85, 0.45, 0.45], dly: [0.75, 0.3, 2200, 0.3], lv: -15, wow: [0.5, 0.35], vinyl: 0.03, lp: 7500 }
  };

  /* ── Cozy 2 — "Moonlit Lake" (D major, 68) ────────────────────────────────
   * Still water at night: a harp ripples in sixteenths while a vibraphone
   * sings slow, wide notes, and the E-over-D chord gives the moonlight its
   * Lydian shimmer. An airy pad drifts from side to side; drips fall into
   * the lake and echo away. The drums are only a heartbeat, and they wait
   * four bars before they come in. */
  const ML_A = 'F#5:8 A5:4 C#6:4 | B5:8 G#5:4 E5:4 | A5:4 F#5:4 C#6:6 A5:2 | B5:12 G#5:4 | ' +
    'D6:6 C#6:2 B5:4 F#5:4 | F#5:8 G5:4 B5:4 | B5:6 A5:2 F#5:4 E5:4 | E5:8 D5:4 E5:4';
  const ML_B = 'D6:6 B5:2 F#6:8 | E6:6 C#6:2 A5:8 | C#6:6 A5:2 E6:8 | D6:8 B5:4 F#5:4 | ' +
    'B5:4 D6:4 F#6:6 E6:2 | C#6:8 A5:4 E5:4 | F#5:6 G5:2 B5:4 D6:4 | E6:8 D6:4 A5:4';
  SONGS['moonlit-lake'] = {
    id: 'moonlit-lake', title: 'Moonlit Lake', bpm: 68, bars: 16, human: 0.007,
    key: ['D', 'major'], scale: MAJ_PENT,
    chords: 'Dmaj7 | E/D | Dmaj7 | E/D | Bm7 | Gmaj7 | Em9 | A7sus4 | Gmaj7 | A/G | F#m7 | Bm7 | Gmaj7 | F#m7 | Em9 | A7sus4',
    parts: [
      { v: 'vibes', n: ML_A, g: 0.42, pan: 0.05, rev: 0.4, dly: 0.2 },
      { v: 'vibes', n: ML_B, from: 9, g: 0.43, pan: 0.05, rev: 0.4, dly: 0.2 },
      { v: 'bellSoft', n: ML_B, from: 9, g: 0.19, pan: 0.3, rev: 0.45 },
      { v: 'harp', arp: '0 1 2 3 4 5 6 5 4 3 2 1 2 3 4 5', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'D3', hi: 'A5', g: 0.2, pan: -0.25, rev: 0.35, vel: 0.8 },
      { v: 'airPad', chord: 'x...............', lo: 'A3', hi: 'F#5', voices: 4, g: 0.13, rev: 0.45, fx: { autopan: [0.125, 0.4] } },
      { v: 'sub', bass: '1...............', lo: 'A1', g: 0.28, P: { s: 0.8, d: 1.5 } },
      { v: 'bloop', n: 'r:10 A5:2 r:4 | r:16 | r:4 F#5:2 r:10 | r:12 D6:2 r:2', rep: true, g: 0.38, pan: 0.4, dly: 0.45, rev: 0.4, P: { drop: 0.35, tau: 0.12 } }
    ],
    drums: {
      kit: 'brushes', g: 0.62,
      pat: {
        N: {},
        A: { k: 'x.........x.....', w: 'o.......o.......', r: '........o.......' },
        F: { k: 'x.........x.....', w: 'o.......o...o...', t: '............o.o.' }
      },
      order: 'NNNN AAAF AAAA AAAF'
    },
    mix: { rev: [0.9, 0.45, 0.6], dly: [1.5, 0.35, 2000, 0.3], lv: -15.5, lp: 7500 }
  };

  /* ── Cozy 3 — "Snowglobe Hollow" (F major, waltz in 3/4, 84) ──────────────
   * Snow falling past a cabin window: a music box turns a slow waltz while
   * a felt piano plays the "oom-pah-pah" and warm strings hold the chords;
   * a celesta takes the second verse, and in the last part harp replaces
   * the piano and sleigh bells shiver softly on each downbeat. */
  const SG_A = 'C5:4 F5:4 A5:4 | C6:8 A5:4 | Bb5:4 A5:4 F5:4 | A5:8 G5:4 | F5:4 Bb5:4 D6:4 | C6:6 Bb5:2 G5:4 | A5:4 G5:2 F5:2 C5:4 | E5:8 G5:4';
  const SG_B = 'A5:4 D6:4 F6:4 | E6:8 C6:4 | D6:4 C6:2 Bb5:2 F5:4 | A5:8 C6:4 | Bb5:4 D6:4 F6:4 | E6:6 C#6:2 A5:4 | D6:4 A5:4 F5:4 | G5:4 Bb5:4 E6:4';
  const SG_C = 'F6:6 D6:2 Bb5:4 | E6:6 C6:2 G5:4 | C6:4 A5:4 E5:4 | F5:4 A5:4 D6:4 | Bb5:6 A5:2 G5:4 | Bb5:4 C6:4 E5:4 | F5:8 A5:4 | G5:8 Bb4:4';
  SONGS['snowglobe-hollow'] = {
    id: 'snowglobe-hollow', title: 'Snowglobe Hollow', bpm: 84, bars: 24, spb: 12, human: 0.008,
    key: ['F', 'major'], scale: MAJ_PENT,
    chords: 'F | Am | Bbmaj7 | F | Gm7 | C7 | F | C7 | Dm | Am | Bb | F | Gm7 | A7 | Dm | C7 | Bbmaj7 | C | Am7 | Dm | Gm7 | C7 | F | C7sus4',
    parts: [
      { v: 'musicBox', n: SG_A, g: 0.48, pan: 0.05, rev: 0.32, dly: 0.12 },
      { v: 'celesta', n: SG_B, from: 9, g: 0.54, pan: 0.05, rev: 0.32, dly: 0.12 },
      { v: 'musicBox', n: SG_C, from: 17, g: 0.48, pan: -0.1, rev: 0.32 },
      { v: 'celesta', n: SG_C, from: 17, oct: -1, g: 0.28, pan: 0.2, rev: 0.32 },
      { v: 'strings', chord: 'x...........', lo: 'C3', hi: 'A4', voices: 4, g: 0.23, rev: 0.35 },
      { v: 'felt', chord: '....x...x...', lo: 'A3', hi: 'A4', voices: 3, roll: 0.01, bars: [1, 16], g: 0.15, pan: 0.2, gate: 0.7 },
      { v: 'harp', chord: '....x...x...', lo: 'A3', hi: 'C5', voices: 3, roll: 0.03, bars: [17, 24], g: 0.25, pan: 0.2 },
      { v: 'upright', bass: '1...........', lo: 'Bb1', g: 1.03 }
    ],
    drums: {
      kit: 'brushes', g: 0.85,
      pat: {
        A: { k: 'x...........', b: '....o...o...', w: 'o...........' },
        C: { k: 'x...........', b: '....o...o...', w: 'o...........', l: 'o...........' },
        F: { k: 'x...........', b: '....o...o.o.', w: 'o.......o...' }
      },
      order: 'AAAAAAAF AAAAAAAF CCCCCCCF'
    },
    mix: { rev: [0.88, 0.4, 0.55], dly: [1.0, 0.25, 2400, 0.25], lv: -15, wow: [0.4, 0.3], vinyl: 0.025, lp: 7500 }
  };

  /* ── Vivid 1 — "Sugar Rush" (C major, 120, shuffle) ───────────────────────
   * Candy land: a staccato toy piano hops up the chord and tumbles down, a
   * xylophone takes the second tune with a marimba a third below, and the
   * last section lifts through A♭ and B♭ on a four-on-the-floor sugar high.
   * Bubbles pop all the way through. */
  const SR_A = 'G5:1 r:1 C6:1 r:1 E6:2 D6:1 C6:1 D6:2 E6:2 G5:4 | A5:1 r:1 C6:1 r:1 E6:4 D6:2 C6:2 A5:4 | F5:1 r:1 A5:1 r:1 D6:2 C6:1 A5:1 C6:2 D6:2 F6:4 | E6:2 D6:2 B5:2 G5:2 F5:4 r:4 | ' +
    'G5:1 r:1 C6:1 r:1 E6:2 D6:1 C6:1 D6:2 E6:2 G6:4 | E6:3 D6:1 C6:2 A5:2 C6:4 E6:4 | F6:2 E6:2 C6:2 A5:2 B5:2 D6:2 G6:4 | C6:4 G5:2 E5:2 C5:4 r:4';
  const SR_B = 'A5:3 C6:1 F6:4 E6:2 C6:2 A5:4 | B5:3 D6:1 G6:4 F6:2 D6:2 B5:4 | G5:2 B5:2 E6:2 G6:2 D6:4 B5:4 | C#6:3 E6:1 G6:4 E6:2 C#6:2 A5:4 | ' +
    'F6:4 D6:2 A5:2 C6:4 A5:4 | B5:2 D6:2 F6:2 D6:2 G6:4 F6:4 | E6:2 G6:2 B5:2 E6:2 C#6:2 E6:2 G6:4 | F6:4 D6:4 B5:4 G5:4';
  const SR_C = 'A5:2 C6:2 E6:4 D6:2 C6:2 A5:4 | B5:2 D6:2 G6:4 F6:2 E6:2 D6:4 | E6:4 B5:4 G5:4 B5:4 | C6:4 E6:4 A5:8 | ' +
    'Eb6:2 C6:2 Ab5:4 C6:2 Eb6:2 C6:4 | D6:2 F6:2 Bb5:4 D6:2 F6:2 D6:4 | E6:4 G6:4 E6:2 D6:2 C6:4 | D6:2 B5:2 G5:2 F5:2 D5:2 F5:2 B5:4';
  SONGS['sugar-rush'] = {
    id: 'sugar-rush', title: 'Sugar Rush', bpm: 120, bars: 24, swing: 0.35, human: 0.003,
    key: ['C', 'major'], scale: MAJ_PENT,
    chords: 'C | Am7 | Dm7 | G7 | C | Am7 | F G | C | F | G | Em7 | A7 | Dm7 | G7 | Em7 A7 | Dm7 G7 | Fmaj7 | G | Em7 | Am | Ab | Bb | C | G7',
    parts: [
      { v: 'toy', n: SR_A, g: 0.5, pan: 0.05, rev: 0.18, dly: 0.12 },
      { v: 'xylo', n: SR_B, from: 9, g: 0.52, pan: 0.05, rev: 0.18 },
      { v: 'marimba', n: SR_B, from: 9, harm: -2, g: 0.21, pan: -0.3, rev: 0.18 },
      { v: 'toy', n: SR_C, from: 17, g: 0.54, rev: 0.2, dly: 0.12 },
      { v: 'xylo', n: SR_C, from: 17, oct: -1, g: 0.27, pan: -0.25 },
      { v: 'bloop', n: 'r:6 E6:2 r:6 C6:2 | r:4 G5:2 r:6 D6:2 r:2', rep: true, g: 0.3, pan: -0.35, dly: 0.2 },
      { v: 'bassPluck', bass: '1.5.8.5.1.5.8.5.', lo: 'A1', g: 0.46 },
      { v: 'ep', chord: '..x...x...x...x.', lo: 'C4', hi: 'C5', voices: 3, roll: 0.004, g: 0.16, pan: -0.25, gate: 0.5 },
      { v: 'warmPad', chord: 'x...............', lo: 'E3', hi: 'C5', voices: 3, bars: [17, 24], g: 0.11, rev: 0.3 }
    ],
    drums: {
      kit: 'pop', g: 0.56,
      pat: {
        A: { k: 'x.....x.x.......', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', S: '..x...x...x...x.' },
        B: { k: 'x.....x.x.....x.', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', m: '..x...x...x...x.' },
        C: { k: 'x...x...x...x...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..o...o...o...o.', S: 'xoxoxoxoxoxoxoxo' },
        F: { k: 'x.....x.x.......', c: '....x.......x.xx', h: 'x.x.x.x.........', t: '........x.x.....', u: '............x.x.' }
      },
      order: 'AAAAAAAF BBBBBBBF CCCCCCCF', crash: [1, 9, 17]
    },
    mix: { rev: [0.7, 0.4, 0.35], dly: [0.75, 0.28, 3000, 0.35], lv: -14 }
  };

  /* ── Vivid 2 — "Carnival Skies" (B♭ major, 116) ───────────────────────────
   * Balloons, kites and confetti over a fairground: a calliope pipes a
   * syncopated tune over a samba-lite groove (surdo, tamborim, agogô,
   * shaker), a brass section answers in the middle with marimba doubling,
   * and the calliope returns with a glockenspiel for a lilting last verse. */
  const CS_A = 'F5:2 Bb5:2 r:1 D6:3 C6:2 Bb5:2 F5:4 | G5:2 Bb5:2 r:1 D6:3 F6:2 D6:2 Bb5:4 | Eb6:3 D6:3 C6:2 G5:3 Bb5:3 C6:2 | A5:6 C6:2 Eb6:4 r:4 | ' +
    'F5:2 Bb5:2 r:1 D6:3 F6:2 D6:2 Bb5:4 | D6:3 C6:3 Bb5:2 G5:4 F5:4 | G5:2 Bb5:2 Eb6:4 F5:2 A5:2 C6:4 | Bb5:4 F5:2 D5:2 Bb4:4 r:4';
  const CS_B = 'G5:4 Bb5:4 Eb6:6 D6:2 | C6:4 A5:4 F5:6 G5:2 | A5:4 F5:2 A5:2 D6:4 C6:4 | Bb5:6 A5:2 G5:8 | ' +
    'G5:2 Bb5:2 C6:2 Eb6:6 D6:2 C6:2 | A5:4 C6:4 Eb6:4 C6:4 | F6:4 D6:4 B5:4 G5:4 | Eb6:4 C6:4 A5:4 F5:4';
  const CS_C = 'D6:6 Bb5:2 G5:4 Bb5:4 | C6:6 A5:2 F5:4 A5:4 | Bb5:6 G5:2 Eb5:4 G5:4 | F5:8 D5:4 F5:4 | ' +
    'G5:2 Bb5:2 D6:4 Eb6:4 D6:4 | C6:4 A5:4 B5:4 D6:4 | Eb6:4 D6:2 C6:2 Bb5:4 G5:4 | A5:4 C6:4 Eb6:2 C6:2 A5:2 C6:2';
  SONGS['carnival-skies'] = {
    id: 'carnival-skies', title: 'Carnival Skies', bpm: 116, bars: 24, swing: 0.12, human: 0.004,
    key: ['Bb', 'major'], scale: MAJ_PENT,
    chords: 'Bb | Gm7 | Cm7 | F7 | Bb | Gm7 | Eb F | Bb | Eb | F | Dm7 | Gm7 | Cm7 | F7 | Dm7 G7 | Cm7 F7 | ' +
      'Ebmaj7 | Dm7 | Cm7 | Bb | Ebmaj7 | Dm7 G7 | Cm7 | F7',
    parts: [
      { v: 'calliope', n: CS_A, g: 0.38, pan: 0.05, rev: 0.2, dly: 0.08 },
      { v: 'brass', n: CS_B, from: 9, g: 0.64, rev: 0.22 },
      { v: 'marimba', n: CS_B, from: 9, g: 0.24, pan: 0.3 },
      { v: 'calliope', n: CS_C, from: 17, g: 0.35, rev: 0.22, dly: 0.1 },
      { v: 'glock', n: CS_C, from: 17, g: 0.17, pan: 0.35, rev: 0.2 },
      { v: 'marimba', chord: '..x...x...x...x.', lo: 'D4', hi: 'D5', voices: 3, roll: 0.004, bars: [1, 8], g: 0.12, pan: -0.3 },
      { v: 'brass', chord: 'x.....x...x.....', lo: 'F4', hi: 'F5', voices: 3, bars: [9, 16], g: 0.26, pan: -0.25, gate: 0.4 },
      { v: 'organ', chord: '..x...x...x...x.', lo: 'D4', hi: 'D5', voices: 3, bars: [17, 24], g: 0.16, pan: -0.3, gate: 0.5 },
      { v: 'bassPluck', bass: '1..1..5.1..1..5.', lo: 'Bb1', g: 0.58 }
    ],
    drums: {
      kit: 'samba', g: 0.86,
      pat: {
        A: { k: 'x.......X.......', t: 'x.xx.x.x.xx.x.x.', a: 'x...x.....x.x...', A: '..x.....x.......', S: 'XoxoXoxoXoxoXoxo', c: '....x.......x...' },
        B: { k: 'x.......X.......', t: 'x.xx.x.x.xx.x.x.', S: 'XoxoXoxoXoxoXoxo', c: '....x.......x...', s: 'g.g.g.ggg.g.g.gg', q: 'x.....x.x.......', w: '...x.....x..x...' },
        C: { k: 'x.......X.......', a: 'x...x.....x.x...', A: '..x.....x.......', S: 'XoxoXoxoXoxoXoxo', c: '....x.......x...' },
        F: { k: 'x.......X.......', S: 'XoxoXoxo........', s: 'x.x.x.x.xxxxXXXX', c: '....x...........' }
      },
      order: 'AAAAAAAF BBBBBBBF CCCCCCCF', crash: [1, 9, 17]
    },
    mix: { rev: [0.72, 0.4, 0.35], dly: [0.5, 0.25, 2800, 0.3], lv: -14 }
  };

  /* ── Vivid 3 — "Coral Groove" (A major, 108) ──────────────────────────────
   * A bright reef: a steel pan leads a tropical groove — marimba plucks on
   * the off-beats breathing with the kick, a round sub bass, congas and a
   * shaker — then trades phrases with a marimba. The last section sinks
   * into a dreamy vibraphone breakdown among the bubbles before the kick
   * swims back in. */
  const CG_A = 'E5:2 A5:2 r:1 C#6:3 B5:2 A5:2 E5:4 | G#5:2 B5:2 r:1 E6:3 B5:2 G#5:2 E5:4 | A5:3 C#6:3 E6:2 C#6:3 A5:3 F#5:2 | F#5:4 A5:2 C#6:2 B5:4 A5:4 | ' +
    'E5:2 A5:2 r:1 C#6:3 E6:2 F#6:2 E6:4 | B5:3 G#5:3 E5:2 G#5:4 B5:4 | D6:3 C#6:3 B5:2 F#5:4 A5:4 | A5:4 F#5:4 G#5:4 B5:4';
  const CG_B = 'C#6:2 C#6:2 r:2 A5:2 C#6:2 E6:2 r:2 C#6:2 | A5:2 A5:2 r:2 F#5:2 A5:2 C#6:2 r:2 A5:2 | E6:4 C#6:2 A5:2 B5:2 C#6:2 E6:4 | G#5:6 B5:2 E6:8 | ' +
    'C#6:2 C#6:2 r:2 E6:2 F#6:4 E6:4 | C#6:4 A5:2 F#5:2 A5:4 C#6:4 | D6:4 B5:2 A5:2 F#5:4 D6:4 | D6:4 B5:4 G#5:4 E5:4';
  const CG_C = 'F#5:8 A5:4 C#6:4 | G#5:8 E5:4 B5:4 | F#5:8 D5:4 A5:4 | E5:4 G#5:4 C#6:8 | ' +
    'A5:6 C#6:2 F#6:8 | E6:6 B5:2 G#5:8 | F#5:4 A5:4 D6:4 C#6:4 | B5:8 A5:4 D5:4';
  SONGS['coral-groove'] = {
    id: 'coral-groove', title: 'Coral Groove', bpm: 108, bars: 24, swing: 0.1, human: 0.004,
    key: ['A', 'major'], scale: MAJ_PENT,
    chords: 'Amaj7 | E/G# | F#m7 | Dmaj7 | Amaj7 | E/G# | Bm7 | Dmaj7 E | F#m7 | Dmaj7 | Amaj7 | E | F#m7 | Dmaj7 | Bm7 | E7sus4 E | ' +
      'Dmaj7 | C#m7 | Bm7 | Amaj7 | Dmaj7 | C#m7 | Bm7 | E7sus4',
    parts: [
      { v: 'steel', n: CG_A + ' | ' + CG_B, g: 0.45, pan: 0.05, rev: 0.22, dly: 0.12 },
      { v: 'marimba', n: CG_B, from: 9, oct: -1, g: 0.27, pan: -0.3 },
      { v: 'vibes', n: CG_C, from: 17, g: 0.43, rev: 0.4, dly: 0.25 },
      { v: 'marimba', chord: '..x...x...x..x..', lo: 'E4', hi: 'E5', voices: 3, roll: 0.006, bars: [1, 16], g: 0.13, pan: 0.25, pump: 1 },
      { v: 'airPad', chord: 'x...............', lo: 'C#4', hi: 'A5', voices: 4, g: 0.17, rev: 0.4, pump: 1, fx: { lp: 1800, autopan: [0.125, 0.3] } },
      { v: 'sub', bass: '1.....1...1.5...', lo: 'A1', g: 0.55 },
      { v: 'bloop', n: 'r:6 E6:1 r:5 B5:1 r:3 | r:2 C#6:1 r:9 A5:1 r:3', rep: true, g: 0.47, pan: -0.4, dly: 0.3, rev: 0.3, P: { drop: 0.8, tau: 0.06 } },
      { v: 'kalimba', arp: '0 2 1 3', rhythm: '......x.......x.', lo: 'A5', hi: 'A6', bars: [17, 24], g: 0.18, pan: 0.4, dly: 0.35 }
    ],
    drums: {
      kit: 'tropical', g: 0.78,
      pat: {
        A: { k: 'x...x...x...x...', n: '....x.......x...', S: 'x.xxx.xxx.xxx.xx', h: '..x...x...x...x.', q: '......x.......x.', w: '...x......x.....' },
        B: { k: 'x...x...x...x...', c: '....x.......x...', n: '....x.......x...', S: 'x.xxx.xxx.xxx.xx', h: '..x...x...x...x.', q: '......x.......x.', w: '...x......x.....' },
        C: { S: 'x.xxx.xxx.xxx.xx', q: '......x.......x.', w: '...x......x.....', l: '..x.....x..x....' },
        D: { k: 'x...x...x...x...', S: 'x.xxx.xxx.xxx.xx', h: '..x...x...x...x.', q: '......x.......x.', w: '...x......x.....' },
        F: { k: 'x...x...x...x...', n: '....x.......x...', S: 'x.xxx.xx........', t: '........x.x.....', u: '..........x.x.x.' }
      },
      order: 'AAAAAAAF BBBBBBBF CCCCDDDF', crash: [1, 9]
    },
    mix: { rev: [0.82, 0.4, 0.45], dly: [0.75, 0.3, 2400, 0.35], pump: [0.25, 0.12], lv: -14 }
  };

  /* ── Hyper 1 — "Neon Highway" (F♯ minor, 120) ─────────────────────────────
   * Outrun on a grid under a striped retro sun: an octave saw bass, gated
   * snares in a big room, synth-brass chords on i–VI–III–VII; a saw lead
   * takes the hook and soars over a trance-gated pad, the bass doubles into
   * sixteenths, and a pulse lead brings the opening hook home. */
  const NH_B = 'F#5:6 D5:2 B4:4 D5:4 | E5:4 F#5:4 A5:8 | C#6:6 B5:2 A5:4 F#5:4 | G#5:8 E5:4 B4:4 | ' +
    'D6:6 C#6:2 B5:4 F#5:4 | A5:6 B5:2 C#6:4 D6:4 | F#5:4 G#5:4 C#6:8 | E#5:8 G#5:4 C#6:4';
  const NH_C = 'F#5:4 A5:4 D6:6 C#6:2 | B5:4 G#5:4 E5:8 | A5:4 C#6:4 F#6:8 | E6:4 C#6:4 A5:4 F#5:4 | ' +
    'A5:4 D6:4 F#6:6 E6:2 | E6:8 B5:4 G#5:4 | G#5:6 F#5:2 C#6:8 | C#6:8 G#5:4 E#5:4';
  const NH_D = 'C#6:3 C#6:3 A5:2 F#5:4 A5:4 | B5:3 A5:3 F#5:2 D5:4 F#5:4 | E5:3 A5:3 C#6:2 E6:4 C#6:4 | B5:8 G#5:4 E5:4 | ' +
    'C#6:3 C#6:3 A5:2 F#5:4 C#6:4 | D6:3 C#6:3 A5:2 F#5:4 D6:4 | E6:6 C#6:2 A5:4 C#6:4 | B5:8 G#5:8';
  SONGS['neon-highway'] = {
    id: 'neon-highway', title: 'Neon Highway', bpm: 120, bars: 32, human: 0.0015,
    key: ['F#', 'minor'], scale: MIN_PENT,
    chords: 'F#m | D | A | E | F#m | D | A | E | Bm | D | F#m | E | Bm | D | C#sus4 | C# | ' +
      'D | E | F#m | F#m | D | E | C#sus4 | C# | F#m | D | A | E | F#m | D | A | E',
    parts: [
      { v: 'synthBrass', chord: 'x.......x...x...', lo: 'C#4', hi: 'C#5', voices: 3, bars: [1, 8], g: 0.15, rev: 0.25, pump: 1 },
      { v: 'synthBrass', chord: 'x.......x...x...', lo: 'C#4', hi: 'C#5', voices: 3, bars: [25, 32], g: 0.15, rev: 0.25, pump: 1 },
      { v: 'supersaw', chord: 'x...............', lo: 'C#4', hi: 'A5', voices: 4, bars: [9, 16], g: 0.22, rev: 0.3, pump: 1 },
      { v: 'supersaw', chord: 'x...............', lo: 'C#4', hi: 'A5', voices: 4, bars: [17, 24], g: 0.31, rev: 0.3, pump: 1, fx: { gate: 'x.xxx.xxx.xxx.xx' } },
      { v: 'arpSaw', arp: '0 1 2 1 3 1 2 1', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'F#3', hi: 'F#5', g: 0.28, pan: 0.3, dly: 0.25, pump: 1 },
      { v: 'sawLead', n: NH_B + ' | ' + NH_C, from: 9, g: 0.4, rev: 0.25, dly: 0.3 },
      { v: 'lead', n: NH_D, from: 25, g: 0.33, rev: 0.25, dly: 0.3 },
      { v: 'sawLead', n: NH_D, from: 25, oct: -1, g: 0.15, pan: -0.25 },
      { v: 'synthBass', bass: '1.8.1.8.1.8.1.8.', lo: 'F#1', bars: [1, 16], g: 0.4 },
      { v: 'synthBass', bass: '1818181818181818', lo: 'F#1', bars: [17, 24], g: 0.38 },
      { v: 'synthBass', bass: '1.8.1.8.1.8.1.8.', lo: 'F#1', bars: [25, 32], g: 0.4 },
      { v: 'riser', n: 'C5:16 | -:16', from: 7, g: 0.48, rev: 0.3 },
      { v: 'riser', n: 'C5:16 | -:16', from: 23, g: 0.51, rev: 0.3 }
    ],
    drums: {
      kit: 'synthwave', g: 0.55,
      pat: {
        A: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        B: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', o: '..o...o...o...o.' },
        C: { k: 'x...x...x..xx...', s: '....x.......x...', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', o: '..o...o...o...o.' },
        F: { k: 'x...x...x...x...', s: '....x.......x...', t: '........x.x.x...', u: '..........x.x.x.', h: 'x.x.x.x.........' }
      },
      order: 'AAAAAAAF BBBBBBBF CCCCCCCF AAAAAAAF', crash: [1, 9, 17, 25]
    },
    mix: { rev: [0.88, 0.3, 0.55], dly: [0.75, 0.38, 2600, 0.45], pump: [0.45, 0.12], lv: -13.5 }
  };

  /* ── Hyper 2 — "Starlight Warp" (D minor, 132) ────────────────────────────
   * Into the hyperspace tunnel: a rolling off-beat bass, saw arpeggios and a
   * glassy bell arpeggio high above; a bell sings the theme over a trance
   * gate; the drums fall away for a weightless breakdown, a snare roll and
   * a riser build, and the full theme bursts back on saw lead and bells. */
  const SW_B = 'D6:4 Bb5:2 G5:2 D6:4 F6:4 | F6:6 D6:2 Bb5:8 | A5:4 D6:4 F6:4 E6:4 | E6:8 C6:4 G5:4 | ' +
    'G5:4 Bb5:4 D6:4 G6:4 | F6:6 D6:2 Bb5:4 C6:4 | D6:8 E6:8 | C#6:8 E6:4 A5:4';
  const SW_C = 'D5:4 F5:4 Bb5:4 D6:4 | E5:4 G5:4 C6:4 E6:4 | A5:4 D6:4 E6:8 | C#6:4 E6:4 C#6:4 A5:4';
  const SW_D = 'A5:3 A5:3 F5:2 D6:4 C6:4 | D6:3 D6:3 Bb5:2 F6:4 D6:4 | C6:3 C6:3 A5:2 F6:4 E6:4 | E6:6 D6:2 C6:4 G5:4 | ' +
    'Bb5:3 Bb5:3 G5:2 D6:4 Bb5:4 | D6:3 D6:3 F6:2 Bb5:4 D6:4 | E6:4 G6:4 E6:4 C6:4 | C#6:6 E6:2 A5:4 G5:4';
  SONGS['starlight-warp'] = {
    id: 'starlight-warp', title: 'Starlight Warp', bpm: 132, bars: 32, human: 0.0015,
    key: ['D', 'minor'], scale: MIN_PENT,
    chords: 'Dm | Bb | F | C | Dm | Bb | F | C | Gm | Bb | Dm | C | Gm | Bb | Asus4 | A | ' +
      'Bb | C | Dm | Dm | Bb | C | Asus4 | A | Dm | Bb | F | C | Gm | Bb | C | A7',
    parts: [
      { v: 'arpSaw', arp: '0 1 2 3 4 3 2 1', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'D3', hi: 'D5', bars: [1, 16], g: 0.28, pan: -0.25, dly: 0.25, pump: 1 },
      { v: 'arpSaw', arp: '0 1 2 3 4 3 2 1', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'D3', hi: 'D5', bars: [21, 32], g: 0.28, pan: -0.25, dly: 0.25, pump: 1 },
      { v: 'glassArp', arp: '0 2 4 2 1 3 5 3', rhythm: 'x.x.x.x.x.x.x.x.', lo: 'D5', hi: 'D6', bars: [9, 32], g: 0.12, pan: 0.35, dly: 0.35, rev: 0.3 },
      { v: 'supersaw', chord: 'x...............', lo: 'D4', hi: 'A5', voices: 4, bars: [9, 16], g: 0.41, rev: 0.3, pump: 1, fx: { gate: 'x..x..x.x..x..x.' } },
      { v: 'airPad', chord: 'x...............', lo: 'D4', hi: 'A5', voices: 4, bars: [17, 24], g: 0.23, rev: 0.45 },
      { v: 'supersaw', chord: 'x...............', lo: 'D4', hi: 'A5', voices: 4, bars: [25, 32], g: 0.31, rev: 0.3, pump: 1, fx: { gate: 'x.xxx.xxx.xxx.xx' } },
      { v: 'bell', n: SW_B, from: 9, g: 0.35, rev: 0.35, dly: 0.3 },
      { v: 'sawLead', n: SW_C, from: 21, g: 0.31, rev: 0.3, dly: 0.3 },
      { v: 'sawLead', n: SW_D, from: 25, g: 0.4, rev: 0.28, dly: 0.3 },
      { v: 'bell', n: SW_D, from: 25, g: 0.12, pan: 0.3, rev: 0.35 },
      { v: 'synthBass', bass: '-111-111-111-111', lo: 'F1', bars: [1, 16], g: 0.41, pump: 1 },
      { v: 'synthBass', bass: '-111-111-111-111', lo: 'F1', bars: [25, 32], g: 0.41, pump: 1 },
      { v: 'sub', bass: '1...............', lo: 'F1', bars: [17, 24], g: 0.32 },
      { v: 'riser', n: 'C5:16 | -:16 | -:16 | -:16', from: 21, g: 0.63, rev: 0.3, P: { f1: 3400 } }
    ],
    drums: {
      kit: 'hyper', g: 0.62,
      pat: {
        A: { k: 'x...x...x...x...', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', o: '..o...o...o...o.' },
        F: { k: 'x...x...x...x...', c: '....x.......x...', t: '........x.x.x.x.', u: '.........x.x.x.x', h: 'xoxoxoxo........' },
        N: { h: 'o.o.o.o.o.o.o.o.' },
        W: { n: 'o...o...o...o...' },
        X: { n: 'o.o.o.o.o.o.o.o.' },
        Y: { n: 'xxxxxxxxxxxxxxxx' },
        Z: { k: 'x...x...x...x...', n: 'xxxxxxxxXXXXXXXX' }
      },
      order: 'AAAAAAAF AAAAAAAF NNNN WXYZ AAAAAAAF', crash: [1, 9, 25]
    },
    mix: { rev: [0.9, 0.3, 0.55], dly: [0.75, 0.4, 3000, 0.45], pump: [0.55, 0.11], lv: -13.5 }
  };

  /* ── Hyper 3 — "Quasar Core" (E minor, 138) ───────────────────────────────
   * The hardest world: a galloping sixteenth bass, a heavy kick and a big
   * gated snare, a darker progression that sinks to F (the flat second)
   * like the pull of the black hole, lasers flickering across the stereo
   * field, a breakdown of pulsing rings, a riser, and a driving final riff
   * doubled an octave down. Intense, never shrill: every saw is filtered. */
  const QC_B = 'E5:3 E5:3 C5:2 A5:4 G5:4 | B5:6 G5:2 E5:8 | A5:3 A5:3 F5:2 C6:4 A5:4 | G5:6 F#5:2 E5:4 B4:4 | ' +
    'C6:3 C6:3 A5:2 E6:4 C6:4 | G5:3 G5:3 E5:2 C6:4 E6:4 | D6:6 C6:2 A5:4 F#5:4 | D#6:8 F#5:4 B5:4';
  const QC_C = 'E5:4 G5:4 C6:4 E6:4 | F#5:4 A5:4 D6:4 F#6:4 | D#6:8 F#6:8 | B5:4 D#6:4 F#6:8';
  const QC_D = 'B5:2 E6:2 B5:2 G5:2 B5:2 E6:2 G6:4 | G5:2 C6:2 G5:2 E5:2 G5:2 C6:2 E6:4 | A5:2 D6:2 A5:2 F#5:2 A5:2 D6:2 F#6:4 | F#6:6 D6:2 B5:8 | ' +
    'C6:2 E6:2 C6:2 A5:2 C6:2 E6:2 A5:4 | E6:2 G6:2 E6:2 C6:2 E6:2 G5:2 C6:4 | F#6:4 E6:2 D6:2 A5:4 F#5:4 | D#6:6 F#6:2 A5:4 B5:4';
  SONGS['quasar-core'] = {
    id: 'quasar-core', title: 'Quasar Core', bpm: 138, bars: 32, human: 0.0012,
    key: ['E', 'minor'], scale: MIN_PENT,
    chords: 'Em | C | D | Bm | Em | C | D | B7 | Am | Em | F | Em | Am | C | D | B | ' +
      'C | D | Em | Em | C | D | B | B | Em | C | D | Bm | Am | C | D | B7',
    parts: [
      { v: 'synthBass', bass: '1.111.111.111.11', lo: 'E1', bars: [1, 16], g: 0.38, pump: 1 },
      { v: 'synthBass', bass: '1.......1.......', lo: 'E1', bars: [17, 20], g: 0.35 },
      { v: 'synthBass', bass: '1.1.1.1.1.1.1.1.', lo: 'E1', bars: [21, 24], g: 0.39, pump: 1 },
      { v: 'synthBass', bass: '1.111.111.111.11', lo: 'E1', bars: [25, 32], g: 0.38, pump: 1 },
      { v: 'arpSaw', arp: '0 1 2 1 3 2 1 2', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'E3', hi: 'E5', bars: [1, 16], g: 0.28, pan: 0.3, dly: 0.2, pump: 1 },
      { v: 'arpSaw', arp: '0 1 2 1 3 2 1 2', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'E3', hi: 'E5', bars: [25, 32], g: 0.28, pan: 0.3, dly: 0.2, pump: 1 },
      { v: 'pluckSynth', arp: '0 2 1 3 2 4 3 5', rhythm: 'x.xx.xx.x.xx.xx.', lo: 'E4', hi: 'E6', bars: [17, 24], g: 0.31, pan: -0.3, dly: 0.35, rev: 0.3 },
      { v: 'supersaw', chord: 'x...............', lo: 'E4', hi: 'B5', voices: 4, bars: [9, 16], g: 0.35, rev: 0.3, pump: 1, fx: { gate: 'x.xx.xx.x.xx.x.x' } },
      { v: 'supersaw', chord: 'x...............', lo: 'E4', hi: 'B5', voices: 4, bars: [25, 32], g: 0.31, rev: 0.3, pump: 1, fx: { gate: 'xxx.xxx.xxx.xxx.' } },
      { v: 'airPad', chord: 'x...............', lo: 'E4', hi: 'B5', voices: 4, bars: [17, 24], g: 0.34, rev: 0.45, fx: { trem: [2, 0.6] } },
      { v: 'sawLead', n: QC_B, from: 9, g: 0.4, rev: 0.25, dly: 0.28 },
      { v: 'sawLead', n: QC_C, from: 21, g: 0.37, rev: 0.3, dly: 0.3 },
      { v: 'sawLead', n: QC_D, from: 25, g: 0.4, rev: 0.25, dly: 0.28 },
      { v: 'lead', n: QC_D, from: 25, oct: -1, g: 0.12, pan: -0.3 },
      { v: 'laser', n: 'r:12 E6:2 r:2 | r:4 B5:2 r:6 G5:2 r:2', from: 1, until: 16, rep: true, g: 0.5, pan: 0.35, dly: 0.3, rev: 0.25 },
      { v: 'laser', n: 'r:12 E6:2 r:2 | r:4 B5:2 r:6 G5:2 r:2', from: 25, rep: true, g: 0.49, pan: -0.35, dly: 0.3, rev: 0.25 },
      { v: 'riser', n: 'C5:16 | -:16 | -:16 | -:16', from: 21, g: 0.62, rev: 0.3 }
    ],
    drums: {
      kit: 'hyper', g: 0.58,
      pat: {
        A: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', o: '..o...o...o...o.' },
        B: { k: 'x...x...x...x.x.', s: '....x.......x...', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', o: '..o...o...o...o.' },
        F: { k: 'x...x...x...x...', s: '....x.......x...', t: '........x.x.x.x.', u: '.........x.x.x.x', h: 'xoxoxoxo........' },
        N: { h: 'o.o.o.o.o.o.o.o.' },
        W: { n: 'o...o...o...o...' },
        X: { n: 'o.o.o.o.o.o.o.o.' },
        Y: { n: 'xxxxxxxxxxxxxxxx' },
        Z: { k: 'x...x...x...x...', n: 'xxxxxxxxXXXXXXXX' }
      },
      order: 'AAAAAAAF BBBBBBBF NNNN WXYZ BBBBBBBF', crash: [1, 9, 17, 25]
    },
    mix: { rev: [0.86, 0.32, 0.5], dly: [0.75, 0.38, 2800, 0.4], pump: [0.55, 0.1], lv: -13 }
  };

  /* ══════════════════════════════════════════════════════════════════════
   * 9. Stingers — one-shot musical moments (rendered straight through)
   * ══════════════════════════════════════════════════════════════════════
   * `decay` is the room left after the last bar for the reverb to ring out.
   * `duck` is how far the background music dips while the stinger plays.
   */

  /* Cozy level complete — "Glow": a felt-piano arpeggio blooms into a held
   * maj7 shimmer over a rolled Fmaj9, the kalimba echoing it back. */
  SONGS['win-cozy'] = {
    id: 'win-cozy', title: 'Glow', oneShot: true, decay: 1.4, duck: 0.25, bpm: 72, bars: 1, human: 0.004,
    key: ['F', 'major'], scale: MAJ_PENT,
    chords: 'Fmaj9',
    parts: [
      { v: 'felt', n: 'C5:1 F5:1 A5:1 C6:1 E6:12', g: 0.5, rev: 0.35, dly: 0.15, gate: 1 },
      { v: 'kalimba', n: 'r:4 G5:1 A5:1 C6:1 E6:1 r:8', g: 0.25, pan: 0.3, dly: 0.3, rev: 0.3 },
      { v: 'felt', chord: '....x...........', lo: 'F3', hi: 'A4', voices: 4, roll: 0.035, g: 0.3, pan: -0.15, rev: 0.3, gate: 1 },
      { v: 'airPad', chord: 'x...............', lo: 'A3', hi: 'G5', voices: 4, g: 0.12, rev: 0.4, P: { a: 0.5 } },
      { v: 'upright', bass: '....1...........', lo: 'C2', g: 0.5 }
    ],
    mix: { rev: [0.86, 0.45, 0.5], dly: [0.75, 0.3, 2400, 0.3], lv: -13 }
  };

  /* Vivid level complete — "Ta-Da Parade": brass and marimba run up IV–V and
   * land on a big C chord with claps and a cymbal. */
  SONGS['win-vivid'] = {
    id: 'win-vivid', title: 'Ta-Da Parade', oneShot: true, decay: 1.0, duck: 0.25, bpm: 132, bars: 2,
    key: ['C', 'major'], scale: MAJ_PENT,
    chords: 'F G | C',
    parts: [
      { v: 'brass', n: 'F5:2 A5:2 C6:2 r:2 G5:2 B5:2 D6:2 r:1 F6:1 | E6:12 r:4', g: 0.45, rev: 0.25 },
      { v: 'brass', n: 'C5:2 F5:2 A5:2 r:2 D5:2 G5:2 B5:2 r:1 D6:1 | C6:12 r:4', g: 0.26, pan: -0.25, rev: 0.25 },
      { v: 'marimba', n: 'F5:2 A5:2 C6:2 r:2 G5:2 B5:2 D6:2 r:2 | C6:2 E6:2 G6:4 r:8', g: 0.17, pan: 0.3 },
      { v: 'glock', n: 'r:16 | r:4 G5:1 C6:1 E6:1 G6:1 r:8', g: 0.14, pan: 0.35, rev: 0.3 },
      { v: 'brass', chord: 'x...............', lo: 'E4', hi: 'E5', voices: 3, bars: [2, 2], g: 0.22, gate: 0.75 },
      { v: 'slap', bass: '1.......1.......', lo: 'E1', bars: [1, 1], g: 0.3 },
      { v: 'slap', bass: '1...............', lo: 'E1', bars: [2, 2], g: 0.3 }
    ],
    drums: {
      kit: 'funk', g: 0.6,
      pat: { A: { k: 'x.......x.......', c: '....x.......x.xx', h: 'x.x.x.x.x.x.x.x.' }, B: { k: 'x...............', c: 'x...............' } },
      order: 'AB', crash: [2]
    },
    mix: { rev: [0.78, 0.4, 0.4], dly: [0.5, 0.2, 3000, 0.25], lv: -12.5 }
  };

  /* Hyper level complete — "Overdrive": an arpeggio rockets up over F and G
   * and the saw lead lands on a blazing A major, gated snare and crash. */
  SONGS['win-hyper'] = {
    id: 'win-hyper', title: 'Overdrive', oneShot: true, decay: 1.2, duck: 0.25, bpm: 140, bars: 2,
    key: ['A', 'minor'], scale: MIN_PENT,
    chords: 'F G | A',
    parts: [
      { v: 'sawLead', n: 'A5:2 C6:2 F6:2 r:2 B5:2 D6:2 G6:2 r:2 | E6:12 r:4', g: 0.4, rev: 0.25, dly: 0.25 },
      { v: 'synthBrass', chord: 'x.......x.......', lo: 'C4', hi: 'C5', voices: 3, bars: [1, 1], g: 0.2, gate: 0.5 },
      { v: 'synthBrass', chord: 'x...............', lo: 'C#4', hi: 'C#5', voices: 3, bars: [2, 2], g: 0.22, gate: 0.8 },
      { v: 'arpSaw', arp: '0 1 2 3 4 5 6 7', rhythm: 'xxxxxxxxxxxxxxxx', lo: 'A3', hi: 'A6', bars: [1, 1], g: 0.38, pan: 0.3, dly: 0.2 },
      { v: 'supersaw', chord: 'x...............', lo: 'E4', hi: 'C#6', voices: 4, bars: [2, 2], g: 0.2, rev: 0.35 },
      { v: 'synthBass', bass: '1.8.1.8.1.8.1.8.', lo: 'E1', bars: [1, 1], g: 0.33 },
      { v: 'synthBass', bass: '1...............', lo: 'E1', bars: [2, 2], g: 0.33 }
    ],
    drums: {
      kit: 'synthwave', g: 0.5,
      pat: { A: { k: 'x...x...x...x...', s: '....x.......x.xx', h: 'xoxoxoxoxoxoxoxo' }, B: { k: 'x...............', s: 'x...............' } },
      order: 'AB', crash: [2]
    },
    mix: { rev: [0.86, 0.3, 0.5], dly: [0.75, 0.35, 2800, 0.35], lv: -12.5 }
  };

  /* The last goal peg — "Grand Finale": a timpani roll swells under brass
   * climbing the C chord and a harp sweep; the harmony lifts through A♭ and
   * B♭ with choir and strings, and lands on a radiant C major with a deep
   * boom, a cymbal and a cascade of bells. The big payoff, all original. */
  SONGS.finale = {
    id: 'finale', title: 'Grand Finale', oneShot: true, decay: 1.3, duck: 0.12, bpm: 132, bars: 3,
    key: ['C', 'major'], scale: MAJ_PENT,
    chords: 'C | Ab Bb | C',
    parts: [
      { v: 'brass', n: 'G4:2 C5:2 E5:2 G5:2 C6:8 | Eb6:6 C6:2 D6:6 Bb5:2 | E6:16', g: 0.46, rev: 0.3 },
      { v: 'brass', n: 'E4:2 G4:2 C5:2 E5:2 G5:8 | C6:6 Ab5:2 Bb5:6 F5:2 | C6:16', g: 0.28, pan: -0.25, rev: 0.3 },
      { v: 'brass', n: 'r:16 | Ab4:8 Bb4:8 | G5:16', g: 0.2, pan: 0.25, rev: 0.3 },
      { v: 'strings', chord: 'x...............', lo: 'G3', hi: 'E5', voices: 4, g: 0.22, rev: 0.35, P: { a: 0.2 } },
      { v: 'choir', chord: 'x...............', lo: 'C4', hi: 'G5', voices: 4, g: 0.2, rev: 0.45 },
      { v: 'harp', arp: '0 1 2 3 4 5 6 7 8 9', rhythm: 'xxxxxxxxxx......', lo: 'C3', hi: 'C6', bars: [1, 1], g: 0.18, pan: -0.3, rev: 0.3 },
      { v: 'glock', n: 'r:16 | r:16 | C6:1 E6:1 G6:1 C6:1 E6:1 G6:1 E6:1 G6:1 r:8', g: 0.18, pan: 0.35, rev: 0.35 },
      { v: 'bell', n: 'r:16 | r:16 | C6:4 G5:12', g: 0.2, pan: 0.2, rev: 0.4 },
      { v: 'sub', bass: '1...............', lo: 'G1', g: 0.27 }
    ],
    drums: {
      kit: 'march', g: 0.4,
      pat: {
        A: { T: 'ggggoooooxxxxxXX' },
        B: { s: 'oooooooxxxxxxxXX', V: 'x.......x.......' },
        C: { k: 'X...............', T: 'X...............', B: 'X...............' }
      },
      order: 'ABC', crash: [3]
    },
    mix: { rev: [0.88, 0.35, 0.55], dly: [0.5, 0.2, 2400, 0.2], lv: -12 }
  };

  /* Out of balls — "Soft Landing": a gentle sigh down from B♭maj7 that
   * settles warmly on F. Not a punishment: "that's all right, try again". */
  SONGS.lose = {
    id: 'lose', title: 'Soft Landing', oneShot: true, decay: 0.45, duck: 0.3, bpm: 96, bars: 1, human: 0.004,
    key: ['F', 'major'], scale: MAJ_PENT,
    chords: 'Bbmaj7 Fadd9',
    parts: [
      { v: 'felt', n: 'D5:3 C5:1 A4:4 G4:2 A4:6', g: 0.5, rev: 0.3, gate: 1 },
      { v: 'felt', chord: 'x.......x.......', lo: 'D3', hi: 'F4', voices: 3, roll: 0.03, g: 0.17, pan: -0.15, rev: 0.3, gate: 1 },
      { v: 'airPad', chord: 'x.......x.......', lo: 'A3', hi: 'F5', voices: 3, g: 0.1, rev: 0.4 },
      { v: 'upright', bass: '1.......1.......', lo: 'Bb1', g: 0.45 }
    ],
    mix: { rev: [0.84, 0.45, 0.45], lv: -14 }
  };

  /* A whole campaign done — "Journey's End": a brass anthem in G with a
   * choir, rolling marimba, bells and a harp sweep, ending on a held chord
   * with a timpani-sized boom. */
  SONGS['campaign-complete'] = {
    id: 'campaign-complete', title: "Journey's End", oneShot: true, decay: 1.5, duck: 0.15, bpm: 120, bars: 4,
    key: ['G', 'major'], scale: MAJ_PENT,
    chords: 'C D | Bm7 Em7 | Am7 D | G',
    parts: [
      { v: 'brass', n: 'G5:2 A5:2 C6:4 A5:2 B5:2 D6:4 | D6:4 B5:2 F#5:2 E6:4 B5:2 G5:2 | C6:4 A5:2 E5:2 F#5:2 A5:2 D6:4 | G5:2 B5:2 D6:12', g: 0.44, rev: 0.3 },
      { v: 'brass', n: 'E5:2 F#5:2 G5:4 F#5:2 G5:2 A5:4 | B5:4 F#5:2 D5:2 B5:4 G5:2 E5:2 | A5:4 E5:2 C5:2 D5:2 F#5:2 A5:4 | D5:2 G5:2 B5:12', g: 0.26, pan: -0.25, rev: 0.3 },
      { v: 'cello', n: 'C4:8 D4:8 | B3:8 E4:8 | A3:8 D4:8 | G3:16', g: 0.28, pan: 0.25, rev: 0.3 },
      { v: 'choir', chord: 'x.......x.......', lo: 'D4', hi: 'B5', voices: 4, g: 0.15, rev: 0.45 },
      { v: 'glock', n: 'r:16 | r:16 | r:16 | G5:1 B5:1 D6:1 G6:1 B5:1 D6:1 G6:1 D6:1 r:8', g: 0.14, pan: 0.35, rev: 0.3 },
      { v: 'marimba', chord: '..x...x...x...x.', lo: 'D4', hi: 'D5', voices: 3, roll: 0.004, bars: [1, 3], g: 0.085, pan: -0.3 },
      { v: 'harp', arp: '0 1 2 3 4 5 6 7 8 9', rhythm: 'xxxxxxxxxx......', lo: 'G3', hi: 'G6', bars: [4, 4], g: 0.16, pan: -0.3, rev: 0.3 },
      { v: 'bassPluck', bass: '1...5...1...5...', lo: 'A1', bars: [1, 3], g: 0.39 },
      { v: 'bassPluck', bass: '1...............', lo: 'A1', bars: [4, 4], g: 0.45 }
    ],
    drums: {
      kit: 'pop', g: 0.4,
      pat: {
        A: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', m: '..x...x...x...x.' },
        F: { k: 'x...x...x...x...', s: '....x...x.x.xxxx', t: '........x.x.....', u: '..........x.x...' },
        E: { k: 'X...............' }
      },
      order: 'AAFE', crash: [1, 4]
    },
    mix: { rev: [0.86, 0.38, 0.5], dly: [0.75, 0.25, 2800, 0.25], lv: -12.5 }
  };

  const LOOP_IDS = ['title', 'menu-cozy', 'menu-vivid', 'menu-hyper', 'lantern-garden', 'moonlit-lake', 'snowglobe-hollow',
    'sugar-rush', 'carnival-skies', 'coral-groove', 'neon-highway', 'starlight-warp', 'quasar-core'];
  const STINGER_IDS = ['win-cozy', 'win-vivid', 'win-hyper', 'finale', 'lose', 'campaign-complete'];

  /* ══════════════════════════════════════════════════════════════════════
   * 10. Rendering entry points, and the synth API (node's module.exports)
   * ══════════════════════════════════════════════════════════════════════ */

  /** Peak-normalise a one-shot to -1 dBFS (driving the limiter first where asked) and end on an exact zero. */
  function finishOneShot(chs, lim) {
    const pk = Math.max(1e-6, peakOf(chs));
    if (lim) { scale(chs, CEIL / pk * dbToGain(lim)); limit(chs, CEIL, false); }
    else scale(chs, CEIL / pk);
    const f = Math.round(0.004 * SR);
    for (let c = 0; c < chs.length; c++) { const x = chs[c]; for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f; }
  }

  /** Render one catalogue effect (mono). `vol` is the play volume that seats it at its designed level. */
  function renderSfx(name) { return drain(renderSfxGen(name)); }
  function* renderSfxGen(name) {
    if (name.indexOf('peg:') === 0) { const b = name.split(':'); return yield* renderPegGen(b[1], +b[2]); }
    const d = SFX[name];
    if (!d) throw new Error('unknown sound "' + name + '"');
    const o = new Float32Array(Math.round(d.len * SR));
    nzSeed(hashStr(name));
    d.draw(o, prng(hashStr(name) ^ 0x2545f491));
    yield;
    if (d.verb) yield* verbGen(o, d.verb[0], d.verb[1]);
    if (d.lp) yield* biquadGen(o, 'lp', d.lp, 0.7, false);
    yield* highpassGen(o, 30, false);
    yield;
    const chs = [o];
    finishOneShot(chs, d.lim);
    const loud = loudness(chs, 0.25);
    return { chs, sec: d.len, crit: d.crit, level: d.level, loud, vol: clamp(dbToGain(d.level - loud), 0, 1) };
  }

  function songMeta(id) {
    const s = SONGS[id];
    if (!s) return null;
    const spb = s.spb || 16;
    return {
      id, title: s.title, bpm: s.bpm, bars: s.bars, spb, beatsPerBar: spb / 4, key: s.key[0] + ' ' + s.key[1], scale: s.scale.slice(),
      sec: s.bars * spb * 15 / s.bpm + (s.oneShot ? (s.decay || 1.2) : 0), oneShot: !!s.oneShot
    };
  }

  const synth = {
    SR, CEIL, SONG_TAIL, PEG_MODES, LOOP_IDS, STINGER_IDS,
    songList: () => LOOP_IDS.concat(STINGER_IDS).map(songMeta),
    sfxList: () => Object.keys(SFX).map((k) => ({ name: k, sec: SFX[k].len, level: SFX[k].level, crit: SFX[k].crit })),
    renderSfx, renderPeg, renderSfxGen, renderPegGen, songGen,
    renderSong: (id) => drain(songGen(id)),
    pegScale: (id) => pegScaleNotes(id).slice(), pegMidi,
    wavBytes, wavGen, loudness, peakOf, drain, midiHz, Biquad, songMeta
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = synth;
  const P3 = root.P3 = root.P3 || {};
  if (typeof document === 'undefined') { P3.audioSynth = synth; return; }   // node: synthesis only

  /* ══════════════════════════════════════════════════════════════════════
   * 11. Browser layer — render queue, SafeAudio one-shots, gapless music,
   *     stingers, ducking, speech, and the API
   * ══════════════════════════════════════════════════════════════════════ */

  const now = () => performance.now();
  const PREFIX = 'p3-';        // SafeAudio names: never a built-in name (select, hover, pop …)
  const SLICE_MS = 8;          // most time one render slice may take
  const MUSIC_BASE = 0.3;      // loops are mastered to about -14 dB; this seats them under the effects
  const STING_BASE = 0.42;     // stingers sit a little above the music they interrupt
  const DUCK_SPEECH = 0.3;     // music level while text-to-speech is talking
  const DUCK_SFX = 0.65;       // non-critical effects while it is talking
  const MAX_SONGS = 4;         // rendered loops kept (about 5-6 MB each); least recently used is dropped
  const FIRST = { menuMove: 1, menuSelect: 1, menuBack: 1, menuBlocked: 1, toggle: 1, pauseOpen: 1, pauseClose: 1 };
  const CORE = { aimTick: 1, launch: 1, relight: 1, plate: 1, catch: 1, drain: 1, bumper: 1, levelStart: 1, ballReturned: 1 };

  let inited = false, sfxOn = true, musicOn = true, sfxVol = 1, musicVol = 1, mode = 'vivid';
  let hidden = false, suspended = false, unlocked = false, gestureHooked = false, lastStep = 0, pumpTimer = 0;
  let duckSpeech = 1, duckSfx = 1, duckSting = 1, pauseDuck = 1, pauseDuckSm = 1;
  const sounds = new Map();      // one-shot key ('holdTick:2', 'pop:3@cozy', 'peg:hyper:66') → { url, vol, crit, sec }
  const songAssets = new Map();  // loop id → { url, sec, tail, kb, used }
  const stingAssets = new Map(); // stinger id → { url, sec, el }
  const warned = new Set();
  const perf = { initAt: 0, sfxMs: 0, songs: {}, slices: 0, maxSliceMs: 0, maxStepMs: 0, errors: 0 };

  function warnOnce(msg) { if (!warned.has(msg)) { warned.add(msg); console.warn('[P3.audio] ' + msg); } }

  /* ── Idle-slice render queue ─────────────────────────────────────────────
   * Every render is a generator. Idle callbacks advance the most urgent job
   * for at most SLICE_MS (3 ms when the browser is busy), so the game never
   * stalls: menu sounds first, then the song that was asked for, the pegs
   * for its key, the core shot sounds, everything else, then the stingers.
   */
  const jobs = [];
  let scheduled = false;

  function findJob(key) { for (let i = 0; i < jobs.length; i++) if (jobs[i].key === key) return jobs[i]; return null; }
  function addJob(key, pri, make, done) {
    const have = findJob(key);
    if (have) { if (pri > have.pri) have.pri = pri; if (done) have.done.push(done); schedule(); return have; }
    const j = { key, pri, make, gen: null, done: done ? [done] : [], cpu: 0 };
    jobs.push(j);
    schedule();
    return j;
  }
  function removeJob(j) { const i = jobs.indexOf(j); if (i >= 0) jobs.splice(i, 1); }
  function stepJob(j) {
    const t = now();
    let r;
    try {
      if (!j.gen) j.gen = j.make();
      r = j.gen.next();
    } catch (e) {
      console.warn('[P3.audio] could not render ' + j.key + ':', e);
      perf.errors++;
      removeJob(j);
      return;
    }
    const took = now() - t;
    j.cpu += took;
    if (took > perf.maxStepMs) perf.maxStepMs = took;
    if (r.done) {
      removeJob(j);
      for (let i = 0; i < j.done.length; i++) { try { j.done[i](r.value, j); } catch (e) { console.warn('[P3.audio]', e); } }
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
    if (typeof root.requestIdleCallback === 'function') root.requestIdleCallback(run, { timeout: 50 });
    else setTimeout(run, 0);
  }

  function blobUrl(bytes) { return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })); }

  function queueSfx(key, pri) {
    if (sounds.has(key)) return;
    addJob('sfx:' + key, pri, function* () {
      const r = yield* renderSfxGen(key);
      yield;
      return { url: blobUrl(wavBytes(r.chs, 0)), vol: r.vol, crit: !!r.crit, sec: r.sec };
    }, (a, j) => {
      perf.sfxMs += j.cpu;
      if (sounds.has(key)) return;
      sounds.set(key, a);
      preloadOneShot(PREFIX + key, a.url);
    });
  }
  /** A sound asked for before it was ready: render it next. */
  function bump(key) {
    const j = findJob('sfx:' + key);
    if (j) { if (j.pri < 110) j.pri = 110; schedule(); } else queueSfx(key, 110);
  }

  function queueSong(id, pri, done) {
    const have = songAssets.get(id);
    if (have) { have.used = now(); if (done) done(have); return; }
    const t0 = now();
    addJob('song:' + id, pri, function* () {
      const r = yield* songGen(id);
      const bytes = yield* wavGen(r.chs, Math.round(SONG_TAIL * SR));
      return { url: blobUrl(bytes), sec: r.loopSec, tail: SONG_TAIL, kb: Math.round(bytes.byteLength / 1024) };
    }, (a, j) => {
      if (!songAssets.has(id)) {
        a.used = now();
        songAssets.set(id, a);
        perf.songs[id] = { cpuMs: Math.round(j.cpu), wallMs: Math.round(now() - t0), kb: a.kb, sec: +a.sec.toFixed(2) };
        evictSongs();
      }
      if (done) done(songAssets.get(id));
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
    if (M.want === id || (M.cur && M.cur.id === id)) return true;
    for (let i = 0; i < M.old.length; i++) if (M.old[i].id === id) return true;
    return false;
  }

  function queueSting(id, pri, done) {
    const have = stingAssets.get(id);
    if (have) { if (done) done(have); return; }
    const t0 = now();
    addJob('sting:' + id, pri, function* () {
      const r = yield* songGen(id);
      const bytes = yield* wavGen(r.chs, 0);
      return { url: blobUrl(bytes), sec: r.sec, kb: Math.round(bytes.byteLength / 1024) };
    }, (a, j) => {
      if (!stingAssets.has(id)) {
        a.el = makeEl(a.url, false, false);
        stingAssets.set(id, a);
        perf.songs[id] = { cpuMs: Math.round(j.cpu), wallMs: Math.round(now() - t0), kb: a.kb, sec: +a.sec.toFixed(2) };
      }
      if (done) done(stingAssets.get(id));
    });
  }

  /* ── One-shots through SafeAudio (3-deep pools), with a tiny fallback ─── */
  const fallbackPools = new Map();
  function preloadOneShot(name, url) {
    const S = root.SafeAudio;
    if (S && typeof S.preload === 'function') { S.preload(name, url); return; }
    const els = [];
    for (let i = 0; i < 3; i++) { const a = new Audio(); a.preload = 'auto'; a.src = url; els.push(a); }
    fallbackPools.set(name, { els, i: 0 });
  }
  function playOneShot(name, v) {
    const S = root.SafeAudio;
    if (S && typeof S.play === 'function') { S.play(name, v); return; }
    const p = fallbackPools.get(name);
    if (!p) return;
    const a = p.els[p.i];
    p.i = (p.i + 1) % p.els.length;
    try { a.volume = v; a.currentTime = 0; const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* ignore */ }
  }
  function stopOneShot(name) {
    const S = root.SafeAudio;
    try { if (S && S.stop) S.stop(name); } catch (e) { /* ignore */ }
    const p = fallbackPools.get(name);
    if (p) p.els.forEach((a) => { try { a.pause(); } catch (e) { /* ignore */ } });
  }
  function stopOneShots() { sounds.forEach((s, key) => stopOneShot(PREFIX + key)); }

  /* ── Parametric names → catalogue keys ───────────────────────────────── */
  function speedTier(o, m) {
    const sp = +o.speed || 0, t = sp < 700 ? 0 : sp < 1500 ? 1 : 2;
    return m === 'cozy' ? Math.min(1, t) : t;
  }
  function slotTier(value, m) {
    const C = P3.catalog, md = C && C.MODES && C.MODES[m];
    if (md && md.slots) {
      const vals = md.slots.filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b);
      let k = 0;
      for (let i = 0; i < vals.length; i++) if (value >= vals[i]) k = i;
      return clamp(Math.round(k * 2 / Math.max(1, vals.length - 1)) + 1, 1, 3);
    }
    return value >= 50000 ? 3 : value >= 15000 ? 2 : 1;
  }
  const PARAM = {
    holdTick: (o) => 'holdTick:' + clamp(Math.round(+o.step || 0), 0, 4),
    pop: (o) => { let k = Math.max(0, Math.round(+o.index || 0)); if (k > 11) k = 9 + ((k - 12) % 3); return 'pop:' + k; },
    fever: (o) => { const l = +o.level || 2; return 'fever:' + (l >= 5 ? 5 : l >= 3 ? 3 : 2); },
    slot: (o, m) => 'slot:' + slotTier(+o.value || 0, m),
    star: (o) => 'star:' + clamp(Math.round(+o.n || 1), 1, 3),
    clank: (o, m) => 'clank:' + speedTier(o, m),
    wall: (o, m) => 'wall:' + speedTier(o, m)
  };
  /** A play() name and its options → the rendered sound's key ('blast' in Cozy → 'blast@cozy'). */
  function resolveKey(name, o, m) {
    const f = PARAM[name], base = f ? f(o, m) : name;
    if (SFX[base + '@' + m]) return base + '@' + m;
    return SFX[base] ? base : null;
  }
  function modeOf(o) { return o && PEG_MODES.indexOf(o.mode) >= 0 ? o.mode : mode; }

  /* ── Pegs: the next note of the current track's scale ────────────────── */
  function pegSongId() { return M.pegSong || M.want || 'title'; }
  function queuePegSet(m, songId, pri) {
    const list = pegScaleNotes(songId);
    for (let i = 0; i < list.length; i++) queueSfx('peg:' + m + ':' + list[i], pri);
  }
  /** The peg key to play for a chain index; until the exact note is rendered, the nearest ready one (in-scale first). */
  function pegKey(chain, m) {
    const id = pegSongId(), midi = pegMidi(id, chain), exact = 'peg:' + m + ':' + midi;
    if (sounds.has(exact)) return exact;
    bump(exact);
    const s = SONGS[id], pc0 = pcOf(s.key[0]);
    const inScale = (x) => s.scale.indexOf(((x - pc0) % 12 + 12) % 12) >= 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let d = 1; d <= 12; d++) {
        for (const x of [midi - d, midi + d]) {
          if (pass === 0 && !inScale(x)) continue;
          if (sounds.has('peg:' + m + ':' + x)) return 'peg:' + m + ':' + x;
        }
      }
    }
    return null;
  }

  /** Play a sound. Returns true if it played; a sound still rendering is skipped and moves to the front of the queue. */
  function play(name, opts) {
    if (!inited) init();
    const o = opts && typeof opts === 'object' ? opts : {};
    const m = modeOf(o);
    let key, gain = 1;
    if (name === 'peg') {
      if (!sfxOn || hidden || suspended) return false;
      key = pegKey(o.chain, m);
      if (!key) return false;
    } else {
      key = resolveKey(name, o, m);
      if (!key) { warnOnce('unknown sound "' + name + '"'); return false; }
      if (!sfxOn || hidden || suspended) return false;
      if (name === 'clank' || name === 'wall') gain = (0.45 + 0.55 * Math.pow(clamp((+o.speed || 0) / 2600, 0, 1), 0.7)) * (m === 'cozy' ? 0.75 : 1);
    }
    const s = sounds.get(key);
    if (!s) { bump(key); return false; }
    const v = clamp(s.vol * gain * sfxVol * (o.volume !== undefined ? +o.volume : 1) * (s.crit ? 1 : duckSfx), 0, 1);
    if (!(v > 0.001)) return false;
    playOneShot(PREFIX + key, v);
    return true;
  }
  function stopSfx(name) {
    if (!name) { stopOneShots(); return; }
    sounds.forEach((s, key) => { if (key === name || key.indexOf(name + ':') === 0 || key.indexOf(name + '@') === 0) stopOneShot(PREFIX + key); });
  }

  /* ── Gapless loops without the Web Audio API ─────────────────────────────
   * <audio loop> re-seeks at the end of the file and Chromium leaves about
   * 90 ms of silence every time (measured in Electron): a stutter on every
   * pass of a song. So a loop file holds the loop plus a copy of its opening
   * seconds (the tail), and two elements take turns. While the audible one
   * (A) plays into its tail, the other (B) starts silently at the matching
   * point, is nudged into alignment by running a touch fast or slow, is
   * crossfaded in, and A rewinds for its next turn. A swap that cannot align
   * in time crossfades anyway; if nothing drives the swaps at all, A carries
   * on from the matching point when it ends. (NARBE Racer's player, plus a
   * loop counter so beat() can count from the start of the track.)
   */
  function makeEl(url, keepPitch, loop) {
    const a = new Audio();
    a.preload = 'auto';
    a.loop = !!loop;
    try { a.preservesPitch = !!keepPitch; } catch (e) { /* ignore */ }
    a.volume = 0;
    a.src = url;
    return a;
  }

  function LoopPlayer(url, sec, tail, opt) {
    this.sec = sec; this.tail = tail;
    this.tol = opt.tol || 0.002; this.xf = opt.xf || 0.2;
    this.els = [makeEl(url, true, !tail), makeEl(url, true, !tail)];
    this.cur = 0; this.state = 'idle';            // idle | run | start | align | fade | paused
    this.rate = 1; this.vol = 0; this.loops = 0;
    this.vSet = [-1, -1]; this.rSet = [-1, -1];
    this.lag = [0.03, 0.03];                      // learned start latency of each element, seconds
    this.hist = new Float64Array(5); this.sorted = new Float64Array(5); this.hn = 0;
    this.ok = 0; this.fadeT = 0; this.seek = 0; this.learned = false;
    this.blocked = false;
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
    this.loops = 0;
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
  LoopPlayer.prototype.setRateOn = function (i, r) {
    if (Math.abs(this.rSet[i] - r) > 0.0008) { this.els[i].playbackRate = r; this.rSet[i] = r; }
  };
  /** Seconds since the track started, counting completed passes of the loop. */
  LoopPlayer.prototype.position = function () {
    const A = this.els[this.cur];
    let t = A.currentTime || 0, loops = this.loops;
    if (t >= this.sec) { t -= this.sec; loops++; }
    return loops * this.sec + t;
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
    this.loops++;
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
    this.loops++;
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

  /* ── Music ─────────────────────────────────────────────────────────────
   * want: the track asked for. cur: the one playing (it keeps playing until
   * the wanted one has rendered, then they crossfade). old: fading out.
   */
  const M = { want: null, pegSong: null, fade: 1.2, cur: null, old: [] };   // cur/old: { id, lp, fade, fadeIn, fadeOut }

  function canPlayMusic() { return musicOn && !hidden && !suspended; }

  function music(id, opts) {
    if (!inited) init();
    const fade = opts && opts.fade !== undefined ? Math.max(0.05, +opts.fade || 0.05) : 1.2;
    if (!id) { stopMusic(fade); return; }
    const song = SONGS[id];
    if (!song || song.oneShot) { warnOnce('unknown music track "' + id + '"'); return; }
    if (M.pegSong !== id) { M.pegSong = id; queuePegSet(mode, id, 85); }
    if (M.want === id) return;
    M.want = id;
    M.fade = fade;
    if (musicOn) startWanted();
    else queueSong(id, 40);
  }
  function startWanted() {
    const id = M.want;
    if (!id || (M.cur && M.cur.id === id)) return;
    queueSong(id, 90, (a) => {
      if (M.want !== id || !musicOn || (M.cur && M.cur.id === id)) return;
      if (M.cur) { M.cur.fadeOut = M.fade; M.old.push(M.cur); }
      const lp = new LoopPlayer(a.url, a.sec, a.tail, { tol: 0.0015, xf: 0.2 });
      M.cur = { id, lp, fade: 0, fadeIn: M.fade, fadeOut: M.fade };
      if (canPlayMusic()) lp.play();
    });
  }
  function stopMusic(fade) {
    M.want = null;
    const f = fade !== undefined ? Math.max(0.05, +fade || 0.05) : 1.2;
    if (M.cur) { M.cur.fadeOut = f; M.old.push(M.cur); M.cur = null; }
  }
  function disposeMusic() {
    if (M.cur) { M.cur.lp.dispose(); M.cur = null; }
    for (let i = 0; i < M.old.length; i++) M.old[i].lp.dispose();
    M.old.length = 0;
  }
  function stepMusic(dt) {
    const base = MUSIC_BASE * musicVol * duckSpeech * duckSting * pauseDuckSm;
    if (M.cur) {
      const c = M.cur;
      c.fade = Math.min(1, c.fade + dt / c.fadeIn);
      c.lp.setVolume(base * c.fade);
      c.lp.step(dt);
    }
    for (let i = M.old.length - 1; i >= 0; i--) {
      const s = M.old[i];
      s.fade -= dt / s.fadeOut;
      if (s.fade <= 0) { s.lp.dispose(); M.old.splice(i, 1); }
      else { s.lp.setVolume(base * s.fade); s.lp.step(dt); }
    }
  }

  /* ── Stingers ────────────────────────────────────────────────────────── */
  const sting = { active: null, pending: null };   // active: { id, el, until, duck, at }
  function stinger(id) {
    if (!inited) init();
    const song = SONGS[id];
    if (!song || !song.oneShot) { warnOnce('unknown stinger "' + id + '"'); return false; }
    if (!canPlayMusic()) return false;
    const a = stingAssets.get(id);
    if (!a) {
      // Not rendered yet (they normally are, a few seconds after init): play it if it arrives within 1.5 s.
      const asked = now();
      sting.pending = id;
      queueSting(id, 120, (b) => { if (sting.pending === id && now() - asked < 1500 && canPlayMusic()) startSting(id, b); });
      return false;
    }
    startSting(id, a);
    return true;
  }
  function startSting(id, a) {
    stopSting();
    sting.pending = null;
    const el = a.el;
    el.volume = clamp(STING_BASE * musicVol * pauseDuckSm, 0, 1);
    try { el.currentTime = 0; const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    sting.active = { id, el, at: now(), until: now() + a.sec * 1000 + 200, duck: SONGS[id].duck || 0.25 };
  }
  function stopSting() {
    const s = sting.active;
    if (s) { try { s.el.pause(); } catch (e) { /* ignore */ } }
    sting.active = null;
  }
  function stepSting(dt) {
    const s = sting.active;
    let target = 1;
    if (s) {
      const t = now();
      if (s.el.ended || t > s.until || (s.el.paused && t - s.at > 400)) sting.active = null;
      else {
        target = s.duck;
        const free = (duckSpeech - DUCK_SPEECH) / (1 - DUCK_SPEECH);
        s.el.volume = clamp(STING_BASE * musicVol * pauseDuckSm * (0.55 + 0.45 * free), 0, 1);
      }
    }
    duckSting += (target - duckSting) * (1 - Math.exp(-dt * (target < duckSting ? 12 : 1.2)));
  }

  /* ── Speech, through NarbeVoiceManager ───────────────────────────────────
   * The manager owns the voice and the TTS switch (never copied here). Its
   * speak() cancels whatever is playing, so outcome lines queue up behind
   * each other, chatter is dropped while anything is talking, and the game
   * can wait for quiet before moving on. Speech never blocks input.
   */
  const speech = { queue: [], lastStart: 0 };
  function vm() { return root.NarbeVoiceManager || null; }
  function ttsOn() { const v = vm(); try { return !!(v && v.getSettings().ttsEnabled); } catch (e) { return false; } }
  function synthBusy() { try { const s = root.speechSynthesis; return !!(s && (s.speaking || s.pending)); } catch (e) { return false; } }
  function speakNow(text) {
    const v = vm();
    if (!v) return;
    try { v.speak(String(text)); } catch (e) { return; }
    speech.lastStart = now();
  }
  function say(text) {
    speech.queue.length = 0;
    if (!text || !ttsOn()) return false;
    speakNow(text);
    return true;
  }
  function sayQueued(text) {
    if (!text || !ttsOn()) return false;
    if (!isSpeaking()) return say(text);
    if (speech.queue.length >= 4) speech.queue.shift();   // drop the stalest rather than lag behind
    speech.queue.push(String(text));
    return true;
  }
  function sayIfIdle(text) {
    if (!text || !ttsOn() || isSpeaking()) return false;
    speakNow(text);
    return true;
  }
  function isSpeaking() {
    if (!ttsOn()) return false;
    if (now() - speech.lastStart < 350) return true;      // the engine takes a beat to report "speaking"
    return synthBusy() || speech.queue.length > 0;
  }
  function tickSpeech() {
    if (!speech.queue.length) return;
    if (!ttsOn()) { speech.queue.length = 0; return; }
    if (now() - speech.lastStart < 350 || synthBusy()) return;
    speakNow(speech.queue.shift());
  }
  /** Resolve once speech has finished (plus a breath), or after maxMs regardless. */
  function whenQuiet(maxMs, breathMs) {
    const start = now(), limitMs = maxMs || 10000, breath = breathMs === undefined ? 200 : breathMs;
    return new Promise((resolve) => {
      let quietSince = 0;
      const id = setInterval(() => {
        const t = now();
        if (t - start > limitMs) { clearInterval(id); resolve(); return; }
        if (isSpeaking()) { quietSince = 0; return; }
        if (!quietSince) quietSince = t;
        if (t - quietSince >= breath) { clearInterval(id); resolve(); }
      }, 60);
    });
  }

  /* ── The pump: ducking, fades, loop swaps, the speech queue ──────────── */
  function step(t) {
    const dt = lastStep ? Math.min(0.1, (t - lastStep) / 1000) : 1 / 40;
    lastStep = t;
    const speaking = synthBusy() || (ttsOn() && t - speech.lastStart < 300);
    const tm = speaking ? DUCK_SPEECH : 1, ts = speaking ? DUCK_SFX : 1;
    // Duck fast when a voice starts, come back gently once it stops.
    duckSpeech += (tm - duckSpeech) * (1 - Math.exp(-dt * (tm < duckSpeech ? 10 : 1.6)));
    duckSfx += (ts - duckSfx) * (1 - Math.exp(-dt * (ts < duckSfx ? 10 : 1.6)));
    pauseDuckSm += (pauseDuck - pauseDuckSm) * (1 - Math.exp(-dt * 6));
    stepSting(dt);
    stepMusic(dt);
    tickSpeech();
  }
  /** Optional per-frame call from the game (tighter loop swaps); a 25 ms timer runs the same pump anyway. */
  function tick() {
    if (!inited) return;
    const t = now();
    if (t - lastStep >= 4) step(t);
  }

  function applyPauseState() {
    if (hidden || suspended) {
      if (M.cur) M.cur.lp.pause();
      for (let i = 0; i < M.old.length; i++) M.old[i].lp.dispose();
      M.old.length = 0;
      stopSting();
      stopOneShots();
    } else {
      lastStep = 0;
      if (M.cur && musicOn) {
        if (M.cur.lp.state === 'paused') M.cur.lp.resume();
        else if (M.cur.lp.state === 'idle') M.cur.lp.play();
      } else if (musicOn) startWanted();
    }
  }
  function onVisibility() {
    const h = document.visibilityState === 'hidden';
    if (h === hidden) return;
    hidden = h;
    applyPauseState();
  }
  function suspend() { if (!inited) init(); if (suspended) return; suspended = true; applyPauseState(); }
  function resume() {
    if (!inited) init();
    if (suspended) { suspended = false; applyPauseState(); }
    retryBlocked();
  }
  function retryBlocked() {
    const lp = M.cur && M.cur.lp;
    if (lp && lp.blocked && lp.state !== 'idle' && lp.state !== 'paused') { lp.blocked = false; lp.kick(lp.els[lp.cur]); }
  }

  /** A short silent WAV, played inside the first gesture so iOS lets this page play media. */
  let silentUrl = null;
  function unlock() {
    if (!inited) init();
    retryBlocked();
    if (unlocked) return;
    unlocked = true;
    try {
      if (!silentUrl) silentUrl = blobUrl(wavBytes([new Float32Array(Math.round(0.05 * SR))], 0));
      const a = new Audio();
      a.src = silentUrl;
      a.volume = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }
  function onGesture() {
    unlock();
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => root.removeEventListener(ev, onGesture, true));
  }

  /* ── Settings (the game owns persistence; these take effect at once) ─── */
  function setMusicEnabled(on) {
    if (!inited) init();
    musicOn = !!on;
    if (musicOn) { if (!hidden && !suspended) startWanted(); return; }
    disposeMusic();
    stopSting();
  }
  function setSfxEnabled(on) {
    if (!inited) init();
    sfxOn = !!on;
    const S = root.SafeAudio;
    try { if (S && typeof S.setEnabled === 'function') S.setEnabled(sfxOn); } catch (e) { /* ignore */ }
    if (!sfxOn) stopOneShots();
  }
  function setMusicVolume(v) { musicVol = clamp(+v || 0, 0, 1); }
  function setSfxVolume(v) { sfxVol = clamp(+v || 0, 0, 1); }
  function setMusicDuck(v) { pauseDuck = clamp(v === undefined ? 1 : +v || 0, 0, 1); }

  function queueModeVariants(m, pri) {
    Object.keys(SFX).forEach((n) => { if (n.slice(n.indexOf('@') + 1) === m && n.indexOf('@') > 0) queueSfx(n, pri); });
  }
  function setMode(m) {
    if (PEG_MODES.indexOf(m) < 0) { warnOnce('unknown mode "' + m + '"'); return; }
    if (m === mode) return;
    mode = m;
    if (!inited) return;
    queueModeVariants(m, 75);
    queuePegSet(m, pegSongId(), 85);
  }

  function prefetch(id) {
    if (!inited) init();
    if (!SONGS[id]) return;
    if (SONGS[id].oneShot) queueSting(id, 45); else queueSong(id, 35);
  }

  function init() {
    if (inited) return api;
    inited = true;
    perf.initAt = now();
    Object.keys(SFX).forEach((n) => {
      const at = n.indexOf('@');
      if (at > 0 && n.slice(at + 1) !== mode) return;
      const base = (at > 0 ? n.slice(0, at) : n).split(':')[0];
      queueSfx(n, FIRST[base] || base === 'holdTick' ? 100 : CORE[base] || base === 'pop' || base === 'wall' || base === 'clank' ? 70 : 55);
    });
    queuePegSet(mode, pegSongId(), 85);
    STINGER_IDS.forEach((id) => queueSting(id, id === 'finale' ? 45 : id === 'campaign-complete' ? 25 : 35));
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', onVisibility);
      hidden = document.visibilityState === 'hidden';
    }
    if (!gestureHooked) {
      gestureHooked = true;
      ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => root.addEventListener(ev, onGesture, { capture: true, passive: true }));
    }
    pumpTimer = setInterval(() => { if (now() - lastStep > 20) step(now()); }, 25);
    return api;
  }

  /** Is this rendered? A loop or stinger id, a play() name (with opts), or 'peg' for the current peg set. */
  function ready(id, opts) {
    if (!id) return false;
    if (SONGS[id]) return SONGS[id].oneShot ? stingAssets.has(id) : songAssets.has(id);
    const m = modeOf(opts);
    if (id === 'peg') return pegScaleNotes(pegSongId()).every((x) => sounds.has('peg:' + m + ':' + x));
    if (sounds.has(id)) return true;
    const key = resolveKey(id, opts || {}, m);
    return !!key && sounds.has(key);
  }

  function beat() {
    const c = M.cur, id = c ? c.id : M.want, song = id ? SONGS[id] : null, bpm = song ? song.bpm : 0;
    if (!c || !musicOn || c.lp.state === 'idle') return { bpm, beat: 0, phase: 0, bar: 0, playing: false, id: id || null };
    const b = c.lp.position() * bpm / 60, bpb = (song.spb || 16) / 4;
    return { bpm, beat: b, phase: b - Math.floor(b), bar: Math.floor(b / bpb), playing: c.lp.state !== 'paused' && !hidden && !suspended, id };
  }

  function stats() {
    const lp = M.cur && M.cur.lp;
    return {
      inited, mode, sfxOn, musicOn, sfxVol, musicVol, hidden, suspended,
      sounds: sounds.size, songsCached: Array.from(songAssets.keys()), stingers: Array.from(stingAssets.keys()),
      pending: jobs.length, slices: perf.slices, maxSliceMs: +perf.maxSliceMs.toFixed(2), maxStepMs: +perf.maxStepMs.toFixed(2),
      sfxCpuMs: Math.round(perf.sfxMs), songs: JSON.parse(JSON.stringify(perf.songs)), errors: perf.errors,
      duck: { speech: +duckSpeech.toFixed(3), sting: +duckSting.toFixed(3), pause: +pauseDuckSm.toFixed(3) },
      music: M.cur ? { id: M.cur.id, fade: +M.cur.fade.toFixed(2), state: lp.state, swaps: lp.log.swaps, late: lp.log.late, maxOffMs: lp.log.maxOffMs } : null,
      want: M.want, sting: sting.active ? sting.active.id : null
    };
  }

  const api = {
    init, unlock, setMode, play, music, stinger, stopMusic,
    setMusicEnabled, setSfxEnabled, isMusicEnabled: () => musicOn, isSfxEnabled: () => sfxOn,
    setMusicVolume, setSfxVolume, setMusicDuck, suspend, resume,
    beat, currentTrack: () => M.want,
    say, sayQueued, sayIfIdle, isSpeaking, whenQuiet, ready,
    // extras
    tick, prefetch, stopSfx, stats, synth,
    mode: () => mode,
    tracks: () => LOOP_IDS.map(songMeta),
    stingers: () => STINGER_IDS.map(songMeta),
    trackInfo: songMeta,
    pegNote: (chain) => pegMidi(pegSongId(), chain),
    sfxNames: () => Object.keys(SFX),
    /* Test hooks for tools/audio-gallery.html and the browser test (not for game code). */
    _dev: {
      musicSrcs: () => (M.cur ? M.cur.lp.els.map((e) => e.src) : []),
      stingSrcs: () => Array.from(stingAssets.values()).map((a) => a.el.src),
      soundKeys: () => Array.from(sounds.keys()),
      musicPlayer: () => (M.cur ? M.cur.lp : null)
    }
  };

  P3.audio = api;
})(typeof window !== 'undefined' ? window : globalThis);
