/**
 * NARBE Animal Friends - settings, progress and spoken-phrase building.
 *
 * Access settings (TTS, voice, auto scan, scan speed) belong to the shared
 * managers. This file never copies them; it only stores what is this game's own.
 *
 * NAF.Say lives here rather than in its own file because every line it produces
 * is a pure function of the Talking settings below.
 */

window.NAF = window.NAF || {};

NAF.Settings = (function () {
    'use strict';

    const SETTINGS_KEY = 'naf-settings-v1';
    /**
     * Only ever REMOVED, never read or written - see load().
     *
     * The friend board is deliberately not saved. These are short games meant
     * to be picked up and put down, and a board that carried over meant a
     * player could arrive to four stamps already filled by whoever used the
     * device last, with no way to tell why - which is also the only reason
     * there had to be a Reset Progress button to undo it. Starting empty every
     * launch removes the problem and the button both.
     */
    const PROGRESS_KEY = 'naf-progress-v1';

    const HIGHLIGHT_COLORS = [
        // FOUR BRIGHT, FIVE DARK, and that balance is the point.
        //
        // The highlight has to be seen against a cream button, against red
        // barn planks, green grass, blue water, pale tank sand, dry safari
        // gold and open sky. No single colour does all of that, so the list
        // has to offer both ends: a bright colour wins over the dark and mid
        // backdrops, a dark one wins over the pale ones. Checked by measuring
        // rather than by eye - every entry clears 3:1 (the WCAG floor for a
        // graphical indicator) against at least one real backdrop in the
        // game, every backdrop has at least one entry that clears it, and
        // every `ink` clears 4.5:1 on its own colour so the label stays
        // readable when the Block style paints the button in it.
        //
        // Magenta, Orange and a light Pink used to be here and are not any
        // more: measured against these particular backgrounds they cleared
        // 3:1 against NONE of them. They looked like choices while being
        // choices that could not work, which is worse than a shorter list.
        // Their slots are reused rather than removed, since the saved value
        // is an INDEX - Blue, Violet and a darker Pink now hold them, all
        // three of which cover the pale backdrops the bright colours cannot.
        { name: 'Gold', color: '#ffd700', ink: '#1a1008' },
        { name: 'Cyan', color: '#00e5ff', ink: '#1a1008' },
        { name: 'Blue', color: '#0040dd', ink: '#ffffff' },
        { name: 'Lime', color: '#00ff00', ink: '#1a1008' },
        { name: 'Red', color: '#d32f2f', ink: '#ffffff' },
        { name: 'Violet', color: '#6a1b9a', ink: '#ffffff' },
        { name: 'Pink', color: '#c2185b', ink: '#ffffff' },
        { name: 'White', color: '#ffffff', ink: '#1a1008' },
        { name: 'Black', color: '#000000', ink: '#ffffff' }
    ];

    // Every duration here is for the implementer. None of these numbers are ever
    // spoken or printed - see ACCESSIBILITY.md section 4.
    const WAIT_AND_WONDER = [
        { name: 'Short', ms: 500 },
        { name: 'Normal', ms: 900 },
        { name: 'Long', ms: 1600 }
    ];
    const LOOKING_TIME = [
        { name: 'Quick', ms: 2500 },
        { name: 'Normal', ms: 4500 },
        { name: 'Long', ms: 8000 },
        { name: 'Very Long', ms: 14000 }
    ];
    const DOOR_SPEED = [
        { name: 'Slow', ms: 1800 },
        { name: 'Normal', ms: 1100 },
        { name: 'Quick', ms: 700 }
    ];

    /** Must match the ids in zones.js. See the note in clamp() for why it is here. */
    const ZONE_IDS = ['barn', 'aquarium', 'safari'];

    const PRESETS = ['full', 'bright', 'contrast', 'simple'];
    const PRESET_NAMES = {
        full: 'Full Farm',
        bright: 'Bright',
        contrast: 'High Contrast',
        simple: 'Simple'
    };

    const DEFAULTS = {
        // Which zone the player is in. Reset to this every boot - see load() -
        // so a fresh launch always opens on the barn.
        zone: 'barn',

        // Talking
        words: 'short',            // few | short | full
        style: 'playful',          // playful | plain
        grownUpPrompts: true,
        playerName: '',
        /**
         * Whether the spoken lines are ALSO printed on screen, as a caption
         * in the middle of the stage.
         *
         * Deliberately its own setting rather than following the hub's Text
         * to Speech switch. Those are two different needs: the caption is
         * there for a player who cannot hear the voice, and the voice is
         * there for a player who cannot read the caption - so turning one off
         * must not turn the other off with it. Someone who is happy listening
         * and does not want to read along can have the facts read aloud with
         * nothing printed over the animal.
         */
        showCaptions: true,

        // Playing
        pool: 'all',               // all | four | one
        justOneIs: 'cow',
        choices: 2,                // 1..4, Listen and Find
        waitIndex: 1,
        lookingIndex: 1,
        doorIndex: 1,
        celebrateRow: true,

        // Looking
        preset: 'full',
        appearsAt: 'middle',       // middle | left | right
        moves: 'lively',           // lively | gentle | still
        highlightColorIndex: 0,
        highlightStyle: 'outline', // outline | full

        // Sounds
        volume: 0.6,
        gentleSounds: false,
        barnSong: true,
        /**
         * The animals' own recorded calls - sounds/animals/<id>.wav.
         *
         * ONLY those. This replaced a broader `sfxEnabled` that muted every
         * sound the game makes and, through a condition in music.js, the
         * background music with it - so one switch silenced three unrelated
         * things and there was no way to quiet the animals alone.
         *
         * The door creaking open, the footsteps, the sparkle, the scan blips
         * and the fanfare are deliberately NOT covered and have no switch:
         * they are the feedback that tells a switch user their press landed
         * and that something is happening. Turning those off does not make
         * the game calmer, it makes it unresponsive.
         *
         * With this off, an animal's sound WORD is spoken instead of its
         * recording being played - the same fallback an animal with no
         * recording gets. See animalSoundPlays() in js/audio.js.
         */
        animalSounds: true,
        // Background music - the menu theme (js/music.js) AND the three zone
        // themes (js/gamesong.js) share this one switch, since they never play
        // at the same time anyway. Independent of the animals: this is the only
        // thing that decides whether music plays.
        musicEnabled: true
    };

    let settings = Object.assign({}, DEFAULTS);
    let progress = { zones: {}, rowsFinished: 0, seen: {} };

    /**
     * The current zone's board, created on first use. Callers hold the object
     * they get back only for as long as one call, so a zone change between calls
     * is always picked up.
     */
    function zoneProgress() {
        const id = settings.zone || DEFAULTS.zone;
        if (!progress.zones) progress.zones = {};
        if (!progress.zones[id] || !Array.isArray(progress.zones[id].stamps)) {
            progress.zones[id] = { stamps: [] };
        }
        return progress.zones[id];
    }

    function load() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                settings = Object.assign({}, DEFAULTS, saved);
                // A save from when this was the broader `sfxEnabled`. Somebody
                // who had turned that off wanted it quieter, so the animals
                // start off for them rather than the setting silently coming
                // back on under a new name.
                if (saved.animalSounds === undefined && saved.sfxEnabled === false) {
                    settings.animalSounds = false;
                }
                delete settings.sfxEnabled;
            }
        } catch (e) {
            console.warn('[NAF] Could not read settings:', e);
            settings = Object.assign({}, DEFAULTS);
        }
        // Progress is NOT read back, and is never written - see the note on
        // PROGRESS_KEY. Every launch starts with an empty board. Any board
        // left behind by a version that did save one is cleared out, so it
        // cannot sit in storage for the life of the device.
        try {
            localStorage.removeItem(PROGRESS_KEY);
        } catch (e) { /* storage being unavailable is not worth a warning */ }

        // The visual preset is not a player-facing setting: the game always
        // STARTS on Full farm. 'simple' is still set at runtime when WebGL is
        // unavailable, and resetting it here means that is re-detected on every
        // boot rather than one bad launch sticking to the device forever. This
        // belongs in load(), not clamp(), or it would undo the runtime fallback
        // the moment it was saved.
        settings.preset = 'full';

        // Likewise the zone: a fresh launch always opens on the barn, the
        // simplest and most familiar place, rather than wherever the last
        // session happened to leave off. Progress (stamps) still stays sorted
        // per zone and untouched - this only changes which door the player
        // sees first each time the game opens.
        settings.zone = 'barn';

        clamp();
    }

    function clamp() {
        // Written out rather than read from NAF.Zones: zones.js loads after this
        // file (it needs NAF.Settings to know which zone is current), and clamp()
        // runs during load() at the bottom of this file. NAF.Zones.current() also
        // falls back to the barn, so a stale id is never fatal - this just keeps
        // it from being written back to storage.
        if (ZONE_IDS.indexOf(settings.zone) === -1) settings.zone = DEFAULTS.zone;
        if (PRESETS.indexOf(settings.preset) === -1) settings.preset = DEFAULTS.preset;
        settings.choices = Math.max(1, Math.min(4, settings.choices | 0 || 2));
        settings.waitIndex = wrapIndex(settings.waitIndex, WAIT_AND_WONDER.length);
        settings.lookingIndex = wrapIndex(settings.lookingIndex, LOOKING_TIME.length);
        settings.doorIndex = wrapIndex(settings.doorIndex, DOOR_SPEED.length);
        settings.highlightColorIndex = wrapIndex(settings.highlightColorIndex, HIGHLIGHT_COLORS.length);
        settings.volume = Math.max(0, Math.min(1, Number(settings.volume)));
    }

    function wrapIndex(v, len) {
        v = v | 0;
        return (v >= 0 && v < len) ? v : 0;
    }

    function save() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.warn('[NAF] Could not save settings:', e);
        }
    }

    load();

    return {
        HIGHLIGHT_COLORS: HIGHLIGHT_COLORS,
        WAIT_AND_WONDER: WAIT_AND_WONDER,
        LOOKING_TIME: LOOKING_TIME,
        DOOR_SPEED: DOOR_SPEED,
        PRESETS: PRESETS,
        PRESET_NAMES: PRESET_NAMES,

        get: function (key) { return settings[key]; },
        all: function () { return settings; },

        set: function (key, value) {
            settings[key] = value;
            clamp();
            save();
        },

        /** Step a numeric index setting forward, wrapping. Returns the new index. */
        cycle: function (key, length) {
            settings[key] = ((settings[key] | 0) + 1) % length;
            save();
            return settings[key];
        },

        toggle: function (key) {
            settings[key] = !settings[key];
            save();
            return settings[key];
        },

        highlightColor: function () {
            return HIGHLIGHT_COLORS[settings.highlightColorIndex].color;
        },
        /** The colour to write ON the highlight, for the Block style where the
         *  chosen colour becomes the button's own face. Dark ink on Gold, light
         *  ink on Black - the label has to stay readable whichever is picked. */
        highlightInk: function () {
            return HIGHLIGHT_COLORS[settings.highlightColorIndex].ink;
        },
        highlightColorName: function () {
            return HIGHLIGHT_COLORS[settings.highlightColorIndex].name;
        },
        waitMs: function () { return WAIT_AND_WONDER[settings.waitIndex].ms; },
        lookingMs: function () { return LOOKING_TIME[settings.lookingIndex].ms; },
        doorMs: function () { return DOOR_SPEED[settings.doorIndex].ms; },

        // --- progress ---
        //
        // In memory only, for the length of one visit - nothing here is saved,
        // and the board starts empty every launch. See PROGRESS_KEY.
        //
        // The friend board is PER ZONE. It shows the animals you have met, and a
        // board of barn animals while the player is standing in an aquarium is
        // just wrong - it also made the row of five impossible to read as
        // progress once there were sixty animals to meet rather than sixteen.
        // `seen` and `rowsFinished` stay shared: those are counts for the
        // session, not the thing on screen.
        progress: function () { return zoneProgress(); },
        addStamp: function (animalId) {
            zoneProgress().stamps.push(animalId);
            progress.seen[animalId] = (progress.seen[animalId] || 0) + 1;
        },
        clearRow: function () {
            zoneProgress().stamps = [];
            progress.rowsFinished += 1;
        }
    };
})();

