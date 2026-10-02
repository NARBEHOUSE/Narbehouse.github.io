// Every mechanic on a tiny purpose-built board. node tools/test/rules.cjs
const P3 = require('./load.cjs');
const L = P3.levels;

let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || info === undefined ? '' : '  ' + JSON.stringify(info)));
}

function lv(items, extra) { return L.normLevel(Object.assign({ goal: { type: 'clear' }, balls: 10, items }, extra || {}), (extra && extra.mode) || 'vivid', 0); }
function match(items, extra) { return new P3.Match({ level: lv(items, extra), mode: (extra && extra.mode) || 'vivid', seed: 7 }); }
/** Fire straight down (or at an angle) and run the whole shot, collecting events. */
function shoot(m, angle, maxSec) {
  m.aimTo(angle || 0);
  m.fire();
  const evs = [];
  let t = 0;
  while ((m.phase === 'shot' || m.phase === 'pop') && t < (maxSec || 40)) { m.update(1 / 60); t += 1 / 60; evs.push(...m.drain()); }
  return evs;
}
const has = (evs, type, f) => evs.some(e => e.type === type && (!f || f(e)));
const below = (y, extra) => Object.assign({ x: 500, y }, extra || {});

// A peg straight below the launcher gets hit by a straight-down shot.
{
  const m = match([Object.assign({ t: 'peg', c: 'blue' }, below(300)), { t: 'peg', c: 'blue', x: 40, y: 975 }, { t: 'peg', c: 'blue', x: 960, y: 975 }]);
  const evs = shoot(m);
  check('a hit peg lights, then pops when the shot ends', has(evs, 'light') && has(evs, 'pop') && !m.bodies[0].alive);
  check('score is awarded for a hit', m.score >= 100, m.score);
  check('the shot costs one ball', m.ballsLeft === 9, m.ballsLeft);
}
{
  const m = match([Object.assign({ t: 'multiball' }, below(300)), { t: 'peg', x: 100, y: 900 }]);
  let maxBalls = 0;
  m.aimTo(0); m.fire();
  for (let i = 0; i < 600 && m.phase === 'shot'; i++) { m.update(1 / 60); maxBalls = Math.max(maxBalls, m.world.balls.length); m.drain(); }
  check('Multiball adds two balls', maxBalls >= 3, maxBalls);
}
{
  const m = match([Object.assign({ t: 'extra' }, below(300)), { t: 'peg', x: 100, y: 900 }]);
  shoot(m);
  check('Extra ball gives a ball back', m.ballsLeft >= 10, m.ballsLeft);
}
{
  const m = match([Object.assign({ t: 'multiplier' }, below(300)), Object.assign({ t: 'peg' }, below(520)), { t: 'peg', x: 100, y: 900 }], { goal: { type: 'score', score: 5000000 } });
  m.banked.fire = 1;
  const evs = shoot(m);
  check('Double points doubles later hits', has(evs, 'power', e => e.id === 'multiplier') && has(evs, 'light', e => e.body === m.bodies[1] && e.points === 220));
}
{
  const ring = [];
  for (let i = 0; i < 8; i++) ring.push({ t: 'peg', x: 500 + Math.cos(i / 8 * 6.28) * 90, y: 600 + Math.sin(i / 8 * 6.28) * 90 });
  const m = match([Object.assign({ t: 'zap' }, below(300))].concat(ring));
  const evs = shoot(m);
  const zap = evs.find(e => e.type === 'zap');
  check('Lightning lights the six nearest pegs', zap && zap.targets.length === 6, zap && zap.targets.length);
}
for (const id of ['spray', 'net', 'blast', 'fire', 'guide']) {
  const m = match([Object.assign({ t: id }, below(300)), { t: 'peg', x: 100, y: 900 }]);
  shoot(m);
  check(id + ' is saved for the next shot', m.banked[id] === 1, m.banked);
}
{
  const m = match([{ t: 'peg', x: 100, y: 900 }]);
  m.banked.spray = 1;
  m.aimTo(0); m.fire();
  check('Spray fires three balls', m.world.balls.length === 3, m.world.balls.length);
  check('a saved power is used up when it fires', !m.banked.spray);
}
{
  const m = match([{ t: 'peg', x: 100, y: 900 }], { plate: { w: 100, x: 100, speed: 0, mode: 'bounce' } });
  m.banked.net = 1;
  const evs = shoot(m, 0, 20);
  check('Safety net bounces the ball off the bottom', has(evs, 'net'));
}
{
  const pegs = [];
  for (let i = 0; i < 6; i++) pegs.push({ t: 'peg', x: 440 + i * 24, y: 420 + (i % 2) * 36 });
  const m = match([Object.assign({ t: 'peg' }, below(300))].concat(pegs));
  m.banked.blast = 1;
  const evs = shoot(m);
  check('Blast ball explodes on its first hit and lights pegs around it', has(evs, 'blast') && evs.filter(e => e.type === 'litBy' && e.cause === 'blast').length >= 3, evs.filter(e => e.type === 'litBy').length);
}
{
  const col = [];
  for (let i = 0; i < 5; i++) col.push({ t: 'peg', x: 500, y: 260 + i * 60 });
  const m = match(col);
  m.banked.fire = 1;
  const evs = shoot(m);
  check('Fireball burns straight through a column of pegs', evs.filter(e => e.type === 'light').length === 5, evs.filter(e => e.type === 'light').length);
}
{
  const m = match([Object.assign({ t: 'thief' }, below(300)), { t: 'peg', x: 100, y: 900 }]);
  m.banked.blast = 1; m.banked.fire = 1;
  m.aimTo(0);
  // Fire without using the saved powers: clear the active set by firing a copy of banked.
  const keep = Object.assign({}, m.banked);
  m.banked = {};
  m.fire(); m.banked = keep;
  let evs = [];
  while (m.phase === 'shot' || m.phase === 'pop') { m.update(1 / 60); evs.push(...m.drain()); }
  check('the Thief steals a saved power', Object.keys(m.banked).length === 1 && has(evs, 'hazard', e => e.id === 'thief' && e.stole), m.banked);
}
{
  const m = match([Object.assign({ t: 'shrink' }, below(300)), { t: 'peg', x: 100, y: 900 }]);
  m.aimTo(0); m.fire();
  const ball = m.world.balls[0], r0 = ball.r;
  for (let i = 0; i < 120; i++) { m.update(1 / 60); m.drain(); }
  check('the Shrinker shrinks the ball', ball.r < r0, { r0, r: ball.r });
}
{
  const m = match([Object.assign({ t: 'sludge' }, below(300)), { t: 'peg', x: 100, y: 900 }]);
  m.aimTo(0); m.fire();
  let slowed = false;
  const ball = m.world.balls[0];
  for (let i = 0; i < 120; i++) { const before = Math.hypot(ball.vx, ball.vy); m.update(1 / 60); const ev = m.drain(); if (ev.some(e => e.type === 'hazard' && e.id === 'sludge')) slowed = Math.hypot(ball.vx, ball.vy) < before * 0.5; }
  check('Sludge slows the ball right down', slowed);
}
{
  const m = match([Object.assign({ t: 'spike' }, below(300)), { t: 'peg', x: 100, y: 900 }]);
  const evs = shoot(m);
  check('a Spike pops the ball', has(evs, 'ballLost', e => e.reason === 'spike'));
}
{
  const m = match([Object.assign({ t: 'hole', r: 26 }, below(330)), { t: 'peg', x: 100, y: 900 }]);
  const evs = shoot(m);
  check('a Black hole swallows the ball', has(evs, 'ballLost', e => e.reason === 'hole'));
}
{
  const m = match([Object.assign({ t: 'brick', w: 120, h: 24, hp: 2 }, below(320)), { t: 'peg', x: 100, y: 900 }], { goal: { type: 'bricks' } });
  m.aimTo(0); m.fire();
  let cracked = false;
  for (let i = 0; i < 2400 && (m.phase === 'shot' || m.phase === 'pop'); i++) { m.update(1 / 60); const ev = m.drain(); if (!cracked && ev.some(e => e.type === 'crack')) { cracked = m.bodies[0].alive && m.bodies[0].hp === 1; } }
  check('a barrier brick loses a hit point', cracked);
  if (m.bodies[0].alive) shoot(m);
  check('and breaks when it runs out', !m.bodies[0].alive);
  check('breaking all bricks meets the Bricks goal', m.goalMet);
}
{
  const m = match([Object.assign({ t: 'armor', w: 120, h: 24, hp: 1 }, below(320)), { t: 'peg', x: 100, y: 900 }]);
  const evs = shoot(m);
  check('armour shrugs off a normal ball', m.bodies[0].alive && has(evs, 'clank', e => e.armor));
  m.banked.fire = 1;
  shoot(m);
  check('a fireball cracks armour', !m.bodies[0].alive);
}
{
  const m = match([Object.assign({ t: 'glass', w: 160, h: 18 }, below(320)), Object.assign({ t: 'peg' }, below(520)), { t: 'peg', x: 100, y: 900 }]);
  const evs = shoot(m);
  check('glass shatters and the ball flies through', !m.bodies[0].alive && evs.some(e => e.type === 'light' && e.body === m.bodies[1]));
}
{
  const m = match([Object.assign({ t: 'key', k: 'pink' }, below(300)), { t: 'gate', k: 'pink', x: 300, y: 700, w: 100, h: 20 }, { t: 'peg', x: 100, y: 900 }]);
  const evs = shoot(m);
  check('a key opens its gates', has(evs, 'gates') && !m.bodies[1].alive);
}
{
  const m = match([{ t: 'portal', p: 0, x: 500, y: 320 }, { t: 'portal', p: 0, x: 200, y: 500 }, { t: 'peg', x: 200, y: 640 }, { t: 'peg', x: 900, y: 900 }]);
  const evs = shoot(m);
  check('a portal sends the ball to its partner', has(evs, 'portal') && evs.some(e => e.type === 'light' && e.body === m.bodies[2]));
}
{
  const m = match([{ t: 'peg', x: 100, y: 900 }], { plate: { w: 300, x: 500, speed: 0, mode: 'catch' } });
  const evs = shoot(m);
  check('a Catch plate gives the ball back', has(evs, 'catch') && m.ballsLeft === 10, m.ballsLeft);
}
{
  const m = match([{ t: 'peg', x: 100, y: 900 }], { plate: { w: 300, x: 500, speed: 0, mode: 'bounce' } });
  m.aimTo(0); m.fire();
  let bounced = false;
  for (let i = 0; i < 300 && m.phase === 'shot'; i++) { m.update(1 / 60); if (m.drain().some(e => e.type === 'plate')) bounced = true; }
  check('a Bounce plate sends the ball back up', bounced);
}
{
  const m = match([{ t: 'peg', x: 100, y: 900 }], { plate: { w: 300, x: 500, speed: 0, mode: 'timed', period: 2 } });
  const states = new Set();
  for (let i = 0; i < 300; i++) { m.update(1 / 60); states.add(m.world.plate.state); }
  check('a Timed plate switches between catch and bounce', states.has('catch') && states.has('bounce'));
}
{
  const m = match([Object.assign({ t: 'peg', c: 'orange' }, below(300)), { t: 'peg', c: 'blue', x: 100, y: 900 }], { goal: { type: 'color', color: 'orange' } });
  const evs = shoot(m);
  check('the Colour goal is met by breaking every goal-colour peg', m.goalMet && m.phase === 'won' && has(evs, 'won'));
}
{
  const m = match([Object.assign({ t: 'lantern' }, below(300)), { t: 'peg', x: 100, y: 900 }], { goal: { type: 'lanterns' } });
  shoot(m);
  check('lanterns stay on the board once lit, and meet the Lanterns goal', m.bodies[0].alive && m.bodies[0].lit && m.goalMet);
}
{
  const m = match([Object.assign({ t: 'gem' }, below(300)), { t: 'peg', x: 100, y: 900 }], { goal: { type: 'gems' } });
  shoot(m);
  check('the Gems goal', m.goalMet);
}
{
  const m = match([Object.assign({ t: 'peg' }, below(300)), { t: 'peg', x: 100, y: 900 }], { goal: { type: 'score', score: 1000 }, balls: 2 });
  m.score = 950;
  shoot(m);
  check('the Score goal', m.goalMet);
}
{
  const m = match([Object.assign({ t: 'peg' }, below(300)), { t: 'peg', x: 100, y: 900 }], { goal: { type: 'count', count: 1 } });
  shoot(m);
  check('the Count goal', m.goalMet);
}
{
  const col = [];
  for (let i = 0; i < 5; i++) col.push({ t: 'peg', x: 500, y: 260 + i * 60 });
  const m = match(col, { goal: { type: 'chain', chain: 4 } });
  m.banked.fire = 1;
  shoot(m);
  check('the Chain goal', m.goalMet);
}
{
  const m = match([{ t: 'peg', c: 'orange', x: 60, y: 900 }, { t: 'peg', x: 900, y: 900 }], { goal: { type: 'color', color: 'orange' }, balls: 1, mode: 'vivid' });
  const evs = shoot(m);
  check('Vivid: running out of balls loses the level', m.phase === 'lost' && has(evs, 'lost'));
}
{
  const m = match([{ t: 'peg', c: 'orange', x: 60, y: 900 }, { t: 'peg', x: 900, y: 900 }], { goal: { type: 'color', color: 'orange' }, balls: 1, mode: 'cozy', plate: { w: 100, x: 100, speed: 0, mode: 'bounce' } });
  const evs = shoot(m);
  check('Cozy: running out of balls refills instead', m.phase === 'aim' && has(evs, 'refill') && m.ballsLeft === P3.catalog.MODES.cozy.refill, m.ballsLeft);
}
{
  const m = match([Object.assign({ t: 'peg', c: 'orange' }, below(300)), { t: 'peg', c: 'blue', x: 100, y: 900 }, { t: 'brick', x: 700, y: 600, hp: 3 }], { goal: { type: 'color', color: 'orange' } });
  m.update(2.2);
  m.aimTo(23);
  m.banked.fire = 2;
  const snap = m.snapshot();
  const m2 = new P3.Match({ level: m.level, mode: 'vivid', seed: 7, restore: snap });
  check('save and restore between shots', m2.world.t === m.world.t && m2.banked.fire === 2 && m2.angle === 23 && m2.ballsLeft === m.ballsLeft);
}
{
  // Bonus slots: meeting the goal mid-shot turns the bottom into slots.
  const m = match([Object.assign({ t: 'peg', c: 'orange' }, below(300)), { t: 'peg', c: 'blue', x: 100, y: 900 }], { goal: { type: 'color', color: 'orange' } });
  const evs = shoot(m);
  check('the finale pays a bonus slot', has(evs, 'goalMet') && has(evs, 'slot'));
  check('balls left are paid as a bonus', has(evs, 'won', e => e.ballBonus > 0));
}
{
  const camp = L.readCampaign(require('../../levels/Bennys_Campaign.json'));
  check('the original v1 campaign still opens', camp.campaign.levels.length === 20 && camp.campaign.levels.every(l => l.items.length > 10));
}

