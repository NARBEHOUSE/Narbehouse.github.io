/** Chasing Rainbows - the card table.
 *
 *  Screen, top to bottom: the other players' nameplates; the table in the middle (draw pile,
 *  a spotlight where a played card shows big, the discard pile, and every combo anyone has
 *  played, laid out as real cards); your Rainbow Tracker and your hand; your turn choices
 *  in the bar under your hand (app.js). The middle of the screen is only ever cards.
 *
 *  Draws from a CRDisplay mirror (display.js), never from the engine directly, so the table
 *  changes one narrated event at a time. Elements are keyed and updated in place - a hand
 *  card or a seat keeps its element while it exists - because the scanner holds references
 *  to them when a row (Discard a card, Fog Skip on...) puts the highlight on the table itself.
 *
 *  Hidden cards stay hidden: only the viewer's hand is face up (all hands with Open Hands),
 *  and a cover screen hides even that between people sharing the switch.
 */
window.CRTable = (function () {
  'use strict';
  const C = window.CRCards;
  const $ = id => document.getElementById(id);
  const AVATAR = { Sunny: '☀️', Misty: '🌫️', Breezy: '🍃', Drizzle: '🌦️', Thunder: '⛈️' };
  const PLAYER_COLORS = ['#ff5a7a', '#ffa23a', '#ffe14d', '#8fe05a', '#4cc9f5', '#b48cff'];
  const LETTERS = { red: 'R', orange: 'O', yellow: 'Y', green: 'G', blue: 'B', indigo: 'I', violet: 'V' };
  const art = t => 'img/cards/' + (t || 'back') + '.webp';
  const pc = p => PLAYER_COLORS[p % PLAYER_COLORS.length];

  let motion = 'full';
  const seats = new Map(), hand = new Map(), melds = new Map();
  let last = null, opts = {}, tagText = '';
  let prevHand = null, prevViewer = -2;            // for the NEW tag on cards just picked up
  const FOIL = { wild: 'foil-rainbow', day: 'foil-silver', night: 'foil-silver' };

  function init() {
    $('table').innerHTML =
      '<div id="felt">' +
      '  <div class="rim" aria-hidden="true"></div><div class="sheen" aria-hidden="true"></div>' +
      '  <div id="turnTag" class="turntag" aria-hidden="true"></div>' +
      '  <div id="piles">' +
      '    <div class="pile" id="pileDraw"><div class="stack"><i></i><i></i><i></i><img alt="Draw pile" src="' + art() + '"></div>' +
      '      <b class="count"></b><span class="lbl">Draw</span></div>' +
      '    <div id="spot" class="spot" aria-hidden="true"><div class="halo"></div><div class="spotcard"></div><b class="spotlbl"></b></div>' +
      '    <div class="pile" id="pileDiscard"><div class="slot"></div><b class="frozen" hidden>❄ Frozen</b><span class="lbl">Discard</span></div>' +
      '  </div>' +
      '  <div id="melds" aria-label="Played combos"></div>' +
      '</div>';
  }

  function setMotion(level) { motion = level; document.body.dataset.motion = level; }

  /* ── cards ──────────────────────────────────────────────────────────────── */
  function cardImg(t, faceUp) {
    const img = document.createElement('img');
    img.className = 'cardface';
    img.draggable = false;
    img.src = art(faceUp ? t : null);
    img.alt = faceUp ? C.TYPES[t].name : 'Card';
    return img;
  }

  /* ── seats: the other players' nameplates ───────────────────────────────── */
  function seatOrder(n, viewer) {
    const out = [];
    for (let k = 1; k <= n; k++) { const q = ((viewer < 0 ? -1 : viewer) + k + n) % n; if (q !== viewer) out.push(q); }
    return out;
  }
  function avatar(o, p) { return o.kinds[p] === 'cpu' ? (AVATAR[o.names[p]] || '🌤️') : '🙂'; }
  function renderSeats(d, o) {
    const box = $('seats');
    const order = seatOrder(d.hands.length, o.viewer);
    for (const [p, el] of seats) if (!order.includes(p)) { el.remove(); seats.delete(p); }
    order.forEach((p, i) => {
      let el = seats.get(p);
      if (!el) {
        el = document.createElement('div');
        el.className = 'seat';
        el.dataset.p = p;
        el.innerHTML = '<div class="avatar"><span></span></div><div class="info"><b class="nm"></b><span class="ct"></span></div>' +
          '<div class="badges"></div><div class="fan"></div><div class="fogged"></div>' +
          '<i class="dots" aria-hidden="true"><b></b><b></b><b></b></i>';
        seats.set(p, el);
      }
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
      const n = d.hands[p].length;
      el.style.setProperty('--pc', pc(p));
      el.querySelector('.avatar span').textContent = avatar(o, p);
      el.querySelector('.nm').textContent = o.names[p];
      el.querySelector('.ct').textContent = n + (n === 1 ? ' card' : ' cards');
      const fan = el.querySelector('.fan');
      const show = Math.min(n, 9), faceUp = !!o.openHands;
      const types = C.sortHand(d.hands[p]);
      const sig = show + '|' + faceUp + '|' + (faceUp ? types.join() : '');
      if (fan.dataset.sig !== sig) {
        fan.innerHTML = '';
        for (let k = 0; k < show; k++) {
          const img = cardImg(types[k], faceUp);
          img.style.setProperty('--k', k - (show - 1) / 2);
          fan.appendChild(img);
        }
        fan.dataset.sig = sig;
      }
      el.querySelector('.badges').innerHTML = badges(d.laid[p], o.rules);
      el.classList.toggle('active', d.turn === p && d.winner === null);
      el.classList.toggle('skipping', d.skips[p] > 0);
      el.querySelector('.fogged').textContent = d.skips[p] > 1 ? '🌫️ Skips ' + d.skips[p] + ' turns' : '🌫️ Skips next turn';
      el.classList.toggle('winner', d.winner === p);
    });
  }
  function badges(L, rules) {
    const b = ['<span class="badge' + (L.rainbow ? ' on' : '') + '" title="Rainbow">🌈</span>'];
    if (rules.core) b.push('<span class="badge' + (L.core ? ' on' : '') + '" title="Sun and Rain">🌦️</span>');
    if (rules.legend && L.legend) b.push('<span class="badge on" title="Day and Night">🌗</span>');
    return b.join('');
  }

  /* ── the middle: piles, spotlight, played combos ────────────────────────── */
  const TILT = [-9, 6, -3, 0];
  function renderPiles(d, o) {
    const draw = $('pileDraw');
    draw.classList.toggle('inviting', !!o.inviteDraw);
    draw.querySelector('.count').textContent = d.draw;
    draw.classList.toggle('empty', d.draw === 0);
    draw.style.setProperty('--depth', Math.min(3, Math.ceil(d.draw / 12)));
    const disc = $('pileDiscard'), slot = disc.querySelector('.slot');
    // The top three discards, fanned a little, so the pile has depth.
    disc.hidden = o.rules.draw === 'pass';
    const tail = d.discard.slice(-3);
    const sig = tail.join() + '|' + d.discard.length;
    if (slot.dataset.sig !== sig) {
      slot.innerHTML = '';
      tail.forEach((t, i) => {
        const img = cardImg(t, true);
        const fromTop = tail.length - 1 - i;
        img.classList.add(fromTop === 0 ? 'top' : 'under');
        img.style.setProperty('--tilt', (fromTop === 0 ? 0 : TILT[(d.discard.length - fromTop) % 3]) + 'deg');
        slot.appendChild(img);
      });
      slot.dataset.sig = sig;
    }
    const top = d.discard[d.discard.length - 1] || null;
    const frozen = !!top && C.TYPES[top].cls === 'weather' && o.rules.draw === 'discard';
    disc.querySelector('.frozen').hidden = !frozen;
    disc.classList.toggle('frozen', frozen);
    disc.classList.toggle('empty', !top);
  }

  function renderMelds(d, o) {
    const box = $('melds');
    const order = [];
    d.laid.forEach((L, p) => { if (L.rainbow || L.core || L.legend) order.push(p); });
    for (const [p, el] of melds) if (!order.includes(p)) { el.remove(); melds.delete(p); }
    order.forEach((p, i) => {
      let el = melds.get(p);
      if (!el) {
        el = document.createElement('div');
        el.className = 'meld';
        el.innerHTML = '<b class="mname"></b><div class="mrow"></div>';
        melds.set(p, el);
      }
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
      el.style.setProperty('--pc', pc(p));
      el.querySelector('.mname').textContent = p === o.viewer && o.names[p] === 'You' ? 'You' : o.names[p];
      const L = d.laid[p];
      const sig = [L.rainbow, L.core, L.legend].map(x => (x ? x.join() : '')).join('|');
      if (el.dataset.sig === sig) return;
      el.dataset.sig = sig;
      const row = el.querySelector('.mrow');
      row.innerHTML = '';
      const group = (cards, cls) => {
        const g = document.createElement('div');
        g.className = 'mgroup ' + cls;
        cards.forEach((t, k) => {
          const img = cardImg(t, true);
          img.style.setProperty('--k', k - (cards.length - 1) / 2);
          g.appendChild(img);
        });
        row.appendChild(g);
        if (motion !== 'off') { g.classList.add('arrive'); setTimeout(() => g.classList.remove('arrive'), 700); }
      };
      if (L.rainbow) group(L.rainbow, 'bowfan');
      if (L.core) group(L.core, 'pair');
      if (L.legend) group(L.legend, 'pair');
    });
    box.classList.toggle('empty', !order.length);
  }

  function renderTag(d, o) {
    let text = '', color = '#fff';
    if (d.winner !== null && d.winner !== undefined) { text = (d.winner === o.viewer && o.names[d.winner] === 'You' ? 'You win!' : o.names[d.winner] + ' wins!'); color = pc(d.winner); }
    else if (d.turn >= 0) { text = d.turn === o.viewer ? 'Your turn' : o.names[d.turn] + (o.names[d.turn] === 'You' ? 'r turn' : '’s turn'); color = pc(d.turn); }
    const tag = $('turnTag');
    tag.style.setProperty('--pc', color);
    if (text === tagText) return;
    tagText = text;
    tag.textContent = text;
    tag.classList.toggle('on', !!text);
    tag.classList.remove('swap'); void tag.offsetWidth; tag.classList.add('swap');
  }

  /* ── mine: the Rainbow Tracker ──────────────────────────────────────────── */
  function renderMine(d, o) {
    const mine = $('mine'), v = o.viewer;
    if (v < 0) { mine.classList.add('nobody'); mine.innerHTML = ''; mine.dataset.sig = ''; return; }
    mine.classList.remove('nobody');
    mine.style.setProperty('--pc', pc(v));
    mine.classList.toggle('active', d.turn === v && d.winner === null);
    const h = o.hideHand ? [] : d.hands[v], L = d.laid[v];
    const hasT = t => h.includes(t);
    let wilds = h.filter(t => t === 'wild').length;
    const chips = C.COLORS.map(c => {
      let st = 'need';
      if (L.rainbow) st = 'played'; else if (hasT(c)) st = 'have'; else if (wilds > 0) { st = 'wild'; wilds--; }
      const mark = st === 'have' || st === 'played' ? '✓' : st === 'wild' ? '★' : '';
      return '<span class="chip c-' + c + ' ' + st + '" title="' + C.TYPES[c].name + '"><b>' + LETTERS[c] + '</b><i>' + mark + '</i></span>';
    }).join('');
    let html = '<div class="who"><span class="avatar">🙂</span><b>' + esc(o.names[v]) + '</b>' +
      (d.skips[v] ? '<span class="fogchip">🌫️ Skips next turn</span>' : '') + '</div>';
    const have = L.rainbow ? 7 : Math.min(7, C.COLORS.filter(hasT).length + h.filter(t => t === 'wild').length);
    const pill = L.rainbow ? '<span class="prog done">Played ✓</span>' : have >= 7 ? '<span class="prog ready">Ready!</span>' :
      '<span class="prog" style="--f:' + (have / 7).toFixed(3) + '"><b>' + have + '</b>/7</span>';
    html += '<div class="bow' + (L.rainbow ? ' done' : '') + '">' + chips + pill + '</div>';
    let duo = '';
    if (o.rules.core) duo += duoChip('sun', '☀️', L.core, hasT('sun')) + duoChip('rain', '🌧️', L.core, hasT('rain'));
    if (o.rules.legend && (L.legend || hasT('day') || hasT('night'))) duo += duoChip('day', '🌅', L.legend, hasT('day')) + duoChip('night', '🌙', L.legend, hasT('night'));
    if (duo) html += '<div class="duo">' + duo + '</div>';
    if (mine.dataset.sig !== html) { mine.innerHTML = html; mine.dataset.sig = html; }
  }
  function duoChip(t, icon, played, have) {
    const st = played ? 'played' : have ? 'have' : 'need';
    return '<span class="chip duo-' + t + ' ' + st + '"><b>' + icon + '</b><span>' + C.TYPES[t].name + '</span><i>' + (st === 'need' ? '' : '✓') + '</i></span>';
  }

  /* ── the hand ───────────────────────────────────────────────────────────── */
  function renderHand(d, o) {
    const box = $('hand'), v = o.viewer;
    const cards = v < 0 ? [] : d.hands[v];
    const hidden = o.hideHand || v < 0;
    const groups = hidden ? (cards.length ? [{ t: 'hidden', n: cards.length }] : []) : C.group(cards);
    const keys = groups.map(g => g.t);
    for (const [t, el] of hand) if (!keys.includes(t)) { el.remove(); hand.delete(t); }
    // Cards just picked up wear a NEW tag for a moment (not on the deal, or when hands change).
    const counts = {};
    groups.forEach(g => { counts[g.t] = g.n; });
    const tagNew = !hidden && prevViewer === v && prevHand && Object.keys(prevHand).length > 0;
    groups.forEach((g, i) => {
      let el = hand.get(g.t);
      if (!el) {
        el = document.createElement('div');
        el.className = 'hcard';
        el.dataset.t = g.t;
        el.appendChild(cardImg(g.t === 'hidden' ? null : g.t, g.t !== 'hidden'));
        const shine = document.createElement('i'); shine.className = 'shine'; el.appendChild(shine);
        const n = document.createElement('b'); n.className = 'n'; el.appendChild(n);
        const star = document.createElement('i'); star.className = 'star'; star.textContent = '★'; el.appendChild(star);
        const fresh = document.createElement('i'); fresh.className = 'newtag'; fresh.textContent = 'NEW'; el.appendChild(fresh);
        if (FOIL[g.t]) el.classList.add('foil', FOIL[g.t]);
        hand.set(g.t, el);
        if (motion !== 'off') { el.classList.add('arrive'); setTimeout(() => el.classList.remove('arrive'), 450); }
      }
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
      el.style.setProperty('--i', i - (groups.length - 1) / 2);
      el.style.zIndex = String(i + 1);
      el.querySelector('.n').textContent = g.n > 1 ? '×' + g.n : '';
      el.classList.toggle('multi', g.n > 1);
      if (tagNew && g.t !== 'hidden' && g.n > (prevHand[g.t] || 0)) {
        el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh');
        clearTimeout(el._fresh);
        el._fresh = setTimeout(() => el.classList.remove('fresh'), 2600);
      }
    });
    prevHand = hidden ? null : counts;
    prevViewer = hidden ? -2 : v;
    box.classList.toggle('myturn', !hidden && v >= 0 && d.turn === v && d.winner === null);
    box.classList.toggle('hidden', hidden);
    box.classList.toggle('empty', !groups.length);
    fitHand();
  }
  /** Cards overlap only as much as they must to fit: never a scrollbar, never off screen. */
  function fitHand() {
    const box = $('hand'), els = Array.from(box.children);
    if (!els.length) return;
    const w = els[0].offsetWidth, n = els.length, avail = box.clientWidth - 30;
    let ov = n > 1 ? Math.max(w * 0.08, (n * w - avail) / (n - 1)) : 0;
    ov = Math.min(ov, w * 0.74);
    box.style.setProperty('--ov', Math.round(ov) + 'px');
  }
  if (typeof window !== 'undefined') window.addEventListener('resize', () => fitHand());

  /** Draw everything from a display mirror. o: { viewer, names, kinds, rules, openHands, hideHand } */
  function render(d, o) {
    last = d; opts = o;
    renderSeats(d, o);
    renderPiles(d, o);
    renderMelds(d, o);
    renderTag(d, o);
    renderMine(d, o);
    renderHand(d, o);
  }
  const rerender = () => { if (last) render(last, opts); };

  /* ── where things are (for animations, the sky and the scanner) ─────────── */
  const seatEl = p => (p === opts.viewer ? $('mine') : seats.get(p) || null);
  const handEl = t => hand.get(t) || null;
  const pileEl = name => (name === 'draw' ? $('pileDraw') : name === 'spot' ? $('spot') : $('pileDiscard'));
  const meldEl = p => melds.get(p) || $('melds');
  /** Where a seat's cards come from or go to: the hand for the viewer, the seat's fan otherwise. */
  function cardsEl(p, t) {
    if (p === opts.viewer) return (t && hand.get(t)) || $('hand');
    const s = seats.get(p);
    return s ? s.querySelector('.fan') || s : $('seats');
  }
  /** An element's box, or a box already measured (a card that has since left its place). */
  function rectOf(el) {
    if (!el) return null;
    if (typeof el.getBoundingClientRect !== 'function') return Number.isFinite(el.x) && Number.isFinite(el.width) ? el : null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ── flying cards ───────────────────────────────────────────────────────── */
  /** A card flies from one element (or measured box) to another. face: a type id, or null for
   *  a card back. o.size: card height in px (default --flyH). */
  function fly(from, to, face, o) {
    o = o || {};
    if (motion === 'off' || !from || !to || typeof Element === 'undefined') return Promise.resolve();
    const a = rectOf(from), b = rectOf(to);
    if (!a || !b) return Promise.resolve();
    const layer = $('fly');
    const img = cardImg(face, !!face);
    img.className = 'flycard';
    const h = o.size || parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--flyH')) || 150;
    const w = h * 1016 / 1547;
    img.style.width = w + 'px';
    img.style.height = h + 'px';
    img.style.left = (b.x - w / 2) + 'px';
    img.style.top = (b.y - h / 2) + 'px';
    layer.appendChild(img);
    const dx = a.x - b.x, dy = a.y - b.y;
    const spin = o.spin || 0;
    let frames, ms;
    if (motion === 'calm') {
      frames = [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1)', offset: .5 }, { opacity: 0, transform: 'scale(1)' }];
      ms = 320;
    } else {
      frames = [
        { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + spin + 'deg) scale(' + (o.from || .8) + ')', opacity: o.fadeIn ? 0 : 1 },
        { transform: 'translate(' + dx * .45 + 'px,' + (dy * .45 - (o.arc || 60)) + 'px) rotate(' + spin / 2 + 'deg) scale(1.08)', opacity: 1, offset: .5 },
        { transform: 'translate(0,0) rotate(0) scale(' + (o.to || .92) + ')', opacity: o.fadeOut ? 0 : 1 },
      ];
      ms = o.ms || 560;
    }
    const anim = img.animate(frames, { duration: ms, delay: o.delay || 0, easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'both' });
    return anim.finished.catch(() => {}).then(() => img.remove());
  }

  /** A played card takes centre stage for a moment: big, lit, named. Resolves when it's done. */
  function spotlight(t, label, ms) {
    const spot = $('spot');
    if (!spot) return Promise.resolve();
    const holder = spot.querySelector('.spotcard');
    holder.innerHTML = '';
    holder.appendChild(cardImg(t, true));
    holder.className = 'spotcard' + (FOIL[t] ? ' foil ' + FOIL[t] : '');
    spot.querySelector('.spotlbl').textContent = label || C.TYPES[t].name;
    spot.classList.remove('on'); void spot.offsetWidth; spot.classList.add('on');
    const hold = motion === 'off' ? 0 : ms || 900;
    return new Promise(r => setTimeout(r, hold));
  }
  function clearSpot() {
    const spot = $('spot');
    if (!spot) return;
    spot.classList.remove('on');
    spot.querySelector('.spotcard').innerHTML = '';
    spot.querySelector('.spotlbl').textContent = '';
  }

  /** A short glow on an element: something happened here. */
  function pulse(el, cls) {
    if (!el || motion === 'off') return;
    const c = cls || 'pulse';
    el.classList.remove(c);
    void el.offsetWidth;
    el.classList.add(c);
    setTimeout(() => el.classList.remove(c), 1300);
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  return { init, render, rerender, setMotion, fly, spotlight, clearSpot, pulse, seatEl, handEl, pileEl, meldEl, cardsEl, rectOf, art, PLAYER_COLORS, fitHand };
})();
