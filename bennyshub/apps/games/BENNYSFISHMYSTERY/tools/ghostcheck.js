/**
 * ONE TAP, ONE CHOICE.
 *
 * Reported: "when I click on one of the menus in Walt's shop it will also
 * click on the menu right after that menu - my click and then release
 * selects twice."
 *
 * A browser sends a click of its own a fraction of a second after a tap.
 * Choosing a row rebuilds the card, so by the time that click arrives the
 * row it belonged to is gone and it lands on a row of the NEW card. This
 * taps a row, then sends exactly that delayed click at the same point, and
 * counts how many cards the game moved through. Two means the tap chose
 * twice.
 */
const fs = require('fs'), path = require('path'), puppeteer = require('puppeteer-core');
const GAME = encodeURIComponent(path.basename(path.join(__dirname, '..')));
const URL = process.env.FM_URL ||
  ('http://127.0.0.1:8765/apps/games/' + GAME + '/index.html');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* What a phone actually waits before sending its made-up click. */
const GHOST_DELAY = Number(process.env.GHOST_DELAY || 320);

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader', '--mute-audio'],
  });
  const page = await b.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(2400);
  await page.evaluate(() => {
    const G = RT.game; G.resetProgress(); const sv = G.getSave();
    sv.briefed = 99; sv.currentMission = 20; sv.money = 900; sv.hasMap = true;
    ['hand_net', 'bamboo_rod'].forEach(r => { if (!sv.rods.includes(r)) sv.rods.push(r); });
    G.goToDock();
  });
  await sleep(800);

  /* Watch the card's TITLE rather than any internal call: whatever route the
     game takes, a new card means a new heading. */
  await page.evaluateOnNewDocument(() => {});
  const watch = () => page.evaluate(() => {
    window.__titles = [];
    const t = document.getElementById('panelTitle');
    window.__titles.push(t.textContent.trim());
    if (window.__mo) window.__mo.disconnect();
    window.__mo = new MutationObserver(() => {
      const cur = t.textContent.trim();
      if (cur !== window.__titles[window.__titles.length - 1]) window.__titles.push(cur);
    });
    window.__mo.observe(t, { childList: true, subtree: true, characterData: true });
  });

  const screens = ['tackle', 'kit', 'pause', 'settings'];
  let bad = 0;
  for (const s of screens) {
    await page.evaluate(n => RT.ui.setScreen(n), s);
    await sleep(500);
    const row = await page.evaluate(() => {
      const el = document.querySelector('#panelMenu .menuItem');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
               text: (el.textContent || '').trim().slice(0, 24) };
    });
    if (!row) { console.log(s, '- no rows'); continue; }
    await watch();

    // The tap.
    await page.touchscreen.tap(row.x, row.y);
    // And the click the phone sends afterwards, at the same point, once the
    // new card is already drawn there.
    await sleep(GHOST_DELAY);
    await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return;
      ['mousedown', 'mouseup', 'click'].forEach(type => {
        el.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, detail: 1
        }));
      });
    }, row);
    await sleep(800);

    const titles = await page.evaluate(() => window.__titles);
    const moves = titles.length - 1;
    const ok = moves <= 1;
    if (!ok) bad++;
    console.log('  tap "' + row.text + '" on ' + s.padEnd(9) +
                ' -> ' + titles.join('  >  ') +
                '   (' + moves + ' card change' + (moves === 1 ? '' : 's') + ') ' +
                (ok ? 'OK' : '<-- CHOSE TWICE'));
  }
  await b.close();
  console.log('\n' + (bad ? bad + ' of ' + screens.length + ' taps chose twice'
                          : 'every tap made exactly one choice'));
  process.exit(bad ? 1 : 0);
})();
