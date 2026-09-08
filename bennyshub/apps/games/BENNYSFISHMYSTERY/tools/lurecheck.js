/**
 * Does the lure matter, and can you always get the one you need?
 *
 *     node tools/lurecheck.js
 *
 * The roster has five lures and four of them are made for one species -
 * shiners for bass, a spoon for pike, stink bait for catfish, a deep rig for
 * lake trout. Every one of them was unreachable: Walt's shelf offers the lure
 * the job in hand names, and no job in the ladder named one, so nothing was
 * ever for sale and the whole game was fished on free worms under a bobber.
 *
 * The rule now is the one anybody would guess - the fish decides the lure,
 * the rod decides what you can hold once it bites - and a rule like that
 * turns straight into a wall if the lure is not on the shelf by the time the
 * job asks for the fish. So this checks both halves: that the lure is
 * required, and that it can always be had.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });
const sv = G.getSave();

/* ── EVERY LURE IS REACHABLE ──────────────────────────────────────────── */
const lures = (RT.content.roster.baits || []);
const sold = {};
(RT.content.quests.quests || RT.content.quests || []).forEach(q => {
  (q.sells || []).forEach(id => { sold[id] = q.n || q.id; });
});
console.log('THE LURES');
lures.forEach(b => {
  const where = b.free ? 'free with the rod' : (sold[b.id] ? ('on the shelf at job ' + sold[b.id]) : 'NEVER FOR SALE');
  console.log('  ' + String(b.id).padEnd(13) + (b.float === false ? 'no float  ' : 'float     ') +
              where);
});
lures.forEach(b => ok(b.free || !!sold[b.id], b.name + ' can actually be bought'));

/* ── THE FISH DECIDES THE LURE ────────────────────────────────────────── */
console.log();
console.log('WHAT EACH JOB\'S FISH TAKES');
let walls = 0, gated = 0;
for (let n = 1; n <= 35; n++) {
  sv.briefed = 99; sv.currentMission = n; sv.highestMission = n; sv.money = 99999;
  const m = G.currentMission();
  const t = (m && m.target) || {};
  if (!t.speciesId) continue;
  const want = G.jobLure && G.jobLure();
  if (!want) continue;
  gated++;
  const shelf = G.nextBait();
  const buyable = !!(shelf && shelf.id === want.id) || G.ownsBait(want.id);
  if (!buyable) walls++;
  console.log('  job ' + String(n).padStart(2) + '  ' + String(t.speciesId).padEnd(11) +
              ' needs ' + String(want.id).padEnd(13) +
              (buyable ? 'and it is on the shelf' : 'AND IT IS NOT FOR SALE'));
}
ok(gated > 0, 'the lure is actually asked for somewhere (' + gated + ' jobs)');
ok(walls === 0, 'and no job asks for a lure you cannot buy yet (' + walls + ' walls)');

/* ── AND THE WORM STILL CATCHES THE FIRST HOUR'S FISH ─────────────────── */
console.log();
const panfish = ['sunfish', 'perch', 'crappie'];
panfish.forEach(id => {
  const need = (RT.content.roster.baits || []).some(b => b.bias && b.bias[id]);
  ok(!need, 'a ' + id + ' still takes a worm - no lure is named after it');
});

/* ── A LURE WITH NO FLOAT DOES NOT FLOAT ──────────────────────────────── */
sv.briefed = 99; sv.currentMission = 23; sv.highestMission = 35; sv.money = 99999;
(RT.content.roster.rods || []).forEach(r => { if (!sv.rods.includes(r.id)) sv.rods.push(r.id); });
(RT.content.roster.vessels || []).forEach(v => { if (!sv.vessels.includes(v.id)) sv.vessels.push(v.id); });
lures.forEach(b => { if (!sv.baits.includes(b.id)) sv.baits.push(b.id); });

