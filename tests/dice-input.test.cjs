const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../bennyshub/apps/games/BENNYSDICE/js/game.js'), 'utf8');

// Run the production input/scanning functions without the unrelated 3D bootstrap.
// Keep these boundaries explicit so moving a section fails instead of silently
// testing an empty or separately reimplemented handler.
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, `Missing Dice section: ${start}`);
  return source.slice(a, b);
}
const inputSource = [
  section('// --- App State ---', '// Game settings (persisted)'),
  section('// --- Auto Scan Integration ---', '// Subscribe to scan manager changes'),
  section('function handleMenuAction(action)', '// Initialize')
].join('\n');

function harness() {
  let now = 0, nextTimer = 0;
  const timers = new Map(), handlers = { window: new Map(), document: new Map() };
  const spoken = [], navigation = [];
  const makeElement = (text, action) => ({ textContent: text, dataset: { action }, classList: { add() {}, remove() {} } });
  const menu = [makeElement('Mode', 'toggle-mode'), makeElement('Play', 'play'), makeElement('Settings', 'settings'), makeElement('Exit', 'exit')];
  const pause = [makeElement('Continue', 'resume-game'), makeElement('Settings', 'settings'), makeElement('Help', 'request-help'), makeElement('Main Menu', 'confirm-quit')];
  const listen = group => (type, callback) => {
    if (!handlers[group].has(type)) handlers[group].set(type, []);
    handlers[group].get(type).push(callback);
  };
  const schedule = (callback, ms, repeat) => {
    const id = ++nextTimer;
    timers.set(id, { callback, due: now + ms, repeat: repeat ? ms : 0 });
    return id;
  };
  const sandbox = {
    console, Date: { now: () => now },
    setTimeout: (cb, ms) => schedule(cb, ms, false), clearTimeout: id => timers.delete(id),
    setInterval: (cb, ms) => schedule(cb, ms, true), clearInterval: id => timers.delete(id),
    addEventListener: listen('window'),
    document: { addEventListener: listen('document'), querySelectorAll(selector) {
      if (selector === '#main-menu .menu-item') return menu;
      if (selector === '#pause-menu .menu-item') return pause;
      if (selector === '.focused') return [...menu, ...pause];
      throw new Error('Unexpected selector: ' + selector);
    } },
    NarbeScanManager: { getSettings: () => ({ autoScan: true, scanInterval: 1000 }), getScanInterval: () => 1000 },
    SoundFX: { play() {} }, speak: text => spoken.push(text), announceElement() {}, updateDiceGlows() {},
    focusedDieIndex: -1,
    setAppState(state) { navigation.push(state); sandbox.appState.state = state; }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(inputSource, context, { filename: 'dice-input-from-game.js' });
  sandbox.appState.scanIndex = -1;
  const dispatch = (group, type, event = {}) => {
    const e = { type, repeat: false, preventDefault() {}, ...event };
    for (const callback of handlers[group].get(type) || []) callback(e);
  };
  return {
    state: sandbox.appState, input: sandbox.inputState, spoken, navigation,
    key: (type, code, repeat = false) => dispatch('window', type, { code, repeat }),
    cancel: (code, reason = 'anti-rapid-press') => dispatch('document', 'narbe-input-cancelled', { detail: { code, reason } }),
    run: code => vm.runInContext(code, context),
    advance(ms) {
      const end = now + ms;
      while (true) {
        let chosen = null;
        for (const [id, timer] of timers) if (timer.due <= end && (!chosen || timer.due < chosen[1].due)) chosen = [id, timer];
        if (!chosen) break;
        const [id, timer] = chosen; now = timer.due;
        if (timer.repeat) timer.due += timer.repeat; else timers.delete(id);
        timer.callback();
      }
      now = end;
    }
  };
}

test('Dice Enter is inert without a selection and activates Help only on release', () => {
  const h = harness();
  h.key('keydown', 'Enter'); h.key('keyup', 'Enter');
  assert.equal(h.state.scanIndex, -1); assert.deepEqual(h.navigation, []); assert.deepEqual(h.spoken, []);
  h.state.state = 'PAUSE'; h.state.scanIndex = 2;
  h.key('keydown', 'Enter'); h.key('keydown', 'Enter', true);
  assert.deepEqual(h.spoken, []);
  h.key('keyup', 'Enter');
  assert.deepEqual(h.spoken, ['I need help']); assert.equal(h.state.state, 'PAUSE'); assert.deepEqual(h.navigation, []);
  h.key('keyup', 'Enter'); assert.equal(h.spoken.length, 1, 'an unmatched release cannot select twice');
});

test('Dice held Space suspends forward Auto Scan and releasing stops backward repeats', () => {
  const h = harness(); h.run('startAutoScan()'); h.key('keydown', 'Space');
  h.advance(2999); assert.equal(h.state.scanIndex, -1, 'Auto Scan must wait while Space is held');
  h.advance(1); assert.equal(h.state.scanIndex, 3, 'hold starts at the last menu item');
  h.advance(1000); assert.equal(h.state.scanIndex, 2, 'held Space continues backwards at scan speed');
  h.key('keyup', 'Space'); assert.equal(h.state.scanIndex, 2, 'hold release must not scan forwards');
  assert.equal(h.input.backwardsScanInterval, null);
  h.advance(1000); assert.equal(h.state.scanIndex, 3, 'forward Auto Scan resumes after release');
  h.run('stopAutoScan()'); h.advance(5000); assert.equal(h.state.scanIndex, 3);
});

test('Dice cancelled Space clears pending holds and backward repeats without moving', () => {
  const h = harness();
  h.key('keydown', 'Space'); h.advance(1000); h.cancel('Space'); h.advance(5000);
  assert.equal(h.state.scanIndex, -1); assert.equal(h.input.spaceHoldTimeout, null);
  h.key('keydown', 'Space'); h.advance(3000); assert.equal(h.state.scanIndex, 3);
  h.cancel('Space'); h.key('keyup', 'Space'); h.advance(5000);
  assert.equal(h.state.scanIndex, 3); assert.equal(h.input.spacePressed, false); assert.equal(h.input.backwardsScanInterval, null);
});

test('Dice cancelled Enter cannot activate a menu item on the later release', () => {
  const h = harness(); h.state.scanIndex = 1;
  h.key('keydown', 'Enter'); h.cancel('Enter'); h.key('keyup', 'Enter');
  assert.deepEqual(h.navigation, []); assert.equal(h.input.enterPressed, false);
});
