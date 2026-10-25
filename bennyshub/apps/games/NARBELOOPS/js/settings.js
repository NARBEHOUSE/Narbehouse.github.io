/**
 * NARBE Loops - this game's own settings.
 *
 * Access settings (Text to Speech, Voice, Auto Scan, Scan Speed) belong to the
 * shared hub managers. This file never copies them; it only stores what is
 * this game's own, under its own localStorage key.
 */

window.NL = window.NL || {};

NL.Settings = (function () {
    'use strict';

    const KEY = 'nl-settings-v1';

    /** Same list as Magic Button and Animal Friends: colour, then a ring of its own ink. */
    const HIGHLIGHT_COLORS = [
        { name: 'Gold', color: '#ffd700', ink: '#1a1008' },
        { name: 'Cyan', color: '#00e5ff', ink: '#1a1008' },
        { name: 'Blue', color: '#0040dd', ink: '#ffffff' },
        { name: 'Lime', color: '#00ff00', ink: '#1a1008' },
        { name: 'Red', color: '#d32f2f', ink: '#ffffff' },
        { name: 'Violet', color: '#6a1b9a', ink: '#ffffff' },
        { name: 'Pink', color: '#c2185b', ink: '#ffffff' },
        { name: 'White', color: '#ffffff', ink: '#1a1008' }
    ];

    const VOLUMES = [
        { name: 'Quiet', level: 0.35 },
        { name: 'Medium', level: 0.65 },
        { name: 'Loud', level: 1 }
    ];

    const DEFAULTS = {
        look: 'studio',               // studio | contrast
        sound: true,
        volumeIndex: 1,
        highlightColorIndex: 0,
        highlightStyle: 'outline'     // outline | full
    };

    let settings = Object.assign({}, DEFAULTS);

    function wrapIndex(v, len) { v = v | 0; return v >= 0 && v < len ? v : 0; }

    function clamp() {
        if (settings.look !== 'contrast') settings.look = 'studio';
        settings.sound = settings.sound !== false;
        if (settings.highlightStyle !== 'full') settings.highlightStyle = 'outline';
        settings.volumeIndex = wrapIndex(settings.volumeIndex, VOLUMES.length);
        settings.highlightColorIndex = wrapIndex(settings.highlightColorIndex, HIGHLIGHT_COLORS.length);
    }

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) settings = Object.assign({}, DEFAULTS, JSON.parse(raw));
        } catch (e) {
            console.warn('[NL] Could not read settings:', e);
            settings = Object.assign({}, DEFAULTS);
        }
        clamp();
    }

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
    }

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
        highlightColorName: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].name; }
    };
})();
