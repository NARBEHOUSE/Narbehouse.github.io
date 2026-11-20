/**
 * NARBE Space Explorer - speech, through the hub's shared voice manager
 * (TTS on/off and the chosen voice live there; this file never copies them).
 * (From NARBE Build n Ride.)
 *
 * Scan labels and selections speak at once and clear the queue. Game events
 * ("Arriving at Velara...", facts, scan results) wait their turn so a scene
 * change never cuts them off; stale ones are dropped. Aliens speak through
 * the same manager with their own pitch and rate.
 */

window.NSE = window.NSE || {};

NSE.Voice = (function () {
    'use strict';
    function vm() { return window.NarbeVoiceManager; }
    let current = null, queue = [], busy = false;

    function speakNow(text, opts) {
        try { return text && vm() ? vm().speak(text, opts || {}) : null; } catch (e) { return null; }
    }

    function next() {
        busy = false;
        const now = Date.now();
        while (queue.length && now - queue[0].at > 9000) queue.shift();
        const item = queue.shift();
        if (!item) return;
        run(item.text, item.opts);
    }

    function run(text, opts) {
        busy = true;
        const ticket = current = speakNow(text, opts);
        const done = ticket && ticket.finished ? Promise.resolve(ticket.finished) : new Promise(r => setTimeout(r, Math.min(7000, 400 + text.length * 70)));
        const cap = new Promise(r => setTimeout(r, 11000));
        Promise.race([done, cap]).then(() => { if (current === ticket) next(); });
        return ticket;
    }

    return {
        /** Speak now, interrupting (scan labels, selections, screen titles). */
        speak: function (text, opts) { queue = []; busy = false; current = null; return speakNow(text, opts); },
        /** Say a game event after whatever is being said now. */
        say: function (text, opts) {
            if (!text) return;
            if (!busy) run(text, opts);
            else if (queue.length < 3) queue.push({ text: text, opts: opts, at: Date.now() });
        },
        /** Say a game event right now, dropping anything queued. Returns the ticket. */
        sayNow: function (text, opts) { queue = []; return run(text, opts); },
        cancel: function () { queue = []; busy = false; current = null; try { if (vm()) vm().cancel(); } catch (e) { /* none */ } },
        busy: function () { return busy || queue.length > 0; },
        on: function () { try { return !!vm().getSettings().ttsEnabled; } catch (e) { return false; } }
    };
})();
