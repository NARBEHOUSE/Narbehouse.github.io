// Browser regressions for mobile input, reload checkpoints, results and shipped worlds.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { start } = require('../serve.cjs');
const out = path.resolve(__dirname, '../../../../../../tmp/p3gl-integration');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const srv = await start(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const url = `http://127.0.0.1:${srv.port}/apps/games/BENNYSPEGGLE/index.html`;
  const errors = [];
  const check = (name, value) => { assert.ok(value, name); console.log('PASS ' + name); };
  function watch(page) {
    page.on('pageerror', e => errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  }
  async function ready(page) { await page.waitForFunction(() => window.__ready && P3.ui.screen === 'title'); await page.waitForTimeout(350); }
  async function startGame(page, mode = 'cozy') {
    await page.evaluate(async mode => {
      const c = await P3.ui.debug.loadEntry(P3.ui.debug.index().find(e => e.mode === mode && !e.extra));
      P3.ui.debug.play(c, 0);
    }, mode);
    await page.waitForTimeout(450);
  }
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    watch(page); await page.goto(url); await ready(page);
    check('three campaigns per mode, each with twenty levels', await page.evaluate(() => ['cozy', 'vivid', 'hyper'].every(mode => {
      const es = P3.ui.debug.index().filter(e => e.mode === mode && !e.extra);
      return es.length === 3 && es.every(e => e.levels === 20);
    })));
    await startGame(page);
    check('Shoot is available immediately on touch devices', await page.locator('#shootBtn').isVisible());
    await page.locator('#shootBtn').tap();
    check('Shoot dismisses the intro without launching early', await page.evaluate(() => P3.game.state === 'play' && P3.game.match.phase === 'aim'));
    const p = await page.evaluate(() => P3.layout.toScreen(P3.main.layout, 750, 430));
    await page.touchscreen.tap(p.x, p.y);
    check('touch aims without firing on release', await page.evaluate(() => P3.game.match.phase === 'aim' && P3.game.match.angle > 10));
    await page.locator('#shootBtn').tap();
    const checkpoint = await page.evaluate(() => ({ live: P3.game.match.ballsLeft, saved: P3.util.load('resume'), phase: P3.game.match.phase }));
    check('Shoot launches exactly one ball', checkpoint.phase === 'shot' && checkpoint.saved.snap.ballsLeft === checkpoint.live + 1);
    await page.reload(); await ready(page);
    await page.getByRole('button', { name: /^Continue\./ }).click();
    await page.evaluate(() => P3.game.beginPlay());
    check('reload during a shot restores the last playable checkpoint', await page.evaluate(s => P3.game.match.ballsLeft === s.ballsLeft && P3.game.match.angle === s.angle && P3.game.match.score === s.score, checkpoint.saved.snap));

    await page.keyboard.down('Enter');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.keyboard.up('Enter');
    check('losing window focus pauses without firing', await page.evaluate(() => P3.game.paused && P3.game.match.phase === 'aim'));
    await page.waitForTimeout(350); await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.keyboard.down('Enter');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('narbe-input-cancelled', { detail: { code: 'Enter' } })));
    await page.keyboard.up('Enter');
    check('a cancelled switch press never fires', await page.evaluate(() => P3.game.match.phase === 'aim'));

    await page.evaluate(() => { Object.assign(P3.game.match.banked, { fire: 1, blast: 1, spray: 1, net: 1, guide: 1 }); P3.game.hud(); });

    for (const [w, h] of [[390, 844], [320, 568], [844, 390], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(200);
      const boxes = await page.evaluate(() => {
        const ids = ['pauseBtn', 'shootBtn', 'hudLevel', 'hudGoal', 'hudScore', 'hudBalls', 'hudFever', 'hudPlate', 'hudPowers'];
        return ids.map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, x: r.x, y: r.y, w: r.width, h: r.height }; });
      });
      for (const b of boxes) check(`${w}×${h}: ${b.id} stays on screen`, b.x >= -1 && b.y >= -1 && b.x + b.w <= w + 1 && b.y + b.h <= h + 1);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        assert.ok(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, `${w}×${h}: ${a.id} overlaps ${b.id}`);
      }
      const board = await page.evaluate(() => P3.main.layout.board);
      const powers = boxes.find(b => b.id === 'hudPowers');
      check(`${w}×${h}: saved powers do not cover the board`, powers.x + powers.w <= board.x + 1 || powers.x >= board.x + board.w - 1 || powers.y >= board.y + board.h - 1);
      await page.screenshot({ path: path.join(out, `play-${w}x${h}.png`) });
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { P3.ui.openPause(); P3.game.store.set('preShot', true); P3.ui.setScreen('settings'); });
    check('long setting values fit a narrow phone', await page.evaluate(() => [...document.querySelectorAll('#menu .mi')].every(e => e.scrollWidth <= e.clientWidth + 1)));
    await page.screenshot({ path: path.join(out, 'settings-320x568.png') });

    // Deliberately miss a one-ball level three times. Only completed losses
    // count as failures; pressing Try Again must not count as another failure.
    await page.evaluate(() => {
      const c = P3.levels.normCampaign({ id: 'integration-loss', title: 'Test', mode: 'vivid', theme: 'sugar-rush', levels: [{ name: 'One chance', balls: 1,
        goal: { type: 'color', color: 'orange' }, plate: { w: 100, x: 100, speed: 0, mode: 'catch' }, items: [{ t: 'peg', c: 'orange', x: 70, y: 300 }] }] });
      c.source = 'file'; P3.game.store.set('preShot', false); P3.ui.debug.play(c, 0); P3.game.beginPlay();
    });
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.evaluate(() => { P3.game.beginPlay(); P3.game.fire(); for (let i = 0; i < 2400 && P3.game.state !== 'result'; i++) P3.game.update(1 / 30); });
      await page.waitForFunction(() => P3.ui.screen === 'result'); await page.waitForTimeout(350);
      check(`Skip is ${attempt < 3 ? 'hidden' : 'offered'} after ${attempt} failed tries`, await page.getByRole('button', { name: /Skip This Level/ }).count() === (attempt < 3 ? 0 : 1));
      if (attempt < 3) await page.getByRole('button', { name: 'Try Again', exact: true }).click();
    }
    await page.getByRole('button', { name: /Skip This Level/ }).click();
    check('skipping the final level returns to its level list', await page.evaluate(() => P3.ui.screen === 'levels' && P3.game.state === 'menu'));

    // Render every real campaign with both its opening and final variant.
    check('all nine worlds have concrete renderers', await page.evaluate(() => Object.keys(P3.themes.THEMES).every(P3.backdrops.has)));
    await page.setViewportSize({ width: 1440, height: 900 });
    const entries = await page.evaluate(() => P3.ui.debug.index());
    for (const e of entries) {
      await page.evaluate(async id => { const c = await P3.ui.debug.loadEntry(P3.ui.debug.index().find(e => e.id === id)); P3.ui.debug.play(c, 0); P3.game.beginPlay(); }, e.id);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(out, e.id + '.png') });
      await page.evaluate(() => P3.game.showWorld(P3.game.campaign.theme, { variant: 19, music: false }));
      await page.waitForTimeout(80);
    }
    check('all shipped campaigns load and render without network, shader or script errors', errors.length === 0);
    await page.close();

    const fallback = await browser.newPage();
    await fallback.addInitScript(() => {
      const old = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/.test(type) ? null : old.call(this, type, ...args); };
    });
    await fallback.goto(url);
    check('a device without WebGL gets a usable recovery screen', await fallback.getByRole('button', { name: 'Back to Hub', exact: true }).isVisible());
    await fallback.getByRole('button', { name: 'Back to Hub', exact: true }).focus();
    await fallback.keyboard.down('Enter');
    check('startup recovery waits for switch release', fallback.url() === url);
    await fallback.route(`http://127.0.0.1:${srv.port}/index.html`, route => route.fulfill({ contentType: 'text/html', body: '<h1>Hub</h1>' }));
    await fallback.keyboard.up('Enter');
    await fallback.waitForURL(`http://127.0.0.1:${srv.port}/index.html`);
    check('startup recovery respects the focused Back to Hub button', true);
    console.log('ALL INTEGRATION CHECKS PASSED — screenshots in ' + out);
  } finally {
    if (errors.length) console.error(errors.join('\n'));
    await browser.close(); srv.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
