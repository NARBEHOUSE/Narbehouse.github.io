(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const SAVE = 'bennys-stadium-match-v1', SEASON_SAVE = 'bennys-stadium-season-match-v1', PREFS = 'bennys-stadium-settings-v1';
  const AIM_SPEEDS = [0.14, 0.24, 0.36, 0.55];
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const defaults = { mode: 'basic', difficulty: 'rookie', pace: 0.45, aimSpeed: 0.24, sound: true, crowd: true, reducedMotion: motionQuery.matches, runControl: 'hold', teamId: 'blue', largeText: false, charge: true, kickGuide: true, kickoffs: true };
  function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } }
  function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { toast('Storage unavailable. This session is still playable.'); } }
  const savedPrefs = read(PREFS) || {};
  const prefs = { ...defaults };
  for (const key of ['sound', 'crowd', 'reducedMotion', 'largeText', 'charge', 'kickGuide', 'kickoffs']) if (typeof savedPrefs[key] === 'boolean') prefs[key] = savedPrefs[key];
  if (['rookie', 'pro'].includes(savedPrefs.difficulty)) prefs.difficulty = savedPrefs.difficulty;
  if ([0.45, 0.7, 1].includes(savedPrefs.pace)) prefs.pace = savedPrefs.pace;
  if (['hold', 'scan'].includes(savedPrefs.runControl)) prefs.runControl = savedPrefs.runControl;
  if (AIM_SPEEDS.includes(savedPrefs.aimSpeed)) prefs.aimSpeed = savedPrefs.aimSpeed;
  if (window.FootballSeason?.TEAMS.some(t => t.id === savedPrefs.teamId)) prefs.teamId = savedPrefs.teamId;
  if (['basic', 'advanced'].includes(savedPrefs.mode)) prefs.mode = savedPrefs.mode;
  // Basic keeps only the essentials. These settings play at fixed values there, and the
  // player's own Advanced choices stay saved underneath. Gameplay reads effective(), never prefs.
  const BASIC = { difficulty: 'rookie', pace: 0.45, runControl: 'hold', crowd: true, aimSpeed: 0.24, kickGuide: true, kickoffs: true };
  const basic = () => prefs.mode !== 'advanced';
  const effective = () => basic() ? { ...prefs, ...BASIC, reducedMotion: motionQuery.matches } : prefs;
  let sim, renderer, screen = 'main', returnScreen = 'main', items = [], focusIndex = 0, phaseSeen = '', epoch = 0;
  let scanClock = 0, lastTime = performance.now(), armed = -1, pointerSteer = 0, burstSteer = 0, burstTime = 0;
  let toastTimer, activeGame = false, menuHeading = '', inputLocks = new Set(), resultHeld = false;
  let aimDirection = 1, lastAimRegion = '', lastAimSpeech = 0, pointerAim = false;
  let season, seasonMatchId = null, gameMode = 'exhibition', seasonOutcome = null, homeTeam, awayTeam;
  let lastResult = null, cueKey = '', lastSwitchSpeech = 0, openSpoken = 0, charge = null, guideOn = null;
  // Basic's automatic coin toss holds the field until it has been heard; a kick with no charge goes by itself.
  let tossHold = null, tossing = false, autoKickAt = 0;
  // A Basic punt and every kickoff go straight down the field, with no aim to sweep.
  const straightKick = () => sim?.s.phase === 'kickaim' && (!!sim.s.kickoff || basic() && sim.s.playId === 'punt');
  // The charge is drawn as the throw's own line: it races out, slows right down when
  // it reaches the receiver (or the uprights), then runs on past him for an overthrow.
  const ZONE = FootballSim.CHARGE_ZONE, CHARGE_MAX = FootballSim.CHARGE_MAX;
  function chargeFillTime(c) {
    const s = sim.s;
    return c.kind === 'kick' ? .8 + (100 - s.lineOfScrimmage + 17) * .012 : .9 + Math.max(0, s.targetInfo?.[c.target]?.yards || 0) * .02;
  }
  function startCharge() {
    const s = sim.s, kind = s.phase === 'aim' ? 'throw' : s.phase === 'kickaim' ? 'kick' : null, item = items[focusIndex];
    if (!kind || charge || kind === 'throw' && (!item || item.target === undefined)) return false;
    charge = { kind, target: kind === 'throw' ? item.target : null, power: .15 };
    if (kind === 'throw') sim.selectTarget(charge.target);
    audio?.play('charge');
    return true;
  }
  function stepCharge(dt) {
    if (!charge) return;
    // While you charge a throw to him, the read you heard on him stays put.
    if (charge.kind === 'throw') sim.keepRead(charge.target);
    const before = charge.power;
    // Fast to the target, about four seconds across it (three for a kick), then quickly past it.
    const rate = before < ZONE[0] ? (ZONE[0] - .15) / chargeFillTime(charge) : before <= ZONE[1] ? (ZONE[1] - ZONE[0]) / (charge.kind === 'kick' ? 3 : 4) : .35;
    charge.power = Math.min(CHARGE_MAX, before + dt * rate);
    if (before < ZONE[0] && charge.power >= ZONE[0]) audio?.play('ready');
    if (before <= ZONE[1] && charge.power > ZONE[1] && charge.kind === 'throw') audio?.play('over');
    if (charge.power >= CHARGE_MAX) releaseCharge();
  }
  function cancelCharge() { charge = null; }
  function releaseCharge() {
    if (!charge) return;
    const { kind, target, power } = charge; cancelCharge();
    if (kind === 'throw' && sim.s.phase === 'aim') {
      sim.selectTarget(target);
      const feel = power < ZONE[0] ? ' Too short.' : power > ZONE[1] ? ' Too hard.' : '';
      speaking('Throwing to number ' + sim.s.players.find(p => p.id === sim.s.targets[target]).number + ', ' + coverageWord(sim.s.targetInfo?.[target]) + '.' + feel);
      sim.throwPass(power);
    } else if (kind === 'kick' && sim.s.phase === 'kickaim') sim.kick(power);
    phaseSeen = ''; renderPhase();
  }
  const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Colour an outcome from the player's side: scores gold, good news green, trouble red.
  function resultTone(s) {
    const title = s?.result?.title || '', ours = s?.possession === 'home';
    if (/touchdown|conversion!|extra point good|field goal/i.test(title)) return ours ? 'score' : 'alert';
    // An onside kick recovered is good news for the kicking side, which is not yet the one with the ball.
    if (/onside kick recovered/i.test(title)) return ours ? 'alert' : 'good';
    if (/intercept|turnover|safety|sack|stopped|denied|missed|wide|short|blocked|knocked down/i.test(title)) return ours ? 'alert' : 'good';
    if (/first down/i.test(title)) return ours ? 'good' : 'alert';
    return 'neutral';
  }
  const presses = new Map();
  const scan = window.NarbeScanManager;
  const voice = window.NarbeVoiceManager;
  const audio = window.FootballAudio;
  const auto = () => !!scan?.getSettings().autoScan;
  const interval = () => scan?.getScanInterval() || 2000;
  const livePhase = () => ['run', 'defend'].includes(sim?.s.phase);
  // Speech lets every scene breathe. Scanning and choices speak at once and clear
  // anything waiting; announcements queue behind the line being spoken; and a
  // scene change after an outcome waits until the speech has finished.
  let speechGuard = 0, speechQueue = [], holdStarted = 0, breathUntil = 0, hinted = {};
  const synth = () => window.speechSynthesis;
  const ttsOn = () => voice?.getSettings().ttsEnabled !== false && !!synth();
  const sentences = (...parts) => parts.filter(Boolean).map(p => String(p).trim()).map(p => p.charAt(0).toUpperCase() + p.slice(1)).map(p => /[.!?]$/.test(p) ? p : p + '.').join(' ');
  const speechBusy = (now = performance.now()) => ttsOn() && (now < speechGuard || !!synth().speaking || !!synth().pending);
  function say(text) { $('live').textContent = text; voice?.speak(String(text).replace(/#\s?(\d)/g, 'number $1')); speechGuard = performance.now() + 350; }
  const speaking = (text, polite, phase) => {
    if (!text) return;
    if (polite && (speechBusy() || speechQueue.length)) { speechQueue.push({ text, at: performance.now(), phase }); speechQueue = speechQueue.slice(-3); return; }
    speechQueue = []; say(text);
  };
  function flushSpeech(now) {
    speechQueue = speechQueue.filter(line => now - line.at < 6000 && (!line.phase || line.phase === sim?.s.phase));
    if (speechQueue.length && !speechBusy(now)) say(speechQueue.shift().text);
  }
  // True once an outcome's speech is done and has had a short breath; never waits forever.
  function sceneReady(now) {
    if (!holdStarted) holdStarted = now;
    if (now - holdStarted > 9000) return true;
    if (speechBusy(now) || speechQueue.length) { breathUntil = now + 600; return false; }
    return now >= breathUntil;
  }
  function toast(text, tone = '') { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').className = 'on' + (tone ? ' tone-' + tone : ''); toastTimer = setTimeout(() => $('toast').classList.remove('on'), 2600); }
  function preferencesChanged() { store(PREFS, prefs); const fx = effective(); audio?.setEnabled(prefs.sound); audio?.setCrowd(fx.crowd); document.body.classList.toggle('reduced-motion', fx.reducedMotion); document.body.classList.toggle('large-text', prefs.largeText); if (sim) applyOptions(); }
  function applyOptions() { const fx = effective(); sim.options.pace = fx.pace; sim.options.difficulty = fx.difficulty; sim.options.kickoffs = fx.kickoffs; }
  function saveMatch() { if (!activeGame || sim.options.practice || sim.s.phase === 'final') return; const data = sim.snapshot(); if (data) store(gameMode === 'season' ? SEASON_SAVE : SAVE, { version: 2, sim: data, mode: gameMode, seasonMatchId, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id }); }
  function syncAudio() { if (!['main', 'game'].includes(screen) || document.hidden) audio?.pause(); else audio?.resume(); }
  function clearHeld() { cancelCharge(); tossHold = null; presses.clear(); inputLocks.clear(); pointerSteer = 0; pointerAim = false; }
  function changeContext() { cancelCharge(); autoKickAt = 0; epoch++; for (const key of presses.keys()) inputLocks.add(key); presses.clear(); scanClock = 0; pointerSteer = 0; pointerAim = false; burstTime = 0; $('pause-button').classList.remove('focused'); }
  function updateHint() {
    if (screen === 'game' && (sim?.s.phase === 'tackle' || sim?.s.phase === 'result' && (sim.s.resultRevealRemaining > 0 || resultHeld))) { $('controls-hint').innerHTML = '<span>Watch the play finish</span>'; return; }
    if (screen === 'game' && tossHold) { $('controls-hint').innerHTML = '<span>Coin toss</span>'; return; }
    if (screen === 'game' && straightKick()) {
      const k = sim.s.kickoff;
      $('controls-hint').innerHTML = (!prefs.charge ? '<span>The kick goes by itself</span>' : k?.kind === 'onside' ? '<span><kbd>ENTER</kbd> Kick</span>' : '<span><kbd>ENTER</kbd> Hold · let go when ' + (k ? 'the line reaches the goal line' : 'the tone plays') + '</span>') + '<b id="access-mode">' + (auto() ? 'ONE SWITCH' : 'TWO SWITCHES') + '</b>'; return;
    }
    if (screen === 'game' && sim?.s.phase === 'kickaim') {
      $('controls-hint').innerHTML = (auto() ? '<span>Aim sweeps automatically</span>' : '<span><kbd>SPACE</kbd> Hold to aim · release to stop · press again to reverse</span>') + (prefs.charge ? '<span><kbd>ENTER</kbd> Hold · let go when the line reaches the uprights</span>' : '<span><kbd>ENTER</kbd> Kick</span>') + '<b id="access-mode">' + (auto() ? 'ONE SWITCH' : 'TWO SWITCHES') + '</b>'; return;
    }
    if (screen === 'game' && sim?.s.phase === 'aim' && prefs.charge) {
      $('controls-hint').innerHTML = '<span><kbd>SPACE</kbd> Next receiver</span><span><kbd>ENTER</kbd> Hold · let go when the line reaches him</span><b id="access-mode">' + (auto() ? 'ONE SWITCH' : 'TWO SWITCHES') + '</b>'; return;
    }
    const running = screen === 'game' && livePhase() && effective().runControl === 'hold';
    $('controls-hint').innerHTML = running
      ? (auto() ? '<span><kbd>ENTER</kbd> Hold to steer · release to swap direction</span>' : '<span><kbd>SPACE</kbd> Steer left</span><span><kbd>ENTER</kbd> Steer right</span>') + '<b id="access-mode">' + (auto() ? 'ONE SWITCH' : 'TWO SWITCHES') + '</b>'
      : '<span><kbd>SPACE</kbd> Next · hold to scan back</span><span><kbd>ENTER</kbd> Choose</span><b id="access-mode">' + (auto() ? 'AUTO SCAN · ONE SWITCH' : 'TWO SWITCHES') + '</b>';
  }
  function routeIcon(id) {
    // Drawn as the field looks from behind your quarterback: the flood goes left, the sweep right.
    const paths = { slants: 'M8 34 V25 L42 8 M25 34 V22 L51 8', flood: 'M48 34 V17 H12 M30 34 V8 H7', verticals: 'M10 34 V5 M28 34 V5 M46 34 V5', sweep: 'M12 34 V23 Q12 14 27 14 H48', inside: 'M28 35 V6', fieldgoal: 'M28 35 V8 M10 6 V17 H46 V6', punt: 'M8 34 Q28 -12 48 12',
      extrapoint: 'M28 35 V8 M10 6 V17 H46 V6', heads: 'M14 20 A14 14 0 1 0 42 20 A14 14 0 1 0 14 20 M23 13 V27 M33 13 V27 M23 20 H33', tails: 'M14 20 A14 14 0 1 0 42 20 A14 14 0 1 0 14 20 M22 13 H34 M28 13 V28', receive: 'M28 4 V30 M18 21 L28 31 L38 21', defer: 'M14 20 A14 14 0 1 0 42 20 A14 14 0 1 0 14 20 M28 12 V20 H35', kickfirst: 'M10 34 Q28 -6 48 28', kickdeep: 'M10 34 Q30 -8 50 26', onside: 'M8 34 Q14 25 20 34 Q26 28 32 34', gofortwo: 'M18 13 Q20 5 29 5 Q38 5 38 13 Q38 20 18 34 H40', contain: 'M6 30 L14 10 M50 30 L42 10 M14 20 H42', blitz: 'M10 34 L28 10 M46 34 L28 10 M28 34 V10', zone: 'M6 32 Q28 2 50 32 M16 32 H40', man: 'M14 34 V10 M22 34 V10 M34 34 V10 M42 34 V10',
      puntreturn: 'M28 4 V14 M28 35 L20 26 L34 20 L28 14', puntblock: 'M8 34 L24 12 M48 34 L32 12 M20 8 H36',
      fgblock: 'M10 6 V17 H46 V6 M28 17 V6 M16 36 L25 25 M40 36 L31 25', fgreturn: 'M10 6 V17 H46 V6 M28 17 V6 M28 36 L22 30 L32 26' };
    return '<svg class="route-icon" viewBox="0 0 56 40" aria-hidden="true"><path d="' + (paths[id] || 'M10 34 V22 L43 8 M29 34 V8') + '"/>' + (['gofortwo', 'heads', 'tails', 'defer', 'receive'].includes(id) ? '' : '<circle cx="10" cy="34" r="3"/>') + '</svg>';
  }
  // An initial of -1 opens the list with nothing highlighted; the first Space highlights the first item.
  function makeItems(list, container, initial = 0) {
    items = list; focusIndex = initial < 0 ? -1 : Math.min(initial, list.length - 1); container.replaceChildren(); container.classList.remove('team-grid');
    list.forEach((item, i) => {
      const button = document.createElement('button'); button.className = 'menu-button'; button.type = 'button';
      button.innerHTML = (item.play ? routeIcon(item.play) : '<span class="number">' + String(i + 1).padStart(2, '0') + '</span>') + '<span class="button-copy">' + (item.tag ? '<span class="tag"></span>' : '') + '<span class="name"></span><span class="desc"></span></span><span class="value"></span>';
      if (item.tag) button.querySelector('.tag').textContent = item.tag;
      if (item.kind) button.dataset.kind = item.kind;
      button.querySelector('.name').textContent = item.name;
      button.querySelector('.desc').textContent = item.desc || '';
      button.querySelector('.value').textContent = item.value || '';
      button.setAttribute('aria-label', item.spokenName || [item.name, item.value, item.desc].filter(Boolean).join('. '));
      button.addEventListener('click', () => { if (item.target !== undefined && prefs.charge && sim?.s.phase === 'aim') return; audio?.unlock(); focusIndex = i; activate(); });
      button.addEventListener('focus', () => { if (focusIndex !== i) setFocus(i, false); });
      container.append(button); item.element = button;
    });
    if (focusIndex >= 0) setFocus(focusIndex, false); scanClock = 0;
  }
  function setFocus(index, announce = true) {
    if (!items.length) return;
    focusIndex = (index + items.length) % items.length;
    items.forEach((item, i) => { item.element.classList.toggle('focused', i === focusIndex); item.element.tabIndex = i === focusIndex ? 0 : -1; item.element.setAttribute('aria-current', i === focusIndex ? 'true' : 'false'); });
    const item = items[focusIndex];
    item.element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    if (screen === 'teams' && item.team) { if (item.teamSlot === 'away') awayTeam = item.team; else homeTeam = item.team; }
    if (screen === 'game' && sim.s.phase === 'playcall') sim.s.previewPlayId = item.play || null;
    if (screen === 'game' && sim.s.phase === 'aim' && item.target !== undefined) { sim.selectTarget(item.target); item.heard = sim.s.targetInfo?.[item.target]?.openness; }
    if (screen === 'game' && sim.s.phase === 'kickaim' && item.target !== undefined) sim.chooseKick(item.target);
    if (announce) { speaking(item.say ? item.say() : item.spokenName || [item.name, item.value, item.desc].filter(Boolean).join('. ')); audio?.play('hover'); }
  }
  // From nothing highlighted (-1), forward lands on the first item and backward on the last.
  function advance(direction) { setFocus(focusIndex < 0 ? (direction > 0 ? 0 : items.length - 1) : focusIndex + direction); scanClock = 0; }
  function activate() {
    const item = items[focusIndex]; if (!item) return;
    audio?.play('select'); speaking(item.confirm ? item.confirm() : item.spokenName || item.name + (item.value ? '. ' + item.value : '')); item.action();
  }
  function overlay(kind, title, description, list, options = {}) {
    screen = kind; changeContext(); $('overlay').hidden = false; $('overlay').className = options.style ?? 'centered';
    $('menu-eyebrow').textContent = options.eyebrow || 'ROBOTFOOTBALL / MECH LEAGUE';
    $('menu-title').textContent = title; $('menu-description').textContent = description;
    $('menu-content').innerHTML = options.content || ''; $('menu-note').textContent = options.note || '';
    $('hero-copy').hidden = !['main', 'teams'].includes(kind); $('action-panel').hidden = true; $('steer-panel').hidden = true; $('kick-readout').hidden = true; $('kick-controls').hidden = true; $('ready-cue').hidden = true; $('target-labels').replaceChildren();
    $('pause-button').hidden = !activeGame || kind !== 'game'; $('scoreboard').hidden = !activeGame; $('situation').hidden = !activeGame;
    // Every menu opens with nothing highlighted, the playbook included: a stray Enter picks nothing.
    menuHeading = title; makeItems(list, $('menu-items'), options.focus ?? -1); updateHint(); syncAudio();
    speaking(sentences(title, options.speech || description, list[focusIndex]?.intro || list[focusIndex]?.name), options.polite);
  }
  function mainMenu() {
    activeGame = false; phaseSeen = ''; clearHeld();
    const list = [];
    if (season.data) list.push({ name: season.isActive() ? 'Continue season' : 'Season results', desc: season.getTeam(season.data.teamId).name + ' · ' + season.data.wins + '–' + season.data.losses + (season.data.ties ? '–' + season.data.ties : ''), action: seasonDashboard });
    list.push({ name: 'New season', desc: 'Pick your team. Chase the championship.', action: newSeason });
    if (read(SAVE)) list.push({ name: 'Continue exhibition', desc: 'Return to your saved game', action: () => resumeSaved(SAVE) });
    list.push({ name: 'Exhibition', desc: 'Choose both teams. Play a quick game.', action: () => chooseTeam('exhibition') });
    list.push({ name: 'Practice field', desc: 'No-fail football. Find your rhythm.', action: () => newGame(true) });
    list.push({ name: 'How to play', action: () => help('main') });
    list.push({ name: 'Settings', value: (basic() ? 'Basic' : 'Advanced') + ' · ' + (auto() ? 'One switch' : 'Two switches'), action: () => settings('main') });
    list.push({ name: 'Exit game', action: exitGame });
    overlay('main', 'Robot Football', 'Boot up your robot squad. Call the play, make the catch, and power through the defense.', list, { style: '', eyebrow: 'RF-OS 2 / MECH LEAGUE ONLINE', note: 'Robot teams · One or two switches · Your pace' });
    $('menu-title').innerHTML = 'ROBOT<br><em>FOOTBALL</em>';
    unitStatus();
  }
  function unitStatus() {
    const team = homeTeam || FootballSeason.getTeam(prefs.teamId);
    $('unit-status').innerHTML = '<span><i class="team-dot" style="--team-color:' + team.color + '"></i>UNIT</span><b>' + escape(team.name) + '</b><span>POWER CORE</span><b>100%</b><span>SERVO ARRAY</span><b>ONLINE</b><span>SWITCH LINK</span><b>' + (auto() ? 'ONE SWITCH' : 'TWO SWITCHES') + '</b>';
  }
  function newSeason() {
    if (season.data) { overlay('confirm', 'START A NEW SEASON?', 'This replaces your current season and its saved game.', [
      { name: 'Keep my season', action: seasonDashboard }, { name: 'Choose a new team', action: () => chooseTeam('season') }
    ]); return; }
    chooseTeam('season');
  }
  function chooseTeam(mode, opponent = false) {
    activeGame = false;
    const teams = FootballSeason.TEAMS.filter(t => !opponent || t.id !== homeTeam.id);
    const list = teams.map(t => ({ name: t.name, desc: t.colorName + (opponent ? ' · Opponent' : ' · Your team'), team: t, teamSlot: opponent ? 'away' : 'home',
      action: () => {
        if (opponent) { awayTeam = t; if (read(SAVE)) overlay('confirm', 'NEW EXHIBITION?', 'This replaces your saved exhibition game. Your season is kept.', [{ name: 'Keep saved game', action: mainMenu }, { name: 'Kick off', action: () => startGame(false, { homeTeamId: homeTeam.id, awayTeamId: t.id }) }]); else startGame(false, { homeTeamId: homeTeam.id, awayTeamId: t.id }); }
        else { prefs.teamId = t.id; homeTeam = t; preferencesChanged(); if (mode === 'season') { season.start(t.id); try { localStorage.removeItem(SEASON_SAVE); } catch (_) {} seasonDashboard(); } else chooseTeam(mode, true); }
      }
    }));
    list.push({ name: 'Back', action: opponent ? () => chooseTeam(mode) : mainMenu });
    overlay('teams', opponent ? 'PICK YOUR RIVAL.' : 'PICK YOUR TEAM.', opponent ? 'Choose the robots that line up across from you.' : 'Ten robot squads. Pick your colors.', list, { style: 'teams', eyebrow: mode === 'season' ? 'SEASON / TEAM SELECTION' : 'EXHIBITION / MATCHUP' });
    $('menu-items').classList.add('team-grid');
    list.forEach(item => { if (item.team) item.element.style.setProperty('--team-color', item.team.color); });
    $('hero-copy').hidden = true;
  }
  function seasonDashboard() {
    if (!season.data) return newSeason();
    activeGame = false; const d = season.data; homeTeam = season.getTeam(d.teamId); awayTeam = season.currentOpponent() || FootballSeason.TEAMS.find(t => t.id !== homeTeam.id);
    const checkpoint = read(SEASON_SAVE), canResume = checkpoint?.seasonMatchId === d.matchId;
    const list = [];
    if (season.isActive()) list.push({ name: canResume ? 'Resume game' : 'Play next game', desc: season.currentMatchupLabel() + ' · ' + awayTeam.name, action: () => canResume ? resumeSaved(SEASON_SAVE) : startGame(false, { mode: 'season', seasonMatchId: d.matchId, homeTeamId: d.teamId, awayTeamId: d.opponentId }) });
    list.push({ name: 'Schedule & results', action: seasonSchedule });
    list.push({ name: 'Start a new season', action: newSeason });
    list.push({ name: 'Main menu', action: mainMenu });
    overlay('season', season.currentMatchupLabel().toUpperCase(), season.isSeasonOver() ? d.stage === 'champions' ? 'Your team are champions. Every result is saved below.' : 'Your season is complete. Build on it next season.' : 'Win 10 to reach the playoffs. Go 16–0 for a direct shot at the championship.', list, {
      content: '<div class="season-record"><div><b>' + d.wins + '</b><span>WINS</span></div><div><b>' + d.losses + '</b><span>LOSSES</span></div><div><b>' + d.ties + '</b><span>TIES</span></div><div><b>' + d.gamesPlayed + '/16</b><span>REGULAR SEASON</span></div></div><div class="season-matchup"><div class="team-chip" style="--team-color:' + homeTeam.color + '">' + homeTeam.name + '</div><small>VS</small><div class="team-chip" style="--team-color:' + awayTeam.color + '">' + awayTeam.name + '</div></div>', eyebrow: homeTeam.name.toUpperCase() + ' / SEASON HQ'
    });
  }
  function seasonSchedule() {
    const d = season.data;
    const rows = d.schedule.map((id, i) => { const result = d.results.filter(r => r.stage === 'regular')[i]; return '<li><span>' + String(i + 1).padStart(2, '0') + ' · ' + season.getTeam(id).name + '</span><span class="schedule-score">' + (result ? (result.win ? 'W ' : result.tie ? 'T ' : 'L ') + result.home + '–' + result.away : i === d.gamesPlayed && d.stage === 'regular' ? 'NEXT' : '—') + '</span></li>'; });
    d.results.filter(r => r.stage !== 'regular').forEach(r => rows.push('<li><span>' + (r.stage === 'championship' ? 'Championship' : r.playoffRound === 0 ? 'Wild Card' : 'Conference') + ' · ' + season.getTeam(r.opponentId).name + '</span><span class="schedule-score">' + r.home + '–' + r.away + '</span></li>'));
    overlay('schedule', 'THE SEASON SO FAR', season.getTeam(d.teamId).name, [{ name: 'Read schedule aloud', action: () => speaking(d.schedule.map((id, i) => 'Game ' + (i + 1) + ', ' + season.getTeam(id).name + '.').join(' ')) }, { name: 'Back to season', action: seasonDashboard }], { content: '<ul class="schedule-list">' + rows.join('') + '</ul>' });
  }
  function newGame(practice) {
    if (read(SAVE) && !practice) {
      overlay('confirm', 'NEW KICKOFF?', 'A saved game is available. Starting a new game replaces it.', [
        { name: 'Keep my saved game', action: mainMenu },
        { name: 'Start a new game', action: () => startGame(practice) }
      ]); return;
    }
    startGame(practice);
  }
  function startGame(practice, config = {}) { gameMode = config.mode || 'exhibition'; seasonMatchId = config.seasonMatchId || null; seasonOutcome = null; homeTeam = FootballSeason.getTeam(config.homeTeamId || prefs.teamId); awayTeam = FootballSeason.getTeam(config.awayTeamId) || FootballSeason.TEAMS.find(t => t.id !== homeTeam.id); const fx = effective(); sim.reset({ difficulty: fx.difficulty, pace: fx.pace, practice, format: gameMode === 'season' ? 'regulation' : 'drives', kickoffs: fx.kickoffs }); sim.setTeamNames(homeTeam.unitName, awayTeam.unitName); armed = -1; activeGame = true; phaseSeen = ''; lastResult = null; hinted = {}; screen = 'game'; clearHeld(); saveMatch(); renderPhase(); }
  function restartCurrent() { startGame(sim.options.practice, { mode: gameMode, seasonMatchId, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id }); }
  function resumeSaved(key = SAVE) {
    try { const saved = read(key); if (sim.restore(saved?.sim || saved) === false) throw Error('Invalid save'); gameMode = saved.mode === 'season' ? 'season' : 'exhibition'; seasonMatchId = saved.seasonMatchId || null; seasonOutcome = null; if (gameMode === 'season' && seasonMatchId !== season.data?.matchId) throw Error('Old season game'); homeTeam = FootballSeason.getTeam(saved.homeTeamId || prefs.teamId) || FootballSeason.getTeam(prefs.teamId); awayTeam = FootballSeason.getTeam(saved.awayTeamId) || FootballSeason.TEAMS.find(t => t.id !== homeTeam.id); sim.setTeamNames(homeTeam.unitName, awayTeam.unitName); applyOptions(); activeGame = true; screen = 'game'; phaseSeen = ''; lastResult = null; clearHeld(); renderPhase(); }
    catch (_) { toast('This save could not be loaded. Start a new game.'); try { localStorage.removeItem(key); } catch (_) {} mainMenu(); }
  }
  function pause() {
    if (!activeGame || screen === 'pause' || sim.s.phase === 'final') return; clearHeld();
    const row = {
      continue: { name: 'Continue', action: resume }, help: { name: 'Help', desc: 'Say “I need help”', action: () => speaking('I need help') },
      status: { name: 'Game status', desc: 'Hear the score, down and last play', action: () => speaking(sentences(situation(sim.s), lastResult && 'Last play: ' + lastResult.title, lastResult?.detail)) },
      restart: { name: 'Restart game', action: () => overlay('confirm', 'RESTART GAME?', 'The current game will start again from kickoff.', [{ name: 'Keep playing', action: pauseMenu }, { name: 'Restart', action: restartCurrent }]) },
      settings: { name: 'Settings', action: () => settings('pause') }, howTo: { name: 'How to play', action: () => help('pause') }, menu: { name: 'Main menu', action: () => { saveMatch(); mainMenu(); } }, exit: { name: 'Exit game', action: exitGame }
    };
    overlay('pause', 'TIME OUT', 'Take your time. Your game is paused.', (basic() ? ['continue', 'help', 'status', 'settings', 'menu'] : ['continue', 'help', 'status', 'restart', 'settings', 'howTo', 'menu', 'exit']).map(key => row[key]));
  }
  function pauseMenu() { screen = 'game'; pause(); }
  function resume() { screen = 'game'; clearHeld(); phaseSeen = ''; renderPhase(); syncAudio(); }
  function exitGame() { saveMatch(); audio?.pause(); clearHeld(); scan?.resetInputState?.(); window.parent.postMessage({ action: 'focusBackButton' }, '*'); if (window.parent === window) location.href = '../../../index.html'; }
  // Basic lists only the essentials, in the same order as Benny's Football; Advanced lists every option.
  // Rows that wrap the hub's shared voice and scanning stay in both: a game opened outside the hub has no other way to reach them.
  function settings(from = returnScreen, focusName = '') {
    returnScreen = from;
    const again = name => settings(from, name), refresh = name => { preferencesChanged(); again(name); };
    const tts = voice?.getSettings().ttsEnabled !== false;
    const voiceName = voice?.getVoiceDisplayName?.(voice?.getCurrentVoice?.()) || 'System voice';
    const row = {
      tts: { name: 'Text to speech', value: tts ? 'On' : 'Off', action: () => { voice?.toggleTTS(); again('Text to speech'); } },
      voice: { name: 'Voice', value: voiceName, action: () => { voice?.cycleVoice(); again('Voice'); } },
      difficulty: { name: 'Difficulty', value: prefs.difficulty === 'rookie' ? 'Rookie' : 'Pro', desc: 'Defender pressure and pass coverage', action: () => { prefs.difficulty = prefs.difficulty === 'rookie' ? 'pro' : 'rookie'; refresh('Difficulty'); } },
      pace: { name: 'Game speed', value: prefs.pace === 0.45 ? 'Relaxed' : prefs.pace === 0.7 ? 'Steady' : 'Full speed', action: () => { prefs.pace = [0.45, 0.7, 1][([0.45, 0.7, 1].indexOf(prefs.pace) + 1) % 3]; refresh('Game speed'); } },
      runControl: { name: 'Run controls', value: prefs.runControl === 'hold' ? 'Hold to steer' : 'Choose direction', desc: 'Choose direction pauses between movement choices', action: () => { prefs.runControl = prefs.runControl === 'hold' ? 'scan' : 'hold'; refresh('Run controls'); } },
      motion: { name: 'Camera motion', value: prefs.reducedMotion ? 'Reduced' : 'Cinematic', action: () => { prefs.reducedMotion = !prefs.reducedMotion; refresh('Camera motion'); } },
      autoScan: { name: 'Auto scan', value: auto() ? 'On — One switch' : 'Off — Two switches', action: () => { scan?.toggleAutoScan(); again('Auto scan'); } },
      scanSpeed: { name: 'Scan speed', value: interval() / 1000 + ' seconds', action: () => { scan?.cycleScanSpeed(); again('Scan speed'); } },
      sound: { name: 'Sound effects', value: prefs.sound ? 'On' : 'Off', action: () => { prefs.sound = !prefs.sound; refresh('Sound effects'); } },
      crowd: { name: 'Stadium crowd', value: prefs.crowd ? 'On' : 'Off', action: () => { prefs.crowd = !prefs.crowd; refresh('Stadium crowd'); } },
      aimSpeed: { name: 'Kick aim speed', value: ({ 0.14: 'Slow', 0.24: 'Standard', 0.36: 'Quick', 0.55: 'Fast' })[prefs.aimSpeed], action: () => { prefs.aimSpeed = AIM_SPEEDS[(AIM_SPEEDS.indexOf(prefs.aimSpeed) + 1) % AIM_SPEEDS.length]; refresh('Kick aim speed'); } },
      largeText: { name: 'Large text', value: prefs.largeText ? 'On' : 'Off', desc: 'Bigger menus, scoreboard and field labels', action: () => { prefs.largeText = !prefs.largeText; refresh('Large text'); } },
      // Easy throw is the charge setting seen from the other side, as in Benny's Football.
      easyThrow: { name: 'Easy throw', value: prefs.charge ? 'Off' : 'On', desc: prefs.charge ? 'Hold Enter to charge throws and kicks' : 'No charging. Pick a receiver and it throws', action: () => { prefs.charge = !prefs.charge; refresh('Easy throw'); } },
      charge: { name: 'Charge throws and kicks', value: prefs.charge ? 'On' : 'Off', desc: 'Hold Enter and the line grows toward the target; let go when it reaches him and the tone plays', action: () => { prefs.charge = !prefs.charge; refresh('Charge throws and kicks'); } },
      kickGuide: { name: 'Kick guide', value: prefs.kickGuide ? 'On' : 'Off', desc: 'The uprights light up with a soft tone when the aim is on target', action: () => { prefs.kickGuide = !prefs.kickGuide; refresh('Kick guide'); } },
      kickoffs: { name: 'Kickoffs and coin toss', value: prefs.kickoffs ? 'On' : 'Off', desc: 'A coin toss, kickoffs after every score, and returns. Off: every drive starts at the 25', action: () => { prefs.kickoffs = !prefs.kickoffs; refresh('Kickoffs and coin toss'); } },
      // Changing mode applies at once, mid-game too, and keeps focus on this row.
      mode: { name: 'Game mode', value: basic() ? 'Basic' : 'Advanced', desc: basic() ? 'The essentials. Advanced has every option' : 'Every option. Basic keeps only the essentials', action: () => { prefs.mode = basic() ? 'advanced' : 'basic'; refresh('Game mode'); } },
      reset: { name: 'Reset saved progress', action: () => overlay('confirm', 'RESET PROGRESS?', 'This removes your season, saved exhibition and current session. Your accessibility settings stay as they are.', [{ name: 'Keep progress', action: () => again() },{ name: 'Delete saved progress', action: () => { try { localStorage.removeItem(SAVE); localStorage.removeItem(SEASON_SAVE); } catch (_) {} season.reset(); activeGame = false; mainMenu(); toast('Saved progress removed.'); } }]) },
      back: { name: 'Back', action: () => from === 'pause' ? pauseMenu() : mainMenu() }
    };
    const list = (basic() ? ['sound', 'tts', 'voice', 'autoScan', 'scanSpeed', 'easyThrow', 'largeText', 'mode', 'reset', 'back']
      : ['tts', 'voice', 'difficulty', 'pace', 'runControl', 'motion', 'autoScan', 'scanSpeed', 'sound', 'crowd', 'aimSpeed', 'largeText', 'charge', 'kickGuide', 'kickoffs', 'mode', 'reset', 'back']).map(key => row[key]);
    // Arriving opens with nothing highlighted; changing a row's value rebuilds the menu with focus kept on that row.
    overlay('settings', 'YOUR SETTINGS', 'Set the pace. Every option works with your switches.', list, { focus: focusName ? Math.max(0, list.findIndex(item => item.name === focusName)) : -1 });
  }
  // Basic's help leaves out the coin toss choices and every setting Basic hides.
  function help(from) {
    const inBasic = basic();
    const steps = [
      ['01 / CALL IT', 'Choose a play from above the field. Each play says what it is for: a short, medium or long pass, an inside or outside run, or a kick. Space scans; Enter selects. Players line up before the snap. Hold Space to scan backwards. Auto Scan lets Enter do it all.'],
      ['02 / MAKE THE PLAY', inBasic ? 'Scan the players on the field from behind your quarterback. Hold Enter on one and the line grows toward him; let go when it reaches him and the tone plays. With Easy throw on, just select him. Take as long as you need. For field goals, hold Space to aim, release to stop, and press again to reverse, then kick with Enter. With Auto Scan, the aim sweeps by itself. Punts go straight down the field.'
        : 'Scan the players on the field from behind your quarterback. Select to throw. Take as long as you need. For kicks, hold Space to aim, release to stop, and press again to reverse. Enter kicks. With Auto Scan, the aim sweeps by itself.'],
      ['03 / TAKE IT HOME', 'You get a protected moment before running starts. Hold Space for left, Enter for right. With one switch, hold Enter for the shown direction; release to swap sides. Forward running is automatic.'],
      ['04 / SCORE', 'A touchdown is worth six. Then choose: kick the extra point for one, or go for two with one run or pass from the 2-yard line. Field goals are worth three.'],
      ['KICKOFFS', inBasic ? 'The game tosses the coin for you. Every half starts with a kickoff from the 35, and so does every drive after a score. Your kickoff goes straight down the field: hold Enter and let go when the tone plays, or with Easy throw on, it kicks by itself. Catch one in the end zone and choose: run it out, or take a knee for the 25.'
        : 'A coin toss opens the game: call heads or tails, and the winner chooses to receive or defer. Every half starts with a kickoff from the 35, and so does every drive after a score. On your kickoff, hold Enter and the line grows down the field; let go when the tone plays. Catch one in the end zone and choose: run it out, or take a knee for the 25. Behind in the score? Try an onside kick. Settings can turn kickoffs off.'],
      ['05 / BEAT THE PURSUIT', 'Defenders take angles and dive at your legs. Steer away from them. A tackle from behind is the easiest to break, and a tired robot slows down on a long run.'],
      ['06 / MAKE THE STOP', 'On defense, steer toward the ball carrier; your robot, marked YOU, tackles automatically when he reaches him. While you steer, he stays yours. Let go for two seconds and he plays by himself (AUTO). After three seconds, control moves to the robot nearest the ball. When the visitors punt or kick, choose to block it or set up a return. The view returns overhead after every play.'],
      ['YOUR SEASON', 'Choose your team and play sixteen games. Ten wins earn a playoff spot. A perfect season goes straight to the championship. Exhibition is a shorter, four-possession game. Season games use four quarters.'],
      ['YOUR PACE', inBasic ? 'To pause, choose Pause / settings in the playbook between plays. Practice has no dropped passes, and the visitors cannot score, but its defenders tackle for real: it is where you learn to dodge. Advanced mode in Settings adds more options.'
        : 'To pause, choose Pause / settings in the playbook between plays. Settings has slower speeds and “Choose direction” controls that wait between moves. Practice has no dropped passes, and the visitors cannot score, but its defenders tackle for real, and a throw let go too early or too late still misses.']
    ];
    overlay('help', 'EVERY PLAY IS YOURS', 'One or two switches. Real decisions. Your pace.', [
      { name: 'Read instructions aloud', action: () => speaking(inBasic ? 'Choose plays from above the field. Space scans. Enter selects. Hold Space to scan backwards. Players line up before the snap. Passing zooms behind your quarterback. Scan the players on the field, then hold Enter on one. The line grows toward him. Let go when it reaches him and the tone plays. With Easy throw on, just select him. There is no time limit. For a field goal, hold Space to aim, release to stop, press again to reverse, then kick with Enter. With Auto Scan, the aim sweeps automatically. Punts and kickoffs go straight down the field. After a catch, you get a protected moment before running starts. Hold Space to steer left, or Enter to steer right. In one switch mode, hold Enter to steer in the shown direction, then release to swap direction. On defense, steer toward the runner. Tackles happen automatically when you reach him. While you steer, you keep your robot. Let go for two seconds and he plays by himself. After three seconds, control moves to the robot nearest the ball. When the visitors punt or kick, choose to block it or set up a return. To pause, choose Pause / settings in the playbook between plays. A touchdown is worth six points. Then kick the extra point for one more, or go for two with one play from the 2-yard line. The game tosses the coin for you, and every half and every score starts with a kickoff. If you catch a kick in your end zone, choose to run it out or take a knee. Defenders take angles and dive at the runner, so run away from them to break tackles. Season mode has sixteen games and playoffs. Exhibition has four possessions each. Advanced mode in Settings adds more options.'
        : 'Choose plays from above the field. Space scans. Enter selects. Hold Space to scan backwards. Players line up before the snap. Passing zooms behind your quarterback. Scan the players on the field, then select to throw. There is no time limit. For a kick, hold Space to aim, release to stop, press again to reverse. Enter kicks. With Auto Scan, the aim sweeps automatically. After a catch, you get a protected moment before running starts. Hold Space to steer left, or Enter to steer right. In one switch mode, hold Enter to steer in the shown direction, then release to swap direction. On defense, steer toward the runner. Tackles happen automatically when you reach him. While you steer, you keep your robot. Let go for two seconds and he plays by himself. After three seconds, control moves to the robot nearest the ball. When the visitors punt or kick, choose to block it or set up a return. To pause, choose Pause / settings in the playbook between plays. In Settings, choose direction controls to run without holding a switch. A touchdown is worth six points. Then kick the extra point for one more, or go for two with one play from the 2-yard line. A coin toss opens the game, and every half and every score starts with a kickoff. On your kickoff, hold Enter and let go when the tone plays. If you catch a kick in your end zone, choose to run it out or take a knee. Defenders take angles and dive at the runner, so run away from them to break tackles. Season mode has sixteen games and playoffs. Exhibition has four possessions each.') },
      { name: 'Back', action: () => from === 'pause' ? pauseMenu() : mainMenu() }
    ], { content: steps.map(([title, text]) => '<div class="help-step"><b>' + title + '</b><p>' + text + '</p></div>').join('') });
  }
  // Basic tosses the coin for you. The result holds the field until it has been heard, then the kickoff follows.
  function autoToss() {
    tossing = true; let toss; try { toss = sim.autoToss(); } finally { tossing = false; }
    if (!toss) return playcall();
    tossHold = { ...toss, until: performance.now() + 2600 }; holdStarted = 0; phaseSeen = sim.s.phase;
    items = []; $('overlay').hidden = true; $('action-panel').hidden = true; $('steer-panel').hidden = true;
    speaking(toss.text); updateHint(); syncAudio();
  }
  function playcall() {
    const s = sim.s, defending = s.possession === 'away', choosing = s.conversion === 'choose', two = s.conversion === 'two';
    // Each play leads with what it is for (Short pass, Inside run...); its playbook name sits above.
    const kickYards = 100 - s.fieldPosition + 17, theirKickYards = Math.round(s.fieldPosition + 17);
    const list = sim.playbook().map(p => {
      const label = p.label || p.name, yards = p.id === 'fieldgoal' ? kickYards : p.kick === 'fieldgoal' ? theirKickYards : 0, speech = sentences(label, yards ? yards + ' yards' : p.value, p.description);
      return { name: label, tag: label !== p.name ? p.name : '', kind: p.type, value: p.value || (yards ? yards + ' YD' : ''), desc: p.description, play: p.id,
        spokenName: speech, intro: speech, confirm: () => label + '.', action: () => { saveMatch(); armed = -1; sim.callPlay(p.id); phaseSeen = ''; renderPhase(); } };
    });
    list.push({ name: 'Pause / settings', action: pause });
    const halves = sim.options.format === 'regulation' && !s.overtime, kickoff = s.kickoff?.team === 'home';
    // On their fourth down, the visitors' punt or field goal unit is already on the field.
    const theirKick = defending && sim.playbook()[0]?.kick;
    const title = s.toss === 'call' ? 'COIN TOSS.' : s.toss === 'choose' ? 'YOU WON THE TOSS.' : kickoff ? (s.kickoff.safety ? 'FREE KICK.' : 'KICKOFF.') : choosing ? 'AFTER THE TOUCHDOWN.' : two ? (defending ? 'STOP THE TWO.' : 'GO FOR TWO.') : theirKick === 'punt' ? 'THEY ARE PUNTING.' : theirKick ? 'STOP THE KICK.' : defending ? 'MAKE THE STOP.' : 'CALL YOUR PLAY.';
    const description = s.toss === 'call' ? 'Call it in the air. The winner chooses who gets the ball.' : s.toss === 'choose' ? (halves ? 'Receive the opening kickoff, or defer and receive to start the second half.' : 'Receive the kickoff, or kick off to the visitors.')
      : kickoff ? (s.kickoff.safety ? 'After the safety, punt it away from your 20.' : 'Kick it off to the visitors.' + (s.homeScore < s.awayScore ? ' You are behind, so an onside kick is an option.' : ''))
      : choosing ? 'Kick the extra point for one, or run one play from the 2 for two.' : two ? (defending ? 'The visitors want two points from the 2-yard line. Hold the line.' : 'One play from the 2-yard line. Get into the end zone.') : theirKick === 'punt' ? 'The visitors are punting. Return it, or rush the punter for a block.' : theirKick ? 'The visitors line up a ' + theirKickYards + '-yard field goal. Block it, or set up to return a miss.'
      : defending ? 'Pick your assignment. Close the gap. Make the tackle.' : 'Read the field from above. Choose your next move.';
    const last = lastResult ? '<div class="last-play tone-' + lastResult.tone + '"><span>LAST PLAY</span><b>' + escape(lastResult.title) + '</b><small>' + escape(lastResult.detail) + '</small></div>' : '';
    const eyebrow = s.toss ? 'COIN TOSS / ' + (s.overtime ? 'OVERTIME' : 'OPENING KICKOFF') : kickoff ? 'SPECIAL TEAMS / ' + homeTeam.shortName + ' KICKING'
      : (choosing || two ? 'CONVERSION / ' : theirKick ? 'SPECIAL TEAMS / ' : defending ? 'DEFENSE / ' : 'OFFENSE / ') + (defending ? awayTeam.shortName : homeTeam.shortName) + ' BALL';
    // No play is highlighted yet, so no route preview is drawn on the field.
    s.previewPlayId = null;
    overlay('game', title, description, list, { style: 'compact', polite: true, speech: s.toss ? description : theirKick ? sentences(situation(s), description) : situation(s), content: s.toss ? '' : last, eyebrow, note: sim.options.practice ? 'PRACTICE / NO FAIL' : sim.options.format === 'regulation' ? season.currentMatchupLabel() + ' · Four quarters' : 'Four possessions per team · No play clock' });
    $('pause-button').hidden = false;
  }
  function actionPanel(title, detail, list) {
    screen = 'game'; changeContext(); $('overlay').hidden = true; $('action-panel').hidden = false; $('steer-panel').hidden = true;
    $('action-title').textContent = title; $('action-detail').textContent = detail; $('action-kicker').textContent = sim.s.phase === 'defend' ? 'CLOSE THE GAP' : 'READ THE FIELD';
    makeItems(list, $('action-items'), -1); $('pause-button').hidden = false; updateHint(); speaking(sentences(title, detail), true);
  }
  function fieldSelection(list) {
    screen = 'game'; changeContext(); $('overlay').hidden = true; $('action-panel').hidden = true; $('steer-panel').hidden = true;
    // No receiver is highlighted until the first Space (or auto scan's first step).
    makeItems(list, $('target-labels'), -1);
    list.forEach((item, i) => {
      item.element.classList.add('field-choice'); item.element.dataset.playerId = sim.s.targets[i];
      // With charging on, a mouse or finger holds on a receiver the same way a held Enter does.
      item.element.addEventListener('pointerdown', e => { if (!prefs.charge || screen !== 'game' || sim.s.phase !== 'aim' || charge) return; e.preventDefault(); audio?.unlock(); try { item.element.setPointerCapture(e.pointerId); } catch (_) {} setFocus(i, false); startCharge(); });
      item.element.addEventListener('pointerup', () => { if (charge?.kind === 'throw') releaseCharge(); });
      item.element.addEventListener('pointercancel', () => { if (charge?.kind === 'throw') cancelCharge(); });
    });
    items.push({ name: 'Pause', element: $('pause-button'), action: pause });
    $('pause-button').hidden = false; updateHint();
    const chargeTip = prefs.charge && !hinted.throwCharge ? (hinted.throwCharge = true, ' Hold Enter on a receiver and the line grows toward him. Let go when it reaches him and the tone plays.') : '';
    speaking('Choose your receiver.' + chargeTip, true);
  }
  function renderPhase() {
    if (!activeGame || screen !== 'game') return;
    holdStarted = 0;
    const s = sim.s; phaseSeen = s.phase; resultHeld = s.phase === 'result' && s.resultRevealRemaining > 0; changeContext(); $('target-labels').replaceChildren(); $('kick-readout').hidden = true; $('kick-controls').hidden = true; $('scoreboard').hidden = false; $('situation').hidden = false; $('pause-button').hidden = false;
    if (s.phase === 'playcall') {
      saveMatch();
      // Basic makes the small calls for you: the coin toss, and always kicking deep.
      if (basic() && s.toss) return autoToss();
      if (basic() && s.kickoff?.team === 'home' && sim.callPlay('kickdeep')) { phaseSeen = ''; return renderPhase(); }
      playcall();
    }
    else if (s.phase === 'aim') {
      fieldSelection(s.targets.map((id, i) => {
        const p = s.players.find(p => p.id === id), info = s.targetInfo?.[i];
        return { name: '#' + (p?.number || i + 1), desc: info ? tagText(info) : 'READ THE COVERAGE', target: i, say: () => receiverSpeech(i), confirm: () => 'Throwing to number ' + (p?.number || i + 1) + ', ' + coverageWord(sim.s.targetInfo?.[i]) + '.', action: () => { sim.selectTarget(i); sim.throwPass(); phaseSeen = ''; renderPhase(); } };
      }));
    } else if (straightKick()) {
      // Hold Enter to charge it, or with Easy throw the kick goes by itself once its line has been heard.
      items = []; $('overlay').hidden = true; $('action-panel').hidden = true; $('steer-panel').hidden = true; $('kick-readout').hidden = false; $('kick-controls').hidden = false; $('aim-button').hidden = true;
      const k = s.kickoff, spot = !k ? 'Punt from your ' + Math.round(s.lineOfScrimmage) : k.safety ? 'Free kick from your 20' : k.kind === 'onside' ? 'Onside kick' : 'Kickoff from your 35';
      if (!k) sim.setKickAim(0);
      if (!prefs.charge) autoKickAt = performance.now() + 1200;
      speaking(sentences(spot, !prefs.charge ? '' : k?.kind === 'onside' ? 'Press Enter to kick.' : 'Hold Enter and the line grows down the field. Let go when the tone plays' + (k ? ' for a deep kick.' : '.')), true);
    } else if (s.phase === 'returnchoice') {
      // Running it out comes first, so a stray press never gives up a return.
      actionPanel('Caught in the end zone', 'Run it out, or take a knee for a touchback at your 25.', [
        { name: 'Run it out', desc: 'Return it behind your blockers', action: () => { sim.chooseReturn(true); phaseSeen = ''; renderPhase(); } },
        { name: 'Take a knee', desc: 'Touchback. Start at your 25', action: () => { sim.chooseReturn(false); phaseSeen = ''; renderPhase(); } },
        { name: 'Pause', action: pause }
      ]);
    } else if (s.phase === 'kickaim') {
      $('aim-button').hidden = false;
      // The aim starts at a far post. Auto sweep heads for the centre; in two-switch play the first Space press does.
      const towardCentre = -Math.sign(s.kickAim) * (renderer.getSteerSign?.() ?? -1) || 1;
      items = []; aimDirection = auto() ? towardCentre : -towardCentre; lastAimRegion = ''; guideOn = null; $('overlay').hidden = true; $('action-panel').hidden = true; $('steer-panel').hidden = true; $('kick-readout').hidden = false; $('kick-controls').hidden = false;
      const kickDistance = Math.round(100 - s.lineOfScrimmage + 17);
      const kickKey = prefs.charge ? 'Hold Enter and the line grows toward the uprights. Let go when the tone plays.' : 'Enter kicks.';
      speaking(sentences(s.playId === 'punt' ? 'Punt from your ' + Math.round(s.lineOfScrimmage) + '. Aim your punt' : (s.playId === 'extrapoint' ? 'Extra point from ' : 'Field goal try from ') + kickDistance + ' yards. Sweep the aim between the uprights' + (effective().kickGuide ? '; they light up when you are on target' : ''), auto() ? 'The aim sweeps automatically. ' + kickKey : 'Hold Space to aim. Release to stop. Press Space again to reverse. ' + kickKey), true);
    } else if (livePhase()) {
      if (effective().runControl === 'scan') runChoices();
      else { items = []; $('overlay').hidden = true; $('action-panel').hidden = true; $('steer-panel').hidden = false; if (!hinted[s.phase]) { hinted[s.phase] = true; speaking((s.phase === 'defend' ? 'Your defender plays by himself. Press a switch to steer. Tackles are automatic.' : 'Your robot runs by himself. Press a switch to steer.') + (auto() ? ' Hold Enter to steer ' + (armed < 0 ? 'left.' : 'right.') + ' Release to swap sides.' : ''), true); } }
    } else if (s.phase === 'result') {
      saveMatch(); const result = s.result || {};
      if (resultHeld) { items = []; $('overlay').hidden = true; $('action-panel').hidden = true; $('steer-panel').hidden = true; }
      else {
        // The outcome has had its moment on the field: go straight on to the next call.
        lastResult = { title: result.title || 'Play complete', detail: result.detail || '', tone: resultTone(s) };
        if (sim.continuePlay()) { phaseSeen = ''; renderPhase(); return; }
        overlay('game', result.title || 'PLAY COMPLETE', result.detail || s.message || 'Get ready for the next play.', [
        { name: 'Next play', desc: 'Return to the overhead playbook', action: () => { sim.continuePlay(); phaseSeen = ''; renderPhase(); } }, { name: 'Pause / settings', action: pause }
      ], { style: 'compact', eyebrow: 'THE DRIVE CONTINUES' });
      }
    } else if (s.phase === 'final') {
      if (!sim.options.practice) { try { localStorage.removeItem(gameMode === 'season' ? SEASON_SAVE : SAVE); } catch (_) {} }
      if (gameMode === 'season' && seasonMatchId && !seasonOutcome) seasonOutcome = season.recordResult(s.homeScore, s.awayScore, seasonMatchId);
      overlay('game', seasonOutcome?.outcome === 'champions' ? 'SEASON CHAMPIONS.' : s.homeScore > s.awayScore ? 'THAT’S YOUR WIN.' : s.homeScore === s.awayScore ? 'ALL SQUARE.' : 'FINAL WHISTLE.', homeTeam.name + ' ' + s.homeScore + ' — ' + awayTeam.name + ' ' + s.awayScore, [
        { name: gameMode === 'season' ? 'Continue season' : 'Play again', action: gameMode === 'season' ? seasonDashboard : restartCurrent }, { name: 'Main menu', action: mainMenu }, { name: 'Exit game', action: exitGame }
      ], { polite: true, content: '<div class="result-stats"><div><b>' + s.homeScore + '</b><span>' + homeTeam.shortName + '</span></div><div><b>FINAL</b><span>' + (gameMode === 'season' ? 'SEASON GAME' : 'Exhibition') + '</span></div><div><b>' + s.awayScore + '</b><span>' + awayTeam.shortName + '</span></div></div>' + statTable(s) + '<p>' + (seasonOutcome?.message || '') + '</p>' });
    } else { items = []; $('overlay').hidden = true; $('action-panel').hidden = true; $('steer-panel').hidden = true; }
    if (s.phase === 'final') $('pause-button').hidden = true;
    updateHint(); syncAudio();
  }
  // What a low-vision player needs to hear about a receiver: coverage first, then depth, side and odds.
  const coverageWord = info => ({ Open: 'open', Covered: 'covered', Tight: 'tight coverage' })[info?.openness] || 'covered';
  const tagText = info => info.openness.toUpperCase() + ' · ' + Math.max(0, info.yards) + ' YD';
  function receiverSpeech(index) {
    const s = sim.s, info = s.targetInfo?.[index], id = s.targets[index], p = s.players.find(q => q.id === id); if (!info || !p) return '';
    const point = renderer.projectPlayer?.(id), side = !point?.visible ? '' : point.x < innerWidth * .38 ? 'on the left' : point.x > innerWidth * .62 ? 'on the right' : 'in the middle';
    const depth = info.yards > 0 ? info.yards + (info.yards === 1 ? ' yard' : ' yards') : 'behind the line', odds = info.catchChance >= .85 ? 'Easy catch' : info.catchChance >= .7 ? 'Good chance' : 'Risky throw';
    return sentences('Number ' + p.number + ', ' + coverageWord(info), depth + (side ? ', ' + side : ''), odds);
  }
  // The game situation, spoken from the player's side of the field.
  function situation(s) {
    const home = s.possession === 'home', goal = home ? 100 - s.fieldPosition : s.fieldPosition, spot = Math.round(s.fieldPosition);
    const down = s.toss ? 'Coin toss' : s.kickoff ? (s.kickoff.team === 'home' ? (s.kickoff.safety ? 'Free kick from your 20' : 'You kick off from your 35') : 'The visitors kick off') : s.conversion === 'choose' ? 'After the touchdown' : s.conversion === 'two' ? 'Two-point try from the 2' : s.conversion === 'kick' ? 'Extra point try'
      : ['First', 'Second', 'Third', 'Fourth'][Math.max(0, Math.min(3, s.down - 1))] + ' and ' + (s.distance >= goal - .05 ? 'goal' : Math.ceil(s.distance)) + (spot === 50 ? ' at midfield' : spot < 50 ? ' at your ' + spot : ' at their ' + (100 - spot));
    const lead = s.homeScore - s.awayScore, high = Math.max(s.homeScore, s.awayScore), low = Math.min(s.homeScore, s.awayScore);
    const score = lead === 0 ? 'Tied at ' + s.homeScore : (lead > 0 ? 'You lead ' : 'You trail ') + high + ' to ' + low;
    const seconds = Math.max(0, Math.ceil(s.timeRemaining ?? 120));
    const clock = sim.options.practice ? '' : sim.options.format === 'regulation' ? (s.overtime ? 'Overtime' : ['First', 'Second', 'Third', 'Fourth'][s.quarter - 1] + ' quarter') + ', ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + ' left' : 'Drive ' + s.drive + ' of ' + s.maxDrives;
    return sentences(home || s.kickoff || s.toss ? '' : 'Visitors have the ball', down, score, clock);
  }
  function statTable(s) {
    const stats = s.stats || { home: {}, away: {} };
    const row = (label, key) => '<tr><td>' + label + '</td><td>' + Math.round(stats.home?.[key] || 0) + '</td><td>' + Math.round(stats.away?.[key] || 0) + '</td></tr>';
    return '<table class="stat-table"><tr><th>SYSTEM LOG</th><th>' + homeTeam.shortName + '</th><th>' + awayTeam.shortName + '</th></tr>' + row('TOTAL YARDS', 'yards') + row('TOUCHDOWNS', 'tds') + row('BIG PLAYS 20+', 'bigPlays') + row('BROKEN TACKLES', 'broken') + row('SACKS', 'sacks') + row('TURNOVERS', 'turnovers') + '</table>';
  }
  function runChoices() { actionPanel(sim.s.phase === 'defend' ? 'Track the runner' : 'Find the open field', 'The action waits. Choose where to move next.', [
    { name: 'Move left', action: () => startBurst(-1) }, { name: 'Straight ahead', action: () => startBurst(0) }, { name: 'Move right', action: () => startBurst(1) }, { name: 'Pause', action: pause }
  ]); }
  function startBurst(direction) { burstSteer = direction; burstTime = 0.95; items = []; $('action-panel').hidden = true; changeContext(); burstTime = 0.95; }
  function handleEvent(event) {
    const type = { result: 'whistle', score: 'touchdown', convert: 'powerup', broken: 'break', conversion: 'powerup', toss: 'select', final: event.state.homeScore >= event.state.awayScore ? 'win' : 'lose' }[event.type] || event.type;
    audio?.play(type);
    // The automatic coin toss speaks for itself, kickoff included.
    if (tossing) return;
    if (event.type === 'tackle') audio?.play('clang');
    if (event.type === 'result' && resultTone(event.state) === 'alert') audio?.play('powerdown');
    if (event.type === 'conversion') return;
    if (event.type === 'switch') {
      audio?.play('hover');
      const me = event.state.players.find(p => p.id === event.state.controlledId);
      if (me && performance.now() - lastSwitchSpeech > 2000) { lastSwitchSpeech = performance.now(); speaking('You are number ' + me.number + '.', true, event.state.phase); }
      return;
    }
    const ours = event.state.possession === 'home';
    if (!event.text) return;
    // Skip lines the next moment says anyway: the playbook, the snap, "Tackle made" before the result,
    // and the field-goal score the result has just read out.
    const repeated = event.type === 'ready' || event.type === 'tackle' || event.type === 'score' || (event.type === 'snap' || event.type === 'throw') && ours;
    const catcher = event.type === 'catch' && !ours && event.state.players.find(p => p.id === event.state.carrierId);
    const live = ['broken', 'catch', 'throw', 'kick', 'whistle'].includes(event.type) ? event.state.phase : undefined;
    if (!repeated) speaking(event.type === 'prepare' && /^Get set\./.test(event.text) ? 'Get set.' : catcher ? 'Caught by number ' + catcher.number + '. Make the tackle.' : event.text, true, live);
    if (!['snap', 'result', 'ready', 'prepare', 'catch', 'touchdown'].includes(event.type)) toast(event.type === 'broken' ? 'BROKEN TACKLE!' : event.text, event.type === 'broken' ? (ours ? 'good' : 'alert') : '');
  }
  function keyName(e) { return e.code === 'Space' ? 'Space' : ['Enter', 'NumpadEnter'].includes(e.code) ? 'Enter' : null; }
  window.addEventListener('keydown', e => {
    const key = keyName(e); if (!key) return; e.preventDefault(); if (e.repeat || presses.has(key) || inputLocks.has(key)) return;
    audio?.unlock(); presses.set(key, { start: performance.now(), epoch, screen, phase: sim?.s.phase, reverse: false, nextReverse: 3000 }); scanClock = 0;
    if (screen === 'game' && sim?.s.phase === 'kickaim' && !straightKick() && key === 'Space' && !auto()) aimDirection *= -1;
    if (screen === 'game' && key === 'Enter' && prefs.charge && startCharge()) presses.get(key).charging = true;
  });
  window.addEventListener('keyup', e => {
    const key = keyName(e); if (!key) return; e.preventDefault(); if (inputLocks.delete(key)) return;
    const press = presses.get(key); presses.delete(key);
    if (!press || press.epoch !== epoch) return;
    if (press.charging) { releaseCharge(); return; }
    if (screen === 'game' && sim.s.phase === 'kickaim') { if (key === 'Enter') { sim.kick(); phaseSeen = ''; renderPhase(); } return; }
    if (screen === 'game' && livePhase() && effective().runControl === 'hold') { if (key === 'Enter' && auto()) { armed *= -1; speaking(armed < 0 ? 'Left armed' : 'Right armed'); } return; }
    if (key === 'Space') { if (!press.reverse) advance(1); } else activate();
  });
  document.addEventListener('narbe-input-cancelled', e => { const key = keyName(e.detail || {}); if (key) presses.delete(key); pointerSteer = 0; });
  $('pause-button').addEventListener('click', pause);
  $('aim-button').addEventListener('pointerdown', e => { if (screen !== 'game' || sim.s.phase !== 'kickaim') return; e.preventDefault(); audio?.unlock(); $('aim-button').setPointerCapture?.(e.pointerId); aimDirection *= -1; pointerAim = true; });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) $('aim-button').addEventListener(event, () => { pointerAim = false; });
  $('kick-button').addEventListener('click', () => { if (screen === 'game' && sim.s.phase === 'kickaim' && !prefs.charge) { audio?.unlock(); sim.kick(); phaseSeen = ''; renderPhase(); } });
  // With charging on, a mouse or finger held on Kick charges it the same way a held Enter does.
  $('kick-button').addEventListener('pointerdown', e => { if (screen !== 'game' || sim.s.phase !== 'kickaim' || !prefs.charge || charge) return; e.preventDefault(); audio?.unlock(); try { $('kick-button').setPointerCapture(e.pointerId); } catch (_) {} startCharge(); });
  $('kick-button').addEventListener('pointerup', () => { if (charge?.kind === 'kick') releaseCharge(); });
  $('kick-button').addEventListener('pointercancel', () => { if (charge?.kind === 'kick') cancelCharge(); });
  [['steer-left', -1], ['steer-right', 1]].forEach(([id, direction]) => {
    const el = $(id); el.addEventListener('pointerdown', e => { if (screen !== 'game' || !livePhase()) return; e.preventDefault(); audio?.unlock(); el.setPointerCapture?.(e.pointerId); pointerSteer = direction; });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(event, () => { pointerSteer = 0; });
  });
  function loseFocus() { clearHeld(); if (activeGame && screen === 'game' && sim.s.phase !== 'final') pause(); audio?.pause(); }
  window.addEventListener('blur', loseFocus); document.addEventListener('visibilitychange', () => { if (document.hidden) loseFocus(); });
  window.addEventListener('pagehide', () => { saveMatch(); audio?.dispose(); });
  scan?.subscribe(() => { scanClock = 0; clearHeld(); updateHint(); });
  function updateInput(dt, now) {
    const space = presses.get('Space');
    if (space && items.length && now - space.start >= space.nextReverse) { space.reverse = true; space.nextReverse += interval(); advance(-1); }
    if (auto() && items.length && !presses.size && !document.hidden) { scanClock += dt * 1000; if (scanClock >= interval()) { scanClock %= interval(); advance(1); } }
  }
  function updateHud() {
    const s = sim.s, fx = effective(); $('home-score').textContent = s.homeScore; $('away-score').textContent = s.awayScore;
    document.querySelector('#scoreboard .home span').textContent = homeTeam.name.toUpperCase(); document.querySelector('#scoreboard .away span').textContent = awayTeam.name.toUpperCase();
    document.querySelector('#scoreboard .home').style.setProperty('--team', homeTeam.color); document.querySelector('#scoreboard .away').style.setProperty('--team', awayTeam.color);
    const seconds = Math.max(0, Math.ceil(s.timeRemaining ?? 120));
    $('period').textContent = (sim.options.practice ? 'PRACTICE' : sim.options.format === 'regulation' ? (s.overtime ? 'OT ' + s.overtimePeriod : 'Q' + s.quarter) + ' · ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2,'0') : 'DRIVE ' + s.drive + ' / ' + s.maxDrives);
    $('possession').textContent = s.toss ? 'NO BALL YET' : s.kickoff ? (s.kickoff.team === 'home' ? homeTeam.shortName : awayTeam.shortName) + ' KICK' : (s.possession === 'away' ? awayTeam.shortName : homeTeam.shortName) + ' BALL';
    $('down').textContent = s.toss ? 'COIN TOSS' : s.kickoff ? (s.kickoff.safety ? 'FREE KICK' : 'KICKOFF') : s.conversion === 'choose' ? 'CONVERSION' : s.conversion === 'kick' ? 'EXTRA POINT' : s.conversion === 'two' ? 'TWO-POINT TRY' : ['1ST', '2ND', '3RD', '4TH'][Math.max(0, Math.min(3, s.down - 1))] + ' & ' + (s.distance ? Math.round(s.distance * 10) / 10 : 'GOAL');
    // On a kickoff the spot is read from your side of the field.
    const pos = Math.round(s.possession === 'away' && !s.kickoff ? 100 - s.fieldPosition : s.fieldPosition); $('spot').textContent = s.toss ? 'MIDFIELD' : pos <= 50 ? 'OWN ' + pos : 'OPP ' + (100 - pos);
    const labels = { playcall: ['TACTICAL UPLINK', s.conversion ? 'CONVERSION' : s.possession === 'away' ? 'CALL YOUR DEFENSE' : 'CALL YOUR PLAY'], presnap: ['SYSTEMS CHECK', 'GET SET FOR THE SNAP'], aim: ['QB OPTICS', 'LOCK ON A RECEIVER'], flight: ['BALL TRACKING', 'MAKE THE CONNECTION'], run: ['RUNNER CAM', 'ATTACK THE OPEN FIELD'], defend: ['PURSUIT MODE', 'CLOSE IN · AUTO TACKLE'], kickaim: ['KICK CALIBRATION', s.kickoff ? (s.kickoff.kind === 'onside' ? 'ONSIDE KICK' : 'KICK IT DEEP') : s.playId === 'extrapoint' ? 'AIM THE EXTRA POINT' : 'AIM YOUR KICK'], kickflight: ['BALL TRACKING', s.kickoff ? 'KICKOFF' : 'FOLLOW THE KICK'], returnchoice: ['RETURN CAM', 'KNEE OR RETURN'], tackle: ['IMPACT CAM', 'MAKING THE STOP'], result: ['PLAY COMPLETE', s.result?.title || 'PLAY COMPLETE'], final: ['FINAL', 'FULL TIME'] };
    if (s.toss) labels.playcall = ['TACTICAL UPLINK', 'COIN TOSS']; else if (s.kickoff) { labels.playcall = ['SPECIAL TEAMS', 'KICKOFF']; labels.run = ['RETURN CAM', 'RUN IT BACK']; labels.defend = ['COVERAGE MODE', 'TACKLE THE RETURNER']; }
    if (s.kickReturn) labels.run = ['RETURN CAM', 'RUN IT BACK'];
    const label = tossHold ? ['TACTICAL UPLINK', 'COIN TOSS'] : labels[s.phase] || labels.playcall; $('camera-label').textContent = label[0]; $('phase-label').textContent = label[1];
    if (livePhase() && fx.runControl === 'hold') {
      const one = auto(); $('steer-left').classList.toggle('armed', one && armed === -1); $('steer-right').classList.toggle('armed', one && armed === 1);
      $('steer-left').querySelector('span').textContent = one ? 'LEFT' + (armed === -1 ? ' · ARMED' : '') : 'SPACE · LEFT';
      $('steer-right').querySelector('span').textContent = one ? 'RIGHT' + (armed === 1 ? ' · ARMED' : '') : 'ENTER · RIGHT';
      $('run-title').textContent = s.phase === 'defend' ? 'CLOSE THE GAP' : 'TAKE IT HOME';
      $('run-detail').textContent = one ? 'Hold Enter to steer ' + (armed < 0 ? 'left' : 'right') + '. Release to swap.' : s.phase === 'defend' ? (s.autoPlay ? 'Auto defense is playing. Press a switch to take control.' : 'You are steering. Reach the runner to tackle.') : s.autoPlay ? 'Auto run: your robot finds open grass. Press a switch to steer.' : 'You are steering. Forward running is automatic.';
    }
    if (s.phase === 'aim' && screen === 'game') {
      const placed = [];
      const targets = items.filter(item => item.target !== undefined).sort((a, b) => Number(b.target === s.selectedTarget) - Number(a.target === s.selectedTarget));
      for (const item of targets) {
        const point = renderer.projectPlayer?.(s.targets[item.target]); if (!point) continue;
        const info=s.targetInfo?.[item.target];
        if(info){const description=tagText(info);if(item.desc!==description){item.desc=description;item.element.querySelector('.desc').textContent=description;}item.element.dataset.open=info.openness.toLowerCase();item.element.setAttribute('aria-label',receiverSpeech(item.target));
          if(item===items[focusIndex]&&item.target===s.selectedTarget){if(item.heard===undefined)item.heard=info.openness;else if(item.heard!==info.openness&&performance.now()-openSpoken>1500){item.heard=info.openness;openSpoken=performance.now();speaking('Number '+s.players.find(q=>q.id===s.targets[item.target]).number+' is '+(info.openness==='Tight'?'in tight coverage':coverageWord(info))+' now.',true);}}}
        const button = item.element, width = button.offsetWidth, height = button.offsetHeight;
        const x = Math.max(width / 2 + 14, Math.min(innerWidth - width / 2 - 14, point.x));
        const minY = 162 + height, maxY = innerHeight - 124;
        // While the charge line comes down onto him, his tag moves under his feet, out of its way.
        const player = charge && item.target === charge.target && s.players.find(q => q.id === s.targets[item.target]);
        const feet = player && renderer.projectWorld?.({ x: player.x, y: 0, z: player.z });
        const desired = Math.max(minY, Math.min(maxY, feet?.visible ? feet.y + 14 + height : point.y - 12));
        const positions = [desired];
        for (let offset = 1; offset <= 5; offset++) { positions.push(desired - offset * (height + 12), desired + offset * (height + 12)); }
        const overlaps = y => placed.some(r => x + width / 2 + 8 > r.left && x - width / 2 - 8 < r.right && y + 8 > r.top && y - height - 8 < r.bottom);
        const y = positions.find(y => y >= minY && y <= maxY && !overlaps(y)) ?? desired;
        button.style.left = x + 'px'; button.style.top = y + 'px';
        placed.push({ left: x - width / 2, right: x + width / 2, top: y - height, bottom: y });
      }
    }
    if (s.phase === 'run' && screen === 'game') {
      $('target-labels').replaceChildren();
      const me = s.players.find(p => p.id === s.controlledId), point = me && s.controlGrace === 0 && renderer.projectWorld?.({ x: me.x, y: 0, z: me.z });
      if (point?.visible) { const tag = document.createElement('div'); tag.className = 'target-tag you-tag' + (s.autoPlay ? ' auto' : ''); tag.textContent = (s.autoPlay ? '▲ AUTO' : '▲ YOU') + ' #' + me.number; tag.style.left = point.x + 'px'; tag.style.top = point.y + 'px'; $('target-labels').append(tag); }
    }
    if (s.phase === 'defend' && screen === 'game') {
      $('target-labels').replaceChildren();
      const me = s.players.find(p => p.id === s.controlledId);
      // The carrier's tag sits above his helmet; yours sits at your robot's feet, so they never collide.
      for (const [id, className, text] of [[s.defenseTargetId || s.carrierId, 'ball-carrier', '▼ BALL CARRIER'], [s.controlledId, 'you-tag' + (s.autoPlay ? ' auto' : ''), (s.autoPlay ? '▲ AUTO' : '▲ YOU') + (me ? ' #' + me.number : '')]]) {
        const p = s.players.find(q => q.id === id), point = className.startsWith('you-tag') ? p && renderer.projectWorld?.({ x: p.x, y: 0, z: p.z }) : renderer.projectPlayer?.(id); if (!point?.visible) continue;
        const tag = document.createElement('div'); tag.className = 'target-tag ' + className; tag.textContent = text; tag.style.left = point.x + 'px'; tag.style.top = point.y + 'px'; $('target-labels').append(tag);
      }
    }
    if (screen === 'game' && straightKick()) {
      $('kick-arrow').textContent = '↑'; $('kick-status').textContent = s.kickoff?.kind === 'onside' ? 'ONSIDE KICK' : charge ? 'CHARGING' : s.kickoff ? 'KICKOFF' : 'PUNT'; $('kick-readout').classList.remove('on-target');
    } else if (s.phase === 'kickaim' && screen === 'game') {
      const moving = (auto() || presses.has('Space') || pointerAim) && !presses.has('Enter'), onTarget = fx.kickGuide && s.playId !== 'punt' && Math.abs(s.kickAim) <= (s.kickWindow ?? .4);
      $('kick-arrow').textContent = onTarget ? '◎' : moving ? aimDirection < 0 ? '←' : '→' : '•';
      $('kick-status').textContent = onTarget ? 'ON TARGET' : moving ? 'AIMING ' + (aimDirection < 0 ? 'LEFT' : 'RIGHT') : 'AIM SET';
      $('kick-readout').classList.toggle('on-target', onTarget);
    }
    const outcome = s.phase === 'result' && (s.resultRevealRemaining > 0 || resultHeld);
    const ready = screen === 'game' && (!!tossHold || s.phase === 'presnap' || s.controlGrace > 0 || outcome || s.phase === 'tackle');
    $('ready-cue').hidden = !ready;
    if (screen === 'game' && tossHold) { $('toast').classList.remove('on'); banner(tossHold.title, tossHold.detail, tossHold.won ? 'good' : 'neutral'); }
    else if (outcome || s.phase === 'tackle') { $('toast').classList.remove('on'); banner(outcome ? s.result?.title || 'PLAY COMPLETE' : 'IMPACT!', outcome ? s.result?.detail || 'The next play will be ready in a moment' : 'Playing through the whistle', outcome ? resultTone(s) : 'neutral'); }
    else if (ready) { $('toast').classList.remove('on'); banner(s.phase === 'presnap' ? (s.countdown > 1.5 ? 'GET SET' : 'READY') : s.phase === 'defend' ? 'YOUR DEFENDER' : 'YOUR BALL', s.phase === 'presnap' ? (s.kickoff ? (s.kickoff.team === 'home' ? 'Line up the kickoff' : 'The visitors kick off to you') : s.conversion === 'kick' && s.possession === 'away' ? 'The visitors line up the extra point' : 'Robots are lining up') : fx.runControl === 'scan' ? 'Choose your direction when ready' : auto() ? 'Hold Enter to steer ' + (armed < 0 ? 'left' : 'right') : 'Space left · Enter right', 'neutral'); }
    const carrier = livePhase() && s.controlGrace === 0 && s.players.find(p => p.id === s.carrierId);
    $('gain-readout').hidden = !carrier || screen !== 'game';
    if (carrier) {
      // On a kickoff return the readout counts return yards from the catch.
      const returning = (!!s.kickoff || !!s.kickReturn) && Number.isFinite(s.returnFrom), from = returning ? s.returnFrom : s.lineOfScrimmage;
      const gain = Math.round((carrier.z - from) * (s.possession === 'home' ? 1 : -1));
      $('gain-label').textContent = returning ? (s.phase === 'defend' ? 'VISITORS RETURN' : 'RETURN') : s.phase === 'defend' ? 'VISITORS GAIN' : 'GAIN'; $('gain-value').textContent = (gain > 0 ? '+' : '') + gain;
      $('gain-readout').className = returning ? '' : gain < 0 ? 'loss' : gain >= s.distance ? 'first' : '';
    }
  }
  // The centre banner re-animates only when its message changes.
  function banner(label, detail, tone) {
    const cue = $('ready-cue'), key = label + '|' + tone;
    $('ready-label').textContent = label; $('ready-detail').textContent = detail;
    if (key === cueKey) return;
    cueKey = key; cue.className = 'tone-' + tone; void cue.offsetWidth; cue.classList.add('pop');
  }
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
    updateInput(dt, now); const fx = effective();
    let steer = pointerSteer;
    if (screen === 'game' && livePhase() && fx.runControl === 'hold') {
      if (auto()) steer ||= presses.has('Enter') ? armed : presses.has('Space') ? -1 : 0;
      else steer ||= (presses.has('Enter') ? 1 : 0) - (presses.has('Space') ? 1 : 0);
    }
    $('steer-left').classList.toggle('active', steer < 0); $('steer-right').classList.toggle('active', steer > 0);
    flushSpeech(now);
    // The coin toss has its moment: the kickoff waits until it has been heard.
    if (tossHold && activeGame && screen === 'game' && !document.hidden && now >= tossHold.until && sceneReady(now)) { tossHold = null; phaseSeen = ''; renderPhase(); }
    if (activeGame && screen === 'game' && !document.hidden && !tossHold) {
      if (autoKickAt && straightKick() && !presses.size && !charge && (now >= autoKickAt && !speechBusy(now) || now >= autoKickAt + 6000)) { autoKickAt = 0; sim.kick(); phaseSeen = ''; renderPhase(); }
      if (sim.s.phase === 'kickaim' && !straightKick() && !presses.has('Enter') && !charge && (auto() || presses.has('Space') || pointerAim)) {
        const next = sim.s.kickAim + aimDirection * (renderer.getSteerSign?.() ?? -1) * fx.aimSpeed * dt;
        sim.setKickAim(next); if (auto() && Math.abs(next) >= 1) aimDirection *= -1;
        const visual = sim.s.kickAim * (renderer.getSteerSign?.() ?? -1), region = Math.abs(visual) < 0.14 ? 'Center' : visual < 0 ? 'Left' : 'Right';
        const placeKick = sim.s.playId !== 'punt', onTarget = placeKick && Math.abs(sim.s.kickAim) <= (sim.s.kickWindow ?? .4);
        if (fx.kickGuide && placeKick) {
          // A soft ping and "On target" as the aim enters the uprights; the side is named as it leaves.
          if (guideOn === null) guideOn = onTarget;
          else if (onTarget !== guideOn) {
            guideOn = onTarget;
            if (onTarget) { audio?.play('target'); speaking('On target.'); lastAimSpeech = now; }
            else if (now - lastAimSpeech > 900) { speaking('Aim ' + (visual < 0 ? 'left' : 'right') + '.'); lastAimSpeech = now; }
          }
        } else if (region !== lastAimRegion && now - lastAimSpeech > 1500) { speaking(region === 'Center' ? 'Aim center, safest.' : 'Aim ' + region.toLowerCase() + '.'); lastAimRegion = region; lastAimSpeech = now; }
      }
      stepCharge(dt);
      if (livePhase() && fx.runControl === 'scan') { if (sim.s.controlGrace > 0) sim.step(dt, 0); else if (burstTime > 0) { sim.step(dt, burstSteer * (renderer.getSteerSign?.() ?? -1), true); burstTime -= dt; if (burstTime <= 0 && livePhase()) runChoices(); } }
      else sim.step(dt, steer * (renderer.getSteerSign?.() ?? -1), steer !== 0 || (screen === 'game' && livePhase() && fx.runControl === 'hold' && (presses.has('Space') || presses.has('Enter'))));
      if (sim.s.phase !== phaseSeen || resultHeld && !(sim.s.resultRevealRemaining > 0) && sceneReady(now)) renderPhase();
    }
    renderer.render(sim.s, document.hidden || (activeGame && screen !== 'game') ? 0 : dt, { reducedMotion: fx.reducedMotion, menu: !activeGame, menuOpen: !$('overlay').hidden && $('overlay').classList.contains('compact'), targetShown: items[focusIndex]?.target !== undefined, kickGuide: fx.kickGuide, charge, chargeZone: ZONE, chargeMax: CHARGE_MAX, homeTeam, awayTeam });
    document.body.classList.toggle('charging', !!charge);
    document.body.classList.toggle('in-game', activeGame && screen === 'game'); document.body.classList.toggle('menu-open', !$('overlay').hidden);
    if (activeGame) updateHud();
    requestAnimationFrame(frame);
  }
  try {
    audio?.init(); season = new FootballSeason(); homeTeam = FootballSeason.getTeam(prefs.teamId); awayTeam = FootballSeason.TEAMS.find(t => t.id !== homeTeam.id); preferencesChanged(); motionQuery.addEventListener?.('change', preferencesChanged); sim = new FootballSim({ difficulty: effective().difficulty, pace: effective().pace }, handleEvent);
    sim.setTeamNames(homeTeam.unitName, awayTeam.unitName); renderer = new FootballRenderer($('stadium'));
    window.addEventListener('resize', () => renderer.resize());
    // Exposes state for local diagnostics without coupling the game to test tools.
    window.RobotFootball = window.BennyFootball = { sim, renderer, prefs, season, pause, resume, startGame, get screen() { return screen; }, get charge() { return charge && { ...charge }; } };
    $('loading').hidden = true; mainMenu(); requestAnimationFrame(frame);
  } catch (error) {
    console.error('Football startup failed', error); $('loading').hidden = true;
    overlay('error', 'THE STADIUM COULDN’T OPEN', '3D graphics are unavailable. Try enabling hardware acceleration and reopening the game.', [{ name: 'Try again', action: () => location.reload() }, { name: 'Exit game', action: exitGame }]);
    requestAnimationFrame(function errorFrame(now) { updateInput(Math.min(0.05, (now - lastTime) / 1000), now); lastTime = now; requestAnimationFrame(errorFrame); });
  }
})();
