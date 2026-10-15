'use strict';
/* Chasing Rainbows - the rules engine against the printed rules and SPEC.md's rulings.
   Node only: node tests/rules.test.cjs */
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../js/cards.js'), E = require('../js/engine.js'), A = require('../js/ai.js');

let nextId = 1000;
const card = t => ({ id: 'x' + nextId++, t });
const cards = list => list.map(card);
function game(n = 2, mode = 'classic', house) {
  const players = Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'cpu', skill: 'normal' }));
  return E.createGame({ players, mode, house, first: 0 }, 4242).state;
}
/** A game at P0's play phase with the hands, piles and laid combos given. */
function table(opts) {
  const s = game(opts.n || 2, opts.mode || 'classic', opts.house);
  s.players.forEach((P, i) => { P.hand = cards((opts.hands && opts.hands[i]) || ['red']); P.known = []; });
  if (opts.draw) s.draw = cards(opts.draw);
  if (opts.discard) s.discard = cards(opts.discard);
  (opts.laid || []).forEach((L, i) => { Object.keys(L || {}).forEach(k => { s.players[i].laid[k] = L[k] ? cards(['wild']) : null; }); });
  s.turn = 0; s.phase = opts.phase || 'play'; s.weatherPlayed = false; s.pending = null;
  return s;
}
const keys = s => E.legalMoves(s).map(m => m.key);
const allCards = s => [...s.draw, ...s.discard, ...s.players.flatMap(P => [...P.hand, ...Object.values(P.laid).filter(Boolean).flat()])];

test('Deck sizes follow the player count and mode', () => {
  const sizes = [[2, 'classic', 48], [3, 'classic', 96], [4, 'classic', 96], [5, 'classic', 144], [6, 'classic', 144],
    [2, 'classicLite', 46], [4, 'classicLite', 92], [6, 'classicLite', 138],
    [2, 'raceFull', 31], [4, 'raceFull', 62], [6, 'raceFull', 93],
    [2, 'race', 25], [4, 'race', 50], [6, 'race', 75]];
  for (const [n, mode, size] of sizes) {
    const s = game(n, mode);
    assert.equal(allCards(s).length, size, n + ' players ' + mode);
    s.players.forEach(P => assert.equal(P.hand.length, 7));
    assert.equal(s.discard.length, mode === 'race' || mode === 'raceFull' ? 0 : 1);
  }
  const counts = {};
  allCards(game(2)).forEach(c => { counts[c.t] = (counts[c.t] || 0) + 1; });
  C.ORDER.forEach(t => assert.equal(counts[t], C.TYPES[t].copies, t));
  const house = { weather: { cloud: false, double: false, fog: false, storm: false, wind: false }, core: true, legend: false, draw: 'discard' };
  assert.equal(allCards(game(2, 'house', house)).length, 25 + 6);
});

test('Every card has a unique id and none are lost or copied during play', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const players = [0, 1, 2].map(i => ({ name: 'P' + i, kind: 'cpu', skill: 'normal' }));
    const { state: s } = E.createGame({ players, mode: 'classic' }, seed);
    const ids = allCards(s).map(c => c.id).sort();
    for (let k = 0; k < 400 && s.phase !== 'over'; k++) {
      const d = E.getDecision(s);
      E.applyMove(s, A.choose(E.viewFor(s, d.p), d, 'normal', () => 0.37));
      if (s.phase !== 'over' && s.players.some(P => P.hand.length > 7) && s.phase === 'draw') assert.fail('a hand ended a turn over the limit');
    }
    assert.deepEqual(allCards(s).map(c => c.id).sort(), ids);
  }
});

test('Drawing is required; a weather card freezes the discard pile', () => {
  const s = table({ phase: 'draw', discard: ['orange'] });
  assert.deepEqual(keys(s).sort(), ['draw', 'take']);
  s.discard = cards(['red', 'fog']);
  assert.deepEqual(keys(s), ['draw']);
});

test('Taking the discard puts that card in hand and is public knowledge', () => {
  const s = table({ phase: 'draw', discard: ['red', 'orange'] });
  E.applyMove(s, 'take');
  assert.ok(s.players[0].hand.some(c => c.t === 'orange'));
  assert.deepEqual(E.viewFor(s, 1).players[0].known, ['orange']);
  assert.equal(s.phase, 'play');
});

