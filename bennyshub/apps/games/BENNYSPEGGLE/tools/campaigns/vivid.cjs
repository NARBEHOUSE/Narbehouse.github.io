/**
 * Benny's P3GL — the three Vivid campaigns (20 levels each).
 *
 *   Sugar Rush      candy land, the gentlest climb
 *   Carnival Skies  balloons, kites and a ferris wheel, the middle climb
 *   Coral Groove    a bright reef, the hardest climb, ending strong
 *
 * Built by tools/build-campaigns.cjs (node tools/build-campaigns.cjs vivid --bot).
 * Everything is deterministic: patterns come from levelkit, picks are seeded.
 */
const K = require('../levelkit.cjs');
const D = Math.PI / 180;

/* ══ Shape helpers: pegs spaced evenly along a path ═══════════════════════ */

function plen(P) { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); return L; }
function at(P, d) {
  for (let i = 1; i < P.length; i++) {
    const s = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
    if (d <= s || i === P.length - 1) { const u = s ? Math.min(1, d / s) : 0; return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * u, y: P[i - 1].y + (P[i].y - P[i - 1].y) * u }; }
    d -= s;
  }
  return { x: P[P.length - 1].x, y: P[P.length - 1].y };
}
/** n points evenly along a polyline, about `sp` apart (ends included unless closed). */
function spaced(P, sp, closed) {
  if (closed) P = P.concat([P[0]]);
  const L = plen(P);
  if (closed) { const n = Math.max(3, Math.round(L / sp)); return Array.from({ length: n }, (_, i) => at(P, L * i / n)); }
  const n = Math.max(2, Math.round(L / sp) + 1);
  return Array.from({ length: n }, (_, i) => at(P, L * i / (n - 1)));
}
function curve(fn, N) { N = N || 400; return Array.from({ length: N + 1 }, (_, i) => fn(i / N)); }
function polar(cx, cy, r, a) { return { x: cx + Math.cos(a * D) * r, y: cy + Math.sin(a * D) * r }; }
const lineS = (x1, y1, x2, y2, sp) => spaced([{ x: x1, y: y1 }, { x: x2, y: y2 }], sp);
const polyS = (pts, sp, closed) => spaced(pts.map(p => ({ x: p[0], y: p[1] })), sp, closed);
const arcS = (cx, cy, r, a0, a1, sp) => spaced(curve(u => polar(cx, cy, r, a0 + (a1 - a0) * u)), sp);
const ringS = (cx, cy, r, sp, a0) => spaced(curve(u => polar(cx, cy, r, (a0 || -90) + 360 * u)).slice(0, -1), sp, true);
const ellS = (cx, cy, rx, ry, sp, rot) => spaced(curve(u => { const a = u * 360 * D, x = Math.cos(a) * rx, y = Math.sin(a) * ry, k = (rot || 0) * D; return { x: cx + x * Math.cos(k) - y * Math.sin(k), y: cy + x * Math.sin(k) + y * Math.cos(k) }; }).slice(0, -1), sp, true);
const spiralS = (cx, cy, r0, r1, turns, sp, a0) => spaced(curve(u => polar(cx, cy, r0 + (r1 - r0) * u, (a0 || 0) + u * turns * 360), 1200), sp);
const waveS = (x0, x1, y, amp, periods, sp, phase) => spaced(K.wave(x0, x1, y, amp, periods, 400, phase), sp);
const vwaveS = (x, y0, y1, amp, periods, sp, phase) => spaced(curve(u => ({ x: x + Math.sin(u * periods * 2 * Math.PI + (phase || 0)) * amp, y: y0 + (y1 - y0) * u })), sp);
const heartS = (cx, cy, size, sp) => spaced(K.heart(cx, cy, size, 500), sp, true);
const starS = (cx, cy, ro, ri, pts, sp, rot) => spaced(K.starShape(cx, cy, ro, ri, pts, 600, rot), sp, true);
const polyN = (cx, cy, r, sides, sp, rot) => spaced(K.polygon(cx, cy, r, sides, 600, rot), sp, true);
/** Points of a stagger grid that fall inside a test. */
function fill(x0, y0, x1, y1, dx, dy, inside, stagger) {
  const out = [];
  for (let r = 0, y = y0; y <= y1; r++, y += dy) for (let x = x0 + (stagger !== false && r % 2 ? dx / 2 : 0); x <= x1; x += dx) if (!inside || inside(x, y)) out.push({ x, y, row: r });
  return out;
}

/* ══ Item helpers ═════════════════════════════════════════════════════════ */

/** Pegs from positions; colour is a name, an array (cycled), or fn(i, p). */
function col(pos, c, r) {
  return pos.map((p, i) => Object.assign(K.peg(p.x, p.y, typeof c === 'function' ? c(i, p) : Array.isArray(c) ? c[i % c.length] : c, r || 17), p.tag ? { tag: p.tag } : {}));
}
const stripes = (cols, run) => (i) => cols[Math.floor(i / (run || 1)) % cols.length];
const tag = (list, t) => list.map(p => Object.assign({}, p, { tag: t }));
const as = (pos, t, o) => pos.map(p => Object.assign({ t, x: p.x, y: p.y }, o || {}));
/** Turn n spread-out decoration pegs into the goal colour (never `keep`-tagged pegs). */
function goal(items, n, seed, c, filter) { return K.convert(items, n, seed, c, p => p.t === 'peg' && p.c !== c && p.tag !== 'keep' && (!filter || filter(p))); }
/** Turn n spread-out pegs (not of colour `avoid`) into another type. */
function put(items, n, seed, t, filter, avoid) { return K.convert(items, n, seed, t, p => p.t === 'peg' && p.tag !== 'keep' && p.c !== (avoid || 'orange') && (!filter || filter(p))); }
/** Bricks along a straight run, w wide each, touching or with a gap. */
function brickRow(x1, y1, x2, y2, n, o) {
  o = o || {};
  const pos = K.line(x1, y1, x2, y2, n);
  return K.bricksAlong(pos, Object.assign({ follow: n > 1 }, o));
}
/** Bricks set around a circle, each tangent to it. */
function brickRing(cx, cy, r, n, o, a0) {
  o = o || {};
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (a0 || -90) + i * 360 / n, p = polar(cx, cy, r, a);
    const b = { t: o.t || 'brick', x: p.x, y: p.y, w: o.w || 60, h: o.h || 20, a: (a + 90 + 360) % 360 };
    if (b.t === 'brick') b.hp = typeof o.hp === 'function' ? o.hp(i) : (o.hp || 1);
    if (b.t === 'armor') b.hp = o.hp || 1;
    if (b.t === 'gate') b.k = o.k || 'blue';
    out.push(b);
  }
  return out;
}
const scatter = (seed, n, x0, y0, x1, y1, avoid) => {
  const R = K.rng(seed), out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 200) {
    const p = { x: x0 + R() * (x1 - x0), y: y0 + R() * (y1 - y0) };
    if (avoid && avoid(p.x, p.y)) continue;
    if (out.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 58)) continue;
    out.push(p);
  }
  return out;
};

/**
 * Tidy a level: still pegs are nudged apart and kept on the board, pegs that
 * sit on bricks are dropped, everything is rounded. Moving items are left
 * exactly as placed (their groups are spaced by construction).
 */
function tidy(items, o) {
  o = o || {};
  const still = items.filter(i => !i.m), moving = items.filter(i => i.m);
  const bricks = still.filter(i => i.w).map(b => Object.assign({}, b, { x: Math.round(b.x), y: Math.round(b.y), a: Math.round((((b.a || 0) % 360) + 360) % 360) }));
  const pegs = K.clean(still.filter(i => !i.w), { pad: o.pad === undefined ? 6 : o.pad });
  let out = bricks.concat(pegs);
  if (!o.keepAll) out = K.clearAround(out, o.keep);
  return out.concat(moving.map(m => Object.assign({}, m, { x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10 })));
}
/** Space a group of pegs (for a moving group, before motion is given). */
function space(list, pad) { return K.clean(list, { pad: pad === undefined ? 6 : pad }); }

/**
 * How many degrees of launch angle hit each item first (a straight shot from
 * the launcher, board at rest). Exposed pegs are easy to aim at; buried ones
 * need bounces. Used to place goal pegs at a chosen difficulty.
 */
function exposure(items) {
  const lv = K.P3.levels.normLevel({ items, goal: { type: 'score', score: 1e6 }, plate: { w: 200, mode: 'bounce' } }, 'vivid', 0);
  const world = new K.P3.physics.World(lv, K.C.MODES.vivid, 1);
  const win = new Array(items.length).fill(0);
  for (let a = -84; a <= 84; a += 0.25) {
    const p = world.predict(a, 2.5, 0, {});
    const h = p.hits.find(x => x.body);
    if (h) win[h.body.index] += 0.25;
  }
  return win;
}
/**
 * Goal pegs with a chosen exposure: `open` of the n are pegs a straight shot
 * can hit (window ≥ 1°), the rest are buried. Candidates pass `filter`.
 */
