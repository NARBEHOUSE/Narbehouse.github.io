/** Benny's Sphere Splash - sound effects, the crowd and the music.
 *
 *  Every sound is a WAV file made offline by tools/generate-audio.mjs (no recordings; the
 *  recipes are the source, and Bryan picked each one in listening rounds). Plain HTML audio
 *  only, never an AudioContext (ACCESSIBILITY.md: it can take down the desktop build).
 *    effects  one-shots through SafeAudio, named 'ss-...' so they never shadow its built-ins.
 *    crowd    a murmur loop under every match, plus three reactions: a sung "ooh" as a shot
 *             goes in, a roar for a goal, an "aww" for a save or a block.
 *    music    the island theme on the menus, at halftime and on the results card (none during
 *             play: there the crowd and the commentary carry it), and the anthem stings for a
 *             goal and at full time.
 *  Speech has the floor: the crowd drops to 28% and the music to 30% while anything speaks
 *  (Robot Football's and P3GL's levels), and effects start at 65%. The pause ticks never duck.
 *  Settings: Sound Effects, Music, Crowd - each on or off.
 *
 *  The music loops without a gap using NARBE Racer's / P3GL's LoopPlayer (BENNYSPEGGLE/js/audio.js):
 *  <audio loop> leaves ~90 ms of silence each pass, so the file holds the loop plus a copy of its
 *  opening seconds, and two elements take turns, aligned and crossfaded. */
