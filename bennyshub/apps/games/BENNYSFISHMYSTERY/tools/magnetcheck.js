/**
 * Is magnet fishing a thing you can actually do?
 *
 *     node tools/magnetcheck.js
 *
 * A magnet is not a hook and the game had been treating it like one. Three
 * separate faults came out of that, each of which a player hit:
 *
 *   - nothing on the line. The magnet was built and shown and then hidden
 *     again in the same frame, because the dropper above it was being fished
 *     out of the group by its position in the list and the magnet had taken
 *     that position. You cast, and there was the same float and hook as ever.
 *
 *   - nothing ever came up. Measured, a drag turned something up four times
 *     in a hundred casts, so a job wanting three pieces of scrap was an
 *     afternoon of casting at nothing.
 *
 *   - and the job's own thing could not come up AT ALL unless the boat had
 *     stopped on the job's exact marker, which is not where a boat stops. The
 *     ladder sat on "recover the snapped propeller" for two thousand casts
 *     proving it was impossible.
 *
 * So this asks the three questions directly: is there a magnet on the line
 * and is the float off it, does a drag find things often enough to be worth
 * doing, and does the water the job is about give up the thing the job wants.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {}, setPixelRatio() {},
                     getContext: () => null } });

const sv = G.getSave();
/* The propeller job, not the scrap job. Its item is one specific thing that
   exists nowhere else on the bottom, so "did the lake hand it over on the
   first drag" is a question with a meaning - where a job that wants ordinary
   scrap metal is satisfied by the ordinary scrap metal that comes up anyway. */
sv.briefed = 99; sv.currentMission = 9; sv.money += 800;
['bamboo_rod', 'fiber_rod'].forEach(r => { if (!sv.rods.includes(r)) sv.rods.push(r); });
if (!sv.tools.includes('magnet_1')) sv.tools.push('magnet_1');
if (!sv.vessels.includes('canoe')) sv.vessels.push('canoe');
G.equipKit('fiber_rod', undefined, 'magnet_1');

/* The callback hands over ONE object. Reading it as (name, data) is how a run
   full of finds can be read back as a run of nothing. */
let card = null;
/* What the aimer is telling the screen. A cast thrown blind straight ahead
   lands on the bank as often as not - measured, at the salvage marker every
   throw went into the mud three units out - so the aim is chosen the way a
   player chooses it: by watching this. */
let aim = null;
G.callbacks.onAim = function (d) { aim = d; };
/* And the power meter. Released after a fixed count of frames, the meter is
   wherever its swing happens to be - which measured a ten per cent throw at
   one spot and a thirty per cent throw at another and read the difference as
   a fault in the lake. A magnet wants the whole meter: you throw it as far as
   it will go and drag it all the way home. */
let charge = null;
G.callbacks.onCharge = function (d) { charge = d; };
G.callbacks.onCard = function (a) {
  const nm = a && (a.name || a.which || a.card);
  if (nm) card = { name: nm, data: a };
};

G.goToDock(); G.setOnFoot(false); G.castOff();
for (let i = 0; i < 60; i++) G.update(1 / 30);

ok(!!(G.magnetOn && G.magnetOn()), 'a magnet on the line is a magnet on the line');

/* Pulling over, rather than being teleported on top of the water. A boat that
   has not stopped is not fishing, and a boat that is not fishing cannot cast:
   the first version of this check teleported and measured a hundred per cent
   of nothing. */
/* WHICH SIDE THE THING IS ON. A boat only pulls over onto what is beside it
   on the side it pulls over to, which is right - the cue names the side - but
   it means a check that stops blind on 'right' lands on whatever cell shoal
   happened to be there and never sees the marker at all. */
function stopOnto(x, z) {
  for (const side of ['right', 'left']) {
    if (G.isFishing && G.isFishing() && G.chooseTroll) {
      G.chooseTroll();
      for (let i = 0; i < 30; i++) G.update(1 / 30);
    }
    /* Short of it, pointed at it, so the marker is genuinely off one beam. */
    G.run.x = x - (side === 'right' ? 26 : -26);
    G.run.z = z - 26;
    G.run.head = Math.atan2(x - G.run.x, -(z - G.run.z));
    for (let i = 0; i < 40; i++) G.update(1 / 30);
    G.pullOverTo(side);
    for (let i = 0; i < 600 && !G.isFishing(); i++) G.update(1 / 30);
    if (G.isFishing() && G.run.current && G.run.current.isPlace) return true;
  }
  return G.isFishing();
}

