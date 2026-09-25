/**
 * Benny's Race Tracks — shared helpers.
 *
 * Everything the game exposes hangs off a single window.RT namespace so the
 * plain <script> tags in index.html stay order-independent apart from this
 * file, which must load first.
 */
window.RT = window.RT || {};

RT.util = (function () {
  'use strict';

  /* ── Deterministic randomness ────────────────────────────────────────────
   * Competitive levels have to be byte-for-byte identical every time they are
   * played, so every layout decision runs through a seeded generator rather
   * than Math.random().
   */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rng(seed) {
    const next = mulberry32(seed);
    return {
      next: next,
      range: (a, b) => a + next() * (b - a),
      int: (a, b) => Math.floor(a + next() * (b - a + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length],
      chance: (p) => next() < p,
      sign: () => (next() < 0.5 ? -1 : 1)
    };
  }

  /** Stable 32-bit hash so a level seed can be derived from readable strings. */
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* ── Maths ───────────────────────────────────────────────────────────── */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);

  /** Frame-rate independent approach of `a` toward `b`. */
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

  /* ── Persistence ─────────────────────────────────────────────────────── */
  const PREFIX = 'rt-';

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      /* storage disabled — progress just won't persist */
    }
  }

  /* ── DOM ─────────────────────────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);

  /**
   * Pointer activation that survives the touch → synthetic-click double fire.
   * Mirrors the helper used by the other hub games.
   */
  function addTap(el, fn) {
    if (!el) return;
    let touchFired = false;
    el.addEventListener('touchend', (e) => {
      e.preventDefault();
      touchFired = true;
      fn(e);
    }, { passive: false });
    el.addEventListener('click', (e) => {
      if (touchFired) { touchFired = false; return; }
      fn(e);
    });
  }

  /* ── Shared managers (may be absent if a shared script failed to load) ── */
  const vm = () => window.NarbeVoiceManager || null;
  const sm = () => window.NarbeScanManager || null;

  /** Speak through the hub's voice manager, honouring its TTS toggle. */
  function speak(text) {
    const v = vm();
    if (v && text) v.speak(String(text));
  }

  return {
    rng, hash, mulberry32,
    clamp, lerp, damp, smoothstep,
    load, save,
    $, addTap,
    vm, sm, speak
  };
})();
