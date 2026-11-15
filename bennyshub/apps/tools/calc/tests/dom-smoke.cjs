'use strict';
/* Calculator - the real page, driven headless by switch presses.
 *
 * Loads index.html in jsdom (a Node DOM: no browser, no rendering, no GPU - safe on
 * this PC) with the hub's real shared scanner, voice manager and input guard. Only
 * speech is faked. A driver presses Space and Enter (keydown/keyup, like a switch
 * interface), clicks keys and types on the keyboard. Any script error fails the run.
 *
 * jsdom is not a hub dependency. Install it anywhere and point at it:
 *   npm i jsdom@24 --prefix <dir>
 *   JSDOM=<dir>/node_modules/jsdom node bennyshub/apps/tools/calc/tests/dom-smoke.cjs
 * CALC_HUB=<a bennyshub folder> runs the same checks against another copy (the website).
 */
const path = require('path'), fs = require('fs');
const jsdom = require(process.env.JSDOM || 'jsdom');
const { JSDOM, VirtualConsole } = jsdom;
const HUB = process.env.CALC_HUB || path.join(__dirname, '..', '..', '..', '..');
const APP = path.join(HUB, 'apps', 'tools', 'calc');
const ORIGIN = 'http://hub.local/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class HubFiles extends jsdom.ResourceLoader {
  fetch(url, options) {
    if (!url.startsWith(ORIGIN)) return super.fetch(url, options);
    const file = path.join(HUB, decodeURIComponent(url.slice(ORIGIN.length).split('?')[0]));
    // Website-only scripts (analytics) are not needed here.
    if (/usage-analytics\.js$/.test(file)) return Promise.resolve(Buffer.from(''));
    const p = new Promise((resolve, reject) => fs.readFile(file, (err, buf) => (err ? reject(err) : resolve(buf))));
    p.abort = () => {};
    return p;
  }
}

function stub(w, log) {
  w.addEventListener('error', e => log.errors.push('window error: ' + (e.error && e.error.stack || e.message)));
  w.addEventListener('unhandledrejection', e => log.errors.push('unhandled rejection: ' + (e.reason && e.reason.stack || e.reason)));
  let current = null;
  w.SpeechSynthesisUtterance = function (text) { this.text = text; };
  w.speechSynthesis = {
    speaking: false, pending: false,
    getVoices: () => [{ name: 'Fake English', lang: 'en-US', default: true }],
    speak(u) {
      log.speech.push(String(u.text));
      this.speaking = true; current = u;
      setTimeout(() => { if (current === u) u.onstart && u.onstart(); }, 2);
      setTimeout(() => { if (current !== u) return; current = null; this.speaking = false; u.onend && u.onend(); }, 6);
    },
    cancel() { const u = current; current = null; this.speaking = false; if (u && u.onerror) u.onerror({ error: 'interrupted' }); },
    addEventListener() {}, removeEventListener() {}
  };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () {};
  w.Element.prototype.scrollIntoView = function () {};
  w.isSecureContext = true;
  w.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' });
}

