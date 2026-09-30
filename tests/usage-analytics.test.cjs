const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const hubRoot = path.resolve(__dirname, '../bennyshub');
const source = fs.readFileSync(path.join(hubRoot, 'shared/usage-analytics.js'), 'utf8');
const production = 'https://narbehouse.github.io';
const hubURL = production + '/bennyshub/';
const games = JSON.parse(fs.readFileSync(path.join(hubRoot, 'apps/games/games.json')));
const tools = JSON.parse(fs.readFileSync(path.join(hubRoot, 'apps/tools/tools.json')));
const bowling = games.games.find(app => app.id === 'bennysbowling');
const journal = tools.tools.find(app => app.id === 'journal');

function eventTarget(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  target.dispatchEvent = event => {
    event.target ||= target;
    for (const fn of [...(listeners.get(event.type) || [])]) fn.call(target, event);
    return true;
  };
  return target;
}

async function browser(options = {}) {
  let now = 1000;
  let focused = options.focused !== false;
  let nextTimer = 0;
  let releaseCatalog;
  const catalogGate = options.deferCatalog ? new Promise(resolve => { releaseCatalog = resolve; }) : Promise.resolve();
  const timers = new Map();
  const requests = [];
  const scripts = [];
  const location = new URL(options.url || hubURL);
  const frame = { id: 'app-iframe', tagName: 'IFRAME', src: '', contentWindow: {} };
  const document = eventTarget({
    title: options.title || 'PRIVATE DOCUMENT TITLE',
    referrer: 'https://example.com/PRIVATE_REFERRER?private=data',
    currentScript: { src: new URL('shared/usage-analytics.js', new URL('/bennyshub/', location)).href },
    visibilityState: 'visible',
    hidden: false,
    readyState: 'complete',
    activeElement: null,
    hasFocus: () => focused,
    getElementById: id => id === frame.id ? frame : scripts.find(script => script.id === id) || null,
    querySelector: selector => selector === 'iframe' ? frame : null,
    querySelectorAll: selector => selector === 'iframe' ? [frame] : [],
    createElement: tag => ({ tagName: tag.toUpperCase(), setAttribute(name, value) { this[name] = value; } }),
    head: { appendChild(script) { scripts.push(script); return script; } },
  });
  document.documentElement = document.head;
  frame.ownerDocument = document;
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const env = eventTarget({
    document, location, navigator: { onLine: options.online !== false },
    URL, Date: ClockDate, performance: { now: () => now }, console,
    setInterval(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay, due: now + delay, repeat: true }); return id; },
    clearInterval(id) { timers.delete(id); },
    setTimeout(fn, delay = 0) { const id = ++nextTimer; timers.set(id, { fn, delay, due: now + delay, repeat: false }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async input => {
      const url = String(input);
      requests.push(url);
      await catalogGate;
      if (options.failCatalog) throw new Error('Catalog unavailable');
      if (url.endsWith('/apps/games/games.json')) return { ok: true, json: async () => games };
      if (url.endsWith('/apps/tools/tools.json')) return { ok: true, json: async () => tools };
      throw new Error('Unexpected request: ' + url);
    },
  });
  env.window = env;
  env.self = env;
  env.parent = options.parent || env;
  env.top = options.parent || env;
  env.frameElement = options.frameElement || null;
  document.defaultView = env;
  const context = vm.createContext(env);
  const evaluate = () => vm.runInContext(source, context, { filename: 'usage-analytics.js' });
  const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
  evaluate();
  await settle();
  const runTimer = (id, timer) => {
    if (timer.repeat) timer.due = now + timer.delay;
    else timers.delete(id);
    timer.fn();
  };
  const advance = milliseconds => {
    const end = now + milliseconds;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      now = next[1].due;
      runTimer(...next);
    }
    now = end;
  };
  const jump = milliseconds => {
    now += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.due <= now) runTimer(id, timer);
  };
  const events = name => Array.from(env.dataLayer || []).map(item => Array.from(item)).filter(item => item[0] === 'event' && (!name || item[1] === name)).map(item => ({ name: item[1], ...item[2] }));
  const dispatch = (target, type, extra = {}) => target.dispatchEvent({ type, ...extra });
  return {
    env, document, frame, scripts, requests, advance, jump, evaluate, settle, events,
    async resolveCatalog() { releaseCatalog(); await settle(); },
    focus(value) { focused = value; dispatch(env, value ? 'focus' : 'blur'); advance(0); },
    visible(value) { document.hidden = !value; document.visibilityState = value ? 'visible' : 'hidden'; dispatch(document, 'visibilitychange'); },
    pagehide() { dispatch(env, 'pagehide', { persisted: true }); },
    pageshow() { dispatch(env, 'pageshow', { persisted: true }); },
    blurIntoFrame() { document.activeElement = frame; dispatch(env, 'blur'); advance(0); },
    usage(id) { return events('hub_usage').filter(event => event.hub_app_id === id).reduce((sum, event) => sum + event.hub_usage_seconds, 0); },
  };
}

