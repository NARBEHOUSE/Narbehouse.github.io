// Head-to-head experiments: what actually decides a matchup? (tuning aid, not a test)
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const ctx = vm.createContext({ console });
for (const f of ['data', 'modes', 'ai', 'sim']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx);
const SS = ctx.SS, T = SS.DATA.TEAMS, clone = o => JSON.parse(JSON.stringify(o));
function h2h(a, b, n = 30) {
  let w = 0, d = 0, gf = 0, ga = 0;
  for (let k = 0; k < n; k++) for (const flip of [false, true]) {
    const m = SS.sim.create({ teams: flip ? [b, a] : [a, b], seed: 900 + k * 17 });
    while (!m.done) m.advance(5);
    const [x, y] = flip ? m.s.score.slice().reverse() : m.s.score;
    gf += x; ga += y; if (x > y) w++; else if (x === y) d++;
  }
  return `win ${(100 * w / (2 * n)).toFixed(0)}% draw ${(100 * d / (2 * n)).toFixed(0)}%  goals ${(gf / (2 * n)).toFixed(1)}-${(ga / (2 * n)).toFixed(1)}`;
}
const noTech = t => { const c = clone(t); c.players.forEach(p => { p.techs = []; }); return c; };
const [bea, har, , , sum] = [T[0], T[1], T[2], T[3], T[4]];
const which = process.argv[2] || 'all';
if (which === 'all') console.log('Beamers vs Summit              ', h2h(bea, sum));
if (which === 'all') console.log('Beamers vs Summit, no techs    ', h2h(noTech(bea), noTech(sum)));
const statsOnly = (t, from) => { const c = clone(t); c.players.forEach((p, i) => { p.stats = clone(from.players[i].stats); }); return c; };
if (which === 'all') console.log('Beamers w/ Summit stats vs Summit (no techs)', h2h(noTech(statsOnly(bea, sum)), noTech(sum)));
if (which === 'all') console.log('Summit vs Summit (mirror)      ', h2h(sum, sum));
if (which === 'all') console.log('Beamers vs Harbor              ', h2h(bea, har));
if (which === 'all') console.log('Beamers vs Harbor, no techs    ', h2h(noTech(bea), noTech(har)));
if (which === 'techs') {
  const without = (t, id) => { const c = clone(t); c.players.forEach(p => { p.techs = p.techs.filter(x => x !== id); }); return c; };
  for (const id of ['spinShot', 'stingShot', 'longPass', 'stingTackle', 'superSave']) console.log('Beamers minus ' + id.padEnd(12), h2h(without(bea, id), sum, 20));
  console.log('Summit minus toughShell     ', h2h(bea, without(sum, 'toughShell'), 20));
  console.log('Summit minus bruiserBash    ', h2h(bea, without(sum, 'bruiserBash'), 20));
  console.log('Summit minus drainTackle    ', h2h(bea, without(sum, 'drainTackle'), 20));
}
