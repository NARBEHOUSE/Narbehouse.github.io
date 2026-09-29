/**
 * In-race controls, proved through real key events and the calls the stand-in
 * game records:
 *   Hold to Slide with two switches and with one (release flips the armed side);
 *   Press to Step with two switches (key DOWN steps a lane) and the one-switch
 *   lane scanner (key DOWN drives to the lit lane); rocket-start presses;
 *   two players holding Space and Enter at once — including the scan-manager
 *   cooldown trap — both steer and both releases are seen; a cancelled key
 *   releases only itself; hold Enter pauses (ring from 2 s); in 2P either switch
 *   pauses; Escape, the Pause button, a hidden page and a lost focus.
 */
const lib = require('./ui-lib.cjs');

module.exports = async function (t) {
  const L = lib(t);
  await L.boot();
  await t.js('NK.game.__cfg.raceSeconds = 900; NK.game.__cfg.autoCue = false; true');

  const steers = async (h) => (await L.calls('steer')).filter((c) => c.args[0] === h).map((c) => c.args[1]);
  const lanes = async (h) => (await L.calls('targetLane')).filter((c) => c.args[0] === (h | 0)).map((c) => c.args[1]);
  const racing = () => t.until('NK.game.phase() === "racing" && !NK.ui.__dbg().overlayOn', 8000);
  const input = (code) => t.js('JSON.parse(JSON.stringify(NK.input.state("' + code + '")))');

  async function race(setup) {
    const d = await L.dbg();
    if (d.inRace) await L.quitRace();
    await L.startRace(setup);
  }

  /* ── Rocket start + Hold to Slide, two switches ──────────────────────── */
  await t.js('NarbeScanManager.setAutoScan(false); NK.game.settings.set("steerMode","hold"); true');
  await race('NK.game.setPlayers(1); NK.game.setType("single"); NK.game.setMode("open");');
  await t.until('NK.game.phase() === "countdown" && NK.game.__race().countdown <= 2', 8000);
  await L.clearCalls();
  await L.tap('Space', 120);
  t.assert((await L.calls('pressed')).length === 1 && (await t.js('NK.game.__steer(0).rocket')), 'a key DOWN after the "2" is sent as a rocket-start press');
  await racing();
  await L.clearCalls();
  await t.key('keydown', 'Space');
  t.assert(JSON.stringify(await steers(0)) === '[-1]', 'hold Space: slide left (on key down)', await steers(0));
  await t.wait(600);
  const xLeft = (await t.js('NK.game.__steer(0)')).x;
  await t.key('keydown', 'Enter');
  t.assert((await steers(0)).slice(-1)[0] === 0, 'both held: hold still');
  await t.key('keyup', 'Space');
  t.assert((await steers(0)).slice(-1)[0] === 1, 'Space released, Enter still held: slide right');
  await t.wait(600);
  t.assert((await t.js('NK.game.__steer(0)')).x > xLeft, 'the kart really moved right');
  await t.key('keyup', 'Enter');
  t.assert((await steers(0)).slice(-1)[0] === 0, 'all released: stop (the kart settles into a lane)');
  // A switch held for a long time does exactly what a short hold does.
  await L.clearCalls();
  await t.key('keydown', 'Space');
  await t.wait(3000);
  await t.key('keyup', 'Space');
  t.assert(JSON.stringify(await steers(0)) === '[-1,0]', 'a long hold is still just "slide, then stop"', await steers(0));

  /* ── Window blur releases steering ───────────────────────────────────── */
  await L.clearCalls();
  await t.key('keydown', 'Enter');
  await t.js('window.dispatchEvent(new Event("blur")); true');
  await t.wait(100);
  t.assert((await steers(0)).slice(-1)[0] === 0 && !(await input('Enter')).down, 'losing focus releases the keys and the steering');
  await t.key('keyup', 'Enter');

  /* ── Hold to Slide, one switch: release flips the armed side ─────────── */
  await t.js('NarbeScanManager.setAutoScan(true); true');
  await race('NK.game.setType("single");');
  await racing();
  await L.clearCalls();
  t.assert((await L.state(0)).armed === -1, 'one switch starts armed LEFT');
  await t.key('keydown', 'Enter');
  t.assert(JSON.stringify(await steers(0)) === '[-1]', 'hold Enter: slide the armed way (left)');
  await t.wait(300);
  await t.key('keyup', 'Enter');
  t.assert((await steers(0)).slice(-1)[0] === 0 && (await L.state(0)).armed === 1, 'release: stop, and RIGHT is armed');
  await t.wait(120);
  await L.clearCalls();
  await L.tap('Space', 200);
  t.assert((await L.calls('steer')).length === 0 && (await L.calls('pressed')).length === 0, 'Space is inert in a one-switch race');
  await t.key('keydown', 'Enter');
  t.assert((await steers(0)).slice(-1)[0] === 1, 'the next hold slides right');
  await t.key('keyup', 'Enter');
  t.assert((await L.state(0)).armed === -1, 'and its release arms LEFT again');

  /* ── Press to Step, two switches ─────────────────────────────────────── */
  await t.js('NarbeScanManager.setAutoScan(false); NK.game.settings.set("steerMode","step"); true');
  await race('NK.game.setType("single");');
  await racing();
  await t.wait(300);
  const lane0 = await t.js('NK.game.lane(0)');
  await L.clearCalls();
  await t.key('keydown', 'Space');
  t.assert(JSON.stringify(await lanes(0)) === JSON.stringify([Math.max(0, lane0 - 1)]), 'Space DOWN: one lane left, at once', { lane0, calls: await lanes(0) });
  await t.wait(1200);
  t.assert((await lanes(0)).length === 1, 'holding adds nothing');
  await t.key('keyup', 'Space');
  t.assert((await lanes(0)).length === 1 && (await L.calls('steer')).length === 0, 'the release does nothing');
  await t.wait(200);
  await L.clearCalls();
  const lane1 = await t.js('NK.game.lane(0)');
  await L.tap('Enter', 100);
  await L.tap('Enter', 100);
  t.assert(JSON.stringify(await lanes(0)) === JSON.stringify([lane1 + 1, lane1 + 2]), 'two quick Enter presses step two lanes right', await lanes(0));

  /* ── Press to Step, one switch: the lane scanner ─────────────────────── */
  // Fast steering also makes the scanner rest 0.9 s per lane (DESIGN §2.1).
  await t.js('NarbeScanManager.setAutoScan(true); NK.game.settings.set("steerSpeed","fast"); true');
  await race('NK.game.setType("single");');
  await racing();
  await t.until('NK.controls.state(0).scanLane === 3', 8000);
  await L.clearCalls();
  await t.key('keydown', 'Enter');
  t.assert(JSON.stringify(await lanes(0)) === '[3]', 'Enter DOWN drives to the highlighted lane', await lanes(0));
  await t.wait(200);
  await t.key('keyup', 'Enter');
  t.assert((await lanes(0)).length === 1, 'the release adds nothing');
  const scanSeen = await t.js('(function(){var s={},n=0;return new Promise(function(r){var iv=setInterval(function(){s[NK.controls.state(0).scanLane]=1;if(++n>60){clearInterval(iv);r(Object.keys(s).length);}},100);});})()');
  t.assert(scanSeen === 5, 'the highlight walks over all five lanes', scanSeen);
  const pace = await t.js('(function(){var a=NK.controls.state(0).scanLane,t0=performance.now();return new Promise(function(r){' +
    'var iv=setInterval(function(){var b=NK.controls.state(0).scanLane;if(b!==a){a=b;if(t0<0){clearInterval(iv);r(performance.now()+t0);}else t0=-performance.now();}},20);});})()');
  t.assert(pace > 800 && pace < 1000, 'at Fast the highlight rests about 0.9 s on each lane', Math.round(pace));

  /* ── Two players at once, and the scan-manager cooldown trap ──────────── */
  await t.js('NarbeScanManager.setAutoScan(false); NK.game.settings.set("steerMode","hold"); NK.game.settings.set("steerSpeed","normal"); true');
  await race('NK.game.setPlayers(2); NK.game.setType("single");');
  await racing();
  await L.clearCalls();
  await t.key('keydown', 'Space');
  await t.key('keydown', 'Enter');
  t.assert((await steers(0)).slice(-1)[0] === -1 && (await steers(1)).slice(-1)[0] === -1, 'P1 (Space) and P2 (Enter) both steer while both are held');
  t.assert((await input('Space')).down && (await input('Enter')).down, 'NK.input has both keys down');
  await t.key('keyup', 'Space');
  t.assert((await steers(0)).slice(-1)[0] === 0 && (await L.state(0)).armed === 1, "P1's release stops only P1 and flips P1's armed side");
  t.assert((await t.js('NK.game.__steer(1)')).steer === -1, 'P2 is still steering');
  await t.key('keyup', 'Enter');
  t.assert((await steers(1)).slice(-1)[0] === 0, "P2's release is seen too");
  await t.wait(300);

  // P1 lets go and P2 presses within a few milliseconds: scan-manager's
  // global cooldown blocks P2's key-down AND will swallow its key-up.
  await t.key('keydown', 'Space');
  await t.wait(200);
  await L.clearCalls();
  const trap = await t.js('(function(){' +
    'document.dispatchEvent(new KeyboardEvent("keyup",{code:"Space",key:" ",bubbles:true,cancelable:true}));' +
    'document.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true,cancelable:true}));' +
    'return { input: NK.input.state("Enter").down, menuSaw: NK.ui.__dbg().keyDown.Enter, p2: NK.game.__steer(1).steer };})()');
  t.assert(trap.input === true && trap.menuSaw === false, 'scan-manager hid the key-down from the page, but NK.input saw it', trap);
  t.assert(trap.p2 !== 0, "P2's kart steers anyway", trap);
  await t.wait(500);
  await t.key('keyup', 'Enter');
  await t.wait(50);
  t.assert(!(await input('Enter')).down && (await steers(1)).slice(-1)[0] === 0, "P2's swallowed key-up still releases P2's kart");

  /* ── narbe-input-cancelled releases only the key it names ────────────── */
  await t.wait(200);
  await t.key('keydown', 'Space');
  await t.wait(60);
  await t.key('keydown', 'Enter');
  await t.wait(60);
  await L.clearCalls();
  await t.js('document.dispatchEvent(new CustomEvent("narbe-input-cancelled",{bubbles:true,detail:{key:" ",code:"Space",reason:"too-short"}})); true');
  t.assert(!(await input('Space')).down && (await input('Enter')).down, 'cancelling Space releases Space only');
  t.assert((await steers(0)).slice(-1)[0] === 0 && (await steers(1)).length === 0 && (await t.js('NK.game.__steer(1)')).steer !== 0,
           'P1 stops, P2 keeps steering');
  await t.key('keyup', 'Enter');
  await t.key('keyup', 'Space');

  /* ── 2P: either switch held pauses, in that player's view ────────────── */
  await t.wait(200);
  await t.key('keydown', 'Enter');
  await t.wait(2400);
  t.assert(await t.js('!!document.querySelector(".nkView.v1 .nkRing.on")'), "P2's ring appears in P2's view");
  await L.until('pause', 4500);
  t.assert(/Player 2 paused/.test(await t.js('document.getElementById("nkCardSub").textContent')), 'the pause card says who paused');
  await t.key('keyup', 'Enter');
  await t.wait(200);
  t.assert((await L.dbg()).index === -1, "the pausing switch's release is swallowed");
  await L.tap('Space'); await L.tap('Enter');              // Continue
  await racing();
  await t.key('keydown', 'Space');
  await L.until('pause', 6500);
  t.assert(/Player 1 paused/.test(await t.js('document.getElementById("nkCardSub").textContent')), "P1's Space hold pauses too");
  await t.key('keyup', 'Space');

  /* ── 1P: hold Enter pauses (ring from 2 s), either scheme ────────────── */
  await L.quitRace();
  await race('NK.game.setPlayers(1); NK.game.setType("single");');
  await racing();
  const said0 = await L.spokenCount();
  await t.key('keydown', 'Enter');
  await t.wait(1500);
  t.assert((await L.state(0)).pauseHold === 0 && !(await t.js('!!document.querySelector(".nkRing.on")')), 'no ring before 2 s');
  await t.wait(1000);
  const mid = await L.state(0);
  t.assert(mid.pauseHold > 0 && await t.js('!!document.querySelector(".nkRing.on")'), 'the ring shows from 2 s', mid);
  await L.until('pause', 3500);
  const d = await L.dbg();
  t.assert(d.index === -1 && d.ignore.Enter, 'at 5 s the pause card opens, nothing focused, Enter swallowed');
  t.assert(await t.js('NK.game.isPaused()'), 'the race is paused');
  await t.key('keyup', 'Enter');
  await t.wait(200);
  t.assert((await L.dbg()).index === -1 && (await L.dbg()).screen === 'pause', 'its release neither steps nor chooses');
  const saidPause = await L.said(said0);
  t.assert(saidPause.filter((s) => /^Paused\./.test(s)).length === 1, 'the pause card is announced, once', saidPause);
  await L.tap('Space'); await L.tap('Enter');              // Continue
  await racing();
  t.assert(!(await t.js('NK.game.isPaused()')) && (await L.said(said0)).indexOf('Go') >= 0, 'Continue resumes the race and says "Go"');

  /* ── Escape, the Pause button, a hidden page ─────────────────────────── */
  await t.key('keydown', 'Escape');
  await L.until('pause');
  t.assert(true, 'Escape pauses');
  await L.tap('Space'); await L.tap('Enter');
  await racing();
  t.assert(await t.js('getComputedStyle(document.getElementById("nkPauseBtn")).display !== "none"'), 'the on-screen Pause button is shown in a race');
  const btn = await t.js('(function(){var r=document.getElementById("nkPauseBtn").getBoundingClientRect();return {w:r.width,h:r.height,l:r.left,b:innerHeight-r.bottom};})()');
  t.assert(btn.w >= 64 && btn.h >= 64 && btn.l < 60 && btn.b < 60, 'it is bottom-left and at least 64 px', btn);
  await t.js('document.getElementById("nkPauseBtn").click(); true');
  await L.until('pause');
  t.assert(true, 'the Pause button pauses');
  await L.tap('Space'); await L.tap('Enter');
  await racing();
  await t.js('Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return "hidden"; } });' +
             'document.dispatchEvent(new Event("visibilitychange")); delete document.visibilityState; true');
  await L.until('pause');
  t.assert(true, 'a hidden page pauses the race');
};
