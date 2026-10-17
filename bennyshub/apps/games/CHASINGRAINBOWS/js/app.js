/** Chasing Rainbows - every screen, all switch input, and the game loop.
 *
 *  Input contexts (ACCESSIBILITY.md §4 - "If the player stops pressing, does anything keep
 *  happening?" - here, never: every state is a CHOICE):
 *    card   a menu card is up (title, setup, settings, pause, results, pass-the-switch...).
 *    table  the card table: the turn menu in the side column, and rows that put the
 *           highlight on the table itself (your hand cards, the other players' seats).
 *  Both run on the hub's shared choice scanner (NarbeChoiceScanAdapter): the blank stop,
 *  Auto Scan, parking, the Space brake and Wait for Speech come from it and from the
 *  player's Hub Settings. This file owns the keys, hold-Space-to-scan-backwards, the
 *  5-second Enter hold that also opens Pause, and what each choice does.
 *  Menu choices act on RELEASE; a press of any length short of the pause hold is a press.
 *
 *  Every menu opens with nothing highlighted; Back lands on the item that opened the row;
 *  an in-place change (a setting's value) keeps the highlight. Pause is always the last
 *  item of a turn menu, so it never stands between the player and their move.
 *
 *  Sharing the switch: several people can play at one screen, taking turns on the same
 *  Space and Enter. Before each person's turn a "pass the switch" card hides the hand
 *  until that person says they're ready. Private news (a card Wind took from you) waits
 *  in that person's inbox and is read to them, not to the room.
 */
