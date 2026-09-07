/**
 * Does a hull wear out, and does the boat say so in time?
 *
 *     node tools/hullcheck.js
 *
 * Asked for: "the kayak should maybe take a little more damage each time it
 * goes out - maybe ticks on a timer every 3 minutes, 1 health point down, and
 * it gives you a warning if your boat is needing repairs soon."
 *
 * Wear was distance only, so an afternoon sat over one shoal with a magnet
 * down cost a hull nothing at all. Four things to hold:
 *
 *   THREE MINUTES IS A POINT. Measured against the clock, not read out of a
 *   constant - the constant could be right and unwired.
 *
 *   A RENTAL WEARS NOTHING. The canoe is Walt's; there is nothing on it that
 *   is yours to repair, and it must not quietly start costing money.
 *
 *   IT SAYS SO, TWICE, ONCE EACH. A meter on a card in a shop is no warning
 *   for somebody listening rather than reading. Twice on the way down, and
 *   never again in the same trip, or it is a nag.
 *
 *   AND IT IS NEVER A FAIL STATE. A worn hull is a slower boat. Anything that
 *   could strand a player out on the water would turn a wear meter into a way
 *   to lose, which this game does not have.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

const DT = 1 / 30;
const E = RT.economy;
ok(!!(E && E.soak), 'the hull knows about time as well as distance');

/* ── Three minutes afloat, on the clock ──────────────────────────────── */
console.log('WHAT THREE MINUTES IN THE WATER COSTS');
[['kayak', 1.0], ['motorboat', 1.2], ['canoe', 0]].forEach(function (pair) {
  const id = pair[0], rate = pair[1];
  E.load({ fuel: 1, wear: 0, debt: 0 });
  const v = (RT.content.roster.vessels || []).find(function (q) { return q.id === id; }) || {};
  if (v.durability) for (let i = 0; i < 180 * 30; i++) E.soak(DT, v.wearRate);
  const pts = E.status().wear * 100;
  console.log('  ' + id.padEnd(10) + (v.durability ? '' : '(a rental - nothing of yours to wear) ') +
              pts.toFixed(2) + ' points');
  if (v.durability) {
    ok(Math.abs(pts - rate) < 0.05,
       id + ': three minutes costs about ' + rate + ' point (' + pts.toFixed(2) + ')');
  } else {
    ok(pts === 0, id + ': a rental wears nothing you pay for');
  }
});

/* ── A trip's worth, so the number means something ───────────────────── */
E.load({ fuel: 1, wear: 0, debt: 0 });
for (let i = 0; i < 30 * 60 * 30; i++) E.soak(DT, 1);
console.log('  half an hour afloat in the kayak: ' + (E.status().wear * 100).toFixed(0) +
            ' points, and Walt wants $' + E.repairPrice() + ' for it');
ok(E.status().wear > 0.08 && E.status().wear < 0.2,
   'half an hour on the water is felt, and is not the whole hull');

/* ── THE DEEP HALF IS HARD ON A HULL ─────────────────────────────────────
   Asked for: past the log jam a hull should take about five times the wear,
   "just because we are out there" - so a repair tab is something to plan for
   rather than a rounding error. The shallow bay is untouched, because the
   first twenty jobs should not get harder for a rule about the last ten. */
console.log();
console.log('HOW HARD THE WATER IS ON A HULL');
const bar0 = (G.mapState().chart.barriers || [])[0];
ok(!!bar0, 'the lake has a line where the deep half starts');
if (bar0) {
  const at = function (x, z) { return G.debugWearFactor(x, z); };
  console.log('  the shallow bay        x' + at(0, -600).toFixed(1));
  console.log('  the channel itself     x' + at(bar0.gapX, bar0.z).toFixed(1));
  console.log('  past the timber        x' + at(0, bar0.z - 200).toFixed(1));
  console.log('  the trench             x' + at(676, -1900).toFixed(1));
  ok(Math.abs(at(0, -600) - 1) < 0.01, 'the bay is as easy on a boat as it ever was');
  ok(at(0, bar0.z - 200) >= 4.5, 'past the jam it is about five times as hard (x' +
     at(0, bar0.z - 200).toFixed(1) + ')');
  /* Ten minutes out there, in dollars, so the number means something. */
  E.load({ fuel: 1, wear: 0, debt: 0 });
  for (let i = 0; i < 30 * 600; i++) E.soak(DT, 1 * at(0, bar0.z - 200));
  console.log('  ten minutes past the jam: ' + (E.status().wear * 100).toFixed(0) +
              ' points, $' + E.repairPrice() + ' of work');
  ok(E.status().wear > 0.12, 'and ten minutes out there is a bill worth noticing');
  E.load({ fuel: 1, wear: 0, debt: 0 });
}

