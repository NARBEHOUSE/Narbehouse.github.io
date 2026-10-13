/**
 * NARBE Racer — the in-race HUD.
 *
 * One DOM overlay per view: a single full-screen view, or two for a split
 * screen (side by side, or top and bottom). hud.js builds its own elements the
 * first time it is set up, so any page can host it.
 *
 * Two owners feed it, so neither has to know the other's internals:
 *   NK.game     → update(v, raceData) about ten times a second, pop(), minimap()
 *   NK.controls → control(v, { scheme, armed, match, scanLane, targetLane, pauseHold })
 *
 * Everything is sized from a per-view unit (--u, 1.0 on a 1600x900 view), so
 * the same HUD fits a 1920x1008 hub, a tablet, and a 960-wide half of a split
 * screen. Writes only happen when a value actually changes: the HUD must cost
 * nothing on a Surface-class machine.
 *
 * Low-vision rules (DESIGN §1.8): huge numbers with ink outlines, colour never
 * the only signal — place also changes size, items carry emoji AND a name,
 * the one-switch panels say LEFT/RIGHT as well as lighting up.
 */
NK.hud = (function () {
  'use strict';

  const U = NK.util;
  const C = NK.C;
  const LANES = C.LANE_COUNT;
  const DIVIDER = 6;               // px between 2P views, matching NK.main
  const RING_R = 48;
  const RING_LEN = 2 * Math.PI * RING_R;

  /* Item names and emoji, used when NK.items is not loaded (menus, tests).
     The ids are the contract (DESIGN §6.3). */
  const ITEM_FALLBACK = {
    rocket:     { name: 'Rocket',        emoji: '🚀' },
    rocket3:    { name: 'Triple Rocket', emoji: '🚀', count: 3 },
    goldrocket: { name: 'Golden Rocket', emoji: '🌟🚀' },
    peel:       { name: 'Banana Peel',   emoji: '🍌' },
    peel3:      { name: 'Triple Peel',   emoji: '🍌', count: 3 },
    ball:       { name: 'Bumper Ball',   emoji: '🟢' },
    bee:        { name: 'Homing Bee',    emoji: '🐝' },
    zapper:     { name: 'Leader Zapper', emoji: '⚡' },
    star:       { name: 'Super Star',    emoji: '⭐' },
    shrink:     { name: 'Shrink Ray',    emoji: '🔻' },
    jet:        { name: 'Jet Mode',      emoji: '✈️' },
    horn:       { name: 'Honk Horn',     emoji: '📯' },
    mega:       { name: 'Mega Grow',     emoji: '💪' },
    coins:      { name: 'Coin Bag',      emoji: '💰' },
    bomb:       { name: 'Boom Box',      emoji: '💣' }
  };
  /* The roulette reel: a strip of item faces scrolled by CSS alone. */
  const REEL = ['🚀', '🍌', '⭐', '🐝', '💣', '🟢', '✈️', '📯', '💪', '🔻'];
  const REEL_IDS = ['rocket', 'peel', 'star', 'bee', 'bomb', 'ball', 'jet', 'horn', 'mega', 'shrink'];

  /** A drawn item icon (js/item-icons.js), centred and the same on every
   *  platform; null if the icon kit is missing, so the emoji stands in. */
  const ICON_PX = 120;          // CSS px the icon is drawn for (× devicePixelRatio); CSS sizes it
  function iconEl(id) {
    const I = window.NK && NK.itemIcons;
    if (!I || typeof I.canvas !== 'function') return null;
    try {
      const cv = I.canvas(id, ICON_PX);
      cv.style.width = cv.style.height = '';
      cv.className = 'nkIcon';
      cv.setAttribute('aria-hidden', 'true');
      return cv;
    } catch (e) { return null; }
  }

  /* How long each kind of big message stays up, and which may cut in on which. */
  const POP = {
    count:  { ms: 900,  pri: 4 },
    go:     { ms: 950,  pri: 5 },
    final:  { ms: 2000, pri: 5 },
    finish: { ms: 2600, pri: 6 },
    lap:    { ms: 1500, pri: 3 },
    item:   { ms: 1150, pri: 2 },
    good:   { ms: 1050, pri: 2 },
    bad:    { ms: 1050, pri: 2 },
    info:   { ms: 1500, pri: 1 }
  };

  let root = null;
  let layout = 'single';
  let views = [];
  let resizeQueued = false;
  /* Control state that arrived before setup() (or survives a re-setup). */
  const pendingCtl = [null, null];

  /* ── Small helpers ───────────────────────────────────────────────────── */

  function itemDef(id) {
    const items = window.NK && NK.items && NK.items.DEFS;
    const d = items && items[id];
    const fb = ITEM_FALLBACK[id];
    if (d) return { name: d.name || (fb && fb.name) || id, emoji: d.emoji || (fb && fb.emoji) || '❔', count: fb && fb.count };
    return fb || { name: String(id), emoji: '❔' };
  }

  function charColor(id) {
    const R = window.NK && NK.roster;
    const list = R && R.CHARACTERS;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) {
          const c = list[i].colors && list[i].colors.primary;
          if (c === undefined || c === null) break;
          return typeof c === 'number' ? '#' + ('000000' + c.toString(16)).slice(-6) : String(c);
        }
      }
    }
    return '#ffffff';
  }

  function set(el, cls, on) { if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on); }

  /* ── DOM ─────────────────────────────────────────────────────────────── */

  function ensureRoot() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'nkHud';
    root.className = 'nkHud';
    root.setAttribute('aria-hidden', 'true');
    (document.getElementById('app') || document.body).appendChild(root);
    const queueResize = () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => { resizeQueued = false; applyUnits(); });
    };
    window.addEventListener('resize', queueResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', queueResize);
    if (window.ResizeObserver) new ResizeObserver(queueResize).observe(root);
  }

  function viewHTML(i, n) {
    let pips = '';
    for (let k = 0; k < LANES; k++) pips += '<div class="pip"><span class="mark"></span></div>';
    let reel = '';
    for (let r = 0; r < 2; r++) for (let k = 0; k < REEL.length; k++) reel += '<span>' + REEL[k] + '</span>';
    const tag = n > 1
      ? '<div class="nkFrame"></div><div class="nkTag"><b>P' + (i + 1) + '</b> · ' + C.PLAYER_KEYS[i] + '</div>'
      : '';
    return '' +
      '<div class="nkEdge l"></div><div class="nkEdge r"></div>' +
      '<div class="nkDanger"></div>' +
      tag +
      '<div class="nkTL">' +
        '<div class="nkSlot empty">' +
          '<div class="nkReel"><div class="nkReelStrip">' + reel + '</div></div>' +
          '<div class="nkSlotIcon"></div>' +
          '<div class="nkSlotCount"></div>' +
        '</div>' +
        '<div class="nkSlotName"></div>' +
        '<div class="nkItemUse">USE IN <b></b>s</div>' +
        '<div class="nkCoins"><span class="nkCoin"></span><b>0</b></div>' +
      '</div>' +
      '<div class="nkTR">' +
        '<div class="nkPlace pN"><b>–</b><i></i></div>' +
        '<div class="nkLap"><span class="nkFlag"></span><span class="t">LAP</span> <b>1</b><span class="of">/3</span></div>' +
        '<div class="nkTime">0:00.0</div>' +
        '<div class="nkBest"></div>' +
        '<div class="nkLabel"></div>' +
      '</div>' +
      // Arrows are CSS shapes (an emoji arrow cannot be tinted or outlined).
      '<div class="nkCue"><div class="nkArrow"><i></i></div><div class="nkCueText">LEFT</div></div>' +
      '<div class="nkSide l"><span class="nkArrow"><i></i></span><span class="txt">LEFT</span></div>' +
      '<div class="nkSide r"><span class="nkArrow"><i></i></span><span class="txt">RIGHT</span></div>' +
      '<div class="nkBottom">' +
        '<div class="nkDrift"><span class="nkDriftTag">DRIFT</span>' +
          '<div class="nkDriftBar"><i></i><em style="left:30%"></em><em style="left:63.3%"></em></div></div>' +
        '<div class="nkLanes">' + pips + '</div>' +
        '<div class="nkLaneHint"></div>' +
      '</div>' +
      '<div class="nkMapWrap"><canvas class="nkMap"></canvas></div>' +
      '<div class="nkRing"><svg viewBox="0 0 120 120">' +
        '<circle class="track" cx="60" cy="60" r="' + RING_R + '"></circle>' +
        '<circle class="fill" cx="60" cy="60" r="' + RING_R + '" stroke-dasharray="' + RING_LEN.toFixed(1) +
        '" stroke-dashoffset="' + RING_LEN.toFixed(1) + '"></circle></svg>' +
        '<div class="lbl">Keep<br>holding</div></div>' +
      '<div class="nkPop"></div>';
  }

  function buildView(i, n) {
    const el = document.createElement('div');
    el.className = 'nkView v' + i + (n > 1 ? ' duo p' + (i + 1) : ' solo');
    el.style.setProperty('--pc', C.PLAYER_COLORS[i] || C.PLAYER_COLORS[0]);
    el.innerHTML = viewHTML(i, n);
    root.appendChild(el);
    // With the icon kit loaded the roulette reel shows the drawn icons too.
    el.querySelectorAll('.nkReelStrip span').forEach((sp, k) => {
      const cv = iconEl(REEL_IDS[k % REEL_IDS.length]);
      if (cv) { sp.textContent = ''; sp.appendChild(cv); sp.className = 'ic'; }
    });
    const q = (s) => el.querySelector(s);
    const V = {
      i, el,
      slot: q('.nkSlot'), slotIcon: q('.nkSlotIcon'), slotCount: q('.nkSlotCount'), slotName: q('.nkSlotName'),
      itemUse: q('.nkItemUse'), itemUseNum: q('.nkItemUse b'),
      coins: q('.nkCoins'), coinsNum: q('.nkCoins b'),
      place: q('.nkPlace'), placeNum: q('.nkPlace b'), placeSuf: q('.nkPlace i'),
      lap: q('.nkLap'), lapNum: q('.nkLap b'), lapOf: q('.nkLap .of'), lapT: q('.nkLap .t'),
      time: q('.nkTime'), best: q('.nkBest'), label: q('.nkLabel'),
      cue: q('.nkCue'), cueText: q('.nkCueText'),
      edgeL: q('.nkEdge.l'), edgeR: q('.nkEdge.r'), danger: q('.nkDanger'),
      sideL: q('.nkSide.l'), sideR: q('.nkSide.r'),
      drift: q('.nkDrift'), driftFill: q('.nkDriftBar i'),
      lanes: q('.nkLanes'), pips: el.querySelectorAll('.nkLanes .pip'), laneHint: q('.nkLaneHint'),
      map: q('.nkMap'), mapCtx: null, mapBg: null, mapW: null, mapPx: 0, mapProj: null,
      ring: q('.nkRing'), ringFill: q('.nkRing .fill'),
      pop: q('.nkPop'), popTimer: 0, popPri: 0, popUntil: 0, popQueued: null,
      last: {},
      ctl: { scheme: 'two', armed: -1, match: false, scanLane: -1, targetLane: -1, pauseHold: 0 },
      ctlSeen: false,
      data: { lane: 2, finished: false, cueDir: 0, cueOn: false }
    };
    return V;
  }

  /** Lay the views out and size each one's unit from its real pixel size. */
  function applyRects() {
    const n = views.length;
    for (let i = 0; i < n; i++) {
      const s = views[i].el.style;
      const half = 'calc(50% - ' + (DIVIDER / 2) + 'px)';
      const far = 'calc(50% + ' + (DIVIDER / 2) + 'px)';
      if (layout === 'side' && n > 1) {
        s.left = i === 0 ? '0' : far; s.top = '0'; s.width = half; s.height = '100%';
      } else if (layout === 'stack' && n > 1) {
        s.left = '0'; s.top = i === 0 ? '0' : far; s.width = '100%'; s.height = half;
      } else {
        s.left = '0'; s.top = '0'; s.width = '100%'; s.height = '100%';
      }
    }
    applyUnits();
  }

  function applyUnits() {
    const bounds = root.getBoundingClientRect();
    for (let i = 0; i < views.length; i++) {
      const V = views[i];
      const r = V.el.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      const u = U.clamp(Math.min(Math.sqrt(w * h) / 1200, w / 1100, h / 560), 0.5, 1.6);
      V.el.style.setProperty('--u', u.toFixed(3));
      set(V.el, 'hud-compact', w < 600 || h < 400);
      set(V.el, 'hud-tiny', w < 360 || h < 350);
      // Only the outside edge of a split view inherits the device notch.
      V.el.style.setProperty('--view-safe-top', r.top <= bounds.top + 1 ? 'var(--safe-top, 0px)' : '0px');
      V.el.style.setProperty('--view-safe-bottom', r.bottom >= bounds.bottom - 1 ? 'var(--safe-bottom, 0px)' : '0px');
      V.el.style.setProperty('--view-safe-left', r.left <= bounds.left + 1 ? 'var(--safe-left, 0px)' : '0px');
      V.el.style.setProperty('--view-safe-right', r.right >= bounds.right - 1 ? 'var(--safe-right, 0px)' : '0px');
      V.u = u;
      V.mapPx = 0;                   // canvas backing size is re-derived on the next draw
    }
  }

  /* ── Public: setup / clear / visibility ──────────────────────────────── */

  function setup(lay) {
    ensureRoot();
    clearViews();
    layout = lay === 'side' || lay === 'stack' ? lay : 'single';
    const n = layout === 'single' ? 1 : 2;
    root.className = 'nkHud on layout-' + layout;
    for (let i = 0; i < n; i++) views.push(buildView(i, n));
    applyRects();
    for (let i = 0; i < n; i++) if (pendingCtl[i]) control(i, pendingCtl[i]);
  }

  function clearViews() {
    for (let i = 0; i < views.length; i++) {
      clearTimeout(views[i].popTimer);
      if (views[i].el.parentNode) views[i].el.parentNode.removeChild(views[i].el);
    }
    views = [];
  }

  function clear() {
    clearViews();
    pendingCtl[0] = pendingCtl[1] = null;
    if (root) root.className = 'nkHud';
  }

  /** Hide or show without losing any state (a card is up over the race). */
  function visible(on) {
    if (root) set(root, 'hidden', !on);
  }

  /* ── Public: race data ───────────────────────────────────────────────── */

  function update(v, d) {
    const V = views[v];
    if (!V || !d) return;
    const L = V.last;

    if (d.finished !== L.finished) {
      L.finished = !!d.finished;
      V.data.finished = L.finished;
      set(V.el, 'finished', L.finished);
    }

    // Place: huge, tinted for the podium, and SIZED by rank so colour is
    // never the only signal.
    if (d.place !== L.place && d.place) {
      L.place = d.place;
      V.placeNum.textContent = String(d.place);
      V.placeSuf.textContent = U.ordinal(d.place).replace(/^\d+/, '');
      V.place.className = 'nkPlace ' + (d.place <= 3 ? 'p' + d.place : 'pN');
      V.place.classList.remove('bump'); void V.place.offsetWidth; V.place.classList.add('bump');
    }

    if (d.lap !== L.lap || d.laps !== L.laps) {
      L.lap = d.lap; L.laps = d.laps;
      const laps = d.laps || C.LAPS;
      const lap = U.clamp(d.lap || 1, 1, laps);
      V.lapNum.textContent = String(lap);
      V.lapOf.textContent = '/' + laps;
      const final = lap === laps && laps > 1 && !d.finished;
      V.lapT.textContent = final ? 'FINAL' : 'LAP';
      set(V.lap, 'final', final);
    }

    if (d.time !== L.time && isFinite(d.time)) {
      L.time = d.time;
      V.time.textContent = U.fmtTime(Math.max(0, d.time));
    }
    if (d.best !== L.best) {
      L.best = d.best;
      V.best.textContent = d.best ? 'BEST ' + U.fmtTime(d.best) : '';
      set(V.best, 'on', !!d.best);
    }
    if (d.label !== L.label) {
      L.label = d.label;
      V.label.textContent = d.label || '';
      set(V.label, 'on', !!d.label);
    }

    updateItem(V, d);
    updateItemUse(V, d);

    if (d.coins !== L.coins && isFinite(d.coins)) {
      const up = isFinite(L.coins) && d.coins > L.coins;
      L.coins = d.coins;
      V.coinsNum.textContent = d.coins >= C.COIN_MAX ? 'MAX' : String(d.coins);
      set(V.coins, 'max', d.coins >= C.COIN_MAX);
      if (up) { V.coins.classList.remove('bump'); void V.coins.offsetWidth; V.coins.classList.add('bump'); }
    }
    updateDrift(V, d.drift);

    if (d.lane !== L.lane && isFinite(d.lane)) { L.lane = d.lane; V.data.lane = d.lane | 0; paintLanes(V); }

    const cue = d.cue || null;
    const cueOn = !!(cue && cue.active && cue.level >= 1 && cue.dir);
    const cueDir = cueOn ? (cue.dir < 0 ? -1 : 1) : 0;
    if (cueDir !== L.cueDir) {
      L.cueDir = cueDir;
      V.data.cueDir = cueDir; V.data.cueOn = cueOn;
      set(V.cue, 'on', cueOn);
      set(V.cue, 'left', cueDir < 0);
      set(V.cue, 'right', cueDir > 0);


    }
    set(V.edgeL, 'on', cueDir < 0 && !!(cue && cue.danger));
    set(V.edgeR, 'on', cueDir > 0 && !!(cue && cue.danger));
    if (cueOn) {
      const purpose = cue.danger ? 'CLEAR' : cue.reason === 'box' ? 'ITEM BOX' : cue.reason === 'boost pad' || cue.reason === 'power pad' ? 'BOOST' : '';
      V.cueText.textContent = (purpose ? purpose + ' ' : '') + (cueDir < 0 ? 'LEFT' : 'RIGHT');
    }
    if (!!d.danger !== L.danger) { L.danger = !!d.danger; set(V.danger, 'on', L.danger); }

    // A game that sends the one-switch state itself still gets its panels,
    // until NK.controls takes over.
    if (!V.ctlSeen && d.oneSwitch !== undefined && (d.oneSwitch !== L.oneSwitch || d.armed !== L.armed)) {
      L.oneSwitch = d.oneSwitch; L.armed = d.armed;
      V.ctl.scheme = d.oneSwitch ? 'one' : 'two';
      if (d.armed) V.ctl.armed = d.armed < 0 ? -1 : 1;
      paintControl(V);
    }
  }

  function updateItem(V, d) {
    const L = V.last;
    const spin = !!d.roulette;
    const item = d.item || null;
    if (spin === L.spin && item === L.item) return;
    const wasSpin = L.spin;
    L.spin = spin; L.item = item;
    set(V.slot, 'spin', spin);
    set(V.slot, 'empty', !spin && !item);
    if (spin) {
      V.slotIcon.textContent = '';
      V.slotCount.textContent = '';
      V.slotName.textContent = '? ? ?';
      set(V.slotName, 'on', true);
      return;
    }
    if (item) {
      const def = itemDef(item);
      V.slotIcon.textContent = def.emoji;
      // Two pictures (the Golden Rocket's 🌟🚀) are drawn smaller to fit.
      set(V.slotIcon, 'twin', Array.from(def.emoji).filter((ch) => ch !== '️' && ch.codePointAt(0) > 0x2000).length > 1);
      V.slotCount.textContent = def.count ? '×' + def.count : '';
      V.slotName.textContent = def.name;
      set(V.slotName, 'on', true);
      const cv = iconEl(item);
      if (cv) { V.slotIcon.textContent = ''; V.slotIcon.appendChild(cv); set(V.slotIcon, 'twin', false); }
      if (wasSpin) { V.slot.classList.remove('reveal'); void V.slot.offsetWidth; V.slot.classList.add('reveal'); }
    } else {
      V.slotIcon.textContent = '';
      V.slotCount.textContent = '';
      V.slotName.textContent = '';
      set(V.slotName, 'on', false);
    }
  }

  /** Race time owns the countdown, so pausing freezes this readout too.
      Keep it separate from the cached item face: seconds change while the
      held item stays the same. No blinking, urgency pulse or extra speech. */
  function updateItemUse(V, d) {
    const seconds = d.item && !d.roulette && !d.finished && Number.isFinite(d.itemUseT) && d.itemUseT > 0
      ? Math.ceil(d.itemUseT) : 0;
    if (seconds === V.last.itemUseSeconds) return;
    V.last.itemUseSeconds = seconds;
    V.itemUseNum.textContent = seconds ? String(seconds) : '';
    set(V.itemUse, 'on', seconds > 0);
  }

  /** The automatic drift's mini-turbo charge: blue, orange, purple. */
  function updateDrift(V, drift) {
    const L = V.last;
    let charge = 0, level = 0;
    if (drift && typeof drift === 'object') { charge = +drift.charge || 0; level = drift.level | 0; }
    else if (isFinite(drift)) charge = +drift;
    if (!level && charge > 0) {
      for (let i = 0; i < C.DRIFT_LEVELS.length; i++) if (charge >= C.DRIFT_LEVELS[i]) level = i + 1;
    }
    const on = charge > 0.02;
    const pct = Math.round(U.clamp(charge / C.DRIFT_LEVELS[C.DRIFT_LEVELS.length - 1], 0, 1) * 100);
    if (on !== L.driftOn) { L.driftOn = on; set(V.drift, 'on', on); }
    if (pct !== L.driftPct) { L.driftPct = pct; V.driftFill.style.width = pct + '%'; }
    if (level !== L.driftLv) {
      L.driftLv = level;
      V.drift.className = 'nkDrift' + (on ? ' on' : '') + ' lv' + level;
    }
  }

  /* ── Public: control state from NK.controls ──────────────────────────── */

  function control(v, c) {
    if (!c) return;
    const store = pendingCtl[v] || (pendingCtl[v] = {});
    store.scheme = c.scheme; store.armed = c.armed; store.match = c.match;
    store.scanLane = c.scanLane; store.targetLane = c.targetLane; store.pauseHold = c.pauseHold;
    const V = views[v];
    if (!V) return;
    V.ctlSeen = true;
    const k = V.ctl;
    k.scheme = c.scheme || 'two';
    k.armed = c.armed < 0 ? -1 : 1;
    k.match = !!c.match;
    k.scanLane = isFinite(c.scanLane) ? c.scanLane : -1;
    k.targetLane = isFinite(c.targetLane) ? c.targetLane : -1;
    k.pauseHold = U.clamp(+c.pauseHold || 0, 0, 1);
    paintControl(V);
  }

  function paintControl(V) {
    const k = V.ctl, L = V.last;
    if (k.scheme !== L.scheme) {
      L.scheme = k.scheme;
      V.el.classList.remove('sch-two', 'sch-one', 'sch-step-two', 'sch-step-scan');
      V.el.classList.add('sch-' + k.scheme);
      V.laneHint.textContent = k.scheme === 'step-scan' ? 'PRESS ON GREEN' : '';
    }
    const one = k.scheme === 'one';
    const lOn = one && k.armed < 0, rOn = one && k.armed > 0;
    set(V.sideL, 'on', lOn); set(V.sideR, 'on', rOn);
    set(V.sideL, 'match', lOn && k.match); set(V.sideR, 'match', rOn && k.match);
    paintLanes(V);
    if (k.pauseHold !== L.ring) {
      L.ring = k.pauseHold;
      set(V.ring, 'on', k.pauseHold > 0);
      V.ringFill.setAttribute('stroke-dashoffset', (RING_LEN * (1 - k.pauseHold)).toFixed(1));
    }
  }

  /** The five lane pips: where the kart is, where the guidance wants it, and
   *  (Press to Step, one switch) where a press would send it. */
  function paintLanes(V) {
    const k = V.ctl;
    const scan = k.scheme === 'step-scan';
    set(V.lanes, 'scan', scan);
    set(V.lanes, 'match', scan && k.match);
    for (let i = 0; i < V.pips.length; i++) {
      const p = V.pips[i];
      set(p, 'kart', i === V.data.lane);
      set(p, 'guide', i === k.targetLane);
      set(p, 'hot', scan && i === k.scanLane);
    }
  }

  /* ── Public: big centre messages ─────────────────────────────────────── */

  function pop(v, text, kind) {
    if (v === -1 || v === undefined) { for (let i = 0; i < views.length; i++) popOne(views[i], text, kind); return; }
    if (views[v]) popOne(views[v], text, kind);
  }

  function popOne(V, text, kind) {
    const k = POP[kind] ? kind : 'info';
    const spec = POP[k];
    const t = performance.now();
    // A lap sign must not wipe the GO! it arrived with: queue the lesser one.
    if (t < V.popUntil && spec.pri < V.popPri) { V.popQueued = { text, kind: k }; return; }
    clearTimeout(V.popTimer);
    V.pop.textContent = String(text);
    V.pop.className = 'nkPop k-' + k;
    void V.pop.offsetWidth;            // restart the animation
    V.pop.classList.add('on');
    V.popPri = spec.pri;
    V.popUntil = t + spec.ms;
    V.popTimer = setTimeout(() => {
      V.pop.classList.remove('on');
      V.popPri = 0; V.popUntil = 0;
      const q = V.popQueued;
      V.popQueued = null;
      if (q) popOne(V, q.text, q.kind);
    }, spec.ms);
  }

  /* ── Public: waterfall splash ────────────────────────────────────────────
   * Bursting through a waterfall: a soft watery wash with droplets on the
   * "lens" over that player's view, fading out once (never flashing). */
  function splash(v, style) {
    const V = views[v];
    if (!V) return;
    if (!V.splash) {
      V.splash = document.createElement('div');
      V.splash.setAttribute('aria-hidden', 'true');
      V.el.appendChild(V.splash);
    }
    // Water, bubbles and steam wash the lens; a hologram or confetti curtain tints it.
    V.splash.className = 'nkSplash' + (style === 'hologram' ? ' k-holo' : style === 'confetti' ? ' k-confetti' : '');
    void V.splash.offsetWidth;          // restart the fade
    V.splash.classList.add('on');
  }

  /* ── Public: minimap ─────────────────────────────────────────────────────
   * The track is traced once into an offscreen canvas per world and size;
   * each call then only blits it and draws twelve dots.
   */
  function mapBounds(mm) {
    const b = mm.bounds;
    if (b && isFinite(b.minX) && isFinite(b.maxZ)) return b;
    if (b && b.min && b.max) return { minX: b.min.x, maxX: b.max.x, minZ: b.min.z !== undefined ? b.min.z : b.min.y, maxZ: b.max.z !== undefined ? b.max.z : b.max.y };
    if (Array.isArray(b) && b.length >= 4) return { minX: b[0], minZ: b[1], maxX: b[2], maxZ: b[3] };
    const p = mm.pts;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i + 1 < p.length; i += 2) {
      if (p[i] < minX) minX = p[i]; if (p[i] > maxX) maxX = p[i];
      if (p[i + 1] < minZ) minZ = p[i + 1]; if (p[i + 1] > maxZ) maxZ = p[i + 1];
    }
    return { minX, maxX, minZ, maxZ };
  }

  function prepareMap(V, W) {
    const cv = V.map;
    const css = cv.clientWidth || 200;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const px = Math.max(64, Math.round(css * dpr));
    if (V.mapW === W && V.mapPx === px && V.mapBg) return true;
    const mm = W && W.minimap;
    if (!mm || !mm.pts || mm.pts.length < 6) return false;
    cv.width = px; cv.height = px;
    V.mapCtx = cv.getContext('2d');
    V.mapW = W; V.mapPx = px;
    const b = mapBounds(mm);
    const pad = px * 0.12;
    const sx = (px - pad * 2) / Math.max(1, b.maxX - b.minX);
    const sz = (px - pad * 2) / Math.max(1, b.maxZ - b.minZ);
    const s = Math.min(sx, sz);
    const ox = (px - (b.maxX - b.minX) * s) / 2 - b.minX * s;
    const oz = (px - (b.maxZ - b.minZ) * s) / 2 - b.minZ * s;
    V.mapProj = { s, ox, oz, px };

    const bg = document.createElement('canvas');
    bg.width = px; bg.height = px;
    const g = bg.getContext('2d');
    const P = mm.pts;
    const trace = () => {
      g.beginPath();
      for (let i = 0; i + 1 < P.length; i += 2) {
        const x = P[i] * s + ox, y = P[i + 1] * s + oz;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
    };
    g.lineJoin = 'round'; g.lineCap = 'round';
    trace(); g.strokeStyle = 'rgba(29,27,46,0.95)'; g.lineWidth = px * 0.075; g.stroke();
    trace(); g.strokeStyle = '#fff6e2'; g.lineWidth = px * 0.04; g.stroke();
    // Start/finish: a little checkered bar across the road at the first node.
    // Rotated so x runs across the road and y along it.
    if (P.length >= 4) {
      const x0 = P[0] * s + ox, y0 = P[1] * s + oz;
      const dx = P[2] * s + ox - x0, dy = P[3] * s + oz - y0;
      const sq = px * 0.022;
      g.save();
      g.translate(x0, y0);
      g.rotate(Math.atan2(dx, -dy));
      for (let k = -2; k < 2; k++) {
        for (let j = 0; j < 2; j++) {
          g.fillStyle = ((k + j) & 1) === 0 ? '#1d1b2e' : '#ffffff';
          g.fillRect(k * sq, (j - 1) * sq, sq, sq);
        }
      }
      g.restore();
    }
    V.mapBg = bg;
    return true;
  }

  function minimap(v, W, racers, focusIdx) {
    const V = views[v];
    if (!V || !W || !racers) return;
    if (!V.map.clientWidth) return;
    if (!prepareMap(V, W)) return;
    const g = V.mapCtx, pr = V.mapProj, px = pr.px;
    g.clearRect(0, 0, px, px);
    g.drawImage(V.mapBg, 0, 0);
    const L = W.L || 1;
    // CPUs first, humans over them, the view's own racer on top.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < racers.length; i++) {
        const r = racers[i];
        if (!r) continue;
        const human = r.isHuman || (r.human !== undefined && r.human >= 0);
        const focus = i === focusIdx;
        if ((pass === 0 && (human || focus)) || (pass === 1 && (!human || focus)) || (pass === 2 && !focus)) continue;
        const s = isFinite(r.s) ? r.s : U.mod(r.progress || 0, L);
        const f = W.frameAt(s);
        if (!f || !f.pos) continue;
        let x = f.pos.x, z = f.pos.z;
        if (f.right && isFinite(r.x)) { x += f.right.x * r.x; z += f.right.z * r.x; }
        const cx = x * pr.s + pr.ox, cy = z * pr.s + pr.oz;
        const rad = px * (focus ? 0.058 : human ? 0.05 : 0.032);
        g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2);
        g.fillStyle = human ? (C.PLAYER_COLORS[r.human] || C.PLAYER_COLORS[0]) : charColor(r.charId);
        g.fill();
        g.lineWidth = px * (human ? 0.02 : 0.013);
        g.strokeStyle = '#1d1b2e';
        g.stroke();
        if (focus) {
          g.beginPath(); g.arc(cx, cy, rad + px * 0.02, 0, Math.PI * 2);
          g.lineWidth = px * 0.014; g.strokeStyle = '#ffffff'; g.stroke();
        }
      }
    }
  }

  /* ── Public: pointer mapping for NK.controls ─────────────────────────── */

  /** Which view a screen point is over, and how far across it (0..1). */
  function viewAt(x, y, lockedView) {
    let best = null, bestD = Infinity;
    for (let i = 0; i < views.length; i++) {
      if (lockedView !== undefined && i !== lockedView) continue;
      const r = views[i].el.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
      const dy = y < r.top ? r.top - y : (y > r.bottom ? y - r.bottom : 0);
      const d = dx + dy;
      if (d < bestD) {
        bestD = d;
        best = { v: i, fx: U.clamp((x - r.left) / Math.max(1, r.width), 0, 0.999),
                 fy: U.clamp((y - r.top) / Math.max(1, r.height), 0, 0.999) };
      }
    }
    return best;
  }

  return {
    setup, update, control, pop, splash, minimap, clear, visible, viewAt,
    get layout() { return layout; },
    get views() { return views.length; }
  };
})();