function goalX(items, n, seed, c, open, filter) {
  const win = exposure(items);
  const ok = (p, i) => p.t === 'peg' && p.c !== c && p.tag !== 'keep' && (!filter || filter(p));
  const ex = items.map((p, i) => ({ p, i })).filter(o => ok(o.p) && win[o.i] >= 1);
  const bu = items.map((p, i) => ({ p, i })).filter(o => ok(o.p) && win[o.i] < 1);
  const k = Math.min(open, ex.length);
  const pickFrom = (arr, m, s) => K.spreadPick(arr.map(o => o.p), m, s).map(j => arr[j].i);
  const chosen = new Set(pickFrom(ex, k, seed).concat(pickFrom(bu, Math.min(n - k, bu.length), seed + 1)));
  if (chosen.size < n) pickFrom(ex.filter(o => !chosen.has(o.i)), n - chosen.size, seed + 2).forEach(i => chosen.add(i));
  const isColor = !!K.C.PEG_COLORS[c];
  return items.map((p, i) => {
    if (!chosen.has(i)) return p;
    if (isColor) return Object.assign({}, p, { c });
    const q = Object.assign({}, p, { t: c }); delete q.c; return q;
  });
}

function lvl(o) {
  const items = (o.items.flat ? o.items.flat(3) : o.items).map(i => { const c = Object.assign({}, i); delete c.tag; delete c.row; delete c.col; return c; });
  return K.level(Object.assign({}, o, { items }));
}

/* ══ Sugar Rush ═══════════════════════════════════════════════════════════ */

function swirlPop(cx, cy, r1, turns, cols, sp) { return col(spiralS(cx, cy, 18, r1, turns, sp || 46, -90), stripes(cols, 3)); }

const sugar = [];

// 1 — three swirl lollipops. Basics and a generous catch plate.
sugar.push((() => {
  let it = [];
  it.push(...swirlPop(500, 370, 150, 2.1, ['pink', 'purple']));
  it.push(...tag(col(lineS(500, 560, 500, 900, 42), 'teal'), 'keep'));
  for (const s of [-1, 1]) {
    it.push(...swirlPop(500 + s * 300, 520, 105, 1.7, ['red', 'yellow']));
    it.push(...tag(col(lineS(500 + s * 300, 665, 500 + s * 300, 930, 42), 'teal'), 'keep'));
  }
  it.push(...col(arcS(500, 370, 205, 215, 325, 66), 'green', 13));
  it = goalX(tidy(it), 6, 11, 'orange', 6, p => p.c !== 'teal');
  return lvl({ name: 'Lollipop Lane', intro: 'Break all six orange pegs. Land on the moving plate to get your ball back.', goal: { type: 'color', color: 'orange' }, balls: 12, plate: { w: 290, speed: 90, mode: 'catch' }, items: it });
})());

// 2 — candy canes. Multiball.
function cane(x, yTop, yBot, hr, dir, cols) {
  const stick = lineS(x, yBot, x, yTop, 48);
  const hook = arcS(x + dir * hr, yTop, hr, dir > 0 ? 180 : 0, dir > 0 ? 360 : -180, 46).slice(1);
  return col(stick.concat(hook), stripes(cols, 2));
}
sugar.push((() => {
  let it = [];
  it.push(...cane(150, 440, 910, 64, 1, ['red', 'pink']));
  it.push(...cane(370, 570, 910, 64, 1, ['red', 'pink']));
  it.push(...cane(590, 440, 910, 64, 1, ['red', 'pink']));
  it.push(...cane(810, 570, 910, 64, 1, ['red', 'pink']));
  for (const [x, y, c] of [[290, 260, 'green'], [500, 330, 'teal'], [720, 260, 'green']]) it.push(...col(ringS(x, y, 34, 34), c, 13));
  it.push(K.item('multiball', 498, 600), K.item('multiball', 718, 470));
  return lvl({ name: 'Candy Cane Alley', intro: 'New: multiball pegs burst two more balls into play. Break any thirty six pegs.', goal: { type: 'count', count: 36 }, balls: 10, plate: { w: 260, speed: 120, mode: 'bounce' }, items: tidy(it) });
})());

// 3 — a gumball machine. Extra ball.
sugar.push((() => {
  let it = [];
  it.push(...tag(col(ringS(500, 410, 215, 74), 'teal'), 'rim'));
  const balls = fill(330, 260, 670, 560, 64, 56, (x, y) => Math.hypot(x - 500, y - 410) < 160);
  it.push(...col(balls, ['pink', 'yellow', 'green', 'purple', 'blue', 'red']));
  it.push(...col(lineS(420, 650, 330, 910, 50), 'red'), ...col(lineS(580, 650, 670, 910, 50), 'red'));
  it.push(...col(arcS(500, 820, 52, 180, 360, 40), 'yellow'));
  it.push(K.item('extra', 500, 410), K.item('extra', 500, 735));
  it = goal(it, 8, 31, 'orange', p => p.tag !== 'rim' && p.y < 600);
  return lvl({ name: 'Gumball Globe', intro: 'Break the eight orange gumballs. New: green extra ball pegs give you one more ball.', goal: { type: 'color', color: 'orange' }, balls: 11, plate: { w: 260, speed: 130, mode: 'catch' }, items: tidy(it) });
})());

// 4 — a two-armed sugar swirl. Double points, score goal.
sugar.push((() => {
  let it = [];
  it.push(...col(spiralS(500, 560, 60, 330, 1.35, 50, 0), 'pink'));
  it.push(...col(spiralS(500, 560, 60, 330, 1.35, 50, 180), 'yellow'));
  it.push(K.item('multiplier', 500, 560));
  it = put(it, 1, 41, 'multiplier', p => Math.hypot(p.x - 500, p.y - 560) > 200);
  return lvl({ name: 'Sweet Swirl', intro: 'Score twelve thousand points. New: double points pegs double a whole shot.', goal: { type: 'score', score: 12000 }, balls: 10, plate: { w: 240, speed: 140, mode: 'bounce' }, items: tidy(it) });
})());

// 5 — rock candy crystals on sticks. Lightning, gems goal.
sugar.push((() => {
  let it = [];
  const sticks = [[160, 430, 'pink'], [330, 580, 'purple'], [500, 370, 'teal'], [670, 580, 'purple'], [840, 430, 'pink']];
  sticks.forEach(([cx, cy, c], i) => {
    const cr = K.diamond(cx, cy, 5, 62, 50).filter(p => !(Math.abs(p.x - cx) < 2 && p.y < cy + 2));
    it.push(...col(cr, c));
    it.push(K.item('gem', cx, cy));
    it.push(...tag(col(lineS(cx, cy + 135, cx, 940, 46), 'yellow'), 'keep'));
  });
  it.push(K.item('gem', 245, 300), K.item('gem', 755, 300));
  it = put(it, 2, 51, 'zap', p => p.y > 300 && p.c !== 'yellow');
  return lvl({ name: 'Rock Candy', intro: 'Collect all seven gems. New: lightning pegs light up the six nearest pegs.', goal: { type: 'gems' }, balls: 10, plate: { w: 240, speed: 150, mode: 'catch' }, items: tidy(it) });
})());

// 6 — an ice cream cone in a sprinkle shower. Spray shot.
sugar.push((() => {
  let it = [];
  const inCone = (x, y) => y > 640 && y < 930 && Math.abs(x - 500) < (930 - y) * 0.52 - 20;
  it.push(...tag(col(lineS(340, 625, 500, 935, 44).concat(lineS(660, 625, 500, 935, 44).slice(0, -1)), 'yellow'), 'keep'));
  it.push(...col(fill(380, 680, 620, 900, 66, 58, inCone), 'yellow'));
  it.push(...col(arcS(500, 620, 170, 188, 352, 48), 'pink'));
  it.push(...col(arcS(500, 455, 118, 200, 340, 46), 'green'));
  it.push(K.peg(500, 295, 'red', 20));
  const R = K.rng(61);
  const sp = scatter(62, 36, 60, 190, 940, 940, (x, y) => (Math.abs(x - 500) < 230 && y > 270) || (Math.abs(x - 500) < 120));
  it.push(...col(sp, () => ['purple', 'teal', 'blue', 'red', 'green'][Math.floor(R() * 5)], 13));
  it = put(it, 2, 64, 'spray', p => p.r === 13);
  it = put(it, 1, 65, 'extra', p => p.c === 'pink');
  it = goalX(tidy(it), 8, 63, 'orange', 7, p => p.c !== 'yellow' && p.c !== 'red');
  return lvl({ name: 'Sprinkle Cone', intro: 'Break the eight orange pegs. New: spray pegs make your next shot fire three balls.', goal: { type: 'color', color: 'orange' }, balls: 10, plate: { w: 240, speed: 140, mode: 'bounce' }, items: it });
})());

