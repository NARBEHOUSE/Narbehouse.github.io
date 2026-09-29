/** NARBE Racer — predictable lane advice shared by people and CPU drivers. */
NK.guide = (function () {
  'use strict';
  const C = NK.C, U = NK.util;
  const states = new WeakMap();
  const objectIds = new WeakMap();
  let objectSerial = 0;
  const ALL = [0, 1, 2, 3, 4];
  const invincible = (r) => r.starT > 0 || r.megaT > 0 || r.jetT > 0;
  const ahead = (R, r, s) => U.loopDelta(r.s, s, R.L);

  function evaluate(R, r, horizonSec) {
    const horizon = U.clamp(horizonSec || 3.2, 0.5, 12);
    const speed = Math.max(8, r.v || R.classDef.speed * 0.75);
    const lead = Math.max(28, speed * horizon);
    const scores = new Float32Array(C.LANE_COUNT), threats = [], reasons = ALL.map(() => 'clear');
    const identities = ALL.map(() => null), featureProgress = ALL.map(() => Infinity);
    const benefit = new Float32Array(C.LANE_COUNT), arrivals = ALL.map(() => Infinity);
    const F = R.world.features, lane = C.laneOf(r.x);
    scores[lane] += 3;

    function reward(s, lanes, value, reason) {
      const d = ahead(R, r, s);
      if (d < -1 || d > lead) return;
      const t = Math.max(0, d / speed), amount = value * (1 - 0.2 * Math.min(1, t / horizon));
      lanes.forEach((l) => {
        scores[l] += amount;
        if (amount > benefit[l]) {
          benefit[l] = amount; reasons[l] = reason; arrivals[l] = t;
          featureProgress[l] = r.progress + d;
          identities[l] = reason + ':' + Math.round(s * 10) + ':' + Math.floor((r.progress + d) / R.L);
        }
      });
    }
    function jumpClearance(h) {
      if (!h.jumpObstacle || !Number.isFinite(h.rampS)) return null;
      const ramp = (F.ramps || []).find((row) => Math.abs(U.loopDelta(row.s, h.rampS, R.L)) < 0.1);
      if (!ramp) return null;
      const jump = C.JUMPS[ramp.kind], length = ramp.flightLength || jump.flightLength;
      const foot = ahead(R, r, ramp.s), along = -foot;
      const onRamp = (x) => ramp.lanes.some((l) => Math.abs(x - C.laneX(l)) <= C.LANE_W / 2);
      if (foot < 0) {
        // Do not promise a jump to someone who missed the ramp and then
        // moved into its obstacle lane. An actual rising/airborne kart is
        // protected; one still on the road needs the normal warning.
        const airborne = r.airT > 0 && along <= jump.rampLength + length;
        const climbing = along <= jump.rampLength && r.y > 0.02 && onRamp(r.x);
        return { lanes: ALL.map(() => airborne || climbing), current: airborne || climbing };
      }
      const rate = C.LANE_W / (C.STEER_SPEEDS.slow.laneTime * U.clamp(r.stats && r.stats.handlingMul || 1, 0.9, 1.1));
      return { current: onRamp(r.x), lanes: ALL.map((l) => {
        const x = r.x + U.clamp(C.laneX(l) - r.x, -rate * foot / speed, rate * foot / speed);
        return onRamp(x);
      }) };
    }
    function threat(t, x, half, reason, penalty, id, clearance) {
      threats.push({ t, x, half, reason, id, clearance, progress: r.progress + speed * t });
      for (let l = 0; l < C.LANE_COUNT; l++) {
        if (Math.abs(C.laneX(l) - x) < half + C.KART_HALF && !(clearance && clearance.lanes[l])) scores[l] -= penalty;
      }
    }

    if (!invincible(r)) {
      (F.hazards || []).forEach((h, i) => {
        const d = ahead(R, r, h.s);
        if (d < -(h.halfLength || 2) || d > lead) return;
        const t = Math.max(0, d / speed);
        const state = R.world.hazardState(i, R.time + t);
        // Check either side of arrival too: a moving hazard must not give a
        // false all-clear merely because its centre misses at one instant.
        const window = Math.min(0.22, ((h.halfLength || 2) + C.KART_LEN / 2) / speed);
        const before = R.world.hazardState(i, R.time + Math.max(0, t - window));
        const after = R.world.hazardState(i, R.time + t + window);
        if (!state.active && !before.active && !after.active) return;
        const active = [state, before, after].filter((s) => s.active);
        const x0 = Math.min.apply(null, active.map((s) => s.x));
        const x1 = Math.max.apply(null, active.map((s) => s.x));
        threat(t, (x0 + x1) / 2, (h.halfWidth || 1.2) + (x1 - x0) / 2,
          h.kind === 'puddle' ? 'puddle' : 'hazard', h.kind === 'puddle' ? 35 : 100,
          'hazard:' + i + ':' + Math.floor((r.progress + d) / R.L), jumpClearance(h));
      });
      const items = NK.items ? NK.items.objects(R) : (R.itemObjects || []);
      items.forEach((o) => {
        if (o.ownerIdx === r.idx || o.dead || o.type === 'horn') return;
        if (!objectIds.has(o)) objectIds.set(o, ++objectSerial);
        const id = 'item:' + objectIds.get(o);
        const d = ahead(R, r, o.s), relativeSpeed = speed - (o.v || 0);
        if (o.type === 'bomb') {
          const t = Math.max(0, (o.life || 1.2) - (o.age || 0));
          const landing = o.launchProgress === undefined ? o.s : U.mod(o.launchProgress + 35, R.L);
          if (Math.abs(ahead(R, r, landing) - speed * t) < 9 && t <= horizon)
            threat(t, o.x, 7, 'bomb', 100, id);
        } else if (o.type === 'zapper') {
          if (o.targetIdx === r.idx && Math.abs(d) < lead) threat(Math.abs(d) / Math.max(20, Math.abs(relativeSpeed)), o.x, 6, 'zapper', 100, id);
        } else {
          const t = Math.abs(relativeSpeed) < 0.1 ? (Math.abs(d) < 4 ? 0 : Infinity) : d / relativeSpeed;
          if (t >= -0.08 && t <= horizon && (o.life === undefined || t < o.life - o.age))
            threat(Math.max(0, t), o.x, o.radius || 1, o.type, 100, id);
        }
      });
    }

    if (!r.item && !(r.roulette > 0) && !R.timeTrial)
      (F.itemRows || []).forEach((row) => reward(row.s, row.lanes, 20, 'box'));
    (F.padRows || []).forEach((row) => reward(row.s, row.lanes, 12, 'boost pad'));
    (F.boostPads || []).forEach((row) => reward(row.s, row.lanes, 12, 'boost pad'));
    if (r.coins < C.COIN_MAX) {
      const coinCounts = new Uint8Array(C.LANE_COUNT);
      (F.coins || []).forEach((coin) => {
        const d = ahead(R, r, coin.s);
        if (d >= -1 && d <= lead && coinCounts[coin.lane] < 6) {
          reward(coin.s, [coin.lane], 2, 'coins'); coinCounts[coin.lane]++;
        }
      });
    }
    const bend = R.world.frameAt(r.s + speed * 1.1).curvature;
    if (Math.abs(bend) >= C.DRIFT_K) {
      [bend > 0 ? 3 : 1, bend > 0 ? 4 : 0].forEach((l) => {
        scores[l] += 6;
        if (benefit[l] < 6) { reasons[l] = 'inside line'; arrivals[l] = 1.1; }
      });
    }
    if (R.mode.canFall) {
      [r.s, r.s + lead * 0.5, r.s + lead].forEach((s) => {
        const edge = R.world.edgeAt(s);
        if (edge.left === 'drop') scores[0] -= 8 / 3;
        if (edge.right === 'drop') scores[4] -= 8 / 3;
      });
    }
    R.racers.forEach((other) => {
      if (other.idx === r.idx || other.fallT || other.rescueT) return;
      const d = ahead(R, r, other.s);
      if (d > 0 && d < Math.min(lead, speed * 1.3)) scores[C.laneOf(other.x)] -= 5;
    });
    return { scores, threats, reasons, arrivals, identities, featureProgress, speed, horizon };
  }

  function laneScores(R, r, horizonSec) { return evaluate(R, r, horizonSec).scores; }

  function update(R, r, dt) {
    const from = C.laneOf(r.x);
    if (r.finished || r.fallT > 0 || r.rescueT > 0)
      return { dir: 0, active: false, targetLane: from, danger: false, reason: 'clear', id: null, benefit: 0 };
    let state = states.get(r);
    if (!state) { state = { next: -1, target: from, result: null, lock: null }; states.set(r, state); }
    if (R.time >= state.next || !state.result) {
      const E = evaluate(R, r, 3.6);
      const handling = U.clamp(r.stats && r.stats.handlingMul || 1, 0.9, 1.1);
      // Use the slow steering setting for the promise made by guidance.
      const lateralSpeed = C.LANE_W / (C.STEER_SPEEDS.slow.laneTime * handling);
      const dangerThreats = E.threats.filter((t) => !(t.clearance && t.clearance.current) && Math.abs(t.x - r.x) < t.half + C.KART_HALF).sort((a, b) => a.t - b.t);
      const danger = dangerThreats.length > 0;
      const deadline = dangerThreats.reduce((time, t) => Math.min(time, t.t), Infinity);
      const pathUnsafe = ALL.map(() => false);
      const values = ALL.map((lane) => {
        const travel = Math.abs(C.laneX(lane) - r.x) / lateralSpeed;
        let value = E.scores[lane] - Math.abs(lane - from) * 1.5;
        // A late pickup is never a reason to send someone across the road.
        if (!danger && travel + 0.35 > E.arrivals[lane]) value -= 25;
        if (danger && travel > deadline && lane !== from) value -= 40;
        E.threats.forEach((t) => {
          if (t.clearance && t.clearance.lanes[lane]) return;
          const x = r.x + U.clamp(C.laneX(lane) - r.x, -lateralSpeed * t.t, lateralSpeed * t.t);
          if (Math.abs(x - t.x) < t.half + C.KART_HALF) { value -= 130; pathUnsafe[lane] = true; }
        });
        return value;
      });
      let best = from;
      ALL.forEach((lane) => { if (values[lane] > values[best] + 0.01) best = lane; });
      // Keep an established safe instruction through small coin/traffic
      // score changes. A new danger immediately overrides this hysteresis.
      if (state.result && values[state.target] >= values[best] - 2.5) best = state.target;
      if (state.lock && r.progress > state.lock.until) state.lock = null;
      // Once a useful direction has been shown, finish that move and pass
      // its landmark. Nearby coins or another box cannot reverse the cue.
      // A genuinely unsafe route is always allowed to break the latch.
      if (state.lock && !pathUnsafe[state.lock.target]) best = state.lock.target;
      else if (state.lock) state.lock = null;
      const benefit = Math.max(0, E.scores[best] - E.scores[from]);
      const reason = danger ? dangerThreats[0].reason : E.reasons[best];
      const reachable = Math.abs(C.laneX(best) - r.x) / lateralSpeed + 0.35 <= E.arrivals[best];
      const usefulFeature = ['box', 'power pad', 'boost pad'].includes(reason) && reachable && benefit >= 8;
      const safeDirection = !pathUnsafe[best] && (!danger || Math.abs(C.laneX(best) - r.x) / lateralSpeed <= deadline);
      const purposeful = safeDirection && (danger || usefulFeature);
      const event = danger ? dangerThreats[0] : { id: E.identities[best], progress: E.featureProgress[best] };
      if (!state.lock && purposeful && best !== from && !pathUnsafe[best])
        state.lock = { target: best, id: event.id, reason, until: event.progress + 5 };
      state.target = best;
      state.result = { dir: 0, active: false, targetLane: best, danger,
        reason: state.lock ? state.lock.reason : reason,
        id: state.lock ? state.lock.id : purposeful ? event.id : null, benefit, purposeful };
      state.next = R.time + 0.15;
    }
    const result = state.result;
    result.dir = Math.sign(result.targetLane - from);
    result.active = result.dir !== 0 && result.purposeful;
    r.cue = result;
    return result;
  }
  return { laneScores, update };
})();
