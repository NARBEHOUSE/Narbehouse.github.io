/**
 * Close-ups of single Sunshine props in the gallery, for judging detail.
 *   PS_DETAIL=meadow:windmill,meadow:barn   (theme:name list; default: a few landmarks)
 *   PS_DIR=0.35,0.35,-1                     (camera direction from the prop)
 */
module.exports = async function (t) {
  const list = (process.env.PS_DETAIL || 'meadow:windmill,meadow:barn,meadow:hot_air_balloon,meadow:water_tower').split(',');
  const dir = process.env.PS_DIR ? process.env.PS_DIR.split(',').map(Number) : null;
  await t.load('apps/games/NARBEKART/tools/gallery-props-sunshine.html');
  await t.until('window.gallery && gallery.ready', 30000);
  await t.wait(300);
  for (const entry of list) {
    const [theme, name] = entry.split(':');
    const ok = await t.js('gallery.detail(' + JSON.stringify(theme) + ',' + JSON.stringify(name) + ',' + JSON.stringify(dir) + ')');
    t.assert(ok, 'found ' + entry);
    await t.wait(250);
    await t.shot('detail-' + theme + '-' + name);
  }
};
