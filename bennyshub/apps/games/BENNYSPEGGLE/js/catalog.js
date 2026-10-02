/**
 * Benny's P3GL — the catalog: every thing that can sit on a board, every
 * power, every goal, and the three play modes.
 *
 * Pure data, shared by the game, the editor and the node tools. Names and
 * descriptions here are what players hear, so they are written to be spoken:
 * short, plain, no symbols.
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};

  /* ── The board ────────────────────────────────────────────────────────── */
  const BOARD = Object.freeze({
    W: 1000,
    H: 1080,
    LAUNCH_X: 500,
    LAUNCH_Y: 58,
    PLATE_Y: 1046,          // centre line of the base plate
    PLATE_H: 22,
    DRAIN_Y: 1110,          // a ball below this is gone
    SAFE_TOP: 150,          // editor: nothing placed above this line
    SAFE_BOTTOM: 985,       // editor: nothing placed below this line
    MARGIN: 24              // editor: keep clear of the walls
  });

  /* ── Peg colours ──────────────────────────────────────────────────────────
   * A peg's colour is decoration until a level's goal names it. Every colour
   * has a spoken name, and a goal colour is always marked with a star as
   * well, so colour is never the only signal.
   */
  const PEG_COLORS = Object.freeze({
    blue:   { name: 'blue',   hex: '#2f8cff', glow: '#9fd0ff' },
    orange: { name: 'orange', hex: '#ff7a1a', glow: '#ffc48a' },
    green:  { name: 'green',  hex: '#22c55e', glow: '#a7f3c0' },
    purple: { name: 'purple', hex: '#9b5cff', glow: '#d6c2ff' },
    pink:   { name: 'pink',   hex: '#ff4fa3', glow: '#ffb8da' },
    yellow: { name: 'yellow', hex: '#ffd21f', glow: '#fff0a0' },
    teal:   { name: 'teal',   hex: '#14c8c0', glow: '#9ff3ee' },
    red:    { name: 'red',    hex: '#ff3b3b', glow: '#ffb0b0' }
  });
  const PEG_COLOR_IDS = Object.keys(PEG_COLORS);

  /* ── Things on the board ──────────────────────────────────────────────────
   * shape: 'peg' (a circle, radius r) or 'brick' (a box w × h, angle a).
   * role:
   *   basic    breakable, counts for Clear the Board
   *   power    breakable, counts for Clear the Board, does something when hit
   *   hazard   bad news; breakable ones do not count for Clear the Board
   *   solid    never breaks
   *   special  its own rules (portals, lanterns, keys, gates)
   * timing (powers): 'now' happens the moment it is hit; 'next' is saved for
   * your next shot. Saved powers stack: collect two and both fire together.
   */
  const TYPES = Object.freeze({
    peg:        { shape: 'peg', role: 'basic', name: 'Peg', points: 100,
                  desc: 'Hit it to light it up. Lit pegs clear away when your ball is gone.' },
    gem:        { shape: 'peg', role: 'basic', name: 'Gem', points: 500, color: '#47e6ff',
                  desc: 'A sparkling gem worth lots of points. Some levels ask you to collect them all.' },
    lantern:    { shape: 'peg', role: 'special', name: 'Lantern', points: 250, color: '#ffb547',
                  desc: 'Hit a lantern to light it. It stays lit and glowing.' },
    key:        { shape: 'peg', role: 'special', name: 'Key', points: 200,
                  desc: 'Hit a key to open every gate of the same colour.' },
    bumper:     { shape: 'peg', role: 'solid', name: 'Bumper', points: 25, color: '#ff4fd8',
                  desc: 'A springy bumper that never breaks. It bounces your ball away fast.' },
    steel:      { shape: 'peg', role: 'solid', name: 'Steel post', points: 0, color: '#9aa7b8',
                  desc: 'A steel post that never breaks.' },
    portal:     { shape: 'peg', role: 'special', name: 'Portal', points: 0,
                  desc: 'Your ball jumps through to the matching portal and keeps going.' },

    multiball:  { shape: 'peg', role: 'power', timing: 'now', name: 'Multiball', points: 200, color: '#38e1ff',
                  desc: 'Two more balls burst out and join the shot.' },
    extra:      { shape: 'peg', role: 'power', timing: 'now', name: 'Extra ball', points: 200, color: '#3ddc84',
                  desc: 'Gives you one more ball.' },
    multiplier: { shape: 'peg', role: 'power', timing: 'now', name: 'Double points', points: 200, color: '#ffd21f',
                  desc: 'Doubles every point for the rest of this shot.' },
    zap:        { shape: 'peg', role: 'power', timing: 'now', name: 'Lightning', points: 200, color: '#b8a6ff',
                  desc: 'Lightning jumps to the six nearest pegs and lights them.' },
    spray:      { shape: 'peg', role: 'power', timing: 'next', name: 'Spray shot', points: 200, color: '#ffe066',
                  desc: 'Your next shot fires three balls in a fan.' },
    net:        { shape: 'peg', role: 'power', timing: 'next', name: 'Safety net', points: 200, color: '#ffffff',
                  desc: 'On your next shot, a net catches your ball at the bottom and bounces it back up for a while.' },
    blast:      { shape: 'peg', role: 'power', timing: 'next', name: 'Blast ball', points: 200, color: '#ff6a2a',
                  desc: 'Your next ball explodes on its first hit, lighting pegs and cracking bricks around it.' },
    fire:       { shape: 'peg', role: 'power', timing: 'next', name: 'Fireball', points: 200, color: '#ff3d1f',
                  desc: 'Your next ball burns straight through pegs for a few seconds, lighting everything it touches.' },
    guide:      { shape: 'peg', role: 'power', timing: 'next', name: 'Super guide', points: 200, color: '#5effc4',
                  desc: 'Your next shot shows a long aiming line with every bounce.' },

    thief:      { shape: 'peg', role: 'hazard', name: 'Thief', points: 50, color: '#4b4b5a',
                  desc: 'Hazard. Steals one of your saved powers. With none saved, it steals points.' },
    shrink:     { shape: 'peg', role: 'hazard', name: 'Shrinker', points: 50, color: '#7d3cff',
                  desc: 'Hazard. Shrinks your ball for the rest of the shot.' },
    sludge:     { shape: 'peg', role: 'hazard', name: 'Sludge', points: 50, color: '#5d7a1f',
                  desc: 'Hazard. Sticky sludge slows your ball right down.' },
    spike:      { shape: 'peg', role: 'hazard', name: 'Spike', points: 0, color: '#ff2a4a',
                  desc: 'Hazard. A spike that never breaks. It pops any ball that touches it.' },
    hole:       { shape: 'peg', role: 'hazard', name: 'Black hole', points: 0, color: '#1a0f2e',
                  desc: 'Hazard. Pulls nearby balls in and swallows them.' },

    brick:      { shape: 'brick', role: 'brick', name: 'Barrier brick', points: 300,
                  desc: 'A brick that breaks after a number of hits. Its colour and dots show how many hits are left.' },
    armor:      { shape: 'brick', role: 'brick', name: 'Armour brick', points: 400, color: '#8e5cff',
                  desc: 'Only blasts, fireballs and lightning can crack an armour brick.' },
    glass:      { shape: 'brick', role: 'brick', name: 'Glass', points: 150, color: '#bfefff',
                  desc: 'Glass shatters at the first touch, and your ball flies straight through.' },
    wall:       { shape: 'brick', role: 'solid', name: 'Steel wall', points: 0, color: '#8b97a8',
                  desc: 'A steel wall that never breaks.' },
    gate:       { shape: 'brick', role: 'special', name: 'Gate', points: 0,
                  desc: 'A locked gate. Hit the key of the same colour to open it.' }
  });

  /** Barrier brick colours by hits left, so the colour and the dots agree. */
  const BRICK_HP = Object.freeze({
    1: { name: 'green', hex: '#3ddc84' },
    2: { name: 'yellow', hex: '#ffd21f' },
    3: { name: 'orange', hex: '#ff8a1f' },
    4: { name: 'red', hex: '#ff3b3b' }
  });

  /** Key and gate colours (a subset of peg colours, kept far apart). */
  const KEY_COLORS = ['blue', 'pink', 'yellow', 'green'];
  /** Portal pairs, by pair number. */
  const PORTAL_COLORS = ['#38e1ff', '#ff8a1f', '#c38bff', '#8cff5a'];

  const POWER_IDS = Object.keys(TYPES).filter(k => TYPES[k].role === 'power');
  const NEXT_POWERS = POWER_IDS.filter(k => TYPES[k].timing === 'next');
  const HAZARD_IDS = Object.keys(TYPES).filter(k => TYPES[k].role === 'hazard');

  /** Does this item have to break for "Clear the board"? */
  function countsForClear(t) {
    const r = TYPES[t] && TYPES[t].role;
    return r === 'basic' || r === 'power' || t === 'key';
  }
  function isBreakablePeg(t) {
    const r = TYPES[t] && TYPES[t].role;
    return TYPES[t] && TYPES[t].shape === 'peg' && (r === 'basic' || r === 'power' || t === 'key' || t === 'thief' || t === 'shrink' || t === 'sludge');
  }
  function isBreakableBrick(t) { return t === 'brick' || t === 'armor' || t === 'glass'; }

  /* ── Goals ─────────────────────────────────────────────────────────────── */
  const GOALS = Object.freeze({
    clear:    { name: 'Clear the board', short: 'Clear' },
    color:    { name: 'Break the colour', short: 'Colour' },
    gems:     { name: 'Collect the gems', short: 'Gems' },
    lanterns: { name: 'Light the lanterns', short: 'Lanterns' },
    bricks:   { name: 'Break the bricks', short: 'Bricks' },
    score:    { name: 'Reach the score', short: 'Score' },
    count:    { name: 'Break enough pegs', short: 'Pegs' },
    chain:    { name: 'Big chain', short: 'Chain' }
  });

  /* ── Play modes ───────────────────────────────────────────────────────────
   * Three moods, three rule sets, one set of controls. Physics numbers are in
   * board pixels and seconds. Levels may scale gravity and speed a little.
   */
  const MODES = Object.freeze({
    cozy: {
      id: 'cozy', name: 'Cozy', tagline: 'Relaxed and gentle. No pressure, just play.',
      speech: 'Cozy. Relaxed and gentle, with soft music. You can never run out of balls.',
      gravity: 900, launch: 740, ballR: 12, aimMax: 84,
      pegE: 0.70, wallE: 0.80, brickE: 0.64, bumperE: 1.10, friction: 0.02,
      plate: { w: 280, speed: 110, mode: 'catch' },
      guide: 'long', noFail: true, refill: 5,
      ballBonus: 1000, freeBallAt: [10000, 30000, 60000], scoreScale: 1,
      slots: [5000, 10000, 25000, 10000, 5000]
    },
    vivid: {
      id: 'vivid', name: 'Vivid', tagline: 'Bright worlds and a steady climb in challenge.',
      speech: 'Vivid. Bright, colourful worlds, and each level gets a little harder.',
      gravity: 1200, launch: 860, ballR: 11, aimMax: 85,
      pegE: 0.76, wallE: 0.84, brickE: 0.68, bumperE: 1.16, friction: 0.02,
      plate: { w: 210, speed: 170, mode: 'bounce' },
      guide: 'medium', noFail: false, refill: 0,
      ballBonus: 3000, freeBallAt: [25000, 75000, 125000], scoreScale: 1,
      slots: [10000, 25000, 50000, 25000, 10000]
    },
    hyper: {
      id: 'hyper', name: 'Hyper', tagline: 'A wild neon ride through space. Fast, bouncy, and tough.',
      speech: 'Hyper. A wild neon ride through space. Fast and bouncy, and it gets tough.',
      gravity: 1500, launch: 970, ballR: 11, aimMax: 86,
      pegE: 0.84, wallE: 0.88, brickE: 0.72, bumperE: 1.22, friction: 0.015,
      plate: { w: 180, speed: 250, mode: 'bounce' },
      guide: 'short', noFail: false, refill: 0,
      ballBonus: 5000, freeBallAt: [40000, 100000, 200000], scoreScale: 1,
      slots: [25000, 50000, 100000, 50000, 25000]
    }
  });
  const MODE_IDS = ['cozy', 'vivid', 'hyper'];

  /** Fever builds from newly lit or broken pieces within one shot. */
  const FEVER = Object.freeze([
    { hits: 0, mult: 1 },
    { hits: 5, mult: 2 },
    { hits: 10, mult: 3 },
    { hits: 15, mult: 5 }
  ]);

  /**
   * Aim speeds in degrees per second, slowest first. These are the original
   * P3GL's four presets (Super slow is the default).
   */
  const AIM_SPEEDS = Object.freeze({
    'Super slow': 21,
    'Slow': 29,
    'Medium': 42,
    'Fast': 60
  });
  const AIM_SPEED_IDS = Object.keys(AIM_SPEEDS);

  /** Aim guide lengths, in simulated seconds and bounces shown. */
  const GUIDES = Object.freeze({
    short:  { name: 'Short', time: 0.32, bounces: 0 },
    medium: { name: 'Medium', time: 0.75, bounces: 1 },
    long:   { name: 'Long', time: 1.4, bounces: 2 },
    super:  { name: 'Super', time: 3.0, bounces: 6 }
  });

  P3.catalog = {
    BOARD, PEG_COLORS, PEG_COLOR_IDS, TYPES, BRICK_HP, KEY_COLORS, PORTAL_COLORS,
    POWER_IDS, NEXT_POWERS, HAZARD_IDS, GOALS, MODES, MODE_IDS, FEVER,
    AIM_SPEEDS, AIM_SPEED_IDS, GUIDES,
    countsForClear, isBreakablePeg, isBreakableBrick
  };
})(typeof window !== 'undefined' ? window : globalThis);
