/**
 * Does the game tell the truth about where the fish are?
 *
 *     node tools/cuecheck.js
 *
 * A player steering by ear has nothing but the spoken call: "Sunfish on the
 * left". If that names a different fish from the card on screen, or claims a
 * side the fish is not on any more, then the one instrument they have is
 * lying to them - and both were happening.
 *
 * The card is the ground truth here, because it is worked out fresh every
 * frame from where the boat is pointing right now. So this drives a long
 * trip, steering the way a player does, and records two streams: every line
 * the game says, and every frame of the card. Then it asks:
 *
 *   - when a fish is called on a side, does the card agree about WHICH FISH?
 *   - when it is called on a side, does the card agree about WHICH SIDE?
 *   - and if the boat turns afterwards, how long is a stale side left standing
 *     before the game corrects itself out loud?
 *
 * The last one can never be zero - a call is true when it is made and the boat
 * keeps turning - but it must be seconds, not the rest of the trip.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

/* ONE TRIP, SAILED THE SAME WAY EVERY TIME. The steering below turns on a
   coin, and an unseeded coin means this check sails somewhere new every run
   and reaches a different verdict - which reads as a change in the game when
   it is nothing but a change in the weather. Seeded, a failure is a place a
   person can go back to. Pass a seed to sail a different trip on purpose. */
const SEED = Number(process.env.CUE_SEED || 20260905);
Math.random = RT.util.mulberry32(SEED);
console.log('trip seed ' + SEED);

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

/* A boat, a rod, and a job that is not the net one - the net does not troll. */
const sv = G.getSave();
sv.money += 900;
['bamboo_rod', 'fiber_rod'].forEach(r => { if (!sv.rods.includes(r)) sv.rods.push(r); });
if (!sv.baits.includes('earthworm')) sv.baits.push('earthworm');
['canoe', 'kayak'].forEach(v => { if (!sv.vessels.includes(v)) sv.vessels.push(v); });
sv.vessel = 'kayak';
sv.currentMission = 16;
sv.briefed = 99;
G.goToDock();

/* Everything the game says, and everything it shows, with a clock on both. */
const said = [];
let card = { left: null, right: null };
let t = 0;
G.callbacks.onSpeak = (text) => said.push({ t: t, text: String(text || '') });
G.callbacks.onSpots = (z) => { card = { left: z.left, right: z.right }; };

const SIDE_RE = /^(.+?) (?:on the|on your) (left|right)\b/i;

G.castOff();
const DT = 1 / 30;
const seen = [];          // one entry per spoken side-call
const noCard = { worst: 0 };
let lastCall = null;
let heldSince = 0, dir = 1;

/* A LONGER TROLL THAN IT USED TO NEED. The game called shoals from two
   hundred and thirty-five yards once, so a two-and-a-half-minute run swept
   a corridor a quarter of a mile wide and met plenty. Calls are a proximity
   now - forty-eight yards - and the corridor is five times narrower, so the
   boat has to cover five times the water to meet the same number of fish.
   Simulated, so it costs seconds of CPU; lowering the bar instead would
   have quietly retired the check. */
for (let f = 0; f < 30 * 750; f++) {
  t += DT;
  /* Steer like a player: long, lazy leans one way and then the other, with
     stretches of running straight in between. Anything that turns the boat is
     enough to make a call that was true go stale. */
  /* SHORT LEANS. Holding the helm over for four and a half seconds used to be
     steering; a pull-over takes three now, so that same lean stops the boat
     for a fish every time and the trip meets two shoals instead of a dozen. A
     player who wants to go somewhere leans, straightens, and carries on. */
  if (t - heldSince > (dir === 0 ? 5.0 : 1.2)) {
    heldSince = t;
    dir = dir === 0 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  }
  G.setSteer(dir);
  const before = said.length;
  G.update(DT);
  if (!G.isSteering()) {
    /* Pulled over, or fishing. Put it back on the water: this is about the
       calls made under way. */
    if (G.chooseTroll) G.chooseTroll();
    continue;
  }
  for (let i = before; i < said.length; i++) {
    const m = SIDE_RE.exec(said[i].text);
    if (!m) continue;
    const fish = m[1].replace(/\s+now$/i, '').trim();
    const side = m[2].toLowerCase();
    lastCall = { fish: fish, t: t };
    seen.push({ t: said[i].t, fish: fish, side: side,
                cardFish: card[side] ? card[side].fishName : null,
                otherFish: card[side === 'left' ? 'right' : 'left'],
                text: said[i].text });
  }
  /* From the moment a fish is called until a card for it is up somewhere: the
     stretch where the player has been told about something they cannot see. */
  if (lastCall) {
    const up = (card.left && card.left.fishName === lastCall.fish) ||
               (card.right && card.right.fishName === lastCall.fish);
    if (up) lastCall = null;
    else noCard.worst = Math.max(noCard.worst, t - lastCall.t);
  }
}

