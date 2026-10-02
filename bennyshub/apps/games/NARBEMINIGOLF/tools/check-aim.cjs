#!/usr/bin/env node
/* Does every hole start out aimed (and the camera facing) the right way?
 *
 *   node tools/check-aim.cjs [--old]
 *
 * For each tee, takes the opening aim the game will use and checks that
 * rolling a short way along it brings the ball *closer to the cup by walking
 * distance* (round rails, walls and ponds). A hole whose opening aim points
 * away from the route fails. --old replays the previous aiming rule, to show
 * what it got wrong.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const MG = require('./load.cjs')();
const C = MG.course, P = MG.physics;

const old = process.argv.includes('--old');

/** The rule the game used before 2026-10-02: cup, else lane nodes from the cup end — including the one behind the tee. */
function oldAim(ch, ball) {
  const segCross = (ax, ay, bx, by, cx, cy, dx, dy) => {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return t > 0.001 && t < 0.999 && u >= 0 && u <= 1;
  };
  const clear = (ax, ay, bx, by) => {
    for (const e of ch.fairway.edges) if (segCross(ax, ay, bx, by, e.x1, e.y1, e.x2, e.y2)) return false;
    for (const s of ch.solids) { const cs = C.boxCorners(s); for (let i = 0; i < 4; i++) if (segCross(ax, ay, bx, by, cs[i].x, cs[i].y, cs[(i + 1) % 4].x, cs[(i + 1) % 4].y)) return false; }
    return true;
  };
  const targets = [{ x: ch.cup.x, y: ch.cup.y }];
  const raw = ch.raw.fairway;
  if (raw && raw.lane) {
    const nodes = raw.lane.slice();
    if (Math.hypot(nodes[0].x - ch.start.x, nodes[0].y - ch.start.y) < Math.hypot(nodes[nodes.length - 1].x - ch.start.x, nodes[nodes.length - 1].y - ch.start.y)) nodes.reverse();
    targets.push(...nodes);
  }
  for (const t of targets) if (clear(ball.x, ball.y, t.x, t.y)) return Math.atan2(t.y - ball.y, t.x - ball.x);
  return Math.atan2(ch.cup.y - ball.y, ch.cup.x - ball.x);
}

const files = JSON.parse(fs.readFileSync(path.join(__dirname, '../courses/course_list.json'), 'utf8'));
let bad = 0, total = 0;
for (const f of files) {
  const course = C.normaliseCourse(JSON.parse(fs.readFileSync(path.join(__dirname, '../courses', f), 'utf8')));
  console.log('\n' + course.name);
  course.holes.forEach((h, i) => {
    const ch = C.compileHole(h);
    const ball = P.makeBall(ch.start.x, ch.start.y, ch.ballR, 0);
    const field = P.routeField(ch);
    const a = old ? oldAim(ch, ball) : P.smartAim(ch, ball, field);
    const d0 = field.at(ball.x, ball.y);
    // Walk a little way along the aim (stopping short of anything solid).
    let d1 = Infinity;
    for (const step of [30, 20]) {
      const x = ball.x + Math.cos(a) * step, y = ball.y + Math.sin(a) * step;
      const v = field.at(x, y);
      if (isFinite(v)) { d1 = v; break; }
    }
    const ok = isFinite(d0) && d1 < d0 - 10;
    total++;
    if (!ok) bad++;
    const toCup = Math.atan2(ch.cup.y - ball.y, ch.cup.x - ball.x);
    // And from anywhere a ball might come to rest, not just the tee.
    let spots = 0, wrong = 0;
    const rnd = MG.util.mulberry32(77 + i);
    const bb = ch.fairway.bbox;
    for (let n = 0; n < 400 && spots < 60; n++) {
      const x = bb.x0 + rnd() * (bb.x1 - bb.x0), y = bb.y0 + rnd() * (bb.y1 - bb.y0);
      if (!C.pointInPolygon(x, y, ch.fairway.poly) || C.closestOnPolygon(x, y, ch.fairway.poly).d < ch.ballR + 2) continue;
      const here = field.at(x, y);
      if (!isFinite(here) || here < 80 || P.surfaceAt(ch, x, y).kind === 'water') continue;
      spots++;
      const b2 = P.makeBall(x, y, ch.ballR, 0);
      const a2 = old ? oldAim(ch, b2) : P.smartAim(ch, b2, field);
      let v = Infinity;
      // A short probe: a tunnel mouth can be only ~40 px away.
      for (const st of [30, 20]) { const w = field.at(x + Math.cos(a2) * st, y + Math.sin(a2) * st); if (isFinite(w)) { v = w; break; } }
      // Aiming straight at a cup the ball can roll to is right even when a tunnel would be a shorter walk.
      const atCup = Math.abs(MG.util.angleDiff(a2, Math.atan2(ch.cup.y - y, ch.cup.x - x))) < 0.01 && P.lineClear(ch, x, y, ch.cup.x, ch.cup.y, ch.ballR * 0.6);
      if (!(v < here - 5) && !atCup) wrong++;
    }
    if (wrong) bad++;
    console.log(`  ${ok && !wrong ? 'ok  ' : 'BAD '} ${String(i + 1).padStart(2)} ${h.name.padEnd(20)} aim ${String(Math.round(a * 180 / Math.PI)).padStart(4)}°  (cup is at ${Math.round(toCup * 180 / Math.PI)}°)  route ${Math.round(d0)} → ${isFinite(d1) ? Math.round(d1) : '∞'}   from ${spots} other spots: ${wrong ? wrong + ' face the wrong way' : 'all fine'}`);
  });
}
console.log(`\n${total - bad}/${total} holes start facing the right way.`);
process.exitCode = bad ? 1 : 0;
