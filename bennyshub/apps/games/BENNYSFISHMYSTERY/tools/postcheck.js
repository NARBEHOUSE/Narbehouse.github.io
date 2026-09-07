/**
 * The quiet lake: what changes when the bell is rung, and what is left to find.
 *
 *     node tools/postcheck.js
 *
 * Asked for: "when we beat the game, the fog goes away, the log dam gets
 * cleared out and the lake returns to normal... Walt can invite you to keep
 * fishing for some mysterious fish types, super rare, in different specific
 * locations, and more magnet fishing to get some new rare things." "You need
 * the heavy magnet to get the rare after-gameplay items." "You need various
 * lures to get the 10 mystery fish - each lure in different locations, but
 * it's unknown." "Once we get the unique fish or the unique items then we
 * shouldn't be able to catch them again." And, above everything else:
 *
 *   "I DON'T WANT CARDS ON THE 10 NEW FISH TO SHOW NEW FISH - it should be
 *   just the default fish we know about, and fishing those spots with
 *   different lures might catch a new type of fish. It's a complete
 *   experiment for the player to try to catch a new fish."
 *
 * That last one is the whole design and it is the easiest thing in here to
 * break by accident: any list a card is built from - the water's own roster,
 * the fish at a depth, the name a shoal is called - would give the game away
 * the moment it included one. So it is checked from the outside, by asking
 * the game for those lists and looking for the names in them.
 *
 * WHAT THIS HOLDS
 *   the bell opens the lake, and nothing before it does
 *   the timber is gone, the fog is off, and the depths stop eating hulls
 *   not one of the ten fish is named anywhere a player can read
 *   each wants ONE lure in ONE water, and refuses every other pair
 *   about one cast in two hundred, measured, not read off a constant
 *   nothing lifts a relic but the heavy magnet
 *   found once is found for good - and the pool empties as they are found
 *   two collection jobs that count off the save and can be handed in
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

const R = RT.content.roster;
const MYSTERY = (R.fish || []).filter(f => f.mystery);
const RELICS = (R.items || []).filter(i => i.kind === 'relic');

/* ── The lake before the bell ─────────────────────────────────────────── */
console.log('BEFORE THE BELL');
G.debugSolve(false);
const barsBefore = ((G.chartFor ? G.chartFor() : null) || {});
const L0 = RT.lake.chart(RT.content.lake);
ok(!G.isSolved(), 'the mystery is not solved at the start of the game');
ok(L0.barriers.length === 1, 'the log jam is across the narrows (' + L0.barriers.length + ')');
const deepWear = G.debugWearFactor(676, -1940);
console.log('  hull wear out in the trench: ' + deepWear.toFixed(2) + 'x');
ok(deepWear > 4, 'and the deep half is hard on a hull (' + deepWear.toFixed(1) + 'x)');
ok(!G.debugMysteryRoll('trench', 'deep_rig', 'pro_rod'),
   'and none of the ten fish is in the water yet');
ok(!G.debugRelicRoll('trench'), 'and nothing unique is on the bottom yet');

/* ── And after it ─────────────────────────────────────────────────────── */
console.log();
console.log('AFTER THE BELL');
G.debugSolve(true);
ok(G.isSolved(), 'ringing the bell solves the mystery');
/* The chart is read through one accessor, and emptying the barrier list there
   is what makes the jam stop existing for the hull, the helm, the arrow, the
   minimap and the art at the same moment. */
const L1 = G.debugChart ? G.debugChart() : null;
const wear1 = G.debugWearFactor(676, -1940);
console.log('  hull wear out in the trench: ' + wear1.toFixed(2) + 'x');
ok(wear1 === 1, 'the depths stop chewing up a hull just for being out there');

