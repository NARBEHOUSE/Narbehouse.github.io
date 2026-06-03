// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S FOOTBALL - Audio System
// Procedural SFX (Web Audio), optional background music, and TTS narration that
// routes through the shared NarbeVoiceManager when available.
// ═══════════════════════════════════════════════════════════════════════════════

class AudioSystem {
    constructor() {
        this.ctx = null;
        this.settings = {
            musicEnabled: true,
            soundEnabled: true
        };
        this.music = null;       // HTMLAudioElement when music files exist
        this.musicTracks = [];
        this.trackIndex = 0;
        this.loadSettings();
        this.discoverMusic();
    }

    loadSettings() {
        try {
            const raw = localStorage.getItem(LS_AUDIO);
            if (raw) Object.assign(this.settings, JSON.parse(raw));
        } catch (e) { /* ignore */ }
    }

    saveSettings() {
        try { localStorage.setItem(LS_AUDIO, JSON.stringify(this.settings)); }
        catch (e) { /* ignore */ }
    }

    ensureCtx() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }

    // Look for optional music files in sounds/music/. They are loaded lazily; if
    // none exist nothing breaks (the folder may be empty).
    discoverMusic() {
        // Candidate filenames. We probe a handful; missing files simply fail to load.
        this.musicCandidates = [
            'sounds/music/music (1).mp3',
            'sounds/music/music (2).mp3',
            'sounds/music/music (3).mp3',
            'sounds/music/music (4).mp3',
            'sounds/music/music (5).mp3'
        ];
    }

    startMusic() {
        if (!this.settings.musicEnabled) return;
        if (this.music) { this.music.play().catch(() => {}); return; }
        this._tryTrack(0);
    }

    _tryTrack(i) {
        if (i >= this.musicCandidates.length) return;
        const audio = new Audio(this.musicCandidates[i]);
        audio.volume = 0.18;
        audio.loop = false;
        audio.addEventListener('canplaythrough', () => {
            this.music = audio;
            if (this.settings.musicEnabled) audio.play().catch(() => {});
        }, { once: true });
        audio.addEventListener('ended', () => {
            this.trackIndex = (this.trackIndex + 1) % this.musicCandidates.length;
            this.music = null;
            this._tryTrack(this.trackIndex);
        });
        audio.addEventListener('error', () => this._tryTrack(i + 1), { once: true });
        audio.load();
    }

    stopMusic() {
        if (this.music) { this.music.pause(); }
    }

    toggleMusic() {
        this.settings.musicEnabled = !this.settings.musicEnabled;
        this.saveSettings();
        if (this.settings.musicEnabled) this.startMusic();
        else this.stopMusic();
        return this.settings.musicEnabled;
    }

    toggleSound() {
        this.settings.soundEnabled = !this.settings.soundEnabled;
        this.saveSettings();
        return this.settings.soundEnabled;
    }

    // ─── Procedural sound effects ───
    _tone(freq, dur, type = 'sine', gain = 0.18, slideTo = null) {
        if (!this.settings.soundEnabled) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
        g.gain.setValueAtTime(gain, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + dur);
    }

    _noise(dur, gain = 0.2) {
        if (!this.settings.soundEnabled) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;
        const len = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        src.buffer = buf; src.connect(g); g.connect(ctx.destination);
        src.start();
    }

    // Build an envelope: attack/decay/sustain/release
    _adsr(ctx, g, a, d, s, r, peak) {
        const now = ctx.currentTime;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(peak, now + a);
        g.gain.linearRampToValueAtTime(peak * s, now + a + d);
        g.gain.setValueAtTime(peak * s, now + a + d + r * 0.01);
        g.gain.linearRampToValueAtTime(0.0001, now + a + d + r);
    }

    play(type) {
        if (!this.settings.soundEnabled) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const connect = (node, g) => { node.connect(g); g.connect(ctx.destination); };

        switch (type) {
            case 'scan': {
                // Quick blip — short triangle pulse
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'triangle'; o.frequency.setValueAtTime(520, now);
                g.gain.setValueAtTime(0.10, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                connect(o, g); o.start(now); o.stop(now + 0.06);
                break;
            }
            case 'select': {
                // Two-note confirm chime
                [{ f: 660, t: 0 }, { f: 990, t: 0.07 }].forEach(({ f, t }) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'square'; o.frequency.setValueAtTime(f, now + t);
                    g.gain.setValueAtTime(0.13, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.13);
                    connect(o, g); o.start(now + t); o.stop(now + t + 0.14);
                });
                break;
            }
            case 'whistle': {
                // Referee whistle: sharp sine sweep with vibrato
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(1700, now);
                o.frequency.linearRampToValueAtTime(2200, now + 0.05);
                o.frequency.linearRampToValueAtTime(1900, now + 0.2);
                g.gain.setValueAtTime(0.22, now); g.gain.setValueAtTime(0.19, now + 0.16);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
                connect(o, g); o.start(now); o.stop(now + 0.33);
                break;
            }
            case 'snap': {
                // Crisp center snap — layered noise burst + low thud
                const len = Math.floor(ctx.sampleRate * 0.06);
                const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
                const src = ctx.createBufferSource(), g = ctx.createGain();
                g.gain.setValueAtTime(0.28, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
                src.buffer = buf; connect(src, g); src.start(now);
                // Add low thud
                const o2 = ctx.createOscillator(), g2 = ctx.createGain();
                o2.type = 'sine'; o2.frequency.setValueAtTime(90, now);
                o2.frequency.exponentialRampToValueAtTime(40, now + 0.08);
                g2.gain.setValueAtTime(0.18, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                connect(o2, g2); o2.start(now); o2.stop(now + 0.09);
                break;
            }
            case 'throw': {
                // Arm whip + ball hiss — whoosh from 800→200Hz plus filtered noise
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(750, now);
                o.frequency.exponentialRampToValueAtTime(180, now + 0.22);
                g.gain.setValueAtTime(0.13, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                connect(o, g); o.start(now); o.stop(now + 0.23);
                // High-frequency hiss of the spiral
                const len2 = Math.floor(ctx.sampleRate * 0.18);
                const buf2 = ctx.createBuffer(1, len2, ctx.sampleRate);
                const d2 = buf2.getChannelData(0);
                for (let i = 0; i < len2; i++) d2[i] = (Math.random() * 2 - 1) * (1 - i / len2) * 0.4;
                const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 2200;
                const src2 = ctx.createBufferSource(), g2 = ctx.createGain();
                g2.gain.setValueAtTime(0.10, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                src2.buffer = buf2; src2.connect(hf); hf.connect(g2); g2.connect(ctx.destination);
                src2.start(now);
                break;
            }
            case 'catch': {
                // Satisfying slap — pop + short reverb tail
                const len = Math.floor(ctx.sampleRate * 0.04);
                const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.9;
                const src = ctx.createBufferSource(), g = ctx.createGain();
                g.gain.setValueAtTime(0.30, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
                connect(src, g); src.buffer = buf; src.start(now);
                // Bright ping
                const o2 = ctx.createOscillator(), g2 = ctx.createGain();
                o2.type = 'triangle'; o2.frequency.setValueAtTime(1100, now);
                g2.gain.setValueAtTime(0.18, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                connect(o2, g2); o2.start(now); o2.stop(now + 0.13);
                break;
            }
            case 'tackle': {
                // Hard hit — layered noise + low boom + medium crunch
                for (let layer = 0; layer < 2; layer++) {
                    const len = Math.floor(ctx.sampleRate * (0.10 + layer * 0.06));
                    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                    const d = buf.getChannelData(0);
                    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, layer === 0 ? 2 : 1.2);
                    const src = ctx.createBufferSource(), g = ctx.createGain();
                    g.gain.setValueAtTime(layer === 0 ? 0.32 : 0.22, now + layer * 0.02);
                    g.gain.exponentialRampToValueAtTime(0.001, now + (layer === 0 ? 0.14 : 0.18));
                    connect(src, g); src.buffer = buf; src.start(now + layer * 0.02);
                }
                // Low thud
                const o3 = ctx.createOscillator(), g3 = ctx.createGain();
                o3.type = 'sine'; o3.frequency.setValueAtTime(60, now);
                o3.frequency.exponentialRampToValueAtTime(30, now + 0.12);
                g3.gain.setValueAtTime(0.20, now); g3.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
                connect(o3, g3); o3.start(now); o3.stop(now + 0.15);
                break;
            }
            case 'kick': {
                // Powerful boot — deep thud with mid punch
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(120, now);
                o.frequency.exponentialRampToValueAtTime(35, now + 0.18);
                g.gain.setValueAtTime(0.30, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                connect(o, g); o.start(now); o.stop(now + 0.23);
                // Leather crack
                const len = Math.floor(ctx.sampleRate * 0.06);
                const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
                const src = ctx.createBufferSource(), g2 = ctx.createGain();
                g2.gain.setValueAtTime(0.22, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                connect(src, g2); src.buffer = buf; src.start(now);
                break;
            }
            case 'touchdown': {
                // Big celebration fanfare — 4-note ascending
                [{ f: 523, t: 0 }, { f: 659, t: 0.14 }, { f: 784, t: 0.28 }, { f: 1047, t: 0.42 }].forEach(({ f, t }) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'square'; o.frequency.setValueAtTime(f, now + t);
                    g.gain.setValueAtTime(0.18, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.28);
                    connect(o, g); o.start(now + t); o.stop(now + t + 0.30);
                });
                // Crowd burst after melody
                setTimeout(() => this.play('crowd_big'), 540);
                break;
            }
            case 'fieldgoal': {
                // Satisfying clang + rising chime
                [{ f: 440, t: 0 }, { f: 660, t: 0.12 }, { f: 880, t: 0.24 }].forEach(({ f, t }) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'triangle'; o.frequency.setValueAtTime(f, now + t);
                    g.gain.setValueAtTime(0.17, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.30);
                    connect(o, g); o.start(now + t); o.stop(now + t + 0.31);
                });
                break;
            }
            case 'fail': {
                // Sad trombone slide down
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sawtooth'; o.frequency.setValueAtTime(340, now);
                o.frequency.linearRampToValueAtTime(180, now + 0.35);
                o.frequency.linearRampToValueAtTime(110, now + 0.55);
                g.gain.setValueAtTime(0.15, now); g.gain.setValueAtTime(0.13, now + 0.45);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
                connect(o, g); o.start(now); o.stop(now + 0.62);
                break;
            }
            case 'charge': {
                // Rising tone tick as power builds
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(280 + (this._chargePitch || 0), now);
                g.gain.setValueAtTime(0.06, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
                connect(o, g); o.start(now); o.stop(now + 0.05);
                break;
            }
            case 'cue': {
                // "Release now!" — two bright distinct notes
                [{ f: 1047, t: 0 }, { f: 1319, t: 0.09 }].forEach(({ f, t }) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'square'; o.frequency.setValueAtTime(f, now + t);
                    g.gain.setValueAtTime(0.16, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.14);
                    connect(o, g); o.start(now + t); o.stop(now + t + 0.15);
                });
                break;
            }
            case 'crowd': {
                // Moderate crowd noise burst
                const len = Math.floor(ctx.sampleRate * 0.45);
                const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < len; i++) {
                    const env = i < len * 0.15 ? i / (len * 0.15) : (1 - (i - len * 0.15) / (len * 0.85));
                    d[i] = (Math.random() * 2 - 1) * env * 0.5;
                }
                const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
                lp.type = 'lowpass'; lp.frequency.value = 1800;
                g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                src.buffer = buf; src.connect(lp); lp.connect(g); g.connect(ctx.destination);
                src.start(now);
                break;
            }
            case 'crowd_big': {
                // Roaring crowd for big plays — louder longer swell
                const len = Math.floor(ctx.sampleRate * 1.4);
                const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < len; i++) {
                    const env = i < len * 0.2 ? i / (len * 0.2) : Math.pow(1 - (i - len * 0.2) / (len * 0.8), 0.6);
                    d[i] = (Math.random() * 2 - 1) * env * 0.75;
                }
                const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
                lp.type = 'bandpass'; lp.frequency.value = 900; lp.Q.value = 0.5;
                g.gain.setValueAtTime(0.18, now);
                src.buffer = buf; src.connect(lp); lp.connect(g); g.connect(ctx.destination);
                src.start(now);
                break;
            }
            case 'incomplete': {
                // Crowd groan / ball thud on turf
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(220, now);
                o.frequency.exponentialRampToValueAtTime(80, now + 0.25);
                g.gain.setValueAtTime(0.10, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
                connect(o, g); o.start(now); o.stop(now + 0.29);
                break;
            }
            case 'interception': {
                // Urgent sting — our defender picks it off
                [{ f: 660, t: 0 }, { f: 880, t: 0.09 }, { f: 1100, t: 0.18 }].forEach(({ f, t }) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'square'; o.frequency.setValueAtTime(f, now + t);
                    g.gain.setValueAtTime(0.14, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.16);
                    connect(o, g); o.start(now + t); o.stop(now + t + 0.17);
                });
                break;
            }
            case 'huddle': {
                // Soft low murmur — players gathering
                const len = Math.floor(ctx.sampleRate * 0.6);
                const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < len; i++) {
                    const env = i < len * 0.3 ? i / (len * 0.3) : 1 - (i - len * 0.3) / (len * 0.7);
                    d[i] = (Math.random() * 2 - 1) * env * 0.25;
                }
                const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
                lp.type = 'lowpass'; lp.frequency.value = 600;
                g.gain.setValueAtTime(0.08, now);
                src.buffer = buf; src.connect(lp); lp.connect(g); g.connect(ctx.destination);
                src.start(now);
                break;
            }
            default: break;
        }
    }

    // ─── Text-to-speech narration ───
    // Narration is QUEUED so each line finishes before the next begins. Pass
    // interrupt=true only for urgent cues that should cut in immediately
    // (e.g. "In the green, let go!"). The shared NarbeVoiceManager always cancels
    // on every call, so we drive speechSynthesis directly here to get a real
    // queue while still borrowing its selected voice and rate.
    speak(text, interrupt = false) {
        if (!text) return;
        if (!('speechSynthesis' in window)) return;
        this._speakQueue = this._speakQueue || [];
        if (interrupt) {
            this._speakQueue.length = 0;
            this._speaking = false;
            clearTimeout(this._speakTimer);
            try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
            this._speakQueue.push(String(text));
            // Defer so the browser fully processes the cancel before we speak.
            this._speakTimer = setTimeout(() => this._drainSpeech(), 50);
            return;
        }
        this._speakQueue.push(String(text));
        this._drainSpeech();
    }

    _drainSpeech() {
        if (this._speaking) return;
        const next = this._speakQueue && this._speakQueue.shift();
        if (next == null) return;

        // Borrow voice + rate/pitch/volume from the shared manager when present.
        let voice = null, rate = 1.0, pitch = 1.0, volume = 1.0;
        const vm = window.NarbeVoiceManager;
        if (vm && typeof vm.getSettings === 'function') {
            const s = vm.getSettings() || {};
            if (s.ttsEnabled === false) { this._speakQueue.length = 0; return; }
            rate = s.rate || 1.0;
            pitch = s.pitch || 1.0;
            volume = (s.volume != null) ? s.volume : 1.0;
            if (typeof vm.getCurrentVoice === 'function') voice = vm.getCurrentVoice();
        }

        const ttsText = (vm && typeof vm.processTextForTTS === 'function') ? vm.processTextForTTS(next) : next;
        const u = new SpeechSynthesisUtterance(ttsText);
        u.rate = rate; u.pitch = pitch; u.volume = volume;
        if (voice) u.voice = voice;
        this._speaking = true;
        // Generation counter: stale onend/onerror from a cancelled utterance
        // must not reset _speaking for the new utterance.
        this._speakGen = (this._speakGen || 0) + 1;
        const gen = this._speakGen;
        const done = () => {
            if (this._speakGen !== gen) return;
            this._speaking = false;
            this._drainSpeech();
        };
        u.onend = done;
        u.onerror = done;
        try { speechSynthesis.speak(u); } catch (e) { this._speaking = false; }
    }
}
