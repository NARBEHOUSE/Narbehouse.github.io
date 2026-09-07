/**
 * Is the map true, and is Options reachable from everywhere?
 *
 *     node tools/mapcheck.js
 *
 * THE MAP. Walt hands over a chart of Whispering Lake in the first
 * conversation, and it opens over the whole screen with the four waters named
 * where they lie, the dock where it stands, and a marker on the player. A map
 * that is merely decorative would be worse than no map at all, so drawMap
 * reports every label it drew with the point of the LAKE it drew it on - and
 * this asks the chart what is actually there. A label reading "The Abyssal
 * Trench" over thirty feet of water fails here.
 *
 * It also checks what the map must NOT show. Fishing spots are the job; the
 * map is the lake.
 *
 * OPTIONS. It was Pause, and it existed only while afloat - so on the dock and
 * in the shop there was no way to the settings at all, which for somebody
 * playing with two switches means no way to change the scan. It is the last
 * stop in every scene's scan now, and that is checked scene by scene.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

/* ── 1. The map arrives with Walt's first conversation ─────────────────── */

console.log('THE MAP');
console.log();
ok(!G.hasMap(), 'a new game has no map');

const steps = G.briefSteps(G.currentMission());
const last = steps[steps.length - 1] || {};
ok(/\bmap\b/i.test(last.text || ''), 'the last thing Walt says in the first brief is about the map');
say('  he says: "' + String(last.text || '').slice(0, 78) + '..."');
ok(steps.length >= 5, 'the first brief is still a conversation (' + steps.length + ' turns)');
ok(steps.every(s => s.reply), 'every one of his lines has something for you to say back');

G.goToDock();
G.takeCounterBeat();                          // hear him out
ok(G.hasMap(), 'after talking to Walt, you have the map');

/* ── 2. What the map says is what the lake is ──────────────────────────── */

const st = G.mapState();
ok(!!(st && st.chart), 'the map reads the same chart the boat drives on');

const canvas = { width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
                 getContext: () => require('./playtest.js') && stubCtx() };
function stubCtx() {
  // Only what drawMap uses. Nothing here draws; the report is what is checked.
  return new Proxy({}, { get(_t, k) {
    if (k === 'measureText') return (s) => ({ width: (s || '').length * 7 });
    if (k === 'createImageData') return () => null;
    return () => {};
  }, set() { return true; } });
}

const drew = RT.minimap.drawMap(canvas, st.chart, st);
ok(!!drew, 'the map draws');
console.log();
console.log('label'.padEnd(22), 'kind'.padEnd(8), 'x'.padStart(7), 'z'.padStart(8), 'depth ft'.padStart(9));
(drew.labels || []).forEach((l) => {
  console.log(l.text.padEnd(22), String(l.kind).padEnd(8), l.wx.toFixed(0).padStart(7),
              l.wz.toFixed(0).padStart(8), st.chart.depthAt(l.wx, l.wz).toFixed(1).padStart(9));
});
console.log();

/* The bands, as the content names them, with the feet they mean. */
const BANDS = (st.chart.stages || []).reduce((m, s) => {
  if (s.name && s.depthFt) m[s.name] = s.depthFt;
  return m;
}, {});
const water = (drew.labels || []).filter(l => l.kind === 'water');
ok(water.length === 4, 'all four waters are named (' + water.length + ')');
water.forEach((l) => {
  const ft = st.chart.depthAt(l.wx, l.wz);
  const band = BANDS[l.text];
  ok(!!band, '"' + l.text + '" is a water the content actually names');
  if (!band) return;
  const lo = band[0], hi = band[1] || 1e9;
  ok(ft >= lo && ft < hi,
     '"' + l.text + '" is written over ' + ft.toFixed(0) + ' ft of water, which is ' +
     lo + ' to ' + (hi > 1e8 ? 'the bottom' : hi + ' ft'));
});

/* NO NAME MAY LAND ON ANOTHER NAME. Not just the waters against each other -
   the first cut of this map had "You are here" sitting straight across "The
   Shoreline", and with a boat's name in it the you-label wiped that water's
   name off the chart completely. Every label reports the box it took, so
   every pair can be checked against every other. */
function overlaps(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1 &&
         Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 1;
}
function noPileUp(labels, when) {
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      ok(!overlaps(labels[i], labels[j]),
         when + ': "' + labels[i].text + '" does not land on "' + labels[j].text + '"');
    }
  }
}
noPileUp(drew.labels || [], 'at the dock');
// And every one of them has to be ON the paper.
(drew.labels || []).forEach(l => ok(l.x > 0 && l.x < canvas.width && l.y > 0 && l.y < canvas.height,
                                    '"' + l.text + '" is inside the map, not off the edge'));

const island = (drew.labels || []).find(l => l.kind === 'island');
ok(!!island && st.chart.depthAt(island.wx, island.wz) <= 0, 'the island is named on land, not on water');
const dock = (drew.labels || []).find(l => l.kind === 'dock');
ok(!!dock && Math.hypot(dock.wx - st.chart.dock.x, dock.wz - st.chart.dock.z) < 1,
   "Walt's dock is marked at the dock");

