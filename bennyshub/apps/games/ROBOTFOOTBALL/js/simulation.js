/* ROBOTFOOTBALL — deterministic, DOM-free football simulation. */
(function (global) {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const copy = o => JSON.parse(JSON.stringify(o));
  // "First down!" + "Gain of 9 yards." reads as two sentences, never "First down!. Gain".
  const sentences = (...parts) => parts.filter(Boolean).map(p => /[.!?]$/.test(p) ? p : p + '.').join(' ');
  const SIDE = 26.65;
  const SNAP_SECONDS = 3, CONTROL_GRACE = 2.2, QUARTER_SECONDS = 120, THROW_WINDUP = .32;
  const TOUCHDOWN_POINTS = 6, EXTRA_POINT_SPOT = 15, TWO_POINT_SPOT = 2;
  // With no button pressed, the robot you control plays himself: a short beat
  // after the last press, so letting go between presses never jerks him around.
  // On defense, after three hands-off seconds control moves to the robot nearest the ball.
  const AUTO_PLAY_AFTER = .4, SWITCH_AFTER = 3;
  // A charged throw or kick is right when its line reaches the target: between these
  // two fractions of the full distance. Short of it is soft; past it is an overthrow.
  const CHARGE_ZONE = [.88, 1.12], CHARGE_MAX = 1.35;
  // Place kicks: the holder kneels seven yards back. The run-up takes a second of real
  // time at any pace, and the boot lands .29 s into the kick swing.
  const PLACE_KICK_SPOT = 7, KICK_APPROACH = 1, KICK_CONTACT = .29;
  // Coverage is real and it holds still long enough to act on. Each receiver's defender
  // plays a plan for four to seven real seconds: about six yards off (open), three and
  // a half (covered) or on his hip (tight), and he changes one step at a time. The read
  // is measured from the nearest defender actually on the field, with a little
  // hysteresis and READ_CONFIRM seconds so a defender on the line never flickers it.
  // Another defender only passing by counts once he has stayed near for PASSING_BY seconds.
  const COVER_CUSHION = { Open: 6.2, Covered: 3.4, Tight: 1.3 }, COVER_PLAN_SECONDS = [4, 7], READ_CONFIRM = .3, PASSING_BY = .8;
  const COVERS = ['CB1', 'CB2', 'SS', 'LB2'];
  // A pass let go early can still be caught, diving, only if it lands this close to him.
  const SHORT_CATCH_YARDS = 1.1;
  // A tackled robot goes down forward and lands with the ball this far past his feet (the
  // renderer tips him 1.48 rad, ball at chest height). Landing over the goal line is a touchdown.
  const FALL_REACH = 1.3;
  // Interceptions are seen coming: a pass is judged PICK_LOOK seconds before it lands, and the
  // defender who will pick it off breaks on the ball from up to PICK_REACH yards away. Your
  // throw to an Open receiver is never picked; into coverage, up to PICK_MAX of throws are, more
  // the tighter the window. Your nearest robot picks the visitors' throws: more often the closer
  // he is, and most of all in Deep Cover (CPU_PICK, by your call).
  const PICK_LOOK = .7, PICK_REACH = 4.5, PICK_MAX = { rookie: .2, pro: .26 };
  const CPU_PICK = { zone: .34, man: .26, contain: .18, blitz: .14 };
  const COVERAGE = ['Open', 'Covered', 'Tight'], COVERAGE_GAP = { Open: [4.5, Infinity], Covered: [2.6, 4.5], Tight: [0, 2.6] };
  // Kickoffs, as in classic football: from the kicking team's 35 to open each half and
  // after every score, a punted free kick from the 20 after a safety, and a touchback
  // at the 25. The kickoff run-up is longer than a field goal's.
  const KICKOFF_SPOT = 35, SAFETY_KICK_SPOT = 20, KICKOFF_TOUCHBACK = 25, KICKOFF_APPROACH = 1.5;
  // A kickoff with no charge (Easy throw) lands inside the visitors' 10 for a return,
  // and only now and then carries into the end zone.
  const EASY_KICKOFF_TOUCHBACK = .1;
  // A punt that dies in the end zone comes out to the 20.
  const PUNT_TOUCHBACK = 20;
  // Rookie stays forgiving, but every defender takes a real pursuit angle and
  // blocks do not last forever. A defender on the ball carrier tackles him;
  // only now and then does a runner shake one off. The player's own defender
  // always finishes.
  const TUNING = {
    rookie: { pursuit: .99, teammates: .9, cushion: 2.5, runner: 6.9, lateral: 5.9, cpuLateral: 2.6, reach: 1.45, shed: 1.9, blocked: .3, pickup: .7,
      stamina: { after: 2.2, rate: .06, floor: .84 }, dive: 2.4, broken: { front: .06, side: .1, behind: .15, engaged: .1, dive: .1 }, cpuBroken: .05, rushShed: 1.25, assist: .35 },
    pro: { pursuit: 1.02, teammates: .84, cushion: 2.2, runner: 6.9, lateral: 5.6, cpuLateral: 3.8, reach: 1.55, shed: 1.35, blocked: .34, pickup: 1,
      stamina: { after: 2.2, rate: .06, floor: .84 }, dive: 2.5, broken: { front: .03, side: .06, behind: .1, engaged: .06, dive: .06 }, cpuBroken: .1, rushShed: 1.6, assist: 0 }
  };
  const ROLE_SPEED = { CB1: 7.3, CB2: 7.3, FS: 7.2, SS: 7.1, LB1: 6.8, MLB: 6.8, LB2: 6.8, DE1: 6.1, DE2: 6.1, DT1: 5.5, DT2: 5.5,
    QB: 5.6, C: 5.2, LG: 5.2, RG: 5.2, LT: 5.2, RT: 5.2, WR1: 7, WR2: 7, SLOT: 6.9, TE: 6.3, RB: 6.8 };
  const PLAYS = [
    { id: 'slants', name: 'Quick Slants', label: 'Short pass', type: 'pass', description: 'Quick throws about 10 yards out. The easiest catch. Good for a first down.', routes: [[-19, 0, -9, 11], [18, 0, 8, 13], [-8, 0, 3, 9], [8, 0, 14, 7]] },
    { id: 'flood', name: 'Sideline Flood', label: 'Medium pass', type: 'pass', description: 'Receivers short, middle and deep on the left. More yards, a fair catch.', routes: [[-19, 0, -15, 22], [18, 0, 22, 18], [-8, 0, 8, 12], [8, 0, 17, 6]] },
    { id: 'verticals', name: 'Four Verticals', label: 'Long pass', type: 'pass', description: 'Every receiver runs deep, 25 to 30 yards. Big gains, but the hardest catch.', routes: [[-19, 0, -20, 29], [18, 0, 19, 31], [-8, 0, -7, 24], [8, 0, 7, 26]] },
    { id: 'sweep', name: 'Outside Sweep', label: 'Outside run', type: 'run', description: 'The running back runs wide to the right. Can break a big gain, or lose yards.', lane: -10 },
    { id: 'inside', name: 'Inside Zone', label: 'Inside run', type: 'run', description: 'The running back runs up the middle behind your blockers. A steady few yards.', lane: 2 },
    { id: 'fieldgoal', name: 'Field Goal', label: 'Field Goal', type: 'kick', description: 'Kick it through the uprights for 3 points.' },
    { id: 'punt', name: 'Punt', label: 'Punt', type: 'kick', description: 'Kick it away on fourth down to push the visitors back.' },
    { id: 'extrapoint', name: 'Extra Point', label: 'Extra Point', type: 'kick', conversion: true, description: 'A short kick from the 15 for one point.' }
  ];
  const DEFENSE_PLAYS = [
    { id: 'contain', name: 'Edge Contain', label: 'Stop the run', type: 'defense', description: 'Your robots guard the edges. Strong against runs, weaker against passes.' },
    { id: 'blitz', name: 'Blitz', label: 'Rush the passer', type: 'defense', description: 'Extra robots go after the quarterback for a sack. Receivers may get open.' },
    { id: 'zone', name: 'Deep Cover', label: 'Stop the pass', type: 'defense', description: 'Your robots drop back to cover receivers. Strong against passes, weaker against runs.' },
    { id: 'man', name: 'Man-to-Man', label: 'Cover short passes', type: 'defense', description: 'Each robot sticks to one receiver. Strong against short passes, but a long pass can beat it.' }
  ];
  // Fourth down: when the visitors line up to punt or kick a field goal, special teams take the field.
  const PUNT_DEFENSE = [
    { id: 'puntreturn', name: 'Punt Return', label: 'Return the punt', type: 'defense', kick: 'punt', description: 'Your returner catches the punt and runs it back behind a wall of blockers.' },
    { id: 'puntblock', name: 'Punt Block', label: 'Block the punt', type: 'defense', kick: 'punt', description: 'Everyone rushes the punter. A block gives you the ball near their goal. If it gets away, nobody is back and it rolls on.' }
  ];
  const FIELD_GOAL_DEFENSE = [
    { id: 'fgblock', name: 'Field Goal Block', label: 'Block the kick', type: 'defense', kick: 'fieldgoal', description: 'Rush the kicker for a chance to block it. Long kicks fly lower and are easier to block.' },
    { id: 'fgreturn', name: 'Field Goal Return', label: 'Return a miss', type: 'defense', kick: 'fieldgoal', description: 'Your returner waits at the goal line. A long kick that falls short can be run back.' }
  ];
  const SPECIAL_DEFENSE = PUNT_DEFENSE.concat(FIELD_GOAL_DEFENSE);
  const CONVERSION_CHOICES = [
    { id: 'extrapoint', name: 'Kick the extra point', type: 'kick', value: '+1', description: 'A short kick from the 15. Aim for the center.' },
    { id: 'gofortwo', name: 'Go for two', type: 'choice', value: '+2', description: 'One play from the 2-yard line. Run or pass it in.' }
  ];
  const TOSS_CALLS = [
    { id: 'heads', name: 'Heads', label: 'Heads', type: 'toss', description: '' },
    { id: 'tails', name: 'Tails', label: 'Tails', type: 'toss', description: '' }
  ];
  const TOSS_CHOICES = {
    receive: { id: 'receive', name: 'Receive', label: 'Receive', type: 'toss', description: 'Your offense gets the ball first.' },
    receiveHalf: { id: 'receive', name: 'Receive', label: 'Receive', type: 'toss', description: 'Your offense gets the ball first. The visitors receive to start the second half.' },
    defer: { id: 'defer', name: 'Defer', label: 'Defer to the second half', type: 'toss', description: 'Kick off now, then receive to start the second half. Most coaches choose this.' },
    kick: { id: 'kickfirst', name: 'Kick off', label: 'Kick off', type: 'toss', description: 'Kick off to the visitors. They get the ball first.' }
  };
  const KICKOFF_PLAYS = [
    { id: 'kickdeep', name: 'Kickoff', label: 'Kick deep', type: 'kickoff', description: 'Kick it deep. A full kick lands in the end zone for a touchback.' },
    { id: 'onside', name: 'Onside kick', label: 'Onside kick', type: 'kickoff', description: 'A short kick your robots try to get back. Only when you are behind. A long shot.' }
  ];
  const KICK_TARGETS = [
    { name: 'Left lane', x: -2.2 },
    { name: 'Center', x: 0 },
    { name: 'Right lane', x: 2.2 }
  ];
  const STAT_KEYS = ['yards', 'tds', 'turnovers', 'sacks', 'broken', 'bigPlays'];
  const emptyStats = () => ({ home: Object.fromEntries(STAT_KEYS.map(k => [k, 0])), away: Object.fromEntries(STAT_KEYS.map(k => [k, 0])) });
  const roster = [
    ['QB', 12, 'Quarterback'], ['C', 60, 'Center'], ['LG', 64, 'Left guard'],
    ['RG', 66, 'Right guard'], ['LT', 72, 'Left tackle'], ['RT', 74, 'Right tackle'],
    ['WR1', 81, 'Reed'], ['WR2', 88, 'Carter'], ['SLOT', 11, 'Brooks'],
    ['TE', 87, 'Hayes'], ['RB', 22, 'Walker']
  ];
  const defenders = [
    ['DE1', 91, 'Edge'], ['DT1', 95, 'Tackle'], ['DT2', 97, 'Tackle'], ['DE2', 90, 'Edge'],
    ['LB1', 52, 'Linebacker'], ['MLB', 54, 'Middle linebacker'], ['LB2', 56, 'Linebacker'],
    ['CB1', 21, 'Corner'], ['CB2', 24, 'Corner'], ['FS', 31, 'Safety'], ['SS', 33, 'Safety']
  ];
  function optionsFor(o) {
    o = o || {};
    return {
      difficulty: o.difficulty === 'pro' ? 'pro' : 'rookie',
      practice: o.practice === true,
      pace: finite(o.pace) ? clamp(o.pace, 0.35, 1.2) : 0.45,
      format: o.format === 'regulation' ? 'regulation' : 'drives',
      kickoffs: o.kickoffs === true
    };
  }
  class FootballSim {
    constructor(options, onEvent) {
      this.onEvent = typeof onEvent === 'function' ? onEvent : function () {};
      this.random = options && typeof options.random === 'function' ? options.random : Math.random;
      this.reset(options);
    }
    _emit(type, text) {
      this.onEvent({ type: type, text: text || '', state: this.s });
    }
    _rand() { return clamp(Number(this.random()) || 0, 0, 0.999999); }
    _tune() { return TUNING[this.options.difficulty === 'pro' ? 'pro' : 'rookie']; }
    _stat(team, key, amount) {
      const stats = this.s.stats && this.s.stats[team];
      if (stats && finite(stats[key])) stats[key] = Math.round((stats[key] + amount) * 10) / 10;
    }
    reset(options) {
      if (options && typeof options.random === 'function') this.random = options.random;
      this.options = optionsFor(options);
      this._flight = null;
      this._pending = null;
      this._runTime = 0; this._controlRamp = 0; this._queuedPlay = null; this._cpuPass = null; this._routeTime = 0; this._switchCheck = 0; this._idle = 0;
      this.s = {
        phase: 'playcall', possession: 'home', possessionNumber: 0,
        format: this.options.format, quarter: 1, timeRemaining: QUARTER_SECONDS, overtime: false, overtimePeriod: 0,
        countdown: 0, nextPhase: null, controlGrace: 0, defenseStage: null, defenseTargetId: null, opponentPlayType: null,
        players: [], ball: { x: 0, y: 1.1, z: 21, visible: true },
        carrierId: null, controlledId: null, passerId: null, throwWindupRemaining: 0, selectedTarget: 0, targets: [], targetInfo: [],
        routes: [], lineOfScrimmage: 25, firstDownLine: 35, fieldPosition: 25,
        down: 1, distance: 10, homeScore: 0, awayScore: 0,
        drive: 1, maxDrives: 4, playId: null, message: 'Choose your opening play.',
        result: null, elapsed: 0, playElapsed: 0, kickAimIndex: 1, kickAim: 0,
        kickTargets: copy(KICK_TARGETS), passTarget: null, kickTarget: null,
        conversion: null, stats: emptyStats(), autoPlay: false,
        toss: null, kickoff: null, secondHalfReceiver: null, firstPossession: 'home', returnerId: null, returnFrom: null
      };
      this._formation();
      // With kickoffs on, a coin toss opens the game; practice skips it and you receive.
      if (this.options.kickoffs) { if (this.options.practice) { this.s.secondHalfReceiver = 'away'; this._setupKickoff('away'); } else this._startToss(); }
      return this.s;
    }
    setTeamNames(homeUnitName, awayUnitName) {
      const clean = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : fallback;
      this.teamNames = { home: clean(homeUnitName, 'BLUEBORG'), away: clean(awayUnitName, 'RUSTBOT') };
      this.s.players.forEach(p => { p.name = this.teamNames[p.team] + ' #' + p.number; });
      this._updateTargetInfo();
    }
    _direction() { return this.s.possession === 'home' ? 1 : -1; }
    _player(id) { return this.s.players.find(p => p.id === id); }
    _formation() {
      const s = this.s, d = this._direction(), z = s.fieldPosition;
      const offense = s.possession, defense = offense === 'home' ? 'away' : 'home';
      const op = [[0,-4], [0,0], [-1.65,0], [1.65,0], [-3.3,0], [3.3,0], [-19,0], [18,0], [-8,-1.4], [8,-1], [1,-7]];
      const dp = [[-5.2,2],[-1.7,2],[1.7,2],[5.2,2],[-11,7],[0,8],[11,7],[-20,13],[19,13],[-8,22],[8,22]];
      // A two-point try meets a goal-line defense packed near the end zone.
      if (s.conversion) [2,2,2,2,3.5,3.5,3.5,4.5,4.5,6,6].forEach((depth, i) => { dp[i] = [dp[i][0] * (i > 3 ? .7 : 1), Math.min(dp[i][1], depth)]; });
      s.players = roster.map((r, i) => ({
        id: offense + '-' + r[0], team: offense, role: r[0], number: r[1], name: r[2],
        x: op[i][0], z: clamp(z + op[i][1] * d, -7, 107),
        heading: d === 1 ? 0 : Math.PI, anim: 'idle'
      })).concat(defenders.map((r, i) => ({
        id: defense + '-' + r[0], team: defense, role: r[0], number: r[1], name: r[2],
        x: dp[i][0], z: clamp(z + dp[i][1] * d, -6, 106),
        heading: d === 1 ? Math.PI : 0, anim: 'idle'
      })));
      s.players.forEach(p => {
        p.name = (this.teamNames?.[p.team] || (p.team === 'home' ? 'BLUEBORG' : 'RUSTBOT')) + ' #' + p.number;
        p.assignment = p.team === offense ? ['C','LG','RG','LT','RT','WR1','WR2'].includes(p.role) ? 'Set on the line of scrimmage' : 'Set in the backfield' : 'Set on defense';
        p.goal = { x: p.x, z: p.z };
      });
      s.returnerId = null; s.kickReturn = null;
      if (offense === 'away' && DEFENSE_PLAYS.some(p => p.id === s.playId)) {
        this._player('home-MLB').z = z - (s.playId === 'blitz' ? 4 : s.playId === 'zone' ? 15 : 9);
        if (s.playId === 'contain') {
          this._player('home-LB1').x = -17; this._player('home-LB2').x = 17;
        } else if (s.playId === 'blitz') {
          ['home-LB1','home-LB2'].forEach(pid => { this._player(pid).z = z - 3; });
        } else if (s.playId === 'man') {
          // Press coverage: each corner lines up right on his receiver.
          [['CB1', -19], ['CB2', 18]].forEach(([role, x]) => Object.assign(this._player('home-' + role), { x: x, z: z - 2.5 }));
        }
        s.players.forEach(p => { p.goal = { x:p.x, z:p.z }; });
      }
      // A block call crowds the line; a return call sends a robot back to field the kick.
      if (offense === 'away' && SPECIAL_DEFENSE.some(p => p.id === s.playId)) {
        if (['puntblock', 'fgblock'].includes(s.playId)) ['LB1', 'MLB', 'LB2'].forEach((role, i) => Object.assign(this._player('home-' + role), { x: (i - 1) * 3.4, z: z - 1.6 }));
        else { Object.assign(this._player('home-FS'), { x: 0, z: s.playId === 'fgreturn' ? 1 : clamp(z - 42, 3, 97) }); s.returnerId = 'home-FS'; }
        s.players.forEach(p => { p.goal = { x:p.x, z:p.z }; });
      }
      s.lineOfScrimmage = z;
      s.firstDownLine = clamp(z + s.distance * d, 0, 100);
      s.carrierId = offense + '-QB';
      s.controlledId = offense === 'home' ? s.carrierId : 'home-MLB';
      s.ball = { x: 0, y: 1.35, z: this._player(s.carrierId).z, visible: true };
      s.targets = []; s.targetInfo = []; s.routes = []; this._reads = {}; this._coverPlans = null;
      s.passTarget = null; s.kickTarget = null; s.passerId = null; s.throwWindupRemaining = 0;
      this._routeTime = 0;
      s.handoff = null; s.tackle = null; s.resultRevealRemaining = 0;
      s.playElapsed = 0; s.countdown = 0; s.controlGrace = 0; s.nextPhase = null;
      s.defenseStage = null; s.defenseTargetId = null; s.opponentPlayType = null;
      s.placeKick = null;
      if (s.kickoff) this._kickoffFormation();
      else if (offense === 'away' && this._cpuKickChoice() === 'fieldgoal') this._placeKickSetup();
    }
    // Kickoff: the kicking team spreads across the line a yard behind the ball, with the
    // kicker seven yards back. The receivers set two deep returners, a front line ten
    // yards off the ball and blockers in between. Yard lines here count from the
    // receiving team's goal line.
    _kickoffFormation() {
      const s = this.s, k = s.kickoff, rd = this._direction(), kd = -rd, receiving = s.possession;
      const at = y => rd === 1 ? y : 100 - y, teeY = rd === 1 ? s.lineOfScrimmage : 100 - s.lineOfScrimmage;
      const deep = k.safety ? 30 : 4, front = { LT: -18, LG: -9, C: 0, RG: 9, RT: 18 };
      const back = { RB: [-2.5, deep], WR1: [5, deep + 3], QB: [0, deep + 20], SLOT: [-12, deep + 27], WR2: [12, deep + 27], TE: [0, deep + 30] };
      const lanes = { CB1: -22, LB1: -17, DE1: -12, DT1: -7.5, MLB: -3, SS: 3, DT2: 7.5, DE2: 12, LB2: 17, CB2: 22 };
      let kicker = null;
      s.players.forEach(p => {
        if (p.team === receiving) {
          if (front[p.role] !== undefined) { p.x = front[p.role]; p.z = at(teeY - 11); }
          else { p.x = back[p.role][0]; p.z = at(Math.min(teeY - 14, back[p.role][1])); }
          p.heading = rd === 1 ? 0 : Math.PI; p.assignment = 'Set up the kickoff return';
        } else if (lanes[p.role] !== undefined) {
          p.x = lanes[p.role]; p.z = at(teeY + 1); p.heading = rd === 1 ? Math.PI : 0; p.assignment = 'Cover the kickoff';
        } else {
          kicker = p; p.x = -1.2 * kd; p.z = at(teeY + (k.safety ? 8 : 7)); p.heading = rd === 1 ? Math.PI : 0; p.assignment = 'Kick off';
        }
        p.goal = { x: p.x, z: p.z };
      });
      s.returnerId = receiving + '-RB'; s.returnFrom = null; s.carrierId = null;
      s.controlledId = k.team === 'home' ? kicker.id : s.returnerId;
      if (k.safety) {
        // After a safety the free kick is punted from the kicker's hands.
        s.carrierId = kicker.id; this._followBall();
      } else {
        s.placeKick = { holderId: null, kickerId: kicker.id, spot: { x: 0, z: s.lineOfScrimmage }, start: { x: kicker.x, z: kicker.z }, struck: false, dir: kd, tee: true, approach: KICKOFF_APPROACH };
        s.ball = { x: 0, y: .36, z: s.lineOfScrimmage, visible: true };
      }
    }
    // Set the ball for a kickoff by `team`. The receiving team is the one that will have it.
    _setupKickoff(team, from = KICKOFF_SPOT) {
      const s = this.s;
      s.possession = team === 'home' ? 'away' : 'home';
      if (s.possessionNumber === 0) s.firstPossession = s.possession;
      s.kickoff = { team: team, from: from === SAFETY_KICK_SPOT ? SAFETY_KICK_SPOT : KICKOFF_SPOT, safety: from === SAFETY_KICK_SPOT, kind: 'deep' };
      s.toss = null; s.conversion = null; s.playId = null; s.result = null; s.down = 1; s.distance = 10;
      s.fieldPosition = team === 'home' ? s.kickoff.from : 100 - s.kickoff.from;
      this._flight = null; this._cpuPass = null; this._pending = null;
      this._formation();
      if (team === 'home') {
        s.phase = 'playcall'; s.message = s.kickoff.safety ? 'Free kick from your 20.' : 'Kick off to the visitors.';
        this._emit('ready', s.message);
      } else {
        s.phase = 'presnap'; s.countdown = SNAP_SECONDS; this._queuedPlay = 'cpukickoff'; s.nextPhase = 'kickflight';
        s.players.forEach(p => { p.anim = 'ready'; });
        s.message = s.kickoff.safety ? 'The visitors free kick from their 20.' : 'The visitors kick off to you.';
        this._emit('prepare', s.message);
      }
      return true;
    }
    _startToss() {
      const s = this.s;
      s.toss = 'call'; s.phase = 'playcall'; s.kickoff = null; s.conversion = null; s.playId = null; s.result = null;
      s.possession = 'home'; s.fieldPosition = 50; s.down = 1; s.distance = 10;
      this._formation();
      s.message = (s.overtime ? 'Overtime coin toss. ' : 'Coin toss. ') + 'Call it in the air.';
      this._emit('ready', s.message);
      return true;
    }
    _callToss(id) {
      const s = this.s, halves = this.options.format === 'regulation' && !s.overtime;
      if (s.toss === 'call') {
        const face = this._rand() < .5 ? 'heads' : 'tails', Face = face === 'heads' ? 'Heads' : 'Tails';
        if (face === id) { s.toss = 'choose'; s.message = Face + '. You win the toss.'; this._emit('toss', ''); return true; }
        // The visiting coach defers when there is a second half to receive; otherwise he takes the ball.
        if (halves) s.secondHalfReceiver = 'away';
        this._emit('toss', Face + '. The visitors win the toss' + (halves ? ' and defer. You receive the opening kickoff.' : ' and will receive. You kick off.'));
        return this._setupKickoff(halves ? 'away' : 'home');
      }
      if (id === 'receive') { if (halves) s.secondHalfReceiver = 'away'; return this._setupKickoff('away'); }
      if (id === 'defer') { s.secondHalfReceiver = 'home'; return this._setupKickoff('home'); }
      return this._setupKickoff('home');
    }
    // Basic mode tosses the coin for you: the game makes your call, and when you win
    // you receive. The visitors choose as they always do. Returns what to announce.
    autoToss() {
      const s = this.s;
      if (s.phase !== 'playcall' || !s.toss) return null;
      const halves = this.options.format === 'regulation' && !s.overtime, lead = s.overtime ? 'Overtime coin toss.' : 'Coin toss.';
      let won = true, face = null, call = null;
      if (s.toss === 'call') {
        call = this._rand() < .5 ? 'Heads' : 'Tails'; face = this._rand() < .5 ? 'Heads' : 'Tails'; won = call === face;
      }
      // With a second half to come, the visitors defer when they win, so you receive either way.
      const receive = won || halves;
      const detail = won ? 'You win the toss. You receive.' : halves ? 'The visitors win and defer. You receive.' : 'The visitors win and receive. You kick off.';
      const text = [lead, call && 'You call ' + call.toLowerCase() + '. It is ' + face.toLowerCase() + '.', won ? 'You win the toss and receive.' : halves ? 'The visitors win the toss and defer. You receive the opening kickoff.' : 'The visitors win the toss and will receive. You kick off.'].filter(Boolean).join(' ');
      if (halves) s.secondHalfReceiver = 'away';
      this._emit('toss', '');
      this._setupKickoff(receive ? 'away' : 'home');
      return { title: (s.overtime ? 'OVERTIME TOSS' : 'COIN TOSS') + (face ? ' · ' + face.toUpperCase() : ''), detail: detail, text: text, won: won };
    }
    // The visitors' fourth-down call, the same down-and-distance decisions as classic football.
    _cpuKickChoice() {
      const s = this.s;
      if (s.possession !== 'away' || s.conversion || s.kickoff || s.down < 4) return null;
      if (s.fieldPosition <= 38) return 'fieldgoal';
      if (s.distance > 4 && s.fieldPosition >= 55) return 'punt';
      return null;
    }
    // A holder kneels at the spot with the ball up on its point; the kicker stands
    // three steps back and two over, and the wide robots tuck in beside the line.
    _placeKickSetup() {
      const s = this.s, d = this._direction(), team = s.possession, los = s.lineOfScrimmage, spot = los - PLACE_KICK_SPOT * d;
      const holder = this._player(team + '-QB'), kicker = this._player(team + '-RB');
      Object.assign(holder, { x: .62 * d, z: spot, heading: Math.atan2(-.62 * d, 1.2 * d) });
      Object.assign(kicker, { x: -2.1 * d, z: spot - 3 * d, heading: Math.atan2(2.1 * d, 3 * d) });
      [['WR1', -5.1, -.7], ['WR2', 5.1, -.7], ['SLOT', -6.3, -1.7], ['TE', 6.3, -1.7]].forEach(([role, x, z]) => {
        const p = this._player(team + '-' + role); p.x = x; p.z = los + z * d; p.heading = d === 1 ? 0 : Math.PI;
      });
      s.players.forEach(p => { if (p.team === team) p.goal = { x: p.x, z: p.z }; });
      s.placeKick = { holderId: holder.id, kickerId: kicker.id, spot: { x: 0, z: spot }, start: { x: kicker.x, z: kicker.z }, struck: false };
      s.ball = { x: 0, y: .24, z: spot, visible: true };
      if (team === 'home') s.controlledId = kicker.id;
    }
    // The run-up: a curved approach to the plant foot, then the swing lands at contact.
    _stepApproach(f) {
      const s = this.s, k = s.placeKick, kicker = this._player(k.kickerId), d = k.dir || this._direction(), approach = (k.approach || KICK_APPROACH) * this.options.pace;
      const pace = this.options.pace, lead = KICK_CONTACT * pace, plant = { x: k.spot.x - .16 * d, z: k.spot.z - .42 * d };
      const t = clamp((f.elapsed + approach) / (approach - lead), 0, 1), ease = t * t * (3 - 2 * t);
      const x = k.start.x + (plant.x - k.start.x) * ease, z = k.start.z + (plant.z - k.start.z) * ease;
      kicker.heading = t < .7 ? Math.atan2(plant.x - x, plant.z - z || d * .01) : d === 1 ? 0 : Math.PI;
      kicker.x = x; kicker.z = z;
      if (f.elapsed >= -lead && kicker.anim !== 'kick') kicker.anim = 'kick';
    }
    // The plays that can be called right now: the normal playbook, the two
    // after-touchdown choices, the run/pass plays of a two-point try, or defense.
    playbook() {
      const s = this.s;
      if (s.phase !== 'playcall') return [];
      if (s.toss === 'call') return TOSS_CALLS.slice();
      if (s.toss === 'choose') return this.options.format === 'regulation' && !s.overtime ? [TOSS_CHOICES.receiveHalf, TOSS_CHOICES.defer] : [TOSS_CHOICES.receive, TOSS_CHOICES.kick];
      // An onside kick is there when you are behind.
      if (s.kickoff) return s.kickoff.team === 'home' ? KICKOFF_PLAYS.filter(p => p.id !== 'onside' || (!s.kickoff.safety && s.homeScore < s.awayScore)) : [];
      if (s.possession === 'away') {
        const kick = this._cpuKickChoice();
        return (kick === 'punt' ? PUNT_DEFENSE : kick === 'fieldgoal' ? FIELD_GOAL_DEFENSE : DEFENSE_PLAYS).slice();
      }
      if (s.conversion === 'choose') return CONVERSION_CHOICES.slice();
      if (s.conversion === 'two') return PLAYS.filter(p => p.type !== 'kick');
      return PLAYS.filter(p => !p.conversion);
    }
    callPlay(id) {
      const s = this.s;
      if (s.phase !== 'playcall') return false;
      const play = this.playbook().find(p => p.id === id);
      if (!play) return false;
      if (s.toss) return this._callToss(id);
      if (s.kickoff) {
        s.playId = id; s.kickoff.kind = id === 'onside' ? 'onside' : 'deep'; s.result = null;
        this._queuedPlay = id; s.phase = 'presnap'; s.countdown = SNAP_SECONDS; s.nextPhase = 'kickaim';
        s.players.forEach(p => { p.anim = 'ready'; });
        s.message = 'Get set. ' + play.label + '.'; this._emit('prepare', s.message);
        return true;
      }
      if (id === 'gofortwo') {
        s.conversion = 'two'; s.playId = null; s.result = null;
        s.fieldPosition = 100 - TWO_POINT_SPOT; s.down = 1; s.distance = TWO_POINT_SPOT; this._formation();
        s.message = 'Going for two. Choose a run or a pass from the 2-yard line.';
        this._emit('ready', s.message); return true;
      }
      if (id === 'extrapoint') {
        s.conversion = 'kick'; s.fieldPosition = 100 - EXTRA_POINT_SPOT; s.down = 1; s.distance = EXTRA_POINT_SPOT;
      }
      s.playId = id; s.result = null; this._formation();
      this._runTime = 0; this._flight = null; this._cpuPass = null;
      this._queuedPlay = id;
      s.phase = 'presnap'; s.countdown = SNAP_SECONDS;
      s.nextPhase = s.possession === 'away' ? 'defend' : play.type === 'pass' ? 'aim' : play.type === 'run' ? 'run' : 'kickaim';
      s.message = 'Get set. ' + (id === 'extrapoint' ? 'Extra point' : play.name) + '.';
      s.players.forEach(p => { p.anim = 'ready'; });
      if (s.possession === 'home' && play.type === 'kick' && id !== 'punt') this._placeKickSetup();
      if (s.possession === 'home' && play.type === 'pass') this._alignCoverage();
      this._emit('prepare', s.message);
      return true;
    }
    _startHandoff(rb) {
      const s = this.s, qb = this._player(s.possession + '-QB');
      s.carrierId = qb.id;
      s.handoff = { quarterbackId: qb.id, runnerId: rb.id, elapsed: 0,
        transferAt: .95, duration: CONTROL_GRACE,
        qbStart: { x: qb.x, z: qb.z }, rbStart: { x: rb.x, z: rb.z } };
      qb.assignment = 'Present the handoff'; rb.assignment = 'Take the handoff and follow the running lane';
    }
    _stepHandoff(dt) {
      const s = this.s, h = s.handoff, d = this._direction();
      if (!h) return;
      h.elapsed = Math.min(h.duration, h.elapsed + dt);
      const qb = this._player(h.quarterbackId), rb = this._player(h.runnerId);
      const t = clamp(h.elapsed / h.transferAt, 0, 1), ease = t * t * (3 - 2 * t);
      const meet = { x: .8, z: s.lineOfScrimmage - 4.5 * d };
      qb.x = h.qbStart.x + (-.1 - h.qbStart.x) * ease;
      qb.z = h.qbStart.z + (meet.z - .25 * d - h.qbStart.z) * ease;
      rb.x = h.rbStart.x + (meet.x - h.rbStart.x) * ease;
      rb.z = h.rbStart.z + (meet.z - h.rbStart.z) * ease + Math.max(0, h.elapsed - h.transferAt) * 1.2 * d;
      qb.heading = Math.atan2(rb.x - qb.x, rb.z - qb.z); qb.anim = 'handoff';
      rb.heading = d === 1 ? 0 : Math.PI; rb.anim = t < 1 ? 'run' : 'carry';
      qb.goal = { x: meet.x, z: meet.z }; rb.goal = { x: this._runLane || this._cpuLane || 0, z: s.lineOfScrimmage + d * 5 };
      if (h.elapsed >= h.transferAt) s.carrierId = rb.id;
      this._separate([qb.id, rb.id], [qb.id, rb.id]);
      s.players.forEach(p => {
        if (p.id === qb.id || p.id === rb.id) return;
        if (p.team === s.possession) {
          const line = ['C','LG','RG','LT','RT'].includes(p.role);
          p.assignment = line ? 'Fire off the line and seal a running lane' : 'Release and block downfield';
          this._moveToward(p, p.goal.x, s.lineOfScrimmage + d * (line ? .5 : 2.2), line ? 1.2 : 2.1, dt);
          if (line) { p.heading = d === 1 ? 0 : Math.PI; p.anim = 'block'; }
        } else {
          const line = p.role.startsWith('D');
          const depth = line ? 1.8 : p.role.startsWith('CB') ? 8 + (p.depth || 0) * .5 : ['FS','SS'].includes(p.role) ? 15 + (p.depth || 0) : 5.5 + (p.depth || 0) * .3;
          p.assignment = line ? 'Engage the blocker and contain the run' : 'Read the handoff and keep pursuit leverage';
          this._moveToward(p, p.goal.x * .98 + (line ? 0 : (p.lean || 0) * .05), s.lineOfScrimmage + d * depth, line ? 1.2 : 2.2, dt);
          if (line) { p.heading = d === 1 ? Math.PI : 0; p.anim = 'block'; }
        }
      });
      this._followBall();
    }
    _beginTackle(carrier, tackler, reason) {
      const s = this.s, d = this._direction();
      s.phase = 'tackle'; s.controlGrace = 0;
      s.tackle = { carrierId: carrier.id, tacklerId: tackler.id,
        elapsed: 0, duration: 1.4, spot: carrier.z, reason: reason,
        startX: carrier.x, startZ: carrier.z, tacklerX: tackler.x, tacklerZ: tackler.z,
        pushX: Math.sin(carrier.heading) * .55, pushZ: d * .7 };
      carrier.anim = 'down'; carrier.assignment = 'Protect the ball through contact';
      tackler.anim = 'tackle'; tackler.assignment = 'Wrap and finish the tackle';
      tackler.heading = Math.atan2(carrier.x - tackler.x, carrier.z - tackler.z);
      if (reason === 'Sack!') this._stat(tackler.team, 'sacks', 1);
      this._emit('tackle', reason === 'Sack!' ? 'Quarterback sacked.' : 'Tackle made.');
    }
    _stepTackle(dt) {
      const s = this.s, t = s.tackle;
      if (!t) return;
      t.elapsed = Math.min(t.duration, t.elapsed + dt);
      const progress = clamp(t.elapsed / .8, 0, 1), ease = 1 - Math.pow(1 - progress, 2);
      const p = this._player(t.carrierId), q = this._player(t.tacklerId);
      p.x = t.startX + t.pushX * ease; p.z = t.startZ + t.pushZ * ease;
      const close = Math.min(1, t.elapsed / .32);
      q.x = t.tacklerX + (t.startX - t.tacklerX) * close * .62 + t.pushX * ease;
      q.z = t.tacklerZ + (t.startZ - t.tacklerZ) * close * .62 + t.pushZ * ease;
      p.anim = 'down'; q.anim = 'tackle';
      this._separate([p.id, q.id], [p.id, q.id]);
      s.players.forEach(other => {
        if (other.id === p.id || other.id === q.id) return;
        const gap = distance(other, p);
        if (gap < 7 && gap > 2.8 && t.elapsed < .7) {
          const dx = (other.x - p.x) / gap, dz = (other.z - p.z) / gap;
          this._moveToward(other, p.x + dx * 2.7, p.z + dz * 2.7, 2.2 * (1 - progress), dt);
          other.assignment = 'Finish pursuit at the whistle';
        } else { other.anim = 'ready'; other.heading = Math.atan2(p.x - other.x, p.z - other.z); }
      });
      this._followBall();
      // Forward progress: the ball is spotted where he was hit, not where the fall shoved him.
      // But a runner who goes down with the ball over the goal line has broken the plane: touchdown.
      if (t.elapsed >= t.duration - 1e-7) {
        const d = this._direction(), reach = p.z + Math.cos(p.heading) * FALL_REACH;
        const over = (d === 1 ? reach >= 100 : reach <= 0) && !(this.options.practice && s.possession === 'away');
        this._finishPlay(over ? reach : t.spot, t.reason);
      }
    }
    _armControl() {
      this.s.controlGrace = CONTROL_GRACE;
      this._controlRamp = 0; this._switchCheck = 0; this._idle = 0; this._lean = 0;
      // Every play reads a little differently: reaction, burst and how long blocks hold.
      const tune = this._tune();
      this.s.players.forEach(q => {
        if (q.team === this.s.possession) return;
        const goalLine = this.s.conversion ? .6 : 1;
        q.react = (.2 + this._rand() * .35) * goalLine; q.burst = .93 + this._rand() * .12; q.shedAt = tune.shed * (.65 + this._rand() * .7) * goalLine;
        q.depth = (this._rand() * 2 - 1) * 3; q.lean = (this._rand() * 2 - 1) * 3;
      });
    }
    _executePlay(id) {
      const s = this.s;
      s.countdown = 0; s.nextPhase = null;
      if (s.kickoff) return this._startKickoff();
      if (s.possession === 'away') return id === 'extrapoint' ? this._startCpuKick('extrapoint') : this._startDefense(id);
      const play = PLAYS.find(p => p.id === id);
      if (!play) return false;
      s.players.forEach(p => { p.anim = 'idle'; });
      if (play.type === 'kick') {
        // Field goals and extra points start the aim at a far post, so you sweep it onto the target.
        const edge = id === 'punt' ? 0 : this._rand() < .5 ? -1 : 1;
        s.phase = 'kickaim'; s.kickAim = edge; s.kickAimIndex = Math.round(edge + 1); s.kickWindow = this.kickWindow();
        s.message = id === 'punt' ? 'Choose a punt lane. Take your time.' : id === 'extrapoint' ? 'Aim the extra point. Center is the safest target.' : 'Choose your kick aim. Center is the safest target.';
        this._emit('snap', s.message);
        return true;
      }
      if (play.type === 'run') {
        const rb = this._player('home-RB');
        s.controlledId = rb.id; s.phase = 'run'; this._runLane = play.lane;
        this._armControl(); this._startHandoff(rb);
        s.message = 'Follow your blockers. Get ready to steer toward open space.';
        this._followBall(); this._emit('snap', s.message);
        return true;
      }
      s.phase = 'aim'; s.selectedTarget = 0;
      s.targets = ['home-WR1', 'home-WR2', 'home-SLOT', 'home-TE'];
      this._buildRoutes(play, 'home');
      this._updateTargetInfo();
      s.message = 'Receivers are running their routes. Choose a receiver when you are ready.';
      this._emit('snap', s.message);
      return true;
    }
    _buildRoutes(play, team) {
      const s = this.s, d = this._direction();
      this._routeTime = 0;
      s.players.forEach(p => {
        p.assignment = p.team === team ? p.role === 'QB' ? 'Drop into the protected passing pocket' : p.role === 'RB' ? 'Protect the quarterback' : ['C','LG','RG','LT','RT'].includes(p.role) ? 'Pass protect against the rush' : 'Run the called route' : p.role.startsWith('D') ? 'Rush through the blocking front' : ['CB1','CB2','SS'].includes(p.role) || (team === 'home' && p.role === 'LB2') ? 'Cover the receiver' : p.role === 'FS' ? 'Keep the top on the play as the deep safety' : 'Patrol the middle passing zone';
      });
      s.routes = ['WR1','WR2','SLOT','TE'].map((role, i) => {
        const p = this._player(team + '-' + role), r = play.routes[i];
        const stem = play.id === 'verticals' ? Math.min(14, r[3] * .55) :
          play.id === 'flood' && i < 2 ? Math.min(14, r[3] * .7) : Math.min(5, r[3] * .42);
        const points = [
          { x: p.x, z: p.z },
          { x: p.x, z: clamp(s.lineOfScrimmage + d * stem, -2, 102) },
          { x: r[2], z: clamp(s.lineOfScrimmage + d * r[3], -2, 102) }
        ];
        const lengths = points.slice(1).map((point, k) => distance(points[k], point));
        return { playerId: p.id, points: points, lengths: lengths,
          length: lengths.reduce((sum, n) => sum + n, 0), speed: [6.5,6.3,6.1,5.9][i],
          side: i % 2 ? -1 : 1, direction: d };
      });
    }
    _routePoint(route, time) {
      let travel = Math.max(0, time) * route.speed;
      for (let i = 0; i < route.lengths.length; i++) {
        const length = route.lengths[i];
        if (travel <= length && length > .0001) {
          const a = route.points[i], b = route.points[i + 1], t = travel / length;
          return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        }
        travel -= length;
      }
      // Keep working the soft spot after the route. No deadline, looping sprint,
      // teleport back to the line, or receiver wandering out of bounds.
      const end = route.points[route.points.length - 1];
      const settle = Math.max(0, time - route.length / route.speed);
      return { x: clamp(end.x + Math.sin(settle * 1.1) * 1.15 * route.side, -25, 25),
        z: clamp(end.z + (1 - Math.cos(settle * .9)) * .36 * route.direction, -2, 102) };
    }
    _advanceRoutes(dt) {
      this._routeTime += dt;
      this.s.routes.forEach(route => {
        const p = this._player(route.playerId), point = this._routePoint(route, this._routeTime);
        const dx = point.x - p.x, dz = point.z - p.z;
        if (Math.hypot(dx, dz) > .00001) p.heading = Math.atan2(dx, dz);
        p.x = point.x; p.z = point.z; p.anim = 'run';
        p.assignment = 'Run route, then work the open zone'; p.goal = { x: point.x, z: point.z };
      });
    }
    _stepPocket(dt) {
      const s = this.s, time = this._routeTime, qb = this._player('home-QB');
      if (!this._flight) {
        this._moveToward(qb, Math.sin(time * .65) * .7,
          s.lineOfScrimmage - 6.5, 2.25, dt);
        qb.heading = 0; if (time > 1.2) qb.anim = 'ready';
      } else if (s.throwWindupRemaining > 0) qb.anim = 'throw';
      else qb.anim = 'ready';
      const lines = ['LT','LG','C','RG','RT'];
      const rushers = ['DE1','DT1','DT2','DE2'];
      lines.forEach((role, i) => {
        const p = this._player('home-' + role), x = (i - 2) * 1.65;
        const z = s.lineOfScrimmage - (Math.abs(i - 2) * .35 + .35) + Math.sin(time * 1.2 + i) * .15;
        this._moveToward(p, x + Math.sin(time * .75 + i) * .25, z, 1.6, dt);
        p.heading = 0; p.anim = 'block';
      });
      rushers.forEach((role, i) => {
        const p = this._player('away-' + role), blocker = this._player('home-' + ['LT','LG','RG','RT'][i]);
        this._moveToward(p, blocker.x + Math.sin(time * .9 + i) * .35, blocker.z + 1.35, 2.8, dt);
        if (distance(p, blocker) < 2) { p.anim = 'block'; p.heading = Math.PI; }
      });
      const rb = this._player('home-RB');
      this._moveToward(rb, 2.4 + Math.sin(time * .65) * .35, s.lineOfScrimmage - 3.5, 2.5, dt);
      rb.heading = 0; rb.anim = 'block';
      // Two linebackers patrol the short middle; LB2 carries the tight end.
      ['LB1','MLB'].forEach((role, i) => {
        const p = this._player('away-' + role);
        this._moveToward(p, (i ? 4 : -6) + Math.sin(time * .6 + i) * 1.8,
          s.lineOfScrimmage + 6.5 + Math.cos(time * .7 + i), 3.1, dt);
      });
    }
    _stepHomePass(dt, realDt = 0) {
      this._advanceRoutes(dt);
      const s = this.s, time = this._routeTime, tune = this._tune();
      let deepest = s.lineOfScrimmage, centerX = 0;
      const plans = this._coverPlans || (this._coverPlans = s.routes.map(() => this._nextCoverage(null)));
      s.routes.forEach((route, i) => {
        const p = this._player(route.playerId), cover = this._player(['away-CB1','away-CB2','away-SS','away-LB2'][i]);
        if (s.phase === 'aim') { plans[i].left -= realDt; if (plans[i].left <= 0) plans[i] = this._nextCoverage(plans[i].state); }
        // He plays mostly beside the receiver, a little over the top, at the planned distance:
        // from behind the quarterback, a gap to the side is the one you can see.
        const cushion = COVER_CUSHION[plans[i].state];
        this._moveToward(cover, clamp(p.x + route.side * cushion * .92, -25.5, 25.5),
          clamp(p.z + route.direction * cushion * .4, -4, 104), Math.min(7.95, Math.max([6.3,6.3,5.8,5.4][i], route.speed * 1.3)), dt);
        deepest = Math.max(deepest, p.z); centerX += p.x / 4;
      });
      // The free safety keeps the top on the play, so a catch is rarely a free run.
      // Once the ball is in the air both safeties break toward the throw.
      const safety = this._player('away-FS'), ball = s.phase === 'flight' && s.passTarget;
      if (ball) ['away-FS','away-SS'].forEach(id => {
        const q = this._player(id), mark = this._player(this._flight && this._flight.targetId);
        if (id === 'away-SS' && mark && mark.id === 'home-SLOT') return;
        this._moveToward(q, ball.x, ball.z + 2, ROLE_SPEED[q.role] * tune.pursuit * .9, dt);
      });
      else this._moveToward(safety, clamp(centerX * .45 + Math.sin(time * .5) * 2.4, -18, 18),
        clamp(Math.max(s.lineOfScrimmage + 15, deepest + 5.5), -4, 106), 5.4, dt);
      this._stepPocket(dt);
      // Receivers keep their routes and the passer his pocket; everyone else gives way.
      this._separate(s.routes.map(r => r.playerId).concat('home-QB'));
      this._updateTargetInfo(realDt);
      if (s.phase === 'aim') this._followBall();
    }
    // At the line, each defender already plays the coverage he will start with: pressed on
    // the receiver, three and a half yards off, or soft six yards off. The first read is real.
    _alignCoverage() {
      const s = this.s, d = this._direction();
      this._coverPlans = ['WR1', 'WR2', 'SLOT', 'TE'].map(() => this._nextCoverage(null));
      ['WR1', 'WR2', 'SLOT', 'TE'].forEach((role, i) => {
        const p = this._player('home-' + role), cover = this._player('away-' + COVERS[i]), c = COVER_CUSHION[this._coverPlans[i].state];
        cover.x = clamp(p.x + (i % 2 ? -1 : 1) * c * .6, -25.5, 25.5); cover.z = clamp(Math.max(s.lineOfScrimmage + d * 1.2, p.z + d * c * .8) * d * d, -4, 104);
        cover.heading = d === 1 ? Math.PI : 0; cover.goal = { x: cover.x, z: cover.z };
      });
    }
    // The next coverage plan: a first look, then always one step from the last.
    _nextCoverage(previous) {
      const pro = this.options.difficulty === 'pro', r = this._rand();
      let state = !previous ? (r < (pro ? .3 : .45) ? 'Open' : r < (pro ? .75 : .85) ? 'Covered' : 'Tight')
        : previous !== 'Covered' ? 'Covered' : r < (pro ? .45 : .6) ? 'Open' : 'Tight';
      // Goal-line windows are small on a two-point try.
      if (this.s.conversion && state === 'Open' && this._rand() < .6) state = 'Covered';
      return { state: state, left: COVER_PLAN_SECONDS[0] + this._rand() * (COVER_PLAN_SECONDS[1] - COVER_PLAN_SECONDS[0]) };
    }
    // The football leaves exactly where the rendered throwing hand releases it.
    _throwOrigin(qb) {
      return { x: qb.x + Math.cos(qb.heading) * .30 + Math.sin(qb.heading) * .44,
        y: 1.75, z: qb.z - Math.sin(qb.heading) * .30 + Math.cos(qb.heading) * .44 };
    }
    _makePass(kind, qb, target, chance, separation) {
      const s = this.s, route = s.routes.find(r => r.playerId === target.id);
      // Solve the lead once at release intent. The receiver continues the same
      // route; the airborne football follows one fixed ballistic arc.
      let duration = clamp(distance(qb, target) / 20, .85, 1.85), point = target;
      for (let i = 0; i < 5; i++) {
        point = route ? this._routePoint(route, this._routeTime + THROW_WINDUP * this.options.pace + duration) : target;
        duration = clamp(distance(qb, point) / 20, .85, 1.85);
      }
      const arrival = this._routeTime + THROW_WINDUP * this.options.pace + duration;
      point = route ? this._routePoint(route, arrival) : target;
      const to = { x: point.x, y: 1.5, z: point.z };
      qb.heading = Math.atan2(to.x - qb.x, to.z - qb.z);
      this._flight = { kind: kind, elapsed: 0, duration: duration,
        from: this._throwOrigin(qb), to: to, targetId: target.id,
        chance: chance, separation: separation, routeArrival: arrival };
      s.passerId = qb.id; s.throwWindupRemaining = THROW_WINDUP;
      s.passTarget = copy(to); qb.anim = 'throw';
      s.carrierId = null;
      Object.assign(s.ball, this._flight.from, { vx: 0, vy: 0, vz: 0 });
    }
    // `realDt` ages the reads; the throw itself refreshes without aging them.
    _updateTargetInfo(realDt = 0) {
      const s = this.s, reads = this._reads || (this._reads = {});
      s.targetInfo = s.targets.map((id, i) => {
        const p = this._player(id), cover = this._player((s.possession === 'home' ? 'away-' : 'home-') + COVERS[i]);
        const own = cover ? distance(p, cover) : Infinity;
        // Linemen rushing the passer are not covering anybody.
        const other = Math.min.apply(null, s.players.filter(q => q.team !== s.possession && q !== cover && !/^D[ET]\d$/.test(q.role)).map(q => distance(p, q)));
        const read = reads[id] || (reads[id] = { openness: null, pending: 0, near: 0, counts: false });
        // Once he has lingered he counts until he has been gone about as long.
        const close = other < own && other < COVERAGE_GAP.Open[0];
        read.near = close ? Math.min(PASSING_BY * 1.5, read.near + realDt) : Math.max(0, read.near - realDt);
        read.counts = read.counts ? read.near > 0 : read.near >= PASSING_BY;
        const gap = read.openness === null || read.counts ? Math.min(own, other) : own;
        let now = gap >= COVERAGE_GAP.Open[0] ? 'Open' : gap >= COVERAGE_GAP.Covered[0] ? 'Covered' : 'Tight';
        if (read.openness === null) read.openness = now;
        const was = read.openness;
        // A defender right on a boundary keeps the read he had.
        if (was === 'Open' && now === 'Covered' && gap > 4.2 || was === 'Covered' && now === 'Open' && gap < 4.8 ||
            was === 'Covered' && now === 'Tight' && gap > 2.3 || was === 'Tight' && now === 'Covered' && gap < 2.9) now = was;
        // He is never called more open than every defender near him allows: only a
        // tighter read waits for a defender who is just passing by.
        const all = Math.min(own, other), allRead = all >= COVERAGE_GAP.Open[0] ? 0 : all >= COVERAGE_GAP.Covered[0] ? 1 : 2;
        if (COVERAGE.indexOf(now) < COVERAGE.indexOf(was)) now = COVERAGE[Math.max(COVERAGE.indexOf(now), Math.min(COVERAGE.indexOf(was), allRead))];
        if (now === was) read.pending = 0;
        else if ((read.pending += realDt) >= READ_CONFIRM) { read.openness = now; read.pending = 0; }
        // The chance is judged from a gap inside the band of the read being shown.
        const band = COVERAGE_GAP[read.openness], judged = clamp(gap, band[0], band[1]);
        const deep = Math.max(0, (p.z - s.lineOfScrimmage) * this._direction() - 12) * 0.016;
        // End-zone windows are tight on a two-point try.
        const goalLine = s.conversion ? .12 : 0;
        const chance = this.options.practice ? 1 : clamp((this.options.difficulty === 'pro' ? 0.48 : 0.62) + judged * 0.042 - deep - goalLine, 0.35, 0.98);
        return { id: id, name: p.name, number: p.number,
          yards: Math.round((p.z - s.lineOfScrimmage) * this._direction()),
          openness: read.openness, catchChance: chance, separation: judged };
      });
    }
    // Choosing a receiver keeps his defender where he is for three more seconds, and
    // charging a throw to him keeps him there until the ball is gone: what you heard stays true.
    selectTarget(index) {
      if (this.s.phase !== 'aim' || !Number.isInteger(index) || index < 0 || index >= this.s.targets.length) return false;
      this.s.selectedTarget = index; this.keepRead(index, 3); return true;
    }
    keepRead(index, seconds = 1.5) {
      const plan = this._coverPlans && this._coverPlans[index];
      if (!plan) return false;
      plan.left = Math.max(plan.left, seconds); return true;
    }
    // `power` comes from the charge line (see CHARGE_ZONE); without it the pass is thrown just right.
    throwPass(power) {
      const s = this.s;
      if (s.phase !== 'aim') return false;
      const target = this._player(s.targets[s.selectedTarget]), qb = this._player(s.carrierId);
      this._updateTargetInfo();
      const info = s.targetInfo[s.selectedTarget];
      this._makePass('pass', qb, target, info.catchChance, info.separation);
      // A ball led deep downfield is harder to catch than the read suggests.
      const depth = (this._flight.to.z - s.lineOfScrimmage) * this._direction(), read = Math.max(12, info.yards);
      if (!this.options.practice) this._flight.chance = clamp(info.catchChance - Math.max(0, depth - read) * .016, .3, .98);
      // Like the classic game, a pass can only be caught when it is let go on the green
      // part of the line. Practice teaches that timing too; it only removes drops and picks.
      if (finite(power)) {
        const f = this._flight, dx = f.to.x - f.from.x, dz = f.to.z - f.from.z, len = Math.hypot(dx, dz) || 1;
        if (power > CHARGE_ZONE[1]) {
          // Held too long: the ball sails over the receiver's head.
          const extra = 3 + (power - CHARGE_ZONE[1]) * 20;
          f.to = { x: clamp(f.to.x + dx / len * extra, -SIDE, SIDE), y: f.to.y, z: clamp(f.to.z + dz / len * extra, -8, 108) };
          f.over = true; f.chance = 0; s.passTarget = copy(f.to);
        } else if (power < CHARGE_ZONE[0]) {
          // Let go before the line reached him: the ball comes down short, where the line ended.
          // Within about a yard he can still dive for it; any shorter and it hits the grass.
          const reach = clamp(power / CHARGE_ZONE[0], .2, 1), shortBy = (1 - reach) * len;
          f.to = { x: f.from.x + dx * reach, y: .2, z: f.from.z + dz * reach };
          f.duration *= .6 + .4 * reach; f.short = true; s.passTarget = copy(f.to);
          f.chance = shortBy <= SHORT_CATCH_YARDS ? f.chance * .35 : 0;
        }
      }
      s.phase = 'flight'; s.controlledId = null;
      this._emit('throw', 'Pass to ' + target.name + '.'); return true;
    }
    chooseKick(index) {
      if (this.s.phase !== 'kickaim' || !Number.isInteger(index) || index < 0 || index > 2) return false;
      this.s.kickAimIndex = index; this.s.kickAim = index - 1; return true;
    }
    setKickAim(value) {
      if (this.s.phase !== 'kickaim' || !finite(value)) return false;
      this.s.kickAim = clamp(value, -1, 1);
      this.s.kickAimIndex = Math.round(this.s.kickAim + 1);
      return true;
    }
    // The window around the centre where a place kick splits the uprights. Longer kicks narrow it.
    kickWindow() {
      if (this.s.playId === 'punt') return 1;
      return clamp(.55 - Math.max(0, 100 - this.s.lineOfScrimmage + 17 - 20) * .006, .25, .55);
    }
    // Your kickoff waits for the charge; the visitors kick deep, or onside when behind late.
    _startKickoff() {
      const s = this.s, k = s.kickoff;
      s.players.forEach(p => { p.anim = 'idle'; });
      if (k.team === 'home') {
        s.phase = 'kickaim'; s.kickAim = 0; s.kickAimIndex = 1; s.kickWindow = 1;
        this._emit('snap', ''); return true;
      }
      const late = this.options.format === 'regulation' && s.quarter === 4 && !s.overtime && s.timeRemaining < 120;
      k.kind = !k.safety && late && s.awayScore < s.homeScore && s.homeScore - s.awayScore <= 16 ? 'onside' : 'deep';
      return this._kickoffKick(Math.min(1, .72 + this._rand() * .4) * CHARGE_ZONE[0]);
    }
    // The charge sets the distance: a full kick lands deep in the end zone.
    _kickoffKick(power) {
      const s = this.s, k = s.kickoff, rd = this._direction(), home = k.team === 'home';
      const strength = finite(power) ? clamp(power / CHARGE_ZONE[0], 0, 1) : 1, onside = k.kind === 'onside', teeY = 100 - k.from;
      // Where it comes down, in yards from the receiving goal line.
      const land = onside ? teeY - (10.5 + this._rand() * 2)
        : k.safety ? teeY - (35 + 12 * strength + this._rand() * 6)
        : !finite(power) ? (this._rand() < EASY_KICKOFF_TOUCHBACK ? -(4 + this._rand() * 4) : 3 + this._rand() * 7)
        : clamp(teeY - (40 + 26 * strength + this._rand() * 8), -8, 60);
      const kicker = this._player(s.placeKick ? s.placeKick.kickerId : s.carrierId);
      const from = s.placeKick ? { x: s.placeKick.spot.x, y: s.ball.y, z: s.placeKick.spot.z } : { x: kicker.x, y: .9, z: kicker.z };
      const to = { x: clamp(from.x + (this._rand() - .5) * (onside ? 8 : 16), -18, 18), y: onside ? .2 : 1.3, z: rd === 1 ? land : 100 - land };
      const call = home ? (onside ? 'Onside kick!' : k.safety ? 'Free kick away.' : 'Kickoff!') : onside ? 'The visitors try an onside kick!' : k.safety ? 'The free kick is away.' : 'Here comes the kick.';
      this._flight = { kind: 'kickoff', elapsed: s.placeKick ? -KICKOFF_APPROACH * this.options.pace : 0, duration: onside ? 1.2 : k.safety ? 2.6 : 2.8, from: from, to: to, onside: onside, call: s.placeKick ? call : null };
      s.kickTarget = copy(to); s.phase = 'kickflight'; s.carrierId = null;
      if (!s.placeKick) { kicker.anim = 'kick'; this._emit('kick', call); }
      return true;
    }
    // While the ball is up, the coverage sprints down in lanes and the receivers set a wall.
    _stepKickoffCoverage(dt) {
      const s = this.s, f = this._flight, rd = this._direction();
      if (!f || f.kind !== 'kickoff' || f.elapsed < 0) return;
      const t = clamp(f.elapsed / f.duration, 0, 1), land = f.to;
      s.players.forEach(p => {
        if (p.id === s.returnerId) {
          this._moveToward(p, land.x, land.z, 7, dt);
          p.heading = rd === 1 ? 0 : Math.PI; if (f.duration - f.elapsed < .45) p.anim = 'catch';
        } else if (p.team === s.possession) {
          const line = ['LT','LG','C','RG','RT'].includes(p.role), wall = line ? 13 : p.role === 'WR1' ? 4 : 8;
          // Backpedal into the wall, still facing the coverage.
          this._moveToward(p, p.x * .97 + land.x * .03, land.z + rd * wall, line ? 9 : 8, dt); p.heading = rd === 1 ? 0 : Math.PI;
        } else {
          const lane = p.goal && p.goal.lane !== undefined ? p.goal.lane : p.x;
          this._moveToward(p, lane * (1 - t * .6) + land.x * t * .6, land.z + rd * 3, (ROLE_SPEED[p.role] || 6.5) * 1.15, dt);
          p.goal.lane = lane;
        }
      });
      this._separate([s.returnerId]);
    }
    // While the visitors kick: on a block call your rushers go for the kicker; on a return
    // call your returner drifts under the ball with a wall in front of him, and their punt
    // coverage runs down the field.
    _stepKickDefense(dt) {
      const s = this.s, f = this._flight;
      if (!f || !['cpu-punt', 'cpu-fieldgoal'].includes(f.kind)) return;
      const rush = ['puntblock', 'fgblock'].includes(s.playId), returner = this._player(s.returnerId), land = f.to;
      const t = clamp(f.elapsed / f.duration, 0, 1), front = p => /^(D|LB|MLB)/.test(p.role);
      s.players.forEach(p => {
        if (p.team === 'home') {
          if (returner && p.id === returner.id) {
            this._moveToward(p, land.x, land.z, 7, dt); p.heading = 0; p.assignment = 'Field the kick';
            if (f.duration - f.elapsed < .45) p.anim = 'catch';
          } else if (rush && front(p)) {
            this._moveToward(p, f.from.x + clamp(p.x - f.from.x, -3, 3) * .5, f.from.z - 1.2, 3.2, dt); p.assignment = 'Rush and block the kick';
          } else if (returner && f.kind === 'cpu-punt') {
            this._moveToward(p, p.x * .97 + land.x * .03, land.z + (front(p) ? 13 : 8), front(p) ? 6 : 7, dt); p.heading = 0; p.assignment = 'Set the return wall';
          }
        } else if (f.kind === 'cpu-punt' && !f.blocked && f.elapsed > 0 && p.role !== 'QB') {
          const lane = p.goal && p.goal.lane !== undefined ? p.goal.lane : p.x;
          this._moveToward(p, lane * (1 - t * .6) + land.x * t * .6, land.z + 3, (ROLE_SPEED[p.role] || 6.5) * 1.35, dt);
          p.goal.lane = lane;
        }
      });
      // Rushers crowd the holder and kicker but never shove them off the spot.
      this._separate([returner && returner.id, s.placeKick && s.placeKick.holderId, s.placeKick && s.placeKick.kickerId].filter(Boolean));
    }
    // The ball changes hands in the middle of a play, so the new possession counts now.
    // A four-possession game never starts a possession it does not have.
    _canReturn() { const s = this.s; return this.options.format !== 'drives' || s.possessionNumber + 1 < s.maxDrives * 2; }
    _takeOver(team = 'home') {
      const s = this.s;
      s.possessionNumber++; s.possession = team; s.drive = Math.floor(s.possessionNumber / 2) + 1;
      s.down = 1; s.distance = 10; s.conversion = null;
    }
    // Your returner fields the visitors' kick where it comes down and runs it back.
    _startKickReturn(title) {
      this._takeOver(); this.s.kickReturn = { title: title };
      return this._startReturn();
    }
    // A blocked punt is yours where it comes down. Recovered in their end zone, it is a touchdown.
    _blockedPunt(f) {
      const s = this.s;
      if (f.to.z < 100 || !this._canReturn()) return this._finishPossession(clamp(f.to.z, 1, 99), 'Punt blocked!', 'Your robots recover at their ' + Math.max(1, Math.round(100 - f.to.z)) + '. Your ball.');
      this._takeOver(); s.kickReturn = { title: 'Punt blocked', touchdown: 'Blocked punt touchdown!' };
      return this._finishPlay(f.to.z, 'Punt blocked');
    }
    _kickoffLanded(f) {
      const s = this.s, k = s.kickoff, rd = this._direction(), p = this._player(s.returnerId);
      const land = rd === 1 ? f.to.z : 100 - f.to.z;
      if (f.onside) {
        const kicking = k.team, chance = kicking === 'home' ? (this.options.practice ? .6 : this.options.difficulty === 'pro' ? .2 : .3) : .15;
        s.kickoff = null; s.placeKick = null; s.ball.y = .2;
        if (this._rand() < chance) return this._finishPossession(f.to.z, 'Onside kick recovered!', kicking === 'home' ? 'Your robots get it back. Your ball.' : 'The visitors get it back. Their ball.');
        return this._newSeries(Math.round(land), 'Onside kick', s.possession === 'home' ? 'Your robots recover it. Your offense begins at its ' + Math.round(land) + '.' : 'The visitors recover it. They begin at their ' + Math.round(land) + '.');
      }
      if (land < 0) {
        // Caught in the end zone: run it out, or take a knee for the touchback.
        if (s.possession === 'home') {
          s.phase = 'returnchoice'; s.carrierId = p.id; s.controlledId = p.id; p.anim = 'catch'; this._followBall();
          s.message = 'Caught in the end zone. Run it out, or take a knee for a touchback at your 25.';
          this._emit('catch', ''); return true;
        }
        if (land < -3 || this._rand() < .55) return this._newSeries(KICKOFF_TOUCHBACK, 'Touchback', 'The visitors take a knee. They begin at their 25.');
      }
      return this._startReturn();
    }
    _startReturn(call) {
      const s = this.s, p = this._player(s.returnerId);
      s.carrierId = p.id; p.anim = 'catch'; s.returnFrom = p.z;
      this._runTime = 0; this._armControl(); this._followBall();
      if (s.possession === 'home') {
        s.phase = 'run'; s.controlledId = p.id;
        this._emit('catch', call || 'Caught. Run it back.');
      } else {
        s.phase = 'defend'; s.defenseStage = 'chase'; s.opponentPlayType = 'return';
        this._cpuLane = p.x; this._cpuSway = this._rand() * Math.PI * 2;
        // Who caught it is heard first, then which robot you now control.
        this._emit('catch', call || 'Caught. Make the tackle.');
        this._takeClosestDefender(true);
      }
      return true;
    }
    // A pass is judged a moment before it lands, so a defender who picks it off is seen breaking
    // on the ball. Your own throw keeps its single roll (catch, miss or pick), now drawn here.
    _judgePass(f) {
      const s = this.s, thrower = f.kind === 'pass' ? 'home' : 'away';
      f.judged = true;
      const nearest = (range, rushers) => s.players
        .filter(q => q.team !== thrower && !(q.stun > 0) && (rushers || !/^D[ET]\d$/.test(q.role)))
        .map(q => ({ q: q, gap: distance(q, f.to) })).filter(o => o.gap < range).sort((a, b) => a.gap - b.gap)[0];
      let by = null;
      if (f.kind === 'pass') {
        f.roll = this._rand();
        if (this.options.practice) return;
        if (f.short) {
          // An underthrown ball with a defender sitting under it.
          const under = nearest(2.2, true);
          if (under && f.roll >= f.chance && f.roll > .85) by = under;
        } else {
          // Only out of the misses, so a pick never takes away the catch chance you were told.
          const pick = Math.min(1 - f.chance, clamp(1 - f.separation / COVERAGE_GAP.Open[0], 0, 1) * PICK_MAX[this.options.difficulty === 'pro' ? 'pro' : 'rookie']);
          if (f.roll >= 1 - pick) {
            const cover = this._player('away-' + COVERS[s.targets.indexOf(f.targetId)]);
            by = cover && !(cover.stun > 0) && distance(cover, f.to) < PICK_REACH ? { q: cover } : nearest(PICK_REACH, false);
          }
        }
      } else {
        const near = nearest(PICK_REACH, true);
        const chance = near ? (CPU_PICK[s.playId] || .15) * (1 - near.gap / PICK_REACH) * (this.options.difficulty === 'pro' ? .75 : 1) : 0;
        // A low roll favours the thrower, as everywhere else.
        if (near && this._rand() >= 1 - chance) by = near;
      }
      if (!by) return;
      // He undercuts the route: he meets the ball a step in front of the receiver.
      const dx = f.from.x - f.to.x, dz = f.from.z - f.to.z, len = Math.hypot(dx, dz) || 1;
      f.pickId = by.q.id;
      f.pickBreak = { x: by.q.x, z: by.q.z, at: f.elapsed, spot: { x: f.to.x + dx / len * .7, z: f.to.z + dz / len * .7 } };
    }
    _breakOnBall(f) {
      const s = this.s, q = this._player(f.pickId), b = f.pickBreak;
      if (!q || !b) return;
      const k = clamp((f.elapsed - b.at) / Math.max(.05, f.duration - b.at), 0, 1);
      q.x = b.x + (b.spot.x - b.x) * k; q.z = b.z + (b.spot.z - b.z) * k;
      q.goal = { x: b.spot.x, z: b.spot.z }; q.heading = Math.atan2(s.ball.x - q.x, s.ball.z - q.z);
      q.anim = f.duration - f.elapsed < .4 ? 'catch' : 'run'; q.assignment = 'Break on the ball';
    }
    // Picked off: he runs it back the way a kick is returned. A two-point try just ends, and so
    // does the last possession of a four-drive game.
    _intercepted(f) {
      const s = this.s, q = this._player(f.pickId), thrower = s.possession, yours = thrower === 'away';
      this._flight = null; this._cpuPass = null; q.anim = 'catch';
      this._stat(thrower, 'turnovers', 1);
      if (s.conversion) return this._kickAfter('Intercepted!', 'The two-point try is over.');
      if (!this._canReturn()) return this._finishPossession(clamp(q.z, 1, 99), 'Intercepted!', yours ? 'Your defense takes the ball.' : 'The visitors take the ball.');
      // When your robot picks it off, the receiver he jumped is knocked off balance as the
      // return starts, so he cannot simply tackle him on the spot. Your own beaten receiver
      // stays on his feet: he is your best chance to stop a visitors' return.
      const beaten = yours && this._player(f.targetId);
      if (beaten) {
        beaten.stun = .7; beaten.heading = Math.atan2(q.x - beaten.x, q.z - beaten.z);
        beaten.shove = { x: Math.sin(beaten.heading), z: Math.cos(beaten.heading) };
      }
      this._takeOver(yours ? 'home' : 'away');
      s.kickReturn = { title: 'Interception return', touchdown: 'Pick six! Touchdown!' };
      s.returnerId = q.id; s.defenseTargetId = null; s.defenseStage = null;
      return this._startReturn(yours ? 'Intercepted! Run it back.' : 'Intercepted! Make the tackle.');
    }
    // A knee in the end zone, or run it out. The play waits for this choice.
    chooseReturn(runIt) {
      if (this.s.phase !== 'returnchoice') return false;
      if (runIt) return this._startReturn();
      return this._newSeries(KICKOFF_TOUCHBACK, 'Touchback', 'You take a knee in the end zone. Your offense begins at its 25.');
    }
    // First and 10 for the team with the ball, `yards` from its own goal line.
    _newSeries(yards, title, detail) {
      const s = this.s, home = s.possession === 'home', z = home ? yards : 100 - yards;
      s.kickoff = null; s.kickReturn = null; s.returnFrom = null; s.conversion = null;
      s.fieldPosition = clamp(z, 1, 99); s.down = 1; s.distance = Math.min(10, home ? 100 - s.fieldPosition : s.fieldPosition);
      this._pending = { switchPossession: false };
      s.phase = 'result'; s.resultRevealRemaining = 2.2; s.result = { title: title, detail: detail };
      s.message = detail; this._emit('result', sentences(title, detail));
      return true;
    }
    // After a score (or a safety) the scoring side kicks to the other. With kickoffs off,
    // the receiving team simply starts at its 25.
    _kickAfter(title, text, from = KICKOFF_SPOT) {
      const s = this.s, homeKicks = s.possession === 'home';
      const next = this.options.kickoffs
        ? (from === SAFETY_KICK_SPOT ? (homeKicks ? 'You free kick from your 20.' : 'The visitors free kick from their 20.') : homeKicks ? 'You kick off.' : 'The visitors kick off to you.')
        : homeKicks ? 'The visitors take over at their 25.' : 'Your offense begins at its 25.';
      this._finishPossession(homeKicks ? 75 : 25, title, sentences(text, next));
      this._pending.kickoff = { team: s.possession, from: from };
    }
    // `power` comes from the charge line; anything from the zone up is a full leg.
    kick(power) {
      const s = this.s;
      if (s.phase !== 'kickaim') return false;
      if (s.kickoff) return this._kickoffKick(power);
      const isPunt = s.playId === 'punt', extra = s.playId === 'extrapoint', target = { x: s.kickAim * 2.2 };
      const place = !isPunt && !!s.placeKick, from = place ? { x: s.placeKick.spot.x, y: s.ball.y, z: s.placeKick.spot.z } : { x: 0, y: 0.9, z: s.lineOfScrimmage - 6 };
      const kickDistance = 100 - s.lineOfScrimmage + 17, strength = finite(power) ? clamp(power / CHARGE_ZONE[0], 0, 1) : 1;
      // Between the posts a kick usually goes in; outside the window it seldom does.
      const makeable = clamp(1.08 - Math.max(0, kickDistance - 25) * 0.012, 0.3, 0.99);
      const onTarget = Math.abs(s.kickAim) <= this.kickWindow();
      const kickChance = this.options.practice ? 1 : onTarget ? makeable : Math.min(.35, makeable * .4);
      // A long kick needs a full leg; an extra point needs very little.
      const needed = clamp((kickDistance - 10) / 60, .3, .95), short = !isPunt && !this.options.practice && strength < needed;
      const good = isPunt || !short && this._rand() < kickChance;
      let to = { x: isPunt ? target.x * 6 : target.x, y: isPunt || short ? 0.3 : 5.2,
        z: isPunt ? Math.min(104, s.lineOfScrimmage + (37 + this._rand() * 12) * (.55 + .45 * strength)) : short ? s.lineOfScrimmage + (112 - s.lineOfScrimmage) * clamp(strength / needed, .35, .92) : 112 };
      if (!isPunt && !good && !short) to.x = s.kickAim < 0 ? -7 : 7;
      const call = isPunt ? 'Punt away.' : extra ? 'The extra point is up.' : 'The field goal is up.';
      this._flight = { kind: isPunt ? 'punt' : extra ? 'extrapoint' : 'fieldgoal', elapsed: place ? -KICK_APPROACH * this.options.pace : 0, duration: isPunt ? 2.3 : 2, from: from, to: to, good: good, short: short, call: place ? call : null };
      s.kickTarget = copy(to); s.phase = 'kickflight'; s.carrierId = null; s.controlledId = null;
      if (place) return true;
      this._player('home-QB').anim = 'kick';
      this._emit('kick', call); return true;
    }
    _startDefense(id) {
      const play = DEFENSE_PLAYS.concat(SPECIAL_DEFENSE).find(p => p.id === id);
      if (!play) return false;
      const s = this.s; s.playId = id; s.result = null; this._formation(); this._runTime = 0;
      // The opposing coach uses the same down-and-distance decisions as classic football.
      const cpuKick = this._cpuKickChoice();
      if (cpuKick) return this._startCpuKick(cpuKick);
      const controlled = this._player('home-MLB');
      s.phase = 'defend'; s.controlledId = controlled.id;
      this._idle = 0; s.autoPlay = false;
      this._armControl();
      const passChance = s.distance >= 7 || s.down >= 3 ? .68 : .40;
      if (this._rand() < passChance) {
        s.opponentPlayType = 'pass'; s.defenseStage = 'dropback';
        s.carrierId = 'away-QB';
        const deep = s.distance >= 10 && s.down >= 2;
        const concept = PLAYS.find(p => p.id === (deep ? 'verticals' : 'slants'));
        this._buildRoutes(concept, 'away');
        this._cpuPass = {
          // Some quarterbacks get the ball out fast; some hold it a beat too long.
          elapsed: 0, releaseAt: id === 'blitz' ? 1.1 + this._rand() * .7 : 2.05 + this._rand() * .6,
          escapeX: this._rand() < .5 ? -4 : 4,
          coverageGap: id === 'zone' ? 1.2 : id === 'blitz' ? 6.4 : id === 'man' ? (deep ? 5.6 : 1.4) : 4.5, deep: deep
        };
        s.message = 'Pass play.';
      } else {
        const rb = this._player('away-RB');
        this._cpuLane = [-12, 1, 12][Math.floor(this._rand() * 3)]; this._cpuSway = this._rand() * Math.PI * 2;
        s.opponentPlayType = 'run'; s.defenseStage = 'chase'; this._startHandoff(rb);
        s.message = 'Run play.';
      }
      this._followBall(); this._emit('snap', s.message); return true;
    }
    _startCpuKick(kind) {
      const s = this.s, qb = this._player('away-QB'), punt = kind === 'punt', practice = this.options.practice, pro = this.options.difficulty === 'pro';
      const kickDistance = s.lineOfScrimmage + 17;
      const chance = clamp(1.06 - Math.max(0, kickDistance - 25) * .014, .04, .99);
      // A block call gets a hand on it now and then: a punt more often than a field goal,
      // and a long field goal, which flies lower, more often than a short one.
      const blockChance = punt ? (s.playId === 'puntblock' ? (practice ? .5 : pro ? .14 : .22) : 0)
        : kind === 'fieldgoal' && s.playId === 'fgblock' ? clamp((practice ? .3 : pro ? .08 : .12) + Math.max(0, kickDistance - 30) * .005, 0, .5) : 0;
      const blocked = blockChance > 0 && this._rand() < blockChance;
      const good = !blocked && (punt || (!practice && this._rand() < chance));
      // A long miss can come down short of the goal line instead of wide.
      const short = kind === 'fieldgoal' && !good && !blocked && this._rand() < clamp((kickDistance - 35) / 20, 0, .8);
      const place = !punt && !!s.placeKick, call = punt ? 'The visitors punt.' : kind === 'extrapoint' ? 'The visitors kick the extra point.' : 'The visitors attempt a field goal.';
      const from = place ? { x: s.placeKick.spot.x, y: s.ball.y, z: s.placeKick.spot.z } : { x: qb.x, y: .9, z: s.lineOfScrimmage + 6 };
      const to = blocked ? { x: from.x + (this._rand() - .5) * 6, y: .2, z: from.z + 2 + this._rand() * 5 }
        : short ? { x: (this._rand() - .5) * 8, y: .3, z: 1 + this._rand() * 7 }
        : {
          x: punt || good ? 0 : this._rand() < .5 ? -7 : 7,
          y: punt ? .3 : 5.2,
          // With everyone up to block, nobody is back to field the punt and it rolls on.
          z: punt ? Math.max(-4, s.lineOfScrimmage - 37 - this._rand() * 12 - (s.playId === 'puntblock' ? 5 + this._rand() * 5 : 0)) : -12
        };
      this._flight = {
        kind: 'cpu-' + kind, elapsed: place ? -KICK_APPROACH * this.options.pace : 0, duration: blocked ? .9 : punt ? 2.3 : 2,
        from: from, to: to, good: good, blocked: blocked, short: short, call: place ? call : null
      };
      s.opponentPlayType = kind; s.defenseStage = null; s.controlGrace = 0;
      s.kickTarget = copy(to); s.phase = 'kickflight'; s.carrierId = null; s.controlledId = null;
      if (place) return true;
      qb.anim = 'kick';
      this._emit('kick', call);
      return true;
    }
    _stepDefensePass(dt, steer, realDt) {
      const s = this.s, plan = this._cpuPass, tune = this._tune();
      if (!plan) return;
      plan.elapsed += dt;
      const qb = this._player('away-QB'), controlled = this._player(s.controlledId);
      const inFlight = s.defenseStage === 'flight';
      const flightDt = inFlight ? this._passFlightDt(dt, realDt) : 0;
      this._advanceRoutes(inFlight ? Math.min(dt, Math.max(0, this._flight.routeArrival - this._routeTime)) : dt);
      const targetPoint = inFlight ? this._flight.to : {
        x: 0, z: s.lineOfScrimmage - (s.playId === 'zone' ? 11 : 6)
      };
      const back = this._player('away-RB');
      if (controlled) {
        // The back picks up a blitzing linebacker for a moment. Steer around him.
        let drive = 1;
        if (s.playId === 'blitz' && !inFlight && !controlled.shed && distance(controlled, back) < 1.7) {
          controlled.blockTime = (controlled.blockTime || 0) + dt; drive = .5;
          if (controlled.blockTime >= tune.pickup) controlled.shed = true;
        }
        if (s.autoPlay) {
          // Hands off: rush on a blitz, break on the throw, otherwise sit under the nearest receiver.
          const mark = s.routes.map(r => this._player(r.playerId)).sort((a, b) => distance(a, controlled) - distance(b, controlled))[0];
          const spot = s.playId === 'blitz' && !inFlight ? qb : inFlight || !mark ? targetPoint : { x: clamp(mark.x, -16, 16), z: mark.z - 2 };
          this._moveToward(controlled, spot.x, spot.z, (ROLE_SPEED[controlled.role] || 6.5) * tune.teammates * drive, dt);
        } else {
          controlled.x = clamp(controlled.x + steer * 9 * drive * dt, -SIDE, SIDE);
          const targetZ = s.playId === 'blitz' && !inFlight ? qb.z : targetPoint.z;
          const dz = targetZ - controlled.z;
          controlled.z += Math.sign(dz) * Math.min(Math.abs(dz), (s.playId === 'blitz' && !inFlight ? 7.2 : 8.4) * drive * dt);
          controlled.heading = Math.atan2(steer * .7, Math.sign(dz) || 1); controlled.anim = 'run';
          controlled.goal = { x:controlled.x + steer * 3, z:targetZ };
        }
        controlled.assignment = s.playId === 'blitz' && !inFlight ? 'Pressure and sack the quarterback' : 'Cover the intended receiver';
      }
      s.routes.forEach((route, i) => {
        const p = this._player(route.playerId);
        const cover = this._player(['home-CB1','home-CB2','home-FS','home-SS'][i]);
        const x = p.x + (i % 2 ? -1 : 1) * plan.coverageGap;
        const man = s.playId === 'man', z = p.z - (s.playId === 'zone' ? .7 : man ? 1.2 : 2.2);
        this._moveToward(cover, clamp(x, -25.5, 25.5), z, s.playId === 'zone' ? 7.2 : man ? 6.8 : 5.1, dt);
      });
      const protectors = s.players.filter(p => p.team === 'away' && ['C','LG','RG','LT','RT'].includes(p.role));
      protectors.forEach(p => {
        const lanes = { LT: -3.3, LG: -1.65, C: 0, RG: 1.65, RT: 3.3 };
        this._moveToward(p, lanes[p.role] + plan.escapeX * .08,
          s.lineOfScrimmage + .55 + Math.abs(lanes[p.role]) * .06, 1.5, dt);
        p.heading = Math.PI; p.anim = 'block'; p.assignment = 'Protect the passing pocket';
      });
      // The back steps into the path of the most dangerous free rusher.
      const free = s.playId === 'blitz' && controlled ? controlled : s.players.filter(p => p.team === 'home' && p.role.startsWith('D'))
        .sort((m, n) => distance(m, qb) - distance(n, qb))[0];
      const lane = free ? Math.max(.001, distance(free, qb)) : 1, reach = Math.min(3.4, lane * .55);
      this._moveToward(back, free ? qb.x + (free.x - qb.x) / lane * reach : qb.x + 2.2, free ? qb.z + (free.z - qb.z) / lane * reach : qb.z - 1.4, 4.8, dt);
      back.anim = 'block'; back.heading = free ? Math.atan2(free.x - back.x, free.z - back.z) : Math.PI; back.assignment = 'Pick up the free pass rusher';
      if (s.playId !== 'blitz') ['LB1','LB2'].forEach((role,i) => {
        const linebacker = this._player('home-' + role);
        this._moveToward(linebacker, (i ? 1 : -1) * 8,
          s.lineOfScrimmage - (s.playId === 'zone' ? 10 : 6), 3.6, dt);
        linebacker.assignment = 'Cover the underneath passing zone';
      });
      const rushers = s.players.filter(p => p.team === 'home' && p.id !== s.controlledId &&
        (p.role.startsWith('D') || s.playId === 'blitz' && p.role.startsWith('LB')));
      rushers.forEach(p => {
        // Pass protection holds a rusher for a moment; then the rusher works free.
        let speed = s.playId === 'blitz' ? 4.7 : 2.1;
        const blocker = !inFlight && protectors.concat(back).find(o => distance(o, p) < 1.7);
        if (blocker && !p.shed) {
          p.blockTime = (p.blockTime || 0) + dt; speed *= .22;
          if (p.blockTime >= tune.rushShed) p.shed = true;
        }
        this._moveToward(p, inFlight ? targetPoint.x : qb.x, inFlight ? targetPoint.z : qb.z, speed, dt);
      });
      const anchors = s.routes.map(r => r.playerId).concat(qb.id);
      if (inFlight) {
        if (s.throwWindupRemaining <= 0) { qb.anim = 'ready'; qb.assignment = 'Watch the pass and prepare to support the receiver'; }
        this._separate(anchors); this._stepFlight(flightDt); return;
      }
      this._moveToward(qb, plan.escapeX, s.lineOfScrimmage + 6, 2.5, dt);
      qb.heading = Math.PI; // Backpedal while reading downfield.
      this._separate(anchors);
      this._followBall();
      const sack = plan.elapsed > .65 && [controlled].concat(rushers).some(p => p && distance(p, qb) < 1.7);
      if (sack) {
        this._cpuPass = null;
        const tackler = [controlled].concat(rushers).find(p => p && distance(p, qb) < 1.7);
        this._beginTackle(qb, tackler, 'Sack!');
        return;
      }
      if (plan.elapsed < plan.releaseAt) return;
      const reads = s.routes.map(route => {
        const p = this._player(route.playerId);
        const gap = Math.min.apply(null, s.players.filter(q => q.team === 'home').map(q => distance(p, q)));
        return { p: p, gap: gap };
      }).sort((a, b) => b.gap - a.gap);
      const read = this._rand() < .78 ? reads[0] : reads[Math.floor(this._rand() * reads.length)];
      const defenseBonus = s.playId === 'zone' ? -.19 : s.playId === 'blitz' ? .06 : s.playId === 'man' ? (plan.deep ? .08 : -.14) : .03;
      const chance = clamp((this.options.difficulty === 'pro' ? .58 : .47) + read.gap * .04 + defenseBonus, .18, .94);
      this._makePass('cpu-pass', qb, read.p, chance, read.gap);
      s.defenseStage = 'flight'; s.defenseTargetId = read.p.id;
      this._emit('throw', 'Pass to ' + read.p.name + '. Close the gap.');
    }
    step(dt, steer, held) {
      if (!finite(dt) || dt <= 0) return this.s;
      // Timers use actual foreground time. A delayed frame never skips a reaction window.
      const realDt = Math.min(dt, 0.1), s = this.s;
      steer = finite(steer) ? clamp(steer, -1, 1) : 0;
      if (s.phase === 'defend' || s.phase === 'run') {
        this._idle = (held === undefined ? steer !== 0 : !!held) ? 0 : this._idle + realDt;
        s.autoPlay = this._idle >= AUTO_PLAY_AFTER;
      } else s.autoPlay = false;
      if (s.phase === 'result') {
        s.resultRevealRemaining = Math.max(0, (s.resultRevealRemaining || 0) - realDt);
        if (s.resultRevealRemaining < 1e-7) s.resultRevealRemaining = 0;
        return s;
      }
      if (s.phase === 'tackle') { this._stepTackle(realDt); return s; }
      if (s.phase === 'presnap') {
        s.countdown = Math.max(0, s.countdown - realDt);
        if (s.countdown < 1e-7) {
          const id = this._queuedPlay;
          this._queuedPlay = null;
          this._executePlay(id);
        }
        return s;
      }
      if (s.phase === 'aim') {
        // A live pocket and real routes, with unlimited time to scan. The match
        // clock, sacks, and all failure conditions wait until the user throws.
        const routeDt = realDt * this.options.pace;
        s.playElapsed += routeDt;
        this._stepHomePass(routeDt, realDt);
        return s;
      }
      if (!['flight','run','kickflight','defend'].includes(s.phase)) return s;
      if ((s.phase === 'run' || s.phase === 'defend') && s.controlGrace > 0) {
        if (s.handoff) this._stepHandoff(realDt);
        s.controlGrace = Math.max(0, s.controlGrace - realDt);
        if (s.controlGrace < 1e-7) {
          s.controlGrace = 0;
          if (s.phase === 'defend' && s.defenseStage === 'chase' && this._idle >= AUTO_PLAY_AFTER) this._takeClosestDefender(true);
        }
        return s;
      }
      const controlledPlay = s.phase === 'run' || s.phase === 'defend';
      if (controlledPlay) this._controlRamp = Math.min(1, this._controlRamp + realDt / 1.6);
      const ramp = controlledPlay ? .24 + .76 * this._controlRamp : 1;
      const motionDt = realDt * this.options.pace * ramp;
      s.elapsed += motionDt; s.playElapsed += motionDt;
      // Conversion tries are untimed downs.
      // The clock starts when the returner has the ball, not while the kickoff is in the air.
      if (this.options.format === 'regulation' && s.timeRemaining > 0 && !s.conversion && !(s.phase === 'kickflight' && s.kickoff)) {
        s.timeRemaining = Math.max(0, s.timeRemaining - realDt);
        if (s.timeRemaining < 1e-7) {
          s.timeRemaining = 0;
          this._emit('whistle', 'The period ends after this play.');
        }
      }
      if (s.phase === 'flight') {
        const flightDt = this._passFlightDt(motionDt, realDt);
        this._stepHomePass(Math.min(motionDt, Math.max(0, this._flight.routeArrival - this._routeTime)));
        this._stepFlight(flightDt);
      } else if (s.phase === 'kickflight') { this._stepKickoffCoverage(motionDt); this._stepKickDefense(motionDt); this._stepFlight(motionDt); }
      else if (s.phase === 'defend' && this._cpuPass) this._stepDefensePass(motionDt, steer, realDt);
      else this._stepRun(motionDt, steer);
      return s;
    }
    _passFlightDt(dt, realDt) {
      const s = this.s;
      if (s.throwWindupRemaining <= 0) return dt;
      const held = Math.min(realDt, s.throwWindupRemaining);
      s.throwWindupRemaining = Math.max(0, s.throwWindupRemaining - held);
      if (s.throwWindupRemaining < 1e-7) s.throwWindupRemaining = 0;
      const qb = this._player(s.passerId);
      qb.anim = 'throw';
      Object.assign(s.ball, this._throwOrigin(qb), { vx: 0, vy: 0, vz: 0 });
      return dt * Math.max(0, 1 - held / realDt);
    }
    _stepFlight(dt) {
      const f = this._flight, s = this.s;
      if (!f || s.throwWindupRemaining > 0) return;
      f.elapsed += dt;
      if (s.placeKick && !s.placeKick.struck) {
        if (f.elapsed < 0) { this._stepApproach(f); return; }
        this._stepApproach(f); s.placeKick.struck = true;
        if (f.call) this._emit('kick', f.call);
      }
      // A pass flies the arc its charge line showed: flatter on short throws, higher on long ones.
      const t = clamp(f.elapsed / f.duration, 0, 1), arc = f.kind === 'pass' || f.kind === 'cpu-pass' ? clamp(Math.hypot(f.to.x - f.from.x, f.to.z - f.from.z) * .16, 1.2, 7) : f.kind === 'kickoff' ? (f.onside ? 1.2 : 15) : f.kind.endsWith('extrapoint') ? 11 : 16;
      s.ball.x = f.from.x + (f.to.x - f.from.x) * t;
      s.ball.z = f.from.z + (f.to.z - f.from.z) * t;
      s.ball.y = f.from.y + (f.to.y - f.from.y) * t + Math.sin(Math.PI * t) * arc;
      s.ball.vx = (f.to.x - f.from.x) / f.duration;
      s.ball.vz = (f.to.z - f.from.z) / f.duration;
      s.ball.vy = (f.to.y - f.from.y + Math.PI * arc * Math.cos(Math.PI * t)) / f.duration;
      // A low ball that meets a defender's body is knocked down, not flown through.
      // (A defender right at the catch point contests the catch instead.)
      if ((f.kind === 'pass' || f.kind === 'cpu-pass') && !f.over && t > .12 && t < .97 && s.ball.y < 2.5) {
        const thrower = f.kind === 'pass' ? 'home' : 'away';
        const swat = s.players.find(q => q.team !== thrower && !(q.stun > 0) && q.id !== f.pickId && Math.hypot(q.x - s.ball.x, q.z - s.ball.z) < .7 && Math.hypot(q.x - f.to.x, q.z - f.to.z) > .9);
        if (swat) {
          this._flight = null; this._cpuPass = null; swat.anim = 'catch';
          swat.heading = Math.atan2(s.ball.x - swat.x, s.ball.z - swat.z); s.ball.y = .2;
          this._finishPlay(s.lineOfScrimmage, 'Knocked down'); return;
        }
      }
      if ((f.kind === 'pass' || f.kind === 'cpu-pass') && !f.over && !f.judged && f.duration - f.elapsed < PICK_LOOK) this._judgePass(f);
      if (f.pickId) this._breakOnBall(f);
      if ((f.kind === 'pass' || f.kind === 'cpu-pass') && f.duration - f.elapsed < .4) {
        const receiver = this._player(f.targetId), qb = this._player(s.passerId);
        receiver.heading = Math.atan2(qb.x - receiver.x, qb.z - receiver.z);
        receiver.anim = 'catch';
      }
      if (t < 1) return;
      this._flight = null;
      if (f.kind === 'kickoff') { this._kickoffLanded(f); return; }
      if (f.kind === 'cpu-pass') {
        const p = this._player(f.targetId), roll = this._rand();
        const nearest = s.players.filter(q => q.team === 'home').sort((a, b) => distance(a, p) - distance(b, p))[0];
        const gap = nearest ? distance(nearest, p) : 20;
        const completion = clamp(f.chance - Math.max(0, 3 - gap) * .08, .12, .94);
        this._cpuPass = null;
        if (f.pickId) this._intercepted(f);
        else if (roll < completion) {
          p.anim = 'catch';
          s.carrierId = p.id; s.controlledId = 'home-MLB'; s.phase = 'defend'; s.defenseStage = 'chase';
          this._runTime = 0; this._cpuLane = p.x; this._cpuSway = this._rand() * Math.PI * 2;
          this._armControl(); this._followBall();
          this._emit('catch', 'Caught. Make the tackle.');
          if (p.z <= 0) {
            if (this.options.practice) this._finishPlay(3, 'Goal-line stop');
            else this._finishPlay(p.z, 'Touchdown');
          }
        } else {
          s.ball.y = .2;
          this._finishPlay(s.lineOfScrimmage, 'Incomplete pass');
        }
      } else if (f.kind === 'cpu-fieldgoal') {
        if (f.blocked) {
          this._finishPossession(clamp(Math.max(s.lineOfScrimmage, 20), 1, 99), 'Kick blocked!', 'Your robots get a hand on it. Your offense takes over.');
        } else if (f.good) {
          s.awayScore += 3;
          this._kickAfter('Visitors field goal', 'Three points.');
          this._emit('score', 'Visitors field goal. Three points.');
        } else if (f.short && s.playId === 'fgreturn' && this._canReturn()) {
          this._startKickReturn('Missed kick return');
        } else {
          this._finishPossession(clamp(Math.max(s.lineOfScrimmage, 20), 1, 99), f.short ? 'Kick short' : 'Kick wide', 'No score. Your offense takes over.');
        }
      } else if (f.kind === 'cpu-extrapoint') {
        if (f.good) {
          s.awayScore += 1;
          this._kickAfter('Extra point good', 'The visitors add one point.');
          this._emit('convert', '');
        } else this._kickAfter('Extra point missed', 'No extra point for the visitors.');
      } else if (f.kind === 'cpu-punt') {
        const touchback = f.to.z <= 0, next = touchback ? PUNT_TOUCHBACK : clamp(f.to.z, 1, 99);
        if (f.blocked) this._blockedPunt(f);
        else if (!touchback && s.playId === 'puntreturn' && this._canReturn()) this._startKickReturn('Punt return');
        else this._finishPossession(next, touchback ? 'Punt · touchback' : 'Visitors punt',
          touchback ? 'Your offense begins at its 20.' : 'Your offense takes over at its ' + Math.round(next) + '.');
      } else if (f.kind === 'pass' && f.over) {
        s.ball.y = 0.2; this._finishPlay(s.lineOfScrimmage, 'Overthrown');
      } else if (f.kind === 'pass' && f.short) {
        // An underthrown ball: now and then the receiver dives and gets it, and a defender
        // sitting under it can pick it off; most of the time it falls incomplete.
        const p = this._player(f.targetId), roll = f.judged ? f.roll : this._rand();
        if (f.pickId) this._intercepted(f);
        else if (roll < f.chance) {
          s.carrierId = p.id; s.controlledId = p.id; p.anim = 'catch'; s.phase = 'run';
          this._runTime = 0; this._armControl(); this._followBall();
          s.message = 'Diving catch!'; this._emit('catch', s.message);
        } else {
          s.ball.y = 0.2; this._finishPlay(s.lineOfScrimmage, 'Thrown short');
        }
      } else if (f.kind === 'pass') {
        const p = this._player(f.targetId), roll = f.judged ? f.roll : this._rand();
        if (f.pickId) this._intercepted(f);
        else if (roll < f.chance || this.options.practice) {
          s.carrierId = p.id; s.controlledId = p.id; p.anim = 'catch'; s.phase = 'run';
          this._runTime = 0; this._armControl(); this._followBall();
          s.message = 'Caught!'; this._emit('catch', s.message);
          if (p.z >= 100) this._finishPlay(p.z, 'Touchdown');
        } else {
          s.ball.y = 0.2; this._finishPlay(s.lineOfScrimmage, 'Incomplete pass');
        }
      } else if (f.kind === 'fieldgoal') {
        if (f.good) {
          s.homeScore += 3;
          this._kickAfter('Field goal!', 'Three points.');
          this._emit('score', 'Field goal. Three points.');
        } else this._finishPossession(clamp(Math.min(s.lineOfScrimmage, 80), 1, 99), f.short ? 'Kick short' : 'Kick wide', 'No score. The visitors take over at the previous spot, or their 20.');
      } else if (f.kind === 'extrapoint') {
        if (f.good) {
          s.homeScore += 1;
          this._kickAfter('Extra point good!', 'One more point.');
          this._emit('convert', '');
        } else this._kickAfter('Extra point missed', (f.short ? 'The kick fell short. ' : '') + 'No extra point.');
      } else {
        const touchback = f.to.z >= 100, next = touchback ? 80 : clamp(f.to.z, 1, 99);
        this._finishPossession(next, touchback ? 'Punt · touchback' : 'Punt away',
          touchback ? 'The visitors begin at their 20.' : 'The punt is downed at the ' + Math.round(100 - next) + '. The visitors take over.');
      }
    }
    _moveToward(p, x, z, speed, dt) {
      p.goal = { x: x, z: z };
      const dx = x - p.x, dz = z - p.z, len = Math.hypot(dx, dz);
      if (len < 0.001) { p.anim = 'idle'; return; }
      const n = Math.min(speed * dt, len);
      p.x += dx / len * n; p.z += dz / len * n;
      p.heading = Math.atan2(dx, dz); p.anim = 'run';
    }
    // Lead pursuit: aim where the runner will be when this defender can get
    // there. A runner who is out of reach is still cut off at an angle.
    _intercept(q, p, v, speed) {
      const rx = p.x - q.x, rz = p.z - q.z, a = v.x * v.x + v.z * v.z - speed * speed;
      const b = 2 * (rx * v.x + rz * v.z), c = rx * rx + rz * rz;
      let t = null;
      if (Math.abs(a) < 1e-6) { if (b < 0) t = -c / b; }
      else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const root = Math.sqrt(disc);
          t = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter(n => n > 0).sort((m, n) => m - n)[0] ?? null;
        }
      }
      if (t === null || t > 3) t = Math.min(1.1, Math.sqrt(c) / Math.max(1, speed));
      // Close in, attack the ball carrier himself rather than shadowing him.
      if (c < 16) t = Math.min(t, .25);
      return { x: clamp(p.x + v.x * t, -SIDE + .4, SIDE - .4), z: p.z + v.z * t };
    }
    // Resolve contact. Returns true when the runner breaks free. Practice runners
    // are tackled like anyone else: dodging real tackles is what practice is for.
    _tryBreakTackle(p, q, isDefense) {
      const s = this.s, tune = this._tune(), d = this._direction();
      if (q.id === s.controlledId && !s.autoPlay) return false;
      let chance = tune.cpuBroken;
      if (!isDefense) {
        const ahead = (q.z - p.z) * d;
        chance = ahead > .7 ? tune.broken.front : ahead > -.7 ? tune.broken.side : tune.broken.behind;
        if (q.engaged) chance += tune.broken.engaged;
        if (q.diving) chance += tune.broken.dive;
        if (p.stumble > 0) chance *= .5;
      }
      if (this._rand() >= chance) return false;
      // Knocked back and away from the runner; he gets up and can chase again.
      q.stun = 1.1; q.anim = q.diving ? 'dive' : 'knocked';
      q.heading = Math.atan2(p.x - q.x, p.z - q.z); q.shove = { x: Math.sin(q.heading), z: Math.cos(q.heading) };
      p.stumble = .5;
      this._stat(s.possession, 'broken', 1);
      this._emit('broken', 'Broken tackle!');
      return true;
    }
    _stepRun(dt, steer) {
      const s = this.s, p = this._player(s.carrierId), d = this._direction();
      if (!p) return;
      s.handoff = null;
      this._runTime += dt;
      const isDefense = s.phase === 'defend';
      const pro = this.options.difficulty === 'pro', tune = this._tune(), practice = this.options.practice;
      const before = { x: p.x, z: p.z };
      p.stumble = Math.max(0, (p.stumble || 0) - dt);
      const stumble = p.stumble > 0 ? .62 : 1;
      const rivals = s.players.filter(q => q.team !== s.possession), run = ['sweep','inside'].includes(s.playId);
      // A ball carrier nobody is steering follows his lane, then finds open grass.
      const plan = (lane, early) => this._runTime < early ? clamp((lane - p.x) / 3, -1, 1) : this._autoSteer(p, rivals);
      const lean = target => { this._lean += (target - this._lean) * Math.min(1, dt * 6); return this._lean; };
      // `carry` steers the ball carrier; `steer` stays the player's own input.
      let carry = steer;
      if (isDefense) {
        carry = lean(plan(this._cpuLane, 1));
        p.x += carry * tune.cpuLateral * dt;
        p.z += d * (pro ? 7.25 : 6.1) * stumble * dt;
      } else {
        if (s.autoPlay) carry = lean(run ? plan(this._runLane, 1.2) : this._autoSteer(p, rivals));
        else this._lean = steer;
        // Burst up to top speed. Cutting sideways costs a little forward speed.
        // Servos heat up on a long run, so pursuit can close on a runner in the open.
        const burst = clamp(this._runTime / .9, 0, 1), heat = clamp(1 - Math.max(0, this._runTime - tune.stamina.after) * tune.stamina.rate, tune.stamina.floor, 1);
        const speed = (4.6 + (tune.runner - 4.6) * burst * burst * (3 - 2 * burst)) * heat * stumble;
        const laneAssist = !carry && this._runTime < 2.4 && run ? clamp(this._runLane - p.x, -3.8 * dt, 3.8 * dt) : 0;
        p.x += carry * tune.lateral * dt + laneAssist;
        p.z += d * speed * (1 - .2 * Math.abs(carry)) * dt;
      }
      p.x = clamp(p.x, -SIDE - 0.05, SIDE + 0.05);
      const velocity = { x: (p.x - before.x) / dt, z: (p.z - before.z) / dt };
      p.heading = Math.atan2(carry * (isDefense ? .45 : .7), d);
      p.anim = this._runTime < 0.3 && !isDefense && !['sweep','inside'].includes(s.playId) ? 'catch' : 'run';
      p.assignment = 'Attack the end zone through the running lane';
      p.goal = { x: p.x + carry * 3, z: d === 1 ? 100 : 0 };
      const offense = s.players.filter(q => q.team === s.possession && q.id !== p.id);
      const defense = s.players.filter(q => q.team !== s.possession);
      // Every eligible teammate has a job: linemen and the back lead, wideouts
      // seal coverage downfield, and the passer follows as a trailing support.
      // Blockers each claim a different defender, so a lineman climbs to the
      // linebacker instead of two robots doubling the same tackle.
      const claimed = new Set();
      offense.forEach(q => {
        if (q.role === 'QB') {
          this._moveToward(q, clamp(p.x * .45, -20, 20), p.z - d * 7, 4.2, dt);
          q.assignment = 'Trail the runner and support the play'; return;
        }
        const lead = ['C','LG','RG','LT','RT','TE','RB'].includes(q.role);
        const laneOffset = { LT: -5.5, LG: -2.8, C: 0, RG: 2.8, RT: 5.5, TE: 7, RB: -4 }[q.role] || 0;
        const lane = lead ? p.x * .6 + laneOffset : q.x;
        const opponent = defense.filter(r => (r.z - p.z) * d > -2 && !r.shed && !(r.stun > 0) && !claimed.has(r.id) &&
          distance(q, r) < (lead ? 8 : 7) && (lead || Math.abs(r.x - lane) < 5))
          .sort((a,b) => distance(q,a) - distance(q,b))[0];
        if (opponent) claimed.add(opponent.id);
        q.assignment = lead ? 'Lead block and seal the running lane' : 'Block coverage downfield';
        this._moveToward(q, clamp(opponent ? opponent.x : lane, -24, 24),
          opponent ? opponent.z - d * 1.15 : p.z + d * (lead ? 3.7 : 8), lead ? 6 : 6.2, dt);
        if (opponent && distance(q,opponent) < 2.1) {
          q.anim = 'block'; q.heading = Math.atan2(opponent.x-q.x,opponent.z-q.z);
          q.goal.targetId = opponent.id;
        }
      });
      let tackler = null, closest = Infinity;
      defense.forEach(q => {
        q.stun = Math.max(0, (q.stun || 0) - dt);
        q.assignment = q.id === s.controlledId ? 'Track and tackle the ball carrier' : 'Take a pursuit angle to the ball carrier';
        if (q.id === s.controlledId && isDefense && !s.autoPlay) {
          const assisted = (p.x - q.x) * (practice ? .7 : tune.assist);
          q.x = clamp(q.x + (steer * 9 + assisted) * dt, -SIDE, SIDE);
          const dz = p.z - q.z;
          q.z += Math.sign(dz) * Math.min(Math.abs(dz), (pro ? 7.5 : 8.4) * dt);
          q.heading = Math.atan2(steer * 0.7, Math.sign(dz) || 1); q.anim = 'run';
          q.goal = { x:p.x, z:p.z, targetId:p.id };
        } else if (q.stun > 0) {
          // Knocked away or diving short: slide to the turf, then get back up.
          const slide = q.stun / 1.1 * (q.anim === 'dive' ? .8 : -2.2) * dt, push = q.shove || { x: 0, z: 0 };
          q.x = clamp(q.x + push.x * slide, -SIDE, SIDE); q.z += push.z * slide;
          if (q.anim !== 'dive') q.anim = 'knocked';
          q.assignment = 'Get back up and rejoin the pursuit';
        } else {
          let speed = (ROLE_SPEED[q.role] || 6.2) * (isDefense ? tune.teammates : tune.pursuit) * (q.burst || 1);
          if (isDefense && s.opponentPlayType === 'run') speed *= s.playId === 'contain' ? 1.12 : s.playId === 'zone' ? .86 : s.playId === 'man' ? .95 : 1;
          const blocker = !q.shed && offense.find(o => o.role !== 'QB' && distance(o, q) < 1.9);
          q.engaged = !!blocker;
          if (blocker) {
            // An engaged defender is driven out of the running lane until he sheds the block.
            q.blockTime = (q.blockTime || 0) + dt;
            if (q.blockTime >= (q.shedAt || tune.shed)) q.shed = true;
            const side = Math.sign(q.x - p.x) || (q.x < 0 ? -1 : 1), push = s.conversion ? .5 : 1;
            q.x = clamp(q.x + side * 1.7 * push * dt, -SIDE, SIDE); q.z += d * .5 * push * dt;
            q.heading = Math.atan2(blocker.x - q.x, blocker.z - q.z); q.anim = 'block';
            q.goal = { x: q.x, z: q.z, targetId: blocker.id };
          } else {
            if (this._runTime < (q.react || .35)) speed *= .5;
            const aim = this._intercept(q, p, velocity, speed);
            this._moveToward(q, aim.x, aim.z, speed, dt);
          }
        }
        // A pursuer who is close but trailing can still dive at the runner's legs.
        const steered = q.id === s.controlledId && !s.autoPlay;
        const contact = steered ? 2 : tune.reach, gap = distance(q, p);
        const trailing = !isDefense && !q.engaged && q.id !== s.controlledId && (q.z - p.z) * d < 1.2;
        q.diving = false;
        // The control grace already protects the start of a play: once it ends, contact tackles
        // at once on defense, and after only a beat for the player's own runner.
        if (this._runTime > (isDefense ? 0 : .12) && !(q.stun > 0) && gap < closest && (gap < contact || trailing && gap < tune.dive)) {
          closest = gap; tackler = q; q.diving = gap >= contact;
        }
      });
      this._separate([p.id]);
      // While you steer, control stays put. Three seconds after you let go it moves to the nearest robot.
      if (isDefense && this._idle >= SWITCH_AFTER && this._runTime - this._switchCheck >= .4) { this._switchCheck = this._runTime; this._takeClosestDefender(false); }
      this._followBall();
      if ((d === 1 && p.z >= 100) || (d === -1 && p.z <= 0)) {
        if (isDefense && practice) this._finishPlay(3, 'Goal-line stop');
        else this._finishPlay(p.z, 'Touchdown');
        return;
      }
      if (Math.abs(p.x) >= SIDE) {
        if (practice && !isDefense) p.x = Math.sign(p.x) * (SIDE - 1.5);
        else { this._finishPlay(p.z, 'Out of bounds'); return; }
      }
      if (tackler) {
        if (!this._tryBreakTackle(p, tackler, isDefense)) this._beginTackle(p, tackler, isDefense ? 'Tackle!' : 'Tackled');
      } else if (this._runTime > 18) {
        this._finishPlay(p.z, isDefense ? 'Runner stopped' : 'Forward progress');
      }
    }
    // Find open grass: lean away from free defenders ahead (a defender tied up in a
    // block barely counts), drift back toward the middle, and stay off the sideline.
    _autoSteer(p, rivals) {
      const d = this._direction();
      let lean = clamp(-p.x / SIDE, -1, 1) * .3;
      for (const q of rivals) {
        const ahead = (q.z - p.z) * d;
        if (q.stun > 0 || ahead < -1.5 || ahead > 12) continue;
        const dx = q.x - p.x, gap = Math.max(1, Math.hypot(dx, q.z - p.z));
        lean -= Math.sign(dx || p.x || 1) / (gap * gap) * (q.engaged ? 3 : 10);
      }
      if (Math.abs(p.x) > SIDE - 4) lean -= Math.sign(p.x) * 1.2;
      return clamp(lean, -1, 1);
    }
    // Robots are solid: nobody passes through anybody. `anchors` (the ball carrier, a
    // receiver on his route) barely give way; `together` is a pair allowed to touch, like
    // a tackler and the runner he is bringing down.
    _separate(anchors = [], together = null) {
      const players = this.s.players, reach = .9, held = new Set(anchors);
      for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j], dx = b.x - a.x, dz = b.z - a.z, gap = Math.hypot(dx, dz);
        if (gap >= reach || gap < 1e-6) continue;
        if (together && together.includes(a.id) && together.includes(b.id)) continue;
        const push = (reach - gap) / 2, nx = dx / gap, nz = dz / gap;
        const wa = held.has(a.id) ? .2 : 1, wb = held.has(b.id) ? .2 : 1;
        a.x = clamp(a.x - nx * push * wa, -SIDE, SIDE); a.z -= nz * push * wa;
        b.x = clamp(b.x + nx * push * wb, -SIDE, SIDE); b.z += nz * push * wb;
      }
    }
    // Hand control to the robot nearest the ball carrier. Only called when the
    // player is not steering; a small margin keeps the marker from flickering.
    _takeClosestDefender(force) {
      const s = this.s, carrier = this._player(s.carrierId);
      if (!carrier || s.possession !== 'away' || s.phase !== 'defend') return false;
      const current = this._player(s.controlledId), gapOf = q => distance(q, carrier);
      const best = s.players.filter(q => q.team === 'home' && !(q.stun > 0)).sort((a, b) => gapOf(a) - gapOf(b))[0];
      if (!best || best === current) return false;
      const gap = current ? gapOf(current) : Infinity;
      if (!force && !(current && current.stun > 0) && !(gapOf(best) < gap - 1)) return false;
      s.controlledId = best.id; best.engaged = false;
      this._emit('switch', best.name);
      return true;
    }
    _followBall() {
      const p = this._player(this.s.carrierId);
      if (p) this.s.ball = { x: p.x + 0.38, y: p.anim === 'down' ? 0.35 : 1.25, z: p.z + Math.cos(p.heading) * 0.15, visible: true };
    }
    _finishPlay(spot, reason) {
      const s = this.s, d = this._direction(), home = s.possession === 'home', team = home ? 'Home' : 'Visitors';
      const rawSpot = spot;
      spot = Math.round(clamp(spot, 0, 100) * 10) / 10;
      const gain = Math.round((spot - s.lineOfScrimmage) * d * 10) / 10;
      const scored = (d === 1 && rawSpot >= 100) || (d === -1 && rawSpot <= 0);
      let returnTouchdown = '';
      if (s.kickoff || s.kickReturn) {
        // The end of a kickoff or punt return: first and 10 where he went down. Downed in his
        // own end zone, the kick put him there, so it is a touchback, not a safety.
        const kick = s.kickReturn;
        s.kickoff = null; s.placeKick = null; s.kickReturn = null;
        if (!scored) {
          const own = (d === 1 && rawSpot <= 0) || (d === -1 && rawSpot >= 100);
          const yards = own ? (kick ? PUNT_TOUCHBACK : KICKOFF_TOUCHBACK) : Math.max(1, Math.round(d === 1 ? spot : 100 - spot));
          return this._newSeries(yards, own ? 'Touchback' : reason === 'Out of bounds' ? 'Return out of bounds' : kick ? kick.title : 'Kick return', (home ? 'Your offense begins at its ' : 'The visitors begin at their ') + yards + '.');
        }
        returnTouchdown = kick && kick.touchdown || 'Return touchdown!';
      }
      if (s.conversion) {
        // A two-point try is one play: in the end zone, or no points.
        if (scored) {
          if (home) s.homeScore += 2; else s.awayScore += 2;
          this._kickAfter('Two-point conversion!', home ? 'Two more points.' : 'The visitors add two points.');
          this._emit('convert', '');
        } else {
          this._kickAfter(home ? 'Conversion stopped' : 'Conversion denied', home ? 'No extra points.' : 'Your defense holds.');
        }
        return;
      }
      if (scored) {
        if (home) s.homeScore += TOUCHDOWN_POINTS; else s.awayScore += TOUCHDOWN_POINTS;
        // Return yards are not offense, as in real box scores.
        this._stat(s.possession, 'tds', 1);
        if (!returnTouchdown) { this._stat(s.possession, 'yards', gain); if (gain >= 20) this._stat(s.possession, 'bigPlays', 1); }
        this._pending = { switchPossession: false, conversion: true };
        s.phase = 'result'; s.resultRevealRemaining = 2.6;
        s.result = { title: returnTouchdown || 'Touchdown!', detail: home ? 'Six points. Now kick the extra point or go for two.' : 'The visitors score six points and line up for more.' };
        s.message = s.result.detail;
        this._emit('touchdown', home ? 'Touchdown! Six points.' : 'Visitors touchdown. Six points.'); return;
      }
      if ((d === 1 && rawSpot <= 0) || (d === -1 && rawSpot >= 100)) {
        if (s.possession === 'home') s.awayScore += 2; else s.homeScore += 2;
        this._kickAfter('Safety', 'The defense scores two points.', SAFETY_KICK_SPOT); return;
      }
      this._stat(s.possession, 'yards', gain);
      if (gain >= 20) this._stat(s.possession, 'bigPlays', 1);
      s.fieldPosition = spot;
      const firstDown = gain + 0.06 >= s.distance;
      if (firstDown) { s.down = 1; s.distance = Math.min(10, d === 1 ? 100 - spot : spot); }
      else { s.down++; s.distance = Math.max(0.1, Math.round((s.distance - gain) * 10) / 10); }
      if (s.down > 4) {
        this._finishPossession(spot, 'Turnover on downs', team + ' are stopped. Possession changes.'); return;
      }
      s.firstDownLine = clamp(spot + s.distance * d, 0, 100);
      const gainText = gain < 0 ? 'Loss of ' + Math.abs(gain) : 'Gain of ' + gain;
      this._pending = { switchPossession: false };
      s.phase = 'result'; s.resultRevealRemaining = 2.2;
      s.result = { title: firstDown ? 'First down!' : reason, detail: gainText + ' yards. ' + (firstDown ? 'A new set of downs.' : this._downText()) };
      s.message = s.result.detail;
      this._emit('result', sentences(s.result.title, s.result.detail));
    }
    _downText() {
      return ['','1st','2nd','3rd','4th'][this.s.down] + ' and ' + Math.ceil(this.s.distance) + '.';
    }
    _finishPossession(nextSpot, title, detail) {
      this.s.conversion = null;
      this._pending = { switchPossession: true, spot: clamp(nextSpot, 1, 99) };
      this.s.phase = 'result'; this.s.resultRevealRemaining = 2.2; this.s.result = { title: title, detail: detail };
      this.s.message = detail; this._emit('result', sentences(title, detail));
    }
    // After a touchdown: the player chooses; the visiting coach decides by the score.
    _beginConversion() {
      const s = this.s, home = s.possession === 'home';
      s.result = null; s.playId = null; s.down = 1;
      if (home) {
        s.conversion = 'choose'; s.phase = 'playcall';
        s.fieldPosition = 100 - TWO_POINT_SPOT; s.distance = TWO_POINT_SPOT; this._formation();
        s.message = 'Kick the extra point for one, or go for two.';
        this._emit('conversion', s.message); return true;
      }
      const margin = s.awayScore - s.homeScore;
      const goForTwo = [-2, 1, 5, -5].includes(margin) || this._rand() < .12;
      if (goForTwo) {
        s.conversion = 'two'; s.phase = 'playcall';
        s.fieldPosition = TWO_POINT_SPOT; s.distance = TWO_POINT_SPOT; this._formation();
        s.message = 'The visitors are going for two. Choose your defense.';
        this._emit('conversion', s.message); return true;
      }
      s.conversion = 'kick'; s.fieldPosition = EXTRA_POINT_SPOT; s.distance = EXTRA_POINT_SPOT; this._formation();
      s.phase = 'presnap'; s.countdown = SNAP_SECONDS; this._queuedPlay = 'extrapoint'; s.nextPhase = 'kickflight';
      s.players.forEach(p => { p.anim = 'ready'; });
      this._placeKickSetup();
      s.message = 'The visitors line up for the extra point.';
      this._emit('prepare', s.message); return true;
    }
    _endGame() {
      const s = this.s;
      s.phase = 'final'; s.carrierId = null; s.controlledId = null; s.conversion = null;
      s.controlGrace = 0; s.countdown = 0;
      s.result = { title: s.homeScore > s.awayScore ? 'Home win!' : s.homeScore < s.awayScore ? 'Visitors win' : 'Game tied',
        detail: 'Final score. Home ' + s.homeScore + ', Visitors ' + s.awayScore + '.' };
      s.message = s.result.detail; this._pending = null; this._flight = null; this._cpuPass = null;
      this._emit('final', s.result.title + ' ' + s.result.detail);
    }
    _advancePeriod() {
      const s = this.s;
      if (this.options.format !== 'regulation' || s.timeRemaining > 0) return true;
      if (!s.overtime && s.quarter < 4) {
        s.quarter++; s.timeRemaining = QUARTER_SECONDS;
        if (s.quarter === 3) this._periodChange = 'half';
        this._emit('period', 'Quarter ' + s.quarter + '.');
        return true;
      }
      // Like classic football: finish a complete overtime period, and repeat only if tied.
      if (s.homeScore !== s.awayScore) { this._endGame(); return false; }
      s.overtime = true; s.overtimePeriod++; s.timeRemaining = QUARTER_SECONDS;
      if (s.overtimePeriod === 1) this._periodChange = 'overtime';
      this._emit('period', 'Overtime' + (s.overtimePeriod > 1 ? ' ' + s.overtimePeriod : '') + '.');
      return true;
    }
    continuePlay() {
      const s = this.s;
      if (s.phase !== 'result' || !this._pending || s.resultRevealRemaining > 0) return false;
      const pending = this._pending;
      this._pending = null; this._flight = null; this._cpuPass = null;
      // The try comes before the period can end, just like an untimed down.
      if (pending.conversion) return this._beginConversion();
      if (pending.switchPossession) {
        s.possessionNumber++;
        if (this.options.format === 'drives' && s.possessionNumber >= s.maxDrives * 2) {
          this._endGame(); return true;
        }
        s.possession = s.possession === 'home' ? 'away' : 'home';
        s.drive = Math.floor(s.possessionNumber / 2) + 1;
        s.fieldPosition = pending.spot; s.down = 1;
        s.distance = Math.min(10, s.possession === 'home' ? 100 - s.fieldPosition : s.fieldPosition);
      }
      s.conversion = null;
      this._periodChange = null;
      if (!this._advancePeriod()) return true;
      if (this.options.kickoffs) {
        // A new half kicks off by the coin toss; overtime starts with a new toss.
        if (this._periodChange === 'half') {
          s.possessionNumber++;
          const receiver = s.secondHalfReceiver || (s.firstPossession === 'home' ? 'away' : 'home');
          return this._setupKickoff(receiver === 'home' ? 'away' : 'home');
        }
        if (this._periodChange === 'overtime') return this._startToss();
        if (pending.kickoff) return this._setupKickoff(pending.kickoff.team, pending.kickoff.from);
      }
      s.phase = 'playcall'; s.result = null; s.playId = null;
      s.message = s.possession === 'home' ? 'Choose your next play.' : 'Choose your defense. Be ready for a run or a pass.';
      this._formation(); this._emit('ready', s.message); return true;
    }
    snapshot() {
      const s = this.s;
      // Only settled boundaries are saved: reloading never creates a timing penalty.
      if (!['playcall','result','final'].includes(s.phase)) return null;
      // A kickoff is saved only at your own kickoff call; the visitors' kick is already under way.
      if (s.kickoff && !(s.phase === 'playcall' && s.kickoff.team === 'home')) return null;
      return copy({ version: 3, options: this.options, state: s, pending: this._pending });
    }
    restore(value) {
      try {
        if (typeof value === 'string') value = JSON.parse(value);
        if (!value || ![1, 2, 3].includes(value.version) || !value.state) return false;
        const t = value.state, legacy = value.version === 1;
        if (!['playcall','result','final'].includes(t.phase) || !['home','away'].includes(t.possession)) return false;
        const intRange = (n, a, b) => Number.isInteger(n) && n >= a && n <= b;
        const format = legacy ? 'drives' : value.options && value.options.format;
        if (!['drives','regulation'].includes(format) || (!legacy && t.format !== format)) return false;
        const regulation = format === 'regulation';
        if (!intRange(t.homeScore, 0, 9999) || !intRange(t.awayScore, 0, 9999) ||
            !intRange(t.drive, 1, regulation ? 5001 : 4) || !intRange(t.possessionNumber, 0, regulation ? 10000 : 8) ||
            t.maxDrives !== 4 || !intRange(t.down, 1, 5) ||
            !finite(t.distance) || t.distance <= 0 || t.distance > 110 ||
            !finite(t.fieldPosition) || t.fieldPosition < 0 || t.fieldPosition > 100 ||
            !finite(t.elapsed) || t.elapsed < 0) return false;
        const quarter = legacy ? 1 : t.quarter;
        const timeRemaining = legacy ? QUARTER_SECONDS : t.timeRemaining;
        const overtime = legacy ? false : t.overtime;
        const overtimePeriod = legacy ? 0 : t.overtimePeriod;
        if (!intRange(quarter, 1, 4) || !finite(timeRemaining) || timeRemaining < 0 || timeRemaining > QUARTER_SECONDS ||
            typeof overtime !== 'boolean' || !intRange(overtimePeriod, 0, 10000) ||
            (overtime && (quarter !== 4 || overtimePeriod < 1)) || (!overtime && overtimePeriod !== 0)) return false;
        if (!regulation && (overtime || quarter !== 1)) return false;
        // Possessions alternate from whoever had the ball first. A new half can hand the
        // ball to the same team again, so only the four-possession game checks the order.
        const firstPossession = t.firstPossession === 'away' ? 'away' : 'home';
        if (t.firstPossession !== undefined && !['home', 'away'].includes(t.firstPossession)) return false;
        const expectedTeam = (t.possessionNumber % 2 === 0) === (firstPossession === 'home') ? 'home' : 'away';
        if (t.phase !== 'final' && !regulation && (t.possessionNumber >= 8 || (!t.toss && expectedTeam !== t.possession))) return false;
        const toss = t.toss === undefined || t.toss === null ? null : t.toss;
        if (![null, 'call', 'choose'].includes(toss) || (toss && t.phase !== 'playcall')) return false;
        const kickoff = t.kickoff === undefined || t.kickoff === null ? null : t.kickoff;
        if (kickoff && (typeof kickoff !== 'object' || kickoff.team !== 'home' || t.possession !== 'away' || t.phase !== 'playcall' || ![KICKOFF_SPOT, SAFETY_KICK_SPOT].includes(kickoff.from))) return false;
        const secondHalfReceiver = t.secondHalfReceiver === undefined || t.secondHalfReceiver === null ? null : t.secondHalfReceiver;
        if (![null, 'home', 'away'].includes(secondHalfReceiver)) return false;
        if (t.phase === 'playcall' && (t.down > 4 || t.fieldPosition <= 0 || t.fieldPosition >= 100)) return false;
        // Only the two settled conversion states can be saved: the home choice and a two-point call.
        const conversion = t.conversion === undefined || t.conversion === null ? null : t.conversion;
        if (![null, 'choose', 'two'].includes(conversion) || (conversion && t.phase !== 'playcall') ||
            (conversion === 'choose' && t.possession !== 'home')) return false;
        if (t.phase === 'result') {
          if (!value.pending || typeof value.pending.switchPossession !== 'boolean') return false;
          if (value.pending.switchPossession && (!finite(value.pending.spot) || value.pending.spot < 1 || value.pending.spot > 99)) return false;
          if (value.pending.conversion !== undefined && (typeof value.pending.conversion !== 'boolean' || (value.pending.conversion && value.pending.switchPossession))) return false;
          const next = value.pending.kickoff;
          if (next !== undefined && (!next || !['home', 'away'].includes(next.team) || ![KICKOFF_SPOT, SAFETY_KICK_SPOT].includes(next.from) || !value.pending.switchPossession)) return false;
          if (!t.result || typeof t.result.title !== 'string' || typeof t.result.detail !== 'string' ||
              t.result.title.length > 120 || t.result.detail.length > 500) return false;
        }
        if (t.phase === 'final' && ((!regulation && t.possessionNumber !== 8) ||
            (regulation && (quarter !== 4 || timeRemaining !== 0 || t.homeScore === t.awayScore)))) return false;
        const stats = emptyStats();
        if (t.stats !== undefined) {
          if (!t.stats || typeof t.stats !== 'object') return false;
          for (const team of ['home', 'away']) for (const key of STAT_KEYS) {
            const n = t.stats[team] && t.stats[team][key];
            if (n === undefined) continue;
            if (!finite(n) || Math.abs(n) > 99999) return false;
            stats[team][key] = n;
          }
        }
        const clean = {
          phase: t.phase, possession: t.possession, possessionNumber: t.possessionNumber,
          drive: t.drive, maxDrives: 4, fieldPosition: t.fieldPosition,
          down: t.down, distance: t.distance, homeScore: t.homeScore, awayScore: t.awayScore,
          format: format, quarter: quarter, timeRemaining: timeRemaining, overtime: overtime, overtimePeriod: overtimePeriod,
          elapsed: t.elapsed, result: t.result ? { title: String(t.result.title).slice(0, 120), detail: String(t.result.detail).slice(0, 500) } : null,
          message: typeof t.message === 'string' ? t.message.slice(0, 500) : '',
          playId: PLAYS.concat(DEFENSE_PLAYS, SPECIAL_DEFENSE).some(p => p.id === t.playId) ? t.playId : null,
          conversion: conversion, stats: stats,
          toss: toss, kickoff: kickoff ? { team: 'home', from: kickoff.from, safety: kickoff.from === SAFETY_KICK_SPOT, kind: 'deep' } : null,
          secondHalfReceiver: secondHalfReceiver, firstPossession: firstPossession
        };
        // Rebuild safe formations; never trust serialized player/ball coordinates.
        // The throwaway reset announces nothing: its opening toss is not the saved game.
        const onEvent = this.onEvent; this.onEvent = function () {};
        try { this.reset(Object.assign({}, optionsFor(value.options), { format: format })); } finally { this.onEvent = onEvent; }
        Object.assign(this.s, clean); this._formation();
        this._pending = t.phase === 'result' ? { switchPossession: value.pending.switchPossession,
          spot: value.pending.switchPossession ? value.pending.spot : undefined, conversion: value.pending.conversion === true,
          kickoff: value.pending.kickoff ? { team: value.pending.kickoff.team, from: value.pending.kickoff.from } : undefined } : null;
        return true;
      } catch (_) { return false; }
    }
  }
  FootballSim.PLAYS = PLAYS;
  FootballSim.DEFENSE_PLAYS = DEFENSE_PLAYS;
  FootballSim.CONVERSION_CHOICES = CONVERSION_CHOICES;
  FootballSim.KICKOFF_PLAYS = KICKOFF_PLAYS;
  FootballSim.KICKOFF_TOUCHBACK = KICKOFF_TOUCHBACK;
  FootballSim.KICK_TARGETS = KICK_TARGETS;
  FootballSim.TUNING = TUNING;
  FootballSim.AUTO_PLAY_AFTER = AUTO_PLAY_AFTER;
  FootballSim.CHARGE_ZONE = CHARGE_ZONE;
  FootballSim.CHARGE_MAX = CHARGE_MAX;
  FootballSim.SWITCH_AFTER = SWITCH_AFTER;
  FootballSim.ROLE_SPEED = ROLE_SPEED;
  global.FootballSim = FootballSim;
  if (typeof module !== 'undefined' && module.exports) module.exports = FootballSim;
})(typeof window !== 'undefined' ? window : globalThis);
