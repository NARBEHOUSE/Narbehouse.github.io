/**
 * Play the game, headlessly.
 *
 *   node tools/playtest.js            # one full playthrough
 *   node tools/playtest.js --verbose  # ...narrated job by job
 *
 * WHY THIS EXISTS. Every bug that has reached the player recently was of one
 * kind: something that a browser would have thrown or drawn wrong on the first
 * frame, and that no amount of parsing, linting or geometry-checking could see.
 * buildLake threw a ReferenceError on every call. The content bundle quietly
 * changed shape and the game built a synthetic ring at the origin while the
 * chart looked ten thousand units away. The water was swept down one side of
 * the boat only. None of those need a screen to find - they need the code to
 * be RUN.
 *
 * So this runs it. Not a mock of the game: the real js/game.js, with the same
 * data, the same economy and the same roll functions, driven through a whole
 * playthrough. game.js already exposes the probes for it - `__land`,
 * `__rollBite`, `__rollFish` - with a note that a simulation must not drift
 * from what the game actually does.
 *
 * WHAT IT CANNOT DO. It has no renderer, so it cannot tell you the water looks
 * like glass. What it can tell you is that every job in the ladder is
 * reachable and finishable, that money and fuel behave, that no state
 * transition throws, and that the game can be finished at all - which is the
 * part that decides whether this is a game or a demo.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

/* ── A browser, near enough ───────────────────────────────────────────── */

function stubCanvas() {
  let cv;
  const ctx = new Proxy({}, {
    get(_t, k) {
      /* Like the browser: a gradient stop that is not a colour THROWS. This is
         the one canvas call that does, and the sky was being built from an
         object instead of three colours for a week because a stub swallowed it. */
      if (k === 'createLinearGradient' || k === 'createRadialGradient')
        return () => ({ addColorStop(o, c) {
          if (typeof c !== 'string' || !/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|[a-z]+$)/i.test(c.trim()))
            throw new TypeError("Failed to execute 'addColorStop' on 'CanvasGradient': The value provided ('" + String(c) + "') could not be parsed as a color.");
        } });
      if (k === 'measureText') return (s) => ({ width: (s || '').length * 6 });
      if (k === 'getImageData')
        return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (k === 'canvas') return cv;
      return () => {};
    },
    set() { return true; },
  });
  cv = { width: 256, height: 256, clientWidth: 200, clientHeight: 200,
         getContext: () => ctx, style: {}, setAttribute() {},
         addEventListener() {}, toDataURL: () => 'data:,' };
  return cv;
}

const store = {};
global.self = global;
global.window = global;
global.window.innerWidth = 1280;
global.window.innerHeight = 720;
global.window.devicePixelRatio = 1;
global.window.addEventListener = () => {};
global.window.matchMedia = () => ({ matches: false, addEventListener() {} });
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;

/* getComputedStyle is where the whole palette comes from: game.js reads every
   colour out of a CSS custom property. Hand back a plausible value for each,
   because a lake built from `undefined` colours throws inside THREE.Color. */
const CSS_FALLBACK = {
  '--water-shallow': '#39a0a6', '--water-mid': '#1d6070', '--water-deep': '#0a2c3d',
  '--water-near': '#39a0a6', '--water-far': '#0a2c3d', '--glint': '#cdeaf5',
  '--bank-grass': '#4a7a35', '--bank-soil': '#54412b', '--sand': '#c9b184',
  '--foliage-dark': '#3f7a3a', '--foliage-light': '#5f9a45',
  '--sky-low': '#cfe9f2', '--sky-mid': '#a8d4e6', '--sky-high': '#7fb8d8',
  '--fogcol': '#cfe9f2', '--lily': '#4a7a55', '--reed': '#7a9c3f', '--log': '#4a3a2a',
};
global.getComputedStyle = () => ({
  // Unknown variables read as '' - exactly what a browser hands back for one
  // index.html never defined - so a missing colour fails here, not on a player.
  getPropertyValue: (k) => CSS_FALLBACK[k] || '',
});

