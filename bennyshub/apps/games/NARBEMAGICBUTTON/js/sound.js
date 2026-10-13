/**
 * NARBE Magic Button - sound effects and speech.
 *
 * NO WEB AUDIO. An AudioContext can take down the renderer in the hub's
 * Electron desktop build (ACCESSIBILITY.md section 5), so every effect is
 * synthesised here, sample by sample, into a small WAV file in memory and
 * played through the hub's SafeAudio, which uses plain <audio> elements.
 *
 * Variety is baked in: every effect has several recordings, each rendered
 * with its own pitch, length and texture, and a fresh one is picked on every
 * press so a hundred presses in a row never sound like one sound on repeat.
 *
 * Rendering happens in small slices after boot, so nothing blocks the menu.
 */

window.NMB = window.NMB || {};

NMB.Sound = (function () {
    'use strict';

    const SR = 24000;
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = a => a[Math.floor(Math.random() * a.length)];

    // A major pentatonic, two octaves and a bit: nothing in it can clash.
    const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
    const SPARKLE = [1567.98, 1760, 2093, 2349.32, 2637.02, 3135.96];

    const ready = {};          // family -> list of SafeAudio names that have loaded
    const urls = {};           // family -> one of its recordings, for the automated test
    let lastPop = 0;

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

    /**
     * One oscillator voice. `vib` adds a wobble (depth as a fraction of the
     * pitch, rate in Hz) for whistles and bloops. An f1 of 0 means no glide.
     */
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

    /** Filtered noise with a cutoff that glides from f0 to f1. */
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
        // A few milliseconds of fade at the very end so nothing clicks.
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

    // --- fireworks -------------------------------------------------------------

    function whoosh(out) {
        noise(out, 0, rand(0.42, 0.55), 'bandpass', rand(300, 500), rand(2000, 2900), 0.22, 0.03);
        const f = rand(520, 680);
        tone(out, 0, 'triangle', f, f * rand(1.7, 2), 0.45, 0.04, 0.03);
    }

    function whistle(out) {
        noise(out, 0, 0.5, 'bandpass', 500, 1800, 0.08, 0.03);
        const f = rand(800, 1100);
        tone(out, 0, 'sine', f, f * rand(2.2, 2.8), 0.5, 0.12, 0.04, { depth: 0.035, rate: rand(16, 24) });
    }

    function boom(out, t, size) {
        size = size || 1;
        noise(out, t, rand(1.3, 2) * size, 'lowpass', rand(1100, 1800), rand(70, 110), 0.9 * size, 0.004);
        const f = rand(95, 130);
        tone(out, t, 'sine', f, f * rand(0.32, 0.42), rand(0.55, 0.8), 0.8 * size, 0.004);
    }

    function crackle(out, t, count, spread) {
        for (let i = 0; i < count; i++) {
            noise(out, t + Math.random() * spread, rand(0.02, 0.045), 'highpass', rand(2600, 3400), rand(4200, 5600),
                rand(0.08, 0.18), 0.002);
        }
    }

    /** A mortar thump: the low thud of the shell leaving the tube, then a hiss. */
    function thump(out) {
        noise(out, 0, 0.12, 'lowpass', 520, 120, 0.55, 0.003);
        tone(out, 0, 'sine', rand(70, 85), 42, 0.16, 0.5, 0.003);
        noise(out, 0.04, 0.42, 'bandpass', 1400, 3200, 0.07, 0.05);
    }

    /**
     * What each firework sounds like when it bursts: a boom, plus an accent
     * that suits its look. Always firework sounds - crackles, pops, hisses,
     * whistles and glittery sizzles - with only the shapes for little ones
     * getting a soft sparkle of bells on top.
     */
    const BURSTS = {
        peony: ['boom', 'echo'],
        ring: ['boom', 'echo'],
        double: ['boom', 'salute'],
        willow: ['boom', 'hiss'],
        multi: ['boom', 'crackle'],
        crossette: ['boom', 'pops'],
        palm: ['boom', 'crackle-short'],
        spiral: ['boom', 'whirl'],
        strobe: ['boom-soft', 'sizzle'],
        chrys: ['boom-big', 'hiss'],
        ghost: ['boom', 'shimmer'],
        heart: ['boom-soft', 'sparkle'],
        star: ['boom-soft', 'sparkle'],
        smiley: ['boom-soft', 'shimmer'],
        paw: ['boom-soft', 'pops'],
        flower: ['boom-soft', 'sparkle'],
        butterfly: ['boom-soft', 'flutter'],
        planet: ['boom-big', 'echo'],
        crescent: ['boom-soft', 'shimmer'],
        snowflake: ['boom-soft', 'tinkle'],
        rainbow: ['boom-soft', 'shimmer'],
        balloon: ['boom-soft', 'crackle-short'],
        word: ['boom-big', 'crackle']
    };

    const ACCENTS = {
        crackle(out) { crackle(out, 0.25, 34, 1.5); },
        'crackle-short'(out) { crackle(out, 0.3, 18, 0.8); },
        echo(out) {
            // The boom coming back off the buildings.
            noise(out, rand(0.32, 0.4), 1.1, 'lowpass', 600, 80, 0.4, 0.01);
            noise(out, rand(0.7, 0.8), 0.9, 'lowpass', 400, 70, 0.18, 0.01);
        },
        salute(out) { boom(out, rand(0.12, 0.16), 0.8); },
        pops(out) {
            const n = Math.floor(rand(4, 7));
            for (let i = 0; i < n; i++) {
                const t = 0.32 + i * rand(0.07, 0.12);
                noise(out, t, 0.18, 'lowpass', 2400, 300, 0.4, 0.003);
                const f = rand(260, 420);
                tone(out, t, 'sine', f, f * 0.5, 0.15, 0.25, 0.003);
            }
        },
        hiss(out) {
            noise(out, 0.1, 2.3, 'bandpass', 4200, 1500, 0.16, 0.25, 0.8);
            crackle(out, 0.6, 10, 1.6);
        },
        sizzle(out) {
            // Glitter: a soft hiss under lots of tiny ticks.
            noise(out, 0.15, 2.6, 'highpass', 4000, 6000, 0.035, 0.3);
            let t = 0.15;
            for (let i = 0; i < 70 && t < 2.9; i++) {
                noise(out, t, 0.012, 'highpass', 5000, 7000, rand(0.05, 0.13), 0.001);
                t += rand(0.025, 0.05);
            }
        },
        whirl(out) {
            // A spinning whistle, like a pinwheel firework.
            const f = rand(1300, 1600);
            tone(out, 0.05, 'sine', f, f * 0.55, 1.4, 0.18, 0.06, { depth: 0.06, rate: rand(8, 11) });
            tone(out, 0.05, 'sine', f * 2, f * 1.1, 1.2, 0.04, 0.06, { depth: 0.06, rate: rand(8, 11) });
        },
        flutter(out) {
            // Lots of soft little pops, like wings.
            let t = 0.2;
            for (let i = 0; i < 14; i++) {
                noise(out, t, 0.045, 'lowpass', 1300, 300, rand(0.12, 0.2), 0.002);
                t += rand(0.05, 0.09);
            }
        },
        sparkle(out) {
            const start = Math.floor(rand(0, 3)), up = Math.random() < 0.5;
            for (let i = 0; i < 6; i++) {
                const f = SPARKLE[up ? (start + i) % SPARKLE.length : (start + 5 - i) % SPARKLE.length];
                tone(out, 0.12 + i * 0.09, 'sine', f, f, 0.6, 0.09);
            }
            crackle(out, 0.3, 8, 0.9);
        },
        shimmer(out) {
            const step = Math.random() < 0.5 ? 1 : 2;
            for (let i = 0; i * step < NOTES.length; i++) {
                const f = NOTES[i * step] * 2;
                tone(out, 0.1 + i * 0.07, 'sine', f, f, 0.6, 0.08);
            }
            noise(out, 0.1, 1.1, 'highpass', 5000, 7000, 0.025, 0.2);
        },
        tinkle(out) {
            // Icy, high and light, for snowflakes.
            let t = 0.12;
            for (let i = 0; i < 9; i++) {
                const f = rand(2600, 4200);
                tone(out, t, 'sine', f, f, 0.25, 0.08, 0.002);
                t += rand(0.06, 0.12);
            }
        }
    };

    // --- bubbles ---------------------------------------------------------------

    /** The whale's spout: a puff of water, then a bubbly gurgle. */
    function blow(out) {
        noise(out, 0, 0.22, 'bandpass', rand(500, 700), rand(1800, 2400), 0.16, 0.02);
        noise(out, 0.05, 0.35, 'lowpass', 600, 200, 0.12, 0.05);
        const n = Math.floor(rand(4, 8));
        let t = 0.04;
        for (let i = 0; i < n; i++) {
            const f = rand(240, 420) * (1 + i * rand(0.12, 0.3));
            tone(out, t, 'sine', f, f * rand(1.8, 2.6), rand(0.07, 0.13), 0.22, 0.004, { depth: 0.04, rate: 30 });
            t += rand(0.04, 0.09);
        }
    }

    /**
     * Musical pops: every pop is a note from this gentle scale, low notes for
     * big bubbles and high ones for small. Three textures keep it from
     * sounding the same twice running.
     */
    const POP_NOTES = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
    const POPS = {
        soft(out, f) {
            tone(out, 0, 'sine', f, f * 1.12, 0.09, 0.3, 0.002);
            tone(out, 0, 'sine', f * 2, f * 2.1, 0.04, 0.06, 0.002);
            noise(out, 0, 0.015, 'highpass', 2500, 4000, 0.05, 0.001);
        },
        squeaky(out, f) {
            tone(out, 0, 'sine', f * 0.94, f * 1.16, 0.12, 0.28, 0.003, { depth: 0.025, rate: 38 });
            tone(out, 0, 'triangle', f * 2, f * 2.3, 0.05, 0.05, 0.003);
        },
        bloop(out, f) {
            tone(out, 0, 'sine', f * 0.5, f, 0.16, 0.34, 0.004, { depth: 0.03, rate: 22 });
            noise(out, 0, 0.04, 'bandpass', 700, 1400, 0.06, 0.002);
        }
    };

    function drip(out) {
        const f = rand(900, 1300);
        tone(out, 0, 'sine', f, f * 2, 0.04, 0.25, 0.002);
        tone(out, 0.035, 'sine', f * 1.8, f * 1.8, 0.14, 0.12, 0.002);
    }

    function splash(out) {
        noise(out, 0, 0.3, 'bandpass', 900, 3200, 0.3, 0.008);
        noise(out, 0, 0.12, 'lowpass', 800, 200, 0.25, 0.004);
        for (let i = 0; i < 4; i++) { const f = rand(1100, 2000); tone(out, 0.08 + i * rand(0.05, 0.09), 'sine', f, f * 1.6, 0.05, 0.1, 0.002); }
    }

    /** The giant bubble stretching, rubbery and wobbly, just before it goes. */
    function stretch(out) {
        tone(out, 0, 'triangle', 150, 260, 0.75, 0.3, 0.12, { depth: 0.08, rate: 7 });
        tone(out, 0, 'sine', 300, 520, 0.7, 0.08, 0.12, { depth: 0.08, rate: 7 });
    }

    function giantPop(out) {
        tone(out, 0, 'sine', 110, 340, 0.3, 0.6, 0.004, { depth: 0.03, rate: 18 });
        noise(out, 0, 0.25, 'lowpass', 1600, 200, 0.45, 0.003);
        splash(out);
        // The shower of little bubbles: a run of tiny rising pops.
        for (let i = 0; i < 9; i++) {
            const f = POP_NOTES[Math.min(8, 3 + Math.floor(i * 0.7))] * rand(0.98, 1.02);
            tone(out, 0.18 + i * rand(0.06, 0.09), 'sine', f, f * 1.12, 0.08, 0.12, 0.002);
        }
    }

    function merge(out) {
        tone(out, 0, 'sine', 230, 330, 0.22, 0.32, 0.01, { depth: 0.05, rate: 12 });
        tone(out, 0.02, 'sine', 460, 520, 0.1, 0.06, 0.01);
    }

    // --- flowers ---------------------------------------------------------------

    /**
     * Each kind of flower has its own instrument; the notes still climb the
     * scale as the garden fills.
     */
    const TIMBRES = {
        bell(out, t, f) { tone(out, t, 'triangle', f, f, 1.4, 0.22); tone(out, t, 'sine', f * 2, f * 2, 0.9, 0.07); },
        xylo(out, t, f) {
            tone(out, t, 'sine', f * 2, f * 2, 0.45, 0.3, 0.002);
            tone(out, t, 'sine', f * 7.8, f * 7.8, 0.06, 0.07, 0.001);
            noise(out, t, 0.02, 'bandpass', f * 4, f * 4, 0.05, 0.001);
        },
        horn(out, t, f) {
            const h = f * 0.5;
            tone(out, t, 'sine', h, h, 0.9, 0.26, 0.07, { depth: 0.006, rate: 5 });
            tone(out, t, 'sine', h * 2, h * 2, 0.8, 0.09, 0.08);
            tone(out, t, 'sine', h * 3, h * 3, 0.6, 0.04, 0.09);
        },
        marimba(out, t, f) { tone(out, t, 'sine', f, f, 0.55, 0.3, 0.003); tone(out, t, 'sine', f * 4, f * 4, 0.12, 0.08, 0.002); },
        musicbox(out, t, f) { tone(out, t, 'sine', f * 2, f * 2, 1.0, 0.22, 0.002); tone(out, t, 'sine', f * 5.4, f * 5.4, 0.3, 0.05, 0.002); }
    };
    const FLOWER_INSTRUMENT = { tulip: 'bell', daisy: 'xylo', sunflower: 'horn', giant: 'horn', lollipop: 'marimba', classic: 'musicbox' };

    /** A mushroom popping up: a soft, springy boing. */
    function boing(out) {
        tone(out, 0.05, 'sine', 180, 420, 0.35, 0.3, 0.01, { depth: 0.06, rate: 16 });
        tone(out, 0.05, 'triangle', 360, 700, 0.2, 0.06, 0.01);
        for (let i = 0; i < 3; i++) tone(out, 0.36 + i * 0.05, 'sine', pick(SPARKLE), 0, 0.2, 0.03);
    }

    /** The big finish: a strummed chord, or a short happy jingle. */
    function chord(out) {
        [0, 2, 4, 5, 7].forEach((n, i) => {
            const f = NOTES[n];
            tone(out, i * 0.06, 'triangle', f, f, 1.6, 0.16);
            tone(out, i * 0.06, 'sine', f * 2, f * 2, 1.0, 0.06);
        });
        for (let i = 0; i < 5; i++) tone(out, 0.5 + i * 0.08, 'sine', SPARKLE[i], 0, 0.4, 0.04);
    }
    function jingle(out, tune) {
        tune.forEach((n, i) => {
            const f = NOTES[n];
            tone(out, i * 0.13, 'sine', f, f, 0.3, 0.28, 0.003);
            tone(out, i * 0.13, 'sine', f * 4, f * 4, 0.08, 0.06, 0.002);
        });
        const end = tune.length * 0.13;
        [0, 2, 5].forEach(n => tone(out, end, 'triangle', NOTES[n] * 2, 0, 0.9, 0.12));
    }

    /** A bunny's hop: a little soft thump and spring. */
    function hop(out) {
        tone(out, 0, 'sine', rand(150, 190), rand(300, 360), 0.12, 0.25, 0.005);
        noise(out, 0.1, 0.05, 'lowpass', 600, 200, 0.08, 0.003);
    }

    /** Soft rain: a gentle hiss that swells and fades, with drips. */
    function rainSound(out) {
        noise(out, 0, 3.6, 'bandpass', 2400, 1800, 0.12, 1.0, 0.6);
        noise(out, 0, 3.4, 'lowpass', 900, 700, 0.06, 1.2);
        for (let i = 0; i < 12; i++) {
            const t = rand(0.4, 3.6), f = rand(1300, 2400);
            tone(out, t, 'sine', f, f * 1.6, 0.05, 0.06, 0.002);
        }
    }

    /** A cricket far away: three quick soft chirps. */
    function cricket(out) {
        const f = rand(3800, 4600);
        for (let k = 0; k < 2; k++) {
            for (let i = 0; i < 3; i++) tone(out, k * 0.45 + i * 0.07, 'sine', f, f, 0.04, 0.12, 0.005);
        }
    }

    function sprout(out) {
        const f = rand(260, 340);
        tone(out, 0, 'sine', f, f * 2, 0.35, 0.08, 0.04);
        noise(out, 0, 0.3, 'bandpass', 400, 2400, 0.05, 0.08);
        // the twinkle as it blooms
        for (let i = 0; i < 3; i++) tone(out, 0.36 + i * 0.05, 'sine', pick(SPARKLE), 0, 0.2, 0.03);
    }

    function breeze(out, rising) {
        noise(out, 0, 1.3, 'bandpass', rising ? 300 : 900, rising ? 1400 : 250, 0.28, 0.35);
        for (let i = 0; i < 7; i++) {
            const f = NOTES[rising ? i + 1 : 8 - i];
            tone(out, 0.15 + i * 0.08, 'triangle', f, f, 0.8, 0.11);
        }
    }

    // --- what gets rendered -------------------------------------------------------

    const RECIPES = [];
    function add(family, seconds, target, draw) { RECIPES.push({ family, seconds, target, draw }); }

    // UI first, so the menu has its blips straight away.
    add('blip', 0.08, 0.35, o => tone(o, 0, 'sine', 700, 760, 0.05, 0.5, 0.004));
    add('choose', 0.2, 0.45, o => { tone(o, 0, 'sine', 660, 660, 0.08, 0.4); tone(o, 0.07, 'sine', 990, 990, 0.1, 0.4); });
    [523, 622, 740, 880].forEach((f, i) => add('beep' + (i + 1), 0.16, 0.45, o => tone(o, 0, 'sine', f, f, 0.12, 0.5, 0.005)));

    // Fireworks: launches, booms and accents are separate layers, played at
    // the launch and at the very moment each firework bursts on screen.
    for (let v = 0; v < 3; v++) add('launch-whoosh', 0.7, 0.5, whoosh);
    for (let v = 0; v < 2; v++) add('launch-whistle', 0.7, 0.45, whistle);
    for (let v = 0; v < 2; v++) add('launch-thump', 0.65, 0.6, thump);
    for (let v = 0; v < 4; v++) add('boom', 2.2, 0.95, o => boom(o, 0, 1));
    for (let v = 0; v < 3; v++) add('boom-soft', 1.8, 0.75, o => boom(o, 0, 0.7));
    for (let v = 0; v < 2; v++) {
        add('boom-big', 2.8, 0.98, o => { boom(o, 0, 1.15); noise(o, 0.05, 2.4, 'lowpass', 320, 55, 0.5, 0.02); });
    }
    const ACCENT_SECONDS = { crackle: 2, 'crackle-short': 1.3, echo: 2, salute: 2.3, pops: 1.3, hiss: 2.8, sizzle: 3, whirl: 1.7, flutter: 1.5, sparkle: 1.4, shimmer: 1.4, tinkle: 1.4 };
    const ACCENT_LEVEL = { salute: 0.8, pops: 0.6, echo: 0.35, crackle: 0.55, 'crackle-short': 0.55 };
    Object.keys(ACCENTS).forEach(name => {
        for (let v = 0; v < 2; v++) add(name, ACCENT_SECONDS[name], ACCENT_LEVEL[name] || 0.42, ACCENTS[name]);
    });
    for (let v = 0; v < 5; v++) add('blow', 0.8, 0.6, blow);
    Object.keys(POPS).forEach(tex => POP_NOTES.forEach((f, i) => add('pop-' + tex + '-' + i, 0.24, 0.5, o => POPS[tex](o, f))));
    for (let v = 0; v < 3; v++) add('drip', 0.25, 0.35, drip);
    for (let v = 0; v < 2; v++) add('splash', 0.55, 0.5, splash);
    for (let v = 0; v < 2; v++) add('stretch', 0.95, 0.45, stretch);
    for (let v = 0; v < 2; v++) add('giant-pop', 1.2, 0.75, giantPop);
    for (let v = 0; v < 2; v++) add('merge', 0.35, 0.45, merge);
    Object.keys(TIMBRES).forEach(name => {
        NOTES.forEach((f, i) => add('plant-' + name + '-' + i, 2, 0.7, o => { sprout(o); TIMBRES[name](o, 0.4, f); }));
    });
    add('breeze', 1.9, 0.6, o => breeze(o, false));
    add('breeze', 1.9, 0.6, o => breeze(o, true));
    for (let v = 0; v < 2; v++) add('boing', 1.2, 0.6, boing);
    add('finish', 2.2, 0.7, chord);
    add('finish', 1.8, 0.7, o => jingle(o, [0, 2, 4, 7, 4, 7]));
    add('finish', 1.8, 0.7, o => jingle(o, [4, 2, 0, 2, 4, 5, 7]));
    for (let v = 0; v < 3; v++) add('hop', 0.22, 0.4, hop);
    for (let v = 0; v < 2; v++) add('rain', 3.8, 0.4, rainSound);
    for (let v = 0; v < 3; v++) add('cricket', 1.0, 0.3, cricket);

    let renderedUpTo = 0;
    function renderSome() {
        const until = performance.now() + 12;
        while (renderedUpTo < RECIPES.length && performance.now() < until) {
            const r = RECIPES[renderedUpTo];
            const name = 'nmb-' + r.family + '-' + renderedUpTo;
            renderedUpTo++;
            try {
                const out = buffer(r.seconds);
                r.draw(out);
                const url = toWavUrl(finish(out, r.target));
                window.SafeAudio.preload(name, url);
                (ready[r.family] = ready[r.family] || []).push(name);
                if (!urls[r.family]) urls[r.family] = url;
            } catch (e) {
                console.warn('[NMB] Could not build sound', r.family, e);
            }
        }
        if (renderedUpTo < RECIPES.length) setTimeout(renderSome, 0);
    }

    // --- playing ----------------------------------------------------------------

    function on() { return NMB.Settings.get('sound') && !!window.SafeAudio; }

    /** Play one recording of `family`, chosen at random. Returns false if none is ready. */
    function play(family, gain) {
        if (!on()) return false;
        const list = ready[family];
        if (!list || !list.length) return false;
        const level = Math.max(0, Math.min(1, NMB.Settings.volume() * (gain === undefined ? 1 : gain)));
        window.SafeAudio.play(pick(list), level);
        return true;
    }

    return {
        init: function () { renderSome(); },
        NOTES: NOTES,
        /** How many recordings are built (used by the automated test). */
        status: function () {
            return { built: renderedUpTo, total: RECIPES.length, families: Object.keys(ready).length, urls: Object.assign({}, urls) };
        },

        /** A rocket leaving the ground: a whoosh, a whistle or a mortar thump. */
        launch: function (kind) {
            const whistly = kind === 'willow' || kind === 'palm' || kind === 'spiral';
            const roll = Math.random();
            const type = whistly ? (roll < 0.7 ? 'whistle' : 'whoosh') : roll < 0.5 ? 'whoosh' : roll < 0.75 ? 'thump' : 'whistle';
            play('launch-' + type, 0.9);
        },
        /** A firework bursting: its boom and its accent, together. */
        burst: function (kind) {
            const layers = BURSTS[kind] || BURSTS.peony;
            play(layers[0]);
            play(layers[1], 0.85);
        },
        blow: function () { play('blow'); },
        /**
         * A bubble popping. `size` runs 0 (tiny) to 1 (big): bigger bubbles
         * play lower notes. Pops close together are thinned out so a burst of
         * them stays a gentle patter rather than a pile-up.
         */
        pop: function (size) {
            const now = performance.now();
            if (now - lastPop < 60) return;
            lastPop = now;
            const step = Math.max(0, Math.min(8, Math.round((1 - size) * 8 + rand(-1, 1))));
            const roll = Math.random();
            const tex = size > 0.65 ? (roll < 0.6 ? 'bloop' : 'soft') : roll < 0.5 ? 'soft' : roll < 0.78 ? 'squeaky' : 'bloop';
            play('pop-' + tex + '-' + step, 0.7);
            if (Math.random() < 0.15) setTimeout(function () { play('drip', 0.45); }, 90);
        },
        splash: function () { play('splash', 0.75); play('pop-bloop-3', 0.6); },
        stretch: function () { play('stretch', 0.7); },
        giantPop: function () { play('giant-pop', 0.9); },
        merge: function () { play('merge', 0.6); },
        /** A flower growing: its own instrument, on the next step of the scale. */
        plant: function (kind, step) {
            if (kind === 'mushroom') { play('boing'); return; }
            play('plant-' + (FLOWER_INSTRUMENT[kind] || 'musicbox') + '-' + (step % NOTES.length));
            if (kind === 'giant') play('shimmer', 0.5);
        },
        gardenFinish: function () { play('finish'); },
        gardenReset: function (kind) {
            if (kind === 'breeze') play('breeze');
            else if (kind === 'carry') { play('flutter', 0.7); play('shimmer', 0.5); }
            else if (kind === 'rain') play('rain', 0.8);
            // The bunny's own hops make its sound, one per hop.
        },
        hop: function () { play('hop', 0.6); },
        cricket: function () { play('cricket', 0.35); },

        blip: function () { play('blip', 0.6); },
        choose: function () { play('choose', 0.6); },
        beep: function (n) { play('beep' + n, 0.7); },
        /** A short sample, so a caregiver changing the volume hears the new level. */
        sample: function () { play('plant-bell-4') || play('choose'); }
    };
})();

/**
 * Speech, through the hub's shared voice manager. Text to Speech on/off and
 * the chosen voice live there; this never keeps its own copy.
 */
NMB.Voice = (function () {
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
