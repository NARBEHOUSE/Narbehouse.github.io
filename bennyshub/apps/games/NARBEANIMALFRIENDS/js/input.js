/**
 * NARBE Animal Friends - switch input and the scan list.
 *
 *   Space, short press   move the highlight forward - ON RELEASE
 *   Space, hold          scan backwards, repeating at the player's scan speed
 *   Enter, release       select the highlighted item
 *   Click / tap          same as selecting that item
 *
 * ENTER HAS NO HOLD GESTURE. ACCESSIBILITY.md section 12 says new games should
 * favour a scannable pause entry, because holding a switch for five seconds is
 * itself a physical demand and for a player who cannot sustain a press a
 * hold-only route to pause is not a hard route, it is a locked door. So Pause is
 * an ordinary item in the in-game scan list, and Enter does exactly one thing:
 * on release, it selects whatever is highlighted.
 *
 * Hold-Space to scan backwards is kept, because ACCESSIBILITY.md section 4 makes
 * it the contract in every menu in the hub and the shipping checklist requires
 * it. Note what it does and does not do: the FORWARD step still fires on
 * release, never on press, so a press held by accident does not run away.
 *
 * The scan interval and the input debounce belong to NarbeScanManager and are
 * read from it every time. The backwards-scan threshold is this game's own,
 * matching the hub convention. Neither is ever spoken or printed to the player.
 */

window.NAF = window.NAF || {};

