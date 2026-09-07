/**
 * Does the game BOOT? The same thing the browser does, headless: every script
 * in index.html's order, then main.js's init() and a few frames.
 *
 *     node tools/bootcheck.js
 *
 * "Filling the lake..." that never goes away is init() throwing before it
 * hides the loading screen, or a script that failed to parse. Both show up
 * here as a stack trace instead of a spinner.
 */
const H = require('./playtest.js');          // the stub browser, and the game already loaded
const fs = require('fs'), path = require('path');
const { RT, THREE, ROOT, ok } = H;

// The renderer can't exist without WebGL; main.js only stores and calls it.
THREE.WebGLRenderer = function () {
  this.domElement = { style: {} }; this.shadowMap = {}; this.info = { render: {} };
  this.setPixelRatio = () => {}; this.setSize = () => {}; this.render = () => {};
  this.getContext = () => null; this.dispose = () => {};
};
global.document.readyState = 'complete';
global.speechSynthesis = { speak() {}, cancel() {}, getVoices: () => [] };
global.SpeechSynthesisUtterance = function () {};
global.AudioContext = function () { return { createGain: () => ({ connect() {}, gain: { value: 1 } }), createOscillator: () => ({ connect() {}, start() {}, stop() {}, frequency: { value: 0 } }), destination: {}, resume() { return Promise.resolve(); }, state: 'running', currentTime: 0 }; };
global.navigator = global.navigator || { userAgent: 'node', language: 'en' };

function load(f) { new Function(fs.readFileSync(path.join(ROOT, f), 'utf8')).call(global); }
/* The REAL audio module, not the playtest's recorder: it runs code at load and
   at boot, and a browser boot runs it too. */
global.window.AudioContext = global.AudioContext;
global.webkitAudioContext = global.AudioContext;
/* And a stale save from the old six-zone game, which a returning player has. */
global.localStorage.setItem('fishmaster', JSON.stringify({ version: 2, zone: 3, currentMission: 14, rods: ['starter', 'castmaster'], baits: ['plainworm'], hold: [{ id: 'sunfish', value: 3 }], gear: { finder: 1 }, money: 120 }));
let booted = false, err = null;
try {
  load('js/audio.js');
  load('js/ui.js');
  load('js/main.js');
  booted = true;
} catch (e) { err = e; }
ok(booted, 'ui.js and main.js load and init() runs: ' + (err ? err.stack.split('\n').slice(0, 3).join(' | ') : 'ok'));
const loading = global.document.getElementById('loading');
ok(loading.style.display === 'none', 'the loading screen was hidden (display=' + loading.style.display + ')');
// A few frames of the attract loop, then the dock, then a trip.
let frameErr = null;
try {
  for (let i = 0; i < 30; i++) RT.game.update(1 / 60);
  RT.game.goToDock(); for (let i = 0; i < 30; i++) RT.game.update(1 / 60);
  RT.game.castOff(); for (let i = 0; i < 120; i++) RT.game.update(1 / 60);
} catch (e) { frameErr = e; }
ok(!frameErr, 'attract, dock and a trip run without throwing: ' + (frameErr ? frameErr.stack.split('\n').slice(0, 3).join(' | ') : 'ok'));
const res = H.results();
console.log(res.fail === 0 ? res.checks + ' checks passed. The game boots.' : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
