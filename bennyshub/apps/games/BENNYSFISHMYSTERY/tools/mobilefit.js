/**
 * Does the game FIT on a phone?
 *
 * cardfit.js asks that question of one desktop window. This asks it of the
 * sizes a phone actually gives you - portrait, landscape, and the small old
 * phone - and reports, per card, whether anything is cut off or has to be
 * scrolled to. Screenshots alongside, because a number cannot tell you that
 * two things are overlapping.
 *
 *     python -m http.server 8765 --bind 127.0.0.1      (from bennyshub/)
 *     node tools/mobilefit.js <outDir>
 */
const fs = require('fs'), path = require('path'), puppeteer = require('puppeteer-core');
/* Which game folder this copy of the tool lives in - the same file serves
   BENNYSFISHMASTER UPDATE and the BENNYSFISHMYSTERY it ships as, so the URL
   is read off its own path rather than written into it. */
const GAME = encodeURIComponent(path.basename(path.join(__dirname, '..')));
const URL = process.env.FM_URL ||
  ('http://127.0.0.1:8765/apps/games/' + GAME + '/index.html');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.argv[2] || '.';
fs.mkdirSync(OUT, { recursive: true });

/* The shapes worth caring about. Landscape is what somebody turns the phone
   to for a game; portrait is what they open it in; the 360 is the cheap
   Android that is still the commonest screen there is. */
const SIZES = [
  { tag: 'phone-land', w: 844, h: 390 },
  { tag: 'phone-port', w: 390, h: 844 },
  { tag: 'small-land', w: 667, h: 375 },
  { tag: 'small-port', w: 360, h: 640 },
  { tag: 'desktop',    w: 1280, h: 720 },
];
const CARDS = ['creel', 'missions', 'settings', 'kit', 'kittray', 'keeper', 'brief', 'tackle'];

/* Everything that is meant to be on screen at once, so an element sticking
   out past the glass or landing on top of another one is a number and not an
   opinion. */
async function measure(page) {
  return page.evaluate(() => {
    const W = window.innerWidth, H = window.innerHeight;
    const out = { over: [], vw: W, vh: H };
    const seen = [];
    document.querySelectorAll('#app [id], #app .tcBtn, #app .hudPanel').forEach(el => {
      if (!el.id && !el.className) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const name = el.id || ('.' + String(el.className).split(' ')[0]);
      const cut = [];
      if (r.left < -1) cut.push('left ' + Math.round(-r.left));
      if (r.top < -1) cut.push('top ' + Math.round(-r.top));
      if (r.right > W + 1) cut.push('right ' + Math.round(r.right - W));
      if (r.bottom > H + 1) cut.push('bottom ' + Math.round(r.bottom - H));
      if (cut.length) out.over.push(name + ' off ' + cut.join(', '));
      seen.push({ name, r });
    });
    const ov = document.getElementById('overlay');
    const menu = document.getElementById('panelMenu');
    const panel = document.getElementById('panel');
    out.scrollY = document.scrollingElement ? document.scrollingElement.scrollHeight - H : 0;
    out.ovScroll = ov ? ov.scrollHeight : 0;
    out.ovClient = ov ? ov.clientHeight : 0;
    out.menuScroll = menu ? menu.scrollHeight : 0;
    out.menuClient = menu ? menu.clientHeight : 0;
    out.panelH = panel && getComputedStyle(panel).display !== 'none'
      ? Math.round(panel.getBoundingClientRect().height) : 0;
    /* The smallest thing you are asked to hit. Apple and Google both say 44. */
    let small = [];
    document.querySelectorAll('.tcBtn.on, .menuItem, #pauseBtn, #mapClose').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.height > 1 && r.height < 44) {
        small.push((el.id || el.className.split(' ')[0]) + ' ' + Math.round(r.height) + 'px');
      }
    });
    out.small = small;
    return out;
  });
}

