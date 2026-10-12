'use strict';
/* Chasing Rainbows - sky.js tests. Node only, never a browser:
 *   node tests/sky.test.cjs
 * sky.js runs in a vm context with a fake window/document/canvas. The fake 2D
 * context is a Proxy whose drawing calls are no-ops, but it behaves like a real
 * browser where it matters: gradients reject bad offsets and colours, negative
 * radii and empty-canvas drawImage throw, and non-finite arguments, bad colour
 * strings and out-of-range globalAlpha are recorded as problems. rAF and timers
 * run off a fake clock that the tests pump frame by frame. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '../js/sky.js'), 'utf8');
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?\s*(,\s*(0|1|0?\.\d+|1\.0+)\s*)?\)|transparent|none)$/i;
const FRAME = 1000 / 60;
const flush = () => new Promise(r => setImmediate(r));

function seeded(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function makeEnv(o = {}) {
  const env = { clock: 1000, raf: new Map(), rafId: 0, timers: [], timerId: 0, problems: [], maxRaf: 0, bags: { window: {}, document: {} } };
  const problem = msg => { if (env.problems.length < 40) env.problems.push(msg); };
  const finite = (name, args) => { for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) { problem(name + '(' + args.join(',') + ')'); return; } };
  const gradient = kind => ({
    addColorStop(off, color) {
      if (!(off >= 0 && off <= 1)) throw new RangeError(kind + ' gradient stop offset ' + off);
      if (!COLOR.test(String(color))) throw new SyntaxError(kind + ' gradient colour ' + color);
    }
  });
  function makeContext(canvas) {
    const props = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
      lineCap: 'butt', lineJoin: 'miter', filter: 'none', imageSmoothingEnabled: true, font: '10px sans-serif' };
    const special = {
      canvas,
      createLinearGradient(...a) { if (a.some(v => !Number.isFinite(v))) throw new TypeError('non-finite linear gradient'); return gradient('linear'); },
      createRadialGradient(...a) {
        if (a.some(v => !Number.isFinite(v))) throw new TypeError('non-finite radial gradient');
        if (a[2] < 0 || a[5] < 0) throw new RangeError('IndexSizeError: negative gradient radius');
        return gradient('radial');
      },
      createConicGradient(...a) { if (a.some(v => !Number.isFinite(v))) throw new TypeError('non-finite conic gradient'); return gradient('conic'); },
      createPattern(img) { if (!img || !(img.width > 0) || !(img.height > 0)) throw new Error('InvalidStateError: empty pattern source'); return { setTransform() {} }; },
      createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
      getImageData(x, y, w, h) { if (!(w > 0 && h > 0)) throw new RangeError('IndexSizeError'); return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
      measureText(t) { return { width: String(t).length * 6 }; },
      drawImage(img, ...a) {
        if (!img || !(img.width > 0) || !(img.height > 0)) throw new Error('InvalidStateError: drawImage of an empty canvas');
        finite('drawImage', a);
      },
      arc(...a) { if (a[2] < 0) throw new RangeError('IndexSizeError: negative arc radius'); finite('arc', a); },
      ellipse(...a) { if (a[2] < 0 || a[3] < 0) throw new RangeError('IndexSizeError: negative ellipse radius'); finite('ellipse', a); }
    };
    return new Proxy({}, {
      get(_, key) {
        if (key in special) return special[key];
        if (key in props) return props[key];
        if (typeof key === 'symbol') return undefined;
        return (...args) => finite(String(key), args);
      },
      set(_, key, value) {
        if ((key === 'fillStyle' || key === 'strokeStyle') && typeof value === 'string' && !COLOR.test(value)) problem('bad ' + key + ' ' + value);
        if (key === 'globalAlpha' && !(value >= 0 && value <= 1)) problem('globalAlpha ' + value);
        if (key === 'filter' && o.noFilter) return true;                // like a browser without ctx.filter
        props[key] = value;
        return true;
      }
    });
  }
  function makeCanvas() {
    let w = 300, h = 150, ctx = null;
    const c = {
      style: {}, clientWidth: 0, clientHeight: 0,
      get width() { return w; }, set width(v) { if (!(Number.isInteger(v) && v > 0)) problem('canvas width ' + v); w = v; },
      get height() { return h; }, set height(v) { if (!(Number.isInteger(v) && v > 0)) problem('canvas height ' + v); h = v; },
      getContext(type) { return type === '2d' ? (ctx || (ctx = makeContext(c))) : null; }
    };
    return c;
  }
  const bag = name => ({
    add: (t, f) => { (env.bags[name][t] = env.bags[name][t] || new Set()).add(f); },
    remove: (t, f) => { if (env.bags[name][t]) env.bags[name][t].delete(f); }
  });
  const wb = bag('window'), db = bag('document');
  const MathSeeded = Object.create(Math);
  MathSeeded.random = seeded(o.seed || 12345);
  const doc = { hidden: false, visibilityState: 'visible', createElement: tag => { assert.equal(tag, 'canvas'); return makeCanvas(); },
    addEventListener: db.add, removeEventListener: db.remove };
  const win = {
    innerWidth: o.w || 1280, innerHeight: o.h || 800, devicePixelRatio: o.dpr == null ? 2 : o.dpr,
    performance: { now: () => env.clock },
    requestAnimationFrame(fn) { const id = ++env.rafId; env.raf.set(id, fn); env.maxRaf = Math.max(env.maxRaf, env.raf.size); return id; },
    cancelAnimationFrame(id) { env.raf.delete(id); },
    setTimeout(fn, ms) { const id = ++env.timerId; env.timers.push({ id, at: env.clock + (+ms || 0), fn }); return id; },
    clearTimeout(id) { env.timers = env.timers.filter(t => t.id !== id); },
    addEventListener: wb.add, removeEventListener: wb.remove,
    document: doc, Math: MathSeeded, Date: class extends Date { static now() { return env.clock; } }, console
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(SRC, win, { filename: 'sky.js' });
  Object.assign(env, { win, doc, sky: win.CRSky, canvas: makeCanvas() });
  env.fire = (where, type) => { for (const f of [...(env.bags[where][type] || [])]) f({ type }); };
  env.listeners = (where, type) => (env.bags[where][type] ? env.bags[where][type].size : 0);
  env.setHidden = hidden => { doc.hidden = hidden; doc.visibilityState = hidden ? 'hidden' : 'visible'; env.fire('document', 'visibilitychange'); };
  /** One frame: advance the clock, fire due timers, then rAF callbacks (not while hidden, like a browser). */
  env.step = (ms = FRAME) => {
    env.clock += ms;
    for (;;) {
      const due = env.timers.filter(t => t.at <= env.clock).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      env.timers = env.timers.filter(t => t !== due);
      due.fn();
    }
    if (doc.hidden) return;
    const q = [...env.raf.values()];
    env.raf.clear();
    for (const fn of q) fn(env.clock);
  };
  env.run = async (ms, each, frame = FRAME) => {
    const end = env.clock + ms;
    while (env.clock < end - 1e-9) { env.step(Math.min(frame, end - env.clock)); if (each) each(); await flush(); }
  };
  /** ms of fake time until the promise settles (Infinity if it doesn't within `limit`). */
  env.timeTo = async (p, limit, each) => {
    let at = null, value;
    const t0 = env.clock;
    p.then(v => { at = env.clock; value = v && Object.assign({}, v); });
    await flush();
    while (at === null && env.clock - t0 < limit) { env.step(); if (each) each(); await flush(); }
    return { ms: at === null ? Infinity : at - t0, value };
  };
  env.dbg = () => JSON.parse(JSON.stringify(env.sky.__debug()));   // copy out of the vm realm
  return env;
}

