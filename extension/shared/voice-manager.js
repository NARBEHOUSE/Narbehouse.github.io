/**
 * Shared voice settings and bounded speech completion.
 * The platform adapter owns the engine and its native events.
 */
window.NarbeVoiceManager = (function () {
  'use strict';
  const DEFAULT_SETTINGS = { ttsEnabled: true, voiceIndex: 0, voiceName: null, rate: 1, pitch: 1, volume: 1 };
  const speech = window.NarbePlatform.speech;
  let settings, englishVoices = [], voicesLoaded = false, callbacks = [], activeSpeech = null;
  function normalize(raw) {
    const result = { ...DEFAULT_SETTINGS };
    if (typeof raw?.ttsEnabled === 'boolean') result.ttsEnabled = raw.ttsEnabled;
    if (Number.isInteger(raw?.voiceIndex) && raw.voiceIndex >= 0) result.voiceIndex = raw.voiceIndex;
    if (typeof raw?.voiceName === 'string') result.voiceName = raw.voiceName;
    for (const [key, min, max] of [['rate', 0.1, 10], ['pitch', 0, 2], ['volume', 0, 1]]) {
      if (Number.isFinite(raw?.[key]) && raw[key] >= min && raw[key] <= max) result[key] = raw[key];
    }
    return result;
  }
  function notify() {
    for (const callback of [...callbacks]) {
      try { callback({ ...settings }); } catch (error) { console.warn('NarbeVoiceManager: callback', error); }
    }
  }
  const store = window.NarbePlatform.settings.open({
    key: 'narbe-voice-settings', normalize,
    onChange(value) { settings = value; if (!settings.ttsEnabled) cancel(); notify(); }
  });
  settings = store.readCached();

  function loadVoices() {
    const available = speech.getVoices();
    if (!available.length) return;
    englishVoices = available.filter(voice =>
      voice.lang?.startsWith('en-') || voice.lang === 'en' || /english/i.test(voice.name));
    if (!englishVoices.length) englishVoices = available.filter(voice => voice.lang?.startsWith('en'));
    if (!englishVoices.length) englishVoices = [available[0]];
    const byName = englishVoices.findIndex(voice => voice.name === settings.voiceName);
    const index = byName >= 0 ? byName : (settings.voiceIndex < englishVoices.length ? settings.voiceIndex : 0);
    settings = store.save({ ...settings, voiceIndex: index, voiceName: englishVoices[index].name });
    voicesLoaded = true;
    notify();
  }
  function getSettings() { return { ...settings }; }
  function updateSettings(patch) {
    if (!patch || typeof patch !== 'object') return;
    const next = normalize({ ...settings, ...patch });
    if (patch.voiceIndex !== undefined && englishVoices[next.voiceIndex]) {
      next.voiceName = englishVoices[next.voiceIndex].name;
    }
    settings = store.save(next);
  }
  function getEnglishVoices() { return [...englishVoices]; }
  function getCurrentVoice() { return englishVoices[settings.voiceIndex] || englishVoices[0] || null; }
  function getVoiceDisplayName(voice) {
    if (!voice) return "Default";
    
    const name = voice.name.toLowerCase();
    
    // Clean up voice name for better display
    let displayName = voice.name;
    
    // Remove common prefixes and suffixes for cleaner display
    displayName = displayName.replace(/^(Microsoft|Google|Apple|Samsung)\s+/i, '');
    displayName = displayName.replace(/\s+(Premium|Enhanced|Compact|Desktop|Mobile)$/i, '');
    displayName = displayName.replace(/\s+\([^)]+\)$/i, ''); // Remove parenthetical info
    
    // Take only the first word/name for simplicity
    displayName = displayName.split(' ')[0];
    
    // Capitalize first letter
    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    
    return displayName;
  }


  function cycleVoice() {
    if (!englishVoices.length) return false;
    updateSettings({ voiceIndex: (settings.voiceIndex + 1) % englishVoices.length });
    return true;
  }
  function toggleTTS() {
    updateSettings({ ttsEnabled: !settings.ttsEnabled });
    return settings.ttsEnabled;
  }

  // A conservative character estimate, two seconds of grace, never over 10s.
  function getSpeechTimeout(text, rate = settings.rate) {
    return Math.min(10000, Math.ceil(String(text).length / (15 * Math.max(0.1, rate)) * 1000) + 2000);
  }
  function speak(text, options = {}) {
    cancel();
    let resolveStart, resolveFinish, done = false, nativeTicket, watchdog;
    const started = new Promise(resolve => { resolveStart = resolve; });
    const finished = new Promise(resolve => { resolveFinish = resolve; });
    let didStart = false;
    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      resolveStart(result.started);
      resolveFinish(result);
      if (activeSpeech === ticket) activeSpeech = null;
      if (typeof options.onComplete === 'function') {
        try { options.onComplete(result); } catch (error) { console.warn('NarbeVoiceManager: completion', error); }
      }
    }
    const ticket = {
      started, finished,
      cancel() { nativeTicket?.cancel(); finish({ reason: 'cancelled', started: didStart }); }
    };
    activeSpeech = ticket;
    if ((!settings.ttsEnabled && !options.force) || !text) {
      finish({ reason: 'disabled', started: false });
      return ticket;
    }
    const rate = options.rate || settings.rate;
    watchdog = setTimeout(() => {
      // Release scan waiters without truncating a long spoken announcement.
      // The next speech request (or an explicit cancel) still owns cancellation.
      finish({ reason: 'timeout', started: didStart });
    }, getSpeechTimeout(text, rate));
    try {
      nativeTicket = speech.speak(String(text), {
        rate, pitch: options.pitch ?? settings.pitch, volume: options.volume ?? settings.volume,
        ...(getCurrentVoice() ? { voice: getCurrentVoice() } : {})
      });
      nativeTicket.started.then(value => { if (!done) { didStart = value; resolveStart(value); } });
      nativeTicket.finished.then(finish, () => finish({ reason: 'error', started: didStart }));
    } catch (_) { finish({ reason: 'error', started: false }); }
    return ticket;
  }
  function processTextForTTS(text) {
    // List of common 2-letter words that should be spoken as words, not letters
    const twoLetterWords = ['IT', 'IS', 'IN', 'AT', 'ON', 'TO', 'OF', 'AS', 'BY', 'IF', 
                           'OR', 'SO', 'UP', 'DO', 'GO', 'HE', 'WE', 'ME', 'BE', 'NO', 
                           'MY', 'AN', 'AM', 'US', 'OK', 'HI', 'OH', 'AH', 'HA'];
    
    return text.split(' ').map(fullWord => {
      // Handle contractions
      if (fullWord.includes("'")) {
        const parts = fullWord.split("'");
        const processedParts = parts.map((part, index) => {
          if (index === 0) {
            return part.toLowerCase();
          } else {
            return part.toLowerCase();
          }
        });
        return processedParts.join("'");
      }
      // Non-contraction words
      else {
        // Check if it's a 2-letter word that should be spoken as a word
        if (fullWord.length === 2 && twoLetterWords.includes(fullWord.toUpperCase())) {
          return fullWord.toLowerCase();
        }
        // For other all-caps words longer than 2 letters, convert to lowercase
        else if (fullWord.length > 2 && fullWord === fullWord.toUpperCase() && /^[A-Z]+$/.test(fullWord)) {
          return fullWord.toLowerCase();
        }
        // Keep single letters as uppercase (they should be spelled out)
        else if (fullWord.length === 1 && /^[A-Z]$/.test(fullWord)) {
          return fullWord;
        }
        // Default: convert to lowercase for natural speech
        else {
          return fullWord.toLowerCase();
        }
      }
    }).join(' ');
  }


  function speakProcessed(text, options = {}) { return speak(processTextForTTS(text), options); }
  function cancel() {
    activeSpeech?.cancel();
    speech.cancel();
  }
  function onSettingsChange(callback) {
    if (typeof callback === 'function' && !callbacks.includes(callback)) callbacks.push(callback);
  }
  function offSettingsChange(callback) { callbacks = callbacks.filter(item => item !== callback); }
  function areVoicesLoaded() { return voicesLoaded; }
  function waitForVoices(timeout = 2000) {
    if (voicesLoaded) return Promise.resolve(true);
    return new Promise(resolve => {
      let timer;
      const stop = speech.onVoicesChanged(() => { loadVoices(); if (voicesLoaded) finish(true); });
      function finish(value) { clearTimeout(timer); stop(); resolve(value); }
      timer = setTimeout(() => finish(voicesLoaded), Math.min(10000, Math.max(0, timeout)));
    });
  }

  loadVoices();
  speech.onVoicesChanged(loadVoices);
  if (!voicesLoaded) setTimeout(loadVoices, 100);
  return {
    getSettings, updateSettings, getEnglishVoices, getCurrentVoice,
    getVoiceDisplayName, cycleVoice, toggleTTS, speak, speakProcessed, cancel,
    processTextForTTS, onSettingsChange, offSettingsChange, areVoicesLoaded,
    waitForVoices, getSpeechTimeout
  };
})();