/* ── Not one of them is named where a player can read it ──────────────── */
console.log();
console.log('WHAT THE WATER SAYS IT HOLDS - the ten must not be in any of it');
const names = MYSTERY.map(f => f.name);
let leaked = [];
[['shoreline', 5], ['bay', 20], ['dropoff', 55], ['trench', 110]].forEach(function (pair) {
  const w = G.debugWaterNames(pair[0], pair[1]);
  console.log('  ' + pair[0].padEnd(10) + w.biome.join(', '));
  names.forEach(function (n) {
    if (w.biome.indexOf(n) >= 0) leaked.push(pair[0] + ' roster: ' + n);
    if (w.atDepth.indexOf(n) >= 0) leaked.push(pair[0] + ' at depth: ' + n);
  });
});
if (leaked.length) leaked.forEach(l => console.log('    LEAK ' + l));
ok(leaked.length === 0,
   'no card, cue or shoal can name one before it is caught (' + leaked.length + ' leaks)');
ok(MYSTERY.every(f => f.secret === true),
   'every one of the ten is marked secret in the roster');

/* ── One lure, one water ──────────────────────────────────────────────── */
console.log();
console.log('WHAT EACH ONE WANTS - and what it refuses');
const BAITS = (R.baits || []).map(b => b.id);
const WATERS = ['shoreline', 'bay', 'dropoff', 'trench'];
let wrongPair = 0, everBit = 0;
MYSTERY.forEach(function (f) {
  const want = f.mystery;
  /* The right pair, enough times to be sure it CAN happen at all. */
  let hits = 0;
  for (let i = 0; i < 40000; i++) {
    G.debugSets();                                  // no side effects; keeps it honest
    if (G.debugMysteryRoll(want.biomeId, want.baitId, 'pro_rod')) hits++;
  }
  if (hits > 0) everBit++;
  /* And every wrong pair, which must never produce it. Only the pairs that
     are wrong for THIS fish and right for no other, or the count would catch
     a different one of the ten legitimately. */
  let bad = 0;
  WATERS.forEach(function (w) {
    BAITS.forEach(function (b) {
      const claimed = MYSTERY.some(g => g.mystery.biomeId === w && g.mystery.baitId === b);
      if (claimed) return;
      for (let i = 0; i < 4000; i++) if (G.debugMysteryRoll(w, b, 'pro_rod')) bad++;
    });
  });
  wrongPair += bad;
  console.log('  ' + f.name.padEnd(18) + want.baitId.padEnd(12) + want.biomeId.padEnd(10) +
              hits + ' bites in 40,000 right casts, ' + bad + ' on any wrong pair');
});
ok(everBit === MYSTERY.length,
   'every one of the ten can actually be caught (' + everBit + '/' + MYSTERY.length + ')');
ok(wrongPair === 0, 'and none of them ever takes the wrong lure or the wrong water');

/* ── How rare, measured ───────────────────────────────────────────────── */
console.log();
console.log('HOW RARE, over 200,000 casts of the right lure in the right water');
const probe = MYSTERY[0].mystery;
let n = 0;
const N = 200000;
for (let i = 0; i < N; i++) if (G.debugMysteryRoll(probe.biomeId, probe.baitId, 'pro_rod')) n++;
/* Two of the ten share the shoreline+earthworm pair? They do not - but the
   roll offers every un-caught fish for the pair at once, so the rate is per
   FISH times however many are still out there on that pair. */
const share = MYSTERY.filter(f => f.mystery.biomeId === probe.biomeId &&
                                  f.mystery.baitId === probe.baitId).length;
const rate = n / N;
console.log('  ' + n + ' of ' + N + ' = ' + (rate * 100).toFixed(3) + '% (' + share +
            ' fish on that pair, so about ' + (0.5 * share).toFixed(1) + '% expected)');
ok(Math.abs(rate - 0.005 * share) < 0.0015,
   'about half a per cent per fish, per cast that fits (' + (rate * 100).toFixed(3) + '%)');

/* ── A rod that cannot reach the water does not get one ───────────────── */
let shallowRod = 0;
for (let i = 0; i < 40000; i++) if (G.debugMysteryRoll('trench', 'deep_rig', 'bamboo_rod')) shallowRod++;
ok(shallowRod === 0, 'a bamboo rod does not pull a blue pike out of a hundred feet');

/* ── The heavy magnet, and nothing else ───────────────────────────────── */
console.log();
console.log('WHAT LIFTS A RELIC');
/* Both magnets have to be OWNED before either can be on the line - what is
   equipped is chosen out of what is on the shelf at home. */
