#!/usr/bin/env node
/* Is there a decent, clear way from the tee to the cup on every hole?
 *
 *   node tools/check-paths.cjs [course.json ...]
 *
 * Finds the route from tee to cup that keeps as much room as it can, and
 * reports its tightest spot. Two kinds of room are judged separately:
 *
 *   hazards (water, sand)         at least HAZARD_ROOM px either side — a clear
 *                                 lane over five balls wide past any pond or
 *                                 bunker;
 *   solids (rails, walls, bushes) at least SOLID_ROOM px either side — so a
 *                                 windmill tunnel or a gate between walls is a
 *                                 fair squeeze, but never a slot.
 *
 * Bridges count as clear ground. Tunnels are ignored: every hole has to be
 * fair without its shortcut.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const MG = require('./load.cjs')();
const C = MG.course, P = MG.physics;

const CELL = 10;
const HAZARD_ROOM = 65;
const SOLID_ROOM = 28;

function boxDistance(b, x, y) {
  const l = C.toLocal(b, x, y);
  return Math.hypot(Math.max(Math.abs(l.x) - b.hw, 0), Math.max(Math.abs(l.y) - b.hh, 0));
}

/** Room at (x,y); score 1 means "just enough" of both kinds. */
function room(ch, x, y) {
  if (!C.pointInPolygon(x, y, ch.fairway.poly)) return { score: 0, hz: 0, so: 0 };
  let so = C.closestOnPolygon(x, y, ch.fairway.poly).d;
  for (const s of ch.solids) so = Math.min(so, boxDistance(s, x, y));
  for (const b of ch.bushes) so = Math.min(so, Math.max(0, Math.hypot(x - b.x, y - b.y) - b.radius));
  let hz = Infinity;
  if (!P.onBridge(ch, x, y)) {
    for (const reg of ch.waters.concat(ch.sands)) {
      if (C.pointInPolygon(x, y, reg.poly)) { hz = 0; break; }
      hz = Math.min(hz, C.closestOnPolygon(x, y, reg.poly).d);
    }
  }
  return { score: Math.min(hz / HAZARD_ROOM, so / SOLID_ROOM), hz, so };
}

/** The roomiest route (maximin path) and its tightest spot. */
function widestRoute(ch) {
  const bb = ch.fairway.bbox;
  const nx = Math.ceil((bb.x1 - bb.x0) / CELL) + 1, ny = Math.ceil((bb.y1 - bb.y0) / CELL) + 1;
  const n = nx * ny;
  const R = new Float32Array(n), HZ = new Float32Array(n), SO = new Float32Array(n);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const r = room(ch, bb.x0 + i * CELL, bb.y0 + j * CELL), k = j * nx + i;
    R[k] = r.score; HZ[k] = r.hz; SO[k] = r.so;
  }
  // The tee and the cup sit right up against things; start/finish from the best cell nearby.
  const near = (x, y) => {
    let best = -1, bv = -1;
    const i0 = Math.round((x - bb.x0) / CELL), j0 = Math.round((y - bb.y0) / CELL);
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      if (R[j * nx + i] > bv) { bv = R[j * nx + i]; best = j * nx + i; }
    }
    return best;
  };
  const start = near(ch.start.x, ch.start.y), goal = near(ch.cup.x, ch.cup.y);

  // Widest-path search: best[k] is the most room any route from the tee to k keeps.
  const best = new Float32Array(n).fill(-1), from = new Int32Array(n).fill(-1);
  best[start] = R[start];
  const heap = [[R[start], start]];
  const push = (v, k) => {
    heap.push([v, k]);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] >= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] > heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] > heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (heap.length) {
    const [v, k] = pop();
    if (v < best[k]) continue;
    if (k === goal) break;
    const i = k % nx, j = (k - i) / nx;
    for (const [di, dj] of NB) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const kk = jj * nx + ii, nv = Math.min(v, R[kk]);
      if (nv > best[kk]) { best[kk] = nv; from[kk] = k; push(nv, kk); }
    }
  }
  if (best[goal] < 0) return { score: 0, pinch: null };
  // Walk back along the route for its tightest cell (ignoring the tee and cup surrounds).
  let pinch = null, worst = Infinity;
  for (let k = goal; k >= 0 && k !== start; k = from[k]) {
    const i = k % nx, j = (k - i) / nx, x = bb.x0 + i * CELL, y = bb.y0 + j * CELL;
    if (Math.hypot(x - ch.start.x, y - ch.start.y) < 60 || Math.hypot(x - ch.cup.x, y - ch.cup.y) < 60) continue;
    if (R[k] < worst) { worst = R[k]; pinch = { x: Math.round(x), y: Math.round(y), hz: HZ[k], so: SO[k] }; }
  }
  return { score: pinch ? worst : best[goal], pinch };
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : JSON.parse(fs.readFileSync(path.join(__dirname, '../courses/course_list.json'), 'utf8'));
let bad = 0, total = 0;
for (const f of files) {
  const course = C.normaliseCourse(JSON.parse(fs.readFileSync(path.join(__dirname, '../courses', path.basename(f)), 'utf8')));
  console.log('\n' + course.name);
  course.holes.forEach((h, i) => {
    const ch = C.compileHole(h);
    const r = widestRoute(ch);
    total++;
    const ok = r.score >= 1;
    if (!ok) bad++;
    const p = r.pinch;
    const hz = p ? (isFinite(p.hz) ? Math.round(p.hz) + ' px from water/sand' : 'no water/sand near') : '?';
    const so = p ? Math.round(p.so) + ' px from rails/walls/bushes' : '?';
    const why = !ok && p ? (p.hz / HAZARD_ROOM < p.so / SOLID_ROOM ? '   << squeezed by water/sand' : '   << squeezed by rails/walls/bushes') : (!ok ? '   << no route at all' : '');
    console.log(`  ${ok ? 'ok  ' : 'BAD '} ${String(i + 1).padStart(2)} ${h.name.padEnd(20)} tightest ${p ? '(' + p.x + ',' + p.y + ')' : ''}: ${hz}, ${so}${why}`);
  });
}
console.log('\n' + (total - bad) + '/' + total + ' holes have a clear way to the cup (' + HAZARD_ROOM + ' px from water/sand, ' + SOLID_ROOM + ' px from rails/walls/bushes).');
process.exitCode = bad ? 1 : 0;
