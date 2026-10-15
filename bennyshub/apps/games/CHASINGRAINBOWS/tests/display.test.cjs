'use strict';
/* Chasing Rainbows - the table's event-by-event mirror always lands on the engine's real state.
   Node only: node tests/display.test.cjs */
const test = require('node:test'), assert = require('node:assert/strict');
const E = require('../js/engine.js'), A = require('../js/ai.js'), D = require('../js/display.js');

test('Replaying each move\'s events on the display mirror reaches the engine state, every move', () => {
  let moves = 0;
  for (const mode of ['classic', 'classicLite', 'raceFull', 'race']) for (const n of [2, 3, 4, 6]) for (let seed = 1; seed <= 40; seed++) {
    const players = Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'cpu', skill: ['easy', 'normal', 'hard'][(i + seed) % 3] }));
    const created = E.createGame({ players, mode }, seed);
    const s = created.state;
    for (let k = 0; k < 500 && s.phase !== 'over'; k++) {
      const before = D.fromState(s);
      const d = E.getDecision(s);
      const ev = E.applyMove(s, A.choose(E.viewFor(s, d.p), d, s.players[d.p].skill, () => ((seed * 31 + k * 17) % 97) / 97));
      ev.forEach(e => D.apply(before, e));
      assert.ok(D.same(before, D.fromState(s)), mode + ' ' + n + 'p seed ' + seed + ' move ' + k + ': ' + ev.map(e => e.t).join(','));
      moves++;
    }
  }
  assert.ok(moves > 10000, moves + ' moves checked');
});
