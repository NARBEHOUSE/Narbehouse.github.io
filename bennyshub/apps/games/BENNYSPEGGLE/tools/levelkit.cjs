/**
 * Benny's P3GL — level-building kit for the campaign scripts.
 *
 * Campaign scripts (tools/campaigns/*.cjs) describe levels with these
 * helpers; tools/build-campaigns.cjs turns them into campaigns/*.json.
 * Board: 1000 × 1080 board pixels, y grows downward, launcher at (500, 58).
 * Keep pegs inside x 40..960 and y 160..975 (clean() enforces it).
 *
 * Positions are plain {x, y}; items are level items ({ t, x, y, ... }, see
 * js/levels.js). Pattern functions return positions; `pegs()` / `as()` turn
 * positions into items.
 */
const P3 = require('./test/load.cjs');
const C = P3.catalog;
const W = C.BOARD.W, H = C.BOARD.H;
const TAU = Math.PI * 2;

/* ── Randomness (deterministic per level) ─────────────────────────────── */
function rng(seed) { return P3.util.mulberry32(typeof seed === 'number' ? seed : P3.util.hash(String(seed))); }

/* ── Items ────────────────────────────────────────────────────────────── */
function peg(x, y, c, r) { return { t: 'peg', x, y, c: c || 'blue', r: r || 17 }; }
function item(t, x, y, o) { return Object.assign({ t, x, y }, o || {}); }
function brick(x, y, w, h, a, hp) { return { t: 'brick', x, y, w: w || 64, h: h || 22, a: a || 0, hp: hp || 1 }; }
function armor(x, y, w, h, a, hp) { return { t: 'armor', x, y, w: w || 64, h: h || 24, a: a || 0, hp: hp || 1 }; }
function glass(x, y, w, h, a) { return { t: 'glass', x, y, w: w || 64, h: h || 18, a: a || 0 }; }
function wall(x, y, w, h, a) { return { t: 'wall', x, y, w: w || 80, h: h || 20, a: a || 0 }; }
function gate(x, y, w, h, a, k) { return { t: 'gate', x, y, w: w || 80, h: h || 20, a: a || 0, k: k || 'blue' }; }

/** Positions → items of one type (and colour for pegs). */
function as(pos, t, o) {
  return pos.map(p => (t === 'peg' ? peg(p.x, p.y, (o && o.c) || 'blue', o && o.r) : item(t, p.x, p.y, Object.assign({}, o, p.extra || {}))));
}
function pegs(pos, c, r) { return as(pos, 'peg', { c, r }); }

/** Bricks laid along positions (angled to follow the path when `follow`). */
function bricksAlong(pos, o) {
  o = o || {};
  return pos.map((p, i) => {
    let a = o.a || 0;
    if (o.follow && pos.length > 1) {
      const q = pos[Math.min(pos.length - 1, i + 1)], r = pos[Math.max(0, i - 1)];
      a = Math.atan2(q.y - r.y, q.x - r.x) * 180 / Math.PI;
    }
    const b = { t: o.t || 'brick', x: p.x, y: p.y, w: o.w || 60, h: o.h || 20, a };
    if (b.t === 'brick') b.hp = typeof o.hp === 'function' ? o.hp(i) : (o.hp || 1);
    if (b.t === 'armor') b.hp = o.hp || 1;
    if (b.t === 'gate') b.k = o.k || 'blue';
    return b;
  });
}

/* ── Patterns (positions) ─────────────────────────────────────────────── */
function line(x1, y1, x2, y2, n) {
  const out = [];
  for (let i = 0; i < n; i++) { const u = n === 1 ? 0.5 : i / (n - 1); out.push({ x: x1 + (x2 - x1) * u, y: y1 + (y2 - y1) * u }); }
  return out;
}
/** Points on a circle; a0..a1 in degrees (0 = right, 90 = down). Full ring when omitted. */
function ring(cx, cy, r, n, a0, a1) {
  const full = a0 === undefined;
  const s = full ? 0 : a0 * Math.PI / 180, e = full ? TAU : a1 * Math.PI / 180;
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = full ? i / n : (n === 1 ? 0.5 : i / (n - 1));
    const a = s + (e - s) * u;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}
const arc = ring;
function ellipse(cx, cy, rx, ry, n, rot) {
  const out = [], k = (rot || 0) * Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push({ x: cx + x * Math.cos(k) - y * Math.sin(k), y: cy + x * Math.sin(k) + y * Math.cos(k) });
  }
  return out;
}
function grid(x0, y0, cols, rows, dx, dy, stagger) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    out.push({ x: x0 + c * dx + (stagger && r % 2 ? dx / 2 : 0), y: y0 + r * dy, row: r, col: c });
  }
  return out;
}
function spiral(cx, cy, r0, r1, turns, n, a0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1), a = (a0 || 0) * Math.PI / 180 + u * turns * TAU;
    const r = r0 + (r1 - r0) * u;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}
