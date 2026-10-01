/* Original file-backed stadium audio. All playback uses HTMLAudioElement. */
(function () {
  'use strict';

  const script = document.currentScript;
  const baseURL = script && script.src
    ? new URL('../assets/audio/', script.src).href
    : new URL('assets/audio/', document.baseURI).href;
  const PREFIX = 'robotfootball:';
  const volumes = Object.freeze({
    hover: .34, select: .52, snap: .58, throw: .43, catch: .62,
    tackle: .67, touchdown: .59, kick: .68, whistle: .24,
    win: .60, lose: .44,
    clang: .42, break: .5, powerup: .5, powerdown: .42, charge: .4, ready: .55, target: .42, over: .45,
    'crowd-swell': .30
  });
  let initialized = false;
  let disposed = false;
  let enabled = true;
  let crowdEnabled = true;
  let unlocked = false;
  let paused = false;
  let windowActive = !document.hidden;
  let pageSuspended = false;
  let bed = null;
  let detail = null;
  let fadeTimer = null;
  let lastSwell = -Infinity;
  const pending = new WeakSet();

  function safeAudio() { return window.SafeAudio; }
  function pageActive() { return windowActive && !document.hidden && !pageSuspended; }
  function crowdCanPlay() {
    return initialized && !disposed && enabled && crowdEnabled && unlocked && !paused && pageActive();
  }

  function makeLoop(file) {
    const element = new Audio();
    element.preload = 'auto';
    element.loop = true;
    element.volume = 0;
    element.src = baseURL + file + '.wav';
    // A missing optional ambience file should never prevent the game from running.
    element.addEventListener('error', function () { element.pause(); });
    return element;
  }

  function stopEffects() {
    const safe = safeAudio();
    if (!safe || !safe.stop) return;
    Object.keys(volumes).forEach(function (name) { safe.stop(PREFIX + name); });
  }

  function stopCrowd(reset) {
    if (fadeTimer !== null) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
    [bed, detail].forEach(function (element) {
      if (!element) return;
      element.pause();
      element.volume = 0;
      if (reset) {
        try { element.currentTime = 0; } catch (_) { /* Metadata may still be loading. */ }
      }
    });
  }

  function duckCrowd() {
    if (!crowdCanPlay()) { stopCrowd(false); return; }
    // Speech remains the primary accessible interface, including while the crowd is on.
    const speaking = Boolean(window.speechSynthesis && window.speechSynthesis.speaking);
    const duck = speaking ? .28 : 1;
    [[bed, .15], [detail, .055]].forEach(function (entry) {
      const element = entry[0];
      if (element) element.volume += (entry[1] * duck - element.volume) * .25;
    });
  }

  function startElement(element) {
    if (!element || !element.paused || pending.has(element)) return;
    pending.add(element);
    try {
      const attempt = element.play();
      if (attempt && typeof attempt.then === 'function') {
        attempt.then(function () {
          pending.delete(element);
          if (!crowdCanPlay()) element.pause();
        }).catch(function () {
          // Browsers can reject autoplay. The next real switch/touch gesture retries.
          pending.delete(element);
        });
      } else {
        pending.delete(element);
      }
    } catch (_) {
      pending.delete(element);
    }
  }

  function syncCrowd() {
    if (!crowdCanPlay()) { stopCrowd(false); return; }
    startElement(bed);
    startElement(detail);
    if (fadeTimer === null) fadeTimer = setInterval(duckCrowd, 120);
  }

  function onBlur() {
    windowActive = false;
    stopCrowd(false);
    stopEffects();
  }
  function onFocus() {
    windowActive = true;
    syncCrowd();
  }
  function onVisibility() {
    if (document.hidden) {
      stopCrowd(false);
      stopEffects();
    } else {
      syncCrowd();
    }
  }
  function onPageHide() {
    pageSuspended = true;
    stopCrowd(false);
    stopEffects();
  }
  function onPageShow() {
    pageSuspended = false;
    syncCrowd();
  }
  function onGesture(event) {
    if (event.isTrusted === false) return;
    unlock();
  }

  function init() {
    if (initialized || disposed) return;
    initialized = true;
    const safe = safeAudio();
    if (safe) {
      Object.keys(volumes).forEach(function (name) {
        safe.preload(PREFIX + name, baseURL + name + '.wav');
      });
      safe.setEnabled(enabled);
    }
    bed = makeLoop('crowd-bed');
    detail = makeLoop('crowd-detail');
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
  }

  function unlock() {
    if (disposed) return;
    init();
    unlocked = true;
    syncCrowd();
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (safeAudio()) safeAudio().setEnabled(enabled);
    if (!enabled) {
      stopCrowd(false);
      stopEffects();
    } else {
      syncCrowd();
    }
  }

  function setCrowd(value) {
    crowdEnabled = Boolean(value);
    if (!crowdEnabled && safeAudio() && safeAudio().stop) {
      safeAudio().stop(PREFIX + 'crowd-swell');
    }
    syncCrowd();
  }

  function play(type) {
    if (disposed || !enabled || !pageActive()) return;
    init();
    if (!Object.prototype.hasOwnProperty.call(volumes, type)) return;
    if (type === 'crowd-swell' && !crowdEnabled) return;
    const safe = safeAudio();
    if (!safe) return;
    safe.play(PREFIX + type, volumes[type]);
    if (crowdEnabled && (type === 'touchdown' || type === 'win' || type === 'catch' || type === 'tackle')) {
      const now = Date.now();
      if (now - lastSwell > 1600 || type === 'touchdown' || type === 'win') {
        lastSwell = now;
        const gain = type === 'catch' || type === 'tackle' ? .15 : .38;
        safe.play(PREFIX + 'crowd-swell', gain);
      }
    }
  }

  function pause() {
    paused = true;
    stopCrowd(false);
    stopEffects();
  }

  function resume() {
    if (disposed) return;
    paused = false;
    syncCrowd();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopCrowd(true);
    stopEffects();
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('pointerdown', onGesture, true);
    document.removeEventListener('keydown', onGesture, true);
    [bed, detail].forEach(function (element) {
      if (!element) return;
      element.removeAttribute('src');
      element.load();
    });
    bed = detail = null;
  }

  window.FootballAudio = Object.freeze({
    init: init,
    unlock: unlock,
    setEnabled: setEnabled,
    setCrowd: setCrowd,
    play: play,
    pause: pause,
    resume: resume,
    dispose: dispose
  });
})();
