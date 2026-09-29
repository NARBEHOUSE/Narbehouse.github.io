/* Deterministic checks for item lifecycle, swept hits and reachable guidance.
 * Run: node tools/items_ai_test.cjs (no renderer or packages required). */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.window = global;
global.THREE = require('../js/three.min.js');
global.NK = {};
['util', 'constants', 'items', 'guide', 'ai'].forEach((name) =>
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), { filename: name + '.js' }));
NK.art = { items: {}, disposeTree() {} };
['peel', 'ball', 'bee', 'zapper', 'bomb', 'hornWave'].forEach((name) => { NK.art.items[name] = () => new THREE.Group(); });
const C = NK.C;
let checks = 0;
function check(label, fn) { fn(); checks++; process.stdout.write('PASS ' + label + '\n'); }
function race(modeId = 'open') {
  const racers = Array.from({ length: 4 }, (_, i) => ({ idx: i, isHuman: i === 0, human: i === 0 ? 0 : -1,
    charId: 'test' + i, stats: { handlingMul: 1 }, progress: 100 - 10 * i, s: 100 - 10 * i,
    x: 0, v: 24, y: 0, lane: 2, place: i + 1, coins: 0, item: null, roulette: 0,
    starT: 0, megaT: 0, jetT: 0, shrinkT: 0, invulnT: 0 }));
  const R = { racers, humans: [racers[0]], modeId, mode: C.MODES[modeId], classDef: C.CLASSES.medium,
    phase: 'racing', time: 0, L: 1000, timeTrial: false, scene: new THREE.Scene(), rng: NK.util.rng(7),
    itemObjects: [], hits: [], events: [], fx: { burst() {} },
    world: { features: { hazards: [], coins: [], itemRows: [], padRows: [], boostPads: [] },
      pointAt(s, x, out) { return out.set(x, 0, -s); }, frameAt() { return { heading: 0, bank: 0, curvature: 0 }; },
      edgeAt() { return { left: 'wall', right: 'wall' }; },
      hazardState(i) { return { x: this.features.hazards[i].x, active: true }; } },
    emit(...args) { this.events.push(args); }, boost(r, seconds) { r.boostT = seconds; },
    giveCoins(r, n) { r.coins = Math.min(C.COIN_MAX, r.coins + n); },
    hitRacer(r, cause) { if (!(r.starT || r.megaT || r.jetT || r.invulnT)) this.hits.push({ r, cause }); },
    placeOf(r) { return r.place; }, byPlace() { return this.racers.slice().sort((a, b) => a.place - b.place); },
    ahead(r) { return this.byPlace().find((other) => other.place === r.place - 1) || null; },
    gap(a, b) { return a.progress - b.progress; } };
  return R;
}
function put(R, idx, progress, x = 0, v = 0) { Object.assign(R.racers[idx], { progress, s: NK.util.mod(progress, R.L), x, v }); }
function use(R, id, idx = 0) { R.racers[idx].item = id; assert.equal(NK.items.use(R, R.racers[idx]), true); }

