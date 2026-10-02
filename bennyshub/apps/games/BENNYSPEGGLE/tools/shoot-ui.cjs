// Screenshot menu screens at a viewport. node tools/shoot-ui.cjs <w> <h> <outDir> [screen ...]
// Screens: title modes campaigns levels howto legend settings pause result-win result-lose editorWarn
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../../../node_modules/playwright'));
const { start } = require('./serve.cjs');
(async () => {
  const [w, h, outDir, ...names] = process.argv.slice(2);
  const screens = names.length ? names : ['title', 'modes', 'campaigns', 'levels', 'howto', 'legend', 'settings', 'pause', 'result-win', 'result-lose'];
  fs.mkdirSync(outDir, { recursive: true });
  const srv = await start(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, hasTouch: +w < 900 });
  const logs = [];
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) logs.push(m.text()); });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`http://127.0.0.1:${srv.port}/apps/games/BENNYSPEGGLE/index.html`);
  await page.waitForFunction(() => window.__ready && P3.ui.screen === 'title', null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  for (const name of screens) {
    await page.evaluate(async (name) => {
      const idx = P3.ui.debug.index();
      const first = idx.find(e => e.mode === 'vivid') || idx[0];
      if (name === 'title') { P3.ui.setScreen('title', { silent: true }); return; }
      if (name === 'modes') { P3.ui.setScreen('modes', { silent: true }); return; }
      if (name === 'campaigns') { P3.ui.setScreen('modes', { silent: true }); P3.ui.debug.activate(); P3.ui.debug.step(1); P3.ui.debug.activate(); return; }
      if (name === 'levels') { const c = await P3.ui.debug.loadEntry(first); P3.game.prog.record(c.id, 0, 3, 50000); P3.game.prog.record(c.id, 1, 2, 30000); P3.game.prog.record(c.id, 2, 1, 20000); window.__c = c; P3.ui.setScreen('modes', { silent: true }); P3.ui.debug.activate(); P3.ui.debug.step(1); P3.ui.debug.activate(); await new Promise(r => setTimeout(r, 300)); P3.ui.debug.activate(); P3.ui.debug.activate(); return; }
      if (name === 'howto') { P3.ui.setScreen('howto', { silent: true }); return; }
      if (name === 'legend') { P3.ui.setScreen('legend', { silent: true, group: 'power' }); return; }
      if (name === 'settings') { P3.ui.setScreen('settings', { silent: true }); return; }
      if (name === 'editorWarn') { P3.ui.setScreen('editorWarn', { silent: true }); return; }
      if (name === 'pause' || name.startsWith('result')) {
        const c = await P3.ui.debug.loadEntry(first);
        if (P3.game.state === 'menu' || !P3.game.match) { P3.ui.debug.play(c, 3); await new Promise(r => setTimeout(r, 600)); P3.game.beginPlay(); }
        if (name === 'pause') { P3.ui.openPause(); return; }
        const won = name === 'result-win';
        P3.game.emit('result', won ? { won: true, stars: 2, score: 48210, best: 48210, newBest: true, ballBonus: 9000, ballsLeft: 3, last: false, campaign: c, index: 3 }
          : { won: false, score: 12000, left: 4, leftSpeech: '4 orange pegs to go', attempts: 3, canSkip: true, campaign: c, index: 3 });
      }
    }, name);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(outDir, `${name}-${w}x${h}.png`) });
  }
  console.log('done', logs.join('\n'));
  await browser.close(); srv.close();
})();
