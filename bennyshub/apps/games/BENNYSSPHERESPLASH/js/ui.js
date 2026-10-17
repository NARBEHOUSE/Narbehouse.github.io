/** Benny's Sphere Splash - every screen, and all switch input.
 *
 * NARBE Racer's card engine (NARBEKART/js/ui.js): every menu is SCREENS[name](opts)
 * returning { title, sub, items, speech, startIndex, listenFirst, layout, size, stats },
 * rendered into one card and fitted so it never needs a scrollbar.
 *
 * Three input contexts (ACCESSIBILITY.md §4: "If Ben stops pressing, does anything keep
 * happening?"):
 *   card   CHOICE. A menu card is up.
 *   world  CHOICE. A decision is on the scene and the match is frozen: the choice plates
 *          beside the carrier, the teammates themselves (pass targets) and the on-screen
 *          Pause button. Holding Enter opens Pause from here too (the native hold).
 *   live   MECHANIC. The match is playing. A short press of either switch opens the
 *          Huddle. Holding Enter opens Pause directly, with Racer's "keep holding" ring
 *          and rising ticks.
 * Both choice contexts run on the hub's shared choice scanner (NarbeChoiceScanAdapter):
 * the blank stop on every lap, Auto Scan, parking, the Space brake and Wait for Speech
 * all come from it and from the player's Hub Settings. This file owns the keys, the
 * hold-to-scan-backwards and hold-to-pause gestures, and what each item does.
 * Everything fires on RELEASE. A press of any length short of the full pause hold
 * is an ordinary press - a player may hold a switch for seconds without meaning to.
 *
 * Every new card and decision opens on the blank (nothing highlighted); Back from a
 * nested screen lands on the item that opened it; an in-place change (a setting's
 * value, arming Reset) keeps the highlight. Enter on the blank does nothing.
 * The focus marker (Fish Mystery's brackets) is the same on cards and in the world.
 */
