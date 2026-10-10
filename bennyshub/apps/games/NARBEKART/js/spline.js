/**
 * NARBE Racer — closed-loop track centreline maths.
 *
 * A circuit is authored as a short list of control points and turned into a
 * dense, evenly spaced list of centreline nodes. Every other piece of the game
 * (road mesh, walls, scenery, karts, items) works in *track space*: a distance
 * `s` along the lap plus a sideways offset `x`, exactly like Benny's Race
 * Tracks — except that `s` wraps, because this road is a loop.
 *
 * This file has no THREE dependency on purpose, so the very same code runs in
 * the browser and under node (tools/validate_tracks.js), which is what lets a
 * track layout be checked for tight corners and self-overlap without opening
 * the game.
 *
 * Conventions (identical to Race Tracks, so knowledge transfers):
 *   forward = (sin h, 0, -cos h)      right = (cos h, 0, sin h)
 *   A mesh modelled facing -Z points down the track with rotation.y = -h.
 *   Curvature k = dh/ds.  k > 0 is a RIGHT-hand bend; its inside is x > 0.
 *   Bank > 0 lowers the right-hand side (banked into a right-hand bend).
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;

  /** Wrap an angle into (-PI, PI]. */
  function wrapAngle(a) {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  }

  /** Positive modulo, so a negative distance still lands inside the lap. */
  function mod(a, n) {
    const r = a % n;
    return r < 0 ? r + n : r;
  }

  /* ── Centripetal Catmull-Rom (Barry–Goldman) ─────────────────────────────
   * Centripetal parameterisation never cusps or self-loops between control
   * points, which uniform Catmull-Rom does when points are unevenly spaced —
   * exactly what a hand-authored circuit looks like.
   */
  function knot(ti, a, b, alpha) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return ti + Math.max(1e-4, Math.pow(d, alpha));
  }

  function crPoint(p0, p1, p2, p3, u, alpha) {
    const t0 = 0;
    const t1 = knot(t0, p0, p1, alpha);
    const t2 = knot(t1, p1, p2, alpha);
    const t3 = knot(t2, p2, p3, alpha);
    const t = t1 + (t2 - t1) * u;

    const L = (pa, pb, ta, tb) => {
      const wa = (tb - t) / (tb - ta), wb = (t - ta) / (tb - ta);
      return { x: pa.x * wa + pb.x * wb, y: pa.y * wa + pb.y * wb, z: pa.z * wa + pb.z * wb };
    };
    const A1 = L(p0, p1, t0, t1);
    const A2 = L(p1, p2, t1, t2);
    const A3 = L(p2, p3, t2, t3);
    const B1 = L(A1, A2, t0, t2);
    const B2 = L(A2, A3, t1, t3);
    return L(B1, B2, t1, t2);
  }

  /** Closed moving average over a cyclic array of numbers. */
  function smoothCyclic(arr, radius, passes) {
    const n = arr.length;
    let src = arr.slice();
    for (let p = 0; p < (passes || 1); p++) {
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        let acc = 0, cnt = 0;
        for (let j = -radius; j <= radius; j++) { acc += src[mod(i + j, n)]; cnt++; }
        out[i] = acc / cnt;
      }
      src = out;
    }
    return src;
  }

  /**
   * Build a closed circuit.
   *
   * @param {Array<Array<number>>} points  control points [x, z, y?] in metres,
   *        in driving order. The first point is the start/finish line and
   *        should sit on a straight.
   * @param {object} [opts]
   *   seg       target node spacing in metres (default 4)
   *   subdiv    dense samples per control span (default 48)
   *   alpha     Catmull-Rom alpha (0.5 = centripetal)
   *   mirror    mirror the layout left-to-right (Mirror mode)
   *   scale     uniform scale applied to x/z (not y)
   *   bankGain  bank (rad) per unit curvature (default 10)
   *   bankMax   clamp on |bank| in radians (default 0.22)
   *   banks     berm zones [[from, to, max, gain?], ...] in lap fractions: the
   *             bends inside bank up to `max` radians (gain default 45),
   *             easing in and out over BERM_EASE metres either side
   *   ySmooth   moving-average radius, in nodes, for elevation (default 4)
   * @returns {{nodes:Array, L:number, seg:number, N:number, turns:number}}
   */
  function buildLoop(points, opts) {
    opts = opts || {};
    const segTarget = opts.seg || 4;
    const sub = opts.subdiv || 48;
    const alpha = opts.alpha === undefined ? 0.5 : opts.alpha;
    const mirror = !!opts.mirror;
    const scale = opts.scale || 1;
    const bankGain = opts.bankGain === undefined ? 10 : opts.bankGain;
    const bankMax = opts.bankMax === undefined ? 0.22 : opts.bankMax;
    const ySmooth = opts.ySmooth === undefined ? 4 : opts.ySmooth;

    if (!points || points.length < 4) throw new Error('A circuit needs at least 4 control points');

    const P = points.map((p) => ({
      x: (mirror ? -p[0] : p[0]) * scale,
      z: p[1] * scale,
      y: p[2] || 0
    }));
    const n = P.length;

    /* Dense closed polyline through every control point. */
    const dense = [];
    for (let i = 0; i < n; i++) {
      const p0 = P[mod(i - 1, n)], p1 = P[i], p2 = P[mod(i + 1, n)], p3 = P[mod(i + 2, n)];
      for (let k = 0; k < sub; k++) dense.push(crPoint(p0, p1, p2, p3, k / sub, alpha));
    }
    const m = dense.length;

    /* Cumulative arc length, including the closing span back to the start. */
    const cum = new Float64Array(m + 1);
    for (let i = 0; i < m; i++) {
      const a = dense[i], b = dense[(i + 1) % m];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      cum[i + 1] = cum[i] + Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    const total = cum[m];

    /* Resample at an exact, even spacing so N * seg === L. */
    const N = Math.max(8, Math.round(total / segTarget));
    const seg = total / N;
    const xs = new Array(N), ys = new Array(N), zs = new Array(N);
    let j = 0;
    for (let q = 0; q < N; q++) {
      const s = q * seg;
      while (j < m - 1 && cum[j + 1] < s) j++;
      const span = cum[j + 1] - cum[j];
      const t = span > 1e-9 ? (s - cum[j]) / span : 0;
      const a = dense[j], b = dense[(j + 1) % m];
      xs[q] = a.x + (b.x - a.x) * t;
      ys[q] = a.y + (b.y - a.y) * t;
      zs[q] = a.z + (b.z - a.z) * t;
    }

    const ySm = ySmooth > 0 ? smoothCyclic(ys, ySmooth, 2) : ys;

    /* Headings from central differences, unwrapped so they interpolate. */
    const hRaw = new Array(N);
    for (let q = 0; q < N; q++) {
      const a = mod(q - 1, N), b = mod(q + 1, N);
      hRaw[q] = Math.atan2(xs[b] - xs[a], -(zs[b] - zs[a]));
    }
    const h = new Array(N);
    h[0] = hRaw[0];
    let totalTurn = 0;
    for (let q = 1; q < N; q++) {
      const d = wrapAngle(hRaw[q] - hRaw[q - 1]);
      h[q] = h[q - 1] + d;
      totalTurn += d;
    }
    totalTurn += wrapAngle(hRaw[0] - hRaw[N - 1]);
    const turns = Math.round(totalTurn / TAU);

    /* Curvature, lightly smoothed so banking and camera roll never snap. */
    const kRaw = new Array(N);
    for (let q = 0; q < N; q++) {
      kRaw[q] = wrapAngle(hRaw[mod(q + 1, N)] - hRaw[mod(q - 1, N)]) / (2 * seg);
    }
    const k = smoothCyclic(kRaw, 2, 1);
    const kBank = smoothCyclic(kRaw, 4, 2);
    const berm = bermWeights(opts.banks, N, seg);

    const nodes = new Array(N);
    for (let q = 0; q < N; q++) {
      const zw = berm.w[q];
      const gain = bankGain + (berm.gain[q] - bankGain) * zw;
      const max = bankMax + (berm.max[q] - bankMax) * zw;
      const bank = Math.max(-max, Math.min(max, kBank[q] * gain));
      nodes[q] = { i: q, x: xs[q], y: ySm[q], z: zs[q], h: h[q], s: q * seg, k: k[q], bank: bank };
    }

    return { nodes: nodes, L: N * seg, seg: seg, N: N, turns: turns, mirror: mirror };
  }

  /** Metres over which a berm zone eases its banking in and out. */
  const BERM_EASE = 40;

  /**
   * Per-node berm weight (0 outside every zone, 1 inside, a smoothstep ease
   * within BERM_EASE metres of a zone) with that zone's bank limit and gain.
   * Zones are lap fractions and may wrap past the start line.
   */
  function bermWeights(zones, N, seg) {
    const w = new Float64Array(N), max = new Float64Array(N), gain = new Float64Array(N).fill(45);
    if (!zones || !zones.length) return { w, max, gain };
    const L = N * seg;
    for (let q = 0; q < N; q++) {
      const s = q * seg;
      for (let z = 0; z < zones.length; z++) {
        const Z = zones[z], a = Z[0] * L, b = Z[1] * L;
        const span = mod(b - a, L);
        const into = mod(s - a, L);
        let dist = 0;
        if (into > span) dist = Math.min(into - span, L - into);     // metres outside the zone
        const u = Math.max(0, 1 - dist / BERM_EASE), wt = u * u * (3 - 2 * u);
        if (wt > w[q]) { w[q] = wt; max[q] = Z[2]; gain[q] = Z[3] || 45; }
      }
    }
    return { w, max, gain };
  }

  /**
   * Interpolated centreline sample at distance `s` (wraps). Plain numbers only.
   * @returns {{x,y,z,h,bank,k}}
   */
  function sample(loop, s, out) {
    const o = out || {};
    const nodes = loop.nodes, N = loop.N;
    const f = mod(s, loop.L) / loop.seg;
    const i = Math.min(N - 1, Math.floor(f));
    const t = f - i;
    const a = nodes[i], b = nodes[(i + 1) % N];
    o.x = a.x + (b.x - a.x) * t;
    o.y = a.y + (b.y - a.y) * t;
    o.z = a.z + (b.z - a.z) * t;
    o.h = a.h + wrapAngle(b.h - a.h) * t;
    o.bank = a.bank + (b.bank - a.bank) * t;
    o.k = a.k + (b.k - a.k) * t;
    return o;
  }

  /** World xz of track-space (s, x), ignoring banking height. */
  function toWorld(loop, s, x, out) {
    const o = sample(loop, s, out);
    const c = Math.cos(o.h), sn = Math.sin(o.h);
    o.wx = o.x + c * x;
    o.wz = o.z + sn * x;
    // Banking pivots about the centreline: the right-hand side drops by x*sin(bank).
    o.wy = o.y - x * Math.sin(o.bank);
    return o;
  }

  function bounds(loop) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const nd of loop.nodes) {
      if (nd.x < minX) minX = nd.x; if (nd.x > maxX) maxX = nd.x;
      if (nd.z < minZ) minZ = nd.z; if (nd.z > maxZ) maxZ = nd.z;
      if (nd.y < minY) minY = nd.y; if (nd.y > maxY) maxY = nd.y;
    }
    return { minX, maxX, minZ, maxZ, minY, maxY };
  }

  /* ── Spatial index for "where is the road near this point?" ──────────────
   * Ground height, prop placement and the minimap all need to know how far a
   * world point is from the nearest stretch of road. A bucket grid of node
   * indices keeps that O(1)-ish instead of scanning every node.
   */
  function makeIndex(loop, cell) {
    const size = cell || 32;
    const map = new Map();
    const key = (cx, cz) => cx + ',' + cz;
    for (const nd of loop.nodes) {
      const cx = Math.floor(nd.x / size), cz = Math.floor(nd.z / size);
      const k = key(cx, cz);
      let b = map.get(k);
      if (!b) { b = []; map.set(k, b); }
      b.push(nd.i);
    }
    return { loop: loop, size: size, map: map, key: key };
  }

  /**
   * Nearest centreline node to world (x, z) within `maxDist`, with the point's
   * signed sideways offset from that node (+ = right of the driving line) and a
   * refined distance-along value. Returns null when nothing is that close.
   */
  function nearest(index, x, z, maxDist) {
    const size = index.size, loop = index.loop;
    const r = Math.ceil(maxDist / size);
    const cx = Math.floor(x / size), cz = Math.floor(z / size);
    let best = -1, bestD2 = maxDist * maxDist;
    for (let ix = cx - r; ix <= cx + r; ix++) {
      for (let iz = cz - r; iz <= cz + r; iz++) {
        const b = index.map.get(index.key(ix, iz));
        if (!b) continue;
        for (let q = 0; q < b.length; q++) {
          const nd = loop.nodes[b[q]];
          const dx = x - nd.x, dz = z - nd.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) { bestD2 = d2; best = b[q]; }
        }
      }
    }
    if (best < 0) return null;
    const nd = loop.nodes[best];
    const c = Math.cos(nd.h), sn = Math.sin(nd.h);
    const dx = x - nd.x, dz = z - nd.z;
    const off = dx * c + dz * sn;           // along the right vector
    const along = dx * sn - dz * c;         // along the forward vector
    return {
      i: best,
      d: Math.sqrt(bestD2),
      off: off,
      s: mod(nd.s + Math.max(-loop.seg, Math.min(loop.seg, along)), loop.L),
      y: nd.y - off * Math.sin(nd.bank)
    };
  }

  /**
   * Layout sanity checks used by tools/validate_tracks.js.
   *
   * @param {object} loop    from buildLoop
   * @param {object} [opts]
   *   clearance   minimum centre-to-centre distance between two stretches of
   *               road that are not neighbours (default 34 m: two roads plus
   *               their walls and a verge between them)
   *   bridgeDy    height difference that counts as a legitimate over/under
   *               crossing rather than an overlap (default 9 m)
   *   minRadius   tightest allowed bend radius (default 42 m)
   *   startWindow metres either side of s=0 that must be nearly straight so
   *               the starting grid sits on a straight (default [-110, 40])
   */
  function validate(loop, opts) {
    opts = opts || {};
    const clearance = opts.clearance || 34;
    const bridgeDy = opts.bridgeDy || 9;
    const minR = opts.minRadius || 42;
    const win = opts.startWindow || [-110, 40];
    const nodes = loop.nodes, N = loop.N, seg = loop.seg;
    const issues = [];

    let minRadius = Infinity, minRadiusAt = 0;
    for (const nd of nodes) {
      const r = Math.abs(nd.k) > 1e-6 ? 1 / Math.abs(nd.k) : Infinity;
      if (r < minRadius) { minRadius = r; minRadiusAt = nd.s; }
    }
    if (minRadius < minR) {
      issues.push('Bend too tight: radius ' + minRadius.toFixed(1) + ' m at s=' + minRadiusAt.toFixed(0) +
                  ' (min ' + minR + ' m)');
    }

    // Two stretches closer than the gap needed for their roads and walls.
    const skip = Math.ceil((clearance * 2.2) / seg);
    let worst = Infinity, worstA = -1, worstB = -1;
    for (let a = 0; a < N; a++) {
      for (let b = a + skip; b < N; b++) {
        if (N - (b - a) < skip) continue;           // neighbours across the seam
        const na = nodes[a], nb = nodes[b];
        const dx = na.x - nb.x, dz = na.z - nb.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < clearance && Math.abs(na.y - nb.y) < bridgeDy && d < worst) {
          worst = d; worstA = a; worstB = b;
        }
      }
    }
    if (worstA >= 0) {
      issues.push('Road overlaps itself: ' + worst.toFixed(1) + ' m apart at s=' +
                  nodes[worstA].s.toFixed(0) + ' and s=' + nodes[worstB].s.toFixed(0) +
                  ' (need ' + clearance + ' m, or ' + bridgeDy + ' m of height for a bridge)');
    }

    let startK = 0;
    for (let s = win[0]; s <= win[1]; s += seg) {
      const o = sample(loop, s);
      startK = Math.max(startK, Math.abs(o.k));
    }
    if (startK > 0.006) {
      issues.push('Start/finish is not on a straight: max curvature ' + startK.toFixed(4) +
                  ' within [' + win[0] + ', ' + win[1] + '] m of the line');
    }

    if (Math.abs(loop.turns) !== 1) {
      issues.push('Layout winds ' + loop.turns + ' times; a simple circuit winds exactly once');
    }

    let maxSlope = 0;
    for (let q = 0; q < N; q++) {
      const d = Math.abs(nodes[(q + 1) % N].y - nodes[q].y) / seg;
      if (d > maxSlope) maxSlope = d;
    }
    if (maxSlope > 0.16) issues.push('Hill too steep: max slope ' + (maxSlope * 100).toFixed(0) + '%');

    return {
      ok: issues.length === 0,
      issues: issues,
      L: loop.L,
      minRadius: minRadius,
      minClearance: worst,
      startCurvature: startK,
      maxSlope: maxSlope,
      turns: loop.turns,
      bounds: bounds(loop)
    };
  }

  /* ── Loop-de-loop path ───────────────────────────────────────────────────
   * A loop occupies `length` metres of a flat straight. In the straight's own
   * frame (f forward, y up, l sideways, + = right) the road:
   *   entry   runs `entry` metres along the line;
   *   circle  turns a full vertical circle of `radius`, its centre drifting
   *           `circle` metres forward (so it is a loop, not a ring) while it
   *           steps `shift` metres sideways — the way down passes beside the
   *           way up;
   *   exit    swings back across onto the line over the remaining metres.
   * Track space keeps its own metres: `u` (0..length along the straight)
   * maps piecewise-linearly onto arc length `sigma` along this path, so the
   * entry and exit keep their true scale and the circle is stretched. The
   * race scales a kart's progress by du/dsigma (warp) inside the span, so
   * its visible speed is its real speed all the way round.
   */
  const smoother = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));

  function loopPath(opt) {
    const r = opt.radius, c = opt.entry, adv = opt.circle, len = opt.length;
    const W = opt.shift * (opt.side || 1), E = len - c - adv;
    if (!(E > 10)) throw new Error('loop too short for its entry and circle');
    // Dense samples: [f, y, l, nf, ny, nl] with cumulative arc length.
    const pts = [], arc = [];
    const push = (f, y, l, nf, ny, nl) => {
      if (pts.length) {
        const p = pts[pts.length - 1];
        arc.push(arc[arc.length - 1] + Math.hypot(f - p[0], y - p[1], l - p[2]));
      } else arc.push(0);
      pts.push([f, y, l, nf, ny, nl]);
    };
    const CIRC = 360, EXIT = 80, ENTRY = 4;
    for (let k = 0; k < ENTRY; k++) push(c * k / ENTRY, 0, 0, 0, 1, 0);
    for (let k = 0; k <= CIRC; k++) {
      const ph = TAU * k / CIRC;
      push(c + adv * ph / TAU + r * Math.sin(ph), r * (1 - Math.cos(ph)), W * smoother(ph / TAU),
        -Math.sin(ph), Math.cos(ph), 0);
    }
    const iCircleEnd = pts.length - 1;
    for (let k = 1; k <= EXIT; k++) {
      const t = k / EXIT;
      push(c + adv + E * t, 0, W * (1 - smoother(t)), 0, 1, 0);
    }
    // Per-sample unit tangents (central differences), interpolated in at() so
    // the road's cross-section turns smoothly instead of in steps.
    const tan = pts.map((p, k) => {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      const tf = b[0] - a[0], ty = b[1] - a[1], tl = b[2] - a[2], n = Math.hypot(tf, ty, tl) || 1;
      return [tf / n, ty / n, tl / n];
    });
    const sigC0 = arc[ENTRY], sigC1 = arc[iCircleEnd], total = arc[arc.length - 1];
    // Knots: base metres u ↔ arc metres sigma.
    const U = [0, c, c + adv, len], S = [0, sigC0, sigC1, total];
    function sigmaOf(u) {
      if (u <= 0) return u;
      if (u >= len) return total + (u - len);
      const i = u < c ? 0 : u < c + adv ? 1 : 2;
      return S[i] + (u - U[i]) * (S[i + 1] - S[i]) / (U[i + 1] - U[i]);
    }
    function uOf(sig) {
      if (sig <= 0) return sig;
      if (sig >= total) return len + (sig - total);
      const i = sig < S[1] ? 0 : sig < S[2] ? 1 : 2;
      return U[i] + (sig - S[i]) * (U[i + 1] - U[i]) / (S[i + 1] - S[i]);
    }
    /** du/dsigma at base metres u: how fast track progress runs per metre of path. */
    function warp(u) {
      if (u < 0 || u >= len) return 1;
      const i = u < c ? 0 : u < c + adv ? 1 : 2;
      return (U[i + 1] - U[i]) / (S[i + 1] - S[i]);
    }
    /** Path sample at arc sigma: { f, y, l, nf, ny, nl, tf, ty, tl } (t = unit tangent). */
    function at(sig, out) {
      const o = out || {};
      const s = Math.max(0, Math.min(total, sig));
      let a = 0, b = arc.length - 1;
      while (b - a > 1) { const m = (a + b) >> 1; if (arc[m] <= s) a = m; else b = m; }
      const span = arc[b] - arc[a] || 1, t = (s - arc[a]) / span, P = pts[a], Q = pts[b];
      o.f = P[0] + (Q[0] - P[0]) * t; o.y = P[1] + (Q[1] - P[1]) * t; o.l = P[2] + (Q[2] - P[2]) * t;
      let nf = P[3] + (Q[3] - P[3]) * t, ny = P[4] + (Q[4] - P[4]) * t, nl = P[5] + (Q[5] - P[5]) * t;
      const nn = Math.hypot(nf, ny, nl) || 1;
      o.nf = nf / nn; o.ny = ny / nn; o.nl = nl / nn;
      const TA = tan[a], TB = tan[b];
      const tf = TA[0] + (TB[0] - TA[0]) * t, ty = TA[1] + (TB[1] - TA[1]) * t, tl = TA[2] + (TB[2] - TA[2]) * t;
      const tn = Math.hypot(tf, ty, tl) || 1;
      o.tf = tf / tn; o.ty = ty / tn; o.tl = tl / tn;
      return o;
    }
    return { length: len, arc: total, sigmaOf, uOf, warp, at, radius: r, shift: W, entry: c, circle: adv,
      circleArc: sigC1 - sigC0 };
  }

  const api = { buildLoop, sample, toWorld, bounds, makeIndex, nearest, validate, wrapAngle, mod, crPoint, loopPath, TAU };
  root.NKSpline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
