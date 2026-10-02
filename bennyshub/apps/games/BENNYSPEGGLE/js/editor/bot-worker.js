/* Keep the deterministic playtest simulation off the editor's UI thread. */
'use strict';
importScripts('../util.js', '../catalog.js', '../levels.js', '../physics.js', '../match.js');
onmessage = function (event) {
  try {
    const { level, mode } = event.data, results = [], deadline = Date.now() + 45000;
    let timedOut = false;
    const skills = [{ id: 'novice', tries: 2, error: 3.5 }, { id: 'average', tries: 7, error: 1.2 }, { id: 'expert', tries: 24, error: .15 }];
    function run(m) {
      let steps = 0;
      while ((m.phase === 'shot' || m.phase === 'pop') && steps++ < 5400) { m.update(1 / 60); m.events.length = 0; if (steps % 120 === 0 && Date.now() > deadline) return false; }
      return m.phase !== 'shot' && m.phase !== 'pop';
    }
    for (const skill of skills) {
      const m = new P3.Match({ level, mode }), rng = P3.util.mulberry32(1000); let shots = 0;
      while (m.phase === 'aim' && shots < 45 && Date.now() < deadline) {
        const snap = m.snapshot(), before = { done: m.goal.done, score: m.score, ballsLeft: m.ballsLeft }, lim = m.aimMax * .96;
        let best = 0, bestV = -Infinity;
        for (let i = 0; i < skill.tries; i++) {
          if (Date.now() > deadline) break;
          const angle = skill.tries >= 12 ? -lim + 2 * lim * (i + rng() * .8) / skill.tries : (rng() * 2 - 1) * lim;
          const trial = new P3.Match({ level, mode, restore: snap }); trial.aimTo(angle); trial.fire(); if (!run(trial)) continue;
          const value = (trial.phase === 'won' ? 1e7 : 0) + (trial.goal.done - before.done) * (trial.goal.type === 'score' ? 1 : 2500) + (trial.score - before.score) * .02 + (trial.ballsLeft - before.ballsLeft + 1) * 1500 - (trial.phase === 'lost' ? 1e6 : 0);
          if (value > bestV) { bestV = value; best = angle; }
        }
        if (Date.now() > deadline) break;
        m.aimTo(best + (rng() * 2 - 1) * skill.error); m.fire(); shots++; if (!run(m)) break;
        if (m.phase === 'aim') { m.update(.5 + rng() * 3); m.events.length = 0; }
        postMessage({ progress: 'Testing ' + skill.id + ' play · shot ' + shots + ' · ' + Math.round(m.goal.done / Math.max(1, m.goal.total) * 100) + '% of goal' });
      }
      results.push({ skill: skill.id, won: m.phase === 'won', shots, score: m.score, progress: Math.min(1, m.goal.done / Math.max(1, m.goal.total)), refills: m.refills });
      if (Date.now() > deadline) { timedOut = true; break; }
    }
    const ex = results.find(r => r.skill === 'expert' && r.won), av = results.find(r => r.skill === 'average' && r.won);
    let stars = null;
    if (ex) { const three = Math.max(1000, Math.round(ex.score * .9 / 500) * 500); const two = Math.max(500, Math.min(three - 500, Math.round((av ? Math.min(av.score * .95, three * .75) : three * .6) / 500) * 500)); stars = [two, three]; }
    postMessage({ results, stars, timedOut });
  } catch (error) { postMessage({ error: 'Could not estimate this board: ' + error.message }); }
};