// 7 — a chocolate bar in its wrapper. Barrier bricks, bricks goal.
sugar.push((() => {
  let it = [];
  const bar = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) bar.push(K.brick(500 + (c - 1.5) * 132, 400 + (r - 1) * 84, 100, 48, 0, r === 1 ? 2 : 1));
  it.push(...K.rotateAbout(bar, 500, 400, -8));
  const wrap = [];
  wrap.push(...col(lineS(220, 560, 780, 560, 62), 'red'));
  wrap.push(...col(waveS(220, 780, 600, 14, 4.5, 50), 'yellow'));
  wrap.push(...col(lineS(220, 640, 220, 760, 60), 'red'), ...col(lineS(780, 640, 780, 760, 60), 'red'));
  it.push(...K.rotateAbout(wrap, 500, 400, -8));
  it.push(...col(fill(120, 820, 880, 940, 92, 62), ['purple', 'blue', 'teal']));
  it.push(...col(scatter(71, 8, 70, 190, 930, 300, (x) => Math.abs(x - 500) < 90), 'pink', 14));
  return lvl({ name: 'Chocolate Bar', intro: 'New: barrier bricks. Their colour and dots show the hits left. Break every brick.', goal: { type: 'bricks' }, balls: 10, plate: { w: 230, speed: 150, mode: 'bounce' }, items: tidy(it) });
})());

// 8 — gumdrop hills with bumper cherries. Bumpers.
sugar.push((() => {
  let it = [];
  const drops = [[215, 870, 100, 'red'], [500, 870, 100, 'green'], [785, 870, 100, 'purple'], [357, 660, 95, 'yellow'], [643, 660, 95, 'teal'], [500, 450, 92, 'pink']];
  drops.forEach(([cx, cy, r, c]) => {
    it.push(...col(arcS(cx, cy, r, 180, 360, 46), c));
    it.push(...col(arcS(cx, cy, r - 50, 195, 345, 48), c));
  });
  for (const [x, y] of [[357, 850], [643, 850], [500, 655], [215, 690], [785, 690], [357, 455], [643, 455]]) it.push(K.item('bumper', x, y, { r: 18 }));
  it.push(...col(scatter(82, 12, 70, 200, 930, 340, (x, y) => Math.abs(x - 500) < 130), ['yellow', 'pink', 'teal'], 13));
  it = put(it, 1, 83, 'extra', p => p.c === 'pink' && p.r === 17);
  it = goalX(tidy(it), 8, 81, 'orange', 6, p => p.r === 17 && p.x > 150 && p.x < 850);
  return lvl({ name: 'Gumdrop Hills', intro: 'Break the eight orange pegs. New: bumpers never break and bounce your ball away fast.', goal: { type: 'color', color: 'orange' }, balls: 10, plate: { w: 230, speed: 150, mode: 'catch' }, items: it });
})());

// 9 — a three-tier birthday cake with candle lanterns. Steel posts, lanterns goal.
sugar.push((() => {
  let it = [];
  it.push(...brickRow(412, 470, 588, 470, 2, { w: 88, h: 26 }));
  it.push(...brickRow(324, 650, 676, 650, 4, { w: 88, h: 26 }));
  it.push(...brickRow(236, 830, 764, 830, 6, { w: 88, h: 26 }));
  it.push(...col(fill(430, 520, 570, 590, 70, 62), 'pink'));
  it.push(...col(fill(345, 700, 655, 770, 78, 62), 'yellow'));
  it.push(...col(fill(260, 880, 740, 950, 80, 62), 'purple'));
  it.push(...as([[430, 400], [500, 400], [570, 400], [350, 585], [650, 585], [262, 765], [738, 765]].map(([x, y]) => ({ x, y })), 'lantern', { r: 17 }));
  it.push(...as([[340, 320], [660, 320], [150, 560], [850, 560]].map(([x, y]) => ({ x, y })), 'steel', { r: 16 }));
  it.push(...col(vwaveS(95, 230, 900, 22, 2.5, 52), ['pink', 'teal']), ...col(vwaveS(905, 230, 900, 22, 2.5, 52, Math.PI), ['pink', 'teal']));
  return lvl({ name: 'Birthday Cake', intro: 'Light all seven candle lanterns. New: steel posts never break.', goal: { type: 'lanterns' }, balls: 10, plate: { w: 220, speed: 160, mode: 'catch' }, items: tidy(it) });
})());

// 10 — candy hearts and glass. Glass, clear goal.
sugar.push((() => {
  let it = [];
  it.push(...col(heartS(500, 480, 250, 74), 'pink'));
  it.push(...col(heartS(500, 470, 110, 62), 'red'));
  it.push(K.item('zap', 500, 520), K.item('extra', 500, 300));
  it.push(...K.mirror([K.glass(330, 860, 80, 16, 30), K.glass(240, 300, 80, 16, -30)]));
  it.push(K.glass(500, 880, 120, 16, 0));
  return lvl({ name: 'Candy Hearts', intro: 'Clear every peg. New: glass shatters at the first touch, and your ball flies through.', goal: { type: 'clear' }, balls: 10, plate: { w: 240, speed: 150, mode: 'catch' }, items: tidy(it) });
})());

// 11 — peppermint wheels. Safety net, the timed plate.
function peppermint(cx, cy, r, rim, spoke) {
  const out = col(ringS(cx, cy, r, 64), rim);
  for (let k = 0; k < 6; k++) out.push(...col([polar(cx, cy, r * 0.55, k * 60 + 30)], spoke));
  return out;
}
sugar.push((() => {
  let it = [];
  it.push(...peppermint(250, 420, 110, 'pink', 'red'), ...peppermint(750, 420, 110, 'pink', 'red'), ...peppermint(500, 700, 120, 'red', 'pink'));
  it.push(K.item('net', 250, 420), K.item('net', 750, 420), K.item('multiball', 500, 700));
  it.push(...col(arcS(500, 470, 300, 225, 315, 60), 'teal', 14));
  it.push(...col(ringS(150, 820, 46, 58), 'green', 14), ...col(ringS(850, 820, 46, 58), 'green', 14));
  it.push(...col(waveS(80, 920, 955, 12, 4, 62), 'yellow', 14));
  it = goalX(tidy(it), 9, 111, 'orange', 7, p => p.r === 17);
  return lvl({ name: 'Peppermint Twist', intro: 'New: safety net pegs. The plate takes turns, catching and then bouncing.', goal: { type: 'color', color: 'orange' }, balls: 11, plate: { w: 240, speed: 140, mode: 'timed', period: 3 }, items: it });
})());

// 12 — taffy ribbons stretched across the board. Blast ball, chain goal.
sugar.push((() => {
  let it = [];
  [[330, 'pink', 0], [480, 'yellow', Math.PI], [630, 'teal', 0], [780, 'purple', Math.PI]].forEach(([y, c, ph]) => it.push(...col(waveS(80, 920, y, 42, 1.5, 50, ph), c)));
  it.push(...col(waveS(160, 840, 905, 16, 2, 60), 'red', 14));
  it = put(it, 2, 121, 'blast', p => p.y < 520);
  it = put(it, 1, 122, 'multiball', p => p.y > 600);
  return lvl({ name: 'Taffy Pull', intro: 'Light twenty pegs in one shot. New: a blast ball explodes on its first hit.', goal: { type: 'chain', chain: 20 }, balls: 10, plate: { w: 220, speed: 170, mode: 'bounce' }, items: tidy(it) });
})());

// 13 — a candy jar sealed by a gate. Keys and gates, steel walls, gems goal.
sugar.push((() => {
  let it = [];
  it.push(K.wall(322, 665, 390, 20, 90), K.wall(678, 665, 390, 20, 90));
  it.push(K.wall(372, 448, 110, 18, -33), K.wall(628, 448, 110, 18, 33));
  it.push(K.wall(382, 893, 140, 18, 25), K.wall(618, 893, 140, 18, -25));
  it.push(K.gate(500, 418, 170, 18, 0, 'blue'));
  it.push(...col(fill(375, 500, 625, 830, 64, 58, (x, y) => true), ['pink', 'yellow', 'green', 'purple', 'red']));
  it = K.convert(it, 6, 131, 'gem', p => p.t === 'peg');
  it.push(K.item('key', 160, 360, { k: 'blue' }), K.item('key', 840, 360, { k: 'blue' }));
  it.push(K.item('gem', 230, 560), K.item('gem', 770, 560));
  it.push(...col(scatter(132, 16, 60, 190, 940, 950, (x, y) => (x > 290 && x < 710 && y > 380) || Math.abs(x - 500) < 90), ['red', 'green', 'yellow', 'purple'], 14));
  return lvl({ name: 'Candy Jar', intro: 'Collect all eight gems. New: hit a key to open the gate of the same colour.', goal: { type: 'gems' }, balls: 10, plate: { w: 210, speed: 170, mode: 'catch' }, items: tidy(it) });
})());

