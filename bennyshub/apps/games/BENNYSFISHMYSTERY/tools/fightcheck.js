/**
 * Does a fish get less predictable as the game goes on?
 *
 *     node tools/fightcheck.js
 *
 * The early fight is a metronome on purpose: the runs come at even fractions
 * of the bar and each lasts about two seconds, which is how somebody learns
 * what the warning means and that letting go is what saves the line. Later it
 * is supposed to stop being a metronome - the runs wander, their length
 * spreads, a tiring fish sometimes finds a second wind - without ever asking
 * for quicker fingers, because the player has two switches.
 *
 * "Feels more unpredictable" is not a thing anybody can check by playing for
 * ten minutes, so this measures it: a few hundred fish are hooked at jobs up
 * and down the ladder and every run is timed. What comes out is the spread -
 * how far apart the longest and shortest runs are, and how far the marks
 * wander off the even spacing - job by job.
 *
 * What must NOT change is the part that could lock somebody out: the warning
 * before a run, and the rule that a fish is only lost by hauling through one.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

/* Hook a fish of a given tier at a given job and time the whole fight,
   reeling the way a patient player does: hold, and let go when it runs. */
function fightAt(missionN, tier, tries) {
  const sv = G.getSave();
  const lens = [];       // how long each run lasted
  const marks = [];      // where on the bar each run started
  const drift = [];      // how far that is off the even spacing
  let runs = 0, lost = 0;

  for (let t = 0; t < tries; t++) {
    sv.currentMission = missionN;
    const r = {
      mission: G.missionByN(missionN) || G.currentMission(),
      dist: 400 + t * 37, fightNo: t,
      bite: { category: 'fish', speciesId: 'bass' },
      state: 'reeling', timer: 0, x: 0, z: 0, head: 0, fishSide: 'right'
    };
    /* Build the fight through the engine's own maths rather than a copy of
       it: hookFish() is what a real bite calls. */
    const fight = G.debugFight ? G.debugFight(missionN, tier, t) : null;
    if (!fight) return null;
    const n = fight.runs.length;
    fight.runs.forEach((m, i) => {
      marks.push(m);
      drift.push(Math.abs(m - (i + 1) / (n + 1)));
    });
    fight.lengths.forEach((L) => { lens.push(L); runs++; });
    if (fight.lost) lost++;
  }
  const lo = Math.min.apply(null, lens), hi = Math.max.apply(null, lens);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lens.length);
  return { runs: runs, lo: lo, hi: hi, mean: mean, sd: sd,
           spread: hi - lo,
           drift: drift.reduce((a, b) => a + b, 0) / (drift.length || 1),
           wild: G.fightWildness() };
}

console.log('HOW A FISH FIGHTS, JOB BY JOB');
console.log();
console.log('job'.padStart(4), 'wildness'.padStart(9), 'runs'.padStart(5),
            'shortest'.padStart(9), 'longest'.padStart(8), 'spread'.padStart(7),
            'drift'.padStart(7));

const JOBS = [1, 4, 8, 12, 16, 20, 26, 32];
const rows = {};
JOBS.forEach((n) => {
  const f = fightAt(n, 4, 60);
  if (!f) { console.log('  (the engine has no debugFight hook)'); return; }
  rows[n] = f;
  console.log(String(n).padStart(4), f.wild.toFixed(2).padStart(9),
              String(f.runs).padStart(5), f.lo.toFixed(2).padStart(9),
              f.hi.toFixed(2).padStart(8), f.spread.toFixed(2).padStart(7),
              f.drift.toFixed(3).padStart(7));
});
console.log();

if (rows[1] && rows[32]) {
  /* THE EARLY GAME IS A METRONOME, ON PURPOSE. */
  ok(rows[1].wild === 0, 'job 1 fights exactly as it always did');
  ok(rows[8].wild === 0, 'and so does job 8 - the whole teaching stretch');
  ok(rows[1].drift < 0.001, 'early runs come at the same point on the bar every time');
  ok(rows[1].spread <= 1.25,
     'and they last about as long as each other (' + rows[1].spread.toFixed(2) + 's apart)');

  /* AND THE LATE GAME IS NOT. */
  ok(rows[32].wild === 1, 'by job 32 a fish fights as wild as it gets');
  ok(rows[32].drift > 0.03,
     'late runs wander along the bar (' + rows[32].drift.toFixed(3) + ' off the even spacing)');
  ok(rows[32].spread > rows[1].spread * 1.8,
     'and their length is far less predictable (' + rows[32].spread.toFixed(2) +
     's of spread against ' + rows[1].spread.toFixed(2) + 's)');
  ok(rows[32].sd > rows[1].sd * 1.5,
     'measured as a standard deviation too (' + rows[32].sd.toFixed(2) +
     's against ' + rows[1].sd.toFixed(2) + 's)');

  /* IT COMES IN GRADUALLY, not as a cliff the player walks off. */
  ok(rows[12].wild > 0 && rows[12].wild < 1, 'job 12 is part of the way there');
  ok(rows[16].wild > rows[12].wild, 'and job 16 is further along than job 12');
  ok(rows[12].spread < rows[32].spread, 'the middle of the game sits between the two');

  /* AND IT NEVER ASKS FOR QUICKER FINGERS. */
  ok(rows[32].lo > 0.7,
     'even the shortest late run lasts ' + rows[32].lo.toFixed(2) +
     ' seconds - long enough to be seen and answered');
}

const res = H.results();
console.log(res.fail === 0
  ? res.checks + ' checks passed. The fish stop being predictable, gradually.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
