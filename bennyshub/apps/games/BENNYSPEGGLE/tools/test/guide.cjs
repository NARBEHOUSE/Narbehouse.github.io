// The aim guide must trace the real shot: compare predicted points with the live ball.
const P3 = require('./load.cjs');
const L = P3.levels;
const assert = require('assert');
const { campaign } = L.readCampaign(require('../../levels/Bennys_Campaign.json'));
let worst = 0, checked = 0;
for (let li = 0; li < 20; li += 3) {
  for (const mode of ['cozy', 'vivid', 'hyper']) {
    const lv = JSON.parse(JSON.stringify(campaign.levels[li]));
    // Make some pegs move so the check covers moving bodies too.
    lv.items.forEach((it, i) => { if (i % 4 === 0) it.m = { type: 'orbit', r: 30, speed: 80, phase: (i % 7) / 7 }; if (i % 9 === 0) it.m = { type: 'rotate', cx: 500, cy: 560, speed: 25 }; });
    for (let k = 0; k < 6; k++) {
      const m = new P3.Match({ level: L.normLevel(lv, mode, li), mode });
      m.update(0.37 * k);                 // let the board move first
      m.aimTo(-60 + k * 23);
      m.world._acc = 0;
      const before = JSON.stringify(m.snapshot());
      const g = m.predictGuide(1.2, 99, { everyStep: true });
      assert.strictEqual(JSON.stringify(m.snapshot()), before, 'prediction changed the live board');
      m.fire();
      const ball = m.world.balls[0];
      const live = [{ x: ball.x, y: ball.y }];
      let tt = 0;
      while (tt < 1.2 && m.world.balls.length && ball.alive) { m.world.step(P3.physics.STEP, m); live.push({ x: ball.x, y: ball.y }); tt += P3.physics.STEP; }
      const n = Math.min(live.length, g.points.length);
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(live[i].x - g.points[i].x, live[i].y - g.points[i].y);
        worst = Math.max(worst, d); checked++;
        if (d > 1.5) { console.log('diverged', mode, 'level', li, 'shot', k, 'at sample', i, 'by', d.toFixed(2)); break; }
      }
    }
  }
}
// Powers and hazards alter a path, and must be simulated by the guide too.
const scenarios = [
  { name: 'moving black hole', items: [{ t: 'hole', x: 560, y: 450, m: { type: 'slide', dx: 50, dy: 20, period: 2, phase: 0 } }] },
  { name: 'shrinker', items: [{ t: 'shrink', x: 500, y: 300 }, { t: 'peg', x: 518, y: 500 }] },
  { name: 'sludge', items: [{ t: 'sludge', x: 500, y: 300 }] },
  { name: 'fire through bricks', items: [{ t: 'armor', x: 500, y: 300, hp: 1 }, { t: 'brick', x: 500, y: 420, hp: 1 }], banked: { fire: 1 } },
  { name: 'blast opens gate', items: [{ t: 'peg', x: 500, y: 300 }, { t: 'key', x: 540, y: 400 }, { t: 'gate', k: 'blue', x: 500, y: 450 }], banked: { blast: 1, fire: 1 } },
  { name: 'multi-hit brick', items: [{ t: 'brick', x: 500, y: 300, w: 180, hp: 2 }] },
  { name: 'safety net', items: [], banked: { net: 1 } },
  { name: 'moving portal', items: [{ t: 'portal', x: 500, y: 300, p: 0 }, { t: 'portal', x: 300, y: 500, p: 0, m: { type: 'orbit', r: 30, speed: 80, phase: 0 } }] },
  { name: 'spray and multiball', items: [{ t: 'multiball', x: 500, y: 300 }], banked: { spray: 1, fire: 1 } },
  { name: 'goal finale removes plate', items: [{ t: 'peg', x: 500, y: 300 }], goal: { type: 'clear' }, banked: { fire: 1 } }
];
for (const scenario of scenarios) {
  const lv = L.normLevel({ items: scenario.items, goal: scenario.goal || { type: 'score', score: 5000000 }, plate: { w: 100, x: 100, speed: 0, mode: 'catch' } }, 'hyper', 0);
  const m = new P3.Match({ level: lv, mode: 'hyper', seed: 311 });
  Object.assign(m.banked, scenario.banked);
  const before = JSON.stringify(m.snapshot());
  const guide = m.predictGuide(3, 99, { everyStep: true });
  assert.strictEqual(JSON.stringify(m.snapshot()), before, scenario.name + ' mutated live state');
  m.fire();
  const ball = m.world.balls[0];
  const live = [{ x: ball.x, y: ball.y }];
  for (let i = 0; i < Math.ceil(3 / P3.physics.STEP) && ball.alive; i++) {
    m.world.step(P3.physics.STEP, m); live.push({ x: ball.x, y: ball.y });
  }
  assert.deepStrictEqual(guide.points, live, scenario.name);
  checked += live.length;
}
assert(worst <= 1e-9, 'guide diverged by ' + worst);
console.log('samples', checked, 'worst', worst.toFixed(3), 'power/hazard scenarios', scenarios.length);
