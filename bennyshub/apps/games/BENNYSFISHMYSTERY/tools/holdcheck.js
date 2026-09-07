/**
 * How long is the hold, and does the card survive it?
 *
 *     node tools/holdcheck.js
 *
 * Pulling over is the one thing in this game done by holding a switch rather
 * than pressing it, so the two things that matter are how long you have to
 * hold and whether the thing you are holding FOR is still on the screen while
 * you do. It was five seconds - two to arm the offer, three to take it,
 * neither written down as five - and the card could vanish halfway through,
 * because the boat is still moving and the shoal it was offering falls out of
 * range while the meter fills.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });
const DT = 1 / 30;
const sv = G.getSave();
sv.briefed = 99; sv.currentMission = 16; sv.highestMission = 16; sv.money = 9999;
(RT.content.roster.rods || []).forEach(r => { if (!sv.rods.includes(r.id)) sv.rods.push(r.id); });
(RT.content.roster.baits || []).forEach(b => { if (!sv.baits.includes(b.id)) sv.baits.push(b.id); });
sv.vessels = ['canoe', 'kayak'];

let spots = null;
G.callbacks.onSpots = (z) => { spots = z; };

G.goToDock(); G.setOnFoot(false); G.castOff();
for (let i = 0; i < 60; i++) G.update(DT);

/* Out to a shoal and let the helper bring the boat alongside, which is when a
   player actually holds the switch - not the moment the card first appears
   with the fish still eighty yards up the lake. */
let called = null, side = null;
for (let t = 0; t < 30 * 400 && !called; t++) {
  G.update(DT);
  if (spots && spots.alongside && (spots.left || spots.right)) {
    side = spots.left ? 'left' : 'right';
    called = spots[side];
  }
}
ok(!!called, 'the game calls a shoal to pull over onto');
if (!called) { const r0 = H.results(); process.exit(1); }
console.log('called: ' + (called.fishName || 'fish') + ' on the ' + side);

/* Hold the helm that way, the way a player does, and time it - watching
   whether the card is on screen every single frame of the hold. */
/* THE HOLD, not the run-up. Once the meter fills the boat drives itself to
   the shoal and the player has let go - timing that as "holding" would report
   five seconds for a three second hold. */
let held = 0, gone = 0, stopped = false;
for (let t = 0; t < 30 * 20 && !stopped; t++) {
  G.setSteer(side === 'left' ? -1 : 1);
  G.update(DT);
  if (RT.game.state !== 'steer') { stopped = true; break; }

  held += DT;
  if (!(spots && spots[side])) gone++;
}
G.setSteer(0);

console.log('held the switch for ' + held.toFixed(1) + ' s before the boat committed');
console.log('frames with no card on that side during the hold: ' + gone);
ok(stopped, 'holding the helm pulls the boat over onto it');
/* And it arrives, rather than merely committing. */
for (let i = 0; i < 30 * 20 && !G.isFishing(); i++) G.update(DT);
ok(G.isFishing(), 'and the boat arrives and starts fishing');
ok(held <= 3.6, 'and it takes about three seconds, not five (' + held.toFixed(1) + ' s)');
ok(held >= 1.5, 'but not so fast that a lean stops the boat by accident');
ok(gone === 0, 'and the card stays on the screen for the whole hold (' +
   gone + ' frames without it)');

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. Hold to fish, and watch the thing you are holding for.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
