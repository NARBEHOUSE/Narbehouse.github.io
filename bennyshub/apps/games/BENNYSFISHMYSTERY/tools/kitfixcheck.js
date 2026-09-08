/**
 * Can the box be put right at the slip?
 *
 *     node tools/kitfixcheck.js  [--verbose]
 *
 * The tackle box is on the wall INSIDE the shop, so a warning that says "this
 * one needs a magnet" used to mean going in, finding the box, finding the
 * tray, choosing, and coming back out. That round trip is where a player who
 * has trouble holding on to what they set out to do loses the job.
 *
 * So the warning now offers to do it there and then - but only out of what is
 * already owned, because a lure that has not been bought really is only in
 * the shop. This walks the whole ladder, breaks the box in every way the
 * check knows how to complain about, and asks three things of the answer:
 *
 *   it WORKS      - after fitting it, kitCheck() is happy
 *   it is HONEST  - nothing is offered that has to be bought first
 *   it is QUIET   - looking for it does not change what is in the boat
 *
 * The third is the one worth a tool of its own: the search packs the box over
 * and over to try combinations, and if it ever forgets to put it back, asking
 * "can this be fixed?" would silently re-rig the boat.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;
const VERBOSE = process.argv.indexOf('--verbose') >= 0;

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

const sv = G.getSave();
const TOTAL = (G.missionCount && G.missionCount()) || 40;

/* The locker, stocked two ways.
   FULL is a player who has worked the whole ladder and owns the lot: the case
   where the slip really ought to be able to sort it out. LEAN is early doors -
   one rod, one lure, no magnet - and is there to prove the offer stays silent
   when the shop genuinely is the answer. Taken from the roster rather than
   written out here, so a new lure cannot quietly go untested. */
const ROSTER = require('../content/roster.json');
const ALL_RODS  = (ROSTER.rods  || []).map(r => r.id);
const ALL_BAITS = (ROSTER.baits || []).map(b => b.id);
const ALL_MAGS  = (ROSTER.tools || []).filter(t => t.kind === 'magnet').map(t => t.id);

function stock(n, how) {
  sv.currentMission = n;
  sv.highestMission = Math.max(sv.highestMission || 1, n);
  sv.money = 5000;
  if (how === 'lean') {
    sv.rods  = ['hand_net', 'bamboo_rod'].filter(id => ALL_RODS.indexOf(id) >= 0);
    sv.baits = ALL_BAITS.slice(0, 1);
    sv.tools = [];
    sv.gear  = {};
  } else {
    sv.rods  = ALL_RODS.slice();
    sv.baits = ALL_BAITS.slice();
    sv.tools = (ROSTER.tools || []).map(t => t.id);
    sv.gear  = {};
  }
}

function kitOf() {
  return { rod: (G.equippedRod() || {}).id || '',
           bait: (G.equippedBait() || {}).id || '',
           tool: (G.equippedTool() || {}).id || '' };
}
const sameKit = (a, b) => a.rod === b.rod && a.bait === b.bait && a.tool === b.tool;

/* The ways the box can be wrong, each of them something a real player does:
   set out with the net on, with a magnet on a fish job, with a lure on a
   magnet job, with the shortest rod. */
const BREAKS = [
  { tag: 'net on', apply: () => {
      const net = (G.shopRods() || []).find(r => r.isNet);
      if (!net) return false; G.equipKit(net.id, undefined, undefined); return true; } },
  { tag: 'magnet on', apply: () => {
      const m = (G.shopTools() || [])[0];
      if (!m) return false; G.equipKit(undefined, undefined, m.id); return true; } },
  { tag: 'first lure on', apply: () => {
      const b = (G.shopBaits() || [])[0];
      if (!b) return false; G.equipKit(undefined, b.id, undefined); return true; } },
  { tag: 'shortest rod', apply: () => {
      const rods = (G.shopRods() || []).filter(r => !r.isNet);
      if (!rods.length) return false;
      rods.sort((a, b) => (a.reachFt || 0) - (b.reachFt || 0));
      G.equipKit(rods[0].id, undefined, undefined); return true; } },
];

let broken = 0, offered = 0, fixed = 0;
let failWorks = [], failHonest = [], failQuiet = [], failNull = [];

