/**
 * Benny's P3GL — the three Hyper campaigns, 20 levels each.
 *
 *   Neon Highway    a synthwave road: wheels, traffic, the striped sun (entry)
 *   Starlight Warp  hyperspace: ring tunnels, orbiting moons, warp portals
 *   Quasar Core     a black hole: debris rings, sweeping lasers, armour (hardest)
 *
 * Hyper is about movement: nearly every level has several moving groups.
 * Build: node tools/build-campaigns.cjs hyper --bot --runs 3
 * Everything is deterministic (patterns from levelkit, picks are seeded).
 */
const K = require('../levelkit.cjs');

/* ══ Geometry helpers ═════════════════════════════════════════════════════ */

const D = Math.PI / 180;
const r1 = (v) => Math.round(v * 10) / 10;
const pol = (cx, cy, r, a) => ({ x: cx + Math.cos(a * D) * r, y: cy + Math.sin(a * D) * r });
/** n points evenly round a circle, the first at angle a0 (degrees, 0 = right, 90 = down). */
const ringPts = (cx, cy, r, n, a0) => Array.from({ length: n }, (_, i) => pol(cx, cy, r, (a0 || 0) + 360 * i / n));
/** n points along an arc from a0 to a1, ends included. */
const arcPts = (cx, cy, r, a0, a1, n) => Array.from({ length: n }, (_, i) => pol(cx, cy, r, a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1))));
const linePts = (x1, y1, x2, y2, n) => K.line(x1, y1, x2, y2, n);
/** Points spaced about `sp` apart along a polyline (ends included unless closed). */
function pathPts(pts, sp, closed) {
  const P = closed ? pts.concat([pts[0]]) : pts.slice();
  const seg = [];
  let L = 0;
  for (let i = 1; i < P.length; i++) { const s = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); seg.push(s); L += s; }
  const n = closed ? Math.max(3, Math.round(L / sp)) : Math.max(2, Math.round(L / sp) + 1);
  const out = [];
  for (let k = 0; k < n; k++) {
    let d = closed ? L * k / n : L * k / (n - 1);
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] + 1e-6 || i === seg.length - 1) { const u = seg[i] ? Math.min(1, d / seg[i]) : 0; out.push({ x: P[i].x + (P[i + 1].x - P[i].x) * u, y: P[i].y + (P[i + 1].y - P[i].y) * u }); break; }
      d -= seg[i];
    }
  }
  return out;
}
/** Quadratic bezier sampled finely (feed to pathPts). */
const bez = (a, b, c, n) => Array.from({ length: (n || 60) + 1 }, (_, i) => { const t = i / (n || 60), u = 1 - t; return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, y: u * u * a.y + 2 * u * t * b.y + t * t * c.y }; });
const xy = (arr) => arr.map(p => ({ x: p[0], y: p[1] }));

/* ══ Item helpers ═════════════════════════════════════════════════════════ */

/** Pegs at positions; colour is a name, an array (cycled), or fn(i) → name. */
function P(pos, c, r) {
  return pos.map((p, i) => K.peg(p.x, p.y, typeof c === 'function' ? c(i, p) : Array.isArray(c) ? c[i % c.length] : (c || 'blue'), r || 17));
}
/** Items of type t at positions. */
const A = (pos, t, o) => pos.map(p => Object.assign({ t, x: p.x, y: p.y }, o || {}));
const I = (t, x, y, o) => Object.assign({ t, x, y }, o || {});
/** Change the items at the given indexes into type t (keeps place, size and motion). */
function turn(list, idx, t, o) {
  const set = new Set(idx);
  return list.map((p, i) => {
    if (!set.has(i)) return p;
    const q = Object.assign({}, p, { t }, o || {});
    if (t !== 'peg') delete q.c;
    return q;
  });
}
/** Recolour the pegs at the given indexes. */
const paintAt = (list, idx, c) => { const s = new Set(idx); return list.map((p, i) => (s.has(i) && p.t === 'peg' ? Object.assign({}, p, { c }) : p)); };
/** Recolour every k-th peg starting at `off`. */
const every = (list, k, off, c) => list.map((p, i) => (i % k === off && p.t === 'peg' ? Object.assign({}, p, { c }) : p));
/** Turn n spread-out pegs (filter) into colour or type `into`. */
const spread = (list, n, into, seed, filter) => K.convert(list, n, seed || 5, into, filter || (p => p.t === 'peg'));
/** Bricks tangent round a circle. */
function brickRing(cx, cy, r, n, o, a0) {
  o = o || {};
  return Array.from({ length: n }, (_, i) => {
    const a = (a0 || 0) + i * 360 / n, p = pol(cx, cy, r, a);
    const b = { t: o.t || 'brick', x: p.x, y: p.y, w: o.w || 56, h: o.h || 18, a: ((a + 90) % 360 + 360) % 360 };
    if (b.t === 'brick') b.hp = typeof o.hp === 'function' ? o.hp(i) : (o.hp || 1);
    if (b.t === 'armor') b.hp = o.hp || 1;
    if (b.t === 'gate') b.k = o.k || 'blue';
    return b;
  });
}
/** A straight run of n bricks from (x1,y1) to (x2,y2), turned to follow it. */
const brickRow = (x1, y1, x2, y2, n, o) => K.bricksAlong(linePts(x1, y1, x2, y2, n), Object.assign({ follow: n > 1 }, o || {}));

/* Motion. */
const spin = (list, cx, cy, speed) => list.map(p => Object.assign({}, p, { m: { type: 'rotate', cx, cy, speed } }));
const slide = (list, dx, dy, period, phase) => list.map(p => Object.assign({}, p, { m: { type: 'slide', dx, dy, period, phase: phase || 0 } }));
/** Items orbiting the point (cx, cy) at radius r, evenly phased (item x,y is the orbit centre). */
function orbit(cx, cy, r, speed, items, phase0) {
  return items.map((it, i) => Object.assign({}, it, { x: cx, y: cy, m: { type: 'orbit', r, speed, phase: (((phase0 || 0) + i / items.length) % 1 + 1) % 1 } }));
}
const plate = (w, speed, mode, period) => (mode === 'timed' ? { w, speed, mode, period } : { w, speed, mode: mode || 'bounce' });

/* ══ Settling a level ═════════════════════════════════════════════════════ */

const radOf = (it) => it.r || (it.w ? Math.hypot(it.w, it.h) / 2 * 0.8 : 17);
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9;
  const u = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2));
  return Math.hypot(px - ax - u * vx, py - ay - u * vy);
}
/** Does moving item mv ever come within `gap` of still item s? */
function sweeps(mv, s, gap) {
  const m = mv.m, need = radOf(mv) + radOf(s) + gap;
  if (m.type === 'rotate') return Math.abs(Math.hypot(s.x - m.cx, s.y - m.cy) - Math.hypot(mv.x - m.cx, mv.y - m.cy)) < need;
  if (m.type === 'orbit') return Math.abs(Math.hypot(s.x - mv.x, s.y - mv.y) - m.r) < need;
  return segDist(s.x, s.y, mv.x - m.dx, mv.y - m.dy, mv.x + m.dx, mv.y + m.dy) < need;
}
/**
 * Tidy a level: still pegs are nudged apart (bricks stay where placed), pegs
 * sitting on still bricks are dropped, and any still item that a moving piece
 * would sweep through is removed. Moving groups are spaced by construction.
 */
function settle(items, o) {
  o = o || {};
  const gap = o.gap === undefined ? 4 : o.gap;
  items = items.flat(4).filter(Boolean).map(i => Object.assign({}, i));
  const movers = items.filter(i => i.m);
  let still = items.filter(i => !i.m);
  const bricks = still.filter(i => i.w);
  let pegs = still.filter(i => !i.w);
  if (o.clean !== false) pegs = K.clean(pegs, { pad: o.pad === undefined ? 6 : o.pad });
  still = K.clearAround(bricks.concat(pegs));
  const before = still.length;
  still = still.filter(s => !movers.some(mv => sweeps(mv, s, gap)));
  if (process.env.HYPER_DEBUG && still.length < before) console.log('  settle: removed', before - still.length, 'still items in', o.name || '?');
  for (const it of still.concat(movers)) {
    it.x = r1(it.x); it.y = r1(it.y);
    if (it.a !== undefined) it.a = r1(((it.a % 360) + 360) % 360);
    if (it.m && it.m.cx !== undefined) { it.m.cx = r1(it.m.cx); it.m.cy = r1(it.m.cy); }
  }
  return still.concat(movers);
}
/** Numbers spoken in a sentence ("twenty six", "thirty thousand"). Debug only. */
function spokenNumbers(s) {
  const W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const out = [];
  let cur = null;
  for (const w of s.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/)) {
    if (W[w] !== undefined) { cur = (cur && cur % 10 === 0 && W[w] < 10) ? cur + W[w] : (cur !== null ? (out.push(cur), W[w]) : W[w]); }
    else if (w === 'hundred' && cur !== null) cur *= 100;
    else if (w === 'thousand' && cur !== null) cur *= 1000;
    else if (cur !== null) { out.push(cur); cur = null; }
  }
  if (cur !== null) out.push(cur);
  return out;
}
function L(o) {
  const lv = K.level(Object.assign({}, o, { items: settle(o.items, Object.assign({ name: o.name }, o.settle || {})), settle: undefined }));
  if (process.env.HYPER_DEBUG) {
    if (o.name.length > 24) console.log('  name too long:', o.name);
    if (o.intro.length > 110) console.log('  intro too long (' + o.intro.length + '):', o.name);
    const n = K.P3.levels.normLevel(lv, 'hyper', 0), total = K.P3.levels.goalTotal(n);
    const nums = spokenNumbers(o.intro);
    if (nums.length && !nums.includes(total)) console.log(`  intro numbers ${nums.join(',')} but goal total is ${total}: ${o.name}`);
  }
  return lv;
}

