/**
 * Benny's P3GL — the three Cozy campaigns (60 levels).
 *
 *   node tools/build-campaigns.cjs cozy --bot --runs 4
 *
 * Cozy is relaxed: the ball never runs out, the plate is usually a wide, slow
 * catch plate, and there are no ball-killing hazards. Difficulty stays flat;
 * what changes from level to level is the kind of fun (the goal), the layout
 * and the gentle new toys each campaign introduces.
 */
const K = require('../levelkit.cjs');

const D2R = Math.PI / 180;

/* ── Geometry ─────────────────────────────────────────────────────────── */

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pt = (x, y) => ({ x, y });

/** Equal arc-length points along a polyline (spacing ≈ step). */
function resample(pts, step, closed) {
  const P = closed ? pts.concat([pts[0]]) : pts;
  const segs = [];
  let total = 0;
  for (let i = 0; i < P.length - 1; i++) { const l = dist(P[i], P[i + 1]); segs.push(l); total += l; }
  const n = closed ? Math.max(3, Math.round(total / step)) : Math.max(2, Math.round(total / step) + 1);
  const d = closed ? total / n : total / (n - 1);
  const out = [];
  for (let k = 0; k < n; k++) {
    let s = k * d, i = 0;
    while (i < segs.length - 1 && s > segs[i]) { s -= segs[i]; i++; }
    const u = segs[i] ? Math.min(1, s / segs[i]) : 0;
    out.push(pt(P[i].x + (P[i + 1].x - P[i].x) * u, P[i].y + (P[i + 1].y - P[i].y) * u));
  }
  return out;
}

/** Sample a parametric curve fn(t), t in 0..1. */
function curve(fn, n) { const out = []; for (let i = 0; i <= (n || 240); i++) out.push(fn(i / (n || 240))); return out; }

/** Points along an ellipse arc (angles in degrees, 0 = right, 90 = down), spaced by step. */
function ellArc(cx, cy, rx, ry, a0, a1, step) {
  return resample(curve(t => { const a = (a0 + (a1 - a0) * t) * D2R; return pt(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }), step, false);
}
const arcS = (cx, cy, r, a0, a1, step) => ellArc(cx, cy, r, r, a0, a1, step);

/** n points on a full circle, first one at angle rot (degrees). */
function ringN(cx, cy, r, n, rot) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = ((rot || 0) + i * 360 / n) * D2R; out.push(pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
  return out;
}

/** A smooth curve through control points (Catmull-Rom), resampled at step. */
function spline(ctrl, step, closed) {
  const N = ctrl.length, pts = [];
  const get = (i) => (closed ? ctrl[(i + N) % N] : ctrl[Math.max(0, Math.min(N - 1, i))]);
  const segs = closed ? N : N - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < 40; k++) {
      const t = k / 40, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push(pt(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y)));
    }
  }
  if (!closed) pts.push(ctrl[N - 1]);
  return resample(pts, step, closed);
}

/** A leaf outline: tips len apart, widest half-width wid/2, rotated by ang. */
function leafShape(cx, cy, len, wid, ang, step) {
  const k = ang * D2R, c = Math.cos(k), s = Math.sin(k);
  const P = [];
  for (let i = 0; i <= 60; i++) { const t = i / 60; P.push([(t - 0.5) * len, -Math.sin(Math.PI * t) * wid / 2]); }
  for (let i = 59; i >= 1; i--) { const t = i / 60; P.push([(t - 0.5) * len, Math.sin(Math.PI * t) * wid / 2]); }
  return resample(P.map(([x, y]) => pt(cx + x * c - y * s, cy + x * s + y * c)), step, true);
}

/** Seeded dart-throwing scatter: n points at least minD apart (and away from `avoid`). */
function scatter(seed, n, inside, minD, avoid, avoidD) {
  const R = K.rng(seed), out = [];
  let tries = 0;
  while (out.length < n && tries < n * 600) {
    tries++;
    const p = pt(60 + R() * 880, 180 + R() * 790);
    if (inside && !inside(p)) continue;
    if (out.some(q => dist(p, q) < minD)) continue;
    if (avoid && avoid.some(q => dist(p, q) < (avoidD || minD) + (q.r || 0))) continue;
    out.push(p);
  }
  return out;
}

/** Keep the points of `list` that are at least d from every item of `others`. */
function away(list, others, d) { return list.filter(p => others.every(q => dist(p, q) >= d + (q.r || 0))); }

/** Six-fold copies around a centre (snowflakes). */
function sym(list, cx, cy, n) { let out = []; for (let i = 0; i < n; i++) out = out.concat(K.rotateAbout(list, cx, cy, i * 360 / n)); return out; }

/** Flip a list top-to-bottom about the line y = cy (lake reflections). */
function reflect(list, cy) {
  return list.map(p => { const q = Object.assign({}, p, { y: 2 * cy - p.y }); if (q.a !== undefined) q.a = (360 - q.a) % 360; return q; });
}

/* ── Items ────────────────────────────────────────────────────────────── */

const P = (pos, c, r) => K.pegs(pos, c, r || 17);
const T = (pos, t, o) => K.as(pos, t, o);
const lanterns = (pos, r) => T(pos, 'lantern', { r: r || 19 });
const gems = (pos, r) => T(pos, 'gem', { r: r || 17 });

/** Colour pegs in a repeating pattern. */
const paint = (items, colors) => K.color(items, colors);

/** Turn spread-out pegs into the given types, one each (powers, keys…). */
function sprinkle(items, types, seed, filter) {
  const idx = K.spreadPick(items, types.length, seed, filter || (p => p.t === 'peg'));
  const out = items.slice();
  idx.forEach((i, k) => {
    const q = Object.assign({}, out[i], { t: types[k] });
    delete q.c;
    if (types[k] !== 'lantern' && types[k] !== 'gem') q.r = Math.max(q.r || 17, 17);
    out[i] = q;
  });
  return out;
}

/** Recolour n spread-out pegs (goal colours). */
function tint(items, n, color, seed, filter) {
  const idx = new Set(K.spreadPick(items, n, seed, filter || (p => p.t === 'peg')));
  return items.map((p, i) => (idx.has(i) ? Object.assign({}, p, { c: color }) : p));
}

/**
 * Where a ball reaches easily. Random aim rarely finds the bottom centre
 * (straight under the launcher) or the top corners, so goal pieces and
 * powers stay out of those spots.
 */
const easy = (p) => !(p.y > 700 && Math.abs(p.x - 500) < 150) && !(p.y < 260 && Math.abs(p.x - 500) > 340) && p.y > 190;
const reach = (p) => p.t === 'peg' && easy(p);

/** Final tidy: nudge still pegs apart, drop pegs sitting on bricks, round. */
function tidy(items, pad) {
  const flat = items.flat(4);
  const movers = flat.filter(i => i.m);
  const still = K.clean(flat.filter(i => !i.m), { pad: pad === undefined ? 6 : pad });
  return K.clearAround(still).concat(movers.map(i => Object.assign({}, i, { x: Math.round(i.x), y: Math.round(i.y) })));
}

/* ── Plates ───────────────────────────────────────────────────────────── */

const catchP = (w, speed, x) => ({ w: w || 300, speed: speed === undefined ? 90 : speed, mode: 'catch', x: x || 500 });
const timedP = (period, w, speed) => ({ w: w || 300, speed: speed === undefined ? 90 : speed, mode: 'timed', period });
const bounceP = (w, speed) => ({ w: w || 260, speed: speed === undefined ? 80 : speed, mode: 'bounce' });
const stillP = (x, w, mode) => ({ w: w || 300, speed: 0, mode: mode || 'catch', x });

/* ── Levels ───────────────────────────────────────────────────────────── */

/** Points on the board that a ball can earn by breaking things (no fever). */
function basePoints(items) {
  let b = 0;
  for (const it of items) {
    const d = K.C.TYPES[it.t];
    if (K.C.isBreakablePeg(it.t) || it.t === 'lantern' || K.C.isBreakableBrick(it.t)) b += d.points + (it.hp > 1 ? 50 * (it.hp - 1) : 0);
  }
  return b;
}

function lvl(o) {
  if (o.name.length > 24) throw new Error('name too long: ' + o.name);
  if (o.intro.length > 110) throw new Error('intro too long (' + o.intro.length + '): ' + o.intro);
  const items = tidy(o.items, o.pad);
  let goal = o.goal;
  // Cozy must remain finishable even when every peg is hit in a separate shot.
  // Fever now resets each shot, so keep the goal below the board's base points.
  if (goal.type === 'score' && goal.frac) goal = { type: 'score', score: Math.max(500, Math.floor(basePoints(items) * Math.min(goal.frac, 0.9) / 500) * 500) };
  const out = { name: o.name, intro: o.intro, goal, balls: o.balls || 10, plate: o.plate || catchP(), items };
  if (o.gravity) out.gravity = o.gravity;
  if (o.speed) out.speed = o.speed;
  if (o.guide) out.guide = o.guide;
  return K.level(out);
}

/* ════════════════════════════════════════════════════════════════════════
 * 1. LANTERN GARDEN — a dusky garden of paper lanterns and fireflies
 * ════════════════════════════════════════════════════════════════════════ */

const lanternGarden = [];

// 1. A garden arch hung with lanterns.
lanternGarden.push(lvl({
  name: 'Garden Gate',
  intro: 'Welcome to the garden. Light every paper lantern hanging under the arch.',
  goal: { type: 'lanterns' }, plate: catchP(320, 80),
  items: (() => {
    const arch = ellArc(500, 900, 345, 610, 180, 360, 66);
    const vine = arch.map((p, i) => K.peg(p.x, p.y, i % 3 === 1 ? 'pink' : 'green'));
    const lan = [220, 245, 270, 295, 320].map(a => pt(500 + Math.cos(a * D2R) * 240, 900 + Math.sin(a * D2R) * 470));
    lan.push(pt(105, 420), pt(895, 420), pt(500, 225));
    const bed = (cx, cy) => P(ringN(cx, cy, 44, 5, -90), 'pink', 14).concat([K.peg(cx, cy, 'yellow', 13)]);
    const path = P(K.line(360, 905, 640, 905, 5), 'yellow', 15);
    return [vine, lanterns(lan), bed(95, 600), bed(905, 600), path];
  })()
}));

