/**
 * NARBE Switch Stories - the page flow (from the Story Time prototype).
 *
 * The cover opens and is read straight away. Then each page:
 *   the words are read aloud, then the character glows with a soft chime:
 *   it is the player's turn, and their press makes the action happen; then
 *   a press turns the page. (The player always presses: there is no
 *   "plays by itself" or "turns by itself", by the user's choice.)
 *
 * A press while the words are read gets a soft tick, and the words are
 * read to the end (they are never cut off). A press during the action is
 * remembered, and the page turns as soon as the action ends. No press is
 * ever ignored.
 *
 * After The End, the story goes back to its cover with two choices: Read
 * Again, and Pick a Different Story.
 *
 * state is one of:
 *   'idle'     before the cover is read (only for a moment)
 *   'reading'  the words are being read
 *   'waiting'  waiting for the press that makes the action happen
 *   'acting'   the action is happening
 *   'done'     the action is finished; a press turns the page
 *   'turning'  fading to the next page
 *   'end'      back on the cover after The End: Read Again or Pick a Different Story
 */

window.NSS = window.NSS || {};

NSS.Story = (function () {
    'use strict';

    const C = NSS.CONFIG;
    const TURN_HALF = 0.25;     // seconds to fade out, then the same to fade in
    const AFTER_SOUND_DELAY = 250;  // ms after the action ends before a page's afterSound

    let story = null;
    let index = 0;
    let state = 'idle';
    let actionT = 0, turnT = 0;
    let acted = false, turnQueued = false, swapped = false, ending = false;
    let lastPress = -1;
    const counts = { presses: 0, actions: 0, turns: 0, ticks: 0, afterSounds: 0 };

    function S() { return NSS.Settings; }
    function page() { return story.pages[index]; }
    function isLast() { return index === story.pages.length - 1; }
    function seconds() { return C.actions[page().action].seconds; }

    // --- what is on screen ------------------------------------------------------------

    function hint() {
        if (state === 'idle') return 'Press to start';
        if (state === 'waiting') return 'Press to see what happens';
        if (state === 'done') return isLast() ? 'Press to finish' : 'Press for the next page';
        return '';
    }

    function setState(s) {
        state = s;
        NSS.UI.setHint(hint());
    }

    /** Put this page's words up, and get its sounds ready (and the next page's). */
    function showPage() {
        acted = false;
        NSS.Scene.newPage();
        NSS.UI.setWords(page().text);
        NSS.UI.setCredits(index === 0 ? story.credits : null);
        NSS.UI.setPageNo(index === 0 ? '' : index + ' of ' + (story.pages.length - 1));
        [page(), story.pages[index + 1]].forEach(function (p) {
            if (!p) return;
            if (p.actionSound) NSS.Sound.check(p.actionSound);
            if (p.afterSound) NSS.Sound.check(p.afterSound);
        });
    }

    // --- the flow ---------------------------------------------------------------------

    function beginPage() {
        acted = false;
        turnQueued = false;
        NSS.Scene.newPage();
        setState('reading');
        NSS.Reader.read(page(), afterReading);
    }

    function afterReading() {
        if (state !== 'reading') return;
        if (page().action === 'none') startAction();
        else { setState('waiting'); NSS.Sound.play('ready'); }
    }

    function startAction() {
        NSS.Reader.stop();
        if (page().action === 'none') { finishAction(); return; }   // a title page: nothing to wait for
        setState('acting');
        actionT = 0;
        counts.actions++;
        const a = page().action;
        if (a !== 'splash') NSS.Sound.action(page());   // splash makes its sound when Rocky lands
        if (a === 'celebrate') NSS.Scene.celebrate();
    }

    function finishAction() {
        acted = true;
        if (page().afterSound) {
            const p = page();
            setTimeout(function () { if (story) { NSS.Sound.after(p); counts.afterSounds++; } }, AFTER_SOUND_DELAY);
        }
        setState('done');
        if (turnQueued) { turnQueued = false; turnPage(); }
    }

    function turnPage() {
        NSS.Reader.stop();
        ending = isLast();
        turnT = 0;
        swapped = false;
        counts.turns++;
        setState('turning');
        NSS.UI.fadeWords(true);
        NSS.Sound.play('flip');
    }

    function tick(dt) {
        if (!story) return;
        if (state === 'acting') {
            actionT += dt;
            if (actionT >= seconds()) finishAction();
        } else if (state === 'turning') {
            turnT += dt;
            if (turnT >= TURN_HALF && !swapped) {
                swapped = true;
                index = ending ? 0 : index + 1;
                showPage();
                if (ending) NSS.UI.showEndChoices(true);
                NSS.UI.fadeWords(false);
            }
            if (turnT >= TURN_HALF * 2) {
                if (ending) {
                    ending = false;
                    setState('end');
                    NSS.Input.refresh(true);
                    NSS.Input.announce('The End. Read again, or pick a different story.');
                } else {
                    beginPage();
                }
            }
        }
    }

    /** What a press does, depending on the moment. */
    function press() {
        if (!story) return;
        const now = performance.now() / 1000;
        if (now - lastPress < C.tapCooldown) return;
        lastPress = now;
        counts.presses++;
        switch (state) {
            case 'idle': beginPage(); break;
            case 'reading': tickSound(); break;                         // the words are always read to the end
            case 'waiting': startAction(); break;
            case 'acting': turnQueued = true; tickSound(); break;       // turns as soon as the action ends
            case 'done': turnPage(); break;
            case 'turning': tickSound(); break;
            case 'end': break;                                          // the choices are scanned
        }
    }

    function tickSound() { counts.ticks++; NSS.Sound.play('tick'); }

    // --- opening, pausing, starting again ----------------------------------------------

    function toCover() {
        NSS.Reader.stop();
        index = 0;
        turnQueued = false;
        ending = false;
        NSS.UI.fadeWords(false);
        NSS.UI.showEndChoices(false);
        showPage();
        setState('idle');
    }

    /** Opening a story reads its cover straight away (choosing it was the press). */
    function open(s) {
        story = s;
        toCover();
        NSS.UI.show('story');
        beginPage();
    }

    function close() {
        NSS.Reader.stop();
        story = null;
        state = 'idle';
        NSS.UI.showEndChoices(false);
    }

    /** Going to Pause stops the voice; the picture holds still. */
    function pause() {
        NSS.Reader.stop();
    }

    /** Back from Pause: a page that was being read is read again from the start. */
    function resume() {
        if (!story) return;
        NSS.UI.setHint(hint());
        if (state === 'reading') beginPage();
    }

    /** Start Over: back to the cover, read straight away. */
    function restart() {
        if (!story) return;
        toCover();
        NSS.Input.refresh(true);
        beginPage();
    }

    /** Read Again, after The End: the cover is read straight away. */
    function readAgain() {
        if (!story) return;
        NSS.UI.showEndChoices(false);
        index = 0;
        showPage();
        beginPage();
        NSS.Input.refresh(true);
    }

    function settingChanged() {
        if (story) NSS.UI.setHint(hint());
    }

    function view() {
        if (!story) return null;
        const p = state === 'acting' ? Math.min(1, actionT / seconds()) : (acted || state === 'done' ? 1 : 0);
        const fade = state === 'turning' ? (turnT < TURN_HALF ? turnT / TURN_HALF : 1 - (turnT - TURN_HALF) / TURN_HALF) : 0;
        return {
            story: story, page: page(), index: index, state: state, progress: p, fade: fade,
            onLand: function () { NSS.Sound.action(page()); }
        };
    }

    return {
        open: open,
        close: close,
        active: function () { return !!story; },
        title: function () { return story ? story.title : ''; },
        view: view,
        tick: tick,
        press: press,
        pause: pause,
        resume: resume,
        restart: restart,
        readAgain: readAgain,
        settingChanged: settingChanged,
        isChoosing: function () { return !!story && state === 'end'; },
        isReading: function () { return !!story && state === 'reading'; },
        /** For the automated test. */
        stats: function () { return Object.assign({ state: state, index: index }, counts); }
    };
})();