/* ════════════════════════════════════════════════════════════════════════
 * 1. NEON HIGHWAY — the synthwave road. Entry campaign of Hyper.
 * ════════════════════════════════════════════════════════════════════════ */

const NH = [];

// 1 · Hubcap: a spinning wheel with a lit rim over three sliding traffic lanes.
NH.push(() => {
  const cx = 500, cy = 470;
  const rim = P(ringPts(cx, cy, 160, 14, -90), (i) => (i % 2 ? 'purple' : 'orange'), 18);
  let spokes = [];
  for (let s = 0; s < 7; s++) spokes.push(...P([pol(cx, cy, 62, s * 360 / 7 - 64), pol(cx, cy, 108, s * 360 / 7 - 64)], 'teal', 15));
  spokes = turn(spokes, [1, 9], 'zap');
  const lane = (y, n, dx, c) => slide(P(linePts(500 - (n - 1) * 38, y, 500 + (n - 1) * 38, y, n), c), dx, 0, 3.2);
  return L({
    name: 'Ignition', intro: 'Hit the seven orange pegs on the spinning hubcap. Land on the plate to win your ball back.',
    goal: { type: 'color', color: 'orange' }, balls: 10, plate: plate(220, 200, 'catch'),
    items: [spin(rim.concat(spokes), cx, cy, 24), I('bumper', cx, cy, { r: 22 }),
      lane(730, 8, 60, 'blue'), lane(810, 9, -60, 'pink'), lane(890, 8, 60, 'blue'),
      P([...linePts(95, 300, 95, 620, 5), ...linePts(905, 300, 905, 620, 5)], 'purple'),
      P([...linePts(210, 250, 330, 220, 3), ...linePts(670, 220, 790, 250, 3)], 'blue'),
      I('bumper', 160, 690, { r: 20 }), I('bumper', 840, 690, { r: 20 })]
  });
});

// 2 · Vanishing point: a perspective grid racing to the horizon, light streaks rushing out.
NH.push(() => {
  const vx = 500, vy = 340;
  const grid = [];
  [22, 40, 58, 74, 106, 122, 140, 158].forEach(a => {
    for (let k = 0, d = 120; k < 10; k++, d *= 1.34) {
      const p = pol(vx, vy, d, a);
      if (p.x < 50 || p.x > 950 || p.y > 965) break;
      grid.push(K.peg(p.x, p.y, a === 74 || a === 106 ? 'pink' : 'purple', Math.min(20, 12 + k * 1.3)));
    }
  });
  const horizon = P([...linePts(60, vy, 360, vy, 7), ...linePts(640, vy, 940, vy, 7)], 'pink', 13);
  const mtn = P(pathPts(xy([[80, 310], [150, 225], [215, 290], [290, 205], [370, 310]]), 42), 'teal', 13);
  const mountains = mtn.concat(P(mtn.map(p => ({ x: 1000 - p.x, y: p.y })), 'teal', 13));
  const sun = P([...arcPts(vx, vy - 6, 70, 200, 340, 6), ...arcPts(vx, vy - 6, 118, 195, 345, 9)], (i) => (i < 6 ? 'yellow' : 'orange'), 14);
  const streaks = [[31, 0], [49, 0.33], [131, 0.5], [149, 0.83]].map(([a, ph]) => {
    const dv = pol(0, 0, 70, a);
    return slide(P([pol(vx, vy, 290, a), pol(vx, vy, 440, a)], 'teal', 15), dv.x, dv.y, 2.4, ph);
  });
  const dashes = slide(A(linePts(500, 540, 500, 860, 3), 'brick', { w: 16, h: 44, a: 0, hp: 1 }), 0, 24, 1.2);
  let all = grid.concat(horizon, mountains);
  all = turn(all, [10, 33], 'multiball');
  return L({
    name: 'Vanishing Point', intro: 'Break eighty pegs. Light streaks race along the road toward you.',
    goal: { type: 'count', count: 80 }, balls: 10, plate: plate(200, 230),
    items: [all, sun, streaks, dashes, I('extra', 500, 445)]
  });
});

// 3 · Speed bumps: rolling rows of humps with pinball bumpers between them.
NH.push(() => {
  const rows = [300, 470, 640, 810].map((y, i) => slide(P(K.wave(115, 885, y, 24, 3, 13, i % 2 ? Math.PI : 0), i % 2 ? 'pink' : 'purple'), i % 2 ? -45 : 45, 0, 3.0));
  const bumps = [];
  [[385, [200, 400, 600, 800]], [555, [300, 500, 700]], [725, [200, 400, 600, 800]]].forEach(([y, xs]) => xs.forEach(x => bumps.push(I('bumper', x, y, { r: 20 }))));
  let r = rows.flat();
  r = turn(r, [6, 32], 'multiplier');
  r = turn(r, [19], 'extra');
  return L({
    name: 'Speed Bumps', intro: 'New: bumpers never break and fling your ball. Reach twenty thousand points.',
    goal: { type: 'score', score: 20000 }, balls: 10, plate: plate(190, 240),
    items: [r, bumps, P([...linePts(60, 200, 60, 900, 8), ...linePts(940, 200, 940, 900, 8)], 'teal', 14)]
  });
});

// 4 · Green light: GO in pegs. The G pumps, the O spins, the traffic light turns green.
NH.push(() => {
  const g = P(K.word('G', 260, 560, 46), 'teal');
  const o = P(K.word('O', 700, 560, 46), 'teal');
  const G = slide(paintAt(g, [1, 4, 8, 12, 16], 'green'), 0, 22, 2.6);
  const O = spin(paintAt(o, [1, 6, 9, 14], 'green'), 700, 560, 30);
  const light = [K.peg(430, 215, 'red', 21), K.peg(500, 215, 'yellow', 21), K.peg(570, 215, 'green', 21)];
  const start = slide(P(linePts(150, 845, 850, 845, 12), (i) => (i % 2 ? 'blue' : 'purple'), 15), 38, 0, 2.2);
  const start2 = slide(P(linePts(180, 905, 820, 905, 11), (i) => (i % 2 ? 'purple' : 'blue'), 15), -38, 0, 2.2);
  const arcs = turn(P([...arcPts(500, 580, 420, 200, 245, 5), ...arcPts(500, 580, 420, 295, 340, 5)], 'purple', 15), [2, 7], 'zap');
  return L({
    name: 'Green Light', intro: 'New: the timed plate takes turns catching and bouncing. Hit the ten green pegs.',
    goal: { type: 'color', color: 'green' }, balls: 10, plate: plate(200, 240, 'timed', 2.5),
    items: [G, O, light, start, start2, arcs, I('bumper', 110, 720, { r: 20 }), I('bumper', 890, 720, { r: 20 }), I('bumper', 480, 560, { r: 18 })]
  });
});

// 5 · Chevrons: stacked road arrows slide against each other over an oil slick.
NH.push(() => {
  const chev = (cx, y, w, h, n) => pathPts(xy([[cx - w, y + h], [cx, y], [cx + w, y + h]]), (2 * Math.hypot(w, h)) / (n - 1));
  const ch = [250, 400, 550].map((y, i) => slide(P(chev(500, y, 210, 84, 8), i % 2 ? 'pink' : 'purple', 18), i % 2 ? -55 : 55, 0, 2.8));
  const side = (x, dir) => P(pathPts(xy([[x, 700], [x + dir * 100, 790], [x, 880]]), 46), 'teal');
  const left = slide(side(220, -1), 0, 20, 2.4), right = slide(side(780, 1), 0, 20, 2.4, 0.5);
  const slick = A([{ x: 470, y: 790 }, { x: 530, y: 790 }, { x: 500, y: 842 }], 'sludge');
  const rim = P([...linePts(330, 930, 670, 930, 7), ...arcPts(500, 800, 115, 205, 335, 5)], 'blue', 15);
  let c = ch.flat();
  c = turn(c, [3, 20], 'multiball');
  return L({
    name: 'Chevron Run', intro: 'New: oily sludge slows your ball right down. Make a chain of eighteen in one shot.',
    goal: { type: 'chain', chain: 18 }, balls: 10, plate: plate(190, 250),
    items: [c, left, right, slick, rim, P([...linePts(80, 200, 80, 600, 6), ...linePts(920, 200, 920, 600, 6)], 'blue', 15),
      I('bumper', 70, 760, { r: 18 }), I('bumper', 930, 760, { r: 18 })]
  });
});