/**
 * Spoken phrasing. Every line respects Words (how much) and Style (how warm).
 * Nothing here ever mentions a duration or a key count.
 */
NAF.Say = (function () {
    'use strict';

    function S() { return NAF.Settings; }

    /**
     * The current zone's nouns. Read at call time, not at load time - zones.js
     * loads after this file, and the zone changes while the game is running.
     * Every line below says "the tank" or "the gate" through this rather than
     * hard-coding "the barn".
     */
    function W() { return NAF.Zones.current().words; }

    function name() {
        const n = (S().get('playerName') || '').trim();
        return n;
    }

    function playful() { return S().get('style') === 'playful'; }

    function words() { return S().get('words'); }

    /**
     * "a" or "an", for an animal's name.
     *
     * Worked out rather than hard-coded, because the roster has an Orca, an
     * Octopus, an Owl, an Otter, an Oyster, an Elephant and an Eagle in it, and
     * with "a" written into the sentence the voice says "it's a orca" for all
     * seven. A plain vowel test is enough for this roster - none of the sixty
     * names is one of the awkward cases like a "u" said as "yoo".
     */
    function an(word) {
        return /^[aeiou]/i.test(word) ? 'an ' : 'a ';
    }

    /**
     * "It's a cow! The cow says moo." at the chosen level of words.
     *
     * The "moo" half is dropped when the animal has a real recording, because
     * that recording has just played it (Beat 4 in reveal.js) and a voice
     * reading the word out afterwards is the same sound twice, the second one
     * worse. An animal with no recording keeps the spoken word, which is what
     * makes a half-finished sounds folder play as a whole game rather than a
     * broken one.
     */
    function reveal(animal) {
        const w = words();
        // Guarded rather than called straight: this file loads before audio.js,
        // and while that only matters if something ever calls this during boot,
        // a spoken line is not worth a crash.
        //
        // This asks whether the recording will actually be heard, not merely
        // whether one exists - so with Animal Sounds off the word comes back
        // and the animal still makes a sound, just a spoken one.
        const recorded = !!(NAF.Audio && NAF.Audio.animalSoundPlays
            && NAF.Audio.animalSoundPlays(animal));

        if (w === 'few') {
            if (!playful()) return animal.name + '.';
            return recorded ? (animal.name + '!') : (animal.name + '! ' + animal.says + '!');
        }
        if (w === 'short') {
            if (!playful()) {
                return recorded ? (animal.name + '.')
                                : (animal.name + '. Says ' + animal.says.toLowerCase() + '.');
            }
            const it = 'It\'s ' + an(animal.name) + animal.name.toLowerCase();
            return recorded ? (it + '!') : (it + '! ' + animal.says + '!');
        }
        const who = name();
        const nm = an(animal.name) + animal.name.toLowerCase();
        const lead = playful()
            ? (who ? ('Look ' + who + ', it\'s ' + nm + '!') : ('It\'s ' + nm + '!'))
            : ('This is ' + nm + '.');
        if (recorded) return lead;
        return lead + ' The ' + animal.name.toLowerCase() + ' says ' + animal.says.toLowerCase() + '.';
    }

    /**
     * The line under the title on the main menu. The menu is the map, so this
     * points at the choice of place rather than at one door.
     */
    function greeting() {
        const who = name();
        if (!who) return 'Choose a place and see who says hello.';
        return playful()
            ? ('Hello ' + who + '! Choose a place and see who says hello.')
            : (who + '. Choose a place to visit.');
    }

    /** Spoken when the door - barn, tank or gate - is the focused item. */
    function barnPrompt() {
        const w = words();
        const who = name();
        const place = W().place;
        const open = W().openSpoken.toLowerCase();
        const Place = place.charAt(0).toUpperCase() + place.slice(1);
        if (w === 'few') return playful() ? ('The ' + place + '!') : (Place + '.');
        if (w === 'short') {
            if (!playful()) return Place + '. Choose to open.';
            return who ? (W().openSpoken + ', ' + who + '!') : (W().openSpoken + '!');
        }
        return playful()
            ? (who ? (who + ', ' + open + ' and see who is inside.') : (W().openSpoken + ' and see who is inside.'))
            : Place + '. Choosing this opens it.';
    }

    function pickPrompt() {
        return playful() ? 'Who should come out?' : 'Choose an animal.';
    }

    /**
     * `riddle` is a NAF.Facts.riddle() line about the target - a fact with the
     * animal's own name scrubbed out - chosen once by the caller so the same
     * clue is spoken here, shown as a caption, and used to size how long the
     * player has to read/hear it before choosing. This never names the
     * animal: the player has to match the clue to a picture, not just listen
     * for a name and repeat it back.
     */
    function findPrompt(animal, riddle) {
        const w = words();
        if (w === 'few') return riddle + ' Which one?';
        if (w === 'short') return riddle + ' Which one of these animals is it?';
        return 'Listen closely. ' + riddle + ' Which one of these animals is it?';
    }

    /** No fail state: name what they chose, then point back at the target. */
    function wrongPick(chosen, target) {
        const lead = playful()
            ? ('That\'s the ' + chosen.name.toLowerCase() + '! ' + chosen.says + '!')
            : ('That is the ' + chosen.name.toLowerCase() + '.');
        return lead + ' We are looking for the ' + target.name.toLowerCase() + '.';
    }

    function rightPick(animal) {
        const who = name();
        if (!playful()) return 'Correct. The ' + animal.name.toLowerCase() + '.';
        return who
            ? ('Yes ' + who + '! The ' + animal.name.toLowerCase() + '!')
            : ('Yes! The ' + animal.name.toLowerCase() + '!');
    }

    /**
     * The reward line. "Pig stamp, one of five" is the language of a sticker
     * chart, not of a game - so the count is left to the board to show rather
     * than being read out every single time.
     *
     * This does NOT say the animal is the player's friend. A child hearing
     * that fifty times a session is being told something literally untrue
     * about a picture of a pig, and it crowds out the thing actually worth
     * saying: a real, true fact about the animal that just came out, which is
     * what plays instead - see js/facts.js. The cheer up front is what carries
     * the celebration now, and it still rotates so the fifth one in a row
     * still sounds like something happened.
     */
    const CHEERS = ['Yay', 'Hooray', 'Wonderful', 'Brilliant', 'Amazing'];
    let cheerAt = 0;

    /**
     * `fact` is chosen once by the caller (the reveal sequence) rather than
     * picked again in here, so the exact words spoken match what was already
     * used to size how long the animal stays out and what any caption shows.
     */
    function friendEarned(animal, fact) {
        fact = fact || NAF.Facts.random(animal);
        const board = W().board;
        if (!playful()) return animal.name + ' added to your ' + board + '. ' + fact;

        const cheer = CHEERS[cheerAt++ % CHEERS.length];
        if (words() === 'few') return cheer + '! ' + animal.name + '!';

        const me = name();
        if (words() === 'short') return cheer + (me ? (', ' + me) : '') + '! ' + fact;

        return cheer + (me ? (', ' + me) : '') + '! ' + fact + ' Look at the top of the screen.';
    }

    /**
     * The full-board cheer. Randomised across several phrasings rather than one
     * fixed line, so filling the board a second or third time in a session
     * still feels like a moment rather than a repeat of the same recording.
     * Never claims friendship, for the same reason friendEarned() does not.
     */
    const ROW_LINES = [
        function (who, board) { return 'You did it' + who + '! Five animals in your ' + board + '! Let\'s find some more.'; },
        function (who, board) { return 'Amazing work' + who + '! Your ' + board + ' is full of new animals!'; },
        function (who, board) { return 'Wow' + who + '! You found five animals! Let\'s see who else is out there.'; },
        function (who, board) { return 'Great job' + who + '! Five animals are safe and sound in your ' + board + '!'; },
        function (who, board) { return 'Hooray' + who + '! You filled your whole ' + board + '! Ready for more?'; }
    ];
    const ROW_FEW = ['All done', 'Great job', 'Hooray', 'Well done', 'Amazing'];
    let rowAt = 0;

    function rowComplete() {
        const who = name();
        const board = W().board;
        if (!playful()) return 'All five added. Starting again.';
        if (words() === 'few') {
            const cheer = ROW_FEW[rowAt++ % ROW_FEW.length];
            return who ? (cheer + ', ' + who + '!') : (cheer + '!');
        }
        const line = ROW_LINES[rowAt++ % ROW_LINES.length];
        return line(who ? (' ' + who) : '', board);
    }

    // A short spoken control hint used to live here, for the pause menu's Help
    // button. That button is now How to Play and opens the real directions, so
    // the controls are stated in exactly one place: HELP_LINES in ui.js, which
    // is both printed and read aloud.

    return {
        reveal: reveal,
        greeting: greeting,
        barnPrompt: barnPrompt,
        pickPrompt: pickPrompt,
        findPrompt: findPrompt,
        wrongPick: wrongPick,
        rightPick: rightPick,
        friendEarned: friendEarned,
        rowComplete: rowComplete,
        playerName: name
    };
})();