function stopNear(x, z) {
  /* ON the water in question, not forty units short of it: pullOverTo enters
     whatever is beside the boat, so a boat parked forty units away stops on
     the nearest cell shoal and never sees the job's own marker at all. */
  /* Off the spot first. A boat that is picked up and put down somewhere else
     is still stopped on whatever it was stopped on - measured, the "open
     water" trial was four hundred units away and still sitting on the salvage
     marker, which is how both trials came back with the same number. */
  if (G.isFishing && G.isFishing() && G.chooseTroll) {
    G.chooseTroll();
    for (let i = 0; i < 30; i++) G.update(1 / 30);
  }
  G.run.x = x; G.run.z = z;
  for (let i = 0; i < 30; i++) G.update(1 / 30);
  G.pullOverTo('right');
  for (let i = 0; i < 600 && !G.isFishing(); i++) G.update(1 / 30);
  return G.isFishing();
}

/* ── DRAGGING IT BACK ───────────────────────────────────────────────────── */
function dragTrial(casts) {
  let found = 0;
  const what = {};
  /* Why a cast came to nothing, which is the difference between "the bottom
     was bare" and "there was never a cast at all". */
  const why = {};
  const drags = [];
  /* In the order they came up, so "the lake handed me the thing I came for on
     the first drag" can be asked about directly. */
  const order = [];
  for (let c = 0; c < casts; c++) {
    card = null;
    G.startAim();
    /* Sweep until the aimer says the throw would land in water. */
    let swept = 0;
    G.setAimSweep(true, 1);
    while (swept++ < 400 && !(aim && !aim.onShore && !aim.tooDeep)) G.update(1 / 30);
    G.setAimSweep(false);
    if (!(aim && !aim.onShore && !aim.tooDeep)) { why.noWater = (why.noWater || 0) + 1; continue; }
    charge = null;
    G.beginCharge(); G.setCharging(true);
    let held = 0;
    while (held++ < 400 && !(charge && charge.power >= 88)) G.update(1 / 30);
    G.setCharging(false); G.releaseCast();
    for (let i = 0; i < 90 && !(G.run && G.run.landing); i++) G.update(1 / 30);
    if (!(G.run && G.run.landing)) { why.noLanding = (why.noLanding || 0) + 1; continue; }
    drags.push(Math.hypot(G.run.landing.x - G.run.x, G.run.landing.z - G.run.z));

    /* The magnet is nothing but a retrieve: hold the switch all the way in. */
    G.setReelHold(true);
    let guard = 0;
    while (!card && guard++ < 1200) G.update(1 / 30);
    G.setReelHold(false);
    if (!card) why.noCard = (why.noCard || 0) + 1;
    else if (card.name !== 'catchreveal' && card.name !== 'dingusreveal')
      why[card.name] = (why[card.name] || 0) + 1;
    if (card && (card.name === 'catchreveal' || card.name === 'dingusreveal')) {
      found++;
      const o = G.run && G.run.lastCatch;
      const id = (o && (o.id || o.name)) || '?';
      what[id] = (what[id] || 0) + 1;
      order.push(id);
    }
    if (G.afterCatchCard) G.afterCatchCard();
    for (let i = 0; i < 10; i++) G.update(1 / 30);
  }
  return { found, casts, what, why, order,
           drag: drags.length ? drags.reduce((a, b) => a + b, 0) / drags.length : 0 };
}

/* THE JOB'S OWN WATER FIRST, and the job's progress wound back between the
   two trials. A hundred and twenty casts is enough to FINISH a job wanting
   three pieces of scrap, and a finished job has no place on the lake any
   more - so measured the other way round, the second trial was measuring a
   job that no longer existed. */
const place = G.jobPlace();
ok(!!place, 'the salvage job has a place on the lake');

const stoppedOver = place ? stopOnto(place.x, place.z) : false;
ok(stoppedOver, 'and the boat can stop on the water the job is about');

/* WHAT IS HANGING THERE, read once the rod has actually been drawn - before
   the first cast updateRod has never run and every flag reads false. */
const rig = RT.scene.debugRig && RT.scene.debugRig();
if (rig && rig.rig) {
  console.log('on the line:', JSON.stringify(rig));
  ok(rig.magnetExists, 'the magnet is built');
  ok(rig.onTheLine === 'magnet', 'and the game knows it is what is on the line');
}

