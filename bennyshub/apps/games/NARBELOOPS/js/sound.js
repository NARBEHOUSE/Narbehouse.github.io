/**
 * NARBE Loops - playback and speech.
 *
 * NL.Sound plays contiguous PCM repeats through plain <audio> elements.
 * A prepared replacement takes over before the long buffer ends or when a
 * pattern changes; the old element is kept sounding until playback starts.
 * One-off sounds (box feedback and volume previews) go through the hub's
 * SafeAudio. No AudioContext anywhere.
 *
 * NL.Voice wraps the hub's voice manager and lowers the music while it
 * speaks, so labels are never lost under the beat.
 */

window.NL = window.NL || {};

NL.Sound = (function () {
    'use strict';

    const els = [new Audio(), new Audio()];
    els.forEach(function (a) { a.preload = 'auto'; });
    const REPEAT_COPIES = 32;
    let cur = -1, dur = 0, playing = false, token = 0, duck = 1;
    let currentRender = null, pending = null, rollover = null;
    const urls = new Set(), made = Object.create(null);
    function S() { return NL.Settings; }
    function on() { return S().get('sound'); }
    function level() { return on() ? S().volume() : 0; }
    function curEl() { return cur < 0 ? null : els[cur]; }
    function applyVolume() {
        const v = Math.max(0, Math.min(1, level() * duck));
        els.forEach(function (a) { try { a.volume = v; } catch (e) { /* ignore */ } });
    }
    function phase() { const a = curEl(); return a && dur ? (a.currentTime % dur) / dur : 0; }
    function releaseUrl(url) {
        if (!url || els.some(a => a.src === url)) return;
        if (urls.delete(url)) URL.revokeObjectURL(url);
    }
    function cancelPending() {
        if (!pending) return;
        pending.audio.removeEventListener('canplay', pending.go);
        pending = null;
    }
    function watchLoop() {
        clearInterval(rollover); rollover = null;
        if (!playing) return;
        rollover = setInterval(function () {
            const a = curEl();
            // Refill well before the long PCM buffer ends. Keep the old audio
            // sounding until the prepared replacement has actually started.
            if (!pending && a && currentRender && Number.isFinite(a.duration) && a.currentTime >= a.duration - dur * 2) setLoop(currentRender);
        }, 100);
    }
    function prepare(rendered) {
        cancelPending();
        const my = ++token, nextIdx = cur === 0 ? 1 : 0, next = els[nextIdx], old = curEl();
        const oldDur = dur, oldUrl = next.src;
        const newUrl = NL.Synth.toWavUrl(rendered.samples, REPEAT_COPIES);
        urls.add(newUrl);
        let done = false;
        function go() {
            if (done || my !== token) return;
            done = true; next.removeEventListener('canplay', go); pending = null;
            const ph = old && oldDur ? (old.currentTime % oldDur) / oldDur : 0;
            cur = nextIdx; dur = rendered.duration; currentRender = rendered;
            try { next.currentTime = ph * dur; } catch (e) { /* metadata not seekable */ }
            applyVolume();
            if (playing) {
                const p = next.play();
                Promise.resolve(p).then(function () {
                    if (my !== token) return;
                    if (old && old !== curEl()) old.pause();
                }, function () {
                    if (my !== token) return;
                    if (old && !old.paused) { cur = els.indexOf(old); dur = oldDur; }
                    else playing = false;
                });
            } else if (old) old.pause();
            watchLoop();
        }
        next.loop = true; // Fallback only; ordinary repeats are already PCM.
        pending = { audio: next, go };
        next.addEventListener('canplay', go);
        next.src = newUrl;
        releaseUrl(oldUrl);
        for (const u of urls) releaseUrl(u);
        next.load();
    }
    function setLoop(rendered) { prepare(rendered); }
    function play() {
        playing = true;
        const a = curEl();
        if (a && !pending) { applyVolume(); const p = a.play(); if (p && p.catch) p.catch(function () { /* waiting for a gesture */ }); }
        watchLoop();
    }
    function stop() {
        playing = false;
        clearInterval(rollover); rollover = null;
        els.forEach(function (a) { a.pause(); });
    }

    // --- one-off sounds through SafeAudio ------------------------------------------

    function ensure(name, make) {
        if (made[name]) return true;
        if (!window.SafeAudio) return false;
        try { window.SafeAudio.preload(name, make()); made[name] = true; return true; }
        catch (e) { console.warn('[NL] could not make sound', name, e); return false; }
    }

    function shotPlay(name, make, gain) {
        if (!on() || !ensure(name, make)) return;
        window.SafeAudio.play(name, Math.min(1, level() * duck * (gain || 1)));
    }

    function shotName(layer, v, variant) { return 'nl-' + (layer.instrument || layer.id) + (layer.type === 'tone' ? '-' + v : '') + '-s' + (variant || 0); }

    function shot(layer, v, variant) { shotPlay(shotName(layer, v, variant), function () { return NL.Synth.shotUrl(layer, v, variant); }, 1); }
    function bell(m) { shotPlay('nl-bell-' + m, function () { return NL.Synth.bellUrl(m); }, 1); }
    function beep(n) { shotPlay('nl-beep-' + n, function () { return NL.Synth.beepUrl(440 + n * 110); }, 0.6); }

    /** Built-in SafeAudio blips for moving and choosing in menus. */
    function blip() { if (on() && window.SafeAudio) window.SafeAudio.play('hover', level() * 0.45); }
    function choose() { if (on() && window.SafeAudio) window.SafeAudio.play('select', level() * 0.55); }

    /** Make the one-off sounds a few at a time after boot, so nothing waits later. */
    function prewarm() {
        const jobs = [];
        NL.Music.LAYERS.forEach(function (L) {
            if (L.type === 'drum') jobs.push(function () { ensure(shotName(L, 0), function () { return NL.Synth.shotUrl(L, 0); }); });
            else Array.from(new Set(L.contour)).forEach(function (v) {
                jobs.push(function () { ensure(shotName(L, v), function () { return NL.Synth.shotUrl(L, v); }); });
            });
        });
        (function next() {
            const job = jobs.shift();
            if (!job) return;
            job();
            setTimeout(next, 30);
        })();
    }

    function setDuck(v) { duck = v; applyVolume(); }

    return {
        setLoop: setLoop, play: play, stop: stop, phase: phase,
        isPlaying: function () { return playing; },
        applyVolume: applyVolume, setDuck: setDuck,
        shot: shot, bell: bell, beep: beep, blip: blip, choose: choose,
        prewarm: prewarm
    };
})();

NL.Voice = (function () {
    'use strict';
    let latest = null, priority = null;
    function vm() { return window.NarbeVoiceManager; }
    function release(ticket) {
        if (priority === ticket) priority = null;
        if (latest === ticket) { latest = null; NL.Sound.setDuck(1); }
    }
    return {
        speak: function (text, options) {
            // Let a deliberate help call finish even with Auto Scan or narration off.
            if (priority && !options?.force) return null;
            let ticket = null;
            try { ticket = text && vm() ? vm().speak(text, options) : null; } catch (e) { ticket = null; }
            if (ticket && ticket.finished) {
                latest = ticket;
                if (options?.force) priority = ticket;
                NL.Sound.setDuck(0.35);
                Promise.resolve(ticket.finished).then(function () { release(ticket); }, function () { release(ticket); });
            }
            return ticket;
        },
        cancel: function () { priority = null; try { vm() && vm().cancel(); } catch (e) { /* no voice manager */ } },
        on: function () { try { return !!vm().getSettings().ttsEnabled; } catch (e) { return false; } }
    };
})();
