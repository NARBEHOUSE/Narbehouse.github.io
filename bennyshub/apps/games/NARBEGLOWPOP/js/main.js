/**
 * NARBE Glow Pop - boot, game flow and the way back to the hub.
 *
 * A cause and effect game: press a switch and the glowing ball (or bug) pops
 * into sparkles, then comes back. There is no score, no timer and nothing
 * to lose.
 */

window.NGP = window.NGP || {};

NGP.Game = (function () {
    'use strict';

    let started = false;

    function S() { return NGP.Settings; }

    /** A press during play. */
    function pop() {
        if (NGP.UI.current() !== 'play') return;
        NGP.Scene.press();
    }

    function start(shape) {
        S().set('shape', shape);
        started = true;
        NGP.UI.show('play');
        NGP.Scene.reset();        // grows in fresh, with its soft "here I am" sound
    }

    function pause() {
        if (NGP.UI.current() !== 'play') return;
        NGP.UI.show('pause');
    }

    function toMenu() {
        started = false;
        NGP.UI.show('menu');
    }

    function exit() {
        NGP.Voice.speak('Goodbye.');
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ action: 'focusBackButton' }, '*');
            } else {
                window.location.href = '../../../index.html';
            }
        } catch (e) {
            console.warn('[NGP] Could not message the hub:', e);
        }
    }

    function boot() {
        NGP.UI.build();
        NGP.Scene.init(NGP.UI.stageEl());
        NGP.Sound.init();
        NGP.Input.init();
        NGP.Input.setProvider(NGP.UI.scannables);
        NGP.UI.show('menu');

        // Voices load asynchronously, so the first greeting may have had no
        // voice to speak with. Say it again once they are ready.
        try {
            window.NarbeVoiceManager.waitForVoices().then(function (loaded) {
                if (loaded && NGP.UI.current() === 'menu' && !(NGP.Input.state() || {}).id) {
                    NGP.Input.announce('Glow Pop. Choose one to pop.');
                }
            });
        } catch (e) { /* no voice manager */ }
    }

    return {
        boot: boot,
        pop: pop,
        start: start,
        pause: pause,
        toMenu: toMenu,
        exit: exit,
        started: function () { return started; }
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', NGP.Game.boot);
} else {
    NGP.Game.boot();
}