// 14 — a chocolate fountain. Fireball.
sugar.push((() => {
  let it = [];
  // three shallow dishes, each pouring chocolate curtains over its rim
  const dishes = [[400, 100], [610, 185], [820, 275]];
  dishes.forEach(([y, hw], i) => {
    const depth = hw * 0.3, r = (hw * hw + depth * depth) / (2 * depth), half = Math.asin(hw / r) / D, gap = 30 / r / D;
    it.push(...col(arcS(500, y - r, r, 90 - half, 90 - gap, 44).concat(arcS(500, y - r, r, 90 + gap, 90 + half, 44)), 'purple'));
    for (const s of [-1, 1]) it.push(...col(spaced(curve(u => ({ x: 500 + s * (hw + 26 + 34 * Math.sin(u * 1.4)), y: y - depth + 30 + u * (i === 2 ? 110 : 120) })), 44), 'pink'));
  });
  it.push(...col(arcS(500, 330, 46, 200, 340, 40), 'yellow'));
  it.push(...col([290, 500, 710].map(y => ({ x: 500, y })), 'yellow'));
  for (const s of [-1, 1]) {
    it.push(...col(lineS(500 + s * 300, 210, 500 + s * 420, 470, 52), stripes(['red', 'teal'], 1)));
    it.push(...col(lineS(500 + s * 405, 600, 500 + s * 430, 950, 58), 'teal', 14));
  }
  it = put(it, 2, 141, 'fire', p => p.c === 'pink');
  it = put(it, 1, 143, 'extra', p => p.c === 'teal');
  it = goalX(tidy(it), 9, 142, 'orange', 7, p => p.c !== 'yellow');
  return lvl({ name: 'Fudge Fountain', intro: 'Break the nine orange pegs. New: a fireball burns straight through pegs.', goal: { type: 'color', color: 'orange' }, balls: 11, plate: { w: 220, speed: 170, mode: 'catch' }, items: it });
})());

// 15 — caramel ripples under a wafer bridge. Sludge, score goal.
sugar.push((() => {
  let it = [];
  [380, 490, 600, 710, 820].forEach((y, i) => it.push(...col(waveS(70, 930, y, 24, 2, 58, i * 1.3), i % 2 ? 'yellow' : 'red')));
  it.push(...K.bricksAlong(arcS(500, 620, 420, 222, 318, 66), { follow: true, w: 60, h: 22, hp: 1 }));
  it = put(it, 5, 151, 'sludge', p => p.y > 450, 'none');
  it = put(it, 1, 152, 'extra', p => p.y > 700, 'none');
  it = put(it, 2, 153, 'multiplier', p => p.y < 650, 'none');
  return lvl({ name: 'Caramel Creek', intro: 'Score twenty nine thousand points. New: sticky sludge pegs slow your ball right down.', goal: { type: 'score', score: 29000 }, balls: 10, plate: { w: 200, speed: 180, mode: 'timed', period: 3 }, items: tidy(it) });
})());

// 16 — a gingerbread house with a portal inside. Portals, clear goal.
sugar.push((() => {
  let it = [];
  for (const x of [292, 708]) for (let k = 0; k < 4; k++) it.push(K.brick(x, 650 + k * 72, 66, 28, 90, 2));
  it.push(...col(lineS(250, 590, 500, 390, 50).concat(lineS(500, 390, 750, 590, 50).slice(1)), stripes(['pink', 'green', 'yellow'], 1)));
  it.push(...col(fill(390, 670, 610, 790, 110, 110), ['purple', 'red', 'teal']));
  it.push(K.brick(640, 450, 40, 56, 0, 1));
  it.push(...col(vwaveS(640, 300, 400, 14, 1, 46), 'teal', 13));
  it.push(K.item('portal', 130, 300, { p: 0 }), K.item('portal', 500, 560, { p: 0 }));
  return lvl({ name: 'Gingerbread House', intro: 'Clear every peg. New: a portal sends your ball to its twin, and it keeps going.', goal: { type: 'clear' }, balls: 11, plate: { w: 210, speed: 170, mode: 'catch' }, items: tidy(it) });
})());

// 17 — a jawbreaker with an armour shell. Armour bricks, bricks goal.
sugar.push((() => {
  let it = [];
  brickRing(500, 560, 215, 12, { w: 80, h: 24, hp: 2 }).forEach((b, i) => it.push(i % 2 ? b : Object.assign({}, b, { t: 'armor', hp: 1 })));
  it.push(...brickRing(500, 560, 135, 6, { w: 76, h: 22, hp: 2 }, -60));
  it.push(...col(ringS(500, 560, 62, 48), 'pink'));
  it.push(K.item('zap', 500, 560));
  // a lightning peg sits between each pair of armour bricks and reaches both, so the shell can always be cracked
  for (let i = 0; i < 3; i++) it.push(K.item('zap', ...Object.values(polar(500, 560, 252, -60 + i * 120))));
  it.push(K.item('blast', 170, 260), K.item('blast', 830, 260), K.item('fire', 500, 200));
  for (const [x, y] of [[140, 470], [860, 470], [160, 880], [840, 880]]) it.push(...col(ringS(x, y, 50, 60), ['yellow', 'teal', 'purple']));
  it.push(...col(arcS(500, 560, 330, 205, 335, 64), 'red', 14));
  return lvl({ name: 'Jawbreaker Vault', intro: 'Break every brick. New: armour bricks only crack from blasts, fireballs and lightning.', goal: { type: 'bricks' }, balls: 9, plate: { w: 200, speed: 190, mode: 'bounce' }, items: tidy(it) });
})());

// 18 — a giant turning donut. Moving pieces, lanterns goal.
sugar.push((() => {
  let it = [];
  const cx = 500, cy = 545;
  const R = K.rng(181);
  let donut = col(ringS(cx, cy, 245, 64), 'pink').concat(col(ringS(cx, cy, 118, 80), 'pink'));
  donut.push(...col(ringS(cx, cy, 182, 70, -70), () => ['yellow', 'teal', 'purple', 'green'][Math.floor(R() * 4)], 13));
  donut = space(donut);
  donut.push(...as([0, 90, 180, 270].map(a => polar(cx, cy, 182, a + 45)), 'lantern', { r: 17 }));
  it.push(...K.spin(donut.filter(p => !donut.some(q => q.t === 'lantern' && q !== p && Math.hypot(q.x - p.x, q.y - p.y) < 40)), cx, cy, 20));
  it.push(K.item('lantern', cx, cy));
  it.push(K.item('extra', 500, 250));
  it.push(...as([[110, 210], [890, 210], [150, 790], [850, 790]].map(([x, y]) => ({ x, y })), 'lantern', { r: 17 }));
  it.push(...col(arcS(cx, cy, 330, 150, 210, 60).concat(arcS(cx, cy, 330, -30, 30, 60)), 'red', 14));
  it.push(...col(lineS(260, 925, 420, 925, 80).concat(lineS(580, 925, 740, 925, 80)), 'yellow', 14));
  return lvl({ name: 'Giant Donut', intro: 'Light all nine lanterns. New: some pieces move. The giant donut slowly turns.', goal: { type: 'lanterns' }, balls: 10, plate: { w: 190, speed: 200, mode: 'catch' }, items: tidy(it) });
})());

