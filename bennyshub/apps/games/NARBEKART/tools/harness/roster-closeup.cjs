/**
 * NK.roster close-ups: full-screen portraits the size the menu turntable and
 * podium show racers, to judge faces, outlines and hands on the wheel.
 */
module.exports = async function (t) {
  await t.load('apps/games/NARBEKART/tools/gallery-roster.html');
  await t.until('window.G && G.ready');
  const list = [['rusty', 'kart'], ['hattie', 'buggy'], ['sunny', 'bike'], ['bolt', 'hover']];
  for (const [c, v] of list) {
    await t.js(`G.pose(${JSON.stringify(c)}, ${JSON.stringify(v)}, {}, 'portrait')`);
    await t.shot('c-' + c + '-' + v);
  }
  await t.js(`G.pose('pixel', 'kart', {}, 'front')`);
  await t.shot('c-pixel-kart-front');
};
