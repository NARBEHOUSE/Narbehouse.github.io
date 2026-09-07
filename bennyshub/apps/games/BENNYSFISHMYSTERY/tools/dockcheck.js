/**
 * Is the dock standing where it should be?
 *
 *     node tools/dockcheck.js
 *
 * Builds the real world through the real Scene and reads every piece of the
 * dock back: the shop, the sign, the crates, the jetty, the boat and the
 * camera. A thing on the bank has to stand ON the bank, not under it; a thing
 * in the water has to be over water deep enough for it; and the camera has to
 * be above the ground it is looking from. "Below the ground and messed up
 * looking" is exactly the failure this catches without opening a browser.
 */
const H = require('./playtest.js');
const { G, ok } = H;
G.resetProgress();
G.init({ scene: new H.THREE.Scene(), camera: new H.THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {}, setPixelRatio() {}, getContext: () => null } });
G.goToDock();
for (let i = 0; i < 120; i++) G.update(1 / 60);       // let the camera settle
const rows = H.RT.scene.dockLayout();
console.log('THE DOCK');
console.log('name'.padEnd(10), 'x'.padStart(7), 'y'.padStart(7), 'z'.padStart(7), 'ground'.padStart(7), 'water'.padStart(6), 'ft'.padStart(5));
rows.forEach(r => console.log(r.name.padEnd(10), r.x.toFixed(1).padStart(7), r.y.toFixed(2).padStart(7), r.z.toFixed(1).padStart(7),
                              r.ground.toFixed(2).padStart(7), String(r.inWater).padStart(6), r.depthFt.toFixed(1).padStart(5)));
console.log();
ok(rows.length >= 10, 'the dock has its pieces (' + rows.length + ')');
const ashore = rows.filter(r => !r.inWater && r.name !== 'camera' && r.name !== 'boat');
ok(ashore.length >= 6, 'most of the dock stands on the bank (' + ashore.length + ' pieces ashore)');
ashore.forEach(r => ok(r.y >= r.ground - 0.05, r.name + ' is on the ground, not under it (y ' + r.y.toFixed(2) + ' vs ground ' + r.ground.toFixed(2) + ')'));
ashore.forEach(r => ok(r.y <= r.ground + 1.5, r.name + ' is not floating above the bank (y ' + r.y.toFixed(2) + ' vs ground ' + r.ground.toFixed(2) + ')'));
const boat = rows.find(r => r.name === 'boat');
ok(boat && boat.inWater && boat.depthFt >= 1.0, 'the boat is tied up in water (' + (boat ? boat.depthFt.toFixed(1) + ' ft' : 'no boat') + ')');
const cam = rows.find(r => r.name === 'camera');
ok(cam && cam.y > cam.ground + 1.5, 'the camera stands above the ground (' + (cam ? cam.y.toFixed(1) + ' over ' + cam.ground.toFixed(1) : '') + ')');
const shop = rows.find(r => /shop/i.test(r.name));
ok(!shop || (!shop.inWater && shop.y >= shop.ground - 0.05), 'the tackle shop is ashore and on the ground');
/* ── Fishing off the boards ───────────────────────────────────────────────
   Where you stand, which way you look, and where the game asks you to put the
   cast. All three were wrong together: you stood beside the jetty rather than
   on it, so the dock lay across the left of the screen, and the target square
   sat off to one side of the boards instead of out past the end of them. */

console.log();
console.log('FISHING OFF THE BOARDS');
console.log();

const chart = H.G.mapState().chart;
const dock = chart.dock;
function waterlineAt(x) {
  let z = dock.z - 90;
  for (let i = 0; i < 260; i++) { if (!chart.inWater(x, z + 1)) break; z += 1; }
  return z;
}
const shore = waterlineAt(dock.x);

/* Hear Walt out first - nothing leaves the dock unbriefed, and the net he
   hands over in that conversation is what the first trip is fished with. */
