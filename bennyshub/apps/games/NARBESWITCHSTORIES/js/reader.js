/**
 * NARBE Switch Stories - reading a page aloud.
 *
 * The hub's shared voice manager reads the words in the selected computer
 * voice. Recorded narration is not currently offered.
 *
 * The words are not highlighted while they are read (the user's choice,
 * 2026-10-20: the shared voice manager cannot say which word it is on, so a
 * highlight could only guess, and it did not match the voice).
 *
 * The story's Read Aloud setting is this game's own: the story is read even
 * when the hub's Text to Speech (Speak Menus) is off. Read Aloud Off leaves
 * the words on screen for a grown-up to read.
 */

window.NSS = window.NSS || {};

NSS.Reader = (function () {
    'use strict';

    const CHARS_PER_SECOND = 14;     // a computer voice at normal speed, roughly
    const SILENT_PAUSE = 700;        // ms on a page when Read Aloud is off

    let token = 0;
    let timers = [];
    let ticket = null;

    function S() { return NSS.Settings; }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

    function stop() {
        token++;
        timers.forEach(clearTimeout);
        timers = [];
        if (ticket) { try { ticket.cancel(); } catch (e) { /* already done */ } ticket = null; }
    }

    /** The computer voice's speed: the hub's own rate, times Reading Speed. */
    function rate() {
        let hub = 1;
        try { hub = window.NarbeVoiceManager.getSettings().rate || 1; } catch (e) { /* default */ }
        return hub * S().option('rate').rate;
    }

    function estimateMs(text, r) { return Math.max(800, text.length / (CHARS_PER_SECOND * r) * 1000); }

    /** Read with the computer voice, through the shared voice manager. */
    function speakWords(text, t, finish) {
        const r = rate();
        const total = estimateMs(text, r);
        const began = performance.now();
        // Keep pronunciation hints out of the printed story and description chart.
        // "Tiers" sounds like tears from crying; limit it to crying phrases so
        // a future sentence about someone who tears paper keeps its own sound.
        const spoken = text.replace(/\brecess\b/gi, 'ree-sess')
            .replace(/\b(wipes away (?:his|her|their) )tears\b/gi, '$1tiers')
            .replace(/\btears(?= on (?:his|her|their) cheeks\b)/gi, 'tiers');
        ticket = NSS.Voice.speak(spoken, { rate: r, force: true });
        if (!ticket) { later(finish, total + 300); return; }    // no voice at all: give the words time, then carry on
        Promise.resolve(ticket.finished).then(function (result) {
            if (t !== token) return;
            const reason = result && result.reason;
            if (reason === 'end' || reason === 'cancelled') { finish(); return; }
            // The voice manager stops waiting after 10 seconds without cutting the
            // voice off, and a voice can fail. Either way, carry on when the
            // estimate says the words are done.
            later(finish, Math.max(0, total + 300 - (performance.now() - began)));
        });
    }

    /** Read a page, then call done(). */
    function read(page, done) {
        stop();
        const t = token;
        const finish = function () {
            if (t !== token) return;
            stop();
            done();
        };
        if (!S().is('readAloud', 'on')) { later(finish, SILENT_PAUSE); return; }
        speakWords(page.text, t, finish);
    }

    return {
        read: read,
        stop: stop
    };
})();
