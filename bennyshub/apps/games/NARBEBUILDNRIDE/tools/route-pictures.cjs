/**
 * NARBE Build n Ride - the route tiles' pictures, made once and shipped (dev-only, needs a browser).
 *
 *   node tools/route-pictures.cjs <page url>
 *     e.g. node tools/route-pictures.cjs http://127.0.0.1:4173/bennyshub/apps/games/NARBEBUILDNRIDE/index.html
 *
 * Opens the game in Microsoft Edge (headless, on the GPU) through Playwright, with the shipped pictures
 * hidden so the game builds each route's picture itself (BNR.Scene.diorama + BNR.Stage.snapshot, the
 * same code as before 2026-11-18), and writes them to images/routes/<id>.jpg. The game loads these
 * files instead of building the pictures at start-up, which froze the menu for seconds on a slower
 * computer. After remaking them, bump ROUTE_PICTURES in js/main.js.
 *
 * Playwright: the website repo's node_modules (set NODE_PATH to it), or npm i playwright.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const url = process.argv[2];
if (!url) { console.error('usage: node tools/route-pictures.cjs <page url>'); process.exit(1); }
const OUT = path.join(__dirname, '..', 'images', 'routes');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

(async () => {
    const browser = await chromium.launch({ executablePath: fs.existsSync(EDGE) ? EDGE : undefined, headless: true,
        args: ['--enable-gpu', '--ignore-gpu-blocklist', '--headless=new'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    // Hide the shipped pictures, so the game builds every one.
    await page.route(/\/images\/routes\/[^/]+\.jpg/, r => r.fulfill({ status: 404, body: '' }));
    await page.addInitScript(() => {
        window.__pics = {};
        const iv = setInterval(() => {
            if (!window.BNR || !BNR.UI || !BNR.UI.setThumb || window.__hooked) return;
            window.__hooked = true; clearInterval(iv);
            const set = BNR.UI.setThumb;
            BNR.UI.setThumb = function (id, u) { if (/^data:image\/jpeg/.test(u)) window.__pics[id] = u; return set.apply(this, arguments); };
        }, 0);
    });
    await page.goto(url, { waitUntil: 'load' });
    const n = await page.evaluate(() => new Promise(res => { const w = () => (window.BNR && BNR.Routes ? res(BNR.Routes.LIST.length) : setTimeout(w, 50)); w(); }));
    await page.waitForFunction(k => Object.keys(window.__pics).length >= k, n, { timeout: 180000 });
    const pics = await page.evaluate(() => window.__pics);
    fs.mkdirSync(OUT, { recursive: true });
    for (const [id, data] of Object.entries(pics)) {
        const file = path.join(OUT, id + '.jpg');
        fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
        console.log(path.relative(process.cwd(), file), fs.statSync(file).size + ' bytes');
    }
    if (errs.length) console.log('page errors:', errs.slice(0, 5));
    await browser.close();
})();
