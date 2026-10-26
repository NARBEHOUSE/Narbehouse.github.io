/**
 * NARBE Switch Songs - switch input.
 *
 * MENUS follow the hub's shared choice-scan contract through
 * NarbeChoiceScanAdapter (ACCESSIBILITY.md section 4):
 *   Space, tap       move the highlight forward, on release
 *   Space, hold      scan backwards, repeating at the player's scan speed
 *   Enter, release   choose what is highlighted
 *   Auto Scan        the highlight moves by itself; Enter chooses
 * Every screen starts on the blank park step, so a stray press lands on
 * nothing.
 *
 * PLAY A SONG scans: blank, Play Each Note, Keyboard, Listen to Song, Options.
 * Choosing Play Each Note highlights the keyboard without playing. With Keyboard highlighted, Enter
 * plays the note on the PRESS (a note that waits for release drags behind
 * the beat), and the release does not choose anything. Each note holds the
 * auto scan clock, so the highlight stays on Play while the player keeps
 * playing. Holding Enter for five seconds pauses from anywhere in the song.
 * FREE PLAY uses the same pause hold; shorter presses still choose on release.
 *
 * The shared scan manager filters switch bounce and too-quick repeats
 * before any of this sees a key. When it swallows a press it sends
 * narbe-input-cancelled, and every half-held state here is cleared.
 */

window.NSS = window.NSS || {};

