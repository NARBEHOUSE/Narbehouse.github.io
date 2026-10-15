/** Chasing Rainbows - everything the game says, in one place.
 *
 *  Pure: events and views in, sentences out. The same sentence is spoken and shown in the
 *  caption strip, so a player who can't hear and a player who can't read get the same game.
 *
 *  Speech is short (it's read aloud at every scan step) and names cards exactly as printed.
 *  Hidden cards stay hidden: a line about another seat's private card is only produced for
 *  that seat (ctx.viewer). In a shared-screen game the screen keeps the rest for later.
 *
 *  ctx = { names: [..], viewer: seat index whose eyes we speak to (or -1), humans: count }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./engine.js'));
  else root.CRWords = factory(root.CRCards, root.CREngine);
})(typeof window === 'undefined' ? globalThis : window, function (C, E) {
  'use strict';

  const say = t => C.sayName(t);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  /** "you" for the seat we're speaking to, otherwise the seat's name. */
  const who = (ctx, p) => (p === ctx.viewer ? 'you' : ctx.names[p]);
  const Who = (ctx, p) => cap(who(ctx, p));
  const whose = (ctx, p) => (p === ctx.viewer ? 'your' : ctx.names[p] + "'s");
  const turns = n => (n === 1 ? 'turn' : n + ' turns');
  const or = parts => (parts.length < 2 ? C.list(parts) : parts.slice(0, -1).join(', ') + ' or ' + parts[parts.length - 1]);
  const lower = name => name.toLowerCase();

  /** One event -> { say, caption, private } or null (silent). private: only for ctx.viewer's eyes. */
  function describe(ev, ctx) {
    const me = ev.p === ctx.viewer;
    switch (ev.t) {
      case 'deal': return line('Dealing ' + ev.each + ' cards to everyone.');
      case 'flip': return line('The discard pile starts with ' + say(ev.card) + '.');
      case 'turn': return line(me ? 'Your turn.' : whose(ctx, ev.p).replace(/^./, c => c.toUpperCase()) + ' turn.');
      case 'skipped': return line(me ? 'Fog! You miss this turn.' : ctx.names[ev.p] + ' is lost in the fog and misses a turn.');
      case 'draw': return me ? line('You drew ' + say(ev.card) + '.', true) : line(ctx.names[ev.p] + ' draws a card.');
      case 'nodraw': return line('There are no cards left to draw.');
      case 'take': return line(me ? 'You take ' + say(ev.card) + '.' : ctx.names[ev.p] + ' takes ' + say(ev.card) + ' from the discard pile.');
      case 'pass':
        if (me) return line('You give ' + say(ev.card) + ' to ' + ctx.names[ev.target] + ' on your right.', true);
        if (ev.target === ctx.viewer) return line(ctx.names[ev.p] + ' on your left gives you ' + say(ev.card) + '.', true);
        return line(ctx.names[ev.p] + ' gives a card to ' + ctx.names[ev.target] + ' on their right.');
      case 'steal':
        if (me) return line('You took ' + say(ev.card) + ' from ' + ctx.names[ev.from] + '.', true);
        if (ev.from === ctx.viewer) return line(ctx.names[ev.p] + ' took your ' + say(ev.card) + '.', true);
        return line(ctx.names[ev.p] + ' takes a card from ' + who(ctx, ev.from) + '.');
      case 'replace': return me ? line('You draw ' + say(ev.card) + ' to replace it.', true) : null;
      case 'reshuffle': return line('The draw pile ran out, so the discard pile is shuffled into a new one.');
      case 'combo': {
        const what = { rainbow: 'a Rainbow', core: 'Sun and Rain', legend: 'Day and Night' }[ev.combo];
        if (me) return line({ rainbow: 'You played your Rainbow!', core: 'You played Sun and Rain!', legend: 'You played Day and Night! Legends!' }[ev.combo]);
        return line(ctx.names[ev.p] + ' played ' + what + '!');
      }
      case 'weather': {
        const by = Who(ctx, ev.p) + (me ? ' play ' : ' plays ');
        if (ev.card === 'double') return line(by + 'Double Draw.');
        if (ev.card === 'fog') return line(by + 'Fog Skip on ' + who(ctx, ev.target) + '.');
        if (ev.card === 'storm') return line(by + 'Storm Shuffle on ' + say(ev.name) + '.');
        if (ev.card === 'wind') return line(by + 'Wind Trade with ' + who(ctx, ev.target) + '.');
        return null;
      }
      case 'block': {
        const by = ev.p === ctx.viewer ? 'You block it with your Cloud!' : ctx.names[ev.p] + ' blocks it with a Cloud!';
        return line(ev.blocks > 1 ? by.replace('it', 'the block') : by);
      }
      case 'blocked': return line('The ' + C.TYPES[ev.card].name + ' is blocked.');
      case 'double':
        if (me) return line(ev.cards.length ? 'You draw ' + C.list(ev.cards.map(say)) + '.' : 'There was nothing left to draw.', true);
        return line(ctx.names[ev.p] + ' draws ' + (ev.cards.length === 2 ? 'two cards.' : ev.cards.length + ' cards.'));
      case 'fog':
        return line(ev.target === ctx.viewer ? 'You will miss your next ' + turns(ev.skips) + '.' : ctx.names[ev.target] + ' will miss their next ' + turns(ev.skips) + '.');
      case 'storm': {
        const plural = ev.name === 'night' || ev.name === 'day' ? say(ev.name) + ' card' : say(ev.name);
        let s = 'Every ' + plural + ' goes back into the deck.';
        const losses = ev.lost.map(l => (l.p === ctx.viewer ? 'You lose ' : ctx.names[l.p] + ' loses ') + l.n + '.');
        if (losses.length) s += ' ' + losses.join(' ');
        else if (!ev.fromDiscard) s += ' Nobody had one!';
        return line(s);
      }
      case 'wind':
        if (me) return line('You gave ' + (ev.gave ? say(ev.gave) : 'nothing') + (ev.took ? ' and got ' + say(ev.took) : '') + '.', true);
        if (ev.target === ctx.viewer) return line(ctx.names[ev.p] + ' gave you ' + (ev.gave ? say(ev.gave) : 'nothing') + (ev.took ? ' and took your ' + say(ev.took) : '') + '.', true);
        return line(ctx.names[ev.p] + ' and ' + who(ctx, ev.target) + ' trade cards.');
      case 'discard': return line(me ? 'You discard ' + say(ev.card) + '.' : ctx.names[ev.p] + ' discards ' + say(ev.card) + '.');
      case 'win': {
        const legend = ev.legend ? (me ? ' With Day and Night too!' : ' With Day and Night too!') : '';
        if (ev.how === 'night') return line('Night, Night! ' + (me ? 'You win!' : ctx.names[ev.p] + ' wins!') + legend);
        return line(me ? 'You caught the rainbow! You win!' + legend : ctx.names[ev.p] + ' caught the rainbow! ' + ctx.names[ev.p] + ' wins!' + legend);
      }
      default: return null;
    }
  }
  function line(text, priv) { return { say: text, caption: text, private: !!priv }; }

  /** The private version of an event for a seat that wasn't watching (shared-screen games). */
  function privateFor(ev, ctx, p) {
    const d = describe(ev, Object.assign({}, ctx, { viewer: p }));
    return d && d.private ? d.say : null;
  }

  /* ── Look ──────────────────────────────────────────────────────────────── */
  function sayHand(hand) {
    if (!hand.length) return 'Your hand is empty.';
    return (hand.length === 1 ? '1 card: ' : hand.length + ' cards: ') + C.sayGroup(hand) + '.';
  }

  /** "5 of 7 colors plus 1 Wild. Still need 1 of green, indigo or violet." */
  function sayRainbow(view) {
    const me = view.players[view.me], parts = [];
    if (me.laid.rainbow) parts.push('Rainbow played.');
    else {
      const pr = E.rainbowProgress(view.hand);
      let s = 'Rainbow: ' + pr.have.length + ' of 7 colors';
      if (pr.wilds) s += ' plus ' + (pr.wilds === 1 ? '1 Wild' : pr.wilds + ' Wilds');
      s += '.';
      if (!pr.need) s += ' Ready to play!';
      else if (pr.need === pr.missing.length) s += ' Still need ' + C.list(pr.missing.map(lower)) + '.';
      else s += ' Still need ' + pr.need + ' of ' + or(pr.missing.map(lower)) + '.';
      parts.push(s);
    }
    if (view.rules.core) {
      if (me.laid.core) parts.push('Sun and Rain played.');
      else parts.push('Sun: ' + (view.hand.includes('sun') ? 'yes' : 'no') + '. Rain: ' + (view.hand.includes('rain') ? 'yes' : 'no') + '.');
    }
    if (view.rules.legend) {
      if (me.laid.legend) parts.push('Day and Night played.');
      else if (view.hand.includes('day') || view.hand.includes('night')) {
        parts.push('Day: ' + (view.hand.includes('day') ? 'yes' : 'no') + '. Night: ' + (view.hand.includes('night') ? 'yes' : 'no') + '.');
      }
    }
    return parts.join(' ');
  }

  function sayPlayers(view, ctx) {
    return view.players.map((P, q) => {
      if (q === view.me) return null;
      const bits = [ctx.names[q] + ': ' + P.count + (P.count === 1 ? ' card' : ' cards')];
      const laid = [P.laid.rainbow && 'a Rainbow', P.laid.core && 'Sun and Rain', P.laid.legend && 'Day and Night'].filter(Boolean);
      if (laid.length) bits.push('played ' + C.list(laid));
      if (P.skips) bits.push('misses the next ' + turns(P.skips));
      return bits.join(', ') + '.';
    }).filter(Boolean).join(' ');
  }

  function sayPiles(view) {
    if (view.rules.draw === 'pass') return 'Draw pile: ' + view.drawCount +
      (view.drawCount === 1 ? ' card.' : ' cards.') + ' Give unwanted cards to the player on your right.';
    let s = view.discardTop
      ? 'Discard pile: ' + say(view.discardTop) + ' on top' + (C.TYPES[view.discardTop].cls === 'weather' ? ', so it is frozen.' : '.')
      : 'The discard pile is empty.';
    s += ' Draw pile: ' + view.drawCount + (view.drawCount === 1 ? ' card.' : ' cards.');
    return s;
  }

  /** The one-line turn opener: whose turn, and what's on the discard pile. */
  function turnIntro(view, ctx) {
    if (view.rules.draw === 'pass') return 'Your turn. Draw a card, play any ready combos, then give a card to ' +
      ctx.names[(view.me + 1) % view.players.length] + ' on your right.';
    const top = view.discardTop;
    if (!top) return 'Your turn.';
    if (C.TYPES[top].cls === 'weather' && view.rules.draw === 'discard') return 'Your turn. The discard pile is frozen by ' + say(top) + '.';
    if (view.rules.draw === 'discard') return 'Your turn. ' + say(top) + ' is on the discard pile.';
    return 'Your turn.';
  }

  /* ── Helper hints (each spoken once per game) ──────────────────────────── */
  function hints(view) {
    const me = view.players[view.me], out = [];
    if (view.hand.includes('day') && !view.hand.includes('night') && !me.laid.legend && view.rules.legend) {
      out.push({ id: 'day-trap', say: 'Tip: Day can never be discarded. Find Night to play Day and Night, give Day away with Wind Trade, or send it back to the deck with Storm Shuffle.' });
    }
    if (view.hand.includes('night') && !me.laid.legend && view.rules.legend && !view.hand.includes('day')) {
      out.push({ id: 'night', say: 'Tip: play Night with Day, give it away with Wind Trade, or send it back to the deck with Storm Shuffle. Night can only be discarded as your very last card, to win. That is Night, Night!' });
    }
    if (view.rules.core && me.laid.core && !me.laid.rainbow) {
      out.push({ id: 'endgame-rainbow', say: view.rules.emptyHand !== false
        ? 'Tip: you played Sun and Rain. To win, your whole hand, plus one card to discard, must become a rainbow.'
        : 'Tip: you played Sun and Rain. Play your Rainbow to finish your required combos. You do not need an empty hand.' });
    }
    if (me.laid.rainbow && view.rules.core && !me.laid.core) {
      out.push({ id: 'endgame-core', say: view.rules.emptyHand !== false
        ? 'Tip: you played your Rainbow. Now find Sun and Rain, and empty your hand.'
        : 'Tip: you played your Rainbow. Now play Sun and Rain. You do not need an empty hand.' });
    }
    if (me.done && view.hand.length) {
      if (view.rules.emptyHand !== false) out.push({ id: 'endgame-empty', say: 'Tip: all your combos are played. Play weather cards and discard to empty your hand.' });
      else if (view.hand.some(C.isLegend)) out.push({ id: 'endgame-legends', say: 'Tip: your required combos are played, but a Legend is still in your hand. Play Day and Night together, trade it with Wind, or shuffle it away with Storm.' });
      else if (view.hand.length > E.HAND_LIMIT) out.push({ id: 'endgame-limit', say: 'Tip: your combos are played. ' + (view.rules.draw === 'pass' ? 'Give cards to the player on your right' : 'Discard') + ' down to 7 to win.' });
    }
    return out;
  }

  return { describe, privateFor, sayHand, sayRainbow, sayPlayers, sayPiles, turnIntro, hints, who };
});
