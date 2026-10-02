/* Mouse/keyboard authoring tool. The game owns switch-accessible play. */
(function () {
  'use strict';
  const P = window.P3, C = P.catalog, L = P.levels, U = P.util, E = P.editorTools, B = C.BOARD;
  const $ = id => document.getElementById(id);
  const button = (id, label, cls) => `<button id="${id}"${cls ? ` class="${cls}"` : ''}>${label}</button>`;
  const input = (id, label, type = 'text', attrs = '') => `<label>${label}<input id="${id}" type="${type}" ${attrs}></label>`;
  const select = (id, label, options = '') => `<label>${label}<select id="${id}">${options}</select></label>`;
  const option = (value, label) => `<option value="${value}">${label}</option>`;
  const section = (title, content, open = true) => `<details${open ? ' open' : ''}><summary>${title}</summary><div class="section">${content}</div></details>`;
  const row = content => `<div class="button-row">${content}</div>`;
  const fields = content => `<div class="fields two">${content}</div>`;
  const ninput = (id, label, min, max, value, step = 1) => input(id, label, 'number', `min="${min}" max="${max}" step="${step}" ${value === undefined ? '' : `value="${value}"`}`);
  const textArea = (id, label, max) => `<label>${label}<textarea id="${id}" rows="2" maxlength="${max}"></textarea></label>`;
  $('editor').innerHTML = `
    <header class="topbar"><div class="brand"><span class="logo">P3GL</span><div><h1>Campaign Editor</h1><p>Build a little world. Make it their own.</p></div></div><nav aria-label="Campaign actions"><a href="index.html" class="button">Back to Game</a>${button('open-library', 'My Campaigns')}${button('save', 'Save Campaign', 'primary')}${button('test', 'Test Play', 'accent')}</nav></header>
    <div class="notice">For caregivers and creators · This editor uses a mouse and keyboard. Your campaigns use the game's switch controls.</div>
    <main class="workspace"><aside class="panel left-panel" aria-label="Campaign and pieces">
    ${section('Campaign', input('campaign-title', 'Title', 'text', 'maxlength="60"') + fields(select('campaign-mode', 'Mode') + select('campaign-theme', 'World')) + textArea('campaign-blurb', 'Description', 240) + input('campaign-author', 'Author', 'text', 'maxlength="60"') + row(button('new-campaign', 'New') + button('save-copy', 'Save a Copy') + button('export', 'Export JSON') + button('import', 'Import JSON')) + '<input id="import-file" type="file" accept=".json,application/json" hidden>')}
    ${section('Levels <span id="level-count" class="count"></span>', '<ol id="levels" aria-label="Campaign levels"></ol>' + row(button('add-level', 'Add') + button('duplicate-level', 'Duplicate') + button('delete-level', 'Delete')) + row(button('level-up', 'Move Up') + button('level-down', 'Move Down')))}
    ${section('Piece palette', select('palette-group', 'Group', option('all', 'All pieces') + option('basic', 'Pegs and collectibles') + option('power', 'Powers') + option('hazard', 'Hazards') + option('brick', 'Bricks and walls') + option('special', 'Special pieces')) + '<div id="palette" class="palette" aria-label="Piece palette"></div><p id="piece-description" class="hint"></p>' + fields(select('paint-color', 'Peg colour') + ninput('paint-radius', 'Radius', 8, 60, 17)))}
    ${section('Patterns and symmetry', select('pattern', 'Pattern', ['single', 'line', 'arc', 'grid', 'spiral', 'circle', 'heart', 'star'].map(p => option(p, p === 'single' ? 'Single piece' : p[0].toUpperCase() + p.slice(1))).join('')) + fields(ninput('pattern-count', 'Pieces / columns', 2, 40, 8) + ninput('pattern-rows', 'Grid rows', 1, 20, 4) + ninput('pattern-width', 'Width', 40, 900, 450) + ninput('pattern-height', 'Height', 40, 750, 300) + ninput('pattern-angle', 'Rotation (degrees)', -360, 360, 0) + select('symmetry', 'Symmetry', option('none', 'None') + option('x', 'Mirror left / right') + option('y', 'Mirror top / bottom') + option('both', 'Four ways'))) + button('add-pattern', 'Add at Board Centre') + '<p class="hint">Choose Place and click the board to stamp a pattern around that point. Symmetry also applies to a single piece.</p>', false)}
    </aside><section class="board-area" aria-label="Board design"><div class="toolbar">${row(button('tool-select', 'Select / Move') + button('tool-place', 'Place'))}${row(button('undo', 'Undo') + button('redo', 'Redo') + button('duplicate-items', 'Duplicate') + button('delete-items', 'Delete'))}<label class="check"><input id="snap" type="checkbox" checked>Snap 10</label>${button('preview-motion', 'Preview Motion')}</div><div class="canvas-wrap"><canvas id="board" width="1000" height="1080" tabindex="0" aria-label="Level board. Select a piece from the list to edit with the keyboard."></canvas></div><div class="board-footer"><span id="board-summary"></span><span id="coordinates">1000 × 1080</span></div><p class="hint instructions">Click to select; Shift-click adds to the selection. Drag to move. Arrow keys nudge; Shift moves ten. Delete removes selected pieces. Ctrl+Z undoes.</p><div id="status" role="status" aria-live="polite">Ready to create.</div></section>
    <aside class="panel right-panel" aria-label="Level and selected pieces">
    ${section('Level settings', input('level-name', 'Name', 'text', 'maxlength="60"') + textArea('level-intro', 'Introduction', 300) + select('goal-type', 'Goal') + fields('<div id="goal-color-label">' + select('goal-color', 'Goal colour') + '</div><div id="goal-value-label">' + ninput('goal-value', 'Target', 1, 5000000, 10) + '</div>' + ninput('level-balls', 'Balls', 1, 50) + select('level-guide', 'Aim guide', option('', 'Mode default') + ['short', 'medium', 'long'].map(p => option(p, p[0].toUpperCase() + p.slice(1))).join(''))) + section('Physics and stars', fields(ninput('level-gravity', 'Gravity multiplier', .5, 1.6, undefined, .05) + ninput('level-speed', 'Speed multiplier', .7, 1.4, undefined, .05) + ninput('star-two', 'Two stars', 1, 10000000, undefined, 500) + ninput('star-three', 'Three stars', 2, 10000000, undefined, 500)) + '<p class="hint">Leave both star scores empty to use automatic scores.</p>', false))}
    ${section('Base plate', fields(select('plate-mode', 'Behaviour', ['bounce', 'catch', 'timed'].map(p => option(p, p[0].toUpperCase() + p.slice(1))).join('')) + ninput('plate-width', 'Width', 80, 700) + ninput('plate-speed', 'Speed', 0, 600) + ninput('plate-period', 'Timed interval (s)', .5, 30, undefined, .5) + ninput('plate-x', 'Start X', 40, 960)), false)}
    ${section('Selection <span id="selection-count" class="count"></span>', '<p id="selection-hint" class="hint">Select pieces on the board or in the list below.</p><div id="inspector" hidden>' + select('item-type', 'Piece type') + fields(ninput('item-x', 'X', 0, 1000) + ninput('item-y', 'Y', 0, 1080) + '<div data-shape="peg">' + ninput('item-r', 'Radius', 8, 60) + '</div><div data-shape="brick">' + ninput('item-w', 'Width', 10, 600) + '</div><div data-shape="brick">' + ninput('item-h', 'Height', 10, 300) + '</div><div data-shape="brick">' + ninput('item-a', 'Angle', -360, 360) + '</div><div id="item-color-label">' + select('item-color', 'Colour') + '</div><div id="item-hp-label">' + ninput('item-hp', 'Hits to break', 1, 4) + '</div><div id="item-pair-label">' + select('item-pair', 'Portal pair', C.PORTAL_COLORS.map((_, i) => option(i, 'Pair ' + (i + 1))).join('')) + '</div>') + select('motion-type', 'Motion', option('none', 'Still') + option('rotate', 'Rotate around a point') + option('slide', 'Slide back and forth') + option('orbit', 'Orbit the starting point')) + '<div id="motion-fields" class="fields two"></div><p class="hint">Changes apply to all selected pieces. Coordinates move the group together.</p></div><label>Pieces on this level<select id="item-list" multiple size="5" aria-label="Pieces on this level"></select></label>' + row(button('select-all', 'Select All') + button('clear-level', 'Clear Level')))}
    ${section('Check and playtest', '<ul id="problems" class="problems"></ul>' + button('estimate', 'Estimate Difficulty') + button('cancel-estimate', 'Cancel Estimate') + '<p id="estimate-result" class="hint">The bot tries novice, average and expert play using the game’s real physics. This is an estimate, not a guarantee.</p>' + button('apply-stars', 'Use Suggested Star Scores'))}
    </aside></main>
    <dialog id="library-dialog" aria-labelledby="library-title"><div class="dialog-heading"><h2 id="library-title">My Campaigns</h2>${button('close-library', 'Close')}</div><p>Campaigns saved here also appear in the game’s My Campaigns menu on this browser.</p><div id="library-list"></div></dialog>
    <dialog id="test-dialog" aria-labelledby="test-title"><div class="dialog-heading"><h2 id="test-title">Test Play</h2>${button('close-test', 'Back to Editor')}</div><iframe id="test-frame" title="P3GL test play" allow="autoplay"></iframe></dialog>`;

  const canvas = $('board'), ctx = canvas.getContext('2d');
  let campaign, levelIndex = 0, selected = new Set(), tool = 'select', paint = 'peg', dirty = false;
  let undo = [], redo = [], drag = null, preview = false, previewTime = 0, lastFrame = 0, bodies = [], world;
  let estimator = null, estimateKey = '', suggestedStars = null, draftSaved = true;
  const level = () => campaign.levels[levelIndex];
  const selectedItems = () => Array.from(selected).map(i => level().items[i]).filter(Boolean);
  const val = id => $(id).value;
  const num = (id, fallback) => { const el = $(id), raw = el.value.trim(), n = Number(raw); return raw && Number.isFinite(n) ? U.clamp(n, el.min === '' ? -Infinity : +el.min, el.max === '' ? Infinity : +el.max) : fallback; };
  const put = (id, value) => { $(id).value = value === undefined ? '' : value; };
  const on = (id, fn) => { $(id).onclick = fn; };
  function options(id, entries) { $(id).replaceChildren(...entries.map(([v, label]) => { const el = document.createElement('option'); el.value = v; el.textContent = label; return el; })); }
  function status(message, error) { $('status').textContent = message; $('status').classList.toggle('error', !!error); }
  function snapshot() { return JSON.stringify({ campaign, levelIndex, selected: Array.from(selected) }); }
  function checkpoint() { undo.push(snapshot()); if (undo.length > 70) undo.shift(); redo.length = 0; }
  function restore(data) { const state = JSON.parse(data); campaign = state.campaign; levelIndex = state.levelIndex; selected = new Set(state.selected); changed(); }
  function commit(fn) { checkpoint(); fn(); changed(); }
  function clearEstimate() {
    cancelEstimate(); suggestedStars = null; $('apply-stars').hidden = true;
    $('estimate-result').textContent = 'The bot tries novice, average and expert play using the game’s real physics. This is an estimate, not a guarantee.';
  }
  function changed() {
    dirty = true; stopPreview(); clearEstimate();
    persist(); refresh();
  }
  function persist() {
    draftSaved = U.save('editor-draft', { campaign, level: levelIndex });
    if (!draftSaved) status('Browser storage is full or unavailable. Export JSON to keep this campaign.', true);
  }
  function replace(next, index = 0) {
    campaign = E.copy(next);
    if (!P.themes.THEMES[campaign.theme]) campaign.theme = P.themes.BY_MODE[campaign.mode][0];
    levelIndex = U.clamp(index, 0, campaign.levels.length - 1); selected.clear(); undo = []; redo = []; dirty = false; clearEstimate(); stopPreview(); persist(); refresh();
  }
  function canReplace() { return !dirty || window.confirm('Replace the current draft? Save Campaign or Export JSON first to keep a separate copy.'); }
  function switchLevel(index) { levelIndex = index; selected.clear(); clearEstimate(); stopPreview(); persist(); refresh(); }
  function setTool(next) { tool = next; $('tool-select').setAttribute('aria-pressed', tool === 'select'); $('tool-place').setAttribute('aria-pressed', tool === 'place'); canvas.style.cursor = tool === 'place' ? 'crosshair' : 'default'; }

  options('campaign-mode', C.MODE_IDS.map(k => [k, C.MODES[k].name]));
  options('campaign-theme', Object.keys(P.themes.THEMES).map(k => [k, P.themes.THEMES[k].name]));
  for (const id of ['paint-color', 'goal-color']) options(id, C.PEG_COLOR_IDS.map(k => [k, C.PEG_COLORS[k].name]));
  options('goal-type', Object.keys(C.GOALS).map(k => [k, C.GOALS[k].name]));
  options('item-type', Object.keys(C.TYPES).map(k => [k, C.TYPES[k].name]));
  $('cancel-estimate').hidden = true; $('apply-stars').hidden = true;

  function pieceColor(it) {
    return it.t === 'peg' ? C.PEG_COLORS[it.c || 'blue'].hex : it.t === 'key' || it.t === 'gate' ? C.PEG_COLORS[it.k || 'blue'].hex : it.t === 'portal' ? C.PORTAL_COLORS[it.p || 0] : it.t === 'brick' ? C.BRICK_HP[it.hp || 1].hex : C.TYPES[it.t].color || '#aec7fa';
  }
  function refreshPalette() {
    const group = val('palette-group'); $('palette').replaceChildren();
    Object.entries(C.TYPES).forEach(([id, def]) => {
      const fits = group === 'all' || (group === 'basic' ? def.role === 'basic' || id === 'lantern' : group === 'brick' ? def.shape === 'brick' : group === 'special' ? def.role === 'special' || def.role === 'solid' : def.role === group);
      if (!fits) return;
      const b = document.createElement('button'), swatch = document.createElement('span');
      swatch.className = 'swatch ' + def.shape; swatch.style.background = pieceColor(L.normItem({ t: id }));
      b.append(swatch, document.createTextNode(def.name)); b.setAttribute('aria-pressed', id === paint); b.title = def.desc;
      b.onclick = () => { paint = id; setTool('place'); refreshPalette(); status(def.name + ' selected. Click the board to place it.'); };
      $('palette').append(b);
    });
    $('piece-description').textContent = C.TYPES[paint].desc;
  }
  function refresh() {
    const lv = level();
    for (const field of ['title', 'mode', 'theme', 'blurb', 'author']) put('campaign-' + field, campaign[field]);
    for (const field of ['name', 'intro', 'balls', 'gravity', 'speed', 'guide']) put('level-' + field, lv[field]);
    put('goal-type', lv.goal.type); put('goal-color', lv.goal.color || 'orange'); put('goal-value', lv.goal[lv.goal.type] || 10);
    $('goal-color-label').hidden = lv.goal.type !== 'color'; $('goal-value-label').hidden = !['score', 'count', 'chain'].includes(lv.goal.type);
    put('star-two', lv.stars && lv.stars[0]); put('star-three', lv.stars && lv.stars[1]);
    for (const [field, prop] of [['mode', 'mode'], ['width', 'w'], ['speed', 'speed'], ['period', 'period'], ['x', 'x']]) put('plate-' + field, lv.plate[prop]);
    $('plate-period').disabled = lv.plate.mode !== 'timed';
    $('levels').replaceChildren(); campaign.levels.forEach((l, i) => {
      const li = document.createElement('li'), b = document.createElement('button'), number = document.createElement('span'); number.textContent = String(i + 1).padStart(2, '0'); b.append(number, document.createTextNode(l.name)); b.classList.toggle('active', i === levelIndex); b.setAttribute('aria-current', i === levelIndex ? 'true' : 'false'); b.onclick = () => switchLevel(i); li.append(b); $('levels').append(li);
    });
    $('level-count').textContent = campaign.levels.length + ' / ' + L.MAX_LEVELS;
    $('level-up').disabled = levelIndex === 0; $('level-down').disabled = levelIndex === campaign.levels.length - 1; $('delete-level').disabled = campaign.levels.length < 2;
    $('add-level').disabled = $('duplicate-level').disabled = campaign.levels.length >= L.MAX_LEVELS;
    $('undo').disabled = !undo.length; $('redo').disabled = !redo.length;
    $('save').textContent = dirty ? 'Save Campaign ·' : 'Save Campaign';
    selected = new Set(Array.from(selected).filter(i => lv.items[i]));
    refreshSelection(); refreshProblems(); refreshPalette(); rebuildPreview(); draw();
  }
  function refreshSelection() {
    const items = selectedItems(), it = items[0];
    $('selection-count').textContent = items.length; $('inspector').hidden = !it; $('selection-hint').hidden = !!it;
    $('delete-items').disabled = $('duplicate-items').disabled = !it;
    const list = $('item-list'), scroll = list.scrollTop; list.replaceChildren();
    level().items.forEach((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `${i + 1}. ${C.TYPES[p.t].name}${p.c ? ' · ' + p.c : ''} (${Math.round(p.x)}, ${Math.round(p.y)})`; o.selected = selected.has(i); list.append(o); }); list.scrollTop = scroll;
    if (it) {
      put('item-type', it.t); for (const k of ['x', 'y', 'r', 'w', 'h', 'a', 'hp']) put('item-' + k, it[k] === undefined ? '' : Math.round(it[k] * 100) / 100);
      document.querySelectorAll('[data-shape]').forEach(el => { el.hidden = el.dataset.shape !== C.TYPES[it.t].shape; });
      $('item-color-label').hidden = !['peg', 'key', 'gate'].includes(it.t); $('item-hp-label').hidden = !['brick', 'armor'].includes(it.t); $('item-pair-label').hidden = it.t !== 'portal';
      options('item-color', (it.t === 'peg' ? C.PEG_COLOR_IDS : C.KEY_COLORS).map(k => [k, C.PEG_COLORS[k].name])); put('item-color', it.c || it.k || 'blue'); put('item-pair', it.p || 0);
      put('motion-type', it.m ? it.m.type : 'none'); renderMotionFields(it.m);
    }
    $('board-summary').textContent = level().name + ' · ' + level().items.length + ' / ' + L.MAX_ITEMS + ' pieces'; draw();
  }
  function refreshProblems() {
    const probs = E.problems(level(), campaign.mode); $('problems').replaceChildren(); $('problems').classList.toggle('good', !probs.length);
    for (const problem of probs.length ? probs : ['Ready to test. No placement or goal problems found.']) { const li = document.createElement('li'); li.textContent = problem; $('problems').append(li); }
  }
  function renderMotionFields(m) {
    const spec = !m ? [] : m.type === 'rotate' ? [['cx', 'Centre X', 0, 1000, 1], ['cy', 'Centre Y', 0, 1080, 1], ['speed', 'Degrees / second', -360, 360, 1]] : m.type === 'slide' ? [['dx', 'Horizontal travel', -800, 800, 1], ['dy', 'Vertical travel', -800, 800, 1], ['period', 'Period (seconds)', .5, 60, .5], ['phase', 'Starting phase', 0, 1, .05]] : [['r', 'Orbit radius', 4, 400, 1], ['speed', 'Degrees / second', -720, 720, 1], ['phase', 'Starting phase', 0, 1, .05]];
    $('motion-fields').innerHTML = spec.map(([k, label, min, max, step]) => ninput('motion-' + k, label, min, max, m[k], step)).join('');
    for (const [k] of spec) $('motion-' + k).onchange = () => { const n = num('motion-' + k, m[k]); commit(() => selectedItems().forEach(p => { p.m = Object.assign({}, p.m || m, { [k]: n }); p.m = L.normMotion(p.m); })); };
  }

  for (const field of ['title', 'blurb', 'author', 'theme']) $('campaign-' + field).onchange = () => { const value = val('campaign-' + field).trim(); commit(() => { campaign[field] = value || (field === 'title' ? 'My Campaign' : ''); }); };
  $('campaign-mode').onchange = () => { const mode = val('campaign-mode'); commit(() => { campaign.mode = mode; campaign.theme = P.themes.BY_MODE[mode][0]; }); status('Mode changed. Existing ball counts and base plates are preserved; new levels use this mode’s defaults.'); };
  for (const field of ['name', 'intro', 'guide', 'balls', 'gravity', 'speed']) $('level-' + field).onchange = () => { const value = ['balls', 'gravity', 'speed'].includes(field) ? num('level-' + field, level()[field]) : val('level-' + field).trim(); commit(() => { level()[field] = value || (field === 'name' ? 'Level ' + (levelIndex + 1) : ''); }); };
  $('goal-type').onchange = () => { const type = val('goal-type'); commit(() => { level().goal = L.normLevel({ items: level().items, goal: { type } }, campaign.mode, levelIndex).goal; }); };
  $('goal-color').onchange = () => { const color = val('goal-color'); commit(() => { level().goal.color = color; }); };
  $('goal-value').onchange = () => { const n = num('goal-value', 10); commit(() => { const g = level().goal; g[g.type] = Math.max(g.type === 'score' ? 1000 : g.type === 'chain' ? 2 : 1, Math.round(n)); }); };
  for (const [field, prop] of [['mode', 'mode'], ['width', 'w'], ['speed', 'speed'], ['period', 'period'], ['x', 'x']]) $('plate-' + field).onchange = () => { const value = field === 'mode' ? val('plate-mode') : num('plate-' + field, level().plate[prop]); commit(() => { level().plate[prop] = value; }); };
  function setStars() {
    const a = num('star-two', 0), b = num('star-three', 0);
    if (a && b && b <= a) { status('Three stars must need a higher score than two stars.', true); return; }
    if (!!a !== !!b) { status('Enter both star scores, or clear both to use automatic scores.'); return; }
    commit(() => { if (a && b) level().stars = [Math.round(a), Math.round(b)]; else delete level().stars; });
  }
  $('star-two').onchange = $('star-three').onchange = setStars;
  for (const prop of ['x', 'y', 'r', 'w', 'h', 'a', 'hp']) $('item-' + prop).onchange = () => {
    const first = selectedItems()[0]; if (!first) return; const n = num('item-' + prop, first[prop]);
    commit(() => {
      if (prop === 'x' || prop === 'y') moveSelected(prop === 'x' ? n - first.x : 0, prop === 'y' ? n - first.y : 0);
      else selected.forEach(i => { const p = level().items[i]; level().items[i] = L.normItem(Object.assign({}, p, { [prop]: n })); });
    });
  };
  $('item-type').onchange = () => { const t = val('item-type'); commit(() => selected.forEach(i => { level().items[i] = L.normItem(Object.assign({}, level().items[i], { t })); })); };
  $('item-color').onchange = () => { const color = val('item-color'); commit(() => selectedItems().forEach(p => { if (p.t === 'peg') p.c = color; else if ((p.t === 'key' || p.t === 'gate') && C.KEY_COLORS.includes(color)) p.k = color; })); };
  $('item-pair').onchange = () => { const pair = +val('item-pair'); commit(() => selectedItems().forEach(p => { if (p.t === 'portal') p.p = pair; })); };
  $('motion-type').onchange = () => {
    const type = val('motion-type'), items = selectedItems(), cx = items.reduce((s, p) => s + p.x, 0) / items.length, cy = items.reduce((s, p) => s + p.y, 0) / items.length;
    commit(() => items.forEach(p => { if (type === 'none') delete p.m; else p.m = type === 'rotate' ? { type, cx, cy, speed: 30 } : type === 'slide' ? { type, dx: 80, dy: 0, period: 4, phase: 0 } : { type, r: 40, speed: 60, phase: 0 }; }));
  };
  $('item-list').onchange = () => { stopPreview(); selected = new Set(Array.from($('item-list').selectedOptions).map(o => +o.value)); refreshSelection(); };
  $('palette-group').onchange = refreshPalette;
  on('tool-select', () => setTool('select')); on('tool-place', () => setTool('place'));
  on('undo', () => { if (undo.length) { redo.push(snapshot()); restore(undo.pop()); } });
  on('redo', () => { if (redo.length) { undo.push(snapshot()); restore(redo.pop()); } });
  on('select-all', () => { selected = new Set(level().items.map((_, i) => i)); refreshSelection(); });
  on('delete-items', () => { if (selected.size) commit(() => { level().items = level().items.filter((_, i) => !selected.has(i)); selected.clear(); }); });
  on('duplicate-items', () => {
    const items = E.copy(selectedItems()); if (!items.length) return;
    if (level().items.length + items.length > L.MAX_ITEMS) return status('A level can have at most ' + L.MAX_ITEMS + ' pieces.', true);
    commit(() => { selected = new Set(items.map((it, n) => { it.x += 25; it.y += 25; if (it.m && it.m.type === 'rotate') { it.m.cx += 25; it.m.cy += 25; } E.clampItem(it); return level().items.length + n; })); level().items.push(...items); });
  });
  on('clear-level', () => { if (level().items.length && confirm('Remove every piece from this level? You can Undo this.')) commit(() => { level().items = []; selected.clear(); }); });
  on('add-level', () => { if (campaign.levels.length < L.MAX_LEVELS) commit(() => { campaign.levels.push(E.newLevel(campaign.mode, campaign.levels.length, false)); levelIndex = campaign.levels.length - 1; selected.clear(); }); });
  on('duplicate-level', () => { if (campaign.levels.length < L.MAX_LEVELS) commit(() => { const lv = E.copy(level()); lv.name = (lv.name + ' copy').slice(0, 60); campaign.levels.splice(levelIndex + 1, 0, lv); levelIndex++; selected.clear(); }); });
  on('delete-level', () => { if (campaign.levels.length > 1 && confirm('Delete “' + level().name + '”? You can Undo this.')) commit(() => { campaign.levels.splice(levelIndex, 1); levelIndex = Math.min(levelIndex, campaign.levels.length - 1); selected.clear(); }); });
  for (const [id, delta] of [['level-up', -1], ['level-down', 1]]) on(id, () => { const to = levelIndex + delta; if (campaign.levels[to]) commit(() => { [campaign.levels[to], campaign.levels[levelIndex]] = [campaign.levels[levelIndex], campaign.levels[to]]; levelIndex = to; }); });

  function place(x, y) {
    stopPreview(); const snap = $('snap').checked; if (snap) { x = Math.round(x / 10) * 10; y = Math.round(y / 10) * 10; }
    const template = { t: paint, r: num('paint-radius', 17), c: val('paint-color') };
    const items = E.symmetry(E.pattern({ type: val('pattern'), x, y, count: num('pattern-count', 8), rows: num('pattern-rows', 4), width: num('pattern-width', 450), height: num('pattern-height', 300), angle: num('pattern-angle', 0) }, template), val('symmetry'));
    if (level().items.length + items.length > L.MAX_ITEMS) return status('This pattern would exceed the ' + L.MAX_ITEMS + '-piece limit. Use fewer pieces or rows.', true);
    commit(() => { selected = new Set(items.map((_, n) => level().items.length + n)); level().items.push(...items); });
    status('Added ' + items.length + ' piece' + (items.length === 1 ? '.' : 's.'));
  }
  on('add-pattern', () => place(B.W / 2, (B.SAFE_TOP + B.SAFE_BOTTOM) / 2));
  function point(event) { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) * B.W / r.width, y: (event.clientY - r.top) * B.H / r.height }; }
  function moveSelected(dx, dy, source) {
    const items = source || selectedItems();
    for (const p of items) { const b = E.bounds(p); dx = U.clamp(dx, B.MARGIN - b.x1, B.W - B.MARGIN - b.x2); dy = U.clamp(dy, B.SAFE_TOP - b.y1, B.SAFE_BOTTOM - b.y2); }
    Array.from(selected).forEach((i, n) => { const old = items[n], p = level().items[i]; p.x = old.x + dx; p.y = old.y + dy; if (old.m && old.m.type === 'rotate') p.m = Object.assign({}, old.m, { cx: old.m.cx + dx, cy: old.m.cy + dy }); });
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return; stopPreview(); const p = point(event); canvas.focus();
    if (tool === 'place') { place(p.x, p.y); return; }
    let hit = -1; for (let i = level().items.length - 1; i >= 0; i--) if (E.hit(level().items[i], p.x, p.y)) { hit = i; break; }
    if (hit < 0) { if (!event.shiftKey) selected.clear(); refreshSelection(); return; }
    if (event.shiftKey) { if (selected.has(hit)) selected.delete(hit); else selected.add(hit); } else if (!selected.has(hit)) selected = new Set([hit]);
    if (selected.has(hit)) { drag = { start: p, items: E.copy(selectedItems()), saved: false }; canvas.setPointerCapture(event.pointerId); }
    refreshSelection();
  });
  canvas.addEventListener('pointermove', event => {
    const p = point(event); $('coordinates').textContent = Math.round(p.x) + ', ' + Math.round(p.y);
    if (!drag) return; let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if ($('snap').checked) { dx = Math.round(dx / 10) * 10; dy = Math.round(dy / 10) * 10; }
    if (!drag.saved && Math.abs(dx) + Math.abs(dy) < 1) return;
    if (!drag.saved) { checkpoint(); drag.saved = true; }
    moveSelected(dx, dy, drag.items); rebuildPreview(); draw();
  });
  function endDrag() { if (!drag) return; const didMove = drag.saved; drag = null; if (didMove) changed(); }
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]') || event.target.closest('input,textarea,select,[contenteditable=true]')) return;
    const key = event.key.toLowerCase(), command = event.ctrlKey || event.metaKey;
    if (command && key === 'z') { event.preventDefault(); $(event.shiftKey ? 'redo' : 'undo').click(); }
    else if (command && key === 'y') { event.preventDefault(); $('redo').click(); }
    else if (command && key === 'd') { event.preventDefault(); $('duplicate-items').click(); }
    else if (command && key === 'a') { event.preventDefault(); $('select-all').click(); }
    else if (command && key === 's') { event.preventDefault(); saveCampaign(); }
    else if (key === 'delete' || key === 'backspace') { event.preventDefault(); $('delete-items').click(); }
    else if (key.startsWith('arrow') && selected.size) { event.preventDefault(); const n = event.shiftKey ? 10 : 1; commit(() => moveSelected(key === 'arrowleft' ? -n : key === 'arrowright' ? n : 0, key === 'arrowup' ? -n : key === 'arrowdown' ? n : 0)); }
  });

  function rebuildPreview() { bodies = level().items.map(P.physics.makeBody); world = new P.physics.World(level(), C.MODES[campaign.mode], 1); }
  function stopPreview() { preview = false; previewTime = 0; $('preview-motion').setAttribute('aria-pressed', false); $('preview-motion').textContent = 'Preview Motion'; }
  on('preview-motion', () => { preview = !preview; previewTime = 0; $('preview-motion').setAttribute('aria-pressed', preview); $('preview-motion').textContent = preview ? 'Stop Motion' : 'Preview Motion'; draw(); });
  const glyphs = { gem: '◆', lantern: '☀', key: 'K', bumper: '+', steel: '●', portal: '◎', multiball: '3', extra: '+1', multiplier: '×2', zap: 'ϟ', spray: '⋰', net: '∪', blast: '✹', fire: 'F', guide: '↗', thief: '−', shrink: '↘', sludge: '~', spike: '▲', hole: '●', gate: 'K', armor: 'A' };
  function draw() {
    if (!campaign || !world) return;
    ctx.clearRect(0, 0, B.W, B.H); const theme = P.themes.theme(campaign.theme);
    const bg = ctx.createLinearGradient(0, 0, 0, B.H); bg.addColorStop(0, '#151e37'); bg.addColorStop(1, '#0a1024'); ctx.fillStyle = bg; ctx.fillRect(0, 0, B.W, B.H);
    ctx.strokeStyle = '#a3b5eb10'; ctx.lineWidth = 1;
    for (let x = 0; x <= B.W; x += 50) { ctx.beginPath(); ctx.moveTo(x, B.SAFE_TOP); ctx.lineTo(x, B.SAFE_BOTTOM); ctx.stroke(); }
    for (let y = B.SAFE_TOP; y <= B.SAFE_BOTTOM; y += 50) { ctx.beginPath(); ctx.moveTo(B.MARGIN, y); ctx.lineTo(B.W - B.MARGIN, y); ctx.stroke(); }
    ctx.strokeStyle = theme.accent + '66'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.strokeRect(B.MARGIN, B.SAFE_TOP, B.W - B.MARGIN * 2, B.SAFE_BOTTOM - B.SAFE_TOP); ctx.setLineDash([]);
    ctx.font = '19px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#8e9cb8'; ctx.fillText('LAUNCHER', B.LAUNCH_X, 112);
    ctx.fillStyle = theme.accent; ctx.beginPath(); ctx.arc(B.LAUNCH_X, B.LAUNCH_Y, 22, 0, U.TAU); ctx.fill();
    ctx.fillStyle = '#f2f7ff'; ctx.fillRect(B.LAUNCH_X - 6, B.LAUNCH_Y + 14, 12, 20);
    const pose = {};
    level().items.forEach((it, index) => {
      const body = bodies[index]; if (!body) return;
      if (preview) P.physics.poseAt(body, previewTime, pose); else Object.assign(pose, { x: it.x, y: it.y, a: U.rad(it.a || 0) });
      ctx.save(); ctx.translate(pose.x, pose.y); ctx.rotate(pose.a); const r = it.r || 0;
      ctx.shadowColor = pieceColor(it); ctx.shadowBlur = 9; ctx.fillStyle = pieceColor(it); ctx.strokeStyle = '#e8f5ff8c'; ctx.lineWidth = 2;
      ctx.beginPath(); if (r) ctx.arc(0, 0, r, 0, U.TAU); else ctx.roundRect(-it.w / 2, -it.h / 2, it.w, it.h, Math.min(5, it.h / 4)); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      const target = level().goal.type === 'color' && it.t === 'peg' && it.c === level().goal.color;
      const text = target ? '★' : it.t === 'portal' ? String(it.p + 1) : it.t === 'brick' ? '•'.repeat(it.hp || 1) : glyphs[it.t] || '';
      if (text) { ctx.font = 'bold ' + (r ? Math.max(12, Math.min(r * 1.12, 25)) : 14) + 'px system-ui'; ctx.fillStyle = it.t === 'hole' || it.t === 'thief' ? '#fff' : '#101930'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 0); }
      if (selected.has(index)) { ctx.strokeStyle = '#fff2a0'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.beginPath(); if (r) ctx.arc(0, 0, r + 7, 0, U.TAU); else ctx.rect(-it.w / 2 - 6, -it.h / 2 - 6, it.w + 12, it.h + 12); ctx.stroke(); ctx.setLineDash([]); }
      ctx.restore();
    });
    const plate = world.plate, pp = {}; P.physics.plateAt(plate, preview ? previewTime : 0, pp);
    ctx.strokeStyle = pp.state === 'catch' ? '#64e3db' : '#b7a0ff'; ctx.fillStyle = pp.state === 'catch' ? '#64e3db' : '#b7a0ff'; ctx.lineWidth = 9;
    if (pp.state === 'catch') { ctx.beginPath(); ctx.moveTo(pp.x - plate.w / 2, B.PLATE_Y - 13); ctx.lineTo(pp.x - plate.w / 2 + 12, B.PLATE_Y + 5); ctx.lineTo(pp.x + plate.w / 2 - 12, B.PLATE_Y + 5); ctx.lineTo(pp.x + plate.w / 2, B.PLATE_Y - 13); ctx.stroke(); }
    else { ctx.fillRect(pp.x - plate.w / 2, B.PLATE_Y - 7, plate.w, 12); ctx.fillRect(pp.x - plate.w / 4 - 4, B.PLATE_Y + 8, 8, 15); ctx.fillRect(pp.x + plate.w / 4 - 4, B.PLATE_Y + 8, 8, 15); }
    ctx.textBaseline = 'alphabetic'; ctx.font = '16px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#bac7df'; ctx.fillText(level().plate.mode === 'timed' ? 'Timed · ' + pp.state : pp.state[0].toUpperCase() + pp.state.slice(1), pp.x, B.PLATE_Y - 24);
  }
  function frame(now) { const dt = Math.min(.05, (now - lastFrame) / 1000); lastFrame = now; if (preview && !document.hidden) { previewTime += dt; draw(); } requestAnimationFrame(frame); }

  function saveCampaign() {
    if (!L.saveToLibrary(campaign)) return status('Could not save: browser storage is full or unavailable. Export JSON instead.', true);
    dirty = false; persist(); refresh(); const issues = campaign.levels.reduce((n, lv) => n + E.problems(lv, campaign.mode).length, 0);
    status('Saved “' + campaign.title + '” to My Campaigns.' + (issues ? ' Review the level checks before sharing.' : ' Ready to play from the game.'));
  }
  on('save', saveCampaign);
  on('save-copy', () => { commit(() => { campaign.id = E.uid(); campaign.title = (campaign.title + ' copy').slice(0, 60); }); saveCampaign(); });
  on('new-campaign', () => { if (canReplace()) { replace(E.newCampaign()); status('Started a new campaign with a simple board.'); } });
  on('export', () => {
    const json = JSON.stringify(L.normCampaign(campaign), null, 2), url = URL.createObjectURL(new Blob([json], { type: 'application/json' })), link = document.createElement('a');
    link.href = url; link.download = (campaign.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'p3gl-campaign') + '.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); status('Exported campaign JSON. Open it in P3GL or import it here to edit.');
  });
  on('import', () => $('import-file').click());
  $('import-file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 8000000) throw new Error('That file is too large. Choose a campaign JSON smaller than 8 MB.');
      const { campaign: next, notes } = L.readCampaign(await file.text());
      if (canReplace()) { replace(next); dirty = true; refresh(); status('Opened “' + next.title + '”. ' + notes.join(' ') + ' Save Campaign to add it to My Campaigns.'); }
    } catch (error) { status(error.message || 'Could not open that campaign.', true); }
    finally { event.target.value = ''; }
  };
  function showLibrary() {
    const list = L.library(); $('library-list').replaceChildren();
    if (!list.length) { const p = document.createElement('p'); p.textContent = 'No campaigns saved yet. Choose Save Campaign to add this one.'; $('library-list').append(p); }
    for (const camp of list) {
      const entry = document.createElement('div'), info = document.createElement('div'), title = document.createElement('strong'), sub = document.createElement('p'), actions = document.createElement('div');
      entry.className = 'library-entry'; title.textContent = camp.title; sub.textContent = C.MODES[camp.mode].name + ' · ' + camp.levels.length + ' level' + (camp.levels.length === 1 ? '' : 's'); info.append(title, sub); actions.className = 'button-row';
      const open = document.createElement('button'); open.textContent = 'Open'; open.setAttribute('aria-label', 'Open ' + camp.title); open.onclick = () => { if (canReplace()) { replace(camp); $('library-dialog').close(); status('Opened “' + camp.title + '”.'); } };
      const remove = document.createElement('button'); remove.textContent = 'Delete'; remove.setAttribute('aria-label', 'Delete ' + camp.title); remove.onclick = () => { if (confirm('Delete “' + camp.title + '” from My Campaigns? Export it first if you want to keep a file.')) { L.removeFromLibrary(camp.id); if (L.library().some(c => c.id === camp.id)) status('Could not delete from browser storage.', true); showLibrary(); } };
      actions.append(open, remove); entry.append(info, actions); $('library-list').append(entry);
    }
    if (!$('library-dialog').open) $('library-dialog').showModal();
  }
  on('open-library', showLibrary); on('close-library', () => $('library-dialog').close());
  on('test', () => {
    if (!level().items.length) return status('Add some pieces before test play.', true);
    if (!U.save('testplay', { campaign: L.normCampaign(campaign), level: levelIndex })) return status('Test play needs browser storage. Export your campaign and open it in the game.', true);
    stopPreview(); $('test-title').textContent = 'Test Play · ' + level().name; $('test-dialog').showModal(); $('test-frame').src = 'index.html?test=1'; $('test-frame').focus();
  });
  function closeTest() { $('test-dialog').close(); $('test-frame').removeAttribute('src'); $('test').focus(); }
  on('close-test', closeTest); $('test-dialog').addEventListener('cancel', event => { event.preventDefault(); closeTest(); });
  window.addEventListener('message', event => { if (event.source === $('test-frame').contentWindow && event.origin === location.origin && event.data && event.data.type === 'p3gl-test-done') closeTest(); });

  function cancelEstimate() { if (estimator) estimator.terminate(); estimator = null; $('estimate').disabled = false; $('cancel-estimate').hidden = true; }
  on('cancel-estimate', () => { cancelEstimate(); $('estimate-result').textContent = 'Estimate cancelled. Your board is unchanged.'; });
  on('estimate', () => {
    if (!level().items.length) return status('Add pieces before estimating difficulty.', true);
    cancelEstimate(); suggestedStars = null; $('apply-stars').hidden = true; estimateKey = JSON.stringify([campaign.mode, level()]);
    try { estimator = new Worker('js/editor/bot-worker.js'); } catch (error) { return status('The estimate needs the editor to be served over HTTP. Test Play is still available.', true); }
    $('estimate').disabled = true; $('cancel-estimate').hidden = false; $('estimate-result').textContent = 'Testing the board… You can keep editing; changes cancel the estimate.';
    estimator.onmessage = event => {
      const data = event.data;
      if (data.progress) { $('estimate-result').textContent = data.progress; return; }
      cancelEstimate(); if (estimateKey !== JSON.stringify([campaign.mode, level()])) return;
      if (data.error) { $('estimate-result').textContent = data.error; return; }
      const lines = data.results.map(r => r.skill[0].toUpperCase() + r.skill.slice(1) + ': ' + (r.won ? 'completed' : Math.round(r.progress * 100) + '% of goal') + ' in ' + r.shots + ' shots · ' + r.score.toLocaleString() + ' points' + (r.refills ? ' · ' + r.refills + ' Cozy refills' : ''));
      if (data.timedOut) lines.push('Time limit reached. Results are partial; test the board yourself.');
      else lines.push('One seeded run per skill. Real players may get different results.');
      suggestedStars = data.stars || null;
      if (suggestedStars) lines.push('Suggested two / three stars: ' + suggestedStars.map(n => n.toLocaleString()).join(' / '));
      else lines.push('No suggested stars yet. Try more balls, a wider plate, or a simpler goal.');
      $('estimate-result').textContent = lines.join('\n'); $('apply-stars').hidden = !suggestedStars;
    };
    estimator.onerror = () => { cancelEstimate(); $('estimate-result').textContent = 'The estimate could not run. Use Test Play to check the board.'; };
    estimator.postMessage({ level: L.normLevel(level(), campaign.mode, levelIndex), mode: campaign.mode });
  });
  on('apply-stars', () => { if (suggestedStars) { const stars = suggestedStars.slice(); commit(() => { level().stars = stars; }); status('Applied the suggested star scores.'); } });

  let initial = U.load('editor-draft', null);
  try {
    if (initial && initial.campaign) {
      replace(L.readCampaign(initial.campaign).campaign, initial.level || 0);
      dirty = !L.library().some(c => c.id === campaign.id && JSON.stringify(c) === JSON.stringify(campaign)); refresh();
    }
    else {
      const old = localStorage.getItem('pegLevelDesignerV2');
      if (old) { replace(L.readCampaign(JSON.parse(old)).campaign); status('Recovered the older editor’s draft and moved it onto the new board.'); }
      else replace(E.newCampaign());
    }
  } catch (error) { replace(E.newCampaign()); status('The saved draft could not be opened. Import a campaign JSON to recover a file.', true); }
  setTool('select'); requestAnimationFrame(frame);
  window.addEventListener('beforeunload', event => { if (!draftSaved && dirty) { event.preventDefault(); event.returnValue = ''; } });
  P.editor = { get campaign() { return campaign; }, get levelIndex() { return levelIndex; }, get selected() { return Array.from(selected); }, get previewTime() { return previewTime; } };
})();
