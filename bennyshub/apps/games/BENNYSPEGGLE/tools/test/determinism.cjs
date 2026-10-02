// Restored trial shots must reproduce the live match, including saved powers.
const P3 = require('./load.cjs');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const dir = path.join(__dirname, '../../campaigns');
const files = process.argv[2] ? [process.argv[2].replace(/\.json$/, '') + '.json'] : fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json');
let n = 0, simT = 0;
const t0 = Date.now();
function runShot(m) {
  let steps = 0;
  let lastFever = m.fever;
  const feverTrace = [[0, lastFever]];
  while ((m.phase === 'shot' || m.phase === 'pop') && steps++ < 60 * 90) {
    m.update(1 / 60); m.events.length = 0;
    if (m.fever !== lastFever) { lastFever = m.fever; feverTrace.push([steps, lastFever]); }
  }
  assert(!['shot', 'pop'].includes(m.phase), 'shot timed out');
  return { time: steps / 60, feverTrace };
}
function state(m) {
  return { phase: m.phase, score: m.score, fever: m.fever, goal: m.goal, ballsLeft: m.ballsLeft, banked: m.banked, bestChain: m.bestChain,
    bodies: m.bodies.map(b => [b.alive, !!b.lit, b.hp]), t: m.world.t };
}
for (const file of files) {
  const camp = P3.levels.readCampaign(fs.readFileSync(path.join(dir, file), 'utf8')).campaign;
  for (const [li, lv] of camp.levels.entries()) {
    const m = new P3.Match({ level: lv, mode: camp.mode, seed: 17 + li });
    for (let s = 0; s < 6 && m.phase === 'aim'; s++) {
      const trial = new P3.Match({ level: lv, mode: camp.mode, restore: m.snapshot() });
      const angle = -60 + s * 21;
      trial.aimTo(angle); trial.fire(); const replay = runShot(trial); simT += replay.time;
      m.aimTo(angle); m.fire(); const live = runShot(m);
      assert.deepStrictEqual(state(trial), state(m), file + ' level ' + (li + 1) + ' shot ' + (s + 1));
      assert.deepStrictEqual(replay.feverTrace, live.feverTrace, file + ' level ' + (li + 1) + ' shot ' + (s + 1) + ' Fever progression');
      n++;
      m.update(1.3); m.events.length = 0;
    }
  }
}
assert(n > 0, 'no campaign shots tested');
console.log('campaigns', files.length, 'shots', n, 'mismatches 0', 'avg shot sim s', (simT / n).toFixed(2), 'ms', Date.now() - t0);
