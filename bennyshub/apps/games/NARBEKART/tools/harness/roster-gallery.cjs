/**
 * NK.roster — contract checks, the per-racer draw-call budget, and the visual
 * sheets (all 12 racers in the Classic Race Car from the chase camera and 3/4
 * front, one racer in every vehicle, a start grid, poses, night lighting).
 *
 * Page: tools/gallery-roster.html (window.G).
 */
const DESIGN_IDS = ['pip', 'mochi', 'sunny', 'pixel', 'rusty', 'biscuit', 'waddles', 'hopper', 'bruno', 'bolt', 'rex', 'hattie'];
const DESIGN_WEIGHTS = ['light', 'light', 'light', 'light', 'medium', 'medium', 'medium', 'medium', 'heavy', 'heavy', 'heavy', 'heavy'];
const VEHICLES = ['kart', 'bike', 'buggy', 'hover'];
const EXPECT = {                      // wheels, steer pivots, rear contacts, hover pad meshes
  kart: [4, 2, 2, 0], bike: [2, 1, 1, 0], buggy: [4, 2, 2, 0], hover: [0, 0, 2, 1]
};

module.exports = async function (t) {
  await t.load('apps/games/NARBEKART/tools/gallery-roster.html');
  await t.until('window.G && G.ready');

  /* ── Data contract ─────────────────────────────────────────────────── */
  const data = await t.js(`(function () {
    const R = NK.roster;
    return {
      chars: R.CHARACTERS.map((c) => ({ id: c.id, name: c.name, animal: c.animal, weight: c.weight, stats: c.stats,
        colors: c.colors, blurb: c.blurb, emoji: c.emoji })),
      vehicles: R.VEHICLES.map((v) => ({ id: v.id, name: v.name, emoji: v.emoji, blurb: v.blurb, mods: v.mods })),
      fallback: R.build('nobody', 'nothing').userData.charId + '/' + R.statsFor('nobody', 'nothing').speedMul
    };
  })()`);
  t.assert(JSON.stringify(data.chars.map((c) => c.id)) === JSON.stringify(DESIGN_IDS), 'character ids and order match DESIGN 9.1', data.chars.map((c) => c.id));
  t.assert(JSON.stringify(data.chars.map((c) => c.weight)) === JSON.stringify(DESIGN_WEIGHTS), 'weight classes match DESIGN 9.1');
  t.assert(JSON.stringify(data.vehicles.map((v) => v.id)) === JSON.stringify(VEHICLES), 'vehicle ids match DESIGN 9.2');
  const statsOk = data.chars.every((c) => ['speed', 'accel', 'handling', 'weight'].every((k) => c.stats[k] >= 1 && c.stats[k] <= 5));
  t.assert(statsOk, 'every stat is 1..5');
  const sums = data.chars.map((c) => c.stats.speed + c.stats.accel + c.stats.handling + c.stats.weight);
  t.assert(sums.every((s) => s === 13), 'every character\'s stats sum to 13 (no strictly better pick)', sums);
  t.assert(data.vehicles.every((v) => Object.values(v.mods).every((m) => m >= -1 && m <= 1) &&
    Object.values(v.mods).reduce((a, b) => a + b, 0) === 0), 'vehicle mods are -1..+1 and sum to zero');
  t.assert(data.chars.every((c) => c.blurb && c.blurb.split(/[.!?]/).filter((s) => s.trim()).length === 1 && c.emoji &&
    ['primary', 'secondary', 'accent', 'kart'].every((k) => /^#[0-9a-f]{6}$/i.test(c.colors[k]))), 'blurbs are one sentence; emoji + 4 colours present');
  t.assert(/^pip\//.test(data.fallback), 'unknown ids fall back safely instead of throwing', data.fallback);

  /* ── statsFor ranges ───────────────────────────────────────────────── */
  const st = await t.js('G.stats()');
  const flat = [];
  st.forEach((c) => c.byKart.forEach((k) => flat.push(Object.assign({ c: c.c }, k))));
  const rng = (key) => [Math.min(...flat.map((f) => f[key])), Math.max(...flat.map((f) => f[key]))];
  const R = { speedMul: rng('speedMul'), accelRate: rng('accelRate'), handlingMul: rng('handlingMul'), weight: rng('weight') };
  t.assert(R.speedMul[0] >= 0.97 && R.speedMul[1] <= 1.05, 'speedMul within 0.97..1.05', R.speedMul);
  t.assert(R.accelRate[0] >= 1.1 && R.accelRate[1] <= 2.0, 'accelRate within 1.1..2.0', R.accelRate);
  t.assert(R.handlingMul[0] >= 0.9 && R.handlingMul[1] <= 1.1, 'handlingMul within 0.9..1.1', R.handlingMul);
  t.assert(R.weight[0] >= 0.7 && R.weight[1] <= 1.4, 'weight within 0.7..1.4', R.weight);
  const kartOf = (id) => flat.find((f) => f.c === id && f.v === 'kart');
  t.assert(kartOf('pip').accelRate > kartOf('rex').accelRate && kartOf('pip').speedMul < kartOf('rex').speedMul &&
    kartOf('mochi').handlingMul < kartOf('bruno').handlingMul, 'light = quick accel/handling, heavy = top speed');
  t.assert(kartOf('rusty').speedMul === 1 && kartOf('rusty').weight === 1, 'a medium racer on the Classic Race Car is the class baseline', kartOf('rusty'));
  t.note('statsFor ranges ' + JSON.stringify(R));
  t.note('statsFor kart: ' + flat.filter((f) => f.v === 'kart').map((f) => f.c + ' ' + [f.speedMul, f.accelRate, f.handlingMul, f.weight].join('/')).join(' | '));

  /* ── Model contract + draw-call budget, every pairing ──────────────── */
  const table = [];
  for (const c of DESIGN_IDS) {
    for (const v of VEHICLES) {
      const m = await t.js(`G.measure(${JSON.stringify(c)}, ${JSON.stringify(v)})`);
      table.push(m);
    }
  }
  const over = table.filter((m) => m.calls > 8);
  t.assert(!over.length, 'every racer draws in <= 8 calls (outlines included)', over.map((m) => m.c + '/' + m.v + '=' + m.calls));
  const shape = table.filter((m) => {
    const e = EXPECT[m.v];
    return m.wheels !== e[0] || m.steer !== e[1] || m.rear !== e[2] || m.pads !== e[3] || m.exhaust < 1 || !m.spinOk || !m.ids;
  });
  t.assert(!shape.length, 'userData: wheels / steerWheels / rearContacts / hoverPads / exhaust per vehicle', shape);
  const lenBad = table.filter((m) => Math.abs(m.len - 2.8) > 0.12);
  t.assert(!lenBad.length, 'every racer is ~2.8 m nose to tail', lenBad.map((m) => m.c + '/' + m.v + ' ' + m.len));
  const noseBad = table.filter((m) => m.noseZ > -1.3);
  t.assert(!noseBad.length, 'racers face -Z (nose at negative z)', noseBad.map((m) => m.c + '/' + m.v + ' ' + m.noseZ));
  const groundBad = table.filter((m) => (m.v === 'hover' ? Math.abs(m.minY - 0.04) > 0.05 : Math.abs(m.minY) > 0.02));
  t.assert(!groundBad.length, 'origin at the road contact (wheels touch y = 0)', groundBad.map((m) => m.c + '/' + m.v + ' ' + m.minY));
  const hoverFloat = table.filter((m) => m.v === 'hover' && (m.chassisMinY < 0.28 || m.chassisMinY > 0.42));
  t.assert(!hoverFloat.length, 'hover chassis floats ~0.35 m', hoverFloat.map((m) => m.c + ' ' + m.chassisMinY));
  const hBad = table.filter((m) => m.height < 1.5 || m.height > 3.3);
  t.assert(!hBad.length, 'userData.height is sane', hBad.map((m) => m.c + '/' + m.v + ' ' + m.height));
  const byV = {};
  table.forEach((m) => { (byV[m.v] = byV[m.v] || []).push(m); });
  Object.keys(byV).forEach((v) => {
    const L = byV[v];
    t.note(v + ': calls ' + Math.min(...L.map((m) => m.calls)) + '-' + Math.max(...L.map((m) => m.calls)) +
      ' (glider out: ' + Math.max(...L.map((m) => m.gliderCalls)) + '), tris ' + Math.min(...L.map((m) => m.tris)) + '-' +
      Math.max(...L.map((m) => m.tris)) + ', width ' + Math.min(...L.map((m) => m.width)) + '-' + Math.max(...L.map((m) => m.width)) +
      ', height ' + Math.min(...L.map((m) => m.height)) + '-' + Math.max(...L.map((m) => m.height)));
  });
  t.note('per racer (calls/tris): ' + table.map((m) => m.c + '/' + m.v + ' ' + m.calls + '/' + m.tris).join(', '));
  const avg = (L, k) => Math.round(L.reduce((a, m) => a + m.parts[k], 0) / L.length);
  Object.keys(byV).forEach((v) => t.note(v + ' average tris: chassis ' + avg(byV[v], 'chassis') + ', driver ' +
    avg(byV[v], 'driver') + ', wheels ' + avg(byV[v], 'wheels')));
  const drv = {};
  table.filter((m) => m.v === 'kart').forEach((m) => { drv[m.c] = m.parts.driver; });
  t.note('driver tris by character: ' + JSON.stringify(drv));

  /* ── Visual sheets ─────────────────────────────────────────────────── */
  const kartList = DESIGN_IDS.map((c) => ({ c, v: 'kart' }));
  const built = await t.js(`G.sheet(${JSON.stringify(kartList)}, 'chase', { cols: 4 })`);
  t.note('build ms (first build per racer): ' + built.map((b) => b.c + ' ' + b.buildMs).join(', '));
  await t.shot('01-kart-chase');
  await t.js(`G.sheet(${JSON.stringify(kartList)}, 'front', { cols: 4 })`);
  await t.shot('02-kart-front34');
  await t.js(`G.sheet(${JSON.stringify(kartList)}, 'side', { cols: 4 })`);
  await t.shot('03-kart-side');
  await t.js(`G.sheet(${JSON.stringify(kartList)}, 'portrait', { cols: 4 })`);
  await t.shot('03b-kart-portrait');

  for (const who of ['rusty', 'hattie']) {
    const vl = [];
    VEHICLES.forEach((v) => vl.push({ c: who, v, angle: 'chase' }));
    VEHICLES.forEach((v) => vl.push({ c: who, v, angle: 'front' }));
    await t.js(`G.sheet(${JSON.stringify(vl)}, 'chase', { cols: 4 })`);
    await t.shot('04-vehicles-' + who);
  }
  for (const v of ['bike', 'buggy', 'hover']) {
    await t.js(`G.sheet(${JSON.stringify(DESIGN_IDS.map((c) => ({ c, v })))}, 'chase', { cols: 4 })`);
    await t.shot('05-' + v + '-chase');
  }

  await t.js(`G.race('kart', { player: 'pip' })`);
  await t.shot('06-grid-chase-kart');
  await t.js(`G.race('hover', { player: 'bolt' })`);
  await t.shot('07-grid-chase-hover');
  await t.js(`G.race('buggy', { player: 'rex' })`);
  await t.shot('07b-grid-chase-buggy');
  await t.js(`G.race('bike', { player: 'mochi' })`);
  await t.shot('07c-grid-chase-bike');

  await t.js(`G.pose('biscuit', 'kart', { steer: 0.45, spin: 0.9, lean: 0.25 }, 'back3q')`);
  await t.shot('08-pose-steer-lean');
  await t.js(`G.pose('waddles', 'buggy', { glider: true, bob: 0.1 }, 'back3q')`);
  await t.shot('09-pose-glider');
  await t.js(`G.pose('pip', 'kart', { glider: true }, 'chaseFar')`);
  await t.shot('09b-pose-glider-chase');
  await t.js(`G.pose('hopper', 'hover', { bounce: 0.25, lean: -0.3, squash: 0.85 }, 'front')`);
  await t.shot('09c-pose-celebrate-squash');

  await t.js(`G.light('night'); G.sheet(${JSON.stringify(kartList)}, 'chase', { cols: 4 })`);
  await t.shot('10-kart-chase-night');
  await t.js(`G.light('day'); true`);
};
