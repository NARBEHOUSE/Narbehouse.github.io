const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.HUB_TEST_ORIGIN || 'http://127.0.0.1:4173';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HUB_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], addEventListener() {}, removeEventListener() {}, cancel() {}, speak(u) { u.onstart?.(); u.onend?.(); } } });
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/bennyshub/');
    await page.waitForFunction(() => appsData.games.length > 9);
    await page.locator('#modal-cancel').click();
    await page.locator('#screen-home [data-target="games"]').click();
    await page.waitForFunction(() => !isTransitioning);
    const fixtures = await page.evaluate(() => {
      const alphabetical = appsData.games.slice().sort((a, b) => a.title.localeCompare(b.title));
      return { frequent: alphabetical.at(-1), recent: alphabetical.at(-2) };
    });
    // Use the actual launch boundary, replacing frame content only so game startup cannot affect these UI checks.
    await page.route('**/apps/games/**/index.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Game fixture</title>' }));
    for (const game of [fixtures.frequent, fixtures.frequent, fixtures.recent]) {
      await page.evaluate(app => showIframe(app.path, app.title), game);
      await page.locator('#iframe-back').click();
    }
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('narbe-hub-library')).usage['games:' + appsData.games.slice().sort((a, b) => a.title.localeCompare(b.title)).at(-1).id].count), 2);
    await page.locator('#games-next').click();
    await page.locator('#games-sort-btn').click();
    assert.equal(await page.locator('#games-sort-btn').textContent(), 'Sort: Recently used');
    assert.match(await page.locator('#games-page-info').textContent(), /^Page 1 of [1-9][0-9]*$/);
    assert.equal(await page.locator('#games-grid .app-btn').first().getAttribute('data-path'), fixtures.recent.path);
    assert.equal(await page.evaluate(() => hubMenuScanner.getState().id), 'games-sort-btn');
    await page.locator('#games-sort-btn').click();
    assert.equal(await page.locator('#games-sort-btn').textContent(), 'Sort: Most played');
    assert.equal(await page.locator('#games-grid .app-btn').first().getAttribute('data-path'), fixtures.frequent.path);
    await page.evaluate(genre => { filterState.games.genre = genre; filterState.games.page = 0; renderAppsGrid('games'); }, fixtures.frequent.genres[0]);
    assert.equal(await page.locator('#games-grid .app-btn').first().getAttribute('data-path'), fixtures.frequent.path);
    await page.locator('#screen-games .backbtn').click();
    await page.locator('#screen-home [data-target="tools"]').click();
    await page.locator('#tools-sort-btn').click();
    await page.locator('#tools-sort-btn').click();
    assert.equal(await page.locator('#tools-sort-btn').textContent(), 'Sort: Most used');
    await page.reload();
    await page.waitForFunction(() => appsData.games.length > 9);
    await page.locator('#modal-cancel').click();
    await page.locator('#screen-home [data-target="games"]').click();
    await page.waitForFunction(() => !isTransitioning);
    assert.equal(await page.locator('#games-sort-btn').textContent(), 'Sort: Most played');
    assert.equal(await page.locator('#games-grid .app-btn').first().getAttribute('data-path'), fixtures.frequent.path);
    // The sort toggle participates in the existing switch scanner, including reverse hold.
    await page.locator('#games-sort-btn').focus();
    await page.keyboard.down('Enter');
    await page.waitForTimeout(3100);
    await page.keyboard.up('Enter');
    assert.equal(await page.locator('#games-sort-btn').textContent(), 'Sort: Recently used');
    assert.equal(await page.evaluate(() => hubMenuScanner.getState().id), 'games-sort-btn');
    await context.setOffline(true);
    await page.evaluate(app => showIframe(app.path, app.title), fixtures.frequent);
    await page.locator('#iframe-back').click();
    assert.equal(await page.locator('#games-grid .app-btn').first().getAttribute('data-path'), fixtures.frequent.path);
    await context.setOffline(false);
    await page.locator('#games-reset-btn').click();
    assert.equal(await page.locator('#games-sort-btn').textContent(), 'Sort: A–Z');
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('narbe-hub-library')).usage).length), 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#games-sort-btn').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const artifact = path.resolve(__dirname, '../artifacts/hub-library');
    await fs.mkdir(artifact, { recursive: true });
    await page.screenshot({ path: path.join(artifact, 'sort-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS launch counts, recent/most-used ordering before pagination, genre combination, persistence, independent catalogs, switch reverse hold/focus, offline recording, reset, mobile layout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
