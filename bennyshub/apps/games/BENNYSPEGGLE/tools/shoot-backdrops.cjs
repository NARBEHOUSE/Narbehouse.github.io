// Screenshots every backdrop (or the ones named) at desktop and phone sizes.
// node tools/shoot-backdrops.cjs [themeId ...] [--out dir] [--warm 6] [--low]
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../../../node_modules/playwright'));
const { start } = require('./serve.cjs');

(async () => {
  const args = process.argv.slice(2);
  const take = (flag, dflt) => { const i = args.indexOf(flag); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
  const out = take('--out', path.resolve(__dirname, '../../../../../tmp/p3gl-backdrops'));
  const warm = +take('--warm', 6);
  const li = args.indexOf('--low'); const low = li >= 0; if (low) args.splice(li, 1);
  fs.mkdirSync(out, { recursive: true });
  const ids = args.length ? args : ['lantern-garden', 'moonlit-lake', 'snowglobe-hollow', 'sugar-rush', 'carnival-skies', 'coral-groove', 'neon-highway', 'starlight-warp', 'quasar-core'];
  const srv = await start(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const sizes = [{ name: 'desktop', w: 1600, h: 900 }, { name: 'phone', w: 390, h: 844 }];
  const report = [];
  for (const id of ids) {
    for (const s of sizes) {
      const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
      const logs = [];
      page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
      page.on('pageerror', e => logs.push('pageerror: ' + e.message));
      await page.goto(`http://127.0.0.1:${srv.port}/apps/games/BENNYSPEGGLE/tools/backdrop-gallery.html?theme=${id}&shot=1&warm=${warm}&energy=0.35${low ? '&quality=low' : ''}`);
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => logs.push('timeout'));
      await page.waitForTimeout(400);
      const file = path.join(out, `${id}-${s.name}.png`);
      await page.screenshot({ path: file });
      const info = await page.evaluate(() => ({ info: window.__info && window.__info(), errors: window.__errors })).catch(() => ({}));
      report.push(Object.assign({ id, size: s.name, file, logs }, info));
      await page.close();
    }
  }
  await browser.close(); srv.close();
  for (const r of report) console.log(r.id, r.size, JSON.stringify(r.info || {}), (r.errors || []).concat(r.logs).join(' | '));
  console.log('screenshots in', out);
})();
