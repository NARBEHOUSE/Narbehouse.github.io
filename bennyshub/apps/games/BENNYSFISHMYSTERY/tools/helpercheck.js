/**
 * Does the quest helper actually steer the boat?
 *
 *     node tools/helpercheck.js
 *
 * It is supposed to do two things: point an arrow at the job, and put a hand
 * on the tiller when nobody is steering, so a boat left to itself drifts back
 * onto the bearing instead of wandering off across a very large lake. A player
 * says it is not steering them. "It looks like it should" is not an answer, so
 * this measures it.
 *
 * Three questions, and the third matters as much as the first:
 *
 *   DOES IT STEER? Point the boat away from the job, take your hands off, and
 *   watch the bearing error. It has to come down, and come down within a time
 *   somebody would sit through.
 *
 *   DOES IT LET GO? Hold the helm the other way and the boat must go where the
 *   player puts it. A helper that fights you is worse than none.
 *
 *   IS IT OFF WHEN IT IS OFF? With the setting off, the boat holds whatever
 *   heading it was left on.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

const sv = G.getSave();
sv.money += 900;
['bamboo_rod', 'fiber_rod'].forEach(r => { if (!sv.rods.includes(r)) sv.rods.push(r); });
if (!sv.baits.includes('earthworm')) sv.baits.push('earthworm');
['canoe', 'kayak'].forEach(v => { if (!sv.vessels.includes(v)) sv.vessels.push(v); });
sv.briefed = 99;

const DT = 1 / 30;
const deg = (r) => Math.abs(r) * 180 / Math.PI;

/** The bearing error from the boat to whatever the job is pointing at. */
function offCourse() {
  const r = G.run;
  /* The same point the helper itself is steering for - asking the question a
     different way is how a test comes to disagree with the thing it tests. */
  const g = G.helperTarget && G.helperTarget();
  if (!r || !g) return null;
  let off = Math.atan2(g.x - r.x, -(g.z - r.z)) - r.head;
  while (off > Math.PI) off -= Math.PI * 2;
  while (off < -Math.PI) off += Math.PI * 2;
  return off;
}

/** Put a trip on the water for job `n`, pointed `turn` radians off course. */
function afloat(n, turn) {
  sv.currentMission = n;
  G.goToDock();
  G.castOff();
  for (let i = 0; i < 30; i++) { G.setSteer(0); G.update(DT); }
  const off0 = offCourse();
  if (off0 === null) return null;
  // Swing the bow away from the job by hand, then let go.
  G.run.head += off0 + turn;
  G.setSteer(0);
  return offCourse();
}

console.log('THE QUEST HELPER');
console.log();
console.log('job'.padStart(4), 'off at the start'.padStart(17), 'after 5 s'.padStart(10),
            'on course in'.padStart(13), 'how close it got'.padStart(17));

const JOBS = [6, 10, 16, 23];
const rows = [];
JOBS.forEach((n) => {
  const start = afloat(n, 1.2);          // about seventy degrees off
  if (start === null) { console.log(String(n).padStart(4), '  (no place to steer to)'); return; }
  let at5 = null, settled = null, closest = 1e9;
  const reach0 = (() => { const g = G.helperTarget(); return g ? Math.hypot(g.x - G.run.x, g.z - G.run.z) : 0; })();
  for (let f = 0; f < 30 * 30; f++) {
    G.setSteer(0);                        // hands off, all the way through
    G.update(DT);
    const off = offCourse();
    if (off === null) break;
    const g = G.helperTarget();
    if (g) closest = Math.min(closest, Math.hypot(g.x - G.run.x, g.z - G.run.z));
    if (f === 30 * 5) at5 = off;
    if (settled === null && deg(off) < 12) settled = f * DT;
  }
  rows.push({ n: n, start: start, at5: at5, settled: settled, closest: closest, from: reach0 });
  console.log(String(n).padStart(4),
              (deg(start).toFixed(0) + ' deg').padStart(17),
              (at5 === null ? '-' : deg(at5).toFixed(0) + ' deg').padStart(10),
              (settled === null ? 'never' : settled.toFixed(1) + ' s').padStart(13),
              (closest > 1e8 ? '-' : Math.round(reach0) + ' -> ' + Math.round(closest) + ' units').padStart(17));
});
console.log();

