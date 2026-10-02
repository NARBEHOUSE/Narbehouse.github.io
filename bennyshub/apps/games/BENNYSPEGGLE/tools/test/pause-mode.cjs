// Choosing Play/Pause disables hold-to-pause, without discarding long releases.
// node tools/test/pause-mode.cjs [--game-root path]
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
    for (const auto of [false, true]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const name = auto ? 'Auto Scan on / NumpadEnter' : 'Auto Scan off / Enter';
      const enter = auto ? 'NumpadEnter' : 'Enter';
      const check = (value, message) => { assert.ok(value, name + ': ' + message); checks++; };
      const state = () => page.evaluate(() => ({
        context: P3.ui.context, screen: P3.ui.screen, paused: P3.game.paused,
        phase: P3.game.match.phase, shots: P3.game.match.shotIndex,
        balls: P3.game.match.ballsLeft, angle: P3.game.match.angle,
        choice: P3.ui.choiceIndex, ring: document.getElementById('holdRing').classList.contains('on'),
        ringShown: window.__holdAudit.ringShown,
        positiveHoldEvents: window.__holdAudit.positiveHoldEvents,
        pauseRequests: window.__holdAudit.pauseRequests
      }));
      async function freshLevel(preShot) {
        await page.evaluate(async ({ preShot, auto }) => {
          P3.game.store.set('preShot', preShot);
          NarbeScanManager.setScanSpeedIndex(3);
          NarbeScanManager.setAutoScan(auto);
          const campaign = await P3.ui.debug.loadEntry(P3.ui.debug.index().find(e => e.mode === 'vivid' && !e.extra));
          P3.ui.debug.play(campaign, 0);
          P3.game.beginPlay();
        }, { preShot, auto });
        await page.waitForTimeout(350);
        await page.evaluate(() => {
          window.__holdAudit = { ringShown: false, positiveHoldEvents: 0, pauseRequests: 0 };
        });
      }
      async function noHoldPause(expectedContext, label) {
        const s = await state();
        check(!s.paused && s.screen !== 'pause' && s.context === expectedContext, label + ' does not pause');
        check(!s.ring && !s.ringShown && s.positiveHoldEvents === 0, label + ' never shows the hold ring');
        check(s.pauseRequests === 0, label + ' never requests hold-to-pause');
        check(s.shots === 0, label + ' does not launch a shot before release');
        return s;
      }
      try {
        await page.goto(`http://127.0.0.1:${server.port}/apps/games/BENNYSPEGGLE/index.html`);
        await page.waitForFunction(() => window.__ready && P3.ui.screen === 'title');
        await page.evaluate(() => {
          NarbeVoiceManager.speak = () => {};
          P3.game.store.set('music', false);
          P3.game.store.set('sfx', false);
          window.__holdAudit = { ringShown: false, positiveHoldEvents: 0, pauseRequests: 0 };
          const ring = document.getElementById('holdRing');
          new MutationObserver(records => {
            if (ring.classList.contains('on') || records.some(record => /\bon\b/.test(record.oldValue || ''))) window.__holdAudit.ringShown = true;
          }).observe(ring, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
          P3.game.on('hold', event => { if (event.p > 0) window.__holdAudit.positiveHoldEvents++; });
          P3.game.on('requestPause', () => { window.__holdAudit.pauseRequests++; });
        });

        await freshLevel(true);
        const full = await page.evaluate(() => P3.game.holdToPause());
        const beforePlay = await state();
        await page.keyboard.down(enter);
        await page.waitForTimeout(full + 300);
        const heldPlay = await noHoldPause('choice', 'long Play-selection hold');
        check(heldPlay.choice === 0, 'holding keeps the Play selection steady');
        await page.keyboard.up(enter);
        await page.waitForTimeout(120);
        const afterPlay = await state();
        check(afterPlay.context === 'play' && !afterPlay.paused, 'long Play release begins aiming');
        check(afterPlay.shots === 0 && afterPlay.balls === beforePlay.balls, 'choosing Play does not fire or consume a ball');

        await page.keyboard.down(enter);
        const aimAtPress = (await state()).angle;
        await page.waitForTimeout(full + 300);
        const heldAim = await noHoldPause('play', 'long aiming hold');
        check(Math.abs(heldAim.angle - aimAtPress) < 0.001, 'aim stays still while Enter is held');
        await page.keyboard.up(enter);
        await page.waitForTimeout(120);
        const afterAim = await state();
        check(!afterAim.paused && afterAim.shots === 1, 'long aiming release fires exactly once');

        await freshLevel(true);
        await page.keyboard.down('Space');
        await page.waitForTimeout(120);
        await page.keyboard.up('Space');
        await page.waitForTimeout(120);
        check((await state()).choice === 1, 'Space selects the Pause choice');
        await page.keyboard.down(enter);
        await page.waitForTimeout(full + 300);
        const heldPauseChoice = await noHoldPause('choice', 'long Pause-selection hold');
        check(heldPauseChoice.choice === 1, 'holding keeps the Pause selection steady');
        await page.keyboard.up(enter);
        await page.waitForTimeout(120);
        const chosenPause = await state();
        check(chosenPause.paused && chosenPause.screen === 'pause' && chosenPause.shots === 0, 'Pause choice opens only on release, without firing');

        // The pointer Pause button remains available after choosing Play.
        await freshLevel(true);
        await page.locator('#choiceFrame').click();
        check((await state()).context === 'play', 'the Play control starts aiming');
        await page.locator('#pauseBtn').click();
        check((await state()).paused && (await state()).screen === 'pause', 'the Pause button remains available with Play/Pause enabled');

        // Aim right away retains its original ring and long-hold pause behavior.
        await freshLevel(false);
        await page.keyboard.down(enter);
        const firstWait = Math.ceil(full * 0.65);
        await page.waitForTimeout(firstWait);
        const filling = await state();
        check(filling.ring && filling.ringShown && filling.positiveHoldEvents > 0, 'Aim right away still shows the hold ring');
        check(!filling.paused, 'ring appears before the hold completes');
        await page.waitForTimeout(full - firstWait + 300);
        const paused = await state();
        check(paused.paused && paused.screen === 'pause' && paused.pauseRequests === 1, 'Aim right away still pauses after a full hold');
        await page.keyboard.up(enter);
        await page.waitForTimeout(120);
        const afterPauseRelease = await state();
        check(afterPauseRelease.paused && afterPauseRelease.shots === 0, 'releasing the pause hold does not fire or select Continue');
        assert.deepEqual(errors, [], name + ': no browser runtime errors');
        checks++;
        console.log('PASS ' + name + ': Play/Pause disables hold-to-pause; release, choice, button, and original pause behavior preserved');
      } finally {
        await context.close();
      }
    }
    console.log(`ALL ${checks} PAUSE MODE CHECKS PASSED`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
