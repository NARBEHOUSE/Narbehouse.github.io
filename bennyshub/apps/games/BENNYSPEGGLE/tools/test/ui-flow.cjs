// Switch-access flow test: menus → a level → aim/fire → hold to pause → the
// Play/Pause choice → one-switch mode. Real key events, real game.
// node tools/test/ui-flow.cjs [--show] [--out dir]
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { chromium } = require(path.resolve(__dirname, '../../../../../../node_modules/playwright'));
const { start } = require('../serve.cjs');

const out = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : path.resolve(__dirname, '../../../../../../tmp/p3gl-tests'); })();
fs.mkdirSync(out, { recursive: true });

(async () => {
  const srv = await start(0);
  const browser = await chromium.launch({ headless: !process.argv.includes('--show'), args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(() => {
    localStorage.clear();
    window.__said = [];
    const hook = () => { if (window.NarbeVoiceManager && !window.NarbeVoiceManager.__hooked) { const o = window.NarbeVoiceManager.speak; window.NarbeVoiceManager.speak = function (t) { window.__said.push(String(t)); }; window.NarbeVoiceManager.__hooked = true; } };
    document.addEventListener('DOMContentLoaded', hook); setInterval(hook, 50);
  });
  await page.goto(`http://127.0.0.1:${srv.port}/apps/games/BENNYSPEGGLE/index.html`);
  await page.waitForFunction(() => window.__ready && P3.ui && P3.ui.screen === 'title', null, { timeout: 30000 });
  await page.waitForTimeout(500);

  const tap = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms || 110); await page.keyboard.up(key); await page.waitForTimeout(key === 'Enter' ? 380 : 140); };
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(160); };
  const st = () => page.evaluate(() => ({ screen: P3.ui.screen, ctx: P3.ui.context, index: P3.ui.index, label: (P3.ui.items[P3.ui.index] || {}).label, state: P3.game.state, phase: P3.game.match && P3.game.match.phase, angle: P3.game.match && P3.game.match.angle, paused: P3.game.paused, choice: P3.game.choiceOn, choiceIndex: P3.ui.choiceIndex }));
  const results = [];
  const check = (name, cond, info) => { results.push({ name, ok: !!cond, info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + JSON.stringify(info) : '')); };

  let s = await st();
  check('title opens without a selection', s.screen === 'title' && s.index === -1 && await page.locator('#menu .focused').count() === 0, s);
  await tap('Space');
  s = await st();
  check('first Space selects Play', /Play/.test(s.label), s);
  await tap('Space');
  s = await st();
  check('Space moves to How to Play (on release)', /How to Play/.test(s.label), s);
  await hold('Space', 3400);
  s = await st();
  check('holding Space scans backwards', /Play|Exit/.test(s.label), s);
  // Go to Play.
  for (let i = 0; i < 6 && !/^Play/.test((await st()).label); i++) await tap('Space');
  await tap('Enter');
  s = await st();
  check('Play opens the mode chooser', s.screen === 'modes', s);
  check('mode chooser opens without a selection', s.index === -1);
  await tap('Space');
  await page.screenshot({ path: path.join(out, 'modes.png') });
  // Cards scan individually; Enter opens the card without a row-selection step.
  check('mode chooser highlights one card', await page.locator('#menu .focused').count() === 1 && await page.locator('#menu .rowFocus').count() === 0);
  await tap('Space');
  s = await st();
  const modeLabel = await page.evaluate(() => P3.ui.items[P3.ui.index].speech);
  check('one Space advances directly to Vivid', /Vivid/.test(modeLabel), { modeLabel });
  await tap('Enter');
  s = await st();
  check('one Enter on Vivid opens its campaigns', s.screen === 'campaigns', s);
  check('campaign chooser opens without a selection', s.index === -1);
  await tap('Space');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'campaigns.png') });
  check('campaign chooser highlights one card', await page.locator('#menu .focused').count() === 1 && await page.locator('#menu .rowFocus').count() === 0);
  await tap('Enter');
  await page.waitForFunction(() => P3.ui.screen === 'levels');
  s = await st();
  check('one Enter on the campaign opens its level list', s.screen === 'levels', s);
  check('level chooser opens without a selection', s.index === -1);
  await tap('Space');                              // First Space selects Start: Level 1.
  await page.screenshot({ path: path.join(out, 'levels.png') });
  await tap('Space');
  check('Space selects Level 1 directly', await page.evaluate(() => /^Level 1,/.test(P3.ui.items[P3.ui.index].speech)));
  check('level chooser highlights one unlocked tile', await page.locator('#menu .focused').count() === 1 && await page.locator('#menu .rowFocus,#menu .locked.focused').count() === 0);
  await tap('Enter');                              // The highlighted level starts immediately.
  await page.waitForTimeout(200);
  s = await st();
  check('level starts with an intro', s.state === 'intro', s);
  await tap('Enter');
  s = await st();
  check('a press skips the intro', s.state === 'play' && s.phase === 'aim', s);

  // Two switches: hold Space sweeps, each new press reverses.
  const a0 = (await st()).angle;
  await hold('Space', 900);
  const a1 = (await st()).angle;
  await hold('Space', 900);
  const a2 = (await st()).angle;
  check('hold Space sweeps the aim', Math.abs(a1 - a0) > 5, { a0, a1 });
  check('a new press sweeps the other way', Math.sign(a2 - a1) === -Math.sign(a1 - a0), { a1, a2 });
  await page.screenshot({ path: path.join(out, 'aim.png') });
  await tap('Enter');
  s = await st();
  check('Enter release fires', s.phase === 'shot' || s.phase === 'pop', s);
  await page.waitForFunction(() => P3.game.match.phase === 'aim' || P3.game.match.phase === 'won' || P3.game.match.phase === 'lost', null, { timeout: 30000 });

  // Hold Enter to pause, and the release must not fire.
  const ballsBefore = await page.evaluate(() => P3.game.match.ballsLeft);
  await page.keyboard.down('Enter');
  await page.waitForTimeout(3000);
  const ring = await page.evaluate(() => document.getElementById('holdRing').classList.contains('on'));
  check('the hold ring shows while holding Enter', ring);
  await page.waitForTimeout(2300);
  s = await st();
  check('holding Enter opens Pause', s.screen === 'pause' && s.paused, s);
  await page.keyboard.up('Enter'); await page.waitForTimeout(200);
  const ballsAfter = await page.evaluate(() => P3.game.match.ballsLeft);
  check('the held release does not fire', ballsAfter === ballsBefore, { ballsBefore, ballsAfter });
  await page.screenshot({ path: path.join(out, 'pause.png') });

  // Pause → Settings → Before Each Shot: Choose Play or Pause.
  for (let i = 0; i < 8 && !/Settings/.test((await st()).label); i++) await tap('Space');
  await tap('Enter');
  for (let i = 0; i < 8 && !/Before Each Shot/.test((await st()).label); i++) await tap('Space');
  await tap('Enter');
  const pre = await page.evaluate(() => P3.game.store.get('preShot'));
  check('Before Each Shot toggles to Choose Play or Pause', pre === true);
  for (let i = 0; i < 12 && !/Back/.test((await st()).label); i++) await tap('Space');
  await tap('Enter');
  s = await st();
  check('Back returns to Pause', s.screen === 'pause', s);
  // Continue is the first item.
  for (let i = 0; i < 8 && !/Continue/.test((await st()).label); i++) await tap('Space');
  await tap('Enter');
  await page.waitForTimeout(250);
  // Next shot: the choice should appear after this shot finishes; the current aim phase opens it on the next ready.
  await tap('Enter');   // fire the waiting shot
  await page.waitForFunction(() => P3.game.match.phase === 'aim' || P3.game.match.phase === 'won' || P3.game.match.phase === 'lost', null, { timeout: 30000 });
  await page.waitForTimeout(300);
  s = await st();
  check('the Play / Pause choice opens before the shot', s.ctx === 'choice' && s.choiceIndex === 0, s);
  await page.screenshot({ path: path.join(out, 'choice-play.png') });
  await tap('Space');
  s = await st();
  check('Space moves the choice to Pause (bottom-left)', s.choiceIndex === 1, s);
  const focusedPause = await page.evaluate(() => document.getElementById('pauseBtn').classList.contains('focused'));
  check('the Pause button is highlighted', focusedPause);
  await page.screenshot({ path: path.join(out, 'choice-pause.png') });
  await tap('Enter');
  s = await st();
  check('choosing Pause opens the pause menu (no hold needed)', s.screen === 'pause', s);
  await tap('Space');   // Menus start neutral; first Space selects Continue.
  await tap('Enter');   // Continue
  await page.waitForTimeout(250);
  s = await st();
  check('Continue returns to the choice', s.ctx === 'choice', s);
  await tap('Enter');   // Play
  s = await st();
  check('choosing Play starts aiming', s.ctx === 'play' && !s.choice, s);

  // One switch: Auto Scan on. The aim sweeps by itself; Enter press freezes, release fires.
  await page.evaluate(() => { NarbeScanManager.setAutoScan(true); P3.game.store.set('preShot', false); });
  const b0 = (await st()).angle; await page.waitForTimeout(800); const b1 = (await st()).angle;
  check('one switch: the aim sweeps by itself', Math.abs(b1 - b0) > 3, { b0, b1 });
  await page.keyboard.down('Enter'); await page.waitForTimeout(150);
  const c0 = (await st()).angle; await page.waitForTimeout(500); const c1 = (await st()).angle;
  check('one switch: pressing Enter freezes the aim', Math.abs(c1 - c0) < 0.01, { c0, c1 });
  await page.keyboard.up('Enter'); await page.waitForTimeout(150);
  s = await st();
  check('one switch: releasing Enter fires', s.phase === 'shot' || s.phase === 'pop', s);

  // Exit to hub posts focusBackButton.
  check('no console errors', errors.length === 0, errors.slice(0, 5));
  const said = await page.evaluate(() => window.__said.slice(-12));
  console.log('last speech:', said.join(' | '));
  fs.writeFileSync(path.join(out, 'ui-flow.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED', '— screenshots in', out);
  process.exit(failed ? 1 : 0);
})();