for (let n = 1; n <= TOTAL; n++) {
  stock(n, 'full');
  for (const brk of BREAKS) {
    /* Fresh kit each time, then break it this one way. */
    G.equipKit('', '', '');
    if (!brk.apply()) continue;

    const before = kitOf();
    const bad = G.kitCheck();
    if (!bad || bad.ok) continue;          // this break does not upset this job
    broken++;

    /* QUIET: asking must not re-rig the boat. */
    const fix = G.kitFix();
    const after = kitOf();
    if (!sameKit(before, after)) {
      failQuiet.push('job ' + n + ' (' + brk.tag + '): the box changed just by asking');
    }

    if (!fix) {
      /* Fair only if nothing owned could have done it. Proven by brute force
         over the locker rather than taken on trust. */
      let couldHave = null;
      const rods = G.shopRods() || [], baits = G.shopBaits() || [], tools = G.shopTools() || [];
      const lines = [{}].concat(baits.map(b => ({ baitId: b.id })),
                                tools.map(t => ({ toolId: t.id })));
      for (const r of rods) {
        for (const L of lines) {
          if (L.toolId) G.equipKit(r.id, undefined, L.toolId);
          else if (L.baitId) G.equipKit(r.id, L.baitId, undefined);
          else G.equipKit(r.id, '', '');
          const c = G.kitCheck();
          /* null means the job asks nothing of the box - a pass, not a fail. */
          if (!c || c.ok) { couldHave = r.id + '/' + (L.baitId || L.toolId || 'auto'); break; }
        }
        if (couldHave) break;
      }
      if (couldHave) {
        failNull.push('job ' + n + ' (' + brk.tag + '): said nothing owned would do, but ' +
                      couldHave + ' does');
      }
      continue;
    }
    offered++;

    /* HONEST: only ever gear that is already owned. */
    if (fix.rodId && !G.ownsRod(fix.rodId)) {
      failHonest.push('job ' + n + ' (' + brk.tag + '): offered a rod not owned');
    }
    if (fix.baitId && !G.ownsBait(fix.baitId)) {
      failHonest.push('job ' + n + ' (' + brk.tag + '): offered a lure not owned');
    }
    if (fix.toolId && !G.ownsTool(fix.toolId)) {
      failHonest.push('job ' + n + ' (' + brk.tag + '): offered a magnet not owned');
    }

    /* WORKS: fit it, and the check is happy. */
    G.applyKitFix(fix);
    const now = G.kitCheck();
    if (!now || now.ok) {
      fixed++;
      if (VERBOSE) console.log('  job ' + String(n).padStart(2) + '  ' + brk.tag.padEnd(14) +
                               '-> ' + fix.label);
    } else {
      failWorks.push('job ' + n + ' (' + brk.tag + '): "' + fix.label +
                     '" left it still wrong: ' + ((now && now.why) || '?'));
    }

    /* And it must actually have MOVED something - a row that offers to fit
       what is already in the boat is a row that does nothing. */
    if (!fix.rodMoves && !fix.lineMoves) {
      failWorks.push('job ' + n + ' (' + brk.tag + '): offered a change that changes nothing');
    }
  }
}

console.log();
console.log('boxes broken on purpose : ' + broken);
console.log('a fix offered for       : ' + offered);
console.log('and it worked           : ' + fixed);
console.log();

ok(broken > 20, 'the ladder actually produces wrong-kit warnings to answer (' + broken + ')');
ok(offered > 0, 'the slip can put at least some of them right (' + offered + ')');
ok(failWorks.length === 0,
   'every fix offered leaves the box right' +
   (failWorks.length ? ':\n    ' + failWorks.slice(0, 6).join('\n    ') : ''));
ok(failHonest.length === 0,
   'nothing is offered that has not been bought' +
   (failHonest.length ? ':\n    ' + failHonest.slice(0, 6).join('\n    ') : ''));
ok(failQuiet.length === 0,
   'asking whether it can be fixed does not re-rig the boat' +
   (failQuiet.length ? ':\n    ' + failQuiet.slice(0, 6).join('\n    ') : ''));
ok(failNull.length === 0,
   'it never sends you to the shop for something already in the box' +
   (failNull.length ? ':\n    ' + failNull.slice(0, 6).join('\n    ') : ''));

/* ── THE RIGHT LURE, NOT MERELY A LEGAL ONE ───────────────────────────────
   kitCheck() is a MINIMUM: it asks whether the box can do the job at all.
   So a fix that merely satisfies it can still be the wrong box, and was -
   the card packed a Deep Rig for the cisco job, which is legal and is not
   something a cisco would look at. Reported as "make sure when that card
   gives me my equipment it gives me the right stuff - that means the right
   lure."

   The rule is read off the roster rather than out of the game, so this is a
   check and not an echo: the lure for a fish is the one with the highest
   bias for it. */
