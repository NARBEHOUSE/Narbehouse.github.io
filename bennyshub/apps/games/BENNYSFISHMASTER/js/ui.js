/**
 * Benny's FishMaster — menus, switch input, HUD.
 *
 * Two input contexts, decided purely by whether the overlay is up:
 *   • overlay visible → scanning, exactly like the rest of the hub's games.
 *   • overlay hidden  → the switch belongs to the game, and auto-scan never
 *     starts. Steering, aiming, charging, waiting and reeling are all
 *     overlay-hidden.
 *
 * That one rule is the whole auto-scan story — there is no new plumbing, and
 * the pause menu resumes scanning by itself simply by being an overlay.
 *
 * The switch vocabulary, which never changes meaning within a context:
 *
 *   steering   hold  = go that way        tap = swap the armed side (1-switch)
 *   aiming     hold  = swing the aimer (SPACE)
 *   casting    press = start pushing it out, let go = throw  (full auto-casts)
 *   fish on    press = hook it
 *   reeling    hold  = bring it in
 *   any card   tap   = pick the highlighted row
 *
 * Note which way round those last few are. Nothing in play needs a SHORT
 * press: casting and hooking happen the instant the switch goes down, and a
 * switch held for a minute does the same thing as one held for a second.
 *
 * Doing nothing is safe in every single one of them.
 */
