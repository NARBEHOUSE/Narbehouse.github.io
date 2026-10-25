/**
 * NARBE Loops - switch input.
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
 * EACH LINE is an untimed choice scan over its name and sixteen pips. Enter
 * toggles the selected step on release, even while a preview is playing.
 * Holding Enter for five seconds returns to the same line and consumes release.
 *
 * The shared scan manager filters switch bounce and too-quick repeats
 * before any of this sees a key. When it swallows a press it sends
 * narbe-input-cancelled, and every half-held state here is cleared.
 */

window.NL = window.NL || {};

NL.Input = (function () {
    'use strict';

    const ROW_BACK_HOLD = 5000;    // Hold Enter for five seconds to return to row mode.
    const BACK_SCAN_HOLD = 3000;   // hold Space this long to scan backwards (hub convention)

    let provider = function () { return []; };
    let items = [];
    let focused = null;
    let lastFocusId = null;
    let choice = null;
    let enabled = true;

    let spaceHeld = false, enterHeld = false, braking = false, cancelSpaceRelease = false;
    let backTimer = null, backRepeat = null;
    let enterBackTimer = null, enterBackDone = false, enterContext = null;
    let previousAuto = false;

    function SM() { return window.NarbeScanManager; }
    function scanInterval() { try { return SM().getScanInterval() || 2000; } catch (e) { return 2000; } }

    // --- the scan list -----------------------------------------------------------

    function ensureChoice() {
        if (choice || !window.NarbeChoiceScanAdapter || !SM()) return choice;
        choice = window.NarbeChoiceScanAdapter.create({
            holdThreshold: BACK_SCAN_HOLD,
            stateHost: document.getElementById('nl'),
            speak: function (text) { return NL.Voice.speak(text); },
            onHighlight: function (item, state, context) {
                // Pointer navigation must not carry a half-held Enter into another row.
                if (enterContext && context !== enterContext) {
                    clearEnterState();
                    choice.setInputHeld(spaceHeld);
                }
                const previous = focused;
                focused = item ? item.source : null;
                NL.UI.onScan(state, context);
                paint();
                if (focused && previous !== focused) NL.Sound.blip();
                if (!item && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
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
        const context = NL.UI.scanContext();
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
        const context = NL.UI.scanContext();
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

    /** Pointer focus within a row must retain its parent for the Back stop. */
    function focusInGroup(id) {
        if (!choice || !choice.active || !choice.getState().depth) return false;
        if (choice.getState().id === id) return true;
        const context = choice.context;
        if (!context.items.some(function (item) { return item.id === id; })) return false;
        choice.back({ restore: true });
        return choice.enterGroup(context, { restoreId: id, wrap: true, backStop: true });
    }

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
            if (item.el.dataset.nlWired === '1') return;
            item.el.dataset.nlWired = '1';
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
    function paint() {
        document.querySelectorAll('.nl-focus, .nl-focus-full').forEach(function (el) {
            el.classList.remove('nl-focus', 'nl-focus-full');
        });
        const item = focused;
        if (!item || !item.el) { lastFocusId = null; return; }
        item.el.style.setProperty('--focus-color', NL.Settings.highlightColor());
        item.el.style.setProperty('--focus-ink', NL.Settings.highlightInk());
        item.el.classList.add(NL.Settings.get('highlightStyle') === 'full' ? 'nl-focus-full' : 'nl-focus');
        if (item.id !== lastFocusId) {
            lastFocusId = item.id;
            item.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            if (typeof item.onFocus === 'function') {
                try { item.onFocus(); } catch (e) { console.warn('[NL] onFocus threw:', e); }
            }
        }
    }

    function run(item) {
        if (!item || typeof item.action !== 'function') return;
        if (!item.quiet) NL.Sound.choose();
        item.action(item);
    }

    function step(delta) {
        if (choice && choice.active) { choice.step(delta); return; }
        if (!items.length) return;
        const i = focused ? items.indexOf(focused) : -1;
        focused = items[i < 0 ? (delta > 0 ? 0 : items.length - 1) : (i + delta + items.length) % items.length];
        paint();
        NL.Sound.blip();
        NL.Voice.speak(typeof focused.speak === 'function' ? focused.speak() : focused.speak);
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
        NL.Voice.speak(text);
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

    function clearEnterState() {
        NL.UI.endRowReturn();
        clearTimeout(enterBackTimer);
        enterBackTimer = null; enterContext = null;
        enterHeld = false; enterBackDone = false;
    }

    // --- presses -----------------------------------------------------------------------

    function isEnter(code) { return code === 'Enter' || code === 'NumpadEnter'; }
    function isSwitchKey(code) { return code === 'Space' || isEnter(code); }

    function switchDown(code) {
        if (isEnter(code)) {
            if (enterHeld) return;
            enterHeld = true; enterBackDone = false;
            if (choice) choice.setInputHeld(true);
            const state = choice && choice.getState();
            if (state && state.depth > 0 && state.context.startsWith('beat:line:')) {
                enterContext = choice.context;
                NL.UI.beginRowReturn(ROW_BACK_HOLD);
                enterBackTimer = setTimeout(function () {
                    enterBackTimer = null;
                    if (!enabled || !enterHeld || !choice.active || choice.context !== enterContext) return;
                    enterContext = null; enterBackDone = true;
                    NL.UI.endRowReturn();
                    back();
                    // Back restores the parent; Auto must wait until Enter is released.
                    choice.setInputHeld(true);
                }, ROW_BACK_HOLD);
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
            const wasHeld = enterHeld, wasBack = enterBackDone;
            clearEnterState();
            if (choice) choice.setInputHeld(spaceHeld);
            if (!wasHeld || wasBack) return;
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
        if (e.key === 'Escape') { if (!e.repeat) NL.Game.escape(); return; }
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
        clearSpaceState();
        clearEnterState();
        braking = false;
        if (choice) choice.cancelInput();
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
        focusInGroup: focusInGroup,
        setEnabled: setEnabled,
        state: function () { return choice ? choice.getState() : null; }
    };
})();
