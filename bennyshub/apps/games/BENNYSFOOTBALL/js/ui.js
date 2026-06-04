// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S FOOTBALL - Accessible Scan Menu
// A reusable list that highlights one option at a time. It auto-advances on a
// timer (interval taken from NarbeScanManager when present) and announces each
// option via TTS. SPACE / RIGHT advances manually, ENTER selects.
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
        let text = opt.label;
        if (opt.hint) text += '. ' + opt.hint;
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
// PlayDiagram — draws a small "playbook" sketch above the play-call menu bar
// whenever a play is highlighted. Supports both offensive and defensive plays.
// ═══════════════════════════════════════════════════════════════════════════════
class PlayDiagram {
    /**
     * @param {Phaser.Scene} scene
     * @param {string[]} playValues  e.g. ['INSIDE_RUN','OUTSIDE_RUN',...]
     */
    constructor(scene, playValues) {
        this.scene = scene;
        this.playValues = playValues;
        this.gfx = scene.add.graphics().setDepth(50).setScrollFactor(0);
        this.visible = false;
        this._cardW = 130;
        this._cardH = 106;
    }

    /** Show the diagram for the given play index above the given item center-x. */
    show(index, itemCX) {
        this.gfx.clear();
        const v = this.playValues[index];
        if (!v || v === 'PAUSE') { this.visible = false; return; }
        this.visible = true;

        const cw = this._cardW, ch = this._cardH;
        // Position the card just above the play bar, centred on the item.
        const cx = Phaser.Math.Clamp(itemCX, cw / 2 + 8, W - cw / 2 - 8);
        const cy = 504 - ch / 2 - 10;
        const x = cx - cw / 2, y = cy - ch / 2;

        const g = this.gfx;

        // ── Notebook card background (cream) ──────────────────────────────────
        g.fillStyle(0xf5f0dc, 1);
        g.fillRoundedRect(x, y, cw, ch, 7);

        // Spiral-notebook left margin line (red).
        g.lineStyle(1.5, 0xdd4444, 0.7);
        g.lineBetween(x + 18, y + 4, x + 18, y + ch - 5);

        // Faint horizontal rules (blue).
        g.lineStyle(0.8, 0x7ab4e0, 0.45);
        for (let row = 1; row <= 5; row++) {
            const ry = y + 4 + row * ((ch - 9) / 6);
            g.lineBetween(x + 20, ry, x + cw - 6, ry);
        }

        // Card border (grey).
        g.lineStyle(2, 0x888877, 0.9);
        g.strokeRoundedRect(x, y, cw, ch, 7);

        // ── Diagram area ──────────────────────────────────────────────────────
        const diagTop = y + 8;
        const diagBot = y + ch - 7;
        const diagH   = diagBot - diagTop;
        const ox = cx + 5;            // shifted right to clear margin line
        const oy = (diagTop + diagBot) / 2;
        this._drawPlay(v, g, ox, oy, cw - 26, diagH);
    }

    hide() {
        this.gfx.clear();
        this.visible = false;
    }