{
  const m = match([{ t: 'glass', x: 500, y: 300 }, { t: 'glass', x: 500, y: 420 }], { goal: { type: 'chain', chain: 2 } });
  shoot(m);
  check('breaking bricks counts toward a chain goal', m.bestChain === 2 && m.phase === 'won');
}
{
  const m = match([{ t: 'peg', x: 500, y: 300 }, { t: 'peg', x: 100, y: 900 }], { mode: 'cozy', goal: { type: 'chain', chain: 2 }, plate: { w: 100, x: 100, speed: 0, mode: 'catch' } });
  m.banked.guide = 2;
  const evs = shoot(m);
  check('an exhausted chain board resets for another try', m.phase === 'aim' && has(evs, 'boardReset') && m.bodies.every(b => b.alive && !b.lit));
  check('a chain reset preserves score, balls and saved powers', m.score > 0 && m.ballsLeft === 9 + evs.filter(e => e.type === 'catch').length && m.banked.guide === 1 && m.bestChain === 1);
  const copy = new P3.Match({ level: m.level, mode: m.modeId, restore: m.snapshot() });
  check('a reset chain board resumes correctly', JSON.stringify(copy.snapshot()) === JSON.stringify(m.snapshot()));
}
{
  const m = match([{ t: 'peg', x: 100, y: 900 }], { plate: { w: 300, x: 500, speed: 0, mode: 'bounce' } });
  const evs = shoot(m, 0, 65);
  check('an endless plate bounce returns the ball and finishes', m.phase === 'aim' && m.ballsLeft === 10 && has(evs, 'ballReturned'));
}
{
  const m = match([{ t: 'peg', x: 100, y: 900 }]);
  const snap = m.snapshot(), bad = JSON.parse(JSON.stringify(snap));
  bad.bodies[0] = null;
  check('malformed saves are rejected without modifying the board', !m.restore(bad) && JSON.stringify(m.snapshot()) === JSON.stringify(snap));
  const empty = Object.assign({}, snap, { ballsLeft: 0 });
  check('an invalid empty-ball save cannot strand the aiming screen', !m.restore(empty));
  const copy = new P3.Match({ level: m.level, mode: m.modeId, restore: snap });
  check('a saved match keeps its original custom seed', copy.seed === m.seed);
  m.rng(); m.rng();
  m.fire(); copy.fire();
  check('restored shots keep deterministic rules randomness', m.rng() === copy.rng());
}