function clean(env) {
  const d = env.dbg();
  assert.equal(d.errors, 0, 'frames threw');
  assert.deepEqual(env.problems, [], 'bad canvas calls');
  assert.ok(env.maxRaf <= 1, 'more than one rAF loop was queued');
}
function underCaps(env) {
  const d = env.dbg();
  for (const k of Object.keys(d.caps)) assert.ok(d.counts[k] <= d.caps[k], k + ' ' + d.counts[k] + ' > cap ' + d.caps[k]);
  return d;
}
/** Max change in the sky's estimated luminance over any 1/3 s window. */
function lumWatcher(env) {
  const samples = [];
  let frames = -1;
  return {
    sample() { const d = env.dbg(); if (d.frames !== frames) { frames = d.frames; samples.push([env.clock, d.lum]); } },
    maxSwing() {
      let worst = 0;
      for (let i = 0; i < samples.length; i++) {
        for (let j = i + 1; j < samples.length && samples[j][0] - samples[i][0] <= 1000 / 3 + 1e-6; j++) worst = Math.max(worst, Math.abs(samples[j][1] - samples[i][1]));
      }
      return worst;
    }
  };
}

const FULL_MS = { rain: 3500, sunburst: 2500, storm: 4500, fog: 4000, wind: 3000, cloudPuff: 2500, doubleRainbow: 4000,
  rainbow: 5000, sunshower: 4500, dayNight: 5000, nightNight: 6000, sparkles: 1500 };
