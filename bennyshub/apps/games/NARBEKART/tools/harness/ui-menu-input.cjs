/**
 * Menu input, proved through real key events (window capture → scan-manager →
 * document, like a switch):
 *   Space steps on RELEASE, Enter chooses on RELEASE; hold Space scans back;
 *   Auto Scan steps by itself and waits while a switch is held, then the release
 *   chooses what was lit when the press began; a switch held as a card opens is
 *   swallowed and the results card opens with nothing focused; Settings opened
 *   from pause returns to pause; Reset Progress is two-step; two-player own-pick
 *   screens take only their owner's switch; narbe-input-cancelled releases only
 *   the key it names, and a too-short press still steps.
 */
const lib = require('./ui-lib.cjs');

module.exports = async function (t) {
  const L = lib(t);
  await L.boot();
  const idx = async () => (await L.dbg()).index;
  const scr = async () => (await L.dbg()).screen;

  /* ── Space steps on release, Enter chooses on release ──────────────── */
  await L.screen('title');
  t.assert(await idx() === 0, 'title opens on 1 Player');
  await t.key('keydown', 'Space');
  await t.wait(250);
  t.assert(await idx() === 0, 'Space DOWN does not move the highlight');
  await t.key('keyup', 'Space');
  await t.wait(120);
  t.assert(await idx() === 1, 'Space RELEASE steps to the next item');
  await t.wait(120);
  await L.tap('Space');                                  // → How to Play
  await t.key('keydown', 'Enter');
  await t.wait(250);
  t.assert(await scr() === 'title', 'Enter DOWN does not choose');
  await t.key('keyup', 'Enter');
  await t.wait(200);
  t.assert(await scr() === 'howto', 'Enter RELEASE chooses (How to Play opened)');

  /* ── Hold Space scans backwards, at the scan speed ──────────────────── */
  await t.js('NarbeScanManager.setScanSpeedIndex(0); true');   // 1 s
  await L.screen('title');
  const said0 = await L.spokenCount();
  await t.key('keydown', 'Space');
  await t.wait(2700);
  t.assert(await idx() === 0, 'holding Space does nothing before the back-scan starts');
  await t.until('NK.ui.__dbg().index === 4', 1500);
  t.assert(true, 'hold Space scans backwards (wrapped to Exit Game)');
  await t.until('NK.ui.__dbg().index === 3', 1600);
  t.assert(true, 'the back-scan repeats at the scan interval (now on Settings)');
  await t.key('keyup', 'Space');
  await t.wait(300);
  t.assert(await idx() === 3, 'releasing after a back-scan does not also step forward');
  const saidBack = await L.said(said0);
  t.assert(saidBack.indexOf('Exit Game') >= 0 && saidBack.indexOf('Settings') >= 0, 'each back-scan step is spoken', saidBack);

  /* ── Auto Scan: steps on its own, waits while held ──────────────────── */
  await t.js('NarbeScanManager.toggleAutoScan(); true');
  await L.screen('title');
  t.assert((await L.dbg()).autoScanRunning, 'Auto Scan timer runs on a card');
  t.assert(/picks the highlighted item/.test(await t.js('document.getElementById("nkHint").textContent')), 'hint follows the scheme (Auto Scan)');
  await t.until('NK.ui.__dbg().index === 1', 1600);
  await t.until('NK.ui.__dbg().index === 2', 1600);
  t.assert(true, 'Auto Scan steps by itself');
  await t.key('keydown', 'Enter');
  const heldAt = await idx();
  await t.wait(2600);
  t.assert(await idx() === heldAt && !(await L.dbg()).autoScanRunning, 'Auto Scan waits while a switch is held', { heldAt, now: await idx() });
  await t.key('keyup', 'Enter');
  await t.wait(250);
  const rowsTitle = ['1 Player', '2 Players', 'How to Play', 'Settings', 'Exit Game'];
  t.assert(await scr() === { 2: 'howto', 3: 'settings', 1: 'rules', 0: 'rules' }[heldAt], 'the release chooses what was lit when the press began', rowsTitle[heldAt]);
  await t.js('NarbeScanManager.setAutoScan(false); true');

  /* ── Too-short presses: scan-manager cancels, the menu still steps ──── */
  await L.screen('title');
  await t.js('(function(){' +
    'document.dispatchEvent(new KeyboardEvent("keydown",{code:"Space",key:" ",bubbles:true,cancelable:true}));' +
    'document.dispatchEvent(new KeyboardEvent("keyup",{code:"Space",key:" ",bubbles:true,cancelable:true}));' +
    'return true;})()');
  await t.wait(200);
  t.assert(await idx() === 1, 'a too-short press (cancelled by scan-manager) still steps exactly once', await idx());

  /* ── narbe-input-cancelled releases only the key it names ────────────── */
  await L.screen('title');
  await t.wait(150);
  await t.key('keydown', 'Space');
  await t.wait(80);
  await t.key('keydown', 'Enter');
  await t.wait(80);
  await t.js('document.dispatchEvent(new CustomEvent("narbe-input-cancelled",{bubbles:true,detail:{key:" ",code:"Space",reason:"too-short"}})); true');
  await t.wait(120);
  const kd = (await L.dbg()).keyDown;
  t.assert(kd.Space === false && kd.Enter === true, 'cancelling Space leaves Enter held', kd);
  t.assert(await idx() === 1, 'the cancelled Space press still stepped');
  await t.key('keyup', 'Enter');
  await t.wait(200);
  t.assert(await scr() === 'rules', "Enter's own release still chooses (2 Players)");
  await t.key('keyup', 'Space');                         // the real key-up that scan-manager would have eaten

  /* ── Pause → Settings → Back returns to pause ───────────────────────── */
  await L.startRace('NK.game.setPlayers(1); NK.game.setType("single"); NK.game.setMode("nofail");');
  await t.until('NK.game.phase() === "racing"', 8000);
  await t.key('keydown', 'Escape');
  await L.until('pause');
  t.assert(await idx() === -1, 'pause opens with nothing focused');
  await L.tap('Space'); await L.tap('Space'); await L.tap('Space');   // Continue → Restart → Settings
  t.assert(await idx() === 2, 'stepped to Settings on the pause card');
  await L.tap('Enter');
  await L.until('settings');
  // Hold Space to scan backwards onto ← Back (the last item).
  await t.key('keydown', 'Space');
  await t.until('NK.ui.__dbg().index === NK.ui.__dbg().rows.length - 1', 5000);
  await t.key('keyup', 'Space');
  await t.wait(200);
  await L.tap('Enter');
  await L.until('pause');
  t.assert(await idx() === 2 && await t.js('NK.game.isPaused()'), 'Back from Settings returns to the pause card, on Settings, still paused');
  await L.quitRace();

  /* ── Reset Progress is two-step ─────────────────────────────────────── */
  await L.screen('settings');
  const rows = (await L.dbg()).rows;
  const resetAt = rows.findIndex((r) => /Reset Progress/.test(r));
  await L.screen('settings', { index: resetAt });
  await L.clearCalls();
  const said1 = await L.spokenCount();
  await L.tap('Enter');
  t.assert((await L.calls('resetProgress')).length === 0, 'the first choose only arms Reset Progress');
  t.assert(await t.js('document.querySelector("#nkMenu .nkItem.focused .val") && document.querySelector("#nkMenu .nkItem.focused .val").textContent') === 'Sure?', 'it now asks "Sure?"');
  await L.tap('Enter');
  t.assert((await L.calls('resetProgress')).length === 1, 'the second choose erases progress');
  const saidReset = await L.said(said1);
  t.assert(saidReset.indexOf('Select again to erase all progress') >= 0 && saidReset.indexOf('Progress reset') >= 0, 'both steps are spoken', saidReset);

  /* ── Two players: own pick screens take only their owner's switch ──── */
  await t.js('NarbeScanManager.setAutoScan(false); NK.game.setPlayers(2); true');
  await L.screen('racer', { player: 0 });
  let d = await L.dbg();
  t.assert(d.owner === 0 && d.autoScanRunning, "P1's racer screen scans by itself even with Auto Scan off");
  t.assert(/Player 1/.test(await t.js('document.getElementById("nkHint").textContent')), 'hint names Player 1 and Space');
  await L.clearCalls();
  await L.tap('Enter', 200);                              // P2's switch: ignored
  t.assert(await scr() === 'racer' && (await L.calls('setPick')).length === 0, "P2's Enter does nothing on P1's screen");
  await t.until('NK.ui.__dbg().index >= 2', 6000);         // let it scan onto a racer
  await t.key('keydown', 'Space');
  const p1At = await idx();
  const p1Row = (await L.dbg()).rows[p1At];
  await t.wait(1500);
  t.assert(await idx() === p1At, 'the highlight waits while P1 holds Space');
  await t.key('keyup', 'Space');
  await t.wait(250);
  let picks = await L.calls('setPick');
  t.assert(picks.length === 1 && picks[0].args[0] === 0, 'P1 chooses with Space: the racer lit when the press began', { p1Row, picks });
  t.assert(await scr() === 'kart' && (await L.dbg()).owner === 0, "on to P1's kart screen");
  await L.tap('Space', 200);                              // P1 picks whatever kart is lit
  await L.until('racer');
  d = await L.dbg();
  t.assert(d.owner === 1, "then P2's racer screen");
  await L.clearCalls();
  await L.tap('Space', 200);                              // P1's switch: ignored now
  t.assert(await scr() === 'racer' && (await L.calls('setPick')).length === 0, "P1's Space does nothing on P2's screen");
  await t.until('NK.ui.__dbg().index >= 2', 6000);
  await L.tap('Enter', 200);
  picks = await L.calls('setPick');
  t.assert(picks.length === 1 && picks[0].args[0] === 1, 'P2 chooses with Enter', picks);
  const said = await L.said();
  t.assert(said.indexOf('Player 1, press Space when your racer is lit.') >= 0 &&
           said.indexOf('Player 2, press Enter when your racer is lit.') >= 0, 'own-pick screens say whose switch picks');

  /* ── Two players, Auto Scan on: either switch chooses on shared cards ── */
  await t.js('NarbeScanManager.setAutoScan(true); true');
  await L.screen('rules');                                // opens on the saved rules
  await L.tap('Space', 150);
  t.assert(await scr() === 'type', 'with Auto Scan on, Space (Player 1) chooses on a shared card');
  await t.js('NarbeScanManager.setAutoScan(false); NK.game.setPlayers(1); true');

  /* ── Exit Game: speaks, then hands focus back to the hub ─────────────── */
  await L.screen('title', { index: 4 });
  const said2 = await L.spokenCount();
  await L.tap('Enter');
  await t.wait(900);
  t.assert(await t.js('window.__left') === 1, 'Exit Game leaves for the hub after its line');
  t.assert((await L.said(said2)).indexOf('Exiting to hub') >= 0, '"Exiting to hub" is spoken');

  /* ── A held switch is swallowed when a card opens; results open blank ── */
  await L.startRace('NK.game.setType("single");');
  await t.until('NK.game.phase() === "racing"', 8000);
  await t.key('keydown', 'Enter');                        // steering right as the race ends
  await t.js('NK.game.__finishAs(2); true');
  await L.until('results');
  d = await L.dbg();
  t.assert(d.index === -1 && d.ignore.Enter === true, 'results open with nothing focused and the held Enter swallowed', d);
  await t.key('keyup', 'Enter');
  await t.wait(250);
  d = await L.dbg();
  t.assert(d.screen === 'results' && d.index === -1, 'releasing that Enter neither chooses nor steps');
  await L.tap('Enter');
  t.assert((await L.dbg()).index === 0, 'the first real press only steps onto the first item');

  const all = await L.said();
  t.assert(all.some((s) => /^Finish! You came second/.test(s)), 'the result is spoken');
  t.assert(!all.some((s) => /\b\d+\s*seconds?\b.*hold|hold.*\b\d+\s*seconds?\b/i.test(s)), 'no hold duration is ever spoken');
};
