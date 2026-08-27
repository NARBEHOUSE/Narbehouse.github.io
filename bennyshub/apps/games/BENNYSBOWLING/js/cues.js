/*
 * cues.js -- non-speech audio cues for Benny's Bowling.
 *
 * Two cues, both aimed at players who can't read the on-screen bar or the
 * aiming line:
 *
 *   Charge  A rising five-note ladder, one note per 20% of power, matching
 *           Benny's Mini Golf note for note so the two games mean the same
 *           thing. A repeating chirp once the shot is fully charged tells you
 *           you have stopped gaining power and can let go.
 *
 *   Aim     Soft blips reporting where the ball is currently predicted to
 *           cross the head pin. They speed up and rise in pitch as the aim
 *           converges, and pan to the side you are drifting towards -- the
 *           parking-sensor idiom, which reads without being learned. A gentle
 *           two-note chime marks the moment the aim enters the strike window,
 *           which is the cue to release. Deliberately intermittent: a held
 *           tone is quick to fatigue when every shot needs several seconds of
 *           aiming.
 *
 * Everything is synthesised, so there are no new audio files to ship and the
 * pitch can be continuous rather than a handful of samples.
 */

var BowlCues = (function () {
	"use strict";

	var ctx = null;
	var master = null;
	var chargeOn = true;
	var aimOn = true;

	// Shared with Benny's Mini Golf: C5, D5, E5, G5, C6 (major pentatonic).
	var CHARGE_NOTES = [523.25, 587.33, 659.25, 783.99, 1046.50];
	var CHARGE_STEPS = CHARGE_NOTES.length;

	var AIM_FREQ_ON = 784.0;     // G5, dead on the head pin
	var AIM_FREQ_OFF = 294.0;    // D4, as wide as the cue reports
	var AIM_INTERVAL_ON = 0.13;  // seconds between blips, on target
	var AIM_INTERVAL_OFF = 0.52; // seconds between blips, fully off
	var AIM_GAIN = 0.05;

	var chargeStep = 0;
	var fullChargeTimer = null;
	var aimActive = false;
	var aimOnTarget = false;
	var aimNextBlip = 0;        // ctx time at which the next blip is due

	function ensureCtx() {
		if (ctx) { return ctx; }
		var AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) { return null; }
		try {
			ctx = new AC();
			master = ctx.createGain();
			master.gain.value = 1.0;
			master.connect(ctx.destination);
		} catch (e) {
			ctx = null;
		}
		return ctx;
	}

	// Browsers start the context suspended until the page has been interacted
	// with; every entry point calls this so the first cue isn't swallowed.
	function resume() {
		var c = ensureCtx();
		if (c && c.state === "suspended") { c.resume().catch(function () {}); }
		return c;
	}

	function blip(freq, duration, gainValue, delay, type, pan) {
		var c = resume();
		if (!c) { return; }
		var t0 = c.currentTime + (delay || 0);
		var osc = c.createOscillator();
		var g = c.createGain();
		osc.type = type || "sine";
		osc.frequency.setValueAtTime(freq, t0);
		// A soft attack instead of a click: harshness in a cue you hear on
		// every shot is what makes it tiring.
		g.gain.setValueAtTime(0.0001, t0);
		g.gain.exponentialRampToValueAtTime(gainValue, t0 + 0.025);
		g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
		osc.connect(g);
		if (pan !== undefined && typeof c.createStereoPanner === "function") {
			var pn = c.createStereoPanner();
			pn.pan.value = pan;
			g.connect(pn);
			pn.connect(master);
		} else {
			g.connect(master);
		}
		osc.start(t0);
		osc.stop(t0 + duration + 0.05);
	}

	// --- charge ----------------------------------------------------------
	function clearFullChargeTimer() {
		if (fullChargeTimer) { clearInterval(fullChargeTimer); fullChargeTimer = null; }
	}

	function startCharge() {
		if (!chargeOn) { return; }
		resume();
		chargeStep = 0;
		clearFullChargeTimer();
	}

	function updateCharge(percent) {
		if (!chargeOn) { return; }
		var step = Math.floor(Math.max(0, Math.min(1, percent)) * CHARGE_STEPS);
		if (step > chargeStep && step > 0 && step <= CHARGE_STEPS) {
			blip(CHARGE_NOTES[step - 1], 0.15, 0.15);
			chargeStep = step;
			// At full power the ladder has nowhere left to go, so switch to a
			// steady chirp: the player is no longer gaining anything by holding.
			if (step === CHARGE_STEPS && !fullChargeTimer) {
				fullChargeTimer = setInterval(function () {
					blip(CHARGE_NOTES[CHARGE_STEPS - 1], 0.07, 0.10);
				}, 420);
			}
		}
	}

	function stopCharge() {
		chargeStep = 0;
		clearFullChargeTimer();
	}

	// --- aim -------------------------------------------------------------
	function startAim() {
		if (!aimOn) { return; }
		resume();
		aimActive = true;
		aimOnTarget = false;
		aimNextBlip = 0;
	}

	/**
	 * @param {number}  error    signed miss distance from the pin the shot is
	 *                           closest to hitting, in world units. Negative is
	 *                           left of that pin.
	 * @param {number}  range    error magnitude treated as "completely off".
	 * @param {boolean} onTarget whether the line actually strikes a pin. The
	 *                           caller decides this, because it depends on
	 *                           which pins are still standing.
	 */
	function updateAim(error, range, onTarget) {
		if (!aimOn) { return; }
		var c = resume();
		if (!c) { return; }
		if (!aimActive) { startAim(); }

		var t = Math.min(1, Math.abs(error) / (range || 0.5));
		var on = !!onTarget;

		if (on && !aimOnTarget) {
			// Entering the window: the release cue. Two soft notes a fourth
			// apart, distinct from the blips without being piercing.
			blip(659.25, 0.11, 0.075, 0, "sine");        // E5
			blip(880.00, 0.16, 0.075, 0.10, "sine");     // A5
			aimNextBlip = c.currentTime + 0.30;          // let the chime breathe
		}
		aimOnTarget = on;

		if (c.currentTime < aimNextBlip) { return; }

		// Pitch rises and the gaps close as the aim converges. Exponential so
		// the resolution is concentrated where it matters, near the centre.
		var freq = AIM_FREQ_OFF * Math.pow(AIM_FREQ_ON / AIM_FREQ_OFF, 1 - t);
		var interval = AIM_INTERVAL_ON + (AIM_INTERVAL_OFF - AIM_INTERVAL_ON) * t;
		var pan = Math.max(-1, Math.min(1, error / (range || 0.5)));
		blip(freq, Math.min(0.09, interval * 0.55), AIM_GAIN, 0, "sine", pan);
		aimNextBlip = c.currentTime + interval;
	}

	function stopAim() {
		aimActive = false;
		aimOnTarget = false;
		aimNextBlip = 0;
	}

	function setChargeEnabled(on) {
		chargeOn = !!on;
		if (!chargeOn) { stopCharge(); }
	}

	function setAimEnabled(on) {
		aimOn = !!on;
		if (!aimOn) { stopAim(); }
	}

	function stopAll() { stopAim(); stopCharge(); }

	return {
		setChargeEnabled: setChargeEnabled,
		setAimEnabled: setAimEnabled,
		isChargeEnabled: function () { return chargeOn; },
		isAimEnabled: function () { return aimOn; },
		resume: resume,
		startCharge: startCharge,
		updateCharge: updateCharge,
		stopCharge: stopCharge,
		startAim: startAim,
		updateAim: updateAim,
		stopAim: stopAim,
		stopAll: stopAll
	};
})();
