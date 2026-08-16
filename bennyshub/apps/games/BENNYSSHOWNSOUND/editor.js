// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND — Editor
//
// Data model is deliberately IDENTICAL to Matchy Match's card shape, so packs
// move between the two games unchanged:
//   { image, sound: [...], title, altTitle, ttsText }
// Everything wheel-specific lives under a sibling "shownsound" key.
//
// Assets are embedded as data: URIs rather than written as loose files. A
// browser cannot write into packs/<name>/, and a pack that hotlinks remote URLs
// breaks the moment Ben is offline — which is most of the time. Embedding makes
// a pack ONE self-contained file: email it, drop it in packs/, done. That is
// also what makes it shareable without any server.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// Imported art is downscaled to this before embedding. 512 is far more than the
// wheel needs (37-79px) and still crisp in the reveal, while keeping a 20-panel
// pack to a few MB rather than tens.
const MAX_IMPORT_PX = 512;

let pack = null;            // { name, categories: {}, config: {} }
let currentCategory = null;
let pendingTarget = null;   // { panelIndex, kind: 'image' | 'sound' }
const imgCache = new Map(); // data URI -> HTMLImageElement (for the preview)
let hasUnsavedChanges = false; // dirty since the last Save to Browser / Download Pack

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

function newPack(name) {
    return { name: name || 'my_pack', categories: {}, config: {} };
}

function init() {
    const saved = localStorage.getItem('shownsound_editor_wip');
    if (saved) {
        try { pack = JSON.parse(saved); } catch (e) { pack = newPack(); }
    } else {
        pack = newPack();
    }

    document.getElementById('pack-name').value = pack.name;
    document.getElementById('pack-name').addEventListener('change', (e) => {
        pack.name = sanitiseName(e.target.value) || 'my_pack';
        e.target.value = pack.name;
        autosave();
    });

    const sel = document.getElementById('palette-preset');
    sel.innerHTML = '<option value="">Custom…</option>'
        + Object.keys(PALETTES).map(k => `<option value="${k}">${k}</option>`).join('');

    document.getElementById('new-cat-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createCategory();
    });

    renderCategories();
    const first = Object.keys(pack.categories)[0];
    if (first) selectCategory(first);
    else renderPreview();

    refreshAiKeyStatus();
}

function sanitiseName(s) {
    return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function toast(msg, isErr) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = isErr ? 'err' : '';
    t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.style.display = 'none'; }, isErr ? 6000 : 3000);
}

/**
 * Crash-recovery only: silently mirrors the working pack so a reload doesn't
 * lose it. Not a substitute for Save to Browser / Download Pack — nothing
 * else reads this key, so it's not what makes a pack playable or shareable.
 */
function autosave() {
    hasUnsavedChanges = true;
    try {
        localStorage.setItem('shownsound_editor_wip', JSON.stringify(pack));
        document.getElementById('save-status').textContent =
            'Auto-draft saved (this browser only, not Play Test) · ' + new Date().toLocaleTimeString();
    } catch (e) {
        document.getElementById('save-status').textContent =
            'Auto-draft too large for browser storage — use Download Pack';
    }
}

/**
 * Nudge toward a REAL save (Save to Browser / Download Pack) — the auto-draft
 * above is crash-recovery only and easy to mistake for "it's saved". Fires on
 * a plain timer rather than per-edit, so it can't spam during a burst of
 * quick changes; only says anything if there's actually a pack with content
 * and it's been dirty since the last real save.
 */
