/** Chasing Rainbows - what the table shows, one event at a time.
 *
 *  applyMove() jumps the engine straight to the end of a move, but the player should SEE it
 *  happen: the card leaves the pile, lands in a hand, the discard pile changes, a Storm
 *  empties every Red. The table therefore draws from this small mirror of the game, stepped
 *  forward by each event as it is narrated and animated. Once a move's events are all
 *  applied it equals fromState(engine state) - tests/display.test.cjs checks that on
 *  thousands of moves, and the screen re-syncs at the end of every move anyway.
 *
 *  Pure, no DOM. d = { hands: [[type]], discard: [type], draw: n, laid: [{rainbow, core,
 *  legend}] (each the played card types, or null), skips: [n], turn, winner }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CRDisplay = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const ty = c => (typeof c === 'string' ? c : c.t);
  const cardsOf = list => (list ? list.map(ty) : null);

  function fromState(s) {
    return {
      hands: s.players.map(P => P.hand.map(ty)),
      discard: s.discard.map(ty),
      draw: s.draw.length,
      laid: s.players.map(P => ({ rainbow: cardsOf(P.laid.rainbow), core: cardsOf(P.laid.core), legend: cardsOf(P.laid.legend) })),
      skips: s.players.map(P => P.skips),
      turn: s.turn,
      winner: s.winner ? s.winner.p : null,
    };
  }

  function remove(list, t) {
    const i = list.indexOf(t);
    if (i >= 0) list.splice(i, 1);
  }

  /** Step the mirror forward by one engine event. */
  function apply(d, ev) {
    switch (ev.t) {
      case 'draw': d.draw--; d.hands[ev.p].push(ty(ev.card)); break;
      case 'take': d.discard.pop(); d.hands[ev.p].push(ty(ev.card)); break;
      case 'pass': remove(d.hands[ev.p], ty(ev.card)); d.hands[ev.target].push(ty(ev.card)); break;
      case 'steal': remove(d.hands[ev.from], ty(ev.card)); d.hands[ev.p].push(ty(ev.card)); break;
      case 'replace': d.draw--; d.hands[ev.p].push(ty(ev.card)); break;
      case 'reshuffle': d.draw = ev.n; d.discard = d.discard.slice(-1); break;
      case 'combo': ev.cards.forEach(c => remove(d.hands[ev.p], ty(c))); d.laid[ev.p][ev.combo] = ev.cards.map(ty); break;
      case 'weather': remove(d.hands[ev.p], ev.card); d.discard.push(ev.card); break;
      case 'block': remove(d.hands[ev.p], 'cloud'); d.discard.push('cloud'); break;
      case 'double': d.draw -= ev.cards.length; ev.cards.forEach(c => d.hands[ev.p].push(ty(c))); break;
      case 'fog': d.skips[ev.target] = ev.skips; break;
      case 'skipped': d.skips[ev.p] = ev.left; break;
      case 'storm': {
        let back = ev.fromDiscard;
        d.hands.forEach(h => { for (let i = h.length - 1; i >= 0; i--) if (h[i] === ev.name) { h.splice(i, 1); back++; } });
        d.discard = d.discard.filter(t => t !== ev.name);
        d.draw += back;
        break;
      }
      case 'wind':
        if (ev.took) { remove(d.hands[ev.target], ty(ev.took)); d.hands[ev.p].push(ty(ev.took)); }
        if (ev.gave) { remove(d.hands[ev.p], ty(ev.gave)); d.hands[ev.target].push(ty(ev.gave)); }
        break;
      case 'discard': remove(d.hands[ev.p], ty(ev.card)); d.discard.push(ty(ev.card)); break;
      case 'turn': d.turn = ev.p; break;
      case 'win': d.winner = ev.p; break;
      case 'flip': break;
      default: break;
    }
    return d;
  }

  /** Same table? (hands compared as multisets - the screen sorts them anyway). */
  function same(a, b) {
    const sorted = h => h.slice().sort().join(',');
    return a.draw === b.draw && a.turn === b.turn && a.winner === b.winner &&
      a.discard.join(',') === b.discard.join(',') &&
      a.hands.every((h, i) => sorted(h) === sorted(b.hands[i])) &&
      a.laid.every((L, i) => ['rainbow', 'core', 'legend'].every(k => String(L[k]) === String(b.laid[i][k]))) &&
      a.skips.every((k, i) => k === b.skips[i]);
  }

  return { fromState, apply, same };
});
