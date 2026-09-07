/**
 * How far away is the game allowed to be helpful?
 *
 *     node tools/rangecheck.js
 *
 * The game used to call a shoal, draw its card and offer the pull-over from
 * two hundred and thirty-five yards, and taking the offer drove the boat the
 * whole way there. Two hundred yards is not a fishing spot, it is a bus ride
 * - and to a player who cannot see the lake, "channel catfish to your right,
 * 184 yards" is an instruction to fish where there is nothing.
 *
 * So there are two ranges and they are different on purpose: you are TOLD
 * about a shoal a little before you can take it, and the arrow - which holds
 * one spot until it is fished - is what gets you to the far ones.
 *
 * This pins all of that down: the numbers themselves, that a pull-over
 * outside the offer gives open water rather than a long drive, that the arrow
 * holds one target instead of swinging between them, and that it lets go when
 * you are already on water that will do the job.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

const sv = G.getSave();
sv.briefed = 99; sv.currentMission = 12; sv.money += 3000;
(RT.content.roster.rods || []).forEach(r => { if (!sv.rods.includes(r.id)) sv.rods.push(r.id); });
(RT.content.roster.vessels || []).forEach(v => { if (!sv.vessels.includes(v.id)) sv.vessels.push(v.id); });
(RT.content.roster.baits || []).forEach(b => { if (!sv.baits.includes(b.id)) sv.baits.push(b.id); });
G.goToDock(); G.setOnFoot(false); G.castOff();
for (let i = 0; i < 60; i++) G.update(1 / 30);

const FT = 0.61;
const offer = G.spotOffer();
console.log('THE TWO RANGES');
console.log('  offered  ' + offer.toFixed(0) + ' units = ' +
            Math.round(offer / FT / 3) + ' yards');
ok(offer / FT / 3 <= 55, 'a spot is only offered when you are near it (' +
   Math.round(offer / FT / 3) + ' yards)');
ok(offer / FT / 3 >= 25, 'but near enough to be reachable, not on top of you');

/* ── THE CALL COMES FIRST, AND NOT LONG FIRST ─────────────────────────── */
let called = null;
G.callbacks.onCue = (c) => { if (c) called = c; };

/* ── A PULL-OVER OUTSIDE THE OFFER IS OPEN WATER, NOT A DRIVE ─────────── */
const jf = G.jobFish && G.jobFish();
ok(!!jf, 'the job has a shoal to point at');
if (jf) {
  const far = Math.hypot(jf.x - G.run.x, jf.z - G.run.z);
  console.log();
  console.log('the job\'s fish are ' + Math.round(far / FT / 3) + ' yards off');
  const t = G.__spotToEnter && G.__spotToEnter('right');
  if (far > offer) {
    ok(!t || t.open || Math.hypot(t.x - G.run.x, t.z - G.run.z) <= offer,
       'pulling over from out here stops where you are, it does not drive you there');
  }
}

/* ── THE ARROW HOLDS ONE SPOT ─────────────────────────────────────────── */
const keys = [];
for (let t = 0; t < 900; t++) {
  const g = G.jobFish && G.jobFish();
  if (g) {
    const want = G.clearHeading ? G.clearHeading(g.x, g.z)
                                : Math.atan2(g.x - G.run.x, -(g.z - G.run.z));
    let d = want - G.run.head;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    G.setSteer(Math.abs(d) < 0.05 ? 0 : (d > 0 ? 1 : -1));
  }
  G.update(1 / 30);
  if (t % 30 === 0) {
    const h = G.helperTarget && G.helperTarget();
    keys.push(h ? h.key : null);
  }
}
G.setSteer(0);
const named = keys.filter(k => k);
const changes = named.filter((k, i) => i > 0 && k !== named[i - 1]).length;
console.log();
console.log('over half a minute of steering the helper pointed at:',
            JSON.stringify([...new Set(named)].slice(0, 6)));
ok(changes <= 1, 'the arrow holds one spot rather than swinging between them (' +
   changes + ' changes)');

