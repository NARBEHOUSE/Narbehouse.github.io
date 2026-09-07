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
  /* ── The voice ──────────────────────────────────────────────────────────
     Every line the game says has a CUE ID, and if somebody has recorded that
     cue the recording is what plays. Anything not recorded is spoken by the
     system voice, so the game is always fully voiced from the first day and
     gets better as the recordings come in. tools/record.html is where they
     are made; it writes the clips into audio/vo/ and lists them in
     audio/vo/index.json, which is the manifest loaded here. */
  let voIndex = null, voAudio = null;
  function voLoadIndex() {
    if (voIndex !== null) return;
    voIndex = {};
    try {
      const req = new XMLHttpRequest();
      req.open('GET', 'audio/vo/index.json', true);
      req.onload = function () {
        if (req.status >= 200 && req.status < 300) {
          try {
            const doc = JSON.parse(req.responseText);
            voIndex = (doc && doc.lines) || doc || {};
          } catch (e) { /* a manifest that will not parse is no manifest */ }
        }
      };
      req.send();
    } catch (e) { /* file:// with no server: TTS all the way, which is fine */ }
  }

  /** Is there a recording for this cue? */
  function voHas(cue) {
    voLoadIndex();
    return !!(cue && voIndex && voIndex[cue]);
  }

  /**
   * Say something.
   *
   * @param text  the words, for the system voice
   * @param cue   the line's id, if it has one - a recording of it wins
   */
  /**
   * Several recorded lines, one after another, then the words nobody read.
   *
   * A hand-in reaction can be three lines - Walt turning the propeller over,
   * reading the journal out - and every utterance cancels the one before it,
   * so they have to WAIT rather than fire together. Any cue with no recording
   * is spoken by the system voice in its turn, so a half-recorded scene still
   * plays in the right order.
   */
  function speakSeq(items, tail, then) {
    dropEvents();
    /* AND WHEN IT IS OVER. A scene - the sonar reading, the bell - is a
       handful of these lines with something on the screen behind them, and
       whatever put it there has to know when to take it down. Optional: every
       other caller just wants the lines said. */
    const finish = function () { if (typeof then === 'function') then(); };
    const list = (items || []).filter(function (x) { return x && (x.cue || x.text); });
    if (!list.length) { if (tail) sysSpeak(tail); finish(); return; }
    let i = 0;
    const step = function () {
      if (i >= list.length) {
        if (tail) sysSpeak(tail);
        setTimeout(finish, tail ? Math.min(9000, 900 + String(tail).length * 55) : 260);
        return;
      }
      const it = list[i++];
      voLoadIndex();
      const file = it.cue && voIndex && voIndex[it.cue];
      if (!file) {
        /* No clip: say it, and move on after a beat long enough to have said
           it - the system voice gives us nothing to wait on. */
        sysSpeak(it.text || '');
        setTimeout(step, Math.min(9000, 900 + String(it.text || '').length * 55));
        return;
      }
      try {
        if (voAudio) { voAudio.pause(); voAudio = null; }
        const v0 = vm();
        if (v0 && v0.cancel) v0.cancel();
        voAudio = new Audio('audio/vo/' + file);
        voAudio.addEventListener('ended', step);
        voAudio.addEventListener('error', function () { sysSpeak(it.text || ''); setTimeout(step, 1200); });
        voAudio.play().catch(function () { sysSpeak(it.text || ''); setTimeout(step, 1200); });
      } catch (e) { sysSpeak(it.text || ''); setTimeout(step, 1200); }
    };
    step();
  }

  function speak(text, cue, tail) {
    /* The interface talking. It cuts in - that is what makes a scan feel
       connected to the switch - and it drops whatever the world was queueing,
       which is about a place you have just left. */
    dropEvents();
    voLoadIndex();
    if (cue && voIndex && voIndex[cue]) {
      try {
        if (voAudio) { voAudio.pause(); voAudio = null; }
        const v0 = vm();
        if (v0 && v0.cancel) v0.cancel();
        voAudio = new Audio('audio/vo/' + voIndex[cue]);
        /* AND THEN THE PART NOBODY RECORDED. What he paid you and what is
           next is worth saying and will never be a clip, so it follows the
           clip rather than talking over it - every utterance cancels the one
           before, so firing both at once is a way of hearing only the second. */
        if (tail) {
          voAudio.addEventListener('ended', function () { sysSpeak(tail); });
          voAudio.addEventListener('error', function () { sysSpeak(text + ' ' + tail); });
        }
        voAudio.play().catch(function () {
          voAudio = null;
          sysSpeak(tail ? (text + ' ' + tail) : text);
        });
        return;
      } catch (e) { /* fall through to the system voice */ }
    }
    sysSpeak(tail ? (text + ' ' + tail) : text);
  }
  /* WORDS THE SYSTEM VOICE GETS WRONG, respelled for it alone.
     "Bass" the fish and "bass" the instrument are spelled the same and a
     speech engine has no way to tell which it is looking at - it picks the
     instrument, so the game announces a fish called "base". Respelled here,
     at the door to the voice, so the name stays spelled properly everywhere
     it is READ: cards, the log, the map, the tackle box.
     Sound-alikes only. If one still comes out wrong, change the spelling on
     the right and nothing else moves. */
  const SAY_AS = [
    /* Third spelling, and this one is right. "bahss" came out as "boss" - a
       broad A is not the vowel wanted - and "basss" was not much better. A z
       on the end is what makes the engine say the fish: bass as in vase.
       Settled by the person listening to it, which is the only test that
       counts for a pronunciation. */
    [/\bbass(es)?\b/gi, 'basz$1'],
  ];
  function sayable(text) {
    let s = String(text);
    for (let i = 0; i < SAY_AS.length; i++) s = s.replace(SAY_AS[i][0], SAY_AS[i][1]);
    return s;
  }
  /* ── A BEAT BETWEEN ONE LINE AND THE NEXT ────────────────────────────
     The interface interrupts; the world waits. See speakEvent().
     GAP is the silence left between two world lines; HOLD is how long one
     may wait for the voice to go quiet before it stops being polite. */
  const SAY_GAP = 260, SAY_HOLD = 6000, SAY_DEPTH = 2;
  let sayQ = [], sayTimer = null, sayFrom = 0;

  /** Is anything being said right now - a clip, or the system voice? */
  function speaking() {
    if (voAudio && !voAudio.paused && !voAudio.ended) return true;
    try {
      const ss = window.speechSynthesis;
      return !!(ss && (ss.speaking || ss.pending));
    } catch (e) { return false; }
  }

  function sayPump() {
    sayTimer = null;
    if (!sayQ.length) return;
    /* Still talking, and not yet out of patience: come back in a moment. */
    if (speaking() && Date.now() - sayFrom < SAY_HOLD) {
      sayTimer = setTimeout(sayPump, 120);
      return;
    }
    const next = sayQ.shift();
    sysSpeak(next);
    sayFrom = Date.now();
    if (sayQ.length) sayTimer = setTimeout(sayPump, SAY_GAP + 400);
  }

  /**
   * Something the WORLD said - a shoal called, a cast landing, a fish on.
   *
   * Queued rather than barged in, so two events a second apart are two
   * sentences rather than half of one. Kept shallow on purpose: a third line
   * arriving pushes the oldest out, because a voice running ten seconds
   * behind the boat is worse than a line nobody hears.
   */
  function speakEvent(text) {
    if (!text) return;
    if (!speaking() && !sayQ.length) { sysSpeak(text); sayFrom = Date.now(); return; }
    sayQ.push(text);
    while (sayQ.length > SAY_DEPTH) sayQ.shift();
    if (!sayTimer) sayTimer = setTimeout(sayPump, SAY_GAP);
  }

  /** Pressing something means you have moved on: the world's queue is stale. */
  function dropEvents() {
    sayQ = [];
    if (sayTimer) { clearTimeout(sayTimer); sayTimer = null; }
  }

  function sysSpeak(text) {
    const v = vm();
    if (v && text) v.speak(sayable(text));
  }

  return {
    rng, hash, mulberry32, sayable,
    clamp, lerp, damp, smoothstep,
    load, save,
    $, addTap,
    vm, sm, speak, speakSeq, speakEvent, dropEvents, voHas
  };
})();
