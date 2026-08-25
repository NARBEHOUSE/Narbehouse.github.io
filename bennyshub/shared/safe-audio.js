/**
 * SafeAudio — HTML5-Audio sound effects for the Narbehouse hub.
 *
 * Deliberately avoids the Web Audio API. Some of the hub's games run inside the
 * Electron desktop build, where an AudioContext can take the renderer process
 * down with it; those games call into here instead so the same code plays sound
 * on the desktop and on the web.
 *
 * Two kinds of sound:
 *   • File-backed  — preload('roll', 'sounds/dice-roll.WAV'), played through a
 *     small pool of <audio> elements so repeat hits don't cut each other off.
 *   • Built-in     — preload('select') with no URL. The waveform is synthesised
 *     here and handed to the same <audio> element as a data: URI, so even the
 *     generated sounds never touch an AudioContext. Games get a consistent set
 *     of UI blips without every one of them shipping its own .wav files.
 *
 * Built-in names: select, hover, score, bank, bust, fahtzee, win, lose.
 *
 * API (kept exactly as the games already call it):
 *   SafeAudio.preload(name, url?)   url omitted → synthesise a built-in
 *   SafeAudio.play(name, volume?)   auto-loads a built-in if not preloaded
 *   SafeAudio.setEnabled(bool)      silences everything and stops what's playing
 *   SafeAudio.isEnabled()
 *   SafeAudio.stop(name) / SafeAudio.stopAll()
 */

