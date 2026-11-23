/**
 * NARBE Space Explorer - sound effects, alien voices and space music.
 * (The synthesiser, the WAV encoder, the staggered rendering and the crossfading loop
 * players are NARBE Build n Ride's js/sound.js, itself from Build n Bash and Magic Button.)
 *
 * NO WEB AUDIO. An AudioContext can take down the renderer in the hub's Electron desktop
 * build (ACCESSIBILITY.md section 5), so every sound is synthesised here, sample by sample,
 * into a small 16-bit mono WAV in memory and played through plain <audio> elements:
 * one-shots through the hub's SafeAudio (under unique 'nse-' names, so no built-in sound
 * is ever shadowed), music loops through two of our own elements per loop that crossfade
 * so the loop never gaps.
 *
 * Calm: the sounds heard all the time (scan blip, choose, thruster puffs, speed changes,
 * logbook pages) are short, soft to start, quiet and low. Bright and big is saved for the
 * rare moments: the discovery chime and the warp. The music is soft background for each
 * kind of star (slow warm chords, a few mallet or bell notes), all under ~1.2 kHz, never a
 * bed of hiss, and all on the one five-note scale (C D E G A) so two loops crossfading
 * always sound right together.
 *
 * Settings (js/settings.js, guarded if missing): get('sound') master, volume() effects,
 * musicVolume() music (0 = off).
 */

window.NSE = window.NSE || {};