check('all fifteen items activate, create valid objects, and clean up', () => {
  assert.equal(Object.keys(NK.items.DEFS).length, 15);
  for (const id of Object.keys(NK.items.DEFS)) {
    const R = race(); use(R, id);
    assert.equal(R.racers[0].item, null);
    for (let i = 0; i < 60; i++) { R.time += 0.05; NK.items.update(R, 0.05); }
    NK.items.clear(R); assert.equal(R.itemObjects.length, 0); assert.equal(R.scene.children.length, 0);
  }
});
check('No-Fail never awards a Zapper; seeded item rolls repeat', () => {
  const R = race('nofail'), S = race('nofail'); R.racers[0].place = S.racers[0].place = 4;
  for (let i = 0; i < 2000; i++) {
    const id = NK.items.roll(R, R.racers[0]); assert.notEqual(id, 'zapper'); assert.equal(id, NK.items.roll(S, S.racers[0]));
  }
});
check('boost durations and coin cap follow the item contract', () => {
  const R = race();
  for (const [id, seconds] of [['rocket', 1.3], ['rocket3', 3.6], ['goldrocket', 5.5]]) { use(R, id); assert.equal(R.racers[0].boostT, seconds); }
  R.racers[0].coins = 9; use(R, 'coins'); assert.equal(R.racers[0].coins, 10);
});
check('a fast ball sweeps the finish seam and hits exactly one kart', () => {
  const R = race(); put(R, 0, 995, 0, 24); put(R, 1, 1002); put(R, 2, 1003);
  use(R, 'ball'); NK.items.update(R, 0.2);
  assert.equal(R.hits.length, 1); assert.equal(R.hits[0].r.idx, 1); assert.equal(R.itemObjects.length, 0);
});
check('triple peels trail at five-metre intervals and do not hit their owner', () => {
  const R = race(); use(R, 'peel3'); assert.deepEqual(R.itemObjects.map((o) => o.progress), [96, 91, 86]);
  put(R, 0, 96); R.racers.slice(1).forEach((r) => { r.x = 7.2; }); NK.items.update(R, 0.1); assert.equal(R.hits.length, 0);
});
check('horn removes an overhead Zapper as well as road traps', () => {
  const R = race(); put(R, 1, 100, 3.6); use(R, 'zapper', 1); use(R, 'peel', 1); use(R, 'horn');
  NK.items.update(R, 0.01); assert.equal(NK.items.objects(R).length, 0);
  assert(R.hits.some((hit) => hit.cause.kind === 'horn'));
});
check('Shrink Ray honors invincibility and gentler No-Fail human duration', () => {
  const R = race('nofail'); R.racers[1].starT = 2; R.racers[0].item = 'rocket'; use(R, 'shrink', 3);
  assert.equal(R.racers[0].shrinkT, 2.5); assert.equal(R.racers[0].item, null);
  assert.equal(R.racers[1].shrinkT, 0); assert.equal(R.racers[2].shrinkT, 5);
});
check('bomb lands thirty-five metres ahead and explodes once', () => {
  const R = race(); put(R, 1, 135, 3.6); use(R, 'bomb');
  NK.items.update(R, 0.55); assert.equal(R.itemObjects[0].progress, 135);
  NK.items.update(R, 0.65); assert.equal(R.itemObjects.length, 0); assert.equal(R.hits.filter((hit) => hit.r.idx === 1).length, 1);
});
check('guidance prefers a reachable safe lane over a box behind a hazard', () => {
  const R = race(); put(R, 0, 100, 0, 24);
  R.world.features.hazards = [{ s: 148, x: 0, halfWidth: 1.2, halfLength: 2, kind: 'block' }];
  R.world.features.itemRows = [{ s: 152, lanes: [2] }];
  const cue = NK.guide.update(R, R.racers[0], 0.05);
  assert(cue.danger); assert.notEqual(cue.targetLane, 2); assert(Math.abs(cue.targetLane - 2) <= 1);
});
check('guidance forecasts geyser activation at arrival instead of current state', () => {
  const R = race(); put(R, 0, 100, 0, 24);
  R.world.features.hazards = [{ s: 148, x: 0, halfWidth: 1.2, halfLength: 2, kind: 'geyser' }];
  R.world.hazardState = (i, t) => ({ x: 0, active: t > 1.8 });
  assert(NK.guide.update(R, R.racers[0], 0.05).danger);
});
check('guidance finds pickups across the start seam without chasing passed rows', () => {
  const R = race(); put(R, 0, 980, 0, 24);
  R.world.features.itemRows = [{ s: 35, lanes: [3] }, { s: 970, lanes: [0] }];
  assert.equal(NK.guide.update(R, R.racers[0], 0.05).targetLane, 3);
});
check('CPU choices repeat, rubber band stays bounded, human autopilot follows cues', () => {
  const R = race(), S = race();
  NK.ai.init(R, R.racers[1], 99); NK.ai.init(S, S.racers[1], 99);
  R.world.features.itemRows = S.world.features.itemRows = [{ s: 150, lanes: [3] }];
  for (let i = 0; i < 120; i++) { NK.ai.update(R, R.racers[1], 0.05); NK.ai.update(S, S.racers[1], 0.05); assert.equal(R.racers[1].stepTarget, S.racers[1].stepTarget); }
  put(R, 1, 10000); assert(NK.ai.pace(R, R.racers[1]) >= 0.85);
  put(R, 1, -10000); assert(NK.ai.pace(R, R.racers[1]) <= 1.12);
  NK.ai.update(R, R.racers[0], 0.05); assert.equal(R.racers[0].stepTarget, NK.guide.update(R, R.racers[0], 0).targetLane);
  assert.equal(NK.ai.pace(R, R.racers[0]), 1);
});
check('inside-line and coin routing never show a direction prompt', () => {
  const R = race(); put(R, 0, 100, 0, 24);
  R.world.frameAt = () => ({ heading: 0, bank: 0, curvature: 0.012 });
  let cue = NK.guide.update(R, R.racers[0], 0.05);
  assert(NK.guide.laneScores(R, R.racers[0], 3.6)[3] > NK.guide.laneScores(R, R.racers[0], 3.6)[2]);
  assert.equal(cue.active, false); assert.equal(cue.id, null);
  R.time = 1; R.world.frameAt = () => ({ heading: 0, bank: 0, curvature: 0 });
  R.world.features.coins = [135, 142, 149, 156, 163, 170].map(s => ({ s, lane: 3 }));
  cue = NK.guide.update(R, R.racers[0], 0.05);
  assert.equal(cue.targetLane, 3); assert.equal(cue.active, false);
});
check('useful pad cue has a stable identity and retains its safe target', () => {
  const R = race(); put(R, 0, 100, 0, 24); R.racers[0].item = 'rocket';
  R.world.features.padRows = [{ s: 134, lanes: [1] }];
  const first = Object.assign({}, NK.guide.update(R, R.racers[0], 0.05));
  assert(first.active); assert.equal(first.targetLane, 1); assert(first.benefit >= 8);
  R.time = 0.2; put(R, 0, 105, 0, 24);
  R.world.features.boostPads = [{ s: 180, lanes: [4] }];
  R.world.features.coins = [140, 147, 154, 161, 168, 175].map(s => ({ s, lane: 4 }));
  const next = NK.guide.update(R, R.racers[0], 0.05);
  assert.equal(next.id, first.id); assert.equal(next.targetLane, 1);
});
check('a hazard cue keeps one identity and releases after passing the hazard', () => {
  const R = race(); put(R, 0, 100, 0, 24);
  R.world.features.hazards = [{ s: 160, x: 0, halfWidth: 1.2, halfLength: 2, kind: 'block' }];
  const first = Object.assign({}, NK.guide.update(R, R.racers[0], 0.05));
  assert(first.active); assert(first.id.startsWith('hazard:'));
  R.time = 0.2; put(R, 0, 105, 0, 24);
  assert.equal(NK.guide.update(R, R.racers[0], 0.05).id, first.id);
  R.time = 3; put(R, 0, 180, C.laneX(first.targetLane), 24);
  const after = NK.guide.update(R, R.racers[0], 0.05);
  assert.equal(after.id, null); assert.equal(after.active, false);
});
check('danger remains visible without promising an unsafe or unreachable escape', () => {
  const R = race(); put(R, 0, 100, 0, 24);
  R.itemObjects = [{ type: 'bomb', ownerIdx: 1, s: 129, x: 0, age: 0, life: 1.2, v: 0 }];
  let cue = NK.guide.update(R, R.racers[0], 0.05);
  assert(cue.danger); assert.equal(cue.active, false); assert(Number.isInteger(cue.targetLane));
  const S = race(); put(S, 0, 100, 0, 24);
  S.world.features.hazards = [{ s: 102.4, x: 0, halfWidth: 1.2, halfLength: 2, kind: 'block' }];
  cue = NK.guide.update(S, S.racers[0], 0.05);
  assert(cue.danger); assert.equal(cue.active, false);
});
check('pads offer the same boost route with an empty slot or an item', () => {
  const R = race(); put(R, 0, 100, 0, 24);
  R.world.features.padRows = [{ s: 134, lanes: [1] }];
  const empty = Array.from(NK.guide.laneScores(R, R.racers[0], 3.6));
  R.racers[0].item = 'rocket'; R.racers[0].roulette = 0.5;
  assert.deepEqual(Array.from(NK.guide.laneScores(R, R.racers[0], 3.6)), empty);
  assert(empty[1] > empty[2]);
});
check('linked ramp obstacles remain a safe route before takeoff and in flight', () => {
  const R = race(); put(R, 0, 100, 0, 24);
  R.world.features.ramps = [{ s: 140, kind: 'jump', lanes: [1, 2], flightLength: 32, len: 6 }];
  R.world.features.hazards = [{ s: 162, x: 0, halfWidth: 1.2, halfLength: 2, kind: 'block', jumpObstacle: true, rampS: 140 }];
  let cue = NK.guide.update(R, R.racers[0], 0.05);
  assert.equal(cue.danger, false); assert.equal(cue.active, false); assert.equal(cue.targetLane, 2);
  R.time = 2; put(R, 0, 150, 0, 24); R.racers[0].airT = 0.4; R.racers[0].y = 3;
  cue = NK.guide.update(R, R.racers[0], 0.05);
  assert.equal(cue.danger, false); assert.equal(cue.active, false);
});
check('missing a ramp does not suppress the warning for its obstacle', () => {
  const R = race(); put(R, 0, 150, 0, 24);
  R.world.features.ramps = [{ s: 140, kind: 'jump', lanes: [1, 2], flightLength: 32, len: 6 }];
  R.world.features.hazards = [{ s: 162, x: 0, halfWidth: 1.2, halfLength: 2, kind: 'block', jumpObstacle: true, rampS: 140 }];
  assert(NK.guide.update(R, R.racers[0], 0.05).danger);
});
process.stdout.write(checks + ' item/guidance/AI checks passed.\n');
