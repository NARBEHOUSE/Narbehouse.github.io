/**
 * NARBE Switch Stories - this game's own settings.
 *
 * Access settings (Text to Speech for the menus, Voice, Auto Scan, Scan
 * Speed) belong to the shared hub managers. This file never copies them; it
 * only stores what is this game's own, under its own localStorage key.
 */

window.NSS = window.NSS || {};

NSS.Settings = (function () {
    'use strict';

    const KEY = 'nss-settings-v1';
    const C = NSS.CONFIG;
    const LISTED = Object.keys(C.settings);

    /** The same list NARBE Animal Friends, Magic Button and Glow Pop offer. */
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
         * hold: every press counts in the story, and holding Enter opens Pause.
         * scan: the highlight moves between the page and Pause, for a player
         *       who cannot hold a switch long enough to pause.
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
        // Older profiles may still have the removed recorded-voice option.
        delete settings.narration;
        // A saved choice that no longer exists in CONFIG falls back to the default.
        LISTED.forEach(function (key) {
            if (!C.settings[key][settings[key]]) settings[key] = DEFAULTS[key];
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
            if (raw) settings = Object.assign({}, DEFAULTS, JSON.parse(raw));
        } catch (e) {
            console.warn('[NSS] Could not read settings:', e);
            settings = Object.assign({}, DEFAULTS);
        }
        clamp();
    }

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
    }

    load();

    function option(key) { return C.settings[key][settings[key]]; }

    return {
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
        /** Move one of this game's listed settings on to its next choice. */
        next: function (key) {
            const keys = Object.keys(C.settings[key]);
            settings[key] = keys[(keys.indexOf(settings[key]) + 1) % keys.length];
            save();
            return settings[key];
        },
        option: option,
        label: function (key) { return option(key).label; },
        is: function (key, value) { return settings[key] === value; },
        cvi: function () { return settings.look === 'cvi'; },
        // Keep the saved accessibility preference without resizing Picture Book.
        characterScale: function () { return settings.look === 'cvi' ? option('characterSize').scale : 1; },
        volume: function () { return VOLUMES[settings.volumeIndex].level; },
        volumeName: function () { return VOLUMES[settings.volumeIndex].name; },
        highlightColor: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].color; },
        highlightInk: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].ink; },
        highlightColorName: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].name; }
    };
})();
