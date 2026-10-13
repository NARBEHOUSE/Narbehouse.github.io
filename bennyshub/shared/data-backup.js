/* Validate caregiver exports before any localStorage write. No app code executes here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BennyBackup = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
  const plain = v => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
  const labels = { keyboard: 'Keyboard', streaming: 'Streaming', dayhub: 'Day Hub' };
  const prefix = 'benny-web:v1:streaming.';
  const keys = {
    keyboard: ['userKeyboardData', 'kb_settings'],
    dayhub: ['dayhub_weather_web_v2'],
    streaming: ['catalog', 'episodes', 'genres', 'lastWatched', 'activePlayback', 'searchHistory', 'settings'].map(k => prefix + k)
  };
  const maxBytes = app => app === 'streaming' ? 8_000_000 : 2_000_000;
  function requireValue(ok, message) { if (!ok) throw Error(message || 'Invalid backup data.'); }
  function object(value, message) { requireValue(plain(value), message); return value; }
  function exact(value, allowed) {
    object(value);
    for (const name of Object.keys(value)) requireValue(allowed.includes(name), 'Unsupported backup field: ' + name);
  }
  function text(value, limit = 100000) { requireValue(typeof value === 'string' && value.length <= limit, 'Invalid or oversized backup text.'); }
  function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) { requireValue(Number.isFinite(value) && value >= min && value <= max, 'Invalid backup number.'); }
  function optional(value, name, check) { if (own(value, name)) check(value[name]); }
  function enumValue(value, choices) { requireValue(choices.includes(value), 'Unrecognized saved setting.'); }
  function bool(value) { requireValue(typeof value === 'boolean', 'Invalid saved setting.'); }
  function safeClone(value, depth = 0, seen = new Set()) {
    requireValue(depth <= 12, 'Backup is nested too deeply.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') { text(value); return value; }
    if (typeof value === 'number') { requireValue(Number.isFinite(value), 'Invalid backup number.'); return value; }
    requireValue(Array.isArray(value) || plain(value), 'Backup must contain only JSON data.');
    requireValue(!seen.has(value), 'Backup contains a circular value.'); seen.add(value);
    const result = Array.isArray(value) ? [] : Object.create(null);
    const names = Object.keys(value); requireValue(names.length <= 50000, 'Too many backup records.');
    for (const name of names) {
      text(name, 2000);
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      requireValue(own(descriptor, 'value'), 'Backup properties must be plain data.');
      // Defining own properties prevents prototype setters from interpreting user titles.
      Object.defineProperty(result, name, { value: safeClone(descriptor.value, depth + 1, seen), enumerable: true, writable: true, configurable: true });
    }
    seen.delete(value); return result;
  }
  function keyboardData(value) {
    exact(value, ['frequent_words', 'bigrams', 'trigrams']);
    for (const kind of ['frequent_words', 'bigrams', 'trigrams']) {
      object(value[kind], 'Invalid keyboard vocabulary.');
      for (const [word, record] of Object.entries(value[kind])) {
        text(word, 2000); requireValue(!['__proto__', 'prototype', 'constructor'].includes(word), 'Unsafe keyboard vocabulary key.');
        exact(record, ['count', 'last_used', 'user_count']);
        finite(record.count); optional(record, 'user_count', n => finite(n));
        optional(record, 'last_used', date => { text(date, 100); requireValue(Number.isFinite(Date.parse(date)), 'Invalid vocabulary date.'); });
      }
    }
  }
  function keyboardSettings(value) {
    exact(value, ['autocapI', 'theme', 'scanSpeed', 'highlightColor', 'autoScan', 'voiceIndex']);
    optional(value, 'autocapI', bool); optional(value, 'autoScan', bool);
    optional(value, 'theme', v => enumValue(v, ['default', 'light', 'dark', 'blue', 'green', 'purple', 'orange', 'red']));
    optional(value, 'scanSpeed', v => enumValue(v, ['slow', 'medium', 'fast']));
    optional(value, 'highlightColor', v => enumValue(v, ['yellow', 'pink', 'green', 'orange', 'black', 'white', 'purple', 'red']));
    optional(value, 'voiceIndex', n => { finite(n, -1, 10000); requireValue(Number.isInteger(n)); });
  }
  function weather(value) {
    exact(value, ['lat', 'lon', 'label']); text(value.label, 2000);
    if (value.lat === null && value.lon === null) { requireValue(value.label === '', 'Empty weather location must have an empty label.'); return; }
    finite(value.lat, -90, 90); finite(value.lon, -180, 180); requireValue(!!value.label.trim(), 'Weather location needs a label.');
  }
  function catalog(value) {
    requireValue(Array.isArray(value) && value.length <= 5000, 'Invalid streaming title library.');
    for (const item of value) {
      object(item); text(item.title); requireValue(!!item.title.trim(), 'Streaming title is empty.'); text(item.url);
      for (const name of ['id', 'episode_key', 'type', 'genre', 'director', 'actors', 'year', 'image', 'description', 'service', 'service_icon', 'trailer']) optional(item, name, v => { requireValue(v == null || ['string', 'number'].includes(typeof v), 'Invalid streaming title field.'); });
    }
  }
  function episodes(value) {
    object(value, 'Invalid episode library.'); requireValue(Object.keys(value).length <= 5000); let count = 0;
    for (const seasons of Object.values(value)) {
      object(seasons);
      for (const [season, rows] of Object.entries(seasons)) {
        requireValue(/^\d{1,4}$/.test(season) && Array.isArray(rows), 'Invalid episode season.');
        for (const row of rows) { object(row); requireValue(++count <= 50000 && row.episode !== null && ['number', 'string'].includes(typeof row.episode) && Number.isSafeInteger(Number(row.episode)) && Number(row.episode) >= 0, 'Invalid episode number.'); text(row.title); text(row.url); }
      }
    }
  }
  function httpImage(value) {
    text(value); if (!value) return;
    let url; try { url = new URL(value); } catch { throw Error('Invalid saved genre image URL.'); }
    requireValue(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password, 'Invalid saved genre image URL.');
  }
  function progress(value) {
    object(value);
    for (const row of Object.values(value)) {
      exact(row, ['url', 'season', 'episode', 'timestamp']); optional(row, 'url', v => text(v));
      for (const name of ['season', 'episode']) optional(row, name, v => { requireValue(['number', 'string'].includes(typeof v) && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) >= -1, 'Invalid progress value.'); });
      optional(row, 'timestamp', v => finite(v));
    }
  }
  function activePlayback(value) {
    exact(value, ['playbackId', 'show', 'season', 'episode']); text(value.playbackId, 100); text(value.show);
    for (const name of ['season', 'episode']) optional(value, name, v => { if (v !== null) requireValue(['number', 'string'].includes(typeof v) && Number.isSafeInteger(Number(v)) && Number(v) >= -1, 'Invalid playback state.'); });
  }
  function streamingSettings(value) {
    exact(value, ['theme', 'highlightStyle', 'highlightColor']);
    optional(value, 'theme', v => enumValue(v, ['default', 'high-contrast', 'dark-blue', 'midnight', 'forest', 'slate']));
    optional(value, 'highlightStyle', v => enumValue(v, ['fill', 'outline']));
    optional(value, 'highlightColor', v => enumValue(v, ['yellow', 'cyan', 'green', 'magenta', 'orange', 'white']));
  }
  const validators = {
    userKeyboardData: keyboardData, kb_settings: keyboardSettings, dayhub_weather_web_v2: weather,
    [prefix + 'catalog']: catalog, [prefix + 'episodes']: episodes,
    [prefix + 'genres']: value => { object(value); for (const url of Object.values(value)) httpImage(url); },
    [prefix + 'lastWatched']: progress, [prefix + 'activePlayback']: activePlayback,
    [prefix + 'searchHistory']: value => { requireValue(Array.isArray(value) && value.length <= 100, 'Invalid streaming search history.'); value.forEach(v => text(v)); },
    [prefix + 'settings']: streamingSettings
  };
  function validate(backup, expectedApp) {
    requireValue(own(labels, expectedApp), 'Choose a supported app backup.');
    exact(backup, backup.version === 2 ? ['version', 'app', 'data', 'migrationArchives'] : ['version', 'app', 'data']);
    requireValue([1, 2].includes(backup.version) && backup.app === expectedApp, 'Choose a version 1 or 2 ' + labels[expectedApp] + ' backup.');
    const clean = safeClone(backup);
    requireValue(new TextEncoder().encode(JSON.stringify(clean)).length <= maxBytes(expectedApp), 'Backup is too large.');
    function dataSet(data) {
      object(data, 'Backup data is missing.');
      for (const key of Object.keys(data)) requireValue(keys[expectedApp].includes(key), 'Unsupported backup key: ' + key);
      for (const [key, value] of Object.entries(data)) validators[key](value);
    }
    dataSet(clean.data);
    const archives = clean.migrationArchives || [];
    requireValue(Array.isArray(archives) && archives.length <= 100, 'Invalid migration recovery archives.');
    for (const archive of archives) {
      exact(archive, ['origin', 'data']); text(archive.origin, 2000);
      let origin; try { origin = new URL(archive.origin); } catch { throw Error('Invalid migration origin.'); }
      requireValue(['http:', 'https:'].includes(origin.protocol) && origin.origin === archive.origin, 'Invalid migration origin.');
      dataSet(archive.data);
    }
    return { app: expectedApp, label: labels[expectedApp], values: clean.data, count: Object.keys(clean.data).length, migrationArchives: archives };
  }
  return { validate, maxBytes };
});
