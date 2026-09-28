/* Shared, dependency-free CSV, storage and scan model. Also usable by node:test. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhraseBoard = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const KEY = 'narbe_phrase_builder', PREVIOUS = KEY + '_previous';
  const fields = ['Category','CategoryOrder','Display','Speak','Image','CategoryColor','TileColor','TileOrder','CategoryImage','BoardName','BoardColor','BoardImage','BoardLayout','CategoryLayout','Group','GroupColor','GroupOrder','ScanOrder','X','Y','Width','Height','Immediate','PredictionPhrases'];
  const keys = fields.map(x => x[0].toLowerCase() + x.slice(1));
  const number = (value, fallback, min, max) => Math.min(max, Math.max(min, value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : fallback));
  function parse(text) {
    const table = []; let row = [], cell = '', quoted = false;
    text = String(text).replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (ch === ',' || ch === '\n' || ch === '\r')) {
        row.push(cell); cell = '';
        if (ch !== ',') { if (row.some(Boolean)) table.push(row); row = []; if (ch === '\r' && text[i + 1] === '\n') i++; }
      } else cell += ch;
    }
    if (quoted) throw new Error('An unfinished quote was found in the CSV. Your saved board has not changed.');
    row.push(cell); if (row.some(Boolean)) table.push(row);
    const header = (table.shift() || []).map(x => x.trim().toLowerCase());
    if (!header.includes('category') || (!header.includes('display') && !header.includes('speak'))) throw new Error('This CSV needs Category and Display or Speak columns.');
    return normalize(table.map(values => Object.fromEntries(keys.map((key, i) => [key, values[header.indexOf(fields[i].toLowerCase())] || '']))));
  }
  function normalize(rows) {
    const counts = new Map();
    const prepared = String(rows.find(row => row.predictionPhrases)?.predictionPhrases || '');
    const board = Object.fromEntries(['boardName','boardColor','boardImage','boardLayout'].map(key => [key, String(rows.find(r => r[key])?.[key] || '')]));
    return rows.map((source, i) => {
      const r = Object.fromEntries(keys.map(key => [key, String(source[key] ?? '')]));
      Object.assign(r, board);
      r.predictionPhrases = String(rows.find(row => row.predictionPhrases)?.predictionPhrases || '');
      r.category = r.category.trim() || 'General';
      const position = counts.get(r.category) || 0; counts.set(r.category, position + 1);
      r.categoryOrder = number(r.categoryOrder, 9999, 0, 99999);
      r.tileOrder = number(r.tileOrder, i + 1, 0, 99999);
      r.boardLayout = r.boardLayout === 'free' ? 'free' : 'grid';
      r.categoryLayout = ['grid','free'].includes(r.categoryLayout) ? r.categoryLayout : '';
      r.group = r.group.trim() || 'Words';
      r.groupColor = color(r.groupColor, '#3676ad');
      r.categoryColor = color(r.categoryColor, '#5bb0ff');
      r.groupOrder = number(r.groupOrder, 1, 0, 99999);
      r.scanOrder = number(r.scanOrder, r.tileOrder, 0, 99999);
      r.width = number(r.width, 220, 120, 1000);
      r.height = number(r.height, 120, 88, 2000);
      r.x = number(r.x, (position % 4) * 240, 0, 1000 - r.width);
      r.y = number(r.y, Math.min(10000, Math.floor(position / 4) * 140), 0, 10000);
      r.immediate = r.immediate === 'true' || r.immediate === '1';
      return r;
    });
  }
  function color(value, fallback = '') { if (/^#[\da-f]{3}$/i.test(value)) return '#' + value.slice(1).split('').map(c=>c+c).join(''); return /^#[\da-f]{6}$/i.test(value) ? value : fallback; }
  function csv(rows) {
    const quote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    return fields.join(',') + '\r\n' + normalize(rows).map((r,i) => keys.map(k => quote(k === 'predictionPhrases' && i > 0 ? '' : r[k])).join(',')).join('\r\n');
  }
  function layout(rows) { return rows[0]?.categoryLayout || rows[0]?.boardLayout || 'grid'; }
  function groups(rows) {
    const map = new Map();
    rows.forEach((row, index) => {
      const name = row.group || 'Words';
      if (!map.has(name)) map.set(name, {name, color: row.groupColor, order: row.groupOrder || 0, items: []});
      map.get(name).items.push({row, index});
    });
    return [...map.values()].sort((a,b) => a.order - b.order).map(group => ({...group, items: group.items.sort((a,b) => a.row.scanOrder - b.row.scanOrder)}));
  }
  function read(storage, key = KEY) {
    let raw = storage.getItem(key);
    if (key === PREVIOUS) {
      try { const current = JSON.parse(storage.getItem(KEY) || 'null'); if (current?.previous) raw = JSON.stringify(current.previous); } catch {}
    }
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.csv !== 'string' || !parse(data.csv).length) throw new Error('The saved board is unreadable. Restore the previous save or import a CSV.');
    return data;
  }
  function save(storage, rows, expectedRevision) {
    if (!rows.length) throw new Error('Add at least one tile before saving.');
    const old = storage.getItem(KEY);
    let prior = null;
    try { prior = read(storage); } catch { /* Preserve the last valid recovery copy. */ }
    if (expectedRevision !== undefined && (prior?.revision || null) !== expectedRevision) throw new Error('This board was saved in another tab. Download your changes, then reload before saving.');
    const data = {boardName: rows[0].boardName || 'My Personal Board', csv: csv(rows), version: 2, revision: Date.now().toString(36) + Math.random().toString(36).slice(2), ts: Date.now()};
    // Commit current and previous together: a quota failure changes neither.
    if (prior) { const {previous, ...snapshot} = prior; data.previous = snapshot; }
    else { try { data.previous = read(storage, PREVIOUS); } catch {} }
    storage.setItem(KEY, JSON.stringify(data));
    // A separate recovery copy also survives malformed current data. The atomic copy above is authoritative.
    if (prior) { try { storage.setItem(PREVIOUS, JSON.stringify(data.previous)); } catch {} }
    return data;
  }
  function restore(storage) {
    const previous = read(storage, PREVIOUS);
    if (!previous) throw new Error('There is no previous save yet.');
    return save(storage, parse(previous.csv));
  }
  // This state machine is shared by the live free-placement board and editor preview.
  class GroupScan {
    constructor(groups) { this.groups = groups.filter(g => g.items.length); this.group = -1; this.tile = -1; }
    move(direction = 1) {
      if (!this.groups.length) return;
      if (this.tile < 0) this.group = this.group < 0 ? (direction < 0 ? this.groups.length - 1 : 0) : (this.group + direction + this.groups.length) % this.groups.length;
      else this.tile = (this.tile + direction + this.groups[this.group].items.length) % this.groups[this.group].items.length;
    }
    select() {
      if (this.group < 0) { this.move(); return null; }
      if (this.tile < 0) { this.tile = 0; return null; }
      const result = this.groups[this.group].items[this.tile]; this.tile = -1; return result;
    }
    back() { this.tile = -1; }
  }
  function predictions(message, rows) {
    const words = String(message).trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const suggestions = [];
    rows.forEach(r => {
      const phrase = (r.speak || r.display || '').trim();
      if (!phrase || /^https?:/i.test(phrase)) return;
      const parts = phrase.split(/\s+/);
      for (let n = Math.min(words.length, parts.length - 1); n > 0; n--) {
        if (parts.slice(0,n).join(' ').toLowerCase() === words.slice(-n).join(' ')) {
          suggestions.push(parts[n], parts.slice(n).join(' ')); break;
        }
      }
    });
    return [...new Set(suggestions)].slice(0,4);
  }
  return {KEY, PREVIOUS, fields, parse, normalize, csv, layout, groups, read, save, restore, GroupScan, predictions, color};
});