/* ── The warning, out on the water ───────────────────────────────────── */
console.log();
console.log('WHAT THE BOAT SAYS ON THE WAY DOWN');
const sv = G.getSave();
sv.money += 4000;
['bamboo_rod', 'fiber_rod'].forEach(r => { if (!sv.rods.includes(r)) sv.rods.push(r); });
['canoe', 'kayak'].forEach(v => { if (!sv.vessels.includes(v)) sv.vessels.push(v); });
sv.vessel = 'kayak';
sv.currentMission = 16;
sv.briefed = 99;
const said = [];
G.callbacks.onSpeak = (t) => { if (/hull|bad way|Walt should/i.test(String(t))) said.push(String(t)); };
/* Wound forward to just under each threshold rather than paddled up to it:
   the second warning is thirty points past the first, which is an hour and a
   half of lake, and what is being checked is that it fires - not how long a
   kayak takes to get there, which the clock above already measured. */
E.load({ fuel: 1, wear: 0.44, debt: 0 });
G.goToDock();
G.castOff();
function sail(mins) {
  for (let f = 0; f < 30 * 60 * mins; f++) {
    G.setSteer(0);
    G.update(DT);
    if (G.isSteering() && G.chooseTroll) G.chooseTroll();
  }
}
sail(4);
const afterFirst = said.length;
E.load({ fuel: 1, wear: 0.74, debt: 0 });
sail(3);
console.log('  (the first warning came at 45 points, the second at 75)');
said.forEach(function (t) { console.log('  "' + t + '"'); });
ok(afterFirst >= 1, 'it speaks up when the hull starts to want attention');
ok(said.length >= 2, 'and again when it is getting serious (' + said.length + ' in all)');
const twice = said.filter(function (t, i) { return said.indexOf(t) !== i; });
ok(twice.length === 0, 'and never says the same warning twice in one trip');

/* ── And a bad hull is slow, not broken ──────────────────────────────── */
console.log();
E.load({ fuel: 1, wear: 1, debt: 0 });
const st = E.status();
console.log('  a wrecked hull: speed x' + st.speedFactor.toFixed(2) +
            ', condition "' + st.wearWord + '", $' + st.repairPrice + ' to put right');
ok(st.speedFactor >= 0.75, 'a wrecked hull still moves (x' + st.speedFactor.toFixed(2) + ')');
ok(st.repairPrice > 0 && st.repairPrice < 250,
   'and putting it right costs less than a new boat ($' + st.repairPrice + ')');
E.load({ fuel: 1, wear: 0, debt: 0 });

/* ── A PATCH IS A PATCH, WHOEVER PAID FOR IT ─────────────────────────────
   Reported: "mission 20 was repair the kayak but I did that through Walt, and
   when I went to the tackle shop it still said I have repairs to do."

   Paying at the counter records a repair (save.repairs); Walt patching the
   hull as a job reward went straight to the economy and recorded nothing. So
   "Kayak Care" was satisfied only by the hull HAPPENING to be sound - scuff it
   on the next trip and the job asked again. Both routes are checked here, and
   both are then scuffed, because the second trip is where it showed. */
console.log();
console.log('A REPAIR STAYS DONE');
(function () {
  const m = (RT.quests.build().missions || []).find(function (x) { return x.id === 'q19'; });
  const line = function () {
    return String(G.turnInState().progressText).replace(/<[^>]*>/g, '').trim();
  };
  const arrange = function (money) {
    const sv = G.getSave();
    sv.currentMission = m.n; sv.highestMission = m.n; sv.briefed = 99;
    sv.repairs = 0; sv.money = money;
    sv.rods = ['hand_net', 'bamboo_rod']; sv.baits = ['earthworm'];
    sv.tools = ['tagging_tool']; sv.vessels = ['foot', 'canoe', 'kayak']; sv.vessel = 'kayak';
    RT.economy.load({ fuel: 1, wear: 0.5, debt: 0 });
  };
  [['paid at the counter', function () { G.buyRepair(RT.economy.repairPrice()); }],
   ['patched by Walt, on the house', function () {
      /* Exactly what grantRewards does for a job carrying reward.repair. */
      const paid = RT.economy.repairPrice();
      RT.economy.buyRepair(paid);
      const sv = G.getSave();
      sv.repairs = (sv.repairs || 0) + 1;
   }]].forEach(function (pair) {
    arrange(300);
    ok(line() !== 'Patched', pair[0] + ': not patched to begin with');
    pair[1]();
    ok(line() === 'Patched', pair[0] + ': reads as patched');
    /* Out again, and scuffed. */
    RT.economy.load({ fuel: 1, wear: 0.45, debt: 0 });
    console.log('  ' + pair[0].padEnd(32) + 'after scuffing her again: "' + line() + '"');
    ok(line() === 'Patched', pair[0] + ': STAYS patched after the hull wears again');
    ok(G.turnInState().canTurnIn, pair[0] + ': and can still be handed in');
  });
})();

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. A hull wears, and says so while it can still be helped.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