window.SafeAudio = (function () {
  'use strict';

  const SAMPLE_RATE = 22050;   // plenty for short blips, and keeps the data: URIs small
  const POOL_SIZE = 3;         // how many overlapping copies of one sound can play

  let enabled = true;
  const sounds = Object.create(null);   // name -> { pool, idx, vol }
  const warned = Object.create(null);   // so an unknown name warns once, not every frame

  /* ── Waveform synthesis ─────────────────────────────────────────────────
   * Each built-in is a short list of notes. A note sweeps from `f` to `f2`
   * over `d` seconds, starting at `t`, with a quick linear attack and a
   * power-curve decay — the decay is what keeps these from clicking.
   */

  function osc(type, phase) {
    switch (type) {
      case 'square':   return Math.sin(phase) >= 0 ? 1 : -1;
      case 'saw':      return 1 - 2 * ((phase / (2 * Math.PI)) % 1);
      case 'triangle': return 2 * Math.abs(2 * ((phase / (2 * Math.PI)) % 1) - 1) - 1;
      case 'noise':    return Math.random() * 2 - 1;
      default:         return Math.sin(phase);
    }
  }

  function render(notes) {
    let end = 0;
    for (const n of notes) end = Math.max(end, (n.t || 0) + n.d);
    const len = Math.ceil((end + 0.02) * SAMPLE_RATE);
    const buf = new Float32Array(len);

    for (const n of notes) {
      const start = Math.floor((n.t || 0) * SAMPLE_RATE);
      const dur = Math.max(1, Math.floor(n.d * SAMPLE_RATE));
      const type = n.type || 'sine';
      const vol = n.vol === undefined ? 0.2 : n.vol;
      const curve = n.curve === undefined ? 2.2 : n.curve;
      const f0 = n.f;
      const f1 = n.f2 === undefined ? n.f : n.f2;
      const atk = Math.max(1, Math.floor((n.atk === undefined ? 0.004 : n.atk) * SAMPLE_RATE));
      const tail = Math.max(1, dur - atk);
      let phase = 0;

      for (let i = 0; i < dur; i++) {
        const p = i / dur;
        phase += (2 * Math.PI * (f0 + (f1 - f0) * p)) / SAMPLE_RATE;
        const env = i < atk ? i / atk : Math.pow(1 - (i - atk) / tail, curve);
        const idx = start + i;
        if (idx < len) buf[idx] += osc(type, phase) * env * vol;
      }
    }
    return buf;
  }

  /** Float samples → a 16-bit mono WAV as a data: URI. */
  function toWavUri(buf) {
    const len = buf.length;
    const total = 44 + len * 2;
    const bytes = new Uint8Array(total);
    const dv = new DataView(bytes.buffer);
    let o = 0;
    const str = (s) => { for (let i = 0; i < s.length; i++) bytes[o++] = s.charCodeAt(i); };
    const u32 = (v) => { dv.setUint32(o, v, true); o += 4; };
    const u16 = (v) => { dv.setUint16(o, v, true); o += 2; };

    str('RIFF'); u32(total - 8); str('WAVE');
    str('fmt '); u32(16); u16(1); u16(1);
    u32(SAMPLE_RATE); u32(SAMPLE_RATE * 2); u16(2); u16(16);
    str('data'); u32(len * 2);

    for (let i = 0; i < len; i++) {
      const s = Math.max(-1, Math.min(1, buf[i]));
      dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }

    // btoa needs a binary string; chunk it so a long sound can't blow the stack.
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return 'data:audio/wav;base64,' + btoa(bin);
  }

  /* ── The built-in set ───────────────────────────────────────────────────
   * select/hover are deliberately tiny — they fire on every scan step, so
   * anything longer turns into a drone at fast scan speeds.
   */
  const BUILT_IN = {
    select: () => [
      { t: 0,     f: 660, d: 0.055, type: 'square', vol: 0.20 },
      { t: 0.045, f: 990, d: 0.100, type: 'square', vol: 0.18 }
    ],
    hover: () => [
      { t: 0, f: 480, f2: 560, d: 0.05, type: 'sine', vol: 0.14 }
    ],
    score: () => [
      { t: 0,     f: 523, d: 0.10, type: 'triangle', vol: 0.22 },
      { t: 0.075, f: 659, d: 0.10, type: 'triangle', vol: 0.22 },
      { t: 0.150, f: 784, d: 0.20, type: 'triangle', vol: 0.24 }
    ],
    bank: () => [
      { t: 0,    f: 988,  d: 0.09, type: 'square', vol: 0.16 },
      { t: 0.06, f: 1319, d: 0.34, type: 'sine',   vol: 0.20, curve: 3 },
      { t: 0.06, f: 1976, d: 0.28, type: 'sine',   vol: 0.07, curve: 3 }
    ],
    bust: () => [
      { t: 0, f: 340, f2: 110, d: 0.42, type: 'saw',   vol: 0.20, curve: 1.6 },
      { t: 0, f: 200,          d: 0.12, type: 'noise', vol: 0.10 }
    ],
    fahtzee: () => [
      { t: 0,    f: 523,  d: 0.11, type: 'square', vol: 0.18 },
      { t: 0.09, f: 659,  d: 0.11, type: 'square', vol: 0.18 },
      { t: 0.18, f: 784,  d: 0.11, type: 'square', vol: 0.18 },
      { t: 0.27, f: 1047, d: 0.34, type: 'square', vol: 0.20 },
      { t: 0.27, f: 1568, d: 0.34, type: 'sine',   vol: 0.09, curve: 3 },
      { t: 0.40, f: 2093, d: 0.22, type: 'sine',   vol: 0.06, curve: 3 }
    ],
    win: () => [
      { t: 0,    f: 523,  d: 0.13, type: 'triangle', vol: 0.20 },
      { t: 0.12, f: 523,  d: 0.10, type: 'triangle', vol: 0.18 },
      { t: 0.22, f: 698,  d: 0.14, type: 'triangle', vol: 0.20 },
      { t: 0.36, f: 880,  d: 0.40, type: 'triangle', vol: 0.22, curve: 2.6 },
      { t: 0.36, f: 1319, d: 0.40, type: 'sine',     vol: 0.08, curve: 3 }
    ],
    lose: () => [
      { t: 0,    f: 392, d: 0.16, type: 'triangle', vol: 0.20 },
      { t: 0.15, f: 330, d: 0.16, type: 'triangle', vol: 0.19 },
      { t: 0.30, f: 247, d: 0.42, type: 'triangle', vol: 0.20, curve: 2.0 },
      { t: 0.30, f: 123, d: 0.42, type: 'sine',     vol: 0.10, curve: 2.0 }
    ],

    /* ── Soft set ──────────────────────────────────────────────────────────
     * Pure sines with a slower attack, for games that fire a sound on every
     * scan step. Square waves get grating fast when you hear them a few
     * hundred times a session; the 8-10ms attack is what takes the click off
     * the front of the note. Same loudness as the sharper voices above, just
     * a gentler timbre.
     */
    tick: () => [
      { t: 0, f: 760, f2: 900, d: 0.055, type: 'sine', vol: 0.13, curve: 2.8, atk: 0.008 }
    ],
    pop: () => [
      { t: 0,    f: 520,  f2: 780,  d: 0.09, type: 'sine', vol: 0.16, curve: 2.4, atk: 0.010 },
      { t: 0.01, f: 1040, f2: 1560, d: 0.09, type: 'sine', vol: 0.05, curve: 3.0 }
    ],
    chime: () => [
      { t: 0,    f: 784,  d: 0.13, type: 'sine', vol: 0.15, curve: 2.6, atk: 0.008 },
      { t: 0.10, f: 1047, d: 0.30, type: 'sine', vol: 0.14, curve: 3.0, atk: 0.008 },
      { t: 0.10, f: 1568, d: 0.26, type: 'sine', vol: 0.045, curve: 3.4 }
    ],
    nudge: () => [
      { t: 0, f: 420, f2: 300, d: 0.20, type: 'sine', vol: 0.15, curve: 2.2, atk: 0.010 },
      { t: 0, f: 210, f2: 150, d: 0.20, type: 'sine', vol: 0.06, curve: 2.2 }
    ]
  };

  /* ── Playback ───────────────────────────────────────────────────────────
   * One <audio> element can only play a sound once at a time, so each name
   * gets a tiny round-robin pool. Elements are created eagerly on preload so
   * the first play() doesn't pay for element setup mid-game.
   */

  function makeEntry(src, vol) {
    const pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio();
      a.preload = 'auto';
      a.src = src;
      try { a.load(); } catch (e) { /* some browsers throw on a data: URI here */ }
      pool.push(a);
    }
    return { pool, idx: 0, vol: vol === undefined ? 1 : vol };
  }

  function ensure(name, url) {
    if (sounds[name]) return sounds[name];

    let src = url;
    if (!src) {
      const recipe = BUILT_IN[name];
      if (!recipe) {
        if (!warned[name]) {
          warned[name] = true;
          console.warn('SafeAudio: no sound registered as "' + name + '"');
        }
        return null;
      }
      try {
        src = toWavUri(render(recipe()));
      } catch (e) {
        console.warn('SafeAudio: could not synthesise "' + name + '"', e);
        return null;
      }
    }

    sounds[name] = makeEntry(src);
    return sounds[name];
  }

  return {
    /**
     * Register a sound ahead of time.
     * @param {string} name
     * @param {string} [url] omit for a built-in synthesised sound
     */
    preload: function (name, url) {
      if (!name) return;
      ensure(name, url);
    },

    /**
     * Play a registered sound. Built-ins are synthesised on demand if the game
     * never preloaded them.
     * @param {string} name
     * @param {number} [volume] 0..1, defaults to full
     */
    play: function (name, volume) {
      if (!enabled || !name) return null;
      const entry = ensure(name);
      if (!entry) return null;

      const a = entry.pool[entry.idx];
      entry.idx = (entry.idx + 1) % entry.pool.length;
      try {
        a.volume = Math.max(0, Math.min(1, typeof volume === 'number' ? volume : entry.vol));
        a.currentTime = 0;
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(function () { /* autoplay not unlocked yet */ });
      } catch (e) {
        return null;
      }
      return a;
    },

    /** Stop every copy of one sound. */
    stop: function (name) {
      const entry = sounds[name];
      if (!entry) return;
      entry.pool.forEach(function (a) {
        try { a.pause(); a.currentTime = 0; } catch (e) {}
      });
    },

    /** Stop everything currently playing. */
    stopAll: function () {
      Object.keys(sounds).forEach(this.stop, this);
    },

    /** Master mute. Turning it off also cuts anything mid-playback. */
    setEnabled: function (on) {
      enabled = !!on;
      if (!enabled) this.stopAll();
      return enabled;
    },

    isEnabled: function () { return enabled; },

    /** Names currently registered — handy when debugging a silent game. */
    list: function () { return Object.keys(sounds); },

    /** Names this module can synthesise without any asset files. */
    builtIns: function () { return Object.keys(BUILT_IN); }
  };
})();