const you = (drew.labels || []).find(l => l.kind === 'you');
ok(!!you, 'the map shows where you are');
ok(you && Math.hypot(you.wx - st.chart.dock.x, you.wz - st.chart.dock.z) < 40,
   'standing at the dock, that marker is at the dock');

/* NO FISHING SPOTS. The map is the lake, not the answers. */
const places = ((RT.content && RT.content.lake && RT.content.lake.places) || []);
ok(places.length > 0, 'the lake does have marked fishing places (' + places.length + ')');
const gaveAway = (drew.labels || []).filter(l => places.some(p =>
  Math.hypot(l.wx - p.x, l.wz - p.z) < 60));
ok(gaveAway.length === 0, 'the map marks no fishing spots (' + gaveAway.length + ' near one)');
ok((drew.labels || []).length === water.length + 3,
   'the map carries the waters, the island, the dock and you - and nothing else (' +
   (drew.labels || []).length + ' labels)');

/* CONTOURS. The three depths the waters are named for, and the three the
   boats are limited by, traced through the soundings rather than left as the
   boundary between two colours of pixel. */
(drew.contours || []).forEach(function (b) {
  ok(b.segs > 50, 'the ' + b.ft + ' ft contour is drawn (' + b.segs + ' segments)');
});
ok((drew.contours || []).length === 3, 'all three isobaths are on the chart');

// A chart with no scale is a picture.
ok(drew.scaleFt >= 100, 'there is a scale bar, in feet (' + drew.scaleFt + ' ft)');
const barTrue = drew.scaleFt * 0.61 * drew.pxPerUnit;
ok(Math.abs(barTrue - drew.scalePx) < 1,
   'the scale bar is drawn the length it claims (' + drew.scalePx.toFixed(0) + ' px)');

/* ── 3. The map follows you out onto the water ─────────────────────────── */

G.castOff();
for (let i = 0; i < 240; i++) G.update(1 / 30);
const afloat = G.mapState();
const drew2 = RT.minimap.drawMap(canvas, afloat.chart, afloat);
const you2 = (drew2.labels || []).find(l => l.kind === 'you');
ok(!!you2, 'out on the water, the map still shows where you are');
ok(you2 && Math.hypot(you2.wx - afloat.x, you2.wz - afloat.z) < 0.01,
   'and it shows the boat where the boat is');
say('  afloat at ' + afloat.x.toFixed(0) + ', ' + afloat.z.toFixed(0) +
    ' - ' + afloat.label);
noPileUp(drew2.labels || [], 'out on the water');

/* The worst case for the type: standing at the dock with a long boat name in
   the you-label, which is where the pile-up was found. */
const longName = { x: st.chart.dock.x, z: st.chart.dock.z, head: 0,
                   label: 'You (in the red rental canoe)' };
const drew3 = RT.minimap.drawMap(canvas, st.chart, longName);
noPileUp(drew3.labels || [], 'with a long boat name');
ok((drew3.labels || []).length === (drew.labels || []).length,
   'and every name is still on the map (' + (drew3.labels || []).length + ')');

/* ── 4. Options is in the scan, wherever you are ───────────────────────── */

console.log();
console.log('OPTIONS, SCENE BY SCENE');
console.log();

function optionsIn(list, where) {
  const keys = list.map(t => t.key);
  say('  ' + where.padEnd(6) + ' ' + keys.join(' | '));
  const o = list.find(t => t.key === 'options');
  ok(!!o, where + ': Options is one of the things you can pick');
  ok(!o || o.domId === 'pauseBtn', where + ': it lives on the Options button');
  ok(keys[keys.length - 1] === 'options', where + ': and it is the last stop in the scan');
  ok(!o || /settings/i.test(o.speech), where + ': it says what it holds');
  return o;
}

const spot = G.spotTargets();
optionsIn(spot, 'spot');

G.returnToDock();
for (let i = 0; i < 60; i++) G.update(1 / 30);
const atDock = G.dockTargets();
const o2 = optionsIn(atDock, 'dock');
ok(/map of the lake/i.test(o2.speech), 'with the map in hand, Options offers it out loud');

G.enterShop();
optionsIn(G.shopTargets(), 'shop');

/* ── 5. The boards, and the boat beside them ───────────────────────────── */

console.log();
console.log('THE DOCK, AS SOMEWHERE TO FISH FROM');
console.log();
G.goToDock();
for (let i = 0; i < 60; i++) G.update(1 / 30);
const targets = RT.scene.dockTargets;
const dk = st.chart.dock;
const boards = targets.find(t => t.key === 'boards' || t.key === 'boat');
ok(!!boards, 'there is somewhere to fish from at the dock');
const bb = new THREE.Box3().setFromObject(boards.obj);
const size = bb.getSize(new THREE.Vector3());
console.log('the fishing target:', boards.key,
            'box', size.x.toFixed(1) + ' x ' + size.z.toFixed(1),
            'at x', boards.pos.x.toFixed(1));
