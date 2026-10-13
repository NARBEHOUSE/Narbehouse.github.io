/**
 * NARBE Racer — track validator (node, dev-only).
 *
 *   node tools/validate_tracks.js            table of every circuit, exit 1 on any rule break
 *   node tools/validate_tracks.js --detail   also print each layout's sections, drift bends
 *                                            and straights with their lap fractions (the map
 *                                            a designer places features by)
 *   node tools/validate_tracks.js meadow     just the named circuits
 *
 * It loads the real game files — js/constants.js, js/themes.js, js/tracks.js —
 * into a sandbox with a stand-in window/NK, builds every loop with the same
 * js/spline.js the game uses, and applies the shared rules in
 * tools/tracks_analysis.js (DESIGN.md §9.3–9.4, §10.3). Every circuit is also
 * checked mirrored, and the mirrored copy is compared with the original so
 * Mirror mode can never drift out of step.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const NKSpline = require('../js/spline.js');
const AN = require('./tracks_analysis.js');

const args = process.argv.slice(2);
const DETAIL = args.includes('--detail');
const only = args.filter((a) => !a.startsWith('--'));

/* ── Load the game data exactly as the browser would ─────────────────── */
function loadGame() {
  const ctx = { console: console, NKSpline: NKSpline };
  ctx.window = ctx;
  ctx.NK = {};
  vm.createContext(ctx);
  ['constants.js', 'themes.js', 'tracks.js'].forEach((f) => {
    const file = path.join(__dirname, '..', 'js', f);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: 'js/' + f });
  });
  return ctx.NK;
}

const NK = loadGame();
const env = { NKSpline: NKSpline, C: NK.C, themes: NK.themes };
const problems = [];
const fail = (where, msg) => problems.push(where + ': ' + msg);

/* ── Cups (DESIGN §9.3) ───────────────────────────────────────────────── */
const cups = NK.tracks.CUPS;
if (!Array.isArray(cups) || cups.length !== AN.CUPS.length) fail('CUPS', 'expected ' + AN.CUPS.length + ' cups');
AN.CUPS.forEach((want, i) => {
  const c = cups[i];
  if (!c) return;
  if (c.id !== want.id) fail('CUPS[' + i + ']', 'id "' + c.id + '" should be "' + want.id + '"');
  if (!c.name || !c.emoji) fail('CUPS[' + i + ']', 'needs a name and an emoji');
  if (JSON.stringify(c.tracks) !== JSON.stringify(want.tracks)) fail('CUPS[' + i + ']', 'tracks should be ' + want.tracks.join(', '));
});

/* ── Themes ───────────────────────────────────────────────────────────── */
Object.keys(AN.CATALOG).forEach((id) => {
  AN.checkTheme(id, NK.themes[id]).forEach((m) => fail('theme ' + id, m));
});
Object.keys(NK.themes).forEach((id) => { if (!AN.CATALOG[id]) fail('theme ' + id, 'not a §9.4 theme'); });

/* ── Tracks ───────────────────────────────────────────────────────────── */
const ids = AN.CUPS.reduce((a, c) => a.concat(c.tracks), []).filter((id) => !only.length || only.includes(id));

function checkShape(id, t) {
  ['id', 'name', 'cup', 'theme', 'blurb', 'seed', 'laps', 'points', 'opts', 'edges', 'features', 'landmarks'].forEach((k) => {
    if (!(k in t)) fail(id, 'missing ' + k);
  });
  if (t.id !== id) fail(id, 'id mismatch');
  if (t.laps !== 3) fail(id, 'laps should be 3');
  if (!(t.seed === (t.seed | 0))) fail(id, 'seed should be an integer');
  if (!NK.themes[t.theme]) fail(id, 'unknown theme ' + t.theme);
  const cup = cups.find((c) => c.tracks.indexOf(id) >= 0);
  if (!cup || cup.id !== t.cup) fail(id, 'cup should be ' + (cup && cup.id));
  if (!Array.isArray(t.points) || t.points.length < 8 || !t.points.every((p) => p.length === 3 && p.every(isFinite))) fail(id, 'points must be [[x, z, y], ...]');
  ['itemRows', 'padRows', 'boostPads', 'coins', 'ramps', 'hazards'].forEach((k) => {
    if (!Array.isArray(t.features[k])) fail(id, 'features.' + k + ' must be an array');
  });
}

/** Mirror mode must be the exact left-right reflection of the original. */
function checkMirror(id, a, b, ra, rb) {
  const ml = NK.C.mirrorLane;
  if (b.mirror !== true || a.mirror !== false) fail(id, 'get() must set mirror true/false');
  if (Math.abs(ra.L - rb.L) > 1e-6) fail(id, 'mirrored lap length differs');
  for (let i = 0; i < ra.loop.N; i += 7) {
    if (Math.abs(ra.loop.nodes[i].k + rb.loop.nodes[i].k) > 1e-9) { fail(id, 'mirrored curvature is not negated'); break; }
  }
  ['itemRows', 'padRows', 'boostPads', 'ramps', 'hazards'].forEach((k) => {
    a.features[k].forEach((r, i) => {
      const want = r.lanes.map(ml).sort((x, y) => x - y);
      if (JSON.stringify(want) !== JSON.stringify(b.features[k][i].lanes)) fail(id, 'mirrored ' + k + '[' + i + '] lanes wrong');
    });
  });
  a.features.coins.forEach((c, i) => {
    const want = Array.isArray(c.lane) ? c.lane.map(ml) : ml(c.lane);       // a hopping trail mirrors lane by lane
    if (JSON.stringify(want) !== JSON.stringify(b.features.coins[i].lane)) fail(id, 'mirrored coins[' + i + '] lane wrong');
  });
  a.edges.forEach((e, i) => {
    if (b.edges[i].left !== e.right || b.edges[i].right !== e.left) fail(id, 'mirrored edges[' + i + '] not swapped');
  });
  a.landmarks.forEach((m, i) => { if (b.landmarks[i].side !== -m.side) fail(id, 'mirrored landmarks[' + i + '] side not swapped'); });
  if (JSON.stringify(NK.tracks.TRACKS[id]) !== JSON.stringify(Object.assign({}, NK.tracks.TRACKS[id]))) fail(id, 'TRACKS entry changed');
}

