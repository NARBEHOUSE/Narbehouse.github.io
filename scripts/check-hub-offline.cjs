'use strict';
// Real offline cache and cold-entry checks. Installation events below are simulated;
// browser/OS installation chrome and target-device storage quotas need device testing.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const http = require('node:http');
let hubURL, reachable = true;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
// Destroy actual origin requests as well as emulating offline: Chromium workers
// can still reach localhost during context.setOffline(true) in some versions.
const server = http.createServer(async (request, response) => {
  if (!reachable) { request.socket.destroy(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith('/bennyshub/') || pathname.includes('..')) throw Error('Not public');
    let file = path.resolve(root, '.' + pathname);
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const real = await fs.realpath(file);
    if (!real.startsWith(path.join(root, 'bennyshub') + path.sep)) throw Error('Not public');
    const body = await fs.readFile(real);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
});
const output = path.join(root, 'artifacts/hub-offline');
const cacheOnly = process.argv.includes('--cache-only');
const focusIds = (process.argv.find(arg => arg.startsWith('--games=')) || '').slice(8).split(',').filter(Boolean);
const report = { checks: [], games: [], tools: [], failures: [], installation: 'Synthetic appinstalled event smoke; browser installation UI not automated.' };
let browser;
const pass = message => { report.checks.push(message); console.log('PASS ' + message); };
const save = () => fs.writeFile(path.join(output, cacheOnly ? 'final-cache-report.json' : focusIds.length ? 'focused-report.json' : 'report.json'), JSON.stringify(report, null, 2));
async function contextForTest() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  context.setDefaultTimeout(15000);
  await context.addInitScript(() => {
    window.__offlineStates = [];
    navigator.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type === 'HUB_OFFLINE_STATUS') window.__offlineStates.push(event.data);
    });
    Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], addEventListener() {}, removeEventListener() {}, cancel() {}, speak(u) { u.onstart?.(); u.onend?.(); } } });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
  return context;
}
async function openHub(context) {
  const page = await context.newPage();
  await page.goto(hubURL);
  await page.waitForFunction(() => navigator.serviceWorker.controller && !document.getElementById('offline-download').disabled);
  await page.locator('#modal-cancel').click();
  return page;
}
(async () => {
  await fs.mkdir(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  hubURL = 'http://127.0.0.1:' + server.address().port + '/bennyshub/';
  browser = await chromium.launch({ executablePath: process.env.HUB_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const installContext = await contextForTest();
  const installPage = await openHub(installContext);
  reachable = false;
  await installContext.setOffline(true);
  await installPage.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await installPage.waitForFunction(() => window.__offlineStates.some(state => state.phase === 'paused'), null, { timeout: 60000 });
  assert.equal(await installPage.evaluate(() => localStorage.getItem('bennyHubOfflineRequested')), 'true');
  assert.equal(await installPage.locator('#offline-download').textContent(), 'Resume offline download');
  pass('Synthetic appinstalled event automatically requests the library and shows a resumable offline failure');
  await installContext.close();
  reachable = true;

  const context = await contextForTest();
  const page = await openHub(context);
  assert.equal(await page.evaluate(async () => (await caches.keys()).includes('benny-offline-library-v1')), false);
  await page.locator('#hub-settings > summary').click();
  await page.locator('#offline-download').click();
  await page.waitForFunction(() => window.__offlineStates.some(state => state.phase === 'downloading' && state.completed > 5), null, { timeout: 60000 });
  reachable = false;
  await context.setOffline(true);
  await page.waitForFunction(() => window.__offlineStates.at(-1)?.phase === 'paused', null, { timeout: 60000 });
  const interrupted = await page.evaluate(() => window.__offlineStates.at(-1));
  assert.ok(interrupted.completed > 0 && interrupted.completed < interrupted.total);
  assert.equal(await page.locator('#offline-download').isEnabled(), true);
  pass('Fresh library download pauses after connection loss and retains ' + interrupted.completed + ' completed files');
  const beforeResume = await page.evaluate(() => window.__offlineStates.length);
  reachable = true;
  await context.setOffline(false);
  await page.waitForFunction(() => window.__offlineStates.at(-1)?.phase === 'ready', null, { timeout: 600000 });
  const resumed = await page.evaluate(index => window.__offlineStates.slice(index).find(state => state.phase === 'downloading'), beforeResume);
  assert.ok(resumed.completed >= interrupted.completed);
  const manifest = await page.evaluate(async () => (await (await fetch('./offline-manifest.json', { cache: 'no-store' })).json()));
  report.version = manifest.version; report.assetCount = manifest.assets.length; report.bytes = manifest.totalBytes;
  const inventory = await page.evaluate(async manifest => {
    const cache = await caches.open('benny-offline-library-v1'), missing = [];
    for (const entry of manifest.assets) {
      const response = await cache.match(new URL(entry.url, location.href));
      if (response?.headers.get('X-Benny-Revision') !== entry.revision) missing.push(entry.url);
    }
    return missing;
  }, manifest);
  assert.deepEqual(inventory, []);
  pass('Resume reused saved files and verified all ' + manifest.assets.length + ' manifest entries before any game was opened');
  await page.screenshot({ path: path.join(output, 'ready-online.png'), fullPage: true });
  await save();

  const games = await page.evaluate(() => appsData.games);
  const tools = await page.evaluate(() => allTools.filter(app => ['keyboard', 'phraseboard'].includes(app.id)));
  reachable = false;
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__offlineStates.at(-1)?.phase === 'ready', null, { timeout: 60000 });
  assert.match(await page.locator('#offline-status').textContent(), /Ready offline/);
  await page.waitForFunction(() => appsData.games.length > 0);
  pass('Offline Hub reload preserves Ready offline and loads both catalogs');
  if (cacheOnly) {
    await page.screenshot({ path: path.join(output, 'ready-offline.png'), fullPage: true });
    report.status = 'passed';
    await context.close();
    return;
  }

  const appPage = await context.newPage();
  let current;
  appPage.on('pageerror', error => current?.errors.push(error.message));
  appPage.on('response', response => {
    if (response.url().startsWith(hubURL) && response.status() >= 400) current?.missing.push({ url: response.url(), status: response.status() });
  });
  appPage.on('requestfailed', request => {
    if (request.url().startsWith(hubURL) && !/ERR_ABORTED/.test(request.failure()?.errorText || '')) current?.missing.push({ url: request.url(), error: request.failure()?.errorText });
  });
  for (const app of [...games, ...tools].filter(app => !focusIds.length || focusIds.includes(app.id))) {
    current = { id: app.id, title: app.title, errors: [], missing: [] };
    try {
      const response = await appPage.goto(new URL(app.path, hubURL).href, { waitUntil: 'domcontentloaded', timeout: 45000 });
      assert.equal(response.status(), 200);
      await appPage.waitForTimeout(1200);
      assert.doesNotMatch(await appPage.locator('body').innerText(), /This file is not saved offline yet/);
      if (app.id === 'bennysbaseball') {
        await appPage.waitForFunction(() => window.__baseball2Game?.scene.isActive('TitleScene'));
        await appPage.keyboard.press('Space'); await appPage.waitForTimeout(100); await appPage.keyboard.press('Enter');
        await appPage.waitForFunction(() => !window.__baseball2Game.scene.isActive('TitleScene'));
        assert.ok(await appPage.evaluate(() => !!document.querySelector('canvas')?.getContext('webgl')));
        current.playable = 'Phaser title menu entered the next game screen using switches';
      }
      if (app.id === 'bennysbasketball') {
        await appPage.locator('#main-menu-list [data-action="start"]').click();
        await appPage.waitForFunction(() => getComputedStyle(document.getElementById('start-screen')).display === 'none');
        assert.ok(await appPage.evaluate(() => [...document.querySelectorAll('canvas')].some(canvas => canvas.getContext('webgl2') || canvas.getContext('webgl'))));
        await appPage.keyboard.down('Enter'); await appPage.waitForTimeout(400); await appPage.keyboard.up('Enter');
        current.playable = 'Three.js shootout started with a live WebGL canvas and shot input';
      }
      if (app.id === 'narbeanimalfriends') {
        await appPage.waitForFunction(() => window.NAF?.Input.scanState() && NAF.UI.current() === 'menu');
        await appPage.locator('[data-menu="zone:barn"]').click();
        await appPage.locator('[data-mode="barn"]').click();
        await appPage.locator('.naf-open-barn').click();
        await appPage.waitForFunction(() => NAF.Game.isBusy());
        const fallback = await appPage.evaluate(() => {
          const original = SafeAudio.play; let requested;
          SafeAudio.play = function (name, ...args) { requested = name; return original.call(this, name, ...args); };
          NAF.Audio.play('press'); SafeAudio.play = original;
          return requested;
        });
        assert.equal(fallback, 'naf-press');
        current.playable = 'Visited Barn, started a reveal, and verified the existing synthesized press sound fallback';
      }
      if (app.id === 'narbeminigolf') {
        await appPage.waitForFunction(() => window.MG?.ui?.screen === 'title');
        await appPage.getByText('Play Golf', { exact: true }).click();
        await appPage.waitForTimeout(200);
        await appPage.locator('#overlayMenu .menuItem').filter({ hasText: 'Casual' }).click();
        await appPage.waitForFunction(() => MG.ui.screen === 'course');
        await appPage.waitForTimeout(200);
        await appPage.locator('#overlayMenu > :first-child').click();
        await appPage.waitForFunction(() => MG.game.isPlaying());
        current.playable = 'Selected Casual and loaded a built-in course into a live round';
      }
      if (app.id === 'narbepetpals') {
        await appPage.locator('#menu-list .scan-item').first().click();
        await appPage.waitForFunction(() => layer === 'kind' && TARGETS.length > 0);
        await appPage.evaluate(() => TARGETS.find(item => item.label === 'Puppy').el.click());
        await appPage.waitForFunction(() => layer === 'color' && TARGETS.length > 0);
        await appPage.evaluate(() => TARGETS[0].el.click());
        await appPage.locator('#names .scan-item').first().click();
        await appPage.waitForFunction(() => layer === 'game' && state?.name);
        assert.equal(await appPage.evaluate(() => urlFor('dog.whine.baby.0').startsWith('data:audio/wav;base64,')), true);
        current.playable = 'Adopted and named a puppy, entered its room, and verified the synthesized missing-recording fallback';
      }
      if (app.id === 'keyboard') assert.ok(await appPage.locator('button').count());
      if (app.id === 'phraseboard') assert.ok((await appPage.locator('body').innerText()).length > 100);
      // These two games deliberately probe drop-in recordings not shipped in the
      // repository. Keep that evidence separate; every shipped file still must be cached.
      current.optionalAudioProbes = [];
      const requiredFailures = [];
      for (const failure of current.missing) {
        const url = new URL(failure.url), relative = decodeURIComponent(url.pathname).replace(/^\//, '');
        const optionalFolder = /\/apps\/games\/(NARBEANIMALFRIENDS|NARBEPETPALS)\/sounds\//.test(url.pathname);
        const shipped = manifest.assets.some(entry => new URL(entry.url, hubURL).pathname === url.pathname);
        const exists = await fs.access(path.join(root, relative)).then(() => true, () => false);
        if (optionalFolder && !shipped && !exists) current.optionalAudioProbes.push(failure.url);
        else requiredFailures.push(failure);
      }
      current.missing = requiredFailures;
      assert.deepEqual(current.missing, [], 'required local runtime/asset request failures');
      assert.deepEqual(current.errors, [], 'uncaught startup errors');
      current.status = 'passed';
    } catch (error) {
      current.status = 'failed'; current.failure = error.message;
      report.failures.push(app.id + ': ' + error.message);
      await appPage.screenshot({ path: path.join(output, app.id + '-failure.png') }).catch(() => {});
    }
    (games.some(game => game.id === app.id) ? report.games : report.tools).push(current);
    console.log(current.status.toUpperCase() + ' offline cold entry: ' + app.id);
    await appPage.goto('about:blank');
    current = null;
    await save();
  }
  await appPage.close();
  assert.equal(report.games.length, games.filter(app => !focusIds.length || focusIds.includes(app.id)).length);
  assert.equal(report.tools.length, tools.filter(app => !focusIds.length || focusIds.includes(app.id)).length);
  assert.deepEqual(report.failures, []);
  pass(report.games.length + ' selected games and ' + report.tools.length + ' selected tools opened offline without a previous online visit; absent optional Animal Friends/Pet Pals recording probes retain their built-in fallbacks');
  await page.screenshot({ path: path.join(output, 'ready-offline.png'), fullPage: true });
  report.status = 'passed';
  await context.close();
})().catch(error => { report.status = 'failed'; report.error = error.stack; console.error(error); process.exitCode = 1; }).finally(async () => { await save(); await browser?.close(); server.close(); });