if (!G.isBriefed()) { G.enterShop(); G.takeCounterBeat(); G.goToDock(); }
G.setOnFoot(true);
G.castOff();
for (let i = 0; i < 30; i++) G.update(1 / 30);
const where = H.G.mapState();
console.log('you stand at x', where.x.toFixed(1), 'z', where.z.toFixed(1),
            ' | the waterline is at z', shore.toFixed(1),
            ' | the boards end at z', (shore - 22).toFixed(1));

ok(Math.abs(where.x - dock.x) < 1.2,
   'you stand ON the boards, not off the side of them (x ' + where.x.toFixed(1) + ')');
ok(where.z < shore && where.z > shore - 22,
   'and you stand out along them, over water, with decking still in front of you');
const ahead = (where.z - (shore - 22));
/* WHERE YOU STAND DEPENDS ON WHAT IS IN YOUR HANDS. A rod stands at 19 with
   three units of boards in front - its cast goes seventeen past the end. A
   net reaches under three units, so with a net you stand on the LAST plank
   (DOCK_STAND_NET) and the dip lands in open water past the end; from the
   rod's stand it came down through the decking. Reported twice. */
const netInHand = !!(G.missionBrief().rod || {}).isNet;
ok(netInHand ? (ahead > 0 && ahead <= 1) : (ahead > 2 && ahead < 12),
   (netInHand ? 'with the net you stand on the last plank, ' : 'the dock runs ') +
   ahead.toFixed(1) + ' units of decking in front of you');

/* The target square. It has to be out past the end of the jetty - a square
   drawn over the planks is not somewhere anybody can cast - and it has to be
   inside what the rod in your hands can actually throw. */
const mark = H.RT.scene.dockTargets.find(t => t && t.water);
ok(!!mark, 'there is a square of water to cast into');
const outFromYou = Math.hypot(mark.pos.x - where.x, mark.pos.z - where.z);
const pastEnd = (shore - 22) - mark.pos.z;
const rod = G.equippedRod();
console.log('the cast zone is', outFromYou.toFixed(1), 'units out (' +
            (outFromYou / 0.61).toFixed(0) + ' ft),', pastEnd.toFixed(1),
            'past the end of the boards; the ' + rod.name + ' throws ' + rod.castFt + ' ft');
/* STRAIGHT DOWN THE BOARDS. You stand on the centreline looking out along
   the jetty, so the square is dead ahead - the same way the camera points and
   the same way the aim swings. */
ok(Math.abs(mark.pos.x - where.x) < 2.5,
   'the cast zone is straight out in front, not off to one side (' +
   Math.abs(mark.pos.x - where.x).toFixed(1) + ' across)');
ok(outFromYou / 0.61 <= rod.castFt + 2,
   'the zone is inside what the gear in your hands can throw (' +
   (outFromYou / 0.61).toFixed(0) + ' ft, and the ' + rod.name + ' throws ' + rod.castFt + ')');
ok(chart.depthAt(mark.pos.x, mark.pos.z) > 1, 'there is water under it');
if (rod.isNet) {
  /* A net scoops off the boards. The square belongs at the rail, not out at
     the end of a cast nobody with a net can make. */
  ok(outFromYou < 5, 'with the net in hand the zone is at the rail (' +
                     outFromYou.toFixed(1) + ' units)');
}
/* NEAR THE END, BUT ON IT. Far enough out that a fish is lifted clear of the
   planks, with decking still underfoot rather than standing in the water. */
const ahead2 = where.z - (shore - 22);
ok(netInHand ? (ahead2 > 0 && ahead2 <= 1) : (ahead2 > 1 && ahead2 < 8),
   'you stand near the end of the boards with ' + ahead2.toFixed(1) +
   ' units of decking still in front of you' + (netInHand ? ' (net: the last plank)' : ''));

/* And with a rod in hand it goes out to the shoal. */
G.getSave().rods.push('bamboo_rod');
G.equipKit('bamboo_rod');
G.returnToDock();
G.setOnFoot(true);
G.castOff();
for (let i = 0; i < 30; i++) G.update(1 / 30);
const mark2 = H.RT.scene.dockTargets.find(t => t && t.water);
const rod2 = G.equippedRod();
const out2 = Math.hypot(mark2.pos.x - G.run.x, mark2.pos.z - G.run.z);
const past2 = (shore - 22) - mark2.pos.z;
console.log('with the ' + rod2.name + ' (' + rod2.castFt + ' ft): the zone is ' +
            out2.toFixed(1) + ' units out (' + (out2 / 0.61).toFixed(0) + ' ft), ' +
            past2.toFixed(1) + ' past the end of the boards');
