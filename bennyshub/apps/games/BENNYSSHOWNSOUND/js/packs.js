// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND — Pack loading
//
// Ported from BENNYSMATCHYMATCH/script.js (manifest load, fetchPackData,
// categoryToFolderName, asset path resolution). The card shape is deliberately
// IDENTICAL to Matchy Match's, so a Matchy Match pack folder can be copied into
// packs/ and played here with no conversion:
//
//   { "image": "cow.png", "sound": ["moo.mp3", "moo2.mp3"],
//     "title": "Cow", "altTitle": "", "ttsText": "" }
//
// Anything ShownSound-specific lives under a sibling "shownsound" key, which
// Matchy Match ignores. See TECHNICAL_PLAN.md section 4.
// ═══════════════════════════════════════════════════════════════════════════════

window.ShownSoundPacks = (function () {
    'use strict';

    let packFiles = [];      // ['packs/animals/animals.json', ...]
    let categories = [];     // normalised, ready for the wheel
    let loadErrors = [];

    // ─────────────────────────────────────────────────────────────────────────
    // Path resolution — ported verbatim in behaviour from Matchy Match.
    // Assets live at packs/<packname>/<categoryfolder>/<filename>.
    // ─────────────────────────────────────────────────────────────────────────

    // Category name -> folder name. The special mappings are Ben's existing
    // pack folders; without them the adult_cartoons pack does not resolve.
    const FOLDER_MAPPINGS = {
        'The Simpsons': 'simpsons',
        'Aqua Teen Hunger Force': 'athf',
        'Family Guy': 'familyguy',
        'South Park': 'southpark',
        'Futurama': 'futurama',
        'Jen Hamilton': 'jenhamilton'
    };

    function categoryToFolderName(catName) {
        if (!catName || catName === 'Unassigned') return '';
        if (FOLDER_MAPPINGS[catName]) return FOLDER_MAPPINGS[catName];
        return catName.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // 'packs/adult_cartoons/adult_cartoons.json' -> 'packs/adult_cartoons/'
    // 'packs/animals.json' (legacy, flat) -> 'packs/'
    function packBasePath(filename) {
        if (!filename) return 'packs/';
        const parts = filename.split('/');
        return parts.length >= 3 ? parts.slice(0, -1).join('/') + '/' : 'packs/';
    }

    // 'packs/adult_cartoons/adult_cartoons.json' -> 'Adult Cartoons'
    function packTitle(filename) {
        if (!filename) return 'Pack';
        const base = filename.split('/').pop().replace(/\.json$/i, '');
        return base.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Turn a filename stored in a card into a usable URL.
     * Absolute (http/data) and already-rooted (packs/, assets/) paths pass
     * through untouched; bare filenames get the pack + category folder prefix.
     * A locally-imported asset in localStorage wins over everything.
     */
    function resolveAsset(file, basePath, categoryFolder) {
        if (!file) return '';

        // Locally imported assets (data URIs saved by the editor) win.
        let fileName = file.split('/').pop().split('?')[0];
        try { fileName = decodeURIComponent(fileName); } catch (e) { /* keep raw */ }
        try {
            const local = localStorage.getItem(LS_ASSET + fileName);
            if (local) return local;
        } catch (e) { /* localStorage may be unavailable */ }

        if (file.startsWith('http') || file.startsWith('data:')) return file;
        if (file.startsWith('packs/') || file.startsWith('assets/')) return file;

        const folder = categoryFolder ? categoryFolder + '/' : '';
        return basePath + folder + file;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Loading
    // ─────────────────────────────────────────────────────────────────────────

    async function fetchPackData(filename) {
        // A pack saved in the browser by the editor takes priority over disk,
        // so an unsaved edit is still playable.
        try {
            const cached = localStorage.getItem(LS_PACK + filename);
            if (cached) return JSON.parse(cached);
        } catch (e) { /* fall through to network */ }

        try {
            const res = await fetch(filename);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (e) {
            loadErrors.push(filename + ': ' + e.message);
            console.warn('[ShownSound] Failed to load pack', filename, e);
            return null;
        }
    }

    /** Normalise one raw card into a panel the wheel can consume directly. */
    function toPanel(card, basePath, categoryFolder) {
        const rawSounds = Array.isArray(card.sound)
            ? card.sound
            : (card.sound ? [card.sound] : []);

        return {
            title:    card.title || '',
            altTitle: card.altTitle || '',
            // Spoken on landing when no sound file is present, or when
            // speak-on-land is enabled. Falls back through altTitle to title.
            ttsText:  card.ttsText || card.altTitle || card.title || '',
            // An emoji panel needs no artwork at all — it wins over `image`
            // when both are set. Matchy Match ignores this field, so packs
            // still move between the two games.
            emoji:    (card.emoji || '').trim(),
            // Per-panel framing for fill mode: which part of the picture should
            // sit in the middle of the wedge, and how far to zoom in.
            art:      (card.art && typeof card.art === 'object')
                        ? { x: +card.art.x || 0.5, y: +card.art.y || 0.5,
                            zoom: +card.art.zoom || 1 }
                        : null,
            image:    resolveAsset(card.image, basePath, categoryFolder),
            sounds:   rawSounds.map(s => resolveAsset(s, basePath, categoryFolder)),
            hasImage: !!card.image
        };
    }

    /**
     * Read assetManifest.json plus the browser-side registry, load every pack,
     * and flatten to a list of playable categories.
     */
    async function load() {
        packFiles = [];
        categories = [];
        loadErrors = [];

        // 1. Disk manifest
        try {
            const res = await fetch('assetManifest.json');
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.packs)) packFiles = data.packs.slice();
            }
        } catch (e) {
            console.warn('[ShownSound] No assetManifest.json found', e);
        }

        // 2. Browser registry (written by the editor's Update Game Registry)
        try {
            const local = JSON.parse(localStorage.getItem(LS_REGISTRY) || '[]');
            const seen = new Set(packFiles.map(p => p.split('/').pop().toLowerCase()));
            local.forEach(p => {
                const base = p.split('/').pop().toLowerCase();
                if (!seen.has(base)) { packFiles.push(p); seen.add(base); }
            });
        } catch (e) { /* ignore a corrupt registry */ }

        // 3. Load each pack and flatten its categories
        for (const file of packFiles) {
            const data = await fetchPackData(file);
            if (!data || !data.categories) continue;

            const base = packBasePath(file);
            const title = packTitle(file);
            const ssConfig = (data.shownsound && data.shownsound.categories) || {};

            for (const [catName, cards] of Object.entries(data.categories)) {
                if (!Array.isArray(cards) || cards.length < PANEL_MIN) continue;

                const folder = categoryToFolderName(catName);
                const cfg = ssConfig[catName] || {};

                categories.push({
                    key:      file + '::' + catName,
                    name:     catName,
                    packFile: file,
                    packTitle: title,
                    panels:   cards.map(c => toPanel(c, base, folder)),
                    palette:  resolvePalette(cfg.palette),
                    spinMs:   Number(cfg.spinMs) > 0 ? Number(cfg.spinMs) : SPIN.MS,
                    fill:     !!cfg.fill
                });
            }
        }

        categories.sort((a, b) => a.name.localeCompare(b.name));
        return categories;
    }

    /**
     * A category's palette is either an explicit list of css colours saved by
     * the editor, the name of a preset, or nothing (use the default preset).
     */
    function resolvePalette(p) {
        if (Array.isArray(p) && p.length >= 2) return p.slice();
        if (typeof p === 'string' && PALETTES[p]) return PALETTES[p].slice();
        return PALETTES[DEFAULT_PALETTE].slice();
    }

    /**
     * The panels to actually put on the wheel for one visit.
     * Categories larger than PANEL_MAX are randomly sampled, so a big category
     * stays legible and varies between plays instead of being unplayable.
     */
    function panelsForPlay(category) {
        const all = category.panels;
        if (all.length <= PANEL_MAX) return all.slice();
        return shuffled(all).slice(0, PANEL_MAX);
    }

    return {
        load,
        getCategories: () => categories,
        getPackFiles: () => packFiles.slice(),
        getErrors: () => loadErrors.slice(),
        panelsForPlay,
        resolvePalette,
        // Exported for the editor, which must resolve paths identically.
        categoryToFolderName,
        packBasePath,
        packTitle,
        resolveAsset
    };
})();
