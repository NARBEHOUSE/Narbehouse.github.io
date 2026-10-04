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

    // NarbeScanManager owns accepted switch press/release filtering. Native
    // per-item busy guards below retain ownership of reveals and narration.

    let provider = function () { return []; };
    let items = [];
    /**
     * -1 means NOTHING is highlighted.
     *
     * Every screen opens in that state. In menus, Space or an Auto Scan tick
     * reveals the highlight, and Enter waits until an item is highlighted.
     * Animal play keeps its existing first-press reveal interaction.
     */
    let index = -1;

    let spaceHeld = false;
    let backTimer = null, backRepeat = null;
    let autoTimer = null;
    let enabled = true;


    let choice=null,enterHeld=false,braking=false,cancelSpaceRelease=false;
    let previousAuto=!!window.NarbeScanManager?.getSettings().autoScan;
    function syncChoice(fresh=false){
        if(!enabled){choice?.sync(null);return;}
        const context=NAF.UI.scanContext();
        if(!choice)choice=NarbeChoiceScanAdapter.create({holdThreshold:BACK_SCAN_HOLD,stateHost:document.getElementById('naf'),speak:text=>NAF.Voice.speak(text),
            onContext(context){NAF.UI.applyScanContext(context.key);items=context.items.map(it=>it.source);},
            onHighlight(item){const previous=index;index=item?items.indexOf(item.source):-1;paint();NAF.UI.updateScanFeedback();if(item&&previous!==index)NAF.Audio.scanBlip();if(!item&&items.some(x=>x.el===document.activeElement||x.el?.contains(document.activeElement)))document.activeElement.blur();},onSelect:()=>activate(true)});
        const next={key:context.key,statusHost:context.host,items:items.filter(it=>it.el&&!it.el.disabled).map(it=>({id:it.id,label:()=>typeof it.speak==='function'?it.speak():it.speak,element:it.el,labelElement:it.el.querySelector('.naf-row-label,.naf-menu-label')||it.el,source:it}))};
        if(!fresh&&choice.context?.key==='settings:name:rows'&&context.key.startsWith('settings:name:keys:'))choice.enterGroup(next);
        else if(!fresh&&context.key==='settings:name:rows'&&choice.getState()?.depth>0){choice.back({restore:true});choice.sync(next);}
        else choice.sync(next,{fresh});
        choice.setInputHeld(spaceHeld||enterHeld);
    }

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
        syncChoice(!!resetIndex);restartAutoScan();
    }

    function wireClicks() {
        items.forEach(function (item) {
            if (!item.el || item.el.dataset.nafWired === '1') return;
            item.el.dataset.nafWired = '1';
            item.el.addEventListener('click', function (e) {
                e.preventDefault();
                const at = items.findIndex(function (it) { return it.el === item.el; });
                if (at >= 0) {
                    index = at;choice?.align(items[at].id);
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
        if(choice?.active){return choice.announce();}
        const item = items[index];
        if (!item) return;
        const line = typeof item.speak === 'function' ? item.speak() : item.speak;
        if (line) NAF.Voice.speak(line);
    }

    /** Reveal the highlight on the first item. Returns false if it was already up. */
    function reveal(direction) {
        if (index !== -1 || !items.length) return false;
        index = direction < 0 ? items.length - 1 : 0;
        paint();
        NAF.Audio.scanBlip();
        speakFocused();
        return true;
    }

    function step(delta) {
        if(choice?.active){choice.step(delta);return;}
        if (!items.length) return;
        if (reveal(NAF.UI.current() === 'play' ? 1 : delta)) return; // menus enter at the requested end
        index = (index + delta + items.length) % items.length;
        paint();
        NAF.Audio.scanBlip();
        speakFocused();
    }

    function activate(fromChoice=false) {
        if(choice?.active&&!fromChoice){choice.select();return;}
        // Menus wait for Space or Auto Scan before Enter can choose. Keep the
        // existing first-reveal interaction during animal play.
        if (index < 0 && NAF.UI.current() !== 'play') return;
        if (reveal()) return;
        const item = items[index];
        if (!item) return;
        NAF.Audio.play('confirm', 0.8);
        restartAutoScan();
        if (typeof item.action === 'function') item.action(item);
    }

    // --- accepted input and native busy ownership --------------------------------

    function tryStep(delta) {
        step(delta);
    }

    function trySelect() {
        const item = items[index];

        // An item can say it is still carrying out the last press. Selecting it
        // again is refused until it is done, so an action always gets to finish.
        // Nothing else on the screen is affected - Pause stays reachable while
        // the barn is mid-reveal, which is what stops this becoming a trap.
        if (item && typeof item.busy === 'function' && item.busy()) return;

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

    function restartAutoScan() { stopAutoScan();syncChoice(); }

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
        cancelSpaceRelease = false;
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
        if(e.code!=='Space'){enterHeld=true;choice?.setInputHeld(true);}
        if(e.code==='Space'&&choice?.brakePress()){braking=true;return;}

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

        if(e.code==='Space'&&braking){braking=false;choice?.brakeRelease();return;}
        if (e.code === 'Space') {
            const discardRelease = cancelSpaceRelease;
            const wasScanningBack = backRepeat !== null;
            const wasHeld = spaceHeld;
            clearSpaceState();
            // A short press steps forward on release. A press long enough to have
            // started scanning backwards does not also step forward.
            if (wasHeld && !wasScanningBack && !discardRelease) tryStep(1);
            restartAutoScan();
        } else {
            if(!enterHeld)return;enterHeld=false;choice?.setInputHeld(spaceHeld);
            trySelect();
        }
    }

    /**
     * The shared guard reports rejected repeats or cancelled input ownership.
     * Clear the native hold state without acting on the rejected release, so
     * a backwards scan is never left running.
     */
    function onCancelled(e) {
        const code = e.detail && e.detail.code;
        choice?.cancelInput();braking=false;if(code==='Enter'||code==='NumpadEnter')enterHeld=false;
        if (code === 'Space') clearSpaceState();
    }

    // --- lifecycle ---------------------------------------------------------------

    function init() {
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('narbe-input-cancelled', onCancelled);
        window.addEventListener('blur',()=>{clearSpaceState();enterHeld=false;braking=false;choice?.cancelInput();});
        if (window.NarbeScanManager && window.NarbeScanManager.subscribe) {
            window.NarbeScanManager.subscribe(function (next) {
                if (next.autoScan !== previousAuto && spaceHeld) {
                    if (backTimer) { clearTimeout(backTimer); backTimer = null; }
                    stopBackwardsScan();
                    // Preserve physical hold ownership until its release, but
                    // do not run a gesture armed under the previous scan mode.
                    cancelSpaceRelease = true;
                }
                previousAuto = next.autoScan;
                restartAutoScan();
            });
        }
    }

    /** Suspend scanning without tearing anything down. */
    function setEnabled(on) {
        enabled = !!on;choice?.cancelInput();enterHeld=false;braking=false;
        clearSpaceState();
        if (!enabled) {stopAutoScan();choice?.sync(null);}
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
            if(choice?.active)choice.align(items[index].id);paint();
        },
        scanState:()=>choice?.getState()
    };
})();
