/* Headless checks of actual race/items/guide/AI mechanics.
 * Run: node tools/race_test.cjs. Art is replaced; physics is the shipping code. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.window = global;
global.THREE = require('../js/three.min.js');
global.NK = {};
['util', 'constants'].forEach(load);
const blank = () => {};
NK.art = {
  items: {}, fx: { create: () => Object.fromEntries(['sparks', 'flame', 'smoke', 'dust', 'confetti', 'burst', 'splash', 'stars', 'update', 'clear', 'dispose'].map((k) => [k, blank])) },
  blobShadow: () => new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial()),
  disposeTree: blank
};
NK.roster = {
  character: (id) => ({ id: id || 'pip', name: id || 'Pip' }),
  vehicle: (id) => ({ id: id || 'classic' }),
  statsFor: () => ({ speedMul: 1, accelRate: 1.5, handlingMul: 1, weight: 3 }),
  build: () => new THREE.Group()
};
['items', 'guide', 'ai', 'race'].forEach(load);
function load(name) { vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), { filename: name + '.js' }); }
const C = NK.C;
let count = 0;
function check(name, fn) { fn(); count++; process.stdout.write('PASS ' + name + '\n'); }
function handle() { return { visible: true, set(on) { this.visible = on; } }; }
function world(options = {}) {
  const mode = options.mode || 'nofail';
  const W = {
    L: options.L || 1000, track: { id: 'test', seed: 13 }, k: 0, ground: () => 0,
    features: Object.assign({ itemRows: [], coins: [], boostPads: [], padRows: [], hazards: [], ramps: [] }, options.features),
    handles: { boxes: [], coins: [] },
    pointAt(s, x, out) { return out.set(x, this.ground(s), -s); },
    frameAt(s) { return { yaw: 0, heading: 0, bank: 0, curvature: this.k, pitch: 0, forward: new THREE.Vector3(0, 0, -1) }; },
    limits() { return mode === 'nofail' ? { minX: -7.2, maxX: 7.2, fallL: -Infinity, fallR: Infinity } :
      options.drop ? { minX: -15, maxX: 15, fallL: -9.8, fallR: 9.8 } : { minX: -12.4, maxX: 12.4, fallL: -Infinity, fallR: Infinity }; },
    edgeAt() { return { left: mode === 'nofail' ? 'rail' : options.drop ? 'drop' : 'verge', right: mode === 'nofail' ? 'rail' : options.drop ? 'drop' : 'verge' }; },
    hazardState(i) { return { x: this.features.hazards[i].x || 0, active: true }; },
    startGrid(n) { return Array.from({ length: n }, (_, i) => ({ progress: -4 - i * 6, x: C.laneX(i % 2 ? 3 : 1) })); }
  };
  W.features.itemRows.forEach((row, i) => { W.handles.boxes[i] = []; row.lanes.forEach((lane) => { W.handles.boxes[i][lane] = handle(); }); });
  W.handles.coins = W.features.coins.map(handle);
  return W;
}
function create(options = {}) {
  const W = options.world || world(options);
  const R = NK.race.create(Object.assign({ world: W, scene: new THREE.Scene(), mode: options.mode || 'nofail', classId: 'easy', laps: 3,
    humans: [{ charId: 'pip', vehicleId: 'classic' }] }, options));
  R.log = [];
  ['go', 'countdown', 'coin', 'itemGet', 'itemUse', 'hit', 'fall', 'rescued', 'turbo', 'jump', 'trick', 'lap', 'finalLap', 'finish', 'done', 'bump'].forEach((name) => R.on(name, (...args) => R.log.push([name, ...args])));
  if (!options.countdown) R.skipIntro();
  return R;
}
function advance(R, seconds) { for (let i = 0, n = Math.ceil(seconds / 0.02); i < n; i++) R.update(0.02); }
function put(R, progress, x = 0, idx = 0) {
  const r = R.racers[idx];
  Object.assign(r, { progress, s: NK.util.mod(progress, R.L), x, targetLane: C.laneOf(x), lane: C.laneOf(x), steer: 0, stepTarget: null, v: 24, y: 0, airT: 0, vy: 0, _jump: null });
  return r;
}
function events(R, name) { return R.log.filter((e) => e[0] === name); }

check('grid is reversed for humans and preserves stable player indices', () => {
  const R = create({ humans: [{ charId: 'p1' }, { charId: 'p2' }], cpus: [{ charId: 'cpu' }, { charId: 'cpu2' }] });
  assert.equal(R.humans[0], R.racers[0]); assert.equal(R.humans[1], R.racers[1]);
  assert(R.racers[0].progress < R.racers[2].progress);
  R.dispose(); assert.equal(R.scene.children.length, 0);
});
check('countdown advances once per number; an early press is ignored and a later one boosts', () => {
  const R = create({ countdown: true });
  R.pressed(0); advance(R, 3.6); assert.equal(R.phase, 'countdown'); assert.equal(R.countdown, 2);
  assert.equal(R.humans[0]._rocketStart, false);
  R.pressed(0); advance(R, 2); assert.equal(R.phase, 'racing'); assert(R.humans[0].boostT > 1);
  assert.deepEqual(events(R, 'countdown').map((e) => e[1]), [3, 2, 1]); assert.equal(events(R, 'go').length, 1); R.dispose();
});
check('long steering holds reach a rail once; release settles and step targets slide at the same pace', () => {
  const R = create(); const r = put(R, 100); R.setSteer(0, 1); advance(R, 12);
  assert.equal(r.x, 7.2); assert.equal(events(R, 'bump').length, 1); assert.equal(r.latVel, 0);
  R.setSteer(0, -1); advance(R, 0.4); R.setSteer(0, 0); const nearest = C.laneOf(r.x); advance(R, 2);
  assert(Math.abs(r.x - C.laneX(nearest)) < 0.001);
  R.setTargetLane(0, 0); advance(R, 4); assert.equal(r.x, -7.2); assert.equal(r.lane, 0); R.dispose();
});
check('coin and box sweeps work over a lap boundary; respawns and roulette happen once', () => {
  const R = create({ features: { coins: [{ s: 2, lane: 2 }], itemRows: [{ s: 4, lanes: [2] }] } });
  const r = put(R, 998); advance(R, 0.5);
  assert.equal(r.coins, 1); assert(r.roulette > 0); assert.equal(R.world.handles.coins[0].visible, false);
  assert.equal(R.world.handles.boxes[0][2].visible, false); advance(R, 1.5); assert(r.item); assert.equal(events(R, 'itemGet').length, 1);
  advance(R, 9); assert.equal(R.world.handles.coins[0].visible, true); assert.equal(R.world.handles.boxes[0][2].visible, true); R.dispose();
});
check('Power Pads boost with or without an item; Open lanes control only the boost', () => {
  const features = { padRows: [{ s: 50, lanes: [0, 1] }] };
  for (const held of [false, true]) {
    const R = create({ features }); const r = put(R, 48, 7.2);
    if (held) NK.items.give(R, r, 'rocket');
    advance(R, 0.2);
    assert.equal(r.item, held ? 'rocket' : null); assert(r.boostT > 0.8);
    assert.equal(events(R, 'itemUse').length, 0); R.dispose();
  }
  for (const lane of [0, 4]) {
    const R = create({ mode: 'open', features }); const r = put(R, 48, C.laneX(lane));
    NK.items.give(R, r, 'rocket'); advance(R, 0.2);
    assert.equal(r.item, 'rocket'); assert.equal(r.boostT > 0, lane === 0);
    assert.equal(events(R, 'itemUse').length, 0); R.dispose();
  }
});
check('held items receive varied seeded delays between three and six seconds', () => {
  const sequences = [];
  for (let repeat = 0; repeat < 2; repeat++) {
    const R = create(), r = R.humans[0], delays = [];
    for (let i = 0; i < 24; i++) {
      NK.items.give(R, r, 'coins');
      assert(r.itemUseDelay >= 3 && r.itemUseDelay <= 6);
      assert.equal(r.itemUseT, r.itemUseDelay); delays.push(r.itemUseDelay);
    }
    assert(new Set(delays.map(n => n.toFixed(3))).size > 1);
    sequences.push(delays); R.dispose();
  }
  assert.deepEqual(sequences[0], sequences[1]);
});
check('item countdown begins after roulette and activates exactly once without a pad', () => {
  const R = create({ features: { itemRows: [{ s: 50, lanes: [2] }] } }); const r = put(R, 49);
  advance(R, 0.1); assert(r.roulette > 0); advance(R, 0.8);
  assert(r.roulette > 0); assert.equal(r.item, null); assert.equal(r.itemUseT, 0);
  assert.equal(events(R, 'itemUse').length, 0);
  while (r.roulette > 0) R.update(0.02);
  assert(r.item); assert(r.itemUseT >= 2.98 && r.itemUseT <= 6);
  assert(Math.abs(r.itemUseT - r.itemUseDelay) <= 0.021);
  assert.equal(events(R, 'itemGet').length, 1);
  advance(R, r.itemUseT - 0.05); assert(r.item); assert.equal(events(R, 'itemUse').length, 0);
  advance(R, 0.08); assert.equal(r.item, null); assert.equal(r.itemUseT, 0); assert.equal(r.itemUseDelay, 0);
  assert.equal(events(R, 'itemUse').length, 1); advance(R, 7);
  assert.equal(events(R, 'itemUse').length, 1); R.dispose();
});
check('item countdown freezes through a real fall and rescue, then resumes', () => {
  const R = create({ mode: 'open', drop: true }); const r = put(R, 100, 9.7);
  NK.items.give(R, r, 'coins'); R.setSteer(0, 1); advance(R, 0.04); R.setSteer(0, 0);
  assert(r.fallT > 0); const remaining = r.itemUseT; let sawRescue = false;
  for (let i = 0; i < 160 && (r.fallT > 0 || r.rescueT > 0); i++) {
    if (r.rescueT > 0) sawRescue = true;
    R.update(0.02); assert.equal(r.itemUseT, remaining);
    assert.equal(events(R, 'itemUse').length, 0);
  }
  assert(sawRescue); assert.equal(r.fallT, 0); assert.equal(r.rescueT, 0);
  advance(R, remaining + 0.04); assert.equal(r.item, null); assert.equal(events(R, 'itemUse').length, 1);
  R.dispose();
});
check('finished racers never activate a waiting item', () => {
  const R = create({ L: 500, laps: 1, humans: [{ charId: 'a' }, { charId: 'b' }] });
  const r = put(R, 499); put(R, 0, 7.2, 1); NK.items.give(R, r, 'coins');
  advance(R, 0.1); assert(r.finished); assert.equal(R.phase, 'racing');
  advance(R, 7); assert.equal(events(R, 'itemUse').filter(e => e[1] === r).length, 0); R.dispose();
});
check('losing an item clears its countdown and cannot activate a stale item', () => {
  const R = create({ humans: [{ charId: 'a' }, { charId: 'b' }] });
  const a = put(R, 100), b = put(R, 120, 7.2, 1);
  NK.items.give(R, a, 'shrink'); NK.items.give(R, b, 'coins'); NK.items.use(R, a);
  assert.equal(b.item, null); assert.equal(b.itemUseT, 0); assert.equal(b.itemUseDelay, 0);
  advance(R, 7); assert.equal(events(R, 'itemUse').filter(e => e[1] === b).length, 0); R.dispose();
});
check('Time Trial holds one Triple Rocket through countdown and activates it after GO', () => {
  const R = create({ countdown: true, timeTrial: true, cpus: [{ charId: 'cpu' }], features: { itemRows: [{ s: 50, lanes: [2] }] } });
  const r = R.humans[0]; assert.equal(R.racers.length, 1); assert.equal(r.item, 'rocket3');
  assert.equal(R.world.handles.boxes[0][2].visible, false);
  advance(R, 5); assert.equal(R.phase, 'countdown'); assert.equal(r.item, 'rocket3'); assert.equal(events(R, 'itemUse').length, 0);
  while (R.phase !== 'racing') R.update(0.02);
  assert(r.itemUseT >= 3 && r.itemUseT <= 6); advance(R, r.itemUseT - 0.05);
  assert.equal(r.item, 'rocket3'); advance(R, 0.08);
  assert.equal(r.item, null); assert(r.boostT > 3.4); assert.equal(events(R, 'itemUse').length, 1); R.dispose();
});
check('No-Fail humans wobble with coins intact; CPUs and Open humans spin with coin loss', () => {
  const R = create({ cpus: [{ charId: 'cpu' }] }); const r = R.humans[0], cpu = R.racers[1]; r.coins = cpu.coins = 7;
  assert(R.hitRacer(r, { kind: 'item' })); assert.equal(r.coins, 7); assert(r.wobbleT > 0); assert.equal(r.spinT, 0);
  assert.equal(R.hitRacer(r, { kind: 'item' }), false); R.hitRacer(cpu, { kind: 'item' }); assert.equal(cpu.coins, 4); assert(cpu.spinT > 0); R.dispose();
  const S = create({ mode: 'open' }); const s = S.humans[0]; s.coins = 4; S.hitRacer(s, { kind: 'hazard' }); assert.equal(s.coins, 1); assert(s.spinT > 0); S.dispose();
});
check('invincibility is honored and effect timers expire in race.js', () => {
  const R = create(); const r = put(R, 100); r.item = 'star'; NK.items.use(R, r);
  assert.equal(R.hitRacer(r, { kind: 'item' }), false); advance(R, 6.1); assert.equal(r.starT, 0); assert(R.hitRacer(r, { kind: 'item' })); R.dispose();
});
check('a switch held during Jet Mode resumes steering when autopilot ends', () => {
  const R = create(); const r = put(R, 100); R.setSteer(0, 1); r.jetT = 0.3;
  advance(R, 0.2); assert.equal(r.steer, 0); advance(R, 0.2); assert.equal(r.steer, 1); assert(r.x > 0); R.dispose();
});
check('automatic drift charges the inside and releases a level-three turbo after the bend', () => {
  const R = create({ mode: 'open' }); const r = put(R, 100, 3.6); R.world.k = 0.012; advance(R, 3.2);
  assert.equal(r.drift.level, 3); R.world.k = 0; advance(R, 0.2); assert.equal(events(R, 'turbo').length, 1); assert.equal(events(R, 'turbo')[0][2], 3); assert(r.boostT > 1.3); R.dispose();
});
check('ramp climbs and safe jump arcs clear obstacles at Easy/Fast speed with or without boost', () => {
  for (const kind of ['jump', 'glide']) for (const classId of ['easy', 'fast']) for (const boosted of [false, true]) {
    const spec = C.JUMPS[kind], ramp = { s: 50, lanes: [2], kind };
    const end = ramp.s + spec.rampLength + spec.flightLength;
    const R = create({ classId, features: { ramps: [ramp], hazards: [
      { s: ramp.s + spec.rampLength + spec.flightLength * 0.5, x: 0, kind: 'block', halfLength: 1.7 }
    ] } });
    const r = put(R, 49); r.v = C.CLASSES[classId].speed * (boosted ? C.BOOST_MUL : 1);
    if (boosted) r.boostT = 10;
    let peak = 0, onRamp = false, airborne = false, landed = null;
    for (let i = 0; i < 500 && landed === null; i++) {
      const wasAirborne = r.airT > 0; R.update(0.02);
      if (r.progress > ramp.s + 1 && r.progress < ramp.s + spec.rampLength - 1 && r.y > 0) onRamp = true;
      if (r.airT > 0) { airborne = true; peak = Math.max(peak, r.y); }
      if (wasAirborne && r.airT === 0) landed = r.progress;
      assert(Number.isFinite(r.y) && Number.isFinite(r.mesh.position.y));
    }
    assert(onRamp); assert(airborne); assert(peak >= spec.peakHeight * 0.95);
    assert(landed >= end && landed < end + 2); assert.equal(r.y, 0);
    assert.equal(events(R, 'hit').length, 0); assert.equal(events(R, 'trick').length, 1); assert.equal(events(R, 'jump').length, 1);
    advance(R, 0.2); assert.equal(events(R, 'trick').length, 1); R.dispose();
  }
});
check('Open drops always rescue back onto the centre lane and reset speed', () => {
  const R = create({ mode: 'open', drop: true }); const r = put(R, 100, 9.7); R.setSteer(0, 1); advance(R, 0.04); R.setSteer(0, 0);
  assert(r.fallT > 0); assert.equal(events(R, 'fall').length, 1); advance(R, 2.42);
  assert.equal(events(R, 'rescued').length, 1); assert.equal(r.fallT, 0); assert.equal(r.rescueT, 0);
  assert.equal(r.x, 0); assert.equal(r.y, 0); assert(r.progress < 100); assert(r.v < 2); R.dispose();
});
check('puddles slow without a hit and raised karts clear blocks', () => {
  const R = create({ mode: 'open', features: { hazards: [{ s: 50, x: 0, kind: 'puddle', halfLength: 8, halfWidth: 1.2 }] } });
  const r = put(R, 44); advance(R, 0.6); assert(r.v < 23); assert.equal(events(R, 'hit').length, 0); R.dispose();
  const S = create({ mode: 'open', features: { hazards: [{ s: 50, x: 0, kind: 'block' }] } }); const s = put(S, 48); s.y = 4; s.airT = 0.1; s.vy = 0;
  advance(S, 0.2); assert.equal(events(S, 'hit').length, 0); S.dispose();
});
check('contact separates karts, throttles bumps and applies powered hits', () => {
  const R = create({ humans: [{ charId: 'a' }, { charId: 'b' }] }); const a = put(R, 100), b = put(R, 101, 0, 1);
  a.starT = 2; R.update(0.02); assert(Math.abs(a.x - b.x) >= C.KART_HALF * 2); assert(b.wobbleT > 0); assert.equal(events(R, 'bump').length, 1); R.dispose();
});
check('laps and finishes emit once; two-player results wait for both and CPU times are estimated', () => {
  const R = create({ L: 100, laps: 2, humans: [{ charId: 'a' }, { charId: 'b' }], cpus: [{ charId: 'cpu' }] });
  put(R, 99); put(R, 40, 7.2, 1); put(R, 0, -7.2, 2); advance(R, 0.1);
  assert.equal(events(R, 'lap').filter((e) => e[1].idx === 0).length, 1); assert.equal(events(R, 'finalLap').filter((e) => e[1].idx === 0).length, 1);
  put(R, 199); advance(R, 0.1); assert(R.humans[0].finished); assert.equal(R.phase, 'racing');
  const time = R.humans[0].finishTime; put(R, 199, 7.2, 1); advance(R, 0.1); assert(R.humans[1].finished);
  assert.equal(R.phase, 'racing'); advance(R, 2.6); assert.equal(R.phase, 'done'); assert.equal(events(R, 'done').length, 1);
  assert.equal(R.humans[0].finishTime, time); assert(Number.isFinite(R.racers[2].finishTime)); assert.equal(R.standings()[0].idx, 0); R.dispose();
});
check('doing nothing completes a full race with CPUs, hazards and all integrated modules', () => {
  const R = create({ L: 300, laps: 1, cpus: Array.from({ length: 11 }, (_, i) => ({ charId: 'cpu' + i })), features: {
    itemRows: [{ s: 60, lanes: [0, 1, 2, 3, 4] }], padRows: [{ s: 190, lanes: [1, 2, 3] }], coins: [{ s: 30, lane: 1 }],
    hazards: [{ s: 110, x: -3.6, kind: 'block', halfWidth: 1.2, halfLength: 1.2 }], boostPads: [{ s: 220, lanes: [0, 4] }]
  } });
  advance(R, 40); assert.equal(R.phase, 'done'); assert(R.humans[0].finished); assert(R.racers.every((r) => Number.isFinite(r.progress) && Number.isFinite(r.x) && Number.isFinite(r.finishTime)));
  assert.equal(R.standings().length, 12); R.dispose();
});
process.stdout.write(count + ' simulation checks passed.\n');
