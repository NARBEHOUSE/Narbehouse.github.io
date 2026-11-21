/* ROBOTFOOTBALL — the broadcast: Penny Sparks (play-by-play), CAL-9000 (robot commentator) and the Stadium PA.
 *
 * Ported from Benny's Sphere Splash (apps/games/BENNYSSPHERESPLASH/js/broadcast.js). The script is
 * js/voice-lines.generated.js (built from content/voice-lines.json); recordings are listed in
 * js/voice-index.generated.js (the same list as audio/vo/index.json, as a script so it works from file://).
 * A clip key is the line id, or "<line id>@<team id>" for a line recorded once per team. A line with no
 * recording is read by the system voice with its speaker's pitch, so nothing ever goes silent, and every
 * line is captioned with the speaker's name (never colour alone).
 *
 * say(family, slots, priority) picks a line:
 *  - each family has a play rate in the script (play: [chance, most per game]): not every moment is commented;
 *  - a no-repeat shuffle per family, SAVED in the browser by line id, so Ben hears the whole pool across
 *    sessions before a line comes back (he plays every day);
 *  - a line may carry a reply (CAL answering Penny): it plays straight after and is dropped with its line;
 *  - a cooldown per speaker; chatter is dropped inside it, and stale lines are dropped, never played late;
 *  - the interface always wins (ACCESSIBILITY.md: commentary never over the interface). A menu or scanner
 *    line cuts chatter at once. A short call already playing ("Caught!") finishes; the interface waits for it.
 * The game holds its next screen for a call for at most a moment (callInFlight; ui.js caps the wait).
 */
