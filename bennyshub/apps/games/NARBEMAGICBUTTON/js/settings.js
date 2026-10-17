/**
 * NARBE Magic Button - this game's own settings.
 *
 * Access settings (Text to Speech, Voice, Auto Scan, Scan Speed) belong to the
 * shared hub managers. This file never copies them; it only stores what is
 * this game's own, under its own localStorage key.
 */

window.NMB = window.NMB || {};

NMB.Settings = (function () {
    'use strict';

    const KEY = 'nmb-settings-v1';
    /** The first version of this game (Press Party) saved under this key. */
    const OLD_KEY = 'press-party-settings-v1';

    const MODES = ['fireworks', 'bubbles', 'flowers'];
    const WORD_MAX = 10;
    /**
     * Settings this game no longer has, cleared out of older saves. There is
     * no sky flash at all now, so nobody sensitive to flashing light has to
     * remember to turn it off, and every firework kind always takes a turn.
     */
    const RETIRED = ['skyFlash', 'fireworkSet'];

    /**
     * The same list NARBE Animal Friends offers. Every highlight is drawn as
     * colour, then a ring of its own ink outside it, so even Black on a dark
     * card or White on a pale sky still has an edge you can see.
     */
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

    /**
     * Colours for the Simple High Contrast look: one bright colour for
     * everything, on plain black, so the player has one strong thing to find.
     */
    const SIMPLE_COLORS = [
        { name: 'Yellow', color: '#ffe600' },
        { name: 'Red', color: '#ff2b2b' },
        { name: 'Green', color: '#2bff5e' },
        { name: 'Blue', color: '#3d8bff' },
        { name: 'White', color: '#ffffff' },
        { name: 'Pink', color: '#ff4fd8' }
    ];

    const VOLUMES = [
        { name: 'Quiet', level: 0.35 },
        { name: 'Medium', level: 0.65 },
        { name: 'Loud', level: 1 }
    ];

    const DEFAULTS = {
        mode: 'fireworks',
        /**
         * hold: every press makes magic, and holding Enter opens Pause.
         * scan: the highlight moves between Magic and Pause, for a player who
         *       cannot hold a switch long enough to pause.
         */
        pauseMode: 'hold',
        /**
         * regular: the full scenes. simple: Simple High Contrast for players
         * with CVI - plain black, one big bold shape per press in one colour.
         * Only the game screens change; the menus look the same either way.
         */
        look: 'regular',
        simpleColorIndex: 0,
        /** A name, word or age spelled in fireworks every few launches. '' = off. */
        skyWord: '',
        sound: true,
        volumeIndex: 1,
        highlightColorIndex: 0,
        highlightStyle: 'outline'   // outline | full
    };

    let settings = Object.assign({}, DEFAULTS);

    function wrapIndex(v, len) {
        v = v | 0;
        return v >= 0 && v < len ? v : 0;
    }

    function clamp() {
        if (MODES.indexOf(settings.mode) === -1) settings.mode = DEFAULTS.mode;
        if (settings.pauseMode !== 'scan') settings.pauseMode = 'hold';
        if (settings.highlightStyle !== 'full') settings.highlightStyle = 'outline';
        if (settings.look !== 'simple') settings.look = 'regular';
        settings.simpleColorIndex = wrapIndex(settings.simpleColorIndex, SIMPLE_COLORS.length);
        RETIRED.forEach(function (key) { delete settings[key]; });
        settings.skyWord = String(settings.skyWord || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/^ +/, '').slice(0, WORD_MAX);
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
                // Carry over what was chosen in Press Party, once.
                const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
                if (old) {
                    if (MODES.indexOf(old.mode) >= 0) settings.mode = old.mode;
                    if (typeof old.sound === 'boolean') settings.sound = old.sound;
                    if (typeof old.volume === 'number') {
                        settings.volumeIndex = old.volume < 0.5 ? 0 : old.volume < 0.85 ? 1 : 2;
                    }
                }
            }
        } catch (e) {
            console.warn('[NMB] Could not read settings:', e);
            settings = Object.assign({}, DEFAULTS);
        }
        clamp();
    }

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
    }

    load();

    return {
        MODES: MODES,
        WORD_MAX: WORD_MAX,
        HIGHLIGHT_COLORS: HIGHLIGHT_COLORS,
        SIMPLE_COLORS: SIMPLE_COLORS,
        VOLUMES: VOLUMES,
        simpleColor: function () { return SIMPLE_COLORS[settings.simpleColorIndex].color; },
        simpleColorName: function () { return SIMPLE_COLORS[settings.simpleColorIndex].name; },
        get: function (key) { return settings[key]; },
        set: function (key, value) { settings[key] = value; clamp(); save(); },
        toggle: function (key) { settings[key] = !settings[key]; clamp(); save(); return settings[key]; },
        cycle: function (key, length) {
            settings[key] = ((settings[key] | 0) + 1) % length;
            save();
            return settings[key];
        },
        volume: function () { return VOLUMES[settings.volumeIndex].level; },
        volumeName: function () { return VOLUMES[settings.volumeIndex].name; },
        highlightColor: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].color; },
        highlightInk: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].ink; },
        highlightColorName: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].name; }
    };
})();
