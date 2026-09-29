/**
 * NARBE Racer — menus and menu input.
 *
 * Race Tracks' overlay-card engine: every screen is SCREENS[name](opts)
 * returning { art, title, sub, items, speech, startIndex, stats, hint,
 * announce, listenFirst, layout, owner, showcase }, rendered into one card.
 * NK.ui owns every screen and all menu input; it calls NK.game for everything
 * else, and hands the switches to NK.controls while a race is running.
 *
 * Two input contexts, decided purely by whether a card is up:
 *   card up   → scanning exactly like every hub game: Space released = next,
 *               Enter released = choose, hold Space = scan backwards, Auto Scan
 *               from NarbeScanManager. These are ordinary document listeners,
 *               so they see what scan-manager lets through, like everywhere else.
 *   no card   → a race: NK.controls reads the raw NK.input layer instead.
 *
 * Fish Mystery's fixes are all here: ignoreUntilRelease is captured in EVERY
 * showOverlay(true); cards that arrive on the back of a press (pause, results,
 * standings, trophy) open with nothing focused, and their first press only
 * steps and reads; a time-based ghost-click guard; the hint follows the scheme.
 *
 * Two players (DESIGN §2.6): on shared screens with Auto Scan on, either switch
 * chooses. On a player's own pick screens (racer, kart) the highlight always
 * scans by itself and only that player's switch chooses. While a switch that
 * counts is held the auto-scan waits, and the release chooses whatever was lit
 * when the press began.
 */
