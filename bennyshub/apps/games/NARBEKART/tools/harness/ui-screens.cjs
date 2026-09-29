/**
 * Every menu screen, photographed at 1600x900 (and a few at 1024x768), and
 * checked for fit — no card may ever need a scrollbar — at the hub's
 * 1920x1008, a 1368x840 tablet, 1600x900 and 1024x768.
 */
const fs = require('fs');
const path = require('path');
const lib = require('./ui-lib.cjs');

const SIZES = [[1920, 1008], [1368, 840], [1024, 768], [1600, 900]];

module.exports = async function (t) {
  const L = lib(t);

  // Some saved progress so the cup and track screens have medals and times.
  await L.boot();
  await t.js('localStorage.setItem("nk-trophies", JSON.stringify({ nofail: { easy: { sunshine: "gold" } }, open: { fast: { sunshine: "silver" } } }));' +
             'localStorage.setItem("nk-best", JSON.stringify({ meadow: { medium: 71.4 }, shores: { medium: 84.9 }, frost: { medium: 96.2 } }));' +
             'localStorage.setItem("nk-progress", JSON.stringify({ cups: { nofail: 1, open: 2 }, mirror: false }));' +
             'localStorage.setItem("nk-picks", JSON.stringify({ p1: { char: "rusty", kart: "bike" }, p2: { char: "waddles", kart: "hover" }, mode: "nofail", type: "gp", classId: "easy", cupId: "sunshine", trackId: "meadow" }));' +
             'true');
  const real = await L.boot({ real: true });
  t.note('content: ' + (real ? 'real ' + real : 'mock fallback'));

  /* ── Screens that need no race ───────────────────────────────────────── */
  const statics = [
    ['title', 'NK.game.setPlayers(1);', 'title'],
    ['rules-1p', 'NK.game.setPlayers(1);', 'rules'],
    ['rules-2p', 'NK.game.setPlayers(2);', 'rules'],
    ['type-1p', 'NK.game.setPlayers(1);', 'type'],
    ['type-2p', 'NK.game.setPlayers(2);', 'type'],
    ['speed-locked', 'NK.game.setPlayers(1);', 'speed'],
    ['speed-mirror', 'NK.game.__progress({ mirror: true });', 'speed'],
    ['racer-1p', 'NK.game.setPlayers(1);', 'racer', { player: 0 }],
    ['kart-1p', 'NK.game.setPlayers(1); NK.game.setPick(0, { charId: "bruno" });', 'kart', { player: 0 }],
    ['racer-2p-p1', 'NK.game.setPlayers(2);', 'racer', { player: 0 }],
    ['racer-2p-p2', 'NK.game.setPlayers(2);', 'racer', { player: 1 }],
    ['kart-2p-p2', 'NK.game.setPlayers(2); NK.game.setPick(1, { charId: "hopper" });', 'kart', { player: 1 }],
    ['cup-nofail', 'NK.game.setPlayers(1); NK.game.setMode("nofail"); NK.game.setClass("easy");', 'cup'],
    ['track-single', 'NK.game.setMode("nofail"); NK.game.setType("single");', 'track'],
    ['track-tt-open', 'NK.game.setMode("open"); NK.game.setType("tt"); NK.game.setClass("medium");', 'track'],
    ['howto-1', 'NarbeScanManager.setAutoScan(false); NK.game.settings.set("steerMode","hold");', 'howto', { page: 0 }],
    ['howto-1-onestep', 'NarbeScanManager.setAutoScan(true); NK.game.settings.set("steerMode","step");', 'howto', { page: 0 }],
    ['howto-2', 'NarbeScanManager.setAutoScan(false); NK.game.settings.set("steerMode","hold");', 'howto', { page: 1 }],
    ['howto-3', '', 'howto', { page: 2 }],
    ['settings', 'NK.game.setPlayers(1);', 'settings'],
    ['confirm-exit', '', 'confirmExit', { from: 'title' }]
  ];
  const photos1024 = { title: 1, 'racer-1p': 1, settings: 1, 'track-single': 1, 'howto-1': 1 };

  for (const [shot, setup, name, opts] of statics) {
    await t.js('(function(){' + setup + 'return true;})()');
    await L.screen(name, opts);
    await t.shot('s-' + shot);
    await L.checkFit(shot + ' @1600x900');
  }
  // The same cards on the other screens the game has to fit.
  for (const [w, h] of SIZES.slice(0, 3)) {
    await t.setSize(w, h);
    for (const [shot, setup, name, opts] of statics) {
      await t.js('(function(){' + setup + 'return true;})()');
      await L.screen(name, opts);
      const f = await L.checkFit(shot + ' @' + w + 'x' + h);
      if (w === 1024 && photos1024[shot]) await t.shot('s1024-' + shot);
      if (f.transform) t.note(shot + ' @' + w + 'x' + h + ' scaled ' + f.transform);
    }
  }
  await t.setSize(1600, 900);

  // A settings change is saved the moment it is made, and said out loud.
  await L.screen('settings', { index: 2 });
  const saidSet = await L.spokenCount();
  await L.tap('Enter');
  const saved = await t.js('JSON.parse(localStorage.getItem("nk-settings") || "{}").steerMode');
  t.assert(saved === 'step' && (await L.said(saidSet)).indexOf('Steering: press to step') >= 0,
           'Steering changes to Press to Step, saved at once and spoken', saved);
  await L.tap('Enter');                                    // and back to Hold to Slide

  // Reset Progress arms first (the value says "Sure?"), then erases.
  await L.screen('settings');
  const rows = (await L.dbg()).rows;
  const resetAt = rows.findIndex((r) => /Reset Progress/.test(r));
  await L.screen('settings', { index: resetAt });
  await L.tap('Enter');
  await t.shot('s-settings-reset-armed');

  /* ── Screens that come out of a race ─────────────────────────────────── */
  await t.js('NarbeScanManager.setAutoScan(false); NK.game.settings.set("steerMode","hold"); NK.game.__cfg.autoItems = true; true');

  // Pause, the real way: Escape in a race.
  await L.startRace('NK.game.setPlayers(1); NK.game.setMode("nofail"); NK.game.setType("single"); NK.game.setTrack("meadow");');
  await t.wait(2600);
  await t.key('keydown', 'Escape');
  await L.until('pause');
  await t.shot('s-pause');
  await L.checkFit('pause');
  await L.screen('confirmExit', { from: 'pause' });
  await t.shot('s-confirm-exit-race');

  // Single race, 3rd.
  await t.js('NK.ui.setScreen("pause"); true');
  await L.tap('Space');                      // step onto Continue
  await L.tap('Enter');                      // …and choose it
  await t.js('NK.game.__finishAs(3); true');
  await L.until('results');
  await t.wait(300);
  await t.shot('s-results-single-3rd');
  for (const [w, h] of SIZES) { await t.setSize(w, h); await L.checkFit('results @' + w + 'x' + h); if (w === 1024) await t.shot('s1024-results'); }

  // A win.
  await L.startRace('NK.game.setType("single");');
  await t.js('NK.game.__finishAs(1); true');
  await L.until('results');
  await t.shot('s-results-win');

  // Time trial, new best.
  await L.startRace('NK.game.setType("tt"); NK.game.setMode("open"); NK.game.setClass("medium"); NK.game.setTrack("candy");');
  await t.js('NK.game.__finishAs(1); true');
  await L.until('results');
  await t.shot('s-results-tt');

  // Two players.
  await L.startRace('NK.game.setPlayers(2); NK.game.setType("single"); NK.game.setMode("nofail");');
  await t.js('NK.game.__finishAs(4); true');
  await L.until('results');
  await t.shot('s-results-2p');

  // A whole Grand Prix: results → standings → next race, four times, then the trophy.
  await L.startRace('NK.game.setPlayers(1); NK.game.setType("gp"); NK.game.setMode("nofail"); NK.game.setClass("easy"); NK.game.setCup("sunshine");');
  for (let race = 1; race <= 4; race++) {
    await t.js('NK.game.__finishAs(' + (race === 2 ? 4 : 1) + '); true');
    await L.until('results');
    if (race === 1) await t.shot('s-results-gp');
    await L.tap('Space');
    await L.tap('Enter');                    // Standings
    await L.until('standings');
    if (race === 1) { await t.shot('s-standings'); await L.checkFit('standings'); }
    if (race === 4) { await t.shot('s-standings-final'); await L.checkFit('standings final'); }
    await L.tap('Space');
    await L.tap('Enter');                    // Next Race / Trophy Ceremony
    if (race < 4) await t.until('NK.ui.__dbg().inRace && !NK.ui.__dbg().overlayOn');
  }
  await L.until('trophy');
  await t.wait(300);
  await t.shot('s-trophy-gold');
  for (const [w, h] of SIZES) { await t.setSize(w, h); await L.checkFit('trophy @' + w + 'x' + h); }

  // No-Fail, a GP finished out of the podium: "Cup complete!".
  await t.js('NK.ui.setScreen("title"); true');
  await L.startRace('NK.game.setType("gp"); NK.game.setMode("nofail");');
  for (let race = 1; race <= 4; race++) {
    await t.js('NK.game.__finishAs(9); true');
    await L.until('results');
    await L.tap('Space'); await L.tap('Enter');
    await L.until('standings');
    await L.tap('Space'); await L.tap('Enter');
    if (race < 4) await t.until('NK.ui.__dbg().inRace && !NK.ui.__dbg().overlayOn');
  }
  await L.until('trophy');
  await t.shot('s-trophy-nofail-done');

  // The loading screen, exactly as index.html writes it.
  const page = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const from = page.indexOf('<div id="loading">');
  const loading = page.slice(from, page.indexOf('</div>\n</div>', from) + 6);
  await t.js('document.getElementById("app").insertAdjacentHTML("beforeend", ' + JSON.stringify(loading) + '); true');
  await t.wait(400);
  await t.shot('s-loading');
  await t.js('document.getElementById("loading").remove(); true');

  const said = await L.said();
  const has = (re) => said.some((s) => re.test(s));
  t.assert(has(/^NARBE Racer\. 1 Player, 2 Players/), 'title is announced', said.slice(0, 3));
  t.assert(has(/^Paused\. Continue, Restart, Settings/), 'pause is announced');
  t.assert(has(/You came third/), 'a 3rd place result is spoken');
  t.assert(has(/You won the gold trophy/), 'the trophy is spoken');
  t.assert(has(/Select again to erase all progress/), 'reset progress arms first');
  t.assert(!said.some((s) => /\d\s*seconds? to|hold .*\d+ ?s/i.test(s)), 'no hold duration is ever spoken');
};
