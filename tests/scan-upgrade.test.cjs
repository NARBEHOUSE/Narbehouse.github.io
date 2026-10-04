const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function harness({ saved = {}, speechMode = 'normal', speechDuration = 500, voices = [{ name: 'Test English', lang: 'en-US' }] } = {}) {
  let now = 100000, sequence = 0;
  const timers = new Map(), listeners = new Map(), docListeners = new Map();
  const memory = new Map(Object.entries(saved).map(([key, value]) => [key, JSON.stringify(value)]));
  const frames = [], sent = [], spoken = [];
  const add = (map, key, fn) => map.set(key, [...(map.get(key) || []), fn]);
  const remove = (map, key, fn) => map.set(key, (map.get(key) || []).filter(item => item !== fn));
  const dispatch = (map, type, event = {}) => {
    Object.assign(event, { type });
    for (const fn of map.get(type) || []) { fn(event); if (event.stopped) break; }
    return event;
  };
  let activeUtterance = null;
  const engine = {
    speaking: false, voices,
    getVoices() { return this.voices; }, addEventListener() {}, removeEventListener() {},
    speak(utterance) {
      if (speechMode === 'throw') throw Error('engine failed');
      spoken.push(utterance); activeUtterance = utterance;
      if (speechMode === 'nostart') return;
      this.speaking = true;
      if (speechMode !== 'noevents') utterance.onstart?.();
      if (speechMode === 'normal') context.setTimeout(() => {
        if (activeUtterance === utterance) { this.speaking = false; utterance.onend?.(); }
      }, speechDuration);
    },
    cancel() { activeUtterance = null; this.speaking = false; }
  };
  class ClockDate extends Date { static now() { return now; } }
  const context = vm.createContext({
    console, Date: ClockDate, Promise,
    setTimeout(fn, ms = 0) { const id = ++sequence; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    location: { origin: 'https://hub.test' },
    localStorage: {
      getItem: key => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value)
    },
    document: {
      visibilityState: 'visible',
      querySelectorAll: () => frames.map(contentWindow => ({ contentWindow })),
      querySelector: () => null,
      addEventListener: (type, fn) => add(docListeners, type, fn),
      removeEventListener: (type, fn) => remove(docListeners, type, fn)
    },
    addEventListener: (type, fn) => add(listeners, type, fn),
    removeEventListener: (type, fn) => remove(listeners, type, fn),
    speechSynthesis: engine,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }
  });
  context.window = context; context.parent = context;
  for (const name of ['platform', 'scan-manager', 'voice-manager', 'choice-scan']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'bennyshub/shared/' + name + '.js'), 'utf8'), context);
  }
  async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
  async function tick(ms) {
    const end = now + ms;
    await flush();
    let iterations = 0;
    for (;;) {
      const next = [...timers.entries()].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      if (++iterations > 10000) throw Error('timer loop');
      timers.delete(next[0]); now = next[1].at; next[1].fn(); await flush();
    }
    now = end; await flush();
  }
  function key(type, code, extra = {}) {
    return dispatch(listeners, type, {
      code, repeat: false, target: { closest: () => null },
      preventDefault() { this.prevented = true; }, stopPropagation() {},
      stopImmediatePropagation() { this.stopped = true; }, ...extra
    });
  }
  const manager = context.NarbeScanManager, voice = context.NarbeVoiceManager;
  function create(overrides = {}) {
    const selected = [], highlights = [], status = [];
    const controller = manager.createChoiceScan({
      choice: true, holdThreshold: 3000,
      items: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Bravo' }],
      onSelect: item => selected.push(item.id),
      onHighlight: (item, state) => highlights.push({ id: item?.id ?? null, ...plain(state) }),
      badge: { update: text => status.push(text), destroy() {} },
      ...overrides
    });
    return { c: controller, selected, highlights, status };
  }
  return { context, manager, voice, tick, key, create, memory, spoken, engine, timers,
    frames, sent, dispatch: (type, event) => dispatch(listeners, type, event) };
}

test('legacy settings migrate with accepted defaults; corrupt fields cannot produce undefined timing', () => {
  const h = harness({ saved: { 'narbe-scan-settings': { autoScan: true, scanSpeedIndex: 3 } } });
  assert.deepEqual(plain(h.manager.getSettings()), {
    autoScan: true, scanSpeedIndex: 3, inputSensitivityIndex: 0,
    parking: 'off', loopsBeforeParking: 2, spaceBrake: true, waitForSpeech: false,
    scanInterval: 4000, inputSensitivity: 50
  });
  h.manager.updateSettings({ scanSpeedIndex: 1.5, inputSensitivityIndex: '3', parking: 'bad', loopsBeforeParking: 4 });
  assert.equal(h.manager.getScanInterval(), 4000);
  assert.equal(h.manager.getInputSensitivity(), 50);
  h.manager.updateSettings({ parking: 'chosen', loopsBeforeParking: 3, spaceBrake: false, waitForSpeech: true });
  assert.equal(JSON.parse(h.memory.get('narbe-scan-settings')).parking, 'chosen');
  const bad = harness({ saved: { 'narbe-scan-settings': { scanSpeedIndex: 0.5, inputSensitivityIndex: null } } });
  assert.equal(bad.manager.getScanInterval(), 2000); assert.equal(bad.manager.getInputSensitivity(), 50);
});

