#!/usr/bin/env node
/* Screenshot holes with the dev viewer for visual review.
 *   node tools/shoot-holes.cjs <course.json> <holes e.g. 0,1,2|all> <cams e.g. overview,tee> [outDir] [theme]
 */
'use strict';
const path = require('node:path'), os = require('node:os');
const cdp = require('./cdp.cjs');

(async () => {
  const [file = 'sunny_meadows.json', holesArg = '0', camsArg = 'overview,tee', outDir = path.join(os.tmpdir(), 'mg2-shots'), themeArg] = process.argv.slice(2);
  const s = await cdp.open({ width: 1280, height: 720 });
  try {
    await s.go('/apps/games/NARBEMINIGOLF/tools/view.html');
    await s.until('window.__ready === true', 30000);
    const count = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '../courses', file), 'utf8')).holes.length;
    const holes = holesArg === 'all' ? [...Array(count).keys()] : holesArg.split(',').map(Number);
    for (const h of holes) {
      const info = await s.evaluate(`V.show(${JSON.stringify(file)}, ${h}, ${themeArg ? JSON.stringify(themeArg) : 'undefined'})`);
      for (const cam of camsArg.split(',')) {
        await s.evaluate(`V.cam(${JSON.stringify(cam)})`);
        const calls = await s.evaluate('V.frame(2)');
        await s.evaluate('V.frame(2.1)');
        const out = path.join(outDir, `${path.basename(file, '.json')}-h${h + 1}-${cam}.png`);
        await s.shot(out);
        console.log(out, info.name, 'calls', calls);
      }
    }
    if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
  } finally { await s.close(); }
})().catch(e => { console.error(e); process.exit(1); });