test('The hand limit is 7: over it, End turn is not offered and discards continue down to 7', () => {
  const s = table({ hands: [['red', 'red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'sun', 'rain', 'cloud']] });
  assert.ok(!keys(s).includes('end'));
  E.applyMove(s, 'discard:red');
  assert.equal(s.phase, 'discard');
  assert.ok(keys(s).every(k => k.startsWith('discard:')));
  E.applyMove(s, 'discard:cloud');
  assert.equal(s.phase, 'discard');
  E.applyMove(s, 'discard:sun');
  assert.equal(s.turn, 1, 'reaching 7 ends the turn');
});

test('At 7 or fewer, discarding one card ends the turn, and so does End turn', () => {
  const s = table({ hands: [['red', 'orange']] });
  assert.ok(keys(s).includes('end'));
  E.applyMove(s, 'discard:red');
  assert.equal(s.turn, 1);
  const t = table({ hands: [['red', 'orange']] });
  E.applyMove(t, 'end');
  assert.equal(t.turn, 1);
  assert.equal(t.players[0].hand.length, 2);
});

test('Legends never die: Day is never discardable, Night only as the last card of a winning hand', () => {
  let s = table({ hands: [['day', 'night', 'red']] });
  assert.ok(!keys(s).includes('discard:day'));
  assert.ok(!keys(s).includes('discard:night'));
  s = table({ hands: [['night']], laid: [{ rainbow: true, core: false }] });
  assert.ok(!keys(s).includes('discard:night'), 'Sun & Rain not played yet');
  s = table({ hands: [['night']], laid: [{ rainbow: true, core: true }] });
  assert.ok(keys(s).includes('discard:night'));
  const ev = E.applyMove(s, 'discard:night');
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winner, { p: 0, how: 'night', legend: false });
  assert.ok(ev.some(e => e.t === 'win' && e.how === 'night'));
  s = table({ hands: [['day']], laid: [{ rainbow: true, core: true }] });
  assert.ok(!keys(s).includes('discard:day'), 'Day stays even as the last card');
});

test('Rainbows: Wilds fill gaps (even all seven), real colors are used first', () => {
  assert.ok(E.canRainbow(['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']));
  assert.ok(E.canRainbow(['wild', 'wild', 'wild', 'wild', 'wild', 'wild', 'wild']));
  assert.ok(E.canRainbow(['red', 'wild', 'yellow', 'wild', 'blue', 'wild', 'violet']));
  assert.ok(!E.canRainbow(['red', 'red', 'yellow', 'wild', 'blue', 'wild', 'violet']));
  assert.deepEqual(E.rainbowProgress(['red', 'wild', 'blue']), { have: ['red', 'blue'], missing: ['orange', 'yellow', 'green', 'indigo', 'violet'], wilds: 1, need: 4 });
  const s = table({ hands: [['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'wild', 'wild', 'violet']] });
  E.applyMove(s, 'combo:rainbow');
  assert.deepEqual(s.players[0].laid.rainbow.map(c => c.t), C.COLORS);
  assert.deepEqual(s.players[0].hand.map(c => c.t), ['wild', 'wild']);
});

test('Each combo can be played once; partial combos are never offered', () => {
  const s = table({ hands: [['sun', 'rain', 'sun', 'rain', 'day']] });
  assert.ok(keys(s).includes('combo:core'));
  assert.ok(!keys(s).includes('combo:legend'));
  E.applyMove(s, 'combo:core');
  assert.ok(!keys(s).includes('combo:core'), 'a second Sun & Rain is not allowed');
});

test('Cloud Block is only a response, and only one weather card per turn', () => {
  const s = table({ hands: [['cloud', 'fog', 'double', 'red'], ['blue']] });
  assert.ok(!keys(s).some(k => k.startsWith('weather:cloud')));
  E.applyMove(s, 'weather:double');
  assert.ok(!keys(s).some(k => k.startsWith('weather:')));
});

test('Double Draw draws two from the draw pile', () => {
  const s = table({ hands: [['double', 'red'], ['blue']], draw: ['green', 'violet', 'indigo'] });
  E.applyMove(s, 'weather:double');
  assert.deepEqual(s.players[0].hand.map(c => c.t).sort(), ['indigo', 'red', 'violet']);
});

test('Fog Skip costs the target their next turn, and Fogs stack', () => {
  const s = table({ n: 3, hands: [['fog', 'red'], ['blue'], ['green']] });
  E.applyMove(s, 'weather:fog:1');
  assert.equal(s.players[1].skips, 1);
  const ev = E.applyMove(s, 'end');
  assert.ok(ev.some(e => e.t === 'skipped' && e.p === 1));
  assert.equal(s.turn, 2);
  const t = table({ hands: [['fog', 'red'], ['blue']] });
  t.players[1].skips = 1;
  E.applyMove(t, 'weather:fog:1');
  assert.equal(t.players[1].skips, 2);
  E.applyMove(t, 'end');
  assert.equal(t.turn, 0, 'two players: the fogged player is skipped twice, so it comes straight back');
});

test('Storm Shuffle takes every copy from every hand, the caster\'s too, and the discard pile - never played combos', () => {
  const s = table({ n: 3, hands: [['storm', 'red', 'blue'], ['red', 'red', 'green'], ['yellow']], discard: ['red', 'orange', 'red'], draw: ['violet'] });
  s.players[1].laid.rainbow = cards(['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']);
  const ev = E.applyMove(s, 'weather:storm:red');
  assert.deepEqual(s.players[0].hand.map(c => c.t), ['blue']);
  assert.deepEqual(s.players[1].hand.map(c => c.t), ['green']);
  assert.deepEqual(s.discard.map(c => c.t), ['orange', 'storm']);
  assert.equal(s.draw.filter(c => c.t === 'red').length, 5);
  assert.equal(s.players[1].laid.rainbow[0].t, 'red', 'played rainbow untouched');
  const storm = ev.find(e => e.t === 'storm');
  assert.deepEqual(storm.lost, [{ p: 0, n: 1 }, { p: 1, n: 2 }]);
  assert.equal(storm.fromDiscard, 2);
});

test('Storm only names cards that are in this deck', () => {
  const race = E.resolveRules('race');
  assert.deepEqual(E.stormNames(race), [...C.COLORS, 'wild']);
  assert.deepEqual(E.stormNames(E.resolveRules('classic')), [...C.COLORS, 'wild', 'sun', 'rain', 'day', 'night']);
});

test('Wind Trade: the card taken is random from the hand as it was BEFORE the gift', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = table({ hands: [['wind', 'day', 'red'], ['blue', 'green']] });
    s.rng = seed;
    E.applyMove(s, 'weather:wind:1:day');
    const mine = s.players[0].hand.map(c => c.t), theirs = s.players[1].hand.map(c => c.t);
    assert.ok(theirs.includes('day'));
    assert.ok(!mine.includes('day'), 'the gift never comes straight back');
    assert.equal(mine.length, 2);
    assert.equal(theirs.length, 2);
  }
});

test('Wind needs a target holding cards and a card to give', () => {
  let s = table({ hands: [['wind'], ['blue']] });
  assert.ok(!keys(s).some(k => k.startsWith('weather:wind')), 'nothing left to give');
  s = table({ n: 3, hands: [['wind', 'red'], [], ['blue']] });
  s.players[1].hand = [];
  const winds = keys(s).filter(k => k.startsWith('weather:wind'));
  assert.deepEqual(winds, ['weather:wind:2:red']);
});

test('Cloud Block: holders are asked in turn order; a block cancels the card, which stays used', () => {
  const s = table({ n: 3, hands: [['fog', 'red'], ['cloud', 'blue'], ['cloud', 'green']] });
  E.applyMove(s, 'weather:fog:2');
  let d = E.getDecision(s);
  assert.equal(d.kind, 'block');
  assert.equal(d.p, 1);
  E.applyMove(s, 'allow');
  d = E.getDecision(s);
  assert.equal(d.p, 2);
  const ev = E.applyMove(s, 'block');
  assert.ok(ev.some(e => e.t === 'blocked' && e.card === 'fog'));
  assert.equal(s.players[2].skips, 0);
  assert.deepEqual(s.discard.slice(-2).map(c => c.t), ['fog', 'cloud']);
  assert.equal(E.getDecision(s).kind, 'play');
  assert.ok(!keys(s).some(k => k.startsWith('weather:')), 'the blocked card was still the weather card for this turn');
});

test('Block chains (house rule): an even number of Clouds lets the weather card through', () => {
  const house = { weather: { cloud: true, double: true, fog: true, storm: true, wind: true }, core: true, legend: true, draw: 'discard', blockChains: true };
  const s = table({ n: 3, mode: 'house', house, hands: [['fog', 'cloud', 'red'], ['cloud', 'blue'], ['green']] });
  E.applyMove(s, 'weather:fog:1');
  assert.equal(E.getDecision(s).p, 1);
  E.applyMove(s, 'block');
  const d = E.getDecision(s);
  assert.equal(d.kind, 'block');
  assert.equal(d.p, 0, 'the fogging player may block the block');
  const ev = E.applyMove(s, 'block');
  assert.ok(ev.some(e => e.t === 'fog' && e.target === 1));
  assert.equal(s.players[1].skips, 1);
  const no = table({ n: 3, hands: [['fog', 'cloud', 'red'], ['cloud', 'blue'], ['green']] });
  E.applyMove(no, 'weather:fog:1');
  E.applyMove(no, 'block');
  assert.equal(E.getDecision(no).kind, 'play', 'without the house rule a Cloud cannot be blocked');
});

test('Winning remains valid with an empty hand and Rainbow and Sun & Rain played - by combo, discard, weather, or someone else\'s Storm', () => {
  let s = table({ hands: [['sun', 'rain']], laid: [{ rainbow: true }] });
  E.applyMove(s, 'combo:core');
  assert.deepEqual(s.winner, { p: 0, how: 'combo', legend: false });

  s = table({ hands: [['red']], laid: [{ rainbow: true, core: true }] });
  E.applyMove(s, 'discard:red');
  assert.equal(s.winner.how, 'discard');

  s = table({ hands: [['fog'], ['blue']], laid: [{ rainbow: true, core: true }] });
  E.applyMove(s, 'weather:fog:1');
  assert.equal(s.winner.how, 'weather');

  s = table({ hands: [['storm', 'red'], ['blue', 'blue']], laid: [{}, { rainbow: true, core: true }] });
  E.applyMove(s, 'weather:storm:blue');
  assert.deepEqual(s.winner, { p: 1, how: 'storm', legend: false }, 'R4: a Storm can hand someone else the win');

  s = table({ hands: [['red', 'blue']], laid: [{ rainbow: true }] });
  E.applyMove(s, 'discard:red');
  assert.equal(s.phase, 'draw', 'no win without Sun & Rain');
});

test('Legacy Rainbow Race saves retain the steal-and-replace draw option', () => {
  const s = table({ mode: 'race', phase: 'draw', hands: [['red'], ['blue', 'green']], draw: ['violet'] });
  s.v = 1; s.rules.draw = 'player'; delete s.rules.emptyHand;
  assert.deepEqual(keys(s).sort(), ['draw', 'steal:1']);
  const ev = E.applyMove(s, 'steal:1');
  assert.equal(s.players[0].hand.length, 2);
  assert.equal(s.players[1].hand.length, 2);
  assert.ok(ev.some(e => e.t === 'replace' && e.card.t === 'violet'));
  const w = table({ mode: 'race', hands: [['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']] });
  E.applyMove(w, 'combo:rainbow');
  assert.equal(w.winner.how, 'combo');
});

test('An empty draw pile reshuffles the discard pile except its top card; with nothing anywhere, the draw is skipped', () => {
  const s = table({ phase: 'draw', draw: [], discard: ['red', 'blue', 'fog'] });
  const ev = E.applyMove(s, 'draw');
  assert.ok(ev.some(e => e.t === 'reshuffle' && e.n === 2));
  assert.deepEqual(s.discard.map(c => c.t), ['fog']);
  assert.equal(s.draw.length, 1);
  const t = table({ hands: [['red'], ['blue']], draw: [], discard: ['fog'] });
  const ev2 = E.applyMove(t, 'end');
  assert.ok(ev2.some(e => e.t === 'nodraw' && e.p === 1));
  assert.equal(t.phase, 'play');
});

test('A seat\'s view never contains another hand or the draw order', () => {
  const s = game(4);
  for (let p = 0; p < 4; p++) {
    const v = E.viewFor(s, p), text = JSON.stringify(v);
    assert.deepEqual(v.hand, s.players[p].hand.map(c => c.t));
    s.players.forEach((P, q) => { if (q !== p) assert.equal(v.players[q].hand, undefined); });
    assert.equal(v.draw, undefined);
    assert.ok(!/"id":"c\d+"/.test(text), 'no card identities leak');
    assert.equal(v.players[p].count, 7);
  }
  // A Wind's chosen gift is private to the player who played it.
  const w = table({ n: 3, hands: [['wind', 'red'], ['cloud'], ['blue']] });
  E.applyMove(w, 'weather:wind:2:red');
  assert.equal(E.viewFor(w, 1).pending.give, undefined);
  assert.equal(E.viewFor(w, 0).pending.give, 'red');
});

test('Saved games resume exactly (JSON round trip)', () => {
  const players = [0, 1, 2].map(i => ({ name: 'P' + i, kind: 'cpu', skill: 'hard' }));
  const { state: s } = E.createGame({ players, mode: 'classic' }, 99);
  const step = st => { const d = E.getDecision(st); return E.applyMove(st, A.choose(E.viewFor(st, d.p), d, 'hard', () => 0.42)); };
  for (let k = 0; k < 30 && s.phase !== 'over'; k++) step(s);
  const copy = JSON.parse(JSON.stringify(s));
  for (let k = 0; k < 50 && s.phase !== 'over'; k++) assert.deepEqual(step(copy), step(s));
  assert.deepEqual(copy, s);
});

test('Illegal moves are refused', () => {
  const s = table({ hands: [['day', 'red']] });
  assert.throws(() => E.applyMove(s, 'discard:day'));
  assert.throws(() => E.applyMove(s, 'combo:rainbow'));
  assert.throws(() => E.applyMove(s, 'take'));
});