test('same-origin direct frames synchronize new fields; foreign and unrelated messages do not change settings', () => {
  const h = harness();
  const peer = { postMessage: data => h.sent.push(data) }; h.frames.push(peer);
  const message = { type: 'narbe-scan-settings-changed', settings: { parking: 'auto', waitForSpeech: true } };
  h.dispatch('message', { origin: 'https://evil.test', source: peer, data: message });
  assert.equal(h.manager.getSettings().parking, 'off');
  h.dispatch('message', { origin: 'https://hub.test', source: {}, data: message });
  assert.equal(h.manager.getSettings().parking, 'off');
  h.dispatch('message', { origin: 'https://hub.test', source: peer, data: message });
  assert.equal(h.manager.getSettings().parking, 'auto');
  h.dispatch('message', { origin: 'https://hub.test', source: peer,
    data: { type: 'narbe-scan-settings-changed', settings: { scanSpeedIndex: 0 } } });
  assert.equal(h.manager.getSettings().waitForSpeech, true);
  h.dispatch('message', { origin: 'https://hub.test', source: peer,
    data: { type: 'narbe-scan-settings-request' } });
  assert.equal(h.sent.at(-1).settings.scanInterval, 1000);
});

test('guard permits arbitrarily short valid presses, consumes bounced pairs and honors all four sensitivities', async () => {
  for (const [index, ms] of [50, 100, 200, 300].entries()) {
    const h = harness(); h.manager.setInputSensitivityIndex(index);
    assert.equal(h.key('keydown', 'Space').stopped, undefined);
    await h.tick(1);
    assert.equal(h.key('keyup', 'Space').stopped, undefined);
    await h.tick(ms - 1);
    assert.equal(h.key('keydown', 'Enter').stopped, true);
    assert.equal(h.key('keyup', 'Enter').stopped, true);
    await h.tick(ms);
    assert.equal(h.key('keydown', 'Enter').stopped, undefined);
    assert.equal(h.key('keyup', 'Enter').stopped, undefined);
    h.manager.resetInputState();
    assert.equal(h.key('keydown', 'Space').stopped, undefined);
    assert.equal(h.key('keydown', 'KeyA').stopped, undefined);
  }
});

test('loading managers does not create a scanner or capture ordinary application input beyond the existing guard', () => {
  const h = harness();
  assert.throws(() => h.manager.createChoiceScan({}), /explicit stationary/);
  assert.equal(h.key('keydown', 'Space').prevented, undefined);
  assert.equal(h.key('keyup', 'Space').prevented, undefined);
  assert.equal(h.key('keydown', 'Space', { target: { closest: () => ({}) } }).prevented, undefined);
});

test('Step traverses the recurring -1 in both directions and Return at -1 never activates', () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  const { c, selected } = h.create();
  assert.equal(c.getState().index, -1); c.select();
  for (const expected of [0, 1, -1, 0]) { c.step(); assert.equal(c.getState().index, expected); }
  for (const expected of [-1, 1, 0, -1]) { c.step(-1); assert.equal(c.getState().index, expected); }
  assert.deepEqual(selected, []); assert.equal(c.park(), false);
});


test('Step deadzones clear highlights silently at startup, both scan boundaries and a fresh parent menu', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: true });
  const { c, highlights, selected } = h.create();
  await h.tick(50);
  assert.deepEqual(h.spoken.map(item => item.text), []);
  assert.equal(highlights.at(-1).id, null);
  c.step(); await h.tick(50); assert.equal(h.spoken.at(-1).text, 'Alpha');
  c.step(-1); await h.tick(50);
  assert.equal(highlights.at(-1).id, null); assert.equal(h.spoken.length, 1);
  c.step(-1); await h.tick(50); assert.equal(h.spoken.at(-1).text, 'Bravo');
  c.step(); await h.tick(50);
  assert.equal(highlights.at(-1).id, null); assert.equal(h.spoken.length, 2);
  assert.equal(c.announceCurrent(), null); await h.tick(50); assert.equal(h.spoken.length, 2);
  c.announceCurrent('Auto Scan: Off'); await h.tick(50);
  assert.equal(h.spoken.at(-1).text, 'Auto Scan: Off', 'explicit setting values remain available at an unselected deadzone');
  c.step(); c.enterGroup([{ id: 'child', label: 'Child choice' }]); await h.tick(50);
  const count = h.spoken.length;
  c.back({ restore: false }); await h.tick(50);
  assert.equal(c.getState().depth, 0); assert.equal(highlights.at(-1).id, null);
  assert.equal(h.spoken.length, count); assert.equal(c.select(), false);
  assert.deepEqual(selected, []);
  c.open([{ id: 'fresh', label: 'Fresh choice' }]); await h.tick(50);
  assert.equal(h.spoken.length, count); assert.equal(c.getState().index, -1);
});

test('Auto still announces its recurring park choice and persistent parked state', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: true });
  h.manager.updateSettings({ autoScan: true, parking: 'chosen' });
  const { c } = h.create(); await h.tick(50);
  assert.equal(h.spoken.at(-1).text, 'park');
  assert.equal(c.select(), true); await h.tick(50);
  assert.equal(c.getState().parked, true); assert.equal(h.spoken.at(-1).text, 'parked');
  h.manager.setAutoScan(false);
  const count = h.spoken.length; assert.equal(c.announceCurrent(), null); await h.tick(50);
  assert.equal(c.getState().index, -1); assert.equal(c.getState().parked, false);
  assert.equal(h.spoken.length, count, 'returning to Step does not announce its blank deadzone');
});

