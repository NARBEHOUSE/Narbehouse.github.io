/**
 * Companion boundary: settings are read-only copies pushed from the originating
 * Hub. Never persist scan/voice preferences on a streaming provider's origin.
 */
window.NarbePlatform = (function () {
  'use strict';
  const defaults = {
    autoScan: false, scanInterval: 2000, inputSensitivity: 50,
    parking: 'off', loopsBeforeParking: 2, spaceBrake: true, waitForSpeech: false,
    voice: '', rate: 1, tts: true
  };
  let preferences = { ...defaults };
  const scanObservers = new Set(), voiceStores = new Set();
  const scanSettings = {
    getSettings: () => ({ ...preferences }),
    subscribe: callback => scanObservers.add(callback),
    unsubscribe: callback => scanObservers.delete(callback),
    isParkingEnabled: () => preferences.autoScan && preferences.parking !== 'off',
    shouldParkAfterLoop: loops => preferences.autoScan && preferences.parking === 'auto' &&
      loops >= preferences.loopsBeforeParking
  };
  function voicePreferences() {
    const index = window.NarbeVoiceManager?.getEnglishVoices().findIndex(voice => voice.name === preferences.voice);
    return {
      ttsEnabled: preferences.tts, voiceName: preferences.voice || null,
      voiceIndex: index >= 0 ? index : 0, rate: preferences.rate, pitch: 1, volume: 1
    };
  }
  function applyPreferences(value = {}) {
    // The worker validates these fields through policy.scanPrefs. Defaults also
    // support a session saved by an older companion.
    const next = { ...defaults, ...value };
    const changed = JSON.stringify(next) !== JSON.stringify(preferences);
    preferences = next;
    for (const store of voiceStores) store.receive(voicePreferences());
    if (changed) for (const callback of [...scanObservers]) callback(scanSettings.getSettings());
  }
  function openSettings({ key, normalize, onChange }) {
    if (key !== 'narbe-voice-settings') throw new Error('Companion settings belong to the Hub');
    let state = normalize(voicePreferences());
    const store = {
      receive(value) {
        const next = normalize(value);
        if (JSON.stringify(next) === JSON.stringify(state)) return;
        state = next;
        onChange?.({ ...state });
      },
      readCached: () => ({ ...state }),
      // Voice discovery can update its local index/name cache, not Hub settings.
      save(value) { store.receive(value); return { ...state }; },
      reload() { store.receive(voicePreferences()); return { ...state }; }
    };
    voiceStores.add(store);
    return store;
  }
  function capture({ keydown, keyup }) {
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keyup', keyup, true);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup, true);
    };
  }
  function onActivity(callback) {
    const inactive = () => callback(false);
    const active = () => callback(!document.hidden && document.hasFocus());
    window.addEventListener('blur', inactive);
    window.addEventListener('focus', active);
    document.addEventListener('visibilitychange', active);
    queueMicrotask(active);
    return () => {
      window.removeEventListener('blur', inactive);
      window.removeEventListener('focus', active);
      document.removeEventListener('visibilitychange', active);
    };
  }
  let currentSpeech = null;
  function cancelSpeech() {
    currentSpeech?.cancel();
    try { window.speechSynthesis?.cancel(); } catch (_) { /* unavailable engine */ }
  }
  function speak(text, options) {
    cancelSpeech();
    let resolveStart, resolveFinish, done = false, didStart = false;
    let deferred, startDeadline, utterance;
    const started = new Promise(resolve => { resolveStart = resolve; });
    const finished = new Promise(resolve => { resolveFinish = resolve; });
    function markStarted() {
      if (done) return;
      didStart = true;
      clearTimeout(startDeadline);
      resolveStart(true);
    }
    function finish(reason) {
      if (done) return;
      done = true;
      clearTimeout(deferred);
      clearTimeout(startDeadline);
      resolveStart(didStart);
      resolveFinish({ reason, started: didStart });
      if (currentSpeech === ticket) currentSpeech = null;
    }
    const ticket = {
      started, finished,
      cancel() {
        if (done) return;
        finish('cancelled');
        try { window.speechSynthesis?.cancel(); } catch (_) { /* unavailable engine */ }
      }
    };
    currentSpeech = ticket;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      finish('unavailable');
      return ticket;
    }
    // Keep the existing Chrome/Edge cancel-to-speak gap.
    deferred = setTimeout(() => {
      if (done) return;
      try {
        utterance = new window.SpeechSynthesisUtterance(String(text));
        Object.assign(utterance, options);
        utterance.onstart = markStarted;
        utterance.onend = () => { markStarted(); finish('end'); };
        utterance.onerror = () => finish('error');
        window.speechSynthesis.speak(utterance);
        startDeadline = setTimeout(() => {
          if (done || didStart) return;
          if (window.speechSynthesis.speaking) markStarted();
          else {
            finish('failed-to-start');
            try { window.speechSynthesis.cancel(); } catch (_) { /* unavailable engine */ }
          }
        }, 950); // Including the 50 ms gap, resolve failed startup within the fastest scan interval.
      } catch (_) { finish('error'); }
    }, 50);
    return ticket;
  }

  return {
    applyPreferences, scanSettings,
    settings: { open: openSettings },
    input: { capture },
    lifecycle: { onActivity },
    speech: {
      getVoices() {
        try { return window.speechSynthesis?.getVoices() || []; } catch (_) { return []; }
      },
      onVoicesChanged(callback) {
        window.speechSynthesis?.addEventListener('voiceschanged', callback);
        return () => window.speechSynthesis?.removeEventListener('voiceschanged', callback);
      },
      speak, cancel: cancelSpeech
    }
  };
})();