function opens(browser) { return browser.events('hub_app_open'); }
function open(browser, app, suffix = '') {
  browser.frame.src = new URL(app.path + suffix, hubURL).href;
  browser.env.BennyUsage.open(app.path + suffix);
}

test('Hub counts separate game/tool launches and allocates time to the correct context', async () => {
  const b = await browser();
  assert.equal(b.events('page_view').length, 1);
  assert.equal(opens(b).length, 0, 'loading the menu is not an app launch');
  b.advance(5000);
  open(b, bowling);
  b.advance(12000);
  open(b, journal);
  b.advance(7000);
  b.env.BennyUsage.home();
  b.advance(4000);
  b.visible(false);
  assert.deepEqual(opens(b).map(event => [event.hub_app_id, event.hub_app_type, event.hub_launches]), [
    [bowling.id, 'game', 1], [journal.id, 'tool', 1],
  ]);
  assert.equal(b.usage(bowling.id), 12);
  assert.equal(b.usage(journal.id), 7);
  const menu = b.events('hub_usage').filter(event => event.hub_app_type === 'hub');
  assert.equal(menu.reduce((sum, event) => sum + event.hub_usage_seconds, 0), 9);
  for (const event of b.events('hub_usage')) {
    assert.equal(typeof event.hub_usage_seconds, 'number');
    assert.equal(event.hub_launches, undefined, 'time samples must not inflate launch counts');
  }
});

test('30-second usage samples are deltas and hiding plus pagehide does not double count', async () => {
  const b = await browser({ url: new URL(bowling.path, hubURL).href });
  b.advance(65000);
  assert.equal(b.events('hub_usage').length, 2);
  assert.equal(b.usage(bowling.id), 60);
  b.visible(false);
  b.pagehide();
  b.visible(false);
  assert.equal(b.usage(bowling.id), 65);
  assert.equal(opens(b).length, 1);
});

test('focus inside an iframe counts, but time in another window or a hidden tab does not', async () => {
  const b = await browser();
  open(b, bowling);
  b.advance(5000);
  b.blurIntoFrame();
  b.advance(3000);
  b.focus(false);
  b.advance(20000);
  b.focus(true);
  b.advance(4000);
  b.visible(false);
  b.advance(20000);
  b.visible(true);
  b.advance(2000);
  b.visible(false);
  assert.equal(b.usage(bowling.id), 14);
});

test('restoring a BFCache page resumes time without another launch or page view', async () => {
  const b = await browser({ url: new URL(journal.path, hubURL).href });
  b.advance(6000);
  b.pagehide();
  b.jump(60000);
  b.advance(3000);
  b.pageshow();
  b.advance(5000);
  b.pagehide();
  assert.equal(b.usage(journal.id), 11);
  assert.equal(opens(b).length, 1);
  assert.equal(b.events('page_view').length, 1);
});

test('a suspended device does not add the long timer gap to foreground usage', async () => {
  const b = await browser({ url: new URL(bowling.path, hubURL).href });
  b.advance(4000);
  b.jump(60000);
  b.advance(4000);
  b.visible(false);
  assert.equal(b.usage(bowling.id), 8);
});

test('direct entries use catalog metadata and canonical URLs without private document values', async () => {
  const b = await browser({ url: new URL(journal.path + '?entry=PRIVATE_QUERY#PRIVATE_HASH', hubURL).href });
  b.advance(3000);
  b.visible(false);
  assert.equal(opens(b).length, 1);
  assert.equal(opens(b)[0].hub_app_name, journal.title);
  assert.equal(opens(b)[0].hub_app_type, 'tool');
  const canonical = new URL(journal.path, hubURL).href;
  for (const event of b.events()) {
    assert.equal(event.page_location, canonical);
    assert.equal(event.page_referrer, '');
    assert.notEqual(event.page_title, b.document.title);
  }
  const outbound = JSON.stringify(b.env.dataLayer);
  assert.doesNotMatch(outbound, /PRIVATE_|entry=|example\.com/);
  const config = b.env.dataLayer.map(item => Array.from(item)).find(item => item[0] === 'config');
  assert.equal(config[2].send_page_view, false);
});

test('unknown and off-origin launch inputs never become analytics labels', async () => {
  const b = await browser();
  b.env.BennyUsage.open('https://other.example/' + bowling.path + '?PRIVATE_INPUT');
  b.env.BennyUsage.open('apps/tools/PRIVATE_UNKNOWN/index.html');
  assert.equal(opens(b).length, 0);
  open(b, journal, '?private=PRIVATE_INPUT#PRIVATE_FRAGMENT');
  b.advance(1000);
  b.visible(false);
  assert.equal(opens(b).length, 1);
  assert.equal(opens(b)[0].hub_app_name, journal.title);
  assert.doesNotMatch(JSON.stringify(b.env.dataLayer), /PRIVATE_INPUT|PRIVATE_UNKNOWN|PRIVATE_FRAGMENT|other\.example/);
});

