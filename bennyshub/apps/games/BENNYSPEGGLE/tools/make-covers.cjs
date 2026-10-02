// Campaign card screenshots, taken from the real game mid-shot over each world.
// node tools/make-covers.cjs [campaignId ...] [--level N]   → covers/<id>.jpg (960 × 600)
// Also writes the hub thumbnail (images/games/bennyspeggle.png) with --thumb <campaignId>.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../../../node_modules/playwright'));
const { start } = require('./serve.cjs');

const ROOT = path.resolve(__dirname, '..');
(async () => {
  const args = process.argv.slice(2);
  const take = (f) => { const i = args.indexOf(f); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const levelArg = take('--level');
  const thumb = take('--thumb');
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'campaigns', 'index.json'), 'utf8')).campaigns;
  const ids = args.length ? args : index.map(e => e.id);
  fs.mkdirSync(path.join(ROOT, 'covers'), { recursive: true });
  const srv = await start(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });

  async function shoot(id, file, w, h, type) {
    const camp = JSON.parse(fs.readFileSync(path.join(ROOT, 'campaigns', id + '.json'), 'utf8'));
    // A level from the first third that looks busy: prefer one with powers and several colours.
    let li = levelArg !== null ? +levelArg : 0;
    if (levelArg === null) {
      let best = -1;
      camp.levels.slice(0, 8).forEach((lv, i) => {
        const kinds = new Set(lv.items.map(it => it.t + (it.c || ''))).size;
        const score = kinds * 3 + Math.min(lv.items.length, 90) / 10 + (lv.items.some(it => it.m) ? 4 : 0);
        if (score > best) { best = score; li = i; }
      });
    }
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const logs = [];
    page.on('pageerror', e => logs.push(e.message));
    await page.addInitScript(() => { localStorage.clear(); });
    await page.goto(`http://127.0.0.1:${srv.port}/apps/games/BENNYSPEGGLE/index.html?cover=${id}&level=${li}`);
    await page.waitForFunction(() => window.__ready && P3.game.match && P3.game.state === 'play', null, { timeout: 30000 });
    // Pick a shot that lights plenty, then catch it in flight.
    await page.evaluate(() => {
      const m = P3.game.match, snap = m.snapshot();
      let best = 0, bestV = -1;
      for (let k = 0; k < 24; k++) {
        const a = -m.aimMax * 0.85 + (k / 23) * m.aimMax * 1.7;
        const tr = new P3.Match({ level: m.level, mode: m.modeId, restore: snap });
        tr.aimTo(a); tr.fire();
        let n = 0; while (tr.phase === 'shot' && n++ < 500) { tr.update(1 / 60); tr.events.length = 0; }
        const lit = tr.bodies.filter(b => b.lit).length;
        if (lit > bestV) { bestV = lit; best = a; }
      }
      m.aimTo(best); P3.main.board.snapAim(best);
      P3.game.fire();
    });
    await page.waitForFunction(() => { const m = P3.game.match; return m.bodies.filter(b => b.lit).length >= 6 || m.phase !== 'shot'; }, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(120);
    await page.screenshot({ path: file, type, quality: type === 'jpeg' ? 82 : undefined });
    await page.close();
    return { id, level: li + 1, logs };
  }

  for (const id of ids) {
    const r = await shoot(id, path.join(ROOT, 'covers', id + '.jpg'), 960, 600, 'jpeg');
    console.log('cover', r.id, 'level', r.level, r.logs.join(' | '));
  }
  if (thumb) {
    const r = await shoot(thumb, path.resolve(ROOT, '../../../images/games/bennyspeggle.png'), 800, 500, 'png');
    console.log('hub thumbnail from', r.id, 'level', r.level);
  }
  await browser.close(); srv.close();
})();
