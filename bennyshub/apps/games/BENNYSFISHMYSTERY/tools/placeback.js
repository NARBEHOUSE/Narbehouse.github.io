/**
 * Trolling on at the job's own place means "not now", not "never".
 *
 *     node tools/placeback.js
 *
 * Reported on job 9: "when I troll on, if I don't complete the quest then the
 * magnet fishing card doesn't pop up again. it should."
 *
 * A patch of perch behind you is spent water and that is right. The ONE spot
 * the whole job is about is not - the job cannot be finished without it - so
 * it un-spends itself once you have drawn off, and comes back onto the card.
 *
 * Two things have to come back, and only the first of them used to:
 *
 *   the CARD    - activeSpot(), which is what the player presses
 *   the WORDS   - the call-out, which is what a player who cannot see the
 *                 card has instead of one
 *
 * A shoal is announced once a trip (`said`), so the place returned in
 * silence. With the quest helper ON its own "here it is, holding you over it"
 * hid that; with the helper OFF - free driving - the second approach to the
 * one spot that matters said nothing at all. Both modes are checked here for
 * exactly that reason.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.init({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

const places = (RT.content.lake.places || []);
const quests = RT.content.quests.quests || RT.content.quests;

function until(fn, max, drive) {
  for (let i = 0; i < max; i++) { if (fn()) return i; if (drive) drive(); G.update(1 / 30); }
  return -1;
}
function sideFor(key) {
  for (const s of ['left', 'right']) { const t = G.__spotToEnter(s); if (t && t.key === key) return s; }
  return null;
}

/* PULSED, NOT HELD. Holding the helm over IS the pull-over gesture, so a test
   that holds it steers itself into the first shoal it passes and then sits
   there reporting that nothing ever came back. */
let frame = 0;
function steerAt(p) {
  frame++;
  if (frame % 20 >= 8) { G.setSteer(0); return; }
  const want = Math.atan2(p.x - G.run.x, -(p.z - G.run.z));
  let d = want - G.run.head;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  G.setSteer(Math.abs(d) < 0.08 ? 0 : (d > 0 ? 0.7 : -0.7));
}

function trial(qid, helperOn) {
  const job = quests.find(q => q.id === qid);
  if (!job) return null;
  G.resetProgress();
  const sv = G.getSave();
  sv.briefed = 99; sv.currentMission = job.n; sv.money += 5000;
  ['rods', 'vessels', 'baits', 'tools'].forEach(k =>
    (RT.content.roster[k] || []).forEach(x => { if (!sv[k].includes(x.id)) sv[k].push(x.id); }));
  if (G.getHelper() !== helperOn) G.toggleHelper();
  G.goToDock(); G.setOnFoot(false); G.castOff();

  const pl = G.jobPlace();
  if (!pl) return { n: job.n, skip: 'no place' };
  const label = String(pl.label || '').toLowerCase();
  const said = [];
  G.callbacks.onSpeak = (s) => {
    const t = (s && s.text) || s;
    if (t && label && String(t).toLowerCase().indexOf(label) >= 0) said.push(String(t));
  };
  const drive = () => { if (!helperOn) steerAt(pl); };

  if (until(() => { const a = G.debugActiveSpot(); return a && a.key === pl.key && sideFor(pl.key); },
            400 * 30, drive) < 0) return { n: job.n, first: false };
  G.setSteer(0);
  const side = sideFor(pl.key);
  G.pullOverTo(side);
  const arr = until(() => G.isFishing(), 30 * 20, () => G.setSteer(side === 'left' ? -1 : 1));
  G.setSteer(0);
  if (arr < 0) return { n: job.n, first: true, gotIn: false };

  // Troll on WITHOUT finishing the job - the reported move.
  const before = said.length;
  G.chooseTroll();
  until(() => G.isSteering(), 30 * 6);
  const back = until(() => { const a = G.debugActiveSpot(); return a && a.key === pl.key; }, 150 * 30, drive);
  G.setSteer(0);
  /* Then keep driving at it. A place that un-spends the moment you pull away
     is back on the card while the boat is still going the other way, and the
     call comes on the next approach - which is the thing being measured. */
  for (let i = 0; i < 30 * 40 && !said.slice(before).length; i++) { drive(); G.update(1 / 30); }
  G.setSteer(0);
  return { n: job.n, first: true, gotIn: true, back: back, said: said.slice(before) };
}

console.log('THE JOB\'S PLACE COMES BACK AFTER YOU TROLL ON');
const bad = [];
[true, false].forEach(helperOn => {
  console.log('\n  quest helper ' + (helperOn ? 'ON' : 'OFF') + ':');
  places.forEach(p => {
    const r = trial(p.quest, helperOn);
    if (!r) return;
    if (r.skip) return;
    const where = 'job ' + r.n + ' (' + p.label + ', helper ' + (helperOn ? 'on' : 'off') + ')';
    if (!r.first) {
      /* NOT A FINDING. The centre fog and the abyssal trench are most of a
         lake away, behind the log jam, and steering there by hand is what the
         quest helper is FOR - this bot cannot do it, which says nothing about
         the game. Only counted when the helper was on. */
      console.log('    job ' + String(r.n).padStart(2) + '  ' + String(p.label).padEnd(26) +
                  (helperOn ? ' NEVER CARDED' : ' (bot could not steer there unaided - not checked)'));
      if (helperOn) bad.push(where + ': never carded');
      return;
    }
    if (!r.gotIn) { console.log('    job ' + String(r.n).padStart(2) + '  could not pull over'); bad.push(where + ': could not pull over'); return; }
    console.log('    job ' + String(r.n).padStart(2) + '  ' + String(p.label).padEnd(26) +
                ' card back: ' + (r.back < 0 ? 'NEVER' : Math.round(r.back / 30) + 's').padEnd(6) +
                ' called again: ' + (r.said.length ? 'yes' : 'NO'));
    if (r.back < 0) bad.push(where + ': the card never came back');
    else if (!r.said.length) bad.push(where + ': it came back in silence');
  });
});
console.log();
ok(bad.length === 0,
   'the job\'s place puts its card up AND calls itself out again after you troll on' +
   (bad.length ? '\n        ' + bad.join('\n        ') : ''));
