/* Aggregate website usage only. Never pass user content or playback URLs here. */
(() => {
  'use strict';
  const w = window, d = document;
  if (w.BennyUsage) return;
  // An owning ancestor records the embedded app; child tags would double-count it.
  try {
    let child = w;
    while (child.parent !== child) {
      const parent = child.parent;
      if (parent.BennyUsage?.ownsFrame(child.frameElement)) return;
      child = parent;
    }
  } catch (_) { /* A cross-origin embed cannot coordinate with its parent. */ }

  const base = new URL('../', d.currentScript.src);
  const normalized = value => {
    try {
      const url = new URL(value, base);
      if (url.origin !== base.origin) return null;
      return url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    } catch (_) { return null; }
  };
  const hubPath = normalized(base.href);
  const isHub = normalized(w.location.href) === hubPath;
  let selectedPath = normalized(w.location.href), ready = false;
  const pendingOpens = [];
  let current = null, registry = new Map();
  const hub = { id: 'hub', name: 'Hub menus', type: 'hub', path: hubPath };
  let elapsed = 0, lastTick = 0, lastFlush = 0, running = false, suspended = false;
  let configured = false, loaderRequested = false;
  const production = w.location.origin === 'https://narbehouse.github.io';
  const clock = () => w.performance.now();
  const foreground = () => !suspended && !d.hidden && d.hasFocus() && w.navigator.onLine !== false;

  function pageFields(app) {
    return { page_location: base.origin + app.path, page_title: app.type === 'hub' ? "Benny's Hub" : app.name, page_referrer: '' };
  }
  function google(app) {
    if (!production || w.navigator.onLine === false) return false;
    if (typeof w.gtag !== 'function') {
      w.dataLayer = w.dataLayer || [];
      w.gtag = function () { w.dataLayer.push(arguments); };
    }
    if (!configured) {
      configured = true;
      w.gtag('js', new Date());
      w.gtag('config', 'G-N0MEEN7YP4', {
        send_page_view: false, allow_google_signals: false,
        allow_ad_personalization_signals: false, ...pageFields(app)
      });
    }
    if (!loaderRequested) {
      loaderRequested = true;
      const script = d.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=G-N0MEEN7YP4';
      script.onerror = () => { loaderRequested = false; script.remove(); };
      d.head.appendChild(script);
    }
    return true;
  }
  function emit(name, values = {}, app = current) {
    if (!app) return;
    try {
      if (!google(app)) return;
      w.gtag('event', name, {
        hub_app_id: app.id, hub_app_name: app.name, hub_app_type: app.type,
        ...values, ...pageFields(app)
      });
    } catch (_) { /* Analytics must never prevent an app from working. */ }
  }
  function advance() {
    const now = clock(), delta = now - lastTick;
    // A suspended browser/device can skip ticks. Do not count that gap as use.
    if (running && delta >= 0 && delta <= 10000) elapsed += delta;
    lastTick = now;
    running = foreground();
  }
  function flush() {
    if (!ready) return;
    advance();
    const seconds = Math.floor(elapsed) / 1000;
    elapsed = 0;
    lastFlush = clock();
    if (seconds > 0) emit('hub_usage', { hub_usage_seconds: seconds });
  }
  function select(app, opened) {
    flush();
    current = app;
    lastTick = clock();
    lastFlush = lastTick;
    running = foreground();
    if (opened && app.type !== 'hub') emit('hub_app_open', { hub_launches: 1 });
  }
  w.BennyUsage = {
    open(src) {
      if (!isHub || !production) return;
      const candidate = normalized(src);
      if (!candidate || (ready && !registry.has(candidate))) return;
      selectedPath = candidate;
      if (ready) select(registry.get(candidate), true);
      else pendingOpens.push(candidate);
    },
    home() {
      if (!isHub || !production) return;
      selectedPath = hubPath;
      if (ready && current !== hub) select(hub, false);
    },
    ownsFrame(frame) {
      if (!frame || frame.ownerDocument !== d) return false;
      return isHub ? frame === d.getElementById('app-iframe') : true;
    }
  };
  if (!production) return;

  Promise.all(['tools', 'games'].map(async group => {
    const response = await w.fetch(new URL('apps/' + group + '/' + group + '.json', base));
    if (!response.ok) throw Error('Usage catalog unavailable');
    const data = await response.json();
    return data[group].map(app => ({
      id: app.id, name: app.title, type: group === 'games' ? 'game' : 'tool', path: normalized(app.path)
    }));
  })).then(groups => {
    registry = new Map(groups.flat().filter(app => app.path).map(app => [app.path, app]));
    current = isHub ? (registry.get(selectedPath) || hub) : registry.get(selectedPath);
    if (!current) return;
    ready = true;
    lastTick = clock();
    lastFlush = lastTick;
    running = foreground();
    emit('page_view');
    if (!isHub) emit('hub_app_open', { hub_launches: 1 });
    for (const requested of pendingOpens) {
      const app = registry.get(requested);
      if (app) emit('hub_app_open', { hub_launches: 1 }, app);
    }
    pendingOpens.length = 0;
    w.setInterval(() => {
      advance();
      if (clock() - lastFlush >= 30000) flush();
    }, 1000);
    d.addEventListener('visibilitychange', flush);
    const focusChanged = () => w.setTimeout(() => { advance(); if (!running) flush(); }, 0);
    w.addEventListener('focus', focusChanged);
    w.addEventListener('blur', focusChanged);
    w.addEventListener('offline', flush);
    w.addEventListener('online', () => { advance(); });
    w.addEventListener('pagehide', () => {
      flush(); suspended = true; running = false;
    });
    w.addEventListener('pageshow', () => {
      suspended = false; lastTick = clock(); lastFlush = lastTick; running = foreground();
    });
  }).catch(() => { /* Catalog/network failures leave games and tools unaffected. */ });
})();