// 6 · Palm boulevard: two palms frame a spinning sunset; coconut thieves in the fronds.
NH.push(() => {
  const trunk = P(pathPts(bez({ x: 120, y: 960 }, { x: 90, y: 680 }, { x: 175, y: 460 }), 44), 'purple', 15);
  const fr = [];
  [[-150, 0.75], [-115, 1], [-65, 1], [-25, 0.8], [12, 0.6]].forEach(([a, len]) => {
    for (let k = 1; k <= Math.round(4 * len); k++) {
      const p = pol(175, 400, 40 * k * len + 12, a);
      fr.push(K.peg(p.x, p.y + k * k * 4.5, k % 2 ? 'green' : 'teal', 15));
    }
  });
  const leftSide = trunk.concat([I('thief', 158, 432), I('thief', 196, 438)]);
  const sun = spin(P(ringPts(500, 590, 135, 14, -90), (i) => (i % 2 ? 'pink' : 'orange'), 18), 500, 590, 28);
  const core = spin(P(ringPts(500, 590, 62, 6, 0), 'yellow', 16), 500, 590, -40);
  const road = slide(P(linePts(260, 850, 740, 850, 9), 'blue', 15), 42, 0, 3.0);
  const stars = P([...linePts(330, 220, 670, 220, 5), ...linePts(380, 300, 620, 300, 4)], (i) => (i === 2 ? 'orange' : 'purple'), 14);
  return L({
    name: 'Palm Boulevard', intro: 'New: thieves steal a saved power, or points. Hit the eight orange pegs on the sunset.',
    goal: { type: 'color', color: 'orange' }, balls: 10, plate: plate(200, 240, 'timed', 3),
    items: [K.mirror(leftSide), K.mirror(slide(fr, 10, 0, 3.2)), sun, core, I('bumper', 500, 590, { r: 20 }), road,
      turn(stars, [0, 4], 'zap'), P(linePts(300, 930, 700, 930, 6), 'pink', 14)]
  });
});

// 7 · Spike strip: police lights spin round two gems; a spike strip lies across the road.
NH.push(() => {
  const siren = (cx, c, sp) => spin(P(ringPts(cx, 320, 84, 6, -90), c, 17), cx, 320, sp);
  const bar = slide(P(linePts(150, 520, 850, 520, 12), (i) => (i % 2 ? 'purple' : 'pink'), 16), 48, 0, 3.0);
  const strip = slide(linePts(290, 190, 710, 190, 7).map((p, i) => (i % 3 === 1 ? I('spike', p.x, p.y, { r: 14 }) : K.peg(p.x, p.y, 'yellow', 15))), 60, 0, 3.6);
  const stripPegs = A(xy([[232, 770], [768, 770]]), 'spike', { r: 13 });
  const gems = A(xy([[240, 320], [760, 320], [500, 400], [290, 770], [710, 770], [500, 880]]), 'gem', { r: 18 });
  const field = P(K.grid(160, 720, 8, 4, 97, 66, true).filter(p => p.x < 880), (i) => (i % 4 ? 'blue' : 'teal'), 15);
  return L({
    name: 'Spike Strip', intro: 'New: red spikes pop your ball. Collect the six gems and steer clear of the spikes.',
    goal: { type: 'gems' }, balls: 10, plate: plate(200, 240, 'timed', 3),
    items: [siren(240, 'red', 30), siren(760, 'blue', -30), I('bumper', 500, 640, { r: 20 }), bar, strip, stripPegs, gems,
      turn(field, [3, 20], 'multiball'), P([...arcPts(500, 400, 100, 200, 340, 5)], 'teal', 15)]
  });
});

// 8 · Cassette deck: two reels turn together while the tape runs between them.
NH.push(() => {
  const reel = (cx) => [spin(P(ringPts(cx, 510, 96, 9, -90), (i) => (i % 3 ? 'pink' : 'purple'), 17), cx, 510, 42),
    spin(P(ringPts(cx, 510, 44, 6, 0), 'teal', 12), cx, 510, 42), I('bumper', cx, 510, { r: 18 })];
  const box = P(pathPts(xy([[165, 330], [835, 330], [835, 760], [165, 760]]), 62, true), 'blue', 15);
  const tape = slide(P(linePts(330, 680, 670, 680, 6), 'yellow', 14), 22, 0, 1.6);
  const label = P(linePts(500, 430, 500, 590, 3), 'orange', 15);
  const eq = [180, 260, 340, 420, 580, 660, 740, 820].map((x, i) => slide(P([{ x, y: 220 }, { x, y: 265 }], 'teal', 13), 0, 20, 1.4, i / 8));
  const lanes = [slide(P(linePts(230, 850, 770, 850, 8), 'purple', 15), 45, 0, 2.6), slide(P(linePts(260, 920, 740, 920, 7), 'pink', 15), -45, 0, 2.6)];
  return L({
    name: 'Cassette Deck', intro: 'Two reels turn together. Make a chain of twenty six pegs in one shot.',
    goal: { type: 'chain', chain: 26 }, balls: 10, plate: plate(185, 255),
    items: [reel(330), reel(670), turn(box, [3, 14], 'multiball'), tape, label, eq, lanes]
  });
});

// 9 · Retro sun: the striped synthwave sun, its bands sliding like pistons.
NH.push(() => {
  const cx = 500, cy = 470, R = 255;
  const bands = [];
  [-180, -110, -40, 30, 100, 170].forEach((dy, k) => {
    const y = cy + dy, hw = Math.sqrt(R * R - dy * dy);
    const n = Math.max(3, Math.round(2 * hw / 92));
    const w = Math.min(78, 2 * hw / n - 12);
    const row = brickRow(cx - hw + w / 2 + 6, y, cx + hw - w / 2 - 6, y, n, { w, h: 22 - k, hp: (i) => ((k === 2 || k === 3) && i % 2 ? 2 : 1) });
    bands.push(slide(row, k % 2 ? -24 : 24, 0, 3.0));
  });
  const vp = { x: 500, y: 770 };
  const grid = [];
  [16, 38, 62, 118, 142, 164].forEach(a => { for (let d = 90; d < 460; d *= 1.4) { const p = pol(vp.x, vp.y, d, a); if (p.y < 970 && p.x > 50 && p.x < 950) grid.push(K.peg(p.x, p.y, 'purple', 14)); } });
  const horizon = P(linePts(70, 770, 930, 770, 15), 'pink', 13);
  return L({
    name: 'Retro Sun', intro: 'New: bricks take a few hits, and their colour shows how many. Break every brick in the sun.',
    goal: { type: 'bricks' }, balls: 10, plate: plate(200, 220, 'catch'),
    items: [bands, turn(grid, [2, 9, 14], 'blast'), horizon, P([...linePts(80, 200, 80, 640, 6), ...linePts(920, 200, 920, 640, 6)], 'teal', 15)]
  });
});

// 10 · Toll booth: three locked booths; their keys ride a spinning barrier.
NH.push(() => {
  const booth = (x, k) => [
    K.wall(x - 82, 810, 110, 14, 90), K.wall(x + 82, 810, 110, 14, 90),
    K.gate(x, 750, 150, 16, 0, k),
    K.peg(x, 805, 'orange', 20), K.peg(x - 46, 850, 'purple', 13), K.peg(x + 46, 850, 'purple', 13)];
  let ring = spin(P(ringPts(500, 440, 175, 12, -90), (i) => (i % 2 ? 'purple' : 'blue')), 500, 440, 24);
  ring = turn(turn(turn(ring, [0], 'key', { k: 'blue', r: 20 }), [4], 'key', { k: 'pink', r: 20 }), [8], 'key', { k: 'yellow', r: 20 });
  const hub = spin(P(ringPts(500, 440, 72, 6, 30), (i) => (i % 2 ? 'orange' : 'teal'), 17), 500, 440, -30);
  const lane = slide(P(linePts(150, 660, 850, 660, 12), (i) => (i === 2 || i === 9 ? 'orange' : 'pink'), 15), 50, 0, 2.6);
  const sides = P([...linePts(90, 220, 90, 600, 5), ...linePts(910, 220, 910, 600, 5)], 'purple', 15);
  return L({
    name: 'Toll Booth', intro: 'New: hit a key to open the gate of its colour. Hit all eight orange pegs, three are in the booths.',
    goal: { type: 'color', color: 'orange' }, balls: 10, plate: plate(185, 260, 'timed', 2),
    items: [booth(240, 'blue'), booth(500, 'pink'), booth(760, 'yellow'), ring, hub, I('bumper', 500, 440, { r: 20 }), lane,
      turn(sides, [2, 7], 'zap'), P(linePts(110, 940, 890, 940, 2), 'teal')]
  });
});