(function () {
  'use strict';
  const C = window.CRCards, E = window.CREngine, AI = window.CRAI, M = window.CRMenus, W = window.CRWords;
  const D = window.CRDisplay, T = window.CRTable, N = window.CRNarrator, SND = window.CRAudio;
  // The big moments (callouts, confetti, reactions) are decoration: never let them break play.
  const FX = window.CRFX || null;
  const fxDo = fn => { try { if (FX) fn(FX); } catch (e) { /* decoration only */ } };
  const $ = id => document.getElementById(id);
  const vm = () => window.NarbeVoiceManager || null;
  const sm = () => window.NarbeScanManager || null;
  // The weather is a bonus: if the sky can't start (no canvas, an old driver), the game plays on.
  let skyOk = false;
  const sky = () => (skyOk ? window.CRSky : null);
  function mood(m) {
    document.body.dataset.mood = m;            // the table takes on the weather too (style.css)
    try { if (sky()) sky().setMood(m); } catch (e) { /* the sky is optional */ }
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const strip = h => String(h).replace(/<[^>]*>/g, ' ').replace(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();

  /* ── Tuning. Never quoted to the player. ────────────────────────────────── */
  const SCAN_BACK_HOLD = 3000;
  const SCAN_BACK_REPEAT = 2000;
  const PAUSE_HOLD_SHOW = 2000;
  const PAUSE_HOLD_MS = 5000;
  const GHOST_MS = 380;
  const RESET_ARM_MS = 6000;
  const PACE = { slow: { gap: 1500, breath: 600 }, normal: { gap: 800, breath: 350 }, quick: { gap: 300, breath: 150 } };
  const CPU_NAMES = ['Misty', 'Breezy', 'Sunny', 'Drizzle', 'Thunder'];

  /* ── Settings (this game's own; voice and scanning live in the hub managers) ─ */
  const SKEY = 'chasingrainbows_settings', GKEY = 'chasingrainbows_save', TKEY = 'chasingrainbows_stats';
  const CLASSIC_HOUSE = { weather: { cloud: true, double: true, fog: true, storm: true, wind: true }, core: true, legend: true, draw: 'discard', blockChains: false, fogStacks: true };
  const DEFAULTS = {
    helper: 'tips', blockPrompts: 'always', blockPromptVersion: 1, pace: 'normal', autoDraw: true, confirmDiscard: false,
    captions: true, motion: 'auto', sfx: true, weatherSounds: true, textSize: 1,
    setup: { mode: 'classic', players: 2, people: 1, skill: 'normal', first: 'you', openHands: false, rotate: 0, house: CLASSIC_HOUSE },
  };
  function load(key) { try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
  function store(key, v) { try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  const S = (() => {
    const saved = load(SKEY) || {};
    const s = Object.assign({}, DEFAULTS, saved);
    // The old default silently passed Actions involving other players. Update it once;
    // later deliberate "When it affects me" choices and existing "Never ask" stay intact.
    if (saved.blockPromptVersion !== 1 && s.blockPrompts === 'affects') s.blockPrompts = 'always';
    s.blockPromptVersion = 1;
    s.setup = Object.assign({}, DEFAULTS.setup, saved.setup || {});
    s.setup.house = Object.assign({}, CLASSIC_HOUSE, s.setup.house || {});
    s.setup.house.weather = Object.assign({}, CLASSIC_HOUSE.weather, s.setup.house.weather || {});
    return s;
  })();
  const saveSettings = () => store(SKEY, S);
  function stats() { return Object.assign({ games: 0, wins: 0, byskill: {}, rainbows: 0, nightNight: 0, fastest: 0 }, load(TKEY) || {}); }

  /* ── state ──────────────────────────────────────────────────────────────── */
  let ctx = 'none';
  let screen = null, screenOpts = {}, meta = {}, items = [];
  let openedAt = 0, resetArmed = 0, settingsReturn = null;
  const down = { Space: false, Enter: false }, downAt = { Space: 0, Enter: 0 };
  const ignore = { Space: false, Enter: false };
  let backHold = null, backRepeat = null, didBack = false, braking = false, pauseWatch = null;
  let choice = null, lastLit = null;
  const memory = new Map();
  /** The game: engine state, the table's mirror, and everything the screen remembers. */
  const G = { st: null, cfg: null, disp: null, meta: null, token: 0, paused: false, busy: false, finished: false };
  let levels = [], tableGen = 0, tableRoot = null, focusEls = [];

  /* ══ motion, sizes ═══════════════════════════════════════════════════════ */
  const motionQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  function motion() {
    if (S.motion === 'auto') return motionQuery && motionQuery.matches ? 'calm' : 'full';
    return S.motion;
  }
  function applyLook() {
    const m = motion();
    T.setMotion(m);
    fxDo(F => F.setMotion(m));
    try { if (sky()) sky().setMotion(m); } catch (e) { /* optional */ }
    document.documentElement.style.setProperty('--ui', S.textSize || 1);
    N.setCaptions(S.captions);
    N.setBreath(PACE[S.pace].breath);
    SND.set({ sfx: S.sfx, weather: S.weatherSounds });
  }

  /* ══ speech for the scanner ══════════════════════════════════════════════
     The player's scanning always cuts in: it drops the play-by-play queue (which stays
     in "What just happened") and returns the voice manager's ticket, which the shared
     scanner waits on under Wait for Speech. */
  function scanSpeak(text) {
    N.hush();
    const v = vm();
    return v && text ? v.speak(String(text)) || null : null;
  }

  /* ══ the card overlay (menus) ════════════════════════════════════════════ */
  function buildDom() {
    $('overlay').innerHTML = '<div id="card" class="card" role="dialog"><div id="cardStatus"></div>' +
      '<div id="cardArt" class="art"></div><h1 id="cardTitle"></h1><div id="cardSub" class="sub"></div>' +
      '<div id="menu" class="menu"></div><p id="hint"></p></div>';
    $('pauseBtn').addEventListener('click', () => { if (ctx === 'table') openPause(); });
    document.addEventListener('click', onPointer);
    window.addEventListener('resize', () => { if (ctx === 'card') fitCard(); });
  }
  const selectable = it => !!it && it.enabled !== false && !it.header;

  function renderCard() {
    const menu = $('menu');
    menu.innerHTML = '';
    menu.className = 'menu ' + (meta.layout || 'list');
    items.forEach(it => {
      const el = document.createElement('div');
      el.className = 'item' + (it.header ? ' header' : '') + (it.enabled === false && !it.header ? ' locked' : '') +
        (it.primary ? ' primary' : '') + (it.cls ? ' ' + it.cls : '') + (it.wide ? ' wide' : '');
      let html = '';
      if (it.icon) html += '<span class="ic">' + it.icon + '</span>';
      html += '<span class="lb"><span class="nm">' + it.label + '</span>' + (it.note ? '<small>' + it.note + '</small>' : '') + '</span>';
      if (it.value !== undefined && it.value !== '') html += '<span class="val">' + esc(it.value) + '</span>';
      el.innerHTML = html;
      it.el = el;
      menu.appendChild(el);
    });
  }
  const phoneLayout = () => getComputedStyle(document.documentElement).getPropertyValue('--phone-layout').trim() === '1';
  function revealOnPhone(el, block = 'nearest') {
    if (phoneLayout() && el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block, inline: 'nearest', behavior: 'instant' });
    }
  }

  /** Large screens tighten then scale; phones keep readable controls in the scrolling overlay. */
  function fitCard() {
    const card = $('card'), ov = $('overlay');
    card.classList.remove('tight'); card.style.transform = '';
    if (phoneLayout()) return;
    const room = ov.clientHeight - 24;
    const natural = () => Math.max(card.getBoundingClientRect().height, card.scrollHeight + 10);
    if (natural() <= room) return;
    card.classList.add('tight');
    const h = natural();
    if (h <= room) return;
    card.style.transform = 'scale(' + Math.max(0.6, room / h).toFixed(3) + ')';
  }

  /** A card or a turn menu appears. A switch still held belongs to whatever opened it. */
  function swallowHeld() {
    ['Space', 'Enter'].forEach(k => { if (down[k]) ignore[k] = true; });
    clearKeys();
    openedAt = performance.now();
  }

  /** opts.keep = the same card redrawn in place (a setting changed): the highlight stays.
   *  opts.restore = Back: land on the item this card was left from. */
  const memKey = (name, opts) => name + (opts && opts.page != null ? ':' + opts.page : '');
  function setScreen(name, opts) {
    const builder = SCREENS[name];
    if (!builder) return;
    opts = opts || {};
    const wasCard = ctx === 'card', keep = !!opts.keep && wasCard && screen === name;
    if (wasCard && screen && choice && choice.active) memory.set(memKey(screen, screenOpts), choice.getState().id);
    screen = name; screenOpts = opts;
    meta = builder(opts) || {};
    items = meta.items || [];
    if (ctx === 'table') leaveTable();
    ctx = 'card';
    const ov = $('overlay'), card = $('card');
    ov.classList.add('on');
    ov.classList.toggle('scrim', !!meta.scrim);
    document.body.classList.toggle('in-menu', true);
    card.className = 'card size-' + (meta.size || 'normal') + (meta.cardClass ? ' ' + meta.cardClass : '');
    if (!keep) { void card.offsetWidth; card.classList.add('enter'); }
    $('cardArt').innerHTML = meta.art || '';
    $('cardTitle').innerHTML = meta.title || '';
    $('cardSub').innerHTML = meta.sub || '';
    $('hint').innerHTML = meta.hint !== undefined ? meta.hint : defaultHint();
    renderCard();
    if (!keep) { ov.scrollTop = 0; swallowHeld(); }
    fitCard();
    syncChoice({ fresh: !keep, restoreId: opts.restore ? memory.get(memKey(name, opts)) : null });
    showFocus();
    if (!keep && opts.announce !== false && meta.announce !== false) {
      announceOpen(opts.restore ? strip(meta.title || '') : meta.speech || strip((meta.title || '') + '. ' + (meta.sub || '')));
    }
  }
  function refresh() { setScreen(screen, Object.assign({}, screenOpts, { keep: true, restore: false, announce: false })); }
  function closeCard() {
    $('overlay').classList.remove('on');
    document.body.classList.remove('in-menu');
    screen = null; items = [];
    if (choice) choice.sync(null);
    ctx = 'none';
  }

  function cardContext() {
    const seen = new Map(), list = [];
    items.forEach(it => {
      if (!selectable(it)) return;
      const base = String(it.id || strip(it.label || '') || 'item'), k = seen.get(base) || 0;
      seen.set(base, k + 1);
      list.push({ id: k ? base + ':' + k : base, label: () => speechOf(it), element: it.el, labelElement: it.el, ref: it });
    });
    return { key: 'card:' + memKey(screen, screenOpts), kind: 'card', items: list, statusHost: $('cardStatus') };
  }
  const speechOf = it => (it.speech !== undefined ? it.speech : strip(it.label) + (it.value !== undefined && it.value !== '' ? ', ' + it.value : ''));
  function syncChoice(opts) { if (choice) choice.sync(cardContext(), opts); }

  /* ══ focus ═══════════════════════════════════════════════════════════════ */
  function setFocus(els) {
    focusEls.forEach(el => el.classList.remove('focused', 'echo'));
    focusEls = [];
    els.forEach(([el, cls]) => { if (el) { el.classList.add(cls); focusEls.push(el); } });
  }
  function showFocus(item, state) {
    const its = [];
    if (item && item.element) its.push([item.element, 'focused']);
    const ref = item && item.ref;
    if (ref && ctx === 'table') {
      // A choice about a pile or a hand card also lights that pile or card up.
      if (ref.id === 'take') its.push([T.pileEl('discard'), 'echo']);
      if (ref.id === 'draw') its.push([T.pileEl('draw'), 'echo']);
      if (ref.card && ref.move && /^(?:discard|pass):/.test(ref.move) && item.element && !item.element.classList.contains('hcard')) its.push([T.handEl(ref.card), 'echo']);
    }
    setFocus(its);
    // The phone page scrolls. Follow the actual choice, never its decorative pile/card echo.
    revealOnPhone(item && item.element);
    const paused = !!(item && state && state.braked);
    document.body.classList.toggle('scan-paused', paused);
  }

  /* ══ the hub's choice scanner ════════════════════════════════════════════ */
  function initChoice() {
    if (!window.NarbeChoiceScanAdapter || !sm()) return;
    choice = NarbeChoiceScanAdapter.create({
      holdThreshold: SCAN_BACK_HOLD, stateHost: document.body,
      speak: scanSpeak,
      onContext(current) {
        if (!current || current.kind !== 'table') return;
        // The scanner left a row (its Back stop, or a reset): forget the rows above it.
        while (levels.length && levels[levels.length - 1].key !== current.key) cleanupLevel(levels.pop());
        updateBanner();
      },
      onHighlight(item, state, context) {
        if (!context || state.suspended) return;
        showFocus(item, state);
        const id = item ? item.id : null;
        if (id !== null && id !== lastLit) SND.play('card', 0.12);
        lastLit = id;
      },
      onSelect(item, state, context) {
        const ref = item.ref;
        if (context.kind === 'card') {
          if (!selectable(ref)) return;
          if (typeof ref.action === 'function') ref.action();
          return;
        }
        tableChoice(ref);
      },
    });
  }
  /** A menu opens: its title speech is the scanner's own, so Auto Scan's first step waits for
   *  it under Wait for Speech; with parking on, "park" is said for the blank. */
  function announceOpen(text) {
    if (!choice || !choice.active) { if (text) scanSpeak(text); return; }
    const st = choice.getState(), it = st.index >= 0 ? choice.context.items[st.index] : null;
    const parking = !it && !!sm() && sm().getSettings().autoScan && sm().isParkingEnabled();
    const tail = it ? it.label() : parking ? 'Park.' : '';
    const say = [text, tail].filter(Boolean).join('. ');
    if (say) choice.announce(say, { parkingLabel: parking });
  }
  function defaultHint() {
    const s = sm(), auto = !!(s && s.getSettings().autoScan), brake = auto && s.getSettings().spaceBrake;
    const keys = auto ? '<kbd>Enter</kbd> picks the highlighted choice' + (brake ? ' · <kbd>Space</kbd> pauses the scan' : '')
      : 'Tap <kbd>Space</kbd> = next · hold <kbd>Space</kbd> = back · <kbd>Enter</kbd> = choose';
    return keys;
  }

  /* ── mouse and touch: tap a highlighted-able thing to choose it ─────────── */
  function onPointer(e) {
    if (!choice || !choice.active || performance.now() - openedAt < GHOST_MS) return;
    const cur = choice.context;
    if (!cur) return;
    // Inside a row, tapping the row's title or the dimmed turn menu goes back out.
    if (ctx === 'table' && levels.length && (e.target.closest('.crumb') || e.target.closest('#choices'))) {
      backOut(!!e.target.closest('#choices'));
      return;
    }
    const hit = cur.items.find(it => it.element && it.element.contains(e.target));
    if (!hit) return;
    if (choice.getState().id !== hit.id) {
      // align() would re-open this row as a fresh top-level menu, losing its Back stop and
      // the way out. Inside a row, step the highlight round to the tapped item instead.
      if (choice.getState().depth > 0) {
        for (let k = 0; k < cur.items.length + 2 && choice.getState().id !== hit.id; k++) choice.step(1);
        if (choice.getState().id !== hit.id) return;
      } else choice.align(hit.id);
    }
    choice.select();
  }
  /** Leave the open row (all of them with toRoot), landing on the choice that opened it. */
  function backOut(toRoot) {
    for (let guard = 0; levels.length && guard < 8; guard++) {
      if (!choice.back({ restore: true })) break;
      if (!toRoot) break;
    }
  }

  /* ══ switch input ════════════════════════════════════════════════════════ */
  const isSwitch = c => c === 'Space' || c === 'Enter' || c === 'NumpadEnter';
  const norm = c => (c === 'NumpadEnter' ? 'Enter' : c);
  const interval = () => (sm() ? sm().getScanInterval() : SCAN_BACK_REPEAT);
  function clearBack() { clearTimeout(backHold); backHold = null; clearInterval(backRepeat); backRepeat = null; didBack = false; }
  function clearPauseWatch() { clearInterval(pauseWatch); pauseWatch = null; ring(0); }
  function clearKeys() {
    down.Space = down.Enter = false; braking = false;
    clearBack(); clearPauseWatch();
    if (choice) choice.setInputHeld(false);
  }
  function ring(p) {
    const r = $('holdRing');
    r.classList.toggle('on', p > 0);
    r.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
  }
  function onKeyDown(e) {
    if (!isSwitch(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    const k = norm(e.code);
    if (ignore[k]) ignore[k] = false;
    if (down[k]) return;
    down[k] = true; downAt[k] = performance.now();
    if ((ctx === 'card' || ctx === 'table') && choice && choice.active) {
      // Auto Scan + Space Brake: Space freezes the scan on PRESS so the label is not cut off.
      if (k === 'Space') braking = choice.brakePress();
      if (k !== 'Space' || !braking) choice.setInputHeld(true);
      if (k === 'Space' && !braking && !backHold && !backRepeat) {
        didBack = false;
        backHold = setTimeout(() => {
          backHold = null; didBack = true; choice.step(-1);
          backRepeat = setInterval(() => choice.step(-1), interval());
        }, SCAN_BACK_HOLD);
      }
    }
    if (k === 'Enter' && ctx === 'table') watchPauseHold();
  }
  /** Holding Enter for 5 seconds also opens Pause (a ring shows from 2 seconds). */
  function watchPauseHold() {
    clearPauseWatch();
    pauseWatch = setInterval(() => {
      if (!down.Enter) { clearPauseWatch(); return; }
      const held = performance.now() - downAt.Enter;
      if (held >= PAUSE_HOLD_MS) { clearPauseWatch(); openPause(); return; }
      if (held >= PAUSE_HOLD_SHOW) ring((held - PAUSE_HOLD_SHOW) / (PAUSE_HOLD_MS - PAUSE_HOLD_SHOW));
    }, 50);
  }
  function onKeyUp(e) {
    if (!isSwitch(e.code)) return;
    e.preventDefault();
    const k = norm(e.code);
    if (ignore[k]) { ignore[k] = false; down[k] = false; return; }
    if (!down[k]) return;
    down[k] = false;
    if (k === 'Enter') clearPauseWatch();
    if (ctx !== 'card' && ctx !== 'table') return;
    if (!choice || !choice.active) return;
    if (k === 'Space') {
      const wasBack = didBack, wasBrake = braking;
      clearBack(); braking = false;
      if (wasBrake) choice.brakeRelease();
      else if (!wasBack) choice.step(1);
    } else choice.select();
    choice.setInputHeld(down.Space || down.Enter);
  }
  /** Focus lost, or the hub's input guard dropped a press: no key may stay half-held. */
  function onBlur() { clearKeys(); ignore.Space = ignore.Enter = false; if (choice) choice.cancelInput(); }

  /* ══ the table menu ══════════════════════════════════════════════════════ */
  /** Show a turn menu (a CRMenus tree) in the side column, nothing highlighted. */
  function openTable(tree, o) {
    o = o || {};
    if (ctx === 'card') closeCard();
    leaveTable();
    ctx = 'table';
    const key = 'table:' + (++tableGen);
    $('choices').innerHTML = '';
    $('choices').className = 'choices' + (o.cls ? ' ' + o.cls : '');
    const lvl = { key, ref: { id: 'root', label: o.banner || '' }, marks: [], panel: null, root: true };
    const list = tree.map(ch => ({ id: ch.id, label: () => labelFor(ch), element: place(ch, lvl, $('choices')), ref: ch }));
    tableRoot = { key, tree, banner: o.banner || '', sub: o.sub || '', lvl };
    levels = [];
    refreshPicking();
    swallowHeld();
    if (choice) choice.sync({ key, kind: 'table', items: list, statusHost: $('choiceStatus') }, { fresh: true });
    updateBanner();
    if (o.intro !== undefined) announceOpen(o.intro);
  }
  function leaveTable() {
    clearLevels();
    if (tableRoot && tableRoot.lvl) cleanupLevel(tableRoot.lvl);
    tableRoot = null;
    setFocus([]);
  }
  function clearLevels() { while (levels.length) cleanupLevel(levels.pop()); }
  function cleanupLevel(lvl) {
    (lvl.marks || []).forEach(el => el.classList.remove('pickable', 'starred'));
    lvl.marks = [];
    if (lvl.panel) lvl.panel.remove();
    refreshPicking();
  }
  /** Hand cards and seats that aren't choices in an open row are dimmed. */
  function refreshPicking() {
    const all = (tableRoot && tableRoot.lvl ? tableRoot.lvl.marks : []).concat(...levels.map(l => l.marks));
    $('hand').classList.toggle('picking', all.some(el => el.classList.contains('hcard')));
    $('seats').classList.toggle('picking', all.some(el => el.classList.contains('seat')));
    // The bar under the hand shows one row at a time: a sub-menu replaces the turn menu, and
    // while you pick a card in your hand or a player's nameplate, the menu steps back (dims).
    const top = levels[levels.length - 1];
    $('bar').classList.toggle('nested', !!(top && top.panel));
    $('bar').classList.toggle('dimmed', !!(top && !top.panel));
  }

  const seatOf = ch => {
    const m = /^(?:weather:fog:|steal:)(\d+)$/.exec(ch.move || '') || /^wind:(\d+)$/.exec(ch.id || '');
    return m ? +m[1] : null;
  };
  const handPick = ch => !!ch.card && !!ch.move && (/^(?:discard|pass):/.test(ch.move) || /^weather:wind:\d+:/.test(ch.move)) && !!T.handEl(ch.card);

  /** Where a choice lives: on a seat, on a hand card, or as a button in a list. */
  function place(ch, lvl, container) {
    const q = seatOf(ch);
    if (q !== null && T.seatEl(q)) {
      const el = T.seatEl(q);
      el.classList.add('pickable');
      if (ch.star) el.classList.add('starred');
      lvl.marks.push(el);
      refreshPicking();
      return el;
    }
    if (handPick(ch)) {
      const el = T.handEl(ch.card);
      el.classList.add('pickable');
      if (ch.star) el.classList.add('starred');
      lvl.marks.push(el);
      refreshPicking();
      return el;
    }
    const b = button(ch);
    container.appendChild(b);
    return b;
  }
  function button(ch) {
    const b = document.createElement('div');
    b.className = 'choice' + (ch.kind === 'group' ? ' group' : '') + (ch.star ? ' star' : '') + (ch.cls ? ' ' + ch.cls : '') + (ch.kind === 'pause' ? ' pause' : '');
    const ic = ch.card ? '<img class="mini" alt="" src="' + T.art(ch.card) + '">' : '<span class="ic">' + (ch.icon || '•') + '</span>';
    b.innerHTML = ic + '<span class="lb"><span class="nm">' + esc(ch.label) + '</span>' + (ch.note ? '<small>' + esc(ch.note) + '</small>' : '') + '</span>' +
      (ch.star ? '<i class="starmark" title="Suggested">★</i>' : '') + (ch.kind === 'group' ? '<span class="go">›</span>' : '');
    return b;
  }
  /** What the scanner says for a choice: its words, "suggested" for the Helper's star, and
   *  the first time a weather card comes up in a game, what it does. */
  function labelFor(ch) {
    let s = ch.say || ch.label;
    if (ch.star && S.helper !== 'off' && ch.id !== 'suggest') s += ', suggested';
    if (ch.explain && G.meta && !G.meta.explained[ch.explain]) {
      G.meta.explained[ch.explain] = 1;
      s += '. ' + C.ruleFor(ch.explain);
    }
    return s;
  }
  function enterRow(ref) {
    const lvl = { key: 'row:' + (++tableGen), ref, marks: [], panel: null };
    const needsPanel = ref.children.some(ch => !(seatOf(ch) !== null && T.seatEl(seatOf(ch))) && !handPick(ch));
    if (needsPanel) {
      lvl.panel = document.createElement('div');
      lvl.panel.className = 'panel';
      // The title doubles as a way back for mouse and touch (switches use the Back stop).
      lvl.panel.innerHTML = '<div class="crumb" title="Back"><span class="bk">‹</span>' + esc(ref.label) + '</div><div class="list"></div>';
      $('panels').appendChild(lvl.panel);
    }
    const list = ref.children.map(ch => ({ id: ch.id, label: () => labelFor(ch), element: place(ch, lvl, lvl.panel && lvl.panel.querySelector('.list')), ref: ch }));
    levels.push(lvl);
    // Show this row's panel (the bar swaps to it) before the scanner lands on its first item.
    refreshPicking();
    const ok = choice && choice.enterGroup({ key: lvl.key, kind: 'table', items: list, statusHost: $('choiceStatus') }, { wrap: true, backStop: true });
    if (!ok) cleanupLevel(levels.pop());
    updateBanner();
  }
  function updateBanner() {
    if (!tableRoot) return;
    const top = levels[levels.length - 1];
    let text = tableRoot.banner, sub = tableRoot.sub;
    if (top) {
      text = top.ref.label;
      const r = top.ref;
      sub = r.children.some(handPick) ? 'Pick a card in your hand.' : r.children.some(ch => seatOf(ch) !== null) ? 'Pick a player.' : '';
    }
    $('banner').innerHTML = '<b>' + esc(text) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '');
  }

  /** A turn-menu choice was made. */
  function tableChoice(ref) {
    if (ref.kind === 'group') { enterRow(ref); return; }
    if (ref.kind === 'pause') { openPause(); return; }
    if (ref.kind === 'look') {
      // Like a key on a keyboard row, choosing returns to the menu it came from, with Look
      // still lit: Enter opens it again. The answer is spoken and stays on screen.
      if (choice) choice.back({ restore: true });
      lookAt(ref.id);
      return;
    }
    if (typeof ref.action === 'function') { ref.action(); return; }
    if (ref.kind === 'move') {
      if (S.confirmDiscard && /^(?:discard|pass):/.test(ref.move) && !ref.confirmed) {
        enterRow({ id: 'confirm', label: ref.full || ref.label, say: ref.full || ref.say,
          children: [{ id: 'confirm:' + ref.move, kind: 'move', move: ref.move, confirmed: true, icon: '✔️',
            label: 'Yes, ' + (ref.full || 'discard it').replace(/^Discard/, 'discard'), say: 'Yes, ' + (ref.full || 'discard it').replace(/^Discard/, 'discard') }] });
        return;
      }
      chooseMove(ref.move);
    }
  }

  /** While other players take their turn, the player can still Look and Pause. */
  function openWaiting(banner) {
    if (ctx === 'table' && tableRoot && tableRoot.waiting) { tableRoot.banner = banner || tableRoot.banner; updateBanner(); return; }
    if (ctx === 'card') return;
    openTable(M.waiting(), { banner: banner || '', cls: 'waiting' });
    tableRoot.waiting = true;
  }

  function lookAt(id) {
    if (!G.st) return;
    const v = G.meta.viewer >= 0 ? E.viewFor(G.st, G.meta.viewer) : null;
    const ctxW = { names: G.meta.names };
    let text = '';
    if (!v) text = 'Nothing to see yet.';
    else if (id === 'look:hand') text = W.sayHand(v.hand);
    else if (id === 'look:rainbow') text = W.sayRainbow(v);
    else if (id === 'look:players') text = W.sayPlayers(v, ctxW);
    else if (id === 'look:piles') text = W.sayPiles(v);
    else if (id === 'look:recent') { const r = N.recent(6); text = r.length ? r.join(' ') : 'Nothing has happened yet.'; }
    N.caption(text);
    showLook(text);
    // Point at what's being described.
    const at = { 'look:hand': $('hand'), 'look:rainbow': $('mine'), 'look:players': $('seats'), 'look:piles': $('piles') }[id];
    if (at) T.pulse(at, 'lookpulse');
    if (choice) choice.announce(text); else scanSpeak(text);
  }

  /** Look's answer, in big print above the choice bar, until it has had time to be read. */
  let lookTimer = null;
  function showLook(text) {
    let box = $('lookToast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'lookToast';
      box.setAttribute('aria-live', 'polite');
      $('bar').appendChild(box);
    }
    box.textContent = text;
    box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
    revealOnPhone(box, 'start');
    clearTimeout(lookTimer);
    lookTimer = setTimeout(() => box.classList.remove('show'), Math.max(7000, text.length * 75));
  }

  /* ══ the game loop ═══════════════════════════════════════════════════════ */
  const humans = () => G.meta.kinds.filter(k => k !== 'cpu').length;
  const isHuman = p => G.meta.kinds[p] !== 'cpu';
  function render() {
    if (!G.disp) return;
    T.render(G.disp, {
      viewer: G.meta.viewer, names: G.meta.names, kinds: G.meta.kinds, rules: G.st.rules,
      openHands: !!G.meta.openHands, hideHand: !!G.meta.hidden,
      // The draw pile glows when it's the viewer's turn to draw.
      inviteDraw: G.st.phase === 'draw' && !G.st.pending && G.st.turn === G.meta.viewer && !G.meta.hidden,
    });
  }
  const wctx = () => ({ names: G.meta.names, viewer: G.meta.viewer });

  function newConfig() {
    const su = S.setup, n = su.players, people = Math.max(1, Math.min(su.people, n));
    // People are spread around the table, so turns alternate with the computer players.
    const humanSeats = Array.from({ length: people }, (_, i) => Math.floor(i * n / people));
    let cpu = 0, num = 0;
    const players = Array.from({ length: n }, (_, p) => {
      if (humanSeats.includes(p)) { num++; return { name: people === 1 ? 'You' : 'Player ' + num, kind: 'human' }; }
      return { name: CPU_NAMES[cpu++], kind: 'cpu', skill: su.skill };
    });
    let first = humanSeats[0];
    if (su.first === 'random') first = Math.floor(Math.random() * n);
    if (su.first === 'rotate') first = (su.rotate || 0) % n;
    return { players, mode: su.mode, house: su.house, first };
  }

  function stopGame() {
    G.token++;
    stopThinking();
    fxDo(F => F.clear());
    G.paused = false; G.busy = false;
    SND.setRain(false);
    try { if (sky()) sky().stop(); } catch (e) { /* optional */ }
    mood('day');
  }

  async function startNew(cfg) {
    stopGame();
    if (ctx === 'card') closeCard();
    cfg = cfg || newConfig();
    const seed = (Math.random() * 4294967296) >>> 0;
    const made = E.createGame(cfg, seed);
    G.st = made.state; G.cfg = cfg; G.finished = false;
    const kinds = cfg.players.map(p => p.kind);
    G.meta = {
      names: cfg.players.map(p => p.name), kinds, openHands: !!S.setup.openHands,
      viewer: kinds.filter(k => k !== 'cpu').length === 1 ? kinds.indexOf('human') : -1,
      hidden: false, inbox: {}, hints: {}, explained: {},
    };
    if (S.setup.first === 'rotate') { S.setup.rotate = (S.setup.rotate || 0) + 1; saveSettings(); }
    // The table starts empty and fills as the deal is animated.
    G.disp = D.fromState(G.st);
    const dealt = G.disp.hands.map(h => h.slice());
    G.disp.hands = G.disp.hands.map(() => []);
    G.disp.draw += dealt.flat().length + G.st.discard.length;
    G.disp.discard = [];
    G.disp.turn = -1;
    G.dealt = dealt;
    N.clearHistory();
    showTable();
    openWaiting('Dealing');
    N.say(G.meta.kinds.length === 2 ? 'Let\'s chase some rainbows! You against ' + G.meta.names[1 - G.meta.kinds.indexOf('human')] + '.' : 'Let\'s chase some rainbows!');
    const my = G.token;
    await playEvents(made.events, my);
    if (my !== G.token) return;
    saveGame();
    loop();
  }

  function showTable() {
    $('game').classList.add('on');
    render();
  }

  /** Drive the game until a person has to choose (or it ends). */
  async function loop() {
    const my = ++G.token;
    const live = () => my === G.token && !G.paused;
    while (live()) {
      const s = G.st;
      const d = E.getDecision(s);
      if (d.kind === 'over') {
        await N.idle();
        await sleep(900);
        if (live()) showResults();
        return;
      }
      if (!isHuman(d.p)) {
        openWaiting(turnBanner(d));
        fxDo(F => F.thinking(T.seatEl(d.p), true));
        await N.idle();
        await sleep(PACE[S.pace].gap);
        stopThinking();
        if (!live()) return;
        const move = AI.choose(E.viewFor(s, d.p), d, s.players[d.p].skill);
        await apply(move.key, my);
        continue;
      }
      // A person decides.
      if (d.kind === 'block' && !shouldPrompt(d)) { await apply('allow', my); continue; }
      if (d.kind === 'draw' && S.autoDraw && d.moves.length === 1) {
        if (G.meta.viewer === d.p || !needsCover(d.p)) { await N.idle(); if (!live()) return; await apply(d.moves[0].key, my); continue; }
      }
      if (d.kind === 'play' && d.moves.length === 1 && d.moves[0].type === 'end') {
        N.say(d.p === G.meta.viewer ? 'You have no cards to play, so your turn ends.' : G.meta.names[d.p] + ' has no cards to play.');
        await apply('end', my);
        continue;
      }
      if (needsCover(d.p)) {
        openWaiting(turnBanner(d));
        await N.idle();
        if (live()) showCover(d.p, d);
        return;
      }
      if (G.meta.viewer !== d.p) { G.meta.viewer = d.p; render(); }
      await openDecision(d, my);
      return;
    }
  }
  const needsCover = p => humans() > 1 && !G.meta.openHands && p !== G.meta.viewer;
  function turnBanner(d) {
    const name = G.meta.names[d.p];
    if (d.kind === 'block') return (d.p === G.meta.viewer ? 'You' : name) + ': block?';
    return d.p === G.meta.viewer ? 'Your turn' : name + (name === 'You' ? 'r turn' : "'s turn");
  }

  /** Should this person be asked about blocking? (Settings › Block prompts) */
  function shouldPrompt(d) {
    if (S.blockPrompts === 'never') return false;
    if (S.blockPrompts === 'always') return true;
    const v = E.viewFor(G.st, d.p), pd = v.pending;
    if (pd.blocks % 2 === 1) return pd.actor === d.p;                // their own card was blocked
    if ((pd.card === 'fog' || pd.card === 'wind') && pd.target === d.p) return true;
    if (pd.card === 'storm' && v.hand.includes(pd.name)) return true;
    return false;
  }

  async function openDecision(d, my) {
    const view = E.viewFor(G.st, d.p);
    if (S.helper !== 'off' && (d.kind === 'draw' || d.kind === 'play')) {
      W.hints(view).forEach(h => { if (!G.meta.hints[h.id]) { G.meta.hints[h.id] = 1; N.say(h.say); } });
    }
    await N.idle();
    if (my !== G.token || G.paused) return;
    const suggest = S.helper !== 'off' && d.moves.length > 1 ? AI.suggest(view, d) : null;
    const tree = M.build(d, view, { names: G.meta.names }, { helper: S.helper, suggest: suggest && suggest.key });
    const o = { banner: turnBanner(d), intro: introFor(d, view) };
    const passing = view.rules.draw === 'pass';
    const recipient = G.meta.names[(d.p + 1) % view.players.length];
    if (d.kind === 'draw') o.sub = passing ? 'Draw a card from the pile.' : view.rules.draw === 'player' ? 'Draw, or take a card from a player.' : 'Draw, or take the top discard.';
    if (d.kind === 'play') o.sub = passing ? 'Play ready combos, then give a card to ' + recipient + ' on your right.' : view.hand.length > E.HAND_LIMIT ? discardInstruction(d) : 'Play, discard a card, or end your turn.';
    if (d.kind === 'discard') o.sub = 'Discarding has started. Pick a card to discard.';
    if (d.kind === 'pass') o.sub = 'Give cards to ' + recipient + ' on your right until you have 7.';
    if (d.kind === 'block') o.sub = 'You have a Cloud Block.';
    if (d.kind === 'draw' && isHuman(d.p)) SND.play('turn');
    openTable(tree, o);
  }
  function discardInstruction(d) {
    if (d.moves.some(m => m.type === 'weather')) return 'Play combos or an Action, then discard down to 7.';
    if (d.moves.some(m => m.type === 'combo')) return 'Play ready combos, or discard down to 7.';
    return 'Discard down to 7.';
  }
  function introFor(d, view) {
    if (d.kind === 'draw') return W.turnIntro(view, { names: G.meta.names });
    if (d.kind === 'pass') return 'Give ' + (view.hand.length - E.HAND_LIMIT) + ' more to ' + G.meta.names[(d.p + 1) % view.players.length] + ' on your right.';
    if (d.kind === 'discard') { const k = view.hand.length - E.HAND_LIMIT; return 'Discard ' + k + ' more.'; }
    if (d.kind === 'block') return blockIntro(view, d);
    const combo = d.moves.find(m => m.type === 'combo');
    if (combo) return { rainbow: 'Your rainbow is ready!', core: 'Sun and Rain are ready!', legend: 'Day and Night are ready!' }[combo.combo];
    if (view.hand.length > E.HAND_LIMIT) return 'You have ' + view.hand.length + ' cards. ' + (view.rules.draw === 'pass' ? 'Play a combo, or give cards to the player on your right, down to 7.' : discardInstruction(d));
    return '';
  }
  function blockIntro(view, d) {
    const pd = view.pending, names = G.meta.names;
    const nm = q => (q === d.p ? 'you' : names[q]);
    if (pd.blocks % 2 === 1) return 'Your ' + C.TYPES[pd.card].name + ' was blocked. You have another Cloud. Block the block?';
    let what = C.TYPES[pd.card].name;
    if (pd.card === 'fog') what = 'Fog Skip on ' + nm(pd.target);
    if (pd.card === 'storm') what = 'Storm Shuffle on ' + C.sayName(pd.name);
    if (pd.card === 'wind') what = 'Wind Trade with ' + nm(pd.target);
    return names[pd.actor] + ' plays ' + what + '. You have a Cloud Block. Block it?';
  }

  async function chooseMove(key) {
    if (!G.st || G.busy) return;
    const d = E.getDecision(G.st);
    if (!d.moves.some(m => m.key === key)) return;
    openWaiting(turnBanner(d));
    const my = G.token;
    await apply(key, my);
    if (my === G.token && !G.paused) loop();
  }

  async function apply(key, my) {
    G.busy = true;
    let events;
    try { events = E.applyMove(G.st, key); } catch (e) { console.error(e); G.busy = false; return; }
    saveGame();
    await playEvents(events, my);
    G.busy = false;
    if (G.st.phase === 'over') gameOver();
  }

  /* ── events: narrate, animate, and step the table forward ───────────────── */
  async function playEvents(events, my) {
    for (const ev of events) {
      await playEvent(ev);
    }
    // The mirror should already match; re-sync anyway so nothing can drift.
    G.disp = D.fromState(G.st);
    render();
  }

  async function playEvent(ev) {
    const c = wctx();
    const line = W.describe(ev, c);
    if (line) N.say(line.say);
    // Private news for people sharing the switch who weren't the one watching.
    if (humans() > 1 && !G.meta.openHands) {
      [ev.p, ev.from, ev.target].forEach(q => {
        if (q === undefined || q === c.viewer || !isHuman(q)) return;
        const priv = W.privateFor(ev, c, q);
        if (priv) (G.meta.inbox[q] = G.meta.inbox[q] || []).push(priv);
      });
    }
    await show(ev);
  }

  const seatRect = p => T.rectOf(p === G.meta.viewer ? $('hand') : T.seatEl(p));
  const faceFor = (p, t) => (p === G.meta.viewer && !G.meta.hidden) || G.meta.openHands ? t : null;
  const ty = card => (typeof card === 'string' ? card : card && card.t);
  function step(ev) { D.apply(G.disp, ev); render(); }

  /** One event on screen: cards fly, the sky reacts, the table steps forward. */
  async function show(ev) {
    const m = motion();
    const quick = m === 'off';
    const fx = (name, o, wait) => {
      const s = sky();
      if (!s || quick) return Promise.resolve();
      let p;
      try { p = Promise.resolve(s.play(name, o || {})); } catch (e) { return Promise.resolve(); }
      return wait ? Promise.race([p, sleep(wait)]) : Promise.resolve();
    };
    switch (ev.t) {
      case 'deal': {
        SND.play('shuffle');
        const n = G.dealt.length, from = T.pileEl('draw');
        const flights = [];
        for (let r = 0; r < 7; r++) for (let p = 0; p < n; p++) {
          const k = r * n + p;
          if (!quick && k % 2 === 0) flights.push(T.fly(from, T.cardsEl(p), null, { ms: 380, delay: k * 45, arc: 30 }));
        }
        await Promise.all(flights);
        G.disp.hands = G.dealt.map(h => h.slice());
        G.disp.draw -= G.dealt.flat().length;
        render();
        return;
      }
      case 'flip':
        await T.fly(T.pileEl('draw'), T.pileEl('discard'), ty(ev.card), { spin: -10 });
        step(ev); G.disp.discard = [ty(ev.card)]; G.disp.draw--; render();
        return;
      case 'turn':
        step(ev);
        setMood();
        T.pulse(ev.p === G.meta.viewer ? $('mine') : T.seatEl(ev.p), 'turnpulse');
        // A person's turn sweeps across the table, UNO-style. Computer turns stay quiet.
        if (isHuman(ev.p)) fxDo(F => F.sweep(ev.p === G.meta.viewer && G.meta.names[ev.p] === 'You' ? 'Your turn!' : G.meta.names[ev.p] + '\u2019s turn', T.PLAYER_COLORS[ev.p % T.PLAYER_COLORS.length]));
        return;
      case 'skipped':
        react(ev.p, '😵');
        T.pulse(ev.p === G.meta.viewer ? $('mine') : T.seatEl(ev.p), 'fogpulse');
        SND.play('fog');
        fx('fog', { rect: seatRect(ev.p), ms: 2500 });
        await sleep(quick ? 0 : 700);
        step(ev);
        return;
      case 'draw': case 'replace':
        SND.play('card');
        await T.fly(T.pileEl('draw'), T.cardsEl(ev.p, ty(ev.card)), faceFor(ev.p, ty(ev.card)));
        step(ev);
        return;
      case 'take':
        SND.play('card');
        { const from = T.rectOf(T.pileEl('discard')); G.disp.discard.pop(); render(); G.disp.discard.push(ty(ev.card));
          await T.fly(from, T.cardsEl(ev.p, ty(ev.card)), ty(ev.card)); }
        step(ev);
        if (ev.p !== G.meta.viewer) react(ev.p, '👀');
        return;
      case 'pass': {
        SND.play('card');
        const from = T.rectOf(T.cardsEl(ev.p, ty(ev.card)));
        const see = !G.meta.hidden && (ev.p === G.meta.viewer || ev.target === G.meta.viewer) || G.meta.openHands;
        step(ev);
        await T.fly(from, T.cardsEl(ev.target, ty(ev.card)), see ? ty(ev.card) : null);
        return;
      }
      case 'steal': {
        SND.play('card');
        const from = T.rectOf(T.cardsEl(ev.from, ty(ev.card)));
        const see = ev.p === G.meta.viewer || ev.from === G.meta.viewer || G.meta.openHands;
        step(ev);
        await T.fly(from, T.cardsEl(ev.p, ty(ev.card)), see ? ty(ev.card) : null);
        return;
      }
      case 'reshuffle':
        SND.play('shuffle');
        await T.fly(T.pileEl('discard'), T.pileEl('draw'), null, { ms: 420 });
        step(ev);
        return;
      case 'combo': {
        const from = T.rectOf(T.cardsEl(ev.p));
        step(ev);
        // The combo is laid on the table, as real cards, under the player's name. Every
        // channel fires at once: the word, the cards, a rising note per card, the burst.
        const to = T.meldEl(ev.p);
        fxDo(F => F.callout({ rainbow: 'RAINBOW!', core: 'SUN & RAIN!', legend: 'LEGENDS!' }[ev.combo], ev.combo === 'legend' ? 'night' : 'rainbow'));
        const flights = ev.cards.map((c, i) => {
          if (!quick) setTimeout(() => SND.play('note' + Math.min(7, ev.combo === 'rainbow' ? i : i * 4 + 3)), 560 + i * 90);
          return T.fly(from, to, ty(c), { delay: i * 90, ms: 640, fadeOut: true, to: 0.45, arc: 90 });
        });
        if (quick) SND.play('chime');
        if (ev.combo === 'rainbow') { fx('rainbow', {}); mood('rainbow'); }
        if (ev.combo === 'core') { fx('sunshower', {}); mood('sunshower'); }
        if (ev.combo === 'legend') fx('dayNight', {});
        await Promise.all(flights);
        T.pulse(to, 'combopulse');
        fxDo(F => F.burst(to, { colors: { rainbow: F.RAINBOW, core: ['#ffde00', '#00b4e8', '#ffffff'], legend: ['#ffffff', '#b9c3ff', '#ffd54f'] }[ev.combo], shape: ev.combo === 'rainbow' ? 'confetti' : 'star' }));
        react(ev.p, ev.combo === 'rainbow' ? '😄' : '🤩');
        return;
      }
      case 'weather': {
        // The weather card takes centre stage, then lands on the discard pile.
        SND.play('card');
        const from = T.rectOf(T.cardsEl(ev.p, ev.card));
        const h = G.disp.hands[ev.p], i = h.indexOf(ev.card);
        if (i >= 0) h.splice(i, 1);
        render();
        await spotlight(from, ev.card, weatherLabel(ev), 1100);
        G.disp.discard.push(ev.card);
        render();
        T.pulse(T.pileEl('discard'), 'weatherpulse');
        return;
      }
      case 'block': {
        const from = T.rectOf(T.cardsEl(ev.p, 'cloud'));
        const h = G.disp.hands[ev.p], i = h.indexOf('cloud');
        if (i >= 0) h.splice(i, 1);
        render();
        SND.play('puff');
        const at = T.rectOf(T.pileEl('spot'));
        if (at) fx('cloudPuff', { x: at.x, y: at.y });
        fxDo(F => F.callout('BLOCKED!', 'cloud'));
        react(ev.p, '😏');
        if (ev.against !== null && ev.against !== undefined) react(ev.against, '😮');
        await spotlight(from, 'cloud', 'Blocked!', 1000);
        G.disp.discard.push('cloud');
        render();
        return;
      }
      case 'blocked': return;
      case 'double': {
        fx('doubleRainbow', {});
        SND.play('chime', 0.35);
        fxDo(F => { F.callout('DOUBLE DRAW!', 'rainbow'); F.burst(T.pileEl('draw'), { shape: 'star', count: 18, spread: 120 }); });
        const flights = ev.cards.map((c, i) => T.fly(T.pileEl('draw'), T.cardsEl(ev.p), faceFor(ev.p, ty(c)), { delay: i * 160 }));
        await Promise.all(flights);
        step(ev);
        return;
      }
      case 'fog':
        SND.play('fog');
        fxDo(F => F.callout(ev.target === G.meta.viewer && G.meta.names[ev.target] === 'You' ? 'FOGGED!' : 'FOG SKIP!', 'fog'));
        react(ev.target, '😵');
        await fx('fog', { rect: seatRect(ev.target) }, 1600);
        step(ev);
        T.pulse(ev.target === G.meta.viewer ? $('mine') : T.seatEl(ev.target), 'fogpulse');
        mood('fog');
        return;
      case 'storm': {
        SND.play('thunder');
        SND.setRain(true);
        mood('rain');
        fxDo(F => { F.callout('STORM!', 'storm'); F.bump($('felt')); });
        ev.lost.forEach(l => react(l.p, '😱'));
        const done = fx('storm', {}, 1800);
        const flights = [];
        ev.lost.forEach(l => { for (let k = 0; k < l.n; k++) flights.push(T.fly(T.cardsEl(l.p, ev.name), T.pileEl('draw'), faceFor(l.p, ev.name) || (G.meta.openHands ? ev.name : null), { delay: 250 + k * 120, spin: 220, ms: 800 })); });
        for (let k = 0; k < ev.fromDiscard; k++) flights.push(T.fly(T.pileEl('discard'), T.pileEl('draw'), ev.name, { delay: 300 + k * 120, spin: -200, ms: 800 }));
        await Promise.all([done, ...flights]);
        step(ev);
        return;
      }
      case 'wind': {
        SND.play('whoosh');
        fxDo(F => F.callout('WIND TRADE!', 'wind'));
        react(ev.target, '🍃');
        const a = seatRect(ev.p), b = seatRect(ev.target);
        if (a && b) fx('wind', { from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y } });
        mood('wind');
        const see = q => q === G.meta.viewer || G.meta.openHands;
        const f1 = ev.gave ? T.fly(T.cardsEl(ev.p, ty(ev.gave)), T.cardsEl(ev.target), see(ev.p) || see(ev.target) ? ty(ev.gave) : null, { spin: 360, ms: 760 }) : null;
        const f2 = ev.took ? T.fly(T.cardsEl(ev.target, ty(ev.took)), T.cardsEl(ev.p), see(ev.p) || see(ev.target) ? ty(ev.took) : null, { spin: -360, ms: 760, delay: 120 }) : null;
        await Promise.all([f1, f2]);
        step(ev);
        return;
      }
      case 'discard': {
        SND.play('card');
        const from = T.rectOf(T.cardsEl(ev.p, ty(ev.card)));
        step(ev);
        await T.fly(from, T.pileEl('discard'), ty(ev.card), { spin: 8 });
        return;
      }
      case 'win': {
        step(ev);
        SND.setRain(false);
        fxDo(F => {
          const you = ev.p === G.meta.viewer && G.meta.names[ev.p] === 'You';
          F.callout(ev.how === 'night' ? 'NIGHT, NIGHT!' : you ? 'YOU WIN!' : G.meta.names[ev.p].toUpperCase() + ' WINS!', ev.how === 'night' ? 'night' : 'gold', { ms: 2400 });
          if (ev.how !== 'night') F.confetti();
        });
        react(ev.p, '🏆');
        if (ev.how === 'night') { SND.play('night'); fx('nightNight', {}); }
        else {
          SND.play('sparkle');
          fx('rainbow', {});
          const r = seatRect(ev.p);
          if (r) setTimeout(() => fx('sparkles', { x: r.x, y: r.y }), 600);
          mood('rainbow');
        }
        T.pulse(ev.p === G.meta.viewer ? $('mine') : T.seatEl(ev.p), 'winpulse');
        return;
      }
      default:
        step(ev);
    }
  }

  /** A played card flies to the spotlight, shows big for a moment, then lands on the discard pile. */
  async function spotlight(from, card, label, hold) {
    const spot = T.pileEl('spot'), sr = T.rectOf(spot);
    if (motion() === 'off' || !sr || !sr.height) { await T.spotlight(card, label, 0); T.clearSpot(); return; }
    await T.fly(from, spot, card, { spin: 14, ms: 520, size: sr.height, to: 1 });
    SND.play('slam');
    fxDo(F => F.ring(spot, '#fff6c8'));
    await T.spotlight(card, label, motion() === 'calm' ? 700 : hold);
    T.clearSpot();
    await T.fly(sr, T.pileEl('discard'), card, { ms: 420, size: sr.height, from: 1, to: 0.86, arc: 30 });
  }
  /** A player reacts with an emoji bubble over their nameplate (or over your rainbow). */
  function react(p, emoji) {
    const el = p === G.meta.viewer ? $('mine') : T.seatEl(p);
    if (!el) return;
    fxDo(F => F.react(el, emoji));
    SND.play('pop', 0.25);
  }
  function stopThinking() { document.querySelectorAll('.seat.thinking').forEach(el => el.classList.remove('thinking')); }
  function weatherLabel(ev) {
    const nm = q => (q === G.meta.viewer && G.meta.names[q] === 'You' ? 'You' : G.meta.names[q]);
    if (ev.card === 'fog') return 'Fog Skip → ' + nm(ev.target);
    if (ev.card === 'storm') return 'Storm on ' + C.TYPES[ev.name].name;
    if (ev.card === 'wind') return 'Wind Trade ⇄ ' + nm(ev.target);
    return C.TYPES[ev.card].name;
  }

  /** The sky between weather: clear, fog while someone will miss a turn, dusk once someone
   *  has played everything (the end is near). */
  function setMood() {
    if (G.disp.winner !== null) return;
    SND.setRain(false);
    const done = G.disp.laid.some(L => L.rainbow && (L.core || !G.st.rules.core));
    mood(G.disp.skips.some(k => k > 0) ? 'fog' : done ? 'dusk' : 'day');
  }

  /* ── sharing the switch ─────────────────────────────────────────────────── */
  function showCover(p, d) {
    G.meta.hidden = true;
    render();
    setScreen('cover', { p, block: d.kind === 'block' ? blockIntro(E.viewFor(G.st, p), d).replace(/ Block it\?$/, '') : null });
  }
  function takeSwitch(p) {
    G.meta.viewer = p;
    G.meta.hidden = false;
    closeCard();
    render();
    const inbox = G.meta.inbox[p];
    if (inbox && inbox.length) { N.say('While you waited: ' + inbox.join(' ')); G.meta.inbox[p] = []; }
    saveGame();
    loop();
  }

  /* ── pause, results, saving ─────────────────────────────────────────────── */
  function openPause() {
    if (!G.st || G.finished) return;
    G.paused = true;
    G.token++;
    N.hush();
    stopThinking();
    setScreen('pause');
  }
  function resume() {
    G.paused = false;
    closeCard();
    showTable();
    loop();
  }
  function gameOver() {
    if (G.finished) return;
    G.finished = true;
    store(GKEY, null);
    const st = stats(), w = G.st.winner, wonByPerson = isHuman(w.p);
    st.games++;
    const sk = G.cfg.players.find(p => p.kind === 'cpu');
    const skill = sk ? sk.skill : 'people';
    st.byskill[skill] = st.byskill[skill] || { games: 0, wins: 0 };
    st.byskill[skill].games++;
    if (wonByPerson) { st.wins++; st.byskill[skill].wins++; if (!st.fastest || G.st.turnNo < st.fastest) st.fastest = G.st.turnNo; }
    if (w.how === 'night' && wonByPerson) st.nightNight++;
    G.st.players.forEach((P, q) => { if (isHuman(q) && P.laid.rainbow) st.rainbows++; });
    store(TKEY, st);
  }
  function showResults() { setScreen('results'); }

  function saveGame() {
    if (!G.st || G.st.phase === 'over') return;
    const meta = Object.assign({}, G.meta, { hidden: false, viewer: humans() > 1 ? -1 : G.meta.viewer });
    const n = G.st.players.length;
    store(GKEY, { v: 1, cfg: G.cfg, state: G.st, meta, summary: (G.st.rules.emptyHand !== false ? 'Original rules · ' : '') + n + ' players · turn ' + G.st.turnNo });
  }
  function continueSaved() {
    const saved = load(GKEY);
    if (!saved || !saved.state) { setScreen('title'); return; }
    stopGame();
    G.st = saved.state; G.cfg = saved.cfg; G.meta = saved.meta; G.finished = false;
    G.meta.inbox = G.meta.inbox || {}; G.meta.hints = G.meta.hints || {}; G.meta.explained = G.meta.explained || {};
    G.disp = D.fromState(G.st);
    N.clearHistory();
    closeCard();
    showTable();
    N.say(G.st.rules.emptyHand !== false ? 'Welcome back. This saved game uses the original rules: empty your hand to win. Start a new game for the updated modes.' : 'Welcome back.');
    setMood();
    loop();
  }

  function goToHub() {
    if (choice) choice.sync(null);
    G.token++;
    saveGame();
    SND.stopAll();
    scanSpeak('Exiting to hub');
    setTimeout(() => {
      if (window.parent && window.parent !== window) window.parent.postMessage({ action: 'focusBackButton' }, '*');
      else window.location.href = '../../../index.html';
    }, 700);
  }
  function toMenu() {
    stopGame();
    saveGame();
    $('game').classList.remove('on');
    setScreen('title');
  }
  function openSettings() { resetArmed = 0; settingsReturn = { screen, opts: screenOpts }; setScreen('settings'); }
  function backFromSettings() {
    resetArmed = 0;
    const r = settingsReturn || { screen: 'title' };
    setScreen(r.screen, Object.assign({}, r.opts, { keep: false, restore: true }));
  }

  /* ══ SCREENS ═════════════════════════════════════════════════════════════ */
  const back = fn => ({ id: 'back', icon: '↩', label: 'Back', speech: 'Back', action: fn, cls: 'back' });
  const cycle = (list, v) => list[(list.indexOf(v) + 1) % list.length];
  const MODES = { classic: 'Chasing Rainbows Full', classicLite: 'Chasing Rainbows Lite', raceFull: 'Rainbow Race Full', race: 'Rainbow Race Lite', house: 'House Rules' };
  const COMPLEXITY = { classic: 'Most Complex', classicLite: 'More Complex', raceFull: 'Less Complex', race: 'Least Complex', house: 'Custom game' };
  const MODES_SAY = {
    classic: 'Mode: Chasing Rainbows Full. Most Complex. Weather cards, Sun and Rain, Day and Night.',
    classicLite: 'Mode: Chasing Rainbows Lite. More Complex. Weather cards and Sun and Rain, without Day and Night.',
    raceFull: 'Mode: Rainbow Race Full. Less Complex. Rainbow and Sun and Rain. Draw, play combos, then give a card to the right.',
    race: 'Mode: Rainbow Race Lite. Least Complex. Colors and Wilds only. Draw, play a Rainbow, then give a card to the right.',
    house: 'Mode: House Rules. You choose which cards are in the deck.',
  };
  const SKILLS = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
  const SKILLS_SAY = { easy: 'Computer players: Easy. They play loosely.', normal: 'Computer players: Normal. A fair game.', hard: 'Computer players: Hard. They remember what you take.' };
  const FIRSTS = { you: 'You', random: 'Random', rotate: 'Take turns' };
  const HELPERS = { off: 'Off', tips: 'Tips', shortcut: 'Tips + Shortcut' };
  const HELPERS_SAY = {
    off: 'Rainbow Helper off.',
    tips: 'Rainbow Helper: tips. A star marks a good choice, and you hear a tip when one helps.',
    shortcut: 'Rainbow Helper: tips and shortcut. The suggested move is also the first choice in your turn menu.',
  };
  const BLOCKS = { always: 'Always ask', affects: 'When it affects me', never: 'Never ask' };
  const BLOCKS_SAY = {
    affects: 'Block prompts: ask when it affects me. You are asked about Cloud Block when a weather card hits you.',
    always: 'Block prompts: always ask. You are asked whenever you could block.',
    never: 'Block prompts: never ask. You never block, and are never interrupted.',
  };
  const PACES = { slow: 'Slow', normal: 'Normal', quick: 'Quick' };
  const MOTIONS = { auto: 'Auto', full: 'Full', calm: 'Calm', off: 'Off' };
  const MOTIONS_SAY = {
    auto: 'Animations: auto. Full, unless your device asks for reduced motion.',
    full: 'Animations: full. Real weather and flying cards.',
    calm: 'Animations: calm. Gentle fades, no rain or flying cards.',
    off: 'Animations: off. Nothing moves.',
  };

  function logo() {
    // The rainbow friend from the Chasing Rainbows cover, drawn in the hub's colours.
    const bands = ['#ff0a3c', '#ff8000', '#ffde00', '#92d800', '#00b4e8', '#7a4ad8', '#d548d6'];
    const arcs = bands.map((c, i) => {
      const r = 92 - i * 10;
      return '<path d="M' + (110 - r) + ' 112 A' + r + ' ' + r + ' 0 0 1 ' + (110 + r) + ' 112" stroke="' + c + '" stroke-width="10" fill="none"/>';
    }).join('');
    const fan = ['storm', 'red', 'wild', 'sun', 'night'].map((t, k) =>
      '<img alt="" src="' + T.art(t) + '" style="--k:' + (k - 2) + '">').join('');
    return '<div class="logo"><div class="showfan" aria-hidden="true">' + fan + '</div>' +
      '<div class="titlerow"><svg viewBox="0 0 220 150" width="220" height="150" aria-hidden="true">' + arcs +
      '<rect x="22" y="104" width="176" height="34" rx="17" fill="#fff" stroke="#111" stroke-width="6"/>' +
      '<circle cx="100" cy="98" r="5" fill="#111"/><circle cx="120" cy="98" r="5" fill="#111"/></svg>' +
      '<h1 class="wordmark">Chasing Rainbows</h1></div><p class="by">by Inclusive Imagination®</p></div>';
  }
  const art = e => '<div class="emblem"><span>' + e + '</span></div>';
  const cardArt = t => '<img class="bigcard" alt="' + esc(C.TYPES[t].name) + '" src="' + T.art(t) + '">';

  function setupSummary() {
    const su = S.setup, people = Math.min(su.people, su.players), cpus = su.players - people;
    const who = people === 1 ? 'You' : people + ' people';
    return who + (cpus ? ' and ' + cpus + ' ' + SKILLS[su.skill].toLowerCase() + ' computer player' + (cpus > 1 ? 's' : '') : '') + '.';
  }

  const HOWTO = [
    { e: '🌈', t: 'The Goal', s: '<p>Be the first to play your required combos: a <b>Rainbow</b>, plus <b>Sun & Rain</b> in every preset except Rainbow Race Lite.</p><p>You can win with cards left! Have <b>7 or fewer</b> and <b>no Legends</b> left in your hand.</p>' +
      '<p>A Rainbow is seven cards: red, orange, yellow, green, blue, indigo and violet. A <b>Wild</b> can stand in for any color.</p>' },
    { e: '🃏', t: 'Your Turn', s: '<p><b>Chasing Rainbows Full & Lite:</b> draw a card, or take the top card of the discard pile.</p>' +
      '<p><b>2. Play</b> any combo you have, and up to <b>one weather card</b>.</p>' +
      '<p><b>3. Discard</b> one card, or end your turn. If over 7, discard down to <b>7</b>. Play your Action before discarding; once you discard, you can only finish discarding.</p>' },
    { e: '🤲', t: 'Rainbow Race Turns', s: '<p><b>Both Rainbow Race modes:</b> receive the card passed from your left, draw from the pile, play ready combos, then <b>give a card to the next player on your right</b>. Give extra cards if needed to reach 7. When the pile is empty, keep playing and passing.</p>' },
    { e: '🌦️', t: 'Combos', s: '<p><b>Rainbow</b>: one of each color. <b>Sun & Rain</b>: one of each. Both are needed except in <b>Rainbow Race Lite</b>, which needs only a Rainbow.</p>' +
      '<p><b>Day & Night</b> appear in Chasing Rainbows Full. A Legend in your hand blocks a win. Play them together, trade them with Wind or remove them with Storm. Night can still be discarded as your very last card after the required combos: <b>Night, Night!</b></p>' },
    { e: '⛈️', t: 'Weather Cards', s: '<p><b>Double Draw</b>: draw two. <b>Fog Skip</b>: a player misses a turn. <b>Wind Trade</b>: swap a card with a player.</p>' +
      '<p><b>Storm Shuffle</b>: name a card, and every copy goes back in the deck. <b>Cloud Block</b> stops a weather card, any time.</p>' +
      '<p>A weather card on top of the discard pile <b>freezes</b> it: nobody can take it.</p>' },
    { e: '🔘', t: 'Playing with Switches', s: '<p>Tap <b>Space</b> to move, <b>hold Space</b> to go back, <b>Enter</b> to choose. With Auto Scan, Enter is all you need.</p>' +
      '<p><b>Look</b> reads your hand, your rainbow and the table. <b>Pause</b> is always the last choice. Holding Enter for five seconds pauses too.</p>' +
      '<p>A <b>★</b> marks the Rainbow Helper\'s suggestion.</p>' },
    { e: '👥', t: 'Ways to Play', s: '<p><b>Chasing Rainbows Full — Most Complex:</b> all cards.</p><p><b>Chasing Rainbows Lite — More Complex:</b> no Day or Night.</p><p><b>Rainbow Race Full — Less Complex:</b> colors, Wilds, Sun and Rain.</p><p><b>Rainbow Race Lite — Least Complex:</b> colors and Wilds only.</p>' +
      '<p><b>House Rules</b>: choose which cards are in the deck.</p>' +
      '<p><b>Share the switch</b>: up to six people take turns at one screen. Your hand is hidden until you say you\'re ready.</p>' },
  ];

  const SCREENS = {
    title: () => {
      const saved = load(GKEY);
      const list = [];
      if (saved && saved.state) list.push({ id: 'continue', icon: '▶️', label: 'Continue Game', primary: true, note: esc(saved.summary || ''), speech: 'Continue game. ' + (saved.summary || '').replace('·', ','), action: continueSaved });
      list.push(
        { id: 'new', icon: '🌈', label: 'New Game', primary: !saved, note: esc(setupSummary()), speech: 'New game', action: () => setScreen('setup') },
        { id: 'howto', icon: '❓', label: 'How to Play', speech: 'How to play', action: () => setScreen('howto', { page: 0 }) },
        { id: 'gallery', icon: '🖼️', label: 'Card Gallery', speech: 'Card gallery', action: () => setScreen('gallery', { page: 0 }) },
        { id: 'settings', icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings },
        { id: 'credits', icon: '💛', label: 'Credits', speech: 'Credits', action: () => setScreen('credits') },
        { id: 'exit', icon: '🏠', label: 'Exit Game', speech: 'Exit game', action: goToHub });
      return { art: logo(), cardClass: 'title', items: list, layout: 'grid2',
        speech: 'Chasing Rainbows. ' + (saved ? 'Continue Game, ' : '') + 'New Game, How to Play, Card Gallery, Settings, Credits, or Exit Game.' };
    },

    setup: () => {
      const su = S.setup, people = Math.min(su.people, su.players), cpus = su.players - people;
      const set = (fn, say) => { fn(); saveSettings(); refresh(); scanSpeak(say); };
      const list = [
        { id: 'start', icon: '🌈', label: 'Start Game', primary: true, note: esc(setupSummary()), speech: 'Start game. ' + setupSummary(), action: () => startNew() },
        { id: 'mode', icon: '🎴', label: 'Mode', value: MODES[su.mode], note: COMPLEXITY[su.mode], speech: MODES_SAY[su.mode],
          action: () => { const n = cycle(Object.keys(MODES), su.mode); set(() => { su.mode = n; }, MODES_SAY[n]); } },
        { id: 'players', icon: '👥', label: 'Players', value: String(su.players), speech: 'Players: ' + su.players,
          action: () => { const n = su.players >= 6 ? 2 : su.players + 1; set(() => { su.players = n; su.people = Math.min(su.people, n); }, 'Players: ' + n); } },
        { id: 'people', icon: '🙋', label: 'People sharing the switch', value: String(people),
          speech: 'People sharing the switch: ' + people + (cpus ? '. The other ' + cpus + (cpus === 1 ? ' is a computer player.' : ' are computer players.') : '. No computer players.'),
          action: () => { const n = people >= su.players ? 1 : people + 1; set(() => { su.people = n; }, 'People sharing the switch: ' + n + (su.players - n ? '. The other ' + (su.players - n) + (su.players - n === 1 ? ' is a computer player.' : ' are computer players.') : '. No computer players.')); } },
        { id: 'skill', icon: '🤖', label: 'Computer players', value: SKILLS[su.skill], enabled: cpus > 0, note: cpus ? '' : 'Everyone is a person', speech: SKILLS_SAY[su.skill],
          action: () => { const n = cycle(Object.keys(SKILLS), su.skill); set(() => { su.skill = n; }, SKILLS_SAY[n]); } },
        { id: 'first', icon: '🥇', label: 'Who goes first', value: people > 1 && su.first === 'you' ? 'Player 1' : FIRSTS[su.first], speech: 'Who goes first: ' + (people > 1 && su.first === 'you' ? 'Player 1' : FIRSTS[su.first]),
          action: () => { const n = cycle(Object.keys(FIRSTS), su.first); set(() => { su.first = n; }, 'Who goes first: ' + (people > 1 && n === 'you' ? 'Player 1' : FIRSTS[n])); } },
        { id: 'open', icon: '👐', label: 'Open hands', value: su.openHands ? 'On' : 'Off',
          speech: su.openHands ? 'Open hands on. Everyone\'s cards are face up, for learning or playing with a helper.' : 'Open hands off.',
          action: () => set(() => { su.openHands = !su.openHands; }, su.openHands ? 'Open hands off.' : 'Open hands on. Everyone\'s cards are face up, for learning or playing with a helper.') },
      ];
      if (su.mode === 'house') list.push({ id: 'house', icon: '🏠', label: 'House Rules', speech: 'House rules', action: () => setScreen('house') });
      list.push(back(() => setScreen('title', { restore: true })));
      return { art: art('🌈'), title: 'New Game', items: list, layout: 'grid2', size: 'wide', speech: 'New game. ' + setupSummary() + ' Start game, or change the setup.' };
    },

    house: () => {
      const h = S.setup.house;
      const set = (fn, say) => { fn(); saveSettings(); refresh(); scanSpeak(say); };
      const list = C.WEATHER.map(w => ({ id: 'w-' + w, icon: '<img class="mini" alt="" src="' + T.art(w) + '">', label: C.TYPES[w].name, value: h.weather[w] ? 'In' : 'Out',
        speech: C.TYPES[w].name + (h.weather[w] ? ', in the deck' : ', left out'),
        action: () => set(() => { h.weather[w] = !h.weather[w]; }, C.TYPES[w].name + (h.weather[w] ? ', left out' : ', in the deck')) }));
      list.push(
        { id: 'core', icon: '🌦️', label: 'Sun & Rain', value: h.core ? 'In' : 'Out', speech: h.core ? 'Sun and Rain, in the deck. You need them to win.' : 'Sun and Rain, left out. A Rainbow is all you need.',
          action: () => set(() => { h.core = !h.core; }, h.core ? 'Sun and Rain, left out. A Rainbow is all you need.' : 'Sun and Rain, in the deck. You need them to win.') },
        { id: 'legend', icon: '🌗', label: 'Day & Night', value: h.legend ? 'In' : 'Out', speech: 'Day and Night, ' + (h.legend ? 'in the deck' : 'left out'),
          action: () => set(() => { h.legend = !h.legend; }, 'Day and Night, ' + (h.legend ? 'left out' : 'in the deck')) },
        { id: 'draw', icon: '🤲', label: 'Draw from', value: h.draw === 'player' ? 'A player' : 'Discard pile',
          speech: h.draw === 'player' ? 'Draw from the pile, or take a card from a player.' : 'Draw from the pile, or take the top of the discard pile.',
          action: () => set(() => { h.draw = h.draw === 'player' ? 'discard' : 'player'; }, h.draw === 'player' ? 'Draw from the pile, or take the top of the discard pile.' : 'Draw from the pile, or take a card from a player.') },
        { id: 'chains', icon: '☁️', label: 'Block a Block', value: h.blockChains ? 'On' : 'Off',
          speech: h.blockChains ? 'Block a block on. A Cloud Block can itself be blocked by another Cloud.' : 'Block a block off.',
          action: () => set(() => { h.blockChains = !h.blockChains; }, h.blockChains ? 'Block a block off.' : 'Block a block on. A Cloud Block can itself be blocked by another Cloud.') },
        back(() => setScreen('setup', { restore: true })));
      return { art: art('🏠'), title: 'House Rules', sub: 'Choose what is in the deck.', items: list, layout: 'cols2', size: 'wide', speech: 'House rules. Choose what is in the deck.' };
    },

    howto: o => {
      const page = o.page || 0, pg = HOWTO[page];
      const list = [page < HOWTO.length - 1
        ? { id: 'next', icon: '▶', label: 'Next: ' + HOWTO[page + 1].t, speech: 'Next page. ' + HOWTO[page + 1].t, action: () => setScreen('howto', { page: page + 1 }) }
        : { id: 'gallery', icon: '🖼️', label: 'Card Gallery', speech: 'Card gallery', action: () => setScreen('gallery', { page: 0 }) }];
      if (page > 0) list.push({ id: 'prev', icon: '◀', label: 'Previous', speech: 'Previous page', action: () => setScreen('howto', { page: page - 1 }) });
      list.push(back(() => backFromHelp()));
      return { art: art(pg.e), title: '<span class="kicker">How to Play · ' + (page + 1) + ' of ' + HOWTO.length + '</span>' + pg.t,
        sub: pg.s, cardClass: 'howto', items: list, layout: 'row',
        speech: 'How to play, page ' + (page + 1) + ' of ' + HOWTO.length + '. ' + pg.t + '. ' + strip(pg.s.replace(/<\/p>/g, ' ')) };
    },

    gallery: o => {
      const page = o.page || 0, t = C.ORDER[page], info = C.TYPES[t];
      const cls = { color: 'Color card', core: 'Core card', legend: 'Legend card', weather: 'Weather card' }[info.cls];
      const list = [
        { id: 'next', icon: '▶', label: 'Next card', speech: 'Next card', action: () => setScreen('gallery', { page: (page + 1) % C.ORDER.length }) },
        { id: 'prev', icon: '◀', label: 'Previous card', speech: 'Previous card', action: () => setScreen('gallery', { page: (page + C.ORDER.length - 1) % C.ORDER.length }) },
        back(() => backFromHelp()),
      ];
      return { art: cardArt(t), title: '<span class="kicker">' + cls + ' · ' + info.copies + (info.copies === 1 ? ' in each deck' : ' in each deck') + '</span>' + esc(info.name),
        sub: '<p>' + esc(C.ruleFor(t)) + '</p>', cardClass: 'gallery', items: list, layout: 'row',
        speech: info.name + '. ' + cls + '. ' + C.ruleFor(t) };
    },

    settings: () => {
      const v = vm(), s = sm();
      const tts = v ? v.getSettings().ttsEnabled : true;
      const voiceName = v && v.getVoiceDisplayName ? v.getVoiceDisplayName(v.getCurrentVoice()) : 'Default';
      const auto = s ? s.getSettings().autoScan : false, speed = s ? s.getScanInterval() : 2000;
      const set = (k, val, say) => { S[k] = val; saveSettings(); applyLook(); refresh(); scanSpeak(say); };
      const list = [
        { id: 'tts', icon: '🗣️', label: 'Text to Speech', value: tts ? 'On' : 'Off', speech: 'Text to speech, ' + (tts ? 'on' : 'off'),
          action: () => { if (v) { v.toggleTTS(); refresh(); if (v.getSettings().ttsEnabled) scanSpeak('Text to speech on'); } } },
        { id: 'voice', icon: '🎙️', label: 'Voice', value: voiceName, speech: 'Voice, ' + voiceName,
          action: () => { if (v) { v.cycleVoice(); refresh(); scanSpeak('Voice changed'); } } },
        { id: 'helper', icon: '⭐', label: 'Rainbow Helper', value: HELPERS[S.helper], speech: HELPERS_SAY[S.helper],
          action: () => { const n = cycle(Object.keys(HELPERS), S.helper); set('helper', n, HELPERS_SAY[n]); } },
        { id: 'blocks', icon: '☁️', label: 'Block prompts', value: BLOCKS[S.blockPrompts], speech: BLOCKS_SAY[S.blockPrompts],
          action: () => { const n = cycle(Object.keys(BLOCKS), S.blockPrompts); set('blockPrompts', n, BLOCKS_SAY[n]); } },
        { id: 'pace', icon: '⏱️', label: 'Turn pace', value: PACES[S.pace], speech: 'Turn pace, ' + PACES[S.pace] + '. How quickly the computer players move.',
          action: () => { const n = cycle(Object.keys(PACES), S.pace); set('pace', n, 'Turn pace, ' + PACES[n]); } },
        { id: 'autodraw', icon: '🂠', label: 'Auto-draw', value: S.autoDraw ? 'On' : 'Off',
          speech: S.autoDraw ? 'Auto draw on. When drawing is your only choice, the game draws for you.' : 'Auto draw off.',
          action: () => set('autoDraw', !S.autoDraw, S.autoDraw ? 'Auto draw off.' : 'Auto draw on. When drawing is your only choice, the game draws for you.') },
        { id: 'confirm', icon: '✔️', label: 'Confirm discards / passes', value: S.confirmDiscard ? 'On' : 'Off',
          speech: S.confirmDiscard ? 'Confirm discards and passes on. You choose a card, then confirm it.' : 'Confirm discards and passes off.',
          action: () => set('confirmDiscard', !S.confirmDiscard, S.confirmDiscard ? 'Confirm discards and passes off.' : 'Confirm discards and passes on. You choose a card, then confirm it.') },
        { id: 'captions', icon: '💬', label: 'Captions', value: S.captions ? 'On' : 'Off', speech: 'Captions, ' + (S.captions ? 'on' : 'off'),
          action: () => set('captions', !S.captions, 'Captions ' + (S.captions ? 'off' : 'on')) },
        { id: 'motion', icon: '🌦️', label: 'Animations', value: MOTIONS[S.motion], speech: MOTIONS_SAY[S.motion],
          action: () => { const n = cycle(Object.keys(MOTIONS), S.motion); set('motion', n, MOTIONS_SAY[n]); } },
        { id: 'size', icon: '🔍', label: 'Text Size', value: Math.round(S.textSize * 100) + '%', speech: 'Text size, ' + Math.round(S.textSize * 100) + ' percent',
          action: () => { const n = cycle([1, 1.15, 1.3, 1.5], S.textSize); set('textSize', n, 'Text size, ' + Math.round(n * 100) + ' percent'); } },
        { id: 'auto', icon: '🔁', label: 'Auto Scan', value: auto ? 'On — One Switch' : 'Off — Two Switches',
          speech: auto ? 'Auto scan on. One switch: Enter chooses.' : 'Auto scan off. Two switches: Space moves, Enter chooses.',
          action: () => { if (!s) return; s.toggleAutoScan(); refresh(); scanSpeak(s.getSettings().autoScan ? 'Auto scan on. One switch. Enter chooses.' : 'Auto scan off. Two switches. Space moves, Enter chooses.'); } },
        { id: 'speed', icon: '⏲️', label: 'Scan Speed', value: (speed / 1000) + 's', speech: 'Scan speed, ' + (speed / 1000) + ' seconds',
          action: () => { if (s) { s.cycleScanSpeed(); refresh(); scanSpeak('Scan speed ' + (s.getScanInterval() / 1000) + ' seconds'); } } },
        { id: 'sfx', icon: '🔊', label: 'Sound Effects', value: S.sfx ? 'On' : 'Off', speech: 'Sound effects, ' + (S.sfx ? 'on' : 'off'),
          action: () => set('sfx', !S.sfx, 'Sound effects ' + (S.sfx ? 'off' : 'on')) },
        { id: 'wsfx', icon: '🌧️', label: 'Weather Sounds', value: S.weatherSounds ? 'On' : 'Off', speech: 'Weather sounds, ' + (S.weatherSounds ? 'on' : 'off') + '. Rain, wind and thunder.',
          action: () => set('weatherSounds', !S.weatherSounds, 'Weather sounds ' + (S.weatherSounds ? 'off' : 'on')) },
        { id: 'reset', icon: '🗑️', label: 'Reset Progress', value: resetArmed ? 'Sure?' : '', cls: resetArmed ? 'armed' : '',
          speech: resetArmed ? 'Select again to erase your wins and records' : 'Reset progress',
          action: () => {
            if (resetArmed && Date.now() - resetArmed < RESET_ARM_MS) { resetArmed = 0; store(TKEY, null); refresh(); scanSpeak('Progress reset'); }
            else { resetArmed = Date.now(); refresh(); scanSpeak('Select again to erase your wins and records'); }
          } },
        back(backFromSettings),
      ];
      return { title: 'Settings', items: list, layout: 'cols2', size: 'wide', speech: 'Settings' };
    },

    pause: () => ({
      art: art('⏸️'), title: 'Paused', sub: 'The game is saved.',
      items: [
        { id: 'continue', icon: '▶️', label: 'Continue', primary: true, speech: 'Continue', action: resume },
        { id: 'help', icon: '🆘', label: 'Help', speech: 'Help', action: () => scanSpeak('I need help') },
        { id: 'howto', icon: '❓', label: 'How to Play', speech: 'How to play', action: () => setScreen('howto', { page: 0, from: 'pause' }) },
        { id: 'settings', icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings },
        { id: 'restart', icon: '🔄', label: 'Restart', speech: 'Restart', action: () => setScreen('confirmRestart') },
        { id: 'menu', icon: '🏠', label: 'Main Menu', note: 'The game is saved', speech: 'Main menu. The game is saved.', action: toMenu },
        { id: 'exit', icon: '🚪', label: 'Exit Game', note: 'The game is saved', speech: 'Exit game. The game is saved.', action: goToHub },
      ],
      layout: 'grid2', speech: 'Paused. Continue, Help, How to Play, Settings, Restart, Main Menu, or Exit Game.',
    }),

    confirmRestart: () => ({
      art: art('🔄'), title: 'Start Over?', sub: 'This game ends and a new one is dealt.',
      items: [
        { id: 'keep', icon: '↩', label: 'Keep Playing', primary: true, speech: 'Keep playing', action: () => setScreen('pause', { restore: true }) },
        { id: 'restart', icon: '🔄', label: 'Start Over', speech: 'Start over', action: () => { closeCard(); startNew(G.cfg); } },
      ],
      layout: 'row', speech: 'Start over? This game ends and a new one is dealt. Keep playing, or start over.',
    }),

    cover: o => {
      const name = G.meta.names[o.p];
      const title = o.block ? name + ', a chance to block!' : name + '\'s turn';
      const sub = (o.block ? '<p>' + esc(o.block) + '.</p>' : '') + '<p>Pass the switch to <b>' + esc(name) + '</b>. Everyone else, no peeking!</p>';
      return { art: '<div class="emblem pc" style="--pc:' + T.PLAYER_COLORS[o.p % T.PLAYER_COLORS.length] + '"><span>🙂</span></div>', title, sub, scrim: true,
        items: [
          { id: 'ready', icon: '👀', label: 'Show my cards', primary: true, note: 'I\'m ' + esc(name), speech: 'Show my cards. I am ' + name + '.', action: () => takeSwitch(o.p) },
          { id: 'pause', icon: '⏸️', label: 'Pause', speech: 'Pause', action: openPause },
        ],
        layout: 'row', speech: title + '. ' + (o.block ? o.block + '. ' : '') + 'Pass the switch to ' + name + '. Then choose Show my cards.' };
    },

    results: () => {
      const w = G.st.winner, names = G.meta.names, person = isHuman(w.p);
      const winner = humans() === 1 && person ? 'You' : names[w.p];
      const title = winner === 'You' ? 'You Win!' : winner + ' Wins!';
      const how = w.how === 'night' ? 'Night, Night! The last card was Night.' : 'Caught the rainbow!';
      const st = stats(), sk = G.cfg.players.find(p => p.kind === 'cpu');
      let record = '';
      if (sk && humans() === 1) { const r = st.byskill[sk.skill] || { games: 0, wins: 0 }; record = 'Your record against ' + SKILLS[sk.skill] + ': ' + r.wins + ' of ' + r.games + '.'; }
      const board = G.st.players.map((P, q) => '<tr' + (q === w.p ? ' class="won"' : '') + '><td>' + esc(q === G.meta.viewer && names[q] === 'You' ? 'You' : names[q]) + '</td><td>' +
        (P.laid.rainbow ? '🌈' : '·') + '</td><td>' + (G.st.rules.core ? (P.laid.core ? '🌦️' : '·') : '') + '</td><td>' + (P.laid.legend ? '🌗' : '') + '</td><td>' + P.hand.length + ' left</td></tr>').join('');
      if (person) setTimeout(() => fxDo(F => F.confetti({ count: 60 })), 250);
      return { art: art(w.how === 'night' ? '🌙' : person ? '🏆' : '🌈'), title, cardClass: 'results' + (person ? ' win' : ''), size: 'wide', scrim: true,
        sub: '<p>' + how + (w.legend ? ' With Day and Night too!' : '') + ' ' + G.st.turnNo + ' turns.</p>' + (record ? '<p>' + record + '</p>' : '') + '<table class="board">' + board + '</table>',
        items: [
          { id: 'again', icon: '🔄', label: 'Play Again', primary: true, note: 'Same setup', speech: 'Play again, same setup', action: () => { closeCard(); startNew(); } },
          { id: 'setup', icon: '🎴', label: 'Change Setup', speech: 'Change setup', action: () => { $('game').classList.remove('on'); setScreen('setup'); } },
          { id: 'menu', icon: '🏠', label: 'Main Menu', speech: 'Main menu', action: () => { stopGame(); $('game').classList.remove('on'); setScreen('title'); } },
          { id: 'exit', icon: '🚪', label: 'Exit Game', speech: 'Exit game', action: goToHub },
        ],
        layout: 'grid2', speech: title + ' ' + how + (w.legend ? ' With Day and Night too!' : '') + ' ' + record };
    },

    credits: () => ({
      art: art('💛'), title: 'Credits', size: 'wide',
      sub: "<p><b>Chasing Rainbows ICG</b> is a game by <b>Inclusive Imagination®</b>.</p><p>Card Art by <b>Adam M Botsford</b>. Chasing Rainbows, its rules and card art are TM &amp; © 2026 Inclusive Imagination LLC.</p><p>Switch Access Edition by <b>NARBE House</b>, for Benny’s Hub.</p><p>Inclusive Imagination® Home: https://inclusiveimagination.co/</p><p>Inclusive Imagination® Social Handle: @inclusiveimagination</p>",
      items: [
        { id: 'creator-website', icon: '🌐', label: 'Inclusive Imagination® website', speech: 'Open the Inclusive Imagination website in your browser', action: () => {
          const url = 'https://inclusiveimagination.co/';
          if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(url);
          else window.open(url, '_blank', 'noopener,noreferrer');
        } },
        back(() => setScreen('title', { restore: true })),
      ],
      speech: "Credits. Chasing Rainbows ICG is a game by Inclusive Imagination. Card Art by Adam M Botsford. Chasing Rainbows, its rules and card art are trademark and copyright 2026 Inclusive Imagination LLC. Switch Access Edition by NARBE House, for Benny’s Hub. Inclusive Imagination Home: inclusive imagination dot co. Inclusive Imagination Social Handle: at inclusive imagination.",
    }),
  };
  function backFromHelp() {
    if (screenOpts && screenOpts.from === 'pause') { setScreen('pause', { restore: true }); return; }
    if (G.paused) { setScreen('pause', { restore: true }); return; }
    setScreen('title', { restore: true });
  }

  /* ══ boot ════════════════════════════════════════════════════════════════ */
  function init() {
    T.init();
    buildDom();
    N.init($('caption'));
    SND.init();
    if (window.CRSky) { try { window.CRSky.init($('sky')); skyOk = true; } catch (e) { console.warn('The weather sky could not start', e); } }
    applyLook();
    initChoice();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('narbe-input-cancelled', onBlur);
    if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', applyLook);
    const s = sm();
    if (s && s.subscribe) s.subscribe(() => {
      if (ctx !== 'card') return;
      if (screen === 'settings') refresh(); else $('hint').innerHTML = meta.hint !== undefined ? meta.hint : defaultHint();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      onBlur();
      if (ctx === 'table' && G.st && !G.finished) openPause();
    });
    setScreen('title');
  }

  window.CRApp = {
    /** For checks and the console: never used by the game itself. */
    __dbg: () => {
      const st = choice && choice.getState(), cur = choice && choice.active ? choice.context : null;
      return {
        ctx, screen, levels: levels.map(l => l.key), choice: st,
        ids: cur ? cur.items.map(i => i.id) : [], kinds: cur ? cur.items.map(i => (i.ref && (i.ref.kind || 'card')) || '') : [],
        stars: cur ? cur.items.map(i => !!(i.ref && i.ref.star)) : [],
        waiting: !!(tableRoot && tableRoot.waiting), busy: G.busy, paused: G.paused,
        turn: G.st && G.st.turn, phase: G.st && G.st.phase, turnNo: G.st && G.st.turnNo, viewer: G.meta && G.meta.viewer,
        decision: G.st ? E.getDecision(G.st).kind : null, caption: $('caption').textContent,
      };
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
