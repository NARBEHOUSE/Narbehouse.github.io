/**
 * NARBE Animal Friends - the theme tune.
 *
 * WHAT PLAYS: music/theme.mp3, the recorded theme - see FILE below.
 *
 * Everything else in this file is the fallback behind it: a one-minute piece
 * for the menus in three voices (a melody, a walking bass, and a light arpeggio
 * for the middle section), written here as note data and mixed down to a
 * looping WAV at runtime. It plays only if the recording will not load, the
 * same way a missing sound effect falls back to a synthesised tone. That is
 * worth keeping rather than deleting now the real theme exists: it is what
 * makes a half-installed copy of the game play music instead of nothing.
 *
 * The note data is also exported to music/theme.mid by tools/make-midi.js,
 * which reads THIS file so the score and the fallback cannot drift apart.
 *
 * WHY NOT PLAY THE MIDI: a browser has no MIDI synthesiser. Playing a .mid needs
 * either Web Audio and a soundfont - and Web Audio is banned in this app, it can
 * take down the Electron renderer - or a pre-rendered audio file. So the .mid is
 * the score, for opening in a DAW, and the .mp3 is what came back out of one.
 *
 * The fallback mix is built with plain arithmetic into an ArrayBuffer and handed
 * to an HTML5 Audio element. No AudioContext, no OscillatorNode, no GainNode.
 *
 * Level: MUSIC_LEVEL is deliberately under half. The tune sits behind speech,
 * and a switch user relying on text to speech has to be able to hear every word
 * over it without turning anything down.
 */

window.NAF = window.NAF || {};

