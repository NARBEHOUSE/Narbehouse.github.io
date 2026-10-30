/**
 * NARBE Switch Stories - switch input.
 *
 * MENUS (library, settings, pause, how to play, and the Read Again / Pick a
 * Different Story choices at the end) follow the hub's shared choice-scan
 * contract through NarbeChoiceScanAdapter:
 *   Space, tap       move the highlight forward - on release
 *   Space, hold      scan backwards, repeating at the player's scan speed
 *   Enter, release   choose what is highlighted
 *   Auto Scan        the highlight moves by itself; Enter chooses
 *
 * THE STORY has two styles (the Pause setting), as in Glow Pop:
 *   Hold Enter (default)  EVERY press counts, on the press itself: Space,
 *                         Enter, any key, a tap anywhere, or any game
 *                         controller button. Holding a key does not repeat.
 *                         Holding Enter (or controller button A) for five
 *                         seconds opens Pause, with a filling ring and a
 *                         beep each second.
 *   Scan to Pause         The highlight moves between the directions and Pause,
 *                         the usual scan contract, for a player who cannot
 *                         hold a switch. Holding Enter still pauses too.
 *
 * The shared scan manager filters switch bounce and too-quick repeats before
 * any of this sees a key. When it swallows a press it sends
 * narbe-input-cancelled, and every half-held state here is cleared.
 */

window.NSS = window.NSS || {};

NSS.Input = (function () {
    'use strict';

    const BACK_SCAN_HOLD = 3000;   // hold Space this long to scan backwards (hub convention)
    const PAUSE_HOLD = 5000;       // hold Enter this long in the story to pause (as in Glow Pop)
    const RING_SHOW = 1000;        // the pause ring appears after this much of the hold

    let provider = function () { return []; };
    let items = [];
    let index = -1;
    /** The highlighted item. */
    let focused = null;
    let choice = null;
    let enabled = true;

    let spaceHeld = false, enterHeld = false, braking = false, cancelSpaceRelease = false;
    let backTimer = null, backRepeat = null;
    let pauseTimer = null, swallowEnter = false;
    let previousAuto = false;

    function SM() { return window.NarbeScanManager; }
    function scanInterval() { try { return SM().getScanInterval() || 2000; } catch (e) { return 2000; } }
    function inStory() { return NSS.UI.current() === 'story'; }

    /**
     * Speech for scanning and announcements. On a story page it stays quiet
     * while the words are read (never talk over the story), and the whole
     * time when Read Aloud is off, so someone can read the story to the
     * player. Menus (Pause, Settings) speak as usual.
     */
    function say(text) {
        if (inStory() && (NSS.Story.isReading() || !NSS.Settings.is('readAloud', 'on'))) return null;
        return NSS.Voice.speak(text);
    }

    /** The story in the default style: no scan list, every press counts. */
    function freePlay() {
        return inStory() && NSS.Settings.get('pauseMode') !== 'scan' && !NSS.Story.isChoosing();
    }

    // --- the scan list -----------------------------------------------------------

    function ensureChoice() {
        if (choice || !window.NarbeChoiceScanAdapter || !SM()) return choice;
        choice = window.NarbeChoiceScanAdapter.create({
            holdThreshold: BACK_SCAN_HOLD,
            stateHost: document.getElementById('nss'),
            speak: say,
            onHighlight: function (item) {
                const previous = focused;
                focused = item ? item.source : null;
                index = focused ? items.indexOf(focused) : -1;
                paint();
                if (focused && previous !== focused) NSS.Sound.blip();
                if (!item && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            },
            onSelect: function (item) { if (item && item.source) run(item.source); }
        });
        return choice;
    }

    function syncChoice(fresh, restoreId) {
        const c = ensureChoice();
        if (!c) return;
        if (!enabled || freePlay() || !items.length) {
            c.sync(null);
            if (focused) { index = -1; focused = null; paint(); }
            return;
        }
        const context = NSS.UI.scanContext();
        c.sync({ key: context.key, statusHost: context.host, items: items.map(toChoice) },
            { fresh: !!fresh, restoreId: restoreId || null });
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

    function setProvider(fn) { provider = fn; refresh(true); }

    /**
     * Re-read the scan list. A fresh list starts with nothing highlighted,
     * unless `restoreId` names the choice to land on (coming back from a
     * settings page lands on that page's own row).
     */
    function refresh(fresh, restoreId) {
        items = (provider() || []).filter(function (it) { return it && it.el; });
        // A Space still down from the last screen must not step this one.
        if (fresh) { index = -1; focused = null; clearSpaceState(); }
        wireClicks();
        syncChoice(fresh, restoreId);
        paint();
    }

    function wireClicks() {
        items.forEach(function (item) {
            if (item.el.dataset.nssWired === '1') return;
            item.el.dataset.nssWired = '1';
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
        document.querySelectorAll('.nss-focus, .nss-focus-full').forEach(function (el) {
            el.classList.remove('nss-focus', 'nss-focus-full');
        });
        const item = focused;
        if (!item || !item.el) return;
        item.el.style.setProperty('--focus-color', NSS.Settings.highlightColor());
        item.el.style.setProperty('--focus-ink', NSS.Settings.highlightInk());
        item.el.classList.add(NSS.Settings.get('highlightStyle') === 'full' ? 'nss-focus-full' : 'nss-focus');
    }

    function run(item) {
        if (!item || typeof item.action !== 'function') return;
        if (item.id !== 'story:page') NSS.Sound.choose();
        item.action(item);
    }

    function step(delta) {
        if (choice && choice.active) { choice.step(delta); return; }
        if (!items.length) return;
        index = index < 0 ? (delta > 0 ? 0 : items.length - 1) : (index + delta + items.length) % items.length;
        focused = items[index];
        paint();
        NSS.Sound.blip();
        const it = items[index];
        say(typeof it.speak === 'function' ? it.speak() : it.speak);
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
        if (inStory() && !NSS.Settings.is('readAloud', 'on')) return;    // Read Aloud off: a quiet story
        if (choice && choice.active) {
            let park = false;
            try {
                const s = SM().getSettings();
                park = choice.getState().index < 0 && s.autoScan && s.parking !== 'off';
            } catch (e) { /* no scan manager */ }
            choice.announce(text + (park ? '. Park' : ''), { parkingLabel: park });
            return;
        }
        say(text);
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

    // --- hold Enter in the story: pause ---------------------------------------------

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

    const IGNORED_KEYS = ['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'ContextMenu'];

    /** A press in the story's free style. Counts on the press itself. */
    function freeDown(code, key, repeat, e) {
        if (key === 'Escape') {
            if (e) e.preventDefault();
            if (!repeat) NSS.Game.pause();
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
        NSS.Story.press();
    }

    /** A Space or Enter press in a menu, or in Scan to Pause. */
    function switchDown(code) {
        if (isEnter(code)) {
            if (enterHeld) stopPauseHold();      // a fresh press while "held": the release was lost
            enterHeld = true;
            swallowEnter = false;
            if (choice) choice.setInputHeld(true);
            if (inStory()) startPauseHold();
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
        if (e.key === 'Escape' && inStory() && !e.repeat) { NSS.Game.pause(); return; }
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
    // In the story, any button counts and holding A pauses. In the menus, A is
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
        setEnabled: setEnabled,
        isFreePlay: freePlay,
        state: function () { return choice ? choice.getState() : null; }
    };
})();
