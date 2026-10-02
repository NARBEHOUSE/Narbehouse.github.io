// Neutral menu entry/Back and startup recovery, using real switch releases.
// node tools/test/neutral-navigation.cjs [--game-root path]
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const at = process.argv.indexOf('--game-root');
const gameRoot = at < 0 ? path.resolve(__dirname, '../..') : path.resolve(process.argv[at + 1]);
const { start } = require(path.join(gameRoot, 'tools/serve.cjs'));

(async () => {
  const server = await start(0);
  let browser;
  let checks = 0;
  const check = (ok, message) => { assert.ok(ok, message); checks++; };
  const url = `http://127.0.0.1:${server.port}/apps/games/BENNYSPEGGLE/index.html`;
  const key = async (page, code) => {
    await page.keyboard.down(code); await page.waitForTimeout(120);
    await page.keyboard.up(code); await page.waitForTimeout(code === 'Space' ? 100 : 340);
  };
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__ready && P3.ui.screen === 'title');
    await page.evaluate(() => { NarbeVoiceManager.speak = () => {}; NarbeScanManager.setAutoScan(false); P3.game.store.set('music', false); P3.game.store.set('sfx', false); });
    async function neutral(screen) {
      check(await page.evaluate(s => P3.ui.screen === s && P3.ui.index === -1, screen), screen + ' starts neutral');
      check(await page.locator('#menu .focused').count() === 0, screen + ' has no initial highlight');
    }
    async function select(label) {
      const target = await page.evaluate(label => P3.ui.items.findIndex(item => label === 'Back' ? /Back/.test(item.label || '') : item.label === label), label);
      assert.ok(target >= 0, label + ' exists');
      for (let n = 0; n < 30 && await page.evaluate(() => P3.ui.index) !== target; n++) await key(page, 'Space');
      assert.equal(await page.evaluate(() => P3.ui.index), target);
      await key(page, 'Enter');
    }
    await neutral('title');
    await key(page, 'Enter');
    await neutral('title');
    await key(page, 'Space');
    check(await page.evaluate(() => P3.ui.index === 0 && P3.ui.items[0].label === 'Play'), 'first Space selects Play');
    await key(page, 'Enter');
    await neutral('modes');
    await key(page, 'Space');
    check(await page.evaluate(() => P3.ui.index === 0), 'first mode is selected by the first Space');
    await key(page, 'Space');
    check(await page.evaluate(() => P3.ui.index === 1), 'next Space selects one next mode');
    await key(page, 'Enter');
    await neutral('campaigns');

    for (const origin of ['title', 'pause']) {
      await page.evaluate(async origin => {
        const campaign = await P3.ui.debug.loadEntry(P3.ui.debug.index()[0]);
        P3.ui.debug.play(campaign, 0); P3.game.beginPlay();
        if (origin === 'pause') P3.ui.openPause();
        else { P3.game.quitToMenu(); P3.ui.setScreen('title'); }
      }, origin);
      await page.waitForTimeout(350);
      await select('Settings'); await neutral('settings');
      // Explicit selection data must not leak from saved options back into Back.
      await page.evaluate(() => P3.ui.setScreen('settings', { index: 3 }));
      await page.waitForTimeout(350);
      await select('Aim & Guide'); await neutral('setAim');
      await select('Back'); await neutral('settings');
      await key(page, 'Enter'); await neutral('settings');
      await select('Back'); await neutral(origin);
      check(await page.evaluate(o => o !== 'pause' || P3.game.paused, origin), 'Back preserves the paused game');
    }
    assert.deepEqual(errors, []); checks++;
    await page.close();

    for (const auto of [false, true]) {
      const context = await browser.newContext();
      const fallback = await context.newPage();
      await fallback.addInitScript(auto => {
        localStorage.setItem('narbe-scan-settings', JSON.stringify({ autoScan: auto, scanSpeedIndex: 0 }));
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/.test(type) ? null : original.call(this, type, ...args); };
      }, auto);
      let loads = 0;
      fallback.on('request', request => { if (request.url() === url && request.isNavigationRequest()) loads++; });
      await fallback.goto(url);
      await fallback.getByRole('button', { name: 'Reload game', exact: true }).waitFor();
      check(await fallback.locator('#loading .focused').count() === 0, 'recovery starts neutral with Auto Scan ' + auto);
      if (auto) {
        await fallback.waitForFunction(() => document.querySelector('#loading .focused')?.textContent === 'Reload game', null, { timeout: 2500, polling: 20 });
        check(true, 'first automatic recovery step selects Reload');
        await fallback.waitForFunction(() => document.querySelector('#loading .focused')?.textContent === 'Back to Hub', null, { timeout: 2500, polling: 20 });
        check(true, 'next automatic recovery step selects Back');
      } else {
        await key(fallback, 'Enter');
        check(loads === 1 && await fallback.locator('#loading .focused').count() === 0, 'neutral recovery Enter neither reloads nor selects');
        await key(fallback, 'Space');
        check(await fallback.locator('#loading .focused').textContent() === 'Reload game', 'first recovery Space selects Reload');
        await key(fallback, 'Space');
        check(await fallback.locator('#loading .focused').textContent() === 'Back to Hub', 'next recovery Space selects Back');
        await fallback.route(`http://127.0.0.1:${server.port}/index.html`, route => route.fulfill({ contentType: 'text/html', body: '<h1>Hub</h1>' }));
        await fallback.keyboard.down('Enter'); await fallback.waitForTimeout(120);
        check(fallback.url() === url, 'recovery waits for Enter release');
        await fallback.keyboard.up('Enter');
        await fallback.waitForURL(`http://127.0.0.1:${server.port}/index.html`);
        check(true, 'recovery Back works on Enter release');
      }
      await context.close();
    }
    console.log(`ALL ${checks} NEUTRAL NAVIGATION CHECKS PASSED`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
