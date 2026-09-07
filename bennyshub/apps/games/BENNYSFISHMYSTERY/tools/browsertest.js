/**
 * The game in a REAL browser, played with two switches.
 *
 *     python -m http.server 8765 --bind 127.0.0.1      (from bennyshub/)
 *     node tools/browsertest.js [outDir]
 *
 * Headless Chrome with WebGL, driven the way a player drives it: SPACE steps,
 * ENTER picks, holds steer and cast. It goes menu -> dock -> tackle counter ->
 * back -> boat out -> steer -> pull over -> cast -> land, taking a screenshot
 * at every stage and collecting every console error and uncaught exception.
 *
 * Needs puppeteer-core (npm i puppeteer-core) and an installed Chrome. The
 * headless node harness (tools/playtest.js) proves the RULES; this proves the
 * page - shaders, textures, the DOM, the real canvas - which is where "could
 * not be parsed as a color" lived while every node check passed.
 */
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.join(process.env.TEMP || '.', 'fishmaster-browsertest');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.FM_URL || 'http://127.0.0.1:8765/apps/games/BENNYSFISHMYSTERY/index.html';
const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) {
  try { puppeteer = require(path.join(process.env.FM_NODE_MODULES || '', 'puppeteer-core')); }
  catch (e2) { console.error('puppeteer-core not found. npm i puppeteer-core (or set FM_NODE_MODULES).'); process.exit(2); }
}