// 19 — cotton candy clouds on paper cones, gems hidden in the fluff. Super guide, thieves, gems goal.
function cloud(cx, cy, s) {
  const blobs = [[-1.1, 0.25, 0.55], [-0.45, -0.25, 0.7], [0.4, -0.3, 0.65], [1.05, 0.2, 0.55], [0, 0.35, 0.6]].map(([x, y, r]) => ({ x: cx + x * s, y: cy + y * s, r: r * s }));
  const out = [];
  for (const b of blobs) for (const p of ringS(b.x, b.y, b.r, 56)) if (!blobs.some(o => o !== b && Math.hypot(p.x - o.x, p.y - o.y) < o.r - 8)) out.push(p);
  return out;
}
sugar.push((() => {
  let it = [];
  [[230, 380, 'pink'], [770, 380, 'purple'], [500, 560, 'teal']].forEach(([x, y, c]) => {
    it.push(...col(cloud(x, y, 95), c));
    it.push(...as([{ x: x - 42, y: y + 12 }, { x: x + 42, y: y + 12 }], 'gem', { r: 17 }));
    if (x === 500) it.push(K.item('gem', x, y - 40)); else it.push(...col([{ x, y: y - 40 }], 'yellow', 14));
    it.push(...tag(col(lineS(x - 62, y + 100, x, y + 320, 60).concat(lineS(x + 62, y + 100, x, y + 320, 60).slice(0, -1)), stripes(['red', 'yellow'], 1)), 'keep'));
  });
  it = put(it, 3, 191, 'thief', p => p.r === 14, 'none');
  it = put(it, 2, 192, 'guide', p => p.r === 17 && p.c !== 'red', 'none');
  it = put(it, 1, 194, 'extra', p => p.r === 17 && p.c !== 'red', 'none');
  it.push(...col(waveS(70, 930, 950, 14, 3, 66), 'green', 14));
  return lvl({ name: 'Cotton Candy Clouds', intro: 'Find all seven hidden gems. New: super guide shows every bounce. Thieves steal powers.', goal: { type: 'gems' }, balls: 8, plate: { w: 180, speed: 210, mode: 'timed', period: 2.5 }, items: tidy(it) });
})());

// 20 — the candy castle. Everything together.
sugar.push((() => {
  let it = [];
  for (const x of [215, 785]) {
    for (let k = 0; k < 5; k++) it.push(K.brick(x, 640 + k * 62, 70, 52, 0, k < 2 ? 2 : 1));
    it.push(...col(lineS(x - 60, 585, x + 60, 585, 60), 'pink'));
  }
  it.push(...brickRow(300, 730, 700, 730, 5, { w: 80, h: 24, hp: 1 }));
  it.push(K.gate(500, 640, 150, 18, 0, 'pink'));
  it.push(...K.mirror([K.armor(380, 600, 90, 22, -35)]));
  it.push(...col(arcS(500, 640, 150, 205, 335, 50), 'purple'));
  it.push(...col(fill(320, 790, 680, 930, 72, 64), ['yellow', 'red', 'teal']));
  it.push(K.item('key', 90, 640, { k: 'pink' }), K.item('key', 910, 640, { k: 'pink' }));
  it.push(K.item('portal', 500, 245, { p: 0 }), K.item('portal', 500, 690, { p: 0 }));
  it.push(K.item('blast', 300, 330), K.item('zap', 700, 330));
  for (const x of [215, 785]) {
    const flag = space(col(spiralS(x, 410, 16, 82, 1.6, 44, -90), stripes(['red', 'yellow'], 3)));
    it.push(...K.spin(flag, x, 410, x < 500 ? 28 : -28));
  }
  it.push(...col(arcS(500, 330, 120, 200, 340, 50), 'green', 14));
  it = put(it, 2, 201, 'sludge', p => p.c === 'teal' || p.c === 'green', 'none');
  it = put(it, 1, 202, 'thief', p => p.c === 'green', 'none');
  it = goalX(tidy(it), 12, 203, 'orange', 8, p => !p.m && p.r === 17 && p.y < 880);
  return lvl({ name: 'Candy Castle', intro: 'Break all twelve orange pegs to take the candy castle.', goal: { type: 'color', color: 'orange' }, balls: 10, plate: { w: 170, speed: 230, mode: 'catch' }, items: it });
})());

/* ══ Carnival Skies ═══════════════════════════════════════════════════════ */

const carn = [];
const SKY = ['pink', 'yellow', 'teal', 'purple', 'red', 'green', 'blue'];
/** A balloon: a ring with a knot, the top peg optionally in the goal colour. */
function balloon(cx, cy, r, c, topColor) {
  const ring = col(ringS(cx, cy, r, 50), (i) => (i === 0 && topColor ? topColor : c));
  ring.push(K.peg(cx, cy + r + 20, c, 12));
  return ring;
}
/** A string of pegs between two points. */
const rope = (x1, y1, x2, y2, c, sp) => col(lineS(x1, y1, x2, y2, sp || 40), c || 'yellow', 12);
/** Sagging line of bunting with flag tips hanging below. */
function bunting(x0, x1, y, sag, sp, cols) {
  const pts = spaced(curve(u => ({ x: x0 + (x1 - x0) * u, y: y + sag * (1 - Math.pow(2 * u - 1, 2)) })), sp);
  const out = col(pts, 'yellow', 13);
  for (let i = 0; i < pts.length - 1; i++) out.push(K.peg((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2 + 40, cols[i % cols.length], 16));
  return out;
}

// 1 — a bunch of balloons on gathered strings.
carn.push((() => {
  let it = [];
  const bal = [[500, 280, 60], [356, 348, 56], [644, 348, 56], [240, 476, 54], [760, 476, 54], [415, 500, 54], [585, 500, 54]];
  bal.forEach(([x, y, r], i) => {
    it.push(...balloon(x, y, r, SKY[i], 'orange'));
    const ky = y + r + 20, L = Math.hypot(500 - x, 720 - ky);
    it.push(...col([1, 2].map(k => ({ x: x + (500 - x) * k * 46 / L, y: ky + (720 - ky) * k * 46 / L })), 'yellow', 12));
  });
  it.push(...col(arcS(468, 735, 24, -60, 60, 30).concat(arcS(532, 735, 24, 120, 240, 30)), 'red', 13));
  it.push(...rope(490, 775, 455, 930, 'yellow', 52), ...rope(510, 775, 545, 930, 'yellow', 52));
  it.push(...col(cloud(140, 300, 58), 'blue', 14), ...col(cloud(860, 300, 58), 'blue', 14), ...col(cloud(160, 800, 52), 'blue', 14), ...col(cloud(840, 800, 52), 'blue', 14));
  return lvl({ name: 'Balloon Bunch', intro: 'Break the seven orange pegs atop the balloons. Land on the plate to win your ball back.', goal: { type: 'color', color: 'orange' }, balls: 11, plate: { w: 270, speed: 110, mode: 'catch' }, items: tidy(it) });
})());

// 2 — kites with long tails. Multiball and extra ball.
function kite(cx, cy, w, h, c, tailDx, tailEnd) {
  const top = [cx, cy - h * 0.45], rt = [cx + w / 2, cy - h * 0.1], bot = [cx, cy + h * 0.55], lt = [cx - w / 2, cy - h * 0.1];
  const out = col(polyS([top, rt, bot, lt], 46, true), c);
  out.push(...col(lineS(cx, cy - h * 0.45 + 46, cx, cy + h * 0.55 - 46, 50), 'yellow', 13));
  out.push(...col(lineS(cx - w / 2 + 46, cy - h * 0.1, cx + w / 2 - 46, cy - h * 0.1, 50), 'yellow', 13));
  const tail = spaced(curve(u => ({ x: cx + tailDx * u + Math.sin(u * 3 * Math.PI) * 30, y: bot[1] + 30 + (tailEnd - bot[1] - 30) * u })), 46);
  out.push(...col(tail, (i) => (i % 3 === 2 ? 'pink' : 'teal'), 13));
  return out;
}
carn.push((() => {
  let it = [];
  it.push(...kite(240, 340, 170, 230, 'red', -70, 900), ...kite(760, 310, 170, 230, 'blue', 70, 880), ...kite(500, 500, 140, 190, 'purple', 0, 940));
  it.push(K.item('multiball', 500, 481), K.item('extra', 240, 317), K.item('extra', 760, 287));
  it = it.filter(p => !(p.t === 'peg' && it.some(q => q.t !== 'peg' && Math.hypot(q.x - p.x, q.y - p.y) < 30)));
  return lvl({ name: 'Kite Festival', intro: 'Break any forty pegs. New: multiball adds two balls, and extra ball pegs give you one more.', goal: { type: 'count', count: 40 }, balls: 10, plate: { w: 250, speed: 130, mode: 'bounce' }, items: tidy(it) });
})());

// 3 — three lines of bunting. Double points, the timed plate, score goal.
carn.push((() => {
  let it = [];
  const flags = ['red', 'blue', 'green', 'pink', 'purple', 'teal'];
  it.push(...bunting(70, 930, 240, 70, 64, flags), ...bunting(70, 930, 450, 70, 64, flags.slice(2).concat(flags.slice(0, 2))), ...bunting(70, 930, 660, 70, 64, flags.slice(4).concat(flags.slice(0, 4))));
  it.push(...col(starS(500, 880, 95, 42, 5, 50), 'yellow'));
  it = put(it, 2, 31, 'multiplier', p => p.r === 16, 'none');
  return lvl({ name: 'Bunting Lines', intro: 'Score fifteen thousand. New: double points pegs, and a plate that catches, then bounces.', goal: { type: 'score', score: 15000 }, balls: 10, plate: { w: 250, speed: 140, mode: 'timed', period: 3 }, items: tidy(it) });
})());

// 4 — twin confetti cannons. Lightning and spray.
carn.push((() => {
  let it = [];
  const half = [];
  half.push(...col(lineS(95, 880, 205, 760, 40).concat(lineS(145, 925, 255, 805, 40)), 'purple'));
  half.push(...col(ringS(150, 930, 34, 36), 'red', 13));
  const R = K.rng(41), conf = [];
  for (let k = 0; k < 600 && conf.length < 24; k++) {
    const a = (-52 + (R() - 0.5) * 46) * D, d = 110 + R() * 470;
    const p = { x: 245 + Math.cos(a) * d, y: 770 + Math.sin(a) * d };
    if (p.x > 480 || p.y < 190 || conf.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 56)) continue;
    conf.push(p);
  }
  half.push(...col(conf, () => SKY[Math.floor(R() * SKY.length)], 14));
  it.push(...K.mirror(half));
  it.push(...col(ringS(500, 330, 40, 44), 'yellow'));
  it = put(it, 2, 42, 'zap', p => p.r === 14);
  it = put(it, 2, 43, 'spray', p => p.r === 14);
  it = goalX(tidy(it), 9, 44, 'orange', 7, p => p.r === 14);
  return lvl({ name: 'Confetti Cannons', intro: 'Break the nine orange pegs. New: lightning lights the nearest pegs, and spray fires three balls.', goal: { type: 'color', color: 'orange' }, balls: 10, plate: { w: 240, speed: 150, mode: 'catch' }, items: it });
})());

