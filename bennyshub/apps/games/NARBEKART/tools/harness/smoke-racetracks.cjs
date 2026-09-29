/** Harness self-test: boots Benny's Race Tracks, scans its menu and starts a race. */
module.exports = async function (t) {
  await t.load('apps/games/BENNYSRACETRACKS/index.html');
  await t.until('window.RT && RT.ui && RT.game && document.getElementById("loading").style.display === "none"');
  await t.wait(600);
  await t.shot('01-title');
  await t.press('Space', 150);          // step to the next item (menus act on release)
  await t.wait(300);
  const focused = await t.js('document.querySelector("#overlayMenu .focused") && document.querySelector("#overlayMenu .focused").textContent');
  t.assert(/How to Play/.test(focused || ''), 'Space release steps the menu', focused);
  await t.js('RT.ui.setScreen("title"); true');
  await t.press('Enter', 150);          // Play Game
  await t.wait(300);
  t.assert(await t.js('document.getElementById("overlayTitle").textContent') === 'Choose a Mode', 'Enter opens the mode screen');
  const spoken = await t.spoken();
  t.assert(spoken.length > 0, 'speech is recorded, not spoken', spoken.slice(-3));
  await t.js('RT.game.startRun({ mode: "competitive", vehicle: "car", level: 1 }); document.getElementById("overlay").classList.remove("on"); true');
  await t.wait(4500);
  await t.shot('02-racing');
  const f = await t.fps(1500);
  t.note('fps (offscreen, capped) ' + JSON.stringify(f));
};