test('Auto park counts complete loops, ignores the initial -1, and resume never selects', async () => {
  for (const loops of [1, 2, 3]) {
    const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
    h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, parking: 'auto', loopsBeforeParking: loops });
    const { c, selected } = h.create();
    assert.equal(c.getState().parked, false);
    await h.tick(3000 * loops);
    assert.equal(c.getState().parked, true); assert.equal(c.getState().loops, loops);
    await h.tick(10000); assert.equal(c.getState().index, -1);
    assert.equal(c.brakePress(), true); assert.equal(c.brakeRelease(), true);
    assert.equal(c.getState().parked, true);
    c.select(); assert.equal(c.getState().index, 0); assert.deepEqual(selected, []);
    await h.tick(999); assert.equal(c.getState().index, 0);
    await h.tick(1); assert.equal(c.getState().index, 1);
  }
});

test('Parking Off loops continuously; chosen parking and its live Off transition work', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, spaceBrake: false });
  const { c } = h.create();
  await h.tick(9000); assert.equal(c.getState().parked, false); assert.equal(c.getState().index, -1);
  h.manager.updateSettings({ parking: 'chosen' });
  assert.equal(c.select(), true); assert.equal(c.getState().parked, true);
  h.manager.updateSettings({ parking: 'off' });
  assert.equal(c.getState().parked, false); assert.equal(c.getState().index, -1);
  await h.tick(999); assert.equal(c.getState().index, -1);
  await h.tick(1); assert.equal(c.getState().index, 0);
});

test('brake tap, second tap and exact surface hold threshold all resume after a full interval', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0 });
  const { c, status } = h.create({ holdThreshold: 2500 });
  await h.tick(1000); c.brakePress(); await h.tick(1); c.brakeRelease();
  assert.equal(status.at(-1), 'Paused'); await h.tick(5000); assert.equal(c.getState().index, 0);
  c.brakePress(); c.brakeRelease();
  await h.tick(999); assert.equal(c.getState().index, 0);
  await h.tick(1); assert.equal(c.getState().index, 1);
  c.brakePress(); await h.tick(2500); c.brakeRelease();
  assert.equal(c.getState().braked, false);
  await h.tick(999); assert.equal(c.getState().index, 1);
  await h.tick(1); assert.equal(c.getState().index, -1);
});

test('brake on -1 is inert; unavailable/native-selection Space and Brake Off are not intercepted', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0 });
  const { c } = h.create();
  c.brakePress(); c.brakeRelease(); assert.equal(c.getState().braked, false);
  await h.tick(1000); assert.equal(c.getState().index, 0);
  h.manager.updateSettings({ spaceBrake: false }); assert.equal(c.brakePress(), false);
  h.manager.updateSettings({ spaceBrake: true });
  const native = h.create({ brakeKeyAvailable: false }).c; assert.equal(native.brakePress(), false);
});

test('mode/setting changes consume the owned brake release, and blur/dispose cannot strand timers', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0 });
  const { c } = h.create(); await h.tick(1000); c.brakePress();
  h.manager.setAutoScan(false); assert.equal(c.brakeRelease(), true); assert.equal(c.getState().index, 0);
  h.manager.setAutoScan(true); await h.tick(1000); c.brakePress();
  h.manager.updateSettings({ spaceBrake: false }); assert.equal(c.brakeRelease(), true);
  h.manager.updateSettings({ spaceBrake: true }); c.brakePress();
  h.dispatch('blur'); await h.tick(5000); assert.equal(c.getState().index, 1);
  h.dispatch('focus'); await h.tick(1000); assert.equal(c.getState().index, -1);
  c.dispose(); await h.tick(5000); assert.equal(c.getState().index, -1);
});

test('redraw follows stable identity, retains pause/park, and removal resets without selecting', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, parking: 'chosen' });
  const { c, selected } = h.create(); await h.tick(1000); c.brakePress(); c.brakeRelease();
  c.setItems([{ id: 'b', label: 'Bravo' }, { id: 'a', label: 'Updated' }]);
  assert.equal(c.getState().index, 1); assert.equal(c.getState().braked, true);
  c.setItems([{ id: 'b', label: 'Bravo' }]); assert.equal(c.getState().index, -1);
  assert.equal(c.getState().braked, true);
  c.select(); assert.equal(c.getState().parked, true);
  c.setItems([{ id: 'c', label: 'Charlie' }]); assert.equal(c.getState().parked, true);
  assert.deepEqual(selected, []);
});

test('manual Back restores the same parent; child loop exits to root -1; fresh/missing restore is blank', () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  const { c } = h.create(); c.step(); c.step();
  c.enterGroup([{ id: 'key-1', label: 'One' }, { id: 'key-2', label: 'Two' }]);
  c.back(); assert.equal(c.getState().id, 'b');
  c.enterGroup([{ id: 'key-1', label: 'One' }, { id: 'key-2', label: 'Two' }]);
  c.step(); c.step(); assert.equal(c.getState().depth, 0); assert.equal(c.getState().index, -1);
  c.open([{ id: 'b', label: 'Bravo' }], { restoreId: 'b' }); assert.equal(c.getState().id, 'b');
  c.open([{ id: 'b', label: 'Bravo' }], { restoreId: 'gone' }); assert.equal(c.getState().index, -1);
  c.step(); c.enterGroup([{ id: 'key', label: 'Key' }]); c.back({ restore: false });
  assert.equal(c.getState().index, -1);
});