// 5 — a striped hot air balloon. Safety net and blast ball, gems goal.
carn.push((() => {
  let it = [];
  const cx = 500, cy = 420;
  it.push(...col(ellS(cx, cy, 225, 235, 52), 'red'));
  it.push(...col(ellS(cx, cy, 135, 235, 54).filter(p => Math.abs(p.y - cy) < 190), 'yellow'));
  it.push(...col(lineS(cx, cy - 160, cx, cy + 160, 64), 'yellow'));
  it.push(...rope(395, 640, 450, 760, 'yellow'), ...rope(605, 640, 550, 760, 'yellow'));
  it.push(...col(fill(440, 790, 560, 850, 60, 58, null, false), 'purple'));
  it.push(...as([[cx - 180, cy - 40], [cx + 180, cy - 40], [cx - 70, cy - 110], [cx + 70, cy + 60], [cx - 70, cy + 120], [cx + 70, cy - 170]].map(([x, y]) => ({ x, y })), 'gem', { r: 17 }));
  it.push(K.item('gem', 500, 880));
  it.push(K.item('net', cx - 70, cy + 20), K.item('blast', cx + 70, cy - 40), K.item('blast', cx - 180, cy + 90));
  it.push(...col(cloud(130, 760, 48), 'blue', 14), ...col(cloud(870, 760, 48), 'blue', 14));
  return lvl({ name: 'Hot Air Balloon', intro: 'Collect all seven gems. New: a safety net catches your next ball, and a blast ball explodes.', goal: { type: 'gems' }, balls: 10, plate: { w: 240, speed: 150, mode: 'bounce' }, items: tidy(it) });
})());

// 6 — the strongman bell. Barrier bricks, bricks goal.
carn.push((() => {
  let it = [];
  const hp = [1, 1, 1, 2, 2, 2, 3, 3];
  for (let k = 0; k < 8; k++) it.push(K.brick(500, 890 - k * 72, 120, 28, 0, hp[k]));
  it.push(...col(arcS(500, 300, 54, 180, 360, 40), 'yellow'), K.peg(500, 300, 'red', 14));
  for (let k = 0; k < 8; k++) it.push(K.peg(390, 890 - k * 72, k % 2 ? 'red' : 'yellow', 13), K.peg(610, 890 - k * 72, k % 2 ? 'red' : 'yellow', 13));
  it.push(...col(lineS(130, 950, 215, 700, 44), 'purple'));
  it.push(K.brick(228, 662, 110, 40, -18, 2));
  it.push(K.brick(800, 300, 90, 28, 0, 1), K.brick(200, 300, 90, 28, 0, 1), K.brick(830, 760, 90, 28, 20, 1));
  it.push(...col(fill(700, 450, 900, 640, 70, 62), ['teal', 'pink']), ...col(fill(100, 420, 300, 560, 70, 62), ['teal', 'pink']));
  return lvl({ name: 'Strongman Bell', intro: 'Break every brick. New: barrier bricks show the hits they have left with colour and dots.', goal: { type: 'bricks' }, balls: 10, plate: { w: 230, speed: 160, mode: 'catch' }, items: tidy(it) });
})());

// 7 — the big top. Bumpers and steel posts.
carn.push((() => {
  let it = [];
  it.push(...col(lineS(500, 240, 170, 560, 46).concat(lineS(500, 240, 830, 560, 46).slice(1)), 'red'));
  for (const x of [370, 630]) it.push(...col(lineS(500 + (x - 500) * 0.4, 360, x, 540, 56), 'yellow'));
  for (let k = 0; k < 5; k++) it.push(...col(arcS(234 + k * 133, 575, 64, 15, 165, 40), k % 2 ? 'yellow' : 'red'));
  it.push(K.item('steel', 500, 205, { r: 14 }), K.item('steel', 330, 760), K.item('steel', 670, 760), K.item('steel', 500, 700));
  it.push(...col(ellS(500, 890, 250, 52, 56), 'purple'));
  it.push(K.item('bumper', 400, 880), K.item('bumper', 500, 880), K.item('bumper', 600, 880));
  it.push(...col(fill(80, 660, 220, 820, 76, 70), ['teal', 'pink']), ...col(fill(780, 660, 920, 820, 76, 70), ['teal', 'pink']));
  it = goalX(tidy(it), 10, 71, 'orange', 7);
  return lvl({ name: 'Big Top', intro: 'Break the ten orange pegs. New: bumpers fling your ball, and steel posts never break.', goal: { type: 'color', color: 'orange' }, balls: 10, plate: { w: 230, speed: 160, mode: 'timed', period: 3 }, items: it });
})());

// 8 — ring toss on glass shelves. Glass, lanterns goal.
carn.push((() => {
  let it = [];
  const shelves = [[430, 300, 700, 4], [620, 200, 800, 6], [810, 110, 890, 8]];
  shelves.forEach(([y, x0, x1, n]) => it.push(...brickRow(x0, y, x1, y, n, { t: 'glass', w: (x1 - x0) / n - 10, h: 16 })));
  it.push(...as([[380, 395], [500, 395], [620, 395], [260, 585], [740, 585], [170, 775], [500, 775], [830, 775]].map(([x, y]) => ({ x, y })), 'lantern', { r: 17 }));
  const R = K.rng(81);
  [[200, 250], [500, 230], [800, 250], [120, 470], [880, 470]].forEach(([x, y], i) => it.push(...col(ringS(x, y, 34, 36), SKY[i], 13)));
  it.push(...col(scatter(82, 12, 60, 450, 940, 960, (x, y) => [430, 620, 810].some(sy => Math.abs(y - sy) < 60) || Math.abs(x - 500) < 50), () => SKY[Math.floor(R() * 7)], 14));
  return lvl({ name: 'Ring Toss', intro: 'Light all eight lanterns. New: glass shatters at the first touch, and your ball flies through.', goal: { type: 'lanterns' }, balls: 10, plate: { w: 230, speed: 160, mode: 'bounce' }, items: tidy(it) });
})());

// 9 — a ticket booth with the jackpot behind a gate. Keys and gates, score goal.
carn.push((() => {
  let it = [];
  it.push(K.wall(330, 650, 300, 20, 90), K.wall(670, 650, 300, 20, 90), K.wall(500, 810, 360, 20, 0));
  it.push(K.gate(500, 490, 320, 20, 0, 'yellow'));
  it.push(...col(polyS([[300, 470], [500, 330], [700, 470]], 46), 'red'));
  it.push(K.item('multiplier', 420, 580), K.item('multiplier', 580, 580), K.item('extra', 500, 700));
  it.push(...as([[420, 700], [580, 700], [500, 580]].map(([x, y]) => ({ x, y })), 'gem', { r: 17 }));
  it.push(...col([[400, 760], [600, 760], [460, 640], [540, 640]].map(([x, y]) => ({ x, y })), 'yellow', 14));
  it.push(K.item('key', 140, 380, { k: 'yellow' }), K.item('key', 860, 380, { k: 'yellow' }));
  it.push(...col(vwaveS(160, 480, 940, 40, 1.5, 48), stripes(['pink', 'teal'], 1)), ...col(vwaveS(840, 480, 940, 40, 1.5, 48, Math.PI), stripes(['pink', 'teal'], 1)));
  it.push(...col(arcS(500, 330, 330, 205, 335, 64), 'purple', 14));
  return lvl({ name: 'Ticket Booth', intro: 'Score twelve thousand. New: hit a key to open the gate of the same colour.', goal: { type: 'score', score: 12000 }, balls: 10, plate: { w: 220, speed: 170, mode: 'catch' }, items: tidy(it) });
})());

