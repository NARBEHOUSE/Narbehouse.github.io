/** Benny's Sphere Splash - small helpers every other file uses.
 *  The hub's shared managers may be missing (a script that failed to load), so every
 *  call into them is null-guarded: a broken voice must never break the game. */
SS.util = (function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const vm = () => window.NarbeVoiceManager || null;
  const sm = () => window.NarbeScanManager || null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** Pointer activation that survives the touch -> synthetic-click double fire
   *  (the helper every hub game uses). */
  function addTap(el, fn) {
    if (!el) return;
    let touched = false;
    el.addEventListener('touchend', e => { e.preventDefault(); touched = true; fn(e); }, { passive: false });
    el.addEventListener('click', e => { if (touched) { touched = false; return; } fn(e); });
  }

  /* ── speech ──────────────────────────────────────────────────────────────
     The interface voice is the player's own hub voice, and it always cuts in:
     that is what makes a scan step feel connected to the switch. Commentary
     speaks only into silence (broadcast.js), and never within a moment of the
     interface having spoken - the voice manager defers each line by a tick, so
     "is anything speaking?" alone would let commentary supersede a menu line. */
  let lastUiSpeech = 0;
  /** Returns the voice manager's ticket ({ started, finished, cancel }), or null: the shared
   *  choice scanner waits on `finished` when the player has Wait for Speech on. */
  function speak(text) {
    const v = vm();
    lastUiSpeech = performance.now();
    return v && text ? v.speak(sayable(String(text))) || null : null;
  }
  function speaking() {
    try { const s = window.speechSynthesis; return !!(s && (s.speaking || s.pending)); } catch (e) { return false; }
  }
  function uiSpokeRecently(ms) { return performance.now() - lastUiSpeech < (ms || 1500); }
  /** Speak as someone else (a commentator): a different pitch and pace, same toggle. */
  function speakAs(text, opts) {
    const v = vm();
    if (v && text) v.speak(sayable(String(text)), opts || {});
  }
  function stopSpeech() { const v = vm(); if (v && v.cancel) v.cancel(); }

  /** Words the system voice reads wrongly, respelled for it alone. */
  const SAY_AS = [[/\bHP\b/g, 'H P'], [/\bvs\b/g, 'versus'], [/#(\d+)/g, 'number $1']];
  function sayable(s) { SAY_AS.forEach(([re, to]) => { s = s.replace(re, to); }); return s; }

  function stripTags(html) {
    return String(html).replace(/<[^>]*>/g, ' ')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\s+/g, ' ').trim();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /** The voice pipeline's slug (produce.py slug()): "Benji Tide" -> "benji-tide". Recorded clips are keyed by it. */
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const hex = c => typeof c === 'number' ? '#' + ('000000' + c.toString(16)).slice(-6) : String(c || '');
  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
  const numWord = n => NUMBER_WORDS[n] || String(n);
  function fmtClock(sec) {
    const s = Math.max(0, Math.ceil(sec)), m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }
  function shuffle(list, rnd) {
    const a = list.slice(), r = rnd || Math.random;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ── motion ──────────────────────────────────────────────────────────────
     Settings > Motion: Full or Reduced. Until the player picks one it follows the
     device's own reduce-motion setting (Ballista's way), live if that changes. */
  const motionQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() {
    const m = SS.save && SS.save.settings.get('motion');
    return m === 'reduced' || (m !== 'full' && !!(motionQuery && motionQuery.matches));
  }
  /** Calls fn() now and whenever the device's own setting changes. */
  function onDeviceMotion(fn) { if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', fn); }

  return { $, vm, sm, clamp, addTap, speak, speakAs, speaking, uiSpokeRecently, stopSpeech, sayable,
    stripTags, esc, slug, hex, numWord, fmtClock, shuffle, reducedMotion, onDeviceMotion };
})();