// 2. Three open flowers.
lanternGarden.push(lvl({
  name: 'Petal Path',
  intro: 'Clear every peg from the flower bed. New: a multiball peg sends out two more balls.',
  goal: { type: 'clear' }, plate: catchP(330, 80),
  items: (() => {
    const flower = (cx, cy, c, centre) => P(ringN(cx, cy, 90, 9, -90), c, 16).concat([K.item(centre, cx, cy, { r: 18, c: 'yellow' })]);
    const stemL = spline([pt(262, 500), pt(215, 590), pt(185, 690)], 74);
    const stemR = stemL.map(p => pt(1000 - p.x, p.y));
    return [flower(270, 380, 'pink', 'multiball'), flower(730, 380, 'purple', 'multiball'), flower(500, 590, 'pink', 'multiball'), P(stemL, 'green', 15), P(stemR, 'green', 15)];
  })()
}));

// 3. A swarm of fireflies over the meadow grass.
lanternGarden.push(lvl({
  name: 'Firefly Meadow',
  intro: 'Catch the fireflies. Break thirty pegs. New: an extra ball peg gives you one more ball.',
  goal: { type: 'count', count: 30 }, plate: catchP(300, 100),
  items: (() => {
    const grass = P(K.wave(80, 920, 905, 22, 3, 14), 'green', 15);
    const flies = scatter('lg3', 44, p => ((p.x - 500) / 410) ** 2 + ((p.y - 520) / 300) ** 2 < 1, 72);
    let swarm = flies.map((p, i) => K.peg(p.x, p.y, i % 5 === 0 ? 'green' : 'yellow', 13));
    swarm = sprinkle(swarm, ['extra', 'extra'], 'lg3x', reach);
    return [grass, swarm];
  })()
}));

// 4. A winding stepping-stone path lined with lanterns.
lanternGarden.push(lvl({
  name: 'Stepping Stones',
  intro: 'Follow the stepping stones and light the lanterns. New: lightning lights the pegs nearby.',
  goal: { type: 'lanterns' }, plate: stillP(780, 300),
  items: (() => {
    const path = spline([pt(150, 270), pt(420, 320), pt(720, 380), pt(820, 520), pt(640, 640), pt(360, 680), pt(200, 790), pt(360, 900), pt(640, 900), pt(850, 840)], 76);
    let stones = P(path, 'blue', 19);
    stones = sprinkle(stones, ['zap', 'zap'], 'lg4', reach);
    const lan = lanterns([pt(300, 400), pt(600, 280), pt(700, 480), pt(530, 560), pt(300, 590), pt(110, 560), pt(280, 900), pt(720, 790), pt(860, 680)]);
    const bloom = (cx, cy) => P(ringN(cx, cy, 34, 4, 45), 'pink', 12);
    return [stones, lan, bloom(140, 470), bloom(870, 280), bloom(120, 640), bloom(560, 400)];
  })()
}));

// 5. Terraced rows of hedges with red roses.
lanternGarden.push(lvl({
  name: 'Rose Terraces',
  intro: 'Pick the red roses. Break every red peg along the terraces.',
  goal: { type: 'color', color: 'red' }, plate: catchP(300, 90),
  items: (() => {
    let rows = [];
    [640, 810, 980].forEach((r, k) => {
      const pts = arcS(500, -260, r, 25, 155, 68).filter(p => p.y > 170 && p.x > 60 && p.x < 940);
      rows = rows.concat(pts.map((p, i) => K.peg(p.x, p.y, (i + k) % 4 === 0 ? 'pink' : (i + k) % 4 === 2 ? 'yellow' : 'green', 16)));
    });
    rows = tint(rows, 10, 'red', 'lg5', reach);
    const fountain = P(ringN(500, 880, 60, 6, -90), 'teal', 15);
    return [rows, fountain];
  })()
}));

// 6. A formal garden of diamond hedges.
lanternGarden.push(lvl({
  name: 'Diamond Hedges',
  intro: 'Trim the hedges. New: green hedge bricks break when your ball hits them.',
  goal: { type: 'bricks' }, plate: catchP(300, 90),
  items: (() => {
    const diamond = (cx, cy, h, bw) => {
      const out = [];
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        out.push(K.brick(cx + sx * h / 2, cy + sy * h / 2, bw, 20, sx * sy > 0 ? 45 : -45, 1));
      }
      return out;
    };
    const hedges = [diamond(500, 560, 190, 150), diamond(220, 380, 130, 100), diamond(780, 380, 130, 100), diamond(220, 780, 130, 100), diamond(780, 780, 130, 100)];
    const flowers = P([pt(500, 560), pt(220, 380), pt(780, 380), pt(220, 780), pt(780, 780)], 'pink', 18);
    const border = P(K.line(130, 580, 130, 580, 1).concat(K.line(870, 580, 870, 580, 1)), 'yellow', 16);
    const path = P(K.line(500, 300, 500, 380, 2).concat(K.line(500, 740, 500, 900, 3)), 'yellow', 15);
    const ring = P(ringN(500, 560, 245, 16, 0).filter(p => Math.abs(p.x - 500) > 60), 'green', 15);
    return [hedges, flowers, border, path, ring];
  })()
}));

// 7. A heart of lanterns.
lanternGarden.push(lvl({
  name: 'Lantern Heart',
  intro: 'Light the lanterns around the heart. New: a spray peg makes your next shot three balls.',
  goal: { type: 'lanterns' }, plate: catchP(300, 90),
  items: (() => {
    const outline = resample(K.heart(500, 540, 290, 400), 66, true);
    const items = outline.map((p, i) => (i % 3 === 0 ? K.item('lantern', p.x, p.y, { r: 19 }) : K.peg(p.x, p.y, 'pink', 16)));
    const inner = resample(K.heart(500, 560, 130, 200), 64, true);
    let core = P(inner, 'red', 15);
    core = sprinkle(core, ['spray', 'spray'], 'lg7');
    return [items, core];
  })()
}));

// 8. Big leaves holding dewdrops.
lanternGarden.push(lvl({
  name: 'Evening Dew',
  intro: 'Collect the dewdrop gems resting on the leaves. New: double points peg.',
  goal: { type: 'gems' }, plate: catchP(300, 90),
  items: (() => {
    const leaves = [[290, 400, 380, 170, -28], [710, 430, 380, 170, 28], [500, 770, 440, 170, -6]];
    let out = [];
    const dew = [];
    leaves.forEach(([cx, cy, len, wid, ang], k) => {
      out = out.concat(P(leafShape(cx, cy, len, wid, ang, 66), 'green', 15));
      const vein = K.line(-len * 0.28, 0, len * 0.28, 0, 3).map(p => pt(cx + p.x * Math.cos(ang * D2R), cy + p.x * Math.sin(ang * D2R)));
      out = out.concat(P([vein[0], vein[2]], 'teal', 14));
      dew.push(vein[1]);
    });
    dew.push(pt(500, 300), pt(160, 640), pt(840, 640), pt(500, 560));
    out = sprinkle(out, ['multiplier', 'multiplier'], 'lg8');
    return [out, gems(dew)];
  })()
}));

// 9. Wind chimes hanging from a curved beam.
lanternGarden.push(lvl({
  name: 'Wind Chimes',
  intro: 'Ring the chimes to reach the target score. The plate bounces today. New: springy bumpers.',
  goal: { type: 'score', frac: 1.5 }, plate: bounceP(260, 70),
  items: (() => {
    const beam = arcS(500, -480, 760, 62, 118, 64).filter(p => p.y > 160);
    const beamY = (x) => -480 + Math.sqrt(760 * 760 - (x - 500) * (x - 500));
    const xs = [200, 310, 430, 570, 690, 800], lens = [4, 5, 6, 6, 5, 4];
    let chimes = [];
    xs.forEach((x, i) => { const y0 = beamY(x) + 80; chimes = chimes.concat(P(K.line(x, y0, x, y0 + (lens[i] - 1) * 68, lens[i]), i % 2 ? 'teal' : 'blue', 15)); });
    const bumpers = T([pt(255, 720), pt(500, 790), pt(745, 720)], 'bumper', { r: 22 });
    const clappers = P([pt(370, 880), pt(630, 880), pt(500, 640)], 'pink', 16);
    chimes = sprinkle(chimes, ['multiplier'], 'lg9');
    return [P(beam, 'yellow', 15), chimes, bumpers, clappers];
  })()
}));

// 10. Three sunflowers.
lanternGarden.push(lvl({
  name: 'Sunflowers',
  intro: 'Make a chain of ten hits in one shot. New: a fireball burns right through pegs.',
  goal: { type: 'chain', chain: 10 }, plate: catchP(300, 90),
  items: (() => {
    const sun = (cx, cy, mid) => P(ringN(cx, cy, 92, 11, -90), 'yellow', 15).concat([K.item(mid, cx, cy, { r: 18, c: 'orange' })], P(ringN(cx, cy, 46, 4, 45), 'orange', 12));
    const stem = (x, y0, y1) => P(K.line(x, y0, x, y1, Math.round((y1 - y0) / 70) + 1), 'green', 14);
    const leaves = P([pt(190, 600), pt(310, 660), pt(690, 600), pt(810, 660), pt(440, 820), pt(560, 820), pt(190, 760), pt(810, 760)], 'teal', 13);
    let out = [sun(250, 360, 'zap'), sun(750, 360, 'zap'), sun(500, 590, 'zap'), stem(250, 490, 900), stem(750, 490, 900), stem(500, 720, 760), leaves].flat();
    out = sprinkle(out, ['fire', 'fire', 'multiball', 'multiball'], 'lg10', p => p.t === 'peg' && p.c === 'yellow');
    const bees = T([pt(120, 440), pt(880, 440), pt(380, 880), pt(620, 880)], 'bumper', { r: 20 });
    return [out, bees];
  })()
}));

// 11. A round moon gate with lanterns inside.
lanternGarden.push(lvl({
  name: 'Moon Gate',
  intro: 'Hit the blue key to open the moon gate, then light the lanterns. New: keys open gates.',
  goal: { type: 'lanterns' }, plate: catchP(300, 90),
  items: (() => {
    const cx = 500, cy = 600, r = 195;
    const at = (a) => pt(cx + Math.cos(a * D2R) * r, cy + Math.sin(a * D2R) * r);
    const walls = [150, 172, 194, 216, 324, 346, 8, 30].map(a => { const p = at(a); return K.wall(p.x, p.y, 62, 18, a + 90); });
    const gates = [248, 292].map(a => { const p = at(a); return K.gate(p.x, p.y, 146, 18, a + 90, 'blue'); });
    const inside = lanterns([pt(500, 560), pt(425, 650), pt(575, 650)]);
    const outside = lanterns([pt(160, 560), pt(840, 560), pt(250, 860), pt(750, 860), pt(500, 300)]);
    const key = K.item('key', 220, 360, { k: 'blue', r: 19 });
    const willowL = P(spline([pt(90, 640), pt(130, 760), pt(110, 920)], 70), 'green', 15);
    const willowR = willowL.map(p => Object.assign({}, p, { x: 1000 - p.x }));
    const blooms = P([pt(330, 330), pt(670, 330), pt(780, 380), pt(380, 900), pt(620, 900), pt(500, 870)], 'pink', 15);
    return [walls, gates, inside, outside, key, willowL, willowR, blooms];
  })()
}));