// Shot Fever: drive real collision/effect handlers in a controlled order so
// threshold scores, duplicate contacts and cross-ball chains are unambiguous.
const feverPegs = n => Array.from({ length: n }, (_, i) => ({ t: 'peg', c: 'blue', x: 150 + i % 8 * 90, y: 260 + Math.floor(i / 8) * 90 }));
function contactBody(m, i, ball) {
  const body = m.bodies[i];
  return m.contact(ball || m.world.balls[0], body, { px: body.x, py: body.y });
}
function finishFeverShot(m) {
  m.world.balls.length = 0;
  m.update(1 / 60);
  for (let i = 0; i < 600 && m.phase === 'pop'; i++) m.update(1 / 60);
}
{
  const m = match(feverPegs(18), { goal: { type: 'score', score: 5000000 } });
  m.fire(); m.drain();
  const expected = [100, 110, 120, 130, 280, 300, 320, 340, 360, 570, 600, 630, 660, 690, 1200, 1250];
  const points = [], feverEvents = [];
  for (let i = 0; i < expected.length; i++) {
    contactBody(m, i);
    const evs = m.drain();
    points.push(evs.find(e => e.type === 'light').points);
    feverEvents.push(...evs.filter(e => e.type === 'fever').map(e => [i + 1, e.mult]));
    if (i === 3) {
      const score = m.score;
      for (let j = 0; j < 20; j++) contactBody(m, j % 4);
      check('repeated contacts on lit pegs do not build Fever or score again', m.chain === 4 && m.fever === 1 && m.score === score);
      check('repeat contacts do not announce a Fever increase', !has(m.drain(), 'fever'));
    }
  }
  check('Fever scores use the new multiplier on hits 5, 10 and 15', JSON.stringify(points) === JSON.stringify(expected), points);
  check('Fever advances exactly once at each shot threshold', JSON.stringify(feverEvents) === JSON.stringify([[5, 2], [10, 3], [15, 5]]), feverEvents);
  check('a long shot reaches Fever five without any goal-progress threshold', m.fever === 5 && m.goal.done < m.goal.total * 0.01);
  m.world.balls.length = 0;
  m.update(1 / 60);
  check('Fever remains visible while that shot clears its lit pieces', m.phase === 'pop' && m.fever === 5);
  let readyFever;
  const push = m.push.bind(m);
  m.push = event => { if (event.type === 'ready') readyFever = m.fever; push(event); };
  for (let i = 0; i < 600 && m.phase === 'pop'; i++) m.update(1 / 60);
  check('Fever resets before the next aiming-ready event', m.phase === 'aim' && m.fever === 1 && readyFever === 1, { phase: m.phase, fever: m.fever, readyFever });
  const restored = new P3.Match({ level: m.level, mode: m.modeId, restore: m.snapshot() });
  check('a restored shot starts at Fever one despite its saved best chain', restored.fever === 1 && restored.chain === 0 && restored.bestChain === 16);
  m.fire(); m.drain();
  contactBody(m, 16);
  const first = m.drain().find(e => e.type === 'light');
  check('the next shot starts a new chain and awards an unmultiplied first hit', m.chain === 1 && m.fever === 1 && first.points === 100, first && first.points);
}
{
  const items = feverPegs(4).concat([{ t: 'brick', x: 650, y: 500, hp: 2 }, { t: 'glass', x: 750, y: 600 }]);
  const m = match(items, { goal: { type: 'score', score: 5000000 } });
  m.fire();
  for (let i = 0; i < 4; i++) contactBody(m, i);
  contactBody(m, 4);
  check('damaging an unbroken brick does not count as another Fever hit', m.chain === 4 && m.fever === 1 && m.bodies[4].hp === 1);
  m.drain(); contactBody(m, 4);
  const brick = m.drain().find(e => e.type === 'brickBreak');
  check('a broken brick joins peg hits and receives the threshold multiplier', m.chain === 5 && m.fever === 2 && brick.points === 680, brick && brick.points);
  contactBody(m, 5);
  const glass = m.drain().find(e => e.type === 'brickBreak');
  check('broken glass continues the same Fever chain', m.chain === 6 && m.fever === 2 && glass.points === 400, glass && glass.points);
  m.damageBrick(m.bodies[4], 1, true, null);
  m.breakBrick(m.bodies[5], null);
  check('already broken bricks cannot increase Fever again', m.chain === 6 && m.fever === 2);
}
{
  const items = [{ t: 'zap', x: 500, y: 350 }, { t: 'multiball', x: 500, y: 420 }].concat(feverPegs(14));
  const m = match(items, { goal: { type: 'score', score: 5000000 } });
  m.fire(); m.drain();
  m.blastAt(500, 500, 1000);
  const evs = m.drain();
  const lit = evs.filter(e => e.type === 'light');
  check('a blast and nested Lightning cascade share one unique-hit Fever chain', m.chain === 16 && m.fever === 5 && lit.length === 16 && new Set(lit.map(e => e.body)).size === 16);
  check('power cascades announce each crossed Fever threshold once', JSON.stringify(evs.filter(e => e.type === 'fever').map(e => e.mult)) === '[2,3,5]');
  check('a Multiball power in the cascade adds balls without resetting Fever', m.world.balls.length === 3 && m.chain === 16 && m.fever === 5);
  m.blastAt(500, 500, 1000);
  check('a repeated blast cannot build Fever from already lit pieces', m.chain === 16 && !has(m.drain(), 'fever'));
}
for (const power of ['spray', 'multiball']) {
  const items = feverPegs(7);
  if (power === 'multiball') items[0].t = 'multiball';
  const m = match(items, { goal: { type: 'score', score: 5000000 } });
  if (power === 'spray') m.banked.spray = 1;
  m.fire();
  contactBody(m, 0);
  for (let i = 1; i < 4; i++) contactBody(m, i, m.world.balls[i % 3]);
  contactBody(m, 0, m.world.balls[1]);
  check(power + ': another ball touching a lit peg does not advance Fever', m.world.balls.length === 3 && m.chain === 4 && m.fever === 1);
  m.drain(); contactBody(m, 4, m.world.balls[2]);
  const threshold = m.drain().find(e => e.type === 'light');
  check(power + ': hits from all three balls contribute to one Fever chain', m.chain === 5 && m.fever === 2 && threshold.points === 280, threshold && threshold.points);
}
{
  const items = feverPegs(20).map(item => Object.assign(item, { c: 'orange' }));
  const m = match(items, { goal: { type: 'color', color: 'orange' } });
  m.fire();
  for (let i = 0; i < 18; i++) m.lightIndirect(m.bodies[i], 'test');
  finishFeverShot(m);
  const copy = new P3.Match({ level: m.level, mode: m.modeId, restore: m.snapshot() });
  check('ninety-percent goal completion does not restore level-wide Fever', copy.phase === 'aim' && copy.goal.done === 18 && copy.goal.total === 20 && copy.fever === 1);
  copy.fire(); copy.drain(); contactBody(copy, 18);
  const scored = copy.drain();
  check('advancing a nearly completed goal still uses the new shot Fever', copy.goal.done === 19 && copy.chain === 1 && copy.fever === 1 && scored.find(e => e.type === 'light').points === 300 && !has(scored, 'fever'));
}
for (const type of ['clear', 'gems', 'lanterns', 'bricks', 'color', 'count', 'chain']) {
  check('an empty ' + type + ' goal reports a problem', L.levelProblems(lv([], { goal: { type } })).length > 0);
}
{
  check('an unknown inherited item type is discarded', L.normItem({ t: 'constructor' }) === null);
  const old = L.readCampaign({ levels: [[{ x: 410, y: 300 }, { x: 410, y: 300 }]] }).campaign.levels[0].items;
  check('coincident legacy pegs are separated on import', Math.hypot(old[0].x - old[1].x, old[0].y - old[1].y) > old[0].r + old[1].r);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