function wave(x0, x1, y, amp, periods, n, phase) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    out.push({ x: x0 + (x1 - x0) * u, y: y + Math.sin(u * periods * TAU + (phase || 0)) * amp });
  }
  return out;
}
function heart(cx, cy, size, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / n * TAU;
    const x = 16 * Math.pow(Math.sin(t), 3), y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    out.push({ x: cx + x * size / 17, y: cy + y * size / 17 });
  }
  return out;
}
/** A star outline: points tips, inner radius ri, n positions along the outline. */
function starShape(cx, cy, ro, ri, points, n, rot) {
  const verts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? ri : ro, a = (rot === undefined ? -90 : rot) * Math.PI / 180 + i * Math.PI / points;
    verts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return alongPolygon(verts, n);
}
function polygon(cx, cy, r, sides, n, rot) {
  const verts = [];
  for (let i = 0; i < sides; i++) { const a = (rot === undefined ? -90 : rot) * Math.PI / 180 + i * TAU / sides; verts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  return alongPolygon(verts, n);
}
function alongPolygon(verts, n) {
  const segs = verts.map((v, i) => { const w = verts[(i + 1) % verts.length]; return { v, w, len: Math.hypot(w.x - v.x, w.y - v.y) }; });
  const total = segs.reduce((a, s) => a + s.len, 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    let d = i / n * total;
    for (const s of segs) {
      if (d <= s.len) { const u = d / s.len; out.push({ x: s.v.x + (s.w.x - s.v.x) * u, y: s.v.y + (s.w.y - s.v.y) * u }); break; }
      d -= s.len;
    }
  }
  return out;
}
/** Flower: petals as small rings around a centre. */
function flower(cx, cy, r, petals, perPetal) {
  const out = [];
  for (let p = 0; p < petals; p++) {
    const a = p / petals * TAU;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    out.push(...ring(px, py, r * 0.45, perPetal || 5, a * 180 / Math.PI + 90, a * 180 / Math.PI + 270));
  }
  return out;
}
/** A filled triangle of rows (pyramid), apex at top. */
function pyramid(cx, y0, rows, dx, dy) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c <= r; c++) out.push({ x: cx + (c - r / 2) * dx, y: y0 + r * dy });
  return out;
}
function diamond(cx, cy, rows, dx, dy) {
  const out = [], mid = Math.floor(rows / 2);
  for (let r = 0; r < rows; r++) { const n = mid - Math.abs(r - mid) + 1; for (let c = 0; c < n; c++) out.push({ x: cx + (c - (n - 1) / 2) * dx, y: cy + (r - mid) * dy }); }
  return out;
}

/** 5×7 pixel font for short words made of pegs. */
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], B: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'], D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'], G: ['01111', '10000', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '11111', '10001', '10001', '10001', '10001'], I: ['111', '010', '010', '010', '010', '010', '111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'], N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'], S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'], Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'], '!': ['1', '1', '1', '1', '1', '0', '1'],
  ' ': ['000', '000', '000', '000', '000', '000', '000']
};
function word(text, cx, cy, cell) {
  cell = cell || 38;
  const chars = String(text).toUpperCase().split('').map(ch => FONT[ch] || FONT[' ']);
  const width = chars.reduce((a, g) => a + g[0].length + 1, -1);
  const out = [];
  let x = cx - width * cell / 2 + cell / 2;
  for (const g of chars) {
    g.forEach((row, ry) => row.split('').forEach((b, rx) => { if (b === '1') out.push({ x: x + rx * cell, y: cy + (ry - 3) * cell }); }));
    x += (g[0].length + 1) * cell;
  }
  return out;
}

/* ── Transforms ───────────────────────────────────────────────────────── */
function mirror(list, cx) {
  cx = cx === undefined ? W / 2 : cx;
  const out = list.slice();
  for (const p of list) {
    if (Math.abs(p.x - cx) < 4) continue;
    const q = Object.assign({}, p, { x: 2 * cx - p.x });
    if (q.a !== undefined) q.a = (180 - q.a + 360) % 360;
    if (q.m && q.m.type === 'rotate') q.m = Object.assign({}, q.m, { cx: 2 * cx - q.m.cx, speed: -q.m.speed });
    if (q.m && q.m.type === 'slide') q.m = Object.assign({}, q.m, { dx: -q.m.dx });
    out.push(q);
  }
  return out;
}
function move(list, dx, dy) { return list.map(p => Object.assign({}, p, { x: p.x + dx, y: p.y + dy })); }
function rotateAbout(list, cx, cy, deg) {
  const k = deg * Math.PI / 180, c = Math.cos(k), s = Math.sin(k);
  return list.map(p => { const x = p.x - cx, y = p.y - cy; const q = Object.assign({}, p, { x: cx + x * c - y * s, y: cy + x * s + y * c }); if (q.a !== undefined) q.a = (q.a + deg + 360) % 360; return q; });
}
function scaleAbout(list, cx, cy, k) { return list.map(p => Object.assign({}, p, { x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k })); }

