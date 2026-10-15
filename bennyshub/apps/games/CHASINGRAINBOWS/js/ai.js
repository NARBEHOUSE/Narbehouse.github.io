/** Chasing Rainbows - the computer players, and the Rainbow Helper's suggestions.
 *
 *  A computer player is handed engine.viewFor(): exactly what a person at the table could
 *  know (its own hand, the face-up piles, hand counts, played combos, skips and the cards
 *  it saw others take from the discard pile). It never sees another hand or the draw order.
 *
 *  Skills (the names Benny's Sphere Splash uses):
 *    easy    plays sensibly but loosely: noisy draws, few weather cards, blocks a third of the time.
 *    normal  greedy and sound: takes what it needs, plays combos at once, uses weather on the
 *            leader, dumps dead cards, blocks what really hurts it. The Helper suggests these moves.
 *    hard    normal, plus: storms cards it knows the leader holds, guards its Cloud Blocks,
 *            and blocks the leader's plays when the leader is close to winning.
 *
 *  choose(view, decision, skill, rnd) returns one of decision.moves. rnd() is [0,1).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./engine.js'));
  else root.CRAI = factory(root.CRCards, root.CREngine);
})(typeof window === 'undefined' ? globalThis : window, function (C, E) {
  'use strict';

  const count = (hand, t) => hand.reduce((k, x) => k + (x === t ? 1 : 0), 0);
  const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

  /** How far a seat is from winning, from public information only. Higher = closer. */
  function progress(P) {
    return (P.laid.rainbow ? 4 : 0) + (P.laid.core ? 3 : 0) + (P.done ? 2 : 0) + (7 - Math.min(P.count, 7)) * 0.4;
  }
  function leader(view) {
    let best = -1, score = -Infinity;
    view.players.forEach((P, q) => {
      if (q === view.me) return;
      const v = progress(P) + (P.skips ? -1 : 0);
      if (v > score) { score = v; best = q; }
    });
    return best;
  }
  const closeToWinning = (view, q) => {
    const P = view.players[q];
    return P.done || (P.laid.rainbow && view.rules.core && !P.laid.core) || (P.laid.core && P.count <= 8 && !P.laid.rainbow && P.count >= 6);
  };

  /** What keeping one card of type t (already in hand) is worth to me right now. */
  function keepValue(view, t, skill) {
    const hand = view.hand, me = view.players[view.me], L = me.laid, prog = E.rainbowProgress(hand);
    const cls = C.TYPES[t].cls, n = count(hand, t);
    if (cls === 'color' && t !== 'wild') {
      if (L.rainbow) return 0;
      return n >= 2 ? 1 : 10;
    }
    if (t === 'wild') {
      if (L.rainbow) return 0;
      const wildsUseful = 7 - prog.have.length;
      return n > wildsUseful ? 2 : 9;
    }
    if (cls === 'core') {
      if (!view.rules.core || L.core) return 0;
      const partner = t === 'sun' ? 'rain' : 'sun';
      return n >= 2 ? 1 : 9 + (hand.includes(partner) ? 1 : 0);
    }
    if (t === 'day') return hand.includes('night') && !L.legend ? 6 : -10;
    if (t === 'night') return hand.includes('day') && !L.legend ? 6 : view.rules.emptyHand === false ? -8 : 3;
    // Weather.
    if (t === 'cloud') return skill === 'hard' ? 7 : 5;
    if (t === 'wind') return hand.includes('day') && !hand.includes('night') ? 8 : 4;
    if (t === 'fog') return 5;
    if (t === 'double') return me.done ? 2 : 4;
    return 4;
  }

  /** What adding one card of type t to my hand would be worth. */
  function gainValue(view, t) {
    const hand = view.hand, L = view.players[view.me].laid, prog = E.rainbowProgress(hand);
    const cls = C.TYPES[t].cls;
    if (cls === 'color' && t !== 'wild') {
      if (L.rainbow) return -1;
      if (hand.includes(t)) return 0.5;
      return prog.need > 0 ? 10 : 1;
    }
    if (t === 'wild') return L.rainbow ? -1 : prog.need > 0 ? 9 : 1;
    if (cls === 'core') {
      if (!view.rules.core || L.core) return -1;
      return hand.includes(t) ? 0.5 : 9;
    }
    if (t === 'day') return hand.includes('night') && !L.legend ? 7 : -6;
    if (t === 'night') return hand.includes('day') && !L.legend ? 8 : 0;
    return 3;
  }

  /** Lowest-value discardable card type (ties: the one I hold most of). The card just taken
   *  from the discard pile is protected: throwing it straight back only hands it on, and two
   *  players can pass one card back and forth forever. */
  function worstDiscard(view, moves, skill) {
    let best = null, bestV = Infinity;
    moves.filter(m => m.type === 'discard' || m.type === 'pass').forEach(m => {
      const fresh = view.took === m.card && count(view.hand, m.card) === 1 ? 4 : 0;
      const v = keepValue(view, m.card, skill) - count(view.hand, m.card) * 0.01 + fresh;
      if (v < bestV) { bestV = v; best = m; }
    });
    return best ? { move: best, value: bestV } : null;
  }

  /** Would taking `t` complete a combo I haven't played? Then the hand shrinks right away. */
  function completesCombo(view, t) {
    const hand = view.hand.concat([t]), L = view.players[view.me].laid;
    if (!L.rainbow && E.canRainbow(hand) && !E.canRainbow(view.hand)) return true;
    if (view.rules.core && !L.core && (t === 'sun' || t === 'rain') && hand.includes('sun') && hand.includes('rain')) return true;
    if (view.rules.legend && !L.legend && (t === 'day' || t === 'night') && hand.includes('day') && hand.includes('night')) return true;
    return false;
  }
  /** The cheapest card I could give up from a full hand (Legends can't be discarded). */
  function cheapestKeep(view, skill) {
    let v = Infinity;
    C.group(view.hand).forEach(g => { if (!C.isLegend(g.t)) v = Math.min(v, keepValue(view, g.t, skill)); });
    return v;
  }

  /* ── weather choices ─────────────────────────────────────────────────────── */
  function stormPick(view, moves, skill, rnd) {
    const storms = moves.filter(m => m.type === 'weather' && m.card === 'storm');
    if (!storms.length) return null;
    const hand = view.hand, me = view.players[view.me];
    // Storm my own Day away when I can't pair it.
    const trapped = hand.includes('day') && !hand.includes('night') ? 'day'
      : view.rules.emptyHand === false && hand.includes('night') && !hand.includes('day') ? 'night' : null;
    if (trapped) return storms.find(m => m.name === trapped) || null;
    // Combos all played: storm the leftover cards I hold most of - the fastest way to an empty hand.
    if (me.done) {
      let most = null, n = 0;
      storms.forEach(m => { const k = m.name === 'night' ? 0 : count(hand, m.name); if (k > n) { n = k; most = m; } });
      if (most) return most;
    }
    const lead = leader(view);
    const L = view.players[lead];
    let best = null, bestScore = 0;
    storms.forEach(m => {
      const mine = count(hand, m.name);
      let score = -mine * keepValue(view, m.name, skill) * 0.6 - mine * 0.5;
      if (skill === 'hard') {
        // Cards the leader was seen taking are still in that hand.
        score += count(L.known, m.name) * 9;
        view.players.forEach((P, q) => { if (q !== view.me && q !== lead) score += count(P.known, m.name) * 3; });
      }
      if (C.TYPES[m.name].cls === 'core' && view.rules.core && !L.laid.core && !mine) score += 3;
      if (C.TYPES[m.name].cls === 'color' && m.name !== 'wild' && !L.laid.rainbow && !mine) score += 1.5;
      if (m.name === 'wild' && !L.laid.rainbow && !mine) score += 2;
      score += rnd() * 0.5;
      if (score > bestScore) { bestScore = score; best = m; }
    });
    return bestScore >= (skill === 'hard' ? 2.5 : 3) ? best : null;
  }

  function weatherPick(view, moves, skill, rnd) {
    const hand = view.hand, me = view.players[view.me];
    const weather = moves.filter(m => m.type === 'weather');
    if (!weather.length) return null;
    if (skill === 'easy' && rnd() > 0.4) return null;
    const lead = leader(view);
    // 1. Trade away a Day I cannot pair - to the leader, so it burdens them.
    const trapped = hand.includes('day') && !hand.includes('night') ? 'day'
      : view.rules.emptyHand === false && hand.includes('night') && !hand.includes('day') ? 'night' : null;
    if (trapped) {
      const w = weather.filter(m => m.card === 'wind' && m.give === trapped);
      if (w.length) return w.find(m => m.target === lead) || w[0];
    }
    // 2. Fog the leader: it costs them a whole turn.
    const fogs = weather.filter(m => m.card === 'fog');
    if (fogs.length) return fogs.find(m => m.target === lead) || pick(fogs, rnd);
    // 3. Storm, when a good name exists.
    const storm = stormPick(view, moves, skill, rnd);
    if (storm) return storm;
    // 4. Double Draw while still collecting.
    const dbl = weather.find(m => m.card === 'double');
    const prog = E.rainbowProgress(hand);
    const collecting = (!me.laid.rainbow && prog.need > 0) || (view.rules.core && !me.laid.core && !(hand.includes('sun') && hand.includes('rain')));
    if (dbl && collecting) return dbl;
    // 5. Wind away a dead card for a fresh one.
    const winds = weather.filter(m => m.card === 'wind');
    if (winds.length) {
      let best = null, bestV = Infinity;
      winds.forEach(m => {
        const v = keepValue(view, m.give, skill) + (m.target === lead ? -0.2 : 0);
        if (v < bestV) { bestV = v; best = m; }
      });
      if (bestV <= 1) return best;
    }
    // 6. Once both combos are down, every weather card is a way to shrink the hand.
    if (me.done) return weather.find(m => m.card === 'double') ? weather.find(m => m.card !== 'double') || null : weather[0];
    return null;
  }

  /* ── the decision ────────────────────────────────────────────────────────── */
  function choose(view, decision, skill, rnd) {
    rnd = rnd || Math.random;
    skill = skill || 'normal';
    const moves = decision.moves;
    if (!moves.length) return null;
    if (moves.length === 1) return moves[0];
    const by = type => moves.filter(m => m.type === type);
    const me = view.players[view.me];

    if (decision.kind === 'block') return blockChoice(view, moves, skill, rnd);

    if (decision.kind === 'draw') {
      const take = moves.find(m => m.type === 'take');
      const draw = moves.find(m => m.type === 'draw');
      if (take && (skill !== 'easy' || rnd() < 0.6)) {
        const gain = gainValue(view, view.discardTop);
        // With a full hand, taking forces a discard: only worth it for a clearly better card.
        const full = view.hand.length >= E.HAND_LIMIT;
        if (completesCombo(view, view.discardTop) || (gain >= 7 && (!full || gain - cheapestKeep(view, skill) >= 2))) return take;
      }
      const steals = by('steal');
      if (steals.length && (skill !== 'easy' || rnd() < 0.5)) {
        const lead = leader(view);
        return steals.find(m => m.from === lead) || pick(steals, rnd);
      }
      return draw || moves[0];
    }

    if (decision.kind === 'discard' || decision.kind === 'pass') {
      const w = worstDiscard(view, moves, skill);
      if (skill === 'easy' && rnd() < 0.25) return pick(moves.filter(m => m.type === 'discard' || m.type === 'pass'), rnd) || moves[0];
      return w ? w.move : moves[0];
    }

    // play
    const combos = by('combo');
    if (combos.length) return combos.find(m => m.combo === 'legend') || combos.find(m => m.combo === 'core') || combos[0];
    const weather = weatherPick(view, moves, skill, rnd);
    if (weather) return weather;
    const end = moves.find(m => m.type === 'end');
    const w = worstDiscard(view, moves, skill);
    if (!end) return w ? w.move : moves[0];
    if (!w) return end;
    if (me.done) return w.move;                       // shrink toward an empty hand
    if (skill === 'easy') return rnd() < 0.5 && w.value <= 2 ? w.move : end;
    return w.value <= 2 ? w.move : end;
  }

  function blockChoice(view, moves, skill, rnd) {
    const yes = moves.find(m => m.type === 'block'), no = moves.find(m => m.type === 'allow');
    const pd = view.pending;
    if (!pd) return no;
    const hand = view.hand, me = view.me;
    // Block chains (a House Rule): an odd count means the weather card is stopped right now.
    // Only its own player wants to block that Cloud and bring the card back.
    if (pd.blocks % 2 === 1) {
      if (pd.actor !== me) return no;
      return skill !== 'easy' || rnd() < 0.33 ? yes : no;
    }
    let impact = 0;
    if (pd.card === 'fog' && pd.target === me) impact = 6;
    else if (pd.card === 'wind' && pd.target === me) impact = 3 + (hand.length <= 3 ? 2 : 0);
    else if (pd.card === 'storm') {
      const mine = count(hand, pd.name);
      impact = mine ? mine * Math.max(0, keepValue(view, pd.name, skill)) * 0.6 : 0;
    } else if (pd.card === 'double' || pd.card === 'fog' || pd.card === 'wind') {
      impact = closeToWinning(view, pd.actor) ? 5 : 0.5;
    }
    if (skill === 'easy') return impact >= 3 && rnd() < 0.33 ? yes : no;
    if (skill === 'hard') return impact >= 4 || (closeToWinning(view, pd.actor) && pd.actor !== me && impact >= 2) ? yes : no;
    return impact >= 5 ? yes : no;
  }

  /** The Rainbow Helper's suggestion: the Normal player's move, without randomness. */
  function suggest(view, decision) {
    return choose(view, decision, 'normal', () => 0.5);
  }

  return { choose, suggest, keepValue, gainValue, leader, progress };
});
