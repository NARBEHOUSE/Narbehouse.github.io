/**
 * NARBE Switch Stories - the page flow (from the Story Time prototype).
 *
 * The cover opens and is read straight away. Then each page:
 *   the words are read aloud, then the character glows with a soft chime:
 *   it is the player's turn, and their press makes the action happen; then
 *   a press turns the page. (The player always presses: there is no
 *   "plays by itself" or "turns by itself", by the user's choice.)
 *   Optional image descriptions come before the first passage and after the
 *   action. Each description passage waits for a fresh press. They use the
 *   same Read Aloud preference and cancellation as the story narration.
 *
 * A press while the words are read gets a soft tick, and the words are
 * read to the end (they are never cut off). A press during the action is
 * remembered unless the story requires a fresh press after the action.
 *
 * After The End, the story goes back to its cover with two choices: Read
 * Again, and Pick a Different Story.
 *
 * state is one of:
 *   'idle'     before the cover is read (only for a moment)
 *   'reading'  the words are being read
 *   'describing' an image/action description is being read
 *   'descriptionReady' waiting to continue the description, story, or next page
 *   'waiting'  waiting for the press that makes the action happen
 *   'acting'   the action is happening
 *   'actionOutro' a closing action sound finishes before its description
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
    let partIndex = 0;
    let descriptionKind = '', descriptionParts = [], descriptionIndex = 0;
    let state = 'idle';
    let actionT = 0, turnT = 0;
    let outroT = 0, outroSeconds = 0;
    let acted = false, turnQueued = false, swapped = false, ending = false;
    let afterSoundTimer = null;
    const counts = { presses: 0, actions: 0, turns: 0, ticks: 0, afterSounds: 0 };

    function S() { return NSS.Settings; }
    function page() { return story.pages[index]; }
    function isLast() { return index === story.pages.length - 1; }
    function parts() { return page().textParts || [page().text]; }
    function readingText() { return parts()[partIndex]; }
    function hasMoreText() { return partIndex < parts().length - 1; }
    function seconds() { return C.actions[page().action].seconds; }
    function descriptionsOn() { return S().is('imageDescriptions', 'on'); }
    function descriptionText(kind) { return NSS.Descriptions.get(story.id, index, S().cvi(), kind); }
    function captionParts() {
        return descriptionsOn() ? parts().concat(NSS.Descriptions.parts(descriptionText('before')), NSS.Descriptions.parts(descriptionText('after'))) : parts();
    }
    function isDescription() { return state === 'describing' || state === 'descriptionReady'; }

    function clearPageSounds() {
        clearTimeout(afterSoundTimer);
        afterSoundTimer = null;
        const currentPage = story && page();
        if (currentPage) {
            NSS.Sound.stopFile(currentPage.actionSound);
            NSS.Sound.stopFile(currentPage.afterSound);
        }
    }

    // --- what is on screen ------------------------------------------------------------

    function hint() {
        if (state === 'idle') return 'Press to start';
        if (state === 'waiting') return 'Press to see what happens';
        if (state === 'descriptionReady') return descriptionHint();
        if (state === 'done') return hasMoreText() ? 'Press to keep reading' : isLast() ? 'Press to finish' : 'Press to turn the page';
        return '';
    }

    function descriptionHint() {
        if (descriptionIndex < descriptionParts.length - 1) return 'Press to continue description';
        if (descriptionKind === 'before') return 'Press to read the story';
        return isLast() ? 'Press to finish' : 'Press to turn the page';
    }

    function setState(s) {
        state = s;
        NSS.UI.setHint(hint());
    }

    /** Put this page's words up, and get its sounds ready (and the next page's). */
    function showPage() {
        acted = false;
        partIndex = 0;
        descriptionKind = ''; descriptionParts = []; descriptionIndex = 0;
        NSS.Scene.newPage();
        NSS.UI.setWords(readingText(), captionParts());
        syncSpread();
        NSS.UI.setCredits(index === 0 ? story.credits : null);
        showPageNumber();
        [page(), story.pages[index + 1]].forEach(function (p) {
            if (!p) return;
            if (p.actionSound) NSS.Sound.check(p.actionSound);
            if (p.afterSound) NSS.Sound.check(p.afterSound);
        });
    }

    function showPageNumber() {
        const part = parts().length > 1 ? ' · Part ' + (partIndex + 1) + ' of ' + parts().length : '';
        NSS.UI.setPageNo(index === 0 ? '' : index + ' of ' + (story.pages.length - 1) + part);
    }

    function continueReading() {
        NSS.Reader.stop();
        partIndex++;
        readCurrent();
    }

    function readCurrent() {
        NSS.UI.setWords(readingText(), captionParts());
        showPageNumber();
        setState('reading');
        NSS.Reader.read({ text: readingText() }, afterReading);
    }

    function readDescription() {
        NSS.UI.setWords(descriptionParts[descriptionIndex], captionParts());
        NSS.UI.setPageNo((index ? index + ' of ' + (story.pages.length - 1) : 'Cover') +
            (descriptionKind === 'before' ? ' · Image description' : ' · What happened'));
        setState('describing');
        // A listener should hear when to press even with Speak Menus disabled.
        // Reader still obeys Read Aloud, including its completely silent mode.
        const spoken = descriptionParts[descriptionIndex] + (S().is('readAloud', 'on') ? ' ' + descriptionHint() + '.' : '');
        NSS.Reader.read({ text: spoken }, function () {
            if (state === 'describing') setState('descriptionReady');
        });
    }

    function describe(kind) {
        descriptionKind = kind;
        descriptionIndex = 0;
        descriptionParts = NSS.Descriptions.parts(descriptionText(kind));
        if (!descriptionParts.length) {
            if (kind === 'before') readCurrent(); else setState('done');
            return;
        }
        clearPageSounds();
        turnQueued = false;
        readDescription();
    }

    // --- the flow ---------------------------------------------------------------------

    function beginPage() {
        acted = false;
        turnQueued = false;
        NSS.Scene.newPage();
        if (descriptionsOn()) describe('before'); else readCurrent();
    }

    function afterReading() {
        if (state !== 'reading') return;
        if (hasMoreText()) setState('done');
        else if (page().action === 'none') startAction();
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
        if (descriptionsOn() && page().action !== 'none') {
            // Keep an action's closing sound (such as Rocky's bark), then
            // explain it without the effect talking over the narration.
            outroSeconds = page().afterSound ? (NSS.Sound.after(page()) || 0) : 0;
            if (outroSeconds > 0) { counts.afterSounds++; outroT = 0; setState('actionOutro'); }
            else describe('after');
            return;
        }
        if (page().afterSound) {
            const p = page();
            clearTimeout(afterSoundTimer);
            afterSoundTimer = setTimeout(function () {
                afterSoundTimer = null;
                if (story && page() === p) { NSS.Sound.after(p); counts.afterSounds++; }
            }, AFTER_SOUND_DELAY);
        }
        setState('done');
        if (turnQueued) { turnQueued = false; turnPage(); }
    }

    function turnPage() {
        NSS.Reader.stop();
        clearPageSounds();
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
        } else if (state === 'actionOutro') {
            outroT += dt;
            if (outroT >= outroSeconds) describe('after');
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
        // Switch bounce is filtered by the shared input guard. A second local
        // cooldown would discard valid taps at the user's saved sensitivity.
        counts.presses++;
        switch (state) {
            case 'idle': beginPage(); break;
            case 'reading': tickSound(); break;                         // the words are always read to the end
            case 'describing': tickSound(); break;
            case 'actionOutro': tickSound(); break;
            case 'descriptionReady':
                if (descriptionIndex < descriptionParts.length - 1) { descriptionIndex++; readDescription(); }
                else if (descriptionKind === 'before') readCurrent();
                else turnPage();
                break;
            case 'waiting': startAction(); break;
            case 'acting':
                if (!story.requireFreshTurn && !descriptionsOn()) turnQueued = true;
                tickSound(); break;
            case 'done': if (hasMoreText()) continueReading(); else turnPage(); break;
            case 'turning': tickSound(); break;
            case 'end': break;                                          // the choices are scanned
        }
    }

    function tickSound() { counts.ticks++; NSS.Sound.play('tick'); }

    // --- opening, pausing, starting again ----------------------------------------------

    /** Jumping always starts at the first passage, without a queued action or turn. */
    function resetPage(nextIndex) {
        NSS.Reader.stop();
        clearPageSounds();
        index = nextIndex;
        turnQueued = false;
        ending = false;
        swapped = false;
        actionT = turnT = outroT = outroSeconds = 0;
        NSS.UI.fadeWords(false);
        NSS.UI.showEndChoices(false);
        showPage();
        setState('idle');
    }

    /** Opening a story reads its cover straight away (choosing it was the press). */
    function open(s) {
        NSS.Reader.stop();
        clearPageSounds();
        story = s;
        resetPage(0);
        NSS.UI.show('story');
        beginPage();
    }

    function close() {
        NSS.Reader.stop();
        clearPageSounds();
        story = null;
        state = 'idle';
        NSS.UI.showEndChoices(false);
    }

    /** Going to Pause stops the voice; the picture holds still. */
    function pause() {
        NSS.Reader.stop();
        clearPageSounds();
    }

    /** Back from Pause: a page that was being read is read again from the start. */
    function resume() {
        if (!story) return;
        NSS.UI.setHint(hint());
        if (state === 'reading') readCurrent();
        else if (state === 'describing') readDescription();
        else if (state === 'actionOutro') describe('after');
    }

    /** Start Over: back to the cover, read straight away. */
    function restart() {
        goToPage(0);
    }

    /** Page numbers match the story display: 0 is the cover, 1 is page 1. */
    function goToPage(nextIndex) {
        if (!story || !Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= story.pages.length) return;
        resetPage(nextIndex);
        NSS.UI.show('story');
        beginPage();
    }

    /** Read Again, after The End: the cover is read straight away. */
    function readAgain() {
        goToPage(0);
    }

    function settingChanged(key) {
        if (story && key === 'imageDescriptions' && !descriptionsOn() && state === 'actionOutro') {
            clearPageSounds(); setState('done');
        }
        if (story && key === 'imageDescriptions' && !descriptionsOn() && isDescription()) {
            NSS.Reader.stop();
            NSS.UI.setWords(readingText(), parts());
            showPageNumber();
            // Settings covers the paused story: resume starts speech, never the menu.
            setState(descriptionKind === 'before' ? 'reading' : 'done');
        }
        if (story && key === 'look' && isDescription()) {
            NSS.Reader.stop();
            descriptionParts = NSS.Descriptions.parts(descriptionText(descriptionKind));
            descriptionIndex = 0;
            if (descriptionParts.length) {
                NSS.UI.setWords(descriptionParts[0], captionParts());
                setState('describing');
            } else setState(descriptionKind === 'before' ? 'reading' : 'done');
        }
        if (story) { NSS.UI.setHint(hint()); syncSpread(); }
    }

    function syncSpread() {
        NSS.UI.setSpread(!!page().spread && !(S().cvi() && page().spreadAction));
    }

    function view() {
        if (!story) return null;
        const p = state === 'acting' ? Math.min(1, actionT / seconds()) : (acted || (state === 'done' && !hasMoreText()) ? 1 : 0);
        const fade = state === 'turning' ? (turnT < TURN_HALF ? turnT / TURN_HALF : 1 - (turnT - TURN_HALF) / TURN_HALF) : 0;
        return {
            story: story, page: page(), index: index, partIndex: partIndex,
            // Render the resting pose before a description, the completed pose
            // afterward. The input state remains separate in stats()/press().
            state: state === 'actionOutro' ? 'done' : isDescription() ? (descriptionKind === 'after' ? 'done' : 'reading') : state, progress: p, fade: fade,
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
        goToPage: goToPage,
        readAgain: readAgain,
        settingChanged: settingChanged,
        isChoosing: function () { return !!story && state === 'end'; },
        isReading: function () { return !!story && (state === 'reading' || state === 'describing' || state === 'actionOutro'); },
        /** For the automated test. */
        stats: function () { return Object.assign({ state: state, index: index, partIndex: partIndex, descriptionKind, descriptionIndex }, counts); }
    };
})();