const OPTS = { rain: { heavy: true }, sunburst: { x: 300, y: 200 }, fog: { rect: { left: 100, top: 120, width: 300, height: 200 } },
  wind: { from: { x: 50, y: 600 }, to: { x: 1100, y: 200 } }, cloudPuff: { x: 640, y: 300 }, sparkles: { x: 640, y: 400 } };


/* ── tests ─────────────────────────────────────────────────────────────── */
test('init sizes the canvas, caps the pixel ratio and starts one loop', async () => {
  const env = makeEnv({ w: 1280, h: 800, dpr: 2 });
  assert.equal(env.sky.init(env.canvas), true);
  let d = env.dbg();
  assert.equal(d.dpr, 1.5);                                   // 1280x800 at 1.5 = 2.3 MP
  assert.deepEqual(d.canvas, [1920, 1200]);
  assert.equal(env.raf.size, 1);
  assert.equal(env.sky.getMood(), 'day');
  assert.equal(env.listeners('window', 'resize'), 1);
  env.win.innerWidth = 1920; env.win.innerHeight = 1080;      // 1.5 would be 4.7 MP -> 1
  env.fire('window', 'resize');
  d = env.dbg();
  assert.equal(d.dpr, 1);
  assert.deepEqual(d.canvas, [1920, 1080]);
  assert.equal(d.counts.stars, 220);
  await env.run(500);
  assert.ok(env.dbg().frames > 0);
  assert.ok(env.dbg().offscreenPixels < 12e6, 'offscreen sprites ' + env.dbg().offscreenPixels);
  clean(env);
});

test('play() before init and unknown effect names resolve at once and never throw', async () => {
  const env = makeEnv();
  assert.equal((await env.timeTo(env.sky.play('rain'), 0)).ms, 0);
  env.sky.init(env.canvas);
  for (const name of ['nope', '', undefined, null, 42, 'toString', '__proto__', 'constructor']) {
    const r = await env.timeTo(env.sky.play(name, { ms: 50 }), 0);
    assert.equal(r.ms, 0, String(name));
  }
  assert.equal(env.sky.setMood('purple'), false);
  assert.equal(env.sky.getMood(), 'day');
  clean(env);
});

test('every mood can be set and crossfades cleanly', async () => {
  const env = makeEnv();
  env.sky.init(env.canvas);
  for (const mood of env.sky.moods) {
    assert.equal(env.sky.setMood(mood), true);
    assert.equal(env.sky.getMood(), mood);
    await env.run(2200, () => underCaps(env));
    assert.equal(env.dbg().fadeMs, 0, mood + ' crossfade finished');
  }
  assert.deepEqual([...env.sky.moods].sort(), ['dawn', 'day', 'dusk', 'fog', 'night', 'overcast', 'rain', 'rainbow', 'storm', 'sunshower', 'wind']);
  clean(env);
});

