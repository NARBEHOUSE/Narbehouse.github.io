/**
 * NARBE Animal Friends - the reveal sequence.
 *
 * This file must NOT import Three.js and must never touch the stage directly.
 * It drives the loop by calling methods that both stage3d.js and stage2d.js
 * implement. That interface is what keeps the Simple preset honest and keeps the
 * two renderers from drifting apart.
 *
 * The rule that governs all of it: nothing new goes between the press and the
 * first sound. The player must never wonder whether the press registered.
 *
 * Pressing at any point cuts the sequence short and starts a fresh reveal.
 * Input is never blocked during the animation - a child hammering the switch
 * should get a fast, slightly chaotic barn, not a frozen one.
 */

window.NAF = window.NAF || {};

NAF.Reveal = (function () {
    'use strict';

    let stage = null;
    let timers = [];
    let running = false;
    let current = null;
    let onFinished = null;
    /**
     * When this reveal stops having anything the player is waiting FOR - the
     * animal's noise, the spoken lines, the caption. See isBusy: after this
     * moment the animal is simply being looked at, and a press is allowed to
     * move straight on to the next one rather than being refused until the
     * doors have finished closing.
     */
    let contentUntil = 0;

    function setStage(s) { stage = s; }

    /**
     * The current zone's sound set. The seven beats are the same everywhere, so
     * this file names sounds by their ROLE - open, close, press, rattle - and
     * lets the zone say which recording fills each one. A barn door creaks and
     * thumps; a glass hatch slides and clicks; a park gate groans and clunks.
     * Read per call, never cached, so a zone change takes effect immediately.
     */
    function SND() { return NAF.Zones.current().sounds; }

    function at(ms, fn) {
        timers.push(setTimeout(fn, ms));
    }

    function clearTimers() {
        timers.forEach(clearTimeout);
        timers = [];
    }

    /** Cut a running reveal short. Safe to call at any point. */
    function cancel() {
        clearTimers();
        running = false;
        current = null;
        contentUntil = 0;
        // The caption describes an animal that is no longer on screen, and a
        // queue left behind would keep the scanner switched off long after
        // the reading it was protecting stopped.
        NAF.UI.clearBanners();
        if (stage) stage.reset();
    }

    function isRunning() { return running; }

    /**
     * Whether a press should be refused right now.
     *
     * NOT the same as "is a reveal running". A reveal spends its last few
     * seconds with the animal simply standing there being looked at, and then
     * another second and a half walking back in and closing the doors - and
     * refusing presses through all of that is what made the game feel like it
     * was waiting for permission to continue. A player who has heard the fact
     * and seen the animal should be able to press and get the next one.
     *
     * What a press must NOT be able to do is cut off the animal's own noise or
     * a sentence halfway through, so it is refused until the content is over
     * and allowed after.
     */
    function isBusy() {
        return running && Date.now() < contentUntil;
    }

    function animal() { return current; }

    /**
     * Play the full seven beats for one animal.
     *
     * opts.silentName  skip the spoken naming (Listen and Find speaks its own line)
     * opts.pose        the pose to hold during looking time, default 'idle'
     * opts.onNamed     fired at beat 5, when the animal has been named
     * opts.onDone      fired after the doors have shut
     */
    function play(a, opts) {
        opts = opts || {};
        clearTimers();
        running = true;
        current = a;
        onFinished = opts.onDone || null;

        const S = NAF.Settings;
        const waitMs = S.waitMs();
        const doorMs = S.doorMs();
        const lookMs = S.lookingMs();

        // Beat 0 - the press. Zero delay, always, before anything else.
        NAF.Audio.play(SND().press);
        stage.reset();
        stage.setAnimal(a);
        stage.setPosition(S.get('appearsAt'));
        stage.setMotion(S.get('moves'));
        stage.nudge();

        // Beat 1 - wait and wonder.
        stage.anticipate(waitMs);
        at(60, function () { NAF.Audio.play(SND().rattle, 0.8); });
        at(Math.round(waitMs * 0.15), function () { NAF.Audio.barnSong(); });

        // Beat 2 - the doors swing. The creak carries the mechanics; the rising
        // sweep and the sparkle on top are what make it feel like a good thing
        // is about to happen rather than just a door moving.
        at(waitMs, function () {
            NAF.Audio.play(SND().open);
            NAF.Audio.play('whoosh', 0.85);
            stage.openDoors(doorMs);
        });
        at(waitMs + Math.round(doorMs * 0.55), function () { NAF.Audio.play('sparkle', 0.75); });

        // Beat 3 - come out.
        const outAt = waitMs + doorMs;
        const outMs = 1000;
        at(outAt, function () {
            NAF.Audio.play('footsteps', 0.8);
            stage.bringOut(outMs);
        });
        at(outAt + outMs - 120, function () { NAF.Audio.play('landing', 0.7); });

        // Beat 4 - the call. The animal's own recording, where it has one:
        // sounds/animals/<id>.wav, played as it poses and pops. Where it does
        // not, this beat is silent and the animal's sound word is spoken
        // instead a moment later, as part of Beat 5's naming line - the two are
        // the same thing said two ways, so exactly one of them happens. The
        // spoken FACT is unaffected either way; it comes after.
        const callAt = outAt + outMs;
        at(callAt, function () {
            stage.setPose('call');
            stage.pop();
            NAF.Audio.playAnimal(a);
        });
        const callEnd = callAt + 800;
        at(callEnd, function () { stage.setPose(opts.pose || 'idle'); });

        // Beat 5 - name it. The fact is picked once, right here, and threaded
        // through everything that follows - spoken, captioned and handed to
        // onNamed - so it is always the same words in all three places.
        const fact = NAF.Facts.random(a);
        const nameLine = opts.silentName ? '' : NAF.Say.reveal(a);
        const factLine = NAF.Say.friendEarned(a, fact);
        // Two independent switches, not one. `speaks` is the hub's own Text to
        // Speech setting: with it off the voice manager reads nothing, so
        // there are no words to wait for. `captions` is this game's Show Text
        // setting, and only decides whether those same words are ALSO printed
        // over the animal - turning it off leaves the reading exactly as it
        // was, just without text on screen.
        const speaks = NAF.Voice.ttsEnabled();
        const captions = NAF.Settings.get('showCaptions');
        const spokenMs = speaks ? (NAF.Voice.estimateMs(nameLine) + NAF.Voice.estimateMs(factLine)) : 0;

        at(callEnd, function () {
            stage.bloom();
            NAF.Audio.play('bloom', 0.6);
            if (opts.onNamed) opts.onNamed(a);
        });

        // Beat 6 - looking time.
        //
        // How long the animal stays out follows WHAT IS ACTUALLY HAPPENING in
        // this particular reveal, not a fixed setting. That is the whole point
        // of this block: with Speaking off and Show Text off there is nothing
        // to wait for, and holding the animal for the full Looking Time (4.5
        // seconds by default) left the player sitting in silence in front of a
        // motionless animal, unable to move on, for longer than the reveal
        // itself had taken. The content is the clock:
        //
        //   - a recording plays  -> hold until the noise is over
        //   - words are read     -> hold until they are said
        //   - a caption is shown -> hold until it comes down
        //   - none of the above  -> there is nothing to hold for
        //
        // and then LOOK_AFTER either way, so the animal is always still there
        // for a moment once the last thing finishes rather than vanishing on
        // the final syllable.
        const soundMs = NAF.Audio.animalSoundMs(a);
        const soundEnd = callAt + soundMs;

        // The words wait for the animal's own noise to finish - talking over a
        // recorded moo makes both unintelligible - and, when there are words,
        // for a look at the animal first. Looking Time sets the length of that
        // look, since looking is what it is for; a floor keeps a short setting
        // from cutting straight from the pop to the talking.
        const beforeWords = speaks ? Math.max(1200, Math.round(lookMs / 2)) : 0;
        const speakAt = Math.max(callEnd + beforeWords, soundEnd + (speaks ? 250 : 0));

        // Half a second of margin for a voice running slightly past the
        // estimate. Only counted when a caption is actually on screen: with
        // Show Text off there is nothing to leave up.
        const CAPTION_TAIL_MS = 500;
        // "Still there for a moment afterwards". Fixed, and short: this is the
        // beat that used to be the whole Looking Time.
        const LOOK_AFTER_MS = 2000;

        if (speaks) {
            at(speakAt, function () {
                if (nameLine) NAF.Voice.speak(nameLine, { interrupt: false });
                NAF.Voice.speak(factLine, { interrupt: false });
                // A caption of both lines together, up for as long as they
                // take to say plus a short tail. Scanning is paused for that
                // stretch - see showBanner() in ui.js - so an auto-scan tick
                // cannot talk over it or move on early.
                if (captions) {
                    NAF.UI.banner((nameLine ? nameLine + ' ' : '') + factLine,
                        spokenMs + CAPTION_TAIL_MS);
                }
            });
        }

        // When the last thing the player is waiting for is over. Everything
        // after this point is the animal simply being looked at.
        const contentEnd = Math.max(
            callEnd,
            soundEnd,
            speaks ? speakAt + spokenMs + (captions ? CAPTION_TAIL_MS : 0) : 0
        );
        const awayAt = contentEnd + LOOK_AFTER_MS;

        // A little more often than never, a small themed sound plays while the
        // player is looking - a bird in the barn, a glint of light in the tank,
        // a distant call on the savanna. Gated to about one reveal in three:
        // the point is an occasional surprise that says the place is alive
        // around the animal, not a fourth beat that fires reliably enough to
        // predict. Skipped entirely on a short reveal, where it would land on
        // top of the animal's own noise instead of in a gap.
        if (Math.random() < 0.35 && contentEnd - callEnd > 1200) {
            at(callEnd + Math.round((contentEnd - callEnd) * 0.5), function () {
                NAF.Audio.play(SND().ambient, 0.55);
            });
        }

        // Once the content is done the player is free to move on - see
        // isBusy(). Until then a press is refused, so a reveal cannot be cut
        // off in the middle of its own sentence.
        contentUntil = Date.now() + contentEnd;

        // Beat 7 - back inside.
        //
        // awayAt above covers this reveal's OWN caption, but not one that
        // arrived on top of it: filling the board speaks and shows a cheer of
        // its own partway through, and the animal walking off mid-sentence is
        // exactly the "it moves on too fast" this is meant to avoid. So the
        // retreat waits for however much caption time is genuinely left,
        // re-checking rather than assuming - a second cheer, or a long
        // phrasing, extends it again. Everything is scheduled through at(),
        // so a fresh press still cancels the whole chain as before.
        function goAway() {
            // Whichever still has further to run. The caption and the voice
            // can now be switched on independently of each other (Show Text
            // and Speaking), and a filled-board cheer extends either of them
            // partway through - so waiting on only one would let the animal
            // walk off mid-sentence whenever that was the longer of the two.
            const left = Math.max(NAF.UI.bannerBusyMs(), NAF.Voice.busyMs());
            if (left > 0) { at(left + 200, goAway); return; }
            stage.putAway(900);
            NAF.Audio.play('footsteps', 0.55);
            at(700, function () {
                stage.closeDoors(doorMs);
                NAF.Audio.play(SND().open, 0.6);
            });
            at(700 + doorMs, function () {
                NAF.Audio.play(SND().close);
                running = false;
                current = null;
                if (onFinished) { const f = onFinished; onFinished = null; f(a); }
            });
        }
        at(awayAt, goAway);
    }

    /**
     * A shortened reveal used by Pick an Animal and Listen and Find once the
     * choice is already made: the animal is named by the caller, so this skips
     * the wondering and goes straight to the doors.
     */
    function celebrate(a, opts) {
        opts = opts || {};
        play(a, {
            silentName: opts.silentName,
            pose: 'happy',
            onNamed: opts.onNamed,
            onDone: opts.onDone
        });
    }

    return {
        setStage: setStage,
        play: play,
        celebrate: celebrate,
        cancel: cancel,
        isRunning: isRunning,
        isBusy: isBusy,
        animal: animal
    };
})();