    destroy() {
        this.gfx.destroy();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Individual play diagrams. All coordinates are relative to the diagram's
    // centre (ox, oy). dw/dh are the usable drawing area width/height.
    // Symbols: filled circle = ball carrier / key player; open circle = blocker;
    // square = QB behind center; dashed / solid lines = routes; arrow = run path.
    // ─────────────────────────────────────────────────────────────────────────
    _drawPlay(value, g, ox, oy, dw, dh) {
        const s = dh / 110;        // scale factor

        // Helper: draw an arrow tip at (ax,ay) pointing in direction (dx,dy).
        const arrow = (ax, ay, dx, dy, len = 7 * s) => {
            const angle = Math.atan2(dy, dx);
            const a1 = angle + 2.4, a2 = angle - 2.4;
            g.lineBetween(ax, ay, ax + Math.cos(a1) * len, ay + Math.sin(a1) * len);
            g.lineBetween(ax, ay, ax + Math.cos(a2) * len, ay + Math.sin(a2) * len);
        };
        // Helper: dashed line.
        const dash = (x1, y1, x2, y2, seg = 5 * s) => {
            const dx = x2 - x1, dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.floor(dist / (seg * 2));
            for (let i = 0; i <= steps; i++) {
                const t0 = (i * 2 * seg) / dist, t1 = Math.min(((i * 2 + 1) * seg) / dist, 1);
                g.lineBetween(x1 + dx * t0, y1 + dy * t0, x1 + dx * t1, y1 + dy * t1);
            }
        };

        // ── Shared offense line ───────────────────────────────────────────────
        // 5 OL squares along a scrimmage line, centred at (ox, losY).
        const losY = oy + 18 * s;
        const drawOL = () => {
            g.lineStyle(1.5, 0x333322, 1);
            g.fillStyle(0x333322, 1);
            const sq = 7 * s;
            for (let i = -2; i <= 2; i++) {
                const bx = ox + i * 12 * s - sq / 2;
                g.fillRect(bx, losY - sq / 2, sq, sq);
            }
            // QB directly behind center.
            g.fillStyle(0x225588, 1);
            g.fillCircle(ox, losY + 14 * s, 5 * s);
        };

        // ── LOS dashed line ───────────────────────────────────────────────────
        const drawLOS = () => {
            g.lineStyle(1, 0xaaaaaa, 0.6);
            dash(ox - dw / 2, losY, ox + dw / 2, losY);
        };

        switch (value) {
            case 'INSIDE_RUN': {
                // Straight up-the-middle run. OL block inward, RB goes straight.
                drawLOS(); drawOL();
                const rbY = losY + 24 * s;
                // RB (orange circle below QB).
                g.fillStyle(0xff8822, 1); g.fillCircle(ox, rbY, 5 * s);
                // Run path: straight up between guards.
                g.lineStyle(2.5, 0xff8822, 1);
                g.lineBetween(ox, rbY, ox, losY - 24 * s);
                arrow(ox, losY - 24 * s, 0, -1);
                // OL block arrows (inner guards push in).
                g.lineStyle(1.5, 0x333322, 1);
                [[-12, -6], [12, 6]].forEach(([fx, tx]) => {
                    g.lineBetween(ox + fx * s, losY, ox + tx * s, losY - 10 * s);
                    arrow(ox + tx * s, losY - 10 * s, tx - fx > 0 ? 1 : -1, -1);
                });
                break;
            }
            case 'OUTSIDE_RUN': {
                // Sweep to the right edge. OL pulls, RB sweeps wide.
                drawLOS(); drawOL();
                const rbY = losY + 24 * s;
                g.fillStyle(0xff8822, 1); g.fillCircle(ox + 6 * s, rbY, 5 * s);
                // Curved sweep path to the right then upfield.
                g.lineStyle(2.5, 0xff8822, 1);
                g.lineBetween(ox + 6 * s, rbY, ox + 34 * s, losY + 4 * s);
                g.lineBetween(ox + 34 * s, losY + 4 * s, ox + 38 * s, losY - 26 * s);
                arrow(ox + 38 * s, losY - 26 * s, 0.1, -1);
                // Right OL pulls out (lead blocker).
                g.lineStyle(1.5, 0x333322, 1);
                g.lineBetween(ox + 24 * s, losY, ox + 36 * s, losY - 8 * s);
                arrow(ox + 36 * s, losY - 8 * s, 1, -0.5);
                // WR (right) blocks downfield.
                g.fillStyle(0x888844, 1); g.fillCircle(ox + 45 * s, losY - 4 * s, 4 * s);
                break;
            }
            case 'SHORT_PASS': {
                // Short passing tree. Two receivers break to flats, one goes slant.
                drawLOS(); drawOL();
                // QB.
                g.fillStyle(0x225588, 1); g.fillCircle(ox, losY + 14 * s, 5 * s);
                // WR left — curl route.
                const wlx = ox - 42 * s, wly = losY;
                g.fillStyle(0x44aa44, 1); g.fillCircle(wlx, wly, 4 * s);
                g.lineStyle(1.8, 0x44aa44, 1);
                g.lineBetween(wlx, wly, wlx, wly - 16 * s);
                g.lineBetween(wlx, wly - 16 * s, wlx + 10 * s, wly - 16 * s);
                arrow(wlx + 10 * s, wly - 16 * s, 1, 0);
                // WR right — out/flat route.
                const wrx = ox + 42 * s, wry = losY;
                g.fillStyle(0x44aa44, 1); g.fillCircle(wrx, wry, 4 * s);
                g.lineBetween(wrx, wry, wrx, wry - 12 * s);
                g.lineBetween(wrx, wry - 12 * s, wrx + 12 * s, wry - 12 * s);
                arrow(wrx + 12 * s, wry - 12 * s, 1, 0);
                // TE — crossing slant.
                const tex = ox + 16 * s, tey = losY;
                g.fillStyle(0x8844aa, 1); g.fillCircle(tex, tey, 4 * s);
                g.lineBetween(tex, tey, tex - 18 * s, tey - 20 * s);
                arrow(tex - 18 * s, tey - 20 * s, -1, -1);
                // QB pass arc (dashed).
                g.lineStyle(1.5, 0x225588, 0.85);
                dash(ox, losY + 8 * s, tex - 18 * s, tey - 20 * s);
                break;
            }
            case 'LONG_PASS': {
                // Deep routes. Two WRs go deep, TE stays mid.
                drawLOS(); drawOL();
                g.fillStyle(0x225588, 1); g.fillCircle(ox, losY + 14 * s, 5 * s);
                // WR left — fly route (straight deep).
                const wlx = ox - 42 * s, wly = losY;
                g.fillStyle(0x44aa44, 1); g.fillCircle(wlx, wly, 4 * s);
                g.lineStyle(1.8, 0x44aa44, 1);
                g.lineBetween(wlx, wly, wlx, wly - 42 * s);
                arrow(wlx, wly - 42 * s, 0, -1);
                // WR right — post route (in at 45°).
                const wrx = ox + 42 * s, wry = losY;
                g.fillStyle(0x44aa44, 1); g.fillCircle(wrx, wry, 4 * s);
                g.lineBetween(wrx, wry, wrx, wry - 22 * s);
                g.lineBetween(wrx, wry - 22 * s, wrx - 20 * s, wry - 42 * s);
                arrow(wrx - 20 * s, wry - 42 * s, -1, -1);
                // TE — deep cross.
                const tex = ox + 16 * s, tey = losY;
                g.fillStyle(0x8844aa, 1); g.fillCircle(tex, tey, 4 * s);
                g.lineStyle(1.8, 0x8844aa, 1);
                g.lineBetween(tex, tey, tex - 36 * s, tey - 30 * s);
                arrow(tex - 36 * s, tey - 30 * s, -1, -0.8);
                // Deep pass arc (dashed).
                g.lineStyle(1.5, 0x225588, 0.85);
                dash(ox, losY + 8 * s, wlx, wly - 42 * s);
                break;
            }
            case 'FIELD_GOAL': {
                // Ball on tee, uprights ahead, kicker's foot line.
                const ballY = oy + 28 * s;
                const postX = ox + 28 * s, postBotY = oy - 18 * s, postTopY = oy - 44 * s;
                // Uprights.
                g.lineStyle(2, 0x225588, 1);
                g.lineBetween(postX, postBotY, postX, postTopY);          // center post
                g.lineBetween(postX - 14 * s, postTopY, postX + 14 * s, postTopY); // crossbar (top)
                g.lineBetween(postX - 14 * s, postTopY, postX - 14 * s, postTopY + 10 * s);
                g.lineBetween(postX + 14 * s, postTopY, postX + 14 * s, postTopY + 10 * s);
                // Ball on the ground.
                g.lineStyle(1.5, 0x8b5e3c, 1); g.fillStyle(0x8b5e3c, 1);
                g.fillEllipse(ox - 20 * s, ballY, 10 * s, 7 * s);
                // Kick trajectory arc (solid + arrow).
                g.lineStyle(2, 0xff8822, 1);
                // Simple curve: two lines approximating an arc.
                g.lineBetween(ox - 20 * s, ballY, ox, oy - 10 * s);
                g.lineBetween(ox, oy - 10 * s, postX, postTopY + 12 * s);
                arrow(postX, postTopY + 12 * s, 0.9, -0.7);
                // Kicker position (small circle to the side).
                g.fillStyle(0x333322, 1); g.fillCircle(ox - 28 * s, ballY - 4 * s, 4 * s);
                // LOS scrimmage line.
                g.lineStyle(1, 0xaaaaaa, 0.5);
                dash(ox - dw / 2, oy + 10 * s, ox + dw / 2, oy + 10 * s);
                break;
            }
            case 'PUNT': {
                // Long snap, punter kicks deep. Long arc with arrow.
                const punterY = oy + 32 * s;
                const targetX = ox + 44 * s, targetY = oy - 36 * s;
                // OL / long snap line.
                g.lineStyle(1.5, 0x333322, 1);
                g.fillStyle(0x333322, 1);
                const sq = 6 * s;
                for (let i = -2; i <= 2; i++) {
                    const bx = ox + i * 10 * s - sq / 2;
                    g.fillRect(bx, oy, sq, sq);
                }
                // Snap line (dotted from center to punter).
                g.lineStyle(1.5, 0x8b5e3c, 0.9);
                dash(ox, oy + sq, ox, punterY);
                // Punter.
                g.fillStyle(0x225588, 1); g.fillCircle(ox, punterY, 5 * s);
                // High-arc punt trajectory.
                g.lineStyle(2, 0xff8822, 1);
                const midPX = ox + 20 * s, midPY = oy - 50 * s;
                g.lineBetween(ox, punterY, midPX, midPY);
                g.lineBetween(midPX, midPY, targetX, targetY);
                arrow(targetX, targetY, 0.7, 0.8);
                // Ball (oval at punter foot).
                g.fillStyle(0x8b5e3c, 1); g.fillEllipse(ox + 4 * s, punterY - 8 * s, 8 * s, 6 * s);
                // LOS.
                g.lineStyle(1, 0xaaaaaa, 0.5);
                dash(ox - dw / 2, oy + 2 * s, ox + dw / 2, oy + 2 * s);
                break;
            }

            // ── DEFENSIVE PLAYS ───────────────────────────────────────────────
            // All defensive diagrams are drawn from the defense's perspective:
            // the top of the card is downfield (toward the offense); the LOS is
            // in the lower half of the diagram. Symbols: filled squares = DL;
            // filled circles = LBs; open circles = DBs/CBs/S.

            case 'STOP_RUN': {
                // 8-man box: stack 5 DL + 3 LBs tightly around the run gaps,
                // only 2 DBs back. Multiple gap-fill arrows converge on the middle.
                const losY = oy + 22 * s;
                // DL line (5 squares, tight spacing to fill gaps).
                g.fillStyle(0xcc3322, 1); g.lineStyle(1, 0xcc3322, 1);
                const dsq = 7 * s;
                for (let i = -2; i <= 2; i++) {
                    g.fillRect(ox + i * 11 * s - dsq / 2, losY - dsq / 2, dsq, dsq);
                }
                // LBs just behind (tight, filling B/A gaps).
                g.fillStyle(0xdd6622, 1);
                [-16, 0, 16].forEach(dx => g.fillCircle(ox + dx * s, losY + 14 * s, 4.5 * s));
                // 2 CBs/DBs wide and deeper.
                g.lineStyle(1.5, 0x4488cc, 1); g.fillStyle(0x000000, 0);
                [-34, 34].forEach(dx => {
                    g.strokeCircle(ox + dx * s, losY + 26 * s, 4 * s);
                });
                // Rush arrows: all 5 DL + 3 LBs driving forward into gaps.
                g.lineStyle(2, 0xcc3322, 1);
                [-2, -1, 0, 1, 2].forEach(i => {
                    const bx = ox + i * 11 * s;
                    g.lineBetween(bx, losY - dsq / 2, bx, losY - 22 * s);
                    arrow(bx, losY - 22 * s, 0, -1);
                });
                g.lineStyle(1.5, 0xdd6622, 1);
                [-16, 0, 16].forEach(dx => {
                    g.lineBetween(ox + dx * s, losY + 9 * s, ox + dx * s, losY - 12 * s);
                    arrow(ox + dx * s, losY - 12 * s, 0, -1);
                });
                // LOS.
                g.lineStyle(1, 0xaaaaaa, 0.5);
                dash(ox - dw / 2, losY, ox + dw / 2, losY);
                break;
            }

            case 'DEFEND_PASS': {
                // Cover-2 zone: 4 DL hold the line, 3 LBs in intermediate zones,
                // 2 CBs on the outside, 2 safeties deep. Curved zone areas shown.
                const losY = oy + 30 * s;
                // 4 DL squares.
                g.fillStyle(0xcc3322, 1);
                const dsq2 = 6 * s;
                [-1.5, -0.5, 0.5, 1.5].forEach(i => {
                    g.fillRect(ox + i * 12 * s - dsq2 / 2, losY - dsq2 / 2, dsq2, dsq2);
                });
                // 3 LBs in hook/curl zones (medium depth).
                g.fillStyle(0xdd6622, 1);
                [-18, 0, 18].forEach(dx => g.fillCircle(ox + dx * s, losY + 13 * s, 4 * s));
                // 2 CBs on the flats (outside).
                g.lineStyle(1.5, 0x4488cc, 1); g.fillStyle(0x000000, 0);
                [-38, 38].forEach(dx => g.strokeCircle(ox + dx * s, losY + 8 * s, 4 * s));
                // 2 Safeties deep in post/seam positions.
                [-18, 18].forEach(dx => g.strokeCircle(ox + dx * s, losY - 28 * s, 4 * s));
                // Zone arcs (soft curved coverage areas).
                g.lineStyle(1.2, 0x4488cc, 0.5);
                // Left flat zone arc.
                g.beginPath();
                g.arc(ox - 28 * s, losY + 8 * s, 16 * s, Math.PI * 0.8, Math.PI * 1.6, false);
                g.strokePath();
                // Right flat zone arc.
                g.beginPath();
                g.arc(ox + 28 * s, losY + 8 * s, 16 * s, Math.PI * (-0.6), Math.PI * 0.2, false);
                g.strokePath();
                // Deep half arcs.
                g.lineStyle(1, 0x4488cc, 0.35);
                [-18, 18].forEach(dx => {
                    g.beginPath();
                    g.arc(ox + dx * s, losY - 28 * s, 18 * s, Math.PI * 1.1, Math.PI * 1.9, false);
                    g.strokePath();
                });
                // LOS.
                g.lineStyle(1, 0xaaaaaa, 0.5);
                dash(ox - dw / 2, losY, ox + dw / 2, losY);
                break;
            }

            case 'BLITZ': {
                // All-out blitz: 4 DL + 2 LBs converge on the QB from multiple
                // angles. Only 2 DBs still in coverage (risk / reward).
                const losY = oy + 22 * s;
                // 4 DL squares.
                g.fillStyle(0xcc3322, 1);
                const bsq = 6 * s;
                [-1.5, -0.5, 0.5, 1.5].forEach(i => {
                    g.fillRect(ox + i * 12 * s - bsq / 2, losY - bsq / 2, bsq, bsq);
                });
                // 2 Outside LBs (blitzing from the edges).
                g.fillStyle(0xdd6622, 1);
                [-28, 28].forEach(dx => g.fillCircle(ox + dx * s, losY + 4 * s, 4.5 * s));
                // 1 Middle LB (staying).
                g.fillStyle(0xdd8833, 1);
                g.fillCircle(ox, losY + 14 * s, 4 * s);
                // 2 DBs still in zone coverage.
                g.lineStyle(1.5, 0x4488cc, 1); g.fillStyle(0x000000, 0);
                [-22, 22].forEach(dx => g.strokeCircle(ox + dx * s, losY - 28 * s, 4 * s));
                // Blitz rush arrows – aggressive diagonal convergence on QB spot.
                const qbX = ox, qbY = losY - 30 * s;
                g.lineStyle(2.2, 0xff3300, 1);
                // DL straight-ahead rush.
                [-1.5, -0.5, 0.5, 1.5].forEach(i => {
                    const bx = ox + i * 12 * s;
                    g.lineBetween(bx, losY - bsq / 2, bx, losY - 26 * s);
                    arrow(bx, losY - 26 * s, 0, -1);
                });
                // OLB blitz arcs from the edge.
                g.lineStyle(2.2, 0xff6600, 1);
                [[-28, -8], [28, 8]].forEach(([startX, endX]) => {
                    g.lineBetween(ox + startX * s, losY, ox + endX * s, losY - 28 * s);
                    arrow(ox + endX * s, losY - 28 * s, endX > 0 ? -0.5 : 0.5, -1);
                });
                // LOS.
                g.lineStyle(1, 0xaaaaaa, 0.5);
                dash(ox - dw / 2, losY, ox + dw / 2, losY);
                break;
            }

            case 'BALANCED': {
                // 4-3 base defense: 4 DL, 3 LBs, 2 CBs, 2 safeties.
                // Each has a mild zone/contain assignment, no dramatic arrows.
                const losY = oy + 22 * s;
                // 4 DL.
                g.fillStyle(0xcc3322, 1);
                const basq = 6 * s;
                [-1.5, -0.5, 0.5, 1.5].forEach(i => {
                    g.fillRect(ox + i * 12 * s - basq / 2, losY - basq / 2, basq, basq);
                });
                // 3 LBs.
                g.fillStyle(0xdd6622, 1);
                [-16, 0, 16].forEach(dx => g.fillCircle(ox + dx * s, losY + 14 * s, 4 * s));
                // 2 CBs outside.
                g.lineStyle(1.5, 0x4488cc, 1); g.fillStyle(0x000000, 0);
                [-36, 36].forEach(dx => g.strokeCircle(ox + dx * s, losY + 5 * s, 4 * s));
                // 2 Safeties (one FS deep, one SS in the box/intermediate).
                g.strokeCircle(ox, losY - 28 * s, 4 * s);                // FS deep
                g.strokeCircle(ox - 6 * s, losY - 12 * s, 4 * s);       // SS middle
                // Contain arrows: DL contain outside, LBs fill inside gaps.
                g.lineStyle(1.5, 0xcc3322, 0.7);
                // Outer DL contain (DE contain outside rushes).
                [[-1.5, -1], [1.5, 1]].forEach(([si, di]) => {
                    const bx = ox + si * 12 * s;
                    g.lineBetween(bx, losY - basq / 2, bx + di * 10 * s, losY - 18 * s);
                    arrow(bx + di * 10 * s, losY - 18 * s, di, -0.8);
                });
                // Inner DL straight-ahead (DT gap rush).
                g.lineStyle(1.5, 0xcc3322, 0.6);
                [-0.5, 0.5].forEach(i => {
                    const bx = ox + i * 12 * s;
                    g.lineBetween(bx, losY - basq / 2, bx, losY - 18 * s);
                    arrow(bx, losY - 18 * s, 0, -1);
                });
                // LOS.
                g.lineStyle(1, 0xaaaaaa, 0.5);
                dash(ox - dw / 2, losY, ox + dw / 2, losY);
                break;
            }
        }
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
            enterDown: false, aiming: false
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

    // Reset all Space-related state. Called on window blur (missed keyup guard).
    _clearSpaceState() {
        if (this.s.spaceTimer) { clearTimeout(this.s.spaceTimer); this.s.spaceTimer = null; }
        if (this.s.backTimer)  { clearInterval(this.s.backTimer);  this.s.backTimer  = null; }
        this.s.spaceDown = false;
        this.s.spaceLong = false;
        this.s.aiming    = false;
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
