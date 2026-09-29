/**
 * Static checks on the UI-owned files (no browser needed):
 *   - index.html loads every script in exactly the DESIGN §10 order, input.js
 *     before scan-manager.js, shared scripts with onerror warnings, the page
 *     colour set before the stylesheet;
 *   - the release rules: lowercase names, no absolute paths, no AudioContext,
 *     no fetch/XHR, no ES modules, no external URLs.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const GAME = path.resolve(__dirname, '..', '..');
const OWN = ['index.html', 'css/nk.css', 'js/input.js', 'js/hud.js', 'js/controls.js', 'js/ui.js',
             'tools/mock_game.js', 'tools/ui_mock.html'];

module.exports = async function (t) {
  const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
  const design = fs.readFileSync(path.join(GAME, 'DESIGN.md'), 'utf8');

  // The load order, straight out of DESIGN.md §10.
  const block = design.split('Load order in `index.html`')[1].split('```')[1];
  const expected = block.split(/→/).map((s) => s.trim()).filter(Boolean);
  const actual = [];
  html.replace(/<script\s+src="([^"]+)"/g, (m, src) => { actual.push(src); return m; });
  t.assert(JSON.stringify(actual) === JSON.stringify(expected), 'index.html script order matches DESIGN §10 exactly',
           { expected, actual });
  t.assert(actual.indexOf('js/input.js') < actual.indexOf('../../../shared/scan-manager.js'), 'input.js loads before scan-manager.js');

  const shared = html.match(/<script\s+src="\.\.\/\.\.\/\.\.\/shared\/[^"]+"[^>]*>/g) || [];
  t.assert(shared.length === 4 && shared.every((s) => /onerror="console\.warn\('[\w.-]+ not loaded'\)"/.test(s)),
           'every shared script warns if it fails to load', shared);
  const bg = html.indexOf('background:#1d1b2e'), css = html.indexOf('href="css/nk.css"');
  t.assert(bg > 0 && bg < css, 'the page background is set before the stylesheet loads (no white flash)');
  t.assert(/id="app"/.test(html) && /id="canvasWrap"/.test(html) && /id="loading"/.test(html), '#app, #canvasWrap and #loading exist');

  for (const f of OWN) {
    const full = path.join(GAME, f);
    t.assert(fs.existsSync(full), f + ' exists');
    const src = fs.readFileSync(full, 'utf8');
    t.assert(f === f.toLowerCase(), f + ' has a lowercase name');
    t.assert(!/[A-Za-z]:[\\/][^\s'"]*|\/Users\/|file:\/\//.test(src.replace(/https?:\/\/[^\s'"]*/g, '')), f + ': no absolute paths');
    t.assert(!/AudioContext/.test(src), f + ': no AudioContext');
    t.assert(!/\bfetch\s*\(|XMLHttpRequest/.test(src), f + ': no fetch / XHR');
    t.assert(!/^\s*(import|export)\s/m.test(src), f + ': no ES modules');
    t.assert(!/https?:\/\//.test(src), f + ': no external URLs');
  }
  for (const f of fs.readdirSync(__dirname).filter((n) => /^ui-/.test(n))) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    t.assert(!/[A-Za-z]:[\\/]Users|\/Users\//.test(src), 'tools/harness/' + f + ': no absolute paths');
  }
};
