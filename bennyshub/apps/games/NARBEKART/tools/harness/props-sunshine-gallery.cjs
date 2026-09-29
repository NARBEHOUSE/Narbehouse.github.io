/**
 * Sunshine Cup props: builds every prop and hazard from DESIGN §9.4 in the
 * gallery, screenshots each theme (near props in two halves, far props and
 * landmarks, hazards from the front and from the chase camera) plus an
 * overview, and checks the budgets:
 *   scenery ≤ 2 draw calls, hazards ≤ 3 (outline included), lowest point on
 *   the ground (puddles at y = 0.02), hazards sized to the lanes.
 * Set PS_THEMES=meadow,shores to shoot only some themes (stats always cover all).
 */
const fs = require('fs');
const path = require('path');

module.exports = async function (t) {
  const only = (process.env.PS_THEMES || 'meadow,shores,candy,dunes').split(',');
  await t.load('apps/games/NARBEKART/tools/gallery-props-sunshine.html');
  await t.until('window.gallery && gallery.ready', 30000);
  await t.wait(400);

  for (const theme of only) {
    for (const part of ['near1', 'near2', 'far', 'hazards', 'chase']) {
      await t.js('gallery.focus(' + JSON.stringify(theme) + ',' + JSON.stringify(part) + ')');
      await t.wait(250);
      await t.shot(theme + '-' + part);
    }
  }
  await t.js('gallery.overview()');
  await t.wait(300);
  await t.shot('overview');
  t.note('overview view: ' + (await t.js('gallery.calls()')) + ' draw calls, ' + (await t.js('gallery.tris()')) + ' triangles');

  const stats = await t.js('gallery.stats(4)');
  fs.writeFileSync(path.join(t.outDir, 'prop-stats.json'), JSON.stringify(stats, null, 2));
  const names = Object.keys(stats);
  const missing = names.filter((n) => !stats[n].exists);
  t.assert(missing.length === 0, 'every §9.4 Sunshine name has a builder', missing);

  const lines = [];
  for (const n of names) {
    const s = stats[n];
    if (!s.exists) continue;
    const hz = s.part.startsWith('hazard');
    const puddle = s.part === 'hazard:puddle';
    lines.push((s.theme + ' ' + s.part).padEnd(22) + n.padEnd(17) + String(s.tris).padStart(6) + ' tris ' +
      String(s.calls).padStart(2) + ' calls ' + String(s.ms).padStart(6) + ' ms  dims ' + JSON.stringify(s.dims[0]) + ' anim ' + s.anim);
    t.assert(s.calls <= (hz ? 3 : 2), n + ' draw calls within budget', s.calls);
    const ground = puddle ? 0.02 : 0;
    t.assert(s.minY.every((y) => Math.abs(y - ground) < 0.011), n + ' sits on the ground line', s.minY);
    if (s.part === 'hazard:block') {
      t.assert(s.dims.every((d) => d[0] > 2.5 && d[0] <= 3.0 && d[1] <= 2.5), n + ' fills one lane, <= 2.5 m tall', s.dims);
    }
    if (s.part === 'hazard:roller') {
      t.assert(s.dims.every((d) => d[0] > 1.7 && d[0] < 2.5), n + ' is about 2 m across', s.dims);
    }
    if (puddle) {
      t.assert(s.dims.every((d) => d[0] > 2.6 && d[0] <= 3.6 && d[2] > 5.4 && d[2] < 6.6), n + ' is a lane wide and about 6 m long', s.dims);
    }
  }
  fs.writeFileSync(path.join(t.outDir, 'prop-stats.txt'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
};
