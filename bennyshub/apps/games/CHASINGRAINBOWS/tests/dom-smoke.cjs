'use strict';
/* Chasing Rainbows - whole games played through the real page, headless, by switch presses.
 *
 * Loads index.html in jsdom (a Node DOM: no browser, no rendering, no GPU - safe on this PC)
 * with the hub's real shared scanner, voice manager and input guard. Only speech, canvas
 * and media are faked. A driver presses Space and Enter (keydown/keyup, like a switch
 * interface) to start games, take turns, look, pause and continue, and plays each game to
 * the results screen. Any script error fails the run.
 *
 * jsdom is not a hub dependency. Install it anywhere and point at it:
 *   npm i jsdom@24 --prefix <dir>   then   JSDOM=<dir>/node_modules/jsdom node tests/dom-smoke.cjs
 */
const path = require('path'), fs = require('fs');
const jsdom = require(process.env.JSDOM || 'jsdom');
const { JSDOM, VirtualConsole } = jsdom;
const GAME = path.join(__dirname, '..');
const HUB = path.join(GAME, '..', '..', '..');
const ORIGIN = 'http://hub.local/';
/** Serves the hub folder at http://hub.local/ (a real origin, so localStorage works). */
class HubFiles extends jsdom.ResourceLoader {
  fetch(url, options) {
    if (!url.startsWith(ORIGIN)) return super.fetch(url, options);
    const file = path.join(HUB, decodeURIComponent(url.slice(ORIGIN.length).split('?')[0]));
    const p = new Promise((resolve, reject) => fs.readFile(file, (err, buf) => (err ? reject(err) : resolve(buf))));
    p.abort = () => {};
    return p;
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fakeContext() {
  const grad = { addColorStop() {} };
  const target = {
    canvas: null, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, filter: 'none',
    globalCompositeOperation: 'source-over', shadowBlur: 0, shadowColor: '', font: '', lineCap: 'butt', lineJoin: 'miter',
    createLinearGradient: () => grad, createRadialGradient: () => grad, createConicGradient: () => grad, createPattern: () => ({ setTransform() {} }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w.width || w) * (h || w.height || 1) * 4)), width: w.width || w, height: h || w.height }),
    measureText: t => ({ width: String(t).length * 8 }),
  };
  return new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
}

function stub(w, errors) {
  w.addEventListener('error', e => errors.push('window error: ' + (e.error && e.error.stack || e.message)));
  w.addEventListener('unhandledrejection', e => errors.push('unhandled rejection: ' + (e.reason && e.reason.stack || e.reason)));
  const voices = [{ name: 'Fake English', lang: 'en-US', default: true }];
  let current = null;
  w.SpeechSynthesisUtterance = function (text) { this.text = text; };
  w.speechSynthesis = {
    speaking: false, pending: false,
    getVoices: () => voices,
    speak(u) {
      this.speaking = true; current = u;
      setTimeout(() => { if (current !== u) return; u.onstart && u.onstart(); }, 2);
      setTimeout(() => { if (current !== u) return; current = null; this.speaking = false; u.onend && u.onend(); }, 4 + String(u.text).length);
    },
    cancel() { const u = current; current = null; this.speaking = false; if (u && u.onerror) u.onerror({ error: 'interrupted' }); },
    addEventListener() {}, removeEventListener() {},
  };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () {};
  w.HTMLMediaElement.prototype.load = function () {};
  w.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {}, finish() {} }; };
  w.HTMLCanvasElement.prototype.getContext = function () { const c = fakeContext(); c.canvas = this; return c; };
}