test('Wait for speech includes park speech and waits a full interval after normal completion', async () => {
  const h = harness();
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, waitForSpeech: true, parking: 'chosen' });
  const { c } = h.create();
  assert.equal(h.spoken.length, 0);
  await h.tick(50); assert.equal(h.spoken[0].text, 'park');
  await h.tick(1499); assert.equal(c.getState().index, -1);
  await h.tick(1); assert.equal(c.getState().index, 0);
  await h.tick(1550); assert.equal(c.getState().index, 1);
});

test('disabled/failed speech uses the ordinary interval and missing end events obey the estimate/hard cap', async () => {
  const disabled = harness(); disabled.voice.updateSettings({ ttsEnabled: false });
  disabled.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, waitForSpeech: true });
  const off = disabled.create().c; await disabled.tick(1000); assert.equal(off.getState().index, 0);
  const fail = harness({ speechMode: 'throw' });
  fail.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, waitForSpeech: true });
  const failed = fail.create().c; await fail.tick(1000); assert.equal(failed.getState().index, 0);
  const noStart = harness({ speechMode: 'nostart' });
  noStart.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, waitForSpeech: true });
  const neverStarted = noStart.create().c;
  await noStart.tick(1000); assert.equal(neverStarted.getState().index, 0);
  const h = harness({ speechMode: 'noend' });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, waitForSpeech: true, parking: 'chosen' });
  const { c } = h.create();
  const cap = h.voice.getSpeechTimeout('park');
  await h.tick(cap + 999); assert.equal(c.getState().index, -1);
  await h.tick(1); assert.equal(c.getState().index, 0);
  c.dispose();
  const long = h.voice.speak('long '.repeat(200)); let result;
  long.finished.then(value => { result = value; });
  await h.tick(10000); assert.equal(result.reason, 'timeout');
  assert.equal(h.engine.speaking, true, 'completion fallback must not truncate narration');
  h.voice.cancel(); assert.equal(h.engine.speaking, false);
  assert.equal(h.voice.getSpeechTimeout('x'.repeat(5000)), 10000);
});

test('speech cancellation, supersession, engine start failure and voice availability always settle', async () => {
  const h = harness({ speechMode: 'nostart' });
  const old = h.voice.speak('old'); const current = h.voice.speak('current');
  await h.tick(50); assert.deepEqual(h.spoken.map(item => item.text), ['current']);
  assert.equal((await old.finished).reason, 'cancelled');
  await h.tick(1000); assert.equal((await current.finished).reason, 'failed-to-start');
  const deferred = h.voice.speak('never spoken'); h.voice.cancel(); await h.tick(100);
  assert.equal((await deferred.finished).reason, 'cancelled'); assert.equal(h.spoken.length, 1);
  const raw = harness({ voices: [] });
  const available = raw.voice.waitForVoices();
  await raw.tick(2000); assert.equal(await available, false);
  const fallback = raw.voice.speak('default engine voice');
  await raw.tick(550); assert.equal((await fallback.finished).reason, 'end');
});

test('brake wins over pending speech and resume ignores stale completion for one full interval', async () => {
  const h = harness({ speechMode: 'noend' });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, waitForSpeech: true });
  const { c } = h.create();
  c.step(); await h.tick(100); c.brakePress(); c.brakeRelease();
  await h.tick(11000); assert.equal(c.getState().index, 0); assert.equal(c.getState().braked, true);
  c.brakePress(); c.brakeRelease();
  await h.tick(999); assert.equal(c.getState().index, 0);
  await h.tick(1); assert.equal(c.getState().index, 1);
});

test('redraw removal keeps an existing brake resumable at -1, including after leaving a child row', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0 });
  const { c, selected, highlights } = h.create(); await h.tick(1000);
  c.enterGroup([{ id: 'child', label: 'Child' }]); c.brakePress(); c.brakeRelease();
  c.setItems([]);
  assert.equal(c.getState().depth, 0); assert.equal(c.getState().index, -1);
  assert.equal(c.getState().braked, true);
  assert.ok(highlights.every(item => item.depth === 0 || item.index >= 0));
  c.brakePress(); c.brakeRelease(); await h.tick(1000);
  assert.equal(c.getState().index, 0); assert.deepEqual(selected, []);
});

test('unrelated settings and identity-preserving redraw do not bypass the current speech wait', async () => {
  const h = harness({ speechMode: 'noend' });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, waitForSpeech: true, parking: 'chosen' });
  const { c } = h.create(); c.step(); await h.tick(100);
  h.manager.updateSettings({ inputSensitivityIndex: 3, loopsBeforeParking: 3 });
  c.setItems([{ id: 'b', label: 'Bravo' }, { id: 'a', label: 'Alpha refreshed' }]);
  assert.equal(c.getState().id, 'a'); assert.equal(c.getState().waitingForSpeech, true);
  await h.tick(1500); assert.equal(c.getState().id, 'a');
  c.open([{ id: 'new', label: 'New menu' }]);
  await h.tick(1000); assert.equal(c.getState().index, -1, 'old completion cannot move the fresh menu');
});

test('storage failure leaves working in-memory settings; engine without start/end events is bounded', async () => {
  const h = harness({ speechMode: 'noevents' });
  h.context.localStorage.getItem = () => { throw Error('blocked'); };
  h.context.localStorage.setItem = () => { throw Error('blocked'); };
  h.manager.updateSettings({ waitForSpeech: true });
  h.dispatch('focus'); assert.equal(h.manager.getSettings().waitForSpeech, true);
  const ticket = h.voice.speak('park');
  await h.tick(1050); assert.equal(await ticket.started, true);
  await h.tick(h.voice.getSpeechTimeout('park') - 1050);
  assert.equal((await ticket.finished).reason, 'timeout');
});

