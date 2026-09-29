/**
 * The in-race HUD in all three layouts: roulette, drift meter, cue left/right,
 * danger rim, one-switch panels with the green match, the Press-to-Step lane
 * scanner, big pops and the pause ring mid-hold. Every shot is also checked for
 * layout: each HUD cluster inside its own view and not overlapping another.
 */
const lib = require('./ui-lib.cjs');

/* In the page: the rects of each cluster per view, and any collisions. */
const LAYOUT_CHECK = `(function(){
  var out = [];
  document.querySelectorAll('#nkHud .nkView').forEach(function (v, vi) {
    var vr = v.getBoundingClientRect();
    function box(sel) {
      var el = v.querySelector(sel);
      if (!el) return null;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.opacity === '0') return null;
      var r = el.getBoundingClientRect();
      return r.width && r.height ? { sel: sel, l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
    }
    var parts = ['.nkTL', '.nkTR', '.nkBottom', '.nkMapWrap', '.nkCue', '.nkSide.l', '.nkSide.r', '.nkRing', '.nkTag', '.nkPop.on']
      .map(box).filter(Boolean);
    var bad = [];
    parts.forEach(function (p) {
      if (p.l < vr.left - 1 || p.t < vr.top - 1 || p.r > vr.right + 1 || p.b > vr.bottom + 1) {
        // Side panels grow past the view edge on purpose (they are clipped there).
        if (p.sel.indexOf('.nkSide') < 0) bad.push(p.sel + ' leaves the view');
      }
    });
    for (var i = 0; i < parts.length; i++) for (var j = i + 1; j < parts.length; j++) {
      var a = parts[i], b = parts[j];
      if (a.l < b.r - 2 && b.l < a.r - 2 && a.t < b.b - 2 && b.t < a.b - 2) bad.push(a.sel + ' overlaps ' + b.sel);
    }
    out.push({ view: vi, w: Math.round(vr.width), h: Math.round(vr.height), u: v.style.getPropertyValue('--u'), bad: bad });
  });
  return out;
})()`;

