/**
 * Benny's Fish Mystery — menus, switch input, HUD.
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

  /**
   * A card's picture: a painted icon rather than a system emoji.
   *
   * `fb` is the glyph that was there before and stays as the fallback, so a
   * missing or unrendered file leaves the card exactly as it used to be
   * instead of leaving it blank.
   */
  function icon(name, fb, cls) {
    return imgFb('images/icons/' + name + '.png', cls, fb);
  }

  /**
   * An image with an HTML fallback for when the file is missing.
   *
   * The fallback travels in a data attribute, quotes escaped, and one fixed
   * onerror swaps it in. It used to be spliced straight into the onerror
   * string - and the first fallback containing an SVG with double quotes in
   * it ended the attribute early and threw "Invalid or unexpected token".
   */
  function imgFb(src, cls, fbHtml) {
    return '<img src="' + src + '" alt=""' +
           (cls ? ' class="' + cls + '"' : '') +
           ' data-fb="' + String(fbHtml || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;') +
           '" onerror="this.outerHTML=this.dataset.fb||\'\'">';
  }

  /**
   * The keeper's own portrait, not a stand-in.
   *
   * Same file the billboard behind the counter uses — cropped from the same
   * full-length painting — so the person on the card is unmistakably the
   * person you are stood in front of.
   */
  /**
   * An inline painted icon, for use inside a label or a stat line.
   *
   * Same files as icon() but sized to sit on a line of text rather than to
   * head a card. No fallback glyph: inline, a missing image simply takes no
   * space, whereas a stray emoji in the middle of a sentence is worse than
   * nothing.
   */
  /** A magnet's painting, with an icon behind it if it has not been drawn. */
  function toolIc(id) {
    const src = G.toolArtFor ? G.toolArtFor(id) : '';
    return src
      ? '<img class="hudKitArt" src="' + src + '" alt="" ' +
        'onerror="this.outerHTML=this.dataset.fb||&quot;&quot;" ' +
        'data-fb="' + ic('anchor').replace(/"/g, '&quot;') + '">'
      : ic('anchor');
  }

  function ic(name) {
    return '<img class="inlineIcon" src="images/icons/' + name + '.png" alt="" ' +
           'onerror="this.style.display=\'none\'">';
  }

  /**
   * Name the dock you are standing on.
   *
   * Reads content/zones.json through RT.content rather than hardcoding, so the
   * six zones name themselves and renaming one in the story editor renames it
   * here too. Falls back to Zone 1 while zone travel does not exist yet, and
   * degrades silently if the content file has not loaded — a dock with no
   * caption is better than a dock with a thrown exception.
   */
  function setDockPlace(zoneN) {
    const zEl = $('dockZone'), pEl = $('dockPlace');
    if (!zEl || !pEl) return;
    const L = RT.content && RT.content.lake;
    zEl.textContent = (L && L.name) || 'Whispering Lake';
    /* It was Walt's Bait & Tackle when there were boats on this lake. The
       fishermen went when the trouble started, and what is left is a man with
       a survey tank, a logbook and a tagging tool - so the sign over the door
       is the research station's now, and the tackle is a sideline. */
    pEl.textContent = 'Whispering Lake Research \u0026 Tackle';
  }

  /** The game's own artwork for a treasure item, inline in a sentence. */
  function itemIc(id) { return RT.icons.item(id); }

  /**
   * A fuel or hull meter: a bar, the word, and the price to put it right.
   *
   * `frac` is how FULL it is (1 = nothing needed), so wear has to be passed in
   * as 1 - wear. Three redundant channels — length, word, colour — because a
   * length alone is colour-and-shape only, and this game labels everything.
   */
  function meter(iconName, label, frac, word, price) {
    frac = Math.max(0, Math.min(1, frac));
    const band = frac > 0.66 ? 'full' : frac > 0.33 ? 'half'
               : frac > 0.08 ? 'low' : 'empty';
    return '<div class="meterRow">' +
             '<span class="meterIcon">' + ic(iconName) + '</span>' +
             '<div class="meter ' + band + '" role="img" aria-label="' +
               label + ': ' + word + ', ' + Math.round(frac * 100) + ' per cent' +
               (price > 0 ? ', ' + price + ' dollars to put right' : '') + '">' +
               '<div class="meterFill" style="width:' + (frac * 100).toFixed(1) + '%"></div>' +
               '<span class="meterText">' + label + ' &middot; ' + word +
                 (price > 0 ? '<span class="meterPrice">$' + price + '</span>' : '') +
               '</span>' +
             '</div>' +
           '</div>';
  }

  /* Which painted icon stands for each line of shop gear. */
  const GEAR_ICON = {
    finder: 'finder', line: 'spool', alarm: 'alarm', cooler: 'cooler'
  };

  function keeperArt(fb) {
    const id = 'walt';
    return '<img src="images/npc/' + id + '.png" alt="" data-fb="' +
           (fb || '').replace(/"/g, '&quot;') +
           '" onerror="this.outerHTML=this.dataset.fb||\'\'">';
  }

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
  /* The catch card has one look. There were two, and a settings row to swap
     between them - a choice nobody needed, in a list that somebody scanning
     with two switches has to walk past every time. */
  const CARD_STYLE = 'plaque';

  /* ── State ────────────────────────────────────────────────────────────── */

  let screen = 'title';
  let items = [];
  let index = 0;
  let layout = 'list';        // 'grid' turns the menu into a card counter
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
    if (mapOn) return 'map';
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
    /* THE GAUGES COME AND GO WITH THE HUD. They live at the bottom of the
       screen now rather than in the corner with the rest of it - Walt's line
       about the hull bar says "down at the bottom of your screen" - which
       puts them outside #hud, so they have to be shown and hidden here or
       they would sit over the dock and over every card. */
    if ($('hudBoat')) $('hudBoat').classList.toggle('off', !playing);
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

  /**
   * Make the card fit the screen.
   *
   * Called after every render, because whether a card fits depends on the
   * rows it has and the screen it is on - neither of which is known when it
   * is written. Three steps, each taken only if the last was not enough:
   * columns (done in render), then `tight`, then scale.
   *
   * The alternative is a scrollbar, and a player with two switches cannot
   * work one: everything a card offers has to BE on the card.
   */
  function fitPanel() {
    const panel = $('panel');
    if (!panel) return;
    panel.classList.remove('tight');
    panel.style.transform = '';
    panel.style.marginBottom = '';
    /* The room a card actually has: the overlay's inside, not the window.
       The overlay is padded, and fitting the card to the window left it over
       by exactly that padding. */
    const ov = $('overlay');
    /* The room a card actually has is the overlay's INSIDE - it is padded by
       twenty either side, and fitting the card to the window left it over by
       exactly that. clientHeight includes the padding, so it comes off. */
    let room = (window.innerHeight || 720) - 52;
    if (ov && typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(ov);
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      room = ov.clientHeight - pad - 10;
    }
    let h = panel.getBoundingClientRect().height;
    if (h <= room) return;
    panel.classList.add('tight');
    h = panel.getBoundingClientRect().height;
    if (h <= room) return;
    /* Still too tall - the mission log with thirty jobs in it. Scale the
       whole card rather than hide any of it, and never below a size that can
       still be read across a room.

       A transform does not change the space the card TAKES UP, only how it is
       drawn - so the page around it still scrolled by the difference. The
       margin gives that space back. */
    let k = Math.max(0.62, room / h);
    panel.style.transformOrigin = 'top center';
    const apply = () => {
      panel.style.transform = 'scale(' + k.toFixed(3) + ')';
      panel.style.marginBottom = Math.round(-h * (1 - k)) + 'px';
    };
    apply();
    /* And check the answer. The card sits inside a padded overlay, so fitting
       the card to the window still left the page a little over - the padding
       is not in the number. Rather than guess at it, measure what actually
       overflows and take that off, up to three times. */
    for (let pass = 0; pass < 4 && ov && ov.scrollHeight > ov.clientHeight + 1; pass++) {
      const over = ov.scrollHeight - ov.clientHeight;
      k = Math.max(0.62, k * (1 - Math.min(0.25, over / Math.max(1, ov.clientHeight))));
      apply();
    }
  }

  function render() {
    const menu = $('panelMenu');
    menu.innerHTML = '';
    menu.classList.toggle('grid', layout === 'grid');
    /* Two columns once a list is long enough to run off the bottom of the
       card. Scrolling is not something two switches do, so everything a
       screen offers has to BE on the screen; the scan reads columns in the
       same order it reads rows. */
    menu.classList.toggle('cols', layout !== 'grid' && items.length >= 8);
    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'menuItem';
      if (it.enabled === false) el.classList.add('locked');
      if (i === index) el.classList.add('focused');

      /* A `card` item is a tile: picture, name, price, one line of what it
         does. Anything without one stays a plain row, so the three-choice
         screens are untouched. */
      if (it.card) {
        el.classList.add('card');
        if (it.card.owned) el.classList.add('owned');
        if (it.card.wide) el.classList.add('wide');
        el.innerHTML =
          (it.card.icon ? '<span class="cardIcon">' + it.card.icon + '</span>' : '') +
          '<span class="cardName">' + it.card.title + '</span>' +
          (it.card.price !== undefined
            ? '<span class="cardPrice">' + it.card.price + '</span>' : '') +
          (it.card.note ? '<span class="cardNote">' + it.card.note + '</span>' : '');
        U.addTap(el, () => {
          if (it.enabled === false) { AU.menuBlocked(); return; }
          index = i; updateFocus(); activate();
        });
        el.addEventListener('mouseenter', () => {
          if (it.enabled === false || index === i) return;
          index = i; updateFocus(); restartAutoScan();
        });
        menu.appendChild(el);
        return;
      }

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
    /* NOTHING SELECTED YET. A conversation card opens on -1 so that the
       first press has to be a step, and a step reads the row out - which is
       the whole reason for it. Nothing below here applies until then. */
    if (index < 0) return;
    /* Keep the scan visible. The tackle counter is long enough to scroll now
       that it has a shelf on it, and a highlighted row somewhere below the
       fold is the same as no highlight at all to whoever is watching. */
    if (els[index] && els[index].scrollIntoView) {
      els[index].scrollIntoView({ block: 'nearest', behavior: smoothOk() ? 'smooth' : 'auto' });
    }
    /* The ends of a long card. Landing on the first row shows the title and
       the summary above it, and on the last row the foot of the card - both
       of which are otherwise unreachable to somebody who scans and cannot
       drag a scrollbar. */
    const ov = $('overlay');
    if (ov && ov.scrollHeight > ov.clientHeight + 4) {
      if (index === 0) ov.scrollTo({ top: 0, behavior: smoothOk() ? 'smooth' : 'auto' });
      else if (index === els.length - 1)
        ov.scrollTo({ top: ov.scrollHeight, behavior: smoothOk() ? 'smooth' : 'auto' });
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
      : stripTags(it.label) + (it.value !== undefined ? ', ' + it.value : ''), it.speechCue);
  }

  /* The last thing a card announced, so it can be said again. Which cards
     open with nothing selected is meta.listenFirst - see setScreen(). */
  let lastSaid = null;

  /** Say the card's opening line again, exactly as it was said. */
  /**
   * One of Walt's lines, by its id.
   *
   * Eight of his lines used to be quoted strings in this file, which meant
   * they had no id - and a line with no id can never be a recording, only
   * ever the system voice reading a literal. They live in the script now,
   * with the rest of him. The literal stays as a fallback so a line removed
   * from the script cannot leave a blank card.
   */
  function waltSays(cue, fallback) {
    const text = (RT.quests && RT.quests.line && RT.quests.line(cue)) || '';
    return { text: text || fallback, cue: text ? cue : null };
  }

  /* ── THE LAST TWO BEATS, PLAYED OUT ──────────────────────────────────
     A sonar reading at a hundred feet, and a sturgeon surfacing with a bell
     in his mouth. Both used to be a press and a sentence; both are scenes
     now, scripted in game.js and played here.

     The lines are the PLAYER's - the system voice, which is the voice of
     everything else that happens on the water - because the person in the
     boat is the person watching it happen. Walt gets it on the radio, or when
     they come home and tell him.

     The card comes off the screen first so there is nothing to press through
     it, and the trip picks up again when the last line is done. */
  function playScene(scene, done) {
    if (!scene) { if (done) done(); return; }
    showOverlay(false);
    const items = (scene.lines || []).map(function (t) { return { text: t }; });
    /* His own recording, over the shop radio - his brief says that is where
       he is sat, listening to the sonar chimes come through it. */
    /* However many he has: the sonar beat is two, one after the other. */
    [].concat(scene.radio || []).forEach(function (cue) {
      const w = waltSays(cue, '');
      if (w.text) items.push({ cue: w.cue, text: w.text });
    });
    const stop = scene.sonar ? sonarReading(items.length) : null;
    /* A SOUND AGAINST ONE OF THE LINES. The bell is rung on the fourth beat
       of its scene - "so you ring it, twice, out over the water" - and a
       sentence about ringing a bell with no bell in it is a description of a
       game rather than a game. game.js says which line; here it is timed to
       land with it rather than before or after. */
    if (scene.sfxAt !== undefined && scene.sfx) {
      const wait = items.slice(0, scene.sfxAt)
        .reduce(function (t, it) { return t + 900 + String(it.text || '').length * 55; }, 300);
      setTimeout(function () { if (AU[scene.sfx]) AU[scene.sfx](); }, wait);
    }
    U.speakSeq(items, null, function () {
      if (stop) stop();
      if (done) done();
    });
    lastSaid = { seq: items, tail: null };
  }

  /**
   * The reading itself, on the screen, for as long as the scene runs.
   *
   * Asked for: "it should show us getting some kind of sonar reading on our
   * screen (just for a few seconds) and then complete the mission." A sweep
   * going round, the depth ticking down the side, and a shadow that comes up
   * through the rings until it is under the boat.
   *
   * Returns the thing that takes it away again.
   */
  function sonarReading(lines) {
    const box = $('sonar'), read = $('sonarDepth');
    if (!box) return function () {};
    box.hidden = false;
    box.classList.remove('rising');
    /* AND IT MAKES A SOUND. The whole job is "let the music play into the
       water" and it used to play in silence. */
    AU.startSonar();
    let answered = false;
    /* Roughly as long as the lines take to say - speakSeq paces itself off
       their length, so this is the same sum it uses. */
    const span = Math.max(4000, lines * 4200);
    const from = 120, t0 = Date.now();
    let tick = setInterval(function () {
      const k = Math.min(1, (Date.now() - t0) / span);
      const ft = Math.round(from * (1 - k) / 5) * 5;
      if (read) read.textContent = ft > 0 ? (ft + ' ft') : 'ALONGSIDE';
      if (k > 0.35) {
        box.classList.add('rising');
        /* Something down there answers, once - the same chime an octave and a
           half below, coming back up out of the dark. */
        if (!answered) { answered = true; AU.sonarEcho(); }
      }
      if (k >= 1) { clearInterval(tick); tick = null; }
    }, 120);
    return function () {
      if (tick) { clearInterval(tick); tick = null; }
      AU.stopSonar();
      box.hidden = true;
      box.classList.remove('rising');
      if (read) read.textContent = '120 ft';
    };
  }

  function sayAgain() {
    if (!lastSaid) return;
    if (lastSaid.seq && lastSaid.seq.length) U.speakSeq(lastSaid.seq, lastSaid.tail);
    else U.speak(lastSaid.text, lastSaid.cue, lastSaid.tail);
  }

  function step(delta) {
    if (!items.length) return;
    /* OFF NOTHING, ONTO THE FIRST. Stepping into a card that has nothing
       selected should start at the top of it rather than wrap round to the
       bottom, whichever way the switch was pressed. */
    if (index < 0) {
      index = -1;
      for (let n = 0; n < items.length; n++) {
        if (items[n].enabled !== false) { index = n; break; }
      }
      if (index < 0) return;
      updateFocus(); speakItem(); AU.menuMove();
      if (!didBackHold) restartAutoScan();
      return;
    }
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
    /* NOTHING SELECTED: step onto the first row and read it out, rather than
       act on a choice nobody has made. This is what one switch does with a
       conversation card - ENTER is the only key it has, so the first press
       moves and the second takes. On two switches SPACE has already done the
       moving and this never runs. */
    if (index < 0) { step(1); return; }
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
    /* NOTHING FROM A SCENE IS LEFT ON THE SCREEN. The sonar dish belongs to
       six seconds at the end of the game; if a trip ends mid-scene - a quit,
       a tow - it would otherwise still be sat over the dock. */
    const sn = $('sonar');
    if (sn) { sn.hidden = true; sn.classList.remove('rising'); }
    /* And it stops chiming. A ping every two seconds is on a timer of its
       own, so a trip that ends mid-scene - a quit, a tow - would otherwise
       leave the sonar sounding away over the dock for ever. */
    AU.stopSonar();
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
  /* When the current scene appeared. A press in the scene picks what is under
     it with no dwell, and scenes replace each other under a pointer that has
     not moved - so for a moment after one opens, a click is far more likely to
     be the tail of the gesture that opened it than a choice. */
  let worldSince = 0;
  const POINTER_SETTLE_MS = 320;

  /* Something the last cast has to report, said as part of this scan's own
     announcement rather than a moment before it - said separately it was cut
     off by the announcement, mid-word. */
  let worldNote = '';

  function enterWorld(place, pickStart) {
    worldPlace = place;
    worldSince = Date.now();
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
    /* Options takes its turn in every scene's scan now, and it lives on this
       button - so the button has to be on screen for the frame to land on,
       whether or not a trip is running. */
    $('pauseBtn').classList.add('on');
    $('worldLabels').classList.add('on');
    $('dockHud').classList.toggle('on', place === 'dock');
    renderWorldLabels();
    if (place === 'dock') paintDockHud();
    applyWorldFocus();
    positionWorldLabels();
    const preamble = (worldNote ? worldNote + ' ' : '') +
                     (place === 'shop' ? 'The tackle shop. '
                    : place === 'spot' ? '' : 'The dock. ');
    worldNote = '';
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
    // While Space is held to scan backwards, the forward auto-scan must stay
    // off — the same rule step() follows in a menu.
    if (!didBackHold) startWorldScan();
  }

  function worldActivate() {
    AU.resume();
    AU.menuSelect();
    const it = worldItems[worldIndex];
    if (!it) return;

    /* Going in is going in, wherever it is picked from. It used to be handled
       only in the spot branch, so on the boards - where the scan can still be
       the DOCK's - "Back to the Dock" fell through to the last line of this
       function, which is the signpost's job: quit to the main menu. */
    /* Options, from any scene. The scan's place is handed to openPause so
       that closing it puts the highlight back exactly where it was - closing
       the scan first and then opening would lose that, and on the dock, where
       there is no play mode to fall back into, it would leave the screen with
       nothing highlighted at all. */
    if (it.key === 'options') {
      const back = { place: worldPlace, index: worldIndex };
      closeWorldScan();
      openPause(back);
      return;
    }
    if (it.key === 'dock') { closeWorldScan(); goInFromSpot(); return; }
    /* And the way out to the menu is the SIGN, by name. Anything unrecognised
       used to quit the game, which is the worst possible default. */

    if (worldPlace === 'spot') {
      if (it.key === 'cast')  { closeWorldScan(); G.startAim(); return; }
      if (it.key === 'troll') { closeWorldScan(); G.chooseTroll(); return; }
      if (it.key === 'dock')  { closeWorldScan(); goInFromSpot(); return; }
      closeWorldScan(); openPause(); return;
    }

    if (worldPlace === 'shop') {
      if (it.key === 'door')   { closeWorldScan(); openDock(); return; }
      if (it.key === 'tackle') { closeWorldScan(); setScreen('tackle'); return; }
      closeWorldScan(); setScreen('keeper'); return;
    }

    if (it.key === 'note') { closeWorldScan(); setScreen('brief'); return; }
    if (it.key === 'shop') { closeWorldScan(); openShop(); return; }
    if (it.key === 'boat')   { closeWorldScan(); G.setOnFoot(false); castOff(); return; }
    if (it.key === 'boards') { closeWorldScan(); G.setOnFoot(true); castOff(); return; }
    if (it.key === 'home') { closeWorldScan(); G.quitToMenu(); setScreen('title'); return; }
    // Anything else: stay where you are rather than throwing the game away.
    closeWorldScan();
    openDock();
  }

  /* ── Scan items that live on a button ─────────────────────────────────
     Two of them do: "Back to the Dock" is #tcDock and Options is #pauseBtn.
     They are bound ONCE, and what they activate is looked up by KEY when the
     click happens.

     Both of those matter. Binding on every render stacked a new listener each
     time and never removed one, and each listener closed over the item's
     index in the list AS IT WAS. A mouse click resolves the button's own
     pointerup FIRST - which changes the scene - and the click event lands
     afterwards, into a list where that index means something else entirely.
     Off the dock, index 2 stopped being "Back to the Dock" and became MAIN
     MENU, so coming in from a morning's fishing quit the game. */
  const domKeys = {};                 // which key each button stands for NOW
  const domBound = {};                // and which have their one listener

  function bindDomItem(id) {
    if (domBound[id]) return;
    const btn = $(id);
    if (!btn) return;
    domBound[id] = true;
    U.addTap(btn, () => {
      const key = domKeys[id];
      if (!key || !worldOn) return;   // the scan moved on; this click is late
      const ix = worldItems.findIndex(w => w.key === key);
      if (ix < 0) return;             // and this button is not in this scene
      worldIndex = ix;
      applyWorldFocus();
      worldActivate();
    });
  }

  function renderWorldLabels() {
    const wrap = $('worldLabels');
    wrap.innerHTML = '';
    Object.keys(domKeys).forEach((k) => { delete domKeys[k]; });
    worldItems.forEach((it, i) => {
      // An item can live on an existing button instead of getting a floating
      // plate — that is how Options stays in its usual corner while still
      // taking its turn in the scan.
      if (it.domId) {
        domKeys[it.domId] = it.key;
        bindDomItem(it.domId);
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
      /* CLEAR OF THE BRACKETS. A caption anchored to the thing it names lands
         inside the frame drawn round that thing - on a square of open water
         the frame is most of two hundred pixels tall and the caption sat
         across the top of it. The frame's box is known here to the pixel, so
         the caption is put just above it. */
      let top = p.y;
      const fr = item.sceneIndex !== undefined ? G.focusScreenRect() : null;
      if (fr && fr.h > 1) top = Math.min(top, fr.y - 14);
      el.style.top = Math.max(8, top).toFixed(0) + 'px';
    }
  }

  function paintDockHud() {
    const b = G.missionBrief();
    setDockPlace();
    /* NO MISSION UNTIL YOU HAVE ONE. The board at the dock opened a brand new
       game on "MISSION 1" with "Minnows & shiners 0 / 30" under it, before the
       player had walked into the shop - a job they had not been given, with a
       tally they could not move. Reported: "you shouldn't see the mission
       summary unless you actually have the mission." Until Walt has briefed
       you the board says where to go and nothing else. */
    const noJobYet = b.briefed === false;
    $('dockMission').hidden = noJobYet;
    $('dockMission').textContent = 'Mission ' + b.n + (b.done ? ' — complete' : '');
    $('dockTask').textContent = noJobYet ? 'Go and see Walt in the tackle shop' : b.text;
    /* ── WHAT IS IN THE BOX, ON THE NOTE ──────────────────────────────
       This used to be a second panel in the opposite corner, which is two
       readouts of one thing and a player looking in two places. It is here,
       where they are already looking, and it needs nothing pressed to see:
       the rod, the ONE thing on the end of the line - a lure and a magnet are
       the same slot, so whichever is rigged is what shows - and, when there
       is a job, whether that will do for it. */
    const kitRow = (function () {
      const bits = [];
      if (b.rod && b.rod.name) {
        bits.push('<span class="noteKitItem">' +
          (b.rodArt ? '<img src="' + b.rodArt + '" alt="" ' +
                      'onerror="this.style.display=\'none\'">'
                    : ic(b.rod.isNet ? 'creel' : 'rod')) +
          b.rod.name + '</span>');
      }
      const online = b.tool || (b.bait && b.bait.id !== 'none' ? b.bait : null);
      if (online) {
        bits.push('<span class="noteKitItem">' +
          (b.tool ? toolIc(b.tool.id)
                  : (G.baitIconFor ? G.baitIconFor(online.id) : ic('bait'))) +
          online.name + '</span>');
      }
      if (!bits.length) return '';
      let out = '<div class="noteKit">' + bits.join('') + '</div>';
      /* And whether it will do - the reason this was asked for. */
      const k = b.kitFit;
      if (!noJobYet && k) {
        out += k.ok
          ? '<div class="noteKitFit good">' + ic('ok') + ' Ready for this job</div>'
          : '<div class="noteKitFit bad">' + ic('warn') + ' ' + (k.why || '') +
            (k.need ? ' You want ' + k.need + '.' : '') + '</div>';
      }
      return out;
    })();

    $('dockGear').innerHTML = noJobYet
      /* What you are carrying and what is in the tin are true whether or not
         you have a job; the job's own tally is not. */
      ? (kitRow + '<b>$' + b.money + '</b>')
      : kitRow +
      '<b>' + b.progress + '</b>' +
      /* The rod and the lure are the icon row above; printing them again as
         words was the same information twice on one small note. */
      (b.gear && b.gear.length
        ? '<br><span style="opacity:.85">' +
          b.gear.map(g => g.icon + ' ' + g.name).join(' &bull; ') + '</span>'
        : '') +
      '<br><b>$' + b.money + '</b>' +
      (b.hold ? ' <span style="opacity:.75">+ ' + b.hold + ' to log</span>' : '') +
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
    panel.classList.toggle('cardbg-' + CARD_STYLE, isCatch);

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
    layout = meta.layout || 'list';
    if (meta.startIndex !== undefined) index = meta.startIndex;
    if (opts.index !== undefined) index = opts.index;
    if (items[index] && items[index].enabled === false) {
      for (let n = 0; n < items.length; n++) {
        const i = (index + n) % items.length;
        if (items[i].enabled !== false) { index = i; break; }
      }
    }

    render();
    fitPanel();
    /* A card can GROW after it is measured: the keeper's portrait and the
       fish in the log are images, and an image has no height until it has
       loaded. So it is measured again once they are in. */
    const fitAfterArt = $('panel');
    if (fitAfterArt) {
      fitAfterArt.querySelectorAll('img').forEach((img) => {
        if (!img.complete) img.addEventListener('load', fitPanel, { once: true });
      });
      setTimeout(fitPanel, 80);
    }
    showOverlay(true);
    /* A CONVERSATION OPENS WITH NOTHING CHOSEN. See step() and activate():
       with no row selected the first press must be a step, and a step reads
       the row out - which is what "hear the button before you say it" wants,
       without swallowing a press to get it. */
    if (meta.listenFirst && opts.index === undefined) index = -1;
    updateFocus();          // and scroll the starting row into view
    if (index >= 0 && items[index] && typeof items[index].onFocus === 'function') {
      items[index].onFocus();
    }
    /* WHAT THIS CARD SAID, kept so it can be said again. A player who missed
       a line - a clip cut out, somebody spoke, they were still reading - had
       no way back to it. */
    lastSaid = meta.announce === false ? lastSaid : {
      seq: meta.speechSeq, tail: meta.speechTail,
      text: meta.speech || (stripTags(meta.title) + '. ' + stripTags(meta.sub || '')),
      cue: meta.speechCue,
    };
    if (meta.announce !== false) {
      /* A recorded line, then anything only the system voice can say - the
         money, the next job - rather than the two of them cancelling each
         other out. See speak() in js/util.js. */
      if (meta.speechSeq && meta.speechSeq.length) {
        U.speakSeq(meta.speechSeq, meta.speechTail);
      } else {
        U.speak(meta.speech || (stripTags(meta.title) + '. ' + stripTags(meta.sub || '')),
                meta.speechCue, meta.speechTail);
      }
    }
    restartAutoScan();
  }

  function refresh() { setScreen(screen, { index: index, announce: false }); }

  const SCREENS = {

    title: () => ({
      art: icon('title', '' + ic('rod') + '', 'hero'),
      /* THE NAME, WITH THE JOKE IN IT: Mastery as typed, the a crossed out
         and a y over it, so it reads Mystery. The ink is in the stylesheet
         (see .fixa); the word the voice says is the `speech` below, because
         reading these letters aloud would give you "Maystery". */
      title: 'Benny&rsquo;s Fish M<span class="fixa">' +
             '<span class="fixa-x" aria-hidden="true">a</span>' +
             '<span class="fixa-y">y</span></span>stery',
      /* The old game was catch-and-keep: fill the boat, sell the fish. This
         one is a research station on a lake nobody will fish any more. */
      sub: 'Tag them, log them, put every one back \u2014 and find out what is out in the middle.',
      items: [
        { label: '' + ic('boat') + ' Play Game', speech: 'Play Game', action: openDock },
        { label: '' + ic('settings') + ' Settings', speech: 'Settings',
          action: () => { settingsReturn = 'title'; setScreen('settings'); } },
        { label: '' + ic('home') + ' Exit Game', speech: 'Exit Game', action: goToHub }
      ],
      speech: "Benny's Fish Mystery. Fishing for Walt's research station on Whispering Lake. " +
              "Play Game, Settings, or Exit." 
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
      /* Input sensitivity - how long a switch must be held before it counts -
         belongs to the hub's scan manager, which is where a carer sets it once
         for every game. A second copy of it here was a row to scan past. */
      const theme = THEMES.find(t => t.id === G.getTheme()) || THEMES[0];


      return {
        art: icon('settings', '' + ic('settings') + ''),
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

          /* Size limits are not a setting any more. Every fish in this game is
             tagged and put back, so the rule only ever decided whether a short
             one COUNTED - which is a rule of the job, not a preference, and
             one more row for a two-switch player to scan past. It stays on. */

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


          { label: 'Quest Helper', value: G.getHelper() ? 'On' : 'Off',
            speech: 'Quest helper, ' + (G.getHelper() ? 'on' : 'off') +
                    '. An arrow to the job, and a hand on the tiller when you drift off course.',
            action: () => {
              const on = G.toggleHelper();
              refresh();
              U.speak('Quest helper ' + (on ? 'on' : 'off'));
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
            action: () => { resetArmed = 0; setScreen(settingsReturn); } }
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
      /* NO KEEPER SIZES. Every fish here is tagged and let go - "nothing gets
         kept on my dock" - so a log that says how many inches a keeper has to
         be is a log for a different game. Where the fish lives goes in its
         place, which is what somebody who has not caught one is asking. */
      const line = (f) => {
        const had = f.caught > 0;
        const where = f.waters.length ? 'Lives in the ' + f.waters.join(' and the ') + '.' : '';
        if (had) {
          return f.name + '. Your best is ' + (f.best ? f.best.length + ' inches, ' +
                 f.best.weight + ' pounds' : 'landed') + '. ' +
                 (f.caught > 1 ? 'You have landed ' + f.caught + '. ' : '') + where;
        }
        return f.name + '. Not caught yet. ' + where;
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
            : (f.waters[0] || 'Not caught yet'),
          speech: line(f),
          // Pressing a row repeats it. Nothing to lose your place over.
          action: (function (t) { return function () { U.speak(t); }; })(line(f))
        };
      });
      rows.push({ label: '\u2190 Back', speech: 'Back', action: () => setScreen('keeper') });

      return {
        art: icon('rod', '' + ic('rod') + ''),
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
    /* ── The tackle box ─────────────────────────────────────────────────
       What goes in the boat: one rod (or the net), one lure, one tool. You can
       take anything anywhere - a bamboo rod over the trench is allowed, it
       simply will not reach and will lose rigs - so this is a decision rather
       than a formality, and the job's own requirement is stated at the top of
       it in plain words. */
    /* ── The tackle box ───────────────────────────────────────────────────
       A box with three trays: rods, lures, and what ties on the line. The
       front of it says what is in the boat and whether that will do the job;
       each tray is its own card holding nothing but that kind of thing.

       It used to be one list of everything with headings between - fifteen
       rows on a card built for eight, three of which could not be chosen and
       all of which took their turn in the scan. */
    kit: () => {
      const rod = G.equippedRod(), bait = G.equippedBait(), tool = G.equippedTool();
      const want = G.jobWants && G.jobWants();
      const check = G.kitCheck && G.kitCheck();
      const rods = (G.shopRods ? G.shopRods() : []);
      const baits = (G.shopBaits ? G.shopBaits() : []);
      const tools = (G.shopTools ? G.shopTools() : []);
      const list = [];

      const tray = (which, icName, name, carrying, count, why) => list.push({
        label: '' + ic(icName) + ' ' + name,
        value: carrying,
        speech: name + '. You have the ' + carrying + '. ' +
                (count === 1 ? 'It is the only one you own.'
                             : count + ' to choose from.') + (why ? ' ' + why : ''),
        action: () => { kitTray = which; setScreen('kittray'); }
      });

      tray('rod', 'rod', 'Rods', rod.name, rods.length,
           check && !check.ok && /rod|net/.test(check.need) ? 'Not the one this job needs.' : '');
      /* ONE tray for the end of the line. A lure and a magnet are the same
         slot, and two trays for one slot let a player pick both. */
      tray('line', 'bait', 'On the Line',
           tool ? tool.name : (bait.id !== 'none' ? bait.name : 'Nothing tied on'),
           baits.length + tools.length,
           check && !check.ok && /magnet|lure/.test(check.need) ? 'Not what this job needs.' : '');

      list.push({ label: '\u2190 Back', speech: 'Back', action: () => setScreen('tackle') });

      let stats = '';
      if (want) {
        stats += '<div class="needLine">This job wants <b>' + want.what + '</b>.</div>';
      }
      if (check && !check.ok) {
        stats += '<div class="needTip">' + ic('warn') + ' You have the <b>' + rod.name + '</b>' +
                 (tool ? ' with the <b>' + tool.name + '</b>' : ' and nothing on the line') +
                 '. ' + check.why + ' You need <b>' + check.need + '</b>.</div>';
      } else if (want) {
        stats += '<div class="needCount">' + ic('ok') + ' What you are carrying will do it.</div>';
      }

      return {
        art: icon('tacklebox', '' + ic('tacklebox') + ''),
        title: 'Your Tackle Box',
        /* WHAT IT IS, before what is in it. This is the inventory, it is free,
           and it was too easily read as another shelf of the shop. */
        sub: 'What goes out in the boat — nothing here costs money<br>' +
             '<b>' + rod.name + '</b> \u00b7 ' + bait.name +
             (tool ? ' \u00b7 <b>' + tool.name + '</b>' : ''),
        stats: stats, items: list,
        speech: 'Your tackle box - what goes out in the boat. Nothing here costs money. ' +
                'You are carrying the ' + rod.name + ' with ' + bait.name +
                (tool ? ' and the ' + tool.name : ' and nothing else on the line') + '. ' +
                (want ? 'This job wants ' + want.what + '. ' : '') +
                (check && !check.ok ? check.why + ' ' : '') +
                'Rods, lures, and what is on the line, each in its own tray.'
      };
    },

    /* One tray of the box. Nothing in here but the one kind of thing, with a
       tick against whichever is in the boat. */
    kittray: () => {
      const rod = G.equippedRod(), bait = G.equippedBait(), tool = G.equippedTool();
      const list = [];
      /* TILES, WITH THE THING'S OWN PICTURE - and the one already packed is
         not one of them.

         It used to be a tile like any other with a tick on it, and it was
         still selectable: the scan stopped on it, read it out, and pressing
         it did nothing. A tick is also the weakest mark on a screen - thin,
         one colour, and meaningless unless you can see the other tiles to
         compare it against. Reported: "some people with low vision won't be
         able to tell if something has a checkbox next to it."

         So what is in the boat goes ABOVE, in a block of its own, and
         everything below it is something you can actually change to. */
      let packed = null;
      const artOf = function (art, iconHtml) {
        return art ? '<img class="cardArt" src="' + art + '" alt="" ' +
                     'onerror="this.style.display=\'none\'">'
                   : (iconHtml || ic('tacklebox'));
      };
      const pick = (label, sub, on, action, art, iconHtml) => {
        if (on) { packed = { name: label, note: sub, art: artOf(art, iconHtml) }; return; }
        list.push({
          label: label,
          card: { icon: artOf(art, iconHtml), title: label, note: sub },
          speech: stripTags(label) + '. ' + sub + '. Press to pack it instead.',
          action: action
        });
      };
      const close = () => { AU.menuSelect(); setScreen('kit'); };

      let title, sub, speech;
      if (kitTray === 'line') {
        /* Lures and magnets, one list, one tick. Choosing either takes the
           other off - the engine does that in equipKit, so the two can never
           both be on. */
        title = 'On the Line';
        sub = tool ? tool.name : (bait.id !== 'none' ? bait.name : 'Nothing tied on');
        /* WHAT IT IS FOR, first. The fish decides the lure, so the fish it is
           made for is the thing somebody choosing in a hurry needs - ahead of
           what it is made of or how it is worked. */
        (G.shopBaits ? G.shopBaits() : []).forEach(b2 => pick(
          b2.name,
          (G.lureIsFor && G.lureIsFor(b2.id)) || b2.note || 'A lure on the hook',
          !tool && bait.id === b2.id,
          () => { G.equipKit(undefined, b2.id, undefined); close(); },
          null, G.baitIconFor ? G.baitIconFor(b2.id) : ic('bait')));
        (G.shopTools ? G.shopTools() : []).forEach(t => pick(
          t.name, t.note || 'A magnet, for iron off the bottom',
          !!tool && tool.id === t.id,
          () => { G.equipKit(undefined, undefined, t.id); close(); },
          null, toolIc(t.id)));
        speech = 'On the line. ' +
                 (tool ? 'You have the ' + tool.name + ' on.'
                       : (bait.id !== 'none' ? bait.name + ' on the hook.' : 'Nothing tied on.')) +
                 ' A lure or a magnet - one or the other. A magnet job cannot be done with a ' +
                 'lure on, and a fish will not take a magnet.';
      } else if (kitTray === 'rod') {
        title = 'Rods';
        sub = 'In the boat: ' + rod.name;
        (G.shopRods ? G.shopRods() : []).forEach(r => pick(
          r.name,
          r.isNet ? 'A scoop, for bait and litter'
                  : 'Casts ' + r.castFt + ' ft \u00b7 fishes ' + r.reachFt + ' ft down',
          rod.id === r.id,
          () => { G.equipKit(r.id, undefined, undefined); close(); },
          G.rodArtFor ? G.rodArtFor(r) : '', ic(r.isNet ? 'creel' : 'rod')));
        speech = 'Rods. You are carrying the ' + rod.name + '. Scan to take a different one.';
      } else if (kitTray === 'bait') {
        title = 'Lures';
        sub = 'On the hook: ' + bait.name;
        (G.shopBaits ? G.shopBaits() : []).forEach(b2 => pick(
          b2.name, b2.note || '', bait.id === b2.id,
          () => { G.equipKit(undefined, b2.id, undefined); close(); },
          null, G.baitIconFor ? G.baitIconFor(b2.id) : ic('bait')));
        speech = 'Lures. You have ' + bait.name + ' on. Scan to tie on a different one.';
      } else {
        title = 'On the Line';
        sub = tool ? tool.name : 'Nothing tied on';
        pick('Just the lure', 'Nothing else tied on', !tool,
             () => { G.equipKit(undefined, undefined, ''); close(); },
             null, ic('bait'));
        (G.shopTools ? G.shopTools() : []).forEach(t => pick(
          t.name, t.note || '', !!tool && tool.id === t.id,
          () => { G.equipKit(undefined, undefined, t.id); close(); },
          null, toolIc(t.id)));
        speech = 'On the line. ' + (tool ? 'You have the ' + tool.name + ' tied on.'
                                         : 'Nothing but the lure.') +
                 ' A magnet job cannot be done without a magnet.';
      }

      /* WHAT IS IN THE BOAT, above the choices, at full size and with its own
         picture - the one thing on this screen that is not a decision, and so
         the one thing the scan never stops on. */
      let stats = '';
      if (packed) {
        stats += '<div class="inBoat">' +
                   '<div class="inBoatHead">' + ic('ok') + ' In the boat</div>' +
                   '<div class="inBoatRow">' +
                     '<span class="inBoatArt">' + packed.art + '</span>' +
                     '<span><b>' + packed.name + '</b>' +
                       (packed.note ? '<span>' + packed.note + '</span>' : '') +
                     '</span>' +
                   '</div>' +
                 '</div>';
      }
      /* AND NOTHING TO SWAP TO IS WORTH SAYING OUT LOUD. An empty shelf under
         "in the boat" reads as a screen that failed to load. */
      if (!list.length) {
        stats += '<div class="needCount">It is the only one you own. ' +
                 'Walt sells the rest.</div>';
      }

      list.push({ label: '\u2190 Back to the Box', speech: 'Back to the tackle box',
                  action: () => setScreen('kit'),
                  card: { icon: ic('tacklebox'), title: 'Back to the Box', wide: true } });
      /* "Your Rods" reads; "Your On the Line" does not - so the possessive is
         only put on the trays that are a THING you own, and the slot keeps
         its own name. */
      const owned = /^(Rods|Lures)$/.test(title);
      return { art: icon('tacklebox', '' + ic('tacklebox') + ''),
               title: owned ? 'Your ' + title : title,
               sub: list.length > 1 ? 'Swap to one of these' : 'Nothing else to swap to',
               stats: stats,
               items: list, layout: 'grid',
               speech: speech + (packed ? ' The ' + stripTags(packed.name) +
                                          ' is in the boat.' : '') +
                       (list.length > 1 ? '' : ' You own nothing else for this.') };
    },

    /* ── The one thing this place is for ────────────────────────────────
       A job that sends you somewhere rather than after something has nothing
       to cast at: the centre fog, a stranded boat, a place to go and see. One
       row, and it is the thing the job is about.

       This card is fired by game.js as `beat` and had no screen here at all,
       so pulling over at the fog threw an exception and left the previous
       card sitting on the screen with nothing behind it. */
    beat: () => {
      const d = cardData || {};
      const incident = d.kind === 'incident';
      return {
        art: icon(incident ? 'warn' : 'map', '' + ic(incident ? 'warn' : 'map') + ''),
        /* NOTHING HIGHLIGHTED TO BEGIN WITH. This card arrives on the back of
           a switch press - the pull-over - and the one row on it plays out the
           two biggest moments in the game. It reads the situation out first;
           the next press reads the row; the one after that does it. Same model
           as every conversation card. */
        listenFirst: true,
        title: d.title || 'The Place',
        sub: d.label ? ('You are over ' + d.label + '.') : 'You are here.',
        stats: '<div class="needLine">' + stripTags(String(d.text || '')) + '</div>',
        items: [
          { label: '' + ic(incident ? 'warn' : 'ok') + ' ' + (d.action || 'Do it'),
            speech: d.action || 'Do it',
            /* AND THE CARD GOES AWAY. An incident ENDS the trip - Walt tows
               you in - and takeBeat does that itself, deep in the engine,
               so the interface has to be told or the card sits over the dock
               with the game behind it. Reported: "wait for the tow card
               doesn't go away when we go back to the dock". */
            action: function () {
              const r = G.takeBeat ? G.takeBeat() : null;
              showOverlay(false);
              if (r && r.towing) {
                lastTrip = r.trip;
                AU.stopWater(); AU.stopMotor();
                openDock();
                return;
              }
              /* A SCENE RATHER THAN A SENTENCE. The sonar and the bell play
                 out on the water with the card off the screen, and the trip
                 picks up when the last line lands. */
              if (r && r.scene) {
                playScene(r.scene, function () {
                  if (G.chooseTroll) G.chooseTroll();
                });
              }
            } },
          /* Options is the pause card everywhere else in the game, not a
             screen of its own - and it has to be reachable from here like it
             is from every other card. */
          { label: '' + ic('settings') + ' Options', speech: 'Options',
            action: function () { openPause(); } },
        ],
        /* What the job said to do, said again now you are stood in it. */
        speech: (d.title || 'Here you are') + '. ' + stripTags(String(d.text || '')),
      };
    },

    /* ── Walt talking ───────────────────────────────────────────────────
       One turn per card: what he just said, and the one thing you say back. A
       briefing is three or four of these; a story beat is one. */
    waltsays: () => {
      const step = beatSteps[beatIx];
      if (step) {
        const n = beatSteps.length;
        return {
          art: keeperArt(ic('home')),
          title: 'Walt',
          sub: '"' + step.text + '"',
          stats: n > 1 ? '<div class="needCount">' + (beatIx + 1) + ' of ' + n + '</div>' : '',
          /* A CONVERSATION, so the first press hears your line and the second
             one says it - and there is always a way to have him repeat
             himself, which is the whole story arriving one line at a time. */
          listenFirst: true,
          items: [{ label: '“' + step.reply + '”', speech: step.reply,
                    speechCue: step.replyCue, action: advanceBeat },
                  { label: '' + ic('think') + ' Say that again, Walt',
                    speech: 'Say that again, Walt',
                    action: function () { sayAgain(); } }],
          speech: step.text,
          // Walt's own recording of this line, if it has been made.
          speechCue: step.cue
        };
      }
      const b = lastBeat || {};
      return {
        art: keeperArt(ic('home')),
        title: 'Walt',
        sub: b.text ? '"' + b.text + '"' : '',
        stats: '',
        listenFirst: true,
        items: [{ label: '▶ Okay', speech: 'Okay', action: () => setScreen('keeper') },
                { label: '' + ic('think') + ' Say that again, Walt',
                  speech: 'Say that again, Walt',
                  action: function () { sayAgain(); } }],
        speech: b.text || '',
        /* HIS OWN VOICE. A story beat handed over its words and no cue, so
           the system voice read a line that had been recorded months ago. */
        speechSeq: (b.seq && b.seq.length) ? b.seq : null,
        speechCue: b.cue || (b.seq && b.seq.length === 1 ? b.seq[0].cue : null)
      };
    },

    /* What he hands over, when he hands something over. */
    /* WHAT CHANGED HANDS, and nothing else. This card used to quote the whole
       of the conversation you had just had back at you - the entire first-
       morning brief in one box - which is a lot of reading about something
       you were there for. Reported: "it can just give a summary and say Walt
       hands you the net and the map. Keep it simple." So: what he handed
       over, and what the job is. */
    waltgives: () => {
      const b = lastBeat || {};
      const gave = (b.gave || []).join(' and the ');
      return {
        art: keeperArt(ic('rod')),
        title: 'Walt hands you the ' + gave,
        sub: 'That is the job. Everything you catch gets tagged, logged and put back.',
        stats: '<div class="needCount">' + G.currentMission().text + '</div>',
        items: [{ label: '▶ Thanks', speech: 'Thanks', action: () => setScreen('keeper') }],
        speech: 'Walt hands you the ' + gave + '. ' + G.currentMission().text
      };
    },

    keeper: () => {
      const st = G.turnInState();
      const nudge = G.nudgeLine ? G.nudgeLine() : null;
      /* Arriving with a boat full: his line, not a summary of the hold. */
      const holdLine = (st.hold && !st.done && G.waltLine) ? G.waltLine('hold') : null;
      /* AND WHAT HE SAYS WHEN IT IS DONE. Same idea as the line above: one
         of several recorded lines, and the same words on the card, in the
         air, and in the repeat. What he is handing over is a tail after it,
         because that part changes with every job. */
      const doneLine = (st.done && G.waltLine) ? G.waltLine('done') : null;
      const list = [];
      let sub, stats;
      /* What he says when he has something waiting - and it has to be the
         line the card is SPEAKING as well as the one it prints. */
      let greet = null, grantLine = null, scalesLine = null, needLine = null;

      /* The JOB comes first, always.
       *
       * He used to lead with the scales whenever there were fish in the hold,
       * which meant that walking in with a finished job and a full boat got
       * you a card about selling and no mention of the job at all - and then
       * a second visit for the gear, and a third to hand it in. Finishing the
       * job is the thing being played for, so it is the first thing on the
       * card and it is one press: he buys the fish, sells you the gear the
       * next job needs, and takes the job in, in that order. */
      const cb = G.counterBeat ? G.counterBeat() : null;
      if (cb && !cb.done) {
        /* Walt has something to say before anything else happens: the brief
           for this job (and, the first morning, the net), a story beat, or
           the bell. One row, in his words. */
        const brief = cb.kind === 'brief';
        greet = brief ? waltSays('walt_hello', 'Well, hey there, kid!')
                      : waltSays('walt_moment', 'Come here a second.');
        sub = '"' + greet.text + '"';
        stats = '<div class="needLine">' + (brief ? 'Walt has a job for you.' : cb.label) + '</div>' +
                (brief && st.mission.player ? '<div class="needTip">You: "' + st.mission.player + '"</div>' : '');
        list.push({ label: '' + ic('ok') + ' ' + cb.label, speech: cb.speech, action: doCounterBeat });
      } else if (st.done) {
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
        sub = '"' + ((doneLine && doneLine.text) || "Nice work. Let's settle up, then.") + '"';
        stats = '<div class="needLine">' + st.mission.text + ' &mdash; done.</div>';
        if (st.hold) {
          stats += '<div class="needCount">Upload the logbook: <b>' + st.hold +
                   '</b> tag' + (st.hold === 1 ? '' : 's') + ' and finds to go in the record.</div>';
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
        /* The gear's name changes with the job, so it cannot be inside a
           clip - it is printed underneath and said in the tail instead. */
        grantLine = waltSays('walt_grant', 'Saving up for that? I have it right here.');
        sub = '"' + grantLine.text + '"';
        stats = '<div class="needLine">' + st.grant.name + ' &mdash; <b>$' + st.grant.cost + '</b></div>' +
                '<div class="needTip">' + st.grant.note + '</div>' +
                '<div class="needCount">The next job is built around it.</div>';
        list.push({ label: '' + ic('rod') + ' Buy the ' + st.grant.name + ' — $' + st.grant.cost,
                    speech: 'Buy the ' + st.grant.name + ', ' + st.grant.cost + ' dollars',
                    action: doTakeGrant });
        if (st.hold) {
          list.push({ label: '' + ic('logbook') + ' Hand In the Logbook',
                      speech: 'Hand in the logbook', action: doSell });
        }
      } else if (st.hold) {
        // No job to hand in, but a logbook to hand over: the ledger, then.
        scalesLine = waltSays('walt_scales', "Great catch! Let's have a look at those.");
        sub = '"' + scalesLine.text + '"';
        stats = '<b>' + st.hold + ' tags and finds to log</b>' +
                '<br><span style="opacity:.8">He is already reaching for the ledger. The pay is for the job.</span>';
        list.push({ label: '' + ic('logbook') + ' Hand In the Logbook', speech: 'Hand in the logbook', action: doSell });
      } else {
        // What he needs, then where they are, then the choices — the card
        // reads top to bottom the way he would say it.
        needLine = waltSays('walt_need', 'This is what I need.');
        sub = '"' + needLine.text + '"';
        stats = '<div class="needLine">' + st.mission.text + '</div>' +
                '<div class="needCount">' + st.progressText + '</div>' +
                '<div class="needTip">"' + st.tip + '"</div>';
        list.push({ label: '' + ic('ok') + ' Right you are', speech: 'Right you are', action: backToShop });
      }

      /* THE ONE PURCHASE THE STORY JUST ASKED FOR, offered here rather than
         on the shelf. The Canoe Fund is a job about affording a canoe: when
         it is affordable the man who set the job should be the one to offer
         it, and it should be one press. The tackle wall is still there for
         everything else. */
      const offer = G.nextOffer && G.nextOffer();
      if (offer) {
        const verb = offer.rental ? 'Rent' : 'Buy';
        if (offer.affordable) {
          list.unshift({
            label: '' + ic('money') + ' ' + verb + ' the ' + offer.name + ' \u2014 $' + offer.cost,
            speech: verb + ' the ' + offer.name + ' for ' + offer.cost + ' dollars',
            action: doTakeOffer
          });
          stats += '<div class="needTip">' + (offer.rental
            ? 'The deposit is <b>$' + offer.cost + '</b> and she is yours for the day.'
            : 'The <b>' + offer.name + '</b> is <b>$' + offer.cost + '</b>.') + '</div>';
        } else {
          stats += '<div class="needTip">' + ic('buy') + ' <b>$' +
                   (offer.cost - st.money) + '</b> more and the <b>' + offer.name +
                   '</b> is ' + (offer.rental ? 'yours for the day' : 'yours') + '.</div>';
        }
      }

      /* The tackle box is not on this card any more: it is gear, and it opens
         from the gear on the WALL rather than across the counter, which is
         where you hand a job in and buy what the next one needs. */
      /* SAY THAT AGAIN. High on the card rather than buried at the bottom:
         somebody who missed what he said needs it in one step, not five. */
      list.push({ label: '' + ic('think') + ' Say that again, Walt',
                  speech: 'Say that again, Walt',
                  action: function () { sayAgain(); } });
      list.push({ label: '' + ic('clipboard') + ' The Mission Log', speech: 'The mission log',
                  action: () => openMissionLog('keeper') });
      list.push({ label: '' + ic('logbook') + ' The Fishing Log', speech: 'The fishing log',
                  action: () => setScreen('creel') });
      list.push({ label: '← Back', speech: 'Back', action: backToShop });

      return {
        /* The bait shack stands in if the portrait is ever missing. It used
           to be a bearded-person emoji, which is drawn by whatever font the
           machine ships and matched nothing else on screen. */
        art: keeperArt(ic('home')),
        title: 'The Shopkeeper',
        /* A conversation, so the first press hears the row rather than
           answering with it. See activate(). */
        listenFirst: true,
        sub, stats, items: list,
        // Spoken as a sentence — "you have 2 of 3 Sunfish, one more" — rather
        // than reading the card's own shorthand out loud.
        speech: (cb && !cb.done && greet) ? greet.text
          : st.done
          ? ((doneLine && doneLine.text) || 'Nice work, that is the job done.')
          : st.canTakeGrant
          ? ('He has the ' + st.grant.name + ' for ' + st.grant.cost +
             ' dollars, and the next job is built around it.' +
             (st.hold ? ' He will put your ' + st.hold + ' tags in the record too.' : ''))
          : st.hold
          ? ((holdLine && holdLine.text) ||
             ('Good day out! He will put those ' + st.hold + ' in the record.'))
          /* WHAT HE SAYS WHEN YOU COME BACK WITHOUT IT DONE. Written for all
             thirty-five jobs and recorded for all thirty-five, and no line of
             code had ever read the field. */
          : (nudge ? nudge.text
                   : "Here's what I need. " + st.mission.text + '. ' +
                     st.targetSpeech + ' ' + st.tip),
        speechCue: (cb && !cb.done && greet) ? greet.cue
                 : st.done ? (doneLine ? doneLine.cue : null)
                 : (!st.canTakeGrant && !st.hold && nudge) ? nudge.cue
                 : (holdLine ? holdLine.cue : null),
        /* WHAT HE SAYS, THEN WHAT IT MEANS FOR YOU. The clip cannot know
           which rod is going in the boat or how many dollars short you are,
           so that follows it in the system voice rather than replacing it. */
        speechTail: (cb && !cb.done && greet) ? (cb.label || '')
          : st.done
          ? (function () {
              const g = st.grantTaken ? null : st.grant;
              const after = st.money + st.holdValue;
              if (g && after < g.cost) {
                return 'Hand it in and he will take the record. The ' + g.name +
                       ' for the next job is ' + (g.cost - after) +
                       ' dollars more than you will have, so come back for it when you can.';
              }
              return 'Hand it in and he will take the record' +
                     (g ? ' and put the ' + g.name + ' in the boat for the next one.' : '.');
            })()
          : (!st.canTakeGrant && !st.hold && nudge) ? (st.progressText || '')
          : (holdLine ? ('He will put those ' + st.hold + ' in the record.') : '')
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
      const kc = G.kitCheck && G.kitCheck();
      const list = [];
      let stats = '<div class="needLine">' + b.text + '</div>';
      if (kc && !kc.ok) {
        /* NOT A TACKLE BOX ROW. The box opens from the tackle wall, so opening
           it from here and closing it again left the player standing in the
           shop they had just come out of - which reads as the game undoing
           their trip. It says where the change is made instead. */
        stats += '<div class="needTip">' + ic('warn') + ' ' + kc.why +
                 ' This one needs <b>' + kc.need + '</b> and you have not got it on. ' +
                 'The tackle box is on the wall in the shop.</div>';
      }

      if (rod) {
        stats += '<div class="needTip">' + ic('rod') + ' This job was built for the <b>' + rod.name +
                 '</b>. On the ' + b.rod.name + ' the big ones will mostly shake the hook.' +
                 '</div>';
      }
      if (bait) {
        stats += '<div class="needTip">' + ic('bait') + ' Its lure is the <b>' + bait.name +
                 '</b>. On the ' + b.bait.name + ' the fish it wants come along slower.' +
                 '</div>';
      }
      stats += '<div class="needCount">' + ic('money') + ' <b>$' + b.money + '</b> in the tin</div>';

      list.push({ label: '' + ic('rod') + ' Go to the Tackle Shop',
                  speech: 'Go to the tackle shop', action: openShop });
      list.push({ label: '\u26f5 Go Fishing Anyway',
                  speech: 'Go fishing anyway', action: goFishingAnyway });
      list.push({ label: '\u2190 Back to the Dock', speech: 'Back to the dock',
                  action: backToDock });

      return {
        art: icon('tacklebox', '' + ic('tacklebox') + ''),
        title: 'Before you go',
        sub: rod && bait ? "You're missing the rod and the lure this one wants."
             : rod ? "You're missing the rod this one wants."
             : "You're missing the lure this one wants.",
        stats,
        items: list,
        speech: 'Before you go. ' + b.text + '. ' +
                (kc && !kc.ok ? kc.why + ' This one needs the ' + kc.need +
                                ', and the tackle box is on the wall in the shop. ' : '') +
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
      /* IN HIS OWN VOICE, AND NOT THE SAME LINE TWICE. This is the moment a
         player reaches at the end of every trip, and it was the system voice
         reading out a sum. What he says depends on what came in; the numbers
         follow it, because a logbook is about the numbers. */
      const said = G.logLine ? G.logLine(r) : null;
      const tail = r.count + ' tags and finds in the record. ' +
                   'You now have ' + G.getSave().money + ' dollars.';
      return {
        art: icon('money', '' + ic('money') + ''),
        title: 'Logged',
        sub: '"' + (said ? said.text
                         : waltSays('walt_obliged', 'Much obliged, kid.').text) + '"',
        stats: '<div class="catchStat"><b>' + r.count + '</b> tags and finds in the record</div>' +
               '<div class="catchStat">You have <b>$' + G.getSave().money + '</b> in the tin</div>',
        items: [{ label: '' + ic('ok') + ' Thanks', speech: 'Thanks', action: backToShop }],
        speech: said ? said.text : ('Logged. ' + tail),
        speechCue: said ? said.cue : null,
        speechTail: said ? tail : ''
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
      const eco = RT.economy;
      const e = eco ? eco.status() : null;

      /* Tiles, gathered with a sort key so the counter can be ordered by what
         you can actually do: services you may be obliged to buy, then the job's
         own gear, then affordable stock, then the ladder, then what you own. */
      const tiles = [];
      const add = (rank, card, speech, action, enabled) => tiles.push({
        rank: rank, card: card, speech: speech, action: action,
        enabled: enabled !== false
      });

      // ── 0. Fuel and repairs. First because they are the only things here
      //       you can be forced to buy.
      if (e && e.gasPrice > 0 && G.burnsFuel && G.burnsFuel()) {
        const pay = Math.min(e.gasPrice, st.money);
        add(0, { icon: ic('fuel'), title: 'Fuel', wide: false,
                 price: pay > 0 ? '$' + pay : 'no money',
                 note: pay >= e.gasPrice ? 'Fills the tank. Now ' + e.fuelWord.toLowerCase() + '.'
                                         : 'Tank is ' + e.fuelWord.toLowerCase() + '. Part fill.' },
            pay >= e.gasPrice
              ? 'Fuel. Fill the tank, ' + pay + ' dollars.'
              : 'Fuel. Put in ' + pay + ' dollars worth. The tank is ' + e.fuelWord.toLowerCase() + '.',
            () => doBuyFuel(pay), pay > 0);
      }
      if (e && e.repairPrice > 0 && G.hasHull && G.hasHull()) {
        const pay = Math.min(e.repairPrice, st.money);
        add(0, { icon: ic('repair'), title: 'Repairs',
                 price: pay > 0 ? '$' + pay : 'no money',
                 note: 'Hull is ' + e.wearWord.toLowerCase() +
                       (pay >= e.repairPrice ? '. Puts it right.' : '. Patch only.') },
            pay >= e.repairPrice
              ? 'Repairs. Put the boat right, ' + pay + ' dollars.'
              : 'Repairs. Patch up ' + pay + ' dollars worth. The hull is ' + e.wearWord.toLowerCase() + '.',
            () => doBuyRepair(pay), pay > 0);
      }

      // ── 1. What this job actually needs.
      const rod = G.nextRod();
      if (rod) {
        const can = st.money >= rod.cost;
        add(can ? 1 : 3,
            { icon: ic('rod'), title: rod.name,
              price: '$' + rod.cost,
              note: can ? rod.reachNote : 'Need $' + (rod.cost - st.money) + ' more' },
            'The ' + rod.name + ', ' + rod.cost + ' dollars. ' + rod.reachNote +
            (can ? '' : ' You need ' + (rod.cost - st.money) + ' dollars more.'),
            () => doBuyRod(rod.id), can);
      }
      const bait = G.nextBait();
      if (bait) {
        const can = st.money >= bait.cost;
        add(can ? 1 : 3,
            { icon: ic('bait'), title: bait.name, price: '$' + bait.cost,
              note: can ? "This job's lure" : 'Need $' + (bait.cost - st.money) + ' more' },
            'The ' + bait.name + ', ' + bait.cost + ' dollars. It is the lure this job wants.' +
            (can ? '' : ' You need ' + (bait.cost - st.money) + ' dollars more.'),
            () => doBuyBait(bait.id), can);
      }

      // ── 1b. The way out. The next vessel up, and the next tool on the
      //        shelf - the two things that open water you cannot reach yet.
      const ves = G.nextVessel ? G.nextVessel() : null;
      if (ves) {
        const can = st.money >= ves.cost;
        add(can ? 1 : 3,
            { icon: ic('anchor'), title: ves.name, price: '$' + ves.cost,
              note: can ? (ves.rental ? 'A rental. Opens the shallow bay.' : 'Yours to keep. Opens deeper water.')
                        : 'Need $' + (ves.cost - st.money) + ' more' },
            ves.name + ', ' + ves.cost + ' dollars. ' + ves.note +
            (can ? '' : ' You need ' + (ves.cost - st.money) + ' dollars more.'),
            () => doBuyVessel(ves.id), can);
      }
      const tool = G.nextTool ? G.nextTool() : null;
      if (tool) {
        const can = st.money >= tool.cost;
        add(can ? 2 : 3,
            { icon: ic('anchor'), title: tool.name, price: '$' + tool.cost,
              note: can ? 'Goes on the line. Brings up what is on the bottom.'
                        : 'Need $' + (tool.cost - st.money) + ' more' },
            tool.name + ', ' + tool.cost + ' dollars. ' + tool.note +
            (can ? '' : ' You need ' + (tool.cost - st.money) + ' dollars more.'),
            () => doBuyTool(tool.id), can);
      }

      // ── 2. The gear ladder. Everything stays on the counter; only the ORDER
      //       and the state change, so the ladder is visible while you save up.
      stock.forEach(g => {
        if (g.maxed) {
          add(4, { icon: ic(GEAR_ICON[g.id] || 'tacklebox'), title: g.name,
                   price: 'Best there is', owned: true, note: g.ownedName },
              g.name + '. You have the ' + g.ownedName + ', the best there is.',
              null, false);
          return;
        }
        add(g.affordable ? 2 : 3,
            { icon: ic(GEAR_ICON[g.id] || 'tacklebox'), title: g.next.name,
              price: '$' + g.next.cost,
              owned: false,
              note: g.affordable
                ? g.next.note
                : 'Need $' + g.short + ' more' + (g.ownedName ? ' \u00b7 have ' + g.ownedName : '') },
            g.next.name + ', ' + g.next.cost + ' dollars. ' + g.next.note +
            (g.affordable ? '' : ' You need ' + g.short + ' dollars more.') +
            (g.ownedName ? ' You already have the ' + g.ownedName + '.' : ''),
            () => doBuy(g.id), g.affordable);
      });

      tiles.sort((a, b) => a.rank - b.rank);

      const list = tiles.map(t => ({
        label: t.card.title, card: t.card, speech: t.speech,
        action: t.action || (() => AU.menuBlocked()),
        enabled: t.enabled
      }));

      // Back is a row, not a tile: it is not merchandise.
      /* THE TACKLE BOX OPENS FROM THE TACKLE WALL. It used to be a row on the
         shopkeeper's card - the counter, where a job is handed in and the next
         one's gear is bought. What goes in the boat is gear, and this is where
         the gear is. */
      const kcHere = G.kitCheck && G.kitCheck();
      list.push({ label: '' + ic('tacklebox') + ' Your Tackle Box — what is in the boat' +
                         (kcHere && !kcHere.ok ? ' — ' + ic('warn') + ' wrong for this job' : ''),
                  speech: kcHere && !kcHere.ok
                    ? 'Your tackle box, what is in the boat. Nothing here costs money. ' +
                      'What you are carrying will not do this job.'
                    : 'Your tackle box, what is in the boat. Nothing here costs money.',
                  action: () => setScreen('kit') });
      list.push({ label: ic('home') + ' Back', speech: 'Back', action: backToShop,
                  card: { icon: ic('home'), title: 'Back', wide: true } });

      const tip = G.gearAdvice();
      let stats = '<div style="text-align:left;line-height:1.7">' +
                  ic('money') + ' <b>$' + st.money + '</b> in the tin</div>';
      if (e) {
        /* Bars, not words. The price on each one climbs as the bar drains,
           which is the whole argument for filling up before it is urgent. */
        /* Fuel is the motorboat's business and the hull is a boat you own -
           on foot, or in a rented canoe, neither is a thing the shop can do
           anything about, and two meters reading Full and Sound were two
           lines of nothing on every visit for the first fifteen jobs. */
        if (G.burnsFuel && G.burnsFuel()) stats += meter('fuel', 'Fuel', e.fuel, e.fuelWord, e.gasPrice);
        if (G.hasHull && G.hasHull()) stats += meter('repair', 'Hull', 1 - e.wear, e.wearWord, e.repairPrice);
        if (e.debt > 0) {
          stats += '<div style="text-align:left;line-height:1.5">' + ic('debt') +
                   ' <b>$' + e.debt + '</b> owed for the tow \u2014 the next sale ' +
                   'settles it.</div>';
        }
      }
      if (tip) {
        stats += '<div style="text-align:left;line-height:1.5;margin:10px 0 4px;' +
                 'padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.07)">' +
                 ic('tip') + ' ' + tip.text + '</div>';
      }

      const canBuy = tiles.filter(t => t.enabled && t.action).length;
      /* An empty counter needs a reason, not a shrug. Early on the shelf is
         bare because the ladder has not reached anything yet - "nothing in
         reach" read as a bug, or as money trouble. */
      const bare = !tiles.length;
      return {
        art: icon('tacklebox', '' + ic('rod') + ''),
        /* WHICH OF THE TWO THIS IS. "Tackle" and "Your Tackle Box" are the
           same words twice for a shop and an inventory, and one opens from
           the other - so neither said which one costs money. */
        title: "Walt's Counter",
        sub: bare ? "For sale — Walt has nothing out for you yet; that comes with the next job or two"
           : 'For sale — $' + st.money + ' in the tin' +
             (canBuy ? '' : ', nothing here in reach yet'),
        stats, items: list, layout: 'grid',
        speech: "Walt's counter, for sale. You have " + st.money + ' dollars. ' +
                (tip ? tip.speech + ' ' : '') +
                (bare ? 'Walt has nothing out for you yet. That comes with the next job or two.'
                      : canBuy ? 'You can afford ' + canBuy + (canBuy === 1 ? ' thing.' : ' things.') +
                                 ' Those are first.'
                      : 'Nothing on the counter is in reach yet.')
      };
    },

    /* -- What you just bought. --------------------------------------------- */
    bought: () => {
      const b = lastBuy || {};
      const bought = b.name || 'It';
      return {
        art: b.icon || '' + ic('buy') + '',
        title: b.name ? (b.name + ' — bought') : 'Bought',
        /* "On your boat now" is true of everything ever bought, which is
           why nobody noticed a new rod. Say what actually changed. */
        sub: '"' + (b.inHand
          ? waltSays('walt_bought_hand', 'Good choice. That is the one in your hands now.').text
          : waltSays('walt_bought_boat', 'Good choice. That is on your boat now.').text) + '"',
        stats: '<div class="catchStat"><b>' + ic('done') + ' ' + (b.icon || '') + ' ' +
               bought + '</b> is yours' +
               (b.line ? ' — it is your ' + b.line.toLowerCase() : '') + '</div>' +
               '<div class="catchStat">' + (b.note || '') + '</div>' +
               '<div class="catchStat">$' + (b.cost || 0) + ' — you have <b>$' +
               G.getSave().money + '</b> left</div>',
        items: [{ label: '' + ic('ok') + ' Ok', speech: 'Ok', action: () => setScreen('tackle') }],
        speech: 'Bought. The ' + bought +
                (b.inHand ? ' is in your hands now - it is what you are fishing with. '
                          : ' is on your boat now. ') + (b.note || '') +
                ' That cost ' + (b.cost || 0) +
                ' dollars. You have ' + G.getSave().money + ' left.'
      };
    },

    /* ── The note, opened up. Everything about the job in one place. ───── */
    brief: () => {
      const b = G.missionBrief();
      const gearArt = (a) => a.src
        ? imgFb(a.src, 'gearArt', '<span class="gearEmoji">' + a.emoji + '</span>')
        : '<span class="gearEmoji">' + a.emoji + '</span>';

      /* WHOSE GEAR THIS IS. The panel shows what is in your hands, and said
         so nowhere - so a player still carrying the net from the first
         morning opened the note for "tag six shallow bay fish", read MESH
         HAND NET in large type at the top of it, and reasonably concluded the
         job wanted one. What the job wants is further down, under a warning
         triangle, and only when it wants something in particular. */
      let stats = '<div class="gearHead">' + ic('tacklebox') + ' What you are carrying</div>' +
        '<div class="gearRow">' +
        '<div class="gearCell">' +
          imgFb(b.rodArt, 'gearArt', '<span class="gearEmoji">' + ic('rod') + '</span>') +
          '<div class="gearName">' + b.rod.name + '</div>' +
          '<div class="gearNote">' + b.rod.reachNote + '</div>' +
        '</div>' +
        '<div class="gearCell">' + gearArt(b.baitArt) +
          '<div class="gearName">' + b.bait.name + '</div>' +
          '<div class="gearNote">On the line</div>' +
        '</div>' +
      '</div>';

      stats += '<div style="text-align:left;line-height:1.7;margin-top:12px">' +
        '' + ic('money') + ' <b>$' + b.money + '</b> in the tin' +
        (b.hold ? '<br>' + ic('creel') + ' <b>' + b.hold + '</b> to hand in at the counter' : '') +
        '<br>' + ic('fish') + ' ' + b.caught + ' tagged and released &bull; $' + b.earned + ' earned all told';
      if (b.grant) {
        stats += '<br>' + ic('buy') + ' Next from the shop: <b>' + b.grant.name + '</b> — $' + b.grant.cost +
                 (b.grantTaken ? ' <span style="opacity:.7">(got it)</span>'
                  : b.affordable ? ' <span style="opacity:.7">(you can buy it now)</span>'
                  : ' <span style="opacity:.7">(need $' + b.short + ' more)</span>');
      }
      /* The job was balanced around a rod you have not got. Say so - it is
         the difference between "this is hard" and "this is broken". */
      if (b.wantedRod) {
        stats += '<br>' + ic('warn') + ' Built for the <b>' + b.wantedRod.name + '</b>. ' +
                 'You can fish it with the ' + b.rod.name + ', but the big ones will ' +
                 'mostly shake the hook.';
      }
      if (b.wantedBait) {
        stats += '<br>' + ic('warn') + ' This job\'s lure is the <b>' + b.wantedBait.name +
                 '</b>. On the ' + b.bait.name + ' the fish it wants come along a good ' +
                 'deal slower.';
      }
      stats += '<br><br><span style="opacity:.85"><i>"' + b.tip + '"</i></span></div>';
      // What would make the next trip go better, in the words of the fish.
      const adv = G.gearAdvice();
      if (adv) {
        stats += '<div style="text-align:left;line-height:1.5;margin-top:10px;' +
                 'padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.07)">' +
                 '' + ic('tip') + ' ' + adv.text + '</div>';
      }

      /* NO MISSION UNTIL YOU HAVE ONE, here as well as on the board and in
         the corner of the screen: no number in the heading and no tally of a
         job nobody has given you. What you are carrying and what is in the
         tin stay - those are true whichever way. */
      const noJobYet = b.briefed === false;
      return {
        art: icon('clipboard', '' + ic('clipboard') + ''),
        title: noJobYet ? 'No Job Yet' : ('Mission ' + b.n),
        sub: '<b>' + b.text + '</b>' +
             (noJobYet ? ''
              : '<br>' + (b.done
                  ? '<span style="color:var(--good)"><b>Done — take it to the tackle shop.</b></span>'
                  : 'So far: <b>' + b.progress + '</b>')),
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
              label: '' + ic('rod') + ' Get the ' + b.nextGear.name + ' — $' + b.nextGear.cost,
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
        speech: (noJobYet ? b.text + '. '
                          : 'Mission ' + b.n + '. ' + b.text + '. ' +
                            (b.done ? 'That is done — take it to the tackle shop.'
                                    : b.progress + ' so far.')) +
                /* WITH NOTHING IN YOUR HANDS, say so plainly. The rod's name
                   before Walt hands the net over is the words "Nothing to
                   fish with", and "you are carrying the Nothing to fish with"
                   is not a sentence. */
                (b.rod.isNone || /nothing to fish with/i.test(b.rod.name)
                  ? ' You have nothing to fish with yet. ' + b.rod.reachNote
                  : ' You are carrying the ' + b.rod.name + '. ' + b.rod.reachNote) +
                (b.wantedRod ? ' This job was built for the ' + b.wantedRod.name +
                               ', so the big ones will mostly shake the hook.' : '') +
                (b.wantedBait ? ' Its lure is the ' + b.wantedBait.name +
                                ', and without it the fish it wants come slower.' : '') +
                ' Your bait is ' + b.bait.name + '.' +
                ' You have ' + b.money + ' dollars' +
                (b.hold ? ', and ' + b.hold + ' to hand in at the counter.' : '.') +
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
      if (o.netHaul) {
        /* A netful for the survey tank: how many, and of what. No inches, no
           pounds, no price - they are counted, not weighed or sold. */
        const h = o.haul || {};
        stats = '<div class="catchStat"><b>' + o.count + '</b> tiny fish for the survey tank</div>' +
                '<div class="catchStat">' + (h.minnow || 0) + ' minnows &nbsp;•&nbsp; ' + (h.shiner || 0) + ' shiners</div>';
      } else if (o.type === 'snap') {
        /* Not a lost fish - a lost RIG. Said plainly, with what to do about
           it, because being unable to cast and not knowing why is the worst
           minute this game could give anybody. */
        stats = '<div class="releaseBadge">' + ic('warn') + ' Hook and float, both gone</div>' +
                '<div class="releaseNote">The line came back bare. Nothing snagged, nothing broke ' +
                '\u2014 it was simply <b>taken</b>.<br>Walt will set you up again, free. ' +
                'Head back to the dock.</div>';
      } else if (o.netMiss) {
        stats = '<div class="releaseBadge">' + ic('warn') + ' ' + (o.tooDeep ? 'Too deep for a net' : 'Nothing in the net') + '</div>' +
                '<div class="releaseNote">Dip it where the water is knee-deep along the shore.</div>';
      } else if (o.type === 'fish') {
        /* WORTH SAYING ONLY WHEN IT IS WORTH SOMETHING. Fish are tagged and
           put back; the jobs are the wage. Printing "$0" on every single one
           was the game telling the player their morning was worthless. Walt's
           growth study pays a couple of dollars a tag on three common fish,
           and those are the ones that get a figure. */
        stats = '<div class="catchStat">' + o.length + ' inches &nbsp;•&nbsp; ' + o.weight + ' lbs</div>' +
                '<div class="catchStat">' + o.qualityLabel + ' catch' +
                (o.value > 0 ? ' &nbsp;•&nbsp; $' + o.value + ' for the tag' : '') + '</div>';
        // The best one you have ever had of this fish, said the moment it is.
        if (o.isBest) {
          stats += '<div class="catchNote"><b>' + ic('trophy') + ' Your biggest ' + o.name + ' yet' +
                   (o.beat ? ' &mdash; beats ' + o.beat + ' lbs' : '') + '</b></div>';
        }
      } else if (o.type === 'valuable') {
        stats = o.value > 0 ? '<div class="catchStat">Worth $' + o.value + '</div>'
                            : '<div class="catchStat">One for Walt\'s scrap pile</div>';
      } else if (o.gearMiss) {
        /* An empty hook, and one line about why. The only place in the game
           where the shop's purpose is obvious, so it says the rod and the fix
           and nothing else. */
        stats = '<div class="releaseBadge">' + ic('rod') + ' Too big for the ' + o.rodName + '</div>' +
                '<div class="releaseNote">The hook came back empty.' +
                (o.betterRod ? ' A <b>' + o.betterRod + '</b> would hold it \u2014 a job or two and it is yours.'
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
        stats += '<div class="countBadge done">' + ic('star') + ' That completes the job!</div>' +
                 '<div class="countBig">' + d.targetText + '</div>' + pipRow(d.pips);
      } else if (d.advanced) {
        stats += '<div class="countBadge">' + ic('done') + ' That one counts</div>' +
                 '<div class="countBig">' + d.targetText + '</div>' + pipRow(d.pips);
      }
      return {
        art: artOrEmoji(d.art, o.type === 'empty' ? '' + ic('hook') + '' : d.placeholder),
        title: o.name || 'Something',
        stats,
        items: [{ label: '' + ic('ok') + ' Ok', speech: 'Ok', action: dismissCatch }],
        speech: catchSpeech(o, d)
      };
    },

    dingusreveal: () => {
      const d = cardData || {};
      const o = d.outcome || {};
      return {
        art: artOrEmoji(d.art, '' + ic('fish') + ''),
        title: 'A Legend Surfaces',
        sub: 'The Largemouth Dingus.',
        stats: '<div class="catchStat">' + o.length + ' inches &nbsp;•&nbsp; ' + o.weight + ' lbs</div>' +
               '<div class="catchQuip">Every rumour in this lake, and it was just a fish.</div>',
        items: [{ label: '' + ic('trophy') + ' Continue', speech: 'Continue', action: dismissCatch }],
        speech: 'A legend surfaces. Largemouth Dingus! Twelve inches, five pounds, worth nothing at all.'
      };
    },

    /* ── The upgrade, handed over at the shop. ───────────────────────────── */
    grantreveal: () => {
      const g = (lastTurnIn && lastTurnIn.grant) || {};
      return {
        art: artOrEmoji(g.art, g.kind === 'rod' ? '' + ic('rod') + '' : '' + ic('bait') + ''),
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
        items: [{ label: '' + ic('ok') + ' Take It', speech: 'Take it', action: backToShop }],
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
        art: icon('trophy', '' + ic('trophy') + ''),
        title: 'Mission Complete!',
        sub: m ? m.text : 'Target reached',
        stats: '<div class="catchStat">That is the job done.</div>' +
               '<div class="catchStat">Turn it in at the tackle shop to start the next one — ' +
               'or stay out and keep fishing.</div>',
        items: [
          { label: '' + ic('anchor') + ' Back to the Tackle Shop', speech: 'Back to the tackle shop',
            action: headToDock },
          { label: '' + ic('rod') + ' Keep Fishing', speech: 'Keep fishing',
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
      /* WHAT YOU BROUGHT IN, first of all. A job about carrying three heavy
         pieces of iron across town used to go straight from its own title to
         Walt's reaction, and the iron - the entire job - was never mentioned.
         See haveTheParts() in game.js. */
      if (t.parts) stats += '<div class="needLine">' + t.parts + '</div>';
      // Walt's own words for the job done, before the arithmetic.
      if (t.mission && t.mission.say && t.mission.say.done) {
        stats += '<div class="needTip">"' + t.mission.say.done + '"</div>';
      }
      if (t.sold) {
        stats += '<div class="catchStat"><b>' + t.sold.count + '</b> tags and finds in the record</div>';
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
      /* HIS OWN VOICE ON THE JOB DONE. Every job has a recorded reaction to
         being finished, and this card read the same words out of `say.done`
         with no cue attached - so the system voice said them and the
         recording sat on the disk unplayed. The clip goes first and the
         arithmetic follows it. */
      const doneLine = (t.mission && t.mission.say && t.mission.say.done) || '';
      const doneSeq = (G.doneLines && t.mission) ? G.doneLines(t.mission) : [];
      const tail = (t.sold ? 'He paid ' + t.sold.total + ' dollars of bounty. ' : '') +
                   (t.bought ? 'The ' + t.bought.name + ' is in the boat. ' : '') +
                   (t.revealsSecret ? '' : (next ? 'Next up, ' + next.text : ''));
      return {
        art: icon('medal', '' + ic('medal') + ''),
        title: 'Mission ' + (t.mission ? t.mission.n : '') + ' complete',
        sub: t.mission ? t.mission.text : '',
        stats,
        items: [{ label: '▶ Continue', speech: 'Continue',
                  // Straight on to the rumour, when there is one.
                  action: t.revealsSecret ? () => setScreen('secretreveal') : afterTurnIn }],
        speech: (t.parts ? t.parts + ' ' : '') + (doneLine || ('Mission complete. ' + tail)),
        /* The whole reaction, in order, and the arithmetic after it - with
           what you set on the counter said first, in your own voice, because
           it is your own doing. */
        speechSeq: doneSeq.length
          ? (t.parts ? [{ text: t.parts }].concat(doneSeq) : doneSeq)
          : null,
        speechTail: doneLine ? tail : ''
      };
    },

    secretreveal: () => ({
      art: icon('pill', '' + ic('pill') + ''),
      title: 'Vitamin T',
      sub: "That's every fish in this lake. Every fish anyone's ever caught here, anyway.",
      stats: '<div class="catchQuip">There’s a rumour about one more.</div>',
      items: [{ label: '' + ic('think') + ' Take it', speech: 'Take it', action: openDock }],
      speech: "That's every fish in this lake. Every fish anyone's ever caught here, anyway. " +
              "There's a rumour about one more."
    }),

    /* The lake does not close. There is no next mission after the Dingus, and
       being parked forever on a job already finished would be a sour way to
       end a fishing game - so the boat stays available, with the best gear and
       the whole lake, and no target to chase. Starting over lives in Settings,
       where it is behind a confirmation and cannot be hit by accident. */
    /* ── THE MYSTERY IS SOLVED ───────────────────────────────────────────
       This card was the old game's ending, word for word - a legendary fish
       called the Largemouth Dingus that no longer exists - and it was being
       shown for the ringing of the Warden's bell.

       What it says now is what actually happened: a thirty-year-old sturgeon
       came up out of the trench and handed over a bell, the fog is off the
       water, the jam is gone, and there are two jobs left that are only
       possible because of it. It is a beginning as much as an ending, which
       is what a post-game should feel like. */
    finale: () => ({
      art: icon('crown', '' + ic('crown') + ''),
      title: 'The Mystery of Whispering Lake',
      sub: 'Solved. Barnaby is real, he has been guarding the sanctuary for thirty years — ' +
           'and he handed the Warden\'s bell to you.',
      stats: '<div class="catchQuip">Chief Junior Warden of Whispering Lake.</div>' +
             '<div class="catchStat">Something has happened out there. The fog has lifted, ' +
             'the log jam is pulled apart, and the deep water no longer chews up a hull ' +
             'just for being in it — the whole lake is open.</div>' +
             '<div class="catchNote">Walt is waiting at the counter. He reckons there are ' +
             '<b>ten fish out there that are in no book</b>, and <b>ten unique things on ' +
             'the bottom</b> for a heavy magnet. Nobody knows where any of them are.</div>',
      items: [
        { label: '' + ic('home') + ' Go and See Walt', speech: 'Go and see Walt',
          action: openDock },
        { label: '' + ic('settings') + ' Main Menu', speech: 'Main menu',
          action: () => { G.quitToMenu(); setScreen('title'); } }
      ],
      speech: 'The mystery of Whispering Lake is solved. Barnaby is real, he has been ' +
              'guarding the sanctuary for thirty years, and he handed the Warden\'s bell ' +
              'to you. You are Chief Junior Warden. The fog has lifted, the log jam is gone ' +
              'and the whole lake is open. Walt is at the counter with two more jobs: ten ' +
              'fish that are in no book, and ten unique things on the bottom for a heavy ' +
              'magnet. Go and see Walt, or head to the main menu.'
    }),

    /* -- The mission log. -------------------------------------------------
     *
     * A notebook, not a table. Only jobs up to the current one: a list of what
     * you have not been given is a spoiler and a longer scan both.
     *
     * Newest first, deliberately. Coming back after a few days the question is
     * "where was I", and the answer should be the first thing on the page
     * rather than the last.
     *
     * The whole log is `stats` rather than menu rows, because it is something
     * to READ. Scanning a hundred non-interactive lines to reach a Back button
     * would be the opposite of helpful; the switch user gets one row to leave
     * and the page is read out as a whole.
     */
    /* ── The mission log ──────────────────────────────────────────────────
     *
     * A notebook you can turn the pages of.
     *
     * The first version put the whole log in `stats` with one Back row, on the
     * reasoning that a hundred jobs read aloud in full is a punishment rather
     * than a log. True, but it was the wrong fix: scanning stops only on menu
     * rows, so moving the content out of them made the log unreachable by
     * switch entirely. The length problem belongs in what a row SAYS - one
     * line each while scanning, the full page only when you open it.
     *
     * Newest first, deliberately. Coming back after a few days the question is
     * "where was I", and that should be the first job you reach rather than
     * the last.
     */
    missions: () => {
      const L = G.missionLog();
      const sel = logSel === null ? null
                : (L.rows.filter(function (r) { return r.n === logSel; })[0] || null);

      /* ── The page ──────────────────────────────────────────────────────
         Either the summary or one job, never both: a page you turn TO is
         easier to hold in your head than a page you scroll through. */
      let s = '<div class="logSheet">';
      let speech;

      if (!sel) {
        s += '<div class="logHead">' +
               ic('clipboard') + ' <b>Job ' + L.current + '</b> of ' + L.total +
               ' &middot; ' + L.completed + ' done' +
               (L.earned ? ' &middot; ' + ic('money') + ' $' + L.earned +
                           ' earned all told' : '') +
             '</div>';

        if (L.story.length) {
          s += '<div class="logStory"><b>' + ic('logbook') + ' The story so far</b>';
          L.story.forEach(function (b) {
            s += '<div class="logStoryLine' + (b.kind === 'spine' ? ' spine' : '') + '">' +
                 (b.kind === 'piece' ? ic('star') + ' ' : '') + b.text + '</div>';
          });
          s += '</div>';
        }
        s += '<p class="note">Every job you have been given is below. ' +
             'Choose one to read it.</p>';

        speech = 'Mission log. You are on job ' + L.current + ' of ' + L.total + '. ' +
                 L.completed + (L.completed === 1 ? ' job' : ' jobs') + ' done. ' +
                 (L.earned ? L.earned + ' dollars earned all told. ' : '') +
                 (L.story.length ? 'The story so far is on the page. ' : '') +
                 'Scan down for each job.';
      } else {
        // One job, opened. Everything known about it, in reading order.
        s += '<div class="logPage">' +
               '<div class="logPageNum">' +
                 (sel.current ? ic('star') : ic('done')) +
                 ' Job ' + sel.n + ' of ' + L.total +
                 (sel.current ? ' <span class="logNow">you are here</span>'
                              : ' <span class="logDone">done</span>') +
               '</div>' +
               '<div class="logPageTitle">' + sel.text + '</div>';

        if (sel.where) s += '<div class="logPageLine">' + ic('map') +
                            ' Water: <b>' + sel.where + '</b></div>';
        if (sel.rod)   s += '<div class="logPageLine">' + ic('rod') +
                            ' Rod: <b>' + sel.rod + '</b>' +
                            (sel.bait ? ' &middot; ' + sel.bait : '') + '</div>';
        if (sel.grant) s += '<div class="logPageLine">' + ic('buy') +
                            ' Paid out: <b>' + sel.grant + '</b></div>';
        s += '</div>';

        speech = 'Job ' + sel.n + ' of ' + L.total + '. ' + stripTags(sel.text) + '. ' +
                 (sel.where ? 'In the ' + sel.where + '. ' : '') +
                 (sel.rod ? 'With the ' + sel.rod +
                            (sel.bait ? ' and ' + sel.bait : '') + '. ' : '') +
                 (sel.grant ? 'It paid out the ' + sel.grant + '. ' : '') +
                 (sel.current ? 'This is the job you are on now.' : 'Finished.');
      }
      s += '</div>';

      /* ── The rows ──────────────────────────────────────────────────────
         The summary first, then every job newest first, then out. Opening a
         page is a re-render of this same screen, so the scan lands back on
         the list and can carry straight on to the next job. */
      const items = [{
        label: ic('clipboard') + ' Summary' +
               (sel ? '' : ' <span class="logOpen">open</span>'),
        speech: 'Summary',
        action: function () { logSel = null; setScreen('missions'); }
      }];

      /* TEN AT A TIME. By the end of the game the log is thirty-five jobs,
         which is twelve hundred pixels of a seven-hundred-pixel screen: two
         columns and shrinking both help and neither is enough at a size
         anybody can read. So it turns pages, and the page it opens on is the
         page with your own job on it. */
      const PAGE = 10;
      const pages = Math.max(1, Math.ceil(L.rows.length / PAGE));
      if (logPage === null) {
        const at = L.rows.findIndex(function (r) { return r.current; });
        logPage = at < 0 ? 0 : Math.floor(at / PAGE);
      }
      logPage = Math.max(0, Math.min(pages - 1, logPage));
      const from = logPage * PAGE;
      const page = L.rows.slice(from, from + PAGE);

      if (logPage > 0) {
        items.push({ label: '\u25b2 Later jobs', value: 'page ' + logPage + ' of ' + pages,
                     speech: 'The later jobs, page ' + logPage + ' of ' + pages,
                     action: function () { logPage--; setScreen('missions'); } });
      }

      page.forEach(function (r) {
        const open = sel && sel.n === r.n;
        items.push({
          label: (r.current ? ic('star') : ic('done')) +
                 ' <b>' + r.n + '.</b> ' + r.text +
                 (r.current ? ' <span class="logNow">now</span>' : '') +
                 (open ? ' <span class="logOpen">open</span>' : ''),
          /* One line while scanning. The full page is only read out when the
             job is actually opened. */
          speech: 'Job ' + r.n + '. ' + stripTags(r.text) + '. ' +
                  (r.current ? 'The one you are on.' : 'Done.'),
          action: function () { logSel = r.n; setScreen('missions'); }
        });
      });

      if (logPage < pages - 1) {
        items.push({ label: '\u25bc Earlier jobs', value: 'page ' + (logPage + 2) + ' of ' + pages,
                     speech: 'The earlier jobs, page ' + (logPage + 2) + ' of ' + pages,
                     action: function () { logPage++; setScreen('missions'); } });
      }

      items.push({ label: '\u2190 Back', speech: 'Back', action: closeMissionLog });

      return {
        art: icon('clipboard', ''),
        title: 'Mission Log',
        sub: L.completed === 0 ? 'Just getting started'
             : L.completed + (L.completed === 1 ? ' job done' : ' jobs done'),
        stats: s,
        items: items,
        speech: speech
      };
    },

    /* OPTIONS - the same card wherever it is opened from.
       It was Pause, and it only existed out on the water. On the dock and in
       the shop there was no way to the settings, the log or the map at all,
       which on a scanning rig meant leaving the game to change the scan. */
    pause: () => ({
      art: '\u2699',
      title: 'Options',
      // Nothing focused to begin with: releasing the switch that opened this
      // must not instantly pick a row.
      startIndex: -1,
      items: (function () {
        const rows = [];
        rows.push({ label: '\u25b6 ' + (G.run ? 'Continue' : 'Back'),
                    speech: G.run ? 'Continue' : 'Back', action: resumeGame });
        /* The map, once Walt has given you one. It is the first thing under
           Continue because it is the thing you open Options for mid-trip. */
        if (G.hasMap && G.hasMap()) {
          rows.push({ label: '' + ic('map') + ' Map of the Lake',
                      speech: 'The map of the lake. Where you are, and what everything is called.',
                      action: openMap });
        }
        rows.push({ label: '' + ic('clipboard') + ' Mission Log', speech: 'Mission log',
                    action: () => openMissionLog('pause') });
        rows.push({ label: '' + ic('settings') + ' Settings', speech: 'Settings',
                    action: () => { settingsReturn = 'pause'; setScreen('settings'); } });
        // Only worth offering when there is a trip to come in from.
        if (G.run) {
          rows.push({ label: '' + ic('anchor') + ' Return to the Dock', speech: 'Return to the dock',
                      action: () => { pausedWorld = null; headToDock(); } });
        }
        rows.push({ label: '' + ic('home') + ' Main Menu', speech: 'Main menu',
                    action: () => { pausedWorld = null; G.quitToMenu(); setScreen('title'); } });
        rows.push({ label: '' + ic('lifering') + ' Help', speech: 'Help',
                    action: () => U.speak('I need help') });
        return rows;
      })(),
      speech: 'Options. ' + (G.run ? 'Continue' : 'Back') +
              ((G.hasMap && G.hasMap()) ? ', the map of the lake' : '') +
              ', the mission log, settings' + (G.run ? ', return to the dock' : '') +
              ', main menu, or help.'
    })
  };

  /* Settings is reachable from the title screen and now from Options, which
     can be opened mid-trip - so backing out of it has to land where it was
     opened from. It used to always go to the title screen, which from a trip
     would have thrown the trip away. */
  let settingsReturn = 'title';

  /* The log is reachable from the shop counter and from the Options menu, so
     it has to know which one to return to. */
  let logReturn = 'keeper';

  /* Which tray of the tackle box is open: 'rod', 'bait' or 'tool'. */
  let kitTray = 'rod';
  /* Which page of the log is showing, or null to work it out from the job you
     are on. Reset on the way in with logSel. */
  let logPage = null;

  /* Which job's page is open, or null for the summary. Reset on the way in:
     the log should always open on "where was I", never on whichever page was
     left showing several sessions ago. */
  let logSel = null;
  function openMissionLog(from) {
    logReturn = from || 'keeper';
    logSel = null;
    logPage = null;
    setScreen('missions');
  }
  function closeMissionLog() {
    if (logReturn === 'pause') { setScreen('pause'); return; }
    setScreen(logReturn);
  }

  function artOrEmoji(src, emoji) {
    if (!src) return '<div class="catchArtPlaceholder">' + (emoji || '' + ic('fish') + '') + '</div>';
    return imgFb(src, 'catchArt', '<div class="catchArtPlaceholder">' + (emoji || '' + ic('fish') + '') + '</div>');
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
    /* THE ONE ARTICLE RULE, which lives in game.js because the announcement
       out on the water needs it too. This had its own copy and so kept its
       own bug: the net haul is named "5 tiny fish", and a count takes no
       article at all - "Just a 5 tiny fish". */
    const art = G.articleFor(o.name);
    const a = art || '';
    const the = a ? a + ' ' : '';
    let s;
    if (o.type === 'fish' && o.netHaul) {
      /* A NETFUL, said the way it looks: how many, of what. It went through
         the rod's sentence and came out "6 tiny fish! null inches, 0.4
         pounds, Netful catch" - a net has no length to report and its
         pounds are not the point. */
      const h = o.haul || {};
      const parts = [];
      if (h.minnow) parts.push(h.minnow + (h.minnow === 1 ? ' minnow' : ' minnows'));
      if (h.shiner) parts.push(h.shiner + (h.shiner === 1 ? ' shiner' : ' shiners'));
      s = (o.count || '') + ' tiny fish for the survey tank' +
          (parts.length ? ' - ' + parts.join(' and ') + '.' : '.');
    } else if (o.type === 'fish') {
      s = 'Caught ' + the + o.name + '! ' + o.length + ' inches, ' + o.weight +
          ' pounds. ' + o.qualityLabel + ' catch' +
          (o.value > 0 ? ', worth ' + o.value + ' dollars for the tag.' : ', tagged and back it goes.');
    } else if (o.type === 'valuable') {
      s = 'Reeled in ' + the + o.name +
          (o.value > 0 ? ', worth ' + o.value + ' dollars.' : ', one for Walt\'s scrap pile.');
    } else if (o.gearMiss) {
      s = 'Something big took it and came off. The hook came back empty \u2014 too much for the ' +
          o.rodName + '.' + (o.betterRod ? ' A ' + o.betterRod + ' would hold it.' : '');
    } else {
      s = 'Just ' + the + o.name + '.';
    }
    /* The joke on the card, said out loud.
     *
     * "Someone's having a rough week" is the whole reason a soggy wallet is
     * in this game, and it was print-only - which is to say it did not exist
     * for the player it was written for. */
    /* Not on a gear miss: "the lake fought back with vegetation" is a joke
       about a weed, and this was a fish that got away with your bait. */
    if (d.quip && !o.gearMiss) s += ' ' + d.quip;
    /* A RECORD, SAID OUT LOUD. This was on the card in print and nowhere in
       the speech, which is to say it did not exist for anybody listening -
       and it was the one thing the line at the rail said that this did not,
       so it has to be here before that line can go. */
    if (o.isBest && o.type === 'fish') {
      s += ' Your biggest ' + o.name + ' yet' +
           (o.beat ? ', beating ' + o.beat + ' pounds.' : '.');
    }
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
    /* WHAT IS IN THE BOAT, CHECKED AT THE SLIP. Taking the wrong kit is
       allowed - you can fish anywhere with anything - but leaving without
       knowing is not the same choice, and rowing out to a magnet job with a
       lure on the line wastes a trip. */
    const kc = G.kitCheck && G.kitCheck();
    if (!skipGearCheck && kc && !kc.ok) { setScreen('gearcheck'); return; }
    if (!skipGearCheck && (b.wantedRod || b.wantedBait)) {
      setScreen('gearcheck');
      return;
    }
    skipGearCheck = false;
    stopAutoScan(); clearKeys();
    AU.resume();
    // The run has to exist before the overlay comes down: showOverlay() reads
    // `G.run` to decide whether the HUD and side panels are live.
    if (G.castOff() === false || !G.run) {
      /* Refused - nothing to fish with, or Walt not yet seen. Never a dead
         end: say why, and put the dock's scan straight back up so the shop is
         the next thing highlighted. */
      const why = !G.isBriefed() ? 'Go inside the tackle shop first. Walt has a job for you.'
                                 : 'You have nothing to fish with yet. Walt has a net.';
      U.speak(why);
      showOverlay(false);
      enterWorld('dock', () => indexOfKey('shop'));
      return;
    }
    AU.startWater(); AU.motorUp();
    showOverlay(false);
  }

  /** Done here: put the tackle down and walk back up to the dock. */
  function goInFromSpot() {
    AU.stopWater(); AU.stopMotor();
    G.returnToDock();
    openDock();
  }

  function goFishingAnyway() {
    skipGearCheck = true;
    castOff();
  }

  let lastSale = null;
  let lastBeat = null;

  /** Take Walt up on the thing the job was about. */
  function doTakeOffer() {
    const got = G.takeOffer();
    if (!got) { AU.menuBlocked(); return; }
    lastBuy = got;
    AU.menuSelect();
    setScreen('bought');
  }

  /* Walt's briefing, one turn at a time: his line, your answer, his next
     line. `beatSteps` is the whole conversation and `beatIx` is where we are;
     the last turn is where the job is actually taken. */
  let beatSteps = [], beatIx = 0;

  /** Hear Walt out - the brief, a beat, the bell. */
  function doCounterBeat() {
    const cb = G.counterBeat && G.counterBeat();
    if (!cb || cb.done) { AU.menuBlocked(); setScreen('keeper'); return; }
    AU.menuSelect();
    if (cb.kind === 'brief') {
      beatSteps = G.briefSteps(G.currentMission());
      beatIx = 0;
      lastBeat = null;
      setScreen('waltsays');
      return;
    }
    // A story beat or the bell: one thing said, one thing done.
    beatSteps = [];
    lastBeat = G.takeCounterBeat();
    setScreen('waltsays');
  }

  /** Your answer - and on the last turn, taking the job. */
  function advanceBeat() {
    const step = beatSteps[beatIx];
    AU.menuSelect();
    if (!step || step.last) {
      /* Taking the job is what ends the conversation - and on the first
         morning it is where the net changes hands. */
      lastBeat = G.takeCounterBeat();
      beatSteps = [];
      if (lastBeat && (lastBeat.gave || []).length) { setScreen('waltgives'); return; }
      setScreen('keeper');
      return;
    }
    beatIx++;
    setScreen('waltsays');
  }

  /**
   * Straight on to the next job.
   *
   * Handing one in used to drop you at the dock, so the next job meant walking
   * back into the shop to be told about it, and again to buy what it needs.
   * Walt is standing right there: he takes the job, tells you the next one and
   * puts what it needs on the counter, all in the one visit.
   */
  function afterTurnIn() {
    const cb = G.counterBeat && G.counterBeat();
    if (cb && !cb.done) { doCounterBeat(); return; }
    if (nextBuyable()) { setScreen('tackle'); return; }
    openDock();
  }

  /** The one thing the new job wants that is on the shelf and affordable. */
  function nextBuyable() {
    const money = G.getSave().money;
    const list = [G.nextRod && G.nextRod(), G.nextVessel && G.nextVessel(), G.nextTool && G.nextTool()];
    return list.find(x => x && money >= x.cost) || null;
  }

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

  /** A vessel, or a tool, off the counter. Same card as any other purchase. */
  function doBuyVessel(id) {
    const got = G.buyVessel(id);
    if (!got) { AU.menuBlocked(); return; }
    lastBuy = got;
    AU.menuSelect();
    setScreen('bought');
  }
  function doBuyTool(id) {
    const got = G.buyTool(id);
    if (!got) { AU.menuBlocked(); return; }
    lastBuy = got;
    AU.menuSelect();
    setScreen('bought');
  }

  function doBuyFuel(amount) {
    const got = G.buyFuel(amount);
    if (!got) { AU.menuBlocked(); return; }
    lastBuy = got;
    AU.menuSelect();
    setScreen('bought');
  }

  function doBuyRepair(amount) {
    const got = G.buyRepair(amount);
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

  /**
   * Open Options.
   *
   * From anywhere: out on the water it pauses the trip first, on the dock or
   * in the shop it simply opens over the scene and puts the scan back exactly
   * where it was on the way out. It used to refuse unless a trip was running,
   * which is why the dock and the shop had no settings.
   */
  function openPause(back) {
    if (overlayOn || mapOn) return;
    /* WHERE THE SCAN COMES BACK TO. Opening Options by tapping its button
       leaves the highlight whereever it happened to be - and if that was the
       moored canoe, closing Options put the highlight back on the canoe and
       the player's next press took them out on the water. Coming back from
       Options lands on Options: the one row where another press does nothing
       worse than open it again. */
    const here = worldOn
      ? { place: worldPlace,
          index: (function () {
            const k = worldItems.findIndex(it => it.key === 'options');
            return k >= 0 ? k : worldIndex;
          })() }
      : null;
    pausedWorld = back || here;
    if (G.run) { G.pause(); AU.stopReelLoop(); }
    // setScreen -> showOverlay swallows the still-held switch for us.
    setScreen('pause');
  }

  function resumeGame() {
    clearKeys();
    if (G.run) G.resume();
    if (pausedWorld) {
      const pw = pausedWorld;
      pausedWorld = null;
      enterWorld(pw.place, () => pw.index);   // re-enters and hides the overlay
      return;
    }
    showOverlay(false);
    U.speak('Back to it');
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE MAP OF THE LAKE

     Walt's map, opened from Options. It covers the screen - a chart you have
     to squint at is no map at all - and there is exactly one thing on it to
     press: Close, bottom right, wearing the focus ring from the moment it
     opens. One switch closes it; two switches step onto the same single
     choice and press it. Escape closes it too, for anybody on a keyboard.
     ══════════════════════════════════════════════════════════════════════ */

  let mapOn = false, mapFrom = null, mapTimer = null;

  function paintMap() {
    const st = G.mapState && G.mapState();
    const cv = $('mapCanvas');
    if (!st || !cv) return;
    /* Drawn at the screen's own pixels, so the lettering is sharp on a phone
       and on a television alike. */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.round(cv.clientWidth * dpr));
    const h = Math.max(240, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    RT.minimap.drawMap(cv, st.chart, { x: st.x, z: st.z, head: st.head, label: st.label },
                       st.quest || null);
    $('mapName').textContent = (st.chart && st.chart.name) || 'The Lake';
  }

  function openMap() {
    if (mapOn) return;
    mapFrom = screen;
    mapOn = true;
    showOverlay(false);
    $('mapView').classList.add('on');
    $('mapView').setAttribute('aria-hidden', 'false');
    $('mapClose').classList.add('focused');
    paintMap();
    /* Kept up to date while it is open. Nothing moves while the game is
       paused, but the map can also be opened from the dock, and a window
       resized under it must not leave a stretched chart. */
    mapTimer = setInterval(paintMap, 400);
    const st = G.mapState && G.mapState();
    U.speak('The map of Whispering Lake. ' + ((st && st.label) || 'You are here') +
            '. Press to close the map.');
  }

  function closeMap() {
    if (!mapOn) return;
    mapOn = false;
    clearInterval(mapTimer); mapTimer = null;
    $('mapView').classList.remove('on');
    $('mapView').setAttribute('aria-hidden', 'true');
    clearKeys();
    setScreen(mapFrom || 'pause');
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
    /* NO MISSION UNTIL YOU HAVE ONE. A brand new game opened on "Mission 1"
       and its objective before the player had so much as walked into the
       shop - a job they had not been given, counting progress they could not
       make. Reported: "you shouldn't see the mission summary unless you
       actually have the mission." Until Walt has briefed you there is one
       line on the screen and it is where to go. */
    const noJobYet = h.briefed === false;
    if ($('hudMission')) $('hudMission').hidden = noJobYet;
    // Free roam has no mission number to show - and 'Mission 0' would be worse
    // than saying nothing at all.
    $('hudMission').textContent = h.free ? 'Free Fishing'
      : h.finale ? 'The Last Fish' : ('Mission ' + h.missionN);
    /* innerHTML, NOT textContent. A finished target ends in a painted tick,
       which is an <img> tag - and textContent prints markup rather than
       parsing it, so the panel showed the whole tag as words. On a green
       ground, being the finished colour: a green box with what looks for
       all the world like an error code in it. Every string in here is the
       game's own; none of it comes from anywhere a player can type. */
    $('hudTarget').innerHTML = noJobYet ? 'Go and see Walt in the tackle shop' : h.target;
    $('hudTarget').classList.toggle('done', h.targetDone && !noJobYet);
    /* The rod, with its own painting where there is one - the same small
       icons the note at the dock uses, so the two read as one thing seen from
       two places. */
    $('hudRod').innerHTML =
      (h.rodArt ? '<img class="hudKitArt" src="' + h.rodArt + '" alt="" ' +
                  'onerror="this.style.display=\'none\'">'
                : ic(h.rodIsNet ? 'creel' : 'rod')) + ' ' + h.rodName;
    /* AND WHAT IS ON THE LINE. The helm said which rod and which boat and
       never once what was tied to the end of it, which is the difference
       between a magnet job and a fishing job. */
    const lineEl = $('hudLine');
    if (lineEl) {
      lineEl.innerHTML = h.lineName
        ? (h.lineIsTool ? toolIc(h.lineToolId)
                        : (G.baitIconFor ? G.baitIconFor(h.lineBaitId) : ic('bait'))) +
          ' ' + h.lineName
        : '';
      lineEl.style.display = h.lineName ? '' : 'none';
    }
    /* What you are in, and what is in the logbook waiting for Walt. Tags are
       the money in this game, so they get the slot the hold used to have. */
    if ($('hudVessel')) $('hudVessel').textContent = h.vesselName || '';
    /* FUEL AND HULL, in the words the shop uses for them - Half, Low, Worn,
       Rough - because a word can be read out and a bar cannot. The colour is
       a third channel on top of the word, never instead of it. */
    const boatEl = $('hudBoat');
    if (boatEl) {
      const b = h.boat;
      if (!b) boatEl.style.display = 'none';
      else {
        /* A quarter at a time: full is green, and it steps down through
           yellow and orange to red as the bar shortens. */
        const gauge = function (label, frac) {
          const pct = Math.max(0, Math.min(1, frac));
          const q = pct > 0.75 ? 'q4' : pct > 0.5 ? 'q3' : pct > 0.25 ? 'q2' : 'q1';
          return '<span class="gauge ' + q + '">' + label +
                 '<span class="bar"><i style="width:' + (pct * 100).toFixed(0) + '%"></i></span></span>';
        };
        const bits = [];
        if (b.fuel !== null) bits.push(gauge('Fuel', b.fuel));
        if (b.hull !== null) bits.push(gauge('Hull', b.hull));
        boatEl.innerHTML = bits.join('');
        boatEl.style.display = bits.length ? '' : 'none';
        /* AND THE WORDS, for anybody listening rather than looking. A bar is
           unreadable to a screen reader and a colour is unreadable to plenty
           of people; the label carries the same fact in English. */
        boatEl.setAttribute('aria-label',
          (b.fuelWord ? 'Fuel ' + b.fuelWord + '. ' : '') +
          (b.hullWord ? 'Hull ' + b.hullWord + '.' : ''));
      }
    }
    if ($('hudTags')) {
      $('hudTags').textContent = h.tags ? h.tags + (h.tags === 1 ? ' tag to log' : ' tags to log') : '';
      $('hudTags').style.display = h.tags ? '' : 'none';
    }
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
  /**
   * The arrow that points at the job: the same fact as the words under it and
   * the chart in the corner, for whoever reads which.
   */
  function onGuide(g) {
    const el = $('guide');
    if (!el) return;
    if (!g) { el.classList.remove('on'); return; }
    el.classList.add('on');
    /* WITH ITS HAND ON THE TILLER, the badge says so. A boat that turns by
       itself and never explains why is a fault as far as the player is
       concerned - and this one is played by people who may be listening
       rather than watching. */
    el.classList.toggle('steering', !!g.steering);
    $('guideArrow').style.transform = 'rotate(' + (g.angle * 180 / Math.PI) + 'deg)';
    /* The engine works the yards out. `dist / 3` here read a world unit as a
       foot, and a unit is 0.61 of one, so every range on screen was short by a
       factor of one and two thirds: the "184 yards" a player was told about
       was three hundred. */
    $('guideText').innerHTML = g.label + '<small>' +
      (g.steering ? 'quest helper steering'
                  : g.ahead ? 'dead ahead'
                  : (g.behind ? 'behind you' : 'to your ' + g.side)) + ' &middot; ' +
      (g.yards !== undefined ? g.yards : Math.round(g.dist / 1.83)) + ' yards</small>';
  }

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
    /* The picture of what is down there: a fish, or - at a marked salvage
       spot - the thing you are there to hook out of the mud. The card only
       knew how to draw fish, so a job about a snapped propeller showed a
       largemouth bass. */
    const key = String(data.art || data.fishId);
    if (el.dataset.fish !== key) {
      el.dataset.fish = key;
      const img = el.querySelector('.spotFish');
      img.onerror = () => { img.style.display = 'none'; };
      img.style.display = '';
      /* AND A PLACE HAS NO FISH. The job's own marked spots carry item art
         instead, and the centre fog carries neither - so this asked the
         server for images/fish/null.png every time one came up. Nothing
         broke; it just went and fetched a 404 to hide it. */
      if (data.art) img.src = data.art;
      else if (data.fishId) img.src = 'images/fish/' + data.fishId + '.png';
      else { img.removeAttribute('src'); img.style.display = 'none'; }
      el.querySelector('.spotName').textContent = data.fishName;
    }
    el.style.setProperty('--spotcol', data.color);
    el.style.setProperty('--enter', enterFrac.toFixed(3));
    /* "Fish spotted" over a heap of scrap on the bottom is the game telling
       the player something that is not true. A magnet spot says what it is. */
    el.querySelector('.spotWord').textContent =
      !data.inRange ? 'Too far out'
      : data.magnetSpot ? 'Salvage down there!'
      : 'Fish spotted!';
    /* Say so, for whoever is using a finger: the card is the pull-over. */
    let tap = el.querySelector('.spotTap');
    if (!tap) { tap = document.createElement('span'); tap.className = 'spotTap'; el.appendChild(tap); }
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
      /* WITH A MAGNET ON, none of this is about fish. What the job wants is a
         lump of iron in the mud, and "your fish!" over a salvage marker is
         the game reading out a variable instead of saying what is going on. */
      const mag = !!(G.magnetOn && G.magnetOn());
      $('pullInText').textContent = mag ? 'Pulling in to drag the bottom' : 'Pulling in to fish';
      $('pullInWho').textContent = who
        ? (who.name + (who.isTarget ? (mag ? ' — the one you want!' : ' — your fish!') : ''))
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
    /* Over fish the meter eases off and chimes (ZONE_SLOW in game.js), so it
       is marked here too: one state, said three ways - slower, gold, and a
       tone. */
    el.classList.toggle('inZone', !!(c.onShoal || c.isTarget));
    $('chargeBar').style.width = c.power.toFixed(0) + '%';
    /* GREEN IS THE WATER YOU CAME FOR - the spot you pulled over onto, or the
       job's own fish. It used to be the job's species alone, so a player who
       had stopped on a shoal, aimed at it and held the meter got a voice
       saying "on the fish, let go", a meter easing off to agree, and a colour
       that stayed amber. Three channels, two answers. */
    /* NOTHING WITH FINS TAKES A MAGNET. With one on the line this said "ON
       YOUR FISH" over a lump of iron in the mud - the banner reading out a
       variable instead of saying what is going on, and the same fault the
       pull-in card and the spoken line had already been fixed for. What is
       "yours" with a magnet down is the SPOT, never a shoal. */
    const mag = !!(G.magnetOn && G.magnetOn());
    const yours = mag ? !!c.onSpot : !!(c.isTarget || c.onSpot);
    $('chargeLabel').textContent = c.onShoal
      ? (mag ? (yours ? 'OVER THE SALVAGE — ' + c.distance + ' ft'
                      : 'OVER THE BOTTOM — ' + c.distance + ' ft')
             : yours ? 'ON YOUR FISH — ' + c.distance + ' ft'
                     : 'ON THE ' + String(c.shoalName || 'FISH').toUpperCase())
      : (mag ? 'OPEN BOTTOM — ' : 'OPEN WATER — ') + c.distance + ' ft';
    el.classList.toggle('good', !!c.onShoal);
    el.classList.toggle('best', yours);
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
      worldNote = d.note || '';
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
    if (Date.now() - worldSince < POINTER_SETTLE_MS) return;
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
    /* STEERING IS A HELD THING. This fired on any movement over the window,
       held or not, so a mouse crossing the screen put a number in the rudder -
       and a rudder with a number in it is somebody steering, which stood the
       quest helper down. The click that appeared to START the helper was
       clearing the rudder on the way up. */
    if (st === S.STEER && !pointerHeld) return;
    if (e.cancelable) e.preventDefault();
    AU.resume();
    if (st === S.STEER) G.setLateralTarget(fracFromClientX(e.clientX));
    else G.setAimFrac(fracFromClientX(e.clientX));
  }

  function onPointerDown(e) {
    if (worldOn) {
      // A scene that has only just appeared is not taking clicks yet.
      if (Date.now() - worldSince < POINTER_SETTLE_MS) return;
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
    /* Reeling - a fish on, or an empty line coming home - answers to EITHER
       switch, in either scheme.
     *
     * It used to ignore Space on one switch, where Space has no other job in
     * play at all, so a player who reached for it got nothing and had to work
     * out why. There is nothing else to press here: whatever is under the
     * hand should wind the reel. */
    if (st === S.REELING) { G.setReelHold(keyDown.Enter || keyDown.Space); return; }
    /* Line out with nothing on it: holding winds it back toward the boat, and
       letting go stops it there. The same hold as playing a fish, because it
       is the same handle. */
    if (st === S.WAITING) { G.setReelHold(keyDown.Enter || keyDown.Space); return; }
  }

  function onKeyDown(e) {
    if (mapOn) {
      if (e.code === 'Escape') { closeMap(); return; }
      if (!isSwitchKey(e.code)) return;
      e.preventDefault();
      return;                    // resolved on release, like everything else
    }
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

    if (ctx() === 'world') {
      // Hold Space to scan backwards, exactly as a menu does. Two switches
      // only — on one switch Space is unused and auto-scan does the stepping.
      if (k === 'Space' && !isOneSwitch() && !backHoldTimer && !backRepeatTimer) {
        didBackHold = false;
        backHoldTimer = setTimeout(() => {
          backHoldTimer = null;
          didBackHold = true;
          stopWorldScan();
          worldStep(-1);
          const s = U.sm();
          backRepeatTimer = setInterval(() => worldStep(-1), s ? s.getScanInterval() : SCAN_BACK_REPEAT);
        }, SCAN_BACK_HOLD);
      }
      return;      // otherwise resolved on release
    }

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
    /* One thing on the map to choose, so a step and a press come to the same
       thing: Space scans onto Close, which is already where the scan is, and
       Enter closes. Neither can leave somebody stuck looking at a map. */
    if (mapOn) {
      const k2 = normKey(e.code);
      keyDown[k2] = false;
      $('mapClose').classList.add('focused');
      if (k2 === 'Space' && !isOneSwitch()) { U.speak('Close map'); return; }
      AU.menuSelect();
      closeMap();
      return;
    }
    const k = normKey(e.code);
    if (ignoreUntilRelease[k]) { ignoreUntilRelease[k] = false; return; }
    if (!keyDown[k]) return;
    const dur = Date.now() - keyDownAt[k];
    keyDown[k] = false;

    if (ctx() === 'world') {
      // Two switches: Space steps, Enter picks. One switch: auto-scan does the
      // stepping and the single press picks, exactly as in a menu.
      if (k === 'Space' && !isOneSwitch()) {
        // A held Space that had begun scanning backwards ends here: drop the
        // timers, resume the forward auto-scan, and swallow this release so it
        // is not also read as a forward step.
        clearTimeout(backHoldTimer); backHoldTimer = null;
        clearInterval(backRepeatTimer); backRepeatTimer = null;
        if (didBackHold) { didBackHold = false; startWorldScan(); return; }
        worldStep(1);
      } else {
        worldActivate();
      }
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
    if (ctx() === 'world') {
      // A cancelled (too-short) press in the world resolves the same way a
      // real release would, unless it was the tail of a backward scan.
      if (e && e.detail && e.detail.reason === 'too-short' && !wasBackScanning) {
        if (k === 'Space' && !isOneSwitch()) worldStep(1);
        else worldActivate();
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
    /* A little breathing room, and never off the paper. The frame's corner
       brackets stick six pixels OUTSIDE it, so a thing near the edge of the
       screen - the mission note lives ten pixels from the top - had its top
       brackets drawn at minus five and cut clean off. The frame is kept
       inside the viewport by that much, shrinking rather than sliding, so it
       still surrounds the thing it is pointing at. */
    const PAD = 10;
    const ARM = 8;
    const W = window.innerWidth, H = window.innerHeight;
    let x = r.x - PAD, y = r.y - PAD, w = r.w + PAD * 2, h = r.h + PAD * 2;
    if (x < ARM) { w -= (ARM - x); x = ARM; }
    if (y < ARM) { h -= (ARM - y); y = ARM; }
    if (x + w > W - ARM) w = Math.max(24, W - ARM - x);
    if (y + h > H - ARM) h = Math.max(24, H - ARM - y);
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.width  = w + 'px';
    el.style.height = h + 'px';
    el.classList.add('on');
  }

  const TC = ['tcAimL', 'tcAimR', 'tcCast', 'tcHook', 'tcReel', 'tcReelIn', 'tcTroll', 'tcDock'];

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
    press('tcDock', () => {}, () => { goInFromSpot(); });
  }

  /** Show only the buttons that mean something right now. */
  function syncTouchControls() {
    const on = {};
    // At a spot the world scan owns tcTroll (it is a scan stop there), but it
    // still has to be VISIBLE, so the spot state is allowed through.
    if (!overlayOn && G.run && (!worldOn || G.state === G.S.SPOT)) {
      const st = G.state, S = G.S;
      // On foot there is no trolling: the same button casts again from the boards.
      const netNow = !!(G.missionBrief().rod || {}).isNet;
      if ($('tcTroll')) $('tcTroll').textContent = (G.vessel && G.vessel().id === 'foot') ? (netNow ? 'Scoop again' : 'Cast again') : 'Troll on';
      if ($('tcCast')) $('tcCast').textContent = (G.missionBrief().rod || {}).isNet ? 'Scoop the net' : 'Hold to cast';
      // Off the boards, the way back up the jetty sits beside the cast.
      const onFoot = !!(G.vessel && G.vessel().id === 'foot');
      /* THE BUTTONS MIRROR THE SCAN'S OWN ROWS. This said `on.tcDock = onFoot`,
         so in a boat the way back to the dock was never a button - and with a
         bare line, where casting is refused, that left "Troll on" as the only
         thing on screen that did anything. Reported: "when the line is bare it
         doesn't give me an option to go back to the dock; I can get back by
         clicking Options but it should give me an option on the screen."
         The scan has always offered the row (see spotTargets, which puts
         "Back to the Dock" first the moment the tackle goes); the buttons were
         a second, quietly different copy of the rule. Now they are the same
         rule: whatever the scan offers, there is a button for. */
      if (st === S.SPOT) {
        on.tcTroll = true;
        const rows = (G.spotTargets ? G.spotTargets() : []) || [];
        on.tcDock = onFoot || rows.some(function (t) { return t.key === 'dock'; });
      }
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
    /* WHILE TROLLING, AND ONLY THEN. The bars sit at the bottom of the screen
       - which is where Walt's own recorded line about the hull says to look -
       and that is also where the rod, the float and the whole business of
       fishing happens. So they are up while you are driving, which is when
       the tank and the hull are actually being spent, and gone the moment you
       pull over to fish.

       Decided HERE, once a frame, rather than in onHud: the boat's state is
       set in sixteen places and the HUD is only told about some of them, so a
       rule about the state written into the event handler would leave the bars
       lingering over a cast or missing while trolling. */
    const boatBars = $('hudBoat');
    if (boatBars) {
      boatBars.classList.toggle('notTrolling',
        !(G.run && G.state === G.S.STEER));
    }
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
    G.callbacks.onGuide = onGuide;
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
    /* The map's Close button. It looks like a button, it has a pointer
       cursor, it sits bottom right where a close button sits - and until now
       only a switch could work it, so a mouse or a finger on it did nothing
       at all. */
    U.addTap($('mapClose'), () => closeMap());

    const s = U.sm();
    if (s && s.subscribe) s.subscribe(() => {
      restartAutoScan();
      if (worldOn) startWorldScan();
    });

    setScreen('title');
    setTimeout(() => { if (screen === 'title') speakItem(); }, 900);
    /* Trace the lake in the background. The map is drawn from a picture of the
       depths that costs about a second to make; made now, while the title
       screen is being read, it is waiting the moment anybody opens the map. */
    setTimeout(() => {
      try {
        const st = G.mapState && G.mapState();
        if (st && RT.minimap && RT.minimap.warm) RT.minimap.warm(st.chart);
      } catch (e) { /* a map that is not ready yet simply draws when asked */ }
    }, 2500);
  }

  return { init, tick, setScreen, openPause, goToHub,
           /* So a check can put the chart on screen without walking the scan
              to get there - and land on Settings with Reset Progress under the
              cursor, which is what happened the first time one tried. */
           openMap,
           /* What card is up, which row is under the cursor, and whether the
              next press will act or only read the row out - for the browser
              checks, which cannot see any of that from the DOM. */
           __dbg: function () {
             return { screen: screen, index: index,
                      /* -1 means nothing is selected yet: the card is waiting
                         for a step, which is what reads a row out. */
                      selected: index >= 0,
                      rows: items.map(function (i) { return String(i.speech || i.label || ''); }) };
           },
           __input: { onKeyDown, onKeyUp, handleGameRelease, isOneSwitch, TAP_MAX_MS } };
})();
