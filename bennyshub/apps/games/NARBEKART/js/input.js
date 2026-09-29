/**
 * NARBE Racer — raw switch input.
 *
 * WHY THIS FILE EXISTS. The hub's shared scan-manager.js filters Space and
 * Enter through window-capture listeners with ONE global release cooldown, and
 * it swallows the key-up of any press it blocks. That is right for a menu and
 * wrong for a race with two players: P1 lets go of Space and, a few
 * milliseconds later, P2 presses Enter — scan-manager blocks P2's press and
 * eats its key-up, so P2's kart would steer for ever.
 *
 * So this file loads BEFORE scan-manager.js and registers its own window
 * capture listeners first. Listeners on the same target and phase run in the
 * order they were added, so scan-manager's stopImmediatePropagation() can never
 * hide an event from us. We never stop propagation ourselves: menus keep
 * working through the ordinary document listeners exactly like every other
 * hub game, and only races read this layer.
 *
 * What it keeps is per-key physical state with a per-key bounce filter:
 *   - NumpadEnter counts as Enter; browser auto-repeat is ignored.
 *   - A key-down arriving within the player's Input Sensitivity of the SAME
 *     key's last release is a bounce: it is dropped together with its key-up.
 *   - There is no cross-key cooldown, and press length is never filtered.
 *
 * It loads before util.js, so it creates window.NK itself and uses nothing
 * from the rest of the game.
 */
window.NK = window.NK || {};

NK.input = (function () {
  'use strict';

  const KEYS = ['Space', 'Enter'];
  const FALLBACK_SENSITIVITY = 50;   // ms, scan-manager's own default

  /* Live per-key state. state() hands these objects out directly so the race
     can poll them every frame without allocating; callers treat them as
     read-only. Times are performance.now() milliseconds. */
  const keys = {
    Space: { down: false, downAt: 0, upAt: -Infinity },
    Enter: { down: false, downAt: 0, upAt: -Infinity }
  };
  /* A press the bounce filter dropped: its key-up must be dropped too, or the
     race would see a release for a press it never saw. */
  const bounced = { Space: false, Enter: false };
  const listeners = [];

  function norm(code) { return code === 'NumpadEnter' ? 'Enter' : code; }
  function isSwitch(code) { return code === 'Space' || code === 'Enter' || code === 'NumpadEnter'; }

  function sensitivity() {
    try {
      const sm = window.NarbeScanManager;
      if (sm && typeof sm.getInputSensitivity === 'function') {
        const v = +sm.getInputSensitivity();
        if (isFinite(v) && v >= 0) return v;
      }
    } catch (e) { /* a broken manager must not break steering */ }
    return FALLBACK_SENSITIVITY;
  }

  function emit(type, code, e) {
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](type, code, e); }
      catch (err) { console.error('NK.input listener failed:', err); }
    }
  }

  function onKeyDown(e) {
    if (!isSwitch(e.code) || e.repeat) return;
    const k = norm(e.code);
    const s = keys[k];
    if (s.down) return;                  // a second down with no up in between
    const now = performance.now();
    if (now - s.upAt < sensitivity()) { bounced[k] = true; return; }
    bounced[k] = false;
    s.down = true;
    s.downAt = now;
    emit('down', k, e);
  }

  function onKeyUp(e) {
    if (!isSwitch(e.code)) return;
    const k = norm(e.code);
    const s = keys[k];
    // Every physical release restarts the bounce window, including the release
    // of a bounce we dropped, so a chattering switch settles into one press.
    s.upAt = performance.now();
    if (bounced[k]) { bounced[k] = false; return; }
    if (!s.down) return;                 // forgotten by reset(), or never accepted
    s.down = false;
    emit('up', k, e);
  }

  /**
   * scan-manager dispatches this from inside its own key-up handler, after we
   * have already seen that key-up, so normally it changes nothing. It is here
   * for a manager that swallows a key-up before we see it: the cancelled key —
   * and only that key — is released.
   */
  function onCancelled(e) {
    const code = e && e.detail ? norm(e.detail.code) : null;
    if (!code || !keys[code]) return;
    const s = keys[code];
    if (!s.down) return;
    s.down = false;
    s.upAt = performance.now();
    emit('up', code, e);
  }

  /** Forget every held key. A key still physically down stays ignored until it
   *  is released, because its key-up then finds nothing to release. */
  function reset() {
    for (let i = 0; i < KEYS.length; i++) {
      keys[KEYS[i]].down = false;
      bounced[KEYS[i]] = false;
    }
    const sm = window.NarbeScanManager;
    if (sm && typeof sm.resetInputState === 'function') {
      try { sm.resetInputState(); } catch (e) { /* ignore */ }
    }
  }

  function state(code) { return keys[norm(code)] || null; }
  function isDown(code) { const s = keys[norm(code)]; return !!(s && s.down); }
  /** How long a key has been held, in ms (0 when it is up). */
  function heldMs(code) {
    const s = keys[norm(code)];
    return s && s.down ? performance.now() - s.downAt : 0;
  }

  /** Subscribe to accepted raw edges. Returns the unsubscribe function. */
  function onRaw(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  // Registered at load, before scan-manager.js runs — the whole point.
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('narbe-input-cancelled', onCancelled);
  window.addEventListener('blur', reset);

  return { state, onRaw, reset, isDown, heldMs, norm, isSwitch, KEYS };
})();