const ch = RT.lake && RT.lake.chart ? RT.lake.chart(RT.content.lake) : null;
if (ch && place) {
  console.log('the marker sits in ' + ch.depthAt(place.x, place.z).toFixed(1) + ' feet,',
              'the boat in ' + ch.depthAt(G.run.x, G.run.z).toFixed(1) + ' feet;',
              'the spot under it is', G.run.current ? G.run.current.key : '(none)',
              '| range', G.run.range);
}
const over = dragTrial(120);
console.log();
console.log('over the job: ' + over.found + ' finds in ' + over.casts + ' casts (' +
            Math.round(over.found / over.casts * 100) + '%), dragged ' + over.drag.toFixed(1) + ' units');
console.log('  ' + JSON.stringify(over.what) + '  and the rest: ' + JSON.stringify(over.why));

// Wind the job back so the place is still on the lake for the second trial.
sv.progressValue = 0;
const stoppedAway = place ? stopNear(place.x + 300, place.z + 300) : false;
ok(stoppedAway, 'and it can stop out in open water');
console.log('out in open water the boat is',
            Math.hypot(G.run.x - place.x, G.run.z - place.z).toFixed(0),
            'units off the marker; the spot under it is',
            G.run.current ? G.run.current.key : '(none)',
            '| carries the job:', !!(G.run.current && G.run.current.job));
const away = dragTrial(120);
console.log();
console.log('away from the job: ' + away.found + ' finds in ' + away.casts + ' casts (' +
            Math.round(away.found / away.casts * 100) + '%), dragged ' + away.drag.toFixed(1) + ' units');
console.log('  ' + JSON.stringify(away.what) + '  and the rest: ' + JSON.stringify(away.why));

ok(away.found > 0, 'a magnet finds SOMETHING off in open water (' + away.found + '/' + away.casts + ')');
ok(over.found / over.casts > 0.5,
   'and over the job it is well worth casting (' + Math.round(over.found / over.casts * 100) + '%)');
/* Mostly nothing, out in the lake. Dragging a magnet across open bottom and
   pulling something up every other cast is not magnet fishing, it is a
   vending machine. */
/* Open water used to be "mostly nothing" on purpose, and that made the magnet
   the worst-paid thing in the game - a dollar a minute against ten for a rod.
   It gives iron up about half the time now. Still well short of the job's own
   marker, which is the point: the marker is where you go. */
ok(away.found / away.casts < 0.62,
   "but open water is thinner than the job's own (" +
   Math.round(away.found / away.casts * 100) + '%)');
ok(over.found >= away.found,
   'the water the job is about is the better place to drag it');

/* And the thing the job actually wants has to be one of them, or the job
   cannot be finished at all - which is exactly what happened. */
const brief = G.currentMission && G.currentMission();
const wanted = brief && brief.target && brief.target.itemId;
if (wanted) {
  console.log();
  console.log('the job wants:', wanted);
  ok(!!over.what[wanted],
     'and it comes up over the water the job is about (' + (over.what[wanted] || 0) + ' times)');
  /* BUT NOT STRAIGHT AWAY. A bottom that hands you the exact brass frame on
     the first drag is a vending machine; the lake gives up cans and old
     anchors first and the water gets worked over. */
  const firstTwo = over.order.slice(0, 3);
  console.log('the first things up were:', firstTwo.join(', ') || '(none)');
  ok(firstTwo.indexOf(wanted) < 0,
     'and not on the first thing the lake gives up');
  const at = over.order.indexOf(wanted);
  ok(at < 0 || at >= 3, 'the bottom has to be worked over first (it came up ' +
     (at < 0 ? 'not at all' : 'on find ' + (at + 1)) + ')');
}

/* ── ONE THING AT A TIME ──────────────────────────────────────────────────
   The voice cancels itself: a second line a frame after the first means the
   first is never heard. Count what gets said across an empty retrieve. */
const said = [];
let lastCard = null;
G.callbacks.onSpeak = function (t) { said.push(t); };
G.callbacks.onCard = function (a) {
  const nm = a && (a.name || a.which || a.card);
  if (nm) { card = { name: nm, data: a }; lastCard = a; }
};

/* The job wound back on, so the water under the boat is the job's water again
   - the trials above finished it, and a finished job has no place on the lake
   for the boat to be over. */
sv.progressValue = 0;
if (place) stopOnto(place.x, place.z);

/* The reel is a LOOP. Count the starts against the stops: a way out of the
   retrieve that skips the stop leaves the handle clicking for the rest of the
   trip, which is what a player heard after every magnet find. */
let loopOn = 0;
const A = RT.audio;
const realStart = A.reelStart, realStop = A.stopReelLoop;
A.reelStart = function () { loopOn++; return realStart && realStart.apply(A, arguments); };
A.stopReelLoop = function () { loopOn = 0; return realStop && realStop.apply(A, arguments); };