function riseAfterCast(baitId) {
  G.equipKit(undefined, baitId, '');
  G.goToDock(); G.setOnFoot(true); G.castOff();
  for (let i = 0; i < 60; i++) G.update(1 / 30);
  G.startAim();
  for (let i = 0; i < 6; i++) G.update(1 / 30);
  G.beginCharge(); G.setCharging(true);
  for (let i = 0; i < 60; i++) G.update(1 / 30);
  G.setCharging(false); G.releaseCast();
  for (let i = 0; i < 200; i++) G.update(1 / 30);      // land, and let it settle
  const y = RT.scene.rigHeight ? RT.scene.rigHeight() : null;
  G.returnToDock();
  for (let i = 0; i < 20; i++) G.update(1 / 30);
  return y;
}

const onFloat = riseAfterCast('earthworm');
const onDeep  = riseAfterCast('deep_rig');
console.log('a worm under a float rides at y ' + (onFloat === null ? '(unknown)' : onFloat.toFixed(2)));
console.log('the deep rig rides at        y ' + (onDeep === null ? '(unknown)' : onDeep.toFixed(2)));
if (onFloat !== null && onDeep !== null) {
  ok(onFloat > -0.35, 'a float floats');
  ok(onDeep < onFloat - 0.5, 'and the deep rig is well under it (' +
     (onFloat - onDeep).toFixed(2) + ' units down)');
}

/* ── AND YOU ARE TOLD BEFORE YOU ROW OUT ──────────────────────────────────
   The fish will only take its own lure, and that can waste a whole trip - so
   it is the thing most worth being told at the slip. The check knew about
   rods, nets and magnets and had never heard of lures, which made the one
   unforgiving rule in the game the one nobody was warned about. */
console.log();
console.log('ROWING OUT WITH THE WRONG LURE ON');
const sv4 = G.getSave();
sv4.briefed = 99; sv4.money = 99999;
(RT.content.roster.rods || []).forEach(r => { if (!sv4.rods.includes(r.id)) sv4.rods.push(r.id); });
(RT.content.roster.baits || []).forEach(b => { if (!sv4.baits.includes(b.id)) sv4.baits.push(b.id); });
let warned = 0, silent = [];
for (let n = 1; n <= 35; n++) {
  sv4.currentMission = n; sv4.highestMission = n;
  const m = G.currentMission();
  const t = (m && m.target) || {};
  if (!t.speciesId) continue;
  const want = G.jobLure && G.jobLure();
  if (!want) continue;                        // panfish: a worm is right
  /* A ROD DEEP ENOUGH FOR THIS JOB, so what comes back is about the LURE.
     This used to fit the carbon rod every time. Once jobWants() started
     asking for the depth the JOB counts rather than the depth the fish
     starts at, the carbon rod stopped being enough for the eighty-foot
     trout jobs - and the check read a perfectly correct complaint about the
     rod as a complaint about the lure. */
  const deepRod = (G.shopRods() || [])
    .filter(function (r) { return !r.isNet; })
    .sort(function (a, b) { return (b.reachFt || 0) - (a.reachFt || 0); })[0];
  const rodId = deepRod ? deepRod.id : 'carbon_rod';
  G.equipKit(rodId, 'earthworm', '');
  const wrong = G.kitCheck();
  G.equipKit(rodId, want.id, '');
  const right = G.kitCheck();
  if (wrong && !wrong.ok) warned++; else silent.push(n);
  ok(!!(wrong && !wrong.ok),
     'job ' + n + ': a worm on a ' + t.speciesId + ' job is called out at the slip');
  ok(!right || right.ok,
     'job ' + n + ': and the right lure is not complained about');
}
console.log('  ' + warned + ' jobs warn about the wrong lure' +
            (silent.length ? ', but ' + silent.join(', ') + ' say nothing' : ''));

/* ── AND THE BOX SAYS WHAT EACH LURE IS FOR ───────────────────────────────
   The fish decides the lure, so "which fish is this one for" is the most
   useful thing the tackle box can tell somebody choosing in a hurry - and a
   box that names the wrong fish is the game lying about its own rule. */