RT.ui = (function () {
  'use strict';

  const U = RT.util;
  const G = RT.game;
  const AU = RT.audio;
  const $ = U.$;

  const TAP_MAX_MS = 400;        // under this, a press is a tap, not a hold
  const SCAN_BACK_HOLD = 3000;   // hold Space in a menu to scan backwards
  const SCAN_BACK_REPEAT = 420;

  const CUE_NAMES  = ['Off', 'Visual', 'On'];
  const CUE_SPEECH = ['off', 'visual only', 'on'];

  const THEMES = [
    { id: 'ben',      name: "Ben's" },
    { id: 'dark',     name: 'Dark' },
    { id: 'light',    name: 'Light' },
    { id: 'contrast', name: 'High Contrast' }
  ];
  const CARD_STYLES = [
    { id: 'plaque',      name: 'Plaque' },
    { id: 'certificate', name: 'Certificate' }
  ];

  /* ── State ────────────────────────────────────────────────────────────── */

  let screen = 'title';
  let items = [];
  let index = 0;
  let autoScanTimer = null;
  let overlayOn = true;
  let cardData = null;
  let turnIn = null;
  let lastTrip = null;
  let lastAim = null;
  let resetArmed = 0;

  const keyDown = { Space: false, Enter: false };
  const keyDownAt = { Space: 0, Enter: 0 };
  /* Set when a press has already been spent on something other than its
     release, so its eventual release does not also register as a tap. */
  const spent = { Space: false, Enter: false };
  /* Set when a menu opens while a switch is physically held. Key auto-repeat
     would otherwise re-arm that key straight after clearKeys(), and its
     eventual release would land on the menu as a selection. */
  const ignoreUntilRelease = { Space: false, Enter: false };
  let backHoldTimer = null, backRepeatTimer = null, didBackHold = false;
  let lastActivate = 0;

  /**
   * Auto Scan *is* the one-switch setting — across the hub it already means
   * "this player has a single switch", so the game takes its control scheme
   * from it rather than duplicating the choice as its own option.
   *
   *   Auto Scan on  → one switch. Only Enter plays. This is Ben's rig.
   *   Auto Scan off → two switches. Space is left, Enter is right.
   */
  function isOneSwitch() {
    const s = U.sm();
    return !!(s && s.getSettings().autoScan);
  }

  function ctx() {
    if (overlayOn) return 'menu';
    if (worldOn) return 'world';
    return 'game';
  }

  /* ══════════════════════════════════════════════════════════════════════
     OVERLAY PLUMBING
     ══════════════════════════════════════════════════════════════════════ */

  function showOverlay(on) {
    overlayOn = on;
    $('overlay').classList.toggle('on', on);
    const playing = !on && !!G.run;
    $('hud').classList.toggle('on', playing);
    $('pauseBtn').classList.toggle('on', playing);
    syncSidePanels();
    if (on) {
      /* A card can open with a switch still physically held down. The catch
         card is the case that bites: it arrives the instant the reel finishes,
         while ENTER is still held from reeling. clearKeys() below drops our
         record of that key, so the browser's next auto-repeat keydown reads as
         a fresh press and the release right after it activates the focused
         row — dismissing the card before the player has read a word of it.

         Swallowing the key until it is genuinely released is the same guard
         the pause menu has always used. OR, never assign: openPause() clears
         its keys before it calls setScreen(), so by the time we get here its
         own capture is the only record that the switch was ever down. */
      ignoreUntilRelease.Space = ignoreUntilRelease.Space || keyDown.Space;
      ignoreUntilRelease.Enter = ignoreUntilRelease.Enter || keyDown.Enter;
      clearCue();
      clearKeys();
    }
    if (on && worldOn) closeWorldScan();
  }

  function syncSidePanels() {
    const show = !overlayOn && !!G.run && G.isSteering();
    $('steerBar').classList.toggle('on', show);
    if (!show) {
      $('spotLeft').classList.remove('on');
      $('spotRight').classList.remove('on');
    }
  }

  function render() {
    const menu = $('panelMenu');
    menu.innerHTML = '';
    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'menuItem';
      if (it.enabled === false) el.classList.add('locked');
      if (i === index) el.classList.add('focused');

      const label = document.createElement('span');
      label.innerHTML = it.label;
      el.appendChild(label);
      if (it.value !== undefined) {
        const v = document.createElement('span');
        v.className = 'val';
        v.textContent = it.value;
        el.appendChild(v);
      }

      U.addTap(el, () => {
        if (it.enabled === false) { AU.menuBlocked(); return; }
        index = i; updateFocus(); activate();
      });
      el.addEventListener('mouseenter', () => {
        if (it.enabled === false || index === i) return;
        index = i; updateFocus(); restartAutoScan();
      });
      menu.appendChild(el);
    });
  }

  /** Whether it is fair to animate. ui.js has no reducedMotion of its own. */
  function smoothOk() {
    try {
      return !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
             document.body.getAttribute('data-motion') !== 'still';
    } catch (e) { return false; }
  }

  function updateFocus() {
    const els = $('panelMenu').children;
    for (let i = 0; i < els.length; i++) els[i].classList.toggle('focused', i === index);
    /* Keep the scan visible. The tackle counter is long enough to scroll now
       that it has a shelf on it, and a highlighted row somewhere below the
       fold is the same as no highlight at all to whoever is watching. */
    if (els[index] && els[index].scrollIntoView) {
      els[index].scrollIntoView({ block: 'nearest', behavior: smoothOk() ? 'smooth' : 'auto' });
    }
    const it = items[index];
    if (it && typeof it.onFocus === 'function') it.onFocus();
  }

  function stripTags(html) {
    return String(html).replace(/<[^>]*>/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}]/gu, '').trim();
  }
  function speakItem() {
    const it = items[index];
    if (!it) return;
    U.speak(it.speech !== undefined ? it.speech
      : stripTags(it.label) + (it.value !== undefined ? ', ' + it.value : ''));
  }

  function step(delta) {
    if (!items.length) return;
    let i = index;
    for (let n = 0; n < items.length; n++) {
      i = (i + delta + items.length) % items.length;
      if (items[i].enabled !== false) { index = i; break; }
    }
    updateFocus(); speakItem(); AU.menuMove();
    if (!didBackHold) restartAutoScan();
  }

  function activate() {
    const now = Date.now();
    if (now - lastActivate < 140) return;   // debounce switch bounce
    lastActivate = now;
    const it = items[index];
    if (!it || it.enabled === false) { AU.menuBlocked(); return; }
    AU.resume(); AU.menuSelect();
    if (typeof it.action === 'function') it.action();
  }

  function restartAutoScan() {
    stopAutoScan();
    if (ctx() !== 'menu') return;          // never scan during play
    const s = U.sm();
    if (!s || !s.getSettings().autoScan) return;
    autoScanTimer = setInterval(() => step(1), s.getScanInterval());
  }
  function stopAutoScan() {
    if (autoScanTimer) { clearInterval(autoScanTimer); autoScanTimer = null; }
  }


  /* ══════════════════════════════════════════════════════════════════════
     WORLD SCAN — the dock
     The tackle shop, the boat and the signpost ARE the choices, so scanning
     runs over objects in the scene instead of rows on a card. Everything else
     about it matches a menu: the hub's scan interval drives it, Space steps,
     Enter selects, and the focused thing is spoken and unmistakably marked.
     ══════════════════════════════════════════════════════════════════════ */

  let worldOn = false;
  let worldPlace = 'dock';      // 'dock' | 'shop'
  let worldItems = [];
  let worldIndex = 0;
  let worldTimer = null;

  function openDock() {
    G.goToDock();
    enterWorld('dock', () => G.turnInState().done ? indexOfKey('shop') : indexOfKey('boat'));
  }

  /** Step inside the tackle shop — a room, scanned exactly like the dock. */
  function openShop() {
    G.enterShop();
    /* The shopkeeper, always - he is the whole reason to come in.
     *
     * With a job finished this used to open on the tackle wall, because the
     * gear had to be bought before the job could be handed in. He does all of
     * that himself now (sell, gear, hand in, one press), so starting anywhere
     * else means scanning past him to reach the only thing that matters. */
    enterWorld('shop', () => indexOfKey('keeper'));
  }

  /**
   * Hand the screen to a place whose contents ARE the choices. Both the dock
   * and the shop work this way, so they share every part of it but the list.
   */
  function enterWorld(place, pickStart) {
    worldPlace = place;
    showOverlay(false);
    /* Whatever switch was down when this opened must not count as a press on
       it. The spot's choices arrive at the end of something the player was
       HOLDING - the helm on the way in, or the reel winding the line home -
       so their release would otherwise land on the highlighted row and pick
       it before they had seen the card. Same guard the overlay uses. */
    ignoreUntilRelease.Space = ignoreUntilRelease.Space || keyDown.Space;
    ignoreUntilRelease.Enter = ignoreUntilRelease.Enter || keyDown.Enter;
    clearKeys();
    worldOn = true;
    worldItems = place === 'shop' ? G.shopTargets()
               : place === 'spot' ? G.spotTargets()
               : G.dockTargets();
    worldIndex = pickStart ? pickStart() : 0;
    $('worldLabels').classList.add('on');
    $('dockHud').classList.toggle('on', place === 'dock');
    renderWorldLabels();
    if (place === 'dock') paintDockHud();
    applyWorldFocus();
    positionWorldLabels();
    const preamble = place === 'shop' ? 'The tackle shop. '
                   : place === 'spot' ? '' : 'The dock. ';
    U.speak(preamble + (worldItems[worldIndex] ? worldItems[worldIndex].speech : ''));
    startWorldScan();
  }

  /** Point the scan frame and the name plates at whatever has focus. */
  function applyWorldFocus() {
    const it = worldItems[worldIndex];
    // A DOM stop has no object in the scene, so the frame goes on its
    // button instead. Point at the object's own index, not this list's.
    G.setDockFocus(it && it.sceneIndex !== undefined ? it.sceneIndex : -1);
    paintWorldFocus();
  }

  /** Rebuild the labels in place — used after turning a mission in. */
  function refreshWorld() {
    if (!worldOn) return;
    worldItems = worldPlace === 'shop' ? G.shopTargets()
               : worldPlace === 'spot' ? G.spotTargets()
               : G.dockTargets();
    renderWorldLabels();
    if (worldPlace === 'dock') paintDockHud();
  }

  function indexOfKey(k) {
    const i = worldItems.findIndex(t => t.key === k);
    return i < 0 ? 0 : i;
  }

  function closeWorldScan() {
    worldOn = false;
    stopWorldScan();
    hideScanFrame();
    $('worldLabels').classList.remove('on');
    $('worldLabels').innerHTML = '';
    $('dockHud').classList.remove('on');
    $('pauseBtn').classList.remove('focused');
    G.setDockFocus(-1);
  }

  function startWorldScan() {
    stopWorldScan();
    const s = U.sm();
    if (!s || !s.getSettings().autoScan) return;
    worldTimer = setInterval(() => worldStep(1), s.getScanInterval());
  }
  function stopWorldScan() {
    if (worldTimer) { clearInterval(worldTimer); worldTimer = null; }
  }

  function worldStep(delta) {
    if (!worldItems.length) return;
    worldIndex = (worldIndex + delta + worldItems.length) % worldItems.length;
    applyWorldFocus();
    U.speak(worldItems[worldIndex].speech);
    AU.menuMove();
    startWorldScan();
  }

  function worldActivate() {
    AU.resume();
    AU.menuSelect();
    const it = worldItems[worldIndex];
    if (!it) return;

    if (worldPlace === 'spot') {
      if (it.key === 'cast')  { closeWorldScan(); G.startAim(); return; }
      if (it.key === 'troll') { closeWorldScan(); G.chooseTroll(); return; }
      closeWorldScan(); openPause(); return;
    }

    if (worldPlace === 'shop') {
      if (it.key === 'door')   { closeWorldScan(); openDock(); return; }
      if (it.key === 'tackle') { closeWorldScan(); setScreen('tackle'); return; }
      closeWorldScan(); setScreen('keeper'); return;
    }

    if (it.key === 'note') { closeWorldScan(); setScreen('brief'); return; }
    if (it.key === 'shop') { closeWorldScan(); openShop(); return; }
    if (it.key === 'boat') { closeWorldScan(); castOff(); return; }
    closeWorldScan();
    G.quitToMenu();
    setScreen('title');
  }

  function renderWorldLabels() {
    const wrap = $('worldLabels');
    wrap.innerHTML = '';
    worldItems.forEach((it, i) => {
      // An item can live on an existing button instead of getting a floating
      // plate — that is how Pause stays in its usual corner while still
      // taking its turn in the scan.
      if (it.domId) {
        const btn = $(it.domId);
        if (btn) U.addTap(btn, () => { worldIndex = i; applyWorldFocus(); worldActivate(); });
        return;
      }
      const el = document.createElement('div');
      // Some things are better labelled from underneath — a plate over the
      // boat covers the boat, which is the thing you are looking at.
      el.className = 'worldLabel' + (it.below ? ' below' : '') +
                     (i === worldIndex ? ' focused' : '');
      el.dataset.i = String(i);
      el.innerHTML = it.label + (it.sub ? '<span class="sub">' + it.sub + '</span>' : '');
      el.style.pointerEvents = 'auto';
      U.addTap(el, () => { worldIndex = i; applyWorldFocus(); worldActivate(); });
      wrap.appendChild(el);
    });
  }

  function paintWorldFocus() {
    positionWorldLabels();
    placeScanFrame();
    const kids = $('worldLabels').children;
    for (let i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('focused', Number(kids[i].dataset.i) === worldIndex);
    }
    worldItems.forEach((it, i) => {
      if (!it.domId) return;
      const btn = $(it.domId);
      if (btn) btn.classList.toggle('focused', i === worldIndex);
    });
  }

  /**
   * Keep the name plate stuck to the thing it names. Called every frame.
   *
   * Only the highlighted one is shown. A scene hung with captions reads as a
   * diagram rather than a place, and anything that already says what it is —
   * a board painted MAIN MENU — is marked `quiet` and never gets one at all.
   */
  function positionWorldLabels() {
    if (!worldOn) return;
    const pos = G.dockLabelPositions();
    if (!pos) return;
    const kids = $('worldLabels').children;
    for (let k = 0; k < kids.length; k++) {
      const el = kids[k];
      const i = Number(el.dataset.i);
      const item = worldItems[i];
      const p = item && item.sceneIndex !== undefined ? pos[item.sceneIndex] : null;
      if (!p || !p.visible || i !== worldIndex || (item && item.quiet)) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      el.style.left = p.x.toFixed(0) + 'px';
      el.style.top = p.y.toFixed(0) + 'px';
    }
  }

  function paintDockHud() {
    const b = G.missionBrief();
    $('dockMission').textContent = 'Mission ' + b.n + (b.done ? ' — complete' : '');
    $('dockTask').textContent = b.text;
    $('dockGear').innerHTML =
      '<b>' + b.progress + '</b>' +
      '<br>' + b.rod.name + ' &bull; ' + b.bait.name +
      (b.gear && b.gear.length
        ? '<br><span style="opacity:.85">' +
          b.gear.map(g => g.icon + ' ' + g.name).join(' &bull; ') + '</span>'
        : '') +
      '<br><b>$' + b.money + '</b>' +
      (b.hold ? ' <span style="opacity:.75">+ ' + b.hold + ' to sell</span>' : '') +
      (b.done ? '<br><span style="opacity:.8">Head for the tackle shop.</span>' : '') +
      /* What the next job needs, and whether it is already paid for. Said
         here, all trip long, so the money in the tin has an obvious purpose
         rather than being a number that goes up. */
      (b.nextGear
        ? '<br><span style="opacity:.85">Next job needs ' + b.nextGear.name + ' &mdash; $' +
          b.nextGear.cost + (b.nextGear.short ? ' (need $' + b.nextGear.short + ' more)' : ' \u2713') +
          '</span>'
        : '');
    $('dockMoney').textContent = '';
  }

  /* ══════════════════════════════════════════════════════════════════════
     SCREENS
     ══════════════════════════════════════════════════════════════════════ */

  function setScreen(name, opts) {
    opts = opts || {};
    screen = name;
    index = 0;
    const meta = SCREENS[name](opts);

    const panel = $('panel');
    // Dock-side screens are about the scene behind them, so the card moves aside.
    $('overlay').classList.toggle('side', name === 'creel');
    const isCatch = name === 'catchreveal' || name === 'dingusreveal' || name === 'grantreveal';
    panel.classList.toggle('panel-catch', isCatch);
    CARD_STYLES.forEach(s =>
      panel.classList.toggle('cardbg-' + s.id, isCatch && G.getCardStyle() === s.id));

    $('panelArt').innerHTML = meta.art || '';
    $('panelTitle').innerHTML = meta.title || '';
    $('panelSub').innerHTML = meta.sub || '';
    $('panelStats').innerHTML = meta.stats || '';
    /* What the card has to SAY comes first, then what you can do about it.
       Choices always sit at the bottom, under the thing they are answering. */
    const panelEl = $('panel'), menuEl = $('panelMenu'), statsEl = $('panelStats');
    panelEl.insertBefore(statsEl, menuEl);
    $('panelHint').innerHTML = meta.hint ||
      (isOneSwitch() ? '<strong>ENTER</strong> picks the highlighted row'
                     : '<strong>SPACE</strong> to scan &bull; <strong>ENTER</strong> to select');

    items = meta.items || [];
    if (meta.startIndex !== undefined) index = meta.startIndex;
    if (opts.index !== undefined) index = opts.index;
    if (items[index] && items[index].enabled === false) {
      for (let n = 0; n < items.length; n++) {
        const i = (index + n) % items.length;
        if (items[i].enabled !== false) { index = i; break; }
      }
    }

    render();
    showOverlay(true);
    updateFocus();          // and scroll the starting row into view
    if (items[index] && typeof items[index].onFocus === 'function') items[index].onFocus();
    if (meta.announce !== false) {
      U.speak(meta.speech || (stripTags(meta.title) + '. ' + stripTags(meta.sub || '')));
    }
    restartAutoScan();
  }

  function refresh() { setScreen(screen, { index: index, announce: false }); }

  const SCREENS = {

    title: () => ({
      art: '🎣',
      title: "Benny's FishMaster",
      sub: 'Take the boat out, find the fish, bring them back.',
      items: [
        { label: '🚤 Play Game', speech: 'Play Game', action: openDock },
        { label: '⚙️ Settings', speech: 'Settings', action: () => setScreen('settings') },
        { label: '🏠 Exit Game', speech: 'Exit Game', action: goToHub }
      ],
      speech: "Benny's FishMaster. Play Game, Settings, or Exit."
    }),

    /* These rows drive the hub's OWN shared managers rather than keeping a
       second copy of each setting — changing Scan Speed here changes it for
       every game, which is the point. The rule is "no duplicate settings",
       not "no settings screen". */
    settings: () => {
      const v = U.vm(), sm = U.sm();
      const tts = v ? v.getSettings().ttsEnabled : true;
      const voiceName = (v && v.getVoiceDisplayName)
        ? v.getVoiceDisplayName(v.getCurrentVoice()) : 'Default';
      const autoScan = sm ? sm.getSettings().autoScan : false;
      const speed = sm ? sm.getScanInterval() : 2000;
      const sens = (sm && sm.getInputSensitivity) ? sm.getInputSensitivity() : null;
      const theme = THEMES.find(t => t.id === G.getTheme()) || THEMES[0];
      const style = CARD_STYLES.find(x => x.id === G.getCardStyle()) || CARD_STYLES[0];

      return {
        art: '⚙️',
        title: 'Settings',
        items: [
          { label: 'Text to Speech', value: tts ? 'On' : 'Off',
            speech: 'Text to Speech, ' + (tts ? 'On' : 'Off'),
            action: () => {
              if (!v) return;
              v.toggleTTS();
              refresh();
              if (v.getSettings().ttsEnabled) U.speak('Text to speech on');
            } },

          { label: 'Voice', value: voiceName,
            speech: 'Voice, ' + voiceName,
            action: () => { if (v) { v.cycleVoice(); refresh(); U.speak('Voice changed'); } } },

          /* Size limits. On, a fish under the limit goes back and counts for
             nothing; off, everything you land is yours. It is a flavour rule,
             so it is a setting - if putting fish back turns out to be one
             thing too many to keep track of, it comes straight off. */
          { label: 'Size Limits', value: G.keepersOn() ? 'On — small fish go back' : 'Off — keep everything',
            speech: G.keepersOn()
              ? 'Size limits on. Fish under the limit go back in the water.'
              : 'Size limits off. Everything you land is yours.',
            action: () => {
              G.setKeepers(!G.keepersOn());
              refresh();
              U.speak(G.keepersOn()
                ? 'Size limits on. A fish under the limit goes back.'
                : 'Size limits off. You keep everything you land.');
            } },

          /* Auto Scan doubles as the control scheme across the whole hub, so
             the row says which scheme it picks rather than just on or off. */
          { label: 'Auto Scan', value: autoScan ? 'On — One Switch' : 'Off — Two Switches',
            speech: autoScan
              ? 'Auto Scan on. One switch: Enter plays the game.'
              : 'Auto Scan off. Two switches: Space steers left, Enter steers right.',
            action: () => {
              if (!sm) return;
              sm.toggleAutoScan();
              refresh();
              U.speak(sm.getSettings().autoScan
                ? 'Auto scan on. One switch. Enter plays the game.'
                : 'Auto scan off. Two switches. Space is left, Enter is right.');
            } },

          { label: 'Scan Speed', value: (speed / 1000) + 's',
            speech: 'Scan Speed, ' + (speed / 1000) + ' seconds',
            action: () => {
              if (!sm) return;
              sm.cycleScanSpeed();
              refresh();
              U.speak('Scan speed ' + (sm.getScanInterval() / 1000) + ' seconds');
            } },

          /* How long a switch has to be held before it counts. Worth having in
             reach: it is what filters a tremor, and it also decides how quickly
             two deliberate presses can follow each other. */
          { label: 'Input Sensitivity', value: sens === null ? '—' : sens + 'ms',
            enabled: sens !== null,
            speech: sens === null ? 'Input sensitivity unavailable'
                                  : 'Input sensitivity, ' + sens + ' milliseconds',
            action: () => {
              if (!sm || !sm.cycleInputSensitivity) return;
              sm.cycleInputSensitivity();
              refresh();
              U.speak('Input sensitivity ' + sm.getInputSensitivity() + ' milliseconds');
            } },

          { label: 'Direction Help', value: CUE_NAMES[G.getCueLevel()],
            speech: 'Direction Help, ' + CUE_SPEECH[G.getCueLevel()],
            action: () => {
              G.cycleCueLevel();
              refresh();
              // Off drops the voice and the tones but never the fish in the
              // water — they are the only way to see where to go.
              U.speak('Direction help, ' + CUE_SPEECH[G.getCueLevel()] +
                      '. You can always see the fish in the water.');
            } },

          { label: 'Sound Effects', value: AU.isEnabled() ? 'On' : 'Off',
            speech: 'Sound Effects, ' + (AU.isEnabled() ? 'On' : 'Off'),
            action: () => {
              AU.setEnabled(!AU.isEnabled());
              refresh();
              U.speak('Sound effects ' + (AU.isEnabled() ? 'on' : 'off'));
            } },

          { label: 'Colour Profile', value: theme.name,
            speech: 'Colour profile, ' + theme.name,
            action: () => {
              const i = THEMES.findIndex(t => t.id === G.getTheme());
              const next = THEMES[(i + 1) % THEMES.length];
              G.setTheme(next.id);
              refresh();
              U.speak('Colour profile, ' + next.name);
            } },

          { label: 'Catch Card Style', value: style.name,
            speech: 'Catch card style, ' + style.name,
            action: () => {
              const i = CARD_STYLES.findIndex(x => x.id === G.getCardStyle());
              const next = CARD_STYLES[(i + 1) % CARD_STYLES.length];
              G.setCardStyle(next.id);
              refresh();
              U.speak('Catch card style, ' + next.name);
            } },

          { label: 'Reset Progress', value: resetArmed ? 'Sure?' : '',
            speech: resetArmed ? 'Select again to erase all progress' : 'Reset Progress',
            action: () => {
              if (resetArmed && Date.now() - resetArmed < 6000) {
                G.resetProgress();
                resetArmed = 0;
                refresh();
                U.speak('Progress reset');
              } else {
                resetArmed = Date.now();
                refresh();
                U.speak('Select again to erase all progress');
              }
            } },

          { label: '← Back', speech: 'Back',
            action: () => { resetArmed = 0; setScreen('title'); } }
        ],
        speech: 'Settings'
      };
    },



    /* -- The log ------------------------------------------------------------
       Every fish in the lake on one sheet: the ones you have had, with the
       best of them, and the ones you have not, as a grey outline and the water
       they live in. The mission ladder ends; this does not, and it is the
       reason to go back out once it has. */
    creel: () => {
      const sv = G.getSave();
      const log = G.fishLog();
      const got = log.filter(f => f.caught > 0);

      /* One row per species, and every row is a scan stop.
       *
       * It was a wall of little cards: fine to look at, useless to somebody
       * who cannot read them and has no way to put the cursor on one. As rows
       * they take their turn in the scan like everything else in the hub, and
       * landing on one says the whole entry out loud - best fish, how many,
       * and the size limit. Pressing simply says it again, which is what
       * somebody who missed it the first time actually wants.
       */
      const line = (f) => {
        const had = f.caught > 0;
        if (had) {
          return f.name + '. Your best is ' + (f.best ? f.best.length + ' inches, ' +
                 f.best.weight + ' pounds' : 'landed') + '. ' +
                 (f.caught > 1 ? 'You have landed ' + f.caught + '. ' : '') +
                 'Keepers have to be ' + f.keeper + ' inches.';
        }
        return f.name + '. Not caught yet. ' +
               (f.waters.length ? 'Lives in the ' + f.waters.join(' and the ') + '. ' : '') +
               'Keepers have to be ' + f.keeper + ' inches.';
      };

      const rows = log.map(f => {
        const had = f.caught > 0;
        return {
          label: '<img class="logRowArt' + (had ? '' : ' unseen') + '" src="' + f.art +
                 '" alt="" onerror="this.style.display=\'none\'">' +
                 '<span class="logRowName' + (had ? '' : ' unseen') + '">' + f.name + '</span>',
          value: had
            ? (f.best ? f.best.length + '\u2033  ' + f.best.weight + ' lbs' : 'Landed') +
              (f.caught > 1 ? '  \u00b7 ' + f.caught : '')
            : f.keeper + '\u2033+ keeper',
          speech: line(f),
          // Pressing a row repeats it. Nothing to lose your place over.
          action: (function (t) { return function () { U.speak(t); }; })(line(f))
        };
      });
      rows.push({ label: '\u2190 Back', speech: 'Back', action: () => setScreen('keeper') });

      return {
        art: '\ud83c\udfa3',
        title: 'Your Fishing Log',
        sub: got.length + ' of ' + log.length + ' species &nbsp;\u2022&nbsp; ' +
             sv.creel.length + ' fish landed &nbsp;\u2022&nbsp; $' + sv.lifetimeEarned + ' earned all told',
        stats: '',
        items: rows,
        speech: 'Your fishing log. ' + got.length + ' of ' + log.length +
                ' species caught, ' + sv.creel.length + ' fish landed. ' +
                'Scan the list to hear each one.'
      };
    },

    /* ── Talking to the shopkeeper: the catch, the job, and a tip. ─────── */
    keeper: () => {
      const st = G.turnInState();
      const list = [];
      let sub, stats;

      /* The JOB comes first, always.
       *
       * He used to lead with the scales whenever there were fish in the hold,
       * which meant that walking in with a finished job and a full boat got
       * you a card about selling and no mention of the job at all - and then
       * a second visit for the gear, and a third to hand it in. Finishing the
       * job is the thing being played for, so it is the first thing on the
       * card and it is one press: he buys the fish, sells you the gear the
       * next job needs, and takes the job in, in that order. */
      if (st.done) {
        /* Caught the fish? Then the job goes in. Full stop.
         *
         * This card used to hide the hand-in behind being able to afford the
         * NEXT job's gear - a hangover from when the gear was a precondition -
         * so three sunfish and an empty wallet got you a card that would only
         * sell your catch. The gear is a nice-to-have on the way past now: he
         * buys it for you if the money is there, and says so if it is not. */
        const g = st.grantTaken ? null : st.grant;
        const cost = g ? g.cost : 0;
        const after = st.money + st.holdValue;        // what the sale will leave
        const canAffordGear = !g || after >= cost;
        sub = '"Nice work. Let\'s settle up, then."';
        stats = '<div class="needLine">' + st.mission.text + ' &mdash; done.</div>';
        if (st.hold) {
          stats += '<div class="needCount">He\'ll take the <b>' + st.hold +
                   '</b> in the hold for <b>$' + st.holdValue + '</b>.</div>';
        }
        if (g) {
          stats += '<div class="needTip">The next job wants the <b>' + g.name +
                   '</b> &mdash; <b>$' + cost + '</b>' +
                   (canAffordGear
                     ? '. He\'ll put it in the boat.'
                     : ', which is <b>$' + (cost - after) + '</b> more than you\'ll have. ' +
                       'The job still goes in — come back for the gear when you have it.') +
                   '</div>';
        }
        list.push({ label: '\u2705 Hand In the Job', speech: 'Hand in the job',
                    action: doHandIn });
      } else if (st.canTakeGrant) {
        /* No job to hand in yet, but the next one's gear is on the shelf and
           the money is in the tin. He will sell it across the counter rather
           than sending anybody to look for the right wall. */
        sub = '"Saving up for the ' + st.grant.name + '? I have it right here."';
        stats = '<div class="needLine">' + st.grant.name + ' &mdash; <b>$' + st.grant.cost + '</b></div>' +
                '<div class="needTip">' + st.grant.note + '</div>' +
                '<div class="needCount">The next job is built around it.</div>';
        list.push({ label: '&#127907; Buy the ' + st.grant.name + ' — $' + st.grant.cost,
                    speech: 'Buy the ' + st.grant.name + ', ' + st.grant.cost + ' dollars',
                    action: doTakeGrant });
        if (st.hold) {
          list.push({ label: '💰 Sell the Catch — $' + st.holdValue,
                      speech: 'Sell the catch, ' + st.holdValue + ' dollars', action: doSell });
        }
      } else if (st.hold) {
        // No job to hand in, but a full boat: the scales, then.
        sub = '"Great catch! Let\'s have a look at those."';
        stats = '<b>' + st.hold + ' in the hold</b> &mdash; worth <b>$' + st.holdValue + '</b>' +
                '<br><span style="opacity:.8">He is already reaching for the scales.</span>';
        list.push({ label: '💰 Sell the Catch', speech: 'Sell the catch', action: doSell });
      } else {
        // What he needs, then where they are, then the choices — the card
        // reads top to bottom the way he would say it.
        sub = '"This is what I need."';
        stats = '<div class="needLine">' + st.mission.text + '</div>' +
                '<div class="needCount">' + st.progressText + '</div>' +
                '<div class="needTip">"' + st.tip + '"</div>';
        list.push({ label: '👍 Right you are', speech: 'Right you are', action: backToShop });
      }

      list.push({ label: '\ud83d\udcd6 The Fishing Log', speech: 'The fishing log',
                  action: () => setScreen('creel') });
      list.push({ label: '← Back', speech: 'Back', action: backToShop });

      return {
        art: '🧔',
        title: 'The Shopkeeper',
        sub, stats, items: list,
        // Spoken as a sentence — "you have 2 of 3 Sunfish, one more" — rather
        // than reading the card's own shorthand out loud.
        speech: st.done
          ? (function () {
              const g = st.grantTaken ? null : st.grant;
              const after = st.money + st.holdValue;
              if (g && after < g.cost) {
                return 'Nice work, that is the job done. Hand it in and he will buy the fish. ' +
                       'The ' + g.name + ' for the next job is ' + (g.cost - after) +
                       ' dollars more than you will have, so come back for it when you can.';
              }
              return 'Nice work, that is the job done. Hand it in and he will buy the fish' +
                     (g ? ' and put the ' + g.name + ' in the boat for the next one.' : '.');
            })()
          : st.canTakeGrant
          ? ('He has the ' + st.grant.name + ' for ' + st.grant.cost +
             ' dollars, and the next job is built around it.' +
             (st.hold ? ' He will buy your ' + st.hold + ' fish too.' : ''))
          : st.hold
          ? 'Great catch! He will buy those ' + st.hold + ' for ' + st.holdValue + ' dollars.'
          : "Here's what I need. " + st.mission.text + '. ' +
            st.targetSpeech + ' ' + st.tip
      };
    },

    /* ── What the scales said. ──────────────────────────────────────────── */
    /* -- One look in the tacklebox before untying ------------------------
       Never a refusal. It names what is missing, says what it would change,
       and puts the two honest choices side by side: go and buy it, or go
       fishing as you are. */
    gearcheck: () => {
      const b = G.missionBrief();
      const rod = b.wantedRod, bait = b.wantedBait;
      const list = [];
      let stats = '<div class="needLine">' + b.text + '</div>';

      if (rod) {
        stats += '<div class="needTip">&#127907; This job was built for the <b>' + rod.name +
                 '</b>. On the ' + b.rod.name + ' the big ones will mostly shake the hook.' +
                 '</div>';
      }
      if (bait) {
        stats += '<div class="needTip">&#129713; Its lure is the <b>' + bait.name +
                 '</b>. On the ' + b.bait.name + ' the fish it wants come along slower.' +
                 '</div>';
      }
      stats += '<div class="needCount">&#128181; <b>$' + b.money + '</b> in the tin</div>';

      list.push({ label: '\ud83c\udfa3 Go to the Tackle Shop',
                  speech: 'Go to the tackle shop', action: openShop });
      list.push({ label: '\u26f5 Go Fishing Anyway',
                  speech: 'Go fishing anyway', action: goFishingAnyway });
      list.push({ label: '\u2190 Back to the Dock', speech: 'Back to the dock',
                  action: backToDock });

      return {
        art: '\ud83e\uddf0',
        title: 'Before you go',
        sub: rod && bait ? "You're missing the rod and the lure this one wants."
             : rod ? "You're missing the rod this one wants."
             : "You're missing the lure this one wants.",
        stats,
        items: list,
        speech: 'Before you go. ' + b.text + '. ' +
                (rod ? 'This job was built for the ' + rod.name + ', and you have the ' +
                       b.rod.name + '. ' : '') +
                (bait ? 'Its lure is the ' + bait.name + ', and you have the ' +
                        b.bait.name + '. ' : '') +
                'You can go to the tackle shop, or go fishing anyway \u2014 both are fine.'
      };
    },

    sold: () => {
      const r = lastSale || { total: 0, count: 0 };
      const best = r.best;
      return {
        art: '💰',
        title: 'Sold',
        sub: '"' + (best ? 'That ' + best.name + " was a good one." : 'Much obliged.') + '"',
        stats: '<div class="catchStat">' + r.count + ' sold for <b>$' + r.total + '</b></div>' +
               '<div class="catchStat">You now have <b>$' + G.getSave().money + '</b></div>',
        items: [{ label: '👍 Thanks', speech: 'Thanks', action: backToShop }],
        speech: 'Sold. ' + r.count + ' fish for ' + r.total + ' dollars. ' +
                (best ? 'That ' + best.name + ' was a good one. ' : '') +
                'You now have ' + G.getSave().money + ' dollars.'
      };
    },

    /* -- The tackle counter -------------------------------------------------
       Two things live here. The mission GRANT is the ladder: it is handed over
       when the job is done, and money only decides when it appears. The STOCK
       is the shop proper - four lines of gear on the shelf every visit, so
       there is always something to save for even on the eighteen missions that
       carry no grant at all, and somewhere for sturgeon money to go. */
    tackle: () => {
      const st = G.turnInState();
      const stock = G.shopStock();
      const list = [];
      let sub, stats = '';

      // The grant first - it is the reason you came in.
      if (!st.grant) {
        sub = 'On the shelf';
      } else if (st.grantTaken) {
        sub = st.grant.name + ' — already yours.';
        stats += '<div style="opacity:.8;margin-bottom:10px">' + st.grant.note + '</div>';
      } else if (!st.affordable) {
        sub = st.grant.name + ' — <b>$' + st.grant.cost + '</b>';
        stats += '<div class="needNext">&#11088; The next job needs this</div>' +
                 '<div style="margin-bottom:10px">Another <b>$' + st.short +
                 '</b> and it is yours.</div>';
      } else {
        /* The one thing on this wall that is not optional: the next job is
           built around it, and the shopkeeper will sell it to you as part of
           handing the current one in. Said plainly, and marked. */
        sub = st.grant.name + ' — <b>$' + st.grant.cost + '</b>';
        stats += '<div class="needNext">&#11088; The next job needs this</div>' +
                 '<div style="margin-bottom:10px;opacity:.8">' + st.grant.note + '</div>';
        list.push({ label: '&#128722; Buy the ' + st.grant.name + ' — $' + st.grant.cost,
                    speech: 'Buy the ' + st.grant.name + ', ' + st.grant.cost + ' dollars. ' +
                            'The next job needs it.', action: doTakeGrant });
      }

      /* Rods, on the wall, for as long as they are unowned.
       *
       * They used to exist only as a job's hand-over, which meant a rod you
       * did not buy at that exact moment was gone for good - and since the
       * job can now be handed in without it, that would have stranded
       * somebody on the starter rod with money in their pocket. */
      const rod = G.nextRod();
      if (rod) {
        const canAfford = st.money >= rod.cost;
        stats += '<div style="text-align:left;line-height:1.6;margin-bottom:10px">' +
                 '&#127907; <b>' + rod.name + '</b> — $' + rod.cost +
                 (canAfford ? '' : ' <span style="opacity:.6">(need $' +
                                   (rod.cost - st.money) + ' more)</span>') +
                 '<br><span style="opacity:.75;font-size:.92em">' + rod.reachNote + ' ' +
                 rod.description + '</span></div>';
        if (canAfford) {
          list.push({ label: '&#127907; Buy the ' + rod.name + ' — $' + rod.cost,
                      speech: 'Buy the ' + rod.name + ', ' + rod.cost + ' dollars. ' +
                              rod.reachNote,
                      action: () => doBuyRod(rod.id) });
        }
      }

      /* And the lure this job was built around. Same reasoning as the rods:
         it used to exist only as the PREVIOUS job's hand-over, so anybody who
         skipped it was fishing the whole mission on a plain worm with no way
         to put that right. */
      const bait = G.nextBait();
      if (bait) {
        const canAfford = st.money >= bait.cost;
        stats += '<div style="text-align:left;line-height:1.6;margin-bottom:10px">' +
                 '&#129713; <b>' + bait.name + '</b> — $' + bait.cost +
                 (canAfford ? '' : ' <span style="opacity:.6">(need $' +
                                   (bait.cost - st.money) + ' more)</span>') +
                 '<br><span style="opacity:.75;font-size:.92em">This job\'s lure. ' +
                 bait.note + '</span></div>';
        if (canAfford) {
          list.push({ label: '&#129713; Buy the ' + bait.name + ' — $' + bait.cost,
                      speech: 'Buy the ' + bait.name + ', ' + bait.cost + ' dollars. ' +
                              'It is the lure this job wants.',
                      action: () => doBuyBait(bait.id) });
        }
      }

      const tip = G.gearAdvice();
      if (tip) {
        stats += '<div style="text-align:left;line-height:1.5;margin:4px 0 12px;' +
                 'padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.07)">' +
                 '&#128161; ' + tip.text + '</div>';
      }
      stats += '<div style="text-align:left;line-height:1.6">' +
               '&#128181; <b>$' + st.money + '</b> in the tin</div>' +
               '<div style="text-align:left;line-height:1.75;margin-top:8px">';
      stock.forEach(g => {
        if (g.maxed) {
          stats += g.icon + ' <b>' + g.name + '</b> — <span style="opacity:.7">' +
                   g.ownedName + ', the best there is</span><br>';
        } else {
          /* What you already own on this line, said first. The shelf only ever
             showed the NEXT tier up, so the flasher you bought last visit was
             invisible the moment you owned it. */
          stats += g.icon + ' <b>' + g.next.name + '</b> — $' + g.next.cost +
                   (g.affordable ? '' : ' <span style="opacity:.6">(need $' + g.short + ' more)</span>') +
                   '<br><span style="opacity:.75;font-size:.92em">' + g.next.note + '</span>' +
                   (g.ownedName
                     ? '<br><span style="opacity:.75;font-size:.92em">&#10003; You have the <b>' +
                       g.ownedName + '</b></span>'
                     : '') + '<br>';
        }
      });
      stats += '</div>';

      /* Only what you can actually afford becomes a row. A shelf of things you
         cannot buy is just a longer scan to sit through. */
      stock.forEach(g => {
        if (g.maxed || !g.affordable) return;
        list.push({
          label: g.icon + ' Buy ' + g.next.name + ' — $' + g.next.cost,
          speech: 'Buy the ' + g.next.name + ', ' + g.next.cost + ' dollars. ' + g.next.note,
          action: () => doBuy(g.id)
        });
      });

      list.push({ label: '← Back', speech: 'Back', action: backToShop });

      const canBuy = stock.filter(g => !g.maxed && g.affordable).length;
      return {
        art: st.grant && !st.grantTaken
               ? artOrEmoji(st.grant.art, st.grant.kind === 'rod' ? '&#127907;' : '&#129713;')
               : '&#127907;',
        title: 'Tackle',
        sub, stats, items: list,
        speech: 'Tackle. ' + stripTags(sub) + '. You have ' + st.money + ' dollars. ' +
                (tip ? tip.speech + ' ' : '') +
                (canBuy ? 'You can afford ' + canBuy + (canBuy === 1 ? ' thing.' : ' things.')
                        : 'Nothing on the shelf is in reach yet.')
      };
    },

    /* -- What you just bought. --------------------------------------------- */
    bought: () => {
      const b = lastBuy || {};
      const bought = b.name || 'It';
      return {
        art: b.icon || '&#128722;',
        title: b.name ? (b.name + ' — bought') : 'Bought',
        sub: '"Good choice. That is on your boat now."',
        stats: '<div class="catchStat"><b>&#10003; ' + (b.icon || '') + ' ' +
               bought + '</b> is yours' +
               (b.line ? ' — it is your ' + b.line.toLowerCase() : '') + '</div>' +
               '<div class="catchStat">' + (b.note || '') + '</div>' +
               '<div class="catchStat">$' + (b.cost || 0) + ' — you have <b>$' +
               G.getSave().money + '</b> left</div>',
        items: [{ label: '&#128077; Ok', speech: 'Ok', action: () => setScreen('tackle') }],
        speech: 'Bought. The ' + bought + ' is on your boat now. ' + (b.note || '') +
                ' That cost ' + (b.cost || 0) +
                ' dollars. You have ' + G.getSave().money + ' left.'
      };
    },

    /* ── The note, opened up. Everything about the job in one place. ───── */
    brief: () => {
      const b = G.missionBrief();
      const gearArt = (a) => a.src
        ? '<img class="gearArt" src="' + a.src + '" alt="" onerror="this.outerHTML=\'' +
          '<span class=&quot;gearEmoji&quot;>' + a.emoji + '</span>\'">'
        : '<span class="gearEmoji">' + a.emoji + '</span>';

      let stats = '<div class="gearRow">' +
        '<div class="gearCell">' +
          '<img class="gearArt" src="' + b.rodArt + '" alt="" ' +
          'onerror="this.outerHTML=\'<span class=&quot;gearEmoji&quot;>🎣</span>\'">' +
          '<div class="gearName">' + b.rod.name + '</div>' +
          '<div class="gearNote">' + b.rod.reachNote + '</div>' +
        '</div>' +
        '<div class="gearCell">' + gearArt(b.baitArt) +
          '<div class="gearName">' + b.bait.name + '</div>' +
          '<div class="gearNote">Your bait</div>' +
        '</div>' +
      '</div>';

      stats += '<div style="text-align:left;line-height:1.7;margin-top:12px">' +
        '💵 <b>$' + b.money + '</b> in the tin' +
        (b.hold ? '<br>🪣 <b>' + b.hold + '</b> in the hold, worth <b>$' + b.holdValue +
                  '</b> — the shop will buy them' : '') +
        '<br>🐟 ' + b.caught + ' fish landed &bull; $' + b.earned + ' earned all told';
      if (b.grant) {
        stats += '<br>🛒 Next from the shop: <b>' + b.grant.name + '</b> — $' + b.grant.cost +
                 (b.grantTaken ? ' <span style="opacity:.7">(got it)</span>'
                  : b.affordable ? ' <span style="opacity:.7">(you can buy it now)</span>'
                  : ' <span style="opacity:.7">(need $' + b.short + ' more)</span>');
      }
      /* The job was balanced around a rod you have not got. Say so - it is
         the difference between "this is hard" and "this is broken". */
      if (b.wantedRod) {
        stats += '<br>&#9888;&#65039; Built for the <b>' + b.wantedRod.name + '</b>. ' +
                 'You can fish it with the ' + b.rod.name + ', but the big ones will ' +
                 'mostly shake the hook.';
      }
      if (b.wantedBait) {
        stats += '<br>&#9888;&#65039; This job\'s lure is the <b>' + b.wantedBait.name +
                 '</b>. On the ' + b.bait.name + ' the fish it wants come along a good ' +
                 'deal slower.';
      }
      stats += '<br><br><span style="opacity:.85"><i>"' + b.tip + '"</i></span></div>';
      // What would make the next trip go better, in the words of the fish.
      const adv = G.gearAdvice();
      if (adv) {
        stats += '<div style="text-align:left;line-height:1.5;margin-top:10px;' +
                 'padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.07)">' +
                 '&#128161; ' + adv.text + '</div>';
      }

      return {
        art: '📋',
        title: 'Mission ' + b.n,
        sub: '<b>' + b.text + '</b><br>' +
             (b.done ? '<span style="color:var(--good)"><b>Done — take it to the tackle shop.</b></span>'
                     : 'So far: <b>' + b.progress + '</b>'),
        stats,
        /* The gear the ladder needs next, offered from the note itself.
         *
         * The note is where somebody goes to ask "what am I meant to be
         * doing?", and part of the answer was sometimes "buy something you
         * cannot reach from here" - back to the dock, find the shop, scan in.
         * If there is gear outstanding, the way to it is on this card. */
        /* The way to the gear - but ONLY when there is gear to be had.
         *
         * The gear for the next job is handed over when this one is finished,
         * so a row saying "go and get the CastMaster" while the job is still
         * running sends somebody to a shelf that tells them no. The note says
         * what is coming and what it costs either way; the row appears when
         * the man will actually sell it. */
        items: (function () {
          const rows = [];
          if (b.nextGear && b.nextGear.ready) {
            rows.push({
              label: '&#127907; Get the ' + b.nextGear.name + ' — $' + b.nextGear.cost,
              speech: 'Go to the tackle shop for the ' + b.nextGear.name + ', ' +
                      b.nextGear.cost + ' dollars. The next job needs it.',
              action: openShop
            });
          }
          rows.push({ label: '← Back to the Dock', speech: 'Back to the dock', action: backToDock });
          return rows;
        })(),
        // Gear is read out too: someone who cannot see the pictures still hears
        // exactly what they are carrying.
        speech: 'Mission ' + b.n + '. ' + b.text + '. ' +
                (b.done ? 'That is done — take it to the tackle shop.' : b.progress + ' so far.') +
                ' You are carrying the ' + b.rod.name + '. ' + b.rod.reachNote +
                (b.wantedRod ? ' This job was built for the ' + b.wantedRod.name +
                               ', so the big ones will mostly shake the hook.' : '') +
                (b.wantedBait ? ' Its lure is the ' + b.wantedBait.name +
                                ', and without it the fish it wants come slower.' : '') +
                ' Your bait is ' + b.bait.name + '.' +
                ' You have ' + b.money + ' dollars' +
                (b.hold ? ', and ' + b.hold + ' fish in the hold worth ' + b.holdValue + '.' : '.') +
                ' ' + b.tip + (adv ? ' ' + adv.speech : '') +
                (b.nextGear
                  ? ' The next job needs the ' + b.nextGear.name + ', ' + b.nextGear.cost +
                    ' dollars. ' +
                    (b.nextGear.short ? 'You are ' + b.nextGear.short + ' short.'
                                      : 'You can buy it now, at the shop.')
                  : '')
      };
    },

    catchreveal: () => {
      const d = cardData || {};
      const o = d.outcome || {};
      let stats = '';
      if (o.type === 'fish' && o.released) {
        /* Under the limit. Shown as a rule rather than a loss: the size, the
           limit it missed, and no scolding. */
        stats = '<div class="catchStat">' + o.length + ' inches &nbsp;•&nbsp; ' + o.weight + ' lbs</div>' +
                '<div class="releaseBadge">&#8617;&#65039; Too small &mdash; back it goes</div>' +
                '<div class="releaseNote">Keepers must be <b>' + o.keeper + ' inches</b>.' +
                ' Nothing lost &mdash; cast again.</div>';
      } else if (o.type === 'fish') {
        stats = '<div class="catchStat">' + o.length + ' inches &nbsp;•&nbsp; ' + o.weight + ' lbs</div>' +
                '<div class="catchStat">' + o.qualityLabel + ' catch &nbsp;•&nbsp; $' + o.value + '</div>';
        // The best one you have ever had of this fish, said the moment it is.
        if (o.isBest) {
          stats += '<div class="catchNote"><b>&#127942; Your biggest ' + o.name + ' yet' +
                   (o.beat ? ' &mdash; beats ' + o.beat + ' lbs' : '') + '</b></div>';
        }
      } else if (o.type === 'valuable') {
        stats = '<div class="catchStat">Worth $' + o.value + '</div>';
      } else if (o.gearMiss) {
        /* An empty hook, and one line about why. The only place in the game
           where the shop's purpose is obvious, so it says the rod and the fix
           and nothing else. */
        stats = '<div class="releaseBadge">&#127907; Too big for the ' + o.rodName + '</div>' +
                '<div class="releaseNote">The hook came back empty.' +
                (o.betterRod ? ' A <b>' + o.betterRod + '</b> would hold it \u2014 sell a few fish and it is yours.'
                             : '') + '</div>';
      }
      if (d.quip && !o.gearMiss) stats += '<div class="catchQuip">' + d.quip + '</div>';
      /* The job, in the biggest type on the card.
       *
       * "It counted" and "here is where that leaves you" are the two things a
       * player is actually asking at this moment, and they were a line of
       * small grey text under the weight. Now: a badge that says it counted,
       * the count itself large, and a row of pips for reading it without
       * reading it. */
      if (d.justCompleted) {
        stats += '<div class="countBadge done">&#11088; That completes the job!</div>' +
                 '<div class="countBig">' + d.targetText + '</div>' + pipRow(d.pips);
      } else if (d.advanced) {
        stats += '<div class="countBadge">&#9989; That one counts</div>' +
                 '<div class="countBig">' + d.targetText + '</div>' + pipRow(d.pips);
      }
      return {
        art: artOrEmoji(d.art, o.type === 'empty' ? '&#129693;' : d.placeholder),
        title: o.name || 'Something',
        stats,
        items: [{ label: '👍 Ok', speech: 'Ok', action: dismissCatch }],
        speech: catchSpeech(o, d)
      };
    },

    dingusreveal: () => {
      const d = cardData || {};
      const o = d.outcome || {};
      return {
        art: artOrEmoji(d.art, '🐟'),
        title: 'A Legend Surfaces',
        sub: 'The Largemouth Dingus.',
        stats: '<div class="catchStat">' + o.length + ' inches &nbsp;•&nbsp; ' + o.weight + ' lbs</div>' +
               '<div class="catchStat">Worth $' + o.value + '</div>' +
               '<div class="catchQuip">Every rumour in this lake, and it was just a fish.</div>',
        items: [{ label: '🏆 Continue', speech: 'Continue', action: dismissCatch }],
        speech: 'A legend surfaces. Largemouth Dingus! Twelve inches, five pounds, worth nothing at all.'
      };
    },

    /* ── The upgrade, handed over at the shop. ───────────────────────────── */
    grantreveal: () => {
      const g = (lastTurnIn && lastTurnIn.grant) || {};
      return {
        art: artOrEmoji(g.art, g.kind === 'rod' ? '🎣' : '🪱'),
        title: g.name || 'Something new',
        sub: g.kind === 'rod' ? "That's a good haul. Enough for a real rod."
                              : 'Something new for the tacklebox.',
        /* When it comes out of the bag matters as much as what it is.
           Buying a rod and then seeing "Starter Rod" on the HUD for the rest
           of the trip reads as a purchase that did not take - so the card
           says plainly that this one is for the next job. */
        stats: '<div class="catchStat">' + (g.note || '') + '</div>' +
               '<div class="catchQuip">' + (g.description || '') + '</div>' +
               '<div class="catchNote">In the boat for the <b>next job</b> &mdash; ' +
               'this one finishes with what you are carrying.</div>',
        items: [{ label: '👍 Take It', speech: 'Take it', action: backToShop }],
        speech: (g.name || '') + '. ' + (g.note || '') + ' ' + (g.description || '') +
                ' You will be using it on the next job; this one finishes with the gear ' +
                'you are carrying.'
      };
    },

    /* -- Target reached, out on the water ---------------------------------
       The whole point is the choice underneath: carry on fishing here, or run
       it back to the shop and start the next one. Either is fine - you can
       keep fishing a finished mission for as long as you like - so this asks
       rather than deciding. */
    targetmet: () => {
      const m = G.currentMission();
      return {
        art: '&#127942;',
        title: 'Mission Complete!',
        sub: m ? m.text : 'Target reached',
        stats: '<div class="catchStat">That is the job done.</div>' +
               '<div class="catchStat">Turn it in at the tackle shop to start the next one — ' +
               'or stay out and keep fishing.</div>',
        items: [
          { label: '⚓ Back to the Tackle Shop', speech: 'Back to the tackle shop',
            action: headToDock },
          { label: '&#127907; Keep Fishing', speech: 'Keep fishing',
            action: () => { showOverlay(false); G.afterCatchCard(); } }
        ],
        speech: 'Mission complete! ' + (m ? m.text : '') +
                '. Head back to the tackle shop to turn it in, or keep fishing.'
      };
    },

    /* One card for the whole visit: what he paid you, what he sold you, and
       what the next job is. Three cards' worth of reading, on one sheet, in
       the order it happened. */
    missiondone: () => {
      const t = lastTurnIn || {};
      const next = t.next;
      let stats = '';
      if (t.sold) {
        stats += '<div class="catchStat">Sold <b>' + t.sold.count + '</b> for <b>$' +
                 t.sold.total + '</b></div>';
      }
      if (t.bought) {
        stats += '<div class="catchStat">Bought the <b>' + t.bought.name + '</b> &mdash; $' +
                 t.bought.cost + '<br><span style="opacity:.8">' +
                 (t.bought.note || 'It is in the boat.') + '</span></div>';
      }
      /* One job does NOT get its next line printed: the one that hands over
         Vitamin T. What comes after that is the secret, and it is the
         shopkeeper's rumour to tell (secretreveal, one card along) - not a
         to-do list item reading "Catch the Largemouth Dingus". */
      if (next && t.mission && next.n !== t.mission.n && !t.revealsSecret) {
        stats += '<div class="catchNote">Next up: <b>' + next.text + '</b></div>';
      }
      return {
        art: '🏅',
        title: 'Mission ' + (t.mission ? t.mission.n : '') + ' complete',
        sub: t.mission ? t.mission.text : '',
        stats,
        items: [{ label: '▶ Continue', speech: 'Continue',
                  // Straight on to the rumour, when there is one.
                  action: t.revealsSecret ? () => setScreen('secretreveal') : openDock }],
        speech: 'Mission complete.' +
                (t.sold ? ' He paid ' + t.sold.total + ' dollars for the fish.' : '') +
                (t.bought ? ' The ' + t.bought.name + ' is in the boat.' : '') +
                (t.revealsSecret ? '' : (next ? ' Next up, ' + next.text : ''))
      };
    },

    secretreveal: () => ({
      art: '💊',
      title: 'Vitamin T',
      sub: "That's every fish in this lake. Every fish anyone's ever caught here, anyway.",
      stats: '<div class="catchQuip">There’s a rumour about one more.</div>',
      items: [{ label: '🤔 Take it', speech: 'Take it', action: openDock }],
      speech: "That's every fish in this lake. Every fish anyone's ever caught here, anyway. " +
              "There's a rumour about one more."
    }),

    /* The lake does not close. There is no next mission after the Dingus, and
       being parked forever on a job already finished would be a sour way to
       end a fishing game - so the boat stays available, with the best gear and
       the whole lake, and no target to chase. Starting over lives in Settings,
       where it is behind a confirmation and cannot be hit by accident. */
    finale: () => ({
      art: '👑',
      title: 'Congratulations!',
      sub: 'You beat the whole game — every fish in the lake, and the one that was never supposed to be there.',
      stats: '<div class="catchQuip">The Largemouth Dingus. Twelve inches of legend.</div>' +
             '<div class="catchStat">The lake stays open. Take the boat out whenever you like — ' +
             'best rod, best bait, nothing left to prove.</div>',
      items: [
        { label: '🎣 Keep Fishing', speech: 'Keep fishing', action: openDock },
        { label: '🏠 Main Menu', speech: 'Main menu',
          action: () => { G.quitToMenu(); setScreen('title'); } }
      ],
      speech: 'Congratulations! You beat the whole game. Every fish in the lake, and the one ' +
              'that was never supposed to be there. The lake stays open — keep fishing ' +
              'whenever you like, or head to the main menu. You can start over in Settings.'
    }),

    pause: () => ({
      art: '⏸',
      title: 'Paused',
      // Nothing focused to begin with: releasing the switch that paused the
      // game must not instantly pick an option.
      startIndex: -1,
      items: [
        { label: '▶ Continue', speech: 'Continue', action: resumeGame },
        { label: '⚓ Return to the Dock', speech: 'Return to the dock',
          action: () => { pausedWorld = null; headToDock(); } },
        { label: '🏠 Main Menu', speech: 'Main menu',
          action: () => { pausedWorld = null; G.quitToMenu(); setScreen('title'); } },
        { label: '🆘 Help', speech: 'Help', action: () => U.speak('I need help') }
      ],
      speech: 'Paused. Continue, return to the dock, main menu, or help.'
    })
  };

  function artOrEmoji(src, emoji) {
    if (!src) return '<div class="catchArtPlaceholder">' + (emoji || '🐟') + '</div>';
    return '<img class="catchArt" src="' + src + '" alt="" ' +
           'onerror="this.outerHTML=\'<div class=&quot;catchArtPlaceholder&quot;>' +
           (emoji || '🐟') + '</div>\'">';
  }

  /** Filled and empty circles for a job counted in whole fish. */
  function pipRow(p) {
    if (!p || !p.need || p.need > 12) return '';
    let out = '<div class="pipRow" aria-hidden="true">';
    for (let i = 0; i < p.need; i++) {
      out += '<span class="pip' + (i < p.have ? ' full' : '') + '"></span>';
    }
    return out + '</div>';
  }

  function catchSpeech(o, d) {
    const a = /^[aeiou]/i.test(o.name || '') ? 'an' : 'a';
    let s;
    if (o.type === 'fish' && o.released) {
      s = 'Caught ' + a + ' ' + o.name + ', ' + o.length + ' inches. Keepers have to be ' +
          o.keeper + ' inches, so back it goes. Nothing lost.';
    } else if (o.type === 'fish') {
      s = 'Caught ' + a + ' ' + o.name + '! ' + o.length + ' inches, ' + o.weight +
          ' pounds. ' + o.qualityLabel + ' catch, worth ' + o.value + ' dollars.';
    } else if (o.type === 'valuable') {
      s = 'Reeled in ' + a + ' ' + o.name + ', worth ' + o.value + ' dollars.';
    } else if (o.gearMiss) {
      s = 'Something big took it and came off. The hook came back empty \u2014 too much for the ' +
          o.rodName + '.' + (o.betterRod ? ' A ' + o.betterRod + ' would hold it.' : '');
    } else {
      s = 'Just ' + a + ' ' + o.name + '.';
    }
    /* The joke on the card, said out loud.
     *
     * "Someone's having a rough week" is the whole reason a soggy wallet is
     * in this game, and it was print-only - which is to say it did not exist
     * for the player it was written for. */
    /* Not on a gear miss: "the lake fought back with vegetation" is a joke
       about a weed, and this was a fish that got away with your bait. */
    if (d.quip && !o.gearMiss) s += ' ' + d.quip;
    /* Spoken the way somebody would say it - "two of three, one more to go" -
       rather than reading the card's shorthand out. */
    if (d.justCompleted) s += ' That completes the mission!';
    else if (d.advanced) s += ' ' + (d.targetSpoken || d.targetText);
    return s;
  }

  /* ══════════════════════════════════════════════════════════════════════
     FLOW
     ══════════════════════════════════════════════════════════════════════ */

  let lastTurnIn = null;


  /**
   * Untying, with one look in the tacklebox first.
   *
   * Going out for muskellunge on a starter rod and a plain worm is allowed -
   * it always will be - but nobody should find out an hour later that the
   * reason nothing was landing was a lure they could have bought on the way
   * past. So: if the job names gear that has not been bought, say so once,
   * offer the shop, and take "go anyway" for an answer.
   */
  let skipGearCheck = false;

  function castOff() {
    const b = G.missionBrief();
    if (!skipGearCheck && (b.wantedRod || b.wantedBait)) {
      setScreen('gearcheck');
      return;
    }
    skipGearCheck = false;
    stopAutoScan(); clearKeys();
    AU.resume(); AU.startWater(); AU.motorUp();
    // The run has to exist before the overlay comes down: showOverlay() reads
    // `G.run` to decide whether the HUD and side panels are live.
    G.castOff();
    showOverlay(false);
  }

  function goFishingAnyway() {
    skipGearCheck = true;
    castOff();
  }

  let lastSale = null;

  function doSell() {
    lastSale = G.sellCatch();
    AU.menuSelect();
    if (!lastSale) { setScreen('keeper'); return; }
    setScreen('sold');
  }

  /**
   * Sell, buy the next job's gear, hand the job in - one press, one card.
   * See handInJob() in game.js for why these three are a single act.
   */
  function doHandIn() {
    const done = G.handInJob();
    if (!done || !done.result) {
      /* The gear turned out to be dearer than the fish. The sale still
         happened, so show THAT rather than a buzz and a card that looks
         unchanged - being told nothing after a press is the one outcome that
         leaves somebody stuck. */
      if (done && done.sold) { lastSale = done.sold; AU.menuSelect(); setScreen('sold'); return; }
      AU.menuBlocked();
      setScreen('keeper');
      return;
    }
    lastTurnIn = Object.assign({}, done.result, { sold: done.sold, bought: done.grant });
    AU.menuSelect();
    if (done.result.finale) { setScreen('finale'); return; }
    setScreen('missiondone');
  }

  let lastBuy = null;

  /** A lure off the wall. Same card as any other purchase. */
  function doBuyBait(id) {
    const got = G.buyBait(id);
    if (!got) { AU.menuBlocked(); return; }
    lastBuy = got;
    AU.menuSelect();
    setScreen('bought');
  }

  /** A rod off the wall. Same card as any other purchase. */
  function doBuyRod(id) {
    const got = G.buyRod(id);
    if (!got) { AU.menuBlocked(); return; }
    lastBuy = got;
    AU.menuSelect();
    setScreen('bought');
  }

  /** Buy a tier off the shelf and show what it does. */
  function doBuy(id) {
    const got = G.buyStock(id);
    if (!got) { AU.menuBlocked(); return; }
    lastBuy = got;
    AU.menuSelect();
    setScreen('bought');
  }

  function doTakeGrant() {
    const g = G.takeGrant();
    if (!g) { setScreen('tackle'); return; }
    lastTurnIn = { grant: g };
    setScreen('grantreveal');
  }

  function beginCast() {
    showOverlay(false);
    G.startAim();
  }

  /* Dismissing the catch card normally drops you straight back to the water.
     But if THAT fish was the one that finished the job, the game should say so
     while you are still standing there, and ask what you want to do about it -
     rather than leaving you to notice the counter on the note later. */
  function dismissCatch() {
    if (cardData && cardData.justCompleted) {
      const d = cardData;
      cardData = null;                 // so it only ever fires once
      completedCard = d;
      AU.fanfare();
      setScreen('targetmet');
      return;
    }
    showOverlay(false);
    G.afterCatchCard();
  }

  let completedCard = null;

  function headToDock() {
    lastTrip = G.returnToDock();
    AU.stopWater(); AU.stopMotor();
    openDock();
  }

  /** Back out of a card and onto the dock itself. */
  function backToDock() { openDock(); }

  /** After an upgrade card, back to the shop counter it came from. */
  function backToShop() { openShop(); }

  /* What was on screen when the game was paused, so it can be put back. The
     pause overlay tears the world scan down on its way up (any overlay does),
     and without remembering this the player came back to a live game with
     nothing scanning and no way to press anything. */
  let pausedWorld = null;

  function openPause() {
    // Pausing belongs to being out on the water — steering, or stopped at a
    // spot. The dock and the shop have their own way out.
    if (overlayOn || !G.run) return;
    pausedWorld = worldOn ? { place: worldPlace, index: worldIndex } : null;
    G.pause();
    AU.stopReelLoop();
    // setScreen -> showOverlay swallows the still-held switch for us.
    setScreen('pause');
  }

  function resumeGame() {
    clearKeys();
    G.resume();
    if (pausedWorld) {
      const pw = pausedWorld;
      pausedWorld = null;
      enterWorld(pw.place, () => pw.index);   // re-enters and hides the overlay
      return;
    }
    showOverlay(false);
    U.speak('Back to it');
  }

  function goToHub() {
    U.speak('Exiting to hub');
    AU.stopWater(); AU.stopMotor();
    setTimeout(() => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ action: 'focusBackButton' }, '*');
      } else {
        window.location.href = '../../../index.html';
      }
    }, 700);
  }

  /* ══════════════════════════════════════════════════════════════════════
     GAME → UI
     ══════════════════════════════════════════════════════════════════════ */

  function onHud(h) {
    // Free roam has no mission number to show - and 'Mission 0' would be worse
    // than saying nothing at all.
    $('hudMission').textContent = h.free ? 'Free Fishing'
      : h.finale ? 'The Last Fish' : ('Mission ' + h.missionN);
    $('hudTarget').textContent = h.target;
    $('hudTarget').classList.toggle('done', h.targetDone);
    $('hudRod').textContent = h.rodName;
    /* Bought gear, on screen, permanently. Everything in the shop changes a
       number somewhere and nothing else, so a purchase left no trace you
       could point at afterwards - "did that even do anything?" is not a
       question a shop should leave you with. */
    const gear = h.gear || [];
    const gearEl = $('hudGear');
    gearEl.innerHTML = gear.map(g => '<span title="' + g.line + ': ' + g.name + '">' +
                                     g.icon + '</span>').join(' ');
    gearEl.style.display = gear.length ? '' : 'none';
    gearEl.setAttribute('aria-label',
      gear.length ? gear.map(g => g.name).join(', ') : '');
    $('hudMoney').textContent = '$' + h.money;
    $('hudHint').textContent = h.hint || '';
    $('hudHint').style.display = h.hint ? '' : 'none';
  }

  /**
   * What is coming up: a little arrow on the side it is on, with a picture of
   * the fish waiting there.
   *
   * A wash of colour down the edge said "something over there" and nothing
   * else. This says which side, what is in it, and — as you hold the boat over
   * — how close you are to turning in.
   */
  function onSpots(z) {
    paintSpotArrow($('spotLeft'), z.left, z.entering === 'left' ? z.enterFrac : 0);
    paintSpotArrow($('spotRight'), z.right, z.entering === 'right' ? z.enterFrac : 0);
    paintPullIn(z);
    $('steerPip').style.left = (50 + z.lateral * 50) + '%';
    $('steerBar').classList.toggle('on', !overlayOn && !!G.run && G.isSteering());
    paintArmed();
  }

  /* Pressing a fish card sends the boat to those fish. It is the pointer's
     version of holding the helm over, and it is bound once at start-up rather
     than every time the card is repainted. */
  function wireSpotCards() {
    [['spotLeft', 'left'], ['spotRight', 'right']].forEach(([id, side]) => {
      const el = $(id);
      if (!el) return;
      U.addTap(el, () => {
        if (!el.classList.contains('on')) return;
        AU.resume();
        if (G.pullOverTo(side)) { AU.menuSelect(); el.classList.add('going'); }
        else AU.menuBlocked();
      });
    });
  }

  function paintSpotArrow(el, data, enterFrac) {
    if (!data || G.getCueLevel() < 1) { el.classList.remove('on', 'going'); return; }
    if (el.dataset.fish !== String(data.fishId)) {
      el.dataset.fish = String(data.fishId);
      const img = el.querySelector('.spotFish');
      img.onerror = () => { img.style.display = 'none'; };
      img.style.display = '';
      img.src = 'images/fish/' + data.fishId + '.png';
      el.querySelector('.spotName').textContent = data.fishName;
    }
    el.style.setProperty('--spotcol', data.color);
    el.style.setProperty('--enter', enterFrac.toFixed(3));
    el.querySelector('.spotWord').textContent =
      data.inRange ? 'Fish spotted!' : 'Too far out';
    el.classList.add('on');
    el.classList.toggle('reach', data.inRange);
    el.classList.toggle('turning', enterFrac > 0.02);
  }

  /* ── Pulling in to fish ─────────────────────────────────────────
     The boat only stops if you lean toward a shoal and KEEP leaning. That was
     invisible — the boat just stopped one day and started fishing. Now it says
     so while it happens, names what it is stopping for, and ticks faster as
     the hold fills so it can be followed without watching the screen. */
  let pullTick = 0, pullWasOn = false, pullCommitted = false;

  function paintPullIn(z) {
    const el = $('pullIn');
    const on = !!z.entering && z.enterFrac > 0.01;
    if (!on) {
      if (pullWasOn) { el.classList.remove('on', 'almost', 'going'); pullWasOn = false; }
      pullTick = 0; pullCommitted = false;
      return;
    }
    const f = z.enterFrac;
    const who = z.enteringFish;

    if (!pullWasOn) {
      pullWasOn = true;
      pullCommitted = false;
      el.classList.add('on');
      // Reset from any previous run-in, or it opens saying "On our way".
      el.classList.remove('going', 'almost');
      $('pullInText').textContent = 'Pulling in to fish';
      $('pullInWho').textContent = who
        ? (who.name + (who.isTarget ? ' — your fish!' : ''))
        : 'Open water';
      $('pullInHint').textContent = 'Let go to keep going';
      AU.pullOpen();
      U.speak(who ? ('Pulling in for ' + who.name) : 'Pulling in to fish');
    }

    /* Phase two. The window has run out, the choice is made, and the boat is
       running up to the fish. Nothing more is being asked of the player, so
       the prompt stops asking - and above all stops ticking. */
    if (z.committed && !pullCommitted) {
      pullCommitted = true;
      el.classList.add('going');
      $('pullInText').textContent = 'On our way';
      $('pullInHint').textContent = who ? 'Heading for the fish' : 'Coming to a stop';
      AU.pullGo();
    }

    $('pullInBar').firstElementChild.style.width = Math.round(f * 100) + '%';
    el.classList.toggle('almost', f > 0.7);

    if (pullCommitted) { pullTick = 0; return; }

    // A soft pip while the offer stands - four or five in the whole window,
    // rising as it fills, rather than a blip every quarter second.
    pullTick += 1 / 60;
    if (pullTick >= 0.62) { pullTick = 0; AU.pullTick(f); }
  }

  /**
   * Which way the next press will steer.
   *
   * Only worth showing on one switch, where the two directions take turns and
   * the player has to be able to see whose turn it is; on two switches the
   * left switch goes left and there is nothing to say.
   */
  function onSteer() { paintArmed(); }

  function paintArmed() {
    const l = $('steerArrowL'), r = $('steerArrowR');
    if (!l || !r) return;
    const on = !overlayOn && !!G.run && G.isSteering() && isOneSwitch();
    const armed = G.getArmed();
    l.classList.toggle('on', on && armed === 'left');
    r.classList.toggle('on', on && armed === 'right');
  }

  let cueTimer = null, glowTimer = null;

  function onCue() {
    // The banner went with the panels; the edge glow and the spoken line carry
    // this now. Kept as a hook so the rules do not need to know that.
    clearTimeout(cueTimer);
    $('cue').classList.remove('on');
  }

  function clearCue() {
    $('pullIn').classList.remove('on', 'almost', 'going');
    pullWasOn = false; pullCommitted = false;
    $('cue').classList.remove('on');
    $('spotLeft').classList.remove('on');
    $('spotRight').classList.remove('on');
  }

  function onBig(text) {
    const el = $('bigMsg');
    if (!text) { el.classList.remove('on'); el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.textContent = text;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  /** A lamp on a dimmer. Its brightness carries no information and no deadline. */
  function onBiteWash(on) {
    $('biteWash').classList.toggle('on', !!on);
    if (!on) $('biteWash').style.opacity = '';
  }

  /**
   * The aimer.
   *
   * There was a dial for this - a half circle with a needle, down in the
   * corner. It is gone. The rod is in your hands, the dashed line runs out
   * across the water and the arrow sits on the spot the cast will land: the
   * answer is already in the middle of the screen, where the player is
   * looking. A second copy of it in a gauge was one more thing to learn and
   * one more thing to look away for. The audible sweep stays, because that one
   * carries information the picture cannot.
   */
  function onAim(a) {
    if (!a) { lastAim = null; return; }
    if (G.getCueLevel() >= 1 && (!lastAim || Math.abs(lastAim - a.angle) > 0.16)) {
      lastAim = a.angle;
      AU.aimTick(Math.sin(a.angle));
    }
  }

  /** The power meter. Stops dead at full — and casts by itself. */
  function onCharge(c) {
    const el = $('charge');
    if (!c) { el.classList.remove('on'); return; }
    el.classList.add('on');
    $('chargeBar').style.width = c.power.toFixed(0) + '%';
    $('chargeLabel').textContent = c.onShoal
      ? (c.isTarget ? 'ON YOUR FISH — ' + c.distance + ' ft' : 'ON THE ' + c.shoalName.toUpperCase())
      : 'OPEN WATER — ' + c.distance + ' ft';
    el.classList.toggle('good', !!c.onShoal);
    el.classList.toggle('best', !!c.isTarget);
  }

  /** The reel: one bar, filling while held. Nothing to get wrong. */
  function onReel(r) {
    const el = $('reel');
    if (!r) { el.classList.remove('on', 'running', 'warning'); return; }
    el.classList.add('on');
    el.classList.toggle('running', !!r.running);
    el.classList.toggle('warning', !!r.warning);
    el.classList.toggle('holding', !!r.holding && !r.running);
    $('reelProgressBar').style.width = (r.progress * 100).toFixed(1) + '%';
    // Strain only means anything during a run, so the bar only shows then.
    $('reelStrainOuter').style.display = r.running ? '' : 'none';
    $('reelStrainBar').style.width = ((r.strain || 0) * 100).toFixed(0) + '%';
    $('reelPrompt').textContent =
      r.running ? 'LET IT RUN!' :
      r.warning ? 'GET READY…' :
      r.holding ? 'REELING — KEEP HOLDING' : 'PRESS AND HOLD';
  }

  /** The line parted. Said plainly, then straight back to fishing. */
  function onLost(d) {
    onReel(null);
    onBig(null);
    flashScreen('lost');
    U.speak('');
  }

  /** A quick full-screen wash: the bite landing, or the line going. */
  function flashScreen(kind) {
    const el = $('flash');
    el.className = '';
    void el.offsetWidth;
    el.className = 'on ' + (kind || 'bite');
    setTimeout(() => { el.className = ''; }, 620);
  }

  function onCard(d) {
    cardData = d;
    if (d.which === 'lost') { onLost(d); return; }
    if (d.which === 'spot') {
      // Not a card: the man and the boat in front of you are the choices.
      enterWorld('spot', () => 0);
      return;
    }
    setScreen(d.which);
  }


  /* ══════════════════════════════════════════════════════════════════════
     MOUSE AND TOUCH
     The same vocabulary as the switches, so nothing has to be learned twice:
     moving positions things (the boat across the lake, the aimer round the
     arc), a tap is a tap, and holding is holding. Whichever input was used
     last wins, so a switch press takes control straight back from a resting
     mouse — the rule the racer uses.

     Bound to the canvas, not the document, so the on-screen Pause button, the
     dock's name plates and the cards do not double as a steering wheel.
     ══════════════════════════════════════════════════════════════════════ */

  let pointerDownAt = 0;
  let pointerHeld = false;

  function fracFromClientX(clientX) {
    return U.clamp(clientX / (window.innerWidth || 1), 0, 1);
  }

  /**
   * Hovering a thing in the scene focuses it, the same way hovering a menu row
   * does. Without this the only clickable part of the dock was a name plate,
   * and those only appear on the thing already highlighted.
   */
  function pointerPick(e) {
    if (!worldOn) return -1;
    const i = G.pickTarget(e.clientX, e.clientY);
    return i;
  }

  function onWorldPointerMove(e) {
    const i = pointerPick(e);
    if (i < 0) return;
    // Scene target index -> our list index.
    const k = worldItems.findIndex(it => it.sceneIndex === i);
    if (k < 0 || k === worldIndex) return;
    worldIndex = k;
    applyWorldFocus();
    startWorldScan();          // hovering restarts the dwell, like a menu does
  }

  /** Position-only: steering the boat, swinging the aimer. */
  function onPointerMove(e) {
    if (worldOn) { onWorldPointerMove(e); return; }
    if (ctx() !== 'game' || !G.run) return;
    if (keyDown.Space || keyDown.Enter) return;   // a held switch outranks the pointer
    const st = G.state, S = G.S;
    // Sliding while charging still aims it — you can change your mind with
    // the cast half wound up.
    if (st === S.CHARGE && pointerHeld) { G.setAimFrac(fracFromClientX(e.clientX)); return; }
    if (st !== S.STEER && st !== S.AIM) return;
    if (e.cancelable) e.preventDefault();
    AU.resume();
    if (st === S.STEER) G.setLateralTarget(fracFromClientX(e.clientX));
    else G.setAimFrac(fracFromClientX(e.clientX));
  }

  function onPointerDown(e) {
    if (worldOn) {
      // Click the thing itself to choose it.
      const i = pointerPick(e);
      if (i >= 0) {
        const k = worldItems.findIndex(it => it.sceneIndex === i);
        if (k >= 0) {
          if (e.cancelable) e.preventDefault();
          worldIndex = k;
          applyWorldFocus();
          worldActivate();
        }
      }
      return;
    }
    if (ctx() !== 'game' || !G.run) return;
    if (e.cancelable) e.preventDefault();
    AU.resume();
    pointerDownAt = Date.now();
    pointerHeld = true;

    const st = G.state, S = G.S;

    /* Casting by hand is one gesture: press the water where you want it to
       land, hold to push the cast out, let go to throw. Pressing takes the
       spot and starts the charge in the same motion, so there is no separate
       "lock it in" step for someone using a finger. */
    // Held down, it hooks the fish and goes straight on reeling it in.
    if (st === S.HOOKING) { if (G.hookFish()) G.setReelHold(true); return; }
    if (st === S.AIM) {
      G.setAimFrac(fracFromClientX(e.clientX));
      G.beginCharge();
      return;
    }
    if (st === S.CHARGE) { G.setCharging(true); return; }
    if (st === S.REELING) { G.setReelHold(true); return; }
    onPointerMove(e);
  }

  function onPointerUp(e) {
    if (worldOn) return;          // handled on the way down
    if (!pointerHeld) return;
    pointerHeld = false;
    if (ctx() !== 'game' || !G.run) return;
    const dur = Date.now() - pointerDownAt;
    G.setCharging(false);
    G.setReelHold(false);
    // A lifted finger is no longer asking to go anywhere, so the lean - and any
    // pull-over it had started - ends with the touch.
    G.clearPointerSteer();
    // Resolved on release exactly like a switch, so a tap and a hold mean the
    // same things they do on the switch.
    handleGameRelease('Enter', dur, true);
  }

  function onPointerLeave() {
    if (!pointerHeld) return;
    pointerHeld = false;
    G.setCharging(false);
    G.setReelHold(false);
    G.clearPointerSteer();
  }

  /* ══════════════════════════════════════════════════════════════════════
     INPUT
     ══════════════════════════════════════════════════════════════════════ */

  function isSwitchKey(code) {
    return code === 'Space' || code === 'Enter' || code === 'NumpadEnter';
  }
  function normKey(code) { return code === 'NumpadEnter' ? 'Enter' : code; }

  function clearKeys() {
    keyDown.Space = keyDown.Enter = false;
    spent.Space = spent.Enter = false;
    clearTimeout(backHoldTimer); backHoldTimer = null;
    clearInterval(backRepeatTimer); backRepeatTimer = null;
    didBackHold = false;
    pointerHeld = false;
    G.setSteer(0);
    G.setReelHold(false);
    G.setAimSweep(false);
    G.setCharging(false);
  }

  /** Push the current hold state down to whatever the game is doing. */
  function applyHold() {
    if (ctx() !== 'game' || !G.run) return;
    const st = G.state, S = G.S;
    const one = isOneSwitch();

    if (st === S.STEER) {
      if (one) G.setSteer(keyDown.Enter ? (G.getArmed() === 'left' ? -1 : 1) : 0);
      else {
        let d = 0;
        if (keyDown.Space) d -= 1;
        if (keyDown.Enter) d += 1;      // both held cancels out
        G.setSteer(d);
      }
      return;
    }
    /* Casting, in three beats and one sentence: SPACE aims, ENTER takes the
       spot you are aiming at, then ENTER again pushes the cast out and letting
       go throws it. On one switch ENTER does all three, since it is all there
       is. */
    if (st === S.AIM) {
      G.setAimSweep(one ? keyDown.Enter : keyDown.Space);
      return;
    }
    if (st === S.CHARGE) {
      G.setCharging(keyDown.Enter);
      return;
    }
    if (st === S.REELING) { G.setReelHold(keyDown.Enter || (!one && keyDown.Space)); return; }
    /* Line out with nothing on it: holding winds it back toward the boat, and
       letting go stops it there. The same hold as playing a fish, because it
       is the same handle. */
    if (st === S.WAITING) { G.setReelHold(keyDown.Enter || (!one && keyDown.Space)); return; }
  }

  function onKeyDown(e) {
    if (e.code === 'Escape') { openPause(); return; }
    if (!isSwitchKey(e.code)) return;
    e.preventDefault();
    const k = normKey(e.code);
    if (ignoreUntilRelease[k]) return;
    if (keyDown[k]) return;              // ignore browser auto-repeat
    keyDown[k] = true;
    keyDownAt[k] = Date.now();
    spent[k] = false;
    AU.resume();

    if (ctx() === 'world') return;      // resolved on release

    if (ctx() === 'menu') {
      // Hold Space in a menu to scan backwards.
      if (k === 'Space' && !backHoldTimer && !backRepeatTimer) {
        didBackHold = false;
        backHoldTimer = setTimeout(() => {
          backHoldTimer = null;
          didBackHold = true;
          stopAutoScan();
          step(-1);
          const s = U.sm();
          backRepeatTimer = setInterval(() => step(-1), s ? s.getScanInterval() : SCAN_BACK_REPEAT);
        }, SCAN_BACK_HOLD);
      }
      return;
    }
    applyHold();
    handleGamePress(k);
  }

  /**
   * A press in play that must happen on the way DOWN.
   *
   * Everything else in the game is resolved on release, because a tap and a
   * hold mean different things. These two cannot be: hooking a fish and
   * casting are the moments where waiting for the switch to come back up
   * either misses the window or, worse, needs a short tap to work at all -
   * and a short tap is exactly what this game may never ask for.
   */
  function handleGamePress(k) {
    if (ctx() !== 'game' || !G.run) return;
    const st = G.state, S = G.S;

    /* Fish on: the press hooks it. Holding the switch down through the whole
       take used to hook nothing until you let go, by which time it was gone.

       Then applyHold AGAIN, because the state changed underneath it: the first
       call ran while this was still a take, and reeling is a hold. One press
       that hooks the fish and then does nothing with the switch still down is
       two presses' work, and the second one is the one nobody should have to
       make. */
    if (st === S.HOOKING) { if (G.hookFish()) applyHold(); return; }

    /* Aiming: ENTER goes straight onto the meter and starts pushing the cast
       out - there is no "lock it in" step to tap through any more. Letting go
       throws it, and a full meter throws by itself, so the whole cast is one
       press of one switch, held for as long as you like.

       One switch is left alone: ENTER is the only control there, so it still
       has to sweep the aimer first and take the aim when it comes up. */
    if (st === S.AIM && k === 'Enter' && !isOneSwitch()) { G.beginCharge(); return; }

  }

  function onKeyUp(e) {
    if (!isSwitchKey(e.code)) return;
    e.preventDefault();
    const k = normKey(e.code);
    if (ignoreUntilRelease[k]) { ignoreUntilRelease[k] = false; return; }
    if (!keyDown[k]) return;
    const dur = Date.now() - keyDownAt[k];
    keyDown[k] = false;

    if (ctx() === 'world') {
      // Two switches: Space steps, Enter picks. One switch: auto-scan does the
      // stepping and the single press picks, exactly as in a menu.
      if (k === 'Space' && !isOneSwitch()) worldStep(1);
      else worldActivate();
      return;
    }

    if (ctx() === 'menu') {
      if (k === 'Space') {
        clearTimeout(backHoldTimer); backHoldTimer = null;
        clearInterval(backRepeatTimer); backRepeatTimer = null;
        if (didBackHold) { didBackHold = false; restartAutoScan(); return; }
        step(1);
      } else {
        activate();
      }
      return;
    }

    applyHold();
    if (spent[k]) { spent[k] = false; return; }
    handleGameRelease(k, dur);
  }

  /**
   * A press in play, resolved on release. A tap and a hold mean different
   * things, and which one it was is only knowable once the switch comes up.
   */
  function handleGameRelease(k, dur, fromPointer) {
    const st = G.state, S = G.S;
    const tap = dur < TAP_MAX_MS;

    // Only a fallback: the press already hooked it (handleGamePress). This
    // catches a take that landed while no press of ours was on record.
    if (st === S.HOOKING) { if (G.hookFish()) applyHold(); return; }
    if (st === S.AIM) {
      /* Only one switch ever gets here: on two, ENTER started the meter on
         the way down (handleGamePress) and the state is already CHARGE. On
         one, ENTER is the aimer, so taking the aim is what letting go means.
         Space never locks anything in - it only ever sweeps. */
      if (k === 'Enter' && isOneSwitch()) G.lockAim();
      return;
    }
    if (st === S.CHARGE) {
      // Letting go throws it — a full meter throws by itself.
      if (k === 'Enter' || fromPointer) G.releaseCast();
      return;
    }
    if (st === S.STEER) {
      /* One switch: EVERY release arms the other way, so pressing again
         steers back - left, right, left, right - exactly as Race Tracks does
         it. It used to need a quick tap to swap sides, which meant a player
         who only holds could steer one way and then never the other.

         A mouse or a finger is already pointing at where it wants to go, so
         there is nothing to arm and a release there means nothing. */
      if (isOneSwitch() && !fromPointer) G.flipArmed();
      return;
    }
  }

  /**
   * The shared scan-manager swallows key-ups that were too short to count as a
   * deliberate press. Without this the game would never see the release, so
   * treat a cancelled press as a full release — and still perform the step or
   * select it would have.
   */
  function onInputCancelled(e) {
    const wasBackScanning = !!backRepeatTimer;
    clearTimeout(backHoldTimer); backHoldTimer = null;
    clearInterval(backRepeatTimer); backRepeatTimer = null;
    didBackHold = false;
    const wasDown = { Space: keyDown.Space, Enter: keyDown.Enter };
    keyDown.Space = keyDown.Enter = false;

    const k = e && e.detail ? normKey(e.detail.code) : null;
    if (ctx() === 'menu') {
      if (e && e.detail && e.detail.reason === 'too-short' && !wasBackScanning) {
        if (k === 'Space') step(1);
        else if (k === 'Enter') activate();
      }
      return;
    }
    applyHold();
    // In play a too-short press is exactly a tap, which is a real gesture here.
    if (k && wasDown[k] && !spent[k]) handleGameRelease(k, 0);
    spent.Space = spent.Enter = false;
  }

  /* ══════════════════════════════════════════════════════════════════════
     FISHING BY HAND
     The same three beats the switches have — aim, take the spot, push the cast
     out — as buttons, plus hooking and reeling. Only the beat you are on is
     ever shown, so there is no row of controls to decode.
     ══════════════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════════════
     THE SCAN FRAME
     One marker for the whole game. It goes round a 3D object by projecting
     that object's bounds to the screen, and round a button by asking the
     button where it is — so a scan step from the boat to the Pause button
     moves the same marker instead of swapping between two different effects.
     ══════════════════════════════════════════════════════════════════════ */

  function hideScanFrame() { $('scanFrame').classList.remove('on'); }

  /** Put the frame on the focused thing, whatever kind of thing it is. */
  function placeScanFrame() {
    const el = $('scanFrame');
    if (!worldOn) { el.classList.remove('on'); return; }
    const it = worldItems[worldIndex];
    if (!it) { el.classList.remove('on'); return; }

    let r = null;
    if (it.sceneIndex !== undefined) {
      r = G.focusScreenRect();
    } else if (it.domId) {
      const btn = $(it.domId);
      // A hidden button has a zero-size rect, which would leave the frame
      // collapsed in the corner rather than simply absent.
      if (btn && btn.offsetParent !== null) {
        const b = btn.getBoundingClientRect();
        if (b.width > 1 && b.height > 1) r = { x: b.left, y: b.top, w: b.width, h: b.height };
      }
    }
    if (!r) { el.classList.remove('on'); return; }

    // A little breathing room so the brackets sit off the thing, not on it.
    const PAD = 10;
    el.style.left   = (r.x - PAD) + 'px';
    el.style.top    = (r.y - PAD) + 'px';
    el.style.width  = (r.w + PAD * 2) + 'px';
    el.style.height = (r.h + PAD * 2) + 'px';
    el.classList.add('on');
  }

  const TC = ['tcAimL', 'tcAimR', 'tcCast', 'tcHook', 'tcReel', 'tcReelIn', 'tcTroll'];

  function wireTouchControls() {
    const press = (id, down, up) => {
      const el = $(id);
      if (!el) return;
      const start = (e) => {
        if (e.cancelable) e.preventDefault();
        el.classList.add('held');
        AU.resume();
        down();
      };
      const end = (e) => {
        if (!el.classList.contains('held')) return;
        if (e && e.cancelable) e.preventDefault();
        el.classList.remove('held');
        if (up) up();
      };
      el.addEventListener('pointerdown', start, { passive: false });
      el.addEventListener('pointerup', end, { passive: false });
      el.addEventListener('pointerleave', end, { passive: false });
      el.addEventListener('pointercancel', end, { passive: false });
    };

    // Aim: hold an arrow to swing the rod that way.
    press('tcAimL', () => G.setAimSweep(true, -1), () => G.setAimSweep(false));
    press('tcAimR', () => G.setAimSweep(true, 1), () => G.setAimSweep(false));
    /* One button for the whole cast, in both beats: pressing it while aiming
       takes the aim and starts the meter, pressing it on the meter keeps
       pushing, and letting go throws it. */
    press('tcCast', () => G.beginCharge(), () => G.releaseCast());
    press('tcHook', () => {}, () => G.hookFish());
    press('tcReel', () => G.setReelHold(true), () => G.setReelHold(false));
    // Nothing on the end of it: hold to wind it back toward the boat.
    press('tcReelIn', () => G.setReelHold(true), () => G.setReelHold(false));
    press('tcTroll', () => {}, () => { G.chooseTroll(); });
  }

  /** Show only the buttons that mean something right now. */
  function syncTouchControls() {
    const on = {};
    // At a spot the world scan owns tcTroll (it is a scan stop there), but it
    // still has to be VISIBLE, so the spot state is allowed through.
    if (!overlayOn && G.run && (!worldOn || G.state === G.S.SPOT)) {
      const st = G.state, S = G.S;
      if (st === S.SPOT) { on.tcTroll = true; }
      else if (st === S.AIM) { on.tcAimL = on.tcAimR = on.tcCast = on.tcTroll = true; }
      else if (st === S.CHARGE) { on.tcCast = true; }
      else if (st === S.HOOKING) { on.tcHook = true; }
      else if (st === S.REELING) { on.tcReel = true; }
      else if (st === S.WAITING) { on.tcReelIn = on.tcTroll = true; }
    }
    for (const id of TC) {
      const el = $(id);
      if (!el) continue;
      const want = !!on[id];
      if (el.classList.contains('on') !== want) el.classList.toggle('on', want);
      if (!want) el.classList.remove('held');
    }
  }

  /* Per frame: keep the dock's name plates on their objects, and keep the
     fishing buttons matched to whichever beat the player is on. */
  function tick() {
    /* Holding a switch when the fish takes.
     *
     * A press hooks it (handleGamePress), but somebody who was already
     * holding the switch down when the take landed never generates one - so
     * the hold itself hooks the fish the moment there is a fish to hook.
     * There is no reason to ever NOT hook a take, so this cannot cost
     * anybody anything. */
    if (ctx() === 'game' && G.run && G.state === G.S.HOOKING &&
        (keyDown.Space || keyDown.Enter || pointerHeld)) {
      // And the hold carries straight on into the reel, as above.
      if (G.hookFish()) { applyHold(); if (pointerHeld) G.setReelHold(true); }
    }
    positionWorldLabels();
    // The frame has to be re-placed every frame, not just on a scan step: the
    // boat bobs at its mooring and the camera drifts, and a marker that stays
    // where the object used to be is worse than none.
    placeScanFrame();
    syncTouchControls();
  }

  /* ══════════════════════════════════════════════════════════════════════
     BOOT
     ══════════════════════════════════════════════════════════════════════ */

  function init() {
    G.callbacks.onHud = onHud;
    G.callbacks.onSpots = onSpots;
    G.callbacks.onSteer = onSteer;
    G.callbacks.onCue = onCue;
    G.callbacks.onBig = onBig;
    G.callbacks.onBiteWash = onBiteWash;
    G.callbacks.onAim = onAim;
    G.callbacks.onCharge = onCharge;
    G.callbacks.onReel = onReel;
    G.callbacks.onCard = onCard;
    G.callbacks.onFlash = flashScreen;

    const surface = $('canvasWrap');
    surface.addEventListener('pointermove', onPointerMove, { passive: false });
    surface.addEventListener('pointerdown', onPointerDown, { passive: false });
    surface.addEventListener('pointerup', onPointerUp, { passive: false });
    surface.addEventListener('pointercancel', onPointerLeave, { passive: false });
    surface.addEventListener('pointerleave', onPointerLeave, { passive: false });

    wireTouchControls();
    wireSpotCards();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('narbe-input-cancelled', onInputCancelled);
    window.addEventListener('blur', clearKeys);

    U.addTap($('pauseBtn'), () => openPause());

    const s = U.sm();
    if (s && s.subscribe) s.subscribe(() => {
      restartAutoScan();
      if (worldOn) startWorldScan();
    });

    setScreen('title');
    setTimeout(() => { if (screen === 'title') speakItem(); }, 900);
  }

  return { init, tick, setScreen, openPause, goToHub,
           __input: { onKeyDown, onKeyUp, handleGameRelease, isOneSwitch, TAP_MAX_MS } };
})();
