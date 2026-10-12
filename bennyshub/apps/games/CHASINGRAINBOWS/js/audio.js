/** Chasing Rainbows - sound effects and the rain.
 *
 *  Everything plays through the hub's SafeAudio (plain HTML5 audio; the Web Audio API can
 *  crash the Electron renderer). Our files are preloaded under 'cr-' names so they can never
 *  shadow SafeAudio's built-in synthesised sounds (ACCESSIBILITY.md §5, the 404 trap).
 *
 *  Two switches: Sound Effects (everything) and Weather Sounds (wind, thunder, fog and the
 *  rain loop), because some players find weather noise distracting.
 *  The sounds themselves come from tools/make-sounds.py.
 */
window.CRAudio = (function () {
  'use strict';
  const FILES = ['card', 'shuffle', 'turn', 'chime', 'whoosh', 'thunder', 'fog', 'puff', 'night', 'sparkle', 'slam', 'pop',
    'note0', 'note1', 'note2', 'note3', 'note4', 'note5', 'note6', 'note7'];
  const WEATHER = ['whoosh', 'thunder', 'fog', 'puff'];
  const VOLUME = { card: 0.45, shuffle: 0.5, turn: 0.4, chime: 0.55, whoosh: 0.5, thunder: 0.7, fog: 0.5, puff: 0.5, night: 0.6, sparkle: 0.6, slam: 0.5, pop: 0.3 };
  let sfx = true, weather = true, rain = null, rainLevel = 0, rainTarget = 0, rainTimer = null;
  const SA = () => window.SafeAudio || null;

  function init() {
    const sa = SA();
    if (!sa) return;
    FILES.forEach(f => { try { sa.preload('cr-' + f, 'sound/' + f + '.wav'); } catch (e) { /* missing audio never breaks play */ } });
  }
  function set(opts) {
    if ('sfx' in opts) sfx = !!opts.sfx;
    if ('weather' in opts) weather = !!opts.weather;
    if (!sfx || !weather) setRain(false);
  }
  function play(name, vol) {
    if (!sfx || (!weather && WEATHER.includes(name))) return;
    const sa = SA();
    if (!sa) return;
    try { sa.play('cr-' + name, vol || VOLUME[name] || 0.5); } catch (e) { /* ignore */ }
  }

  /** The rain bed fades in and out (a soft loop under storms). */
  function setRain(on) {
    rainTarget = on && sfx && weather ? 0.22 : 0;
    if (rainTarget > 0 && !rain) {
      try { rain = new Audio('sound/rain.wav'); rain.loop = true; rain.volume = 0; } catch (e) { rain = null; return; }
    }
    if (!rain || rainTimer) return;
    rainTimer = setInterval(() => {
      rainLevel += (rainTarget - rainLevel) * 0.12;
      if (Math.abs(rainTarget - rainLevel) < 0.01) rainLevel = rainTarget;
      try {
        rain.volume = Math.max(0, Math.min(1, rainLevel));
        if (rainLevel > 0 && rain.paused) { const p = rain.play(); if (p && p.catch) p.catch(() => {}); }
        if (rainLevel === 0 && !rain.paused) rain.pause();
      } catch (e) { /* ignore */ }
      if (rainLevel === rainTarget) { clearInterval(rainTimer); rainTimer = null; }
    }, 60);
  }
  function stopAll() { setRain(false); const sa = SA(); if (sa && sa.stopAll) try { sa.stopAll(); } catch (e) { /* ignore */ } }

  return { init, set, play, setRain, stopAll };
})();