console.log();
console.log('WHAT THE TACKLE BOX SAYS');
(RT.content.roster.baits || []).forEach(function (b) {
  const said = (G.lureIsFor && G.lureIsFor(b.id)) || '';
  console.log('  ' + b.name.padEnd(15) + (said || '(says nothing)'));
  ok(!!said, b.name + ' says which fish it is for');
  /* Every fish it names must be one the bias table actually favours - or,
     for the plain bait, one that no lure claims. */
  const bias = b.bias || {};
  const claimed = Object.keys(bias);
  (RT.content.roster.fish || []).forEach(function (f) {
    if (said.toLowerCase().indexOf(f.name.toLowerCase()) < 0) return;
    const mine = claimed.indexOf(f.id) >= 0;
    const nobodys = !(RT.content.roster.baits || []).some(function (x) {
      return x.bias && x.bias[f.id];
    });
    ok(mine || nobodys,
       b.name + ' naming ' + f.name + ' is true of the roster');
  });
});

/* ── AND A LURE YOU BUY IS ON THE LINE ────────────────────────────────────
   Worse than the rod: the fish decides the lure, so stink bait bought and
   left in the tray means the catfish job still cannot be done and the shop
   has taken the money for it. */
console.log();
{
  const sv6 = G.getSave();
  sv6.briefed = 99; sv6.currentMission = 17; sv6.highestMission = 17; sv6.money = 9999;
  sv6.rods = ['bamboo_rod', 'fiber_rod', 'carbon_rod'];
  sv6.baits = ['earthworm'];
  G.equipKit('carbon_rod', 'earthworm', '');
  const before = G.kitCheck();
  const got = G.buyBait('stinkbait');
  const after = G.kitCheck();
  console.log('BUYING THE LURE: ' + G.missionBrief().bait.name + ' on the line, ' +
              'and the slip ' + (after && !after.ok ? 'still complains' : 'is happy'));
  ok(!!(before && !before.ok), 'a worm on the catfish job is complained about');
  ok(!!got, 'and the stink bait can be bought');
  ok(!!(after && after.ok), 'and buying it puts it on the line, so the complaint stops');
}

/* ── A MAGNET ON A FISHING JOB IS A GUARANTEED BLANK ──────────────────────
   No fish will take one - the bite pool filters it out - so it is the worst
   kit you can row out with, and the check used to skip the whole question
   whenever a magnet was on. Reported on the pike job. Every job that counts
   fish must say so, whether it names a species or not. */
console.log();
console.log('ROWING OUT WITH A MAGNET ON');
{
  const sv7 = G.getSave();
  sv7.briefed = 99; sv7.money = 99999;
  (RT.content.roster.rods || []).forEach(r => { if (!sv7.rods.includes(r.id)) sv7.rods.push(r.id); });
  (RT.content.roster.baits || []).forEach(b => { if (!sv7.baits.includes(b.id)) sv7.baits.push(b.id); });
  (RT.content.roster.tools || []).forEach(t => { if (!sv7.tools.includes(t.id)) sv7.tools.push(t.id); });
  let fishJobs = 0, silent = [];
  for (let n = 1; n <= 35; n++) {
    sv7.currentMission = n; sv7.highestMission = n;
    const t = (G.currentMission() || {}).target || {};
    const fishy = !!(t.speciesId || /^catch/.test(t.type || '')) && !t.netOnly;
    if (!fishy) continue;
    fishJobs++;
    G.equipKit('carbon_rod', undefined, 'magnet_1');
    const kc = G.kitCheck();
    if (!(kc && !kc.ok)) silent.push(n);
  }
  console.log('  ' + fishJobs + ' jobs count fish; ' +
              (silent.length ? silent.join(', ') + ' say nothing' : 'every one of them warns'));
  ok(fishJobs > 0, 'there are jobs that count fish');
  ok(silent.length === 0,
     'and every one warns when a magnet is on the line (' + silent.length + ' silent)');
}

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. The fish decides the lure, and the lure can be had.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