test('full motion: every effect resolves within its duration', async () => {
  const env = makeEnv();
  env.sky.init(env.canvas);
  assert.deepEqual([...env.sky.effects].sort(), Object.keys(FULL_MS).sort());
  for (const name of Object.keys(FULL_MS)) {
    const r = await env.timeTo(env.sky.play(name, OPTS[name]), FULL_MS[name] + 1000, () => underCaps(env));
    if (name === 'sparkles') assert.ok(r.ms <= 1500 + 20, name + ' took ' + r.ms);
    else assert.ok(r.ms >= FULL_MS[name] - 1 && r.ms <= FULL_MS[name] + 40, name + ' took ' + r.ms);
    assert.deepEqual(r.value, { effect: name, cancelled: false });
  }
  const custom = await env.timeTo(env.sky.play('rain', { ms: 2000 }), 4000);
  assert.ok(custom.ms >= 1999 && custom.ms <= 2040, 'custom ms ' + custom.ms);
  const wholeScreenFog = await env.timeTo(env.sky.play('fog'), 5000);
  assert.ok(wholeScreenFog.ms <= 4040);
  clean(env);
});

test('calm motion: effects are short crossfades with no particles', async () => {
  const env = makeEnv();
  env.sky.init(env.canvas);
  env.sky.setMotion('calm');
  const none = () => { const c = underCaps(env).counts; assert.equal(c.rain + c.leaves + c.sparkles + c.splashes + c.glows, 0, JSON.stringify(c)); };
  for (const name of Object.keys(FULL_MS)) {
    const r = await env.timeTo(env.sky.play(name, OPTS[name]), 3000, none);
    // ~600-900 ms, except that nightNight / a lingering rainbow change the whole sky's
    // brightness and the photosensitivity guard stretches that crossfade to <= ~1.7 s
    const limit = name === 'nightNight' || name === 'rainbow' ? 1700 : 900;
    assert.ok(r.ms <= limit + 40 && r.ms < FULL_MS[name], name + ' took ' + r.ms);
  }
  env.sky.setMood('storm');
  await env.run(2000, none);
  assert.equal(env.dbg().lightning.times.length, 0, 'no lightning in calm');
  clean(env);
});

test("off motion: no loop at all, effects resolve immediately with still end states", async () => {
  const env = makeEnv();
  env.sky.init(env.canvas);
  await env.run(200);
  env.sky.setMotion('off');
  assert.equal(env.raf.size, 0);
  const renders = env.dbg().staticRenders, frames = env.dbg().frames;
  env.sky.setMood('dusk');
  assert.equal(env.dbg().staticRenders, renders + 1);
  for (const name of Object.keys(FULL_MS)) assert.equal((await env.timeTo(env.sky.play(name, OPTS[name]), 0)).ms, 0, name);
  assert.equal(env.sky.getMood(), 'night', 'nightNight leaves night');
  await env.timeTo(env.sky.play('rainbow'), 0);
  assert.equal(env.sky.getMood(), 'rainbow', 'rainbow leaves the rainbow mood');
  await env.timeTo(env.sky.play('nightNight'), 0);
  assert.equal(env.sky.getMood(), 'night');
  await env.timeTo(env.sky.play('rainbow', { linger: false }), 0);
  assert.equal(env.sky.getMood(), 'night');
  env.fire('window', 'resize');
  await env.run(1000);
  assert.equal(env.raf.size, 0);
  assert.equal(env.dbg().frames, frames, 'no frames drawn by a loop');
  assert.equal(env.dbg().running, false);
  env.sky.setMotion('full');
  assert.equal(env.raf.size, 1, 'loop restarts when motion returns');
  clean(env);
});

test('stop() resolves pending effects as cancelled and eases back to the mood', async () => {
  const env = makeEnv();
  env.sky.init(env.canvas);
  const names = ['storm', 'rainbow', 'fog', 'wind', 'nightNight', 'cloudPuff'];
  const ps = names.map(n => env.sky.play(n, OPTS[n]));
  await env.run(1500);
  env.sky.stop();
  const results = await Promise.all(ps.map(p => env.timeTo(p, 0)));
  results.forEach((r, i) => { assert.equal(r.ms, 0, names[i]); assert.equal(r.value.cancelled, true); });
  assert.equal(env.sky.getMood(), 'day', 'a cancelled nightNight leaves the mood alone');
  assert.deepEqual(env.dbg().effects, []);
  await env.run(2500);
  assert.equal(env.dbg().dying, 0);
  assert.equal(env.dbg().fadeMs, 0);
  clean(env);
});