// 10 — fireworks bursting. Fireball and super guide, chain goal.
function burst(cx, cy, rays, r0, r1, sp, c, rot) {
  const out = [];
  for (let k = 0; k < rays; k++) out.push(...col(lineS(...Object.values(polar(cx, cy, r0, (rot || 0) + k * 360 / rays)), ...Object.values(polar(cx, cy, r1, (rot || 0) + k * 360 / rays)), sp), typeof c === 'function' ? c(k) : c));
  return out;
}
carn.push((() => {
  let it = [];
  it.push(...burst(250, 330, 8, 50, 140, 50, (k) => (k % 2 ? 'pink' : 'yellow')));
  it.push(...burst(750, 310, 8, 50, 140, 50, (k) => (k % 2 ? 'teal' : 'purple'), 22));
  it.push(...burst(500, 650, 10, 52, 165, 52, (k) => (k % 2 ? 'red' : 'green'), 10));
  it.push(...rope(150, 960, 230, 520, 'yellow', 50), ...rope(850, 960, 770, 500, 'yellow', 50));
  it.push(K.item('fire', 260, 340), K.item('fire', 740, 320), K.item('guide', 500, 640));
  return lvl({ name: 'Fireworks', intro: 'Light eighteen pegs in one shot. New: fireballs burn through, and super guide shows the path.', goal: { type: 'chain', chain: 18 }, balls: 10, plate: { w: 220, speed: 170, mode: 'bounce' }, items: tidy(it) });
})());

// 11 — the hall of mirrors. Thieves and shrinkers.
carn.push((() => {
  let it = [];
  [170, 335, 500, 665, 830].forEach((x, i) => {
    it.push(...col(vwaveS(x, 300, 880, 24, 1.5, 50, i * 1.1), i % 2 ? 'purple' : 'teal'));
    it.push(...col(arcS(x, 290, 44, 200, 340, 38), 'yellow', 13));
  });
  it.push(...col(waveS(90, 910, 950, 10, 5, 66), 'pink', 14));
  it = put(it, 2, 111, 'thief', p => p.r === 17, 'none');
  it = put(it, 3, 112, 'shrink', p => p.r === 17, 'none');
  it = put(it, 1, 113, 'extra', p => p.r === 17, 'none');
  it = goalX(tidy(it), 11, 114, 'orange', 6, p => p.r === 17);
  return lvl({ name: 'Hall of Mirrors', intro: 'Break the eleven orange pegs. New: thieves steal powers, and shrinkers make your ball small.', goal: { type: 'color', color: 'orange' }, balls: 10, plate: { w: 220, speed: 170, mode: 'timed', period: 3 }, items: it });
})());

// 12 — floating islands joined by sky gates. Portals, gems goal.
carn.push((() => {
  let it = [];
  const isl = [[190, 300, 'teal'], [810, 300, 'teal'], [500, 420, 'pink'], [250, 650, 'purple'], [750, 650, 'purple']];
  isl.forEach(([x, y, c]) => { it.push(...col(cloud(x, y, 62), c)); it.push(K.item('gem', x, y - 4)); });
  it.push(K.item('gem', 120, 470), K.item('gem', 880, 470), K.item('gem', 500, 610));
  it.push(K.item('portal', 500, 870, { p: 0 }), K.item('portal', 500, 230, { p: 0 }));
  it.push(K.item('portal', 110, 880, { p: 1 }), K.item('portal', 890, 200, { p: 1 }));
  it.push(...col(waveS(220, 780, 940, 12, 3, 64).filter(p => Math.abs(p.x - 500) > 70), 'yellow', 14));
  return lvl({ name: 'Sky Gates', intro: 'Collect all eight gems. New: sky gate portals send your ball to their twin.', goal: { type: 'gems' }, balls: 10, plate: { w: 220, speed: 170, mode: 'catch' }, items: tidy(it) });
})());

// 13 — the ferris wheel turns. Moving pieces, lanterns goal.
carn.push((() => {
  let it = [];
  const cx = 500, cy = 470, R0 = 230;
  let wheel = col(ringS(cx, cy, R0, 58), 'yellow');
  for (let k = 0; k < 8; k++) wheel.push(...col(lineS(...Object.values(polar(cx, cy, 64, k * 45 + 22.5)), ...Object.values(polar(cx, cy, 180, k * 45 + 22.5)), 58), 'blue', 14));
  wheel = wheel.filter(p => !Array.from({ length: 8 }, (_, k) => polar(cx, cy, R0, k * 45)).some(q => Math.hypot(q.x - p.x, q.y - p.y) < 36));
  wheel.push(...as(Array.from({ length: 8 }, (_, k) => polar(cx, cy, R0, k * 45)), 'lantern', { r: 17 }));
  it.push(...K.spin(space(wheel), cx, cy, 20));
  it.push(K.peg(cx, cy, 'red', 20));
  it.push(...col(lineS(445, 748, 330, 950, 44).concat(lineS(555, 748, 670, 950, 44)), 'purple'));
  it.push(...bunting(60, 300, 200, 50, 60, ['red', 'teal', 'pink']), ...bunting(700, 940, 200, 50, 60, ['red', 'teal', 'pink']));
  it.push(...col(fill(80, 640, 200, 900, 62, 64), ['pink', 'teal']), ...col(fill(800, 640, 920, 900, 62, 64), ['pink', 'teal']));
  return lvl({ name: 'Ferris Wheel', intro: 'Light all eight lanterns. New: some pieces move. The ferris wheel slowly turns.', goal: { type: 'lanterns' }, balls: 10, plate: { w: 220, speed: 170, mode: 'timed', period: 3 }, items: tidy(it) });
})());

// 14 — a popcorn stand bursting over. Sludge, count goal.
carn.push((() => {
  let it = [];
  it.push(...col(polyS([[330, 640], [670, 640], [600, 940], [400, 940]], 46, true), stripes(['red', 'yellow'], 1)));
  it.push(...col(lineS(415, 690, 445, 890, 50).concat(lineS(500, 690, 500, 890, 50), lineS(585, 690, 555, 890, 50)), 'red', 14));
  const R = K.rng(141), pop = [];
  for (let k = 0; k < 400 && pop.length < 46; k++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 1;
    const p = { x: 500 + Math.cos(a) * d * 330, y: 420 + Math.sin(a) * d * 200 };
    if (p.y > 600 || p.y < 190 || pop.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 52)) continue;
    pop.push(p);
  }
  it.push(...col(pop, () => (R() < 0.75 ? 'yellow' : 'pink'), 15));
  it.push(...col(scatter(142, 10, 60, 600, 940, 960, (x, y) => x > 280 && x < 720), 'yellow', 14));
  it = put(it, 4, 143, 'sludge', p => p.r === 15, 'none');
  it = put(it, 1, 144, 'multiball', p => p.r === 15, 'none');
  return lvl({ name: 'Popcorn Stand', intro: 'Break any fifty pegs. New: sticky sludge pegs slow your ball right down.', goal: { type: 'count', count: 50 }, balls: 10, plate: { w: 210, speed: 180, mode: 'bounce' }, items: tidy(it) });
})());

// 15 — an armoured zeppelin. Armour bricks, bricks goal.
carn.push((() => {
  let it = [];
  const cx = 500, cy = 430, rx = 300, ry = 120;
  const hull = [];
  for (let k = 0; k < 14; k++) {
    const a = k * 360 / 14 * D, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    const ang = Math.atan2(Math.cos(a) * ry, -Math.sin(a) * rx) / D;
    hull.push(k % 2 ? K.brick(x, y, 66, 22, ang, 2) : K.armor(x, y, 66, 22, ang, 1));
  }
  it.push(...hull);
  it.push(K.item('zap', 330, 430), K.item('zap', 670, 430), K.item('zap', 500, 380));
  it.push(...col(lineS(380, 470, 620, 470, 60), 'yellow'));
  it.push(...brickRow(430, 600, 570, 600, 2, { w: 66, h: 26, hp: 1 }));
  it.push(K.brick(840, 360, 70, 22, -40, 1), K.brick(840, 500, 70, 22, 40, 1));
  it.push(K.item('blast', 180, 230), K.item('blast', 820, 230), K.item('fire', 500, 760));
  it.push(...col(cloud(200, 760, 55), 'blue', 14), ...col(cloud(800, 760, 55), 'blue', 14), ...col(cloud(500, 900, 50), 'blue', 14));
  return lvl({ name: 'Zeppelin', intro: 'Break every brick. New: armour bricks only crack from blasts, fireballs and lightning.', goal: { type: 'bricks' }, balls: 10, plate: { w: 210, speed: 180, mode: 'catch' }, items: tidy(it) });
})());

