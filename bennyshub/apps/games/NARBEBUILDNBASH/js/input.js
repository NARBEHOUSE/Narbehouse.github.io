/**
 * NARBE Build n Bash - switch input.
 *
 * Every screen, including play, is a stationary CHOICE scan through the hub's
 * shared NarbeChoiceScanAdapter (ACCESSIBILITY.md section 4):
 *   Space, tap       move the highlight forward - on release
 *   Space, hold      scan backwards, repeating at the player's scan speed
 *   Enter, release   choose what is highlighted
 *   Auto Scan        the highlight moves by itself; Enter chooses
 * Each loop has the hub's silent blank step, and every new screen opens with
 * nothing highlighted.
 *
 * In play the choices are Build, Destroy and Pause. There is no hold-to-pause:
 * Pause is always in the scan, so a switch held for a minute does exactly
 * what a short press does. Escape and a click or tap on Pause also pause.
 *
 * The shared scan manager filters bounce and too-quick repeats before any of
 * this sees a key; when it swallows a press it sends narbe-input-cancelled and
 * every half-held state here is cleared. Adapted from NARBE Magic Button.
 */

window.BNB = window.BNB || {};

BNB.Input = (function () {
    'use strict';

    const BACK_SCAN_HOLD = 3000;   // hold Space this long to scan backwards (hub convention)

    let provider = function () { return []; };
    let items = [];
    let focused = null;
    let lastFocusId = null;
    let choice = null;
    let enabled = true;
    let spaceHeld = false, enterHeld = false, braking = false, cancelSpaceRelease = false;
    let backTimer = null, backRepeat = null;
    let previousAuto = false;
    let windowActive = true;
    let highlightListener = null;

    function SM() { return window.NarbeScanManager; }
    function scanInterval() { try { return SM().getScanInterval() || 2000; } catch (e) { return 2000; } }

    // --- the scan list -----------------------------------------------------------------

    function ensureChoice() {
        if (choice || !window.NarbeChoiceScanAdapter || !SM()) return choice;
        choice = window.NarbeChoiceScanAdapter.create({
            holdThreshold: BACK_SCAN_HOLD,
            stateHost: document.getElementById('bnb'),
            speak: function (text) { return BNB.Voice.speak(text); },
            onHighlight: function (item) {
                const previous = focused;
                focused = item ? item.source : null;
                paint();
                if (focused && previous !== focused) BNB.Sound.blip();
                if (!item && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
                if (highlightListener) highlightListener(focused);
            },
            onSelect: function (item) { if (item && item.source) run(item.source); }
        });
        return choice;
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

    function syncChoice(fresh, restoreId) {
        const c = ensureChoice();
        if (!c) return;
        if (!enabled || !items.length) {
            c.sync(null);
            if (focused) { focused = null; paint(); if (highlightListener) highlightListener(null); }
            return;
        }
        const state = c.getState();
        if (!fresh && c.active && state && state.depth > 0) { c.setInputHeld(spaceHeld || enterHeld); return; }
        const context = BNB.UI.scanContext();
        c.sync({ key: context.key, statusHost: context.host, items: items.map(toChoice) }, { fresh: !!fresh, restoreId: restoreId || null });
        c.setInputHeld(spaceHeld || enterHeld);
    }

    function setProvider(fn) { provider = fn; refresh(true); }

    /**
     * Re-read the scan list. A fresh list starts with nothing highlighted
     * (or on restoreId, when coming back to a screen's own row). A plain
     * refresh keeps the highlighted choice by identity; if it is gone the
     * highlight clears safely to the blank step.
     */
    function refresh(fresh, restoreId) {
        items = (provider() || []).filter(it => it && it.el);
        if (fresh) { focused = null; lastFocusId = null; clearAll(); }
        wireClicks();
        syncChoice(fresh, restoreId);
        paint();
    }

    function wireClicks() {
        items.forEach(function (item) {
            if (item.el.dataset.bnbWired === '1') return;
            item.el.dataset.bnbWired = '1';
            item.el.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const current = items.find(it => it.el === item.el);
                if (!current || !enabled) return;
                if (choice) choice.align(current.id);
                run(current);
            });
        });
    }

    /** Colour AND thickness AND a lift - never colour alone. */
    function paint() {
        document.querySelectorAll('.bnb-focus, .bnb-focus-full').forEach(el => el.classList.remove('bnb-focus', 'bnb-focus-full'));
        const item = focused;
        if (!item || !item.el) { lastFocusId = null; return; }
        item.el.style.setProperty('--focus-color', BNB.Settings.highlightColor());
        item.el.style.setProperty('--focus-ink', BNB.Settings.highlightInk());
        item.el.classList.add(BNB.Settings.get('highlightStyle') === 'full' ? 'bnb-focus-full' : 'bnb-focus');
        if (item.id !== lastFocusId) {
            lastFocusId = item.id;
            if (typeof item.onFocus === 'function') { try { item.onFocus(); } catch (e) { console.warn('[BNB] onFocus', e); } }
        }
    }

    function run(item) {
        if (!item || typeof item.action !== 'function') return;
        if (!item.quiet) BNB.Sound.choose();
        item.action(item);
    }

    function step(delta) { if (choice && choice.active) choice.step(delta); }
    function select() { if (choice && choice.active) choice.select(); }

    /** Speak a screen's arrival line ("park" is added while Auto passes the blank step). */
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
        BNB.Voice.speak(text);
    }

    // --- hold Space: scan backwards ---------------------------------------------------------

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

    // --- presses --------------------------------------------------------------------------

    function isEnter(code) { return code === 'Enter' || code === 'NumpadEnter'; }
    function isSwitchKey(code) { return code === 'Space' || isEnter(code); }

    function switchDown(code) {
        if (isEnter(code)) {
            enterHeld = true;
            if (choice) choice.setInputHeld(true);
            return;
        }
        if (spaceHeld) clearSpaceState();          // a fresh press while "held": the release was lost
        if (choice && choice.brakePress()) { braking = true; return; }
        spaceHeld = true;
        if (choice) choice.setInputHeld(true);
        backTimer = setTimeout(function () { backTimer = null; if (spaceHeld) startBackwardsScan(); }, BACK_SCAN_HOLD);
    }

    function switchUp(code) {
        if (isEnter(code)) {
            const wasHeld = enterHeld;
            enterHeld = false;
            if (choice) choice.setInputHeld(spaceHeld);
            if (wasHeld) select();
            return;
        }
        if (braking) { braking = false; if (choice) choice.brakeRelease(); return; }
        const discard = cancelSpaceRelease, wasBack = backRepeat !== null, wasHeld = spaceHeld;
        clearSpaceState();
        if (choice) choice.setInputHeld(enterHeld);
        if (wasHeld && !wasBack && !discard) step(1);
    }

    function onKeyDown(e) {
        if (!enabled || !windowActive || document.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'Escape') {
            if (!e.repeat && BNB.UI.current() === 'play') { e.preventDefault(); BNB.Game.pause(); }
            return;
        }
        if (!isSwitchKey(e.code)) return;
        e.preventDefault();
        if (e.repeat) return;
        switchDown(e.code);
    }

    function onKeyUp(e) {
        if (!enabled) return;
        if (!isSwitchKey(e.code)) return;
        e.preventDefault();
        switchUp(e.code);
    }

    function onCancelled(e) {
        const code = e.detail && e.detail.code;
        if (!code) { clearAll(); return; }
        if (choice) choice.cancelInput();
        braking = false;
        if (isEnter(code)) enterHeld = false;
        if (code === 'Space') clearSpaceState();
    }

    function clearAll() {
        clearSpaceState();
        enterHeld = false;
        braking = false;
        if (choice) choice.cancelInput();
    }

    // --- game controllers: A is Enter (choose), every other button is Space (next) -------------

    let padPrev = {};
    function pollPads() {
        let pads = [];
        try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
        for (const p of pads) {
            if (!p) continue;
            const prev = padPrev[p.index] || [];
            const cur = p.buttons.map(b => b.pressed);
            cur.forEach(function (down, i) {
                if (!enabled || !windowActive || document.hidden || down === !!prev[i]) return;
                const code = i === 0 ? 'Enter' : 'Space';
                if (down) switchDown(code); else switchUp(code);
            });
            padPrev[p.index] = cur;
        }
        requestAnimationFrame(pollPads);
    }

    // --- lifecycle ----------------------------------------------------------------------------

    function init() {
        try { previousAuto = !!SM().getSettings().autoScan; } catch (e) { previousAuto = false; }
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('narbe-input-cancelled', onCancelled);
        window.addEventListener('blur', function () { windowActive = false; clearAll(); });
        window.addEventListener('focus', function () { windowActive = true; });
        document.addEventListener('visibilitychange', function () { if (document.hidden) clearAll(); });
        window.addEventListener('gamepaddisconnected', function (e) { clearAll(); if (e.gamepad) delete padPrev[e.gamepad.index]; });
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
        setEnabled: setEnabled,
        onHighlight: function (fn) { highlightListener = fn; },
        focusedId: function () { return focused ? focused.id : null; },
        state: function () { return choice ? choice.getState() : null; },
        /** Test hook: press and release a switch key exactly as a switch interface would. */
        _press: function (code) { switchDown(code); switchUp(code); }
    };
})();
