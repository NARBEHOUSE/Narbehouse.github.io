const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, '../bennyshub/shared', name), 'utf8');
function target() {
  const events = new Map();
  return { addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
    removeEventListener(type, fn) { events.get(type)?.delete(fn); },
    dispatch(type, event = {}) { for (const fn of [...(events.get(type) || [])]) fn(event); },
    count() { return [...events.values()].reduce((n, set) => n + set.size, 0); } };
}
function browser(data = new Map(), blocked = false) {
  const document = Object.assign(target(), { visibilityState: 'visible', querySelectorAll: () => [] });
  const window = Object.assign(target(), { document, location: { origin: 'http://test' }, localStorage: {
    getItem(key) { if (blocked) throw Error('blocked'); return data.get(key) || null; },
    setItem(key, value) { if (blocked) throw Error('blocked'); data.set(key, value); }
  } });
  window.parent = window;
  const context = vm.createContext({ window, document, console, setTimeout, clearTimeout });
  vm.runInContext(source('platform.js'), context);
  vm.runInContext(source('graphics-quality.js'), context);
  return { graphics: window.NarbeGraphics, window, document, data, context };
}
test('a future game inherits, follows the Hub, overrides, resets, and persists without registration', async () => {
  const b = browser(), g = b.graphics.openGame('future-sample'); await g.ready;
  assert.equal(g.get().quality, 'standard');
  b.graphics.setHub('low'); assert.equal(g.get().quality, 'low');
  g.setChoice('standard'); b.graphics.setHub('standard'); b.graphics.setHub('low');
  assert.equal(g.get().quality, 'standard');
  g.setChoice('hub'); assert.equal(g.get().quality, 'low');
  const reload = browser(b.data), restored = reload.graphics.openGame('future-sample'); await restored.ready;
  assert.equal(restored.get().choice, 'hub'); assert.equal(restored.get().quality, 'low');
  assert.equal(browser().graphics.getHub(), 'auto');
});
test('saved High and Low migrate to explicit profiles; resetting does not remigrate', async () => {
  for (const legacyPreference of ['high', 'low']) {
    const b = browser(); b.graphics.setHub('low');
    const g = b.graphics.openGame('legacy', { legacyPreference }); await g.ready;
    assert.equal(g.get().quality, legacyPreference); assert.equal(g.get().legacy, null);
    g.setChoice('hub'); assert.equal(g.get().legacy, null); assert.equal(g.get().quality, 'low');
    const restored = browser(b.data).graphics.openGame('legacy', { legacyPreference }); await restored.ready;
    assert.equal(restored.get().choice, 'hub'); assert.equal(restored.get().legacy, null);
  }
  for (const legacyPreference of [undefined, 'auto', 'garbage']) {
    assert.equal(browser().graphics.openGame('new', { legacyPreference }).get().choice, 'hub');
  }
});
test('independent game keys preserve simultaneous overrides and cross-window storage updates', () => {
  const a = browser(), b = browser(a.data);
  const first = a.graphics.openGame('first'), other = b.graphics.openGame('other');
  first.setChoice('low'); other.setChoice('standard');
  assert.equal(JSON.parse(a.data.get('narbe-graphics-game-first')).choice, 'low');
  a.graphics.setHub('low'); b.window.dispatch('storage', { key: 'narbe-graphics-settings' });
  assert.equal(b.graphics.getHub(), 'low'); assert.equal(other.get().quality, 'standard');
  other.setChoice('hub'); a.graphics.setHub('standard'); b.window.dispatch('focus');
  assert.equal(other.get().quality, 'standard');
});
test('corrupt or unavailable storage keeps usable Auto defaults and session choices', () => {
  const data = new Map([['narbe-graphics-settings', '{oops'], ['narbe-graphics-game-new', 'null']]);
  const b = browser(data), g = b.graphics.openGame('new');
  assert.equal(g.get().quality, 'standard');
  const blocked = browser(new Map(), true), session = blocked.graphics.openGame('session');
  blocked.graphics.setHub('low'); blocked.window.dispatch('focus');
  assert.equal(session.get().quality, 'low');
});
test('pixel budget covers total drawing buffer, preserves lower ratios and never upscales', () => {
  const { graphics } = browser();
  for (const [w, h, dpr] of [[3840,2160,2],[1920,1080,1],[1080,1920,3],[2560,1080,2],[640,360,.5],[1,1,2]]) {
    const r = graphics.pixelRatio(dpr, w, h, true);
    assert.ok(w * h * r * r <= graphics.PIXEL_BUDGET + 1e-6);
    assert.ok(r <= dpr && r <= 1);
    assert.equal(graphics.pixelRatio(dpr,w,h,false), dpr);
  }
});
test('antialias changes advertise next launch and shadows restore without recreating renderer', () => {
  const g = browser().graphics.openGame('render');
  g.setChoice('standard');
  assert.equal(g.rendererOptions({ antialias:true }).antialias,true);
  g.setChoice('low'); assert.equal(g.get().pendingLaunch,true);
  const material = {}, renderer = { shadowMap: { enabled:true } };
  const scene = { traverse(fn) { fn({ material }); } };
  g.shadows(renderer,scene,true); assert.equal(renderer.shadowMap.enabled,false); assert.equal(material.needsUpdate,true);
  g.setChoice('standard'); g.shadows(renderer,scene,true);
  assert.equal(renderer.shadowMap.enabled,true); assert.equal(g.get().pendingLaunch,false);
  g.shadows(renderer,scene,false); assert.equal(renderer.shadowMap.enabled,false);
});
test('disposal removes game listeners; pagehide keeps bfcache state and closes ordinary pages', () => {
  const b = browser(), before = b.window.count() + b.document.count();
  const g = b.graphics.openGame('cleanup'); let notifications = 0; g.subscribe(() => notifications++);
  b.window.dispatch('pagehide', { persisted:true }); b.graphics.setHub('low'); assert.equal(notifications,1);
  g.dispose(); assert.equal(b.window.count() + b.document.count(), before);
  b.graphics.setHub('standard'); assert.equal(notifications,1);
  b.window.dispatch('pagehide', { persisted:false }); assert.equal(b.window.count() + b.document.count(),0);
});
test('native-ready adapter hydrates before migration, preserving authoritative override', async () => {
  const b = browser(); let release;
  const ready = new Promise(resolve => { release = resolve; });
  const saved = new Map(); let writes = 0;
  b.window.NarbePlatform.settings = { synchronous:false, open({key,normalize,onChange}) {
    let value = normalize({});
    ready.then(() => { value = normalize(key.includes('-game-') ? {migrated:true,choice:'low'} : {quality:'standard'}); onChange(); });
    return { ready, readCached:()=>value, save(next) { writes++; value=normalize(next); saved.set(key,value); onChange(); }, reload:()=>value, dispose(){} };
  } };
  vm.runInContext(source('graphics-quality.js'), b.context);
  const game = b.window.NarbeGraphics.openGame('native', {legacyPreference:'high'});
  assert.equal(writes,0); release(); await game.ready;
  assert.equal(game.get().quality,'low'); assert.equal(writes,0);
});

