/** Benny's Sphere Splash - the broadcast: an announcer, a play-by-play caller and an
 *  analyst, as captions from day one and live speech when the Commentary setting
 *  allows it. Recorded voices (the voice pipeline, Projects/Assets/tools/voice) are a
 *  layer on top: js/voice-index.generated.js (SS.VOICE_INDEX, the same list as
 *  audio/vo/index.json, as a script so it loads from file:// too) maps a clip key to a
 *  file in audio/vo/. A key is the line id, or "<line id>@<who>" for a line recorded once
 *  per player/team/technique: the caller passes slots._keys (["benji-tide"], or
 *  ["benji-tide", "spin-shot"]) and the clip is looked up with them joined, then one by
 *  one. Anything without a clip is read by the system voice, so nothing ever goes silent.
 *
 *  A line with "parts" in the script (an intercept: "Intercepted!" then "<team> ball!"; a score:
 *  team, number, team, number) is played as several clips in a row with a short gap. Each part is
 *  a clip key whose {slots} come from slots._k; if any part has no recording the whole line falls
 *  back to the system voice, so a half-recorded line never plays.
 *
 *  say(family, slots, priority) picks a line from js/voice-lines.generated.js:
 *   - a no-repeat shuffle per family, so the same words never come twice running;
 *   - a cooldown per speaker, so the caller never drones (ACCESSIBILITY.md: keep
 *     speech short), and a low-priority line is simply dropped inside it;
 *   - the interface always wins. Commentary speaks only into silence, only during
 *     live play, and never within a moment of a menu or decision line. A decision
 *     opening cuts it off (the voice manager cancels on every interface line).
 *  Every line spoken is also captioned, with the speaker's name - never colour alone.
 */