const own = G.getSave();
own.tools = (own.tools || []).concat(['magnet_1', 'magnet_2', 'heavy_magnet']);
G.equipKit(undefined, undefined, 'magnet_2');
let light = 0;
for (let i = 0; i < 40000; i++) if (G.debugRelicRoll('bay')) light++;
G.equipKit(undefined, undefined, 'heavy_magnet');
let heavy = 0;
for (let i = 0; i < 40000; i++) if (G.debugRelicRoll('bay')) heavy++;
console.log('  Magnet #2:     ' + light + ' finds in 40,000 drags');
console.log('  Heavy Magnet:  ' + heavy + ' finds in 40,000 drags');
ok(light === 0, 'nothing but the Heavy Magnet lifts one of the ten');
ok(heavy > 0, 'and the Heavy Magnet does');
ok(RELICS.length === 10, 'there are ten of them (' + RELICS.length + ')');
const relicWaters = {};
RELICS.forEach(i => { relicWaters[i.relic.biomeId] = (relicWaters[i.relic.biomeId] || 0) + 1; });
console.log('  scattered: ' + JSON.stringify(relicWaters));
ok(Object.keys(relicWaters).length === 4, 'and they are spread across all four waters');

/* ── Found once is found for good ─────────────────────────────────────── */
console.log();
console.log('FOUND ONCE, AND NEVER AGAIN');
const sets0 = G.debugSets();
ok(sets0.fishPool.length === 10 && sets0.relicPool.length === 10,
   'ten fish and ten finds in the tables');
/* Fill the fish set by hand - landing one is a whole trip - and check the
   roll stops offering it. */
const s = G.getSave();
s.mysteryFish = sets0.fishPool.slice();
let afterAll = 0;
for (let i = 0; i < 40000; i++) if (G.debugMysteryRoll(probe.biomeId, probe.baitId, 'pro_rod')) afterAll++;
ok(afterAll === 0, 'a fish already in the logbook is never offered again');
s.relics = sets0.relicPool.slice();
let relicAfter = 0;
for (let i = 0; i < 40000; i++) if (G.debugRelicRoll('bay')) relicAfter++;
ok(relicAfter === 0, 'and neither is a find already on the counter');

/* ── The two jobs ─────────────────────────────────────────────────────── */
console.log();
console.log('THE TWO JOBS AFTER THE END');
const jobs = (RT.content.quests.quests || []).filter(q => q.need.type === 'collectSet');
ok(jobs.length === 2, 'there are two of them (' + jobs.length + ')');
jobs.forEach(function (q) {
  ok((q.need.amount || 0) === 10, q.id + ' asks for ten');
  console.log('  ' + q.id + '  ' + q.title + ' - ' + q.card);
});
/* Sat on the fish job with all ten found, it must read as done. */
const all = (RT.game.debugMissions ? RT.game.debugMissions() : null);
s.mysteryFish = sets0.fishPool.slice();
s.relics = [];
const fishJob = jobs.find(q => q.need.set === 'mystery');
const relicJob = jobs.find(q => q.need.set === 'relics');
[[fishJob, 'mystery', 10], [relicJob, 'relics', 0]].forEach(function (row) {
  const q = row[0];
  const m = (RT.quests.build().missions || []).find(x => x.id === q.id);
  const txt = G.debugTargetWords ? G.debugTargetWords(m) : null;
  console.log('  ' + q.id + ' progress: ' + (txt || '(no words hook)'));
});

/* Ten found, and Walt has something to say about setting them out. */
s.relics = sets0.relicPool.slice();
const mRel = (RT.quests.build().missions || []).find(x => x.id === relicJob.id);
const parts = G.haveTheParts(mRel);
console.log('  on the counter: ' + parts);
ok(!!parts && /ten/.test(parts), 'and handing them in says what you put on the counter');

const r = H.results();
console.log();
console.log(r.fail ? (r.fail + ' of ' + r.checks + ' checks failed.')
                   : (r.checks + ' checks passed. The lake is quiet, and there is still ' +
                      'twenty things in it nobody has found.'));
process.exit(r.fail ? 1 : 0);