NAF.Music = (function () {
    'use strict';

    /**
     * The recorded theme. Played instead of the synthesised mixdown below,
     * which stays as the fallback if this will not load - same tier system as
     * the art, and the reason a missing file is a quieter game rather than a
     * silent one.
     */
    const FILE = 'music/theme.mp3';

    /** 16 kHz is plenty for a tune whose top note is around 1 kHz, and it keeps
     *  the rendered loop under two megabytes. */
    const SR = 16000;
    const BPM = 112;
    const BEAT = 60 / BPM;              // 0.5357 s - 112 beats is almost exactly 60 s

    /**
     * TWO levels, because the two sources are not the same loudness.
     *
     * The synthesised mixdown below is built with plain arithmetic at gains
     * around 0.3, so its peaks sit well under full scale before this
     * multiplier is applied at all. A recorded, mastered MP3 does not: it
     * arrives normalised close to maximum. Playing both at one number is what
     * put the recorded theme far louder than the tune it replaced, loud enough
     * to compete with the speech - the same multiplier, roughly three times
     * the actual sound.
     *
     * So RECORDED_LEVEL is set for a mastered file and SYNTH_LEVEL keeps the
     * value the mixdown was already tuned to. Both land in about the same
     * place, and swapping a theme in or out no longer changes how loud the
     * game is. RECORDED_LEVEL is the dial to turn if the music is still too
     * present; it is deliberately a background bed, not a feature.
     */
    // Halved from 0.12 / 0.38. The music was still sitting close enough to the
    // speech to make it hard to follow, and speech is the part a switch user
    // cannot do without - so the bed loses, every time.
    const RECORDED_LEVEL = 0.06;
    const SYNTH_LEVEL = 0.19;

    /** Kept as the module's headline level for anything that reports it. */
    const MUSIC_LEVEL = RECORDED_LEVEL;

    // --- pitch ------------------------------------------------------------------

    const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

    /** 'C5' or 'F#4' to a MIDI note number. 'R' is a rest and returns null. */
    function midiOf(name) {
        if (!name || name === 'R') return null;
        const letter = name.charAt(0).toUpperCase();
        let i = 1, semis = STEP[letter];
        if (semis === undefined) return null;
        if (name.charAt(1) === '#') { semis += 1; i = 2; }
        else if (name.charAt(1) === 'b') { semis -= 1; i = 2; }
        const octave = parseInt(name.slice(i), 10);
        // MIDI 60 is middle C, written C4 here.
        return (octave + 1) * 12 + semis;
    }

    function freqOf(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

    // --- the tune ---------------------------------------------------------------
    //
    // Each note is [name, beats]. Four bars of four, eight bars a section.
    //
    // A   the theme. Stepwise and singable, the shape a young child can hum back.
    // B   the middle. Higher, busier, and on a brighter waveform, so a minute
    //     does not feel like the same four bars six times.
    // A'  the theme again, doubled an octave up, so the return feels like an
    //     arrival rather than a repeat.
    // TAG a rising run and a plain cadence home, which is also the loop point.

    const A = [
        ['E5', 1], ['D5', 1], ['C5', 1], ['D5', 1],
        ['E5', 1], ['E5', 1], ['E5', 2],
        ['D5', 1], ['C5', 1], ['B4', 1], ['C5', 1],
        ['D5', 1], ['D5', 1], ['G4', 2],
        ['E5', 1], ['F5', 1], ['G5', 1], ['F5', 1],
        ['E5', 1], ['D5', 1], ['C5', 2],
        ['A4', 1], ['B4', 1], ['C5', 1], ['D5', 1],
        ['C5', 4]
    ];

    const B = [
        ['G5', 1], ['G5', 1], ['A5', 1], ['G5', 1],
        ['F5', 1], ['E5', 1], ['D5', 2],
        ['E5', 1], ['E5', 1], ['F5', 1], ['E5', 1],
        ['D5', 1], ['C5', 1], ['B4', 2],
        ['C5', 1], ['D5', 1], ['E5', 1], ['F5', 1],
        ['G5', 2], ['A5', 2],
        ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1],
        ['C5', 4]
    ];

    const TAG = [
        ['C5', 1], ['E5', 1], ['G5', 1], ['C6', 1],
        ['B5', 1], ['A5', 1], ['G5', 2],
        ['F5', 1], ['E5', 1], ['D5', 1], ['C5', 1],
        ['C5', 4]
    ];

    /** The melody, in four sections, each on its own voice colour. */
    const SECTIONS = [
        { wave: 'triangle', gain: 0.42, notes: A, octaveUp: false },
        { wave: 'square', gain: 0.26, notes: B, octaveUp: false },
        { wave: 'triangle', gain: 0.42, notes: A, octaveUp: true },
        { wave: 'sine', gain: 0.44, notes: TAG, octaveUp: false }
    ];

    /**
     * One chord per bar, twenty-eight bars. Both the bass and the arpeggio are
     * derived from this, so the three voices cannot disagree about the harmony.
     */
    const BARS = [
        'C', 'C', 'F', 'G', 'C', 'Am', 'F', 'C',        // A
        'G', 'F', 'C', 'G', 'C', 'F', 'G', 'C',         // B
        'C', 'C', 'F', 'G', 'C', 'Am', 'F', 'C',        // A'
        'C', 'G', 'F', 'C'                              // TAG
    ];

    const CHORDS = {
        C: { bass: ['C3', 'G3'], arp: ['C4', 'E4', 'G4'] },
        F: { bass: ['F3', 'C4'], arp: ['F4', 'A4', 'C5'] },
        G: { bass: ['G2', 'D3'], arp: ['G3', 'B3', 'D4'] },
        Am: { bass: ['A2', 'E3'], arp: ['A3', 'C4', 'E4'] }
    };

    /** Which bars the arpeggio plays in: the middle section and the tag. */
    function arpBar(bar) { return (bar >= 8 && bar < 16) || bar >= 24; }

    /**
     * The three voices as flat note lists, each note {midi, at, dur, wave, gain}
     * in beats. Also what tools/make-midi.js reads to write the .mid, so it is a
     * plain data structure with no rendering in it.
     */
    function tracks() {
        const melody = [];
        const harmony = [];
        let at = 0;

        SECTIONS.forEach(function (sec) {
            sec.notes.forEach(function (n) {
                const midi = midiOf(n[0]);
                if (midi !== null) {
                    melody.push({ midi: midi, at: at, dur: n[1], wave: sec.wave, gain: sec.gain });
                    if (sec.octaveUp) {
                        harmony.push({
                            midi: midi + 12, at: at, dur: n[1],
                            wave: 'sine', gain: 0.13
                        });
                    }
                }
                at += n[1];
            });
        });

        const bass = [];
        const arp = [];
        BARS.forEach(function (name, bar) {
            const chord = CHORDS[name];
            const barAt = bar * 4;
            chord.bass.forEach(function (b, i) {
                bass.push({
                    midi: midiOf(b), at: barAt + i * 2, dur: 2,
                    wave: 'sine', gain: 0.30
                });
            });
            if (!arpBar(bar)) return;
            // Eight eighth-notes, up and back down the chord.
            const order = [0, 1, 2, 1, 0, 1, 2, 1];
            order.forEach(function (k, i) {
                arp.push({
                    midi: midiOf(chord.arp[k]) + 12, at: barAt + i * 0.5, dur: 0.45,
                    wave: 'sine', gain: 0.15
                });
            });
        });

        return {
            beats: BARS.length * 4,
            bpm: BPM,
            melody: melody,
            harmony: harmony,
            bass: bass,
            arp: arp
        };
    }

    // --- rendering --------------------------------------------------------------

    /**
     * A note's envelope. renderWav in audio.js gives every segment a hard
     * quadratic decay, which is right for a door creak and wrong for a tune - a
     * two-beat bass note that has already died away leaves the melody standing on
     * nothing. So music gets its own: a quick attack, a small drop to a sustain,
     * and a release inside the note's own length so consecutive notes separate.
     */
    function envelope(i, n) {
        const attack = Math.min(Math.floor(SR * 0.012), Math.floor(n * 0.2)) || 1;
        const release = Math.max(1, Math.floor(n * 0.22));
        const decay = Math.min(Math.floor(SR * 0.06), Math.max(1, n - attack - release));
        if (i < attack) return i / attack;
        if (i < attack + decay) return 1 - 0.25 * ((i - attack) / decay);
        if (i >= n - release) return 0.75 * ((n - i) / release);
        return 0.75;
    }

    function waveAt(wave, phase) {
        switch (wave) {
            case 'square': return Math.sin(phase) > 0 ? 0.36 : -0.36;
            case 'sawtooth': return ((phase / Math.PI) % 2) - 1;
            case 'triangle': return (2 / Math.PI) * Math.asin(Math.sin(phase));
            default: return Math.sin(phase);
        }
    }

    /**
     * Mix every voice into one mono buffer and wrap it as a WAV data URI.
     *
     * The buffer is exactly the tune's length in beats, so setting loop on the
     * Audio element repeats it in time with no gap and no double bar.
     */
    function render() {
        const t = tracks();
        const total = Math.floor(t.beats * BEAT * SR);
        const mix = new Float32Array(total);

        function lay(notes) {
            notes.forEach(function (note) {
                const start = Math.floor(note.at * BEAT * SR);
                const n = Math.floor(note.dur * BEAT * SR);
                const freq = freqOf(note.midi);
                const inc = (2 * Math.PI * freq) / SR;
                let phase = 0;
                for (let i = 0; i < n; i++) {
                    const at = start + i;
                    if (at >= total) break;
                    phase += inc;
                    mix[at] += waveAt(note.wave, phase) * envelope(i, n) * note.gain;
                }
            });
        }

        lay(t.bass);
        lay(t.arp);
        lay(t.harmony);
        lay(t.melody);

        // --- WAV ---
        const header = 44;
        const buffer = new ArrayBuffer(header + total * 2);
        const view = new DataView(buffer);
        function str(offset, s) {
            for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
        }
        str(0, 'RIFF');
        view.setUint32(4, header + total * 2 - 8, true);
        str(8, 'WAVE');
        str(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, SR, true);
        view.setUint32(28, SR * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        str(36, 'data');
        view.setUint32(40, total * 2, true);

        for (let i = 0; i < total; i++) {
            // A soft knee rather than a hard clamp: four voices can briefly sum
            // past 1, and a hard clamp on a sustained chord buzzes.
            let v = mix[i];
            v = v / (1 + Math.abs(v) * 0.35);
            v = Math.max(-1, Math.min(1, v));
            view.setInt16(header + i * 2, Math.round(v * 32767), true);
        }

        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return 'data:audio/wav;base64,' + btoa(binary);
    }

    // --- playback ---------------------------------------------------------------

    let audio = null;
    let building = false;
    let wanted = false;         // whether the game currently wants music playing

    /**
     * Build the loop and hand it to an Audio element.
     *
     * Deferred off the boot path: rendering a minute of audio is tens of
     * milliseconds of arithmetic plus a base64 pass, and the menu should be on
     * screen and scannable before any of that happens. The player can be part
     * way through the menu when it becomes ready, which is why start() is
     * re-checked at the end rather than assumed.
     */
    function build() {
        if (audio || building) return;
        building = true;
        setTimeout(function () {
            try {
                audio = new Audio();
                audio.loop = true;
                audio.preload = 'auto';
                // A recorded theme that will not load falls back to the mixdown,
                // the same way a missing sound effect falls back to its tone.
                //
                // Attached BEFORE the src is set, not after: a listener added
                // after the assignment is a listener that was not there when
                // the load began. Browsers happen to dispatch this one
                // asynchronously, so the old order worked - but it worked by
                // timing rather than by construction, and only one of those
                // can be relied on.
                if (FILE) {
                    let fellBack = false;
                    audio.addEventListener('error', function () {
                        // Once only. The fallback is a data URI and will not
                        // fail, but if it ever did this would be a loop.
                        if (fellBack) return;
                        fellBack = true;
                        console.warn('[NAF] Could not load "' + FILE +
                            '" - using the synthesised theme.');
                        audio.src = render();
                        if (wanted) play();
                    });
                }
                audio.src = FILE || render();
            } catch (e) {
                console.warn('[NAF] Could not build the theme tune:', e);
                audio = null;
            }
            building = false;
            if (wanted) play();
        }, 0);
    }

    /**
     * Close the gap at the end of a loop.
     *
     * `loop = true` on its own leaves an audible pause on an MP3, and the file
     * is not at fault: the format cannot represent an arbitrary length. An
     * encoder adds a delay at the start and pads the final frame out with
     * silence, so a "two minute" MP3 is really a fraction of a second longer
     * than the music in it, silence at both ends. Reaching the true end also
     * makes the browser tear down and restart the stream, which costs more
     * time again.
     *
     * So the loop is taken by hand: seek back to the start a hair BEFORE the
     * end, which skips the tail padding and never hits end-of-stream. `loop`
     * is left on underneath as a safety net for a late timer.
     *
     * TRIM is small enough not to clip a real ending and large enough to clear
     * typical encoder padding. A data-URI WAV needs none of this, so it is
     * skipped there - that one already loops seamlessly.
     */
    const LOOP_TRIM = 0.06;
    let loopTimer = null;

    function scheduleLoop() {
        clearTimeout(loopTimer);
        loopTimer = null;
        if (!audio || onSynth()) return;              // WAV loops cleanly already
        const d = audio.duration;
        if (!d || !isFinite(d)) return;               // metadata not in yet
        const left = (d - LOOP_TRIM) - audio.currentTime;
        loopTimer = setTimeout(function () {
            loopTimer = null;
            if (!audio || audio.paused) return;
            try { audio.currentTime = 0; } catch (e) { /* not seekable yet */ }
            scheduleLoop();
        }, Math.max(20, left * 1000));
    }

    function stopLoopTimer() {
        clearTimeout(loopTimer);
        loopTimer = null;
    }

    /** True while the element is playing the built-in mixdown, not the file. */
    function onSynth() {
        const src = audio ? (audio.currentSrc || audio.src || '') : '';
        return src.indexOf('data:') === 0;
    }

    /**
     * The level to play at, for whichever source is loaded.
     *
     * Deliberately NOT scaled by the effects volume. That setting has no control
     * in the interface, so multiplying by it would have quietly landed the music
     * lower again than intended. The player's control over the music is the
     * Music switch; its level is a fixed design decision, set so speech is
     * always clearly above it.
     */
    function level() {
        return onSynth() ? SYNTH_LEVEL : RECORDED_LEVEL;
    }

    /**
     * The Music switch, and nothing else.
     *
     * This used to be ANDed with the old `sfxEnabled` on the reasoning that it
     * was a master switch and silence should mean silence. In practice that
     * meant turning the effects down also killed the music, with no way to
     * tell why - two separate rows in Settings, one of which quietly overrode
     * the other. The music's own switch is the only thing that decides this.
     */
    function allowed() {
        return !!NAF.Settings.get('musicEnabled');
    }

    /**
     * Retry once the player touches something.
     *
     * Chromium refuses to start audio before the page has been interacted
     * with, and the game asks for music during boot - so the first play() is
     * routinely refused. Waiting for the next start() call is not enough: that
     * only comes on a screen CHANGE, so a player who sits on the main menu
     * (which is most of them, it is the first thing they see) gets silence for
     * as long as they stay there.
     *
     * So the first keypress or tap retries directly. Registered once, removed
     * once it has worked, and it asks for nothing that start() would not.
     */
    let unlockArmed = false;
    function armUnlock() {
        if (unlockArmed) return;
        unlockArmed = true;
        const events = ['pointerdown', 'keydown', 'touchstart'];
        const retry = function () {
            if (!wanted || !allowed() || !audio || !audio.paused) return done();
            const p = audio.play();
            if (p && p.then) p.then(done, function () { /* still refused; keep waiting */ });
            else done();
        };
        function done() {
            events.forEach(function (e) {
                document.removeEventListener(e, retry, true);
            });
            unlockArmed = false;
        }
        events.forEach(function (e) {
            document.addEventListener(e, retry, { capture: true, passive: true });
        });
    }

    /** Said once, so a silent game explains itself without spamming the log. */
    let blockedLogged = false;

    function play() {
        if (!audio) return;
        audio.volume = level();
        const p = audio.play();
        // Re-armed on every play(), because it is also how the timer restarts
        // after a pause, a zone change, or an autoplay refusal that later
        // succeeded. scheduleLoop() clears its own previous timer.
        scheduleLoop();
        if (p && p.catch) {
            p.catch(function (e) {
                // NotAllowedError is the autoplay policy, which is normal and
                // recoverable - see armUnlock. Anything else is worth saying
                // out loud, because it means the theme will not play at all.
                const blocked = e && e.name === 'NotAllowedError';
                if (blocked) {
                    if (!blockedLogged) {
                        blockedLogged = true;
                        console.info('[NAF] The theme is waiting for a first press ' +
                            'before it can start - autoplay is not allowed until then.');
                    }
                    armUnlock();
                    return;
                }
                console.warn('[NAF] The theme could not play:', e && (e.name + ': ' + e.message));
            });
        }
    }

    /** Ask for music. Called on every menu screen. */
    function start() {
        wanted = true;
        if (!allowed()) return;
        if (!audio) return build();
        play();
    }

    /** Stop, but remember that a menu would like it back. */
    function pause() {
        stopLoopTimer();
        if (audio && !audio.paused) audio.pause();
    }

    /** Leave the menus: stop wanting music at all. */
    function stop() {
        wanted = false;
        pause();
    }

    /** Re-read the settings. Called when the toggle or the volume changes. */
    function refresh() {
        if (!audio) {
            if (wanted && allowed()) build();
            return;
        }
        audio.volume = level();
        if (wanted && allowed()) play();
        else pause();
    }

    return {
        MUSIC_LEVEL: MUSIC_LEVEL,
        tracks: tracks,
        render: render,
        start: start,
        stop: stop,
        refresh: refresh,
        /**
         * Whether a loop exists and is sounding - for the verification harness,
         * and for answering "why can I not hear it" from the console.
         *
         * `source` is the useful one: 'recording' means the .mp3 is what is
         * loaded, 'synth' means it fell back to the built-in mixdown. Silence
         * with source 'recording' and playing false is the autoplay policy;
         * source 'synth' means the file did not load and there will be a
         * warning above saying so.
         */
        state: function () {
            const src = audio ? (audio.currentSrc || audio.src || '') : '';
            return {
                built: !!audio,
                playing: !!(audio && !audio.paused),
                source: !audio ? 'none' : (src.indexOf('data:') === 0 ? 'synth' : 'recording'),
                src: src.indexOf('data:') === 0 ? '(synthesised mixdown)' : src,
                wanted: wanted,
                allowed: allowed(),
                volume: audio ? audio.volume : 0,
                seconds: audio && audio.duration ? audio.duration : 0
            };
        }
    };
})();