ok(!!boards.obj, 'it owns an object, so a mouse or a finger can pick it');
ok(size.x <= 5.2 && size.z <= 9,
   'its highlight is the end of the boards, not half the jetty (' +
   size.x.toFixed(1) + ' by ' + size.z.toFixed(1) + ')');
ok(Math.abs(boards.pos.x - dk.x) < 1.0, 'and it is centred on the decking');

/* Every prop on the jetty has to be ON the jetty. The decking is 4.6 wide. */
const decked = [];
RT.scene.dockLayout().forEach((r) => { if (r.inWater) decked.push(r); });
say('  ' + decked.length + ' pieces of the dock stand over water');

/* ── 6. With a boat tied up: two places to fish, both pickable ─────────── */

console.log();
console.log('THE DOCK WITH A CANOE ALONGSIDE');
console.log();
/* Put a canoe on the mooring. The ladder gates it behind five jobs and the
   ladder is tested elsewhere; what is being tested here is the DOCK with a
   boat alongside, so the save is set straight rather than played through. */
const sv = G.getSave();
sv.money += 400;
if (!sv.vessels.includes('canoe')) sv.vessels.push('canoe');
sv.vessel = 'canoe';
sv.onFoot = false;
ok(G.vessel().id === 'canoe', 'there is a canoe on the mooring');
G.goToDock();
for (let i = 0; i < 60; i++) G.update(1 / 30);
const both = RT.scene.dockTargets;
say('  ' + both.map(t => t.key).join(' | '));
const bd = both.find(t => t.key === 'boards');
const bt = both.find(t => t.key === 'boat');
ok(!!bd, 'the boards are still somewhere to fish from with a canoe tied up');
ok(!!bt, 'and the canoe is there to take out');

/* THE REGRESSION THIS EXISTS FOR. pickTarget - the only way a mouse or a
   finger chooses anything in the scene - walks the ray's hit up to the first
   ancestor that OWNS a target. A target with no object is invisible to it, so
   for an afternoon the canoe had a bracket, had a caption, and could not be
   clicked. Both of these must own something. */
[bd, bt].forEach((t) => {
  ok(!!(t && t.obj), (t ? t.key : '?') + ' owns an object, so it can be clicked');
});

/* The plate goes ABOVE the bracket, not across the hull. */
const box = new THREE.Box3().setFromObject(bt.obj);
const top = box.max.y - bt.pos.y;
console.log('canoe: box top', top.toFixed(2), 'above the anchor; plate at', bt.labelY.toFixed(2));
ok(bt.labelY > top + 0.5,
   'the canoe\'s name plate clears the top of its own highlight (' +
   bt.labelY.toFixed(2) + ' vs ' + top.toFixed(2) + ')');
ok(Math.abs(bt.pos.x - box.getCenter(new THREE.Vector3()).x) < 1.2,
   'and it is centred over the boat');

/* AND THE BOAT IS STILL THERE AFTER FISHING OFF THE BOARDS.
   "On foot" is a fact about one trip. Left set - which it was - vessel()
   answered 'foot' for ever after, so the dock had no boat tied up at it and
   no way to take one out, and the canoe sat in the save unreachable. */
G.setOnFoot(true);
G.castOff();
for (let i = 0; i < 30; i++) G.update(1 / 30);
ok(G.vessel().id === 'foot', 'fishing off the boards puts you on foot for the trip');
G.returnToDock();
ok(!G.isOnFoot(), 'and coming back in takes you off foot again');
ok(G.vessel().id === 'canoe', 'so the canoe is your boat again at the dock');
G.goToDock();
for (let i = 0; i < 60; i++) G.update(1 / 30);
const after = RT.scene.dockTargets.map(t => t.key);
say('  after a trip on the boards: ' + after.join(' | '));
ok(after.indexOf('boat') >= 0 && after.indexOf('boards') >= 0,
   'and both ways to fish are on the dock again');

/* AN OLD SAVE WITH THE FLAG STUCK IN IT. Before this, "on foot" was written
   to the save, so a game that was quit while it was set came back believing
   the player was standing on the planks - no boat at the dock, ever again.
   The flag is not read out of the save any more, and this is that: a save
   carrying the old stuck value, and a canoe that turns up anyway. */
G.getSave().onFoot = true;
G.goToDock();
for (let i = 0; i < 60; i++) G.update(1 / 30);
ok(G.vessel().id === 'canoe', 'an old save with the flag stuck still has its canoe');
ok(RT.scene.dockTargets.some(t => t.key === 'boat'),
   'and the boat is tied up at the dock where it belongs');

/* The two are different places on the jetty - the boat one side, the fishing
   the other - rather than one crowded corner. */
const apart = Math.abs(bd.pos.x - bt.pos.x);
ok(apart > 2.5, 'the boat and the fishing spot are ' + apart.toFixed(1) +
                ' units apart across the boards');
ok((bd.pos.x - dk.x) * (bt.pos.x - dk.x) <= 0,
   'and they are on opposite sides of the centreline');

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. The map is true and Options is everywhere.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);

function say(s) { if (H.VERBOSE || true) console.log(s); }
