/** Benny's Sphere Splash - the match simulation. Authoritative; the 3D view only shows it.
 *
 * Pure and deterministic: no DOM, no THREE, one seeded random stream, every piece
 * of state a plain JSON value. So the same seed plays the same match, a match can
 * be saved at any decision and resumed exactly, and tools/check-sim.cjs can play
 * thousands of matches in Node to tune the rules.
 *
 * The rules are FFX blitzball's (see js/data.js RULES for every constant):
 *  - swimming with the ball drains HP; passes, shots and techniques spend it;
 *  - an opponent who gets close starts an ENCOUNTER, and play freezes;
 *  - the defenders pick a stance - Tackle (strong against a dribble, but a tackler
 *    cannot block) or Block (stand in the lanes: strong against passes and shots);
 *  - the carrier then picks Pass, Shoot or Dribble, blind to the stance, with odds
 *    computed against how those defenders usually play;
 *  - PA and SH lose strength with distance and with every blocker in the lane, a
 *    shot that survives meets the keeper's CA, and a tackle takes AT off EN.
 * Every outcome is rolled once, the moment it is chosen, then acted out.
 *
 * API (see SS.sim.create):
 *   m.advance(seconds) -> events[]   run until the time is used or a decision is pending
 *   m.pending                        the decision waiting on a human, or null
 *   m.choose(optionId) -> events[]
 *   m.callNow(team)                  "Call it now" from the Huddle
 *   m.setTactics(team, {formation, marks})
 *   m.snapshot() / SS.sim.restore(snapshot)
 */
