// Screenshot any page in this game folder.
// node tools/shoot-page.cjs <relative-url> <out.png> [width] [height] [waitMs]
const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../../../../../node_modules/playwright'));
const { start } = require('./serve.cjs');
(async () => {
  const [rel, out, w, h, wait] = process.argv.slice(2);
  const srv = await start(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: +w || 1280, height: +h || 800 } });
  const logs = [];
  page.on('console', m => { if (m.type() === 'error') logs.push('console: ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${srv.port}/apps/games/BENNYSPEGGLE/${rel}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => logs.push('timeout waiting for __ready'));
  await page.waitForTimeout(+wait || 300);
  await page.screenshot({ path: out });
  await browser.close(); srv.close();
  console.log(out, logs.join('\n'));
})();