let empties = 0, worst = 0, sample = null;
/* Every empty drag's line, not just the first: they alternate on purpose - a
   short one most times and a longer one now and then - because a player who
   hears the same full sentence on every cast turns the voice off. */
const notes = [];
for (let c = 0; c < 25 && empties < 4; c++) {
  card = null; lastCard = null;
  G.startAim();
  let swept = 0;
  G.setAimSweep(true, 1);
  while (swept++ < 400 && !(aim && !aim.onShore && !aim.tooDeep)) G.update(1 / 30);
  G.setAimSweep(false);
  if (!(aim && !aim.onShore && !aim.tooDeep)) continue;
  charge = null;
  G.beginCharge(); G.setCharging(true);
  let held = 0;
  while (held++ < 400 && !(charge && charge.power >= 88)) G.update(1 / 30);
  G.setCharging(false); G.releaseCast();
  for (let i = 0; i < 90 && !(G.run && G.run.landing); i++) G.update(1 / 30);

  said.length = 0;
  G.setReelHold(true);
  let guard = 0;
  while (!card && guard++ < 1200) G.update(1 / 30);
  G.setReelHold(false);
  if (card && card.name === 'spot') {
    empties++;
    if (said.length > worst) { worst = said.length; }
    if (!sample) sample = { spoken: said.slice(), note: lastCard && lastCard.note };
    if (lastCard && lastCard.note) notes.push(lastCard.note);
  }
  if (G.afterCatchCard) G.afterCatchCard();
  for (let i = 0; i < 10; i++) G.update(1 / 30);
}

console.log();
console.log('an empty drag says:', JSON.stringify(sample && sample.spoken));
console.log('and the card carries:', JSON.stringify(sample && sample.note));
ok(empties > 0, 'a drag can come back empty (' + empties + ' seen)');
ok(loopOn === 0, 'and the reel stops turning when the drag ends (' + loopOn + ' left running)');

/* And the same across a find, which is the path that was leaving it on. */
let found = false;
for (let c = 0; c < 30 && !found; c++) {
  card = null;
  G.startAim();
  let sw = 0;
  G.setAimSweep(true, 1);
  while (sw++ < 400 && !(aim && !aim.onShore && !aim.tooDeep)) G.update(1 / 30);
  G.setAimSweep(false);
  charge = null;
  G.beginCharge(); G.setCharging(true);
  let hd = 0;
  while (hd++ < 400 && !(charge && charge.power >= 88)) G.update(1 / 30);
  G.setCharging(false); G.releaseCast();
  for (let i = 0; i < 90 && !(G.run && G.run.landing); i++) G.update(1 / 30);
  G.setReelHold(true);
  let g2 = 0;
  while (!card && g2++ < 1200) G.update(1 / 30);
  G.setReelHold(false);
  if (card && (card.name === 'catchreveal' || card.name === 'dingusreveal')) found = true;
  if (G.afterCatchCard) G.afterCatchCard();
  for (let i = 0; i < 10; i++) G.update(1 / 30);
}
ok(found, 'something comes up on the magnet to test the sound against');
ok(loopOn === 0, 'and the reel stops turning when something comes up (' +
   loopOn + ' left running)');
ok(worst <= 1, 'and it says one thing, not two over the top of each other (' + worst + ')');
if (sample && sample.note) {
  ok(/nothing|still/i.test(sample.note), 'and what it says is that nothing came up');
  console.log('across ' + notes.length + ' empty drags it said:', JSON.stringify(notes));
  ok(notes.some(function (n) { return /water|drag|again|bottom|keep/i.test(n); }),
     'and now and then, whether it is worth casting again there');
  ok(notes.some(function (n) { return n.length < 26; }),
     'without saying the whole sentence every single time');
}

/* ── THE CARD AT A MAGNET PLACE IS THE PLACE ─────────────────────────────
   Reported on the log jam: "it only shows fishing spots, so it's hard to
   know if the magnet will get the item we need." A magnet place is the
   reason the trip is happening, so it is offered from further out than a
   shoal is, and it wins whenever both are in reach. */
