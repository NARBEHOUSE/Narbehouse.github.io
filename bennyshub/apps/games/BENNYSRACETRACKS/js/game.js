/**
 * Benny's Race Tracks — gameplay.
 *
 * The road is divided into five fixed lanes and the player hops between them
 * one press at a time: Space moves one lane left, Enter one lane right. Lanes
 * (rather than free analogue steering) are what make this playable with a
 * switch — "do nothing" is always a stable, survivable state, and every input
 * is a single discrete decision rather than a held, timed gesture.
 *
 * Obstacles are laid out per lane with at least one lane always clear, so the
 * guidance system can promise a reachable answer to "which way?" every time.
 */
RT.game = (function () {
  'use strict';

  const U = RT.util;
  const A = RT.art;
  const W = RT.world;
  const AU = RT.audio;

  /* ── Lanes ────────────────────────────────────────────────────────────── */

  const LANE_COUNT = 5;
  const LANE_W = 3.6;
  const MID_LANE = (LANE_COUNT - 1) / 2;

  /** World-space lateral offset of a lane centre. */
  function laneX(i) { return (i - MID_LANE) * LANE_W; }
  function laneOf(x) { return U.clamp(Math.round(x / LANE_W + MID_LANE), 0, LANE_COUNT - 1); }

  /* ── Vehicles ─────────────────────────────────────────────────────────── */

  const VEHICLES = {
    car: {
      key: 'car', name: 'Race Car', emoji: '🏎️',
      theme: 'countryside',
      body: 0xe63946, accent: 0xfdf6e3,
      speedMul: 1.00, laneMul: 1.00, halfWidth: 1.45,
      blurb: 'Balanced and forgiving. A good place to start.',
      casual: {
        item: 'balloon', emoji: '🎈', plural: 'balloons', target: 5, beacon: 0xff2d55,
        story: 'Collect balloons for the town parade.'
      }
    },
    motorcycle: {
      key: 'motorcycle', name: 'Motorcycle', emoji: '🏍️',
      theme: 'desert',
      body: 0xf4a261, accent: 0xe63946,
      speedMul: 1.08, laneMul: 1.30, halfWidth: 0.85,
      blurb: 'Narrow, and switches lanes fastest.',
      casual: {
        item: 'flower', emoji: '🌸', plural: 'flowers', target: 5, beacon: 0x00c2ff,
        story: 'Collect flowers for your grandmother.'
      }
    },
    spaceship: {
      key: 'spaceship', name: 'Spaceship', emoji: '🚀',
      theme: 'space',
      body: 0x8ecae6, accent: 0xb388eb,
      speedMul: 1.16, laneMul: 0.82, halfWidth: 1.7,
      blurb: 'Fastest of the three, but slower to change lanes.',
      casual: {
        item: 'artifact', emoji: '💎', plural: 'artifacts', target: 5, beacon: 0xffd166,
        story: 'Collect lost artifacts on a galaxy quest.'
      }
    }
  };

  const VEHICLE_ORDER = ['car', 'motorcycle', 'spaceship'];
  const MAX_LEVEL = 10;

  const RIVAL_COLORS = [
    [0x3d5a80, 0x8ecae6], [0x6a994e, 0xd8f3dc],
    [0xb388eb, 0xf1e3c6], [0x9c6644, 0xffd166]
  ];

  /* ── Tuning ───────────────────────────────────────────────────────────── */

  const CAM_BACK = 13.5;
  const CAM_HEIGHT = 7.4;
  const CAM_AHEAD = 30.0;
  const CAM_FOV = 52;
  /** Seconds to cross one lane while the switch is held. Deliberately unhurried. */
  const LANE_CROSS_TIME = 0.75;
  /** How gently the vehicle settles onto a lane centre after the switch is let go. */
  const SETTLE_LAMBDA = 6;
  const CRASH_INVULN = 1.7;
  const COUNTDOWN_FROM = 3;
  /** Obstacles block a whole lane, but stay narrow enough that a vehicle
   *  centred in the neighbouring lane is always safely clear. */
  const OBSTACLE_HALF = 1.55;
  /** Extra clear road built past the finish line so the win doesn't end on a
   *  freeze-frame — the car coasts on down it while the results card appears. */
  const OUTRO_LENGTH = 900;

  /* ── Level curves ─────────────────────────────────────────────────────── */

  const RIVALS_BY_LEVEL = [0, 0, 1, 1, 2, 2, 2, 3, 3, 3];

  function levelConfig(vehKey, level) {
    const v = VEHICLES[vehKey];
    const t = (level - 1) / (MAX_LEVEL - 1);
    const raceLength = Math.round(U.lerp(1750, 3050, t));
    return {
      mode: 'competitive',
      vehicle: vehKey,
      level: level,
      seed: U.hash(vehKey + ':lvl:' + level),
      themeId: v.theme,
      raceLength: raceLength,
      length: raceLength + OUTRO_LENGTH,
      speed: U.lerp(26, 46, t) * v.speedMul,
      curviness: U.lerp(0.0015, 0.0036, t),
      hilliness: U.lerp(1.0, 2.6, t),
      groupGap: U.lerp(140, 66, t),
      // Chance each non-gap lane is blocked: at level 1 most lanes stay open.
      fill: U.lerp(0.35, 0.92, t),
      leadTime: U.lerp(3.4, 2.15, t),
      rivals: RIVALS_BY_LEVEL[level - 1],
      hearts: 3,
      powerupGap: U.lerp(340, 430, t),
      ringGap: 620,
      items: 0
    };
  }

  /** Casual runs are re-rolled every playthrough, per the design doc. */
  function casualConfig(vehKey) {
    const v = VEHICLES[vehKey];
    return {
      mode: 'casual',
      vehicle: vehKey,
      level: 0,
      seed: (Math.random() * 0x7fffffff) >>> 0,
      themeId: v.theme,
      raceLength: 7200,
      length: 7200,
      speed: 25 * v.speedMul,
      curviness: 0.0018,
      hilliness: 1.4,
      groupGap: 190,
      fill: 0.26,
      leadTime: 3.6,
      rivals: 0,
      traffic: 3,
      hearts: 0,
      powerupGap: 520,
      ringGap: 900,
      items: v.casual.target
    };
  }

  /* ── Progress ─────────────────────────────────────────────────────────── */

  function getProgress() {
    const p = U.load('progress', null);
    const base = { car: 1, motorcycle: 1, spaceship: 1 };
    if (!p || typeof p !== 'object') return base;
    VEHICLE_ORDER.forEach((k) => {
      base[k] = U.clamp(parseInt(p[k], 10) || 1, 1, MAX_LEVEL);
    });
    return base;
  }

  function unlockedFor(vehKey) { return getProgress()[vehKey] || 1; }

  function recordWin(vehKey, level) {
    const p = getProgress();
    if (level >= p[vehKey] && level < MAX_LEVEL) {
      p[vehKey] = level + 1;
      U.save('progress', p);
      return true;   // something new opened up
    }
    if (level >= MAX_LEVEL) {
      p[vehKey] = MAX_LEVEL;
      U.save('progress', p);
    }
    return false;
  }

  function resetProgress() {
    U.save('progress', { car: 1, motorcycle: 1, spaceship: 1 });
  }

  function bestTime(vehKey, level) {
    return U.load('best:' + vehKey + ':' + level, null);
  }

  function recordTime(vehKey, level, seconds) {
    const prev = bestTime(vehKey, level);
    if (prev === null || seconds < prev) {
      U.save('best:' + vehKey + ':' + level, Math.round(seconds * 100) / 100);
      return true;
    }
    return false;
  }

  /* ── Module state ─────────────────────────────────────────────────────── */

  let scene = null, camera = null;
  let world = null;
  let layout = null;
  let cfg = null;
  let vehicleDef = null;

  let phase = 'idle';         // idle | attract | countdown | racing | ending | paused
  let prevPhase = null;

  let player = null;
  let steerHold = 0;          // -1 / 0 / +1 while a switch is held down
  let cuedDir = 0;            // what the guidance wants; drives one-button mode
  let cueActive = false;
  let dangerOn = false;      // lined up with an obstacle right now

  /**
   * How much of the direction helper to show: 2 = voice + sound + on-screen,
   * 1 = on-screen only (arrow, edge glow, green lane gates), 0 = nothing.
   *
   * This is presentation only. `cuedDir` is still computed at every level,
   * because One Switch mode steers by it — silencing the helper must not take
   * the controls away from a one-switch player.
   */
  const CUE_FULL = 2, CUE_VISUAL = 1, CUE_OFF = 0;
  /** Cleared while the one-switch scanner is speaking, so the two don't
   *  cancel each other mid-word. Tones and the arrow are unaffected. */
  let cueSpeech = true;
  let cueLevel = U.clamp(parseInt(U.load('cueLevel', CUE_FULL), 10), CUE_OFF, CUE_FULL);

  let bursts = [];
  let elapsed = 0;
  let countdown = 0;
  let shake = 0;
  let attractS = 0;
  let preview = null;

  const callbacks = { onFinish: null, onCountdown: null, onCue: null, onHud: null,
                      onFlash: null, onDanger: null };

  const _camTarget = new THREE.Vector3();
  const _lookTarget = new THREE.Vector3();

  /* ── Setup ────────────────────────────────────────────────────────────── */

  function init(ctx) {
    scene = ctx.scene;
    camera = ctx.camera;
  }

  function disposeRun() {
    if (layout) {
      scene.remove(layout.group);
      layout.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      layout = null;
    }
    bursts.forEach((b) => scene.remove(b));
    bursts = [];
    if (world) { world.dispose(); world = null; }
    AU.stopEngine();
  }

  /** Idle flyby behind the menus. */
  function loadAttract() {
    disposeRun();
    setPreview(null);
    cfg = null;
    vehicleDef = null;
    player = null;
    phase = 'attract';
    attractS = 0;
    world = W.build(scene, {
      themeId: 'countryside',
      seed: U.hash('attract-v1'),
      length: 2600,
      curviness: 0.0026,
      hilliness: 1.8
    });
    camera.fov = CAM_FOV + 6;
    camera.updateProjectionMatrix();
  }

  /* ── Layout generation ────────────────────────────────────────────────── */

  const OBSTACLE_KINDS = {
    countryside: [A.trafficCone, A.barrier, A.trafficCone],
    desert: [A.boulder, A.obstacleCactus, A.barrier],
    space: [A.spaceMine, A.debrisChunk, A.spaceMine]
  };

  function buildLayout() {
    const r = U.rng(cfg.seed ^ 0x1234567);
    const group = new THREE.Group();
    scene.add(group);

    const L = {
      group: group,
      groups: [],
      items: [],
      powerups: [],
      rings: [],
      traffic: [],
      finishS: cfg.mode === 'casual' ? Infinity : cfg.raceLength - 45,
      outroFrom: 0,
      finishArch: null,
      spinners: []
    };

    const kinds = OBSTACLE_KINDS[cfg.themeId];

    /* Obstacle clusters, laid out lane by lane. */
    let s = 210;
    while (s < cfg.raceLength - 200) {
      const gapLane = r.int(0, LANE_COUNT - 1);
      const cluster = {
        s: s,
        gapLane: gapLane,
        blocked: [],
        obstacles: [],
        passed: false, announced: -99, lastDir: 99, hitOnce: false,
        gates: []
      };

      for (let lane = 0; lane < LANE_COUNT; lane++) {
        // The gap lane is never blocked, so there is always a reachable answer.
        const block = (lane !== gapLane) && r.chance(cfg.fill);
        cluster.blocked.push(block);
        if (!block) continue;

        const mesh = r.pick(kinds)(r);
        const o = { s: s, x: laneX(lane), half: OBSTACLE_HALF, lane: lane, mesh: mesh, alive: true };
        world.pointAt(o.s, o.x, mesh.position);
        mesh.rotation.y = world.frameAt(o.s).yaw + r.range(-0.2, 0.2);
        group.add(mesh);
        cluster.obstacles.push(o);
        if (mesh.userData.tumble) L.spinners.push(mesh);
      }

      if (cluster.obstacles.length) {
        buildLaneGates(cluster, group);
        L.groups.push(cluster);
      }
      s += cfg.groupGap * r.range(0.85, 1.25);
    }

    /* Power-ups, on lane centres so they're reachable with one switch. */
    const puKinds = cfg.mode === 'casual' ? ['boost', 'magnet', 'shield'] : ['boost', 'shield', 'boost'];
    for (let ps = 320; ps < cfg.raceLength - 160; ps += cfg.powerupGap * r.range(0.8, 1.25)) {
      const kind = r.pick(puKinds);
      const mesh = A.powerup(kind);
      const lane = r.int(0, LANE_COUNT - 1);
      const p = { s: ps, x: laneX(lane), lane: lane, kind: kind, mesh: mesh, alive: true };
      world.pointAt(p.s, p.x, mesh.position);
      group.add(mesh);
      L.powerups.push(p);
    }

    /* Stunt rings are disabled: the torus is taller than the road is wide, so
     * its lower arc always sank through the tarmac. The barrel-roll code and
     * A.stuntRing() are intact — push entries into L.rings here to bring them
     * back once the ring has a shape that clears the road surface. */

    /* Casual collectibles, spaced out in time rather than distance. */
    if (cfg.items > 0) {
      const maker = { balloon: A.balloon, flower: A.flower, artifact: A.artifact }[vehicleDef.casual.item];
      let is = cfg.speed * r.range(11, 15);
      for (let i = 0; i < cfg.items; i++) {
        const mesh = maker(r);
        mesh.scale.setScalar(1.45);
        const lane = r.int(0, LANE_COUNT - 1);
        const it = { s: is, x: laneX(lane), lane: lane, mesh: mesh, alive: true, bob: r.range(0, 6.28) };
        world.pointAt(is, it.x, mesh.position);
        group.add(mesh);

        // Beacon sits on the ground and does not bob with the item.
        it.beacon = A.itemBeacon(vehicleDef.casual.beacon);
        world.pointAt(is, it.x, it.beacon.position);
        group.add(it.beacon);

        L.items.push(it);
        is += cfg.speed * r.range(16, 24);
      }
    }

    /* Rivals / ambient traffic */
    const trafficCount = (cfg.rivals || 0) + (cfg.traffic || 0);
    for (let i = 0; i < trafficCount; i++) {
      const isRival = i < (cfg.rivals || 0);
      const colors = RIVAL_COLORS[i % RIVAL_COLORS.length];
      // Everyone on the track drives the same class of vehicle as the player —
      // a motorcycle sharing a lane with a spaceship breaks the world. Variety
      // comes from colour and per-variant bodywork instead.
      const mesh = A.buildVehicle(cfg.vehicle, colors[0], colors[1], 1 + (i % 3));
      A.setShadow(mesh, true, false);
      mesh.rotation.order = 'YXZ';
      group.add(mesh);
      const startLane = r.int(0, LANE_COUNT - 1);
      L.traffic.push({
        isRival: isRival,
        mesh: mesh,
        s: isRival ? r.range(40, 130) : r.range(260, 900),
        x: laneX(startLane),
        lane: startLane,
        targetX: laneX(startLane),
        speed: isRival ? cfg.speed * r.range(0.93, 1.02) : cfg.speed * r.range(0.55, 0.72),
        phase: r.range(0, 6.28),
        missChance: isRival ? r.range(0.06, 0.2) : 0.3,
        bumpTimer: 0,
        rng: U.rng(cfg.seed ^ (0x9e3779b9 * (i + 1)))
      });
    }

    /* Start banner + finish line */
    placeCheckerStrip(60, group);

    if (cfg.mode !== 'casual') placeFinish(L, L.finishS);

    return L;
  }

  /**
   * Lay a checkered band across the road at `s`.
   *
   * Each tile is positioned individually through world.pointAt and rolled to
   * match the local banking. A single flat slab (which is what this used to be)
   * ignores the road's cross-slope, so its outer edges sink under the tarmac
   * anywhere the track is banked.
   */
  function placeCheckerStrip(s, group) {
    const cols = 18, rows = 2;
    const half = world.roadHalf;
    const cw = (half * 2) / cols, ch = 1.6;
    const geo = new THREE.BoxGeometry(cw, 0.14, ch);
    const light = A.paper(0xfdf6e3), dark = A.paper(0x2f231a);

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = -half + cw * (i + 0.5);
        const ts = s + (j - 0.5) * ch;
        const fr = world.frameAt(ts);
        const m = A.part(geo, ((i + j) % 2 === 0) ? light : dark, { cast: false, receive: true });
        world.pointAt(ts, x, m.position);
        m.position.y += 0.07;
        m.rotation.order = 'YXZ';
        m.rotation.y = fr.yaw;
        m.rotation.z = -fr.bank;
        group.add(m);
      }
    }
  }

  /**
   * Retire everything past the flag.
   *
   * Casual places its finish line dynamically once the last pickup is taken,
   * but the track was laid out for the full distance — so without this there
   * are still obstacles and green "clear lane" gates scattered down the
   * run-out, telling the player to dodge things that no longer matter.
   */
  function retireBeyond(L, s) {
    for (let i = 0; i < L.groups.length; i++) {
      const g = L.groups[i];
      if (g.s <= s) continue;
      g.retired = true;
      g.passed = true;                       // keeps it out of the cue and danger checks
      for (let j = 0; j < g.obstacles.length; j++) {
        g.obstacles[j].alive = false;        // and out of collision
        g.obstacles[j].mesh.visible = false;
      }
      for (let j = 0; j < g.gates.length; j++) g.gates[j].visible = false;
    }
    const retire = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        if (!o.alive || o.s <= s) continue;
        o.alive = false;
        o.mesh.visible = false;
        if (o.beacon) o.beacon.visible = false;
      }
    };
    retire(L.powerups);
    retire(L.items);
  }

  function placeFinish(L, s) {
    L.finishS = s;
    retireBeyond(L, s);
    L.outroFrom = player ? player.s : 0;

    const fr = world.frameAt(s);
    const arch = A.finishArch();
    world.pointAt(s, 0, arch.position);
    arch.rotation.order = 'YXZ';
    arch.rotation.y = fr.yaw;
    arch.rotation.z = -fr.bank;
    L.group.add(arch);
    L.finishArch = arch;

    placeCheckerStrip(s, L.group);
  }

  /**
   * A glowing green doorway over every clear lane. Seeing the safe openings —
   * not just hearing "left" — is what makes the cue actionable at speed.
   */
  function buildLaneGates(cluster, group) {
    // Deeply saturated: a lighter green blows out to near-white under the
    // bright sun lighting, and these have to stay unmistakable.
    const mat = A.glow(0x18a349, 0.85);
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      if (cluster.blocked[lane]) continue;
      const g = new THREE.Group();
      const hw = LANE_W / 2 - 0.25;
      [-1, 1].forEach((side) => {
        g.add(A.part(new THREE.BoxGeometry(0.26, 5.0, 0.26), mat, {
          pos: [side * hw, 2.5, 0], cast: false
        }));
      });
      g.add(A.part(new THREE.BoxGeometry(hw * 2, 0.24, 0.24), mat, { pos: [0, 4.9, 0], cast: false }));
      world.pointAt(cluster.s, laneX(lane), g.position);
      g.rotation.y = world.frameAt(cluster.s).yaw;
      g.visible = cueLevel >= CUE_VISUAL;
      group.add(g);
      cluster.gates.push(g);
    }
    cluster.gateMat = mat;
  }

  /* ── Run lifecycle ────────────────────────────────────────────────────── */

  function startRun(opts) {
    disposeRun();
    setPreview(null);

    vehicleDef = VEHICLES[opts.vehicle] || VEHICLES.car;
    cfg = opts.mode === 'casual'
      ? casualConfig(vehicleDef.key)
      : levelConfig(vehicleDef.key, U.clamp(opts.level || 1, 1, MAX_LEVEL));

    world = W.build(scene, {
      themeId: cfg.themeId, seed: cfg.seed,
      length: cfg.length, curviness: cfg.curviness, hilliness: cfg.hilliness
    });

    player = {
      s: 12, prevS: 12, x: 0,
      lane: Math.round(MID_LANE), targetLane: Math.round(MID_LANE),
      speed: 0,
      mesh: null,
      hearts: cfg.hearts,
      crashes: 0,
      collected: 0,
      invuln: 0,
      boost: 0, shieldT: 0, magnetT: 0,
      stunt: 0,
      lean: 0, bob: 0,
      edgeHit: false, punch: 0
    };
    steerHold = 0;

    layout = buildLayout();

    const mesh = A.buildVehicle(vehicleDef.key, vehicleDef.body, vehicleDef.accent);
    A.setShadow(mesh, true, false);
    // Yaw first, then roll about the vehicle's own forward axis. With the
    // default XYZ order the bank is applied before the heading, which skews
    // the vehicle sideways everywhere the track isn't pointing north.
    mesh.rotation.order = 'YXZ';
    layout.group.add(mesh);
    player.mesh = mesh;

    // Power-up effects ride alongside the vehicle rather than as children, so
    // the crash blink can't strobe them.
    player.fx = A.vehicleFx();
    player.fx.rotation.order = 'YXZ';
    layout.group.add(player.fx);

    elapsed = 0;
    shake = 0;
    countdown = COUNTDOWN_FROM + 0.999;
    phase = 'countdown';
    setDanger(false);

    AU.resume();
    AU.startEngine(vehicleDef.key);
    updatePlayerPose(0);
    updateCamera(0, true);
    pushHud();
    emitCue(0, false);
  }

  function quitToMenu() {
    phase = 'idle';
    loadAttract();
  }

  function pause() {
    if (phase === 'racing' || phase === 'countdown') {
      prevPhase = phase;
      phase = 'paused';
      steerHold = 0;
      setDanger(false);
      AU.updateEngine(0, false);
    }
  }

  function resume() {
    if (phase === 'paused') {
      phase = prevPhase || 'racing';
      prevPhase = null;
    }
  }

  function isRacing() { return phase === 'racing' || phase === 'countdown' || phase === 'paused'; }
  function getPhase() { return phase; }

  /* ── Input surface ────────────────────────────────────────────────────── */

  /**
   * One press = one lane. Called on release by the input layer.
   * @param {number} dir -1 for left, +1 for right, 0 ignored.
   */
  /**
   * Hold to move. The vehicle slides steadily across the road while the switch
   * is down and simply stops where it is on release — nothing is "committed"
   * at release, so letting go can never throw the car sideways.
   * @param {number} dir -1 left, +1 right, 0 to stop.
   */
  function setSteerHold(dir) {
    steerHold = (dir > 0) ? 1 : (dir < 0 ? -1 : 0);
  }

  function getSteerHold() { return steerHold; }

  /**
   * Point the vehicle at a lane directly — used by mouse and touch steering.
   *
   * It only sets the target; the same gentle settle that catches a released
   * switch carries the vehicle there, so pointer steering feels identical to
   * switch steering rather than teleporting between lanes.
   */
  function setLaneTarget(lane) {
    if (!player || phase !== 'racing') return;
    player.targetLane = U.clamp(Math.round(lane), 0, LANE_COUNT - 1);
  }

  function getCuedDirection() { return cuedDir; }
  function getLaneInfo() {
    if (!player) return null;
    return {
      lane: player.targetLane,
      count: LANE_COUNT,
      s: +player.s.toFixed(1),
      speed: +player.speed.toFixed(1),
      x: +player.x.toFixed(3),
      laneCentre: laneX(player.targetLane)
    };
  }

  /* ── Preview turntable (vehicle-select screen) ────────────────────────── */

  function setPreview(kind) {
    if (preview) {
      scene.remove(preview);
      preview.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      preview = null;
    }
    if (!kind) return;
    const v = VEHICLES[kind];
    if (!v) return;
    preview = A.buildVehicle(kind, v.body, v.accent);
    A.setShadow(preview, false, false);
    scene.add(preview);
    // Show the world this vehicle actually races in, so picking a ride also
    // previews its map.
    setAttractTheme(v.theme);
  }

  /** Swap the idling menu world to a different theme, keeping our place on it. */
  function setAttractTheme(themeId) {
    if (phase !== 'attract' || !world) return;
    if (world.theme.id === themeId) return;
    const keepS = attractS;
    world.dispose();
    world = W.build(scene, {
      themeId: themeId,
      seed: U.hash('attract-' + themeId),
      length: 2600,
      curviness: 0.0026,
      hilliness: themeId === 'space' ? 2.4 : 1.8
    });
    attractS = U.clamp(keepS, 0, world.length - 200);
  }

  function updatePreview(dt) {
    if (!preview || !world) return;
    const fr = world.frameAt(attractS + 20);
    preview.position.copy(fr.pos).addScaledVector(fr.right, 4.5);
    preview.scale.setScalar(1.5);
    preview.rotation.y += dt * 0.7;
    preview.rotation.z = Math.sin(performance.now() * 0.0011) * 0.04;
    if (preview.userData.kind === 'spaceship') preview.position.y += 1.2;
  }

  /* ── Guidance cues ────────────────────────────────────────────────────── */

  function emitCue(dir, active) {
    cuedDir = dir;
    cueActive = active;
    // Pass the RAW active flag plus the helper level, and let the UI decide
    // what to show. The one-switch scanner keys off "is there a decision to
    // make", which must keep working even with Direction Help turned off.
    if (callbacks.onCue) callbacks.onCue(dir, active, cueLevel);
  }

  function getCueLevel() { return cueLevel; }
  function setCueSpeech(on) { cueSpeech = !!on; }

  function setCueLevel(n) {
    cueLevel = U.clamp(n | 0, CUE_OFF, CUE_FULL);
    U.save('cueLevel', cueLevel);
    applyCueVisibility();
  }

  /** Cycles On → Visual → Off → On. */
  function cycleCueLevel() {
    setCueLevel((cueLevel + 2) % 3);
    return cueLevel;
  }

  /** Show or hide the green lane gates to match the current helper level. */
  function applyCueVisibility() {
    if (!layout) return;
    const show = cueLevel >= CUE_VISUAL;
    for (let i = 0; i < layout.groups.length; i++) {
      const gates = layout.groups[i].gates;
      for (let j = 0; j < gates.length; j++) gates[j].visible = show;
    }
  }

  function clearCue() {
    if (cueActive || cuedDir !== 0) emitCue(0, false);
  }

  /**
   * "You are lined up with something solid."
   *
   * Distinct from the turn cue, which says *where to go*: this says *you are on
   * a collision course right now*, and it clears the instant the vehicle is
   * clear again. For a low-vision player that continuous yes/no is often more
   * useful than the one-shot direction call, so it drives a red screen glow and
   * a repeating warning tone rather than speech.
   *
   * It tests real lateral overlap rather than lane indices, so it stays honest
   * while the vehicle is part-way between lanes.
   */
  function updateDanger() {
    const pHalf = vehicleDef.halfWidth;
    const lead = Math.max(30, player.speed * cfg.leadTime);
    let danger = false;

    for (let i = 0; i < layout.groups.length; i++) {
      const g = layout.groups[i];
      if (g.passed) continue;
      const ds = g.s - player.s;
      if (ds < -4) continue;
      if (ds <= lead) {
        for (let j = 0; j < g.obstacles.length; j++) {
          const o = g.obstacles[j];
          if (!o.alive) continue;
          if (Math.abs(o.x - player.x) < o.half + pHalf) { danger = true; break; }
        }
      }
      break;                       // only the next cluster can hit us
    }
    setDanger(danger);
  }

  function setDanger(on) {
    if (on === dangerOn) return;
    dangerOn = on;
    if (callbacks.onDanger) callbacks.onDanger(on);
  }

  /**
   * Nearest clear lane to `from`. Distance dominates so we never send the
   * player across the whole road, but when the objective's own lane is blocked
   * we still lean toward the clear lane closest to it — dodging shouldn't also
   * mean walking away from the thing being collected.
   */
  function nearestClearLane(blocked, from, wantLane) {
    let best = from, bestScore = Infinity;
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      if (blocked[lane]) continue;
      let score = Math.abs(lane - from) * 10;
      score += (wantLane === null || wantLane === undefined)
        ? Math.abs(lane - MID_LANE)
        : Math.abs(lane - wantLane) * 3;
      if (score < bestScore) { bestScore = score; best = lane; }
    }
    return best;
  }

  /**
   * Which lane the guidance should send the player to.
   *
   * Safety comes first — the lane has to be clear — but among the clear lanes
   * we prefer the one holding the next pickup. Otherwise the cue happily says
   * "turn right" while the balloon the player is chasing sits on the left,
   * which reads as the game contradicting its own objective.
   *
   * @param {number|null} wantLane   lane of the next pickup, if any
   * @param {number} secsToCluster   Infinity when nothing is blocking ahead
   */
  function chooseTargetLane(blocked, from, wantLane, secsToCluster) {
    const reachable = (lane) => secsToCluster === Infinity ||
      Math.abs(lane - from) * LANE_CROSS_TIME / Math.max(0.4, vehicleDef.laneMul) <= secsToCluster;

    // Go and get it, as long as that lane is safe and we can make it in time.
    if (wantLane !== null && !blocked[wantLane] && reachable(wantLane)) return wantLane;
    // Already somewhere safe — don't move for the sake of moving.
    if (!blocked[from]) return from;
    // Have to move: pick the clear lane that also gets us closest to the pickup.
    return nearestClearLane(blocked, from, wantLane);
  }

  function updateCues(dt) {
    const groups = layout.groups;
    const lead = Math.max(28, player.speed * cfg.leadTime);
    let active = null;

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.passed) continue;
      if (g.s < player.s - 6) {
        g.passed = true;
        if (!g.hitOnce && cueLevel >= CUE_FULL) AU.cleared();
        if (g.gateMat) g.gateMat.emissiveIntensity = 0.85;
        continue;
      }
      active = g;
      break;
    }

    if (active && active.s - player.s <= lead) {
      if (active.gateMat) active.gateMat.emissiveIntensity = 2.1;

      const from = player.targetLane;
      const secs = (active.s - player.s) / Math.max(1, player.speed);
      const target = chooseTargetLane(active.blocked, from, nextBonusTarget(lead * 2.2), secs);
      const dir = target > from ? 1 : (target < from ? -1 : 0);

      if (dir !== cuedDir || !cueActive) emitCue(dir, true);

      if (dir !== active.lastDir && (elapsed - active.announced) > 0.7) {
        active.lastDir = dir;
        active.announced = elapsed;
        if (cueLevel >= CUE_FULL) {
          AU.cue(dir);
          if (cueSpeech) {
            if (dir < 0) U.speak('Turn left');
            else if (dir > 0) U.speak('Turn right');
            else U.speak('Stay here');
          }
        }
      }
      return;
    }

    // Nothing dangerous ahead: point at something worth collecting instead, so
    // a one-switch player can still reach pickups they'd otherwise never get.
    const bonus = nextBonusTarget(lead * 1.5);
    if (bonus !== null && bonus !== player.targetLane) {
      const dir = bonus > player.targetLane ? 1 : -1;
      if (dir !== cuedDir || !cueActive) {
        emitCue(dir, true);
        if (cueLevel >= CUE_FULL) AU.cue(dir);
      }
      return;
    }

    clearCue();
  }

  /**
   * Lane of the next collectible worth steering for, or null.
   *
   * Collectibles only — power-ups are deliberately never cue targets. In Race
   * the guidance has exactly one job, keeping the player off the obstacles, and
   * sending them across the road for a bonus muddies that. In Cruise the
   * collectibles *are* the objective, so they count; there are no items in Race,
   * so this returns null there and obstacle avoidance is all that's left.
   */
  function nextBonusTarget(range) {
    let lane = null, bestDs = Infinity;
    for (let i = 0; i < layout.items.length; i++) {
      const o = layout.items[i];
      if (!o.alive) continue;
      const ds = o.s - player.s;
      if (ds < 12 || ds > range) continue;
      if (ds < bestDs) { bestDs = ds; lane = o.lane; }
    }
    return lane;
  }

  /* ── Collisions & pickups ─────────────────────────────────────────────── */

  function swept(objS, pad) {
    return objS >= player.prevS - pad && objS <= player.s + pad;
  }

  function spawnBurst(color, count, pos) {
    const b = A.burst(color, count);
    b.position.copy(pos);
    scene.add(b);
    bursts.push(b);
  }

  function crash(obstacle) {
    if (player.invuln > 0) return;

    if (player.shieldT > 0) {
      obstacle.alive = false;
      obstacle.mesh.visible = false;
      spawnBurst(0x8ecae6, 18, obstacle.mesh.position);
      AU.bump();
      return;
    }

    obstacle.alive = false;
    obstacle.mesh.visible = false;
    spawnBurst(0xe76f51, 22, obstacle.mesh.position);

    player.crashes++;
    player.invuln = CRASH_INVULN;
    player.speed *= 0.42;
    player.boost = 0;
    shake = 1;
    AU.crash();
    if (callbacks.onFlash) callbacks.onFlash();

    if (cfg.mode === 'casual') {
      U.speak('Oops');
    } else {
      player.hearts--;
      if (player.hearts <= 0) {
        U.speak('Out of hearts');
        endRun(false);
      } else {
        U.speak('Crash');
      }
    }
    pushHud();
  }

  function checkCollisions(dt) {
    const pHalf = vehicleDef.halfWidth;

    for (let i = 0; i < layout.groups.length; i++) {
      const g = layout.groups[i];
      if (g.s < player.s - 20 || g.s > player.s + 40) continue;
      for (let j = 0; j < g.obstacles.length; j++) {
        const o = g.obstacles[j];
        if (!o.alive) continue;
        if (!swept(o.s, 2.2)) continue;
        if (Math.abs(o.x - player.x) < o.half + pHalf) {
          g.hitOnce = true;
          crash(o);
          if (phase !== 'racing') return;
        }
      }
    }

    /* Collectibles (with magnet assist) */
    for (let i = 0; i < layout.items.length; i++) {
      const it = layout.items[i];
      if (!it.alive) continue;
      const ds = it.s - player.s;
      if (ds < -8 || ds > 40) continue;

      if (player.magnetT > 0 && ds > 0 && ds < 26) {
        it.x = U.damp(it.x, player.x, 3.2, dt);
        world.pointAt(it.s, it.x, it.mesh.position);
        if (it.beacon) world.pointAt(it.s, it.x, it.beacon.position);
      }
      const reach = (player.magnetT > 0 ? 5.5 : 1.7) + pHalf;
      if (swept(it.s, 3.0) && Math.abs(it.x - player.x) < reach) {
        it.alive = false;
        it.mesh.visible = false;
        if (it.beacon) it.beacon.visible = false;
        player.collected++;
        player.punch = 1;
        spawnBurst(0xffd166, 20, it.mesh.position);
        AU.pickup(player.collected - 1);
        const left = cfg.items - player.collected;
        if (left > 0) {
          U.speak(player.collected + ' of ' + cfg.items + '. ' + left + ' to go.');
        } else {
          U.speak('You got them all! Head for the finish line.');
          placeFinish(layout, player.s + Math.max(420, player.speed * 24));
        }
        pushHud();
      }
    }

    /* Power-ups */
    for (let i = 0; i < layout.powerups.length; i++) {
      const p = layout.powerups[i];
      if (!p.alive) continue;
      if (!swept(p.s, 2.6)) continue;
      if (Math.abs(p.x - player.x) > 1.9 + pHalf) continue;
      p.alive = false;
      p.mesh.visible = false;
      player.punch = 1;
      spawnBurst(0xffd166, 16, p.mesh.position);
      if (p.kind === 'boost') {
        player.boost = 3.2; AU.boost(); U.speak('Speed boost');
      } else if (p.kind === 'shield') {
        player.shieldT = 6.0; AU.shield(); U.speak('Shield on');
      } else {
        player.magnetT = 7.0; AU.shield(); U.speak('Magnet on');
      }
      pushHud();
    }

    /* Stunt rings */
    for (let i = 0; i < layout.rings.length; i++) {
      const ring = layout.rings[i];
      if (!ring.alive) continue;
      if (!swept(ring.s, 2.5)) continue;
      if (Math.abs(ring.x - player.x) > 3.0) continue;
      ring.alive = false;
      player.stunt = 1.35;
      player.boost = Math.max(player.boost, 2.2);
      player.invuln = Math.max(player.invuln, 1.35);
      spawnBurst(0xffd166, 30, ring.mesh.position);
      AU.stunt();
      U.speak('Nice one!');
    }

    /* Traffic — soft contact, but *continuous* while overlapping.
     *
     * This used to fire once and then ignore the pair for 0.6 s, which meant a
     * quick overtake got one nudge and then slid straight through the rest of
     * the other car. Now the push and the speed loss are applied every frame
     * that the two actually overlap; only the sound is throttled.
     *
     * The gap is also tightened: it used to be wider than a lane, so vehicles
     * in the *neighbouring* lane were triggering phantom bumps. */
    const TRAFFIC_HALF = 1.3;
    for (let i = 0; i < layout.traffic.length; i++) {
      const t = layout.traffic[i];
      if (Math.abs(t.s - player.s) > 5.0) continue;

      const dx = t.x - player.x;
      const minGap = pHalf + TRAFFIC_HALF;     // always < LANE_W, so same-lane only
      const overlap = minGap - Math.abs(dx);
      if (overlap <= 0) continue;

      const push = dx > 0 ? -1 : 1;
      player.x += push * overlap * 0.5;
      t.x -= push * overlap * 0.5;
      player.speed *= Math.max(0.6, 1 - 2.4 * dt);
      shake = Math.max(shake, 0.3);

      if (t.bumpTimer <= 0) {
        t.bumpTimer = 0.45;                    // throttles the noise, not the physics
        // Nudge them toward the next lane so the pair eventually separates.
        t.lane = U.clamp(t.lane + (dx > 0 ? 1 : -1), 0, LANE_COUNT - 1);
        AU.bump();
      }
    }
  }

  /* ── Traffic ──────────────────────────────────────────────────────────── */

  function updateTraffic(dt) {
    for (let i = 0; i < layout.traffic.length; i++) {
      const t = layout.traffic[i];
      t.bumpTimer = Math.max(0, t.bumpTimer - dt);

      // Pick a lane for the next cluster; rivals mostly find a clear one and
      // occasionally clip an obstacle on purpose, for a bit of personality.
      for (let j = 0; j < layout.groups.length; j++) {
        const g = layout.groups[j];
        if (g.s > t.s - 4 && g.s < t.s + 90) {
          if (g.trafficLane === undefined) g.trafficLane = {};
          if (g.trafficLane[i] === undefined) {
            g.trafficLane[i] = t.rng.chance(t.missChance)
              ? t.lane
              : nearestClearLane(g.blocked, t.lane);
          }
          t.lane = g.trafficLane[i];
          break;
        }
      }
      t.targetX = laneX(t.lane);
      t.x = U.damp(t.x, t.targetX, 3.0, dt);

      const pace = 1 + Math.sin(t.s * 0.004 + t.phase) * 0.07;
      t.s += t.speed * pace * dt;
      if (t.s > cfg.length + 60) t.s = cfg.length + 60;

      world.pointAt(t.s, t.x, t.mesh.position);
      const fr = world.frameAt(t.s);
      t.mesh.rotation.y = fr.yaw;
      t.mesh.rotation.z = -fr.bank;
      const wheels = t.mesh.userData.wheels;
      if (wheels) {
        for (let w = 0; w < wheels.length; w++) wheels[w].rotation.x -= t.speed * dt * 1.2;
      }
    }
  }

  /* ── Player ───────────────────────────────────────────────────────────── */

  function updatePlayer(dt) {
    let target = cfg.speed;
    if (player.boost > 0) target *= 1.42;

    if (phase === 'ending') {
      // Won: ease off but keep rolling down the outro stretch, so the world is
      // still moving behind the results card. Lost: come to a stop instead —
      // coasting on through the obstacles that just beat you reads wrong.
      target = player.finished ? cfg.speed * 0.55 : 0;
    }

    player.speed = U.damp(player.speed, target, player.speed < target ? 1.1 : 1.4, dt);

    player.prevS = player.s;
    // Never run off the end of the generated road.
    player.s = Math.min(player.s + player.speed * dt, cfg.length - 25);

    const prevX = player.x;
    const minX = laneX(0), maxX = laneX(LANE_COUNT - 1);

    if (steerHold !== 0) {
      // Steady travel while held, at a pace the player can watch and stop.
      const rate = (LANE_W / LANE_CROSS_TIME) * vehicleDef.laneMul;
      player.x = U.clamp(player.x + steerHold * rate * dt, minX, maxX);
      // Track the nearest lane live so the cue and HUD follow the vehicle.
      player.targetLane = laneOf(player.x);
      if ((player.x === minX || player.x === maxX) && !player.edgeHit) {
        player.edgeHit = true;
        AU.bump();                       // you're against the outside lane
      } else if (player.x !== minX && player.x !== maxX) {
        player.edgeHit = false;
      }
    } else {
      // Let go and it eases onto the nearest lane centre — at most half a lane,
      // so it reads as settling rather than a jolt.
      player.edgeHit = false;
      player.x = U.damp(player.x, laneX(player.targetLane), SETTLE_LAMBDA, dt);
    }
    player.lane = laneOf(player.x);

    player.invuln = Math.max(0, player.invuln - dt);
    player.boost = Math.max(0, player.boost - dt);
    player.shieldT = Math.max(0, player.shieldT - dt);
    player.magnetT = Math.max(0, player.magnetT - dt);
    if (player.stunt > 0) player.stunt = Math.max(0, player.stunt - dt);

    updatePlayerPose(dt, (player.x - prevX) / Math.max(dt, 0.0001));
  }

  function updatePlayerPose(dt, lateralVel) {
    const fr = world.frameAt(player.s);
    world.pointAt(player.s, player.x, player.mesh.position);
    player.bob += dt * (6 + player.speed * 0.1);

    // Lean out of the actual sideways motion, so it reads during a lane change
    // and settles to level the moment the vehicle arrives.
    const lv = U.clamp((lateralVel || 0) / 12, -1, 1);
    player.lean = U.damp(player.lean, lv * 0.3 + fr.curvature * 26, 7, dt);

    player.mesh.rotation.set(0, 0, 0);
    player.mesh.rotation.y = fr.yaw - lv * 0.12;
    player.mesh.rotation.z = -fr.bank - player.lean;

    if (player.stunt > 0) {
      const t = 1 - (player.stunt / 1.35);
      player.mesh.rotation.z += t * Math.PI * 2;
      player.mesh.position.y += Math.sin(t * Math.PI) * 3.6;
    }

    if (vehicleDef.key === 'spaceship') {
      player.mesh.position.y += 1.1 + Math.sin(player.bob * 0.5) * 0.22;
      if (player.mesh.userData.thrusters) {
        const f = 0.7 + (player.boost > 0 ? 0.9 : 0) + Math.sin(player.bob * 3) * 0.12;
        player.mesh.userData.thrusters.forEach((th) => { th.scale.set(1, f, 1); });
      }
    } else if (player.mesh.userData.wheels) {
      const wheels = player.mesh.userData.wheels;
      for (let i = 0; i < wheels.length; i++) wheels[i].rotation.x -= player.speed * dt * 1.25;
      player.mesh.position.y += Math.abs(Math.sin(player.bob * 1.7)) * 0.045;
    }

    player.mesh.visible = !(player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0 && player.stunt <= 0);

    // A quick squash-and-stretch punch whenever something is picked up.
    if (player.punch > 0) {
      player.punch = Math.max(0, player.punch - dt * 3.2);
      const p = Math.sin(player.punch * Math.PI) * 0.16;
      player.mesh.scale.set(1 + p, 1 + p * 1.6, 1 - p * 0.4);
    } else {
      player.mesh.scale.set(1, 1, 1);
    }

    if (player.fx) {
      player.fx.position.copy(player.mesh.position);
      player.fx.rotation.copy(player.mesh.rotation);
      A.updateVehicleFx(player.fx, {
        shield: player.shieldT, boost: player.boost, magnet: player.magnetT
      }, dt, performance.now() * 0.001);
    }
  }

  /* ── Camera ───────────────────────────────────────────────────────────── */

  function updateCamera(dt, snap) {
    // Follow the vehicle's lane closely. Lagging behind it (as a racing game
    // normally would) leaves the car viewed three-quarters from an outer lane,
    // which reads as "the car is driving crooked" even when it is dead straight.
    const back = world.frameAt(Math.max(0, player.s - CAM_BACK));
    _camTarget.copy(back.pos).addScaledVector(back.right, player.x * 0.88);
    _camTarget.y += CAM_HEIGHT + (vehicleDef.key === 'spaceship' ? 1.0 : 0);

    if (snap) camera.position.copy(_camTarget);
    else camera.position.lerp(_camTarget, 1 - Math.exp(-7.5 * dt));

    const ahead = world.frameAt(Math.min(cfg.length, player.s + CAM_AHEAD));
    _lookTarget.copy(ahead.pos).addScaledVector(ahead.right, player.x * 0.82);
    _lookTarget.y += 3.4;
    camera.lookAt(_lookTarget);

    const bank = world.frameAt(player.s).bank;
    let roll = -bank * 0.45;
    if (player.stunt > 0) {
      const t = 1 - (player.stunt / 1.35);
      roll += Math.sin(t * Math.PI * 2) * 0.4;
    }
    camera.rotateZ(roll);

    if (shake > 0) {
      shake = Math.max(0, shake - dt * 2.2);
      const m = shake * shake * 1.1;
      camera.position.x += (Math.random() - 0.5) * m;
      camera.position.y += (Math.random() - 0.5) * m;
      camera.position.z += (Math.random() - 0.5) * m;
    }

    const speedNorm = U.clamp(player.speed / 60, 0, 1);
    const wantFov = CAM_FOV + speedNorm * 10 + (player.boost > 0 ? 7 : 0);
    if (Math.abs(camera.fov - wantFov) > 0.05) {
      camera.fov = U.damp(camera.fov, wantFov, 3.5, dt);
      camera.updateProjectionMatrix();
    }
  }

  function updateAttractCamera(dt) {
    if (!preview) attractS += dt * 16;
    if (attractS > world.length - 120) attractS = 0;
    const fr = world.frameAt(attractS);
    const sway = Math.sin(attractS * 0.012) * 4;
    _camTarget.copy(fr.pos).addScaledVector(fr.right, sway);
    _camTarget.y += 7.5;
    camera.position.lerp(_camTarget, 1 - Math.exp(-3 * dt));

    const ahead = world.frameAt(attractS + 40);
    _lookTarget.copy(ahead.pos);
    _lookTarget.y += 3.0;
    camera.lookAt(_lookTarget);
    world.update(dt, camera.position, fr.pos);
  }

  /* ── Finish ───────────────────────────────────────────────────────────── */

  function placeOf() {
    let ahead = 0;
    for (let i = 0; i < layout.traffic.length; i++) {
      if (layout.traffic[i].isRival && layout.traffic[i].s > player.s) ahead++;
    }
    return ahead + 1;
  }

  function ordinal(n) {
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return n + 'th';
  }

  function computeProgress() {
    if (!player || !layout) return 0;
    if (cfg.mode === 'casual') {
      if (!isFinite(layout.finishS)) return cfg.items ? player.collected / cfg.items : 0;
      const from = layout.outroFrom || 0;
      return U.clamp((player.s - from) / Math.max(1, layout.finishS - from), 0, 1);
    }
    return U.clamp(player.s / layout.finishS, 0, 1);
  }

  function endRun(won) {
    if (phase === 'ending') return;
    phase = 'ending';
    if (player) player.finished = won;
    emitCue(0, false);
    setDanger(false);
    if (!won) AU.stopEngine();   // a win keeps its engine for the coast-down

    const result = {
      won: won,
      progressPct: computeProgress(),
      mode: cfg.mode,
      vehicle: vehicleDef.key,
      vehicleName: vehicleDef.name,
      level: cfg.level,
      time: elapsed,
      crashes: player.crashes,
      collected: player.collected,
      target: cfg.items,
      place: cfg.rivals ? placeOf() : 0,
      placeText: cfg.rivals ? ordinal(placeOf()) : '',
      newUnlock: false,
      newBest: false,
      finale: false
    };

    if (won) {
      AU.fanfare();
      if (cfg.mode === 'competitive') {
        result.newUnlock = recordWin(vehicleDef.key, cfg.level);
        result.newBest = recordTime(vehicleDef.key, cfg.level, elapsed);
        result.finale = cfg.level >= MAX_LEVEL;
      }
    } else {
      AU.fail();
    }

    if (callbacks.onFinish) callbacks.onFinish(result);
  }

  /* ── HUD ──────────────────────────────────────────────────────────────── */

  function pushHud() {
    if (!callbacks.onHud || !cfg || !player) return;
    callbacks.onHud({
      mode: cfg.mode,
      level: cfg.level,
      vehicleName: vehicleDef.name,
      hearts: player.hearts,
      speed: Math.round(player.speed * 2.2),
      progress: computeProgress(),
      collected: player.collected,
      target: cfg.items,
      itemEmoji: vehicleDef.casual.emoji,
      place: cfg.rivals ? ordinal(placeOf()) : '',
      time: elapsed,
      shield: player.shieldT,
      magnet: player.magnetT,
      boost: player.boost,
      lane: player.targetLane,
      laneCount: LANE_COUNT
    });
  }

  /* ── Main update ──────────────────────────────────────────────────────── */

  let hudAccum = 0;

  function update(dt) {
    if (!world) return;

    if (phase === 'attract') {
      updateAttractCamera(dt);
      updatePreview(dt);
      return;
    }

    if (phase === 'paused') {
      world.update(0, camera.position, player ? player.mesh.position : camera.position);
      return;
    }

    if (phase === 'countdown') {
      const before = Math.ceil(countdown);
      countdown -= dt;
      const after = Math.ceil(countdown);
      if (after !== before && callbacks.onCountdown) {
        callbacks.onCountdown(Math.max(0, after));
        AU.countdown(Math.max(0, after));
      }
      if (countdown <= 0) {
        phase = 'racing';
        if (callbacks.onCountdown) callbacks.onCountdown(-1);
      }
      updateCamera(dt, false);
      world.update(dt, camera.position, player.mesh.position);
      updateSpinners(dt);
      return;
    }

    if (phase === 'racing') {
      elapsed += dt;
      updatePlayer(dt);
      updateTraffic(dt);
      updateCues(dt);
      updateDanger();
      checkCollisions(dt);
      recycleMissedItems();
      if (phase !== 'racing') return;   // a crash may have ended the run

      if (player.s >= layout.finishS) { endRun(true); return; }
      if (player.s > cfg.length - 60 && cfg.mode === 'casual') {
        placeFinish(layout, cfg.length - 20);
      }
    }

    if (phase === 'ending') {
      // The race is over but the scene isn't: keep the vehicle and the traffic
      // rolling so the results card lands over a living world rather than a
      // freeze-frame.
      steerHold = 0;
      updatePlayer(dt);
      updateTraffic(dt);
    }

    if (phase === 'racing' || phase === 'ending') {
      cullDistant();
      updateSpinners(dt);
      updateCamera(dt, false);
      world.update(dt, camera.position, player.mesh.position);
      AU.updateEngine(U.clamp(player.speed / 60, 0, 1), player.boost > 0);

      hudAccum += dt;
      if (hudAccum > 0.1) { hudAccum = 0; pushHud(); }
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      if (!A.updateBurst(bursts[i], dt)) {
        scene.remove(bursts[i]);
        bursts.splice(i, 1);
      }
    }
  }

  /**
   * Hide gameplay props that are too far down the road to see.
   *
   * The fog has already swallowed anything past ~600 m, but three.js still
   * submits every one of them — and obstacles are the densest objects in the
   * scene. Toggling whole clusters keeps the draw-call count roughly constant
   * however long the track is, which is what makes level 10 as smooth as
   * level 1 on a tablet.
   */
  const CULL_AHEAD = 620;
  const CULL_BEHIND = 40;

  function cullDistant() {
    const showGates = cueLevel >= CUE_VISUAL;
    const from = player.s - CULL_BEHIND, to = player.s + CULL_AHEAD;

    for (let i = 0; i < layout.groups.length; i++) {
      const g = layout.groups[i];
      if (g.retired) continue;          // past the finish; stays hidden for good
      const vis = g.s > from && g.s < to;
      if (g.visCache === vis) continue;
      g.visCache = vis;
      for (let j = 0; j < g.obstacles.length; j++) {
        const o = g.obstacles[j];
        if (o.alive) o.mesh.visible = vis;
      }
      for (let j = 0; j < g.gates.length; j++) g.gates[j].visible = vis && showGates;
    }

    const cullList = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        if (!o.alive) continue;
        const vis = o.s > from && o.s < to;
        if (o.visCache === vis) continue;
        o.visCache = vis;
        o.mesh.visible = vis;
        if (o.beacon) o.beacon.visible = vis;
      }
    };
    cullList(layout.items);
    cullList(layout.powerups);
  }

  /**
   * Put missed collectibles back on the road ahead.
   *
   * Casual only ends once everything has actually been collected, so a pickup
   * that slips past must come round again — otherwise the player is left
   * driving an empty road with a counter that can never finish.
   */
  function recycleMissedItems() {
    if (cfg.mode !== 'casual' || isFinite(layout.finishS)) return;
    for (let i = 0; i < layout.items.length; i++) {
      const it = layout.items[i];
      if (!it.alive || it.s > player.s - 14) continue;

      const ahead = player.s + Math.max(200, player.speed * (13 + Math.random() * 6));
      it.s = Math.min(ahead, cfg.length - 260);
      it.lane = Math.floor(Math.random() * LANE_COUNT);
      it.x = laneX(it.lane);
      world.pointAt(it.s, it.x, it.mesh.position);
      if (it.beacon) world.pointAt(it.s, it.x, it.beacon.position);
      it.visCache = undefined;      // let the distance cull re-evaluate it
    }
  }

  function updateSpinners(dt) {
    const t = performance.now() * 0.001;
    for (let i = 0; i < layout.powerups.length; i++) {
      const p = layout.powerups[i];
      if (!p.alive || !p.mesh.visible) continue;
      p.mesh.rotation.y += dt * 1.5;
      p.mesh.position.y = world.frameAt(p.s).y + Math.sin(t * 2 + p.s) * 0.35;
    }
    for (let i = 0; i < layout.rings.length; i++) {
      if (layout.rings[i].alive) layout.rings[i].mesh.rotation.z += dt * 0.55;
    }
    for (let i = 0; i < layout.items.length; i++) {
      const it = layout.items[i];
      if (!it.alive || !it.mesh.visible) continue;
      it.mesh.rotation.y += dt * 1.1;
      it.mesh.position.y = world.frameAt(it.s).y + Math.sin(t * 2.2 + it.bob) * 0.4;
      if (it.beacon) A.updateItemBeacon(it.beacon, t + it.bob);
    }
    for (let i = 0; i < layout.spinners.length; i++) {
      const m = layout.spinners[i];
      if (!m.userData.tumble) continue;
      m.rotation.x += m.userData.tumble[0] * dt;
      m.rotation.y += m.userData.tumble[1] * dt;
    }
  }

  /**
   * Angle between where the vehicle is pointing and where the track actually
   * goes. Should sit near 0° at all times; anything else means a yaw-convention
   * regression, which is very hard to judge by eye from a chase camera.
   */
  function debugAlignment() {
    if (!player || !world || !player.mesh) return null;
    const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(player.mesh.quaternion);
    const fwd = world.frameAt(player.s).forward.clone();
    const dot = U.clamp(facing.dot(fwd), -1, 1);
    return {
      angleDeg: +(Math.acos(dot) * 180 / Math.PI).toFixed(2),
      facing: [+facing.x.toFixed(3), +facing.z.toFixed(3)],
      track: [+fwd.x.toFixed(3), +fwd.z.toFixed(3)],
      headingDeg: +(world.frameAt(player.s).heading * 180 / Math.PI).toFixed(2)
    };
  }

  /**
   * What the guidance is currently pointing at, and what it *should* be
   * pointing at. Used to check the cue never contradicts the objective.
   */
  function debugCue() {
    if (!player || !layout) return null;
    const lead = Math.max(28, player.speed * cfg.leadTime);
    const want = nextBonusTarget(lead * 2.2);
    let cluster = null;
    for (let i = 0; i < layout.groups.length; i++) {
      const g = layout.groups[i];
      if (!g.passed && g.s >= player.s - 6) { cluster = g; break; }
    }
    const near = cluster && (cluster.s - player.s) <= lead;
    return {
      dir: cuedDir,
      lane: player.targetLane,
      want: want,
      wantBlocked: (near && want !== null) ? !!cluster.blocked[want] : false,
      hereBlocked: near ? !!cluster.blocked[player.targetLane] : false,
      near: !!near,
      blocked: near ? cluster.blocked.map(function (b) { return b ? 1 : 0; }).join('') : null,
      clusterDs: cluster ? Math.round(cluster.s - player.s) : null,
      lead: Math.round(lead),
      items: layout.items.filter((i) => i.alive)
        .map((i) => ({ lane: i.lane, ds: Math.round(i.s - player.s) }))
        .filter((i) => i.ds > -20 && i.ds < 400)
    };
  }

  /**
   * Traffic overlap right now: `overlapping` counts vehicles genuinely in
   * contact, `through` counts any that are interpenetrating well past the
   * contact threshold — which should always be zero if the push is working.
   */
  function debugTraffic() {
    if (!player || !layout) return null;
    const pHalf = vehicleDef.halfWidth;
    let overlapping = 0, through = 0;
    for (let i = 0; i < layout.traffic.length; i++) {
      const t = layout.traffic[i];
      if (Math.abs(t.s - player.s) > 5.0) continue;
      const gap = Math.abs(t.x - player.x);
      if (gap < pHalf + 1.3) overlapping++;
      if (gap < (pHalf + 1.3) * 0.45) through++;
    }
    return { overlapping, through };
  }

  /** Park a traffic vehicle right on top of the player, to test contact. */
  function debugRamTraffic() {
    if (!player || !layout || !layout.traffic.length) return null;
    const t = layout.traffic[0];
    t.s = player.s + 2;
    t.lane = player.targetLane;
    t.x = player.x;
    t.speed = player.speed;          // ride alongside instead of shooting past
    t.bumpTimer = 0;
    return { s: t.s, x: +t.x.toFixed(2) };
  }

  /** Hand the player a power-up on demand, for checking its effects. */
  function debugGrantPower(kind) {
    if (!player) return null;
    if (kind === 'shield') player.shieldT = 6;
    else if (kind === 'boost') player.boost = 6;
    else if (kind === 'magnet') player.magnetT = 6;
    player.punch = 1;
    return { shield: player.shieldT, boost: player.boost, magnet: player.magnetT };
  }

  /* ── Public ───────────────────────────────────────────────────────────── */

  return {
    debugAlignment, debugGrantPower, debugCue, debugTraffic, debugRamTraffic,
    VEHICLES, VEHICLE_ORDER, MAX_LEVEL, LANE_COUNT,
    init, loadAttract, startRun, quitToMenu, disposeRun,
    pause, resume, update,
    isRacing, getPhase,
    setSteerHold, getSteerHold, setLaneTarget, getCuedDirection, getLaneInfo,
    getCueLevel, setCueLevel, cycleCueLevel, setCueSpeech,
    setPreview,
    getProgress, unlockedFor, resetProgress, bestTime,
    levelConfig,
    callbacks
  };
})();