// 12. Autumn leaves drifting down.
lanternGarden.push(lvl({
  name: 'Falling Leaves',
  intro: 'Sweep up every leaf. New: a blast peg makes your next ball burst on its first hit.',
  goal: { type: 'clear' }, plate: timedP(5, 320, 80),
  items: (() => {
    const spots = [[260, 320, -35], [520, 280, 20], [760, 340, -15], [380, 500, 40], [640, 520, -40], [190, 620, 15], [500, 620, -20], [810, 620, 35]];
    const cols = ['orange', 'red', 'yellow', 'orange', 'red', 'yellow', 'orange', 'red'];
    let out = [];
    spots.forEach(([x, y, ang], k) => {
      const c = Math.cos(ang * D2R), sn = Math.sin(ang * D2R);
      const pts = [[-72, 0], [72, 0], [0, -40], [0, 40]].map(([u, v]) => pt(x + u * c - v * sn, y + u * sn + v * c));
      out = out.concat(P(pts, cols[k], 15));
    });
    out = sprinkle(out, ['blast', 'blast', 'multiball'], 'lg12b', reach);
    return out;
  })()
}));

// 13. A greenhouse of glass panes.
lanternGarden.push(lvl({
  name: 'Glasshouse',
  intro: 'Break all the glass and the flower pots. New: glass shatters at the first touch.',
  goal: { type: 'bricks' }, plate: catchP(300, 90),
  items: (() => {
    const panes = [];
    K.line(270, 450, 270, 650, 3).forEach(p => { panes.push(K.glass(p.x, p.y, 90, 16, 90)); panes.push(K.glass(1000 - p.x, p.y, 90, 16, 90)); });
    K.line(315, 360, 445, 285, 2).forEach(p => { panes.push(K.glass(p.x, p.y, 128, 16, -30)); panes.push(K.glass(1000 - p.x, p.y, 128, 16, 30)); });
    const pots = [K.brick(390, 640, 80, 22, 0, 1), K.brick(610, 640, 80, 22, 0, 1)];
    const plants = P(K.pyramid(390, 470, 3, 60, 52), 'green', 14).concat(P(K.pyramid(610, 470, 3, 60, 52), 'teal', 14));
    const blooms = P([pt(150, 380), pt(850, 380), pt(140, 720), pt(860, 720), pt(300, 820), pt(700, 820), pt(500, 420)], 'pink', 16);
    return [panes, pots, plants, blooms];
  })()
}));

// 14. A weeping willow.
lanternGarden.push(lvl({
  name: 'Weeping Willow',
  intro: 'Break forty pegs from the willow. New: a safety net bounces your next ball back up.',
  goal: { type: 'count', count: 40 }, plate: catchP(300, 90),
  items: (() => {
    let out = [];
    const crown = pt(500, 300);
    [-1, 1].forEach(side => {
      [130, 250, 370].forEach((reach0, k) => {
        const ctrl = [pt(crown.x + side * 40, crown.y + 10), pt(crown.x + side * reach0 * 0.6, crown.y - 30 + k * 10), pt(crown.x + side * reach0, crown.y + 80 + k * 20), pt(crown.x + side * (reach0 + 20), 640 + k * 90)];
        out = out.concat(P(spline(ctrl, 68).slice(1), k === 1 ? 'teal' : 'green', 15));
      });
    });
    out = out.concat(P([crown], 'yellow', 18));
    out = sprinkle(out, ['net', 'net'], 'lg14', reach);
    const trunk = [K.wall(500, 760, 300, 22, 90)];
    const grass = P(K.wave(120, 880, 935, 12, 2, 12), 'green', 14);
    return [out, trunk, grass];
  })()
}));

// 15. A little arched bridge over the brook.
lanternGarden.push(lvl({
  name: 'Brook Bridge',
  intro: 'Find the river stone gems along the brook. New: portals send your ball to their twin.',
  goal: { type: 'gems' }, plate: timedP(5, 300, 90),
  items: (() => {
    const bridge = K.bricksAlong(arcS(500, 880, 320, 208, 332, 80), { w: 70, h: 20, follow: true, hp: 1 });
    const w1 = P(K.wave(70, 930, 800, 24, 2.5, 14), 'teal', 15);
    const w2 = P(K.wave(70, 930, 920, 24, 2.5, 14, Math.PI), 'blue', 15);
    const stones = gems([pt(150, 720), pt(850, 720), pt(500, 440), pt(300, 320), pt(700, 320), pt(500, 700)]);
    const portals = [K.item('portal', 110, 470, { p: 0, r: 24 }), K.item('portal', 890, 470, { p: 0, r: 24 })];
    const blooms = P(K.arc(500, 480, 200, 7, 200, 340), 'pink', 15);
    return [bridge, w1, w2, stones, portals, blooms];
  })()
}));

// 16. Lanterns with fireflies dancing around them.
lanternGarden.push(lvl({
  name: 'Firefly Dance',
  intro: 'Light the lanterns while fireflies circle them. New: some pegs move, slowly.',
  goal: { type: 'lanterns' }, plate: catchP(300, 90),
  items: (() => {
    const spots = [pt(260, 340), pt(740, 340), pt(500, 500), pt(240, 680), pt(760, 680), pt(500, 840)];
    const lan = lanterns(spots);
    let flies = [];
    spots.forEach((s, k) => {
      for (let j = 0; j < 3; j++) flies.push(Object.assign(K.peg(s.x, s.y, 'yellow', 12), { m: { type: 'orbit', r: 62, speed: k % 2 ? -20 : 20, phase: j / 3 } }));
    });
    const grass = P(K.wave(90, 910, 950, 10, 3, 13), 'green', 14);
    const stems = P([pt(500, 300), pt(380, 420), pt(620, 420), pt(370, 590), pt(630, 590), pt(380, 770), pt(620, 770), pt(120, 500), pt(880, 500)], 'green', 15);
    return [lan, flies, grass, stems];
  })()
}));

// 17. A slowly turning pinwheel flower.
lanternGarden.push(lvl({
  name: 'Pinwheel Bloom',
  intro: 'The pinwheel flower turns slowly. Make a chain of twelve hits in one shot.',
  goal: { type: 'chain', chain: 12 }, plate: catchP(300, 90),
  items: (() => {
    const cx = 500, cy = 540;
    let arms = [];
    for (let k = 0; k < 6; k++) arms = arms.concat(K.rotateAbout(K.spiral(cx, cy, 72, 250, 0.3, 5, 0).map((p, i) => (i === 2 && k % 2 ? K.item('zap', p.x, p.y, { r: 17 }) : K.peg(p.x, p.y, k % 2 ? 'pink' : 'purple', 15))), cx, cy, k * 60));
    arms = K.spin(arms.concat([K.item('multiball', cx, cy, { r: 20 })]), cx, cy, 12);
    const corners = [pt(140, 270), pt(860, 270), pt(130, 860), pt(870, 860)];
    let deco = [];
    corners.forEach((c, k) => { deco = deco.concat(P(ringN(c.x, c.y, 54, 6, -90), 'yellow', 14), [K.item(k < 2 ? 'zap' : 'multiball', c.x, c.y, { r: 15 })]); });
    const posts = T([pt(320, 880), pt(680, 880), pt(500, 900)], 'bumper', { r: 20 });
    return [arms, deco, posts];
  })()
}));

// 18. Night blossoms on a curving branch.
lanternGarden.push(lvl({
  name: 'Night Blossoms',
  intro: 'Break every pink blossom on the branches. New: the super guide shows a long aiming line.',
  goal: { type: 'color', color: 'pink' }, plate: catchP(300, 90),
  items: (() => {
    const main = spline([pt(70, 930), pt(300, 780), pt(520, 650), pt(740, 470), pt(880, 280)], 68);
    const b1 = spline([pt(300, 780), pt(240, 600), pt(320, 420)], 68).slice(1);
    const b2 = spline([pt(520, 650), pt(640, 780), pt(820, 840)], 68).slice(1);
    const b3 = spline([pt(650, 545), pt(530, 420), pt(450, 280)], 68).slice(1);
    let wood = P(main, 'purple', 15).concat(P(b1, 'purple', 15), P(b2, 'purple', 15), P(b3, 'purple', 15));
    const tips = [pt(330, 350), pt(420, 230), pt(880, 860), pt(930, 230)];
    const blossomSpots = [pt(170, 650), pt(395, 345), pt(520, 300), pt(445, 530), pt(600, 620), pt(700, 860), pt(810, 680), pt(640, 420), pt(820, 440), pt(380, 840), pt(180, 870)];
    const blossoms = P(away(blossomSpots, wood, 42), 'pink', 17);
    const leaves = P(away([pt(250, 470), pt(560, 520), pt(720, 600), pt(900, 520), pt(560, 900), pt(120, 520), pt(340, 610)], wood.concat(blossoms), 40), 'green', 14);
    wood = sprinkle(wood, ['guide', 'zap'], 'lg18g', reach);
    return [wood, blossoms, leaves];
  })()
}));

// 19. Strings of lanterns swaying across the garden.
lanternGarden.push(lvl({
  name: 'Lantern Strings',
  intro: 'Light the lanterns on the swaying strings.',
  goal: { type: 'lanterns' }, plate: catchP(320, 80),
  items: (() => {
    let out = [];
    [[300, 120, 1], [520, 140, -1], [740, 120, 1]].forEach(([y, sag, dir], k) => {
      const str = resample(curve(t => pt(100 + 800 * t, y + sag * 4 * t * (1 - t)), 120), 66);
      const items = str.map((p, i) => ([2, 5, 8, 11].includes(i) ? K.item('lantern', p.x, p.y + 10, { r: 19 }) : K.peg(p.x, p.y, k === 1 ? 'teal' : 'yellow', 13)));
      out = out.concat(K.slide(items, 40 * dir, 0, 10, 0));
    });
    const grass = P(K.wave(110, 890, 945, 10, 3, 12), 'green', 14);
    return [out, grass];
  })()
}));

