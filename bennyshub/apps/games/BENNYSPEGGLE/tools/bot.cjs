/**
 * Benny's P3GL — a playtesting bot.
 *
 * Plays a level with the real rules (P3.Match), choosing each shot by trying
 * candidate angles on a copy of the board. The simulation is deterministic,
 * so a trial shot plays out exactly as the real one would.
 *
 * Skills:
 *   expert   tries many angles, aims precisely      (a strong player who reads the board)
 *   average  tries a handful, small aim error       (a typical player)
 *   novice   tries two, larger aim error            (someone still learning)
 *
 *   playLevel(level, mode, { skill, seed, maxShots }) → { won, shots, score, ballsLeft, done, total, refills }
 *   measure(level, mode, { runs }) → per-skill summary, suggested stars
 */
const P3 = require('./test/load.cjs');

const SKILLS = {
  expert: { tries: 30, error: 0.15 },
  average: { tries: 7, error: 1.2 },
  novice: { tries: 2, error: 3.5 }
};

function runShot(m, maxSteps) {
  let steps = 0;
  while ((m.phase === 'shot' || m.phase === 'pop') && steps++ < (maxSteps || 60 * 90)) { m.update(1 / 60); m.events.length = 0; }
  if (m.phase === 'shot' || m.phase === 'pop') return false;
  return true;
}

function value(before, m) {
  const g = m.goal;
  let v = 0;
  if (m.phase === 'won') v += 1e7;
  v += (g.done - before.done) * (g.type === 'score' ? 1 : 2500);
  v += (m.score - before.score) * 0.02;
  v += (m.ballsLeft - (before.ballsLeft - 1)) * 1500;    // caught or earned balls
  if (m.phase === 'lost') v -= 1e6;
  return v;
}

function playLevel(level, mode, o) {
  o = o || {};
  const skill = SKILLS[o.skill || 'average'];
  const R = P3.util.mulberry32((o.seed || 1) >>> 0);
  const m = new P3.Match({ level, mode });
  let shots = 0;
  const maxShots = o.maxShots || 60;
  while (m.phase === 'aim' && shots < maxShots) {
    const snap = m.snapshot();
    const before = { done: m.goal.done, score: m.score, ballsLeft: m.ballsLeft };
    const lim = m.aimMax * 0.96;
    let best = 0, bestV = -Infinity;
    for (let k = 0; k < skill.tries; k++) {
      const a = skill.tries >= 12 ? -lim + (2 * lim) * (k + R() * 0.8) / skill.tries : (R() * 2 - 1) * lim;
      const trial = new P3.Match({ level, mode, restore: snap });
      trial.aimTo(a); trial.fire();
      if (!runShot(trial)) continue;
      const v = value(before, trial);
      if (v > bestV) { bestV = v; best = a; }
    }
    m.aimTo(best + (R() * 2 - 1) * skill.error);
    m.fire(); shots++;
    if (!runShot(m)) break;
    // Board time passes while a real player aims.
    if (m.phase === 'aim') { m.update(0.5 + R() * 3); m.events.length = 0; }
  }
  return { won: m.phase === 'won', shots, score: m.score, ballsLeft: m.ballsLeft, done: m.goal.done, total: m.goal.total, refills: m.refills, stars: m.starCount() };
}

function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

function measure(level, mode, o) {
  o = o || {};
  const runs = o.runs || 3;
  const out = {};
  for (const skill of o.skills || ['expert', 'average', 'novice']) {
    const res = [];
    for (let i = 0; i < runs; i++) res.push(playLevel(level, mode, { skill, seed: 1000 + i * 77 }));
    const wins = res.filter(r => r.won);
    out[skill] = {
      winRate: wins.length / runs,
      shots: median(res.map(r => r.shots)),
      score: median(wins.map(r => r.score)),
      ballsLeft: median(wins.map(r => r.ballsLeft)),
      progress: median(res.map(r => r.total ? r.done / r.total : 1)),
      refills: median(res.map(r => r.refills))
    };
  }
  // Stars: two for a typical win, three for an expert-level score.
  const ex = out.expert, av = out.average;
  if (ex && ex.score) {
    const three = Math.round(ex.score * 0.9 / 500) * 500;
    let two = av && av.score ? Math.round(Math.min(av.score * 0.95, three * 0.75) / 500) * 500 : Math.round(three * 0.6 / 500) * 500;
    two = Math.max(500, Math.min(two, three - 500));
    out.stars = [two, Math.max(two + 500, three)];
  }
  return out;
}

module.exports = { playLevel, measure, SKILLS };
