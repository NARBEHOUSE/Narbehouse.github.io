/**
 * NARBE Switch Songs - Play a Song.
 *
 * Each press plays the next piano note, so the player sets the rhythm.
 */

window.NSS = window.NSS || {};

NSS.Song = (function () {
    'use strict';

    let cur = null;
    let token = 0;
    let finishTimer = null;

    function finishAfter(delay) {
        clearTimeout(finishTimer);
        const t = token;
        finishTimer = setTimeout(function () {
            finishTimer = null;
            if (t === token && cur && cur.done) NSS.Game.songDone();
        }, delay);
    }

    function start(id) {
        NSS.Sound.stop();
        clearTimeout(finishTimer); finishTimer = null;
        cur = { song: NSS.Music.song(id) || NSS.Music.SONGS[0], i: 0, done: false }; token++;
    }
    function restart() {
        NSS.Sound.stop();
        clearTimeout(finishTimer); finishTimer = null;
        if (cur) { cur.i = 0; cur.done = false; token++; }
    }

    /** Enter or resume the song without starting background playback. */
    function enter() {
        NSS.Sound.stop();
        // A pause during the final note must not lose the celebration on Continue.
        if (cur && cur.done) finishAfter(0);
    }

    function note() {
        if (!cur || cur.done) return null;
        stopListening();
        const m = cur.song.notes[cur.i];
        NSS.Sound.bell(m);
        cur.i++;
        if (cur.i >= cur.song.notes.length) {
            cur.done = true;
            finishAfter(1400);
        }
        return m;
    }

    function stopListening() {
        if (!NSS.Sound.isListening()) return;
        NSS.Sound.stopListening();
        NSS.UI.refreshListening();
    }

    function toggleListening() {
        if (!cur || cur.done) return;
        if (NSS.Sound.isListening()) { stopListening(); return; }
        if (!NSS.Settings.get('sound') || NSS.Settings.volume() === 0) {
            NSS.UI.refreshListening('Turn sound on in Settings to listen.');
            NSS.Voice.speak('Turn sound on in Settings to listen.');
            return;
        }
        const my = token;
        NSS.Sound.listenSong(cur.song, function (reason) {
            if (my !== token || NSS.UI.current() !== 'song') return;
            enter();
            const message = reason === 'error' ? 'Could not play the song. Choose Listen to Song to try again.' : '';
            NSS.UI.refreshListening(message);
            if (message) NSS.Voice.speak(message);
        });
        NSS.UI.refreshListening();
    }

    return {
        start: start, restart: restart, enter: enter, note: note,
        toggleListening: toggleListening, stopListening: stopListening,
        current: function () { return cur; }
    };
})();
