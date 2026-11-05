'use strict';
// node scripts/check-hub-exit.cjs [--built]
// The main-menu Exit button: switch order, confirmation, Cancel/Escape, closing the tab,
// the message when a browser refuses, and that playing apps adds no back-history (Chrome
// only lets a page close a tab that has one history entry, e.g. one an AAC system launched).
const {chromium} = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict'), {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..'), publicRoot = process.argv.includes('--built') ? path.join(root, 'dist') : root;
const chromePath = process.env.HUB_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const out = path.join(root, 'artifacts/hub-exit'); fs.mkdirSync(out, {recursive: true});
const report = {passed: false, checks: [], errors: []};
const check = (ok, label) => { assert.ok(ok, label); report.checks.push(label); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg','.ttf':'font/ttf','.woff2':'font/woff2'};
const GAME = 'apps/games/NARBEGLOWPOP/index.html';
let browser, server, aac;

(async () => {
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    // A page that opens the Hub in a new tab, as SwitchedGames and narbehouse do.
    if (url === '/exit-launcher.html') { res.setHeader('Content-Type', 'text/html'); res.end('<a id="go" href="/bennyshub/index.html" target="_blank" rel="noopener">Open Benny\'s Hub</a>'); return; }
    // A page the Hub is reached from inside the same tab (two history entries).
    if (url === '/exit-start.html') { res.setHeader('Content-Type', 'text/html'); res.end('<a id="go" href="/bennyshub/index.html">Open Benny\'s Hub here</a>'); return; }
    try {
      let f = path.resolve(publicRoot, '.' + url);
      if (!f.startsWith(path.resolve(publicRoot) + path.sep)) throw Error('path');
      if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      res.setHeader('Content-Type', mime[path.extname(f)] || 'application/octet-stream');
      fs.createReadStream(f).pipe(res);
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless: true, executablePath: chromePath});
  const context = await browser.newContext({viewport: {width: 1280, height: 800}});

  const watch = p => p.on('pageerror', e => report.errors.push(e.message));
  const ready = async p => {
    await p.waitForFunction(() => typeof hubMenuOwnsScan === 'function' && document.querySelector('#screen-home.active'));
    if (await p.locator('#modal-cancel').isVisible()) await p.locator('#modal-cancel').click();
    await p.evaluate(() => { NarbeVoiceManager.updateSettings({ttsEnabled: false}); NarbeScanManager.updateSettings({autoScan: false, inputSensitivityIndex: 0}); });
    await p.waitForFunction(() => hubMenuOwnsScan());
  };
  const tap = async (p, key) => { await sleep(200); await p.keyboard.press(key); await sleep(120); };
  const homeSelected = p => p.evaluate(() => document.getElementById('screen-home').dataset.selected);
  const dialogSelected = p => p.evaluate(() => document.querySelector('#exit-modal .modal-content').dataset.selected);
  const dialogOpen = p => p.evaluate(() => !document.getElementById('exit-modal').classList.contains('hidden'));
  const toExit = async p => { const order = []; for (let i = 0; i < 4; i++) { await tap(p, 'Space'); order.push(await homeSelected(p)); } return order; };

  // 1. Opened from a new-tab link, as SwitchedGames does.
  const launcher = await context.newPage(); watch(launcher);
  await launcher.goto(base + '/exit-launcher.html');
  const opened = context.waitForEvent('page'); await launcher.click('#go');
  const hub = await opened; watch(hub); await hub.waitForLoadState(); await ready(hub);

  check(await hub.locator('#screen-home .grid > button').evaluateAll(b => b.map(x => x.querySelector('.btn-title').textContent).join(',')) === 'Tools,Games,Settings,Exit', 'Main menu lists Exit after Settings');
  const order = await toExit(hub);
  check(order.join(',') === 'nav:tools,nav:games,nav:settings,hub-exit', 'Switch scanning reaches Exit last: ' + order.join(' > '));
  await tap(hub, 'Enter');
  check(await dialogOpen(hub), 'Choosing Exit opens the confirmation instead of closing');
  check(await hub.locator('#exit-modal').getAttribute('role') === 'alertdialog' && await hub.locator('#exit-modal-title').textContent() === "Exit Benny's Hub?", 'Confirmation is an alert dialog titled Exit Benny\'s Hub?');
  check(await dialogSelected(hub) !== 'exit-confirm', 'Nothing in the confirmation is pre-selected');
  check(await hub.locator('#exit-modal-note').isVisible() && (await hub.locator('#exit-modal-note').textContent()).includes('opened from a shortcut'), 'The confirmation explains Exit needs the Hub opened from a shortcut');
  await tap(hub, 'Space');
  check(await dialogSelected(hub) === 'exit-cancel', 'Cancel is the first scan choice');
  await hub.screenshot({path: path.join(out, 'exit-confirm-desktop.png')});
  await tap(hub, 'Enter');
  check(!await dialogOpen(hub) && !hub.isClosed(), 'Cancel keeps the Hub open');
  check(await hub.evaluate(() => currentScreen === 'home' && hubMenuOwnsScan()) && await homeSelected(hub) !== 'hub-exit', 'Cancel returns to the main menu with a fresh scan');
  await hub.click('#hub-exit'); check(await dialogOpen(hub), 'Clicking Exit opens the confirmation');
  await hub.keyboard.press('Escape'); await sleep(150);
  check(!await dialogOpen(hub), 'Escape cancels the confirmation');

  // Playing apps must not add back-history, and closing an app still unloads it normally.
  for (let round = 0; round < 2; round++) {
    await hub.evaluate(g => showIframe(g, 'Glow Pop'), GAME);
    const frame = hub.frameLocator('#app-iframe'); await frame.locator('#ngp').waitFor();
    check(await hub.locator('#app-iframe').getAttribute('src') === GAME, `Round ${round + 1}: the frame src names the open game`);
    await hub.evaluate(() => { const w = document.getElementById('app-iframe').contentWindow; w.addEventListener('pagehide', () => { window.__appPagehides = (window.__appPagehides || 0) + 1; }); });
    await hub.locator('#iframe-back').click();
    await hub.waitForFunction(() => document.getElementById('app-iframe').getAttribute('src') === 'about:blank');
    check(await hub.evaluate(r => (window.__appPagehides || 0) === r + 1, round), `Round ${round + 1}: closing the game fires its pagehide (saves still run)`);
  }
  check(await hub.evaluate(() => history.length) === 1, 'Opening and closing games adds no back-history');
  await ready(hub);
  await toExit(hub); await tap(hub, 'Enter'); await tap(hub, 'Space'); await tap(hub, 'Space');
  check(await dialogSelected(hub) === 'exit-confirm', 'Exit is the second scan choice');
  const closed = hub.waitForEvent('close', {timeout: 5000}).then(() => true, () => false);
  await tap(hub, 'Enter');
  check(await closed, 'Confirming Exit closes a tab opened from a link');

  // 2. Reached inside an existing tab: the browser refuses, and the Hub says what to do.
  const sameTab = await context.newPage(); watch(sameTab);
  await sameTab.goto(base + '/exit-start.html'); await sameTab.click('#go'); await sameTab.waitForURL('**/bennyshub/index.html'); await ready(sameTab);
  await sameTab.click('#hub-exit'); await sameTab.click('#exit-confirm');
  await sameTab.waitForFunction(() => document.getElementById('exit-confirm').hidden, {}, {timeout: 3000});
  const refused = await sameTab.locator('#exit-modal-text').textContent();
  check(!sameTab.isClosed() && refused.includes('opened from a shortcut') && refused.includes('Close this tab or window'), 'A refused close explains why and how to finish');
  check(!await sameTab.locator('#exit-modal-note').isVisible(), 'A refused close hides the repeated note');
  check(await sameTab.locator('#exit-cancel').textContent() === 'Back to Hub' && await sameTab.evaluate(() => menuItems().map(menuId).join(',')) === 'exit-cancel', 'A refused close leaves only Back to Hub to scan');
  await sameTab.screenshot({path: path.join(out, 'exit-refused.png')});
  await tap(sameTab, 'Space'); await tap(sameTab, 'Enter');
  check(!await dialogOpen(sameTab) && await sameTab.locator('#exit-confirm').isVisible() === false, 'Back to Hub returns to the main menu');
  await sameTab.click('#hub-exit');
  check(await sameTab.locator('#exit-modal-text').textContent() === "This closes Benny's Hub. Choose Cancel to keep using it." && await sameTab.locator('#exit-confirm').isVisible() && await sameTab.locator('#exit-modal-note').isVisible(), 'Reopening Exit shows the normal confirmation again');
  await sameTab.keyboard.press('Escape');

  // 3. Layout: one row on desktop, two by two on mid-size screens, stacked on phones.
  for (const [w, h, label, columns] of [[1280, 800, 'desktop', 4], [1000, 800, 'tablet', 2], [390, 844, 'phone', 1]]) {
    await sameTab.setViewportSize({width: w, height: h}); await sleep(200);
    const boxes = await sameTab.locator('#screen-home .grid > button').evaluateAll(b => b.map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right)]; }));
    const cols = new Set(boxes.map(b => b[0])).size;
    check(cols === columns && boxes.every(b => b[0] >= 0 && b[2] <= w) && await sameTab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Main menu ${label} layout has ${columns} column(s) with no overflow`);
    await sameTab.screenshot({path: path.join(out, 'home-' + label + '.png'), fullPage: label === 'phone'});
  }

  // 4. Launched straight to the Hub by another program (an AAC system), after playing a game.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-exit-aac-'));
  const port = 9400 + Math.floor(Math.random() * 400);
  aac = {proc: spawn(chromePath, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', base + '/bennyshub/index.html'], {stdio: 'ignore'}), dir};
  for (let i = 0; i < 40 && !aac.browser; i++) { await sleep(250); try { aac.browser = await chromium.connectOverCDP('http://127.0.0.1:' + port); } catch {} }
  let launched;
  for (let i = 0; i < 40 && !launched; i++) { launched = aac.browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('/bennyshub/')); if (!launched) await sleep(250); }
  watch(launched); await launched.waitForLoadState(); await ready(launched);
  await launched.evaluate(g => showIframe(g, 'Glow Pop'), GAME); await launched.frameLocator('#app-iframe').locator('#ngp').waitFor();
  await launched.locator('#iframe-back').click(); await launched.waitForFunction(() => document.getElementById('app-iframe').getAttribute('src') === 'about:blank');
  await ready(launched);
  check(await launched.evaluate(() => history.length) === 1, 'An AAC-launched tab keeps one history entry after a game');
  await toExit(launched); await tap(launched, 'Enter'); await tap(launched, 'Space'); await tap(launched, 'Space');
  const aacClosed = launched.waitForEvent('close', {timeout: 5000}).then(() => true, () => false);
  await tap(launched, 'Enter');
  check(await aacClosed, 'Exit closes a tab an AAC system launched, even after a game');

  check(report.errors.length === 0, 'No JavaScript exceptions');
  report.passed = true;
})().catch(e => { report.errors.push(e.stack || String(e)); console.error(e); process.exitCode = 1; }).finally(async () => {
  await aac?.browser?.close().catch(() => {}); aac?.proc?.kill();
  if (aac?.dir) { await sleep(500); try { fs.rmSync(aac.dir, {recursive: true, force: true}); } catch {} }
  await browser?.close(); if (server) await new Promise(r => server.close(r));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
