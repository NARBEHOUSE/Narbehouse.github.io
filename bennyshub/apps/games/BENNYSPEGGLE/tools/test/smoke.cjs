const P3 = require('./load.cjs');
const L = P3.levels;
const raw = require('../../levels/Bennys_Campaign.json');
const { campaign, notes } = L.readCampaign(raw);
console.log('migrated', campaign.title, campaign.levels.length, 'levels; notes:', notes.length);
let t0 = Date.now(), shots = 0, wins = 0, simTime = 0;
const random = P3.util.mulberry32(731);
for (let li = 0; li < campaign.levels.length; li++) {
  const lv = campaign.levels[li];
  const m = new P3.Match({ level: lv, mode: 'vivid' });
  let guard = 0;
  while (m.phase !== 'won' && m.phase !== 'lost' && guard++ < 200) {
    m.aimTo((random() * 2 - 1) * 70);
    const g = m.guide('long');
    if (!g.points.length) throw new Error('no guide');
    m.fire(); shots++;
    let steps = 0;
    while (m.phase !== 'aim' && m.phase !== 'won' && m.phase !== 'lost' && steps++ < 60 * 120) { m.update(1 / 60); simTime += 1/60; m.drain(); }
    if (steps >= 60 * 120) throw new Error('Shot timed out on level ' + (li + 1));
  }
  if (m.phase !== 'won' && m.phase !== 'lost') throw new Error('Level did not finish: ' + (li + 1));
  if (m.phase === 'won') wins++;
  console.log('L' + (li + 1), m.phase, 'score', m.score, 'goal', m.goal.done + '/' + m.goal.total, 'balls', m.ballsLeft);
}
console.log('shots', shots, 'wins', wins, 'ms', Date.now() - t0, 'sim s', simTime.toFixed(0));