setInterval(() => {
    if (hasUnsavedChanges && pack && Object.keys(pack.categories).some(k => pack.categories[k].length)) {
        toast("Don't forget to save — Save to Browser or Download Pack.");
    }
}, 3 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────

function cfgFor(cat) {
    if (!pack.config[cat]) {
        pack.config[cat] = { palette: PALETTES[DEFAULT_PALETTE].slice(), spinMs: SPIN.MS, fill: false };
    }
    const c = pack.config[cat];
    if (typeof c.palette === 'string') c.palette = (PALETTES[c.palette] || PALETTES[DEFAULT_PALETTE]).slice();
    if (!Array.isArray(c.palette) || c.palette.length < 2) c.palette = PALETTES[DEFAULT_PALETTE].slice();
    if (!(c.spinMs > 0)) c.spinMs = SPIN.MS;
    if (typeof c.fill !== 'boolean') c.fill = false;
    return c;
}

/**
 * Panel art mode, PER CATEGORY — saved in the pack itself (cfgFor(cat).fill,
 * exported as shownsound.categories[cat].fill), NOT a global browser setting.
 * Whether Fill mode looks right depends on whether this category's art was
 * actually framed for cropping, which is a per-pack authoring decision the
 * player shouldn't be able to override — there used to be a player-facing
 * "Panel Art" Settings toggle in the game for this; removed in favour of the
 * pack just dictating it.
 */
function getArtFill() {
    return currentCategory ? !!cfgFor(currentCategory).fill : false;
}
function setArtFill(on) {
    if (!currentCategory) return;
    cfgFor(currentCategory).fill = !!on;
    autosave();
}

function renderCategories() {
    const list = document.getElementById('category-list');
    const names = Object.keys(pack.categories);
    if (!names.length) {
        list.innerHTML = '<div class="muted" style="padding:12px;">No categories yet.</div>';
        return;
    }
    list.innerHTML = '';
    names.forEach(name => {
        const n = pack.categories[name].length;
        const div = document.createElement('div');
        div.className = 'category-item' + (name === currentCategory ? ' active' : '');
        div.innerHTML = `<span>${escapeHtml(name)}</span><span class="cat-count">${n}</span>`;
        div.onclick = () => selectCategory(name);

        // Drag to reorder — same pattern as the panel-card grid below.
        div.draggable = true;
        div.ondragstart = (e) => { e.dataTransfer.setData('text/plain', name); div.classList.add('dragging'); };
        div.ondragend = () => div.classList.remove('dragging');
        div.ondragover = (e) => { e.preventDefault(); div.classList.add('drag-over'); };
        div.ondragleave = () => div.classList.remove('drag-over');
        div.ondrop = (e) => {
            e.preventDefault(); div.classList.remove('drag-over');
            const from = e.dataTransfer.getData('text/plain');
            if (from && from !== name) reorderCategory(from, name);
        };

        list.appendChild(div);
    });
}

/** Move a category to sit right where another one was dropped. Category
 *  order has no separate index — it IS `pack.categories`' key order — so
 *  reordering means rebuilding the object with the keys in the new order. */
function reorderCategory(draggedName, targetName) {
    const keys = Object.keys(pack.categories);
    const from = keys.indexOf(draggedName), to = keys.indexOf(targetName);
    if (from < 0 || to < 0 || from === to) return;

    keys.splice(from, 1);
    keys.splice(to, 0, draggedName);
    const rebuilt = {};
    keys.forEach(k => { rebuilt[k] = pack.categories[k]; });
    pack.categories = rebuilt;

    renderCategories();
    autosave();
}

function createCategory() {
    const input = document.getElementById('new-cat-name');
    const name = input.value.trim();
    if (!name) return;
    if (pack.categories[name]) { toast('That category already exists', true); return; }
    pack.categories[name] = [];
    cfgFor(name);
    input.value = '';
    selectCategory(name);
    autosave();
}

function selectCategory(name) {
    currentCategory = name;
    document.getElementById('welcome').style.display = 'none';
    document.getElementById('editor-pane').style.display = 'block';
    document.getElementById('cat-title').value = name;

    const cfg = cfgFor(name);
    document.getElementById('spin-ms').value = cfg.spinMs;
    document.getElementById('spin-label').textContent = (cfg.spinMs / 1000).toFixed(1) + 's';

    // Reflect whether the palette matches a preset.
    const presetName = Object.keys(PALETTES).find(
        k => PALETTES[k].join() === cfg.palette.join());
    document.getElementById('palette-preset').value = presetName || '';

    syncPreviewMode(); // this category's own Fit/Fill, not whatever the last one had

    renderCategories();
    renderPanels();
    renderPalette();
    renderPreview();
}

/** The category title is an inline-editable field, not a button + prompt() —
 *  called on blur (click away) and Enter. Reverts the field rather than the
 *  data on an empty/duplicate/unchanged name. */
function renameCategoryTo(next) {
    next = next.trim();
    if (!currentCategory) return;
    if (!next || next === currentCategory) {
        document.getElementById('cat-title').value = currentCategory;
        return;
    }
    if (pack.categories[next]) {
        toast('That name is taken', true);
        document.getElementById('cat-title').value = currentCategory;
        return;
    }
    // Rebuild in order so the sidebar doesn't reshuffle.
    const cats = {}, cfgs = {};
    Object.keys(pack.categories).forEach(k => {
        const key = (k === currentCategory) ? next : k;
        cats[key] = pack.categories[k];
        cfgs[key] = pack.config[k];
    });
    pack.categories = cats;
    pack.config = cfgs;
    currentCategory = next;
    document.getElementById('cat-title').value = next;
    renderCategories();
    autosave();
}

function deleteCategory() {
    if (!currentCategory) return;
    if (!confirm(`Delete "${currentCategory}" and its ${pack.categories[currentCategory].length} panels?`)) return;

    pushUndo({
        type: 'category',
        name: currentCategory,
        index: Object.keys(pack.categories).indexOf(currentCategory),
        data: structuredClone(pack.categories[currentCategory]),
        configData: structuredClone(pack.config[currentCategory])
    });

    delete pack.categories[currentCategory];
    delete pack.config[currentCategory];
    currentCategory = null;
    document.getElementById('editor-pane').style.display = 'none';
    document.getElementById('welcome').style.display = 'block';
    renderCategories();
    renderPreview();
    autosave();
}

// ─────────────────────────────────────────────────────────────────────────────
// Undo — a plain `confirm()` before deleting a panel or category is not a
// recovery path. This is deliberately a single flat stack across both kinds
// of delete (not per-category), since "undo the last destructive thing I did"
// is the mental model a contributor actually has while editing.
// ─────────────────────────────────────────────────────────────────────────────

let editHistory = [];
const EDIT_HISTORY_MAX = 15;

function pushUndo(entry) {
    editHistory.push(entry);
    if (editHistory.length > EDIT_HISTORY_MAX) editHistory.shift();
    updateUndoButton();
}

function updateUndoButton() {
    const btn = document.getElementById('btn-undo-delete');
    if (btn) btn.style.display = editHistory.length ? '' : 'none';
}

function undoDelete() {
    const entry = editHistory.pop();
    updateUndoButton();
    if (!entry) return;

    if (entry.type === 'panel') {
        const arr = pack.categories[entry.category];
        if (!arr) { toast('That category no longer exists', true); return; }
        arr.splice(Math.min(entry.index, arr.length), 0, entry.data);
        if (currentCategory === entry.category) { renderPanels(); renderPreview(); }
        renderCategories();
        toast('Panel restored');
    } else if (entry.type === 'category') {
        if (pack.categories[entry.name]) { toast('A category with that name already exists', true); return; }
        // Reinsert at its original position in the key order, not just appended.
        const keys = Object.keys(pack.categories);
        keys.splice(Math.min(entry.index, keys.length), 0, entry.name);
        const rebuilt = {};
        keys.forEach(k => { rebuilt[k] = (k === entry.name) ? entry.data : pack.categories[k]; });
        pack.categories = rebuilt;
        pack.config[entry.name] = entry.configData;
        renderCategories();
        toast('Category restored');
    }
    autosave();
}

// ─────────────────────────────────────────────────────────────────────────────
// Panels
// ─────────────────────────────────────────────────────────────────────────────

function panels() { return currentCategory ? pack.categories[currentCategory] : []; }

function addPanel() {
    if (panels().length >= PANEL_MAX) {
        toast(`A wheel can hold at most ${PANEL_MAX} panels`, true);
        return;
    }
    panels().push({ image: '', emoji: '', art: null, sound: [], title: '', altTitle: '', ttsText: '' });
    renderPanels(); renderPreview(); renderCategories(); autosave();
}

function removePanel(i) {
    pushUndo({ type: 'panel', category: currentCategory, index: i, data: structuredClone(panels()[i]) });
    panels().splice(i, 1);
    renderPanels(); renderPreview(); renderCategories(); autosave();
}

function updatePanel(i, field, value) {
    panels()[i][field] = value;
    if (field === 'title') renderPreview();
    autosave();
}

function movePanel(from, to) {
    const arr = panels();
    if (to < 0 || to >= arr.length) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    renderPanels(); renderPreview(); autosave();
}

/** Clone a panel (same picture/sound/framing) right after itself — handy for
 *  "same character, different sound" variants without re-picking assets. */
function duplicatePanel(i) {
    const arr = panels();
    if (arr.length >= PANEL_MAX) {
        toast(`A wheel can hold at most ${PANEL_MAX} panels`, true);
        return;
    }
    arr.splice(i + 1, 0, structuredClone(arr[i]));
    renderPanels(); renderPreview(); renderCategories(); autosave();
    toast('Panel duplicated');
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk import — pick a whole batch of files at once (e.g. a folder's worth of
// character art + sound clips) and get one new panel per image, with any
// same-named sound file(s) attached automatically. Matching logic mirrors
// Matchy Match's autoMatchSounds(): filenames are normalized (lowercased,
// spaces -> underscores, anything else stripped) and matched exactly OR as
// the image's name plus a numeric suffix, so "Lion.wav", "lion_1.wav" and
// "lion2.wav" all attach to an image named "Lion.png".
// ─────────────────────────────────────────────────────────────────────────────

const BULK_SOUND_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'webm'];
const BULK_IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

function normalizeAssetName(name) {
    return name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function soundMatchesTitle(soundBase, safeTitle) {
    if (soundBase === safeTitle) return true;
    if (soundBase.startsWith(safeTitle)) {
        const suffix = soundBase.slice(safeTitle.length);
        return /^_?\d+$/.test(suffix); // "_1", "1", "_01" ...
    }
    return false;
}

function triggerBulkImport() {
    if (!currentCategory) return;
    document.getElementById('bulk-import-input').click();
}

async function handleBulkImport(input) {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length || !currentCategory) return;

    const extOf = (f) => f.name.split('.').pop().toLowerCase();
    const images = files.filter(f => BULK_IMAGE_EXT.includes(extOf(f)));
    const sounds = files.filter(f => BULK_SOUND_EXT.includes(extOf(f)));
    if (!images.length) { toast('No image files found in that selection', true); return; }

    const read = (file) => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error('Could not read ' + file.name));
        fr.readAsDataURL(file);
    });

    const room = PANEL_MAX - panels().length;
    if (room <= 0) { toast(`A wheel can hold at most ${PANEL_MAX} panels`, true); return; }
    const toImport = images.slice(0, room);
    if (toImport.length < images.length) {
        toast(`Only room for ${toImport.length} more panel${toImport.length === 1 ? '' : 's'} `
            + `— importing the first ${toImport.length} of ${images.length} images.`, true);
    }

    const usedSounds = new Set();
    let matchedCount = 0, failedCount = 0;

    for (const imgFile of toImport) {
        const baseName = imgFile.name.replace(/\.[^/.]+$/, '');
        const safeTitle = normalizeAssetName(baseName);
        const title = baseName.replace(/[_-]+/g, ' ').trim();
        const matches = sounds.filter(s =>
            soundMatchesTitle(normalizeAssetName(s.name.replace(/\.[^/.]+$/, '')), safeTitle));

        let imageUri;
        try {
            imageUri = await shrinkImage(await read(imgFile));
        } catch (e) {
            failedCount++;
            continue;
        }

        const soundUris = [];
        for (const s of matches) {
            try {
                soundUris.push(await read(s));
                usedSounds.add(s);
                matchedCount++;
            } catch (e) { /* skip an unreadable sound, keep the panel */ }
        }

        panels().push({ image: imageUri, emoji: '', art: null, sound: soundUris,
                         title, altTitle: '', ttsText: '' });
    }

    renderPanels(); renderPreview(); renderCategories(); autosave();

    const unmatched = sounds.length - usedSounds.size;
    let msg = `Added ${toImport.length - failedCount} panel${toImport.length - failedCount === 1 ? '' : 's'}`;
    if (matchedCount) msg += `, matched ${matchedCount} sound${matchedCount === 1 ? '' : 's'}`;
    if (unmatched > 0) msg += ` (${unmatched} sound file${unmatched === 1 ? '' : 's'} had no matching picture, left unused)`;
    if (failedCount) msg += ` — ${failedCount} image${failedCount === 1 ? '' : 's'} could not be read`;
    toast(msg, failedCount > 0);
}