// 11 · Rush hour: five lanes of traffic, each car a brick on two wheels.
NH.push(() => {
  const car = (x, y) => [K.brick(x, y - 6, 64, 20, 0, 1), K.peg(x - 29, y + 18, 'blue', 10), K.peg(x + 29, y + 18, 'blue', 10)];
  const lanes = [];
  [[290, [250, 520, 790], 120, 3.6, 0], [410, [205, 475, 745], -120, 3.2, 0.3], [530, [300, 570, 840], 110, 3.8, 0.6], [650, [190, 460, 730], -120, 3.0, 0.1], [770, [260, 530, 800], 125, 3.4, 0.8]]
    .forEach(([y, xs, dx, per, ph], li) => {
      let cars = xs.flatMap(x => car(x, y));
      cars = cars.map((c, i) => (c.t === 'peg' && (i + li) % 3 === 1 ? Object.assign({}, c, { c: 'pink' }) : c));
      lanes.push(slide(cars, dx, 0, per, ph));
    });
  const lights = P([...linePts(55, 230, 55, 900, 9), ...linePts(945, 230, 945, 900, 9)], (i) => (i % 2 ? 'yellow' : 'purple'), 14);
  const shr = A(xy([[500, 350], [300, 590], [700, 590]]), 'shrink', { r: 15 });
  const top = P(linePts(280, 200, 720, 200, 7), 'teal', 15);
  const bottom = P(linePts(170, 895, 830, 895, 10), 'teal', 15);
  return L({
    name: 'Rush Hour', intro: 'New: shrinkers make your ball tiny for a shot. Break fifty pegs in the traffic.',
    goal: { type: 'count', count: 50 }, balls: 9, plate: plate(180, 270),
    items: [lanes, turn(lights, [4, 13], 'multiball'), shr, top, turn(bottom, [5], 'extra')]
  });
});

// 12 · Night rider: a neon sports car, wheels spinning, glass windows, gem lights.
NH.push(() => {
  const body = P(pathPts(xy([[190, 560], [300, 540], [400, 455], [610, 455], [725, 545], [830, 565]]), 46), 'pink', 15)
    .concat(P(linePts(205, 655, 830, 655, 2), 'pink', 15));
  const glassW = [K.glass(660, 495, 120, 14, 40), K.glass(345, 495, 112, 14, -42), K.glass(505, 548, 160, 14, 0)];
  const wheel = (cx) => [spin(P(ringPts(cx, 690, 58, 7, -90), (i) => (i % 2 ? 'purple' : 'teal'), 15), cx, 690, 60), I('bumper', cx, 690, { r: 16 })];
  const gems = A(xy([[860, 610], [160, 610], [505, 500], [505, 395], [505, 615]]), 'gem', { r: 18 });
  const speed = [250, 320].map((y, i) => slide(P(linePts(130, y, 270, y, 3).concat(linePts(730, y, 870, y, 3)), 'teal', 13), 60, 0, 1.6, i * 0.5));
  const road = slide(A(linePts(170, 860, 830, 860, 6), 'brick', { w: 70, h: 14, a: 0, hp: 1 }), 24, 0, 1.2);
  const kerb = P(linePts(90, 935, 910, 935, 12), (i) => (i % 2 ? 'red' : 'purple'), 14);
  return L({
    name: 'Night Rider', intro: 'New: glass shatters at a touch and lets your ball through. Grab the five gems on the car.',
    goal: { type: 'gems' }, balls: 9, plate: plate(175, 270, 'timed', 2),
    items: [turn(body, [5, 11], 'zap'), glassW, wheel(310), wheel(710), gems, speed, road, kerb,
      I('bumper', 100, 440, { r: 20 }), I('bumper', 900, 440, { r: 20 })]
  });
});

// 13 · Equalizer: nine bars pump to the beat over two speaker cones.
NH.push(() => {
  const bars = [];
  for (let i = 0; i < 9; i++) {
    const x = 140 + i * 90;
    bars.push(slide(P(linePts(x, 470, x, 620, 4), i % 2 ? 'pink' : 'purple', 15), 0, 55, 1.8, (i * 0.11) % 1));
  }
  const speaker = (cx) => [spin(P(ringPts(cx, 840, 82, 8, -90), (i) => (i % 2 ? 'teal' : 'blue'), 16), cx, 840, 36), I('bumper', cx, 840, { r: 22 })];
  const tops = A(xy([[230, 250], [390, 230], [610, 230], [770, 250]]), 'bumper', { r: 20 });
  let b = bars.flat();
  b = turn(b, [3, 32], 'multiplier');
  b = turn(b, [17], 'extra');
  return L({
    name: 'Equalizer', intro: 'The bars pump to the beat. Reach fifteen thousand points.',
    goal: { type: 'score', score: 15000 }, balls: 9, plate: plate(170, 280),
    items: [b, speaker(260), speaker(740), tops, P(linePts(500, 780, 500, 920, 3), 'yellow', 15), P([...linePts(80, 300, 80, 700, 5), ...linePts(920, 300, 920, 700, 5)], 'teal', 14)]
  });
});

// 14 · Cloverleaf: four looping ramps; portals link opposite loops.
NH.push(() => {
  const loop = (cx, cy, sp, p, oi) => [spin(P(ringPts(cx, cy, 108, 9, -90), (i) => (oi.includes(i) ? 'orange' : i % 2 ? 'purple' : 'blue'), 17), cx, cy, sp), I('portal', cx, cy, { r: 22, p })];
  const cross = P([...linePts(500, 300, 500, 780, 7), ...linePts(340, 540, 440, 540, 2), ...linePts(560, 540, 660, 540, 2)], 'teal', 15);
  return L({
    name: 'Cloverleaf', intro: 'New: portals send your ball to the matching portal. Hit the ten orange pegs on the loops.',
    goal: { type: 'color', color: 'orange' }, balls: 10, plate: plate(170, 280, 'timed', 2.5),
    items: [loop(290, 340, 34, 0, [0, 4]), loop(710, 340, -34, 1, [2, 6]), loop(290, 740, -34, 1, [1, 5, 8]), loop(710, 740, 34, 0, [3, 7, 0]), turn(cross, [3, 8], 'zap'),
      P([...linePts(60, 220, 60, 880, 8), ...linePts(940, 220, 940, 880, 8)], 'pink', 14), I('bumper', 500, 200, { r: 20 }), I('bumper', 500, 900, { r: 20 })]
  });
});

// 15 · Tachometer: a gauge dial with a sweeping needle; push it into the red.
NH.push(() => {
  const cx = 500, cy = 690;
  const dial = P(arcPts(cx, cy, 330, 195, 345, 15), (i) => (i >= 11 ? 'red' : i % 2 ? 'purple' : 'blue'), 17);
  const ticks = P(arcPts(cx, cy, 400, 205, 335, 7), 'teal', 14);
  const needle = spin([K.wall(cx + 135, cy, 210, 14, 0), ...P(linePts(cx + 70, cy - 30, cx + 230, cy - 30, 3), 'yellow', 13), ...P(linePts(cx - 70, cy + 30, cx - 230, cy + 30, 3), 'yellow', 13)], cx, cy, 40);
  const lower = P(arcPts(cx, cy, 320, 25, 155, 7).filter(p => p.y < 975), 'pink', 15);
  return L({
    name: 'Tachometer', intro: 'Clear every peg on the dial. The needle sweeps the whole gauge.',
    goal: { type: 'clear' }, balls: 10, plate: plate(160, 290),
    items: [turn(turn(dial, [3, 11], 'multiball'), [6, 13], 'zap'), turn(ticks, [3], 'fire'), needle, I('bumper', cx, cy, { r: 24 }), lower]
  });
});

// 16 · Neon skyline: towers with lantern windows, a sliding billboard, a turning moon.
NH.push(() => {
  const towers = [];
  const lan = [];
  [[150, 600], [290, 500], [430, 660], [570, 450], [710, 620], [850, 530]].forEach(([x, top], ti) => {
    const n = Math.round((940 - top) / 66) + 1;
    towers.push(...P([...linePts(x - 36, top, x - 36, 940, n), ...linePts(x + 36, top, x + 36, 940, n)], ti % 2 ? 'purple' : 'blue', 13));
    lan.push(I('lantern', x, top - 34, { r: 17 }));
  });
  const lanterns = lan.concat([I('lantern', 360, 380, { r: 17 }), I('lantern', 640, 360, { r: 17 })]);
  const billboard = slide([K.brick(500, 290, 120, 22, 0, 2), K.peg(440, 325, 'yellow', 12), K.peg(560, 325, 'yellow', 12)], 150, 0, 4.0);
  const moon = spin(P(ringPts(840, 230, 52, 6, 0), 'yellow', 14), 840, 230, -50);
  const sky = slide(P(linePts(180, 210, 330, 210, 3), 'teal', 14), 40, 0, 2.6);
  return L({
    name: 'Neon Skyline', intro: 'Light all eight lanterns over the city. Lit lanterns keep glowing.',
    goal: { type: 'lanterns' }, balls: 8, plate: plate(155, 300, 'timed', 1.8),
    items: [turn(towers, [9, 30], 'multiball'), lanterns, billboard, moon, I('bumper', 840, 230, { r: 16 }), sky]
  });
});

