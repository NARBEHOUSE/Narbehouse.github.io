'use strict';
/* Chasing Rainbows - the turn menus and the spoken words, over thousands of real game states.
   Node only: node tests/menus.test.cjs */
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../js/cards.js'), E = require('../js/engine.js'), A = require('../js/ai.js');
const M = require('../js/menus.js'), W = require('../js/words.js');

const names = ['You', 'Misty', 'Breezy', 'Drizzle', 'Sunny', 'Thunder'];
function* states(games, n, mode) {
  for (let seed = 1; seed <= games; seed++) {
    const players = Array.from({ length: n }, (_, i) => ({ name: names[i], kind: 'cpu', skill: ['easy', 'normal', 'hard'][i % 3] }));
    const { state: s, events } = E.createGame({ players, mode }, seed);
    yield { s, d: E.getDecision(s), events };
    for (let k = 0; k < 600 && s.phase !== 'over'; k++) {
      const d = E.getDecision(s);
      const ev = E.applyMove(s, A.choose(E.viewFor(s, d.p), d, s.players[d.p].skill, () => ((seed * 9301 + k * 49297) % 233280) / 233280));
      yield { s, d: E.getDecision(s), events: ev };
    }
  }
}
function walk(items, fn, depth = 0) { items.forEach(it => { fn(it, depth, items); if (it.children) walk(it.children, fn, depth + 1); }); }

test('Menus offer exactly the legal moves, with stable unique ids, Look then Pause last', () => {
  let checked = 0;
  for (const mode of ['classic', 'race']) for (const n of [2, 3, 5]) for (const { s, d } of states(25, n, mode)) {
    if (d.kind === 'over') continue;
    const view = E.viewFor(s, d.p);
    for (const helper of ['off', 'tips', 'shortcut']) {
      const suggest = A.suggest(view, d).key;
      const items = M.build(d, view, { names }, { helper, suggest });
      assert.deepEqual(M.moveKeys(items).sort(), d.moves.map(m => m.key).sort(), 'menu = legal moves at ' + d.kind);
      assert.equal(items[items.length - 1].id, 'pause');
      assert.equal(items[items.length - 2].id, 'look');
      walk(items, (it, depth, level) => {
        assert.ok(it.label && it.say, 'every item has a label and speech');
        assert.equal(level.filter(x => x.id === it.id).length, 1, 'unique id ' + it.id);
        if (it.kind === 'group') assert.ok(it.children.length, 'no empty rows');
        assert.ok(!/weather:cloud/.test(it.id), 'Cloud Block is never offered as a play');
        assert.ok(it.move !== 'discard:day', 'Day is never discardable');
      });
      if (helper !== 'off' && d.moves.length > 1) {
        const starred = []; walk(items, it => { if (it.star && it.move) starred.push(it.move); });
        assert.ok(starred.includes(suggest), 'the suggested move is starred');
        if (helper === 'shortcut' && M.find(items.filter(i => i.id !== 'suggest'), suggest).length > 1) assert.equal(items[0].id, 'suggest');
      }
      checked++;
    }
  }
  assert.ok(checked > 1000, 'checked ' + checked + ' menus');
});

test('Over the hand limit, End turn disappears and the discard row says how many to go', () => {
  for (const { s, d } of states(30, 2, 'classic')) {
    if (d.kind !== 'play' || s.players[d.p].hand.length <= 7) continue;
    const items = M.build(d, E.viewFor(s, d.p), { names });
    assert.ok(!items.some(i => i.id === 'end'));
    const row = items.find(i => i.id === 'discard');
    assert.match(row.label, /Discard down to 7/);
    return;
  }
  assert.fail('no over-limit state found');
});

test('Every event can be spoken from every seat, and hidden cards are only named to their owner', () => {
  let lines = 0;
  for (const n of [2, 4]) for (const { s, events } of states(30, n, 'classic')) {
    for (const ev of events) {
      for (let viewer = -1; viewer < n; viewer++) {
        const d = W.describe(ev, { names, viewer });
        if (!d) continue;
        assert.equal(typeof d.say, 'string');
        assert.ok(d.say.length > 3 && d.say.length < 260, d.say);
        assert.ok(!/undefined|null|NaN|\[object/.test(d.say), d.say);
        lines++;
        // A card drawn from the pile is private: nobody else hears what it was.
        if (ev.t === 'draw' && viewer !== ev.p) assert.ok(!d.say.includes(C.sayName(ev.card)), d.say);
        if (ev.t === 'double' && viewer !== ev.p) ev.cards.forEach(c => assert.ok(!new RegExp('\\b' + C.sayName(c) + '\\b').test(d.say) || d.say.includes('draws'), d.say));
        if (ev.t === 'wind' && viewer !== ev.p && viewer !== ev.target) assert.match(d.say, /trade cards/);
      }
    }
  }
  assert.ok(lines > 2000);
});

test('Look lines read the hand, the rainbow, the table and the piles', () => {
  const players = [0, 1, 2].map(i => ({ name: names[i], kind: 'cpu' }));
  const { state: s } = E.createGame({ players, mode: 'classic' }, 7);
  s.players[0].hand = ['red', 'red', 'orange', 'wild', 'sun', 'fog', 'day'].map((t, i) => ({ id: 'z' + i, t }));
  s.players[1].laid.rainbow = [{ id: 'q', t: 'wild' }];
  s.players[2].skips = 1;
  const v = E.viewFor(s, 0);
  assert.equal(W.sayHand(v.hand), '7 cards: 2 Reds, Orange, Wild, Sun, Day and Fog Skip.');
  assert.equal(W.sayRainbow(v), 'Rainbow: 2 of 7 colors plus 1 Wild. Still need 4 of yellow, green, blue, indigo or violet. Sun: yes. Rain: no. Day: yes. Night: no.');
  assert.match(W.sayPlayers(v, { names }), /Misty: 7 cards, played a Rainbow\. Breezy: 7 cards, misses the next turn\./);
  assert.match(W.sayPiles(v), /^Discard pile: .+ Draw pile: \d+ cards\.$/);
  assert.ok(W.hints(v).some(h => h.id === 'day-trap'));
});
