/**
 * NARBE Switch Songs - the synthesiser.
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

window.NSS = window.NSS || {};

NSS.Synth = (function () {
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

    function kick(out, s0, wrap, g) {
        const n = Math.floor(0.42 * SR);
        let ph = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            ph += TAU * (45 + 105 * Math.exp(-t / 0.035)) / SR;
            const click = i < 60 ? (1 - i / 60) * 0.25 : 0;
            put(out, s0 + i, (Math.sin(ph) * Math.exp(-t / 0.13) + click) * 0.9 * g, wrap);
        }
    }

    function snare(out, s0, wrap, g) {
        const n = Math.floor(0.24 * SR);
        let prev = 0, ph = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const w = Math.random() * 2 - 1;
            const hp = (w - prev) * 0.5;
            prev = w;
            ph += TAU * (200 - 40 * Math.min(1, t / 0.08)) / SR;
            const body = Math.sin(ph) * Math.exp(-t / 0.04) * 0.45;
            const rattle = hp * Math.exp(-t / 0.06) * 0.6;
            put(out, s0 + i, (body + rattle) * g, wrap);
        }
    }

    function hat(out, s0, wrap, g) {
        const n = Math.floor(0.07 * SR);
        let p1 = 0, p2 = 0;
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const w = Math.random() * 2 - 1;
            const d1 = w - p1; p1 = w;
            const d2 = d1 - p2; p2 = d1;
            put(out, s0 + i, d2 * 0.07 * Math.exp(-t / 0.015) * g, wrap);
        }
    }

    /** Hammer transient, independently decaying harmonics and a natural piano tail. */
    function bell(out, midi, dur, g) {
        const f = mtof(midi), n = Math.min(out.length, Math.floor(dur * SR));
        for (let i = 0; i < n; i++) {
            const t = i / SR;
            const attack = Math.min(1, t / 0.003);
            let tone = 0;
            for (let h = 1; h <= 5; h++) {
                const partial = f * h * Math.sqrt(1 + 0.00012 * h * h);
                tone += Math.sin(TAU * partial * t) * Math.exp(-t / (0.65 / Math.sqrt(h))) / (h * h);
            }
            const hammer = (Math.random() * 2 - 1) * Math.exp(-t / 0.004) * 0.12;
            out[i] += (tone * attack * 0.7 + hammer) * g;
        }
    }

    function voice(layer, out, s0, wrap, v, stepDur, g) {
        switch (layer.id) {
            case 'kick': kick(out, s0, wrap, g); break;
            case 'snare': snare(out, s0, wrap, g); break;
            case 'hat': hat(out, s0, wrap, g); break;
        }
    }

    // --- output -----------------------------------------------------------------

    function soften(out) { for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * 0.9); return out; }

    function fadeEnd(out) {
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
                    if (v >= 0) voice(p.layer, out, s0, true, v, stepDur, p.gain || 1);
                }
            }
        }
        return { samples: soften(out), duration: N / SR, stepDur: stepDur };
    }

    /** One layer sound on its own, for instant feedback while recording. */
    function shotUrl(layer, v) {
        const out = new Float32Array(Math.ceil(0.6 * SR));
        voice(layer, out, 0, false, v, 0.16, 1);
        return toWavUrl(fadeEnd(soften(out)));
    }

    function bellUrl(midi) {
        const out = new Float32Array(Math.ceil(1.5 * SR));
        bell(out, midi, 1.5, 0.9);
        return toWavUrl(fadeEnd(soften(out)));
    }

    /** One complete listening performance. Its timing lives inside the WAV,
     * so scanning, speech and browser timers cannot skip or duplicate notes. */
    function renderSong(song) {
        const secondsPerBeat = 60 / song.bpm;
        let end = 0;
        const starts = song.beats.map(function (beats) {
            const start = end;
            end += beats * secondsPerBeat;
            return start;
        });
        const duration = Math.max(end, starts[starts.length - 1] + 1.5);
        const out = new Float32Array(Math.ceil(duration * SR));
        const voices = new Map();
        song.notes.forEach(function (midi, index) {
            if (!voices.has(midi)) {
                const sample = new Float32Array(Math.ceil(1.5 * SR));
                bell(sample, midi, 1.5, 0.75);
                voices.set(midi, fadeEnd(sample));
            }
            const sample = voices.get(midi), start = Math.round(starts[index] * SR);
            for (let i = 0; i < sample.length && start + i < out.length; i++) out[start + i] += sample[i];
        });
        return { samples: fadeEnd(soften(out)), duration: out.length / SR, starts: starts };
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

    return { SR: SR, renderLoop: renderLoop, renderSong: renderSong, shotUrl: shotUrl, bellUrl: bellUrl, beepUrl: beepUrl, toWavUrl: toWavUrl };
})();
