/**
 * Does the corner of the screen show words, or does it show markup?
 *
 *     node tools/hudcheck.js
 *
 * Reported: landing a ten-pound pike brought up the fish and "a green box
 * with some error code in it", gone too fast to read. It was the mission
 * panel. A finished target ends in a painted tick - an <img> tag, because
 * every small picture in this game is a painting rather than an emoji - and
 * ui.js wrote that string in with `textContent`, which prints markup instead
 * of parsing it. The panel turns green when a job is done. So: a green box
 * with an <img> tag spelled out in it.
 *
 * Nothing was watching the HUD at all, which is how a fault visible on every
 * single completed job survived nineteen suites.
 *
 * Two questions, asked of every job at both ends of its target:
 *
 *   IS ANY OF IT MARKUP? Fields carrying an icon are fine - as long as ui.js
 *   renders that field as HTML. So the write style is read out of ui.js and
 *   matched against what the field actually contains: a field written with
 *   textContent may never be handed a tag.
 *
 *   IS ANY OF IT MISSING? No "undefined", "null", "NaN" or bare "0 /" in
 *   anything the corner of the screen says.
 */
const fs = require('fs');
const path = require('path');
const H = require('./playtest.js');
const { G, RT, THREE, ok } = H;

G.resetProgress();
G.init({ scene: new THREE.Scene(),
         camera: new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000),
         renderer: { shadowMap: {}, domElement: {}, setSize() {}, render() {},
                     setPixelRatio() {}, getContext: () => null } });

/* How ui.js writes each panel: field name -> 'text' or 'html'. Read rather
   than listed, so a new panel is covered the day it is added. */
const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8');
const writes = {};
const RE = /\$\('(hud[A-Za-z]+)'\)(?:\s*\|\|\s*[^)]*\))?\s*\.\s*(textContent|innerHTML)\s*=\s*([^;]+);/g;
let m;
while ((m = RE.exec(ui)) !== null) {
  const how = m[2] === 'innerHTML' ? 'html' : 'text';
  /* Which HUD field feeds it - h.something on the right-hand side. */
  const fields = (m[3].match(/\bh\.([A-Za-z]+)/g) || []).map(x => x.slice(2));
  fields.forEach((f) => {
    /* If a field reaches two panels, the stricter one wins. */
    if (writes[f] !== 'text') writes[f] = how;
  });
}
ok(Object.keys(writes).length >= 4,
   'ui.js says how the HUD is written (' + Object.keys(writes).length + ' fields read)');
ok(writes.target === 'html',
   'the mission target is rendered, not printed (it is written as ' +
   (writes.target || 'nothing') + ')');

/* Every job, at nothing done and at done. goToDock pushes the HUD, which is
   the same call the game makes when a catch moves the count. */
const huds = [];
G.callbacks.onHud = (h) => huds.push(h);
const sv = G.getSave();
sv.briefed = 99;
const jobs = [];
for (let n = 1; n <= 35; n++) {
  const q = G.missionByN(n);
  if (!q) continue;
  jobs.push(n);
  const amt = (q.target && q.target.amount) || 1;
  [0, amt, amt * 2].forEach((v) => {
    sv.currentMission = n;
    sv.progressValue = v;
    G.goToDock();
  });
}
ok(jobs.length >= 30, 'every job put something in the corner (' + jobs.length + ' jobs)');
ok(huds.length >= jobs.length * 3, 'and it was pushed each time (' + huds.length + ' pushes)');

/* MARKUP WHERE MARKUP CANNOT BE RENDERED. */
const printed = [];
huds.forEach((h) => {
  Object.keys(h).forEach((k) => {
    if (typeof h[k] !== 'string' || h[k].indexOf('<') < 0) return;
    if (writes[k] === 'html') return;           // rendered: a tick is a tick
    printed.push('mission ' + h.missionN + '  ' + k + ' (' +
                 (writes[k] || 'unused') + '): ' + h[k].slice(0, 90));
  });
});
printed.slice(0, 8).forEach(p => console.log('  ' + p));
ok(printed.length === 0,
   'no panel is handed a tag it will print as words (' + printed.length + ')');

/* AND NOTHING HALF-BUILT. */
const BAD = [/\bundefined\b/, /\bnull\b/, /\bNaN\b/, /\[object Object\]/, /\s{3,}/];
const half = [];
huds.forEach((h) => {
  Object.keys(h).forEach((k) => {
    if (typeof h[k] !== 'string') return;
    if (BAD.some(re => re.test(h[k])))
      half.push('mission ' + h.missionN + '  ' + k + ': ' + JSON.stringify(h[k]).slice(0, 80));
  });
});
half.slice(0, 8).forEach(p => console.log('  ' + p));
ok(half.length === 0, 'nothing in the corner is blank or half-built (' + half.length + ')');

/* A sample, so a person can read what the corner actually says. */
console.log();
console.log('what the mission panel says when a job is finished:');
const done = huds.filter(h => h.targetDone);
[...new Set(done.map(h => h.target))].slice(0, 6).forEach((t) => {
  console.log('  ' + t.replace(/<img[^>]*src="images\/icons\/([a-z]+)\.png"[^>]*>/g, '[$1]'));
});

/* ── NO MISSION UNTIL YOU HAVE ONE ───────────────────────────────────────
   Reported: "when we first start the game the top left shows the 30 minnow
   mission but we haven't talked to Walt yet - it should just say go talk to
   Walt." Both readouts were showing a job the player had not been given, with
   a tally they could not move: the board at the dock said MISSION 1 over
   "Minnows & shiners 0 / 30", and the HUD out on the water said Mission 1.

   The words are checked here; that the mission chip is actually taken off the
   screen is a question about which CSS rule wins, so it is checked in a real
   browser (tools/browsertest.js). */
console.log();
console.log('BEFORE WALT HAS SAID A WORD');
(function () {
  const sv = G.getSave();
  sv.currentMission = 1; sv.highestMission = 1; sv.briefed = 0;
  const b = G.missionBrief();
  console.log('  the note says : "' + b.text + '"');
  console.log('  briefed flag  : ' + b.briefed);
  ok(b.briefed === false, 'a brand new game is not briefed');
  ok(/see Walt/i.test(b.text), 'and the note sends you to Walt, not to a job');
  /* And once he has. */
  sv.briefed = 1;
  const after = G.missionBrief();
  console.log('  after the brief: "' + after.text + '"');
  ok(after.briefed === true && !/see Walt/i.test(after.text),
     'and once he has briefed you it is the job again');
})();

const res = H.results();
console.log();
console.log(res.fail === 0
  ? res.checks + ' checks passed. The corner of the screen says words.'
  : res.fail + ' of ' + res.checks + ' checks failed.');
process.exit(res.fail ? 1 : 0);
