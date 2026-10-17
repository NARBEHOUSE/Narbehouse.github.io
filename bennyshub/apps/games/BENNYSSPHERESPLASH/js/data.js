/** Benny's Sphere Splash - game data: rules constants, techniques, formations, teams.
 *
 * Pure data, no DOM and no THREE, so the match simulation can run in Node for the
 * balance tests (tools/check-sim.cjs) exactly as it runs in the browser.
 *
 * Everything here is an original homage to the sport of blitzball in Final Fantasy
 * X / X-2: the same shape of rules, but our own names for teams, players and
 * techniques. Nothing is named after a Square Enix character, team or move.
 */
(function (root) {
  'use strict';
  const SS = root.SS = root.SS || {};

  /* ── Rules constants (tuned by tools/check-sim.cjs) ─────────────────────── */
  const RULES = {
    R: 20,                  // sphere radius, metres
    GOAL_Z: 17.8,           // goal centre on the z axis; team 0 attacks +z
    GOAL_SIZE: 3.6,         // triangle "radius" - a shot is on target if it reaches the plane
    GOAL_KEEP_OUT: 5,       // nobody but that goal's keeper swims into this ball round a goal (a player piled
    GOAL_KEEP_BACK: 1.5,    // ...into the net looks wrong). Centred this far BEHIND the goal, so it reaches
                            // 3.5 m out in front, covers the whole frame, and pushes toward the pool, not the skin
    TICK: 0.1,              // simulation step, game seconds
    HALF_STANDARD: 300,     // two 5-minute halves, as in FFX
    HALF_SHORT: 120,        // Quick Game's short halves
    OVERTIME: 300,          // golden-goal periods (tournaments)
    OVERTIME_CAP: 12,       // safety valve; the tests assert it is never reached
    COACH_EVERY: 60,        // a CPU coach reviews its formation about this often (game seconds), and at halftime

    ENGAGE_RADIUS: 2.3,     // an opponent this close to the carrier starts an encounter
    JOIN_RADIUS: 4.2,       // ...and every opponent this close joins it
    IN_PATH: 0.1,           // ...but only if they are in front of the carrier (cosine to the goal line)
    MAX_ENGAGED: 3,
    BEATEN_TIME: 4.0,       // defenders who lost an encounter drift before they can re-engage
    ENCOUNTER_COOLDOWN: 10.0,
    GRACE: 8.0,             // a player who has just got the ball cannot be engaged straight away

    SPEED_SLIP: 0.5,        // dribbling: EN bonus per point of SP over the tacklers
    DIFFICULTY: { easy: 1.4, normal: 1.2, hard: 1.1 },   // the player's team's stats x this (sim.js setBoost). Beamers
                            // (sensible choices, Quick Game) win ~80% / ~47% / ~25%; at x1 they won 0 of 60
    KEY_SHOT: 0.35,       // Key moments mode: an encounter stops for the player when Shoot is at least this likely (Fair)
    POINT_RANGE: 5,         // a last, point-blank chance (no "keep swimming" here)
    PASS_DECAY: 0.35,       // PA lost per metre of travel
    SHOT_DECAY: 1.5,        // SH lost per metre of travel
    LANE_WIDTH: 2.4,        // how close to a pass/shot line a defender must be to block it
    INTERCEPT_RATIO: 1.4,   // a blocker whose BL beats the remaining PA/SH by this much catches it
    BLOCK_SHARE: 0.5,
    READ_PER_PASS: 0.12,    // each pass in a row lets the defense read the next: blockers +12% BL each       // a blocker who does not stop the ball still takes this share of their BL off it
    BLOCK_STANCE_BONUS: 1.25,
    BLOCK_STANCE_REACH: 1.6, // defenders standing in the lanes cover a wider lane
    HALF_TACKLE: 0.5,       // tackles made from the "wrong" stance land at half strength
    CATCH_RATIO: 1.5,       // keeper catches (rather than parries) when CA beats SH by this much

    BALL_SPEED: 13,         // m/s, passes and shots in flight
    SWIM_BASE: 2.2,         // m/s at SP 0
    SWIM_PER_SP: 0.055,     // m/s per point of SP
    CARRY_SLOW: 0.95,       // carrying the ball slows you down, a little
    HP_CARRY_DRAIN: 1.6,    // HP per second while carrying
    HP_REGEN: 3.0,          // HP per second off the ball
    HP_PASS: 8, HP_SHOT: 16,
    LOW_HP: 0.25,           // below this share of max HP: PA and SH halved, no techniques
    CHASE_TIME: 6,          // Normal formation: defenders chase the carrier "for a short time"
    CHASE_REST: 3,
    KEEPER_HOLD: 1.5,       // seconds a keeper holds a caught ball before distributing
    PICKUP_RADIUS: 1.1,
    STATUS_TIME: 20,        // Poison / Wilt last this long
    WILT: 0.75,             // Wilt takes a quarter off one stat
    DAZED_KEEPER: 0.5,      // a sleeping keeper still gets a hand to it, at half strength
    GHOST_KEEPER: 0.6,      // a Ghost Shot the keeper loses sight of
    POISON_DRAIN: 2.0,      // HP per second
    ROLL_SPREAD: 0.35,      // every stat roll is stat * (1 - s .. 1 + s), triangular
    KEEPER_SPREAD: 0.6,     // shot against keeper: both sides roll this wide (see resolveShot)
  };

  /* ── Odds words, shown and spoken on every choice ───────────────────────── */
  function oddsWord(p) { return p >= 0.65 ? 'Good chance' : p >= 0.35 ? 'Fair' : 'Risky'; }

  /* ── Techniques (FFX's list, renamed) ───────────────────────────────────── */
  // Stat bonuses are 60% of FFX's: tuned so a technique is a real edge but never
  // outweighs the gap between a weak team and a good one (tools/ablate.cjs).
  // kind: shot | pass | tackle | dribble | keeper | volley.   hp: HP cost.
  // Effects are read by sim.js; `learn` is the level a player can pick it up by
  // Tech Copy (M5) - key techs are handed out per player in TEAMS below.
  const TECHS = {
    beaminBlast:  { name: "Beamin' Blast",    kind: 'shot',   hp: 120, sh: 3,  clear: 2, learn: 99, signature: true },
    beaminBlast2: { name: "Super Beamin' Blast", kind: 'shot',   hp: 220, sh: 6, clear: 3, ghost: 0.6, learn: 99, signature: true },
    spinShot:     { name: 'Spin Shot',        kind: 'shot',   hp: 90,  sh: 1,  spin: 4, learn: 8 },
    ghostShot:    { name: 'Ghost Shot',       kind: 'shot',   hp: 180, sh: 2,  ghost: 0.6, learn: 24 },
    stingShot:    { name: 'Sting Shot',       kind: 'shot',   hp: 20,  sh: 2,  status: 'poison', chance: 0.4, learn: 3 },
    stingShot2:   { name: 'Super Sting Shot', kind: 'shot',   hp: 40,  sh: 3,  status: 'poison', chance: 0.7, learn: 14 },
    snoozeShot:   { name: 'Snooze Shot',      kind: 'shot',   hp: 45,  sh: 2,  status: 'sleep',  chance: 0.3, learn: 6 },
    snoozeShot2:  { name: 'Super Snooze Shot',kind: 'shot',   hp: 80,  sh: 3,  status: 'sleep',  chance: 0.7, learn: 20 },
    wiltShot:     { name: 'Wilt Shot',        kind: 'shot',   hp: 30,  sh: 2,  status: 'wilt',   chance: 0.4, learn: 5 },
    stingPass:    { name: 'Sting Pass',       kind: 'pass',   hp: 40,  pa: 2,  status: 'poison', chance: 0.3, learn: 4 },
    snoozePass:   { name: 'Snooze Pass',      kind: 'pass',   hp: 40,  pa: 2,  status: 'sleep',  chance: 0.3, learn: 7 },
    wiltPass:     { name: 'Wilt Pass',        kind: 'pass',   hp: 40,  pa: 2,  status: 'wilt',   chance: 0.3, learn: 6 },
    longPass:     { name: 'Long Lob',         kind: 'pass',   hp: 30,  pa: 4,  learn: 9 },
    stingTackle:  { name: 'Sting Tackle',     kind: 'tackle', hp: 40,  at: 1,  status: 'poison', chance: 0.5, learn: 4 },
    snoozeTackle: { name: 'Snooze Tackle',    kind: 'tackle', hp: 50,  at: 1,  status: 'sleep',  chance: 0.4, learn: 8 },
    wiltTackle:   { name: 'Wilt Tackle',      kind: 'tackle', hp: 40,  at: 1,  status: 'wilt',   chance: 0.5, learn: 6 },
    drainTackle:  { name: 'Drain Tackle',     kind: 'tackle', hp: 20,  at: 2,  drain: 60, learn: 10 },
    bruiserBash:  { name: 'Bruiser Bash',     kind: 'tackle', hp: 60,  at: 5,  learn: 16 },
    slipStream:   { name: 'Slipstream',       kind: 'dribble', hp: 40, dodge: 1, learn: 6 },
    toughShell:   { name: 'Tough Shell',      kind: 'dribble', hp: 50, en: 6, learn: 12 },
    superSave:    { name: 'Super Save',       kind: 'keeper', hp: 140, ca: 2,  learn: 99, keeperOnly: true },
    reboundShot:  { name: 'Rebound Shot',     kind: 'volley', hp: 10,  chance: 0.5, learn: 5 },
  };

  /* ── Formations ─────────────────────────────────────────────────────────── */
  // Anchors are [x, y, z] in metres for a team attacking +z; sim.js mirrors z for
  // the other side. `att` is where each role sits when we have the ball, `def` when
  // they do. `chase` = how many defenders hunt the carrier; `mark` = follow the
  // marked opponent all over the pool (FFX "Mark"). Unlock by total wins, as in FFX.
  const F = (att, def, extra) => Object.assign({ att, def, chase: 1 }, extra);
  const FORMATIONS = {
    normal: Object.assign(F(
      { LF: [-6, 2, 9], RF: [6, -2, 9], MF: [0, 0, 3], LD: [-5, 0, -5], RD: [5, 0, -5], GL: [0, 0, -16.5] },
      { LF: [-5, 1, 3], RF: [5, -1, 3], MF: [0, 0, -3], LD: [-4, 0, -9], RD: [4, 0, -9], GL: [0, 0, -16.5] }),
      { name: 'Normal', wins: 0, blurb: 'Fielders chase the ball carrier for a short time.' }),
    mark: Object.assign(F(
      { LF: [-6, 2, 9], RF: [6, -2, 9], MF: [0, 0, 3], LD: [-5, 0, -5], RD: [5, 0, -5], GL: [0, 0, -16.5] },
      { LF: [-5, 1, 3], RF: [5, -1, 3], MF: [0, 0, -3], LD: [-4, 0, -9], RD: [4, 0, -9], GL: [0, 0, -16.5] },
      { mark: true, chase: 1 }), { name: 'Mark', wins: 0, blurb: 'Defenders follow the players you marked, all over the pool.' }),
    leftSide: Object.assign(F(
      { LF: [-8, 2, 9], RF: [-2, -2, 10], MF: [-5, 0, 3], LD: [-7, 0, -5], RD: [-2, 0, -6], GL: [0, 0, -16.5] },
      { LF: [-7, 1, 3], RF: [-2, -1, 2], MF: [-5, 0, -3], LD: [-6, 0, -9], RD: [-2, 0, -10], GL: [0, 0, -16.5] }),
      { name: 'Left Side', wins: 0, blurb: 'Everyone crowds the left of the pool. The right is left open.' }),
    rightSide: Object.assign(F(
      { LF: [2, 2, 10], RF: [8, -2, 9], MF: [5, 0, 3], LD: [2, 0, -6], RD: [7, 0, -5], GL: [0, 0, -16.5] },
      { LF: [2, 1, 2], RF: [7, -1, 3], MF: [5, 0, -3], LD: [2, 0, -10], RD: [6, 0, -9], GL: [0, 0, -16.5] }),
      { name: 'Right Side', wins: 0, blurb: 'Everyone crowds the right of the pool. The left is left open.' }),
    centerAttack: Object.assign(F(
      { LF: [-2.5, 1, 11], RF: [2.5, -1, 11], MF: [0, 0, 8], LD: [-5, 0, -4], RD: [5, 0, -4], GL: [0, 0, -16.5] },
      { LF: [-2.5, 1, 4], RF: [2.5, -1, 4], MF: [0, 0, 1], LD: [-4, 0, -9], RD: [4, 0, -9], GL: [0, 0, -16.5] }, { chase: 2 }),
      { name: 'Center Attack', wins: 5, blurb: 'All three fielders charge down the middle together.' }),
    allOutDefense: Object.assign(F(
      { LF: [-5, 2, 6], RF: [5, -2, 6], MF: [0, 0, 0], LD: [-4, 0, -9], RD: [4, 0, -9], GL: [0, 0, -16.5] },
      { LF: [-4, 1, -2], RF: [4, -1, -2], MF: [0, 0, -7], LD: [-3, 0, -12], RD: [3, 0, -12], GL: [0, 0, -16.5] }, { chase: 2 }),
      { name: 'All-out Defense', wins: 15, blurb: 'Fielders block the carrier; defenders guard the goal.' }),
    flatLine: Object.assign(F(
      { LF: [-7, 0, 9], RF: [7, 0, 9], MF: [0, 0, 9], LD: [-3.5, 0, 7], RD: [3.5, 0, 7], GL: [0, 0, -16.5] },
      { LF: [-7, 0, 1], RF: [7, 0, 1], MF: [0, 0, 1], LD: [-3.5, 0, -1], RD: [3.5, 0, -1], GL: [0, 0, -16.5] }, { chase: 2 }),
      { name: 'Flat Line', wins: 25, blurb: 'Everyone charges in a line. Big attack, thin defense.' }),
    counter: Object.assign(F(
      { LF: [-4, 2, 12], RF: [4, -2, 12], MF: [0, 0, -4], LD: [-4, 0, -10], RD: [4, 0, -10], GL: [0, 0, -16.5] },
      { LF: [-4, 1, 8], RF: [4, -1, 8], MF: [0, 0, -6], LD: [-4, 0, -11], RD: [4, 0, -11], GL: [0, 0, -16.5] }, { chase: 1 }),
      { name: 'Counter', wins: 35, blurb: 'Forwards wait up front; everyone else packs around our goal.' }),
    doubleSides: Object.assign(F(
      { LF: [-7, 2, 10], RF: [7, -2, 10], MF: [0, 0, 4], LD: [-7, 0, 0], RD: [7, 0, 0], GL: [0, 0, -16.5] },
      { LF: [-6, 1, 2], RF: [6, -1, 2], MF: [0, 0, 0], LD: [-6, 0, -8], RD: [6, 0, -8], GL: [0, 0, -16.5] }, { chase: 1 }),
      { name: 'Double Sides', wins: 40, blurb: 'Left and right pairs hold their sides; the midfielder hunts the ball.' }),
  };

  const POSITIONS = ['LF', 'RF', 'MF', 'LD', 'RD', 'GL'];
  const POSITION_NAMES = { LF: 'Left forward', RF: 'Right forward', MF: 'Midfielder', LD: 'Left defender', RD: 'Right defender', GL: 'Keeper' };

  /* ── Teams ──────────────────────────────────────────────────────────────── */
  // Stats follow FFX's scale at the start of a season. p(name, pos, level, stats, techs, look)
  // stats: [hp, sp, en, at, pa, bl, sh, ca]
  function p(name, pos, level, s, techs, look) {
    return { name, pos, level, stats: { hp: s[0], sp: s[1], en: s[2], at: s[3], pa: s[4], bl: s[5], sh: s[6], ca: s[7] }, techs: techs || [], look: look || {} };
  }
  const TEAMS = [
    { id: 'beamers', name: 'Bayside Beamers', short: 'Beamers', home: 'Bayside Isle',
      blurb: 'A little island team of underdogs with a big heart.', kit: 0xff8a1f, accent: 0xffe14d, badge: 'round', morale: 0.5,
      players: [
        p('Benji Tide',   'LF', 5, [260, 24, 12, 8, 14, 5, 18, 2], ['spinShot']),
        p('Rory Reef',    'RF', 4, [220, 20, 10, 7, 12, 6, 15, 2], ['stingShot']),
        p('Mara Kelp',    'MF', 4, [240, 18, 14, 10, 16, 8, 9, 2], ['longPass']),
        p('Otto Shoal',   'LD', 4, [260, 14, 16, 12, 8, 12, 5, 3], ['stingTackle']),
        p('Juno Swell',   'RD', 3, [230, 15, 14, 11, 9, 11, 5, 3], []),
        p('Pip Harbor',   'GL', 5, [300, 10, 10, 6, 10, 8, 3, 16], ['superSave']),
        p('Tess Current', 'MF', 2, [200, 17, 10, 8, 11, 7, 8, 2], []),
        p('Wes Driftwood','LD', 2, [210, 13, 13, 10, 7, 10, 4, 3], []),
      ] },
    { id: 'harbor', name: 'Harbor Stars', short: 'Stars', home: 'Starlight Harbor',
      blurb: 'The big-city champions. Sharp shooting, sharper passing.', kit: 0x2f6bff, accent: 0xf5f7ff, alt: { kit: 0xffc928, accent: 0x1a2a6c }, badge: 'star', morale: 0.7,
      players: [
        p('Ace Marlowe',  'LF', 12, [330, 25, 15, 12, 18, 8, 23, 2], ['spinShot', 'stingShot2']),
        p('Nova Brightwater','RF', 11, [310, 25, 14, 11, 17, 8, 21, 2], ['wiltShot']),
        p('Cass Lumen',   'MF', 11, [300, 22, 16, 13, 22, 10, 14, 2], ['longPass', 'wiltPass']),
        p('Duke Anchor',  'LD', 10, [320, 18, 20, 16, 11, 15, 7, 3], ['drainTackle']),
        p('Vera Mast',    'RD', 10, [300, 18, 19, 15, 11, 15, 7, 3], ['wiltTackle']),
        p('Sol Beacon',   'GL', 12, [360, 12, 14, 8, 12, 10, 4, 21], ['superSave']),
        p('Lux Pier',     'RF', 8, [280, 24, 12, 10, 14, 7, 18, 2], []),
        p('Gil Mooring',  'RD', 8, [290, 16, 17, 14, 9, 13, 6, 3], []),
      ] },
    { id: 'reef', name: 'Reef Raiders', short: 'Raiders', home: 'Coral Port',
      blurb: 'Tough tacklers from the tropical port. They hit hard.', kit: 0x1fbf6a, accent: 0x0d3b24, badge: 'hex', morale: 0.6,
      players: [
        p('Kai Coral',    'LF', 8, [290, 22, 17, 14, 13, 8, 20, 2], ['stingShot']),
        p('Lani Sprout',  'RF', 7, [270, 21, 15, 13, 12, 8, 18, 2], []),
        p('Moku Tusk',    'MF', 8, [310, 19, 19, 17, 15, 11, 11, 2], ['bruiserBash']),
        p('Tala Boulder', 'LD', 8, [330, 15, 22, 19, 9, 13, 6, 3], ['stingTackle', 'snoozeTackle']),
        p('Rua Ironshell','RD', 7, [320, 15, 21, 18, 9, 12, 6, 3], ['wiltTackle']),
        p('Keo Clamp',    'GL', 8, [340, 11, 13, 9, 11, 9, 3, 19], []),
        p('Hina Lagoon',  'MF', 5, [260, 18, 14, 12, 12, 9, 9, 2], []),
        p('Pono Wake',    'LD', 5, [280, 14, 17, 15, 8, 11, 5, 3], []),
      ] },
    { id: 'gliders', name: 'Gearhead Gliders', short: 'Gliders', home: 'Rivet Dunes',
      blurb: 'Desert tinkerers who swim faster than anyone.', kit: 0xffd21f, accent: 0x3a2b17, alt: { kit: 0x3a2b17, accent: 0xffd21f }, badge: 'gear', morale: 0.55,
      players: [
        p('Zip Sprocket', 'LF', 7, [250, 32, 14, 9, 14, 6, 20, 2], ['slipStream']),
        p('Vex Flywheel', 'RF', 7, [240, 31, 13, 9, 13, 6, 19, 2], ['snoozeShot']),
        p('Rikka Bolt',   'MF', 7, [260, 29, 14, 10, 17, 9, 12, 2], ['snoozePass']),
        p('Bram Piston',  'LD', 6, [270, 24, 16, 13, 9, 12, 6, 3], []),
        p('Nix Cogsworth','RD', 6, [260, 24, 15, 13, 9, 12, 6, 3], ['snoozeTackle']),
        p('Tink Gasket',  'GL', 7, [300, 16, 11, 7, 11, 8, 3, 17], []),
        p('Dash Rivet',   'RF', 5, [230, 29, 9, 8, 12, 5, 15, 2], []),
        p('Moxie Spanner','MF', 5, [240, 26, 11, 9, 13, 7, 10, 2], []),
      ] },
    { id: 'summit', name: 'Summit Horns', short: 'Horns', home: 'Frostpeak',
      blurb: 'Mountain giants. Slow in the water, impossible to knock off the ball.', kit: 0x7b4dff, accent: 0xe6e0ff, badge: 'horn', morale: 0.45,
      players: [
        p('Grom Ridge',   'LF', 9, [360, 17, 24, 18, 12, 10, 21, 2], ['bruiserBash']),
        p('Hala Scree',   'RF', 8, [340, 16, 23, 17, 11, 10, 19, 2], []),
        p('Tor Crag',     'MF', 9, [370, 15, 26, 19, 14, 12, 12, 2], ['toughShell']),
        p('Brun Glacier', 'LD', 9, [390, 13, 27, 21, 9, 15, 7, 3], ['bruiserBash']),
        p('Oska Tundra',  'RD', 8, [380, 13, 26, 20, 9, 14, 7, 3], ['drainTackle']),
        p('Yeti Frost',   'GL', 9, [400, 10, 18, 10, 10, 11, 3, 20], []),
        p('Kell Avalanche','MF', 6, [340, 14, 22, 17, 11, 11, 10, 2], []),
        p('Runa Boulderback','RD', 6, [350, 12, 23, 18, 8, 12, 5, 3], []),
      ] },
    { id: 'mistwood', name: 'Mistwood Monarchs', short: 'Monarchs', home: 'Mistwood Hollow',
      blurb: 'Graceful forest swimmers who pass rings round you.', kit: 0xe03a8c, accent: 0x2a1036, alt: { kit: 0x2a1036, accent: 0xe03a8c }, badge: 'leaf', morale: 0.65,
      players: [
        p('Sylvie Fern',  'LF', 10, [290, 23, 14, 10, 20, 9, 22, 2], ['ghostShot']),
        p('Orin Willow',  'RF', 9, [280, 22, 13, 10, 19, 9, 20, 2], ['wiltShot']),
        p('Elowen Moss',  'MF', 10, [300, 21, 15, 12, 25, 11, 12, 2], ['wiltPass', 'longPass']),
        p('Thorne Bramble','LD', 9, [300, 17, 17, 14, 13, 16, 6, 3], ['wiltTackle']),
        p('Ivy Rootwell', 'RD', 9, [290, 17, 16, 13, 13, 16, 6, 3], []),
        p('Ash Canopy',   'GL', 10, [330, 12, 13, 8, 13, 10, 3, 22], []),
        p('Wren Thicket', 'LF', 7, [260, 21, 12, 9, 16, 8, 17, 2], []),
        p('Rowan Glade',  'LD', 7, [270, 16, 15, 13, 11, 13, 5, 3], []),
      ] },
  ];

  // Teams whose looks read as one in the water (measured from rendered frames, see the
  // character checklist in DESIGN.md): when they meet, the first wears its `alt` kit.
  // The Beamers, the player's home team, never change.
  const CLASHES = [['gliders', 'beamers'], ['gliders', 'reef'], ['harbor', 'summit'], ['mistwood', 'summit']];

  SS.DATA = { RULES, TECHS, FORMATIONS, POSITIONS, POSITION_NAMES, TEAMS, CLASHES, oddsWord };
})(typeof window !== 'undefined' ? window : globalThis);
