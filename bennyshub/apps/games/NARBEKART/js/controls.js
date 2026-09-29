/**
 * NARBE Racer — race controls.
 *
 * Turns raw switch edges from NK.input into steering, one player at a time.
 * It knows nothing about menus: NK.ui starts it when a race starts, suspends
 * it whenever a card is up, and stops it when the race is over.
 *
 * The rules it enforces (DESIGN §1.3, §2):
 *   - every discrete action fires on key DOWN; holds are only ever continuous
 *     steering, and a switch held for a minute does what one held for a second
 *     does (the kart slides to the edge and stays there);
 *   - a key-up never moves a kart — it only stops a slide, or (one switch)
 *     flips which way the next hold will go;
 *   - pause is a long hold with a ring and rising ticks, never quoted in time.
 *
 * Schemes, per player:
 *   'two'       1P Hold to Slide, two switches: Space left, Enter right.
 *   'one'       1P Hold to Slide, one switch (Enter), and each 2P player with
 *               their own switch: hold slides the ARMED way; release flips it.
 *   'step-two'  1P Press to Step, two switches: Space one lane left, Enter right.
 *   'step-scan' 1P Press to Step, one switch, and each 2P player: a highlight
 *               walks the five lanes; a press drives to the highlighted lane.
 */
NK.controls = (function () {
  'use strict';

  const U = NK.util;
  const C = NK.C;
  const LANES = C.LANE_COUNT;

  /* ── Tuning (never quoted to the player) ─────────────────────────────── */
  const PAUSE_HOLD_SHOW = 2000;   // the ring appears, so the gesture is discoverable
  const PAUSE_HOLD_MS = 5000;     // the pause menu opens
  /* Seconds the Press-to-Step highlight rests on each lane (DESIGN §2.1). */
  const SCAN_PACE = { slow: 1.8, normal: 1.3, fast: 0.9 };

  /* ── Session state ───────────────────────────────────────────────────── */
  let running = false;
  let suspended = false;
  let players = 1;
  let oneSwitch = false;
  let steerMode = 'hold';
  let steerSpeed = 'normal';
  let unsubscribe = null;
  let wired = false;

  function makePlayer(idx) {
    return {
      idx: idx,
      keys: [],                 // the physical switches this player owns
      pauseKey: 'Enter',
      scheme: 'two',
      held: { Space: false, Enter: false },
      armed: -1,                // one switch: the way the next hold slides
      scanLane: 2,
      scanDir: 1,
      scanT: 0,
      stepTarget: -1,           // step-two: last lane asked for …
      stepUntil: 0,             // … and when that slide should have finished
      pauseHold: 0,
      beepSec: 0,
      guideLane: -1,            // the lane the guidance wants (-1: none / help off)
      cueDir: 0,                // the way it wants to go, when it is live
      cueT: 0,                  // seconds until the guidance is read again
      match: false,
      // Reused output objects: state() and the HUD push allocate nothing.
      out: { armed: -1, scanLane: 2, holding: false, pauseHold: 0 },
      hudOut: { scheme: 'two', armed: -1, match: false, scanLane: -1, targetLane: -1, pauseHold: 0 },
      hudLast: { scheme: '', armed: 0, match: null, scanLane: -9, targetLane: -9, pauseHold: -1 }
    };
  }
  const P = [makePlayer(0), makePlayer(1)];

  /* ── Small helpers ───────────────────────────────────────────────────── */

  function G() { return window.NK && NK.game ? NK.game : null; }
  function game(name, ...args) {
    const g = G();
    if (!g || typeof g[name] !== 'function') return undefined;
    try { return g[name](...args); } catch (e) { console.error('NK.game.' + name + ' failed:', e); }
    return undefined;
  }
  function sfx(name, ...args) {
    const au = window.NK && NK.audio;
    if (au && typeof au[name] === 'function') {
      try { au[name](...args); } catch (e) { /* sound is never worth a crash */ }
    }
  }
  function now() { return performance.now(); }

  function laneTime() {
    const s = C.STEER_SPEEDS[steerSpeed] || C.STEER_SPEEDS.normal;
    return s.laneTime;
  }

  /* ── Scheme and key ownership ────────────────────────────────────────── */

  function configure(p) {
    const step = steerMode === 'step';
    if (players === 2) {
      // One switch each, whatever Auto Scan says.
      p.keys = [C.PLAYER_KEYS[p.idx]];
      p.pauseKey = C.PLAYER_KEYS[p.idx];
      p.scheme = step ? 'step-scan' : 'one';
    } else if (oneSwitch) {
      // Enter only; Space is inert in a race.
      p.keys = ['Enter'];
      p.pauseKey = 'Enter';
      p.scheme = step ? 'step-scan' : 'one';
    } else {
      p.keys = ['Space', 'Enter'];
      p.pauseKey = 'Enter';
      p.scheme = step ? 'step-two' : 'two';
    }
  }

  function ownerOf(code) {
    for (let i = 0; i < players; i++) {
      if (P[i].keys.indexOf(code) >= 0) return P[i];
    }
    return null;
  }

  function holding(p) {
    for (let i = 0; i < p.keys.length; i++) if (p.held[p.keys[i]]) return true;
    return false;
  }

  /* ── Steering output ─────────────────────────────────────────────────── */

  function applyTwo(p) {
    let dir = 0;
    if (p.held.Space) dir -= 1;
    if (p.held.Enter) dir += 1;        // both held cancels out: hold still
    game('steer', p.idx, dir);
  }

  /** The lane a step starts from. Straight after a step the kart is still on
   *  its way, and the game may report the lane it is leaving — so for the
   *  length of that slide the lane we asked for is the truth. */
  function stepBase(p) {
    if (p.stepTarget >= 0 && now() < p.stepUntil) return p.stepTarget;
    const l = game('lane', p.idx);
    return isFinite(l) ? l : (p.stepTarget >= 0 ? p.stepTarget : 2);
  }

  function stepLane(p, d) {
    const from = stepBase(p);
    const to = U.clamp(Math.round(from) + d, 0, LANES - 1);
    p.stepTarget = to;
    p.stepUntil = now() + (laneTime() * 1.25 + 0.25) * 1000;
    game('targetLane', p.idx, to);
  }

  /**
   * One switch: every release flips the armed side, so a quick press simply
   * swaps direction and a player who only ever holds can still go both ways.
   */
  function flipArmed(p) {
    p.armed = -p.armed;
    // The armed panel already shows what the switch will do. Releasing it
    // must not generate a second stream of direction announcements.

  }

  /* ── Raw edges ───────────────────────────────────────────────────────── */

  function onRaw(type, code) {
    if (!running || suspended) return;
    const p = ownerOf(code);
    if (!p) return;                    // not this scheme's switch (1P one-switch Space)

    if (type === 'down') {
      p.held[code] = true;
      game('pressed', p.idx);          // rocket start: the game decides if it counts
      switch (p.scheme) {
        case 'two': applyTwo(p); break;
        case 'one': game('steer', p.idx, p.armed); break;
        case 'step-two': stepLane(p, code === 'Space' ? -1 : 1); break;
        case 'step-scan': game('targetLane', p.idx, p.scanLane); break;
      }
    } else {
      if (!p.held[code]) return;
      p.held[code] = false;
      if (p.scheme === 'two') applyTwo(p);
      else if (p.scheme === 'one') { game('steer', p.idx, 0); flipArmed(p); }
      // Press to Step: a release does nothing at all.
      if (code === p.pauseKey) clearPauseHold(p);
    }
    refreshGuide(p);
    pushHud(p);
  }

  /**
   * A key we think is held that NK.input no longer has (reset on blur, or by
   * the game at the end of a race) is released silently: steering stops, and
   * nothing flips, because the player did not let go.
   */
  function reconcile(p) {
    let changed = false;
    for (let i = 0; i < p.keys.length; i++) {
      const k = p.keys[i];
      if (p.held[k] && !NK.input.isDown(k)) { p.held[k] = false; changed = true; }
    }
    if (!changed) return;
    if (p.scheme === 'two') applyTwo(p);
    else if (p.scheme === 'one') game('steer', p.idx, 0);
    if (!p.held[p.pauseKey]) clearPauseHold(p);
  }

  /* ── Press-to-Step lane scanner ──────────────────────────────────────── */

  function advanceScanner(p, dt) {
    const pace = SCAN_PACE[steerSpeed] || SCAN_PACE.normal;
    p.scanT += dt;
    while (p.scanT >= pace) {
      p.scanT -= pace;
      let n = p.scanLane + p.scanDir;
      if (n < 0 || n > LANES - 1) { p.scanDir = -p.scanDir; n = p.scanLane + p.scanDir; }
      p.scanLane = n;
      // A soft chime when the highlight reaches the guidance lane, so "press
      // on green" also works with eyes closed.
      if (n === p.guideLane && p.helpLevel >= 2) sfx('scanMatch', p.idx);
    }
  }

  /* ── Pause hold ──────────────────────────────────────────────────────── */

  function clearPauseHold(p) {
    p.pauseHold = 0;
    p.beepSec = 0;
  }

  function updatePauseHold(p) {
    if (!p.held[p.pauseKey]) { clearPauseHold(p); return; }
    const dur = NK.input.heldMs(p.pauseKey);
    if (dur >= PAUSE_HOLD_MS) {
      clearPauseHold(p);
      firePause(p);
      return;
    }
    if (dur < PAUSE_HOLD_SHOW) { p.pauseHold = 0; return; }
    p.pauseHold = (dur - PAUSE_HOLD_SHOW) / (PAUSE_HOLD_MS - PAUSE_HOLD_SHOW);
    // A rising tick each second makes the gesture audible as well as visible.
    const secs = Math.floor(dur / 1000);
    if (secs > p.beepSec) { p.beepSec = secs; sfx('pauseTick', secs); }
  }

  function firePause(p) {
    suspended = true;                  // until NK.ui resumes us
    releaseAll();
    for (let i = 0; i < players; i++) pushHud(P[i]);
    if (typeof api.onPause === 'function') api.onPause(p.idx);
    else game('pause');
  }

  /* ── Guidance match ──────────────────────────────────────────────────────
   * The guidance is read at the HUD's own pace (it changes over seconds, and
   * NK.game.cue() may build a fresh object per call); the match against the
   * armed side or the scanner is recomputed every time either of those moves.
   */
  const CUE_POLL = 0.1;

  function pollCue(p) {
    p.cueT = CUE_POLL;
    const cue = game('cue', p.idx);
    const level = cue && isFinite(cue.level) ? cue.level : 0;
    p.helpLevel = level;
    const live = !!(cue && cue.active) && level >= 1;
    p.cueDir = live ? (cue.dir < 0 ? -1 : cue.dir > 0 ? 1 : 0) : 0;
    p.guideLane = live && isFinite(cue.targetLane) ? U.clamp(cue.targetLane | 0, 0, LANES - 1) : -1;
  }

  function computeMatch(p) {
    if (p.scheme === 'one') p.match = p.cueDir !== 0 && p.cueDir === p.armed;
    else if (p.scheme === 'step-scan') p.match = p.guideLane >= 0 && p.scanLane === p.guideLane;
    else p.match = false;
  }

  function refreshGuide(p) {
    pollCue(p);
    computeMatch(p);
  }

  /* ── HUD push (only when something changed) ──────────────────────────── */

  function pushHud(p, force) {
    const o = p.hudOut, l = p.hudLast;
    o.scheme = p.scheme;
    o.armed = p.armed;
    o.match = p.match;
    o.scanLane = p.scheme === 'step-scan' ? p.scanLane : -1;
    o.targetLane = p.guideLane;
    o.pauseHold = Math.round(p.pauseHold * 100) / 100;
    if (!force && o.scheme === l.scheme && o.armed === l.armed && o.match === l.match &&
        o.scanLane === l.scanLane && o.targetLane === l.targetLane && o.pauseHold === l.pauseHold) return;
    l.scheme = o.scheme; l.armed = o.armed; l.match = o.match;
    l.scanLane = o.scanLane; l.targetLane = o.targetLane; l.pauseHold = o.pauseHold;
    const hud = window.NK && NK.hud;
    if (hud && typeof hud.control === 'function') {
      try { hud.control(p.idx, o); } catch (e) { console.error('NK.hud.control failed:', e); }
    }
  }

  /* ── Mouse / touch ───────────────────────────────────────────────────────
   * A press on the road picks a lane: whichever fifth of that player's view
   * the pointer is over. Dragging keeps following, but nothing needs a drag —
   * a single tap is a whole steering action. A held switch outranks the
   * pointer for that player.
   */
  let pointerDown = false;

  function pointerLane(e) {
    const hud = window.NK && NK.hud;
    const hit = hud && typeof hud.viewAt === 'function' ? hud.viewAt(e.clientX, e.clientY) : null;
    if (hit && hit.v >= 0 && hit.v < players) return { p: P[hit.v], fx: hit.fx };
    const w = window.innerWidth || 1;
    return { p: P[0], fx: U.clamp(e.clientX / w, 0, 0.999) };
  }

  function onPointer(e) {
    if (e.type === 'pointerdown') pointerDown = true;
    if (!running || suspended || !pointerDown) return;
    const hit = pointerLane(e);
    if (!hit.p || holding(hit.p)) return;
    if (e.cancelable) e.preventDefault();
    game('targetLane', hit.p.idx, U.clamp(Math.floor(hit.fx * LANES), 0, LANES - 1));
  }

  function onPointerEnd() { pointerDown = false; }

  function wire() {
    if (wired) return;
    wired = true;
    const surface = document.getElementById('canvasWrap');
    if (surface) {
      surface.addEventListener('pointerdown', onPointer, { passive: false });
      surface.addEventListener('pointermove', onPointer, { passive: false });
    }
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    // Losing focus drops every key (NK.input resets itself); stop the karts now
    // rather than on the next frame.
    window.addEventListener('blur', () => {
      if (!running) return;
      releaseAll();
      for (let i = 0; i < players; i++) pushHud(P[i]);
    });
  }

  /* ── Lifecycle ───────────────────────────────────────────────────────── */

  function releaseAll() {
    for (let i = 0; i < players; i++) {
      P[i].held.Space = P[i].held.Enter = false;
      clearPauseHold(P[i]);
      game('steer', i, 0);
    }
  }

  function applyOpts(opts) {
    const o = opts || {};
    players = o.players === 2 ? 2 : 1;
    oneSwitch = !!o.oneSwitch;
    steerMode = o.steerMode === 'step' ? 'step' : 'hold';
    steerSpeed = SCAN_PACE[o.steerSpeed] ? o.steerSpeed : 'normal';
  }

  /** Begin a race. Keys already down are ignored until they are released. */
  function start(opts) {
    if (running) stop();
    wire();
    applyOpts(opts);
    NK.input.reset();
    for (let i = 0; i < 2; i++) {
      const p = P[i];
      configure(p);
      p.held.Space = p.held.Enter = false;
      p.armed = -1;
      p.scanLane = 2; p.scanDir = 1; p.scanT = 0;
      p.stepTarget = -1; p.stepUntil = 0;
      p.guideLane = -1; p.cueDir = 0; p.cueT = 0; p.match = false;
      clearPauseHold(p);
    }
    unsubscribe = NK.input.onRaw(onRaw);
    running = true;
    suspended = false;
    for (let i = 0; i < players; i++) { game('steer', i, 0); pushHud(P[i], true); }
  }

  function stop() {
    if (!running) return;
    releaseAll();
    for (let i = 0; i < players; i++) pushHud(P[i]);
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    running = false;
    suspended = false;
  }

  /** A card is up: stop the karts and ignore the switches, but keep the armed
   *  side and the scanner where they were. */
  function suspend() {
    if (!running) return;
    suspended = true;
    releaseAll();
    for (let i = 0; i < players; i++) pushHud(P[i]);
  }

  /** Back to the race. Settings may have changed on the pause card, so the
   *  scheme is rebuilt; the armed side and scanner position carry over. */
  function resume(opts) {
    if (!running) return;
    if (opts) applyOpts(opts);
    NK.input.reset();
    for (let i = 0; i < 2; i++) {
      configure(P[i]);
      P[i].held.Space = P[i].held.Enter = false;
      clearPauseHold(P[i]);
    }
    suspended = false;
    for (let i = 0; i < players; i++) { refreshGuide(P[i]); pushHud(P[i], true); }
  }

  function tick(dt) {
    if (!running || suspended) return;
    for (let i = 0; i < players; i++) {
      const p = P[i];
      reconcile(p);
      if (p.scheme === 'step-scan') advanceScanner(p, dt);
      updatePauseHold(p);
      if (suspended) return;           // that hold just opened the pause menu
      p.cueT -= dt;
      if (p.cueT <= 0) pollCue(p);
      computeMatch(p);
      pushHud(p);
    }
  }

  function state(humanIdx) {
    const p = P[humanIdx === 1 ? 1 : 0];
    const o = p.out;
    o.armed = p.armed;
    o.scanLane = p.scanLane;
    o.holding = running && holding(p);
    o.pauseHold = p.pauseHold;
    o.scheme = p.scheme;
    o.match = p.match;
    return o;
  }

  const api = {
    start, stop, suspend, resume, tick, state,
    onPause: null,
    isRunning: () => running && !suspended,
    PAUSE_HOLD_SHOW, PAUSE_HOLD_MS, SCAN_PACE
  };
  return api;
})();
