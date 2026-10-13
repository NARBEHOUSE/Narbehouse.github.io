'use strict';
/* Chasing Rainbows - thousands of computer-only games: every game ends, no move is ever
   illegal (applyMove throws on one), the skill levels are a real ladder, and a table of
   game lengths for the partner. Node only: node tests/sim.test.cjs  (GAMES=n for more) */
const test = require('node:test'), assert = require('node:assert/strict');
const E = require('../js/engine.js'), A = require('../js/ai.js');
const GAMES = +process.env.GAMES || 300;
const CAP = 3000;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function play(skills, mode, seed) {
  const players = skills.map((skill, i) => ({ name: 'P' + i, kind: 'cpu', skill }));
  const { state: s } = E.createGame({ players, mode, first: seed % skills.length }, seed);
  const r = rng(seed * 7 + 3);
  let steps = 0;
  while (s.phase !== 'over' && steps < CAP) {
    const d = E.getDecision(s);
    E.applyMove(s, A.choose(E.viewFor(s, d.p), d, s.players[d.p].skill, r));
    steps++;
  }
  return { over: s.phase === 'over', winner: s.winner, rounds: s.turnNo / skills.length, turns: s.turnNo };
}
const pct = (list, q) => list.slice().sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(list.length * q))];

test('Every game ends, at every player count, mode and skill', () => {
  const rows = [];
  for (const mode of ['classic', 'race']) for (const n of [2, 3, 4, 6]) for (const skill of ['easy', 'normal', 'hard']) {
    const rounds = [], how = {};
    let firstRound = 0;
    for (let i = 1; i <= GAMES; i++) {
      const g = play(Array(n).fill(skill), mode, i * 131 + n);
      assert.ok(g.over, mode + ' ' + n + 'p ' + skill + ' seed ' + i + ' did not finish in ' + CAP + ' moves');
      rounds.push(g.rounds);
      how[g.winner.how] = (how[g.winner.how] || 0) + 1;
      if (g.turns <= n) firstRound++;
    }
    rows.push({ mode, players: n, skill, medianRounds: pct(rounds, .5).toFixed(1), p95Rounds: pct(rounds, .95).toFixed(1),
      wonInRound1: Math.round(100 * firstRound / GAMES) + '%', nightNight: Math.round(100 * (how.night || 0) / GAMES) + '%' });
  }
  console.table(rows);
});

test('The skill levels are a ladder: Hard beats Easy at least 60% head to head', () => {
  let hard = 0;
  const N = GAMES * 2;
  for (let i = 1; i <= N; i++) {
    const skills = ['easy', 'easy']; skills[i % 2] = 'hard';
    const g = play(skills, 'classic', 9000 + i);
    if (g.winner.p === i % 2) hard++;
  }
  console.log('Hard beat Easy in ' + Math.round(100 * hard / N) + '% of ' + N + ' two-player games');
  assert.ok(hard / N >= 0.6);
});
