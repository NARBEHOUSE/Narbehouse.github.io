/**
 * NARBE Mini Golf — rules, turns and the shot director.
 *
 * The game never moves a ball by "running physics live". When the putter
 * connects, the whole shot is simulated to the end (physics.simulateShot)
 * and the recording is played back here. That is what lets the director
 * stage the shot like television: the camera knows the ball will drop in
 * 1.2 s and is waiting low at the cup in slow motion; it knows the ball is
 * heading for the pond and cuts to the bank to watch the splash; and the
 * instant replay is simply the same recording again.
 *
 * Control (decided by ui.js, which owns the switches):
 *   aimPress/aimRelease   Space held rotates the aim; each new press reverses
 *   enterDown/enterUp     Hold: charge and release. Choose: open the list.
 *                         Automatic: putt at once with the suggested power.
 * One switch (Auto Scan on): the aim sweeps by itself; Enter stops it.
 */
(function () {
  'use strict';

  const U = MG.util, C = MG.course, P = MG.physics, A = MG.art, AU = MG.audio;
  const S = C.S;

  /* ── Settings ─────────────────────────────────────────────────────────── */

  const AIM_SPEEDS = { 'Super Slow': 6, 'Slow': 12, 'Medium': 18, 'Fast': 36 };   // °/s, the original's presets
  const LINE_WIDTHS = { 'Thin': 9, 'Medium': 14, 'Thick': 20, 'Extra Thick': 28 };   // px on the course
  const CHARGE_TIMES = { 'Slow': 7, 'Normal': 5, 'Fast': 3 };                         // seconds to full

  const DEFAULTS = {
    aimSpeed: 'Slow', aimLine: 'trajectory', lineWidth: 'Medium', power: 'hold', powerSpeed: 'Normal',
    camera: 'cinematic', ballColor: 'white', gator: true, replays: true, maxStrokes: 10,
    sfx: true, ambience: true,
    easyPause: false      // for players who can't hold a switch: scan to the putter or Pause before each putt
  };

  const settings = (function () {
    let data = U.load('settings', null);
    if (!data) {
      // First run: carry over the original game's choices where they map.
      data = Object.assign({}, DEFAULTS);
      try {
        const old = JSON.parse(localStorage.getItem('bmg_settings') || 'null');
        if (old) {
          if (AIM_SPEEDS[old.aimerSpeed]) data.aimSpeed = old.aimerSpeed;
          if (old.aimerStyle === 'BASIC') data.aimLine = 'arrow';
          if (LINE_WIDTHS[old.aimerThicknessName]) data.lineWidth = old.aimerThicknessName;
          const colorMap = { white: 'white', pink: 'pink', lightblue: 'blue', violet: 'purple', orange: 'orange', salmon: 'pink', red: 'red', yellow: 'yellow', lime: 'lime', cyan: 'cyan' };
          if (colorMap[old.ballColor]) data.ballColor = colorMap[old.ballColor];
          if (old.sound === false) data.sfx = false;
          if (old.music === false) data.ambience = false;
        }
      } catch (e) { /* no old settings */ }
      U.save('settings', data);
    }
    data = Object.assign({}, DEFAULTS, data);
    return {
      get: (k) => data[k],
      set: (k, v) => { data[k] = v; U.save('settings', data); },
      all: () => Object.assign({}, data)
    };
  })();
  MG.settings = settings;

  /* ── Progress ─────────────────────────────────────────────────────────── */

  const progress = {
    best(file, mode) { const b = U.load('best', {}); return b[file] && b[file][mode]; },
    record(file, mode, total) {
      const b = U.load('best', {});
      b[file] = b[file] || {};
      const prev = b[file][mode];
      if (prev === undefined || total < prev) { b[file][mode] = total; U.save('best', b); return true; }
      return false;
    },
    saved() { return U.load('round', null); },
    save(r) { U.save('round', r); },
    clearRound() { U.remove('round'); },
    reset() { U.remove('best'); U.remove('round'); }
  };
  MG.progress = progress;

  /* ── State ────────────────────────────────────────────────────────────── */

  let scene = null, camera = null;
  let course = null, courseFile = '', courseName = '';
  let holeIndex = 0, view = null, ch = null, themeName = 'sunny';
  let roundMode = 'casual';          // casual | challenge | multi
  let players = [];
  let current = 0;
  let turnOrder = [];               // indices into players; best score on the last hole tees off first
  let state = 'idle';
  let paused = false;
  let worldT = 0, timeScale = 1, timeScaleTarget = 1;
  let testMode = false;

  // Aim / power
  let aimAngle = 0, aimDir = 1, aimHeld = false;
  let charging = false, power = 0, chargeBeep = 0;
  let previewPower = null;           // Choose-from-list highlight
  let autoPower = 0.3, autoDirty = true, autoAt = 0;
  let predictCache = { key: '', result: null };
  let lastGlow = false;
  let oneSwitch = false;
  let route = null;               // walking-distance map for this hole (physics.routeField)
  let turnViewYaw = 0;           // fixed for the turn: the camera never follows the live aim

  // Shot playback
  let shot = null;
  let replay = null;
  let putter = null, putterAnim = null, putterFocus = false;
  let gator = null, gatorTimer = 0, gatorModel = null, gatorJob = null, gatorReady = false;

  const on = {
    hud() {}, banner() {}, big() {}, toast() {}, turn() {}, scorecard() {}, power() {},
    cinema() {}, state() {}, roundEnd() {}, powerMenu() {}, skipHint() {}, shotChoice() {}
  };

  function setState(s) {
    state = s;
    on.state(s);
  }

  const cur = () => players[current];

  /* ── Sequencing ───────────────────────────────────────────────────────────
   * Scripted beats (intros, celebrations, scorecards) are async functions
   * that await game-time waits. Waits respect pause; skippable ones end early
   * on a switch press; starting something new invalidates the old script.
   */
  let token = 0;
  const waits = [];

  function wait(sec, skippable) {
    const tok = token;
    return new Promise((res) => waits.push({ remain: sec, res, skippable: !!skippable, tok }));
  }

  /** Wait for the voice to finish (plus a breath), capped, optionally skippable. */
  function waitQuiet(maxSec, skippable, breath) {
    const tok = token;
    return new Promise((res) => waits.push({ remain: maxSec || 9, res, skippable: !!skippable, tok, quiet: true, breath: breath === undefined ? 0.6 : breath, quietFor: 0 }));
  }

  function tickWaits(dt) {
    for (let i = waits.length - 1; i >= 0; i--) {
      const w = waits[i];
      if (w.tok !== token) { waits.splice(i, 1); continue; }
      w.remain -= dt;
      let done = w.remain <= 0;
      if (w.quiet) {
        if (AU.busy()) w.quietFor = 0; else w.quietFor += dt;
        if (w.quietFor >= w.breath) done = true;
      }
      if (done) { waits.splice(i, 1); w.res(); }
    }
  }

  function skip() {
    let any = false;
    for (let i = waits.length - 1; i >= 0; i--) {
      if (waits[i].skippable) { const w = waits.splice(i, 1)[0]; w.res(); any = true; }
    }
    if (MG.cam.mode === 'fly') { MG.cam.finishFly(); any = true; }
    return any;
  }

  function newScript() { token++; waits.length = 0; return token; }
  const alive = (tok) => tok === token;

  /** Celebration effects, timed on the game clock so a replay or a new hole can cancel them. */
  const later_ = [];
  function later(sec, fn) { later_.push({ remain: sec, fn }); }
  function clearLater() { later_.length = 0; }
  function tickLater(dt) {
    for (let i = later_.length - 1; i >= 0; i--) {
      const l = later_[i];
      l.remain -= dt;
      if (l.remain <= 0) { later_.splice(i, 1); l.fn(); }
    }
  }

  /* ── Setup ────────────────────────────────────────────────────────────── */

  function init(o) {
    scene = o.scene; camera = o.camera;
    MG.scene.initEnvironment(o.renderer, scene);
    MG.fx.init(scene);
    MG.cam.init(camera);
    putter = A.makePutter();
    putter.rotation.order = 'YXZ';
    putter.scale.setScalar(PUTTER_SCALE);
    putter.visible = false;
    scene.add(putter);
    // One alligator, made once and kept hidden until it's wanted (making it also tells gator.js its shape).
    gatorModel = A.makeGator();
    gatorModel.visible = false;
    scene.add(gatorModel);
  }

  function clearView() {
    if (view) { scene.remove(view.group); view.dispose(); view = null; }
    for (const p of players) if (p.mesh) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); p.mesh = null; }
    if (gator) { gator.mesh.visible = false; gator = null; }
    gatorJob = null;
  }

  function buildView(index) {
    clearView();
    const raw = course.holes[index];
    ch = C.compileHole(raw);
    route = null;
    gatorReady = false;      // its pond maps are built a little at a time (update)
    clearLater();
    themeName = raw.theme || course.theme || 'sunny';
    const th = MG.scene.setTheme(themeName);
    view = MG.scene.buildHole(ch, index + 1, themeName);
    scene.add(view.group);
    MG.scene.fitShadows(view.centre.x, view.centre.z, view.radius, th);
    MG.fx.setView(view);
    MG.cam.setView(view);
    MG.scene.reflect(putter, 1);
  }

  /** Title-screen backdrop: a hole from the first course, slowly circled. */
  async function attract(c, file) {
    newScript();
    clearView();       // takes the last round's ball meshes with it
    course = c; courseFile = file || '';
    players = [];
    holeIndex = 0;
    buildView(Math.min(c.holes.length - 1, 0));
    MG.cam.attract();
    MG.fx.hideAim(); MG.fx.hideMarker();
    putter.visible = false;
    setState('attract');
  }

  /**
   * Start a round.
   * o = { course, file, mode: 'casual'|'challenge'|'multi',
   *       players: [{name, color}], startHole, strokes (resume), test }
   */
  async function startRound(o) {
    const tok = newScript();
    course = o.course; courseFile = o.file || ''; courseName = course.name;
    roundMode = o.mode || 'casual';
    testMode = !!o.test;
    players = o.players.map((p, i) => ({
      id: i, name: p.name, color: p.color,
      strokes: (o.strokes && o.strokes[i]) ? o.strokes[i].slice() : [],
      hole: 0, done: false, started: false, picked: false,
      ball: null, mesh: null, prevX: 0, prevY: 0
    }));
    holeIndex = o.startHole || 0;
    turnOrder = players.map((p, i) => i);
    paused = false;
    if (!testMode) progress.clearRound();
    if (!o.startHole && !o.strokes && !testMode) await courseIntro(tok);
    if (!alive(tok)) return;
    loadHole(holeIndex);
  }

  async function courseIntro(tok) {
    buildView(0);
    setState('courseIntro');
    on.cinema(true, { skippable: true });
    on.banner({ num: '⛳', name: course.name, par: course.holes.length + ' HOLES · PAR ' + course.holes.reduce((a, h) => a + h.par, 0) });
    MG.cam.attract();
    AU.say('Welcome to ' + course.name + '. ' + course.holes.length + ' holes.');
    await wait(1.2);
    await waitQuiet(5, true, 0.4);
    on.banner(null);
  }

  function loadHole(index) {
    const tok = newScript();
    holeIndex = index;
    buildView(index);
    for (const p of players) {
      p.hole = 0; p.done = false; p.started = false; p.picked = false;
      p.ball = P.makeBall(ch.start.x, ch.start.y, ch.ballR, p.id);
      p.ball.active = false;
      p.mesh = A.makeBall(p.color, ch.ballR * S);
      MG.scene.reflect(p.mesh, 0.8);
      p.mesh.visible = false;
      scene.add(p.mesh);
    }
    if (turnOrder.length !== players.length) turnOrder = players.map((p, i) => i);
    current = turnOrder[0];
    gatorTimer = 0;
    holeIntro(tok);
  }

  async function holeIntro(tok) {
    setState('holeIntro');
    MG.fx.hideAim(); MG.fx.hideMarker();
    putter.visible = false;
    // Put the first player's ball on the tee now so the flyover lands on it.
    placeOnTee(cur());
    aimAngle = smartAim(cur().ball);
    turnViewYaw = aimAngle;
    const endPose = MG.cam.aimPoseFor(aimCamArgs());
    on.cinema(true, { skippable: true });
    on.banner({ num: holeIndex + 1, name: ch.name || ('Hole ' + (holeIndex + 1)), par: 'PAR ' + ch.par });
    on.hud(hudData());
    const lines = ['Hole ' + (holeIndex + 1) + '.'];
    if (ch.name) lines.push(ch.name + '.');
    lines.push('Paar ' + ch.par + '.');
    if (roundMode === 'multi') lines.push(cur().name + ' first.');
    AU.say(lines.join(' '));
    const dur = U.clamp(3.6 + Math.max(ch.bounds.x1 - ch.bounds.x0, ch.bounds.y1 - ch.bounds.y0) / 900, 4.2, 6.5);
    let flown = false;
    MG.cam.flyover(endPose, dur, () => { flown = true; });
    await wait(dur + 0.1, true);
    if (!alive(tok)) return;
    if (!flown) MG.cam.finishFly();
    on.banner(null);
    on.cinema(false);
    beginTurn(true);
  }

  /* ── Turns ────────────────────────────────────────────────────────────── */

  /** A free spot on the tee for p: the tee itself, or beside it if someone's ball is sitting there. */
  function teeSpot(p) {
    let x = ch.start.x, y = ch.start.y;
    const ang = Math.atan2(ch.cup.y - ch.start.y, ch.cup.x - ch.start.x);
    for (let k = 0; k < 6; k++) {
      const clash = players.some(o => o !== p && o.started && o.ball.active && !o.done && Math.hypot(o.ball.x - x, o.ball.y - y) < ch.ballR * 2.4);
      if (!clash) break;
      const side = (k % 2 ? -1 : 1) * Math.ceil((k + 1) / 2) * ch.ballR * 2.6;
      const tx = ch.start.x - Math.sin(ang) * side, ty = ch.start.y + Math.cos(ang) * side;
      if (C.pointInPolygon(tx, ty, ch.fairway.poly)) { x = tx; y = ty; }
    }
    return { x, y };
  }

  function placeOnTee(p) {
    if (p.started) return;
    const b = p.ball;
    const { x, y } = teeSpot(p);
    b.x = x; b.y = y; b.vx = b.vy = 0;
    b.active = true; b.sunk = false; b.drowned = false; b.moving = false;
    b.lastSafeX = x; b.lastSafeY = y;
    p.started = true;
    p.mesh.visible = true;
    syncMesh(p, true);
  }

  function beginTurn(first) {
    const p = cur();
    placeOnTee(p);
    p.prevX = p.ball.x; p.prevY = p.ball.y;
    if (!first || roundMode === 'multi') aimAngle = smartAim(p.ball);
    turnViewYaw = smartAim(p.ball);
    aimHeld = false; charging = false; power = 0; previewPower = null;
    autoDirty = true; predictCache.key = '';
    gatorTimer = 0; gatorJob = null;
    // Easy Pause, for a player who can't hold a switch: every turn starts with a
    // scan between the putter (pick it to putt) and the Pause button, so the
    // pause menu is always one press away (ACCESSIBILITY.md §12). Otherwise
    // aiming starts at once, and holding Enter pauses.
    setState(settings.get('easyPause') ? 'ready' : 'aim');
    MG.cam.aim(aimCamArgs());
    MG.fx.showMarker(ballWorld(p), A.BALL_COLORS[p.color] || p.color, ch.ballR * S);
    showPutterAddress();
    on.hud(hudData());
    on.power(null);
    if (roundMode === 'multi') {
      on.turn(p);
      if (!first) AU.sayQueued(p.name + "'s turn.");
    } else if (!first) {
      AU.play('ready', 0.45);
      AU.sayQueued('Ready.');
    }
    if (state === 'ready') on.shotChoice(true, { first: first && holeIndex === 0 });
  }

  /** Easy Pause: the scan picked the putter. Start aiming. */
  function choosePutt() {
    if (state !== 'ready') return;
    on.shotChoice(false);
    setPutterFocus(false);
    autoDirty = true;
    setState('aim');
  }

  function nextTurn() {
    if (players.every(p => p.done)) { holeComplete(); return; }
    if (roundMode === 'multi') {
      let at = turnOrder.indexOf(current);
      for (let k = 0; k < turnOrder.length; k++) {
        at = (at + 1) % turnOrder.length;
        if (!players[turnOrder[at]].done) break;
      }
      current = turnOrder[at];
    }
    beginTurn(false);
  }

  /* ── Aiming ───────────────────────────────────────────────────────────── */

  function aimSpeed() { return (AIM_SPEEDS[settings.get('aimSpeed')] || 12) * Math.PI / 180; }

  /**
   * The opening aim, and the way the camera faces: along the route to the cup
   * (physics.smartAim), never backwards. The route map is built once per hole.
   */
  function smartAim(ball) {
    if (!route) route = P.routeFor(ch);
    return P.smartAim(ch, ball, route);
  }

  function aimPress() {
    if (state !== 'aim' || charging) return;
    if (oneSwitch) return;            // one switch: Space is inert while aiming, as before
    aimDir = -aimDir;                 // each new press reverses, as the original did
    aimHeld = true;
  }
  function aimRelease() { aimHeld = false; }

  function setOneSwitch(v) { oneSwitch = !!v; }

  /** Mouse / touch: point at a spot on the course. */
  function pointerAim(x, y) {
    if (state !== 'aim') return;
    const b = cur().ball;
    aimAngle = Math.atan2(y - b.y, x - b.x);
  }

  /* ── Power ────────────────────────────────────────────────────────────── */

  const POWER_STEPS = [
    { label: 'Tap', p: 0.07 }, { label: 'Soft', p: 0.15 }, { label: 'Medium', p: 0.25 },
    { label: 'Firm', p: 0.37 }, { label: 'Hard', p: 0.55 }, { label: 'Full', p: 1.0 }
  ];

  function chargeTime() { return CHARGE_TIMES[settings.get('powerSpeed')] || 5; }

  /**
   * Enter went down while it's our turn. What happens depends on the Power
   * setting: returns 'charge' | 'menu' | 'putt' | null.
   */
  function enterDown() {
    if (state !== 'aim') return null;
    aimHeld = false;
    const mode = settings.get('power');
    if (mode === 'choose') {
      setState('powerMenu');
      previewPower = POWER_STEPS[2].p;
      on.powerMenu(true);
      return 'menu';
    }
    if (mode === 'auto') { putt(autoPowerNow()); return 'putt'; }
    charging = true; power = 0; chargeBeep = 0;
    setState('charge');
    on.power(0, false);
    return 'charge';
  }

  function enterUp() {
    if (state === 'charge' && charging) putt(power);
  }

  function cancelCharge() {
    if (state === 'charge') { charging = false; power = 0; setState('aim'); on.power(null); }
  }

  /** The Choose-from-list menu moved its highlight (p = power, or null for a non-power item). */
  function previewChoice(p) { if (state === 'powerMenu') { previewPower = p; predictCache.key = ''; } }
  function chooseRe_aim() { if (state === 'powerMenu') { on.powerMenu(false); previewPower = null; setState('aim'); } }
  function choosePower(p) { if (state === 'powerMenu') { on.powerMenu(false); putt(p); } }

  /** Suggested power for Automatic: the gentlest putt that drops, else the one that ends closest. */
  function computeAutoPower() {
    const b = cur().ball;
    const others = players.filter(o => o !== cur() && o.started && o.ball.active).map(o => o.ball);
    const score = (p) => {
      const r = P.predict(ch, b, aimAngle, p, { others, t0: worldT, maxSec: 14 });
      if (r.holed) return -1000 + p * 10;
      if (r.drowned) return 1e6;
      const d = Math.hypot(r.end.x - ch.cup.x, r.end.y - ch.cup.y);
      let close = Infinity;
      for (const q of r.points) close = Math.min(close, Math.hypot(q.x - ch.cup.x, q.y - ch.cup.y));
      return d + close * 0.6;
    };
    let best = 0.3, bestS = Infinity;
    // Coarse sweep, then refine around the best — about 15 short simulations.
    for (let p = 0.05; p <= 1.0001; p += 0.1) { const s = score(p); if (s < bestS) { bestS = s; best = p; } }
    for (const d of [-0.05, -0.025, 0.025, 0.05]) { const p = best + d; if (p <= 0.02 || p > 1) continue; const s = score(p); if (s < bestS) { bestS = s; best = p; } }
    return U.clamp(best, 0.03, 1);
  }

  function autoPowerNow() {
    if (autoDirty) { autoPower = computeAutoPower(); autoDirty = false; }
    return autoPower;
  }

  /* ── The aim line ─────────────────────────────────────────────────────── */

  function lineWidth() { return LINE_WIDTHS[settings.get('lineWidth')] || 14; }

  function updateAimLine() {
    const p = cur();
    if (!p) return;
    const style = settings.get('aimLine');
    const mode = settings.get('power');
    const b = p.ball;
    const width = lineWidth();
    const color = A.BALL_COLORS[p.color] === '#fbfbf7' ? '#ffffff' : '#ffffff';
    if (style === 'arrow') {
      const len = 130 + width * 3;   // long enough that the head sits clear of the ball
      const pts = [{ x: b.x, y: b.y }, { x: b.x + Math.cos(aimAngle) * len, y: b.y + Math.sin(aimAngle) * len }];
      MG.fx.setAim(pts, { width, color, startGap: ch.ballR + 6 });
      setGlow(false);
      return;
    }
    // Which power does the line show?
    let shownPower = 1, ghost = false, maxTravel = 1000;
    if (state === 'charge') { shownPower = Math.max(0.02, power); ghost = style === 'preview'; maxTravel = style === 'preview' ? Infinity : 1000; }
    else if (state === 'powerMenu' && previewPower !== null) { shownPower = previewPower; ghost = true; maxTravel = Infinity; }
    else if (mode === 'auto') { shownPower = autoPowerNow(); ghost = true; maxTravel = Infinity; }
    if (style === 'trajectory' && state === 'charge') { shownPower = 1; ghost = false; maxTravel = 1000; }
    const others = players.filter(o => o !== p && o.started && o.ball.active).map(o => o.ball);
    const key = aimAngle.toFixed(4) + ':' + shownPower.toFixed(3) + ':' + maxTravel + ':' + others.map(o => o.x.toFixed(0) + ',' + o.y.toFixed(0)).join(';');
    if (predictCache.key !== key) {
      predictCache.key = key;
      predictCache.result = P.predict(ch, b, aimAngle, shownPower, { maxTravel, others, t0: worldT });
    }
    const r = predictCache.result;
    // Gold means "this putt drops". With the Trajectory line (always drawn at
    // full power, as the original was) it means "you're lined up on the cup".
    const holed = style === 'trajectory' && (state !== 'powerMenu' && !(mode === 'auto'))
      ? r.crossed : (r.holed && !r.truncated);
    MG.fx.setAim(r.points, {
      width, color: holed ? '#ffd23f' : color, startGap: ch.ballR + 6,
      ghostR: ghost && !holed ? ch.ballR : 0, ghostAt: r.end
    });
    setGlow(holed);
  }

  function setGlow(v) {
    if (v && !lastGlow) AU.play('glow', 0.4);
    lastGlow = v;
    MG.fx.setCupGlow(v);
  }

  /* ── Putter ───────────────────────────────────────────────────────────── */

  // A real putter would be twenty balls long and fill the screen; this one is
  // toy-sized but big enough that its backswing reads as the power.
  const PUTTER_SCALE = 1.7;

  function placePutter(back) {
    const p = cur();
    if (!p) return;
    const w = ballWorld(p);
    const L = putter.userData.shaftLen * PUTTER_SCALE;
    const r = ch.ballR * S;
    putter.position.set(w.x - Math.cos(aimAngle) * (r + 0.32), w.y - r + L + 0.2, w.z - Math.sin(aimAngle) * (r + 0.32));
    putter.rotation.set(back, Math.PI / 2 - aimAngle, 0);
  }

  function showPutterAddress() {
    putter.visible = true;
    putterAnim = null;
    placePutter(0.08);
  }

  /** Easy Pause: while the scan is on the putter, it glows gold (picking it takes the putt). */
  function setPutterFocus(v) {
    putterFocus = !!v;
    if (!putterFocus) glowPutter(0);
  }
  function glowPutter(k) {
    putter.traverse(o => { if (o.isMesh) { o.material.emissive.set('#ffc233'); o.material.emissiveIntensity = k; } });
  }

  /* ── The shot ─────────────────────────────────────────────────────────── */

  function putt(p) {
    const pl = cur();
    charging = false;
    on.power(null);
    MG.fx.hideAim(); MG.fx.setCupGlow(false); lastGlow = false;
    MG.fx.hideMarker();
    hideGator();
    pl.hole += 1;
    setState('swing');
    on.hud(hudData());
    // Back-swing (if not already drawn back by charging), then through.
    const back = putterAnim && putterAnim.back !== undefined ? putterAnim.back : 0.08;
    putterAnim = { phase: 'down', t: 0, from: Math.max(back, 0.25 + p * 0.9), power: p };
    if (back < 0.2) putterAnim.phase = 'raise';
    putterAnim.raiseFrom = back;
    putterAnim.onImpact = () => launchShot(p);
  }

  function launchShot(p) {
    const pl = cur();
    const balls = players.map(o => o.ball);
    for (const o of players) { o.prevX = o.ball.x; o.prevY = o.ball.y; }
    const seed = U.hash(courseFile + ':' + holeIndex + ':' + pl.id + ':' + pl.hole + ':' + Date.now());
    const sim = P.simulateShot(ch, balls, current, aimAngle, p, { seed, t0: worldT });
    shot = {
      sim, t: 0, shooter: current, ev: 0, t0: worldT, power: p, aim: aimAngle,
      start: players.map(o => ({ x: o.ball.x, y: o.ball.y, active: o.ball.active })),
      drops: {}, sinks: {}, done: false, cupCamAt: null, waterCamAt: null, finishedAt: null
    };
    // Plan the cinematography from the recording.
    const mine = sim.events.filter(e => e.ball === current);
    const cupEv = mine.find(e => e.type === 'cup');
    const waterEv = mine.find(e => e.type === 'water');
    if (cupEv && cupEv.t > 1.3 && settings.get('camera') !== 'overhead') shot.cupCamAt = cupEv.t - 1.15;
    if (waterEv && settings.get('camera') !== 'overhead') shot.waterCamAt = Math.max(0, waterEv.t - 0.55);
    shot.cupEv = cupEv; shot.waterEv = waterEv;
    AU.play('putt', 0.5 + p * 0.4);
    MG.cam.kick(2 + p * 4);
    setState('shot');
    MG.cam.follow(() => followTarget(), { style: settings.get('camera') === 'overhead' ? 'overhead' : 'follow' });
  }

  /** What the follow camera watches: the shooter's ball, or whatever is still moving. */
  function followTarget() {
    if (!shot) return null;
    const sim = shot.sim;
    const t = shot.t;
    const idx = shot.shooter;
    const a = P.sampleFrames(sim, idx, t), b = P.sampleFrames(sim, idx, t + 1 / 30);
    let vel = { x: (b.x - a.x) * 0.5, y: (b.y - a.y) * 0.5 };   // px per frame (1/60 s): sampled 1/30 s apart
    let x = a.x, y = a.y;
    if (Math.hypot(vel.x, vel.y) < 0.05) {
      // Shooter stopped: if another ball is still rolling, watch that instead.
      for (let i = 0; i < players.length; i++) {
        if (i === idx) continue;
        const a2 = P.sampleFrames(sim, i, t), b2 = P.sampleFrames(sim, i, t + 1 / 30);
        const v2 = { x: (b2.x - a2.x) * 0.5, y: (b2.y - a2.y) * 0.5 };
        if (Math.hypot(v2.x, v2.y) > 0.3) { x = a2.x; y = a2.y; vel = v2; break; }
      }
    }
    return { pos: view.toWorld(x, y, ch.ballR * S), vel };
  }

  const SOUND_FOR = {
    rail: (e) => AU.play('rail', U.clamp(e.speed / 30, 0.12, 0.6)),
    wall: (e) => AU.play('wall', U.clamp(e.speed / 30, 0.12, 0.65)),
    windmill: (e) => AU.play('wall', U.clamp(e.speed / 30, 0.12, 0.65)),
    sail: (e) => AU.play('sail', U.clamp(e.speed / 25, 0.2, 0.7)),
    ball: (e) => AU.play('ballhit', U.clamp(e.speed / 25, 0.2, 0.8)),
    bumper: (e) => AU.play('bumper', U.clamp(e.speed / 25, 0.25, 0.7)),
    bush: () => AU.play('bush', 0.5),
    sand: () => AU.play('sand', 0.45),
    ice: () => AU.play('ice', 0.3),
    boost: () => AU.play('boost', 0.35),
    tunnelIn: () => AU.play('tunnelIn', 0.45),
    tunnelOut: () => AU.play('tunnelOut', 0.45),
    lip: (e) => AU.play('rattle', U.clamp(e.speed / 30, 0.3, 0.7))
  };

  function handleEvent(e) {
    const pl = players[e.ball];
    const at = view.toWorld(e.x, e.y, 0);
    if (SOUND_FOR[e.type]) SOUND_FOR[e.type](e);
    switch (e.type) {
      case 'wall': case 'rail': case 'windmill': case 'sail':
        if (e.speed > 12) MG.cam.bump(e.speed * 0.004);
        break;
      case 'bumper':
        view.pulseBumper(e.bumper);
        MG.fx.burst('bumper', at.setY(at.y + 0.6));
        MG.cam.bump(0.05);
        break;
      case 'bush':
        view.shakeBush(e.bush);
        MG.fx.burst('leaves', at.setY(at.y + 0.3), { colors: view.th.foliage });
        if (e.ball === shot.shooter) on.toast('Caught in a bush!', 'warn');
        break;
      case 'sand':
        MG.fx.burst('sand', at, { color: view.th.sand });
        break;
      case 'lip':
        // A fast ball often rattles on the lip and then drops a moment later —
        // the recording knows, so only call it a near miss if it never goes in.
        if (e.ball === shot.shooter && e.near && !shot.cupEv) { on.toast('Lipped out!', 'warn'); AU.sayQueued('Ooh, so close!'); }
        MG.cam.bump(0.04);
        break;
      case 'boost':
        MG.cam.kick(5);
        MG.fx.burst('sparkle', at.setY(at.y + 0.3), { color: '#ffe14a', count: 14 });
        break;
      case 'tunnelIn': {
        const tn = ch.tunnels[e.tunnel];
        MG.fx.burst('tunnel', at.setY(at.y + 0.3), { color: '#ffd23f' });
        if (e.ball === shot.shooter && settings.get('camera') !== 'overhead') {
          const exit = view.toWorld(tn.x2, tn.y2, 0);
          const a = tn.exitAngle * Math.PI / 180;
          MG.cam.watch(new THREE.Vector3(exit.x + Math.cos(a) * 9 - Math.sin(a) * 4, exit.y + 5, exit.z + Math.sin(a) * 9 + Math.cos(a) * 4), exit, 46, 5);
        }
        break;
      }
      case 'tunnelOut':
        MG.fx.burst('tunnel', at.setY(at.y + 0.5), { color: '#5dff6a' });
        if (e.ball === shot.shooter && settings.get('camera') !== 'overhead' && MG.cam.mode === 'watch') {
          MG.cam.follow(() => followTarget(), { style: 'follow' });
        }
        break;
      case 'water':
        shot.sinks[e.ball] = { t: 0, x: e.x, y: e.y, vx: 0, vy: 0 };
        // Carry on the way it was going as it sinks.
        {
          const a = P.sampleFrames(shot.sim, e.ball, Math.max(0, e.t - 0.05));
          shot.sinks[e.ball].vx = (e.x - a.x) / 0.05 * S;
          shot.sinks[e.ball].vy = (e.y - a.y) / 0.05 * S;
        }
        AU.play('splash', 0.6);
        MG.fx.burst('splash', at.setY(waterLevelAt(e.x, e.y) + 0.05), { color: '#e6f6ff' });
        MG.cam.bump(0.06);
        break;
      case 'cup':
        shot.drops[e.ball] = { t: 0, x: e.x, y: e.y, vx: e.vx, vy: e.vy };
        AU.play('cup', 0.7);
        view.setFlagLift(1);
        MG.fx.burst('sparkle', view.cupWorld.clone().setY(view.cupWorld.y + 0.4), { color: '#ffd23f', count: 26 });
        break;
      default: break;
    }
  }

  function waterLevelAt(x, y) {
    return view.surfaceY(x, y) - 0.6;
  }

  function updateShot(dt) {
    if (!shot) return;
    const sim = shot.sim;
    // Director: slow motion as the ball nears the cup.
    if (shot.cupCamAt !== null && shot.t >= shot.cupCamAt && !shot.cupCamOn) {
      shot.cupCamOn = true;
      const a = P.sampleFrames(sim, shot.shooter, Math.max(0, shot.cupEv.t - 0.25));
      const approach = Math.atan2(shot.cupEv.y - a.y, shot.cupEv.x - a.x);
      MG.cam.cupCam(() => followTarget(), approach);
      timeScaleTarget = 0.38;
      view.setFlagLift(1);
    }
    if (shot.cupEv && shot.t >= shot.cupEv.t + 0.5 && shot.cupCamOn) timeScaleTarget = 1;
    if (shot.waterCamAt !== null && shot.t >= shot.waterCamAt && !shot.waterCamOn) {
      shot.waterCamOn = true;
      const e = shot.waterEv;
      const at = view.toWorld(e.x, e.y, 0);
      const a = P.sampleFrames(sim, shot.shooter, Math.max(0, e.t - 0.3));
      const dir = Math.atan2(e.y - a.y, e.x - a.x);
      MG.cam.watch(new THREE.Vector3(at.x - Math.cos(dir) * 5 - Math.sin(dir) * 5, at.y + 3.2, at.z - Math.sin(dir) * 5 + Math.cos(dir) * 5), at, 44, 4);
    }
    // The flagstick comes out when the shooter's ball gets close.
    {
      const s = P.sampleFrames(sim, shot.shooter, shot.t);
      if (Math.hypot(s.x - ch.cup.x, s.y - ch.cup.y) < 240) view.setFlagLift(1);
    }

    shot.t += dt;
    while (shot.ev < sim.events.length && sim.events[shot.ev].t <= shot.t) handleEvent(sim.events[shot.ev++]);

    // Once the shot is over, finishShot owns the balls — a ball in the water is
    // already back on the tee — so stop copying the recording onto them (its
    // last frame has a drowned ball at the water's edge).
    if (!shot.finishedAt) for (let i = 0; i < players.length; i++) {
      const pl = players[i];
      if (!pl.started) continue;
      const s = P.sampleFrames(sim, i, shot.t);
      pl.ball.x = s.x; pl.ball.y = s.y;
      pl.under = s.under;
    }
    for (const pl of players) syncMesh(pl, false, dt);

    // Hold a moment past the end so a ball that just dropped finishes falling
    // to the bottom of the cup (the drop takes 0.32 s) before anything moves on.
    if (shot.t >= sim.duration + 0.5 && !shot.finishedAt) {
      shot.finishedAt = shot.t;
      finishShot();
    }
  }

  /** Put the ball mesh where the ball is, rolling it as it goes. */
  const rollAxis = new THREE.Vector3(), rollQ = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  function syncMesh(pl, snap, dt) {
    const m = pl.mesh;
    if (!m) return;
    const r = ch.ballR * S;
    const drop = shot && shot.drops[pl.id];
    const sink = shot && shot.sinks[pl.id];
    if (drop) {
      // Into the cup: slide to the centre and fall to the bottom.
      drop.t += dt || 0;
      const k = Math.min(1, drop.t / 0.32);
      const cx = U.lerp(drop.x, ch.cup.x + (pl.id - (players.length - 1) / 2) * ch.ballR * 0.8, U.easeOutCubic(k));
      const cy = U.lerp(drop.y, ch.cup.y, U.easeOutCubic(k));
      const top = view.surfaceY(ch.cup.x, ch.cup.y) + r;
      const bottom = view.surfaceY(ch.cup.x, ch.cup.y) - MG.scene.CUP_DEPTH + r;
      m.position.set(cx * S, U.lerp(top, bottom, k * k), cy * S);
      m.visible = true;
      return;
    }
    if (sink) {
      sink.t += dt || 0;
      const k = Math.min(1, sink.t / 0.7);
      const lvl = waterLevelAt(sink.x, sink.y);
      m.position.set(sink.x * S + sink.vx * 0.12 * k, U.lerp(lvl + r * 0.4, lvl - r * 2.2, k), sink.y * S + sink.vy * 0.12 * k);
      m.visible = k < 1;
      return;
    }
    if (pl.done) {
      // Holed earlier: the ball stays visible in the cup; picked up: gone.
      if (pl.picked) m.visible = false; else placeInCup(pl);
      return;
    }
    const target = view.toWorld(pl.ball.x, pl.ball.y, r);
    if (!snap) {
      const dx = target.x - m.position.x, dz = target.z - m.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-5 && dist < 5) {
        rollAxis.set(dz, 0, -dx).normalize();
        rollQ.setFromAxisAngle(rollAxis, dist / r);
        m.quaternion.premultiply(rollQ);
      }
    }
    m.position.copy(target);
    m.visible = pl.started && !pl.under && !pl.done;
  }

  function ballWorld(p) { return view.toWorld(p.ball.x, p.ball.y, ch.ballR * S); }

  /** The recording has played out: settle scores, penalties and whose turn it is. */
  async function finishShot() {
    const tok = newScript();
    const sim = shot.sim;
    timeScaleTarget = 1;
    const shooter = players[shot.shooter];
    const holedNow = [];
    const drownedNow = [];
    for (let i = 0; i < players.length; i++) {
      const fb = sim.balls[i], pl = players[i];
      if (!pl.started) continue;
      pl.ball.x = fb.x; pl.ball.y = fb.y; pl.ball.vx = pl.ball.vy = 0; pl.ball.moving = false;
      if (fb.sunk && !pl.done) holedNow.push(pl);
      if (fb.drowned) drownedNow.push(pl);
    }
    setState('settle');

    // Water: one penalty stroke, and back to the tee (as the original game did).
    for (const pl of drownedNow) {
      pl.hole += 1;
      pl.ball.active = true; pl.ball.drowned = false;
      const spot = teeSpot(pl);
      pl.ball.x = spot.x; pl.ball.y = spot.y;
      pl.ball.lastSafeX = spot.x; pl.ball.lastSafeY = spot.y;
    }
    if (drownedNow.length) {
      const names = drownedNow.map(p => p.name);
      on.toast(roundMode === 'multi' ? 'Splash! ' + names.join(' & ') + ' +1, back to the tee' : 'Water hazard  +1 · back to the tee', 'warn');
      AU.sayQueued(roundMode === 'multi' ? names.join(' and ') + ', water hazard. Penalty stroke, back to the tee.' : 'Splash! Penalty stroke. Back to the tee.');
      await wait(1.0);
      if (!alive(tok)) return;
      for (const pl of drownedNow) { delete shot.sinks[pl.id]; respawn(pl); }
      await wait(0.6);
      if (!alive(tok)) return;
    }

    // Holed: out of play, so later shots don't bounce off a ball in the cup.
    for (const pl of holedNow) { pl.done = true; pl.strokes[holeIndex] = pl.hole; pl.ball.active = false; pl.ball.sunk = true; }
    on.hud(hudData());

    if (holedNow.includes(shooter)) {
      await celebrate(shooter, tok);
      if (!alive(tok)) return;
    }
    // Anyone else's ball knocked in counts for them — even on the shooter's own drop.
    const knockedIn = holedNow.filter(p => p !== shooter);
    if (knockedIn.length) {
      for (const pl of knockedIn) {
        on.toast(pl.name + ' is in!', 'good');
        AU.sayQueued(pl.name + ' is in, in ' + pl.hole + '.');
      }
      await waitQuiet(4);
      if (!alive(tok)) return;
    }
    view.setFlagLift(players.some(p => !p.done && p.started && Math.hypot(p.ball.x - ch.cup.x, p.ball.y - ch.cup.y) < 240) ? 1 : 0);

    // Challenge: finish within par, or the course starts again.
    if (roundMode === 'challenge' && !shooter.done && shooter.hole >= ch.par) {
      await challengeFail(tok);
      return;
    }

    // Stroke cap, so no hole can go on forever.
    const cap = settings.get('maxStrokes');
    if (roundMode !== 'challenge' && !shooter.done && cap && shooter.hole >= cap) {
      shooter.done = true; shooter.picked = true; shooter.strokes[holeIndex] = cap; shooter.ball.active = false;
      on.toast(cap + ' strokes — picking up', 'warn');
      AU.sayQueued('That is ' + cap + ' strokes. Picking up. On to the next one.');
      on.hud(hudData());
      if (shooter.mesh) shooter.mesh.visible = false;
      await waitQuiet(5);
      if (!alive(tok)) return;
    }

    shot = null;
    nextTurn();
  }

  function respawn(pl) {
    pl.mesh.visible = true;
    pl.respawn = { t: 0 };
    syncMesh(pl, true);
  }

  function resultName(strokes, par) {
    if (strokes === 1) return { text: 'HOLE IN ONE!', say: 'Hole in one!', level: 3 };
    const d = strokes - par;
    if (d <= -3) return { text: 'ALBATROSS!', say: 'Albatross!', level: 3 };
    if (d === -2) return { text: 'EAGLE!', say: 'Eagle!', level: 2 };
    if (d === -1) return { text: 'BIRDIE!', say: 'Birdie!', level: 1 };
    if (d === 0) return { text: 'PAR', say: 'Paar.', level: 0 };
    if (d === 1) return { text: 'BOGEY', say: 'Bogey.', level: -1 };
    if (d === 2) return { text: 'DOUBLE BOGEY', say: 'Double bogey.', level: -1 };
    if (d === 3) return { text: 'TRIPLE BOGEY', say: 'Triple bogey.', level: -1 };
    return { text: '+' + d, say: d + ' over.', level: -1 };
  }

  async function celebrate(pl, tok) {
    const res = resultName(pl.hole, ch.par);
    setState('holeOut');
    MG.cam.orbit(view.cupWorld, { radius: 7, height: 3.2 });
    on.big(res.text, pl.hole === 1 ? '' : pl.hole + ' strokes', res.level >= 1 ? 'gold' : '');
    const cup = view.cupWorld.clone();
    if (res.level >= 3) {
      AU.play('fanfare', 0.55);
      for (let i = 0; i < 6; i++) later(i * 0.38, () => MG.fx.firework(cup.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14))));
      MG.fx.burst('confetti', cup.clone().setY(cup.y + 0.5), { count: 260 });
      later(0.9, () => MG.fx.burst('confetti', cup.clone().setY(cup.y + 0.5), { count: 200 }));
    } else if (res.level === 2) {
      AU.play('fanfare', 0.5);
      for (let i = 0; i < 3; i++) later(i * 0.45, () => MG.fx.firework(cup.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10))));
      MG.fx.burst('confetti', cup.clone().setY(cup.y + 0.5), { count: 220 });
    } else if (res.level === 1) {
      AU.play('cheer', 0.5);
      MG.fx.burst('confetti', cup.clone().setY(cup.y + 0.5), { count: 160 });
    } else if (res.level === 0) {
      MG.fx.burst('sparkle', cup.clone().setY(cup.y + 0.5), { color: '#ffffff', count: 30 });
    }
    const who = roundMode === 'multi' ? pl.name + '. ' : '';
    AU.sayQueued(who + res.say + (pl.hole === 1 ? '' : ' ' + pl.hole + ' strokes.'));
    await wait(2.4, true);
    await waitQuiet(7, true);
    if (!alive(tok)) return;
    on.big(null);

    // Instant replay for the special ones.
    const longPutt = shot && Math.hypot(shot.start[pl.id].x - ch.cup.x, shot.start[pl.id].y - ch.cup.y) > 520;
    if (settings.get('replays') && shot && (res.level >= 2 || (res.level === 1 && longPutt))) {
      await playReplay(pl, tok);
      if (!alive(tok)) return;
    }
  }

  /* ── Replay ───────────────────────────────────────────────────────────── */

  async function playReplay(pl, tok) {
    const rec = shot;
    // The replay starts clean: the celebration's confetti and fireworks are gone.
    clearLater();
    MG.fx.clearParticles();
    setState('replay');
    on.cinema(true, { skippable: true, replay: true });
    AU.say('Replay.');
    replay = { rec, t: -0.4, cupOn: false };
    // Reset everyone to where they were when the putt was struck.
    for (const o of players) {
      const st = rec.start[o.id];
      if (!st) continue;
      o.replayX = st.x; o.replayY = st.y;
    }
    MG.cam.track(() => replayTarget(), Math.random() < 0.5 ? 1 : -1);
    MG.cam.cut();
    const total = rec.sim.duration + 1.4;
    await wait(total / 0.75 + 0.5, true);
    replay = null;
    timeScaleTarget = 1;
    if (!alive(tok)) return;
    on.cinema(false);
    // Back to how things really are.
    for (const o of players) syncMesh(o, true);
    for (const o of players) if (o.done && o.mesh) placeInCup(o);
  }

  function replayTarget() {
    if (!replay) return null;
    const rec = replay.rec;
    const t = U.clamp(replay.t, 0, rec.sim.duration);
    const a = P.sampleFrames(rec.sim, rec.shooter, t), b = P.sampleFrames(rec.sim, rec.shooter, t + 1 / 30);
    return { pos: view.toWorld(a.x, a.y, ch.ballR * S), vel: { x: (b.x - a.x) * 0.5, y: (b.y - a.y) * 0.5 } };
  }

  function updateReplay(dt) {
    const rec = replay.rec;
    replay.t += dt * 0.75;
    if (rec.cupEv && !replay.cupOn && replay.t >= rec.cupEv.t - 1.0) {
      replay.cupOn = true;
      const a = P.sampleFrames(rec.sim, rec.shooter, Math.max(0, rec.cupEv.t - 0.25));
      MG.cam.cupCam(() => replayTarget(), Math.atan2(rec.cupEv.y - a.y, rec.cupEv.x - a.x));
      timeScaleTarget = 0.45;
    }
    const t = U.clamp(replay.t, 0, rec.sim.duration);
    for (const o of players) {
      if (!o.mesh || !rec.start[o.id] || !rec.start[o.id].active) continue;
      const s = P.sampleFrames(rec.sim, o.id, t);
      const r = ch.ballR * S;
      if (rec.cupEv && o.id === rec.shooter && replay.t >= rec.cupEv.t) {
        const k = Math.min(1, (replay.t - rec.cupEv.t) / 0.3);
        const top = view.surfaceY(ch.cup.x, ch.cup.y) + r, bottom = top - MG.scene.CUP_DEPTH;
        o.mesh.position.set(ch.cup.x * S, U.lerp(top, bottom, k * k), ch.cup.y * S);
        if (k >= 1 && !replay.dropped) { replay.dropped = true; AU.play('cup', 0.6); timeScaleTarget = 1; }
        o.mesh.visible = true;
        continue;
      }
      const target = view.toWorld(s.x, s.y, r);
      const dx = target.x - o.mesh.position.x, dz = target.z - o.mesh.position.z, dist = Math.hypot(dx, dz);
      if (dist > 1e-5 && dist < 5) { rollAxis.set(dz, 0, -dx).normalize(); rollQ.setFromAxisAngle(rollAxis, dist / r); o.mesh.quaternion.premultiply(rollQ); }
      o.mesh.position.copy(target);
      o.mesh.visible = !s.under;
    }
  }

  function placeInCup(o) {
    const r = ch.ballR * S;
    o.mesh.position.set((ch.cup.x + (o.id - (players.length - 1) / 2) * ch.ballR * 0.8) * S, view.surfaceY(ch.cup.x, ch.cup.y) - MG.scene.CUP_DEPTH + r, ch.cup.y * S);
    o.mesh.visible = true;
  }

  /* ── Hole and course end ──────────────────────────────────────────────── */

  async function holeComplete() {
    const tok = newScript();
    shot = null;
    MG.fx.hideAim(); MG.fx.hideMarker();
    putter.visible = false;
    setState('scorecard');
    if (MG.cam.mode !== 'orbit') MG.cam.orbit(view.cupWorld, { radius: 9, height: 4.5, speed: 0.2 });
    const last = holeIndex >= course.holes.length - 1;
    if (!testMode) {
      if (!last) progress.save({ file: courseFile, name: courseName, mode: roundMode, hole: holeIndex + 1, players: players.map(p => ({ name: p.name, color: p.color, strokes: p.strokes.slice() })), at: Date.now() });
    }
    // Honours: the best score on this hole tees off first on the next.
    // (A stable sort, so ties keep the order they played in.)
    const h = holeIndex;
    turnOrder = turnOrder.slice().sort((a, b) => (players[a].strokes[h] || 99) - (players[b].strokes[h] || 99));
    on.scorecard(scoreData(), { final: last });
    AU.sayQueued(scoreSummary(last));
    await wait(last ? 2.5 : 3.5, true);
    await waitQuiet(9, true);
    if (!alive(tok)) return;
    on.scorecard(null);
    if (last) { finishCourse(tok); return; }
    loadHole(holeIndex + 1);
  }

  function totalOf(p) { let s = 0; for (const v of p.strokes) if (v) s += v; return s; }
  function parSoFar(p) { let s = 0; course.holes.forEach((h, i) => { if (p.strokes[i]) s += h.par; }); return s; }

  function scoreSummary(final) {
    const rel = (p) => { const d = totalOf(p) - parSoFar(p); return d === 0 ? 'even paar' : (Math.abs(d) + (d < 0 ? ' under paar' : ' over paar')); };
    if (roundMode !== 'multi') {
      const p = players[0];
      return (final ? 'Course complete. ' : 'After ' + (holeIndex + 1) + (holeIndex ? ' holes' : ' hole') + ', ') + totalOf(p) + ' strokes, ' + rel(p) + '.';
    }
    const sorted = players.slice().sort((a, b) => totalOf(a) - totalOf(b));
    const tie = sorted.length > 1 && totalOf(sorted[0]) === totalOf(sorted[1]);
    if (final) return tie ? 'Course complete. It is a tie at ' + totalOf(sorted[0]) + '.' : 'Course complete. ' + sorted[0].name + ' wins with ' + totalOf(sorted[0]) + '.';
    return tie ? 'All square at the top on ' + totalOf(sorted[0]) + '.' : sorted[0].name + ' leads on ' + totalOf(sorted[0]) + '.';
  }

  async function finishCourse(tok) {
    setState('courseEnd');
    progress.clearRound();
    const summary = {
      course: courseName, file: courseFile, mode: roundMode, test: testMode,
      pars: course.holes.map(h => h.par),
      players: players.map(p => ({ name: p.name, color: p.color, strokes: p.strokes.slice(), total: totalOf(p), toPar: totalOf(p) - parSoFar(p) }))
    };
    if (!testMode && roundMode !== 'multi') summary.newBest = progress.record(courseFile, roundMode, summary.players[0].total);
    const cup = view.cupWorld.clone();
    for (let i = 0; i < 5; i++) later(i * 0.42, () => MG.fx.firework(cup.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16))));
    AU.play('fanfare', 0.5);
    on.roundEnd(summary);
  }

  async function challengeFail(tok) {
    setState('challengeFail');
    on.big('OVER PAR', 'Back to hole 1', '');
    AU.play('aww', 0.4);
    AU.sayQueued('Over paar. Challenge mode starts again from hole one.');
    await wait(2.5, true);
    await waitQuiet(7, true);
    if (!alive(tok)) return;
    on.big(null);
    for (const p of players) p.strokes = [];
    shot = null;
    loadHole(0);
  }

  /* ── HUD / scorecard data ─────────────────────────────────────────────── */

  function hudData() {
    const p = cur();
    return {
      hole: holeIndex + 1, holes: course.holes.length, par: ch ? ch.par : 0,
      strokes: p ? p.hole : 0,
      toPar: p ? totalOf(p) - parSoFar(p) : 0,
      multi: roundMode === 'multi', challenge: roundMode === 'challenge',
      player: p ? { name: p.name, color: A.BALL_COLORS[p.color] || p.color } : null,
      board: players.map((o, i) => ({ name: o.name, color: A.BALL_COLORS[o.color] || o.color, total: totalOf(o) + (o.done ? 0 : o.hole), now: i === current }))
    };
  }

  function scoreData() {
    return {
      course: courseName, current: holeIndex,
      pars: course.holes.map(h => h.par),
      players: players.map(p => ({ name: p.name, color: A.BALL_COLORS[p.color] || p.color, strokes: p.strokes.slice(), total: totalOf(p), toPar: totalOf(p) - parSoFar(p) }))
    };
  }

  /* ── The alligator ────────────────────────────────────────────────────────
   * Leave your ball resting near water for a while and an alligator comes to
   * watch it — eyes just out of the water, ripples — and if you still haven't
   * putted, it comes out and takes it. gator.js finds it a hiding place where
   * every bit of it stays in the water until it lunges (a pond too small for
   * one gets none) and poses it. This stages the scene the player must be able
   * to SEE: the camera cuts to a side view of the bank, it surfaces, rears up
   * with its jaws open, lunges up the bank, snaps the ball, shakes it and
   * drags it under. +1 stroke, back to the tee.
   */

  const GATOR_PLAN_AT = 14;      // seconds resting near water before it starts looking for a way in
  const GATOR_WATCH_AT = 18;     // ...before it surfaces to watch
  const GATOR_STRIKE_AT = 30;    // ...and before it strikes

  function nearWater(b) {
    for (const w of ch.waters) if (C.closestOnPolygon(b.x, b.y, w.poly).d <= 60 + ch.ballR) return true;
    return false;
  }

  function updateGator(dt) {
    if (!settings.get('gator') || !ch.waters.length) return;
    if (state !== 'ready' && state !== 'aim' && state !== 'charge' && state !== 'powerMenu') return;
    const b = cur().ball;
    if (P.onBridge(ch, b.x, b.y) || !nearWater(b)) {
      gatorTimer = 0; gatorJob = null;
      if (gator && gator.phase === 'watch') hideGator();
      return;
    }
    gatorTimer += dt;
    // It works out where it can come from a few milliseconds a frame, well before it's needed.
    if (gatorTimer > GATOR_PLAN_AT && !gator && !gatorJob) gatorJob = MG.gator.startPlan(ch, { x: b.x, y: b.y });
    if (gatorJob && !gatorJob.done) gatorJob.step(3);
    if (gatorTimer > GATOR_WATCH_AT && !gator && gatorJob && gatorJob.done) {
      const plan = gatorJob.step();
      if (plan) showGator(plan);       // (no plan: there's no room for one here, so none comes)
    }
    if (gatorTimer > GATOR_STRIKE_AT && gator && gator.phase === 'watch') gatorStrike();
  }

  function showGator(plan) {
    gator = { plan, mesh: gatorModel, phase: 'watch', t: 0, ripple: 0, splashed: false, holding: false };
    MG.gator.apply(gatorModel, MG.gator.frame(ch, plan, 'watch', 0));
    gatorModel.visible = true;
    const p = MG.gator.pathAt(plan, plan.uHome);
    MG.fx.burst('ripple', new THREE.Vector3(p.x * S, plan.pond.level + 0.03, p.y * S));
    AU.play('gatorWatch', 0.5);
    on.toast('The alligator is watching…', 'warn');
    AU.sayQueued('Uh oh. The alligator is watching. Better putt soon.');
  }

  /** A side-on spot to film the grab from, framing the ball and the water it comes out of. */
  function gatorCamera(plan) {
    const ball = plan.ball, home = MG.gator.pathAt(plan, plan.uHome);
    const cx = Math.cos(plan.dir), cy = Math.sin(plan.dir);
    const mx = (home.x + ball.x) / 2, my = (home.y + ball.y) / 2;
    const dist = U.clamp(Math.hypot(ball.x - home.x, ball.y - home.y) * 0.9 + 150, 190, 330);
    const px = -cy, py = cx;
    let side = 1, best = -Infinity;
    for (const sgn of [1, -1]) {
      const x = mx + px * sgn * dist, y = my + py * sgn * dist;
      let wd = 200;
      for (const w of ch.waters) wd = Math.min(wd, C.closestOnPolygon(x, y, w.poly).d);
      const score = (C.pointInPolygon(x, y, ch.fairway.poly) ? 200 : 0) + wd;
      if (score > best) { best = score; side = sgn; }
    }
    return {
      from: view.toWorld(mx + px * side * dist - cx * 30, my + py * side * dist - cy * 30, 3.6),
      at: view.toWorld(mx + cx * 10, my + cy * 10, 0.6)
    };
  }

  async function gatorStrike() {
    const tok = newScript();
    const pl = cur();
    const plan = gator.plan, GT = plan.T;
    gator.phase = 'strike'; gator.t = 0;
    setState('gator');
    charging = false; on.power(null); on.powerMenu(false); on.shotChoice(false);
    setPutterFocus(false);
    MG.fx.hideAim(); MG.fx.hideMarker(); MG.fx.setCupGlow(false); lastGlow = false;
    putter.visible = false;
    on.cinema(true, { skippable: false });
    const camPose = gatorCamera(plan);
    MG.cam.watch(camPose.from, camPose.at, 46, 6);
    MG.cam.cut();
    const home = MG.gator.pathAt(plan, plan.uHome);
    MG.fx.burst('splash', new THREE.Vector3(home.x * S, plan.pond.level + 0.05, home.y * S), { count: 30 });
    AU.play('splash', 0.45);

    await wait(GT.snap);
    if (!alive(tok)) return;
    // Chomp — the ball is in its jaws now (animateGator carries it).
    gator.holding = true;
    AU.play('snap', 0.8);
    MG.cam.bump(0.12);
    pl.hole += 1;
    on.hud(hudData());
    on.toast('Chomp!  +1 stroke', 'warn');
    AU.sayQueued('Chomp! The alligator got your ball! Penalty stroke, back to the tee.');

    await wait(GT.gone - GT.snap + 0.4);
    if (!alive(tok)) return;
    await waitQuiet(6);
    if (!alive(tok)) return;
    on.cinema(false);
    hideGator();
    pl.started = false;
    pl.ball.active = false;
    beginTurn(false);
  }

  function hideGator() {
    if (gator) { gator.mesh.visible = false; gator = null; }
    gatorTimer = 0; gatorJob = null;
  }

  const gatorTmp = new THREE.Vector3();

  function animateGator(dt) {
    if (!gator) return;
    const g = gator, plan = g.plan;
    g.t += dt;
    const pose = MG.gator.frame(ch, plan, g.phase, g.t);
    MG.gator.apply(g.mesh, pose);
    if (g.phase === 'watch') {
      g.ripple -= dt;
      if (g.ripple <= 0) { g.ripple = 1.6; MG.fx.burst('ripple', new THREE.Vector3(pose.head.x * S, plan.pond.level + 0.03, pose.head.y * S)); }
      return;
    }
    // The ball rides in its mouth from the snap until it goes under.
    const pl = cur();
    if (g.holding && pl && pl.mesh) {
      g.mesh.updateMatrixWorld(true);
      g.mesh.userData.head.localToWorld(gatorTmp.copy(g.mesh.userData.mouth));
      pl.mesh.position.copy(gatorTmp);
      pl.mesh.visible = gatorTmp.y > plan.pond.level - 0.25;
      if (!g.splashed && g.t > plan.T.hold && gatorTmp.y < plan.pond.level + 0.15) {
        g.splashed = true;
        MG.fx.burst('splash', new THREE.Vector3(gatorTmp.x, plan.pond.level + 0.05, gatorTmp.z), { count: 60 });
        AU.play('splash', 0.6);
      }
    }
  }

  /* ── Pause ────────────────────────────────────────────────────────────── */

  function pause() {
    if (charging) { charging = false; power = 0; on.power(null); if (state === 'charge') setState('aim'); }
    if (state === 'powerMenu') { on.powerMenu(false); setState('aim'); }
    aimHeld = false;
    paused = true;
  }
  function resume() {
    paused = false;
    if (state === 'ready') {
      if (settings.get('easyPause')) on.shotChoice(true, { resumed: true });   // back to the putter / Pause scan
      else choosePutt();     // Easy Pause was switched off in the pause menu: straight to aiming
    }
  }

  /** Pause-menu Restart Hole: everyone back to the tee, this hole's strokes cleared. */
  function restartHole() {
    paused = false;
    on.powerMenu(false);   // closes the Easy Pause scan (resume just reopened it)
    setPutterFocus(false);
    for (const p of players) { p.strokes.length = Math.min(p.strokes.length, holeIndex); }
    shot = null; replay = null; timeScale = timeScaleTarget = 1;
    on.big(null); on.scorecard(null); on.cinema(false);
    loadHole(holeIndex);
  }

  function quitToMenu() {
    newScript();
    shot = null; replay = null; paused = false; charging = false;
    timeScale = timeScaleTarget = 1;
    on.big(null); on.scorecard(null); on.cinema(false); on.power(null); on.powerMenu(false); on.banner(null);
    MG.fx.hideAim(); MG.fx.hideMarker(); MG.fx.setCupGlow(false);
    putter.visible = false;
    setPutterFocus(false);
    clearLater();
    hideGator();
    setState('idle');
  }

  /* ── Per-frame ────────────────────────────────────────────────────────── */

  function update(rawDt) {
    AU.tickSpeech();
    if (paused) { MG.cam.update(0); return; }
    timeScale = U.damp(timeScale, timeScaleTarget, 6, rawDt);
    const dt = rawDt * timeScale;
    worldT += dt;
    tickWaits(rawDt);
    tickLater(rawDt);
    // The alligator's pond maps, a couple of milliseconds a frame after a hole loads.
    if (!gatorReady && ch && ch.waters.length && settings.get('gator')) gatorReady = MG.gator.prepare(ch, 2);

    if (view) view.update(dt, worldT);
    MG.scene.updateEnvironment(rawDt);

    if (state === 'ready' || state === 'aim' || state === 'charge' || state === 'powerMenu') {
      if (state === 'aim') {
        const rotating = aimHeld || oneSwitch;
        if (rotating) { aimAngle += aimDir * aimSpeed() * rawDt; autoDirty = true; }
        if (settings.get('power') === 'auto' && autoDirty && performance.now() - autoAt > (rotating ? 250 : 0)) {
          autoAt = performance.now(); autoPower = computeAutoPower(); autoDirty = false;
        }
      }
      if (state === 'charge') {
        power = Math.min(1, power + rawDt / chargeTime());
        const step = Math.floor(power * 5 + 1e-6);
        if (step > chargeBeep && step >= 1) { chargeBeep = step; AU.play('charge' + Math.min(5, step), 0.35); }
        on.power(power, power >= 1);
      }
      updateAimLine();
      if (state === 'charge') { placePutter(0.08 + power * 1.0); putterAnim = { back: 0.08 + power * 1.0 }; }
      else placePutter(0.08 + Math.sin(worldT * 2) * 0.03);
      if (putterFocus) glowPutter(0.45 + 0.35 * Math.sin(worldT * 6));
      MG.cam.aim(aimCamArgs());
      MG.fx.showMarker(ballWorld(cur()), A.BALL_COLORS[cur().color] || cur().color, ch.ballR * S);
      updateGator(rawDt);
    }

    if (state === 'swing' && putterAnim) {
      const a = putterAnim;
      a.t += rawDt;
      if (a.phase === 'raise') {
        const k = Math.min(1, a.t / 0.28);
        placePutter(U.lerp(a.raiseFrom, a.from, U.easeOutCubic(k)));
        if (k >= 1) { a.phase = 'down'; a.t = 0; }
      } else if (a.phase === 'down') {
        const k = Math.min(1, a.t / 0.13);
        placePutter(U.lerp(a.from, 0, k * k));
        if (k >= 1) { a.phase = 'through'; a.t = 0; a.onImpact(); }
      }
    }
    if (putterAnim && putterAnim.phase === 'through') {
      const a = putterAnim;
      a.t += rawDt;
      const k = Math.min(1, a.t / 0.5);
      // Follow-through, then the club fades away.
      putter.rotation.x = -0.55 * U.easeOutCubic(Math.min(1, a.t / 0.2)) * (0.6 + a.power * 0.6);
      putter.visible = k < 1;
      if (k >= 1) putterAnim = null;
    }

    if (state === 'shot' || state === 'settle') updateShot(dt);
    if (state === 'replay' && replay) updateReplay(dt);

    // Respawn drop after a penalty.
    for (const pl of players) {
      if (!pl.respawn || !pl.mesh) continue;
      pl.respawn.t += rawDt;
      const k = Math.min(1, pl.respawn.t / 0.5);
      const w = ballWorld(pl);
      pl.mesh.position.set(w.x, w.y + (1 - U.easeOutCubic(k)) * 4 + Math.sin(k * Math.PI) * 0.2, w.z);
      if (k >= 1) pl.respawn = null;
    }

    animateGator(rawDt);
    MG.fx.update(dt);
    MG.cam.update(rawDt);
  }

  /** The aim view looks along the line of play chosen at the start of the turn — never the live aim. */
  function aimCamArgs() {
    const p = cur();
    return {
      ball: p && p.ball ? ballWorld(p) : view.cupWorld.clone(),
      viewYaw: turnViewYaw,
      style: settings.get('camera') === 'overhead' ? 'overhead' : 'hole'
    };
  }

  /* ── Public ───────────────────────────────────────────────────────────── */

  MG.game = {
    init, attract, startRound, update, skip, pause, resume, restartHole, quitToMenu,
    aimPress, aimRelease, setOneSwitch, pointerAim,
    enterDown, enterUp, cancelCharge, previewChoice, choosePower, chooseReaim: chooseRe_aim,
    POWER_STEPS, AIM_SPEEDS, LINE_WIDTHS, CHARGE_TIMES,
    on,
    get state() { return state; },
    get paused() { return paused; },
    get mode() { return roundMode; },
    get holeIndex() { return holeIndex; },
    get course() { return course; },
    get courseFile() { return courseFile; },
    get players() { return players; },
    get view() { return view; },
    get ch() { return ch; },
    get aimAngle() { return aimAngle; },
    set aimAngle(v) { aimAngle = v; },
    get power() { return power; },
    get worldT() { return worldT; },
    get testMode() { return testMode; },
    isPlaying() { return ['ready', 'aim', 'charge', 'powerMenu', 'swing', 'shot', 'settle', 'holeOut', 'replay', 'scorecard', 'gator', 'holeIntro', 'courseIntro', 'challengeFail', 'courseEnd'].includes(state); },
    inTurn() { return state === 'ready' || state === 'aim' || state === 'charge' || state === 'powerMenu'; },
    choosePutt, setPutterFocus,
    currentBall() { const p = players[current]; return p && p.ball ? p.ball : null; },
    get current() { return current; },
    debug: { get shot() { return shot; }, computeAutoPower, smartAim: () => smartAim(cur().ball) }
  };
})();