NAF.Input = (function () {
    'use strict';

    const BACK_SCAN_HOLD = 3000;   // hold Space this long to start scanning backwards

    /**
     * Input cooldowns.
     *
     * The hub's scan manager debounces key presses, but only by the player's
     * sensitivity setting - 50ms by default - and it deliberately skips mouse and
     * touch events entirely. So nothing stopped a switch being hammered, or a
     * button being click-spammed, into dozens of inputs a second.
     *
     * STEP is short: moving the highlight is cheap and a player who wants to get
     * somewhere should not be slowed down. SELECT is longer, because selecting
     * starts something that needs a moment to happen. An item can ask for a
     * longer one of its own - see `cooldown` on the scan list entries.
     *
     * These limit the RATE of input, not what input can do. A press during the
     * reveal still cuts it short and starts a fresh one, as it always has.
     */
    const STEP_COOLDOWN = 250;
    const SELECT_COOLDOWN = 300;

    let lastStepAt = 0;
    let lastSelectAt = 0;

    let provider = function () { return []; };
    let items = [];
    /**
     * -1 means NOTHING is highlighted.
     *
     * Every screen opens in that state. The first press - either switch - reveals
     * the highlight on the first item without selecting it, and only the press
     * after that acts. So arriving somewhere new never leaves a button looking
     * half-chosen, and a stray press on a screen the player has just landed on
     * cannot fire anything.
     */
    let index = -1;

    let spaceHeld = false;
    let backTimer = null, backRepeat = null;
    let autoTimer = null;
    let enabled = true;

    // --- the scan list -----------------------------------------------------------

    function setProvider(fn) {
        provider = fn;
        refresh(true);
    }

    /** Re-read the scan list. Keeps the highlight on the same item where it can. */
    function refresh(resetIndex) {
        const previousId = items[index] ? items[index].id : null;
        items = provider() || [];
        if (resetIndex) {
            index = -1;                 // a new screen starts with nothing highlighted
        } else if (previousId !== null) {
            const found = items.findIndex(function (it) { return it.id === previousId; });
            index = found >= 0 ? found : 0;
        }
        if (index >= items.length) index = items.length ? 0 : -1;
        if (resetIndex) NAF.Audio.resetScanTune();
        paint();
        wireClicks();
        restartAutoScan();
    }

    function wireClicks() {
        items.forEach(function (item) {
            if (!item.el || item.el.dataset.nafWired === '1') return;
            item.el.dataset.nafWired = '1';
            item.el.addEventListener('click', function (e) {
                e.preventDefault();
                const at = items.findIndex(function (it) { return it.el === item.el; });
                if (at >= 0) {
                    index = at;
                    paint();
                    trySelect();
                }
            });
        });
    }

    /**
     * Apply the highlight. Colour AND thickness AND a lift - never colour
     * alone, because a player who cannot tell the colour apart still has to be
     * able to see where the highlight is.
     */
    function paint() {
        document.querySelectorAll('.naf-focus, .naf-focus-full').forEach(function (el) {
            el.classList.remove('naf-focus', 'naf-focus-full');
            el.style.removeProperty('--focus-color');
            el.style.removeProperty('--focus-ink');
        });
        const item = items[index];
        if (!item || !item.el) return;
        item.el.style.setProperty('--focus-color', NAF.Settings.highlightColor());
        // The Block style paints the button in the chosen colour, so the label
        // on it needs an ink that stays readable against whichever was picked.
        item.el.style.setProperty('--focus-ink', NAF.Settings.highlightInk());
        item.el.classList.add(NAF.Settings.get('highlightStyle') === 'full' ? 'naf-focus-full' : 'naf-focus');
        if (item.el.scrollIntoView) {
            try { item.el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* older engines */ }
        }

        // A scannable may want to react to being LOOKED at, not only chosen. The
        // menu uses it to become the zone under the highlight - barn, tank or
        // lodge - so a switch user sees where they are about to go before
        // committing to it. Every route into the highlight comes through here:
        // a tap, an auto-scan tick, the first reveal, and a caregiver's click.
        if (typeof item.onFocus === 'function') {
            try { item.onFocus(); } catch (e) {
                console.warn('[NAF] A scannable\'s onFocus threw:', e);
            }
        }
    }

    function speakFocused() {
        const item = items[index];
        if (!item) return;
        const line = typeof item.speak === 'function' ? item.speak() : item.speak;
        if (line) NAF.Voice.speak(line);
    }

    /** Reveal the highlight on the first item. Returns false if it was already up. */
    function reveal() {
        if (index !== -1 || !items.length) return false;
        index = 0;
        paint();
        NAF.Audio.scanBlip();
        speakFocused();
        return true;
    }

    function step(delta) {
        if (!items.length) return;
        if (reveal()) return;           // the first press only shows the highlight
        index = (index + delta + items.length) % items.length;
        paint();
        NAF.Audio.scanBlip();
        speakFocused();
    }

    function activate() {
        // Nothing highlighted yet: this press reveals it rather than choosing.
        // A stray press on a screen the player has only just reached should never
        // fire the first button on it.
        if (reveal()) return;
        const item = items[index];
        if (!item) return;
        NAF.Audio.play('confirm', 0.8);
        restartAutoScan();
        if (typeof item.action === 'function') item.action(item);
    }

    // --- rate limiting ------------------------------------------------------------
    //
    // Every route a player can take - a switch, a click, a tap - goes through
    // these, so there is one place the rate is decided rather than three.

    function tryStep(delta) {
        const now = Date.now();
        if (now - lastStepAt < STEP_COOLDOWN) return;
        lastStepAt = now;
        step(delta);
    }

    function trySelect() {
        const item = items[index];
        const now = Date.now();

        // An item can say it is still carrying out the last press. Selecting it
        // again is refused until it is done, so an action always gets to finish.
        // Nothing else on the screen is affected - Pause stays reachable while
        // the barn is mid-reveal, which is what stops this becoming a trap.
        if (item && typeof item.busy === 'function' && item.busy()) return;

        // An item can also ask for longer than the default cooldown.
        const wait = (item && item.cooldown) || SELECT_COOLDOWN;
        if (now - lastSelectAt < wait) return;
        lastSelectAt = now;
        activate();
    }

    // --- auto scan ---------------------------------------------------------------

    function autoScanOn() {
        return !!(window.NarbeScanManager && window.NarbeScanManager.getSettings().autoScan);
    }

    function scanInterval() {
        return (window.NarbeScanManager && window.NarbeScanManager.getScanInterval()) || 2000;
    }

    function stopAutoScan() {
        if (autoTimer) clearInterval(autoTimer);
        autoTimer = null;
    }

    function restartAutoScan() {
        stopAutoScan();
        if (!enabled || !autoScanOn() || items.length < 2) return;
        autoTimer = setInterval(function () {
            if (spaceHeld) return;
            step(1);
        }, scanInterval());
    }

    // --- backwards scan ----------------------------------------------------------

    function startBackwardsScan() {
        step(-1);
        if (backRepeat) clearInterval(backRepeat);
        // Repeats at the player's own scan speed, not a rate this game picked.
        backRepeat = setInterval(function () { step(-1); }, scanInterval());
    }

    function stopBackwardsScan() {
        if (backRepeat) clearInterval(backRepeat);
        backRepeat = null;
    }

    function clearSpaceState() {
        if (backTimer) { clearTimeout(backTimer); backTimer = null; }
        stopBackwardsScan();
        spaceHeld = false;
    }

    // --- key handling ------------------------------------------------------------
    //
    // Enter's keydown does nothing but stop the browser's default. Space's keydown
    // only arms the backwards-scan timer. Neither key ever moves the highlight or
    // selects on press.

    function isSwitchKey(code) {
        return code === 'Space' || code === 'Enter' || code === 'NumpadEnter';
    }

    /**
     * While a text field has focus the keys belong to the keyboard, not the
     * scanner - otherwise Space could never be typed into the player's name. A
     * switch user is never affected: nothing in this game focuses a text field
     * on its own, so it only ever happens when someone clicks into one.
     */
    function inTextField(e) {
        const t = e.target;
        if (!t) return false;
        return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable === true;
    }

    function onKeyDown(e) {
        if (!enabled || !isSwitchKey(e.code) || inTextField(e)) return;
        e.preventDefault();
        if (e.repeat) return;

        if (e.code === 'Space' && !spaceHeld && !backRepeat) {
            spaceHeld = true;
            restartAutoScan();
            backTimer = setTimeout(function () {
                backTimer = null;
                if (spaceHeld) startBackwardsScan();
            }, BACK_SCAN_HOLD);
        }
    }

    function onKeyUp(e) {
        if (!enabled || !isSwitchKey(e.code) || inTextField(e)) return;
        e.preventDefault();

        if (e.code === 'Space') {
            const wasScanningBack = backRepeat !== null;
            const wasHeld = spaceHeld;
            clearSpaceState();
            // A short press steps forward on release. A press long enough to have
            // started scanning backwards does not also step forward.
            if (wasHeld && !wasScanningBack) tryStep(1);
            restartAutoScan();
        } else {
            trySelect();
        }
    }

    /**
     * The scan manager swallows presses shorter than the player's sensitivity
     * setting and fires this instead. Treat it as if nothing happened, and clear
     * the Space hold state so a backwards scan is never left running.
     */
    function onCancelled(e) {
        const code = e.detail && e.detail.code;
        if (code === 'Space') clearSpaceState();
    }

    // --- lifecycle ---------------------------------------------------------------

    function init() {
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('narbe-input-cancelled', onCancelled);
        if (window.NarbeScanManager && window.NarbeScanManager.subscribe) {
            window.NarbeScanManager.subscribe(function () { restartAutoScan(); });
        }
    }

    /** Suspend scanning without tearing anything down. */
    function setEnabled(on) {
        enabled = !!on;
        clearSpaceState();
        if (!enabled) stopAutoScan();
        else restartAutoScan();
    }

    return {
        init: init,
        setProvider: setProvider,
        refresh: refresh,
        paint: paint,
        speakFocused: speakFocused,
        setEnabled: setEnabled,
        restartAutoScan: restartAutoScan,
        focused: function () { return items[index]; },
        /** Where the highlight is, or -1 when nothing is highlighted yet. */
        indexOf: function () { return index; },
        setIndex: function (i) {
            if (!items.length) { index = -1; return; }
            index = Math.max(0, Math.min(items.length - 1, i));
            paint();
        }
    };
})();