/** Give items a motion. */
function spin(list, cx, cy, speed) { return list.map(p => Object.assign({}, p, { m: { type: 'rotate', cx, cy, speed } })); }
function slide(list, dx, dy, period, phase) { return list.map(p => Object.assign({}, p, { m: { type: 'slide', dx, dy, period: period || 4, phase: phase || 0 } })); }
function orbit(list, r, speed, phaseFn) { return list.map((p, i) => Object.assign({}, p, { m: { type: 'orbit', r, speed, phase: phaseFn ? phaseFn(i) : 0 } })); }

/** Recolour pegs: a colour name, an array cycled, or fn(item, i) → colour. */
function color(list, c) {
  return list.map((p, i) => (p.t === 'peg' ? Object.assign({}, p, { c: typeof c === 'function' ? c(p, i) : Array.isArray(c) ? c[i % c.length] : c }) : p));
}

/**
 * Pick n items spread across the board (farthest-point sampling), so goal
 * pegs or powers do not clump. `filter` limits candidates.
 */
function spreadPick(list, n, seed, filter) {
  const R = rng(seed || 1);
  const cand = list.map((p, i) => ({ p, i })).filter(o => !filter || filter(o.p));
  if (!cand.length || n <= 0) return [];
  const chosen = [cand[Math.floor(R() * cand.length)]];
  while (chosen.length < Math.min(n, cand.length)) {
    let best = null, bestD = -1;
    for (const o of cand) {
      if (chosen.includes(o)) continue;
      let d = Infinity;
      for (const c of chosen) d = Math.min(d, Math.hypot(o.p.x - c.p.x, o.p.y - c.p.y));
      d *= 0.85 + R() * 0.3;
      if (d > bestD) { bestD = d; best = o; }
    }
    chosen.push(best);
  }
  return chosen.map(o => o.i);
}

/** Turn n spread-out pegs of a list into another type/colour. Returns a new list. */
function convert(list, n, seed, into, filter) {
  const idx = new Set(spreadPick(list, n, seed, filter || (p => p.t === 'peg')));
  return list.map((p, i) => {
    if (!idx.has(i)) return p;
    if (typeof into === 'string' && C.PEG_COLORS[into]) return Object.assign({}, p, { t: 'peg', c: into });
    const t = typeof into === 'function' ? into(p, i) : into;
    const q = Object.assign({}, p, { t });
    delete q.c;
    return q;
  });
}

/**
 * Tidy a list: drop items outside the board, then nudge apart anything that
 * overlaps (moving items only nudge against things on the same motion).
 */
function clean(list, opts) {
  opts = opts || {};
  const pad = opts.pad === undefined ? 5 : opts.pad;
  const out = list.filter(p => p.x > 20 && p.x < W - 20 && p.y > 130 && p.y < 1000).map(p => Object.assign({}, p));
  const rad = (p) => (p.r || (p.w ? Math.max(p.w, p.h) / 2 * 0.8 : 17));
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (a.w || b.w) continue;                       // bricks are placed on purpose
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      const min = rad(a) + rad(b) + pad;
      if (d < min) {
        const k = (min - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * k; a.y -= ny * k; b.x += nx * k; b.y += ny * k; moved = true;
      }
    }
    for (const p of out) { p.x = Math.max(40, Math.min(W - 40, p.x)); p.y = Math.max(160, Math.min(975, p.y)); }
    if (!moved) break;
  }
  return out.map(p => { p.x = Math.round(p.x); p.y = Math.round(p.y); return p; });
}

/** Remove pegs that sit on top of bricks. */
function clearAround(list, keep) {
  const bricks = list.filter(p => p.w);
  return list.filter(p => {
    if (p.w || (keep && keep(p))) return true;
    return !bricks.some(b => {
      const k = -(b.a || 0) * Math.PI / 180, dx = p.x - b.x, dy = p.y - b.y;
      const lx = dx * Math.cos(k) - dy * Math.sin(k), ly = dx * Math.sin(k) + dy * Math.cos(k);
      return Math.abs(lx) < b.w / 2 + (p.r || 17) + 3 && Math.abs(ly) < b.h / 2 + (p.r || 17) + 3;
    });
  });
}

/** Assemble a level object. */
function level(o) {
  const items = o.items.flat ? o.items.flat(3) : o.items;
  return Object.assign({}, o, { items });
}

module.exports = {
  P3, C, W, H, TAU, rng,
  peg, item, brick, armor, glass, wall, gate, as, pegs, bricksAlong,
  line, ring, arc, ellipse, grid, spiral, wave, heart, starShape, polygon, alongPolygon, flower, pyramid, diamond, word,
  mirror, move, rotateAbout, scaleAbout, spin, slide, orbit, color,
  spreadPick, convert, clean, clearAround, level
};
