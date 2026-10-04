/**
 * Shared scan settings and the existing release cooldown / anti-rapid-press guard.
 * Platform storage, frame transport and key capture live in platform.js.
 */
window.NarbeScanManager = (function () {
  'use strict';
  const SCAN_SPEEDS = [1000, 2000, 3000, 4000, 5000];
  const INPUT_SENSITIVITIES = [50, 100, 200, 300];
  const DEFAULT_SETTINGS = {
    autoScan: false, scanSpeedIndex: 1, inputSensitivityIndex: 0,
    parking: 'off', loopsBeforeParking: 2, spaceBrake: true, waitForSpeech: false
  };
  const valid = {
    autoScan: value => typeof value === 'boolean',
    scanSpeedIndex: value => Number.isInteger(value) && value >= 0 && value < SCAN_SPEEDS.length,
    inputSensitivityIndex: value => Number.isInteger(value) && value >= 0 && value < INPUT_SENSITIVITIES.length,
    parking: value => ['off', 'chosen', 'auto'].includes(value),
    loopsBeforeParking: value => [1, 2, 3].includes(value),
    spaceBrake: value => typeof value === 'boolean',
    waitForSpeech: value => typeof value === 'boolean'
  };
  function normalize(raw) {
    const next = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(valid)) {
      if (valid[key](raw?.[key])) next[key] = raw[key];
    }
    return next;
  }
  let settings;
  let observers = [];
  function getPublicState(value = settings) {
    return {
      ...value,
      scanInterval: SCAN_SPEEDS[value.scanSpeedIndex],
      inputSensitivity: INPUT_SENSITIVITIES[value.inputSensitivityIndex]
    };
  }
  const store = window.NarbePlatform.settings.open({
    key: 'narbe-scan-settings', normalize, project: getPublicState,
    onChange(value) {
      settings = value;
      for (const callback of [...observers]) {
        try { callback(getPublicState()); } catch (error) { console.error('NarbeScanManager: observer', error); }
      }
    }
  });
  settings = store.readCached();
  function getInputSensitivity() { return INPUT_SENSITIVITIES[settings.inputSensitivityIndex]; }
  function updateSettings(patch) {
    if (!patch || typeof patch !== 'object') return;
    const next = { ...settings };
    for (const key of Object.keys(valid)) {
      if (valid[key](patch[key])) next[key] = patch[key];
    }
    settings = store.save(next);
  }

  // A valid press has NO minimum length. The original guard consumes BOTH ends
  // of a bounce, but always lets a valid short press release reach the app.
  let lastValidReleaseTime = 0;      // Last release that passed the duration check
  const lastKeyDownTimes = {};       // Per-key keydown timestamps
  const lastKeyUpTimes = {};         // Per-key keyup timestamps (rapid-press detection)
  const blockedInteractions = new Set(); // IDs currently in a blocked sequence
  const keyPressStartTimes = {};     // Per-key press start (hold duration check)

  /**
   * Reset all input tracking state.
   * CRITICAL: call this when transitioning from an iframe back to the hub, or a
   * key that was down when the iframe closed stays flagged and the hub stops
   * responding to the player's switch with nobody able to clear it.
   */
  function resetInputState() {
    lastValidReleaseTime = 0;
    for (const key in lastKeyDownTimes) delete lastKeyDownTimes[key];
    for (const key in lastKeyUpTimes) delete lastKeyUpTimes[key];
    for (const key in keyPressStartTimes) delete keyPressStartTimes[key];
    blockedInteractions.clear();
  }

  function handleGlobalInput(e) {
    let id;
    let isTargetEvent = false;

    // 1. Identify Source
    if (e.type.startsWith('key')) {
      // Only target Space and Enter - the two keys a switch interface sends
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        id = e.code;
        isTargetEvent = true;
      }
    } else {
      // Mouse and touch provide direct navigation, not switch input,
      // so they are not filtered. Bounce only happens on physical switches.
      return;
    }

    // Pass through non-target keys (e.g. arrows, letters)
    if (!isTargetEvent) return;

    // 2. Start of Sequence (Down)
    if (e.type === 'keydown' || e.type === 'mousedown' || e.type === 'touchstart') {

      const now = Date.now();
      const sensitivity = getInputSensitivity();

      // Strict global cooldown from the last VALID release
      if (now - lastValidReleaseTime < sensitivity) {
        blockedInteractions.add(id);
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        return false;
      }

      // ANTI-RAPID-PRESS: block if this key was released too recently (any
      // release, valid or not). Stops rapid tapping being read as a long hold.
      const lastUpForThisKey = lastKeyUpTimes[id] || 0;
      if (!e.repeat && now - lastUpForThisKey < sensitivity) {
        blockedInteractions.add(id);
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        return false;
      }

      // Block if this source is already flagged (e.g. held-down repeats)
      if (blockedInteractions.has(id)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        return false;
      }

      // Allowed: record start time for the duration check on release
      if (!e.repeat) {
        keyPressStartTimes[id] = now;
        lastKeyDownTimes[id] = now;
      }
    }

    // 3. End of Sequence (Up/Click)
    else if (e.type === 'keyup' || e.type === 'mouseup' || e.type === 'touchend' ||
             e.type === 'click' || e.type === 'touchcancel') {

      const now = Date.now();
      const isFinalEvent = (e.type === 'keyup' || e.type === 'click' ||
                            e.type === 'touchend' || e.type === 'touchcancel');

      // Always record keyup time for rapid-press detection on the next keydown
      if (isFinalEvent) {
        lastKeyUpTimes[id] = now;
      }

      // If this sequence was blocked, consume the release and clear the flag
      if (blockedInteractions.has(id)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();

        if (isFinalEvent) {
          blockedInteractions.delete(id);
          delete keyPressStartTimes[id];
        }
        return false;
      }

      // 4. NO minimum-hold check here, and that is deliberate.
      //
      // The desktop hub rejects presses shorter than the sensitivity threshold
      // by swallowing the keyup. That cannot be done safely here: by the time
      // the keyup arrives the game has already seen the keydown and started
      // whatever the press begins - a held steer, a charging meter, a
      // backwards-scan timer. Swallowing the keyup leaves that running with
      // nothing to stop it. Benny Says is the clearest case: it sets
      // spaceIsDown on keydown and only clears it on keyup, so a swallowed
      // keyup leaves it scanning backwards forever.
      //
      // narbe-input-cancelled exists as the safety net for exactly this, but
      // only 11 of 23 games listen for it, so it cannot be relied on. Until
      // every game handles it (or the guard buffers the keydown instead of
      // blocking the keyup), a press of any length is allowed through.
      //
      // Nothing is lost for tremor filtering: the cooldown and anti-rapid-press
      // checks above both block a keydown AND consume its matching keyup, so a
      // filtered press never reaches the game half-finished.
      if (keyPressStartTimes[id] && isFinalEvent) {
        delete keyPressStartTimes[id];
      }

      // Valid release: update the cooldown timer
      if (e.type === 'keyup' || e.type === 'mouseup') {
        lastValidReleaseTime = now;
      }
    }
  }


  window.NarbePlatform.input.capture(handleGlobalInput);

  const api = {
    reload() { settings = store.reload(); return getPublicState(); },
    getSettings: getPublicState,
    getScanInterval: () => SCAN_SPEEDS[settings.scanSpeedIndex],
    updateSettings,
    setAutoScan: enabled => updateSettings({ autoScan: !!enabled }),
    toggleAutoScan() { this.setAutoScan(!settings.autoScan); },
    setScanSpeedIndex: index => updateSettings({ scanSpeedIndex: index }),
    cycleScanSpeed() {
      const next = (settings.scanSpeedIndex + 1) % SCAN_SPEEDS.length;
      this.setScanSpeedIndex(next);
      return next;
    },
    subscribe(callback) {
      if (typeof callback === 'function' && !observers.includes(callback)) observers.push(callback);
    },
    unsubscribe(callback) { observers = observers.filter(item => item !== callback); },
    getAvailableSpeeds: () => [...SCAN_SPEEDS],
    getAvailableSensitivities: () => [...INPUT_SENSITIVITIES],
    getInputSensitivity,
    setInputSensitivityIndex: index => updateSettings({ inputSensitivityIndex: index }),
    cycleInputSensitivity() {
      const next = (settings.inputSensitivityIndex + 1) % INPUT_SENSITIVITIES.length;
      this.setInputSensitivityIndex(next);
      return next;
    },
    resetInputState,
    isParkingEnabled: () => settings.autoScan && settings.parking !== 'off',
    shouldParkAfterLoop: loops => settings.autoScan && settings.parking === 'auto' &&
      loops >= settings.loopsBeforeParking,
    // Explicit creation only. No app is converted just by loading this file.
    createChoiceScan(options) { return window.NarbeChoiceScan.create(api, options); }
  };
  return api;
})();
