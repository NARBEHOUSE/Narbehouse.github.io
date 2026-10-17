/** Benny's Sphere Splash - the match, on screen: sim events -> 3D -> choices -> sim.
 *
 * js/sim.js is authoritative and this file only shows it. Each frame it steps the sim
 * in its own fixed ticks (so a replayed seed plays the same match), draws every
 * swimmer between the last two ticks, and turns what happened into sound, pops and
 * commentary. When the sim stops for a decision, play freezes - the clock, and every
 * swimmer where they are - and the choice is laid out on the scene (ui.openWorld):
 *
 *   attack:  Pass · Shoot · Dribble · Tech · Keep swimming, beside the carrier, each
 *            with its odds in words. Pass is two-stage: the brackets then step
 *            through the teammates themselves, a dashed lane runs to each, and every
 *            defender standing in that lane is marked ✕.
 *   defend:  (Attack and defense stops only) Tackle · Block · tackle techniques.
 *
 * The outcome is rolled the moment a choice is made, then acted out. A goal then gets
 * its moment (banner, burst, celebration) and, with Goal Replays on, plays again in slow
 * motion from what js/replay.js recorded of the screen.
 */
SS.game = (function () {
  'use strict';

  const U = SS.util, D = () => SS.DATA, RU = () => SS.DATA.RULES;
  const NUMBERS = { LF: 9, RF: 7, MF: 10, LD: 4, RD: 5, GL: 1 };
  const SKINS = [0xf1c7a1, 0xc68b5f, 0x8d5a3b, 0xe0a987, 0x5e3a28, 0xf6d5b8];
  const HAIR = [0x2a1b10, 0xe9c46a, 0x6b3a1e, 0x111111, 0xb5452b, 0x3a2a1c];
  const SPEED = { slow: 0.65, normal: 1, fast: 1.6 };
  const SAVE_EVERY = 5;               // seconds of live play between saves
  const FIRST = n => String(n).split(' ')[0];

  let scene, camera;
  let m = null, setup = null;          // the sim match, and how it was set up
  let phase = 'menu';                  // menu | kickoff | live | decision | huddle | halftime | fulltime
  let frozen = false;                  // a card (Pause) is over live play
  let acc = 0, sinceSave = 0;
  let swimmers = [], badges = [], ball = null, lane = null, rings = [], ringLinks = null, trail = null;
  let preview = 0, previewPending = false;              // seconds of formation preview left
  let talk = { at: -99, done: {} };                     // the analyst's formation reactions
  const prevP = [], curP = [], prevBall = new THREE.Vector3(), curBall = new THREE.Vector3();
  let kits = [null, null];
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);

  const teamById = id => D().TEAMS.find(t => t.id === id);
  const vec = p => new THREE.Vector3(p.x, p.y, p.z);
  const S = () => m && m.s;
  const numberOf = j => NUMBERS[S().players[j].pos] || j;
  const who = j => { const p = S().players[j]; return p ? FIRST(p.name) : ''; };
  /* Recorded-voice keys (the voice pipeline's clip keys): a player is the slug of the full name, a team of
     its short name, a technique or formation of its name. broadcast.js tries them joined, then one by one. */
  const pk = j => { const p = S().players[j]; return p ? U.slug(p.name) : ''; };
  const tk = i => U.slug(kits[i].short);
  // a formation change is two recordings: Coral's line for this team and shape, then the shape's own description
  const formKeys = (i, f) => ({ tf: tk(i) + '-' + U.slug(f.name), f: U.slug(f.name) });
  const ours = j => S().players[j].team === 0;

  /* ══ building a match on the scene ══════════════════════════════════════ */
  function init(ctx) {
    scene = ctx.scene; camera = ctx.camera;
    ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff6c9 }));
    ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), new THREE.MeshBasicMaterial({
      color: 0xffe066, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })));
    ball.add(new THREE.PointLight(0xffe7a0, 2, 4));
    ball.visible = false;
    scene.add(ball);
    trail = SS.world.makeTrail(scene);
    const laneMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.6, gapSize: 0.35, depthTest: false, transparent: true, opacity: 0.95 });
    lane = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), laneMat);
    lane.renderOrder = 20; lane.visible = false; lane.frustumCulled = false;
    scene.add(lane);
    // Colour profiles (theme.js): the ball, its trail and the pass lane.
    SS.theme.onChange(p => { ball.material.color.set(p.ball); trail.setColours(p.trail, p.trailCore); lane.material.color.set(p.lane); });
    // The formation preview: a ring at each fielder's new spot, facing the camera.
    const ringGeo = new THREE.RingGeometry(1.0, 1.45, 40);
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, side: THREE.DoubleSide }));
      r.renderOrder = 21; r.visible = false; scene.add(r); rings.push(r);
    }
    // ...and a line from each fielder to it, so the team is seen swimming into the shape.
    ringLinks = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 6), 3)),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.5, gapSize: 0.3, transparent: true, opacity: 0, depthTest: false }));
    ringLinks.renderOrder = 21; ringLinks.visible = false; ringLinks.frustumCulled = false; scene.add(ringLinks);
    SS.save.settings.onChange(k => {
      if (m && (k === 'stops' || k === '*')) m.s.stops = SS.save.settings.get('stops');
      if (m && (k === 'difficulty' || k === '*')) m.setBoost(boostOf());
      // A stadium or time of day chosen in Settings shows at once (Random waits for the next match).
      if ((k === 'stadium' || k === 'timeOfDay') && SS.save.settings.get(k) !== 'random') {
        const a = Object.assign({}, SS.world.arena, k === 'stadium' ? { stadium: SS.save.settings.get(k) } : { time: SS.save.settings.get(k) });
        SS.world.setArena(a.stadium, a.time);
        if (m && setup) { setup.arena = a; saveNow(); }
      }
    });
  }

  function inkFor(hex) {
    const c = new THREE.Color(hex);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) > 0.55 ? '#14161f' : '#ffffff';
  }

  function buildScene() {
    teardownScene();
    const s = S();
    // Two teams whose looks read as one: the listed team wears its away kit (data.js CLASHES).
    kits = SS.models.matchKits(teamById(s.teams[0].id), teamById(s.teams[1].id));
    SS.world.setGoalKits(kits[0].kit, kits[1].kit);
    s.players.forEach((pl, j) => {
      const team = kits[pl.team];
      const h = (pl.name.charCodeAt(0) * 7 + pl.name.length * 3 + j) >>> 0;
      const sw = SS.models.makeSwimmer(Object.assign(SS.models.lookFor(team, pl.pos), {
        body: h % 2 ? 'female' : 'male',
        skin: SKINS[h % SKINS.length], hair: HAIR[(h >> 2) % HAIR.length],
      }));
      sw.play('tread'); sw.mixer.update((h % 17) / 10);
      scene.add(sw.group);
      swimmers.push(sw);
      badges.push(SS.worldui.addBadge(sw.head, { number: NUMBERS[pl.pos], team: pl.team, colour: U.hex(team.kit), ink: inkFor(team.kit) }));
      prevP[j] = vec(pl.p); curP[j] = vec(pl.p);
    });
    SS.replay.init(swimmers);
    prevBall.copy(vec(s.ball.p)); curBall.copy(prevBall);
    ball.visible = true;
    SS.hud.setTeams(kits);
    SS.hud.reset();
  }
  function teardownScene() {
    swimmers.forEach(sw => { scene.remove(sw.group); sw.dispose(); });
    swimmers = []; SS.worldui.clearBadges(); badges = [];
    if (ball) ball.visible = false;
    if (trail) trail.clear();
    showLane(null);
  }

  /* ══ starting, saving, leaving ═════════════════════════════════════════ */
  /** Difficulty: how much stronger the player's team plays (sim.js setBoost). */
  const boostOf = () => RU().DIFFICULTY[SS.save.settings.get('difficulty')] || 1;
  function startQuick(ids) {
    let [a, b] = ids || [];
    if (!a) {
      const pool = U.shuffle(D().TEAMS.map(t => t.id));
      a = pool[0]; b = pool[1];
    }
    setup = { mode: 'quick', teams: [a, b], seed: (Math.random() * 2 ** 31) >>> 0, half: RU().HALF_SHORT, arena: newArena() };
    m = SS.sim.create({ teams: [teamById(a), teamById(b)], seed: setup.seed, halfLength: setup.half,
      overtime: false, human: 0, stops: SS.save.settings.get('stops'), aiCoach: true, boost: boostOf() });
    m.advance(RU().TICK);                      // one tick: everyone takes their kickoff places
    begin('kickoff');
  }
  /** This match's stadium and time of day: what Settings asks for, else a random pick. */
  const newArena = () => SS.world.pickArena(SS.save.settings.get('stadium'), SS.save.settings.get('timeOfDay'));
  function begin(kind) {
    SS.broadcast.reset();
    setup.arena = setup.arena || newArena();               // a save from before arenas gets one now
    SS.world.setArena(setup.arena.stadium, setup.arena.time);
    SS.save.lastArena(setup.arena);
    buildScene();
    acc = 0; sinceSave = 0; frozen = false; preview = 0; previewPending = false; talk = { at: -99, done: {} }; gm = null; wipeFx = null; intro = null;
    rings.forEach(r => { r.visible = false; r.material.color.set(kits[0] ? kits[0].kit : 0xffffff); });
    SS.director.setMode('wide', { cut: true });
    if (kind === 'kickoff') { phase = 'kickoff'; SS.ui.setScreen('kickoff'); saveNow(); }
  }
  function kickoff() {
    phase = 'live';
    SS.ui.goLive();
    if (S().phase === 'kickoff' && S().clock === 0 && S().period === 1) startIntro('full');
    else SS.director.setMode('broadcast', { follow: playFocus });
    const t = matchInfo().teams;
    if (S().clock === 0 && S().period === 1) SS.broadcast.say('intro', { home: t[0].name, away: t[1].name, _keys: [U.slug(t[0].short), U.slug(t[1].short)] }, 3);
  }

  function savedMatch() {
    const sv = SS.save.loadMatch();
    if (!sv) return null;
    const a = teamById(sv.setup.teams[0]), b = teamById(sv.setup.teams[1]), sc = sv.snapshot.score;
    if (!a || !b) return null;
    const when = sv.context === 'halftime' ? 'halftime' : sv.snapshot.period > 2 ? 'overtime' : sv.snapshot.period === 2 ? '2nd half' : '1st half';
    return Object.assign(sv, { summary: a.short + ' ' + sc[0] + ' – ' + sc[1] + ' ' + b.short + ' · ' + when });
  }
  function continueSaved() {
    const sv = SS.save.loadMatch();
    if (!sv) { SS.ui.setScreen('title'); return; }
    setup = sv.setup;
    m = SS.sim.restore(sv.snapshot);
    m.s.stops = SS.save.settings.get('stops');
    m.setBoost(boostOf());
    begin('resume');
    if (sv.context === 'halftime') { phase = 'halftime'; SS.director.setMode('orbit'); SS.ui.setScreen('halftime'); return; }
    if (m.pending) { SS.director.setMode('broadcast', { follow: playFocus, cut: true }); enterDecision(true); return; }
    phase = 'kickoff';
    SS.ui.setScreen('kickoff', { resume: true });
  }
  function saveNow() {
    if (!m || m.done || !setup) return;
    SS.save.saveMatch({ setup, snapshot: m.snapshot(), context: phase === 'halftime' ? 'halftime' : 'play' });
  }
  function quitToMenu() {
    saveNow();
    endMatchView();
    SS.ui.setScreen('title');
  }
  function endMatchView() {
    phase = 'menu'; frozen = false; m = null; gm = null; wipeFx = null; intro = null;
    SS.ui.closeWorld();
    teardownScene();
    SS.hud.visible(false); SS.hud.reset();
    SS.broadcast.reset();
    SS.world.setGoalKits(null);
    SS.director.setMode('menu');
  }
  function restartMatch() { startQuick(setup.teams.slice()); }
  function resetProgress() { SS.save.resetAll(); }

  /* ══ the frame ═════════════════════════════════════════════════════════ */
  function update(dt) {
    if (m) {
      if (phase === 'live' && !frozen) stepSim(dt);
      tickDecisionHold();
      drawMatch(dt);
      drawCarrier(dt);
      SS.hud.update(S(), phase !== 'live' || frozen, hudLabels);
    }
    SS.director.update(dt);
  }
  const hudLabels = {
    get formation() { return (kits[0] ? kits[0].short : 'You') + ': ' + formationName(); },
    get theirs() { const s = S(); return s && kits[1] ? kits[1].short + ': ' + (D().FORMATIONS[s.teams[1].formation] || D().FORMATIONS.normal).name : ''; },
    get stops() { return ({ ours: 'Our ball only', both: 'Attack and defense', key: 'Key moments', coach: 'Coach' })[SS.save.settings.get('stops')]; },
    numberOf: j => numberOf(j), kitOf: t => kits[t] ? kits[t].kit : 0xffffff,
  };

  function stepSim(dt) {
    const TICK = RU().TICK;
    if (shotBeat(dt)) return;                          // the shooter's wind-up: the clock waits
    wipeBeat(dt);
    if (introBeat(dt)) return;                         // the kickoff sweep: everyone waits in their places
    if (goalBeat(dt)) return;                          // the scorer's celebration: the kickoff waits
    acc += dt * (SPEED[SS.save.settings.get('speed')] || 1) * shotPace();
    sinceSave += dt;
    let n = 0;
    while (acc >= TICK && phase === 'live' && n++ < 8 && !(cine && cine.hold > 0) && !goalHeld()) {
      acc -= TICK;
      const s = S();
      s.players.forEach((pl, j) => prevP[j].copy(curP[j]));
      prevBall.copy(curBall);
      const evs = m.advance(TICK);
      s.players.forEach((pl, j) => curP[j].set(pl.p.x, pl.p.y, pl.p.z));
      curBall.set(s.ball.p.x, s.ball.p.y, s.ball.p.z);
      evs.forEach(handle);
      if (gm && s.phase !== 'goal') endGoalMoment();
      if (m.pending && phase === 'live') { enterDecision(); break; }
    }
    if (phase !== 'live') acc = 0;
    if (sinceSave > SAVE_EVERY && phase === 'live') { sinceSave = 0; saveNow(); }
    if (phase === 'live') formationTalk();
  }

  function drawMatch(dt) {
    const s = S(), live = phase === 'live' && !frozen;
    if (gm && gm.replay && gm.replay.on) { drawReplay(dt); return; }
    const a = live ? Math.min(1, acc / RU().TICK) : 1;
    drawA = a;
    separate(a, live ? dt : 0);                        // a frozen choice: nobody drifts
    s.players.forEach((pl, j) => {
      const sw = swimmers[j];
      if (!sw) return;
      _v.lerpVectors(prevP[j], curP[j], a).add(sepOff[j]);
      sw.group.position.copy(_v);
      face(sw, pl, dt, live);
      const winding = SS.moves.isShot(sw.move);   // shots are made treading
      if (!sw.busy) sw.play(live && sw.swimming && !winding ? 'swim' : 'tread');
      sw.setCarry(s.ball.owner === j || (!!cine && cine.hold > 0 && cine.shooter === j));
      sw.update(live ? dt : dt * 0.6);
      noteBody(j, sw);
      badges[j].carrier(s.ball.owner === j);
    });
    if (s.ball.owner != null && swimmers[s.ball.owner]) ball.position.copy(swimmers[s.ball.owner].ballPoint);
    else if (cine && cine.hold > 0 && swimmers[cine.shooter]) ball.position.copy(swimmers[cine.shooter].ballPoint);
    else if (cine && cine.stopAt && cine.start && s.ball.flight) ball.position.lerpVectors(cine.start, cine.stopAt, cine.progress());
    else if (cine && cine.stopAt && cine.done >= 0 && s.ball.owner == null) {
      // A punched ball: the sim drops it loose at the aim point; ease it over from the fist.
      if (!cine.after) cine.after = cine.stopAt.clone().sub(curBall);
      ball.position.lerpVectors(prevBall, curBall, a).addScaledVector(cine.after, 1 - Math.min(1, (cine.t - cine.done) / 0.35));
    }
    else if (cine && cine.via && cine.start && s.ball.flight) {
      const pr = cine.progress(), u = cine.viaU;
      if (pr < u) ball.position.lerpVectors(cine.start, cine.via, pr / u);
      else ball.position.lerpVectors(cine.via, cine.to, (pr - u) / Math.max(1e-3, 1 - u));
    }
    else if (cine && cine.offset && s.ball.flight) {
      ball.position.lerpVectors(prevBall, curBall, a);
      ball.position.addScaledVector(cine.offset, 1 - Math.min(1, s.ball.flight.t / s.ball.flight.dur));
    }
    else if (gm && s.ball.owner == null && !s.ball.flight) ball.position.copy(gm.net);   // a goal stays in the net
    else if (passFx && s.ball.flight === passFx.flight) {
      // A pass leaves from the passer's hand, not their middle.
      ball.position.lerpVectors(prevBall, curBall, a);
      ball.position.addScaledVector(passFx.offset, 1 - Math.min(1, (s.ball.flight.t - (1 - a) * RU().TICK) / s.ball.flight.dur));
    }
    else ball.position.lerpVectors(prevBall, curBall, a);
    if (lane.visible) lane.material.dashOffset -= dt * 1.2;
    drawPreview(dt);
    fadeBlockers(dt);
    if (live) SS.replay.record(dt, ball.position, s.ball.owner);
  }

  /* ══ room to see everyone ════════════════════════════════════════════
     The match lets players share the same water; on screen that was a defender standing
     on a passer (Bryan, 2026-10-03). Each body is a line from head to feet (as it was drawn
     last frame, relative to where it stands, so a nudge never feeds back into itself); any
     two lines closer than SEP_MIN as the camera sees them (arms and legs reach ~0.5 m off the line) are nudged apart, eased so nobody jumps, never
     more than SEP_MAX. The ball's player, whoever the ball is flying to, and a shot's
     shooter and keeper hold still (the ball is drawn to them); the other one moves the
     whole way. A player in a move that is meant to touch (a tackle, a catch, a save) keeps
     the nudge they had and is left out. Display only: the match never sees it. */
  const CONTACT = new Set(['tackle', 'knocked', 'catch', 'dodge', 'block', 'keeper']);
  const SEP_MIN = 1.05, SEP_MAX = 1.0, sepOff = [], sepWant = [], _sepP = [], segH = [], segF = [];
  const _sd = new THREE.Vector3(), _a0 = new THREE.Vector3(), _a1 = new THREE.Vector3(), _b0 = new THREE.Vector3(), _b1 = new THREE.Vector3();
  const _view = new THREE.Vector3(), _ca = new THREE.Vector3(), _cb = new THREE.Vector3(), _u1 = new THREE.Vector3(), _u2 = new THREE.Vector3(), _r = new THREE.Vector3();
  /** Closest points of segments p0-p1 and q0-q1 into _ca, _cb (the standard clamp method). */
  function closest(p0, p1, q0, q1) {
    _u1.subVectors(p1, p0); _u2.subVectors(q1, q0); _r.subVectors(p0, q0);
    const a = _u1.lengthSq(), e = _u2.lengthSq(), f = _u2.dot(_r), c = _u1.dot(_r), b = _u1.dot(_u2), den = a * e - b * b;
    let sN = den > 1e-8 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
    let tN = e > 1e-8 ? (b * sN + f) / e : 0;
    if (tN < 0) { tN = 0; sN = a > 1e-8 ? THREE.MathUtils.clamp(-c / a, 0, 1) : 0; }
    else if (tN > 1) { tN = 1; sN = a > 1e-8 ? THREE.MathUtils.clamp((b - c) / a, 0, 1) : 0; }
    _ca.copy(p0).addScaledVector(_u1, sN); _cb.copy(q0).addScaledVector(_u2, tN);
  }
  /** After drawing: remember each body's head and feet relative to where it stands. */
  function noteBody(j, sw) {
    if (!segH[j]) { segH[j] = new THREE.Vector3(); segF[j] = new THREE.Vector3(); }
    sw.head.getWorldPosition(segH[j]);
    sw.pelvis.getWorldPosition(segF[j]);
    segF[j].addScaledVector(_sd.subVectors(segF[j], segH[j]), 0.8);   // the feet: on past the hips
    segH[j].sub(sw.group.position); segF[j].sub(sw.group.position);
  }
  function separate(a, dt) {
    const s = S(), n = s.players.length, k = 1 - Math.exp(-dt * 6), f = s.ball.flight;
    const held = j => j === s.ball.owner || (f && j === f.catcher) || (!!cine && (j === cine.shooter || j === cine.keeper));
    const touching = j => !!(swimmers[j] && swimmers[j].move && CONTACT.has(swimmers[j].move.name));
    for (let i = 0; i < n; i++) {
      (_sepP[i] || (_sepP[i] = new THREE.Vector3())).lerpVectors(prevP[i], curP[i], a);
      (sepWant[i] || (sepWant[i] = new THREE.Vector3())).set(0, 0, 0);
      if (!sepOff[i]) sepOff[i] = new THREE.Vector3();
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (_sepP[i].distanceToSquared(_sepP[j]) > 9) continue;                 // 3 m: bodies can't touch
      if (!segH[i] || !segH[j] || touching(i) || touching(j)) continue;
      // Measured as the camera sees them, not through the water: both bodies flattened onto
      // the plane across the view, so two a metre apart along the line of sight, or lying
      // head to feet along the screen, still count as touching.
      _view.addVectors(_sepP[i], _sepP[j]).multiplyScalar(0.5).sub(camera.position).normalize();
      const flat = (v, from, off) => v.addVectors(from, off).addScaledVector(_view, -_r.subVectors(v.addVectors(from, off), camera.position).dot(_view));
      closest(flat(_a0, _sepP[i], segH[i]), flat(_a1, _sepP[i], segF[i]), flat(_b0, _sepP[j], segH[j]), flat(_b1, _sepP[j], segF[j]));
      _sd.subVectors(_cb, _ca);
      let d = _sd.length();
      if (d >= SEP_MIN) continue;
      if (d < 1e-3) _sd.set(Math.cos(i * 2.4 + j), 0, Math.sin(i * 2.4 + j)); else _sd.divideScalar(d);
      const push = SEP_MIN - d, hi = held(i), hj = held(j);
      if (hi && hj) continue;
      const wi = hi ? 0 : hj ? 1 : 0.5;
      sepWant[i].addScaledVector(_sd, -push * wi);
      sepWant[j].addScaledVector(_sd, push * (1 - wi));
    }
    for (let i = 0; i < n; i++) {
      if (touching(i)) continue;
      if (sepWant[i].length() > SEP_MAX) sepWant[i].setLength(SEP_MAX);
      sepOff[i].lerp(sepWant[i], k);
    }
  }

  /* ══ a pass ═══════════════════════════════════════════════════════════
     The passer pushes it out with one arm (moves.js pass), the ball leaving from the hand;
     whoever it is going to reaches for it: the teammate, or a defender lunging to pick it
     off; a defender who blocks it gets an arm to it. All display. */
  let passFx = null;                  // { flight, offset }: the ball's start, eased out over the flight
  function startPass(e) {
    const s = S(), f = s.ball.flight, sw = swimmers[e.player];
    if (!f) return;
    if (sw) {
      sw.setMove('pass', { to: vec(e.to) });
      passFx = { flight: f, offset: sw.ballPoint.clone().sub(prevBall) };
    }
    const progress = () => (S() && S().ball.flight === f ? Math.min(1, f.t / f.dur) : 1);
    if ((e.result === 'caught' || e.result === 'intercepted') && e.by != null && swimmers[e.by]) {
      swimmers[e.by].setMove('catch', { ball: ball.position, progress, lunge: e.result === 'intercepted' });
    } else if (e.result === 'blocked' && e.by != null && swimmers[e.by]) {
      swimmers[e.by].setMove('block', { to: vec(e.to), ball: ball.position, result: 'blocked', progress });
    }
  }

  /* ══ a shot, as a moment ═════════════════════════════════════════════
     The shot is what a match turns on, and at full speed it is over in under half a
     second (5 m at 13 m/s). So every shot, ours or theirs, gets a beat: the shooter winds
     up while the clock waits, the ball flies in slow motion, and with Shot Camera on
     Cinematic the camera comes in behind the shooter, looking at the goal, then swings to
     the ball and the keeper as it arrives. All display: the sim decided the shot when it
     was taken, and nothing here changes what it decided (or the saved match). */
  const WINDUP = 0.6, SLOWMO = 0.4, SLOW_TAIL = 0.35, SHOT_HOLD = 1.1;
  const TECH_PRE = 0.5;               // a technique shot: the shooter holds this long first, so its name can be read
  // Each family of technique shot has its own kick (moves.js); the status shots volley.
  const TECH_MOVE = { beaminBlast: 'flip', beaminBlast2: 'flip', spinShot: 'spin', ghostShot: 'scorpion' };
  const shotMove = e => e.tech ? TECH_MOVE[e.tech] || 'kick' : 'throw';
  let cine = null;                    // { t, hold, shooter, keeper, from, to, done, cross, stopAt }
  let drawA = 1;                      // this frame's blend between sim ticks
  const _prog = new THREE.Vector3();
  const shotCinematic = () => SS.save.settings.get('shotCam') !== 'steady' && !U.reducedMotion();   // reduced motion: always steady
  function startShotMoment(e) {
    const s = S(), sh = s.players[e.player];
    const mv = shotMove(e);
    cine = { t: 0, hold: SS.moves.RELEASE[mv] || WINDUP, pre: e.tech ? TECH_PRE : 0, shooter: e.player, keeper: s.players.findIndex(p => p.team !== sh.team && p.pos === 'GL'),
      from: curP[e.player].clone(), to: vec(e.to), done: -1, offset: null, recAt: SS.replay.now };
    if (shotCinematic()) SS.director.setMode('shot', { shot: shotFrame });
    // The moves (moves.js): the shooter throws, the keeper or a blocker goes for it.
    // How far along its path the ball is, smooth between sim ticks (slow motion ticks slowly).
    const d = cine.to.clone().sub(cine.from), L2 = d.lengthSq() || 1;
    const progress = () => {
      if (!cine || cine.hold > 0) return 0;
      if (!S() || !S().ball.flight) return 1;
      _prog.lerpVectors(prevBall, curBall, drawA).sub(cine.from);
      return THREE.MathUtils.clamp(_prog.dot(d) / L2, 0, 1);
    };
    cine.progress = progress;
    const shooter = swimmers[e.player];
    if (shooter) {
      shooter.faceTarget = cine.to;
      if (cine.pre > 0) cine.pendingMove = () => shooter.setMove(mv, { to: cine.to });   // after the technique's name is up
      else shooter.setMove(mv, { to: cine.to });
    }
    const keeper = swimmers[cine.keeper];
    if (keeper && (e.result === 'goal' || e.result === 'catch' || e.result === 'parry')) {
      // Where the ball crosses the keeper: the point of its path nearest their chest. The
      // aim point is the goal, behind them (1.5 m on average), so that is never where they
      // reach. A save stops the ball there, in the keeper's hands; a goal flies on past.
      const kc = keeper.chest.getWorldPosition(new THREE.Vector3());
      const u = THREE.MathUtils.clamp(kc.sub(cine.from).dot(d) / L2, 0.05, 1);
      cine.cross = cine.from.clone().addScaledVector(d, u);
      if (e.result !== 'goal') cine.stopAt = cine.cross;
      else {
        // A goal beats the keeper, so it must not fly through them (Bryan's catch: the ball
        // passed through a keeper who barely moved). Its path bends to pass at least 0.9 m
        // from their chest, on the side it was aimed, and the keeper reaches for it there.
        const kc2 = keeper.chest.getWorldPosition(new THREE.Vector3());
        const off = cine.cross.clone().sub(kc2), dn = d.clone().normalize();
        off.addScaledVector(dn, -off.dot(dn));                     // across the path only
        if (off.lengthSq() < 0.04) off.set(cine.to.x - kc2.x, 0, 0).addScaledVector(dn, -dn.x * (cine.to.x - kc2.x));
        if (off.lengthSq() < 1e-4) off.set(1, 0, 0);
        if (off.length() < 0.9) off.setLength(0.9);
        cine.via = kc2.add(off); cine.viaU = u;
        cine.cross = cine.via;
      }
      const reachAt = e.result === 'goal' ? u : 1;
      keeper.setMove('keeper', { to: cine.cross, ball: ball.position, result: e.result, progress: () => Math.min(1, progress() / reachAt) });
      keeper.faceTarget = cine.from;
    }
    if ((e.result === 'blocked' || e.result === 'intercepted') && e.by != null && swimmers[e.by]) {
      swimmers[e.by].setMove('block', { to: cine.to, ball: ball.position, result: e.result, progress });
    }
  }
  function endShotMoment() {
    if (!cine) return;
    [cine.shooter, cine.keeper].forEach(j => { if (swimmers[j]) swimmers[j].faceTarget = null; });
    cine = null;
  }
  /** True while the wind-up holds the clock. Also ends the moment once it has played out. */
  function shotBeat(dt) {
    if (!cine) return false;
    cine.t += dt;
    if (cine.pre > 0) {
      cine.pre -= dt;
      acc = 0;
      if (cine.pre > 0) return true;
      if (cine.pendingMove) { cine.pendingMove(); cine.pendingMove = null; }
      return true;
    }
    if (cine.hold > 0) {
      cine.hold -= dt;
      acc = 0;
      if (cine.hold > 0) return true;
      // Released: the ball leaves from the shooter's hand, not the body's centre.
      const sw = swimmers[cine.shooter];
      cine.offset = sw ? sw.ballPoint.clone().sub(curBall) : null;
      cine.start = sw ? sw.ballPoint.clone() : curBall.clone();
      cine.recRelease = SS.replay.now;
      SS.audio.play('shot');
      return false;
    }
    if (cine.done < 0 && !S().ball.flight) cine.done = cine.t;
    if (cine.done >= 0 && cine.t - cine.done > (gm ? GOAL_CAM_AT : SHOT_HOLD)) {
      endShotMoment();
      if (SS.director.mode === 'shot') {
        if (gm) { gm.cam = 'goal'; SS.director.setMode('goal', { star: starPoint }); }
        else SS.director.setMode('broadcast', { follow: playFocus });
      }
    }
    return false;
  }
  /** Slow motion while the shot is in the air, easing back to full speed after it lands. */
  function shotPace() {
    if (!cine || cine.hold > 0) return 1;
    if (cine.done < 0) return SLOWMO;
    return SLOWMO + (1 - SLOWMO) * Math.min(1, (cine.t - cine.done) / SLOW_TAIL);
  }
  /** What the shot camera frames: stage 0 behind the shooter, stage 1 the ball and keeper. */
  const _keeperAt = new THREE.Vector3(), _shotTo = new THREE.Vector3();
  function shotFrame() {
    if (!cine) return null;
    const f = S() && S().ball.flight, prog = cine.hold > 0 ? 0 : f ? f.t / f.dur : 1;
    const k = swimmers[cine.keeper];
    _keeperAt.copy(k ? k.group.position : cine.to);
    _shotTo.copy(cine.to);
    return { from: cine.from, to: _shotTo, ball: ball.position, keeper: _keeperAt, stage: prog < 0.5 ? 0 : 1 };
  }

  /* ══ a goal, as a moment ═════════════════════════════════════════════
     The shot moment flows straight into it. The banner sweeps across in the scorers'
     kit, the net bursts (world.goalBurst), and with Shot Camera on Cinematic the camera
     leaves the goal mouth for the scorer, who turns to it and celebrates (moves.js) while
     nearby teammates cheer. The sim's own pause after a goal is three seconds; the
     kickoff waits until the celebration has played out (display only: the clock is
     stopped after a goal anyway). Then one cut, to the wide view, so nobody is seen
     jumping back to their kickoff places. */
  const GOAL_CAM_AT = 0.7, CELEBRATE_AT = 0.9, GOAL_MOMENT = CELEBRATE_AT + SS.moves.CELEBRATE.end + 0.2;
  let gm = null;                      // { t, scorer, team, net, started, cheers }
  const _star = new THREE.Vector3();
  function startGoalMoment(e) {
    const s = S(), kit = kits[e.team], other = kits[1 - e.team];
    gm = { t: 0, scorer: e.player, team: e.team, started: false,
      net: cine && cine.to ? cine.to.clone() : curBall.clone(), cheers: [],
      recShot: cine ? cine.recAt : null, recRelease: cine && cine.recRelease != null ? cine.recRelease : SS.replay.now, recGoal: SS.replay.now };
    const sc = e.team === 0 ? [kit, other] : [other, kit];
    SS.hud.goalBanner({ kit: kit.kit, accent: kit.accent, who: '#' + numberOf(e.player) + ' ' + who(e.player),
      score: sc[0].short + ' ' + s.score[0] + ' – ' + s.score[1] + ' ' + sc[1].short });
    SS.world.goalBurst(gm.net, kit.kit);
    // The teammates near the scorer join in, one after another.
    s.players.forEach((pl, j) => {
      if (j === e.player || pl.team !== e.team || pl.pos === 'GL') return;
      if (curP[j].distanceTo(curP[e.player]) < 9) gm.cheers.push({ j, at: CELEBRATE_AT + 0.2 + gm.cheers.length * 0.2 });
    });
  }
  /** Runs the celebration's beats; never holds the clock itself (goalHeld holds the kickoff). */
  function goalBeat(dt) {
    if (!gm) return false;
    gm.t += dt;
    const sw = swimmers[gm.scorer];
    if (sw && !gm.started && gm.t >= CELEBRATE_AT && !SS.moves.isShot(sw.move)) {
      gm.started = true;
      sw.setMove('celebrate');
    }
    if (sw && gm.started) sw.faceTarget = camera.position;            // the scorer plays to the camera
    gm.cheers.forEach(c => { if (!c.done && gm.t >= c.at && swimmers[c.j]) { c.done = true; swimmers[c.j].once('cheer'); } });
    if (gm.t >= GOAL_MOMENT && !gm.replay && !gm.release) {
      if (!startReplay()) release();
    }
    if (gm.replay) replayBeat(dt);
    return false;
  }
  /** Let the sim go on to the kickoff now (the tick that does it runs this frame). */
  function release() { gm.release = true; acc = RU().TICK; }
  /** The next tick would end the sim's goal pause: wait while the celebration plays. */
  function goalHeld() {
    const s = S();
    if (!gm || gm.release || s.phase !== 'goal' || s.phaseT + RU().TICK < 3 - 1e-6) return false;
    acc = 0;
    return true;
  }
  function endGoalMoment() {
    const sw = swimmers[gm.scorer];
    if (sw) { sw.faceTarget = null; if (sw.move && sw.move.name === 'celebrate') sw.setMove(null); }
    if (gm.replay) swimmers.forEach(w => w.setTilt(_qid, _zero));       // a replayed lean is not this moment's
    gm = null;
    SS.hud.hideBanner(); SS.hud.replayTag(false);
    // Everyone has just been put back in their kickoff places: cut, don't sweep.
    S().players.forEach((pl, j) => prevP[j].copy(curP[j]));
    prevBall.copy(curBall);
    if (phase === 'live') SS.director.setMode('wide', { cut: true });
  }
  function starPoint() { const sw = gm && swimmers[gm.scorer]; return sw ? sw.chest.getWorldPosition(_star) : null; }
  const _qid = new THREE.Quaternion(), _zero = new THREE.Vector3();

  /* ══ the goal again: the replay ═══════════════════════════════════════
     After the celebration (Goal Replays on): a wipe in the scorers' colours, and under
     it the cut to the replay - the build-up in slow motion (REPLAY_LEAD seconds of it,
     at REPLAY_SLOW), then the shot at the pace it was seen, already slow, the net
     bursting again, and REPLAY_TAIL after. A REPLAY tag stays up the whole time. Any
     press skips it (openHuddle). A second wipe covers the cut to the wide view for the
     kickoff. The sim waits throughout (goalHeld). */
  const REPLAY_LEAD = 1.8, REPLAY_TAIL = 1.0, REPLAY_SLOW = 0.55, WIPE_SECS = 0.7;
  let wipeFx = null;                  // { t, kit, accent, mid, midDone }
  function startReplay() {
    if (SS.save.settings.get('replays') === false || gm.recShot == null) return false;
    const from = Math.max(SS.replay.earliest(), gm.recShot - REPLAY_LEAD), to = gm.recGoal + REPLAY_TAIL;
    if (gm.recGoal - from < 0.5) return false;           // nothing recorded worth showing (a restored save)
    gm.replay = { on: false, rt: from, from, to, burst: false, shotSound: false };
    startWipe(kits[gm.team], () => {
      if (!gm || !gm.replay) return;
      if (gm.replay.skip) { release(); return; }          // skipped before it began: straight to the kickoff
      gm.replay.on = true;
      SS.hud.hideBanner(); SS.hud.replayTag(true);
      replayCamera();
    });
    return true;
  }
  function replayBeat(dt) {
    const r = gm.replay;
    if (!r.on) return;
    if (r.skip) r.rt = r.to;
    // Slow through the build-up, then the shot at its own (already slowed) pace.
    const rate = THREE.MathUtils.lerp(REPLAY_SLOW, 1, THREE.MathUtils.smoothstep(r.rt, gm.recShot - 0.3, gm.recShot));
    r.rt = Math.min(r.to, r.rt + dt * rate);
    if (!r.shotSound && r.rt >= gm.recRelease) { r.shotSound = true; if (!r.skip) SS.audio.play('shot', 0.6); }
    if (!r.burst && r.rt >= gm.recGoal) { r.burst = true; if (!r.skip) { SS.world.goalBurst(gm.net, kits[gm.team].kit, { ring: false }); SS.audio.play('goal', 0.5); } }
    if (r.rt >= r.to && !r.ending) {
      r.ending = true;
      startWipe(kits[gm.team], () => { if (gm && gm.replay) { gm.replay.on = false; release(); } });
    }
  }
  function drawReplay(dt) {
    const owner = SS.replay.pose(gm.replay.rt, ball.position);
    swimmers.forEach((sw, j) => badges[j].carrier(owner === j));
    replayOwner = owner;
    fadeBlockers(dt);
  }
  /* The ball carrier glows (a gold band round their outline, Bryan's pick of four marks)
     and a loose ball draws its trail, live or in a replay. */
  let replayOwner = null;
  function drawCarrier(dt) {
    const s = S(), rep = gm && gm.replay && gm.replay.on;
    const owner = rep ? replayOwner : s.ball.owner;
    const holder = owner != null ? owner : (!rep && cine && cine.hold > 0 ? cine.shooter : null);
    swimmers.forEach((sw, j) => sw.setGlow(j === holder));
    trail.update(dt, ball.position, camera, holder == null && ball.visible);
  }
  /** What the replay camera follows: the ball, and the goal once the shot is away. */
  const _repTo = new THREE.Vector3();
  function replayFocus() {
    const r = gm && gm.replay;
    const flying = r && r.rt >= gm.recRelease && r.rt < gm.recGoal;
    return { ball: ball.position, to: flying ? _repTo.copy(gm.net) : null };
  }
  function replayCamera() { SS.director.setMode('replay', { follow: replayFocus, dir: SS.ai.dirOf(gm.team), cut: true }); }
  /** A press during the replay skips it (true = the press was used). */
  function skipReplay() {
    if (!gm || !gm.replay) return false;
    gm.replay.skip = true;
    return true;
  }
  function startWipe(kit, mid) { wipeFx = { t: 0, mid, midDone: false }; SS.hud.wipe(0, kit.kit, kit.accent); }
  function wipeBeat(dt) {
    if (!wipeFx) return;
    wipeFx.t += dt;
    const p = Math.min(1, wipeFx.t / WIPE_SECS);
    SS.hud.wipe(p);
    if (!wipeFx.midDone && p >= 0.5) { wipeFx.midDone = true; wipeFx.mid(); }
    if (p >= 1) { SS.hud.wipe(null); wipeFx = null; }
  }

  /* ══ the kickoff sweep ════════════════════════════════════════════════
     The start of a match: the camera dives into the pool past our lineup (their plate
     slides in, bottom left), across past theirs (bottom right), and lands where live play
     starts, just as the whistle goes. The second half: a shorter drop, with a "Second
     Half" plate and the score. Everyone waits in their places (the sim holds) until the
     last KO_LEAD seconds, which are the sim's own kickoff count. Any press skips it. */
  const INTRO = { full: 6.5, second: 3.6 }, KO_LEAD = 1.4;
  let intro = null;                   // { kind, t, dur }
  const easeIO = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  function startIntro(kind) {
    intro = { kind, t: 0, dur: INTRO[kind] };
    SS.hud.clearPops();                                  // (a halftime formation pop would sit on the plate)
    const it = intro;
    // Reduced motion: no sweep. The wide view holds while the plates show, then cuts in.
    if (U.reducedMotion()) { intro.still = true; SS.director.setMode('wide'); return; }
    SS.director.setMode('intro', { kind, at: () => easeIO(it.t / it.dur) });
  }
  function introBeat(dt) {
    if (!intro) return false;
    intro.t += dt;
    const f = intro.t / intro.dur, u = easeIO(f), s = S();
    if (intro.kind === 'full') {
      // By where the camera is on its path (u), not the clock: each plate is up while the
      // camera passes that team (keyframes at u = 0.5 and 0.75).
      const side = u > 0.4 && u < 0.62 ? 0 : u >= 0.62 && u < 0.88 ? 1 : -1;
      SS.hud.teamPlate(side < 0 ? null : { name: kits[side].name, kit: kits[side].kit, accent: kits[side].accent,
        side: side ? 'right' : 'left', round: !side,
        sub: (side ? '' : 'You · ') + (D().FORMATIONS[s.teams[side].formation] || D().FORMATIONS.normal).name + ' formation' });
    } else {
      SS.hud.teamPlate(f > 0.12 && f < 0.85 ? { name: 'Second Half', kit: 0x1d2a4a, accent: 0xffd400, side: 'centre',
        sub: kits[0].short + ' ' + s.score[0] + ' – ' + s.score[1] + ' ' + kits[1].short } : null);
    }
    if (intro.t >= intro.dur) { endIntro(); return false; }
    if (intro.t < intro.dur - KO_LEAD) { acc = 0; return true; }
    return false;
  }
  function endIntro() {
    const still = intro && intro.still;
    intro = null;
    SS.hud.teamPlate(null);
    SS.director.setMode('broadcast', { follow: playFocus, cut: still });
  }

  /* ══ a technique's flourish ═══════════════════════════════════════════
     Its name in giant type on a burst of its colour (hud.techFlourish), and a sparkle
     burst of the same colour round the player (world.techBurst). One colour per family,
     so Ben can learn them by colour: stings violet, snoozes sky blue, wilts gold-brown,
     Beamin' Blasts yellow; the rest their own, or the team's kit. */
  const TECH_FX_STATUS = { poison: 0xb46cff, sleep: 0x6fc3ff, wilt: 0xc99a3a };
  const TECH_FX = { beaminBlast: 0xffd23f, beaminBlast2: 0xffd23f, spinShot: 0xff8a3d, ghostShot: 0x9ff7ee, longPass: 0x8fe3ff,
    drainTackle: 0xff4f6d, bruiserBash: 0xff6a3d, slipStream: 0x4fe0c0, toughShell: 0x7ddc5a, superSave: 0xfff1a0, reboundShot: 0xffa94d };
  const _fxAt = new THREE.Vector3();
  function techFlourish(e, t) {
    const pl = S().players[e.player], kit = kits[pl.team];
    const colour = TECH_FX[e.tech] || TECH_FX_STATUS[t.status] || kit.kit;
    SS.hud.clearPops();
    SS.hud.techFlourish({ name: t.name, who: '#' + numberOf(e.player) + ' ' + who(e.player), colour, kit: kit.kit });
    const sw = swimmers[e.player];
    if (sw) SS.world.techBurst(sw.chest.getWorldPosition(_fxAt).clone(), colour, camera.quaternion);
  }

  /** What the live camera follows: the ball, and where a pass or shot in the air is headed. */
  const _headed = new THREE.Vector3();
  function playFocus() {
    const f = S() && S().ball.flight;
    return { ball: ball.position, to: f ? _headed.set(f.to.x, f.to.y, f.to.z) : null };
  }

  /* Nobody blocks the view. With the camera in close, a swimmer can drift up near the
     lens and fill the screen (anyone at under half the ball's distance looks twice the
     carrier's size), or sit between the camera and the ball. The first fades out
     completely, the second to a ghost. The carrier never fades, nor does anyone who is
     part of the choice on screen (a pass target, a defender marked ✕). */
  const NEAR_FROM = 0.35, NEAR_TO = 0.65, BLOCK_R = 1.4;       // near fade, as shares of the ball's distance
  const _ray = new THREE.Vector3(), _off = new THREE.Vector3();
  function fadeBlockers(dt) {
    const s = S(), cam = camera.position;
    const subject = gm && SS.director.mode === 'goal' ? starPoint() : null;     // the scorer, close up
    _ray.copy(subject || ball.position).sub(cam);
    const len = _ray.length();
    _ray.divideScalar(len || 1);
    const k = 1 - Math.exp(-dt * 8);
    swimmers.forEach((sw, j) => {
      if (!sw) return;
      const el = badges[j].el, keep = el.classList.contains('candidate') || el.classList.contains('blocker')
        || (!!cine && (j === cine.shooter || j === cine.keeper))           // a shot's two players stay solid
        || (!!gm && j === gm.scorer);
      let want = 1;
      if (s.ball.owner !== j && !keep) {
        _off.copy(sw.group.position).sub(cam);
        want = THREE.MathUtils.smoothstep(_off.length(), Math.max(2, len * NEAR_FROM), Math.max(3.5, len * NEAR_TO));
        const along = _off.dot(_ray);
        if (along > 0 && along < len - 1.5) {
          const miss = _off.addScaledVector(_ray, -along).length();
          want = Math.min(want, 0.25 + 0.75 * THREE.MathUtils.smoothstep(miss, BLOCK_R * 0.5, BLOCK_R));
        }
      }
      sw.fade = sw.fade == null ? want : sw.fade + (want - sw.fade) * k;
      if (sw.fade > 0.99) sw.fade = 1;
      sw.setOpacity(sw.fade);
      el.style.opacity = keep || sw.fade === 1 ? '' : Math.max(0.15, sw.fade).toFixed(2);
    });
  }

  /* How a swimmer turns. Bryan saw treading swimmers "spinning in place": they turned to
     face the ball every frame, and the ball moves fast, so everyone near it swivelled
     (46-92 degrees a second on average), and a swimmer slowing down flipped between facing
     its swim and facing the ball. Now:
      - swimming (over TURN_SWIM m/s, or still over TURN_KEEP once swimming): face the swim;
      - treading: keep facing where they are, and only turn to the ball once it is well off
        to one side (TURN_DEADZONE) - then turn calmly, and stop once it is in front again;
      - every turn is rate-limited, so nobody ever whips round. */
  const TURN_SWIM = 1.0, TURN_KEEP = 0.5, TURN_DEADZONE = Math.PI / 3;
  const TURN_RATE_SWIM = 3.5, TURN_RATE_TREAD = 1.2;     // radians per second
  const _fwd = new THREE.Vector3(), _to = new THREE.Vector3(), _look = new THREE.Vector3();
  function face(sw, pl, dt, live) {
    const speed = Math.hypot(pl.v.x, pl.v.y, pl.v.z), p = sw.group.position;
    if (sw.faceTarget) {
      // A shot's players square up to it: the shooter to the goal, the keeper to the shooter.
      _to.subVectors(sw.faceTarget, p).setY(0);
      if (_to.lengthSq() > 0.01) {
        _look.copy(p).add(_to);
        _m4.lookAt(_look, p, _up); _q.setFromRotationMatrix(_m4);
        sw.group.quaternion.rotateTowards(_q, 6 * dt);
      }
      sw.swimming = false;
      return;
    }
    sw.swimming = speed > (sw.swimming ? TURN_KEEP : TURN_SWIM);
    let rate = TURN_RATE_TREAD;
    if (sw.swimming) {
      // A gentle pitch only: swimmers level off rather than diving nose-first.
      _look.set(pl.v.x, Math.max(-0.5, Math.min(0.5, pl.v.y / Math.max(speed, 1e-3))) * Math.hypot(pl.v.x, pl.v.z), pl.v.z).add(p);
      rate = TURN_RATE_SWIM;
      sw.watching = false;
    } else {
      _to.subVectors(ball.position, p).setY(0);
      if (_to.lengthSq() < 0.25) return;                 // the ball is right on top of them: nothing to turn to
      _fwd.set(0, 0, 1).applyQuaternion(sw.group.quaternion).setY(0);
      const off = _fwd.lengthSq() > 1e-6 ? _fwd.angleTo(_to) : Math.PI;
      if (off > TURN_DEADZONE) sw.watching = true;         // the ball has gone well out of view: turn to it
      else if (off < 0.2) sw.watching = false;            // facing it again: settle
      if (!sw.watching) { levelOff(sw, dt); return; }
      _look.copy(p).add(_to);
    }
    if (_look.distanceToSquared(p) < 1e-4) return;
    // Matrix4.lookAt points -Z at its second argument; with the arguments swapped, +Z
    // (the way a swimmer faces) points at the target, like Object3D.lookAt.
    _m4.lookAt(_look, p, _up); _q.setFromRotationMatrix(_m4);
    sw.group.quaternion.rotateTowards(_q, rate * (live ? dt : dt * 0.5));
  }
  /** A treading swimmer eases upright (any pitch left from swimming goes), keeping its heading. */
  function levelOff(sw, dt) {
    _fwd.set(0, 0, 1).applyQuaternion(sw.group.quaternion).setY(0);
    if (_fwd.lengthSq() < 1e-6) return;
    _look.copy(sw.group.position).add(_fwd);
    _m4.lookAt(_look, sw.group.position, _up); _q.setFromRotationMatrix(_m4);
    sw.group.quaternion.rotateTowards(_q, TURN_RATE_TREAD * dt);
  }

  /* ══ what happened ═════════════════════════════════════════════════════ */
  const say = (f, slots, p) => SS.broadcast.say(f, slots, p);
  /** The clip keys a score is spoken from: team, number, team, number (script lines' parts). */
  function scoreKeys() {
    const s = S();
    return { t0: tk(0), n0: U.slug(U.numWord(s.score[0])), t1: tk(1), n1: U.slug(U.numWord(s.score[1])) };
  }
  function scoreWords() {
    const s = S(), t = kits;
    return t[0].short + ' ' + U.numWord(s.score[0]) + ', ' + t[1].short + ' ' + U.numWord(s.score[1]);
  }
  function handle(e) {
    try { handleEvent(e); } catch (err) { console.error('event ' + e.type + ':', err); }
  }
  function handleEvent(e) {
    const s = S(), team = j => kits[s.players[j].team].short;
    switch (e.type) {
      case 'kickoff':
        SS.replay.clear();                               // everyone was just put in place: nothing before this replays
        SS.audio.play('whistle'); say('kickoff', { team: kits[e.team].short, _keys: [tk(e.team)] }, 1);
        if (SS.director.mode === 'wide' && phase === 'live') SS.director.setMode('broadcast', { follow: playFocus });   // after a goal's cut
        break;
      case 'pass': startPass(e); SS.audio.play('pass'); break;
      case 'shot':
        startShotMoment(e);                              // its sound plays on the release (shotBeat)
        SS.audio.crowd('swell');
        say('shot', { player: who(e.player), _keys: [pk(e.player)] }, 2);
        break;
      case 'catch': SS.audio.play('catch'); say('pass', { player: who(e.from), target: who(e.player), _keys: [pk(e.player)] }, 1); break;
      case 'intercept':
        SS.audio.play('catch');
        SS.hud.pop('Intercepted!', ours(e.player) ? 'good' : 'bad', 2);
        say('intercept', { player: who(e.player), team: team(e.player), _keys: [pk(e.player), tk(s.players[e.player].team)], _k: { tk: tk(s.players[e.player].team) } }, 3);   // a must-say call: the shot just called must not silence it
        if (Math.random() < 0.35) say('interceptColor', {}, 1);
        break;
      case 'loose':
        if (e.result === 'blocked' && e.by != null) { SS.audio.play('block'); if (cine) SS.audio.crowd('groan'); SS.hud.pop('Blocked!', ours(e.by) ? 'good' : 'bad', 2); say('blocked', { player: who(e.by), _keys: [pk(e.by)] }, 2); }
        else if (e.result === 'short') say('short', {}, 1);
        else say('loose', {}, 1);
        break;
      case 'dribble':
        // A carrier who breaks free rolls out of it, away from the nearest tackler.
        if (e.result === 'kept' && swimmers[e.player] && (e.hits || []).length) {
          const near = e.hits.slice().sort((a, b) => curP[a].distanceTo(curP[e.player]) - curP[b].distanceTo(curP[e.player]))[0];
          if (swimmers[near]) swimmers[e.player].setMove('dodge', { from: swimmers[near].chest });
        }
        // Every tackler lunges at the carrier (moves.js); the one who won it rips the ball away.
        (e.hits || []).forEach(j => { if (swimmers[j] && swimmers[e.player]) swimmers[j].setMove('tackle', { at: swimmers[e.player].chest, win: j === e.by && e.result !== 'kept' }); });
        if (e.result === 'kept') say('breakThrough', { player: who(e.player), _keys: [pk(e.player)] }, 2);
        else {
          SS.audio.play('tackle');
          const by = swimmers[e.by != null ? e.by : (e.hits || [])[0]];
          if (swimmers[e.player] && by) swimmers[e.player].setMove('knocked', { from: by.chest, lost: true });
          SS.hud.pop('Tackled!', ours(e.by) ? 'good' : 'bad', 2);
          say('tackle', { player: who(e.by), _keys: [pk(e.by)] }, 2);
        }
        break;
      case 'tech': {
        const t = D().TECHS[e.tech];
        if (t) { techFlourish(e, t); SS.audio.play('tech'); say('tech', { player: who(e.player), tech: t.name, _keys: [pk(e.player), U.slug(t.name)] }, 3); }   // a technique is always called
        break;
      }
      case 'status': say('status', { player: who(e.player), _keys: [pk(e.player)] }, 1); break;
      case 'goal': {
        SS.audio.play('goal'); SS.audio.crowd('roar'); SS.audio.sting('goal');
        SS.hud.hideTech();
        startGoalMoment(e);
        say('goal', { player: s.players[e.player].name, team: kits[e.team].name.replace(/^The /, ''), _keys: [pk(e.player)] }, 3);
        say('goalScore', { score: scoreWords(), _k: scoreKeys() }, 3);
        say('goalColor', {}, 3);
        break;
      }
      case 'save':
        SS.audio.play('save'); SS.audio.crowd('groan');
        SS.hud.pop('Saved!', ours(e.player) ? 'good' : 'bad', 2);
        say(e.caught ? 'saveCatch' : 'saveParry', { player: who(e.player), _keys: [pk(e.player)] }, 2);
        if (Math.random() < 0.3) say('saveColor', {}, 1);
        break;
      case 'halftime':
        phase = 'halftime';
        SS.audio.play('whistle');
        SS.hud.pop('Halftime', 'info', 3);
        say('halftime', { score: scoreWords(), _k: scoreKeys() }, 4);
        saveNow();
        SS.director.setMode('orbit');
        openAfterCall(1400, 'halftime', ['halftime'], () => SS.ui.setScreen('halftime'));
        break;
      case 'secondHalf': say('secondHalf', { score: scoreWords(), _k: scoreKeys() }, 3); break;
      case 'overtime': SS.hud.pop('Overtime', 'info', 3); say('overtime', {}, 3); break;
      case 'tactics':
        if (e.by === 'coach' && e.formation !== e.was) {
          const f = D().FORMATIONS[e.formation];
          SS.hud.pop(kits[e.team].short + ': ' + f.name, 'info', 2);
          say('theirFormation', { team: kits[e.team].short, formation: f.name, what: f.blurb, _keys: [tk(e.team), U.slug(f.name)], _k: formKeys(e.team, f) }, 3);
        }
        break;
      case 'fulltime': {
        phase = 'fulltime';
        SS.audio.play('whistle');
        SS.audio.sting(e.winner === 0 ? 'win' : 'lose');   // a draw gets the kind "nice try"
        SS.hud.pop('Full Time', 'info', 3);
        say('fulltime', { score: scoreWords(), _k: scoreKeys() }, 4);
        if (e.winner == null) say('fulltimeDraw', {}, 3); else say('fulltimeWin', { team: kits[e.winner].short, _keys: [tk(e.winner)] }, 3);
        SS.save.clearMatch();
        SS.director.setMode('orbit');
        openAfterCall(1800, 'fulltime', ['fulltime', 'fulltimeWin', 'fulltimeDraw'], () => SS.ui.setScreen('results'));
        break;
      }
    }
  }

  /* ══ decisions on the scene ═══════════════════════════════════════════ */
  /* A decision card silences the broadcast, so a call made in the same moment (an intercept, a score) would be
   * cut off. The card waits up to DECISION_HOLD_MS for a call to finish; the sim is already stopped, so nothing
   * about the play changes. A manual Pause is never held back: it opens at once, ends the wait, and Continue
   * asks the decision straight away (skipHold). */
  const DECISION_HOLD_MS = 2000;
  let decisionHold = null;                // { until } while the card waits for a call to finish
  function enterDecision(skipHold) {
    phase = 'decision';
    decisionHold = null;
    endShotMoment();
    preview = 0;                          // a choice cuts the formation preview short
    saveNow();
    if (!skipHold && !frozen && SS.broadcast.callInFlight()) {
      decisionHold = { until: performance.now() + DECISION_HOLD_MS };
      SS.ui.goLive();                     // no card while the call plays (after a choice the old one is still 'up')
      return;
    }
    openDecisionCard();
  }
  function tickDecisionHold() {
    if (!decisionHold) return;
    if (frozen || phase !== 'decision' || !m || !m.pending) { decisionHold = null; return; }   // a Pause (or a restart) got there first
    if (performance.now() >= decisionHold.until || !SS.broadcast.callInFlight()) openDecisionCard();
  }
  /** Half time and the results: the card comes after `ms`, or once the period's own call (the score, the winner)
   *  has finished, up to PERIOD_CALL_MAX_MS after the whistle. A Pause in between wins, and its Continue opens the
   *  card itself (resume). */
  const PERIOD_CALL_MAX_MS = 10000;        // the call can start late: it waits for the interface voice to finish
  function openAfterCall(ms, want, fams, open) {
    const t0 = performance.now();
    const check = () => {
      if (phase !== want || !m || frozen) return;
      const t = performance.now() - t0;
      if (t >= PERIOD_CALL_MAX_MS || !SS.broadcast.callInFlight(fams)) { open(); return; }
      setTimeout(check, 100);
    };
    setTimeout(check, ms);
  }
  function openDecisionCard() {
    decisionHold = null;
    SS.audio.play('decision');
    const dec = m.pending;
    if (dec.kind === 'stance') openStance(dec);
    else if (dec.kind === 'keeper') openPass(dec, null, true);
    else openTop(dec);
  }

  /** Bones to frame a swimmer by - the brackets fit the body whatever way up it is. */
  function bodyPoints(j) {
    const sw = swimmers[j];
    return () => [sw.head, sw.pelvis, sw.handL, sw.handR, sw.chest].map(b => b.getWorldPosition(new THREE.Vector3()));
  }
  function pauseItem() { return { label: 'Pause', speech: 'Pause', el: U.$('pauseBtn'), action: () => SS.ui.openPause() }; }
  function goalPoint(team) { const g = SS.ai.goalOf(team); return new THREE.Vector3(g.x, g.y, g.z); }

  function frameOn(js, extra) {
    const pts = js.map(j => curP[j].clone());
    if (extra) pts.push(...extra);
    SS.director.setMode('decision', { points: pts });
  }

  function showLane(from, to, blockers) {
    badges.forEach(b => b.blocker(false));
    if (!from) { lane.visible = false; return; }
    lane.geometry.setFromPoints([from, to]);
    lane.computeLineDistances();
    lane.visible = true;
    (blockers || []).forEach(j => badges[j] && badges[j].blocker(true));
  }
  const bestOf = list => list.slice().sort((a, b) => b.odds.p - a.odds.p)[0];
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  /** `back` = the id of the plate to land on when Back returns here (ACCESSIBILITY.md §4:
   *  Back within a nested task restores the parent item). */
  function openTop(dec, back) {
    const s = S(), c = s.players[dec.carrier], opts = dec.options;
    const plain = opts.filter(o => !o.tech), techs = opts.filter(o => o.tech);
    const passes = plain.filter(o => o.kind === 'pass'), shot = plain.find(o => o.kind === 'shoot');
    const drib = plain.find(o => o.kind === 'dribble'), swim = plain.find(o => o.kind === 'swim');
    const items = [];
    if (passes.length) {
      const b = bestOf(passes);
      items.push({ label: 'Pass', sub: 'Best: #' + numberOf(b.target) + ' ' + who(b.target) + (b.info.open ? ' · open' : ''), odds: b.odds,
        speech: 'Pass. ' + b.odds.word + (b.info.open ? '. ' + who(b.target) + ' is open.' : '.'),
        lane: () => [curP[dec.carrier], curP[b.target], m.laneBlockers(dec.carrier, s.players[b.target].p)],
        action: () => openPass(dec, null, false) });
    }
    if (shot) {
      const i = shot.info;
      items.push({ label: 'Shoot', sub: i.distance + ' m · ' + plural(i.blockers, 'blocker', 'blockers') + ' · keeper ' + i.keeper, odds: shot.odds,
        speech: 'Shoot. ' + shot.odds.word + '. ' + plural(i.blockers, 'blocker', 'blockers') + ', keeper ' + i.keeper + '.',
        lane: () => [curP[dec.carrier], goalPoint(c.team), m.laneBlockers(dec.carrier, SS.ai.goalOf(c.team))],
        action: () => choose(shot.id) });
    }
    if (drib) {
      const n = drib.info.tacklers;
      items.push({ label: 'Dribble', sub: 'Past ' + plural(n, 'defender', 'defenders'), odds: drib.odds,
        speech: 'Dribble. ' + drib.odds.word + '.',
        lane: () => [curP[dec.carrier], curP[dec.carrier].clone().add(goalPoint(c.team).sub(curP[dec.carrier]).setLength(5)), dec.defenders],
        action: () => choose(drib.id) });
    }
    if (techs.length) {
      const names = [...new Set(techs.map(o => D().TECHS[o.tech].name))];
      items.push({ label: 'Tech', sub: names.slice(0, 2).join(', ') + (names.length > 2 ? ' +' + (names.length - 2) + ' more' : ''), cls: 'tech techs',
        speech: 'Tech moves. ' + names.join(', ') + '.', action: () => openTech(dec) });
    }
    if (swim) items.push({ label: 'Keep Swimming', sub: 'Look for a better chance', speech: 'Keep swimming.', action: () => choose(swim.id) });
    items.push(pauseItem());

    const head = {
      encounter: ['#' + numberOf(dec.carrier) + ' ' + who(dec.carrier) + ' is challenged', plural(dec.defenders.length, 'defender', 'defenders') + ' in the way'],
      point: ['Point blank!', 'Right in front of goal'],
      call: ['Your call', '#' + numberOf(dec.carrier) + ' ' + who(dec.carrier) + ' has the ball'],
    }[dec.kind] || ['Your call', ''];
    const speech = {
      encounter: 'Your call. ' + who(dec.carrier) + ' is challenged by ' + plural(dec.defenders.length, 'defender', 'defenders') + '.',
      point: 'Point blank for ' + who(dec.carrier) + '!',
      call: 'Your call. ' + who(dec.carrier) + ' has the ball.',
    }[dec.kind] || 'Your call.';
    // Frame what this choice is about: the carrier, who is in the way, the best pass,
    // and the goal when a shot is on. Pass then frames every teammate.
    const best = passes.length ? [bestOf(passes).target] : [];
    frameOn([dec.carrier, ...dec.defenders, ...best], shot ? [goalPoint(c.team)] : null);
    SS.ui.openWorld({ title: head[0], sub: head[1], items, speech, anchor: swimmers[dec.carrier].head,
      onFocus: it => { const l = it && it.lane && it.lane(); showLane(l && l[0], l && l[1], l && l[2]); },
      onLeave: () => showLane(null) }, back);
  }

  function openPass(dec, tech, keeperBall) {
    const s = S(), c = s.players[dec.carrier];
    const opts = dec.options.filter(o => o.kind === 'pass' && (o.tech || null) === tech).sort((a, b) => b.odds.p - a.odds.p);
    const items = opts.map(o => {
      const t = s.players[o.target], i = o.info, pos = D().POSITION_NAMES[t.pos];
      const state = i.open ? 'Open' : plural(i.blockers, 'defender', 'defenders') + ' in the way';
      return { label: '#' + numberOf(o.target) + ' ' + who(o.target), focus: bodyPoints(o.target), opt: o,
        speech: who(o.target) + ', ' + pos + ', ' + state + ', ' + o.odds.word + '.',
        onFocus: () => SS.ui.worldHead('Pass to #' + numberOf(o.target) + ' ' + t.name, pos + ' · ' + state + ' · ' + o.odds.word),
        lane: () => [curP[dec.carrier], curP[o.target], m.laneBlockers(dec.carrier, t.p)],
        action: () => choose(o.id) };
    });
    if (!keeperBall) items.push({ label: 'Back', sub: 'Other choices', cls: 'back', speech: 'Back', action: () => tech ? openTech(dec, techName) : openTop(dec, 'Pass') });
    items.push(pauseItem());
    const techName = tech ? D().TECHS[tech].name : null;
    const title = keeperBall ? 'Your keeper has it' : (techName ? techName + ' to…' : 'Pass to…');
    const sub = keeperBall ? 'Pick a teammate to throw to' : 'Pick a teammate';
    frameOn([dec.carrier, ...opts.map(o => o.target)]);
    SS.ui.openWorld({ title, sub, items, anchor: swimmers[dec.carrier].head,
      speech: keeperBall ? 'Your keeper ' + who(dec.carrier) + ' has the ball. Pick a teammate.' : (techName ? techName + '. Pick a teammate.' : 'Pass. Pick a teammate.'),
      onOpen: () => opts.forEach(o => { badges[o.target].mark(o.odds.word); badges[o.target].onTap(() => choose(o.id)); }),
      onFocus: it => {
        if (!it || !it.opt) SS.ui.worldHead(title, sub);
        const l = it && it.lane && it.lane(); showLane(l && l[0], l && l[1], l && l[2]);
      },
      onLeave: () => { showLane(null); badges.forEach(b => { b.mark(null); b.onTap(null); }); } });
  }

  function openTech(dec, back) {
    const s = S(), techs = dec.options.filter(o => o.tech);
    const seen = new Set(), items = [];
    techs.forEach(o => {
      const key = o.kind + ':' + o.tech;
      if (seen.has(key)) return;
      seen.add(key);
      const t = D().TECHS[o.tech];
      if (o.kind === 'pass') {
        const b = bestOf(techs.filter(x => x.kind === 'pass' && x.tech === o.tech));
        items.push({ label: t.name, sub: 'Pass · ' + t.hp + ' HP', odds: b.odds, cls: 'tech', speech: t.name + '. A pass. ' + b.odds.word + '.',
          action: () => openPass(dec, o.tech, false) });
      } else {
        items.push({ label: t.name, sub: (o.kind === 'shoot' ? 'Shot' : 'Dribble') + ' · ' + t.hp + ' HP', odds: o.odds, cls: 'tech',
          speech: t.name + '. ' + (o.kind === 'shoot' ? 'A shot' : 'A dribble') + '. ' + o.odds.word + '.', action: () => choose(o.id) });
      }
    });
    items.push({ label: 'Back', sub: 'Other choices', cls: 'back', speech: 'Back', action: () => openTop(dec, 'Tech') });
    items.push(pauseItem());
    SS.ui.openWorld({ title: 'Tech moves', sub: who(dec.carrier) + ' has ' + Math.round(s.players[dec.carrier].hp) + ' HP', items,
      anchor: swimmers[dec.carrier].head, speech: 'Tech moves.', onLeave: () => showLane(null) }, back);
  }

  /* Defending. Bryan's playtest: both stances read "Risky / Risky" - winning the ball back
     is rarely likely, so the words told him nothing. Now the heading says what the
     carrier will likely do, each plate says what it stops, and the odds words compare
     the choices with each other (the bar still shows the real chance). */
  const LIKELY_CLEAR = 0.55, ODDS_EVEN = 0.1;
  function likelyMove(dec) {
    const l = Object.entries(dec.likely || {}).sort((a, b) => b[1] - a[1]);
    if (!l.length) return who(dec.carrier) + ' is coming through';
    if (l[0][1] >= LIKELY_CLEAR || !l[1]) return who(dec.carrier) + ' will likely ' + l[0][0];
    return who(dec.carrier) + ' may ' + l[0][0] + ' or ' + l[1][0];
  }
  function stanceWord(p, all) {
    const best = Math.max(...all);
    if (best - Math.min(...all) < ODDS_EVEN) return 'Even';
    return p >= best - 1e-9 ? 'Best bet' : p >= best - ODDS_EVEN ? 'Close' : 'Weaker';
  }
  function openStance(dec) {
    const ps = dec.options.map(o => o.odds.p);
    const items = dec.options.map(o => {
      const t = o.tech ? D().TECHS[o.tech] : null;
      const label = t ? t.name : o.stance === 'tackle' ? 'Tackle' : 'Block';
      const sub = t ? 'By #' + numberOf(o.by) + ' ' + who(o.by) : o.stance === 'tackle' ? 'Stops a dribble' : 'Stops a pass or shot';
      const odds = { p: o.odds.p, word: stanceWord(o.odds.p, ps) };
      return { label, sub, odds, cls: t ? 'tech' : '', speech: label + '. ' + sub + '. ' + odds.word + '.', action: () => choose(o.id) };
    });
    items.push(pauseItem());
    frameOn([dec.carrier, ...dec.defenders]);
    const likely = likelyMove(dec);
    SS.ui.openWorld({ title: 'Defend!', sub: '#' + numberOf(dec.carrier) + ' ' + likely, items,
      anchor: swimmers[dec.carrier].head, speech: 'Defend! ' + likely + '.',
      onOpen: () => dec.defenders.forEach(j => badges[j].blocker(true)), onLeave: () => showLane(null) });
  }

  function choose(id) {
    if (!m || !m.pending) return;
    SS.ui.closeWorld();
    showLane(null);
    const evs = m.choose(id);
    evs.forEach(handle);
    if (m.pending) { enterDecision(); return; }
    toLive();
  }
  function toLive() {
    phase = 'live'; frozen = false;
    SS.ui.goLive();
    if (intro) { /* the sweep carries on where it was */ }
    else if (gm && gm.replay && gm.replay.on) replayCamera();                     // back to what was on screen
    else if (gm && gm.cam === 'goal') SS.director.setMode('goal', { star: starPoint });
    else SS.director.setMode(cine && shotCinematic() ? 'shot' : 'broadcast', { follow: playFocus, shot: shotFrame });
    if (previewPending) startPreview();
  }

  /* ══ showing a formation change ════════════════════════════════════════
     Bryan's M2 playtest: "not sure what effect the formations have". When the player
     picks a new formation, play resumes with the camera pulled back, a ring at every
     fielder's new spot, and the analyst saying what the shape does - so the team can be
     seen swimming into it. */
  const PREVIEW_SECS = 3.5;
  function startPreview() {
    previewPending = false;
    preview = PREVIEW_SECS;
    const f = D().FORMATIONS[formationId()], s = S(), attacking = weHaveBall();
    // Frame our fielders where they are now AND where the new shape puts them.
    const pts = [];
    s.players.forEach((pl, j) => { if (pl.team === 0 && pl.pos !== 'GL') { pts.push(curP[j].clone()); const a = SS.ai.anchorOf(s, pl, attacking); pts.push(new THREE.Vector3(a.x, a.y, a.z)); } });
    SS.director.setMode('decision', { points: pts });
    say('ourFormation', { team: kits[0].short, formation: f.name, what: f.blurb, _keys: [tk(0), U.slug(f.name)], _k: formKeys(0, f) }, 3);
  }
  function drawPreview(dt) {
    if (preview <= 0) { rings.forEach(r => { r.visible = false; }); ringLinks.visible = false; return; }
    preview -= dt;
    const s = S(), attacking = s.ball.owner != null && s.players[s.ball.owner].team === 0;
    const fade = Math.min(1, preview / 0.6, (PREVIEW_SECS - preview) / 0.3 + 0.2);
    let k = 0;
    const seg = ringLinks.geometry.attributes.position;
    s.players.forEach((pl, j) => {
      if (pl.team !== 0 || pl.pos === 'GL' || k >= rings.length) return;
      const a = SS.ai.anchorOf(s, pl, attacking), r = rings[k];
      r.position.set(a.x, a.y, a.z); r.lookAt(camera.position);
      r.material.opacity = 0.9 * fade; r.visible = true;
      const p = swimmers[j].group.position;
      seg.setXYZ(k * 2, p.x, p.y, p.z); seg.setXYZ(k * 2 + 1, a.x, a.y, a.z);
      k++;
    });
    seg.needsUpdate = true; ringLinks.computeLineDistances();
    ringLinks.material.opacity = 0.8 * fade; ringLinks.visible = true;
    if (preview <= 0 && SS.director.mode === 'decision' && phase === 'live') SS.director.setMode('broadcast', { follow: playFocus });
  }

  /** The analyst's word on how a formation is going: once per formation per team, after
   *  it has had time to show something, and never more often than every 30 seconds. */
  function formationTalk() {
    const s = S(), now = (s.period - 1) * s.halfLength + s.clock;
    if (now - talk.at < 30 || !m.stint) return;
    for (const team of [0, 1]) {
      const st = m.stint(team), key = team + ':' + st.formation + ':' + Math.round(now - st.secs);
      if (talk.done[key] || st.secs < 45) continue;
      const f = D().FORMATIONS[st.formation], slots = { team: kits[team].short, formation: f.name, _keys: [tk(team), U.slug(f.name)] };
      let fam = null;
      if (st.goalsAgainst > st.goalsFor || st.shotsAgainst - st.shotsFor >= 2) fam = 'formationStruggling';
      else if (st.goalsFor > st.goalsAgainst || st.shotsFor - st.shotsAgainst >= 2) fam = 'formationWorking';
      else if (st.shotsAgainst === 0 && st.secs >= 60) fam = 'formationHolding';
      if (!fam) continue;
      talk.done[key] = true;
      if (say(fam, slots, 2)) { talk.at = now; return; }
    }
  }

  /* ══ the Huddle, Pause and friends ═════════════════════════════════════ */
  function openHuddle() {
    if (phase !== 'live' || frozen) return;
    if (skipReplay()) return;                           // a press during a goal replay skips it
    if (intro) { endIntro(); return; }                  // ...and during the kickoff sweep
    phase = 'huddle';
    SS.ui.setScreen('huddle');
  }
  function resume() {
    if (!m) return;
    frozen = false;                                     // Continue: the Pause card is gone
    if (m.pending) { enterDecision(true); return; }
    if (phase === 'halftime') { SS.ui.setScreen('halftime'); return; }
    if (phase === 'fulltime') { SS.ui.setScreen('results'); return; }
    toLive();
  }
  function setFrozen(on) { frozen = !!on; }
  function callNow() {
    if (!m || !weHaveBall()) { resume(); return; }
    phase = 'live';
    if (m.callNow(0) && m.pending) enterDecision(true); else toLive();
  }
  function startSecondHalf() {
    // Straight to the kickoff places: the sim's break would show everyone drifting, then
    // jumping there. Ticks only, so the match plays out exactly the same.
    const s = S();
    for (let n = 0; n < 200 && !m.done && (s.phase === 'break' || (s.phase === 'kickoff' && s.phaseT === 0)); n++) m.advance(RU().TICK).forEach(handle);
    s.players.forEach((pl, j) => { curP[j].set(pl.p.x, pl.p.y, pl.p.z); prevP[j].copy(curP[j]); });
    curBall.set(s.ball.p.x, s.ball.p.y, s.ball.p.z); prevBall.copy(curBall);
    acc = 0;
    toLive();
    if (s.phase === 'kickoff') startIntro('second');
  }
  function skipToEnd() {
    let guard = 0;
    while (!m.done && guard++ < 100000) {
      if (m.pending) m.choose(m.pending.options[0].id);
      m.advance(1);
    }
    S().players.forEach((pl, j) => { curP[j].set(pl.p.x, pl.p.y, pl.p.z); prevP[j].copy(curP[j]); });
    handle({ type: 'fulltime', winner: m.s.result ? m.s.result.winner : null });
  }

  /* ══ tactics ═══════════════════════════════════════════════════════════ */
  function formationId() { return m ? m.s.teams[0].formation : 'normal'; }
  function formationName() { return (D().FORMATIONS[formationId()] || D().FORMATIONS.normal).name; }
  function setFormation(id) {
    // Mark: each defender follows the opponent across from them.
    const marks = {};
    if (id === 'mark') {
      const s = S(), MIRROR = { LD: 'RF', RD: 'LF', MF: 'MF', LF: 'RD', RF: 'LD' };
      s.players.forEach((pl, j) => {
        if (pl.team !== 0 || !MIRROR[pl.pos]) return;
        const k = s.players.findIndex(o => o.team === 1 && o.pos === MIRROR[pl.pos]);
        if (k >= 0) marks[j] = k;
      });
    }
    const was = formationId();
    m.setTactics(0, { formation: id, marks });
    if (id !== was) previewPending = true;
  }
  /** "Normal for 1:20 · 3 shots for, 1 against" - how our formation has gone so far. */
  function formationRecord() {
    if (!m || !m.stint) return '';
    const st = m.stint(0);
    return (D().FORMATIONS[st.formation] || {}).name + ' for ' + U.fmtClock(st.secs) + ' · ' +
      plural(st.shotsFor, 'shot', 'shots') + ' for, ' + st.shotsAgainst + ' against';
  }
  function theirFormationName() { const s = S(); return s ? (D().FORMATIONS[s.teams[1].formation] || D().FORMATIONS.normal).name : ''; }
  function formationsOpen() { return !setup || setup.mode === 'quick'; }
  function totalWins() { return 0; }

  /* ══ reading the match, for cards ═════════════════════════════════════ */
  function weHaveBall() { const s = S(); return !!s && s.ball.owner != null && s.players[s.ball.owner].team === 0 && !s.pending; }
  function matchInfo() {
    const s = S();
    const teams = [0, 1].map(t => { const k = kits[t] || teamById(s.teams[t].id); return { id: k.id, name: k.name, short: k.short, kit: k.kit }; });
    const stats = [0, 1].map(t => {
      const o = { goals: 0, shots: 0, onTarget: 0, completed: 0, tackles: 0, saves: 0 };
      s.players.forEach(pl => { if (pl.team === t) Object.keys(o).forEach(k => { o[k] += pl.st[k] || 0; }); });
      return o;
    });
    return { teams, score: s.score.slice(), stats, winner: s.result ? s.result.winner : null,
      scoreSpeech: teams[0].short + ' ' + U.numWord(s.score[0]) + ', ' + teams[1].short + ' ' + U.numWord(s.score[1]) + '.' };
  }
  function inMatch() { return !!m && phase !== 'menu'; }

  return {
    init, update, startQuick, kickoff, savedMatch, continueSaved, saveNow, quitToMenu, restartMatch, resetProgress,
    openHuddle, resume, setFrozen, callNow, startSecondHalf, skipToEnd,
    formationId, formationName, setFormation, formationsOpen, formationRecord, theirFormationName, totalWins, weHaveBall, matchInfo, inMatch,
    choose,
    get phase() { return phase; }, get match() { return m; }, get swimmers() { return swimmers; }, get badges() { return badges; },
    get shotMoment() { return cine; }, get goalMoment() { return gm; }, get intro() { return intro; }, skipReplay,
  };
})();
