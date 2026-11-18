/**
 * NARBE Build n Ride - this game's own settings.
 *
 * Access settings (Text to Speech, Voice, Auto Scan, Scan Speed, Graphics)
 * belong to the shared hub managers; this file never copies them. It stores
 * only what is this game's own, under its own localStorage key.
 * (Adapted from NARBE Build n Bash.)
 */

window.BNR = window.BNR || {};

BNR.Settings = (function () {
    'use strict';

    const KEY = 'bnr-settings-v1';

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
    /** Train Sounds and Ambient can also be switched off on their own. */
    const LEVELS = [
        { name: 'Off', level: 0 },
        { name: 'Quiet', level: 0.3 },
        { name: 'Medium', level: 0.6 },
        { name: 'Loud', level: 0.95 }
    ];

    /** Time of Day, Season and Weather: Auto Cycle or held at one (js/weather.js). */
    const TIMES = [
        { id: 'auto', name: 'Auto Cycle' }, { id: 'morning', name: 'Morning' }, { id: 'day', name: 'Day' },
        { id: 'sunset', name: 'Sunset' }, { id: 'night', name: 'Night' }
    ];
    const SEASONS = [
        { id: 'auto', name: 'Auto Cycle' }, { id: 'spring', name: 'Spring' }, { id: 'summer', name: 'Summer' },
        { id: 'fall', name: 'Fall' }, { id: 'winter', name: 'Winter' }
    ];
    const WEATHERS = [
        { id: 'auto', name: 'Auto' }, { id: 'clear', name: 'Clear' }, { id: 'rain', name: 'Rain' },
        { id: 'snow', name: 'Snow' }, { id: 'fog', name: 'Fog' }
    ];

    /** How far back the Build camera stands: Close (as it always was), Far and Very Far. */
    const ZOOMS = [{ name: 'Close', k: 1 }, { name: 'Far', k: 1.8 }, { name: 'Very Far', k: 2.8 }];

    const DEFAULTS = {
        /** Comfort Mode: no head bob, softer turns in Conductor view, slower Look turns. */
        comfort: false,
        /** The camera view last used: bird | chase | cab. */
        view: 'chase',
        /** Slow, Medium or Fast (BNR.Ride.SPEEDS), remembered between rides. */
        speedIndex: 1,
        sound: true,
        volumeIndex: 1,
        /** The chuff, the rail clacks and the tunnel rumble. */
        trainVolumeIndex: 1,
        /** Soft background music by biome (js/sound.js). */
        ambientVolumeIndex: 1,
        /** Build's camera distance (ZOOMS), remembered. */
        buildZoomIndex: 0,
        timeIndex: 0,
        seasonIndex: 0,
        weatherIndex: 0,
        highlightColorIndex: 0,
        highlightStyle: 'outline'   // outline | full
    };

    let settings = Object.assign({}, DEFAULTS);

    function wrapIndex(v, len, d) { v = v | 0; return v >= 0 && v < len ? v : d; }

    function clamp() {
        settings.comfort = settings.comfort === true;
        if (['bird', 'chase', 'cab'].indexOf(settings.view) < 0) settings.view = 'chase';
        settings.sound = settings.sound !== false;
        settings.volumeIndex = wrapIndex(settings.volumeIndex, VOLUMES.length, DEFAULTS.volumeIndex);
        settings.speedIndex = wrapIndex(settings.speedIndex, 3, DEFAULTS.speedIndex);
        settings.trainVolumeIndex = wrapIndex(settings.trainVolumeIndex, LEVELS.length, DEFAULTS.trainVolumeIndex);
        settings.ambientVolumeIndex = wrapIndex(settings.ambientVolumeIndex, LEVELS.length, DEFAULTS.ambientVolumeIndex);
        settings.buildZoomIndex = wrapIndex(settings.buildZoomIndex, ZOOMS.length, 0);
        settings.timeIndex = wrapIndex(settings.timeIndex, TIMES.length, 0);
        settings.seasonIndex = wrapIndex(settings.seasonIndex, SEASONS.length, 0);
        settings.weatherIndex = wrapIndex(settings.weatherIndex, WEATHERS.length, 0);
        settings.highlightColorIndex = wrapIndex(settings.highlightColorIndex, HIGHLIGHT_COLORS.length, 0);
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

    return {
        HIGHLIGHT_COLORS: HIGHLIGHT_COLORS,
        VOLUMES: VOLUMES,
        get: function (key) { return settings[key]; },
        set: function (key, value) { settings[key] = value; clamp(); save(); },
        toggle: function (key) { settings[key] = !settings[key]; clamp(); save(); return settings[key]; },
        cycle: function (key, length) { settings[key] = ((settings[key] | 0) + 1) % length; save(); return settings[key]; },
        LEVELS: LEVELS,
        ZOOMS: ZOOMS,
        zoomScale: function () { return ZOOMS[settings.buildZoomIndex].k; },
        zoomName: function () { return ZOOMS[settings.buildZoomIndex].name; },
        TIMES: TIMES,
        SEASONS: SEASONS,
        WEATHERS: WEATHERS,
        timeName: function () { return TIMES[settings.timeIndex].name; },
        seasonName: function () { return SEASONS[settings.seasonIndex].name; },
        weatherName: function () { return WEATHERS[settings.weatherIndex].name; },
        /** For BNR.Weather.setModes: { time, season, weather } ids ('auto' or one to hold). */
        weatherModes: function () {
            return { time: TIMES[settings.timeIndex].id, season: SEASONS[settings.seasonIndex].id, weather: WEATHERS[settings.weatherIndex].id };
        },
        volume: function () { return VOLUMES[settings.volumeIndex].level; },
        volumeName: function () { return VOLUMES[settings.volumeIndex].name; },
        trainVolume: function () { return LEVELS[settings.trainVolumeIndex].level; },
        trainVolumeName: function () { return LEVELS[settings.trainVolumeIndex].name; },
        ambientVolume: function () { return LEVELS[settings.ambientVolumeIndex].level; },
        ambientVolumeName: function () { return LEVELS[settings.ambientVolumeIndex].name; },
        highlightColor: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].color; },
        highlightInk: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].ink; },
        highlightColorName: function () { return HIGHLIGHT_COLORS[settings.highlightColorIndex].name; }
    };
})();