async function play(label, settings, opts) {
  const errors = [], warns = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Not implemented: (navigation|window\.scrollTo)/.test(e.message)) errors.push('jsdom: ' + e.message); });
  vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));
  vc.on('warn', (...a) => warns.push(a.map(String).join(' ')));
  const file = path.join(GAME, 'index.html');
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
    url: ORIGIN + 'apps/games/CHASINGRAINBOWS/index.html', runScripts: 'dangerously', resources: new HubFiles(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.localStorage.setItem('chasingrainbows_settings', JSON.stringify(settings));
      w.localStorage.setItem('narbe-scan-settings', JSON.stringify(opts.scan || {}));
      stub(w, errors);
    },
  });
  const w = dom.window;
  for (let i = 0; i < 100 && !(w.CRApp && w.CRApp.__dbg); i++) await sleep(50);
  if (!w.CRApp) throw new Error(label + ': the app never started. ' + errors.join('\n'));
  const dbg = () => w.CRApp.__dbg();
  async function press(code, hold) {
    const ev = type => new w.KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : 'Enter', bubbles: true, cancelable: true });
    w.document.body.dispatchEvent(ev('keydown'));
    await sleep(hold || 25);
    w.document.body.dispatchEvent(ev('keyup'));
    await sleep(70);
  }
  /** Move the highlight to `id` with Space presses, then choose it with Enter. */
  /** Two switches: Space steps to `id`, Enter chooses. One switch (Auto Scan): wait for the
   *  highlight to come round to `id` by itself, then Enter - Space is the scan brake there. */
  const auto = !!(opts.scan && opts.scan.autoScan);
  async function choose(id) {
    for (let k = 0; k < (auto ? 400 : 40); k++) {
      const st = dbg().choice;
      if (st && st.id === id) { await press('Enter'); return true; }
      if (auto) await sleep(25); else await press('Space');
      if (auto && !dbg().ids.includes(id) && id !== 'narbe:row-back') return false;
    }
    return false;
  }
  /** Every other screen, by switch: How to Play, the Card Gallery, Credits, each Settings row. */
  async function tour() {
    const must = async (id, screen) => {
      if (!(await choose(id))) throw new Error(label + ': could not reach ' + id + ' on ' + dbg().screen);
      await sleep(120);
      if (screen && dbg().screen !== screen) throw new Error(label + ': ' + id + ' led to ' + dbg().screen + ', not ' + screen);
    };
    await must('howto', 'howto');
    for (let k = 0; k < 5; k++) await must('next', 'howto');
    await must('gallery', 'gallery');
    for (let k = 0; k < 18; k++) await must('next', 'gallery');
    await must('prev', 'gallery');
    await must('back', 'title');
    await must('credits', 'credits');
    await must('back', 'title');
    await must('settings', 'settings');
    for (const id of ['helper', 'blocks', 'pace', 'autodraw', 'confirm', 'captions', 'motion', 'size', 'sfx', 'wsfx', 'reset', 'reset']) await must(id, 'settings');
    await must('back', 'title');
    await must('new', 'setup');
    for (const id of ['mode', 'mode', 'mode', 'players', 'people', 'first', 'open', 'open']) await must(id, 'setup');
  }
  /** Mid-game: Pause > Settings > Back > Main Menu, then Continue Game from the title. */
  async function saveAndResume() {
    const must = async (id, screen) => {
      if (!(await choose(id))) throw new Error(label + ': could not reach ' + id + ' on ' + dbg().screen);
      await sleep(150);
      if (screen && dbg().screen !== screen) throw new Error(label + ': ' + id + ' led to ' + dbg().screen + ', not ' + screen);
    };
    await must('pause', 'pause');
    await must('settings', 'settings');
    await must('back', 'pause');
    await must('howto', 'howto');
    await must('back', 'pause');
    await must('menu', 'title');
    if (!dbg().ids.includes('continue')) throw new Error(label + ': no Continue Game after leaving mid-game');
    await must('continue', null);
  }
  if (opts.tour) await tour();
  let toured = false;
  const stats = { turns: 0, looks: 0, pauses: 0, rows: 0, covers: 0, backs: 0, moves: 0 };
  const seen = new Set();
  let results = false, rnd = opts.seed || 1;
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  const start = Date.now();
  while (Date.now() - start < (opts.timeout || 240000)) {
    const d = dbg();
    if (d.screen === 'results') { results = true; break; }
    if (d.ctx === 'card') {
      const want = { title: 'new', setup: 'start', cover: 'ready', pause: 'continue' }[d.screen];
      if (!want) throw new Error(label + ': stuck on screen ' + d.screen);
      if (d.screen === 'cover') stats.covers++;
      await choose(want);
      await sleep(120);
      continue;
    }
    if (d.ctx !== 'table' || d.waiting || d.busy || !d.ids.length) { await sleep(60); continue; }
    seen.add(d.decision);
    if (opts.tour && !toured && d.turnNo >= 4 && d.ids.includes('pause')) { toured = true; await saveAndResume(); stats.resumed = 1; continue; }
    // In a Look row: hear one thing, then leave by the Back stop.
    if (d.ids[0] === 'look:hand') {
      // The Look row must be on screen: the bar swaps to its panel (a hidden panel once left
      // the player hearing "My hand" with nothing to see).
      const doc = w.document, bar = doc.getElementById('bar');
      const panel = doc.querySelector('#panels .panel:last-child');
      if (!bar.classList.contains('nested') || !panel || panel.querySelectorAll('.list .choice').length !== d.ids.length) {
        throw new Error(label + ': the Look row is not on screen (bar nested: ' + bar.classList.contains('nested') + ')');
      }
      const atMenu = () => { const x = dbg(); return x.ids.includes('look') && x.ids.includes('pause') && !bar.classList.contains('nested'); };
      if (rand() < 0.5) {
        // Choose something to look at: the answer shows, and you're back at the turn menu on Look.
        await choose(d.ids[Math.floor(rand() * d.ids.length)]);
        stats.looks++;
        await sleep(60);
        const out = doc.getElementById('lookToast');
        if (!out || !out.textContent.trim() || !out.classList.contains('show')) throw new Error(label + ': Look chose an item but showed no answer');
        if (!atMenu() || dbg().choice.id !== 'look') throw new Error(label + ': choosing a Look item did not return to the turn menu on Look');
      } else {
        // Or leave by the row's Back stop.
        for (let k = 0; k < (auto ? 400 : 12) && dbg().choice && dbg().choice.id !== 'narbe:row-back'; k++) { if (auto) await sleep(25); else await press('Space'); }
        await press('Enter');
        await sleep(60);
        if (!atMenu()) throw new Error(label + ': the Back stop did not return to the turn menu');
        stats.backs++;
      }
      continue;
    }
    const moves = d.ids.filter((id, i) => !['look', 'pause'].includes(id));
    const r = rand();
    if (r < 0.04) { await choose('look'); continue; }
    if (r < 0.06 && opts.pauses !== false) {
      const picked = await choose('pause');
      await sleep(150);
      const after = dbg();
      // The menu can change under the driver (a computer move, the game ending); only a
      // completed selection of Pause that didn't pause is a failure.
      if (picked && after.screen !== 'pause' && after.phase !== 'over' && after.decision !== 'over') {
        throw new Error(label + ': Pause did not open the pause menu ' + JSON.stringify({ screen: after.screen, ctx: after.ctx, id: after.choice && after.choice.id, waiting: after.waiting }));
      }
      if (after.screen === 'pause') stats.pauses++;
      continue;
    }
    if (!moves.length) { await sleep(60); continue; }
    // Mostly follow the Rainbow Helper's star, like a player learning the game; sometimes wander.
    const starred = d.ids.filter((id, i) => d.stars[i] && moves.includes(id));
    const target = starred.length && rand() < 0.75 ? starred[0] : moves[Math.floor(rand() * moves.length)];
    const kind = d.kinds[d.ids.indexOf(target)];
    if (kind === 'group') stats.rows++; else stats.moves++;
    const before = d.turnNo;
    await choose(target);
    await sleep(60);
    if (dbg().turnNo !== before) stats.turns++;
  }
  const final = dbg();
  dom.window.close();
  return { label, results, errors, warns, stats, decisions: [...seen], final, secs: ((Date.now() - start) / 1000).toFixed(1) };
}

