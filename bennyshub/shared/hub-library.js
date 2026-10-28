/* Personal Hub ordering stays on this device and works without analytics/network access. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BennyLibrary = factory().create(root.NarbePlatform);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const SORTS = ['alphabetical', 'recent', 'most-used'];
  const categories = ['games', 'tools'];
  const validSort = value => SORTS.includes(value) ? value : 'alphabetical';
  const positive = value => Number.isSafeInteger(value) && value > 0 ? value : 0;
  function normalize(value) {
    value = value && typeof value === 'object' ? value : {};
    const usage = {};
    if (value.usage && typeof value.usage === 'object') {
      for (const [key, entry] of Object.entries(value.usage)) {
        if (!/^(games|tools):[^:]{1,200}$/.test(key) || !entry || typeof entry !== 'object') continue;
        usage[key] = { count: positive(entry.count), lastUsed: positive(entry.lastUsed) };
      }
    }
    return {
      sorts: { games: validSort(value.sorts?.games), tools: validSort(value.sorts?.tools) },
      usage
    };
  }
  function create(platform) {
    const store = platform.settings.open({ key: 'narbe-hub-library', normalize });
    function getSort(category) { return store.readCached().sorts[category] || 'alphabetical'; }
    function setSort(category, sort) {
      if (!categories.includes(category)) return;
      const state = store.reload();
      store.save({ ...state, sorts: { ...state.sorts, [category]: validSort(sort) } });
    }
    function recordOpen(category, app, time = Date.now()) {
      if (!categories.includes(category) || !app || typeof app.id !== 'string' || !app.id || app.id.length > 200 || app.id.includes(':')) return;
      const state = store.reload(), key = category + ':' + app.id;
      const previous = state.usage[key] || { count: 0, lastUsed: 0 };
      store.save({ ...state, usage: { ...state.usage, [key]: {
        count: Math.min(Number.MAX_SAFE_INTEGER, previous.count + 1),
        lastUsed: Math.max(previous.lastUsed, positive(time))
      } } });
    }
    function order(items, category, sort = getSort(category)) {
      const usage = store.readCached().usage;
      return items.slice().sort((a, b) => {
        const left = usage[category + ':' + a.id] || { count: 0, lastUsed: 0 };
        const right = usage[category + ':' + b.id] || { count: 0, lastUsed: 0 };
        if (sort === 'recent' && left.lastUsed !== right.lastUsed) return right.lastUsed - left.lastUsed;
        if (sort === 'most-used') {
          if (left.count !== right.count) return right.count - left.count;
          if (left.lastUsed !== right.lastUsed) return right.lastUsed - left.lastUsed;
        }
        return a.title.localeCompare(b.title) || String(a.id).localeCompare(String(b.id));
      });
    }
    return { getSort, setSort, recordOpen, order, reload: store.reload, sorts: SORTS.slice() };
  }
  return { create, normalize };
});