/* ── AND LETS GO WHEN YOU ARE ON WATER THAT WILL DO ───────────────────── */
const g2 = G.jobFish && G.jobFish();
if (g2) {
  for (let t = 0; t < 4000 && Math.hypot(g2.x - G.run.x, g2.z - G.run.z) > offer * 0.9; t++) {
    const want = G.clearHeading(g2.x, g2.z);
    let d = want - G.run.head;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    G.setSteer(Math.abs(d) < 0.05 ? 0 : (d > 0 ? 1 : -1));
    G.update(1 / 30);
  }
  G.setSteer(0);
  let side = null;
  for (const sd of ['right', 'left']) {
    const t2 = G.__spotToEnter && G.__spotToEnter(sd);
    if (t2 && !t2.open) { side = sd; break; }
  }
  ok(!!side, 'closing to the offer range puts the shoal within reach of a pull-over');
  if (side) {
    G.pullOverTo(side);
    for (let i = 0; i < 900 && !G.isFishing(); i++) G.update(1 / 30);
    ok(G.isFishing(), 'and the boat stops on it');
    const on = G.run.current;
    const sh = on && on.shoals && on.shoals[0];
    console.log();
    console.log('stopped on:', sh ? sh.fishName : '(open water)',
                '| the job wants:', (G.currentMission().target || {}).speciesId);
    const h = G.helperTarget && G.helperTarget();
    if (sh && sh.isTarget) {
      ok(!h, 'and the arrow lets go, because you are on water that will do the job');
    }
  }
}

/* ── THE ARROW ITSELF ─────────────────────────────────────────────────────
   "It vanishes and it points all over the place" is not visible in a
   screenshot, so it is counted: every frame of a run out to the job, is the
   badge up, what is it pointing at, and does it say anything out loud. */
G.resetProgress();
const sv2 = G.getSave();
sv2.briefed = 99; sv2.currentMission = 12; sv2.money += 3000;
(RT.content.roster.rods || []).forEach(r => { if (!sv2.rods.includes(r.id)) sv2.rods.push(r.id); });
(RT.content.roster.vessels || []).forEach(v => { if (!sv2.vessels.includes(v.id)) sv2.vessels.push(v.id); });
(RT.content.roster.baits || []).forEach(b => { if (!sv2.baits.includes(b.id)) sv2.baits.push(b.id); });
G.goToDock(); G.setOnFoot(false); G.castOff();
for (let i = 0; i < 60; i++) G.update(1 / 30);

let up = 0, down = 0, downWhileFar = 0, spokeFar = 0, spokeNear = 0;
let worstYards = 0, badYards = 0;
let guide = null;
G.callbacks.onGuide = (g) => { guide = g; };
G.callbacks.onSpeak = (t) => {
  if (!/off to your|behind you/.test(String(t))) return;
  const g0 = G.jobFish && G.jobFish();
  const d = g0 ? Math.hypot(g0.x - G.run.x, g0.z - G.run.z) : 0;
  if (d > G.spotOffer() * 1.6) spokeFar++; else spokeNear++;
};

for (let t = 0; t < 2400; t++) {
  const g0 = G.jobFish && G.jobFish();
  if (g0) {
    const want = G.clearHeading(g0.x, g0.z);
    let d = want - G.run.head;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    G.setSteer(Math.abs(d) < 0.05 ? 0 : (d > 0 ? 1 : -1));
  }
  guide = null;
  G.update(1 / 30);
  const far = g0 ? Math.hypot(g0.x - G.run.x, g0.z - G.run.z) : 0;
  if (guide) {
    up++;
    /* Yards, checked against the distance it came from: a unit is 0.61 feet,
       so a yard is 1.83 units. This read a unit as a foot for the whole life
       of the game and reported every range short by two thirds. */
    const should = Math.round(guide.dist / (0.61 * 3));
    if (Math.abs((guide.yards || 0) - should) > 1) badYards++;
    worstYards = Math.max(worstYards, guide.yards || 0);
  } else if (G.run.state === 'steer') {
    down++;
    if (far > G.spotOffer() * 1.2) downWhileFar++;
  }
  if (far < G.spotOffer()) break;
}
G.setSteer(0);