test('end states: nightNight stays at night, dayNight returns, rainbow lingers', async () => {
  const env = makeEnv();
  env.sky.init(env.canvas);
  await env.timeTo(env.sky.play('dayNight'), 6000);
  assert.equal(env.sky.getMood(), 'day');
  await env.timeTo(env.sky.play('rainbow'), 6000);
  assert.equal(env.sky.getMood(), 'rainbow');
  env.sky.setMood('day');
  await env.timeTo(env.sky.play('rainbow', { linger: false }), 6000);
  assert.equal(env.sky.getMood(), 'day');
  await env.timeTo(env.sky.play('nightNight'), 7000);
  assert.equal(env.sky.getMood(), 'night');
  // a mood the game sets mid-effect wins over the effect's end state
  env.sky.setMood('day');
  const p = env.sky.play('nightNight');
  await env.run(1000);
  env.sky.setMood('rain');
  await env.timeTo(p, 7000);
  assert.equal(env.sky.getMood(), 'rain');
  clean(env);
});

test('photosensitivity: big brightness changes stay under ~0.2 per 1/3 s', async () => {
  for (const motion of ['full', 'calm']) {
    const env = makeEnv();
    env.sky.init(env.canvas);
    env.sky.setMotion(motion);
    const w = lumWatcher(env), each = () => w.sample();
    await env.run(500, each);
    for (const [mood, ms] of [['night', undefined], ['day', 0], ['storm', 100], ['day', undefined], ['night', 0]]) {
      env.sky.setMood(mood, ms == null ? undefined : { ms });
      await env.run(3000, each);
    }
    env.sky.setMood('day', { ms: 0 });
    await env.run(3000, each);
    for (const [name, o, mood] of [['dayNight', {}], ['dayNight', { ms: 1000 }], ['nightNight', {}], ['storm', {}], ['storm', { ms: 500 }],
      ['nightNight', { ms: 100 }, 'day'], ['rainbow', {}, 'storm'], ['rainbow', { ms: 100 }, 'storm'], ['sunshower', {}, 'storm'], ['rain', { heavy: true }, 'day']]) {
      if (mood) { env.sky.setMood(mood, { ms: 0 }); await env.run(3000, each); }
      await env.timeTo(env.sky.play(name, o), 8000, each);
      await env.run(1500, each);
    }
    assert.ok(w.maxSwing() <= 0.2 + 1e-9, motion + ': luminance swing ' + w.maxSwing().toFixed(3));
    clean(env);
  }
});

test('10 simulated seconds of overlapping effects: no errors, caps hold, lightning stays soft and spaced', async () => {
  const env = makeEnv({ w: 1920, h: 1080, dpr: 1 });
  env.sky.init(env.canvas);
  env.sky.setMood('storm', { ms: 0 });
  const all = Object.keys(FULL_MS), pending = [];
  all.forEach(n => pending.push(env.sky.play(n, OPTS[n])));
  let peak = { rain: 0, leaves: 0, sparkles: 0 }, step = 0;
  await env.run(10000, () => {
    const d = underCaps(env);
    for (const k of Object.keys(peak)) peak[k] = Math.max(peak[k], d.counts[k]);
    step++;
    if (step % 30 === 0) {                                    // every half second pile on more
      const n = all[(step / 30) % all.length];
      pending.push(env.sky.play(n, OPTS[n]));
      pending.push(env.sky.play('storm'), env.sky.play('rain', { heavy: true }), env.sky.play('wind'), env.sky.play('sparkles', { x: 400 + step, y: 300 }));
    }
    if (step % 120 === 0) env.sky.setMood(env.sky.moods[(step / 120) % env.sky.moods.length]);
    if (step === 300) { env.win.innerWidth = 1024; env.win.innerHeight = 700; env.fire('window', 'resize'); }
  });
  assert.ok(peak.rain > 300, 'heavy rain really fell (' + peak.rain + ')');
  assert.ok(peak.leaves >= 30, 'leaves flew (' + peak.leaves + ')');
  assert.ok(peak.sparkles >= 100, 'sparkles burst (' + peak.sparkles + ')');
  const L = env.dbg().lightning;
  assert.ok(L.times.length >= 3, 'lightning happened');
  for (let i = 1; i < L.times.length; i++) assert.ok(L.times[i] - L.times[i - 1] >= 1200, 'glows ' + (L.times[i] - L.times[i - 1]) + ' ms apart');
  assert.ok(L.maxGlowAlpha > 0 && L.maxGlowAlpha <= 0.25, 'glow alpha ' + L.maxGlowAlpha);
  assert.ok(L.maxBoltAlpha <= 0.45, 'bolt alpha ' + L.maxBoltAlpha);
  env.sky.stop();
  for (const p of pending) assert.ok((await env.timeTo(p, 0)).ms === 0);
  clean(env);
});