test('reversing an Auto scan with Brake Off does not count a partial pass as a full parking loop', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, spaceBrake: false, parking: 'auto', loopsBeforeParking: 1 });
  const { c } = h.create();
  c.step(-1); assert.equal(c.getState().index, 1);
  await h.tick(1000); assert.equal(c.getState().index, -1); assert.equal(c.getState().parked, false);
  await h.tick(3000); assert.equal(c.getState().parked, true);
});

test('native held keys freeze only the Auto clock, preserving manual backward scan and a full release interval', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, spaceBrake: false });
  const { c } = h.create();
  await h.tick(1000); c.setInputHeld(true); await h.tick(4000);
  assert.equal(c.getState().index, 0);
  c.step(-1); assert.equal(c.getState().index, -1);
  c.setInputHeld(false); await h.tick(999); assert.equal(c.getState().index, -1);
  await h.tick(1); assert.equal(c.getState().index, 0);
});

test('explicit Help speech can speak with TTS disabled without changing the voice setting', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  const silent = h.voice.speak('ordinary label');
  assert.equal((await silent.finished).started, false);
  const help = h.voice.speak('I need help', { force: true });
  await h.tick(550); assert.equal((await help.finished).reason, 'end');
  assert.equal(h.voice.getSettings().ttsEnabled, false);
});

test('a manual move with Brake Off waits for its new label after the native key is released', async () => {
  const h = harness({ speechDuration: 1500 });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, spaceBrake: false, waitForSpeech: true });
  const { c } = h.create();
  await h.tick(50); c.setInputHeld(true); c.step();
  await h.tick(500); c.setInputHeld(false);
  await h.tick(2049); assert.equal(c.getState().index, 0);
  await h.tick(1); assert.equal(c.getState().index, 1);
});

test('settings changes preserve the selected option and its hierarchy; only fresh navigation resets focus', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ scanSpeedIndex: 0 });
  const { c, highlights } = h.create(); c.step(); c.step();
  c.enterGroup([{ id: 'row-1', label: 'Row one' }, { id: 'row-2', label: 'Row two' }]); c.step();
  c.enterGroup([{ id: 'mode', label: 'Auto Scan' }, { id: 'parking', label: 'Parking' }, { id: 'next', label: 'Next option' }]); c.step();
  for (const change of [
    { scanSpeedIndex: 2 }, { inputSensitivityIndex: 3 }, { parking: 'auto' },
    { loopsBeforeParking: 3 }, { spaceBrake: false }, { waitForSpeech: true }
  ]) {
    h.manager.updateSettings(change);
    assert.equal(c.getState().id, 'parking'); assert.equal(c.getState().depth, 2);
  }
  const before = highlights.length;
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0 });
  assert.equal(highlights.length, before + 1, 'Mode changes redraw even though the item stays highlighted');
  assert.equal(c.getState().id, 'parking'); assert.equal(c.getState().depth, 2);
  await h.tick(999); assert.equal(c.getState().id, 'parking');
  await h.tick(1); assert.equal(c.getState().id, 'next');
  h.manager.setAutoScan(false);
  await h.tick(5000); assert.equal(c.getState().id, 'next'); assert.equal(c.getState().depth, 2);
  c.back(); assert.equal(c.getState().id, 'row-2'); assert.equal(c.getState().depth, 1);
  c.back(); assert.equal(c.getState().id, 'b'); assert.equal(c.getState().depth, 0);
  c.open([{ id: 'fresh', label: 'Fresh menu' }]); assert.equal(c.getState().index, -1);
});

test('changing modes while a brake press is owned waits for its release without losing focus or counting a partial loop', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, parking: 'auto', loopsBeforeParking: 1 });
  const { c, selected, status } = h.create(); c.step(); c.brakePress();
  h.manager.setAutoScan(false);
  assert.equal(c.getState().id, 'a'); assert.equal(c.getState().braked, false);
  assert.equal(c.getState().held, true); assert.equal(status.at(-1), '');
  h.manager.setAutoScan(true);
  await h.tick(5000); assert.equal(c.getState().id, 'a');
  assert.equal(c.brakeRelease(), true); assert.equal(c.brakeRelease(), false);
  await h.tick(999); assert.equal(c.getState().id, 'a');
  await h.tick(1); assert.equal(c.getState().id, 'b');
  await h.tick(1000); assert.equal(c.getState().index, -1); assert.equal(c.getState().parked, false);
  await h.tick(3000); assert.equal(c.getState().parked, true);
  h.manager.setAutoScan(false);
  assert.equal(c.getState().index, -1); assert.equal(c.getState().parked, false);
  await h.tick(5000); assert.equal(c.getState().index, -1);
  h.manager.setAutoScan(true);
  await h.tick(999); assert.equal(c.getState().index, -1);
  await h.tick(1); assert.equal(c.getState().id, 'a');
  assert.deepEqual(selected, []);
});

test('announcing a changed setting retains a native selection hold and gives its new value a full speech wait', async () => {
  const h = harness();
  h.manager.updateSettings({ scanSpeedIndex: 0, waitForSpeech: true });
  const { c, selected } = h.create(); c.step(); await h.tick(50);
  c.setInputHeld(true);
  h.manager.setAutoScan(true);
  c.setItems([{ id: 'a', label: 'Auto Scan: On' }, { id: 'b', label: 'Next option' }]);
  const ticket = c.announceCurrent();
  await h.tick(50); assert.equal(h.spoken.at(-1).text, 'Auto Scan: On');
  await h.tick(1000);
  assert.equal((await ticket.finished).reason, 'end');
  assert.equal(c.getState().id, 'a'); assert.equal(c.getState().inputHeld, true);
  c.setInputHeld(false);
  await h.tick(999); assert.equal(c.getState().id, 'a');
  await h.tick(1); assert.equal(c.getState().id, 'b');
  assert.deepEqual(selected, []);
});