let fail = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fail++; console.log('  FAIL  ' + msg); } else console.log('  ok    ' + msg); return c; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
           '--window-size=1280,720', '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  const errors = [], logs = [];
  page.on('pageerror', (e) => errors.push('uncaught: ' + (e.message || e)));
  let lastFailedUrl = '';
  page.on('requestfailed', (r) => { lastFailedUrl = r.url(); });
  page.on('console', (m) => { const t = m.type(); if (t === 'error') { const u = m.location().url || ''; if (/Failed to load resource/.test(m.text()) && (/favicon/.test(u) || /\/images\//.test(u))) return; errors.push('console.error: ' + m.text() + ' @ ' + u); } else if (t === 'warn') logs.push(m.text()); });
  /* WITH THE REASON. "request failed" on its own cannot be acted on: an
     abort and a missing file look identical in the log and are opposite
     problems. */
  page.on('requestfailed', (r) => {
    const why = ((r.failure && r.failure()) || {}).errorText || 'no reason given';
    /* A CANCELLED CLIP IS NOT A BROKEN ONE. Walt's lines interrupt each other
       by design - the interface cuts him off when you press on, and speakSeq
       pauses one clip to start the next - and the browser logs every one of
       those as a failed request with ERR_ABORTED. A clip that is genuinely
       missing is a 404, which is caught below and is a different thing
       entirely. Without this the suite failed at random depending on exactly
       when a press landed. */
    if (/ERR_ABORTED/.test(why) && /\/audio\/vo\//.test(r.url())) return;
    errors.push('request failed: ' + r.url() + '  (' + why + ')');
  });
  /* Missing ART is reported, not failed: a picture still to be drawn hides
     itself (every <img> has a fallback) and is not a broken game. */
  const missingArt = [];
  page.on('response', (r) => {
    if (r.status() < 400 || /favicon\.ico$/.test(r.url())) return;
    if (/\/images\/.*\.png$/.test(r.url())) { missingArt.push(r.url().replace(/^.*\/images\//, 'images/')); return; }
    errors.push('HTTP ' + r.status() + ' ' + r.url());
  });

  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); };
  const state = () => page.evaluate(() => {
    const G = window.RT && RT.game; const r = G && G.run;
    return { loading: document.getElementById('loading').style.display, state: G ? G.state : null,
             x: r ? Math.round(r.x) : null, z: r ? Math.round(r.z) : null, head: r ? +r.head.toFixed(2) : null,
             overlayOn: getComputedStyle(document.getElementById('overlay')).display !== 'none',
             overlayText: (document.getElementById('overlay').innerText || '').slice(0, 160).replace(/\s+/g, ' '),
             dock: (window.RT && RT.scene && RT.scene.dockLayout) ? RT.scene.dockLayout().find(r => r.name === 'boat') : null,
             labels: Array.from(document.querySelectorAll('.worldLabel, .dockLabel, [data-dock-label]')).map(e => e.innerText.trim()).filter(Boolean),
             minimap: document.getElementById('minimap').style.display,
             money: G ? G.getSave().money : null, vessel: G && G.vessel ? G.vessel().id : null,
             hud: (document.getElementById('hud').innerText || '').replace(/\s+/g, ' ').slice(0, 200) };
  });
  const hold = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };
  /**
   * Answer Walt: press, and press again if the first one only read the row.
   *
   * His cards listen before they act - the row is your own line, and hearing
   * it before you say it is the whole point of the change - so one press
   * speaks it and the next says it. Anywhere else the first press does the
   * thing, and the second is harmless: the card has already moved on.
   */
  /**
   * Step to the row you want, then take it - which is how a switch is used.
   *
   * Pressing ENTER blind assumes the cursor is where you left it, and it is
   * not always: opening a card with a click can leave the cursor on whatever
   * row was under the pointer. A player hears the wrong row and steps on.
   */
  const choose = async (re, tries) => {
    for (let i = 0; i < (tries || 8); i++) {
      /* NOTHING SELECTED IS A REAL STATE. Walt's cards open with no row
         highlighted, so that the first press has to be a step and a step
         reads the row out. A script that asks "what row am I on" gets
         nothing, and the answer is to press SPACE - which is what a player
         does too. */
      const d = await page.evaluate(() => (RT.ui.__dbg ? RT.ui.__dbg() : null));
      const row = d && d.selected ? String((d.rows || [])[d.index] || '') : null;
      if (row !== null && re.test(row)) { await tap('Enter'); return true; }
      await tap('Space');
      await sleep(320);
    }
    return false;
  };

  const answer = async () => {
    const was = await page.evaluate(() =>
      (document.getElementById('overlay').innerText || '').slice(0, 80));
    await tap('Enter');
    await sleep(450);
    const now = await page.evaluate(() =>
      (document.getElementById('overlay').innerText || '').slice(0, 80));
    if (now === was) await tap('Enter');
  };
  /** Click a thing in the scene by its target key - hover to focus, click to pick. */
  const clickTarget = async (key) => {
    const px = await page.evaluate((key) => {
      const G = RT.game; const pos = G.dockLabelPositions() || [];
      const i = pos.findIndex(p => p.key === key);
      if (i < 0) return null;
      const lx = pos[i].x, ly = pos[i].y;
      for (let dy = -20; dy < 260; dy += 8) { if (G.pickTarget(lx, ly + dy) === i) return { x: lx, y: ly + dy }; }
      for (let dx = -60; dx <= 60; dx += 20) for (let dy = 0; dy < 260; dy += 12) { if (G.pickTarget(lx + dx, ly + dy) === i) return { x: lx + dx, y: ly + dy }; }
      return null;
    }, key);
    if (!px) return false;
    await page.mouse.move(px.x, px.y); await sleep(250);
    await page.mouse.click(px.x, px.y); await sleep(1400);
    return true;
  };
  const tap = async (key) => hold(key, 90);

  console.log('BROWSER PLAYTEST  ' + URL);
  console.log('==================');
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  // A fresh game, every time.
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('loading').style.display === 'none', { timeout: 30000 }).catch(() => {});
  let s = await state();
  ok(s.loading === 'none', 'the lake filled - loading screen gone (display=' + s.loading + ')');
  await sleep(1500);
  await shot('01_menu');
  ok(/Play Game/i.test(s.overlayText), 'the main menu is up: ' + s.overlayText.slice(0, 60));
  /* THE SONAR IS NOT ON THE SCREEN. It is a six-second reading at the end of
     the game, and `display:flex` on an id beats the browser's own
     [hidden]{display:none} - so it sat in the middle of the lake from the
     first cast until somebody opened the game and saw it. Only a real browser
     can answer this: it is a question about which CSS rule wins. */
  const dish = await page.evaluate(() => {
    const el = document.getElementById('sonar');
    if (!el) return { missing: true };
    return { hidden: el.hidden, display: getComputedStyle(el).display,
             height: Math.round(el.getBoundingClientRect().height) };
  });
  ok(!dish.missing && dish.display === 'none' && dish.height === 0,
     'the sonar dish is nowhere on screen until it is in the water (' +
     JSON.stringify(dish) + ')');


  // Play Game is the first row: ENTER picks it.
  await tap('Enter');
  await sleep(2500);
  s = await state();
  await shot('02_dock');
  ok(!s.overlayOn, 'the menu closed and the dock is up');
  /* AND NO MISSION UNTIL YOU HAVE ONE. Standing on the dock of a brand new
     game, having never spoken to Walt: the board used to read MISSION 1 over
     "Minnows & shiners 0 / 30" - a job not yet given, with a tally that
     could not move. The chip is taken off with the hidden attribute and
     whether that wins against the stylesheet is a question only a browser can
     answer, which is why it is asked here. */
  const board = await page.evaluate(() => {
    const el = id => document.getElementById(id);
    const off = e => !e || e.hidden || getComputedStyle(e).display === 'none' ||
                     Math.round(e.getBoundingClientRect().height) === 0;
    return { missionOff: off(el('dockMission')), hudMissionOff: off(el('hudMission')),
             task: el('dockTask') ? el('dockTask').textContent.trim() : '(none)',
             briefed: RT.game.isBriefed() };
  });
  ok(board.briefed === false, 'a brand new game has not been briefed yet');
  ok(board.missionOff && board.hudMissionOff,
     'and no mission number is on screen (' + JSON.stringify(board) + ')');
  ok(/see Walt/i.test(board.task),
     'and the board sends you to the shop: "' + board.task + '"');
  ok(s.dock && s.dock.visible === false && s.dock.vessel === 'foot', 'on foot there is NO boat at the dock (' + JSON.stringify(s.dock && { visible: s.dock.visible, vessel: s.dock.vessel }) + ')');
  const refused = await page.evaluate(() => { const r = RT.game.castOff(); return { r, run: !!RT.game.run, rods: RT.game.getSave().rods.slice() }; });
  const locked = await page.evaluate(() => ({ canoe: RT.game.buyVessel('canoe'), magnet: RT.game.buyTool('magnet_1'),
                                              money: (RT.game.getSave().money = 5000) && RT.game.buyVessel('canoe') }));
  ok(!locked.canoe && !locked.magnet && !locked.money, 'the canoe and the magnet are not for sale yet, at any price');
  await page.evaluate(() => { RT.game.getSave().money = 5; });
  ok(refused.r === false && !refused.run && refused.rods.length === 0, 'no fishing before Walt: castOff refused (' + JSON.stringify(refused) + ')');

  // ENTER picks whatever the world scan is on; SPACE steps it. Walk the
  // targets until the one that opens is the shop (the sign opens the menu).
  // Walk in: click the shop (the shop is a scene of its own - counter, tackle
  // wall, door), then click Walt at the counter.
  ok(await clickTarget('shop'), 'clicked the tackle shop');
  s = await state();
  await shot('03_shop');
  ok(!s.overlayOn, 'inside the shop: the counter, the tackle wall and the door are the choices');
  ok(await clickTarget('keeper'), 'clicked Walt at the counter');
  s = await state();
  await shot('03a_counter');
  ok(s.overlayOn && /Talk to Walt/i.test(s.overlayText), 'Walt offers to talk first: ' + s.overlayText.slice(0, 90));
  /* Talk to Walt is the first row. The briefing is a conversation now - he
     says a bit, you answer, he says the next bit - so it takes a few presses,
     and the last one is where the net changes hands. */
  /* TWO PRESSES A TURN, at the counter and in the conversation. The first
     press on one of Walt's cards reads the row out - it is your own line, and
     hearing it before you say it is the point - and the second one says it.
     A player does this without thinking; a script has to be told. */
  ok(await choose(/talk to walt/i), 'stepped to "Talk to Walt" and took it');
  await sleep(1400);
  s = await state();
  await shot('03b_walt_brief');
  ok(s.overlayOn && /Well, hey there/i.test(s.overlayText), 'Walt opens the conversation: ' + s.overlayText.slice(0, 80));
  /* PRESS UNTIL HE HAS FINISHED, rather than a fixed number of times. Each
     turn takes two presses now - the first reads your line out, the second
     says it - so counting presses is counting the wrong thing. What matters
     is that the brief arrives in turns and ends with a net in your hands. */
  const turns = [];
  for (let i = 0; i < 26; i++) {
    const st2 = await page.evaluate(() => ({ briefed: RT.game.isBriefed(), text: (document.getElementById('overlay').innerText || '').replace(/\s+/g, ' ').slice(0, 70) }));
    if (turns[turns.length - 1] !== st2.text) turns.push(st2.text);
    if (process.env.FM_TRACE) {
      const d = await page.evaluate(() => (RT.ui.__dbg ? RT.ui.__dbg() : {}));
      console.log('    [trace] ' + String(d.screen).padEnd(10) + ' armed=' +
                  (d.selected ? 'on a row ' : 'nothing selected ') + 'index=' + d.index + ' of ' +
                  JSON.stringify(d.rows));
    }
    if (st2.briefed) break;
    /* His cards are a conversation: step onto your own line, hear it, say
       it. Never onto "Say that again", which would be a very patient loop. */
    /* Onto your own line - anything but the repeat row, which would be a
       very patient loop - and take it. */
    if (!(await choose(/^(?!Say that again)/i, 5))) await tap('Enter');
    await sleep(700);
  }
  ok(turns.length >= 3, 'the brief came in turns, not one wall of text (' + turns.length + ' cards)');
  const afterBrief = await page.evaluate(() => ({ rods: RT.game.getSave().rods.slice(), briefed: RT.game.isBriefed() }));
  ok(afterBrief.rods.indexOf('hand_net') >= 0 && afterBrief.briefed, 'the mesh hand net is now yours (' + JSON.stringify(afterBrief) + ')');
  await answer(); await sleep(900);                           // Thanks -> back to the counter
  await page.evaluate(() => { RT.game.goToDock(); }); await sleep(800);

  await page.evaluate(() => { RT.game.goToDock(); }); await sleep(900);
  s = await state();
  await shot('03b_dock_with_net');
  // Now the boards are a place to fish from. Drive the trip through the API,
  // then read back what a player would see.
  await page.evaluate(() => { RT.game.castOff(); });
  await sleep(1500);
  s = await state();
  await shot('04_trip_start');
  ok(!!s.state && s.state !== 'attract', 'a trip started, state=' + s.state + ' at ' + s.x + ',' + s.z + ' in the ' + s.vessel);
  ok(/tag|Net|lbs|\$/i.test(s.hud), 'the HUD reads: ' + s.hud.slice(0, 120));

  // On foot the spot card is up: ENTER on the rod -> aim -> hold ENTER to charge -> release throws.
  await tap('Enter'); await sleep(600);
  s = await state(); console.log('  after picking the rod: state ' + s.state);
  await hold('Enter', 1200); await sleep(900);
  s = await state();
  await shot('05_cast');
  ok(['flying', 'waiting', 'hooking', 'reeling', 'landing', 'card', 'aim', 'charge', 'spot'].indexOf(String(s.state)) >= 0,
     'a cast is in play, state=' + s.state);
  // Wait for a bite (up to 25 s), hook it on the press, hold to reel.
  const bit = await page.waitForFunction(() => { const G = RT.game; return G.state === G.S.HOOKING || G.state === G.S.CARD || G.state === G.S.SPOT; }, { timeout: 45000 }).then(() => true).catch(() => false);
  s = await state();
  if (s.state === 'hooking') {
    await page.keyboard.down('Enter');
    await page.waitForFunction(() => RT.game.state !== RT.game.S.REELING && RT.game.state !== RT.game.S.HOOKING, { timeout: 30000 }).catch(() => {});
    await page.keyboard.up('Enter');
    await sleep(2500);
  }
  s = await state();
  await shot('06_after_bite');
  ok(bit, 'something happened on the line within 45 s (state=' + s.state + ', card: ' + s.overlayText.slice(0, 80) + ')');

  /* The way back off the boards. It is a button beside the cast, and it must
     put you on the dock - it used to fall through to the signpost's handler
     and quit to the main menu, which is the worst thing a "back" button can
     do. */
  await page.evaluate(() => { if (RT.game.run) RT.game.returnToDock(); RT.game.goToDock(); });
  await sleep(700);
  await page.evaluate(() => { const sv = RT.game.getSave(); sv.vessels = ['foot']; sv.vessel = 'foot';
                              sv.briefed = sv.currentMission; RT.game.goToDock(); RT.game.castOff(); });
  await sleep(1200);
  const outOnBoards = await page.evaluate(() => ({ run: !!RT.game.run, state: RT.game.state }));
  ok(outOnBoards.run, 'picking the spot at the end of the boards starts fishing (' + JSON.stringify(outOnBoards) + ')');
  await page.evaluate(() => {
    const el = document.getElementById('tcDock');
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await sleep(1600);
  const backIn = await page.evaluate(() => ({
    run: !!RT.game.run,
    menu: /Play Game/i.test(document.getElementById('overlay').innerText || ''),
    dockHud: getComputedStyle(document.getElementById('dockHud')).display,
  }));
  await shot('13_back_to_dock');
  ok(!backIn.run && !backIn.menu && backIn.dockHud !== 'none',
     'Back to the Dock puts you on the dock, not in the main menu (' + JSON.stringify(backIn) + ')');

  // Sell the trip: back to the dock, then the counter.
  await page.evaluate(() => { RT.game.returnToDock(); }); await sleep(1200);
  await shot('07_dock_again');

  // Now a boat trip: give the player the canoe and go steering, so the water,
  // the cue and the pull-over are exercised in the real renderer.
  await page.evaluate(() => {
    /* The shelf follows the ladder, so a canoe cannot be bought on the first
       morning at any price. Walk the ladder forward to the job that puts it
       on the counter, then buy it - which is also the check that the gate
       opens when it should. */
    const sv = RT.game.getSave();
    sv.currentMission = 6; sv.highestMission = 6; sv.briefed = 6; sv.money = 400;
    RT.game.buyRod('bamboo_rod'); RT.game.buyVessel('canoe'); RT.game.castOff();
  });
  await sleep(1000);
  await hold('Enter', 2500);               // helm over to starboard, under way
  await sleep(4000);
  s = await state();
  await shot('08_canoe_underway');
  ok(s.vessel === 'canoe' && s.state === 'steer', 'the canoe is under way: state=' + s.state + ' at ' + s.x + ',' + s.z);
  ok(s.minimap !== 'none', 'the minimap is showing under way (display=' + JSON.stringify(s.minimap) + ')');
  // Steer until a cue, then pull over toward it (hold), and land on the spot card.
  const cued = await page.waitForFunction(() => { const G = RT.game; return !!(G.run && Object.keys(G.run.cued || {}).length); }, { timeout: 60000 }).then(() => true).catch(() => false);
  ok(cued, 'a shoal was called while trolling');
  await page.evaluate(() => { const G = RT.game; const side = G.run.armed || 'right'; G.pullOverTo(side); });
  const arrived = await page.waitForFunction(() => RT.game.isFishing && RT.game.isFishing(), { timeout: 20000 }).then(() => true).catch(() => false);
  await sleep(1500);
  s = await state();
  await shot('09_pulled_over');
  ok(arrived, 'pulled over onto the spot (state=' + s.state + ')');


  // The dock with each vessel tied up, as the ladder is climbed.
  for (const v of ['canoe', 'kayak', 'motorboat']) {
    await page.evaluate((id) => {
      /* Own exactly the one being looked at, so the dock shows THAT hull and
         not whatever was bought a check ago. */
      const sv = RT.game.getSave();
      sv.money = 5000; sv.currentMission = 30; sv.highestMission = 30;
      sv.vessels = ['foot']; sv.vessel = 'foot';
      if (RT.game.run) RT.game.returnToDock();
      RT.game.buyVessel(id);
      RT.game.goToDock();
    }, v);
    await sleep(1600);
    s = await state();
    await shot('10_dock_' + v);
    ok(s.dock && s.dock.visible === true && s.dock.vessel === v, 'the ' + v + ' is tied at the dock (' + JSON.stringify(s.dock && { visible: s.dock.visible, vessel: s.dock.vessel, ft: +s.dock.depthFt.toFixed(1) }) + ')');
  }

  console.log();
  /* What the counter is allowed to talk about. Asked of the game rather than
     of the rendered card: the tackle screen adds the fuel and repair tiles if
     and only if these say so (js/ui.js), and driving the whole UI back to a
     clean counter here only tested the test. */
  const svc = await page.evaluate(() => {
    RT.game.resetProgress();
    const onFoot = { fuel: RT.game.burnsFuel(), hull: RT.game.hasHull(), vessel: RT.game.vessel().id };
    const sv = RT.game.getSave();
    sv.currentMission = 6; sv.highestMission = 6; sv.money = 400;
    RT.game.buyVessel('canoe');
    const canoe = { fuel: RT.game.burnsFuel(), hull: RT.game.hasHull(), vessel: RT.game.vessel().id };
    sv.currentMission = 30; sv.highestMission = 30; sv.money = 3000;
    RT.game.buyVessel('kayak');
    const kayak = { fuel: RT.game.burnsFuel(), hull: RT.game.hasHull(), vessel: RT.game.vessel().id };
    RT.game.buyVessel('motorboat');
    const motor = { fuel: RT.game.burnsFuel(), hull: RT.game.hasHull(), vessel: RT.game.vessel().id };
    return { onFoot, canoe, kayak, motor };
  });
  ok(!svc.onFoot.fuel && !svc.onFoot.hull, 'on foot the counter has no fuel and no hull to talk about');
  ok(!svc.canoe.fuel && !svc.canoe.hull, 'a rented canoe has neither either - it is not yours to repair');
  ok(!svc.kayak.fuel && svc.kayak.hull, 'the kayak has a hull to look after and no tank');
  ok(svc.motor.fuel && svc.motor.hull, 'the motorboat has both');

  if (missingArt.length) console.log('art still to draw (hidden in game): ' + Array.from(new Set(missingArt)).join(', '));
  console.log('console warnings: ' + logs.length + (logs.length ? '  e.g. ' + logs[0].slice(0, 120) : ''));
  ok(errors.length === 0, 'no console errors, uncaught exceptions or failed requests' + (errors.length ? ':\n    ' + errors.slice(0, 12).join('\n    ') : ''));
  console.log();
  console.log('screenshots in ' + OUT);
  console.log(fail === 0 ? checks + ' checks passed. The game runs in a browser.' : fail + ' of ' + checks + ' checks failed.');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('browsertest crashed:', e); process.exit(1); });
