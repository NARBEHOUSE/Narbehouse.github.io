/** All eight prop catalogs: real WebGL build, merge/geometry budgets and hazards. */
const fs = require('fs');
const path = require('path');
module.exports = async function (t) {
  const all = {};
  for (const cup of ['sunshine', 'moonlight']) {
    await t.load('apps/games/NARBEKART/tools/gallery-props-sunshine.html?cup=' + cup);
    await t.until('window.gallery && gallery.ready', 30000);
    const stats = await t.js('gallery.stats(4)');
    Object.assign(all, stats);
    const missing = Object.keys(stats).filter((name) => !stats[name].exists);
    t.assert(missing.length === 0, cup + ': complete catalog', missing);
    for (const [name, s] of Object.entries(stats)) {
      if (!s.exists) continue;
      const hz = s.part.startsWith('hazard'), puddle = s.part === 'hazard:puddle';
      t.assert(s.calls <= (hz ? 3 : 2), name + ': draw budget', s.calls);
      t.assert(s.minY.every((y) => Math.abs(y - (puddle ? 0.02 : 0)) < 0.011), name + ': grounded', s.minY);
      if (s.part === 'hazard:block') t.assert(s.dims.every((d) => d[0] > 2.5 && d[0] <= 3 && d[1] <= 2.5), name + ': block bounds', s.dims);
      if (s.part === 'hazard:roller') t.assert(s.dims.every((d) => d[0] > 1.7 && d[0] < 2.5), name + ': roller bounds', s.dims);
      if (puddle) t.assert(s.dims.every((d) => d[0] > 2.6 && d[0] <= 3.6 && d[2] > 5.4 && d[2] < 6.6), name + ': puddle bounds', s.dims);
    }
    const integrity = await t.js(`(() => {
      const errors = [];
      for (const theme of Object.values(NK.themes)) {
        const names = [...new Set(theme.props.near.concat(theme.props.far, theme.landmarks || []))];
        for (const name of names) {
          if (!NK.art.props[name]) { errors.push(name + ': missing'); continue; }
          const o = NK.art.props[name](NK.util.rng(73));
          o.traverse(m => { if (m.isMesh) for (const a of Object.values(m.geometry.attributes)) if ([...a.array].some(v => !Number.isFinite(v))) errors.push(name + ': nonfinite geometry'); });
          NK.art.disposeTree(o);
        }
      }
      for (const name of ['lava_geyser', 'plasma_vent']) {
        const o = NK.art.hazard[name](NK.util.rng(1)), c = o.children.find(n => n.userData.keep);
        o.userData.setState(false, false, 0.5); if (c.visible) errors.push(name + ': idle');
        o.userData.setState(false, true, 0.95); if (!c.visible || c.scale.y >= 0.2) errors.push(name + ': warning');
        o.userData.setState(true, false, 0.1); if (!c.visible || c.scale.y < 0.8) errors.push(name + ': active');
        NK.art.disposeTree(o);
      }
      return errors;
    })()`);
    t.assert(integrity.length === 0, cup + ': finite geometry and geyser state', integrity);
    const themes = cup === 'sunshine' ? ['shores', 'candy', 'dunes'] : ['frost', 'spooky', 'lava', 'starlight'];
    for (const theme of themes) for (const band of ['near', 'far', 'hazards']) {
      await t.js('gallery.focus(' + JSON.stringify(theme) + ',' + JSON.stringify(band) + ')');
      await t.wait(120); await t.shot(theme + '-' + band);
    }
  }
  fs.writeFileSync(path.join(t.outDir, 'prop-stats.json'), JSON.stringify(all, null, 2));
  t.assert(t.errors.length === 0, 'no browser errors', t.errors);
};
