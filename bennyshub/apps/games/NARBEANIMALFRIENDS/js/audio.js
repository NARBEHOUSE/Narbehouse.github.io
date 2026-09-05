/**
 * NARBE Animal Friends - sound.
 *
 * Everything goes through the hub's SafeAudio. There is NO AudioContext and no
 * Web Audio anywhere in this game, which also rules out THREE.AudioListener and
 * THREE.PositionalAudio - they are Web Audio underneath and would take down the
 * renderer in the Electron desktop build. Depth is faked with volume and with a
 * pre-baked muffled variant of each call, never with a filter node.
 *
 * Placeholder effects are PCM WAV data URIs built here, the same trick
 * safe-audio.js uses for its own built-ins. That means every event in the audio
 * table has a real, distinct sound on day one, so the monitor-off acceptance
 * test can be run before a single file is recorded.
 *
 * The SafeAudio trap: preload(name, url) caches on first call, so a built-in
 * name pointed at a URL that 404s permanently shadows the synthesised sound with
 * no console error. Every name below is this game's own, prefixed `naf-`, and a
 * real file is only ever registered after it has been proven to load.
 */

window.NAF = window.NAF || {};

NAF.Audio = (function () {
    'use strict';

    const SR = 22050;

    // --- WAV building (no Web Audio) --------------------------------------------

    function writeString(view, offset, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    /**
     * Render a list of {freq, dur, wave, gain, sweepTo, noise} segments to a
     * mono 16-bit WAV data URI.
     */
    function renderWav(segments) {
        let total = 0;
        segments.forEach(function (s) { total += Math.floor(SR * s.dur); });

        const header = 44;
        const dataSize = total * 2;
        const buffer = new ArrayBuffer(header + dataSize);
        const view = new DataView(buffer);

        writeString(view, 0, 'RIFF');
        view.setUint32(4, header + dataSize - 8, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, SR, true);
        view.setUint32(28, SR * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        let write = 0;
        let phase = 0;
        segments.forEach(function (s) {
            const n = Math.floor(SR * s.dur);
            const gain = s.gain === undefined ? 0.6 : s.gain;
            const wave = s.wave || 'sine';
            const from = s.freq;
            const to = s.sweepTo === undefined ? s.freq : s.sweepTo;
            const attack = Math.max(1, Math.floor(n * (s.attack === undefined ? 0.04 : s.attack)));

            for (let i = 0; i < n; i++) {
                const t = i / n;
                const freq = from + (to - from) * t;
                phase += (2 * Math.PI * freq) / SR;
                let sample;
                switch (wave) {
                    case 'square': sample = Math.sin(phase) > 0 ? 0.5 : -0.5; break;
                    case 'sawtooth': sample = ((phase / Math.PI) % 2) - 1; break;
                    case 'triangle': sample = (2 / Math.PI) * Math.asin(Math.sin(phase)); break;
                    case 'noise': sample = (Math.random() * 2 - 1); break;
                    default: sample = Math.sin(phase);
                }
                if (s.noise) sample = sample * (1 - s.noise) + (Math.random() * 2 - 1) * s.noise;

                // Soft attack, quadratic release. No sudden attack at the start.
                let env = 1;
                if (i < attack) env = i / attack;
                const rel = 1 - t;
                env *= rel * rel;

                let v = sample * env * gain;
                v = Math.max(-1, Math.min(1, v));
                view.setInt16(header + write * 2, Math.floor(v * 32767), true);
                write++;
            }
        });

        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return 'data:audio/wav;base64,' + btoa(binary);
    }

    // --- the sound table --------------------------------------------------------
    //
    // Every visual event has a distinct entry. If something happens on screen and
    // nothing happens in the speakers, that is a bug.
    //
    // `file` is the recorded asset once it exists; `gentle` is the calmer variant
    // shipped alongside it. `synth` is the placeholder that also covers a failed
    // load, so nothing here can ever fail silently.

    const TABLE = {
        'press':      { file: 'sounds/latch.wav',        gentleFile: 'sounds/latch-soft.wav',
                        synth: [{ freq: 180, dur: 0.05, wave: 'square', gain: 0.5, noise: 0.5, attack: 0.01 },
                                { freq: 90, dur: 0.07, wave: 'triangle', gain: 0.35 }] },
        'rattle':     { file: 'sounds/door-rattle.wav',  gentleFile: null,
                        synth: [{ freq: 120, dur: 0.10, wave: 'noise', gain: 0.28 },
                                { freq: 100, dur: 0.10, wave: 'noise', gain: 0.20 },
                                { freq: 140, dur: 0.08, wave: 'noise', gain: 0.24 }] },
        'creak':      { file: 'sounds/door-creak.wav',   gentleFile: 'sounds/door-creak-soft.wav',
                        synth: [{ freq: 220, sweepTo: 330, dur: 0.55, wave: 'sawtooth', gain: 0.22, noise: 0.25, attack: 0.25 }] },
        'thump':      { file: 'sounds/door-close.wav',   gentleFile: 'sounds/door-close-soft.wav',
                        synth: [{ freq: 110, sweepTo: 70, dur: 0.16, wave: 'triangle', gain: 0.55, noise: 0.2, attack: 0.01 },
                                { freq: 170, dur: 0.05, wave: 'square', gain: 0.3, noise: 0.5 }] },
        'footsteps':  { file: 'sounds/footsteps.wav',    gentleFile: null,
                        synth: [{ freq: 150, dur: 0.06, wave: 'noise', gain: 0.20 },
                                { freq: 0.001, dur: 0.10, wave: 'sine', gain: 0 },
                                { freq: 140, dur: 0.06, wave: 'noise', gain: 0.18 },
                                { freq: 0.001, dur: 0.10, wave: 'sine', gain: 0 },
                                { freq: 155, dur: 0.06, wave: 'noise', gain: 0.20 }] },
        'landing':    { file: 'sounds/landing.wav',      gentleFile: null,
                        synth: [{ freq: 95, sweepTo: 60, dur: 0.18, wave: 'sine', gain: 0.45, noise: 0.15, attack: 0.01 }] },
        'stamp':      { file: 'sounds/stamp.wav',        gentleFile: null,
                        synth: [{ freq: 320, dur: 0.05, wave: 'square', gain: 0.4, noise: 0.35, attack: 0.01 },
                                { freq: 140, dur: 0.12, wave: 'triangle', gain: 0.45 }] },
        'fanfare':    { file: 'sounds/fanfare.wav',      gentleFile: 'sounds/fanfare-soft.wav',
                        synth: [{ freq: 523, dur: 0.14, wave: 'triangle', gain: 0.5 },
                                { freq: 659, dur: 0.14, wave: 'triangle', gain: 0.5 },
                                { freq: 784, dur: 0.14, wave: 'triangle', gain: 0.5 },
                                { freq: 1047, dur: 0.34, wave: 'triangle', gain: 0.55 }] },
        // Scanning walks up a pentatonic scale rather than repeating one beep, so
        // moving along a row of animals sounds like a little tune. Five notes,
        // because five never lands on a sour interval however long the row is.
        'blip':       { file: null, gentleFile: null,
                        synth: [{ freq: 587, dur: 0.06, wave: 'sine', gain: 0.32 }] },
        'blip1':      { file: null, gentleFile: null,
                        synth: [{ freq: 659, dur: 0.06, wave: 'sine', gain: 0.32 }] },
        'blip2':      { file: null, gentleFile: null,
                        synth: [{ freq: 784, dur: 0.06, wave: 'sine', gain: 0.32 }] },
        'blip3':      { file: null, gentleFile: null,
                        synth: [{ freq: 880, dur: 0.06, wave: 'sine', gain: 0.32 }] },
        'blip4':      { file: null, gentleFile: null,
                        synth: [{ freq: 1047, dur: 0.06, wave: 'sine', gain: 0.30 }] },
        // Rides on top of the door creak: a rising sweep and a sparkle, so the
        // doors opening sounds like something good is about to happen.
        'whoosh':     { file: null, gentleFile: null,
                        synth: [{ freq: 220, sweepTo: 660, dur: 0.42, wave: 'sine', gain: 0.26, attack: 0.3 }] },
        'sparkle':    { file: null, gentleFile: null,
                        synth: [{ freq: 1319, dur: 0.05, wave: 'sine', gain: 0.22 },
                                { freq: 1568, dur: 0.05, wave: 'sine', gain: 0.22 },
                                { freq: 2093, dur: 0.09, wave: 'sine', gain: 0.20 }] },
        // A friend joining the barnyard. Warm and short, not a sticker thunk.
        'friend':     { file: 'sounds/friend.wav', gentleFile: null,
                        synth: [{ freq: 784, dur: 0.09, wave: 'triangle', gain: 0.40 },
                                { freq: 1047, dur: 0.09, wave: 'triangle', gain: 0.40 },
                                { freq: 1319, dur: 0.22, wave: 'triangle', gain: 0.38 }] },
        'confirm':    { file: null, gentleFile: null,
                        synth: [{ freq: 700, dur: 0.06, wave: 'sine', gain: 0.4 },
                                { freq: 1050, dur: 0.10, wave: 'sine', gain: 0.4 }] },
        'nudge':      { file: null, gentleFile: null,
                        synth: [{ freq: 420, sweepTo: 320, dur: 0.10, wave: 'triangle', gain: 0.28 }] },
        'bloom':      { file: null, gentleFile: null,
                        synth: [{ freq: 880, dur: 0.10, wave: 'sine', gain: 0.22 },
                                { freq: 1320, dur: 0.28, wave: 'sine', gain: 0.18 }] },
        // The four-note tune that rises while the player waits and wonders.
        'barnsong':   { file: 'sounds/barn-song.wav',    gentleFile: 'sounds/barn-song-soft.wav',
                        synth: [{ freq: 392, dur: 0.16, wave: 'triangle', gain: 0.30 },
                                { freq: 494, dur: 0.16, wave: 'triangle', gain: 0.30 },
                                { freq: 587, dur: 0.16, wave: 'triangle', gain: 0.32 },
                                { freq: 784, dur: 0.26, wave: 'triangle', gain: 0.34 }] },
        // Heard through the closed doors before we know who it is.
        'murmur':     { file: null, gentleFile: null,
                        synth: [{ freq: 150, sweepTo: 190, dur: 0.30, wave: 'sine', gain: 0.20, noise: 0.1, attack: 0.3 }] },
        // A little bird trilling somewhere off in the yard. Played now and then
        // during looking time, never every reveal, so the barnyard occasionally
        // feels alive around the animal rather than only at the doors.
        'birdchirp':  { file: 'sounds/birdchirp.wav', gentleFile: null,
                        synth: [{ freq: 2200, sweepTo: 2800, dur: 0.05, wave: 'sine', gain: 0.20 },
                                { freq: 2400, sweepTo: 1800, dur: 0.06, wave: 'sine', gain: 0.18 },
                                { freq: 2600, sweepTo: 3100, dur: 0.05, wave: 'sine', gain: 0.16 }] },

        // --- the aquarium ---------------------------------------------------
        // A glass hatch, not a wooden door: a soft slide and a run of bubbles
        // rather than a creak.
        'tap':        { file: 'sounds/aquarium/tap.wav', gentleFile: null,
                        synth: [{ freq: 900, dur: 0.05, wave: 'sine', gain: 0.42, attack: 0.01 },
                                { freq: 1400, dur: 0.06, wave: 'sine', gain: 0.24 }] },
        'bubbles':    { file: 'sounds/aquarium/bubbles.wav', gentleFile: null,
                        synth: [{ freq: 420, sweepTo: 760, dur: 0.09, wave: 'sine', gain: 0.24 },
                                { freq: 520, sweepTo: 900, dur: 0.08, wave: 'sine', gain: 0.20 },
                                { freq: 620, sweepTo: 1080, dur: 0.10, wave: 'sine', gain: 0.22 }] },
        // A gentle splash and a rush of water as the animal swims into view -
        // there is no hatch to slide, so this replaces that sound entirely.
        'splashin':   { file: 'sounds/aquarium/splash-in.wav', gentleFile: null,
                        synth: [{ freq: 260, sweepTo: 520, dur: 0.22, wave: 'sine', gain: 0.24, noise: 0.20, attack: 0.15 },
                                { freq: 900, sweepTo: 1400, dur: 0.16, wave: 'sine', gain: 0.14 }] },
        // The same splash in reverse contour, as it swims back out of view.
        'splashout':  { file: 'sounds/aquarium/splash-out.wav', gentleFile: null,
                        synth: [{ freq: 520, sweepTo: 220, dur: 0.24, wave: 'sine', gain: 0.24, noise: 0.18, attack: 0.02 },
                                { freq: 1200, sweepTo: 700, dur: 0.14, wave: 'sine', gain: 0.12 }] },
        'tanksong':   { file: 'sounds/aquarium/song.wav', gentleFile: null,
                        synth: [{ freq: 523, dur: 0.16, wave: 'sine', gain: 0.28 },
                                { freq: 622, dur: 0.16, wave: 'sine', gain: 0.28 },
                                { freq: 784, dur: 0.16, wave: 'sine', gain: 0.30 },
                                { freq: 1047, dur: 0.28, wave: 'sine', gain: 0.30 }] },
        // A soft glint of light through the water. The aquarium's version of the
        // barn's bird chirp - an occasional, gentle bit of life in the tank.
        'shimmer':    { file: 'sounds/aquarium/shimmer.wav', gentleFile: null,
                        synth: [{ freq: 1600, sweepTo: 2200, dur: 0.14, wave: 'sine', gain: 0.16 },
                                { freq: 2000, sweepTo: 2600, dur: 0.16, wave: 'sine', gain: 0.13 }] },

        // --- the safari -----------------------------------------------------
        // A heavy timber gate: a deep swing and a solid clunk.
        'gateopen':   { file: 'sounds/safari/gate-open.wav', gentleFile: null,
                        synth: [{ freq: 130, sweepTo: 190, dur: 0.48, wave: 'sawtooth', gain: 0.22, noise: 0.28, attack: 0.24 }] },
        'gateclose':  { file: 'sounds/safari/gate-close.wav', gentleFile: null,
                        synth: [{ freq: 150, sweepTo: 80, dur: 0.24, wave: 'triangle', gain: 0.52, noise: 0.22, attack: 0.01 },
                                { freq: 220, dur: 0.07, wave: 'square', gain: 0.26, noise: 0.4 }] },
        'safarisong': { file: 'sounds/safari/song.wav', gentleFile: null,
                        synth: [{ freq: 349, dur: 0.15, wave: 'triangle', gain: 0.30 },
                                { freq: 440, dur: 0.15, wave: 'triangle', gain: 0.30 },
                                { freq: 523, dur: 0.15, wave: 'triangle', gain: 0.32 },
                                { freq: 698, dur: 0.26, wave: 'triangle', gain: 0.32 }] },
        // A distant call out on the savanna. The safari's version of the barn's
        // bird chirp - low and short, easy to mistake for the wind at first.
        'critter':    { file: 'sounds/safari/critter.wav', gentleFile: null,
                        synth: [{ freq: 480, sweepTo: 620, dur: 0.10, wave: 'triangle', gain: 0.18 },
                                { freq: 420, sweepTo: 340, dur: 0.14, wave: 'triangle', gain: 0.16 }] }
    };

    /** Names that resolved to a real recorded file, so play() can prefer them. */
    const fileBacked = {};
    /** How long each of those files runs, in ms - see tryFile. */
    const fileMs = {};
    let ready = false;

    function key(name) { return 'naf-' + name; }
    function fileKey(name) { return 'naf-' + name + '-file'; }
    /** Namespaced away from the TABLE names, so an animal called 'sparkle'
     *  could never shadow the sparkle effect. */
    function animalKey(id) { return 'animal:' + id; }

    /**
     * Probe a URL by loading it into an Audio element. Only on success do we
     * register it with SafeAudio, which sidesteps the caching trap entirely: a
     * file that 404s never gets preloaded, so it can never shadow anything.
     */
    function tryFile(name, url, safeName, onMissing) {
        if (!url) return;
        const probe = new Audio();
        let settled = false;
        probe.addEventListener('canplaythrough', function () {
            if (settled) return;
            settled = true;
            window.SafeAudio.preload(safeName, url);
            fileBacked[name] = safeName;
            // How long the file runs for, taken while we have an element that
            // knows. The reveal needs it to work out when the animal has
            // finished making its noise, and this probe is the only place the
            // duration is ever going: SafeAudio takes a URL and gives nothing
            // back to ask.
            if (isFinite(probe.duration) && probe.duration > 0) {
                fileMs[name] = Math.round(probe.duration * 1000);
            }
        });
        probe.addEventListener('error', function () {
            if (settled) return;
            settled = true;
            if (onMissing) { onMissing(); return; }
            console.warn('[NAF] Missing sound file "' + url + '" - using the placeholder tone for "' + name + '".');
        });
        probe.preload = 'auto';
        probe.src = url;
    }

    /**
     * One line about the animals with no recording yet, rather than sixty.
     *
     * A missing animal recording is the NORMAL state while the folder is being
     * filled in, so it is not each-one-is-a-problem news the way a missing
     * effect is - and unlike an effect there is no placeholder tone to mention,
     * because the fallback is to speak the animal's sound word instead. The log
     * is debounced rather than timed: it fires once the last probe has given
     * up, whenever that happens to be.
     */
    const missingAnimals = [];
    let missingTimer = null;
    function noteMissingAnimal(id) {
        missingAnimals.push(id);
        clearTimeout(missingTimer);
        missingTimer = setTimeout(function () {
            const total = NAF.Zones.list.reduce(function (n, z) { return n + z.animals.length; }, 0);
            console.info('[NAF] ' + missingAnimals.length + ' of ' + total +
                ' animals have no recording yet and will have their sound word ' +
                'spoken instead. Drop sounds/animals/<id>.wav in to change that: ' +
                missingAnimals.join(', '));
        }, 500);
    }

    function init() {
        if (ready) return;
        ready = true;

        if (!window.SafeAudio) {
            console.warn('[NAF] SafeAudio is not loaded. The game will run silently except for speech.');
            return;
        }

        Object.keys(TABLE).forEach(function (name) {
            const entry = TABLE[name];
            // The placeholder registers first and unconditionally, so every name in
            // the table always resolves to something audible.
            window.SafeAudio.preload(key(name), renderWav(entry.synth));
            tryFile(name, entry.file, fileKey(name));
        });

        // The animals' own recordings - sounds/animals/<id>.wav, one each. There
        // is no synthesised placeholder behind these: a made-up tone is not a
        // cow, and an animal with no recording is better served by having its
        // sound word spoken (see NAF.Say.reveal) than by a beep. tryFile only
        // registers what actually loads, so a missing file costs one 404 at boot
        // and nothing after that.
        //
        // Every zone is registered, not just the current one: init() runs once
        // and changing zone does not re-run it.
        NAF.Zones.list.forEach(function (zone) {
            zone.animals.forEach(function (a) {
                const url = a.sounds && a.sounds.call;
                if (!url) return;
                tryFile(animalKey(a.id), url, 'naf-animal-' + a.id, function () {
                    noteMissingAnimal(a.id);
                });
            });
        });

        applyVolume();
        // Enabled unconditionally. The doors, the footsteps, the sparkle, the
        // scan blips and the fanfare are how a switch user knows their press
        // registered and that the game is doing something - so there is no
        // setting that silences them, and nothing here reads one. The only
        // sound with a switch of its own is the animals' recordings; see
        // animalSoundPlays below.
        window.SafeAudio.setEnabled(true);
    }

    function applyVolume() {
        // SafeAudio has no master-volume setter (see shared/safe-audio.js) -
        // play() and playAnimal() below already multiply NAF.Settings.get('volume')
        // into every call, so there is nothing to push here.
    }

    /**
     * Play an event sound. `volumeScale` fakes distance - a call from inside the
     * barn is quieter than one in the doorway.
     */
    function play(name, volumeScale) {
        if (!window.SafeAudio) return;
        const entry = TABLE[name];
        if (!entry) { console.warn('[NAF] Unknown sound "' + name + '".'); return; }

        const gentle = NAF.Settings.get('gentleSounds');
        const scale = volumeScale === undefined ? 1 : volumeScale;
        const vol = Math.max(0, Math.min(1, NAF.Settings.get('volume') * scale * (gentle ? 0.7 : 1)));

        const backed = fileBacked[name];
        window.SafeAudio.play(backed || key(name), vol);
    }

    /**
     * Whether this animal's recording will actually be HEARD: it has to have
     * loaded, and Animal Sounds has to be on.
     *
     * Both halves matter to the same question, which is why they are answered
     * together in one place. The recording and the spoken sound word are two
     * renditions of the same thing, so exactly one of them should happen - and
     * NAF.Say.reveal decides which by asking this. Were this only "has a file
     * loaded", turning Animal Sounds off would lose the recording AND keep the
     * word suppressed, and the animal would arrive making no sound at all in
     * either form.
     *
     * The probe at boot is asynchronous, so this can be false for a moment on
     * the very first reveal of a session and that animal gets its word spoken.
     * That is the same answer as having no recording, which is a fallback the
     * game already has to be right about.
     */
    function animalSoundPlays(animal) {
        if (!NAF.Settings.get('animalSounds')) return false;
        return !!(animal && fileBacked[animalKey(animal.id)]);
    }

    /**
     * How long this animal's call will sound for, in ms, or 0 if it will not
     * sound at all.
     *
     * The reveal times the rest of itself against this: with nothing being
     * read out, the animal's own noise is the only content there is, and how
     * long to hold before putting it away should follow the noise rather than
     * a fixed setting. 900 is the fallback for a file that loaded but never
     * reported a duration - about what the recording guidance asks for.
     */
    function animalSoundMs(animal) {
        if (!animalSoundPlays(animal)) return 0;
        return fileMs[animalKey(animal.id)] || 900;
    }

    /** An animal's own recorded call. Silent if it has none, or if the player
     *  has turned Animal Sounds off. */
    function playAnimal(animal, volumeScale) {
        if (!window.SafeAudio || !animalSoundPlays(animal)) return;
        const gentle = NAF.Settings.get('gentleSounds');
        const scale = volumeScale === undefined ? 1 : volumeScale;
        const vol = Math.max(0, Math.min(1,
            NAF.Settings.get('volume') * scale * (gentle ? 0.7 : 1)));
        window.SafeAudio.play(fileBacked[animalKey(animal.id)], vol);
    }

    /**
     * The four-note tune that rises while the player waits and wonders, unless
     * they have turned it off. Each zone has its own: the barn's is a major
     * run on a triangle, the tank's a clean sine arpeggio, the safari's a
     * lower, warmer figure.
     */
    function barnSong() {
        if (!NAF.Settings.get('barnSong')) return;
        play(NAF.Zones.current().sounds.song, 0.75);
    }

    /**
     * The next note in the scan tune. Walks up and starts over, so a long row
     * climbs rather than droning on one pitch.
     */
    let scanNote = 0;
    function scanBlip() {
        const names = ['blip', 'blip1', 'blip2', 'blip3', 'blip4'];
        play(names[scanNote % names.length], 0.7);
        scanNote++;
    }

    /** Reset the tune so each new row of animals starts from the bottom note. */
    function resetScanTune() { scanNote = 0; }

    return {
        init: init,
        play: play,
        playAnimal: playAnimal,
        animalSoundPlays: animalSoundPlays,
        animalSoundMs: animalSoundMs,
        scanBlip: scanBlip,
        resetScanTune: resetScanTune,
        barnSong: barnSong,
        applyVolume: applyVolume,
        renderWav: renderWav
    };
})();

/**
 * Speech, through the hub's voice manager. Never keeps its own copy of whether
 * TTS is on or which voice is chosen, and never blocks input.
 */
NAF.Voice = (function () {
    'use strict';

    function available() {
        return !!(window.NarbeVoiceManager && window.NarbeVoiceManager.speak);
    }

    /** Hand one line straight to the shared manager, no queueing. */
    function rawSpeak(text) {
        try {
            window.NarbeVoiceManager.speak(text);
        } catch (e) {
            console.warn('[NAF] Speech failed:', e);
        }
    }

    /**
     * Lines waiting their turn, and when the one currently being read is
     * expected to finish.
     *
     * The shared voice manager's own speak() calls speechSynthesis.cancel()
     * UNCONDITIONALLY before every line (see voice-manager.js) - so a second
     * line started while a first is still being read does not queue behind
     * it, it kills it mid-sentence. That is not something this game can fix
     * in place, because that file is shared by every app in the hub. So
     * `{ interrupt: false }` is honoured HERE instead: the line is held back
     * and handed over only once the previous one should be done, which is the
     * behaviour every caller already assumed it had.
     *
     * Held back by ESTIMATE, since there is no completion callback to wait on
     * - see estimateMs below. A line that runs slightly long is clipped at
     * the very end rather than cut off in the middle, which is the failure
     * mode worth having.
     */
    let queue = [];
    let speakingUntil = 0;
    let pumpTimer = null;

    function pump() {
        pumpTimer = null;
        if (!queue.length) return;
        const now = Date.now();
        if (now < speakingUntil) {
            pumpTimer = setTimeout(pump, (speakingUntil - now) + 40);
            return;
        }
        const next = queue.shift();
        // gap keeps a beat of silence AFTER this line before the next one
        // starts, for callers that want two lines heard as two separate
        // thoughts rather than run together.
        const hold = estimateMs(next.text) + next.gap;
        speakingUntil = now + hold;
        rawSpeak(next.text);
        if (queue.length) pumpTimer = setTimeout(pump, hold + 40);
    }

    /**
     * opts.interrupt  false to wait for whatever is being read to finish
     * opts.gapAfter   ms of silence to leave after this line, queued mode only
     */
    function speak(text, opts) {
        if (!text || !available()) return;
        opts = opts || {};

        // The default: this line matters more than whatever is being said now.
        // Everything waiting is dropped and this one starts immediately.
        if (opts.interrupt !== false) {
            queue = [];
            if (pumpTimer) { clearTimeout(pumpTimer); pumpTimer = null; }
            try {
                if (window.NarbeVoiceManager.cancel) window.NarbeVoiceManager.cancel();
            } catch (e) { /* speech is never load-bearing */ }
            speakingUntil = Date.now() + estimateMs(text);
            rawSpeak(text);
            return;
        }

        queue.push({ text: String(text), gap: opts.gapAfter || 0 });
        pump();
    }

    /**
     * How much longer speech will be going on: what is left of the line being
     * read, plus every line still waiting. Callers time captions and hold
     * animations against this rather than guessing.
     */
    function busyMs() {
        let ms = Math.max(0, speakingUntil - Date.now());
        queue.forEach(function (q) { ms += estimateMs(q.text) + q.gap; });
        return ms;
    }

    function cancel() {
        queue = [];
        if (pumpTimer) { clearTimeout(pumpTimer); pumpTimer = null; }
        speakingUntil = 0;
        try {
            if (available() && window.NarbeVoiceManager.cancel) window.NarbeVoiceManager.cancel();
        } catch (e) { /* speech is never load-bearing */ }
    }

    function ttsEnabled() {
        try {
            return !!(window.NarbeVoiceManager && window.NarbeVoiceManager.getSettings().ttsEnabled);
        } catch (e) {
            return false;
        }
    }

    /**
     * How long, in milliseconds, this text will roughly take a TTS voice to
     * say. The shared voice manager has no completion callback to ask instead
     * (it is a private closure shared by every hub game), so anything that
     * needs to wait for speech to finish - such as a caption disappearing, or
     * the reveal not putting an animal away mid-sentence - has to estimate
     * from the words themselves.
     *
     * ~2.6 words/second is what the shared voice manager actually delivers at
     * its default rate of 1.0 (see voice-manager.js). Guessing slower than the
     * voice really is does not make anything safer - it just leaves a caption
     * sitting on screen for seconds after the reading has finished, which is
     * its own bug. The short tail callers add on top is what covers a voice
     * running a little long; this estimate's job is to be close.
     * The fixed lead-in covers the engine's own start-up delay before sound
     * actually begins.
     */
    function estimateMs(text) {
        if (!text) return 0;
        const words = String(text).trim().split(/\s+/).filter(Boolean).length;
        if (!words) return 0;
        return 600 + Math.round((words / 2.6) * 1000);
    }

    return {
        speak: speak,
        cancel: cancel,
        ttsEnabled: ttsEnabled,
        available: available,
        estimateMs: estimateMs,
        busyMs: busyMs
    };
})();