(function (root) {
  'use strict';
  const SS = root.SS = root.SS || {};

  const RU_KEY = () => SS.DATA.RULES.KEY_SHOT;
  const R = () => SS.DATA.RULES, T = () => SS.DATA.TECHS, A = () => SS.ai, V = () => SS.ai.V;

  /* ── random numbers: mulberry32, state kept in the match so it saves ────── */
  function stream(st) {
    return function () {
      st.r = (st.r + 0x6D2B79F5) | 0;
      let t = st.r;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(a, b) {
    let h = Math.imul((a ^ 0x9E3779B9) | 0, 0x85EBCA6B) ^ b;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) | 0;
  }
  /** A stat roll: triangular around the stat, ±spread (default ROLL_SPREAD). */
  function roll(v, rnd, spread) { const s = spread == null ? R().ROLL_SPREAD : spread; return v * (1 - s + s * (rnd() + rnd())); }

  /* ── setting up ────────────────────────────────────────────────────────── */
  const COUNTERS = () => ({ goals: 0, shots: 0, onTarget: 0, passes: 0, completed: 0, tackles: 0, tackleTries: 0,
    blocks: 0, intercepts: 0, saves: 0, techs: 0, encounters: 0, kept: 0 });

  function lineup(team) {
    const used = new Set(), pick = [];
    for (const pos of SS.DATA.POSITIONS) {
      let k = team.players.findIndex((p, i) => !used.has(i) && p.pos === pos);
      if (k < 0) k = team.players.findIndex((p, i) => !used.has(i) && p.pos !== 'GL');
      used.add(k); pick.push({ src: team.players[k], pos, k });
    }
    return pick;
  }

  function create(opts) {
    const RU = R();
    const seed = (opts.seed >>> 0) || 1;
    const s = {
      v: 1, seed, rng: { r: seed }, acc: 0,
      clock: 0, period: 1, periodLength: opts.halfLength || RU.HALF_STANDARD,
      halfLength: opts.halfLength || RU.HALF_STANDARD,
      overtime: !!opts.overtime, golden: false,
      stops: opts.stops || 'ours', human: opts.human == null ? null : opts.human,
      aiCoach: !!opts.aiCoach, coachNext: [0, 0],
      phase: 'kickoff', phaseT: 0, firstKick: 0, kickoffTeam: 0, score: [0, 0],
      teams: [0, 1].map(t => {
        const src = opts.teams[t];
        return { id: src.id, name: src.name, short: src.short || src.name, morale: src.morale == null ? 0.5 : src.morale,
          formation: (opts.formations && opts.formations[t]) || src.formation || 'normal', marks: {},
          stint: { at: 0, shots: [0, 0], goals: [0, 0] } };
      }),
      players: [],
      ball: { owner: null, p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, flight: null },
      chasers: [[], []], enc: null, encCooldown: 0, flags: { point: false },
      holdT: 0, pending: null, seq: 0, events: [], done: false, result: null,
      log: { possessions: 0, decisions: [0, 0], human: 0, encounters: 0 },
    };
    [0, 1].forEach(t => lineup(opts.teams[t]).forEach(({ src, pos, k }) => {
      const st = src.stats;
      s.players.push({
        team: t, pos, name: src.name, src: k, level: src.level || 1,
        base: Object.assign({}, st), eff: Object.assign({}, st),
        hp: st.hp, maxHp: st.hp, techs: (src.techs || []).slice(),
        p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 },
        sleep: 0, stun: 0, beaten: 0, rest: 0, chaseT: 0, poison: 0, wilt: null, wiltT: 0,
        st: COUNTERS(), mult: 1,
      });
    }));
    setBoost(s, opts.boost);
    s.coachNext = [RU.COACH_EVERY, RU.COACH_EVERY * 1.3];
    return new Match(s);
  }

  function Match(state) { this.s = state; }
  const M = Match.prototype;

  M.snapshot = function () { const c = JSON.parse(JSON.stringify(this.s)); c.events = []; return c; };
  function restore(snap) { return new Match(JSON.parse(JSON.stringify(snap))); }

  Object.defineProperty(M, 'pending', { get() { return this.s.pending; } });
  Object.defineProperty(M, 'done', { get() { return this.s.done; } });

  function emit(s, type, data) { s.events.push(Object.assign({ type, period: s.period, clock: +s.clock.toFixed(2) }, data)); }
  function drain(s) { const e = s.events; s.events = []; return e; }

  /* ── player helpers ────────────────────────────────────────────────────── */
  function lowHp(pl) { return pl.hp < R().LOW_HP * pl.maxHp; }
  function refreshEff(pl) {
    const k = pl.mult || 1;                          // Difficulty: see setBoost
    for (const key in pl.base) pl.eff[key] = key === 'hp' ? pl.base[key] : pl.base[key] * k;
    if (pl.wilt) pl.eff[pl.wilt] = Math.floor(pl.eff[pl.wilt] * R().WILT);
    if (lowHp(pl)) { pl.eff.pa = Math.floor(pl.eff.pa / 2); pl.eff.sh = Math.floor(pl.eff.sh / 2); }
  }
  /** Difficulty (Bryan, 2026-09-30). The Bayside Beamers, the player's underdogs, won ~3% of
   *  Quick Games even choosing well. Every stat but HP of the team the player plays for is
   *  multiplied by `boost` (RULES.DIFFICULTY); the other team and CPU-vs-CPU matches are
   *  untouched. It can change mid-match, from Settings. */
  function setBoost(s, boost) {
    s.boost = boost || 1;
    s.players.forEach(pl => { pl.mult = pl.team === s.human ? s.boost : 1; refreshEff(pl); });
  }
  M.setBoost = function (boost) { setBoost(this.s, boost); };
  function canUse(pl, id) {
    const t = T()[id];
    return t && pl.hp >= t.hp && !lowHp(pl) && (!t.keeperOnly || pl.pos === 'GL');
  }
  function techsOf(pl, kind) { return pl.techs.filter(id => T()[id] && T()[id].kind === kind && canUse(pl, id)); }
  function swimSpeed(pl) {
    const RU = R();
    return (RU.SWIM_BASE + pl.eff.sp * RU.SWIM_PER_SP) * (lowHp(pl) ? 0.85 : 1);
  }
  function keeperOf(s, team) { return s.players.findIndex(p => p.team === team && p.pos === 'GL'); }
  function applyStatus(s, j, status) {
    const pl = s.players[j], RU = R();
    if (status === 'poison') pl.poison = RU.STATUS_TIME;
    else if (status === 'sleep') pl.sleep = 8;
    else if (status === 'wilt') { pl.wilt = ['en', 'at', 'bl', 'pa', 'sh', 'ca'][pl.pos === 'GL' ? 5 : (s.seq % 3)]; pl.wiltT = RU.STATUS_TIME; }
    refreshEff(pl);
    emit(s, 'status', { player: j, status });
  }

  /* ── the clock and the phases ──────────────────────────────────────────── */
  M.advance = function (seconds) {
    const s = this.s, TICK = R().TICK;
    s.acc += seconds;
    while (s.acc >= TICK && !s.pending && !s.done) { tick(s); s.acc -= TICK; }
    if (s.pending || s.done) s.acc = 0;
    return drain(s);
  };

  function tick(s) {
    const RU = R(), TICK = RU.TICK;
    switch (s.phase) {
      case 'kickoff':
        if (s.phaseT === 0) placeKickoff(s);
        s.phaseT += TICK;
        if (s.phaseT >= 1.5) {
          s.phase = 'live'; s.phaseT = 0;
          const mf = s.players.findIndex(p => p.team === s.kickoffTeam && p.pos === 'MF');
          setOwner(s, mf, 'kickoff');
          emit(s, 'kickoff', { team: s.kickoffTeam, player: mf });
        }
        return;
      case 'goal':
        s.phaseT += TICK; moveAll(s, true);
        if (s.phaseT >= 3) {
          if (s.golden) return finish(s);
          s.phase = 'kickoff'; s.phaseT = 0;
        }
        return;
      case 'break':
        s.phaseT += TICK;
        if (s.phaseT >= 2) {
          s.period = 2; s.clock = 0; s.periodLength = s.halfLength;
          s.kickoffTeam = 1 - s.firstKick; s.phase = 'kickoff'; s.phaseT = 0;
          emit(s, 'secondHalf', {});
        }
        return;
    }
    // live, flight, hold: the clock runs.
    s.clock += TICK;
    upkeep(s, TICK);
    s.chasers = [A().pickChasers(s, 0), A().pickChasers(s, 1)];
    moveAll(s, false);
    if (s.phase === 'flight') { flight(s, TICK); return; }
    if (s.phase === 'hold') {
      s.holdT += TICK;
      if (s.holdT >= RU.KEEPER_HOLD) { s.phase = 'live'; attackDecision(s, 'keeper'); }
      return;
    }
    // live
    if (s.clock >= s.periodLength) return endPeriod(s);
    coachReview(s, false);
    if (s.ball.owner == null) looseBall(s);
    else checkEncounter(s) || checkShotChance(s);
  }

  function upkeep(s, dt) {
    const RU = R();
    if (s.encCooldown > 0) s.encCooldown -= dt;
    s.players.forEach((pl, j) => {
      if (pl.sleep > 0) pl.sleep -= dt;
      if (pl.stun > 0) pl.stun -= dt;
      if (pl.beaten > 0) pl.beaten -= dt;
      if (pl.rest > 0) pl.rest -= dt;
      if (pl.poison > 0) { pl.poison -= dt; pl.hp = Math.max(1, pl.hp - RU.POISON_DRAIN * dt); }
      if (pl.wilt) { pl.wiltT -= dt; if (pl.wiltT <= 0) pl.wilt = null; }
      if (s.ball.owner === j) pl.hp = Math.max(1, pl.hp - RU.HP_CARRY_DRAIN * dt);
      else pl.hp = Math.min(pl.maxHp, pl.hp + RU.HP_REGEN * dt);
      refreshEff(pl);
    });
  }

  function placeKickoff(s) {
    s.ball.flight = null; s.ball.owner = null; s.enc = null;
    V().set(s.ball.p, 0, 0, 0); V().set(s.ball.v, 0, 0, 0);
    const f = SS.DATA.FORMATIONS;
    s.players.forEach(pl => {
      const a = (f[s.teams[pl.team].formation] || f.normal).def[pl.pos], dir = A().dirOf(pl.team);
      let z = a[2] * dir;
      if (pl.pos !== 'GL') z = -dir * Math.max(2.5, Math.abs(a[2]) * 0.6 + 3);   // everyone in their own half
      V().set(pl.p, a[0] * dir, a[1], z); V().set(pl.v, 0, 0, 0);
      pl.beaten = pl.stun = pl.rest = pl.chaseT = 0;
    });
    const mf = s.players.find(p => p.team === s.kickoffTeam && p.pos === 'MF');
    V().set(mf.p, 0, 0, -A().dirOf(mf.team) * 0.6);
  }

  function moveAll(s, drift) {
    const RU = R(), TICK = RU.TICK, lim = RU.R - 1.2;
    s.players.forEach((pl, i) => {
      let to = pl.p, pace = 0.3, chasing = false;
      if (!drift) { const g = A().steer(s, pl, i); to = g.to; pace = g.pace; chasing = !!g.chasing; }
      const d = V().sub(to, pl.p), dl = V().len(d);
      const speed = swimSpeed(pl) * pace * Math.min(1, dl / 1.5);
      const want = dl > 1e-4 ? V().scale(d, speed / dl) : { x: 0, y: 0, z: 0 };
      const k = Math.min(1, TICK * 3);
      pl.v.x += (want.x - pl.v.x) * k; pl.v.y += (want.y - pl.v.y) * k; pl.v.z += (want.z - pl.v.z) * k;
      pl.p.x += pl.v.x * TICK; pl.p.y += pl.v.y * TICK; pl.p.z += pl.v.z * TICK;
      const l = V().len(pl.p);
      if (l > lim) { V().copy(pl.p, V().scale(pl.p, lim / l)); }
      keepOutOfGoals(pl.p, pl.v, pl.pos === 'GL' ? -A().dirOf(pl.team) : 0, lim);
      if (chasing) { pl.chaseT += TICK; if (pl.chaseT >= RU.CHASE_TIME) { pl.chaseT = 0; pl.rest = RU.CHASE_REST; } }
    });
    const b = s.ball;
    if (b.owner != null) {
      const c = s.players[b.owner], fwd = V().norm(V().len(c.v) > 0.1 ? c.v : V().sub(A().goalOf(c.team), c.p));
      V().copy(b.p, V().add(c.p, V().scale(fwd, 0.45)));
    } else if (!b.flight) {
      b.p.x += b.v.x * TICK; b.p.y += b.v.y * TICK; b.p.z += b.v.z * TICK;
      b.v.x *= 0.97; b.v.y *= 0.97; b.v.z *= 0.97;
      V().copy(b.p, A().clampToSphere(b.p, RU.R - 1.2));
      // A loose ball never settles inside a goal's keep-out, or no fielder could reach it.
      keepOutOfGoals(b.p, b.v, 0, RU.R - 1.2);
    }
  }

  /** Push a point out of the keep-out round each goal, except the goal whose side is
   *  `own` (+1 / -1: a keeper's own goal; 0 = none). Movement into the zone is cancelled,
   *  so a swimmer slides along its edge instead of bouncing. */
  function keepOutOfGoals(p, v, own, lim) {
    const RU = R(), r = RU.GOAL_KEEP_OUT;
    for (const side of [1, -1]) {
      if (side === own) continue;
      const cz = side * (RU.GOAL_Z + RU.GOAL_KEEP_BACK);
      let dx = p.x, dy = p.y, dz = p.z - cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= r) continue;
      if (d < 1e-4) { dx = 0; dy = 0; dz = -side; } else { dx /= d; dy /= d; dz /= d; }
      p.x = dx * r; p.y = dy * r; p.z = cz + dz * r;
      const vn = v.x * dx + v.y * dy + v.z * dz;
      if (vn < 0) { v.x -= vn * dx; v.y -= vn * dy; v.z -= vn * dz; }
      const l = V().len(p);
      if (l > lim) V().copy(p, V().scale(p, lim / l));
    }
  }

  function setOwner(s, j, how) {
    const prev = s.ball.owner != null ? s.players[s.ball.owner].team : s.possession;
    s.ball.owner = j; s.ball.flight = null;
    const team = s.players[j].team;
    s.encCooldown = Math.max(s.encCooldown, R().GRACE);
    if (team !== prev) {
      s.passChain = 0;
      s.flags = { point: false };
      s.log.possessions++;
      s.possession = team;
      emit(s, 'possession', { team, player: j, how });
    }
  }

  function looseBall(s) {
    const RU = R();
    let best = -1, bd = RU.PICKUP_RADIUS;
    s.players.forEach((pl, j) => {
      if (pl.sleep > 0 || pl.stun > 0) return;
      const d = V().dist(pl.p, s.ball.p);
      if (d < bd) { bd = d; best = j; }
    });
    if (best < 0) return;
    setOwner(s, best, 'pickup');
    emit(s, 'pickup', { player: best });
    // Rebound Shot: a volley straight at goal off a loose ball.
    const pl = s.players[best], vt = techsOf(pl, 'volley')[0];
    const rnd = stream(s.rng);
    if (vt && V().dist(pl.p, A().goalOf(pl.team)) < 16 && rnd() < T()[vt].chance) {
      const opt = { id: 'volley', kind: 'shoot', carrier: best, tech: null, volley: vt };
      pl.hp -= T()[vt].hp;
      emit(s, 'tech', { player: best, tech: vt });
      execute(s, opt, null);
    }
  }

  /* ── encounters and shot chances ──────────────────────────────────────── */
  function checkEncounter(s) {
    const RU = R();
    const c = s.players[s.ball.owner], cj = s.ball.owner;
    // No grace at the goal. Bryan saw "long periods of no activity ... near the goal":
    // a carrier who got the ball there (point-blank already spent this possession) swam
    // into the goal's keep-out and sat pinned, the keeper pressed against them, until
    // the catch's GRACE or a dodge's cooldown ran out - 6.7 s median, up to 10 s, about
    // 16 times a Quick Game. The challenge that ended it now comes at once.
    if (s.encCooldown > 0 && !atKeepOut(c)) return false;
    const able = s.players.map((pl, j) => ({ pl, j, d: V().dist(pl.p, c.p) }))
      .filter(o => o.pl.team !== c.team && o.pl.sleep <= 0 && o.pl.beaten <= 0 && o.pl.stun <= 0);
    // Only a defender in your path starts an encounter - one chasing from behind has
    // to get in front first. "Someone is in your way" is also what the player sees.
    const ahead = V().norm(V().sub(A().goalOf(c.team), c.p));
    const inPath = o => { const to = V().norm(V().sub(o.pl.p, c.p)); return to.x * ahead.x + to.y * ahead.y + to.z * ahead.z > RU.IN_PATH; };
    if (!able.some(o => o.d < RU.ENGAGE_RADIUS && inPath(o))) return false;
    const defenders = able.filter(o => o.d < RU.JOIN_RADIUS).sort((a, b) => a.d - b.d).slice(0, RU.MAX_ENGAGED).map(o => o.j);
    s.enc = { carrier: cj, defenders, stance: null, pTackle: 0.5 };
    s.enc.pTackle = A().stanceMix(s, s.enc);
    s.log.encounters++;
    c.st.encounters++;
    emit(s, 'engage', { carrier: cj, defenders: defenders.slice() });
    const defTeam = 1 - c.team;
    const dec = stanceDecision(s);
    if (humanDecides(s, defTeam, 'stance')) { s.pending = dec; s.log.human++; return true; }
    const pickId = A().chooseStance(s, dec, stream(s.rng)), pick = dec.options.find(o => o.id === pickId);
    setStance(s, pick);
    attackDecision(s, 'encounter');
    return true;
  }

  function checkShotChance(s) {
    const RU = R(), c = s.players[s.ball.owner];
    const d = V().dist(c.p, A().goalOf(c.team)), f = s.flags;
    // There is no longer a 14 m "shot chance" stop (Bryan, 2026-09-30). From there a shot
    // almost never scored - 55% fell short, 99% read Risky - so it was a stop whose answer
    // was always Keep Swimming, and one came ~1.5 s after every kickoff. Point-blank remains.
    if (!f.point && d <= RU.POINT_RANGE) { f.point = true; attackDecision(s, 'point'); return true; }
    // Pinned at the goal with nobody able to challenge (the keeper just dribbled past,
    // say): nowhere left to swim, so shoot or pass - never a wait.
    if (atKeepOut(c)) { f.point = true; attackDecision(s, 'point'); return true; }
    return false;
  }
  /** Touching the keep-out round the goal this carrier attacks. */
  function atKeepOut(c) {
    const RU = R();
    return V().dist(c.p, { x: 0, y: 0, z: A().dirOf(c.team) * (RU.GOAL_Z + RU.GOAL_KEEP_BACK) }) < RU.GOAL_KEEP_OUT + 0.3;
  }

  function humanDecides(s, team, kind) {
    if (s.human !== team) return false;
    switch (s.stops) {
      case 'coach': return false;
      case 'ours': return kind !== 'stance';
      case 'both': return true;
      case 'key': {
        if (kind === 'point' || kind === 'call') return true;
        // An encounter is "key" when it is a real chance to score - decided in
        // attackDecision once the Shoot odds are known (see keyEncounter).
        return false;
      }
    }
    return false;
  }

  /** Key moments mode: an encounter stops for the player only when Shoot is at
   *  least a Fair chance - a real chance to score. The AI plays the rest. */
  function keyEncounter(s, team, opts) {
    if (s.human !== team || s.stops !== 'key') return false;
    return opts.some(o => o.kind === 'shoot' && o.odds.p >= RU_KEY());
  }

  /* ── building a decision, with odds on every option ───────────────────── */
  const SAMPLES_HUMAN = 160, SAMPLES_AI = 48;

  function attackDecision(s, kind, forceHuman) {
    const cj = s.ball.owner, c = s.players[cj];
    let human = forceHuman || humanDecides(s, c.team, kind);
    const dec = { seq: ++s.seq, kind, team: c.team, carrier: cj,
      defenders: s.enc ? s.enc.defenders.slice() : [], options: [] };
    const opts = [], mates = s.players.map((p, j) => j).filter(j => j !== cj && s.players[j].team === c.team && s.players[j].sleep <= 0
      && (kind === 'keeper' || s.players[j].pos !== 'GL'));
    const add = (o) => { o.id = o.kind + (o.target != null ? ':' + o.target : '') + (o.tech ? ':' + o.tech : ''); o.carrier = cj; opts.push(o); };
    mates.forEach(j => {
      add({ kind: 'pass', target: j });
      techsOf(c, 'pass').forEach(t => add({ kind: 'pass', target: j, tech: t }));
    });
    if (kind !== 'keeper' && V().dist(c.p, A().goalOf(c.team)) <= 24) {
      add({ kind: 'shoot' });
      techsOf(c, 'shot').forEach(t => add({ kind: 'shoot', tech: t }));
    }
    if (kind === 'encounter') {
      add({ kind: 'dribble' });
      techsOf(c, 'dribble').forEach(t => add({ kind: 'dribble', tech: t }));
    }
    if (kind === 'call') add({ kind: 'swim' });
    let n = human ? SAMPLES_HUMAN : SAMPLES_AI;
    opts.forEach((o, i) => { o.odds = oddsFor(s, o, null, n, i); o.info = infoFor(s, o); });
    if (!human && kind === 'encounter' && keyEncounter(s, c.team, opts)) {
      human = true; n = SAMPLES_HUMAN;
      opts.forEach((o, i) => { o.odds = oddsFor(s, o, null, n, i); });     // full-precision odds for the player
    }
    dec.options = opts;
    s.log.decisions[c.team]++;
    if (human) { s.pending = dec; s.log.human++; emit(s, 'decision', { kind, team: c.team, carrier: cj }); return; }
    const pickId = A().chooseAttack(s, dec, stream(s.rng));
    execute(s, opts.find(o => o.id === pickId), s.enc && s.enc.stanceInfo);
  }

  function stanceDecision(s) {
    const enc = s.enc, defTeam = 1 - s.players[enc.carrier].team;
    const dec = { seq: ++s.seq, kind: 'stance', team: defTeam, carrier: enc.carrier, defenders: enc.defenders.slice(), options: [] };
    const opts = [{ id: 'tackle', kind: 'stance', stance: 'tackle' }, { id: 'block', kind: 'stance', stance: 'block' }];
    enc.defenders.forEach(j => techsOf(s.players[j], 'tackle').forEach(t =>
      opts.push({ id: 'tackle:' + j + ':' + t, kind: 'stance', stance: 'tackle', tech: t, by: j })));
    // The odds of winning the ball, against the attacker's likely mix of choices -
    // the attacker cannot see which stance was picked, so it is judged the same way.
    const atk = attackOptionsForOdds(s);
    const w = A().softmaxWeights(atk.map(o => A().valueOf(s, { carrier: enc.carrier }, o)), A().ATTACK_TEMP);
    // What the carrier will likely do, for the player - the same mix the odds assume.
    dec.likely = {};
    atk.forEach((a, k) => { dec.likely[a.kind] = (dec.likely[a.kind] || 0) + w[k]; });
    const human = humanDecides(s, defTeam, 'stance');
    const n = human ? 96 : 32;
    opts.forEach((o, i) => {
      const info = { stance: o.stance, tech: o.tech, by: o.by, human };
      let p = 0;
      atk.forEach((a, k) => { if (w[k] > 0.02) p += w[k] * (1 - oddsFor(s, a, info, n, 50 + i * 20 + k).p); });
      o.odds = { p, word: SS.DATA.oddsWord(p) };
      o.info = { defenders: enc.defenders.length, tech: o.tech ? T()[o.tech].name : null, by: o.by };
    });
    dec.options = opts;
    s.log.decisions[defTeam]++;
    return dec;
  }
  function attackOptionsForOdds(s) {
    const cj = s.enc.carrier, c = s.players[cj], out = [];
    s.players.forEach((p, j) => { if (j !== cj && p.team === c.team && p.pos !== 'GL' && p.sleep <= 0) out.push({ kind: 'pass', target: j, carrier: cj }); });
    if (V().dist(c.p, A().goalOf(c.team)) <= 24) out.push({ kind: 'shoot', carrier: cj });
    out.push({ kind: 'dribble', carrier: cj });
    out.forEach((o, i) => { o.odds = oddsFor(s, o, null, 24, 200 + i); });
    return out;
  }
  function setStance(s, opt) {
    s.enc.stance = opt.stance;
    s.enc.stanceInfo = { stance: opt.stance, tech: opt.tech, by: opt.by, human: humanDecides(s, 1 - s.players[s.enc.carrier].team, 'stance') };
    emit(s, 'stance', { stance: opt.stance, tech: opt.tech || null, by: opt.by == null ? null : opt.by });
  }

  /** Monte Carlo odds on a private random stream, so showing odds never changes the match. */
  function oddsFor(s, o, stanceInfo, n, salt) {
    if (o.kind === 'swim') return { p: 1, word: 'Keep going' };
    const rnd = stream({ r: hash(s.seed, s.seq * 977 + salt) });
    let ok = 0;
    for (let k = 0; k < n; k++) {
      let info = stanceInfo;
      if (!info && s.enc) info = { stance: rnd() < s.enc.pTackle ? 'tackle' : 'block', human: false };
      if (success(resolve(s, o, info, rnd))) ok++;
    }
    const p = ok / n;
    return { p, word: SS.DATA.oddsWord(p) };
  }
  function success(out) { return out.result === 'caught' || out.result === 'goal' || out.result === 'kept'; }

  /** Plain-language detail for a plate: "to #9 · open", "2 blockers · keeper strong". */
  function infoFor(s, o) {
    const c = s.players[o.carrier];
    if (o.kind === 'pass') {
      const t = s.players[o.target], lanes = blockersOn(s, c.p, t.p, c.team, null).length;
      return { to: o.target, name: t.name, pos: t.pos, open: lanes === 0, blockers: lanes, tech: o.tech ? T()[o.tech].name : null };
    }
    if (o.kind === 'shoot') {
      const g = A().goalOf(c.team), k = s.players[keeperOf(s, 1 - c.team)];
      const ratio = k.eff.ca / Math.max(1, c.eff.sh);
      return { distance: Math.round(V().dist(c.p, g)), blockers: blockersOn(s, c.p, g, c.team, null).length,
        keeper: ratio > 1.1 ? 'strong' : ratio < 0.7 ? 'weak' : 'steady', tech: o.tech ? T()[o.tech].name : null };
    }
    if (o.kind === 'dribble') return { tacklers: s.enc ? s.enc.defenders.length : 0, tech: o.tech ? T()[o.tech].name : null };
    return {};
  }

  /* ── resolving an option (pure: reads state, never writes it) ─────────── */
  function resolve(s, o, info, rnd) {
    if (o.kind === 'pass') return resolvePass(s, o, info, rnd);
    if (o.kind === 'shoot') return resolveShot(s, o, info, rnd);
    if (o.kind === 'dribble') return resolveDribble(s, o, info, rnd);
    return { kind: 'swim', result: 'kept' };
  }

  function blockersOn(s, from, to, attackTeam, info) {
    const RU = R(), enc = s.enc, out = [];
    s.players.forEach((pl, j) => {
      if (pl.team === attackTeam || pl.sleep > 0 || pl.pos === 'GL') return;
      const engaged = enc && enc.defenders.includes(j);
      if (engaged && info && info.stance === 'tackle') return;          // a tackler cannot block
      // Standing in the lanes covers a wider lane and blocks harder - but only a
      // ball that goes past you. Passing away from the blockers is how you beat them.
      const inLanes = engaged && info && info.stance === 'block';
      const seg = V().toSegment(pl.p, from, to);
      const width = RU.LANE_WIDTH * (inLanes ? RU.BLOCK_STANCE_REACH : 1);
      if (seg.d < width && seg.t > 0.02 && seg.t < 0.97) out.push({ j, t: seg.t, bonus: inLanes ? RU.BLOCK_STANCE_BONUS : 1 });
    });
    return out.sort((a, b) => a.t - b.t);
  }

  /** Where a ball travelling strength `rem0`, decaying `decay`/m over `d` metres,
   *  gets through `blockers`. Returns the stop, or null if it arrives. */
  function throughLane(s, from, to, rem0, decay, blockers, rnd) {
    const d = V().dist(from, to);
    let spent = 0;
    for (const b of blockers) {
      const here = rem0 - d * b.t * decay - spent;
      if (here <= 0) break;
      // The longer a team passes around without going anywhere, the better the
      // defense reads it: a real cost to recycling the ball, for the AI and the player alike.
      const bl = roll(s.players[b.j].eff.bl, rnd) * b.bonus * (1 + (s.passChain || 0) * R().READ_PER_PASS);
      if (bl >= here) {
        const at = V().lerp(from, to, b.t);
        return { stop: bl >= here * R().INTERCEPT_RATIO ? 'intercepted' : 'loose', by: b.j, at };
      }
      spent += bl * R().BLOCK_SHARE;
    }
    const end = rem0 - d * decay - spent;
    if (end <= 0) {
      const t = Math.max(0.1, Math.min(0.95, (rem0 - spent) / Math.max(1e-3, d * decay)));
      return { stop: 'short', at: V().lerp(from, to, t) };
    }
    return { stop: null, rem: end };
  }

  function resolvePass(s, o, info, rnd) {
    const RU = R(), c = s.players[o.carrier], tg = s.players[o.target], tech = o.tech ? T()[o.tech] : null;
    const flight0 = V().dist(c.p, tg.p) / RU.BALL_SPEED;
    const to = V().add(tg.p, V().scale(tg.v, flight0 * 0.6));
    const res = throughLane(s, c.p, to, roll(c.eff.pa + (tech ? tech.pa || 0 : 0), rnd), RU.PASS_DECAY,
      blockersOn(s, c.p, to, c.team, info), rnd);
    const status = tech && tech.status && res.by != null && rnd() < tech.chance ? tech.status : null;
    if (res.stop === 'intercepted') return { kind: 'pass', result: 'intercepted', by: res.by, at: res.at, status };
    if (res.stop) return { kind: 'pass', result: 'loose', by: res.by == null ? null : res.by, at: res.at, status };
    if (tg.sleep > 0) return { kind: 'pass', result: 'loose', at: to };
    return { kind: 'pass', result: 'caught', by: o.target, at: to };
  }

  function resolveShot(s, o, info, rnd) {
    const RU = R(), c = s.players[o.carrier], tech = o.tech ? T()[o.tech] : null;
    const g = A().goalOf(c.team);
    const aim = { x: g.x + (rnd() - 0.5) * 2.4, y: g.y + (rnd() - 0.5) * 2.4, z: g.z };
    let sh = c.eff.sh + (tech ? (tech.sh || 0) + (tech.spin ? rnd() * tech.spin : 0) : 0);
    let blockers = blockersOn(s, c.p, aim, c.team, info);
    if (tech && tech.clear) {
      // Beamin' Blast: the strongest blockers are brushed aside.
      const gone = blockers.slice().sort((a, b) => s.players[b.j].eff.bl - s.players[a.j].eff.bl).slice(0, tech.clear).map(b => b.j);
      blockers = blockers.filter(b => !gone.includes(b.j));
    }
    const res = throughLane(s, c.p, aim, roll(sh, rnd), RU.SHOT_DECAY, blockers, rnd);
    if (res.stop === 'intercepted') return { kind: 'shot', result: 'intercepted', by: res.by, at: res.at };
    if (res.stop) return { kind: 'shot', result: res.stop === 'short' ? 'short' : 'blocked', by: res.by == null ? null : res.by, at: res.at };
    const kj = keeperOf(s, 1 - c.team), k = s.players[kj];
    let ca = k.eff.ca * (k.sleep > 0 ? R().DAZED_KEEPER : 1);
    const save = techsOf(k, 'keeper')[0];
    const usedSave = save && res.rem > ca * 0.8;
    if (usedSave) ca += T()[save].ca;
    if (tech && tech.ghost && rnd() < tech.ghost) ca *= R().GHOST_KEEPER;
    // The keeper contest is the one that decides goals, so it is deliberately gentle:
    // both sides roll wide, and a stronger shooter or keeper wins more often - not
    // always. Otherwise a single stat edge or technique would decide every match.
    ca = roll(ca, rnd, RU.KEEPER_SPREAD);
    const shotRem = roll(res.rem, rnd, RU.KEEPER_SPREAD);
    res.rem = shotRem;
    if (res.rem > ca) return { kind: 'shot', result: 'goal', at: aim, keeper: kj, save: usedSave ? save : null };
    if (tech && tech.status && rnd() < tech.chance) return { kind: 'shot', result: 'parry', at: aim, keeper: kj, status: tech.status, save: usedSave ? save : null };
    return { kind: 'shot', result: ca >= res.rem * RU.CATCH_RATIO ? 'catch' : 'parry', at: aim, keeper: kj, save: usedSave ? save : null };
  }

  function resolveDribble(s, o, info, rnd) {
    const RU = R(), c = s.players[o.carrier], tech = o.tech ? T()[o.tech] : null;
    // Speed helps you slip a tackle: EN gets half the SP you have over the tacklers.
    const sp = s.enc.defenders.reduce((a, j) => a + s.players[j].eff.sp, 0) / s.enc.defenders.length;
    let en = roll(c.eff.en + (tech ? tech.en || 0 : 0) + Math.max(0, c.eff.sp - sp) * R().SPEED_SLIP, rnd), dodge = tech ? tech.dodge || 0 : 0;
    const f = info && info.stance === 'tackle' ? 1 : RU.HALF_TACKLE, hits = [];
    const morale = s.teams[1 - c.team].morale;
    for (const j of s.enc.defenders) {
      if (dodge > 0) { dodge--; hits.push({ j, dodged: true }); continue; }
      const d = s.players[j];
      let dt = null;
      if (info && info.by === j) dt = info.tech;
      else if (!(info && info.human)) { const own = techsOf(d, 'tackle'); if (own.length && rnd() < morale) dt = own[0]; }
      const t = dt ? T()[dt] : null;
      const dmg = roll(d.eff.at + (t ? t.at || 0 : 0), rnd) * f;
      en -= dmg;
      hits.push({ j, dmg, tech: dt, status: t && t.status && rnd() < t.chance ? t.status : null, drain: t && t.drain ? t.drain : 0 });
      if (en <= 0) return { kind: 'dribble', result: 'stolen', by: j, hits };
    }
    return { kind: 'dribble', result: 'kept', hits };
  }

  /* ── acting on a choice ────────────────────────────────────────────────── */
  M.choose = function (id) {
    const s = this.s, dec = s.pending;
    if (!dec) return [];
    const opt = dec.options.find(o => o.id === id);
    if (!opt) throw new Error('no option ' + id);
    s.pending = null;
    if (dec.kind === 'stance') { setStance(s, opt); attackDecision(s, 'encounter'); }
    else { emit(s, 'chose', { kind: opt.kind, id }); execute(s, opt, s.enc && s.enc.stanceInfo); }
    return drain(s);
  };

  function execute(s, o, info) {
    const RU = R(), rnd = stream(s.rng), c = s.players[o.carrier];
    const tech = o.tech ? T()[o.tech] : null;
    if (s.enc && !info) info = { stance: rnd() < s.enc.pTackle ? 'tackle' : 'block', human: false };
    const out = resolve(s, o, info, rnd);
    if (tech) { c.hp -= tech.hp; c.st.techs++; emit(s, 'tech', { player: o.carrier, tech: o.tech, on: out.by == null ? null : out.by }); }

    if (o.kind === 'swim') { emit(s, 'swim', { player: o.carrier }); s.enc = null; return; }

    if (o.kind === 'dribble') {
      out.hits.forEach(h => {
        const d = s.players[h.j];
        if (h.dodged) return;
        d.st.tackleTries++;
        if (h.tech) { d.hp -= T()[h.tech].hp; d.st.techs++; emit(s, 'tech', { player: h.j, tech: h.tech, on: o.carrier }); }
        if (h.status) applyStatus(s, o.carrier, h.status);
        if (h.drain) { const take = Math.min(h.drain, c.hp - 1); c.hp -= take; d.hp = Math.min(d.maxHp, d.hp + take); }
      });
      emit(s, 'dribble', { player: o.carrier, result: out.result, by: out.by == null ? null : out.by, hits: out.hits.map(h => h.j) });
      s.enc = null;
      if (out.result === 'kept') {
        c.st.kept++;
        s.players.forEach((d, j) => { if (out.hits.some(h => h.j === j)) d.beaten = RU.BEATEN_TIME; });
        const fwd = V().norm(V().sub(A().goalOf(c.team), c.p));
        c.v.x += fwd.x * 2; c.v.y += fwd.y * 2; c.v.z += fwd.z * 2;
        s.encCooldown = RU.ENCOUNTER_COOLDOWN;
      } else {
        s.players[out.by].st.tackles++;
        c.stun = 1;
        setOwner(s, out.by, 'tackle');
        s.encCooldown = 1.2;
      }
      return;
    }

    // Passes and shots fly; the result lands when the ball does.
    c.hp -= o.kind === 'pass' ? RU.HP_PASS : RU.HP_SHOT;
    if (o.kind === 'pass') c.st.passes++; else c.st.shots++;
    const from = V().copy({}, s.ball.p), dist = V().dist(from, out.at);
    s.ball.owner = null;
    s.ball.flight = { kind: o.kind, from, to: out.at, t: 0, dur: Math.max(0.25, dist / RU.BALL_SPEED),
      shooter: o.carrier, target: o.target == null ? null : o.target, outcome: out, tech: o.tech || null,
      catcher: out.result === 'caught' ? o.target : (out.result === 'intercepted' ? out.by : (out.result === 'catch' ? out.keeper : null)) };
    emit(s, o.kind === 'pass' ? 'pass' : 'shot', { player: o.carrier, target: o.target == null ? null : o.target,
      result: out.result, by: out.by == null ? null : out.by, to: out.at, dur: s.ball.flight.dur, tech: o.tech || null });
    s.enc = null;
    s.phase = 'flight';
  }

  function flight(s, dt) {
    const f = s.ball.flight;
    f.t += dt;
    V().copy(s.ball.p, V().lerp(f.from, f.to, Math.min(1, f.t / f.dur)));
    if (f.t < f.dur) return;
    const out = f.outcome, RU = R(), shooter = s.players[f.shooter];
    s.ball.flight = null;
    s.phase = 'live';
    const loose = (at, push) => {
      s.ball.owner = null; V().copy(s.ball.p, at);
      const r = stream(s.rng);
      V().copy(s.ball.v, V().add(push || { x: 0, y: 0, z: 0 }, { x: (r() - 0.5) * 3, y: (r() - 0.5) * 3, z: (r() - 0.5) * 3 }));
      keepOutOfGoals(s.ball.p, s.ball.v, 0, RU.R - 1.2);
    };
    if (out.status && out.by != null) applyStatus(s, out.by, out.status);
    switch (out.result) {
      case 'caught':
        shooter.st.completed++;
        setOwner(s, out.by, 'pass'); emit(s, 'catch', { player: out.by, from: f.shooter });
        s.passChain = (s.passChain || 0) + 1;
        break;
      case 'intercepted':
        s.players[out.by].st.intercepts++;
        setOwner(s, out.by, 'intercept'); emit(s, 'intercept', { player: out.by, from: f.shooter, kind: f.kind });
        break;
      case 'loose': case 'blocked': case 'short':
        if (out.by != null) s.players[out.by].st.blocks++;
        loose(out.at); emit(s, 'loose', { at: out.at, by: out.by == null ? null : out.by, kind: f.kind, result: out.result });
        break;
      case 'goal': {
        shooter.st.goals++; shooter.st.onTarget++;
        s.score[shooter.team]++;
        emit(s, 'goal', { player: f.shooter, team: shooter.team, score: s.score.slice(), tech: f.tech });
        s.phase = 'goal'; s.phaseT = 0; s.kickoffTeam = 1 - shooter.team;
        s.ball.owner = null; s.enc = null;
        if (s.period > 2) s.golden = true;
        break;
      }
      case 'catch': {
        shooter.st.onTarget++; s.players[out.keeper].st.saves++;
        if (out.save) { s.players[out.keeper].hp -= T()[out.save].hp; emit(s, 'tech', { player: out.keeper, tech: out.save, on: f.shooter }); }
        setOwner(s, out.keeper, 'save'); emit(s, 'save', { player: out.keeper, from: f.shooter, caught: true });
        s.phase = 'hold'; s.holdT = 0;
        break;
      }
      case 'parry': {
        shooter.st.onTarget++; s.players[out.keeper].st.saves++;
        if (out.save) { s.players[out.keeper].hp -= T()[out.save].hp; emit(s, 'tech', { player: out.keeper, tech: out.save, on: f.shooter }); }
        if (out.status) applyStatus(s, out.keeper, out.status);
        const outward = V().scale(V().norm(V().sub({ x: 0, y: 0, z: 0 }, out.at)), 4);
        loose(V().add(out.at, V().scale(V().norm(outward), 2.5)), outward);
        emit(s, 'save', { player: out.keeper, from: f.shooter, caught: false });
        break;
      }
    }
    if (s.clock >= s.periodLength && s.phase === 'live') endPeriod(s);
  }

  /* ── periods ───────────────────────────────────────────────────────────── */
  function endPeriod(s) {
    const RU = R();
    s.enc = null; s.ball.flight = null;
    if (s.period === 1) {
      s.phase = 'break'; s.phaseT = 0; s.ball.owner = null;
      emit(s, 'halftime', { score: s.score.slice() });
      coachReview(s, true);
      return;
    }
    if (s.overtime && s.score[0] === s.score[1] && s.period - 2 < RU.OVERTIME_CAP) {
      s.period++; s.clock = 0; s.periodLength = RU.OVERTIME; s.golden = false;
      s.kickoffTeam = (s.period % 2); s.phase = 'kickoff'; s.phaseT = 0; s.ball.owner = null;
      emit(s, 'overtime', { period: s.period });
      return;
    }
    finish(s);
  }
  function finish(s) {
    s.done = true; s.phase = 'final'; s.ball.owner = null;
    const [a, b] = s.score;
    s.result = { score: s.score.slice(), winner: a > b ? 0 : b > a ? 1 : null, periods: s.period,
      unresolved: s.overtime && a === b };
    emit(s, 'fulltime', { score: s.score.slice(), winner: s.result.winner });
  }

  /* ── from the Huddle ───────────────────────────────────────────────────── */
  M.callNow = function (team) {
    const s = this.s;
    if (s.pending || s.phase !== 'live' || s.ball.owner == null || s.players[s.ball.owner].team !== team) return false;
    attackDecision(s, 'call', true);
    return true;
  };
  /** Who stands in the lane from a carrier to a point: what the scene marks with ✕.
   *  Read-only, and it uses no random numbers, so looking never changes the match. */
  M.laneBlockers = function (carrier, to) {
    const s = this.s, c = s.players[carrier];
    return blockersOn(s, c.p, to, c.team, null).map(b => b.j);
  };
  M.setTactics = function (team, t) { setTactics(this.s, team, t, 'player'); };
  function setTactics(s, team, t, by) {
    const tm = s.teams[team], was = tm.formation;
    if (t.formation && SS.DATA.FORMATIONS[t.formation]) tm.formation = t.formation;
    if (t.marks) tm.marks = Object.assign({}, t.marks);
    if (tm.formation !== was || !tm.stint) tm.stint = { at: matchTime(s), shots: teamTotals(s, 'shots'), goals: s.score.slice() };
    emit(s, 'tactics', { team, formation: tm.formation, was, by });
  }
  /** Game seconds since kickoff, across periods. */
  function matchTime(s) { return (s.period - 1) * s.halfLength + s.clock; }
  function teamTotals(s, key) { const o = [0, 0]; s.players.forEach(p => { o[p.team] += p.st[key] || 0; }); return o; }
  /** How a team's current formation has gone since it was picked. */
  M.stint = function (team) {
    const s = this.s, st = s.teams[team].stint || { at: 0, shots: [0, 0], goals: [0, 0] }, sh = teamTotals(s, 'shots');
    return { formation: s.teams[team].formation, secs: matchTime(s) - st.at,
      shotsFor: sh[team] - st.shots[team], shotsAgainst: sh[1 - team] - st.shots[1 - team],
      goalsFor: s.score[team] - st.goals[team], goalsAgainst: s.score[1 - team] - st.goals[1 - team] };
  };

  /** The CPU coach's review (ai.coachPick): only for teams nobody is playing, only when
   *  the match was created with aiCoach. It uses the match's own random stream, so a
   *  replayed seed makes the same changes. */
  function coachReview(s, halftime) {
    if (!s.aiCoach) return;
    const now = matchTime(s), total = s.halfLength * 2;
    for (const team of [0, 1]) {
      if (team === s.human) continue;
      if (!halftime && now < s.coachNext[team]) continue;
      s.coachNext[team] = now + R().COACH_EVERY * (0.8 + stream(s.rng)() * 0.5);
      const f = A().coachPick(s, team, stream(s.rng), Math.min(1, now / total));
      if (f) setTactics(s, team, { formation: f, marks: {} }, 'coach');
    }
  }

  SS.sim = { create, restore, roll, stream, hash };
})(typeof window !== 'undefined' ? window : globalThis);