ok(!rod2.isNet, 'the bamboo rod is the thing in your hands now');
ok(past2 > 4, 'with a rod, the cast zone is out past the end of the boards (' +
              past2.toFixed(1) + ' units past)');
ok(chart.depthAt(mark2.pos.x, mark2.pos.z) > 1, 'and over real water');
ok(out2 / 0.61 <= rod2.castFt + 2, 'and still inside what that rod can throw');

/* And the fish are where the marker says, rather than off to one side of it.
   The run's own spot is the shoal the game has committed to fishing. */
const spot = G.run && G.run.current;
if (spot && !spot.open) {
  const off = Math.hypot(spot.x - mark2.pos.x, spot.z - mark2.pos.z);
  console.log('the shoal is', off.toFixed(1), 'units from the middle of the cast zone');
  ok(off < 10, 'the fish are where the cast lands (' + off.toFixed(1) + ' units apart)');
}


/* WHERE THE FISH COMES UP. A hooked fish is landed at the rail - and off a
   dock the rail is the end of the rod, which reaches out past the last plank.
   Landed at the boat's own rail figure it broke the surface over solid
   decking and rose straight through the boards, which is what a player
   reported seeing. The point it is lifted from has to be past the end of the
   jetty and in real water. */
const landAt = H.RT.scene.landingPoint && H.RT.scene.landingPoint();
if (landAt) {
  const past = (shore - 22) - landAt.z;
  const fromYou = Math.hypot(landAt.x - G.run.x, landAt.z - G.run.z);
  console.log('a fish is landed at x', landAt.x.toFixed(1), 'z', landAt.z.toFixed(1), '-',
              past.toFixed(1), 'past the last plank,', fromYou.toFixed(1),
              'from where you stand');
  /* Landed at the boat's own rail figure it broke the surface over solid
     decking and rose straight through the boards, which is what a player
     reported seeing. */
  ok(past > 1.5, 'a landed fish comes up past the end of the boards, not through them');
  ok(chart.depthAt(landAt.x, landAt.z) > 1, 'and it comes up out of water');
  ok(fromYou < 9, 'and near enough to see (' + fromYou.toFixed(1) + ' units)');
}

/* ── THE GREEN LIGHT ──────────────────────────────────────────────────────
   Standing on the boards, told there are fish out front, and the aimer never
   goes green: that is the game lying about the fish as far as a player is
   concerned. It goes green when the predicted landing lands on a shoal, so
   sweep the arc at every power and see whether any cast at all finds one. */
G.goToDock();
G.setOnFoot(true);
G.castOff();
for (let i = 0; i < 60; i++) G.update(1 / 60);

let greens = 0, tried = 0, named = {};
let sawAim = null;
G.callbacks.onAim = function (d) { sawAim = d; };
const ARC = 0.9;                       // the arc the aimer sweeps, in radians
for (let a = -ARC; a <= ARC; a += ARC / 12) {
  for (let pw = 20; pw <= 100; pw += 10) {
    tried++;
    /* Ask it the way the interface does: set the aim and the power, let a
       frame go by, and read what the aimer told the screen. */
    G.startAim && G.startAim();
    G.run.aim = a; G.run.power = pw;
    G.update(1 / 60);
    if (sawAim && sawAim.onShoal) { greens++; if (sawAim.shoalName) named[sawAim.shoalName] = 1; }
  }
}
console.log();
console.log('off the dock:', greens, 'of', tried, 'aim-and-power combinations land on a shoal');
console.log('and what is out there:', Object.keys(named).join(', ') || '(nothing)');
ok(greens > 0, 'the aimer can go green off the dock (' + greens + '/' + tried + ')');

const res = H.results();
console.log();
console.log(res.fail === 0 ? res.checks + ' checks passed. The dock stands where it should.' : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
