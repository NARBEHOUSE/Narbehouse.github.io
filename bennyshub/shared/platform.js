/**
 * Web platform boundary. Shared managers depend on this contract, never on
 * localStorage, iframe transport, native speech, or browser key capture.
 */
window.NarbePlatform = (function () {
  'use strict';

  function peers() {
    const result = Array.from(document.querySelectorAll('iframe'), frame => frame.contentWindow).filter(Boolean);
    if (window.parent && window.parent !== window) result.push(window.parent);
    return result;
  }
  function post(peer, data) {
    try { peer.postMessage(data, window.location.origin); } catch (_) { /* closed/cross-origin frame */ }
  }
  function openSettings({ key, normalize, project = value => value, onChange }) {
    let state;
    function read() {
      try { return normalize(JSON.parse(window.localStorage.getItem(key) || '{}')); }
      catch (_) { return state ? { ...state } : normalize({}); }
    }
    state = read();
    function notify() { onChange?.({ ...state }); }
    function broadcast(except) {
      for (const peer of peers()) {
        if (peer !== except) post(peer, { type: key + '-changed', settings: project(state) });
      }
    }
    function commit(value, source, persist = true) {
      const next = normalize(value);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      state = next;
      if (persist) {
        try { window.localStorage.setItem(key, JSON.stringify(state)); } catch (_) { /* memory still works */ }
      }
      notify();
      broadcast(source);
    }
    function reload() { commit(read(), null, false); return { ...state }; }
    window.addEventListener('storage', event => {
      if (event.key === key || event.key === null) reload();
    });
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reload();
    });
    window.addEventListener('message', event => {
      if (event.origin !== window.location.origin || !peers().includes(event.source)) return;
      if (event.data?.type === key + '-request') {
        post(event.source, { type: key + '-changed', settings: project(state) });
      } else if (event.data?.type === key + '-changed' && event.data.settings &&
                 typeof event.data.settings === 'object') {
        // Older pages send only their known fields. Preserve newer settings.
        commit({ ...state, ...event.data.settings }, event.source);
      }
    });
    if (window.parent && window.parent !== window) {
      post(window.parent, { type: key + '-request' });
    }
    return {
      readCached: () => ({ ...state }),
      save: value => { commit(value); return { ...state }; },
      reload
    };
  }

  function capture(handler) {
    const listener = event => {
      if (event.target?.closest?.('[data-scan-exclude], [data-settings-dialog]')) return;
      if (document.querySelector('.iframe-container')?.classList.contains('active')) return;
      handler(event);
    };
    window.addEventListener('keydown', listener, true);
    window.addEventListener('keyup', listener, true);
    return () => {
      window.removeEventListener('keydown', listener, true);
      window.removeEventListener('keyup', listener, true);
    };
  }

  function onActivity(callback) {
    const blur = () => callback(false);
    const focus = () => callback(document.visibilityState !== 'hidden');
    const visibility = () => callback(document.visibilityState !== 'hidden');
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
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
