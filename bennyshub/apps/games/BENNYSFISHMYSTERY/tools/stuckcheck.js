/**
 * Is there ever nothing to press?
 *
 *     node tools/stuckcheck.js
 *
 * This game is played with two switches. A state that offers no rows is not
 * an inconvenience, it is the end of the session: there is no mouse to reach
 * for and no menu key to fall back on, and the player has to reload.
 *
 * One shipped. When the line parted, the game went back to WAITING - waiting
 * for a bite, on a line with no hook on it - and fired a card the interface
 * treats as a screen flash, so nothing came up and the scan never restarted.
 * Reported as "it just sits at the fishing spot and I can't press spacebar".
 *
 * So: break the line in every way it can break, in every vessel, and check
 * there is always a row, and always a row that leads home.
 */
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });
const sv = G.getSave();
sv.briefed = 99; sv.currentMission = 12; sv.highestMission = 12; sv.money = 9999;
(RT.content.roster.rods || []).forEach(r => { if (!sv.rods.includes(r.id)) sv.rods.push(r.id); });
(RT.content.roster.vessels || []).forEach(v => { if (!sv.vessels.includes(v.id)) sv.vessels.push(v.id); });
(RT.content.roster.baits || []).forEach(b => { if (!sv.baits.includes(b.id)) sv.baits.push(b.id); });

function rowsNow() {
  const items = G.spotTargets ? G.spotTargets() : [];
  return items.map(i => i.key + ':' + (i.label || ''));
}

function tryVessel(onFoot) {
  const where = onFoot ? 'off the boards' : 'in the boat';
  G.goToDock(); G.setOnFoot(onFoot); G.castOff();
  for (let i = 0; i < 60; i++) G.update(1 / 30);
  if (!onFoot) {
    /* Stop somewhere, so there is a spot to be stuck at. */
    for (const side of ['right', 'left']) {
      G.pullOverTo(side);
      for (let i = 0; i < 400 && !G.isFishing(); i++) G.update(1 / 30);
      if (G.isFishing()) break;
    }
  }
  ok(G.isFishing(), 'the boat can stop and fish ' + where);

  /* Break it, the way the lake breaks it. */
  const s2 = G.getSave();
  s2.tackleBroken = true;
  const rows = rowsNow();
  console.log('  ' + where + ', line bare: ' + JSON.stringify(rows));
  ok(rows.length > 0, 'there is something to press with a bare line ' + where);
  ok(rows.some(r => /^dock/.test(r)),
     'and one of them goes back to Walt ' + where);
  ok(!rows.some(r => /^cast/.test(r)),
     'and casting is not offered with nothing on the line ' + where);
  s2.tackleBroken = false;
  G.returnToDock();
  for (let i = 0; i < 30; i++) G.update(1 / 30);
}

console.log('WITH NOTHING ON THE LINE');
tryVessel(true);
tryVessel(false);

/* ── AND THE CARD COMES BACK WHEN THE LINE ACTUALLY PARTS ─────────────── */
console.log();
G.goToDock(); G.setOnFoot(true); G.castOff();
for (let i = 0; i < 60; i++) G.update(1 / 30);
let card = null;
G.callbacks.onCard = (a) => { const n = a && (a.name || a.which); if (n) card = n; };
G.startAim();
for (let i = 0; i < 6; i++) G.update(1 / 30);
G.beginCharge(); G.setCharging(true);
for (let i = 0; i < 60; i++) G.update(1 / 30);
G.setCharging(false); G.releaseCast();
for (let i = 0; i < 60; i++) G.update(1 / 30);
card = null;
console.log('  before the break the state is "' + RT.game.state + '"');
const broke = G.debugSnapLine ? G.debugSnapLine() : null;
console.log('  the moment it breaks: state "' + RT.game.state + '" card "' + card + '"');
for (let i = 0; i < 90; i++) G.update(1 / 30);
console.log('after the line parts the game is in state "' + RT.game.state +
            '" and the card is "' + card + '"');
if (broke !== null) {
  ok(card === 'spot' || RT.game.state === 'spot',
     'the spot card comes back when the line parts, so there is something to press');
  ok(!G.run || !G.run.landing, 'and the line is in, not still lying out on the water');
}

