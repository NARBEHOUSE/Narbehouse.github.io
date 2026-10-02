/**
 * NARBE Mini Golf — ball physics.
 *
 * Works on the flat course plane in course px, with "frames" (1/60 s) as the
 * time unit, the same units the original top-down game used, so speeds and
 * friction carry over: full power is 60 px/frame and turf keeps 98% of the
 * ball's speed per frame.
 *
 * The step is fixed (1/120 s) and every random deflection comes from a seeded
 * generator. That makes a shot fully deterministic, which the whole game is
 * built on: the moment the putter connects, simulateShot() plays the entire
 * shot out to the end — every bounce, splash and drop — and the game then
 * *plays back* that recording. The camera director knows in advance that the
 * ball will drop in 1.2 s and can be sitting at the cup, slowed down, waiting
 * for it; instant replays are just the same recording again; and the aim
 * preview is the same code with randomness switched off.
 *
 * Hills tilt the turf; their slope pushes the ball (gravity), and a ball can
 * only come to rest where rolling resistance can hold it.
 */
(function (root) {
  'use strict';

  const MG = root.MG = root.MG || {};
  const C = MG.course;

  const P = {
    STEP: 0.5,              // frames per sim step (1/120 s)
    STEP_SEC: 0.5 / 60,
    MAX_SPEED: 60,          // px/frame at full power (the original's 3.0 × 20)
    MIN_SPEED: 1.2,
    FRICTION: 0.982,        // speed kept per frame on turf
    ROLL: 0.022,            // constant rolling resistance, px/frame² — trims the endless creep
    ICE_FRICTION: 0.997,
    ICE_ROLL: 0.004,
    SAND_ENTRY: 0.5,        // speed kept on dropping into sand (original)
    SAND_FRICTION: 0.90,
    SAND_EXIT_DEFLECT: 10,  // ± degrees on leaving sand (original)
    ICE_ENTRY_DEFLECT: 25,  // ± degrees on skating onto ice (original)
    WALL_BOUNCE: 0.8,
    RAIL_BOUNCE: 0.78,
    BALL_BOUNCE: 0.9,
    BUMPER_BOUNCE: 1.25,
    BUMPER_MIN_OUT: 7,
    BOOST_ACCEL: 1.4,       // px/frame² along the pad's arrow
    BOOST_OMNI: 0.035,      // fractional speed gain per frame on an arrowless pad
    BOOST_CAP: 70,
    GRAVITY: 0.55,          // px/frame² per unit of slope
    STATIC_HOLD: 0.03,      // slope push below this, a stopped ball stays put
    STOP_SPEED: 0.08,
    TUNNEL_SPEED: 0.85,     // speed kept through a tunnel
    TUNNEL_MIN_OUT: 9,
    CAPTURE_SPEED: 26,      // px/frame: slower than this across the middle of the cup, it drops
    CAPTURE_EDGE: 0.45,     // ...and this much less forgiving at the very edge
    LIP_KEEP: 0.82,         // speed kept rattling over the lip
    MAX_SIM_SEC: 45
  };

  /* ── Ball state ───────────────────────────────────────────────────────── */

  function makeBall(x, y, r, owner) {
    return {
      x, y, vx: 0, vy: 0, r,
      owner: owner === undefined ? 0 : owner,
      active: true,         // false once sunk, drowned, or not yet on the tee
      sunk: false, drowned: false,
      moving: false,
      wasInSand: false, wasInIce: false, wasInBush: false, wasInBoost: false,
      tunnel: null,         // { t, exitIndex } while travelling underground
      tunnelLock: -1,       // tunnel index whose mouth we must leave before re-entering
      slowTime: 0, slowX: x, slowY: y,
      lastSafeX: x, lastSafeY: y
    };
  }

  function cloneBall(b) {
    const c = Object.assign({}, b);
    c.tunnel = b.tunnel ? Object.assign({}, b.tunnel) : null;
    return c;
  }

  /* ── Surface queries ──────────────────────────────────────────────────── */

  function inRegion(reg, x, y) {
    const b = reg.bbox;
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return false;
    return C.pointInPolygon(x, y, reg.poly);
  }

  function firstRegion(list, x, y) {
    for (let i = 0; i < list.length; i++) if (inRegion(list[i], x, y)) return list[i];
    return null;
  }

  function onBridge(ch, x, y) {
    for (let i = 0; i < ch.bridges.length; i++) {
      const b = ch.bridges[i];
      if (Math.abs(x - b.cx) > b.reach || Math.abs(y - b.cy) > b.reach) continue;
      if (C.inBox(b, x, y)) return b;
    }
    return null;
  }

  /** What's under the ball right now. Bridges cover whatever is beneath them. */
  function surfaceAt(ch, x, y) {
    if (onBridge(ch, x, y)) return { kind: 'bridge', region: null };
    const w = firstRegion(ch.waters, x, y); if (w) return { kind: 'water', region: w };
    const s = firstRegion(ch.sands, x, y); if (s) return { kind: 'sand', region: s };
    const i = firstRegion(ch.ice, x, y); if (i) return { kind: 'ice', region: i };
    const b = firstRegion(ch.boosts, x, y); if (b) return { kind: 'boost', region: b };
    return { kind: 'turf', region: null };
  }

  /* ── Collisions ───────────────────────────────────────────────────────── */

  /** Ball vs oriented box; pushes out and reflects. Returns impact speed or 0. */
  function collideBox(ball, box, bounce) {
    const dx = ball.x - box.cx, dy = ball.y - box.cy;
    const reach = box.reach + ball.r;
    if (dx * dx + dy * dy > reach * reach) return 0;
    const lx = dx * box.cos + dy * box.sin;
    const ly = -dx * box.sin + dy * box.cos;
    const cx = lx < -box.hw ? -box.hw : lx > box.hw ? box.hw : lx;
    const cy = ly < -box.hh ? -box.hh : ly > box.hh ? box.hh : ly;
    let ex = lx - cx, ey = ly - cy;
    let d = Math.hypot(ex, ey);
    if (d >= ball.r) return 0;
    let nx, ny, push;
    if (d > 1e-6) {
      nx = ex / d; ny = ey / d; push = ball.r - d;
    } else {
      // Centre is inside the box: leave by the nearest face.
      const px = box.hw - Math.abs(lx), py = box.hh - Math.abs(ly);
      if (px < py) { nx = lx < 0 ? -1 : 1; ny = 0; push = px + ball.r; }
      else { nx = 0; ny = ly < 0 ? -1 : 1; push = py + ball.r; }
    }
    // Back to world space.
    const wnx = nx * box.cos - ny * box.sin;
    const wny = nx * box.sin + ny * box.cos;
    ball.x += wnx * push;
    ball.y += wny * push;
    const dot = ball.vx * wnx + ball.vy * wny;
    if (dot >= 0) return 0;
    ball.vx -= (1 + bounce) * dot * wnx;
    ball.vy -= (1 + bounce) * dot * wny;
    // The original scaled the whole velocity by the bounce factor, which also
    // bleeds speed along the wall; keep that feel for glancing hits.
    const keep = 0.5 + 0.5 * bounce;
    ball.vx *= keep; ball.vy *= keep;
    return -dot;
  }

  /** Keep the ball on the carpet. Returns impact speed or 0. */
  function collideFairway(ball, fw) {
    let impact = 0;
    if (!C.pointInPolygon(ball.x, ball.y, fw.poly)) {
      // Tunnelled through a rail (only possible after a teleport or a huge
      // step). Put it back just inside the nearest edge.
      let best = null, bestD = Infinity;
      for (const e of fw.edges) {
        const c = C.closestOnSegment(ball.x, ball.y, e.x1, e.y1, e.x2, e.y2);
        const d = Math.hypot(ball.x - c.x, ball.y - c.y);
        if (d < bestD) { bestD = d; best = { c, e }; }
      }
      if (best) {
        ball.x = best.c.x + best.e.nx * (ball.r + 0.5);
        ball.y = best.c.y + best.e.ny * (ball.r + 0.5);
        const dot = ball.vx * best.e.nx + ball.vy * best.e.ny;
        if (dot < 0) {
          ball.vx -= (1 + P.RAIL_BOUNCE) * dot * best.e.nx;
          ball.vy -= (1 + P.RAIL_BOUNCE) * dot * best.e.ny;
          impact = -dot;
        }
      }
      return impact;
    }
    const r = ball.r;
    for (let i = 0; i < fw.edges.length; i++) {
      const e = fw.edges[i];
      // Cheap reject: distance to the edge's infinite line.
      const side = (ball.x - e.x1) * e.nx + (ball.y - e.y1) * e.ny;
      if (side > r || side < -r) continue;
      const c = C.closestOnSegment(ball.x, ball.y, e.x1, e.y1, e.x2, e.y2);
      const dx = ball.x - c.x, dy = ball.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d >= r) continue;
      let nx, ny;
      if (d > 1e-6) { nx = dx / d; ny = dy / d; } else { nx = e.nx; ny = e.ny; }
      // Inside the carpet the contact normal must point inward.
      if (nx * e.nx + ny * e.ny < 0) { nx = e.nx; ny = e.ny; }
      const push = r - d;
      ball.x += nx * push; ball.y += ny * push;
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot < 0) {
        ball.vx -= (1 + P.RAIL_BOUNCE) * dot * nx;
        ball.vy -= (1 + P.RAIL_BOUNCE) * dot * ny;
        const keep = 0.5 + 0.5 * P.RAIL_BOUNCE;
        ball.vx *= keep; ball.vy *= keep;
        impact = Math.max(impact, -dot);
      }
    }
    return impact;
  }

  function collideBumper(ball, bp) {
    const dx = ball.x - bp.x, dy = ball.y - bp.y;
    const min = ball.r + bp.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return 0;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d, ny = dy / d;
    ball.x = bp.x + nx * (min + 0.1);
    ball.y = bp.y + ny * (min + 0.1);
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot >= 0) return 0;
    const outN = Math.max(-dot * P.BUMPER_BOUNCE, P.BUMPER_MIN_OUT);
    ball.vx += (-dot + outN) * nx;
    ball.vy += (-dot + outN) * ny;
    capSpeed(ball, P.BOOST_CAP);
    return -dot;
  }

  /** Bushes catch a ball at their edge and hold it there, as the original's "stuck" rule did. */
  function catchInBush(ball, bush) {
    const dx = ball.x - bush.x, dy = ball.y - bush.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const sit = bush.radius + ball.r * 0.15;   // nestled into the leaves, still visible
    ball.x = bush.x + dx / d * sit;
    ball.y = bush.y + dy / d * sit;
    const speed = Math.hypot(ball.vx, ball.vy);
    ball.vx = 0; ball.vy = 0;
    return speed;
  }

  function collideBalls(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const min = a.r + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-9) return 0;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    const va = a.vx * nx + a.vy * ny;
    const vb = b.vx * nx + b.vy * ny;
    const rel = va - vb;
    // Separate first so resting neighbours don't stick together.
    const overlap = (min - d) / 2 + 0.05;
    a.x -= nx * overlap; a.y -= ny * overlap;
    b.x += nx * overlap; b.y += ny * overlap;
    if (rel <= 0) return 0;
    // Equal masses: swap the normal components (the original's 1-D elastic hit).
    a.vx += (vb - va) * nx; a.vy += (vb - va) * ny;
    b.vx += (va - vb) * nx; b.vy += (va - vb) * ny;
    a.vx *= P.BALL_BOUNCE; a.vy *= P.BALL_BOUNCE;
    b.vx *= P.BALL_BOUNCE; b.vy *= P.BALL_BOUNCE;
    return rel;
  }

  function capSpeed(ball, cap) {
    const s = Math.hypot(ball.vx, ball.vy);
    if (s > cap) { ball.vx *= cap / s; ball.vy *= cap / s; }
  }

  function rotateVel(ball, degrees) {
    const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const vx = ball.vx * c - ball.vy * s;
    ball.vy = ball.vx * s + ball.vy * c;
    ball.vx = vx;
  }

  /* ── World ────────────────────────────────────────────────────────────── */

  /**
   * opts.seed      → seeded deflections (a real shot). Omit for a preview,
   *                  which is the same physics with the dice taken away.
   * opts.t0        → world clock (s) at shot start; the windmill reads it.
   * opts.events    → collect an event list.
   */
  function createWorld(ch, balls, opts) {
    opts = opts || {};
    return {
      ch,
      balls,
      t: opts.t0 || 0,
      elapsed: 0,
      rng: opts.seed !== undefined && opts.seed !== null ? MG.util.mulberry32(opts.seed) : null,
      events: opts.events ? [] : null,
      grad: { x: 0, y: 0 }
    };
  }

  function emit(w, type, ball, extra) {
    if (!w.events) return;
    const e = { t: w.elapsed, type, ball: w.balls.indexOf(ball), x: ball.x, y: ball.y };
    if (extra) Object.assign(e, extra);
    w.events.push(e);
  }

  function jitter(w, maxDeg) {
    return w.rng ? (w.rng() * 2 - 1) * maxDeg : 0;
  }

  /** Advance one ball by dt frames (already small enough not to tunnel). */
  function moveBall(w, ball, dt) {
    const ch = w.ch;

    if (ball.tunnel) {
      ball.tunnel.t -= dt;
      if (ball.tunnel.t > 0) return;
      const tn = ch.tunnels[ball.tunnel.index];
      const a = tn.exitAngle * Math.PI / 180;
      const out = tn.radius + ball.r + 2;
      ball.x = tn.x2 + Math.cos(a) * out;
      ball.y = tn.y2 + Math.sin(a) * out;
      const sp = Math.max(ball.tunnel.speed * P.TUNNEL_SPEED, P.TUNNEL_MIN_OUT);
      ball.vx = Math.cos(a) * sp; ball.vy = Math.sin(a) * sp;
      ball.tunnelLock = ball.tunnel.index;
      ball.tunnel = null;
      emit(w, 'tunnelOut', ball, { tunnel: ball.tunnelLock });
      return;
    }

    const surf = surfaceAt(ch, ball.x, ball.y);
    const kind = surf.kind;

    // Hills — not on bridge decks, which are level.
    if (ch.hills.length && kind !== 'bridge') {
      C.hillGradient(ch.hills, ball.x, ball.y, w.grad);
      ball.vx -= P.GRAVITY * w.grad.x * dt;
      ball.vy -= P.GRAVITY * w.grad.y * dt;
    }

    // Entering / leaving sand and ice.
    const inSand = kind === 'sand', inIce = kind === 'ice', inBoost = kind === 'boost';
    if (inSand && !ball.wasInSand) {
      ball.vx *= P.SAND_ENTRY; ball.vy *= P.SAND_ENTRY;
      emit(w, 'sand', ball, { speed: Math.hypot(ball.vx, ball.vy) });
    } else if (!inSand && ball.wasInSand && kind !== 'bridge') {
      rotateVel(ball, jitter(w, P.SAND_EXIT_DEFLECT));
    }
    if (inIce && !ball.wasInIce) {
      rotateVel(ball, jitter(w, P.ICE_ENTRY_DEFLECT));
      emit(w, 'ice', ball);
    }
    if (inBoost && !ball.wasInBoost) emit(w, 'boost', ball);
    ball.wasInSand = inSand; ball.wasInIce = inIce; ball.wasInBoost = inBoost;

    // Boost pads push along their arrow.
    if (inBoost) {
      const reg = surf.region;
      if (reg.directional) {
        ball.vx += reg.dirX * P.BOOST_ACCEL * dt;
        ball.vy += reg.dirY * P.BOOST_ACCEL * dt;
      } else {
        const g = 1 + P.BOOST_OMNI * dt;
        ball.vx *= g; ball.vy *= g;
      }
      capSpeed(ball, P.BOOST_CAP);
    }

    // Friction plus a little rolling resistance.
    let fr = P.FRICTION, roll = P.ROLL;
    if (inIce) { fr = P.ICE_FRICTION; roll = P.ICE_ROLL; }
    else if (inSand) { fr = P.SAND_FRICTION; }
    const f = Math.pow(fr, dt);
    ball.vx *= f; ball.vy *= f;
    let sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - roll * dt);
      ball.vx *= ns / sp; ball.vy *= ns / sp;
      sp = ns;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Rails, walls, bumpers.
    let hit = collideFairway(ball, ch.fairway);
    if (hit > 0.6) emit(w, 'rail', ball, { speed: hit });
    for (let i = 0; i < ch.solids.length; i++) {
      const s = ch.solids[i];
      const imp = collideBox(ball, s, s.solid === 'rail' ? P.RAIL_BOUNCE : P.WALL_BOUNCE);
      if (imp > 0.6) emit(w, s.solid === 'windmill' ? 'windmill' : 'wall', ball, { speed: imp });
    }
    for (let i = 0; i < ch.windmills.length; i++) {
      const m = ch.windmills[i];
      if (C.windmillGateClosed(m, w.t)) {
        const imp = collideBox(ball, m.gate, P.WALL_BOUNCE);
        if (imp > 0.6) emit(w, 'sail', ball, { speed: imp, windmill: i });
      }
    }
    for (let i = 0; i < ch.bumpers.length; i++) {
      const imp = collideBumper(ball, ch.bumpers[i]);
      if (imp > 0) emit(w, 'bumper', ball, { speed: imp, bumper: i });
    }

    // Bushes grab the ball at their edge.
    let inBush = false;
    for (let i = 0; i < ch.bushes.length; i++) {
      const b = ch.bushes[i];
      const dx = ball.x - b.x, dy = ball.y - b.y;
      if (dx * dx + dy * dy < b.r2) {
        inBush = true;
        // Only a ball heading in gets caught; one leaving its bush rolls free.
        if ((ball.vx * dx + ball.vy * dy) < 0 || !ball.wasInBush) {
          const s = catchInBush(ball, b);
          if (!ball.wasInBush && s > 0.3) emit(w, 'bush', ball, { speed: s, bush: i });
        }
        break;
      }
    }
    ball.wasInBush = inBush;

    // Tunnels swallow the ball and spit it out of the other mouth.
    if (ball.tunnelLock >= 0) {
      const tl = ch.tunnels[ball.tunnelLock];
      if (Math.hypot(ball.x - tl.x2, ball.y - tl.y2) > tl.radius + ball.r * 2 &&
          Math.hypot(ball.x - tl.x1, ball.y - tl.y1) > tl.radius) ball.tunnelLock = -1;
    }
    for (let i = 0; i < ch.tunnels.length; i++) {
      if (i === ball.tunnelLock) continue;
      const tn = ch.tunnels[i];
      if (Math.hypot(ball.x - tn.x1, ball.y - tn.y1) < tn.radius) {
        const speed = Math.hypot(ball.vx, ball.vy);
        const len = Math.hypot(tn.x2 - tn.x1, tn.y2 - tn.y1);
        ball.tunnel = { index: i, speed, t: Math.min(50, 14 + len / Math.max(speed, 6) * 0.6) };
        ball.x = tn.x1; ball.y = tn.y1; ball.vx = 0; ball.vy = 0;
        emit(w, 'tunnelIn', ball, { tunnel: i, speed });
        return;
      }
    }

    // Water and the cup end the ball's run.
    const after = surfaceAt(ch, ball.x, ball.y);
    if (after.kind === 'water') {
      ball.active = false; ball.drowned = true; ball.moving = false;
      emit(w, 'water', ball, { speed: sp });
      return;
    }
    // The cup. A ball that's going too fast hops the far lip instead of
    // dropping — generous across the middle, less so at the edge — so a
    // full-power blast pinballing round the rails doesn't fall in by luck.
    const cdx = ball.x - ch.cup.x, cdy = ball.y - ch.cup.y;
    const cd2 = cdx * cdx + cdy * cdy;
    if (cd2 < ch.cup.r * ch.cup.r) {
      const d = Math.sqrt(cd2);
      const speed = Math.hypot(ball.vx, ball.vy);
      const cap = P.CAPTURE_SPEED * (1 - P.CAPTURE_EDGE * d / ch.cup.r);
      if (speed <= cap) {
        emit(w, 'cup', ball, { speed, vx: ball.vx, vy: ball.vy });
        ball.active = false; ball.sunk = true; ball.moving = false;
        ball.x = ch.cup.x; ball.y = ch.cup.y; ball.vx = 0; ball.vy = 0;
        return;
      }
      if (!ball.lipped) {
        ball.lipped = true;
        // Rattle over the lip: lose some pace and get nudged away from centre.
        const nx = d > 1e-6 ? cdx / d : 0, ny = d > 1e-6 ? cdy / d : 0;
        ball.vx = ball.vx * P.LIP_KEEP + nx * speed * 0.12;
        ball.vy = ball.vy * P.LIP_KEEP + ny * speed * 0.12;
        emit(w, 'lip', ball, { speed, near: speed < cap * 1.6 });
      }
    } else {
      ball.lipped = false;
    }

    if (after.kind !== 'sand' && after.kind !== 'ice' && !inBush) { ball.lastSafeX = ball.x; ball.lastSafeY = ball.y; }
  }

  /** Slope push at a point, for the "can it rest here?" test. */
  function slopePush(w, x, y) {
    if (!w.ch.hills.length || onBridge(w.ch, x, y)) return 0;
    C.hillGradient(w.ch.hills, x, y, w.grad);
    return P.GRAVITY * Math.hypot(w.grad.x, w.grad.y);
  }

  /** One fixed step for every live ball. */
  function step(w) {
    const dt = P.STEP;
    const balls = w.balls;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b.active || !b.moving) continue;
      const sp = Math.hypot(b.vx, b.vy);
      const n = b.tunnel ? 1 : Math.min(16, Math.max(1, Math.ceil(sp * dt / (b.r * 0.35))));
      for (let k = 0; k < n && b.active && b.moving; k++) moveBall(w, b, dt / n);
    }

    // Ball-on-ball. A resting ball that gets hit wakes up.
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.active || a.tunnel) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b.active || b.tunnel) continue;
        if (!a.moving && !b.moving) continue;
        const rel = collideBalls(a, b);
        if (rel > 0) {
          a.moving = true; b.moving = true;
          if (rel > 0.4) emit(w, 'ball', a, { other: j, speed: rel });
        }
      }
    }

    // Who has come to rest?
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b.active || !b.moving || b.tunnel) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < P.STOP_SPEED && slopePush(w, b.x, b.y) <= P.STATIC_HOLD) {
        settle(w, b);
        continue;
      }
      // Fallback for a ball pinned against a rail on a slope, jittering forever.
      if (sp < 0.6) {
        b.slowTime += dt;
        if (b.slowTime > 90) {
          if (Math.hypot(b.x - b.slowX, b.y - b.slowY) < 5) { settle(w, b); continue; }
          b.slowTime = 0; b.slowX = b.x; b.slowY = b.y;
        }
      } else {
        b.slowTime = 0; b.slowX = b.x; b.slowY = b.y;
      }
    }

    w.elapsed += P.STEP_SEC;
    w.t += P.STEP_SEC;
  }

  function settle(w, b) {
    b.vx = 0; b.vy = 0; b.moving = false; b.slowTime = 0;
    emit(w, 'rest', b);
  }

  function anyMoving(w) {
    for (const b of w.balls) if (b.active && (b.moving || b.tunnel)) return true;
    return false;
  }

  function launch(ball, angle, power) {
    const sp = Math.max(P.MIN_SPEED, power * P.MAX_SPEED);
    ball.vx = Math.cos(angle) * sp;
    ball.vy = Math.sin(angle) * sp;
    ball.moving = true;
    ball.slowTime = 0; ball.slowX = ball.x; ball.slowY = ball.y;
  }

  /* ── The two entry points ─────────────────────────────────────────────── */

  /**
   * Play an entire shot out to the end.
   *
   * balls      live ball states for everyone on the green (copied, not mutated)
   * shooter    index into balls
   * angle      radians, course space (0 = +x, y down)
   * power      0..1
   *
   * Returns { frames: Float32Array[] (x,y per ball per step), steps, duration,
   *           events, balls: final states }.
   */
  function simulateShot(ch, balls, shooter, angle, power, opts) {
    opts = opts || {};
    const sim = balls.map(cloneBall);
    const w = createWorld(ch, sim, { seed: opts.seed === undefined ? 1 : opts.seed, t0: opts.t0 || 0, events: true });
    launch(sim[shooter], angle, power);
    emit(w, 'putt', sim[shooter], { power });

    const maxSteps = Math.ceil(P.MAX_SIM_SEC / P.STEP_SEC);
    const frames = [];
    const snap = () => {
      const f = new Float32Array(sim.length * 3);
      for (let i = 0; i < sim.length; i++) {
        f[i * 3] = sim[i].x; f[i * 3 + 1] = sim[i].y;
        f[i * 3 + 2] = sim[i].tunnel ? 1 : 0;
      }
      frames.push(f);
    };
    snap();
    let n = 0;
    while (anyMoving(w) && n < maxSteps) { step(w); snap(); n++; }
    // Anything still rolling at the cap just stops where it is.
    for (const b of sim) if (b.active && (b.moving || b.tunnel)) {
      if (b.tunnel) { const tn = ch.tunnels[b.tunnel.index]; b.x = tn.x2; b.y = tn.y2; b.tunnel = null; }
      settle(w, b);
    }
    return { frames, steps: n, duration: n * P.STEP_SEC, events: w.events, balls: sim };
  }

  /**
   * The aim line: where would this putt go? Same physics, no dice.
   *
   * opts.maxTravel  stop drawing after this much path length (px)
   * opts.others     other balls to bounce off (they're treated as movable)
   * Returns { points: [{x,y,t}], end: {x,y}, holed, drowned, travel, stoppedAt }.
   */
  function predict(ch, ball, angle, power, opts) {
    opts = opts || {};
    const me = cloneBall(ball);
    me.active = true;
    const list = [me];
    if (opts.others) for (const o of opts.others) if (o.active) list.push(cloneBall(o));
    const w = createWorld(ch, list, { t0: opts.t0 || 0, events: false });
    launch(me, angle, power);

    const pts = [{ x: me.x, y: me.y, t: 0 }];
    const maxTravel = opts.maxTravel || Infinity;
    const maxSteps = Math.ceil((opts.maxSec || 25) / P.STEP_SEC);
    let travel = 0, lx = me.x, ly = me.y, lastDir = null;
    let n = 0, truncated = false, crossed = false;
    let px = me.x, py = me.y;
    while (n < maxSteps && (me.moving || me.tunnel) && me.active) {
      step(w); n++;
      // Did the line pass over the cup at all, at any speed? (Aim feedback.)
      if (!crossed && !me.tunnel) {
        const c = C.closestOnSegment(ch.cup.x, ch.cup.y, px, py, me.x, me.y);
        if (Math.hypot(c.x - ch.cup.x, c.y - ch.cup.y) < ch.cup.r && Math.hypot(me.x - px, me.y - py) < 200) crossed = true;
      }
      px = me.x; py = me.y;
      if (me.tunnel) { lx = me.x; ly = me.y; continue; }
      const d = Math.hypot(me.x - lx, me.y - ly);
      if (d > 220) {
        // Teleported out of a tunnel: break the line.
        pts.push({ x: me.x, y: me.y, t: w.elapsed, jump: true });
        lx = me.x; ly = me.y; continue;
      }
      if (d < 3 && me.moving) continue;     // keep the polyline light
      travel += d;
      const dir = Math.atan2(me.y - ly, me.x - lx);
      // Skip near-collinear points on straight runs.
      if (lastDir !== null && Math.abs(MG.util.angleDiff(lastDir, dir)) < 0.004 && d < 40 && pts.length > 1 && !pts[pts.length - 1].jump) {
        pts[pts.length - 1] = { x: me.x, y: me.y, t: w.elapsed };
      } else {
        pts.push({ x: me.x, y: me.y, t: w.elapsed });
      }
      lastDir = dir;
      lx = me.x; ly = me.y;
      if (travel >= maxTravel) { truncated = true; break; }
    }
    return {
      points: pts,
      end: { x: me.x, y: me.y },
      holed: me.sunk,
      crossed: crossed || me.sunk,
      drowned: me.drowned,
      travel,
      truncated,
      duration: w.elapsed
    };
  }

  /** Sample a recorded shot at time t (seconds) for one ball → {x, y, under}. */
  function sampleFrames(shot, ballIndex, t, out) {
    out = out || {};
    const f = Math.max(0, Math.min(shot.frames.length - 1, t / P.STEP_SEC));
    const i = Math.floor(f), j = Math.min(shot.frames.length - 1, i + 1), u = f - i;
    const a = shot.frames[i], b = shot.frames[j];
    const k = ballIndex * 3;
    // Never interpolate across a tunnel jump.
    if (Math.abs(a[k] - b[k]) > 150 || Math.abs(a[k + 1] - b[k + 1]) > 150) {
      out.x = a[k]; out.y = a[k + 1];
    } else {
      out.x = a[k] + (b[k] - a[k]) * u;
      out.y = a[k + 1] + (b[k + 1] - a[k + 1]) * u;
    }
    out.under = a[k + 2] > 0.5;
    return out;
  }

  /* ── The route to the cup ─────────────────────────────────────────────────
   * A walking-distance map: how far is it to the cup from here, going round
   * rails, walls, windmill blocks and ponds (bridges count as ground)? It's
   * how the opening aim and the camera know which way the hole *goes* —
   * "toward the cup" is wrong whenever a wall or a bend is in between — and
   * it's what the course bots steer by.
   */
  const ROUTE_CELL = 16;

  function routeField(ch) {
    const bb = ch.fairway.bbox;
    const nx = Math.ceil((bb.x1 - bb.x0) / ROUTE_CELL) + 1, ny = Math.ceil((bb.y1 - bb.y0) / ROUTE_CELL) + 1;
    const free = new Uint8Array(nx * ny);
    const pad = ch.ballR * 0.8;
    const grown = ch.solids.map(s => C.makeBox(s.cx, s.cy, s.hw + pad, s.hh + pad, s.angle));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = bb.x0 + i * ROUTE_CELL, y = bb.y0 + j * ROUTE_CELL;
      if (!C.pointInPolygon(x, y, ch.fairway.poly)) continue;
      if (C.closestOnPolygon(x, y, ch.fairway.poly).d < pad) continue;
      if (grown.some(b => C.inBox(b, x, y))) continue;
      if (surfaceAt(ch, x, y).kind === 'water') continue;
      free[j * nx + i] = 1;
    }
    const d = new Float32Array(nx * ny).fill(Infinity);
    const q = [];
    const seed = (i, j, v) => {
      if (i < 0 || j < 0 || i >= nx || j >= ny) return;
      const k = j * nx + i;
      if (!free[k] || v >= d[k]) return;
      d[k] = v; q.push(k);
    };
    const ci = Math.round((ch.cup.x - bb.x0) / ROUTE_CELL), cj = Math.round((ch.cup.y - bb.y0) / ROUTE_CELL);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) seed(ci + di, cj + dj, Math.hypot(di, dj) * ROUTE_CELL);
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let head = 0;
    const flood = () => {
      for (; head < q.length; head++) {
        const k = q[head], i = k % nx, j = (k - i) / nx;
        for (const [di, dj, w] of NB) seed(i + di, j + dj, d[k] + w * ROUTE_CELL);
      }
    };
    flood();
    // Tunnels: a ball at the way in is as good as one at the way out. Seed
    // each mouth from its exit and keep flooding (twice, for chained tunnels).
    for (let pass = 0; pass < 2; pass++) {
      for (const t of ch.tunnels) {
        const a = t.exitAngle * Math.PI / 180, off = t.radius + ch.ballR + 2;
        const ek = cellNear(t.x2 + Math.cos(a) * off, t.y2 + Math.sin(a) * off);
        if (ek < 0) continue;
        const v = d[ek] + 20;
        const i0 = Math.round((t.x1 - bb.x0) / ROUTE_CELL), j0 = Math.round((t.y1 - bb.y0) / ROUTE_CELL);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) seed(i0 + di, j0 + dj, v + Math.hypot(di, dj) * ROUTE_CELL);
      }
      flood();
    }

    /** The best reachable cell next to (x,y), or -1. */
    function cellNear(x, y) {
      const i0 = Math.round((x - bb.x0) / ROUTE_CELL), j0 = Math.round((y - bb.y0) / ROUTE_CELL);
      let best = -1, bestV = Infinity;
      for (let r = 0; r <= 2 && best < 0; r++) {
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          const i = i0 + di, j = j0 + dj;
          if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
          const k = j * nx + i;
          if (!isFinite(d[k])) continue;
          const v = d[k] + Math.hypot(x - (bb.x0 + i * ROUTE_CELL), y - (bb.y0 + j * ROUTE_CELL));
          if (v < bestV) { bestV = v; best = k; }
        }
      }
      return best;
    }

    return {
      /** Walking distance to the cup from (x,y); Infinity if it can't be reached. */
      at(x, y) {
        const k = cellNear(x, y);
        if (k < 0) return Infinity;
        const i = k % nx, j = (k - i) / nx;
        return d[k] + Math.hypot(x - (bb.x0 + i * ROUTE_CELL), y - (bb.y0 + j * ROUTE_CELL));
      },
      /**
       * The shortest way from (x,y) to the cup, as a list of points. If the
       * way goes through a tunnel, the list ends at the tunnel's mouth.
       */
      path(x, y) {
        let k = cellNear(x, y);
        const out = [];
        let arrived = false;
        for (let n = 0; k >= 0 && n < 600; n++) {
          const i = k % nx, j = (k - i) / nx;
          out.push({ x: bb.x0 + i * ROUTE_CELL, y: bb.y0 + j * ROUTE_CELL });
          if (d[k] < ROUTE_CELL * 2) { arrived = true; break; }
          let next = -1, nv = d[k];
          for (const [di, dj] of NB) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
            const kk = jj * nx + ii;
            if (d[kk] < nv) { nv = d[kk]; next = kk; }
          }
          k = next;
        }
        if (arrived) out.push({ x: ch.cup.x, y: ch.cup.y });
        return out;
      }
    };
  }

  /** The route map for a compiled hole, built once and kept on it. */
  function routeFor(ch) {
    if (!ch._route) ch._route = routeField(ch);
    return ch._route;
  }

  /** Can a ball roll in a straight line from a to b without touching a rail or wall, or crossing water? */
  function lineClear(ch, ax, ay, bx, by, pad) {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / 8));
    for (let s = 1; s <= n; s++) {
      const x = ax + (bx - ax) * s / n, y = ay + (by - ay) * s / n;
      if (!C.pointInPolygon(x, y, ch.fairway.poly)) return false;
      if (C.closestOnPolygon(x, y, ch.fairway.poly).d < pad) return false;
      if (ch.waters.length && surfaceAt(ch, x, y).kind === 'water') return false;   // bridges count as ground
      for (const b of ch.solids) {
        if (Math.abs(x - b.cx) > b.reach + pad || Math.abs(y - b.cy) > b.reach + pad) continue;
        const l = C.toLocal(b, x, y);
        if (Math.abs(l.x) < b.hw + pad && Math.abs(l.y) < b.hh + pad) return false;
      }
    }
    return true;
  }

  /**
   * The opening aim for a turn (and the way the camera faces): straight at
   * the cup if the ball can roll there, otherwise at the farthest point of
   * the route it can see — through a gate's gap, round a dogleg, along a lane
   * blocked by a windmill. Never backwards.
   */
  function smartAim(ch, ball, field) {
    const toCup = Math.atan2(ch.cup.y - ball.y, ch.cup.x - ball.x);
    const pad = ch.ballR * 0.6;
    if (lineClear(ch, ball.x, ball.y, ch.cup.x, ch.cup.y, pad)) return toCup;
    field = field || routeFor(ch);
    const route = field.path(ball.x, ball.y);
    for (let i = route.length - 1; i > 0; i--) {
      const p = route[i];
      if (Math.hypot(p.x - ball.x, p.y - ball.y) < 40) break;
      if (lineClear(ch, ball.x, ball.y, p.x, p.y, pad)) return Math.atan2(p.y - ball.y, p.x - ball.x);
    }
    // Hemmed in: at least start off along the route.
    const p = route[Math.min(route.length - 1, 4)];
    if (p && Math.hypot(p.x - ball.x, p.y - ball.y) > 1) return Math.atan2(p.y - ball.y, p.x - ball.x);
    return toCup;
  }

  MG.physics = {
    P, makeBall, cloneBall, surfaceAt, onBridge, inRegion,
    createWorld, step, launch, simulateShot, predict, sampleFrames, slopePush,
    routeField, routeFor, lineClear, smartAim
  };
})(typeof window !== 'undefined' ? window : globalThis);
