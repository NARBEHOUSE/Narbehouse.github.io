/**
 * NARBE Build n Ride - sound effects, train sounds, ambience and speech.
 * (The synthesiser is NARBE Build n Bash's, itself from NARBE Magic Button.)
 *
 * NO WEB AUDIO. An AudioContext can take down the renderer in the hub's
 * Electron desktop build (ACCESSIBILITY.md section 5), so every sound is
 * synthesised here, sample by sample, into a small WAV in memory and played
 * through plain <audio> elements: one-shots through the hub's SafeAudio,
 * loops (ambience, the tunnel) through two of our own elements that crossfade
 * so the loop never gaps.
 *
 * Three volumes (Settings): Volume for effects (menus, the horn, stations,
 * events), Train Sounds (the chuff and the rail clacks, the tunnel rumble) and
 * Ambient (birds, water, wind, town hum by biome). Sound Effects Off mutes all.
 *
 * Peaceful: sounds heard all the time (the chuff, the clack, the scan blip)
 * are short, soft and low; the ambience is soft background music for each kind
 * of land (slow warm chords, a few mallet or flute notes, all on one five-note
 * scale and all low), with no chirps and no bed of hiss. The horn is a warm,
 * low three-note whistle, three ways, so a hundred toots never sound alike.
 */

window.BNR = window.BNR || {};

