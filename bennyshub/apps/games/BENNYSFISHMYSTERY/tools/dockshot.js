/**
 * Screenshots of the dock with each vessel, and of fishing off the boards -
 * the quick way to LOOK at a framing change without playing to it.
 *
 *     python -m http.server 8765 --bind 127.0.0.1      (from bennyshub/)
 *     node tools/dockshot.js [outDir]
 *
 * Same headless Chrome + puppeteer-core setup as tools/browsertest.js.
 */
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] || path.join(process.env.TEMP || '.', 'fishmaster-dockshot');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.FM_URL || 'http://127.0.0.1:8765/apps/games/BENNYSFISHMYSTERY/index.html';
const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
           '--window-size=1280,720', '--mute-audio'],
    defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('uncaught: ' + (e.stack || e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('loading').style.display === 'none', { timeout: 30000 });
  await sleep(800);
  // Straight to the dock, the way Play Game does.
  await page.keyboard.press('Enter'); await sleep(1800);
  await page.screenshot({ path: path.join(OUT, 'dock_foot.png') });
  // Hear Walt out (the net changes hands), then fish off the boards - and scoop once.
  await page.evaluate(() => { RT.game.takeCounterBeat(); RT.game.goToDock(); }); await sleep(600);
  await page.evaluate(() => RT.game.castOff()); await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'fishing_foot.png') });
  await page.evaluate(() => RT.game.startAim()); await sleep(380);
  await page.screenshot({ path: path.join(OUT, 'scoop_foot.png') });
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, 'scoop_card.png') });
  await page.evaluate(() => RT.game.returnToDock()); await sleep(600);
  for (const v of ['canoe', 'kayak', 'motorboat']) {
    await page.evaluate((id) => { RT.game.getSave().money = 5000; RT.game.buyVessel(id); RT.game.goToDock(); }, v);
    await sleep(1600);
    await page.screenshot({ path: path.join(OUT, 'dock_' + v + '.png') });
    await page.evaluate(() => RT.game.castOff()); await sleep(400);
    await page.keyboard.down('Enter'); await sleep(1800); await page.keyboard.up('Enter'); await sleep(1200);
    await page.screenshot({ path: path.join(OUT, 'underway_' + v + '.png') });
    await page.evaluate(() => RT.game.returnToDock()); await sleep(500);
  }
  console.log('screenshots in ' + OUT);
  console.log(errors.length ? 'ERRORS:\n  ' + errors.join('\n  ') : 'no page errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
