/**
 * The bottom of the screen, where four things want the same inch of glass:
 * the reel bar, the cast meter, the row of touch buttons and the Options
 * button. The media queries move three of them on a phone, so this checks
 * they landed clear of each other rather than on top.
 *
 * Driven by turning the pieces on directly - a net mission never reels, so
 * playing to this state takes a rod and half an hour.
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

const SIZES = [
  { tag: 'phone-land', w: 844, h: 390 },
  { tag: 'phone-port', w: 390, h: 844 },
  { tag: 'small-land', w: 667, h: 375 },
  { tag: 'small-port', w: 360, h: 640 },
  { tag: 'desktop',    w: 1280, h: 720 },
];

/* The two that are up together during a fight, and the two during a cast. */
const CASES = [
  { name: 'reeling',  on: ['reel'],   btns: ['tcReelIn'] },
  { name: 'fighting', on: ['reel'],   btns: ['tcReel', 'tcTroll', 'tcDock'] },
  { name: 'casting',  on: ['charge'], btns: ['tcCast', 'tcAimL', 'tcAimR'] },
  { name: 'steering', on: ['steerBar'], btns: ['tcTroll', 'tcDock'] },
];

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
    await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => document.getElementById('loading').style.display === 'none', { timeout: 30000 });
    await sleep(700);
    await page.keyboard.press('Enter'); await sleep(1500);
    await page.evaluate(() => { RT.game.takeCounterBeat(); RT.game.goToDock(); }); await sleep(600);
    await page.evaluate(() => RT.game.castOff()); await sleep(1400);

    for (const C of CASES) {
      const m = await page.evaluate((c) => {
        document.getElementById('overlay').classList.remove('on');
        ['reel', 'charge', 'steerBar'].forEach(id => document.getElementById(id).classList.remove('on'));
        document.querySelectorAll('.tcBtn').forEach(el => el.classList.remove('on'));
        c.on.forEach(id => document.getElementById(id).classList.add('on'));
        c.btns.forEach(id => { const e = document.getElementById(id); if (e) e.classList.add('on'); });
        document.getElementById('hud').classList.add('on');
        document.getElementById('pauseBtn').classList.add('on');

        const H = window.innerHeight, W = window.innerWidth;
        const names = c.on.concat(c.btns, ['pauseBtn']);
        const boxes = names.map(id => {
          const el = document.getElementById(id);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return (r.width < 2 || r.height < 2) ? null : { id, r };
        }).filter(Boolean);

        const off = [], hit = [];
        boxes.forEach(({ id, r }) => {
          const cut = [];
          if (r.left < -1) cut.push('left ' + Math.round(-r.left));
          if (r.right > W + 1) cut.push('right ' + Math.round(r.right - W));
          if (r.bottom > H + 1) cut.push('bottom ' + Math.round(r.bottom - H));
          if (r.top < -1) cut.push('top ' + Math.round(-r.top));
          if (cut.length) off.push(id + ' off ' + cut.join(', '));
        });
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].r, d = boxes[j].r;
          const ox = Math.min(a.right, d.right) - Math.max(a.left, d.left);
          const oy = Math.min(a.bottom, d.bottom) - Math.max(a.top, d.top);
          if (ox > 4 && oy > 4) {
            hit.push(boxes[i].id + ' over ' + boxes[j].id +
                     ' (' + Math.round(ox) + 'x' + Math.round(oy) + ')');
          }
        }
        return { off, hit };
      }, C);
      await sleep(120);
      const bits = [];
      if (m.off.length) bits.push('OFF-SCREEN: ' + m.off.join('; '));
      if (m.hit.length) bits.push('OVERLAP: ' + m.hit.join('; '));
      if (bits.length) bad++;
      console.log('  ' + (S.tag + ' ' + C.name).padEnd(26) + (bits.length ? bits.join(' | ') : 'clear'));
      await page.screenshot({ path: path.join(OUT, S.tag + '_' + C.name + '.png') });
    }
    await page.close();
  }
  await b.close();
  console.log('\n' + (bad ? bad + ' bottom-of-screen clashes' : 'nothing at the bottom lands on anything else'));
})();