NK.ui = (function () {
  'use strict';

  const U = NK.util;
  const C = NK.C;
  const $ = (id) => document.getElementById(id);

  /* ── Tuning (never quoted to the player) ─────────────────────────────── */
  const SCAN_BACK_HOLD = 3000;    // hold Space this long in a menu to scan backwards
  const SCAN_BACK_REPEAT = 2000;  // repeat rate if the scan manager is missing
  const GHOST_MS = 380;           // a new card ignores taps this soon (touch → click echo)
  const ACTIVATE_DEBOUNCE = 140;
  const RESET_ARM_MS = 6000;      // Reset Progress: how long the first press stays armed
  const RESULTS_WATCHDOG = 8000;  // a finished race with no results card gets one anyway
  const TROPHY_FALLBACK = 1500;

  const CUE_NAMES = ['Off', 'Visual', 'On'];
  const CUE_SPEECH = ['off', 'visual only', 'visual help and occasional hazard calls'];
  const THEME_EMOJI = { meadow: '🌻', shores: '🏖️', candy: '🍭', dunes: '🏜️',
                        frost: '❄️', spooky: '🎃', lava: '🌋', starlight: '🌌' };
  const MEDAL = { gold: '🥇', silver: '🥈', bronze: '🥉', done: '✅' };
  const CLASS_NOTE = { easy: 'A gentle pace to learn the tracks', medium: 'Quicker rivals, same tracks',
                       fast: 'Full speed, sharp rivals', mirror: 'Every track flipped left to right' };
  const WEIGHT_NAME = { light: 'Light', medium: 'Medium', heavy: 'Heavy' };
  const WEIGHT_SPEECH = { light: 'Light: quick to steer and speed up.',
                          medium: 'Medium: nicely balanced.',
                          heavy: 'Heavy: fast, and hard to push around.' };

  /* ── State ───────────────────────────────────────────────────────────── */
  let screen = 'title';
  let screenOpts = {};
  let meta = {};
  let items = [];
  let index = 0;
  let overlayOn = false;
  let inRace = false;             // a race is running under the cards
  let ready = false;
  let autoScanTimer = null;
  let cardOpenedAt = 0;
  let resetArmed = 0;
  let settingsReturn = { screen: 'title', index: 3 };
  let pausedBy = -1;
  let lastResults = null;
  let gpSummary = null;
  let trophyTimer = null;
  let cupsBefore = 0;
  let doneSince = 0;

  const keyDown = { Space: false, Enter: false };
  const pressIndex = { Space: -1, Enter: -1 };
  /* Set when a card opens while a switch is physically held: that switch's
     release belongs to whatever opened the card, not to the card. */
  const ignoreUntilRelease = { Space: false, Enter: false };
  const ignoreSince = { Space: 0, Enter: 0 };
  let backHoldTimer = null, backRepeatTimer = null, didBackHold = false;
  let lastActivate = 0;

  /* ── Shared managers and the game, all null-guarded ──────────────────── */

  function G() { return window.NK && NK.game ? NK.game : null; }
  function call(name, ...args) {
    const g = G();
    if (!g || typeof g[name] !== 'function') return undefined;
    try { return g[name](...args); } catch (e) { console.error('NK.game.' + name + ' failed:', e); }
    return undefined;
  }
  function sess() {
    const g = G();
    if (!g) return {};
    const s = typeof g.session === 'function' ? g.session() : g.session;
    return s || {};
  }
  function setting(key, dflt) {
    const g = G();
    try {
      const v = g && g.settings ? g.settings.get(key) : undefined;
      return v === undefined || v === null ? dflt : v;
    } catch (e) { return dflt; }
  }
  function setSetting(key, value) {
    const g = G();
    try { if (g && g.settings) g.settings.set(key, value); } catch (e) { console.error(e); }
  }
  function unlockedCups(mode) {
    const g = G();
    try {
      const u = g && g.unlocked;
      const n = u && typeof u.cups === 'function' ? u.cups(mode) : 1;
      return isFinite(n) ? n : 1;
    } catch (e) { return 1; }
  }
  function mirrorOpen() {
    const g = G();
    try { return !!(g && g.unlocked && g.unlocked.mirror); } catch (e) { return false; }
  }
  function lastPicks() { return call('lastPicks') || {}; }
  function players() { return sess().players === 2 ? 2 : 1; }
  function isAutoScan() { const s = U.sm(); return !!(s && s.getSettings().autoScan); }
  function scanInterval() { const s = U.sm(); return s ? s.getScanInterval() : SCAN_BACK_REPEAT; }

  function audio(name) {
    const au = window.NK && NK.audio;
    if (au && typeof au[name] === 'function') {
      try { au[name](); return true; } catch (e) { /* ignore */ }
    }
    return false;
  }
  /* Menu sounds fall back to SafeAudio's built-in blips until NK.audio exists. */
  function sfx(kind) {
    const fn = { move: 'menuMove', select: 'menuSelect', blocked: 'menuBlocked' }[kind];
    if (audio(fn)) return;
    if (setting('sfx', true) === false || !window.SafeAudio) return;
    try { SafeAudio.play(kind === 'move' ? 'hover' : kind === 'select' ? 'select' : 'bust', kind === 'blocked' ? 0.2 : 0.35); }
    catch (e) { /* ignore */ }
  }

  /* ── Content lookups ─────────────────────────────────────────────────── */

  function chars() { return (NK.roster && NK.roster.CHARACTERS) || []; }
  function karts() { return (NK.roster && NK.roster.VEHICLES) || []; }
  function charById(id) { const l = chars(); for (let i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function kartById(id) { const l = karts(); for (let i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function cups() { return (NK.tracks && NK.tracks.CUPS) || []; }
  function trackDef(id) { return (NK.tracks && NK.tracks.TRACKS && NK.tracks.TRACKS[id]) || null; }
  function trackName(id) { const t = trackDef(id); return t ? t.name : String(id || ''); }
  function trackEmoji(id) { const t = trackDef(id); return (t && THEME_EMOJI[t.theme || t.id]) || '🏁'; }
  function cupOf(id) { const l = cups(); for (let i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function cssColor(c) {
    if (c === undefined || c === null) return '';
    return typeof c === 'number' ? '#' + ('000000' + c.toString(16)).slice(-6) : String(c);
  }
  function pickOf(p) {
    const s = sess();
    const pk = (s.picks && s.picks[p]) || {};
    return { charId: pk.charId || pk.char, vehicleId: pk.vehicleId || pk.kart };
  }
  function lastPickOf(p) {
    const lp = lastPicks();
    const pk = lp['p' + (p + 1)] || {};
    return { charId: pk.char || pk.charId, vehicleId: pk.kart || pk.vehicleId };
  }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function sayOrdinal(n) { return U.ordinalWord(n); }

  /* ══════════════════════════════════════════════════════════════════════
     THE CARD
     ══════════════════════════════════════════════════════════════════════ */

  function buildDom() {
    if ($('nkOverlay')) return;
    const host = $('app') || document.body;
    const ov = document.createElement('div');
    ov.id = 'nkOverlay';
    ov.className = 'nkOverlay';
    ov.innerHTML =
      '<div id="nkCard" class="nkCard" role="dialog" aria-live="polite">' +
        '<div class="nkCardBand" aria-hidden="true"></div>' +
        '<div id="nkPlayerTag" class="nkPlayerTag"></div>' +
        '<div id="nkCardArt" class="nkCardArt"></div>' +
        '<h1 id="nkCardTitle" class="nkCardTitle"></h1>' +
        '<p id="nkCardSub" class="nkCardSub"></p>' +
        '<div id="nkCardStats" class="nkCardStats"></div>' +
        '<div id="nkMenu" class="nkMenu"></div>' +
        '<p id="nkHint" class="nkHint"></p>' +
      '</div>';
    host.appendChild(ov);

    const btn = document.createElement('button');
    btn.id = 'nkPauseBtn';
    btn.className = 'nkPauseBtn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Pause');
    btn.innerHTML = '<span class="ic">⏸</span><span class="tx">Pause</span>';
    host.appendChild(btn);
    U.addTap(btn, () => openPause(-1));

    window.addEventListener('resize', refitSoon);
    window.addEventListener('orientationchange', refitSoon);
  }

  function selectable(it) { return !!it && it.enabled !== false && !it.header; }

  function render() {
    const menu = $('nkMenu');
    menu.innerHTML = '';
    menu.className = 'nkMenu ' + (meta.layout || 'list');
    if (meta.layout === 'cols2') menu.style.gridTemplateRows = 'repeat(' + Math.ceil(items.length / 2) + ', auto)';
    else menu.style.gridTemplateRows = '';

    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'nkItem';
      if (it.wide) el.classList.add('wide');
      if (it.header) el.classList.add('header');
      else if (it.enabled === false) el.classList.add('locked');
      if (it.primary) el.classList.add('primary');
      if (it.cls) el.classList.add(it.cls);
      if (i === index) el.classList.add('focused');
      if (it.accent) el.style.setProperty('--accent', it.accent);

      let html = '';
      if (it.icon) html += '<span class="ic">' + it.icon + '</span>';
      html += '<span class="lb"><span class="nm">' + it.label + '</span>' +
              (it.note ? '<small>' + it.note + '</small>' : '') + '</span>';
      if (it.badge) html += '<span class="badge">' + it.badge + '</span>';
      if (it.value !== undefined && it.value !== '') html += '<span class="val">' + esc(it.value) + '</span>';
      if (it.enabled === false && !it.header) html += '<span class="lock" aria-hidden="true">🔒</span>';
      el.innerHTML = html;

      if (!it.header) {
        U.addTap(el, () => {
          // The tail of the tap that opened this card is not a choice on it.
          if (performance.now() - cardOpenedAt < GHOST_MS) return;
          audio('resume');
          if (it.enabled === false) { sfx('blocked'); return; }
          index = i;
          updateFocus();
          activate(i);
        });
        // Hovering moves focus like scanning does (no speech: a mouse sweeping
        // the list would machine-gun the voice).
        el.addEventListener('mouseenter', () => {
          if (!selectable(it) || index === i) return;
          index = i;
          updateFocus();
          restartAutoScan();
        });
      }
      menu.appendChild(el);
    });
  }

  function updateFocus() {
    const els = $('nkMenu').children;
    for (let i = 0; i < els.length; i++) els[i].classList.toggle('focused', i === index);
    // Nothing selected yet: the card is waiting for a step, which reads a row out.
    if (index < 0) { showStats(meta.stats || ''); return; }
    const it = items[index];
    showStats(it && it.stats !== undefined ? it.stats : (meta.stats || ''));
    if (it && typeof it.onFocus === 'function') it.onFocus();
  }

  function showStats(html) {
    const el = $('nkCardStats');
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  function speakItem() {
    const it = items[index];
    if (!it) return;
    U.speak(it.speech !== undefined ? it.speech
      : U.stripTags(it.label) + (it.value !== undefined && it.value !== '' ? ', ' + it.value : ''));
  }

  /* Move to the next/previous selectable item — locked items and headers are
     skipped, matching how the other hub apps scan. From "nothing selected" a
     step lands on the first item, whichever way it was pressed. */
  function step(delta) {
    if (!items.length) return;
    if (index < 0) {
      for (let n = 0; n < items.length; n++) if (selectable(items[n])) { index = n; break; }
      if (index < 0) return;
    } else {
      let i = index;
      for (let n = 0; n < items.length; n++) {
        i = (i + delta + items.length) % items.length;
        if (selectable(items[i])) { index = i; break; }
      }
    }
    updateFocus();
    speakItem();
    sfx('move');
    // While the hold-to-go-back repeat owns the cursor, leave the auto-scan
    // timer alone — two timers stepping at once reads as scanning far faster
    // than the configured speed.
    if (!didBackHold) restartAutoScan();
  }

  function activate(at) {
    const t = performance.now();
    if (t - lastActivate < ACTIVATE_DEBOUNCE) return;
    lastActivate = t;
    const i = at !== undefined && at >= 0 && at < items.length ? at : index;
    // Nothing selected: the first press steps onto the first row and reads it,
    // rather than acting on a choice nobody has made.
    if (i < 0) { step(1); return; }
    const it = items[i];
    if (!selectable(it)) { sfx('blocked'); return; }
    sfx('select');
    if (typeof it.action === 'function') it.action();
  }

  /* ── Fitting: no card may ever need a scrollbar ──────────────────────────
   * A player with two switches cannot scroll, so everything a card offers has
   * to BE on the card. After every render: try the tight layout, then scale
   * the whole card (never below a size that still reads across a room).
   */
  function fitCard() {
    const card = $('nkCard'), ov = $('nkOverlay');
    if (!card || !ov) return;
    card.classList.remove('tight');
    card.style.transform = '';
    card.style.marginBottom = '';
    const cs = getComputedStyle(ov);
    const room = ov.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - 8;
    let h = card.getBoundingClientRect().height;
    if (h <= room) return;
    card.classList.add('tight');
    h = card.getBoundingClientRect().height;
    if (h <= room) return;
    const k = Math.max(0.6, room / h);
    card.style.transformOrigin = 'center center';
    card.style.transform = 'scale(' + k.toFixed(3) + ')';
    card.style.marginBottom = Math.round(-h * (1 - k)) + 'px';
  }

  let refitTimer = null;
  function refitSoon() {
    clearTimeout(refitTimer);
    refitTimer = setTimeout(() => { if (overlayOn) fitCard(); }, 140);
  }

  /* ── Overlay plumbing ────────────────────────────────────────────────── */

  function showOverlay(on) {
    overlayOn = on;
    const ov = $('nkOverlay');
    ov.classList.toggle('on', on);
    ov.classList.toggle('showcase', on && !!meta.showcase);
    $('nkPauseBtn').classList.toggle('on', !on && inRace);
    if (NK.hud && NK.hud.visible) NK.hud.visible(!on && inRace);
    if (on) {
      /* A card can open with a switch still held — the pause hold, the key
         that was steering as the race ended. Swallow that switch until it is
         really released. OR, never assign: the flag may already be set by a
         card that opened a moment ago under the same hold. */
      const t = performance.now();
      for (let n = 0; n < 2; n++) {
        const k = n ? 'Enter' : 'Space';
        const held = keyDown[k] || (NK.input && NK.input.isDown(k));
        if (held && !ignoreUntilRelease[k]) { ignoreUntilRelease[k] = true; ignoreSince[k] = t; }
      }
      clearKeys();
      cardOpenedAt = t;
      if (inRace && NK.controls) NK.controls.suspend();
    }
  }

  function setScreen(name, opts) {
    const builder = SCREENS[name];
    if (!builder) return;
    opts = opts || {};
    screen = name;
    screenOpts = opts;
    meta = builder(opts) || {};
    items = meta.items || [];

    index = meta.startIndex !== undefined ? meta.startIndex : 0;
    if (opts.index !== undefined) index = opts.index;
    else if (meta.listenFirst) index = -1;
    if (index >= items.length) index = items.length - 1;
    if (index >= 0 && !selectable(items[index])) {
      for (let n = 1; n <= items.length; n++) {
        const i = (index + n) % items.length;
        if (selectable(items[i])) { index = i; break; }
      }
    }

    const card = $('nkCard');
    const owned = meta.owner === 0 || meta.owner === 1;
    card.className = 'nkCard size-' + (meta.size || 'normal') + (meta.cardClass ? ' ' + meta.cardClass : '') +
                     (owned ? ' owned p' + (meta.owner + 1) : '');
    // A new card (not a refresh of this one) slides in; the reflow restarts it.
    if (opts.announce !== false) { void card.offsetWidth; card.classList.add('enter'); }
    card.style.setProperty('--pc', owned ? C.PLAYER_COLORS[meta.owner] : '');
    $('nkCardArt').innerHTML = meta.art || '';
    $('nkCardTitle').innerHTML = meta.title || '';
    $('nkCardSub').innerHTML = meta.sub || '';
    $('nkPlayerTag').innerHTML = meta.tag || '';
    $('nkHint').innerHTML = meta.hint || defaultHint();
    render();
    showOverlay(true);
    if (!meta.showcase) call('setPreview', null);
    updateFocus();
    fitCard();

    if (meta.announce !== false && opts.announce !== false) {
      U.speak(meta.speech || (U.stripTags(meta.title || '') + '. ' + U.stripTags(meta.sub || '')));
    }
    restartAutoScan();
  }

  function refresh() {
    setScreen(screen, Object.assign({}, screenOpts, { index: index, announce: false }));
  }

  /* ── Scheme-aware bits ───────────────────────────────────────────────── */

  /** The player whose own pick screen this is, or -1 on a shared screen. */
  function owner() { return meta.owner === 0 || meta.owner === 1 ? meta.owner : -1; }

  /** Does this switch count on this card? On a player's own screen only
   *  theirs does; the other player's switch is ignored completely. */
  function live(k) {
    const o = owner();
    return o < 0 || k === C.PLAYER_KEYS[o];
  }

  /** What a release of this switch means here. */
  function releaseAction(k) {
    if (owner() >= 0) return 'select';
    if (k === 'Enter') return 'select';
    // Two players with Auto Scan on are two one-switch players: either chooses.
    if (players() === 2 && isAutoScan()) return 'select';
    return 'step';
  }

  function isTouchScreen() {
    try { return window.matchMedia('(hover: none) and (pointer: coarse)').matches; }
    catch (e) { return false; }
  }

  function defaultHint() {
    const o = owner();
    let keys;
    if (o >= 0) {
      keys = '<b>Player ' + (o + 1) + '</b>: press <kbd>' + C.PLAYER_KEYS[o] + '</kbd> when yours is lit';
    } else if (isAutoScan()) {
      keys = players() === 2 ? 'Either switch picks the highlighted item'
                             : '<kbd>Enter</kbd> picks the highlighted item';
    } else {
      keys = 'Tap <kbd>Space</kbd> = next · hold <kbd>Space</kbd> = back · <kbd>Enter</kbd> = choose';
    }
    return (isTouchScreen() ? 'Tap an item to pick it · ' : '') + keys;
  }

  /* ── Auto scan ───────────────────────────────────────────────────────── */

  function scanning() { return owner() >= 0 || isAutoScan(); }

  function restartAutoScan() {
    stopAutoScan();
    if (!overlayOn || !scanning()) return;
    // Paused while a switch that counts is held.
    if ((keyDown.Space && live('Space')) || (keyDown.Enter && live('Enter'))) return;
    autoScanTimer = setInterval(() => step(1), scanInterval());
  }

  function stopAutoScan() {
    if (autoScanTimer) { clearInterval(autoScanTimer); autoScanTimer = null; }
  }

  /* ══════════════════════════════════════════════════════════════════════
     MENU INPUT
     ══════════════════════════════════════════════════════════════════════ */

  function isSwitchKey(code) { return code === 'Space' || code === 'Enter' || code === 'NumpadEnter'; }
  function normKey(code) { return code === 'NumpadEnter' ? 'Enter' : code; }

  function clearBackTimers() {
    clearTimeout(backHoldTimer); backHoldTimer = null;
    clearInterval(backRepeatTimer); backRepeatTimer = null;
    didBackHold = false;
  }

  function clearKeys() {
    keyDown.Space = keyDown.Enter = false;
    pressIndex.Space = pressIndex.Enter = -1;
    clearBackTimers();
  }

  function onKeyDown(e) {
    if (e.code === 'Escape') {
      if (!overlayOn && inRace) openPause(-1);
      return;
    }
    if (!isSwitchKey(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    audio('resume');                          // a switch press is a user gesture: unlock sound
    const k = normKey(e.code);
    if (ignoreUntilRelease[k]) {
      // Let go and pressed again, even if that release never reached us.
      const st = NK.input && NK.input.state(k);
      if (st && st.upAt > ignoreSince[k]) ignoreUntilRelease[k] = false;
      else return;
    }
    if (keyDown[k]) return;
    keyDown[k] = true;
    if (!overlayOn || !live(k)) return;      // in a race NK.controls has the switches

    pressIndex[k] = index;
    stopAutoScan();                           // the highlight waits while it is held
    if (k === 'Space' && !backHoldTimer && !backRepeatTimer) {
      didBackHold = false;
      backHoldTimer = setTimeout(() => {
        backHoldTimer = null;
        didBackHold = true;
        step(-1);
        backRepeatTimer = setInterval(() => step(-1), scanInterval());
      }, SCAN_BACK_HOLD);
    }
  }

  function onKeyUp(e) {
    if (!isSwitchKey(e.code)) return;
    e.preventDefault();
    const k = normKey(e.code);
    if (ignoreUntilRelease[k]) { ignoreUntilRelease[k] = false; keyDown[k] = false; return; }
    if (!keyDown[k]) return;
    keyDown[k] = false;
    if (!overlayOn || !live(k)) return;
    if (k === 'Space') {
      const wasBack = didBackHold;
      clearBackTimers();
      if (wasBack) { pressIndex.Space = -1; restartAutoScan(); return; }
    }
    release(k);
  }

  function release(k) {
    const at = pressIndex[k];
    pressIndex[k] = -1;
    if (releaseAction(k) === 'step') step(1);
    else activate(at);
    restartAutoScan();
  }

  /**
   * The shared scan-manager swallows the key-up of a press it thinks was too
   * short and sends this instead. Only the key it names is released — the
   * other player may be holding theirs — and a too-short press still does the
   * step or choice it would have done on a clean release.
   */
  function onInputCancelled(e) {
    const k = e && e.detail ? normKey(e.detail.code) : null;
    if (k !== 'Space' && k !== 'Enter') return;
    if (ignoreUntilRelease[k]) { ignoreUntilRelease[k] = false; keyDown[k] = false; return; }
    const wasDown = keyDown[k];
    keyDown[k] = false;
    let wasBack = false;
    if (k === 'Space') { wasBack = didBackHold || !!backRepeatTimer; clearBackTimers(); }
    if (!overlayOn || !wasDown || !live(k)) { if (overlayOn) restartAutoScan(); return; }
    if (e.detail.reason === 'too-short' && !wasBack) release(k);
    else { pressIndex[k] = -1; restartAutoScan(); }
  }

  /* ══════════════════════════════════════════════════════════════════════
     RACE LIFECYCLE
     ══════════════════════════════════════════════════════════════════════ */

  function controlOpts() {
    return {
      players: players(),
      oneSwitch: isAutoScan(),
      steerMode: setting('steerMode', 'hold'),
      steerSpeed: setting('steerSpeed', 'normal')
    };
  }

  /** Hand the screen to a race: 'start' (from the session), 'next', 'restart'. */
  function launch(how) {
    if (how === 'start') { gpSummary = null; cupsBefore = unlockedCups(sess().mode); }
    clearTimeout(trophyTimer);
    inRace = true;
    doneSince = 0;
    lastResults = null;
    stopAutoScan();
    showOverlay(false);
    call('setPreview', null);
    if (how === 'next') call('nextRace');
    else if (how === 'restart') call('restartRace');
    else call('startSession');
    if (NK.controls) NK.controls.start(controlOpts());
    // No announcement: the countdown is about to speak, and speaking now would
    // only be cut off by it.
  }

  function openPause(p) {
    if (overlayOn || !inRace) return;
    if (NK.controls) NK.controls.suspend();
    pausedBy = p === 0 || p === 1 ? p : -1;
    // The card goes up before the game pauses: pausing may report 'phase'
    // straight back, and by then the card must already be there.
    setScreen('pause');                  // showOverlay swallows the still-held switch
    call('pause');
  }

  function resumeRace() {
    showOverlay(false);
    call('resume');
    if (NK.controls) NK.controls.resume(controlOpts());
    U.speak('Go');
  }

  function endRace() {
    inRace = false;
    doneSince = 0;
    if (NK.controls) NK.controls.stop();
    $('nkPauseBtn').classList.remove('on');
  }

  function quitToTitle() {
    endRace();
    clearTimeout(trophyTimer);
    call('quitToMenu');
    if (NK.hud) NK.hud.clear();
    setScreen('title', { index: players() === 2 ? 1 : 0 });
  }

  /** Leave the finished race for a menu screen (choose another track, cup …). */
  function backToMenus(name, opts) {
    endRace();
    call('quitToMenu');
    if (NK.hud) NK.hud.clear();
    setScreen(name, opts);
  }

  function onRaceEnd(results) {
    lastResults = results || call('results') || null;
    endRace();
    setScreen('results');                // opens with nothing focused
  }

  function onGpEnd(summary) {
    gpSummary = summary || true;
    if (trophyTimer) { clearTimeout(trophyTimer); trophyTimer = null; setScreen('trophy'); }
  }

  /** After the last race's standings: start the ceremony and show the card. */
  function showTrophy() {
    if (gpSummary) { setScreen('trophy'); return; }
    call('nextRace');                    // the game runs the podium, then says 'gpEnd'
    if (gpSummary) { setScreen('trophy'); return; }
    // Never a dead end: if the game stays quiet, the card comes anyway.
    trophyTimer = setTimeout(() => { trophyTimer = null; setScreen('trophy'); }, TROPHY_FALLBACK);
  }

  function onPhase(p) {
    // The game paused itself (the page was hidden): put the pause card up.
    if (p === 'paused' && inRace && !overlayOn) openPause(-1);
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden' && inRace && !overlayOn) openPause(-1);
  }

  /* ── Exit ────────────────────────────────────────────────────────────── */

  function goToHub() {
    stopAutoScan();
    audio('stopAll');
    if (inRace) call('pause');
    U.speak('Exiting to hub');
    setTimeout(() => api.leave(), 700);
  }

  function leave() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ action: 'focusBackButton' }, '*');
    } else {
      window.location.href = '../../../index.html';
    }
  }

  /** Leaving mid-session loses the race, so it asks first; Stay goes back to
   *  exactly where the player was. */
  function confirmExit() {
    setScreen('confirmExit', { from: screen, fromOpts: screenOpts, fromIndex: index });
  }

  function openSettings() {
    resetArmed = 0;
    settingsReturn = { screen: screen, opts: screenOpts, index: index };
    setScreen('settings');
  }

  function backFromSettings() {
    resetArmed = 0;
    const r = settingsReturn;
    setScreen(r.screen, Object.assign({}, r.opts || {}, { index: r.index }));
  }

  /* ══════════════════════════════════════════════════════════════════════
     SCREEN HELPERS
     ══════════════════════════════════════════════════════════════════════ */

  /** The "← Back" row every screen ends with. */
  function back(fn) {
    return { icon: '↩', label: 'Back', speech: 'Back', wide: true, action: fn, cls: 'back' };
  }

  function indexWhere(list, fn, dflt) {
    for (let i = 0; i < list.length; i++) if (fn(list[i])) return i;
    return dflt === undefined ? 0 : dflt;
  }

  function logoHTML() {
    return '<div class="nkLogo" aria-label="NARBE Racer">' +
             '<div class="nkLogoFlag l"></div><div class="nkLogoFlag r"></div>' +
             '<div class="nkLogoTop">NARBE</div>' +
             '<div class="nkLogoMain"><span>RACER</span></div>' +
             '<div class="nkLogoStripe"></div>' +
           '</div>';
  }

  function artHTML(emoji, cls) {
    return '<div class="nkArt' + (cls ? ' ' + cls : '') + '"><span>' + emoji + '</span></div>';
  }

  function playerTag(p) {
    return '<span class="pt p' + (p + 1) + '">P' + (p + 1) + ' · ' + C.PLAYER_KEYS[p] + '</span>';
  }

  /** A kart's one-line character, from whichever stat it changes most. */
  function kartTag(v) {
    const m = v.mods || {};
    let best = null;
    ['handling', 'speed', 'accel', 'weight'].forEach((k) => { if ((m[k] || 0) > 0 && (!best || m[k] > m[best])) best = k; });
    return best ? { handling: 'Quick to steer', speed: 'Faster top speed', accel: 'Quick to speed up', weight: 'Heavy and sturdy' }[best]
                : 'Balanced';
  }

  /** The focused racer or kart: its line of description over four stat bars.
   *  Values run 1..5; karts nudge them by up to one step. */
  function statBars(st, mods, blurb) {
    const rows = [['speed', 'Speed'], ['accel', 'Acceleration'], ['handling', 'Handling'], ['weight', 'Weight']];
    let html = '<div class="nkStats">' + (blurb ? '<p class="blurb">' + esc(blurb) + '</p>' : '');
    for (let i = 0; i < rows.length; i++) {
      const key = rows[i][0];
      const base = st && isFinite(st[key]) ? st[key] : 3;
      const v = U.clamp(base + (mods && isFinite(mods[key]) ? mods[key] : 0), 0.5, 5.5);
      html += '<div class="sr"><span class="sl">' + rows[i][1] + '</span><span class="sb"><i style="width:' +
              Math.round(v / 5.5 * 100) + '%"></i></span></div>';
    }
    return html + '</div>';
  }

  function preview(charId, vehicleId) {
    if (charId) call('setPreview', { charId: charId, vehicleId: vehicleId || (karts()[0] && karts()[0].id) });
  }

  /** Where a player goes after their kart: the next player, or the course. */
  function afterKart(p) {
    if (players() === 2 && p === 0) setScreen('racer', { player: 1 });
    else goToCourse();
  }

  function goToCourse() {
    if (sess().type === 'gp') setScreen('cup');
    else setScreen('track');
  }

  function backToPicks() {
    const p = players() === 2 ? 1 : 0;
    setScreen('kart', { player: p });
  }

  function resultsPlace(r, human) {
    const hs = (r && r.humans) || [];
    for (let i = 0; i < hs.length; i++) if (hs[i].human === human) return hs[i];
    return null;
  }

  /** The finishing order as a two-column board, humans picked out. */
  function orderBoard(rows, gp) {
    const n = rows.length;
    const half = Math.ceil(n / 2);
    let html = '<div class="nkBoard' + (n > 6 ? ' two' : '') + '">';
    for (let c = 0; c < (n > 6 ? 2 : 1); c++) {
      html += '<div class="col">';
      const end = n > 6 ? Math.min(n, (c + 1) * half) : n;
      for (let i = n > 6 ? c * half : 0; i < end; i++) {
        const row = rows[i];
        const ch = charById(row.charId);
        const human = row.human === 0 || row.human === 1;
        const place = row.place || i + 1;
        let right;
        if (gp) right = '<span class="pts">' + (row.points !== undefined ? '+' + row.points : '') + '</span><span class="tot">' +
                        (row.total !== undefined ? row.total : '') + '</span>';
        else right = '<span class="tm">' + (isFinite(row.time) ? U.fmtTime(row.time) : '') + '</span>';
        html += '<div class="row' + (human ? ' me p' + (row.human + 1) : '') + (place <= 3 ? ' pod' + place : '') + '">' +
                '<span class="pl">' + place + '</span>' +
                '<span class="em">' + (ch ? ch.emoji : '🏎️') + '</span>' +
                '<span class="nm">' + esc(row.name || (ch && ch.name) || '') +
                  (human ? ' <b class="you">P' + (row.human + 1) + '</b>' : '') + '</span>' + right + '</div>';
      }
      html += '</div>';
    }
    return html + '</div>';
  }

  function standingsBoard(list) {
    const rows = (list || []).map((s, i) => ({ place: i + 1, name: s.name, charId: s.charId, human: s.human, total: s.total }));
    return orderBoard(rows, true);
  }

  /* ══════════════════════════════════════════════════════════════════════
     SCREENS
     ══════════════════════════════════════════════════════════════════════ */

  const SCREENS = {

    title: () => ({
      art: logoHTML(),
      cardClass: 'title',
      title: '',
      sub: 'Your vehicle accelerates automatically — you pick the line.',
      items: [
        { icon: '👤', label: '1 Player', speech: '1 Player',
          action: () => { call('setPlayers', 1); setScreen('rules'); } },
        { icon: '👥', label: '2 Players', note: 'One switch each', speech: '2 Players. One switch each.',
          action: () => { call('setPlayers', 2); setScreen('rules'); } },
        { icon: '❓', label: 'How to Play', speech: 'How to Play', action: () => setScreen('howto') },
        { icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings },
        { icon: '🏠', label: 'Exit Game', speech: 'Exit Game', action: goToHub }
      ],
      startIndex: sess().players === 2 ? 1 : 0,
      speech: 'NARBE Racer. 1 Player, 2 Players, How to Play, Settings, or Exit Game.'
    }),

    rules: () => {
      const two = players() === 2;
      const last = lastPicks().mode;
      return {
        art: artHTML('🚦'),
        title: 'Choose the Rules',
        sub: two ? 'Two players: <b>Player 1 uses Space</b>, <b>Player 2 uses Enter</b>.' : '',
        items: [
          { icon: '🛡️', label: 'No-Fail', note: 'Guardrails everywhere. Bumps only wobble you.',
            speech: 'No-Fail. Guardrails everywhere, and bumps only wobble you. You can not lose.',
            action: () => { call('setMode', 'nofail'); setScreen('type'); } },
          { icon: '🏁', label: 'Open', note: 'Real racing: walls, drops and spin-outs.',
            speech: 'Open. Real racing, with walls, drops and spin-outs.',
            action: () => { call('setMode', 'open'); setScreen('type'); } },
          back(() => setScreen('title', { index: two ? 1 : 0 }))
        ],
        startIndex: last === 'open' ? 1 : 0,
        speech: 'Choose the rules. No-Fail, or Open.' + (two ? ' Player 1 uses Space, Player 2 uses Enter.' : '')
      };
    },

    type: () => {
      const two = players() === 2;
      const last = lastPicks().type;
      const list = [
        { icon: '🏆', label: 'Grand Prix', note: 'Four races, points, and a trophy', speech: 'Grand Prix. Four races, points, and a trophy.',
          action: () => { call('setType', 'gp'); setScreen('speed'); }, id: 'gp' },
        { icon: '🚩', label: 'Single Race', note: 'Pick any open track', speech: 'Single Race. Pick any open track.',
          action: () => { call('setType', 'single'); setScreen('speed'); }, id: 'single' },
        { icon: '⏱️', label: 'Time Trial', note: two ? 'One player only' : 'Race the clock and your ghost',
          enabled: !two, speech: two ? 'Time Trial. One player only.' : 'Time Trial. Race the clock and your best-time ghost.',
          action: () => { call('setType', 'tt'); setScreen('speed'); }, id: 'tt' },
        back(() => setScreen('rules', { index: sess().mode === 'open' ? 1 : 0 }))
      ];
      return {
        art: artHTML('🏁'),
        title: 'Choose a Race',
        items: list,
        startIndex: indexWhere(list, (it) => it.id === last, 0),
        speech: 'Choose a race. Grand Prix, Single Race' + (two ? '.' : ', or Time Trial.')
      };
    },

    speed: () => {
      const last = lastPicks().classId || sess().classId;
      const list = C.CLASS_ORDER.map((id) => {
        const def = C.CLASSES[id];
        const locked = id === 'mirror' && !mirrorOpen();
        return {
          id: id,
          icon: def.emoji,
          label: def.name + ' <span class="cc">' + def.cc + '</span>',
          note: locked ? 'Win a trophy in both cups at Fast, Open rules' : CLASS_NOTE[id],
          enabled: !locked,
          speech: locked ? 'Mirror. Locked. Win a trophy in both cups at Fast, with Open rules, to unlock it.'
                         : def.name + '. ' + def.cc.replace('cc', ' C C') + '. ' + CLASS_NOTE[id] + '.',
          action: () => { call('setClass', id); setScreen('racer', { player: 0 }); }
        };
      });
      list.push(back(() => setScreen('type', { index: indexWhere(['gp', 'single', 'tt'], (t) => t === sess().type, 0) })));
      return {
        art: artHTML('🔥'),
        title: 'Choose a Speed',
        items: list,
        layout: 'grid2',
        startIndex: indexWhere(list, (it) => it.id === last, 0),
        speech: 'Choose a speed. Easy, Medium, Fast' + (mirrorOpen() ? ', or Mirror.' : '.')
      };
    },

    racer: (o) => {
      const p = o.player === 1 ? 1 : 0;
      const two = players() === 2;
      const last = lastPickOf(p);
      const lastChar = charById(last.charId);
      const lastKart = kartById(last.vehicleId) || karts()[0] || null;
      const list = [];
      if (lastChar && lastKart) {
        list.push({
          wide: true, primary: true, icon: '🔁', label: 'Same as last time',
          note: esc(lastChar.name) + ' in the ' + esc(lastKart.name),
          speech: 'Same as last time. ' + lastChar.name + ' in the ' + lastKart.name + '.',
          stats: statBars(lastChar.stats, lastKart.mods, lastChar.blurb),
          onFocus: () => preview(lastChar.id, lastKart.id),
          action: () => { call('setPick', p, { charId: lastChar.id, vehicleId: lastKart.id }); afterKart(p); }
        });
      }
      chars().forEach((c) => {
        list.push({
          id: c.id, icon: c.emoji, label: esc(c.name), note: WEIGHT_NAME[c.weight] || '',
          accent: cssColor(c.colors && c.colors.primary),
          speech: c.name + ', the ' + (c.animal || 'racer') + '. ' + (WEIGHT_SPEECH[c.weight] || ''),
          stats: statBars(c.stats, null, c.blurb),
          onFocus: () => preview(c.id, lastKart && lastKart.id),
          action: () => { call('setPick', p, { charId: c.id }); setScreen('kart', { player: p }); }
        });
      });
      list.push(back(() => {
        if (p === 1) setScreen('kart', { player: 0 });
        else setScreen('speed', { index: Math.max(0, C.CLASS_ORDER.indexOf(sess().classId)) });
      }));
      const key = C.PLAYER_KEYS[p];
      return {
        art: '',
        showcase: true,
        size: 'showcase',
        owner: two ? p : undefined,
        tag: two ? playerTag(p) : '',
        title: two ? 'Player ' + (p + 1) + ': Your Racer' : 'Choose Your Racer',
        sub: two ? 'Press <kbd>' + key + '</kbd> when your racer is lit.'
                 : 'Light racers steer quickly. Heavy racers are hard to push around.',
        items: list,
        layout: 'grid3',
        // "Same as last time" (when there is a last time) IS the previous choice.
        startIndex: 0,
        speech: two ? 'Player ' + (p + 1) + ', press ' + key + ' when your racer is lit.' : 'Choose your racer.'
      };
    },

    kart: (o) => {
      const p = o.player === 1 ? 1 : 0;
      const two = players() === 2;
      const ch = charById(pickOf(p).charId) || chars()[0] || null;
      const last = lastPickOf(p).vehicleId;
      const list = karts().map((v) => ({
        id: v.id, icon: v.emoji, label: esc(v.name), note: kartTag(v), cls: 'bigic',
        speech: v.name + '. ' + kartTag(v) + '.',
        stats: statBars(ch && ch.stats, v.mods, v.blurb),
        onFocus: () => preview(ch && ch.id, v.id),
        action: () => { call('setPick', p, { vehicleId: v.id }); afterKart(p); }
      }));
      list.push(back(() => setScreen('racer', { player: p })));
      const key = C.PLAYER_KEYS[p];
      return {
        art: '',
        showcase: true,
        size: 'showcase',
        owner: two ? p : undefined,
        tag: two ? playerTag(p) : '',
        title: two ? 'Player ' + (p + 1) + ': Your Vehicle' : 'Choose Your Vehicle',
        sub: two ? 'Press <kbd>' + key + '</kbd> when your vehicle is lit.'
                 : (ch ? esc(ch.name) + ' needs a ride.' : ''),
        items: list,
        layout: 'grid2',
        startIndex: indexWhere(list, (it) => it.id === last, 0),
        speech: two ? 'Player ' + (p + 1) + ', press ' + key + ' when your vehicle is lit.' : 'Choose your vehicle.'
      };
    },

    cup: () => {
      const s = sess();
      const open = unlockedCups(s.mode);
      const last = lastPicks().cupId;
      const list = cups().map((c, i) => {
        const ok = i < open;
        const tr = call('trophy', s.mode, s.classId, c.id);
        const names = (c.tracks || []).map(trackName);
        return {
          id: c.id, icon: c.emoji, label: esc(c.name), note: names.map(esc).join(' · '),
          badge: tr ? MEDAL[tr] : '', enabled: ok,
          speech: ok ? c.name + '. ' + names.join(', ') + '.' + (tr && tr !== 'done' ? ' You have the ' + tr + ' trophy.' : '')
                     : c.name + '. Locked. ' + (s.mode === 'open' ? 'Finish in the top three of the Sunshine Cup to open it.'
                                                                  : 'Finish the Sunshine Cup to open it.'),
          action: () => { call('setCup', c.id); launch('start'); }
        };
      });
      list.push(back(backToPicks));
      return {
        art: artHTML('🏆'),
        title: 'Choose a Cup',
        sub: 'Four races. Points for every place. A trophy for the top three.',
        items: list,
        startIndex: indexWhere(list, (it) => it.id === last, 0),
        speech: 'Choose a cup.'
      };
    },

    track: () => {
      const s = sess();
      const tt = s.type === 'tt';
      const open = unlockedCups(s.mode);
      const last = lastPicks().trackId;
      const list = [];
      cups().forEach((c, i) => {
        list.push({ header: true, wide: true, icon: c.emoji, label: esc(c.name) + (i < open ? '' : ' <span class="lk">🔒 locked</span>') });
        (c.tracks || []).forEach((id) => {
          const ok = i < open;
          const best = tt ? call('bestTime', id, s.classId) : null;
          const t = trackDef(id);
          list.push({
            id: id, icon: trackEmoji(id), label: esc(trackName(id)),
            note: tt ? (best ? 'Best ' + U.fmtTime(best) : 'No time yet') : esc((t && t.blurb) || ''),
            enabled: ok,
            speech: trackName(id) + (ok ? (tt ? (best ? '. Best time ' + U.sayTime(best) : '. No time yet') : '') : '. Locked.'),
            action: () => { call('setTrack', id); launch('start'); }
          });
        });
      });
      list.push(back(backToPicks));
      return {
        art: '',
        title: tt ? 'Time Trial: Choose a Track' : 'Choose a Track',
        items: list,
        layout: 'grid2',
        size: 'wide',
        startIndex: indexWhere(list, (it) => it.id === last, 1),
        speech: 'Choose a track.'
      };
    },

    howto: (o) => {
      const page = o.page || 0;
      const one = isAutoScan();
      const stepMode = setting('steerMode', 'hold') === 'step';
      let steer;
      if (!stepMode && !one) {
        steer = '<b>Hold Space</b> to slide left. <b>Hold Enter</b> to slide right. Let go and the vehicle settles into the nearest lane.';
      } else if (!stepMode) {
        steer = 'Only <b>Enter</b> steers. The glowing panel at the side shows which way your next hold goes. ' +
                '<b>Hold Enter</b> to slide that way. Every time you let go, the other side lights up — it turns ' +
                '<b>green</b> when it matches the way the game suggests.';
      } else if (!one) {
        steer = '<b>Press Space</b> to move one lane left. <b>Press Enter</b> to move one lane right. No need to hold.';
      } else {
        steer = 'A light walks across the five lanes at the bottom of the screen. <b>Press Enter</b> and your vehicle ' +
                'drives to the lit lane. The <b>green</b> lane is the one the game suggests.';
      }
      const pages = [
        { art: '🕹️', title: 'Steering',
          sub: '<p>Your vehicle speeds up and follows the road by itself.</p><p>' + steer + '</p>' +
               '<p><b>Two players:</b> Player 1 uses Space and Player 2 uses Enter.</p>' },
        { art: '⚡', title: 'Items and Boosts',
          sub: '<p>Drive through a <b>Power Box</b> to get an item.</p>' +
               '<p>Your item fires by itself after <b>3 to 6 seconds</b>. <b>USE IN</b> beside the item shows the countdown.</p>' +
               '<p>Glowing pads and road arrows give a free boost. Stay on the <b>inside of a bend</b> to charge a mini-turbo.</p>' },
        { art: '⏸️', title: 'Pausing and Menus',
          sub: '<p>To pause, <b>hold Enter</b> (two players: hold your switch), or press the <b>Pause</b> button.</p>' +
               '<p>In menus, tap <b>Space</b> to move, <b>hold Space</b> to scan backwards, and press <b>Enter</b> to choose.</p>' +
               '<p>With <b>Auto Scan</b> on, the highlight moves by itself. Press <b>Enter</b> when it is on what you want.</p>' }
      ];
      const pg = pages[page] || pages[0];
      const list = [];
      if (page < pages.length - 1) {
        list.push({ icon: '▶', label: 'Next: ' + pages[page + 1].title, speech: 'Next page. ' + pages[page + 1].title,
                    action: () => setScreen('howto', { page: page + 1 }) });
      } else {
        list.push({ icon: '⏮', label: 'Back to the start', speech: 'Back to the first page',
                    action: () => setScreen('howto', { page: 0 }) });
      }
      if (page === 0) {
        list.push({ icon: '🔁', label: 'Switch to ' + (one ? 'Two Switches' : 'One Switch'),
          speech: 'Switch to ' + (one ? 'two switches' : 'one switch'),
          action: () => {
            const s = U.sm();
            if (s) s.toggleAutoScan();     // Auto Scan is the control scheme
            refresh();
            U.speak(isAutoScan() ? 'One switch. Enter plays the game.' : 'Two switches. Space left, Enter right.');
          } });
        list.push({ icon: '🎚️', label: 'Steering', value: stepMode ? 'Press to Step' : 'Hold to Slide',
          speech: 'Steering, ' + (stepMode ? 'press to step' : 'hold to slide'),
          action: () => {
            setSetting('steerMode', stepMode ? 'hold' : 'step');
            refresh();
            U.speak('Steering: ' + (stepMode ? 'hold to slide' : 'press to step'));
          } });
      }
      list.push(back(() => setScreen('title', { index: 2 })));
      return {
        art: artHTML(pg.art),
        title: '<span class="kicker">How to Play · ' + (page + 1) + ' of ' + pages.length + '</span>' + pg.title,
        sub: pg.sub,
        cardClass: 'howto',
        items: list,
        speech: 'How to play, page ' + (page + 1) + ' of ' + pages.length + '. ' + pg.title + '. ' +
                U.stripTags(pg.sub.replace(/<\/p>/g, ' '))
      };
    },

    settings: () => {
      const v = U.vm(), s = U.sm();
      const tts = v ? v.getSettings().ttsEnabled : true;
      const voiceName = v && v.getVoiceDisplayName ? v.getVoiceDisplayName(v.getCurrentVoice()) : 'Default';
      const autoScan = s ? s.getSettings().autoScan : false;
      const speed = s ? s.getScanInterval() : 2000;
      const steerMode = setting('steerMode', 'hold');
      const steerSpeed = setting('steerSpeed', 'normal');
      const cue = U.clamp(setting('cueLevel', 1) | 0, 0, 2);
      const music = setting('music', true) !== false;
      const sfxOn = setting('sfx', true) !== false;
      const split = setting('split', 'side');
      const shake = setting('shake', true) !== false;
      const speedName = (C.STEER_SPEEDS[steerSpeed] || C.STEER_SPEEDS.normal).name;
      const nextSpeed = C.STEER_ORDER[(C.STEER_ORDER.indexOf(steerSpeed) + 1) % C.STEER_ORDER.length];

      const list = [
        { icon: '🗣️', label: 'Text to Speech', value: tts ? 'On' : 'Off', speech: 'Text to Speech, ' + (tts ? 'On' : 'Off'),
          action: () => { if (v) { v.toggleTTS(); refresh(); if (v.getSettings().ttsEnabled) U.speak('Text to speech on'); } } },
        { icon: '🎙️', label: 'Voice', value: voiceName, speech: 'Voice, ' + voiceName,
          action: () => { if (v) { v.cycleVoice(); refresh(); U.speak('Voice changed'); } } },
        { icon: '🎚️', label: 'Steering', value: steerMode === 'step' ? 'Press to Step' : 'Hold to Slide',
          speech: 'Steering, ' + (steerMode === 'step' ? 'press to step' : 'hold to slide'),
          action: () => {
            const next = steerMode === 'step' ? 'hold' : 'step';
            setSetting('steerMode', next);
            refresh();
            U.speak('Steering: ' + (next === 'step' ? 'press to step' : 'hold to slide'));
          } },
        { icon: '🐢', label: 'Steering Speed', value: speedName, speech: 'Steering Speed, ' + speedName,
          action: () => {
            setSetting('steerSpeed', nextSpeed);
            refresh();
            U.speak('Steering speed: ' + C.STEER_SPEEDS[nextSpeed].name.toLowerCase());
          } },
        { icon: '🧭', label: 'Direction Help', note: 'Off / Visual / On with hazard calls', value: CUE_NAMES[cue], speech: 'Direction Help, ' + CUE_SPEECH[cue],
          action: () => {
            const next = (cue + 2) % 3;      // On → Visual → Off → On, as in Race Tracks
            setSetting('cueLevel', next);
            refresh();
            U.speak('Direction help: ' + CUE_SPEECH[next]);
          } },
        { icon: '🎵', label: 'Music', value: music ? 'On' : 'Off', speech: 'Music, ' + (music ? 'On' : 'Off'),
          action: () => { setSetting('music', !music); refresh(); U.speak('Music: ' + (music ? 'off' : 'on')); } },
        { icon: '🖥️', label: 'Split Screen', value: split === 'stack' ? 'Top and Bottom' : 'Side by Side',
          speech: 'Split Screen, ' + (split === 'stack' ? 'top and bottom' : 'side by side'),
          action: () => {
            const next = split === 'stack' ? 'side' : 'stack';
            setSetting('split', next);
            refresh();
            U.speak('Split screen: ' + (next === 'stack' ? 'top and bottom' : 'side by side'));
          } },
        { icon: '📳', label: 'Camera Shake', value: shake ? 'On' : 'Off', speech: 'Camera Shake, ' + (shake ? 'On' : 'Off'),
          action: () => { setSetting('shake', !shake); refresh(); U.speak('Camera shake: ' + (shake ? 'off' : 'on')); } },
        // Auto Scan doubles as the control scheme, so say what it MEANS.
        { icon: '🔁', label: 'Auto Scan', value: autoScan ? 'On — One Switch' : 'Off — Two Switches',
          speech: autoScan ? 'Auto Scan on. One switch: Enter plays the game.'
                           : 'Auto Scan off. Two switches: Space is left, Enter is right.',
          action: () => {
            if (!s) return;
            s.toggleAutoScan();
            refresh();
            U.speak(s.getSettings().autoScan ? 'Auto scan on. One switch. Enter plays the game.'
                                              : 'Auto scan off. Two switches. Space left, Enter right.');
          } },
        { icon: '⏲️', label: 'Scan Speed', value: (speed / 1000) + 's', speech: 'Scan Speed, ' + (speed / 1000) + ' seconds',
          action: () => { if (s) { s.cycleScanSpeed(); refresh(); U.speak('Scan speed ' + (s.getScanInterval() / 1000) + ' seconds'); } } },
        { icon: '🔊', label: 'Sound Effects', value: sfxOn ? 'On' : 'Off', speech: 'Sound Effects, ' + (sfxOn ? 'On' : 'Off'),
          action: () => { setSetting('sfx', !sfxOn); refresh(); U.speak('Sound effects: ' + (sfxOn ? 'off' : 'on')); } },
        { icon: '🗑️', label: 'Reset Progress', value: resetArmed ? 'Sure?' : '', cls: resetArmed ? 'armed' : '',
          speech: resetArmed ? 'Select again to erase all progress' : 'Reset Progress',
          action: () => {
            if (resetArmed && Date.now() - resetArmed < RESET_ARM_MS) {
              call('resetProgress');
              resetArmed = 0;
              refresh();
              U.speak('Progress reset');
            } else {
              resetArmed = Date.now();
              refresh();
              U.speak('Select again to erase all progress');
            }
          } },
        back(backFromSettings)
      ];
      return {
        art: '',
        title: 'Settings',
        items: list,
        layout: 'cols2',
        size: 'wide',
        speech: 'Settings'
      };
    },

    pause: () => {
      const two = players() === 2;
      return {
        art: artHTML('⏸️'),
        title: 'Paused',
        sub: two && pausedBy >= 0 ? 'Player ' + (pausedBy + 1) + ' paused the race.' : '',
        // Nothing focused: releasing the switch that paused must not pick an
        // option, and the first press only steps and reads.
        startIndex: -1,
        items: [
          { icon: '▶️', label: 'Continue', speech: 'Continue', action: resumeRace },
          { icon: '🔄', label: 'Restart', speech: 'Restart this race', action: () => launch('restart') },
          { icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings },
          { icon: '🏠', label: 'Main Menu', speech: 'Main Menu', action: quitToTitle },
          { icon: '🚪', label: 'Exit Game', speech: 'Exit Game', action: confirmExit },
          { icon: '🆘', label: 'Help', speech: 'Help', action: () => U.speak('I need help') }
        ],
        layout: 'grid2',
        speech: 'Paused. Continue, Restart, Settings, Main Menu, Exit Game, or Help.'
      };
    },

    results: () => {
      const r = lastResults || call('results') || {};
      const two = players() === 2;
      const tt = r.type === 'tt';
      const gp = r.gp || null;
      const nofail = r.mode === 'nofail';
      const h0 = resultsPlace(r, 0), h1 = resultsPlace(r, 1);
      let art, title, sub = '', speech;

      if (tt) {
        const t = h0 && isFinite(h0.time) ? h0.time : null;
        art = artHTML(h0 && h0.newBest ? '🌟' : '⏱️');
        title = h0 && h0.newBest ? 'New Best Time!' : 'Time Trial Done';
        sub = '<span class="bigTime">' + (t !== null ? U.fmtTime(t) : '--:--.-') + '</span>';
        const best = call('bestTime', r.track, r.classId);
        if (best && !(h0 && h0.newBest)) sub += '<br>Best ' + U.fmtTime(best);
        speech = (h0 && h0.newBest ? 'New best time! ' : 'Time trial done. ') + (t !== null ? 'Your time, ' + U.sayTime(t) + '.' : '');
      } else if (two) {
        const a = h0 ? h0.place : 0, b = h1 ? h1.place : 0;
        const best = Math.min(a || 99, b || 99);
        art = artHTML(best === 1 ? '🏆' : best <= 3 ? '🎉' : '🏁');
        title = 'Race Complete!';
        sub = '<span class="duo"><span class="pt p1">P1 ' + (a ? U.ordinal(a) : '—') + '</span>' +
              '<span class="pt p2">P2 ' + (b ? U.ordinal(b) : '—') + '</span></span>';
        speech = 'Race complete. Player 1 came ' + (a ? sayOrdinal(a) : 'in') + '. Player 2 came ' + (b ? sayOrdinal(b) : 'in') + '.';
      } else {
        const pl = h0 ? h0.place : 0;
        art = artHTML(pl === 1 ? '🏆' : pl && pl <= 3 ? '🎉' : '🏁', pl && pl <= 3 ? 'pod' + pl : '');
        if (pl === 1) title = 'You Won!';
        else if (pl && pl <= 3) title = 'Podium! ' + U.ordinal(pl) + ' Place';
        else title = nofail ? 'Race Complete!' : (pl ? U.ordinal(pl) + ' Place' : 'Race Complete');
        sub = pl ? 'You finished <b>' + U.ordinal(pl) + '</b>' + (h0 && isFinite(h0.time) ? ' in ' + U.fmtTime(h0.time) : '') + '.' : '';
        if (nofail && pl > 3) sub += ' Great driving — every lap counts.';
        speech = (pl === 1 ? 'You won! ' : 'Finish! ') + (pl ? 'You came ' + sayOrdinal(pl) + '.' : '');
      }
      if (gp) sub += (sub ? '<br>' : '') + 'Race ' + gp.race + ' of ' + gp.of;

      const list = [];
      if (gp) {
        list.push({ icon: '📊', label: 'Standings', primary: true, speech: 'Standings', action: () => setScreen('standings') });
      } else if (tt) {
        list.push({ icon: '🔄', label: 'Try Again', primary: true, speech: 'Try again', action: () => launch('start') });
        list.push({ icon: '🗺️', label: 'Choose Track', speech: 'Choose track', action: () => backToMenus('track') });
      } else {
        list.push({ icon: '🔄', label: 'Race Again', primary: true, speech: 'Race again', action: () => launch('start') });
        list.push({ icon: '🗺️', label: 'Choose Track', speech: 'Choose track', action: () => backToMenus('track') });
      }
      list.push({ icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings });
      list.push({ icon: '🏠', label: 'Main Menu', speech: 'Main Menu', action: quitToTitle });
      list.push({ icon: '🚪', label: 'Exit Game', speech: 'Exit Game', action: confirmExit });

      return {
        art, title, sub,
        stats: !tt && r.order && r.order.length ? orderBoard(r.order, !!gp) : '',
        cardClass: 'results',
        size: 'wide',
        items: list,
        layout: 'row',
        listenFirst: true,
        speech: speech + (r.track ? ' ' + trackName(r.track) + '.' : '')
      };
    },

    standings: () => {
      const r = lastResults || call('results') || {};
      const gp = r.gp || sess().gp || { race: 1, of: 4, standings: [] };
      const done = !!gp.done || gp.race >= gp.of;
      const list = [];
      if (done) {
        list.push({ icon: '🏆', label: 'Trophy Ceremony', primary: true, speech: 'Trophy ceremony', action: showTrophy });
      } else {
        const cup = cupOf(sess().cupId) || cupOf(r.cupId);
        const nextId = cup && cup.tracks ? cup.tracks[gp.race] : null;
        list.push({ icon: '▶️', label: 'Next Race', primary: true, note: nextId ? esc(trackName(nextId)) : '',
                    speech: 'Next race' + (nextId ? ', ' + trackName(nextId) : ''), action: () => launch('next') });
      }
      list.push({ icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings });
      list.push({ icon: '🏠', label: 'Main Menu', speech: 'Main Menu', action: quitToTitle });
      list.push({ icon: '🚪', label: 'Exit Game', speech: 'Exit Game', action: confirmExit });
      const st = gp.standings || [];
      let mine = '';
      for (let i = 0; i < st.length; i++) {
        if (st[i].human === 0) { mine = 'You are ' + sayOrdinal(i + 1) + ' with ' + st[i].total + ' points.'; break; }
      }
      return {
        art: artHTML('📊'),
        title: done ? 'Final Standings' : 'Standings',
        sub: 'After race ' + gp.race + ' of ' + gp.of,
        stats: standingsBoard(st),
        cardClass: 'results',
        size: 'wide',
        items: list,
        layout: 'row',
        listenFirst: true,
        speech: (done ? 'Final standings. ' : 'Standings after race ' + gp.race + ' of ' + gp.of + '. ') + mine
      };
    },

    trophy: () => {
      const r = lastResults || call('results') || {};
      const gp = (r && r.gp) || sess().gp || {};
      const st = gp.standings || [];
      const s = sess();
      const nofail = (r.mode || s.mode) === 'nofail';
      const two = players() === 2;
      const cup = cupOf(s.cupId);
      const placeOf = (h) => { for (let i = 0; i < st.length; i++) if (st[i].human === h) return i + 1; return 0; };
      const kindOf = (pl) => pl === 1 ? 'gold' : pl === 2 ? 'silver' : pl === 3 ? 'bronze' : (nofail ? 'done' : null);
      const p0 = placeOf(0), p1 = two ? placeOf(1) : 0;
      const k0 = kindOf(p0);
      let title, sub, speech;
      const opened = unlockedCups(s.mode) > cupsBefore && cupsBefore > 0;
      if (two) {
        title = 'Cup Complete!';
        sub = '<span class="duo"><span class="pt p1">P1 ' + (p0 ? U.ordinal(p0) : '—') + ' ' + (MEDAL[kindOf(p0)] || '') + '</span>' +
              '<span class="pt p2">P2 ' + (p1 ? U.ordinal(p1) : '—') + ' ' + (MEDAL[kindOf(p1)] || '') + '</span></span>';
        speech = 'Cup complete. Player 1 finished ' + sayOrdinal(p0 || 12) + ' overall. Player 2 finished ' + sayOrdinal(p1 || 12) + ' overall.';
      } else if (k0 && k0 !== 'done') {
        title = k0.charAt(0).toUpperCase() + k0.slice(1) + ' Trophy!';
        sub = 'You finished <b>' + U.ordinal(p0) + '</b> overall.';
        speech = 'You won the ' + k0 + ' trophy! You finished ' + sayOrdinal(p0) + ' overall.';
      } else if (k0 === 'done') {
        title = 'Cup Complete!';
        sub = 'You finished <b>' + U.ordinal(p0) + '</b> overall. Every race counted.';
        speech = 'Cup complete! You finished ' + sayOrdinal(p0) + ' overall.';
      } else {
        title = 'Cup Over';
        sub = 'You finished <b>' + (p0 ? U.ordinal(p0) : '') + '</b> overall. The top three win a trophy.';
        speech = 'Cup over. You finished ' + (p0 ? sayOrdinal(p0) : '') + ' overall. The top three win a trophy.';
      }
      if (cup) sub = esc(cup.name) + (s.classId && C.CLASSES[s.classId] ? ' · ' + C.CLASSES[s.classId].cc : '') + '<br>' + sub;
      if (opened) { sub += '<br><b class="new">A new cup is open!</b>'; speech += ' A new cup is open!'; }
      return {
        // A trophy on a disc of its own metal (the title names it too).
        art: artHTML(k0 === 'done' || !k0 ? '🏁' : '🏆', 'trophy ' + (k0 || '')),
        title, sub,
        showcase: true,
        size: 'showcase',
        cardClass: 'trophy',
        items: [
          { icon: '🔄', label: 'Play This Cup Again', primary: true, speech: 'Play this cup again', action: () => launch('start') },
          { icon: '🏆', label: 'Choose Another Cup', speech: 'Choose another cup', action: () => backToMenus('cup') },
          { icon: '⚙️', label: 'Settings', speech: 'Settings', action: openSettings },
          { icon: '🏠', label: 'Main Menu', speech: 'Main Menu', action: quitToTitle },
          { icon: '🚪', label: 'Exit Game', speech: 'Exit Game', action: goToHub }
        ],
        listenFirst: true,
        speech: speech
      };
    },

    confirmExit: (o) => {
      const racing = inRace || (sess().gp && !(sess().gp.done));
      return {
        art: artHTML('🚪'),
        title: 'Leave NARBE Racer?',
        sub: 'Go back to the hub.' + (racing ? ' <b>This race will not be saved.</b>' : ''),
        // The safe choice first: a mis-press lands on the way out of the dialog.
        items: [
          { icon: '↩', label: 'Stay', primary: true, speech: 'Stay',
            action: () => setScreen(o.from || 'title', Object.assign({}, o.fromOpts || {}, { index: o.fromIndex })) },
          { icon: '🏠', label: 'Exit Game', speech: 'Exit Game', action: goToHub }
        ],
        startIndex: 0,
        speech: 'Leave NARBE Racer and go back to the hub?' + (racing ? ' This race will not be saved.' : '') + ' Stay, or Exit Game.'
      };
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
     PER FRAME AND BOOT
     ══════════════════════════════════════════════════════════════════════ */

  /**
   * The only per-frame job: a watchdog. Races always end on their own, and if
   * the game ever finishes one without saying so, the results card still comes
   * — nobody is left watching a victory lap with no way out.
   */
  function tick() {
    if (!inRace || overlayOn) { doneSince = 0; return; }
    if (call('phase') === 'done') {
      const t = performance.now();
      if (!doneSince) doneSince = t;
      else if (t - doneSince > RESULTS_WATCHDOG) onRaceEnd(call('results'));
    } else {
      doneSince = 0;
    }
  }

  function init() {
    if (ready) return;
    buildDom();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('narbe-input-cancelled', onInputCancelled);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', () => { clearKeys(); if (overlayOn) restartAutoScan(); });

    if (NK.controls) NK.controls.onPause = openPause;
    const g = G();
    if (g && typeof g.on === 'function') {
      g.on('raceEnd', onRaceEnd);
      g.on('gpEnd', onGpEnd);
      g.on('phase', onPhase);
    }
    // Keep menus in step if the hub changes scan settings while we are open.
    const s = U.sm();
    if (s && s.subscribe) s.subscribe(() => {
      if (!overlayOn) return;
      $('nkHint').innerHTML = meta.hint || defaultHint();
      restartAutoScan();
    });

    setScreen('title');
    // Voices load asynchronously; say the focused item again once they are in.
    setTimeout(() => { if (screen === 'title' && index >= 0) speakItem(); }, 900);
    ready = true;
  }

  const api = {
    init, tick, setScreen, openPause, goToHub, leave,
    debugRace() {
      inRace = true; doneSince = 0; lastResults = null; gpSummary = null;
      stopAutoScan(); showOverlay(false);
      if (NK.controls) NK.controls.start(controlOpts());
    },
    get ready() { return ready; },
    get screen() { return screen; },
    /** For the browser checks, which cannot see focus state from the DOM. */
    __dbg: function () {
      return {
        screen, index, selected: index >= 0, overlayOn, inRace,
        owner: owner(), autoScanRunning: !!autoScanTimer,
        keyDown: { Space: keyDown.Space, Enter: keyDown.Enter },
        ignore: { Space: ignoreUntilRelease.Space, Enter: ignoreUntilRelease.Enter },
        rows: items.map((it) => String(it.speech || U.stripTags(it.label || '')))
      };
    }
  };
  return api;
})();