console.log();
console.log('steering out to the job: the badge was up ' + up + ' frames, down ' + down +
            ' (' + downWhileFar + ' of those with the spot still far off)');
console.log('the furthest it ever printed: ' + worstYards + ' yards');
ok(up > 0, 'the arrow is on the screen while you steer for the job');
ok(downWhileFar === 0,
   'and it does not blink out while the spot is still away (' + downWhileFar + ' frames)');
ok(badYards === 0, 'the yards it prints are yards (' + badYards + ' frames wrong)');
console.log('it spoke ' + spokeFar + ' times with the spot far off, ' +
            spokeNear + ' times near it');
ok(spokeFar === 0, 'and it says nothing out loud until you are near enough to fish it');

/* ── THE METER, THE VOICE AND THE SLOWDOWN AGREE ──────────────────────────
   Stopped on a shoal and aiming at it: the meter must go green, because that
   is the cast being asked for. */
{
  const place = G.jobFish && G.jobFish();
  let stopped = false;
  if (place) {
    /* Onto the shoal, from the side it is actually on: a boat only pulls over
       onto what is beside it, so stopping blind on 'right' lands on whatever
       happened to be there. */
    for (const side of ['right', 'left']) {
      if (G.isFishing() && G.chooseTroll) {
        G.chooseTroll();
        for (let i = 0; i < 30; i++) G.update(1 / 30);
      }
      G.run.x = place.x - (side === 'right' ? 26 : -26);
      G.run.z = place.z - 26;
      G.run.head = Math.atan2(place.x - G.run.x, -(place.z - G.run.z));
      for (let i = 0; i < 40; i++) G.update(1 / 30);
      G.pullOverTo(side);
      for (let i = 0; i < 600 && !G.isFishing(); i++) G.update(1 / 30);
      if (G.isFishing()) { stopped = true; break; }
    }
  }
  if (stopped && G.run.current && !G.run.current.open) {
    let seenAim = null, seenCharge = null, spoke = [];
    G.callbacks.onAim = (c) => { if (c) seenAim = c; };
    G.callbacks.onCharge = (c) => { if (c) seenCharge = c; };
    G.callbacks.onSpeak = (t) => { if (/let go/i.test(String(t))) spoke.push(String(t)); };

    /* THE METER, not the aimer. The aimer predicts a FULL cast - and the boat
       stops a cast short of the shoal on purpose, so at full power the throw
       sails over it. What the colour is painted from is the meter, which
       predicts the throw at the power actually wound on. Aim across the beam,
       where the rod points, and wind the power up through its range. */
    G.startAim();
    G.update(1 / 30);
    const centre = (seenAim && seenAim.centre) || Math.PI / 2;
    G.beginCharge();
    let found = null;
    for (let a = centre - 0.9; a <= centre + 0.9 && !found; a += 0.04) {
      for (let pw = 10; pw <= 100 && !found; pw += 2) {
        G.run.aim = a;
        G.run.power = pw;
        seenCharge = null;
        G.update(1 / 30);
        if (seenCharge && seenCharge.onSpot) found = { a, pw, charge: seenCharge };
      }
    }
    console.log();
    if (found) {
      console.log('aiming at the spot under the boat, the meter reports:',
                  JSON.stringify({ onShoal: found.charge.onShoal, onSpot: found.charge.onSpot,
                                   isTarget: found.charge.isTarget }));
      ok(found.charge.onShoal,
         'the meter knows the throw is landing on a shoal');
      ok(found.charge.onSpot,
         'and that it is the shoal you stopped for - which is what turns it green');
      console.log('and it said:', JSON.stringify(spoke.slice(-1)));
      ok(!spoke.length || /your fish|the spot|salvage/i.test(spoke[spoke.length - 1]),
         'and the voice calls it yours, like the colour does');
    } else {
      console.log('the boat is stopped on', G.run.current ? G.run.current.key : '(nothing)',
                  '| the aimer last reported', JSON.stringify(seenAim));
      ok(false, 'a cast can be aimed at the spot the boat stopped on');
    }
  }
}

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. The game is helpful about the water you are in.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
