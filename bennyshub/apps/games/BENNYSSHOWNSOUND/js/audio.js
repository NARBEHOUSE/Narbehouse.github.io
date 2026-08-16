// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND — Audio
//
// Two separate paths, on purpose:
//   • UI / wheel SFX  -> procedural Web Audio (Football's pattern)
//   • Panel sounds    -> plain HTMLAudioElement
//
// Panel sounds do NOT go through Phaser's audio manager. Phaser wants audio
// preloaded by key, but our sounds are user-supplied, discovered at runtime, in
// mixed formats — Ben's existing pack has uppercase .MP3 alongside .wav and
// .mp3. Matchy Match already solved this with `new Audio(src)`; we do the same.
//
// TTS routes through the shared NarbeVoiceManager when present.
// ═══════════════════════════════════════════════════════════════════════════════

class AudioSystem {
    constructor() {
        this.ctx = null;
        this.settings = {
            soundEnabled: true,      // procedural SFX
            panelEnabled: true,      // the panel's own recorded sound
            speakOnLand: true        // speak the panel title after its sound
        };
        this.loadSettings();

        this._panelAudio = null;     // the currently playing HTMLAudioElement
        this._speakQueue = [];
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

    toggleSound() {
        this.settings.soundEnabled = !this.settings.soundEnabled;
        this.saveSettings();
        return this.settings.soundEnabled;
    }

    togglePanelSound() {
        this.settings.panelEnabled = !this.settings.panelEnabled;
        this.saveSettings();
        return this.settings.panelEnabled;
    }

    toggleSpeakOnLand() {
        this.settings.speakOnLand = !this.settings.speakOnLand;
        this.saveSettings();
        return this.settings.speakOnLand;
    }

    // ─── Procedural SFX ──────────────────────────────────────────────────────

    play(type) {
        if (!this.settings.soundEnabled) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const connect = (node, g) => { node.connect(g); g.connect(ctx.destination); };

        switch (type) {
            case 'scan': {
                // Quick blip for moving the scan highlight.
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'triangle'; o.frequency.setValueAtTime(520, now);
                g.gain.setValueAtTime(0.10, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                connect(o, g); o.start(now); o.stop(now + 0.06);
                break;
            }
            case 'select': {
                // Two-note confirm chime.
                [{ f: 660, t: 0 }, { f: 990, t: 0.07 }].forEach(({ f, t }) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'square'; o.frequency.setValueAtTime(f, now + t);
                    g.gain.setValueAtTime(0.13, now + t);
                    g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.13);
                    connect(o, g); o.start(now + t); o.stop(now + t + 0.14);
                });
                break;
            }
            case 'tick': {
                // The flapper hitting a peg. Very short, or 20 of them in a
                // second turns to mush.
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'square';
                o.frequency.setValueAtTime(1400, now);
                o.frequency.exponentialRampToValueAtTime(700, now + 0.03);
                g.gain.setValueAtTime(0.07, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
                connect(o, g); o.start(now); o.stop(now + 0.04);
                break;
            }
            case 'whoosh': {
                // Filtered noise sweep as the wheel takes off.
                const len = Math.floor(ctx.sampleRate * 0.5);
                const buf = ctx.createBuffer(1, len, ctx.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < len; i++) {
                    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
                }
                const src = ctx.createBufferSource();
                const filt = ctx.createBiquadFilter();
                const g = ctx.createGain();
                src.buffer = buf;
                filt.type = 'bandpass';
                filt.frequency.setValueAtTime(300, now);
                filt.frequency.exponentialRampToValueAtTime(2400, now + 0.4);
                filt.Q.value = 1.2;
                g.gain.setValueAtTime(0.16, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                src.connect(filt); filt.connect(g); g.connect(ctx.destination);
                src.start(now);
                break;
            }
            case 'land': {
                // Warm arrival chord under the reveal.
                [523.25, 659.25, 783.99].forEach((f, i) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'sine';
                    o.frequency.setValueAtTime(f, now + i * 0.04);
                    g.gain.setValueAtTime(0.0001, now + i * 0.04);
                    g.gain.linearRampToValueAtTime(0.11, now + i * 0.04 + 0.03);
                    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.5);
                    connect(o, g); o.start(now + i * 0.04); o.stop(now + i * 0.04 + 0.52);
                });
                break;
            }
            case 'back': {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine';
                o.frequency.setValueAtTime(420, now);
                o.frequency.exponentialRampToValueAtTime(240, now + 0.12);
                g.gain.setValueAtTime(0.11, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
                connect(o, g); o.start(now); o.stop(now + 0.15);
                break;
            }
            case 'error': {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sawtooth'; o.frequency.setValueAtTime(180, now);
                g.gain.setValueAtTime(0.09, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                connect(o, g); o.start(now); o.stop(now + 0.23);
                break;
            }
        }
    }

    // ─── Panel sounds ────────────────────────────────────────────────────────

    /**
     * Play a panel's sound. Picks a random variant, avoiding the one played
     * last time for that same panel, so repeat landings stay interesting.
     *
     * Falls back to TTS when there is no sound file or the file fails to load.
     *
     * @param {object} panel   normalised panel from packs.js
     * @param {Function} [onDone]  called when playback finishes (or fails)
     */
    playPanel(panel, onDone) {
        this.stopPanel();
        if (!panel) { if (onDone) onDone(); return; }

        const finish = () => {
            this._panelAudio = null;
            if (this.settings.speakOnLand && panel.ttsText) {
                this.speak(panel.ttsText, false);
            }
            if (onDone) onDone();
        };

        const sounds = panel.sounds || [];
        if (!this.settings.panelEnabled || sounds.length === 0) {
            // No file to play — speak it instead so the panel is never silent.
            if (panel.ttsText) this.speak(panel.ttsText, true);
            if (onDone) onDone();
            return;
        }

        let idx = 0;
        if (sounds.length > 1) {
            do { idx = Math.floor(Math.random() * sounds.length); }
            while (idx === panel._lastVariant);
        }
        panel._lastVariant = idx;

        try {
            const audio = new Audio(sounds[idx]);
            this._panelAudio = audio;
            audio.addEventListener('ended', finish, { once: true });
            audio.addEventListener('error', () => {
                console.warn('[ShownSound] Sound failed to load:', sounds[idx]);
                this._panelAudio = null;
                // A missing file must not mean silence.
                if (panel.ttsText) this.speak(panel.ttsText, true);
                if (onDone) onDone();
            }, { once: true });
            audio.play().catch(() => {
                // Autoplay refusal or decode failure — same fallback.
                this._panelAudio = null;
                if (panel.ttsText) this.speak(panel.ttsText, true);
                if (onDone) onDone();
            });
        } catch (e) {
            if (panel.ttsText) this.speak(panel.ttsText, true);
            if (onDone) onDone();
        }
    }

    stopPanel() {
        if (this._panelAudio) {
            try { this._panelAudio.pause(); this._panelAudio.currentTime = 0; }
            catch (e) { /* ignore */ }
            this._panelAudio = null;
        }
    }

    // ─── TTS (ported from BENNYSFOOTBALL/js/audio.js) ─────────────────────────

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

        const ttsText = (vm && typeof vm.processTextForTTS === 'function')
            ? vm.processTextForTTS(next) : next;
        const u = new SpeechSynthesisUtterance(ttsText);
        u.rate = rate; u.pitch = pitch; u.volume = volume;
        if (voice) u.voice = voice;
        this._speaking = true;
        // Generation counter: a stale onend from a cancelled utterance must not
        // reset _speaking for the new one.
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

    stopSpeech() {
        this._speakQueue = [];
        this._speaking = false;
        try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
}
