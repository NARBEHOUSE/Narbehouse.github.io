// Capture the actual game for its Benny's Hub and website cards.
const path = require('node:path');
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
(async () => {
  const server = await start(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.port}/apps/games/BENNYSPEGGLE/index.html`);
    await page.waitForFunction(() => window.__ready);
    await page.evaluate(async () => {
      P3.game.store.set('quality', 'high'); P3.game.store.set('music', false); P3.game.store.set('sfx', false);
      const campaign = await P3.ui.debug.loadEntry(P3.ui.debug.index().find(e => e.id === 'hyper-neon-highway'));
      P3.ui.debug.play(campaign, 0); P3.game.beginPlay();
    });
    await page.waitForTimeout(900);
    await page.evaluate(() => { P3.game.match.aimTo(-8); P3.game.fire(); });
    await page.waitForTimeout(1000);
    const output = path.resolve(__dirname, '../../../../images/games/bennyspeggle.png');
    await page.screenshot({ path: output });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Captured live P3GL gameplay: ' + output);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
