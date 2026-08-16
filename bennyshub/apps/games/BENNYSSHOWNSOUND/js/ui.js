// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND - UI
//
// ScanList below is ported VERBATIM from BENNYSFOOTBALL/js/ui.js — do not
// modify it here. This is the hub's convention: the class is duplicated per
// game rather than imported from shared/. Any ShownSound-specific menu
// behaviour belongs in a sibling class, never inside ScanList, or the next
// person to port it upstream silently breaks this game.
// ═══════════════════════════════════════════════════════════════════════════════

class ScanList {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} cfg  { x, y, options:[{label,value,hint}], onSelect, audio,
     *                        title, autoScan, columns, itemW, itemH, gap }
     */
    constructor(scene, cfg) {
        this.scene = scene;
        this.audio = cfg.audio;
        this.options = cfg.options;
        this.onSelect = cfg.onSelect;
        this.index = -1;   // nothing highlighted until first manual advance or delay
        this.active = true;
        // Respect the shared scan manager: auto-scan only when the user has
        // turned it on (it defaults to OFF for Ben's games). An explicit
        // cfg.autoScan still wins if provided.
        this.autoScan = (cfg.autoScan != null)
            ? cfg.autoScan
            : (window.NarbeScanManager && window.NarbeScanManager.getSettings
                ? !!window.NarbeScanManager.getSettings().autoScan
                : false);
        this.x = cfg.x != null ? cfg.x : W / 2;
        this.y = cfg.y != null ? cfg.y : H / 2;
        this.itemW = cfg.itemW || 300;
        this.itemH = cfg.itemH || 44;
        this.gap = cfg.gap || 10;
        this.columns = cfg.columns || 1;
        this.title = cfg.title || null;
        this.transparent = !!cfg.transparent;
        this.fontSize = cfg.fontSize || '20px';
        this.bestPlayValues = null;   // Set of option values to highlight green

        this.container = scene.add.container(0, 0).setDepth(40);
        this.gfx = scene.add.graphics().setDepth(40);
        this.container.add(this.gfx);
        this.labels = [];

        this._build();
        this._draw();
        // Start at index -1: nothing is highlighted or announced until the user
        // presses Space (or taps) to make their first selection advance.
        // If auto-scan is already enabled, start the timer immediately so the
        // menu advances on its own without requiring an initial manual press.
        this._startTimer();
    }

    getScanInterval() {
        if (window.NarbeScanManager && typeof window.NarbeScanManager.getScanInterval === 'function') {
            return window.NarbeScanManager.getScanInterval();
        }
        return 2200;
    }

    _build() {
        const rows = Math.ceil(this.options.length / this.columns);
        const totalH = rows * this.itemH + (rows - 1) * this.gap;
        this.startY = this.y - totalH / 2;
        const totalW = this.columns * this.itemW + (this.columns - 1) * this.gap;
        this.startX = this.x - totalW / 2;

        if (this.title) {
            this.titleTxt = this.scene.add.text(this.x, this.startY - 40, this.title, {
                fontSize: '26px', fontFamily: 'Arial Black', color: '#FFD700',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(41);
            this.container.add(this.titleTxt);
        }

        this.zones = [];
        this.options.forEach((opt, i) => {
            const col = i % this.columns;
            const row = Math.floor(i / this.columns);
            const cx = this.startX + col * (this.itemW + this.gap) + this.itemW / 2;
            const cy = this.startY + row * (this.itemH + this.gap) + this.itemH / 2;
            const t = this.scene.add.text(cx, cy, opt.label, {
                fontSize: this.fontSize, fontFamily: 'Arial', fontStyle: 'bold', color: '#ffffff',
                wordWrap: { width: this.itemW - 16 }, align: 'center'
            }).setOrigin(0.5).setDepth(41);
            t._cx = cx; t._cy = cy;
            this.labels.push(t);
            this.container.add(t);

            // Invisible click/hover target so the menu works with a mouse too.
            const z = this.scene.add.zone(cx, cy, this.itemW, this.itemH)
                .setOrigin(0.5).setDepth(42).setInteractive({ useHandCursor: true });
            z.on('pointerover', () => {
                if (!this.active || this.index === i) return;
                this.index = i; this._draw();
                if (this.audio) this.audio.play('scan');
                this._announceCurrent(false);
            });
            z.on('pointerdown', () => {
                if (!this.active) return;
                this.index = i; this._draw(); this.select();
            });
            this.zones.push(z);
        });
    }

    _draw() {
        const g = this.gfx;
        g.clear();
        this.labels.forEach((t, i) => {
            const sel  = this.index >= 0 && i === this.index;
            const opt  = this.options[i];
            const isRec = !!(this.bestPlayValues && opt && this.bestPlayValues.has(opt.value));
            const x = t._cx - this.itemW / 2;
            const y = t._cy - this.itemH / 2;
            const r = Math.min(14, this.itemH / 2);
            if (this.transparent) {
                // Only outline the selected item; let whatever is behind show through.
                if (sel) {
                    g.lineStyle(4, 0xFFD54A, 1);
                    g.strokeRoundedRect(x - 3, y - 3, this.itemW + 6, this.itemH + 6, r + 2);
                }
                t.setColor('#ffffff');
                t.setScale(sel ? 1.04 : 1);
                return;
            }
            if (sel) {
                // Gold pill — add a green glow ring when it's also a recommended play.
                g.fillStyle(0xFFD54A, 1);
                g.fillRoundedRect(x, y, this.itemW, this.itemH, r);
                g.lineStyle(isRec ? 3 : 2, isRec ? 0x33ff88 : 0xffffff, 0.95);
                g.strokeRoundedRect(x, y, this.itemW, this.itemH, r);
                if (isRec) {
                    // Outer soft glow ring
                    g.lineStyle(4, 0x33ff88, 0.35);
                    g.strokeRoundedRect(x - 4, y - 4, this.itemW + 8, this.itemH + 8, r + 3);
                }
                t.setColor('#10240f');
                t.setScale(1.05);
            } else if (isRec) {
                // Unselected recommended play: green-tinted pill to draw attention.
                g.fillStyle(0x0d2a0d, 0.95);
                g.fillRoundedRect(x, y, this.itemW, this.itemH, r);
                g.lineStyle(2, 0x33ff88, 0.9);
                g.strokeRoundedRect(x, y, this.itemW, this.itemH, r);
                t.setColor('#a8ffcc');
                t.setScale(1);
            } else {
                // Calm translucent slate pill with a subtle border.
                g.fillStyle(0x12241a, 0.92);
                g.fillRoundedRect(x, y, this.itemW, this.itemH, r);
                g.lineStyle(1.5, 0x57a86a, 0.45);
                g.strokeRoundedRect(x, y, this.itemW, this.itemH, r);
                t.setColor('#dff3e4');
                t.setScale(1);
            }
        });
    }

    _announceCurrent(initial) {
        if (this.index < 0) return;
        const opt = this.options[this.index];
        if (!opt) return;
        const text = opt.speakText != null ? opt.speakText
                   : opt.hint ? opt.label + '. ' + opt.hint
                   : opt.label;
        if (this.audio) this.audio.speak(text, true);
    }

    _startTimer() {
        this._stopTimer();
        // Re-read from the manager live so a settings change is respected
        // whenever this is called (e.g. after resuming from the pause menu).
        if (window.NarbeScanManager && window.NarbeScanManager.getSettings) {
            this.autoScan = !!window.NarbeScanManager.getSettings().autoScan;
        }
        if (!this.autoScan) return;
        this.timer = this.scene.time.addEvent({
            delay: this.getScanInterval(),
            loop: true,
            callback: () => {
                // Live-check on every tick so toggling in the pause settings
                // stops (or starts) scanning without needing to recreate the menu.
                if (window.NarbeScanManager && window.NarbeScanManager.getSettings) {
                    const live = !!window.NarbeScanManager.getSettings().autoScan;
                    if (live !== this.autoScan) {
                        this.autoScan = live;
                        if (!live) { this._stopTimer(); return; }
                    }
                }
                this.next(true);
            }
        });
    }

    _stopTimer() {
        if (this.timer) { this.timer.remove(); this.timer = null; }
    }

    next(fromTimer) {
        if (!this.active) return;
        this.index = this.index < 0 ? 0 : (this.index + 1) % this.options.length;
        this._draw();
        if (this.audio) this.audio.play('scan');
        this._announceCurrent(false);
        if (!fromTimer) this._startTimer(); // reset timer on manual advance
    }

    prev(fromTimer) {
        if (!this.active) return;
        this.index = this.index < 0 ? this.options.length - 1 : (this.index - 1 + this.options.length) % this.options.length;
        this._draw();
        if (this.audio) this.audio.play('scan');
        this._announceCurrent(false);
        if (!fromTimer) this._startTimer();
    }

    select() {
        if (!this.active) return;
        if (this.index < 0) return; // nothing highlighted yet — Enter does nothing
        const opt = this.options[this.index];
        if (this.audio) this.audio.play('select');
        if (this.onSelect) this.onSelect(opt, this.index);
    }

    // Pin all elements to the camera so they stay put during zoom/pan.
    setScrollFactor(f) {
        this.gfx.setScrollFactor(f);
        this.labels.forEach(t => t.setScrollFactor(f));
        if (this.titleTxt) this.titleTxt.setScrollFactor(f);
        if (this.zones) this.zones.forEach(z => z.setScrollFactor(f));
        return this;
    }

    destroy() {
        this.active = false;
        this._stopTimer();
        if (this.zones) this.zones.forEach(z => z.destroy());
        this.gfx.destroy();
        this.labels.forEach(t => t.destroy());
        if (this.titleTxt) this.titleTxt.destroy();
        this.container.destroy();
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// Reveal — the centre-pop.
//
// When the wheel stops, the winning artwork flies out of its sector to the
// middle of the screen at REVEAL.SIZE * R with its title underneath, and the
// wheel dims behind it. Reading a 46px image inside a thin sector is hard; a
// large centred one is not. This is the highest-value accessibility behaviour
// in the game, and it is on by default.
// ═══════════════════════════════════════════════════════════════════════════════

class Reveal {
    constructor(scene) {
        this.scene = scene;
        this.showing = false;
        this.obj = null;
        this.label = null;
        this.card = null;
        this.dim = null;
        // Screen rect of the card, so touch users can be given the same two
        // choices the keyboard has: tap the card to replay, tap off it to go back.
        this.bounds = null;
    }

    /** Is this screen point inside the revealed card? */
    hitTest(x, y) {
        const b = this.bounds;
        if (!this.showing || !b) return false;
        return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    }

    /**
     * @param {Wheel} wheel
     * @param {number} index    winning sector
     * @param {object} panel    normalised panel
     * @param {Function} [onShown]
     */
    show(wheel, index, panel, onShown) {
        this.hide();
        this.showing = true;

        const start = wheel.panelWorldPoint(index);
        const targetSize = WHEEL.R * REVEAL.SIZE;

        // Dim layer between the wheel and the revealed art.
        this.dim = this.scene.add.graphics().setDepth(20).setAlpha(0);
        this.dim.fillStyle(THEME.BG_HEX, 1);
        this.dim.fillRect(0, 0, W, H);
        this.scene.tweens.add({
            targets: this.dim, alpha: REVEAL.DIM, duration: REVEAL.MS, ease: 'Sine.easeOut'
        });

        // ── Caption first, so we can size the card around it ──────────────────
        // The wheel spans y 109..539, so there is no y at which a bare caption
        // avoids overlapping it. Instead of hunting for one, the reveal gets its
        // own card: a solid panel that reads as a separate layer rather than
        // text floating on top of the artwork behind it.
        const caption = panel.title || '';
        if (caption) {
            this.label = this.scene.add.text(0, 0, caption, {
                fontSize: '46px', fontFamily: 'Arial Black', color: THEME.TITLE,
                stroke: '#000', strokeThickness: 7, align: 'center',
                wordWrap: { width: targetSize + 190 }
            }).setOrigin(0.5).setDepth(23).setAlpha(0);
        }

        const capH = this.label ? this.label.height : 0;
        const cardW = Math.max(targetSize + 150,
                               this.label ? this.label.width + 70 : 0);
        const cardH = targetSize + capH + 96;
        const cardY = REVEAL.CARD_Y;
        const artY = cardY - cardH / 2 + 40 + targetSize / 2;

        this.bounds = { x: W / 2 - cardW / 2, y: cardY - cardH / 2, w: cardW, h: cardH };

        // Chunky rounded card with a drop shadow and a pink keyline, so the
        // result reads like a sticker rather than a dialog box.
        this.card = this.scene.add.graphics().setDepth(21).setAlpha(0);
        const cx0 = W / 2 - cardW / 2, cy0 = cardY - cardH / 2;
        this.card.fillStyle(0x000000, 0.40);
        this.card.fillRoundedRect(cx0 + 6, cy0 + 10, cardW, cardH, 38);
        this.card.fillStyle(0x342a78, 1);
        this.card.fillRoundedRect(cx0, cy0, cardW, cardH, 38);
        this.card.fillStyle(0xffffff, 0.07);
        this.card.fillRoundedRect(cx0 + 14, cy0 + 10, cardW - 28, cardH * 0.3, 28);
        this.card.lineStyle(7, cssToHex('#ffd54a'), 1);
        this.card.strokeRoundedRect(cx0, cy0, cardW, cardH, 38);
        this.card.lineStyle(3, cssToHex('#ff8fab'), 0.9);
        this.card.strokeRoundedRect(cx0 + 10, cy0 + 10, cardW - 20, cardH - 20, 30);
        this.scene.tweens.add({
            targets: this.card, alpha: 1, duration: REVEAL.MS * 0.6, ease: 'Sine.easeOut'
        });

        if (this.label) {
            this.label.setPosition(W / 2, cardY + cardH / 2 - 30 - capH / 2);
            this.scene.tweens.add({
                targets: this.label, alpha: 1, duration: REVEAL.MS, delay: 120
            });
        }

        const key = panel._textureKey;
        if (panel.emoji) {
            // Emoji reveal: fly it out of the sector at wheel size, then grow.
            const t = makeEmoji(this.scene, start.x, start.y, panel.emoji, targetSize);
            t.setDepth(22).setRotation(start.rot);
            // makeEmoji already scales the texture down to its display size, so
            // the animation is relative to that base rather than to 1.
            const base = t._baseScale;
            t.setScale(base * ((wheel.artSize() / targetSize) || 0.3));
            this.obj = t;
            this.scene.tweens.add({
                targets: t,
                x: W / 2, y: artY, rotation: 0, scale: base,
                duration: REVEAL.MS, ease: 'Back.easeOut',
                onComplete: () => { this._bob(t); if (onShown) onShown(); }
            });
        } else if (key && this.scene.textures.exists(key)) {
            const img = this.scene.add.image(start.x, start.y, key).setDepth(22);
            const src = this.scene.textures.get(key).getSourceImage();
            const longest = Math.max(src.width || 1, src.height || 1);
            img.setRotation(start.rot);
            img.setScale(wheel.artSize() / longest);
            this.obj = img;

            this.scene.tweens.add({
                targets: img,
                x: W / 2,
                y: artY,
                rotation: 0,
                scale: targetSize / longest,
                duration: REVEAL.MS,
                ease: 'Back.easeOut',
                onComplete: () => { this._bob(img); if (onShown) onShown(); }
            });
        } else {
            // Text-only panel: present the title big in place of artwork.
            const t = this.scene.add.text(W / 2, artY, panel.title || '?', {
                fontSize: '64px', fontFamily: 'Arial Black', color: THEME.TEXT,
                stroke: '#000', strokeThickness: 6, align: 'center',
                wordWrap: { width: targetSize + 100 }
            }).setOrigin(0.5).setDepth(22).setScale(0.4);
            this.obj = t;
            this.scene.tweens.add({
                targets: t, scale: 1, duration: REVEAL.MS, ease: 'Back.easeOut',
                onComplete: () => { if (onShown) onShown(); }
            });
        }
    }

    /**
     * Gentle float once it has landed. Keeps the result feeling alive while the
     * player looks at it, without demanding attention or flashing — which
     * matters when the audience may have visual sensitivities.
     */
    _bob(obj) {
        if (!obj || !this.showing) return;
        this.scene.tweens.add({
            targets: obj,
            y: obj.y - 9,
            duration: 1250,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
    }

    hide() {
        if (!this.showing) return;
        this.showing = false;
        [this.obj, this.label, this.card, this.dim].forEach(o => {
            if (o) { this.scene.tweens.killTweensOf(o); o.destroy(); }
        });
        this.obj = this.label = this.card = this.dim = null;
        this.bounds = null;
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// ScanInput — the single, shared switch-input controller used by every scene.
// Implements the canonical Benny's Hub scheme so all games behave identically:
//   • SPACE tap (press + quick release)  → scan FORWARD
//   • SPACE held ≥ longPress (3s)        → scan BACKWARD, repeating every
//                                          NarbeScanManager scan interval
//   • ENTER tap                          → select / confirm
// Hold-to-charge gestures (passing / kicking) are handled through the optional
// isChargePhase / chargeStart / chargeRelease handlers and use ENTER so that
// SPACE always stays a pure navigation key. All commits happen on key UP and
// OS key-repeat is ignored, so holding a key never machine-guns the menu.
// ═══════════════════════════════════════════════════════════════════════════════
class ScanInput {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} h handlers: forward, backward, select, escape,
     *        isChargePhase, chargeStart, chargeRelease, pause
     */
    constructor(scene, h) {
        this.scene = scene;
        this.h = h || {};
        this.longPress = 3000;   // hold SPACE this long → backward scanning
        this.s = {
            spaceDown: false, spaceTimer: null, backTimer: null, spaceLong: false,
            enterDown: false, aiming: false,
            // Set by _clearSpaceState() (play selected). Blocks any new hold-backward
            // sequence until a genuine keyup arrives, preventing the adaptive-switch
            // "re-fire" bug where the switch sends a fresh keydown (e.repeat=false)
            // while the key is still physically held, re-starting the 3-s timer.
            awaitingSpaceRelease: false
        };
        this._kd = (e) => this._down(e);
        this._ku = (e) => this._up(e);
        window.addEventListener('keydown', this._kd);
        window.addEventListener('keyup', this._ku);

        // If the window loses focus while Space is held the keyup never arrives,
        // leaving spaceDown=true and backTimer running forever. Reset everything
        // on blur or page-hide so the stuck-autoscan bug can't happen.
        this._onBlur = () => this._clearSpaceState();
        window.addEventListener('blur', this._onBlur);
        // visibilitychange covers tab-switching and OS overlays that don't
        // always fire a blur event (e.g. Surface Pro adaptive-switch software).
        this._onHidden = () => { if (document.visibilityState === 'hidden') this._clearSpaceState(); };
        document.addEventListener('visibilitychange', this._onHidden);

        // Phaser keyboard key used for physical cross-check in the backTimer.
        this._spaceKey = (scene.input && scene.input.keyboard)
            ? scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
            : null;

        // Pointer / touch only drives the hold-to-charge gestures. Menu buttons
        // handle their own clicks (see ScanList zones), so a click on empty space
        // never fires an accidental select.
        // Pointer/touch uses isPointerChargePhase (excludes receiver-select phase)
        // so a pan drag during receiver selection doesn't accidentally start a throw.
        this._isPointerCharge = () => {
            if (this.h.isPointerChargePhase) return !!this.h.isPointerChargePhase();
            return this._isCharge();
        };
        this._pd = () => { if (this._isPointerCharge()) this._chargeStart(); };
        this._pu = () => { if (this._isPointerCharge()) this._chargeRelease(); };
        scene.input.on('pointerdown', this._pd);
        scene.input.on('pointerup', this._pu);

        scene.events.once('shutdown', () => this.destroy());
        scene.events.once('destroy', () => this.destroy());
    }

    // Reset all Space-related state. Called on window blur (missed keyup guard)
    // AND after every play selection. Sets awaitingSpaceRelease so that any
    // adaptive-switch keydown still in flight is ignored until a real keyup lands.
    _clearSpaceState() {
        if (this.s.spaceTimer) { clearTimeout(this.s.spaceTimer); this.s.spaceTimer = null; }
        if (this.s.backTimer)  { clearInterval(this.s.backTimer);  this.s.backTimer  = null; }
        this.s.spaceDown = false;
        this.s.spaceLong = false;
        this.s.aiming    = false;
        this.s.awaitingSpaceRelease = true;
    }

    _interval() {
        return (window.NarbeScanManager && window.NarbeScanManager.getScanInterval)
            ? window.NarbeScanManager.getScanInterval() : 2000;
    }
    _isCharge() { return !!(this.h.isChargePhase && this.h.isChargePhase()); }
    _chargeStart() { if (this.h.chargeStart) this.h.chargeStart(); }
    _chargeRelease() { if (this.h.chargeRelease) this.h.chargeRelease(); }
    _isAim() { return !!(this.h.isAimPhase && this.h.isAimPhase()); }

    _down(e) {
        if (e.repeat) return;
        if (e.code === 'Space') {
            e.preventDefault();
            // During an aiming phase: flip direction and start sweeping on
            // each new press; stop on release. Matches P3GL aim behaviour.
            if (this._isAim()) {
                // Cancel any pending non-aim scan state that may have leaked
                // through a phase transition while Space was held (adaptive
                // switches can fire a fresh keydown without e.repeat=true).
                if (this.s.spaceTimer) { clearTimeout(this.s.spaceTimer); this.s.spaceTimer = null; }
                if (this.s.backTimer)  { clearInterval(this.s.backTimer);  this.s.backTimer  = null; }
                this.s.spaceDown = false; this.s.spaceLong = false;
                if (this.s.aiming) return; // already in aim — ignore
                this.s.aiming = true;
                if (this.h.aimStart) this.h.aimStart();
                return;
            }
            // If a play was just selected, ignore Space until the key is physically
            // released (keyup clears awaitingSpaceRelease). This prevents the adaptive-
            // switch from re-firing a non-repeat keydown with the key still held.
            if (this.s.awaitingSpaceRelease) return;
            if (this.s.spaceDown || this.s.spaceTimer || this.s.backTimer) return;
            this.s.spaceDown = true; this.s.spaceLong = false;
            this.s.spaceTimer = setTimeout(() => {
                this.s.spaceLong = true;
                if (this.h.backward) this.h.backward();
                this.s.backTimer = setInterval(() => {
                    // Cross-check Phaser's physical key state so a missed keyup
                    // (window blur, focus switch, etc.) doesn't keep this running
                    // when autoScan is off and Space isn't actually held.
                    // Default to false (stop) when _spaceKey is unavailable so
                    // a missing Phaser key reference never keeps the timer alive.
                    const physicallyDown = !!(this._spaceKey && this._spaceKey.isDown);
                    if (this.s.spaceDown && physicallyDown) { if (this.h.backward) this.h.backward(); }
                    else { this.s.spaceDown = false; clearInterval(this.s.backTimer); this.s.backTimer = null; }
                }, this._interval());
                this.s.spaceTimer = null;
            }, this.longPress);
        } else if (e.code === 'Enter') {
            e.preventDefault();
            if (this.s.enterDown) return;
            this.s.enterDown = true; this.s.enterLong = false;
            if (this._isCharge()) {
                this._chargeStart();
            }
        } else if (e.code === 'Escape') {
            if (this.h.escape) this.h.escape();
        }
    }

    _up(e) {
        if (e.code === 'Space') {
            e.preventDefault();
            // A genuine keyup means the key was released — unblock future presses.
            this.s.awaitingSpaceRelease = false;
            // Capture state BEFORE clearing so we know what to fire.
            const wasAiming   = this.s.aiming;
            const wasShortNav = this.s.spaceDown && !this.s.spaceLong;
            // Unconditionally clear ALL space state on every keyup.
            // This is the primary defence against stuck backTimers: it works
            // regardless of how the state got into an inconsistent condition
            // (phase transitions during adaptive-switch long-holds, missed
            // keyups from focus loss, etc.).
            this.s.aiming    = false;
            this.s.spaceDown = false;
            this.s.spaceLong = false;
            if (this.s.spaceTimer) { clearTimeout(this.s.spaceTimer); this.s.spaceTimer = null; }
            if (this.s.backTimer)  { clearInterval(this.s.backTimer);  this.s.backTimer  = null; }
            // Fire the appropriate callback.
            if (wasAiming && this.h.aimStop) this.h.aimStop();
            else if (wasShortNav && this.h.forward) this.h.forward();
            return;
        }
        if (e.code === 'Enter' && this.s.enterDown) {
            e.preventDefault();
            this.s.enterDown = false;
            if (this._isCharge()) this._chargeRelease();
            else if (this.h.select) this.h.select();
        }
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        window.removeEventListener('keydown', this._kd);
        window.removeEventListener('keyup', this._ku);
        window.removeEventListener('blur', this._onBlur);
        document.removeEventListener('visibilitychange', this._onHidden);
        if (this.s.spaceTimer) clearTimeout(this.s.spaceTimer);
        if (this.s.backTimer) clearInterval(this.s.backTimer);
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// FunScanList — the candy-coloured button style.
//
// ScanList itself is a verbatim port and must stay byte-identical (see the
// header). Its Football palette is muted olive-green, which reads serious next
// to a fairground wheel. So the look is changed the sanctioned way: a subclass
// that overrides _draw() only. All the scanning behaviour, timers, TTS and
// mouse handling are inherited untouched.
// ═══════════════════════════════════════════════════════════════════════════════

class FunScanList extends ScanList {
    _draw() {
        const g = this.gfx;
        g.clear();
        this.labels.forEach((t, i) => {
            const sel = this.index >= 0 && i === this.index;
            const x = t._cx - this.itemW / 2;
            const y = t._cy - this.itemH / 2;
            const r = Math.min(this.itemH / 2, 22);   // full pill, not a soft rect

            if (this.transparent && !sel) { t.setColor('#ffffff'); t.setScale(1); return; }

            if (sel) {
                // Chunky drop shadow + bright fill + thick outline. The scale
                // bump is bigger than the stock list's so the highlight is
                // obvious from across a room.
                g.fillStyle(0x000000, 0.35);
                g.fillRoundedRect(x + 3, y + 5, this.itemW, this.itemH, r);
                g.fillStyle(THEME.BTN_SEL_FILL, 1);
                g.fillRoundedRect(x, y, this.itemW, this.itemH, r);
                g.lineStyle(4, THEME.BTN_SEL_EDGE, 1);
                g.strokeRoundedRect(x, y, this.itemW, this.itemH, r);
                // Glossy top highlight.
                g.fillStyle(0xffffff, 0.30);
                g.fillRoundedRect(x + 8, y + 5, this.itemW - 16, this.itemH * 0.34, r * 0.7);
                t.setColor(THEME.BTN_SEL_TEXT);
                t.setScale(1.10);
            } else {
                g.fillStyle(0x000000, 0.28);
                g.fillRoundedRect(x + 2, y + 4, this.itemW, this.itemH, r);
                g.fillStyle(THEME.BTN_FILL, 1);
                g.fillRoundedRect(x, y, this.itemW, this.itemH, r);
                g.lineStyle(3, THEME.BTN_EDGE, 1);
                g.strokeRoundedRect(x, y, this.itemW, this.itemH, r);
                g.fillStyle(0xffffff, 0.10);
                g.fillRoundedRect(x + 8, y + 4, this.itemW - 16, this.itemH * 0.30, r * 0.7);
                t.setColor(THEME.BTN_TEXT);
                t.setScale(1);
            }
        });
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// Party — confetti and sparkles for the landing celebration.
//
// One shared 1x1 white texture, tinted per particle, so the whole effect costs
// a single texture and one emitter rather than dozens of game objects.
// ═══════════════════════════════════════════════════════════════════════════════

class Party {
    constructor(scene) {
        this.scene = scene;
        this.key = 'ss_party_dot';
        if (!scene.textures.exists(this.key)) {
            const tex = scene.textures.createCanvas(this.key, 12, 12);
            const ctx = tex.getContext();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 12, 12);
            tex.refresh();
        }
    }

    /** Confetti burst centred on (x, y). */
    burst(x, y, count) {
        try {
            const em = this.scene.add.particles(0, 0, this.key, {
                lifespan: { min: 900, max: 1700 },
                speed: { min: 180, max: 520 },
                angle: { min: 190, max: 350 },      // upward fan
                gravityY: 700,
                scale: { min: 0.35, max: 1.0 },
                rotate: { min: -220, max: 220 },
                alpha: { start: 1, end: 0.25 },
                tint: PARTY,
                emitting: false
            }).setDepth(60);
            em.explode(count || 55, x, y);
            // Emitters are one-shot here; clean up once the longest life ends.
            this.scene.time.delayedCall(2200, () => em.destroy());
        } catch (e) {
            // Particles are pure decoration — never let them break a spin.
            console.warn('[ShowNSound] confetti unavailable', e);
        }
    }
}