BNR.Sound = (function () {
    'use strict';

    const SR = 22050;
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = a => a[Math.floor(Math.random() * a.length)];

    const ready = {};
    const loopUrls = {};

    // --- the synthesiser ------------------------------------------------------------------

    function buffer(seconds) { return new Float32Array(Math.ceil(seconds * SR)); }

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
        if (type === 'soft-square') return Math.tanh(Math.sin(TAU * ph) * 3) * 0.8;
        return Math.sin(TAU * ph);
    }

    function tone(out, t0, type, f0, f1, dur, peak, attack, vib) {
        f1 = f1 || f0;
        attack = attack || 0.005;
        const T = attack + dur;
        const s0 = Math.floor(t0 * SR), n = Math.ceil((T + 0.02) * SR);
        let ph = Math.random();
        for (let i = 0; i < n && s0 + i < out.length; i++) {
            const t = i / SR;
            let f = sweep(t, f0, f1, T);
            if (vib) f *= 1 + vib.depth * Math.sin(TAU * vib.rate * t);
            ph += f / SR;
            ph -= Math.floor(ph);
            out[s0 + i] += wave(type, ph) * envAt(t, attack, peak, dur);
        }
    }

    /** A held note: rises over `attack`, holds, then falls away over `release` (whistles, horns). */
    function held(out, t0, type, f0, f1, dur, peak, attack, release, vib) {
        const s0 = Math.floor(t0 * SR), n = Math.ceil((dur + release) * SR);
        if (type === 'sine' && (!f1 || f1 === f0) && !vib) return heldSine(out, s0, n, f0, dur, peak, attack, release);
        let ph = Math.random();
        for (let i = 0; i < n && s0 + i < out.length; i++) {
            const t = i / SR;
            let f = sweep(t, f0, f1 || f0, dur);
            if (vib) f *= 1 + vib.depth * Math.sin(TAU * vib.rate * t);
            ph += f / SR;
            ph -= Math.floor(ph);
            let e = t < attack ? Math.pow(t / attack, 1.5) : 1;
            if (t > dur) e *= 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, (t - dur) / release));
            out[s0 + i] += wave(type, ph) * e * peak;
        }
    }

    /**
     * held() for a steady sine (the music's long chords): a rotating oscillator instead of
     * Math.sin every sample, and the envelope worked out only where it changes. Same sound,
     * many times quicker, so the music loops build without stalling the menus.
     */
    function heldSine(out, s0, n, f, dur, peak, attack, release) {
        const w = TAU * f / SR, c2 = 2 * Math.cos(w), ph = Math.random() * TAU;
        let y1 = Math.sin(ph - w), y0 = Math.sin(ph);
        const nA = Math.floor(attack * SR), nD = Math.floor(dur * SR), nR = release * SR;
        const end = Math.min(n, out.length - s0);
        const envAtI = i => (i < nA ? Math.pow(i / nA, 1.5) : 1) * (i > nD ? 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, (i - nD) / nR)) : 1);
        // The envelope moves slowly: work it out every 32 samples and slide between.
        for (let b = 0; b < end; b += 32) {
            const stop = Math.min(end, b + 32);
            let e = envAtI(b) * peak;
            const de = (envAtI(b + 32) * peak - e) / 32;
            for (let i = b; i < stop; i++) {
                out[s0 + i] += y0 * e;
                e += de;
                const y = c2 * y0 - y1;
                y1 = y0; y0 = y;
            }
        }
    }

    function coeffs(type, fc, Q) {
        fc = Math.min(fc, SR * 0.45);
        const w = TAU * fc / SR, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * Q);
        let b0, b1, b2;
        if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
        else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
        else { b0 = a; b1 = 0; b2 = -a; }
        const a0 = 1 + a;
        return [b0 / a0, b1 / a0, b2 / a0, (-2 * cs) / a0, (1 - a) / a0];
    }

    /** Filtered noise, cutoff gliding f0 -> f1. `shape(t)` optionally scales it over time. */
    function noise(out, t0, dur, type, f0, f1, peak, attack, Q, shape) {
        Q = Q || (type === 'bandpass' ? 1 : 0.9);
        const T = attack + dur;
        const s0 = Math.floor(t0 * SR), n = Math.ceil((T + 0.02) * SR);
        let c = coeffs(type, f0, Q), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < n && s0 + i < out.length; i++) {
            const t = i / SR;
            if ((i & 15) === 0) c = coeffs(type, sweep(t, f0, f1, T), Q);
            const x = Math.random() * 2 - 1;
            const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            out[s0 + i] += y * envAt(t, attack, peak, dur) * (shape ? shape(t) : 1);
        }
    }

    /** Steady filtered noise across a whole buffer, its loudness following shape(t) (beds, wind). */
    function bed(out, type, fc, Q, peak, shape) {
        let c = coeffs(type, fc, Q), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < out.length; i++) {
            const t = i / SR;
            if (typeof fc === 'function' && (i & 31) === 0) c = coeffs(type, fc(t), Q);
            const x = Math.random() * 2 - 1;
            const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            out[i] += y * peak * (shape ? shape(t) : 1);
        }
    }

    /** Swelling noise: rises over `rise` then falls over `fall` (whooshes). */
    function swell(out, t0, rise, fall, type, f0, fMid, f1, peak, Q) {
        const T = rise + fall, s0 = Math.floor(t0 * SR), n = Math.ceil(T * SR);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = coeffs(type, f0, Q || 1.2);
        for (let i = 0; i < n && s0 + i < out.length; i++) {
            const t = i / SR;
            if ((i & 15) === 0) c = coeffs(type, t < rise ? sweep(t, f0, fMid, rise) : sweep(t - rise, fMid, f1, fall), Q || 1.2);
            const e = t < rise ? Math.pow(t / rise, 1.6) : Math.pow(1 - (t - rise) / fall, 1.8);
            const x = Math.random() * 2 - 1;
            const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            out[s0 + i] += y * e * peak;
        }
    }

    function finish(out, target) {
        let peak = 0;
        for (let i = 0; i < out.length; i++) {
            out[i] = Math.tanh(out[i] * 1.4) / 1.4;
            const a = Math.abs(out[i]);
            if (a > peak) peak = a;
        }
        if (peak > 0) { const k = target / peak; for (let i = 0; i < out.length; i++) out[i] *= k; }
        const fade = Math.min(out.length, Math.floor(SR * 0.012));
        for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
        return out;
    }

    const WRAP_TAIL = 12;     // seconds a wrapped loop's notes may ring past its end
    const LOOP_XF = 0.6;      // the loop players' crossfade (XF below)

    /**
     * Fold everything past `period` back round onto the start, level it, then add a copy of
     * the first LOOP_XF seconds at the end: the player crossfades exactly over that copy,
     * so the music runs on through the join without a seam.
     */
    function wrapLoop(out, period, target) {
        const n = Math.round(period * SR), x = Math.round(LOOP_XF * SR);
        const res = new Float32Array(n + x);
        for (let i = 0; i < out.length; i++) res[i % n] += out[i];
        let peak = 0;
        for (let i = 0; i < n; i++) { res[i] = Math.tanh(res[i] * 1.4) / 1.4; peak = Math.max(peak, Math.abs(res[i])); }
        const k = peak > 0 ? target / peak : 1;
        for (let i = 0; i < n; i++) res[i] *= k;
        for (let i = 0; i < x; i++) res[n + i] = res[i];
        return res;
    }

    /** Make a buffer loop seamlessly: fold its last `xf` seconds back over its start. */
    function loopable(out, xf) {
        const n = Math.floor(xf * SR), L = out.length - n;
        const res = new Float32Array(L);
        for (let i = 0; i < L; i++) res[i] = out[i];
        for (let i = 0; i < n; i++) { const k = i / n; res[i] = out[i] * k + out[L + i] * (1 - k); }
        return res;
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
        for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true);
        return URL.createObjectURL(new Blob([view.buffer], { type: 'audio/wav' }));
    }

    // --- voices of the sounds ------------------------------------------------------------------

    /** A wooden knock: body tone, a woody overtone, a click, a low thump. f = body pitch. */
    function knock(o, t, f, len, level) {
        level = level || 1;
        tone(o, t, 'sine', f * 1.03, f * 0.93, len, 0.7 * level, 0.002);
        tone(o, t, 'sine', f * 2.3, f * 2.15, len * 0.35, 0.22 * level, 0.001);
        noise(o, t, 0.016, 'bandpass', 1700, 1300, 0.3 * level, 0.001, 1.3);
        tone(o, t, 'sine', f * 0.5, f * 0.42, len * 1.3, 0.35 * level, 0.003);
    }

    /** The steam whistle: a warm major chord (base ~ E4), a breath of steam, a little waver. */
    function whistle(o, t0, dur, base, level, droop) {
        [1, 1.26, 1.5].forEach(function (m, i) {
            const f = base * m;
            held(o, t0, 'sine', f * 0.96, f * (droop ? 0.97 : 1), dur, 0.42 * level / (1 + i * 0.3), 0.07, 0.22, { depth: 0.006, rate: 5.4 });
            held(o, t0, 'triangle', f * 1.92, f * (droop ? 1.94 : 2), dur, 0.05 * level, 0.08, 0.2);
        });
        noise(o, t0, dur + 0.1, 'bandpass', 1050, 950, 0.1 * level, 0.04, 1.8);
    }

    function chirp(o, t, f0, f1, len, level) { tone(o, t, 'sine', f0, f1, len, 0.22 * (level || 1), 0.006, { depth: 0.02, rate: 30 }); }

    /** A muted wooden tok: a knock without the click. */
    function tok(o, t, f, len, level) {
        tone(o, t, 'sine', f * 1.03, f * 0.93, len, 0.7 * level, 0.002);
        tone(o, t, 'sine', f * 0.5, f * 0.42, len * 1.3, 0.35 * level, 0.003);
    }

    /** A little bird phrase: notes [[offset, from, to, length], ...] around a base pitch. */
    function song(o, t, base, notes, level) {
        notes.forEach(n => tone(o, t + n[0], 'sine', base * n[1], base * n[2], n[3], 0.2 * (level || 1), 0.008, { depth: 0.01, rate: 22 }));
    }

    /** A soft bell: a few partials dying away. */
    function bellTone(o, t, f, level) {
        [1, 2.0, 2.76, 5.4].forEach((m, i) => tone(o, t, 'sine', f * m, f * m, 1.8 / (1 + i * 0.6), 0.5 * level / (1 + i), 0.004));
    }

    const RECIPES = [];
    function add(family, seconds, target, draw) { RECIPES.push({ family: family, seconds: seconds, target: target, draw: draw }); }
    function addLoop(family, seconds, target, draw) { RECIPES.push({ family: family, seconds: seconds + 0.6, target: target, draw: draw, loop: true }); }
    /**
     * A loop of exactly `period` seconds whose notes may ring on past its end: they are drawn
     * into a longer buffer and folded back round onto the start (wrapLoop), so a chord held
     * over the join simply carries on.
     */
    function addWrapLoop(family, period, target, draw) { RECIPES.push({ family: family, seconds: period + WRAP_TAIL, period: period, target: target, draw: draw, loop: true, wrap: true }); }

    // UI first, so the menus have their blips straight away.
    add('blip', 0.08, 0.3, o => tone(o, 0, 'sine', 640, 690, 0.05, 0.5, 0.004));
    add('choose', 0.22, 0.38, o => { tone(o, 0, 'sine', 587, 587, 0.08, 0.4); tone(o, 0.07, 'sine', 880, 880, 0.11, 0.4); });
    add('popup', 0.9, 0.45, o => { tone(o, 0, 'sine', 659, 659, 0.5, 0.45, 0.004); tone(o, 0.12, 'sine', 988, 988, 0.6, 0.4, 0.004); tone(o, 0.12, 'sine', 1319, 1319, 0.3, 0.08, 0.004); });
    // Changing the view: a soft rising two-note glide (no whoosh).
    add('swoosh', 0.5, 0.22, o => { tone(o, 0, 'sine', 520, 600, 0.12, 0.4, 0.02); tone(o, 0.09, 'sine', 660, 760, 0.16, 0.35, 0.02); });

    // The horn: three ways to toot.
    add('horn', 1.5, 0.62, o => whistle(o, 0.0, 1.05, 330, 1));
    add('horn', 1.3, 0.62, o => { whistle(o, 0.0, 0.3, 330, 1); whistle(o, 0.48, 0.42, 330, 1); });
    add('horn', 1.9, 0.62, o => whistle(o, 0.0, 1.4, 311, 1, true));
    add('toot', 1.0, 0.5, o => { whistle(o, 0.0, 0.22, 330, 0.9); whistle(o, 0.36, 0.3, 330, 0.9); });

    // The train: soft low puffs and wooden toks. Nothing hissy: these play all ride long.
    for (let v = 0; v < 4; v++) add('chuff', 0.26, 0.3, o => {
        tone(o, 0, 'sine', rand(84, 96), 52, 0.13, 0.6, 0.006);
        noise(o, 0.004, 0.1, 'lowpass', rand(300, 360), 140, 0.3, 0.012);
    });
    for (let v = 0; v < 3; v++) add('clack', 0.3, 0.24, o => { tok(o, 0, rand(560, 660), 0.035, 0.6); tok(o, 0.09, rand(500, 600), 0.035, 0.45); });

    // Building: a wooden click as a piece lands, a soft unclick for Undo, a happy tune when the loop closes.
    add('snap', 0.4, 0.3, o => { tok(o, 0, 430, 0.05, 0.9); tok(o, 0.07, 760, 0.03, 0.45); });
    add('unsnap', 0.45, 0.24, o => { tone(o, 0, 'sine', 620, 400, 0.16, 0.45, 0.006); tok(o, 0.13, 330, 0.04, 0.5); });
    add('fanfare', 2.8, 0.34, o => {
        [[0, 523.25], [0.15, 659.25], [0.3, 783.99], [0.45, 1046.5], [0.78, 783.99], [0.93, 1046.5]].forEach(n => tone(o, n[0], 'sine', n[1], n[1], 0.55, 0.38, 0.01));
        bellTone(o, 0.45, 523.25, 0.5);
        bellTone(o, 0.93, 784, 0.4);
    });

    // Events.
    add('distant-horn', 1.8, 0.3, o => { held(o, 0, 'sine', 220, 220, 1.1, 0.5, 0.08, 0.35); held(o, 0, 'sine', 277, 277, 1.1, 0.4, 0.08, 0.35); held(o, 0, 'triangle', 440, 440, 1.1, 0.06, 0.08, 0.3); });
    add('burner', 1.0, 0.22, o => swell(o, 0, 0.15, 0.6, 'lowpass', 140, 380, 180, 1, 0.8));
    add('flutter', 1.0, 0.28, o => {
        for (let k = 0; k < 10; k++) tone(o, rand(0, 0.5), 'sine', rand(260, 340), rand(180, 220), 0.04, rand(0.25, 0.4), 0.004);
        coo(o, 0.3, 0.6);
    });
    // Sounds for the routes' events, all gentle.
    add('splash', 1.2, 0.3, o => { noise(o, 0, 0.45, 'lowpass', 520, 160, 0.6, 0.02); for (let k = 0; k < 6; k++) tone(o, rand(0.05, 0.5), 'sine', rand(300, 600), rand(600, 900), 0.06, 0.2, 0.004); });
    add('pop', 1.5, 0.32, o => { tone(o, 0, 'sine', 170, 60, 0.2, 0.7, 0.004); for (let k = 0; k < 12; k++) tone(o, 0.12 + rand(0, 1.0), 'sine', rand(900, 1500), rand(700, 1200), 0.05, rand(0.08, 0.16), 0.003); });
    add('chime', 2.0, 0.32, o => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(o, i * 0.15, 'sine', f, f, 1.0, 0.35, 0.01)));
    add('bell', 2.4, 0.3, o => bellTone(o, 0, 392, 1));
    add('moo', 1.6, 0.3, o => {
        const n = Math.floor(1.3 * SR);
        let ph = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR, f = 150 - 25 * t / 1.3;
            ph += f / SR;
            const e = Math.min(1, t / 0.12) * Math.max(0, 1 - Math.pow(t / 1.3, 3));
            o[i] += (wave('triangle', ph % 1) * 0.5 + Math.sin(TAU * ph * 2) * 0.2) * e;
        }
    });
    add('whale', 2.6, 0.28, o => held(o, 0, 'sine', 170, 300, 1.7, 0.6, 0.35, 0.5, { depth: 0.02, rate: 3 }));
    // A far-off gull, low and soft (it used to be high and shrill).
    add('gull', 1.0, 0.16, o => { held(o, 0, 'sine', 760, 620, 0.2, 0.4, 0.04, 0.12); held(o, 0.32, 'sine', 720, 600, 0.24, 0.32, 0.04, 0.14); });
    for (let v = 0; v < 2; v++) add('baa', 0.8, 0.42, o => {
        const n = Math.floor(0.62 * SR), f = rand(330, 400);
        let ph = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            ph += f * (1 - 0.06 * t) / SR;
            const e = Math.min(1, t / 0.05) * Math.max(0, 1 - Math.pow(t / 0.62, 3));
            o[i] += wave('triangle', ph % 1) * 0.5 * e * (0.62 + 0.38 * Math.sin(TAU * 17 * t));
        }
        noise(o, 0, 0.6, 'bandpass', 1100, 900, 0.12, 0.04, 3);
    });
    add('engine', 1.0, 0.4, o => {
        const n = Math.floor(0.95 * SR), f = rand(68, 82);
        let ph = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            ph += f / SR;
            const putt = 0.5 + 0.5 * Math.sign(Math.sin(TAU * 12 * t));
            o[i] += wave('soft-square', ph % 1) * 0.5 * putt * Math.min(1, t * 12) * Math.min(1, (0.95 - t) * 10);
        }
        noise(o, 0, 0.9, 'lowpass', 300, 260, 0.25, 0.05);
    });

    // Loops: a soft piece of background music for each kind of land, rain and the tunnel.
    // Calm and low for children: slow pads, a few soft mallet or flute notes, nothing high or
    // chirpy, never a bed of hiss (tests/sound.test.cjs checks all of that). Every zone keeps
    // to the same five notes (C D E G A), so two zones heard together while the train crosses
    // from one to the other always sound right together.
    const N = {
        C2: 65.41, D2: 73.42, E2: 82.41, G2: 98, A2: 110,
        C3: 130.81, D3: 146.83, E3: 164.81, G3: 196, A3: 220,
        C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440,
        C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99
    };

    /** A slow, warm chord: each note two gently beating sines and a faint octave. */
    function pad(o, t0, notes, dur, level, attack, release) {
        attack = attack || 2.6; release = release || 3.4;
        notes.forEach(function (n, i) {
            const f = N[n], l = (level || 1) * 0.3 / (1 + i * 0.25);
            held(o, t0, 'sine', f, f, dur, l, attack, release);
            held(o, t0, 'sine', f * 1.0025, f * 1.0025, dur, l * 0.7, attack * 1.1, release);
            held(o, t0, 'sine', f * 2, f * 2, dur, l * 0.07, attack, release);
        });
    }

    /** A soft mallet note (marimba or kalimba): round, no click, dying away. */
    function mallet(o, t, n, level, decay) {
        const f = N[n];
        decay = decay || 1.6;
        tone(o, t, 'sine', f, f, decay, 0.5 * (level || 1), 0.012);
        tone(o, t, 'sine', f * 2, f * 2, decay * 0.3, 0.06 * (level || 1), 0.012);
        tone(o, t, 'sine', f * 0.5, f * 0.5, decay * 0.6, 0.12 * (level || 1), 0.02);
    }

    /** A soft wooden flute note: slow to start, a slow gentle waver. */
    function flute(o, t, n, dur, level) {
        const f = N[n];
        held(o, t, 'sine', f, f, dur, 0.34 * (level || 1), 0.35, 0.7, { depth: 0.0035, rate: 4.2 });
        held(o, t, 'sine', f * 2, f * 2, dur, 0.035 * (level || 1), 0.4, 0.6);
    }

    /** A far-off dove: two low, smooth coos (the only bird left, and nothing squeaky about it). */
    function coo(o, t, level) {
        held(o, t, 'sine', 410, 392, 0.32, 0.22 * (level || 1), 0.09, 0.16);
        held(o, t + 0.55, 'sine', 392, 370, 0.5, 0.18 * (level || 1), 0.1, 0.25);
    }

    /** A soft low bell: only its lower partials, so it rings warm, not tinny. */
    function softBell(o, t, n, level) {
        const f = N[n];
        [[1, 0.5, 2.8], [2, 0.16, 1.6], [3, 0.06, 0.9]].forEach(p => tone(o, t, 'sine', f * p[0], f * p[0], p[2], p[1] * level, 0.01));
    }

    /** Lay chords end to end across a loop of `L` seconds (they wrap round its end). */
    function chords(o, L, list, level) {
        const each = L / list.length;
        list.forEach((c, i) => pad(o, i * each, c, each + 0.8, level));
    }

    /** Notes [[time, note], ...] on an instrument. */
    function tune(o, notes, play) { notes.forEach(n => play(o, n[0], n[1])); }

    const AL = 24;   // the ambience loops' length in seconds

    // Meadows and farmland: bright and gentle, a kalimba wandering over warm chords.
    addWrapLoop('amb-birds', AL, 0.2, o => {
        chords(o, AL, [['C3', 'G3', 'E4'], ['A2', 'E3', 'C4'], ['D3', 'A3', 'E4'], ['G2', 'D3', 'G3']], 1);
        tune(o, [[0.8, 'E4'], [2.4, 'G4'], [4.6, 'A4'], [7.2, 'G4'], [9.0, 'E4'], [12.6, 'D4'], [14.2, 'E4'], [17.0, 'C4'], [19.4, 'D4'], [21.2, 'G4']], (o2, t, n) => mallet(o2, t, n, 0.55, 1.8));
        coo(o, 15.5, 0.8);
    });
    // Forest: darker and lower, a soft wooden marimba.
    addWrapLoop('amb-forest', AL, 0.2, o => {
        chords(o, AL, [['A2', 'E3', 'C4'], ['G2', 'D3', 'A3'], ['C3', 'G3', 'E4'], ['A2', 'E3', 'D4']], 1);
        tune(o, [[1.2, 'A3'], [2.0, 'C4'], [6.8, 'D4'], [7.6, 'C4'], [13.0, 'E4'], [13.8, 'D4'], [19.0, 'C4'], [19.8, 'A3']], (o2, t, n) => mallet(o2, t, n, 0.6, 1.0));
        coo(o, 10.2, 0.7);
    });
    // Lakes and rivers: wide chords and slow, low droplets of melody.
    addWrapLoop('amb-water', AL, 0.2, o => {
        chords(o, AL, [['C3', 'G3', 'D4'], ['A2', 'E3', 'G3'], ['C3', 'A3', 'E4']], 0.9);
        tune(o, [[0.6, 'G4'], [2.9, 'E4'], [5.3, 'A4'], [8.1, 'D4'], [10.4, 'G4'], [11.6, 'E4'], [14.9, 'C5'], [17.3, 'A4'], [19.8, 'E4'], [22.1, 'D4']], (o2, t, n) => mallet(o2, t, n, 0.42, 2.4));
    });
    // Hills and mountains: open fifths that swell like wind, and a slow flute.
    addWrapLoop('amb-wind', AL, 0.18, o => {
        pad(o, 0, ['A2', 'E3'], AL, 0.9, 4, 4);
        pad(o, AL / 2, ['D3', 'A3'], AL / 2 + 1, 0.6, 4, 4);
        tune(o, [[2.0, 'E4'], [5.2, 'D4'], [8.0, 'A3'], [14.0, 'C4'], [17.0, 'D4'], [20.0, 'E4']], (o2, t, n) => flute(o2, t, n, 2.2, 0.8));
    });
    // Desert and canyons: a warm low drone and a lazy flute.
    addWrapLoop('amb-desert', AL, 0.18, o => {
        pad(o, 0, ['D2', 'A2'], AL, 1, 4, 4);
        chords(o, AL, [['D3', 'A3'], ['C3', 'G3'], ['D3', 'A3'], ['E3', 'A3']], 0.6);
        tune(o, [[1.5, 'A3'], [3.5, 'D4'], [6.0, 'C4'], [12.5, 'E4'], [15.0, 'D4'], [18.0, 'A3']], (o2, t, n) => flute(o2, t, n, 1.8, 0.75));
    });
    // Villages: homely chords and a soft, low bell now and then.
    addWrapLoop('amb-town', AL, 0.2, o => {
        chords(o, AL, [['C3', 'E3', 'G3'], ['A2', 'C3', 'E3'], ['G2', 'D3', 'G3'], ['C3', 'E3', 'A3']], 1);
        softBell(o, 1.0, 'C4', 0.6);
        softBell(o, 13.0, 'G3', 0.5);
        tune(o, [[4.0, 'E4'], [5.0, 'D4'], [7.5, 'C4'], [16.0, 'A3'], [17.0, 'C4'], [19.5, 'D4']], (o2, t, n) => mallet(o2, t, n, 0.5, 1.6));
    });
    // The seaside: slow low surf under long, open chords.
    addWrapLoop('amb-sea', AL, 0.2, o => {
        [[0.5, 5.5], [6.5, 5.0], [12.2, 5.8], [18.4, 5.2]].forEach(w => swell(o, w[0], w[1] * 0.45, w[1] * 0.55, 'lowpass', 110, 210, 100, 0.55, 0.7));
        chords(o, AL, [['E3', 'A3', 'C4'], ['D3', 'G3', 'C4'], ['C3', 'E3', 'A3']], 0.8);
        tune(o, [[3.0, 'E4'], [9.5, 'D4'], [16.0, 'C4']], (o2, t, n) => mallet(o2, t, n, 0.4, 2.6));
    });
    // City: a mellow electric piano over gentle chords.
    addWrapLoop('amb-city', AL, 0.18, o => {
        chords(o, AL, [['A2', 'C3', 'G3', 'E4'], ['D3', 'A3', 'C4'], ['C3', 'G3', 'D4'], ['G2', 'D3', 'A3']], 0.8);
        tune(o, [[0.5, 'E4'], [0.5, 'C4'], [6.5, 'D4'], [6.5, 'A3'], [12.5, 'G4'], [12.5, 'D4'], [18.5, 'E4'], [18.5, 'A3'], [21.0, 'D4']], (o2, t, n) => mallet(o2, t, n, 0.38, 2.2));
    });
    // Snow: still and twinkly, slow soft notes over a quiet chord.
    addWrapLoop('amb-snow', AL, 0.17, o => {
        chords(o, AL, [['C3', 'G3', 'D4'], ['A2', 'E3', 'G3'], ['C3', 'G3', 'E4']], 0.8);
        tune(o, [[1.0, 'E5'], [3.5, 'D5'], [6.0, 'G4'], [9.5, 'C5'], [12.0, 'A4'], [15.5, 'D5'], [18.0, 'E5'], [21.0, 'G4']], (o2, t, n) => mallet(o2, t, n, 0.32, 2.8));
    });
    // Rain: a soft low patter on the roof and a slow low swell, nothing hissy.
    addWrapLoop('rain', 12, 0.18, o => {
        for (let k = 0; k < 90; k++) {
            const f = rand(190, 420);
            tone(o, rand(0, 12), 'sine', f, f * 0.85, rand(0.05, 0.09), rand(0.05, 0.12), 0.004);
        }
        swell(o, 0, 5.2, 6.8, 'lowpass', 120, 240, 120, 0.35, 0.7);
    });
    addLoop('tunnel', 6, 0.32, o => { held(o, 0, 'sine', 62, 62, 5.6, 0.5, 0.5, 0.4); held(o, 0, 'sine', 124, 124, 5.6, 0.12, 0.5, 0.4); });

    let renderedUpTo = 0;
    function renderSome() {
        const until = performance.now() + 12;
        while (renderedUpTo < RECIPES.length && performance.now() < until) {
            const r = RECIPES[renderedUpTo];
            const name = 'bnr-' + r.family + '-' + renderedUpTo;
            renderedUpTo++;
            try {
                let out = buffer(r.seconds);
                r.draw(out);
                if (r.loop) {
                    out = r.wrap ? wrapLoop(out, r.period, r.target) : loopable(finish(out, r.target), 0.6);
                    loopUrls[r.family] = { url: toWavUrl(out), seconds: out.length / SR };
                    continue;
                }
                window.SafeAudio.preload(name, toWavUrl(finish(out, r.target)));
                (ready[r.family] = ready[r.family] || []).push(name);
            } catch (e) { console.warn('[BNR] Could not build sound', r.family, e); }
        }
        if (renderedUpTo < RECIPES.length) setTimeout(renderSome, 0);
    }

    // --- playing ----------------------------------------------------------------------------

    function S() { return BNR.Settings; }
    function on() { return S().get('sound') && !!window.SafeAudio; }
    function level(cat) { return cat === 'train' ? S().trainVolume() : cat === 'ambient' ? S().ambientVolume() : S().volume(); }

    function play(family, gain, cat) {
        if (!on()) return false;
        const list = ready[family];
        if (!list || !list.length) return false;
        const lv = Math.max(0, Math.min(1, level(cat) * (gain === undefined ? 1 : gain)));
        if (lv <= 0.01) return false;
        window.SafeAudio.play(pick(list), lv);
        return true;
    }

    let lastHorn = 0;

    // --- loops: two elements per loop, crossfading so it never gaps ----------------------------------

    const XF = 0.6;
    const loops = {};
    function loop(name) {
        if (loops[name]) return loops[name];
        const src = loopUrls[name];
        if (!src || typeof Audio === 'undefined') return null;
        const els = [new Audio(src.url), new Audio(src.url)];
        els.forEach(a => { a.preload = 'auto'; a.volume = 0; });
        const L = loops[name] = { els: els, cur: 0, playing: false, vol: 0, gain: 0, seconds: src.seconds, started: 0 };
        return L;
    }

    function stopLoop(L) {
        L.els.forEach(a => { try { a.pause(); } catch (e) { /* ignore */ } });
        L.playing = false;
    }

    function stepLoop(L, dt, master) {
        L.vol += (L.gain - L.vol) * (1 - Math.exp(-1.6 * dt));
        const v = Math.max(0, Math.min(1, L.vol * master));
        if (v < 0.004) { if (L.playing && L.gain === 0) stopLoop(L); return; }
        const a = L.els[L.cur], b = L.els[1 - L.cur];
        if (!L.playing) {
            L.playing = true;
            try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
        }
        const t = a.currentTime || 0;
        const left = L.seconds - t;
        if (left < XF && b.paused) {
            try { b.currentTime = 0; const p = b.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
        }
        if (left <= 0.02 || a.ended) { L.cur = 1 - L.cur; try { a.pause(); } catch (e) { /* ignore */ } }
        const k = left < XF ? Math.max(0, left / XF) : 1;
        try { a.volume = v * k; if (!b.paused) b.volume = v * (1 - k); } catch (e) { /* ignore */ }
    }

    const AMBIENTS = ['amb-birds', 'amb-forest', 'amb-water', 'amb-wind', 'amb-desert', 'amb-town', 'amb-sea', 'amb-city', 'amb-snow'];

    return {
        init: function () { if (window.SafeAudio) renderSome(); },
        play: play,
        status: function () { return { built: renderedUpTo, total: RECIPES.length, families: Object.keys(ready), loops: Object.keys(loopUrls) }; },
        blip: function () { play('blip', 0.6); },
        choose: function () { play('choose', 0.6); },
        sample: function () { play('popup', 0.6) || play('choose'); },
        sampleTrain: function () { play('chuff', 1, 'train'); },
        /** The horn: never more than one toot at a time. */
        horn: function () {
            const now = performance.now();
            if (now - lastHorn < 380) return false;
            lastHorn = now;
            return play('horn', 1);
        },
        toot: function () { play('toot', 0.8); },
        /** One chuff; louder and boomier feeling in a tunnel. */
        chuff: function (speed, inTunnel) { play('chuff', (0.55 + 0.06 * Math.min(14, speed || 0) / 14) * (inTunnel ? 1.35 : 1), 'train'); },
        clack: function (inTunnel) { play('clack', inTunnel ? 0.9 : 0.7, 'train'); },
        /**
         * Loop targets, set every frame by the game: amb { 'amb-birds': weight, ... },
         * tunnel 0..1, active: false silences everything (menus, pause), rain 0..1.
         */
        setScene: function (amb, tunnel, active, rain) {
            const R = loop('rain');
            if (R) R.gain = active ? (rain || 0) * 0.85 * (1 - 0.85 * tunnel) : 0;
            AMBIENTS.forEach(function (n) {
                const L = loop(n);
                if (L) L.gain = active ? (amb[n] || 0) * (1 - 0.8 * tunnel) : 0;
            });
            const T = loop('tunnel');
            if (T) T.gain = active ? tunnel : 0;
        },
        /** Crossfade the loops (call every frame). */
        update: function (dt) {
            const master = on() ? 1 : 0;
            Object.keys(loops).forEach(function (n) {
                const L = loops[n];
                stepLoop(L, dt, master * (n === 'tunnel' ? S().trainVolume() * 0.9 : S().ambientVolume()));
            });
        },
        silence: function () { Object.keys(loops).forEach(n => { loops[n].gain = 0; loops[n].vol = 0; stopLoop(loops[n]); }); },
        AMBIENTS: AMBIENTS,
        /** For tests: draw every recipe into buffers (no audio elements). */
        _render: function () {
            return RECIPES.map(r => {
                const out = buffer(r.seconds);
                r.draw(out);
                const samples = r.wrap ? wrapLoop(out, r.period, r.target) : r.loop ? loopable(finish(out, r.target), 0.6) : finish(out, r.target);
                return { family: r.family, loop: !!r.loop, wrap: !!r.wrap, xf: LOOP_XF, samples: samples };
            });
        },
        _rate: SR
    };
})();

