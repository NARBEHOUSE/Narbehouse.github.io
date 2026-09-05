/**
 * NARBE Animal Friends - the three zone theme songs.
 *
 * WHAT PLAYS: music/<zone>.mp3 - barn.mp3, aquarium.mp3, safari.mp3. See FILES
 * below. A zone whose recording is not there yet uses its synthesised mixdown
 * instead, so the three can arrive one at a time.
 *
 * Two-minute pieces, one per zone, played behind the GAME itself (the "play"
 * screen) rather than the menus - js/music.js's theme stops the moment a zone
 * is entered, and one of these three takes over. Same engine as music.js (a
 * WAV mixdown built with plain arithmetic, no AudioContext, no OscillatorNode -
 * see that file's header for why), same tools/make-midi.js pattern for
 * exporting a real .mid per zone, and the same recording-then-mixdown-fallback
 * tier. This file does not duplicate that machinery by copying it blindly; it
 * is genuinely the same shape because the problem is the same shape.
 *
 * Where this differs from the menu theme: three distinct pieces, not one, and
 * each one is built from a short hand-written MOTIF that is then carried
 * through several sections in different registers, instruments and rhythmic
 * feels - a bright statement, a livelier variation, a spacious bridge, the
 * motif's return doubled an octave up, a playful development, and a closing
 * cadence. That structure is what keeps two minutes from sounding like the
 * same sixteen bars three times over, and it is deliberately the family of
 * technique real short instrumental cues for children's shows use: one
 * memorable idea, developed, not several unrelated ideas stapled together.
 *
 * Level: GAME_MUSIC_LEVEL is deliberately very low - a bed you notice only as
 * "which place am I in", never as a tune competing with the spoken facts.
 * Speech is the channel a switch user cannot do without, so it always wins.
 */

window.NAF = window.NAF || {};