// 20. The festival finale: a ring of lanterns around a glowing heart.
lanternGarden.push(lvl({
  name: 'Festival of Light',
  intro: 'The garden festival. Light all the lanterns, with powers all around to help.',
  goal: { type: 'lanterns' }, balls: 12, plate: catchP(320, 80),
  items: (() => {
    const ring = ringN(500, 590, 340, 24, -90);
    const items = ring.map((p, i) => (i % 2 === 0 ? K.item('lantern', p.x, p.y, { r: 19 }) : K.peg(p.x, p.y, i % 4 === 1 ? 'yellow' : 'orange', 15)));
    const heart = P(resample(K.heart(500, 580, 150, 200), 64, true), 'pink', 15);
    const petals = P(ringN(500, 590, 245, 12, -75), 'purple', 14);
    let all = items.concat(heart, petals);
    all = sprinkle(all, ['multiball', 'spray', 'fire', 'zap', 'extra', 'blast'], 'lg20');
    const flies = P(scatter('lg20f', 10, p => dist(p, pt(500, 590)) > 400, 90), 'yellow', 12);
    return [all, flies];
  })()
}));

/* ════════════════════════════════════════════════════════════════════════
 * 2. MOONLIT LAKE — a calm night lake with the moon on the water
 * ════════════════════════════════════════════════════════════════════════ */

const moonlitLake = [];
const WATER = 570;   // the waterline most lake levels reflect about

/** A ripple: broken arcs around a centre. */
function ripple(cx, cy, r, spans, step) { let out = []; spans.forEach(([a, b]) => { out = out.concat(arcS(cx, cy, r, a, b, step)); }); return out; }

/** A lily pad: a ring with a notch cut out, facing `notch` degrees. */
function lilyPad(cx, cy, R, n, notch, c, r) {
  return P(ringN(cx, cy, R, n + 1, notch).slice(1), c || 'green', r || 15);
}

// 1. The moon rises over the lake and lays a silver path on the water.
moonlitLake.push(lvl({
  name: 'Moonrise',
  intro: 'Welcome to the lake. Collect the six moon pearls, the shining gems.',
  goal: { type: 'gems' }, plate: catchP(320, 80),
  items: (() => {
    const moon = P(ringN(500, 320, 112, 12, -90), 'yellow', 16);
    const shore = P(K.line(75, WATER, 925, WATER, 13), 'blue', 14);
    let path = [];
    [[640, 230], [710, 180], [780, 130], [850, 80]].forEach(([y, hw], k) => {
      const n = Math.max(2, Math.round(hw * 2 / 72) + 1);
      path = path.concat(P(K.line(500 - hw, y, 500 + hw, y, n), k % 2 ? 'teal' : 'yellow', 14));
    });
    const stars = P([pt(190, 270), pt(810, 270), pt(260, 440), pt(740, 440), pt(110, 360), pt(890, 360)], 'purple', 12);
    const pearls = gems([pt(370, 225), pt(630, 225), pt(115, 470), pt(885, 470), pt(195, 670), pt(805, 670)]);
    return [moon, shore, path, stars, pearls];
  })()
}));

// 2. Ripples spreading from one falling drop.
moonlitLake.push(lvl({
  name: 'Ripples',
  intro: 'Break forty pegs in the spreading ripples. New: a multiball peg sends out two more balls.',
  goal: { type: 'count', count: 40 }, plate: catchP(300, 90),
  items: (() => {
    const cx = 500, cy = 430;
    const rings = [
      [95, [[0, 330]], 'yellow'],
      [180, [[-150, -30], [10, 170]], 'teal'],
      [265, [[-120, -60], [-30, 30], [60, 120], [150, 210]], 'blue'],
      [350, [[-170, -120], [-60, -10], [30, 80], [100, 150]], 'purple']
    ];
    let out = [K.peg(cx, cy, 'yellow', 18)];
    rings.forEach(([r, spans, c]) => { out = out.concat(P(ripple(cx, cy, r, spans, 66), c, 15)); });
    out = out.filter(p => p.y > 175 && p.x > 50 && p.x < 950);
    out = sprinkle(out, ['multiball', 'multiball'], 'ml2', reach);
    return out;
  })()
}));

// 3. Lily pads scattered on the dark water.
moonlitLake.push(lvl({
  name: 'Lily Pads',
  intro: 'Clear every peg from the lily pads. New: an extra ball peg gives you one more ball.',
  goal: { type: 'clear' }, plate: catchP(320, 80),
  items: (() => {
    const pads = [[260, 320, 30], [740, 320, 150], [130, 540, 60], [870, 540, 120], [350, 560, 45], [650, 560, 135]];
    let out = [];
    pads.forEach(([x, y, n]) => { out = out.concat(lilyPad(x, y, 46, 4, n, 'green', 15)); });
    out = out.concat(P([pt(500, 290), pt(500, 480)], 'pink', 17));
    const deep = T([pt(500, 800)], 'bumper', { r: 22 });
    out = sprinkle(out, ['extra', 'extra'], 'ml3', reach);
    return [out, deep];
  })()
}));

// 4. Reeds and cattails on both banks.
moonlitLake.push(lvl({
  name: 'Reed Bank',
  intro: 'Break every orange cattail on top of the reeds. New: lightning lights the pegs nearby.',
  goal: { type: 'color', color: 'orange' }, plate: catchP(300, 90),
  items: (() => {
    let out = [];
    const reeds = [[80, 520, 4, -6], [150, 420, 5, 4], [225, 500, 4, -3], [295, 600, 3, 5], [365, 690, 2, 0]];
    reeds.forEach(([x, top, n, lean]) => {
      const stalk = K.line(x, top + 64, x + lean * (n - 1), top + 64 * n, n);
      out = out.concat(P(stalk, 'green', 14), [K.peg(x - lean, top, 'orange', 17)]);
    });
    out = K.mirror(out);
    const moon = P(ringN(500, 300, 72, 8, -90), 'yellow', 14);
    const glow = P(K.line(470, 470, 530, 470, 2).concat(K.line(440, 540, 560, 540, 3)), 'yellow', 13);
    const waves = P(K.wave(420, 580, 650, 14, 1, 3), 'teal', 14);
    out = sprinkle(out, ['zap', 'zap'], 'ml4', p => p.t === 'peg' && p.c === 'green' && easy(p));
    return [out, moon, glow, waves];
  })()
}));

// 5. The phases of the moon across the sky.
moonlitLake.push(lvl({
  name: 'Moon Phases',
  intro: 'Reach the target score among the moons. New: a double points peg doubles that shot.',
  goal: { type: 'score', frac: 1.5 }, plate: catchP(300, 90),
  items: (() => {
    let out = [];
    const xs = [140, 320, 500, 680, 860], ys = [400, 320, 290, 320, 400], lit = [0, 2, 3, 5, 6];
    xs.forEach((x, k) => {
      const ring = ringN(x, ys[k], 54, 6, -90);
      ring.forEach((p, i) => out.push(K.peg(p.x, p.y, ((i + 6 - Math.floor(lit[k] / 2)) % 6) < lit[k] ? 'yellow' : 'blue', 14)));
      out = out.concat(P(K.line(x, 650, x, 650 + 70 * (k === 2 ? 2 : 1), k === 2 ? 3 : 2), k % 2 ? 'teal' : 'yellow', 13));
    });
    const shore = P(K.line(75, WATER, 925, WATER, 13), 'blue', 13);
    out = sprinkle(out, ['multiplier', 'multiplier'], 'ml5', p => p.t === 'peg' && p.y < 500 && easy(p));
    return [out, shore];
  })()
}));

// 6. An old wooden pier on posts.
moonlitLake.push(lvl({
  name: 'Old Pier',
  intro: 'Break the planks of the old pier. New: grey steel posts never break.',
  goal: { type: 'bricks' }, plate: catchP(300, 90),
  items: (() => {
    const deck = K.line(110, 470, 560, 530, 6).map((p, i) => K.brick(p.x, p.y, 76, 20, 7.6, i % 2 ? 2 : 1));
    const posts = [];
    K.line(110, 470, 560, 530, 4).forEach(p => { posts.push(K.item('steel', p.x, p.y + 70, { r: 13 }), K.item('steel', p.x, p.y + 150, { r: 13 })); });
    const roof = K.bricksAlong(K.line(690, 380, 790, 300, 2), { w: 72, h: 20, follow: true, hp: 1 }).concat(K.bricksAlong(K.line(810, 300, 910, 380, 2), { w: 72, h: 20, follow: true, hp: 1 }));
    const house = [K.brick(700, 470, 80, 20, 90, 1), K.brick(900, 470, 80, 20, 90, 1)];
    const moon = P(ringN(800, 610, 60, 7, -90), 'yellow', 14);
    const waves = P(K.wave(80, 920, 860, 18, 3, 14), 'teal', 14);
    const lamps = P([pt(330, 330), pt(560, 300), pt(200, 300), pt(450, 650), pt(650, 720)], 'yellow', 15);
    return [deck, posts, roof, house, moon, waves, lamps];
  })()
}));

// 7. Stars in the sky and their twins in the water.
moonlitLake.push(lvl({
  name: 'Starlit Mirror',
  intro: 'Make a chain of ten hits in one shot. New: a spray peg makes your next shot three balls.',
  goal: { type: 'chain', chain: 10 }, plate: catchP(300, 90),
  items: (() => {
    let sky = [];
    [[220, 330, 85, 0], [500, 290, 105, 1], [780, 330, 85, 0]].forEach(([x, y, r, big]) => {
      sky = sky.concat(P(K.starShape(x, y, r, r * 0.45, 5, 10), big ? 'yellow' : 'teal', 13));
      sky.push(K.item('zap', x, y, { r: 16 }));
    });
    sky = sprinkle(sky, ['spray', 'spray'], 'ml7', p => p.t === 'peg' && p.y < 400);
    const water = reflect(sky, WATER + 10).map(p => (p.t === 'zap' ? Object.assign({}, p, { t: p.x === 500 ? 'zap' : 'multiball' }) : Object.assign({}, p, { t: 'peg', c: p.c === 'yellow' || p.t !== 'peg' ? 'blue' : 'purple', r: 13 })));
    const shore = P(K.line(90, WATER + 10, 910, WATER + 10, 10), 'blue', 12);
    return [sky, water, shore];
  })()
}));

