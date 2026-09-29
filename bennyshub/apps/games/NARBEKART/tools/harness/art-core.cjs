/** Checks the art kit core renders and merges without errors. */
module.exports = async function (t) {
  await t.load('apps/games/NARBEKART/tools/art_core_test.html');
  await t.until('window.__artCore');
  await t.wait(500);
  const s = await t.js('({ children: __artCore.mergedChildren, kept: __artCore.keptWheels, calls: __artCore.calls() })');
  t.assert(s.kept === 4, 'wheels survive the merge as separate children', s);
  t.assert(s.children <= 4 + 5, 'body parts welded to one mesh per material', s);
  await t.shot('art-core');
};
