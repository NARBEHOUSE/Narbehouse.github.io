/**
 * Smoke test: run the game's logic outside a browser.
 *
 *   node tools/smoke.js
 *
 * `node --check` only proves a file PARSES. That is how the previous build
 * shipped a buildLake that threw a ReferenceError on every call, a content
 * bundle that silently changed shape, and a shoreLimit that crashed the moment
 * anyone aimed a cast. This executes things instead.
 *
 * It cannot tell you the water looks wrong - there is no renderer here. What it
 * can tell you is that the chart and the world agree, that the lake holds the
 * progression, and that nothing throws. Add a check whenever a bug gets past
 * you; that is the only way this file earns its keep.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.join(__dirname, '..');

/* ── A browser, near enough ───────────────────────────────────────────── */

function stubCanvas() {
  let cv;
  const ctx = new Proxy({}, {
    get(_t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient')
        return () => ({ addColorStop() {} });
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
function stubImage() {
  const img = {
    width: 1, height: 1, style: {},
    addEventListener(k, fn) { if (k === 'error') img._err = fn; },
    removeEventListener() {},
    set src(v) { setTimeout(() => img._err && img._err(new Error('headless')), 0); },
    get src() { return ''; },
  };
  return img;
}

global.self = global;
global.window = global;
global.window.addEventListener = () => {};
global.window.devicePixelRatio = 1;
global.document = {
  createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {}, setAttribute() {} }),
  createElementNS: (_n, t) => (t === 'img' ? stubImage() : stubCanvas()),
  getElementById: () => null,
  body: { style: {}, setAttribute() {}, appendChild() {} },
};

new Function(fs.readFileSync(path.join(ROOT, 'js/three.min.js'), 'utf8')).call(global);
const THREE = global.THREE;
if (!THREE) { console.error('three.js did not load'); process.exit(1); }

global.RT = {};
for (const f of ['js/util.js', 'js/icons.js', 'js/lake.js', 'js/art.js', 'js/world.js'])
  new Function(fs.readFileSync(path.join(ROOT, f), 'utf8')).call(global);

const lakeDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/lake.json'), 'utf8'));
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/roster.json'), 'utf8'));

let fail = 0, checks = 0;
const ok = (c, msg) => {
  checks++;
  if (!c) { fail++; console.log('  FAIL  ' + msg); }
  return c;
};
const section = (t) =>
  console.log('\n-- ' + t + ' ' + '-'.repeat(Math.max(0, 62 - t.length)));

const PALETTE = {
  waterShallow: '#39a0a6', waterMid: '#1d6070', waterDeep: '#0a2c3d',
  bankGrass: '#4a7a35', bankSoil: '#54412b', sand: '#c9b184', fog: '#cfe9f2',
  foliageDark: '#3f7a3a', foliageLight: '#5f9a45', reed: '#7a9c3f',
  skyLow: '#cfe9f2', skyMid: '#a8d4e6', skyHigh: '#7fb8d8',
};

/* ── The chart ───────────────────────────────────────────────────────── */
section('The chart: does it describe one lake?');
const L = RT.lake.chart(lakeDoc);
{
  ok(L.shore.length > 100, 'the shoreline splines (' + L.shore.length + ' points)');
  ok(!!L.island, 'there is an island');
  ok(L.soundings.length >= 20, L.soundings.length + ' soundings');
  ok(L.ledges.length >= 1, L.ledges.length + ' ledge(s)');

  // The dock has to be ON the water, or you cannot launch.
  ok(L.inWater(L.dock.x, L.dock.z - 20), 'there is water off the end of the dock');
  ok(L.depthAt(L.dock.x, L.dock.z - 20) > 0.5,
     'and it is deep enough to net in (' +
     L.depthAt(L.dock.x, L.dock.z - 20).toFixed(1) + ' ft)');

  // Every sounding must be in the water it claims to measure.
  const dry = L.soundings.filter(s => !L.inWater(s.x, s.z));
  dry.forEach(s => console.log('    sounding on land at ' + s.x + ',' + s.z));
  ok(dry.length === 0, dry.length + ' sounding(s) are on dry land');

  // The island must be entirely surrounded by water, or it is a peninsula.
  let touching = 0;
  L.island.forEach(p => {
    const a = Math.atan2(p[1] - (-2100), p[0] - 200);
    const ox = p[0] + Math.cos(a) * 40, oz = p[1] + Math.sin(a) * 40;
    if (!L.inWater(ox, oz)) touching++;
  });
  ok(touching === 0, 'the island is an island, not a peninsula (' +
     touching + ' points touch other land)');

  // The ledge has to be a step, not a slope. That is the whole design.
  const dl = L.ledges.find(l => l.id === 'dropoff');
  if (dl) {
    const mid = dl.line[Math.floor(dl.line.length / 2)];
    const near = L.depthAt(mid[0], mid[1] + 60);
    const far = L.depthAt(mid[0], mid[1] - 60);
    ok(far - near > 8, 'the drop-off actually drops (' + near.toFixed(0) +
       ' ft to ' + far.toFixed(0) + ' ft over 120 units)');
    console.log('    the drop-off: ' + near.toFixed(1) + ' ft on the town side, ' +
                far.toFixed(1) + ' ft over the edge');
  }
}

/* ── The world ───────────────────────────────────────────────────────── */
section('The world: does the chart build?');
{
  const scene = new THREE.Scene();
  let lake = null, threw = null;
  const t0 = Date.now();
  try {
    lake = RT.world.buildLake(scene, {
      chart: L, colors: PALETTE, seed: 1, flat: false, reducedMotion: false,
    });
  } catch (e) { threw = e; }
  ok(!threw, 'buildLake runs' +
     (threw ? ': ' + threw.constructor.name + ': ' + threw.message : ''));

  if (lake) {
    console.log('    built in ' + (Date.now() - t0) + ' ms');

    /* The bed and the chart must agree, or the water you see is not the water
       you fish. Sampled across the whole lake rather than at a point. */
    let worst = 0, samples = 0;
    for (let x = L.extent.minX; x < L.extent.maxX; x += 37) {
      for (let z = L.extent.minZ; z < L.extent.maxZ; z += 37) {
        const ft = L.depthAt(x, z);
        if (ft <= 0) continue;
        samples++;
        const want = -ft * lake.FT;
        worst = Math.max(worst, Math.abs(lake.groundAt(x, z) - want));
      }
    }
    ok(worst < 0.001, 'the bed is exactly the charted depth (' + samples +
       ' samples, worst error ' + worst.toFixed(4) + ' units)');

    // Ashore, the ground has to be ABOVE the water or the lake has no banks.
    let below = 0, ashore = 0;
    for (let x = L.extent.minX - 300; x < L.extent.maxX + 300; x += 53) {
      for (let z = L.extent.minZ - 300; z < L.extent.maxZ + 300; z += 53) {
        if (L.inWater(x, z)) continue;
        ashore++;
        if (lake.groundAt(x, z) < 0) below++;
      }
    }
    ok(below === 0, 'the land is above the water everywhere (' + below +
       ' of ' + ashore + ' points below)');

    // And it does not throw when driven.
    let upd = null;
    try {
      const p = new THREE.Vector3(0, 3, -100);
      for (let i = 0; i < 120; i++) lake.update(1 / 60, p, p);
    } catch (e) { upd = e; }
    ok(!upd, 'a couple of seconds of update() does not throw' +
       (upd ? ': ' + upd.message : ''));

    lake.dispose();
    ok(scene.children.length === 0, 'dispose() takes it all back out of the scene');
  }
}

/* ── The progression ─────────────────────────────────────────────────── */
section('The progression: does the lake hold the game?');
{
  const GRID = 25;
  const water = [];
  for (let x = L.extent.minX; x <= L.extent.maxX; x += GRID) {
    for (let z = L.extent.minZ; z <= L.extent.maxZ; z += GRID) {
      const ft = L.depthAt(x, z);
      if (ft > 0) water.push({ ft: ft, r: L.fromDock(x, z) });
    }
  }
  ok(water.length > 2000, 'there is a lake to fish (' + water.length + ' samples)');

  /* Each stage must add water AND a fish. A stage that adds only distance is
     a purchase with nothing behind it - the motorboat was exactly that until
     the deep water moved out past the island. */
  let prev = 0;
  const seen = new Set();
  roster.vessels.forEach(v => {
    const st = L.stages.find(s => s.vessel === v.id) || L.stages.find(s => s.id === v.id);
    const reach = st ? st.reach : v.reach;
    const opened = water.filter(w => w.r > prev && w.r <= reach).length;
    const fresh = roster.fish.filter(f =>
      !seen.has(f.id) &&
      water.some(w => w.r <= reach && w.ft >= f.depthFt[0] && w.ft < f.depthFt[1]));
    fresh.forEach(f => seen.add(f.id));
    if (v.id !== 'foot') {
      ok(opened > 0, v.id + ' opens water');
      ok(fresh.length > 0, v.id + ' puts a new fish in reach');
    }
    console.log('    ' + v.name.padEnd(20) + String(opened).padStart(5) +
                ' new samples   ' + (fresh.map(f => f.name).join(', ') || '-'));
    prev = Math.max(prev, reach);
  });
  ok(seen.size === roster.fish.length, 'every fish is reachable in the end (' +
     seen.size + ' of ' + roster.fish.length + ')');
}

section('Result');
console.log(fail === 0
  ? checks + ' checks passed. This proves it RUNS, not that it looks right.'
  : fail + ' of ' + checks + ' checks failed.');
process.exit(fail ? 1 : 0);
