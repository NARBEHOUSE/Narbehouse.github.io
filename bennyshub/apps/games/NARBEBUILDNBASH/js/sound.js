/**
 * NARBE Build n Bash - sound effects and speech.
 *
 * NO WEB AUDIO. An AudioContext can take down the renderer in the hub's
 * Electron desktop build (ACCESSIBILITY.md section 5), so every effect is
 * synthesised here, sample by sample, into a small WAV in memory and played
 * through the hub's SafeAudio (plain <audio> elements). The synthesiser is
 * the one NARBE Magic Button uses.
 *
 * Every effect has a few recordings with their own pitch and texture, picked
 * at random, so a hundred presses never sound like one sound on repeat.
 *
 * Cues that play all the time (a block landing, blocks clattering, the scan
 * blip) are short, soft and below 2.5 kHz: they are heard hundreds of times a
 * session. The big, bright sounds are saved for destroyers and finishing.
 *
 * Destroyer sound names (js/bashers.js uses ONLY these): whoosh, whoosh-big,
 * thud, stomp, boom, boom-small, fuse, creak, clang, engine, horn, roll,
 * strike, roar, wind, whistle, sneeze-in, sneeze-out, rumble, pop, crunch,
 * swish, splash.
 */

window.BNB = window.BNB || {};

