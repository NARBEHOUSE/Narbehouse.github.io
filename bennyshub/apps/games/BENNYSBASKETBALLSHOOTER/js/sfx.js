// Sample-based sound effects for Benny's Basketball Shooter.
// Clips are decoded into Web Audio buffers so overlapping impacts play instantly.
// Several takes of the same sound are picked at random so repeats never sound identical.
(function () {
    const FILES = {
        swish: ['swish1', 'swish2', 'swish3'],
        rim: ['rim1', 'rim2', 'rim3'],
        backboard: ['backboard1', 'backboard2'],
        bounce: ['bounce1', 'bounce2', 'bounce3'],
        cheer: ['cheer'],
        applause: ['applause'],
        ooh: ['ooh'],
        groan: ['groan1', 'groan2'],
        buzzer: ['buzzer'],
        whistle: ['whistle'],
        dribble: ['dribble'],
        ambience: ['crowd-ambience']
    };

    const SFX = {
        ctx: null,
        buffers: {},
        master: null,
        ambienceSource: null,
        ambienceGain: null,
        enabled: true,
        lastPlayed: {},
        LEVEL: 0.22,        // master level; kept well under the TTS voice
        AMBIENCE: 0.09,     // crowd bed level between plays (a quiet bed under the TTS)

        attach(ctx) {
            if (this.ctx === ctx) return;
            this.ctx = ctx;
            this.master = ctx.createGain();
            this.master.gain.value = this.LEVEL;
            this.master.connect(ctx.destination);
            this.load();
        },

        load() {
            Object.entries(FILES).forEach(([name, takes]) => {
                this.buffers[name] = [];
                takes.forEach(file => {
                    fetch('sounds/' + file + '.mp3')
                        .then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
                        .then(data => new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail)))
                        .then(buf => {
                            this.buffers[name].push(buf);
                            if (name === 'ambience' && this.wantAmbience) this.startAmbience();
                        })
                        .catch(() => { /* a missing clip just stays silent */ });
                });
            });
        },

        // volume 0..1, rate = playback speed (pitch), minGap = seconds before the same sound may repeat
        play(name, volume = 1, { rate = 1, minGap = 0.05, pan = 0 } = {}) {
            if (!this.enabled || !this.ctx || !this.buffers[name] || !this.buffers[name].length) return;
            const now = this.ctx.currentTime;
            if (this.lastPlayed[name] && now - this.lastPlayed[name] < minGap) return;
            this.lastPlayed[name] = now;
            const takes = this.buffers[name];
            const src = this.ctx.createBufferSource();
            src.buffer = takes[Math.floor(Math.random() * takes.length)];
            src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
            const gain = this.ctx.createGain();
            gain.gain.value = Math.max(0, Math.min(1.5, volume));
            let node = src.connect(gain);
            if (this.ctx.createStereoPanner && pan) {
                const p = this.ctx.createStereoPanner();
                p.pan.value = Math.max(-1, Math.min(1, pan));
                node = node.connect(p);
            }
            node.connect(this.master);
            src.start();
        },

        startAmbience() {
            this.wantAmbience = true;
            if (!this.enabled || !this.ctx || this.ambienceSource || !this.buffers.ambience || !this.buffers.ambience.length) return;
            const src = this.ctx.createBufferSource();
            src.buffer = this.buffers.ambience[0];
            src.loop = true;
            this.ambienceGain = this.ctx.createGain();
            this.ambienceGain.gain.value = 0;
            this.ambienceGain.gain.linearRampToValueAtTime(this.AMBIENCE, this.ctx.currentTime + 1.5);
            src.connect(this.ambienceGain).connect(this.master);
            src.start();
            this.ambienceSource = src;
        },

        stopAmbience() {
            this.wantAmbience = false;
            if (!this.ambienceSource) return;
            try { this.ambienceSource.stop(); } catch (e) { /* already stopped */ }
            this.ambienceSource = null;
        },

        // Crowd swells briefly (e.g. while a long shot is in the air)
        swellAmbience(level, seconds) {
            if (!this.ambienceGain || !this.ctx) return;
            const g = this.ambienceGain.gain, t = this.ctx.currentTime;
            g.cancelScheduledValues(t);
            g.setValueAtTime(g.value, t);
            g.linearRampToValueAtTime(level, t + 0.3);
            g.linearRampToValueAtTime(this.AMBIENCE, t + seconds);
        },

        // Pull the effects down while the TTS voice is talking so every word is clear
        duck(on) {
            if (!this.master || !this.ctx) return;
            const g = this.master.gain, t = this.ctx.currentTime;
            g.cancelScheduledValues(t);
            g.setValueAtTime(g.value, t);
            g.setTargetAtTime(on ? this.LEVEL * 0.45 : this.LEVEL, t, on ? 0.06 : 0.35);
        },

        setEnabled(on) {
            this.enabled = on;
            if (!on) this.stopAmbience();
            else if (this.wantAmbience !== false) this.startAmbience();
        }
    };

    window.BB = window.BB || {};
    window.BB.SFX = SFX;
})();