NSS.Input = (function () {
    'use strict';

    const BACK_SCAN_HOLD = 3000;   // hold Space this long to scan backwards (hub convention)
    const PAUSE_HOLD = 5000;       // song and Free Play pause hold (as in Magic Button)
    const RING_SHOW = 1000;        // the hold bar appears after this much of the hold

    let provider = function () { return []; };
    let items = [];
    let focused = null;
    let lastFocusId = null;
    let choice = null;
    let enabled = true;

    let spaceHeld = false, enterHeld = false, braking = false, cancelSpaceRelease = false;
    let enterPlayed = false;
    let backTimer = null, backRepeat = null;
    let pauseTimer = null, swallowEnter = false;
    let previousAuto = false;

    function SM() { return window.NarbeScanManager; }
    function scanInterval() { try { return SM().getScanInterval() || 2000; } catch (e) { return 2000; } }

    // --- the scan list -----------------------------------------------------------

    function ensureChoice() {
        if (choice || !window.NarbeChoiceScanAdapter || !SM()) return choice;
        choice = window.NarbeChoiceScanAdapter.create({
            holdThreshold: BACK_SCAN_HOLD,
            stateHost: document.getElementById('nss'),
            speak: function (text) { return NSS.Voice.speak(text); },
            onHighlight: function (item, state, context) {
                const previous = focused;
                focused = item ? item.source : null;
                paint();
                if (focused && previous !== focused) NSS.Sound.blip();
                if (!item && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
                NSS.UI.onScan(state, context);
            },
            onSelect: function (item) { if (item && item.source) run(item.source); }
        });
        return choice;
    }

    function syncChoice(fresh) {
        const c = ensureChoice();
        if (!c) return;
        if (!enabled || !items.length) {
            c.sync(null);
            if (focused) { focused = null; paint(); }
            return;
        }
        // Inside a row, a plain redraw must not swap the row's items back for
        // the screen's own list. Only a fresh screen leaves the row.
        const state = c.getState();
        if (!fresh && c.active && state && state.depth > 0) { c.setInputHeld(spaceHeld || enterHeld); return; }
        const context = NSS.UI.scanContext();
        c.sync({ key: context.key, statusHost: context.host, items: items.map(toChoice) }, { fresh: !!fresh });
        c.setInputHeld(spaceHeld || enterHeld);
    }

    function toChoice(it) {
        return {
            id: it.id,
            label: function () { return typeof it.speak === 'function' ? it.speak() : it.speak; },
            element: it.el,
            labelElement: it.el,
            source: it
        };
    }

    /** Step into a row: its items loop, with the hub's spoken Back stop after the last one. */
    function enterGroup(key, list) {
        if (!choice || !choice.active) return false;
        const context = NSS.UI.scanContext();
        return choice.enterGroup({ key: key, statusHost: context.host, items: list.filter(it => it && it.el).map(toChoice) },
            { wrap: true, backStop: true });
    }

    function back() { return !!(choice && choice.back({ restore: true })); }

    /** Leave any rows, back to the screen's own list (for mouse and touch). */
    function leaveGroups() {
        let guard = 5;
        while (choice && choice.active && guard-- > 0) {
            const st = choice.getState();
            if (!st || st.depth <= 0) break;
            choice.back({ restore: true });
        }
    }

    function align(id) { return !!(choice && choice.align(id)); }

    function setProvider(fn) { provider = fn; refresh(true); }

    /** Re-read the scan list. A fresh list starts with nothing highlighted. */
    function refresh(fresh) {
        items = (provider() || []).filter(function (it) { return it && it.el; });
        if (fresh) { focused = null; lastFocusId = null; clearAll(); }
        wireClicks();
        syncChoice(fresh);
        paint();
    }

    function wireClicks() {
        items.forEach(function (item) {
            if (item.id === 'song:play' || item.el.dataset.nssWired === '1') return;
            item.el.dataset.nssWired = '1';
            item.el.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const current = items.find(function (it) { return it.el === item.el; });
                if (!current) return;
                leaveGroups();
                align(current.id);
                run(current);
            });
        });
    }

    /** Colour AND thickness AND a lift, never colour alone. */
    function paint(reveal) {
        document.querySelectorAll('.nss-focus, .nss-focus-full').forEach(function (el) {
            el.classList.remove('nss-focus', 'nss-focus-full');
        });
        const item = focused;
        if (!item || !item.el) { lastFocusId = null; return; }
        item.el.style.setProperty('--focus-color', NSS.Settings.highlightColor());
        item.el.style.setProperty('--focus-ink', NSS.Settings.highlightInk());
        item.el.classList.add(NSS.Settings.get('highlightStyle') === 'full' ? 'nss-focus-full' : 'nss-focus');
        if (reveal || item.id !== lastFocusId) {
            lastFocusId = item.id;
            item.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            if (typeof item.onFocus === 'function') {
                try { item.onFocus(); } catch (e) { console.warn('[NSS] onFocus threw:', e); }
            }
        }
    }

    function run(item) {
        if (!item || typeof item.action !== 'function') return;
        if (!item.quiet) NSS.Sound.choose();
        item.action(item);
    }

    function step(delta) {
        if (choice && choice.active) { choice.step(delta); return; }
        if (!items.length) return;
        const i = focused ? items.indexOf(focused) : -1;
        focused = items[i < 0 ? (delta > 0 ? 0 : items.length - 1) : (i + delta + items.length) % items.length];
        paint();
        NSS.Sound.blip();
        NSS.Voice.speak(typeof focused.speak === 'function' ? focused.speak() : focused.speak);
    }

    function select() {
        if (choice && choice.active) { choice.select(); return; }
        if (focused) run(focused);
    }

    /** Speak a screen's arrival line, keeping the controller's "park" label if it is due. */
    function announce(text) {
        if (choice && choice.active) {
            let park = false;
            try {
                const s = SM().getSettings();
                park = choice.getState().index < 0 && s.autoScan && s.parking !== 'off';
            } catch (e) { /* no scan manager */ }
            choice.announce(text + (park ? '. Park' : ''), { parkingLabel: park });
            return;
        }
        NSS.Voice.speak(text);
    }

    /** Play a Song: is Play the highlighted choice right now? */
    function onPlay() {
        if (NSS.UI.current() !== 'song' || !choice || !choice.active) return false;
        const st = choice.getState();
        return !!st && !st.parked && st.id === 'song:play';
    }

    // --- hold Space: scan backwards ------------------------------------------------

    function startBackwardsScan() {
        step(-1);
        if (backRepeat) clearInterval(backRepeat);
        backRepeat = setInterval(function () { step(-1); }, scanInterval());
    }

    function clearSpaceState() {
        if (backTimer) { clearTimeout(backTimer); backTimer = null; }
        if (backRepeat) { clearInterval(backRepeat); backRepeat = null; }
        spaceHeld = false;
        cancelSpaceRelease = false;
    }

    // --- hold Enter during song or Free Play: pause ---------------------------------

    function startPauseHold() {
        stopPauseHold();
        const t0 = performance.now();
        let beeps = 0;
        pauseTimer = setInterval(function () {
            const t = performance.now() - t0;
            if (t >= RING_SHOW) {
                NSS.UI.holdRing((t - RING_SHOW) / (PAUSE_HOLD - RING_SHOW));
                const s = Math.floor((t - RING_SHOW) / 1000) + 1;
                if (s > beeps && s <= 4) { beeps = s; NSS.Sound.beep(s); }
            }
            if (t >= PAUSE_HOLD) {
                stopPauseHold();
                swallowEnter = true;   // its release must not choose anything on the pause menu
                NSS.Game.pause();
            }
        }, 40);
    }

    function stopPauseHold() {
        if (pauseTimer) clearInterval(pauseTimer);
        pauseTimer = null;
        NSS.UI.holdRing(0);
    }

    // --- presses -----------------------------------------------------------------------

    function isEnter(code) { return code === 'Enter' || code === 'NumpadEnter'; }
    function isSwitchKey(code) { return code === 'Space' || isEnter(code); }

    function switchDown(code) {
        if (isEnter(code)) {
            if (enterHeld) stopPauseHold();      // a fresh press while "held": the release was lost
            enterHeld = true;
            swallowEnter = false;
            enterPlayed = false;
            if (choice) choice.setInputHeld(true);
            if (NSS.UI.current() === 'song' || NSS.UI.current() === 'free') {
                startPauseHold();
                if (onPlay()) { enterPlayed = true; NSS.Game.note(); }
            }
            return;
        }
        if (spaceHeld) clearSpaceState();        // the same for Space
        if (choice && choice.brakePress()) { braking = true; return; }
        spaceHeld = true;
        if (choice) choice.setInputHeld(true);
        backTimer = setTimeout(function () {
            backTimer = null;
            if (spaceHeld) startBackwardsScan();
        }, BACK_SCAN_HOLD);
    }

    function switchUp(code) {
        if (isEnter(code)) {
            stopPauseHold();
            const wasHeld = enterHeld, swallow = swallowEnter, played = enterPlayed;
            enterHeld = false;
            swallowEnter = false;
            enterPlayed = false;
            if (choice) choice.setInputHeld(spaceHeld);
            if (!wasHeld || swallow || played) return;
            select();
            return;
        }
        if (braking) { braking = false; if (choice) choice.brakeRelease(); return; }
        const discard = cancelSpaceRelease, wasBack = backRepeat !== null, wasHeld = spaceHeld;
        clearSpaceState();
        if (choice) choice.setInputHeld(enterHeld);
        if (wasHeld && !wasBack && !discard) step(1);
    }

    function onKeyDown(e) {
        if (!enabled || e.ctrlKey || e.metaKey || e.altKey) return;
        // Escape is a caregiver shortcut only; nothing needs it.
        if (e.key === 'Escape') { if (!e.repeat) NSS.Game.escape(); return; }
        if (!isSwitchKey(e.code)) return;
        e.preventDefault();
        if (e.repeat) return;
        switchDown(e.code);
    }

    function onKeyUp(e) {
        if (!enabled || !isSwitchKey(e.code)) return;
        e.preventDefault();
        switchUp(e.code);
    }

    // Cancellation can describe a key or the whole input owner. In either case,
    // no half-held switch may carry a timer or a release into the next screen.
    function onCancelled() { clearAll(); }

    function clearAll() {
        stopPauseHold();
        clearSpaceState();
        enterHeld = false;
        enterPlayed = false;
        braking = false;
        swallowEnter = false;
        if (choice) choice.cancelInput();
    }

    // --- lifecycle -----------------------------------------------------------------------

    function init() {
        try { previousAuto = !!SM().getSettings().autoScan; } catch (e) { previousAuto = false; }
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('narbe-input-cancelled', onCancelled);
        window.addEventListener('blur', clearAll);
        window.addEventListener('pagehide', clearAll);
        document.addEventListener('visibilitychange', function () { if (document.hidden) clearAll(); });
        if (SM() && SM().subscribe) {
            SM().subscribe(function (next) {
                if (next.autoScan !== previousAuto && spaceHeld) {
                    if (backTimer) { clearTimeout(backTimer); backTimer = null; }
                    if (backRepeat) { clearInterval(backRepeat); backRepeat = null; }
                    cancelSpaceRelease = true;
                }
                previousAuto = next.autoScan;
                syncChoice(false);
            });
        }
    }

    /** Suspend all input (used while How to Play is read aloud). */
    function setEnabled(on) {
        enabled = !!on;
        clearAll();
        syncChoice(false);
    }

    return {
        init: init,
        setProvider: setProvider,
        refresh: refresh,
        paint: paint,
        announce: announce,
        enterGroup: enterGroup,
        back: back,
        leaveGroups: leaveGroups,
        align: align,
        setEnabled: setEnabled,
        state: function () { return choice ? choice.getState() : null; }
    };
})();
