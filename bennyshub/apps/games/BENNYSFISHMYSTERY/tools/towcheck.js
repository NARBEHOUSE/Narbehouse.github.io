/**
 * A boat that came back on the end of Walt's line stays in.
 *
 *     node tools/towcheck.js  [--verbose]
 *
 * The fog job ends with the motorboat's drive pin snapped and Walt towing you
 * home. He says so in as many words - "the engine is dead, I towed you back" -
 * and the next job hands over a KAYAK precisely because the motorboat is in
 * pieces on the hard. But nothing in the arithmetic knew that, so you could
 * walk down the jetty and take the dead boat straight back out. Reported:
 * "after we drive the boat into the fog and need a tow, I can immediately
 * take the boat out again."
 *
 * Four things have to hold, and the last two are the ones that could strand
 * somebody, which is far worse than the fault being fixed:
 *
 *   TAKEN     - after the tow, that boat is not the boat you go out in
 *   GIVEN BACK- handing the job in at the counter puts it back
 *   NOT STUCK - you always have SOMETHING to go out in, down to the boards
 *   QUIET     - a save that never saw the fog behaves exactly as before
 *
 * The tow is driven through the real trip - cast off, steer to the spot, take
 * the beat - rather than by setting the flag by hand, because the flag being
 * set in the right place is the whole change.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;
const VERBOSE = process.argv.indexOf('--verbose') >= 0;
const DT = 1 / 60;

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

const sv = G.getSave();

/* Which job is the one that ends under tow, and what it hands you next. */
function incidentJob() {
  for (let n = 1; n <= 90; n++) {
    const m = G.missionByN && G.missionByN(n);
    if (m && m.kind === 'incident') return m;
  }
  return null;
}
const INC = incidentJob();

function stockFor(n) {
  sv.currentMission = n;
  sv.highestMission = Math.max(sv.highestMission || 1, n);
  sv.briefed = n;
  sv.money = 900;
  sv.vessels = ['foot', 'canoe', 'kayak', 'motorboat'];
  sv.rods = ['hand_net', 'bamboo_rod', 'fiber_rod', 'carbon_rod'];
  sv.baits = ['earthworm', 'shiner_bait', 'spoon', 'stinkbait', 'deep_rig'];
  sv.tools = ['tagging_tool', 'magnet_1', 'heavy_magnet'];
  sv.towedBoat = '';
}

function until(pred, limit, onFrame) {
  for (let i = 0; i < limit; i++) {
    if (pred()) return i;
    if (onFrame) onFrame(i);
    G.update(DT);
  }
  return -1;
}

ok(!!INC, 'the ladder has a job that ends under tow' + (INC ? ' (job ' + INC.n + ')' : ''));
if (!INC) { finish(); }

/* ── TAKEN ────────────────────────────────────────────────────────────────
   Drive the real trip out to the fog and let it stall. */
let towedTo = null;
(function () {
  stockFor(INC.n);
  const beforeBoat = G.vessel().id;
  ok(beforeBoat === 'motorboat',
     'you set out for the fog in the motorboat (' + beforeBoat + ')');

  G.goToDock();
  if (G.castOff() === false) { ok(false, 'the fog trip can be started at all'); return; }

  /* STEER FOR THE PLACE, the way a player reading the chart does. The fog
     edge is a PLACE on the lake, not a shoal that calls out, so waiting to be
     hailed never gets there - which is why playtest_run steers on jobPlace()
     and its clear heading rather than on the cue. Same two helpers here, for
     the same reason: a bot on a different heading is testing a different
     game. */
  let card = null;
  G.callbacks.onCard = function (d) { card = d && d.which; };

  const goalOf = () => (G.jobPlace && G.jobPlace()) || null;
  const steerToPlace = () => {
    const pl = goalOf(), r = G.run;
    if (!pl || !r) { G.setSteer(0); return; }
    const want = G.clearHeading ? G.clearHeading(pl.x, pl.z)
                                : Math.atan2(pl.x - r.x, -(pl.z - r.z));
    let d = want - r.head;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    G.setSteer(Math.abs(d) < 0.05 ? 0 : (d > 0 ? 1 : -1));
  };
  const nearPlace = () => {
    const pl = goalOf(), r = G.run;
    if (!pl || !r) return null;
    if (Math.hypot(pl.x - r.x, pl.z - r.z) > (G.spotOffer ? G.spotOffer() : 230) * 0.95) return null;
    const rx = Math.cos(r.head), rz = Math.sin(r.head);
    return ((pl.x - r.x) * rx + (pl.z - r.z) * rz) >= 0 ? 'right' : 'left';
  };

  let took = false;
  for (let pass = 0; pass < 12 && !took; pass++) {
    card = null;
    const there = until(() => card || nearPlace() || !G.isPlaying(), 60 * 180, steerToPlace);
    G.setSteer(0);
    if (!G.isPlaying() || there < 0) break;
    if (!card) {
      const side = nearPlace() || 'right';
      G.pullOverTo(side);
      until(() => card || !G.isPlaying(), 60 * 25);
    }
    if (!G.isPlaying()) break;
    if (card === 'beat') {
      const r = G.takeBeat();
      if (r) { took = true; if (r.towing) towedTo = true; }
    } else if (card) {
      card = null;
      if (G.chooseTroll) G.chooseTroll();
      until(() => G.isSteering() || !G.isPlaying(), 60 * 6);
    }
  }
  ok(took, 'the fog job reaches its beat when it is played');
  ok(towedTo === true, 'and that beat is a tow, not an ordinary stop');
})();

