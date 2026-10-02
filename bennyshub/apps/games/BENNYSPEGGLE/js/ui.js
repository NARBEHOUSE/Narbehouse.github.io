/**
 * Benny's P3GL — menus, HUD and switch input.
 *
 * Input contexts, decided by what is on screen:
 *   menu     a menu card, results, pause: Space steps on release, hold Space
 *            scans backwards at the player's scan speed, Enter selects on
 *            release, Auto Scan steps by itself. Every choice scans individually.
 *   choice   "Before each shot: Choose Play or Pause" is on and a shot is
 *            waiting: the highlight moves between the board and the Pause
 *            button (bottom-left), scanned and selected like a menu.
 *   play     aiming and shots: presses go to P3.game (see js/game.js).
 * Mouse and touch work everywhere; nothing needs a drag.
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};
  const U = P3.util, C = P3.catalog, L = P3.levels, T = P3.themes;
  const $ = U.$;
  const G = () => P3.game;
  const AU = () => P3.audio || { play() {}, say(t) { const v = U.vm(); if (v) v.speak(t); }, sayQueued(t) { const v = U.vm(); if (v) v.speak(t); }, sayIfIdle() {}, music() {}, setMode() {} };

  const SCAN_BACK_HOLD = 3000;
  const HINT = 'Tap Space = next &middot; hold Space = back &middot; Enter = choose';

  /* ── Menu state ───────────────────────────────────────────────────────── */
  let screen = null, def = null, items = [], index = 0, overlayOn = false;
  let stack = [];
  let navigationVersion = 0;       // invalidates asynchronous navigation after Back or a newer request
  let autoTimer = null, lastActivate = 0, resetArmed = 0, lockUntil = 0;
  let index_ = null;                 // campaigns/index.json entries
  let campaigns = {};                // id → loaded campaign
  let sel = { mode: 'vivid', campaign: null };
  let lastResult = null;
  let choiceIndex = 0, choiceSaid = false;

  const keyDown = { Space: false, Enter: false };
  const keyAt = { Space: 0, Enter: 0 };
  const ignore = { Space: false, Enter: false };
  let backHold = null, backRepeat = null, didBack = false;
  let choiceHoldTimer = null;

  function ctx() {
    if (overlayOn) return 'menu';
    const g = G();
    if (!g) return 'idle';
    if (g.paused) return 'menu';
    if (g.choiceOn && g.state === 'play') return 'choice';
    if (g.state === 'play' || g.state === 'intro') return 'play';
    return 'idle';
  }

  /* ── Overlay plumbing ─────────────────────────────────────────────────── */

  function showOverlay(on) {
    overlayOn = on;
    $('overlay').classList.toggle('on', on);
    if (on) { clearKeysKeepIgnores(); lockUntil = Date.now() + 300; }
    refreshChrome();
    restartAuto();
  }

  function refreshChrome() {
    const g = G();
    const playing = !overlayOn && g && (g.state === 'play' || g.state === 'intro') && !g.paused;
    document.body.classList.toggle('playing', !!playing);
    document.body.classList.toggle('inmenu', !!overlayOn);
    $('pauseBtn').classList.toggle('on', !!playing);
    $('hud').classList.toggle('on', !!(g && g.match && (g.state === 'play' || g.state === 'intro' || g.state === 'result')));
    refreshChoice();
  }

  function itemLabel(it) { return it.speech ? (typeof it.speech === 'function' ? it.speech() : it.speech) : U.stripTags(it.label) + (it.value !== undefined ? ', ' + val(it) : ''); }
  function val(it) { return typeof it.value === 'function' ? it.value() : it.value; }

  function render() {
    const menu = $('menu');
    menu.innerHTML = '';
    menu.className = 'menu ' + (def.layout || 'list');
    items.forEach((it, i) => {
      if (it.rowBreak) { const br = document.createElement('div'); br.className = 'rowBreak'; menu.appendChild(br); return; }
      const el = document.createElement('button');
      el.type = 'button';
      el.disabled = it.enabled === false;
      el.className = 'mi' + (it.cls ? ' ' + it.cls : '') + (it.enabled === false ? ' locked' : '') + (it.info ? ' info' : '') + (it.danger ? ' danger' : '') + (it.primary ? ' primary' : '');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', itemLabel(it));
      if (it.html) el.innerHTML = it.html;
      else {
        if (it.img) { const im = document.createElement('img'); im.className = 'ico'; im.src = it.img; im.alt = ''; el.appendChild(im); }
        else if (it.icon) { const ic = document.createElement('span'); ic.className = 'ico'; ic.textContent = it.icon; el.appendChild(ic); }
        const lab = document.createElement('span'); lab.className = 'lab';
        lab.innerHTML = it.label + (it.sub ? '<span class="sub">' + it.sub + '</span>' : '');
        el.appendChild(lab);
        if (it.value !== undefined) { const v = document.createElement('span'); v.className = 'val'; v.textContent = val(it); el.appendChild(v); }
      }
      U.addTap(el, () => {
        if (it.enabled === false || it.info && !it.action) { if (!it.info) AU().play('menuBlocked'); else { index = i; updateFocus(); speakItem(); } return; }
        index = i; updateFocus(); activate();
      });
      el.addEventListener('mouseenter', () => { if (it.enabled === false || index === i) return; index = i; updateFocus(); });
      el.addEventListener('focus', () => { index = i; updateFocus(); speakItem(); });
      menu.appendChild(el);
    });
  }

  function els() { return Array.from($('menu').querySelectorAll('.mi')); }
  function elOf(i) { let k = -1; for (let j = 0; j <= i; j++) if (!items[j].rowBreak) k++; return els()[k]; }

  function updateFocus() {
    els().forEach(e => e.classList.remove('focused'));
    const e = elOf(index);
    if (e) { e.classList.add('focused'); if (e.scrollIntoView) e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    const it = items[index];
    if (it && it.onFocus) it.onFocus();
  }

  function refreshValues() {
    items.forEach((it, i) => {
      if (it.value === undefined || it.rowBreak) return;
      const e = elOf(i); const v = e && e.querySelector('.val');
      if (v) v.textContent = val(it);
      if (e) e.setAttribute('aria-label', itemLabel(it));
    });
  }

  function speakItem() {
    const it = items[index];
    if (it) AU().say(itemLabel(it));
  }

  const selectable = (it) => it && !it.rowBreak && it.enabled !== false && (!it.info || it.focusable);

  function step(d) {
    if (!items.length) return;
    // Nothing highlighted yet (-1): forward lands on the first item, back on the last.
    let i = index < 0 ? (d > 0 ? -1 : items.length) : index;
    for (let n = 0; n < items.length; n++) {
      i = (i + d + items.length) % items.length;
      if (selectable(items[i])) { index = i; break; }
    }
    updateFocus(); speakItem();
    AU().play('menuMove');
    if (!didBack) restartAuto();
  }

  function activate() {
    if (index < 0) return;             // menus open with nothing highlighted
    if (Date.now() < lockUntil) return;
    const now = Date.now();
    if (now - lastActivate < 160) return;
    lastActivate = now;
    const it = items[index];
    if (!it || it.enabled === false || (it.info && !it.action)) { AU().play('menuBlocked'); return; }
    AU().play('menuSelect');
    if (it.action) it.action();
  }

  /* ── Auto scan ────────────────────────────────────────────────────────── */
  function restartAuto() {
    stopAuto();
    const c = ctx();
    if (c !== 'menu' && c !== 'choice') return;
    if (!U.isOneSwitch()) return;
    if (keyDown.Space || keyDown.Enter) return;
    autoTimer = setInterval(() => { if (ctx() === 'choice') choiceStep(); else step(1); }, U.scanInterval());
  }
  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }

  /* ── Screens ──────────────────────────────────────────────────────────── */

  function setScreen(name, o) {
    o = o || {};
    const S = SCREENS[name];
    if (!S) return;
    if (o.push && screen && screen !== name) stack.push({ name: screen, index, opts: def && def.opts });
    screen = name;
    navigationVersion++;
    def = S(o) || {};
    // History stores screen data, not the action that opened that screen.
    // Replaying push on Back would put the submenu back into the return path.
    def.opts = Object.assign({}, o);
    delete def.opts.push;
    items = def.items || [];
    $('cardTitle').innerHTML = def.title || '';
    $('cardSub').innerHTML = def.sub || '';
    $('cardSub').style.display = def.sub ? '' : 'none';
    $('cardHint').innerHTML = def.hint !== undefined ? def.hint : HINT;
    $('card').className = 'card ' + (def.size || '') + (def.logo ? ' withLogo' : '');
    $('logo').style.display = def.logo ? '' : 'none';
    $('overlay').className = 'on ' + (def.place || 'center');
    // Every menu opens with nothing highlighted; the first Space highlights the first item.
    index = o.index !== undefined ? o.index : -1;
    while (items[index] && !selectable(items[index]) && index < items.length - 1) index++;
    showOverlay(true);
    render();
    updateFocus();
    if (def.onShow) def.onShow();
    if (o.silent) return;
    const intro = def.speech !== undefined ? def.speech : U.stripTags(def.title || '');
    const first = items[index] ? itemLabel(items[index]) : '';
    AU().say(first ? (intro ? intro + '. ' : '') + first : intro);
  }

  function back() {
    const prev = stack.pop();
    if (prev) setScreen(prev.name, Object.assign({}, prev.opts || {}, { index: undefined }));
    else setScreen(G() && G().paused ? 'pause' : 'title');
  }

  function hideOverlay() { navigationVersion++; showOverlay(false); screen = null; }

  const onOff = (v) => (v ? 'On' : 'Off');
  function cycle(list, cur) { const i = list.indexOf(cur); return list[(i + 1) % list.length]; }
  function voiceName() { const v = U.vm(); if (!v) return 'Default'; try { return v.getVoiceDisplayName(v.getCurrentVoice()) || 'Default'; } catch (e) { return 'Default'; } }
  function ttsOn() { const v = U.vm(); try { return !!(v && v.getSettings().ttsEnabled); } catch (e) { return false; } }
  function setSay(k, v, speech) { G().store.set(k, v); refreshValues(); AU().say(speech); }

  function modeIcon(m) { return m === 'cozy' ? '☕' : m === 'hyper' ? '🚀' : '🎨'; }

  function campaignEntries(mode) { return (index_ || []).filter(e => e.mode === mode && !e.extra); }

  function progressText(id, n) {
    const p = G().prog;
    const done = p.done(id), stars = p.stars(id);
    if (!done) return 'New · ' + n + ' levels';
    return done + ' of ' + n + ' levels · ' + stars + ' ★';
  }

  const SCREENS = {
    title() {
      const res = U.load('resume', null);
      const list = [];
      if (res && findEntry(res.camp, res.source)) {
        const e = findEntry(res.camp, res.source);
        list.push({ label: 'Continue', icon: '▶', primary: true, sub: e.title + ' · Level ' + (res.level + 1), speech: 'Continue. ' + e.title + ', level ' + (res.level + 1), action: () => resumeSaved(res) });
      }
      list.push(
        { label: 'Play', icon: '🎯', primary: !list.length, sub: 'Cozy, Vivid or Hyper', speech: 'Play. Choose Cozy, Vivid or Hyper.', action: () => setScreen('modes', { push: true }) },
        { label: 'How to Play', icon: '❓', action: () => setScreen('howto', { push: true }) },
        { label: 'Settings', icon: '⚙', action: () => setScreen('settings', { push: true }) },
        { label: 'Campaign Editor', icon: '✏', sub: 'Needs a mouse', speech: 'Campaign editor. Needs a mouse.', action: () => setScreen('editorWarn', { push: true }) },
        { label: 'Exit Game', icon: '🚪', action: goToHub }
      );
      return { title: '', logo: true, place: 'left', items: list, speech: "Benny's P3GL", onShow: () => titleWorld() };
    },

    modes() {
      const M = C.MODES;
      const card = (m) => {
        const camps = campaignEntries(m);
        const stars = camps.reduce((a, e) => a + G().prog.stars(e.id), 0);
        const done = camps.reduce((a, e) => a + G().prog.done(e.id), 0);
        const cover = camps[0] ? camps[0].cover : '';
        return {
          cls: 'modeCard mode-' + m,
          html: '<div class="mcArt" style="background-image:url(' + cover + ')"><span class="mcBadge">' + modeIcon(m) + '</span></div>' +
            '<div class="mcBody"><div class="mcName">' + M[m].name + '</div><div class="mcTag">' + M[m].tagline + '</div>' +
            '<div class="mcProg">' + (done ? done + ' levels · ' + stars + ' ★' : '3 campaigns · 60 levels') + '</div></div>',
          speech: M[m].speech,
          onFocus: () => previewMode(m),
          action: () => { sel.mode = m; setScreen('campaigns', { push: true }); }
        };
      };
      const list = ['cozy', 'vivid', 'hyper'].map(card);
      list.push({ rowBreak: true });
      list.push({ label: 'My Campaigns', icon: '📁', cls: 'wide', sub: 'Made in the editor or opened from a file', action: () => setScreen('mine', { push: true }) });
      const orig = (index_ || []).find(e => e.extra);
      if (orig) list.push({ label: orig.title, icon: '⭐', cls: 'wide', sub: orig.blurb, action: () => openCampaign(orig) });
      list.push({ label: '← Back', cls: 'wide', action: back });
      return { title: 'Choose your mood', size: 'xwide', layout: 'modes', items: list };
    },

    campaigns() {
      const m = sel.mode;
      const list = campaignEntries(m).map((e, i) => ({
        cls: 'campCard',
        html: '<div class="ccArt" style="background-image:url(' + e.cover + ')"></div><div class="ccText"><div class="ccName">' + U.escapeHtml(e.title) + '</div><div class="ccBlurb">' + U.escapeHtml(e.blurb) + '</div><div class="ccProg">' + progressText(e.id, e.levels) + (G().prog.done(e.id) >= e.levels ? ' · ✔ Complete' : '') + '</div></div>',
        speech: e.title + '. ' + e.blurb + ' ' + progressText(e.id, e.levels).replace('★', 'stars').replace('·', '.'),
        onFocus: () => previewCampaign(e),
        action: () => openCampaign(e)
      }));
      list.push({ rowBreak: true });
      list.push({ label: '← Back', cls: 'wide', action: back });
      return { title: C.MODES[m].name + ' campaigns', sub: C.MODES[m].tagline, size: 'xwide', layout: 'camps', items: list, speech: C.MODES[m].name + ' campaigns' };
    },

    levels(o) {
      const camp = sel.campaign;
      const p = G().prog.of(camp.id);
      const next = Math.min(p.next || 0, camp.levels.length - 1);
      const list = [];
      list.push({ label: (p.next ? 'Continue: ' : 'Start: ') + 'Level ' + (next + 1), sub: camp.levels[next].name, icon: '▶', primary: true, cls: 'wide', speech: 'Play level ' + (next + 1) + ', ' + camp.levels[next].name, action: () => play(camp, next) });
      list.push({ rowBreak: true });
      camp.levels.forEach((lv, i) => {
        const r = p.lv[i];
        const locked = i > (p.next || 0) && !test();
        const st = r ? '★'.repeat(r.stars || 0) + '☆'.repeat(3 - (r.stars || 0)) : '';
        list.push({
          cls: 'lvTile' + (r && r.done ? ' done' : '') + (locked ? ' lockedTile' : ''),
          html: '<div class="lvNum">' + (locked ? '🔒' : i + 1) + '</div><div class="lvStars">' + (r && r.done ? st : r && r.skipped ? 'skipped' : '&nbsp;') + '</div>',
          enabled: !locked,
          speech: 'Level ' + (i + 1) + ', ' + lv.name + (r && r.done ? '. ' + (r.stars || 0) + ' stars' : r && r.skipped ? '. Skipped' : ''),
          action: () => play(camp, i)
        });
        if (i % 5 === 4) list.push({ rowBreak: true });
      });
      list.push({ rowBreak: true });
      list.push({ label: '← Back', cls: 'wide', action: back });
      return {
        title: U.escapeHtml(camp.title), sub: progressText(camp.id, camp.levels.length), size: 'wide', layout: 'levels', items: list,
        speech: camp.title + '. ' + progressText(camp.id, camp.levels.length).replace('★', 'stars').replace('·', '.'),
        onShow: () => { G().showWorld(camp.theme, { variant: next }); }
      };
    },

    mine() {
      const lib = L.library();
      const list = lib.map(c => ({
        label: U.escapeHtml(c.title), img: c.cover || '', icon: c.cover ? undefined : '📘',
        sub: C.MODES[c.mode].name + ' · ' + c.levels.length + ' levels · ' + progressText(c.id, c.levels.length),
        action: () => { c.source = 'library'; campaigns[c.id] = c; sel.campaign = c; sel.mode = c.mode; setScreen('levels', { push: true }); }
      }));
      if (!list.length) list.push({ label: 'No campaigns yet', info: true, sub: 'Make one in the Campaign Editor, or open a file.' });
      list.push({ label: 'Open a campaign file…', icon: '📂', sub: 'Needs a mouse', action: () => setScreen('loadWarn', { push: true }) });
      list.push({ label: '← Back', action: back });
      return { title: 'My Campaigns', items: list };
    },

    howto() {
      const one = U.isOneSwitch();
      const pre = G().store.get('preShot');
      const aimLine = one ? 'Your aim sweeps back and forth by itself. Press Enter to stop it, and let go to shoot.' : 'Hold Space to sweep your aim. Each new press turns the other way. Let go of Enter to shoot.';
      const lines = [
        aimLine,
        pre ? 'Before each shot, choose Play to aim, or Pause. Holding Enter does not pause.' : 'Hold Enter to pause, or press the Pause button in the corner.',
        'Pegs light up when your ball hits them, and clear away when the ball is gone.',
        'Each level has a goal. Goal pieces have a glowing ring, and goal pegs carry a star.',
        'Fever starts at times one each shot. Hit five, ten or fifteen new pieces in that shot to reach times two, three or five. Big shots earn free balls.',
        'The base plate at the bottom can bounce your ball back up, or catch it for a free ball. Some plates switch between the two.'
      ];
      const list = lines.map(t => ({ label: t, info: true, focusable: true, speech: t }));
      list.push({ label: 'Powers', icon: '⚡', value: '›', action: () => setScreen('legend', { push: true, group: 'power' }) });
      list.push({ label: 'Hazards', icon: '⚠', value: '›', action: () => setScreen('legend', { push: true, group: 'hazard' }) });
      list.push({ label: 'Pegs, bricks and more', icon: '🔷', value: '›', action: () => setScreen('legend', { push: true, group: 'other' }) });
      list.push({ label: '← Back', action: back });
      return { title: 'How to Play', items: list, speech: 'How to play' };
    },

    legend(o) {
      const groups = {
        power: Object.keys(C.TYPES).filter(t => C.TYPES[t].role === 'power'),
        hazard: Object.keys(C.TYPES).filter(t => C.TYPES[t].role === 'hazard'),
        other: ['peg', 'gem', 'lantern', 'key', 'gate', 'bumper', 'steel', 'portal', 'brick', 'armor', 'glass', 'wall']
      };
      const titles = { power: 'Powers', hazard: 'Hazards', other: 'Pegs, bricks and more' };
      const list = groups[o.group].map(t => ({
        label: C.TYPES[t].name, img: P3.icons.url(t === 'brick' ? { t: 'brick', hp: 2 } : t, 64), sub: C.TYPES[t].desc, info: true, focusable: true,
        speech: C.TYPES[t].name + '. ' + C.TYPES[t].desc
      }));
      list.push({ label: '← Back', action: back });
      return { title: titles[o.group], items: list, size: 'wide' };
    },

    settings() {
      const S = G().store;
      return {
        title: 'Settings',
        items: [
          { label: 'Text to Speech', value: () => onOff(ttsOn()), action: () => { const v = U.vm(); if (v) v.toggleTTS(); refreshValues(); AU().say('Text to speech ' + onOff(ttsOn())); } },
          { label: 'Voice', value: () => voiceName(), action: () => { const v = U.vm(); if (v) v.cycleVoice(); refreshValues(); AU().say('Voice, ' + voiceName()); } },
          {
            label: 'Before Each Shot', value: () => (S.get('preShot') ? 'Choose Play or Pause' : 'Aim right away'),
            speech: () => 'Before each shot, ' + (S.get('preShot') ? 'choose play or pause.' : 'aim right away.'),
            action: () => {
              const v = !S.get('preShot');
              setSay('preShot', v, v ? 'Before each shot, choose play or pause. Hold to pause is off.' : 'Aim right away. Hold Enter to pause.');
            }
          },
          { label: 'Aim & Guide', value: '›', speech: 'Aim and guide settings', action: () => setScreen('setAim', { push: true }) },
          { label: 'Display & Sound', value: '›', speech: 'Display and sound settings', action: () => setScreen('setDisplay', { push: true }) },
          {
            label: 'Auto Scan', value: () => (U.isOneSwitch() ? 'On — One Switch' : 'Off — Two Switches'),
            speech: () => 'Auto scan, ' + (U.isOneSwitch() ? 'on. One switch.' : 'off. Two switches.'),
            action: () => {
              const s = U.sm(); if (!s) return;
              s.toggleAutoScan(); refreshValues();
              AU().say(U.isOneSwitch() ? 'Auto scan on. One switch. The aim sweeps by itself, and Enter shoots.' : 'Auto scan off. Two switches. Hold Space to aim, and Enter shoots.');
              restartAuto();
            }
          },
          { label: 'Scan Speed', value: () => (U.scanInterval() / 1000) + ' s', action: () => { const s = U.sm(); if (s) s.cycleScanSpeed(); refreshValues(); AU().say('Scan speed ' + (U.scanInterval() / 1000) + ' seconds'); restartAuto(); } },
          { label: 'Sound Effects', value: () => onOff(S.get('sfx')), action: () => { const v = !S.get('sfx'); setSay('sfx', v, 'Sound effects ' + onOff(v)); } },
          {
            label: 'Reset Progress', danger: true, value: () => (Date.now() - resetArmed < 6000 ? 'Press again to confirm' : ''),
            speech: () => (Date.now() - resetArmed < 6000 ? 'Reset progress. Press again to confirm.' : 'Reset progress. Clears your stars and saved levels. Your settings stay.'),
            action: () => {
              if (Date.now() - resetArmed < 6000) { G().prog.reset(); resetArmed = 0; refreshValues(); AU().say('Progress reset.'); }
              else { resetArmed = Date.now(); refreshValues(); AU().say('Are you sure? Press again to clear all stars and saved levels.'); }
            }
          },
          { label: '← Back', action: back }
        ]
      };
    },

    setAim() {
      const S = G().store;
      const GL = { auto: 'Mode default', short: 'Short', medium: 'Medium', long: 'Long' };
      return {
        title: 'Aim & Guide',
        items: [
          { label: 'Aim Speed', value: () => S.get('aimSpeed'), action: () => { const v = cycle(C.AIM_SPEED_IDS, S.get('aimSpeed')); setSay('aimSpeed', v, 'Aim speed ' + v); } },
          { label: 'Aim Guide', value: () => GL[S.get('guide')], speech: () => 'Aim guide, ' + GL[S.get('guide')], action: () => { const v = cycle(['auto', 'short', 'medium', 'long'], S.get('guide')); setSay('guide', v, 'Aim guide ' + GL[v] + (v === 'long' ? '. Shows your first bounces.' : v === 'auto' ? '. Cozy long, Vivid medium, Hyper short.' : '')); } },
          { label: 'Guide Colour', value: () => cap(S.get('aimColor')), action: () => { const v = cycle(Object.keys(G().AIM_COLORS), S.get('aimColor')); setSay('aimColor', v, 'Guide colour ' + v); } },
          { label: 'Guide Size', value: () => cap(S.get('guideSize')), action: () => { const v = cycle(['normal', 'large'], S.get('guideSize')); setSay('guideSize', v, 'Guide size ' + v); } },
          { label: '← Back', action: back }
        ]
      };
    },

    setDisplay() {
      const S = G().store;
      const BD = ['Clear', 'Dim', 'Dark'];
      const Q = { auto: 'Automatic', high: 'High', low: 'Low' };
      return {
        title: 'Display & Sound',
        items: [
          { label: 'Music', value: () => onOff(S.get('music')), action: () => { const v = !S.get('music'); setSay('music', v, 'Music ' + onOff(v)); } },
          { label: 'Board Backdrop', sub: 'Darker makes pegs stand out', value: () => BD[S.get('backdrop')], action: () => { const v = (S.get('backdrop') + 1) % 3; setSay('backdrop', v, 'Board backdrop ' + BD[v]); } },
          { label: 'Motion', value: () => (S.get('motion') === 'reduced' ? 'Reduced' : 'Full'), action: () => { const v = S.get('motion') === 'reduced' ? 'full' : 'reduced'; setSay('motion', v, 'Motion ' + (v === 'reduced' ? 'reduced. Calmer backgrounds, no shaking.' : 'full')); } },
          { label: 'Graphics', value: () => Q[S.get('quality')], action: () => { const v = cycle(['auto', 'high', 'low'], S.get('quality')); setSay('quality', v, 'Graphics ' + Q[v]); } },
          { label: '← Back', action: back }
        ]
      };
    },

    pause() {
      const g = G();
      const list = [
        { label: 'Continue', icon: '▶', primary: true, action: resumeGame },
        { label: 'Restart Level', icon: '↺', action: () => { closePause(); g.restartLevel(); } },
        { label: 'Settings', icon: '⚙', action: () => setScreen('settings', { push: true }) },
        { label: 'How to Play', icon: '❓', action: () => setScreen('howto', { push: true }) },
        { label: 'Help', icon: '🙋', speech: 'Help', action: () => AU().say('I need help') }
      ];
      if (g.test) list.push({ label: 'Back to Editor', icon: '✏', action: leaveTest });
      else list.push({ label: 'Main Menu', icon: '🏠', sub: 'Your level is saved', action: () => { closePause(true); g.quitToMenu(); toTitle(); } });
      list.push({ label: 'Exit Game', icon: '🚪', action: goToHub });
      const m = g.match;
      const sub = m ? 'Level ' + (g.levelIndex + 1) + ' · ' + U.fmt(m.score) + ' points · ' + g.goalLeftSpeech(m) : '';
      return { title: 'Paused', sub, items: list, speech: 'Paused. ' + sub };
    },

    result(o) {
      const r = lastResult, g = G();
      const camp = r.campaign;
      if (r.won) {
        const stars = '<div class="bigStars">' + [1, 2, 3].map(n => '<span class="' + (n <= r.stars ? 'on' : '') + '" style="animation-delay:' + (n * 0.25) + 's">★</span>').join('') + '</div>';
        const list = [];
        if (r.test) {
          list.push({ label: 'Play Again', icon: '↺', primary: true, action: () => { hideOverlay(); g.restartLevel(); } }, { label: 'Back to Editor', icon: '✏', action: leaveTest });
        } else {
          if (!r.last) list.push({ label: 'Next Level', icon: '▶', primary: true, sub: camp.levels[r.index + 1].name, action: () => play(camp, r.index + 1) });
          list.push({ label: 'Replay Level', icon: '↺', action: () => play(camp, r.index) });
          list.push({ label: 'Choose a Level', icon: '▦', action: () => { sel.campaign = camp; stack = [{ name: 'title', index: 0 }, { name: 'modes', index: 0 }]; g.quitToMenu(); setScreen('levels'); } });
          list.push({ label: 'Main Menu', icon: '🏠', action: () => { g.quitToMenu(); toTitle(); } });
        }
        const title = r.last && !r.test ? 'Campaign complete!' : 'Level complete!';
        const sub = stars + '<div class="resScore">' + U.fmt(r.score) + '</div>' + (r.newBest ? '<div class="newBest">New best!</div>' : '<div class="resBest">Best ' + U.fmt(r.best) + '</div>') + (r.ballBonus ? '<div class="resNote">Includes ' + U.fmt(r.ballBonus) + ' for ' + U.plural(r.ballsLeft, 'ball') + ' left</div>' : '');
        const speech = (r.last && !r.test ? 'Campaign complete! ' : 'Level complete! ') + U.fmt(r.score) + ' points. ' + U.plural(r.stars, 'star') + '.' + (r.newBest ? ' A new best!' : '');
        return { title, sub, items: list, speech, size: 'result' };
      }
      const list = [{ label: 'Try Again', icon: '↺', primary: true, action: () => { hideOverlay(); g.restartLevel(); } }];
      if (r.canSkip) list.push({ label: 'Skip This Level', icon: '⏭', sub: 'Move on and come back later', action: () => {
        g.skipLevel();
        if (!r.last) play(camp, r.index + 1);
        else { sel.campaign = camp; g.quitToMenu(); stack = [{ name: 'title', index: 0 }, { name: 'modes', index: 0 }]; setScreen('levels'); }
      } });
      if (r.test) list.push({ label: 'Back to Editor', icon: '✏', action: leaveTest });
      else {
        list.push({ label: 'Choose a Level', icon: '▦', action: () => { sel.campaign = camp; stack = [{ name: 'title', index: 0 }, { name: 'modes', index: 0 }]; g.quitToMenu(); setScreen('levels'); } });
        list.push({ label: 'Main Menu', icon: '🏠', action: () => { g.quitToMenu(); toTitle(); } });
      }
      return { title: 'Out of balls', sub: '<div class="resLeft">' + U.escapeHtml(r.leftSpeech) + '</div>', items: list, speech: 'Out of balls. ' + r.leftSpeech + '. Try again?', size: 'result' };
    },

    editorWarn() {
      const text = 'The Campaign Editor needs a mouse and keyboard. You will not be able to scan and select with your switch there.';
      return { title: 'Mouse needed', sub: text, items: [{ label: 'Cancel', icon: '✖', primary: true, action: back }, { label: 'Open the Editor', icon: '✏', action: openEditor }], speech: 'Mouse needed. ' + text };
    },

    loadWarn() {
      const text = 'Opening a campaign file uses a file picker that needs a mouse. You will not be able to scan and select with your switch there.';
      return { title: 'Mouse needed', sub: text, items: [{ label: 'Cancel', icon: '✖', primary: true, action: back }, { label: 'Choose a File', icon: '📂', action: pickFile }], speech: 'Mouse needed. ' + text };
    },

    message(o) {
      return { title: o.title, sub: o.text, items: [{ label: 'OK', icon: '✔', action: back }], speech: o.title + '. ' + U.stripTags(o.text || '') };
    }
  };

  function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
  function test() { return false; }

  /* ── Worlds behind the menus ──────────────────────────────────────────── */
  let titleCamp = null;
  async function titleWorld() {
    const lastMode = U.load('lastMode', 'vivid');
    const e = campaignEntries(lastMode)[0] || (index_ || [])[0];
    G().showWorld(e ? e.theme : 'sugar-rush', { music: 'title' });
    if (e) {
      try {
        const camp = await loadEntry(e);
        if (screen === 'title' && G().state === 'menu') { titleCamp = camp; G().startAttract(camp, 0); setMenuLayout(true); }
      } catch (err) { console.warn(err); }
    }
  }
  function previewMode(m) {
    G().stopAttract(); setMenuLayout(false);
    const e = campaignEntries(m)[0];
    G().showWorld(e ? e.theme : T.BY_MODE[m][0], { music: 'menu-' + m });
  }
  function previewCampaign(e) {
    G().stopAttract(); setMenuLayout(false);
    G().showWorld(e.theme, { music: T.theme(e.theme).music });
  }

  /* ── Campaign loading ─────────────────────────────────────────────────── */
  function findEntry(id, source) {
    if (source === 'library') return L.library().find(c => c.id === id) || null;
    return (index_ || []).find(e => e.id === id) || null;
  }
  async function loadEntry(e) {
    if (campaigns[e.id]) return campaigns[e.id];
    const c = await L.loadCampaign(e);
    c.source = 'builtin';
    if (e.cover) c.cover = e.cover;
    campaigns[e.id] = c;
    return c;
  }
  async function openCampaign(e) {
    const request = ++navigationVersion;
    try {
      const c = await loadEntry(e);
      if (request !== navigationVersion) return;
      sel.campaign = c; sel.mode = c.mode;
      setScreen('levels', { push: true });
    } catch (err) {
      if (request !== navigationVersion) return;
      setScreen('message', { push: true, title: 'Could not open that campaign', text: 'The campaign file did not load.' });
    }
  }
  async function resumeSaved(res) {
    const request = ++navigationVersion;
    try {
      let c;
      if (res.source === 'library') { c = L.library().find(x => x.id === res.camp); if (c) c.source = 'library'; }
      else c = await loadEntry(findEntry(res.camp, 'builtin'));
      if (request !== navigationVersion) return;
      if (!c) throw new Error('missing');
      sel.campaign = c; sel.mode = c.mode;
      if (!Number.isInteger(res.level) || !c.levels[res.level] || !res.snap) throw new Error('invalid save');
      play(c, res.level, res.snap, res.attempts);
    } catch (err) {
      if (request !== navigationVersion) return;
      U.remove('resume'); setScreen('title');
    }
  }

  function play(camp, li, snap, attempts) {
    U.save('lastMode', camp.mode);
    hideOverlay();
    stack = [];
    setMenuLayout(false);
    G().startLevel(camp, li, { snapshot: snap || null, attempts: attempts || 0 });
    refreshChrome();
  }

  function toTitle() {
    stack = [];
    setScreen('title');
  }

  /* ── Pause ────────────────────────────────────────────────────────────── */
  function openPause() {
    const g = G();
    if (overlayOn || !g.match) return;
    if (!g.pause()) return;
    ignore.Space = keyDown.Space; ignore.Enter = keyDown.Enter;
    clearKeysKeepIgnores();
    hideHold();
    stack = [];
    setScreen('pause');
  }
  function closePause(quiet) { hideOverlay(); stack = []; G().resume(); refreshChrome(); restartAuto(); }
  function resumeGame() { closePause(); AU().say('Resuming'); }

  /* ── The Play / Pause choice before each shot ─────────────────────────── */
  function refreshChoice() {
    const on = ctx() === 'choice';
    document.body.classList.toggle('choosing', on);
    $('choiceFrame').classList.toggle('on', on && choiceIndex === 0);
    $('pauseBtn').classList.toggle('focused', on && choiceIndex === 1);
  }
  function openChoice() {
    choiceIndex = 0;
    ignore.Space = keyDown.Space; ignore.Enter = keyDown.Enter;
    refreshChoice();
    if (!choiceSaid) { choiceSaid = true; AU().sayQueued('Play, or pause. Play.'); } else AU().sayIfIdle('Play.');
    restartAuto();
  }
  function choiceStep() {
    choiceIndex = 1 - choiceIndex;
    refreshChoice();
    AU().play('menuMove');
    AU().say(choiceIndex === 0 ? 'Play' : 'Pause');
    if (!didBack) restartAuto();
  }
  function choiceSelect() {
    AU().play('menuSelect');
    if (choiceIndex === 1) openPause();
    else { G().choosePlay(); refreshChoice(); stopAuto(); }
  }

  /* ── Hold-to-pause ring ───────────────────────────────────────────────── */
  const RING = 263.9;
  let lastHoldSec = -1;
  function showHold(p, sec) {
    const el = $('holdRing');
    if (!p) { hideHold(); return; }
    el.classList.add('on');
    el.querySelector('.fill').style.strokeDashoffset = String(RING * (1 - U.clamp(p, 0, 1)));
    if (sec !== undefined && sec !== lastHoldSec) { lastHoldSec = sec; AU().play('holdTick', { step: Math.min(4, sec) }); }
  }
  function hideHold() { $('holdRing').classList.remove('on'); lastHoldSec = -1; }

  /* ── HUD ──────────────────────────────────────────────────────────────── */
  let hudState = null;
  function onHud(h) {
    hudState = h;
    $('hudLevel').innerHTML = '<span class="k">Level</span> <b>' + h.level + '</b><span class="of">/' + h.levels + '</span><span class="nm">' + U.escapeHtml(h.name) + '</span>';
    const gIcon = h.goal.icon ? '<img class="gi" alt="" src="' + P3.icons.url(h.goal.color ? { t: 'peg', c: h.goal.color } : h.goal.icon, 48, h.goal.color ? { target: true } : {}) + '">' : '';
    const frac = h.total ? Math.min(1, h.done / h.total) : 0;
    const count = h.goalType === 'score' ? U.fmt(h.done) + ' / ' + U.fmt(h.total) : h.done + ' / ' + h.total;
    $('hudGoal').innerHTML = gIcon + '<div class="gt"><div class="gk">' + U.escapeHtml(h.goal.short) + '</div><div class="gc">' + count + '</div><div class="gbar"><i style="width:' + (frac * 100).toFixed(1) + '%"></i></div></div>';
    $('hudScore').innerHTML = '<span class="k">Score</span><b>' + U.fmt(h.score) + '</b>' + starTicks(h);
    let tube = '';
    const shown = Math.min(h.balls, 12);
    for (let i = 0; i < shown; i++) tube += '<i></i>';
    $('hudBalls').innerHTML = '<span class="k">Balls</span><b>' + h.balls + '</b><div class="tube">' + tube + '</div>';
    const fv = [1, 2, 3, 5];
    $('hudFever').innerHTML = '<span class="k">Shot Fever</span><div class="fev">' + fv.map(f => '<span class="' + (h.fever >= f ? 'on' : '') + (h.fever === f ? ' cur' : '') + '">×' + f + '</span>').join('') + '</div>';
    const ids = Object.keys(h.banked);
    $('hudPowers').innerHTML = ids.length ? '<span class="k">Next shot</span><div class="pw">' + ids.map(id => '<span class="pwi" title="' + C.TYPES[id].name + '"><img alt="" src="' + P3.icons.url(id, 48) + '">' + (h.banked[id] > 1 ? '<em>' + h.banked[id] + '</em>' : '') + '</span>').join('') + '</div>' : '';
    $('hudPowers').classList.toggle('empty', !ids.length);
    const plateWord = h.plate === 'timed' ? 'Switching' : cap(h.plate);
    $('hudPlate').innerHTML = '<span class="k">Plate</span><b class="pl-' + h.plate + '">' + plateWord + '</b>';
  }
  function starTicks(h) {
    const top = h.stars[1] * 1.15;
    const f = Math.min(1, h.score / top);
    return '<div class="sbar"><i style="width:' + (f * 100).toFixed(1) + '%"></i><s style="left:' + (h.stars[0] / top * 100).toFixed(1) + '%">★</s><s style="left:' + (h.stars[1] / top * 100).toFixed(1) + '%">★</s></div>';
  }

  function onLevelStart(d) {
    const el = $('banner');
    $('bannerNum').textContent = d.index + 1;
    $('bannerName').textContent = d.level.name;
    $('bannerGoal').textContent = d.goal.short + (d.goal.score || d.goal.chain ? '' : ' · ' + G().match.goal.total);
    $('bannerIntro').textContent = d.level.intro || '';
    document.body.dataset.mode = d.mode;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    refreshChrome();
    hideHold();
  }

  function onState(d) {
    if (d.state === 'play') $('banner').classList.remove('on');
    refreshChrome();
  }

  function onResult(r) {
    lastResult = r;
    stack = [];
    setScreen('result');
  }

  /* ── Layout ───────────────────────────────────────────────────────────── */
  let menuLayout = false;
  function setMenuLayout(on) { menuLayout = on; P3.main && P3.main.relayout(); }
  function applyLayout(Lyt) {
    const r = document.documentElement.style;
    r.setProperty('--bx', Lyt.board.x + 'px'); r.setProperty('--by', Lyt.board.y + 'px');
    r.setProperty('--bw', Lyt.board.w + 'px'); r.setProperty('--bh', Lyt.board.h + 'px');
    r.setProperty('--bs', Lyt.scale);
    document.body.dataset.orient = Lyt.orient;
  }
  function layoutSafe() {
    if (!menuLayout || !overlayOn) return null;
    const w = root.innerWidth, h = root.innerHeight;
    if (w / h < 1.25) return null;
    const card = Math.min(560, Math.max(360, w * 0.34)) + 40;
    return { left: card, right: 0, top: 0, bottom: 0 };
  }

  /* ── Editor, files, hub ───────────────────────────────────────────────── */
  function openEditor() {
    AU().say('Opening the campaign editor');
    // Stay in this browser origin/profile. The desktop hub's generic editor
    // launcher uses a separate Chrome server, whose library the game cannot see.
    root.location.href = 'editor.html';
  }

  function pickFile() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const { campaign, notes } = L.readCampaign(rd.result);
          L.saveToLibrary(campaign);
          campaign.source = 'library';
          campaigns[campaign.id] = campaign;
          sel.campaign = campaign; sel.mode = campaign.mode;
          stack = [{ name: 'title', index: 0 }, { name: 'modes', index: 0 }, { name: 'mine', index: 0 }];
          setScreen('levels');
          if (notes.length) AU().sayQueued(notes[0]);
        } catch (err) {
          setScreen('message', { push: true, title: 'That file did not open', text: U.escapeHtml(err.message) });
        }
      };
      rd.readAsText(f);
    };
    input.click();
  }

  function goToHub() {
    AU().say('Exiting to the hub');
    const s = U.sm(); if (s && s.resetInputState) try { s.resetInputState(); } catch (e) { /* optional */ }
    setTimeout(() => {
      if (root.parent && root.parent !== root) root.parent.postMessage({ action: 'focusBackButton' }, '*');
      else root.location.href = '../../../index.html';
    }, 700);
  }

  function leaveTest() {
    AU().say('Back to the editor');
    if (root.parent && root.parent !== root) root.parent.postMessage({ type: 'p3gl-test-done' }, '*');
    else if (root.opener) root.close();
    else root.location.href = 'editor.html';
  }

  /* ── Switch input ─────────────────────────────────────────────────────── */
  const isSwitch = (c) => c === 'Space' || c === 'Enter' || c === 'NumpadEnter';
  const norm = (c) => (c === 'NumpadEnter' ? 'Enter' : c);

  function clearKeysKeepIgnores() {
    keyDown.Space = false; keyDown.Enter = false;
    clearTimeout(backHold); backHold = null; clearInterval(backRepeat); backRepeat = null; didBack = false;
    clearTimeout(choiceHoldTimer); choiceHoldTimer = null;
  }

  function onKeyDown(e) {
    if (e.code === 'Escape') { if (!overlayOn && G().match && (G().state === 'play' || G().state === 'intro')) openPause(); return; }
    if (!isSwitch(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    const k = norm(e.code);
    P3.audio && P3.audio.unlock && P3.audio.unlock();
    if (ignore[k]) return;
    if (keyDown[k]) return;
    keyDown[k] = true; keyAt[k] = Date.now();
    const c = ctx();
    if (c === 'menu' || c === 'choice') {
      stopAuto();
      if (k === 'Space' && !backHold && !backRepeat) {
        didBack = false;
        backHold = setTimeout(() => {
          backHold = null; didBack = true;
          if (ctx() === 'choice') choiceStep(); else step(-1);
          backRepeat = setInterval(() => { if (ctx() === 'choice') choiceStep(); else step(-1); }, U.scanInterval());
        }, SCAN_BACK_HOLD);
      }
      if (k === 'Enter' && c === 'choice' && !G().store.get('preShot')) {
        // A choice can still be open after changing the setting to Aim right away.
        const full = G().holdToPause();
        const startedAt = keyAt.Enter;
        const tick = () => {
          if (!keyDown.Enter || keyAt.Enter !== startedAt || ctx() !== 'choice' || G().store.get('preShot')) { hideHold(); return; }
          const held = Date.now() - startedAt, from = G().oneSwitch() ? 500 : 2000;
          if (held > from) showHold((held - from) / (full - from), Math.floor((held - from) / 1000));
          if (held >= full) { ignore.Enter = true; keyDown.Enter = false; hideHold(); openPause(); return; }
          choiceHoldTimer = setTimeout(tick, 50);
        };
        choiceHoldTimer = setTimeout(tick, 50);
      }
      return;
    }
    if (c === 'play') {
      const r = G().key('down', k);
      if (r === 'skip') { ignore[k] = true; keyDown[k] = false; }
    }
  }

  function onKeyUp(e) {
    if (!isSwitch(e.code)) return;
    e.preventDefault();
    const k = norm(e.code);
    if (ignore[k]) { ignore[k] = false; keyDown[k] = false; hideHold(); return; }
    if (!keyDown[k]) return;
    keyDown[k] = false;
    const c = ctx();
    if (c === 'menu' || c === 'choice') {
      clearTimeout(choiceHoldTimer); choiceHoldTimer = null; hideHold();
      if (k === 'Space') {
        clearTimeout(backHold); backHold = null; clearInterval(backRepeat); backRepeat = null;
        if (didBack) { didBack = false; restartAuto(); return; }
        if (c === 'choice') choiceStep(); else step(1);
      } else {
        if (c === 'choice') choiceSelect(); else activate();
      }
      restartAuto();
      return;
    }
    if (c === 'play') G().key('up', k);
  }

  /**
   * scan-manager announces presses it discarded. Release whatever that key
   * was doing so nothing is left running.
   */
  function onInputCancelled(e) {
    const code = e && e.detail ? norm(e.detail.code) : null;
    if (code !== 'Space' && code !== 'Enter') return;
    keyDown[code] = false;
    if (ignore[code]) { ignore[code] = false; return; }
    clearTimeout(backHold); backHold = null; clearInterval(backRepeat); backRepeat = null; didBack = false;
    hideHold();
    clearTimeout(choiceHoldTimer); choiceHoldTimer = null;
    G().cancelInput(code);
    restartAuto();
  }

  /* ── Pointer ──────────────────────────────────────────────────────────── */
  let ptr = { down: false, x: 0, y: 0, moved: false, aimed: false };
  function boardPoint(e) {
    const Lyt = P3.main && P3.main.layout;
    if (!Lyt) return null;
    return P3.layout.toBoard(Lyt, e.clientX, e.clientY);
  }
  function inBoard(p) { return p && p.x > -20 && p.x < C.BOARD.W + 20 && p.y > 0 && p.y < C.BOARD.H; }
  function onPointerDown(e) {
    const c = ctx();
    if (c !== 'play' && c !== 'choice') return;
    const p = boardPoint(e);
    if (!inBoard(p)) return;
    if (G().state === 'intro') { G().beginPlay(); return; }
    if (c === 'choice') { choiceIndex = 0; G().choosePlay(); refreshChoice(); stopAuto(); }
    // Only a press that took aim can shoot: one held through a shot must not fire the next ball at the old aim.
    const g = G();
    ptr = { down: true, x: e.clientX, y: e.clientY, moved: false, aimed: !!(g.match && g.match.phase === 'aim') };
    g.pointerAim(p.x, p.y);
    if (e.cancelable) e.preventDefault();
  }
  function onPointerMove(e) {
    const c = ctx();
    if (c !== 'play') return;
    if (ptr.down && Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) > 12) ptr.moved = true;
    if (e.pointerType === 'mouse' || ptr.down) {
      const p = boardPoint(e);
      if (inBoard(p)) G().pointerAim(p.x, p.y);
    }
  }
  function onPointerUp(e) {
    if (!ptr.down) return;
    ptr.down = false;
    // A click or tap (not a drag) shoots where it landed; a drag only moves the aim.
    if (ptr.aimed && !ptr.moved && ctx() === 'play') G().fire();
  }

  /* ── Boot ─────────────────────────────────────────────────────────────── */
  async function init() {
    const g = G();
    g.on('hud', onHud);
    g.on('levelStart', onLevelStart);
    g.on('state', onState);
    g.on('result', onResult);
    g.on('hold', (h) => showHold(h.p, h.seconds));
    g.on('requestPause', openPause);
    g.on('choice', (c) => { if (c.open) openChoice(); else { refreshChoice(); stopAuto(); } });
    g.on('settings', () => { if (overlayOn) refreshValues(); });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('narbe-input-cancelled', onInputCancelled);
    root.addEventListener('blur', () => {
      clearKeysKeepIgnores(); ignore.Space = false; ignore.Enter = false; ptr.down = false;
      hideHold(); G().cancelInput();
      if (ctx() === 'play' || ctx() === 'choice') openPause();
      stopAuto();
    });
    root.addEventListener('focus', restartAuto);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (G().match && (G().state === 'play') && !overlayOn) openPause(); P3.audio && P3.audio.suspend && P3.audio.suspend(); }
      else { P3.audio && P3.audio.resume && P3.audio.resume(); }
    });

    const surf = $('stage');
    surf.addEventListener('pointerdown', onPointerDown, { passive: false });
    surf.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', () => { ptr.down = false; });
    U.addTap($('pauseBtn'), () => { if (ctx() === 'choice' || ctx() === 'play') openPause(); });
    U.addTap($('choiceFrame'), () => { if (ctx() === 'choice') { choiceIndex = 0; choiceSelect(); } });
    U.addTap($('banner'), () => { if (G().state === 'intro') G().beginPlay(); });

    const s = U.sm();
    if (s && s.subscribe) s.subscribe(() => { restartAuto(); if (overlayOn) refreshValues(); });

    index_ = await L.loadIndex();

    // Editor test play: ?test=1 plays the level the editor left in storage.
    const q = new URLSearchParams(root.location.search);
    if (q.get('test')) {
      const tp = U.load('testplay', null);
      if (tp && tp.campaign) {
        const camp = L.normCampaign(tp.campaign);
        camp.source = 'test';
        hideOverlay();
        G().startLevel(camp, U.clamp(tp.level || 0, 0, camp.levels.length - 1), { test: true });
        refreshChrome();
        return;
      }
    }
    // Cover screenshots (tools/make-covers.cjs): ?cover=<campaign id>&level=N
    if (q.get('cover')) {
      document.body.classList.add('cover');
      const e = (index_ || []).find(x => x.id === q.get('cover'));
      if (e) {
        const camp = await loadEntry(e);
        hideOverlay();
        G().startLevel(camp, U.clamp(+q.get('level') || 0, 0, camp.levels.length - 1));
        G().beginPlay();
        refreshChrome();
        return;
      }
    }
    setScreen('title');
    setTimeout(() => { if (screen === 'title' && overlayOn) speakItem(); }, 1200);
  }

  P3.ui = {
    init, setScreen, openPause, applyLayout, layoutSafe, refreshChrome,
    get screen() { return screen; }, get context() { return ctx(); }, get overlayOn() { return overlayOn; },
    get index() { return index; }, get items() { return items; }, get choiceIndex() { return choiceIndex; },
    debug: { step, activate, choiceStep, choiceSelect, play, loadEntry, campaigns: () => campaigns, index: () => index_ }
  };
})(typeof window !== 'undefined' ? window : globalThis);