module.exports = async function (t) {
  const L = lib(t);
  await L.boot();

  async function layoutOk(label) {
    const res = await t.js(LAYOUT_CHECK);
    t.assert(res.length > 0 && res.every((v) => v.bad.length === 0), label + ': HUD clusters fit their view', res);
    return res;
  }
  const force = (obj) => t.js('Object.keys(NK.game.__force).forEach(function(k){delete NK.game.__force[k]});' +
                               'Object.assign(NK.game.__force,' + JSON.stringify(obj) + '); true');
  const until = (expr) => t.until(expr, 8000);
  const racing = () => until('NK.game.phase() === "racing"');

  /* ── 1P, two switches ──────────────────────────────────────────────── */
  await t.js('NarbeScanManager.setAutoScan(false); NK.game.settings.set("steerMode","hold"); NK.game.__cfg.raceSeconds = 600; true');
  await L.startRace('NK.game.setPlayers(1); NK.game.setMode("open"); NK.game.setType("single"); NK.game.setTrack("meadow");');
  await t.wait(400);
  await t.shot('h-intro');
  await until('NK.game.phase() === "countdown"');
  await t.wait(1150);
  await t.shot('h-countdown');
  await racing();
  await t.js('NK.game.__cfg.autoItems = false; true');
  await force({ roulette: true, item: null, coins: 7, drift: { dir: 1, charge: 2.3, level: 2 },
                cue: { dir: -1, active: true, level: 2 }, danger: true, place: 3, lap: 2 });
  await t.wait(500);
  await t.shot('h-single-roulette-cueL-danger');
  t.assert(await t.js('!!document.querySelector(".nkSlot.spin") && !!document.querySelector(".nkCue.on.left") && !!document.querySelector(".nkDanger.on")'),
           'roulette spinning, LEFT cue and danger rim are shown');
  await layoutOk('single, roulette');

  await force({ roulette: false, item: 'goldrocket', coins: 10, drift: { dir: 1, charge: 3.2, level: 3 },
                cue: { dir: 1, active: true, level: 2 }, danger: false, place: 1, lap: 3, itemUseT: 4 });
  await t.wait(500);
  await t.shot('h-single-item-cueR-final');
  t.assert(await t.js('document.querySelector(".nkSlotName").textContent === "Golden Rocket" && !!document.querySelector(".nkLap.final") && !!document.querySelector(".nkPlace.p1")'),
           'item name, FINAL lap and 1st place styling');
  await layoutOk('single, item');

  await force({ item: 'peel3', coins: 4, drift: { dir: 1, charge: 1.2, level: 1 }, cue: { dir: 0, active: false, level: 2 }, place: 8, lap: 1 });
  await t.wait(400);
  await t.js('NK.hud.pop(0, "GO!", "go"); true');
  await t.wait(420);
  await t.shot('h-pop-go');
  await t.js('NK.hud.pop(0, "FINAL LAP!", "final"); true');
  await t.wait(420);
  await t.shot('h-pop-final');
  await t.js('NK.hud.pop(0, "BANANA PEEL!", "item"); true');
  await t.wait(420);
  await t.shot('h-pop-item');

  // Pause ring mid-hold (1P: hold Enter). Released before it completes.
  await force({ item: 'star', cue: { dir: 1, active: true, level: 2 }, place: 5, lap: 2 });
  await t.key('keydown', 'Enter');
  await t.wait(3500);
  await t.shot('h-ring-mid-hold');
  const ring = await t.js('({ on: !!document.querySelector(".nkView.v0 .nkRing.on"), hold: NK.controls.state(0).pauseHold })');
  t.assert(ring.on && ring.hold > 0.3 && ring.hold < 0.7, 'the pause ring is showing part-way through the hold', ring);
  await layoutOk('single, ring');
  await t.key('keyup', 'Enter');
  await t.wait(250);
  t.assert(await t.js('!document.querySelector(".nkView.v0 .nkRing.on") && !NK.ui.__dbg().overlayOn'), 'letting go early hides the ring and does not pause');

  // Other sizes.
  for (const [w, h] of [[1920, 1008], [1368, 840], [1024, 768]]) {
    await t.setSize(w, h);
    await t.wait(300);
    await layoutOk('single @' + w + 'x' + h);
    if (w === 1024) await t.shot('h-single-1024');
  }
  await t.setSize(1600, 900);

  /* ── 1P, one switch (Auto Scan on): LEFT/RIGHT panels and the match ── */
  await L.quitRace(); await t.js('NarbeScanManager.setAutoScan(true); true');
  await L.startRace('NK.game.setType("single");');
  await racing();
  await force({ cue: { dir: 1, active: true, level: 2 }, cueLane: 3, place: 6, lap: 1, item: 'ball', coins: 3 });
  await t.wait(400);
  await t.shot('h-one-armed-left');
  t.assert(await t.js('!!document.querySelector(".nkSide.l.on") && !document.querySelector(".nkSide.on.match")'),
           'one switch: LEFT armed, no match while the guidance says right');
  await L.tap('Enter', 200);                 // a press slides left; its release flips to RIGHT
  await t.wait(300);
  await t.shot('h-one-match-right');
  t.assert(await t.js('!!document.querySelector(".nkSide.r.on.match")'), 'armed RIGHT turns green when it matches the guidance');
  await layoutOk('one switch');

  /* ── 1P, one switch, Press to Step: the lane scanner ───────────────── */
  await L.quitRace(); await t.js('NK.game.settings.set("steerMode","step"); true');
  await L.startRace('NK.game.setType("single");');
  await racing();
  await force({ cue: { dir: 1, active: true, level: 2 }, cueLane: 3, place: 4, lap: 2 });
  await until('NK.controls.state(0).scanLane === 3');
  await t.wait(150);
  await t.shot('h-scan-on-green');
  t.assert(await t.js('!!document.querySelector(".nkLanes.scan.match .pip.hot.guide")'), 'scanner highlight on the green lane');
  await until('NK.controls.state(0).scanLane === 1');
  await t.wait(150);
  await t.shot('h-scan-off-green');
  await layoutOk('lane scanner');

  /* ── 2 players, side by side ─────────────────────────────────────────── */
  await L.quitRace(); await t.js('NK.game.settings.set("steerMode","hold"); NK.game.settings.set("split","side"); true');
  await L.startRace('NK.game.setPlayers(2); NK.game.setType("single");');
  await racing();
  await force({ cue: { dir: -1, active: true, level: 2 }, cueLane: 1, roulette: false, item: 'rocket', coins: 5,
                drift: { dir: 1, charge: 2.0, level: 2 }, lap: 2 });
  await t.wait(400);
  t.assert(await t.js('document.querySelectorAll("#nkHud .nkView").length === 2 && document.querySelector(".nkView.v0 .nkTag").textContent === "P1 · Space" && document.querySelector(".nkView.v1 .nkTag").textContent === "P2 · Enter"'),
           '2P: two framed views tagged "P1 · Space" and "P2 · Enter"');
  await t.key('keydown', 'Space');           // P1 holds: slides, and the ring starts from 2 s
  await t.wait(3300);
  await t.shot('h-2p-side-ring');
  t.assert(await t.js('!!document.querySelector(".nkView.v0 .nkRing.on") && !document.querySelector(".nkView.v1 .nkRing.on")'),
           "the ring shows in the holding player's own view only");
  await layoutOk('2P side');
  await t.key('keyup', 'Space');
  await t.wait(200);
  for (const [w, h] of [[1920, 1008], [1368, 840]]) { await t.setSize(w, h); await t.wait(300); await layoutOk('2P side @' + w + 'x' + h); }
  await t.shot('h-2p-side-1368');
  await t.setSize(1600, 900);

  /* ── 2 players, top and bottom ───────────────────────────────────────── */
  await L.quitRace(); await t.js('NK.game.settings.set("split","stack"); true');
  await L.startRace('NK.game.setPlayers(2);');
  await racing();
  await force({ cue: { dir: 1, active: true, level: 2 }, cueLane: 4, item: 'bee', coins: 9, drift: { dir: 1, charge: 1.0, level: 1 }, lap: 3, danger: true });
  await t.key('keydown', 'Enter');
  await t.wait(3300);
  await t.shot('h-2p-stack-ring');
  await layoutOk('2P stack');
  await t.key('keyup', 'Enter');
  await t.wait(200);
  for (const [w, h] of [[1920, 1008], [1368, 840]]) { await t.setSize(w, h); await t.wait(300); await layoutOk('2P stack @' + w + 'x' + h); }
  await t.setSize(1600, 900);

  // 2P, Press to Step: both players get their own scanner.
  await L.quitRace(); await t.js('NK.game.settings.set("split","side"); NK.game.settings.set("steerMode","step"); NarbeScanManager.setAutoScan(false); true');
  await L.startRace('NK.game.setPlayers(2);');
  await racing();
  await force({ cue: { dir: 1, active: true, level: 2 }, cueLane: 2, item: 'horn', lap: 1 });
  await t.wait(1500);
  await t.shot('h-2p-side-scanners');
  t.assert(await t.js('document.querySelectorAll(".nkLanes.scan").length === 2'), '2P step: a lane scanner in each view');
  await layoutOk('2P scanners');
  await t.js('NK.game.settings.set("steerMode","hold"); true');
};
