/**
 * Shared helpers for the ui-* scenarios (not a scenario itself).
 * Everything runs against tools/ui_mock.html: the real menus, HUD, controls and
 * input layer over the stand-in NK.game in tools/mock_game.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const GAME = path.resolve(__dirname, '..', '..');

module.exports = function (t) {
  const L = {};

  /** Real content files are used when they exist (and load cleanly). */
  L.withReal = function () {
    const have = (f) => fs.existsSync(path.join(GAME, 'js', f));
    const list = [];
    if (have('roster.js') && have('art.js')) list.push('roster');
    if (have('tracks.js') && have('themes.js') && have('spline.js')) list.push('tracks');
    return list;
  };

  L.boot = async function (opts) {
    const o = opts || {};
    const q = {};
    if (o.real) { const w = L.withReal(); if (w.length) q.with = w.join(','); }
    await t.load('apps/games/NARBEKART/tools/ui_mock.html', Object.keys(q).length ? q : undefined);
    await t.until('window.NK && NK.ui && NK.ui.ready');
    // Exit Game must not navigate the test page away: count the exits instead.
    await t.js('NK.game.__cfg.resultsDelay = 0.3; window.__left = 0; NK.ui.leave = function () { window.__left++; }; true');
    await t.wait(350);
    return q.with || '';
  };

  L.dbg = () => t.js('NK.ui.__dbg()');
  L.state = (h) => t.js('JSON.parse(JSON.stringify(NK.controls.state(' + (h | 0) + ')))');

  L.screen = async function (name, opts) {
    await t.js('NK.ui.setScreen(' + JSON.stringify(name) + ',' + JSON.stringify(opts || {}) + '); true');
    await t.wait(260);
  };

  /** Where the card sits, and whether anything would need a scrollbar. */
  L.fit = () => t.js('(function(){' +
    'var card=document.getElementById("nkCard"),r=card.getBoundingClientRect(),ov=document.getElementById("nkOverlay");' +
    'return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),' +
    'vw:innerWidth,vh:innerHeight,scroll:ov.scrollHeight>ov.clientHeight+1,transform:card.style.transform||"",' +
    'tight:card.classList.contains("tight")};})()');

  L.checkFit = async function (label) {
    const f = await L.fit();
    t.assert(f.top >= 0 && f.bottom <= f.vh && f.left >= 0 && f.right <= f.vw && !f.scroll, label + ' fits with no scrolling', f);
    return f;
  };

  /** A switch press: down, hold, up — then a gap past the scan-manager cooldown. */
  L.tap = async function (code, ms) {
    await t.press(code, ms === undefined ? 140 : ms);
    await t.wait(170);
  };

  L.calls = (fn) => t.js('NK.game.__calls.filter(function(c){return c.fn===' + JSON.stringify(fn) + '})');
  L.clearCalls = () => t.js('NK.game.__calls.length = 0; true');
  L.said = async function (from) { return (await t.spoken()).slice(from || 0).map((s) => s.text).filter(Boolean); };
  L.spokenCount = async function () { return (await t.spoken()).length; };

  /** Wait until the UI is showing a given card. */
  L.until = (name, ms) => t.until('NK.ui.__dbg().screen === ' + JSON.stringify(name) + ' && NK.ui.__dbg().overlayOn', ms || 8000);

  /** Start a race straight from the session (no menus), like the pick screens end. */
  L.startRace = async function (setup) {
    await t.js('(function(){' + (setup || '') + 'NK.ui.setScreen(NK.game.session.type === "gp" ? "cup" : "track"); return true;})()');
    await t.wait(250);
    // Focus is on the saved (or first) track/cup: choose it.
    await L.tap('Enter');
    await t.until('NK.ui.__dbg().inRace && !NK.ui.__dbg().overlayOn');
  };

  /** Leave a running race the way a player does: pause, scan to Main Menu, choose.
   *  Auto Scan is off while it walks the menu (with it on, two players' Space
   *  chooses rather than steps), then put back as it was. */
  L.quitRace = async function () {
    const auto = await t.js('NarbeScanManager.getSettings().autoScan');
    // Past scan-manager's release cooldown, or the first press is dropped.
    await t.wait(150);
    await t.js('NarbeScanManager.setAutoScan(false); NK.ui.openPause(-1); true');
    await L.until('pause');
    const d = await L.dbg();
    const at = d.rows.indexOf('Main Menu');
    const steps = d.index < 0 ? at + 1 : (at - d.index + d.rows.length) % d.rows.length;
    for (let i = 0; i < steps; i++) await L.tap('Space');
    await L.tap('Enter');
    await L.until('title');
    await t.js('NarbeScanManager.setAutoScan(' + !!auto + '); true');
  };

  return L;
};
