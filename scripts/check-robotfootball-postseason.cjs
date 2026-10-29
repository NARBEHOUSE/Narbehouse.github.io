'use strict';
// node scripts/check-robotfootball-postseason.cjs [--root <web-project>] [--output <artifacts>]
// A fresh browser downloads the scoped library before the first Robot Football launch.
// All subsequent progression, save/reload and presentation checks run offline in the real Hub iframe.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const argument = (name, fallback) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const root = path.resolve(argument('--root', path.join(__dirname, '..')));
const out = path.resolve(argument('--output', path.join(root, 'artifacts/robotfootball-postseason')));
const { chromium } = require(path.join(root, 'node_modules/@playwright/test'));
const { createOfflineManifest } = require(path.join(root, 'scripts/offline-manifest.cjs'));
fs.mkdirSync(out, { recursive: true });
const report = { fixture: 'Fresh current-source Hub/shared/catalog library plus Robot Football; other game/tool trees excluded. No game opened before download. 1024 by 768 touch viewport in desktop Chrome; physical tablet testing pending.', checks: [], errors: [], screenshots: [], passed: false };
const saveReport = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const pass = label => { report.checks.push(label); saveReport(); console.log('PASS ' + label); };
async function runPage({ js, load, captureImage }) {
  const until = async (code, label, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await js(code)) return; await wait(50); }
    assert.fail('Timed out: ' + label);
  };
  const quiet = () => js("NarbeVoiceManager.speak=()=>{}; RobotFootball.prefs.mode='advanced'; RobotFootball.prefs.sound=false; RobotFootball.prefs.kickoffs=false; void 0");
  const loaded = async () => { await until("!!window.RobotFootball && RobotFootball.screen==='main'", 'game loaded'); await quiet(); };
  const reload = async () => { await load(); await loaded(); };
  const check = async (label, code) => { assert.ok(await js(code), label); report.checks.push(label); saveReport(); };
  const buttons = "[...document.querySelectorAll('#menu-items button')].filter(b=>!b.closest('[hidden]')).map(b=>b.querySelector('.name')?.textContent.trim())";
  const hasButton = name => buttons + '.includes(' + JSON.stringify(name) + ')';
  const visibleAction = name => "(()=>{const b=[...document.querySelectorAll('#menu-items button')].find(b=>b.querySelector('.name')?.textContent.trim()===" + JSON.stringify(name) + ");if(!b)return false;const r=b.getBoundingClientRect(),m=document.querySelector('#menu-shell').getBoundingClientRect();return r.top>=Math.max(0,m.top)&&r.bottom<=Math.min(innerHeight,m.bottom)&&r.left>=0&&r.right<=innerWidth;})()";
  const click = async name => {
    const found = await js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.closest('[hidden]')&&(b.querySelector('.name')?.textContent||b.textContent).trim()===" + JSON.stringify(name) + "); if(!b)return false;b.click();return true;})()");
    assert.ok(found, 'Visible action: ' + name); await wait(100);
  };
  const capture = async name => { await wait(250); fs.writeFileSync(path.join(out, name + '.png'), await captureImage()); report.screenshots.push(name + '.png'); saveReport(); };
  const seed = async (wins, losses) => {
    await js("(()=>{const r=RobotFootball;r.season.start('blue');for(let i=0;i<" + (wins + losses) + ";i++)r.season.recordResult(i<" + wins + "?21:7,i<" + wins + "?7:21,r.season.data.matchId);localStorage.removeItem('bennys-stadium-season-match-v1');})()");
    await reload();
  };
  const finish = async winGame => {
    await js("(()=>{const r=RobotFootball,s=r.sim;s.s.homeScore=" + (winGame ? 21 : 7) + ";s.s.awayScore=" + (winGame ? 7 : 21) + ";s.s.quarter=4;s.s.timeRemaining=0;s._advancePeriod();r.resume();})()");
    await until("RobotFootball.sim.s.phase==='final' && !document.querySelector('#overlay').hidden", 'final screen');
  };
  const startRegularFinal = async () => { await click('Continue season'); await click('Play next game'); };
  try {
    await reload();
    const normalCrowd = await js('RobotFootball.renderer.crowdMeshes[0].count');
    await seed(13, 2); await startRegularFinal();
    await js("document.querySelector('#menu-shell').scrollTop=10000;void 0");
    await finish(true);
    await check('14–2 regular-season finish opens playoffs instead of ending the season', "RobotFootball.season.data.wins===14 && RobotFootball.season.data.losses===2 && RobotFootball.season.data.stage==='playoffs' && RobotFootball.season.isActive()");
    await check('The final-game primary action says Continue playoffs', hasButton('Continue playoffs'));
    await check('Tablet final shows Continue playoffs without scrolling', visibleAction('Continue playoffs'));
    await check('Opening the final screen resets the old menu scroll', "document.querySelector('#menu-shell').scrollTop===0");
    await capture('tablet-14-2-final');
    await check('Game 16 is recorded once and its checkpoint cleared', "RobotFootball.season.data.results.length===16 && localStorage.getItem('bennys-stadium-season-match-v1')===null");
    await js('RobotFootball.resume();void 0');
    await check('Revisiting the final screen does not consume a playoff game', "RobotFootball.season.data.results.length===16 && RobotFootball.season.data.playoffRound===0");
    await click('Main menu'); await check('Main menu identifies the playoff continuation', hasButton('Continue playoffs'));
    await check('Tablet main menu shows Continue playoffs without scrolling', visibleAction('Continue playoffs'));
    await capture('14-2-main-menu');
    await reload(); await check('14–2 playoff continuation survives reload', hasButton('Continue playoffs'));
    await click('Continue playoffs'); await check('Wild Card is playable after game 16', hasButton('Play Wild Card'));
    await check('Tablet playoff dashboard shows Play Wild Card without scrolling', visibleAction('Play Wild Card'));
    await click('Schedule & results'); await js("document.querySelector('#menu-shell').scrollTop=10000;void 0");
    await check('Schedule can be scrolled down on a tablet', "document.querySelector('#menu-shell').scrollTop>0");
    await click('Back to season');
    await check('Returning from a scrolled schedule resets the dashboard scroll', "document.querySelector('#menu-shell').scrollTop===0");
    await check('Wild Card stays visible after returning from the schedule', visibleAction('Play Wild Card'));
    await capture('wild-card-dashboard');
    await click('Play Wild Card'); await check('Wild Card uses a four-quarter game', "RobotFootball.sim.options.format==='regulation' && RobotFootball.sim.s.quarter===1");
    await js('RobotFootball.pause();void 0'); await click('Main menu'); await reload(); await click('Continue playoffs');
    await check('An unfinished playoff game can resume', buttons + ".some(n=>/^Resume/.test(n))");
    const resumePlayoff = await js(buttons + ".find(n=>/^Resume/.test(n))"); await click(resumePlayoff); await finish(true);
    await check('A Wild Card win advances to Conference while keeping the regular record', "RobotFootball.season.data.stage==='playoffs' && RobotFootball.season.data.playoffRound===1 && RobotFootball.season.data.wins===14 && RobotFootball.season.data.results.length===17");
    await click('Continue playoffs'); await click('Play Conference'); await finish(true);
    await check('Conference win offers Continue championship', hasButton('Continue championship'));
    await click('Main menu'); await check('Main menu identifies the championship continuation', hasButton('Continue championship'));
    await reload(); await check('Championship continuation survives reload', hasButton('Continue championship'));
    await click('Continue championship'); await check('Championship game is ready after two playoff wins', hasButton('Play championship'));
    await check('Tablet championship dashboard shows Play championship without scrolling', visibleAction('Play championship'));
    await capture('championship-dashboard'); await click('Play championship');
    await until("RobotFootball.renderer.matchTheme==='championship'", 'championship stadium');
    await check('Championship adds a larger crowd and visible celebration decorations', "RobotFootball.renderer.championshipDecor.visible && RobotFootball.renderer.crowdMeshes[0].count>" + normalCrowd);
    const graphicsChoice = await js('RobotFootball.renderer.graphics.get().choice');
    await js("RobotFootball.renderer.graphics.setChoice('low');void 0");
    await until("RobotFootball.renderer.crowdMeshes[0].count===" + normalCrowd, 'Low crowd budget');
    await check('Low graphics keeps championship decorations with the regular crowd budget', "RobotFootball.renderer.matchTheme==='championship' && RobotFootball.renderer.championshipDecor.visible && RobotFootball.renderer.crowdMeshes[0].count===" + normalCrowd);
    await js('RobotFootball.renderer.graphics.setChoice(' + JSON.stringify(graphicsChoice) + ');void 0');
    await js('RobotFootball.pause();void 0'); await click('Main menu'); await reload(); await click('Continue championship');
    await check('A saved championship explicitly offers Resume championship', hasButton('Resume championship'));
    await click('Resume championship'); await until("RobotFootball.renderer.matchTheme==='championship'", 'resumed championship theme');
    await capture('championship-playbook');
    await click('Inside run');
    await capture('championship-field');
    await finish(true);
    await check('The championship win finishes the season as champions', "RobotFootball.season.data.stage==='champions' && !RobotFootball.season.isActive() && RobotFootball.season.data.results.length===19");
    await until("RobotFootball.renderer._fireworks.some(show=>show.championship)", 'championship final render');
    await check('Championship victory queues additional celebration fireworks', "RobotFootball.renderer._fireworks.some(show=>show.championship)");
    await js('RobotFootball.prefs.reducedMotion=true;void 0');
    await until('RobotFootball.renderer.reducedMotion', 'reduced motion applied');
    await check('Reduced motion keeps the special field without extra championship fireworks', "RobotFootball.renderer.championshipDecor.visible && !RobotFootball.renderer._fireworks.some(show=>show.championship)");
    await js('RobotFootball.prefs.reducedMotion=false;void 0');
    await check('Champion final screen celebrates the title', "document.querySelector('#menu-title').textContent.includes('CHAMPIONS')");
    await click('Main menu'); await check('Completed champions can review season results', hasButton('Season results'));
    await js("RobotFootball.startGame(false);void 0");
    await until("RobotFootball.renderer.matchTheme==='regular'", 'regular stadium restored');
    await check('Exhibition restores the regular stadium and crowd', "!RobotFootball.renderer.championshipDecor.visible && RobotFootball.renderer.crowdMeshes[0].count===" + normalCrowd);
    await seed(15, 0); await startRegularFinal(); await finish(true);
    await check('A perfect 16–0 regular season goes directly to championship', "RobotFootball.season.data.stage==='championship' && RobotFootball.season.data.results.length===16 && RobotFootball.season.data.wins===16");
    await check('A perfect season final offers Continue championship', hasButton('Continue championship'));
    await seed(9, 6); await startRegularFinal(); await finish(true);
    await check('10–6 is enough to qualify for the Wild Card', "RobotFootball.season.data.stage==='playoffs' && RobotFootball.season.data.wins===10 && RobotFootball.season.data.losses===6");
    await click('Continue playoffs'); await click('Play Wild Card'); await finish(false);
    await check('A playoff loss ends the run and exposes results rather than a new playoff', "RobotFootball.season.data.stage==='done' && !RobotFootball.season.isActive()");
    await click('Main menu'); await check('An eliminated team has no playoff continuation', hasButton('Season results') + ' && !(' + hasButton('Continue playoffs') + ')');
    await seed(9, 6); await startRegularFinal(); await finish(false);
    await check('9–7 ends the season below the qualifying threshold', "RobotFootball.season.data.stage==='failed' && RobotFootball.season.data.wins===9 && RobotFootball.season.data.losses===7");
    await seed(14, 2);
    await js("(()=>{const s=RobotFootball.season;s.data.stage='done';s.data.active=false;s.data.matchId=null;s.save();})()");
    await reload();
    await check('A stuck completed 14–2 save recovers its playoff continuation on load', hasButton('Continue playoffs') + " && RobotFootball.season.data.stage==='playoffs' && RobotFootball.season.data.wins===14 && RobotFootball.season.data.results.length===16");
    await click('Continue playoffs'); await click('Play Wild Card');
    await check('The recovered season starts a real playoff game', "RobotFootball.sim.options.format==='regulation' && RobotFootball.season.data.playoffRound===0");
    assert.deepEqual(report.errors, [], 'No browser errors'); report.passed = true; saveReport();
    console.log(JSON.stringify({ passed: true, checks: report.checks.length, report: path.join(out, 'report.json') }));

  } catch (error) {
    report.errors.push(error.stack || String(error)); saveReport();
    try { await capture('failure'); } catch (_) {}
    throw error;
  }
}

