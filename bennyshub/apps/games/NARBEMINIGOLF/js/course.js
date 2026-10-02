/**
 * NARBE Mini Golf — course format and geometry.
 *
 * A course file is the same JSON the original top-down game used (and that the
 * original Course Creator writes), so every existing course plays unchanged:
 *
 *   { name, holes: [{ par, start:{x,y,radius}, end:{x,y,radius},
 *       walls, waters, sands, ice, boosts, bridges, trees }] }
 *
 * Coordinates are course px, y down (the original 1280 × 720 design canvas).
 * Version 2 adds optional fields, all of which an old course simply lacks:
 *
 *   course.theme              'sunny' | 'sunset' | 'night' | 'autumn'
 *   hole.fairway  {points,smooth}  the carpet's outline, ringed by a border rail.
 *                             Any size or shape — doglegs, S-bends, islands.
 *                             Absent → the whole 1280 × 720 rectangle (v1).
 *   hole.name                 shown on the flyover banner
 *   hole.theme                per-hole override
 *   hole.hills    [{x,y,radius,height}]   height > 0 mound, < 0 bowl (px)
 *   hole.bumpers  [{x,y,radius}]          springy posts
 *   hole.windmills[{x,y,width,height,angle,gap,speed}]  tunnel runs along local x
 *   hole.tunnels  [{x1,y1,x2,y2,radius,exitAngle}]      enter at 1, pop out of 2
 *   hole.decor    [{type,x,y,scale,angle}]              scenery, no collision
 *
 * compileHole() turns that into the shape physics and rendering both consume:
 * every hazard region becomes a sampled polygon with a bounding box, so the
 * shape you see is exactly the shape the ball feels. (The original drew smooth
 * curves but tested the ball against the raw control points, so a "smooth"
 * pond was visibly smaller than the area that actually swallowed the ball.)
 */