(function (global) {
  'use strict';

  const STORE = 'robotfootball-broadcast-v1';
  const COOLDOWN = { pa: 0, pbp: 1.6, cal: 5 };     // seconds between lines, per speaker (chatter only)
  const CALL = 3, WHISTLE = 4;                       // priorities: 1 chatter, 2 a moment, 3 must say, 4 whistle
  const STALE_S = 2.5, STALE_CALL_S = 6, MAX_WAIT_S = 8, SAME_MOMENT_S = 0.25;
  const CAPTION_MS = 2600;

  let host = { floor: () => false, ttsBusy: () => false, interfaceWaiting: () => false, mode: () => 'full', voiceOn: () => true, caption: () => null };
  let voIndex = null, clip = null, clipLine = null, captionTimer = null, ttsLine = null;
  let history = [], played = [], perGame = {}, lastAt = { pa: -99, pbp: -99, cal: -99 };
  let moment = 0, momentAt = -99, token = 0;
  const queue = [], done = new Set();
  let pumpTimer = null, busyUntil = 0;

  const data = () => global.RF_VOICE_LINES || { families: {}, speakers: {}, play: {} };
  const now = () => performance.now() / 1000;

  // ---- variety that survives sessions ----
  let bags = {};
  try { bags = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (_) { bags = {}; }
  function saveBags() { try { localStorage.setItem(STORE, JSON.stringify(bags)); } catch (_) { /* private window */ } }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function pick(family) {
    const list = data().families[family];
    if (!list || !list.length) return null;
    const ids = list.map(l => l.id), b = bags[family] = bags[family] || { left: [], last: null };
    b.left = (b.left || []).filter(id => ids.includes(id));         // a script edit never leaves a dead id behind
    if (!b.left.length) {
      b.left = shuffle(ids.slice());
      if (b.left.length > 1 && b.left[b.left.length - 1] === b.last) b.left.unshift(b.left.pop());   // never twice running
    }
    const id = b.left.pop();
    b.last = id; saveBags();
    return list.find(l => l.id === id);
  }

  function rate(family) {
    const p = data().play || {};
    return p[family] || (family.startsWith('opp_') && p.opponent) || [1, 0];
  }
  /** Would this family speak now (play rate and per-game cap)? Rolls the dice. */
  function allowed(family) {
    const [chance, max] = rate(family);
    if (max && (perGame[family] || 0) >= max) return false;
    return Math.random() < chance;
  }

  function fill(text, slots) {
    return text.replace(/\{(\w+)\}/g, (m, k) => (slots && slots[k] != null ? slots[k] : ''))
      .replace(/\s+([.,!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }

  function loadIndex() {
    if (voIndex !== null) return;
    voIndex = (global.RF_VOICE_INDEX && global.RF_VOICE_INDEX.lines) || {};
  }
  function clipFile(line, key) {
    loadIndex();
    return (key && voIndex[line.id + '@' + key]) || voIndex[line.id] || null;
  }

  /** Is a line spoken aloud under the Commentary setting? Captions show unless it is Off. */
  function audible(line, family) {
    const m = host.mode();
    if (!host.voiceOn() || m === 'captions') return false;
    return m === 'full' || (m === 'calls' && (line.speaker === 'pa' || LIVE_CALLS.includes(family)));
  }
  // The calls that replace the game's own spoken call: they always speak in "Big calls only" too.
  const LIVE_CALLS = ['catch', 'divingCatch', 'returnCatch', 'interception', 'broken', 'kickoff', 'onside', 'punt',
    'fieldGoalUp', 'extraPointUp', 'touchdownCall', 'pickSix', 'returnTouchdown', 'fieldGoalBlocked', 'puntBlocked'];

  /** Queue a line from a family. Returns the caption text, or null when nothing is said. */
  function say(family, slots, priority, opts) {
    if (host.mode() === 'off') return null;
    const pri = priority || 1, t = now();
    const list = data().families[family];
    if (!list || !list.length) return null;
    if (!(opts && opts.force) && !allowed(family)) return null;
    const mo = t - momentAt > 1 ? moment + 1 : moment;   // lines asked for within a second are one moment
    // chatter never waits behind another moment's lines; it may follow its own moment's call (a touchdown's quip)
    if (pri < CALL && queue.some(q => q.mo !== mo)) return null;
    const line = pick(family);
    if (!line) return null;
    if (pri < CALL && t - (lastAt[line.speaker] || -99) < (COOLDOWN[line.speaker] || 0)) return null;
    perGame[family] = (perGame[family] || 0) + 1;
    lastAt[line.speaker] = t;
    if (pri >= WHISTLE) { queue.length = 0; hush(); }
    if (pri >= CALL) for (let i = queue.length - 1; i >= 0; i--) if (queue[i].pri < CALL && queue[i].mo !== mo) queue.splice(i, 1);
    moment = mo; momentAt = t;
    const key = slots && slots._key, text = fill(line.text, slots), id = ++token, stale = opts && opts.stale;
    queue.push({ line, text, pri, family, key, at: t, born: t, mo, id, stale });
    if (line.reply) queue.push({ line: line.reply, text: fill(line.reply.text, slots), pri, family, key, at: t, born: t, mo, id: ++token, after: id, stale });
    while (queue.length > 5) { const i = queue.findIndex(q => q.pri < CALL); queue.splice(i >= 0 ? i : 0, 1); }
    history.push({ id: line.id, family, text, at: t }); if (history.length > 80) history.shift();
    // Start on the next tick, not now: the game asks for a reaction and then reads its own result line in the same
    // step, and a clip started first was cut at 0 s by that line (captions showed, no audio - 2026-11-21).
    if (!pumpTimer) pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, 0);
    return text;
  }

  function recording() { return !!(clip && !clip.paused && !clip.ended); }
  function ttsOurs() { return !!ttsLine && host.ttsBusy(); }
  /** A commentary line is being heard (a clip, or the system voice reading one): the crowd ducks. */
  function talking() { return recording() || ttsOurs(); }

  function pump() {
    if (pumpTimer || !queue.length) return;
    const head = queue[0], t = now();
    // While the interface reads its own line for this moment (a result with its yardage), the line waiting behind it
    // is not getting older: it is about that same moment. Never longer than MAX_WAIT_S in all (Bryan 2026-11-18: CAL's
    // two-point quip went stale behind the result line).
    if (host.ttsBusy() && !ttsOurs() && t - head.born < MAX_WAIT_S) head.at = t;
    const stale = q => t - q.at > (q.stale || (q.pri < CALL ? STALE_S : STALE_CALL_S));
    // a reply only follows its own line
    if (head.after && !done.has(head.after)) { queue.shift(); return pump(); }
    if (stale(head)) { queue.shift(); return pump(); }
    // the interface has the floor (a menu or card up, or its voice speaking): wait, and let the line go stale
    // Chatter also waits while the interface has a line queued (calls do not: the interface waits for them instead).
    const iface = host.ttsBusy() || (head.pri < CALL && host.interfaceWaiting());
    if (talking() || performance.now() < busyUntil || (audible(head.line, head.family) && (host.floor() || iface))) {
      if (talking() && recording() && head.mo === (clipLine && clipLine.mo)) head.at = t;   // a reply waits for its line
      pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, 120); return;
    }
    const q = queue.shift();
    caption(q.line.speaker, q.text);
    done.add(q.id); if (done.size > 200) done.delete(done.values().next().value);
    if (audible(q.line, q.family)) voice(q);
    busyUntil = performance.now() + (audible(q.line, q.family) ? 250 : 400 + q.text.length * 45);
    if (queue.length) pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, 150);
  }

  function voice(q) {
    hush();
    const file = clipFile(q.line, q.key);
    played.push({ id: q.line.id, file, at: now() }); if (played.length > 80) played.shift();
    if (file) {
      try {
        const mine = clip = new Audio('audio/vo/' + file);
        clipLine = q;
        // only a clip that failed on its own falls back to the system voice; one stopped on purpose rejects too
        mine.play().catch(() => { if (clip !== mine) return; clip = null; speakTTS(q); });
        return;
      } catch (_) { /* fall through */ }
    }
    speakTTS(q);
  }
  function speakTTS(q) {
    const vm = global.NarbeVoiceManager, sp = data().speakers[q.line.speaker] || {}, base = vm?.getSettings?.() || {};
    const tts = sp.tts || {};
    ttsLine = q;
    vm?.speak(q.text, { pitch: tts.pitch ?? base.pitch, rate: (base.rate || 1) * (tts.rate || 1) });
  }

  /** Stop talking (a menu, a decision, pause). Leaves the queue to go stale on its own. */
  function hush() {
    if (clip) { try { clip.pause(); } catch (_) { /* ignore */ } }
    clip = null; clipLine = null;
    if (ttsOurs()) global.NarbeVoiceManager?.cancel?.();
    ttsLine = null;
  }
  /** The interface is speaking now: everything stops and waiting chatter is dropped (calls still queued wait
   *  for the floor and go stale if it never comes). */
  function yieldToInterface() {
    hush();
    // A reaction asked for in this same instant is about the line the interface is reading now ("Tackled. Gain of 2"):
    // it stays and follows that line (2026-11-21: CAL's reactions were all dropped here, so CAL was never heard).
    const t = now();
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].pri < CALL && t - queue[i].born > SAME_MOMENT_S) queue.splice(i, 1);
  }
  /** A recorded call is playing, or one will start as soon as it can: the game's polite lines (the result with its
   *  yardage) wait for it, not over it. A call held back by a menu or the interface does not count (no deadlock). */
  function callPlaying() {
    if (recording() && !!clipLine && clipLine.pri >= CALL) return true;
    const t = now();
    return !host.floor() && queue.some(q => q.pri >= CALL && audible(q.line, q.family) && t - q.at < (q.stale || STALE_CALL_S));
  }
  /** A must-say call is playing or waiting: ui.js holds its next screen for it (with its own cap). */
  function callInFlight() {
    return (recording() && clipLine && clipLine.pri >= CALL) || (ttsOurs() && ttsLine.pri >= CALL) || queue.some(q => q.pri >= CALL);
  }

  function caption(speaker, text) {
    const el = host.caption();
    if (!el) return;
    const sp = data().speakers[speaker] || { name: speaker };
    el.replaceChildren();
    const who = document.createElement('b'); who.className = 'who sp-' + speaker; who.textContent = sp.name;
    const what = document.createElement('span'); what.textContent = text;
    el.append(who, what); el.classList.add('on');
    clearTimeout(captionTimer);
    const off = () => { if (talking()) { captionTimer = setTimeout(off, 250); return; } el.classList.remove('on'); };
    captionTimer = setTimeout(off, CAPTION_MS + text.length * 25);
  }
  function clearCaption() { const el = host.caption(); if (el) el.classList.remove('on'); clearTimeout(captionTimer); }

  /** A new game: per-game counts and the queue reset; the no-repeat memory carries on. */
  function reset() {
    perGame = {}; lastAt = { pa: -99, pbp: -99, cal: -99 }; queue.length = 0; done.clear();
    clearTimeout(pumpTimer); pumpTimer = null; busyUntil = 0; hush(); clearCaption();
  }
  function stop() { queue.length = 0; clearTimeout(pumpTimer); pumpTimer = null; hush(); clearCaption(); }

  global.FootballBroadcast = {
    init(h) { host = Object.assign(host, h); loadIndex(); },
    say, hush, stop, reset, talking, callInFlight, callPlaying, yieldToInterface, allowed, clipFile,
    /** The system voice is reading a commentary line (not the interface's). */
    ttsOurs,
    /** Anything still to say. */
    pending: () => queue.length > 0,
    get history() { return history.slice(); }, get played() { return played.slice(); },
    get __state() { return { queue: queue.map(q => q.line.id + ':' + q.pri), recording: recording(), perGame: Object.assign({}, perGame) }; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