test('changed-value announcements preserve brake and park states and cannot restart scanning through stale speech', async () => {
  const h = harness({ speechMode: 'noend' });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, waitForSpeech: true, parking: 'chosen' });
  const { c, selected } = h.create(); c.step(); await h.tick(50);
  c.brakePress(); c.brakeRelease();
  const ticket = c.announceCurrent('Parking: Auto');
  await h.tick(50); assert.equal(h.spoken.at(-1).text, 'Parking: Auto');
  const late = h.spoken.at(-1);
  await h.tick(11000);
  assert.equal((await ticket.finished).reason, 'timeout');
  assert.equal(c.getState().id, 'a'); assert.equal(c.getState().braked, true);
  c.brakePress(); c.brakeRelease(); late.onend();
  await h.tick(999); assert.equal(c.getState().id, 'a');
  await h.tick(1); assert.equal(c.getState().id, 'b');
  c.open([{ id: 'a', label: 'Alpha' }]); c.select();
  c.announceCurrent('Wait for speech: On');
  await h.tick(11000);
  assert.equal(c.getState().parked, true); assert.equal(c.getState().index, -1);
  assert.deepEqual(selected, []);
});


test('badge context maps the selected choice and label without changing scan identity', () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ autoScan: true, parking: 'chosen' });
  const element = {}, title = {}, updates = [];
  const { c } = h.create({ getElement: () => element, getLabelElement: () => title,
    badge: { update: (value, context) => updates.push({ value, ...context }), destroy() {} } });
  assert.equal(updates.at(-1).item, null); assert.equal(updates.at(-1).label, null);
  c.step(); c.brakePress(); c.brakeRelease();
  assert.equal(updates.at(-1).value, 'Paused'); assert.equal(updates.at(-1).item, element);
  assert.equal(updates.at(-1).label, title); assert.equal(updates.at(-1).state.id, 'a');
  c.park(); assert.equal(updates.at(-1).value, 'Parked');
  assert.equal(updates.at(-1).item, null); assert.equal(updates.at(-1).state.index, -1);
});

test('Paused speech follows the whole current label once and resume still waits exactly one full interval', async () => {
  const h = harness(); h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, waitForSpeech: true });
  const { c } = h.create(); c.step(); await h.tick(50);
  assert.equal(h.spoken.at(-1).text, 'Alpha');
  c.brakePress(); c.brakeRelease();
  await h.tick(499); assert.deepEqual(h.spoken.map(item => item.text), ['Alpha']);
  assert.equal(h.engine.speaking, true, 'pausing does not interrupt the selected label');
  await h.tick(1); await h.tick(50);
  assert.deepEqual(h.spoken.map(item => item.text), ['Alpha', 'Paused']);
  c.setItems([{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Bravo' }]);
  await h.tick(2000); assert.equal(c.getState().braked, true); assert.equal(h.spoken.length, 2);
  c.brakePress(); c.brakeRelease();
  await h.tick(999); assert.equal(c.getState().id, 'a');
  await h.tick(1); assert.equal(c.getState().id, 'b');
  assert.equal(h.spoken.filter(item => item.text === 'Paused').length, 1, 'resume never announces Paused');
});

test('resuming before a label ends or before queued Paused speech starts cancels the stale announcement', async () => {
  for (const afterLabel of [false, true]) {
    const h = harness(); h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0 });
    const { c } = h.create(); c.step(); await h.tick(50);
    c.brakePress(); c.brakeRelease();
    if (afterLabel) await h.tick(500);
    c.brakePress(); c.brakeRelease(); await h.tick(700);
    assert.equal(c.getState().id, 'a'); assert.equal(c.getState().braked, false);
    assert.equal(h.spoken.some(item => item.text === 'Paused'), false);
  }
});

test('navigation, inactivity, mode changes and changed values invalidate pending pause speech', async () => {
  const actions = {
    open: (h, c) => c.open([{ id: 'fresh', label: 'Fresh choice' }]),
    park: (h, c) => c.park(),
    dispose: (h, c) => c.dispose(),
    inactive: h => h.dispatch('blur'),
    suspended: (h, c) => c.setSuspended(true),
    mode: h => h.manager.setAutoScan(false),
    brakeOff: h => h.manager.updateSettings({ spaceBrake: false }),
    changedValue: (h, c) => c.announceCurrent('Wait for speech: On'),
    removedChoice: (h, c) => c.setItems([{ id: 'b', label: 'Bravo' }])
  };
  for (const [name, change] of Object.entries(actions)) {
    const h = harness(); h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, parking: 'chosen' });
    const { c } = h.create(); c.step(); await h.tick(50); c.brakePress(); c.brakeRelease();
    change(h, c); await h.tick(700);
    assert.equal(h.spoken.some(item => item.text === 'Paused'), false, name);
    if (name === 'changedValue') assert.equal(h.spoken.at(-1).text, 'Wait for speech: On');
  }
});