// 16 — a biplane towing a banner across the sky. Sliding pieces.
carn.push((() => {
  let it = [];
  const plane = [];
  // side view, flying right: fuselage, two wings, propeller, tail fin; a tow line to the banner
  plane.push(...col(lineS(600, 410, 790, 410, 42), 'red'));
  plane.push(...col(lineS(640, 345, 760, 345, 40).concat(lineS(640, 475, 760, 475, 40)), 'yellow'));
  plane.push(...col(lineS(820, 375, 820, 445, 35), 'teal', 13));
  plane.push(...col(lineS(600, 370, 600, 335, 35), 'red'));
  plane.push(...col(lineS(445, 410, 560, 410, 57), 'yellow', 12));
  plane.push(...col(polyS([[180, 360], [410, 360], [410, 460], [180, 460]], 46, true), stripes(['pink', 'purple'], 1)));
  it.push(...K.slide(space(plane), 100, 0, 5));
  it.push(...col(cloud(210, 650, 60), 'blue', 14), ...col(cloud(790, 650, 60), 'blue', 14), ...col(cloud(500, 830, 60), 'blue', 14), ...col(cloud(500, 215, 48), 'blue', 14));
  it.push(...col(fill(60, 220, 150, 290, 60, 56).concat(fill(850, 220, 940, 290, 60, 56)), ['purple', 'teal']));
  it.push(...col(waveS(70, 930, 950, 12, 4, 62), 'green', 14));
  it = goalX(tidy(it), 12, 161, 'orange', 6, p => p.r >= 14);
  return lvl({ name: 'Banner Plane', intro: 'Break the twelve orange pegs. New: some pieces slide. The banner plane flies to and fro.', goal: { type: 'color', color: 'orange' }, balls: 10, plate: { w: 210, speed: 190, mode: 'timed', period: 3 }, items: it });
})());

// 17 — the high wire. Spikes, clear goal.
carn.push((() => {
  let it = [];
  for (const x of [120, 880]) it.push(...as(lineS(x, 260, x, 900, 64), 'steel', { r: 15 }));
  [[330, 60], [530, 70], [730, 60]].forEach(([y, sag], i) => it.push(...col(spaced(curve(u => ({ x: 170 + 660 * u, y: y + sag * (1 - Math.pow(2 * u - 1, 2)) })), 66), i % 2 ? 'teal' : 'pink')));
  it.push(...col(ringS(380, 430, 30, 34), 'yellow', 13), ...col(ringS(620, 630, 30, 34), 'yellow', 13));
  it.push(K.item('spike', 330, 945, { r: 16 }), K.item('spike', 670, 945, { r: 16 }));
  it.push(K.item('extra', 500, 240));
  return lvl({ name: 'High Wire', intro: 'Clear every peg. New: spikes never break, and they pop any ball that touches them.', goal: { type: 'clear' }, balls: 10, plate: { w: 200, speed: 190, mode: 'catch' }, items: tidy(it) });
})());

// 18 — a balloon race: balloons drift on little loops. Orbiting pieces, gems goal.
carn.push((() => {
  let it = [];
  [[200, 380, 0], [500, 340, 0.25], [800, 380, 0.5], [330, 630, 0.75], [670, 630, 0.1]].forEach(([x, y, ph], i) => {
    const grp = space(col(ringS(x, y, 44, 46), SKY[i], 15).concat([K.peg(x, y + 70, SKY[i], 12)]));
    grp.push(K.item('gem', x, y + 102));
    it.push(...grp.map(p => Object.assign({}, p, { m: { type: 'orbit', r: 34, speed: 60, phase: ph } })));
  });
  it.push(K.item('gem', 500, 535), K.item('gem', 120, 860), K.item('gem', 880, 860));
  it.push(...bunting(60, 340, 175, 24, 64, ['red', 'yellow', 'blue']), ...bunting(660, 940, 175, 24, 64, ['red', 'yellow', 'blue']));
  it.push(...col(fill(210, 840, 790, 940, 72, 64), ['teal', 'pink']));
  it.push(K.item('extra', 500, 750));
  return lvl({ name: 'Balloon Race', intro: 'Collect all eight gems. New: some balloons drift around in little loops.', goal: { type: 'gems' }, balls: 10, plate: { w: 200, speed: 190, mode: 'timed', period: 3 }, items: tidy(it) });
})());

// 19 — the grand carousel: bobbing horses under a striped canopy.
carn.push((() => {
  let it = [];
  it.push(...col(lineS(500, 220, 160, 400, 54).concat(lineS(500, 220, 840, 400, 54).slice(1)), stripes(['red', 'yellow'], 1)));
  for (let k = 0; k < 5; k++) it.push(...col(arcS(208 + k * 146, 420, 72, 20, 160, 52), k % 2 ? 'red' : 'yellow'));
  it.push(...col(ellS(500, 905, 330, 46, 74), 'purple'));
  [230, 365, 500, 635, 770].forEach((x, i) => {
    it.push(...as(lineS(x, 520, x, 560, 40).concat(lineS(x, 790, x, 840, 50)), 'steel', { r: 12 }));
    const horse = space(col(ellS(x, 680, 44, 30, 36), SKY[i], 14));
    it.push(...K.slide(horse, 0, 44, 3, i * 0.2));
  });
  it.push(K.gate(500, 470, 120, 18, 0, 'pink'), K.item('extra', 500, 445));
  it.push(K.item('key', 100, 560, { k: 'pink' }), K.item('key', 900, 560, { k: 'pink' }));
  it = goalX(tidy(it), 13, 191, 'orange', 6, p => p.r >= 14);
  return lvl({ name: 'Grand Carousel', intro: 'Break the thirteen orange pegs on the grand carousel.', goal: { type: 'color', color: 'orange' }, balls: 10, plate: { w: 190, speed: 200, mode: 'catch' }, items: it });
})());

// 20 — finale: a turning firework over the midway.
carn.push((() => {
  let it = [];
  const fw = space(burst(500, 470, 8, 64, 200, 50, (k) => (k % 2 ? 'pink' : 'yellow')));
  it.push(...K.spin(fw, 500, 470, 24));
  it.push(K.peg(500, 470, 'red', 12));
  it.push(...bunting(60, 330, 200, 40, 60, ['red', 'teal', 'purple']), ...bunting(670, 940, 200, 40, 60, ['red', 'teal', 'purple']));
  it.push(K.item('portal', 110, 900, { p: 0 }), K.item('portal', 890, 300, { p: 0 }), K.item('portal', 890, 900, { p: 1 }), K.item('portal', 110, 300, { p: 1 }));
  for (const s of [-1, 1]) it.push(...col(lineS(500 + s * 330, 420, 500 + s * 330, 740, 54), stripes(['teal', 'purple'], 1)), ...col(arcS(500 + s * 330, 380, 40, 200, 340, 40), 'red', 14));
  it.push(...brickRow(240, 800, 760, 800, 6, { w: 70, h: 24, hp: 2 }));
  it.push(...col(fill(250, 860, 750, 950, 70, 60), ['teal', 'pink', 'yellow']));
  it.push(K.item('blast', 300, 250), K.item('zap', 700, 250));
  it = put(it, 2, 201, 'shrink', p => p.r === 12 && !p.m, 'none');
  it = goalX(tidy(it), 14, 202, 'orange', 6, p => p.r >= 14 && !p.m);
  return lvl({ name: 'Grand Finale', intro: 'Break all fourteen orange pegs for the grand finale.', goal: { type: 'color', color: 'orange' }, balls: 10, plate: { w: 180, speed: 220, mode: 'timed', period: 2.5 }, items: it });
})());

/* ══ Export ═══════════════════════════════════════════════════════════════ */

module.exports = [
  { id: 'vivid-sugar-rush', title: 'Sugar Rush', theme: 'sugar-rush', blurb: 'Lollipops, gumdrops and a giant donut. The gentlest climb, sweet from the first shot to the last.', levels: sugar },
  { id: 'vivid-carnival-skies', title: 'Carnival Skies', theme: 'carnival-skies', blurb: 'Balloons, kites and a turning ferris wheel high above the midway. A brisker climb.', levels: carn },
  require('./coral.cjs')
];