function line(tag, what, m) {
  const scrolls = m.ovScroll > m.ovClient + 2 || m.menuScroll > m.menuClient + 2;
  const bits = [];
  if (scrolls) bits.push('SCROLLS ' + m.ovScroll + '/' + m.ovClient);
  if (m.over.length) bits.push('OFF-SCREEN: ' + m.over.join('; '));
  if (m.small && m.small.length) bits.push('under 44px: ' + m.small.join(', '));
  console.log('  ' + (tag + ' ' + what).padEnd(30) +
              (m.panelH ? ('card ' + String(m.panelH).padStart(4) + 'px of ' + m.vh) : '').padEnd(22) +
              (bits.length ? bits.join(' | ') : 'ok'));
  return scrolls || m.over.length > 0;
}

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader', '--mute-audio'],
  });
  let bad = 0;
  for (const S of SIZES) {
    console.log('\n== ' + S.tag + '  ' + S.w + 'x' + S.h + ' ==');
    const page = await b.newPage();
    await page.setCacheEnabled(false);
    await page.setViewport({ width: S.w, height: S.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await sleep(2400);

    // The title card, before anything is pressed.
    if (line(S.tag, 'title', await measure(page))) bad++;
    await page.screenshot({ path: path.join(OUT, S.tag + '_title.png') });

    await page.evaluate(() => {
      const G = RT.game; G.resetProgress(); const sv = G.getSave();
      sv.briefed = 99; sv.currentMission = 20; sv.money += 600; sv.hasMap = true;
      ['hand_net', 'bamboo_rod', 'fiber_rod', 'carbon_rod'].forEach(r => { if (!sv.rods.includes(r)) sv.rods.push(r); });
      ['earthworm', 'spoon', 'deep_rig'].forEach(x => { if (!sv.baits.includes(x)) sv.baits.push(x); });
      ['magnet_1', 'heavy_magnet', 'tagging_tool'].forEach(t => { if (!sv.tools.includes(t)) sv.tools.push(t); });
      ['canoe', 'kayak'].forEach(v => { if (!sv.vessels.includes(v)) sv.vessels.push(v); });
      ['sunfish', 'perch', 'bass', 'crappie', 'catfish', 'pike'].forEach((id, i) => {
        sv.creel.push({ id: id, length: 8 + i, weight: 1 + i, m: 2 }); sv.best[id] = { length: 8 + i, weight: 1 + i };
      });
      G.goToDock();
    });
    await sleep(900);
    if (line(S.tag, 'dock', await measure(page))) bad++;
    await page.screenshot({ path: path.join(OUT, S.tag + '_dock.png') });

    for (const name of CARDS) {
      await page.evaluate(n => RT.ui.setScreen(n), name);
      await sleep(420);
      if (line(S.tag, name, await measure(page))) bad++;
      await page.screenshot({ path: path.join(OUT, S.tag + '_card_' + name + '.png') });
    }

    // The chart.
    await page.evaluate(() => RT.ui.openMap()); await sleep(700);
    if (line(S.tag, 'map', await measure(page))) bad++;
    await page.screenshot({ path: path.join(OUT, S.tag + '_map.png') });

    // And out on the water, where the touch buttons are.
    await page.keyboard.press('Escape'); await sleep(500);
    await page.evaluate(() => RT.game.goToDock()); await sleep(600);
    await page.evaluate(() => RT.game.castOff()); await sleep(1500);
    if (line(S.tag, 'fishing', await measure(page))) bad++;
    await page.screenshot({ path: path.join(OUT, S.tag + '_fishing.png') });
    await page.evaluate(() => RT.game.startAim()); await sleep(500);
    if (line(S.tag, 'aim', await measure(page))) bad++;
    await page.screenshot({ path: path.join(OUT, S.tag + '_aim.png') });
    await sleep(3000);
    await page.screenshot({ path: path.join(OUT, S.tag + '_catch.png') });
    if (line(S.tag, 'catch card', await measure(page))) bad++;

    await page.close();
  }
  await b.close();
  console.log('\n' + (bad ? bad + ' screens do not fit' : 'everything fits') + '  — pictures in ' + OUT);
})();