test('ambient frames run at ~30 fps, transients at 60 fps', async () => {
  const env = makeEnv();
  env.sky.init(env.canvas);
  await env.run(500);
  let f0 = env.dbg().frames;
  await env.run(1000);
  const ambient = env.dbg().frames - f0;
  assert.ok(ambient >= 29 && ambient <= 31, 'ambient fps ' + ambient);
  assert.equal(env.dbg().fps, 30);
  env.sky.play('sunburst', { ms: 3000 });
  await env.run(100);
  f0 = env.dbg().frames;
  await env.run(1000);
  const fast = env.dbg().frames - f0;
  assert.ok(fast >= 59 && fast <= 61, 'transient fps ' + fast);
  assert.equal(env.dbg().fps, 60);
  env.sky.setMotion('calm');
  env.sky.play('sunburst');
  await env.run(100);
  assert.equal(env.dbg().fps, 30, 'calm transients stay at 30 fps');
  clean(env);
});

test('the loop stops while hidden, effects still resolve, and it resumes when visible', async () => {
  const env = makeEnv();
  env.sky.init(env.canvas);
  await env.run(300);
  env.setHidden(true);
  assert.equal(env.raf.size, 0);
  assert.equal(env.dbg().running, false);
  const frames = env.dbg().frames;
  const r = await env.timeTo(env.sky.play('rain', { ms: 1500 }), 4000);
  assert.ok(r.ms <= 1500 + 400 + 20, 'backstop resolved after ' + r.ms);
  await env.run(1000);
  assert.equal(env.dbg().frames, frames, 'no frames while hidden');
  env.setHidden(false);
  assert.equal(env.raf.size, 1);
  await env.run(500);
  assert.ok(env.dbg().frames > frames);
  clean(env);
});

test('setMotion while effects run resolves them and clears particles', async () => {
  const env = makeEnv();
  env.sky.init(env.canvas);
  const p1 = env.sky.play('storm'), p2 = env.sky.play('nightNight'), p3 = env.sky.play('wind');
  await env.run(2500);
  assert.ok(env.dbg().counts.rain > 0 && env.dbg().counts.leaves > 0);
  env.sky.setMotion('calm');
  for (const p of [p1, p2, p3]) assert.equal((await env.timeTo(p, 0)).ms, 0);
  const c = env.dbg().counts;
  assert.equal(c.rain + c.leaves + c.sparkles + c.glows, 0);
  assert.equal(env.sky.getMood(), 'night', 'nightNight lands on night when skipped');
  await env.run(2000);
  clean(env);
});

test('clouds still build without ctx.filter (layered-alpha fallback)', async () => {
  const env = makeEnv({ noFilter: true });
  env.sky.init(env.canvas);
  assert.equal(env.dbg().filterBlur, false);
  await env.timeTo(env.sky.play('cloudPuff', { x: 200, y: 200 }), 3000);
  clean(env);
});

test('destroy() removes listeners, stops the loop and resolves pending effects', async () => {
  const env = makeEnv();
  env.sky.init(env.canvas);
  const p = env.sky.play('storm');
  await env.run(300);
  env.sky.destroy();
  assert.equal((await env.timeTo(p, 0)).value.cancelled, true);
  assert.equal(env.raf.size, 0);
  assert.equal(env.listeners('window', 'resize'), 0);
  assert.equal(env.listeners('document', 'visibilitychange'), 0);
  assert.equal((await env.timeTo(env.sky.play('rain'), 0)).ms, 0);
  assert.equal(env.sky.init(env.canvas), true, 'can init again');
  await env.run(300);
  clean(env);
});
