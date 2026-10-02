// Real browser navigation, including the nested Back loop reported in Aim & Guide.
// node tools/test/navigation.cjs [--game-root path] [--repro-only] [--hub]
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const rootArg = process.argv.indexOf('--game-root');
const gameRoot = rootArg < 0 ? path.resolve(__dirname, '../..') : path.resolve(process.argv[rootArg + 1]);
const { start } = require(path.join(gameRoot, 'tools/serve.cjs'));

(async () => {
  const server = await start(0);
  let browser;
  let checks = 0;
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    const browserPage = await context.newPage();
    let page = browserPage;
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (process.argv.includes('--hub')) {
      await browserPage.goto(`http://127.0.0.1:${server.port}/index.html`);
      await browserPage.waitForFunction(() => typeof appsData !== 'undefined' && appsData.games.length > 0);
      const cancel = browserPage.locator('#modal-cancel');
      if (await cancel.count() && await cancel.isVisible()) await cancel.click();
      await browserPage.locator('.nav[data-target="games"]').click();
      const gameCard = browserPage.locator('.app-btn[data-path="apps/games/BENNYSPEGGLE/index.html"]');
      for (let i = 0; i < 20 && !await gameCard.count(); i++) {
        const next = browserPage.locator('#games-next');
        assert.ok(await next.isEnabled(), 'P3GL is listed in the hub');
        await next.click();
      }
      await gameCard.click();
      page = await (await browserPage.locator('#app-iframe').elementHandle()).contentFrame();
      assert.ok(page, 'Hub opened the game iframe');
    } else {
      await page.goto(`http://127.0.0.1:${server.port}/apps/games/BENNYSPEGGLE/index.html`);
    }
    await page.waitForFunction(() => window.__ready && P3.ui.screen === 'title');
    await page.evaluate(() => {
      NarbeVoiceManager.speak = () => {};
      NarbeScanManager.setAutoScan(false);
      P3.game.store.set('music', false);
      P3.game.store.set('sfx', false);
    });
    const screen = () => page.evaluate(() => P3.ui.screen);
    const check = async expected => {
      assert.equal(await screen(), expected, 'Expected navigation to ' + expected);
      checks++;
    };
    const key = async code => {
      await browserPage.keyboard.down(code);
      await page.waitForTimeout(120); // Also respects desktop switch debounce.
      await browserPage.keyboard.up(code);
      await page.waitForTimeout(code === 'Enter' ? 340 : 80);
    };
    const select = async (label, input = 'mouse') => {
      await page.waitForTimeout(340); // Menu transition / accidental double-press guard.
      const target = await page.evaluate(label => {
        let button = -1;
        const index = P3.ui.items.findIndex(it => it.label === label);
        for (let i = 0; i <= index; i++) if (!P3.ui.items[i].rowBreak) button++;
        return { index, button };
      }, label);
      assert.ok(target.index >= 0, label + ' exists on ' + await screen());
      if (input === 'switch') {
        // All switch cases below are list menus; reach items using real Space releases.
        for (let i = 0; i < 30 && await page.evaluate(() => P3.ui.index) !== target.index; i++) await key('Space');
        assert.equal(await page.evaluate(() => P3.ui.index), target.index, 'Switch reached ' + label);
        await key('Enter');
      } else if (input === 'auto') {
        await page.waitForFunction(index => P3.ui.index === index, target.index, { timeout: 15000, polling: 25 });
        await key('Enter');
      } else {
        const button = page.locator('#menu .mi').nth(target.button);
        if (input === 'touch') await button.tap(); else await button.click();
        await page.waitForTimeout(340);
      }
    };
    const back = input => select('← Back', input);
    const pauseGame = async () => {
      await page.evaluate(async () => {
        const camp = await P3.ui.debug.loadEntry(P3.ui.debug.index()[0]);
        P3.ui.debug.play(camp, 0);
        P3.game.beginPlay();
      });
      await page.locator('#pauseBtn').click();
      await check('pause');
    };
    const snapshot = () => page.evaluate(() => ({
      level: P3.game.levelIndex, balls: P3.game.match.ballsLeft,
      score: P3.game.match.score, phase: P3.game.match.phase
    }));

    // Reproduces the original bug before any other route can alter history.
    await pauseGame();
    await select('Settings'); await select('Aim & Guide');
    await back(); await check('settings');
    await back(); await check('pause');
    await select('Continue');
    assert.equal(await page.evaluate(() => P3.ui.context), 'play');
    assert.equal(await page.evaluate(() => P3.game.paused), false);
    console.log('PASS reported Pause > Settings > Aim & Guide > Back > Back > Continue route' + (process.argv.includes('--hub') ? ' inside the real hub iframe' : ''));
    if (process.argv.includes('--repro-only')) return;
    await page.locator('#pauseBtn').click();
    await select('Main Menu'); await check('title');

    for (const input of ['mouse', 'touch', 'switch', 'auto']) {
      await browserPage.mouse.move(0, 0);
      if (input === 'touch') await browserPage.setViewportSize({ width: 390, height: 844 });
      if (input === 'auto') await page.evaluate(() => { NarbeScanManager.setScanSpeedIndex(0); NarbeScanManager.setAutoScan(true); });
      for (const origin of ['title', 'pause']) {
        if (origin === 'pause') await pauseGame();
        const before = origin === 'pause' ? await snapshot() : null;
        await select('Settings', input); await check('settings');
        // Alternate both submenus twice without rebuilding the menu history.
        for (let round = 0; round < 2; round++) {
          for (const [label, expected, setting, storeKey] of [
            ['Aim & Guide', 'setAim', 'Aim Guide', 'guide'],
            ['Display & Sound', 'setDisplay', 'Board Backdrop', 'backdrop']
          ]) {
            await select(label, input); await check(expected);
            const oldValue = await page.evaluate(k => P3.game.store.get(k), storeKey);
            await select(setting, input);
            assert.notEqual(await page.evaluate(k => P3.game.store.get(k), storeKey), oldValue);
            await back(input); await check('settings');
            if (input === 'switch') assert.equal(await page.evaluate(() => P3.ui.index), -1, 'Back returns to a neutral menu');
          }
        }
        await back(input); await check(origin);
        if (origin === 'pause') {
          assert.deepEqual(await snapshot(), before, 'Nested settings preserve the paused level');
          await select('Continue', input);
          assert.equal(await page.evaluate(() => P3.ui.context), 'play');
          assert.equal(await page.evaluate(() => P3.game.paused), false);
          await page.locator('#pauseBtn').click();
          await select('Main Menu', input); await check('title');
        }
      }
      if (input === 'auto') await page.evaluate(() => NarbeScanManager.setAutoScan(false));
      if (input === 'touch') await browserPage.setViewportSize({ width: 1440, height: 900 });
      console.log('PASS ' + input + ': both settings submenus, repeated Back, focus and resume from title/pause');
    }

    // A mouse Continue must stop scanning the now-hidden pause menu, while
    // resuming the optional Play/Pause choice must keep its own scan running.
    for (const preShot of [false, true]) {
      await page.evaluate(pre => { P3.game.store.set('preShot', pre); NarbeScanManager.setAutoScan(true); }, preShot);
      await pauseGame();
      await select('Continue');
      assert.equal(await page.evaluate(() => P3.ui.context), preShot ? 'choice' : 'play');
      const before = await page.evaluate(() => ({ index: P3.ui.index, choice: P3.ui.choiceIndex }));
      await page.waitForTimeout(await page.evaluate(() => P3.util.scanInterval()) + 100);
      assert.equal(await page.evaluate(() => P3.ui.index), before.index, 'Hidden pause menu does not scan');
      if (preShot) assert.notEqual(await page.evaluate(() => P3.ui.choiceIndex), before.choice, 'Play/Pause choice still scans');
      await page.locator('#pauseBtn').click();
      await select('Main Menu');
      await page.evaluate(() => { NarbeScanManager.setAutoScan(false); P3.game.store.set('preShot', false); });
    }
    console.log('PASS mouse Continue stops hidden menu scanning and preserves Play/Pause choice scanning');

    for (const origin of ['title', 'pause']) {
      if (origin === 'pause') await pauseGame();
      await select('How to Play', 'switch'); await check('howto');
      for (const group of ['Powers', 'Hazards', 'Pegs, bricks and more']) {
        await select(group, 'switch'); await check('legend');
        assert.equal(await page.locator('#cardTitle').textContent(), group);
        await back('switch'); await check('howto');
      }
      await back('switch'); await check(origin);
      if (origin === 'pause') await select('Main Menu');
    }
    console.log('PASS How to Play and all three legends return to title/pause with switches');

    await select('Campaign Editor'); await check('editorWarn');
    await select('Cancel'); await check('title');
    await select('Play'); await check('modes');
    await page.locator('#menu .modeCard').first().click();
    await check('campaigns'); await page.waitForTimeout(340);
    await page.locator('#menu .campCard').first().click();
    await page.waitForFunction(() => P3.ui.screen === 'levels');
    await back(); await check('campaigns');
    await back(); await check('modes');
    await select('My Campaigns'); await check('mine');
    await select('Open a campaign file…'); await check('loadWarn');
    await select('Cancel'); await check('mine');
    await select('Open a campaign file…');
    const fileChooser = browserPage.waitForEvent('filechooser');
    await select('Choose a File');
    await (await fileChooser).setFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{bad json') });
    await page.waitForFunction(() => P3.ui.screen === 'message');
    await select('OK'); await check('loadWarn');
    await select('Cancel'); await check('mine');
    await back(); await check('modes');
    await back(); await check('title');
    console.log('PASS campaign/level grids, editor cancel, file cancel/error and return to title');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log(`PASS ${checks} navigation destinations; tested ${gameRoot}`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