function renderPanels() {
    const grid = document.getElementById('panel-grid');
    const arr = panels();
    const warn = document.getElementById('panel-warn');

    const notes = [];
    if (arr.length < PANEL_MIN) {
        notes.push(`A wheel needs at least ${PANEL_MIN} panels — this category will be skipped in the game.`);
    }
    if (arr.length > PANEL_WARN) {
        notes.push(`${arr.length} panels means each picture is only about `
            + Math.round(WheelGeom.imageSize(arr.length, WHEEL.R))
            + `px on the wheel. Above ${PANEL_WARN} it gets hard to see — the reveal still shows it big.`);
    }
    warn.innerHTML = notes.length ? `<div class="warn">${notes.join('<br>')}</div>` : '';

    grid.innerHTML = '';
    const cfg = cfgFor(currentCategory);

    arr.forEach((p, i) => {
        const colour = cfg.palette[WheelGeom.paletteIndex(i, arr.length, cfg.palette.length)];
        const card = document.createElement('div');
        card.className = 'panel-card';
        card.draggable = true;

        card.ondragstart = (e) => { e.dataTransfer.setData('text/plain', i); card.classList.add('dragging'); };
        card.ondragend = () => card.classList.remove('dragging');
        card.ondragover = (e) => { e.preventDefault(); card.classList.add('drag-over'); };
        card.ondragleave = () => card.classList.remove('drag-over');
        card.ondrop = (e) => {
            e.preventDefault(); card.classList.remove('drag-over');
            const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (!isNaN(from) && from !== i) movePanel(from, i);
        };

        const soundChips = (p.sound || []).map((s, si) =>
            `<span class="sound-chip"><span>${escapeHtml(soundLabel(s, si))}</span>
             <button title="Play" onclick="previewSound(${i},${si})">▶</button>
             <button title="Remove" onclick="removeSound(${i},${si})">✕</button></span>`).join('');

        card.innerHTML = `
            <div class="panel-swatch" style="background:${colour}"></div>
            <div class="row" style="justify-content:space-between;">
                <strong style="font-size:12px; color:#666;">Panel ${i + 1}</strong>
                <span>
                  <button class="btn" style="padding:1px 6px;" onclick="movePanel(${i},${i - 1})" title="Move left">◀</button>
                  <button class="btn" style="padding:1px 6px;" onclick="movePanel(${i},${i + 1})" title="Move right">▶</button>
                  <button class="btn" style="padding:1px 6px;" onclick="duplicatePanel(${i})" title="Duplicate">⧉</button>
                  <button class="btn btn-danger" style="padding:1px 7px;" onclick="removePanel(${i})" title="Delete">✕</button>
                </span>
            </div>
            <div class="panel-image" onclick="pickAsset(${i},'image')">
                ${p.emoji
                    ? `<span style="font-size:86px; line-height:1;">${escapeHtml(p.emoji)}</span>`
                    : panelSrc(p) ? `<img src="${panelSrc(p)}" alt="">`
                              : '<span>+ Add picture or emoji</span>'}
            </div>
            ${panelSrc(p) ? `<button class="btn" style="font-size:12px; width:100%;"
                    onclick="openPhotoEditor(${i})">✎ Edit Picture</button>` : ''}
            <input type="text" placeholder="Name (spoken + shown)" value="${escapeAttr(p.title)}"
                   oninput="updatePanel(${i},'title',this.value)">
            <div>
                <button class="btn" style="font-size:12px;" onclick="pickAsset(${i},'sound')">+ Add sound</button>
                <div>${soundChips || '<span class="muted">No sound — the name is spoken instead.</span>'}</div>
            </div>`;
        grid.appendChild(card);
    });

    // The contrast guard depends on the panel COUNT (how the palette cycles and
    // where it wraps), not just the colours, so it has to re-run whenever panels
    // are added or removed — not only when a swatch changes.
    checkContrast();
}

function soundLabel(src, i) {
    if (!src) return 'sound';
    if (src.startsWith('data:')) return 'recording ' + (i + 1);
    return src.split('/').pop().slice(0, 18);
}

function removeSound(pi, si) {
    panels()[pi].sound.splice(si, 1);
    if (panels()[pi]._snd) panels()[pi]._snd.splice(si, 1);
    renderPanels(); autosave();
}

function previewSound(pi, si) {
    const src = panelSnd(panels()[pi], si);
    if (!src) return;
    const a = new Audio(src);
    a.play().catch(() => toast('Could not play that sound', true));
}

// ─────────────────────────────────────────────────────────────────────────────
// Palette + preview
// ─────────────────────────────────────────────────────────────────────────────

function renderPalette() {
    const cfg = cfgFor(currentCategory);
    const box = document.getElementById('swatches');
    box.innerHTML = '';
    cfg.palette.forEach((c, i) => {
        const b = document.createElement('div');
        b.className = 'swatch';
        b.style.background = c;
        b.title = c + ' — click to change';
        b.onclick = () => {
            const input = document.createElement('input');
            input.type = 'color';
            input.value = c;
            input.oninput = () => {
                cfg.palette[i] = input.value;
                renderPalette(); renderPanels(); renderPreview(); autosave();
            };
            input.click();
        };
        if (cfg.palette.length > 2) {
            const x = document.createElement('div');
            x.className = 'x';
            x.textContent = '×';
            x.onclick = (e) => {
                e.stopPropagation();
                cfg.palette.splice(i, 1);
                document.getElementById('palette-preset').value = '';
                renderPalette(); renderPanels(); renderPreview(); autosave();
            };
            b.appendChild(x);
        }
        box.appendChild(b);
    });
    checkContrast();
}

function addSwatch() {
    const cfg = cfgFor(currentCategory);
    cfg.palette.push(document.getElementById('new-swatch').value);
    document.getElementById('palette-preset').value = '';
    renderPalette(); renderPanels(); renderPreview(); autosave();
}

function applyPalettePreset(name) {
    if (!name || !PALETTES[name]) return;
    cfgFor(currentCategory).palette = PALETTES[name].slice();
    renderPalette(); renderPanels(); renderPreview(); autosave();
}

function setSpinMs(v) {
    cfgFor(currentCategory).spinMs = parseInt(v, 10);
    document.getElementById('spin-label').textContent = (v / 1000).toFixed(1) + 's';
    autosave();
}

/**
 * Warn when neighbouring sectors are too close in luminance to tell apart.
 * A 2-colour palette on an odd panel count cannot avoid one adjacent repeat —
 * that is a property of the geometry, so we name it explicitly rather than
 * leaving the contributor to wonder why two wedges merged.
 */
function checkContrast() {
    const cfg = cfgFor(currentCategory);
    const n = panels().length;
    const el = document.getElementById('contrast-warn');
    const issues = [];

    if (n >= 2) {
        for (let i = 0; i < n; i++) {
            const a = cfg.palette[WheelGeom.paletteIndex(i, n, cfg.palette.length)];
            const b = cfg.palette[WheelGeom.paletteIndex((i + 1) % n, n, cfg.palette.length)];
            if (a === b) {
                issues.push(`Panels ${i + 1} and ${((i + 1) % n) + 1} share a colour`
                    + (cfg.palette.length === 2 && n % 2 === 1
                        ? ' — unavoidable with 2 colours and an odd panel count. Add a third.'
                        : '.'));
                break;
            }
            if (contrastRatio(a, b) < 1.25) {
                issues.push(`Panels ${i + 1} and ${((i + 1) % n) + 1} are very close in brightness.`);
                break;
            }
        }
    }
    el.innerHTML = issues.length
        ? `<div class="warn" style="margin:0; font-size:12px;">${issues.join('<br>')}</div>` : '';
}

function getImg(src) {
    if (!src) return null;
    if (imgCache.has(src)) return imgCache.get(src);
    const im = new Image();
    im.onload = () => renderPreview();
    im.onerror = () => { imgCache.set(src, null); };
    im.src = src;
    imgCache.set(src, im);
    return im;
}

/**
 * The preview calls the SAME WheelGeom functions the game uses — face drawing,
 * image sizing, anchors, palette cycling. If they ever disagree, contributors
 * stop trusting the preview, so there is no second implementation to drift.
 */
/**
 * The live wheel preview IS the position editor — there's no separate dialog.
 * `framePanel` (owned by editor-frame.js) is which wedge dragging/scrolling on
 * this canvas currently affects; ensureFramePanel keeps it valid as panels are
 * added, removed, or reordered.
 */