// 8. A little rowboat with lanterns at either end.
moonlitLake.push(lvl({
  name: 'Rowboat',
  intro: 'Light the lanterns on the boat and the water. New: springy bumpers bounce your ball away.',
  goal: { type: 'lanterns' }, plate: catchP(300, 90),
  items: (() => {
    const hull = P(ellArc(500, 560, 230, 110, 10, 170, 64), 'orange', 15);
    const rim = P(K.line(300, 560, 700, 560, 6), 'red', 14);
    const oarL = P(K.line(330, 610, 180, 720, 3), 'yellow', 13), oarR = P(K.line(670, 610, 820, 720, 3), 'yellow', 13);
    const lan = lanterns([pt(285, 480), pt(715, 480), pt(500, 300), pt(150, 360), pt(850, 360), pt(120, 560), pt(880, 560), pt(330, 230), pt(670, 230)]);
    const buoys = T([pt(500, 440), pt(250, 800), pt(750, 800)], 'bumper', { r: 21 });
    const waves = P(K.wave(80, 920, 900, 14, 3, 14), 'teal', 13);
    return [hull, rim, oarL, oarR, lan, buoys, waves];
  })()
}));

// 9. Silver fish leaping through the glassy surface.
moonlitLake.push(lvl({
  name: 'Leaping Fish',
  intro: 'Catch the silver fish gems as they leap. New: glass shatters at the first touch.',
  goal: { type: 'gems' }, plate: catchP(300, 90),
  items: (() => {
    const surface = K.line(110, 600, 890, 600, 8).map(p => K.glass(p.x, p.y, 80, 16, 0));
    let arcs = [], fish = [];
    [[250, 300, 120, 270], [500, 250, 110, 330], [750, 300, 120, 270]].forEach(([x, top, hw, drop]) => {
      const a = resample(curve(t => pt(x - hw + 2 * hw * t, top + drop * Math.pow(2 * t - 1, 2)), 60), 64);
      a.forEach((p, i) => { if (Math.abs(p.x - x) < 30) fish.push(p); else arcs.push(K.peg(p.x, p.y, i % 2 ? 'teal' : 'blue', 14)); });
    });
    fish = fish.concat([pt(170, 760), pt(830, 760), pt(500, 700)]);
    const bubbles = P([pt(300, 680), pt(700, 680), pt(260, 860), pt(740, 860), pt(400, 800), pt(600, 800)], 'teal', 13);
    return [surface, arcs, gems(fish), bubbles];
  })()
}));

// 10. A round bridge and its reflection make a full moon.
moonlitLake.push(lvl({
  name: 'Moon Bridge',
  intro: 'Break thirty pegs around the moon bridge. New: portals send your ball to their twin.',
  goal: { type: 'count', count: 30 }, plate: stillP(500, 280),
  items: (() => {
    const bridge = P(arcS(500, WATER, 290, 190, 350, 66), 'purple', 16);
    const deck = P(K.line(160, WATER - 70, 160, WATER - 70, 1).concat(K.line(840, WATER - 70, 840, WATER - 70, 1)), 'purple', 16);
    const refl = reflect(bridge, WATER + 15).map(p => Object.assign({}, p, { c: 'blue', r: 14 }));
    const inner = P(arcS(500, WATER, 190, 205, 335, 70), 'yellow', 14);
    const innerR = reflect(inner, WATER + 15).map(p => Object.assign({}, p, { c: 'teal', r: 13 }));
    const portals = [K.item('portal', 110, 330, { p: 0, r: 24 }), K.item('portal', 890, 820, { p: 0, r: 24 })];
    const lamps = P([pt(500, 210), pt(300, 220), pt(700, 220)], 'yellow', 14);
    return [bridge, deck, refl, inner, innerR, portals, lamps];
  })()
}));

// 11. A lotus flower opening on the water.
moonlitLake.push(lvl({
  name: 'Lotus Bloom',
  intro: 'Break every pink petal tip of the lotus. New: a safety net bounces your next ball back up.',
  goal: { type: 'color', color: 'pink' }, plate: catchP(300, 90),
  items: (() => {
    const cx = 500, cy = 640;
    let out = [];
    [-72, -36, 0, 36, 72].forEach((a, k) => {
      const len = k === 2 ? 290 : 250, ang = -90 + a, base = 58;
      const mid = base + len / 2;
      const leaf = leafShape(cx + Math.cos(ang * D2R) * mid, cy + Math.sin(ang * D2R) * mid, len, 112, ang, 70);
      leaf.forEach(p => {
        const tip = dist(p, pt(cx, cy)) > base + len * 0.9;
        out.push(K.peg(p.x, p.y, tip ? 'pink' : (k % 2 ? 'purple' : 'teal'), tip ? 17 : 14));
      });
    });
    out.push(K.peg(cx, cy, 'yellow', 22));
    const pads = lilyPad(150, 830, 50, 5, 20, 'green', 14).concat(lilyPad(850, 830, 50, 5, 160, 'green', 14));
    const buds = P([pt(110, 560), pt(890, 560), pt(250, 860), pt(750, 860)], 'pink', 17);
    out = sprinkle(out, ['net', 'net'], 'ml11', p => p.t === 'peg' && p.c !== 'pink' && easy(p));
    return [out, pads, buds];
  })()
}));

// 12. Soft rain falling on the lake.
moonlitLake.push(lvl({
  name: 'Night Rain',
  intro: 'Clear every raindrop. The plate bounces in the rain. New: a fireball burns through pegs.',
  goal: { type: 'clear' }, plate: bounceP(280, 70),
  items: (() => {
    const spots = [pt(240, 300), pt(500, 250), pt(760, 300), pt(140, 470), pt(380, 440), pt(620, 440), pt(860, 470), pt(250, 620), pt(750, 620), pt(500, 590)];
    let out = [];
    spots.forEach((s, k) => { out = out.concat(P([pt(s.x - 16, s.y - 34), pt(s.x + 16, s.y + 34)], k % 3 === 0 ? 'teal' : 'blue', 15)); });
    out = sprinkle(out, ['fire', 'fire', 'multiball'], 'ml12f', reach);
    const pads = T([pt(420, 850), pt(580, 850)], 'bumper', { r: 22 });
    const cloud = [K.item('steel', 300, 200, { r: 14 }), K.item('steel', 700, 200, { r: 14 })];
    return [out, pads, cloud];
  })()
}));

// 13. A slow eddy curling in the middle of the lake.
moonlitLake.push(lvl({
  name: 'Gentle Eddy',
  intro: 'Make a chain of twelve in one shot. New: a blast peg makes your next ball burst on its first hit.',
  goal: { type: 'chain', chain: 12 }, plate: catchP(300, 90),
  items: (() => {
    let arms = [];
    [0, 120, 240].forEach((a0, k) => { arms = arms.concat(P(K.spiral(500, 540, 80, 340, 0.9, 17, a0), ['blue', 'teal', 'purple'][k], 15)); });
    arms.push(K.item('zap', 500, 540, { r: 18 }));
    arms = sprinkle(arms, ['blast', 'blast', 'zap', 'zap', 'zap', 'multiball'], 'ml13', reach);
    const stones = T([pt(110, 860), pt(890, 860)], 'bumper', { r: 21 });
    return [arms, stones];
  })()
}));

// 14. Constellations over the water.
moonlitLake.push(lvl({
  name: 'Constellations',
  intro: 'Join up the star pictures and reach the target score.',
  goal: { type: 'score', frac: 1.5 }, plate: catchP(280, 100),
  items: (() => {
    const dipper = [pt(150, 260), pt(260, 300), pt(360, 330), pt(450, 400), pt(440, 500), pt(580, 520), pt(600, 420)];
    const cass = [pt(620, 250), pt(700, 320), pt(780, 250), pt(860, 320), pt(910, 240)];
    const swan = [pt(250, 560), pt(250, 660), pt(250, 760), pt(150, 650), pt(350, 650)];
    const join = (pts) => { let out = []; for (let i = 0; i < pts.length - 1; i++) out = out.concat(resample([pts[i], pts[i + 1]], 60, false).slice(1, -1)); return out; };
    let lines = P(join(dipper).concat(join(cass), join([swan[0], swan[1], swan[2]]), join([swan[3], swan[1], swan[4]])), 'blue', 11);
    const stars = P(dipper.concat(cass, swan), 'yellow', 16);
    const moon = P(arcS(760, 640, 90, 100, 260, 56), 'yellow', 14).concat(P(arcS(800, 640, 70, 120, 240, 56), 'teal', 12));
    lines = sprinkle(lines, ['multiplier'], 'ml14', reach);
    const shore = P(K.wave(90, 910, 900, 12, 2.5, 14), 'blue', 13);
    return [stars, lines, moon, shore];
  })()
}));

// 15. Paper lanterns drifting on the water.
moonlitLake.push(lvl({
  name: 'Floating Lanterns',
  intro: 'Light the floating lanterns as they drift. New: some pieces move, slowly.',
  goal: { type: 'lanterns' }, plate: catchP(320, 80),
  items: (() => {
    let out = [];
    [[290, 4, 1, 0], [440, 3, -1, 0.25], [590, 2, 1, 0.5]].forEach(([y, n, dir, ph], k) => {
      const xs = K.line(k === 2 ? 300 : 200, y, k === 2 ? 700 : 800, y, n).map((p, i) => pt(p.x, p.y + (i % 2 ? 22 : -10)));
      out = out.concat(K.slide(lanterns(xs), 60 * dir, 0, 9, ph));
      const boats = xs.map(p => K.peg(p.x, p.y + 40, 'orange', 12));
      out = out.concat(K.slide(boats, 60 * dir, 0, 9, ph));
    });
    const moon = P(ringN(500, 820, 70, 8, -90), 'yellow', 14);
    const reeds = P(K.line(70, 420, 70, 620, 4).concat(K.line(930, 420, 930, 620, 4)), 'green', 14);
    return [out, moon, reeds];
  })()
}));