SS.audio = (function () {
  'use strict';

  const BASE = 'audio/';
  /* ── Levels (files are already matched in loudness; these set the mix) ── */
  const SFX_VOL = 0.9, MENU_VOL = 0.8, CROWD_BED = 0.28, CROWD_CUE = 0.38, MUSIC_VOL = 0.48, STING_VOL = 0.54;
  const DUCK_CROWD = 0.28, DUCK_MUSIC = 0.3, DUCK_SFX = 0.65, STING_DUCK = 0.35;
  const SWELL_GAP = 1600;            // ms: one "ooh" at a time
  const PUMP_MS = 50;

  const SFX = ['whistle', 'pass', 'catch', 'shot', 'tackle', 'block', 'save', 'goal', 'tech', 'decision', 'move', 'select', 'tick1', 'tick2', 'tick3', 'tick4', 'tick5'];
  const CROWD_CUES = ['swell', 'roar', 'groan'];
  const STINGS = { goal: 4, win: 4.5, lose: 4.5 };   // seconds each keeps the theme ducked
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let preloaded = false, halted = false, hidden = false, lastSwell = -1e9, stingUntil = 0;
  let bed = null, bedVol = 0, bedBlocked = false, music = null, musicLevel = 0;
  const setting = k => SS.save.settings.get(k) !== false;
  const safe = () => window.SafeAudio;
  const talking = () => (SS.util.speaking() || (SS.broadcast && SS.broadcast.talking && SS.broadcast.talking()));

  function preload() {
    if (preloaded || !safe()) return;
    preloaded = true;
    try {
      SFX.forEach(n => safe().preload('ss-' + n, BASE + 'sfx/' + n + '.wav'));
      CROWD_CUES.forEach(n => safe().preload('ss-crowd-' + n, BASE + 'crowd/' + n + '.wav'));
      Object.keys(STINGS).forEach(n => safe().preload('ss-sting-' + n, BASE + 'music/' + n + '.wav'));
    } catch (e) { /* sound is never worth a crash */ }
  }
  function shot(name, vol) {
    if (halted || hidden || !safe()) return;
    preload();
    try { safe().play(name, clamp(vol, 0, 1)); } catch (e) { /* ignore */ }
  }

  /** A match sound: whistle, pass, catch, shot, tackle, block, save, goal, tech, decision. */
  function play(name, vol) {
    if (!setting('sfx')) return;
    shot('ss-' + name, SFX_VOL * (vol == null ? 1 : vol) * (talking() ? DUCK_SFX : 1));
  }
  /** Menu feedback: move, select, or SafeAudio's own 'bust' for a locked item. */
  function menu(kind) {
    if (!setting('sfx')) return;
    if (kind === 'blocked') { try { if (safe()) safe().play('bust', 0.2); } catch (e) { /* ignore */ } return; }
    shot('ss-' + (kind === 'move' ? 'move' : 'select'), MENU_VOL);
  }
  /** The pause hold's rising ticks: they are how the hold is felt eyes-closed, so never ducked. */
  function tick(sec) { if (setting('sfx')) shot('ss-tick' + clamp(sec, 1, 5), 0.55); }

  /** The crowd reacts: 'swell' (a shot is going in), 'roar' (goal) or 'groan' (save / block). */
  function crowd(kind) {
    if (!setting('crowd') || CROWD_CUES.indexOf(kind) < 0) return;
    const now = performance.now();
    if (kind === 'swell') { if (now - lastSwell < SWELL_GAP) return; lastSwell = now; }
    else try { if (safe()) safe().stop('ss-crowd-swell'); } catch (e) { /* ignore */ }
    shot('ss-crowd-' + kind, CROWD_CUE);
  }
  /** A music sting: 'goal', 'win' or 'lose'. The theme, if it is playing, ducks under it. */
  function sting(name) {
    if (!setting('music') || !STINGS[name]) return;
    stingUntil = performance.now() + STINGS[name] * 1000;
    shot('ss-sting-' + name, STING_VOL);
  }

  /* ══ the gapless loop (NARBE Racer / P3GL's LoopPlayer, trimmed to what one theme needs) ══ */
  function makeEl(url) {
    const a = new Audio();
    a.preload = 'auto';
    try { a.preservesPitch = true; } catch (e) { /* ignore */ }
    a.volume = 0;
    a.src = url;
    return a;
  }
  function LoopPlayer(url, sec, tail) {
    this.sec = sec; this.tail = tail; this.tol = 0.0015; this.xf = 0.2;
    this.els = [makeEl(url), makeEl(url)];
    this.cur = 0; this.state = 'idle';            // idle | run | start | align | fade | paused
    this.vol = 0; this.vSet = [-1, -1]; this.rSet = [-1, -1];
    this.lag = [0.03, 0.03];                      // learned start latency of each element, seconds
    this.hist = new Float64Array(5); this.sorted = new Float64Array(5); this.hn = 0;
    this.ok = 0; this.fadeT = 0; this.seek = 0; this.learned = false; this.blocked = false; this.swaps = 0;
    const self = this;
    this.els.forEach(el => el.addEventListener('ended', () => self.onEnded(el)));
  }
  LoopPlayer.prototype = {
    kick(el) {
      const self = this;
      try { const p = el.play(); if (p && p.catch) p.catch(e => { if (e && e.name === 'NotAllowedError') self.blocked = true; }); } catch (e) { /* not loaded yet */ }
    },
    play() { this.abortSwap(); try { this.els[this.cur].currentTime = 0; } catch (e) { /* ignore */ } this.state = 'run'; this.setRateOn(this.cur, 1); this.applyVol(); this.kick(this.els[this.cur]); },
    pause() { if (this.state === 'idle' || this.state === 'paused') return; this.abortSwap(); this.els[this.cur].pause(); this.state = 'paused'; },
    resume() { if (this.state !== 'paused') return; this.state = 'run'; this.applyVol(); this.kick(this.els[this.cur]); },
    stop() { this.abortSwap(); const A = this.els[this.cur]; A.pause(); try { A.currentTime = 0; } catch (e) { /* ignore */ } this.state = 'idle'; },
    abortSwap() {
      if (this.state !== 'start' && this.state !== 'align' && this.state !== 'fade') return;
      const B = this.els[1 - this.cur]; B.pause(); try { B.currentTime = 0; } catch (e) { /* ignore */ }
      this.state = 'run'; this.fadeT = 0; this.applyVol();
    },
    setVolume(v) { this.vol = v; this.applyVol(); },
    applyVol() { const f = this.state === 'fade' ? this.fadeT : 0; this.setVolOn(this.cur, this.vol * (1 - f)); this.setVolOn(1 - this.cur, this.vol * f); },
    setVolOn(i, v) { v = clamp(v, 0, 1); if (Math.abs(this.vSet[i] - v) > 0.002 || (v === 0 && this.vSet[i] !== 0)) { this.els[i].volume = v; this.vSet[i] = v; } },
    setRateOn(i, r) { if (Math.abs(this.rSet[i] - r) > 0.0008) { this.els[i].playbackRate = r; this.rSet[i] = r; } },
    step(dt) {
      const st = this.state;
      if (st === 'idle' || st === 'paused') return;
      const A = this.els[this.cur], B = this.els[1 - this.cur], sec = this.sec, a = A.currentTime;
      if (st === 'run') { if (!A.paused && a >= sec + 0.03 && a < sec + this.tail - 0.3) this.startSwap(B, a); return; }
      const late = a > sec + this.tail - 0.35;
      if (st === 'start') {
        if (!B.paused && B.currentTime > this.seek + 0.002) { this.state = 'align'; this.hn = 0; this.ok = 0; }
        else if (late) this.abortSwap();                    // B never got going: A carries on
        return;
      }
      this.pushOff(a - sec - B.currentTime);                // how far B trails A's position one loop earlier
      if (this.hn < 3) return;
      const off = this.medianOff();
      if (!this.learned) { this.learned = true; this.lag[1 - this.cur] += off; }
      if (st === 'align') {
        this.setRateOn(1 - this.cur, 1 + clamp(off * 6, -0.08, 0.08));
        this.ok = Math.abs(off) < this.tol ? this.ok + 1 : 0;
        if (this.ok >= 3 || late) { this.state = 'fade'; this.fadeT = 0; }
      } else {
        this.setRateOn(1 - this.cur, 1 + clamp(off * 4, -0.03, 0.03));
        this.fadeT = Math.min(1, this.fadeT + dt / this.xf);
        this.applyVol();
        if (this.fadeT >= 1) this.endSwap();
      }
    },
    startSwap(B, a) {
      const other = 1 - this.cur;
      this.seek = Math.max(0, a - this.sec + this.lag[other]);
      try { B.currentTime = this.seek; } catch (e) { return; }
      this.setVolOn(other, 0); this.setRateOn(other, 1);
      this.hn = 0; this.ok = 0; this.learned = false; this.fadeT = 0;
      this.state = 'start';
      this.kick(B);
    },
    endSwap() {
      const A = this.els[this.cur]; A.pause(); try { A.currentTime = 0; } catch (e) { /* ignore */ }
      this.cur = 1 - this.cur; this.state = 'run'; this.fadeT = 0;
      this.setRateOn(this.cur, 1); this.applyVol();
      this.swaps++;
    },
    onEnded(el) {
      if (el !== this.els[this.cur] || this.state === 'idle' || this.state === 'paused') return;
      if ((this.state === 'align' || this.state === 'fade') && !this.els[1 - this.cur].paused) { this.endSwap(); return; }
      this.abortSwap();                                     // nothing drove the swap: carry on from the matching point
      try { el.currentTime = this.tail % this.sec; } catch (e) { /* ignore */ }
      this.kick(el);
    },
    pushOff(d) { if (this.hn < 5) { this.hist[this.hn++] = d; return; } for (let i = 0; i < 4; i++) this.hist[i] = this.hist[i + 1]; this.hist[4] = d; },
    medianOff() {
      const n = this.hn, s = this.sorted;
      for (let i = 0; i < n; i++) { const v = this.hist[i]; let j = i - 1; while (j >= 0 && s[j] > v) { s[j + 1] = s[j]; j--; } s[j + 1] = v; }
      return s[n >> 1];
    },
  };

  /* ══ what should be playing: decided every 50 ms from the game's state ══ */
  const QUIET_SCREENS = { pause: 1, confirmRestart: 1, confirmExit: 1, settings: 1 };
  function scene() {
    const g = SS.game, ui = SS.ui;
    if (!g || !ui) return { music: false, crowd: false };
    if (!g.inMatch()) return { music: true, crowd: false };          // title and every menu before a match
    const card = ui.context() === 'card', ph = g.phase;
    if (card && (ph === 'halftime' || ph === 'fulltime')) return { music: true, crowd: false };
    return { music: false, crowd: !(card && QUIET_SCREENS[ui.screen]) && ph !== 'halftime' && ph !== 'fulltime' };
  }

  function ensureBed() {
    if (bed) return bed;
    bed = new Audio();
    bed.preload = 'auto'; bed.loop = true; bed.volume = 0; bed.src = BASE + 'crowd/bed.wav';
    bed.addEventListener('error', () => { bed.pause(); });
    return bed;
  }
  function ensureMusic() {
    if (music) return music;
    const f = (SS.AUDIO_FILES || {}).theme;
    if (!f) return null;
    music = new LoopPlayer(BASE + 'music/theme.wav', f.sec, f.tail);
    return music;
  }

  /** Until the first press or tap a browser may refuse to start sound; then we wait for one. */
  function startBed(b) {
    try { const p = b.play(); if (p && p.catch) p.catch(e => { if (e && e.name === 'NotAllowedError') bedBlocked = true; }); } catch (e) { /* not loaded yet */ }
  }

  let last = performance.now();
  function pump() {
    const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const want = halted || hidden ? { music: false, crowd: false } : scene();
    const speech = talking();

    // The crowd: eased in over about a second, out a little faster, and down under speech.
    const crowdOn = want.crowd && setting('crowd');
    const crowdTarget = crowdOn ? CROWD_BED * (speech ? DUCK_CROWD : 1) : 0;
    bedVol += (crowdTarget - bedVol) * Math.min(1, dt * (crowdTarget < bedVol ? 5 : 2.5));
    if (crowdOn || bedVol > 0.002) {
      const b = ensureBed();
      b.volume = clamp(bedVol, 0, 1);
      if (b.paused && crowdOn && !bedBlocked) startBed(b);
    } else if (bed && !bed.paused) { bed.pause(); bedVol = 0; }

    // The music: fades in over ~1.2 s, out over ~0.8 s; down under speech and under a sting.
    const musicOn = want.music && setting('music');
    const target = musicOn ? MUSIC_VOL * (speech ? DUCK_MUSIC : 1) * (now < stingUntil ? STING_DUCK : 1) : 0;
    musicLevel += (target - musicLevel) * Math.min(1, dt * (target < musicLevel ? (speech ? 6 : 2.5) : 1.5));
    if (musicOn || musicLevel > 0.002) {
      const m = ensureMusic();
      if (m) {
        if (m.state === 'idle') m.play();
        else if (m.state === 'paused') m.resume();
        m.setVolume(musicLevel);
        m.step(dt);
      }
    } else if (music && music.state !== 'idle') {
      musicLevel = 0;
      // Back to the top next time unless it was only a short break (a pause card at halftime).
      if (want.music === false && !hidden) music.stop(); else music.pause();
    }
  }

  /** Leaving the game: everything stops for good. */
  function stopAll() {
    halted = true;
    try { if (safe()) safe().stopAll(); } catch (e) { /* ignore */ }
    if (bed) bed.pause();
    if (music) music.stop();
  }

  function init() {
    preload();
    setInterval(pump, PUMP_MS);
    const vis = () => {
      hidden = document.hidden;
      if (hidden) { try { if (safe()) safe().stopAll(); } catch (e) { /* ignore */ } if (bed) bed.pause(); if (music) music.pause(); }
    };
    document.addEventListener('visibilitychange', vis);
    // Browsers hold sound until the first press or tap, and not always with an error: Firefox
    // lets a silent element start, then pauses it (or never starts it) once it turns audible,
    // which the music's fade-in from zero does. So on every press or tap, anything that should
    // be playing but is not gets started again, inside that gesture (Bryan found the theme
    // silent on first load in Firefox).
    const wake = () => {
      if (music) { music.blocked = false; if (music.state === 'run' && music.els[music.cur].paused) music.kick(music.els[music.cur]); }
      bedBlocked = false;
      if (bed && bed.paused && bedVol > 0.002) startBed(bed);
    };
    ['keydown', 'pointerdown'].forEach(t => document.addEventListener(t, wake, true));
    SS.save.settings.onChange(k => { if (k === 'sfx' && !setting('sfx')) { try { if (safe()) safe().stopAll(); } catch (e) { /* ignore */ } } });
  }

  return { init, play, menu, tick, crowd, sting, stopAll,
    /** For the browser checks: what is playing, and how loud. */
    __dbg: () => ({ want: scene(), bed: bed ? { playing: !bed.paused, vol: +bed.volume.toFixed(3) } : null,
      music: music ? { state: music.state, vol: +musicLevel.toFixed(3), swaps: music.swaps, t: +music.els[music.cur].currentTime.toFixed(2), playing: !music.els[music.cur].paused, blocked: music.blocked } : null, stingUntil }),
    /** For the browser checks: jump the theme to `sec` before its loop point. */
    __nearLoop: sec => { if (music && music.state === 'run') music.els[music.cur].currentTime = Math.max(0, music.sec - sec); } };
})();