function renderPreview() {
    ensureFramePanel();
    drawWheelInto(document.getElementById('wheel-preview'), framePanel);
    syncFrameInputs();
}

function drawWheelInto(cv, highlight) {
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);

    const arr = panels();
    const note = document.getElementById('preview-note');
    const isMain = cv.id === 'wheel-preview';

    if (!currentCategory || arr.length < 1) {
        if (isMain && note) note.textContent = 'Add panels to see the wheel.';
        return;
    }

    const cfg = cfgFor(currentCategory);
    const n = arr.length;

    // Draw in the game's coordinate space, scaled to fit the preview canvas.
    const pad = WHEEL.RIM;
    const world = (WHEEL.R + pad) * 2;
    const scale = cv.width / world;

    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.scale(scale, scale);

    const fillMode = getArtFill();
    WheelGeom.drawFace(ctx, {
        n, R: WHEEL.R, palette: cfg.palette,
        rim: WHEEL.RIM, rimColor: '#ffd54a', rimInner: '#ff8fab', hubColor: '#2a2160',
        fill: fillMode,
        // `art: p.art` here is NOT optional — WheelGeom.drawFace reads the
        // framing off this nested `.art` (matching the shape the game's own
        // Wheel._artSources() produces: { src, art: {x,y,zoom} }). Omitting it,
        // as this used to, means drawCover() always falls back to its default
        // center/1x crop, so the Position dialog's drag and sliders updated the
        // panel's stored data correctly but the picture never visibly moved —
        // in the wheel preview AND in the framing dialog's own canvas, since
        // both call this same function.
        art: fillMode ? arr.map(p => {
            if (p.emoji) return { emoji: p.emoji, art: p.art };
            const im = panelSrc(p) ? getImg(panelSrc(p)) : null;
            return (im && im.complete && im.naturalWidth) ? { src: im, art: p.art } : null;
        }) : null
    });

    const size = WheelGeom.imageSize(n, WHEEL.R);
    if (!fillMode) arr.forEach((p, i) => {
        const a = WheelGeom.anchor(i, n, WHEEL.R);
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot);
        const im = panelSrc(p) ? getImg(panelSrc(p)) : null;
        if (p.emoji) {
            // Same ink-fitting helper the game uses, so the preview matches.
            drawEmojiInBox(ctx, p.emoji, 0, 0, size);
        } else if (im && im.complete && im.naturalWidth) {
            const longest = Math.max(im.naturalWidth, im.naturalHeight);
            const w = im.naturalWidth * (size / longest);
            const h = im.naturalHeight * (size / longest);
            ctx.drawImage(im, -w / 2, -h / 2, w, h);
        } else {
            const colour = cfg.palette[WheelGeom.paletteIndex(i, n, cfg.palette.length)];
            ctx.fillStyle = textOn(colour);
            ctx.font = 'bold ' + Math.max(11, Math.round(size * 0.3)) + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((p.title || (i + 1)).toString().slice(0, 8), 0, 0);
        }
        ctx.restore();
    });
    ctx.restore();

    // Pointer, drawn unrotated at 12 o'clock exactly as the game does.
    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2 - (WHEEL.R + pad) * scale);
    ctx.beginPath();
    ctx.moveTo(0, 12); ctx.lineTo(-13, -14); ctx.lineTo(13, -14);
    ctx.closePath();
    ctx.fillStyle = '#ffd54a'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#2b2450'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.restore();

    // Highlight the wedge being framed, so the modal shows which is which.
    if (highlight >= 0 && highlight < n) {
        const theta = WheelGeom.sectorAngle(n);
        ctx.save();
        ctx.translate(cv.width / 2, cv.height / 2);
        ctx.scale(scale, scale);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, WHEEL.R, highlight * theta, (highlight + 1) * theta, false);
        ctx.closePath();
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#00e5ff';
        ctx.stroke();
        ctx.restore();
    }

    if (isMain && note) {
        note.textContent = `${n} panel${n === 1 ? '' : 's'} · `
            + (getArtFill() ? 'fill mode' : `each picture ≈ ${Math.round(size)}px on screen`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset sourcing — all four paths land in the same place: a data: URI on the
// panel. Divergent handling per source is how this kind of editor rots.
// ─────────────────────────────────────────────────────────────────────────────

function pickAsset(panelIndex, kind) {
    pendingTarget = { panelIndex, kind };
    document.getElementById('selector-title').textContent =
        kind === 'image' ? 'Add a picture' : 'Add a sound';
    document.getElementById('btn-emoji').style.display = kind === 'image' ? '' : 'none';
    document.getElementById('btn-search-symbols').style.display = kind === 'image' ? '' : 'none';
    document.getElementById('btn-ai-art').style.display = kind === 'image' ? '' : 'none';
    document.getElementById('btn-search-sounds').style.display = kind === 'sound' ? '' : 'none';
    document.getElementById('btn-record').style.display = kind === 'sound' ? '' : 'none';
    document.getElementById('local-import-input').accept = kind === 'image' ? 'image/*' : 'audio/*';
    document.getElementById('selector-hint').textContent = kind === 'image'
        ? 'Pictures are shrunk to ' + MAX_IMPORT_PX + 'px and stored inside the pack file.'
        : 'Sounds are stored inside the pack file so it works offline.';
    document.getElementById('selector-list').innerHTML = '';
    openModal('selector-modal');
}

function applyAsset(dataUri) {
    if (!pendingTarget) return;
    const p = panels()[pendingTarget.panelIndex];
    if (!p) return;
    if (pendingTarget.kind === 'image') { p.image = dataUri; p._src = dataUri; p.emoji = ''; }
    else { (p.sound = p.sound || []).push(dataUri); (p._snd = p._snd || []).push(dataUri); }

    closeModal('selector-modal');
    closeModal('search-modal');
    closeModal('ai-modal');
    renderPanels(); renderPreview(); autosave();
    toast(pendingTarget.kind === 'image' ? 'Picture added' : 'Sound added');
    pendingTarget = null;
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// -----------------------------------------------------------------------------
// Media resolution
//
// A card's `image` may be a data: URI (editor-authored) or a BARE FILENAME like
// "carl.png" (Matchy Match style, resolved at play time against
// packs/<pack>/<category>/). The editor used to render the raw value, so a bare
// filename became <img src="carl.png"> relative to THIS folder, 404'd, and the
// panel fell back to its title -- exactly the "images don't populate" symptom.
//
// Each panel therefore keeps two things:
//   image  -- the ORIGINAL value, exported verbatim so packs round-trip
//   _src   -- a resolved URL, for display only
// Never export _src: a resolved '../BENNYSMATCHYMATCH/...' path would not
// survive the game's own resolver on the way back in.
// -----------------------------------------------------------------------------

function resolvePanelMedia(panel, basePath, categoryFolder) {
    const R = window.ShownSoundPacks;
    if (!R) { panel._src = panel.image; panel._snd = (panel.sound || []).slice(); return; }
    panel._src = panel.image ? R.resolveAsset(panel.image, basePath, categoryFolder) : '';
    panel._snd = (panel.sound || []).map(x => R.resolveAsset(x, basePath, categoryFolder));
}

/** What to display for this panel: the resolved URL when we have one. */
function panelSrc(p) { return p._src || p.image || ''; }
function panelSnd(p, i) { return (p._snd && p._snd[i]) || (p.sound && p.sound[i]) || ''; }

/**
 * Every pack path the game would see, tagged with where it came from:
 * - 'manifest': listed in assetManifest.json (a real project file — removing
 *   one of these means editing that file, not a browser action)
 * - 'registry': added automatically by Save to Browser, into
 *   localStorage['shownsound_local_registry'] — invisible outside the
 *   browser, and the usual source of a stale "pack gives an error" entry
 *   after a pack gets renamed/moved/deleted on disk. Forgettable from here.
 */
async function listInstalledPacks() {
    const out = [];
    try {
        const r = await fetch('assetManifest.json');
        if (r.ok) {
            const d = await r.json();
            if (d && Array.isArray(d.packs)) d.packs.forEach(p => out.push({ path: p, source: 'manifest' }));
        }
    } catch (e) { /* no manifest is fine */ }
    try {
        JSON.parse(localStorage.getItem(LS_REGISTRY) || '[]')
            .forEach(p => { if (!out.some(x => x.path === p)) out.push({ path: p, source: 'registry' }); });
    } catch (e) { /* ignore a corrupt registry */ }
    return out;
}

async function openInstalledPack() {
    const entries = await listInstalledPacks();
    const box = document.getElementById('packs-list');
    if (!entries.length) {
        box.innerHTML = '<div class="warn" style="margin:0;">No packs listed in '
            + '<code>assetManifest.json</code>.</div>';
        openModal('packs-modal');
        return;
    }
    box.innerHTML = '';
    entries.forEach(({ path: f, source }) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px;'
            + 'border:1px solid #ddd; border-radius:6px; margin-bottom:8px;';
        const title = window.ShownSoundPacks ? ShownSoundPacks.packTitle(f) : f;
        row.innerHTML = '<div style="flex:1; min-width:0;">'
            + '<div style="font-weight:bold;">' + escapeHtml(title) + '</div>'
            + '<div class="muted" style="overflow:hidden; text-overflow:ellipsis;">'
            + escapeHtml(f) + (source === 'registry' ? ' · saved in this browser' : '') + '</div></div>';
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = 'Open';
        btn.onclick = () => loadInstalledPack(f);
        row.appendChild(btn);
        if (source === 'registry') {
            const forget = document.createElement('button');
            forget.className = 'btn btn-danger';
            forget.textContent = '✕ Forget';
            forget.title = "Remove this from this browser's list (doesn't delete any file)";
            forget.onclick = () => forgetInstalledPack(f);
            row.appendChild(forget);
        }
        box.appendChild(row);
    });
    openModal('packs-modal');
}

/** Drop a browser-registry entry (and its cached copy) — the "how do I clear
 *  a broken installed pack" button. Never touches assetManifest.json or any
 *  file on disk; only what this browser remembered from past Save to Browser
 *  clicks. */
function forgetInstalledPack(pathToForget) {
    try {
        const reg = JSON.parse(localStorage.getItem(LS_REGISTRY) || '[]').filter(p => p !== pathToForget);
        localStorage.setItem(LS_REGISTRY, JSON.stringify(reg));
    } catch (e) { /* ignore */ }
    try { localStorage.removeItem(LS_PACK + pathToForget); } catch (e) { /* ignore */ }
    toast('Removed from the list');
    openInstalledPack();
}

async function loadInstalledPack(file) {
    try {
        let data = null;
        try {
            const cached = localStorage.getItem(LS_PACK + file);
            if (cached) data = JSON.parse(cached);
        } catch (e) { /* fall through to the network */ }
        if (!data) {
            const r = await fetch(file);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            data = await r.json();
        }
        if (!data.categories) throw new Error('That pack has no "categories".');

        const R = window.ShownSoundPacks;
        const base = R ? R.packBasePath(file) : 'packs/';
        const name = sanitiseName(file.split('/').pop().replace(/\.json$/i, '')) || 'pack';
        adoptPack(data, name, (cat) => (R ? R.categoryToFolderName(cat) : ''), base);

        closeModal('packs-modal');
        toast('Opened ' + file);
    } catch (e) {
        toast('Could not open that pack: ' + e.message, true);
    }
}

/** Adopt a parsed pack into the editor, resolving media for display. */
function adoptPack(data, name, folderFor, basePath) {
    pack = newPack(name);
    editHistory = [];
    updateUndoButton();
    hasUnsavedChanges = false;
    Object.entries(data.categories).forEach(([cat, cards]) => {
        const folder = folderFor ? folderFor(cat) : '';
        pack.categories[cat] = (cards || []).map(c => {
            const panel = {
                image: c.image || '',
                emoji: c.emoji || '',
                art: (c.art && typeof c.art === 'object') ? c.art : null,
                sound: Array.isArray(c.sound) ? c.sound.slice() : (c.sound ? [c.sound] : []),
                title: c.title || '',
                altTitle: c.altTitle || '',
                ttsText: c.ttsText || ''
            };
            resolvePanelMedia(panel, basePath, folder);
            return panel;
        });
        const ss = data.shownsound && data.shownsound.categories
            && data.shownsound.categories[cat];
        pack.config[cat] = {
            palette: ss && Array.isArray(ss.palette)
                ? ss.palette.slice()
                : (ss && typeof ss.palette === 'string' && PALETTES[ss.palette]
                    ? PALETTES[ss.palette].slice()
                    : PALETTES[DEFAULT_PALETTE].slice()),
            spinMs: (ss && ss.spinMs > 0) ? ss.spinMs : SPIN.MS,
            fill: !!(ss && ss.fill)
        };
    });

    document.getElementById('pack-name').value = pack.name;
    currentCategory = null;
    imgCache.clear();
    renderCategories();
    const first = Object.keys(pack.categories)[0];
    if (first) selectCategory(first);
    autosave();
    reportMissingArt();
}

/**
 * Say so when artwork cannot be found, rather than silently showing title text
 * and leaving the contributor to guess why their pictures vanished.
 */
function reportMissingArt() {
    const all = [];
    Object.values(pack.categories).forEach(list => list.forEach(p => {
        if (p.image && !p.emoji) all.push(p);
    }));
    if (!all.length) return;
    let checked = 0, missing = 0;
    const done = () => {
        if (checked === all.length && missing) {
            toast(missing + ' of ' + all.length + ' pictures could not be loaded. If this '
                + 'pack lives in another folder, use "Open Installed Pack" instead.', true);
        }
    };
    all.forEach(p => {
        const im = new Image();
        im.onload  = () => { checked++; done(); };
        im.onerror = () => { missing++; checked++; done(); };
        im.src = panelSrc(p);
    });
}

// ── 1. Local upload ──────────────────────────────────────────────────────────

function triggerLocalImport() { document.getElementById('local-import-input').click(); }

function handleLocalImport(input) {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    const kind = pendingTarget ? pendingTarget.kind : 'image';

    const read = (file) => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error('Could not read ' + file.name));
        fr.readAsDataURL(file);
    });

    (async () => {
        try {
            if (kind === 'image') {
                applyAsset(await shrinkImage(await read(files[0])));
            } else {
                // Multiple sound files at once become variants of this panel.
                const p = panels()[pendingTarget.panelIndex];
                for (const f of files) (p.sound = p.sound || []).push(await read(f));
                closeModal('selector-modal');
                renderPanels(); autosave();
                toast(files.length + ' sound' + (files.length === 1 ? '' : 's') + ' added');
                pendingTarget = null;
            }
        } catch (e) {
            toast(e.message, true);
        }
    })();
}

