/* Set pieces on the real worlds (DESIGN §4.4, §4.8): headless, Node only.
 * Run: node tools/setpiece_test.cjs [trackId,...]
 * Builds each circuit with the shipping world.js and races a full field
 * through it, checking the promises the landscape jumps, loops and
 * waterfalls make. Nothing is rendered. */
'use strict';
const assert = require('node:assert/strict');
const R = require('./node_render.cjs');
const { THREE, NK } = R.boot();
const C = NK.C, U = NK.util;
const only = (process.argv[2] || '').split(',').filter(Boolean);
let checks = 0;
function check(name, fn) { fn(); checks++; process.stdout.write('PASS ' + name + '\n'); }

function field(id, o) {
  o = o || {};
  const scene = new THREE.Scene();
  const W = NK.world.build(scene, id, { mode: o.mode || 'open', mirror: !!o.mirror, quality: { shadows: false } });
  const chars = NK.roster.CHARACTERS.map((c) => c.id);
  const Rc = NK.race.create({ world: W, scene, mode: o.mode || 'open', classId: o.classId || 'fast', laps: o.laps || 3,
    humans: [{ charId: 'pip', vehicleId: 'kart' }],
    cpus: chars.slice(1, 1 + (o.cpus === undefined ? 11 : o.cpus)).map((cid, i) => ({ charId: cid, vehicleId: NK.roster.VEHICLES[i % 4].id })) });
  Rc.skipIntro(); Rc.setAutopilot(0, true);
  return { W, R: Rc, scene };
}

const ids = Object.keys(NK.tracks.TRACKS).filter((id) => !only.length || only.includes(id));

/* 1. A full race on every circuit, both rule sets: no kart ever drives on a
      gap's missing road, rescues land on road, nothing goes NaN, all finish. */
const runs = [];
ids.forEach((id) => ['open', 'nofail'].forEach((mode) => runs.push([id, mode, false])));
ids.filter((id) => NK.tracks.TRACKS[id].pieces).forEach((id) => runs.push([id, 'open', true]));
runs.forEach(([id, mode, mirror]) => check(id + ' (' + mode + (mirror ? ', mirror' : '') + '): a full race never drives on missing road', () => {
  const { W, R: Rc } = field(id, { mode, mirror });
  const events = { jump: 0, splash: 0, loop: 0, rescued: 0 };
  Object.keys(events).forEach((k) => Rc.on(k, () => { events[k]++; }));
  Rc.on('rescued', (r) => { assert(!W.inGap(r.progress), id + ': a rescue set ' + r.name + ' down over a gap'); });
  let t = 0, worstFlightGap = Infinity;
  while (Rc.phase !== 'done' && t < 400) {
    Rc.update(1 / 30); t += 1 / 30;
    Rc.racers.forEach((r) => {
      assert(Number.isFinite(r.progress) && Number.isFinite(r.x) && Number.isFinite(r.y), id + ': ' + r.name + ' went NaN');
      if (r.fallT > 0 || r.rescueT > 0) return;
      if (W.inGap(r.progress)) {
        assert(r.airT > 0, id + ': ' + r.name + ' is on the ground over a gap at ' + r.progress.toFixed(1));
        worstFlightGap = Math.min(worstFlightGap, r.y);
      }
    });
  }
  assert.equal(Rc.phase, 'done', id + ': the race finished');
  assert(events.jump >= Rc.racers.length * 2 * W.pieces.gaps.length, id + ": every kart jumped every gap on the laps it ran (" + events.jump + ")");
  if (W.pieces.loops.length) assert(events.loop >= Rc.racers.length * 2, id + ': loop entries were announced');
  if (W.pieces.falls.length) assert(events.splash >= Rc.racers.length * 2, id + ': waterfall splashes were announced');
}));

