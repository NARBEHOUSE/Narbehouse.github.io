/**
 * Benny's P3GL — shared helpers.
 *
 * Every file hangs off one window.P3 namespace so the plain <script> tags in
 * index.html, the editor, and the node tools stay order-independent apart
 * from this file, which must load first. Nothing here touches THREE.
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};

  /* ── Maths ─────────────────────────────────────────────────────────────── */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInCubic = (t) => { t = clamp(t, 0, 1); return t * t * t; };
  const easeInOutCubic = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; t = clamp(t, 0, 1); return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const easeOutElastic = (t) => {
    t = clamp(t, 0, 1);
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
  };
  /** Frame-rate independent approach of a toward b. */
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
  const deg = (r) => r * 180 / Math.PI;
  const rad = (d) => d * Math.PI / 180;
  const TAU = Math.PI * 2;

  /* ── Deterministic randomness ───────────────────────────────────────────
   * The aim guide simulates the shot ahead of time. Any jitter the physics
   * adds must come from a seeded generator, or the real shot would wander
   * off the line the player aimed with.
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

  /* ── Persistence ─────────────────────────────────────────────────────────
   * Keys keep the old bennys-peggle- prefix (P3GL's saves and campaign files
   * have always used it). v3 is the campaign-mode rebuild.
   */
  const PREFIX = 'bennys-peggle-v3-';

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
      return true;
    } catch (e) { return false; /* storage full or disabled — progress just won't persist */ }
  }

  function remove(key) {
    try { if (root.localStorage) root.localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
  }

  /* ── DOM ────────────────────────────────────────────────────────────── */
  const $ = (id) => (root.document ? root.document.getElementById(id) : null);

  function el(tag, cls, html) {
    const e = root.document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  /**
   * Pointer activation that survives the touch → synthetic-click double fire,
   * and ignores a finger that slid (a scroll is not a press).
   */
  function addTap(node, fn) {
    if (!node) return;
    let touchFired = false, sx = 0, sy = 0, moved = false;
    node.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; moved = false;
    }, { passive: true });
    node.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) moved = true;
    }, { passive: true });
    node.addEventListener('touchend', (e) => {
      if (moved) return;
      e.preventDefault();
      touchFired = true;
      fn(e);
    }, { passive: false });
    node.addEventListener('click', (e) => {
      if (touchFired) { touchFired = false; return; }
      fn(e);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function stripTags(html) {
    return String(html).replace(/<[^>]*>/g, ' ')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\s+/g, ' ').trim();
  }

  /* ── Shared hub managers (may be absent if a shared script failed) ──── */
  const vm = () => root.NarbeVoiceManager || null;
  const sm = () => root.NarbeScanManager || null;

  function isOneSwitch() {
    const s = sm();
    try { return !!(s && s.getSettings().autoScan); } catch (e) { return false; }
  }

  function scanInterval() {
    const s = sm();
    try { return s ? s.getScanInterval() : 2000; } catch (e) { return 2000; }
  }

  /* ── Formatting ─────────────────────────────────────────────────────── */
  function fmt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function isPhone() {
    if (!root.innerWidth) return false;
    const a = Math.min(root.innerWidth, root.innerHeight), b = Math.max(root.innerWidth, root.innerHeight);
    return a <= 600 && b <= 1100;
  }

  function reducedMotion() {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  P3.util = {
    clamp, lerp, invLerp, smoothstep, easeOutCubic, easeInCubic, easeInOutCubic, easeOutBack, easeOutElastic,
    damp, deg, rad, TAU,
    mulberry32, hash,
    PREFIX, load, save, remove,
    $, el, addTap, escapeHtml, stripTags,
    vm, sm, isOneSwitch, scanInterval,
    fmt, plural, ordinal, isPhone, reducedMotion, deepClone
  };
})(typeof window !== 'undefined' ? window : globalThis);
