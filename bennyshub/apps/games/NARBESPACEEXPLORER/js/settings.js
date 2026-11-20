/**
 * NARBE Space Explorer - this game's own settings.
 *
 * Access settings (Text to Speech, Voice, Auto Scan, Scan Speed, Graphics)
 * belong to the shared hub managers; this file never copies them. It stores
 * only what is this game's own, under its own localStorage key.
 * (Pattern from NARBE Build n Ride.)
 */

window.NSE = window.NSE || {};

NSE.Settings = (function () {
    'use strict';

    const KEY = 'nse-settings-v1';

    /** The highlight list the other NARBE games offer (colour + an ink ring outside it). */
    const HIGHLIGHT_COLORS = [
        { name: 'Gold', color: '#ffd700', ink: '#1a1008' },
        { name: 'Cyan', color: '#00e5ff', ink: '#1a1008' },
        { name: 'Lime', color: '#00ff00', ink: '#1a1008' },
        { name: 'White', color: '#ffffff', ink: '#1a1008' },
        { name: 'Pink', color: '#ff4fa8', ink: '#1a1008' },
        { name: 'Orange', color: '#ff9a1f', ink: '#1a1008' },
        { name: 'Blue', color: '#2f6bff', ink: '#ffffff' },
        { name: 'Red', color: '#e0302a', ink: '#ffffff' },
        { name: 'Violet', color: '#8a2be2', ink: '#ffffff' }
    ];

    const VOLUMES = [{ name: 'Quiet', level: 0.35 }, { name: 'Medium', level: 0.65 }, { name: 'Loud', level: 1 }];
    const LEVELS = [{ name: 'Off', level: 0 }, { name: 'Quiet', level: 0.3 }, { name: 'Medium', level: 0.6 }, { name: 'Loud', level: 0.95 }];

    /** How fast the ship flies by itself: 0 Slow, 1 Medium, 2 Fast (Speed Up / Slow Down change it). */
    const SPEEDS = [
        { name: 'Very Slow', k: 0.45 }, { name: 'Slow', k: 0.7 }, { name: 'Medium', k: 1 }, { name: 'Fast', k: 1.5 }, { name: 'Very Fast', k: 2.2 }
    ];

    /** How often aliens call you up. */
    const HAILS = [{ id: 'often', name: 'Often' }, { id: 'sometimes', name: 'Sometimes' }, { id: 'off', name: 'Off' }];

    /** How the ship turns: Gentle eases further, Calm also stills the stars' twinkle and drift. */
    const MOTIONS = [{ id: 'full', name: 'Full' }, { id: 'calm', name: 'Calm' }];

    const DEFAULTS = {
        speedIndex: 2,
        view: 'cockpit',            // cockpit | chase | wide
        hails: 'sometimes',
        motion: 'full',
        sound: true,
        volumeIndex: 1,
        musicIndex: 2,
        /** Spoken facts when you arrive in orbit (name, type, gravity...). */
        facts: true,
        highlightColorIndex: 0,
        highlightStyle: 'outline'   // outline | full
    };

    let settings = Object.assign({}, DEFAULTS);

    function idx(v, len, d) { v = v | 0; return v >= 0 && v < len ? v : d; }

    function clamp() {
        settings.speedIndex = idx(settings.speedIndex, SPEEDS.length, DEFAULTS.speedIndex);
        if (['cockpit', 'chase', 'wide'].indexOf(settings.view) < 0) settings.view = 'cockpit';
        if (!HAILS.some(h => h.id === settings.hails)) settings.hails = DEFAULTS.hails;
        if (!MOTIONS.some(m => m.id === settings.motion)) settings.motion = 'full';
        settings.sound = settings.sound !== false;
        settings.facts = settings.facts !== false;
        settings.volumeIndex = idx(settings.volumeIndex, VOLUMES.length, DEFAULTS.volumeIndex);
        settings.musicIndex = idx(settings.musicIndex, LEVELS.length, DEFAULTS.musicIndex);
        settings.highlightColorIndex = idx(settings.highlightColorIndex, HIGHLIGHT_COLORS.length, 0);
        if (settings.highlightStyle !== 'full') settings.highlightStyle = 'outline';
    }

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) settings = Object.assign({}, DEFAULTS, JSON.parse(raw));
        } catch (e) { settings = Object.assign({}, DEFAULTS); }
        clamp();
    }

    function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ } }

    load();

    function cycleList(key, list) {
        const i = list.findIndex(x => x.id === settings[key]);
        settings[key] = list[(i + 1) % list.length].id;
        save();
        return settings[key];
    }

    return {
        HIGHLIGHT_COLORS: HIGHLIGHT_COLORS,
        SPEEDS: SPEEDS,
        HAILS: HAILS,
        get: function (key) { return settings[key]; },
        set: function (key, value) { settings[key] = value; clamp(); save(); },
        toggle: function (key) { settings[key] = !settings[key]; clamp(); save(); return settings[key]; },
        cycle: function (key, length) { settings[key] = ((settings[key] | 0) + 1) % length; save(); return settings[key]; },
        cycleHails: function () { return cycleList('hails', HAILS); },
        cycleMotion: function () { return cycleList('motion', MOTIONS); },
        hailsName: function () { return HAILS.find(h => h.id === settings.hails).name; },
        motionName: function () { return MOTIONS.find(m => m.id === settings.motion).name; },
        calm: function () { return settings.motion === 'calm'; },
        speed: function () { return SPEEDS[settings.speedIndex].k; },
        speedName: function () { return SPEEDS[settings.speedIndex].name; },
        volume: function () { return VOLUMES[settings.volumeIndex].level; },
        volumeName: function () { return VOLUMES[settings.volumeIndex].name; },
        musicVolume: function () { return LEVELS[settings.musicIndex].level; },
        musicName: function () { return LEVELS[settings.musicIndex].name; },
        VOLUMES: VOLUMES,
        LEVELS: LEVELS,
        highlightColor: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].color; },
        highlightInk: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].ink; },
        highlightColorName: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].name; }
    };
})();
