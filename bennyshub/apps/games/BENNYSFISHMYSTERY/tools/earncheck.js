/**
 * How long does a player have to fish to afford the next thing?
 *
 *     node tools/earncheck.js
 *
 * Measured, not reasoned about: every way of earning, on a real shoal, with
 * the gear that fish wants, travel included - how many dollars a minute.
 *
 * It matters because being short is not a small inconvenience in this game.
 * A player on two switches who needs another forty dollars is looking at ten
 * minutes of identical presses, and that is the whole session for some
 * people. The wallet model in check_content.js only counts job payouts and
 * assumes nobody ever fishes for money; this counts the fishing.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });
const DT = 1 / 30;
const sv = G.getSave();
let card = null, aim = null, charge = null, reel = null;
G.callbacks.onCard = (a) => { const n = a && (a.name || a.which); if (n) card = { name: n }; };
G.callbacks.onAim = (d) => { if (d) aim = d; };
G.callbacks.onCharge = (d) => { if (d) charge = d; };
G.callbacks.onReel = (r) => { reel = r; };

(RT.content.roster.rods || []).forEach(r => { if (!sv.rods.includes(r.id)) sv.rods.push(r.id); });
(RT.content.roster.baits || []).forEach(b => { if (!sv.baits.includes(b.id)) sv.baits.push(b.id); });
(RT.content.roster.tools || []).forEach(t => { if (!sv.tools.includes(t.id)) sv.tools.push(t.id); });
(RT.content.roster.vessels || []).forEach(v => { if (!sv.vessels.includes(v.id)) sv.vessels.push(v.id); });
sv.briefed = 99; sv.highestMission = 35;

function aimAndThrow(needShoal, power) {
  let t = 0;
  G.startAim();
  let g = 0;
  G.setAimSweep(true, 1);
  while (g++ < 300 && !(aim && !aim.onShore && !aim.tooDeep &&
                        (!needShoal || aim.onShoal))) { G.update(DT); t += DT; }
  G.setAimSweep(false);
  charge = null;
  G.beginCharge(); G.setCharging(true);
  let h = 0;
  while (h++ < 400 && !(charge && charge.power >= power &&
                        (!needShoal || charge.onShoal))) { G.update(DT); t += DT; }
  G.setCharging(false); G.releaseCast();
  for (let i = 0; i < 90 && !(G.run && G.run.landing); i++) { G.update(DT); t += DT; }
  return t;
}

function rodCast() {
  let t = aimAndThrow(true, 35);
  card = null;
  let w = 0;
  while (w++ < 30 * 45 && !card && !G.isFighting()) { G.update(DT); t += DT; }
  if (G.isFighting()) {
    G.hookFish(); reel = null;
    let r = 0;
    while (r++ < 30 * 60 && !card) {
      const rr = reel;
      G.setReelHold(!rr || (!rr.running && !rr.warning && rr.strain < 0.35));
      G.update(DT); t += DT;
    }
    G.setReelHold(false);
  }
  return t;
}

function magnetCast() {
  let t = aimAndThrow(false, 88);
  card = null;
  G.setReelHold(true);
  let w = 0;
  while (w++ < 30 * 60 && !card) { G.update(DT); t += DT; }
  G.setReelHold(false);
  return t;
}

function trial(label, mission, rod, bait, tool, onFoot, casts, cast) {
  /* A CLEAN START. Measured: one trial that ended mid-card took the next
     three down with it - nought from fourteen casts, three times running -
     and read as the game being broken rather than the harness being untidy.
     Whatever is open gets closed and the boat goes home before anything
     else. */
  if (G.afterCatchCard) G.afterCatchCard();
  for (let i = 0; i < 20; i++) G.update(DT);
  if (G.isFishing && G.isFishing() && G.chooseTroll) G.chooseTroll();
  for (let i = 0; i < 20; i++) G.update(DT);
  if (G.returnToDock) G.returnToDock();
  for (let i = 0; i < 40; i++) G.update(DT);
  card = null; aim = null; charge = null; reel = null;
  sv.tackleBroken = false;

  sv.currentMission = mission; sv.progressValue = 0;
  G.equipKit(rod, bait, tool === undefined ? '' : tool);
  G.goToDock(); G.setOnFoot(!!onFoot); G.castOff();
  for (let i = 0; i < 60; i++) G.update(DT);
  let t = 0;
  if (!onFoot) {
    /* Out to the water this trial is about, the way the helper takes you. */
    let steps = 0;
    while (steps++ < 30 * 240) {
      const gg = G.jobFish && G.jobFish();
      if (!gg || Math.hypot(gg.x - G.run.x, gg.z - G.run.z) <= G.spotOffer()) break;
      G.update(DT); t += DT;
    }
    let stopped = false;
    for (const side of ['right', 'left']) {
      const sp = G.__spotToEnter && G.__spotToEnter(side);
      if (sp && !sp.open) {
        G.pullOverTo(side);
        for (let i = 0; i < 600 && !G.isFishing(); i++) { G.update(DT); t += DT; }
        stopped = G.isFishing();
        break;
      }
    }
    if (!stopped) { console.log('  ' + label.padEnd(26) + 'could not stop there'); return null; }
  }
  let landed = 0;
  for (let c = 0; c < casts; c++) {
    /* A NEW HOOK, FREE, THE WAY WALT GIVES THEM. A rig lost to whatever lives
       out there refuses every cast after it until somebody goes back to the
       counter - measured, one snap turned the rest of a run into nought from
       fourteen and read as the lake being empty. The walk back is real and
       costs a trip; it is not what this is measuring. */
    sv.tackleBroken = false;
    t += cast();
    if (card && (card.name === 'catchreveal' || card.name === 'dingusreveal')) landed++;
    if (G.afterCatchCard) G.afterCatchCard();
    for (let i = 0; i < 8; i++) { G.update(DT); t += DT; }
  }
  const before = sv.money;
  if (G.sellCatch) G.sellCatch();
  const worth = sv.money - before;
  const perMin = t > 0 ? worth / (t / 60) : 0;
  console.log('  ' + label.padEnd(26) + '$' + String(worth).padEnd(4) + ' from ' +
              String(landed).padStart(2) + '/' + casts + ' casts in ' +
              t.toFixed(0).padStart(4) + 's  = $' + perMin.toFixed(1).padStart(5) + ' a minute');
  return { label, perMin };
}