/* 2. Round a loop a kart's visible speed is its real speed. */
ids.filter((id) => NK.tracks.TRACKS[id].pieces && NK.tracks.TRACKS[id].pieces.some((p) => p.kind === 'loop')).forEach((id) => {
  check(id + ': loop warp keeps visible speed equal to kart speed', () => {
    const { W, R: Rc } = field(id, { cpus: 0, laps: 9 });
    const lp = W.pieces.loops[0], r = Rc.racers[0];
    Object.assign(r, { progress: lp.s0 - 30, s: U.mod(lp.s0 - 30, W.L), x: 0, targetLane: 2, v: Rc.classDef.speed });
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    let maxRatio = 0, minRatio = Infinity, inside = 0, maxStep = 0;
    for (let i = 0; i < 300; i++) {
      W.pointAt(r.progress, r.x, a);
      Rc.update(1 / 60);
      W.pointAt(r.progress, r.x, b);
      const step = a.distanceTo(b), want = r.v / 60;
      maxStep = Math.max(maxStep, step);
      if (W.inLoop(r.progress) && r.v > 5) { inside++; maxRatio = Math.max(maxRatio, step / want); minRatio = Math.min(minRatio, step / want); }
    }
    assert(inside > 60, 'kart spent ' + inside + ' frames in the loop');
    assert(minRatio > 0.8 && maxRatio < 1.25, 'visible/real speed ratio ' + minRatio.toFixed(2) + '..' + maxRatio.toFixed(2));
    assert(maxStep < (Rc.classDef.speed * 1.6) / 60 + 0.05, 'no visual jump (max ' + maxStep.toFixed(2) + ' m per frame)');
  });
  check(id + ': loop lookups agree (shiftS round trip, arc gaps, continuous poses)', () => {
    const { W } = field(id, { cpus: 0 });
    const lp = W.pieces.loops[0];
    for (let p = lp.s0 - 40; p < lp.s0 + lp.len + 40; p += 3.7) {
      [-12.5, 25, 9, -9].forEach((m) => {
        const q = W.shiftS(p, m);
        assert(Math.abs(W.shiftS(q, -m) - p) < 0.05, 'shiftS round trip at ' + p.toFixed(1));
        assert(Math.abs(W.arcGap(p, q) - m) < 0.6 || !W.inLoop(p) || !W.inLoop(q), 'arcGap matches shiftS inside a loop');
      });
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let p = lp.s0 - 5; p < lp.s0 + lp.len + 5; p += 0.05) {
      W.pointAt(p, 7.2, a); W.pointAt(p + 0.05, 7.2, b);
      // A step can straddle the entry/circle knot: allow for the slower warp of the two.
      assert(a.distanceTo(b) < 0.05 / Math.min(1, W.warpAt(p), W.warpAt(p + 0.05)) * 1.6 + 0.05, 'pointAt is continuous at ' + p.toFixed(2));
      const pose = W.loopPose(p, 0);
      if (pose) assert(Math.abs(pose.quat.length() - 1) < 1e-6 && Math.abs(pose.up.length() - 1) < 1e-6, 'pose is orthonormal');
    }
  });
  check(id + ': two karts side by side round a loop push apart, not ten metres apart', () => {
    const { W, R: Rc } = field(id, { cpus: 1 });
    const lp = W.pieces.loops[0], [a, b] = Rc.racers;
    const p = lp.s0 + lp.len * 0.25, q = W.shiftS(p, 10);
    Object.assign(a, { progress: p, s: U.mod(p, W.L), x: 0, v: 20, targetLane: 2 });
    Object.assign(b, { progress: q, s: U.mod(q, W.L), x: 0.4, v: 20, targetLane: 2 });
    let bumps = 0; Rc.on('bump', (x, y) => { if (x && y) bumps++; });
    Rc.update(1 / 60);
    assert.equal(bumps, 0, 'karts 10 m apart on the loop did not collide');
  });
});

/* 2b. Coin trails hop lanes: collecting a whole trail takes steering, with
       room between runs to change lane (C.COIN_HOP) at every class speed. */
