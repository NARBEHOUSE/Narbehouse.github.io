/** Benny's Sphere Splash - off-the-ball swimming and the AI's choices.
 *
 * Two jobs, both pure (no DOM, no THREE):
 *  - steer(): where every player wants to swim this tick, from the team's formation,
 *    who has the ball, and the FFX behaviours (Normal chases the carrier for a short
 *    time, Mark follows a marked opponent everywhere, keepers hold their goal).
 *  - choices: the same decisions a human makes (stance, pass / shoot / dribble),
 *    made from the same odds the human is shown. The AI never sees anything the
 *    player could not, so Coach mode and the CPU teams play by exactly the rules
 *    the player does.
 */
(function (root) {
  'use strict';
  const SS = root.SS = root.SS || {};
  const D = () => SS.DATA, RU = () => SS.DATA.RULES;

  /* ── small vector helpers on plain {x,y,z} objects (state must stay JSON) ── */
  const V = {
    set: (o, x, y, z) => { o.x = x; o.y = y; o.z = z; return o; },
    copy: (o, a) => { o.x = a.x; o.y = a.y; o.z = a.z; return o; },
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
    scale: (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
    len: a => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z),
    dist: (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2),
    norm: a => { const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; },
    lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }),
    /** Distance from p to segment a-b, and how far along it (0..1). */
    toSegment(p, a, b) {
      const ab = V.sub(b, a), ap = V.sub(p, a), l2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z || 1;
      const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / l2));
      return { d: V.dist(p, { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t }), t };
    },
  };

  /** Team 0 attacks +z, team 1 attacks -z. */
  const dirOf = team => (team === 0 ? 1 : -1);
  const goalOf = team => ({ x: 0, y: 0, z: dirOf(team) * RU().GOAL_Z });        // the goal this team attacks
  const ownGoal = team => ({ x: 0, y: 0, z: -dirOf(team) * RU().GOAL_Z });

  /** How dangerous a spot is for `team` attacking: 0 far away .. 1 point blank. */
  function threat(pos, team) {
    const d = V.dist(pos, goalOf(team));
    return Math.pow(Math.max(0, Math.min(1, 1 - (d - 4) / 24)), 1.5);
  }

  const WANDER = 2.2, WANDER_PERIOD = 7;          // metres, seconds per loop
  const WANDER_PHASE = { LF: 0, RF: 1.7, MF: 3.1, LD: 4.4, RD: 5.6, GL: 0 };
  function anchor(state, pl, attacking) {
    const f = D().FORMATIONS[state.teams[pl.team].formation] || D().FORMATIONS.normal;
    const a = (attacking ? f.att : f.def)[pl.pos], dir = dirOf(pl.team);
    const out = { x: a[0] * dir, y: a[1], z: a[2] * dir };
    if (pl.pos !== 'GL') {
      // The shape slides toward the ball, so a team defends where the play is.
      const ball = state.ball.p;
      out.x += (ball.x - out.x) * 0.22; out.y += (ball.y - out.y) * 0.22; out.z += ball.z * 0.25;
      // Nobody parks. Each fielder drifts round their spot on a slow loop of their own
      // (Bryan's M2 playtest: off-ball swimmers sat still 61% of the time, and the quiet
      // spells between passes looked dead). It follows the match clock, so it saves and
      // replays exactly like everything else.
      const k = WANDER_PHASE[pl.pos] + pl.team * 2.1, t = state.clock + state.period * 300;
      const w = 2 * Math.PI / (WANDER_PERIOD + k * 0.4);
      out.x += Math.sin(t * w + k) * WANDER; out.z += Math.cos(t * w + k) * WANDER;
      out.y += Math.sin(t * w * 1.3 + k * 2) * WANDER * 0.6;
    }
    return clampToSphere(out, RU().R - 2);
  }
  function clampToSphere(p, r) {
    const l = V.len(p);
    return l > r ? V.scale(p, r / l) : p;
  }

  /** The point every player wants to reach this tick, and how hard they swim for it. */
  function steer(state, pl, i) {
    const R = RU(), ball = state.ball, players = state.players;
    const carrier = ball.owner != null ? players[ball.owner] : null;
    const ours = carrier && carrier.team === pl.team;
    if (pl.sleep > 0) return { to: pl.p, pace: 0 };
    if (pl.stun > 0) return { to: pl.p, pace: 0.2 };

    if (ball.owner === i) {
      // The carrier swims at the goal, bending away from whoever is closest - less
      // and less the nearer the goal gets, and never away from the keeper: close in,
      // you drive at the net.
      const goal = goalOf(pl.team), bend = 1.4 * (1 - threat(pl.p, pl.team));
      let dir = V.norm(V.sub(goal, pl.p));
      players.forEach(o => {
        if (o.team === pl.team || o.sleep > 0 || o.pos === 'GL') return;
        const d = V.dist(o.p, pl.p);
        if (d < 7) { const away = V.norm(V.sub(pl.p, o.p)); dir = V.add(dir, V.scale(away, bend / Math.max(1, d))); }
      });
      return { to: V.add(pl.p, V.scale(V.norm(dir), 4)), pace: R.CARRY_SLOW };
    }

    if (pl.pos === 'GL') {
      // Keepers hold a small box in front of their own goal, tracking the ball - and come
      // out to meet a carrier who reaches the goal's keep-out, since nobody else may get
      // between them and the net (a challenge, instead of a pile-up in the goal).
      const g = ownGoal(pl.team), toBall = V.sub(ball.p, g), l = V.len(toBall);
      if (carrier && !ours && V.dist(carrier.p, g) < R.GOAL_KEEP_OUT - R.GOAL_KEEP_BACK + 1.5) {
        return { to: V.add(carrier.p, V.scale(V.norm(V.sub(g, carrier.p)), 1.2)), pace: 1.0 };
      }
      return { to: V.add(g, V.scale(V.norm(toBall), Math.min(3, l * 0.2))), pace: 0.9 };
    }

    if (ball.flight) {
      const f = ball.flight;
      if (f.catcher === i) return { to: f.to, pace: 1.1 };
    }

    if (ball.owner == null && !ball.flight) {
      // Loose ball: the two nearest of each team go for it, the rest hold shape.
      const mine = players.map((o, j) => ({ j, d: o.team === pl.team && o.pos !== 'GL' && o.sleep <= 0 ? V.dist(o.p, ball.p) : 1e9 }))
        .sort((a, b) => a.d - b.d);
      if (mine[0].j === i || mine[1].j === i) return { to: ball.p, pace: 1.1 };
      return { to: anchor(state, pl, false), pace: 0.8 };
    }

    if (ours) {
      // Get open: sit at the attacking anchor, nudged away from the nearest marker.
      let to = anchor(state, pl, true);
      let near = null, nd = 1e9;
      players.forEach(o => { if (o.team !== pl.team) { const d = V.dist(o.p, to); if (d < nd) { nd = d; near = o; } } });
      if (near && nd < 3) to = V.add(to, V.scale(V.norm(V.sub(to, near.p)), 3 - nd));
      return { to: clampToSphere(to, R.R - 1.5), pace: 0.85 };
    }

    if (carrier) {
      // Defending.
      const f = D().FORMATIONS[state.teams[pl.team].formation] || D().FORMATIONS.normal;
      const marks = state.teams[pl.team].marks || {};
      if (f.mark && marks[i] != null) {
        const m = players[marks[i]], g = ownGoal(pl.team);
        return { to: V.add(m.p, V.scale(V.norm(V.sub(g, m.p)), 1.5)), pace: 1.0 };      // goal-side of your man
      }
      if (pl.beaten > 0) return { to: anchor(state, pl, false), pace: 0.6 };
      if (state.chasers[pl.team].includes(i) && pl.rest <= 0) {
        const lead = V.add(carrier.p, V.scale(carrier.v, 0.6));
        return { to: lead, pace: 1.0, chasing: true };
      }
      return { to: anchor(state, pl, false), pace: pl.rest > 0 ? 0.7 : 0.9 };
    }
    return { to: anchor(state, pl, false), pace: 0.8 };
  }

  /** Who hunts the carrier this tick: the formation's `chase` count of nearest fielders. */
  function pickChasers(state, team) {
    const ball = state.ball;
    if (ball.owner == null || state.players[ball.owner].team === team) return [];
    const f = D().FORMATIONS[state.teams[team].formation] || D().FORMATIONS.normal;
    const c = state.players[ball.owner];
    return state.players.map((pl, j) => ({ j, pl }))
      .filter(o => o.pl.team === team && o.pl.pos !== 'GL' && o.pl.sleep <= 0 && o.pl.beaten <= 0 && o.pl.rest <= 0)
      .sort((a, b) => V.dist(a.pl.p, c.p) - V.dist(b.pl.p, c.p))
      .slice(0, f.chase).map(o => o.j);
  }

  /* ── choices ─────────────────────────────────────────────────────────── */

  /** How likely these defenders are to go for the tackle rather than block. The
   *  attacker's odds are computed against this mix - it never sees the real choice. */
  function stanceMix(state, enc) {
    const c = state.players[enc.carrier];
    const at = enc.defenders.reduce((s, j) => s + state.players[j].eff.at, 0);
    let p = 0.5 + (at - c.eff.en) / 60;
    if (threat(c.p, c.team) > 0.5) p -= 0.2;             // near our goal, stand in the lanes
    return Math.max(0.2, Math.min(0.8, p));
  }

  function lossCost(state, pl) {
    // Losing the ball near your own goal costs more.
    return 0.25 + 0.35 * threat(pl.p, 1 - pl.team);
  }

  /** The value of an option to the attacking team, from its odds. */
  function valueOf(state, dec, o) {
    const c = state.players[dec.carrier], loss = lossCost(state, c), here = threat(c.p, c.team);
    const p = o.odds.p, techCost = o.tech ? D().TECHS[o.tech].hp / 2000 : 0;
    switch (o.kind) {
      // In close, a shot is the point of the whole possession; recycling the ball
      // round the goal only gives the defense another go.
      case 'shoot': return p * (1.2 + here * 0.6) - (1 - p) * loss * 0.4 - techCost;
      case 'pass': {
        // A pass is worth where it puts the ball. Going forward is the point; every
        // safe pass in a row is worth a little less, so a team keeps attacking
        // instead of passing sideways forever.
        const t = state.players[o.target], there = threat(t.p, c.team);
        const forward = V.dist(t.p, goalOf(c.team)) < V.dist(c.p, goalOf(c.team)) - 3 ? 0.12 : 0;
        return p * (there + 0.06 + forward - (state.passChain || 0) * 0.06) - (1 - p) * loss - techCost;
      }
      case 'dribble': return p * (here + 0.2) - (1 - p) * loss - techCost;
      case 'swim': return here * 0.9 + 0.08;
      default: return 0;
    }
  }

  function softmaxPick(values, temp, rnd) {
    const m = Math.max(...values), w = values.map(v => Math.exp((v - m) / temp)), s = w.reduce((a, b) => a + b, 0);
    let r = rnd() * s;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return w.length - 1;
  }
  /** Softmax weights, for the defense's odds against the attacker's likely choice. */
  function softmaxWeights(values, temp) {
    const m = Math.max(...values), w = values.map(v => Math.exp((v - m) / temp)), s = w.reduce((a, b) => a + b, 0);
    return w.map(x => x / s);
  }

  const ATTACK_TEMP = 0.06;
  function chooseAttack(state, dec, rnd) {
    const team = state.teams[state.players[dec.carrier].team];
    const vals = dec.options.map(o => valueOf(state, dec, o) * (o.tech ? 0.9 + team.morale * 0.2 : 1));
    return dec.options[softmaxPick(vals, ATTACK_TEMP, rnd)].id;
  }
  function chooseStance(state, dec, rnd) {
    // Pick the stance with the better odds of winning the ball, with a little
    // unpredictability so the attacker cannot simply read it.
    const vals = dec.options.map(o => o.odds.p);
    return dec.options[softmaxPick(vals, 0.08, rnd)].id;
  }
  function chooseKeeperPass(state, dec, rnd) { return chooseAttack(state, dec, rnd); }

  /** The CPU coach: at a review (about once a minute, and at halftime) it may change its
   *  formation - chasing the game when behind late on, shutting up shop when ahead late,
   *  and otherwise now and then trying another shape. Returns a formation id, or null
   *  to stay. Only formations the team may use are offered. */
  const COACH_CHASE = ['centerAttack', 'doubleSides', 'counter'];
  const COACH_HOLD = ['allOutDefense', 'counter'];
  const COACH_TRY = ['normal', 'leftSide', 'rightSide', 'centerAttack', 'allOutDefense', 'counter', 'doubleSides'];
  function coachPick(state, team, rnd, lateShare) {
    const diff = state.score[team] - state.score[1 - team], cur = state.teams[team].formation;
    let pool, p;
    if (lateShare > 0.55 && diff < 0) { pool = COACH_CHASE; p = 0.75; }
    else if (lateShare > 0.55 && diff > 0) { pool = COACH_HOLD; p = 0.6; }
    else { pool = COACH_TRY; p = 0.35; }
    if (rnd() > p) return null;
    const opts = pool.filter(f => f !== cur && D().FORMATIONS[f]);
    return opts.length ? opts[Math.floor(rnd() * opts.length)] : null;
  }

  SS.ai = { V, dirOf, goalOf, ownGoal, threat, steer, pickChasers, stanceMix, valueOf, softmaxWeights,
    chooseAttack, chooseStance, chooseKeeperPass, coachPick, clampToSphere, anchorOf: anchor, ATTACK_TEMP };
})(typeof window !== 'undefined' ? window : globalThis);
