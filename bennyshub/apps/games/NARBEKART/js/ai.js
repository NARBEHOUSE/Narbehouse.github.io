/** NARBE Racer — CPU drivers use exactly the player's lanes and steering. */
NK.ai = (function () {
  'use strict';
  const C = NK.C, U = NK.util;
  function init(R, r, seed) {
    const random = U.rng(seed === undefined ? U.hash(r.charId + ':' + r.idx) : seed);
    const skill = U.clamp(R.classDef.cpuSkill, 0, 1);
    r.ai = { random, skill, personality: random.range(0.95, 1),
      thinkIn: random.range(0, 0.25), reactIn: 0, target: C.laneOf(r.x), pending: C.laneOf(r.x) };
    return r.ai;
  }
  function update(R, r, dt) {
    const a = r.ai || init(R, r);
    if (r.fallT > 0 || r.rescueT > 0 || r.spinT > 0) { r.steer = 0; return; }
    // Debug autopilot exercises the same advice that a switch player sees.
    // Jet mode also receives that safe route, without the CPU error model.
    if ((r.isHuman && !r.finished) || r.jetT > 0) {
      const cue = NK.guide.update(R, r, 0);
      r.steer = 0; r.stepTarget = cue.targetLane;
      return;
    }
    a.thinkIn -= dt;
    if (a.thinkIn <= 0) {
      a.thinkIn = a.random.range(0.22, 0.32);
      const scores = NK.guide.laneScores(R, r, 2.4 + a.skill);
      const from = C.laneOf(r.x);
      let best = from, high = -Infinity;
      for (let lane = 0; lane < C.LANE_COUNT; lane++) {
        const score = scores[lane] + a.random.range(-3, 3) * (1 - a.skill) - Math.abs(lane - from) * 1.8;
        if (score > high) { high = score; best = lane; }
      }
      // Mistakes are occasional missed opportunities, not frame-by-frame
      // twitching. Lower classes remain visibly beatable.
      if (a.random.chance((1 - a.skill) * 0.055)) best = from;
      if (best !== a.pending) {
        a.pending = best;
        a.reactIn = a.random.range(0.15, 0.5) * (1.1 - a.skill * 0.3);
      }
    }
    a.reactIn -= dt;
    if (a.reactIn <= 0) a.target = a.pending;
    r.steer = 0;
    r.stepTarget = a.target;
  }
  function pace(R, r) {
    if (r.isHuman) return 1;
    const a = r.ai || init(R, r);
    const humans = R.humans || R.racers.filter((other) => other.isHuman);
    let leading = null;
    humans.forEach((human) => { if (!leading || human.progress > leading.progress) leading = human; });
    let band = 1;
    if (leading) {
      const gap = r.progress - leading.progress;
      band = gap >= 0 ? 1 - Math.min(0.10, gap / 2500) : 1 + Math.min(0.12, -gap / 1800);
    }
    return a.personality * band * R.mode.cpuPace;
  }
  return { init, update, pace };
})();
