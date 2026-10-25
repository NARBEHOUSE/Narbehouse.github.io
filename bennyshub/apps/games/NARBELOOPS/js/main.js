/**
 * NARBE Loops - boot, game flow and the way back to the hub.
 *
 * One remembered loop and untimed switch editing.
 */

window.NL = window.NL || {};

NL.Game = (function () {
    'use strict';

    let pauseFrom = 'beat';

    function UI() { return NL.UI; }

    function openBeat() { UI().show('beat'); }
    function pause() {
        const c = UI().current();
        if (c !== 'beat') return;
        pauseFrom = c;
        UI().show('pause');
    }

    function resume() { UI().show(pauseFrom); }

    function record(layer) {
        UI().editPattern(layer);
    }

    /** Escape is a caregiver shortcut. Nothing requires it. */
    function escape() {
        const c = UI().current();
        if (c === 'beat') pause();
        else if (c === 'pause') resume();
        else if (['row', 'sounds', 'add'].includes(c)) UI().backModal();
    }

    function exit() {
        NL.Sound.stop();
        NL.Voice.speak('Goodbye.');
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ action: 'focusBackButton' }, '*');
            } else {
                window.location.href = '../../../index.html';
            }
        } catch (e) {
            console.warn('[NL] Could not message the hub:', e);
        }
    }

    function boot() {
        UI().build();
        NL.Input.init();
        NL.Input.setProvider(UI().scannables);
        UI().show('menu');
        NL.Sound.prewarm();

        // Voices load asynchronously, so the first greeting may have had no
        // voice to speak with. Say it again once they are ready.
        try {
            window.NarbeVoiceManager.waitForVoices().then(function (loaded) {
                if (loaded && UI().current() === 'menu' && !(NL.Input.state() || {}).id) {
                    NL.Input.announce('NARBE Loops. Make a loop.');
                }
            });
        } catch (e) { /* no voice manager */ }
    }

    return {
        boot: boot, openBeat: openBeat,
        pause: pause, resume: resume, pausedFrom: function () { return pauseFrom; },
        record: record, escape: escape, exit: exit
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', NL.Game.boot);
} else {
    NL.Game.boot();
}
