/**
 * NARBE Build n Bash - this game's own settings and progress.
 *
 * Access settings (Text to Speech, Voice, Auto Scan, Scan Speed, Graphics)
 * belong to the shared hub managers; this file never copies them. It stores
 * only what is this game's own, under its own localStorage keys.
 */

window.BNB = window.BNB || {};

BNB.Settings = (function () {
    'use strict';

    const KEY = 'bnb-settings-v1';
    const PROGRESS_KEY = 'bnb-progress-v1';

    /** The same highlight list the other NARBE games offer (colour + an ink ring outside it). */
    const HIGHLIGHT_COLORS = [
        { name: 'Gold', color: '#ffd700', ink: '#1a1008' },
        { name: 'Cyan', color: '#00e5ff', ink: '#1a1008' },
        { name: 'Blue', color: '#0040dd', ink: '#ffffff' },
        { name: 'Lime', color: '#00ff00', ink: '#1a1008' },
        { name: 'Red', color: '#d32f2f', ink: '#ffffff' },
        { name: 'Violet', color: '#6a1b9a', ink: '#ffffff' },
        { name: 'Pink', color: '#c2185b', ink: '#ffffff' },
        { name: 'White', color: '#ffffff', ink: '#1a1008' },
        { name: 'Black', color: '#000000', ink: '#ffffff' }
    ];

    const VOLUMES = [
        { name: 'Quiet', level: 0.35 },
        { name: 'Medium', level: 0.65 },
        { name: 'Loud', level: 1 }
    ];

    const DEFAULTS = {
        /** Hold Enter on Build for 3 seconds and it keeps building, one block a second (a press still builds one). */
        holdBuild: true,
        /** Big builds come down in chunks (about one Destroy press per 15 blocks), or all at once. */
        chunked: true,
        /** Say notable pieces as they land ("Door", "Roof"). */
        pieceNames: true,
        /** A soft glowing outline shows where the next block will go while Build is highlighted. */
        hint: true,
        /** full: camera shake and every effect. calm: no shake, gentler camera, fewer particles. */
        motion: 'full',
        sound: true,
        volumeIndex: 1,
        highlightColorIndex: 0,
        highlightStyle: 'outline'   // outline | full
    };

    let settings = Object.assign({}, DEFAULTS);
    let progress = { built: {}, bashed: 0 };

    function wrapIndex(v, len) { v = v | 0; return v >= 0 && v < len ? v : 0; }

    function clamp() {
        settings.holdBuild = settings.holdBuild !== false;
        settings.chunked = settings.chunked !== false;
        settings.pieceNames = settings.pieceNames !== false;
        settings.hint = settings.hint !== false;
        if (settings.motion !== 'calm') settings.motion = 'full';
        settings.sound = settings.sound !== false;
        settings.volumeIndex = wrapIndex(settings.volumeIndex, VOLUMES.length);
        settings.highlightColorIndex = wrapIndex(settings.highlightColorIndex, HIGHLIGHT_COLORS.length);
        if (settings.highlightStyle !== 'full') settings.highlightStyle = 'outline';
    }

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) settings = Object.assign({}, DEFAULTS, JSON.parse(raw));
        } catch (e) { settings = Object.assign({}, DEFAULTS); }
        try {
            const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
            if (p && typeof p === 'object') progress = { built: Object.assign({}, p.built || {}), bashed: p.bashed | 0 };
        } catch (e) { /* keep empty progress */ }
        clamp();
    }

    function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ } }
    function saveProgress() { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) { /* storage unavailable */ } }

    load();

    return {
        HIGHLIGHT_COLORS: HIGHLIGHT_COLORS,
        VOLUMES: VOLUMES,
        get: function (key) { return settings[key]; },
        set: function (key, value) { settings[key] = value; clamp(); save(); },
        toggle: function (key) { settings[key] = !settings[key]; clamp(); save(); return settings[key]; },
        cycle: function (key, length) { settings[key] = ((settings[key] | 0) + 1) % length; save(); return settings[key]; },
        volume: function () { return VOLUMES[settings.volumeIndex].level; },
        volumeName: function () { return VOLUMES[settings.volumeIndex].name; },
        highlightColor: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].color; },
        highlightInk: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].ink; },
        highlightColorName: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].name; },

        // --- progress: which builds have been finished, and how many knocked down ---
        timesBuilt: function (id) { return progress.built[id] | 0; },
        markBuilt: function (id) { progress.built[id] = (progress.built[id] | 0) + 1; saveProgress(); },
        markBashed: function () { progress.bashed = (progress.bashed | 0) + 1; saveProgress(); },
        builtCount: function () { return Object.keys(progress.built).filter(k => progress.built[k] > 0).length; },
        resetProgress: function () { progress = { built: {}, bashed: 0 }; saveProgress(); }
    };
})();
