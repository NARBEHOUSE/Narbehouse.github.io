/**
 * NARBE Switch Stories - boot, moving between screens, and the way back to
 * the hub.
 */

window.NSS = window.NSS || {};

NSS.Game = (function () {
    'use strict';

    function openStory(id) {
        const story = NSS.Library.get(id);
        if (story) {
            NSS.ReadingHistory.record(story.id);
            NSS.Story.open(story);
        }
    }

    function readAgain() {
        const view = NSS.Story.view();
        if (!view || NSS.Story.stats().state !== 'end') return;
        NSS.ReadingHistory.record(view.story.id);
        NSS.Story.readAgain();
    }

    function pause() {
        if (NSS.UI.current() !== 'story') return;
        NSS.Story.pause();
        NSS.UI.show('pause');
    }

    function resume() {
        NSS.UI.show('story');
        NSS.Story.resume();
    }

    function startOver() {
        NSS.UI.show('story');
        NSS.Story.restart();
    }

    function toLibrary() {
        NSS.Story.close();
        NSS.UI.show('library');
    }

    function exit() {
        NSS.Story.close();
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
        NSS.UI.build();
        NSS.Scene.init(NSS.UI.stageEl());
        NSS.Sound.init();
        NSS.Input.init();
        Promise.all([NSS.Library.load(), NSS.Descriptions.load()]).then(function ([stories]) {
            NSS.Descriptions.check(stories);
            stories.forEach(NSS.Scene.preload);
            NSS.Input.setProvider(NSS.UI.scannables);
            NSS.UI.show('library');

            // Voices load asynchronously, so the first greeting may have had no
            // voice to speak with. Say it again once they are ready.
            try {
                window.NarbeVoiceManager.waitForVoices().then(function (loaded) {
                    if (loaded && NSS.UI.current() === 'library' && !(NSS.Input.state() || {}).id) {
                        NSS.Input.announce('Switch Stories. Choose a story.');
                    }
                });
            } catch (e) { /* no voice manager */ }
        });
    }

    return {
        boot: boot,
        openStory: openStory,
        readAgain: readAgain,
        pause: pause,
        resume: resume,
        startOver: startOver,
        toLibrary: toLibrary,
        exit: exit
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', NSS.Game.boot);
} else {
    NSS.Game.boot();
}