BNB.Sound = (function () {
    'use strict';

    const SR = 22050;
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = a => a[Math.floor(Math.random() * a.length)];

    const ready = {};
    let lastTok = 0;

    // --- the synthesiser (as NARBE Magic Button) ------------------------------------------

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

    /** Swelling noise: rises over `rise` then falls over `fall` (whooshes, wind). */
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

    // --- voices of the effects ------------------------------------------------------------

    /** A wooden knock: body tone, a woody overtone, a click, a low thump. f = body pitch. */
    function knock(o, t, f, len, level) {
        level = level || 1;
        tone(o, t, 'sine', f * 1.03, f * 0.93, len, 0.7 * level, 0.002);
        tone(o, t, 'sine', f * 2.3, f * 2.15, len * 0.35, 0.22 * level, 0.001);
        noise(o, t, 0.016, 'bandpass', 1700, 1300, 0.3 * level, 0.001, 1.3);
        tone(o, t, 'sine', f * 0.5, f * 0.42, len * 1.3, 0.35 * level, 0.003);
    }

    function thud(o, t, big) {
        const k = big ? 1.3 : 1;
        tone(o, t, 'sine', 120 / k, 42 / k, 0.28 * k, 0.9, 0.004);
        noise(o, t, 0.24 * k, 'lowpass', 500, 90, 0.6, 0.003);
    }

    function boom(o, t, size) {
        noise(o, t, 1.6 * size, 'lowpass', 1300, 55, 0.9, 0.004);
        tone(o, t, 'sine', 75, 32, 0.9 * size, 0.8, 0.004);
        noise(o, t + 0.04, 0.5 * size, 'bandpass', 900, 240, 0.35, 0.01, 0.8);
    }

    const RECIPES = [];
    function add(family, seconds, target, draw) { RECIPES.push({ family: family, seconds: seconds, target: target, draw: draw }); }

    // UI first, so the menus have their blips straight away.
    add('blip', 0.08, 0.3, o => tone(o, 0, 'sine', 640, 690, 0.05, 0.5, 0.004));
    add('choose', 0.22, 0.38, o => { tone(o, 0, 'sine', 587, 587, 0.08, 0.4); tone(o, 0.07, 'sine', 880, 880, 0.11, 0.4); });
    add('popup', 0.9, 0.45, o => { tone(o, 0, 'sine', 659, 659, 0.5, 0.45, 0.004); tone(o, 0.12, 'sine', 988, 988, 0.6, 0.4, 0.004); tone(o, 0.12, 'sine', 1319, 1319, 0.3, 0.08, 0.004); });

    // Blocks landing, by size: small high knock to big low clonk. Soft and short.
    [[820, 0.07], [600, 0.1], [430, 0.13], [300, 0.18]].forEach((s, size) => {
        for (let v = 0; v < 3; v++) add('land-' + size, 0.32, 0.42, o => knock(o, 0, s[0] * rand(0.94, 1.06), s[1]));
    });
    for (let v = 0; v < 3; v++) add('land-space', 0.4, 0.38, o => { tone(o, 0, 'sine', 520, 700, 0.14, 0.4, 0.01); knock(o, 0.01, 640, 0.08, 0.6); });
    for (let v = 0; v < 6; v++) add('tok', 0.2, 0.32, o => knock(o, 0, rand(380, 900), rand(0.05, 0.09), 0.9));

    add('complete', 1.6, 0.55, o => {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(o, i * 0.11, 'triangle', f, f, 0.35, 0.45, 0.006));
        [523.25, 659.25, 783.99].forEach(f => tone(o, 0.48, 'sine', f, f, 1.0, 0.3, 0.02));
        tone(o, 0.48, 'triangle', 1046.5, 1046.5, 0.9, 0.25, 0.01);
    });
    for (let v = 0; v < 2; v++) add('poof', 0.5, 0.38, o => { noise(o, 0, 0.3, 'lowpass', 1400, 300, 0.6, 0.01); tone(o, 0.05, 'sine', 420, 880, 0.18, 0.18, 0.02); });
    for (let v = 0; v < 2; v++) add('splash', 0.8, 0.5, o => {
        noise(o, 0, 0.5, 'bandpass', 1100, 380, 0.8, 0.004, 0.9);
        for (let b = 0; b < 4; b++) tone(o, 0.1 + b * rand(0.06, 0.12), 'sine', rand(500, 900), rand(900, 1300), 0.05, 0.18, 0.003);
    });

    // Destroyers.
    for (let v = 0; v < 3; v++) add('whoosh', 0.6, 0.5, o => swell(o, 0, 0.22, 0.3, 'bandpass', 260, rand(1100, 1500), 500, 1, 1.4));
    for (let v = 0; v < 2; v++) add('whoosh-big', 1.0, 0.6, o => swell(o, 0, 0.4, 0.5, 'bandpass', 160, rand(700, 900), 260, 1, 1.1));
    for (let v = 0; v < 2; v++) add('swish', 0.3, 0.38, o => swell(o, 0, 0.09, 0.15, 'bandpass', 700, rand(1700, 2100), 900, 1, 1.6));
    for (let v = 0; v < 3; v++) add('thud', 0.4, 0.75, o => thud(o, 0, false));
    for (let v = 0; v < 2; v++) add('stomp', 0.7, 0.8, o => { thud(o, 0, true); noise(o, 0.05, 0.5, 'lowpass', 220, 60, 0.5, 0.02); });
    for (let v = 0; v < 2; v++) add('boom', 2.0, 0.95, o => boom(o, 0, 1));
    for (let v = 0; v < 3; v++) add('boom-small', 1.0, 0.7, o => boom(o, 0, 0.5));
    for (let v = 0; v < 2; v++) add('fuse', 1.7, 0.3, o => {
        noise(o, 0, 1.6, 'bandpass', 2600, 2400, 0.25, 0.05, 2);
        for (let c = 0; c < 26; c++) noise(o, rand(0, 1.55), 0.008, 'highpass', 1800, 1800, rand(0.3, 0.7), 0.001);
    });
    for (let v = 0; v < 2; v++) add('creak', 0.9, 0.42, o => {
        tone(o, 0, 'triangle', rand(150, 190), rand(200, 240), 0.75, 0.35, 0.08, { depth: 0.05, rate: 11 });
        noise(o, 0, 0.75, 'bandpass', 600, 800, 0.3, 0.08, 5);
    });
    for (let v = 0; v < 2; v++) add('clang', 1.2, 0.75, o => {
        [[430, 0.9], [1013, 0.5], [1622, 0.3], [2190, 0.12]].forEach(p => tone(o, 0, 'sine', p[0] * rand(0.97, 1.03), p[0] * 0.98, 0.9 + rand(0, 0.2), p[1], 0.002));
        thud(o, 0, false);
    });
    for (let v = 0; v < 2; v++) add('engine', 1.0, 0.45, o => {
        const n = Math.floor(0.95 * SR), f = rand(68, 82);
        let ph = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            ph += f / SR;
            const putt = 0.5 + 0.5 * Math.sign(Math.sin(TAU * 15 * t));
            o[i] += wave('soft-square', ph % 1) * 0.5 * putt * Math.min(1, t * 12) * Math.min(1, (0.95 - t) * 10);
        }
        noise(o, 0, 0.9, 'lowpass', 300, 260, 0.25, 0.05);
    });
    add('horn', 0.55, 0.5, o => { tone(o, 0, 'triangle', 494, 494, 0.12, 0.6, 0.008); tone(o, 0, 'triangle', 622, 622, 0.12, 0.35, 0.008); tone(o, 0.22, 'triangle', 494, 494, 0.14, 0.6, 0.008); tone(o, 0.22, 'triangle', 622, 622, 0.14, 0.35, 0.008); });
    for (let v = 0; v < 2; v++) add('roll', 1.8, 0.55, o => {
        noise(o, 0, 1.6, 'lowpass', 240, 200, 0.7, 0.2, 0.9, t => 0.7 + 0.3 * Math.sin(TAU * 6 * t));
        tone(o, 0, 'sine', 58, 52, 1.5, 0.35, 0.2);
    });
    for (let v = 0; v < 2; v++) add('strike', 1.2, 0.85, o => {
        thud(o, 0, true);
        for (let c = 0; c < 14; c++) knock(o, rand(0, 0.45), rand(350, 900), rand(0.05, 0.1), rand(0.5, 1));
        noise(o, 0, 0.6, 'bandpass', 1500, 600, 0.35, 0.004);
    });
    for (let v = 0; v < 2; v++) add('roar', 1.5, 0.75, o => {
        const base = rand(95, 115);
        [1, 1.5, 2.02].forEach((m, i) => tone(o, 0, 'triangle', base * m * 1.15, base * m * 0.85, 1.15, 0.45 / (i + 1), 0.22, { depth: 0.05, rate: 23 }));
        noise(o, 0, 1.1, 'bandpass', 700, 420, 0.4, 0.22, 3);
    });
    for (let v = 0; v < 2; v++) add('wind', 3.2, 0.5, o => {
        swell(o, 0, 1.3, 1.8, 'bandpass', 300, rand(800, 950), 420, 1, 2.2);
        swell(o, 0.4, 1.1, 1.6, 'bandpass', 520, 1250, 600, 0.4, 4);
    });
    for (let v = 0; v < 2; v++) add('whistle', 1.4, 0.4, o => tone(o, 0, 'sine', rand(1650, 1800), 420, 1.2, 0.5, 0.06, { depth: 0.012, rate: 7 }));
    for (let v = 0; v < 2; v++) add('sneeze-in', 0.8, 0.45, o => {
        tone(o, 0, 'triangle', 230 + v * 30, 320 + v * 40, 0.6, 0.35, 0.18, { depth: 0.02, rate: 6 });
        noise(o, 0, 0.6, 'bandpass', 900, 1300, 0.35, 0.2, 3);
    });
    for (let v = 0; v < 2; v++) add('sneeze-out', 0.8, 0.85, o => {
        noise(o, 0, 0.22, 'bandpass', 2300, 900, 1, 0.004, 0.9);
        tone(o, 0.03, 'triangle', 320, 170, 0.32, 0.5, 0.01);
        noise(o, 0.05, 0.45, 'lowpass', 900, 200, 0.4, 0.01);
    });
    for (let v = 0; v < 2; v++) add('rumble', 1.8, 0.6, o => { noise(o, 0, 1.6, 'lowpass', 170, 60, 0.9, 0.15); tone(o, 0, 'sine', 48, 38, 1.4, 0.4, 0.15); });
    for (let v = 0; v < 3; v++) add('pop', 0.18, 0.45, o => tone(o, 0, 'sine', rand(650, 820), 180, 0.1, 0.7, 0.002));
    for (let v = 0; v < 3; v++) add('crunch', 0.45, 0.6, o => { for (let c = 0; c < 7; c++) noise(o, rand(0, 0.2), 0.05, 'lowpass', 2200, 900, rand(0.5, 1), 0.002); thud(o, 0, false); });

    let renderedUpTo = 0;
    function renderSome() {
        const until = performance.now() + 12;
        while (renderedUpTo < RECIPES.length && performance.now() < until) {
            const r = RECIPES[renderedUpTo];
            const name = 'bnb-' + r.family + '-' + renderedUpTo;
            renderedUpTo++;
            try {
                const out = buffer(r.seconds);
                r.draw(out);
                window.SafeAudio.preload(name, toWavUrl(finish(out, r.target)));
                (ready[r.family] = ready[r.family] || []).push(name);
            } catch (e) { console.warn('[BNB] Could not build sound', r.family, e); }
        }
        if (renderedUpTo < RECIPES.length) setTimeout(renderSome, 0);
    }

    // --- playing ----------------------------------------------------------------------------

    function on() { return BNB.Settings.get('sound') && !!window.SafeAudio; }

    function play(family, gain) {
        if (!on()) return false;
        const list = ready[family];
        if (!list || !list.length) return false;
        const level = Math.max(0, Math.min(1, BNB.Settings.volume() * (gain === undefined ? 1 : gain)));
        if (level <= 0.01) return false;
        window.SafeAudio.play(pick(list), level);
        return true;
    }

    return {
        init: function () { if (window.SafeAudio) renderSome(); },
        play: play,
        status: function () { return { built: renderedUpTo, total: RECIPES.length, families: Object.keys(ready) }; },
        /** A block landing: size is the cube root of its volume (about 0.5 to 2). */
        land: function (size, space) {
            if (space) { play('land-space', 0.8); return; }
            const k = size < 0.6 ? 0 : size < 0.95 ? 1 : size < 1.4 ? 2 : 3;
            play('land-' + k, 0.85);
        },
        /** Blocks clattering as they tumble; thinned out so a pile-up stays a patter. */
        tok: function (gain) {
            const now = performance.now();
            if (now - lastTok < 45) return;
            lastTok = now;
            play('tok', 0.25 + 0.5 * Math.min(1, gain || 0.5));
        },
        blip: function () { play('blip', 0.6); },
        choose: function () { play('choose', 0.6); },
        sample: function () { play('complete', 0.6) || play('choose'); }
    };
})();

/**
 * Speech, through the hub's shared voice manager (TTS on/off and the voice
 * live there). Scan labels and selections speak at once and clear the queue;
 * game events (a piece's name, "You built it!") wait their turn so nothing
 * cuts them off, and stale ones are dropped.
 */
BNB.Voice = (function () {
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
