/**
 * How hard does the rod bend when nothing is on it?
 *
 *     node tools/bendcheck.js
 *
 * Reported: on some lures the rod bends a lot while you are waiting for a
 * fish, and it does not need to. It was the nibble.
 *
 * A fish thinking about a bait is told two ways, depending on the tackle: a
 * float goes under, and a lure with no float has nothing on the surface to
 * dip, so it is a knock on the rod tip instead. That knock was written as
 * 0.18 plus half a sine - a peak of 0.68, where a fish actually ON the line
 * holds the rod at 0.5. So a pike merely THINKING about a spoon hooped the
 * blank harder than one fighting on the end of it, again and again, for as
 * long as you sat there.
 *
 * The rule that cannot come back: a wait must never load the rod like a
 * fight. Both are forced here rather than fished for - a nibble is a die
 * roll, and a check that waits for one is a check that sometimes measures
 * nothing and calls it a pass.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

const DT = 1 / 30;
const sv = G.getSave();
sv.money += 3000;
['bamboo_rod', 'fiber_rod'].forEach(r => { if (!sv.rods.includes(r)) sv.rods.push(r); });
['earthworm', 'spoon'].forEach(b => { if (!sv.baits.includes(b)) sv.baits.push(b); });
sv.rod = 'fiber_rod'; sv.kitRodId = 'fiber_rod';
sv.currentMission = 12;
sv.briefed = 99;

/* The hardest bend the rig is asked for while a block of frames runs. */
function bendsWhile(frames, before) {
  const got = [];
  const real = RT.art.updateRodRig;
  RT.art.updateRodRig = function (rig, amount) { got.push(amount || 0); return real.apply(this, arguments); };
  if (before) before();
  for (let i = 0; i < frames; i++) G.update(DT);
  RT.art.updateRodRig = real;
  return got.length ? Math.max.apply(null, got) : -1;
}

/** A line in the water off the dock, waiting on a bite. */
function castOut(baitId) {
  sv.bait = baitId; sv.kitBaitId = baitId;
  G.goToDock();
  G.castOff();
  for (let i = 0; i < 60 * 20 && !G.isFishing(); i++) {
    G.update(DT);
    if (G.isSteering() && G.chooseTroll) G.chooseTroll();
  }
  G.startAim(); G.lockAim && G.lockAim(); G.beginCharge();
  for (let i = 0; i < 12; i++) G.update(DT);
  G.releaseCast();
  /* Down to the water and settled: WAITING is the state a nibble happens in. */
  for (let i = 0; i < 60 * 6 && G.run && G.run.state !== G.S.WAITING; i++) G.update(DT);
  return !!(G.run && G.run.state === G.S.WAITING);
}

console.log('THE BLANK, LOADED AND NOT');
console.log();

ok(castOut('spoon'), 'a lure with no float can be cast and left to soak');

/* RESTING. A line in the water with nothing happening barely loads the rod. */
const rest = bendsWhile(20);
console.log('  resting, line out        ' + rest.toFixed(3));
ok(rest >= 0 && rest < 0.12, 'a soaking line hardly bends the rod (' + rest.toFixed(2) + ')');

/* THE KNOCK. Forced, because a nibble is a die roll: run.teaseAt is what the
   game sets the instant a fish plucks at it, and counting it up from there is
   what draws the float's dip or the rod's knock. */
const knock = bendsWhile(30, () => { G.run.teaseAt = 0; });
console.log('  a nibble on the lure     ' + knock.toFixed(3));

/* A FISH ON. The same measurement, on the state the game puts you in when one
   takes it, so the two numbers are comparable rather than remembered. */
const onFish = bendsWhile(6, () => { G.run.state = G.S.HOOKING; G.run.timer = 0; });
console.log('  a fish actually on       ' + onFish.toFixed(3));
console.log();

ok(onFish >= 0.4, 'a fish on the line hoops the rod (' + onFish.toFixed(2) + ')');
ok(knock > rest + 0.02,
   'a nibble still knocks the tip, or there is no tell at all (' + knock.toFixed(2) + ')');
ok(knock < onFish * 0.5,
   'and a nibble is nowhere near a fight (' + knock.toFixed(2) + ' vs ' + onFish.toFixed(2) + ')');
ok(knock <= 0.25,
   'the knock stays a knock (' + knock.toFixed(2) + ', was 0.68 when this was reported)');

const res = H.results();
console.log(res.fail === 0
  ? res.checks + ' checks passed. A nibble is a knock, not a fight.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