(async () => {
  const base = { pace: 'quick', motion: 'off', captions: true, sfx: true, weatherSounds: true, helper: 'tips', autoDraw: true };
  const house = { weather: { cloud: true, double: true, fog: true, storm: true, wind: true }, core: true, legend: true, draw: 'discard', blockChains: true, fogStacks: true };
  const runs = [
    ['every screen, then pause, main menu and Continue Game', Object.assign({}, base, { setup: { mode: 'classic', players: 2, people: 1, skill: 'normal', first: 'you' } }), { seed: 21, tour: true }],
    ['classic, you vs 1', Object.assign({}, base, { setup: { mode: 'classic', players: 2, people: 1, skill: 'normal', first: 'you' } }), { seed: 3 }],
    ['classic, you vs 3, always asked to block, shortcut helper', Object.assign({}, base, { helper: 'shortcut', blockPrompts: 'always', confirmDiscard: true, setup: { mode: 'classic', players: 4, people: 1, skill: 'hard', first: 'random' } }), { seed: 7 }],
    ['two people + 1 computer, sharing the switch', Object.assign({}, base, { blockPrompts: 'always', setup: { mode: 'classic', players: 3, people: 2, skill: 'easy', first: 'you' } }), { seed: 11 }],
    ['three people, open hands', Object.assign({}, base, { setup: { mode: 'classic', players: 3, people: 3, skill: 'easy', first: 'you', openHands: true } }), { seed: 5 }],
    ['rainbow race, 4 players', Object.assign({}, base, { setup: { mode: 'race', players: 4, people: 1, skill: 'normal', first: 'you' } }), { seed: 13 }],
    ['house rules with block chains, auto scan', Object.assign({}, base, { motion: 'full', blockPrompts: 'always', setup: { mode: 'house', players: 3, people: 1, skill: 'normal', first: 'you', house } }), { seed: 17, scan: { autoScan: true, scanSpeedIndex: 0 } }],
  ];
  let failed = 0;
  for (const [label, settings, opts] of runs) {
    let r;
    try { r = await play(label, settings, opts); } catch (e) { failed++; console.log('FAIL', label, '\n ', e.message); continue; }
    const ok = r.results && !r.errors.length;
    if (!ok) failed++;
    console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label + ' - ' + r.secs + 's, ' + JSON.stringify(r.stats) + ', decisions ' + r.decisions.join('/') +
      (r.results ? ', reached results' : ', NO RESULTS (' + JSON.stringify({ screen: r.final.screen, ctx: r.final.ctx, decision: r.final.decision, waiting: r.final.waiting, caption: r.final.caption }) + ')'));
    r.errors.slice(0, 8).forEach(e => console.log('   ' + e.split('\n').slice(0, 4).join('\n   ')));
    r.warns.filter(x => !/sky|missing/.test(x)).slice(0, 3).forEach(x => console.log('   warn: ' + x));
  }
  console.log(failed ? failed + ' run(s) failed' : 'all runs reached the results screen with no script errors');
  process.exit(failed ? 1 : 0);
})();