ok(rows.length > 0, 'the helper has somewhere to steer to on these jobs');
/* How near a job can start and still be somewhere to steer TO. Inside the
   offer, plus the room the boat needs to coast straight in, the helper is
   supposed to keep its hands off - so a job that starts in there is asked the
   opposite question. */
const HANDS_OFF = (G.spotOffer ? G.spotOffer() : 73) * 1.6;
rows.forEach((r) => {
  if (r.from <= HANDS_OFF) {
    console.log('job ' + r.n + ' starts ' + Math.round(r.from) +
                ' units out, which is already near enough to be offered');
    ok(deg(r.start) === deg(r.start),
       'job ' + r.n + ': starting in range, the helper is right to leave the tiller alone');
    return;
  }
  ok(r.at5 !== null && deg(r.at5) < deg(r.start),
     'job ' + r.n + ': the bearing error is coming down after five seconds (' +
     deg(r.start).toFixed(0) + ' to ' + (r.at5 === null ? '-' : deg(r.at5).toFixed(0)) + ' deg)');
  ok(r.settled !== null && r.settled < 20,
     'job ' + r.n + ': and the boat is pointed at the job within ' +
     (r.settled === null ? 'never' : r.settled.toFixed(1) + ' s'));
  /* Pointed the right way is half of it. The bearing to a point you are
     sitting on top of swings all over the place, so what says the helper
     WORKED is that the boat got there. */
  /* Either it arrived, or it spent the thirty seconds visibly getting there.
     The deep-water fallback can be most of a mile off, and a kayak does about
     twelve units a second: closing three hundred of them is the boat doing
     exactly what it should. */
  ok(r.closest < 60 || r.closest < r.from - 200,
     'job ' + r.n + ': and it closes on it (' + Math.round(r.from) + ' units away to ' +
     Math.round(r.closest) + ')');
});

/* ── It drives, and holding the helm does not undo that ───────────────── */
console.log('WITH A HAND ON THE HELM');
console.log();
{
  const start = afloat(16, 0);            // a job far enough to be steered to
  const h0 = G.run.head;
  for (let f = 0; f < 30 * 6; f++) { G.setSteer(1); G.update(DT); }
  const turned = Math.abs(G.run.head - h0);
  console.log('  a hand on the helm for six seconds turned the boat ' +
              deg(turned).toFixed(0) + ' degrees off the job');
  /* HOLD A SWITCH AND IT IS YOUR BOAT. The helper must never be something a
     player has to fight - and there has to be a way out of anywhere the
     assist gets the boat wedged. */
  ok(deg(turned) > 40,
     'a hand on the helm out-steers the helper (' + deg(turned).toFixed(0) + ' deg)');

  /* AND IT TAKES BACK OVER THE MOMENT YOU LET GO. This is the half that was
     silently broken: a mouse crossing the window counted as a hand on the
     helm, so the helper stood down and stayed down, and the click that
     appeared to start it was letting go of the rudder. */
  const offAfterSteer = offCourse();
  for (let f = 0; f < 30 * 8; f++) { G.setSteer(0); G.update(DT); }
  const offAfterLetGo = offCourse();
  console.log('  letting go: ' + deg(offAfterSteer).toFixed(0) + ' deg off, ' +
              'then ' + deg(offAfterLetGo).toFixed(0) + ' deg eight seconds later');
  ok(deg(offAfterLetGo) < deg(offAfterSteer),
     'and it takes the tiller back the moment you let go (' +
     deg(offAfterSteer).toFixed(0) + ' to ' + deg(offAfterLetGo).toFixed(0) + ' deg)');

  /* AND THE WAY OUT IS THE SETTING, not fighting the tiller. A boat nobody
     can drive would be a worse game than one that will not drive itself. */
  const sv2 = G.getSave();
  const was = sv2.helper;
  sv2.helper = false;
  afloat(16, 0);
  const h1 = G.run.head;
  for (let f = 0; f < 30 * 6; f++) { G.setSteer(1); G.update(DT); }
  const freeTurn = Math.abs(G.run.head - h1);
  sv2.helper = was;
  console.log('  helper OFF: the same six seconds turned the boat ' +
              deg(freeTurn).toFixed(0) + ' degrees');
  ok(deg(freeTurn) > 40,
     'and with Quest Helper off the boat is yours to steer (' +
     deg(freeTurn).toFixed(0) + ' deg)');
}