// 17 · Loop the loop: a giant brick loop with gaps, a counter-spinning ring inside.
NH.push(() => {
  const cx = 500, cy = 545;
  const loop = spin(brickRing(cx, cy, 300, 24, { w: 62, h: 18, hp: 1 }).filter((b, i) => i % 8 !== 0), cx, cy, 30);
  const ring = turn(spin(P(ringPts(cx, cy, 200, 14, 0), (i) => (i % 2 ? 'pink' : 'purple'), 17), cx, cy, -42), [3, 10], 'multiball');
  const core = spin(P(ringPts(cx, cy, 100, 8, 22), (i) => (i % 2 ? 'teal' : 'blue'), 16), cx, cy, 55);
  const corners = P([...arcPts(cx, cy, 395, 200, 250, 4), ...arcPts(cx, cy, 395, 290, 340, 4), ...arcPts(cx, cy, 395, 30, 60, 2), ...arcPts(cx, cy, 395, 120, 150, 2)].filter(p => p.y > 160 && p.y < 975 && p.x > 45 && p.x < 955), 'teal', 15);
  return L({
    name: 'Loop the Loop', intro: 'Get inside the loop and make a chain of twenty in one shot.',
    goal: { type: 'chain', chain: 20 }, balls: 9, plate: plate(160, 300),
    items: [loop, ring, turn(core, [0], 'fire'), I('bumper', cx, cy, { r: 24 }), corners]
  });
});

// 18 · Night bridge: a suspension bridge; towers and deck are bricks, traffic rides above.
NH.push(() => {
  const towers = [210, 790].flatMap(x => brickRow(x, 450, x, 850, 4, { w: 66, h: 24, hp: 1 }).map(b => Object.assign(b, { a: 90 })));
  const deck = brickRow(110, 700, 890, 700, 11, { w: 64, h: 18, hp: (i) => (i % 4 === 2 ? 2 : 1) }).filter(b => Math.abs(b.x - 210) > 40 && Math.abs(b.x - 790) > 40);
  const cable = P(pathPts(bez({ x: 210, y: 350 }, { x: 500, y: 760 }, { x: 790, y: 350 }), 52).filter(p => p.y < 610 && Math.abs(p.x - 210) > 30 && Math.abs(p.x - 790) > 30), 'pink', 14);
  const sideC = P([...pathPts(bez({ x: 210, y: 350 }, { x: 120, y: 470 }, { x: 70, y: 640 }), 50), ...pathPts(bez({ x: 790, y: 350 }, { x: 880, y: 470 }, { x: 930, y: 640 }), 50)].filter(p => Math.hypot(p.x - 210, p.y - 350) > 45 && Math.hypot(p.x - 790, p.y - 350) > 45), 'pink', 14);
  const traffic = slide(P(linePts(330, 655, 670, 655, 5), 'yellow', 14), 70, 0, 2.2);
  const under = slide(P(linePts(300, 785, 700, 785, 6), 'teal', 14), -60, 0, 2.0);
  const armor = [K.armor(210, 360, 70, 24, 0, 1), K.armor(790, 360, 70, 24, 0, 1)];
  const water = P(linePts(120, 935, 880, 935, 11), 'blue', 14);
  return L({
    name: 'Night Bridge', intro: 'Break every brick in the bridge. The armour on the towers needs a blast or fire.',
    goal: { type: 'bricks' }, balls: 9, plate: plate(150, 310, 'timed', 1.8),
    items: [towers, deck, armor, turn(cable, [1, 6], 'blast'), turn(sideC, [3], 'fire'), traffic, under, water, A(xy([[285, 330], [715, 330]]), 'zap'), I('bumper', 500, 250, { r: 20 })]
  });
});

// 19 · Synthwave: three great sine waves of pegs rolling across the board.
NH.push(() => {
  const waves = [[300, 70, 0, 'purple', 60, 2.6], [520, 80, Math.PI / 2, 'pink', -60, 2.2], [740, 70, Math.PI, 'teal', 60, 2.0]].map(([y, amp, ph, c, dx, per], wi) => {
    const w = P(K.wave(160, 840, y, amp, 1.5, 11, ph), (i) => (i % 4 === 1 + wi % 2 ? 'orange' : c), 16);
    return slide(w, dx, 0, per);
  });
  const posts = A(xy([[60, 420], [940, 420], [60, 630], [940, 630]]), 'spike', { r: 14 });
  const bot = P(linePts(260, 915, 740, 915, 7), 'blue', 15);
  return L({
    name: 'Synthwave', intro: 'Hit the nine orange pegs riding the three rolling waves.',
    goal: { type: 'color', color: 'orange' }, balls: 9, plate: plate(150, 320), gravity: 1.1, speed: 1.05,
    items: [waves, posts, turn(bot, [3], 'multiball'), I('bumper', 500, 205, { r: 20 }), I('bumper', 90, 200, { r: 18 }), I('bumper', 910, 200, { r: 18 })]
  });
});