/* What the tow did to the locker. */
(function () {
  const towed = sv.towedBoat;
  ok(towed === 'motorboat',
     'the boat Walt towed in is remembered as the motorboat (got "' + towed + '")');
  const now = G.vessel().id;
  ok(now !== 'motorboat',
     'and it is NOT the boat the next trip goes out in (got "' + now + '")');
  ok(now === 'kayak',
     'the ladder drops exactly one rung, to the kayak (got "' + now + '")');
  ok(G.ownsVessel('motorboat'),
     'it is still owned - towed in, not taken away');
  if (VERBOSE) console.log('  after the tow you are in the ' + G.vessel().name);
})();

/* ── NOT STUCK ────────────────────────────────────────────────────────────
   Every rung of the ladder, towed in turn. Whatever is broken, something
   still floats - a player left at the dock with nothing to press is a worse
   bug than the one being fixed. */
(function () {
  const rungs = ['canoe', 'kayak', 'motorboat'];
  const stranded = [];
  rungs.forEach(function (owned, i) {
    stockFor(INC.n);
    sv.vessels = ['foot'].concat(rungs.slice(0, i + 1));
    rungs.slice(0, i + 1).forEach(function (broken) {
      sv.towedBoat = broken;
      const v = G.vessel().id;
      if (!v) stranded.push('owning up to ' + owned + ', ' + broken + ' towed: no vessel at all');
      if (v === broken) stranded.push('owning up to ' + owned + ', ' + broken +
                                      ' towed: still put you in it');
      if (VERBOSE) console.log('  owns to ' + owned.padEnd(10) + ' | ' + broken.padEnd(10) +
                               ' towed -> ' + v);
    });
  });
  /* And the worst case: the only boat there is, on the trailer. */
  stockFor(INC.n);
  sv.vessels = ['foot', 'canoe'];
  sv.towedBoat = 'canoe';
  const last = G.vessel().id;
  if (last !== 'foot') stranded.push('with only a canoe and it towed, expected the boards, got ' + last);

  ok(stranded.length === 0,
     'there is always something to go out in' +
     (stranded.length ? ':\n    ' + stranded.join('\n    ') : ''));

  /* And the trip can actually be started from the boards. */
  stockFor(INC.n);
  sv.vessels = ['foot', 'canoe'];
  sv.towedBoat = 'canoe';
  G.goToDock();
  const off = G.castOff();
  ok(off !== false, 'and the trip still starts with the only boat on the trailer');
  G.returnToDock();
})();

/* ── GIVEN BACK ───────────────────────────────────────────────────────────
   Handing the job in at the counter IS the conversation about the boat. */
(function () {
  stockFor(INC.n);
  sv.towedBoat = 'motorboat';
  ok(G.vessel().id !== 'motorboat', 'before the counter, still the smaller boat');

  /* Finish the job the way the counter sees it, then hand it in. */
  const t = INC.target || {};
  if (t.flag) { sv.flags = sv.flags || {}; sv.flags[t.flag] = 1; }
  sv.progressValue = (t.amount || 1);
  const st = G.turnInState();
  if (!st.done) {
    ok(false, 'the fog job can be handed in (turnInState says it is not done)');
  } else {
    G.handInJob();
    ok(sv.towedBoat === '',
       'Walt takes the job in and the boat comes off the trailer (got "' + sv.towedBoat + '")');
    /* Back on the water it goes - unless the ladder has since moved the game
       on to a job that names a smaller boat, which is its business, not this
       check's. */
    sv.currentMission = INC.n;
    ok(G.vessel().id === 'motorboat',
       'and it is the boat you go out in again (got "' + G.vessel().id + '")');
  }
})();

/* ── QUIET ────────────────────────────────────────────────────────────────
   A save that has never been towed must behave exactly as it always did,
   including one written before this field existed. */
(function () {
  stockFor(INC.n);
  ok(G.vessel().id === 'motorboat', 'a boat nobody has towed is still the best boat');
  delete sv.towedBoat;              // an older save: the field was never written
  ok(G.vessel().id === 'motorboat',
     'and a save from before any of this still puts you in the motorboat');
})();

function finish() {
  const res = H.results();
  console.log();
  console.log(res.fail === 0
    ? res.checks + ' checks passed. A towed boat stays in until Walt has had it.'
    : res.fail + ' of ' + res.checks + ' checks failed.');
  process.exit(res.fail ? 1 : 0);
}
finish();