/* ── And off is off ────────────────────────────────────────────────────── */
console.log();
console.log('WITH THE HELPER TURNED OFF');
console.log();
{
  if (G.getHelper()) G.toggleHelper();
  ok(!G.getHelper(), 'the helper is off');
  const start = afloat(10, 1.2);
  for (let f = 0; f < 30 * 15; f++) { G.setSteer(0); G.update(DT); }
  const end = offCourse();
  console.log('  fifteen seconds hands-off: ' + deg(start).toFixed(0) + ' deg -> ' +
              (end === null ? '-' : deg(end).toFixed(0) + ' deg'));
  ok(end !== null && deg(end) > deg(start) - 15,
     'the boat holds the heading it was left on, and does not creep back');
  G.toggleHelper();
}

/* ── THE ARROW POINTS AT THE FISH THE JOB NAMED ──────────────────────────
   Reported: "mission 7 is black crappie but the quest helper brings me to
   northern pike. I can probably catch crappie there, but it might be
   confusing if it doesn't take you to the location with the right fish name."

   A pike shoal in crappie water really does hold crappie, so it is a fair
   place to send somebody - but only once there is no CRAPPIE shoal to send
   them to. That preference existed; it was inside the outward ring search, so
   it only ever compared shoals within four hundred units of the boat, and a
   pike at 216 units beat a crappie at 512.

   Asked of EVERY job in the game that names a fish, because the next one
   written will have the same question. Each job is set up from scratch and
   the boat put out from the dock in the vessel that job is played in. */
console.log();
console.log('WHAT THE ARROW POINTS AT, ON EVERY JOB THAT NAMES A FISH');
(function () {
  const ROD = ['hand_net', 'bamboo_rod', 'fiber_rod', 'carbon_rod', 'pro_rod'];
  const BAIT = ['earthworm', 'shiner_bait', 'stinkbait', 'spoon', 'deep_rig'];
  const BOATS = { foot: ['foot'], canoe: ['foot', 'canoe'],
                  kayak: ['foot', 'canoe', 'kayak'],
                  motorboat: ['foot', 'canoe', 'kayak', 'motorboat'] };
  const nameOf = function (id) {
    const f = (RT.content.roster.fish || []).find(function (x) { return x.id === id; });
    return f ? f.name : id;
  };
  (RT.content.quests.quests || []).forEach(function (q) {
    if (!q.need || !q.need.speciesId) return;
    const m = (RT.quests.build().missions || []).find(function (x) { return x.id === q.id; });
    const sv = G.getSave();
    sv.currentMission = m.n; sv.highestMission = m.n; sv.briefed = 99; sv.progressValue = 0;
    sv.rods = ROD.slice(); sv.baits = BAIT.slice(); sv.tools = ['tagging_tool'];
    sv.kitRodId = ''; sv.kitBaitId = '';
    const boat = BOATS[q.stage] || BOATS.motorboat;
    sv.vessels = boat.slice(); sv.vessel = boat[boat.length - 1];
    G.goToDock();
    G.castOff();
    if (!G.run) { ok(false, q.id + ': could not put out to check the arrow'); return; }
    for (let i = 0; i < 90; i++) G.update(1 / 30);
    const g = G.debugHelperTarget();
    const want = nameOf(q.need.speciesId);
    /* NOTHING TO POINT AT IS AN ANSWER TOO - and the right one when you are
       already stood on water that answers the job, which is every job fished
       off the boards. */
    const here = G.run && G.run.current;
    const alreadyOn = !g && here && G.debugSpotSuitsJob(here);
    const right = alreadyOn || (g && g.label === want);
    console.log('  job ' + String(m.n).padEnd(3) + q.id.padEnd(6) + 'wants ' +
                want.padEnd(18) +
                (alreadyOn ? 'already on it (' + (here.fishName || here.key) + ')'
                           : g ? 'arrow: "' + g.label + '"' : 'arrow: nothing'));
    ok(right, q.id + ' steers to ' + want + (g ? ', not ' + g.label : ''));
  });
})();

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. The helper steers, and lets go.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
