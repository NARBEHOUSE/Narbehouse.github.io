/**
 * NARBE Racer — a stand-in NK.game for testing the menus, HUD and controls
 * before the real game exists. Dev-only (tools/ is dropped from the website).
 *
 * It implements the whole NK.game contract (DESIGN §10.9), records every call
 * in NK.game.__calls, and runs a fake race with no 3D: racers are numbers, the
 * track is a parametric loop for the minimap, and the HUD gets the same data a
 * real race would send it about ten times a second — place, laps, items with
 * the roulette, coins, drift charge, guidance cues and danger — plus the
 * countdown and lap pops, a finish, and the results a couple of seconds later.
 *
 * Test hooks: __calls, __cfg (race length etc.), __force (freeze HUD fields for
 * screenshots), __race(), __finishNow(), __endNow(), __steer(h).
 *
 * Content: the real js/roster.js and js/tracks.js are used when the page
 * loaded them; otherwise a small copy of the DESIGN §9 tables stands in.
 */
(function () {
  'use strict';

  const U = NK.util;
  const C = NK.C;

  /* ── Fallback content (DESIGN §9) ────────────────────────────────────── */
  if (!NK.roster) {
    const ch = (id, name, animal, weight, emoji, primary, stats) => ({
      id, name, animal, weight, emoji, blurb: '', colors: { primary, secondary: '#ffffff', accent: '#1d1b2e', kart: primary },
      stats: { speed: stats[0], accel: stats[1], handling: stats[2], weight: stats[3] }
    });
    NK.roster = {
      CHARACTERS: [
        ch('pip', 'Pip', 'bunny', 'light', '🐰', '#ff9ec7', [2, 5, 5, 1]),
        ch('mochi', 'Mochi', 'kitten', 'light', '🐱', '#ffb347', [2, 5, 4, 1]),
        ch('sunny', 'Sunny', 'chick', 'light', '🐥', '#ffe14d', [2, 4, 5, 1]),
        ch('pixel', 'Pixel', 'mouse', 'light', '🐭', '#b9a6ff', [3, 4, 4, 1]),
        ch('rusty', 'Rusty', 'fox', 'medium', '🦊', '#ff7a2f', [3, 3, 3, 3]),
        ch('biscuit', 'Biscuit', 'puppy', 'medium', '🐶', '#d9a066', [3, 3, 4, 3]),
        ch('waddles', 'Waddles', 'penguin', 'medium', '🐧', '#6fb7ff', [3, 3, 3, 3]),
        ch('hopper', 'Hopper', 'frog', 'medium', '🐸', '#6ad35a', [3, 4, 3, 2]),
        ch('bruno', 'Bruno', 'bear', 'heavy', '🐻', '#a0673f', [5, 2, 2, 5]),
        ch('bolt', 'Bolt', 'robot', 'heavy', '🤖', '#9fb3c8', [5, 1, 3, 5]),
        ch('rex', 'Rex', 'dinosaur', 'heavy', '🦖', '#3fbf7f', [4, 2, 2, 5]),
        ch('hattie', 'Hattie', 'hippo', 'heavy', '🦛', '#c49bd6', [4, 2, 3, 5])
      ],
      VEHICLES: [
        { id: 'kart', name: 'Classic Race Car', emoji: '🏎️', blurb: 'Balanced in every way', mods: { speed: 0, accel: 0, handling: 0, weight: 0 } },
        { id: 'bike', name: 'Zoom Bike', emoji: '🏍️', blurb: 'Steers quicker, lighter', mods: { speed: 0, accel: 0.5, handling: 1, weight: -1 } },
        { id: 'buggy', name: 'Monster Buggy', emoji: '🚙', blurb: 'Heavier, slower to speed up', mods: { speed: 0.5, accel: -1, handling: -0.5, weight: 1 } },
        { id: 'hover', name: 'Hover Vehicle', emoji: '🛸', blurb: 'A bit faster, slower to steer', mods: { speed: 1, accel: 0, handling: -1, weight: 0 } }
      ],
      statsFor: () => ({ speedMul: 1, accelRate: 1, handlingMul: 1, weight: 1 })
    };
  }
  if (!NK.tracks) {
    const t = (id, name, cup, blurb) => ({ id, name, cup, theme: id, blurb, laps: 3 });
    NK.tracks = {
      CUPS: [
        { id: 'sunshine', name: 'Sunshine Cup', emoji: '☀️', tracks: ['meadow', 'shores', 'candy', 'dunes'] },
        { id: 'moonlight', name: 'Moonlight Cup', emoji: '🌙', tracks: ['frost', 'spooky', 'lava', 'starlight'] }
      ],
      TRACKS: {
        meadow: t('meadow', 'Meadow Circuit', 'sunshine', 'Wide bends through the fields'),
        shores: t('shores', 'Sandy Shores', 'sunshine', 'Palm trees and a pier'),
        candy: t('candy', 'Candy Canyon', 'sunshine', 'Lollipops and a chocolate river'),
        dunes: t('dunes', 'Dusty Dunes', 'sunshine', 'Pyramids and tumbleweeds'),
        frost: t('frost', 'Frosty Peaks', 'moonlight', 'Snowmen and slippy ice'),
        spooky: t('spooky', 'Spooky Woods', 'moonlight', 'Pumpkins and friendly ghosts'),
        lava: t('lava', 'Lava Castle', 'moonlight', 'Geysers round the castle walls'),
        starlight: t('starlight', 'Starlight Road', 'moonlight', 'A road through the stars')
      },
      get: function (id) { return this.TRACKS[id]; }
    };
  }

  /* ── Recording ───────────────────────────────────────────────────────── */
  const calls = [];
  function rec(fn, args) {
    calls.push({ fn: fn, args: JSON.parse(JSON.stringify(Array.prototype.slice.call(args || []))), t: performance.now() });
  }
  const handlers = {};
  function emit(ev) {
    const args = Array.prototype.slice.call(arguments, 1);
    (handlers[ev] || []).forEach((fn) => { try { fn.apply(null, args); } catch (e) { console.error(e); } });
  }

  /* ── Saved state (the real nk- keys) ─────────────────────────────────── */
  const DEFAULTS = { cueLevel: 2, music: true, sfx: true, steerMode: 'hold', steerSpeed: 'normal', split: 'side', shake: true };
  const settingsData = Object.assign({}, DEFAULTS, U.load('settings', {}));
  let progress = U.load('progress', { cups: { nofail: 1, open: 1 }, mirror: false });
  let trophies = U.load('trophies', {});
  let best = U.load('best', {});
  let picks = U.load('picks', {});

  const session = {
    players: 1, mode: picks.mode || 'nofail', type: picks.type || 'gp', classId: picks.classId || 'easy',
    picks: [
      { charId: (picks.p1 && picks.p1.char) || 'pip', vehicleId: (picks.p1 && picks.p1.kart) || 'kart' },
      { charId: (picks.p2 && picks.p2.char) || 'rusty', vehicleId: (picks.p2 && picks.p2.kart) || 'kart' }
    ],
    cupId: picks.cupId || 'sunshine', trackId: picks.trackId || 'meadow', gp: null
  };

  function savePicks() {
    picks = {
      p1: { char: session.picks[0].charId, kart: session.picks[0].vehicleId },
      p2: { char: session.picks[1].charId, kart: session.picks[1].vehicleId },
      mode: session.mode, type: session.type, classId: session.classId, cupId: session.cupId, trackId: session.trackId
    };
    U.save('picks', picks);
  }

  /* ── The fake world: a loop for the minimap ──────────────────────────── */
  const L = 1000;
  const W = (function () {
    const N = 180;
    const pts = new Float32Array(N * 2);
    // A kidney-shaped circuit: radius always positive, so it never crosses itself.
    const at = (u, out) => {
      const a = u * Math.PI * 2;
      const r = 175 + 50 * Math.cos(a) + 18 * Math.cos(3 * a);
      out.x = r * Math.cos(a);
      out.z = 0.62 * r * Math.sin(a);
      return out;
    };
    const tmp = { x: 0, z: 0 };
    for (let i = 0; i < N; i++) { at(i / N, tmp); pts[i * 2] = tmp.x; pts[i * 2 + 1] = tmp.z; }
    const fr = { pos: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };
    const a = { x: 0, z: 0 }, b = { x: 0, z: 0 };
    return {
      L: L,
      minimap: { pts: pts, bounds: null },
      frameAt: function (s) {
        const u = U.mod(s, L) / L;
        at(u, a); at(u + 0.001, b);
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        fr.pos.x = a.x; fr.pos.z = a.z;
        fr.forward.x = dx / l; fr.forward.z = dz / l;
        fr.right.x = -dz / l; fr.right.z = dx / l;
        return fr;
      }
    };
  })();

  /* ── The fake race ───────────────────────────────────────────────────── */
  const cfg = { raceSeconds: 20, intro: 1.2, resultsDelay: 2.5, hudHz: 10, autoItems: true, autoCue: true };
  const force = {};
  let phase = 'menu';
  let prevPhase = null;
  let race = null;
  let hudT = 0;
  let endTimer = null;

  function currentTrack() {
    if (session.type === 'gp') {
      const cup = NK.tracks.CUPS.find((c) => c.id === session.cupId) || NK.tracks.CUPS[0];
      return cup.tracks[((session.gp && session.gp.race) || 1) - 1];
    }
    return session.trackId;
  }

  function newRace() {
    const humans = session.players === 2 ? 2 : 1;
    const tt = session.type === 'tt';
    const n = tt ? humans : C.RACERS;
    const chars = NK.roster.CHARACTERS.map((c) => c.id);
    const racers = [];
    for (let i = 0; i < n; i++) {
      const human = i < humans;
      const pk = human ? session.picks[i] : null;
      let charId = human ? pk.charId : chars[i % chars.length];
      if (!human && racers.some((r) => r.charId === charId)) charId = chars.find((id) => !racers.some((r) => r.charId === id)) || charId;
      const c = NK.roster.CHARACTERS.find((x) => x.id === charId);
      // Humans start at the back of the grid, as in the real game.
      const slot = human ? n - humans + i : i - humans;
      racers.push({
        idx: i, isHuman: human, human: human ? i : -1, charId: charId,
        vehicleId: human ? pk.vehicleId : 'kart', name: c ? c.name : charId,
        progress: -(slot * 6 + 4),
        s: 0, x: C.laneX(i % 2 ? 3 : 1), lane: i % 2 ? 3 : 1, targetLane: i % 2 ? 3 : 1, steer: 0,
        v: 0, pace: human ? 1 : 0.94 + ((i * 37) % 11) / 100,
        place: n - i, finished: false, finishTime: null, coins: 0,
        item: tt && human ? 'rocket3' : null, roulette: 0, rouletteKind: null, itemT: tt && human ? 3 + Math.random() * 3 : 2.5 + i,
        drift: { dir: 0, charge: 0, level: 0 }, driftT: 0,
        cue: { dir: 0, active: false, targetLane: 2, danger: false }, cueT: 1.5,
        lap: 1, rocket: false
      });
    }
    return { racers, humans, t: 0, time: 0, countdown: 3, track: currentTrack(), laps: C.LAPS, tt };
  }

  function standings() {
    const rs = race.racers.slice();
    rs.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    rs.forEach((r, i) => { r.place = i + 1; });
    return rs;
  }

  function hudData(h) {
    const d = {
      place: h.place, of: race.racers.length, lap: h.lap, laps: race.laps,
      item: h.roulette > 0 ? null : h.item, itemUseT: h.item ? h.itemT : 0, roulette: h.roulette > 0, coins: h.coins,
      time: race.time, best: race.tt ? (best[race.track] && best[race.track][session.classId]) || null : null,
      lane: h.lane, drift: h.drift,
      cue: { dir: h.cue.dir, active: h.cue.active, level: settingsData.cueLevel },
      danger: h.cue.danger,
      finished: h.finished,
      label: session.players === 2 ? h.name : ''
    };
    return Object.assign(d, force);
  }

  function pushHud() {
    for (let i = 0; i < race.humans; i++) {
      const h = race.racers[i];
      NK.hud.update(i, hudData(h));
      NK.hud.minimap(i, W, race.racers, i);
    }
  }

  function laneTime() { return (C.STEER_SPEEDS[settingsData.steerSpeed] || C.STEER_SPEEDS.normal).laneTime; }

  function simHuman(h, dt) {
    if (h.steer) {
      h.x = U.clamp(h.x + h.steer * (C.LANE_W / laneTime()) * dt, C.laneX(0), C.laneX(C.LANE_COUNT - 1));
      h.targetLane = C.laneOf(h.x);
    } else {
      h.x = U.damp(h.x, C.laneX(h.targetLane), C.SETTLE_LAMBDA, dt);
    }
    h.lane = C.laneOf(h.x);
    if (!cfg.autoCue) return;
    // A fake guidance: every few seconds it picks a lane to go to.
    h.cueT -= dt;
    if (h.cueT <= 0) {
      h.cueT = 2.6;
      let t = (h.lane + 1 + Math.floor(Math.random() * 4)) % C.LANE_COUNT;
      h.cue.targetLane = t;
      h.cue.danger = Math.random() < 0.35;
    }
    const d = h.cue.targetLane - h.lane;
    h.cue.dir = d < 0 ? -1 : d > 0 ? 1 : 0;
    h.cue.active = h.cue.dir !== 0;
    if (!h.cue.active) h.cue.danger = false;
  }

  function simItems(r, dt) {
    if (!cfg.autoItems) return;
    if (r.roulette > 0) {
      r.roulette -= dt;
      if (r.roulette <= 0) { r.roulette = 0; r.item = r.rouletteKind; r.itemT = 3 + Math.random() * 3; }
      return;
    }
    r.itemT -= dt;
    if (r.itemT > 0) return;
    if (r.item) {
      const def = (NK.items && NK.items.DEFS && NK.items.DEFS[r.item]) || null;
      if (r.isHuman) NK.hud.pop(r.human, (def ? def.name : r.item.replace(/\d/, '')).toUpperCase() + '!', 'item');
      r.item = null;
      r.itemT = 2.2;
    } else {
      const pool = ['rocket', 'rocket3', 'goldrocket', 'peel', 'ball', 'bee', 'star', 'jet', 'horn', 'mega', 'coins', 'bomb', 'shrink'];
      r.rouletteKind = pool[Math.floor(Math.random() * pool.length)];
      r.roulette = 1.4;
    }
  }

  function simDrift(r, dt) {
    r.driftT += dt;
    const cycle = r.driftT % 6;
    if (cycle < 3.4) { r.drift.dir = 1; r.drift.charge = cycle; }
    else if (r.drift.charge > 0) {
      if (r.isHuman) NK.hud.pop(r.human, 'TURBO!', 'good');
      r.drift.dir = 0; r.drift.charge = 0;
    }
    r.drift.level = 0;
    for (let i = 0; i < C.DRIFT_LEVELS.length; i++) if (r.drift.charge >= C.DRIFT_LEVELS[i]) r.drift.level = i + 1;
  }

  function finishRacer(r) {
    r.finished = true;
    r.finishTime = race.time;
    if (r.isHuman) {
      const pl = standings().indexOf(r) + 1;
      NK.hud.pop(r.human, 'FINISH! ' + U.ordinal(pl), 'finish');
      U.speak('Finish! ' + U.ordinalWord(pl));
    }
  }

  function step(dt) {
    race.t += dt;
    if (phase === 'intro') {
      if (race.t >= cfg.intro) { setPhase('countdown'); race.t = 0; countdown(3); }
      return;
    }
    if (phase === 'countdown') {
      if (race.t >= 1) {
        race.t = 0;
        if (race.countdown > 1) countdown(race.countdown - 1);
        else { race.countdown = 0; emit('countdown', 0); NK.hud.pop(-1, 'GO!', 'go'); U.speak('Go'); setPhase('racing'); }
      }
      return;
    }
    if (phase !== 'racing' && phase !== 'done') return;
    race.time += dt;
    const v = (L * race.laps) / cfg.raceSeconds;
    for (let i = 0; i < race.racers.length; i++) {
      const r = race.racers[i];
      if (!r.finished) {
        r.progress += v * r.pace * dt * (0.97 + 0.06 * Math.sin(race.time * 0.7 + i));
        const lap = r.progress < 0 ? 1 : Math.floor(r.progress / L) + 1;
        if (lap > r.lap && lap <= race.laps && r.isHuman) {
          NK.hud.pop(r.human, lap === race.laps ? 'FINAL LAP!' : 'LAP ' + lap, lap === race.laps ? 'final' : 'lap');
          if (lap === race.laps) U.speak('Final lap!');
        }
        r.lap = Math.min(lap, race.laps);
        if (r.progress >= race.laps * L) finishRacer(r);
      }
      r.s = U.mod(r.progress, L);
      if (r.isHuman) simHuman(r, dt);
      simItems(r, dt);
      simDrift(r, dt);
      if (r.isHuman && Math.random() < dt * 0.35) r.coins = Math.min(C.COIN_MAX, r.coins + 1);
    }
    standings();
    if (phase === 'racing' && race.racers.slice(0, race.humans).every((h) => h.finished)) {
      setPhase('done');
      endTimer = setTimeout(() => { endTimer = null; if (phase === 'done') emit('raceEnd', results()); }, cfg.resultsDelay * 1000);
    }
  }

  function countdown(n) {
    race.countdown = n;
    emit('countdown', n);
    NK.hud.pop(-1, String(n), 'count');
  }

  function setPhase(p) {
    phase = p;
    emit('phase', p);
  }

  /* ── Results and the Grand Prix ──────────────────────────────────────── */

  let lastRaceResults = null;

  function results() {
    if (!race) return lastRaceResults;
    const order = standings();
    const gp = session.gp;
    if (gp && !race.scored) {
      race.scored = true;
      order.forEach((r, i) => {
        const pts = C.POINTS[i] || 0;
        const row = gp.standings.find((s) => s.charId === r.charId);
        if (row) row.total += pts; else gp.standings.push({ name: r.name, charId: r.charId, human: r.human, total: pts });
        r.points = pts;
      });
      gp.standings.sort((a, b) => b.total - a.total);
      gp.done = gp.race >= gp.of;
    }
    const humans = race.racers.slice(0, race.humans).map((h) => {
      let newBest = false;
      if (race.tt) {
        const cur = best[race.track] && best[race.track][session.classId];
        if (!cur || h.finishTime < cur) {
          best[race.track] = best[race.track] || {};
          best[race.track][session.classId] = +h.finishTime.toFixed(2);
          U.save('best', best);
          newBest = true;
        }
      }
      return { human: h.human, place: h.place, time: h.finishTime !== null ? h.finishTime : race.time, newBest };
    });
    lastRaceResults = {
      track: race.track, mode: session.mode, classId: session.classId, type: session.type,
      order: order.map((r) => ({
        place: r.place, name: r.name, charId: r.charId, human: r.human,
        time: r.finishTime !== null ? r.finishTime : race.time + (r.place - 1) * 1.7,
        points: gp ? r.points : undefined,
        total: gp ? (gp.standings.find((s) => s.charId === r.charId) || {}).total : undefined
      })),
      humans,
      gp: gp ? { race: gp.race, of: gp.of, standings: gp.standings.slice(), done: gp.done, trophies: [] } : null
    };
    return lastRaceResults;
  }

  function awardTrophy() {
    const gp = session.gp;
    const idx = gp.standings.findIndex((s) => s.human === 0);
    const place = idx + 1;
    const kind = place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : (session.mode === 'nofail' ? 'done' : null);
    if (kind) {
      trophies[session.mode] = trophies[session.mode] || {};
      trophies[session.mode][session.classId] = trophies[session.mode][session.classId] || {};
      trophies[session.mode][session.classId][session.cupId] = kind;
      U.save('trophies', trophies);
    }
    const unlocks = session.mode === 'nofail' || place <= 3;
    if (unlocks && session.cupId === 'sunshine') {
      progress.cups[session.mode] = 2;
      U.save('progress', progress);
    }
    return { cupId: session.cupId, mode: session.mode, classId: session.classId, standings: gp.standings.slice(),
             trophies: [{ human: 0, place: place, trophy: kind }] };
  }

  /* ── Race lifecycle ──────────────────────────────────────────────────── */

  function beginRace() {
    clearTimeout(endTimer);
    race = newRace();
    hudT = 0;
    NK.hud.setup(session.players === 2 ? settingsData.split : 'single');
    setPhase('intro');
    pushHud();
  }

  const game = {
    init: function () { rec('init', arguments); },
    update: function (dt) {
      if (!race || phase === 'paused' || phase === 'menu' || phase === 'podium') return;
      step(dt);
      hudT += dt;
      if (hudT >= 1 / cfg.hudHz) { hudT = 0; pushHud(); }
    },
    beforeView: function () {},
    settings: {
      get: (k) => settingsData[k],
      set: function (k, v) { rec('settings.set', arguments); settingsData[k] = v; U.save('settings', settingsData); }
    },
    get session() { return JSON.parse(JSON.stringify(session)); },
    setPlayers: function (n) { rec('setPlayers', arguments); session.players = n === 2 ? 2 : 1; if (session.players === 2 && session.type === 'tt') session.type = 'single'; },
    setMode: function (id) { rec('setMode', arguments); session.mode = id; savePicks(); },
    setType: function (id) { rec('setType', arguments); session.type = id; savePicks(); },
    setClass: function (id) { rec('setClass', arguments); session.classId = id; savePicks(); },
    setPick: function (p, pick) {
      rec('setPick', arguments);
      const pk = session.picks[p === 1 ? 1 : 0];
      if (pick.charId) pk.charId = pick.charId;
      if (pick.vehicleId) pk.vehicleId = pick.vehicleId;
      savePicks();
    },
    setCup: function (id) { rec('setCup', arguments); session.cupId = id; savePicks(); },
    setTrack: function (id) { rec('setTrack', arguments); session.trackId = id; savePicks(); },
    lastPicks: () => JSON.parse(JSON.stringify(picks)),
    unlocked: {
      cups: (mode) => (progress.cups && progress.cups[mode]) || 1,
      get mirror() { return !!progress.mirror; }
    },
    trophy: (mode, cls, cup) => (trophies[mode] && trophies[mode][cls] && trophies[mode][cls][cup]) || null,
    bestTime: (track, cls) => (best[track] && best[track][cls]) || null,
    setPreview: function (p) {
      rec('setPreview', arguments);
      const el = document.getElementById('mockPreview');
      if (!el) return;
      if (!p) { el.classList.remove('on'); return; }
      const c = NK.roster.CHARACTERS.find((x) => x.id === p.charId);
      const v = NK.roster.VEHICLES.find((x) => x.id === p.vehicleId);
      el.classList.add('on');
      el.querySelector('.who').textContent = c ? c.emoji : '';
      el.querySelector('.ride').textContent = v ? v.emoji : '';
      el.querySelector('.name').textContent = (c ? c.name : '') + (v ? ' · ' + v.name : '');
    },
    startSession: function () {
      rec('startSession', arguments);
      session.gp = session.type === 'gp' ? { race: 1, of: 4, standings: [], done: false } : null;
      beginRace();
    },
    nextRace: function () {
      rec('nextRace', arguments);
      const gp = session.gp;
      if (gp && gp.race >= gp.of) {
        // The cup is over: the podium ceremony, then the summary.
        phase = 'podium';
        NK.hud.clear();
        const summary = awardTrophy();
        setTimeout(() => emit('gpEnd', summary), 300);
        return;
      }
      if (gp) gp.race++;
      beginRace();
    },
    restartRace: function () {
      rec('restartRace', arguments);
      beginRace();
    },
    quitToMenu: function () {
      rec('quitToMenu', arguments);
      clearTimeout(endTimer);
      race = null;
      phase = 'menu';
      session.gp = null;
      NK.hud.clear();
    },
    pause: function () {
      rec('pause', arguments);
      if (phase === 'intro' || phase === 'countdown' || phase === 'racing' || phase === 'done') { prevPhase = phase; setPhase('paused'); }
    },
    resume: function () {
      rec('resume', arguments);
      if (phase === 'paused') { setPhase(prevPhase || 'racing'); prevPhase = null; }
    },
    isRacing: () => ['intro', 'countdown', 'racing', 'done', 'paused'].indexOf(phase) >= 0,
    isPaused: () => phase === 'paused',
    phase: () => phase,
    steer: function (h, dir) {
      rec('steer', arguments);
      const r = race && race.racers[h];
      if (r && r.isHuman) r.steer = dir;
    },
    targetLane: function (h, lane) {
      rec('targetLane', arguments);
      const r = race && race.racers[h];
      if (r && r.isHuman) { r.steer = 0; r.targetLane = U.clamp(lane | 0, 0, C.LANE_COUNT - 1); }
    },
    pressed: function (h) {
      rec('pressed', arguments);
      const r = race && race.racers[h];
      if (r && phase === 'countdown' && race.countdown <= 2) r.rocket = true;
    },
    lane: (h) => { const r = race && race.racers[h]; return r ? r.targetLane : 2; },
    /* __force.cue / __force.cueLane pin the guidance for screenshots. */
    cue: (h) => {
      const r = race && race.racers[h];
      const c = force.cue || (r ? r.cue : { dir: 0, active: false });
      const lane = force.cueLane !== undefined ? force.cueLane : (r ? r.cue.targetLane : 2);
      return { dir: c.dir, active: c.active, targetLane: lane, danger: !!(r && r.cue.danger), level: settingsData.cueLevel };
    },
    results: function () { return results(); },
    resetProgress: function () {
      rec('resetProgress', arguments);
      progress = { cups: { nofail: 1, open: 1 }, mirror: false };
      trophies = {};
      best = {};
      U.save('progress', progress); U.save('trophies', trophies); U.save('best', best);
    },
    on: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },

    /* ── Test hooks ── */
    __calls: calls,
    __cfg: cfg,
    __force: force,
    __race: () => race,
    __W: W,
    __finishNow: function () {
      if (!race) return;
      if (phase === 'intro' || phase === 'countdown') setPhase('racing');
      race.racers.forEach((r, i) => { if (!r.finished) r.progress = race.laps * L - (r.isHuman ? 0.01 : 0.5 + i); });
    },
    __endNow: function () { if (race) { clearTimeout(endTimer); setPhase('done'); emit('raceEnd', results()); } },
    /** Arrange the finish: `place - 1` CPUs are already home, P1 (and P2) cross next frame. */
    __finishAs: function (place) {
      if (!race) return;
      if (phase === 'intro' || phase === 'countdown') setPhase('racing');
      race.time = Math.max(race.time, 92.4);
      let ahead = Math.max(0, (place || 1) - 1);
      const n = ahead;
      race.racers.forEach((r, i) => {
        if (r.isHuman) { r.progress = race.laps * L - 0.01; return; }
        if (ahead > 0) {
          r.finished = true;
          r.finishTime = race.time - 1.2 * ahead - 0.4;
          r.progress = race.laps * L + (n - ahead);
          ahead--;
        } else {
          r.progress = race.laps * L - 30 - i * 9;
        }
      });
    },
    __progress: (p) => { progress = Object.assign(progress, p); U.save('progress', progress); },
    __steer: (h) => { const r = race && race.racers[h]; return r ? { steer: r.steer, x: r.x, lane: r.lane, targetLane: r.targetLane, rocket: r.rocket } : null; }
  };

  NK.game = game;
})();