// 16. A waterfall spilling into the lake under the moon.
moonlitLake.push(lvl({
  name: 'Moon Falls',
  intro: 'Break all the glass and bricks of the moonlit waterfall.',
  goal: { type: 'bricks' }, plate: timedP(4, 300, 90),
  items: (() => {
    const cliffL = K.bricksAlong(K.line(140, 270, 330, 330, 3), { w: 70, h: 22, follow: true, hp: 1 });
    const cliffR = K.bricksAlong(K.line(860, 270, 670, 330, 3), { w: 70, h: 22, follow: true, hp: 1 });
    const falls = [];
    [[380, -12], [450, -6], [550, 6], [620, 12]].forEach(([x, lean], k) => K.line(x, 420 + (k % 3 ? 30 : 0), x + lean, 560 + (k % 3 ? 30 : 0), 2).forEach(p => falls.push(K.glass(p.x, p.y, 76, 22, 90 + lean))));
    const pool = K.bricksAlong(ellArc(500, 740, 340, 80, 205, 335, 96), { w: 74, h: 22, follow: true, hp: 1 });
    const moon = P(ringN(500, 240, 56, 7, -90), 'yellow', 14);
    const spray = P([pt(250, 560), pt(750, 560), pt(150, 440), pt(850, 440), pt(200, 780), pt(800, 780)], 'teal', 14);
    return [cliffL, cliffR, falls, pool, moon, spray];
  })()
}));

// 17. Two shells hold pearls behind locked lids.
moonlitLake.push(lvl({
  name: 'Pearl Shells',
  intro: 'Hit a key to open the shell of the same colour, then collect every pearl. New: keys and gates.',
  goal: { type: 'gems' }, plate: catchP(300, 90),
  items: (() => {
    const dome = (cx, cy, k) => {
      const r = 150, at = (a) => pt(cx + Math.cos(a * D2R) * r, cy + Math.sin(a * D2R) * r);
      const walls = [160, 185, 210, 330, 355, 20].map(a => { const p = at(a); return K.wall(p.x, p.y, 56, 16, a + 90); });
      const gates = [252, 288].map(a => { const p = at(a); return K.gate(p.x, p.y, 96, 16, a + 90, k); });
      const glow = P(arcS(cx, cy, 190, 200, 340, 64), 'yellow', 13);
      return [walls, gates, glow, gems([pt(cx, cy - 30), pt(cx, cy + 60)])];
    };
    const keys = [K.item('key', 420, 300, { k: 'blue', r: 19 }), K.item('key', 580, 300, { k: 'pink', r: 19 })];
    const reeds = P(K.line(500, 430, 500, 590, 3), 'green', 14);
    const outer = gems([pt(500, 700), pt(110, 300), pt(890, 300)]);
    const waves = P(K.wave(80, 920, 900, 14, 3, 14), 'teal', 13);
    return [dome(250, 530, 'blue'), dome(750, 530, 'pink'), keys, reeds, waves, outer];
  })()
}));

// 18. Banks of mist drifting over the water.
moonlitLake.push(lvl({
  name: 'Mist Waves',
  intro: 'Break forty-five pegs in the mist. New: the super guide shows a long aiming line.',
  goal: { type: 'count', count: 45 }, plate: timedP(5, 300, 90),
  items: (() => {
    let out = [];
    ['purple', 'blue', 'teal', 'blue', 'purple'].forEach((c, k) => {
      out = out.concat(P(K.wave(80, 920, 260 + k * 140, 34, 1.5, 13, k * 1.1), c, 15));
    });
    out = sprinkle(out, ['guide', 'guide', 'zap'], 'ml18', reach);
    return out;
  })()
}));

// 19. The great moon wheel turns slowly over the lake.
moonlitLake.push(lvl({
  name: 'Moon Wheel',
  intro: 'The moon wheel turns slowly. Break every yellow peg on its rim.',
  goal: { type: 'color', color: 'yellow' }, plate: catchP(300, 90),
  items: (() => {
    const cx = 500, cy = 530;
    let wheel = ringN(cx, cy, 230, 20, -90).map((p, i) => K.peg(p.x, p.y, i % 2 ? 'blue' : 'yellow', 15));
    for (let k = 0; k < 5; k++) wheel = wheel.concat(K.rotateAbout(P(K.line(cx, cy - 75, cx, cy - 160, 2), 'teal', 13), cx, cy, k * 72 + 36));
    wheel.push(K.item('zap', cx, cy, { r: 18 }));
    wheel = K.spin(wheel, cx, cy, 10);
    const reeds = P(K.line(70, 700, 70, 900, 4).concat(K.line(930, 700, 930, 900, 4), K.line(120, 780, 120, 900, 3), K.line(880, 780, 880, 900, 3)), 'green', 14);
    return [wheel, reeds];
  })()
}));

// 20. The finale: a lake full of stars around the moon.
moonlitLake.push(lvl({
  name: 'Lake of Stars',
  intro: 'The whole lake is shining. Collect every moon pearl, with powers all around to help.',
  goal: { type: 'gems' }, balls: 12, plate: catchP(320, 80),
  items: (() => {
    const cx = 500, cy = 420;
    let moon = ringN(cx, cy, 150, 14, -90).map((p, i) => K.peg(p.x, p.y, i % 2 ? 'yellow' : 'teal', 15));
    moon = moon.concat(gems(ringN(cx, cy, 70, 4, 45)));
    moon = K.spin(moon, cx, cy, 8);
    const refl = P(K.line(380, 700, 620, 700, 4).concat(K.line(420, 770, 580, 770, 3)), 'yellow', 13);
    let stars = [];
    [[150, 280], [850, 280], [130, 560], [870, 560], [250, 780], [750, 780]].forEach(([x, y]) => { stars = stars.concat(P(K.starShape(x, y, 48, 22, 5, 5), 'purple', 12), gems([pt(x, y)])); });
    stars = sprinkle(stars, ['multiball', 'spray', 'zap', 'extra', 'fire'], 'ml20', p => p.t === 'peg' && easy(p));
    const shore = P(K.line(240, 610, 760, 610, 8), 'blue', 12);
    return [moon, refl, stars, shore];
  })()
}));

/* ════════════════════════════════════════════════════════════════════════
 * 3. SNOWGLOBE HOLLOW — soft snow falling on a cosy little village
 * ════════════════════════════════════════════════════════════════════════ */

const snowglobeHollow = [];

/**
 * One snowflake arm pointing up from (cx, cy): pegs along the arm at `along`
 * distances, with a pair of side branches at the `branch` distances.
 */
function flakeArm(cx, cy, along, branch, blen) {
  const out = along.map(d => pt(cx, cy - d));
  branch.forEach(d => {
    [-1, 1].forEach(s => out.push(pt(cx + s * Math.sin(60 * D2R) * blen, cy - d - Math.cos(60 * D2R) * blen)));
  });
  return out;
}
/** A whole six-armed snowflake (positions). */
function snowflake(cx, cy, along, branch, blen) { return sym(flakeArm(cx, cy, along, branch || [], blen || 0), cx, cy, 6); }

/** A pine tree: rows of pegs widening downward, with a star on top. */
function pine(cx, top, rows, dx, dy, c) {
  return P(K.pyramid(cx, top + dy, rows, dx, dy).filter((p, i) => i > 0 || rows < 2), c || 'green', 15).concat([K.peg(cx, top, 'yellow', 16)]);
}

/** A house outline of pegs: walls, roof and a window position. */
function house(cx, base, w, h, c) {
  const walls = K.line(cx - w / 2, base, cx - w / 2, base - h, Math.max(2, Math.round(h / 66) + 1)).concat(K.line(cx + w / 2, base, cx + w / 2, base - h, Math.max(2, Math.round(h / 66) + 1)));
  const roof = resample([pt(cx - w / 2 - 20, base - h - 10), pt(cx, base - h - w * 0.55), pt(cx + w / 2 + 20, base - h - 10)], 64, false);
  return P(walls, c || 'blue', 14).concat(P(roof, 'teal', 14));
}

// 1. One big snowflake to welcome you.
snowglobeHollow.push(lvl({
  name: 'First Snowflake',
  intro: 'Welcome to the hollow. Break thirty pegs from the big snowflake.',
  goal: { type: 'count', count: 30 }, plate: catchP(320, 80),
  items: (() => {
    const cx = 500, cy = 560;
    const arm = flakeArm(cx, cy, [72, 144, 216, 290], [144, 216], 62);
    let flake = [];
    for (let k = 0; k < 6; k++) flake = flake.concat(K.rotateAbout(arm.map((p, i) => K.peg(p.x, p.y, i < 4 ? (i === 3 ? 'purple' : 'teal') : 'blue', i === 3 ? 17 : 15)), cx, cy, k * 60));
    flake.push(K.peg(cx, cy, 'yellow', 20));
    const snow = P(scatter('sh1', 8, p => dist(p, pt(cx, cy)) > 360, 120), 'blue', 11);
    return [flake, snow];
  })()
}));

// 2. A grove of pine trees hung with red baubles.
snowglobeHollow.push(lvl({
  name: 'Pine Grove',
  intro: 'Break every red bauble on the pine trees. New: a multiball peg sends out two more balls.',
  goal: { type: 'color', color: 'red' }, plate: catchP(300, 90),
  items: (() => {
    let trees = pine(220, 320, 5, 70, 66).concat(pine(500, 230, 6, 70, 66), pine(780, 320, 5, 70, 66));
    trees = tint(trees, 8, 'red', 'sh2', p => p.t === 'peg' && p.c === 'green' && easy(p));
    trees = sprinkle(trees, ['multiball', 'multiball'], 'sh2m', p => p.t === 'peg' && p.c === 'green' && easy(p));
    const ground = P(K.wave(80, 920, 900, 16, 2, 14), 'teal', 14);
    return [trees, ground];
  })()
}));

// 3. The village at dusk, every window waiting for its light.
snowglobeHollow.push(lvl({
  name: 'Village Lights',
  intro: 'Light the lanterns in the village windows. New: an extra ball peg gives you one more ball.',
  goal: { type: 'lanterns' }, plate: catchP(300, 90),
  items: (() => {
    const houses = house(180, 720, 150, 150).concat(house(410, 640, 150, 140), house(640, 700, 150, 150), house(860, 620, 120, 120, 'purple'));
    const lan = lanterns([pt(180, 640), pt(410, 560), pt(640, 620), pt(860, 560), pt(300, 300), pt(700, 300), pt(500, 220), pt(120, 420), pt(880, 400)]);
    let snow = P(scatter('sh3', 12, p => p.y < 470 && p.y > 200, 110, [pt(300, 300), pt(700, 300), pt(500, 220), pt(120, 420), pt(880, 400)], 60), 'blue', 11);
    snow = sprinkle(snow, ['extra', 'extra'], 'sh3x', reach);
    return [houses, lan, snow];
  })()
}));

