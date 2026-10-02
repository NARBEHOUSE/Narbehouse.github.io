/**
 * Benny's P3GL — board physics.
 *
 * A small, deterministic 2D simulation in board pixels (y grows downward),
 * stepped at a fixed 240 Hz. Determinism matters: the aim guide runs the same
 * code ahead of time on a copied Match, so powers, hazards and the line the
 * player aims with agree with the real shot (up to the guide's length).
 *
 * The world knows shapes and motion, not rules. Every contact is handed to a
 * handler (P3.Match in play, a dry stand-in for the guide) that decides what
 * the contact means and answers how the ball should respond:
 *
 *   handler.contact(ball, body, hit) → BOUNCE | PASS | KILL
 *   handler.wall(ball, side)            side: 'left' | 'right' | 'top'
 *   handler.plate(ball, kind, hit)      kind: 'bounce' | 'catch' → return false to veto a catch
 *   handler.net(ball)                   the Safety net bounced it
 *   handler.portal(ball, from, to)
 *   handler.swallow(ball, body)         a black hole ate it
 *   handler.drained(ball)               it fell out the bottom
 *   handler.stuck(ball, stage)          1: has not moved for a while, 2: give up on it
 *
 * Bodies keep their authored pose (bx, by, ba) and are posed for time t by
 * their motion, so moving pegs are a pure function of time and the guide can
 * look ahead without disturbing them.
 */