SS.ui = (function () {
  'use strict';
  const hubGraphics = NarbeGraphics.openGame('spheresplash');

  const U = SS.util, $ = U.$;

  /* ── Tuning. Never quoted to the player (ACCESSIBILITY.md §4). ──────────── */
  const SCAN_BACK_HOLD = 3000;
  const SCAN_BACK_REPEAT = 2000;   // if the scan manager is missing
  const PAUSE_HOLD_SHOW = 2000;    // the ring appears, so the gesture is discoverable
  const PAUSE_HOLD_MS = 5000;      // Pause opens
  const GHOST_MS = 380;            // a new card ignores taps this soon (touch -> click echo)
  const RESET_ARM_MS = 6000;

  /* ── state ───────────────────────────────────────────────────────────── */
  let ctx = 'none';                // none | card | world | live
  let screen = null, screenOpts = {}, meta = {}, items = [], index = -1;
  let world = null;                // the open decision: { spec, index }
  let openedAt = 0, resetArmed = 0;
  let settingsReturn = null, cardReturn = null;
  const down = { Space: false, Enter: false }, downAt = { Space: 0, Enter: 0 };
  const ignore = { Space: false, Enter: false };
  let backHold = null, backRepeat = null, didBack = false, braking = false;
  let choice = null, lastLit = null;
  const memory = new Map();        // card -> the item that was lit when it was left, for Back
  let pauseWatch = null, pauseTicks = 0;

  const G = () => SS.game;
  const isAuto = () => { const s = U.sm(); return !!(s && s.getSettings().autoScan); };
  const interval = () => { const s = U.sm(); return s ? s.getScanInterval() : SCAN_BACK_REPEAT; };
  const setting = k => SS.save.settings.get(k);

  /* ══ the card ═══════════════════════════════════════════════════════════ */
  function buildDom() {
    const ov = $('overlay');
    ov.innerHTML = '<div id="card" class="card" role="dialog" aria-live="polite"><div id="cardStatus"></div>' +
      '<div class="band" aria-hidden="true"></div><div id="cardArt" class="art"></div>' +
      '<h1 id="cardTitle"></h1><p id="cardSub"></p><div id="cardStats"></div>' +
      '<div id="menu" class="menu"></div><p id="hint"></p></div>';
    U.addTap($('pauseBtn'), () => {
      if (ctx === 'live' || ctx === 'world') openPause();
      else if (ctx === 'card' && screen === 'huddle') setScreen('pause');
    });
    // Mouse and touch in live play: a tap on the water opens the Huddle, like a press.
    U.addTap($('canvasWrap'), () => { if (ctx === 'live' && performance.now() - openedAt > GHOST_MS) G().openHuddle(); });
    window.addEventListener('resize', refitSoon);
  }

  const selectable = it => !!it && it.enabled !== false && !it.header;

  function renderCard() {
    const menu = $('menu');
    menu.innerHTML = '';
    menu.className = 'menu ' + (meta.layout || 'list');
    if (meta.layout === 'cols2') menu.style.gridTemplateRows = 'repeat(' + Math.ceil(items.length / 2) + ', auto)';
    else menu.style.gridTemplateRows = '';
    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'item' + (it.wide ? ' wide' : '') + (it.header ? ' header' : '') + (it.enabled === false && !it.header ? ' locked' : '') +
        (it.primary ? ' primary' : '') + (it.cls ? ' ' + it.cls : '');
      let html = '';
      if (it.icon) html += '<span class="ic">' + it.icon + '</span>';
      html += '<span class="lb"><span class="nm">' + it.label + '</span>' + (it.note ? '<small>' + it.note + '</small>' : '') + '</span>';
      if (it.value !== undefined && it.value !== '') html += '<span class="val">' + U.esc(it.value) + '</span>';
      el.innerHTML = html;
      if (!it.header) {
        U.addTap(el, () => {
          if (performance.now() - openedAt < GHOST_MS) return;     // the tail of the tap that opened this card
          if (it.enabled === false) { SS.audio.menu('blocked'); return; }
          pick(i);
        });
        el.addEventListener('mouseenter', () => { if (selectable(it) && index !== i) point(i); });
      }
      it.el = el;
      menu.appendChild(el);
    });
  }

  /** No card may ever need a scrollbar: try the tight layout, then scale (never below 0.6). */
  function fitCard() {
    const card = $('card'), ov = $('overlay');
    card.classList.remove('tight'); card.style.transform = ''; card.style.maxHeight = '';
    const cs = getComputedStyle(ov);
    const room = ov.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - 8;
    // The card's whole content, not its box: max-height caps the box and lets the content spill
    // out of it unseen (Settings' last row and hint hung below the card at 1368x840).
    const natural = () => Math.max(card.getBoundingClientRect().height, card.scrollHeight + 10);
    let h = natural();
    if (h <= room) return;
    card.classList.add('tight');
    h = natural();
    if (h <= room) return;
    card.style.maxHeight = 'none';
    h = card.getBoundingClientRect().height;
    const k = Math.max(0.6, room / h);
    // Scaled about its centre, it stays centred in the overlay: no margin to make up.
    card.style.transform = 'scale(' + k.toFixed(3) + ')';
  }
  let refitTimer = null;
  function refitSoon() { clearTimeout(refitTimer); refitTimer = setTimeout(() => { if (ctx === 'card') fitCard(); }, 140); }

  /** A card or a decision appears. A switch still held belongs to whatever opened it. */
  function swallowHeld() {
    ['Space', 'Enter'].forEach(k => { if (down[k]) ignore[k] = true; });
    clearKeys();
    openedAt = performance.now();
  }

  /** opts.keep = the same card redrawn in place (a setting changed): the highlight stays on
   *  the same item. opts.restore = Back: land on the item this card was left from. */
  const memKey = (name, opts) => name + (opts && opts.side != null ? ':' + opts.side : '');
  function setScreen(name, opts) {
    const builder = SCREENS[name];
    if (!builder) return;
    opts = opts || {};
    const wasCard = ctx === 'card', keep = !!opts.keep && wasCard && screen === name;
    if (wasCard && screen && choice && choice.active) memory.set(memKey(screen, screenOpts), choice.getState().id);
    screen = name; screenOpts = opts;
    meta = builder(opts) || {};
    items = meta.items || [];
    index = -1;

    leaveWorld();
    ctx = 'card';
    const ov = $('overlay'), card = $('card');
    ov.classList.add('on');
    ov.classList.toggle('scrim', !!meta.scrim);
    card.className = 'card size-' + (meta.size || 'normal') + (meta.cardClass ? ' ' + meta.cardClass : '');
    if (opts.announce !== false) { void card.offsetWidth; card.classList.add('enter'); }
    $('cardArt').innerHTML = meta.art || '';
    $('cardTitle').innerHTML = meta.title || '';
    $('cardSub').innerHTML = meta.sub || '';
    $('hint').innerHTML = meta.hint || defaultHint();
    renderCard();
    if (!keep) swallowHeld();
    showChrome();
    fitCard();
    SS.broadcast.hush();
    syncChoice({ fresh: !keep, restoreId: opts.restore ? memory.get(memKey(name, opts)) : null });
    showFocus();
    if (!keep && meta.announce !== false && opts.announce !== false) {
      announceOpen(opts.restore ? U.stripTags(meta.title || '') : meta.speech || U.stripTags((meta.title || '') + '. ' + (meta.sub || '')));
    }
  }
  function refresh() { setScreen(screen, Object.assign({}, screenOpts, { keep: true, restore: false, announce: false })); }

  function closeCard() {
    $('overlay').classList.remove('on');
    screen = null; items = []; index = -1;
    SS.worldui.setFocus(null);
    if (choice) choice.sync(null);
  }

  function showChrome() {
    const inMatch = G() && G().inMatch();
    $('pauseBtn').classList.toggle('on', inMatch && (ctx === 'live' || ctx === 'world'));
    if (SS.hud) SS.hud.visible(inMatch && ctx !== 'card');
  }

  /* ══ the world (a decision on the scene) ════════════════════════════════ */
  /** spec = { title, sub, items: [{ label, sub, odds, speech, action, focus?, el? }], anchor, speech } */
  /** `restoreId` = Back from a nested decision (Pass > Back lands on Pass). */
  function openWorld(spec, restoreId) {
    if (ctx === 'card') { $('overlay').classList.remove('on'); screen = null; }
    leaveWorld();
    world = { spec, index: -1 };
    ctx = 'world';
    items = spec.items;
    index = -1;
    buildCluster(spec);
    if (spec.onOpen) spec.onOpen();
    swallowHeld();
    showChrome();
    syncChoice({ fresh: true, restoreId: restoreId || null });
    showFocus();
    announceOpen(restoreId ? null : spec.speech);
    SS.broadcast.hush();
  }
  function buildCluster(spec) {
    const el = document.createElement('div');
    el.className = 'cluster';
    el.innerHTML = '<div class="head"><b></b><span></span></div><div class="row"></div>';
    el.querySelector('.head b').textContent = spec.title || '';
    el.querySelector('.head span').textContent = spec.sub || '';
    const row = el.querySelector('.row');
    spec.items.forEach((it, i) => {
      // A teammate, or the Pause button: not a plate. A plate item keeps its old element when
      // the same choice comes back from Pause, so that alone must not skip it (Bryan found the
      // plates gone after Pause > Continue: every item was skipped as if it were the button).
      if (it.focus || (it.el && !it.plate)) return;
      const p = document.createElement('div');
      p.className = 'plate' + (it.cls ? ' ' + it.cls : '');
      p.innerHTML = '<b></b><span class="sub"></span><span class="odds"><i></i><em></em></span>';
      p.querySelector('b').textContent = it.label;
      p.querySelector('.sub').textContent = it.sub || '';
      if (it.odds) {
        p.querySelector('.odds i').style.setProperty('--p', it.odds.p.toFixed(2));
        p.querySelector('.odds em').textContent = it.odds.word;
        p.dataset.odds = it.odds.word.toLowerCase().replace(/\s+/g, '-');
      } else p.querySelector('.odds').remove();
      U.addTap(p, () => { if (performance.now() - openedAt < GHOST_MS) return; pick(i); });
      p.addEventListener('mouseenter', () => { if (index !== i) point(i); });
      it.el = p; it.plate = true;
      row.appendChild(p);
    });
    SS.worldui.setCluster(spec.anchor, el);
    world.cluster = el;
  }
  /** Change what the cluster's heading says (the focused teammate's details). */
  function worldHead(title, sub) {
    if (!world || !world.cluster) return;
    world.cluster.querySelector('.head b').textContent = title;
    world.cluster.querySelector('.head span').textContent = sub || '';
  }
  function leaveWorld() {
    if (!world) return;
    SS.worldui.setCluster(null, null);
    SS.worldui.setFocus(null);
    if (world.spec.onLeave) world.spec.onLeave();
    world = null;
  }
  function closeWorld() { leaveWorld(); items = []; index = -1; if (choice) choice.sync(null); }

  /* ══ focus and scanning (cards and world alike) ═════════════════════════ */
  function showFocus() {
    items.forEach((it, i) => { if (it.el && it.el !== $('pauseBtn')) it.el.classList.toggle('focused', i === index); });
    $('pauseBtn').classList.toggle('focused', !!items[index] && items[index].el === $('pauseBtn'));
    const it = items[index];
    if (ctx === 'card') {
      $('cardStats').innerHTML = it && it.stats !== undefined ? it.stats : (meta.stats || '');
      SS.worldui.setFocus(it && it.el ? { el: it.el } : null);
    } else if (ctx === 'world') {
      if (world) world.index = index;
      SS.worldui.setFocus(!it ? null : it.focus ? { pts: it.focus } : { el: it.el });
    }
    if (ctx === 'world' && world && world.spec.onFocus) world.spec.onFocus(it || null);
    if (it && it.onFocus) it.onFocus();
  }
  const speechOf = it => it.speech !== undefined ? it.speech : U.stripTags(it.label) + (it.value !== undefined && it.value !== '' ? ', ' + it.value : '');

  /* ── the hub's choice scanner ───────────────────────────────────────────
     One adapter for cards and decisions alike. It owns the highlight: where it is, the
     blank stop, Auto Scan, parking, the brake and Wait for Speech. It tells us where the
     highlight went (onHighlight) and what was chosen (onSelect); we draw and act. */
  function choiceContext() {
    if (ctx !== 'card' && ctx !== 'world') return null;
    const seen = new Map(), list = [];
    items.forEach((it, n) => {
      if (!selectable(it)) return;
      const base = String(it.id || U.stripTags(it.label || '') || 'item'), k = seen.get(base) || 0;
      seen.set(base, k + 1);
      // A teammate in the water has no element of its own: the bracket marker framing them
      // carries the brake's dotted outline instead (the "equivalent outline" for 3D choices).
      const el = it.el || (it.focus ? $('scanFrame') : null);
      list.push({ id: k ? base + ':' + k : base, label: () => speechOf(it), element: el, labelElement: el, nativeIndex: n });
    });
    return ctx === 'card'
      ? { key: 'card:' + memKey(screen, screenOpts), items: list, statusHost: $('cardStatus') }
      : { key: 'world', items: list, statusHost: $('worldStatus') };
  }
  function syncChoice(opts) { if (choice) choice.sync(choiceContext(), opts); }
  function initChoice() {
    if (!window.NarbeChoiceScanAdapter || !U.sm()) return;      // shared files missing: nothing scans
    choice = NarbeChoiceScanAdapter.create({
      holdThreshold: SCAN_BACK_HOLD, stateHost: document.body,
      speak: text => U.speak(text),
      onHighlight(item, state, context) {
        if (!context || state.suspended) return;
        index = item ? item.nativeIndex : -1;
        showFocus();
        $('scanFrame').classList.toggle('paused', !!(item && state.braked));
        const id = item ? item.id : null;
        if (id !== null && id !== lastLit) SS.audio.menu('move');
        lastLit = id;
      },
      onSelect(item) {
        const it = items[item.nativeIndex];
        if (!selectable(it)) { SS.audio.menu('blocked'); return; }
        SS.audio.menu('select');
        if (typeof it.action === 'function') it.action();
      },
    });
  }
  /** A card or decision opens: its title speech is the scanner's own, so Auto Scan's first
   *  step waits for it under Wait for Speech; with parking on, "park" is said for the blank. */
  function announceOpen(text) {
    if (!choice || !choice.active) { if (text) U.speak(text); return; }
    const st = choice.getState(), it = st.index >= 0 ? choice.context.items[st.index] : null;
    const parking = !it && isAuto() && U.sm().isParkingEnabled();
    const tail = it ? it.label() : parking ? 'Park.' : '';
    const say = [text, tail].filter(Boolean).join('. ');
    if (say) choice.announce(say, { parkingLabel: parking });
  }
  /** Mouse/touch: point at an item (hover), or point and choose (tap). */
  function point(n) {
    const it = choice && choice.context && choice.context.items.find(c => c.nativeIndex === n);
    if (it) choice.align(it.id);
  }
  function pick(n) {
    if (!choice || !choice.active) { const it = items[n]; if (selectable(it) && it.action) { SS.audio.menu('select'); it.action(); } return; }
    point(n); choice.select();
  }

  function defaultHint() {
    const touch = (() => { try { return matchMedia('(hover: none) and (pointer: coarse)').matches; } catch (e) { return false; } })();
    const brake = isAuto() && U.sm().getSettings().spaceBrake;
    const keys = isAuto() ? '<kbd>Enter</kbd> picks the highlighted item' + (brake ? ' · <kbd>Space</kbd> pauses the scan' : '')
      : 'Tap <kbd>Space</kbd> = next · hold <kbd>Space</kbd> = back · <kbd>Enter</kbd> = choose';
    return (touch ? 'Tap an item to pick it · ' : '') + keys;
  }

  /* ══ switch input ═══════════════════════════════════════════════════════ */
  const isSwitch = c => c === 'Space' || c === 'Enter' || c === 'NumpadEnter';
  const norm = c => (c === 'NumpadEnter' ? 'Enter' : c);

  function clearBack() { clearTimeout(backHold); backHold = null; clearInterval(backRepeat); backRepeat = null; didBack = false; }
  function clearPauseWatch() { clearInterval(pauseWatch); pauseWatch = null; pauseTicks = 0; if (SS.hud) SS.hud.ring(0); }
  function clearKeys() {
    down.Space = down.Enter = false; braking = false;
    clearBack(); clearPauseWatch();
    if (choice) choice.setInputHeld(false);
  }

  function onKeyDown(e) {
    if (!isSwitch(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    const k = norm(e.code);
    if (ignore[k]) ignore[k] = false;                     // a fresh press: that key was let go, even if we missed it
    if (down[k]) return;
    down[k] = true; downAt[k] = performance.now();
    if ((ctx === 'card' || ctx === 'world') && choice && choice.active) {
      // Auto Scan + Space Brake: Space freezes the scan on PRESS (the one act-on-press
      // exception, so the label is not cut off). Otherwise the clock waits while a key is down.
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
    if (k === 'Enter' && (ctx === 'live' || ctx === 'world')) watchPauseHold();
  }

  function watchPauseHold() {
    clearPauseWatch();
    pauseWatch = setInterval(() => {
      if (!down.Enter) { clearPauseWatch(); return; }
      const held = performance.now() - downAt.Enter;
      if (held >= PAUSE_HOLD_MS) { clearPauseWatch(); openPause(); return; }
      if (held < PAUSE_HOLD_SHOW) return;
      SS.hud.ring((held - PAUSE_HOLD_SHOW) / (PAUSE_HOLD_MS - PAUSE_HOLD_SHOW));
      const secs = Math.floor(held / 1000);
      if (secs > pauseTicks) { pauseTicks = secs; SS.audio.tick(secs - 1); }
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
    if (ctx === 'live') { G().openHuddle(); return; }
    if (ctx !== 'card' && ctx !== 'world') return;
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

  /* ══ match lifecycle hooks (called by SS.game) ═════════════════════════ */
  function goLive() {
    closeCard(); closeWorld();
    ctx = 'live';
    swallowHeld();
    showChrome();
  }
  /** Pause: from live play, a decision, or the Huddle. Continue returns to where it came from. */
  function openPause() {
    if (!G().inMatch()) return;
    cardReturn = world ? { world: world.spec } : { live: true };
    G().setFrozen(true);
    setScreen('pause');
  }
  function resumeFromCard() {
    const r = cardReturn; cardReturn = null;
    if (r && r.world) { openWorld(r.world); return; }      // asks again, nothing highlighted
    G().resume();
  }

  function goToHub() {
    if (choice) choice.sync(null);
    SS.audio.stopAll(); SS.broadcast.hush();
    if (G()) G().saveNow();
    U.speak('Exiting to hub');
    setTimeout(leave, 700);
  }
  function leave() {
    if (window.parent && window.parent !== window) window.parent.postMessage({ action: 'focusBackButton' }, '*');
    else window.location.href = '../../../index.html';
  }
  function openSettings() { resetArmed = 0; settingsReturn = { screen, opts: screenOpts }; setScreen('settings'); }
  function backFromSettings() { resetArmed = 0; const r = settingsReturn || { screen: 'title' }; setScreen(r.screen, Object.assign({}, r.opts, { keep: false, restore: true, announce: undefined })); }

  /* ══ screen helpers ═════════════════════════════════════════════════════ */
  const back = fn => ({ icon: '↩', label: 'Back', speech: 'Back', wide: true, action: fn, cls: 'back' });
  const art = e => '<div class="emblem"><span>' + e + '</span></div>';
  const TEAM_WORD = t => { const avg = t.players.slice(0, 6).reduce((a, p) => a + p.level, 0) / 6; return avg >= 10 ? 'Champions' : avg >= 8 ? 'Strong' : avg >= 6 ? 'Solid' : 'Underdogs'; };
  const STOPS = { ours: 'Our ball only', both: 'Attack and defense', key: 'Key moments', coach: 'Coach (watch)' };
  const STOPS_SAY = { ours: 'Our ball only. You choose whenever we have the ball.', both: 'Attack and defense. You also choose how we defend.',
    key: 'Key moments. You choose only the big chances.', coach: 'Coach. Watch, and set tactics from the huddle.' };
  const SPEEDS = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };
  const DIFFS = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
  const MOTION_SAY = { full: 'Motion, full.', reduced: 'Motion, reduced. The camera stays steady, and nothing shakes or slides.' };
  // Stadium and time of day: Random, or one of world.js's.
  const arenaChoices = o => Object.assign({ random: 'Random' }, ...Object.keys(o).map(k => ({ [k]: o[k].name })));
  const DIFFS_SAY = { easy: 'Easy. Your team is much stronger.', normal: 'Normal. Your team gets a little help.', hard: 'Hard. A real challenge.' };
  const COMMENTARY = { full: 'Full broadcast', calls: 'Big calls only', captions: 'Captions only', off: 'Off' };
  const cycle = (list, v) => list[(list.indexOf(v) + 1) % list.length];

  function logo() {
    return '<div class="logo" aria-label="Benny\'s Sphere Splash"><span class="top">Benny\'s</span>' +
      '<span class="main">Sphere Splash</span><span class="drops"></span></div>';
  }
  function statsBoard(info) {
    if (!info) return '';
    const rows = [['Goals', 'goals'], ['Shots', 'shots'], ['On target', 'onTarget'], ['Passes completed', 'completed'],
      ['Tackles won', 'tackles'], ['Saves', 'saves']];
    let h = '<table class="board"><tr><th></th><th class="t0">' + U.esc(info.teams[0].short) + '</th><th class="t1">' + U.esc(info.teams[1].short) + '</th></tr>';
    rows.forEach(([lb, k]) => { h += '<tr><td>' + lb + '</td><td>' + info.stats[0][k] + '</td><td>' + info.stats[1][k] + '</td></tr>'; });
    return h + '</table>';
  }
  function scoreLine(info) {
    return '<span class="bigScore"><span>' + U.esc(info.teams[0].short) + '</span><b>' + info.score[0] + '</b><em>–</em><b>' + info.score[1] +
      '</b><span>' + U.esc(info.teams[1].short) + '</span></span>';
  }

  /* ══ SCREENS ════════════════════════════════════════════════════════════ */
  const SCREENS = {
    title: () => {
      const save = G().savedMatch();
      const list = [];
      if (save) list.push({ icon: '▶️', label: 'Continue', primary: true, note: U.esc(save.summary),
        speech: 'Continue. ' + save.summary, action: () => G().continueSaved() });
      list.push(
        { icon: '⚡', label: 'Quick Game', note: 'One match, short halves', speech: 'Quick Game. One match, short halves.', action: () => setScreen('quick') },
        { icon: '📅', label: 'Simple Season', note: 'Coming soon', enabled: false },
        { icon: '🏆', label: 'Full Season', note: 'Coming soon', enabled: false },
        { icon: '❓', label: 'How to Play', speech: 'How to Play', action: () => setScreen('howto', { page: 0 }) },
        { icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings },
        { icon: '🏠', label: 'Exit Game', speech: 'Exit Game', action: goToHub });
      return { art: logo(), cardClass: 'title', title: '', items: list,
        speech: "Benny's Sphere Splash. " + (save ? 'Continue, ' : '') + 'Quick Game, How to Play, Settings, or Exit Game.' };
    },

    quick: () => ({
      art: art('⚡'), title: 'Quick Game',
      sub: 'One match with short halves. The game plays itself and <b>stops whenever you have a choice to make</b>.',
      items: [
        { icon: '🎲', label: 'Start', note: 'Random teams', primary: true, speech: 'Start, with random teams.', action: () => G().startQuick(null) },
        { icon: '👕', label: 'Pick the Teams', speech: 'Pick the teams', action: () => setScreen('pickTeam', { side: 0 }) },
        back(() => setScreen('title', { restore: true })),
      ],
      speech: 'Quick Game. Start with random teams, or pick the teams.',
    }),

    pickTeam: o => {
      const side = o.side || 0, teams = SS.DATA.TEAMS;
      const list = teams.filter(t => side === 0 || t.id !== o.ours).map(t => ({
        icon: '<i class="kit" style="background:' + U.hex(t.kit) + ';border-color:' + U.hex(t.accent) + '"></i>',
        label: U.esc(t.name), note: TEAM_WORD(t) + ' · ' + U.esc(t.blurb),
        speech: t.name + '. ' + TEAM_WORD(t) + '. ' + t.blurb,
        action: () => side === 0 ? setScreen('pickTeam', { side: 1, ours: t.id }) : G().startQuick([o.ours, t.id]),
      }));
      list.push(back(() => side === 0 ? setScreen('quick', { restore: true }) : setScreen('pickTeam', { side: 0, restore: true })));
      return { art: art(side === 0 ? '👕' : '🆚'), title: side === 0 ? 'Your Team' : 'Your Opponent',
        sub: side === 0 ? 'Pick the team you will play for.' : 'Pick who you will play against.',
        items: list, layout: 'grid2', size: 'wide', speech: side === 0 ? 'Pick your team.' : 'Pick your opponent.' };
    },

    kickoff: o => {
      const info = G().matchInfo(), back2 = !!(o && o.resume);
      const vs = U.esc(info.teams[0].name) + ' <small>vs</small> ' + U.esc(info.teams[1].name);
      return { art: art(back2 ? '👋' : '🌊'), title: back2 ? 'Welcome Back' : vs,
        sub: back2 ? scoreLine(info) : 'You play for the <b>' + U.esc(info.teams[0].name) + '</b>, attacking to the right. ' + U.esc(STOPS[setting('stops')]) + '. ' + DIFFS[setting('difficulty')] + ' difficulty.',
        items: [
          { icon: back2 ? '▶️' : '🏁', label: back2 ? 'Resume Play' : 'Kick Off', primary: true, speech: back2 ? 'Resume play' : 'Kick off', action: () => G().kickoff() },
          { icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings },
          { icon: '🏠', label: 'Main Menu', speech: 'Main Menu', action: () => G().quitToMenu() },
        ],
        speech: back2 ? 'Welcome back. ' + info.scoreSpeech + ' Resume play, Settings, or Main Menu.'
          : info.teams[0].name + ' versus ' + info.teams[1].name + '. You play for the ' + info.teams[0].name + '. Kick off, Settings, or Main Menu.' };
    },

    huddle: () => {
      const g = G(), ours = g.weHaveBall(), coach = setting('stops') === 'coach';
      const list = [
        { icon: '▶️', label: 'Continue', primary: true, speech: 'Continue', action: () => g.resume() },
        { icon: '📣', label: 'Call it Now', note: ours ? 'Pass or shoot right away' : 'We need the ball', enabled: ours,
          speech: 'Call it now. Pass or shoot right away.', action: () => g.callNow() },
        { icon: '🧭', label: 'Formation', note: U.esc(g.formationName()), speech: 'Formation, ' + g.formationName(), action: () => setScreen('formation', { from: 'huddle' }) },
      ];
      if (coach) list.push({ icon: '⏭️', label: 'Skip to Full Time', speech: 'Skip to full time', action: () => g.skipToEnd() });
      list.push({ icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings },
        { icon: '⏸️', label: 'Pause Menu', speech: 'Pause menu', action: () => setScreen('pause') });
      return { art: art('🤝'), title: 'Huddle', sub: 'Play is stopped.', items: list, layout: 'grid2',
        speech: 'Huddle. Play is stopped.' };
    },

    formation: o => {
      const g = G(), cur = g.formationId(), wins = g.totalWins();
      const list = Object.keys(SS.DATA.FORMATIONS).map(id => {
        const f = SS.DATA.FORMATIONS[id], open = g.formationsOpen() || wins >= f.wins;
        return { label: U.esc(f.name), note: open ? U.esc(f.blurb) : 'Win ' + f.wins + ' matches to unlock', value: id === cur ? 'Now' : '',
          enabled: open, speech: f.name + (id === cur ? ', current' : '') + '. ' + f.blurb,
          action: () => { g.setFormation(id); setScreen(o.from || 'huddle', { restore: true }); U.speak('Formation: ' + f.name); } };
      });
      list.push(back(() => setScreen(o.from || 'huddle', { restore: true })));
      const rec = g.formationRecord(), theirs = g.theirFormationName();
      return { art: art('🧭'), title: 'Formation',
        sub: 'Now: <b>' + U.esc(rec) + '</b><br>' + U.esc(g.matchInfo().teams[1].short) + ' play <b>' + U.esc(theirs) + '</b>.',
        items: list, layout: 'grid2', size: 'wide',
        speech: 'Formation. ' + rec.replace(' · ', '. ') + '. They play ' + theirs + '.' };
    },

    pause: () => ({
      art: art('⏸️'), title: 'Paused',
      items: [
        { icon: '▶️', label: 'Continue', speech: 'Continue', action: resumeFromCard },
        { icon: '🔄', label: 'Restart Match', speech: 'Restart match', action: () => setScreen('confirmRestart') },
        { icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings },
        { icon: '🏠', label: 'Main Menu', note: 'The match is saved', speech: 'Main menu. The match is saved.', action: () => G().quitToMenu() },
        { icon: '🚪', label: 'Exit Game', speech: 'Exit Game', action: () => setScreen('confirmExit', { from: 'pause' }) },
        { icon: '🆘', label: 'Help', speech: 'Help', action: () => U.speak('I need help') },
      ],
      layout: 'grid2', speech: 'Paused. Continue, Restart Match, Settings, Main Menu, Exit Game, or Help.',
    }),

    confirmRestart: () => ({
      art: art('🔄'), title: 'Restart the Match?', sub: 'The score goes back to <b>0 – 0</b>.',
      items: [
        { icon: '↩', label: 'Keep Playing', primary: true, speech: 'Keep playing', action: () => setScreen('pause', { restore: true }) },
        { icon: '🔄', label: 'Restart', speech: 'Restart', action: () => G().restartMatch() },
      ],
      speech: 'Restart the match? The score goes back to nil nil. Keep playing, or Restart.',
    }),

    confirmExit: o => ({
      art: art('🚪'), title: 'Leave Sphere Splash?', sub: 'Go back to the hub. The match is saved, so you can continue it later.',
      items: [
        { icon: '↩', label: 'Stay', primary: true, speech: 'Stay', action: () => setScreen(o.from || 'pause', { restore: true }) },
        { icon: '🏠', label: 'Exit Game', speech: 'Exit Game', action: goToHub },
      ],
      speech: 'Leave Sphere Splash and go back to the hub? The match is saved. Stay, or Exit Game.',
    }),

    halftime: () => {
      const info = G().matchInfo();
      return { art: art('⏱️'), title: 'Halftime', sub: scoreLine(info), stats: statsBoard(info), cardClass: 'results', size: 'wide', scrim: true,
        items: [
          { icon: '▶️', label: 'Second Half', primary: true, speech: 'Start the second half', action: () => G().startSecondHalf() },
          { icon: '🧭', label: 'Formation', note: U.esc(G().formationName()), speech: 'Formation, ' + G().formationName(), action: () => setScreen('formation', { from: 'halftime' }) },
          { icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings },
          { icon: '🏠', label: 'Main Menu', note: 'The match is saved', speech: 'Main menu. The match is saved.', action: () => G().quitToMenu() },
        ],
        layout: 'row', speech: 'Halftime. ' + info.scoreSpeech };
    },

    results: () => {
      const info = G().matchInfo(), w = info.winner;
      const title = w === 0 ? 'You Win!' : w === 1 ? 'Full Time' : 'A Draw';
      return { art: art(w === 0 ? '🏆' : w === 1 ? '🏁' : '🤝'), title, sub: scoreLine(info), stats: statsBoard(info), cardClass: 'results', size: 'wide', scrim: true,
        items: [
          { icon: '🔄', label: 'Play Again', primary: true, note: 'Same teams', speech: 'Play again, same teams', action: () => G().startQuick([info.teams[0].id, info.teams[1].id]) },
          { icon: '🎲', label: 'New Teams', speech: 'New random teams', action: () => G().startQuick(null) },
          { icon: '🏠', label: 'Main Menu', speech: 'Main Menu', action: () => G().quitToMenu() },
          { icon: '🚪', label: 'Exit Game', speech: 'Exit Game', action: goToHub },
        ],
        layout: 'row', speech: (w === 0 ? 'You win! ' : w === 1 ? 'Full time. ' : 'A draw. ') + info.scoreSpeech };
    },

    howto: o => {
      const page = o.page || 0;
      const pages = [
        { e: '🌊', t: 'The Match', s: '<p>Two teams of six swim in a giant sphere of water. Get the ball into the other team\'s goal.</p>' +
          '<p>The game <b>plays itself</b>. It <b>stops</b> whenever there is a choice to make, and waits for you as long as you like.</p>' +
          '<p>You play for the team attacking to the <b>right</b>.</p>' },
        { e: '🤔', t: 'Your Choices', s: '<p>When a defender gets in the way, choose: <b>Pass</b> to a teammate, <b>Shoot</b> at the goal, or <b>Dribble</b> through.</p>' +
          '<p>Every choice shows its chances in words: <b>Good chance</b>, <b>Fair</b> or <b>Risky</b>.</p>' +
          '<p>To pass, choose Pass, then pick the teammate. <b>Tech</b> moves are special shots, passes and dribbles that cost energy.</p>' +
          '<p>When they have the ball, choose how to defend: <b>Tackle</b> to win it, or <b>Block</b> to stand in the way of passes and shots.</p>' },
        { e: '🎮', t: 'Controls', s: '<p>Tap <b>Space</b> to move, <b>hold Space</b> to go backwards, and press <b>Enter</b> to choose.</p>' +
          '<p>While the ball is moving, press either switch for the <b>Huddle</b>: change formation, or call a pass or shot right now.</p>' +
          '<p>After a goal you see it again in slow motion. Press either switch to skip the <b>replay</b>.</p>' +
          '<p>To pause, <b>hold Enter</b>, or press the <b>Pause</b> button.</p>' },
        { e: '🌊', t: 'Credits', s: '<p>Created by Bryan R. (Ben’s other big brother), working in collaboration with NARBE LLC.</p>' },
      ];
      const pg = pages[page];
      const list = [page < pages.length - 1
        ? { icon: '▶', label: 'Next: ' + pages[page + 1].t, speech: 'Next page. ' + pages[page + 1].t, action: () => setScreen('howto', { page: page + 1 }) }
        : { icon: '⏮', label: 'Back to the start', speech: 'Back to the first page', action: () => setScreen('howto', { page: 0 }) }];
      list.push(back(() => setScreen('title', { restore: true })));
      return { art: art(pg.e), title: '<span class="kicker">How to Play · ' + (page + 1) + ' of ' + pages.length + '</span>' + pg.t,
        sub: pg.s, cardClass: 'howto', items: list,
        speech: 'How to play, page ' + (page + 1) + ' of ' + pages.length + '. ' + pg.t + '. ' + U.stripTags(pg.s.replace(/<\/p>/g, ' ')) };
    },

    settings: () => {
      const v = U.vm(), s = U.sm();
      const tts = v ? v.getSettings().ttsEnabled : true;
      const voiceName = v && v.getVoiceDisplayName ? v.getVoiceDisplayName(v.getCurrentVoice()) : 'Default';
      const auto = s ? s.getSettings().autoScan : false, speed = s ? s.getScanInterval() : 2000;
      const calm = U.reducedMotion(), hc = setting('theme') === 'contrast';
      const replays = setting('replays') !== false, shotCam = setting('shotCam'), diff = setting('difficulty'), stops = setting('stops'), play = setting('speed'), com = setting('commentary'), ui = setting('uiSize'), sfx = setting('sfx') !== false, music = setting('music') !== false, crowd = setting('crowd') !== false;
      const set = (k, val, say) => { SS.save.settings.set(k, val); refresh(); U.speak(say); };
      const STADIA = arenaChoices(SS.world.STADIUMS), TIMES = arenaChoices(SS.world.TIMES), stad = setting('stadium'), tod = setting('timeOfDay');
      const stadSay = k => 'Stadium, ' + STADIA[k] + (k === 'random' ? '. A different stadium every match.' : '.');
      const todSay = k => 'Time of day, ' + TIMES[k] + (k === 'random' ? '. A different time every match.' : '.');
      const list = [
        { id: 'graphics-quality', icon: '🖼️', label: 'Graphics quality', wide: true, cls: 'graphics-setting',
          value: hubGraphics.label().replace('Graphics quality: ', ''), speech: hubGraphics.label(),
          action: () => { hubGraphics.cycle(); refresh(); U.speak(hubGraphics.label()); } },
        { icon: '🗣️', label: 'Text to Speech', value: tts ? 'On' : 'Off', speech: 'Text to Speech, ' + (tts ? 'On' : 'Off'),
          action: () => { if (v) { v.toggleTTS(); refresh(); if (v.getSettings().ttsEnabled) U.speak('Text to speech on'); } } },
        { icon: '🎙️', label: 'Voice', value: voiceName, speech: 'Voice, ' + voiceName, action: () => { if (v) { v.cycleVoice(); refresh(); U.speak('Voice changed'); } } },
        { icon: '🎚️', label: 'Difficulty', value: DIFFS[diff], speech: 'Difficulty. ' + DIFFS_SAY[diff],
          action: () => { const n = cycle(Object.keys(DIFFS), diff); set('difficulty', n, 'Difficulty. ' + DIFFS_SAY[n]); } },
        { icon: '🛑', label: 'Decision Stops', value: STOPS[stops], speech: 'Decision stops. ' + STOPS_SAY[stops],
          action: () => { const n = cycle(Object.keys(STOPS), stops); set('stops', n, 'Decision stops. ' + STOPS_SAY[n]); } },
        { icon: '🎨', label: 'Colour Profile', value: hc ? 'High Contrast' : 'Standard', speech: 'Colour profile, ' + (hc ? 'high contrast' : 'standard'),
          action: () => set('theme', hc ? 'standard' : 'contrast', 'Colour profile, ' + (hc ? 'standard' : 'high contrast')) },
        { icon: '🌊', label: 'Motion', value: calm ? 'Reduced' : 'Full', speech: calm ? MOTION_SAY.reduced : MOTION_SAY.full,
          action: () => { const n = calm ? 'full' : 'reduced'; set('motion', n, MOTION_SAY[n]); } },
        calm ? { icon: '🎥', label: 'Shot Camera', value: 'Steady', note: 'Motion is Reduced', enabled: false } :
        { icon: '🎥', label: 'Shot Camera', value: shotCam === 'steady' ? 'Steady' : 'Cinematic',
          speech: shotCam === 'steady' ? 'Shot camera, steady. The camera stays put for shots.' : 'Shot camera, cinematic. The camera follows every shot in close.',
          action: () => { const n = shotCam === 'steady' ? 'cinematic' : 'steady'; set('shotCam', n, n === 'steady' ? 'Shot camera, steady. The camera stays put for shots.' : 'Shot camera, cinematic. The camera follows every shot in close.'); } },
        { icon: '⏪', label: 'Goal Replays', value: replays ? 'On' : 'Off',
          speech: replays ? 'Goal replays, on. Every goal plays again in slow motion. Press to skip one.' : 'Goal replays, off.',
          action: () => set('replays', !replays, replays ? 'Goal replays, off.' : 'Goal replays, on. Every goal plays again in slow motion. Press to skip one.') },
        { icon: '🏟️', label: 'Stadium', value: STADIA[stad] || 'Random', speech: stadSay(STADIA[stad] ? stad : 'random'),
          action: () => { const n = cycle(Object.keys(STADIA), stad); set('stadium', n, stadSay(n)); } },
        { icon: '🌅', label: 'Time of Day', value: TIMES[tod] || 'Random', speech: todSay(TIMES[tod] ? tod : 'random'),
          action: () => { const n = cycle(Object.keys(TIMES), tod); set('timeOfDay', n, todSay(n)); } },
        { icon: '⏩', label: 'Play Speed', value: SPEEDS[play], speech: 'Play speed, ' + SPEEDS[play],
          action: () => { const n = cycle(Object.keys(SPEEDS), play); set('speed', n, 'Play speed, ' + SPEEDS[n]); } },
        { icon: '📢', label: 'Commentary', value: COMMENTARY[com], speech: 'Commentary, ' + COMMENTARY[com],
          action: () => { const n = cycle(Object.keys(COMMENTARY), com); set('commentary', n, 'Commentary, ' + COMMENTARY[n]); } },
        { icon: '🔍', label: 'Text Size', value: Math.round(ui * 100) + '%', speech: 'Text size, ' + Math.round(ui * 100) + ' percent',
          action: () => { const n = cycle([1, 1.25, 1.5, 1.75, 2], ui); set('uiSize', n, 'Text size, ' + Math.round(n * 100) + ' percent'); } },
        { icon: '🔁', label: 'Auto Scan', value: auto ? 'On — One Switch' : 'Off — Two Switches',
          speech: auto ? 'Auto Scan on. One switch: Enter chooses.' : 'Auto Scan off. Two switches: Space moves, Enter chooses.',
          action: () => { if (!s) return; s.toggleAutoScan(); refresh(); U.speak(s.getSettings().autoScan ? 'Auto scan on. One switch. Enter chooses.' : 'Auto scan off. Two switches. Space moves, Enter chooses.'); } },
        { icon: '⏲️', label: 'Scan Speed', value: (speed / 1000) + 's', speech: 'Scan speed, ' + (speed / 1000) + ' seconds',
          action: () => { if (s) { s.cycleScanSpeed(); refresh(); U.speak('Scan speed ' + (s.getScanInterval() / 1000) + ' seconds'); } } },
        { icon: '🔊', label: 'Sound Effects', value: sfx ? 'On' : 'Off', speech: 'Sound effects, ' + (sfx ? 'On' : 'Off'),
          action: () => set('sfx', !sfx, 'Sound effects ' + (sfx ? 'off' : 'on')) },
        { icon: '🎵', label: 'Music', value: music ? 'On' : 'Off', speech: 'Music, ' + (music ? 'On' : 'Off'),
          action: () => set('music', !music, 'Music ' + (music ? 'off' : 'on')) },
        { icon: '👥', label: 'Crowd', value: crowd ? 'On' : 'Off', speech: 'Crowd, ' + (crowd ? 'On' : 'Off'),
          action: () => set('crowd', !crowd, 'Crowd ' + (crowd ? 'off' : 'on')) },
        { icon: '🗑️', label: 'Reset Progress', value: resetArmed ? 'Sure?' : '', cls: resetArmed ? 'armed' : '',
          speech: resetArmed ? 'Select again to erase the saved match and these settings' : 'Reset progress',
          action: () => {
            if (resetArmed && Date.now() - resetArmed < RESET_ARM_MS) { resetArmed = 0; G().resetProgress(); refresh(); U.speak('Progress reset'); }
            else { resetArmed = Date.now(); refresh(); U.speak('Select again to erase the saved match and these settings'); }
          } },
        back(backFromSettings),
      ];
      return { art: '', title: 'Settings', items: list, layout: 'cols2', size: 'wide', speech: 'Settings' };
    },
  };

  /* ══ boot ═══════════════════════════════════════════════════════════════ */
  function init() {
    hubGraphics.subscribe(() => { if (screen === 'settings') refresh(); });
    buildDom();
    initChoice();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('narbe-input-cancelled', onBlur);
    const s = U.sm();
    // A scan setting changed (here, in the hub, or another tab). The scanner follows on its
    // own; the hint and an open Settings card show the new values, highlight kept.
    if (s && s.subscribe) s.subscribe(() => {
      if (ctx !== 'card') return;
      if (screen === 'settings') refresh(); else $('hint').innerHTML = meta.hint || defaultHint();
    });
    SS.save.settings.onChange(k => { if (k === 'uiSize' || k === '*') applySize(); if (k === 'motion' || k === '*') applyMotion(); if (k === 'theme' || k === '*') { SS.theme.apply(); refitSoon(); } });
    applySize(); applyMotion();
    U.onDeviceMotion(() => { applyMotion(); if (screen === 'settings') refresh(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      onBlur();
      if (ctx === 'live' || ctx === 'world') openPause();
    });
  }
  function applyMotion() { document.body.dataset.motion = U.reducedMotion() ? 'reduced' : 'full'; }
  function applySize() { document.documentElement.style.setProperty('--ui', setting('uiSize') || 1); refitSoon(); }

  return {
    init, setScreen, openWorld, closeWorld, worldHead, goLive, openPause, resumeFromCard, goToHub,
    context: () => ctx,
    get screen() { return screen; },
    /** For the browser checks, which cannot see focus state from the DOM. */
    __dbg: () => ({ ctx, screen, index, rows: items.map(it => String(it.speech || U.stripTags(it.label || ''))),
      down: Object.assign({}, down), ignore: Object.assign({}, ignore), choice: choice && choice.getState() }),
  };
})();
