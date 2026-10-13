/**
 * NARBE Magic Button - boot, game flow and the way back to the hub.
 *
 * A cause and effect game: press a switch and something wonderful happens.
 * There is no score, no timer and nothing to lose.
 */

window.NMB = window.NMB || {};

NMB.Game = (function () {
    'use strict';

    const IDLE_PROMPT_MS = 30000;   // bring "Press for magic!" back after a quiet spell
    let started = false;
    let lastPress = -1e9;      // the last magic, for ignoring super-fast double hits
    let lastActivity = -1e9;   // the last press or start, for the idle prompt

    function S() { return NMB.Settings; }

    /** Make magic. Super-fast double hits are ignored. */
    function magic() {
        if (NMB.UI.current() !== 'play') return;
        const now = performance.now();
        if (now - lastPress < 150) return;
        lastPress = lastActivity = now;
        NMB.UI.prompt(false);
        if (S().get('pauseMode') === 'scan') NMB.UI.bumpMagic();
        NMB.Scene.press();
    }

    function start(mode) {
        S().set('mode', mode);
        NMB.Scene.setMode(mode);
        NMB.Scene.reset();        // a fresh sky, sea or garden - menu previews do not count
        started = true;
        lastActivity = performance.now();
        NMB.UI.show('play');
    }

    /** The menu's highlight resting on a magic shows it behind the menu, silently. */
    function preview(mode) {
        NMB.Scene.setMode(mode);
        NMB.Scene.press({ silent: true });
    }

    function pause() {
        if (NMB.UI.current() !== 'play') return;
        NMB.UI.show('pause');
    }

    function toMenu() {
        started = false;
        NMB.Scene.setMode(S().get('mode'));
        NMB.UI.show('menu');
    }

    function exit() {
        NMB.Voice.speak('Goodbye.');
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ action: 'focusBackButton' }, '*');
            } else {
                window.location.href = '../../../index.html';
            }
        } catch (e) {
            console.warn('[NMB] Could not message the hub:', e);
        }
    }

    function boot() {
        NMB.UI.build();
        NMB.Scene.init(NMB.UI.stageEl());
        NMB.Sound.init();
        NMB.Input.init();
        NMB.Input.setProvider(NMB.UI.scannables);
        NMB.UI.show('menu');

        setInterval(function () {
            if (NMB.UI.current() === 'play' && S().get('pauseMode') !== 'scan' &&
                !NMB.UI.promptShown() && performance.now() - lastActivity > IDLE_PROMPT_MS) {
                NMB.UI.prompt(true);
            }
        }, 1000);

        // Voices load asynchronously, so the first greeting may have had no
        // voice to speak with. Say it again once they are ready.
        try {
            window.NarbeVoiceManager.waitForVoices().then(function (loaded) {
                if (loaded && NMB.UI.current() === 'menu' && !(NMB.Input.state() || {}).id) {
                    NMB.Input.announce('Magic Button. Choose your magic.');
                }
            });
        } catch (e) { /* no voice manager */ }
    }

    return {
        boot: boot,
        magic: magic,
        start: start,
        preview: preview,
        pause: pause,
        toMenu: toMenu,
        exit: exit,
        started: function () { return started; }
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', NMB.Game.boot);
} else {
    NMB.Game.boot();
}
