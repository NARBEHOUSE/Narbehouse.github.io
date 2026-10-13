/**
 * NARBE Magic Button - switch input.
 *
 * MENUS (main menu, settings, pause, how to play) follow the hub's shared
 * choice-scan contract through NarbeChoiceScanAdapter:
 *   Space, tap       move the highlight forward - on release
 *   Space, hold      scan backwards, repeating at the player's scan speed
 *   Enter, release   choose what is highlighted
 *   Auto Scan        the highlight moves by itself; Enter chooses
 *
 * PLAY is cause and effect, and has two styles (the Pause setting):
 *   Hold Enter (default)  EVERY press makes magic, on the press itself: Space,
 *                         Enter, any key, a tap anywhere, or any game
 *                         controller button (so an Xbox Adaptive Controller
 *                         works too). Holding a key does not repeat. Holding
 *                         Enter (or controller button A) for five seconds opens
 *                         Pause, with a filling ring and a beep each second.
 *   Scan to Pause         The highlight moves between Magic and Pause, the
 *                         usual scan contract, for a player who cannot hold
 *                         a switch. Holding Enter still pauses too.
 *
 * The shared scan manager filters switch bounce and too-quick repeats before
 * any of this sees a key. When it swallows a press it sends
 * narbe-input-cancelled, and every half-held state here is cleared.
 */

window.NMB = window.NMB || {};