console.log();
console.log('WORKING A MAGNET PLACE');
(function () {
  const s2 = G.getSave();
  /* BY ITS ID, not by its number. This job was number 21 until two jobs were
     inserted below it - the walleye and the cisco, neither of which any job
     had ever asked for - and a check that names a rung of the ladder by its
     position fails the next time anything is written into the middle of it.
     q21 is the clue in the log jam, wherever it sits. */
  const jam = (G.visibleMissions() || []).find(function (m) { return m.id === 'q21'; }) ||
              { n: 21 };
  s2.currentMission = jam.n;
  s2.highestMission = jam.n;
  /* And nothing counted towards it yet - the count carries over from
     whatever this suite was fishing a moment ago, and a job that looks
     finished has no place left to go to. */
  s2.progressValue = 0;
  s2.briefed = 99;
  s2.vessel = 'kayak';
  ['magnet_1', 'heavy_magnet'].forEach(function (t) {
    if (!s2.tools.includes(t)) s2.tools.push(t);
  });
  s2.kitToolId = 'heavy_magnet';
  G.goToDock();
  G.castOff();
  for (let f = 0; f < 30 * 10 && !G.isSteering(); f++) G.update(1 / 30);
  const pl = G.jobPlace && G.jobPlace();
  if (!pl || !G.run) {
    console.log('  [why] run=' + !!G.run + ' place=' + JSON.stringify(pl) +
                ' mission=' + JSON.stringify((G.currentMission() || {}).id) +
                ' vessel=' + G.getSave().vessel +
                ' broken=' + (G.tackleBroken && G.tackleBroken()));
    ok(false, 'the log-jam clue (job ' + jam.n + ') has a place to work');
    return;
  }

  /* Sat further off than a shoal would ever be offered from, pointing at it. */
  const wide = (G.spotOffer ? G.spotOffer() : 73) * 1.3;
  G.run.x = pl.x;
  G.run.z = pl.z + wide;
  G.run.head = 0;
  G.run.yaw = 0;
  for (let f = 0; f < 6; f++) G.update(1 / 30);
  const off = G.debugActiveSpot ? G.debugActiveSpot() : null;
  console.log('  from ' + Math.round(wide) + ' units off, further than a shoal is ' +
              'offered from, the game offers: ' +
              (off ? (off.isPlace ? 'THE PLACE' : off.fishName || 'a shoal') : 'nothing'));
  ok(!!(off && off.isPlace), 'the magnet place is offered from further out than a shoal');
  ok(!!(off && off.magnetSpot), 'and it is offered as a magnet spot, not a fishing spot');
})();

/* ── A MAGNET SPOT MUST NOT SHOW WHAT IT HIDES ───────────────────────────
   The card at the job's marked place used to carry the ITEM's own painting -
   so job 22, which is called "Something in the Log Jam" and whose whole
   content is not knowing, showed the player the sound comb before they had
   dropped the magnet in. Reported: "for all of these magnet fishing missions
   just use the magnet icon, we don't wanna spoil what we are going to get."

   The NET place is exempt and has to be: the clean-up job says "scoop out
   five pieces of litter" in Walt's own voice, so there is nothing there to
   give away. */
console.log();
console.log('WHAT EACH MARKED PLACE IS DRAWN WITH');
(RT.content.quests.quests || [])
  .filter(function (q) { return q.need.type === 'recoverItem' && q.need.itemId; })
  .forEach(function (q) {
    const m = (RT.quests.build().missions || []).find(function (x) { return x.id === q.id; });
    const sv = G.getSave();
    sv.currentMission = m.n; sv.highestMission = m.n; sv.briefed = 99; sv.progressValue = 0;
    sv.rods = ['hand_net', 'bamboo_rod', 'fiber_rod', 'carbon_rod']; sv.baits = ['earthworm'];
    sv.tools = ['tagging_tool', 'magnet_1', 'magnet_2', 'heavy_magnet'];
    sv.kitToolId = 'magnet_1';
    sv.vessels = ['foot', 'canoe', 'kayak', 'motorboat']; sv.vessel = 'motorboat';
    const pl = G.debugPlaceShoal();
    if (!pl) { console.log('  ' + q.id + ' has no marked place'); return; }
    const rec = (RT.content.roster.items || [])
      .find(function (i) { return i.id === q.need.itemId; }) || {};
    const art = String(pl.art || '');
    console.log('  job ' + String(m.n).padEnd(3) + q.id.padEnd(6) +
                (pl.magnetSpot ? 'magnet' : 'net   ') + '  ' + art);
    if (pl.magnetSpot) {
      ok(art.indexOf(q.need.itemId) < 0,
         q.id + ': the magnet spot does not show the ' + q.need.itemId);
      ok(/\/tools\//.test(art), q.id + ': it shows a magnet instead');
    } else {
      ok(!!rec.netOnly, q.id + ': only a netted item keeps its own picture');
    }
  });

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. The magnet is on the line and the bottom gives things up.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