// 4. A log cabin with frosty glass windows.
snowglobeHollow.push(lvl({
  name: 'Little Cabin',
  intro: 'Break every log and window of the little cabin. New: glass shatters at the first touch.',
  goal: { type: 'bricks' }, plate: catchP(300, 90),
  items: (() => {
    const roof = K.bricksAlong(K.line(290, 470, 470, 350, 3), { w: 76, h: 20, follow: true, hp: 1 }).concat(K.bricksAlong(K.line(530, 350, 710, 470, 3), { w: 76, h: 20, follow: true, hp: 1 }));
    const walls = [K.brick(320, 560, 100, 20, 90, 1), K.brick(320, 680, 100, 20, 90, 1), K.brick(680, 560, 100, 20, 90, 1), K.brick(680, 680, 100, 20, 90, 1)];
    const windows = [K.glass(420, 540, 60, 16, 0), K.glass(420, 600, 60, 16, 0), K.glass(580, 540, 60, 16, 0), K.glass(580, 600, 60, 16, 0)];
    const door = [K.brick(500, 660, 90, 22, 90, 1)];
    const chimney = [K.brick(640, 330, 70, 20, 90, 1)];
    const smoke = P(spline([pt(650, 270), pt(700, 220), pt(760, 230), pt(820, 190)], 60).slice(1), 'blue', 12);
    const pines = pine(140, 470, 4, 64, 62).concat(pine(860, 470, 4, 64, 62));
    const snow = P([pt(500, 250), pt(300, 300), pt(400, 800), pt(600, 800), pt(250, 880), pt(750, 880)], 'teal', 12);
    return [roof, walls, windows, door, chimney, smoke, pines, snow];
  })()
}));

// 5. Ribbons of aurora across the night sky.
snowglobeHollow.push(lvl({
  name: 'Aurora',
  intro: 'Make a chain of ten hits in one shot. New: lightning lights the pegs nearby.',
  goal: { type: 'chain', chain: 10 }, plate: catchP(300, 90),
  items: (() => {
    let sky = [];
    [['green', 300, 0], ['teal', 400, 1.2], ['purple', 500, 2.4]].forEach(([c, y, ph]) => { sky = sky.concat(P(K.wave(80, 920, y, 46, 1.3, 15, ph), c, 15)); });
    sky = sprinkle(sky, ['zap', 'zap', 'zap', 'zap', 'multiball'], 'sh5', reach);
    const hills = pine(150, 700, 3, 64, 60).concat(pine(370, 760, 3, 64, 60), pine(630, 760, 3, 64, 60), pine(850, 700, 3, 64, 60));
    return [sky, hills];
  })()
}));

// 6. A snowman with gem buttons.
snowglobeHollow.push(lvl({
  name: 'Snowman',
  intro: 'Collect the gems on the snowman. New: a double points peg doubles that shot.',
  goal: { type: 'gems' }, plate: catchP(300, 90),
  items: (() => {
    const head = ringN(500, 360, 82, 8, -90), body = ringN(500, 580, 112, 11, -90), base = ringN(500, 820, 128, 12, -90);
    let snowman = P(head.filter(p => p.y < 430), 'blue', 15).concat(P(body.filter(p => p.y > 485 && p.y < 680), 'blue', 15), P(base.filter(p => p.y > 715), 'blue', 15));
    const scarf = P(K.line(430, 460, 570, 460, 3), 'red', 15);
    const hat = [K.brick(500, 270, 150, 18, 0, 1), K.brick(500, 228, 90, 40, 0, 1)];
    const armL = P(K.line(390, 540, 250, 450, 3), 'purple', 13), armR = P(K.line(610, 540, 750, 450, 3), 'purple', 13);
    const g = gems([pt(470, 345), pt(530, 345), pt(500, 545), pt(500, 615), pt(205, 425), pt(795, 425)]);
    let snow = P([pt(150, 260), pt(850, 260), pt(130, 650), pt(870, 650), pt(220, 850), pt(780, 850)], 'teal', 13);
    snow = sprinkle(snow, ['multiplier', 'multiplier'], 'sh6');
    return [snowman, scarf, hat, armL, armR, g, snow];
  })()
}));

// 7. A frozen pond with skaters spinning.
snowglobeHollow.push(lvl({
  name: 'Skating Pond',
  intro: 'Glide around the pond to reach the target score. The plate bounces. New: springy bumpers.',
  goal: { type: 'score', frac: 2.0 }, plate: bounceP(260, 70),
  items: (() => {
    const rink = P(K.ellipse(500, 620, 340, 180, 24), 'teal', 15);
    const skaters = T([pt(380, 600), pt(620, 600), pt(500, 680)], 'bumper', { r: 22 });
    const inside = P([pt(500, 560), pt(300, 660), pt(700, 660), pt(420, 720), pt(580, 720)], 'blue', 14);
    const pines = pine(130, 260, 4, 62, 60).concat(pine(870, 260, 4, 62, 60));
    let snow = P(scatter('sh7', 9, p => p.y < 400 && p.x > 250 && p.x < 750, 90), 'blue', 12);
    snow = sprinkle(snow, ['multiplier'], 'sh7m');
    return [rink, skaters, inside, pines, snow];
  })()
}));

// 8. Snowflakes tumbling through the air.
snowglobeHollow.push(lvl({
  name: 'Snowfall',
  intro: 'Clear every snowflake. New: a spray peg makes your next shot three balls.',
  goal: { type: 'clear' }, plate: timedP(5, 300, 90),
  items: (() => {
    const spots = [pt(260, 320), pt(740, 320), pt(500, 420), pt(170, 560), pt(830, 560), pt(330, 640), pt(670, 640)];
    let out = [];
    spots.forEach((s, k) => { out = out.concat(P(ringN(s.x, s.y, 40, 4, k * 15 + 45), k % 2 ? 'teal' : 'blue', 14)); });
    out = sprinkle(out, ['spray', 'spray', 'multiball'], 'sh8', reach);
    const drifts = T([pt(430, 880), pt(570, 880)], 'bumper', { r: 22 });
    return [out, drifts];
  })()
}));

// 9. A sledging hill with a lift back to the top.
snowglobeHollow.push(lvl({
  name: 'Sled Hill',
  intro: 'Break thirty-five pegs down the sled hill. New: portals send your ball to their twin.',
  goal: { type: 'count', count: 35 }, plate: stillP(160, 300),
  items: (() => {
    const hill1 = P(spline([pt(120, 320), pt(380, 420), pt(640, 500), pt(880, 520)], 66), 'blue', 15);
    const hill2 = P(spline([pt(880, 650), pt(620, 700), pt(360, 760), pt(140, 760)], 66), 'teal', 15);
    const pines = pine(260, 220, 3, 60, 56).concat(pine(760, 340, 3, 60, 56), pine(240, 560, 3, 60, 56), pine(640, 860, 2, 60, 56));
    const portals = [K.item('portal', 900, 860, { p: 0, r: 24 }), K.item('portal', 110, 220, { p: 0, r: 24 })];
    const flags = P([pt(500, 330), pt(450, 610), pt(800, 790)], 'red', 15);
    return [hill1, hill2, pines, portals, flags];
  })()
}));

// 10. Icicles hanging from the eaves.
snowglobeHollow.push(lvl({
  name: 'Icicles',
  intro: 'Break every icicle and brick. New: a fireball burns right through pegs for a few seconds.',
  goal: { type: 'bricks' }, plate: catchP(300, 90),
  items: (() => {
    const eaves = K.bricksAlong(K.line(170, 290, 480, 230, 4), { w: 80, h: 20, follow: true, hp: 1 }).concat(K.bricksAlong(K.line(520, 230, 830, 290, 4), { w: 80, h: 20, follow: true, hp: 1 }));
    const icicles = [];
    [[220, 70], [300, 100], [380, 60], [620, 60], [700, 100], [780, 70]].forEach(([x, len]) => {
      const y0 = x < 500 ? 290 - (x - 170) * 60 / 310 : 230 + (x - 520) * 60 / 310;
      icicles.push(K.glass(x, y0 + 30 + len / 2, len, 14, 90));
    });
    let drifts = P(K.wave(110, 890, 620, 40, 1.5, 12), 'blue', 15).concat(P(K.wave(150, 850, 780, 30, 1.5, 10, 2), 'teal', 15));
    drifts = sprinkle(drifts, ['fire', 'fire'], 'sh10', reach);
    const lamps = P([pt(500, 420), pt(120, 450), pt(880, 450)], 'yellow', 15);
    return [eaves, icicles, drifts, lamps];
  })()
}));

// 11. Warm windows inside a cottage, behind a locked roof hatch.
snowglobeHollow.push(lvl({
  name: 'Warm Windows',
  intro: 'Hit the key to open the roof hatch, then light the lanterns. New: keys open gates.',
  goal: { type: 'lanterns' }, plate: catchP(300, 90),
  items: (() => {
    const roofL = [K.wall(345, 460, 110, 18, -30)], roofR = [K.wall(655, 460, 110, 18, 30)];
    const hatch = [K.gate(450, 400, 110, 18, -24, 'yellow'), K.gate(550, 400, 110, 18, 24, 'yellow')];
    const sides = [K.wall(290, 575, 160, 18, 90), K.wall(710, 575, 160, 18, 90)];
    const inside = lanterns([pt(440, 540), pt(560, 540), pt(500, 620)]);
    const outside = lanterns([pt(150, 360), pt(850, 360), pt(140, 650), pt(860, 650), pt(500, 250)]);
    const key = K.item('key', 300, 330, { k: 'yellow', r: 19 });
    const snow = P([pt(330, 280), pt(670, 280), pt(780, 220), pt(230, 820), pt(770, 820), pt(400, 860), pt(600, 860)], 'blue', 13);
    const chimney = P(K.line(640, 330, 640, 330, 1), 'red', 15);
    return [roofL, roofR, hatch, sides, inside, outside, key, snow, chimney];
  })()
}));

// 12. Three snowflakes, each with blue crystal tips.
snowglobeHollow.push(lvl({
  name: 'Snowflake Trio',
  intro: 'Break every blue crystal on the three snowflakes. New: a safety net bounces your ball back up.',
  goal: { type: 'color', color: 'blue' }, plate: catchP(300, 90),
  items: (() => {
    let out = [];
    [[250, 360, 0], [750, 360, 30], [500, 600, 15]].forEach(([x, y, rot], k) => {
      const pos = K.rotateAbout(snowflake(x, y, [62, 124], [], 0), x, y, rot);
      out = out.concat(pos.map((p, i) => { const tip = i % 2 === 1, blue = tip && Math.floor(i / 2) % 2 === (k === 2 ? 0 : 1) && easy(p); return K.peg(p.x, p.y, blue ? 'blue' : tip ? 'purple' : 'teal', tip ? 16 : 14); }), [K.peg(x, y, 'yellow', 17)]);
    });
    out = sprinkle(out, ['net', 'net'], 'sh12', p => p.t === 'peg' && p.c === 'teal' && easy(p));
    const snow = P([pt(150, 640), pt(850, 640), pt(250, 840), pt(750, 840)], 'teal', 13);
    return [out, snow];
  })()
}));

