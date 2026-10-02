/**
 * NARBE Mini Golf — shared helpers.
 *
 * Everything hangs off one window.MG namespace so the plain <script> tags in
 * index.html (and the editor, and the node test tools) stay order-independent
 * apart from this file, which must load first.
 */
(function (root) {
  'use strict';

  const MG = root.MG = root.MG || {};

  /* ── Maths ─────────────────────────────────────────────────────────────── */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const smootherstep = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOutCubic = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; t = clamp(t, 0, 1); return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  /** Frame-rate independent approach of a toward b. */
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

  /** Shortest signed difference between two angles (radians). */
  function angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

  const deg = (r) => r * 180 / Math.PI;
  const rad = (d) => d * Math.PI / 180;

  /* ── Deterministic randomness ─────────────────────────────────────────────
   * Shots are simulated in full the moment the putter connects, then played
   * back. The sand and ice "skate" deflections must therefore come from a
   * seeded generator, or the playback would not match the plan.
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

  function hash(str) {
    let h = 2166136261 >>> 0;
    str = String(str);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* ── Persistence ──────────────────────────────────────────────────────── */
  const PREFIX = 'mg2-';

  function load(key, fallback) {
    try {
      const raw = root.localStorage && root.localStorage.getItem(PREFIX + key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      if (root.localStorage) root.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) { /* storage disabled — progress just won't persist */ }
  }

  function remove(key) {
    try { if (root.localStorage) root.localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
  }

  /* ── DOM ──────────────────────────────────────────────────────────────── */
  const $ = (id) => root.document ? root.document.getElementById(id) : null;

  /** Pointer activation that survives the touch → synthetic-click double fire. */
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ── Shared hub managers (may be absent if a shared script failed) ─────── */
  const vm = () => root.NarbeVoiceManager || null;
  const sm = () => root.NarbeScanManager || null;

  function isOneSwitch() {
    const s = sm();
    return !!(s && s.getSettings().autoScan);
  }

  function scanInterval() {
    const s = sm();
    return s ? s.getScanInterval() : 2000;
  }

  /** Ordinal for a podium place: 1 → "1st". */
  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /** "+2", "E", "-1" — the way a golf scoreboard reads relative to par. */
  function toPar(n) {
    if (n === 0) return 'E';
    return n > 0 ? '+' + n : String(n);
  }

  MG.util = {
    clamp, lerp, smoothstep, smootherstep, easeOutCubic, easeInOutCubic, easeOutBack,
    damp, dampAngle, angleDiff, deg, rad,
    mulberry32, hash,
    load, save, remove,
    $, addTap, escapeHtml,
    vm, sm, isOneSwitch, scanInterval,
    ordinal, toPar
  };
})(typeof window !== 'undefined' ? window : globalThis);
