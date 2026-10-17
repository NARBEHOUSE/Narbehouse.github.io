/** Benny's Sphere Splash - settings and saves, in localStorage under the `ss-` prefix.
 *
 * A player who tires mid-match should come back to exactly where they were, so the
 * match is saved at every decision (the sim's snapshot is plain JSON) and every few
 * seconds of live play. Access settings - Auto Scan, scan speed, the voice - are
 * NOT here: they belong to the hub's shared managers and follow the player into
 * every game. Storage can be missing or full (private windows); every call copes.
 */
SS.save = (function () {
  'use strict';

  const KEY_SETTINGS = 'ss-settings', KEY_MATCH = 'ss-match', KEY_ARENA = 'ss-arena', VERSION = 1, SETTINGS_VERSION = 2;
  const DEFAULTS = {
    stops: 'both',          // Decision stops: ours | both | key | coach (Bryan: defend by default)
    shotCam: 'cinematic',   // cinematic | steady: the camera's shot move (game.js shot moment)
    replays: true,          // goal replays (game.js goal moment)
    difficulty: 'normal',   // easy | normal | hard: how much stronger the player's team plays (RULES.DIFFICULTY)
    speed: 'normal',        // Play speed: slow | normal | fast
    commentary: 'full',     // full | calls | captions | off
    uiSize: 1,              // 1 .. 2
    theme: 'standard',      // standard | contrast (Settings > Colour Profile; theme.js)
    motion: 'auto',         // auto (follow the device) | full | reduced (util.reducedMotion)
    sfx: true,              // Sound Effects
    music: true,            // the menu theme and the goal / full-time stings
    crowd: true,            // the crowd's murmur and its reactions
    stadium: 'random',      // random | towers | arches | lamps (world.js STADIUMS): a new pick every match
    timeOfDay: 'random',    // random | day | sunset | night (world.js TIMES)
  };

  function read(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function drop(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

  // Settings v2 made Attack and defense the default. Before that every save stored the
  // old default whether or not anyone chose it, so a v1 save forgets its stops setting.
  const stored = read(KEY_SETTINGS) || {};
  if ((stored.sv || 1) < SETTINGS_VERSION) { delete stored.stops; stored.sv = SETTINGS_VERSION; }
  let settings = Object.assign({}, DEFAULTS, stored);
  settings.sv = SETTINGS_VERSION;
  const listeners = [];
  const settingsApi = {
    get(k) { return settings[k] === undefined ? DEFAULTS[k] : settings[k]; },
    set(k, v) {
      settings[k] = v; write(KEY_SETTINGS, settings);
      listeners.forEach(fn => { try { fn(k, v); } catch (e) { console.error(e); } });
    },
    onChange(fn) { listeners.push(fn); },
    all() { return Object.assign({}, settings); },
  };

  /** A match in progress: { v, setup, snapshot, context, savedAt }. */
  function saveMatch(data) { return write(KEY_MATCH, Object.assign({ v: VERSION, savedAt: Date.now() }, data)); }
  function loadMatch() {
    const m = read(KEY_MATCH);
    if (!m || m.v !== VERSION || !m.snapshot || m.snapshot.done) return null;
    return m;
  }
  function clearMatch() { drop(KEY_MATCH); }
  /** The last match's arena, so the menu behind the title is the stadium you just played in. */
  function lastArena(a) { if (a) write(KEY_ARENA, a); return read(KEY_ARENA); }

  /** Reset Progress: the match in progress and this game's settings. Hub access
   *  settings are the player's, shared by every game, and are left alone. */
  function resetAll() {
    clearMatch(); drop(KEY_SETTINGS);
    settings = Object.assign({ sv: SETTINGS_VERSION }, DEFAULTS);
    listeners.forEach(fn => { try { fn('*'); } catch (e) { console.error(e); } });
  }

  return { settings: settingsApi, saveMatch, loadMatch, clearMatch, lastArena, resetAll, DEFAULTS };
})();
