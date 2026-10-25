/**
 * NARBE Switch Songs - boot, game flow and the way back to the hub.
 *
 * A piano songbook, played one note at a time with a switch.
 */

window.NSS = window.NSS || {};

NSS.Game = (function () {
    'use strict';

    let pauseFrom = 'song';

    function UI() { return NSS.UI; }

    function openSongs() { UI().show('categories'); }
    function openFreePlay() { NSS.FreePlay.reset(); UI().show('free'); }

    function startSong(id) { NSS.Song.start(id); UI().show('song'); }
    function restartSong() { NSS.Song.restart(); UI().show('song'); }

    function note() {
        if (UI().current() !== 'song') return;
        const m = NSS.Song.note();
        if (m !== null) UI().songNote(m);
    }

    function songDone() {
        if (UI().current() !== 'song' || !NSS.Song.current()?.done) return;
        NSS.Sound.stop();
        NSS.Sound.celebrate();
        UI().show('songend');
    }

    function pause() {
        const c = UI().current();
        if (c !== 'song' && c !== 'free') return;
        pauseFrom = c;
        UI().show('pause');
    }

    function resume() { UI().show(pauseFrom); }

    /** Escape is a caregiver shortcut. Nothing requires it. */
    function escape() {
        const c = UI().current();
        if (c === 'song' || c === 'free') pause();
        else if (c === 'pause') resume();
    }

    function exit() {
        NSS.Sound.stop();
        NSS.Voice.speak('Goodbye.');
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ action: 'focusBackButton' }, '*');
            } else {
                window.location.href = '../../../index.html';
            }
        } catch (e) {
            console.warn('[NSS] Could not message the hub:', e);
        }
    }

    function boot() {
        UI().build();
        NSS.Input.init();
        NSS.Input.setProvider(UI().scannables);
        UI().show('menu');
        NSS.Sound.prewarm();
        // A listening performance never continues unnoticed after leaving the app.
        window.addEventListener('blur', function () { NSS.Song.stopListening(); });
        window.addEventListener('pagehide', function () { NSS.Sound.stop(); });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) NSS.Song.stopListening();
        });

        // Voices load asynchronously, so the first greeting may have had no
        // voice to speak with. Say it again once they are ready.
        try {
            window.NarbeVoiceManager.waitForVoices().then(function (loaded) {
                if (loaded && UI().current() === 'menu' && !(NSS.Input.state() || {}).id) {
                    NSS.Input.announce('NARBE Switch Songs. Play Songs or Free Play.');
                }
            });
        } catch (e) { /* no voice manager */ }
    }

    return {
        boot: boot, openSongs: openSongs, openFreePlay: openFreePlay,
        startSong: startSong, restartSong: restartSong, note: note, songDone: songDone,
        pause: pause, resume: resume, pausedFrom: function () { return pauseFrom; },
        escape: escape, exit: exit
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', NSS.Game.boot);
} else {
    NSS.Game.boot();
}
