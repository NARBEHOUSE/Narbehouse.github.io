/**
 * NARBE Racer — world tour: builds every circuit with js/world.js and
 * photographs it (six chase-camera points round the lap in Open mode, one in
 * No-Fail, one overhead), dumps build time / draw calls / triangles, and checks
 * the NK.world API contract (DESIGN §10.4) plus geometry leaks on rebuild.
 *
 *   ... run.cjs tools/harness/world-tour.cjs            every track
 *   WORLD_TRACKS=meadow,lava ... run.cjs ...             just those
 */
'use strict';

const fs = require('fs');
const path = require('path');

const JS = path.join(__dirname, '..', '..', 'js');
const OPTIONAL = ['art-items', 'props-sunshine', 'props-moonlight', 'roster', 'themes', 'tracks', 'world'];
const have = OPTIONAL.filter((n) => fs.existsSync(path.join(JS, n + '.js')));
const PAGE = 'apps/games/NARBEKART/tools/world_view.html';
const STOPS = [-0.02, 0.16, 0.33, 0.5, 0.67, 0.84];

module.exports = async function (t) {
  t.note('modules present: ' + have.join(', '));
  await t.load(PAGE, { track: 'meadow', fly: 0, have: have.join(',') });
  await t.until('window.__wv && __wv.ready', 30000);
  const all = await t.js('NK.tracks.CUPS.reduce((a, c) => a.concat(c.tracks), [])');
  const only = (process.env.WORLD_TRACKS || '').split(',').filter(Boolean);
  const ids = only.length ? all.filter((id) => only.includes(id)) : all;

  /* ── API contract, on the first track ─────────────────────────────────── */
  const api = await t.js(`(function () {
    const W = __wv.W, r = {};
    const a = W.frameAt(10), b = W.frameAt(20);
    r.frameReused = a === b && a.pos === b.pos;
    const f = W.frameAt(W.L - 0.5), f0x = f.pos.x, g = W.frameAt(0.5);
    r.seamGap = Math.hypot(f0x - g.pos.x, 0) < 3;
    const p = W.pointAt(100, 5, new THREE.Vector3()), fr = W.frameAt(100);
    r.pointAt = Math.abs(p.x - (fr.pos.x + fr.right.x * 5)) < 1e-6;
    r.edge = W.edgeAt(50);
    r.limits = Object.assign({}, W.limits(50));
    const grid = W.startGrid(12);
    r.grid = grid.length === 12 && grid.every((q, i) => q.progress < 0 && (i === 0 || q.progress <= grid[i - 1].progress + 3.01));
    r.gridFirst = grid[0]; r.gridLast = grid[11];
    r.minimap = W.minimap.pts.length === W.loop.N * 2 && isFinite(W.minimap.bounds.minX);
    r.hazards = W.features.hazards.length;
    if (r.hazards) {
      const s1 = W.hazardState(0, 3.3), s2 = W.hazardState(0, 3.3), o = {};
      r.hazardPure = s1.x === s2.x && s1.active === s2.active && W.hazardState(0, 3.3, o) === o;
    }
    r.handles = { boxes: W.handles.boxes.length, coins: W.handles.coins.length, pads: W.handles.pads.length };
    return r;
  })()`);
  t.assert(api.frameReused, 'frameAt reuses one frame object', api);
  t.assert(api.pointAt, 'pointAt = frame pos + right * x');
  t.assert(api.grid, 'startGrid(12): 12 slots behind the line, row by row', { first: api.gridFirst, last: api.gridLast });
  t.assert(api.minimap, 'minimap has one xz pair per node and bounds');
  t.assert(!api.hazards || api.hazardPure, 'hazardState is pure and fills out', api.hazards);
  t.note('edgeAt(50) ' + JSON.stringify(api.edge) + ' limits(50) ' + JSON.stringify(api.limits));

  /* ── Leak check: rebuild the same track and count live geometries ─────── */
  const mem0 = await t.js('__wv.rebuild({ track: "meadow", mode: "open" }).geometries');
  let mem1 = 0;
  for (let k = 0; k < 3; k++) mem1 = await t.js('__wv.rebuild({ track: "meadow", mode: "open" }).geometries');
  t.assert(Math.abs(mem1 - mem0) <= 2, 'no geometry leak across rebuilds', { first: mem0, afterThree: mem1 });

  /* ── Tour ─────────────────────────────────────────────────────────────── */
  const table = [];
  for (const id of ids) {
    const open = await t.js('__wv.rebuild({ track: ' + JSON.stringify(id) + ', mode: "open", mirror: false })');
    const row = { id, L: open.L, buildOpen: open.buildMs, stats: open.stats, features: open.features, chase: [] };
    for (let k = 0; k < STOPS.length; k++) {
      const s = STOPS[k] * open.L;
      const lane = [0, -3.6, 3.6, 0, -7.2, 7.2][k];
      const inf = await t.js('__wv.chase(' + s + ', ' + lane + ')');
      await t.wait(160);
      await t.shot(id + '-open-' + k);
      row.chase.push({ s: Math.round(s), calls: inf.calls, tris: inf.tris });
    }
    const ov = await t.js('__wv.overhead()');
    await t.wait(160);
    await t.shot(id + '-overhead');
    row.overhead = { calls: ov.calls, tris: ov.tris };
    const nf = await t.js('__wv.rebuild({ track: ' + JSON.stringify(id) + ', mode: "nofail" })');
    row.buildNoFail = nf.buildMs;
    await t.js('__wv.chase(' + (0.33 * nf.L) + ', 3.6)');
    await t.wait(160);
    await t.shot(id + '-nofail');
    const maxCalls = Math.max.apply(null, row.chase.map((c) => c.calls));
    row.maxChaseCalls = maxCalls;
    t.assert(maxCalls <= 250, id + ': chase view <= 250 draw calls', maxCalls);
    t.assert(open.buildMs < 1500, id + ': Open build < 1.5 s', open.buildMs);
    t.note(id + ' L=' + open.L + ' build open ' + open.buildMs + ' ms / nofail ' + nf.buildMs + ' ms; chase calls ' +
      row.chase.map((c) => c.calls).join('/') + '; tris ' + row.chase.map((c) => Math.round(c.tris / 1000) + 'k').join('/') +
      '; overhead ' + ov.calls + ' calls ' + Math.round(ov.tris / 1000) + 'k; props ' + open.stats.props +
      ' (' + open.stats.animated + ' animated, ' + open.stats.sceneryMeshes + ' meshes)');
    table.push(row);
  }
  fs.writeFileSync(path.join(t.outDir, 'world-numbers.json'), JSON.stringify(table, null, 2));
};
