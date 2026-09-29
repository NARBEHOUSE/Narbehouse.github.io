/**
 * NK.roster with the real art kit items loaded (js/art-items.js): the racer's
 * glider mount must carry NK.art.glider(color) cleanly — mast behind the
 * driver, sail clear of the tallest heads — and the racer must stay within
 * its draw-call budget while gliding.
 */
module.exports = async function (t) {
  await t.load('apps/games/NARBEKART/tools/gallery-roster.html', { items: 1 });
  await t.until('window.G && G.ready');
  t.assert(await t.js('G.realGlider'), 'art-items.js provides NK.art.glider, and the roster uses it');

  const cases = [['pip', 'kart'], ['bruno', 'buggy'], ['mochi', 'bike'], ['bolt', 'hover'], ['rex', 'kart']];
  for (const [c, v] of cases) {
    const m = await t.js(`G.measure(${JSON.stringify(c)}, ${JSON.stringify(v)})`);
    t.assert(m.gliderCalls <= m.calls + 2, c + '/' + v + ': the glider adds at most 2 draw calls', m);
    t.note(c + '/' + v + ': calls ' + m.calls + ', gliding ' + m.gliderCalls + ', mast stretch ' + m.mastScale);
  }
  await t.js(`G.pose('pip', 'kart', { glider: true }, 'back3q')`);
  await t.shot('g1-pip-kart-glider');
  await t.js(`G.pose('pip', 'kart', { glider: true }, 'chaseFar')`);
  await t.shot('g2-pip-kart-glider-chase');
  await t.js(`G.pose('bruno', 'buggy', { glider: true }, 'back3q')`);
  await t.shot('g3-bruno-buggy-glider');
  await t.js(`G.pose('mochi', 'bike', { glider: true }, 'side')`);
  await t.shot('g4-mochi-bike-glider-side');
  await t.js(`G.pose('bolt', 'hover', { glider: true }, 'front')`);
  await t.shot('g5-bolt-hover-glider-front');
};