const pad = (s, n) => { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); };
const lpad = (s, n) => { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; };
const pct = (f) => (f * 100).toFixed(1) + '%';
const fr = (s, L) => (s / L).toFixed(3);

const rows = [];
ids.forEach((id) => {
  const src = NK.tracks.TRACKS[id];
  if (!src) { fail(id, 'missing from TRACKS'); return; }
  checkShape(id, src);
  const a = NK.tracks.get(id), b = NK.tracks.get(id, { mirror: true });
  const ra = AN.analyse(env, a), rb = AN.analyse(env, b);
  ra.issues.forEach((m) => fail(id, m));
  rb.issues.forEach((m) => { if (ra.issues.indexOf(m) < 0) fail(id + ' (mirror)', m); });
  checkMirror(id, a, b, ra, rb);
  if (JSON.stringify(src) !== JSON.stringify(NK.tracks.TRACKS[id])) fail(id, 'get() mutated TRACKS');
  rows.push({ id: id, r: ra, t: a });

  if (DETAIL) {
    const L = ra.L;
    console.log('\n── ' + a.name + ' (' + id + ')  L=' + L.toFixed(1) + ' m');
    const lay = NK.tracks.buildLayout(src.layout);
    lay.sections.forEach((sct) => {
      const span = sct.from.toFixed(3) + '-' + sct.to.toFixed(3);
      const m = (sct.from * L).toFixed(0) + '-' + (sct.to * L).toFixed(0) + ' m';
      if (sct.kind === 'bend') console.log('  T' + lpad(sct.corner, 2) + ' ' + sct.turn + ' r' + lpad(sct.r, 3) + ' ' + lpad(sct.deg, 3) + '°  ' + span + '  ' + m + '  (' + sct.len.toFixed(0) + ' m)');
      else console.log('   straight          ' + span + '  ' + m + '  (' + sct.len.toFixed(0) + ' m)');
    });
    console.log('  drift bends: ' + ra.drifts.map((d) => (d.sign > 0 ? 'R' : 'L') + d.minR.toFixed(0) + ' @' + fr(d.from, L) + '-' + fr(d.to, L)).join('  '));
    console.log('  straights >= 80 m: ' + ra.straights.filter((s) => s.len >= 80).map((s) => s.len.toFixed(0) + ' m @' + fr(s.from, L) + '-' + fr(s.to, L)).join('  '));
    const ys = ra.loop.nodes.map((n) => n.y);
    const prof = [];
    for (let f = 0; f < 1; f += 0.05) prof.push(f.toFixed(2) + ':' + ys[Math.floor(f * ra.loop.N)].toFixed(1));
    console.log('  elevation: ' + prof.join(' '));
    ra.warnings.forEach((w) => console.log('  ! ' + w));
  }
});

/* ── Report ───────────────────────────────────────────────────────────── */
console.log('');
console.log(pad('track', 11) + lpad('lap m', 7) + lpad('minR', 6) + lpad('slope', 7) + lpad('y range', 13) +
  '  ' + pad('drift bends (radius m)', 24) + lpad('straight', 9) + lpad('drop m', 8) + lpad('wall m', 8) +
  lpad('box', 5) + lpad('pad', 5) + lpad('bst', 5) + lpad('coin', 5) + lpad('ramp', 5) + lpad('haz', 5) + lpad('lmk', 5) + '  ok');
rows.forEach(({ id, r }) => {
  const c = r.counts;
  const bad = problems.some((p) => p.startsWith(id + ':') || p.startsWith(id + ' (mirror)'));
  console.log(pad(id, 11) + lpad(r.L.toFixed(0), 7) + lpad(r.minRadius.toFixed(0), 6) + lpad(pct(r.maxSlope), 7) +
    lpad(r.yMin.toFixed(1) + '..' + r.yMax.toFixed(1), 13) + '  ' +
    pad(r.drifts.length + ': ' + r.drifts.map((d) => (d.sign > 0 ? 'R' : 'L') + d.minR.toFixed(0)).join(' '), 24) +
    lpad(r.longestStraight.toFixed(0), 9) + lpad(r.dropMetres.toFixed(0), 8) + lpad(r.wallMetres.toFixed(0), 8) +
    lpad(c.itemRows, 5) + lpad(c.padRows, 5) + lpad(c.boostPads, 5) + lpad(c.coins, 5) + lpad(c.ramps, 5) + lpad(c.hazards, 5) + lpad(c.landmarks, 5) +
    '  ' + (bad ? 'NO' : 'yes'));
});
const warnCount = rows.reduce((n, x) => n + x.r.warnings.length, 0);
if (!DETAIL && warnCount) {
  console.log('\nwarnings:');
  rows.forEach(({ id, r }) => r.warnings.forEach((w) => console.log('  ' + id + ': ' + w)));
}
if (problems.length) {
  console.log('\n' + problems.length + ' problem(s):');
  problems.forEach((p) => console.log('  ✗ ' + p));
  process.exit(1);
}
console.log('\nAll ' + rows.length + ' circuits pass (' + warnCount + ' warning' + (warnCount === 1 ? '' : 's') + ').');