(function () {
  const wantedLure = {};
  (ROSTER.baits || []).forEach(function (b) {
    Object.keys(b.bias || {}).forEach(function (sp) {
      if (!wantedLure[sp] || b.bias[sp] > wantedLure[sp].w) {
        wantedLure[sp] = { id: b.id, w: b.bias[sp] };
      }
    });
  });

  const wrongLure = [];
  let asked = 0;
  for (let n = 1; n <= TOTAL; n++) {
    const m = G.missionByN && G.missionByN(n);
    const sp = m && m.target && m.target.speciesId;
    const want = sp && wantedLure[sp];
    if (!want) continue;                       // a fish with no lure of its own
    stock(n, 'full');
    /* Set out with the WRONG lure on: whichever owned one is not this job's. */
    const other = ALL_BAITS.filter(function (id) { return id !== want.id; })[0];
    G.equipKit('', other, undefined);
    const bad = G.kitCheck();
    if (!bad || bad.ok) continue;              // the job does not mind: fair
    asked++;
    const fix = G.kitFix();
    if (!fix) { wrongLure.push('job ' + n + ' (' + sp + '): offered nothing at all'); continue; }
    G.applyKitFix(fix);
    const on = G.equippedBait().id;
    if (on !== want.id) {
      wrongLure.push('job ' + n + ' (' + sp + '): wanted the ' + want.id +
                     ', the card fitted the ' + on);
    } else if (VERBOSE) {
      console.log('  job ' + String(n).padStart(2) + '  ' + sp.padEnd(12) + '-> ' + on);
    }
  }
  ok(asked > 0, 'there are jobs whose fish has a lure of its own (' + asked + ')');
  ok(wrongLure.length === 0,
     'and the card fits THAT lure, not just one the check will accept' +
     (wrongLure.length ? ':\n    ' + wrongLure.slice(0, 6).join('\n    ') : ''));
})();

/* ── AND THE FISH IS ACTUALLY IN THE WATER ────────────────────────────────
   The check above is about the lure named on the tin. This one is about
   whether the job can be DONE: with the kit the game itself packs, how much
   of what bites in that job's water is the fish you were sent for?

   Job 32 is why this exists. It asks for three cisco in the cold layer; the
   lure the game packed was the Deep Rig, whose bias for lake trout is 50
   against a cisco's nothing, so the trench came up 98% lake trout. Reported
   as "I only caught 10 lake trout - I do not think I ever caught a cisco in
   this game", and no warning anywhere said a word, because the box was
   perfectly legal. A share is the number that says it. */
(function () {
  const T = G.__test;
  if (!T || !T.biteWeightedFishPool || !T.targetBiomes) {
    ok(false, 'the bite pool can be measured'); return;
  }
  /* One in ten. Below that a job is a grind that reads as a broken game -
     three cisco at two percent is a hundred and fifty casts. */
  const FLOOR = 10;
  const starved = [];
  let audited = 0;
  for (let n = 1; n <= TOTAL; n++) {
    const m = G.missionByN && G.missionByN(n);
    const sp = m && m.target && m.target.speciesId;
    if (!sp) continue;
    stock(n, 'full');
    G.equipKit('', '', '');                    // whatever the game itself packs
    const bait = G.equippedBait().id, rod = G.equippedRod().id;
    let best = 0, where = '';
    (T.targetBiomes(m) || []).forEach(function (b) {
      const pool = T.biteWeightedFishPool(b, bait, rod) || [];
      const tot = pool.reduce(function (s, x) { return s + x.w; }, 0);
      const mine = pool.filter(function (x) { return x.f.id === sp; })
                       .reduce(function (s, x) { return s + x.w; }, 0);
      const share = tot ? 100 * mine / tot : 0;
      if (share > best) { best = share; where = b; }
    });
    audited++;
    if (VERBOSE) {
      console.log('  job ' + String(n).padStart(2) + '  ' + sp.padEnd(12) +
                  bait.padEnd(14) + best.toFixed(1) + '% of the ' + (where || 'water'));
    }
    if (best < FLOOR) {
      starved.push('job ' + n + ': ' + sp + ' is ' + best.toFixed(1) + '% of what bites on the ' +
                   bait + ' - that is ' + Math.round(100 / Math.max(best, 0.1)) + ' casts a fish');
    }
  }
  ok(audited > 8, 'there are species jobs to audit (' + audited + ')');
  ok(starved.length === 0,
     'the fish a job asks for is at least ' + FLOOR + '% of what bites in its water' +
     (starved.length ? ':\n    ' + starved.join('\n    ') : ''));
})();

/* AND THE OTHER HALF OF THE PROMISE: when the answer really is in the shop,
   the slip must NOT pretend otherwise. Strip the locker to one rod and one
   lure at a job that wants a magnet, and there must be no offer. */
(function () {
  const magJob = (function () {
    for (let n = 1; n <= TOTAL; n++) {
      sv.currentMission = n;
      const w = G.jobWants && G.jobWants();
      if (w && w.kind === 'magnet') return n;
    }
    return 0;
  })();
  if (!magJob) { ok(true, '(no magnet job in this ladder to test the empty locker on)'); return; }
  stock(magJob, 'lean');
  G.equipKit('', (G.shopBaits()[0] || {}).id || '', undefined);
  const bad = G.kitCheck();
  const fix = G.kitFix();
  ok(bad && !bad.ok, 'a magnet job with no magnet owned still warns (job ' + magJob + ')');
  ok(!fix, 'and offers nothing, because the shop is genuinely the only answer');
})();

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. The box can be put right where you are standing.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
