/**
 * Can a boat get past the log jam, and only where it should?
 *
 *     node tools/jamcheck.js
 *
 * The jam runs bank to bank across the narrows with one channel through it.
 * That is a wall in a game played with two switches, so it has to be exactly
 * as true as it looks and it must never trap anybody:
 *
 *   THE TIMBER STOPS A HULL. Drive at the logs anywhere along their length
 *   and the boat does not come out the other side.
 *
 *   THE CHANNEL LETS ONE THROUGH. Drive at the gap and it does, from either
 *   side, in every boat that can reach the jam at all.
 *
 *   THE HELM FINDS IT. Nobody should have to hunt for the way through: the
 *   engine's own steering, which the quest helper and the harness both use,
 *   takes a boat from one side to a spot on the other.
 *
 *   AND NOBODY IS EVER STUCK IN IT. A hull that somehow ends up inside the
 *   pile can always drive out - a boat that cannot move in any direction is
 *   the one failure this game must not have.
 *
 * Last, the chart has to agree with the water: the map draws its timber from
 * the same barrier the hull is stopped by, so the gap on the picture is the
 * gap you can steer through.
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
sv.money += 9000;
['bamboo_rod', 'fiber_rod', 'carbon_rod', 'pro_rod'].forEach(r => { if (!sv.rods.includes(r)) sv.rods.push(r); });
['canoe', 'kayak', 'motorboat'].forEach(v => { if (!sv.vessels.includes(v)) sv.vessels.push(v); });
/* HANDS OFF THE TILLER. The quest helper steers to the job by itself - which
   is the right behaviour and the wrong thing to have running while measuring
   what stops a hull: every run ended up at the trench because the helper took
   it there, whichever way this test pointed the bow. */
sv.helper = false;
sv.currentMission = 26;
sv.highestMission = 26;
sv.briefed = 99;

/* The chart the boat actually drives on - the same one the map opens. */
const L = (G.mapState() || {}).chart || null;
const bars = (L && L.barriers) || [];
ok(bars.length === 1, 'the lake has a log jam in it (' + bars.length + ')');
const b = bars[0] || null;
if (!b) {
  const res0 = H.results();
  console.log(res0.fail + ' of ' + res0.checks + ' checks failed.');
  process.exit(1);
}
console.log('the jam runs x ' + Math.round(b.fromX) + ' to ' + Math.round(b.toX) +
            ' at z ' + b.z + ', channel at x ' + Math.round(b.gapX) +
            ' ± ' + b.gapHalf);
console.log();

/* It has to reach land at both ends, or it is a fence in the middle of a
   lake with water round the outside of it. */
ok(!L.inWater(b.fromX - 8, b.z) && !L.inWater(b.toX + 8, b.z),
   'it reaches the bank at both ends');
ok(b.gapX - b.gapHalf > b.fromX + 40 && b.gapX + b.gapHalf < b.toX - 40,
   'the channel is out in the water, not against a bank');

/**
 * Put a boat in the water pointing north at some x, and drive it straight at
 * the jam. Returns how far north it got.
 */
function driveAt(x, vessel, fromSouth) {
  sv.vessel = vessel;
  G.goToDock();
  G.castOff();
  const r = G.run;
  if (!r) return null;
  const side = fromSouth ? 1 : -1;
  /* Off the dock first, and under way, before being put where the test wants
     it: castOff leaves the mooring on its own for a second or two, and a boat
     moved mid-manoeuvre finishes the manoeuvre from the new place. */
  for (let f = 0; f < 30 * 10 && !G.isSteering(); f++) G.update(DT);
  r.x = x;
  r.z = b.z + side * 150;
  /* nz = z - cos(head): head 0 drives NORTH, up the lake. */
  r.head = fromSouth ? 0 : Math.PI;
  r.yaw = 0;
  r.grounded = false;
  /* Straight at it, no helm, for as long as it would take to cover the
     three hundred units if nothing were in the way. */
  for (let f = 0; f < 30 * 90; f++) {
    G.setSteer(0);
    G.update(DT);
    if (!G.isSteering()) break;             // pulled over on something
    if (side * (G.run.z - b.z) < -60) break;   // well through
  }
  const got = G.run ? G.run.z : r.z;
  G.returnToDock();
  return { z: got, through: side * (got - b.z) < -b.half };
}

