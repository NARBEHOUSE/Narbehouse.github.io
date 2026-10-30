/**
 * NARBE Switch Stories - sound effects and menu speech.
 *
 * NO WEB AUDIO. An AudioContext can take down the renderer in the hub's
 * Electron desktop build (ACCESSIBILITY.md section 5), so every built-in
 * effect is synthesised here, sample by sample, into a small WAV file in
 * memory and played through the hub's SafeAudio, which uses plain <audio>
 * elements.
 *
 * The story sounds are the Story Time prototype's own recipes (page flip,
 * woof, boing, tweet, splash, lullaby, fanfare, the "your turn" chime and the
 * little tick). The menu blips and the hold-to-pause beeps match Glow Pop.
 */

window.NSS = window.NSS || {};

NSS.Sound = (function () {
    'use strict';

    const SR = 22050;
    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const ready = {};          // recipe name -> SafeAudio name, once built
    const urls = {};           // recipe name -> its WAV, for the automated test

    // --- the synthesiser (from the prototype) -----------------------------------

    function envAt(t, attack, peak, decay) {
        if (t < 0) return 0;
        if (t < attack) return peak * (t / attack);
        const u = t - attack;
        return u > decay ? 0 : peak * Math.pow(0.001, u / decay);
    }

    function addTone(out, t0, type, f0, f1, dur, peak, attack) {
        attack = attack || 0.008;
        const s0 = Math.floor(t0 * SR), n = Math.ceil((attack + dur) * SR);
        let ph = 0;
        for (let i = 0; i < n && s0 + i < out.length; i++) {
            const t = i / SR;
            ph += f0 * Math.pow(f1 / f0, Math.min(1, t / (attack + dur))) / SR;
            ph -= Math.floor(ph);
            const w = type === 'triangle' ? 4 * Math.abs(ph - 0.5) - 1 : Math.sin(TAU * ph);
            out[s0 + i] += w * envAt(t, attack, peak, dur);
        }
    }

    function addNoise(out, t0, dur, peak, smooth, attack) {
        attack = attack || 0.005;
        const s0 = Math.floor(t0 * SR), n = Math.ceil((attack + dur) * SR);
        let y = 0;
        for (let i = 0; i < n && s0 + i < out.length; i++) {
            y += (Math.random() * 2 - 1 - y) * (1 - smooth);
            out[s0 + i] += y * envAt(i / SR, attack, peak, dur);
        }
    }

    /** Scale so the loudest moment lands on `target`, then wrap it as a WAV. */
    function makeWav(seconds, target, draw) {
        const out = new Float32Array(Math.ceil(seconds * SR));
        draw(out);
        let peak = 0;
        for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
        const k = peak ? target / peak : 0;
        const fade = Math.min(out.length, Math.floor(SR * 0.01));
        for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
        const view = new DataView(new ArrayBuffer(44 + out.length * 2));
        const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
        str(0, 'RIFF'); view.setUint32(4, 36 + out.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, SR, true); view.setUint32(28, SR * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        str(36, 'data'); view.setUint32(40, out.length * 2, true);
        for (let i = 0; i < out.length; i++) view.setInt16(44 + i * 2, clamp(Math.round(out[i] * k * 32767), -32768, 32767), true);
        return URL.createObjectURL(new Blob([view.buffer], { type: 'audio/wav' }));
    }

    // --- the recipes: [seconds, loudness, how to draw it] ------------------------

    const RECIPES = {
        // Menus first, so the library has its blips straight away.
        blip:    [0.08, 0.35, o => addTone(o, 0, 'sine', 700, 760, 0.05, 0.5, 0.004)],
        choose:  [0.2, 0.45, o => { addTone(o, 0, 'sine', 660, 660, 0.08, 0.4); addTone(o, 0.07, 'sine', 990, 990, 0.1, 0.4); }],
        beep1:   [0.16, 0.45, o => addTone(o, 0, 'sine', 523, 523, 0.12, 0.5)],
        beep2:   [0.16, 0.45, o => addTone(o, 0, 'sine', 622, 622, 0.12, 0.5)],
        beep3:   [0.16, 0.45, o => addTone(o, 0, 'sine', 740, 740, 0.12, 0.5)],
        beep4:   [0.16, 0.45, o => addTone(o, 0, 'sine', 880, 880, 0.12, 0.5)],

        // The story.
        flip:    [0.4, 0.5, o => { addNoise(o, 0, 0.28, 0.6, 0.55, 0.08); addTone(o, 0, 'sine', 300, 600, 0.15, 0.05); }],
        woof:    [0.5, 0.8, o => {
            addTone(o, 0, 'triangle', 430, 230, 0.11, 0.6); addNoise(o, 0, 0.08, 0.25, 0.4);
            addTone(o, 0.2, 'triangle', 450, 240, 0.12, 0.6); addNoise(o, 0.2, 0.08, 0.25, 0.4);
        }],
        boing:   [0.6, 0.8, o => { addTone(o, 0, 'sine', 180, 620, 0.18, 0.5); addTone(o, 0.18, 'sine', 620, 260, 0.3, 0.4); }],
        tweet:   [0.5, 0.6, o => { [0, 0.13, 0.26].forEach(t => addTone(o, t, 'sine', 2200, 3400, 0.07, 0.4)); }],
        splash:  [0.7, 0.85, o => { addNoise(o, 0, 0.5, 0.7, 0.2, 0.01); addTone(o, 0, 'sine', 500, 140, 0.2, 0.35); }],
        lullaby: [1.8, 0.5, o => { [784, 659, 587, 523].forEach((f, i) => addTone(o, i * 0.32, 'triangle', f, f, 0.5, 0.3, 0.02)); }],
        fanfare: [1.3, 0.7, o => {
            [523, 659, 784].forEach((f, i) => addTone(o, i * 0.11, 'triangle', f, f, 0.2, 0.35));
            addTone(o, 0.33, 'triangle', 1047, 1047, 0.75, 0.4); addTone(o, 0.33, 'sine', 523, 523, 0.75, 0.2);
        }],
        ready:   [0.7, 0.4, o => { addTone(o, 0, 'triangle', 784, 784, 0.3, 0.3); addTone(o, 0.1, 'triangle', 1047, 1047, 0.45, 0.32); }],
        tick:    [0.08, 0.2, o => addTone(o, 0, 'sine', 1000, 1000, 0.04, 0.3, 0.003)],

        // For "Lily Loves Books".
        click:   [0.25, 0.6, o => { addNoise(o, 0, 0.025, 0.7, 0.1, 0.001); addTone(o, 0, 'triangle', 1800, 1200, 0.03, 0.4, 0.001);
                                    addNoise(o, 0.07, 0.02, 0.4, 0.1, 0.001); addTone(o, 0.07, 'triangle', 1400, 1000, 0.025, 0.25, 0.001); }],
        twinkle: [1.2, 0.45, o => { [1568, 2093, 2637, 3136, 2637].forEach((f, i) => addTone(o, i * 0.13, 'sine', f, f, 0.35, 0.22, 0.004)); }],
        whoosh:  [0.9, 0.5, o => { addNoise(o, 0, 0.75, 0.6, 0.85, 0.3); addTone(o, 0.05, 'sine', 180, 420, 0.6, 0.15, 0.2); }],
        roll:    [1.4, 0.35, o => { addNoise(o, 0, 1.2, 0.5, 0.94, 0.25); addTone(o, 0, 'sine', 90, 110, 1.15, 0.2, 0.2); }]
    };

    // Built a few at a time, so the first screen appears straight away.
    const queue = Object.keys(RECIPES);
    function renderSome() {
        const until = performance.now() + 12;
        while (queue.length && performance.now() < until) {
            const name = queue.shift();
            const [seconds, target, draw] = RECIPES[name];
            try {
                const url = makeWav(seconds, target, draw);
                window.SafeAudio.preload('nss-' + name, url);
                ready[name] = 'nss-' + name;
                urls[name] = url;
            } catch (e) {
                console.warn('[NSS] Could not build sound', name, e);
            }
        }
        if (queue.length) setTimeout(renderSome, 0);
    }

    // --- playing ----------------------------------------------------------------

    function on() { return NSS.Settings.get('sound') && !!window.SafeAudio; }

    /** Play a built-in sound. Returns false if it is off or not built yet. */
    function play(name, gain) {
        if (!on() || !ready[name]) return false;
        const level = clamp(NSS.Settings.volume() * (gain === undefined ? 1 : gain), 0, 1);
        window.SafeAudio.play(ready[name], level);
        return true;
    }

    // --- a story's own sound files (recorded narration and action sounds) ------------
    //
    // These play through SafeAudio too. SafeAudio fails silently on a missing
    // file and cannot say when a sound ends, so each file is first checked
    // with an <audio> element that loads only the file's details (never
    // plays): it tells us the file is there, and how long it lasts.

    const files = {};    // url -> { status: 'pending' | 'ok' | 'failed', seconds, promise }

    /** `quiet`: a file the game only guessed at, so its absence is normal. */
    function check(url, quiet) {
        if (!url) return Promise.resolve({ status: 'failed', seconds: 0 });
        if (files[url]) return files[url].promise;
        const entry = { status: 'pending', seconds: 0 };
        entry.promise = new Promise(function (resolve) {
            const probe = new Audio();
            let timer = null;
            const done = function (ok) {
                if (entry.status !== 'pending') return;
                clearTimeout(timer);
                entry.status = ok ? 'ok' : 'failed';
                entry.seconds = ok && isFinite(probe.duration) ? probe.duration : 0;
                probe.onloadedmetadata = probe.onerror = null;
                probe.removeAttribute('src');
                if (ok) window.SafeAudio.preload('nss-file:' + url, url);
                else if (!quiet) console.warn('[NSS] Could not play ' + url + '. Is the file there, and is its name right in story.js?');
                resolve(entry);
            };
            timer = setTimeout(function () { done(false); }, 5000);
            probe.preload = 'metadata';
            probe.onloadedmetadata = function () { done(true); };
            probe.onerror = function () { done(false); };
            probe.src = url;
        });
        files[url] = entry;
        return entry.promise;
    }

    /** Play a checked file. Returns false if it is missing or not checked yet. */
    function playFile(url, level) {
        const entry = files[url];
        if (!entry || entry.status !== 'ok' || !window.SafeAudio) return false;
        window.SafeAudio.play('nss-file:' + url, clamp(level, 0, 1));
        return true;
    }

    function stopFile(url) {
        if (url && files[url] && files[url].status === 'ok' && window.SafeAudio) window.SafeAudio.stop('nss-file:' + url);
    }

    /**
     * An action's sound: the page's own file when it has one that works,
     * otherwise the built-in sound for that action.
     */
    function action(page) {
        if (!on() || page.actionSilent) return;
        const builtIn = (NSS.CONFIG.actions[page.action] || {}).sound;
        if (page.actionSound && playFile(page.actionSound, NSS.Settings.volume())) return;
        if (builtIn) play(builtIn);
    }

    return {
        init: function () { renderSome(); },
        check: check,
        playFile: playFile,
        stopFile: stopFile,
        fileStatus: function (url) { return files[url] ? files[url].status : 'none'; },
        action: action,
        /** Play the closing effect; return its duration so descriptions can follow it. */
        after: function (page) {
            if (on() && page.afterSound && playFile(page.afterSound, NSS.Settings.volume())) return files[page.afterSound].seconds;
            return 0;
        },
        /** How many sounds are built (used by the automated test). */
        status: function () {
            return { built: Object.keys(ready).length, total: Object.keys(RECIPES).length, urls: Object.assign({}, urls) };
        },
        has: function (name) { return !!RECIPES[name]; },
        play: play,

        blip: function () { play('blip', 0.6); },
        choose: function () { play('choose', 0.6); },
        beep: function (n) { play('beep' + n, 0.7); },
        /** A short sample, so a caregiver changing the volume hears the new level. */
        sample: function () { play('woof') || play('choose'); }
    };
})();

/**
 * Menu and scanning speech, through the hub's shared voice manager. The
 * hub's Text to Speech on/off and the chosen voice live there; this never
 * keeps its own copy. (Reading the story aloud is the game's own Read Aloud
 * setting, in reader.js.)
 */
NSS.Voice = (function () {
    'use strict';
    function vm() { return window.NarbeVoiceManager; }
    return {
        speak: function (text, options) {
            try { return text && vm() ? vm().speak(text, options) : null; } catch (e) { return null; }
        },
        cancel: function () { try { vm() && vm().cancel(); } catch (e) { /* no voice manager */ } },
        on: function () { try { return !!vm().getSettings().ttsEnabled; } catch (e) { return false; } }
    };
})();