/** Downscale + re-encode so a 4000px phone photo doesn't bloat the pack. */
function shrinkImage(dataUri) {
    return new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => {
            const longest = Math.max(im.naturalWidth, im.naturalHeight);
            if (longest <= MAX_IMPORT_PX) { resolve(dataUri); return; }
            const s = MAX_IMPORT_PX / longest;
            const cv = document.createElement('canvas');
            cv.width = Math.round(im.naturalWidth * s);
            cv.height = Math.round(im.naturalHeight * s);
            const ctx = cv.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(im, 0, 0, cv.width, cv.height);
            resolve(cv.toDataURL('image/png'));
        };
        im.onerror = () => reject(new Error('That file is not an image we can read'));
        im.src = dataUri;
    });
}

/**
 * Pull a remote asset into the pack as bytes.
 *
 * Non-negotiable: Open Symbols and Freesound both hand back URLs, and a pack
 * full of hotlinks is a pack that breaks the moment Ben is offline. We fetch
 * directly where CORS allows, and fall back to the hub's server-side image
 * proxy where it does not.
 */
async function fetchAsDataURI(url) {
    const toDataUri = (blob) => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error('Could not decode the downloaded file'));
        fr.readAsDataURL(blob);
    });

    try {
        const r = await fetch(url, { mode: 'cors' });
        if (r.ok) return await toDataUri(await r.blob());
    } catch (e) { /* fall through to the proxy */ }

    try {
        const r = await fetch('/api/imgproxy?url=' + encodeURIComponent(url));
        if (r.ok) return await toDataUri(await r.blob());
    } catch (e) { /* fall through to the error below */ }

    throw new Error('Could not download that file. Launch this editor from Benny\'s Hub '
        + 'so it can fetch on your behalf, or save the file and use Upload File.');
}

// ── 2/3. Open Symbols and Freesound ──────────────────────────────────────────
// Endpoints and proxy routing copied from BENNYSMATCHYMATCH/editor_new.js so
// both editors keep working off the same hub plumbing.