test('re-executing the tracker does not duplicate GA bootstrap or direct-entry launch', async () => {
  const b = await browser({ url: new URL(bowling.path, hubURL).href });
  b.evaluate();
  await b.settle();
  assert.equal(b.scripts.filter(script => /googletagmanager\.com/.test(script.src)).length, 1);
  assert.equal(b.env.dataLayer.filter(item => item[0] === 'config').length, 1);
  assert.equal(opens(b).length, 1);
  b.advance(4000);
  b.visible(false);
  assert.equal(b.usage(bowling.id), 4);
});

test('offline samples are discarded instead of replaying stale usage on reconnection', async () => {
  const b = await browser();
  b.env.navigator.onLine = false;
  const before = b.events().length;
  open(b, journal);
  b.advance(32000);
  b.visible(false);
  assert.equal(b.events().length, before);
  b.env.navigator.onLine = true;
  b.visible(true);
  b.advance(4000);
  b.visible(false);
  assert.equal(b.usage(journal.id), 4);
});

test('development, local files and lookalike production hosts send nothing', async () => {
  for (const url of ['http://localhost:4173/bennyshub/', 'file:///C:/bennyshub/index.html', 'https://narbehouse.github.io.evil.example/bennyshub/']) {
    const b = await browser({ url });
    assert.equal(typeof b.env.BennyUsage.open, 'function');
    assert.equal(typeof b.env.BennyUsage.home, 'function');
    open(b, journal);
    b.advance(35000);
    b.visible(false);
    assert.equal(b.requests.length, 0, url);
    assert.equal(b.scripts.length, 0, url);
    assert.equal(b.events().length, 0, url);
  }
});


test('owned embedded apps and nested frames do not load a second analytics tracker', async () => {
  const owner = await browser();
  assert.equal(owner.env.BennyUsage.ownsFrame(owner.frame), true);
  assert.equal(owner.env.BennyUsage.ownsFrame({ ownerDocument: owner.document }), false);
  const unrelated = { ownerDocument: {} };
  assert.equal(owner.env.BennyUsage.ownsFrame(unrelated), false);
  open(owner, bowling);
  const child = await browser({ url: new URL(bowling.path, hubURL).href, parent: owner.env, frameElement: owner.frame });
  assert.equal(child.requests.length, 0);
  assert.equal(child.scripts.length, 0);
  assert.equal(child.events().length, 0);
  const middle = { parent: owner.env, frameElement: owner.frame };
  const nested = await browser({ url: new URL(journal.path, hubURL).href, parent: middle, frameElement: unrelated });
  assert.equal(nested.requests.length, 0);
  assert.equal(nested.scripts.length, 0);
  assert.equal(nested.events().length, 0);
  owner.advance(4000);
  owner.visible(false);
  assert.equal(opens(owner).length, 1);
  assert.equal(owner.usage(bowling.id), 4);
});

test('direct apps own their embedded frames, preventing nested tools being counted twice', async () => {
  const owner = await browser({ url: new URL(journal.path, hubURL).href });
  assert.equal(owner.env.BennyUsage.ownsFrame(owner.frame), true);
  const child = await browser({ url: new URL('apps/tools/keyboard/index.html', hubURL).href, parent: owner.env, frameElement: owner.frame });
  assert.equal(child.requests.length, 0);
  assert.equal(child.scripts.length, 0);
  assert.equal(child.events().length, 0);
});

test('launches made before catalogs resolve survive a quick return to the menu', async () => {
  const b = await browser({ deferCatalog: true });
  open(b, bowling);
  open(b, journal);
  b.env.BennyUsage.home();
  assert.equal(b.events().length, 0);
  await b.resolveCatalog();
  assert.deepEqual(opens(b).map(event => event.hub_app_id), [bowling.id, journal.id]);
  b.advance(7000);
  b.visible(false);
  assert.equal(b.usage('hub'), 7);
  assert.equal(b.usage(bowling.id), 0);
  assert.equal(b.usage(journal.id), 0);
});

test('a catalog failure leaves the application API safe and sends no analytics', async () => {
  const b = await browser({ failCatalog: true });
  assert.doesNotThrow(() => { open(b, bowling); b.env.BennyUsage.home(); });
  b.advance(35000);
  b.visible(false);
  assert.equal(b.scripts.length, 0);
  assert.equal(b.events().length, 0);
});

test('directory bookmarks and explicit index pages identify the same catalog entry', async () => {
  for (const entry of [bowling, journal]) {
    const url = new URL(entry.path.replace(/index\.html$/, '') + '?private=PRIVATE_QUERY', hubURL).href;
    const b = await browser({ url });
    assert.equal(opens(b).length, 1);
    assert.equal(opens(b)[0].hub_app_id, entry.id);
    assert.equal(opens(b)[0].page_location, new URL(entry.path, hubURL).href);
  }
  const index = await browser({ url: hubURL + 'index.html' });
  assert.equal(index.events('page_view').length, 1);
  assert.equal(opens(index).length, 0);
});
