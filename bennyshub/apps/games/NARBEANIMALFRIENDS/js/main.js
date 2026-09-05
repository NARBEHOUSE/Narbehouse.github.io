/**
 * NARBE Animal Friends - boot, screen state, renderer selection, hub messaging.
 *
 * Renderer selection is the whole point of the two-stage architecture:
 *
 *   - The Simple visual preset does not initialise WebGL at all. It is the
 *     strongest possible guarantee that Simple has no leftover effects.
 *   - The same code path is the fallback when WebGL is unavailable or fails to
 *     start, so a weak device gets a working game rather than a black canvas.
 *
 * One renderer swap solves both problems.
 */

window.NAF = window.NAF || {};

NAF.Game = (function () {
    'use strict';

    let stage = null;
    let mode = 'barn';        // barn | pick | find
    let hasStarted = false;
    let target = null;        // Listen and Find: the animal to find
    let pickBoard = [];       // Pick an Animal: who is on the board right now
    /** Until when a non-reveal feedback sequence (a wrong pick) is still playing. */
    let feedbackUntil = 0;

    /**
     * True while something the player started is still happening. Selecting is
     * refused until it finishes, so a press cannot restart an action that has not
     * had time to play out.
     *
     * Derived rather than a flag we set and clear: cancelling the reveal - which
     * is what opening Pause does - clears this on its own, with no way for a
     * stale "still busy" to strand the player.
     */
    function isBusy() {
        // Reveal.isBusy, not isRunning: a reveal is "running" right through
        // its final look and the doors closing, and refusing presses for all
        // of that is what left a player waiting on an animal that had already
        // finished doing anything. See the note on isBusy in js/reveal.js.
        return NAF.Reveal.isBusy() || Date.now() < feedbackUntil;
    }

    function S() { return NAF.Settings; }

    // --- renderer ---------------------------------------------------------------

    function wantedRenderer() {
        return S().get('preset') === 'simple' ? '2d' : '3d';
    }

    function mountStage() {
        const container = NAF.UI.stageEl();
        const want = wantedRenderer();

        // Set before the early return below: Full farm and High contrast share
        // the WebGL renderer, so this would never update on a swap between them.
        document.getElementById('naf').dataset.preset = S().get('preset');

        if (stage && stage.id === want) {
            stage.setPreset(S().get('preset'));
            return;
        }
        if (stage) stage.destroy();

        if (want === '3d') {
            stage = NAF.Stage3D;
            if (!stage.mount(container)) {
                console.warn('[NAF] WebGL is not available. Running the Simple renderer instead.');
                stage = NAF.Stage2D;
                stage.mount(container);
                // The scene is Simple now whatever the setting says, and the
                // setting follows so the menu never lies about what is on screen.
                S().set('preset', 'simple');
            }
        } else {
            stage = NAF.Stage2D;
            stage.mount(container);
        }

        stage.setPreset(S().get('preset'));
        stage.setMotion(S().get('moves'));
        stage.setPosition(S().get('appearsAt'));
        NAF.Reveal.setStage(stage);
    }

    function applyPreset() {
        mountStage();
        NAF.Reveal.cancel();
    }

    // --- stamps -----------------------------------------------------------------

    /**
     * The stamp/board bookkeeping only - the reveal sequence speaks and
     * captions the naming line and the fact itself (it needs the words up
     * front to time how long the animal stays out), so this does not repeat
     * that here.
     */
    function awardStamp(animal) {
        S().addStamp(animal.id);
        NAF.Audio.play('friend');
        NAF.Audio.play('sparkle', 0.6);
        NAF.UI.renderStamps();

        const filled = S().progress().stamps.length;

        if (filled >= 5) {
            setTimeout(function () {
                if (S().get('celebrateRow')) {
                    NAF.Audio.play('fanfare');
                    // Built once and handed to both, not called twice - it
                    // rotates through a few phrasings on its own counter, so
                    // a second call here would have silently skipped every
                    // other one of them, and could have shown different words
                    // than it spoke.
                    //
                    // This lands partway through a reveal, which is about to
                    // read out the animal's own fact. gapAfter keeps a beat of
                    // silence between the two so they are heard as "you filled
                    // your board" and then, separately, something about the
                    // animal - rather than one long run-on sentence.
                    const line = NAF.Say.rowComplete();
                    NAF.Voice.speak(line, { interrupt: false, gapAfter: 1000 });
                    if (S().get('showCaptions')) NAF.UI.celebrateRow(line);
                }
                S().clearRow();
                NAF.UI.renderStamps();
            }, 900);
        }
    }

    // --- modes ------------------------------------------------------------------

    function startMode(m) {
        mode = m;
        hasStarted = true;
        target = null;
        NAF.Reveal.cancel();
        NAF.UI.hideChoices();

        if (m === 'barn') {
            NAF.UI.show('play');
            NAF.Voice.speak(NAF.Say.barnPrompt());
            return;
        }

        if (m === 'pick') {
            // A handful of the animals, not all of them. The board keeps the same
            // shape all game; only who is standing in each slot changes.
            pickBoard = NAF.Animals.randomBoard();
            NAF.UI.showChoices(pickBoard, NAF.Say.pickPrompt());
            NAF.UI.show('play');
            NAF.Voice.speak(NAF.Say.pickPrompt());
            return;
        }

        // Listen and Find
        NAF.UI.show('play');
        newFindRound();
    }

    function newFindRound() {
        const pool = NAF.Animals.pool();
        const count = Math.max(1, Math.min(S().get('choices'), pool.length));
        target = NAF.Animals.randomFromPool();
        NAF.UI.showChoices(NAF.Animals.choiceSet(target, count), '');
        NAF.Input.refresh(true);

        // A riddle about the target instead of a recorded animal sound or a
        // prompt that just named it outright - the player has to match the
        // clue to a picture rather than hear the answer and repeat it back,
        // and still learns something true about the animal either way.
        // Captioned and timed the same way the reveal is (and only captioned
        // when Text to Speech is on), so a player who cannot hear still gets
        // the full prompt without it being forced on everyone else.
        const riddle = NAF.Facts.riddle(target);
        const line = NAF.Say.findPrompt(target, riddle);
        // The question STAYS up until it is answered - the player has to scan
        // to a card and choose it, which is several presses after the reading
        // finishes, and a caption that timed itself out took the clue away
        // before they could act on it. Scanning is held for the reading only;
        // pickAnimal takes the caption down. Spoken either way, printed only
        // if Show Text is on - an empty line holds the scanner without
        // printing anything.
        NAF.UI.stickyBanner(S().get('showCaptions') ? line : '',
            NAF.Voice.estimateMs(line) + 500);
        NAF.Voice.speak(line, { interrupt: false });
    }

    /**
     * Open the Barn. Selecting is refused while the reveal is still playing -
     * see isBusy - so each press gets to play out in full before another can
     * start one.
     */
    function pressBarn() {
        NAF.Reveal.cancel();
        NAF.Reveal.play(NAF.Animals.randomFromPool(), { onNamed: awardStamp });
    }

    function pickAnimal(animal) {
        if (!animal) return;

        if (mode === 'pick') {
            NAF.Reveal.cancel();
            NAF.Reveal.play(animal, { onNamed: awardStamp });

            // Swap that animal out for a new face, in the same slot, so the board
            // keeps its shape and there is always somebody new to meet. Done now
            // rather than at the end of the reveal so the change reads as feedback
            // on the card just chosen.
            // The scan list runs in board order, so the animal's slot number is
            // also its scan index.
            const slot = pickBoard.findIndex(function (x) { return x.id === animal.id; });
            pickBoard = NAF.Animals.replaceOnBoard(pickBoard, animal);
            NAF.UI.showChoices(pickBoard, NAF.Say.pickPrompt());
            NAF.Input.refresh(false);
            // refresh() keys off the item id, which has just changed, so put the
            // highlight back where the player left it rather than at the start.
            if (slot >= 0) NAF.Input.setIndex(slot);
            return;
        }

        // Listen and Find. No fail state.
        //
        // No target means the last answer has already been accepted (it is
        // cleared below) and this press is the player moving on rather than
        // waiting out the celebration - so it starts the next round instead of
        // being scored against a question that is already over. Cancelling
        // first stops the finished reveal from starting a round of its own on
        // top of this one.
        if (!target) {
            NAF.Reveal.cancel();
            newFindRound();
            return;
        }

        // The question has been answered, so it comes down - see stickyBanner.
        NAF.UI.clearSticky();

        if (animal.id !== target.id) {
            // Name what they chose, then point back at the target. No reveal
            // runs here, so the busy window is set by hand to cover the
            // sequence - otherwise a wrong pick could be spammed. Sized to the
            // line's own length rather than a fixed guess, same reasoning as
            // the reveal sequence.
            const line = NAF.Say.wrongPick(animal, target);
            const ms = NAF.Voice.estimateMs(line);
            feedbackUntil = Date.now() + ms + 1100;
            NAF.Voice.speak(line);
            if (S().get('showCaptions')) NAF.UI.banner(line, ms + 500);
            setTimeout(function () { NAF.UI.pointAt(target.id); }, ms + 600);
            return;
        }

        NAF.Voice.speak(NAF.Say.rightPick(animal));
        // Answered. Cleared now rather than when the next round starts, so a
        // press during the celebration's final look moves on instead of
        // re-answering this one - see the !target branch above.
        target = null;
        NAF.Reveal.cancel();
        NAF.Reveal.celebrate(animal, {
            onNamed: awardStamp,
            onDone: function () {
                if (NAF.UI.current() === 'play' && mode === 'find') newFindRound();
            }
        });
    }

    // --- navigation ---------------------------------------------------------------

    /**
     * Back to the chooser, to pick a different way to play. The current round is
     * dropped and the previous mode's choice row cleared, so whatever is picked
     * next starts fresh rather than on top of what was already on screen.
     */
    function toModes() {
        NAF.Reveal.cancel();
        NAF.UI.hideChoices();
        NAF.UI.show('modes');
    }

    function toMenu() {
        NAF.Reveal.cancel();
        NAF.UI.hideChoices();
        hasStarted = false;
        NAF.UI.show('menu');
    }

    /**
     * Show a zone WITHOUT committing to it, for the menu's highlight.
     *
     * Only the look changes: the stage's scenery and the menu's building. The
     * saved zone, the roster, the wording and the friend board are all left
     * alone, so scanning across the menu cannot alter the player's progress or
     * where the game thinks they are - only what they are looking at. Choosing
     * the place is what commits it, through enterZone below.
     */
    let previewing = null;
    function previewZone(id) {
        const zone = NAF.Zones.byId(id);
        if (previewing === zone.id) return;      // already showing this place
        previewing = zone.id;
        if (stage && stage.setZone) stage.setZone(zone);
        NAF.UI.skinZone(zone);
    }

    /**
     * Travel to a zone: remember it, retheme the stage, then offer that zone's
     * ways to play. Every animal on screen belongs to the old zone, so the
     * choice row is dropped and the reveal cancelled before the swap - a fish
     * left standing in front of a barn would be the one visible bug here.
     */
    function enterZone(id) {
        NAF.Reveal.cancel();
        NAF.UI.hideChoices();
        const zone = NAF.Zones.set(id);
        previewing = zone.id;
        if (stage && stage.setZone) stage.setZone(zone);
        // Normally the preview has already done this, but enterZone can also be
        // reached without the highlight ever resting on the place first.
        NAF.UI.skinZone(zone);
        NAF.UI.show('modes');
    }

    /**
     * Exit back to the hub. Without this the player reaches the end of the
     * game and is stranded with focus nowhere.
     *
     * The hub runs apps in an iframe and listens for a `focusBackButton`
     * message to close it. Outside the hub there is no parent to tell, so we
     * navigate to the hub page directly. Same pattern as Show n Sound,
     * Football, Dice and Bowling.
     */
    function exit() {
        NAF.Reveal.cancel();
        NAF.Voice.speak('Goodbye.');
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ action: 'focusBackButton' }, '*');
        } else {
            window.location.href = '../../../index.html';
        }
    }

    // --- boot ---------------------------------------------------------------------

    function boot() {
        NAF.Animals.warnPlaceholders();
        NAF.UI.build();
        NAF.Audio.init();
        NAF.UI.applyChrome();

        mountStage();

        NAF.Input.init();
        NAF.Input.setProvider(NAF.UI.scannables);

        window.addEventListener('resize', function () {
            if (stage && stage.resize) stage.resize();
            NAF.UI.fit();
        });

        // Settings can change in the hub while a game is open.
        if (window.NarbeScanManager && window.NarbeScanManager.subscribe) {
            window.NarbeScanManager.subscribe(function () { NAF.Input.restartAutoScan(); });
        }

        NAF.UI.show('menu');

        // Voices load asynchronously, so the greeting on the very first show may
        // have had nothing to speak with. Say it again once they are ready.
        if (window.NarbeVoiceManager && window.NarbeVoiceManager.waitForVoices) {
            window.NarbeVoiceManager.waitForVoices().then(function () {
                if (NAF.UI.current() === 'menu') NAF.Voice.speak(NAF.Say.greeting());
            });
        }
    }

    return {
        boot: boot,
        mode: function () { return mode; },
        started: function () { return hasStarted; },
        stage: function () { return stage; },
        startMode: startMode,
        isBusy: isBusy,
        pressBarn: pressBarn,
        pickAnimal: pickAnimal,
        toModes: toModes,
        toMenu: toMenu,
        enterZone: enterZone,
        previewZone: previewZone,
        exit: exit,
        applyPreset: applyPreset
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', NAF.Game.boot);
} else {
    NAF.Game.boot();
}
