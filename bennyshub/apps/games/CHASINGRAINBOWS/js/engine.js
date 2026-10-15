/** Chasing Rainbows - the rules engine.
 *
 *  Pure: no DOM, no timers, no Math.random. Every random choice comes from a seeded
 *  generator kept IN the state, so a saved game (JSON.stringify(state)) resumes exactly,
 *  and the Node tests and simulations are repeatable.
 *
 *  The game is a list of decisions. getDecision(state) says who must decide and lists
 *  every legal move; applyMove(state, move) mutates the state and returns the events
 *  that happened, in order. The screen, the narrator and the computer players all work
 *  from those two calls - nothing else changes the state.
 *
 *  Moves are whole decisions ("Fog Skip on Misty", "Wind Trade with Misty giving Red"),
 *  so a move list is also the complete menu tree the player scans through.
 *
 *  Rulings for situations the printed rules leave open (SPEC.md §1, R1-R12):
 *    R1 an empty draw pile reshuffles the discard pile except its top card;
 *    R2 a Cloud Block cannot itself be blocked (rules.blockChains turns chains on);
 *    R3 Fog Skips stack (rules.fogStacks); October 14 wins need the required combos,
 *    no Legends in hand and at most seven cards; R5 Wind takes from the target's hand as it was
 *    before the gift; R6 Wind needs a target holding cards; R7 drawing is required;
 *    October 14 Rainbow Race draws, plays combos, then passes to the next seat on the right;
 *    R10 Cloud Block is only ever a response; R11 Storm names cards in this deck only.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'));
  else root.CREngine = factory(root.CRCards);
})(typeof window === 'undefined' ? globalThis : window, function (C) {
  'use strict';

  const HAND_LIMIT = 7;
  const DEAL = 7;

  /* ── random numbers (mulberry32; the state carries the seed) ─────────────── */
  function rand(s) {
    let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(s, list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand(s) * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  /* ── modes and house rules ──────────────────────────────────────────────── */
  const ALL_WEATHER = { cloud: true, double: true, fog: true, storm: true, wind: true };
  const NO_WEATHER = { cloud: false, double: false, fog: false, storm: false, wind: false };
  const PRESETS = {
    classic:     { weather: ALL_WEATHER, core: true, legend: true, draw: 'discard' },
    classicLite: { weather: ALL_WEATHER, core: true, legend: false, draw: 'discard' },
    raceFull:    { weather: NO_WEATHER, core: true, legend: false, draw: 'pass' },
    race:        { weather: NO_WEATHER, core: false, legend: false, draw: 'pass' },
  };
  /** Four named presets, plus 'house'; house = the saved House Rules (same shape as a preset). */
  function resolveRules(mode, house) {
    const base = PRESETS[mode] || (mode === 'house' && house) || PRESETS.classic;
    const weather = {};
    C.WEATHER.forEach(w => { weather[w] = !!(base.weather && base.weather[w]); });
    return {
      weather,
      core: base.core !== false,
      legend: base.legend !== false,
      draw: ['player', 'pass'].includes(base.draw) ? base.draw : 'discard',
      // Missing on pre-October saves: those games keep their original empty-hand rule.
      emptyHand: false,
      blockChains: !!(base.blockChains),
      fogStacks: base.fogStacks !== false,
    };
  }
  const setsFor = n => (n <= 2 ? 1 : n <= 4 ? 2 : 3);

  function inDeck(rules, t) {
    const cls = C.TYPES[t].cls;
    if (cls === 'color') return true;
    if (cls === 'core') return rules.core;
    if (cls === 'legend') return rules.legend;
    return !!rules.weather[t];
  }

  /* ── setup ──────────────────────────────────────────────────────────────── */
  /** config: { players: [{ name, kind: 'human'|'cpu', skill }], mode, house, first } */
  function createGame(config, seed) {
    const rules = resolveRules(config.mode, config.house);
    const n = config.players.length;
    if (n < 2 || n > 6) throw new Error('Chasing Rainbows needs 2 to 6 players');
    const s = {
      v: 2, rng: (seed >>> 0) || 1, rules, mode: config.mode || 'classic', sets: setsFor(n),
      players: config.players.map(p => ({
        name: p.name, kind: p.kind === 'cpu' ? 'cpu' : 'human', skill: p.skill || 'normal',
        hand: [], laid: { rainbow: null, core: null, legend: null }, skips: 0, known: [],
      })),
      draw: [], discard: [], turn: 0, turnNo: 0, phase: 'draw',
      weatherPlayed: false, took: null, pending: null, winner: null, nextId: 1,
    };
    for (let set = 0; set < s.sets; set++) {
      C.ORDER.forEach(t => {
        if (!inDeck(rules, t)) return;
        for (let k = 0; k < C.TYPES[t].copies; k++) s.draw.push({ id: 'c' + s.nextId++, t });
      });
    }
    shuffle(s, s.draw);
    const ev = [{ t: 'start', players: n, sets: s.sets }];
    for (let r = 0; r < DEAL; r++) s.players.forEach(P => P.hand.push(s.draw.pop()));
    ev.push({ t: 'deal', each: DEAL });
    if (rules.draw !== 'pass') {
      const flip = s.draw.pop();
      s.discard.push(flip);
      ev.push({ t: 'flip', card: flip });
    }
    s.turn = Number.isInteger(config.first) && config.first >= 0 && config.first < n ? config.first : 0;
    s.turnNo = 0;
    beginTurn(s, ev);
    return { state: s, events: ev };
  }

  /* ── small queries ──────────────────────────────────────────────────────── */
  const types = cards => cards.map(C.typeOf);
  const has = (hand, t) => hand.some(c => c.t === t);
  const count = (hand, t) => hand.reduce((k, c) => k + (c.t === t ? 1 : 0), 0);
  const next = (s, p) => (p + 1) % s.players.length;
  const top = s => s.discard[s.discard.length - 1] || null;

  /** {have, missing, wilds, need}: need = colors still missing after Wilds fill gaps. */
  function rainbowProgress(cardsOrTypes) {
    const ts = cardsOrTypes.map(C.typeOf);
    const have = C.COLORS.filter(c => ts.includes(c));
    const missing = C.COLORS.filter(c => !ts.includes(c));
    const wilds = ts.filter(t => t === 'wild').length;
    return { have, missing, wilds, need: Math.max(0, missing.length - wilds) };
  }
  const canRainbow = cards => rainbowProgress(cards).need === 0;

  /** Has this player played everything the win needs? (Rainbow, plus Sun & Rain when it's in the game.) */
  function requiredDone(s, p) {
    const L = s.players[p].laid;
    return !!L.rainbow && (!!L.core || !s.rules.core);
  }
  /** Legends never die: Day never, Night only as the last card of a winning hand. */
  function discardable(s, p, t) {
    const P = s.players[p];
    if (t === 'day') return false;
    if (t === 'night') return P.hand.length === 1 && requiredDone(s, p);
    return true;
  }
  function stormNames(rules) {
    return C.ORDER.filter(t => C.TYPES[t].cls !== 'weather' && inDeck(rules, t));
  }
  const canDrawFromPile = s => s.draw.length > 0 || s.discard.length > 1;

  /* ── moves ──────────────────────────────────────────────────────────────── */
  function key(m) {
    switch (m.type) {
      case 'steal': return 'steal:' + m.from;
      case 'combo': return 'combo:' + m.combo;
      case 'discard': return 'discard:' + m.card;
      case 'pass': return 'pass:' + m.card;
      case 'weather': {
        let k = 'weather:' + m.card;
        if (m.target !== undefined) k += ':' + m.target;
        if (m.name !== undefined) k += ':' + m.name;
        if (m.give !== undefined) k += ':' + m.give;
        return k;
      }
      default: return m.type;
    }
  }
  const mv = m => (m.key = key(m), m);

  function legalMoves(s) {
    if (s.phase === 'over') return [];
    if (s.pending) return [mv({ type: 'block' }), mv({ type: 'allow' })];
    const p = s.turn, P = s.players[p], hand = P.hand, out = [];
    const others = s.players.map((_, q) => q).filter(q => q !== p);
    if (s.phase === 'draw') {
      if (canDrawFromPile(s)) out.push(mv({ type: 'draw' }));
      const tp = top(s);
      if (s.rules.draw === 'discard' && tp && !C.isWeather(tp)) out.push(mv({ type: 'take' }));
      if (s.rules.draw === 'player') {
        others.forEach(q => { if (s.players[q].hand.length) out.push(mv({ type: 'steal', from: q })); });
      }
      return out;
    }
    const distinct = C.group(hand).map(g => g.t);
    const passing = s.rules.draw === 'pass';
    const discards = distinct.filter(t => discardable(s, p, t)).map(t => mv({ type: passing ? 'pass' : 'discard', card: t }));
    if (s.phase === 'discard' || s.phase === 'pass') return discards.length ? discards : [mv({ type: 'end' })];
    // phase 'play'
    if (!P.laid.rainbow && canRainbow(hand)) out.push(mv({ type: 'combo', combo: 'rainbow' }));
    if (s.rules.core && !P.laid.core && has(hand, 'sun') && has(hand, 'rain')) out.push(mv({ type: 'combo', combo: 'core' }));
    if (s.rules.legend && !P.laid.legend && has(hand, 'day') && has(hand, 'night')) out.push(mv({ type: 'combo', combo: 'legend' }));
    if (!s.weatherPlayed) {
      distinct.forEach(w => {
        if (C.TYPES[w].cls !== 'weather' || w === 'cloud' || !s.rules.weather[w]) return;
        if (w === 'double') out.push(mv({ type: 'weather', card: w }));
        if (w === 'fog') others.forEach(q => out.push(mv({ type: 'weather', card: w, target: q })));
        if (w === 'storm') stormNames(s.rules).forEach(name => out.push(mv({ type: 'weather', card: w, name })));
        if (w === 'wind') {
          // What could be given once the Wind card itself has left the hand.
          const rest = hand.slice(); rest.splice(rest.findIndex(c => c.t === 'wind'), 1);
          const gifts = C.group(rest).map(g => g.t);
          others.forEach(q => {
            if (!s.players[q].hand.length) return;
            gifts.forEach(give => out.push(mv({ type: 'weather', card: w, target: q, give })));
          });
        }
      });
    }
    out.push(...discards);
    if (hand.length <= HAND_LIMIT && (!passing || !hand.length)) out.push(mv({ type: 'end' }));
    return out;
  }

  /** { kind, p, moves, pending? }. kind: draw | play | discard | pass | block | over */
  function getDecision(s) {
    if (s.phase === 'over') return { kind: 'over', p: s.winner ? s.winner.p : -1, moves: [] };
    const moves = legalMoves(s);
    if (s.pending) {
      const pd = s.pending;
      return { kind: 'block', p: pd.queue[pd.i], moves, pending: { actor: pd.actor, move: pd.move, blocks: pd.blocks, lastBlocker: pd.lastBlocker } };
    }
    return { kind: s.phase, p: s.turn, moves };
  }

  /* ── applying moves ─────────────────────────────────────────────────────── */
  function applyMove(s, move) {
    const k = typeof move === 'string' ? move : key(move);
    const legal = legalMoves(s).find(m => m.key === k);
    if (!legal) throw new Error('Illegal move: ' + k);
    const ev = [];
    const p = s.pending ? s.pending.queue[s.pending.i] : s.turn;
    switch (legal.type) {
      case 'draw': doDraw(s, p, ev); break;
      case 'take': doTake(s, p, ev); break;
      case 'steal': doSteal(s, p, legal.from, ev); break;
      case 'combo': doCombo(s, p, legal.combo, ev); break;
      case 'weather': doWeather(s, p, legal, ev); break;
      case 'discard': doDiscard(s, p, legal.card, ev); break;
      case 'pass': doPass(s, p, legal.card, ev); break;
      case 'end': endTurn(s, ev); break;
      case 'block': doBlock(s, p, ev); break;
      case 'allow': doAllow(s, p, ev); break;
    }
    return ev;
  }

  /** One card off the draw pile, reshuffling the discard pile (all but its top card) if it's empty. */
  function drawOne(s, ev) {
    if (!s.draw.length && s.discard.length > 1) {
      const keep = s.discard.pop();
      s.draw = shuffle(s, s.discard);
      s.discard = [keep];
      ev.push({ t: 'reshuffle', n: s.draw.length });
    }
    return s.draw.pop() || null;
  }
  function forget(P, t) { const i = P.known.indexOf(t); if (i >= 0) P.known.splice(i, 1); }
  function takeFromHand(P, t) {
    const i = P.hand.findIndex(c => c.t === t);
    if (i < 0) return null;
    forget(P, t);
    return P.hand.splice(i, 1)[0];
  }

  function doDraw(s, p, ev) {
    const card = drawOne(s, ev);
    if (card) { s.players[p].hand.push(card); ev.push({ t: 'draw', p, card }); }
    else ev.push({ t: 'nodraw', p });
    s.phase = 'play';
  }
  function doTake(s, p, ev) {
    const card = s.discard.pop();
    s.players[p].hand.push(card);
    s.players[p].known.push(card.t);
    s.took = card.t;
    ev.push({ t: 'take', p, card });
    s.phase = 'play';
  }
  function doSteal(s, p, from, ev) {
    const V = s.players[from];
    const card = V.hand.splice(Math.floor(rand(s) * V.hand.length), 1)[0];
    forget(V, card.t);
    s.players[p].hand.push(card);
    ev.push({ t: 'steal', p, from, card });
    const rep = drawOne(s, ev);
    if (rep) { V.hand.push(rep); ev.push({ t: 'replace', p: from, card: rep }); }
    s.phase = 'play';
  }

  function doCombo(s, p, combo, ev) {
    const P = s.players[p];
    let cards;
    if (combo === 'rainbow') {
      // Real colors first; Wilds only fill the gaps. Leftover colors are equally spare.
      cards = C.COLORS.map(col => takeFromHand(P, col) || takeFromHand(P, 'wild'));
    } else if (combo === 'core') cards = [takeFromHand(P, 'sun'), takeFromHand(P, 'rain')];
    else cards = [takeFromHand(P, 'day'), takeFromHand(P, 'night')];
    P.laid[combo] = cards;
    ev.push({ t: 'combo', p, combo, cards });
    checkWin(s, p, ev, 'combo');
  }

  function doWeather(s, p, m, ev) {
    const P = s.players[p];
    const card = takeFromHand(P, m.card);
    s.discard.push(card);
    s.weatherPlayed = true;
    const play = { type: 'weather', card: m.card, target: m.target, name: m.name, give: m.give, key: m.key };
    ev.push({ t: 'weather', p, card: m.card, target: m.target, name: m.name, give: m.give });
    const queue = s.rules.weather.cloud ? blockersAfter(s, p, [p]) : [];
    if (queue.length) {
      s.pending = { actor: p, move: play, queue, i: 0, blocks: 0, lastBlocker: null };
      return;
    }
    resolveWeather(s, p, play, ev);
    // A weather card can be the last card in a hand that has every combo played.
    checkWin(s, p, ev, 'weather');
  }
  /** Players holding a Cloud Block, in turn order after `from`, excluding `skip`. */
  function blockersAfter(s, from, skip) {
    const out = [];
    for (let q = next(s, from); q !== from; q = next(s, q)) {
      if (!skip.includes(q) && has(s.players[q].hand, 'cloud')) out.push(q);
    }
    return out;
  }
  function doAllow(s, p, ev) {
    const pd = s.pending;
    pd.i++;
    if (pd.i >= pd.queue.length) finishPending(s, ev);
  }
  function doBlock(s, p, ev) {
    const pd = s.pending;
    const B = s.players[p];
    const cloud = takeFromHand(B, 'cloud');
    s.discard.push(cloud);
    // The first Cloud blocks the weather card; in a chain, each later one blocks the Cloud before it.
    const against = pd.blocks === 0 ? pd.actor : pd.lastBlocker;
    pd.blocks++;
    pd.lastBlocker = p;
    ev.push({ t: 'block', p, against, card: pd.move.card, blocks: pd.blocks });
    // A blocker who just played their last card may have won (R4).
    if (checkWin(s, p, ev, 'block')) { s.pending = null; return; }
    if (s.rules.blockChains) {
      const queue = blockersAfter(s, p, [p]);
      if (queue.length) { pd.queue = queue; pd.i = 0; return; }
    }
    finishPending(s, ev);
  }
  function finishPending(s, ev) {
    const pd = s.pending;
    s.pending = null;
    if (pd.blocks % 2 === 1) ev.push({ t: 'blocked', p: pd.actor, card: pd.move.card });
    else resolveWeather(s, pd.actor, pd.move, ev);
    if (s.phase !== 'over') checkWin(s, pd.actor, ev, 'weather');
  }

  function resolveWeather(s, p, m, ev) {
    const P = s.players[p];
    if (m.card === 'double') {
      const cards = [];
      for (let k = 0; k < 2; k++) { const c = drawOne(s, ev); if (c) { P.hand.push(c); cards.push(c); } }
      ev.push({ t: 'double', p, cards });
    } else if (m.card === 'fog') {
      const T = s.players[m.target];
      T.skips = s.rules.fogStacks ? T.skips + 1 : Math.max(1, T.skips);
      ev.push({ t: 'fog', p, target: m.target, skips: T.skips });
    } else if (m.card === 'storm') {
      const lost = [];
      s.players.forEach((Q, q) => {
        const gone = Q.hand.filter(c => c.t === m.name);
        if (!gone.length) return;
        Q.hand = Q.hand.filter(c => c.t !== m.name);
        Q.known = Q.known.filter(t => t !== m.name);
        s.draw.push(...gone);
        lost.push({ p: q, n: gone.length });
      });
      const fromPile = s.discard.filter(c => c.t === m.name);
      s.discard = s.discard.filter(c => c.t !== m.name);
      s.draw.push(...fromPile);
      shuffle(s, s.draw);
      ev.push({ t: 'storm', p, name: m.name, lost, fromDiscard: fromPile.length });
      // Removing a blocking Legend or excess cards can complete a win, actor first.
      for (let q = p, k = 0; k < s.players.length; k++, q = next(s, q)) {
        if (checkWin(s, q, ev, 'storm')) break;
      }
    } else if (m.card === 'wind') {
      const T = s.players[m.target];
      let took = null, gave = null;
      if (T.hand.length) {
        took = T.hand.splice(Math.floor(rand(s) * T.hand.length), 1)[0];
        forget(T, took.t);
      }
      gave = takeFromHand(P, m.give);
      if (took) P.hand.push(took);
      if (gave) T.hand.push(gave);
      ev.push({ t: 'wind', p, target: m.target, gave, took });
      // Trading away a Legend can complete either player's win.
      if (!checkWin(s, p, ev, 'wind')) checkWin(s, m.target, ev, 'wind');
    }
  }

  function doDiscard(s, p, t, ev) {
    const P = s.players[p];
    const card = takeFromHand(P, t);
    s.discard.push(card);
    ev.push({ t: 'discard', p, card });
    if (checkWin(s, p, ev, t === 'night' ? 'night' : 'discard')) return;
    if (P.hand.length > HAND_LIMIT) { s.phase = 'discard'; return; }
    endTurn(s, ev);
  }

  function doPass(s, p, t, ev) {
    const card = takeFromHand(s.players[p], t);
    const target = next(s, p); // Turn order runs to the right, including last seat -> first.
    s.players[target].hand.push(card);
    ev.push({ t: 'pass', p, target, card });
    if (checkWin(s, p, ev, 'pass')) return;
    if (s.players[p].hand.length > HAND_LIMIT) { s.phase = 'pass'; return; }
    endTurn(s, ev);
  }

  function endTurn(s, ev) {
    if (checkWin(s, s.turn, ev, 'end')) return;
    ev.push({ t: 'end', p: s.turn });
    s.turn = next(s, s.turn);
    beginTurn(s, ev);
  }
  function beginTurn(s, ev) {
    // Fogged players lose their turn. Every pass removes one skip, so this always ends.
    for (let guard = 0; s.players[s.turn].skips > 0 && guard < 1000; guard++) {
      s.players[s.turn].skips--;
      ev.push({ t: 'skipped', p: s.turn, left: s.players[s.turn].skips });
      s.turn = next(s, s.turn);
    }
    s.turnNo++;
    s.phase = 'draw';
    s.weatherPlayed = false;
    s.took = null;
    ev.push({ t: 'turn', p: s.turn, n: s.turnNo });
    if (!legalMoves(s).length) {
      // Nothing to draw anywhere (every card is in a hand or played): straight to play.
      ev.push({ t: 'nodraw', p: s.turn });
      s.phase = 'play';
    }
  }

  function checkWin(s, p, ev, how) {
    if (s.phase === 'over') return true;
    const P = s.players[p];
    if (!requiredDone(s, p)) return false;
    if (s.rules.emptyHand !== false ? P.hand.length > 0
      : P.hand.length > HAND_LIMIT || P.hand.some(c => C.isLegend(c))) return false;
    s.phase = 'over';
    s.pending = null;
    s.winner = { p, how, legend: !!P.laid.legend };
    ev.push({ t: 'win', p, how, legend: !!P.laid.legend });
    return true;
  }

  /* ── what one seat may know ─────────────────────────────────────────────── */
  /** Everything a player at the table could know: their own hand, the face-up piles,
   *  hand counts, played combos, skips, and cards seen taken from the discard pile. */
  function viewFor(s, p) {
    const pd = s.pending;
    return {
      me: p, rules: s.rules, phase: s.phase, turn: s.turn, turnNo: s.turnNo, weatherPlayed: s.weatherPlayed,
      took: s.turn === p ? s.took : null,
      hand: types(s.players[p].hand),
      players: s.players.map((Q, q) => ({
        name: Q.name, kind: Q.kind, count: Q.hand.length, skips: Q.skips, known: Q.known.slice(),
        laid: { rainbow: !!Q.laid.rainbow, core: !!Q.laid.core, legend: !!Q.laid.legend },
        done: requiredDone(s, q),
      })),
      discardTop: top(s) ? top(s).t : null,
      discardPile: types(s.discard),
      discardCount: s.discard.length,
      drawCount: s.draw.length,
      pending: pd ? {
        actor: pd.actor, blocks: pd.blocks, card: pd.move.card, target: pd.move.target, name: pd.move.name,
        give: pd.actor === p ? pd.move.give : undefined,
      } : null,
      winner: s.winner ? { ...s.winner } : null,
    };
  }

  return {
    HAND_LIMIT, createGame, getDecision, legalMoves, applyMove, viewFor, key,
    resolveRules, setsFor, rainbowProgress, canRainbow, requiredDone, discardable, stormNames, inDeck,
    PRESETS, rand,
  };
});
