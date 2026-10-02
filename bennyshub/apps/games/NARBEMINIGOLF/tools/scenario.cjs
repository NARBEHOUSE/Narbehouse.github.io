#!/usr/bin/env node
/* Exercise the cinematic paths and screenshot them.
 *   node tools/scenario.cjs <name> [outDir]
 *   names: ace | water | multi | choose | pause
 */
'use strict';
const path = require('node:path'), os = require('node:os');
const cdp = require('./cdp.cjs');

const name = process.argv[2] || 'ace';
const out = process.argv[3] || path.join(os.tmpdir(), 'mg2-scn');

(async () => {
  const s = await cdp.open({ width: 1366, height: 768 });
  const shot = async (n) => { const f = await s.shot(path.join(out, name + '-' + n + '.png')); console.log('shot', path.basename(f), 'state', await s.evaluate('MG.game.state'), 'cam', await s.evaluate('MG.cam.mode')); };
  const state = () => s.evaluate('MG.game.state');
  const start = async (holeIdx, mode, players) => {
    await s.evaluate(`(function(){ const c = MG.ui.courses[0]; document.getElementById('overlay').classList.remove('on');
      MG.game.startRound({ course: c.course, file: c.file, mode: '${mode || 'casual'}', players: ${JSON.stringify(players || [{ name: 'Player 1', color: 'white' }])}, startHole: ${holeIdx}, strokes: [[]], test: true }); })()`);
    // The overlay flag lives in ui.js; hide it the same way a menu choice would.
    await s.evaluate('MG.ui.setScreen && (document.getElementById("overlay").classList.remove("on"))');
  };
  try {
    await s.go('/apps/games/NARBEMINIGOLF/index.html');
    await s.until('window.MG && MG.ui && MG.ui.screen === "title" && document.getElementById("loading").style.display === "none"', 40000);
    // Drive menus exactly as a player would, so ui.js's overlay state is right.
    const pickCourse = async () => {
      await s.press('Enter', 150); await s.wait(350);   // Play Golf
      if (name === 'multi') {
        await s.press('Space', 120); await s.wait(250); await s.press('Space', 120); await s.wait(250);   // Multiplayer
        await s.press('Enter', 150); await s.wait(350);  // → players
        await s.press('Enter', 150); await s.wait(350);  // 2 players
        await s.press('Enter', 150); await s.wait(350);  // P1 colour
        await s.press('Space', 120); await s.wait(250); await s.press('Enter', 150); await s.wait(350);  // P2 colour
      } else {
        await s.press('Enter', 150); await s.wait(350); // Casual
      }
      await s.press('Enter', 150);                       // first course
    };

    if (name === 'ace') {
      await s.evaluate('MG.settings.set("power","auto")');
      await pickCourse();
      await s.until('MG.game.state === "holeIntro"', 15000);
      await s.wait(600); await s.evaluate('MG.game.skip()');
      await s.until('MG.game.state === "aim"', 8000);
      await s.wait(600);
      await shot('01-aim-auto');
      await s.press('Enter', 150);
      await s.until('MG.game.state === "shot"', 5000);
      for (let i = 0; i < 40; i++) {
        await s.wait(250);
        const st = await state(), cam = await s.evaluate('MG.cam.mode');
        if (cam === 'cup' && !this.cup) { this.cup = 1; await s.wait(200); await shot('02-cupcam'); }
        if (st === 'holeOut') { await s.wait(900); await shot('03-celebrate'); break; }
      }
      await s.until('MG.game.state === "replay" || MG.game.state === "scorecard"', 20000);
      if (await state() === 'replay') { await s.wait(1500); await shot('04-replay'); }
      await s.until('MG.game.state === "scorecard"', 25000);
      await s.wait(900); await shot('05-scorecard');
      await s.evaluate('MG.game.skip()');
      await s.until('MG.game.state === "holeIntro"', 10000);
      await s.wait(1200); await shot('06-next-intro');
    } else if (name === 'water') {
      await pickCourse();
      await s.until('MG.game.state === "holeIntro"', 15000);
      await s.evaluate('MG.game.skip()');
      await s.until('MG.game.state === "aim"', 8000);
      // Jump straight to hole 6 (the pond) via restartHole on a forced index.
      await s.evaluate('MG.game.debug.jump = true');
      await s.evaluate(`(function(){ const g = MG.game; g.quitToMenu(); const c = MG.ui.courses[0];
        g.startRound({ course: c.course, file: c.file, mode: 'casual', players: [{name:'Player 1', color:'white'}], startHole: 5, strokes: [[2,2,2,2,2]] }); })()`);
      await s.until('MG.game.state === "holeIntro"', 10000);
      await s.wait(2000); await shot('01-intro');
      await s.evaluate('MG.game.skip()');
      await s.until('MG.game.state === "aim"', 8000);
      await s.wait(500);
      // Aim off the side of the bridge into the pond.
      await s.evaluate('(function(){ const b = MG.game.currentBall(); MG.game.aimAngle = Math.atan2(560 - b.y, 820 - b.x); })()');
      await s.wait(400); await shot('02-aim');
      await s.evaluate('MG.settings.set("power","hold")');
      await s.key('Enter', 'down'); await s.wait(1700); await s.key('Enter', 'up');
      await s.until('MG.game.state === "shot"', 5000);
      for (let i = 0; i < 40; i++) {
        await s.wait(200);
        if (await s.evaluate('MG.cam.mode') === 'watch') { await s.wait(500); await shot('03-splashcam'); break; }
      }
      await s.until('MG.game.state === "aim"', 20000);
      await s.wait(800); await shot('04-after-penalty');
      console.log('strokes', await s.evaluate('MG.game.players[0].hole'));
    } else if (name === 'multi') {
      await pickCourse();
      await s.until('MG.game.state === "holeIntro"', 15000);
      await s.evaluate('MG.game.skip()');
      await s.until('MG.game.state === "aim"', 8000);
      await s.wait(700); await shot('01-p1');
      await s.key('Enter', 'down'); await s.wait(900); await s.key('Enter', 'up');
      await s.until('MG.game.state === "aim" && MG.game.current === 1', 25000);
      await s.wait(700); await shot('02-p2');
      await s.key('Enter', 'down'); await s.wait(1000); await s.key('Enter', 'up');
      await s.until('MG.game.state === "aim" && MG.game.current === 0', 25000);
      await s.wait(500); await shot('03-p1-again');
    } else if (name === 'choose') {
      await s.evaluate('MG.settings.set("power","choose")');
      await pickCourse();
      await s.until('MG.game.state === "holeIntro"', 15000);
      await s.evaluate('MG.game.skip()');
      await s.until('MG.game.state === "aim"', 8000);
      await s.wait(500);
      await s.press('Enter', 150);
      await s.wait(500);
      console.log('ctx', await s.evaluate('MG.ui.context'), 'state', await state());
      await shot('01-list');
      await s.press('Space', 120); await s.wait(400);
      await s.press('Space', 120); await s.wait(500);
      await shot('02-list-firm');
      await s.press('Enter', 150);
      await s.until('MG.game.state === "shot"', 5000);
      await s.wait(800); await shot('03-shot');
    } else if (name === 'steady') {
      // The camera must not move at all while the player aims.
      const camAt = () => s.evaluate('(function(){ const c = MG.main.camera; const d = new THREE.Vector3(); c.getWorldDirection(d); return [c.position.x, c.position.y, c.position.z, d.x, d.y, d.z]; })()');
      const measure = async (label, during) => {
        const samples = [];
        const stop = during();
        for (let i = 0; i < 24; i++) { samples.push(await camAt()); await s.wait(150); }
        await stop();
        let maxPos = 0, maxDir = 0;
        for (const p of samples) {
          maxPos = Math.max(maxPos, Math.hypot(p[0] - samples[0][0], p[1] - samples[0][1], p[2] - samples[0][2]));
          maxDir = Math.max(maxDir, Math.hypot(p[3] - samples[0][3], p[4] - samples[0][4], p[5] - samples[0][5]));
        }
        const ok = maxPos < 0.01 && maxDir < 0.001;
        console.log((ok ? 'PASS ' : 'FAIL ') + label + '  camera moved ' + maxPos.toFixed(4) + ' units, turned ' + maxDir.toFixed(5));
      };
      const aimDeg = () => s.evaluate('MG.game.aimAngle * 180 / Math.PI');
      await pickCourse();
      await s.until('MG.game.state === "holeIntro"', 15000);
      await s.evaluate('MG.game.skip()');
      await s.until('MG.game.state === "aim"', 8000);
      await s.wait(2500);   // let the post-flyover settle finish
      let a0 = await aimDeg();
      await measure('two switches: holding Space to turn the aim', () => { s.key('Space', 'down'); return async () => { await s.key('Space', 'up'); }; });
      console.log('  aim turned by', ((await aimDeg()) - a0).toFixed(1), 'degrees');
      await s.wait(300);
      await s.evaluate('NarbeScanManager.setAutoScan(true); MG.game.setOneSwitch(true)');
      a0 = await aimDeg();
      await measure('one switch: aim sweeping by itself', () => async () => {});
      console.log('  aim turned by', ((await aimDeg()) - a0).toFixed(1), 'degrees');
      await s.evaluate('NarbeScanManager.setAutoScan(false); MG.game.setOneSwitch(false)');
      await measure('charging the putt', () => { s.key('Enter', 'down'); return async () => {}; });
      await shot('charging');
      await s.key('Enter', 'up');
    } else if (name === 'pause') {
      await pickCourse();
      await s.until('MG.game.state === "holeIntro"', 15000);
      await s.evaluate('MG.game.skip()');
      await s.until('MG.game.state === "aim"', 8000);
      await s.wait(500);
      // Hold Enter in Hold mode: charge fills, then (after more holding) pause.
      await s.key('Enter', 'down');
      await s.wait(6000); await shot('01-full-ring');
      await s.until('MG.ui.screen === "pause" && MG.game.paused', 6000);
      await s.key('Enter', 'up');
      await s.wait(500); await shot('02-paused');
      console.log('strokes after pause (should be 0):', await s.evaluate('MG.game.players[0].hole'));
      await s.press('Enter', 150);   // Continue
      await s.wait(600);
      console.log('after continue', await state(), 'paused', await s.evaluate('MG.game.paused'));
    }
    if (s.errors.filter(e => !/favicon/.test(e)).length) console.log('ERRORS:\n' + s.errors.filter(e => !/favicon/.test(e)).join('\n'));
  } catch (e) {
    console.log('FAILED:', e.message);
    await shot('99-fail').catch(() => {});
    if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
  } finally { await s.close(); }
})();
