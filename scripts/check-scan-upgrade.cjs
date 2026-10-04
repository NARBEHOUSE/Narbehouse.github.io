// Run: node scripts/check-scan-upgrade.cjs
// Manual isolated fixture: node scripts/check-scan-upgrade.cjs --preview
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts/scan-upgrade');
const preview = process.argv.includes('--preview');
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let file;
    if (!relative || relative === 'fixture') file = path.join(root, 'tests/fixtures/scan-upgrade.html');
    else {
      if (!relative.startsWith('bennyshub/') || relative.split(/[\\/]/).some(part => part === '..' || part.startsWith('.'))) throw Error('Not public');
      file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) throw Error('Not public');
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      if (!(await fs.realpath(file)).startsWith(root + path.sep)) throw Error('Not public');
    }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
      '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
      '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await fs.readFile(file));
  } catch (_) { res.writeHead(404); res.end('Not found'); }
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(preview ? 4174 : 0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  if (preview) { console.log('Isolated shared scan fixture: ' + base + '/fixture'); return; }
  await fs.mkdir(artifacts, { recursive: true });
  const channel = process.argv.find(arg => arg.startsWith('--browser='))?.slice(10);
  const executablePath = process.argv.find(arg => arg.startsWith('--browser-path='))?.slice(15);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : channel ? { channel } : {}) });
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await context.addInitScript(() => {
    let active;
    const speech = {
      speaking: false, getVoices: () => [{ name: 'Fixture English', lang: 'en-US' }],
      addEventListener() {}, removeEventListener() {},
      cancel() { active = null; this.speaking = false; },
      speak(utterance) {
        active = utterance; this.speaking = true; utterance.onstart?.();
        setTimeout(() => { if (active === utterance) { this.speaking = false; utterance.onend?.(); } }, 350);
      }
    };
    Object.defineProperty(window, 'speechSynthesis', { value: speech });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto(base + '/fixture');
  await page.evaluate(() => NarbeVoiceManager.updateSettings({ ttsEnabled: false }));
  const state = () => page.evaluate(() => controller.getState());
  const tap = async key => {
    await page.keyboard.down(key); await page.clock.runFor(1); await page.keyboard.up(key); await page.clock.runFor(60);
  };
  await tap('Enter'); assert.deepEqual(await page.evaluate(() => selections), []);
  for (const expected of [0, 1, -1]) { await tap('Space'); assert.equal((await state()).index, expected); }
  // A press blocked by the shared guard consumes its matching release.
  await page.keyboard.down('Space'); await page.keyboard.up('Space');
  const beforeBounce = (await state()).index;
  await page.keyboard.down('Space'); await page.keyboard.up('Space');
  assert.equal((await state()).index, beforeBounce);
  await page.clock.runFor(60);

  await page.evaluate(() => NarbeScanManager.updateSettings({ autoScan: true, scanSpeedIndex: 0 }));
  await page.clock.runFor(1000); assert.equal((await state()).index, 0);
  await tap('Space'); assert.equal((await state()).braked, true);
  await page.clock.runFor(5000); assert.equal((await state()).index, 0);
  assert.equal(await page.locator('.choice.active').textContent(), 'Alpha');
  assert.equal(await page.locator('.narbe-scan-status-badge').textContent(), 'Paused');

  for (const theme of ['light', 'dark', 'contrast']) {
    await page.emulateMedia({ colorScheme: theme === 'dark' ? 'dark' : 'light', forcedColors: theme === 'contrast' ? 'active' : 'none' });
    const badge = await page.locator('.narbe-scan-status-badge').boundingBox();
    for (const choice of await page.locator('.choice').all()) {
      const item = await choice.boundingBox();
      assert.ok(badge.y >= item.y + item.height, 'reserved badge slot must not overlap a choice');
    }
    await page.screenshot({ path: path.join(artifacts, 'paused-' + theme + '.png') });
  }
  await tap('Space'); await page.clock.runFor(900); assert.equal((await state()).index, 0);
  await page.clock.runFor(100); assert.equal((await state()).index, 1);
  await page.evaluate(() => {
    NarbeScanManager.updateSettings({ parking: 'chosen' });
    controller.open([{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Bravo' }]);
  });
  await tap('Enter'); assert.equal((await state()).parked, true);
  assert.equal(await page.locator('.choice.active').count(), 0);
  await page.screenshot({ path: path.join(artifacts, 'parked-contrast.png') });
  await tap('Enter'); assert.equal((await state()).index, 0);
  assert.deepEqual(await page.evaluate(() => selections), []);

  // Real iframe transport, without shared object mocks.
  await page.evaluate(() => {
    const iframe = document.createElement('iframe'); iframe.src = '/fixture?child=1'; iframe.id = 'child';
    document.body.appendChild(iframe);
  });
  const child = page.frameLocator('#child');
  await child.locator('h1').waitFor();
  const childFrame = page.frames().find(frame => frame.url().includes('child=1'));
  await childFrame.evaluate(() => NarbeScanManager.updateSettings({ loopsBeforeParking: 3, waitForSpeech: true }));
  await page.waitForFunction(() => NarbeScanManager.getSettings().loopsBeforeParking === 3);
  await page.evaluate(() => NarbeScanManager.updateSettings({ parking: 'auto', spaceBrake: false }));
  await childFrame.waitForFunction(() => NarbeScanManager.getSettings().parking === 'auto' && !NarbeScanManager.getSettings().spaceBrake);
  await page.reload();
  assert.equal(await page.evaluate(() => NarbeScanManager.getSettings().waitForSpeech), true);
  assert.deepEqual(errors, []);
  await context.close();

  // All existing routes still load their shared managers. No controller is
  // created in these apps until a later conversion stage.
  const smoke = await browser.newContext({ serviceWorkers: 'block' });
  const engineUrls = new Set([
    'https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js',
    'https://unpkg.com/three@0.128.0/examples/js/loaders/OBJLoader.js'
  ]);
  await smoke.route('**/*', route => new URL(route.request().url()).origin === base || engineUrls.has(route.request().url()) ? route.continue() : route.abort());
  const appPage = await smoke.newPage(), routes = ['/bennyshub/index.html'];
  for (const group of ['games', 'tools']) {
    const catalog = JSON.parse(await fs.readFile(path.join(root, 'bennyshub/apps', group, group + '.json'), 'utf8'));
    routes.push(...catalog[group].map(item => '/bennyshub/' + item.path.replace(/^\.\//, '')));
  }
  routes.push('/bennyshub/apps/games/BENNYSMINIGOLF/index.html', '/bennyshub/apps/games/NARBEKART/tools/ui_mock.html');
  const smokeErrors = [], checked = [], failedRequests = [];
  appPage.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  appPage.on('pageerror', error => smokeErrors.push({ route: appPage.url(), error: error.message }));
  for (const route of routes) {
    await appPage.goto(base + route, { waitUntil: 'domcontentloaded' });
    await appPage.waitForFunction(() => window.NarbePlatform && window.NarbeScanManager && window.NarbeVoiceManager);
    await appPage.waitForTimeout(100);
    assert.equal(await appPage.locator('.narbe-scan-status-badge').count(), 0);
    checked.push(route);
  }
  const deniedEngines = new Set(failedRequests.filter(item => item.error === 'net::ERR_NETWORK_ACCESS_DENIED' && engineUrls.has(item.url)).map(item => item.url));
  const blockedStartup = smokeErrors.filter(item => {
    const route = new URL(item.route).pathname;
    return (deniedEngines.has('https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js') &&
      /\/(BENNYSBASEBALL2|BENNYSFOOTBALL|BENNYSSHOWNSOUND)\//.test(route) && /^(Phaser|BaseballScene) is not defined$/.test(item.error)) ||
      (deniedEngines.has('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js') &&
      route.includes('/BENNYSBASKETBALLSHOOTER/') && item.error === 'THREE is not defined');
  });
  const unexpectedErrors = smokeErrors.filter(item => !blockedStartup.includes(item));
  await fs.writeFile(path.join(artifacts, 'browser-report.json'), JSON.stringify({ fixture: 'passed', sharedManagersLoaded: checked.length, routes: checked, errors: smokeErrors, blockedStartup, failedRequests }, null, 2));
  assert.deepEqual(unexpectedErrors, []);
  if (!process.argv.includes('--allow-blocked-cdn')) assert.deepEqual(blockedStartup, []);
  await smoke.close();
  console.log('Shared browser fixture passed: real switch events, iframe sync, persistence, light/dark/contrast badge without overlap.');
  console.log('Shared managers loaded on ' + checked.length + ' web routes; no automatic scanner activation.');
  console.log('Unexpected page errors: ' + unexpectedErrors.length + '. Startup checks blocked by denied CDN access: ' + new Set(blockedStartup.map(item => item.route)).size + '.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (!preview || process.exitCode) server.close();
});