(function (root) {
  'use strict';

  const P3 = root.P3 = root.P3 || {};
  const C = P3.catalog, U = P3.util;
  const B = C.BOARD;

  const STEP = 1 / 240;
  const BOUNCE = 0, PASS = 1, KILL = 2;
  const MAX_SPEED = 2600;
  const TAU = Math.PI * 2;

  /* ── Bodies ───────────────────────────────────────────────────────────── */

  let nextBodyId = 1;

  function makeBody(item, index) {
    const def = C.TYPES[item.t];
    const b = {
      id: nextBodyId++, index, t: item.t, item,
      shape: def.shape, role: def.role,
      bx: item.x, by: item.y, ba: U.rad(item.a || 0),
      x: item.x, y: item.y, a: U.rad(item.a || 0),
      vx: 0, vy: 0, w: 0,                     // linear velocity, angular velocity (rad/s)
      r: item.r || 0, hw: (item.w || 0) / 2, hh: (item.h || 0) / 2,
      m: item.m || null,
      solid: true,                            // takes part in collisions
      alive: true                             // still on the board
    };
    if (b.shape === 'brick') b.r = Math.hypot(b.hw, b.hh);   // bounding radius for quick rejects
    if (b.t === 'hole' || b.t === 'portal') b.solid = false;
    return b;
  }

  /**
   * Pose a body at time t. Writes into `out` (which may be the body itself).
   * Rotation is clockwise on screen for positive speeds (y points down).
   */
  function poseAt(b, t, out) {
    const m = b.m;
    if (!m) { out.x = b.bx; out.y = b.by; out.a = b.ba; out.vx = 0; out.vy = 0; out.w = 0; return out; }
    if (m.type === 'rotate') {
      const w = U.rad(m.speed), th = w * t;
      const c = Math.cos(th), s = Math.sin(th);
      const rx = b.bx - m.cx, ry = b.by - m.cy;
      const px = rx * c - ry * s, py = rx * s + ry * c;
      out.x = m.cx + px; out.y = m.cy + py; out.a = b.ba + th;
      out.vx = -w * py; out.vy = w * px; out.w = w;
    } else if (m.type === 'slide') {
      const k = TAU / m.period, ph = k * t + TAU * m.phase;
      const s = Math.sin(ph), c = Math.cos(ph);
      out.x = b.bx + m.dx * s; out.y = b.by + m.dy * s; out.a = b.ba;
      out.vx = m.dx * c * k; out.vy = m.dy * c * k; out.w = 0;
    } else if (m.type === 'orbit') {
      const w = U.rad(m.speed), ph = w * t + TAU * m.phase;
      const c = Math.cos(ph), s = Math.sin(ph);
      out.x = b.bx + m.r * c; out.y = b.by + m.r * s; out.a = b.ba;
      out.vx = -m.r * w * s; out.vy = m.r * w * c; out.w = 0;
    } else {
      out.x = b.bx; out.y = b.by; out.a = b.ba; out.vx = 0; out.vy = 0; out.w = 0;
    }
    return out;
  }

  /* ── The base plate ───────────────────────────────────────────────────── */

  function makePlate(p, modeCfg) {
    const w = p.w;
    const minX = w / 2 + 8, maxX = B.W - w / 2 - 8;
    const mid = (minX + maxX) / 2, amp = Math.max(0, (maxX - minX) / 2);
    const start = U.clamp(p.x, minX, maxX);
    // Sine sweep: eases at the walls like a pendulum, average speed = p.speed.
    const omega = amp > 1 && p.speed > 0 ? p.speed * Math.PI / (2 * amp) : 0;
    const phase0 = amp > 1 ? Math.asin(U.clamp((start - mid) / amp, -1, 1)) : 0;
    return {
      w, h: B.PLATE_H, y: B.PLATE_Y, mode: p.mode, period: p.period,
      mid, amp, omega, phase0, x: start, vx: 0,
      state: p.mode === 'timed' ? 'catch' : p.mode,
      kick: modeCfg.gravity * 0.62 + 120     // minimum rebound speed on a Bounce plate
    };
  }

  function plateAt(pl, t, out) {
    if (pl.omega) {
      const ph = pl.phase0 + pl.omega * t;
      out.x = pl.mid + pl.amp * Math.sin(ph);
      out.vx = pl.amp * pl.omega * Math.cos(ph);
    } else { out.x = pl.mid + pl.amp * Math.sin(pl.phase0); out.vx = 0; }
    out.state = pl.mode === 'timed' ? (Math.floor(t / pl.period) % 2 === 0 ? 'catch' : 'bounce') : pl.mode;
    return out;
  }

  /* ── Contact tests ────────────────────────────────────────────────────── */

  const hit = { nx: 0, ny: 0, depth: 0, px: 0, py: 0, bvx: 0, bvy: 0 };

  /** Ball vs circle body at pose. Fills `hit`; returns true on contact. */
  function testPeg(ball, pose, r) {
    const dx = ball.x - pose.x, dy = ball.y - pose.y;
    const rr = ball.r + r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return false;
    const d = Math.sqrt(d2) || 1e-6;
    hit.nx = dx / d; hit.ny = dy / d; hit.depth = rr - d;
    hit.px = pose.x + hit.nx * r; hit.py = pose.y + hit.ny * r;
    hit.bvx = pose.vx; hit.bvy = pose.vy;
    if (pose.w) { hit.bvx = pose.vx - pose.w * (hit.py - pose.y); hit.bvy = pose.vy + pose.w * (hit.px - pose.x); }
    return true;
  }

  /** Ball vs oriented box body at pose. */
  function testBrick(ball, pose, hw, hh) {
    const c = Math.cos(pose.a), s = Math.sin(pose.a);
    const dx = ball.x - pose.x, dy = ball.y - pose.y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    let nlx, nly, depth, qx, qy;
    if (Math.abs(lx) < hw && Math.abs(ly) < hh) {
      const px = hw - Math.abs(lx), py = hh - Math.abs(ly);
      if (px < py) { nlx = lx < 0 ? -1 : 1; nly = 0; depth = px + ball.r; qx = nlx * hw; qy = ly; }
      else { nlx = 0; nly = ly < 0 ? -1 : 1; depth = py + ball.r; qx = lx; qy = nly * hh; }
    } else {
      qx = U.clamp(lx, -hw, hw); qy = U.clamp(ly, -hh, hh);
      const ex = lx - qx, ey = ly - qy, d2 = ex * ex + ey * ey;
      if (d2 >= ball.r * ball.r) return false;
      const d = Math.sqrt(d2) || 1e-6;
      nlx = ex / d; nly = ey / d; depth = ball.r - d;
    }
    hit.nx = nlx * c - nly * s; hit.ny = nlx * s + nly * c; hit.depth = depth;
    hit.px = pose.x + qx * c - qy * s; hit.py = pose.y + qx * s + qy * c;
    hit.bvx = pose.vx; hit.bvy = pose.vy;
    if (pose.w) { hit.bvx = pose.vx - pose.w * (hit.py - pose.y); hit.bvy = pose.vy + pose.w * (hit.px - pose.x); }
    return true;
  }

  /** Reflect the ball off the surface in `hit` with restitution e. */
  function respond(ball, e, friction, rng) {
    ball.x += hit.nx * hit.depth;
    ball.y += hit.ny * hit.depth;
    const rvx = ball.vx - hit.bvx, rvy = ball.vy - hit.bvy;
    const vn = rvx * hit.nx + rvy * hit.ny;
    if (vn >= 0) return false;
    let tx = rvx - vn * hit.nx, ty = rvy - vn * hit.ny;
    const keep = 1 - friction;
    tx *= keep; ty *= keep;
    let nvx = tx - vn * e * hit.nx + hit.bvx;
    let nvy = ty - vn * e * hit.ny + hit.bvy;
    // A whisker of seeded spin so a ball can never balance forever on a peg top.
    if (rng) {
      const j = (rng() - 0.5) * 0.02;
      const c = Math.cos(j), s = Math.sin(j);
      const ax = nvx * c - nvy * s, ay = nvx * s + nvy * c;
      nvx = ax; nvy = ay;
      if (hit.ny < -0.92 && Math.abs(nvx) < 30 && Math.abs(nvy) < 120) nvx += (rng() < 0.5 ? -1 : 1) * 45;
    }
    ball.vx = nvx; ball.vy = nvy;
    return true;
  }

  /* ── The world ────────────────────────────────────────────────────────── */

  class World {
    /**
     * @param level  normalised level (P3.levels.normLevel)
     * @param mode   P3.catalog.MODES entry
     * @param seed   shot seed for the deterministic jitter
     */
    constructor(level, mode, seed) {
      this.level = level;
      this.mode = mode;
      this.gravity = mode.gravity * (level.gravity || 1);
      this.launchSpeed = mode.launch * (level.speed || 1);
      this.bodies = level.items.map(makeBody);
      this.movers = this.bodies.filter(b => b.m);
      this.holes = this.bodies.filter(b => b.t === 'hole');
      this.portals = this.bodies.filter(b => b.t === 'portal');
      this.plate = makePlate(level.plate, mode);
      this.t = 0;                 // board time: moving pegs and the plate follow it
      this.balls = [];
      this.nextBallId = 1;
      this.rng = U.mulberry32(seed >>> 0);
      this.seed = seed >>> 0;
      this.ballSerial = 0;
      this._pose = { x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0 };
      this._plate = { x: 0, vx: 0, state: 'bounce' };
      this.pose(0);
    }

    /** Move every moving body (and the plate) to time t. */
    pose(t) {
      for (const b of this.movers) poseAt(b, t, b);
      plateAt(this.plate, t, this.plate);
    }

    reseed(seed) { this.seed = seed >>> 0; this.rng = U.mulberry32(this.seed); this.ballSerial = 0; }

    /** Each ball of a shot gets its own jitter sequence; the first matches the guide's. */
    ballRng(serial) { return U.mulberry32((this.seed + serial * 0x632BE5AB) >>> 0); }

    /** Where a ball leaves the launcher for an aim angle (degrees from straight down). */
    muzzle(angleDeg) {
      const a = U.rad(angleDeg);
      const dx = Math.sin(a), dy = Math.cos(a);
      return { x: B.LAUNCH_X + dx * 48, y: B.LAUNCH_Y + dy * 48, dx, dy };
    }

    spawn(x, y, vx, vy, extra) {
      const ball = Object.assign({
        id: this.nextBallId++, x, y, vx, vy, r: this.mode.ballR,
        alive: true, age: 0, touching: new Set(), portalCool: 0,
        anchorX: x, anchorY: y, anchorT: 0, stuckStage: 0,
        fireUntil: 0, netUntil: 0, travel: 0, rng: this.ballRng(this.ballSerial++)
      }, extra || {});
      this.balls.push(ball);
      return ball;
    }

    launch(angleDeg, extra) {
      const m = this.muzzle(angleDeg);
      const s = this.launchSpeed;
      return this.spawn(m.x, m.y, m.dx * s, m.dy * s, extra);
    }

    /** Advance the board by dt seconds (whole fixed steps; the remainder carries). */
    step(dt, handler) {
      this._acc = (this._acc || 0) + dt;
      let n = 0;
      while (this._acc >= STEP && n < 40) {
        this._acc -= STEP; n++;
        this.t += STEP;
        this.pose(this.t);
        for (const ball of this.balls) if (ball.alive) this.stepBall(ball, STEP, handler, false);
        if (this.balls.some(b => !b.alive)) this.balls = this.balls.filter(b => b.alive);
      }
      if (n >= 40) this._acc = 0;     // a long stall: drop the backlog rather than spiral
      return n;
    }

    /**
     * One fixed step for one ball. `dry` = guide prediction: bodies are posed
     * on the fly at the ball's own time, and nothing in the world changes.
     */
    stepBall(ball, h, handler, dry, tNow) {
      const t = dry ? tNow : this.t;
      ball.age += h;
      if (ball.portalCool > 0) ball.portalCool -= h;

      // Black holes pull.
      for (const hole of this.holes) {
        if (!hole.alive) continue;
        const pose = (dry && hole.m) ? poseAt(hole, t, this._pose) : hole;
        const dx = pose.x - ball.x, dy = pose.y - ball.y;
        const d = Math.hypot(dx, dy) || 1e-6, field = hole.r * 5.2;
        if (d < field) {
          const pull = 3400 * (1 - d / field) + 600;
          ball.vx += dx / d * pull * h;
          ball.vy += dy / d * pull * h;
          if (d < hole.r * 0.55) { ball.alive = false; if (handler.swallow) handler.swallow(ball, hole); return; }
        }
      }

      ball.vy += this.gravity * (ball.gravityScale || 1) * h;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > MAX_SPEED) { ball.vx *= MAX_SPEED / sp; ball.vy *= MAX_SPEED / sp; }
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      ball.travel += sp * h;

      // Walls and ceiling.
      const we = this.mode.wallE;
      if (ball.x < ball.r) { ball.x = ball.r; if (ball.vx < 0) { ball.vx = -ball.vx * we; handler.wall && handler.wall(ball, 'left'); } }
      else if (ball.x > B.W - ball.r) { ball.x = B.W - ball.r; if (ball.vx > 0) { ball.vx = -ball.vx * we; handler.wall && handler.wall(ball, 'right'); } }
      if (ball.y < ball.r) { ball.y = ball.r; if (ball.vy < 0) { ball.vy = -ball.vy * we; handler.wall && handler.wall(ball, 'top'); } }

      // Bodies. A contact counts once, when it begins; resting contacts persist.
      const next = ball._touchNext || (ball._touchNext = new Set());
      next.clear();
      for (const b of this.bodies) {
        if (!b.alive) continue;
        const pose = (dry && b.m) ? poseAt(b, t, this._pose) : b;
        const dx = ball.x - pose.x, dy = ball.y - pose.y, rr = b.r + ball.r + 2;
        if (dx * dx + dy * dy > rr * rr) continue;

        if (b.t === 'portal') {
          if (ball.portalCool <= 0 && dx * dx + dy * dy < (b.r * 0.85) * (b.r * 0.85)) this.teleport(ball, b, handler, dry, t);
          continue;
        }
        if (!b.solid) continue;
        const touching = b.shape === 'peg' ? testPeg(ball, pose, b.r) : testBrick(ball, pose, b.hw, b.hh);
        if (!touching) continue;

        let res = BOUNCE;
        if (!ball.touching.has(b.id)) {
          res = handler.contact(ball, b, hit);
          if (res === PASS) (ball.passing || (ball.passing = new Set())).add(b.id);
        } else if (ball.passing && ball.passing.has(b.id)) res = PASS;   // still inside something it is passing through
        next.add(b.id);
        if (res === KILL) { ball.alive = false; return; }
        if (res === PASS) continue;
        const e = this.restitution(b);
        respond(ball, e, this.mode.friction, ball.rng || this.rng);
        if (b.t === 'bumper') {
          const s2 = Math.hypot(ball.vx, ball.vy);
          if (s2 < 640) { ball.vx *= 640 / Math.max(s2, 1); ball.vy *= 640 / Math.max(s2, 1); }
        }
      }
      if (ball.passing && ball.passing.size) for (const id of ball.passing) if (!next.has(id)) ball.passing.delete(id);
      ball._touchNext = ball.touching;
      ball.touching = next;

      // Safety net.
      if (ball.netUntil > ball.age && ball.y > B.H - 14 - ball.r && ball.vy > 0) {
        ball.y = B.H - 14 - ball.r;
        ball.vy = -Math.max(Math.abs(ball.vy) * 0.95, this.plate.kick * 1.15);
        handler.net && handler.net(ball);
      }

      // The base plate (a capsule).
      this.plateContact(ball, handler, dry, t);
      if (!ball.alive) return;

      // Out the bottom.
      if (ball.y > B.DRAIN_Y) { ball.alive = false; handler.drained && handler.drained(ball); return; }

      // Going nowhere?
      if (!dry) this.watchStuck(ball, handler);
    }

    restitution(b) {
      const M = this.mode;
      if (b.t === 'bumper') return M.bumperE;
      if (b.shape === 'brick') return M.brickE;
      return M.pegE;
    }

    plateContact(ball, handler, dry, t) {
      if (this.plateOff) return;          // the finale swaps the plate for bonus slots
      const pl = dry ? plateAt(this.plate, t, this._plate) : this.plate;
      const P = this.plate;
      const R = P.h / 2;
      if (ball.y < P.y - R - ball.r - 2 || ball.y > P.y + R + ball.r + 2) return;
      const half = P.w / 2 - R;
      const qx = U.clamp(ball.x, pl.x - half, pl.x + half);
      const dx = ball.x - qx, dy = ball.y - P.y;
      const rr = R + ball.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) return;
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d, ny = dy / d;
      if (pl.state === 'catch' && ny < -0.35) {
        const take = handler.plate ? handler.plate(ball, 'catch', { x: ball.x, y: P.y - R }) : true;
        if (take !== false) { ball.alive = false; return; }
      }
      // Bounce: off the rim, or the springy Bounce plate.
      ball.x = qx + nx * rr; ball.y = P.y + ny * rr;
      const rvx = ball.vx - pl.vx, rvy = ball.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn >= 0) return;
      if (ny < -0.35) {
        const off = U.clamp((ball.x - pl.x) / (P.w / 2), -1, 1);
        ball.vy = -Math.max(Math.abs(ball.vy) * 0.92, P.kick);
        ball.vx = ball.vx * 0.85 + off * 260 + pl.vx * 0.25;
        if (handler.plate) handler.plate(ball, 'bounce', { x: ball.x, y: P.y - R });
      } else {
        ball.vx = rvx - 1.8 * vn * nx + pl.vx;
        ball.vy = rvy - 1.8 * vn * ny;
      }
    }

    teleport(ball, from, handler, dry, t) {
      const to = this.portals.find(p => p !== from && p.alive && p.item.p === from.item.p);
      if (!to) return;
      const pose = (dry && to.m) ? poseAt(to, t, { x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0 }) : to;
      const sp = Math.hypot(ball.vx, ball.vy) || 1;
      const ux = ball.vx / sp, uy = ball.vy / sp;
      ball.x = pose.x + ux * (to.r + ball.r * 0.2);
      ball.y = pose.y + uy * (to.r + ball.r * 0.2);
      ball.portalCool = 0.3;
      if (handler.portal) handler.portal(ball, from, to);
    }

    watchStuck(ball, handler) {
      // A moving ball can cycle forever between a spring plate and a wall.
      // Return it as well as locally stalled balls, so every shot can finish.
      if (ball.age >= 60) {
        ball.alive = false;
        handler.stuck && handler.stuck(ball, 3);
        return;
      }
      const dx = ball.x - ball.anchorX, dy = ball.y - ball.anchorY;
      if (dx * dx + dy * dy > 55 * 55) {
        ball.anchorX = ball.x; ball.anchorY = ball.y; ball.anchorT = ball.age; ball.stuckStage = 0;
        return;
      }
      const still = ball.age - ball.anchorT;
      if (still > 2.0 && ball.stuckStage === 0) { ball.stuckStage = 1; handler.stuck && handler.stuck(ball, 1); }
      else if (still > 4.5 && ball.stuckStage === 1) {
        ball.stuckStage = 2;
        // Nudge it free before giving up.
        ball.vx += ((ball.rng || this.rng)() < 0.5 ? -1 : 1) * 380; ball.vy = -420;
        handler.stuck && handler.stuck(ball, 2);
      } else if (still > 9 && ball.stuckStage === 2) {
        ball.stuckStage = 3;
        ball.alive = false;
        handler.stuck && handler.stuck(ball, 3);
      }
    }

    /**
     * Predict a bare physics shot. Nothing in the world changes. The game's
     * guide uses Match.predictGuide to include the full rules and saved powers.
     * Returns { points: [{x,y}], hits: [{x,y,body}], end: 'time'|'bounces'|'drain'|'catch'|'kill' }.
     * `opts.fire` previews passing through pegs; `opts.everyStep` records 240 Hz.
     */
    predict(angleDeg, maxTime, maxBounces, opts) {
      opts = opts || {};
      const m = this.muzzle(angleDeg);
      const s = this.launchSpeed;
      const ball = {
        id: -1, x: m.x, y: m.y, vx: m.dx * s, vy: m.dy * s, r: this.mode.ballR * (opts.scale || 1),
        alive: true, age: 0, touching: new Set(), portalCool: 0, fireUntil: opts.fire ? 3.2 : 0, netUntil: 0, travel: 0,
        rng: this.ballRng(0)
      };
      const out = { points: [{ x: ball.x, y: ball.y }], hits: [], end: 'time' };
      let bounces = 0, sinceSample = 0, stopAfter = -1;
      const dry = {
        contact(b, body, h) {
          out.hits.push({ x: h.px, y: h.py, body });
          bounces++;
          if (body.t === 'spike') return KILL;
          if (b.fireUntil > b.age && (C.isBreakablePeg(body.t) || body.t === 'lantern')) return PASS;
          if (body.t === 'glass') return PASS;
          return BOUNCE;
        },
        wall() { bounces++; out.hits.push({ x: ball.x, y: ball.y, body: null }); },
        plate(b, kind) { if (kind === 'catch') { out.end = 'catch'; } return true; },
        swallow() { out.end = 'kill'; },
        drained() { out.end = 'drain'; }
      };
      let t = this.t;
      const maxSteps = Math.ceil(maxTime / STEP);
      for (let i = 0; i < maxSteps && ball.alive; i++) {
        t += STEP;
        this.stepBall(ball, STEP, dry, true, t);
        sinceSample += STEP;
        if (opts.everyStep || sinceSample >= 1 / 90 || !ball.alive) { out.points.push({ x: ball.x, y: ball.y }); sinceSample = 0; }
        if (bounces > maxBounces && stopAfter < 0) stopAfter = i + 10;   // a short tail past the last bounce
        if (stopAfter >= 0 && i >= stopAfter) { out.end = 'bounces'; break; }
      }
      if (!ball.alive && out.end === 'time') out.end = 'kill';
      return out;
    }
  }

  P3.physics = { World, STEP, BOUNCE, PASS, KILL, poseAt, plateAt, makeBody };
})(typeof window !== 'undefined' ? window : globalThis);
