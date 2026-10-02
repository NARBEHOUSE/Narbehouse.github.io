/**
 * NARBE Mini Golf — sound and speech.
 *
 * Sound effects go through the hub's SafeAudio (plain <audio> elements): no
 * AudioContext anywhere, because one can take down the desktop build's
 * renderer (ACCESSIBILITY.md §5). Synthesised cues are rendered once into WAV
 * Blob URLs, the Sphere Splash way. Cues that fire on every shot are short,
 * low and quiet; bright sounds are saved for birdies and better.
 *
 * Speech goes through NarbeVoiceManager, wrapped in a small queue: the shared
 * speak() cancels whatever is playing, so outcome lines are queued behind each
 * other, and the game can wait for the voice to go quiet before moving on.
 */
(function () {
  'use strict';

  const U = MG.util;
  const RATE = 22050;

  /* ── WAV synthesis ────────────────────────────────────────────────────── */

  function wavUrl(samples) {
    const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function render(sec, fn) {
    const n = Math.floor(sec * RATE), out = new Float32Array(n), fade = Math.floor(RATE * 0.004);
    for (let i = 0; i < n; i++) {
      let s = fn(i / RATE, i);
      if (i < fade) s *= i / fade; else if (i > n - fade) s *= (n - i) / fade;
      out[i] = s;
    }
    return out;
  }

  /** Attack/decay envelope. */
  const env = (t, a, d, len) => (t < a ? t / a : Math.max(0, 1 - (t - a) / Math.max(1e-3, len - a)) ** d);
  const sin = (f, t) => Math.sin(2 * Math.PI * f * t);

  /** A soft bell-ish note (sine + a little octave). */
  function note(f, len, vol) {
    return render(len, t => (sin(f, t) * 0.8 + sin(f * 2, t) * 0.12) * (vol || 0.3) * env(t, 0.005, 2.2, len));
  }

  function chord(freqs, gap, len, vol) {
    const total = gap * (freqs.length - 1) + len;
    return render(total, (t) => {
      let s = 0;
      freqs.forEach((f, i) => {
        const tt = t - i * gap;
        if (tt >= 0 && tt < len) s += (sin(f, tt) * 0.75 + sin(f * 2, tt) * 0.15 + sin(f * 3, tt) * 0.05) * env(tt, 0.006, 1.8, len);
      });
      return s * (vol || 0.22);
    });
  }

  /** Pitch sweep with a phase accumulator (no clicks). */
  function sweep(len, f0, f1, vol, shape) {
    let ph = 0;
    return render(len, (t) => {
      const u = t / len;
      const f = f0 + (f1 - f0) * (shape === 'exp' ? u * u : u);
      ph += 2 * Math.PI * f / RATE;
      return Math.sin(ph) * (vol || 0.3) * env(t, 0.01, 1.4, len);
    });
  }

  /** A knock: a fast-decaying low tone with a little click. */
  function knock(f, len, vol) {
    let ph = 0;
    return render(len, (t) => {
      ph += 2 * Math.PI * (f * (1 + 0.6 * Math.exp(-t * 60))) / RATE;
      return (Math.sin(ph) * 0.9 + Math.sin(ph * 2.7) * 0.15 * Math.exp(-t * 80)) * (vol || 0.5) * Math.exp(-t * (6 / len));
    });
  }

  const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5;

  const RECIPES = {
    // The power charge: the original game's five rising pentatonic blips.
    charge1: () => note(C5, 0.15, 0.2), charge2: () => note(D5, 0.15, 0.2), charge3: () => note(E5, 0.15, 0.2),
    charge4: () => note(G5, 0.15, 0.2), charge5: () => note(C6, 0.2, 0.22),
    // Pause hold: one tick per second, each a step higher, so it works eyes-closed.
    hold1: () => note(392, 0.12, 0.22), hold2: () => note(440, 0.12, 0.22), hold3: () => note(494, 0.12, 0.22),
    hold4: () => note(523, 0.12, 0.22), hold5: () => note(587, 0.14, 0.24),
    menuMove: () => note(660, 0.07, 0.12),
    menuSelect: () => chord([523, 784], 0.05, 0.12, 0.16),
    menuBlocked: () => knock(140, 0.14, 0.35),
    ready: () => chord([523, 659], 0.09, 0.16, 0.13),
    wall: () => knock(230, 0.16, 0.55),
    rail: () => knock(300, 0.13, 0.45),
    bumper: () => sweep(0.28, 280, 640, 0.32),
    bush: () => knock(110, 0.22, 0.5),
    sand: () => knock(85, 0.2, 0.45),
    ice: () => note(1180, 0.18, 0.12),
    boost: () => sweep(0.38, 180, 760, 0.22, 'exp'),
    tunnelIn: () => sweep(0.35, 620, 160, 0.26),
    tunnelOut: () => sweep(0.3, 200, 700, 0.26),
    sail: () => knock(170, 0.2, 0.5),
    rattle: () => render(0.28, t => (Math.exp(-t * 50) * sin(420, t) + (t > 0.09 ? Math.exp(-(t - 0.09) * 55) * sin(360, t) : 0) + (t > 0.17 ? Math.exp(-(t - 0.17) * 60) * sin(330, t) * 0.6 : 0)) * 0.45),
    glow: () => chord([A5, A5 * 1.5], 0.1, 0.35, 0.12),
    cheer: () => chord([C5, E5, G5, C6], 0.1, 0.5, 0.2),
    fanfare: () => chord([C5, E5, G5, C6, G5, C6 * 1.25, C6 * 1.5], 0.12, 0.7, 0.2),
    aww: () => sweep(0.6, 392, 262, 0.2),
    pop: () => knock(160, 0.25, 0.35),
    snap: () => render(0.32, t => (Math.exp(-t * 60) * sin(140, t) + (t > 0.14 ? Math.exp(-(t - 0.14) * 60) * sin(120, t) : 0)) * 0.6),
    gatorWatch: () => sweep(0.9, 110, 90, 0.25),
    swoosh: () => sweep(0.5, 300, 520, 0.12)
  };

  const FILES = {
    putt: 'sounds/putt.wav',
    cup: 'sounds/in-hole.wav',
    splash: 'sounds/splash.wav',
    ballhit: 'sounds/balls-click.wav'
  };

  const made = {};

  function settingsOn() {
    return MG.settings ? MG.settings.get('sfx') !== false : true;
  }

  function ensure(name) {
    if (made[name] || !window.SafeAudio) return !!made[name];
    if (FILES[name]) { SafeAudio.preload('mg2-' + name, FILES[name]); made[name] = true; return true; }
    const r = RECIPES[name];
    if (!r) return false;
    SafeAudio.preload('mg2-' + name, wavUrl(r()));
    made[name] = true;
    return true;
  }

  function play(name, vol) {
    if (!settingsOn() || !window.SafeAudio) return;
    if (!ensure(name)) return;
    SafeAudio.play('mg2-' + name, vol === undefined ? 0.6 : U.clamp(vol, 0, 1));
  }

  /** Warm the cache so the first putt isn't silent while its WAV renders. */
  function preloadAll() {
    for (const k of Object.keys(FILES)) ensure(k);
    for (const k of Object.keys(RECIPES)) ensure(k);
  }

  /* ── Ambience ─────────────────────────────────────────────────────────── */

  let amb = null;
  function ambience(on) {
    try {
      if (on && MG.settings && MG.settings.get('ambience') !== false) {
        if (!amb) { amb = new Audio('sounds/ambience.wav'); amb.loop = true; amb.volume = 0.22; }
        const p = amb.play();
        if (p && p.catch) p.catch(() => {});
      } else if (amb) {
        amb.pause();
      }
    } catch (e) { /* audio unavailable */ }
  }

  /* ── Speech ───────────────────────────────────────────────────────────── */

  const queue = [];
  let speaking = false, lastStart = 0;

  function synthBusy() {
    try { return 'speechSynthesis' in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending); } catch (e) { return false; }
  }

  function ttsOn() {
    const v = U.vm();
    return !!(v && v.getSettings().ttsEnabled);
  }

  /** Speak now, cancelling anything in flight and clearing the queue (menus, focus). */
  function say(text) {
    queue.length = 0;
    const v = U.vm();
    if (!v || !text) return;
    v.speak(String(text));
    speaking = true; lastStart = performance.now();
  }

  /** Speak after whatever is already playing (outcomes, play-by-play). */
  function sayQueued(text) {
    if (!text) return;
    if (!busy()) { say(text); return; }
    if (queue.length > 3) queue.shift();   // drop the stalest rather than lag behind
    queue.push(String(text));
  }

  function busy() {
    if (!ttsOn()) return false;
    // The engine can take a beat to report "speaking" after speak().
    if (performance.now() - lastStart < 250) return true;
    return synthBusy() || queue.length > 0;
  }

  function tickSpeech() {
    if (!queue.length) { if (!synthBusy()) speaking = false; return; }
    if (performance.now() - lastStart < 250 || synthBusy()) return;
    const next = queue.shift();
    const v = U.vm();
    if (v) { v.speak(next); lastStart = performance.now(); }
  }

  function clearSpeech() { queue.length = 0; }

  /** Resolve once the voice has gone quiet (+ a breath), or after maxMs regardless. */
  function whenQuiet(maxMs, breathMs) {
    const start = performance.now();
    breathMs = breathMs === undefined ? 600 : breathMs;
    return new Promise((resolve) => {
      let quietSince = 0;
      const id = setInterval(() => {
        const now = performance.now();
        if (now - start > (maxMs || 9000)) { clearInterval(id); resolve(); return; }
        if (busy()) { quietSince = 0; return; }
        if (!quietSince) quietSince = now;
        if (now - quietSince >= breathMs) { clearInterval(id); resolve(); }
      }, 80);
    });
  }

  MG.audio = { play, preloadAll, ambience, say, sayQueued, busy, tickSpeech, clearSpeech, whenQuiet };
})();
