/**
 * NARBE Loops - the synthesiser.
 *
 * NO WEB AUDIO. An AudioContext can take down the renderer in the hub's
 * Electron desktop build (ACCESSIBILITY.md section 5). Like Magic Button,
 * every sound is drawn sample by sample into a small WAV file in memory and
 * played through plain <audio> elements.
 *
 * The beat is not sequenced note by note in real time. The whole loop is
 * rendered as ONE WAV (two bars, every layer mixed) and played on repeat,
 * so the timing inside the loop is sample-perfect on any device. When a
 * layer or the speed changes, the loop is rendered again and swapped in
 * at the same point in the bar (see sound.js).
 */

window.NL = window.NL || {};

NL.Synth = (function () {
    'use strict';

    const SR = 24000;
    const TAU = Math.PI * 2;
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

    /** Add a sample; loop renders wrap their tails back round to the start. */
    function put(out, i, v, wrap) {
        if (wrap) out[i % out.length] += v;
        else if (i < out.length) out[i] += v;
    }

    // --- voices -----------------------------------------------------------------

    function kick(out, s0, wrap, g, variant) {
        const decay = [0.13, 0.25, 0.09, 0.065][variant];
        const n = Math.floor(Math.max(0.42, decay * 4) * SR);
        let ph = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            ph += TAU * ([45, 34, 58, 70][variant] + [105, 85, 160, 55][variant] * Math.exp(-t / 0.035)) / SR;
            const click = i < 60 ? (1 - i / 60) * 0.25 : 0;
            put(out, s0 + i, (Math.sin(ph) * Math.exp(-t / decay) + click * (variant === 3 ? 0.25 : 1)) * 0.9 * g, wrap);
        }
    }

    function snare(out, s0, wrap, g, variant) {
        const n = Math.floor(0.24 * SR);
        let prev = 0, ph = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const w = Math.random() * 2 - 1;
            const hp = (w - prev) * 0.5;
            prev = w;
            ph += TAU * (200 - 40 * Math.min(1, t / 0.08)) / SR;
            const body = Math.sin(ph) * Math.exp(-t / 0.04) * 0.45;
            const bursts = variant === 1 ? (Math.exp(-t / 0.035) + (t > 0.018 ? Math.exp(-(t - 0.018) / 0.035) : 0) + (t > 0.036 ? Math.exp(-(t - 0.036) / 0.045) : 0)) : Math.exp(-t / (variant === 3 ? 0.13 : 0.06));
            const rattle = variant === 2 ? Math.sin(TAU * 1100 * t) * Math.exp(-t / 0.018) * 0.5 : hp * bursts * (variant === 3 ? 0.32 : 0.6);
            put(out, s0 + i, (body + rattle) * g, wrap);
        }
    }

    function hat(out, s0, wrap, g, variant) {
        const decay = [0.015, 0.12, 0.055, 0.04][variant];
        const n = Math.floor((variant === 1 ? 0.55 : 0.25) * SR);
        let p1 = 0, p2 = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const w = Math.random() * 2 - 1;
            const d1 = w - p1; p1 = w;
            const d2 = d1 - p2; p2 = d1;
            const tone = variant === 3 ? (Math.sin(TAU * 3200 * t) + Math.sin(TAU * 4513 * t)) * 0.35 : d2;
            const attack = variant === 2 ? Math.min(1, t / 0.015) : 1;
            put(out, s0 + i, tone * 0.07 * Math.exp(-t / decay) * attack * g, wrap);
        }
    }

    function bass(out, s0, wrap, midi, dur, g, variant) {
        const f = mtof(midi), rel = 0.04, n = Math.floor((dur + rel) * SR);
        let ph = 0, lp = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            ph += f / SR; ph -= Math.floor(ph);
            const saw = variant === 1 ? Math.sin(TAU * ph) : variant === 3 ? (ph < 0.5 ? 0.7 : -0.7) : 2 * ph - 1;
            const fc = variant === 2 ? 350 + 2300 * Math.exp(-t / 0.045) : 160 + 1000 * Math.exp(-t / 0.09);
            lp += (1 - Math.exp(-TAU * fc / SR)) * (saw - lp);
            const env = t < 0.005 ? t / 0.005 : t < dur ? 1 - 0.35 * (t / dur) : 0.65 * Math.max(0, 1 - (t - dur) / rel);
            put(out, s0 + i, lp * env * (variant === 2 ? Math.exp(-t / 0.12) : 1) * 0.6 * g, wrap);
        }
    }

    function lead(out, s0, wrap, midi, dur, g, variant) {
        const f = mtof(midi), tail = 0.12, n = Math.floor((dur + tail) * SR);
        const k = 1 - Math.exp(-TAU * 2800 / SR);
        let p1 = 0, p2 = 0, lp = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            p1 += f / SR; p1 -= Math.floor(p1);
            p2 += 2 * f / SR; p2 -= Math.floor(p2);
            const sq = p1 < 0.5 ? 1 : -1;
            const tri = 1 - 4 * Math.abs(p2 - 0.5);
            const tone = variant === 1 ? Math.sin(TAU * p1) * 0.75 + Math.sin(TAU * p2) * 0.25 : variant === 2 ? (2 * p1 - 1) * Math.exp(-t / 0.1) : variant === 3 ? Math.sin(TAU * p1) : sq * 0.45 + tri * 0.55;
            lp += k * (tone - lp);
            const env = (t < 0.006 ? t / 0.006 : Math.exp(-(t - 0.006) / (dur * 0.7))) *
                (t < dur ? 1 : Math.max(0, 1 - (t - dur) / tail));
            put(out, s0 + i, lp * env * 0.32 * g, wrap);
        }
    }

    /** A warm tone for the settings volume preview. */
    function bell(out, midi, dur, g) {
        const f = mtof(midi), n = Math.min(out.length, Math.floor(dur * SR));
        let p1 = 0, p2 = 0, p3 = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            p1 += f / SR; p1 -= Math.floor(p1);
            p2 += 2 * f / SR; p2 -= Math.floor(p2);
            p3 += 3 * f / SR; p3 -= Math.floor(p3);
            const tri = 1 - 4 * Math.abs(p1 - 0.5);
            const env = t < 0.005 ? t / 0.005 : Math.exp(-(t - 0.005) / (dur * 0.3));
            out[i] += (tri * 0.6 + Math.sin(TAU * p2) * 0.25 + Math.sin(TAU * p3) * 0.08) * env * g;
        }
    }

    function voice(layer, out, s0, wrap, v, stepDur, g, variant) {
        variant = Number.isInteger(variant) && variant >= 0 && variant < 4 ? variant : 0;
        switch (layer.instrument || layer.id) {
            case 'kick': kick(out, s0, wrap, g, variant); break;
            case 'snare': snare(out, s0, wrap, g, variant); break;
            case 'hat': hat(out, s0, wrap, g, variant); break;
            case 'bass': bass(out, s0, wrap, NL.Music.degToMidi(layer.base, v), stepDur * 1.8, g, variant); break;
            default: lead(out, s0, wrap, NL.Music.degToMidi(layer.base, v), stepDur * 1.6, g, variant);
        }
    }

    // --- output -----------------------------------------------------------------

    function soften(out) { for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * 0.9); return out; }

    function fadeEnd(out) {
        const fade = Math.min(out.length, Math.floor(SR * 0.01));
        for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
        return out;
    }

    /** Repetitions are contiguous PCM, not media seeks at each musical repeat. */
    function toWavUrl(samples, repetitions) {
        repetitions = repetitions || 1;
        const count = samples.length * repetitions;
        const header = new DataView(new ArrayBuffer(44)), pcm = new DataView(new ArrayBuffer(samples.length * 2));
        const str = (o, s) => { for (let i = 0; i < s.length; i++) header.setUint8(o + i, s.charCodeAt(i)); };
        str(0, 'RIFF'); header.setUint32(4, 36 + count * 2, true); str(8, 'WAVE');
        str(12, 'fmt '); header.setUint32(16, 16, true); header.setUint16(20, 1, true);
        header.setUint16(22, 1, true); header.setUint32(24, SR, true); header.setUint32(28, SR * 2, true);
        header.setUint16(32, 2, true); header.setUint16(34, 16, true);
        str(36, 'data'); header.setUint32(40, count * 2, true);
        for (let i = 0; i < samples.length; i++) pcm.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), true);
        return URL.createObjectURL(new Blob([header.buffer].concat(Array(repetitions).fill(pcm.buffer)), { type: 'audio/wav' }));
    }

    /**
     * Render a loop. parts: [{ layer, pattern, gain? }]. Two bars, so the
     * point where the <audio> element restarts comes round half as often.
     */
    function renderLoop(parts, bpm, bars) {
        bars = bars || 2;
        const stepDur = 60 / bpm / 4;
        const N = Math.round(16 * bars * stepDur * SR);
        const out = new Float32Array(N);
        for (let b = 0; b < bars; b++) {
            for (let s = 0; s < 16; s++) {
                const s0 = Math.round((b * 16 + s) * stepDur * SR);
                for (const p of parts) {
                    const v = p.pattern[s];
                    if (v >= 0) voice(p.layer, out, s0, true, v, stepDur, p.gain || 1, p.sound);
                }
            }
        }
        return { samples: soften(out), duration: N / SR, stepDur: stepDur };
    }

    /** One layer sound on its own, for instant feedback while recording. */
    function shotUrl(layer, v, variant) {
        const out = new Float32Array(Math.ceil(0.6 * SR));
        voice(layer, out, 0, false, v, 0.16, 1, variant);
        return toWavUrl(fadeEnd(soften(out)));
    }

    function bellUrl(midi) {
        const out = new Float32Array(Math.ceil(1.4 * SR));
        bell(out, midi, 1.4, 0.9);
        return toWavUrl(fadeEnd(soften(out)));
    }

    /** A short tick for each second of the hold-to-pause. */
    function beepUrl(freq) {
        const n = Math.ceil(0.12 * SR), out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            out[i] = Math.sin(TAU * freq * t) * Math.min(1, t / 0.004) * Math.exp(-t / 0.04) * 0.5;
        }
        return toWavUrl(fadeEnd(out));
    }

    return { SR: SR, renderLoop: renderLoop, shotUrl: shotUrl, bellUrl: bellUrl, beepUrl: beepUrl, toWavUrl: toWavUrl };
})();
