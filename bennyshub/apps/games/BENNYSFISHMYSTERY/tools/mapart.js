/**
 * Photograph the map of the lake.
 *
 *     NODE_PATH=<where puppeteer-core lives> node tools/mapart.js <out-dir>
 *
 * tools/mapcheck.js can prove the chart is TRUE - that "The Abyssal Trench"
 * is written over a hundred and eleven feet of water and that no two names
 * land on each other. It cannot tell you whether the thing looks like a
 * chart or like a blurred screenshot of one, and that is a real question:
 * the first version stretched a 512-pixel bitmap across a 1280-pixel screen
 * and looked exactly as soft as that sounds.
 *
 * So this draws the map on its own, at two sizes and from two places on the
 * lake, and saves the pictures to be looked at.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const OUT = process.argv[2] || path.join(__dirname, '..', '_mapart');
const PAGE = 'file:///' + path.join(__dirname, 'mapart.html').replace(/\\/g, '/');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

const SHOTS = [
  { name: 'chart_1280x720',  w: 1280, h: 720,  where: 'dock' },
  { name: 'chart_1920x1080', w: 1920, h: 1080, where: 'dock' },
  { name: 'chart_from_the_trench', w: 1280, h: 720, where: 'deep' },
];

(async () => {
  if (!CHROME) { console.error('No Chrome or Edge found to draw with.'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--allow-file-access-from-files', '--no-sandbox'],
  });
  let bad = 0;
  for (const s of SHOTS) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 1 });
    const t0 = Date.now();
    await page.goto(PAGE + '?w=' + s.w + '&h=' + s.h + '&where=' + s.where,
                    { waitUntil: 'networkidle0' });
    const drew = await page.evaluate(() => window.__map || null);
    const ms = Date.now() - t0;
    const file = path.join(OUT, s.name + '.png');
    await page.screenshot({ path: file });
    if (!drew) { console.log('FAILED  ' + s.name + ' drew nothing'); bad++; }
    else {
      console.log(s.name.padEnd(24), s.w + 'x' + s.h,
                  '| ' + drew.labels.length + ' labels',
                  '| contours ' + drew.contours.map(c => c.ft + 'ft:' + c.segs).join(' '),
                  '| scale ' + drew.scaleFt + ' ft',
                  '| ' + ms + ' ms');
    }
    errs.forEach(e => { console.log('  console: ' + e); bad++; });
    await page.close();
  }
  await browser.close();
  console.log();
  console.log(bad ? bad + ' problems.' : 'Drawn. Look at the pictures in ' + OUT);
  process.exit(bad ? 1 : 0);
})();
