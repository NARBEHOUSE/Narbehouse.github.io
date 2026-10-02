'use strict';
/* Run with: node bennyshub/apps/games/ROBOTFOOTBALL/tests/simulation.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({ Math });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/simulation.js'), 'utf8'), context);
const Sim = context.FootballSim;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function make(opts = {}, events = []) {
  return new Sim(Object.assign({ random: () => 0.2 }, opts), event => events.push(event.type));
}
function continueReady(sim) {
  for (let i = 0; i < 60 && sim.s.resultRevealRemaining > 0; i++) sim.step(.05, 0);
  return sim.continuePlay();
}
function settle(sim, steer = 0, cap = 8000) {
  for (let i = 0; i < cap; i++) {
    if (!['presnap','flight','run','kickflight','defend','tackle'].includes(sim.s.phase) && !(sim.s.phase === 'result' && sim.s.resultRevealRemaining > 0)) return;
    sim.step(0.05, typeof steer === 'function' ? steer(sim.s) : steer);
  }
  throw new Error('Play did not settle: ' + sim.s.phase);
}
function start(sim, id) {
  const ok = sim.callPlay(id);
  if (!ok) return false;
  for (let i = 0; i < 80 && sim.s.phase === 'presnap'; i++) sim.step(0.05, 0);
  assert.notEqual(sim.s.phase, 'presnap');
  return true;
}
function controlReady(sim) {
  for (let i = 0; i < 60 && sim.s.controlGrace > 0; i++) sim.step(0.05, 0);
  assert.equal(sim.s.controlGrace, 0);
}
function position(sim, z, possession = 'home') {
  sim.s.fieldPosition = z; sim.s.possession = possession;
  sim.s.possessionNumber = possession === 'home' ? 0 : 1;
  sim.s.distance = Math.min(10, possession === 'home' ? 100 - z : z);
  sim._formation();
}
test('live aim runs routes indefinitely without a clock, sack, or forced selection', () => {
  const sim = make({ format: 'regulation' });
  assert.equal(start(sim, 'missing'), false);
  start(sim, 'slants'); sim.selectTarget(2);
  const positions = JSON.stringify(sim.s.players.map(p => [p.x, p.z]));
  const target = sim.s.targets[sim.s.selectedTarget];
  for (let i = 0; i < 6000; i++) sim.step(.1, 1);
  assert.notEqual(JSON.stringify(sim.s.players.map(p => [p.x, p.z])), positions);
  assert.equal(sim.s.phase, 'aim'); assert.equal(sim.s.timeRemaining, 120);
  assert.equal(sim.s.targets[sim.s.selectedTarget], target);
  assert.equal(sim.s.down, 1); assert.equal(sim.s.result, null);
  assert.ok(sim.s.players.every(p => Number.isFinite(p.x + p.z) && Math.abs(p.x) <= 26.65));
  assert.equal(sim.selectTarget(-1), false);
  assert.equal(sim.selectTarget(99), false);
  assert.equal(sim.kick(), false);
  assert.equal(start(sim, 'inside'), false);
  assert.equal(sim.snapshot(), null);
});
test('receivers leave a stable formation and execute stems and cuts without teleporting', () => {
  for (const id of ['slants','flood','verticals']) {
    const sim = make({ pace: 1 });
    // Calling the play lines everyone up (the corners and safeties in their coverage); nobody moves again until the snap.
    sim.callPlay(id);
    const before = JSON.stringify(sim.s.players.map(p => [p.x, p.z]));
    for (let i = 0; i < 80 && sim.s.phase === 'presnap'; i++) sim.step(0.05, 0);
    assert.equal(JSON.stringify(sim.s.players.map(p => [p.x, p.z])), before);
    const first = sim._player('home-WR1'), startX = first.x, startZ = first.z;
    for (let i = 0; i < 5; i++) sim.step(.05, 0);
    assert.equal(first.x, startX); assert.ok(first.z > startZ);
    const moving = new Set();
    for (let i = 0; i < 200; i++) {
      const previous = new Map(sim.s.players.map(p => [p.id, { x: p.x, z: p.z }]));
      sim.step(.05, 0);
      sim.s.players.forEach(p => {
        const prev = previous.get(p.id), moved = Math.hypot(p.x - prev.x, p.z - prev.z);
        assert.ok(moved < .4, p.id + ' made a discontinuous move');
        if (moved > .001) moving.add(p.id);
      });
    }
    assert.equal(moving.size, 22);
    sim.s.routes.forEach(route => {
      const p = sim._player(route.playerId), end = route.points[2];
      assert.ok(Math.hypot(p.x - end.x, p.z - end.z) < 1.6);
    });
    assert.ok(sim.s.players.some(p => p.role === 'C' && p.anim === 'block'));
    const beforeSettled = { x: first.x, z: first.z };
    for (let i = 0; i < 15; i++) sim.step(.1, 0);
    assert.ok(Math.hypot(first.x - beforeSettled.x, first.z - beforeSettled.z) > .1);
  }
});
test('passes wind up in real time and lead moving receivers along a fixed arc', () => {
  for (const pace of [.35, .45, 1.2]) for (const wait of [0, 2, 15]) {
    const sim = make({ pace, practice: true }); start(sim, 'slants');
    for (let i = 0; i < wait * 10; i++) sim.step(.1, 0);
    sim.selectTarget(1);
    const receiver = sim._player('home-WR2'), before = { x: receiver.x, z: receiver.z };
    sim.throwPass();
    const point = Object.assign({}, sim.s.passTarget), launch = Object.assign({}, sim.s.ball);
    const passer = sim._player(sim.s.passerId), targetHeading = Math.atan2(point.x-passer.x,point.z-passer.z);
    assert.ok(Math.cos(passer.heading-targetHeading)>.999, 'passer must face the led receiver');
    assert.equal(sim.s.passerId, 'home-QB'); assert.equal(sim.s.throwWindupRemaining, .32);
    for (let i = 0; i < 3; i++) sim.step(.1, 0);
    assert.equal(sim._flight.elapsed, 0);
    assert.equal(sim.s.ball.x, launch.x); assert.equal(sim.s.ball.z, launch.z);
    assert.equal(sim._player('home-QB').anim, 'throw');
    sim.step(.02, 0); assert.equal(sim.s.throwWindupRemaining, 0);
    while (sim.s.phase === 'flight') {
      const previous = { x: receiver.x, z: receiver.z };
      sim.step(.05, 0);
      assert.equal(JSON.stringify(sim.s.passTarget), JSON.stringify(point));
      assert.ok(Math.hypot(receiver.x - previous.x, receiver.z - previous.z) <= .4);
      if (sim.s.phase === 'flight') assert.ok(Number.isFinite(sim.s.ball.vx + sim.s.ball.vy + sim.s.ball.vz));
    }
    assert.equal(sim.s.phase, 'run'); assert.equal(sim.s.controlGrace, 2.2);
    assert.ok(Math.hypot(receiver.x - before.x, receiver.z - before.z) > .02);
    assert.ok(Math.hypot(receiver.x - point.x, receiver.z - point.z) < .00001, 'catch must meet predicted lead');
    const qb = sim._player('home-QB');
    assert.ok(Math.abs(receiver.heading - Math.atan2(qb.x - receiver.x, qb.z - receiver.z)) < .001);
  }
});
test('receiver selection leads to an arcing pass and controllable catch', () => {
  const events = [], sim = make({}, events);
  start(sim, 'slants'); sim.selectTarget(1); sim.throwPass();
  let highest = 0;
  while (sim.s.phase === 'flight') {
    sim.step(0.05, 0); highest = Math.max(highest, sim.s.ball.y);
    assert.ok(Number.isFinite(sim.s.ball.x + sim.s.ball.y + sim.s.ball.z));
  }
  assert.ok(highest > 4);
  assert.equal(sim.s.carrierId, 'home-WR2');
  assert.equal(sim.s.controlledId, sim.s.carrierId);
  assert.equal(sim.s.phase, 'run');
  assert.ok(events.includes('throw') && events.includes('catch'));
  assert.equal(sim.s.controlGrace, 2.2);
  controlReady(sim);
  const initial = sim._player(sim.s.carrierId).x;
  sim.step(0.05, -1);
  assert.ok(sim._player(sim.s.carrierId).x < initial);
});
test('open spacing improves catch chance without a timing test', () => {
  const sim = make();
  start(sim, 'slants');
  const receiver = sim._player(sim.s.targets[0]);
  sim.s.players.filter(p => p.team === 'away').forEach(p => { p.x = 25; p.z = 95; });
  sim._updateTargetInfo();
  const openChance = sim.s.targetInfo[0].catchChance;
  const defender = sim._player('away-CB1');
  defender.x = receiver.x; defender.z = receiver.z;
  sim._updateTargetInfo();
  assert.ok(sim.s.targetInfo[0].catchChance < openChance);
});
test('coverage reads match the defenders on the field and hold still long enough to throw', () => {
  const gapOf = (sim, id) => Math.min(...sim.s.players.filter(q => q.team === 'away' && !/^D[ET]\d$/.test(q.role)).map(q => Math.hypot(q.x - sim._player(id).x, q.z - sim._player(id).z)));
  // A defender only passing by takes a moment to count, so a mismatch may last that long, no longer.
  const wrong = (read, gap) => read === 'Open' ? gap < 4 : read === 'Tight' ? gap > 3.1 : gap < 2.1 || gap > 5;
  for (const [play, seed] of [['slants', 3], ['flood', 7], ['verticals', 11]]) {
    let x = seed; const sim = make({ random: () => { x = x * 16807 % 2147483647; return x / 2147483647; } }); start(sim, play);
    const last = sim.s.targetInfo.map(t => [t.openness, 0]), off = sim.s.targets.map(() => 0);
    for (let t = 0; t < 16; t += .05) {
      sim.step(.05, 0);
      sim.s.targetInfo.forEach((info, i) => {
        // What you hear is what is on the field: a mismatch never outlasts the short confirm.
        off[i] = wrong(info.openness, gapOf(sim, info.id)) ? off[i] + .05 : 0;
        assert.ok(off[i] < 1.2, play + ': ' + info.openness + ' read on #' + info.number + ' does not match the field');
        last[i][1] += .05;
        if (info.openness !== last[i][0]) { assert.ok(t < 1 || last[i][1] >= .6, play + ': a read flickered'); last[i] = [info.openness, 0]; }
      });
    }
  }
  const sim = make({ random: () => .5 }); start(sim, 'slants');
  for (let i = 0; i < 20; i++) sim.step(.05, 0);
  sim._coverPlans[0].left = .1; sim.selectTarget(0);
  assert.ok(sim._coverPlans[0].left >= 3, 'choosing a receiver keeps his defender where he is');
  sim._coverPlans[0].left = .1; sim.keepRead(0); assert.ok(sim._coverPlans[0].left >= 1.5, 'charging a throw to him keeps him there too');
  const receiver = sim._player(sim.s.targets[0]), away = sim.s.players.filter(p => p.team === 'away'), corner = sim._player('away-CB1');
  away.forEach(p => { p.x = 25; p.z = 95; }); sim._reads = {}; sim._updateTargetInfo(0);
  assert.equal(sim.s.targetInfo[0].openness, 'Open'); const wideOpen = sim.s.targetInfo[0].catchChance;
  corner.x = receiver.x + .8; corner.z = receiver.z;
  for (let t = 0; t < .5; t += .05) sim._updateTargetInfo(.05);
  assert.equal(sim.s.targetInfo[0].openness, 'Tight', 'a defender on his hip reads tight within a moment');
  assert.ok(sim.s.targetInfo[0].catchChance < wideOpen, 'and the catch chance follows him');
});
test('four incompletions turn the ball over at the previous spot', () => {
  // A roll that misses every catch without being a pick in tight coverage.
  const sim = make({ random: () => 0.93 });
  for (let down = 1; down <= 4; down++) {
    assert.equal(sim.s.down, down);
    start(sim, 'verticals'); sim.throwPass(); settle(sim);
    assert.equal(sim.s.phase, 'result');
    if (down < 4) assert.equal(sim.s.result.title, 'Incomplete pass');
    else assert.equal(sim.s.result.title, 'Turnover on downs');
    continueReady(sim);
  }
  assert.equal(sim.s.possession, 'away');
  assert.equal(sim.s.fieldPosition, 25);
  assert.equal(sim.s.down, 1);
  assert.equal(sim.s.firstDownLine, 15);
});
test('a completed pass beyond the line to gain resets the downs', () => {
  // A zero roll breaks every tackle, so the runner reaches the sideline past the line to gain.
  const sim = make({ random: () => 0 });
  sim.s.down = 3;
  start(sim, 'slants'); sim.throwPass(); settle(sim, -1);
  assert.equal(sim.s.result.title, 'First down!');
  assert.equal(sim.s.down, 1);
  assert.ok(sim.s.fieldPosition > 35);
  assert.ok(sim.s.firstDownLine > sim.s.fieldPosition);
});
test('a catch in the end zone scores and changes to player-controlled defense', () => {
  const sim = make();
  position(sim, 95); start(sim, 'slants'); sim.throwPass(); settle(sim);
  assert.equal(sim.s.homeScore, 6);
  assert.equal(sim.s.result.title, 'Touchdown!');
  continueReady(sim);
  assert.equal(sim.s.conversion, 'choose'); assert.equal(sim.s.possession, 'home');
  start(sim, 'extrapoint'); sim.kick(); settle(sim);
  assert.equal(sim.s.homeScore, 7);
  continueReady(sim);
  assert.equal(sim.s.possession, 'away');
  assert.equal(sim.s.fieldPosition, 75);
  assert.equal(start(sim, 'slants'), false);
  assert.equal(start(sim, 'contain'), true);
  assert.equal(sim.s.phase, 'defend');
  assert.equal(sim.s.controlledId, 'home-MLB');
  assert.equal(sim.s.carrierId, 'away-QB');
  assert.equal(sim.s.defenseStage, 'dropback');
});
test('defensive steering moves the linebacker and contact ends the play', () => {
  const events = [], sim = make({ random: () => .9 }, events);
  position(sim, 75, 'away'); start(sim, 'contain'); controlReady(sim);
  const player = sim._player(sim.s.controlledId), runner = sim._player(sim.s.carrierId);
  // In open grass, so steering alone moves him (robots are solid in a crowd).
  player.x = runner.x + 6; player.z = runner.z - 8;
  const initialX = player.x, initialZ = runner.z;
  sim.step(0.05, -1);
  assert.ok(player.x < initialX);
  assert.ok(runner.z < initialZ);
  // Guarantee close contact after the brief handoff animation.
  sim._runTime = 1;
  player.x = runner.x; player.z = runner.z;
  sim.step(0.05, 0);
  assert.equal(sim.s.phase, 'tackle');
  settle(sim); assert.equal(sim.s.phase, 'result');
  assert.ok(events.includes('tackle'));
  assert.equal(sim.s.homeScore + sim.s.awayScore, 0);
});
test('a visitors touchdown credits the visitors and changes possession', () => {
  const sim = make({ random: () => .9 });
  position(sim, 1, 'away'); start(sim, 'zone'); controlReady(sim);
  sim._player(sim.s.carrierId).z = 0.02;
  sim.step(0.05, 0);
  assert.equal(sim.s.awayScore, 6);
  continueReady(sim);
  // The visitors kick the extra point on their own after a short setup.
  assert.equal(sim.s.phase, 'presnap'); assert.equal(sim.s.conversion, 'kick');
  settle(sim); assert.equal(sim.s.result.title, 'Extra point good'); assert.equal(sim.s.awayScore, 7);
  continueReady(sim);
  assert.equal(sim.s.possession, 'home');
  assert.equal(sim.s.drive, 2);
  assert.equal(sim.s.fieldPosition, 25);
});
test('field goals score three and misses use the correct receiving spot', () => {
  const good = make({ random: () => 0 });
  position(good, 75); start(good, 'fieldgoal'); good.chooseKick(1); good.kick(); settle(good);
  assert.equal(good.s.homeScore, 3);
  continueReady(good);
  assert.equal(good.s.fieldPosition, 75);
  const miss = make({ random: () => 0.999 });
  position(miss, 90); start(miss, 'fieldgoal'); miss.chooseKick(0); miss.kick(); settle(miss);
  assert.equal(miss.s.homeScore, 0);
  continueReady(miss);
  assert.equal(miss.s.fieldPosition, 80);
});
test('punt touchbacks give visitors the ball at their twenty', () => {
  const sim = make();
  position(sim, 70); start(sim, 'punt'); sim.chooseKick(2); sim.kick(); settle(sim);
  assert.equal(sim.s.result.title, 'Punt · touchback');
  continueReady(sim);
  assert.equal(sim.s.possession, 'away');
  assert.equal(sim.s.fieldPosition, 80);
});
test('crossing a sideline ends a competitive run', () => {
  const sim = make();
  start(sim, 'sweep'); controlReady(sim); sim._player(sim.s.carrierId).x = 26.64; sim.step(0.05, 1);
  assert.equal(sim.s.phase, 'result');
  assert.equal(sim.s.result.title, 'Out of bounds');
});
test('practice catches never drop and the sideline holds the runner', () => {
  const events = [], sim = make({ practice: true, random: () => 0.999 }, events);
  start(sim, 'slants'); sim.throwPass(); settle(sim, 1);
  assert.ok(events.includes('catch'), 'no drops in practice');
  assert.notEqual(sim.s.result.title, 'Out of bounds');
});
test('settled snapshots round-trip and pending possession survives reload', () => {
  const sim = make();
  start(sim, 'punt'); sim.kick(); settle(sim);
  const saved = sim.snapshot(), restored = make();
  assert.equal(restored.restore(JSON.stringify(saved)), true);
  assert.equal(restored.s.phase, 'result');
  assert.equal(restored.s.result.title, sim.s.result.title);
  continueReady(restored); continueReady(sim);
  for (const key of ['possession','fieldPosition','down','distance','drive','homeScore','awayScore']) {
    assert.equal(restored.s[key], sim.s[key]);
  }
  assert.equal(restored.s.players.length, 22);
});
test('invalid stored data is rejected without changing the current game', () => {
  const sim = make(), before = JSON.stringify(sim.s);
  for (const data of [null, '{}', '{bad', {version:99}, {version:1,state:{phase:'run'}}]) assert.equal(sim.restore(data), false);
  const corrupt = sim.snapshot(); corrupt.state.fieldPosition = NaN;
  assert.equal(sim.restore(corrupt), false);
  assert.equal(JSON.stringify(sim.s), before);
  const hostile = sim.snapshot(); hostile.state.players = [{ x: 1e30 }]; hostile.state.ball = { y: -Infinity };
  assert.equal(sim.restore(hostile), true);
  assert.equal(sim.s.players.length, 22);
  assert.ok(Number.isFinite(sim.s.ball.y));
});
test('large frame gaps are bounded and non-finite input cannot corrupt state', () => {
  const sim = make(); start(sim, 'sweep'); controlReady(sim);
  const z = sim._player(sim.s.carrierId).z;
  sim.step(60, Infinity);
  assert.ok(sim._player(sim.s.carrierId).z - z < 1);
  const before = JSON.stringify(sim.s);
  sim.step(NaN, 0); sim.step(-1, 0); sim.step(Infinity, 0);
  assert.equal(JSON.stringify(sim.s), before);
});
test('a complete game includes eight possessions and ends cleanly in every mode', () => {
  for (const mode of ['rookie','pro','practice']) {
    let seed = 42;
    const sim = make({ difficulty: mode === 'pro' ? 'pro' : 'rookie', practice: mode === 'practice',
      random: () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; } });
    const possessions = new Set();
    let steps = 0, defensePlays = 0;
    while (sim.s.phase !== 'final' && steps++ < 100000) {
      const s = sim.s;
      possessions.add(s.possessionNumber);
      if (s.phase === 'playcall') {
        // Blitz on every down; on fourth down the visitors' kick brings out the first special-teams call.
        start(sim, s.possession === 'home' ? s.conversion === 'choose' ? 'extrapoint' : 'slants' : sim.playbook().some(p => p.id === 'blitz') ? 'blitz' : sim.playbook()[0].id);
        if (s.possession === 'away') defensePlays++;
      } else if (s.phase === 'aim') sim.throwPass();
      else if (s.phase === 'kickaim') sim.kick();
      else if (s.phase === 'result') continueReady(sim);
      else sim.step(0.05, 0);
    }
    assert.equal(sim.s.phase, 'final', mode);
    assert.equal(possessions.size, 8);
    assert.equal(sim.s.possessionNumber, 8);
    assert.ok(defensePlays >= 4);
    assert.equal(continueReady(sim), false);
    assert.equal(start(sim, 'slants'), false);
    // Practice runners can be tackled, but the visitors never score.
    if (mode === 'practice') {
      assert.ok(sim.s.homeScore > 0);
      assert.equal(sim.s.awayScore, 0);
    }
    const restore = make();
    assert.equal(restore.restore(sim.snapshot()), true);
    assert.equal(restore.s.phase, 'final');
  }
});

test('every call waits three real seconds before the snap at every pace', () => {
  for (const pace of [.35, .45, 1.2]) {
    for (const [id, possession, expected] of [['slants','home','aim'],['inside','home','run'],['punt','home','kickaim'],['contain','away','defend']]) {
      const events = [], sim = make({ pace, random: () => .9 }, events);
      position(sim, possession === 'home' ? 25 : 75, possession);
      assert.equal(sim.callPlay(id), true);
      assert.equal(sim.s.phase, 'presnap'); assert.equal(sim.s.countdown, 3);
      assert.equal(sim.s.nextPhase, expected);
      const positions = JSON.stringify(sim.s.players.map(p => [p.x, p.z]));
      for (let i = 0; i < 29; i++) sim.step(.1, 1);
      assert.equal(sim.s.phase, 'presnap');
      assert.equal(JSON.stringify(sim.s.players.map(p => [p.x, p.z])), positions);
      assert.equal(events.filter(e => e === 'snap').length, 0);
      sim.step(.1, 0);
      assert.equal(sim.s.phase, expected); assert.equal(sim.s.countdown, 0);
      assert.equal(events.filter(e => e === 'snap').length, 1);
      assert.equal(sim.s.elapsed, 0);
    }
  }
});
test('handoffs animate during protected grace without steering, clock loss, or teleporting', () => {
  for (const pace of [.35, 1.2]) for (const possession of ['home','away']) {
    const sim = make({ pace, format: 'regulation', random: () => .9 });
    const mirror = make({ pace, format: 'regulation', random: () => .9 });
    for (const match of [sim,mirror]) {
      position(match, possession === 'home' ? 25 : 75, possession);
      start(match, possession === 'home' ? 'inside' : 'contain');
    }
    const initial = JSON.stringify(sim.s.players.map(p => [p.x,p.z]));
    assert.equal(sim.s.carrierId, possession + '-QB');
    for (let i = 0; i < 44; i++) {
      const previous = sim.s.players.map(p => ({ x:p.x,z:p.z }));
      sim.step(.05, 1); mirror.step(.05,-1);
      sim.s.players.forEach((p,j) => assert.ok(Math.hypot(p.x-previous[j].x,p.z-previous[j].z) < .35));
      assert.equal(JSON.stringify(sim.s.players.map(p => [p.x,p.z])), JSON.stringify(mirror.s.players.map(p => [p.x,p.z])));
      assert.equal(sim.s.timeRemaining, 120); assert.equal(sim.s.result, null);
    }
    assert.notEqual(JSON.stringify(sim.s.players.map(p => [p.x,p.z])), initial);
    assert.equal(sim.s.controlGrace, 0); assert.equal(sim.s.carrierId, possession + '-RB');
    // The mirror copy steers the other way; bodies in the crowd push both copies alike.
    const player = sim._player(sim.s.controlledId), twin = mirror._player(mirror.s.controlledId);
    sim.step(.05,1); mirror.step(.05,-1);
    assert.ok(player.x > twin.x); assert.equal(sim.s.timeRemaining,119.95);
  }
});
test('a catch gives a fresh protected handoff and movement eases in', () => {
  const sim = make({ practice: true, pace: .45 });
  start(sim, 'slants'); sim.throwPass();
  while (sim.s.phase === 'flight') sim.step(.05, 0);
  assert.equal(sim.s.controlGrace, 2.2);
  const p = sim._player(sim.s.carrierId), before = [p.x, p.z];
  for (let i = 0; i < 44; i++) sim.step(.05, -1);
  assert.deepEqual([p.x, p.z], before);
  const initialZ = p.z;
  sim.step(.1, 0);
  const earlyDelta = p.z - initialZ;
  for (let i = 0; i < 16; i++) sim.step(.1, 0);
  const laterZ = p.z;
  sim.step(.1, 0);
  assert.ok(p.z - laterZ > earlyDelta * 2);
});
function advanceUntil(sim, predicate, cap = 4000) {
  for (let i = 0; i < cap; i++) {
    if (predicate(sim.s)) return;
    if (sim.s.phase === 'result' || sim.s.phase === 'final') break;
    sim.step(.05, 0);
  }
  assert.ok(predicate(sim.s), 'Expected state was not reached; phase=' + sim.s.phase);
}
test('CPU passes keep the player on defense through the flight and catch', () => {
  const events = [], sim = make({ random: () => 0 }, events);
  position(sim, 75, 'away'); start(sim, 'zone');
  assert.equal(sim.s.opponentPlayType, 'pass');
  assert.equal(sim.s.defenseStage, 'dropback');
  controlReady(sim); sim.step(.05,0);
  assert.equal(sim._player('away-QB').heading, Math.PI, 'CPU QB must look downfield during dropback');
  advanceUntil(sim, s => s.defenseStage === 'flight');
  const passer = sim._player('away-QB'), point = sim.s.passTarget;
  assert.ok(Math.cos(passer.heading-Math.atan2(point.x-passer.x,point.z-passer.z))>.999);
  assert.equal(sim.s.phase, 'defend'); assert.equal(sim.s.controlledId, 'home-MLB');
  assert.ok(sim.s.defenseTargetId.startsWith('away-'));
  assert.equal(sim.s.carrierId, null);
  let peak = sim.s.ball.y;
  while (sim.s.defenseStage === 'flight' && sim.s.phase === 'defend') {
    sim.step(.05, 0); peak = Math.max(peak, sim.s.ball.y);
  }
  assert.ok(peak > 4);
  assert.equal(sim.s.phase, 'defend'); assert.equal(sim.s.defenseStage, 'chase');
  assert.equal(sim.s.controlledId, 'home-MLB');
  assert.equal(sim.s.carrierId, sim.s.defenseTargetId);
  assert.equal(sim.s.controlGrace, 2.2);
  assert.ok(events.includes('throw') && events.includes('catch'));
  settle(sim);
  assert.equal(sim.s.phase, 'result');
});
test('coverage calls alter CPU passing chances and blitz contact sacks the QB', () => {
  const chance = id => {
    const sim = make({ random: () => .2 });
    position(sim, 75, 'away'); start(sim, id);
    advanceUntil(sim, s => s.defenseStage === 'flight');
    return sim._flight.chance;
  };
  assert.ok(chance('zone') < chance('contain'));
  const sim = make({ random: () => .2 });
  position(sim, 75, 'away'); start(sim, 'blitz'); controlReady(sim);
  const qb = sim._player('away-QB'), defender = sim._player('home-MLB');
  defender.x = qb.x; defender.z = qb.z; sim._cpuPass.elapsed = 1;
  sim.step(.05, 0);
  assert.equal(sim.s.phase, 'tackle'); settle(sim);
  assert.equal(sim.s.phase, 'result'); assert.equal(sim.s.result.title, 'Sack!');
  assert.ok(sim.s.fieldPosition > 75);
});
test('CPU chooses field goals in range and punts deep on fourth and long', () => {
  const fieldgoal = make({ random: () => 0 });
  position(fieldgoal, 30, 'away'); fieldgoal.s.down = 4;
  assert.deepEqual(Array.from(fieldgoal.playbook(), p => p.id), ['fgblock', 'fgreturn'], 'a field goal try brings out the field goal unit');
  start(fieldgoal, 'fgreturn');
  assert.equal(fieldgoal.s.phase, 'kickflight');
  assert.equal(fieldgoal.s.opponentPlayType, 'fieldgoal');
  assert.equal(fieldgoal.s.kickTarget.z, -12);
  settle(fieldgoal); assert.equal(fieldgoal.s.awayScore, 3);
  continueReady(fieldgoal); assert.equal(fieldgoal.s.possession, 'home'); assert.equal(fieldgoal.s.fieldPosition, 25);
  const punt = make({ random: () => .5 });
  position(punt, 75, 'away'); punt.s.down = 4; punt.s.distance = 8;
  assert.deepEqual(Array.from(punt.playbook(), p => p.id), ['puntreturn', 'puntblock'], 'a punt brings out the return unit');
  start(punt, 'puntblock');
  assert.equal(punt.s.opponentPlayType, 'punt');
  settle(punt); continueReady(punt);
  assert.equal(punt.s.possession, 'home'); assert.ok(punt.s.fieldPosition < 40 && punt.s.fieldPosition > 20);
});
test('a punt return fields the punt and runs it back as your possession', () => {
  const events = [], sim = make({ random: () => .5 }, events);
  position(sim, 75, 'away'); sim.s.down = 4; sim.s.distance = 8;
  start(sim, 'puntreturn');
  assert.equal(sim.s.phase, 'kickflight'); assert.equal(sim.s.returnerId, 'home-FS');
  assert.ok(sim._player('home-FS').z < 40, 'the returner waits deep');
  for (let i = 0; i < 400 && sim.s.phase === 'kickflight'; i++) sim.step(.05, 0);
  assert.equal(sim.s.phase, 'run', 'your returner has the ball');
  assert.equal(sim.s.possession, 'home'); assert.equal(sim.s.possessionNumber, 2, 'the new possession counts at the catch');
  assert.equal(sim.s.carrierId, 'home-FS'); assert.equal(sim.s.controlledId, 'home-FS');
  assert.ok(events.includes('catch'));
  const caught = sim.s.returnFrom;
  settle(sim);
  assert.ok(['Punt return', 'Return out of bounds', 'Return touchdown!'].includes(sim.s.result.title), sim.s.result.title);
  if (sim.s.result.title !== 'Return touchdown!') {
    continueReady(sim);
    assert.equal(sim.s.possession, 'home'); assert.equal(sim.s.possessionNumber, 2); assert.equal(sim.s.down, 1);
    assert.ok(sim.s.fieldPosition >= Math.floor(caught), 'the drive starts where the return ended');
  }
  // The last possession of a four-possession game ends with the punt; there is no drive left to return it into.
  const last = make({ random: () => .5 });
  position(last, 75, 'away'); last.s.down = 4; last.s.distance = 8; last.s.possessionNumber = 7;
  start(last, 'puntreturn'); settle(last);
  assert.equal(last.s.result.title, 'Visitors punt'); continueReady(last); assert.equal(last.s.phase, 'final');
});
test('a punt block can win the ball, and a block in their end zone is a touchdown', () => {
  const sim = make({ random: () => 0 });
  position(sim, 75, 'away'); sim.s.down = 4; sim.s.distance = 8;
  start(sim, 'puntblock'); assert.ok(sim._flight.blocked);
  settle(sim); assert.equal(sim.s.result.title, 'Punt blocked!');
  continueReady(sim); assert.equal(sim.s.possession, 'home'); assert.ok(sim.s.fieldPosition > 75, 'recovered behind their line');
  const rolls = [0], deep = make({ random: () => rolls.length ? rolls.shift() : .99 });
  position(deep, 96, 'away'); deep.s.down = 4;
  start(deep, 'puntblock'); settle(deep);
  assert.equal(deep.s.result.title, 'Blocked punt touchdown!'); assert.equal(deep.s.homeScore, 6);
  assert.equal(deep.s.stats.home.yards, 0, 'a block is not offense');
  continueReady(deep); assert.equal(deep.s.possession, 'home'); assert.equal(deep.s.conversion, 'choose');
});
test('a field goal block can stop the kick, and a long kick that falls short can be returned', () => {
  const block = make({ random: () => 0 });
  position(block, 30, 'away'); block.s.down = 4;
  start(block, 'fgblock'); assert.ok(block._flight.blocked);
  settle(block); assert.equal(block.s.result.title, 'Kick blocked!'); assert.equal(block.s.awayScore, 0);
  continueReady(block); assert.equal(block.s.possession, 'home');
  // A 52-yard try misses and comes down short; the returner waiting at the goal line runs it back.
  const rolls = [.99, .1], miss = make({ random: () => rolls.length ? rolls.shift() : .5 });
  position(miss, 35, 'away'); miss.s.down = 4;
  start(miss, 'fgreturn'); assert.equal(miss.s.returnerId, 'home-FS'); assert.ok(miss._flight.short);
  for (let i = 0; i < 400 && miss.s.phase === 'kickflight'; i++) miss.step(.05, 0);
  assert.equal(miss.s.phase, 'run'); assert.equal(miss.s.possession, 'home'); assert.equal(miss.s.carrierId, 'home-FS');
  settle(miss);
  assert.ok(['Missed kick return', 'Return out of bounds', 'Return touchdown!'].includes(miss.s.result.title), miss.s.result.title);
  // With a block called, nobody is back: a short miss is simply your ball.
  const rolls2 = [.99, .99, .1], dead = make({ random: () => rolls2.length ? rolls2.shift() : .5 });
  position(dead, 35, 'away'); dead.s.down = 4;
  start(dead, 'fgblock'); settle(dead);
  assert.equal(dead.s.result.title, 'Kick short'); continueReady(dead); assert.equal(dead.s.possession, 'home');
});
test('man-to-man presses the receivers and sits on short routes', () => {
  const sim = make();
  position(sim, 60, 'away');
  assert.deepEqual(Array.from(sim.playbook(), p => p.id), ['contain', 'blitz', 'zone', 'man']);
  sim.callPlay('man');
  const corner = sim._player('home-CB1');
  assert.ok(Math.abs(corner.z - 57.5) < .01 && corner.x === -19, 'the corner presses his receiver at the line');
  for (let i = 0; i < 80 && sim.s.phase === 'presnap'; i++) sim.step(.05, 0);
  assert.equal(sim.s.opponentPlayType, 'pass'); assert.equal(sim._cpuPass.coverageGap, 1.4, 'tight on a short pass');
});
test('a holder kneels with the ball on its point and the kicker runs up to boot it', () => {
  const events = [], sim = make({ random: () => 0 }, events);
  position(sim, 75); sim.callPlay('fieldgoal');
  const k = sim.s.placeKick, holder = sim._player('home-QB'), kicker = sim._player('home-RB');
  assert.ok(k, 'a field goal lines up a holder');
  assert.equal(k.spot.z, 68); assert.equal(sim.s.ball.z, 68); assert.equal(sim.s.ball.x, 0);
  assert.ok(Math.abs(holder.z - 68) < .01 && Math.abs(holder.x) < 1, 'the holder kneels beside the spot');
  assert.ok(kicker.z < 66 && Math.abs(kicker.x) > 1.5, 'the kicker stands back and to the side');
  for (let i = 0; i < 80 && sim.s.phase === 'presnap'; i++) sim.step(.05, 0);
  sim.setKickAim(0); sim.kick(1);
  assert.equal(sim.s.phase, 'kickflight'); assert.ok(!events.includes('kick'), 'the boot has not landed yet');
  const startGap = Math.hypot(kicker.x, kicker.z - 68);
  for (let i = 0; i < 8; i++) sim.step(.05, 0);
  assert.ok(!sim.s.placeKick.struck && kicker.anim !== 'kick' && sim.s.ball.z === 68 && sim.s.ball.y < .3, 'the ball waits on the tee');
  assert.ok(Math.hypot(kicker.x, kicker.z - 68) < startGap, 'the kicker is running up');
  let steps = 8; for (; steps < 40 && !sim.s.placeKick.struck; steps++) sim.step(.05, 0);
  assert.ok(sim.s.placeKick.struck); assert.ok(Math.abs(steps * .05 - 1) < .06, 'the run-up takes about a second at any pace'); assert.equal(kicker.anim, 'kick');
  assert.equal(events.filter(e => e === 'kick').length, 1, 'one kick call, at contact');
  assert.ok(Math.hypot(kicker.x, kicker.z - 68) < .6, 'the boot meets the ball');
  settle(sim); assert.equal(sim.s.result.title, 'Field goal!');
  const extra = make({ random: () => 0 }); touchdown(extra); extra.callPlay('extrapoint');
  assert.ok(extra.s.placeKick, 'an extra point has a holder too');
  const punt = make(); position(punt, 30); punt.callPlay('punt'); assert.equal(punt.s.placeKick, null, 'a punter needs no holder');
  const cpu = make({ random: () => 0 }); position(cpu, 30, 'away'); cpu.s.down = 4; cpu._formation();
  assert.ok(cpu.s.placeKick && cpu.s.placeKick.spot.z === 37, 'the visitors line up their holder before you pick a defense');
  assert.equal(cpu._player('away-QB').z, 37);
});
test('continuous kick aim remains available and the far goal target stays at 112', () => {
  const sim = make({ random: () => 0 });
  position(sim, 80); start(sim, 'fieldgoal');
  assert.equal(sim.setKickAim(.4), true); assert.equal(sim.s.kickAim, .4);
  assert.equal(sim.setKickAim(Infinity), false); assert.equal(sim.s.kickAim, .4);
  sim.kick(); assert.equal(sim.s.kickTarget.z, 112); assert.equal(sim.s.kickTarget.x, .4 * 2.2);
  const punt = make(); start(punt, 'punt'); punt.setKickAim(-9);
  assert.equal(punt.s.kickAim, -1); assert.equal(punt.s.kickAimIndex, 0);
});
test('regulation clock waits in menus, aim, countdown and grace; expiry settles at dead ball', () => {
  const sim = make({ format: 'regulation', pace: .35, random: () => 0 });
  for (let i = 0; i < 100; i++) sim.step(.1, 0);
  assert.equal(sim.s.timeRemaining, 120);
  start(sim, 'fieldgoal');
  for (let i = 0; i < 100; i++) sim.step(.1, 0);
  assert.equal(sim.s.timeRemaining, 120);
  sim.s.timeRemaining = .05; sim.kick(); sim.step(.1, 0);
  assert.equal(sim.s.timeRemaining, 0); assert.equal(sim.s.quarter, 1);
  assert.equal(sim.s.phase, 'kickflight');
  settle(sim); assert.equal(sim.s.quarter, 1);
  continueReady(sim);
  assert.equal(sim.s.quarter, 2); assert.equal(sim.s.timeRemaining, 120);
  assert.equal(sim.s.phase, 'playcall');
});
test('regulation continues beyond eight possessions and tied periods repeat overtime', () => {
  const sim = make({ format: 'regulation' });
  for (let i = 0; i < 8; i++) {
    sim._finishPossession(sim.s.possession === 'home' ? 75 : 25, 'End of drive', 'Next possession.');
    continueReady(sim);
  }
  assert.equal(sim.s.phase, 'playcall'); assert.equal(sim.s.possessionNumber, 8);
  assert.equal(sim.s.drive, 5);
  sim.s.quarter = 4; sim.s.timeRemaining = 0;
  sim._finishPlay(sim.s.lineOfScrimmage, 'Incomplete pass'); continueReady(sim);
  assert.equal(sim.s.overtime, true); assert.equal(sim.s.overtimePeriod, 1);
  assert.equal(sim.s.timeRemaining, 120);
  sim.s.timeRemaining = 0; sim._finishPlay(sim.s.lineOfScrimmage, 'Incomplete pass'); continueReady(sim);
  assert.equal(sim.s.overtimePeriod, 2);
  sim.s.homeScore = 3; sim.s.timeRemaining = 0;
  sim._finishPlay(sim.s.lineOfScrimmage, 'Incomplete pass'); continueReady(sim);
  assert.equal(sim.s.phase, 'final');
  const loaded = make(); assert.equal(loaded.restore(sim.snapshot()), true);
  assert.equal(loaded.s.overtimePeriod, 2);
});
test('legacy saves migrate and invalid new clock/format fields are rejected atomically', () => {
  const legacy = make().snapshot(); legacy.version = 1;
  delete legacy.options.format;
  for (const key of ['format','quarter','timeRemaining','overtime','overtimePeriod']) delete legacy.state[key];
  const loaded = make();
  assert.equal(loaded.restore(legacy), true); assert.equal(loaded.options.format, 'drives');
  assert.equal(loaded.s.timeRemaining, 120);
  const regulation = make({ format: 'regulation' });
  for (const [key, value] of [['timeRemaining', -1], ['timeRemaining', 121], ['quarter', 5], ['overtime', true], ['format', 'bad']]) {
    const data = regulation.snapshot(); data.state[key] = value;
    const before = JSON.stringify(loaded.s);
    assert.equal(loaded.restore(data), false);
    assert.equal(JSON.stringify(loaded.s), before);
  }
});
test('a full regulation game reaches a non-tied final after four timed quarters', () => {
  let seed = 7;
  const sim = make({ format: 'regulation',
    random: () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; } });
  let steps = 0;
  const quarters = new Set();
  while (sim.s.phase !== 'final' && steps++ < 200000) {
    quarters.add(sim.s.quarter);
    if (sim.s.phase === 'playcall') sim.callPlay(sim.s.possession === 'home' ? sim.s.conversion === 'choose' ? 'extrapoint' : 'slants' : sim.playbook().some(p => p.id === 'zone') ? 'zone' : sim.playbook()[0].id);
    else if (sim.s.phase === 'aim') sim.throwPass();
    else if (sim.s.phase === 'kickaim') sim.kick();
    else if (sim.s.phase === 'result') continueReady(sim);
    else sim.step(.1, 0);
  }
  assert.equal(sim.s.phase, 'final'); assert.equal(quarters.size, 4);
  assert.equal(sim.s.timeRemaining, 0); assert.notEqual(sim.s.homeScore, sim.s.awayScore);
  assert.equal(make().restore(sim.snapshot()), true);
});

test('both offenses line up with seven on the line and defensive calls settle before the snap', () => {
  for (const possession of ['home','away']) {
    const sim = make(); position(sim, possession === 'home' ? 25 : 75, possession);
    const offense = sim.s.players.filter(p => p.team === possession), d = possession === 'home' ? 1 : -1;
    const onLine = offense.filter(p => Math.abs(p.z - sim.s.lineOfScrimmage) < .01);
    assert.equal(onLine.length, 7);
    const linemen = onLine.filter(p => ['C','LG','RG','LT','RT'].includes(p.role)).sort((a,b)=>a.x-b.x);
    for(let i=1;i<linemen.length;i++)assert.ok(linemen[i].x-linemen[i-1].x>=1.4 && linemen[i].x-linemen[i-1].x<=1.9, 'line should have realistic shoulder-width splits');
    assert.deepEqual(Array.from(onLine, p => p.role).sort(), ['C','LG','LT','RG','RT','WR1','WR2']);
    assert.ok(offense.filter(p => !onLine.includes(p)).every(p => (p.z - sim.s.lineOfScrimmage) * d < 0));
    assert.ok(sim.s.players.filter(p => p.team !== possession).every(p => (p.z - sim.s.lineOfScrimmage) * d >= 2));
  }
  for (const id of ['contain','blitz','zone']) {
    const sim = make({ random: () => .9 }); position(sim,75,'away'); sim.callPlay(id);
    const formation = JSON.stringify(sim.s.players.map(p => [p.x,p.z]));
    for (let i=0;i<30;i++) sim.step(.1,0);
    assert.equal(JSON.stringify(sim.s.players.map(p => [p.x,p.z])),formation);
  }
});
test('tackle contact stays visible before a protected result, and result saves reload safely', () => {
  const events=[], sim=make({ random:()=>.9 },events);
  position(sim,75,'away'); start(sim,'contain'); controlReady(sim);
  const carrier=sim._player(sim.s.carrierId), tackler=sim._player(sim.s.controlledId);
  sim._runTime=1; tackler.x=carrier.x; tackler.z=carrier.z; sim.step(.05,0);
  assert.equal(sim.s.phase,'tackle'); assert.equal(sim.s.tackle.duration,1.4);
  assert.equal(carrier.anim,'down'); assert.equal(tackler.anim,'tackle');
  const contactZ=carrier.z;
  for(let i=0;i<13;i++) sim.step(.1,1);
  assert.equal(sim.s.phase,'tackle'); assert.ok(carrier.z<contactZ);
  assert.equal(sim.continuePlay(),false); assert.equal(sim.snapshot(),null);
  sim.step(.1,0);
  assert.equal(sim.s.phase,'result'); assert.equal(sim.s.resultRevealRemaining,2.2);
  assert.equal(sim.continuePlay(),false); assert.equal(events.filter(e=>e==='tackle').length,1);
  const restored=make(); assert.equal(restored.restore(sim.snapshot()),true);
  assert.equal(restored.s.resultRevealRemaining,0); assert.equal(restored.continuePlay(),true);
  for(let i=0;i<21;i++) sim.step(.1,0);
  assert.equal(sim.continuePlay(),false); sim.step(.1,0);
  assert.equal(sim.continuePlay(),true); assert.equal(sim.s.phase,'playcall');
});
test('all units receive live football assignments and selected team unit names persist', () => {
  const sim=make({ practice:true }); sim.setTeamNames('TITAN','CHROME');
  assert.equal(sim._player('home-QB').name,'TITAN #12');
  assert.equal(sim._player('away-MLB').name,'CHROME #54');
  start(sim,'inside'); controlReady(sim); sim.step(.1,0);
  assert.ok(sim.s.players.every(p=>p.assignment && !p.assignment.startsWith('Set ') && Number.isFinite(p.goal.x+p.goal.z)));
  const qb=sim._player('home-QB'), before={x:qb.x,z:qb.z};
  for(let i=0;i<15;i++)sim.step(.1,0);
  assert.ok(Math.hypot(qb.x-before.x,qb.z-before.z)>.1);
  sim.reset(); assert.equal(sim._player('home-QB').name,'TITAN #12');
  const saved=sim.snapshot(); assert.equal(sim.restore(saved),true);
  assert.equal(sim._player('away-MLB').name,'CHROME #54');
});

function touchdown(sim) {
  position(sim, 95); start(sim, 'slants'); sim.throwPass(); settle(sim);
  assert.equal(sim.s.result.title, 'Touchdown!');
  continueReady(sim);
}
test('a touchdown is worth six and opens the extra-point or two-point choice', () => {
  const events = [], sim = make({ random: () => 0 }, events);
  touchdown(sim);
  assert.equal(sim.s.homeScore, 6); assert.ok(events.includes('conversion'));
  assert.equal(sim.s.phase, 'playcall'); assert.equal(sim.s.conversion, 'choose'); assert.equal(sim.s.possession, 'home');
  assert.deepEqual(Array.from(sim.playbook(), p => p.id), ['extrapoint', 'gofortwo']);
  assert.equal(sim.callPlay('slants'), false); assert.equal(sim.callPlay('punt'), false);
  assert.equal(start(sim, 'extrapoint'), true);
  assert.equal(sim.s.phase, 'kickaim'); assert.equal(sim.s.lineOfScrimmage, 85);
  sim.kick(); assert.equal(sim.s.kickTarget.z, 112); settle(sim);
  assert.equal(sim.s.result.title, 'Extra point good!'); assert.equal(sim.s.homeScore, 7);
  continueReady(sim);
  assert.equal(sim.s.possession, 'away'); assert.equal(sim.s.fieldPosition, 75); assert.equal(sim.s.conversion, null);
  const miss = make({ random: () => .999 });
  position(miss, 95); start(miss, 'slants'); miss.options.practice = true; miss.throwPass(); settle(miss); miss.options.practice = false;
  continueReady(miss); start(miss, 'extrapoint'); miss.chooseKick(0); miss.kick(); settle(miss);
  assert.equal(miss.s.result.title, 'Extra point missed'); assert.equal(miss.s.homeScore, 6);
});
test('going for two is one run or pass from the 2-yard line', () => {
  const sim = make({ random: () => 0 });
  touchdown(sim);
  assert.equal(sim.callPlay('gofortwo'), true);
  assert.equal(sim.s.phase, 'playcall'); assert.equal(sim.s.conversion, 'two'); assert.equal(sim.s.fieldPosition, 98);
  assert.equal(sim.s.firstDownLine, 100);
  assert.ok(sim.playbook().every(p => p.type === 'pass' || p.type === 'run'));
  assert.equal(sim.callPlay('fieldgoal'), false);
  sim.options.practice = true; start(sim, 'inside'); settle(sim, 0); sim.options.practice = false;
  assert.equal(sim.s.result.title, 'Two-point conversion!'); assert.equal(sim.s.homeScore, 8);
  continueReady(sim); assert.equal(sim.s.possession, 'away'); assert.equal(sim.s.fieldPosition, 75);
  const stopped = make({ random: () => .93 });  // misses the catch without a pick
  position(stopped, 95); stopped.options.practice = true; start(stopped, 'slants'); stopped.throwPass(); settle(stopped); stopped.options.practice = false;
  continueReady(stopped); stopped.callPlay('gofortwo'); start(stopped, 'slants'); stopped.throwPass(); settle(stopped);
  assert.equal(stopped.s.result.title, 'Conversion stopped'); assert.equal(stopped.s.homeScore, 6);
  continueReady(stopped); assert.equal(stopped.s.possession, 'away'); assert.equal(stopped.s.down, 1);
});
test('the conversion is an untimed down that comes before the period ends', () => {
  const sim = make({ format: 'regulation', random: () => 0 });
  position(sim, 95); start(sim, 'slants'); sim.s.timeRemaining = .01; sim.throwPass(); settle(sim);
  assert.equal(sim.s.timeRemaining, 0); assert.equal(sim.s.result.title, 'Touchdown!');
  continueReady(sim);
  assert.equal(sim.s.quarter, 1); assert.equal(sim.s.conversion, 'choose');
  sim.callPlay('gofortwo'); sim.options.practice = true; start(sim, 'sweep'); settle(sim, 0); sim.options.practice = false;
  assert.equal(sim.s.timeRemaining, 0); continueReady(sim);
  assert.equal(sim.s.quarter, 2); assert.equal(sim.s.timeRemaining, 120); assert.equal(sim.s.possession, 'away');
});
test('the visitors go for two when the score calls for it and the player defends the try', () => {
  const sim = make({ random: () => .9 });
  sim.s.homeScore = 5;
  position(sim, 1, 'away'); start(sim, 'zone'); controlReady(sim);
  sim._player(sim.s.carrierId).z = .02; sim.step(.05, 0);
  assert.equal(sim.s.awayScore, 6); continueReady(sim);
  assert.equal(sim.s.phase, 'playcall'); assert.equal(sim.s.conversion, 'two'); assert.equal(sim.s.possession, 'away');
  assert.equal(sim.s.fieldPosition, 2);
  assert.deepEqual(Array.from(sim.playbook(), p => p.id), ['contain', 'blitz', 'zone', 'man']);
  assert.equal(start(sim, 'contain'), true); assert.equal(sim.s.phase, 'defend');
  controlReady(sim);
  const runner = sim._player(sim.s.carrierId), me = sim._player(sim.s.controlledId);
  sim._runTime = 1; me.x = runner.x; me.z = runner.z; sim.step(.05, 0); settle(sim);
  assert.equal(sim.s.result.title, 'Conversion denied'); assert.equal(sim.s.awayScore, 6);
  continueReady(sim); assert.equal(sim.s.possession, 'home'); assert.equal(sim.s.fieldPosition, 25);
});
test('conversion checkpoints save and restore; unsettled conversion states are rejected', () => {
  const sim = make({ random: () => 0 });
  position(sim, 95); start(sim, 'slants'); sim.throwPass(); settle(sim);
  const atResult = sim.snapshot(), reloaded = make();
  assert.equal(reloaded.restore(atResult), true); continueReady(reloaded);
  assert.equal(reloaded.s.conversion, 'choose'); assert.equal(reloaded.s.homeScore, 6);
  const choice = reloaded.snapshot(), again = make();
  assert.equal(again.restore(JSON.stringify(choice)), true);
  assert.equal(again.s.conversion, 'choose'); assert.equal(again.callPlay('extrapoint'), true);
  for (const [key, value] of [['conversion', 'kick'], ['conversion', 'bogus']]) {
    const data = JSON.parse(JSON.stringify(choice)); data.state[key] = value;
    assert.equal(make().restore(data), false);
  }
  const away = JSON.parse(JSON.stringify(choice)); away.state.possession = 'away'; away.state.possessionNumber = 1;
  assert.equal(make().restore(away), false);
  const both = JSON.parse(JSON.stringify(atResult)); both.pending.switchPossession = true; both.pending.spot = 75;
  assert.equal(make().restore(both), false);
});
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function evade(s) {
  // Steer away from the defenders ahead, like a player looking for open grass.
  const p = s.players.find(q => q.id === s.carrierId); if (!p) return 0;
  let push = 0;
  for (const q of s.players) {
    if (q.team === s.possession) continue;
    const ahead = q.z - p.z; if (ahead < -1 || ahead > 14) continue;
    push -= Math.sign(q.x - p.x || .01) / Math.max(1, Math.hypot(q.x - p.x, ahead) ** 2) * 12;
  }
  return Math.max(-1, Math.min(1, push + (p.x > 20 ? -1 : p.x < -20 ? 1 : 0)));
}
test('defenders take angles and reach the runner: a catch is rarely a free touchdown', () => {
  const tally = { catches: 0, touchdowns: 0, tackles: 0, broken: 0 };
  for (let i = 0; i < 60; i++) {
    const events = [], sim = make({ random: seeded(900 + i * 7919) }, events);
    start(sim, ['slants', 'flood', 'verticals'][i % 3]);
    for (let n = 0; n < 40; n++) sim.step(.05, 0);
    sim.throwPass(); settle(sim, s => s.phase === 'run' ? evade(s) : 0);
    if (!events.includes('catch')) continue;
    tally.catches++;
    if (sim.s.result.title === 'Touchdown!') tally.touchdowns++;
    if (events.includes('tackle')) tally.tackles++;
    if (events.includes('broken')) tally.broken++;
  }
  assert.ok(tally.catches >= 35, JSON.stringify(tally));
  assert.ok(tally.touchdowns <= tally.catches * .2, 'too many free touchdowns: ' + JSON.stringify(tally));
  assert.ok(tally.tackles >= tally.catches * .6, 'defenders must make most stops: ' + JSON.stringify(tally));
  assert.ok(tally.broken > 0, 'some tackles should be broken: ' + JSON.stringify(tally));
});
test('a broken tackle drops the defender to the turf until he gets back up', () => {
  const events = [], sim = make({ random: () => 0 }, events);
  start(sim, 'inside'); controlReady(sim);
  for (let i = 0; i < 20; i++) sim.step(.05, 0);
  assert.equal(sim.s.phase, 'run'); sim._runTime = 1;
  const runner = sim._player(sim.s.carrierId), safety = sim._player('away-FS');
  sim.s.players.filter(p => p.team === 'away' && p !== safety).forEach(p => { p.x = 25; p.z = 99; });
  safety.x = runner.x + 1.2; safety.z = runner.z - 1; safety.shed = true;
  sim.step(.05, 0);
  assert.equal(sim.s.phase, 'run'); assert.ok(events.includes('broken'));
  assert.equal(safety.anim, 'dive'); assert.ok(safety.stun > 0);
  assert.ok(runner.stumble > 0); assert.equal(sim.s.stats.home.broken, 1);
  safety.x = runner.x; safety.z = runner.z; sim.step(.05, 0);
  assert.equal(sim.s.phase, 'run');
});
test('game stats count yards, touchdowns, sacks and takeaways', () => {
  const sim = make({ random: () => 0 });
  position(sim, 95); start(sim, 'slants'); sim.throwPass(); settle(sim);
  assert.equal(sim.s.stats.home.tds, 1); assert.ok(sim.s.stats.home.yards >= 5);
  const sack = make({ random: () => .2 });
  position(sack, 75, 'away'); start(sack, 'blitz'); controlReady(sack);
  const qb = sack._player('away-QB'), me = sack._player('home-MLB');
  me.x = qb.x; me.z = qb.z; sack._cpuPass.elapsed = 1; sack.step(.05, 0); settle(sack);
  assert.equal(sack.s.stats.home.sacks, 1); assert.ok(sack.s.stats.away.yards < 0);
  const saved = sack.snapshot(), loaded = make();
  assert.equal(loaded.restore(saved), true); assert.equal(loaded.s.stats.home.sacks, 1);
  const hostile = JSON.parse(JSON.stringify(saved)); hostile.state.stats.home.yards = 'lots';
  assert.equal(make().restore(hostile), false);
});
test('a defender who reaches the ball carrier tackles him, and nobody runs through the runner', () => {
  let contacts = 0, tackles = 0;
  for (let i = 0; i < 40; i++) {
    const events = [], sim = make({ random: seeded(4100 + i * 7919) }, events);
    start(sim, ['inside', 'sweep', 'slants', 'flood'][i % 4]);
    for (let n = 0; n < 40 && sim.s.phase === 'aim'; n++) sim.step(.05, 0);
    if (sim.s.phase === 'aim') sim.throwPass();
    for (let n = 0; n < 8000 && ['flight', 'run'].includes(sim.s.phase); n++) {
      sim.step(.05, sim.s.phase === 'run' ? evade(sim.s) : 0);
      const p = sim.s.phase === 'run' && sim.s.controlGrace === 0 && sim._player(sim.s.carrierId);
      if (!p) continue;
      for (const q of sim.s.players) if (q !== p) assert.ok(Math.hypot(q.x - p.x, q.z - p.z) > .5, q.id + ' overlapped the ball carrier');
    }
    if (events.includes('tackle') || events.includes('broken')) contacts++;
    if (events.includes('tackle')) tackles++;
  }
  assert.ok(contacts >= 30, 'defenders must reach the runner: ' + contacts);
  assert.ok(tackles >= contacts * .8, 'contact must usually end in a tackle: ' + tackles + '/' + contacts);
});
test('on defense a hands-off player gets the robot nearest the ball carrier', () => {
  const events = [], sim = make({ random: () => .9 }, events);
  position(sim, 75, 'away'); start(sim, 'contain');
  assert.equal(sim.s.controlledId, 'home-MLB');
  controlReady(sim);
  const runner = sim._player(sim.s.carrierId), gap = q => Math.hypot(q.x - runner.x, q.z - runner.z);
  const home = sim.s.players.filter(p => p.team === 'home');
  assert.equal(sim._player(sim.s.controlledId), home.slice().sort((a, b) => gap(a) - gap(b))[0]);
  assert.ok(events.includes('switch'));
  assert.equal(sim.s.autoPlay, true, 'no steering during the handoff means auto defense');
  sim.step(.05, 1);
  assert.equal(sim.s.autoPlay, false, 'steering takes control back at once');
});
function holdDefense(sim) {
  // Keep a CPU run alive and put one teammate much closer to the runner than the player's robot.
  const runner = sim._player(sim.s.carrierId), me = sim._player(sim.s.controlledId);
  const helper = sim.s.players.find(p => p.team === 'home' && p !== me && p.role.startsWith('CB'));
  const place = () => {
    sim.s.players.filter(p => p.team === 'home' && p !== me && p !== helper).forEach(p => { p.x = 25; p.z = runner.z - 30; });
    me.x = clamp(runner.x + 12, -24, 24); me.z = runner.z; helper.x = runner.x + 3.5; helper.z = runner.z - 1.5;
  };
  return { me, helper, place };
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
test('steering keeps your defender; hands-off he plays himself; at three seconds control moves', () => {
  const sim = make({ random: () => .9 });
  position(sim, 75, 'away'); start(sim, 'contain');
  for (let i = 0; i < 60 && sim.s.controlGrace > 0; i++) sim.step(.05, 1);
  assert.equal(sim.s.controlledId, 'home-MLB', 'holding a steer through the handoff keeps your robot');
  const { me, helper, place } = holdDefense(sim);
  for (let i = 0; i < 80; i++) { place(); sim.step(.05, i % 2 ? 1 : -1); }
  assert.equal(sim.s.phase, 'defend');
  assert.equal(sim.s.controlledId, me.id, 'no switch while the player steers');
  assert.equal(sim.s.autoPlay, false);
  for (let i = 0; i < 7; i++) { place(); sim.step(.05, 0); }
  assert.equal(sim.s.autoPlay, false, 'a quick release between presses stays yours');
  for (let i = 0; i < 2; i++) { place(); sim.step(.05, 0); }
  assert.equal(sim.s.autoPlay, true, 'hands off: your robot plays himself');
  assert.equal(sim.s.controlledId, me.id, 'auto play alone does not switch');
  me.x = helper.x + 8; me.z = helper.z; const x = me.x; sim.step(.05, 0);
  assert.ok(me.x < x, 'the released robot pursues by himself');
  for (let i = 0; i < 40; i++) { place(); sim.step(.05, 0); }
  assert.equal(sim.s.controlledId, me.id, 'no switch before three seconds hands-off');
  for (let i = 0; i < 12; i++) { place(); sim.step(.05, 0); }
  assert.equal(sim.s.controlledId, helper.id, 'three seconds hands-off: control moves to the nearest robot');
  sim.step(.05, -1);
  assert.equal(sim.s.autoPlay, false); assert.equal(sim.s.controlledId, helper.id);
});
test('a held steer counts as control even while pointed straight', () => {
  const sim = make({ random: () => .9 });
  position(sim, 75, 'away'); start(sim, 'contain'); controlReady(sim);
  for (let i = 0; i < 70; i++) sim.step(.05, 0, true);
  assert.equal(sim.s.autoPlay, false);
});
test('practice runners are tackled like anyone else: dodging is what practice teaches', () => {
  const events = [], sim = make({ practice: true, random: () => .9 }, events);
  start(sim, 'inside'); controlReady(sim);
  const runner = sim._player(sim.s.carrierId), defender = sim._player('away-MLB');
  sim._runTime = 1; defender.x = runner.x + .6; defender.z = runner.z + .9; defender.shed = true;
  sim.step(.05, 0);
  assert.equal(sim.s.phase, 'tackle'); assert.ok(!events.includes('broken'));
  let carries = 0, touchdowns = 0, tackles = 0;
  for (let i = 0; i < 30; i++) {
    const seen = [], play = make({ practice: true, random: seeded(700 + i * 7919) }, seen);
    start(play, ['slants', 'inside', 'sweep'][i % 3]);
    for (let n = 0; n < 40 && play.s.phase === 'aim'; n++) play.step(.05, 0);
    if (play.s.phase === 'aim') play.throwPass();
    settle(play, s => s.phase === 'run' ? evade(s) : 0);
    carries++; if (/touchdown/i.test(play.s.result.title)) touchdowns++; if (seen.includes('tackle')) tackles++;
  }
  assert.ok(tackles >= carries * .6, 'practice defenders make most stops: ' + tackles + '/' + carries);
  assert.ok(touchdowns <= carries * .2, 'practice is not a free touchdown: ' + touchdowns + '/' + carries);
});
test('place kicks start the aim at a far post; the kick is good inside the window between the uprights', () => {
  for (const r of [.1, .9]) {
    const sim = make({ random: () => r });
    position(sim, 80); start(sim, 'fieldgoal');
    assert.equal(Math.abs(sim.s.kickAim), 1, 'the aim starts at a far post');
    assert.ok(sim.s.kickWindow > .25 && sim.s.kickWindow < .55);
  }
  const punt = make(); position(punt, 30); start(punt, 'punt'); assert.equal(punt.s.kickAim, 0, 'a punt starts centred');
  const inside = make({ random: () => .5 }); position(inside, 75); start(inside, 'fieldgoal');
  inside.setKickAim(inside.s.kickWindow * .8); inside.kick(); settle(inside);
  assert.equal(inside.s.result.title, 'Field goal!');
  const outside = make({ random: () => .5 }); position(outside, 75); start(outside, 'fieldgoal');
  outside.setKickAim(outside.s.kickWindow + .2); outside.kick(); settle(outside);
  assert.equal(outside.s.result.title, 'Kick wide');
  const far = make(), near = make(); position(far, 60); position(near, 85);
  start(far, 'fieldgoal'); start(near, 'fieldgoal');
  assert.ok(far.s.kickWindow < near.s.kickWindow, 'longer kicks narrow the window');
});
test('the charge sets the leg: a weak kick falls short of a long field goal, not of an extra point', () => {
  const long = make({ random: () => 0 }); position(long, 62); start(long, 'fieldgoal');
  long.setKickAim(0); long.kick(.4); settle(long);
  assert.equal(long.s.result.title, 'Kick short'); assert.equal(long.s.homeScore, 0);
  const full = make({ random: () => 0 }); position(full, 62); start(full, 'fieldgoal');
  full.setKickAim(0); full.kick(1); settle(full);
  assert.equal(full.s.result.title, 'Field goal!');
  const extra = make({ random: () => 0 });
  touchdown(extra); start(extra, 'extrapoint'); extra.setKickAim(0); extra.kick(.4); settle(extra);
  assert.equal(extra.s.result.title, 'Extra point good!', 'a short kick needs little charge');
  const punts = [.3, 1].map(power => { const p = make({ random: () => .5 }); position(p, 30); start(p, 'punt'); p.kick(power); return p.s.kickTarget.z; });
  assert.ok(punts[0] < punts[1], 'a full charge punts farther');
});
test('a pass let go before the line reaches him comes down short and falls incomplete', () => {
  const thrown = (power, opts = {}) => {
    const sim = make(Object.assign({ random: () => .5 }, opts)); start(sim, 'slants');
    for (let i = 0; i < 20; i++) sim.step(.05, 0);
    sim.selectTarget(0); sim.throwPass(power); return sim;
  };
  const full = thrown(1), early = thrown(.4), qb = full._player('home-QB');
  const reach = sim => Math.hypot(sim._flight.to.x - qb.x, sim._flight.to.z - qb.z);
  assert.ok(reach(early) < reach(full) * .6, 'the ball lands where the line ended');
  assert.equal(early._flight.short, true); assert.equal(early._flight.chance, 0);
  settle(early); assert.equal(early.s.result.title, 'Thrown short'); assert.equal(early.s.down, 2);
  const nearly = thrown(Sim.CHARGE_ZONE[0] * .98);
  assert.ok(nearly._flight.chance > 0 && nearly._flight.chance < full._flight.chance * .5, 'a ball that lands at his feet is a hard diving catch');
  assert.equal(full._flight.chance, thrown(undefined)._flight.chance, 'with the charge off, every throw is on target');
  const practice = thrown(.4, { practice: true }); settle(practice);
  assert.equal(practice.s.result.title, 'Thrown short', 'practice teaches the timing too');
});
test('a charge held past the receiver sails over his head', () => {
  const sim = make({ random: () => 0 }); start(sim, 'slants');
  for (let i = 0; i < 20; i++) sim.step(.05, 0);
  sim.selectTarget(1);
  const aim = make({ random: () => 0 }); start(aim, 'slants'); for (let i = 0; i < 20; i++) aim.step(.05, 0);
  aim.selectTarget(1); aim.throwPass(1); const onTime = aim.s.passTarget;
  sim.throwPass(Sim.CHARGE_MAX); const long = sim.s.passTarget, qb = sim._player('home-QB');
  assert.ok(Math.hypot(long.x - qb.x, long.z - qb.z) > Math.hypot(onTime.x - qb.x, onTime.z - qb.z) + 3, 'the ball lands past the receiver');
  settle(sim);
  assert.equal(sim.s.result.title, 'Overthrown'); assert.equal(sim.s.down, 2);
  const inZone = make({ random: () => 0 }); start(inZone, 'slants'); for (let i = 0; i < 20; i++) inZone.step(.05, 0);
  inZone.selectTarget(1); inZone.throwPass(Sim.CHARGE_ZONE[1]);
  assert.ok(!inZone._flight.over, 'the whole zone is a good throw');
});
// Kickoffs: a coin toss opens the game, every half and every score kicks off.
const kickSim = (opts = {}, events = []) => make(Object.assign({ kickoffs: true, random: () => .5 }, opts), events);
const untilPhase = (sim, phases, cap = 6000) => { for (let i = 0; i < cap && !phases.includes(sim.s.phase); i++) sim.step(.05, 0); return sim.s.phase; };
test('a coin toss opens the game: win it and choose, lose it and the visitors defer', () => {
  const won = kickSim({ format: 'regulation', random: () => .1 });
  assert.equal(won.s.phase, 'playcall'); assert.equal(won.s.toss, 'call');
  assert.deepEqual(Array.from(won.playbook(), p => p.id), ['heads', 'tails']);
  assert.ok(won.callPlay('heads')); assert.equal(won.s.toss, 'choose');
  assert.deepEqual(Array.from(won.playbook(), p => p.id), ['receive', 'defer'], 'a game with halves offers receive or defer');
  won.callPlay('receive');
  assert.equal(won.s.possession, 'home'); assert.equal(won.s.kickoff.team, 'away'); assert.equal(won.s.secondHalfReceiver, 'away');
  assert.equal(won.s.phase, 'presnap', 'the visitors kick off to you');
  const lost = kickSim({ format: 'regulation', random: () => .1 }); lost.callPlay('tails');
  assert.equal(lost.s.kickoff.team, 'away', 'the visitors defer, so you receive'); assert.equal(lost.s.secondHalfReceiver, 'away');
  const short = kickSim({ random: () => .1 }); short.callPlay('heads');
  assert.deepEqual(Array.from(short.playbook(), p => p.id), ['receive', 'kickfirst'], 'four possessions have no second half to defer to');
  short.callPlay('kickfirst'); assert.equal(short.s.kickoff.team, 'home'); assert.equal(short.s.possession, 'away'); assert.equal(short.s.firstPossession, 'away');
  const off = make(); assert.equal(off.s.toss, null); assert.equal(off.s.kickoff, null, 'with kickoffs off the game starts at the 25 as before');
});
test('your kickoff: the charge sets the distance, a full kick is a touchback or a short return', () => {
  const events = [], sim = kickSim({ random: () => .9 }, events); sim.s.toss = null; sim._setupKickoff('home');
  assert.deepEqual(Array.from(sim.playbook(), p => p.id), ['kickdeep'], 'no onside kick unless you are behind');
  assert.equal(sim.s.placeKick.tee, true); assert.equal(sim.s.placeKick.holderId, null); assert.equal(sim.s.lineOfScrimmage, 35);
  sim.callPlay('kickdeep'); untilPhase(sim, ['kickaim']); assert.equal(sim.s.phase, 'kickaim');
  sim.kick(1); assert.equal(sim.s.phase, 'kickflight'); assert.ok(!events.includes('kick'), 'the kicker runs up first');
  const phase = untilPhase(sim, ['result', 'defend']);
  assert.ok(events.includes('kick'));
  if (phase === 'defend') assert.equal(sim.s.possession, 'away', 'the visitors return it and you cover');
  settle(sim); assert.equal(sim.s.possession, 'away'); assert.equal(sim.s.down, 1); assert.equal(sim.s.kickoff, null);
  const weak = kickSim({ random: () => .5 }); weak.s.toss = null; weak._setupKickoff('home'); weak.callPlay('kickdeep'); untilPhase(weak, ['kickaim']);
  weak.kick(.3); assert.ok(weak._flight.to.z < 95, 'a soft charge lands well short of the goal line');
  const behind = kickSim(); behind.s.toss = null; behind.s.awayScore = 7; behind._setupKickoff('home');
  assert.deepEqual(Array.from(behind.playbook(), p => p.id), ['kickdeep', 'onside']);
});
test('caught in the end zone: take a knee for the 25, or run it out', () => {
  const knee = kickSim({ random: () => .9 }); knee.s.toss = null; knee._setupKickoff('away');
  assert.equal(untilPhase(knee, ['returnchoice', 'run']), 'returnchoice', 'a deep kick lands in your end zone');
  assert.equal(knee.s.carrierId, 'home-RB');
  for (let i = 0; i < 40; i++) knee.step(.05, 0);
  assert.equal(knee.s.phase, 'returnchoice', 'the choice waits for you');
  knee.chooseReturn(false); assert.equal(knee.s.result.title, 'Touchback');
  continueReady(knee); assert.equal(knee.s.possession, 'home'); assert.equal(knee.s.fieldPosition, 25); assert.equal(knee.s.down, 1);
  assert.equal(knee.s.phase, 'playcall'); assert.ok(knee.playbook().some(p => p.id === 'slants'));
  const run = kickSim({ random: () => .9 }); run.s.toss = null; run._setupKickoff('away'); untilPhase(run, ['returnchoice']);
  run.chooseReturn(true); assert.equal(run.s.phase, 'run'); assert.equal(run.s.controlledId, 'home-RB');
  settle(run); continueReady(run); assert.equal(run.s.possession, 'home'); assert.ok(run.s.fieldPosition >= 1 && run.s.fieldPosition <= 100);
});
test('every score kicks off; a safety is a punted free kick from the 20', () => {
  const fg = kickSim({ random: () => 0 }); fg.s.toss = null; fg.s.kickoff = null; fg.s.possession = 'home'; position(fg, 75); start(fg, 'fieldgoal');
  fg.setKickAim(0); fg.kick(1); settle(fg); assert.equal(fg.s.result.title, 'Field goal!'); assert.match(fg.s.result.detail, /You kick off/);
  continueReady(fg); assert.equal(fg.s.kickoff.team, 'home'); assert.equal(fg.s.possession, 'away'); assert.equal(fg.s.phase, 'playcall');
  const safety = kickSim(); safety.s.toss = null; position(safety, 3); safety._finishPlay(-1, 'Tackled');
  assert.equal(safety.s.awayScore, 2); assert.match(safety.s.result.detail, /free kick from your 20/);
  continueReady(safety); assert.equal(safety.s.kickoff.safety, true); assert.equal(safety.s.lineOfScrimmage, 20);
  assert.equal(safety.s.placeKick, null, 'no tee after a safety'); assert.equal(safety.s.carrierId, safety.s.players.find(p => p.team === 'home' && p.assignment === 'Kick off').id);
});
test('the second half kicks off to the team the toss gave it to', () => {
  const sim = kickSim({ format: 'regulation', random: () => .1 }); sim.callPlay('heads'); sim.callPlay('defer');
  assert.equal(sim.s.kickoff.team, 'home', 'you defer, so you kick first'); assert.equal(sim.s.secondHalfReceiver, 'home');
  sim.s.kickoff = null; sim.s.quarter = 2; sim.s.timeRemaining = 0; sim.s.possession = 'away'; sim.s.phase = 'result'; sim.s.resultRevealRemaining = 0;
  sim._pending = { switchPossession: false }; sim.continuePlay();
  assert.equal(sim.s.quarter, 3); assert.equal(sim.s.kickoff.team, 'away'); assert.equal(sim.s.possession, 'home', 'you receive the second half');
});
test('an onside kick is a long shot that sometimes comes back', () => {
  const tries = [0, .99].map(roll => { const sim = kickSim({ random: () => roll }); sim.s.toss = null; sim.s.awayScore = 7; sim._setupKickoff('home'); sim.callPlay('onside'); untilPhase(sim, ['kickaim']); sim.kick(); settle(sim); return sim; });
  assert.equal(tries[0].s.result.title, 'Onside kick recovered!'); continueReady(tries[0]); assert.equal(tries[0].s.possession, 'home');
  assert.equal(tries[1].s.result.title, 'Onside kick'); continueReady(tries[1]); assert.equal(tries[1].s.possession, 'away');
  assert.ok(Math.abs(tries[1].s.fieldPosition - 35) > 9 && Math.abs(tries[1].s.fieldPosition - 35) < 14, 'it goes ten yards or a little more');
});
test('the coin toss and your kickoff call save and restore', () => {
  const toss = kickSim(); const snap = toss.snapshot(); const back = new Sim({ random: () => .5 });
  assert.ok(back.restore(snap)); assert.equal(back.s.toss, 'call'); assert.deepEqual(Array.from(back.playbook(), p => p.id), ['heads', 'tails']);
  const kick = kickSim(); kick.s.toss = null; kick._setupKickoff('home'); const saved = kick.snapshot();
  const again = new Sim({ random: () => .5 }); assert.ok(again.restore(saved));
  assert.equal(again.s.kickoff.team, 'home'); assert.equal(again.s.possession, 'away'); assert.equal(again.s.placeKick.tee, true, 'the kickoff lineup is rebuilt');
  const theirs = kickSim(); theirs.s.toss = null; theirs._setupKickoff('away'); assert.equal(theirs.snapshot(), null, 'the visitors kicking off is not a save point');
});
test('Basic tosses the coin for you: win and you receive, and the visitors choose as before', () => {
  // The first roll is your call (under .5 is heads), the second is the coin.
  const rolls = (...list) => () => list.length > 1 ? list.shift() : list[0];
  const won = kickSim(); won.random = rolls(.1, .1, .5); const wonToss = won.autoToss();
  assert.equal(wonToss.won, true); assert.match(wonToss.text, /You call heads\. It is heads\. You win the toss and receive\./);
  assert.equal(won.s.toss, null); assert.equal(won.s.kickoff.team, 'away', 'you receive'); assert.equal(won.s.possession, 'home'); assert.equal(won.s.phase, 'presnap');
  const lost = kickSim(); lost.random = rolls(.1, .9, .5); const lostToss = lost.autoToss();
  assert.equal(lostToss.won, false); assert.equal(lost.s.kickoff.team, 'home', 'with no halves the visitors receive');
  assert.equal(lost.s.phase, 'playcall'); assert.equal(lostToss.title, 'COIN TOSS · TAILS');
  const season = kickSim({ format: 'regulation' }); season.random = rolls(.1, .9, .5); season.autoToss();
  assert.equal(season.s.kickoff.team, 'away', 'the visitors defer, so you receive'); assert.equal(season.s.secondHalfReceiver, 'away');
  const chose = kickSim({ format: 'regulation', random: () => .1 }); chose.callPlay('heads'); assert.equal(chose.s.toss, 'choose');
  chose.autoToss(); assert.equal(chose.s.kickoff.team, 'away', 'a toss you already won becomes a receive'); assert.equal(chose.s.secondHalfReceiver, 'away');
  const ot = kickSim({ format: 'regulation' }); ot.random = rolls(.1, .1, .5); ot.s.overtime = true; ot.s.overtimePeriod = 1; ot.s.quarter = 4; ot._startToss();
  const otToss = ot.autoToss(); assert.match(otToss.text, /^Overtime coin toss\./); assert.equal(ot.s.kickoff.team, 'away'); assert.equal(ot.s.secondHalfReceiver, null, 'overtime has no halves');
  assert.equal(make().autoToss(), null, 'no toss, nothing to do'); assert.equal(won.autoToss(), null);
});
test('a kickoff with no charge lands short for a return, and only now and then for a touchback', () => {
  const lands = [];
  for (let i = 0; i < 600; i++) {
    const sim = kickSim({ random: Math.random }); sim.s.toss = null; sim._setupKickoff('home'); sim.callPlay('kickdeep'); untilPhase(sim, ['kickaim']);
    sim.kick(); const z = sim._flight.to.z; lands.push(sim._direction() === 1 ? z : 100 - z);
  }
  const touchbacks = lands.filter(y => y < 0).length / lands.length;
  assert.ok(touchbacks > .04 && touchbacks < .17, 'about one kick in ten carries into the end zone: ' + touchbacks);
  assert.ok(lands.every(y => y < 0 ? y <= -4 : y >= 3 && y <= 10), 'the rest land between the 3 and the 10');
});
test('loading a save announces nothing from the reset behind it', () => {
  const saved = kickSim({ format: 'regulation' }); saved.s.toss = null; saved._setupKickoff('home'); const snap = saved.snapshot();
  const events = [], back = new Sim({ random: () => .5 }, event => events.push(event.type));
  assert.ok(back.restore(snap)); assert.deepEqual(events, []);
});
test('robots are solid on every play, and a pass cannot fly through a defender', () => {
  const overlaps = sim => { let n = 0; const ps = sim.s.players; for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) if (Math.hypot(ps[a].x - ps[b].x, ps[a].z - ps[b].z) < .7) n++; return n; };
  for (const play of ['slants', 'flood', 'verticals']) {
    const sim = make(); start(sim, play);
    for (let i = 0; i < 200; i++) { sim.step(.05, 0); assert.equal(overlaps(sim), 0, play + ': robots overlap while routes run'); }
  }
  const defense = make({ random: () => .5 }); position(defense, 60, 'away'); start(defense, 'zone');
  for (let i = 0; i < 60 && defense.s.phase === 'defend'; i++) { defense.step(.05, 1, true); assert.equal(overlaps(defense), 0, 'your defender cannot walk through robots'); }
  const pass = make({ random: () => .5 }); start(pass, 'slants');
  for (let i = 0; i < 20; i++) pass.step(.05, 0);
  pass.selectTarget(0); pass.throwPass(1);
  const f = pass._flight, wall = pass._player('away-FS');
  // Stand a safety where the ball comes down low, just short of the receiver.
  const t = .93, x = f.from.x + (f.to.x - f.from.x) * t, z = f.from.z + (f.to.z - f.from.z) * t;
  for (let i = 0; i < 400 && pass.s.phase === 'flight'; i++) { wall.x = x; wall.z = z; wall.stun = 0; pass.step(.05, 0); }
  assert.equal(pass.s.result.title, 'Knocked down');
});
console.log('\n' + passed + ' simulation tests passed.');
