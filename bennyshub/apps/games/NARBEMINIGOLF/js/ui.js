/**
 * NARBE Mini Golf — switches, menus and HUD.
 *
 * Input contexts, decided by what's on screen:
 *   menu      the overlay card, an in-game list (Choose-from-List power), or
 *             the Easy Pause scan: Space steps on release, hold Space scans
 *             backwards, Enter selects on release, Auto Scan steps by itself.
 *             The hub's universal contract.
 *   play      aiming: Space held turns the aim (each press reverses), Enter
 *             charges / opens the list / putts, per the Power setting.
 *   watch     the ball is rolling: switches do nothing except the Enter hold.
 *   cinema    intros, celebrations, replays, scorecards: any press skips.
 * Holding Enter pauses from anywhere in play, with a ring and rising ticks.
 * While charging, the hold only starts counting toward pause once the meter
 * is full, so charging all the way never pauses by accident.
 * For a player who can't hold a switch, the Easy Pause setting makes every
 * turn start with a two-stop scan: the putter itself (pick it to putt) and
 * the on-screen Pause button. No buttons pop up (ACCESSIBILITY.md §12).
 */
(function () {
  'use strict';

  const U = MG.util, G = MG.game, AU = MG.audio, A = MG.art;
  const $ = U.$;

  const SCAN_BACK_HOLD = 3000;
  const PAUSE_HOLD_MS = 5000;
  const PAUSE_HOLD_SHOW = 2000;
  const PAUSE_AFTER_FULL = 3000;   // extra hold past a full charge before pausing

  /* ── Menu state ───────────────────────────────────────────────────────── */

  let screen = 'title';
  let items = [];
  let index = -1;             // -1 = nothing highlighted; every menu opens that way (ACCESSIBILITY.md §4)
  let overlayOn = false;
  let powerMenuOn = false;
  let autoScanTimer = null;
  let lastActivate = 0;
  let resetArmed = 0;
  let screenStack = [];
  let courses = [];           // [{file, course}]
  let lastSummary = null;
  const sel = { mode: 'casual', count: 2, colors: [], file: null };

  const keyDown = { Space: false, Enter: false };
  const keyDownAt = { Space: 0, Enter: 0 };
  const ignoreUntilRelease = { Space: false, Enter: false };
  let backHoldTimer = null, backRepeatTimer = null, didBackHold = false;
  let holdBeepAt = 0, holdRingOn = false;
  let chargeFullAt = 0;

  function ctx() {
    if (overlayOn || powerMenuOn) return 'menu';
    const s = G.state;
    if (G.paused) return 'menu';
    if (s === 'aim' || s === 'charge') return 'play';
    if (s === 'ready') return 'idle';     // Easy Pause: the putter / Pause scan is up (menu, above), or about to be
    if (s === 'swing' || s === 'shot' || s === 'settle' || s === 'gator') return 'watch';
    if (['courseIntro', 'holeIntro', 'holeOut', 'replay', 'scorecard', 'challengeFail'].includes(s)) return 'cinema';
    return 'idle';
  }

  // Shared policy is restricted here to stationary overlay menus.
  let choice=null,choiceStatus=null,spaceBraking=false;
  let choiceAutoMode=!!window.NarbeScanManager?.getSettings().autoScan;
  function syncChoice(fresh=false,restoreId=null){
    if(!overlayOn){choice?.sync(null);return;}
    const seen=new Map();items.forEach(it=>{const base=it.id||stripTags(it.label),n=seen.get(base)||0;seen.set(base,n+1);it.scanId=screen+':'+base+':'+n;});
    if(!choiceStatus){choiceStatus=document.createElement('div');choiceStatus.id='choiceScanStatus';choiceStatus.style.minBlockSize='0';$('overlayMenu').before(choiceStatus);}
    if(!choice)choice=NarbeChoiceScanAdapter.create({holdThreshold:SCAN_BACK_HOLD,stateHost:document.body,speak:text=>U.vm()?.speak(text),
      onHighlight(item,state){index=item?items.indexOf(item.source):-1;updateFocus();if(!item&&$('overlayMenu').contains(document.activeElement))document.activeElement.blur();},onSelect:()=>activate(true)});
    choice.sync({key:screen,items:items.filter(it=>it.enabled!==false&&!it.info).map(it=>({id:it.scanId,label:()=>{const v=typeof it.value==='function'?it.value():it.value;return it.speech?(typeof it.speech==='function'?it.speech():it.speech):stripTags(it.label)+(v!==undefined?', '+v:'');},element:it.element,labelElement:it.labelElement,source:it})),statusHost:choiceStatus},{fresh,restoreId});choice.setInputHeld(keyDown.Space||keyDown.Enter);
  }

  /* ── Overlay plumbing ─────────────────────────────────────────────────── */

  function showOverlay(on, opts) {
    opts = opts || {};
    overlayOn = on;
    const ov = $('overlay');
    ov.classList.toggle('on', on);
    ov.classList.toggle('center', !!opts.center);
    ov.classList.toggle('wide', !!opts.wide);
    if (on) { clearKeysKeepIgnores(); hideHoldRing(); }
    refreshChrome();
    restartAutoScan();
  }

  function refreshChrome() {
    const s = G.state;
    const playing = !overlayOn && !G.paused && ['ready', 'aim', 'charge', 'powerMenu', 'swing', 'shot', 'settle'].includes(s);
    $('hud').classList.toggle('on', playing);
    $('pauseBtn').classList.toggle('on', playing || (!overlayOn && !G.paused && ['holeIntro', 'holeOut', 'scorecard', 'replay'].includes(s)));
  }

  function stripTags(html) {
    return String(html).replace(/<[^>]*>/g, ' ').replace(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{26F3}]/gu, '').replace(/\s+/g, ' ').trim();
  }

  function render() {
    const menu = $('overlayMenu');
    menu.innerHTML = '';
    menu.classList.toggle('grid', !!(screenDef && screenDef.grid));
    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'menuItem';
      if (it.wide) el.classList.add('wide');
      if (it.enabled === false) el.classList.add('locked');
      if (it.danger) el.classList.add('danger');
      if (i === index) el.classList.add('focused');
      if (it.icon) { const ic = document.createElement('span'); ic.className = 'ico'; ic.textContent = it.icon; el.appendChild(ic); }
      if (it.swatch) { const sw = document.createElement('span'); sw.className = 'swatch'; sw.style.background = it.swatch; el.appendChild(sw); }
      const label = document.createElement('span');
      label.innerHTML = it.label + (it.sub ? '<span class="sub">' + it.sub + '</span>' : '');
      el.appendChild(label);
      if (it.value !== undefined) {
        const v = document.createElement('span');
        v.className = 'val';
        v.textContent = typeof it.value === 'function' ? it.value() : it.value;
        el.appendChild(v);
      }
      U.addTap(el, () => {
        if (it.enabled === false) { AU.play('menuBlocked', 0.4); return; }
        index = i;choice?.align(it.scanId); updateFocus(); activate();
      });
      el.addEventListener('mouseenter', () => {
        if (it.enabled === false || index === i) return;
        index = i;choice?.align(it.scanId); updateFocus(); restartAutoScan();
      });
      it.element=el;it.labelElement=label;
      menu.appendChild(el);
    });
  }

  function updateFocus() {
    const els = $('overlayMenu').children;
    for (let i = 0; i < els.length; i++) els[i].classList.toggle('focused', i === index);
    const it = items[index];
    if (it && it.onFocus) it.onFocus();
    if (els[index] && els[index].scrollIntoView) els[index].scrollIntoView({ block: 'nearest' });
  }

  function refreshValues() {
    const els = $('overlayMenu').children;
    items.forEach((it, i) => {
      const v = els[i] && els[i].querySelector('.val');
      if (v && it.value !== undefined) v.textContent = typeof it.value === 'function' ? it.value() : it.value;
    });
  }

  function speakItem() {
    if(overlayOn&&choice?.active){choice.announce();return;}
    const it = items[index];
    if (!it) return;
    if (it.speech) { AU.say(typeof it.speech === 'function' ? it.speech() : it.speech); return; }
    const v = it.value !== undefined ? (typeof it.value === 'function' ? it.value() : it.value) : '';
    AU.say(stripTags(it.label) + (v !== '' ? ', ' + v : ''));
  }

  function step(delta) {
    if(overlayOn&&choice?.active){choice.step(delta);return;}
    if (powerMenuOn) { pmStep(delta); return; }
    if (!items.length) return;
    // Nothing highlighted yet: forward lands on the first item, back on the last.
    let i = index < 0 ? (delta > 0 ? -1 : items.length) : index;
    for (let n = 0; n < items.length; n++) {
      i = (i + delta + items.length) % items.length;
      if (items[i].enabled !== false && !items[i].info) { index = i; break; }
    }
    updateFocus();
    speakItem();
    AU.play('menuMove', 0.3);
    if (!didBackHold) restartAutoScan();
  }

  function activate(fromChoice=false) {
    if(overlayOn&&choice?.active&&!fromChoice){choice.select();return;}
    if (powerMenuOn) { pmActivate(); return; }
    if (index < 0) return;      // nothing highlighted: Enter does nothing until Space picks something
    const now = Date.now();
    // Shared scan-manager owns the release cooldown.
    lastActivate = now;
    const it = items[index];
    if (!it || it.enabled === false || it.info) { AU.play('menuBlocked', 0.4); return; }
    AU.play('menuSelect', 0.35);
    const selectedContext=choice?.context?.key,selectedId=choice?.getState()?.id;
    if (it.action) it.action();
    if(it.value!==undefined&&choice?.active&&choice.context.key===selectedContext&&choice.getState().id===selectedId)choice.announce();
  }

  /* ── Auto scan ────────────────────────────────────────────────────────── */

  function restartAutoScan() {
    stopAutoScan();syncChoice();syncPowerChoice();
    if(overlayOn||powerMenuOn)return;
    if (ctx() !== 'menu') return;
    if (!U.isOneSwitch()) return;
    autoScanTimer = setInterval(() => step(1), U.scanInterval());
  }

  function stopAutoScan() { if (autoScanTimer) { clearInterval(autoScanTimer); autoScanTimer = null; } }

  /* ── Screens ──────────────────────────────────────────────────────────── */

  let screenDef = null;

  function setScreen(name, opts) {
    opts = opts || {};
    const def = SCREENS[name];
    if (!def) return;
    if (opts.push && screen !== name) screenStack.push({ name: screen, restoreId: choice?.getState()?.id ?? null });
    const preserve=screen===name&&opts.index!==undefined;
    screen = name;
    screenDef = def;
    const built = def.build(opts);
    items = built.items;
    $('overlayArt').textContent = built.art || '';
    $('overlayTitle').innerHTML = built.title || '';
    $('overlaySub').innerHTML = built.sub || '';
    $('overlayHint').innerHTML = built.hint !== undefined ? built.hint : 'Tap Space = next &middot; hold Space = back &middot; Enter = choose';
    // Every menu opens with nothing highlighted; the first Space picks the first
    // item. opts.index is only for rebuilding the same screen in place.
    index = opts.index !== undefined ? opts.index : -1;
    while (items[index] && (items[index].enabled === false || items[index].info) && index < items.length - 1) index++;
    showOverlay(true, { center: !!built.center, wide: !!built.wide });
    render();
    syncChoice(!preserve,opts.restoreId ?? null);
    updateFocus();
    if (opts.silent) return;
    choice.announce(built.speech !== undefined ? built.speech : stripTags(built.title || ''));
  }

  function back() {
    const prev = screenStack.pop();
    if (prev) setScreen(prev.name, { restoreId:prev.restoreId });
    else setScreen(G.paused ? 'pause' : 'title');
  }

  const onOff = (v) => (v ? 'On' : 'Off');

  function cycle(list, current) {
    const i = list.indexOf(current);
    return list[(i + 1) % list.length];
  }

  function setAndSpeak(key, value, speech) {
    MG.settings.set(key, value);
    refreshValues();
    if(choice?.active)choice.announce(speech);else AU.say(speech);
  }

  const AIM_LINE_LABEL = { trajectory: 'Trajectory', preview: 'Putt Preview', arrow: 'Arrow' };
  const POWER_LABEL = { hold: 'Hold to Charge', choose: 'Choose from List', auto: 'Automatic' };
  const CAMERA_LABEL = { cinematic: 'Cinematic', overhead: 'Overhead' };
  const POWER_SPEECH = {
    hold: 'Hold to charge. Hold Enter to build power, let go to putt.',
    choose: 'Choose from list. Press Enter, then pick how hard to hit. No holding needed.',
    auto: 'Automatic. You aim, the game picks the power. Press Enter to putt.'
  };

  function voiceName() {
    const v = U.vm();
    if (!v) return 'Default';
    try { return v.getVoiceDisplayName(v.getCurrentVoice()) || 'Default'; } catch (e) { return 'Default'; }
  }

  function ttsOn() { const v = U.vm(); return !!(v && v.getSettings().ttsEnabled); }

  function scanLabel() { return (U.scanInterval() / 1000) + ' s'; }

  function holeWord(n) { return n === 1 ? 'hole' : 'holes'; }

  const SCREENS = {
    title: {
      build() {
        const saved = MG.progress.saved();
        const list = [
          { label: 'Play Golf', icon: '⛳', action: () => setScreen('mode', { push: true }) }
        ];
        if (saved && courses.find(c => c.file === saved.file)) {
          list.push({
            label: 'Continue Round', icon: '▶', sub: saved.name + ' · hole ' + (saved.hole + 1),
            speech: 'Continue round. ' + saved.name + ', hole ' + (saved.hole + 1),
            action: () => resumeRound(saved)
          });
        }
        list.push(
          { label: 'How to Play', icon: '❓', action: () => setScreen('howto', { push: true }) },
          { label: 'Settings', icon: '⚙', action: () => setScreen('settings', { push: true }) },
          { label: 'Course Creator', icon: '✏', sub: 'Needs a mouse', action: () => setScreen('editorWarn', { push: true }) },
          { label: 'Exit Game', icon: '🚪', action: goToHub }
        );
        return { title: "NARBE Mini Golf", art: '', sub: 'Aim with Space. Putt with Enter.', items: list, speech: "NARBE Mini Golf" };
      }
    },

    mode: {
      build() {
        return {
          title: 'How do you want to play?',
          items: [
            { label: 'Casual', icon: '🌤', sub: 'No pressure. Fewest strokes wins.', speech: 'Casual. No pressure. Fewest strokes wins.', action: () => { sel.mode = 'casual'; sel.colors = [MG.settings.get('ballColor')]; setScreen('course', { push: true }); } },
            { label: 'Challenge', icon: '🏆', sub: 'Finish every hole at par or better.', speech: 'Challenge. Finish every hole at paar or better, or start again.', action: () => { sel.mode = 'challenge'; sel.colors = [MG.settings.get('ballColor')]; setScreen('course', { push: true }); } },
            { label: 'Multiplayer', icon: '👥', sub: '2 to 4 players take turns.', speech: 'Multiplayer. 2 to 4 players take turns.', action: () => { sel.mode = 'multi'; setScreen('players', { push: true }); } },
            { label: '← Back', action: back }
          ]
        };
      }
    },

    players: {
      build() {
        return {
          title: 'How many players?',
          items: [2, 3, 4].map(n => ({ label: n + ' Players', icon: '👥', action: () => { sel.count = n; sel.colors = []; setScreen('color', { push: true }); } }))
            .concat([{ label: '← Back', action: back }])
        };
      }
    },

    color: {
      grid: true,
      build() {
        const who = sel.colors.length + 1;
        const taken = new Set(sel.colors);
        const list = A.BALL_COLOR_NAMES.filter(c => !taken.has(c)).map(c => ({
          label: cap(c), swatch: A.BALL_COLORS[c], speech: cap(c),
          action: () => {
            sel.colors.push(c);
            if (sel.colors.length < sel.count) setScreen('color');
            else setScreen('course', { push: true });
          }
        }));
        list.push({ label: '← Back', wide: true, action: () => { if (sel.colors.length) { sel.colors.pop(); setScreen('color'); } else back(); } });
        return { title: 'Player ' + who + ', pick a ball', items: list, speech: 'Player ' + who + ', pick a ball colour' };
      }
    },

    course: {
      build() {
        const list = courses.map((c, i) => {
          const best = MG.progress.best(c.file, sel.mode === 'challenge' ? 'challenge' : 'casual');
          const par = c.course.holes.reduce((a, h) => a + h.par, 0);
          const th = A.theme(c.course.theme);
          return {
            label: c.course.name, icon: c.course.theme === 'night' ? '🌙' : c.course.theme === 'sunset' ? '🌅' : c.course.theme === 'autumn' ? '🍂' : '☀',
            sub: c.course.holes.length + ' holes · par ' + par + (best && sel.mode !== 'multi' ? ' · best ' + best : '') + ' · ' + th.label,
            speech: c.course.name + '. ' + c.course.holes.length + ' holes, paar ' + par + (best && sel.mode !== 'multi' ? '. Your best is ' + best : '') + '.',
            onFocus: () => G.attract(c.course, c.file),
            action: () => beginRound(c)
          };
        });
        list.push({ label: 'Load Custom Course…', icon: '📂', sub: 'Needs a mouse', action: () => setScreen('loadWarn', { push: true }) });
        list.push({ label: '← Back', action: back });
        return { title: 'Choose a course', items: list };
      }
    },

    howto: {
      build() {
        const one = U.isOneSwitch();
        const pm = MG.settings.get('power');
        const aimLine = one ? 'Your aim sweeps around by itself. Press Enter to stop it.' : 'Hold Space to turn your aim. Each new press turns the other way.';
        const powerLine = pm === 'hold' ? 'Hold Enter to charge the putt. Let go to hit it.'
          : pm === 'choose' ? 'Press Enter, then pick how hard to hit from the list.'
            : 'Press Enter to putt. The game picks the power.';
        const pauseLine = MG.settings.get('easyPause') ? 'Before each putt, scan to your putter to putt, or to Pause.' : 'Hold Enter to pause.';
        const lines = [aimLine, powerLine, pauseLine, 'Fewest strokes wins. Watch out for water, sand, ice, and the alligator!'];
        return {
          title: 'How to Play',
          items: lines.map(t => ({ label: t, info: true })).concat([{ label: '← Back', action: back }]),
          speech: 'How to play. ' + lines.join(' ')
        };
      }
    },

    settings: {
      build() {
        return {
          title: 'Settings',
          items: [
            { label: 'Text to Speech', value: () => onOff(ttsOn()), action: () => { const v = U.vm(); if (v) v.toggleTTS(); refreshValues(); AU.say('Text to speech ' + onOff(ttsOn())); } },
            { label: 'Voice', value: () => voiceName(), action: () => { const v = U.vm(); if (v) v.cycleVoice(); refreshValues(); AU.say('Voice, ' + voiceName()); } },
            { label: 'Aim & Power', value: '›', speech: 'Aim and power settings', action: () => setScreen('setAim', { push: true }) },
            { label: 'Camera & Rules', value: '›', speech: 'Camera and rules settings', action: () => setScreen('setRules', { push: true }) },
            {
              label: 'Auto Scan', value: () => (U.isOneSwitch() ? 'On — One Switch' : 'Off — Two Switches'),
              speech: () => 'Auto scan, ' + (U.isOneSwitch() ? 'on. One switch.' : 'off. Two switches.'),
              action: () => {
                const s = U.sm(); if (!s) return;
                s.toggleAutoScan();
                G.setOneSwitch(U.isOneSwitch());
                refreshValues();
                AU.say(U.isOneSwitch() ? 'Auto scan on. One switch. The aim sweeps by itself and Enter plays.' : 'Auto scan off. Two switches. Space aims, Enter putts.');
                restartAutoScan();
              }
            },
            { label: 'Scan Speed', value: () => scanLabel(), action: () => { const s = U.sm(); if (s) s.cycleScanSpeed(); refreshValues(); AU.say('Scan speed ' + (U.scanInterval() / 1000) + ' seconds'); restartAutoScan(); } },
            {
              label: 'Easy Pause', sub: 'Pause without holding', value: () => onOff(MG.settings.get('easyPause')),
              speech: () => 'Easy pause, ' + onOff(MG.settings.get('easyPause')) + '. Pause without holding.',
              action: () => {
                const v = !MG.settings.get('easyPause');
                MG.settings.set('easyPause', v);
                refreshValues();
                AU.say(v ? 'Easy pause on. Before each putt, scan to your putter to putt, or to Pause.' : 'Easy pause off. Hold Enter to pause.');
              }
            },
            { label: 'Sound Effects', value: () => onOff(MG.settings.get('sfx')), action: () => { MG.settings.set('sfx', !MG.settings.get('sfx')); if (window.SafeAudio) SafeAudio.setEnabled(MG.settings.get('sfx')); refreshValues(); AU.say('Sound effects ' + onOff(MG.settings.get('sfx'))); } },
            { label: 'Ambience', value: () => onOff(MG.settings.get('ambience')), action: () => { MG.settings.set('ambience', !MG.settings.get('ambience')); AU.ambience(MG.settings.get('ambience')); refreshValues(); AU.say('Ambience ' + onOff(MG.settings.get('ambience'))); } },
            {
              label: 'Reset Progress', danger: true, value: () => (Date.now() - resetArmed < 6000 ? 'Press again to confirm' : ''),
              speech: () => (Date.now() - resetArmed < 6000 ? 'Reset progress. Press again to confirm.' : 'Reset progress. Clears best scores and saved rounds.'),
              action: () => {
                if (Date.now() - resetArmed < 6000) { MG.progress.reset(); resetArmed = 0; refreshValues(); AU.say('Progress reset.'); }
                else { resetArmed = Date.now(); refreshValues(); AU.say('Are you sure? Press again to reset best scores and saved rounds.'); }
              }
            },
            { label: '← Back', action: back }
          ]
        };
      }
    },

    setAim: {
      build() {
        const S = MG.settings;
        return {
          title: 'Aim & Power',
          items: [
            { label: 'Aim Speed', value: () => S.get('aimSpeed'), action: () => { const v = cycle(Object.keys(G.AIM_SPEEDS), S.get('aimSpeed')); setAndSpeak('aimSpeed', v, 'Aim speed ' + v); } },
            { label: 'Aim Line', value: () => AIM_LINE_LABEL[S.get('aimLine')], action: () => {
              const v = cycle(['trajectory', 'preview', 'arrow'], S.get('aimLine'));
              setAndSpeak('aimLine', v, 'Aim line ' + AIM_LINE_LABEL[v] + (v === 'preview' ? '. Shows where the ball will stop.' : v === 'trajectory' ? '. Shows the path and the bounces.' : '. A simple arrow.'));
            } },
            { label: 'Line Thickness', value: () => S.get('lineWidth'), action: () => { const v = cycle(Object.keys(G.LINE_WIDTHS), S.get('lineWidth')); setAndSpeak('lineWidth', v, 'Line thickness ' + v); } },
            { label: 'Power', value: () => POWER_LABEL[S.get('power')], speech: () => 'Power, ' + POWER_LABEL[S.get('power')], action: () => { const v = cycle(['hold', 'choose', 'auto'], S.get('power')); setAndSpeak('power', v, 'Power. ' + POWER_SPEECH[v]); } },
            { label: 'Charge Speed', value: () => S.get('powerSpeed'), sub: 'For Hold to Charge', action: () => { const v = cycle(Object.keys(G.CHARGE_TIMES), S.get('powerSpeed')); setAndSpeak('powerSpeed', v, 'Charge speed ' + v); } },
            { label: 'Ball Colour', value: () => cap(S.get('ballColor')), swatch: A.BALL_COLORS[S.get('ballColor')], action: () => { const v = cycle(A.BALL_COLOR_NAMES, S.get('ballColor')); S.set('ballColor', v); setScreen('setAim', { index: 5, silent: true }); AU.say('Ball colour ' + v); } },
            { label: '← Back', action: back }
          ]
        };
      }
    },

    setRules: {
      build() {
        const S = MG.settings;
        return {
          title: 'Camera & Rules',
          items: [
            { label: 'Camera', value: () => CAMERA_LABEL[S.get('camera')] || 'Cinematic', action: () => {
              const v = cycle(['cinematic', 'overhead'], S.get('camera') === 'overhead' ? 'overhead' : 'cinematic');
              setAndSpeak('camera', v, 'Camera ' + CAMERA_LABEL[v] + (v === 'cinematic' ? '. Behind the ball, facing the hole. It stays still while you aim.' : '. The whole hole from above.'));
            } },
            { label: 'Instant Replays', value: () => onOff(S.get('replays')), action: () => { const v = !S.get('replays'); setAndSpeak('replays', v, 'Instant replays ' + onOff(v)); } },
            { label: 'Alligator', value: () => onOff(S.get('gator')), action: () => { const v = !S.get('gator'); setAndSpeak('gator', v, 'Alligator ' + onOff(v) + (v ? '. It watches balls left near the water.' : '')); } },
            { label: 'Stroke Limit', value: () => (S.get('maxStrokes') ? S.get('maxStrokes') : 'Off'), sub: 'Pick up after this many', action: () => {
              const v = cycle([6, 8, 10, 12, 0], S.get('maxStrokes'));
              setAndSpeak('maxStrokes', v, v ? 'Stroke limit ' + v : 'Stroke limit off');
            } },
            { label: '← Back', action: back }
          ]
        };
      }
    },

    pause: {
      build() {
        return {
          title: 'Paused', center: true,
          items: [
            { label: 'Continue', icon: '▶', action: resumeGame },
            { label: 'Restart Hole', icon: '↺', action: () => { closePause(); G.restartHole(); } },
            { label: 'Settings', icon: '⚙', action: () => setScreen('settings', { push: true }) },
            { label: 'Help', icon: '🙋', speech: 'Help', action: () => AU.say('I need help') },
            { label: 'Main Menu', icon: '🏠', sub: 'Your round is saved after each hole', action: () => { closePause(); G.quitToMenu(); toTitle(); } },
            { label: 'Exit Game', icon: '🚪', action: goToHub }
          ]
        };
      }
    },

    editorWarn: {
      build() {
        const text = 'The Course Creator needs a mouse and keyboard. You will not be able to scan and select with your switch.';
        return {
          title: 'Mouse Required', center: true, sub: text,
          items: [
            { label: 'Cancel', icon: '✖', action: back },
            { label: 'Open Course Creator', icon: '✏', action: openEditor }
          ],
          speech: 'Mouse required. ' + text
        };
      }
    },

    loadWarn: {
      build() {
        const text = 'Loading your own course opens a file picker that needs a mouse. You will not be able to scan and select with your switch.';
        return {
          title: 'Mouse Required', center: true, sub: text,
          items: [
            { label: 'Cancel', icon: '✖', action: back },
            { label: 'Choose a File', icon: '📂', action: pickCourseFile }
          ],
          speech: 'Mouse required. ' + text
        };
      }
    },

    results: {
      build() {
        const s = lastSummary;
        const multi = s.mode === 'multi';
        let title = 'Course Complete!', speech;
        const p0 = s.players[0];
        const rel = (d) => (d === 0 ? 'even' : Math.abs(d) + (d < 0 ? ' under' : ' over'));
        if (multi) {
          const sorted = s.players.slice().sort((a, b) => a.total - b.total);
          const tie = sorted[1] && sorted[0].total === sorted[1].total;
          title = tie ? "It's a tie!" : sorted[0].name + ' wins!';
          speech = title + ' ' + sorted.map((p, i) => U.ordinal(i + 1) + ', ' + p.name + ', ' + p.total).join('. ');
        } else {
          speech = 'Course complete. ' + p0.total + ' strokes, ' + rel(p0.toPar) + ' paar.' + (s.newBest ? ' A new best!' : '');
        }
        return {
          title, center: true, wide: true,
          sub: scoreTableHtml({ pars: s.pars, players: s.players, current: s.pars.length - 1 }) + (s.newBest ? '<div style="margin-top:10px;font-size:1.4rem;color:#c9920f">★ New best score!</div>' : ''),
          items: s.test ? [
            { label: 'Play Again', icon: '↺', action: () => beginRound(courses.find(c => c.file === s.file) || { file: s.file, course: G.course }, true) },
            { label: 'Close', icon: '✖', action: () => window.close() }
          ] : [
            { label: 'Play Again', icon: '↺', action: () => beginRound(courses.find(c => c.file === s.file) || { file: s.file, course: G.course }, true) },
            { label: 'Choose Another Course', icon: '⛳', action: () => { screenStack = [{ name: 'title' }]; setScreen('course'); } },
            { label: 'Main Menu', icon: '🏠', action: toTitle }
          ],
          speech
        };
      }
    }
  };

  function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

  /* ── Round flow ───────────────────────────────────────────────────────── */

  function beginRound(c, keepPlayers) {
    if (!c || !c.course) return;
    sel.file = c.file;
    let players;
    if (sel.mode === 'multi') players = sel.colors.map((col, i) => ({ name: 'Player ' + (i + 1), color: col }));
    else players = [{ name: 'Player 1', color: MG.settings.get('ballColor') }];
    showOverlay(false);
    screenStack = [];
    G.setOneSwitch(U.isOneSwitch());
    AU.ambience(true);
    G.startRound({ course: c.course, file: c.file, mode: sel.mode, players });
  }

  function resumeRound(saved) {
    const c = courses.find(x => x.file === saved.file);
    if (!c) return;
    sel.mode = saved.mode; sel.file = saved.file;
    showOverlay(false);
    screenStack = [];
    G.setOneSwitch(U.isOneSwitch());
    AU.ambience(true);
    G.startRound({ course: c.course, file: c.file, mode: saved.mode, players: saved.players.map(p => ({ name: p.name, color: p.color })), strokes: saved.players.map(p => p.strokes), startHole: saved.hole });
  }

  function toTitle() {
    screenStack = [];
    G.quitToMenu();
    if (courses.length) G.attract(courses[0].course, courses[0].file);
    setScreen('title');
  }

  /* ── Pause ────────────────────────────────────────────────────────────── */

  function openPause() {
    if (G.paused || overlayOn) return;
    if (!G.isPlaying()) return;
    ignoreUntilRelease.Space = keyDown.Space;
    ignoreUntilRelease.Enter = keyDown.Enter;
    clearKeysKeepIgnores();
    hideHoldRing();
    if (powerMenuOn) closePowerMenu();
    G.pause();
    screenStack = [];
    setScreen('pause');
  }

  function closePause() {
    showOverlay(false);
    screenStack = [];
    G.resume();
  }

  function resumeGame() {
    closePause();
    AU.say('Resuming');
    refreshChrome();
  }

  /* ── Editor / custom courses ──────────────────────────────────────────── */

  function openEditor() {
    AU.say('Opening the Course Creator');
    const fallback = () => window.open('editor.html', '_blank');
    try {
      const api = window.parent && window.parent !== window && window.parent.electronAPI ? window.parent.electronAPI : window.electronAPI;
      if (api && api.editor && api.editor.open) {
        api.editor.open('narbeminigolf').then(r => { if (!r || !r.success) fallback(); }).catch(fallback);
      } else fallback();
    } catch (e) { fallback(); }
    back();
  }

  function pickCourseFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const course = MG.course.normaliseCourse(JSON.parse(r.result));
          if (!course.holes.length) throw Error('no holes');
          beginRound({ file: 'custom:' + f.name, course });
        } catch (e) {
          AU.say('That file is not a golf course.');
        }
      };
      r.readAsText(f);
    };
    input.click();
  }

  function goToHub() {
    AU.say('Exiting to hub');
    setTimeout(() => {
      if (window.parent && window.parent !== window) window.parent.postMessage({ action: 'focusBackButton' }, '*');
      else window.location.href = '../../../index.html';
    }, 700);
  }

  /* ── In-game power list ───────────────────────────────────────────────── */

  let pmItems = [], pmIndex = 0, pmMode = 'power';
  let choiceHintSaid = false;

  let pmChoice=null,pmStatus=null,putterScanOutline=null;
  function updatePutterScanOutline(state=pmChoice?.getState()) {
    if(!putterScanOutline)return;
    const rect=powerMenuOn&&!overlayOn&&pmMode==='choice'&&pmIndex===0&&state?.braked?G.putterScreenBounds():null;
    putterScanOutline.style.display=rect?'block':'none';
    if(rect)for(const key of ['left','top','width','height'])putterScanOutline.style[key]=rect[key]+'px';
  }
  function syncPowerChoice(fresh=false){
    if(!powerMenuOn||overlayOn){pmChoice?.sync(null);return;}
    if(!pmStatus){pmStatus=document.createElement('div');pmStatus.id='powerScanStatus';Object.assign(pmStatus.style,{position:'absolute',top:'8px',left:'50%',transform:'translateX(-50%)',zIndex:'18',minBlockSize:'0',pointerEvents:'none'});document.body.append(pmStatus);
      putterScanOutline=document.createElement('span');putterScanOutline.id='putterScanOutline';putterScanOutline.setAttribute('aria-hidden','true');Object.assign(putterScanOutline.style,{position:'fixed',zIndex:'18',borderRadius:'4px',pointerEvents:'none',display:'none',outlineColor:'#fff',outlineOffset:'0'});document.body.append(putterScanOutline);}
    if(!pmChoice)pmChoice=NarbeChoiceScanAdapter.create({holdThreshold:SCAN_BACK_HOLD,stateHost:pmStatus,speak:text=>U.vm()?.speak(text),
      onHighlight(item,state){const previous=pmIndex;pmIndex=item?item.position:-1;if(pmMode==='choice')renderChoice();else{for(const [i,el] of [...$('powerMenu').children].entries())el.classList.toggle('focused',i===pmIndex);if(item&&previous!==pmIndex)G.previewChoice(item.source.p||null);}
        updatePutterScanOutline(state);
        if(!item&&($('powerMenu').contains(document.activeElement)||document.activeElement===$('pauseBtn')))document.activeElement.blur();
      },onSelect:()=>pmActivate(true)});
    pmChoice.sync({key:'shot:'+pmMode,items:pmItems.map((it,i)=>({id:it.label,label:it.speech||it.label,element:pmMode==='choice'?(it.putt?putterScanOutline:$('pauseBtn')):it.element,labelElement:pmMode==='choice'?(it.putt?putterScanOutline:$('pauseBtn')):it.labelElement,source:it,position:i})),statusHost:pmStatus},{fresh});
    pmChoice.setInputHeld(keyDown.Space||keyDown.Enter);
  }


  /**
   * Easy Pause: before each putt the scan goes between two things already on
   * screen — the putter (pick it to take the putt) and the Pause button. The
   * putter comes first, so the press a player makes most is always the first stop.
   */
  function openChoiceMenu(o) {
    o = o || {};
    if (overlayOn || G.paused) return;
    powerMenuOn = true;
    pmMode = 'choice';
    pmItems = [{ label: 'Putter', speech: 'Putter', putt: true }, { label: 'Pause', speech: 'Pause', pause: true }];
    pmIndex = -1;
    renderChoice();
    // Queued, so it follows "Ready." / "Player 2's turn." instead of cutting it off.
    if (!choiceHintSaid) { choiceHintSaid = true; AU.sayQueued('Your putter, or pause. Putter.'); }
    else AU.sayQueued('Putter.');
    syncPowerChoice(true);
    refreshChrome();
    restartAutoScan();
  }

  /** Light up whichever of the two the scan is on. */
  function renderChoice() {
    const on = powerMenuOn && pmMode === 'choice';
    G.setPutterFocus(on && pmIndex === 0);
    $('pauseBtn').classList.toggle('scanFocus', on && pmIndex === 1);
  }

  function onShotChoice(open, o) {
    if (open) openChoiceMenu(o);
    else if (powerMenuOn && pmMode === 'choice') closePowerMenu();
  }

  function openPowerMenu() {
    powerMenuOn = true;
    pmMode = 'power';
    pmItems = G.POWER_STEPS.map(s => ({ label: s.label, p: s.p }))
      .concat([{ label: 'Aim Again', alt: true, reaim: true }, { label: 'Pause', alt: true, options: true }]);
    // Keep the existing medium preview and opening instruction; selection begins blank.
    const initialPreview=pmItems[2];
    pmIndex = -1;
    renderPowerMenu();
    $('powerMenu').classList.add('on');
    G.previewChoice(initialPreview.p);
    AU.say('How hard? ' + initialPreview.label);
    syncPowerChoice(true);
    refreshChrome();
    restartAutoScan();
  }

  function closePowerMenu() {
    const wasChoice = powerMenuOn && pmMode === 'choice';
    powerMenuOn = false;pmChoice?.sync(null);if(putterScanOutline)putterScanOutline.style.display='none';
    $('powerMenu').classList.remove('on');
    if (wasChoice) renderChoice();
    stopAutoScan();
  }

  function renderPowerMenu() {
    const el = $('powerMenu');
    el.innerHTML = '';
    pmItems.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'pItem' + (it.alt ? ' alt' : '') + (i === pmIndex ? ' focused' : '');
      d.innerHTML = '<span class="power-label">'+it.label+'</span>' + (it.p ? '<span class="bar" style="width:' + Math.round(20 + it.p * 80) + '%"></span>' : '');
      U.addTap(d, () => { pmChoice?.align(it.label); pmActivate(); });
      d.addEventListener('mouseenter', () => { if (pmIndex !== i) pmChoice?.align(it.label); });
      it.element=d;it.labelElement=d.querySelector('.power-label');el.appendChild(d);
    });
  }

  function pmStep(delta) {
    if(pmChoice?.active){pmChoice.step(delta);return;}
    pmIndex = (pmIndex + delta + pmItems.length) % pmItems.length;
    if (pmMode === 'choice') renderChoice(); else renderPowerMenu();
    const it = pmItems[pmIndex];
    if (pmMode === 'power') G.previewChoice(it.p || null);
    AU.say(it.speech || it.label);
    AU.play('menuMove', 0.3);
    if (!didBackHold) restartAutoScan();
  }

  function pmActivate(fromChoice=false) {
    if(pmChoice?.active&&!fromChoice){pmChoice.select();return;}
    if(pmIndex<0)return;
    const now = Date.now();
    // Shared scan-manager owns the release cooldown.
    lastActivate = now;
    const it = pmItems[pmIndex];
    AU.play('menuSelect', 0.35);
    if (it.putt) { closePowerMenu(); G.choosePutt(); refreshChrome(); return; }
    if (it.pause) { closePowerMenu(); openPause(); return; }
    if (it.reaim) { closePowerMenu(); G.chooseReaim(); AU.say('Aim again'); refreshChrome(); return; }
    if (it.options) { closePowerMenu(); G.chooseReaim(); openPause(); return; }
    closePowerMenu();
    G.choosePower(it.p);
  }

  /* ── HUD ──────────────────────────────────────────────────────────────── */

  function onHud(h) {
    $('hudHoleNum').textContent = h.hole;
    $('hudHoleOf').textContent = '/ ' + h.holes;
    $('hudParNum').textContent = h.par;
    $('hudStrokesNum').textContent = h.strokes;
    $('hudStrokesLabel').textContent = h.challenge ? 'STROKES (PAR ' + h.par + ')' : 'STROKES';
    $('hudTotalNum').textContent = U.toPar(h.toPar);
    const pc = $('hudPlayer');
    pc.classList.toggle('on', h.multi);
    if (h.multi && h.player) pc.innerHTML = '<span class="dot" style="background:' + h.player.color + '"></span> ' + U.escapeHtml(h.player.name);
    const board = $('hudBoard');
    board.innerHTML = '';
    if (h.multi) for (const r of h.board) {
      const d = document.createElement('div');
      d.className = 'row' + (r.now ? ' now' : '');
      d.innerHTML = '<span class="rowDot" style="background:' + r.color + '"></span>' + U.escapeHtml(r.name) + ' · ' + r.total;
      board.appendChild(d);
    }
  }

  let bannerTimer = null;
  function onBanner(b) {
    const el = $('banner');
    if (!b) { clearTimeout(bannerTimer); el.classList.remove('on'); return; }
    $('bannerNum').textContent = b.num;
    $('bannerName').textContent = b.name;
    $('bannerPar').textContent = b.par;
    clearTimeout(bannerTimer);
    el.classList.remove('on');
    void el.offsetWidth;
    bannerTimer = setTimeout(() => el.classList.add('on'), 250);
  }

  function onBig(text, sub, cls) {
    const el = $('bigText');
    if (!text) { el.classList.remove('on', 'gold'); el.style.display = 'none'; return; }
    el.innerHTML = U.escapeHtml(text) + (sub ? '<small>' + U.escapeHtml(sub) + '</small>' : '');
    el.className = '';
    el.style.display = '';
    void el.offsetWidth;
    el.classList.add('on');
    if (cls) el.classList.add(cls);
  }

  let toastTimer = null;
  function onToast(text, kind) {
    const el = $('toast');
    el.textContent = text;
    el.className = '';
    void el.offsetWidth;
    el.classList.add('on');
    if (kind) el.classList.add(kind);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
  }

  let turnTimer = null;
  function onTurn(p) {
    const el = $('turnCard');
    el.innerHTML = '<span class="dot" style="background:' + (A.BALL_COLORS[p.color] || p.color) + '"></span>' + U.escapeHtml(p.name);
    el.classList.add('on');
    clearTimeout(turnTimer);
    turnTimer = setTimeout(() => el.classList.remove('on'), 1700);
  }

  function onPower(p, full) {
    const el = $('power');
    if (p === null || p === undefined) { el.classList.remove('on', 'full'); chargeFullAt = 0; return; }
    el.classList.add('on');
    el.classList.toggle('full', !!full);
    if (full && !chargeFullAt) chargeFullAt = Date.now();
    if (!full) chargeFullAt = 0;
    $('powerFill').style.width = (p * 100).toFixed(1) + '%';
    $('powerFill').style.backgroundPosition = '0 0';
    $('powerPct').textContent = Math.round(p * 100) + '%';
  }

  function onCinema(on, o) {
    o = o || {};
    document.body.classList.toggle('cinema', !!on);
    $('replayTag').classList.toggle('on', !!(on && o.replay));
    $('skipHint').classList.toggle('on', !!(on && o.skippable));
    refreshChrome();
  }

  function onState() {
    refreshChrome();
    if (G.state !== 'charge') hideHoldRingIfIdle();
  }

  function onPowerMenu(open) {
    if (open) openPowerMenu(); else if (powerMenuOn) closePowerMenu();
  }

  /* ── Scorecard ────────────────────────────────────────────────────────── */

  function markClass(strokes, par) {
    if (!strokes) return '';
    if (strokes === 1) return 'ace';
    const d = strokes - par;
    if (d <= -2) return 'eagle';
    if (d === -1) return 'birdie';
    if (d === 1) return 'bogey';
    if (d >= 2) return 'double';
    return '';
  }

  function scoreTableHtml(d) {
    const n = d.pars.length;
    let h = '<table><tr><th class="name">Hole</th>';
    for (let i = 0; i < n; i++) h += '<th>' + (i + 1) + '</th>';
    h += '<th>Tot</th></tr><tr class="par"><td class="name">Par</td>';
    let pt = 0;
    for (let i = 0; i < n; i++) { h += '<td>' + d.pars[i] + '</td>'; pt += d.pars[i]; }
    h += '<td class="tot">' + pt + '</td></tr>';
    for (const p of d.players) {
      h += '<tr><td class="name"><span class="rowDot" style="background:' + p.color + ';vertical-align:middle;margin-right:8px"></span>' + U.escapeHtml(p.name) + '</td>';
      for (let i = 0; i < n; i++) {
        const v = p.strokes[i];
        const cls = markClass(v, d.pars[i]);
        h += '<td' + (i === d.current ? ' class="cur"' : '') + '>' + (v ? '<span class="mk ' + cls + '">' + v + '</span>' : '') + '</td>';
      }
      h += '<td class="tot">' + p.total + ' <small>(' + U.toPar(p.toPar) + ')</small></td></tr>';
    }
    return h + '</table>';
  }

  function onScorecard(d, o) {
    const el = $('scorecard');
    if (!d) { el.classList.remove('show'); setTimeout(() => { if (!el.classList.contains('show')) el.classList.remove('on'); }, 320); return; }
    $('scoreTitle').textContent = d.course + ' — Scorecard';
    $('scoreTable').innerHTML = scoreTableHtml(d);
    $('scoreHint').textContent = (o && o.final) ? 'Final card' : 'Next hole coming up · press to skip';
    el.classList.add('on');
    requestAnimationFrame(() => el.classList.add('show'));
  }

  function onRoundEnd(summary) {
    lastSummary = summary;
    setTimeout(() => {
      $('scorecard').classList.remove('on', 'show');
      screenStack = [];
      setScreen('results');
    }, 2600);
  }

  /* ── Hold-to-pause ring ───────────────────────────────────────────────── */

  const RING_LEN = 263.9;
  function showHoldRing(p) {
    holdRingOn = true;
    $('holdRing').classList.add('on');
    $('holdRing').querySelector('.fill').style.strokeDashoffset = String(RING_LEN * (1 - U.clamp(p, 0, 1)));
  }
  function hideHoldRing() {
    if (!holdRingOn) return;
    holdRingOn = false;
    $('holdRing').classList.remove('on');
    holdBeepAt = 0;
  }
  function hideHoldRingIfIdle() { if (!keyDown.Enter) hideHoldRing(); }

  /* ── Pointer play (mouse, touch) ──────────────────────────────────────── */

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let pointerDown = false, pointerChargeTimer = null, pointerCharging = false;

  function pointerToCourse(e) {
    const r = e.target.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, MG.main.camera);
    const b = G.currentBall();
    plane.constant = -(b && G.view ? G.view.surfaceY(b.x, b.y) : 0);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x / MG.course.S, y: hit.z / MG.course.S };
  }

  function onPointerMove(e) {
    if (ctx() !== 'play') return;
    if (e.pointerType === 'mouse' || pointerDown) {
      const c = pointerToCourse(e);
      if (c) G.pointerAim(c.x, c.y);
    }
  }

  function onPointerDown(e) {
    if (G.state === 'ready' && !overlayOn && !G.paused) { closePowerMenu(); G.choosePutt(); }
    if (ctx() !== 'play') return;
    if (e.cancelable) e.preventDefault();
    AU.ambience(true);
    pointerDown = true;
    const c = pointerToCourse(e);
    if (c) G.pointerAim(c.x, c.y);
    clearTimeout(pointerChargeTimer);
    pointerChargeTimer = setTimeout(() => {
      if (!pointerDown || G.state !== 'aim') return;
      const saved = MG.settings.get('power');
      // Mouse and touch always charge-and-release, whatever the switch setting.
      if (saved !== 'hold') { MG.settings.set('power', 'hold'); G.enterDown(); MG.settings.set('power', saved); }
      else G.enterDown();
      pointerCharging = true;
    }, 350);
  }

  function onPointerUp() {
    clearTimeout(pointerChargeTimer);
    pointerDown = false;
    if (pointerCharging) { pointerCharging = false; G.enterUp(); }
  }

  /* ── Switch input ─────────────────────────────────────────────────────── */

  const isSwitchKey = (code) => code === 'Space' || code === 'Enter' || code === 'NumpadEnter';
  const normKey = (code) => (code === 'NumpadEnter' ? 'Enter' : code);

  function clearKeysKeepIgnores() {
    spaceBraking=false;choice?.cancelInput();pmChoice?.cancelInput();
    keyDown.Space = false; keyDown.Enter = false;
    clearTimeout(backHoldTimer); backHoldTimer = null;
    clearInterval(backRepeatTimer); backRepeatTimer = null;
    didBackHold = false;
    G.aimRelease();
  }

  function onKeyDown(e) {
    if (e.code === 'Escape') { if (!overlayOn) openPause(); return; }
    if (!isSwitchKey(e.code)) return;
    e.preventDefault();
    const k = normKey(e.code);
    if (e.repeat) return;
    if (ignoreUntilRelease[k]) return;
    if (keyDown[k]) return;
    keyDown[k] = true;
    keyDownAt[k] = Date.now();
    AU.ambience(true);

    const c = ctx();
    if (c === 'menu') {
      const scanner=overlayOn?choice:pmChoice;
      if(k==='Space'&&scanner?.brakePress()){spaceBraking=true;return;}
      scanner?.setInputHeld(true);
      if (k === 'Space' && !backHoldTimer && !backRepeatTimer) {
        didBackHold = false;
        backHoldTimer = setTimeout(() => {
          backHoldTimer = null;
          didBackHold = true;
          stopAutoScan();
          step(-1);
          backRepeatTimer = setInterval(() => step(-1), U.scanInterval());
        }, SCAN_BACK_HOLD);
      }
      return;
    }
    if (c === 'cinema') {
      // Any press skips; that press's release (and any hold) must not leak into aiming.
      G.skip();
      ignoreUntilRelease[k] = true;
      keyDown[k] = false;
      return;
    }
    if (c === 'play') {
      if (k === 'Space') G.aimPress();
      else {
        const r = G.enterDown();
        // The list opened or the putt went: that press is used up. Its release
        // must not select anything. (The Enter hold still counts toward pause
        // in tick() while it stays down.)
        if (r === 'menu' || r === 'putt') ignoreUntilRelease.Enter = true;
      }
    }
  }

  function onKeyUp(e) {
    if (!isSwitchKey(e.code)) return;
    e.preventDefault();
    const k = normKey(e.code);
    if (ignoreUntilRelease[k]) { ignoreUntilRelease[k] = false; keyDown[k] = false; (overlayOn?choice:pmChoice)?.setInputHeld(keyDown.Space||keyDown.Enter);hideHoldRing(); return; }
    if (!keyDown[k]) return;
    keyDown[k] = false;
    hideHoldRing();

    const c = ctx();
    if (c === 'menu') {
      const scanner=overlayOn?choice:pmChoice;
      if(k==='Space'&&spaceBraking){spaceBraking=false;scanner?.brakeRelease();scanner?.setInputHeld(keyDown.Enter);return;}
      scanner?.setInputHeld(keyDown.Space||keyDown.Enter);
      if (k === 'Space') {
        clearTimeout(backHoldTimer); backHoldTimer = null;
        clearInterval(backRepeatTimer); backRepeatTimer = null;
        if (didBackHold) { didBackHold = false; restartAutoScan(); return; }
        step(1);
      } else activate();
      return;
    }
    if (k === 'Space') G.aimRelease();
    else G.enterUp();
  }

  /**
   * The shared scan manager swallows releases that were too short to be a
   * deliberate press and tells us with this event. In a menu that press still
   * counts as a tap. In play, a too-short Enter while charging is a bounce:
   * drop the charge rather than spend a stroke on it.
   */
  function onInputCancelled(e) {
    spaceBraking=false;choice?.cancelInput();
    const code = e && e.detail ? normKey(e.detail.code) : null;
    const wasBack = !!backRepeatTimer;
    const c = ctx();
    if (code === 'Space' || code === 'Enter') {
      const wasDown = keyDown[code];
      keyDown[code] = false;
      if (ignoreUntilRelease[code]) { ignoreUntilRelease[code] = false; return; }
      clearTimeout(backHoldTimer); backHoldTimer = null;
      clearInterval(backRepeatTimer); backRepeatTimer = null;
      didBackHold = false;
      hideHoldRing();
      if (c === 'menu' && wasDown && e.detail.reason === 'too-short' && !wasBack) {
        if (code === 'Space') step(1); else activate();
      } else if (c === 'play') {
        if (code === 'Space') G.aimRelease();
        else G.cancelCharge();
      }
    }
  }

  /* ── Per-frame ────────────────────────────────────────────────────────── */

  function tick() {
    updatePutterScanOutline();
    const c = ctx();
    if (c === 'menu' || c === 'idle') { if (!keyDown.Enter) hideHoldRing(); return; }
    // The pause hold: counted from the press, or from the moment a charge
    // filled up, whichever is later.
    if (!keyDown.Enter) { hideHoldRing(); return; }
    let startAt = keyDownAt.Enter;
    let need = PAUSE_HOLD_MS, show = PAUSE_HOLD_SHOW;
    if (G.state === 'charge') {
      if (!chargeFullAt) { hideHoldRing(); return; }
      startAt = chargeFullAt; need = PAUSE_AFTER_FULL; show = 600;
    }
    const dur = Date.now() - startAt;
    if (dur >= need) { hideHoldRing(); openPause(); return; }
    if (dur >= show) {
      showHoldRing((dur - show) / (need - show));
      const secs = Math.floor(dur / 1000);
      if (secs > holdBeepAt) { holdBeepAt = secs; AU.play('hold' + U.clamp(secs, 1, 5), 0.4); }
    }
  }

  /* ── Boot ─────────────────────────────────────────────────────────────── */

  async function loadCourses() {
    let files = [];
    try { files = await (await fetch('courses/course_list.json', { cache: 'no-store' })).json(); } catch (e) { files = []; }
    const out = [];
    for (const f of files) {
      try {
        const raw = await (await fetch('courses/' + f, { cache: 'no-store' })).json();
        out.push({ file: f, course: MG.course.normaliseCourse(raw) });
      } catch (e) { console.warn('Could not load course', f, e); }
    }
    return out;
  }

  async function init() {
    G.on.hud = onHud; G.on.banner = onBanner; G.on.big = onBig; G.on.toast = onToast;
    G.on.turn = onTurn; G.on.scorecard = onScorecard; G.on.power = onPower; G.on.cinema = onCinema;
    G.on.state = onState; G.on.roundEnd = onRoundEnd; G.on.powerMenu = onPowerMenu; G.on.shotChoice = onShotChoice;

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('narbe-input-cancelled', onInputCancelled);
    window.addEventListener('blur', () => { clearKeysKeepIgnores(); hideHoldRing(); });

    const surface = $('canvasWrap');
    surface.addEventListener('pointermove', onPointerMove, { passive: false });
    surface.addEventListener('pointerdown', onPointerDown, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    U.addTap($('pauseBtn'), () => openPause());
    U.addTap($('scorecard'), () => G.skip());

    const s = U.sm();
    if (s && s.subscribe) s.subscribe(() => { const mode=U.isOneSwitch();if(mode!==choiceAutoMode){choiceAutoMode=mode;clearTimeout(backHoldTimer);clearInterval(backRepeatTimer);backHoldTimer=backRepeatTimer=null;if(keyDown.Space)didBackHold=true;} G.setOneSwitch(U.isOneSwitch()); restartAutoScan(); if (overlayOn) refreshValues(); });
    G.setOneSwitch(U.isOneSwitch());
    if (window.SafeAudio) SafeAudio.setEnabled(MG.settings.get('sfx') !== false);

    courses = await loadCourses();

    // Course Creator "Test Play": ?test=1&hole=N plays the course it left in storage.
    const q = new URLSearchParams(location.search);
    if (q.get('test')) {
      const raw = U.load('testCourse', null);
      if (raw) {
        const course = MG.course.normaliseCourse(raw);
        sel.mode = 'casual';
        G.setOneSwitch(U.isOneSwitch());
        G.startRound({ course, file: 'test', mode: 'casual', players: [{ name: 'Player 1', color: MG.settings.get('ballColor') }], startHole: U.clamp(parseInt(q.get('hole') || '0', 10), 0, course.holes.length - 1), test: true });
        return;
      }
    }

    if (courses.length) G.attract(courses[0].course, courses[0].file);
    setScreen('title');
    // Voices load asynchronously; re-announce once they're ready (the title, if
    // the first try was lost and nothing is highlighted yet).
    setTimeout(() => {
      if (screen !== 'title' || !overlayOn) return;
      if (index >= 0) speakItem();
      else if (!AU.busy()) AU.say('NARBE Mini Golf');
    }, 900);
  }

  MG.ui = { init, tick, setScreen, openPause, get screen() { return screen; }, get context() { return ctx(); }, get courses() { return courses; } };
})();
