/**
 * art-items: screenshots of every item, set piece and effect in
 * tools/gallery-items.html, the start-gantry light states, a race view of each
 * road style, pads at 60 m, and an FX stress test with 2000+ live particles.
 * Records the draw calls of every object (each rendered alone) in results.json.
 */
module.exports = async function (t) {
  await t.setSize(1920, 1080);
  await t.load('apps/games/NARBEKART/tools/gallery-items.html');
  await t.until('window.__gallery && __gallery.ready', 40000);
  await t.wait(800);

  const shot = async (name, code, ms) => {
    if (code) await t.js(code + '; true');
    await t.wait(ms === undefined ? 400 : ms);
    return t.shot(name);
  };

  // Gallery rows
  await shot('01-overview', '__gallery.view("overview")');
  await shot('02-items', '__gallery.view("items")');
  await shot('03-items-angle', '__gallery.view("items2")');
  await shot('04-pads-ramps', '__gallery.view("pads")');
  await shot('05-karts-trophies', '__gallery.view("karts")');
  await shot('06-setpieces', '__gallery.view("setpieces")');
  await shot('07-drone-closeup', '__gallery.view("drone")');

  // Start lights: off, 3, 2, 1, GO
  for (const n of [-1, 3, 2, 1, 0]) {
    const tag = n < 0 ? 'off' : (n === 0 ? 'go' : String(n));
    await shot('08-gantry-' + tag, '__gallery.view("gantry"); __gallery.setLights(' + n + ')');
  }
  const lights = await t.js('__gallery.info()');
  t.note('gantry view renderer.info ' + JSON.stringify(lights));

  await shot('09-props', '__gallery.view("props")');
  await shot('10-props-angle', '__gallery.view("props2")');

  // Close-ups (turntables paused at a three-quarter angle)
  const close = [
    ['Power Box'], ['Coin', 2.6], ['Banana Peel', 3.2], ['Bumper Ball', 3.2], ['Homing Bee', 3.4], ['Leader Zapper', 4.5],
    ['Boom Box', 3.4], ['Shrink Puff', 4.5], ['Honk Horn wave (x0.34)', 7], ['Super Star aura', 7.5], ['Jet Mode casing', 8.5],
    ['Jet Mode casing', 9, 2.7, 0.35],
    ['Glider', 8.5], ['Gold Trophy', 2.6], ['Power Pad', 7, 0.3, 0.7], ['Glide Ramp (2 lanes)', 13, -0.9, 0.5]
  ];
  for (let i = 0; i < close.length; i++) {
    const c = close[i];
    const args = [JSON.stringify(c[0]), c[1] === undefined ? 'undefined' : c[1], c[2] === undefined ? 'undefined' : c[2], c[3] === undefined ? 'undefined' : c[3]];
    await shot('c' + String(i + 1).padStart(2, '0') + '-' + c[0].replace(/\W+/g, '-').toLowerCase(), '__gallery.focus(' + args.join(',') + ')', 500);
  }

  // Road styles in a race view
  for (const s of ['asphalt', 'rainbow', 'ice', 'candy', 'stone', 'sand']) {
    await shot('11-road-' + s, '__gallery.road("' + s + '")', 700);
  }
  const inst = await t.js('__gallery.instancedCalls()');
  t.note('instanced rows (5 boxes, 5 coins) draw calls ' + JSON.stringify(inst));
  t.assert(inst[0].calls === 3 && inst[1].calls === 3, 'a whole row of boxes / coins is 3 draw calls when instanced', inst);
  await shot('12-road-top', '__gallery.road("asphalt"); __gallery.roadView("top")', 700);
  await shot('13-pads-60m-zoom-idle', '__gallery.roadView("far")', 400);
  await shot('13a-pads-60m-zoom-lit', '__gallery.padGlow(true)', 400);
  await shot('13b-pads-60m-chase-lit', '__gallery.roadView("chase")', 400);
  await t.js('__gallery.padGlow(false); true');
  await shot('13c-pads-60m-rainbow-zoom', '__gallery.road("rainbow"); __gallery.roadView("far")', 700);

  // Drift sparks (charge levels 1-3) and boost flame at the kart, in the race view
  await t.js('__gallery.road("asphalt"); true');
  for (const lv of [1, 2, 3]) await shot('16-road-drift-fx-level' + lv, '__gallery.roadFx(' + lv + ')', 900);
  await t.js('__gallery.roadFx(0); true');

  // Effects
  await t.js('__gallery.mode("fx"); true');
  await t.wait(1600);
  await t.shot('14-fx-demo');
  await t.js('__gallery.fxStress(2000); true');
  await t.wait(2500);
  const fx = await t.js('__gallery.fxReport()');
  t.note('fx ' + JSON.stringify(fx));
  t.assert(fx.live >= 2000, '2000+ particles live', fx);
  t.assert(fx.calls <= 3, 'all particles draw in at most 3 calls', fx);
  await t.shot('15-fx-stress');

  // Draw calls per object, each rendered alone
  const calls = await t.js('__gallery.calls()');
  calls.forEach((c) => t.note('calls ' + c.name + ' = ' + c.calls + ' (' + c.tris + ' tris)'));
  const budget = {
    'items.box': 4, 'items.coin': 4, 'items.pad power': 2, 'items.pad boost': 2, 'items.ramp jump': 3, 'items.ramp glide': 3,
    'items.peel': 3, 'items.ball': 4, 'items.bee': 5, 'items.zapper': 6, 'items.bomb': 5, 'items.hornWave': 3,
    'items.starAura': 2, 'items.jetShell': 5, 'items.shrinkPuff': 1, drone: 10, startGantry: 7, podium: 4,
    'props.grandstand': 4, 'props.billboard': 2, 'props.balloon_arch': 2, 'props.pit_building': 2, 'props.traffic_cone': 2
  };
  calls.forEach((c) => { if (budget[c.name] !== undefined) t.assert(c.calls <= budget[c.name], 'draw calls ' + c.name + ' <= ' + budget[c.name], c); });
  t.assert(t.errors.length === 0, 'no console errors', t.errors.slice(0, 5));
};
