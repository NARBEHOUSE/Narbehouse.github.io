#!/usr/bin/env node
/* NARBE Mini Golf — play every hole with a bot (Node only, no browser).
 *
 *   node tools/check-courses.cjs [course.json ...]
 *
 * The bot tries a fan of angles × powers with the game's own physics (the
 * aim-preview path, no random deflections) and keeps the shot that ends
 * closest to the cup by *walking* distance — a flood fill round the rails,
 * walls and ponds — so it plays doglegs instead of bashing the corner.
 * Reports strokes per hole and flags anything unreachable or suspicious:
 * tee or cup off the carpet, a cup the bot can't reach in 8, or a par that
 * is far from what the bot needed.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const MG = require('./load.cjs')();
const C = MG.course, P = MG.physics;

/** Walking distance to the cup (round rails, walls, ponds; tunnels count) — shared with the game. */
function distanceField(ch) {
  const rf = P.routeField(ch);
  return (x, y) => rf.at(x, y);
}

function playHole(ch, maxStrokes) {
  const field = distanceField(ch);
  const ball = P.makeBall(ch.start.x, ch.start.y, ch.ballR, 0);
  const powers = [0.06, 0.1, 0.15, 0.21, 0.28, 0.36, 0.46, 0.6, 0.8, 1];
  let strokes = 0;
  const log = [];
  while (strokes < maxStrokes) {
    strokes++;
    let best = null;
    for (let a = 0; a < 360; a += 3) {
      const ang = a * Math.PI / 180;
      for (const p of powers) {
        const r = P.predict(ch, ball, ang, p, { maxSec: 16 });
        let score;
        if (r.holed) score = -1000 - (1 - p);            // gentlest holing putt
        else if (r.drowned) score = 1e9;
        else score = field(r.end.x, r.end.y);
        if (!best || score < best.score) best = { score, ang, p, r };
      }
    }
    if (!best || best.score >= 1e9) { log.push('no safe shot'); return { strokes: Infinity, log }; }
    log.push(`${(best.ang * 180 / Math.PI).toFixed(0)}°@${best.p}${best.r.holed ? ' IN' : ' → ' + (isFinite(best.score) ? best.score.toFixed(0) + 'px' : '?')}`);
    if (best.r.holed) return { strokes, log };
    ball.x = best.r.end.x; ball.y = best.r.end.y;
  }
  return { strokes: Infinity, log };
}

/**
 * A decent human: aims within a few degrees and judges power within ~10%.
 * Picks the shot whose *average* outcome under that wobble is best, then
 * plays it with a random wobble. Averaged over a few rounds, this is what
 * par should be set from.
 */
function playHuman(ch, maxStrokes, seed) {
  const field = distanceField(ch);
  const rnd = MG.util.mulberry32(seed);
  const ball = P.makeBall(ch.start.x, ch.start.y, ch.ballR, 0);
  const powers = [0.08, 0.14, 0.2, 0.28, 0.38, 0.5, 0.7];
  const wob = [[0, 1], [-2.5, 0.9], [2.5, 1.1]];
  let strokes = 0;
  const outcome = (ang, p) => {
    const r = P.predict(ch, ball, ang, p, { maxSec: 16 });
    return r.holed ? -300 : r.drowned ? 5000 : field(r.end.x, r.end.y);
  };
  while (strokes < maxStrokes) {
    strokes++;
    let best = null;
    for (let a = 0; a < 360; a += 6) {
      for (const p of powers) {
        let s = 0;
        for (const [da, kp] of wob) s += outcome((a + da) * Math.PI / 180, Math.min(1, p * kp));
        if (!best || s < best.s) best = { s, a, p };
      }
    }
    const ang = (best.a + (rnd() * 2 - 1) * 3) * Math.PI / 180;
    const pw = Math.min(1, best.p * (0.9 + rnd() * 0.2));
    const r = P.predict(ch, ball, ang, pw, { maxSec: 16 });
    if (r.holed) return strokes;
    if (r.drowned) { strokes++; ball.x = ch.start.x; ball.y = ch.start.y; continue; }   // penalty, back to the tee
    ball.x = r.end.x; ball.y = r.end.y;
  }
  return maxStrokes;
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : JSON.parse(fs.readFileSync(path.join(__dirname, '../courses/course_list.json'), 'utf8'));
let problems = 0;
for (const f of files) {
  const course = C.normaliseCourse(JSON.parse(fs.readFileSync(path.join(__dirname, '../courses', path.basename(f)), 'utf8')));
  console.log(`\n${course.name} (${course.theme})`);
  let parTotal = 0, botTotal = 0;
  course.holes.forEach((h, i) => {
    const ch = C.compileHole(h);
    const issues = [];
    if (!C.pointInPolygon(ch.start.x, ch.start.y, ch.fairway.poly)) issues.push('tee off carpet');
    if (!C.pointInPolygon(ch.cup.x, ch.cup.y, ch.fairway.poly)) issues.push('cup off carpet');
    for (const t of ch.tunnels) {
      if (!C.pointInPolygon(t.x1, t.y1, ch.fairway.poly)) issues.push('tunnel mouth off carpet');
      if (!C.pointInPolygon(t.x2, t.y2, ch.fairway.poly)) issues.push('tunnel exit off carpet');
    }
    const t0 = Date.now();
    const res = playHole(ch, 8);
    if (!isFinite(res.strokes)) issues.push('bot could not hole it');
    const TRIALS = 4;
    let hum = 0;
    for (let k = 0; k < TRIALS; k++) hum += playHuman(ch, 8, 1000 + i * 31 + k);
    hum /= TRIALS;
    const suggest = Math.max(2, Math.round(hum + 0.25));
    if (Math.abs(suggest - h.par) >= 1) issues.push('suggest par ' + suggest);
    parTotal += h.par; botTotal += hum;
    if (issues.length) problems++;
    console.log(`  ${String(i + 1).padStart(2)} ${h.name.padEnd(22)} par ${h.par}  expert ${String(res.strokes).padEnd(2)} human ${hum.toFixed(2).padEnd(5)} ${(Date.now() - t0 + 'ms').padStart(7)}${issues.length ? '   << ' + issues.join('; ') : ''}`);
  });
  console.log(`  total par ${parTotal}, human avg ${botTotal.toFixed(1)}`);
}
console.log(problems ? `\n${problems} hole(s) need a look.` : '\nAll holes OK.');
process.exitCode = problems ? 1 : 0;