const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.wasm':'application/wasm', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.woff2':'font/woff2' };
async function main() {
  const originalCwd = process.cwd();
  const tempBase = await fsp.realpath(os.tmpdir());
  const runtime = await fsp.mkdtemp(path.join(tempBase, 'robotfootball-web-test-'));
  let browser, server, manifest, page, failNetwork = false;
  const requests = new Map();
  try {
    manifest = await createOfflineManifest(root);
    manifest.assets = manifest.assets.filter(entry => !entry.url.startsWith('./apps/') || entry.url.includes('/ROBOTFOOTBALL/') || entry.url.endsWith('/games.json') || entry.url.endsWith('/tools.json'));
    manifest.totalBytes = manifest.assets.reduce((sum, entry) => sum + entry.bytes, 0);
    manifest.version = crypto.createHash('sha256').update(JSON.stringify(manifest.assets)).digest('hex');
    report.assetCount = manifest.assets.length; report.bytes = manifest.totalBytes;
    server = http.createServer(async (req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      requests.set(pathname, (requests.get(pathname) || 0) + 1);
      if (failNetwork) { req.socket.destroy(); return; }
      try {
        let file = path.resolve(root, '.' + pathname);
        const hub = path.join(root, 'bennyshub');
        if (file !== hub && !file.startsWith(hub + path.sep)) throw Error('Not public');
        if ((await fsp.stat(file)).isDirectory()) file = path.join(file, 'index.html');
        const body = file.endsWith('offline-manifest.json') ? Buffer.from(JSON.stringify(manifest)) : await fsp.readFile(file);
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
      } catch (_) { res.writeHead(404); res.end('Not found'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port + '/bennyshub/';
    const gameUrl = base + 'apps/games/ROBOTFOOTBALL/index.html';
    // Playwright's native launcher hides helper windows; headless Chrome has no visible app window.
    // Its inherited cwd is disposable, including all native relative spelling/graphics writes.
    process.chdir(runtime);
    browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, chromiumSandbox: true });
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    context.setDefaultTimeout(15000);
    page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => navigator.serviceWorker.controller && !document.querySelector('#offline-download').disabled);
    if (await page.locator('#modal-cancel').isVisible()) await page.locator('#modal-cancel').click();
    await page.locator('#hub-settings>summary').click();
    await page.locator('#offline-download').click();
    await page.waitForFunction(() => document.querySelector('#offline-status').textContent.startsWith('Ready offline'), null, { timeout: 120000 });
    await page.locator('#hub-settings>summary').click();
    assert.ok(!page.frames().some(frame => frame.url().includes('/ROBOTFOOTBALL/')), 'Robot Football was never opened before download');
    const cachedGame = await page.evaluate(async url => !!await (await caches.open('benny-offline-library-v1')).match(url, { ignoreSearch: true }), gameUrl);
    assert.ok(cachedGame, 'Robot Football entry is in the downloaded library');
    pass('A fresh library download caches Robot Football without opening the game');
    report.downloadRequests = Object.fromEntries([...requests].filter(([url]) => url.includes('/ROBOTFOOTBALL/')));
    failNetwork = true; await context.setOffline(true);
    await page.locator('#screen-home [data-target="games"]').click();
    const openRobotCard = async () => {
      const card = page.locator('#games-grid .card-btn[data-title="Robot Football"]');
      while (!await card.count() && await page.locator('#games-next').isEnabled()) await page.locator('#games-next').click();
      assert.ok(await card.count(), 'Robot Football card is present in the paginated catalog');
      await card.click();
    };
    await openRobotCard();
    const gameFrame = () => page.frames().find(frame => frame.url().includes('/ROBOTFOOTBALL/'));
    await page.waitForFunction(() => !!document.querySelector('#app-iframe').contentWindow?.RobotFootball?.renderer);
    assert.ok(gameFrame(), 'Actual Hub iframe opened Robot Football');
    assert.ok(await gameFrame().evaluate(() => !!document.querySelector('#stadium canvas') && RobotFootball.screen === 'main'));
    pass('First Robot Football launch from the actual Hub card succeeds offline');
    await page.screenshot({ path: path.join(out, 'offline-first-launch.png') }); report.screenshots.push('offline-first-launch.png');
    report.gameViewport = await gameFrame().evaluate(() => ({ width: innerWidth, height: innerHeight, offline: !navigator.onLine }));
    await runPage({
      js: code => gameFrame().evaluate(code),
      load: () => gameFrame().goto(gameUrl, { waitUntil: 'domcontentloaded' }),
      captureImage: () => page.locator('#app-iframe').screenshot()
    });
    // The final seeded/recovered 14–2 season now has an unfinished Wild Card checkpoint.
    await gameFrame().evaluate(() => RobotFootball.pause());
    await gameFrame().getByRole('button', { name: 'Main menu', exact: true }).click();
    await page.locator('#iframe-back').click();
    await openRobotCard();
    await page.waitForFunction(() => document.querySelector('#app-iframe').contentWindow?.RobotFootball?.screen === 'main');
    assert.ok(await gameFrame().getByRole('button', { name: /Continue playoffs/ }).count());
    assert.equal(await gameFrame().evaluate(() => RobotFootball.season.data.wins), 14);
    assert.equal(await gameFrame().evaluate(() => RobotFootball.season.data.losses), 2);
    pass('Offline return through the Hub card preserves the 14–2 playoff continuation');
    assert.deepEqual(report.errors, [], 'No browser errors'); report.passed = true;
    console.log(JSON.stringify({ passed: true, checks: report.checks.length, report: path.join(out, 'report.json') }));
  } catch (error) { report.passed = false; report.errors.push(error.stack || String(error)); if (page) await page.screenshot({path:path.join(out,'web-failure.png')}).catch(()=>{}); throw error; }
  finally {
    saveReport(); if (browser) await browser.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    process.chdir(originalCwd);
    const actual = await fsp.realpath(runtime);
    if (actual !== runtime || path.dirname(actual) !== tempBase || !path.basename(actual).startsWith('robotfootball-web-test-')) throw Error('Refusing to clean unexpected runtime');
    await fsp.rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