console.log('WHAT THE GAME SAID, AND WHAT IT SHOWED');
console.log();
console.log('time'.padStart(6), 'said'.padEnd(42), 'card on that side');
seen.slice(0, 18).forEach((s) => {
  console.log(s.t.toFixed(1).padStart(6), ('"' + s.text + '"').padEnd(42),
              s.cardFish || (s.otherFish ? '(the other side: ' + s.otherFish.fishName + ')' : '(nothing)'));
});
if (seen.length > 18) console.log('  ... and ' + (seen.length - 18) + ' more');
console.log();

ok(seen.length >= 5, 'the game called fish out loud on this trip (' + seen.length + ' calls)');

/* SAME SHOAL. The voice and the card must be talking about the same fish -
   they used to pick which shoal to talk about by different rules. */
const named = seen.filter(s => s.cardFish);
const agree = named.filter(s => s.cardFish === s.fish);
console.log('of ' + seen.length + ' calls, ' + named.length + ' had a card up on that side, ' +
            'and ' + agree.length + ' of those named the same fish');
ok(named.length >= Math.floor(seen.length * 0.7),
   'a call comes with a card on the side it names (' + named.length + ' of ' + seen.length + ')');
ok(agree.length === named.length,
   'and the card names the fish the game just said (' + agree.length + ' of ' + named.length + ')');

/* SILENT GAPS. The other half of the complaint: the game talks about a fish
   and there is no card for it. That happens a whole second AFTER the call, so
   it is measured over the trip rather than at the moment of speaking - how
   long the game spends having something to say about a shoal while showing
   nothing on either side. */
ok(noCard.worst < 1.0,
   'the game never talks about a shoal without a card up for it (worst gap ' +
   noCard.worst.toFixed(1) + ' s)');

/* WRONG SIDE. A call landing while the card sits on the OTHER side is the
   complaint in its purest form. */
const crossed = seen.filter(s => !s.cardFish && s.otherFish);
ok(crossed.length === 0,
   'no call puts fish on one side while the card shows them on the other (' +
   crossed.length + ')');

/* STALE SIDES. Watch one whole trip and time how long the card and the last
   spoken side are allowed to disagree. */
let worst = 0, worstFish = '';
let lastSide = null, lastFish = null, since = 0;
t = 0;
G.returnToDock();
G.castOff();
said.length = 0;
heldSince = 0; dir = 1;
for (let f = 0; f < 30 * 750; f++) {
  t += DT;
  if (t - heldSince > 3.0) { heldSince = t; dir = dir === 0 ? (Math.random() < 0.5 ? -1 : 1) : 0; }
  G.setSteer(dir);
  const before = said.length;
  G.update(DT);
  if (!G.isSteering()) { if (G.chooseTroll) G.chooseTroll(); continue; }
  for (let i = before; i < said.length; i++) {
    const m = SIDE_RE.exec(said[i].text);
    if (m) { lastFish = m[1].replace(/\s+now$/i, '').trim(); lastSide = m[2].toLowerCase(); since = t; }
  }
  if (!lastSide) continue;
  const shown = card.left ? 'left' : card.right ? 'right' : null;
  const shownFish = card.left ? card.left.fishName : card.right ? card.right.fishName : null;
  if (shown && shownFish === lastFish && shown !== lastSide) {
    const stale = t - since;
    if (stale > worst) { worst = stale; worstFish = lastFish; }
  } else {
    since = t;
  }
}
console.log();
console.log('the longest a spoken side was left standing after the card disagreed: ' +
            worst.toFixed(1) + ' s' + (worstFish ? ' (' + worstFish + ')' : ''));
ok(worst < 7,
   'a side that goes stale is corrected out loud within a few seconds (worst ' +
   worst.toFixed(1) + ' s)');

/* AND NOTHING IS CALLED THAT A ROD CANNOT CATCH. The bait fish - minnows and
   shiners - are netted off the boards; a boat being told to cast at a shoal
   of golden shiners is being told a lie, and was. */
const bait = seen.filter(s => /minnow|shiner/i.test(s.fish));
ok(bait.length === 0,
   'no shoal of bait fish is called out to a boat with a rod (' + bait.length + ')');

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. What it says is what is there.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