NMB.Input = (function () {
    'use strict';

    const BACK_SCAN_HOLD = 3000;   // hold Space this long to scan backwards (hub convention)
    const PAUSE_HOLD = 5000;       // hold Enter this long in play to pause (as in Pet Pals)
    const RING_SHOW = 1000;        // the pause ring appears after this much of the hold

    let provider = function () { return []; };
    let items = [];
    let index = -1;
    /** The highlighted item - in the screen's list, or in a row entered from it. */
    let focused = null;
    let lastFocusId = null;
    let choice = null;
    let enabled = true;

    let spaceHeld = false, enterHeld = false, braking = false, cancelSpaceRelease = false;
    let backTimer = null, backRepeat = null;
    let pauseTimer = null, swallowEnter = false;
    let previousAuto = false;

    function SM() { return window.NarbeScanManager; }
    function scanInterval() { try { return SM().getScanInterval() || 2000; } catch (e) { return 2000; } }

    /** Play in the default style: no scan list, every press makes magic. */
    function freePlay() {
        return NMB.UI.current() === 'play' && NMB.Settings.get('pauseMode') !== 'scan';
    }

    // --- the scan list -----------------------------------------------------------

    function ensureChoice() {
        if (choice || !window.NarbeChoiceScanAdapter || !SM()) return choice;
        choice = window.NarbeChoiceScanAdapter.create({
            holdThreshold: BACK_SCAN_HOLD,
            stateHost: document.getElementById('nmb'),
            speak: function (text) { return NMB.Voice.speak(text); },
            onHighlight: function (item) {
                const previous = focused;
                focused = item ? item.source : null;
                index = focused ? items.indexOf(focused) : -1;
                paint();
                if (focused && previous !== focused) NMB.Sound.blip();
                if (!item && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            },
            onSelect: function (item) { if (item && item.source) run(item.source); }
        });
        return choice;
    }

    function syncChoice(fresh) {
        const c = ensureChoice();
        if (!c) return;
        if (!enabled || freePlay() || !items.length) {
            c.sync(null);
            if (focused) { index = -1; focused = null; paint(); }
            return;
        }
        // Inside a row, a plain redraw must not swap the row's keys back for
        // the screen's own list. Only a fresh screen leaves the row.
        const state = c.getState();
        if (!fresh && c.active && state && state.depth > 0) { c.setInputHeld(spaceHeld || enterHeld); return; }
        const context = NMB.UI.scanContext();
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

    /**
     * Step into a row (a keyboard row, say): its items loop, with the hub's
     * spoken Back stop after the last one, until one is chosen or Back is.
     */
    function enterGroup(key, list) {
        if (!choice || !choice.active) return false;
        const context = NMB.UI.scanContext();
        return choice.enterGroup({ key: key, statusHost: context.host, items: list.filter(it => it && it.el).map(toChoice) },
            { wrap: true, backStop: true });
    }

    /** Leave a row, landing back on the row itself. */
    function back() { return !!(choice && choice.back({ restore: true })); }

    function setProvider(fn) { provider = fn; refresh(true); }

    /** Re-read the scan list. A fresh list starts with nothing highlighted. */
    function refresh(fresh) {
        items = (provider() || []).filter(function (it) { return it && it.el; });
        // A Space still down from the last screen must not step this one.
        if (fresh) { index = -1; focused = null; lastFocusId = null; clearSpaceState(); }
        wireClicks();
        syncChoice(fresh);
        paint();
    }

    function wireClicks() {
        items.forEach(function (item) {
            if (item.el.dataset.nmbWired === '1') return;
            item.el.dataset.nmbWired = '1';
            item.el.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const current = items.find(function (it) { return it.el === item.el; });
                if (!current) return;
                if (choice) choice.align(current.id);
                run(current);
            });
        });
    }

    /** Colour AND thickness AND a lift - never colour alone. */
    function paint() {
        document.querySelectorAll('.nmb-focus, .nmb-focus-full').forEach(function (el) {
            el.classList.remove('nmb-focus', 'nmb-focus-full');
        });
        const item = focused;
        if (!item || !item.el) { lastFocusId = null; return; }
        item.el.style.setProperty('--focus-color', NMB.Settings.highlightColor());
        item.el.style.setProperty('--focus-ink', NMB.Settings.highlightInk());
        item.el.classList.add(NMB.Settings.get('highlightStyle') === 'full' ? 'nmb-focus-full' : 'nmb-focus');
        if (item.id !== lastFocusId) {
            lastFocusId = item.id;
            if (typeof item.onFocus === 'function') {
                try { item.onFocus(); } catch (e) { console.warn('[NMB] onFocus threw:', e); }
            }
        }
    }

    function run(item) {
        if (!item || typeof item.action !== 'function') return;
        if (item.id !== 'play:magic') NMB.Sound.choose();
        item.action(item);
    }

    function step(delta) {
        if (choice && choice.active) { choice.step(delta); return; }
        if (!items.length) return;
        index = index < 0 ? (delta > 0 ? 0 : items.length - 1) : (index + delta + items.length) % items.length;
        focused = items[index];
        paint();
        NMB.Sound.blip();
        const it = items[index];
        NMB.Voice.speak(typeof it.speak === 'function' ? it.speak() : it.speak);
    }

    function select() {
        if (choice && choice.active) { choice.select(); return; }
        if (focused) run(focused);
    }

    /**
     * Speak a screen's arrival line. While Auto Scan is passing the blank
     * park step, "park" is added so the controller's own label is not lost.
     */
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
        NMB.Voice.speak(text);
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

    // --- hold Enter in play: pause ---------------------------------------------------

    function startPauseHold() {
        stopPauseHold();
        const t0 = performance.now();
        let beeps = 0;
        pauseTimer = setInterval(function () {
            const t = performance.now() - t0;
            if (t >= RING_SHOW) {
                NMB.UI.holdRing((t - RING_SHOW) / (PAUSE_HOLD - RING_SHOW));
                const s = Math.floor((t - RING_SHOW) / 1000) + 1;
                if (s > beeps && s <= 4) { beeps = s; NMB.Sound.beep(s); }
            }
            if (t >= PAUSE_HOLD) {
                stopPauseHold();
                swallowEnter = true;   // its release must not choose anything on the pause menu
                NMB.Game.pause();
            }
        }, 40);
    }

    function stopPauseHold() {
        if (pauseTimer) clearInterval(pauseTimer);
        pauseTimer = null;
        NMB.UI.holdRing(0);
    }

    // --- presses -----------------------------------------------------------------------

    function isEnter(code) { return code === 'Enter' || code === 'NumpadEnter'; }
    function isSwitchKey(code) { return code === 'Space' || isEnter(code); }

    const IGNORED_KEYS = ['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'ContextMenu'];

    /** A press during free play. Fires the magic on the press itself. */
    function freeDown(code, key, repeat, e) {
        if (key === 'Escape') {
            if (e) e.preventDefault();
            if (!repeat) NMB.Game.pause();
            return;
        }
        if (/^F\d+$/.test(key) || IGNORED_KEYS.indexOf(key) >= 0) return;
        if (e) e.preventDefault();
        if (repeat) return;
        if (isEnter(code)) {
            enterHeld = true;
            swallowEnter = false;
            startPauseHold();       // also restarts it if an earlier release was lost
        } else if (code === 'Space') {
            spaceHeld = true;
        }
        NMB.Game.magic();
    }

    /** A Space or Enter press in a menu, or in Scan to Pause play. */
    function switchDown(code) {
        if (isEnter(code)) {
            if (enterHeld) stopPauseHold();      // a fresh press while "held": the release was lost
            enterHeld = true;
            swallowEnter = false;
            if (choice) choice.setInputHeld(true);
            if (NMB.UI.current() === 'play') startPauseHold();
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
            const wasHeld = enterHeld, swallow = swallowEnter;
            enterHeld = false;
            swallowEnter = false;
            if (choice) choice.setInputHeld(spaceHeld);
            if (!wasHeld || swallow || freePlay()) return;
            select();
            return;
        }
        if (braking) { braking = false; if (choice) choice.brakeRelease(); return; }
        const discard = cancelSpaceRelease, wasBack = backRepeat !== null, wasHeld = spaceHeld;
        clearSpaceState();
        if (choice) choice.setInputHeld(enterHeld);
        if (freePlay()) return;
        if (wasHeld && !wasBack && !discard) step(1);
    }

    function onKeyDown(e) {
        if (!enabled || e.ctrlKey || e.metaKey || e.altKey) return;
        if (freePlay()) { freeDown(e.code, e.key, e.repeat, e); return; }
        if (e.key === 'Escape' && NMB.UI.current() === 'play' && !e.repeat) { NMB.Game.pause(); return; }
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

    function onCancelled(e) {
        const code = e.detail && e.detail.code;
        if (choice) choice.cancelInput();
        braking = false;
        if (isEnter(code)) { stopPauseHold(); enterHeld = false; swallowEnter = false; }
        if (code === 'Space') clearSpaceState();
    }

    function clearAll() {
        stopPauseHold();
        clearSpaceState();
        enterHeld = false;
        braking = false;
        swallowEnter = false;
        if (choice) choice.cancelInput();
    }

    // --- game controllers ------------------------------------------------------------
    //
    // In play, any button makes magic and holding A pauses. In the menus, A is
    // Enter (choose) and every other button is Space (next).

    let padPrev = {};
    function pollPads() {
        let pads = [];
        try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
        for (const p of pads) {
            if (!p) continue;
            const prev = padPrev[p.index] || [];
            const cur = p.buttons.map(function (b) { return b.pressed; });
            cur.forEach(function (down, i) {
                if (!enabled || down === !!prev[i]) return;
                const code = i === 0 ? 'Enter' : 'Space';
                if (down) {
                    if (freePlay()) freeDown(i === 0 ? 'Enter' : 'Pad', 'Pad' + i, false, null);
                    else switchDown(code);
                } else if (!(freePlay() && i !== 0)) {
                    switchUp(code);
                }
            });
            padPrev[p.index] = cur;
        }
        requestAnimationFrame(pollPads);
    }

    // --- lifecycle -----------------------------------------------------------------------

    function init() {
        try { previousAuto = !!SM().getSettings().autoScan; } catch (e) { previousAuto = false; }
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('narbe-input-cancelled', onCancelled);
        window.addEventListener('blur', clearAll);
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
        requestAnimationFrame(pollPads);
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
        setEnabled: setEnabled,
        isFreePlay: freePlay,
        state: function () { return choice ? choice.getState() : null; }
    };
})();
