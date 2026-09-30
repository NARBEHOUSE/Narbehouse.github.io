/** Interrupted phone touches must not leave menu Auto Scan stopped. */
'use strict';

module.exports = async function (t) {
  const L = require('./ui-lib.cjs')(t);
  await t.setSize(390, 844);
  await L.boot({ real: true });
  await t.js('NarbeScanManager.setScanSpeedIndex(0); NarbeScanManager.setAutoScan(true); true');
  await L.screen('settings');
  const pace = await t.js('NarbeScanManager.getScanInterval()');

  async function touchStart(id) {
    await t.js(`(() => {
      const el = document.querySelector('#nkMenu .focused');
      const r = el.getBoundingClientRect();
      const finger = new Touch({ identifier: ${id}, target: el, clientX: r.left + 20, clientY: r.top + 20 });
      el.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true, cancelable: true, touches: [finger], targetTouches: [finger], changedTouches: [finger]
      }));
      return true;
    })()`);
  }

  async function checkAdvance(label) {
    const before = await L.dbg();
    await t.wait(pace + 180);
    const after = await L.dbg();
    t.assert(after.autoScanRunning && after.index !== before.index, label, { before, after });
  }

  t.assert((await L.dbg()).autoScanRunning, 'Auto Scan begins on the phone settings screen');
  await touchStart(1);
  const held = await L.dbg();
  await t.wait(pace + 150);
  const waiting = await L.dbg();
  t.assert(!waiting.autoScanRunning && waiting.index === held.index,
    'A finger on the menu pauses scanning without moving the selection', waiting);

  // Deliberately omit touchend/touchcancel: the interrupted sequence is the bug.
  await t.js("window.dispatchEvent(new Event('blur')); true");
  await L.screen('settings');
  t.assert((await L.dbg()).autoScanRunning, 'A new card scans after blur interrupts a touch');
  await checkAdvance('Auto Scan actually advances after interrupted-touch blur');

  await touchStart(2);
  t.assert(!(await L.dbg()).autoScanRunning, 'A second touch pauses scanning');
  t.note('Visibility is simulated on document because the Electron window stays hidden throughout this test.');
  try {
    await t.js(`(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      return true;
    })()`);
    await L.screen('settings');
    const hidden = await L.dbg();
    await t.wait(pace + 150);
    const stillHidden = await L.dbg();
    t.assert(!stillHidden.autoScanRunning && stillHidden.index === hidden.index,
      'Hidden pages keep scanning stopped even when the menu is rebuilt', stillHidden);
    await t.js(`(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      return true;
    })()`);
    t.assert((await L.dbg()).autoScanRunning, 'Returning to a visible page resumes scanning without a touch release');
    await checkAdvance('Auto Scan actually advances after interrupted-touch visibility loss');
  } finally {
    await t.js("delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); true");
  }
  t.assert((await t.js('NarbeScanManager.getSettings()')).autoScan,
    'Interruptions preserve the player’s Auto Scan preference');

  // The real game decides phone split orientation; the UI mock does not.
  await t.setSize(1368, 840);
  await t.load('apps/games/NARBEKART/index.html');
  await t.until('window.NK && NK.ui && NK.ui.ready');
  await t.js("NarbeScanManager.setAutoScan(false); NK.game.settings.set('split', 'stack'); NK.ui.setScreen('settings', { index: 6 }); true");
  const splitRow = "Array.from(document.querySelectorAll('#nkMenu .nkItem')).find(el => el.querySelector('.nm').textContent === 'Split Screen')";
  const splitValue = '(' + splitRow + ").querySelector('.val').textContent";
  await t.until(splitValue + " === 'Top and Bottom'");
  t.assert(await t.js("NK.game.settings.get('split') === 'stack'"), 'Desktop settings show the saved split preference');
  await t.setSize(390, 844);
  await t.until(splitValue + " === 'Automatic'");
  t.assert((await L.dbg()).index === 6, 'Resizing settings to a phone updates Automatic and keeps focus');
  await t.wait(420);
  await t.js('(' + splitRow + ').click(); true');
  t.assert(await t.js("NK.game.settings.get('split') === 'stack'"), 'Choosing Automatic on a phone preserves the saved desktop split');
  await t.setSize(1368, 840);
  await t.until(splitValue + " === 'Top and Bottom'");
  await t.wait(420);
  await t.js('(' + splitRow + ').click(); true');
  t.assert(await t.js("NK.game.settings.get('split') === 'side'"), 'Returning to desktop restores the editable split preference');
  t.assert(t.errors.length === 0, 'No browser errors during interruption and resize recovery', t.errors);
};