test('Hub and game cycles expose Auto, High, Standard, Low in order', () => {
  const b = browser(), g = b.graphics.openGame('cycle');
  assert.equal(b.graphics.getHub(), 'auto');
  assert.deepEqual(Array.from({length:4}, () => b.graphics.cycleHub()), ['high','standard','low','auto']);
  assert.deepEqual(Array.from({length:5}, () => g.cycle().choice), ['auto','high','standard','low','hub']);
});
test('old Lightweight records and compatibility overrides upgrade without losing intent', () => {
  const b = browser(new Map([
    ['narbe-graphics-settings', JSON.stringify({quality:'lightweight'})],
    ['narbe-graphics-game-old', JSON.stringify({migrated:true,choice:'standard',legacy:'high'})],
    ['narbe-graphics-game-light', JSON.stringify({migrated:true,choice:'lightweight'})]
  ]));
  assert.equal(b.graphics.getHub(), 'low'); assert.equal(b.graphics.openGame('old').get().choice,'high');
  assert.equal(b.graphics.openGame('light').get().choice,'low');
});
function frames(g, ms, dt, start = 0, target = 60) {
  for (let now=start; now<start+ms; now+=dt) g.frame(now,target);
  return start+ms;
}
test('Auto lowers after sustained slow frames, holds a cooldown and recovers slowly without saving', () => {
  const b = browser(), g = b.graphics.openGame('adaptive');
  assert.equal(g.get().mode,'auto'); assert.equal(g.get().quality,'standard');
  assert.equal(g.rendererOptions({antialias:true}).antialias,false);
  const saved=JSON.stringify([...b.data]);
  let now=frames(g,8000,40); assert.equal(g.get().quality,'low'); assert.equal(g.get().pendingLaunch,false);
  now=frames(g,20000,1000/60,now); assert.equal(g.get().quality,'low');
  now=frames(g,50000,1000/60,now); assert.equal(g.get().quality,'standard');
  now=frames(g,24000,1000/60,now); assert.equal(g.get().quality,'high');
  now=frames(g,9000,40,now); assert.equal(g.get().quality,'low');
  now=frames(g,70000,1000/60,now); assert.equal(g.get().quality,'low','Repeated failed upgrades back off longer');
  assert.equal(JSON.stringify([...b.data]),saved,'Auto decisions remain session-only');
});
test('Auto ignores hidden time, startup stalls, and intentional 30 FPS menu limits', () => {
  const b=browser(), g=b.graphics.openGame('timing');
  let now=frames(g,30000,1000/30,0,30); assert.equal(g.get().quality,'standard');
  b.document.visibilityState='hidden'; now=frames(g,10000,100,now); assert.equal(g.get().quality,'standard');
  b.document.visibilityState='visible'; g.frame(now+60000); now+=60000;
  now=frames(g,3000,1000/60,now); assert.equal(g.get().quality,'standard');
  now=frames(g,8000,40,now); assert.equal(g.get().quality,'low');
});
test('manual modes remain fixed and High uses the display ratio with its renderer cap', () => {
  const b=browser(), g=b.graphics.openGame('manual'); b.window.devicePixelRatio=3;
  for(const mode of ['high','standard','low']) {
    g.setChoice(mode); frames(g,30000,80); assert.equal(g.get().quality,mode);
  }
  g.setChoice('high'); assert.equal(g.pixelRatio(.6,1920,1080),2);
  g.setChoice('low'); assert.ok(1920*1080*g.pixelRatio(2,1920,1080)**2<=921601);
  g.setChoice('auto'); assert.equal(g.get().quality,'standard');
});

test('Bowling High preserves its original native display density, including after Low', () => {
  const b=browser(); b.window.devicePixelRatio=3;
  // Load the game's actual registration so its display cap is part of coverage.
  const entry=fs.readFileSync(path.join(__dirname,'../bennyshub/apps/games/BENNYSBOWLING/js/bowlchallenge.js'),'utf8').split('\n')[0];
  vm.runInNewContext(entry,{NarbeGraphics:b.graphics});
  const g=b.graphics.openGame('bowling');
  for(const density of [1,1.5,2,3]) {
    b.window.devicePixelRatio=density;g.setChoice('high');
    assert.equal(g.pixelRatio(density,1920,1080),density);
    g.setChoice('low');assert.ok(1920*1080*g.pixelRatio(density,1920,1080)**2<=921601);
    g.setChoice('high');assert.equal(g.pixelRatio(density,1920,1080),density);
  }
});
