/**
 * NARBE Glow Pop - sound effects and speech.
 *
 * NO WEB AUDIO. An AudioContext can take down the renderer in the hub's
 * Electron desktop build (ACCESSIBILITY.md section 5), so every effect is
 * synthesised here, sample by sample, into a small WAV file in memory and
 * played through the hub's SafeAudio, which uses plain <audio> elements.
 *
 * Rounded pops, bubbles, boings, bells, whistles and wooden-note runs.
 * Same Every Time reuses one recording; Mix It Up deals out six distinct
 * celebrations before repeating. Ready/build/early-press cues stay distinct.
 */

window.NGP = window.NGP || {};

NGP.Sound = (function () {
    'use strict';

    const SR = 24000;
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = a => a[Math.floor(Math.random() * a.length)];

    const SPARKLE_NOTES = [1046.5, 1174.7, 1318.5, 1568.0, 1760.0, 2093.0];
    const SAME_NOTES = [1318.5, 1568.0, 2093.0];   // "Same Every Time"
    const BUILD_NOTES = [392.0, 493.9, 587.3, 698.5, 784.0, 880.0];
    const MIX_VARIANTS = 6;

    const ready = {};          // family -> list of SafeAudio names that have loaded
    const urls = {};           // family -> one of its recordings, for the automated test

    // --- the synthesiser --------------------------------------------------------

    function buffer(seconds) { return new Float32Array(Math.ceil(seconds * SR)); }

    /** Exponential attack from silence to peak, then exponential decay. */
    function envAt(t, attack, peak, decay) {
        if (t < 0) return 0;
        if (t < attack) return 0.0001 * Math.pow(peak / 0.0001, t / attack);
        const u = t - attack;
        if (u > decay) return 0;
        return peak * Math.pow(0.0001 / peak, u / decay);
    }

    function sweep(t, f0, f1, T) {
        if (f0 === f1) return f0;
        const u = Math.min(1, Math.max(0, t / T));
        return f0 * Math.pow(f1 / f0, u);
    }

    function wave(type, ph) {
        if (type === 'triangle') return 4 * Math.abs(ph - 0.5) - 1;
        return Math.sin(TAU * ph);
    }

    /** One oscillator voice gliding from f0 to f1. */
    function tone(out, t0, type, f0, f1, dur, peak, attack) {
        attack = attack || 0.005;
        const T = attack + dur;
        const s0 = Math.floor(t0 * SR), n = Math.ceil((T + 0.02) * SR);
        let ph = 0;
        for (let i = 0; i < n && s0 + i < out.length; i++) {
            const t = i / SR;
            ph += sweep(t, f0, f1, dur) / SR;
            ph -= Math.floor(ph);
            out[s0 + i] += wave(type, ph) * envAt(t, attack, peak, dur);
        }
    }

    /** Band-passed noise, as the first Glow Pop used for the pop's snap. */
    function noise(out, t0, dur, freq, peak) {
        const attack = 0.002, Q = 1;
        const w = TAU * Math.min(freq, SR * 0.45) / SR, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * Q), a0 = 1 + a;
        const b0 = a / a0, b2 = -a / a0, a1 = (-2 * cs) / a0, a2 = (1 - a) / a0;
        const s0 = Math.floor(t0 * SR), n = Math.ceil((attack + dur + 0.02) * SR);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < n && s0 + i < out.length; i++) {
            const x = Math.random() * 2 - 1;
            const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            out[s0 + i] += y * envAt(i / SR, attack, peak, dur);
        }
    }

    /** Gentle limiter, then scale so the loudest moment lands on `target`. */
    function finish(out, target) {
        let peak = 0;
        for (let i = 0; i < out.length; i++) {
            out[i] = Math.tanh(out[i] * 1.4) / 1.4;
            const a = Math.abs(out[i]);
            if (a > peak) peak = a;
        }
        if (peak > 0) {
            const k = target / peak;
            for (let i = 0; i < out.length; i++) out[i] *= k;
        }
        const fade = Math.min(out.length, Math.floor(SR * 0.01));
        for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
        return out;
    }

    function toWavUrl(samples) {
        const n = samples.length;
        const view = new DataView(new ArrayBuffer(44 + n * 2));
        const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
        str(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
        str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
        view.setUint16(22, 1, true); view.setUint32(24, SR, true); view.setUint32(28, SR * 2, true);
        view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        str(36, 'data'); view.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) {
            view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true);
        }
        return URL.createObjectURL(new Blob([view.buffer], { type: 'audio/wav' }));
    }

    // --- the recipes --------------------------------------------------------------

    function bell(out, at, f, level, duration) {
        tone(out, at, 'sine', f, f, duration, level, 0.008);
        tone(out, at, 'sine', f * 2.76, f * 2.76, duration * 0.4, level * 0.2, 0.006);
    }

    function sparkleNotes(out, notes) {
        notes.forEach((f, i) => bell(out, 0.08 + i * 0.06, f * 0.75, 0.13, 0.32));
    }

    /** The ball: a bright "pop" with a little run of sparkle notes. */
    function pop(out, big, mixed) {
        const start = big ? 420 : mixed ? rand(460, 600) : 520;
        tone(out, 0, 'sine', start, big ? 90 : 120, big ? 0.22 : 0.16, 0.5);
        noise(out, 0, 0.06, 1800, 0.25);
        tone(out, 0.055, 'sine', 750, 250, 0.11, 0.22);
        tone(out, 0.14, 'sine', 980, 400, 0.09, 0.16);
        sparkleNotes(out, big ? SPARKLE_NOTES : mixed ? [pick(SPARKLE_NOTES), pick(SPARKLE_NOTES), pick(SPARKLE_NOTES)] : SAME_NOTES);
    }

    /** The ladybug and bee: a soft, squishy "splut". */
    function squish(out, big, mixed) {
        const start = big ? 300 : mixed ? rand(320, 360) : 340;
        tone(out, 0, 'sine', start, big ? 60 : 75, big ? 0.24 : 0.2, 0.5);
        noise(out, 0, 0.09, 600, 0.3);
        tone(out, 0.08, 'sine', 190, 520, 0.1, 0.22);
        sparkleNotes(out, big ? SPARKLE_NOTES : mixed ? [pick(SPARKLE_NOTES), pick(SPARKLE_NOTES), pick(SPARKLE_NOTES)] : SAME_NOTES);
    }

    function celebration(out, big, isBug, variant) {
        const pitch = big ? 0.84 : 1;
        // Every effect starts immediately with the ball pop or soft bug squish.
        tone(out, 0, 'sine', isBug ? 340 : 520, isBug ? 75 : 120, 0.15, 0.5);
        noise(out, 0, 0.045, isBug ? 600 : 1500, 0.18);
        if (variant === 0) { // Three rounded bubble plops.
            [650, 880, 1175].forEach((f, i) => tone(out, 0.04 + i * 0.11, 'sine', f * pitch, f * 0.32, 0.14, 0.32));
            bell(out, 0.36, 1318, 0.16, 0.32);
        } else if (variant === 1) { // A soft rubber spring, with falling wobble.
            let phase = 0;
            for (let i = 0; i < SR * 0.62; i++) {
                const t = i / SR, f = (230 + 180 * Math.exp(-t * 4) * Math.sin(t * 54)) * pitch;
                phase += f / SR;
                out[i] += Math.sin(TAU * phase) * envAt(t, 0.012, 0.38, 0.61);
            }
            bell(out, 0.3, 784, 0.12, 0.3);
        } else if (variant === 2) { // A bright, ringing three-note reward.
            [659, 831, 988].forEach((f, i) => bell(out, 0.05 + i * 0.095, f, 0.25, 0.5));
        } else if (variant === 3) { // A playful up-and-down whistle.
            tone(out, 0.04, 'sine', 420 * pitch, 1320, 0.25, 0.3, 0.025);
            tone(out, 0.28, 'sine', 1100, 550, 0.2, 0.24, 0.018);
            bell(out, 0.45, 1046.5, 0.16, 0.25);
        } else if (variant === 4) { // Bouncy wooden notes, with a warm lower body.
            [523, 659, 784, 1046].forEach((f, i) => {
                tone(out, 0.04 + i * 0.09, 'sine', f * pitch, f * pitch, 0.18, 0.3);
                tone(out, 0.04 + i * 0.09, 'sine', f * 4, f * 4, 0.045, 0.09);
            });
        } else { // A descending shower of soft chimes.
            [1568, 1318, 1175, 1046, 784].forEach((f, i) => bell(out, 0.04 + i * 0.085, f, 0.19, 0.28));
            noise(out, 0.04, 0.3, 2400, 0.045);
        }
        if (big) { bell(out, 0.48, 1046.5, 0.2, 0.4); bell(out, 0.56, 1568, 0.14, 0.33); }
    }

    const RECIPES = [];
    function add(family, seconds, target, draw) { RECIPES.push({ family, seconds, target, draw }); }

    // UI first, so the menu has its blips straight away.
    add('blip', 0.08, 0.35, o => tone(o, 0, 'sine', 700, 760, 0.05, 0.5, 0.004));
    add('choose', 0.2, 0.45, o => { tone(o, 0, 'sine', 660, 660, 0.08, 0.4); tone(o, 0.07, 'sine', 990, 990, 0.1, 0.4); });
    [523, 622, 740, 880].forEach((f, i) => add('beep' + (i + 1), 0.16, 0.45, o => tone(o, 0, 'sine', f, f, 0.12, 0.5)));

    // The game.
    add('pop-same', 0.6, 0.85, o => pop(o, false, false));
    add('pop-big', 0.75, 0.95, o => pop(o, true, false));
    add('squish-same', 0.6, 0.85, o => squish(o, false, false));
    add('squish-big', 0.75, 0.95, o => squish(o, true, false));
    for (let v = 0; v < MIX_VARIANTS; v++) {
        for (const big of [false, true]) {
            for (const bug of [false, true]) {
                add((bug ? 'squish' : 'pop') + (big ? '-big' : '') + '-mix-' + v,
                    big ? 0.95 : 0.85, big ? 0.9 : 0.8, o => celebration(o, big, bug, v));
            }
        }
    }
    SPARKLE_NOTES.forEach((f, i) => add('mini-' + i, 0.3, 0.3, o => tone(o, 0, 'triangle', f, f, 0.25, 0.08)));
    add('tiny', 0.12, 0.1, o => tone(o, 0, 'sine', 1200, 1200, 0.08, 0.025));
    add('ready', 0.65, 0.45, o => {
        tone(o, 0, 'triangle', 784.0, 784.0, 0.3, 0.14);
        tone(o, 0.12, 'triangle', 1046.5, 1046.5, 0.45, 0.16);
    });
    BUILD_NOTES.forEach((f, i) => add('build-' + (i + 1), 0.36, 0.55, o => {
        tone(o, 0, 'triangle', f, f, 0.3, 0.2);
        tone(o, 0, 'sine', f * 2, f * 2, 0.2, 0.06);
    }));
    add('appear', 0.22, 0.25, o => tone(o, 0, 'sine', 300, 500, 0.15, 0.07));

    let renderedUpTo = 0;
    function renderSome() {
        const until = performance.now() + 12;
        while (renderedUpTo < RECIPES.length && performance.now() < until) {
            const r = RECIPES[renderedUpTo];
            const name = 'ngp-' + r.family + '-' + renderedUpTo;
            renderedUpTo++;
            try {
                const out = buffer(r.seconds);
                r.draw(out);
                const url = toWavUrl(finish(out, r.target));
                window.SafeAudio.preload(name, url);
                (ready[r.family] = ready[r.family] || []).push(name);
                if (!urls[r.family]) urls[r.family] = url;
            } catch (e) {
                console.warn('[NGP] Could not build sound', r.family, e);
            }
        }
        if (renderedUpTo < RECIPES.length) setTimeout(renderSome, 0);
    }

    // --- playing ----------------------------------------------------------------

    function on() { return NGP.Settings.get('sound') && !!window.SafeAudio; }
    function mixed() { return NGP.Settings.get('reactions') === 'mix'; }

    let variants = [], lastVariant = -1;
    function nextVariant() {
        if (!variants.length) {
            variants = Array.from({ length: MIX_VARIANTS }, (_, i) => i);
            for (let i = variants.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [variants[i], variants[j]] = [variants[j], variants[i]];
            }
            if (variants[0] === lastVariant) [variants[0], variants[1]] = [variants[1], variants[0]];
        }
        lastVariant = variants.shift();
        return lastVariant;
    }

    function playPop(big, isBug) {
        const kind = isBug ? 'squish' : 'pop';
        const familiar = kind + (big ? '-big' : '-same');
        if (!mixed()) return play(familiar);
        return play(kind + (big ? '-big' : '') + '-mix-' + nextVariant()) || play(familiar);
    }

    /** Play one recording of `family`, chosen at random. Returns false if none is ready. */
    function play(family, gain) {
        if (!on()) return false;
        const list = ready[family];
        if (!list || !list.length) return false;
        const level = Math.max(0, Math.min(1, NGP.Settings.volume() * (gain === undefined ? 1 : gain)));
        window.SafeAudio.play(pick(list), level);
        return true;
    }

    return {
        init: function () { renderSome(); },
        /** How many recordings are built (used by the automated test). */
        status: function () {
            return { built: renderedUpTo, total: RECIPES.length, families: Object.keys(ready).length, urls: Object.assign({}, urls) };
        },

        pop: playPop,
        /** A press while it is away: a single sparkle note. */
        mini: function () { play('mini-' + (mixed() ? Math.floor(Math.random() * SPARKLE_NOTES.length) : 3)); },
        /** Wait for It, pressed too early: something tiny and quiet. */
        tiny: function () { play('tiny'); },
        ready: function () { play('ready'); },
        build: function (step) { play('build-' + Math.max(1, Math.min(BUILD_NOTES.length, step))); },
        appear: function () { play('appear'); },

        blip: function () { play('blip', 0.6); },
        choose: function () { play('choose', 0.6); },
        beep: function (n) { play('beep' + n, 0.7); },
        /** A short sample, so a caregiver changing the volume hears the new level. */
        sample: function () { playPop(false, NGP.Settings.get('shape') !== 'ball') || play('choose'); }
    };
})();

/**
 * Speech, through the hub's shared voice manager. Text to Speech on/off and
 * the chosen voice live there; this never keeps its own copy.
 */
NGP.Voice = (function () {
    'use strict';
    function vm() { return window.NarbeVoiceManager; }
    return {
        speak: function (text) {
            try { return text && vm() ? vm().speak(text) : null; } catch (e) { return null; }
        },
        cancel: function () { try { vm() && vm().cancel(); } catch (e) { /* no voice manager */ } },
        on: function () { try { return !!vm().getSettings().ttsEnabled; } catch (e) { return false; } }
    };
})();