async function openCalc(scan) {
  const log = { errors: [], speech: [] };
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Not implemented: (navigation|window\.scrollTo)/.test(e.message)) log.errors.push('jsdom: ' + e.message); });
  vc.on('error', (...a) => log.errors.push('console.error: ' + a.map(String).join(' ')));
  const dom = new JSDOM(fs.readFileSync(path.join(APP, 'index.html'), 'utf8'), {
    url: ORIGIN + 'apps/tools/calc/index.html', runScripts: 'dangerously', resources: new HubFiles(),
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.localStorage.setItem('narbe-scan-settings', JSON.stringify(scan));
      stub(w, log);
    }
  });
  const w = dom.window, doc = w.document;
  for (let i = 0; i < 200 && !w.__calc; i++) await sleep(25);
  if (!w.__calc) throw Error('Calculator did not start: ' + log.errors.join('\n'));
  await sleep(300);
  const keyEvent = (type, init) => doc.dispatchEvent(new w.KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));
  const switchKey = (type, code) => keyEvent(type, { code, key: code === 'Space' ? ' ' : 'Enter' });
  const c = {
    w, doc, log,
    state: () => w.__calc.state(),
    selected: () => doc.body.dataset.scanSelected || '',
    lastSpeech: () => log.speech[log.speech.length - 1] || '',
    async press(code, hold = 40) { switchKey('keydown', code); await sleep(hold); switchKey('keyup', code); await sleep(110); },
    async goTo(id, limit = 40) {
      for (let i = 0; i < limit; i++) { if (c.selected() === id) return; await c.press('Space'); }
      throw Error(`could not scan to ${id}; at "${c.selected()}"`);
    },
    async choose(rowId, keyId) {
      await c.goTo(rowId); await c.press('Enter');
      if (keyId) { await c.goTo(keyId); await c.press('Enter'); }
    },
    rowOfKey(id) { return Number(doc.querySelector(`.key[data-key="${CSS_ESCAPE(id)}"]`).closest('.key-row').dataset.row); },
    async scanKey(id) { await c.choose('row:' + c.rowOfKey(id), 'key:' + id); },
    click(id) { doc.querySelector(`.key[data-key="${CSS_ESCAPE(id)}"]`).click(); },
    async type(key) { keyEvent('keydown', { key, code: '' }); keyEvent('keyup', { key, code: '' }); await sleep(10); },
    main: () => doc.getElementById('mainValue').textContent,
    close() { w.close(); }
  };
  return c;
}
const CSS_ESCAPE = id => id.replace(/["\\]/g, '\\$&');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function switchChecks() {
  const c = await openCalc({ autoScan: false, inputSensitivityIndex: 0 });

  check('opens with nothing highlighted', c.selected() === '', c.selected());
  check('keys are C ⌫ % ÷ / 7 8 9 × / 4 5 6 − / 1 2 3 + / ± 0 . = / Settings Exit',
    [...c.doc.querySelectorAll('.key-row')].map(row => [...row.querySelectorAll('.key')].map(k => k.textContent).join(' ')).join(' / ') ===
    'C ⌫ % ÷ / 7 8 9 × / 4 5 6 − / 1 2 3 + / ± 0 . = / ⚙Settings ⏻Exit');
  check('screen starts at 0', c.main() === '0', c.main());

  // Root loop: screen, six rows, then the silent blank, then the screen again.
  const order = [];
  for (let i = 0; i < 8; i++) { await c.press('Space'); order.push(c.selected()); }
  check('root order is screen, 6 key rows, blank', order.join(',') === 'row:display,row:0,row:1,row:2,row:3,row:4,row:5,', order.join(','));
  await c.press('Space');
  check('the screen row says "Screen. zero"', c.selected() === 'row:display' && /screen\. zero/i.test(c.lastSpeech()), c.lastSpeech());
  await c.press('Space'); await c.press('Space');
  check('a key row speaks its keys', /^7 , 8 , 9 , times$/i.test(c.lastSpeech()), c.lastSpeech());

  // 12 + 3 × 4 = 24, all by switch.
  await c.scanKey('1');
  check('after a key, the highlight returns to its row', c.selected() === 'row:3', c.selected());
  check('the key says what happened', c.lastSpeech() === '1', c.lastSpeech());
  await c.scanKey('2');
  check('two digits make 12', c.main() === '12' && c.lastSpeech() === '12', c.main() + ' / ' + c.lastSpeech());
  await c.scanKey('+');
  check('plus says "plus"', /plus/i.test(c.lastSpeech()), c.lastSpeech());
  await c.scanKey('3'); await c.scanKey('*'); await c.scanKey('4');
  check('live preview shows the answer so far', c.doc.getElementById('preview').textContent === '= 24', c.doc.getElementById('preview').textContent);
  await c.scanKey('=');
  check('12 + 3 × 4 = 24', c.main() === '24', c.main());
  check('equals speaks the whole sum', /12 plus 3 times 4 equals 24/i.test(c.lastSpeech()), c.lastSpeech());
  check('the answer goes on the Recent list', c.doc.querySelectorAll('.tape-item').length === 1 &&
    c.doc.querySelector('.tape-answer').textContent === '24');

  // Picking the screen reads it.
  await c.choose('row:display');
  check('picking the screen reads the sum and answer', /12 plus 3 times 4 equals 24/i.test(c.lastSpeech()) && c.selected() === 'row:display', c.lastSpeech());

  // Back stop: loops through the keys plus a spoken Back, never leaves the row.
  await c.choose('row:1');
  const inRow = [c.selected()];
  for (let i = 0; i < 5; i++) { await c.press('Space'); inRow.push(c.selected()); }
  check('a row loops through its keys and a Back stop', inRow.join(',') === 'key:7,key:8,key:9,key:*,key:row-back,key:7', inRow.join(','));
  await c.goTo('key:row-back');
  check('the Back stop says "Back"', /^back$/i.test(c.lastSpeech()), c.lastSpeech());
  check('the Back stop draws a dashed row outline', !!c.doc.querySelector('.narbe-row-back-outline'));
  await c.press('Enter');
  check('Back returns to the same row', c.selected() === 'row:1', c.selected());

  // Hold Enter in a row: back to the rows, same row, nothing pressed.
  await c.choose('row:2');
  const before = c.main();
  await c.press('Enter', 3200);
  check('holding Enter in a row goes back to that row without pressing a key', c.selected() === 'row:2' && c.main() === before, c.selected() + ' ' + c.main());

  // Clear, then divide by zero.
  await c.scanKey('clear');
  check('C clears to 0 and says "cleared"', c.main() === '0' && /cleared/i.test(c.lastSpeech()), c.lastSpeech());
  await c.scanKey('8'); await c.scanKey('/'); await c.scanKey('0'); await c.scanKey('=');
  check('dividing by zero shows a friendly message', c.main() === "Can't divide by 0", c.main());
  check('and says how to recover', /can't divide by zero/i.test(c.lastSpeech()), c.lastSpeech());

  // Settings: opens blank, says its name, Theme cycles and is saved, Close returns blank.
  await c.scanKey('settings');
  check('Settings opens', c.state().inSettings && !c.doc.getElementById('settingsMenu').classList.contains('hidden'));
  check('Settings opens with nothing highlighted', c.selected() === '', c.selected());
  check('Settings says "Settings"', /^settings$/i.test(c.lastSpeech()), c.lastSpeech());
  const shown = c.state().settingsShown;
  for (const name of ['theme', 'highlight', 'voice', 'tts-toggle', 'scan-speed', 'auto-scan', 'read-instructions', 'close']) {
    if (!shown.includes(name)) check(`Settings has ${name}`, false, shown.join(','));
  }
  check('Settings has Theme, Highlight, Voice, TTS, Scan Speed, Auto Scan, Help and Close', true, shown.join(','));
  check('Volume rows show only where the hub can change the volume',
    shown.includes('volume-up') === !!(c.w.electronAPI && c.w.electronAPI.system), shown.join(','));
  await c.goTo('setting:theme'); await c.press('Enter');
  check('Theme cycles to Light', c.doc.body.classList.contains('theme-light') && c.state().theme === 'light');
  check('theme is saved', JSON.parse(c.w.localStorage.getItem('calc_settings')).theme === 'light');
  check('the setting stays highlighted after a change', c.selected() === 'setting:theme', c.selected());
  await c.goTo('setting:highlight'); await c.press('Enter');
  check('Highlight cycles to Pink', c.doc.body.classList.contains('highlight-pink'));
  await c.goTo('setting:read-instructions'); await c.press('Enter');
  check('Help reads the instructions', /press space to move/i.test(c.lastSpeech()), c.lastSpeech());
  await c.goTo('setting:close'); await c.press('Enter');
  check('Close returns to the calculator', !c.state().inSettings && c.doc.getElementById('settingsMenu').classList.contains('hidden'));
  check('...with nothing highlighted', c.selected() === '', c.selected());

  // Exit says "exiting" (jsdom can't navigate; the message itself is a code check).
  await c.scanKey('exit');
  check('Exit says "exiting"', c.log.speech.some(s => /exiting/i.test(s)));

  check('no script errors (switch run)', !c.log.errors.length, c.log.errors.slice(0, 3).join(' | '));
  c.close();
}

async function mouseAndKeyboardChecks() {
  const c = await openCalc({ autoScan: false, inputSensitivityIndex: 0 });
  c.click('9'); c.click('*'); c.click('9'); c.click('=');
  await sleep(50);
  check('mouse clicks work: 9 × 9 = 81', c.main() === '81', c.main());
  check('a click speaks the result', /9 times 9 equals 81/i.test(c.lastSpeech()), c.lastSpeech());
  check('a click does not move the scan', c.selected() === '', c.selected());
  for (const k of ['Escape', '1', '0', '0', '-', '2', '5', '%', '=']) await c.type(k);
  check('keyboard typing works: 100 − 25% = 75', c.main() === '75', c.main());
  await c.type('Backspace');
  check('Backspace deletes a digit', c.main() === '7', c.main());
  for (const k of ['Escape', '7', 'x', '6', '=']) await c.type(k);
  check('"x" types times: 7 × 6 = 42', c.main() === '42', c.main());
  check('no script errors (mouse/keyboard run)', !c.log.errors.length, c.log.errors.slice(0, 3).join(' | '));
  c.close();
}

async function autoScanChecks() {
  const c = await openCalc({ autoScan: true, scanSpeedIndex: 0, inputSensitivityIndex: 0 });
  const seen = new Set();
  for (let i = 0; i < 80 && !seen.has('row:1'); i++) { await sleep(50); seen.add(c.selected()); }
  check('Auto Scan moves through the rows by itself', seen.has('row:display') && seen.has('row:1'), [...seen].join(','));
  // Wait for row 1, then Enter; then wait for the 7 and press Enter.
  const waitFor = async id => { for (let i = 0; i < 200 && c.selected() !== id; i++) await sleep(20); return c.selected() === id; };
  let ok = await waitFor('row:1');
  if (ok) { await c.press('Enter'); ok = await waitFor('key:7'); }
  if (ok) await c.press('Enter');
  check('one switch can press 7 with Auto Scan', c.main() === '7', c.main());
  check('no script errors (auto scan run)', !c.log.errors.length, c.log.errors.slice(0, 3).join(' | '));
  c.close();
}

(async () => {
  console.log('Hub copy: ' + HUB);
  try {
    await switchChecks();
    await mouseAndKeyboardChecks();
    await autoScanChecks();
  } catch (error) {
    check('run finished', false, error.stack);
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
