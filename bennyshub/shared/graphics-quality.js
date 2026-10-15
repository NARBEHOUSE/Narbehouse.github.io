/** Device-local rendering preferences. Storage/lifecycle belong to NarbePlatform. */
window.NarbeGraphics = (function () {
  'use strict';
  const platform = window.NarbePlatform;
  const PIXEL_BUDGET = 1280 * 720;
  const modes = ['high', 'standard', 'low'];
  const choices = ['hub', ...modes];
  // Old Auto choices become fixed High; frame cadence cannot identify GPU capacity.
  const canonical = value => value === 'auto' ? 'high' : value === 'lightweight' ? 'low' : value;
  const title = value => ({ high: 'High', standard: 'Standard', low: 'Low' })[canonical(value)] || 'High';
  const hubListeners = new Set(), games = new Map();
  let disposed = false;
  const hub = platform.settings.open({
    key: 'narbe-graphics-settings',
    normalize: value => ({ version: 1, quality: modes.includes(canonical(value?.quality)) ? canonical(value.quality) : 'high' }),
    onChange: () => { for (const fn of [...hubListeners]) fn(getHub()); }
  });
  function getHub() { return hub.readCached().quality; }
  function setHub(value) {
    if (!modes.includes(value)) throw new Error('Invalid graphics quality');
    hub.save({ version: 1, quality: value });
  }
  function cycleHub() { setHub(modes[(modes.indexOf(getHub()) + 1) % modes.length]); return getHub(); }
  function subscribeHub(fn) { hubListeners.add(fn); return () => hubListeners.delete(fn); }
  function normalizeGame(value) {
    let choice = canonical(value?.choice);
    // Upgrade the earlier compatibility record without losing a deliberate choice.
    if (choice === 'standard' && ['high', 'low'].includes(value?.legacy)) choice = value.legacy;
    return { version: 1, migrated: value?.migrated === true,
      choice: choices.includes(choice) ? choice : 'hub', legacy: null };
  }
  function pixelRatio(standard, width, height, low) {
    const ratio = Number.isFinite(standard) && standard > 0 ? standard : 1;
    if (!low) return ratio;
    const area = Math.max(1, Number(width) || 1) * Math.max(1, Number(height) || 1);
    return Math.min(ratio, 1, Math.sqrt(PIXEL_BUDGET / area));
  }
  function openGame(id, { legacyPreference, highRatio = 2 } = {}) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('Use a stable lowercase game ID');
    if (games.has(id)) return games.get(id);
    let dead = false, initialAntialias = null, originalAntialias = null, last = '';
    const listeners = new Set();
    const store = platform.settings.open({
      key: 'narbe-graphics-game-' + id, normalize: normalizeGame, onChange: notify
    });
    function migrate() {
      if (dead || store.readCached().migrated) return;
      const choice = ['high', 'low'].includes(legacyPreference) ? legacyPreference : 'hub';
      store.save({ version: 1, migrated: true, choice, legacy: null });
    }
    function get() {
      const saved = store.readCached();
      const mode = saved.choice === 'hub' ? getHub() : saved.choice;
      const quality = mode;
      // Antialiasing changes still require a new WebGL context.
      const nextAntialias = originalAntialias === true && mode !== 'low';
      return { choice: saved.choice, mode, quality, legacy: null,
        pendingLaunch: initialAntialias !== null && initialAntialias !== nextAntialias };
    }
    function notify() {
      if (dead) return;
      const next = get(), signature = JSON.stringify(next);
      if (last === signature) return;
      last = signature;
      for (const fn of [...listeners]) fn(next);
    }
    // Compatibility hook for existing render loops. Quality is now explicitly chosen.
    function frame() {}
    if (platform.settings.synchronous !== false) migrate();
    const ready = Promise.all([hub.ready, store.ready]).then(() => { migrate(); notify(); return get(); });
    const stopHub = subscribeHub(notify);
    const stopActivity = platform.lifecycle.onActivity(active => {
      if (active) { hub.reload(); store.reload(); }
    });
    const api = {
      id, ready, get, frame,
      isLightweight: () => get().quality === 'low',
      setChoice(choice) {
        if (!choices.includes(choice)) throw new Error('Invalid game graphics choice');
        store.save({ version: 1, migrated: true, choice, legacy: null });
      },
      cycle() { api.setChoice(choices[(choices.indexOf(get().choice) + 1) % choices.length]); return get(); },
      label() {
        const state = get();
        const detail = title(state.mode);
        let value = state.choice === 'hub' ? 'Use Hub setting (' + detail + ')' : detail;
        if (state.pendingLaunch) value += ' — full change next launch';
        return 'Graphics quality: ' + value;
      },
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      pixelRatio(standard, width, height) {
        if (get().quality === 'high') return Math.min(window.devicePixelRatio || 1, highRatio);
        return pixelRatio(standard, width, height, api.isLightweight());
      },
      rendererOptions(options) {
        originalAntialias = options.antialias === true;
        const mode = get().mode;
        initialAntialias = originalAntialias && mode !== 'low';
        return { ...options, antialias: initialAntialias };
      },
      shadows(renderer, scene, standard) {
        const enabled = !!standard && !api.isLightweight();
        if (renderer.shadowMap.enabled === enabled) return;
        renderer.shadowMap.enabled = enabled;
        scene?.traverse(object => {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) if (material) material.needsUpdate = true;
        });
      },
      dispose() {
        if (dead) return;
        dead = true; stopHub(); stopActivity(); store.dispose?.(); listeners.clear(); games.delete(id);
      }
    };
    games.set(id, api); last = JSON.stringify(get());
    return api;
  }
  const stopClose = platform.lifecycle.onClose?.(() => {
    if (disposed) return;
    disposed = true;
    for (const game of [...games.values()]) game.dispose();
    hub.dispose?.(); hubListeners.clear(); stopClose?.();
  });
  return { getHub, setHub, cycleHub, subscribeHub, openGame, pixelRatio, PIXEL_BUDGET, title, ready: hub.ready };
})();