console.log('WHAT AN HOUR ON THE WATER IS WORTH');
console.log();
const rows = [];
[
  /* A DOZEN CASTS, not eight. Eight was enough to see the shape and not
     enough to stop the check failing on an unlucky afternoon - and a check
     that cries wolf is worse than no check, because the next real failure
     gets shrugged at. */
  ['off the dock, worm',   2,  'bamboo_rod', 'earthworm',   '', true,  14, rodCast],
  ['bass, live shiners',   6,  'fiber_rod',  'shiner_bait', '', false, 14, rodCast],
  ['pike, silver spoon',   16, 'carbon_rod', 'spoon',       '', false, 14, rodCast],
  ['lake trout, deep rig', 23, 'pro_rod',    'deep_rig',    '', false, 14, rodCast],
  ['the magnet, open water', 24, 'carbon_rod', undefined, 'magnet_1', false, 18, magnetCast],
].forEach(a => { const r = trial.apply(null, a); if (r) rows.push(r); });

console.log();
rows.sort((a, b) => b.perMin - a.perMin);
rows.forEach(r => console.log('  $' + r.perMin.toFixed(1).padStart(5) + ' a minute   ' + r.label));

const best = rows[0] ? rows[0].perMin : 0;
const worst = rows.length ? rows[rows.length - 1].perMin : 0;
console.log();
/* FORTY DOLLARS IS THE TEST. That is roughly what a player is short by when
   the shop has something they cannot afford, and it is the moment the game
   either carries on or turns into a chore. */
const mins = best > 0 ? 40 / best : 999;
console.log('being $40 short costs about ' + mins.toFixed(1) + ' minutes of fishing');
ok(best > 0, 'there is a way to earn money at all');
ok(mins <= 5, 'and being forty dollars short is not a chore (' + mins.toFixed(1) + ' min)');
ok(worst > 1.5, 'no way of fishing is a waste of time (worst: $' +
   worst.toFixed(1) + ' a minute)');

/* ── A BOAT IS EARNED, NOT BROWSED ───────────────────────────────────────
   Reported: "I got the canoe early - I was supposed to catch fish for that
   mission first." A job's stock reaches the counter when the job STARTS,
   which is right for a rod you need in order to do the job and wrong for the
   three jobs named for saving up: The Canoe Fund, The Kayak Goal, Motorboat
   Savings. The canoe is twenty dollars against the ninety-five you already
   have, so she was simply handed over as the job began, and the job then
   still wanted its five fish for a boat tied up at the dock.

   Asked of all three, on the job before, during, and after - because the
   whole point is WHEN. */
console.log();
console.log('WHEN EACH BOAT REACHES THE COUNTER');
const ROD = ['hand_net', 'bamboo_rod', 'fiber_rod', 'carbon_rod', 'pro_rod'];
const BAIT = ['earthworm', 'shiner_bait', 'stinkbait', 'spoon', 'deep_rig'];
const TOOL = ['tagging_tool', 'magnet_1', 'magnet_2', 'heavy_magnet', 'acoustic_sonar'];
(RT.content.quests.quests || []).forEach(function (q) {
  const boats = (q.sells || []).filter(function (id) {
    return (RT.content.roster.vessels || []).some(function (v) { return v.id === id; });
  });
  if (!boats.length) return;
  const m = (RT.quests.build().missions || []).find(function (x) { return x.id === q.id; });
  const before = (RT.content.roster.vessels || [])
    .filter(function (v) { return (v.reach || 0) < 9999; })
    .map(function (v) { return v.id; });
  boats.forEach(function (id) {
    /* Everything else already owned, and every boat below this one, so the
       offer can only be about this boat. */
    const under = ['foot'];
    for (const v of (RT.content.roster.vessels || [])) {
      if (v.id === id) break;
      if (v.id !== 'foot') under.push(v.id);
    }
    const seen = {};
    [m.n - 1, m.n, m.n + 1].forEach(function (n) {
      const sv = G.getSave();
      sv.currentMission = n; sv.highestMission = n; sv.money = 5000; sv.briefed = 99;
      sv.rods = ROD.slice(); sv.baits = BAIT.slice(); sv.tools = TOOL.slice();
      sv.vessels = under.slice();
      const o = G.nextOffer();
      seen[n] = !!(o && o.id === id);
    });
    console.log('  ' + id.padEnd(11) + 'sold by job ' + m.n + ' (' + q.title + ')');
    console.log('    job ' + (m.n - 1) + ': ' + (seen[m.n - 1] ? 'on the counter' : 'not yet') +
                '   job ' + m.n + ' (still open): ' + (seen[m.n] ? 'on the counter' : 'not yet') +
                '   job ' + (m.n + 1) + ' (handed in): ' + (seen[m.n + 1] ? 'on the counter' : 'not yet'));
    ok(!seen[m.n], id + ' is not for sale while the job that earns her is open');
    ok(seen[m.n + 1], id + ' is for sale the moment that job is handed in');
  });
});

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. Being short is a detour, not an afternoon.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
