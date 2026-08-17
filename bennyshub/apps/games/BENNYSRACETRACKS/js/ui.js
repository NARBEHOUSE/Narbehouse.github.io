/**
 * Benny's Race Tracks — menus, switch input and HUD.
 *
 * Two input contexts, decided purely by whether the overlay is up:
 *   • overlay visible → scanning (Space steps, Enter selects) exactly like the
 *     rest of the hub's games.
 *   • overlay hidden  → the switch drives the car, and auto-scan is off. This
 *     is the "scan dead zone" the design doc asks for: during a race there is
 *     no menu to scan, so the switch is captured for steering instead.
 */
RT.ui = (function () {
  'use strict';

  const U = RT.util;
  const G = RT.game;
  const AU = RT.audio;
  const $ = U.$;

  /* ── Tuning ───────────────────────────────────────────────────────────── */

  const SCAN_BACK_HOLD = 3000;   // hold Space this long in a menu to go back
  const SCAN_BACK_REPEAT = 420;
  const PAUSE_HOLD_MS = 5000;    // hold ENTER this long mid-race to pause
  const PAUSE_HOLD_SHOW = 2000;  // ring appears here so the gesture is discoverable

  /* Direction-helper levels, indexed by RT.game's cue level (0 = off). */
  const CUE_NAMES = ['Off', 'Visual', 'On'];
  const CUE_SPEECH = ['off', 'visual only', 'on'];

  /* ── State ────────────────────────────────────────────────────────────── */

  let screen = 'title';
  let items = [];
  let index = 0;
  let autoScanTimer = null;
  let overlayOn = true;

  /**
   * Auto Scan *is* the one-switch setting — across the hub it already means
   * "this player has a single switch", so the game derives its control scheme
   * from it rather than duplicating the choice as its own option.
   *
   *   Auto Scan on  → one switch: only ENTER plays. Hold it and the vehicle
   *                   moves whichever way the guidance points. Space is inert
   *                   during a race.
   *   Auto Scan off → two switches: SPACE moves left, ENTER moves right.
   */
  function isOneSwitch() {
    const s = U.sm();
    return !!(s && s.getSettings().autoScan);
  }

  /** During a race, is this key one the current scheme listens to? */
  function raceKeyLive(k) {
    return !isOneSwitch() || k === 'Enter';
  }
  let resetArmed = 0;

  const sel = { mode: 'competitive', vehicle: 'car', level: 1 };
  let lastResult = null;

  /* Input tracking */
  const keyDown = { Space: false, Enter: false };
  const keyDownAt = { Space: 0, Enter: 0 };
  let backHoldTimer = null, backRepeatTimer = null, didBackHold = false;
  /* Set when a menu opens while a switch is physically held. Key auto-repeat
     would otherwise re-arm that key straight after clearKeys(), and its
     eventual release would land on the menu as a selection. */
  const ignoreUntilRelease = { Space: false, Enter: false };
  let holdRingOn = false;
  let holdBeepAt = 0;
  let lastActivate = 0;

  function ctx() { return overlayOn ? 'menu' : 'game'; }

  /* ── Overlay plumbing ─────────────────────────────────────────────────── */

  function showOverlay(on, showcase) {
    overlayOn = on;
    $('overlay').classList.toggle('on', on);
    $('overlay').classList.toggle('showcase', !!showcase);
    $('hud').classList.toggle('on', !on && G.isRacing());
    $('pauseBtn').classList.toggle('on', !on && G.isRacing());
    if (on) {
      clearCue();
      stopDirScan();
      onDanger(false);
      clearKeys();
    }
  }

  function render() {
    const menu = $('overlayMenu');
    menu.innerHTML = '';
    menu.classList.toggle('grid', screen === 'level');

    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'menuItem';
      if (it.wide) el.classList.add('wide');
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
        index = i;
        updateFocus();
        activate();
      });

      // Hovering moves focus exactly like scanning to it does, so a mouse user
      // gets the same 3D preview (and, on the vehicle screen, the same map).
      // No speech here — a mouse sweeping the list would machine-gun the TTS.
      el.addEventListener('mouseenter', () => {
        if (it.enabled === false || index === i) return;
        index = i;
        updateFocus();
        restartAutoScan();
      });

      menu.appendChild(el);
    });
  }

  function updateFocus() {
    const els = $('overlayMenu').children;
    for (let i = 0; i < els.length; i++) els[i].classList.toggle('focused', i === index);
    const it = items[index];
    if (it && typeof it.onFocus === 'function') it.onFocus();
  }

  function speakItem() {
    const it = items[index];
    if (!it) return;
    U.speak(it.speech !== undefined ? it.speech : stripTags(it.label) + (it.value !== undefined ? ', ' + it.value : ''));
  }

  function stripTags(html) {
    return String(html).replace(/<[^>]*>/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}]/gu, '').trim();
  }

  /* Move focus to the next/previous *selectable* item — locked levels and
     spacers are skipped, matching how the other hub apps scan. */
  function step(delta) {
    if (!items.length) return;
    let i = index;
    for (let n = 0; n < items.length; n++) {
      i = (i + delta + items.length) % items.length;
      if (items[i].enabled !== false) { index = i; break; }
    }
    updateFocus();
    speakItem();
    AU.menuMove();
    // While the hold-to-go-back repeat owns the cursor, leave the auto-scan
    // timer alone. Restarting it here meant both timers were stepping the menu
    // at once, which looks like scanning far faster than the configured speed.
    if (!didBackHold) restartAutoScan();
  }

  function activate() {
    const now = Date.now();
    if (now - lastActivate < 140) return;   // debounce switch bounce
    lastActivate = now;
    const it = items[index];
    if (!it || it.enabled === false) { AU.menuBlocked(); return; }
    AU.resume();
    AU.menuSelect();
    if (typeof it.action === 'function') it.action();
  }

  /* ── Auto scan ────────────────────────────────────────────────────────── */

  function restartAutoScan() {
    stopAutoScan();
    if (ctx() !== 'menu') return;              // never scan during a race
    const s = U.sm();
    if (!s || !s.getSettings().autoScan) return;
    autoScanTimer = setInterval(() => step(1), s.getScanInterval());
  }

  function stopAutoScan() {
    if (autoScanTimer) { clearInterval(autoScanTimer); autoScanTimer = null; }
  }

  /* ── Screens ──────────────────────────────────────────────────────────── */

  function setScreen(name, opts) {
    opts = opts || {};
    screen = name;
    index = 0;
    const builder = SCREENS[name];
    const meta = builder(opts);

    $('overlayArt').textContent = meta.art || '';
    $('overlayTitle').innerHTML = meta.title || '';
    $('overlaySub').innerHTML = meta.sub || '';
    $('overlayStats').innerHTML = meta.stats || '';
    $('overlayHint').innerHTML = meta.hint ||
      '<strong>SPACE</strong> to scan &bull; <strong>ENTER</strong> to select';

    items = meta.items || [];
    if (meta.startIndex !== undefined) index = meta.startIndex;
    if (opts.index !== undefined) index = opts.index;
    // Never land focus on a locked entry.
    if (items[index] && items[index].enabled === false) {
      const start = index;
      for (let n = 0; n < items.length; n++) {
        const i = (start + n) % items.length;
        if (items[i].enabled !== false) { index = i; break; }
      }
    }

    render();
    showOverlay(true, name === 'vehicle');
    G.setPreview(name === 'vehicle' ? sel.vehicle : null);
    if (items[index] && typeof items[index].onFocus === 'function') items[index].onFocus();

    if (meta.announce !== false) U.speak(meta.speech || (stripTags(meta.title) + '. ' + stripTags(meta.sub || '')));
    restartAutoScan();
  }

  function refresh() {
    const keep = index;
    setScreen(screen, { index: keep, announce: false });
  }

  const SCREENS = {

    title: () => ({
      art: '🏁',
      title: "Benny's Race Tracks",
      sub: 'Steer with a single switch. The game tells you which way to go.',
      items: [
        { label: '🏎️ Play Game', speech: 'Play Game', action: () => setScreen('mode') },
        { label: '❓ How to Play', speech: 'How to Play', action: () => setScreen('howto') },
        { label: '⚙️ Settings', speech: 'Settings', action: () => setScreen('settings') },
        { label: '🏠 Exit Game', speech: 'Exit Game', action: goToHub }
      ],
      speech: "Benny's Race Tracks. Play Game, How to Play, Settings, or Exit."
    }),

    mode: () => ({
      art: '🚦',
      title: 'Choose a Mode',
      sub: '',
      items: [
        {
          label: '🏆 Race &mdash; <span style="opacity:.7;font-size:.85em">10 levels, beat the track</span>',
          speech: 'Race. Ten levels, beat the track.',
          action: () => { sel.mode = 'competitive'; setScreen('vehicle'); }
        },
        {
          label: '🌻 Cruise &mdash; <span style="opacity:.7;font-size:.85em">no fail, just collect</span>',
          speech: 'Cruise. No fail, just collect.',
          action: () => { sel.mode = 'casual'; setScreen('vehicle'); }
        },
        { label: '← Back', speech: 'Back', action: () => setScreen('title') }
      ],
      speech: 'Choose a mode. Race or Cruise.'
    }),

    vehicle: () => {
      const list = G.VEHICLE_ORDER.map((key) => {
        const v = G.VEHICLES[key];
        const sub = sel.mode === 'casual' ? v.casual.story : v.blurb;
        return {
          label: v.emoji + ' ' + v.name + '<br><span style="opacity:.65;font-size:.78em;font-weight:normal">' + sub + '</span>',
          speech: v.name + '. ' + sub,
          action: () => {
            sel.vehicle = key;
            if (sel.mode === 'casual') startRun();
            else setScreen('level');
          },
          onFocus: () => G.setPreview(key)
        };
      });
      list.push({ label: '← Back', speech: 'Back', action: () => setScreen('mode') });
      return {
        art: '',
        title: 'Choose a Ride',
        sub: 'Each one has its own world.',
        items: list,
        speech: 'Choose a ride. Race Car, Motorcycle, or Spaceship.'
      };
    },

    level: () => {
      const unlocked = G.unlockedFor(sel.vehicle);
      const v = G.VEHICLES[sel.vehicle];
      const list = [{
        label: '▶ Continue &mdash; Level ' + unlocked,
        speech: 'Continue, level ' + unlocked,
        wide: true,
        action: () => { sel.level = unlocked; startRun(); }
      }];
      for (let i = 1; i <= G.MAX_LEVEL; i++) {
        const open = i <= unlocked;
        const best = G.bestTime(sel.vehicle, i);
        const star = G.hasStar(sel.vehicle, i);
        list.push({
          label: (open ? '' : '🔒 ') + 'Level ' + i + (star ? ' ⭐' : '') +
                 (best ? ' <span style="opacity:.6;font-size:.8em">' + best.toFixed(1) + 's</span>' : ''),
          speech: open
            ? ('Level ' + i + (star ? ', star found' : '') + (best ? ', best ' + best.toFixed(1) + ' seconds' : ''))
            : ('Level ' + i + ', locked'),
          enabled: open,
          action: () => { sel.level = i; startRun(); }
        });
      }
      list.push({ label: '← Back', speech: 'Back', wide: true, action: () => setScreen('vehicle') });
      return {
        art: v.emoji,
        title: v.name,
        sub: 'Levels unlock as you beat them.',
        items: list,
        speech: v.name + '. Choose a level.'
      };
    },

    howto: () => ({
      art: '❓',
      title: 'How to Play',
      sub:
        '<b>Hold</b> to move across the road. <b>Let go</b> and it stops and settles into the nearest lane.' +
        '<br><br>' +
        (isOneSwitch()
          ? '<b>One switch</b> (Auto Scan is on). Only <b>ENTER</b> plays. The panel at the side of the screen shows which way the next press will go. <b>Hold ENTER</b> and the car moves that way. Each time you let go, the <b>other</b> side arms — so a quick tap barely moves you and simply swaps direction.'
          : '<b>Two switches</b> (Auto Scan is off). Hold <b>SPACE</b> to move left, hold <b>ENTER</b> to move right.') +
        '<br><br><b>Mouse or touch:</b> move the pointer, or touch and drag, and the car goes to that lane.' +
        '<br><br>Drive through the <b>green doorways</b> — those lanes are always clear.' +
        '<br><br>To pause: <b>hold ENTER</b>.',
      items: [
        { label: '🔁 Switch to ' + (isOneSwitch() ? 'Two Switches' : 'One Switch'),
          speech: 'Switch to ' + (isOneSwitch() ? 'two switches' : 'one switch'),
          action: () => {
            const s = U.sm();
            if (s) s.toggleAutoScan();   // Auto Scan is the control scheme
            G.setCueSpeech(!isOneSwitch());
            refresh();
            U.speak(isOneSwitch() ? 'One switch. Enter plays the game.' : 'Two switches. Space left, Enter right.');
          } },
        { label: '← Back', speech: 'Back', action: () => setScreen('title') }
      ],
      speech: isOneSwitch()
        ? 'How to play. Hold Enter and the car moves the way the side panel shows. Let go and the other direction arms, so a quick tap swaps sides.'
        : 'How to play. Hold Space to move left, hold Enter to move right. Let go and the car settles into the nearest lane.'
    }),

    settings: () => {
      const v = U.vm(), s = U.sm();
      const tts = v ? v.getSettings().ttsEnabled : true;
      const voiceName = (v && v.getVoiceDisplayName) ? v.getVoiceDisplayName(v.getCurrentVoice()) : 'Default';
      const autoScan = s ? s.getSettings().autoScan : false;
      const speed = s ? s.getScanInterval() : 2000;

      return {
        art: '⚙️',
        title: 'Settings',
        items: [
          { label: 'Text to Speech', value: tts ? 'On' : 'Off',
            speech: 'Text to Speech, ' + (tts ? 'On' : 'Off'),
            action: () => { if (v) { v.toggleTTS(); refresh(); if (v.getSettings().ttsEnabled) U.speak('Text to speech on'); } } },
          { label: 'Voice', value: voiceName,
            speech: 'Voice, ' + voiceName,
            action: () => { if (v) { v.cycleVoice(); refresh(); U.speak('Voice changed'); } } },
          { label: 'Direction Help', value: CUE_NAMES[G.getCueLevel()],
            speech: 'Direction Help, ' + CUE_SPEECH[G.getCueLevel()],
            action: () => {
              G.cycleCueLevel();
              refresh();
              U.speak('Direction help, ' + CUE_SPEECH[G.getCueLevel()]);
            } },
          // Auto Scan doubles as the control scheme, so say so out loud.
          { label: 'Auto Scan', value: autoScan ? 'On — One Switch' : 'Off — Two Switches',
            speech: autoScan
              ? 'Auto Scan on. One switch: Enter plays the game.'
              : 'Auto Scan off. Two switches: Space is left, Enter is right.',
            action: () => {
              if (!s) return;
              s.toggleAutoScan();
              G.setCueSpeech(!isOneSwitch());
              refresh();
              U.speak(s.getSettings().autoScan
                ? 'Auto scan on. One switch. Enter plays the game.'
                : 'Auto scan off. Two switches. Space left, Enter right.');
            } },
          { label: 'Scan Speed', value: (speed / 1000) + 's',
            speech: 'Scan Speed, ' + (speed / 1000) + ' seconds',
            action: () => { if (s) { s.cycleScanSpeed(); refresh(); U.speak('Scan speed ' + (s.getScanInterval() / 1000) + ' seconds'); } } },
          { label: 'Sound Effects', value: AU.isEnabled() ? 'On' : 'Off',
            speech: 'Sound Effects, ' + (AU.isEnabled() ? 'On' : 'Off'),
            action: () => { AU.setEnabled(!AU.isEnabled()); refresh(); U.speak('Sound effects ' + (AU.isEnabled() ? 'on' : 'off')); } },
          { label: 'Reset Progress', value: resetArmed ? 'Sure?' : '',
            speech: resetArmed ? 'Select again to erase all progress' : 'Reset Progress',
            action: () => {
              if (resetArmed && Date.now() - resetArmed < 6000) {
                G.resetProgress(); resetArmed = 0; refresh(); U.speak('Progress reset');
              } else {
                resetArmed = Date.now(); refresh(); U.speak('Select again to erase all progress');
              }
            } },
          { label: '← Back', speech: 'Back', action: () => { resetArmed = 0; setScreen('title'); } }
        ],
        speech: 'Settings'
      };
    },

    pause: () => ({
      art: '⏸',
      title: 'Paused',
      // Nothing focused to begin with: releasing the switch that paused the
      // game must not instantly pick an option. Scan to make a choice.
      startIndex: -1,
      items: [
        { label: '▶ Continue', speech: 'Continue', action: resumeRace },
        { label: '🔄 Restart', speech: 'Restart', action: startRun },
        { label: '🏠 Main Menu', speech: 'Main Menu', action: () => { G.quitToMenu(); setScreen('title'); } },
        { label: '🆘 Help', speech: 'Help', action: () => U.speak('I need help') }
      ],
      speech: 'Paused. Continue, Restart, Main Menu, or Help.'
    }),

    results: () => {
      const r = lastResult || {};
      const v = G.VEHICLES[r.vehicle] || G.VEHICLES.car;
      const list = [];
      let art, title, sub = '', stats = '';

      if (r.mode === 'casual') {
        art = '🎉';
        title = 'Good job!';
        sub = 'You collected all ' + r.target + ' ' + v.casual.plural + '.';
        stats = '⏱ ' + fmtTime(r.time);
        list.push({ label: '🔄 Cruise Again', speech: 'Cruise again', action: startRun });
        list.push({ label: '🚗 Change Ride', speech: 'Change ride', action: () => setScreen('vehicle') });
      } else if (r.won) {
        // Completing the star set is a bigger deal than clearing the level.
        art = r.allStars ? '🌟' : (r.finale ? '👑' : '🏆');
        title = r.allStars ? 'Every star found!'
              : (r.finale ? 'You beat the whole game!' : 'Level ' + r.level + ' Complete!');
        sub = r.allStars
          ? 'All ' + G.MAX_LEVEL + ' stars collected with the ' + r.vehicleName + '. That is the hard one.'
          : (r.finale
              ? 'Every level cleared with the ' + r.vehicleName + '. Incredible driving.'
              : (r.newUnlock ? 'Level ' + (r.level + 1) + ' is unlocked!' : 'Nice clean run.'));
        stats = '⏱ ' + fmtTime(r.time) + (r.newBest ? '  <span style="color:#ffd166">NEW BEST</span>' : '') +
                (r.placeText ? '<br>🏁 Finished ' + r.placeText : '') +
                '<br>💥 Crashes: ' + r.crashes +
                '<br>' + (r.gotStar ? '⭐ Star found!' : '☆ Star missed') +
                ' <span style="opacity:.65;font-size:.85em">(' + r.stars + ' / ' + G.MAX_LEVEL + ')</span>';
        if (r.level < G.MAX_LEVEL) {
          list.push({
            label: '➡️ Next Level', speech: 'Next level',
            enabled: r.level + 1 <= G.unlockedFor(r.vehicle),
            action: () => { sel.level = r.level + 1; startRun(); }
          });
        }
        list.push({ label: '🔄 Race Again', speech: 'Race again', action: startRun });
        list.push({ label: '📋 Choose Level', speech: 'Choose level', action: () => setScreen('level') });
      } else {
        art = '💥';
        title = 'Out of Hearts';
        sub = 'No problem — the track is always the same, so you can learn it.';
        stats = '🏁 Got ' + Math.round((r.progressPct || 0) * 100) + '% of the way' +
                '<br>💥 Crashes: ' + r.crashes;
        list.push({ label: '🔄 Try Again', speech: 'Try again', action: startRun });
        list.push({ label: '📋 Choose Level', speech: 'Choose level', action: () => setScreen('level') });
      }

      list.push({ label: '🏠 Main Menu', speech: 'Main menu', action: () => { G.quitToMenu(); setScreen('title'); } });
      return { art, title, sub, stats, items: list, speech: stripTags(title) + '. ' + stripTags(sub) };
    }
  };

  /* ── Flow ─────────────────────────────────────────────────────────────── */

  function startRun() {
    showOverlay(false);
    $('hud').classList.add('on');
    $('pauseBtn').classList.add('on');
    stopAutoScan();
    clearKeys();
    cueLive = false;
    stopDirScan();
    G.setCueSpeech(!isOneSwitch());
    G.startRun({ mode: sel.mode, vehicle: sel.vehicle, level: sel.level });
    armedDir = -1;
    if (isOneSwitch()) startDirScan();
    // No announcement here on purpose. The objective is already read out when
    // scanning to the ride or the level; repeating it at launch just gets cut
    // off a beat later by the countdown, which cancels in-flight speech.
  }

  function openPause() {
    if (ctx() !== 'game' || !G.isRacing()) return;
    G.pause();
    // The switch is still held — that 5-second hold is how we got here — so
    // swallow its repeat and its release. Capture before clearKeys() wipes it.
    ignoreUntilRelease.Space = keyDown.Space;
    ignoreUntilRelease.Enter = keyDown.Enter;
    clearKeys();
    setScreen('pause');
  }

  function resumeRace() {
    showOverlay(false);
    clearKeys();
    G.resume();
    if (isOneSwitch()) startDirScan();
    U.speak('Go');
  }

  function goToHub() {
    U.speak('Exiting to hub');
    setTimeout(() => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ action: 'focusBackButton' }, '*');
      } else {
        window.location.href = '../../../index.html';
      }
    }, 700);
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  /* ── HUD + cue rendering ──────────────────────────────────────────────── */

  function onHud(h) {
    const casual = h.mode === 'casual';
    $('hudLevel').textContent = casual ? h.vehicleName : ('Level ' + h.level);
    $('hudLevel').style.display = '';

    const showStar = !casual && h.hasStarInLevel;
    $('hudGoal').style.display = (casual || showStar) ? '' : 'none';
    if (casual) $('hudGoal').textContent = h.itemEmoji + ' ' + h.collected + ' / ' + h.target;
    else if (showStar) $('hudGoal').textContent = h.gotStar ? '⭐' : '☆';

    $('hudHearts').style.display = casual ? 'none' : '';
    if (!casual) $('hudHearts').textContent = '❤️'.repeat(Math.max(0, h.hearts)) || '—';

    $('hudPlace').style.display = h.place ? '' : 'none';
    if (h.place) $('hudPlace').textContent = h.place;

    $('hudTimer').textContent = fmtTime(h.time);
    $('hudSpeed').textContent = h.speed + ' mph' +
      (h.boost > 0 ? ' ⚡' : '') + (h.shield > 0 ? ' 🛡' : '') + (h.magnet > 0 ? ' 🧲' : '');
    $('hudProgressBar').style.width = (h.progress * 100).toFixed(1) + '%';

    const pips = $('hudLanes').children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i === h.lane);
  }

  /* ── One-switch direction scanner ─────────────────────────────────────────
   * With a single switch the player can't express "left" or "right" directly,
   * so we scan the two choices the way the rest of the hub scans a menu: the
   * armed direction alternates on the hub's scan interval and is spoken, and
   * holding the switch drives that way. The scan freezes while held, so the
   * direction can't flip out from under a move that's already happening.
   *
   * It only runs when there is actually a decision to make (a cue is live),
   * rather than chattering "left… right… left…" for a whole race.
   */
  let armedDir = -1;      // the way the next press will steer
  let cueNeeded = 0;      // the way the guidance wants to go
  let cueLive = false;

  function startDirScan() {
    $('dirScan').classList.add('on');
    paintDirScan();
  }

  function stopDirScan() {
    $('dirScan').classList.remove('on');
  }

  /**
   * Static — it only ever changes in response to a press, never on a timer.
   * A cycling indicator meant the player had to wait for the right moment;
   * this way the choice is always theirs to make whenever they're ready.
   */
  function paintDirScan() {
    const match = (armedDir === cueNeeded && cueNeeded !== 0 && cueLive);
    const l = $('dirLeft'), r = $('dirRight');
    l.classList.toggle('on', armedDir < 0);
    r.classList.toggle('on', armedDir > 0);
    l.classList.toggle('match', match && armedDir < 0);
    r.classList.toggle('match', match && armedDir > 0);
  }

  /**
   * Flip after every release, so a quick tap costs almost no movement and
   * simply swaps which way the *next* hold will go. Wrong direction armed?
   * Tap once, then hold.
   */
  function flipArmed() {
    armedDir = -armedDir;
    paintDirScan();
    const level = G.getCueLevel();
    if (level >= 1) AU.cue(armedDir);
    if (level >= 2) U.speak(armedDir < 0 ? 'Left' : 'Right');
  }

  function onCue(dir, active, level) {
    cueNeeded = dir;
    cueLive = active;
    // The scanner runs continuously in one-switch mode; the cue only decides
    // whether the armed side is currently the *right* one (the green match).
    paintDirScan();

    const cue = $('cue');
    if (!active || level < 1) { clearCue(); return; }
    cue.classList.add('on');
    cue.classList.remove('left', 'right', 'clear');
    if (dir < 0) {
      cue.classList.add('left');
      $('cueArrow').textContent = '⬅';
      $('cueText').textContent = 'LEFT';
    } else if (dir > 0) {
      cue.classList.add('right');
      $('cueArrow').textContent = '➡';
      $('cueText').textContent = 'RIGHT';
    } else {
      cue.classList.add('clear');
      $('cueArrow').textContent = '⬆';
      $('cueText').textContent = 'STRAIGHT';
    }
    $('edgeLeft').classList.toggle('on', dir < 0);
    $('edgeRight').classList.toggle('on', dir > 0);
  }

  /** Lined up with an obstacle: red screen glow plus a repeating pulse. */
  function onDanger(on) {
    $('dangerGlow').classList.toggle('on', on);
    if (on) AU.startWarning(); else AU.stopWarning();
  }

  function clearCue() {
    $('cue').classList.remove('on');
    $('edgeLeft').classList.remove('on');
    $('edgeRight').classList.remove('on');
  }

  function onCountdown(n) {
    const el = $('bigMsg');
    if (n < 0) {
      el.classList.remove('on');
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.textContent = n === 0 ? 'GO!' : String(n);
    el.classList.remove('on');
    void el.offsetWidth;   // restart the pop animation
    el.classList.add('on');

    // Don't talk over the menu. Selecting a level fires its announcement
    // ("Level 2, best 63 seconds") barely a second before the count starts,
    // and every speak() cancels whatever is already playing — so the player
    // heard the level name chopped in half. The beeps and the big on-screen
    // digits carry the count on their own; spoken digits only fill silence.
    // "Go" always gets through, because it is the cue that actually matters.
    const stillTalking = ('speechSynthesis' in window) && window.speechSynthesis.speaking;
    if (n === 0) U.speak('Go');
    else if (!stillTalking) U.speak(String(n));
    if (n === 0) setTimeout(() => { el.classList.remove('on'); el.style.display = 'none'; }, 700);
  }

  function onFinish(result) {
    lastResult = result;
    clearCue();
    stopDirScan();
    $('hud').classList.remove('on');
    $('pauseBtn').classList.remove('on');
    setTimeout(() => setScreen('results'), result.won ? 1400 : 1100);
  }

  /* ── Crash flash hook ─────────────────────────────────────────────────── */

  function flash() {
    const f = $('flash');
    f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 60);
  }

  /* ── Hold-to-pause ring ───────────────────────────────────────────────── */

  const RING_LEN = 251.3;

  function showHoldRing(p) {
    holdRingOn = true;
    $('holdRing').classList.add('on');
    $('holdRing').querySelector('.fill').style.strokeDashoffset = String(RING_LEN * (1 - p));
  }

  function hideHoldRing() {
    if (!holdRingOn) return;
    holdRingOn = false;
    $('holdRing').classList.remove('on');
    holdBeepAt = 0;
  }

  /* ── Mouse / touch steering ───────────────────────────────────────────────
   * Absolute rather than relative: whichever fifth of the screen the pointer
   * is over is the lane the vehicle heads for. On a phone or tablet that means
   * touch (and drag) anywhere to place the car; with a mouse, just moving it
   * steers. Whichever input was used last wins, so a switch press immediately
   * takes control back from a resting mouse.
   */
  let pointerSteering = false;

  function laneFromClientX(clientX) {
    const w = window.innerWidth || 1;
    return U.clamp(clientX / w, 0, 1) * (G.LANE_COUNT - 1);
  }

  function onPointerSteer(e) {
    if (ctx() !== 'game' || !G.isRacing()) return;
    if (keyDown.Space || keyDown.Enter) return;   // a held switch outranks the pointer
    if (e.cancelable) e.preventDefault();
    pointerSteering = true;
    AU.resume();
    G.setLaneTarget(laneFromClientX(e.clientX));
  }

  /* ── Input ────────────────────────────────────────────────────────────── */

  function isSwitchKey(code) {
    return code === 'Space' || code === 'Enter' || code === 'NumpadEnter';
  }

  function normKey(code) { return code === 'NumpadEnter' ? 'Enter' : code; }

  function clearKeys() {
    keyDown.Space = false;
    keyDown.Enter = false;
    clearTimeout(backHoldTimer); backHoldTimer = null;
    clearInterval(backRepeatTimer); backRepeatTimer = null;
    didBackHold = false;
    hideHoldRing();
    G.setSteerHold(0);
  }

  /**
   * Push the current hold state down to the game. Two switches map directly
   * (Space left, Enter right); with one switch, whichever key is held moves
   * toward what the guidance is pointing at — and stops on its own once the
   * vehicle reaches a clear lane and the cue goes quiet.
   */
  function applySteer() {
    if (ctx() !== 'game') { G.setSteerHold(0); return; }
    if (isOneSwitch()) {
      // Only Enter drives, and it goes whichever way is currently armed.
      // Available at any point in the race, not just at obstacles.
      G.setSteerHold(keyDown.Enter ? armedDir : 0);
      return;
    }
    let dir = 0;
    if (keyDown.Space) dir -= 1;
    if (keyDown.Enter) dir += 1;   // both held cancels out
    G.setSteerHold(dir);
  }

  function onKeyDown(e) {
    if (e.code === 'Escape') {
      if (ctx() === 'game' && G.isRacing()) openPause();
      return;
    }
    if (!isSwitchKey(e.code)) return;
    e.preventDefault();
    const k = normKey(e.code);
    if (ignoreUntilRelease[k]) return;   // still holding the switch that opened this menu
    if (keyDown[k]) return;   // ignore browser auto-repeat
    keyDown[k] = true;
    keyDownAt[k] = Date.now();
    AU.resume();

    if (ctx() === 'menu') {
      if (k === 'Space') {
        didBackHold = false;
        backHoldTimer = setTimeout(() => {
          didBackHold = true;
          stopAutoScan();          // hand the cursor to the hold-repeat alone
          step(-1);
          const s = U.sm();
          backRepeatTimer = setInterval(() => step(-1), s ? s.getScanInterval() : SCAN_BACK_REPEAT);
        }, SCAN_BACK_HOLD);
      }
    } else {
      pointerSteering = false;   // switch takes over from mouse/touch
      applySteer();              // in-race: start moving the moment the switch goes down
    }
  }

  function onKeyUp(e) {
    if (!isSwitchKey(e.code)) return;
    e.preventDefault();
    const k = normKey(e.code);
    if (ignoreUntilRelease[k]) { ignoreUntilRelease[k] = false; return; }
    if (!keyDown[k]) return;
    keyDown[k] = false;

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

    /* In-race: releasing just stops the movement where it is. */
    if (!keyDown.Space && !keyDown.Enter) hideHoldRing();
    applySteer();
    if (!raceKeyLive(k)) return;   // one-switch: Space does nothing in a race
    // Releasing arms the opposite direction for the next press.
    if (isOneSwitch()) flipArmed();
  }

  /**
   * The shared scan-manager swallows key-ups that were too short to count as a
   * deliberate press. Without this the game would never see the release and the
   * car would steer forever, so treat a cancelled press as a full release.
   */
  function onInputCancelled() {
    keyDown.Space = false;
    keyDown.Enter = false;
    hideHoldRing();
    applySteer();
  }

  /* ── Per-frame ────────────────────────────────────────────────────────── */

  function tick(dt) {
    if (ctx() !== 'game') return;

    if (!G.isRacing()) return;

    const held = keyDown.Enter ? keyDownAt.Enter : 0;
    if (!held) { hideHoldRing(); return; }

    const dur = Date.now() - held;
    if (dur >= PAUSE_HOLD_MS) {
      hideHoldRing();
      openPause();
      return;
    }
    if (dur >= PAUSE_HOLD_SHOW) {
      showHoldRing((dur - PAUSE_HOLD_SHOW) / (PAUSE_HOLD_MS - PAUSE_HOLD_SHOW));
      // A rising tick each second makes the gesture audible as well as visible.
      const secs = Math.floor(dur / 1000);
      if (secs > holdBeepAt) {
        holdBeepAt = secs;
        AU.tone(300 + secs * 90, 0.09, { vol: 0.1, type: 'square' });
      }
    }
  }

  /* ── Boot ─────────────────────────────────────────────────────────────── */

  function init() {
    G.callbacks.onHud = onHud;
    G.callbacks.onCue = onCue;
    G.callbacks.onCountdown = onCountdown;
    G.callbacks.onFinish = onFinish;
    G.callbacks.onFlash = flash;
    G.callbacks.onDanger = onDanger;

    const surface = $('canvasWrap');
    // Bound to the canvas, not the document, so the on-screen Pause button and
    // the menu card don't double as a steering wheel.
    surface.addEventListener('pointermove', onPointerSteer, { passive: false });
    surface.addEventListener('pointerdown', onPointerSteer, { passive: false });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('narbe-input-cancelled', onInputCancelled);
    window.addEventListener('blur', clearKeys);

    U.addTap($('pauseBtn'), () => {
      if (ctx() === 'game' && G.isRacing()) openPause();
    });

    // Keep menus in sync if the hub changes scan settings while we're open.
    const s = U.sm();
    if (s && s.subscribe) s.subscribe(() => restartAutoScan());

    setScreen('title');
    // Voices load asynchronously; re-announce once they're ready.
    setTimeout(() => { if (screen === 'title') speakItem(); }, 900);
  }

  return { init, tick, setScreen, openPause, flash, goToHub };
})();
