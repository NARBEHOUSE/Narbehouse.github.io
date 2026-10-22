/**
 * NARBE Glow Pop - this game's own settings.
 *
 * Access settings (Text to Speech, Voice, Auto Scan, Scan Speed) belong to the
 * shared hub managers. This file never copies them; it only stores what is
 * this game's own, under its own localStorage key.
 */

window.NGP = window.NGP || {};

NGP.Settings = (function () {
    'use strict';

    const KEY = 'ngp-settings-v1';
    /** The first, single-page version of Glow Pop saved under this key. */
    const OLD_KEY = 'glow-pop-settings-v1';
    const C = NGP.CONFIG;

    /** Which CONFIG list each look-and-play setting uses. */
    const LISTS = {
        shape: 'shapes', size: 'sizes', color: 'colors', background: 'backgrounds', outline: 'outlines',
        position: 'positions', comesBack: 'comesBack', tapStyle: 'tapStyles', waitTime: 'waitTimes',
        reactions: 'reactions', popShape: 'popShapes', selectionRing: 'selectionRings'
    };

    /** The same list NARBE Animal Friends and Magic Button offer. */
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
        { name: 'Medium', level: 0.7 },
        { name: 'Loud', level: 1 }
    ];

    const DEFAULTS = Object.assign({}, C.defaults, {
        /**
         * hold: every press pops, and holding Enter opens Pause.
         * scan: the highlight moves between Pop and Pause, for a player who
         *       cannot hold a switch long enough to pause.
         */
        pauseMode: 'hold',
        sound: true,
        volumeIndex: 1,
        highlightColorIndex: 0,
        highlightStyle: 'outline'   // outline | full
    });

    let settings = Object.assign({}, DEFAULTS);

    function wrapIndex(v, len) {
        v = v | 0;
        return v >= 0 && v < len ? v : 0;
    }

    function clamp() {
        // A saved choice that no longer exists in CONFIG falls back to the default.
        Object.keys(LISTS).forEach(function (key) {
            if (!C[LISTS[key]][settings[key]]) settings[key] = DEFAULTS[key];
        });
        if (settings.pauseMode !== 'scan') settings.pauseMode = 'hold';
        if (settings.highlightStyle !== 'full') settings.highlightStyle = 'outline';
        settings.sound = settings.sound !== false;
        settings.volumeIndex = wrapIndex(settings.volumeIndex, VOLUMES.length);
        settings.highlightColorIndex = wrapIndex(settings.highlightColorIndex, HIGHLIGHT_COLORS.length);
    }

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) {
                settings = Object.assign({}, DEFAULTS, JSON.parse(raw));
            } else {
                // Carry over what was chosen in the first version, once.
                const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
                if (old) {
                    Object.keys(LISTS).forEach(function (key) { if (typeof old[key] === 'string') settings[key] = old[key]; });
                    if (old.sound === 'off') settings.sound = false;
                    if (typeof old.volume === 'number') {
                        settings.volumeIndex = old.volume < 0.5 ? 0 : old.volume < 0.85 ? 1 : 2;
                    }
                }
            }
        } catch (e) {
            console.warn('[NGP] Could not read settings:', e);
            settings = Object.assign({}, DEFAULTS);
        }
        clamp();
    }

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
    }

    load();

    function option(key) { return C[LISTS[key]][settings[key]]; }

    return {
        LISTS: LISTS,
        HIGHLIGHT_COLORS: HIGHLIGHT_COLORS,
        VOLUMES: VOLUMES,
        get: function (key) { return settings[key]; },
        set: function (key, value) { settings[key] = value; clamp(); save(); },
        toggle: function (key) { settings[key] = !settings[key]; clamp(); save(); return settings[key]; },
        cycle: function (key, length) {
            settings[key] = ((settings[key] | 0) + 1) % length;
            save();
            return settings[key];
        },
        /** Move a look-and-play setting on to the next option in its CONFIG list. */
        next: function (key) {
            const keys = Object.keys(C[LISTS[key]]);
            settings[key] = keys[(keys.indexOf(settings[key]) + 1) % keys.length];
            save();
            return settings[key];
        },
        option: option,
        label: function (key) { return option(key).label; },
        volume: function () { return VOLUMES[settings.volumeIndex].level; },
        volumeName: function () { return VOLUMES[settings.volumeIndex].name; },
        highlightColor: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].color; },
        highlightInk: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].ink; },
        highlightColorName: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].name; }
    };
})();
