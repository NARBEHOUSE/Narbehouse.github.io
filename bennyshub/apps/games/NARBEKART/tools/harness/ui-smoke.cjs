/** Quick smoke: the UI test page boots, the title card renders, a race HUD shows. */
module.exports = async function (t) {
  await t.load('apps/games/NARBEKART/tools/ui_mock.html');
  await t.until('window.NK && NK.ui && NK.ui.ready');
  await t.wait(500);
  await t.shot('01-title');
  const dbg = await t.js('NK.ui.__dbg()');
  t.assert(dbg.screen === 'title', 'title screen is up', dbg);
  await t.js('NK.game.setPlayers(1); NK.game.setType("single"); NK.ui.setScreen("track"); true');
  await t.wait(300);
  await t.shot('02-track');
  await t.press('Enter', 150);
  await t.wait(3500);
  await t.shot('03-race');
  const spoken = await t.spoken();
  t.note('spoken: ' + JSON.stringify(spoken.map((s) => s.text).slice(-6)));
};