test('cancelled or timed-out label speech cannot trigger Paused and cut off ongoing narration', async () => {
  for (const cancelled of [false, true]) {
    const h = harness({ speechMode: 'hang' });
    h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, waitForSpeech: true });
    const { c } = h.create(); c.step(); await h.tick(50); c.brakePress(); c.brakeRelease();
    if (cancelled) h.voice.cancel();
    await h.tick(h.voice.getSpeechTimeout('Alpha') + 1000);
    assert.deepEqual(h.spoken.map(item => item.text), ['Alpha']);
    assert.equal(c.getState().braked, true); assert.equal(c.getState().id, 'a');
    assert.equal(h.engine.speaking, !cancelled, 'timeout must not truncate native narration');
  }
});


test('silent Step deadzone cancels only its owned choice speech and preserves external instructions', async () => {
  for (const external of [false, true]) {
    const h = harness({ speechMode: 'hang' }); const { c } = h.create();
    c.step(); await h.tick(50); assert.equal(h.engine.speaking, true);
    if (external) { h.voice.speak('Fresh menu instructions'); await h.tick(50); }
    const count = h.spoken.length; c.step(-1); await h.tick(100);
    assert.equal(c.getState().index, -1); assert.equal(h.spoken.length, count);
    assert.equal(h.engine.speaking, external);
    assert.equal(h.spoken.at(-1).text, external ? 'Fresh menu instructions' : 'Alpha');
  }
});


test('Parking Off keeps every Auto blank silent and gives it an ordinary interval with either Wait setting', async () => {
  for (const waitForSpeech of [false, true]) {
    const h = harness();
    h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, parking: 'off', waitForSpeech });
    const { c, selected } = h.create();
    assert.equal(c.getState().waitingForSpeech, false);
    assert.equal(c.announceCurrent(), null); assert.equal(c.select(), false);
    for (let loop = 0; loop < 3; loop++) {
      assert.equal(c.getState().index, -1); assert.equal(c.getState().parked, false);
      await h.tick(999); assert.equal(c.getState().index, -1);
      await h.tick(1); assert.equal(c.getState().id, 'a');
      await h.tick(waitForSpeech ? 1550 : 1000); assert.equal(c.getState().id, 'b');
      await h.tick(waitForSpeech ? 1550 : 1000); assert.equal(c.getState().index, -1);
      assert.equal(c.getState().waitingForSpeech, false); assert.equal(c.select(), false);
    }
    assert.deepEqual(h.spoken.map(item => item.text), ['Alpha', 'Bravo', 'Alpha', 'Bravo', 'Alpha', 'Bravo']);
    assert.deepEqual(selected, []);
    c.step(-1); await h.tick(50); assert.equal(h.spoken.at(-1).text, 'Bravo');
    const count = h.spoken.length;
    c.step(); await h.tick(50); assert.equal(c.getState().index, -1); assert.equal(h.spoken.length, count);
    c.step(); c.step(-1); await h.tick(50); assert.equal(h.spoken.length, count, 'reverse arrival also cancels a queued item label');
    c.step(); c.enterGroup([{ id: 'child', label: 'Child' }]); await h.tick(50);
    const nestedCount = h.spoken.length;
    c.step(); await h.tick(50); assert.equal(c.getState().depth, 0); assert.equal(c.getState().index, -1);
    assert.equal(h.spoken.length, nestedCount, 'child boundary lands on the same silent root blank');
    c.open([{ id: 'fresh', label: 'Fresh choice' }]); await h.tick(50); assert.equal(h.spoken.length, nestedCount);
  }
});

test('chosen and automatic parking still announce park and parked with speech-aware timing', async () => {
  for (const parking of ['chosen', 'auto']) {
    const h = harness();
    h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, parking, loopsBeforeParking: 1, waitForSpeech: true });
    const { c, selected } = h.create();
    await h.tick(50); assert.equal(h.spoken.at(-1).text, 'park');
    if (parking === 'chosen') c.select();
    else { await h.tick(4599); assert.equal(c.getState().id, 'b'); await h.tick(1); }
    assert.equal(c.getState().parked, true); await h.tick(50); assert.equal(h.spoken.at(-1).text, 'parked');
    assert.deepEqual(selected, []);
  }
});

test('live Parking Off cancels queued or active park speech and rejects late completion without skipping the blank interval', async () => {
  for (const parked of [false, true]) for (const active of [false, true]) {
    const h = harness({ speechMode: 'hang' });
    h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, parking: 'chosen', waitForSpeech: true });
    const { c, selected } = h.create();
    if (parked) c.select();
    await h.tick(active ? 50 : 25);
    const late = h.spoken.at(-1);
    assert.equal(h.engine.speaking, active);
    h.manager.updateSettings({ parking: 'off' });
    assert.equal(c.getState().index, -1); assert.equal(c.getState().parked, false);
    assert.equal(c.getState().waitingForSpeech, false); assert.equal(h.engine.speaking, false);
    late?.onend(); await h.tick(999); assert.equal(c.getState().index, -1);
    assert.equal(h.spoken.length, active ? 1 : 0, 'a cancelled queued label must never start');
    await h.tick(1); assert.equal(c.getState().id, 'a'); assert.deepEqual(selected, []);
  }
});

