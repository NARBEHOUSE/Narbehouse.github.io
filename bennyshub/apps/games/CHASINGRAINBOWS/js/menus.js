/** Chasing Rainbows - the turn menus.
 *
 *  Pure: decision + view in, a menu tree out. The screen renders it into the choice bar and
 *  scans it with the hub's choice scanner; nothing here touches the DOM.
 *
 *  Every item has a stable id (the move's own key where it has one), so a redraw keeps the
 *  highlight on the same choice. An item with `children` is a row: the scanner steps into
 *  it with enterGroup({wrap:true, backStop:true}) - it loops through a spoken Back stop and
 *  never leaves by itself. Only legal moves ever appear, Look is always there, and Pause is
 *  always last (ACCESSIBILITY.md §12: never between the player and their move).
 *
 *  item = { id, kind: move|group|look|pause|ready, label, say, full?, icon?, card?, move?,
 *           note?, children?, star?, explain? }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./engine.js'));
  else root.CRMenus = factory(root.CRCards, root.CREngine);
})(typeof window === 'undefined' ? globalThis : window, function (C, E) {
  'use strict';

  const N = t => C.TYPES[t].name;
  const S = t => C.sayName(t);
  const count = (hand, t) => hand.reduce((k, x) => k + (x === t ? 1 : 0), 0);
  const ICON = { rainbow: '🌈', core: '🌦️', legend: '🌗', double: '🌈', fog: '🌫️', storm: '⛈️', wind: '🌬️', cloud: '☁️' };

  function look() {
    return {
      id: 'look', kind: 'group', label: 'Look', icon: '👀', say: 'Look',
      children: [
        { id: 'look:hand', kind: 'look', label: 'My hand', icon: '🃏', say: 'My hand' },
        { id: 'look:rainbow', kind: 'look', label: 'My rainbow', icon: '🌈', say: 'My rainbow' },
        { id: 'look:players', kind: 'look', label: 'Players', icon: '👥', say: 'Players' },
        { id: 'look:piles', kind: 'look', label: 'Piles', icon: '🂠', say: 'Piles' },
        { id: 'look:recent', kind: 'look', label: 'What just happened', icon: '🔁', say: 'What just happened' },
      ],
    };
  }
  const pause = () => ({ id: 'pause', kind: 'pause', label: 'Pause', icon: '⏸️', say: 'Pause' });
  const leaf = (m, label, say, extra) => Object.assign({ id: m.key, kind: 'move', move: m.key, label, say, full: say }, extra || {});

  /** Opponent row label and speech: "Misty", "Misty, 5 cards, played a Rainbow". */
  function seat(view, ctx, q) {
    const P = view.players[q];
    const laid = [P.laid.rainbow && 'Rainbow', P.laid.core && 'Sun and Rain'].filter(Boolean);
    const note = P.count + (P.count === 1 ? ' card' : ' cards') + (laid.length ? ' · ' + laid.join(', ') : '');
    return { name: ctx.names[q], note, say: ctx.names[q] + ', ' + note.replace(' · ', ', played ') };
  }

  function drawMenu(d, view, ctx) {
    const out = [];
    d.moves.forEach(m => {
      if (m.type === 'draw') out.push(leaf(m, 'Draw a card', 'Draw a card', { icon: '🂠' }));
      if (m.type === 'take') out.push(leaf(m, 'Take ' + N(view.discardTop), 'Take ' + S(view.discardTop), { card: view.discardTop }));
    });
    const steals = d.moves.filter(m => m.type === 'steal');
    const stealItem = m => { const st = seat(view, ctx, m.from); return leaf(m, 'Take from ' + st.name, 'Take a card from ' + st.name, { icon: '🤲', note: st.note }); };
    if (steals.length && steals.length <= 2) steals.forEach(m => out.push(stealItem(m)));
    if (steals.length > 2) {
      out.push({ id: 'steal', kind: 'group', label: 'Take from a player', icon: '🤲', say: 'Take a card from a player',
        children: steals.map(m => { const st = seat(view, ctx, m.from); return leaf(m, st.name, st.say, { note: st.note, full: 'Take a card from ' + st.name }); }) });
    }
    return out;
  }

  function discardItems(d, view, asRoot) {
    const done = view.players[view.me].done;
    return d.moves.filter(m => m.type === 'discard').map(m => {
      const n = count(view.hand, m.card), wins = done && view.hand.length === 1;
      if (m.card === 'night' && wins) {
        return leaf(m, 'Night, Night!', 'Night. Say Night, Night, and win!', { card: 'night', full: 'Discard Night and win. Night, Night!' });
      }
      const label = (asRoot ? 'Discard ' : '') + N(m.card) + (n > 1 ? ' ×' + n : '');
      const say = (asRoot ? 'Discard ' : '') + S(m.card) + (n > 1 ? ', you have ' + n : '') + (wins ? ', and win!' : '');
      return leaf(m, label, say, { card: m.card, full: 'Discard ' + S(m.card) + (wins ? ' and win' : '') });
    });
  }

  function playMenu(d, view, ctx) {
    const out = [], hand = view.hand;
    const of = (type, card) => d.moves.filter(m => m.type === type && (card === undefined || m.card === card));
    of('combo').forEach(m => {
      const label = { rainbow: 'Play your Rainbow', core: 'Play Sun & Rain', legend: 'Play Day & Night' }[m.combo];
      out.push(leaf(m, label, label.replace('&', 'and'), { icon: ICON[m.combo], cls: 'combo' }));
    });
    // Weather: one item per type held, in card order.
    const dbl = of('weather', 'double')[0];
    if (dbl) out.push(leaf(dbl, 'Double Draw', 'Double Draw', { card: 'double', explain: 'double' }));
    const fogs = of('weather', 'fog');
    if (fogs.length === 1) {
      const st = seat(view, ctx, fogs[0].target);
      out.push(leaf(fogs[0], 'Fog Skip on ' + st.name, 'Fog Skip on ' + st.name, { card: 'fog', explain: 'fog', note: st.note }));
    } else if (fogs.length) {
      out.push({ id: 'weather:fog', kind: 'group', label: 'Fog Skip', say: 'Fog Skip', card: 'fog', explain: 'fog',
        children: fogs.map(m => { const st = seat(view, ctx, m.target); return leaf(m, st.name, st.say, { note: st.note, full: 'Fog Skip on ' + st.name }); }) });
    }
    const storms = of('weather', 'storm');
    if (storms.length) {
      const nameItem = m => {
        const n = count(hand, m.name);
        return leaf(m, N(m.name), S(m.name) + (n ? ', you have ' + n : ''), { card: m.name, note: n ? 'You have ' + n : '', full: 'Storm Shuffle on ' + S(m.name) });
      };
      const groups = [
        { id: 'storm:colors', label: 'Colors', say: 'Colors', icon: '🎨', cls: ['color'] },
        { id: 'storm:core', label: 'Sun & Rain', say: 'Sun and Rain', icon: '🌦️', cls: ['core'] },
        { id: 'storm:legend', label: 'Day & Night', say: 'Day and Night', icon: '🌗', cls: ['legend'] },
      ].map(g => ({ id: g.id, kind: 'group', label: g.label, say: g.say, icon: g.icon,
        children: storms.filter(m => g.cls.includes(C.TYPES[m.name].cls)).map(nameItem) })).filter(g => g.children.length);
      out.push({ id: 'weather:storm', kind: 'group', label: 'Storm Shuffle', say: 'Storm Shuffle', card: 'storm', explain: 'storm',
        children: groups.length === 1 ? groups[0].children : groups });
    }
    const winds = of('weather', 'wind');
    if (winds.length) {
      const targets = [...new Set(winds.map(m => m.target))];
      const gifts = q => winds.filter(m => m.target === q).map(m => {
        const st = seat(view, ctx, q);
        return leaf(m, 'Give ' + N(m.give), 'Give ' + S(m.give), { card: m.give, full: 'Wind Trade with ' + st.name + ', giving ' + S(m.give) });
      });
      out.push({ id: 'weather:wind', kind: 'group', label: 'Wind Trade', say: 'Wind Trade', card: 'wind', explain: 'wind',
        children: targets.length === 1 ? gifts(targets[0])
          : targets.map(q => { const st = seat(view, ctx, q); return { id: 'wind:' + q, kind: 'group', label: st.name, say: st.say, note: st.note, children: gifts(q) }; }) });
    }
    const discards = discardItems(d, view, false);
    const forced = hand.length > E.HAND_LIMIT;
    if (discards.length) {
      const extra = hand.length - E.HAND_LIMIT;
      out.push({ id: 'discard', kind: 'group', icon: '🗑️',
        label: forced ? 'Discard down to 7' : 'Discard a card',
        say: forced ? 'Discard down to 7. ' + extra + (extra === 1 ? ' card to go.' : ' cards to go.') : 'Discard a card',
        children: discards });
    }
    of('end').forEach(m => out.push(leaf(m, 'End turn', 'End turn, keep your cards', { icon: '✋' })));
    return out;
  }

  function blockMenu(d) {
    const yes = d.moves.find(m => m.type === 'block'), no = d.moves.find(m => m.type === 'allow');
    return [
      leaf(yes, 'Block it with Cloud', 'Block it with your Cloud', { card: 'cloud' }),
      leaf(no, 'Let it happen', 'Let it happen', { icon: '👌' }),
    ];
  }

  /** The whole root list for a human decision. opts: { helper: off|tips|shortcut, suggest: move key } */
  function build(d, view, ctx, opts) {
    opts = opts || {};
    let items;
    if (d.kind === 'draw') items = drawMenu(d, view, ctx);
    else if (d.kind === 'play') items = playMenu(d, view, ctx);
    else if (d.kind === 'discard') items = discardItems(d, view, true);
    else if (d.kind === 'block') items = blockMenu(d);
    else items = [];
    if (opts.helper && opts.helper !== 'off' && opts.suggest) {
      const path = find(items, opts.suggest);
      if (path) {
        path.forEach(it => { it.star = true; });
        const target = path[path.length - 1];
        if (opts.helper === 'shortcut' && path.length > 1) {
          items.unshift({ id: 'suggest', kind: 'move', move: target.move, label: target.full || target.label, say: 'Suggested: ' + (target.full || target.say),
            full: target.full, card: target.card, icon: target.icon || '⭐', star: true, cls: 'suggest' });
        }
      }
    }
    items.push(look(), pause());
    return items;
  }
  /** While someone else plays, the player can still Look and Pause. */
  const waiting = () => [look(), pause()];

  /** The path of items leading to the item for a move key, or null. */
  function find(items, moveKey, trail) {
    trail = trail || [];
    for (const it of items) {
      if (it.move === moveKey) return trail.concat(it);
      if (it.children) { const p = find(it.children, moveKey, trail.concat(it)); if (p) return p; }
    }
    return null;
  }
  /** Every move key reachable in a tree (for tests: menus offer exactly the legal moves). */
  function moveKeys(items) {
    const out = [];
    items.forEach(it => { if (it.move && it.id !== 'suggest') out.push(it.move); if (it.children) out.push(...moveKeys(it.children)); });
    return out;
  }

  return { build, waiting, find, moveKeys };
});
