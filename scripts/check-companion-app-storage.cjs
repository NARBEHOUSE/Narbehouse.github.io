/* Real unpacked-Companion acceptance check. All data/profile files are synthetic. */
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const option = name => process.argv[process.argv.indexOf(name) + 1];
const base = (process.argv.includes('--base') ? option('--base') : process.env.HUB_TEST_ORIGIN || 'http://127.0.0.1:4173').replace(/\/$/, '');
const executablePath = process.argv.includes('--browser-path') ? option('--browser-path') : process.env.HUB_TEST_BROWSER_PATH ||
  (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined);
const artifacts = path.join(root, 'artifacts', 'journal-companion-storage');
const run = path.join(artifacts, 'acceptance-' + Date.now());
const extension = path.join(run, 'extension');
const profile = path.join(run, 'profile');
const checks = [], errors = [], unexpectedDialogs = [], fileChoosers = [];
const prefix = 'benny-web:v1:streaming.';
const paths = Object.fromEntries(['journal', 'keyboard', 'streaming', 'dayhub'].map(app => [app, '/bennyshub/apps/tools/' + app + '/index.html']));
let context, page, phase = 'setup';

function passed(message) { checks.push(message); console.log('PASS ' + message); }
async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    headless: true, acceptDownloads: true, viewport: { width: 1280, height: 900 },
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension]
  });
  await context.route('**/___vscode_livepreview_injected_script', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  // Keep test data on this machine and avoid live feeds/provider accounts.
  await context.route(/^https:\/\//, route => route.abort());
  context.on('page', trackPage);
  page = await context.newPage();
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  assert.match(worker.url(), /^chrome-extension:\/\//);
}
function trackPage(target) {
  target.on('pageerror', error => errors.push({ phase, url: target.url(), message: error.message, stack: error.stack }));
  target.on('dialog', async dialog => { unexpectedDialogs.push({ phase, type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  target.on('filechooser', () => fileChoosers.push(phase));
}
async function app(appName) {
  await page.goto(base + paths[appName]);
  await page.waitForFunction(() => window.BennyExtension?.supports('journal-storage-v1') && BennyExtension.supports('app-storage-v1'), {}, { timeout: 20000 });
  if (appName === 'journal') await expect(page.locator('#mainMenu [data-action="entries"]')).toBeEnabled();
  if (appName === 'keyboard') await page.waitForFunction(() => window.predictionSystem?.dataLoaded);
  if (appName === 'streaming') await page.waitForFunction(() => typeof allData !== 'undefined');
  if (appName !== 'journal') await page.evaluate(name => BennyAppStorage.ready(name), appName);
  await page.evaluate(() => { NarbeVoiceManager?.updateSettings({ ttsEnabled: false }); NarbeScanManager?.setAutoScan(false); });
}
async function dataPage() {
  await page.goto(base + '/bennyshub/data-settings.html');
  await expect(page.getByRole('button', { name: 'Export Journal', exact: true })).toBeEnabled({ timeout: 20000 });
  for (const label of ['Keyboard', 'Streaming', 'Day Hub']) await expect(page.getByRole('button', { name: 'Export ' + label, exact: true })).toBeEnabled();
}
async function snapshot() {
  return page.evaluate(async () => ({
    journal: await BennyJournalStorage.read(),
    keyboard: await BennyAppStorage.read('keyboard'),
    streaming: await BennyAppStorage.read('streaming'),
    dayhub: await BennyAppStorage.read('dayhub')
  }));
}
async function step(key) { await page.waitForTimeout(230); await page.keyboard.press(key, { delay: 80 }); }
async function journalType(text) {
  for (const char of text) await page.locator('#keyboard').getByRole('button', { name: char, exact: true }).click();
  await expect(page.locator('#textBar')).toHaveText(text + '|');
  await expect.poll(() => page.evaluate(() => BennyJournalStorage.read().then(value => value.draft?.answer))).toBe(text);
}
async function verifyApps(expected, label) {
  await app('journal');
  await page.locator('#mainMenu [data-action="entries"]').click();
  for (const entry of expected.journal.entries) await expect(page.locator('#entriesList')).toContainText(entry.answer);
  await expect(page.locator('[data-action="add-entry"]')).toHaveText('Continue Entry');
  await page.locator('[data-action="add-entry"]').click();
  await expect(page.locator('#textBar')).toHaveText(expected.journal.draft.answer + '|');
  await app('keyboard');
  assert.deepEqual(await page.evaluate(() => predictionSystem.userData), expected.keyboard.values.userKeyboardData);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kb_settings')).theme), expected.keyboard.values.kb_settings.theme);
  await app('streaming');
  assert.deepEqual(await page.evaluate(() => WebStreaming.getData()), expected.streaming.values[prefix + 'catalog']);
  await page.locator('#btn-browse').click();
  for (const item of expected.streaming.values[prefix + 'catalog']) await expect(page.locator('#items-grid')).toContainText(item.title);
  await app('dayhub');
  await expect(page.locator('#weatherLocationLine')).toContainText(expected.dayhub.values.dayhub_weather_web_v2.label);
  passed(label);
}

(async () => {
  await fs.mkdir(run, { recursive: true });
  await fs.cp(path.join(root, 'extension'), extension, { recursive: true });
  assert.equal(JSON.parse(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8')).version, '1.0.8');
  await launch();
  phase = 'legacy migration';
  const seeded = {
    'benny-web:v1:journal.entries': [{ id: 12, date: new Date().toISOString(), question: 'Synthetic migration', answer: 'A saved legacy journal entry.' }],
    userKeyboardData: { frequent_words: { STARLIGHTQA: { count: 3, last_used: new Date().toISOString() } }, bigrams: {}, trigrams: {} },
    kb_settings: { autocapI: true, theme: 'blue', scanSpeed: 'medium', highlightColor: 'pink', autoScan: false },
    [prefix + 'catalog']: [{ id: 'synthetic-one', title: 'Synthetic library item', url: 'https://www.youtube.com/watch?v=abcdefghijk', type: 'movies', genre: 'Family' }],
    [prefix + 'episodes']: {},
    [prefix + 'searchHistory']: ['Synthetic library item'],
    dayhub_weather_web_v2: { lat: 40.5, lon: -74, label: 'Synthetic Town' }
  };
  await context.route(base + '/bennyshub/storage-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic storage fixture</title>' }));
  await page.goto(base + '/bennyshub/storage-fixture');
  await page.evaluate(values => { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value)); }, seeded);
  for (const name of ['journal', 'keyboard', 'streaming', 'dayhub']) await app(name);
  await dataPage();
  const migrated = await snapshot();
  for (const name of ['journal', 'keyboard', 'streaming', 'dayhub']) assert.equal(migrated[name].mode, 'companion');
  assert.equal(migrated.journal.entries[0].answer, seeded['benny-web:v1:journal.entries'][0].answer);
  assert.deepEqual(migrated.keyboard.values.userKeyboardData, seeded.userKeyboardData);
  assert.deepEqual(migrated.streaming.values[prefix + 'catalog'], seeded[prefix + 'catalog']);
  assert.deepEqual(migrated.dayhub.values.dayhub_weather_web_v2, seeded.dayhub_weather_web_v2);
  passed('All four apps migrate existing website data to real Companion storage');

  phase = 'normal accessible journal use';
  await app('journal');
  await expect(page.locator('#mainMenu .highlighted')).toHaveCount(0);
  await step('Space'); await expect(page.locator('#mainMenu [data-action="entries"]')).toHaveClass(/highlighted/);
  await step('Space'); await step('Space'); await step('Space');
  await expect(page.locator('#mainMenu .highlighted')).toHaveCount(0);
  await step('Enter'); await expect(page.locator('#mainMenu')).toHaveClass(/active/);
  await step('Space'); await step('Enter');
  await expect(page.locator('#entriesScreen')).toHaveClass(/active/);
  await step('Space'); await step('Space'); await step('Enter');
  await expect(page.locator('#keyboardScreen')).toHaveClass(/active/);
  await journalType('HI');
  await page.locator('#keyboard .send').click();
  await expect(page.locator('#entriesList')).toContainText('HI');
  await page.locator('[data-action="add-entry"]').click();
  await journalType('BY');
  await page.reload();
  await page.waitForFunction(() => window.BennyExtension?.supports('journal-storage-v1'));
  await page.locator('#mainMenu [data-action="entries"]').click();
  await expect(page.locator('[data-action="add-entry"]')).toHaveText('Continue Entry');
  await page.locator('[data-action="add-entry"]').click();
  await expect(page.locator('#textBar')).toHaveText('BY|');
  assert.equal(fileChoosers.length, 0);
  passed('Journal saves a real entry and unfinished draft without file dialogs; manual switch menus retain recurring blank -1');

  phase = 'other app updates';
  await app('keyboard');
  await page.evaluate(async () => { predictionSystem.recordLocalWord('MOONLIGHTQA'); await BennyAppStorage.flush('keyboard'); });
  await expect.poll(() => page.evaluate(() => BennyAppStorage.read('keyboard').then(value => !!value.values.userKeyboardData.frequent_words.MOONLIGHTQA))).toBe(true);
  await app('dayhub');
  await page.locator('#btnSettings').click();
  await page.locator('#settingsLabel').fill('Saved Synthetic Town');
  await page.locator('#settingsSaveWeatherBtn').click();
  await page.locator('#settingsCloseBtn').click();
  await page.evaluate(() => BennyAppStorage.flush('dayhub'));
  await expect(page.locator('#weatherLocationLine')).toContainText('Saved Synthetic Town');
  await page.goto(base + '/bennyshub/apps/tools/streaming/editor.html');
  await page.waitForFunction(() => window.BennyExtension?.supports('app-storage-v1'));
  await expect(page.locator('.item-checkbox')).toHaveCount(1);
  await page.locator('.main-accordion').first().click();
  await page.locator('#title').fill('Second synthetic item');
  await page.locator('#url').fill('https://www.youtube.com/watch?v=lmnopqrstuv');
  await page.locator('#genre').fill('Family');
  await page.locator('#save-btn').click();
  await expect(page.locator('.item-checkbox')).toHaveCount(2);
  await page.evaluate(() => BennyAppStorage.flush('streaming'));
  await dataPage();
  let expected = await snapshot();
  assert.equal(expected.journal.entries.length, 2);
  assert.equal(expected.journal.draft.answer, 'BY');
  assert.ok(expected.keyboard.values.userKeyboardData.frequent_words.MOONLIGHTQA);
  assert.equal(expected.dayhub.values.dayhub_weather_web_v2.label, 'Saved Synthetic Town');
  assert.equal(expected.streaming.values[prefix + 'catalog'].length, 2);
  passed('Keyboard learning, Day Hub settings and Streaming editor changes persist through real app adapters');

  phase = 'website data clearing';
  await page.evaluate(() => localStorage.clear());
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  await verifyApps(expected, 'All four actual apps restore their saved data after website localStorage is cleared');

  phase = 'caregiver backups';
  await dataPage();
  const exports = {};
  for (const [name, label] of [['keyboard', 'Keyboard'], ['journal', 'Journal'], ['streaming', 'Streaming'], ['dayhub', 'Day Hub']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export ' + label, exact: true }).click();
    const output = await download, file = path.join(run, name + '-backup.json');
    await output.saveAs(file);
    const backup = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(backup.app, name);
    if (name === 'journal') { assert.equal(backup.entries.length, 2); assert.equal(backup.draft.answer, 'BY'); }
    else assert.deepEqual(backup.data, expected[name].values);
    exports[name] = file;
  }
  await expect(page.locator('#journal-last-export')).toContainText('Last backup export');
  for (const [name, label] of [['keyboard', 'Keyboard'], ['journal', 'Journal'], ['streaming', 'Streaming'], ['dayhub', 'Day Hub']]) {
    await page.getByRole('button', { name: 'Clear ' + label, exact: true }).click();
    await expect(page.locator('#confirm')).toBeVisible();
    await page.locator('#erase').click();
    await expect(page.locator('#confirm')).toBeHidden();
    const afterClear = await snapshot();
    for (const other of ['keyboard', 'journal', 'streaming', 'dayhub'].filter(appName => appName !== name)) {
      if (other === 'journal') {
        assert.deepEqual(afterClear.journal.entries.map(entry => [entry.question, entry.answer]), expected.journal.entries.map(entry => [entry.question, entry.answer]));
        assert.equal(afterClear.journal.draft?.answer, expected.journal.draft?.answer);
      } else assert.deepEqual(afterClear[other].values, expected[other].values);
    }
    if (name === 'journal') {
      assert.equal((await page.evaluate(() => BennyJournalStorage.read())).entries.length, 0);
      await page.locator('#journal-import').setInputFiles(exports[name]);
      await expect(page.locator('#status')).toContainText('Journal backup restored');
    } else {
      assert.deepEqual((await page.evaluate(app => BennyAppStorage.read(app), name)).values, {});
      const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: label, exact: true }) });
      await card.locator('input[type=file]').setInputFiles(exports[name]);
      await expect(page.locator('#restore-confirm')).toBeVisible();
      await page.locator('#restore-apply').click();
      await expect(page.locator('#restore-confirm')).toBeHidden();
      await expect(page.locator('#status')).toContainText(label + ' data restored');
    }
  }
  const restored = await snapshot();
  assert.deepEqual(restored.journal.entries.map(e => [e.question, e.answer]), expected.journal.entries.map(e => [e.question, e.answer]));
  assert.equal(restored.journal.draft.answer, expected.journal.draft.answer);
  for (const name of ['keyboard', 'streaming', 'dayhub']) assert.deepEqual(restored[name].values, expected[name].values);
  expected = restored;
  await page.screenshot({ path: path.join(artifacts, 'real-data-settings-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(artifacts, 'real-data-settings-mobile.png'), fullPage: true });
  passed('My data exports, clears and restores all four app backups through actual Companion storage');

  phase = 'browser restart';
  await context.close(); context = null;
  await launch();
  // Exercise a cold-start delay so controls cannot navigate before Journal finishes initialization.
  await context.route('**/apps/tools/journal/questions.json', async route => {
    await new Promise(resolve => setTimeout(resolve, 400));
    await route.continue();
  });
  await verifyApps(expected, 'Companion 1.0.8 preserves all four libraries and the unfinished journal draft across browser restart');
  await dataPage();
  const afterRestart = await snapshot();
  assert.equal(afterRestart.journal.mode, 'companion');
  for (const name of ['keyboard', 'streaming', 'dayhub']) assert.equal(afterRestart[name].mode, 'companion');
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedDialogs, []);
  assert.deepEqual(fileChoosers.filter(value => value !== 'caregiver backups'), []);
  passed('No page errors, unexpected dialogs or file pickers during ordinary app use');
  const report = { base, extensionVersion: '1.0.8', isolatedProfile: profile, checks, errors, unexpectedDialogs, fileChoosers };
  await fs.writeFile(path.join(artifacts, 'real-companion-storage-report.json'), JSON.stringify(report, null, 2));
  console.log('Companion storage acceptance passed: ' + checks.length + ' groups.');
})().catch(async error => {
  console.error('FAILED during ' + phase, error);
  await fs.mkdir(artifacts, { recursive: true });
  const storage = await page?.evaluate(async () => ({
    local: Object.fromEntries(Object.keys(localStorage).filter(key => /companion|kb_settings/.test(key)).map(key => [key, localStorage.getItem(key)])),
    remoteKeyboard: await BennyExtension.request('APP_DATA_READ', { app: 'keyboard' }, 2000).catch(error => ({ error: error.message }))
  })).catch(() => null);
  await fs.writeFile(path.join(artifacts, 'real-companion-storage-failure.json'), JSON.stringify({ phase, message: error.message, checks, errors, unexpectedDialogs, fileChoosers, profile, storage }, null, 2));
  await page?.screenshot({ path: path.join(artifacts, 'real-companion-storage-failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
}).finally(async () => { await context?.close(); });
