/**
 * Benny's P3GL — the game: levels, controls, feedback, saving.
 *
 * Owns the current campaign, level and P3.Match, drives the board, effects,
 * backdrop and sound from the match's events, and turns switch presses into
 * aiming and firing. Menus, the HUD and the pause screen live in js/ui.js;
 * the UI forwards in-play presses here and listens to `P3.game.on(...)`.
 *
 * In-play controls (the original P3GL scheme, kept on purpose):
 *   Two switches (Auto Scan off)
 *     hold Space   sweep the aim; each new press reverses; release stops
 *     Enter        release to fire
 *     hold Enter   pause (a ring fills and beeps rise while you hold)
 *   One switch (Auto Scan on)
 *     the aim sweeps by itself at the Aim speed
 *     Enter        press freezes the aim, release fires
 *     hold Enter   pause (a shorter hold, as the original game had)
 * "Before each shot: Choose Play or Pause" (a setting) puts a two-stop
 * choice in front of every shot — the board, or the Pause button in the
 * bottom-left corner — scanned and selected like any menu, so a player who
 * cannot hold a switch can always reach Pause. This setting disables hold-to-pause;
 * Enter selects or fires on release, regardless of how long it was held.
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};
  const U = P3.util, C = P3.catalog, L = P3.levels, T = P3.themes;
  const B = C.BOARD;

  /* ── Sound & speech (works before js/audio.js loads, or without it) ──── */
  function vmSay(text) { const v = U.vm(); if (v && text) try { v.speak(text); } catch (e) { /* speech is optional */ } }
  const NOOP = {
    init() {}, unlock() {}, setMode() {}, play() {}, music() {}, stinger() {}, stopMusic() {}, suspend() {}, resume() {},
    setMusicEnabled() {}, setSfxEnabled() {}, setMusicDuck() {}, beat() { return null; }, currentTrack() { return null; },
    say: vmSay, sayQueued: vmSay, sayIfIdle(t) { if (!(root.speechSynthesis && root.speechSynthesis.speaking)) vmSay(t); },
    isSpeaking() { return !!(root.speechSynthesis && root.speechSynthesis.speaking); }, whenQuiet() { return Promise.resolve(); }
  };
  const AU = () => P3.audio || NOOP;

  /* ── Settings & progress ──────────────────────────────────────────────── */
  const DEFAULTS = {
    preShot: false,            // Before each shot: false = Aim right away, true = Choose Play or Pause
    aimSpeed: 'Super slow',
    guide: 'auto',             // auto | short | medium | long
    aimColor: 'white',
    guideSize: 'normal',       // normal | large
    backdrop: 1,               // 0 clear, 1 dim, 2 dark
    music: true,
    sfx: true,
    motion: U.reducedMotion() ? 'reduced' : 'full',
    quality: 'auto'            // auto | high | low
  };
  const AIM_COLORS = { white: '#ffffff', gold: '#ffd23f', green: '#5dff8a', blue: '#5cc8ff', pink: '#ff77cc', red: '#ff5a5a' };

  const settings = Object.assign({}, DEFAULTS, U.load('settings', {}));
  const store = {
    get(k) { return settings[k]; },
    set(k, v) { settings[k] = v; U.save('settings', settings); emit('settings', { key: k, value: v }); },
    all() { return Object.assign({}, settings); },
    AIM_COLORS
  };

  let progress = U.load('progress', {});
  const prog = {
    of(campId) { return progress[campId] || { lv: {}, next: 0 }; },
    record(campId, li, stars, score, skipped) {
      const p = progress[campId] = progress[campId] || { lv: {}, next: 0 };
      const cur = p.lv[li] || { stars: 0, best: 0 };
      p.lv[li] = { stars: Math.max(cur.stars || 0, stars || 0), best: Math.max(cur.best || 0, score || 0), done: !skipped || cur.done, skipped: skipped && !cur.done ? true : undefined };
      p.next = Math.max(p.next || 0, li + 1);
      U.save('progress', progress);
    },
    stars(campId) { const p = progress[campId]; return p ? Object.values(p.lv).reduce((a, l) => a + (l.stars || 0), 0) : 0; },
    done(campId) { const p = progress[campId]; return p ? Object.values(p.lv).filter(l => l.done || l.skipped).length : 0; },
    reset() { progress = {}; U.save('progress', progress); U.remove('resume'); }
  };

  /* ── Events to the UI ─────────────────────────────────────────────────── */
  const listeners = {};
  function on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); }
  function emit(name, data) { (listeners[name] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  /* ── State ────────────────────────────────────────────────────────────── */
  let ctx = null;                 // { renderer, post, board, fx, fxLayer }
  let backdrop = null, backdropId = null;
  let match = null, campaign = null, levelIndex = 0, test = false;
  let state = 'menu';             // menu | intro | play | result
  let paused = false;
  let attract = null;             // { match, timer }
  let timeScale = 1, slowUntil = 0, focusUntil = 0;
  let introTimer = 0;
  let attempts = 0;
  let worldTime = 0;
  let energy = 0;
  let guideDirty = true, lastGuideT = -1, guidePred = null;

  // Aiming.
  const aim = { dir: 1, holding: false, frozen: false, sweep: 0, lastTick: 0 };
  const keys = { Space: false, Enter: false, EnterAt: 0, EnterUsed: false };
  let choiceOn = false;           // the Play / Pause choice is showing

  function oneSwitch() { return U.isOneSwitch(); }
  function aimSpeed() { return C.AIM_SPEEDS[settings.aimSpeed] || C.AIM_SPEEDS['Super slow']; }
  function holdToPause() { return oneSwitch() ? 2000 : 5000; }
  function holdRingFrom() { return oneSwitch() ? 500 : 2000; }

  /* ── Worlds (backdrop + music + grade) ────────────────────────────────── */

  function showWorld(themeId, opts) {
    opts = opts || {};
    const th = T.theme(themeId);
    if (backdropId !== themeId || !backdrop) {
      const quality = ctx.post.quality === 'high' ? 'high' : 'low';
      const next = P3.backdrops.create(themeId, { renderer: ctx.renderer, quality, reducedMotion: settings.motion === 'reduced' });
      const old = backdrop;
      backdrop = next; backdropId = themeId;
      resizeBackdrop();
      if (old) setTimeout(() => { try { old.instance.dispose(); } catch (e) { /* already gone */ } }, 50);
      ctx.post.setGrade(Object.assign({}, T.GRADES[th.mode]));
      emit('world', { theme: th });
    }
    if (opts.variant !== undefined) try { backdrop.instance.setVariant(opts.variant); } catch (e) { console.warn(e); }
    if (opts.music !== false) AU().music(opts.music || th.music);
    AU().setMode(th.mode);
    return th;
  }

  function resizeBackdrop() {
    if (backdrop) try { backdrop.instance.resize(root.innerWidth, root.innerHeight); } catch (e) { console.warn(e); }
  }

  /* ── Attract: a level plays itself behind the menus ───────────────────── */

  function startAttract(camp, li) {
    if (!camp || !camp.levels.length) { stopAttract(); return; }
    const lv = camp.levels[Math.min(li || 0, camp.levels.length - 1)];
    const m = new P3.Match({ level: lv, mode: camp.mode });
    m.ballsLeft = 999;
    attract = { match: m, timer: 1.2, campaign: camp };
    ctx.board.load(m);
    ctx.board.setTheme(camp.theme, camp.mode);
    ctx.board.setGuide(null);
    ctx.fx.clear();
  }
  function stopAttract() { attract = null; }

  function updateAttract(dt) {
    const m = attract.match;
    m.update(dt);
    for (const ev of m.drain()) { ctx.board.react(ev); feedbackVisual(ev, true); if (ev.type === 'won' || ev.type === 'lost') { attract.timer = 3; } }
    if (m.phase === 'won' || m.phase === 'lost') {
      attract.timer -= dt;
      if (attract.timer <= 0) startAttract(attract.campaign, (attract.campaign.levels.indexOf(m.level) + 1) % attract.campaign.levels.length);
      return;
    }
    if (m.phase === 'aim') {
      attract.timer -= dt;
      if (attract.aimTo == null) {
        // Pick a decent shot: try a few angles on copies of the board.
        const snap = m.snapshot();
        let best = 0, bestV = -1;
        for (let k = 0; k < 6; k++) {
          const a = (Math.random() * 2 - 1) * m.aimMax * 0.9;
          const tr = new P3.Match({ level: m.level, mode: m.modeId, restore: snap });
          tr.aimTo(a); tr.fire();
          let n = 0; while ((tr.phase === 'shot' || tr.phase === 'pop') && n++ < 900) { tr.update(1 / 30); tr.events.length = 0; }
          const v = tr.goal.done * 10 + tr.score / 1000;
          if (v > bestV) { bestV = v; best = a; }
        }
        attract.aimTo = best;
      }
      m.aimTo(U.damp(m.angle, attract.aimTo, 2.5, dt));
      ctx.board.setAim(m.angle);
      if (attract.timer <= 0 && Math.abs(m.angle - attract.aimTo) < 1.5) { m.fire(); attract.aimTo = null; attract.timer = 1.6 + Math.random(); }
    }
  }

  /* ── Levels ───────────────────────────────────────────────────────────── */

  function startLevel(camp, li, o) {
    o = o || {};
    stopAttract();
    campaign = camp; levelIndex = li; test = !!o.test;
    const lv = camp.levels[li];
    if (!lv) return false;
    if (!o.retry) attempts = Math.max(0, o.attempts || 0);
    match = new P3.Match({ level: lv, mode: camp.mode, restore: o.snapshot || null });
    paused = false; timeScale = 1; slowUntil = 0; energy = 0; choiceOn = false;
    aim.dir = 1; aim.holding = false; aim.frozen = false; aim.sweep = 0;
    keys.Space = false; keys.Enter = false; keys.EnterUsed = false;
    ctx.board.load(match);
    ctx.board.setTheme(camp.theme, camp.mode);
    ctx.board.setBackdrop(settings.backdrop);
    ctx.board.snapAim(match.angle);
    ctx.board.unfocus();
    ctx.fx.clear();
    showWorld(camp.theme, { variant: lv.bg !== undefined ? lv.bg : li });
    guideDirty = true; guidePred = null;
    state = 'intro';
    introTimer = o.snapshot ? 0.8 : 3.2;
    AU().play('levelStart');
    const g = describeGoal(match);
    emit('levelStart', { campaign: camp, index: li, level: lv, goal: g, mode: camp.mode, resumed: !!o.snapshot, test });
    const lines = ['Level ' + (li + 1) + '. ' + lv.name + '.', g.speech + '.', U.plural(match.ballsLeft, 'ball') + '.'];
    AU().say(lines.join(' '));
    if (lv.intro && !o.snapshot) AU().sayQueued(lv.intro);
    hud();
    saveResume();
    return true;
  }

  function beginPlay() {
    if (state !== 'intro') return;
    state = 'play';
    ctx.board.skipIntro();
    emit('state', { state });
    readyForShot();
  }

  function readyForShot() {
    aim.frozen = false; aim.holding = false;
    keys.EnterUsed = false;
    guideDirty = true;
    if (settings.preShot && match.phase === 'aim') {
      choiceOn = true;
      emit('choice', { open: true });
    } else choiceOn = false;
    hud();
  }

  function restartLevel() {
    if (!campaign) return;
    U.remove('resume');
    startLevel(campaign, levelIndex, { retry: true, test });
  }

  function quitToMenu() {
    state = 'menu'; paused = false; match = null; timeScale = 1; choiceOn = false;
    ctx.board.unfocus();
    ctx.fx.clear();
    emit('state', { state });
  }

  function saveResume() {
    if (test || !match || !campaign || campaign.source === 'file') return;
    const snap = match.snapshot();
    if (!snap) return;
    U.save('resume', { camp: campaign.id, source: campaign.source || 'builtin', level: levelIndex, snap, attempts, at: Date.now() });
  }

  /* ── Goal wording ─────────────────────────────────────────────────────── */

  function describeGoal(m) {
    const g = m.goal, total = g.total;
    const num = (n) => U.fmt(n);
    switch (g.type) {
      case 'clear': return { short: 'Clear the board', speech: 'Clear the board. Break all ' + total + ' pegs', unit: 'pegs', icon: 'peg' };
      case 'color': { const cn = C.PEG_COLORS[g.color].name; return { short: 'Break the ' + cn + ' pegs', speech: 'Break all ' + total + ' ' + cn + ' pegs. They have a star', unit: cn + ' pegs', icon: 'peg', color: g.color }; }
      case 'gems': return { short: 'Collect the gems', speech: 'Collect all ' + total + ' gems', unit: 'gems', icon: 'gem' };
      case 'lanterns': return { short: 'Light the lanterns', speech: 'Light all ' + total + ' lanterns', unit: 'lanterns', icon: 'lantern' };
      case 'bricks': return { short: 'Break the bricks', speech: 'Break all ' + total + ' bricks', unit: 'bricks', icon: 'brick' };
      case 'score': return { short: 'Score ' + num(total), speech: 'Score ' + num(total) + ' points', unit: 'points', icon: 'multiplier', score: true };
      case 'count': return { short: 'Break ' + total + ' pegs', speech: 'Break any ' + total + ' pegs', unit: 'pegs', icon: 'peg' };
      case 'chain': return { short: 'Chain ' + total + ' in one shot', speech: 'Hit ' + total + ' things in a single shot', unit: 'in one shot', icon: 'zap', chain: true };
    }
    return { short: '', speech: '', unit: '' };
  }

  function goalLeftSpeech(m) {
    const g = m.goal, left = g.total - g.done;
    const d = describeGoal(m);
    if (g.type === 'score') return U.fmt(Math.max(0, left)) + ' points to go';
    if (g.type === 'chain') return 'Best chain ' + g.done + ' of ' + g.total;
    return left + ' ' + (left === 1 ? d.unit.replace(/s$/, '') : d.unit) + ' to go';
  }

  /* ── HUD data ─────────────────────────────────────────────────────────── */

  function hud() {
    if (!match) return;
    const m = match;
    emit('hud', {
      level: levelIndex + 1, levels: campaign ? campaign.levels.length : 1, name: m.level.name,
      score: m.score, balls: m.ballsLeft, fever: m.fever, goal: describeGoal(m), done: m.goal.done, total: m.goal.total, goalType: m.goal.type,
      banked: Object.assign({}, m.banked), stars: m.stars, plate: m.world.plate.mode, plateState: m.world.plate.state,
      phase: m.phase, mode: campaign ? campaign.mode : 'vivid', shotScore: m.shotScore, chain: m.chain
    });
  }

  /* ── Input during play (from the UI) ──────────────────────────────────── */

  /** Space / Enter edges while playing. Returns true if it used the press. */
  function key(type, k) {
    if (state === 'intro') { if (type === 'down') { beginPlay(); return 'skip'; } return false; }
    if (state !== 'play' || paused || !match) return false;
    if (choiceOn) return false;                     // the UI scans the Play / Pause choice
    if (k === 'Space') {
      if (oneSwitch()) return true;                 // Space is inert while the aim sweeps by itself
      if (type === 'down') {
        if (keys.Space) return true;
        keys.Space = true;
        aim.dir *= -1;                              // each new press turns the other way
        aim.holding = true;
      } else { keys.Space = false; aim.holding = false; }
      return true;
    }
    if (k === 'Enter') {
      if (type === 'down') {
        if (keys.Enter) return true;
        keys.Enter = true; keys.EnterAt = performance.now(); keys.EnterUsed = false;
        if (oneSwitch() && match.phase === 'aim') aim.frozen = true;
      } else {
        const held = performance.now() - keys.EnterAt;
        const was = keys.Enter;
        keys.Enter = false;
        emit('hold', { p: 0 });
        if (!was || keys.EnterUsed) { aim.frozen = false; return true; }
        if ((settings.preShot || held < holdToPause()) && match.phase === 'aim') fire();
        aim.frozen = false;
      }
      return true;
    }
    return false;
  }

  /** Choosing from the Play / Pause choice. */
  function choosePlay() {
    if (!choiceOn) return;
    choiceOn = false;
    emit('choice', { open: false });
    aim.sweep = 0;
    AU().sayIfIdle('Aim');
  }

  function fire() {
    if (state !== 'play' || paused || !match || !match.canFire()) return false;
    // Keep the last playable checkpoint if the page closes during the shot.
    saveResume();
    choiceOn = false;
    emit('choice', { open: false });
    if (match.fire()) {
      guidePred = null; ctx.board.setGuide(null);
      return true;
    }
    return false;
  }

  /** Mouse / touch aim at a board point. */
  function pointerAim(bx, by) {
    if (!match || state !== 'play' || paused || match.phase !== 'aim') return;
    if (choiceOn) choosePlay();
    const dx = bx - B.LAUNCH_X, dy = Math.max(1, by - B.LAUNCH_Y);
    match.aimTo(U.deg(Math.atan2(dx, dy)));
    guideDirty = true;
  }

  function pause() {
    if (state !== 'play' && state !== 'intro') return false;
    if (paused) return false;
    paused = true;
    keys.Space = false; keys.Enter = false; aim.holding = false; aim.frozen = false;
    emit('hold', { p: 0 });
    AU().play('pauseOpen');
    AU().setMusicDuck && AU().setMusicDuck(0.45);
    saveResume();
    return true;
  }
  function cancelInput(k) {
    if (!k || k === 'Space') { keys.Space = false; aim.holding = false; }
    if (!k || k === 'Enter') { keys.Enter = false; keys.EnterUsed = true; aim.frozen = false; emit('hold', { p: 0 }); }
  }
  function resume() {
    if (!paused) return;
    paused = false;
    AU().play('pauseClose');
    AU().setMusicDuck && AU().setMusicDuck(1);
    if (choiceOn) emit('choice', { open: true });
  }

  /* ── The frame ────────────────────────────────────────────────────────── */

  function update(dt) {
    worldTime += dt;
    if (state === 'menu') {
      if (attract) updateAttract(dt);
    } else if (match && !paused) {
      if (state === 'intro') {
        match.update(dt);            // the board's moving parts already move
        introTimer -= dt;
        if (introTimer <= 0) beginPlay();
      } else if (state === 'play') {
        updatePlay(dt);
      }
    }
    if (match || attract) ctx.board.update(paused ? 0 : dt, worldTime);
    ctx.fx.update(paused ? 0 : dt);
    energy = U.damp(energy, match ? U.clamp((match.fever - 1) / 4 + (match.phase === 'shot' ? 0.15 : 0), 0, 1) : 0.15, 2, dt);
    if (backdrop) {
      try { backdrop.instance.update(paused ? dt * 0.25 : dt, worldTime, AU().beat(), energy); } catch (e) { console.error('backdrop', e); }
    }
    // Post flash fades.
    const g = ctx.post.grade;
    if (g.flash > 0) ctx.post.setGrade({ flash: Math.max(0, g.flash - dt * 2.5) });
  }

  function updatePlay(dt) {
    const m = match;
    const now = performance.now();
    // The Play/Pause choice replaces hold-to-pause when enabled.
    if (!settings.preShot && keys.Enter && !keys.EnterUsed) {
      const held = now - keys.EnterAt;
      const from = holdRingFrom(), full = holdToPause();
      if (held > from) emit('hold', { p: U.clamp((held - from) / (full - from), 0, 1), seconds: Math.floor((held - from) / 1000) });
      if (held >= full) { keys.EnterUsed = true; emit('hold', { p: 0 }); emit('requestPause', {}); return; }
    }

    // Aiming.
    if (m.phase === 'aim' && !choiceOn) {
      const sp = aimSpeed();
      let moved = false;
      if (oneSwitch()) {
        if (!aim.frozen) {
          const max = m.aimMax;
          let a = m.angle + aim.dir * sp * dt;
          if (a > max) { a = max; aim.dir = -1; } else if (a < -max) { a = -max; aim.dir = 1; }
          m.aimTo(a); moved = true;
        }
      } else if (aim.holding) {
        const before = m.angle;
        m.aimTo(m.angle + aim.dir * sp * dt);
        moved = m.angle !== before;
      }
      if (moved) {
        guideDirty = true;
        if (now - aim.lastTick > 140) { AU().play('aimTick'); aim.lastTick = now; }
      }
    }
    ctx.board.setAim(m.angle);

    // Slow motion for the last goal peg.
    if (slowUntil && worldTime > slowUntil) { slowUntil = 0; }
    timeScale = U.damp(timeScale, slowUntil ? 0.22 : 1, slowUntil ? 14 : 5, dt);
    if (focusUntil && worldTime > focusUntil) { focusUntil = 0; ctx.board.unfocus(); }

    const prevPhase = m.phase;
    m.update(dt * timeScale);
    for (const ev of m.drain()) handle(ev);

    // The aim guide: refresh while aiming (the board moves, so every frame when it has movers).
    if (m.phase === 'aim' && !choiceOn) {
      const movers = m.world.movers.length > 0;
      if (guideDirty || (movers && worldTime - lastGuideT > 1 / 30)) {
        guidePred = m.guide(settings.guide);
        lastGuideT = worldTime; guideDirty = false;
      }
      ctx.board.setGuide(guidePred, AIM_COLORS[settings.aimColor] || '#ffffff', settings.guideSize === 'large' ? 1.6 : 1);
    } else if (m.phase === 'aim' && choiceOn) {
      if (guideDirty || worldTime - lastGuideT > 1 / 15) { guidePred = m.guide(settings.guide); lastGuideT = worldTime; guideDirty = false; }
      ctx.board.setGuide(guidePred, AIM_COLORS[settings.aimColor] || '#ffffff', settings.guideSize === 'large' ? 1.6 : 1);
    } else {
      ctx.board.setGuide(null);
    }
    if (prevPhase !== m.phase) hud();
  }

  /* ── Match events → picture, sound, speech ────────────────────────────── */

  const throttle = {};
  function every(name, ms) { const n = performance.now(); if (n - (throttle[name] || 0) < ms) return false; throttle[name] = n; return true; }

  function colorOf(body) { return P3.icons.colorOf(body.item || body.t); }

  /** Visual-only feedback (shared with the attract board, which stays silent). */
  function feedbackVisual(ev, quiet) {
    const fx = ctx.fx, b = ev.body;
    switch (ev.type) {
      case 'fire': {
        const mz = match ? match.world.muzzle(ev.angle) : { x: B.LAUNCH_X, y: B.LAUNCH_Y + 48 };
        fx.glowPuff(mz.x, mz.y, '#ffffff', 46, 0.25);
        fx.burst(mz.x, mz.y, { count: 8, speed: 260, angle: Math.atan2(mz.dy || 1, mz.dx || 0), spread: 0.9, color: '#ffffff', size: 8, gravity: 0 });
        break;
      }
      case 'light': case 'litBy': {
        const col = colorOf(b);
        fx.burst(ev.x, ev.y, { count: quiet ? 5 : 10, speed: 230, color: col, size: 11, life: 0.45 });
        fx.ring(b.x, b.y, col, b.r * 3.4, 0.4);
        if (!quiet && ev.points) fx.popup(b.x, b.y - b.r - 6, '+' + U.fmt(ev.points), ev.target ? 'target' : '');
        break;
      }
      case 'pop': {
        const col = colorOf(b);
        fx.burst(b.x, b.y, { count: quiet ? 4 : 9, speed: 170, color: col, size: 10, life: 0.4, gravity: 200 });
        fx.burst(b.x, b.y, { count: quiet ? 2 : 4, speed: 140, color: col, size: 9, life: 0.7, solid: true, tile: 'shard', gravity: 900, bright: 1 });
        fx.glowPuff(b.x, b.y, col, b.r * 3, 0.25);
        break;
      }
      case 'brickBreak': {
        const col = colorOf(b);
        fx.burst(b.x, b.y, { count: 14, speed: 260, color: ev.glass ? '#dff6ff' : col, size: 12, life: 0.9, solid: true, tile: 'shard', gravity: 1100, jitter: b.hw, bright: 1 });
        fx.burst(b.x, b.y, { count: 8, speed: 200, color: col, size: 12, life: 0.4 });
        if (!quiet && ev.points) fx.popup(b.x, b.y - 18, '+' + U.fmt(ev.points));
        break;
      }
      case 'crack': fx.burst(b.x, b.y, { count: 5, speed: 160, color: colorOf(b), size: 8, solid: true, tile: 'shard', gravity: 900, bright: 1 }); break;
      case 'bumper': fx.ring(b.x, b.y, '#ff4fd8', b.r * 4, 0.35); break;
      case 'clank': if (ev.speed > 400) fx.burst(ev.x, ev.y, { count: 4, speed: 200, color: '#dfe7ff', size: 7, life: 0.25, gravity: 0 }); break;
      case 'zap': (ev.targets || []).forEach(t => fx.lightning(ev.x, ev.y, t.x, t.y, '#c3b5ff')); fx.glowPuff(ev.x, ev.y, '#b8a6ff', 90, 0.4); break;
      case 'blast': fx.ring(ev.x, ev.y, '#ff8a3d', ev.radius * 2.2, 0.5); fx.glowPuff(ev.x, ev.y, '#ff7a2a', ev.radius * 1.6, 0.4); fx.burst(ev.x, ev.y, { count: 30, speed: 520, color: ['#ffd23f', '#ff7a2a', '#ff3d1f'], size: 14, life: 0.6, stretch: true }); break;
      case 'catch': fx.burst(ev.x, ev.y, { count: 16, speed: 300, angle: -Math.PI / 2, spread: 1.6, color: '#5dffb0', size: 12, gravity: 500 }); fx.ring(ev.x, ev.y, '#5dffb0', 140, 0.5); break;
      case 'plate': fx.burst(ev.x, ev.y, { count: 6, speed: 200, angle: -Math.PI / 2, spread: 1.2, color: '#ffb36b', size: 8, gravity: 300 }); break;
      case 'portal': fx.ring(ev.from.x, ev.from.y, colorOf(ev.from), 90, 0.35); fx.ring(ev.to.x, ev.to.y, colorOf(ev.to), 90, 0.35); break;
      case 'ballLost': fx.burst(ev.x, ev.y, { count: 18, speed: 300, color: ev.reason === 'hole' ? '#a070ff' : '#ff4a5a', size: 12, life: 0.5 }); break;
      case 'hazard': fx.burst(ev.x, ev.y, { count: 12, speed: 200, color: C.TYPES[ev.id].color, size: 11 }); break;
      case 'power': fx.ring(ev.x, ev.y, C.TYPES[ev.id].color, 120, 0.5); fx.burst(ev.x, ev.y, { count: 14, speed: 260, color: C.TYPES[ev.id].color, size: 12, tile: 'star' }); break;
      case 'gates': (ev.gates || []).forEach(gt => fx.burst(gt.x, gt.y, { count: 14, speed: 180, color: C.PEG_COLORS[ev.color].hex, size: 12, tile: 'star', jitter: gt.hw })); break;
      case 'unstick': fx.glowPuff(ev.x, ev.y, '#ffffff', 80, 0.35); break;
      case 'slot': fx.burst(ev.x, B.H - 40, { count: 24, speed: 380, angle: -Math.PI / 2, spread: 1.1, color: ['#ffd23f', '#ffffff'], size: 13, tile: 'star', gravity: 600 }); fx.popup(ev.x, B.H - 90, '+' + U.fmt(ev.points), 'big'); break;
    }
  }

  function handle(ev) {
    const au = AU(), fx = ctx.fx, board = ctx.board, b = ev.body;
    board.react(ev);
    feedbackVisual(ev, false);
    switch (ev.type) {
      case 'fire': au.play(ev.balls.length > 1 ? 'spray' : 'launch'); board.shake(1.5); hud(); break;
      case 'light':
        if (b.t === 'lantern') au.play('lantern', { chain: ev.chain });
        else if (b.t === 'gem') au.play('gem', { chain: ev.chain });
        else if (b.t === 'key') au.play('key');
        else au.play('peg', { chain: ev.chain });
        if (backdrop && every('bdhit', 120)) try { backdrop.instance.pulse('hit', Math.min(1, ev.chain / 12)); } catch (e) { /* optional */ }
        hud();
        break;
      case 'litBy': au.play('peg', { chain: match.chain }); break;
      case 'relight': if (every('relight', 60)) au.play('relight'); break;
      case 'bumper': if (every('bumper', 50)) au.play('bumper'); break;
      case 'clank': if (every('clank', 60)) au.play(ev.armor ? 'armor' : 'clank', { speed: ev.speed }); break;
      case 'wall': if (ev.speed > 120 && every('wall', 70)) au.play('wall', { speed: ev.speed }); break;
      case 'crack': au.play('crack'); break;
      case 'brickBreak': au.play(ev.glass ? 'glass' : 'brickBreak'); board.shake(ev.glass ? 1 : 2.5); hud(); break;
      case 'pop': au.play('pop', { index: ev.left }); break;
      case 'zap': au.play('zap'); board.shake(3); break;
      case 'blast': au.play('blast'); board.shake(9); if (settings.motion !== 'reduced') ctx.post.setGrade({ flash: 0.35 }); break;
      case 'power':
        if (ev.banked) {
          au.play('powerSaved');
          fx.callout(C.TYPES[ev.id].name, 'saved for your next shot', 'power');
          au.sayIfIdle(C.TYPES[ev.id].name + ' saved for your next shot.');
        } else {
          au.play(ev.id);
          if (ev.id === 'extra') { fx.popup(ev.x, ev.y - 30, '+1 ball', 'big'); au.sayIfIdle('Extra ball.'); }
          if (ev.id === 'multiplier') { fx.callout('Double points!', 'for this shot', 'power'); au.sayIfIdle('Double points.'); }
          if (ev.id === 'multiball') au.sayIfIdle('Multiball.');
        }
        hud();
        break;
      case 'hazard': {
        au.play(ev.id);
        const n = C.TYPES[ev.id].name;
        if (ev.id === 'thief') { const what = ev.stole ? C.TYPES[ev.stole].name : U.fmt(ev.points) + ' points'; fx.popup(ev.x, ev.y - 30, 'Stolen!', 'bad'); au.sayIfIdle('The thief took ' + (ev.stole ? 'your ' : '') + what + '.'); }
        else { fx.popup(ev.x, ev.y - 30, n + '!', 'bad'); au.sayIfIdle(n + '.'); }
        hud();
        break;
      }
      case 'ballLost': au.play(ev.reason === 'hole' ? 'hole' : 'spike'); board.shake(4); au.sayIfIdle(ev.reason === 'hole' ? 'Swallowed by a black hole.' : 'Popped by a spike.'); break;
      case 'catch': au.play('catch'); fx.popup(ev.x, ev.y - 50, 'Free ball!', 'good'); au.sayIfIdle('Free ball.'); hud(); break;
      case 'plate': if (every('plate', 80)) au.play('plate'); break;
      case 'freeBall': au.play('freeBall'); fx.callout('Free ball!', 'big shot', 'good'); au.sayIfIdle('Free ball for a big shot.'); hud(); break;
      case 'net': au.play('net'); break;
      case 'portal': au.play('portal'); break;
      case 'drain': if (every('drain', 300)) au.play('drain'); break;
      case 'gates': au.play('gate'); au.sayIfIdle('The ' + C.PEG_COLORS[ev.color].name + ' gates are open.'); break;
      case 'unstick': au.play('unstick'); break;
      case 'ballReturned': au.play('ballReturned'); au.sayIfIdle('Your ball came back.'); hud(); break;
      case 'fever':
        au.play('fever', { level: ev.mult });
        fx.callout('Fever ×' + ev.mult, null, 'fever');
        au.sayIfIdle('Fever. Times ' + ev.mult + '.');
        if (backdrop) try { backdrop.instance.pulse('fever', ev.mult / 5); } catch (e) { /* optional */ }
        hud();
        break;
      case 'goal': hud(); break;
      case 'finalApproach':
        if (settings.motion !== 'reduced') {
          slowUntil = worldTime + 0.9;
          focusUntil = worldTime + 1.6;
          board.focus(ev.body.x, ev.body.y, 1.55);
        }
        au.play('finalApproach');
        break;
      case 'goalMet':
        au.play('goalMet');
        au.stinger('finale');
        fx.confetti(140);
        fx.callout(campaign && campaign.mode === 'cozy' ? 'Lovely!' : 'Goal complete!', 'catch the bonus', 'win');
        if (settings.motion !== 'reduced') ctx.post.setGrade({ flash: 0.25 });
        slowUntil = 0;
        if (backdrop) try { backdrop.instance.pulse('goal', 1); } catch (e) { /* optional */ }
        if (!focusUntil) board.unfocus(); else focusUntil = worldTime + 1.0;
        hud();
        break;
      case 'slot': au.play('slot', { value: ev.points }); hud(); break;
      case 'style': au.play('style'); fx.callout(ev.name, '+' + U.fmt(ev.points), 'style'); au.sayIfIdle(ev.name + '.'); hud(); break;
      case 'shotEnd':
        if (match.goal.type !== 'score' && !match.goalMet && ev.hits > 0) au.sayIfIdle(goalLeftSpeech(match) + '.');
        hud();
        break;
      case 'refill':
        au.play('refill');
        fx.callout('Five more balls', 'take your time', 'good');
        au.say('Here are ' + ev.balls + ' more balls. Take your time.');
        hud();
        break;
      case 'boardReset':
        board.load(match); board.setTheme(campaign.theme, campaign.mode); board.setBackdrop(settings.backdrop); board.skipIntro();
        guideDirty = true; guidePred = null;
        fx.callout('Try another chain', 'the pieces are back', 'good');
        au.say('The pieces are back. Try to hit ' + match.goal.total + ' in one shot.');
        hud();
        break;
      case 'ready': readyForShot(); saveResume(); break;
      case 'won': onWon(ev); break;
      case 'lost': onLost(ev); break;
    }
  }

  function onWon(ev) {
    state = 'result';
    const stars = match.starCount();
    const score = match.score;
    let best = 0, newBest = false;
    if (campaign && !test) {
      const p = prog.of(campaign.id);
      best = (p.lv[levelIndex] && p.lv[levelIndex].best) || 0;
      newBest = score > best;
      prog.record(campaign.id, levelIndex, stars, score);
      U.remove('resume');
    }
    const last = campaign && levelIndex >= campaign.levels.length - 1;
    AU().stinger(last ? 'campaign-complete' : 'win-' + (campaign ? campaign.mode : 'vivid'));
    if (backdrop) try { backdrop.instance.pulse('win', 1); } catch (e) { /* optional */ }
    setTimeout(() => {
      emit('result', { won: true, stars, score, best: Math.max(best, score), newBest, ballBonus: ev.ballBonus, ballsLeft: ev.ballsLeft, last, campaign, index: levelIndex, test });
    }, 900);
  }

  function onLost(ev) {
    state = 'result';
    attempts++;
    U.remove('resume');
    AU().stinger('lose');
    setTimeout(() => {
      emit('result', { won: false, score: ev.score, left: ev.total - ev.done, goal: describeGoal(match), leftSpeech: goalLeftSpeech(match), attempts, canSkip: attempts >= 3 && !test, last: levelIndex >= campaign.levels.length - 1, campaign, index: levelIndex, test });
    }, 700);
  }

  function skipLevel() {
    if (!campaign) return;
    prog.record(campaign.id, levelIndex, 0, 0, true);
  }

  /* ── Boot ─────────────────────────────────────────────────────────────── */

  function init(c) {
    ctx = c;
    AU().init();
    applyAudioSettings();
    on('settings', (s) => {
      if (s.key === 'music' || s.key === 'sfx') applyAudioSettings();
      if (s.key === 'backdrop') ctx.board.setBackdrop(s.value);
      if (s.key === 'motion') {
        ctx.fx.setReduced(s.value === 'reduced'); ctx.board.setReduced(s.value === 'reduced');
        document.body.dataset.motion = s.value;
        const id = backdropId; backdropId = null; if (id) showWorld(id, { music: false });
      }
      if (s.key === 'guide' || s.key === 'aimColor' || s.key === 'guideSize') guideDirty = true;
    });
    ctx.fx.setReduced(settings.motion === 'reduced');
    ctx.board.setReduced(settings.motion === 'reduced');
    document.body.dataset.motion = settings.motion;
  }

  function applyAudioSettings() {
    AU().setMusicEnabled(settings.music !== false);
    AU().setSfxEnabled(settings.sfx !== false);
    if (root.SafeAudio) try { root.SafeAudio.setEnabled(settings.sfx !== false); } catch (e) { /* optional */ }
  }

  function layers() {
    const out = [];
    if (backdrop) out.push({ scene: backdrop.scene, camera: backdrop.camera, clearColor: 0x000000 });
    if (match || attract) out.push({ scene: ctx.board.scene, camera: ctx.board.camera });
    return out;
  }

  P3.game = {
    init, update, layers, on, emit, store, prog, AIM_COLORS,
    showWorld, resizeBackdrop, startAttract, stopAttract,
    startLevel, restartLevel, quitToMenu, skipLevel, beginPlay,
    key, cancelInput, choosePlay, fire, pointerAim, pause, resume,
    describeGoal, goalLeftSpeech, hud, saveResume,
    get state() { return state; }, get paused() { return paused; }, get match() { return match; },
    get campaign() { return campaign; }, get levelIndex() { return levelIndex; }, get test() { return test; },
    get choiceOn() { return choiceOn; }, get backdrop() { return backdrop; }, get attracting() { return !!attract; },
    holdToPause, oneSwitch,
    debug: { get timeScale() { return timeScale; }, get attract() { return attract; } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
