#!/usr/bin/env node
/* Boot the real game, walk the menus with real Space/Enter, take a putt,
 * and screenshot each stage.   node tools/smoke.cjs [outDir]
 */
'use strict';
const path = require('node:path'), os = require('node:os');
const cdp = require('./cdp.cjs');

(async () => {
  const out = process.argv[2] || path.join(os.tmpdir(), 'mg2-smoke');
  const s = await cdp.open({ width: 1366, height: 768 });
  const shot = (n) => s.shot(path.join(out, n + '.png')).then(f => console.log('shot', f));
  try {
    await s.go('/apps/games/NARBEMINIGOLF/index.html');
    await s.until('window.MG && MG.ui && MG.ui.screen === "title" && document.getElementById("loading").style.display === "none"', 40000);
    await s.wait(1500);
    await shot('01-title');
    console.log('title ok; context', await s.evaluate('MG.ui.context'));
    // Play Golf → Casual → first course
    await s.press('Enter', 150); await s.wait(400);
    console.log('screen', await s.evaluate('MG.ui.screen'));
    await s.press('Enter', 150); await s.wait(400);
    console.log('screen', await s.evaluate('MG.ui.screen'));
    await shot('02-course');
    await s.press('Enter', 150);
    await s.until('MG.game.state === "courseIntro" || MG.game.state === "holeIntro"', 10000);
    await s.wait(1500);
    await shot('03-intro');
    await s.until('MG.game.state === "holeIntro"', 15000);
    await s.wait(2500);
    await shot('04-flyover');
    await s.until('MG.game.state === "aim"', 15000);
    await s.wait(800);
    await shot('05-aim');
    // Turn the aim a little with Space, then charge with Enter.
    await s.key('Space', 'down'); await s.wait(700); await s.key('Space', 'up'); await s.wait(200);
    await s.key('Enter', 'down'); await s.wait(1100);
    await shot('06-charge');
    await s.key('Enter', 'up');
    await s.until('MG.game.state === "shot"', 5000);
    await s.wait(700);
    await shot('07-shot');
    await s.until('MG.game.state !== "shot" && MG.game.state !== "swing"', 30000);
    await s.wait(500);
    await shot('08-after');
    console.log('state after shot', await s.evaluate('MG.game.state'), 'strokes', await s.evaluate('MG.game.players[0].hole'));
    console.log('perf', JSON.stringify(await s.evaluate('MG.main.perf()')));
    if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
  } catch (e) {
    console.log('FAILED:', e.message);
    await shot('99-fail');
    if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
  } finally { await s.close(); }
})();