// 13. Skaters gliding in slow circles.
snowglobeHollow.push(lvl({
  name: 'Skaters',
  intro: 'Collect the gems as the skaters glide in slow circles. New: some pieces move, slowly.',
  goal: { type: 'gems' }, plate: catchP(300, 90),
  items: (() => {
    const rink = P(K.ellipse(500, 560, 380, 250, 26), 'teal', 14);
    const skaters = [];
    [[360, 500, 0], [640, 500, 0.5], [500, 640, 0.25]].forEach(([x, y, ph], k) => {
      skaters.push(Object.assign(K.item('gem', x, y, { r: 18 }), { m: { type: 'orbit', r: 70, speed: k % 2 ? -18 : 18, phase: ph } }));
      skaters.push(Object.assign(K.peg(x, y, 'pink', 13), { m: { type: 'orbit', r: 70, speed: k % 2 ? -18 : 18, phase: ph + 0.5 } }));
    });
    const out = gems([pt(500, 250), pt(150, 280), pt(850, 280)]);
    const pines = pine(130, 820, 2, 60, 56).concat(pine(870, 820, 2, 60, 56));
    const lamps = P([pt(500, 400), pt(500, 755)], 'yellow', 15);
    return [rink, skaters, out, pines, lamps];
  })()
}));

// 14. The north star over the hollow.
snowglobeHollow.push(lvl({
  name: 'North Star',
  intro: 'Make a chain of twelve in one shot. New: a blast peg makes your next ball burst on its first hit.',
  goal: { type: 'chain', chain: 12 }, plate: catchP(300, 90),
  items: (() => {
    let star = P(K.starShape(500, 500, 250, 110, 8, 32), 'yellow', 15);
    const inner = P(ringN(500, 500, 60, 6, -90), 'teal', 14);
    star = sprinkle(star, ['blast', 'blast', 'zap'], 'sh14', reach);
    const small = [];
    [[130, 300], [870, 300], [150, 800], [850, 800]].forEach(([x, y]) => small.push(...P(K.starShape(x, y, 40, 18, 4, 4, -90), 'blue', 12)));
    return [star, inner, [K.item('zap', 500, 500, { r: 18 })], small];
  })()
}));

// 15. A bell tower ringing over the rooftops.
snowglobeHollow.push(lvl({
  name: 'Bell Tower',
  intro: 'Ring the bell to reach the target score. New: the super guide shows a long aiming line.',
  goal: { type: 'score', frac: 1.3 }, plate: catchP(300, 90),
  items: (() => {
    const bellL = spline([pt(500, 340), pt(420, 370), pt(400, 460), pt(380, 560), pt(320, 640)], 62);
    const bell = P(bellL.concat(bellL.map(p => pt(1000 - p.x, p.y)).slice(1)), 'yellow', 15);
    const rim = P(K.line(330, 670, 670, 670, 6), 'orange', 15);
    const clapper = T([pt(500, 560)], 'bumper', { r: 24 });
    const arch = K.bricksAlong(arcS(500, 470, 290, 205, 335, 84), { w: 76, h: 20, follow: true, hp: 1 });
    const towerL = [K.wall(180, 690, 160, 18, 90)], towerR = [K.wall(820, 690, 160, 18, 90)];
    let snow = P([pt(130, 300), pt(870, 300), pt(110, 520), pt(890, 520), pt(250, 860), pt(750, 860), pt(500, 860)], 'blue', 13);
    snow = sprinkle(snow, ['guide', 'multiplier'], 'sh15');
    return [bell, rim, clapper, arch, towerL, towerR, snow];
  })()
}));

// 16. A snowglobe holding a tiny village.
snowglobeHollow.push(lvl({
  name: 'The Snowglobe',
  intro: 'Shatter into the snowglobe and light the tiny village inside.',
  goal: { type: 'lanterns' }, plate: catchP(300, 90),
  items: (() => {
    const cx = 500, cy = 520, r = 300;
    const glassRing = [];
    for (let a = 200; a <= 340; a += 20) { const p = pt(cx + Math.cos(a * D2R) * r, cy + Math.sin(a * D2R) * r); glassRing.push(K.glass(p.x, p.y, 92, 16, a + 90)); }
    const sideL = arcS(cx, cy, r, 160, 185, 70).concat(arcS(cx, cy, r, 355, 380, 70));
    const base = K.bricksAlong(K.line(260, 860, 740, 860, 5), { w: 90, h: 22, hp: 1 });
    const village = house(390, 680, 110, 100).concat(house(610, 680, 110, 100, 'purple'));
    const lan = lanterns([pt(390, 620), pt(610, 620), pt(500, 420), pt(330, 480), pt(670, 480), pt(130, 360), pt(870, 360)]);
    const tree = pine(500, 540, 3, 56, 52);
    return [glassRing, P(sideL, 'teal', 14), base, village, lan, tree];
  })()
}));

// 17. Two snow forts piled with snowballs.
snowglobeHollow.push(lvl({
  name: 'Snow Forts',
  intro: 'Clear every snowball from the two snow forts.',
  goal: { type: 'clear' }, plate: timedP(4, 300, 90),
  items: (() => {
    const fort = (cx, dir) => [K.brick(cx, 660, 160, 22, dir * 12, 1), K.brick(cx - dir * 90, 600, 90, 20, 90, 1)];
    const pileL = P(K.pyramid(230, 480, 4, 62, 50), 'blue', 15), pileR = P(K.pyramid(770, 480, 4, 62, 50), 'teal', 15);
    let mid = P(K.arc(500, 560, 170, 7, 200, 340), 'purple', 15);
    mid = sprinkle(mid.concat(pileL, pileR), ['multiball', 'zap', 'spray'], 'sh17', reach);
    const flags = [K.item('steel', 230, 380, { r: 12 }), K.item('steel', 770, 380, { r: 12 })];
    return [fort(250, 1), fort(750, -1), mid, flags];
  })()
}));

// 18. A great snowflake turning in the wind.
snowglobeHollow.push(lvl({
  name: 'Snowflake Spinner',
  intro: 'The great snowflake turns slowly. Break forty-five of its pegs.',
  goal: { type: 'count', count: 45 }, plate: catchP(300, 90),
  items: (() => {
    const cx = 500, cy = 540;
    const arm = flakeArm(cx, cy, [70, 140, 210, 280], [140, 210], 60);
    let flake = [];
    for (let k = 0; k < 6; k++) flake = flake.concat(K.rotateAbout(arm.map((p, i) => K.peg(p.x, p.y, i === 3 ? 'purple' : i < 3 ? 'teal' : 'blue', 15)), cx, cy, k * 60));
    flake = sprinkle(flake, ['zap', 'multiball'], 'sh18', p => p.t === 'peg' && p.c === 'teal');
    flake = K.spin(flake.concat([K.item('extra', cx, cy, { r: 19 })]), cx, cy, 9);
    const corners = [];
    [[110, 240], [890, 240], [110, 900], [890, 900]].forEach(([x, y]) => corners.push(...P(ringN(x, y, 36, 6, -90), 'blue', 11)));
    return [flake, corners];
  })()
}));

// 19. Aurora curtains swaying slowly.
snowglobeHollow.push(lvl({
  name: 'Aurora Curtain',
  intro: 'The aurora sways slowly. Break every pink peg in its curtains.',
  goal: { type: 'color', color: 'pink' }, plate: catchP(300, 90),
  items: (() => {
    let out = [];
    [['green', 300, 0, 1], ['teal', 420, 1.4, -1], ['purple', 540, 2.8, 1]].forEach(([c, y, ph, dir], k) => {
      let row = P(K.wave(110, 890, y, 30, 1.2, 13, ph), c, 15);
      row = tint(row, 3, 'pink', 'sh19' + k, p => p.x > 160 && p.x < 840);
      out = out.concat(K.slide(row, 50 * dir, 0, 10, k * 0.2));
    });
    const village = house(250, 860, 110, 90).concat(house(750, 860, 110, 90, 'purple'));
    const tree = pine(500, 720, 3, 60, 54);
    return [out, village, tree, P([pt(250, 790), pt(750, 790)], 'yellow', 13)];
  })()
}));

// 20. The winter festival: a giant snowflake full of powers.
snowglobeHollow.push(lvl({
  name: 'Winter Festival',
  intro: 'The winter festival is here. Collect every ice gem, with powers all around to help.',
  goal: { type: 'gems' }, balls: 12, plate: catchP(320, 80),
  items: (() => {
    const cx = 500, cy = 540;
    const arm = flakeArm(cx, cy, [80, 160, 240, 320], [160, 240], 66);
    let flake = [];
    for (let k = 0; k < 6; k++) flake = flake.concat(K.rotateAbout(arm.map((p, i) => (i === 3 ? K.item('gem', p.x, p.y, { r: 18 }) : K.peg(p.x, p.y, i < 3 ? 'teal' : (k % 2 ? 'pink' : 'purple'), 15))), cx, cy, k * 60 + 30));
    flake.push(K.item('gem', cx, cy, { r: 20 }));
    flake = sprinkle(flake, ['multiball', 'spray', 'fire', 'zap', 'extra', 'blast'], 'sh20', p => p.t === 'peg' && easy(p));
    const lights = gems([pt(120, 760), pt(880, 760)]);
    return [flake, lights];
  })()
}));

/* ════════════════════════════════════════════════════════════════════════ */

module.exports = [
  {
    id: 'cozy-lantern-garden', title: 'Lantern Garden', theme: 'lantern-garden',
    blurb: 'A dusky garden of paper lanterns, flowers and fireflies. Light them all, at your own pace.',
    levels: lanternGarden
  },
  {
    id: 'cozy-moonlit-lake', title: 'Moonlit Lake', theme: 'moonlit-lake',
    blurb: 'A calm night lake where the moon shines twice. Collect moon pearls among ripples and reeds.',
    levels: moonlitLake
  },
  {
    id: 'cozy-snowglobe-hollow', title: 'Snowglobe Hollow', theme: 'snowglobe-hollow',
    blurb: 'Soft snow on a cosy village under the aurora. Snowflakes, pine trees and warm windows.',
    levels: snowglobeHollow
  }
];