let searchMode = 'symbol';

function apiUrl(service, path) {
    const isLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    if (isLocal) return `/api/proxy/${service}/${path}`;
    const base = {
        opensymbols: 'https://www.opensymbols.org/api/v1',
        'freesound-proxy': 'https://aged-thunder-a674.narbehousellc.workers.dev'
    };
    return `${base[service]}/${path}`;
}

function openSymbolSearch() {
    searchMode = 'symbol';
    document.getElementById('search-modal-title').textContent = 'Search Open Symbols';
    document.getElementById('symbol-search-input').placeholder = "e.g. 'cat'";
    document.getElementById('symbol-search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    openModal('search-modal');
    document.getElementById('symbol-search-input').focus();
}

function openSoundSearch() {
    searchMode = 'sound';
    document.getElementById('search-modal-title').textContent = 'Search Freesound';
    document.getElementById('symbol-search-input').placeholder = "e.g. 'dog bark'";
    document.getElementById('symbol-search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    openModal('search-modal');
    document.getElementById('symbol-search-input').focus();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement
        && document.activeElement.id === 'symbol-search-input') performSearch();
});

function performSearch() {
    if (searchMode === 'symbol') searchSymbols();
    else searchSounds();
}

/**
 * fetch() + JSON, with a diagnosis instead of a cryptic parse error.
 *
 * Every search here goes through /api/proxy/<service>/... on the assumption
 * that whatever is hosting this page also runs that proxy (editor_server.py,
 * or the hub's own server) — that's what lets a browser call Open Symbols /
 * Freesound at all without hitting CORS. Opening editor.html directly (double
 * clicking the file, or serving it from a plain static server with no proxy
 * route) means that path 404s with an HTML error page instead of JSON, and
 * `res.json()` on that used to fail with an opaque "Unexpected token '<' ...
 * is not valid JSON" — technically correct, useless to act on. This gives the
 * actual cause instead.
 */
async function fetchJson(url) {
    let res;
    try {
        res = await fetch(url);
    } catch (e) {
        throw new Error('Could not reach the search API. Launch this editor from '
            + "Benny's Hub (or via editor_server.py) rather than opening editor.html "
            + 'directly — that is what lets it bypass CORS.');
    }
    const raw = await res.text();
    const looksLikeHtml = /^\s*<(!doctype|html)/i.test(raw);
    if (!res.ok || looksLikeHtml) {
        if (looksLikeHtml) {
            throw new Error(`Got a web page instead of search results (HTTP ${res.status}). `
                + 'This editor needs to be opened through a server that proxies the search '
                + "APIs — launch it from Benny's Hub, or run editor_server.py, rather than "
                + 'opening editor.html directly.');
        }
        throw new Error(`Search API returned HTTP ${res.status}.`);
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        throw new Error('Search API returned something that was not valid JSON.');
    }
}

async function searchSymbols() {
    const q = document.getElementById('symbol-search-input').value.trim();
    if (!q) return;
    const box = document.getElementById('search-results');
    box.className = 'asset-grid';
    box.innerHTML = '<div class="muted" style="padding:18px;">Searching…</div>';
    try {
        const data = await fetchJson(apiUrl('opensymbols', 'symbols/search?q=' + encodeURIComponent(q)));
        if (!Array.isArray(data) || !data.length) {
            box.innerHTML = '<div class="muted" style="padding:18px;">No results.</div>';
            return;
        }
        box.innerHTML = '';
        data.forEach(item => {
            const d = document.createElement('div');
            d.className = 'asset-item';
            d.innerHTML = `<img src="${item.image_url}" alt=""><div>${escapeHtml(item.name || '')}</div>`;
            d.onclick = async () => {
                d.style.opacity = .5;
                try {
                    applyAsset(await shrinkImage(await fetchAsDataURI(item.image_url)));
                } catch (err) { toast(err.message, true); d.style.opacity = 1; }
            };
            box.appendChild(d);
        });
    } catch (e) {
        box.innerHTML = `<div class="err">Search failed. ${escapeHtml(e.message)}</div>`;
    }
}

async function searchSounds() {
    const q = document.getElementById('symbol-search-input').value.trim();
    if (!q) return;
    const box = document.getElementById('search-results');
    box.className = '';
    box.innerHTML = '<div class="muted" style="padding:18px;">Searching Freesound…</div>';

    const params = new URLSearchParams({
        query: q, q, page_size: '15',
        fields: 'id,name,duration,previews', _: Date.now()
    });
    const url = apiUrl('freesound-proxy', 'api/search') + '?' + params.toString();

    try {
        const data = await fetchJson(url);
        const results = data.results || [];
        if (!results.length) {
            box.innerHTML = '<div class="muted" style="padding:18px;">No sounds found.</div>';
            return;
        }
        box.innerHTML = '';
        results.forEach(item => {
            const preview = item.previews &&
                (item.previews['preview-hq-mp3'] || item.previews['preview-lq-mp3']);
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:9px;'
                + 'border:1px solid #ddd; border-radius:5px; margin-bottom:7px;';
            row.innerHTML = `
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:bold; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.name)}</div>
                    <div class="muted">${Math.round(item.duration)}s</div>
                </div>`;
            const play = document.createElement('button');
            play.className = 'btn'; play.textContent = '▶';
            play.onclick = () => { if (preview) new Audio(preview).play().catch(() => {}); };
            const use = document.createElement('button');
            use.className = 'btn btn-primary'; use.textContent = 'Use';
            use.onclick = async () => {
                if (!preview) { toast('No preview available for that sound', true); return; }
                use.textContent = '…';
                try { applyAsset(await fetchAsDataURI(preview)); }
                catch (err) { toast(err.message, true); use.textContent = 'Use'; }
            };
            row.appendChild(play); row.appendChild(use);
            box.appendChild(row);
        });
    } catch (e) {
        // Freesound also routes through a Cloudflare worker that can be down on
        // its own; fetchJson() already distinguishes "no proxy server" from a
        // plain non-2xx response, so e.message carries the real cause here.
        box.innerHTML = `<div class="err">${escapeHtml(e.message)} `
            + `You can still upload a file or record instead.</div>`;
    }
}

// ── 4. Microphone recording ──────────────────────────────────────────────────
//
// Records, then decodes the take into an AudioBuffer so it can be trimmed —
// dragging the cursor + Set In/Set Out, same idea as Matchy Match's audio
// editor. Deliberately does NOT always re-encode to WAV the way Matchy Match
// does: packs here embed audio as data URIs directly, so re-encoding an
// UNTRIMMED recording would only bloat it (WAV vs the recorder's own
// compressed webm/opus output) for no benefit. Trimming only happens, and
// only re-encodes, when the contributor actually moved the in/out points.

let mediaRecorder = null, recChunks = [], recStream = null, recDataUri = null;
let recAnalyser = null, recRAF = null;
let recAudioCtx = null, recBuffer = null, recStart = 0, recEnd = 0, recCursor = 0;
let recDragging = false, recPlaySource = null, recPlayRAF = null;

function openRecorder() { openModal('recorder-modal'); resetRecorderUI(); }

function resetRecorderUI() {
    document.getElementById('btn-rec-start').style.display = '';
    document.getElementById('btn-rec-stop').style.display = 'none';
    document.getElementById('btn-rec-play').style.display = 'none';
    document.getElementById('btn-rec-use').style.display = 'none';
    document.getElementById('rec-trim-controls').style.display = 'none';
    document.getElementById('rec-status').textContent = '';
    stopRecPlayback();
    recDataUri = null;
    recBuffer = null;
    recStart = recEnd = recCursor = 0;
    const cv = document.getElementById('rec-waveform');
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
}

