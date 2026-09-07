/**
 * "Back to the Dock" - where does it actually take you?
 *
 *     NODE_PATH=<where puppeteer-core lives> node tools/backtodock.js
 *
 * A player reported, twice, that coming in from fishing off the dock threw
 * them out to the main menu. I could not find it by reading and guessed at
 * two causes without proving either, which is not good enough for a bug that
 * loses somebody their trip.
 *
 * So this presses the thing, in a real browser, on real keys, every way a
 * player can press it: the on-screen button with the mouse, the same button
 * with the switches, and a second press straight afterwards while the dock
 * scan is coming up - because the report was about clicking, and a scene that
 * replaces another under a resting hand is exactly where a stray press goes
 * somewhere nobody aimed.
 *
 * It reports the screen it lands on each time. Anything but the dock is a
 * failure, and it says which item took it there.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const OUT = process.argv[2] || path.join(__dirname, '..', '_backtodock');
const URL = process.env.FM_URL ||
  'http://127.0.0.1:8765/apps/games/BENNYSFISHMYSTERY/index.html';
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

let checks = 0, fail = 0;
const ok = (c, m) => { checks++; if (!c) fail++; console.log((c ? '  ok    ' : '  FAIL  ') + m); };
const say = (m) => console.log(m);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!CHROME) { console.error('No Chrome or Edge found.'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
                                           args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon\.ico/.test(t) || /Failed to load resource/.test(t)) return;   // the rig, not the game
    errors.push(t);
  });
  page.on('requestfailed', r => errors.push('request failed: ' + r.url()));
  page.on('response', r => {
    /* The browser asks every server for a favicon and this one has not got
       one. That is the test rig, not the game. */
    if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) errors.push(r.status() + ' ' + r.url());
  });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(2500);

  const tap = async (k) => { await page.keyboard.down(k); await sleep(70); await page.keyboard.up(k); await sleep(420); };
  const shot = async (n) => { const p = path.join(OUT, n + '.png'); await page.screenshot({ path: p }); return p; };

  /* What is on screen, in the game's own words. */
  const where = () => page.evaluate(() => {
    const card = document.getElementById('overlay');
    const on = card && card.classList.contains('on');
    const title = document.querySelector('#panelTitle');
    return {
      overlay: !!on,
      card: on && title ? title.textContent.trim() : null,
      state: RT.game.state,
      run: !!RT.game.run,
      dockHud: !!(document.getElementById('dockHud') || {}).classList &&
               document.getElementById('dockHud').classList.contains('on'),
      labels: Array.from(document.querySelectorAll('#worldLabels > *'))
                   .map(e => (e.textContent || '').trim()).filter(Boolean),
    };
  });

  /* Straight to the boards, with the brief already heard - this is about the
     way back, not about the conversation. */
  await page.evaluate(() => {
    const G = RT.game;
    G.resetProgress();
    const sv = G.getSave();
    sv.briefed = 99; sv.hasMap = true;
    if (!sv.rods.includes('hand_net')) sv.rods.push('hand_net');
    if (!sv.rods.includes('bamboo_rod')) sv.rods.push('bamboo_rod');
    if (!sv.baits.includes('earthworm')) sv.baits.push('earthworm');
    G.goToDock();
  });
  await sleep(1200);

  console.log('BACK TO THE DOCK');
  console.log();

  async function outAndBack(how) {
    await page.evaluate(() => { RT.game.setOnFoot(true); RT.game.castOff(); });
    await sleep(1800);
    let st = await where();
    say('  out on the boards: state=' + st.state + ' labels=[' + st.labels.join(' | ') + ']');

    if (how === 'click') {
      /* The on-screen button, with a mouse, the way it was reported. */
      const box = await page.evaluate(() => {
        const el = document.getElementById('tcDock');
        if (!el || el.offsetParent === null) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      });
      ok(!!box, 'the Back to the Dock button is on screen to be clicked');
      if (box) await page.mouse.click(box.x, box.y);
    } else if (how === 'click twice') {
      const box = await page.evaluate(() => {
        const el = document.getElementById('tcDock');
        if (!el || el.offsetParent === null) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      });
      if (box) { await page.mouse.click(box.x, box.y); await sleep(260); await page.mouse.click(box.x, box.y); }
    } else {
      /* The switches: step until the scan says Back to the Dock, then press. */
      let found = false;
      for (let i = 0; i < 8 && !found; i++) {
        const lab = await page.evaluate(() => {
          const el = document.querySelector('#worldLabels .focused, #worldLabels > *');
          return el ? (el.textContent || '').trim() : '';
        });
        const btn = await page.evaluate(() =>
          document.getElementById('tcDock') &&
          document.getElementById('tcDock').classList.contains('focused'));
        if (btn) { found = true; break; }
        await tap('Space');
      }
      ok(found, 'the scan reaches Back to the Dock');
      await tap('Enter');
    }
    await sleep(2200);
    return where();
  }

  for (const how of ['click', 'switches', 'click twice']) {
    console.log();
    console.log('-- by ' + how);
    const st = await outAndBack(how);
    say('  landed on: ' + (st.overlay ? 'the card "' + st.card + '"' : 'the world') +
        '  state=' + st.state + '  labels=[' + st.labels.join(' | ') + ']');
    await shot('backtodock_' + how.replace(/ /g, '_'));
    ok(!st.overlay || st.card !== 'Benny\'s FishMaster',
       'by ' + how + ': it does not throw you out to the main menu');
    ok(st.labels.some(l => /Tackle Shop|Mission/i.test(l)) || st.dockHud,
       'by ' + how + ': it lands on the dock, with the dock to scan');
    // Put the game back on the dock for the next attempt, however it went.
    await page.evaluate(() => { RT.game.setOnFoot(false); RT.game.goToDock(); });
    await sleep(900);
    await page.evaluate(() => { if (RT.ui && RT.ui.setScreen) RT.ui.setScreen('title'); });
    await sleep(200);
  }

  /* ── AND OPTIONS, FROM A FISHING SPOT IN THE BOAT ──────────────────────
     The same fault wore a second face: a player pulled over in the canoe,
     pressed Options, and was put back on the dock. Options lives on a button
     too, so the click carried a stale index into whatever list came next. */
  console.log();
  console.log('OPTIONS, PULLED OVER IN THE CANOE');
  console.log();
  await page.evaluate(() => {
    const G = RT.game;
    const sv = G.getSave();
    sv.money += 500;
    if (!sv.vessels.includes('canoe')) sv.vessels.push('canoe');
    sv.vessel = 'canoe';
    G.setOnFoot(false);
    G.goToDock();
  });
  await sleep(1000);
  await page.evaluate(() => { RT.game.castOff(); });
  await sleep(1500);
  /* Troll until the game offers a shoal, then pull over onto it. */
  const stopped = await page.evaluate(async () => {
    const G = RT.game;
    for (let i = 0; i < 400; i++) {
      if (G.isFishing && G.isFishing()) return true;
      if (G.pullOverTo && (G.pullOverTo('left') || G.pullOverTo('right'))) {
        G.setSteer(0);
      } else {
        G.setSteer(i % 60 < 30 ? -1 : 1);
      }
      await new Promise(r => setTimeout(r, 25));
    }
    return !!(G.isFishing && G.isFishing());
  });
  await sleep(1200);
  let sp = await where();
  say('  pulled over: state=' + sp.state + ' run=' + sp.run);
  ok(sp.state === 'spot' || stopped, 'the canoe is stopped at a fishing spot');

  const pbox = await page.evaluate(() => {
    const el = document.getElementById('pauseBtn');
    if (!el || el.offsetParent === null) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  ok(!!pbox, 'the Options button is on screen at the spot');
  if (pbox) await page.mouse.click(pbox.x, pbox.y);
  await sleep(1200);
  let op = await where();
  say('  after clicking Options: ' + (op.overlay ? 'the card "' + op.card + '"' : 'the world') +
      '  state=' + op.state);
  await shot('options_at_a_spot');
  ok(op.overlay && /Options/i.test(op.card || ''), 'clicking Options opens Options');
  ok(op.state === 'spot' || op.run, 'and it does NOT put you back on the dock');

  /* And Continue puts the scan back at the spot it was taken from. */
  await tap('Space');
  await tap('Enter');
  await sleep(1400);
  const back = await where();
  say('  after Continue: ' + (back.overlay ? 'the card "' + back.card + '"' : 'the world') +
      '  state=' + back.state + '  labels=[' + back.labels.join(' | ') + ']');
  await shot('options_continue');
  ok(!back.overlay, 'Continue closes the card');
  ok(back.state === 'spot' || back.run, 'and leaves you at the spot, still fishing');

  console.log();
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors[0] : ''));
  await browser.close();
  console.log();
  console.log(fail === 0 ? checks + ' checks passed. Back to the dock goes to the dock.'
                         : fail + ' of ' + checks + ' checks failed.');
  process.exit(fail ? 1 : 0);
})();