SS.broadcast = (function () {
  'use strict';

  const U = SS.util;
  const COOLDOWN = { pa: 0, pbp: 2.4, color: 9 };   // seconds between lines, per speaker
  const PRI_OVERRIDE = 3;                           // this priority ignores the cooldown
  const CAPTION_MS = 3400;
  const PART_GAP_MS = 180;                          // the pause between the parts of a split line
  const STALE_S = 2.5;                              // chatter that waited longer than this is about a moment now gone
  const STALE_CALL_S = 6;                           // ...and a must-say call (a goal, a score) that waited this long

  const bags = {}, lastAt = { pa: -99, pbp: -99, color: -99 };
  let voIndex = null, clip = null, captionTimer = null, history = [], played = [];
  let seq = 0, seqOn = false;                       // the clips of a split line still to come
  let nowFamily = null;                             // the family of the line last voiced (talking() says if it still is)
  let nowMo = 0;                                    // ...and the moment it belongs to
  let moment = 0, momentAt = -99;                   // lines asked for within a second of each other are one moment
  // Coral's talk about formations: must-say (a change of shape ignores her cooldown) but gives way to a call
  const YIELDS = ['ourFormation', 'theirFormation', 'formationWorking', 'formationStruggling', 'formationHolding'];

  function lines() { return (SS.VOICE_LINES && SS.VOICE_LINES.families) || {}; }
  function speakers() { return (SS.VOICE_LINES && SS.VOICE_LINES.speakers) || {}; }
  function mode() { return SS.save.settings.get('commentary') || 'full'; }

  function loadIndex() {
    if (voIndex !== null) return;
    voIndex = {};
    if (SS.VOICE_INDEX) { voIndex = SS.VOICE_INDEX.lines || {}; return; }
    try {
      const req = new XMLHttpRequest();
      req.open('GET', 'audio/vo/index.json', true);
      req.onload = () => {
        if (req.status >= 200 && req.status < 300) {
          try { const d = JSON.parse(req.responseText); voIndex = (d && d.lines) || {}; } catch (e) { /* no manifest */ }
        }
      };
      req.send();
    } catch (e) { /* file:// with no server: captions and the system voice */ }
  }

  function pick(family) {
    const list = lines()[family];
    if (!list || !list.length) return null;
    let bag = bags[family];
    if (!bag || !bag.length) {
      bag = bags[family] = U.shuffle(list.map((_, i) => i));
      // never the line that just played, even across a reshuffle
      if (bag.length > 1 && bag[bag.length - 1] === bags[family + ':last']) bag.unshift(bag.pop());
    }
    const i = bag.pop();
    bags[family + ':last'] = i;
    return list[i];
  }
  function fill(text, slots) {
    return text.replace(/\{(\w+)\}/g, (m, k) => (slots && slots[k] != null ? slots[k] : ''))
      .replace(/\s+([.,!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }

  /* Lines queue, so a goal call, the score and the analyst's reaction are all heard in
     turn: every system-voice line cancels the one before it, so firing them together
     would leave only the last. Chatter never waits in line - it is about a moment
     that will have passed. */
  const queue = [];
  let pumpTimer = null, busyUntil = 0;

  /** @param priority 1 chatter, 2 a real moment, 3 must be said (goals, intercepts, techniques), 4 the whistle
   *  (half time, full time): ends whatever commentary is talking and goes straight on, so the score is heard
   *  before the card comes up. The interface voice is never cut. */
  function say(family, slots, priority) {
    const m = mode();
    if (m === 'off') return null;
    const pri = priority || 1, now = performance.now() / 1000;
    const peek = lines()[family];
    if (!peek || !peek.length) return null;
    if (pri < PRI_OVERRIDE && queue.length) return null;
    const line = pick(family);
    if (pri < PRI_OVERRIDE && now - lastAt[line.speaker] < COOLDOWN[line.speaker]) return null;
    lastAt[line.speaker] = now;
    const text = fill(line.text, slots);
    history.push({ id: line.id, speaker: line.speaker, family, text, at: now });
    if (history.length > 80) history.shift();
    if (pri >= 4) {
      queue.length = 0; hush(); busyUntil = 0; clearTimeout(pumpTimer); pumpTimer = null;
      if (!U.uiSpokeRecently(4000)) U.stopSpeech();           // commentary read by the system voice, not the interface
    }
    // A must-say moment (a goal, a period) makes waiting chatter stale: it never plays over the celebration.
    if (pri >= PRI_OVERRIDE) for (let i = queue.length - 1; i >= 0; i--) if (queue[i].pri < PRI_OVERRIDE) queue.splice(i, 1);
    if (now - momentAt > 1) moment++;
    momentAt = now;
    queue.push({ line, text, pri, family, keys: (slots && slots._keys) || [], k: (slots && slots._k) || {}, at: now, mo: moment });
    while (queue.length > 4) queue.splice(queue.findIndex(q => q.pri < PRI_OVERRIDE) >= 0 ? queue.findIndex(q => q.pri < PRI_OVERRIDE) : 0, 1);
    pump();
    return text;
  }
  function pump() {
    if (pumpTimer || !queue.length) return;
    const now = performance.now(), talking = U.speaking() || seqOn || (clip && !clip.paused && !clip.ended);
    // Wait while anything is speaking - the system voice reading a long line, or the interface still finishing a
    // label - not just for our own estimate of the last line: past that estimate a must-say call used to start on
    // top of the voice. A line that waits too long goes stale below, so the wait always ends.
    const head = queue[0], waited = now / 1000 - head.at;
    // A must-say call (a goal, an intercept) never waits behind Coral's talk about formations (a change of shape runs
    // to 7 s): that recording is cut and the call goes now. A goal used to wait it out and lose its score. Short
    // calls ("Benji shoots!") are waited for: cutting them half way sounded worse than the second's wait.
    const yieldTo = head.pri >= PRI_OVERRIDE && !U.speaking() && recording() && YIELDS.includes(nowFamily) && head.mo !== nowMo;
    // ...and a line is never stale while its own moment is still being called: the full-time score alone runs 6.4 s.
    if (talking && recording() && head.mo === nowMo) head.at = now / 1000;
    if (!yieldTo && (now < busyUntil || (talking && waited <= (head.pri < PRI_OVERRIDE ? STALE_S : STALE_CALL_S)))) { pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, 150); return; }
    let q = queue.shift();
    while (q && performance.now() / 1000 - q.at > (q.pri < PRI_OVERRIDE ? STALE_S : STALE_CALL_S)) q = queue.shift();
    if (!q) return;
    // The interface has the floor (a card is up, or its voice is still speaking): the line waits its turn rather than
    // being dropped. A choice's own consequences (the technique just picked, an intercept of that pass) are called
    // the moment play resumes; the staleness rule above still lets go of a moment that has passed.
    if (audibleIn(q.line, q.family) && interfaceHasFloor()) { queue.unshift(q); pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, 150); return; }
    caption(q.line.speaker, q.text);
    if (audibleIn(q.line, q.family)) { nowMo = q.mo; voice(q.line, q.text, q.pri, q.keys, q.k, q.family); }
    busyUntil = now + 500 + q.text.length * 60;             // roughly how long it takes to say
    if (queue.length) pumpTimer = setTimeout(() => { pumpTimer = null; pump(); }, 200);
  }

  function interfaceHasFloor() {
    const ctx = SS.ui && SS.ui.context ? SS.ui.context() : 'live';
    return ctx !== 'live' || (U.uiSpokeRecently(1500) && U.speaking());
  }

  /** Is this line spoken aloud under the Commentary setting? (Captions always show.) */
  function audibleIn(line, family) {
    const m = mode();
    return m === 'full' || (m === 'calls' && (line.speaker === 'pa' || family === 'goal'));
  }

  /** The recording for this line about these keys, or null: joined keys first, then each alone, then the bare line. */
  function clipFile(line, keys) {
    loadIndex();
    if (!voIndex) return null;
    const cands = keys.length ? [keys.join('-'), ...keys] : [];
    for (const k of cands) if (k && voIndex[line.id + '@' + k]) return voIndex[line.id + '@' + k];
    return voIndex[line.id] || null;
  }
  /** The recordings for each part of a split line, or null if the line has no parts or any part has no recording. */
  function partFiles(line, k) {
    if (!line.parts) return null;
    loadIndex();
    if (!voIndex) return null;
    const files = line.parts.map(t => voIndex[t.replace(/\{(\w+)\}/g, (_, n) => (k && k[n]) || '')]);
    return files.every(Boolean) ? files : null;
  }
  function playParts(files, text, line) {
    const my = ++seq;
    seqOn = true;
    const sound = files.map(f => { const a = new Audio('audio/vo/' + f); a.preload = 'auto'; return a; });
    const fail = () => { if (my !== seq) return; seqOn = false; clip = null; U.speakAs(text, (speakers()[line.speaker] || {}).tts); };
    const next = i => {
      if (my !== seq) return;
      if (i >= sound.length) { seqOn = false; return; }
      clip = sound[i];
      clip.onended = () => setTimeout(() => next(i + 1), PART_GAP_MS);
      clip.play().catch(fail);
    };
    next(0);
  }
  // pump() has already waited for the interface (a card up, its voice still speaking), so nothing here drops a line
  // for that: a second, stricter check used to throw away the call of a technique the player had just picked.
  function voice(line, text, pri, keys, k, family) {
    if (pri < PRI_OVERRIDE && (U.speaking() || seqOn || (clip && !clip.paused))) return;
    // A must-say call can start while a clip or a split line is still going: end that properly first. Pausing
    // just the clip left a split line marked as still talking, and from then on chatter was dropped and every
    // call waited out the busy timeout.
    hush();
    nowFamily = family;
    if (line.parts) {
      const files = partFiles(line, k);
      played.push({ id: line.id, file: files ? files.join('+') : null, at: performance.now() / 1000 });
      if (played.length > 80) played.shift();
      if (files) { try { playParts(files, text, line); return; } catch (e) { /* fall through */ } }
      const sp0 = speakers()[line.speaker];
      U.speakAs(text, sp0 && sp0.tts);
      return;
    }
    const file = clipFile(line, keys || []);
    played.push({ id: line.id, file, at: performance.now() / 1000 });
    if (played.length > 80) played.shift();
    if (file) {
      try {
        const mine = clip = new Audio('audio/vo/' + file);
        // only a clip that failed on its own falls back to the system voice: one stopped on purpose (hush - the
        // full-time whistle a moment after a pass call) rejects too, and used to be read out over the whistle
        mine.play().catch(() => { if (clip !== mine) return; clip = null; U.speakAs(text, (speakers()[line.speaker] || {}).tts); });
        return;
      } catch (e) { /* fall through to the system voice */ }
    }
    const sp = speakers()[line.speaker];
    U.speakAs(text, sp && sp.tts);
  }

  /** Stop talking: a decision or a menu has just come up. */
  function hush() { seq++; seqOn = false; if (clip) { try { clip.pause(); } catch (e) { /* ignore */ } clip = null; } }

  function caption(speaker, text) {
    const el = U.$('caption');
    if (!el) return;
    const sp = speakers()[speaker] || { name: speaker, tag: '' };
    el.replaceChildren();
    const who = document.createElement('b'); who.className = 'who sp-' + speaker; who.textContent = sp.name;
    const what = document.createElement('span'); what.textContent = text;
    el.append(who, what);
    el.classList.add('on');
    clearTimeout(captionTimer);
    // up for at least the reading time, and never gone while its recording is still playing (a change of shape is
    // her line plus the description: up to 7.5 s, well past the reading time of its text)
    const off = () => { if (recording()) { captionTimer = setTimeout(off, 250); return; } el.classList.remove('on'); };
    captionTimer = setTimeout(off, CAPTION_MS + text.length * 25);
  }
  /** One of our clips (or a split line) is playing - not the system voice, which may be the interface's. */
  function recording() { return seqOn || !!(clip && !clip.paused && !clip.ended); }
  function clearCaption() { const el = U.$('caption'); if (el) el.classList.remove('on'); clearTimeout(captionTimer); }

  function reset() {
    Object.keys(bags).forEach(k => delete bags[k]); Object.keys(lastAt).forEach(k => { lastAt[k] = -99; });
    history = []; played = []; queue.length = 0; clearTimeout(pumpTimer); pumpTimer = null; busyUntil = 0; nowMo = 0; clearCaption(); hush();
  }

  loadIndex();
  /** A commentary line is being heard right now (system voice or a recorded clip): the music and crowd duck. */
  const talking = () => U.speaking() || seqOn || !!(clip && !clip.paused && !clip.ended);
  /** A call is being spoken, or a real one (priority 2+) is about to be: the game holds a decision card for it.
   *  With families, only those count (half time waits for its own score call, not for the chatter after it). */
  const callInFlight = fams => fams
    ? (talking() && fams.includes(nowFamily)) || queue.some(q => fams.includes(q.family) && audibleIn(q.line, q.family))
    : talking() || queue.some(q => q.pri >= 2 && audibleIn(q.line, q.family));
  return { say, hush, reset, clearCaption, talking, callInFlight, clipFile, partFiles, get history() { return history.slice(); },
    /** What was voiced, and from which recording (null = the system voice): for the browser checks. */
    get played() { return played.slice(); },
    /** The broadcast's own state, for the browser checks. */
    get __state() { return { queue: queue.map(q => q.line.id + ':' + q.pri), seqOn, clip: clip ? { paused: clip.paused, ended: clip.ended } : null,
      busyMs: Math.round(busyUntil - performance.now()), pumpTimer: !!pumpTimer, nowFamily }; } };
})();