check('every coin trail hops lanes with room to steer between runs', () => {
  ids.forEach((id) => {
    const W = NK.world.build(new THREE.Scene(), id, { mode: 'open', quality: { shadows: false } });
    const L = W.L;
    W.track.features.coins.forEach((line, i) => {
      const s0 = line.from * L, len = U.mod(line.to * L - s0, L);
      const mine = W.features.coins.filter((c) => U.mod(c.s - s0, L) <= len + 0.01)
        .sort((a, b) => U.mod(a.s - s0, L) - U.mod(b.s - s0, L));
      const path = Array.isArray(line.lane) ? line.lane : [line.lane];
      assert(path.length >= 2, id + ' coins[' + i + '] is a single-lane line');
      assert.equal(mine.length, path.length * C.COIN_RUN, id + ' coins[' + i + '] coin count');
      for (let k = 1; k < mine.length; k++) {
        if (mine[k].lane === mine[k - 1].lane) continue;
        const gap = U.mod(mine[k].s - mine[k - 1].s, L);
        assert(gap >= C.COIN_HOP - 0.01, id + ' coins[' + i + '] leaves only ' + gap.toFixed(1) + ' m to change lane');
        assert.equal(Math.abs(mine[k].lane - mine[k - 1].lane), 1);
      }
    });
  });
});

/* 3. Items: a peel dropped over a gap falls away; a rescue target is moved off the gap. */
check('a peel dropped mid-flight over a gap falls away', () => {
  const { W, R: Rc } = field('candy', { cpus: 0 });
  const g = W.pieces.gaps[0], r = Rc.racers[0];
  Object.assign(r, { progress: g.takeoff + 30, s: U.mod(g.takeoff + 30, W.L) });
  NK.items.give(Rc, r, 'peel'); NK.items.use(Rc, r);
  assert.equal(NK.items.objects(Rc).length, 1);
  NK.items.update(Rc, 1 / 60);
  assert.equal(NK.items.objects(Rc).length, 0, 'the peel is gone');
});
check('safeProgress moves a point in a gap to the road beyond it', () => {
  const { W } = field('dunes', { cpus: 0 });
  const g = W.pieces.gaps[0];
  const p = W.safeProgress(g.takeoff + 20 + W.L);
  assert(!W.inGap(p) && p > g.takeoff + 20 + W.L && p - (g.end + W.L) < 3, 'landed at ' + (p - W.L).toFixed(1) + ' (gap ends ' + g.end.toFixed(1) + ')');
});

/* 4. The chase camera keeps the player's kart on screen right round a loop. */
ids.filter((id) => NK.tracks.TRACKS[id].pieces && NK.tracks.TRACKS[id].pieces.some((p) => p.kind === 'loop')).forEach((id) => {
  check(id + ': the chase camera keeps the kart in view round the loop', () => {
    const { W, R: Rc } = field(id, { cpus: 0 });
    const lp = W.pieces.loops[0], r = Rc.racers[0];
    Object.assign(r, { progress: lp.s0 - 40, s: U.mod(lp.s0 - 40, W.L), x: 0, v: Rc.classDef.speed });
    const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.35, 1600), view = { camera: cam, world: W, racer: r };
    NK.camera.chase(view, r, 1 / 60, true);
    const kp = new THREE.Vector3();
    let frames = 0;
    while (r.progress < lp.s0 + lp.len + 10) {
      Rc.update(1 / 60); NK.camera.chase(view, r, 1 / 60, false);
      cam.updateMatrixWorld(true);
      kp.copy(r.mesh.position).project(cam);
      assert(Math.abs(kp.x) < 0.98 && Math.abs(kp.y) < 0.98 && kp.z < 1, 'kart off screen at ' + (r.progress - lp.s0).toFixed(1) + ' m (' + kp.x.toFixed(2) + ', ' + kp.y.toFixed(2) + ')');
      frames++;
    }
    assert(frames > 100);
  });
});

console.log(checks + ' set-piece checks passed.');
