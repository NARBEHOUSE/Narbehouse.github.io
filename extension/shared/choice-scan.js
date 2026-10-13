/**
 * Opt-in controller for stationary CHOICE scans only.
 * Apps forward input AFTER the existing guard, retain native selection/pause
 * ownership, and provide their existing Space hold threshold. No key listeners
 * or second debounce live here. Settings always come from NarbeScanManager.
 */
window.NarbeChoiceScan = (function () {
  'use strict';
  function create(manager, options) {
    if (options?.choice !== true) throw new Error('Choice scans require an explicit stationary-choice context');
    if (!Number.isFinite(options.holdThreshold) || options.holdThreshold <= 0) {
      throw new Error('Pass this surface\'s existing Space hold threshold');
    }
    const identify = options.getId || (item => item.id);
    const label = options.getLabel || (item => item.label);
    const speak = options.speak || (text => window.NarbeVoiceManager?.speak(text));
    const badge = options.badge || window.NarbeScanStatusBadge.create({ host: options.statusHost });
    let items = [], parents = [], index = -1, parked = false, braked = false;
    let held = null, loops = 0, fullLoop = false, loopDirection = 1, disposed = false;
    let suspended = false, inactive = false, inputHeld = false, timer = null, generation = 0;
    let due = Infinity, waiting = false, ownSpeech = null, inputSpeech = null;
    let pauseGeneration = 0, pauseSpeech = null, parkingSpeech = null;
    let prefs = manager.getSettings();
    function validate(next) {
      const ids = next.map(identify);
      if (ids.some(id => id === null || id === undefined) || new Set(ids).size !== ids.length) {
        throw new Error('Choice scan items require unique stable identities');
      }
      return [...next];
    }
    function state() {
      return {
        index, id: index < 0 ? null : identify(items[index]), depth: parents.length,
        parked, braked, held: !!held, inputHeld, loops, waitingForSpeech: waiting,
        suspended: suspended || inactive, disposed
      };
    }
    function draw() {
      const item = index < 0 ? null : items[index], current = state();
      badge.update(parked ? 'Parked' : (braked || held?.braking) ? 'Paused' : '', {
        item: item === null ? null : options.getElement ? options.getElement(item) : item,
        label: item === null ? null : options.getLabelElement?.(item) || null,
        state: current
      });
      options.onHighlight?.(item, current);
    }
    function stopClock() {
      clearTimeout(timer);
      timer = null;
      generation++;
      waiting = false;
      due = Infinity;
    }
    function eligible() {
      return !disposed && !suspended && !inactive && prefs.autoScan &&
        !parked && !braked && !held?.braking && !held?.waitForRelease && !inputHeld && items.length > 0;
    }
    function readyToAdvance() { return eligible() && !waiting && Date.now() >= due; }
    function arm(delay) {
      due = Date.now() + Math.max(0, delay);
      timer = setTimeout(() => {
        timer = null;
        if (readyToAdvance()) step(1);
      }, Math.max(0, delay));
    }
    function schedule(ticket, began = Date.now()) {
      stopClock();
      if (!eligible()) return;
      const token = generation;
      if (!prefs.waitForSpeech || !ticket?.finished) { arm(prefs.scanInterval); return; }
      waiting = true;
      // NarbeVoiceManager owns the bounded completion contract.
      Promise.resolve(ticket.finished).then(result => {
        if (token !== generation || !eligible()) return;
        waiting = false;
        // Disabled/failed speech behaves like ordinary interval scanning.
        arm(result?.started ? prefs.scanInterval : Math.max(0, prefs.scanInterval - (Date.now() - began)));
      }, () => {
        if (token !== generation || !eligible()) return;
        waiting = false;
        arm(Math.max(0, prefs.scanInterval - (Date.now() - began)));
      });
    }
    function clearPauseAnnouncement() {
      pauseGeneration++;
      pauseSpeech?.cancel?.();
      pauseSpeech = null;
    }
    function queuePauseAnnouncement() {
      clearPauseAnnouncement();
      const token = pauseGeneration, ticket = ownSpeech;
      if (!ticket?.finished) return;
      Promise.resolve(ticket.finished).then(result => {
        if (token !== pauseGeneration || disposed || suspended || inactive ||
            !prefs.autoScan || !braked || parked || ownSpeech !== ticket) return;
        // A timeout releases the clock but may leave native speech running.
        // Only a confirmed normal end permits this follow-up announcement.
        if (result?.reason !== 'end' || !result.started) return;
        parkingSpeech = null;
        pauseSpeech = ownSpeech = speak('Paused');
      }, () => {});
    }
    function announce(text, parkingLabel = false) {
      clearPauseAnnouncement();
      ownSpeech = speak(text);
      parkingSpeech = parkingLabel ? ownSpeech : null;
      return ownSpeech;
    }
    function currentLabel() {
      // The recurring blank is silent in Step and while Parking is Off.
      if (index < 0) return prefs.autoScan && prefs.parking !== 'off' ? (parked ? 'parked' : 'park') : null;
      return label(items[index]);
    }
    function announceCurrent(text, { parkingLabel = false } = {}) {
      if (disposed) return;
      clearPauseAnnouncement();
      const began = Date.now();
      const current = text === undefined ? currentLabel() : text;
      const ticket = current === null ? null : announce(current, parkingLabel || (text === undefined && index < 0));
      schedule(ticket, began);
      return ticket;
    }
    function land(next, announceLabel = true) {
      clearPauseAnnouncement();
      stopClock();
      index = next;
      draw();
      if (disposed) return;
      const began = Date.now();
      const current = currentLabel();
      // A silent blank also ends its owned label; unrelated narration has
      // its own ticket and must remain untouched.
      if (current === null) { ownSpeech?.cancel?.(); ownSpeech = null; parkingSpeech = null; }
      const ticket = announceLabel && current !== null ? announce(current, index < 0) : null;
      schedule(ticket, began);
    }
    function park() {
      if (disposed || !manager.isParkingEnabled()) return false;
      stopClock();
      while (parents.length) items = parents.pop().items;
      index = -1;
      parked = true;
      braked = false;
      held = null;
      draw();
      announce('parked', true);
      return true;
    }
    function resume() {
      if (disposed || !parked) return false;
      parked = false;
      loops = 0;
      fullLoop = true;
      loopDirection = 1;
      land(items.length ? 0 : -1);
      return true;
    }
    function rootBoundary() {
      // Non-wrapping child groups finish at root -1, where parking belongs.
      while (parents.length) items = parents.pop().items;
      index = -1;
      if (fullLoop) loops++;
      fullLoop = false;
      if (manager.shouldParkAfterLoop(loops)) return park();
      land(-1);
      return true;
    }
    function step(direction = 1) {
      if (disposed || suspended || inactive || parked || braked || held?.braking) return false;
      if (!items.length) { land(-1); return false; }
      const forward = direction >= 0;
      const nextDirection = forward ? 1 : -1;
      if (nextDirection !== loopDirection) fullLoop = false;
      loopDirection = nextDirection;
      if (parents.length && ((forward && index === items.length - 1) || (!forward && index === 0))) {
        if (parents[parents.length - 1].wrap) {
          // Keyboard rows keep scanning their keys until selection or Back.
          // Their local cycles are not completed root loops for parking.
          land(forward ? 0 : items.length - 1);
          return true;
        }
        return rootBoundary();
      }
      const next = forward ? (index === items.length - 1 ? -1 : index + 1) :
        (index === -1 ? items.length - 1 : index - 1);
      if (next === -1) return rootBoundary();
      if ((forward && next === 0) || (!forward && next === items.length - 1)) fullLoop = true;
      land(next);
      return true;
    }
    function select() {
      if (disposed || suspended || inactive) return false;
      if (parked) { resume(); return true; }
      if (index < 0) {
        if (prefs.autoScan && prefs.parking === 'chosen') return park();
        return false;
      }
      options.onSelect?.(items[index], state());
      return true;
    }
    function brakePress() {
      if (held) return true; // native key repeats do not restart the hold
      if (disposed || suspended || inactive || !prefs.autoScan || !prefs.spaceBrake ||
          options.brakeKeyAvailable === false) return false;
      held = { at: Date.now(), wasBraked: braked, braking: (index >= 0 || braked) && !parked };
      if (held.braking) {
        stopClock();
        braked = true;
        draw(); // keep the item and its speech
        if (!held?.wasBraked && braked) queuePauseAnnouncement();
      }
      return true; // -1 / parked: consume Space without changing state
    }
    function brakeRelease() {
      if (!held) return false;
      const press = held;
      held = null;
      if (!press.braking) {
        if (press.waitForRelease) { draw(); schedule(null); }
        return true;
      }
      if (!prefs.autoScan || !prefs.spaceBrake || press.wasBraked ||
          Date.now() - press.at >= options.holdThreshold) {
        clearPauseAnnouncement();
        braked = false;
        draw();
        schedule(null); // always one FULL interval, even if old speech continues
      } else {
        braked = true;
        draw();
      }
      return true;
    }
    function replaceItems(next) {
      if (disposed) return;
      const remembered = index < 0 ? null : identify(items[index]);
      items = validate(next);
      index = remembered === null ? -1 : items.findIndex(item => identify(item) === remembered);
      const removed = remembered !== null && index < 0;
      if (removed) while (parents.length) items = parents.pop().items;
      draw();
      if (removed) {
        clearPauseAnnouncement();
        fullLoop = false;
        ownSpeech?.cancel?.();
        schedule(null);
      } else if (!timer && !waiting && eligible()) schedule(null);
    }
    function open(next, { restoreId = null } = {}) {
      if (disposed) return;
      stopClock();
      ownSpeech?.cancel?.();
      items = validate(next);
      parents = [];
      inputHeld = false;
      index = restoreId === null ? -1 : items.findIndex(item => identify(item) === restoreId);
      parked = false;
      braked = false;
      held = null;
      loops = 0;
      fullLoop = index === 0;
      loopDirection = 1;
      land(index);
    }
    function enterGroup(next, {restoreId=null, wrap=false} = {}) {
      if (disposed || index < 0) return false;
      const children = validate(next);
      if (!children.length) return false;
      const childIndex=restoreId===null?0:children.findIndex(item=>identify(item)===restoreId);
      if(childIndex<0)return false;
      parents.push({ items, id: identify(items[index]), wrap: wrap === true });
      items = children;
      fullLoop = true;
      loopDirection = 1;
      loops = 0;
      land(childIndex);
      return true;
    }
    function back({ restore = true } = {}) {
      if (!parents.length || disposed) return false;
      const parent = parents.pop();
      items = parent.items;
      parked = false;
      braked = false;
      held = null;
      fullLoop = false;
      // A reset returns to root, because -1 exists ONLY at the top level.
      if (!restore) while (parents.length) items = parents.pop().items;
      land(restore ? items.findIndex(item => identify(item) === parent.id) : -1);
      return true;
    }
    function activity(active) {
      if (inactive === !active) return;
      inactive = !active;
      clearPauseAnnouncement();
      stopClock();
      // Lost focus must never leave a half-held key stranded.
      if (held?.braking) braked = held.wasBraked;
      held = null;
      inputHeld = false;
      draw();
      if (active) schedule(null);
    }
    function onSettings(next) {
      const previous = prefs;
      prefs = next;
      // Cancel only this scanner's parking label, including queued starts and
      // native speech that outlived its completion cap. Explicit setting or
      // app narration is not a parking label even when the index is blank.
      const silencedParking = parkingSpeech && (!next.autoScan || next.parking === 'off');
      if (silencedParking) {
        clearPauseAnnouncement();
        parkingSpeech.cancel?.();
        if (ownSpeech === parkingSpeech) ownSpeech = null;
        parkingSpeech = null;
        stopClock();
      }
      if (previous.autoScan !== next.autoScan) {
        clearPauseAnnouncement();
        // A setting change is not navigation. Keep the current identity and
        // row stack while clearing states that belong to the previous mode.
        parked = false; braked = false; loops = 0; fullLoop = false; loopDirection = 1;
        if (held) { held.braking = false; held.waitForRelease = true; }
        stopClock();
        draw();
        schedule(null);
        return;
      }
      if (previous.parking !== next.parking || previous.loopsBeforeParking !== next.loopsBeforeParking) {
        loops = 0;
        fullLoop = false;
      }
      if (parked && next.parking === 'off') {
        parked = false; draw(); schedule(null); return;
      }
      if (braked && !next.spaceBrake) {
        clearPauseAnnouncement();
        braked = false; if (held) held.braking = false; draw(); schedule(null);
      } else if (silencedParking || previous.scanInterval !== next.scanInterval || previous.waitForSpeech !== next.waitForSpeech) {
        schedule(next.waitForSpeech ? ownSpeech : null);
      }
    }
    manager.subscribe(onSettings);
    const stopActivity = window.NarbePlatform.lifecycle.onActivity(activity);
    const api = {
      getState: state, readyToAdvance, step, select, park, resume, brakePress, brakeRelease, announceCurrent,
      setItems: replaceItems, open, enterGroup, back,
      rememberFocus: () => state().id,
      // Freeze only the automatic clock while a native selection/backward key
      // is down. Manual navigation still works; this is not the Space brake.
      setInputHeld(value) {
        if (disposed || inputHeld === !!value) return;
        inputHeld = !!value;
        if (inputHeld) inputSpeech = ownSpeech;
        stopClock();
        if (!inputHeld) {
          const movedSpeech = ownSpeech !== inputSpeech ? ownSpeech : null;
          inputSpeech = null;
          schedule(movedSpeech);
        }
      },
      setSuspended(value) {
        clearPauseAnnouncement();
        suspended = !!value;
        stopClock();
        if (held?.braking) braked = held.wasBraked;
        held = null;
        inputHeld = false;
        draw();
        if (!suspended) schedule(null);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        clearPauseAnnouncement();
        stopClock();
        ownSpeech?.cancel?.();
        manager.unsubscribe(onSettings);
        stopActivity();
        badge.destroy();
      }
    };
    open(options.items || []);
    return api;
  }
  return { create };
})();
