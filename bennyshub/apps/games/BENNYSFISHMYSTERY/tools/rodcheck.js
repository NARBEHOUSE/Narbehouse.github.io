/**
 * Is the rod on your shoulder enough for the job you have been given?
 *
 *     node tools/rodcheck.js
 *
 * A rod worked past its rating loses rigs - three and a half times as often,
 * seven times once you are twenty-five feet over. That is a good rule: it is
 * why the ladder of rods is worth climbing, and it is what makes choosing the
 * kit a decision. It turns into a bad rule the moment the game SENDS you into
 * water your rod cannot take, because then the snapped line is not a choice
 * you made, it is the game wasting your afternoon.
 *
 * Reported on the twelfth job: "I'm supposed to get catfish but I keep
 * breaking my line". Measured, and it was true - a channel catfish lives from
 * twelve feet down to forty-five, the fiber rod on your shoulder at job twelve
 * reaches thirty-five, and the quest helper was picking any catfish shoal it
 * could find.
 *
 * So, for every job that names a fish: is there water for that fish inside
 * the reach of the best rod the ladder has offered by then, and is that where
 * the arrow actually points?
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });
const sv = G.getSave();
const fish = {};
(RT.content.roster.fish || []).forEach(f => { fish[f.id] = f; });

/* ── EVERY ROD HAS A CLASS ────────────────────────────────────────────────
   The class says how much fish a rod can hold. It used to live in a table
   keyed by rod id in js/game.js, and the rods were renamed out from under it:
   every lookup missed, every rod became class three, and buying a
   two-hundred-dollar rod changed nothing whatever. It lives on the rod now. */
console.log('THE RODS');
(RT.content.roster.rods || []).forEach(r => {
  console.log('  ' + r.id.padEnd(12) + ' class ' + (r.rodClass === undefined ? '(NONE)' : r.rodClass) +
              '  reaches ' + (r.rangeFt || 0) + ' ft');
  ok(r.rodClass !== undefined, r.name + ' says how much fish it can hold');
});
console.log();

console.log('job  fish        its water    the rod by then        reach   class   the water it points at');
const tight = [];
for (let n = 1; n <= 35; n++) {
  sv.briefed = 99; sv.currentMission = n; sv.highestMission = n; sv.money = 999999;
  const m = G.currentMission();
  const t = (m && m.target) || {};
  if (!t.speciesId || !fish[t.speciesId]) continue;

  /* Everything Walt will sell by now, bought - the best case for the player,
     which is the case that has to work. Vessels too: the reach of the boat is
     what decides whether the far water is even searched, so a check that
     paddles a canoe to a lake trout job is measuring the wrong thing. */
  for (let g = 0; g < 8; g++) { const r = G.nextRod(); if (!r || !G.buyRod(r.id)) break; }
  for (let g = 0; g < 8; g++) { const v = G.nextVessel(); if (!v || !G.buyVessel(v.id)) break; }
  /* AND WHAT WALT HANDS OVER. The pro rod is not sold, it is given with the
     deep survey - a check that only counts purchases reports the last three
     jobs as impossible. */
  const gift = m.grantsRodId || (m.gives && m.gives.rodId);
  if (gift && G.buyRod) { const sv2 = G.getSave(); if (!sv2.rods.includes(gift)) sv2.rods.push(gift); }
  const rods = (G.shopRods ? G.shopRods() : []).filter(r => !r.isNet);
  const best = rods.sort((a, b) => b.reachFt - a.reachFt)[0];
  const reach = best ? best.reachFt : 0;

  const f = fish[t.speciesId];
  const lo = Math.max(f.depthFt[0], t.minDepthFt || 0);
  const hi = f.depthFt[1];

  /* And where the arrow would actually send you, which is the thing that
     matters: the fish may live deep, but if the helper points at the shallow
     end the rod is fine. */
  G.goToDock(); G.setOnFoot(false); G.castOff();
  for (let i = 0; i < 40; i++) G.update(1 / 30);
  const g2 = G.jobFish && G.jobFish();
  const at = g2 && g2.depthFt !== undefined ? Math.round(g2.depthFt) : null;
  G.returnToDock();
  for (let i = 0; i < 10; i++) G.update(1 / 30);

  /* AND WHETHER IT CAN HOLD IT. A rod under the fish's tier lands it about
     one bite in six, which reads to a player as "something big took that one"
     over and over with no explanation. */
  const cls = (RT.content.roster.rods.find(r => best && r.id === best.id) || {}).rodClass || 3;
  const tier = f.tier || 3;
  console.log(String(n).padStart(3), String(t.speciesId).padEnd(11),
              (lo + '-' + hi + ' ft').padEnd(12),
              String(best ? best.name : '(none)').padEnd(22),
              String(reach + ' ft').padEnd(7),
              (cls + ' v ' + tier).padEnd(7),
              (at === null ? '(nowhere)' : (at + ' ft' + (at > reach ? '  PAST THE ROD' : ''))) +
              (cls < tier ? '   CANNOT HOLD IT' : ''));
  ok(cls >= tier,
     'job ' + n + ': and the ' + (best ? best.name : 'rod') + ' can hold a ' +
     t.speciesId + ' (class ' + cls + ' against tier ' + tier + ')');

  ok(lo <= reach,
     'job ' + n + ': there is ' + t.speciesId + ' water the ' +
     (best ? best.name : 'rod') + ' can reach (' + lo + ' ft vs ' + reach + ' ft)');
  if (at !== null) {
    ok(at <= reach,
       'job ' + n + ': and the arrow points at water it can fish (' + at +
       ' ft vs ' + reach + ' ft)');
    if (at > reach * 0.92) tight.push(n);
  }
}