async function startRecording() {
    try {
        recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        toast('Microphone permission denied or no microphone found', true);
        return;
    }
    stopRecPlayback();
    recBuffer = null;
    document.getElementById('rec-trim-controls').style.display = 'none';
    recChunks = [];
    mediaRecorder = new MediaRecorder(recStream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
        const blob = new Blob(recChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        if (recStream) recStream.getTracks().forEach(t => t.stop());
        cancelAnimationFrame(recRAF);

        const fr = new FileReader();
        fr.onload = () => { recDataUri = fr.result; };
        fr.readAsDataURL(blob);

        document.getElementById('btn-rec-play').style.display = '';
        document.getElementById('btn-rec-use').style.display = '';

        try {
            if (!recAudioCtx) recAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            recBuffer = await recAudioCtx.decodeAudioData(await blob.arrayBuffer());
            recStart = 0; recEnd = recBuffer.duration; recCursor = 0;
            document.getElementById('rec-start').value = 0;
            document.getElementById('rec-end').value = recBuffer.duration.toFixed(2);
            document.getElementById('rec-trim-controls').style.display = '';
            document.getElementById('rec-status').textContent = 'Ready — trim if you like, then Use';
            drawRecTrimWaveform();
        } catch (e) {
            // Rare, but if decoding fails the raw recording is still usable —
            // just without a trim UI for it.
            recBuffer = null;
            document.getElementById('rec-status').textContent = 'Ready (trim unavailable for this recording)';
        }
    };
    mediaRecorder.start();

    document.getElementById('btn-rec-start').style.display = 'none';
    document.getElementById('btn-rec-stop').style.display = '';
    document.getElementById('rec-status').textContent = 'Recording…';
    drawRecWaveform();
}

/** Live level meter while actually recording. */
function drawRecWaveform() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(recStream);
    recAnalyser = ctx.createAnalyser();
    recAnalyser.fftSize = 2048;
    src.connect(recAnalyser);
    const buf = new Uint8Array(recAnalyser.frequencyBinCount);
    const cv = document.getElementById('rec-waveform');
    const c = cv.getContext('2d');

    const tick = () => {
        recAnalyser.getByteTimeDomainData(buf);
        c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
        c.lineWidth = 2; c.strokeStyle = '#6ee7a0'; c.beginPath();
        const step = cv.width / buf.length;
        for (let i = 0; i < buf.length; i++) {
            const y = (buf[i] / 128) * (cv.height / 2);
            i ? c.lineTo(i * step, y) : c.moveTo(0, y);
        }
        c.stroke();
        recRAF = requestAnimationFrame(tick);
    };
    tick();
}

/** Static waveform + trim overlay, shown once recording has stopped. */
function drawRecTrimWaveform() {
    const cv = document.getElementById('rec-waveform');
    const c = cv.getContext('2d');
    const w = cv.width, h = cv.height;

    if (!recBuffer) { c.clearRect(0, 0, w, h); return; }
    const data = recBuffer.getChannelData(0);
    const duration = recBuffer.duration;
    const step = Math.max(1, Math.ceil(data.length / w));
    const amp = h / 2;

    c.fillStyle = '#222'; c.fillRect(0, 0, w, h);
    c.beginPath(); c.strokeStyle = '#6ee7a0'; c.lineWidth = 1;
    for (let i = 0; i < w; i++) {
        let min = 1, max = -1;
        for (let j = 0; j < step; j++) {
            const d = data[i * step + j];
            if (d === undefined) break;
            if (d < min) min = d;
            if (d > max) max = d;
        }
        c.moveTo(i, (1 + min) * amp);
        c.lineTo(i, (1 + max) * amp);
    }
    c.stroke();

    const startX = (recStart / duration) * w, endX = (recEnd / duration) * w;
    c.fillStyle = 'rgba(0,0,0,0.65)';
    c.fillRect(0, 0, startX, h);
    c.fillRect(endX, 0, w - endX, h);
    c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(startX, 0); c.lineTo(startX, h);
    c.moveTo(endX, 0); c.lineTo(endX, h);
    c.stroke();

    const cursorX = (recCursor / duration) * w;
    c.strokeStyle = '#ff5566'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cursorX, 0); c.lineTo(cursorX, h); c.stroke();
}

function recCursorFromEvent(e) {
    if (!recBuffer) return;
    const cv = document.getElementById('rec-waveform');
    const rect = cv.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (cv.width / rect.width);
    recCursor = Math.max(0, Math.min(recBuffer.duration, (x / cv.width) * recBuffer.duration));
    drawRecTrimWaveform();
}

function setRecIn() {
    if (!recBuffer) return;
    let start = recCursor, end = recEnd;
    if (start >= end) { end = recBuffer.duration; }
    if (start >= end) start = 0;
    recStart = start; recEnd = end;
    document.getElementById('rec-start').value = recStart.toFixed(2);
    document.getElementById('rec-end').value = recEnd.toFixed(2);
    drawRecTrimWaveform();
}

function setRecOut() {
    if (!recBuffer) return;
    let end = recCursor, start = recStart;
    if (end <= start) start = 0;
    recStart = start; recEnd = end;
    document.getElementById('rec-start').value = recStart.toFixed(2);
    document.getElementById('rec-end').value = recEnd.toFixed(2);
    drawRecTrimWaveform();
}

function setRecBounds() {
    if (!recBuffer) return;
    const start = parseFloat(document.getElementById('rec-start').value) || 0;
    const end = parseFloat(document.getElementById('rec-end').value) || recBuffer.duration;
    recStart = Math.max(0, Math.min(start, recBuffer.duration));
    recEnd = Math.max(recStart, Math.min(end, recBuffer.duration));
    drawRecTrimWaveform();
}

(function initRecWaveformDrag() {
    document.addEventListener('DOMContentLoaded', () => {
        const cv = document.getElementById('rec-waveform');
        if (!cv) return;
        cv.addEventListener('mousedown', (e) => { if (recBuffer) { recDragging = true; recCursorFromEvent(e); } });
        window.addEventListener('mousemove', (e) => { if (recDragging) recCursorFromEvent(e); });
        window.addEventListener('mouseup', () => { recDragging = false; });
    });
})();

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    document.getElementById('btn-rec-stop').style.display = 'none';
    document.getElementById('btn-rec-start').style.display = '';
    document.getElementById('rec-status').textContent = 'Processing…';
}

function stopRecPlayback() {
    if (recPlaySource) { try { recPlaySource.stop(); } catch (e) {} recPlaySource = null; }
    if (recPlayRAF) cancelAnimationFrame(recPlayRAF);
    const btn = document.getElementById('btn-rec-play');
    if (btn) btn.textContent = '▶ Play';
}

function playRecording() {
    if (recPlaySource) { stopRecPlayback(); return; } // toggle: tap again to stop

    if (!recBuffer) {
        if (recDataUri) new Audio(recDataUri).play().catch(() => {});
        return;
    }

    const start = (recCursor >= recStart && recCursor < recEnd) ? recCursor : recStart;
    const dur = recEnd - start;
    if (dur <= 0) return;

    recPlaySource = recAudioCtx.createBufferSource();
    recPlaySource.buffer = recBuffer;
    recPlaySource.connect(recAudioCtx.destination);
    recPlaySource.start(0, start, dur);
    document.getElementById('btn-rec-play').textContent = '■ Stop';

    const playedFrom = recAudioCtx.currentTime;
    const tick = () => {
        recCursor = start + (recAudioCtx.currentTime - playedFrom);
        if (recCursor >= recEnd) { recCursor = recEnd; drawRecTrimWaveform(); stopRecPlayback(); return; }
        drawRecTrimWaveform();
        recPlayRAF = requestAnimationFrame(tick);
    };
    recPlayRAF = requestAnimationFrame(tick);
    recPlaySource.onended = () => { recPlaySource = null; };
}

async function useRecording() {
    if (!recDataUri && !recBuffer) return;
    const trimmed = recBuffer && (recStart > 0.005 || recEnd < recBuffer.duration - 0.005);
    const dataUri = trimmed ? await trimBufferToDataUri(recBuffer, recStart, recEnd) : recDataUri;
    closeRecorder();
    applyAsset(dataUri);
}

/** Slice an AudioBuffer to [start,end] and encode as a WAV data: URI. */
function trimBufferToDataUri(buffer, start, end) {
    const sampleRate = buffer.sampleRate;
    const frameCount = Math.max(1, Math.floor((end - start) * sampleRate));
    const startOffset = Math.floor(start * sampleRate);
    const out = recAudioCtx.createBuffer(buffer.numberOfChannels, frameCount, sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const src = buffer.getChannelData(ch), dst = out.getChannelData(ch);
        for (let i = 0; i < frameCount; i++) dst[i] = src[startOffset + i] || 0;
    }
    const blob = bufferToWave(out, frameCount);
    return new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.readAsDataURL(blob);
    });
}

