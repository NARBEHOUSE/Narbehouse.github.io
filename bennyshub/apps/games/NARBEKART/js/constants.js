/**
 * NARBE Racer — shared constants.
 *
 * Every module reads its geometry and rules from here so the road the world
 * draws, the lanes the karts steer between, the ramps the karts jump from and the
 * rules each mode applies can never drift apart. Change a number here, never a
 * copy of it somewhere else.
 */
NK.C = (function () {
  'use strict';

  /* ── Road & lanes ─────────────────────────────────────────────────────────
   * Five fixed lanes, exactly like Benny's Race Tracks. Lanes are what make a
   * racer playable with a switch: releasing always settles onto a lane centre,
   * so "do nothing" is a stable, survivable state, and every pickup, pad and
   * hazard sits in a lane so the guidance can name a reachable answer.
   */
  const LANE_COUNT = 5;
  const LANE_W = 3.6;
  const MID_LANE = (LANE_COUNT - 1) / 2;
  const ROAD_HALF = 9.5;       // half the paved width
  const SHOULDER = 4.5;        // verge beyond the paving on each side
  const SEG = 4;               // target metres between centreline nodes

  /** Lateral offset of a lane centre (+ = right of the driving line). */
  function laneX(i) { return (i - MID_LANE) * LANE_W; }
  /** Nearest lane to a lateral offset. */
  function laneOf(x) {
    const i = Math.round(x / LANE_W + MID_LANE);
    return i < 0 ? 0 : (i > LANE_COUNT - 1 ? LANE_COUNT - 1 : i);
  }
  /** Mirror mode flips the layout left-to-right, so lanes flip too. */
  function mirrorLane(i) { return LANE_COUNT - 1 - i; }

  /* ── Karts ────────────────────────────────────────────────────────────── */
  const KART_HALF = 1.1;       // half width, for contact tests
  const KART_LEN = 2.8;        // nose to tail
  const RACERS = 12;           // grid size, humans included
  const LAPS = 3;

  /* ── Steering ────────────────────────────────────────────────────────────
   * Seconds to slide across one lane while a switch is held. Deliberately
   * unhurried: the player must be able to watch the kart move and let go in
   * time. A character/kart handling stat scales this by at most ±10 %.
   */
  const STEER_SPEEDS = {
    slow:   { id: 'slow',   name: 'Slow',   laneTime: 0.95 },
    normal: { id: 'normal', name: 'Normal', laneTime: 0.75 },
    fast:   { id: 'fast',   name: 'Fast',   laneTime: 0.58 }
  };
  const STEER_ORDER = ['slow', 'normal', 'fast'];
  /** Ease onto the nearest lane centre after a release (1/s). */
  const SETTLE_LAMBDA = 6;

  /* ── Engine classes ───────────────────────────────────────────────────── */
  const CLASSES = {
    easy:   { id: 'easy',   name: 'Easy',   cc: '50cc',  speed: 24, cpuSkill: 0.35, emoji: '🐢' },
    medium: { id: 'medium', name: 'Medium', cc: '100cc', speed: 29, cpuSkill: 0.6,  emoji: '🐇' },
    fast:   { id: 'fast',   name: 'Fast',   cc: '150cc', speed: 34, cpuSkill: 0.85, emoji: '🚀' },
    mirror: { id: 'mirror', name: 'Mirror', cc: '150cc', speed: 34, cpuSkill: 0.85, emoji: '🪞', mirror: true }
  };
  const CLASS_ORDER = ['easy', 'medium', 'fast', 'mirror'];

  /* ── Boosts ───────────────────────────────────────────────────────────── */
  const BOOST_MUL = 1.45;      // rocket, boost pad, mini-turbo, trick landing
  const COIN_MAX = 10;
  const COIN_SPEED = 0.012;    // +1.2 % top speed per coin held

  // Automatic ramps use the same dimensions as the drawn wedges and a
  // fixed landing distance, so every engine class clears the obstacle.
  const JUMPS = {
    jump: { rampLength: 6, rampHeight: 1.1, flightLength: 32, peakHeight: 4.5 },
    glide: { rampLength: 9, rampHeight: 1.8, flightLength: 90, peakHeight: 12 }
  };

  /* ── Drift (automatic) ────────────────────────────────────────────────── */
  const DRIFT_K = 0.0085;      // |curvature| that counts as a drift bend (r ≈ 118 m)
  const DRIFT_END_K = 0.006;   // below this the bend is over and the turbo fires
  const DRIFT_LEVELS = [0.9, 1.9, 3.0];        // seconds of charge: blue, orange, purple
  const MINI_TURBO = [0.6, 1.0, 1.5];          // boost seconds per level

  /* ── Grand Prix ───────────────────────────────────────────────────────── */
  const POINTS = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

  /* ── Rule sets ────────────────────────────────────────────────────────────
   * The two modes differ only in consequences, never in controls — a player
   * who learns to steer in No-Fail is already ready for Open.
   */
  const MODES = {
    nofail: {
      id: 'nofail',
      name: 'No-Fail',
      guardrails: true,        // every edge railed: the kart can't leave the road
      canFall: false,
      offroadSlow: false,
      hitKind: 'wobble',       // what a hit does to a HUMAN racer
      padsAllLanes: true,      // boost pads span the road
      zapper: false,           // Leader Zapper left out of the item pool
      cpuPace: 0.9,            // CPU speed relative to the class speed
      unlockNeedsPodium: false
    },
    open: {
      id: 'open',
      name: 'Open',
      guardrails: false,
      canFall: true,
      offroadSlow: true,
      hitKind: 'spin',
      padsAllLanes: false,
      zapper: true,
      cpuPace: 1.0,
      unlockNeedsPodium: true
    }
  };

  /* ── Hit effects ──────────────────────────────────────────────────────── */
  const HIT = {
    spin:   { time: 1.1, speedMul: 0.35, coinLoss: 3, invuln: 1.3 },
    wobble: { time: 0.6, speedMul: 0.8,  coinLoss: 0, invuln: 1.3 }
  };

  /* ── Players ─────────────────────────────────────────────────────────── */
  const PLAYER_COLORS = ['#ffc233', '#3d9ee0'];   // P1 gold, P2 sky — used for view frames
  const PLAYER_KEYS = ['Space', 'Enter'];         // 2P: one switch each

  return {
    LANE_COUNT, LANE_W, MID_LANE, ROAD_HALF, SHOULDER, SEG,
    laneX, laneOf, mirrorLane,
    KART_HALF, KART_LEN, RACERS, LAPS,
    STEER_SPEEDS, STEER_ORDER, SETTLE_LAMBDA,
    CLASSES, CLASS_ORDER,
    BOOST_MUL, COIN_MAX, COIN_SPEED, JUMPS,
    DRIFT_K, DRIFT_END_K, DRIFT_LEVELS, MINI_TURBO,
    POINTS, MODES, HIT,
    PLAYER_COLORS, PLAYER_KEYS
  };
})();
