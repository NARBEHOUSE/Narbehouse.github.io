// A delayed campaign response must not undo Back or a more recent selection.
// These tests invoke the real menu actions while controlling response order.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { start } = require('../serve.cjs');

async function deferredCampaign(page, id) {
  let release, markSeen;
  const released = new Promise(resolve => { release = resolve; });
  const seen = new Promise(resolve => { markSeen = resolve; });
  await page.route('**/campaigns/' + id + '.json', async route => {
    markSeen();
    const fail = await released;
    if (fail) await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    else await route.continue();
  });
  return { seen, release };
}

(async () => {
  const srv = await start(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
  const url = `http://127.0.0.1:${srv.port}/apps/games/BENNYSPEGGLE/index.html`;
  async function freshPage() {
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.__ready && P3.ui.screen === 'title');
    return page;
  }
  async function hyperMenu(page) {
    await page.evaluate(() => {
      P3.ui.items.find(i => i.label === 'Play').action();
      P3.ui.items[2].action();
    });
  }
  async function back(page) {
    await page.evaluate(() => P3.ui.items.find(i => /Back/.test(i.label || '')).action());
  }
  try {
    for (const fail of [false, true]) {
      const page = await freshPage();
      const pending = await deferredCampaign(page, 'hyper-neon-highway');
      await hyperMenu(page);
      await page.evaluate(() => { window.__pendingNavigation = P3.ui.items[0].action(); });
      await pending.seen;
      await back(page);
      assert.equal(await page.evaluate(() => P3.ui.screen), 'modes');
      pending.release(fail);
      await page.evaluate(() => window.__pendingNavigation);
      assert.equal(await page.evaluate(() => P3.ui.screen), 'modes');
      console.log('PASS Back survives a delayed campaign ' + (fail ? 'failure' : 'success'));
      await page.close();
    }

    {
      const page = await freshPage();
      const first = await deferredCampaign(page, 'hyper-neon-highway');
      const second = await deferredCampaign(page, 'hyper-starlight-warp');
      await hyperMenu(page);
      await page.evaluate(() => { window.__firstNavigation = P3.ui.items[0].action(); });
      await first.seen;
      await page.evaluate(() => { window.__secondNavigation = P3.ui.items[1].action(); });
      await second.seen;
      second.release(false);
      await page.evaluate(() => window.__secondNavigation);
      assert.equal(await page.locator('#cardTitle').textContent(), 'Starlight Warp');
      first.release(false);
      await page.evaluate(() => window.__firstNavigation);
      assert.equal(await page.evaluate(() => P3.ui.screen), 'levels');
      assert.equal(await page.locator('#cardTitle').textContent(), 'Starlight Warp');
      await back(page);
      assert.equal(await page.evaluate(() => P3.ui.screen), 'campaigns');
      console.log('PASS the latest campaign choice wins when responses finish out of order');
      await page.close();
    }

    for (const fail of [false, true]) {
      const page = await freshPage();
      const pending = await deferredCampaign(page, 'hyper-neon-highway');
      await page.evaluate(() => {
        P3.util.save('resume', { camp: 'hyper-neon-highway', source: 'builtin', level: 0, snap: { v: 3 } });
        P3.ui.setScreen('title');
        window.__pendingResume = P3.ui.items.find(i => i.label === 'Continue').action();
      });
      await pending.seen;
      await page.evaluate(() => P3.ui.items.find(i => i.label === 'Settings').action());
      pending.release(fail);
      await page.evaluate(() => window.__pendingResume);
      const after = await page.evaluate(() => ({ screen: P3.ui.screen, state: P3.game.state, save: P3.util.load('resume') }));
      assert.equal(after.screen, 'settings');
      assert.equal(after.state, 'menu');
      assert.equal(after.save.camp, 'hyper-neon-highway');
      console.log('PASS leaving Continue cancels its delayed ' + (fail ? 'failure without removing the save' : 'success'));
      await page.close();
    }
    console.log('ALL 5 LOADING NAVIGATION CHECKS PASSED');
  } finally {
    await browser.close();
    srv.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