console.log();
if (tight.length) console.log('close to the limit on jobs: ' + tight.join(', '));

/* ── THE NET IS FOR NETTING JOBS ──────────────────────────────────────────
   Reported as "it says on the mission itself 'hand net'" - the mission note
   shows what you are CARRYING, and a player who still had the net from the
   first morning read it as what the job wanted. It did not want one, and
   worse, the net could not have done it: a net brings up minnows and shiners
   and nothing else, whatever the job is. */
console.log();
console.log('CARRYING THE NET');
const sv3 = G.getSave();
sv3.briefed = 99; sv3.money = 99999;
['hand_net', 'bamboo_rod', 'fiber_rod'].forEach(r => { if (!sv3.rods.includes(r)) sv3.rods.push(r); });
if (!sv3.baits.includes('earthworm')) sv3.baits.push('earthworm');
[[1, true], [4, true], [14, false], [12, false]].forEach(function (pair) {
  const n = pair[0], isNetJob = pair[1];
  sv3.currentMission = n; sv3.highestMission = n;
  G.equipKit('hand_net', 'earthworm', '');
  const withNet = G.kitCheck();
  G.equipKit('fiber_rod', 'earthworm', '');
  const withRod = G.kitCheck();
  console.log('  job ' + String(n).padStart(2) + ' (' + (isNetJob ? 'netting' : 'fishing') + ')' +
              '  net: ' + (withNet && !withNet.ok ? 'warned' : 'fine') +
              '   rod: ' + (withRod && !withRod.ok ? 'warned' : 'fine'));
  if (isNetJob) {
    ok(!withNet || withNet.ok, 'job ' + n + ': the net is right for a netting job');
    ok(withRod && !withRod.ok, 'job ' + n + ': and a rod is called out on one');
  } else {
    ok(withNet && !withNet.ok,
       'job ' + n + ': a net is called out on a fishing job - it can only bring up minnows');
  }
});

/* ── WHAT YOU BUY IS WHAT YOU FISH WITH ───────────────────────────────────
   The tackle box was the only thing that ever recorded which rod is in your
   hands, so buying a better one changed nothing you could see: reported as
   "not sure I knew I had the carbon rod", and quite right - the fiber rod was
   still on his shoulder. */
console.log();
console.log('BUYING A ROD');
{
  const sv5 = G.getSave();
  sv5.briefed = 99; sv5.currentMission = 16; sv5.highestMission = 16; sv5.money = 9999;
  sv5.rods = ['bamboo_rod', 'fiber_rod'];
  sv5.baits = ['earthworm'];
  /* A player who has opened the tackle box once and chosen. */
  G.equipKit('fiber_rod', 'earthworm', '');
  const before = G.missionBrief().rod.name;
  const got = G.buyRod('carbon_rod');
  const after = G.missionBrief().rod.name;
  console.log('  holding ' + before + ', bought the ' + (got ? got.name : '?') +
              ' -> holding ' + after);
  ok(!!got, 'the carbon rod can be bought at job 16');
  ok(after !== before, 'and buying a rod puts it in your hands');
  ok(!!(got && got.inHand), 'and the card can say so');

  /* The net is the one you choose on purpose - a netting job needs it. */
  sv5.rods.push('hand_net');
  G.equipKit('hand_net', 'earthworm', '');
  sv5.currentMission = 1;
  const held = G.missionBrief().rod.name;
  sv5.money = 9999;
  sv5.rods = sv5.rods.filter(function (r) { return r !== 'carbon_rod'; });
  G.buyRod('carbon_rod');
  console.log('  with the net in hand, buying a rod leaves you holding ' +
              G.missionBrief().rod.name);
  ok(G.missionBrief().rod.name === held,
     'but a rod bought with the net in hand does not take the net off you');
}

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. The rod in your hands can fish where you are sent.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