NAF.GameSong = (function () {
    'use strict';

    /**
     * The recorded theme per zone - same tier as music.js. Named after the
     * zone id, the way tools/make-midi.js already names the scores it writes
     * beside them. A zone whose file is not there yet falls back to its
     * synthesised mixdown, so these can arrive one at a time.
     */
    const FILES = {
        barn: 'music/barn.mp3',
        aquarium: 'music/aquarium.mp3',
        safari: 'music/safari.mp3'
    };

    const SR = 16000;

    /**
     * Two levels, for the same reason js/music.js has two - a mastered MP3
     * arrives near full scale where the synthesised mixdown peaks well below
     * it, so one number cannot serve both. Lower here than the menu's, because
     * this one plays UNDER the animal sounds and the spoken facts rather than
     * under a quiet menu: it should be enough to tell you which place you are
     * in and no more.
     */
    // Halved from 0.11 / 0.35, for the reason in js/music.js: this one plays
    // under the spoken facts, so it is the one that most got in their way.
    const RECORDED_LEVEL = 0.055;
    const SYNTH_LEVEL = 0.175;

    /** Kept as the module's headline level for anything that reports it. */
    const GAME_MUSIC_LEVEL = RECORDED_LEVEL;

    // --- pitch (identical approach to js/music.js) -------------------------

    const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

    function midiOf(name) {
        if (!name || name === 'R') return null;
        const letter = name.charAt(0).toUpperCase();
        let i = 1, semis = STEP[letter];
        if (semis === undefined) return null;
        if (name.charAt(1) === '#') { semis += 1; i = 2; }
        else if (name.charAt(1) === 'b') { semis -= 1; i = 2; }
        const octave = parseInt(name.slice(i), 10);
        return (octave + 1) * 12 + semis;
    }

    function freqOf(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

    /** Shift a note name by semitones, e.g. up('C4', 12) === 'C5'. Used to
     *  carry a hand-written section up or down an octave for its reprise
     *  without re-writing every note. */
    function up(name, semis) {
        const m = midiOf(name);
        if (m === null) return name;
        const n = m + semis;
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return names[n % 12] + (Math.floor(n / 12) - 1);
    }

    /** [name, beats] pairs -> the same shape shifted by semis, beats intact. */
    function shift(notes, semis) {
        return notes.map(function (n) { return [up(n[0], semis), n[1]]; });
    }

    // =========================================================================
    // BARN - bright, pastoral, C major. A bouncing four-note call-and-answer.
    // =========================================================================

    const BARN_BARS = [
        'C', 'F', 'G', 'C', 'Am', 'F', 'G', 'C',   // one 8-bar phrase, reused
        'C', 'F', 'G', 'C', 'Am', 'F', 'G', 'C',
        'F', 'G', 'Am', 'Em', 'F', 'G', 'C', 'C',   // bridge: further from home
        'C', 'F', 'G', 'C', 'Am', 'F', 'G', 'C',
        'C', 'Am', 'F', 'C', 'G', 'Am', 'F', 'G',   // development: reordered
        'F', 'G', 'Am', 'F', 'C', 'G', 'C', 'C'     // tag: settles home
    ];
    const BARN_CHORDS = {
        C: { bass: ['C3', 'G3'], arp: ['C4', 'E4', 'G4'] },
        F: { bass: ['F2', 'C3'], arp: ['F3', 'A3', 'C4'] },
        G: { bass: ['G2', 'D3'], arp: ['G3', 'B3', 'D4'] },
        Am: { bass: ['A2', 'E3'], arp: ['A3', 'C4', 'E4'] },
        Em: { bass: ['E2', 'B2'], arp: ['E3', 'G3', 'B3'] }
    };

    /** The theme, restated four times (sections 1, 2, 4, 5) and once bridged
     *  away from (section 3) before the tag - eight bars, 32 beats, each. */
    const BARN_THEME = [
        ['E4', 1], ['G4', 1], ['E4', 1], ['C4', 1],
        ['D4', 1], ['E4', 1], ['G4', 2],
        ['G4', 1], ['A4', 1], ['G4', 1], ['E4', 1],
        ['D4', 1], ['C4', 1], ['C4', 2],
        ['E4', 1], ['G4', 1], ['C5', 1], ['G4', 1],
        ['A4', 1], ['G4', 1], ['F4', 2],
        ['D4', 1], ['E4', 1], ['F4', 1], ['G4', 1],
        ['E4', 4]
    ];
    const BARN_BRIDGE = [
        ['A4', 1], ['G4', 1], ['F4', 1], ['E4', 1],
        ['D4', 2], ['C4', 2],
        ['E4', 1], ['D4', 1], ['C4', 1], ['B3', 1],
        ['A3', 2], ['G3', 2],
        ['C4', 1], ['E4', 1], ['G4', 1], ['A4', 1],
        ['G4', 2], ['F4', 2],
        ['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1],
        ['C4', 4]
    ];
    /** Eight bars, one per chord in the development's slice of BARN_BARS
     *  (C, Am, F, C, G, Am, F, G) - every section here spans exactly 32 beats
     *  so the melody never drifts out of step with the bass/arp timeline,
     *  which is built independently from the bar/chord list. */
    const BARN_DEV = [
        ['G4', 0.5], ['E4', 0.5], ['G4', 1], ['C5', 1], ['G4', 1],
        ['F4', 0.5], ['D4', 0.5], ['F4', 1], ['A4', 1], ['F4', 1],
        ['E4', 0.5], ['C4', 0.5], ['E4', 1], ['G4', 1], ['E4', 1],
        ['D4', 1], ['E4', 1], ['F4', 1], ['G4', 1],
        ['G4', 0.5], ['B4', 0.5], ['D5', 1], ['B4', 1], ['G4', 1],
        ['A4', 0.5], ['C5', 0.5], ['A4', 1], ['E4', 1], ['A4', 1],
        ['F4', 0.5], ['A4', 0.5], ['C5', 1], ['A4', 1], ['F4', 1],
        ['D5', 1], ['B4', 1], ['G4', 2]
    ];
    /** Eight bars over F, G, Am, F, C, G, C, C. */
    const BARN_TAG = [
        ['C5', 1], ['B4', 1], ['A4', 1], ['G4', 1],
        ['F4', 1], ['E4', 1], ['D4', 2],
        ['E4', 1], ['F4', 1], ['G4', 1], ['A4', 1],
        ['G4', 1], ['F4', 1], ['E4', 1], ['F4', 1],
        ['E4', 1], ['D4', 1], ['C4', 2],
        ['D4', 1], ['E4', 1], ['F4', 1], ['G4', 1],
        ['E4', 1], ['G4', 1], ['C5', 2],
        ['G4', 4]
    ];

    const BARN_SECTIONS = [
        { notes: BARN_THEME, wave: 'triangle', gain: 0.42, octave: 0 },
        { notes: BARN_THEME, wave: 'square', gain: 0.26, octave: 0 },
        { notes: BARN_BRIDGE, wave: 'sine', gain: 0.38, octave: 0 },
        { notes: BARN_THEME, wave: 'triangle', gain: 0.40, octave: 12 },
        { notes: BARN_DEV, wave: 'square', gain: 0.28, octave: 0 },
        { notes: BARN_TAG, wave: 'sine', gain: 0.42, octave: 0 }
    ];

    // =========================================================================
    // AQUARIUM - slow, airy, A major. Long, drifting phrases like something
    // gliding through open water, with a shimmering higher voice in the bridge
    // standing in for light on the surface.
    // =========================================================================

    const AQUA_BARS = [
        'A', 'E', 'F#m', 'D', 'A', 'E', 'D', 'A',
        'A', 'E', 'F#m', 'D', 'A', 'E', 'D', 'A',
        'F#m', 'D', 'A', 'E', 'F#m', 'D', 'E', 'E',
        'A', 'E', 'F#m', 'D', 'A', 'E', 'D', 'A',
        'D', 'A', 'E', 'F#m', 'D', 'A', 'E', 'A',
        'F#m', 'D', 'A', 'E', 'D', 'A', 'E', 'A'
    ];
    const AQUA_CHORDS = {
        A: { bass: ['A2', 'E3'], arp: ['A3', 'C#4', 'E4'] },
        E: { bass: ['E2', 'B2'], arp: ['E3', 'G#3', 'B3'] },
        D: { bass: ['D2', 'A2'], arp: ['D3', 'F#3', 'A3'] },
        'F#m': { bass: ['F#2', 'C#3'], arp: ['F#3', 'A3', 'C#4'] }
    };

    const AQUA_THEME = [
        ['C#5', 2], ['B4', 2], ['A4', 2], ['E4', 2],
        ['F#4', 2], ['A4', 2], ['E4', 4],
        ['E4', 2], ['C#5', 2], ['B4', 2], ['A4', 2],
        ['F#4', 2], ['E4', 2], ['A4', 4]
    ];
    const AQUA_BRIDGE = [
        ['E5', 1], ['C#5', 1], ['A4', 1], ['C#5', 1],
        ['B4', 1], ['A4', 1], ['F#4', 1], ['A4', 1],
        ['E5', 1], ['D5', 1], ['C#5', 1], ['B4', 1],
        ['A4', 1], ['F#4', 1], ['E4', 2],
        ['F#4', 1], ['A4', 1], ['C#5', 1], ['E5', 1],
        ['D5', 1], ['C#5', 1], ['B4', 1], ['A4', 1],
        ['B4', 1], ['A4', 1], ['F#4', 1], ['E4', 1],
        ['A4', 4]
    ];
    const AQUA_DEV = [
        ['A4', 1.5], ['B4', 0.5], ['C#5', 2], ['B4', 2],
        ['A4', 1.5], ['F#4', 0.5], ['E4', 2], ['F#4', 2],
        ['A4', 1.5], ['C#5', 0.5], ['E5', 2], ['C#5', 2],
        ['E4', 2], ['F#4', 2], ['A4', 2], ['B4', 2],
        ['B4', 1.5], ['A4', 0.5], ['F#4', 4]
    ];
    const AQUA_TAG = [
        ['C#5', 2], ['A4', 2], ['E4', 2], ['F#4', 2],
        ['B4', 2], ['A4', 2], ['F#4', 2], ['E4', 2],
        ['D4', 2], ['E4', 2], ['F#4', 2], ['A4', 2],
        ['A4', 2], ['E4', 6]
    ];

    const AQUA_SECTIONS = [
        { notes: AQUA_THEME, wave: 'sine', gain: 0.40, octave: 0 },
        { notes: AQUA_THEME, wave: 'sine', gain: 0.34, octave: -12 },
        { notes: AQUA_BRIDGE, wave: 'sine', gain: 0.26, octave: 0 },
        { notes: AQUA_THEME, wave: 'sine', gain: 0.42, octave: 12 },
        { notes: AQUA_DEV, wave: 'triangle', gain: 0.30, octave: 0 },
        { notes: AQUA_TAG, wave: 'sine', gain: 0.40, octave: 0 }
    ];

    // =========================================================================
    // SAFARI - warm, low, G major with a rolling, walking feel, like something
    // big moving steadily across open ground.
    // =========================================================================

    const SAFARI_BARS = [
        'G', 'C', 'D', 'G', 'Em', 'C', 'D', 'G',
        'G', 'C', 'D', 'G', 'Em', 'C', 'D', 'G',
        'C', 'D', 'Em', 'Bm', 'C', 'D', 'G', 'G',
        'G', 'C', 'D', 'G', 'Em', 'C', 'D', 'G',
        'Em', 'C', 'G', 'D', 'Em', 'C', 'D', 'G',
        'C', 'D', 'Em', 'C', 'G', 'D', 'G', 'G'
    ];
    const SAFARI_CHORDS = {
        G: { bass: ['G2', 'D3'], arp: ['G3', 'B3', 'D4'] },
        C: { bass: ['C2', 'G2'], arp: ['C3', 'E3', 'G3'] },
        D: { bass: ['D2', 'A2'], arp: ['D3', 'F#3', 'A3'] },
        Em: { bass: ['E2', 'B2'], arp: ['E3', 'G3', 'B3'] },
        Bm: { bass: ['B2', 'F#3'], arp: ['B3', 'D4', 'F#4'] }
    };

    const SAFARI_THEME = [
        ['D4', 1], ['D4', 0.5], ['E4', 0.5], ['G4', 1], ['D4', 1],
        ['C4', 1], ['B3', 1], ['G3', 2],
        ['D4', 1], ['D4', 0.5], ['E4', 0.5], ['G4', 1], ['B4', 1],
        ['A4', 1], ['G4', 1], ['D4', 2],
        ['G4', 1], ['G4', 0.5], ['A4', 0.5], ['B4', 1], ['G4', 1],
        ['E4', 1], ['D4', 1], ['B3', 2],
        ['C4', 1], ['D4', 1], ['E4', 1], ['G4', 1],
        ['D4', 4]
    ];
    const SAFARI_BRIDGE = [
        ['B4', 1], ['A4', 1], ['G4', 1], ['E4', 1],
        ['D4', 2], ['B3', 2],
        ['C4', 1], ['B3', 1], ['A3', 1], ['F#3', 1],
        ['G3', 2], ['D3', 2],
        ['B4', 1], ['G4', 1], ['D4', 1], ['G4', 1],
        ['A4', 2], ['G4', 2],
        ['E4', 1], ['D4', 1], ['C4', 1], ['B3', 1],
        ['G3', 4]
    ];
    /** Eight bars over Em, C, G, D, Em, C, D, G. */
    const SAFARI_DEV = [
        ['G4', 0.5], ['B4', 0.5], ['D5', 1], ['B4', 1], ['G4', 1],
        ['E4', 0.5], ['G4', 0.5], ['B4', 1], ['G4', 1], ['E4', 1],
        ['D4', 0.5], ['F#4', 0.5], ['A4', 1], ['D5', 1], ['A4', 1],
        ['B3', 1], ['D4', 1], ['E4', 1], ['G4', 1],
        ['G4', 0.5], ['E4', 0.5], ['G4', 1], ['B4', 1], ['G4', 1],
        ['C5', 0.5], ['A4', 0.5], ['G4', 1], ['E4', 1], ['C4', 1],
        ['D4', 0.5], ['F#4', 0.5], ['A4', 1], ['F#4', 1], ['D4', 1],
        ['G4', 4]
    ];
    /** Eight bars over C, D, Em, C, G, D, G, G. */
    const SAFARI_TAG = [
        ['E4', 1], ['G4', 1], ['C5', 1], ['G4', 1],
        ['F#4', 1], ['A4', 1], ['D5', 1], ['A4', 1],
        ['G4', 1], ['B4', 1], ['E5', 1], ['B4', 1],
        ['C5', 1], ['B4', 1], ['G4', 1], ['E4', 1],
        ['D5', 1], ['B4', 1], ['G4', 1], ['D4', 1],
        ['F#4', 1], ['D4', 1], ['A3', 2],
        ['B3', 1], ['D4', 1], ['G4', 1], ['B4', 1],
        ['G4', 4]
    ];

    const SAFARI_SECTIONS = [
        { notes: SAFARI_THEME, wave: 'triangle', gain: 0.40, octave: -12 },
        { notes: SAFARI_THEME, wave: 'sawtooth', gain: 0.20, octave: 0 },
        { notes: SAFARI_BRIDGE, wave: 'sine', gain: 0.32, octave: 0 },
        { notes: SAFARI_THEME, wave: 'triangle', gain: 0.40, octave: 0 },
        { notes: SAFARI_DEV, wave: 'sawtooth', gain: 0.22, octave: 0 },
        { notes: SAFARI_TAG, wave: 'triangle', gain: 0.40, octave: -12 }
    ];

    // --- assembling one zone's tracks --------------------------------------

    const ZONES = {
        barn: { bars: BARN_BARS, chords: BARN_CHORDS, sections: BARN_SECTIONS, bpm: 96 },
        aquarium: { bars: AQUA_BARS, chords: AQUA_CHORDS, sections: AQUA_SECTIONS, bpm: 90 },
        safari: { bars: SAFARI_BARS, chords: SAFARI_CHORDS, sections: SAFARI_SECTIONS, bpm: 100 }
    };

    /** Which bars get the busier arpeggio, per zone - the bridge and the
     *  development, same idea as the menu theme's middle section. */
    function arpBars(z) { return [16, 17, 18, 19, 20, 21, 22, 23, 32, 33, 34, 35, 36, 37]; }

    /**
     * The three voices as flat note lists, {midi, at, dur, wave, gain}, all in
     * beats - the same shape js/music.js builds and tools/make-midi.js reads.
     */
    function tracks(zoneId) {
        const z = ZONES[zoneId] || ZONES.barn;
        const melody = [];
        const harmony = [];
        let at = 0;

        z.sections.forEach(function (sec) {
            const notes = sec.octave ? shift(sec.notes, sec.octave) : sec.notes;
            notes.forEach(function (n) {
                const midi = midiOf(n[0]);
                if (midi !== null) {
                    melody.push({ midi: midi, at: at, dur: n[1], wave: sec.wave, gain: sec.gain });
                }
                at += n[1];
            });
        });

        const bass = [];
        const arp = [];
        const arpBarSet = arpBars(zoneId);
        z.bars.forEach(function (name, bar) {
            const chord = z.chords[name];
            if (!chord) return;
            const barAt = bar * 4;
            chord.bass.forEach(function (b, i) {
                bass.push({ midi: midiOf(b), at: barAt + i * 2, dur: 2, wave: 'sine', gain: 0.26 });
            });
            if (arpBarSet.indexOf(bar) === -1) return;
            const order = [0, 1, 2, 1, 0, 1, 2, 1];
            order.forEach(function (k, i) {
                arp.push({
                    midi: midiOf(chord.arp[k]) + 12, at: barAt + i * 0.5, dur: 0.45,
                    wave: 'sine', gain: 0.13
                });
            });
        });

        return {
            beats: z.bars.length * 4,
            bpm: z.bpm,
            melody: melody,
            harmony: harmony,
            bass: bass,
            arp: arp
        };
    }

    // --- rendering (identical technique to js/music.js) ---------------------

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

    function renderZone(zoneId) {
        const t = tracks(zoneId);
        const beat = 60 / t.bpm;
        const total = Math.floor(t.beats * beat * SR);
        const mix = new Float32Array(total);

        function lay(notes) {
            notes.forEach(function (note) {
                const start = Math.floor(note.at * beat * SR);
                const n = Math.floor(note.dur * beat * SR);
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

    // --- playback -------------------------------------------------------------

    const audio = {};       // one Audio element per zone, built on first use
    const building = {};
    let wanted = false;     // whether the "play" screen currently wants music
    let currentZone = null;

    function build(zoneId) {
        if (audio[zoneId] || building[zoneId]) return;
        building[zoneId] = true;
        setTimeout(function () {
            try {
                const el = new Audio();
                el.loop = true;
                el.preload = 'auto';
                // Listener before src, and once only - same reasoning as the
                // menu theme's build() in js/music.js.
                if (FILES[zoneId]) {
                    let fellBack = false;
                    el.addEventListener('error', function () {
                        if (fellBack) return;
                        fellBack = true;
                        console.warn('[NAF] Could not load "' + FILES[zoneId] +
                            '" - using the synthesised ' + zoneId + ' theme.');
                        el.src = renderZone(zoneId);
                        if (wanted && currentZone === zoneId) play(zoneId);
                    });
                }
                el.src = FILES[zoneId] || renderZone(zoneId);
                audio[zoneId] = el;
            } catch (e) {
                console.warn('[NAF] Could not build the ' + zoneId + ' theme:', e);
            }
            building[zoneId] = false;
            if (wanted && currentZone === zoneId) play(zoneId);
        }, 0);
    }

    /** True while this zone's element is on the built-in mixdown, not a file. */
    function onSynth(zoneId) {
        const el = audio[zoneId];
        const src = el ? (el.currentSrc || el.src || '') : '';
        return src.indexOf('data:') === 0;
    }

    function level(zoneId) {
        return onSynth(zoneId) ? SYNTH_LEVEL : RECORDED_LEVEL;
    }

    /**
     * Seek back just before the end rather than letting the browser restart
     * the stream - see the full note on scheduleLoop in js/music.js. An MP3
     * carries encoder padding at both ends that a plain `loop` plays through
     * as a pause.
     */
    const LOOP_TRIM = 0.06;
    const loopTimers = {};

    function scheduleLoop(zoneId) {
        clearTimeout(loopTimers[zoneId]);
        loopTimers[zoneId] = null;
        const el = audio[zoneId];
        if (!el || onSynth(zoneId)) return;
        const d = el.duration;
        if (!d || !isFinite(d)) return;
        const left = (d - LOOP_TRIM) - el.currentTime;
        loopTimers[zoneId] = setTimeout(function () {
            loopTimers[zoneId] = null;
            if (!el || el.paused) return;
            try { el.currentTime = 0; } catch (e) { /* not seekable yet */ }
            scheduleLoop(zoneId);
        }, Math.max(20, left * 1000));
    }

    function stopLoopTimer(zoneId) {
        clearTimeout(loopTimers[zoneId]);
        loopTimers[zoneId] = null;
    }

    /** Shares the one Music toggle with the menu theme - see js/music.js, and
     *  the note there on why nothing else is consulted. A single "is
     *  background music on" switch is simpler for the player than two, and the
     *  two themes never play at the same time regardless. */
    function allowed() {
        return !!NAF.Settings.get('musicEnabled');
    }

    /** Retry on the first press if autoplay refused - see armUnlock in
     *  js/music.js for why waiting for the next start() is not enough. */
    let unlockArmed = false;
    function armUnlock() {
        if (unlockArmed) return;
        unlockArmed = true;
        const events = ['pointerdown', 'keydown', 'touchstart'];
        const retry = function () {
            const el = currentZone ? audio[currentZone] : null;
            if (!wanted || !allowed() || !el || !el.paused) return done();
            const p = el.play();
            if (p && p.then) p.then(done, function () { /* still refused */ });
            else done();
        };
        function done() {
            events.forEach(function (e) { document.removeEventListener(e, retry, true); });
            unlockArmed = false;
        }
        events.forEach(function (e) {
            document.addEventListener(e, retry, { capture: true, passive: true });
        });
    }

    let blockedLogged = false;

    function play(zoneId) {
        const el = audio[zoneId];
        if (!el) return;
        el.volume = level(zoneId);
        const p = el.play();
        scheduleLoop(zoneId);
        if (p && p.catch) {
            p.catch(function (e) {
                if (e && e.name === 'NotAllowedError') {
                    if (!blockedLogged) {
                        blockedLogged = true;
                        console.info('[NAF] The ' + zoneId + ' theme is waiting for a ' +
                            'first press before it can start.');
                    }
                    armUnlock();
                    return;
                }
                console.warn('[NAF] The ' + zoneId + ' theme could not play:',
                    e && (e.name + ': ' + e.message));
            });
        }
    }

    function pauseAll() {
        Object.keys(audio).forEach(function (id) {
            stopLoopTimer(id);
            if (!audio[id].paused) audio[id].pause();
        });
    }

    /** Start (or switch to) a zone's theme. Safe to call every time the play
     *  screen is shown, including with the same zone - it is a no-op then. */
    function start(zoneId) {
        wanted = true;
        if (currentZone && currentZone !== zoneId) pauseAll();
        currentZone = zoneId;
        if (!allowed()) return;
        if (!audio[zoneId]) return build(zoneId);
        play(zoneId);
    }

    function stop() {
        wanted = false;
        pauseAll();
    }

    function refresh() {
        if (!currentZone) return;
        if (!audio[currentZone]) {
            if (wanted && allowed()) build(currentZone);
            return;
        }
        if (wanted && allowed()) play(currentZone);
        else pauseAll();
    }

    return {
        GAME_MUSIC_LEVEL: GAME_MUSIC_LEVEL,
        ZONE_IDS: Object.keys(ZONES),
        tracks: tracks,
        render: renderZone,
        start: start,
        stop: stop,
        refresh: refresh,
        /** See the note on NAF.Music.state - `source` says whether the zone's
         *  own .mp3 is loaded or it fell back to the synthesised mixdown. */
        state: function (zoneId) {
            const id = zoneId || currentZone;
            const el = id ? audio[id] : null;
            const src = el ? (el.currentSrc || el.src || '') : '';
            return {
                zone: id,
                built: !!el,
                playing: !!(el && !el.paused),
                source: !el ? 'none' : (src.indexOf('data:') === 0 ? 'synth' : 'recording'),
                src: src.indexOf('data:') === 0 ? '(synthesised mixdown)' : src,
                wanted: wanted,
                allowed: allowed(),
                volume: el ? el.volume : 0,
                seconds: el && el.duration ? el.duration : 0
            };
        }
    };
})();
