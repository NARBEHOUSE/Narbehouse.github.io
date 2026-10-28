'use strict';
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts/robotfootball-first-down');
const origin = process.env.HUB_TEST_ORIGIN || 'http://127.0.0.1:4173';
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const report = { checks: [], errors: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/bennyshub/apps/games/ROBOTFOOTBALL/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.RobotFootball?.renderer);
    for (const possession of ['home', 'away']) for (const crosses of [true, false]) {
      const setup = await page.evaluate(({ possession, crosses }) => {
        const game = window.RobotFootball;
        game.startGame(true);
        const sim = game.sim, s = sim.s, d = possession === 'home' ? 1 : -1;
        sim.options.practice = false; sim.options.kickoffs = false;
        Object.assign(s, { possession, fieldPosition: d === 1 ? 25 : 75, down: 4, distance: 10, kickoff: null, kickReturn: null, conversion: null });
        sim._formation();
        const runner = sim._player(possession + '-RB'), tackler = s.players.find(p => p.team !== possession);
        s.players.forEach(p => { p.x = 22; p.z = 50; });
        Object.assign(runner, { x: 0, z: s.firstDownLine - d * (crosses ? 1.8 : 2.2), heading: d === 1 ? 0 : Math.PI });
        Object.assign(tackler, { x: 0, z: runner.z + d * .8 });
        s.carrierId = runner.id;
        sim._beginTackle(runner, tackler, 'Tackled');
        return { contact: s.tackle.spot, line: s.firstDownLine, direction: d };
      }, { possession, crosses });
      assert.ok((setup.contact - setup.line) * setup.direction < 0);
      await page.waitForFunction(() => window.RobotFootball.sim.s.phase === 'result');
      const result = await page.evaluate(() => {
        const sim = window.RobotFootball.sim;
        return { title: sim.s.result.title, down: sim.s.down, distance: sim.s.distance, switchPossession: sim._pending.switchPossession, hud: document.getElementById('down').textContent, banner: document.getElementById('ready-label').textContent };
      });
      assert.equal(result.title, crosses ? 'First down!' : 'Turnover on downs');
      assert.equal(result.switchPossession, !crosses);
      if (crosses) { assert.equal(result.down, 1); assert.equal(result.distance, 10); assert.match(result.hud, /1st.*10/i); }
      assert.match(result.banner, crosses ? /first down/i : /turnover on downs/i);
      await page.screenshot({ path: path.join(out, possession + (crosses ? '-first-down' : '-short') + '.png') });
      report.checks.push({ possession, crosses, setup, result });
    }
    assert.deepEqual(report.errors, []);
    report.result = 'passed';
  } catch (error) {
    report.result = 'failed'; report.failure = error.stack; throw error;
  } finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  console.log('Robot Football browser check passed: full tackle animation, first-down HUD, and fourth-down shortfall for both teams.');
})().catch(error => { console.error(error); process.exitCode = 1; });