console.log('DRIVEN STRAIGHT AT IT, from the south:');
[[b.fromX + 60, false], [b.gapX - b.gapHalf - 60, false], [b.gapX, true],
 [b.gapX + b.gapHalf + 60, false], [b.toX - 60, false]].forEach(function (pair) {
  const x = pair[0], want = pair[1];
  const d = driveAt(x, 'motorboat', true);
  console.log('  x=' + String(Math.round(x)).padStart(5) + '  ended z=' +
              String(Math.round(d.z)).padStart(6) + '  ' +
              (d.through ? 'THROUGH' : 'stopped') +
              (d.through === want ? '' : '   <- wrong'));
  ok(d.through === want, (want ? 'the channel lets a boat through at x=' : 'the timber stops a boat at x=') +
     Math.round(x));
});

console.log();
console.log('AND FROM THE NORTH SIDE:');
[[b.gapX, true], [b.fromX + 60, false]].forEach(function (pair) {
  const d = driveAt(pair[0], 'motorboat', false);
  console.log('  x=' + String(Math.round(pair[0])).padStart(5) + '  ended z=' +
              String(Math.round(d.z)).padStart(6) + '  ' + (d.through ? 'THROUGH' : 'stopped'));
  ok(d.through === pair[1], 'coming back the other way behaves the same at x=' +
     Math.round(pair[0]));
});

/* EVERY BOAT THAT CAN GET THERE FITS THROUGH. A channel a kayak can use and
   a motorboat cannot is a channel nobody can trust. */
console.log();
['kayak', 'motorboat'].forEach(function (v) {
  const d = driveAt(b.gapX, v, true);
  console.log('  the ' + v + ' through the channel: ' + (d.through ? 'yes' : 'NO'));
  ok(d.through, 'the ' + v + ' fits through the channel');
});

/* THE HELM FINDS IT. clearHeading is what the quest helper steers by; a boat
   handed a spot on the far side has to arrive at it without being driven. */
console.log();
sv.vessel = 'motorboat';
G.goToDock();
G.castOff();
(function () {
  const r = G.run;
  r.x = -260; r.z = b.z + 260; r.head = Math.PI;       // well to one side of the gap
  const to = { x: -249, z: -1140 };                    // dead behind the timber
  let got = false, frames = 0;
  for (let f = 0; f < 30 * 240 && !got; f++) {
    frames = f;
    const want = G.clearHeading(to.x, to.z);
    let d = want - G.run.head;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    G.setSteer(Math.abs(d) < 0.05 ? 0 : (d > 0 ? 1 : -1));
    G.update(DT);
    if (!G.isSteering() && G.chooseTroll) G.chooseTroll();
    if (Math.hypot(G.run.x - to.x, G.run.z - to.z) < 60) got = true;
  }
  console.log('  steering itself to a spot behind the jam: ' +
              (got ? 'arrived after ' + (frames / 30).toFixed(0) + ' s' : 'NEVER ARRIVED') +
              '  (ended ' + Math.round(G.run.x) + ', ' + Math.round(G.run.z) + ')');
  ok(got, 'the helm takes a boat through the channel to a spot behind the jam');
})();
G.returnToDock();

/* AND NOBODY IS STUCK IN IT. */
console.log();
sv.vessel = 'motorboat';
G.goToDock();
G.castOff();
(function () {
  const r = G.run;
  r.x = b.fromX + 120; r.z = b.z; r.head = Math.PI; r.yaw = 0;   // inside the timber
  const x0 = r.x, z0 = r.z;
  for (let f = 0; f < 30 * 30; f++) { G.setSteer(0); G.update(DT); if (!G.isSteering()) break; }
  const moved = Math.hypot(G.run.x - x0, G.run.z - z0);
  console.log('  a boat set down inside the pile moved ' + Math.round(moved) + ' units');
  ok(moved > 30, 'a boat inside the timber can always drive out (' + Math.round(moved) + ')');
})();
G.returnToDock();

/* THE CHART AGREES WITH THE WATER. The minimap and the folded map both draw
   their timber from chart.barriers, which is the same object the hull is
   stopped by - so this checks the drawing code reads it rather than holding
   a copy of the numbers. */
const fs = require('fs');
const path = require('path');
const mapSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'minimap.js'), 'utf8');
const reads = (mapSrc.match(/barriers \|\| \[\]/g) || []).length;
console.log();
console.log('  the map reads chart.barriers in ' + reads + ' places (corner, and folded)');
ok(reads >= 2, 'both charts draw the jam from the barrier the boat is stopped by');
ok(/gapX \+ b\.gapHalf/.test(mapSrc) && /gapX - b\.gapHalf/.test(mapSrc),
   'and both leave the channel open on the picture');

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. There is one way through, and it is on the chart.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
