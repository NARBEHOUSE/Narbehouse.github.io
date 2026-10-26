/**
 * NARBE Switch Songs - playback and speech.
 *
 * NSS.Sound plays the rendered loop through two plain <audio> elements and
 * swaps between them when the loop changes, keeping its place in the bar.
 * One-off sounds (recorded presses, song notes) go through the hub's
 * SafeAudio. No AudioContext anywhere.
 *
 * NSS.Voice wraps the hub's voice manager and lowers the music while it
 * speaks, so labels are never lost under the beat.
 */

window.NSS = window.NSS || {};

NSS.Sound = (function () {
    'use strict';

    const els = [new Audio(), new Audio()];
    els.forEach(function (a) { a.loop = true; a.preload = 'auto'; });
    const listenAudio = new Audio();
    listenAudio.preload = 'auto';
    listenAudio.loop = false;
    let listening = false, listenToken = 0, listenUrl = null, listenId = null, listenTimeline = null;

    let cur = -1, dur = 0, url = null, playing = false, token = 0, duck = 1;
    const made = Object.create(null);

    function S() { return NSS.Settings; }
    function on() { return S().get('sound'); }
    function level() { return on() ? S().volume() : 0; }
    function curEl() { return cur < 0 ? null : els[cur]; }

    function applyVolume() {
        const v = Math.max(0, Math.min(1, level() * duck));
        els.concat(listenAudio).forEach(function (a) { try { a.volume = v; } catch (e) { /* ignore */ } });
    }

    /** Where we are in the loop, 0 to 1. */
    function phase() {
        const a = curEl();
        if (!a || !dur) return 0;
        return (a.currentTime % dur) / dur;
    }

    /** Swap in a newly rendered loop at the same point in the bar. */
    function setLoop(rendered) {
        const my = ++token;
        const nextIdx = cur === 0 ? 1 : 0;
        const next = els[nextIdx];
        const old = curEl();
        const oldDur = dur;
        const newUrl = NSS.Synth.toWavUrl(rendered.samples);
        let done = false, fallback = null;

        function go() {
            if (done) return;
            done = true;
            next.removeEventListener('canplay', go);
            clearTimeout(fallback);
            if (my !== token) { URL.revokeObjectURL(newUrl); return; }
            const ph = old && oldDur ? (old.currentTime % oldDur) / oldDur : 0;
            const prevUrl = url;
            cur = nextIdx; dur = rendered.duration; url = newUrl;
            try { next.currentTime = ph * dur; } catch (e) { /* not seekable yet */ }
            applyVolume();
            if (playing) {
                const stopOld = function () { if (old && old !== curEl()) { try { old.pause(); } catch (e) { /* ignore */ } } };
                next.addEventListener('playing', stopOld, { once: true });
                setTimeout(stopOld, 300);
                const p = next.play();
                if (p && p.catch) p.catch(function () { /* autoplay not unlocked yet */ });
            } else if (old) {
                try { old.pause(); } catch (e) { /* ignore */ }
            }
            if (prevUrl) setTimeout(function () { URL.revokeObjectURL(prevUrl); }, 3000);
        }

        next.addEventListener('canplay', go);
        fallback = setTimeout(go, 700);
        next.src = newUrl;
        try { next.load(); } catch (e) { /* ignore */ }
    }

    function play() {
        playing = true;
        const a = curEl();
        if (!a) return;
        applyVolume();
        const p = a.play();
        if (p && p.catch) p.catch(function () { /* autoplay not unlocked yet */ });
    }

    function stop() {
        playing = false;
        els.forEach(function (a) { try { a.pause(); } catch (e) { /* ignore */ } });
        stopListening();
    }

    function stopListening() {
        listenToken++;
        listening = false;
        listenAudio.onended = null;
        listenAudio.onerror = null;
        listenAudio.pause();
        try { listenAudio.currentTime = 0; } catch (e) { /* not loaded yet */ }
    }

    function listenSong(song, finished) {
        stop();
        const my = ++listenToken;
        function finish(reason) {
            if (my !== listenToken) return;
            stopListening();
            if (finished) finished(reason);
        }
        try {
            // Keep only the current song's WAV; never accumulate 41 audio buffers.
            if (listenId !== song.id) {
                const previous = listenUrl;
                const rendered = NSS.Synth.renderSong(song);
                listenTimeline = { starts: rendered.starts, duration: rendered.duration };
                listenUrl = NSS.Synth.toWavUrl(rendered.samples);
                listenId = song.id;
                listenAudio.src = listenUrl;
                if (previous) URL.revokeObjectURL(previous);
            }
            listening = true;
            listenAudio.onended = function () { finish('ended'); };
            listenAudio.onerror = function () { finish('error'); };
            applyVolume();
            const promise = listenAudio.play();
            if (promise && promise.catch) promise.catch(function () { finish('error'); });
        } catch (e) { finish('error'); }
    }

    /** The audio element is the clock for both the keys and progress display. */
    function listeningPosition() {
        if (!listening || !listenTimeline) return null;
        const time = listenAudio.currentTime, starts = listenTimeline.starts;
        let index = 0;
        while (index + 1 < starts.length && starts[index + 1] <= time) index++;
        return { time: time, duration: listenTimeline.duration, index: index,
            start: starts[index], next: starts[index + 1] || listenTimeline.duration };
    }

    // --- one-off sounds through SafeAudio ------------------------------------------

    function ensure(name, make) {
        if (made[name]) return true;
        if (!window.SafeAudio) return false;
        try { window.SafeAudio.preload(name, make()); made[name] = true; return true; }
        catch (e) { console.warn('[NSS] could not make sound', name, e); return false; }
    }

    function shotPlay(name, make, gain) {
        if (!on() || !ensure(name, make)) return;
        window.SafeAudio.play(name, Math.min(1, level() * duck * (gain || 1)));
    }

    function shotName(layer, v) { return 'nss-' + layer.id + (layer.type === 'tone' ? '-' + v : ''); }

    function shot(layer, v) { shotPlay(shotName(layer, v), function () { return NSS.Synth.shotUrl(layer, v); }, 1); }
    function bell(m) { shotPlay('nss-bell-' + m, function () { return NSS.Synth.bellUrl(m); }, 1); }
    function beep(n) { shotPlay('nss-beep-' + n, function () { return NSS.Synth.beepUrl(440 + n * 110); }, 0.6); }

    /** Built-in SafeAudio blips for moving and choosing in menus. */
    function blip() { if (on() && window.SafeAudio) window.SafeAudio.play('hover', level() * 0.45); }
    function choose() { if (on() && window.SafeAudio) window.SafeAudio.play('select', level() * 0.55); }

    function celebrate() {
        [60, 64, 67, 72].forEach(function (m, k) { setTimeout(function () { bell(m); }, k * 110); });
    }

    /** Make the one-off sounds a few at a time after boot, so nothing waits later. */
    function prewarm() {
        const jobs = [];
        const notes = Array.from({length: 24}, (_, i) => 60 + i);
        notes.forEach(function (m) { jobs.push(function () { ensure('nss-bell-' + m, function () { return NSS.Synth.bellUrl(m); }); }); });
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
        listenSong: listenSong, stopListening: stopListening,
        isListening: function () { return listening; },
        listeningPosition: listeningPosition,
        applyVolume: applyVolume, setDuck: setDuck,
        shot: shot, bell: bell, beep: beep, blip: blip, choose: choose, celebrate: celebrate,
        prewarm: prewarm
    };
})();

NSS.Voice = (function () {
    'use strict';
    let latest = null, priority = null;
    function vm() { return window.NarbeVoiceManager; }
    function release(ticket) {
        if (priority === ticket) priority = null;
        if (latest === ticket) { latest = null; NSS.Sound.setDuck(1); }
    }
    return {
        speak: function (text, options) {
            // A deliberate help call must finish even when Auto advances and
            // ordinary menu narration is off. Controls remain available.
            if (priority && !options?.force) return null;
            let ticket = null;
            try { ticket = text && vm() ? vm().speak(text, options) : null; } catch (e) { ticket = null; }
            if (ticket && ticket.finished) {
                latest = ticket;
                if (options?.force) priority = ticket;
                NSS.Sound.setDuck(0.35);
                Promise.resolve(ticket.finished).then(function () { release(ticket); }, function () { release(ticket); });
            }
            return ticket;
        },
        cancel: function () { priority = null; try { vm() && vm().cancel(); } catch (e) { /* no voice manager */ } },
        on: function () { try { return !!vm().getSettings().ttsEnabled; } catch (e) { return false; } }
    };
})();