test('Parking Off can cancel a timed-out parking utterance without affecting a held or suspended scanner', async () => {
  for (const gate of ['held', 'suspended', 'mode']) {
    const h = harness({ speechMode: 'hang' });
    h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, parking: 'chosen', waitForSpeech: true });
    const { c } = h.create(); c.select();
    await h.tick(h.voice.getSpeechTimeout('parked') + 1);
    assert.equal(h.engine.speaking, true, 'bounded completion alone does not truncate native speech');
    if (gate === 'held') c.setInputHeld(true);
    if (gate === 'suspended') c.setSuspended(true);
    h.manager.updateSettings({ parking: 'off', ...(gate === 'mode' ? { autoScan: false } : {}) });
    assert.equal(h.engine.speaking, false); assert.equal(c.getState().parked, false);
    await h.tick(5000); assert.equal(c.getState().index, -1);
    if (gate === 'held') c.setInputHeld(false);
    if (gate === 'suspended') c.setSuspended(false);
    if (gate === 'mode') h.manager.setAutoScan(true);
    await h.tick(999); assert.equal(c.getState().index, -1);
    await h.tick(1); assert.equal(c.getState().id, 'a');
  }
});

test('Parking Off leaves current option speech and its existing Wait deadline unchanged', async () => {
  const h = harness();
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, parking: 'chosen', waitForSpeech: true });
  const { c } = h.create(); c.step(); await h.tick(100);
  h.manager.updateSettings({ parking: 'off' });
  assert.equal(c.getState().id, 'a'); assert.equal(c.getState().waitingForSpeech, true);
  assert.equal(h.engine.speaking, true); assert.equal(h.spoken.at(-1).text, 'Alpha');
  await h.tick(1449); assert.equal(c.getState().id, 'a');
  await h.tick(1); assert.equal(c.getState().id, 'b');
});

test('Parking Off at a blank preserves explicit setting announcements and unrelated app narration', async () => {
  for (const external of [false, true]) {
    const h = harness({ speechMode: 'hang' });
    h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, parking: 'chosen', waitForSpeech: true });
    const { c } = h.create(); await h.tick(50);
    const ticket = external ? h.voice.speak('Menu instructions') : c.announceCurrent('Parking: Off');
    await h.tick(50); h.manager.updateSettings({ parking: 'off' });
    assert.equal(c.getState().index, -1); assert.equal(h.engine.speaking, true);
    assert.equal(h.spoken.at(-1).text, external ? 'Menu instructions' : 'Parking: Off');
    let finished = false; ticket.finished.then(() => { finished = true; }); await h.tick(50);
    assert.equal(finished, false, 'only the scanner-owned parking ticket may be cancelled');
  }
});


test('composed menu announcements opt into parking ownership so live Off cancels their queued or active Park suffix', async () => {
  for (const active of [false, true]) for (const autoScan of [false, true]) {
    const h = harness({ speechMode: 'hang' });
    h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 0, parking: 'chosen', waitForSpeech: true });
    const { c } = h.create();
    const ticket = c.announceCurrent('Main menu. Park.', { parkingLabel: true });
    await h.tick(active ? 50 : 25); const late = h.spoken.at(-1);
    h.manager.updateSettings({ parking: 'off', autoScan });
    assert.equal((await ticket.finished).reason, 'cancelled');
    assert.equal(h.engine.speaking, false); assert.equal(c.getState().waitingForSpeech, false);
    late?.onend();
    if (!autoScan) { await h.tick(5000); assert.equal(c.getState().index, -1); h.manager.setAutoScan(true); }
    await h.tick(999); assert.equal(c.getState().index, -1);
    assert.equal(h.spoken.length, active ? 1 : 0);
    await h.tick(1); assert.equal(c.getState().id, 'a');
  }
});


test('scan speed exposes exactly 1–5 seconds, preserves stored fifth choice and wraps after five', () => {
  const h = harness();
  assert.deepEqual(plain(h.manager.getAvailableSpeeds()), [1000, 2000, 3000, 4000, 5000]);
  assert.equal(h.manager.getScanInterval(), 2000);
  h.manager.setScanSpeedIndex(3);
  assert.equal(h.manager.cycleScanSpeed(), 4);
  assert.equal(h.manager.getScanInterval(), 5000);
  assert.equal(JSON.parse(h.memory.get('narbe-scan-settings')).scanSpeedIndex, 4);
  h.manager.updateSettings({ scanSpeedIndex: 5 });
  assert.equal(h.manager.getScanInterval(), 5000, 'six seconds is not an available choice');
  assert.equal(h.manager.cycleScanSpeed(), 0);
  assert.equal(h.manager.getScanInterval(), 1000);
  const restored = harness({ saved: { 'narbe-scan-settings': { autoScan: false, scanSpeedIndex: 4 } } });
  assert.equal(restored.manager.getScanInterval(), 5000);
  const peer = { postMessage: data => restored.sent.push(data) }; restored.frames.push(peer);
  restored.dispatch('message', { origin: 'https://hub.test', source: peer, data: { type: 'narbe-scan-settings-request' } });
  assert.equal(restored.sent.at(-1).settings.scanInterval, 5000);
});

test('five-second Auto interval and full-interval brake resume are honored', async () => {
  const h = harness(); h.voice.updateSettings({ ttsEnabled: false });
  h.manager.updateSettings({ autoScan: true, scanSpeedIndex: 4, parking: 'off' });
  const { c } = h.create();
  await h.tick(4999); assert.equal(c.getState().index, -1);
  await h.tick(1); assert.equal(c.getState().id, 'a');
  c.brakePress(); c.brakeRelease();
  await h.tick(6000); assert.equal(c.getState().id, 'a');
  c.brakePress(); c.brakeRelease();
  await h.tick(4999); assert.equal(c.getState().id, 'a');
  await h.tick(1); assert.equal(c.getState().id, 'b');
});
