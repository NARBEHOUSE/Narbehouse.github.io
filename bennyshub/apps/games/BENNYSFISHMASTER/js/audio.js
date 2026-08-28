/**
 * Benny's Race Tracks — audio.
 *
 * All sound is synthesised at runtime (no asset files to ship or fail to load).
 * A single AudioContext is shared for the whole session; the hub's other games
 * create one per beep, which is wasteful and eventually hits the browser's
 * context limit during a long race.
 *
 * Every entry point is wrapped defensively: if Web Audio misbehaves inside the
 * Electron iframe the game keeps running silently rather than throwing.
 */
RT.audio = (function () {
  'use strict';

  const U = RT.util;

  let ctx = null;
  let master = null;
  let broken = false;
  let enabled = U.load('sound', true);

  /* Continuous engine drone */
  let engineOsc = null, engineSub = null, engineFilter = null, engineGain = null;
  let engineRunning = false;

  function ensure() {
    if (broken) return null;
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { broken = true; return null; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    } catch (e) {
      broken = true;
      return null;
    }
    return ctx;
  }

  /** Browsers start the context suspended until a user gesture. */
  function resume() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  /**
   * Build a gain → (optional pan) → master chain.
   * StereoPannerNode is what makes the left/right cues land in the matching
   * ear, which is the whole point of the audio guidance.
   */
  function chain(pan) {
    const g = ctx.createGain();
    if (pan !== undefined && pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = U.clamp(pan, -1, 1);
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }
    return g;
  }

  /** One shaped oscillator note. */
  function tone(freq, dur, opts) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    opts = opts || {};
    try {
      const t0 = now() + (opts.delay || 0);
      const g = chain(opts.pan);
      const osc = c.createOscillator();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
      }
      const vol = (opts.vol === undefined ? 0.16 : opts.vol);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  /** Filtered white noise — crashes, whooshes, tyre scuffs. */
  function noise(dur, opts) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    opts = opts || {};
    try {
      const t0 = now() + (opts.delay || 0);
      const frames = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, frames, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

      const src = c.createBufferSource();
      src.buffer = buf;

      const filt = c.createBiquadFilter();
      filt.type = opts.filterType || 'lowpass';
      filt.frequency.setValueAtTime(opts.freq || 900, t0);
      if (opts.freqTo) filt.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqTo), t0 + dur);
      filt.Q.value = opts.q || 1;

      const g = chain(opts.pan);
      const vol = (opts.vol === undefined ? 0.22 : opts.vol);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      src.connect(filt); filt.connect(g);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  /* ── Engine drone ─────────────────────────────────────────────────────── */

  function startEngine(profile) {
    if (!enabled || engineRunning) return;
    const c = ensure();
    if (!c) return;
    try {
      engineGain = c.createGain();
      engineGain.gain.value = 0.0001;
      engineGain.connect(master);

      engineFilter = c.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 620;
      engineFilter.Q.value = 4;
      engineFilter.connect(engineGain);

      engineOsc = c.createOscillator();
      engineOsc.type = (profile === 'spaceship') ? 'sine' : 'sawtooth';
      engineOsc.frequency.value = 70;
      engineOsc.connect(engineFilter);

      // A detuned sub an octave down gives the drone some weight.
      engineSub = c.createOscillator();
      engineSub.type = 'triangle';
      engineSub.frequency.value = 35;
      engineSub.connect(engineFilter);

      engineOsc.start();
      engineSub.start();
      engineGain.gain.exponentialRampToValueAtTime(0.09, now() + 0.6);
      engineRunning = true;
    } catch (e) { /* ignore */ }
  }

  /** @param {number} speedNorm 0..1 — how fast we are going relative to top speed. */
  function updateEngine(speedNorm, boosting) {
    if (!engineRunning || !ctx) return;
    try {
      const t = now();
      const base = 62 + speedNorm * 118 + (boosting ? 40 : 0);
      engineOsc.frequency.setTargetAtTime(base, t, 0.08);
      engineSub.frequency.setTargetAtTime(base * 0.5, t, 0.08);
      engineFilter.frequency.setTargetAtTime(480 + speedNorm * 1500, t, 0.12);
      engineGain.gain.setTargetAtTime(enabled ? (0.055 + speedNorm * 0.075) : 0.0001, t, 0.15);
    } catch (e) { /* ignore */ }
  }

  function stopEngine() {
    if (!engineRunning) return;
    try {
      engineGain.gain.setTargetAtTime(0.0001, now(), 0.12);
      const o = engineOsc, s = engineSub;
      setTimeout(() => {
        try { o.stop(); s.stop(); } catch (e) {}
      }, 400);
    } catch (e) { /* ignore */ }
    engineOsc = engineSub = engineFilter = engineGain = null;
    engineRunning = false;
  }

  /* ── Game sounds ──────────────────────────────────────────────────────── */

  /**
   * The directional guidance cue. Pitch AND stereo position both encode the
   * direction so it reads whether or not the player is wearing headphones.
   */
  function cue(dir) {
    if (dir < 0) {
      tone(392, 0.16, { pan: -0.85, type: 'triangle', vol: 0.22 });
      tone(523, 0.18, { pan: -0.85, type: 'triangle', vol: 0.20, delay: 0.13 });
    } else if (dir > 0) {
      tone(659, 0.16, { pan: 0.85, type: 'triangle', vol: 0.22 });
      tone(880, 0.18, { pan: 0.85, type: 'triangle', vol: 0.20, delay: 0.13 });
    } else {
      tone(523, 0.20, { type: 'sine', vol: 0.18 });
    }
  }

  function cleared() {
    tone(784, 0.10, { type: 'sine', vol: 0.14 });
    tone(1047, 0.14, { type: 'sine', vol: 0.12, delay: 0.08 });
  }

  function crash() {
    noise(0.42, { freq: 1600, freqTo: 90, vol: 0.34 });
    tone(90, 0.34, { type: 'square', vol: 0.20, slideTo: 42 });
  }

  function bump() {
    noise(0.16, { freq: 700, freqTo: 160, vol: 0.18 });
  }

  function pickup(index) {
    const scale = [523, 587, 659, 784, 880, 988, 1175];
    const f = scale[Math.min(index || 0, scale.length - 1)];
    tone(f, 0.16, { type: 'triangle', vol: 0.20 });
    tone(f * 1.5, 0.22, { type: 'sine', vol: 0.15, delay: 0.09 });
  }

  function boost() {
    noise(0.55, { freq: 300, freqTo: 4200, vol: 0.22, filterType: 'bandpass', q: 2 });
    tone(220, 0.5, { type: 'sawtooth', vol: 0.14, slideTo: 1200 });
  }

  function stunt() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      tone(f, 0.22, { type: 'triangle', vol: 0.17, delay: i * 0.07 }));
    noise(0.7, { freq: 500, freqTo: 3000, vol: 0.14, filterType: 'bandpass', q: 1.5 });
  }

  function shield() {
    tone(659, 0.3, { type: 'sine', vol: 0.16, slideTo: 1319 });
  }

  function countdown(n) {
    if (n > 0) tone(440, 0.22, { type: 'square', vol: 0.20 });
    else       tone(880, 0.5,  { type: 'square', vol: 0.24 });
  }

  function fanfare() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, 0.42, { type: 'triangle', vol: 0.20, delay: i * 0.13 }));
    tone(1568, 0.7, { type: 'sine', vol: 0.16, delay: 0.55 });
  }

  function fail() {
    [440, 392, 330, 262].forEach((f, i) =>
      tone(f, 0.3, { type: 'triangle', vol: 0.18, delay: i * 0.14 }));
  }

  /* ── Obstacle warning ─────────────────────────────────────────────────────
   * A repeating pulse for as long as the vehicle is lined up with something
   * solid. Deliberately low and dry so it doesn't blur into the bright
   * direction cues, and it simply stops the moment the path is clear.
   */
  let warnTimer = null;

  function startWarning() {
    if (warnTimer || !enabled) return;
    const pulse = () => {
      tone(196, 0.11, { type: 'square', vol: 0.13 });
      tone(147, 0.13, { type: 'square', vol: 0.10, delay: 0.11 });
    };
    pulse();
    warnTimer = setInterval(pulse, 460);
  }

  function stopWarning() {
    if (warnTimer) { clearInterval(warnTimer); warnTimer = null; }
  }

  function menuMove() { tone(660, 0.07, { type: 'square', vol: 0.09 }); }

  /* ── Pulling over ────────────────────────────────────────────────────────
     This used to borrow menuMove - a 660Hz SQUARE blip - and fire it every
     quarter second for as long as the boat was coming round. Fifteen of those
     in a row is an alarm, not an invitation. These are soft sines on a warm
     rising third: an open, a couple of quiet pips while the offer stands, and
     a resolve when the boat commits. */

  /** The offer opens: two warm notes, going up. */
  function pullOpen() {
    tone(392.0, 0.16, { type: 'sine', vol: 0.10 });                 // G4
    tone(523.3, 0.26, { type: 'sine', vol: 0.09, delay: 0.11 });    // C5
  }

  /** A soft pip while the offer stands. `k` is 0..1 through the window. */
  function pullTick(k) {
    const f = 466 + 180 * Math.max(0, Math.min(1, k || 0));
    tone(f, 0.09, { type: 'sine', vol: 0.055 });
  }

  /** Committed: a settled, friendly resolve. */
  function pullGo() {
    tone(523.3, 0.14, { type: 'sine', vol: 0.10 });                 // C5
    tone(659.3, 0.30, { type: 'sine', vol: 0.09, delay: 0.10 });    // E5
  }
  function menuSelect() {
    tone(523, 0.09, { type: 'square', vol: 0.12 });
    tone(784, 0.13, { type: 'square', vol: 0.10, delay: 0.07 });
  }
  function menuBlocked() { tone(150, 0.16, { type: 'square', vol: 0.10 }); }

  /* ── Settings ─────────────────────────────────────────────────────────── */
  function setEnabled(on) {
    enabled = !!on;
    U.save('sound', enabled);
    if (!enabled) { stopEngine(); stopWarning(); }
    if (window.SafeAudio && window.SafeAudio.setEnabled) {
      try { window.SafeAudio.setEnabled(enabled); } catch (e) {}
    }
  }
  function isEnabled() { return enabled; }


  /* ══════════════════════════════════════════════════════════════════════
     FISHMASTER — water, motor, reel, bite
     Every cue with a left/right meaning is stereo-panned; everything without
     one is centred. "Fish on!" has no direction, so it sits dead centre. (§7.2)
     ══════════════════════════════════════════════════════════════════════ */

  /**
   * The zone direction cue. Reuses the racer's two-note guidance tone, which
   * already encodes direction as pitch AND stereo position — low in the left
   * ear, high in the right — so it reads with or without headphones.
   * 'both' plays each side in turn, left first.
   */
  function panTone(side) {
    if (side === 'left')  { cue(-1); return; }
    if (side === 'right') { cue(1); return; }
    if (side === 'both')  { cue(-1); setTimeout(() => cue(1), 300); return; }
    cue(0);
  }

  /** Holding toward a side with no zone on it. A shrug, not a buzzer. */
  function nothingThere() {
    tone(180, 0.14, { type: 'sine', vol: 0.10, slideTo: 130 });
    noise(0.12, { freq: 420, freqTo: 160, vol: 0.07 });
  }

  /* ── Motor + water ambience ──────────────────────────────────────────── */

  let waterSrc = null, waterGain = null, motorOsc = null, motorGain = null;

  /** A low filtered-noise bed: the lake under the boat. Runs the whole trip. */
  function startWater() {
    if (!enabled || waterSrc) return;
    const c = ensure();
    if (!c) return;
    try {
      const frames = Math.floor(c.sampleRate * 3);
      const buf = c.createBuffer(1, frames, c.sampleRate);
      const d = buf.getChannelData(0);
      // Brown-ish noise: smoother than white, and it sits under speech.
      let last = 0;
      for (let i = 0; i < frames; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.05) * 0.985;
        d[i] = last * 3;
      }
      waterSrc = c.createBufferSource();
      waterSrc.buffer = buf;
      waterSrc.loop = true;
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 520;
      waterGain = c.createGain();
      waterGain.gain.value = 0.07;
      waterSrc.connect(filt); filt.connect(waterGain); waterGain.connect(master);
      waterSrc.start();
    } catch (e) { waterSrc = null; }
  }

  function stopWater() {
    try { if (waterSrc) waterSrc.stop(); } catch (e) { /* ignore */ }
    waterSrc = null; waterGain = null;
  }

  /** The outboard, trolling. `level` 0 = idle at a zone, 1 = under way. */
  function motorLevel(level) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    try {
      if (!motorOsc) {
        motorOsc = c.createOscillator();
        motorOsc.type = 'sawtooth';
        motorOsc.frequency.value = 62;
        const filt = c.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 260;
        motorGain = c.createGain();
        motorGain.gain.value = 0.0001;
        motorOsc.connect(filt); filt.connect(motorGain); motorGain.connect(master);
        motorOsc.start();
      }
      const t = now();
      motorGain.gain.cancelScheduledValues(t);
      motorGain.gain.setTargetAtTime(0.012 + 0.030 * U.clamp(level, 0, 1), t, 0.35);
      motorOsc.frequency.setTargetAtTime(52 + 26 * U.clamp(level, 0, 1), t, 0.4);
    } catch (e) { /* ignore */ }
  }

  function motorIdle() { motorLevel(0); }
  function motorUp()   { motorLevel(1); }
  function stopMotor() {
    try { if (motorOsc) { motorGain.gain.setTargetAtTime(0.0001, now(), 0.2); } } catch (e) { /* ignore */ }
  }

  /* ── Casting and the bite ────────────────────────────────────────────── */

  function cast() {
    noise(0.34, { freq: 2600, freqTo: 700, vol: 0.16 });          // the whip
    tone(320, 0.10, { type: 'sine', vol: 0.12, slideTo: 180, delay: 0.36 });
    noise(0.16, { freq: 900, freqTo: 260, vol: 0.14, delay: 0.36 });  // the plop
  }

  /** Rising two-note, CENTRED — there is no direction in a bite. (§7.2) */
  function biteAlert() {
    tone(587, 0.16, { type: 'triangle', vol: 0.24 });
    tone(880, 0.26, { type: 'triangle', vol: 0.24, delay: 0.15 });
  }

  /* ── The reel ────────────────────────────────────────────────────────── */

  let reelTimer = null, creakAt = 0;

  /** Steady clicking while the line is coming in. */
  function reelStart() {
    stopReelLoop();
    if (!enabled) return;
    reelTimer = setInterval(() => tone(1200, 0.03, { type: 'square', vol: 0.05 }), 130);
  }
  function reelClick() { tone(1200, 0.04, { type: 'square', vol: 0.07 }); }
  function stopReelLoop() {
    if (reelTimer) { clearInterval(reelTimer); reelTimer = null; }
  }
  function reelStop() {
    stopReelLoop();
    tone(784, 0.12, { type: 'sine', vol: 0.16 });
    tone(1047, 0.18, { type: 'sine', vol: 0.14, delay: 0.10 });
  }

  /** Tension above the band: the line complaining. */
  function lineCreak() {
    const t = Date.now();
    if (t - creakAt < 400) return;      // don't stack on a fast oscillation
    creakAt = t;
    tone(210, 0.30, { type: 'sawtooth', vol: 0.10, slideTo: 260 });
    noise(0.26, { freq: 1100, freqTo: 480, vol: 0.06 });
  }

  /** Tension below the band: the reel spinning free. */
  function freeSpool() {
    noise(0.28, { freq: 2400, freqTo: 1500, vol: 0.07 });
    tone(660, 0.10, { type: 'square', vol: 0.05 });
  }

  /** A landed fish. */
  function splash() {
    noise(0.42, { freq: 1800, freqTo: 300, vol: 0.22 });
    tone(240, 0.20, { type: 'sine', vol: 0.10, slideTo: 150, delay: 0.05 });
  }


  /** One click per notch of cast charge, rising with the meter, so the ear
      can follow the power without watching the bar. */
  function chargeTick(frac) {
    tone(420 + 520 * U.clamp(frac, 0, 1), 0.05, { type: 'square', vol: 0.09 });
  }

  /** The aimer sweeping round. Soft, and panned to where it is pointing. */
  function aimTick(pan) {
    tone(700, 0.03, { type: 'sine', vol: 0.05, pan: U.clamp(pan, -1, 1) });
  }


  /** The take is missed and the fish spits the hook. A shrug, not a buzzer. */
  function spitHook() {
    noise(0.20, { freq: 900, freqTo: 260, vol: 0.12 });
    tone(300, 0.16, { type: 'sine', vol: 0.10, slideTo: 190 });
  }

  /** A beat before the fish runs — the cue to let go. Rising, centred. */
  function runWarn() {
    tone(330, 0.14, { type: 'triangle', vol: 0.22 });
    tone(494, 0.20, { type: 'triangle', vol: 0.22, delay: 0.12 });
    tone(659, 0.26, { type: 'triangle', vol: 0.20, delay: 0.26 });
  }

  /** The line parts. The one genuinely bad sound in the game. */
  function lineSnap() {
    noise(0.10, { freq: 5200, freqTo: 1800, vol: 0.30 });
    tone(880, 0.16, { type: 'sawtooth', vol: 0.18, slideTo: 120 });
    noise(0.40, { freq: 700, freqTo: 120, vol: 0.16, delay: 0.06 });
  }

  /** Scenery brushed in passing — a wake, and nothing else. (§6.6) */
  function wake() {
    noise(0.30, { freq: 1200, freqTo: 320, vol: 0.10 });
  }

  return {
    resume, setEnabled, isEnabled,
    // fishmaster
    panTone, nothingThere, startWater, stopWater, motorIdle, motorUp, motorLevel, stopMotor,
    cast, chargeTick, aimTick, biteAlert, spitHook, runWarn, lineSnap, reelStart, reelClick, reelStop, stopReelLoop, lineCreak, freeSpool,
    splash, wake,
    startEngine, updateEngine, stopEngine,
    cue, cleared, crash, bump, pickup, boost, stunt, shield,
    startWarning, stopWarning,
    countdown, fanfare, fail,
    menuMove, pullOpen, pullTick, pullGo, menuSelect, menuBlocked,
    tone, noise
  };
})();
