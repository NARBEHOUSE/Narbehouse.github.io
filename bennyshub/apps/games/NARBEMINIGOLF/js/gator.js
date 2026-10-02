/**
 * NARBE Mini Golf — the alligator: where it hides and how it moves.
 *
 * Pure geometry, no three.js, so tools/check-gator.cjs can test it in Node.
 *
 * The alligator is a chain of pieces — head, neck, chest, hips and three bits
 * of tail — hinged at joints along its spine. It only ever moves along one
 * path, like a train on a track: head first, every joint following the one in
 * front. plan() lays that track for a ball resting near a pond: from the
 * ball, back over the bank into the water, then on through the pond, bending
 * as the pond bends. frame() poses the animal at a moment of the watch or the
 * attack; apply() puts that pose on the meshes art.makeGator() built.
 *
 * Every plan is checked before it is used: at each moment of the attack, no
 * part of the animal may be buried in the carpet or the bank, cross the rail,
 * or come up under a bridge. It comes out of the water, every time. A pond
 * too small to hide one gets no alligator. Poses are smooth functions of
 * time — nothing is nudged after the fact — so nothing can jump either.
 */
(function (root) {
  'use strict';

  const MG = root.MG = root.MG || {};
  const C = MG.course, P = MG.physics;
  const S = C.S;

  // scene.js owns these; the defaults match it for Node, where scene.js can't load.
  const groundY = () => (MG.scene && MG.scene.GROUND_Y !== undefined ? MG.scene.GROUND_Y : -1.8);
  const WATER_DROP = 0.6;      // scene.js: the water surface sits this far below the carpet
  const HIDDEN = 0.6;          // this far under the surface, murky water hides a part that meets the bank

  /* ── The body, in model units (world units at scale 1) ────────────────────
   * The neck joint is the origin. The head points forward (+x) from it; the
   * pieces of the body hang back from it, each from one joint to the next.
   * art.makeGator builds the meshes to these sizes.
   */
  const JOINTS = [0, 0.7, 2.2, 3.7, 4.9, 6.0, 7.0];
  const HEAD = {
    len: 2.9,            // neck joint to the tip of the snout
    mouth: 1.75,         // ...to where a caught ball sits
    halfW: 0.5, snoutHalfW: 0.39,
    jawPivot: 0.1,       // the lower jaw hinges here, under the skull
    jawBottom: -0.26     // underside of the lower jaw
  };
  // Each piece hangs back from joint i to joint i + 1 and pokes `over` forward of its joint.
  const PIECES = [
    { name: 'neck', halfW: 0.58, top: 0.42, bottom: -0.36, over: 0.3 },
    { name: 'chest', halfW: 0.86, top: 0.62, bottom: -0.62, over: 0.35 },
    { name: 'hips', halfW: 0.86, top: 0.6, bottom: -0.62, over: 0.3 },
    { name: 'tail1', halfW: 0.34, top: 0.5, bottom: -0.4, over: 0.3 },
    { name: 'tail2', halfW: 0.26, top: 0.4, bottom: -0.32, over: 0.25 },
    { name: 'tail3', halfW: 0.18, top: 0.3, bottom: -0.22, over: 0.2 }
  ];
  // How far below each joint its lowest part (feet, belly, jaw) reaches, and how wide it is there.
  const BOTTOM_AT = [0.36, 0.62, 0.62, 0.62, 0.4, 0.32, 0.22];
  const HALFW_AT = [0.58, 0.86, 0.86, 0.86, 0.34, 0.26, 0.18];
  // Watching: eyes just out of the water, the body slanting away out of sight.
  const SUB_DROP = [0, 0.2, 0.55, 0.95, 1.3, 1.6, 1.85];
  // Surfaced: the ridge of its back just out of the water.
  const FLOAT = [0, -0.26, -0.42, -0.42, -0.34, -0.28, -0.22];

  /**
   * The attack, in seconds from when it starts. Each plan keeps its own copy
   * (plan.T): the lunge and the retreat take longer the further they go, so
   * the animal never has to fling itself.
   */
  const T = { rise: 0.7, open: 1.15, snap: 1.7, hold: 2.3, gone: 3.4 };
  function timing(pl) {
    const lunge = clamp((pl.uHome - pl.uSnap) / 300, 0.5, 1.0);
    const back = clamp((pl.uHome + RETREAT - pl.uSnap) / 210, 1.0, 1.8);
    const snap = T.open + lunge, hold = snap + 0.6;
    return { rise: T.rise, open: T.open, snap, hold, gone: hold + back };
  }
  const JAW_OPEN = 0.7;      // radians, wide open
  const HEAD_TILT = 0.45;    // the head tips back as the jaws open...
  const REAR_TILT = 0.85;    // ...and further while it is still in the water, rearing up to strike
  const RAMP = 70;           // px over which it climbs out onto the bank (or sinks back)
  const SNOUT_RAMP = 40;     // px before its snout reaches the bank that the head starts to rise
  const DIVE = 0.05;         // how steeply the body goes down where the pond is too narrow for it
  const SLOPE = 0.6;         // the steepest the chain may run between joints near the surface...
  const DEEP_SLOPE = 1.5;    // ...and well under it
  const CREEP = 24;          // px it drifts toward the ball while watching
  const RETREAT = 40;        // px it backs off as it drags the ball under
  const SCALES = [1.5, 1.3, 1.1, 0.95, 0.8];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  /* ── Ponds ────────────────────────────────────────────────────────────── */

  function boxDistance(b, x, y) {
    const l = C.toLocal(b, x, y);
    return Math.hypot(Math.max(Math.abs(l.x) - b.hw, 0), Math.max(Math.abs(l.y) - b.hh, 0));
  }

  /** Distance from (px, py) to the nearest edge of a closed polygon (no allocations: grids call this a lot). */
  function edgeDistance(px, py, pts) {
    let best = Infinity;
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i], b = pts[i + 1 === n ? 0 : i + 1];
      const cx = b.x - a.x, cy = b.y - a.y, len2 = cx * cx + cy * cy;
      let t = len2 ? ((px - a.x) * cx + (py - a.y) * cy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - (a.x + t * cx), dy = py - (a.y + t * cy), d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /** How far inside box b the point is (0 if outside). */
  function boxDepth(b, x, y) {
    const l = C.toLocal(b, x, y);
    return Math.max(0, Math.min(b.hw - Math.abs(l.x), b.hh - Math.abs(l.y)));
  }

  /**
   * Where an alligator can swim in pond i: inside the pond, on the course
   * side of the rail, and not under a bridge. Distance grids around the pond
   * make every question about it cheap. Built once per hole (prepare()).
   */
  function pondInfo(ch, i) {
    ch._gatorPonds = ch._gatorPonds || [];
    if (ch._gatorPonds[i]) return ch._gatorPonds[i];
    const reg = ch.waters[i], fw = ch.fairway.poly;
    let lo = 0;     // scene.js buildWater: the surface sits below the pond's lowest edge
    for (const p of reg.poly) lo = Math.min(lo, C.terrainHeight(ch, p.x, p.y) * S);
    const level = lo - WATER_DROP;
    const inside = (x, y) => P.inRegion(reg, x, y) && C.pointInPolygon(x, y, fw) && !P.onBridge(ch, x, y);
    // Signed distance to the rail: + on the carpet side, - beyond it.
    const fairSigned = (x, y) => (C.pointInPolygon(x, y, fw) ? 1 : -1) * edgeDistance(x, y, fw);
    // Signed room to swim: + inside (distance to the nearest bank, rail or bridge), - outside.
    const swimRoom = (x, y, dF) => {
      if (dF === undefined) dF = fairSigned(x, y);
      const inP = P.inRegion(reg, x, y), dP = edgeDistance(x, y, reg.poly);
      let dB = Infinity, under = 0;
      for (const b of ch.bridges) { dB = Math.min(dB, boxDistance(b, x, y)); under = Math.max(under, boxDepth(b, x, y)); }
      if (inP && dF > 0 && under === 0) return Math.min(dP, dF, dB);
      return -Math.max(inP ? 0 : dP, dF > 0 ? 0 : -dF, under, 0.01);
    };
    const CELL = 5, M = 140, bb = reg.bbox;
    const gx = bb.x0 - M, gy = bb.y0 - M;
    const nx = Math.ceil((bb.x1 - bb.x0 + 2 * M) / CELL) + 2, ny = Math.ceil((bb.y1 - bb.y0 + 2 * M) / CELL) + 2;
    const gSwim = new Float32Array(nx * ny), gFair = new Float32Array(nx * ny);
    let rows = 0;      // grid rows built so far (prepare() builds them a few at a time)
    const build = (deadline) => {
      for (; rows < ny; rows++) {
        if (deadline && Date.now() > deadline) return false;
        const j = rows, y = gy + j * CELL;
        for (let k = 0; k < nx; k++) {
          const x = gx + k * CELL, dF = fairSigned(x, y);
          gFair[j * nx + k] = dF;
          gSwim[j * nx + k] = swimRoom(x, y, dF);
        }
      }
      return true;
    };
    const sample = (g, x, y, exact) => {
      const fx = (x - gx) / CELL, fy = (y - gy) / CELL;
      if (rows < ny || fx < 0 || fy < 0 || fx >= nx - 1 || fy >= ny - 1) return exact(x, y);
      const i0 = Math.floor(fx), j0 = Math.floor(fy), u = fx - i0, v = fy - j0, k = j0 * nx + i0;
      return (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + nx] * (1 - u) + g[k + nx + 1] * u) * v;
    };
    const info = {
      index: i, reg, level, build,
      get ready() { return rows >= ny; },
      inside,                                                    // exact
      room: (x, y) => Math.max(0, sample(gSwim, x, y, swimRoom)),
      insideFast: (x, y) => sample(gSwim, x, y, swimRoom) > 0,
      fairFast: (x, y) => sample(gFair, x, y, fairSigned) > 0
    };
    ch._gatorPonds[i] = info;
    return info;
  }

  /**
   * Build the pond grids for a hole ahead of time. With budgetMs, does only
   * that much work and returns false until it's all done (call it each frame);
   * without, builds everything now.
   */
  function prepare(ch, budgetMs) {
    const deadline = budgetMs ? Date.now() + budgetMs : 0;
    for (let i = 0; i < ch.waters.length; i++) if (!pondInfo(ch, i).build(deadline)) return false;
    return true;
  }

  /* ── The track ────────────────────────────────────────────────────────── */

  /** A point on the track u px back from the ball (it runs straight on past either end). */
  function pathAt(pl, u, out) {
    out = out || {};
    const pts = pl.path, arc = pl.arc, n = pts.length;
    let k;
    if (u <= 0) k = 0;
    else if (u >= arc[n - 1]) k = n - 2;
    else { k = 0; while (k < n - 2 && arc[k + 1] < u) k++; }
    const a = pts[k], b = pts[k + 1], seg = arc[k + 1] - arc[k] || 1;
    const t = (u - arc[k]) / seg;
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    return out;
  }

  /** Which way the animal faces at u: along the track, toward the ball. */
  function headingAt(pl, u) {
    const a = pathAt(pl, u + 3), b = pathAt(pl, u - 3);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  /** Is this spot, on the way from the water to the ball, clear for the head to pass? */
  function landClear(ch, pond, x, y, s) {
    if (!C.pointInPolygon(x, y, ch.fairway.poly)) return false;
    const pad = HEAD.halfW * s / S;
    if (C.closestOnPolygon(x, y, ch.fairway.poly).d < 2) return false;     // (the checker keeps the head off the rail)
    for (const b of ch.solids) if (boxDistance(b, x, y) < pad) return false;
    for (const b of ch.bushes) if (Math.hypot(x - b.x, y - b.y) < b.radius + pad) return false;
    for (const b of ch.bumpers) if (Math.hypot(x - b.x, y - b.y) < b.radius + pad) return false;
    for (const w of ch.waters) if (w !== pond.reg && P.inRegion(w, x, y)) return false;
    if (P.onBridge(ch, x, y)) return false;
    return true;
  }

  /**
   * From where the track meets the water, carry on into the pond, always
   * toward the most open water, bending no tighter than the animal can.
   */
  function swimFrom(pond, ex, ey, dir, s, maxLen, straight) {
    const STEP = 4;
    const maxTurn = STEP * 0.7 * S / s;          // about 40 degrees per body unit
    const turns = [0, -1, 1, -2, 2, -3, 3].map(k => k * maxTurn / 3);
    const pts = [];
    let x = ex, y = ey, d = dir, len = 0, bend = 0;
    while (len < maxLen) {
      let best = null;
      for (const t of (len < straight ? [0] : turns)) {
        const nd = d + t, c = Math.cos(nd), sn = Math.sin(nd);
        let look = Infinity;
        for (const a of [STEP, STEP * 4, STEP * 9]) look = Math.min(look, pond.room(x + c * a, y + sn * a));
        const score = look - Math.abs(t) * 6;
        if (!best || score > best.score) best = { nd, t, score, look };
      }
      if (best.look < 1.5) break;
      d = best.nd; bend += Math.abs(best.t);
      x += Math.cos(d) * STEP; y += Math.sin(d) * STEP; len += STEP;
      pts.push({ x, y });
    }
    return { pts, len, bend };
  }

  /**
   * Lay a track for an alligator to take the ball at `ball`. A generator: it
   * yields between candidates so the game can spread the work over frames
   * (startPlan); plan() runs it straight through. Its result is the plan, or
   * null if no pond near the ball can hide one.
   * opts.reach: how near the water the ball must be (px, default 60 + ball radius).
   * opts.debug: an array to collect why candidates were turned down.
   */
  function* planSteps(ch, ball, opts) {
    opts = opts || {};
    const reach = opts.reach || 60 + ch.ballR;
    const ponds = [];
    ch.waters.forEach((reg, i) => {
      const c = C.closestOnPolygon(ball.x, ball.y, reg.poly);
      if (c.d <= reach + 1 && !P.inRegion(reg, ball.x, ball.y)) ponds.push({ i, c });
    });
    ponds.sort((a, b) => a.c.d - b.c.d);
    if (!ponds.length) return null;
    for (const pd of ponds) {
      const pond = pondInfo(ch, pd.i);
      while (!pond.build(Date.now() + 3)) yield;
    }
    const TURNS = [0, 9, -9, 18, -18, 27, -27, 36, -36, 45, -45, 54, -54, 63, -63, 72, -72].map(d => d * Math.PI / 180);
    for (const s of SCALES) {
      const cands = [];
      for (const pd of ponds) {
        const pond = pondInfo(ch, pd.i);
        const natural = Math.atan2(ball.y - pd.c.y, ball.x - pd.c.x);
        for (const turn of TURNS) {
          const c = yield* layTrack(ch, pond, ball, natural + turn, s, opts.debug);
          yield;
          if (!c) continue;
          c.score = Math.abs(turn) * 90 + (c.uHome - c.uSnap) * 0.6 + c.bend * 25;
          cands.push(c);
        }
      }
      cands.sort((a, b) => a.score - b.score);
      for (const c of cands) {
        // Checked a little wider than the meshes and with nothing allowed to touch, so the real thing has room to spare.
        const v = yield* checkAttack(ch, c, { step: 0.02, quick: true, grow: 1.05, tol: -0.04, fast: true, hidden: HIDDEN + 0.12 });
        yield;
        if (v.ok) return c;
        if (opts.debug) opts.debug.push({ s, why: 'attack', dir: c.dir, at: v.at, plan: c });
      }
    }
    return null;
  }

  function plan(ch, ball, opts) {
    const it = planSteps(ch, ball, opts);
    for (;;) { const r = it.next(); if (r.done) return r.value; }
  }

  /**
   * Plan a little at a time: step(ms) works for about that long and returns
   * undefined while still thinking, then the plan (or null) once done.
   */
  function startPlan(ch, ball, opts) {
    const it = planSteps(ch, ball, opts);
    let done = false, result;
    return {
      get done() { return done; },
      step(ms) {
        if (done) return result;
        const until = Date.now() + (ms || 3);
        do {
          const r = it.next();
          if (r.done) { done = true; result = r.value; return result; }
        } while (Date.now() < until);
        return undefined;
      }
    };
  }

  /** One candidate track along `dir` (the way it lunges, toward the ball), or null. A generator, like planSteps. */
  function* layTrack(ch, pond, ball, dir, s, debug) {
    const fail = (why) => { if (debug) debug.push({ s, dir, why }); return null; };
    const cx = Math.cos(dir), cy = Math.sin(dir);
    // Back from the ball to the water's edge, over clear carpet.
    let uEdge = -1;
    for (let u = 0; u <= 150; u += 3) {
      const x = ball.x - cx * u, y = ball.y - cy * u;
      if (pond.inside(x, y)) { uEdge = u; break; }
      if (!landClear(ch, pond, x, y, s)) return fail('land blocked at ' + u);
    }
    if (uEdge < 0) return fail('no water within 150');
    const ex = ball.x - cx * uEdge, ey = ball.y - cy * uEdge;
    const bodyLen = JOINTS[JOINTS.length - 1] * s / S;
    const want = HEAD.len * s / S + 12 + CREEP + bodyLen + RETREAT + 30;
    // Straight for the first stretch, so the head (rigid) points at the ball when the jaws close.
    const straight = Math.max(0, HEAD.mouth * s / S - uEdge) + 12;
    const sw = swimFrom(pond, ex, ey, dir + Math.PI, s, want, straight);
    if (sw.len < HEAD.len * s / S + 12) return fail('pond too shallow ' + sw.len);
    const path = [{ x: ball.x, y: ball.y }, { x: ex, y: ey }].concat(sw.pts);
    const arc = [0];
    for (let k = 1; k < path.length; k++) arc.push(arc[k - 1] + Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y));
    const pl = {
      s, path, arc, pond, dir, bend: sw.bend,
      uEdge, uEnd: arc[arc.length - 1],
      uSnap: HEAD.mouth * s / S,          // its neck when the jaws close on the ball
      uHome: 0, uDive: 0,
      ball: { x: ball.x, y: ball.y }
    };
    // Where the pond gets too narrow for the body (or the track runs out), it dives.
    pl.uDive = pl.uEnd - 26;
    const bodyHalf = HALFW_AT[2] * s / S + 3;
    for (let u = uEdge + HEAD.len * s / S; u < pl.uEnd - 26; u += 4) {
      const q = pathAt(pl, u);
      if (pond.room(q.x, q.y) < bodyHalf) { pl.uDive = Math.max(uEdge + 10, u - 8); break; }
    }
    // Home: the nearest spot where all of it is in the water, out of sight but for its eyes,
    // with room to rear up there before it lunges. Found in strides of 12 px, then walked
    // back 4 px at a time.
    const o = { grow: 1.05, tol: -0.04, fast: true, hidden: HIDDEN + 0.12 };
    const hides = (u) => {
      pl.uHome = u;
      if (!poseOK(ch, pl, frame(ch, pl, 'watch', 0), o) || !poseOK(ch, pl, frame(ch, pl, 'watch', 99), o)) return false;
      for (const t of [T.rise * 0.5, T.rise, (T.rise + T.open) / 2, T.open]) if (!poseOK(ch, pl, frame(ch, pl, 'strike', t), o)) return false;
      return true;
    };
    const first = Math.max(uEdge + HALFW_AT[1] * s / S + 30, pl.uSnap + 20);
    let found = -1, n = 0;
    for (let u = first; u < pl.uEnd; u += 12) {
      if (hides(u)) { found = u; break; }
      if (++n % 4 === 0) yield;
    }
    if (found < 0) return fail('no hiding place, track ' + Math.round(sw.len));
    for (let u = found - 4; u >= first && u > found - 12; u -= 4) { if (hides(u)) found = u; else break; }
    pl.uHome = found;
    pl.T = timing(pl);
    return pl;
  }

  /* ── Posing ───────────────────────────────────────────────────────────── */

  /**
   * The alligator at a moment: phase 'watch' (t = seconds since it surfaced)
   * or 'strike' (t = seconds into the attack). Returns the joints (course px,
   * world height), the head, the jaw and each piece's placement.
   */
  function frame(ch, pl, phase, t) {
    const s = pl.s, pond = pl.pond, T = pl.T || timing(pl);
    let u0 = pl.uHome, wUp = 0, wDeep = 0, open = 0, rear = 0, shake = 0, bob = 0;
    if (phase === 'watch') {
      u0 = pl.uHome + CREEP * (1 - Math.min(1, t / 10));
      bob = Math.sin(t * 1.8) * 0.03;
    } else if (t < T.rise) {
      wUp = easeOut(t / T.rise);
    } else if (t < T.open) {
      wUp = 1; bob = Math.sin((t - T.rise) * 9) * 0.03;
    } else if (t < T.snap) {
      wUp = 1;
      u0 = lerp(pl.uHome, pl.uSnap, smooth((t - T.open) / (T.snap - T.open)));
    } else if (t < T.hold) {
      wUp = 1; u0 = pl.uSnap;
      const k = (t - T.snap) / (T.hold - T.snap);
      shake = Math.sin((t - T.snap) * 28) * 0.18 * (1 - k);
    } else {
      const k = easeInOut((t - T.hold) / (T.gone - T.hold));
      u0 = lerp(pl.uSnap, pl.uHome + RETREAT, k);
      wUp = 1 - k; wDeep = k;
      rear = 0.25 * Math.sin(Math.min(1, k * 1.6) * Math.PI);   // rears back as it goes
    }
    if (phase === 'strike') {
      // Jaws: wide before the lunge, slammed shut on the ball right at the snap.
      if (t >= T.rise * 0.7 && t < T.snap - 0.07) open = smooth((t - T.rise * 0.7) / 0.35);
      else if (t >= T.snap - 0.07) open = Math.max(0, (T.snap - t) / 0.07);
    }

    const joints = [];
    const snoutLen = HEAD.len * s / S;
    // It only starts to climb once it's lunging (eased in, so nothing jumps)...
    const climb = phase !== 'strike' || t < T.open ? 0 : t < T.hold ? smooth((t - T.open) / 0.22) : 1;
    // ...but first it rears its head up out of the water, jaws open, and holds it high as it comes.
    const rearUp = phase === 'strike' && t < T.snap ? smooth((t - T.rise) / (T.open - T.rise)) : 0;
    let neckOnLand = 0;
    for (let i = 0; i < JOINTS.length; i++) {
      const u = u0 + JOINTS[i] * s / S;
      const p = pathAt(pl, u);
      // How far this part is out over open water (along the track).
      const outIn = u - pl.uEdge - HALFW_AT[i] * s / S;
      const down = pond.level + 0.3 - 0.77 * s - SUB_DROP[i] * s;
      const up = i === 0 ? pond.level + 0.15 : pond.level + FLOAT[i] * s;
      let h = lerp(down, up, wUp);
      // Dragging the ball under: each part sinks once it is back over open water (the head, once its snout is).
      if (wDeep > 0) h = lerp(h, down - 1.0, wDeep * smooth((outIn - (i === 0 ? snoutLen : 0)) / 50));
      // Out on the carpet it walks on the carpet; it climbs the bank over the last stretch of water.
      if (climb > 0 || (i === 0 && rearUp > 0)) {
        let w = climb * smooth((RAMP - outIn) / RAMP);
        if (i > 0) {
          // Where its sides would hang over the bank, it rides up onto it (not in the dive at the back).
          const room = pond.room(p.x, p.y), side = HALFW_AT[i] * s / S;
          w = Math.max(w, climb * smooth((side + 6 - room) / 30) * smooth((pl.uDive - u) / 30));
        }
        let top = C.surfaceHeight(ch, p.x, p.y) * S, under = BOTTOM_AT[i];
        if (i === 0) {
          neckOnLand = w;
          // The head goes by its snout too: up as the snout nears the bank, down once it's back over the water.
          const snoutOut = u - snoutLen - pl.uEdge;
          w = Math.max(w, climb * smooth((SNOUT_RAMP - snoutOut) / SNOUT_RAMP), rearUp);
          const q = pathAt(pl, Math.max(0, u - snoutLen));
          top = Math.max(top, C.surfaceHeight(ch, q.x, q.y) * S);
          under = lerp(BOTTOM_AT[0], 0.95, open);       // its jaw hangs lower when open
        }
        h = lerp(h, top + under * s + 0.02, w);
      }
      // Where the pond gets too narrow for it, the body goes down into the deep (never the head or neck).
      if (i >= 2 && u > pl.uDive) h -= (u - pl.uDive) * DIVE;
      joints.push({ x: p.x, y: p.y, h: h + bob, u });
    }
    keepTogether(joints, pond);
    // Jaws open, it rears its head back while still in the water, and levels it as it comes up the bank.
    const tilt = open * lerp(REAR_TILT, HEAD_TILT, neckOnLand) + rear;
    const pose = {
      s, joints, jaw: JAW_OPEN * open, open,
      head: { x: 0, y: 0, h: 0, yaw: headingAt(pl, u0) + shake, pitch: tilt },
      pieces: []
    };
    placePieces(pose);
    return pose;
  }

  /**
   * A chain can only bend so far up or down between joints: where one joint
   * sits much higher than the next, the lower one is drawn up toward it — so
   * the body follows the head up the bank instead of coming apart from it.
   */
  function keepTogether(j, pond) {
    // Steeper is allowed the deeper both joints are, easing from one limit to the other (no sudden switch).
    const deep = pond.level - 0.3;
    const pull = (a, b) => {
      const d = Math.max(Math.hypot(a.x - b.x, a.y - b.y) * S, 0.05);
      const k = lerp(SLOPE, DEEP_SLOPE, smooth((deep - Math.max(a.h, b.h)) / 0.6));
      if (b.h < a.h - k * d) b.h = a.h - k * d;
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < j.length - 1; i++) pull(j[i], j[i + 1]);
      for (let i = j.length - 1; i > 0; i--) pull(j[i], j[i - 1]);
    }
  }

  /** Each piece runs from its joint to the next, stretched a little if the slope makes that further. */
  function placePieces(pose) {
    const j = pose.joints;
    pose.head.x = j[0].x; pose.head.y = j[0].y; pose.head.h = j[0].h;
    pose.pieces.length = 0;
    for (let i = 0; i < PIECES.length; i++) {
      const a = j[i], b = j[i + 1];
      const dH = Math.max(Math.hypot(a.x - b.x, a.y - b.y) * S, 1e-4), dv = a.h - b.h;
      const len = (JOINTS[i + 1] - JOINTS[i]) * pose.s;
      pose.pieces.push({
        x: a.x, y: a.y, h: a.h, yaw: Math.atan2(a.y - b.y, a.x - b.x), pitch: Math.atan2(dv, dH),
        stretch: Math.max(1, Math.hypot(dH, dv) / len)
      });
    }
  }

  /* ── Sample points: the checker's picture of the meshes ───────────────── */

  // art.makeGator hands over points taken from its meshes (head, jaw and each
  // piece, in their own spaces), so the checks see exactly what is drawn.
  // Until it does (Node tools without three.js), a box model stands in.
  let SHAPE = null;
  function setShape(shape) { SHAPE = shape; }

  // A point given in the local space of something at (fx, fy, fh) facing yaw, tipped up by pitch.
  function place(out, fx, fy, fh, yaw, pitch, s, lx, ly, lz, back) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const x1 = (lx * cp - ly * sp) * s, y1 = (lx * sp + ly * cp) * s, z1 = lz * s;
    out.push({ x: fx + (x1 * cyw - z1 * syw) / S, y: fy + (x1 * syw + z1 * cyw) / S, h: fh + y1, back: !!back });
  }

  function headSamples(pose, out, grow) {
    out = out || []; grow = grow || 1;
    const f = pose.head, s = pose.s;
    const a = -pose.jaw, ca = Math.cos(a), sa = Math.sin(a);
    if (SHAPE) {
      for (const v of SHAPE.head) place(out, f.x, f.y, f.h, f.yaw, f.pitch, s, v[0], v[1], v[2] * grow);
      for (const v of SHAPE.jaw) place(out, f.x, f.y, f.h, f.yaw, f.pitch, s, HEAD.jawPivot + v[0] * ca - v[1] * sa, v[0] * sa + v[1] * ca, v[2] * grow);
      return out;
    }
    for (const [lx, w, top] of [[-0.15, HEAD.halfW, 0.77], [0.55, HEAD.halfW, 0.77], [1.25, HEAD.halfW, 0.47], [2.0, HEAD.snoutHalfW, 0.32], [2.9, 0.3, 0.34]]) {
      for (const lz of [-w * grow, 0, w * grow]) {
        place(out, f.x, f.y, f.h, f.yaw, f.pitch, s, lx, -0.14, lz);
        place(out, f.x, f.y, f.h, f.yaw, f.pitch, s, lx, top, lz);
      }
    }
    // The lower jaw swings down from its hinge.
    for (const jx of [0.05, 1.3, 2.65]) for (const jy of [HEAD.jawBottom, 0.05]) for (const lz of [-0.4 * grow, 0.4 * grow]) {
      place(out, f.x, f.y, f.h, f.yaw, f.pitch, s, HEAD.jawPivot + jx * ca - jy * sa, jx * sa + jy * ca, lz);
    }
    return out;
  }

  function pieceSamples(pose, i, out, grow) {
    out = out || []; grow = grow || 1;
    const f = pose.pieces[i], s = pose.s, spec = PIECES[i];
    const len = JOINTS[i + 1] - JOINTS[i];
    const k = f.stretch || 1;
    if (SHAPE) {
      for (const v of SHAPE.pieces[i]) place(out, f.x, f.y, f.h, f.yaw, f.pitch, s, v[0] * k, v[1], v[2] * grow, v[0] < -len * 0.3);
      return out;
    }
    for (const lx of [spec.over, 0, -len / 2, -len]) {
      const back = lx < -len * 0.3;
      for (const lz of [-spec.halfW * grow, 0, spec.halfW * grow]) {
        place(out, f.x, f.y, f.h, f.yaw, f.pitch, s, lx * k, spec.bottom, lz, back);
        place(out, f.x, f.y, f.h, f.yaw, f.pitch, s, lx * k, spec.top, lz, back);
      }
    }
    return out;
  }

  function samples(pose, grow) {
    const out = headSamples(pose, [], grow);
    for (let i = 0; i < PIECES.length; i++) pieceSamples(pose, i, out, grow);
    return out;
  }

  /**
   * How badly a point is out of place: 0 if it's fine — in the pond (any
   * depth), on or above the carpet, or well under the water out of sight.
   */
  function misplaced(ch, pond, q, tol, fast, hidden) {
    if (fast ? pond.insideFast(q.x, q.y) : pond.inside(q.x, q.y)) return 0;
    if (!(fast ? pond.fairFast(q.x, q.y) : C.pointInPolygon(q.x, q.y, ch.fairway.poly))) {
      const g = groundY() - tol;
      return q.h < g ? 0 : q.h - g + 0.001;      // over the rail or the lawn
    }
    const top = C.surfaceHeight(ch, q.x, q.y) * S - tol;
    if (q.h >= top) return 0;                     // on the carpet (or a bridge)
    if (q.h < pond.level - (hidden || HIDDEN)) return 0;   // well under the water: into the bank out of sight
    return top - q.h;                            // buried in the carpet or the bank
  }

  function poseOK(ch, pl, pose, o) {
    o = o || {};
    const tol = o.tol === undefined ? 0.06 : o.tol;
    for (const q of samples(pose, o.grow)) if (misplaced(ch, pl.pond, q, tol, o.fast, o.hidden) > 0) return false;
    return true;
  }

  /**
   * Check the whole watch and attack, moment by moment.
   * opts: step (s, default 0.05), quick (stop at the first fault), grow
   * (sample the body this much wider), tol (how far a part may sink into the
   * carpet, default 0.06), fast (use the pond grids).
   * Returns { ok, worst, at }.
   */
  function validate(ch, pl, opts) {
    const it = checkAttack(ch, pl, opts);
    for (;;) { const r = it.next(); if (r.done) return r.value; }
  }

  function* checkAttack(ch, pl, opts) {
    opts = opts || {};
    const step = opts.step || 0.05, tol = opts.tol === undefined ? 0.06 : opts.tol;
    const T = pl.T || timing(pl);
    let worst = 0, at = null, n = 0;
    const check = (phase, t) => {
      const pose = frame(ch, pl, phase, t);
      for (const q of samples(pose, opts.grow)) {
        const m = misplaced(ch, pl.pond, q, tol, opts.fast, opts.hidden);
        if (m > worst) { worst = m; at = { phase, t: +t.toFixed(3), x: Math.round(q.x), y: Math.round(q.y), h: +q.h.toFixed(3) }; if (opts.quick) return true; }
      }
      return false;
    };
    for (const t of [0, 3, 6, 10, 99]) if (check('watch', t)) return { ok: false, worst, at };
    for (let t = 0; t <= T.gone + 1e-6; t += step) {
      if (check('strike', t)) return { ok: false, worst, at };
      if (++n % 12 === 0) yield;
    }
    for (const t of [T.snap - 0.05, T.snap, T.snap + 0.02]) if (check('strike', t)) return { ok: false, worst, at };
    return { ok: worst === 0, worst, at };
  }

  /* ── Onto the meshes ──────────────────────────────────────────────────── */

  /** Pose art.makeGator()'s model. Its root stays put; each piece is placed in the world. */
  function apply(model, pose) {
    const ud = model.userData, s = pose.s;
    const f = pose.head;
    ud.head.position.set(f.x * S, f.h, f.y * S);
    ud.head.rotation.set(0, -f.yaw, f.pitch);
    ud.head.scale.setScalar(s);
    ud.jaw.rotation.z = -pose.jaw;
    for (let i = 0; i < ud.pieces.length; i++) {
      const p = ud.pieces[i], q = pose.pieces[i];
      p.position.set(q.x * S, q.h, q.y * S);
      p.rotation.set(0, -q.yaw, q.pitch);
      p.scale.set(s * (q.stretch || 1), s, s);
    }
  }

  /** Where a caught ball sits, in head space (art.makeGator's head group). */
  const MOUTH = { x: HEAD.mouth, y: 0.02, z: 0 };

  MG.gator = {
    JOINTS, HEAD, PIECES, MOUTH, T, SCALES,
    prepare, plan, startPlan, frame, apply, validate, samples, misplaced, pondInfo, pathAt,
    setShape, get hasShape() { return !!SHAPE; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
