/** The one remembered loop: ordered sound lines, each with one sound. */
window.NL = window.NL || {};
NL.Beat = (function () {
    'use strict';
    const KEY = 'nl-beat-v1', MAX_LINES = 8;
    let state;
    const copy = value => JSON.parse(JSON.stringify(value));
    function M() { return NL.Music; }
    function defaults() {
        const layers = {};
        M().LAYERS.forEach(function (L, i) {
            layers[L.id] = { kind: L.id, name: L.name, sel: 0, mine: null, muted: i !== 0, sound: 0 };
        });
        return { version: 2, speedIndex: 2, playing: true, nextLine: 1, order: M().LAYERS.map(L => L.id), layers };
    }
    function validPattern(p) {
        return Array.isArray(p) && p.length === 16 && p.every(v => Number.isInteger(v) && v >= -1 && v < 15);
    }
    function validSound(v) { return Number.isInteger(v) && v >= 0 && v < 4; }
    // All sixteen stored spots count; ties use the first sound in the picker.
    function rowSound(raw, fallback) {
        if (validSound(raw.sound)) return raw.sound;
        if (!Array.isArray(raw.sounds)) return fallback;
        const counts = [0, 0, 0, 0];
        raw.sounds.forEach(v => { if (validSound(v)) counts[v]++; });
        return Math.max(...counts) ? counts.indexOf(Math.max(...counts)) : fallback;
    }
    function normalize(raw) {
        const d = defaults();
        if (!raw || typeof raw !== 'object') return d;
        if (Number.isInteger(raw.speedIndex) && M().SPEEDS[raw.speedIndex]) d.speedIndex = raw.speedIndex;
        if (typeof raw.playing === 'boolean') d.playing = raw.playing;
        if (Number.isSafeInteger(raw.nextLine) && raw.nextLine > 0) d.nextLine = raw.nextLine;
        const modern = raw.version === 2 && Array.isArray(raw.order);
        const order = modern ? raw.order : d.order;
        if (modern) { d.order = []; d.layers = {}; }
        for (const id of order) {
            if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,40}$/.test(id) || (modern && d.order.includes(id))) continue;
            const r = raw.layers && Object.prototype.hasOwnProperty.call(raw.layers, id) ? raw.layers[id] : null;
            if (!r || typeof r !== 'object') continue;
            const kind = modern ? r.kind : id, option = M().choice(kind);
            if (!option || (modern && d.order.length >= MAX_LINES)) continue;
            const L = M().line(kind, id);
            const s = { kind, name: typeof r.name === 'string' && r.name.trim() ? r.name.slice(0, 32) : L.name,
                sel: 0, mine: null, muted: typeof r.muted === 'boolean' ? r.muted : false, sound: rowSound(r, option.sound) };
            if (validPattern(r.mine)) s.mine = r.mine.slice();
            if (r.sel === 'mine' && s.mine) s.sel = 'mine';
            else if (Number.isInteger(r.sel) && L.presets[r.sel]) s.sel = r.sel;
            d.layers[id] = s;
            if (modern) d.order.push(id);
        }
        return d;
    }
    function validSnapshot(raw) {
        return !!(raw && raw.version === 2 && Number.isInteger(raw.speedIndex) && M().SPEEDS[raw.speedIndex] &&
            typeof raw.playing === 'boolean' && Number.isSafeInteger(raw.nextLine) && raw.nextLine > 0 &&
            Array.isArray(raw.order) && raw.order.length <= MAX_LINES && new Set(raw.order).size === raw.order.length && raw.layers &&
            raw.order.every(id => {
                if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,40}$/.test(id) || !Object.prototype.hasOwnProperty.call(raw.layers, id)) return false;
                const r = raw.layers[id], option = r && M().choice(r.kind);
                if (!option || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 32 || typeof r.muted !== 'boolean' || !validSound(r.sound)) return false;
                if (r.mine != null && !validPattern(r.mine)) return false;
                return r.sel === 'mine' ? validPattern(r.mine) : Number.isInteger(r.sel) && !!M().line(r.kind, id).presets[r.sel];
            }));
    }
    function restore(raw) {
        if (!validSnapshot(raw)) throw Error('This saved loop could not be opened.');
        const next = normalize(raw);
        // Do not replace the current loop if it cannot be remembered durably.
        localStorage.setItem(KEY, JSON.stringify(next));
        state = next;
    }
    function load() {
        let raw;
        try {
            const stored = localStorage.getItem(KEY) || localStorage.getItem('ngb-beat-v1');
            raw = JSON.parse(stored || 'null');
        } catch (e) { /* A damaged loop falls back to the starting loop. */ }
        state = normalize(raw);
        if (raw) save();
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* Still playable if storage is unavailable. */ } }
    function line(id) { const s = state.layers[id]; return s && state.order.includes(id) ? M().line(s.kind, id, s.name) : null; }
    function lines() { return state.order.map(line); }
    function ls(L) { return L && state.layers[L.id]; }
    function patternOf(L) { const s = ls(L); return s.sel === 'mine' && s.mine ? s.mine : L.presets[s.sel]; }
    function partsOf() {
        return lines().filter(L => !ls(L).muted).map(L => ({ layer: L, pattern: patternOf(L), sound: ls(L).sound }));
    }
    function bpm() { return M().SPEEDS[state.speedIndex].bpm; }
    function speedName() { return M().SPEEDS[state.speedIndex].name; }
    function status(L) { const s = ls(L); return s.muted ? 'Muted' : s.sel === 'mine' ? 'My pattern' : 'Pattern ' + (s.sel + 1); }
    function render() { NL.Sound.setLoop(NL.Synth.renderLoop(partsOf(), bpm(), 2)); }
    function changed() { save(); render(); }
    function nextPattern(L) {
        const s = ls(L), opts = L.presets.map((_, i) => i).concat(s.mine ? ['mine'] : []);
        s.sel = opts[(opts.indexOf(s.sel) + 1) % opts.length]; s.muted = false; changed();
    }
    function toggleMute(L) { ls(L).muted = !ls(L).muted; changed(); }
    function cycleSpeed() { state.speedIndex = (state.speedIndex + 1) % M().SPEEDS.length; changed(); }
    function enter() { render(); if (state.playing) NL.Sound.play(); else NL.Sound.stop(); }
    function togglePlay() {
        state.playing = !NL.Sound.isPlaying(); save();
        if (state.playing) NL.Sound.play(); else NL.Sound.stop();
        return state.playing;
    }
    function setSound(L, sound) {
        if (!ls(L) || !validSound(sound)) return false;
        ls(L).sound = sound; changed(); return true;
    }
    function toggleStep(L, step) {
        if (!ls(L) || !Number.isInteger(step) || step < 0 || step >= 16) return;
        const s = ls(L), p = patternOf(L).slice();
        p[step] = p[step] >= 0 ? -1 : L.type === 'drum' ? 0 : L.contour[step];
        s.mine = p; s.sel = 'mine'; s.muted = false; changed();
        if (!NL.Sound.isPlaying() && p[step] >= 0) NL.Sound.shot(L, p[step], s.sound);
        return p[step] >= 0;
    }
    function addLine(kind) {
        const option = M().choice(kind);
        if (!option || state.order.length >= MAX_LINES) return null;
        let id;
        do { id = 'line-' + state.nextLine++; } while (state.layers[id]);
        const names = new Set(lines().map(L => L.name));
        let name = option.name, n = 2;
        while (names.has(name)) name = option.name + ' ' + n++;
        state.layers[id] = { kind, name, sound: option.sound, sel: 'mine', mine: Array(16).fill(-1), muted: false };
        state.order.push(id); changed(); return line(id);
    }
    function removeLine(L) {
        if (!ls(L)) return false;
        state.order = state.order.filter(id => id !== L.id); delete state.layers[L.id]; changed(); return true;
    }
    load();
    return {
        MAX_LINES, lines, line, bpm, speedName, status, nextPattern, toggleMute, cycleSpeed, enter, togglePlay, toggleStep, setSound, addLine, removeLine,
        displayPattern: patternOf, ownPattern: patternOf, isMuted: L => ls(L).muted,
        soundIndex: L => ls(L).sound, layerSoundName: L => M().sounds(L)[ls(L).sound],
        stepDur: () => 60 / bpm() / 4, currentStep: () => Math.floor(NL.Sound.phase() * 32) % 16,
        clearAll: function () { const playing = state.playing; state = defaults(); state.playing = playing; save(); },
        isPlaying: () => NL.Sound.isPlaying(), snapshot: () => copy(state), normalize, partsOf, validSnapshot, restore
    };
})();
