/**
 * NARBE Racer — deterministic track-space racing.
 *
 * Only this module moves racers, collects track features and resolves hits.
 * Input, CPUs and guidance choose a lane; they never need to know the shape
 * of the road. Rendering follows the resulting pose, including jumps and the
 * rescue flight, so a camera or a second view cannot change the simulation.
 */
NK.race = (function () {
  'use strict';

  const C = NK.C, U = NK.util;
  const TAU = Math.PI * 2;
  const TIMERS = ['boostT', 'starT', 'megaT', 'jetT', 'shrinkT', 'spinT', 'wobbleT', 'invulnT'];
  const SPARKS = [0x4fbaff, 0xffad2d, 0xc36aff];
  const EMPTY_CUE = () => ({ dir: 0, active: false, targetLane: 2, danger: false, reason: '' });

  function create(options) {
    const o = options || {}, W = o.world, scene = o.scene;
    if (!W || !scene) throw new Error('NK.race.create needs a world and a scene');
    const modeId = C.MODES[o.mode] ? o.mode : 'nofail';
    const events = Object.create(null);
    const ownedMaterials = [];
    const raceRoot = new THREE.Group();
    raceRoot.name = 'race';
    scene.add(raceRoot);
    const noFX = () => {};
    const fx = NK.art.fx && NK.art.fx.create ? NK.art.fx.create(scene) : {
      sparks: noFX, flame: noFX, smoke: noFX, dust: noFX, confetti: noFX,
      burst: noFX, splash: noFX, stars: noFX, update: noFX, clear: noFX, dispose: noFX
    };
    const R = {
      world: W, scene, modeId, mode: C.MODES[modeId],
      classDef: C.CLASSES[o.classId] || C.CLASSES.easy,
      laps: Math.max(1, Math.floor(o.laps || C.LAPS)), L: W.L,
      timeTrial: !!o.timeTrial, racers: [], humans: [],
      phase: 'intro', introTime: 0, countdown: 3, time: 0,
      rng: U.rng(o.seed === undefined ? ((W.track && W.track.seed) || 1) ^ 0x734b91 : o.seed),
      fx, itemObjects: [],
      update, setSteer, setTargetLane, pressed, setAutopilot,
      hitRacer, boost, giveCoins, standings, byPlace: standings,
      placeOf: (r) => r ? r.place : 0,
      ahead: (r) => standings().find((a) => a.place === r.place - 1) || null,
      gap: (a, b) => a.progress - b.progress,
      cueOf: (i) => R.humans[i] ? R.humans[i].cue : EMPTY_CUE(),
      on, emit, dispose, skipIntro
    };
    const F = Object.assign({ itemRows: [], padRows: [], boostPads: [], coins: [], ramps: [], hazards: [] }, W.features);
    const handles = W.handles || {};
    const boxReady = F.itemRows.map(() => new Float64Array(C.LANE_COUNT));
    const coinReady = new Float64Array(F.coins.length);
    const pairReady = new Map();
    const pos = new THREE.Vector3(), local = new THREE.Vector3(), backward = new THREE.Vector3();
    const qLocal = new THREE.Quaternion(), eLocal = new THREE.Euler();
    let disposed = false, countdownT = 3, endAt = null, finalOrder = null, visualTime = 0;

    function on(name, fn) {
      if (typeof fn !== 'function') return noFX;
      (events[name] || (events[name] = [])).push(fn);
      return () => {
        const list = events[name], i = list ? list.indexOf(fn) : -1;
        if (i >= 0) list.splice(i, 1);
      };
    }
    function emit(name, ...args) {
      const list = events[name];
      if (list) list.slice().forEach((fn) => fn(...args));
    }
    function visibility(handle, visible) {
      if (!handle) return;
      if (typeof handle.set === 'function') handle.set(visible);
      else handle.visible = visible;
    }
    function lights(n) {
      const g = W.gantry;
      if (g && g.userData && g.userData.setLights) g.userData.setLights(n);
    }
    function surfaceY(s, x) { return W.pointAt(s, x, pos).y; }
    function racerPoint(r, lift) {
      W.pointAt(r.s, r.x, pos);
      pos.y += r.y + (lift || 0);
      return pos;
    }

    /** Player identity is attached to the race, not the model: a protection
     * flicker, spin or giant kart must never hide the way to find yourself.
     * game.beforeView selects the matching ring for each camera. */
    function playerIdentity(human) {
      if (typeof document === 'undefined') return { marker: null, ring: null };
      const color = C.PLAYER_COLORS[human] || C.PLAYER_COLORS[0];
      const ring = new THREE.Group();
      ring.name = 'playerRing:' + human;
      [[1.55, 2.08, '#fffdf5'], [1.60, 2.03, '#171827'], [1.69, 1.94, color]].forEach((band, i) => {
        const mat = new THREE.MeshBasicMaterial({ color: band[2], depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
        const mesh = new THREE.Mesh(new THREE.RingGeometry(band[0], band[1], 64), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = i * 0.006;
        mesh.renderOrder = 2 + i;
        ring.add(mesh); ownedMaterials.push(mat);
      });
      raceRoot.add(ring);
      return { marker: null, ring };
    }

    const humans = o.humans || [];
    const specs = humans.concat(R.timeTrial ? [] : (o.cpus || []));
    const slots = W.startGrid(specs.length);
    // An explicit grid is front-to-back racer indices. By default humans
    // start at the back; their stable indices still remain 0 and 1.
    const order = [], requested = Array.isArray(o.grid) ? o.grid : [];
    requested.forEach((idx) => {
      if (Number.isInteger(idx) && idx >= 0 && idx < specs.length && order.indexOf(idx) < 0) order.push(idx);
    });
    const defaultOrder = specs.map((_, i) => i).filter((i) => i >= humans.length)
      .concat(specs.map((_, i) => i).filter((i) => i < humans.length));
    defaultOrder.forEach((i) => { if (order.indexOf(i) < 0) order.push(i); });

    specs.forEach((spec, idx) => {
      const character = NK.roster.character(spec.charId);
      const vehicle = NK.roster.vehicle(spec.vehicleId);
      const slot = slots[order.indexOf(idx)] || { progress: -4, x: 0 };
      const mesh = NK.roster.build(character.id, vehicle.id);
      raceRoot.add(mesh);
      const shadow = new THREE.Group();
      const blob = NK.art.blobShadow(4.3);
      blob.material = blob.material.clone();
      shadow.add(blob);
      raceRoot.add(shadow);
      const ud = mesh.userData;
      const identity = idx < humans.length ? playerIdentity(idx) : { marker: null, ring: null };
      const r = {
        idx, isHuman: idx < humans.length, human: idx < humans.length ? idx : -1,
        charId: character.id, vehicleId: vehicle.id, name: character.name,
        oneSwitch: !!spec.oneSwitch, stats: NK.roster.statsFor(character.id, vehicle.id),
        progress: slot.progress, s: U.mod(slot.progress, W.L), lap: 1,
        x: slot.x, y: 0, vy: 0, v: 0, steer: 0,
        targetLane: C.laneOf(slot.x), lane: C.laneOf(slot.x), stepTarget: null,
        armedDir: -1, place: order.indexOf(idx) + 1, finished: false, finishTime: null,
        coins: 0, item: null, itemUseT: 0, itemUseDelay: 0, _timedItem: null,
        roulette: 0, rouletteKind: null,
        boostT: 0, starT: 0, megaT: 0, jetT: 0, shrinkT: 0,
        spinT: 0, wobbleT: 0, invulnT: 0, fallT: 0, rescueT: 0, airT: 0,
        drift: { dir: 0, charge: 0, level: 0, outT: 0, endT: 0 },
        mesh, shadow, playerMarker: identity.marker, playerRing: identity.ring,
        ai: null, cue: EMPTY_CUE(), autopilot: false,
        gliding: false, latVel: 0, _humanSteer: 0, _wasAuto: false,
        _prevProgress: slot.progress, _prevX: slot.x,
        _highestLap: 1, _rocketStart: false, _clampSide: 0, _puddle: false,
        _fall: null, _rescue: null, _jump: null, _fxT: 0, _scale: 1,
        _visual: { blob, driverY: ud.driver ? ud.driver.position.y : 0, aura: null, jet: null, drone: null }
      };
      R.racers.push(r);
      if (r.isHuman) R.humans.push(r);
      if (R.timeTrial && idx === 0) NK.items.give(R, r, 'rocket3');
      if (NK.ai && NK.ai.init) NK.ai.init(R, r, ((W.track && W.track.seed) || 1) + idx * 131);
    });
    if (R.timeTrial && handles.boxes) handles.boxes.forEach((row) => row.forEach((h) => visibility(h, false)));
    lights(-1);
    visuals(0);

    function setSteer(i, dir) {
      const r = R.humans[i];
      if (!r || r.finished) return;
      r.steer = Math.sign(Number(dir) || 0);
      r._humanSteer = r.steer;
      if (r.steer) r.stepTarget = null;
    }
    function setTargetLane(i, lane) {
      const r = R.humans[i];
      if (!r || r.finished || !Number.isFinite(lane)) return;
      r.steer = 0;
      r._humanSteer = 0;
      r.targetLane = r.stepTarget = U.clamp(Math.round(lane), 0, C.LANE_COUNT - 1);
    }
    function pressed(i) {
      const r = R.humans[i];
      if (r && R.phase === 'countdown' && R.countdown <= 2) r._rocketStart = true;
    }
    function setAutopilot(i, on) {
      const r = R.humans[i];
      if (!r) return;
      r.autopilot = !!on;
      r.steer = r._humanSteer = 0;
      r.stepTarget = null;
      r.targetLane = C.laneOf(r.x);
    }
    function go() {
      R.phase = 'racing'; R.countdown = 0; R.time = 0;
      lights(0);
      R.racers.forEach((r) => {
        r.v = 0;
        if (r._rocketStart) boost(r, 1.2, 'rocketStart');
      });
      emit('go');
    }
    function skipIntro() {
      if (R.phase === 'intro' || R.phase === 'countdown') {
        R.introTime = 2.5;
        countdownT = 0;
        go();
      }
    }
    function boost(r, seconds, src) {
      if (!r || !(seconds > 0) || r.fallT > 0 || r.rescueT > 0) return;
      r.boostT = Math.max(r.boostT, seconds);
      emit('boost', r, src || 'item');
    }
    function giveCoins(r, n) {
      if (!r) return;
      const before = r.coins;
      r.coins = U.clamp(r.coins + Math.floor(n || 0), 0, C.COIN_MAX);
      if (r.coins !== before) emit('coin', r);
    }
    function clearDrift(r) {
      const d = r.drift;
      d.dir = d.charge = d.level = d.outT = d.endT = 0;
    }
    function hitRacer(victim, cause) {
      const r = typeof victim === 'number' ? R.racers[victim] : victim;
      if (!r || r.finished || r.invulnT > 0 || r.starT > 0 || r.megaT > 0 || r.jetT > 0 || r.fallT > 0 || r.rescueT > 0) return false;
      const kind = r.isHuman ? R.mode.hitKind : 'spin', h = C.HIT[kind];
      r[kind === 'spin' ? 'spinT' : 'wobbleT'] = h.time;
      r.invulnT = h.invuln;
      r.v *= h.speedMul;
      if (h.coinLoss) giveCoins(r, -h.coinLoss);
      clearDrift(r);
      fx.burst(racerPoint(r, 1), kind === 'spin' ? 0xffa345 : 0x8acfff, 18);
      emit('hit', r, cause || { kind: 'hazard', by: null });
      return true;
    }
    function standings() {
      if (finalOrder) return finalOrder.slice();
      return R.racers.slice().sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished) return a.finishTime - b.finishTime || a.idx - b.idx;
        return b.progress - a.progress || a.idx - b.idx;
      });
    }
    function steerSpeed(r) {
      const setting = NK.game && NK.game.settings ? NK.game.settings.get('steerSpeed') : (o.steerSpeed || 'normal');
      const speed = C.STEER_SPEEDS[setting] || C.STEER_SPEEDS.normal;
      return C.LANE_W / (speed.laneTime * r.stats.handlingMul);
    }
    function updateTimers(r, dt) {
      TIMERS.forEach((key) => { r[key] = Math.max(0, r[key] - dt); });
      if (r.roulette > 0) {
        if (r.finished || r.fallT > 0 || r.rescueT > 0) return;
        r.roulette = Math.max(0, r.roulette - dt);
        if (r.roulette === 0) {
          NK.items.give(R, r, r.rouletteKind || 'rocket');
          emit('itemGet', r, r.item);
        }
      } else if (NK.items && NK.items.tickHeld) NK.items.tickHeld(R, r, dt);
    }
    function turbo(r) {
      const d = r.drift, level = d.level;
      clearDrift(r);
      if (level > 0) {
        boost(r, C.MINI_TURBO[level - 1], 'turbo');
        emit('turbo', r, level);
      }
    }
    function drift(r, dt) {
      if (r.airT > 0 || r.spinT > 0 || r.fallT > 0 || r.rescueT > 0 || r.v < 3) { clearDrift(r); return; }
      const k = W.frameAt(r.s).curvature, abs = Math.abs(k), dir = Math.sign(k), d = r.drift;
      if (d.dir && abs >= C.DRIFT_K && dir !== d.dir) turbo(r);
      if (abs >= C.DRIFT_K) {
        d.dir = dir;
        d.endT = 0;
        const inside = Math.sign(r.x) === dir && Math.abs(r.x) >= 1;
        if (inside || R.mode.guardrails) {
          d.charge += dt * (inside ? 1 : 0.7);
          d.outT = 0;
          const level = C.DRIFT_LEVELS.reduce((n, t) => n + (d.charge >= t ? 1 : 0), 0);
          if (level > d.level) { d.level = level; emit('driftLevel', r, level); }
        } else {
          d.outT += dt;
          if (d.outT > 0.4) turbo(r);
        }
      } else if (d.dir && abs < C.DRIFT_END_K) {
        d.endT += dt;
        if (d.endT >= 0.15) turbo(r);
      }
    }
    function beginFall(r) {
      if (r.fallT > 0 || r.rescueT > 0 || r.finished || !R.mode.canFall) return;
      r._fall = { progress: r.progress, vx: r.latVel || Math.sign(r.x) * 2.5 };
      r.fallT = 1;
      r.vy = Math.min(0, r.vy);
      r.airT = 0;
      r.gliding = false;
      r._jump = null;
      r.boostT = 0;
      clearDrift(r);
      emit('fall', r);
    }
    function clampEdges(r, dt) {
      const limits = W.limits(r.s);
      if (!r.finished && R.mode.canFall && (r.x < limits.fallL || r.x > limits.fallR)) {
        beginFall(r); return;
      }
      const minX = r.finished ? Math.max(limits.minX, C.laneX(0)) : limits.minX;
      const maxX = r.finished ? Math.min(limits.maxX, C.laneX(C.LANE_COUNT - 1)) : limits.maxX;
      const side = r.x < minX ? -1 : r.x > maxX ? 1 : 0;
      if (side) {
        r.x = U.clamp(r.x, minX, maxX);
        if (r._clampSide !== side) emit('bump', r, null);
        const edge = W.edgeAt(r.s);
        if ((side < 0 ? edge.left : edge.right) === 'wall') r.v *= Math.pow(0.97, dt);
      }
      // Keep the latch while a held switch presses against the same edge.
      // The second edge check (after forward motion) must not re-arm a bump
      // just because the first check already put x exactly on the clamp.
      r._clampSide = side || (r.steer < 0 && r.x <= minX + 0.001 ? -1 :
        r.steer > 0 && r.x >= maxX - 0.001 ? 1 : 0);
    }
    function rescuePhysics(r, dt) {
      if (r.fallT > 0) {
        const oldY = surfaceY(r.s, r.x);
        r.fallT = Math.max(0, r.fallT - dt);
        r.progress += r.v * 0.22 * dt;
        r.x += r._fall.vx * dt;
        r.s = U.mod(r.progress, R.L);
        r.vy -= 26 * dt;
        r.y += r.vy * dt + oldY - surfaceY(r.s, r.x);
        if (r.fallT === 0) {
          // Never set a kart down where a jump's gap has no road.
          let target = Math.max(-40, r._fall.progress - 10);
          if (W.safeProgress) target = W.safeProgress(target);
          r._rescue = { progress: r.progress, x: r.x, y: r.y, target };
          r.rescueT = 1.4;
          r.v = r.vy = 0;
        }
        return true;
      }
      if (r.rescueT > 0) {
        r.rescueT = Math.max(0, r.rescueT - dt);
        const q = r._rescue, u = 1 - r.rescueT / 1.4, eased = U.smoothstep(u);
        r.progress = U.lerp(q.progress, q.target, eased);
        r.s = U.mod(r.progress, R.L);
        r.x = U.lerp(q.x, 0, eased);
        r.y = U.lerp(q.y, 0, eased) + Math.sin(Math.PI * u) * Math.max(9, 5 - q.y);
        r.latVel = 0;
        if (r.rescueT === 0) {
          r.y = r.vy = r.v = 0;
          r.x = 0;
          r.targetLane = r.lane = C.MID_LANE;
          r.stepTarget = null;
          r.invulnT = C.HIT.spin.invuln;
          r._fall = r._rescue = null;
          emit('rescued', r);
        }
        return true;
      }
      return false;
    }
    function physics(r, dt) {
      r._prevProgress = r.progress;
      r._prevX = r.x;
      updateTimers(r, dt);
      if (rescuePhysics(r, dt)) return;
      const oldGround = surfaceY(r.s, r.x);
      const rate = steerSpeed(r);
      if (r.spinT === 0) {
        if (Number.isFinite(r.stepTarget)) {
          r.targetLane = U.clamp(Math.round(r.stepTarget), 0, C.LANE_COUNT - 1);
          const distance = C.laneX(r.targetLane) - r.x;
          r.x += Math.sign(distance) * Math.min(Math.abs(distance), rate * dt);
          if (Math.abs(distance) <= rate * dt) r.stepTarget = null;
        } else if (r.steer) {
          r.x += U.clamp(r.steer, -1, 1) * rate * dt;
          r.targetLane = C.laneOf(r.x);
        } else r.x = U.damp(r.x, C.laneX(r.targetLane), C.SETTLE_LAMBDA, dt);
      }
      r.latVel = (r.x - r._prevX) / dt;
      clampEdges(r, dt);
      if (r.fallT > 0) return;
      r.latVel = (r.x - r._prevX) / dt;
      const offroad = Math.abs(r.x) > C.ROAD_HALF;
      let surface = offroad && R.mode.offroadSlow && !r.boostT && !r.starT && !r.jetT ? 0.62 : 1;
      if (r._puddle && r.airT === 0) surface *= 0.7;
      let effects = Math.max(r.boostT ? C.BOOST_MUL : 1, r.starT ? 1.25 : 1, r.megaT ? 1.12 : 1, r.jetT ? 1.75 : 1);
      if (r.shrinkT > 0) effects *= 0.72;
      const pace = !r.isHuman ? (NK.ai && NK.ai.pace ? NK.ai.pace(R, r) : R.mode.cpuPace) : 1;
      let target = R.classDef.speed * r.stats.speedMul * surface * effects * pace;
      if (r.spinT > 0) target = 0;
      r.v = U.damp(r.v, target, target > r.v ? r.stats.accelRate : 1.4, dt);
      // A loop is longer than the track it spans: the kart advances by metres
      // of road as driven, so its visible speed round the loop is its real
      // speed (and a frame that crosses into or out of a loop stays exact).
      r.progress = W.shiftS ? W.shiftS(r.progress, r.v * dt) : r.progress + r.v * dt;
      r.s = U.mod(r.progress, R.L);
      if (r.airT > 0) {
        r.airT += dt;
        let landed = false;
        if (r._jump) {
          const previousHeight = oldGround + r.y;
          r.y = jumpHeight(r, r.progress, r.x);
          r.vy = (surfaceY(r.s, r.x) + r.y - previousHeight) / dt;
          landed = r.progress >= r._jump.end;
        } else {
          r.vy -= (r.gliding ? 9 : 26) * dt;
          r.y += r.vy * dt + oldGround - surfaceY(r.s, r.x);
          landed = r.y <= 0 && r.vy <= 0;
        }
        if (landed) {
          r.y = r.vy = r.airT = 0;
          r.gliding = false;
          r._jump = null;
          boost(r, 0.5, 'trick');
          fx.stars(racerPoint(r, 1), 12);
          emit('land', r);
          emit('trick', r);
        }
      }
      r.lane = C.laneOf(r.x);
      clampEdges(r, dt);
      drift(r, dt);
    }

    /** First occurrence strictly after from. Works over the lap seam and
     * the negative grid without collecting anything a second time. */
    function crossing(s, from, to) {
      if (!(to > from)) return null;
      const at = s + (Math.floor((from - s) / R.L) + 1) * R.L;
      return at <= to ? at : null;
    }
    function xAt(r, progress) {
      const span = r.progress - r._prevProgress;
      return span > 0 ? U.lerp(r._prevX, r.x, U.clamp((progress - r._prevProgress) / span, 0, 1)) : r.x;
    }
    function onLanes(x, lanes, halfWidth) {
      return lanes.some((lane) => Math.abs(x - C.laneX(lane)) <= halfWidth);
    }
    function jumpHeight(r, progress, x) {
      const j = r._jump;
      if (!j) return r.y;
      if (progress < j.takeoff) return j.rampHeight * U.clamp((progress - j.start) / j.rampLength, 0, 1);
      const t = U.clamp((progress - j.takeoff) / (j.end - j.takeoff), 0, 1);
      const startY = surfaceY(j.takeoff, x) + j.rampHeight;
      const endY = surfaceY(j.end, x);
      return Math.max(0, U.lerp(startY, endY, t) + 4 * j.peakHeight * t * (1 - t) - surfaceY(progress, x));
    }
    function jump(r, row, at) {
      if (r.airT > 0) return;
      const spec = C.JUMPS[row.kind] || C.JUMPS.jump;
      const rampLength = row.len || spec.rampLength;
      r._jump = { start: at, takeoff: at + rampLength,
        end: at + rampLength + (row.flightLength || spec.flightLength),
        rampLength, rampHeight: row.rampHeight || spec.rampHeight,
        peakHeight: row.peakHeight || spec.peakHeight };
      r.gliding = row.kind === 'glide';
      r.y = jumpHeight(r, r.progress, r.x);
      r.vy = r.v * r._jump.rampHeight / rampLength;
      r.airT = 0.001;
      clearDrift(r);
      emit('jump', r, row.kind);
    }
    /** A gap ramp launches every kart that reaches it, whatever its lane:
     *  past its lip there is no road to drive on. */
    function launches(row, r, at) {
      return row.gap || onLanes(xAt(r, at), row.lanes, C.LANE_W * 0.5);
    }
    /** Set pieces passed this frame: waterfall curtains and loop entries. */
    function pieceCrossings(r, old, now) {
      const P = W.pieces;
      if (!P) return;
      for (let k = 0; k < P.falls.length; k++) {
        if (crossing(P.falls[k].s, old, now) !== null) {
          fx.splash(racerPoint(r, 1.2), 26);
          emit('splash', r, P.falls[k]);
        }
      }
      for (let k = 0; k < P.loops.length; k++) {
        if (crossing(P.loops[k].s0, old, now) !== null) emit('loop', r, P.loops[k]);
      }
    }
    function features(r) {
      r._puddle = false;
      if (r.fallT > 0 || r.rescueT > 0 || r.progress < r._prevProgress) return;
      const old = r._prevProgress, now = r.progress;
      pieceCrossings(r, old, now);
      if (r.finished) {
        // The cool-down lap still flies the gaps.
        if (r.airT === 0) F.ramps.forEach((row) => { const at = crossing(row.s, old, now); if (at !== null && row.gap) jump(r, row, at); });
        return;
      }
      if (r.airT === 0 && r.y < 2.6) {
        F.coins.forEach((coin, i) => {
          if (coinReady[i] > R.time) return;
          const at = crossing(coin.s, old, now);
          if (at === null || Math.abs(xAt(r, at) - C.laneX(coin.lane)) > 1.55) return;
          coinReady[i] = R.time + 10;
          visibility(handles.coins && handles.coins[i], false);
          giveCoins(r, 1);
          fx.stars(racerPoint(r, 1), 5);
        });
        if (!R.timeTrial) F.itemRows.forEach((row, i) => {
          const at = crossing(row.s, old, now);
          if (at === null) return;
          const x = xAt(r, at);
          row.lanes.forEach((lane) => {
            if (boxReady[i][lane] > R.time || Math.abs(x - C.laneX(lane)) > 1.65) return;
            boxReady[i][lane] = R.time + 2.2;
            visibility(handles.boxes && handles.boxes[i] && handles.boxes[i][lane], false);
            fx.burst(racerPoint(r, 1), 0x66baff, 16);
            emit('box', r);
            if (!r.item && r.roulette <= 0) {
              r.roulette = 1.4;
              r.rouletteKind = NK.items && NK.items.roll ? NK.items.roll(R, r) : 'rocket';
              // The coins held improved this roll (NK.items.odds); getting the item spends them.
              const spent = r.coins;
              r.coins = 0;
              emit('roulette', r);
              if (spent) emit('coinsSpent', r, spent);
            }
          });
        });
      }
      if (r.airT === 0) {
        F.boostPads.forEach((row) => {
          const at = crossing(row.s, old, now);
          if (at !== null && onLanes(xAt(r, at), row.lanes, C.LANE_W * 0.5)) boost(r, 1, 'pad');
        });
        F.padRows.forEach((row) => {
          const at = crossing(row.s, old, now);
          if (at !== null && (R.mode.padsAllLanes || onLanes(xAt(r, at), row.lanes, C.LANE_W * 0.5))) boost(r, 1, 'pad');
        });
        F.ramps.forEach((row) => {
          const at = crossing(row.s, old, now);
          if (at !== null && launches(row, r, at)) jump(r, row, at);
        });
      }
      F.hazards.forEach((hazard, i) => {
        const halfLength = (hazard.halfLength || 1.3) + C.KART_LEN * 0.5;
        const centre = old + U.loopDelta(U.mod(old, R.L), hazard.s, R.L);
        const overlap = now >= centre - halfLength && old <= centre + halfLength;
        if (!overlap) return;
        const state = W.hazardState(i, R.time);
        if (!state.active || Math.abs(xAt(r, centre) - state.x) > (hazard.halfWidth || 1.2) + C.KART_HALF) return;
        const at = U.clamp(centre, old, now);
        const height = r._jump ? jumpHeight(r, at, xAt(r, at)) : r.y;
        if (hazard.kind === 'puddle') { if (height < 0.35) r._puddle = true; }
        else if (height < (hazard.kind === 'geyser' ? 6 : hazard.kind === 'block' ? 2.5 : 2.1)) hitRacer(r, { kind: 'hazard', by: null, hazard: i });
      });
    }
    function respawnFeatures() {
      F.coins.forEach((_, i) => {
        if (coinReady[i] > 0 && coinReady[i] <= R.time) { coinReady[i] = 0; visibility(handles.coins && handles.coins[i], true); }
      });
      if (!R.timeTrial) F.itemRows.forEach((row, i) => row.lanes.forEach((lane) => {
        if (boxReady[i][lane] > 0 && boxReady[i][lane] <= R.time) {
          boxReady[i][lane] = 0;
          visibility(handles.boxes && handles.boxes[i] && handles.boxes[i][lane], true);
        }
      }));
    }
    function contacts(dt) {
      const racers = R.racers;
      for (let i = 0; i < racers.length; i++) for (let j = i + 1; j < racers.length; j++) {
        const a = racers[i], b = racers[j];
        if (a.finished || b.finished || a.fallT > 0 || b.fallT > 0 || a.rescueT > 0 || b.rescueT > 0 || Math.abs(a.y - b.y) > 1.8) continue;
        // Measured along the road as driven, so two karts round a loop
        // touch only when they really are side by side.
        const ds = W.arcGap ? W.arcGap(a.progress, b.progress) : U.loopDelta(a.s, b.s, R.L), dx = b.x - a.x;
        const width = C.KART_HALF * 2 + 0.1;
        if (Math.abs(ds) >= C.KART_LEN || Math.abs(dx) >= width) continue;
        const powered = (r) => r.jetT > 0 ? 'jet' : r.starT > 0 ? 'star' : r.megaT > 0 ? 'mega' : null;
        const ap = powered(a), bp = powered(b);
        if (ap) hitRacer(b, { kind: ap, by: a });
        if (bp) hitRacer(a, { kind: bp, by: b });
        const dir = dx === 0 ? (a.idx % 2 ? -1 : 1) : Math.sign(dx);
        const push = width - Math.abs(dx) + 0.015;
        const sum = a.stats.weight + b.stats.weight;
        a.x -= dir * push * b.stats.weight / sum;
        b.x += dir * push * a.stats.weight / sum;
        // Settling must keep the separated lanes, rather than pull the pair
        // immediately back together on the following frame.
        if (!Number.isFinite(a.stepTarget)) a.targetLane = C.laneOf(a.x);
        if (!Number.isFinite(b.stepTarget)) b.targetLane = C.laneOf(b.x);
        const key = i * racers.length + j;
        if ((pairReady.get(key) || 0) <= R.time) {
          (ds >= 0 ? a : b).v *= 0.94;
          pairReady.set(key, R.time + 0.45);
          emit('bump', a, b);
        }
        clampEdges(a, dt); clampEdges(b, dt);
        a.lane = C.laneOf(a.x); b.lane = C.laneOf(b.x);
      }
    }
    function positions(dt) {
      const justFinished = [], finishAt = R.laps * R.L;
      R.racers.forEach((r) => {
        r.s = U.mod(r.progress, R.L);
        r.lap = Math.min(R.laps, r.progress < 0 ? 1 : Math.floor(r.progress / R.L) + 1);
        if (!r.finished && r.progress >= finishAt) {
          const fraction = U.clamp((finishAt - r._prevProgress) / Math.max(0.0001, r.progress - r._prevProgress), 0, 1);
          r.finished = true;
          r.finishTime = R.time - dt + fraction * dt;
          r.steer = 0;
          r.stepTarget = r.targetLane = C.laneOf(r.x);
          clearDrift(r);
          justFinished.push(r);
        } else if (!r.finished && r.lap > r._highestLap) {
          r._highestLap = r.lap;
          emit('lap', r, r.lap);
          if (r.lap === R.laps) emit('finalLap', r);
        }
      });
      standings().forEach((r, i) => {
        const before = r.place;
        r.place = i + 1;
        if (before !== r.place) emit('place', r, before, r.place);
      });
      justFinished.sort((a, b) => a.finishTime - b.finishTime).forEach((r) => {
        if (r.isHuman) fx.confetti(racerPoint(r, 1), 55);
        emit('finish', r);
      });
      const watched = R.humans.length ? R.humans : R.racers;
      if (endAt === null && watched.length && watched.every((r) => r.finished)) endAt = R.time + 2.5;
      if (endAt !== null && R.time >= endAt) {
        finalOrder = standings();
        finalOrder.forEach((r) => {
          if (!r.finished) r.finishTime = R.time + Math.max(0, finishAt - r.progress) / Math.max(r.v, R.classDef.speed * 0.5);
        });
        R.phase = 'done';
        emit('done', finalOrder.slice());
      }
    }

    function kartEffect(r, key, on, make) {
      const v = r._visual;
      if (on && !v[key] && make) { v[key] = make(); r.mesh.add(v[key]); }
      if (v[key]) {
        v[key].visible = on;
        if (on && v[key].userData.update) v[key].userData.update(visualTime);
      }
    }
    function visuals(dt) {
      R.racers.forEach((r) => {
        const mesh = r.mesh, ud = mesh.userData, v = r._visual;
        const frame = W.frameAt(r.s);
        const yaw = frame.yaw, pitch = frame.pitch || 0, bank = frame.bank;
        backward.copy(frame.forward).multiplyScalar(-1);
        W.pointAt(r.s, r.x, mesh.position);
        mesh.position.y += r.y;
        const slip = r.drift.dir ? -r.drift.dir * 0.24 : 0;
        let turn = -U.clamp(r.latVel * 0.12, -0.45, 0.45) + slip;
        let roll = 0;
        if (r.spinT > 0) turn += (1 - r.spinT / C.HIT.spin.time) * TAU * 2;
        if (r.wobbleT > 0) roll = Math.sin((C.HIT.wobble.time - r.wobbleT) * 30) * 0.2;
        if (r.airT > 0 && !r.gliding) {
          const trick = r._jump ? (r.progress - r._jump.takeoff) / (r._jump.end - r._jump.takeoff) : r.airT / 0.55;
          turn += U.smoothstep(U.clamp(trick, 0, 1)) * TAU;
        }
        if (r.fallT > 0) { roll += (1 - r.fallT) * 5 * Math.sign(r.x); turn += (1 - r.fallT) * 3; }
        mesh.rotation.set(pitch + (r.airT > 0 ? -r.vy * 0.012 : 0), yaw + turn, -bank + roll, 'YXZ');
        r._scale = U.damp(r._scale, r.megaT > 0 ? 1.5 : r.shrinkT > 0 ? 0.6 : 1, 9, dt);
        mesh.scale.setScalar(r._scale);
        if (r.playerRing) {
          W.pointAt(r.s, r.x, r.playerRing.position);
          r.playerRing.position.y += 0.09;
          r.playerRing.rotation.set(pitch, yaw, -bank, 'YXZ');
          r.playerRing.scale.setScalar(r._scale);
        }
        // Gentle transparency-free flicker communicates protection without
        // touching the roster's shared materials.
        mesh.visible = r.invulnT <= 0 || r.fallT > 0 || r.rescueT > 0 || Math.floor(visualTime * 9) % 3 !== 0;
        if (ud.body) {
          ud.body.rotation.z = -U.clamp(r.latVel * 0.035, -0.18, 0.18);
          ud.body.position.y = r.vehicleId === 'hover' ? Math.sin(visualTime * 5 + r.idx) * 0.07 : Math.sin(visualTime * 19 + r.idx) * Math.min(0.035, r.v * 0.002);
        }
        if (ud.driver) {
          ud.driver.rotation.z = U.clamp(r.latVel * 0.028, -0.2, 0.2);
          ud.driver.position.y = v.driverY + (r.finished ? Math.abs(Math.sin(visualTime * 5)) * 0.14 : 0);
        }
        (ud.wheels || []).forEach((wheel) => { wheel.rotation.x -= r.v * dt / (wheel.userData.radius || 0.4); });
        (ud.steerWheels || []).forEach((wheel) => { wheel.rotation.y = -U.clamp(r.latVel * 0.065 + r.drift.dir * 0.1, -0.4, 0.4); });
        if (ud.glider) {
          ud.glider.visible = r.gliding && r.airT > 0;
          ud.glider.rotation.z = Math.sin(visualTime * 2) * 0.035;
        }
        W.pointAt(r.s, r.x, r.shadow.position);
        r.shadow.position.y += 0.055;
        r.shadow.rotation.set(pitch, yaw, -bank, 'YXZ');
        r.shadow.scale.setScalar(r._scale * (1 + Math.max(0, r.y) * 0.025));
        r.shadow.visible = r.fallT <= 0 && r.rescueT <= 0;
        // Round a loop the road's own frame replaces yaw/pitch/bank: the kart,
        // its ring and its shadow lie on the loop, upside down at the top.
        const lp = W.loopPose ? W.loopPose(r.progress, r.x) : null;
        if (lp) {
          mesh.position.copy(lp.pos).addScaledVector(lp.up, r.y);
          eLocal.set(r.airT > 0 ? -r.vy * 0.012 : 0, turn, roll, 'YXZ');
          mesh.quaternion.copy(lp.quat).multiply(qLocal.setFromEuler(eLocal));
          backward.copy(lp.forward).multiplyScalar(-1);
          if (r.playerRing) { r.playerRing.position.copy(lp.pos).addScaledVector(lp.up, 0.09); r.playerRing.quaternion.copy(lp.quat); }
          r.shadow.position.copy(lp.pos).addScaledVector(lp.up, 0.055);
          r.shadow.quaternion.copy(lp.quat);
        }
        v.blob.material.opacity = 0.85 / (1 + Math.max(0, r.y) * 0.12);
        const itemArt = NK.art.items || {};
        kartEffect(r, 'aura', r.starT > 0, itemArt.starAura);
        kartEffect(r, 'jet', r.jetT > 0, itemArt.jetShell);
        if (v.jet && v.jet.visible && v.jet.userData.flames) v.jet.userData.flames.scale.z = 0.85 + Math.sin(visualTime * 45) * 0.2;
        if (r.rescueT > 0 && !v.drone && NK.art.drone) {
          v.drone = NK.art.drone();
          raceRoot.add(v.drone);
        }
        if (v.drone) {
          v.drone.visible = r.rescueT > 0;
          if (v.drone.visible) {
            v.drone.position.copy(mesh.position);
            v.drone.rotation.y = yaw;
            (v.drone.userData.props || []).forEach((p) => { p.rotation.y += dt * 45; });
            if (v.drone.userData.setClaw) v.drone.userData.setClaw(r.rescueT < 0.2 ? 1 : 0);
          }
        }
        r._fxT -= dt;
        if (r._fxT <= 0 && R.phase === 'racing' && r.v > 3 && !r.fallT && !r.rescueT) {
          r._fxT = 0.06;
          mesh.updateMatrixWorld(true);
          if (r.boostT > 0 || r.jetT > 0) (ud.exhaust || []).forEach((point) => {
            local.copy(point); mesh.localToWorld(local); fx.flame(local, backward, 2);
          });
          if (r.airT === 0 && r.drift.dir) (ud.rearContacts || []).forEach((point) => {
            local.copy(point); mesh.localToWorld(local);
            if (r.drift.level) fx.sparks(local, SPARKS[r.drift.level - 1], 2);
            else fx.smoke(local, 1);
          });
          if (r.starT > 0) fx.stars(racerPoint(r, 1), 1);
          else if (Math.abs(r.x) > C.ROAD_HALF && r.airT === 0) fx.dust(racerPoint(r, 0.2), 1);
        }
      });
      fx.update(dt);
    }

    function update(dt) {
      if (disposed || !(dt > 0) || !Number.isFinite(dt)) return;
      // Main already clamps; keeping the bound here also makes direct callers
      // safe after a hidden tab or a paused developer breakpoint.
      dt = Math.min(dt, 0.05);
      visualTime += dt;
      if (R.phase === 'intro') {
        R.introTime += dt;
        if (R.introTime >= 2.5) {
          R.phase = 'countdown'; R.countdown = 3; countdownT = 3;
          lights(3); emit('countdown', 3);
        }
        visuals(dt); return;
      }
      if (R.phase === 'countdown') {
        countdownT = Math.max(0, countdownT - dt);
        const n = Math.ceil(countdownT - 1e-8);
        if (n === 0) go();
        else if (n !== R.countdown) { R.countdown = n; lights(n); emit('countdown', n); }
        visuals(dt); return;
      }
      if (R.phase !== 'racing') { visuals(dt); return; }
      R.time += dt;
      respawnFeatures();
      R.racers.forEach((r) => {
        const automatic = !r.isHuman || r.autopilot || r.finished || r.jetT > 0;
        if (automatic) {
          if (NK.ai && NK.ai.update) NK.ai.update(R, r, dt);
          else { r.steer = 0; r.stepTarget = r.targetLane; }
        } else if (r._wasAuto) {
          // Jet Mode temporarily owns steering. A switch held throughout
          // must resume sliding when the jet ends, without another key-down.
          r.steer = r._humanSteer;
          if (r.steer) r.stepTarget = null;
        }
        r._wasAuto = automatic;
      });
      R.racers.forEach((r) => physics(r, dt));
      R.racers.forEach(features);
      if (NK.items && NK.items.update) NK.items.update(R, dt);
      contacts(dt);
      positions(dt);
      R.humans.forEach((r) => {
        r.cue = NK.guide && NK.guide.update ? NK.guide.update(R, r, dt) : EMPTY_CUE();
      });
      visuals(dt);
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (NK.items && NK.items.clear) NK.items.clear(R);
      fx.dispose();
      scene.remove(raceRoot);
      R.racers.forEach((r) => r._visual.blob.material.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      NK.art.disposeTree(raceRoot);
      Object.keys(events).forEach((key) => { events[key].length = 0; });
    }
    return R;
  }

  return { create };
})();
