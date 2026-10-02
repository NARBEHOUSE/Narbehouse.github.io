// High-contrast individual selection in every mood, with real switch input.
// node tools/test/selection.cjs [--game-root path] [--out screenshot-directory]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

function option(name, fallback) {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : path.resolve(process.argv[i + 1]);
}
const gameRoot = option('--game-root', path.resolve(__dirname, '../..'));
const output = option('--out', path.resolve(__dirname, '../../../../../../tmp/p3gl-selection'));
const { start } = require(path.join(gameRoot, 'tools/serve.cjs'));
const YELLOW = 'rgb(255, 225, 79)';
const INK = 'rgb(23, 17, 38)';
const childText = '.lab,.sub,.val,.mcName,.mcTag,.mcProg,.ccName,.ccBlurb,.ccProg,.lvNum,.lvStars';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const server = await start(0);
  let browser;
  let checks = 0;
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
    for (const form of ['desktop', 'phone']) {
      for (const mode of ['cozy', 'vivid', 'hyper']) {
        const context = await browser.newContext({
          viewport: form === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
          hasTouch: form === 'phone',
          reducedMotion: 'reduce'
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const prefix = form + '-' + mode;
        const check = (condition, message) => {
          assert.ok(condition, prefix + ': ' + message);
          checks++;
        };
        const key = async code => {
          await page.keyboard.down(code);
          await page.waitForTimeout(120); // Also accepts desktop minimum-press sensitivity.
          await page.keyboard.up(code);
          await page.waitForTimeout(code === 'Enter' ? 340 : 170);
        };
        const first = async () => {
          check(await page.evaluate(() => P3.ui.index === -1), 'menu opens without a selection');
          check(await page.locator('#menu .focused').count() === 0, 'neutral menu has no highlighted button');
          await key('Space');
          check(await page.evaluate(() => P3.ui.index === 0), 'first Space highlights the first menu item');
        };
        const capture = name => page.screenshot({ path: path.join(output, prefix + '-' + name + '.png') });
        const selection = async selector => {
          await page.waitForTimeout(160); // Finish background transitions before reading pixels/styles.
          check(await page.locator('#menu .rowFocus').count() === 0, 'menus never highlight a row');
          const styles = await page.locator(selector).evaluateAll((nodes, childSelector) => nodes.map(node => {
            const s = getComputedStyle(node);
            return {
              text: node.textContent.trim().slice(0, 80), background: s.backgroundColor,
              image: s.backgroundImage, color: s.color, transform: s.transform,
              outline: s.outlineStyle, width: parseFloat(s.outlineWidth), opacity: s.opacity,
              children: Array.from(node.querySelectorAll(childSelector), child => ({
                text: child.textContent.trim().slice(0, 40), color: getComputedStyle(child).color
              }))
            };
          }), childText);
          assert.equal(styles.length, 1, prefix + ': exactly one selection for ' + selector);
          checks++;
          for (const s of styles) {
            assert.equal(s.background, YELLOW, prefix + ': opaque yellow fill: ' + s.text);
            assert.equal(s.image, 'none', prefix + ': selection has no gradient: ' + s.text);
            assert.equal(s.color, INK, prefix + ': selection ink: ' + s.text);
            assert.equal(s.transform, 'none', prefix + ': selection does not grow: ' + s.text);
            assert.equal(s.opacity, '1', prefix + ': enabled selection stays opaque: ' + s.text);
            assert.equal(s.outline, 'solid', prefix + ': individual selection outline: ' + s.text);
            check(s.width >= 4, 'selection ring is thick: ' + s.text);
            for (const child of s.children) assert.equal(child.color, INK, prefix + ': readable selected child: ' + child.text);
            checks += 6 + s.children.length;
          }
        };
        try {
          await page.goto(`http://127.0.0.1:${server.port}/apps/games/BENNYSPEGGLE/index.html`);
          await page.waitForFunction(() => window.__ready && P3.ui.screen === 'title');
          await page.evaluate(mode => {
            NarbeVoiceManager.speak = () => {};
            NarbeScanManager.setAutoScan(false);
            P3.game.store.set('music', false);
            P3.game.store.set('sfx', false);
            P3.game.store.set('motion', 'reduced');
            P3.util.save('lastMode', mode);
            P3.ui.setScreen('title');
            document.body.dataset.mode = mode;
          }, mode);
          await page.waitForTimeout(350);
          await first();
          await selection('#menu .focused');
          await key('Space');
          check(await page.evaluate(() => P3.ui.items[P3.ui.index].label === 'How to Play'), 'Space changes title selection');
          await selection('#menu .focused');
          await capture('title');
          await key('Space');
          await key('Enter');
          check(await page.evaluate(() => P3.ui.screen === 'settings'), 'Enter opens highlighted Settings');
          await first();
          await selection('#menu .focused');
          await key('Space');
          await key('Space');
          await selection('#menu .focused'); // Setting value text has its own color rule.
          await page.evaluate(() => P3.ui.setScreen('setAim', { index: 1 }));
          await selection('#menu .focused');
          await capture('aim');
          await page.evaluate(() => P3.ui.setScreen('setDisplay'));
          check(await page.evaluate(() => P3.ui.items.every(item => !/full\s*screen/i.test(item.label || ''))), 'Full Screen is absent');

          if (form === 'desktop' && mode === 'cozy') {
            await page.evaluate(() => {
              P3.ui.setScreen('modes');
              NarbeScanManager.setScanSpeedIndex(0);
              NarbeScanManager.setAutoScan(true);
            });
            check(await page.evaluate(() => P3.ui.index === -1), 'Auto Scan menu also starts neutral');
            await page.waitForFunction(() => P3.ui.index === 0, null, { polling: 20, timeout: 2000 });
            check(await page.evaluate(() => P3.ui.index === 0), 'first Auto Scan tick selects Cozy');
            await page.waitForFunction(() => P3.ui.index === 1, null, { polling: 20, timeout: 2000 });
            await selection('#menu .focused');
            check(await page.evaluate(() => P3.ui.index === 1), 'Auto Scan advances directly from Cozy to Vivid');
            await key('Enter');
            check(await page.evaluate(() => P3.ui.screen === 'campaigns' && /Vivid/.test(document.getElementById('cardTitle').textContent)), 'one-switch Enter directly opens the selected mood');
            await page.evaluate(() => { NarbeScanManager.setAutoScan(false); NarbeScanManager.setScanSpeedIndex(1); });
          }

          await page.evaluate(async mode => {
            const entry = P3.ui.debug.index().find(e => e.mode === mode && !e.extra);
            const camp = await P3.ui.debug.loadEntry(entry);
            P3.levels.saveToLibrary(Object.assign({}, camp, { id: 'selection-custom-a', title: 'Custom A' }));
            P3.levels.saveToLibrary(Object.assign({}, camp, { id: 'selection-custom-b', title: 'Custom B' }));
            P3.ui.setScreen('modes');
          }, mode);
          await first();
          await selection('#menu .focused');
          await capture('modes');
          await key('Space');
          check(await page.evaluate(() => P3.ui.index === 1), 'one Space selects Vivid');
          await selection('#menu .focused');
          await key('Space');
          check(await page.evaluate(() => P3.ui.index === 2), 'next Space selects Hyper');
          await key('Space');
          check(await page.evaluate(() => P3.ui.items[P3.ui.index].label === 'My Campaigns'), 'Space skips visual separators to My Campaigns');
          await key('Enter');
          check(await page.evaluate(() => P3.ui.screen === 'mine'), 'one Enter directly opens My Campaigns');
          await first();
          check(await page.evaluate(() => P3.ui.items[P3.ui.index].label === 'Custom B'), 'first custom campaign is selected individually');
          await selection('#menu .focused');
          await key('Space');
          check(await page.evaluate(() => P3.ui.items[P3.ui.index].label === 'Custom A'), 'Space selects the next custom campaign');
          await selection('#menu .focused');
          await key('Enter');
          check(await page.evaluate(() => P3.ui.screen === 'levels' && document.getElementById('cardTitle').textContent === 'Custom A'), 'one Enter directly opens the custom campaign');

          // Unlock six real levels, spanning a visual row break; the rest remain locked.
          await page.evaluate(mode => {
            const entry = P3.ui.debug.index().find(e => e.mode === mode && !e.extra);
            P3.game.prog.record(entry.id, 0, 3, 30000, false);
            P3.game.prog.record(entry.id, 4, 2, 20000, false);
            P3.ui.setScreen('modes');
          }, mode);
          await page.waitForTimeout(350);
          await first();
          for (let i = 0; i < ['cozy', 'vivid', 'hyper'].indexOf(mode); i++) await key('Space');
          await key('Enter');
          check(await page.evaluate(() => P3.ui.screen === 'campaigns'), 'one Enter directly opens the selected mood');
          await first();
          await selection('#menu .focused'); // Campaign blurb and progress both stay readable.
          for (let i = 1; i < 3; i++) {
            await key('Space');
            check(await page.evaluate(() => P3.ui.index) === i, 'Space selects campaign ' + (i + 1));
            await selection('#menu .focused');
          }
          await key('Space');
          check(await page.evaluate(() => /Back/.test(P3.ui.items[P3.ui.index].label)), 'campaign scan reaches Back after the last card');
          await key('Space');
          check(await page.evaluate(() => P3.ui.index === 0), 'campaign scan wraps to the first card');
          await key('Enter');
          await page.waitForFunction(() => P3.ui.screen === 'levels');
          await page.waitForTimeout(350);
          await first();
          for (let level = 1; level <= 6; level++) {
            await key('Space');
            const target = await page.evaluate(() => ({ speech: P3.ui.items[P3.ui.index].speech, enabled: P3.ui.items[P3.ui.index].enabled }));
            check(target.speech.startsWith('Level ' + level + ',') && target.enabled, 'Space individually selects unlocked Level ' + level);
            await selection('#menu .focused');
            check(await page.locator('#menu .locked.focused').count() === 0, 'locked levels never receive selection');
          }
          await key('Space');
          check(await page.evaluate(() => /Back/.test(P3.ui.items[P3.ui.index].label)), 'Space skips every remaining locked level to Back');
          await key('Space');
          check(await page.evaluate(() => /Continue: Level 6/.test(P3.ui.items[P3.ui.index].label)), 'level scan wraps to Continue');
          await key('Space');
          await selection('#menu .done.focused');
          await capture('completed-level');

          await page.evaluate(() => P3.game.store.set('preShot', true));
          await key('Enter');
          await page.waitForFunction(() => P3.game.state === 'intro');
          check(await page.evaluate(() => P3.game.levelIndex === 0), 'one Enter directly starts highlighted Level 1');
          await page.evaluate(() => P3.game.beginPlay());
          await page.waitForFunction(() => P3.ui.context === 'choice');
          check(await page.locator('#choiceFrame.on').count() === 1, 'Play is selected before the shot');
          const playColors = await page.locator('#choiceFrame .chip').evaluate(node => {
            const s = getComputedStyle(node);
            return { background: s.backgroundColor, color: s.color, image: s.backgroundImage };
          });
          assert.deepEqual(playColors, { background: YELLOW, color: INK, image: 'none' }, prefix + ': Play chip matches selection palette');
          checks++;
          await capture('play-choice');
          await key('Space');
          check(await page.evaluate(() => P3.ui.choiceIndex === 1), 'Space selects Pause');
          await selection('#pauseBtn.focused');
          check(await page.locator('#choiceFrame.on').count() === 0, 'Play and Pause are never simultaneously highlighted');
          await capture('pause-choice');
          await key('Enter');
          check(await page.evaluate(() => P3.ui.screen === 'pause' && P3.game.paused), 'Enter selects the highlighted Pause');
          assert.deepEqual(errors, [], prefix + ': no browser runtime errors');
          checks++;
          console.log('PASS ' + prefix + ': individual modes, campaigns, custom entries, unlocked levels, and high-contrast selection');
        } finally {
          await context.close();
        }
      }
    }
    console.log(`ALL ${checks} SELECTION CHECKS PASSED; screenshots: ${output}`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