// 20 · Finish line: the chequered flag ripples under a banner, spike posts at the gate.
NH.push(() => {
  const rows = [];
  const orange = [[0, 1], [0, 7], [1, 4], [2, 0], [2, 8], [3, 3], [3, 5], [4, 1], [4, 7], [5, 4]];
  for (let r = 0; r < 6; r++) {
    const y = 410 + r * 58;
    const row = P(linePts(260, y, 740, y, 9), (i) => (orange.some(o => o[0] === r && o[1] === i) ? 'orange' : (i + r) % 2 ? 'purple' : 'blue'), 16);
    rows.push(slide(row, r % 2 ? -30 : 30, 0, 2.2));
  }
  const banner = slide(brickRow(310, 260, 690, 260, 6, { w: 58, h: 20, hp: 2 }), 60, 0, 3.0);
  const poles = [K.wall(180, 560, 380, 16, 90), K.wall(820, 560, 380, 16, 90)];
  const spikes = A(xy([[180, 345], [820, 345], [400, 830], [600, 830]]), 'spike', { r: 15 });
  const bulbs = spin(P(ringPts(110, 820, 50, 5, -90), 'yellow', 13), 110, 820, 70).concat(spin(P(ringPts(890, 820, 50, 5, -90), 'yellow', 13), 890, 820, -70));
  const low = P(linePts(260, 925, 740, 925, 7), 'teal', 15);
  let flag = rows.flat();
  flag = turn(flag, [11, 42], 'zap');
  return L({
    name: 'Finish Line', intro: 'The flag ripples in the wind. Hit the ten orange squares to take the chequered flag.',
    goal: { type: 'color', color: 'orange' }, balls: 9, plate: plate(140, 340, 'timed', 2), gravity: 1.1, speed: 1.05,
    items: [flag, banner, poles, spikes, bulbs, turn(low, [3], 'multiball'), I('bumper', 500, 870, { r: 20 })]
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * 2. STARLIGHT WARP — hyperspace: tunnels, moons, warp gates. Harder start.
 * ════════════════════════════════════════════════════════════════════════ */

const SW = [];

/** Short vertical streaks at the board edges, twinkling up and down. */
const edgeStreaks = (ys, c) => ys.flatMap((y, i) => [slide(P([{ x: 70, y }], c || 'teal', 13), 0, 22, 1.6, i * 0.23 % 1), slide(P([{ x: 930, y }], c || 'teal', 13), 0, 22, 1.6, (i * 0.23 + 0.5) % 1)]);

// 1 · Warp tunnel: three rings turning against each other, the way into hyperspace.
SW.push(() => {
  const cx = 500, cy = 550;
  const a = spin(P(ringPts(cx, cy, 112, 8, -90), (i) => (i === 4 ? 'orange' : 'teal'), 16), cx, cy, 32);
  const b = spin(P(ringPts(cx, cy, 205, 13, -90), (i) => (i % 4 === 1 ? 'orange' : 'blue'), 17), cx, cy, -24);
  const c = spin(P(ringPts(cx, cy, 300, 18, -90), (i) => (i % 4 === 2 ? 'orange' : 'purple'), 17), cx, cy, 16);
  return L({
    name: 'Warp Tunnel', intro: 'Into hyperspace. Hit the eight orange pegs on the turning rings.',
    goal: { type: 'color', color: 'orange' }, balls: 10, plate: plate(190, 250),
    items: [a, turn(b, [3, 10], 'zap'), turn(c, [8], 'multiball'), I('bumper', cx, cy, { r: 24 }), edgeStreaks([260, 420, 680, 840]),
      P([...ringPts(110, 200, 0, 1), { x: 200, y: 180 }, { x: 800, y: 180 }, { x: 890, y: 230 }, { x: 110, y: 230 }, { x: 140, y: 920 }, { x: 860, y: 920 }, { x: 230, y: 960 }, { x: 770, y: 960 }], 'purple', 13)]
  });
});

// 2 · Comet tail: a great comet sweeps back and forth, two small ones cross it.
SW.push(() => {
  const comet = (hx, hy, ang, n, c, big) => {
    const out = [I('bumper', hx, hy, { r: big ? 24 : 18 })];
    let d = big ? 24 : 18, r = big ? 17 : 15;
    for (let k = 0; k < n; k++) {
      const nr = Math.max(10, r - (big ? 1 : 1.2));
      d += r + nr + 26;
      const p = pol(hx, hy, d, ang);
      out.push(K.peg(p.x, p.y, c, nr));
      r = nr;
    }
    return out;
  };
  const main = slide(comet(660, 640, 218, 7, 'teal', true), 64, 50, 3.4);
  const s1 = slide(comet(250, 760, -40, 4, 'pink'), -50, 42, 2.6, 0.3);
  const s2 = slide(comet(800, 330, 150, 4, 'purple'), 50, -29, 2.8, 0.6);
  const dust = P(K.grid(110, 210, 9, 8, 100, 96, true).filter(p => p.x < 920), (i) => ['blue', 'purple', 'blue', 'teal'][i % 4], 14);
  return L({
    name: 'Comet Tail', intro: 'A great comet sweeps across the stars. Break fifty pegs.',
    goal: { type: 'count', count: 50 }, balls: 10, plate: plate(190, 250, 'timed', 2.5),
    items: [main, s1, s2, turn(turn(dust, [5, 40], 'multiball'), [22], 'zap')]
  });
});

// 3 · Twinkle field: a slow star turns in a field of twinkling clusters; thieves hide among them.
SW.push(() => {
  const cx = 500, cy = 540;
  const star = spin(P(K.starShape(cx, cy, 130, 56, 5, 15), (i) => (i % 3 === 0 ? 'yellow' : 'orange'), 16), cx, cy, 22);
  const clusters = [];
  const spots = [[180, 250], [400, 210], [600, 210], [820, 250], [150, 470], [850, 470], [170, 700], [830, 700], [330, 860], [670, 860], [500, 900], [330, 330], [670, 330]];
  spots.forEach(([x, y], i) => {
    const pts = [{ x, y: y - 30 }, { x: x - 30, y }, { x: x + 30, y }, { x, y: y + 30 }];
    clusters.push(slide(P(pts, ['blue', 'teal', 'purple'][i % 3], 12).concat(i % 4 === 1 ? [I('thief', x, y, { r: 12 })] : [K.peg(x, y, 'pink', 10)]), 0, 18, 1.8, (i * 0.17) % 1));
  });
  return L({
    name: 'Twinkle Field', intro: 'New: thieves steal a saved power, or points. Make a chain of eighteen in one shot.',
    goal: { type: 'chain', chain: 18 }, balls: 10, plate: plate(185, 255),
    items: [turn(star, [2, 9], 'multiball'), I('bumper', cx, cy, { r: 22 }), clusters]
  });
});

// 4 · Binary stars: two great stars turning against each other.
SW.push(() => {
  const st = (cx, cy, sp, c) => spin(P(K.starShape(cx, cy, 140, 62, 5, 18), (i) => (i % 18 === 0 || i % 18 === 7 || i % 18 === 14 ? 'orange' : c), 16), cx, cy, sp);
  const A1 = st(300, 420, 26, 'purple'), B1 = st(700, 660, -26, 'teal');
  const wind = [slide(P(linePts(560, 230, 900, 230, 5), 'blue', 14), 30, 0, 2.4), slide(P(linePts(100, 860, 440, 860, 5), 'blue', 14), -30, 0, 2.4)];
  const dust = P([{ x: 120, y: 650 }, { x: 160, y: 760 }, { x: 260, y: 700 }, { x: 860, y: 380 }, { x: 760, y: 330 }, { x: 900, y: 470 }, { x: 500, y: 540 }], 'pink', 14);
  return L({
    name: 'Binary Stars', intro: 'Two stars turn against each other. Hit the six orange pegs on their points.',
    goal: { type: 'color', color: 'orange' }, balls: 10, plate: plate(185, 260, 'timed', 2),
    items: [A1, B1, I('bumper', 300, 420, { r: 22 }), I('bumper', 700, 660, { r: 22 }), wind, turn(dust, [6], 'zap'), turn(P([{ x: 870, y: 900 }, { x: 130, y: 220 }], 'blue'), [0, 1], 'multiball')]
  });
});

// 5 · Warp gates: gems sealed in steel pods; orbiting portals warp you inside.
SW.push(() => {
  const pod = (cx, cy, p) => [
    ...A(arcPts(cx, cy, 64, 150, 390, 9), 'steel', { r: 14 }),
    I('portal', cx, cy - 16, { r: 20, p }), I('gem', cx, cy + 26, { r: 17 })];
  const gate = (cx, cy, p, ph) => [Object.assign(I('portal', cx, cy, { r: 22, p }), { m: { type: 'orbit', r: 52, speed: 70, phase: ph } })];
  const ring = spin(P(ringPts(500, 640, 110, 9, -90), (i) => (i % 2 ? 'purple' : 'blue'), 16), 500, 640, -30);
  const field = P([...linePts(150, 880, 850, 880, 9), ...linePts(110, 560, 110, 760, 3), ...linePts(890, 560, 890, 760, 3)], 'teal', 15);
  return L({
    name: 'Warp Gates', intro: 'New: portals warp your ball to their twin. Reach the gems sealed in the pods. Five gems.',
    goal: { type: 'gems' }, balls: 10, plate: plate(200, 230, 'catch'),
    items: [pod(220, 340, 0), pod(500, 300, 1), pod(780, 340, 2), gate(260, 620, 0, 0), gate(740, 620, 1, 0.5), gate(500, 820, 2, 0.25),
      ring, I('gem', 500, 640, { r: 18 }), I('gem', 500, 470, { r: 17 }), turn(field, [4], 'multiball'), I('bumper', 330, 470, { r: 18 }), I('bumper', 670, 470, { r: 18 })]
  });
});

// 6 · Moon dance: three planets, each circled by gem moons and one spiked moon.
SW.push(() => {
  const planet = (cx, cy, sp, ph) => [
    I('bumper', cx, cy, { r: 24 }), ...P(ringPts(cx, cy, 50, 6, 30), 'purple', 12),
    ...orbit(cx, cy, 104, sp, [I('gem', 0, 0, { r: 16 }), K.peg(0, 0, 'teal', 15), I('spike', 0, 0, { r: 13 }), I('gem', 0, 0, { r: 16 })], ph)];
  const belt = slide(P(linePts(150, 905, 850, 905, 10), 'blue', 14), 30, 0, 2.6);
  return L({
    name: 'Moon Dance', intro: 'New: spikes pop your ball. Collect the six gem moons, but dodge the spiked ones.',
    goal: { type: 'gems' }, balls: 10, plate: plate(185, 260, 'timed', 2.5),
    items: [planet(250, 330, 70, 0), planet(750, 330, -70, 0.12), planet(500, 650, 60, 0.3), belt,
      turn(P([{ x: 500, y: 330 }, { x: 140, y: 620 }, { x: 860, y: 620 }, { x: 500, y: 210 }], 'pink', 15), [0], 'multiball')]
  });
});

// 7 · Spiral galaxy: two arms wheel round a bright core.
SW.push(() => {
  const cx = 500, cy = 560;
  const arms = [];
  [0, 180].forEach((a0, k) => arms.push(...P(pathPts(K.spiral(cx, cy, 60, 330, 0.95, 200, a0), 50), (i) => (i % 5 === 3 ? 'yellow' : k ? 'teal' : 'purple'), 16)));
  const galaxy = spin(arms, cx, cy, 24);
  const core = [I('bumper', cx, cy, { r: 24 })];
  const halo = P([{ x: 100, y: 190 }, { x: 900, y: 190 }, { x: 80, y: 940 }, { x: 920, y: 940 }, { x: 140, y: 280 }, { x: 860, y: 280 }], 'pink', 14);
  return L({
    name: 'Spiral Galaxy', intro: 'The galaxy wheels round its core. Break forty five pegs.',
    goal: { type: 'count', count: 45 }, balls: 9, plate: plate(180, 265),
    items: [turn(galaxy, [6, 24], 'multiball'), core, halo, edgeStreaks([420, 560, 700], 'purple')]
  });
});

// 8 · Asteroid belt: a river of tumbling rocks drifts across the board.
SW.push(() => {
  const rocks = [];
  const R = K.rng('asteroids');
  for (let k = 0; k < 18; k++) {
    const u = (k + 0.5) / 18;
    const x = 120 + u * 760, y = 820 - u * 520 + (k % 3 - 1) * 70;
    const ang = 25 + Math.floor(R() * 4) * 35;
    rocks.push(slide([K.brick(x, y, 46 + (k % 3) * 8, 22, ang, k % 4 === 1 ? 2 : 1)], (k % 2 ? 1 : -1) * 36, (k % 2 ? -1 : 1) * 24, 2.2 + (k % 4) * 0.4, (k * 0.13) % 1));
  }
  const pebbles = P([...linePts(110, 560, 380, 290, 5), ...linePts(620, 940, 900, 660, 5)], 'purple', 14);
  const far = P([{ x: 170, y: 220 }, { x: 300, y: 190 }, { x: 830, y: 230 }, { x: 700, y: 200 }, { x: 180, y: 900 }, { x: 330, y: 940 }], 'teal', 14);
  return L({
    name: 'Asteroid Belt', intro: 'A river of rocks drifts past. Break every rock in the belt.',
    goal: { type: 'bricks' }, balls: 10, plate: plate(185, 260, 'timed', 2),
    items: [rocks, turn(pebbles, [2, 7], 'blast'), turn(far, [1, 3], 'zap'), I('bumper', 820, 520, { r: 22 }), I('bumper', 180, 560, { r: 22 })]
  });
});

// 9 · Nebula: three glowing clouds breathe in and out, sticky gas at their hearts.
SW.push(() => {
  const cloud = (cx, cy, rx, ry, c, dx, dy, ph, sl) => {
    const pts = K.grid(cx - rx, cy - ry, 9, 7, 52, 46, true).filter(p => ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 < 1);
    const items = P(pts, c, 14).map((p, i) => (sl.includes(i) ? I('sludge', p.x, p.y, { r: 14 }) : p));
    return slide(items, dx, dy, 3.0, ph);
  };
  const a = cloud(270, 330, 170, 120, 'pink', 18, 10, 0, [9]);
  const b = cloud(730, 400, 170, 120, 'purple', -18, 10, 0.5, [8]);
  const c = cloud(480, 760, 200, 120, 'teal', 0, -16, 0.25, [10]);
  return L({
    name: 'Nebula', intro: 'New: sticky gas slows your ball right down. Reach twenty thousand points.',
    goal: { type: 'score', score: 20000 }, balls: 10, plate: plate(185, 260),
    items: [turn(a, [3], 'multiplier'), turn(b, [12], 'multiplier'), turn(c, [5], 'extra'), I('bumper', 500, 560, { r: 22 }), I('bumper', 90, 600, { r: 20 }), I('bumper', 910, 640, { r: 20 })]
  });
});

// 10 · Pulsar: a spinning neutron star sweeps two beams through a ring of bumpers.
SW.push(() => {
  const cx = 500, cy = 560;
  const beams = spin([...P(linePts(cx + 70, cy, cx + 290, cy, 5), (i) => (i % 2 ? 'orange' : 'teal'), 16), ...P(linePts(cx - 70, cy, cx - 290, cy, 5), (i) => (i % 2 ? 'orange' : 'teal'), 16)], cx, cy, 34);
  const core = spin(P(ringPts(cx, cy, 40, 4, 45), 'yellow', 12), cx, cy, -90);
  const ring = A(ringPts(cx, cy, 360, 12, 15).filter(p => p.y > 170 && p.y < 975), 'bumper', { r: 18 });
  const outer = P([...ringPts(cx, cy, 405, 16, 0)].filter(p => p.y > 160 && p.y < 975 && p.x > 45 && p.x < 955), (i) => (i % 3 === 1 ? 'orange' : 'purple'), 15);
  return L({
    name: 'Pulsar', intro: 'Twin beams sweep from the pulsar. Hit every orange peg, ten in all.',
    goal: { type: 'color', color: 'orange' }, balls: 9, plate: plate(180, 270, 'timed', 2),
    items: [beams, core, I('bumper', cx, cy, { r: 20 }), ring, turn(outer, [0, 6], 'zap')]
  });
});

// 11 · Constellations: the whole sky turns; light the lanterns at the stars.
SW.push(() => {
  const cx = 500, cy = 560;
  const stars = xy([[300, 330], [380, 300], [460, 320], [520, 380], [610, 400], [640, 480], [560, 500],
    [270, 640], [330, 720], [400, 660], [470, 740], [540, 670], [700, 700], [720, 800], [640, 820]]);
  const lanternAt = [0, 3, 5, 7, 10, 12, 14];
  const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3], [7, 8], [8, 9], [9, 10], [10, 11], [12, 13], [13, 14]];
  const lines = [];
  links.forEach(([i, j]) => {
    const a = stars[i], b = stars[j], d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(0, Math.floor(d / 46) - 1);
    for (let k = 1; k <= n; k++) lines.push(K.peg(a.x + (b.x - a.x) * k / (n + 1), a.y + (b.y - a.y) * k / (n + 1), 'blue', 9));
  });
  const sky = stars.map((p, i) => (lanternAt.includes(i) ? I('lantern', p.x, p.y, { r: 17 }) : K.peg(p.x, p.y, 'yellow', 14)));
  const rot = spin(sky.concat(lines), cx, cy, 16);
  const corners = [slide(P(linePts(80, 200, 180, 200, 2), 'teal', 13), 30, 0, 2.0), slide(P(linePts(820, 200, 920, 200, 2), 'teal', 13), -30, 0, 2.0)];
  return L({
    name: 'Constellations', intro: 'The night sky turns. Light all seven lanterns among the stars.',
    goal: { type: 'lanterns' }, balls: 9, plate: plate(175, 275, 'timed', 2),
    items: [turn(rot, [2, 8], 'multiball'), corners, I('bumper', 120, 900, { r: 20 }), I('bumper', 880, 900, { r: 20 }), I('bumper', 500, 560, { r: 14 })]
  });
});

// 12 · Ringed giant: a gas giant inside its tilted ring, moons racing round.
SW.push(() => {
  const cx = 500, cy = 540;
  const ringE = K.ellipse(cx, cy, 255, 66, 26, -14);
  const disc = K.grid(cx - 120, cy - 120, 7, 7, 40, 38, true).filter(p => Math.hypot(p.x - cx, p.y - cy) < 110 && !ringE.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 34));
  const planet = P(disc, (i) => ['purple', 'pink', 'purple', 'orange'][Math.floor(i / 4) % 4], 13);
  const gems = [I('gem', cx - 40, cy - 70, { r: 15 }), I('gem', cx + 40, cy + 72, { r: 15 })];
  const moons = orbit(cx, cy, 335, 40, [I('gem', 0, 0, { r: 17 }), K.peg(0, 0, 'teal', 16), I('gem', 0, 0, { r: 17 }), K.peg(0, 0, 'teal', 16), I('gem', 0, 0, { r: 17 }), K.peg(0, 0, 'teal', 16)]);
  return L({
    name: 'Ringed Giant', intro: 'Moons race round the ringed giant. Collect all five gems.',
    goal: { type: 'gems' }, balls: 9, plate: plate(175, 275),
    items: [planet.filter(p => !gems.some(g => Math.hypot(g.x - p.x, g.y - p.y) < 30)), gems, turn(P(ringE, 'yellow', 13), [4, 17], 'zap'), moons,
      P([{ x: 90, y: 190 }, { x: 910, y: 190 }, { x: 80, y: 950 }, { x: 920, y: 950 }], 'blue', 14)]
  });
});

// 13 · Hyperjump: stars stream out from the centre as you jump to light speed.
SW.push(() => {
  const cx = 500, cy = 560;
  const streams = [];
  for (let k = 0; k < 14; k++) {
    const a = k * 360 / 14 + 8, dv = pol(0, 0, 36, a);
    streams.push(slide(P([pol(cx, cy, 150, a), pol(cx, cy, 210, a), pol(cx, cy, 270, a)].map((p, i) => Object.assign(p, {})), (i) => (i === 2 ? 'teal' : 'blue'), 14), dv.x, dv.y, 1.6, (k % 2) * 0.5));
  }
  const hub = spin(P(ringPts(cx, cy, 70, 7, 0), 'yellow', 14), cx, cy, -60);
  const gatesP = [I('portal', 110, 210, { r: 22, p: 0 }), I('portal', 890, 900, { r: 22, p: 0 }), I('portal', 890, 210, { r: 22, p: 1 }), I('portal', 110, 900, { r: 22, p: 1 })];
  return L({
    name: 'Hyperjump', intro: 'Stars stream past at light speed. Make a chain of twenty four in one shot.',
    goal: { type: 'chain', chain: 24 }, balls: 9, plate: plate(170, 280),
    items: [turn(streams.flat(), [7, 28], 'multiball'), turn(hub, [0], 'zap'), I('bumper', cx, cy, { r: 20 }), gatesP]
  });
});

// 14 · Gravity well: a black hole at the centre, a debris ring turning around it.
SW.push(() => {
  const cx = 500, cy = 560;
  const debris = spin(P(ringPts(cx, cy, 220, 14, -90), (i) => (i % 3 === 0 ? 'orange' : 'purple'), 16), cx, cy, 30);
  const outer = spin(P(ringPts(cx, cy, 330, 20, -81), (i) => (i % 4 === 2 ? 'orange' : 'blue'), 16), cx, cy, -20);
  return L({
    name: 'Gravity Well', intro: 'New: black holes pull your ball in and swallow it. Hit the ten orange pegs.',
    goal: { type: 'color', color: 'orange' }, balls: 9, plate: plate(170, 285, 'timed', 2),
    items: [I('hole', cx, cy, { r: 26 }), turn(debris, [4, 11], 'zap'), turn(outer, [0], 'multiball'),
      P([{ x: 90, y: 190 }, { x: 910, y: 190 }, { x: 80, y: 950 }, { x: 920, y: 950 }, { x: 70, y: 560 }, { x: 930, y: 560 }], 'teal', 15)]
  });
});

// 15 · Meteor shower: meteors streak down in diagonal lanes; shrinkers among them.
SW.push(() => {
  const lanes = [];
  const meteor = (x, y, c) => [K.peg(x, y, c, 17), K.peg(x - 38, y - 26, c, 13), K.peg(x - 70, y - 48, c, 10)];
  [[250, 260], [560, 230], [850, 270], [180, 470], [480, 450], [780, 480], [300, 680], [620, 660], [900, 700], [230, 880], [540, 870], [820, 900]].forEach(([x, y], k) => {
    let m = meteor(x, y, ['pink', 'purple', 'teal'][k % 3]);
    if (k === 4 || k === 7 || k === 10) m = turn(m, [0], 'shrink');
    lanes.push(slide(m, 40, 28, 1.9 + (k % 3) * 0.3, (k * 0.29) % 1));
  });
  return L({
    name: 'Meteor Shower', intro: 'New: shrinkers make your ball tiny for a shot. Break twenty eight pegs.',
    goal: { type: 'count', count: 28 }, balls: 9, plate: plate(170, 285),
    items: [turn(lanes.flat(), [3, 22], 'multiball'), I('bumper', 400, 340, { r: 20 }), I('bumper', 680, 560, { r: 20 }), I('bumper', 380, 770, { r: 20 })]
  });
});

// 16 · Orrery: planets on four orbits round a bright sun, each orbit a dashed track.
SW.push(() => {
  const cx = 500, cy = 560;
  const tracks = [150, 232, 314].flatMap((r, k) => P(ringPts(cx, cy, r, Math.round(2 * Math.PI * r / 50), k * 7).filter((p, i) => i % 3 !== 2 && p.y > 165), 'blue', 10));
  const planets = [
    ...orbit(cx, cy, 110, 80, [I('gem', 0, 0, { r: 16 }), K.peg(0, 0, 'yellow', 15)]),
    ...orbit(cx, cy, 191, -55, [I('gem', 0, 0, { r: 17 }), K.peg(0, 0, 'pink', 16)], 0.25),
    ...orbit(cx, cy, 273, 42, [I('gem', 0, 0, { r: 17 }), K.peg(0, 0, 'teal', 16), K.peg(0, 0, 'teal', 16)], 0.1),
    ...orbit(cx, cy, 355, -32, [I('gem', 0, 0, { r: 18 }), K.peg(0, 0, 'purple', 16), I('gem', 0, 0, { r: 18 }), K.peg(0, 0, 'purple', 16)], 0.4)];
  const sun = [I('bumper', cx, cy, { r: 28 }), ...P(ringPts(cx, cy, 58, 6, 0), 'orange', 12)];
  return L({
    name: 'Orrery', intro: 'Planets circle the sun on their tracks. Collect the five gem planets.',
    goal: { type: 'gems' }, balls: 9, plate: plate(165, 290, 'timed', 2),
    items: [turn(tracks, [5, 30, 55], 'zap'), planets, sun, I('multiball', 90, 190), I('multiball', 910, 190)]
  });
});

// 17 · Supernova: shells of a dying star breathe in and out round an armoured core.
SW.push(() => {
  const cx = 500, cy = 540;
  const shell = (r, n, ph, c) => ringPts(cx, cy, r, n, ph * 30).map((p, i) => { const a = Math.atan2(p.y - cy, p.x - cx) / D, dv = pol(0, 0, 34, a); return slide([K.peg(p.x, p.y, c, 16)], dv.x, dv.y, 2.4, ph); });
  const core = brickRing(cx, cy, 70, 8, { t: 'armor', w: 46, h: 20 });
  const bricks = brickRing(cx, cy, 300, 14, { w: 56, h: 20, hp: (i) => (i % 2 ? 2 : 1) }, 13);
  return L({
    name: 'Supernova', intro: 'A dying star breathes in and out. Break every brick, armour too. Blasts and lightning help.',
    goal: { type: 'bricks' }, balls: 11, plate: plate(175, 280),
    items: [spin(bricks, cx, cy, 18), core, turn(shell(155, 10, 0, 'orange').flat(), [0, 3, 5, 8], 'zap'), shell(225, 14, 0.5, 'yellow'), I('zap', cx, cy, { r: 18 }),
      A(xy([[120, 220], [880, 220]]), 'blast'), A(xy([[110, 930], [890, 930]]), 'zap'), I('fire', 500, 190), P([{ x: 200, y: 960 }, { x: 800, y: 960 }], 'teal', 15)]
  });
});

// 18 · Star gate: a locked ring of gates round the orange core; keys circle outside.
SW.push(() => {
  const cx = 500, cy = 560;
  const gates = brickRing(cx, cy, 130, 10, { t: 'gate', w: 70, h: 16, k: 'blue' }).map((g, i) => Object.assign(g, { k: i % 2 ? 'pink' : 'blue' }));
  const inner = P(ringPts(cx, cy, 70, 6, 0), 'orange', 17);
  const keys = orbit(cx, cy, 250, 36, [I('key', 0, 0, { k: 'blue', r: 19 }), K.peg(0, 0, 'purple', 16), K.peg(0, 0, 'orange', 16), I('key', 0, 0, { k: 'pink', r: 19 }), K.peg(0, 0, 'purple', 16), K.peg(0, 0, 'orange', 16)]);
  const outer = spin(P(ringPts(cx, cy, 345, 18, 5).filter(p => p.y > 170), (i) => (i % 3 === 1 ? 'orange' : 'teal'), 15), cx, cy, -18);
  const portals = [I('portal', 90, 200, { r: 22, p: 0 }), I('portal', cx, cy, { r: 20, p: 0 })];
  return L({
    name: 'Star Gate', intro: 'Keys circle the gate. Open it and hit every orange peg, twelve in all.',
    goal: { type: 'color', color: 'orange' }, balls: 9, plate: plate(160, 300, 'timed', 2),
    items: [gates, inner, keys, turn(outer, [0, 9], 'zap'), portals, I('bumper', 910, 200, { r: 20 })]
  });
});

// 19 · Lightspeed: nested hexagons whirl in alternate directions, faster and faster.
SW.push(() => {
  const cx = 500, cy = 555;
  const hex = (r, n, sp, c, oi) => spin(P(K.polygon(cx, cy, r, 6, n, sp > 0 ? -90 : -60), (i) => (oi.includes(i) ? 'orange' : c), 16), cx, cy, sp);
  const h1 = hex(115, 12, 52, 'teal', [0, 6]), h2 = hex(205, 18, -40, 'purple', [2, 8, 14]), h3 = hex(300, 24, 30, 'blue', [1, 9, 13, 21]);
  return L({
    name: 'Lightspeed', intro: 'The hexagons whirl ever faster. Hit the nine orange pegs.',
    goal: { type: 'color', color: 'orange' }, balls: 8, plate: plate(155, 310), gravity: 1.1, speed: 1.05,
    items: [h1, turn(h2, [5, 11], 'zap'), turn(h3, [5, 17], 'multiball'), I('bumper', cx, cy, { r: 24 }), edgeStreaks([230, 400, 720, 890], 'pink')]
  });
});

// 20 · Warp core: the reactor heart, gates of brick and rings of pegs whirling round it.
SW.push(() => {
  const cx = 500, cy = 560;
  const shield = spin(brickRing(cx, cy, 120, 12, { w: 52, h: 16, hp: 2 }).filter((b, i) => i % 3 !== 0), cx, cy, 45);
  const coreP = P(ringPts(cx, cy, 55, 5, -90), 'orange', 15);
  const mid = spin(P(ringPts(cx, cy, 215, 15, 0), (i) => (i % 5 === 2 ? 'orange' : 'purple'), 16), cx, cy, -36);
  const moons = orbit(cx, cy, 315, 50, [I('spike', 0, 0, { r: 14 }), K.peg(0, 0, 'orange', 16), K.peg(0, 0, 'teal', 16), I('spike', 0, 0, { r: 14 }), K.peg(0, 0, 'orange', 16), K.peg(0, 0, 'teal', 16)]);
  const portals = [I('portal', 100, 200, { r: 22, p: 0 }), I('portal', 900, 920, { r: 22, p: 0 }), I('portal', 900, 200, { r: 22, p: 1 }), I('portal', 100, 920, { r: 22, p: 1 })];
  return L({
    name: 'Warp Core', intro: 'The warp core burns behind its turning shield. Hit all ten orange pegs.',
    goal: { type: 'color', color: 'orange' }, balls: 8, plate: plate(140, 340, 'timed', 1.6), gravity: 1.15, speed: 1.1,
    items: [shield, coreP, turn(mid, [0, 7], 'zap'), moons, portals, I('multiball', 500, 190), I('bumper', 500, 950, { r: 18 })]
  });
});

/* ════════════════════════════════════════════════════════════════════════ */

module.exports = [
  {
    id: 'hyper-neon-highway', title: 'Neon Highway', theme: 'neon-highway',
    blurb: 'Race a synthwave road into the sunset through spinning wheels, sliding traffic and spike strips.',
    levels: NH.map(f => f())
  },
  {
    id: 'hyper-starlight-warp', title: 'Starlight Warp', theme: 'starlight-warp',
    blurb: 'Warp through hyperspace: ring tunnels, orbiting moons, warp gates and a black hole.',
    levels: SW.map(f => f())
  },
  { id: 'hyper-quasar-core', title: 'Quasar Core', theme: 'quasar-core',
    blurb: 'Dive through rotating debris, gravity wells and armoured reactors to the heart of a quasar.',
    levels: require('./quasar.cjs') }
];