const elements = {};
function el(id) {
  if (!elements[id]) {
    elements[id] = {
      id, style: { setProperty() {}, removeProperty() {} }, dataset: {}, innerHTML: '', textContent: '',
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      clientWidth: 200, clientHeight: 200, width: 200, height: 200,
      getContext: () => stubCanvas().getContext(),
      appendChild() {}, removeChild() {}, insertBefore() {},
      addEventListener() {}, removeEventListener() {},
      setAttribute() {}, getAttribute: () => null,
      focus() {}, blur() {}, getBoundingClientRect: () => ({
        left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
      children: [], querySelectorAll: () => [], querySelector: (s) => el(id + ' ' + s),
    };
  }
  return elements[id];
}
/* An image that never loads, and says so.
   three.js's TextureLoader goes through ImageLoader, which asks for an <img>
   via createElementNS and then waits for onload. Nothing here can decode a
   PNG, so the honest stand-in is an image that reports an error: the loader
   takes its error path, the texture stays blank, and the game carries on -
   which is exactly what it does in a browser when a file is missing. */
function stubImage() {
  const img = {
    width: 1, height: 1, style: {}, crossOrigin: null,
    addEventListener(k, fn) { if (k === 'error') img._err = fn; },
    removeEventListener() {},
    set src(v) {
      img._src = v;
      // Asynchronous, like the real thing, so nothing re-enters mid-frame.
      setTimeout(() => { if (img._err) img._err(new Error('headless')); }, 0);
    },
    get src() { return img._src; },
  };
  return img;
}
global.Image = function () { return stubImage(); };

global.document = {
  body: el('body'),
  documentElement: el('html'),
  createElement: (t) => (t === 'canvas' ? stubCanvas()
                       : t === 'img' ? stubImage() : el('new:' + t)),
  createElementNS: (_ns, t) => (t === 'img' ? stubImage()
                              : t === 'canvas' ? stubCanvas() : el('ns:' + t)),
  getElementById: (id) => el(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
};

/* ── Load the game ────────────────────────────────────────────────────── */

function load(f) {
  new Function(fs.readFileSync(path.join(ROOT, f), 'utf8')).call(global);
}

load('js/three.min.js');
const THREE = global.THREE;
global.RT = {};

/* The two subsystems with nothing to say to a headless run. Recording proxies
   rather than empty objects, so a call to something that does not exist shows
   up as a wrong count rather than as a crash - and so the run can assert that
   the sounds and the scene were actually driven. */
function recorder(name) {
  const calls = {};
  return new Proxy({ _calls: calls, _name: name }, {
    get(t, k) {
      if (k in t) return t[k];
      return function () {
        calls[k] = (calls[k] || 0) + 1;
        return undefined;
      };
    },
  });
}
RT.audio = recorder('audio');

load('js/util.js');
load('js/icons.js');
load('js/content.generated.js');   // before data.js: the roster is read at load
load('js/data.js');
load('js/quests.js');
load('js/economy.js');
load('js/lake.js');
load('js/art.js');
load('js/world.js');
load('js/minimap.js');

/* The scene is the one thing that has to be more than a recorder: game.js asks
   it real questions. Answers are the simplest ones that keep the game moving. */
const sceneCalls = {};
RT.scene = new Proxy({}, {
  get(_t, k) {
    sceneCalls[k] = (sceneCalls[k] || 0) + 1;
    switch (k) {
      case 'lake': return () => global.__lake || null;
      case 'perf': return () => ({ fps: 60 });
      case 'pickTarget': return () => -1;
      case 'dockLabelPositions': return () => [];
      case 'focusScreenRect': return () => ({ left: 0, top: 0, width: 0, height: 0 });
      case 'screenRectOf': return () => ({ left: 0, top: 0, width: 0, height: 0 });
      default: return function () { return undefined; };
    }
  },
});

load('js/game.js');
const G = RT.game;
if (!G) { console.error('game.js did not export RT.game'); process.exit(1); }

/* ── Results ──────────────────────────────────────────────────────────── */

let fail = 0, checks = 0;
const ok = (c, msg) => {
  checks++;
  if (!c) { fail++; console.log('  FAIL  ' + msg); }
  return c;
};
const say = (s) => { if (VERBOSE) console.log('    ' + s); };

console.log('game.js loaded and RT.game is live.');
console.log();

module.exports = { G, RT, THREE, ok, say, ROOT, VERBOSE,
                   results: () => ({ fail, checks }),
                   sceneCalls, audioCalls: RT.audio._calls };

/* Running directly rather than being required: do the playthrough. */
if (require.main === module) {
  require('./playtest_run.js');
}