(function (root) {
  'use strict';

  const MG = root.MG = root.MG || {};

  const W = 1280;               // design canvas width  (course px)
  const H = 720;                // design canvas height (course px)
  const S = 0.05;               // world units per course px → course is 64 × 36 units

  const DEFAULT_BALL_R = 15;
  const DEFAULT_CUP_R = 23;
  const RAIL = 5;               // bridge side-rail thickness, as the original

  const THEMES = ['sunny', 'sunset', 'night', 'autumn'];

  /* ── Polygon geometry ─────────────────────────────────────────────────── */

  function pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function closestOnSegment(px, py, x1, y1, x2, y2) {
    const cx = x2 - x1, cy = y2 - y1;
    const len2 = cx * cx + cy * cy;
    let t = len2 ? ((px - x1) * cx + (py - y1) * cy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return { x: x1 + t * cx, y: y1 + t * cy };
  }

  /** Closest point on a polygon's outline, and the distance to it. */
  function closestOnPolygon(px, py, pts) {
    let best = null, bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const c = closestOnSegment(px, py, a.x, a.y, b.x, b.y);
      const d = Math.hypot(px - c.x, py - c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return { x: best ? best.x : px, y: best ? best.y : py, d: bestD };
  }

  function polygonArea(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
    return a / 2;
  }

  function bboxOf(pts, pad) {
    pad = pad || 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
    }
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }

  /**
   * The original drew a "smooth" polygon as quadratic curves that pass through
   * each edge's midpoint, using the vertices as control points. Sample that
   * exact curve so physics and rendering agree with what the editor showed.
   */
  function smoothPolygon(pts, perSeg) {
    perSeg = perSeg || 8;
    const n = pts.length;
    if (n < 3) return pts.map(p => ({ x: p.x, y: p.y }));
    const out = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n], p = pts[i], next = pts[(i + 1) % n];
      const ax = (prev.x + p.x) / 2, ay = (prev.y + p.y) / 2;
      const bx = (p.x + next.x) / 2, by = (p.y + next.y) / 2;
      for (let s = 0; s < perSeg; s++) {
        const t = s / perSeg, u = 1 - t;
        out.push({ x: u * u * ax + 2 * u * t * p.x + t * t * bx, y: u * u * ay + 2 * u * t * p.y + t * t * by });
      }
    }
    return out;
  }

  function circlePolygon(cx, cy, r, n) {
    n = n || 40;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return out;
  }

  /** Corners of a rect stored the original way: x,y = unrotated top-left, rotated about its centre. */
  function rectCorners(r) {
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const a = (r.angle || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const hw = r.width / 2, hh = r.height / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([lx, ly]) => ({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c }));
  }

  /** Any of the three region encodings the original accepted → one sampled polygon. */
  function regionPolygon(r) {
    if (r.points && r.points.length >= 3) return r.smooth ? smoothPolygon(r.points) : r.points.map(p => ({ x: p.x, y: p.y }));
    if (r.radius) return circlePolygon(r.x, r.y, r.radius);
    if (r.width && r.height) return rectCorners(r);
    return null;
  }

  /* ── Lanes ───────────────────────────────────────────────────────────────
   * Most mini-golf holes are a lane: a path of some width with rounded bends.
   * A fairway can be stored as that path — nodes [{x,y,w}] — and the outline
   * is derived here, so the editor only has to move a handful of nodes.
   */
  function laneOutline(nodes, caps) {
    const pts = nodes.filter(n => isFinite(n.x) && isFinite(n.y));
    if (pts.length < 2) return null;
    const widthOf = (i) => Math.max(40, num(pts[i].w, 220));

    // Centre line with each interior corner filleted to a radius that keeps
    // the inner edge from folding over itself.
    const centre = [];   // {x, y, w}
    centre.push({ x: pts[0].x, y: pts[0].y, w: widthOf(0) });
    for (let i = 1; i < pts.length - 1; i++) {
      const A = pts[i - 1], B = pts[i], Cn = pts[i + 1];
      const ux = A.x - B.x, uy = A.y - B.y, vx = Cn.x - B.x, vy = Cn.y - B.y;
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu < 1 || lv < 1) continue;
      const nux = ux / lu, nuy = uy / lu, nvx = vx / lv, nvy = vy / lv;
      const cos = U(nux * nvx + nuy * nvy);
      const theta = Math.acos(cos) / 2;              // half the corner angle
      if (Math.PI / 2 - theta < 0.02) { centre.push({ x: B.x, y: B.y, w: widthOf(i) }); continue; }  // straight
      let R = widthOf(i) / 2 + 30;
      let d = R / Math.tan(theta);
      const dmax = Math.min(lu, lv) * 0.5;
      if (d > dmax) { d = dmax; R = d * Math.tan(theta); }
      const t1 = { x: B.x + nux * d, y: B.y + nuy * d }, t2 = { x: B.x + nvx * d, y: B.y + nvy * d };
      const bx = nux + nvx, by = nuy + nvy, bl = Math.hypot(bx, by) || 1;
      const cd = R / Math.sin(theta);
      const cx = B.x + bx / bl * cd, cy = B.y + by / bl * cd;
      let a1 = Math.atan2(t1.y - cy, t1.x - cx), a2 = Math.atan2(t2.y - cy, t2.x - cx);
      let da = a2 - a1;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const steps = Math.max(3, Math.ceil(Math.abs(da) * R / 18));
      for (let s = 0; s <= steps; s++) {
        const a = a1 + da * s / steps;
        centre.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, w: widthOf(i) });
      }
    }
    centre.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, w: widthOf(pts.length - 1) });

    // Densify long straights so width changes taper smoothly.
    const dense = [centre[0]];
    for (let i = 1; i < centre.length; i++) {
      const a = centre[i - 1], b = centre[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.ceil(L / 40));
      for (let s = 1; s <= n; s++) {
        const t = s / n;
        dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t });
      }
    }

    const left = [], right = [];
    for (let i = 0; i < dense.length; i++) {
      const p = dense[i];
      const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      left.push({ x: p.x + nx * p.w / 2, y: p.y + ny * p.w / 2 });
      right.push({ x: p.x - nx * p.w / 2, y: p.y - ny * p.w / 2 });
    }

    const cap = (p, q, centreP, w, outward) => {
      // Half-circle from p round to q about centreP, bulging toward `outward`.
      const out = [];
      if (caps === 'square') return out;
      const a0 = Math.atan2(p.y - centreP.y, p.x - centreP.x);
      let a1 = Math.atan2(q.y - centreP.y, q.x - centreP.x);
      let da = a1 - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      // Pick the half that faces outward.
      const mid = a0 + da / 2;
      if (Math.cos(mid) * outward.x + Math.sin(mid) * outward.y < 0) da = da > 0 ? da - Math.PI * 2 : da + Math.PI * 2;
      const steps = 12;
      for (let s = 1; s < steps; s++) {
        const a = a0 + da * s / steps;
        out.push({ x: centreP.x + Math.cos(a) * w / 2, y: centreP.y + Math.sin(a) * w / 2 });
      }
      return out;
    };

    const first = dense[0], second = dense[1], last = dense[dense.length - 1], prev = dense[dense.length - 2];
    const endOut = { x: last.x - prev.x, y: last.y - prev.y };
    const startOut = { x: first.x - second.x, y: first.y - second.y };
    const poly = left.slice();
    poly.push(...cap(left[left.length - 1], right[right.length - 1], last, last.w, endOut));
    poly.push(...right.slice().reverse());
    poly.push(...cap(right[0], left[0], first, first.w, startOut));
    return poly;
  }

  function U(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

  /* ── Oriented boxes (walls, bridges, windmill blocks) ─────────────────── */

  function makeBox(cx, cy, hw, hh, angleDeg, extra) {
    const a = (angleDeg || 0) * Math.PI / 180;
    const box = {
      cx, cy, hw, hh,
      angle: angleDeg || 0,
      cos: Math.cos(a), sin: Math.sin(a),
      reach: Math.hypot(hw, hh)
    };
    if (extra) Object.assign(box, extra);
    return box;
  }

  function boxFromRect(r, extra) {
    return makeBox(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, r.angle || 0, extra);
  }

  /** World point → a box's local frame. */
  function toLocal(box, x, y) {
    const dx = x - box.cx, dy = y - box.cy;
    return { x: dx * box.cos + dy * box.sin, y: -dx * box.sin + dy * box.cos };
  }

  function inBox(box, x, y) {
    const l = toLocal(box, x, y);
    return Math.abs(l.x) <= box.hw && Math.abs(l.y) <= box.hh;
  }

  function boxCorners(box) {
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
      const lx = sx * box.hw, ly = sy * box.hh;
      return { x: box.cx + lx * box.cos - ly * box.sin, y: box.cy + lx * box.sin + ly * box.cos };
    });
  }

  /* ── Terrain ─────────────────────────────────────────────────────────────
   * Hills are smooth cosine bumps. Summing them gives mounds, bowls, ridges
   * and funnels from one simple, editable primitive, and the height field is
   * continuous everywhere so a rolling ball never meets a seam.
   */
  function hillHeight(hills, x, y) {
    let h = 0;
    for (let i = 0; i < hills.length; i++) {
      const k = hills[i];
      const dx = x - k.x, dy = y - k.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= k.r2) continue;
      const t = Math.sqrt(d2) / k.radius;
      h += k.height * 0.5 * (1 + Math.cos(Math.PI * t));
    }
    return h;
  }

  /** ∇h at (x,y), written into out = {x,y}. */
  function hillGradient(hills, x, y, out) {
    let gx = 0, gy = 0;
    for (let i = 0; i < hills.length; i++) {
      const k = hills[i];
      const dx = x - k.x, dy = y - k.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= k.r2 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const t = d / k.radius;
      const dh = -k.height * 0.5 * Math.PI * Math.sin(Math.PI * t) / k.radius;   // dh/dd
      gx += dh * dx / d;
      gy += dh * dy / d;
    }
    out.x = gx; out.y = gy;
    return out;
  }

  /* ── Normalising ─────────────────────────────────────────────────────── */

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  function normaliseCourse(raw) {
    const c = raw && typeof raw === 'object' ? raw : {};
    const holes = Array.isArray(c.holes) ? c.holes : [];
    return {
      name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Mini Golf Course',
      version: 2,
      theme: THEMES.includes(c.theme) ? c.theme : 'sunny',
      author: c.author || '',
      description: c.description || '',
      holes: holes.map(normaliseHole)
    };
  }

  function normaliseHole(h) {
    h = h || {};
    const arr = (k) => (Array.isArray(h[k]) ? h[k] : []);
    return {
      name: typeof h.name === 'string' ? h.name : '',
      par: Math.max(1, Math.round(num(h.par, 3))),
      theme: THEMES.includes(h.theme) ? h.theme : null,
      start: { x: num(h.start && h.start.x, 100), y: num(h.start && h.start.y, 360), radius: num(h.start && h.start.radius, DEFAULT_BALL_R) },
      end: { x: num(h.end && h.end.x, 1180), y: num(h.end && h.end.y, 360), radius: num(h.end && h.end.radius, DEFAULT_CUP_R) },
      fairway: normaliseFairway(h.fairway),
      walls: arr('walls'), waters: arr('waters'), sands: arr('sands'), ice: arr('ice'),
      boosts: arr('boosts'), bridges: arr('bridges'), trees: arr('trees'),
      hills: arr('hills'), bumpers: arr('bumpers'), windmills: arr('windmills'),
      tunnels: arr('tunnels'), decor: arr('decor')
    };
  }

  function normaliseFairway(f) {
    if (!f) return null;
    if (Array.isArray(f.lane) && f.lane.length >= 2) return { lane: f.lane, caps: f.caps === 'square' ? 'square' : 'round' };
    if (Array.isArray(f.points) && f.points.length >= 3) return { points: f.points, smooth: !!f.smooth };
    return null;
  }

  /** Fairway outline as a polygon, whichever way it was stored. */
  function fairwayPolygon(f) {
    if (!f) return rectCorners({ x: 0, y: 0, width: W, height: H, angle: 0 });
    if (f.lane) return laneOutline(f.lane, f.caps) || rectCorners({ x: 0, y: 0, width: W, height: H, angle: 0 });
    return regionPolygon(f);
  }

  /* ── Compiling ───────────────────────────────────────────────────────── */

  function compileRegions(list, kind) {
    const out = [];
    for (const r of list) {
      const poly = regionPolygon(r);
      if (!poly || poly.length < 3) continue;
      const reg = { kind, poly, bbox: bboxOf(poly), src: r };
      if (kind === 'boost') {
        const ang = r.boostAngle !== undefined ? r.boostAngle : (r.angle || 0);
        reg.directional = r.boostAngle !== undefined;
        reg.dirX = Math.cos(ang * Math.PI / 180);
        reg.dirY = Math.sin(ang * Math.PI / 180);
        reg.boostAngle = ang;
      }
      out.push(reg);
    }
    return out;
  }

  const WINDMILL_DEFAULTS = { width: 150, height: 170, gap: 80, speed: 1 };

  function compileWindmill(m, ballR) {
    const wm = Object.assign({}, WINDMILL_DEFAULTS, m);
    const gap = Math.max(wm.gap, ballR * 2 + 16);
    const box = boxFromRect({ x: wm.x, y: wm.y, width: wm.width, height: wm.height, angle: wm.angle || 0 });
    // Two solid blocks either side of the tunnel, which runs along local x.
    const sideH = Math.max(4, (box.hh * 2 - gap) / 2);
    const blocks = [-1, 1].map((side) => {
      const ly = side * (gap / 2 + sideH / 2);
      return makeBox(box.cx - ly * box.sin, box.cy + ly * box.cos, box.hw, sideH / 2, box.angle, { solid: 'windmill' });
    });
    // The sails sweep across the tunnel mouth on the local -x face.
    const gateLx = -box.hw - 6;
    const gate = makeBox(box.cx + gateLx * box.cos, box.cy + gateLx * box.sin, 5, gap / 2, box.angle, { gate: true });
    return { src: m, box, blocks, gate, gap, speed: num(wm.speed, 1), width: wm.width, height: wm.height };
  }

  /** Sail rotation at sim time t (seconds). Four sails; 0 = a sail pointing straight down. */
  function windmillSailAngle(wm, t) {
    return (t * 0.9 * wm.speed) % (Math.PI * 2);
  }

  /** A sail is blocking the tunnel mouth while any of the four is within ±15° of straight down. */
  function windmillGateClosed(wm, t) {
    const a = windmillSailAngle(wm, t);
    const q = Math.PI / 2;
    let m = a % q; if (m > q / 2) m -= q;
    return Math.abs(m) < (15 * Math.PI / 180);
  }

  /**
   * The carpet outline, wound so every edge's normal points *into* the
   * fairway. The ball is kept inside by treating each edge as a rail.
   */
  function compileFairway(h) {
    let poly = fairwayPolygon(h.fairway);
    // Drop near-duplicate points; they make zero-length rails.
    poly = poly.filter((p, i) => {
      const q = poly[(i + 1) % poly.length];
      return Math.hypot(p.x - q.x, p.y - q.y) > 0.5;
    });
    // polygonArea() comes out negative for a loop that runs clockwise on screen (y down).
    const cw = polygonArea(poly) < 0;
    const edges = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      // Rotate the edge direction a quarter turn toward the interior.
      const nx = cw ? -dy / len : dy / len;
      const ny = cw ? dx / len : -dx / len;
      edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, nx, ny, len });
    }
    return { poly, edges, bbox: bboxOf(poly), legacy: !h.fairway };
  }

  function compileHole(holeRaw) {
    const h = holeRaw && holeRaw.walls !== undefined && holeRaw.hills !== undefined ? holeRaw : normaliseHole(holeRaw);
    const ballR = h.start.radius;
    const fairway = compileFairway(h);

    const walls = h.walls.filter(w => w.width > 0 && w.height > 0).map(w => boxFromRect(w, { solid: 'wall', src: w }));

    const bridges = h.bridges.filter(b => b.width > 0 && b.height > 0).map(b => {
      const box = boxFromRect(b, { src: b });
      // Rails along the long local-x sides, exactly where the original put them.
      const rails = [-1, 1].map(side => {
        const ly = side * (box.hh - RAIL / 2);
        return makeBox(box.cx - ly * box.sin, box.cy + ly * box.cos, box.hw, RAIL / 2, box.angle, { solid: 'rail' });
      });
      box.rails = rails;
      return box;
    });

    const windmills = h.windmills.map(m => compileWindmill(m, ballR));

    const solids = walls.slice();
    for (const b of bridges) solids.push(...b.rails);
    for (const m of windmills) solids.push(...m.blocks);

    const hills = h.hills
      .filter(k => k.radius > 4 && k.height)
      .map(k => ({ x: k.x, y: k.y, radius: k.radius, height: k.height, r2: k.radius * k.radius, src: k }));

    const bumpers = h.bumpers.filter(b => b.radius > 2).map(b => ({ x: b.x, y: b.y, radius: b.radius, src: b }));
    const bushes = h.trees.filter(t => t.radius > 2 && isFinite(t.x) && isFinite(t.y)).map(t => ({ x: t.x, y: t.y, radius: t.radius, r2: t.radius * t.radius, src: t }));
    const tunnels = h.tunnels.map(t => ({
      x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2,
      radius: Math.max(num(t.radius, 30), ballR + 6),
      exitAngle: num(t.exitAngle, Math.atan2(t.y2 - t.y1, t.x2 - t.x1) * 180 / Math.PI),
      src: t
    }));

    return {
      raw: h,
      par: h.par,
      name: h.name,
      theme: h.theme,
      start: { x: h.start.x, y: h.start.y },
      ballR,
      cup: { x: h.end.x, y: h.end.y, r: h.end.radius },
      fairway,
      bounds: fairway.bbox,
      walls, bridges, windmills, solids,
      waters: compileRegions(h.waters, 'water'),
      sands: compileRegions(h.sands, 'sand'),
      ice: compileRegions(h.ice, 'ice'),
      boosts: compileRegions(h.boosts, 'boost'),
      hills, bumpers, bushes, tunnels,
      decor: h.decor
    };
  }

  /* ── Height queries (render + camera) ─────────────────────────────────── */

  /** Turf height in course px (hills only). */
  function terrainHeight(ch, x, y) {
    return ch.hills.length ? hillHeight(ch.hills, x, y) : 0;
  }

  /** Bridges stand this far above the turf, ramping down over their last few px. */
  const BRIDGE_RISE = 10;
  const BRIDGE_RAMP = 30;

  function bridgeDeck(box, x, y) {
    const l = toLocal(box, x, y);
    if (Math.abs(l.x) > box.hw || Math.abs(l.y) > box.hh) return null;
    const fromEnd = box.hw - Math.abs(l.x);
    return BRIDGE_RISE * Math.min(1, fromEnd / BRIDGE_RAMP);
  }

  /** The height a ball resting at (x,y) sits on: turf, or a bridge deck above it. */
  function surfaceHeight(ch, x, y) {
    let h = terrainHeight(ch, x, y);
    for (const b of ch.bridges) {
      const d = bridgeDeck(b, x, y);
      if (d !== null) h = Math.max(h, terrainHeight(ch, b.cx, b.cy) + d);
    }
    return h;
  }

  /* ── Validation (shared by the Course Creator and the course builder) ───── */

  function segsCross(a, b, c, d) {
    const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return ((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) && ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6));
  }

  /**
   * Everything that would make a hole unplayable or confusing, in plain words.
   * Needs MG.physics (for what's underfoot), which every user of this loads.
   */
  function validateHole(raw) {
    const h = normaliseHole(raw);
    const ch = compileHole(h);
    const P = MG.physics;
    const errs = [];
    const poly = ch.fairway.poly, n = poly.length;
    let crosses = 0;
    for (let a = 0; a < n; a++) for (let b = a + 2; b < n; b++) {
      if (a === 0 && b === n - 1) continue;
      if (segsCross(poly[a], poly[(a + 1) % n], poly[b], poly[(b + 1) % n])) crosses++;
    }
    if (crosses) errs.push('The fairway overlaps itself — move its points apart.');
    const spotOk = (x, y, what) => {
      if (!pointInPolygon(x, y, poly)) { errs.push('The ' + what + ' is off the carpet.'); return; }
      if (closestOnPolygon(x, y, poly).d < ch.ballR + 4) errs.push('The ' + what + ' is against the rail.');
      const s = P ? P.surfaceAt(ch, x, y).kind : 'turf';
      if (s === 'water' || s === 'sand') errs.push('The ' + what + ' is in ' + s + '.');
      if (ch.solids.some(b => inBox(makeBox(b.cx, b.cy, b.hw + ch.ballR, b.hh + ch.ballR, b.angle), x, y))) errs.push('The ' + what + ' is inside a wall.');
      if (ch.bushes.some(b => Math.hypot(x - b.x, y - b.y) < b.radius + ch.ballR)) errs.push('The ' + what + ' is in a bush.');
      if (ch.bumpers.some(b => Math.hypot(x - b.x, y - b.y) < b.radius + ch.ballR + 4)) errs.push('The ' + what + ' is on a bumper.');
    };
    spotOk(ch.start.x, ch.start.y, 'tee');
    spotOk(ch.cup.x, ch.cup.y, 'cup');
    ch.tunnels.forEach((t, i) => { spotOk(t.x1, t.y1, 'tunnel ' + (i + 1) + ' way in'); spotOk(t.x2, t.y2, 'tunnel ' + (i + 1) + ' way out'); });
    if (Math.hypot(ch.start.x - ch.cup.x, ch.start.y - ch.cup.y) < 120) errs.push('The tee and cup are very close together.');
    if (P && P.routeField && !errs.length && !isFinite(P.routeField(ch).at(ch.start.x, ch.start.y))) {
      errs.push('There is no way from the tee to the cup — a wall, pond or narrow gap blocks it.');
    }
    return errs;
  }

  MG.course = {
    W, H, S, DEFAULT_BALL_R, DEFAULT_CUP_R, THEMES, BRIDGE_RISE, BRIDGE_RAMP,
    pointInPolygon, closestOnSegment, closestOnPolygon, polygonArea, bboxOf,
    smoothPolygon, circlePolygon, rectCorners, regionPolygon,
    laneOutline, fairwayPolygon, normaliseFairway,
    makeBox, boxFromRect, toLocal, inBox, boxCorners,
    hillHeight, hillGradient, terrainHeight, surfaceHeight, bridgeDeck,
    windmillSailAngle, windmillGateClosed,
    normaliseCourse, normaliseHole, compileHole, validateHole,
    WINDMILL_DEFAULTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
