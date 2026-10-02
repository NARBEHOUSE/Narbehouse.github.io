/**
 * Benny's P3GL — the rules of one level.
 *
 * P3.Match owns everything that happens on a board: aiming, shots, pegs that
 * light up and clear away, powers, hazards, the goal, scoring, the fever
 * multiplier, free balls, the bonus-slot finale, winning and losing. It has
 * no idea what anything looks like or sounds like: it pushes plain event
 * objects onto `match.events`, and the game drains them every frame to drive
 * the renderer, the sound and the speech.
 *
 * Phases:  aim → shot → pop → (aim | won | lost)
 *   aim    the player is aiming; the board keeps moving
 *   shot   balls are in play
 *   pop    the shot is over; lit pegs clear one after another
 *   won    goal met and the last ball is gone (bonus slots already paid)
 *   lost   out of balls (never in Cozy: Cozy refills instead)
 *
 * Pegs light when hit and stay solid until the shot ends, then pop in the
 * order they were hit — the classic peg-shooter rhythm, and it keeps a shot's
 * path predictable. A ball that stalls among lit pegs gets them cleared early.
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};
  const C = P3.catalog, U = P3.util, L = P3.levels, PH = P3.physics;
  const B = C.BOARD;
  const { BOUNCE, PASS, KILL } = PH;

  const STYLE = {
    long: { name: 'Long shot', points: 2500 },
    wall: { name: 'Off the wall', points: 1000 },
    chain10: { name: 'Chain of ten', points: 1000 },
    chain20: { name: 'Chain of twenty', points: 3000 },
    chain30: { name: 'Chain of thirty', points: 6000 }
  };

  class Match {
    /**
     * @param o.level     normalised level
     * @param o.mode      'cozy' | 'vivid' | 'hyper'
     * @param o.seed      level seed (defaults to a hash of the level)
     * @param o.restore   a snapshot from match.snapshot()
     */
    constructor(o) {
      this.level = o.level;
      this.modeId = o.mode;
      this.mode = C.MODES[o.mode] || C.MODES.vivid;
      this.seed = (o.seed !== undefined ? o.seed : o.restore && Number.isInteger(o.restore.seed) ? o.restore.seed : U.hash(JSON.stringify(o.level.items).slice(0, 4000))) >>> 0;
      this.world = new PH.World(this.level, this.mode, this.seed);
      this.rng = U.mulberry32(this.seed ^ 0x9e3779b9);   // rules randomness, kept apart from the physics jitter
      this.bodies = this.world.bodies;
      this.events = [];
      this.phase = 'aim';
      this.angle = 0;
      this.ballsLeft = this.level.balls;
      this.score = 0;
      this.shotIndex = 0;
      this.refills = 0;
      this.banked = {};               // next-shot powers waiting: id → count
      this.active = {};               // powers live this shot
      this.fever = 1;
      this.goalMet = false;
      this.bestChain = 0;
      this.stars = L.starsFor(this.level, this.modeId);
      this.goal = Object.assign({}, this.level.goal, { total: L.goalTotal(this.level), done: 0 });
      this.hitOrder = [];
      this.popQueue = [];
      this.popTimer = 0;
      this.slotsPaid = [];
      this.resetShot();
      if (o.restore) this.restore(o.restore);
      this.updateGoal(true);
      this.world.reseed(this.shotSeed());
    }

    /* ── Aiming ─────────────────────────────────────────────────────────── */

    get aimMax() { return this.mode.aimMax; }

    aimTo(deg) { this.angle = U.clamp(deg, -this.aimMax, this.aimMax); }

    canFire() { return this.phase === 'aim' && this.ballsLeft > 0; }

    shotSeed() { return (this.seed + this.shotIndex * 7919) >>> 0; }

    /** Guide length for this shot: Super guide when one is saved, else the setting. */
    guideFor(setting) {
      if (this.banked.guide) return C.GUIDES.super;
      const id = (setting && setting !== 'auto') ? setting : (this.level.guide || this.mode.guide);
      return C.GUIDES[id] || C.GUIDES.medium;
    }

    /** The aim line: a dry run of the shot from where the board is right now. */
    guide(setting) {
      const g = this.guideFor(setting);
      return this.predictGuide(g.time, g.bounces);
    }

    /** Preview the actual rules on an isolated board, including powers and hazards. */
    predictGuide(maxTime, maxBounces, opts) {
      if (!this.canFire()) return this.world.predict(this.angle, maxTime, maxBounces, opts);
      const trial = new Match({ level: this.level, mode: this.modeId, seed: this.seed, restore: this.snapshot() });
      trial.push = () => {}; // A preview must not emit sounds, scores or visual effects.
      trial.aimTo(this.angle);
      trial.fire();
      const ball = trial.world.balls[0];
      const out = { points: [{ x: ball.x, y: ball.y }], hits: [], end: 'time' };
      let bounces = 0, sinceSample = 0, stopAfter = -1;
      const contact = trial.contact.bind(trial);
      trial.contact = (b, body, hit) => {
        if (b === ball) {
          out.hits.push({ x: hit.px, y: hit.py, body: this.bodies[body.index] });
          bounces++;
        }
        return contact(b, body, hit);
      };
      const wall = trial.wall.bind(trial);
      trial.wall = (b, side) => {
        if (b === ball) { bounces++; out.hits.push({ x: b.x, y: b.y, body: null }); }
        wall(b, side);
      };
      const plate = trial.plate.bind(trial);
      trial.plate = (b, kind, at) => {
        if (b === ball && kind === 'catch') out.end = 'catch';
        return plate(b, kind, at);
      };
      trial.drained = b => { if (b === ball) out.end = 'drain'; };
      const maxSteps = Math.ceil(maxTime / PH.STEP);
      for (let i = 0; i < maxSteps && ball.alive; i++) {
        trial.world.step(PH.STEP, trial);
        sinceSample += PH.STEP;
        if ((opts && opts.everyStep) || sinceSample >= 1 / 90 || !ball.alive) {
          out.points.push({ x: ball.x, y: ball.y }); sinceSample = 0;
        }
        if (bounces > maxBounces && stopAfter < 0) stopAfter = i + 10;
        if (stopAfter >= 0 && i >= stopAfter) { out.end = 'bounces'; break; }
      }
      if (!ball.alive && out.end === 'time') out.end = 'kill';
      return out;
    }

    /* ── Firing ─────────────────────────────────────────────────────────── */

    resetShot() {
      this.shotScore = 0;
      this.chain = 0;
      this.fever = 1;
      this.shotDouble = false;
      this.freeBallsThisShot = 0;
      this.lastTargetAt = -1;
      this.lastWallAt = -10;
      this.styleDone = {};
      this.finalCalled = false;
      this.shotHits = 0;
    }

    fire() {
      if (!this.canFire()) return false;
      this.resetShot();
      this.ballsLeft--;
      this.phase = 'shot';
      // Saved powers: one of each kind fires now; spares wait for later shots.
      this.active = {};
      for (const id of Object.keys(this.banked)) {
        if (this.banked[id] > 0) { this.active[id] = true; this.banked[id]--; if (!this.banked[id]) delete this.banked[id]; }
      }
      this.world.reseed(this.shotSeed());
      this.world._acc = 0;              // start the shot on a whole step, as the guide does
      this.rng = U.mulberry32(this.shotSeed() ^ 0x9e3779b9);
      const extra = {
        fireUntil: this.active.fire ? 3.2 : 0,
        netUntil: this.active.net ? 7 : 0,
        blast: !!this.active.blast
      };
      const balls = [];
      if (this.active.spray) {
        for (const off of [0, -9, 9]) balls.push(this.world.launch(U.clamp(this.angle + off, -89, 89), Object.assign({}, extra)));
      } else {
        balls.push(this.world.launch(this.angle, extra));
      }
      this.push({ type: 'fire', balls, powers: Object.keys(this.active), angle: this.angle });
      this.shotIndex++;
      return true;
    }

    /* ── The frame ──────────────────────────────────────────────────────── */

    /** Advance by dt seconds of board time (the game applies slow motion). */
    update(dt) {
      if (this.phase === 'won' || this.phase === 'lost') { this.world.step(dt, this); return; }
      this.world.step(dt, this);
      if (this.phase === 'shot') {
        this.watchFinal();
        if (!this.world.balls.length) this.endShot();
      } else if (this.phase === 'pop') {
        this.popTimer -= dt;
        while (this.popTimer <= 0 && this.popQueue.length) {
          const b = this.popQueue.shift();
          if (b.alive) this.popBody(b, this.popQueue.length);
          this.popTimer += this.popQueue.length > 30 ? 0.03 : this.popQueue.length > 12 ? 0.045 : 0.065;
        }
        if (!this.popQueue.length && this.popTimer <= 0) this.afterPops();
      }
    }

    endShot() {
      this.phase = 'pop';
      this.popQueue = this.hitOrder.filter(b => b.alive && b.lit && b.t !== 'lantern');
      this.hitOrder = [];
      this.popTimer = 0.25;
      // Chain bonus for the whole shot.
      for (const k of ['chain30', 'chain20', 'chain10']) {
        const n = +k.slice(5);
        if (this.chain >= n) { this.style(k); break; }
      }
      this.push({ type: 'shotEnd', hits: this.shotHits, chain: this.chain, shotScore: this.shotScore, pops: this.popQueue.length });
    }

    afterPops() {
      this.push({ type: 'popDone' });
      this.active = {};
      if (this.goalMet) {
        const bonus = this.ballsLeft * this.mode.ballBonus;
        if (bonus) this.addScore(bonus, null, true, true);
        this.phase = 'won';
        this.push({ type: 'won', score: this.score, ballBonus: bonus, ballsLeft: this.ballsLeft, starCount: this.starCount() });
        return;
      }
      if (this.ballsLeft <= 0) {
        if (this.mode.noFail) {
          this.refills++;
          this.ballsLeft = this.mode.refill;
          this.push({ type: 'refill', balls: this.ballsLeft });
        } else {
          this.phase = 'lost';
          this.push({ type: 'lost', score: this.score, done: this.goal.done, total: this.goal.total });
          return;
        }
      }
      if (this.goal.type === 'chain') {
        const remaining = this.bodies.filter(b => b.alive && !b.lit && (C.isBreakablePeg(b.t) || C.isBreakableBrick(b.t) || b.t === 'lantern')).length;
        if (remaining < this.goal.total) {
          // A chain must happen in one shot; clearing pieces across failed
          // attempts must never leave a no-fail level impossible to finish.
          for (const b of this.bodies) {
            b.alive = true; b.solid = b.t !== 'hole' && b.t !== 'portal'; b.lit = false;
            delete b.hp; delete b.litAt;
          }
          this.push({ type: 'boardReset', reason: 'chain' });
        }
      }
      this.fever = 1;
      this.phase = 'aim';
      this.world.reseed(this.shotSeed());
      this.push({ type: 'ready', ballsLeft: this.ballsLeft });
    }

    starCount() {
      if (!this.goalMet) return 0;
      return this.score >= this.stars[1] ? 3 : this.score >= this.stars[0] ? 2 : 1;
    }

    /* ── Contacts (the physics handler) ─────────────────────────────────── */

    contact(ball, body, hit) {
      const t = body.t;
      const fire = ball.fireUntil > ball.age;
      this.shotHits++;

      if (ball.blast && t !== 'portal') {
        ball.blast = false;
        this.blastAt(hit.px, hit.py, 125);
      }

      if (t === 'spike') { this.loseBall(ball, 'spike', body); return KILL; }
      if (t === 'bumper') { this.addScore(C.TYPES.bumper.points, body); this.push({ type: 'bumper', body, x: hit.px, y: hit.py }); return BOUNCE; }
      if (t === 'steel' || t === 'wall') { this.push({ type: 'clank', body, x: hit.px, y: hit.py, speed: Math.hypot(ball.vx, ball.vy) }); return BOUNCE; }
      if (t === 'gate') { this.push({ type: 'clank', body, x: hit.px, y: hit.py, speed: Math.hypot(ball.vx, ball.vy), gate: true }); return BOUNCE; }
      if (t === 'glass') { this.breakBrick(body, ball); return PASS; }
      if (t === 'brick' || t === 'armor') {
        const broke = this.damageBrick(body, 1, fire, ball);
        return broke && fire ? PASS : BOUNCE;
      }
      if (t === 'lantern') {
        if (!body.lit) this.lightBody(body, ball, hit);
        else this.push({ type: 'relight', body, x: hit.px, y: hit.py });
        return fire ? PASS : BOUNCE;
      }
      if (C.isBreakablePeg(t)) {
        if (!body.lit) this.lightBody(body, ball, hit);
        else this.push({ type: 'relight', body, x: hit.px, y: hit.py });
        return fire ? PASS : BOUNCE;
      }
      return BOUNCE;
    }

    wall(ball, side) {
      this.lastWallAt = ball.age;
      this.lastWallBall = ball.id;
      this.push({ type: 'wall', side, x: ball.x, y: ball.y, speed: Math.hypot(ball.vx, ball.vy) });
    }

    plate(ball, kind, at) {
      if (this.goalMet) return false;       // the plate is gone during the finale (see physics plateContact)
      if (kind === 'catch') {
        this.ballsLeft++;
        this.push({ type: 'catch', x: at.x, y: at.y, ballsLeft: this.ballsLeft, afterHits: this.shotHits > 0 });
      } else {
        this.addScore(20, null, true);
        this.push({ type: 'plate', x: at.x, y: at.y });
      }
      return true;
    }

    net(ball) { this.push({ type: 'net', x: ball.x, y: ball.y }); }

    portal(ball, from, to) { this.push({ type: 'portal', from, to, x: to.x, y: to.y }); }

    swallow(ball, hole) { this.loseBall(ball, 'hole', hole); }

    drained(ball) {
      if (this.goalMet) {
        const n = this.mode.slots.length;
        const i = U.clamp(Math.floor(ball.x / (B.W / n)), 0, n - 1);
        const pts = this.mode.slots[i];
        this.addScore(pts, null, true, true);
        this.slotsPaid.push(i);
        this.push({ type: 'slot', index: i, points: pts, x: ball.x });
      } else {
        this.push({ type: 'drain', x: ball.x });
      }
    }

    stuck(ball, stage) {
      if (stage === 1 || stage === 2) {
        // Clear lit pegs right around a stalled ball (the classic remedy).
        const near = this.bodies.filter(b => b.alive && b.lit && b.t !== 'lantern' && Math.hypot(b.x - ball.x, b.y - ball.y) < b.r + ball.r + 70);
        near.forEach(b => this.popBody(b, 0, true));
        this.hitOrder = this.hitOrder.filter(b => b.alive);
        this.push({ type: 'unstick', x: ball.x, y: ball.y, cleared: near.length, stage });
      } else if (stage === 3) {
        // Gave up: the ball is handed back so the player loses nothing.
        this.ballsLeft++;
        this.push({ type: 'ballReturned', x: ball.x, y: ball.y });
      }
    }

    loseBall(ball, reason, body) {
      ball.alive = false;
      this.push({ type: 'ballLost', reason, x: ball.x, y: ball.y, body });
    }

    /* ── What things do ─────────────────────────────────────────────────── */

    lightBody(body, ball, hit) {
      body.lit = true;
      body.litAt = this.world.t;
      if (body.t !== 'lantern') this.hitOrder.push(body);
      this.chain++;
      this.updateFever();
      this.bestChain = Math.max(this.bestChain, this.chain);
      const target = this.isTarget(body);
      let base = C.TYPES[body.t].points;
      if (target && body.t === 'peg') base *= 3;
      const pts = this.addScore(base + (this.chain - 1) * 10, body);
      this.push({ type: 'light', body, x: hit ? hit.px : body.x, y: hit ? hit.py : body.y, points: pts, chain: this.chain, target });
      if (target && ball) this.checkStyle(ball);
      this.effect(body, ball);
      this.updateGoal();
    }

    /** Lit by a blast, lightning or a fireball's splash rather than a direct hit. */
    lightIndirect(body, cause) {
      if (body.lit || !body.alive) return;
      this.lightBody(body, null, null);
      this.push({ type: 'litBy', body, cause });
    }

    effect(body, ball) {
      const t = body.t;
      const at = { x: body.x, y: body.y };
      switch (t) {
        case 'multiball': {
          const src = ball || { x: body.x, y: body.y - 30, vx: 0, vy: -200, fireUntil: 0, netUntil: 0, age: 0, blast: false };
          for (const dir of [-1, 1]) {
            const sp = Math.max(520, Math.hypot(src.vx, src.vy));
            this.world.spawn(body.x + dir * 20, body.y - 18, dir * sp * 0.62, -sp * 0.6, {
              fireUntil: Math.max(0, src.fireUntil - src.age), netUntil: Math.max(0, src.netUntil - src.age), blast: false
            });
          }
          this.push(Object.assign({ type: 'power', id: t, now: true }, at));
          break;
        }
        case 'extra':
          this.ballsLeft++;
          this.push(Object.assign({ type: 'power', id: t, now: true, ballsLeft: this.ballsLeft }, at));
          break;
        case 'multiplier':
          this.shotDouble = true;
          this.push(Object.assign({ type: 'power', id: t, now: true }, at));
          break;
        case 'zap': {
          const targets = this.bodies
            .filter(b => b.alive && !b.lit && b !== body && C.isBreakablePeg(b.t) && C.TYPES[b.t].role !== 'hazard')
            .map(b => ({ b, d: Math.hypot(b.x - body.x, b.y - body.y) }))
            .sort((a, z) => a.d - z.d).slice(0, 6).map(o => o.b);
          const bricks = this.bodies.filter(b => b.alive && (b.t === 'brick' || b.t === 'armor') && Math.hypot(b.x - body.x, b.y - body.y) < 150);
          this.push(Object.assign({ type: 'zap', id: t, targets: targets.slice(), bricks: bricks.slice() }, at));
          targets.forEach(b => this.lightIndirect(b, 'zap'));
          bricks.forEach(b => this.damageBrick(b, 1, true, null));
          break;
        }
        case 'spray': case 'net': case 'blast': case 'fire': case 'guide':
          this.banked[t] = (this.banked[t] || 0) + 1;
          this.push(Object.assign({ type: 'power', id: t, banked: true, count: this.banked[t] }, at));
          break;
        case 'key': {
          const gates = this.bodies.filter(b => b.alive && b.t === 'gate' && b.item.k === body.item.k);
          gates.forEach(g => { g.alive = false; g.solid = false; });
          this.push(Object.assign({ type: 'gates', color: body.item.k, gates }, at));
          break;
        }
        case 'thief': {
          const ids = Object.keys(this.banked);
          if (ids.length) {
            const id = ids[Math.floor(this.rng() * ids.length)];
            this.banked[id]--; if (!this.banked[id]) delete this.banked[id];
            this.push(Object.assign({ type: 'hazard', id: t, stole: id }, at));
          } else {
            const lost = Math.min(this.score, 1000);
            this.score -= lost;
            this.push(Object.assign({ type: 'hazard', id: t, points: lost }, at));
          }
          break;
        }
        case 'shrink':
          if (ball && !ball.shrunk) { ball.shrunk = true; ball.r = Math.max(6, ball.r * 0.6); }
          this.push(Object.assign({ type: 'hazard', id: t, ball }, at));
          break;
        case 'sludge':
          if (ball) { ball.vx *= 0.22; ball.vy *= 0.22; }
          this.push(Object.assign({ type: 'hazard', id: t }, at));
          break;
      }
    }

    blastAt(x, y, radius) {
      this.push({ type: 'blast', x, y, radius });
      for (const b of this.bodies) {
        if (!b.alive) continue;
        const d = Math.hypot(b.x - x, b.y - y) - b.r;
        if (d > radius) continue;
        if (C.isBreakablePeg(b.t) || b.t === 'lantern') this.lightIndirect(b, 'blast');
        else if (b.t === 'brick' || b.t === 'armor') this.damageBrick(b, 1, true, null);
        else if (b.t === 'glass') this.breakBrick(b, null);
      }
    }

    /** Returns true if the brick broke. `strong` = blast, fire or lightning. */
    damageBrick(body, n, strong, ball) {
      if (!body.alive) return false;
      if (body.t === 'armor' && !strong) {
        this.push({ type: 'clank', body, x: body.x, y: body.y, armor: true, speed: ball ? Math.hypot(ball.vx, ball.vy) : 600 });
        return false;
      }
      body.hp = (body.hp === undefined ? (body.item.hp || 1) : body.hp) - n;
      if (body.hp <= 0) { this.breakBrick(body, ball); return true; }
      this.addScore(50, body);
      this.push({ type: 'crack', body, hp: body.hp, x: body.x, y: body.y });
      return false;
    }

    breakBrick(body, ball) {
      if (!body.alive) return;
      body.alive = false;
      body.solid = false;
      body.hp = 0;
      this.chain++;
      this.updateFever();
      this.bestChain = Math.max(this.bestChain, this.chain);
      const pts = this.addScore(C.TYPES[body.t].points + (this.chain - 1) * 10, body);
      this.push({ type: 'brickBreak', body, x: body.x, y: body.y, points: pts, chain: this.chain, glass: body.t === 'glass' });
      this.updateGoal();
    }

    popBody(body, left, early) {
      body.alive = false;
      body.solid = false;
      this.push({ type: 'pop', body, left, early: !!early, x: body.x, y: body.y });
    }

    /* ── Score, fever, goal ─────────────────────────────────────────────── */

    addScore(base, body, flat, bonus) {
      const mult = flat ? 1 : this.fever * (this.shotDouble ? 2 : 1);
      const pts = Math.round(base * mult);
      this.score += pts;
      if (bonus) { if (this.goal.type === 'score') this.updateGoal(); return pts; }   // end-of-level bonuses earn no free balls
      this.shotScore += pts;
      // Free balls for a big shot.
      const marks = this.mode.freeBallAt;
      while (this.freeBallsThisShot < marks.length && this.shotScore >= marks[this.freeBallsThisShot]) {
        this.freeBallsThisShot++;
        this.ballsLeft++;
        this.push({ type: 'freeBall', reason: 'score', ballsLeft: this.ballsLeft, at: marks[this.freeBallsThisShot - 1] });
      }
      if (this.goal.type === 'score') this.updateGoal();
      return pts;
    }

    isTarget(body) {
      const g = this.goal;
      switch (g.type) {
        case 'clear': return C.countsForClear(body.t);
        case 'color': return body.t === 'peg' && body.item.c === g.color;
        case 'gems': return body.t === 'gem';
        case 'lanterns': return body.t === 'lantern';
        case 'bricks': return C.isBreakableBrick(body.t);
        case 'count': return C.isBreakablePeg(body.t);
      }
      return false;
    }

    /** Is this body still needed for the goal? (What the board highlights.) */
    isOpenTarget(body) {
      if (!body.alive) return false;
      if (C.isBreakableBrick(body.t)) return this.goal.type === 'bricks';
      return !body.lit && this.isTarget(body);
    }

    updateFever() {
      let fever = 1;
      for (const f of C.FEVER) if (this.chain >= f.hits) fever = f.mult;
      if (fever !== this.fever) {
        const up = fever > this.fever;
        this.fever = fever;
        if (up) this.push({ type: 'fever', mult: fever });
      }
    }

    updateGoal(silent) {
      const g = this.goal;
      let done = 0;
      switch (g.type) {
        case 'score': done = this.score; break;
        case 'chain': done = this.bestChain; break;
        case 'bricks': done = this.bodies.filter(b => C.isBreakableBrick(b.t) && !b.alive).length; break;
        case 'count': done = this.bodies.filter(b => C.isBreakablePeg(b.t) && (b.lit || !b.alive)).length; break;
        default: done = this.bodies.filter(b => this.isTarget(b) && (b.lit || !b.alive)).length;
      }
      done = Math.min(done, g.total);
      const changed = done !== g.done;
      g.done = done;
      if (changed && !silent) this.push({ type: 'goal', done, total: g.total, left: g.total - done });
      if (!this.goalMet && g.total > 0 && done >= g.total) {
        this.goalMet = true;
        this.world.plateOff = true;
        if (!silent) this.push({ type: 'goalMet', score: this.score, inShot: this.phase === 'shot' });
        if (this.phase !== 'shot' && !silent) {
          // Met between shots (it can happen with a score goal): finish at once.
          this.phase = 'pop'; this.popQueue = []; this.popTimer = 0;
        }
      }
    }

    targetsLeft() {
      if (['score', 'chain', 'count'].includes(this.goal.type)) return null;
      return this.bodies.filter(b => this.isOpenTarget(b));
    }

    /** Slow-motion moment: one target left and a ball about to reach it. */
    watchFinal() {
      if (this.finalCalled || this.goalMet) return;
      const left = this.targetsLeft();
      if (!left || left.length !== 1) return;
      const tgt = left[0];
      for (const ball of this.world.balls) {
        const dx = tgt.x - ball.x, dy = tgt.y - ball.y;
        const d = Math.hypot(dx, dy) - tgt.r - ball.r;
        const closing = (ball.vx * dx + ball.vy * dy) / (Math.hypot(dx, dy) || 1);
        if (closing > 60 && d / closing < 0.32 && d < 170) {
          // Will it really hit? Check the next fraction of a second.
          const vx = ball.vx, vy = ball.vy;
          const ahead = Math.min(0.4, d / closing + 0.1);
          let hitSoon = false;
          for (let s = 0; s <= ahead; s += 1 / 120) {
            const px = ball.x + vx * s, py = ball.y + vy * s + 0.5 * this.world.gravity * s * s;
            if (Math.hypot(px - tgt.x, py - tgt.y) < tgt.r + ball.r + 4) { hitSoon = true; break; }
          }
          if (hitSoon) { this.finalCalled = true; this.push({ type: 'finalApproach', body: tgt, ball }); return; }
        }
      }
    }

    style(id) {
      if (this.styleDone[id]) return;
      this.styleDone[id] = true;
      const s = STYLE[id];
      this.addScore(s.points, null, true);
      this.push({ type: 'style', id, name: s.name, points: s.points });
    }

    checkStyle(ball) {
      if (ball.age - this.lastWallAt < 0.35 && this.lastWallBall === ball.id) this.style('wall');
      if (this.lastTargetAt >= 0 && ball.travel - this.lastTargetAt > 1100) this.style('long');
      this.lastTargetAt = ball.travel;
    }

    push(e) { this.events.push(e); }

    drain() { const e = this.events; this.events = []; return e; }

    /* ── Saving between shots ───────────────────────────────────────────── */

    snapshot() {
      if (this.phase !== 'aim') return null;
      return {
        v: 3, seed: this.seed, t: this.world.t, ballsLeft: this.ballsLeft, score: this.score, shotIndex: this.shotIndex,
        refills: this.refills, banked: Object.assign({}, this.banked), bestChain: this.bestChain, angle: this.angle,
        bodies: this.bodies.map(b => [b.alive ? 1 : 0, b.lit ? 1 : 0, b.hp === undefined ? -1 : b.hp])
      };
    }

    restore(s) {
      if (!s || s.v !== 3 || !Array.isArray(s.bodies) || s.bodies.length !== this.bodies.length) return false;
      // Reject damaged saves before changing any live state.
      if (!['t', 'ballsLeft', 'score', 'shotIndex'].every(k => Number.isFinite(s[k]) && s[k] >= 0) ||
          !Number.isInteger(s.ballsLeft) || s.ballsLeft < 1 || !Number.isInteger(s.shotIndex) ||
          (s.angle !== undefined && !Number.isFinite(s.angle)) ||
          (s.refills !== undefined && (!Number.isInteger(s.refills) || s.refills < 0)) ||
          (s.bestChain !== undefined && (!Number.isInteger(s.bestChain) || s.bestChain < 0)) ||
          !s.bodies.every(row => Array.isArray(row) && row.length >= 3 && [0, 1].includes(row[0]) && [0, 1].includes(row[1]) && Number.isInteger(row[2]) && row[2] >= -1)) return false;
      const banked = {};
      for (const id of C.NEXT_POWERS) {
        const count = s.banked && s.banked[id];
        if (Number.isInteger(count) && count > 0) banked[id] = count;
      }
      this.world.t = s.t || 0;
      this.world.pose(this.world.t);
      this.ballsLeft = s.ballsLeft; this.score = s.score; this.shotIndex = s.shotIndex;
      this.refills = s.refills || 0; this.banked = banked; this.bestChain = s.bestChain || 0;
      this.aimTo(s.angle || 0);
      s.bodies.forEach((row, i) => {
        const b = this.bodies[i];
        b.alive = !!row[0]; b.lit = !!row[1];
        if (row[2] >= 0) b.hp = row[2]; else delete b.hp;
        b.solid = b.alive && b.t !== 'hole' && b.t !== 'portal';
      });
      return true;
    }
  }

  P3.Match = Match;
  P3.Match.STYLE = STYLE;
})(typeof window !== 'undefined' ? window : globalThis);
