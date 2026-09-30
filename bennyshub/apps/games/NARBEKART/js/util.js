/**
 * NARBE Racer — shared helpers.
 *
 * Everything the game exposes hangs off a single window.NK namespace so the
 * plain <script> tags in index.html stay order-independent apart from this
 * file, which must load first (after three.min.js and spline.js).
 */
window.NK = window.NK || {};

NK.util = (function () {
  'use strict';

  /* ── Deterministic randomness ────────────────────────────────────────────
   * Track dressing and CPU personalities must be identical every time a track
   * is raced, so everything that shapes a layout runs through a seeded
   * generator rather than Math.random().
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

  /** Stable 32-bit hash so a seed can be derived from readable strings. */
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
  /** Positive modulo. */
  const mod = (a, n) => { const r = a % n; return r < 0 ? r + n : r; };
  /** Signed shortest distance from a to b on a loop of length n. */
  const loopDelta = (a, b, n) => { let d = mod(b - a, n); if (d > n / 2) d -= n; return d; };

  /* ── Persistence ─────────────────────────────────────────────────────── */
  const PREFIX = 'nk-';

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

  function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
  }

  /* ── DOM ─────────────────────────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);

  /**
   * Pointer activation that survives the touch → synthetic-click double fire.
   * Mirrors the helper used by the other hub games.
   */
  function addTap(el, fn) {
    if (!el) return;
    let touch = null, suppressClickUntil = 0;
    el.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (!t) return;
      touch = { id: t.identifier, x: t.clientX, y: t.clientY, moved: e.touches.length > 1 };
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!touch) return;
      const t = Array.from(e.touches).find(t => t.identifier === touch.id);
      if (!t || e.touches.length > 1 || Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > 10) touch.moved = true;
    }, { passive: true });
    el.addEventListener('touchcancel', () => {
      touch = null;
      suppressClickUntil = performance.now() + 700;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (!touch) return;
      const t = Array.from(e.changedTouches).find(t => t.identifier === touch.id);
      if (!t) return;
      const tapped = !touch.moved && Math.hypot(t.clientX - touch.x, t.clientY - touch.y) <= 10;
      touch = null;
      suppressClickUntil = performance.now() + 700;
      if (tapped) { e.preventDefault(); fn(e); }
    }, { passive: false });
    el.addEventListener('click', (e) => {
      if (performance.now() < suppressClickUntil) return;
      fn(e);
    });
  }

  /* ── Shared managers (may be absent if a shared script failed to load) ── */
  const vm = () => window.NarbeVoiceManager || null;
  const sm = () => window.NarbeScanManager || null;

  function isSpeaking() {
    return ('speechSynthesis' in window) && window.speechSynthesis.speaking;
  }

  /**
   * Speak through the hub's voice manager, honouring its TTS toggle.
   * Every call interrupts whatever is being said — use for menus and for the
   * race moments that matter (GO, final lap, finishing).
   */
  function speak(text) {
    const v = vm();
    if (v && text) v.speak(String(text));
  }

  /**
   * Race chatter: only speaks into silence, never over something already
   * being said, and is simply dropped otherwise. No queue, ever — a queued
   * line arrives late and describes a moment that has already passed.
   */
  function speakIfIdle(text) {
    if (isSpeaking()) return false;
    speak(text);
    return true;
  }

  /** Strip markup and emoji so labels read cleanly aloud. */
  function stripTags(html) {
    return String(html).replace(/<[^>]*>/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\s+/g, ' ').trim();
  }

  function ordinal(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return n + 'th';
    switch (n % 10) {
      case 1: return n + 'st';
      case 2: return n + 'nd';
      case 3: return n + 'rd';
      default: return n + 'th';
    }
  }

  /** Spoken form: "first", "second" … reads better through TTS than "1st". */
  const ORDINAL_WORDS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
    'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
  function ordinalWord(n) { return ORDINAL_WORDS[n] || ordinal(n); }

  function fmtTime(sec) {
    if (!isFinite(sec)) return '--:--.-';
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  /** Spoken time: "1 minute 23 seconds". */
  function sayTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec - m * 60);
    if (!m) return s + ' seconds';
    return m + (m === 1 ? ' minute ' : ' minutes ') + s + ' seconds';
  }

  return {
    rng, hash, mulberry32,
    clamp, lerp, damp, smoothstep, mod, loopDelta,
    load, save, remove,
    $, addTap,
    vm, sm, speak, speakIfIdle, isSpeaking, stripTags,
    ordinal, ordinalWord, fmtTime, sayTime
  };
})();