/** AudioBuffer -> 16-bit PCM WAV Blob. */
function bufferToWave(abuffer, len) {
    const numOfChan = abuffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let pos = 0;

    const setUint16 = (d) => { view.setUint16(pos, d, true); pos += 2; };
    const setUint32 = (d) => { view.setUint32(pos, d, true); pos += 4; };

    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157);                         // "WAVE"
    setUint32(0x20746d66);                         // "fmt "
    setUint32(16);
    setUint16(1);                                  // PCM
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164);                         // "data"
    setUint32(length - pos - 4);

    for (let i = 0; i < numOfChan; i++) channels.push(abuffer.getChannelData(i));

    let offset = 0;
    while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }
    return new Blob([buffer], { type: 'audio/wav' });
}

function closeRecorder() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (recStream) recStream.getTracks().forEach(t => t.stop());
    cancelAnimationFrame(recRAF);
    stopRecPlayback();
    closeModal('recorder-modal');
}

// ── 5. AI art ────────────────────────────────────────────────────────────────

let aiResultUri = null;

function openAiArt() {
    if (!ShownSoundAI.hasKey()) {
        toast('Add an API key in AI Art Settings first', true);
        openAiSettings();
        return;
    }
    aiResultUri = null;
    document.getElementById('ai-prompt').value =
        (panels()[pendingTarget ? pendingTarget.panelIndex : 0] || {}).title || '';
    document.getElementById('ai-status').textContent = '';
    document.getElementById('ai-result').innerHTML = '';
    document.getElementById('btn-ai-use').style.display = 'none';
    openModal('ai-modal');
}

async function generateAiArt() {
    const prompt = document.getElementById('ai-prompt').value.trim();
    if (!prompt) { toast('Type what you want a picture of', true); return; }

    const cost = ShownSoundAI.approxCost();
    if (!confirm(`Generate one image with ${ShownSoundAI.label()}?\n\n`
        + `This is billed to YOUR API key — roughly $${cost.toFixed(2)}.`)) return;

    const status = document.getElementById('ai-status');
    status.textContent = 'Generating… this usually takes 10–30 seconds.';
    document.getElementById('ai-result').innerHTML = '';
    document.getElementById('btn-ai-use').style.display = 'none';

    try {
        const raw = await ShownSoundAI.generate(prompt);
        aiResultUri = await shrinkImage(raw);
        document.getElementById('ai-result').innerHTML =
            `<img src="${aiResultUri}" style="max-width:100%; max-height:300px; border:1px solid #ccc; border-radius:6px;">`;
        document.getElementById('btn-ai-use').style.display = '';
        const n = (parseInt(sessionStorage.getItem('ss_ai_count') || '0', 10) + 1);
        sessionStorage.setItem('ss_ai_count', n);
        status.textContent = `Done. ${n} image${n === 1 ? '' : 's'} generated this session `
            + `(≈ $${(n * cost).toFixed(2)}).`;
    } catch (e) {
        status.innerHTML = `<span style="color:#b02a2a;">${escapeHtml(e.message)}</span>`;
    }
}

function useAiArt() { if (aiResultUri) applyAsset(aiResultUri); }

function openAiSettings() {
    const p = ShownSoundAI.getProvider();
    document.getElementById('ai-provider').value = p;
    document.getElementById('ai-key').value = '';
    refreshAiKeyStatus();
    openModal('ai-settings-modal');
}

function saveAiSettings() {
    const provider = document.getElementById('ai-provider').value;
    const key = document.getElementById('ai-key').value.trim();
    ShownSoundAI.setProvider(provider);
    if (key) {
        const guess = ShownSoundAI.detectProvider(key);
        if (guess && guess !== provider) {
            if (!confirm(`That key looks like a ${ShownSoundAI.label(guess)} key, but `
                + `${ShownSoundAI.label(provider)} is selected. Save anyway?`)) return;
        }
        if (key.startsWith('sk-ant-')) {
            toast('Anthropic keys cannot generate images — use Google or OpenAI', true);
            return;
        }
        ShownSoundAI.setKey(provider, key);
        document.getElementById('ai-key').value = '';
    }
    refreshAiKeyStatus();
    toast('AI settings saved');
}

function clearAiKey() {
    ShownSoundAI.clearKey(document.getElementById('ai-provider').value);
    refreshAiKeyStatus();
    toast('Key cleared');
}

function refreshAiKeyStatus() {
    const el = document.getElementById('ai-key-status');
    if (!el) return;
    const p = document.getElementById('ai-provider')
        ? document.getElementById('ai-provider').value : ShownSoundAI.getProvider();
    el.textContent = ShownSoundAI.hasKey(p)
        ? `✓ A key is saved for ${ShownSoundAI.label(p)} in this browser.`
        : `No key saved for ${ShownSoundAI.label(p)}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Save / load / share
// ─────────────────────────────────────────────────────────────────────────────

/** The on-disk shape. `categories` stays Matchy-Match-compatible. */
function buildPackJson() {
    const out = { categories: {}, shownsound: { version: 1, categories: {} } };
    Object.entries(pack.categories).forEach(([name, list]) => {
        out.categories[name] = list.map(p => ({
            image: p.image || '',
            emoji: p.emoji || '',
            art: p.art || null,
            sound: (p.sound || []).slice(),
            title: p.title || '',
            altTitle: p.altTitle || '',
            ttsText: p.ttsText || ''
        }));
        const c = cfgFor(name);
        out.shownsound.categories[name] = { palette: c.palette.slice(), spinMs: c.spinMs, fill: !!c.fill };
    });
    return out;
}

function packPath() {
    const n = sanitiseName(pack.name) || 'my_pack';
    return `packs/${n}/${n}.json`;
}

/**
 * Save into the browser so index.html can play it immediately — packs.js checks
 * localStorage before the network, and registers the path in the local registry.
 */
function saveToBrowser() {
    const json = JSON.stringify(buildPackJson());
    const path = packPath();
    try {
        localStorage.setItem(LS_PACK + path, json);
        let reg = [];
        try { reg = JSON.parse(localStorage.getItem(LS_REGISTRY) || '[]'); } catch (e) { reg = []; }
        if (!reg.includes(path)) reg.push(path);
        localStorage.setItem(LS_REGISTRY, JSON.stringify(reg));
        autosave();
        hasUnsavedChanges = false;
        toast('Saved — click Play Test to try it');
    } catch (e) {
        toast('Too big for browser storage (' + Math.round(json.length / 1048576)
            + 'MB). Use Download Pack instead.', true);
    }
}

/**
 * One self-contained file. Every picture and sound is embedded, so sharing a
 * pack is sending a single .json — no folder, no zip, no server. Drop it at
 * packs/<name>/<name>.json and add that path to assetManifest.json.
 */
function downloadPack() {
    const name = sanitiseName(pack.name) || 'my_pack';
    const blob = new Blob([JSON.stringify(buildPackJson(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    hasUnsavedChanges = false;
    toast(`Downloaded ${name}.json — put it in packs/${name}/ and add it to assetManifest.json`);
}

function importPack() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
        const f = input.files[0];
        if (!f) return;
        const fr = new FileReader();
        fr.onload = () => {
            try {
                const data = JSON.parse(fr.result);
                if (!data.categories) throw new Error('That file has no "categories".');
                const name = sanitiseName(f.name.replace(/\.json$/i, '')) || 'my_pack';

                // A file picker hands us the JSON but not where it lives, so bare
                // filenames can only be guessed at. Assume the Matchy Match
                // layout -- packs/<packname>/<categoryfolder>/ -- which is right
                // for a pack sitting in this game's own packs/ folder.
                // reportMissingArt() speaks up when the guess is wrong.
                const R = window.ShownSoundPacks;
                adoptPack(data, name,
                          (cat) => (R ? R.categoryToFolderName(cat) : ''),
                          'packs/' + name + '/');

                toast('Imported ' + Object.keys(pack.categories).length + ' categories');
            } catch (e) {
                toast('Could not import: ' + e.message, true);
            }
        };
        fr.readAsText(f);
    };
    input.click();
}

function resetEditor() {
    if (!confirm('Clear the editor and start a new pack? Download first if you want to keep this one.')) return;
    localStorage.removeItem('shownsound_editor_wip');
    pack = newPack();
    currentCategory = null;
    imgCache.clear();
    editHistory = [];
    updateUndoButton();
    hasUnsavedChanges = false;
    document.getElementById('pack-name').value = pack.name;
    document.getElementById('editor-pane').style.display = 'none';
    document.getElementById('welcome').style.display = 'block';
    renderCategories();
    renderPreview();
}

// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

document.addEventListener('DOMContentLoaded', init);