/* ── AND THE PLACE YOU WERE SENT TO IS STILL THERE ────────────────────────
   Reported on job 21: the log jam card steers you out, you magnet-fish it,
   you troll on - and it never comes back, though the sound comb is still on
   the bottom. Trolling on marks the water behind you as spent, which is
   right for a patch of perch and wrong for the one spot the whole job is
   about: what is left is a job that cannot be finished and a boat circling
   water the game will not offer. A slow way of being stuck.

   Checked on every job that HAS a place, because it was never about the jam:
   fish it, troll on, draw off, and the offer has to be there again. */
console.log();
console.log("A JOB'S PLACE, AFTER TROLLING ON");
const DT2 = 1 / 30;
let gone = 0, tried = 0;
(RT.content.quests.quests || []).forEach(function (q) {
  const p = (RT.content.lake.places || []).find(function (r) { return r.quest === q.id; });
  if (!p) return;
  tried++;
  const s2 = G.getSave();
  s2.currentMission = q.n;
  s2.highestMission = Math.max(s2.highestMission || 0, q.n);
  s2.briefed = 99;
  s2.vessel = 'motorboat';
  G.goToDock();
  G.castOff();
  const r = G.run;
  if (!r) { return; }
  /* Standing on it, as though you had just fished it, and trolling on. */
  const pl = G.jobPlace && G.jobPlace();
  if (!pl) { return; }
  r.x = pl.x; r.z = pl.z + 30; r.head = 0;
  r.current = { key: 'place:' + p.id, isPlace: true, x: pl.x, z: pl.z, shoals: [] };
  G.chooseTroll();
  /* Away, the way a boat leaves, and then back within reach of it. */
  for (let f = 0; f < 30 * 25; f++) { G.setSteer(0); G.update(DT2); }
  const back = G.jobPlace && G.jobPlace();
  const spent = !!(G.run && G.run.taken && G.run.taken['place:' + p.id]);
  if (!back || spent) {
    gone++;
    console.log('  ' + q.id + ' (' + (p.label || p.id) + '): ' +
                (!back ? 'the place is gone' : 'still marked spent'));
  }
  G.returnToDock();
});
console.log('  ' + tried + ' jobs have a place; ' + (tried - gone) + ' of them offer it again');
ok(tried >= 5, 'there are places to check (' + tried + ')');
ok(gone === 0, "a job's place can be fished again after trolling on (" + gone + " lost)");

/* ── EVERY CARD CAN BE DRAWN ─────────────────────────────────────────────
   game.js fires cards by name; ui.js draws them by name. If it fires one the
   interface has never heard of, setScreen calls undefined and throws - and
   what a player sees is the card they were already looking at, frozen, with
   every press going nowhere. That is exactly what the centre fog did, and no
   amount of playing the RULES could catch it: the harness takes that beat by
   calling into the engine, so the ladder ran green while the interface had
   no way to show it at all. */
console.log();
console.log('EVERY CARD THE GAME CAN FIRE');
const fs2 = require('fs');
const path2 = require('path');
const gameSrc2 = fs2.readFileSync(path2.join(__dirname, '..', 'js', 'game.js'), 'utf8');
const uiSrc2 = fs2.readFileSync(path2.join(__dirname, '..', 'js', 'ui.js'), 'utf8');
const fired = Array.from(new Set(
  (gameSrc2.match(/which:\s*'([a-z]+)'/g) || []).map(function (m) {
    return m.replace(/.*'([a-z]+)'.*/, '$1');
  })));
/* The screens, plus the two names onCard deals with itself rather than
   through setScreen. */
const drawn = new Set((uiSrc2.match(/^    ([a-z][a-zA-Z]*): \(\) =>/gm) || [])
  .map(function (m) { return m.trim().replace(':', '').replace(' () =>', ''); }));
(uiSrc2.match(/d\.which === '([a-z]+)'/g) || []).forEach(function (m) {
  drawn.add(m.replace(/.*'([a-z]+)'.*/, '$1'));
});
const undrawable = fired.filter(function (w) { return !drawn.has(w); });
console.log('  fires: ' + fired.sort().join(', '));
undrawable.forEach(function (w) {
  console.log('  ' + w + ' is fired by the game and no screen draws it');
});
ok(fired.length >= 3, 'the game fires cards by name (' + fired.length + ' kinds)');
ok(undrawable.length === 0,
   'and the interface can draw every one of them (' + undrawable.length + ' it cannot)');

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. There is always something to press.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