NSE.Sound = (function () {
    'use strict';

    const SR = 22050;
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
    const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

    const ready = {};       // one-shot name -> [SafeAudio names of its variants]
    const loopUrls = {};    // music name -> { url, seconds }

    // --- the synthesiser (Build n Ride's) ---------------------------------------------------

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
        return Math.sin(TAU * ph);
    }

    /** A struck note: quick (but never clicky) rise, then dies away over `dur`. */
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

    /** A held note: rises over `attack`, holds, then falls away over `release`. */
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
     * Math.sin every sample, and the envelope worked out every 32 samples. Same sound, many
     * times quicker, so the music loops build without stalling the menus.
     */
    function heldSine(out, s0, n, f, dur, peak, attack, release) {
        const w = TAU * f / SR, c2 = 2 * Math.cos(w), ph = Math.random() * TAU;
        let y1 = Math.sin(ph - w), y0 = Math.sin(ph);
        const nA = Math.max(1, Math.floor(attack * SR)), nD = Math.floor(dur * SR), nR = Math.max(1, release * SR);
        const end = Math.min(n, out.length - s0);
        const envAtI = i => (i < nA ? Math.pow(i / nA, 1.5) : 1) * (i > nD ? 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, (i - nD) / nR)) : 1);
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

    /** Filtered noise, cutoff gliding f0 -> f1 (soft air: always lowpass or bandpass here). */
    function noise(out, t0, dur, type, f0, f1, peak, attack, Q) {
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
            out[s0 + i] += y * envAt(t, attack, peak, dur);
        }
    }

    /** Swelling filtered noise: rises over `rise` then falls over `fall` (whooshes). */
    function swell(out, t0, rise, fall, type, f0, fMid, f1, peak, Q) {
        const T = rise + fall, s0 = Math.floor(t0 * SR), n = Math.ceil(T * SR);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = coeffs(type, f0, Q || 1.2);
        for (let i = 0; i < n && s0 + i < out.length; i++) {
            const t = i / SR;
            if ((i & 15) === 0) c = coeffs(type, t < rise ? sweep(t, f0, fMid, rise) : sweep(t - rise, fMid, f1, fall), Q || 1.2);
            const e = t < rise ? Math.pow(t / rise, 1.6) : Math.pow(Math.max(0, 1 - (t - rise) / fall), 1.8);
            const x = Math.random() * 2 - 1;
            const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            out[s0 + i] += y * e * peak;
        }
    }

    /** Soft-clip, level to `target` peak, and fade the last 12 ms so nothing clicks off. */
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
    const LOOP_XF = 0.6;      // the loop players' crossfade at the join (XF below)

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

    function wavBytes(samples) {
        const n = samples.length;
        const view = new DataView(new ArrayBuffer(44 + n * 2));
        const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
        str(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
        str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
        view.setUint16(22, 1, true); view.setUint32(24, SR, true); view.setUint32(28, SR * 2, true);
        view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        str(36, 'data'); view.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true);
        return view.buffer;
    }

    /** A WAV in memory: an object URL, or a data URL where Blob URLs are unavailable. */
    function toWavUrl(samples) {
        const bytes = wavBytes(samples);
        if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
            return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        }
        const u8 = new Uint8Array(bytes);
        let bin = '';
        for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return 'data:audio/wav;base64,' + btoa(bin);
    }

    // --- voices --------------------------------------------------------------------------------

    /** A soft bell: a few low partials dying away (warm, not tinny). */
    function bell(o, t, f, level, decay) {
        decay = decay || 1.0;
        [[1, 0.5, 1], [2, 0.14, 0.55], [3, 0.05, 0.3]].forEach(p => tone(o, t, 'sine', f * p[0], f * p[0], decay * p[2], p[1] * level, 0.006));
    }

    /**
     * One alien syllable: a voiced buzz at pitch fA -> fB whose harmonics are shaped by two
     * vowel formants (gliding vowel vA -> vB), with a tiny pitch flick at the start like a
     * soft consonant. Harmonics stop at ~2.3 kHz, so even the loud aliens are never shrill.
     */
    const VOWELS = { a: [750, 1150], e: [480, 1650], i: [320, 1850], o: [520, 860], u: [340, 780], ae: [640, 1450] };
    function syllable(o, t0, dur, fA, fB, vA, vB, level, growl, body) {
        const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
        const A = VOWELS[vA], B = VOWELS[vB || vA];
        const amps = new Float32Array(17);
        const att = Math.min(0.03, dur * 0.3), rel = Math.min(0.07, dur * 0.5);
        const vibR = rand(5, 7), vibP = Math.random() * TAU;
        let ph = Math.random(), K = 1;
        for (let i = 0; i < n && s0 + i < o.length; i++) {
            const t = i / SR, u = t / dur;
            const f = fA * Math.pow(fB / fA, u) * (1 + 0.015 * Math.sin(TAU * vibR * t + vibP)) * (1 + 0.18 * Math.exp(-t / 0.015));
            ph += f / SR; ph -= Math.floor(ph);
            if ((i & 63) === 0) {
                const F1 = A[0] + (B[0] - A[0]) * u, F2 = A[1] + (B[1] - A[1]) * u;
                K = Math.max(1, Math.min(16, Math.floor(2300 / f)));
                let sum = 0;
                for (let k = 1; k <= K; k++) {
                    const h = k * f;
                    const a = Math.exp(-Math.pow((h - F1) / 170, 2)) + 0.5 * Math.exp(-Math.pow((h - F2) / 230, 2)) + (body || 0.12) / k;
                    amps[k] = a; sum += a;
                }
                for (let k = 1; k <= K; k++) amps[k] /= sum;
            }
            // sin(k x) for every harmonic by the Chebyshev recurrence (one sin, one cos a sample)
            const x = TAU * ph, s1 = Math.sin(x), c2 = 2 * Math.cos(x);
            let sPrev = 0, sk = s1, acc = amps[1] * s1;
            for (let k = 2; k <= K; k++) { const sn = c2 * sk - sPrev; sPrev = sk; sk = sn; acc += amps[k] * sn; }
            let e = t < att ? Math.sin(Math.PI / 2 * t / att) : 1;
            if (t > dur - rel) e *= 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, dur - t) / rel);
            if (growl) e *= 1 - growl + growl * (0.5 + 0.5 * Math.sin(TAU * 26 * t));
            o[s0 + i] += acc * e * level;
        }
    }

    /** Four alien moods: how high, how quick, which vowels, which way the pitch moves. */
    const MOODS = {
        // Bouncy and high: pitch hops up and down, ends on a happy "oo-ee!".
        friendly: {
            f: [240, 290], syl: [0.08, 0.14], gap: [0.02, 0.05], brk: 0.2, len: 1.3, vowels: ['a', 'e', 'i', 'o', 'ae'],
            contour: (b, p, k) => (k % 2 ? [b * 1.15, b * 0.95] : [b * 0.92, b * 1.2]).map(f => f * (1 + 0.06 * Math.sin(k * 1.7))),
            ending: (o, t, b) => syllable(o, t, 0.3, b * 1.0, b * 1.45, 'u', 'i', 1, 0)
        },
        // Questioning: each word climbs, and the last one rises like "ooh-ee?"
        curious: {
            f: [190, 235], syl: [0.11, 0.18], gap: [0.03, 0.07], brk: 0.25, len: 1.25, vowels: ['o', 'u', 'e', 'a'],
            contour: (b, p) => { const m = 1 + 0.25 * p; return [b * m * 0.95, b * m * 1.1]; },
            ending: (o, t, b) => syllable(o, t, 0.38, b * 1.1, b * 1.75, 'o', 'i', 1, 0)
        },
        // Low and grumbly (a strong low body), falling words, a rumbly growl, then "hmph".
        grumpy: {
            f: [95, 120], syl: [0.13, 0.22], gap: [0.03, 0.08], brk: 0.3, len: 1.3, vowels: ['o', 'u', 'a'], growl: 0.35, body: 0.5,
            contour: b => [b * 1.12, b * 0.86],
            ending: (o, t, b) => syllable(o, t, 0.32, b * 0.95, b * 0.7, 'u', 'u', 1, 0.45, 0.5)
        },
        // Louder and faster (a shouted "GO AWAY!"), but mid-pitched and never shrill.
        loud: {
            f: [205, 250], syl: [0.06, 0.11], gap: [0.012, 0.035], brk: 0.12, len: 1.15, vowels: ['a', 'o', 'ae', 'e'],
            accent: k => (k % 3 === 0 ? 1 : 0.8),
            contour: b => [b * 1.3, b * 0.98],
            ending: (o, t, b) => {
                syllable(o, t, 0.12, b * 1.25, b * 1.15, 'o', 'o', 1, 0);
                syllable(o, t + 0.15, 0.1, b * 1.3, b * 1.2, 'a', 'a', 0.9, 0);
                syllable(o, t + 0.28, 0.42, b * 1.35, b * 0.95, 'ae', 'e', 1, 0);
            }
        }
    };

    function babble(o, mood) {
        const M = MOODS[mood], base = rand(M.f[0], M.f[1]);
        let t = 0.03, k = 0;
        for (;;) {
            const d = rand(M.syl[0], M.syl[1]);
            if (t + d > M.len) break;
            const fs = M.contour(base, t / M.len, k);
            const vA = pick(M.vowels), vB = Math.random() < 0.4 ? pick(M.vowels) : vA;
            syllable(o, t, d, fs[0], fs[1], vA, vB, M.accent ? M.accent(k) : 1, M.growl || 0, M.body);
            t += d + rand(M.gap[0], M.gap[1]);
            if (Math.random() < M.brk) t += rand(0.08, 0.16);   // a break between words
            k++;
        }
        M.ending(o, Math.min(t, M.len + 0.05), base);
    }

    // --- the recipes ---------------------------------------------------------------------------

    const RECIPES = [];
    function add(name, seconds, target, draw) { RECIPES.push({ name: name, seconds: seconds, target: target, draw: draw }); }
    /**
     * A music loop of exactly `period` seconds whose notes may ring on past its end: drawn
     * into a longer buffer and folded back round onto the start (wrapLoop), so a chord held
     * over the join simply carries on.
     */
    function addMusic(name, period, target, draw) { RECIPES.push({ name: name, seconds: period + WRAP_TAIL, period: period, target: target, draw: draw, loop: true }); }

    // Short UI sounds first, so the menus have them straight away. All soft, low and short.
    add('blip', 0.08, 0.2, o => { tone(o, 0, 'sine', 392, 415, 0.05, 0.5, 0.006); });
    add('choose', 0.18, 0.32, o => {
        tone(o, 0, 'sine', 392, 392, 0.07, 0.45, 0.006); tone(o, 0, 'sine', 784, 784, 0.04, 0.05, 0.006);
        tone(o, 0.06, 'sine', 523.25, 523.25, 0.09, 0.42, 0.008); tone(o, 0.06, 'sine', 1046.5, 1046.5, 0.04, 0.04, 0.008);
    });
    add('pop', 0.12, 0.26, o => { tone(o, 0, 'sine', 440, 280, 0.06, 0.6, 0.006); tone(o, 0, 'sine', 880, 560, 0.03, 0.06, 0.006); });
    // A thruster puff: soft low air and a low thump. Three, so steering never sounds stamped.
    for (let v = 0; v < 3; v++) add('thrust', 0.36, 0.28, o => {
        noise(o, 0, 0.27, 'lowpass', rand(420, 500), rand(150, 180), 0.6, 0.04, 0.7);
        tone(o, 0, 'sine', rand(82, 92), 58, 0.24, 0.4, 0.03);
    });
    add('faster', 0.3, 0.28, o => { tone(o, 0, 'sine', 330, 523, 0.2, 0.45, 0.03); tone(o, 0, 'sine', 165, 262, 0.2, 0.15, 0.03); });
    add('slower', 0.3, 0.28, o => { tone(o, 0, 'sine', 523, 330, 0.2, 0.45, 0.03); tone(o, 0, 'sine', 262, 165, 0.2, 0.15, 0.03); });

    // Discovery, "Do you want to go here?": the nicest sound in the game. A sparkly rising
    // arpeggio of bells over a soft warm chord, with a faint glitter at the top.
    add('chime', 1.5, 0.55, o => {
        held(o, 0, 'sine', 261.63, 261.63, 0.5, 0.12, 0.12, 0.8);
        held(o, 0, 'sine', 392, 392, 0.5, 0.09, 0.12, 0.8);
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            const t = i * 0.12;
            tone(o, t, 'sine', f, f, 1.1 - i * 0.1, 0.42, 0.006);
            tone(o, t, 'sine', f * 2, f * 2, 0.35, 0.05, 0.006);
            tone(o, t, 'sine', f * 3, f * 3, 0.15, 0.015, 0.006);
        });
        [[0.42, 2093], [0.5, 2637], [0.58, 3136]].forEach(s => tone(o, s[0], 'sine', s[1], s[1], 0.4, 0.035, 0.01));
    });

    // Menu music next: it is the first loop anyone hears.
    const N = {
        C2: 65.41, D2: 73.42, E2: 82.41, G2: 98, A2: 110,
        C3: 130.81, D3: 146.83, E3: 164.81, G3: 196, A3: 220,
        C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440,
        C5: 523.25, D5: 587.33, E5: 659.25
    };

    /** A slow, warm chord: each note two gently beating sines and a faint octave. */
    function pad(o, t0, notes, dur, level, attack, release, shimmer) {
        attack = attack || 2.6; release = release || 3.4;
        notes.forEach(function (n, i) {
            const f = N[n], l = (level || 1) * 0.3 / (1 + i * 0.25);
            held(o, t0, 'sine', f, f, dur, l, attack, release);
            held(o, t0, 'sine', f * 1.0025, f * 1.0025, dur, l * 0.7, attack * 1.1, release);
            held(o, t0, 'sine', f * 2, f * 2, dur, l * 0.07, attack, release);
            if (shimmer) {
                // A third, wider-detuned voice and a beating octave: a slow glistening shimmer.
                held(o, t0, 'sine', f * 0.9962, f * 0.9962, dur, l * 0.55, attack * 1.2, release);
                held(o, t0, 'sine', f * 2.006, f * 2.006, dur, l * 0.06, attack * 1.3, release);
            }
        });
    }

    /** A soft mallet note (marimba or kalimba): round, no click, dying away. */
    function mallet(o, t, n, level, decay) {
        const f = N[n];
        decay = decay || 1.6;
        tone(o, t, 'sine', f, f, decay, 0.5 * (level || 1), 0.012);
        tone(o, t, 'sine', f * 2, f * 2, decay * 0.3, 0.05 * (level || 1), 0.012);
        tone(o, t, 'sine', f * 0.5, f * 0.5, decay * 0.6, 0.12 * (level || 1), 0.02);
    }

    /** A soft flute-like note: slow to start, a slow gentle waver. */
    function flute(o, t, n, dur, level) {
        const f = N[n];
        held(o, t, 'sine', f, f, dur, 0.34 * (level || 1), 0.35, 0.7, { depth: 0.0035, rate: 4.2 });
        held(o, t, 'sine', f * 2, f * 2, dur, 0.03 * (level || 1), 0.4, 0.6);
    }

    /** A soft low bell for the music: lower partials only. */
    function softBell(o, t, n, level) {
        const f = N[n];
        [[1, 0.5, 2.8], [2, 0.14, 1.6], [3, 0.04, 0.9]].forEach(p => tone(o, t, 'sine', f * p[0], f * p[0], p[2], p[1] * level, 0.01));
    }

    /** Lay chords end to end across a loop of `L` seconds (they wrap round its end). */
    function chords(o, L, list, level, shimmer) {
        const each = L / list.length;
        list.forEach((c, i) => pad(o, i * each, c, each + 0.8, level, shimmer ? 3.6 : 2.6, shimmer ? 4.4 : 3.4, shimmer));
    }

    /** Notes [[time, note], ...] on an instrument. */
    function tune(o, notes, play) { notes.forEach(n => play(o, n[0], n[1])); }

    const AL = 24;   // music loop length in seconds

    addMusic('amb-menu', AL, 0.19, o => {
        chords(o, AL, [['C3', 'G3', 'E4'], ['A2', 'E3', 'C4'], ['D3', 'A3', 'E4'], ['G2', 'D3', 'G3']], 0.9);
        tune(o, [[1.0, 'E4'], [2.5, 'G4'], [4.0, 'A4'], [7.0, 'G4'], [10.0, 'E4'], [13.0, 'D4'], [14.5, 'E4'], [16.0, 'G4'], [19.0, 'C4'], [21.5, 'D4']],
            (o2, t, n) => mallet(o2, t, n, 0.45, 2.0));
    });

    // The rest of the one-shots.
    // The warp: a building rise, a deep soft boom-swell at the jump, a shimmering tail.
    add('warp', 4.4, 0.72, o => {
        held(o, 0, 'sine', 110, 440, 2.6, 0.32, 2.3, 0.25);
        held(o, 0, 'sine', 165, 660, 2.6, 0.16, 2.4, 0.25);
        held(o, 0.4, 'triangle', 220, 880, 2.2, 0.035, 2.0, 0.2);
        swell(o, 0, 2.5, 0.5, 'lowpass', 180, 1300, 400, 0.5, 0.8);
        // the jump
        tone(o, 2.6, 'sine', 92, 36, 1.5, 0.95, 0.045);
        tone(o, 2.6, 'sine', 184, 72, 0.6, 0.25, 0.04);
        swell(o, 2.55, 0.12, 1.1, 'lowpass', 500, 260, 90, 0.7, 0.7);
        // shimmering tail: a bright chord that glistens as it fades
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            const l = 0.11 / (1 + i * 0.3);
            held(o, 2.7 + i * 0.05, 'sine', f, f, 0.5, l, 0.18, 1.1);
            held(o, 2.7 + i * 0.05, 'sine', f * 1.006, f * 1.006, 0.5, l * 0.8, 0.22, 1.1);
        });
    });
    // Settled into orbit: a soft major chord blooming.
    add('arrive', 1.7, 0.42, o => {
        [['C3', 0.3], ['G3', 0.26], ['C4', 0.28], ['E4', 0.24], ['G4', 0.18]].forEach((p, i) => {
            const f = N[p[0]];
            held(o, i * 0.04, 'sine', f, f, 0.45, p[1], 0.28, 0.95);
            held(o, i * 0.04, 'sine', f * 1.003, f * 1.003, 0.45, p[1] * 0.6, 0.32, 0.95);
        });
        bell(o, 0.25, 783.99, 0.25, 1.1);
    });
    // The scanner: a gentle rising sine sweep and a soft ping.
    add('scan', 1.0, 0.32, o => {
        held(o, 0, 'sine', 300, 900, 0.55, 0.4, 0.15, 0.15);
        held(o, 0, 'sine', 150, 450, 0.55, 0.12, 0.15, 0.15);
        bell(o, 0.66, 1046.5, 0.45, 0.32);
    });
    add('log', 1.2, 0.34, o => { bell(o, 0, 392, 0.8, 0.9); bell(o, 0.18, 523.25, 0.7, 0.95); });
    // An incoming alien call: a friendly soft ding-dong, twice.
    add('hail', 1.1, 0.4, o => {
        [[0, 659.25], [0.2, 523.25], [0.5, 659.25], [0.7, 523.25]].forEach(n => {
            tone(o, n[0], 'sine', n[1], n[1], 0.38, 0.45, 0.01);
            tone(o, n[0], 'sine', n[1] * 2, n[1] * 2, 0.12, 0.05, 0.01);
            tone(o, n[0], 'sine', n[1] * 0.5, n[1] * 0.5, 0.25, 0.1, 0.015);
        });
    });
    // Alien babble: three of each, all different every time the game loads.
    ['friendly', 'curious', 'grumpy'].forEach(m => { for (let v = 0; v < 3; v++) add('alien-' + m, 2.0, 0.5, o => babble(o, m)); });
    for (let v = 0; v < 3; v++) add('alien-loud', 2.0, 0.72, o => babble(o, 'loud'));
    // Little alien ships zipping past: a soft doppler hum and whoosh.
    for (let v = 0; v < 2; v++) add('flyby', 1.3, 0.4, o => {
        const c = rand(0.55, 0.65), hi = rand(480, 560), lo = rand(260, 320), n = Math.floor(1.25 * SR);
        let ph = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const f = lo + (hi - lo) / (1 + Math.exp((t - c) * 9));
            ph += f / SR; ph -= Math.floor(ph);
            const e = Math.exp(-Math.pow((t - c) / 0.28, 2));
            o[i] += (Math.sin(TAU * ph) * 0.3 + Math.sin(TAU * ph * 2) * 0.06) * e;
        }
        swell(o, c - 0.5, 0.5, 0.6, 'bandpass', 380, 900, 260, 0.55, 1.2);
    });
    // Something new for the Field Guide: three small bells stepping up over a soft low note.
    add('find', 1.3, 0.4, o => {
        held(o, 0, 'sine', 392, 392, 0.3, 0.08, 0.1, 0.7);
        bell(o, 0.02, 659.25, 0.55, 0.9);
        bell(o, 0.14, 783.99, 0.5, 0.95);
        bell(o, 0.26, 1046.5, 0.42, 1.0);
    });
    // A rare find: a slow glistening shimmer, a long rising run of bells over a warm chord, and a
    // faint sparkle on top. Bigger than the field-guide bells, gentler than the discovery chime.
    add('rare', 2.8, 0.52, o => {
        [['C3', 0.2], ['G3', 0.16], ['E4', 0.12]].forEach(p => {
            const f = N[p[0]];
            held(o, 0, 'sine', f, f, 1.2, p[1], 0.5, 1.3);
            held(o, 0, 'sine', f * 1.004, f * 1.004, 1.2, p[1] * 0.7, 0.6, 1.3);
        });
        [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66].forEach((f, i) => bell(o, 0.1 + i * 0.13, f, 0.36 - i * 0.02, 1.3));
        [[1.05, 2093], [1.17, 2349.3], [1.29, 2637], [1.41, 3136]].forEach(s => tone(o, s[0], 'sine', s[1], s[1], 0.5, 0.025, 0.012));
    });
    // Star whales singing: long, low gliding calls with a slow waver, far away and soft.
    for (let v = 0; v < 2; v++) add('whale', 4.4, 0.34, o => {
        const a = rand(150, 175), b = rand(230, 270), c = rand(120, 140);
        held(o, 0, 'sine', a, b, 1.5, 0.42, 0.7, 1.1, { depth: 0.012, rate: rand(2.4, 3.2) });
        held(o, 0, 'sine', a * 2, b * 2, 1.5, 0.05, 0.8, 1.0);
        held(o, 1.9, 'sine', b, c, 1.3, 0.36, 0.6, 1.0, { depth: 0.015, rate: rand(2, 2.8) });
        held(o, 1.9, 'sine', b * 1.5, c * 1.5, 1.3, 0.04, 0.7, 0.9);
    });

    // The music: each kind of star its own character, all calm, all on C D E G A.
    // Yellow sun: warm and bright-ish, a kalimba strolling over warm chords.
    addMusic('amb-yellow', AL, 0.19, o => {
        chords(o, AL, [['C3', 'E3', 'G3', 'D4'], ['A2', 'E3', 'C4'], ['G2', 'D3', 'G3', 'E4'], ['C3', 'G3', 'A3']], 0.9);
        tune(o, [[0.6, 'G4'], [1.8, 'A4'], [3.0, 'G4'], [6.6, 'E4'], [7.8, 'D4'], [9.0, 'E4'], [12.6, 'C5'], [13.8, 'A4'], [15.0, 'G4'], [18.6, 'E4'], [19.8, 'G4'], [21.0, 'D4']],
            (o2, t, n) => mallet(o2, t, n, 0.42, 1.8));
    });
    // Orange star: warm and mellow, a slow flute.
    addMusic('amb-orange', AL, 0.18, o => {
        chords(o, AL, [['A2', 'E3', 'C4'], ['D3', 'A3', 'E4'], ['C3', 'G3', 'E4'], ['G2', 'D3', 'A3']], 0.9);
        tune(o, [[1.5, 'E4'], [4.0, 'D4'], [7.5, 'C4'], [10.0, 'A3'], [13.5, 'D4'], [16.0, 'E4'], [19.5, 'G4']], (o2, t, n) => flute(o2, t, n, 2.0, 0.7));
    });
    // Red dwarf: slow, low and warm, two long chords over a soft bass.
    addMusic('amb-red', AL, 0.18, o => {
        pad(o, 0, ['A2'], AL - 2, 0.5, 5, 5);
        chords(o, AL, [['A2', 'E3', 'C4'], ['G2', 'D3', 'A3']], 1.0);
        tune(o, [[3.0, 'A3'], [9.0, 'C4'], [15.0, 'G3'], [21.0, 'E3']], (o2, t, n) => mallet(o2, t, n, 0.5, 2.6));
    });
    // Blue giant: airy, higher pads and slow high droplets.
    addMusic('amb-blue', AL, 0.17, o => {
        chords(o, AL, [['A3', 'D4', 'G4'], ['C4', 'E4', 'A4'], ['G3', 'D4', 'A4'], ['E3', 'A3', 'E4']], 0.75);
        tune(o, [[2.0, 'D5'], [5.0, 'A4'], [8.0, 'C5'], [11.0, 'G4'], [14.0, 'E5'], [17.0, 'D5'], [20.0, 'A4']], (o2, t, n) => mallet(o2, t, n, 0.3, 2.6));
    });
    // White dwarf: still and crisp, a quiet chord and a few soft bells.
    addMusic('amb-white', AL, 0.17, o => {
        chords(o, AL, [['C3', 'G3', 'D4'], ['A2', 'E3', 'G3'], ['C3', 'G3', 'E4']], 0.75);
        tune(o, [[1.0, 'G4'], [7.0, 'E4'], [13.0, 'C5'], [19.0, 'D4']], (o2, t, n) => softBell(o2, t, n, 0.4));
    });
    // Binary pair: two gentle voices circling each other, one every 1.5 s, one every 2 s.
    addMusic('amb-binary', AL, 0.18, o => {
        chords(o, AL, [['C3', 'G3', 'E4'], ['A2', 'E3', 'D4']], 0.8);
        for (let k = 0; k < 16; k++) mallet(o, k * 1.5 + 0.2, k % 2 ? 'D4' : 'G3', 0.26, 1.4);
        const ring = ['C4', 'A3', 'E4'];
        for (let k = 0; k < 12; k++) mallet(o, k * 2 + 0.95, ring[k % 3], 0.17, 1.6);
    });
    // Nebula: shimmering soft pads, slow to swell, with a few glints.
    addMusic('amb-nebula', AL, 0.17, o => {
        chords(o, AL, [['C3', 'G3', 'E4', 'A4'], ['A2', 'E3', 'G3', 'D4'], ['D3', 'A3', 'E4', 'G4'], ['G2', 'D3', 'A3', 'C4']], 0.75, true);
        tune(o, [[3.0, 'E5'], [11.0, 'D5'], [19.0, 'G4']], (o2, t, n) => mallet(o2, t, n, 0.22, 3.0));
    });
    // Black hole: very low, slow drones and a rare deep note.
    addMusic('amb-blackhole', AL, 0.18, o => {
        pad(o, 0, ['C2', 'G2', 'C3'], AL - 3, 1.0, 6, 6);
        pad(o, AL / 2, ['G2', 'D3'], AL / 2, 0.5, 6, 6);
        tune(o, [[7.0, 'C3'], [19.0, 'G2']], (o2, t, n) => mallet(o2, t, n, 0.6, 4.0));
    });
    // Deep space between systems: sparse and spacious.
    addMusic('amb-deep', AL, 0.16, o => {
        pad(o, 0, ['C3', 'G3', 'D4'], AL / 2 + 2, 0.7, 5, 6);
        pad(o, AL / 2, ['A2', 'E3', 'G3'], AL / 2 + 2, 0.7, 5, 6);
        tune(o, [[2.5, 'E4'], [9.0, 'A3'], [15.5, 'D4'], [20.0, 'G3']], (o2, t, n) => mallet(o2, t, n, 0.38, 3.0));
    });
    // Skimming a planet: gentle, with a soft rolling marimba figure for a sense of motion.
    addMusic('amb-surface', AL, 0.18, o => {
        chords(o, AL, [['C3', 'G3', 'E4'], ['A2', 'E3', 'C4'], ['G2', 'D3', 'A3'], ['C3', 'E3', 'G3']], 0.8);
        const figs = [['C4', 'E4', 'G4', 'E4'], ['A3', 'C4', 'E4', 'C4'], ['G3', 'A3', 'D4', 'A3'], ['C4', 'D4', 'E4', 'G4']];
        for (let s = 0; s < 32; s++) mallet(o, s * 0.75 + 0.1, figs[Math.floor(s / 8)][s % 4], s % 4 === 0 ? 0.26 : 0.19, 0.9);
    });

    const NAMES = [];
    RECIPES.forEach(r => { if (!r.loop && NAMES.indexOf(r.name) < 0) NAMES.push(r.name); });
    const MUSIC = RECIPES.filter(r => r.loop).map(r => r.name);

    // --- background rendering, a little at a time --------------------------------------------

    const done = new Array(RECIPES.length).fill(false);
    let built = 0, started = false, renderMs = 0, target = null;

    /** The next recipe: the requested music first if it is still waiting, else in order. */
    function nextRecipe() {
        if (target) {
            const i = RECIPES.findIndex((r, k) => !done[k] && r.loop && r.name === target);
            if (i >= 0) return i;
        }
        return done.indexOf(false);
    }

    function renderSome() {
        const t0 = now(), until = t0 + 12;
        let heavy = false;
        while (built < RECIPES.length && now() < until && !heavy) {
            const k = nextRecipe();
            if (k < 0) break;
            const r = RECIPES[k];
            done[k] = true; built++;
            try {
                const out = buffer(r.seconds);
                r.draw(out);
                if (r.loop) {
                    const res = wrapLoop(out, r.period, r.target);
                    loopUrls[r.name] = { url: toWavUrl(res), seconds: res.length / SR };
                    heavy = true;   // a loop is a big job: give the page a frame before the next
                    continue;
                }
                const id = 'nse-' + r.name + '-' + k;
                if (window.SafeAudio) {
                    window.SafeAudio.preload(id, toWavUrl(finish(out, r.target)));
                    (ready[r.name] = ready[r.name] || []).push(id);
                }
            } catch (e) { console.warn('[NSE] Could not build sound', r.name, e); }
        }
        renderMs += now() - t0;
        if (built < RECIPES.length) setTimeout(renderSome, heavy ? 30 : 0);
    }

    // --- playing ---------------------------------------------------------------------------

    function S() { return window.NSE && NSE.Settings; }
    function master() { try { const s = S(); return s && s.get ? s.get('sound') !== false : true; } catch (e) { return true; } }
    function fxVol() { try { const s = S(); return s && s.volume ? clamp01(s.volume()) : 0.7; } catch (e) { return 0.7; } }
    function musVol() { try { const s = S(); return s && s.musicVolume ? clamp01(s.musicVolume()) : 0.5; } catch (e) { return 0.5; } }
    function hubAudioOn() { const A = window.SafeAudio; return !!A && (!A.isEnabled || A.isEnabled()); }

    const lastPick = {};
    function play(name, gain) {
        if (!master() || !hubAudioOn()) return false;
        const list = ready[name];
        if (!list || !list.length) return false;
        const lv = clamp01(fxVol() * (gain === undefined ? 1 : gain));
        if (lv <= 0.01) return false;
        // A random variant, never the same one twice running.
        let id = pick(list);
        if (list.length > 1 && id === lastPick[name]) id = list[(list.indexOf(id) + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length];
        lastPick[name] = id;
        try { window.SafeAudio.play(id, lv); } catch (e) { return false; }
        return true;
    }

    // --- music: two elements per loop crossfading at the join, loops crossfading each other ----

    const XF = LOOP_XF;        // the join crossfade inside one loop
    const FADE = 3;            // seconds to crossfade from one music loop to the next
    const MUSIC_LEVEL = 0.85;  // music sits a little under the effects
    const loops = {};

    function loop(name) {
        if (loops[name]) return loops[name];
        const src = loopUrls[name];
        if (!src || typeof Audio === 'undefined') return null;
        const els = [new Audio(src.url), new Audio(src.url)];
        els.forEach(a => { a.preload = 'auto'; a.volume = 0; });
        return (loops[name] = { els: els, cur: 0, playing: false, vol: 0, gain: 0, seconds: src.seconds, retry: 0 });
    }

    function stopLoop(L) {
        L.els.forEach(a => { try { a.pause(); a.volume = 0; } catch (e) { /* ignore */ } });
        L.playing = false;
    }

    function start(a) {
        try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    }

    function stepLoop(L, dt, level) {
        const step = dt / FADE;
        L.vol = L.vol < L.gain ? Math.min(L.gain, L.vol + step) : Math.max(L.gain, L.vol - step);
        // Equal-power: the loop fading in and the one fading out add up to a steady level.
        const v = clamp01(Math.sin(L.vol * Math.PI / 2) * level);
        if (v < 0.003) { if (L.playing) stopLoop(L); return; }
        const a = L.els[L.cur], b = L.els[1 - L.cur];
        if (!L.playing) { L.playing = true; L.retry = 1; start(a); }
        else if (a.paused && b.paused) {
            // play() can be refused before the first key press: try again now and then.
            L.retry -= dt;
            if (L.retry <= 0) { L.retry = 1; start(a); }
        }
        const left = L.seconds - (a.currentTime || 0);
        if (left < XF && b.paused) start(b);
        const k = left < XF ? Math.max(0, left / XF) : 1;
        if (left <= 0.02 || a.ended) {
            L.cur = 1 - L.cur;
            try { a.pause(); a.volume = 0; b.volume = v; } catch (e) { /* ignore */ }
            return;
        }
        try { a.volume = v * k; if (!b.paused) b.volume = v * (1 - k); } catch (e) { /* ignore */ }
    }

    return {
        /** Start building every sound in the background (UI sounds and menu music first). */
        init: function () {
            if (started) return;
            started = true;
            renderSome();
        },
        play: play,
        blip: function () { return play('blip', 0.6); },
        choose: function () { return play('choose', 0.7); },
        /** A short sound to try the effects volume with in Settings. */
        sample: function () { return play('log', 0.9) || play('choose', 0.9); },
        /** Which music should be playing (null = none): crossfades over ~3 s, waits if not built yet. */
        setMusic: function (name) {
            if (name && MUSIC.indexOf(name) < 0) { console.warn('[NSE] No music called', name); return false; }
            target = name || null;
            return true;
        },
        music: function () { return target; },
        /** Call every frame: steps the crossfades and follows the music volume and Sound on/off live. */
        update: function (dt) {
            dt = Math.max(0, Math.min(0.25, +dt || 0));
            const level = master() ? musVol() * MUSIC_LEVEL : 0;
            if (target) loop(target);   // starts it as soon as it has been built
            Object.keys(loops).forEach(function (n) {
                const L = loops[n];
                L.gain = n === target ? 1 : 0;
                stepLoop(L, dt, level);
            });
        },
        /** Stop everything at once (leaving the game). */
        silence: function () {
            target = null;
            Object.keys(loops).forEach(n => { loops[n].gain = 0; loops[n].vol = 0; stopLoop(loops[n]); });
            if (window.SafeAudio && window.SafeAudio.stop) Object.keys(ready).forEach(n => ready[n].forEach(id => { try { window.SafeAudio.stop(id); } catch (e) { /* ignore */ } }));
        },
        status: function () {
            return {
                built: built, total: RECIPES.length, renderMs: Math.round(renderMs),
                sounds: Object.keys(ready), loops: Object.keys(loopUrls), music: target,
                playing: Object.keys(loops).filter(n => loops[n].playing).map(n => ({ name: n, vol: +loops[n].vol.toFixed(3) }))
            };
        },
        NAMES: NAMES,
        MUSIC: MUSIC,
        /** For tests: draw every recipe into Float32 buffers (no audio elements). */
        _render: function () {
            return RECIPES.map(r => {
                const out = buffer(r.seconds);
                r.draw(out);
                const samples = r.loop ? wrapLoop(out, r.period, r.target) : finish(out, r.target);
                return { name: r.name, family: r.name, loop: !!r.loop, wrap: !!r.loop, xf: LOOP_XF, period: r.period || 0, samples: samples };
            });
        },
        _rate: SR
    };
})();
