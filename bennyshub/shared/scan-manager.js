/**
 * Unified Scan Manager for Narbehouse Accessibility Hub
 * Provides centralized scanning settings and logic helpers across all apps
 *
 * Input Sensitivity (anti-tremor) was ported from the desktop hub
 * (Benny's PC Hub / Benny-s-Accessibility-Hub-2.0). The web build previously
 * had a hard-coded 250ms post-release cooldown and a stub getInputSensitivity()
 * that returned it; both are replaced by the configurable model below.
 */

window.NarbeScanManager = (function() {
  'use strict';

  // Storage key for scan settings
  const STORAGE_KEY = 'narbe-scan-settings';

  // Available scan speeds in milliseconds
  const SCAN_SPEEDS = [1000, 2000, 3000, 4000];

  // Available input sensitivity thresholds in milliseconds (anti-tremor).
  // Lower = more sensitive (less filtering), higher = more filtering.
  //
  // Array mirrored from the desktop hub.
  //
  // This value is a BUFFER AFTER a press, not a minimum press length. A press of
  // any duration counts - tap it, or hold it for four seconds, either way it
  // registers - and then nothing else registers until the buffer has elapsed.
  // It exists so a switch that bounces, or a hand with a tremor, cannot fire the
  // same control twice from what the player experienced as one press.
  //
  // It drives two checks in handleGlobalInput below:
  //   1. cooldown after a valid release
  //   2. anti-rapid-press (a new keydown too soon after the last keyup)
  //
  // Both of those block a keydown AND consume its matching keyup, so a filtered
  // press never reaches a game half-finished.
  //
  // The desktop hub has a THIRD check - it rejects presses shorter than this
  // value by swallowing the keyup. That is deliberately not ported; see the long
  // note at check 4 in handleGlobalInput for why it strands games.
  //
  // Because press LENGTH is never filtered here, the hub's hold gestures behave
  // identically at every setting: hold-to-scan-backwards (~3s) and hold-to-pause
  // (~5s) work the same at 300ms as at 50ms.
  const INPUT_SENSITIVITIES = [50, 100, 200, 300];

  // Default settings
  const DEFAULT_SETTINGS = {
    autoScan: false,           // Default per agents.md (Off for Ben games)
    scanSpeedIndex: 1,         // Default to 2000ms (index 1)
    inputSensitivityIndex: 0   // Default to 50ms (index 0) - most responsive
  };

  // Internal state
  let settings = { ...DEFAULT_SETTINGS };
  let observers = []; // For notifying games of setting changes

  /**
   * Load settings from localStorage
   */
  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate and merge. Settings saved before Input Sensitivity existed
        // have no inputSensitivityIndex and pick up the default here.
        settings = { ...DEFAULT_SETTINGS, ...parsed };

        // Ensure index is valid
        if (settings.scanSpeedIndex < 0 || settings.scanSpeedIndex >= SCAN_SPEEDS.length) {
          settings.scanSpeedIndex = DEFAULT_SETTINGS.scanSpeedIndex;
        }

        // Ensure input sensitivity index is valid
        if (typeof settings.inputSensitivityIndex !== 'number' ||
            settings.inputSensitivityIndex < 0 ||
            settings.inputSensitivityIndex >= INPUT_SENSITIVITIES.length) {
          settings.inputSensitivityIndex = DEFAULT_SETTINGS.inputSensitivityIndex;
        }
      }
    } catch (error) {
      console.warn('NarbeScanManager: Error loading settings:', error);
      settings = { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Save settings to localStorage
   */
  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      notifyObservers();

      // Broadcast to any iframes (for parent window)
      broadcastToIframes();

      // If running inside an iframe (e.g. a game), notify the parent hub
      // directly via postMessage so the hub's scan manager stays in sync.
      broadcastToParent();
    } catch (error) {
      console.error('NarbeScanManager: Error saving settings:', error);
    }
  }

  /**
   * Notify the parent window (hub) of the current settings.
   * Called whenever settings are saved from within an iframe.
   */
  function broadcastToParent() {
    if (!window.parent || window.parent === window) return;
    try {
      window.parent.postMessage({
        type: 'narbe-scan-settings-changed',
        settings: getPublicState()
      }, '*');
    } catch (e) {
      // Ignore cross-origin errors
    }
  }

  /**
   * Broadcast current settings to all iframes
   */
  function broadcastToIframes() {
    const state = getPublicState();
    try {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              type: 'narbe-scan-settings-changed',
              settings: state
            }, '*');
          }
        } catch (e) {
          // Ignore cross-origin errors
        }
      });
    } catch (e) {
      // Ignore errors
    }
  }

  /**
   * Notify all registered observers of changes
   */
  function notifyObservers() {
    observers.forEach(callback => {
      try {
        callback(getPublicState());
      } catch (e) {
        console.error('NarbeScanManager: Error in observer callback:', e);
      }
    });
  }

  /**
   * Get current state for public consumption
   */
  function getPublicState() {
    return {
      autoScan: settings.autoScan,
      scanSpeedIndex: settings.scanSpeedIndex,
      scanInterval: SCAN_SPEEDS[settings.scanSpeedIndex],
      inputSensitivityIndex: settings.inputSensitivityIndex,
      inputSensitivity: getInputSensitivity()
    };
  }

  /**
   * Get current input sensitivity threshold (for anti-tremor logic).
   *
   * Safety fallback: if inputSensitivityIndex is missing or invalid, fall back
   * to DEFAULT_SETTINGS rather than to a mid-range value, and never to
   * undefined. The desktop build's public getter returns INPUT_SENSITIVITIES[i]
   * unvalidated, which hands a game undefined on a corrupt index - the exact
   * TypeError-in-a-keyup-handler failure described in ACCESSIBILITY.md 11.
   */
  function getInputSensitivity() {
    const index = (typeof settings.inputSensitivityIndex === 'number' &&
                   settings.inputSensitivityIndex >= 0 &&
                   settings.inputSensitivityIndex < INPUT_SENSITIVITIES.length)
                  ? settings.inputSensitivityIndex
                  : DEFAULT_SETTINGS.inputSensitivityIndex;
    return INPUT_SENSITIVITIES[index];
  }

  // Initialize
  loadSettings();

  // Listen for storage events from other windows/iframes
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      loadSettings();
      notifyObservers();
    }
  });

  // Cross-iframe message handling for settings sync.
  // The hub runs every game in an iframe, so a scan speed or sensitivity change
  // made inside a game's own settings screen has to reach the hub's instance
  // (and vice versa) without a reload.
  window.addEventListener('message', (event) => {
    if (!event.data) return;

    // Handle incoming settings change from parent/child
    if (event.data.type === 'narbe-scan-settings-changed') {
      try {
        const newSettings = event.data.settings;
        if (newSettings && typeof newSettings === 'object') {
          if (typeof newSettings.autoScan === 'boolean') {
            settings.autoScan = newSettings.autoScan;
          }
          if (typeof newSettings.scanSpeedIndex === 'number') {
            settings.scanSpeedIndex = newSettings.scanSpeedIndex;
          }
          if (typeof newSettings.inputSensitivityIndex === 'number') {
            settings.inputSensitivityIndex = newSettings.inputSensitivityIndex;
          }
          // Save to localStorage (won't broadcast back since we received it)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
          notifyObservers();
        }
      } catch (error) {
        console.warn('NarbeScanManager: Error handling scan settings message:', error);
      }
    }

    // Handle request for settings (from child iframe)
    if (event.data.type === 'narbe-scan-settings-request') {
      if (event.source) {
        event.source.postMessage({
          type: 'narbe-scan-settings-changed',
          settings: getPublicState()
        }, '*');
      }
    }
  });

  // Request settings from parent (if we are in a child iframe)
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'narbe-scan-settings-request' }, '*');
  }

  // Reload settings when page gains focus or visibility changes, so a game
  // picks up a change the hub made while the game was backgrounded.
  window.addEventListener('focus', () => {
    loadSettings();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadSettings();
    }
  });

  // ---------------------------------------------------------------------------
  // Universal input guard (anti-tremor)
  //
  // Blocks switch bounce, accidental double-hits and presses too short to be
  // intentional. All three thresholds read the player's Input Sensitivity
  // setting live, so a change takes effect on the very next press.
  // ---------------------------------------------------------------------------

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
    // Don't interfere with iframe content: when a game is open it loads its own
    // copy of this file and guards its own input. Two guards in series would
    // double-filter every press.
    const iframeContainer = document.querySelector('.iframe-container');
    if (iframeContainer && iframeContainer.classList.contains('active')) {
      return;
    }

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
      // Mouse and touch are direct navigation for caregivers, not switch input,
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

  // Register capturing listeners to intercept events before they reach apps
  ['keydown', 'keyup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(type => {
    window.addEventListener(type, handleGlobalInput, true);
  });

  // Public API
  return {
    /**
     * Force reload settings from storage
     */
    reload: function() {
      loadSettings();
      notifyObservers();
    },

    /**
     * Get current scan settings
     * @returns {Object} { autoScan, scanSpeedIndex, scanInterval,
     *                     inputSensitivityIndex, inputSensitivity }
     */
    getSettings: function() {
      return getPublicState();
    },

    /**
     * Get the actual scan interval in milliseconds
     * @returns {number} Milliseconds
     */
    getScanInterval: function() {
      return SCAN_SPEEDS[settings.scanSpeedIndex];
    },

    /**
     * Update multiple settings at once
     * @param {Object} newSettings Partial settings object
     */
    updateSettings: function(newSettings) {
      if (!newSettings) return;

      let changed = false;

      if (typeof newSettings.autoScan === 'boolean') {
        settings.autoScan = newSettings.autoScan;
        changed = true;
      }

      if (typeof newSettings.scanSpeedIndex === 'number' &&
          newSettings.scanSpeedIndex >= 0 &&
          newSettings.scanSpeedIndex < SCAN_SPEEDS.length) {
        settings.scanSpeedIndex = newSettings.scanSpeedIndex;
        changed = true;
      }

      if (typeof newSettings.inputSensitivityIndex === 'number' &&
          newSettings.inputSensitivityIndex >= 0 &&
          newSettings.inputSensitivityIndex < INPUT_SENSITIVITIES.length) {
        settings.inputSensitivityIndex = newSettings.inputSensitivityIndex;
        changed = true;
      }

      if (changed) {
        saveSettings();
      }
    },

    /**
     * Set auto scan enabled/disabled
     * @param {boolean} enabled
     */
    setAutoScan: function(enabled) {
      settings.autoScan = !!enabled;
      saveSettings();
    },

    /**
     * Toggle auto scan enabled/disabled
     */
    toggleAutoScan: function() {
      this.setAutoScan(!settings.autoScan);
    },

    /**
     * Set scan speed by index
     * @param {number} index 0-3 corresponding to 1s, 2s, 3s, 4s
     */
    setScanSpeedIndex: function(index) {
      if (index >= 0 && index < SCAN_SPEEDS.length) {
        settings.scanSpeedIndex = index;
        saveSettings();
      }
    },

    /**
     * Cycle to next scan speed
     */
    cycleScanSpeed: function() {
      let next = settings.scanSpeedIndex + 1;
      if (next >= SCAN_SPEEDS.length) next = 0;
      this.setScanSpeedIndex(next);
      return next;
    },

    /**
     * Subscribe to setting changes
     * @param {Function} callback Function to call when settings change
     */
    subscribe: function(callback) {
      if (typeof callback === 'function' && !observers.includes(callback)) {
        observers.push(callback);
      }
    },

    /**
     * Unsubscribe from setting changes
     * @param {Function} callback
     */
    unsubscribe: function(callback) {
      observers = observers.filter(obs => obs !== callback);
    },

    /**
     * Helper to get available speeds
     */
    getAvailableSpeeds: function() {
      return [...SCAN_SPEEDS];
    },

    /**
     * Helper to get available input sensitivity thresholds
     */
    getAvailableSensitivities: function() {
      return [...INPUT_SENSITIVITIES];
    },

    /**
     * Get current input sensitivity threshold in milliseconds.
     * Goes through the same validated path the input guard uses, so a bad
     * stored index can never hand a game an undefined threshold.
     * @returns {number} Milliseconds
     */
    getInputSensitivity: function() {
      return getInputSensitivity();
    },

    /**
     * Set input sensitivity by index
     * @param {number} index 0-3 corresponding to 50ms, 100ms, 200ms, 300ms
     */
    setInputSensitivityIndex: function(index) {
      if (index >= 0 && index < INPUT_SENSITIVITIES.length) {
        settings.inputSensitivityIndex = index;
        saveSettings();
      }
    },

    /**
     * Cycle to next input sensitivity level
     */
    cycleInputSensitivity: function() {
      let next = settings.inputSensitivityIndex + 1;
      if (next >= INPUT_SENSITIVITIES.length) next = 0;
      this.setInputSensitivityIndex(next);
      return next;
    },

    /**
     * Reset all input tracking state.
     * CRITICAL: call when returning from an iframe to the hub.
     */
    resetInputState: function() {
      resetInputState();
    }
  };
})();