/**
 * Speech, through the hub's shared voice manager (TTS on/off and the voice
 * live there). Scan labels and selections speak at once and clear the queue;
 * game events (a station's name, "Deer!") wait their turn so nothing cuts them
 * off, and stale ones are dropped.
 */
BNR.Voice = (function () {
    'use strict';
    function vm() { return window.NarbeVoiceManager; }
    let current = null, queue = [], busy = false;

    function speakNow(text) {
        try { return text && vm() ? vm().speak(text) : null; } catch (e) { return null; }
    }

    function next() {
        busy = false;
        const now = Date.now();
        while (queue.length && now - queue[0].at > 7000) queue.shift();
        const item = queue.shift();
        if (!item) return;
        run(item.text);
    }

    function run(text) {
        busy = true;
        const ticket = current = speakNow(text);
        const done = ticket && ticket.finished ? Promise.resolve(ticket.finished) : new Promise(r => setTimeout(r, Math.min(6000, 400 + text.length * 70)));
        const cap = new Promise(r => setTimeout(r, 9000));
        Promise.race([done, cap]).then(() => { if (current === ticket) next(); });
    }

    return {
        /** Speak now, interrupting (scan labels, selections, screen titles). */
        speak: function (text) { queue = []; busy = false; current = null; return speakNow(text); },
        /** Say a game event after whatever is being said now. */
        say: function (text) {
            if (!text) return;
            if (!busy) run(text);
            else if (queue.length < 2) queue.push({ text: text, at: Date.now() });
        },
        /** Say a game event right now, dropping anything queued. */
        sayNow: function (text) { queue = []; run(text); },
        cancel: function () { queue = []; busy = false; current = null; try { vm() && vm().cancel(); } catch (e) { /* none */ } },
        on: function () { try { return !!vm().getSettings().ttsEnabled; } catch (e) { return false; } }
    };
})();
