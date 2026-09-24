// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S BASEBALL 2 - Accessible Scan Menu
// ScanList is ported VERBATIM from BENNYSFOOTBALL/js/ui.js — do not modify it
// here; it is the shared accessible menu widget (auto-scan via NarbeScanManager,
// TTS announcement of the highlighted option, SPACE/RIGHT advance, ENTER select,
// plus mouse/touch). Every menu in this game goes through it.
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
        const text = typeof opt.speakText==='function' ? opt.speakText() : opt.speakText != null ? opt.speakText
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
// PitchZoneGrid: stable cards retain the spatial strike-zone layout.
// Every risk cue has a text label and spoken explanation; no color-only ranking.
// Same scan/select/pointer contract as ScanList.

class PitchZoneGrid {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} cfg  { x, y, grid: [5 cells {pitch, zone, zoneIndex, effectiveness}],
     *                        audio, onSelect, size }
     */
    constructor(scene, cfg) {
        this.scene = scene;
        this.audio = cfg.audio;
        this.grid = cfg.grid;
        this.onSelect = cfg.onSelect;
        this.x = cfg.x != null ? cfg.x : W - 165;
        this.y = cfg.y != null ? cfg.y : 320;
        this.size = cfg.size || 250;
        this.index = -1;
        this.active = true;
        this.autoScan = (window.NarbeScanManager && window.NarbeScanManager.getSettings)
            ? !!window.NarbeScanManager.getSettings().autoScan
            : false;

        this.options = this.grid.map(cell => ({
            value: cell.zoneIndex,
            label: cell.pitch,
            speakText: ()=>scene.briefChoiceSpeech('pitch:'+cell.badge,`${cell.pitch}, ${cell.zone}. ${cell.badge}`,cell.description)
        }));
        this.options.push({ value: 'pause', label: 'Pause', speakText: 'Pause' });

        this.container = scene.add.container(0, 0).setDepth(40);
        this.gfx = scene.add.graphics().setDepth(40);
        this.container.add(this.gfx);
        this.labels = [];
        this.zones = [];

        this._layout();
        this._build();
        this._draw();
        this._startTimer();


    }

    // Sample a quadratic bezier into a point list (for seamless curved edges)
    _quad(p0, ctrl, p1, n = 16) {
        const pts = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n, u = 1 - t;
            pts.push({
                x: u * u * p0.x + 2 * u * t * ctrl.x + t * t * p1.x,
                y: u * u * p0.y + 2 * u * t * ctrl.y + t * t * p1.y
            });
        }
        return pts;
    }

    _layout() {
        const S = this.size, h = S / 2;
        const cx = this.x, cy = this.y;
        const C = { x: cx, y: cy };
        const topLeft = { x: cx - h, y: cy - h }, topRight = { x: cx + h, y: cy - h };
        const bottomRight = { x: cx + h, y: cy + h }, bottomLeft = { x: cx - h, y: cy + h };
        const topMid = { x: cx, y: cy - h }, rightMid = { x: cx + h, y: cy };
        const bottomMid = { x: cx, y: cy + h }, leftMid = { x: cx - h, y: cy };

        // Seamless piece polygons — inner edges are shared quadratic curves
        // bowing toward the center (v1's exact construction).
        this.polys = [
            // 0: High Inside (top-left)
            [topLeft, topMid, ...this._quad(topMid, C, leftMid).slice(1)],
            // 1: High Outside (top-right)
            [topMid, topRight, rightMid, ...this._quad(rightMid, C, topMid).slice(1, -1)],
            // 2: Low Outside (bottom-right)
            [rightMid, bottomRight, bottomMid, ...this._quad(bottomMid, C, rightMid).slice(1, -1)],
            // 3: Low Inside (bottom-left)
            [bottomMid, bottomLeft, leftMid, ...this._quad(leftMid, C, bottomMid).slice(1, -1)],
            // 4: Center — the pinched diamond bounded by the same four curves
            [...this._quad(topMid, C, rightMid),
             ...this._quad(rightMid, C, bottomMid).slice(1),
             ...this._quad(bottomMid, C, leftMid).slice(1),
             ...this._quad(leftMid, C, topMid).slice(1, -1)]
        ];

        // Label anchors + interactive hit areas
        const q = S * 0.31;
        this.cells = [
            { x: cx - q, y: cy - q, w: S * 0.36, h: S * 0.36 },
            { x: cx + q, y: cy - q, w: S * 0.36, h: S * 0.36 },
            { x: cx + q, y: cy + q, w: S * 0.36, h: S * 0.36 },
            { x: cx - q, y: cy + q, w: S * 0.36, h: S * 0.36 },
            { x: cx, y: cy, w: S * 0.26, h: S * 0.26 },
            { x: cx, y: cy + h + 38, w: S * 0.8, h: 40, pill: true }  // Pause
        ];
    }

    _pop() { /* Stable targets stay under the pointer during selection. */ }
    _build() {
        this.titleTxt=this.scene.add.text(this.x,this.y-146,'CHOOSE A PITCH',{
            fontSize:'19px',fontFamily:'Arial',fontStyle:'bold',color:'#ffffff'
        }).setOrigin(.5).setDepth(41);this.container.add(this.titleTxt);
        this.options.forEach((opt,i)=>{
            const c=this.cells[i],pause=i===5,cell=this.grid[i];
            const label=this.scene.add.text(c.x,c.y-(pause?0:17),opt.label,{
                fontSize:pause?'16px':'14px',fontFamily:'Arial',fontStyle:'bold',color:'#ffffff'
            }).setOrigin(.5).setDepth(43);
            this.labels.push(label);this.container.add(label);
            if(!pause){
                const detail=this.scene.add.text(c.x,c.y+1,cell.zone,{
                    fontSize:'11px',fontFamily:'Arial',color:'#d8e1ea'
                }).setOrigin(.5).setDepth(43);
                const badge=this.scene.add.text(c.x,c.y+20,cell.badge,{
                    fontSize:'11px',fontFamily:'Arial',fontStyle:'bold',color:cell.risk?'#ffcc80':cell.edge?'#84edbd':'#bad5ff'
                }).setOrigin(.5).setDepth(43);
                this.container.add([detail,badge]);
            }
            const zone=this.scene.add.zone(c.x,c.y,c.w,c.h).setOrigin(.5).setDepth(44).setInteractive({useHandCursor:true});
            zone.on('pointerover',()=>{if(!this.active||this.index===i)return;this.index=i;this._draw();if(this.audio)this.audio.play('scan');this._announceCurrent();});
            zone.on('pointerdown',()=>{if(!this.active)return;this.index=i;this._draw();this.select();});
            this.zones.push(zone);
        });
    }
    _draw() {
        const g=this.gfx;g.clear();const S=this.size;
        g.fillStyle(0x0c1725,.96);g.fillRoundedRect(this.x-S/2-8,this.y-S/2-8,S+16,S+16,12);
        this.cells.forEach((c,i)=>{
            const selected=this.index===i,cell=this.grid[i],color=cell?.risk?0xffcc80:cell?.edge?0x84edbd:0xbad5ff;
            g.fillStyle(selected?0x29435b:0x17283a,1);
            if(cell)g.fillPoints(this.polys[i],true);
            else g.fillRoundedRect(c.x-c.w/2,c.y-c.h/2,c.w,c.h,9);
            g.lineStyle(1.5,0x71839a,1);
            if(cell)g.strokePoints(this.polys[i],true);
            else g.strokeRoundedRect(c.x-c.w/2,c.y-c.h/2,c.w,c.h,9);
            if(cell){g.fillStyle(color,1);g.fillRoundedRect(c.x-29,c.y+28,58,3,1);}
        });
        // Draw focus last so shared borders never cover its white outline.
        if(this.index>=0){
            g.lineStyle(4,0xffffff,1);
            if(this.index<5)g.strokePoints(this.polys[this.index],true);
            else {const c=this.cells[5];g.strokeRoundedRect(c.x-c.w/2,c.y-c.h/2,c.w,c.h,9);}
        }
    }

    getScanInterval() {
        if (window.NarbeScanManager && typeof window.NarbeScanManager.getScanInterval === 'function') {
            return window.NarbeScanManager.getScanInterval();
        }
        return 2200;
    }

    _announceCurrent() {
        if (this.index < 0) return;
        const opt = this.options[this.index];
        if (opt && this.audio) this.audio.speak(typeof opt.speakText==='function'?opt.speakText():opt.speakText, true);
    }

    _startTimer() {
        this._stopTimer();
        if (window.NarbeScanManager && window.NarbeScanManager.getSettings) {
            this.autoScan = !!window.NarbeScanManager.getSettings().autoScan;
        }
        if (!this.autoScan) return;
        this.timer = this.scene.time.addEvent({
            delay: this.getScanInterval(),
            loop: true,
            callback: () => {
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
        this._pop(); this._draw();
        if (this.audio) this.audio.play('scan');
        this._announceCurrent();
        if (!fromTimer) this._startTimer();
    }

    prev(fromTimer) {
        if (!this.active) return;
        this.index = this.index < 0 ? this.options.length - 1 : (this.index - 1 + this.options.length) % this.options.length;
        this._pop(); this._draw();
        if (this.audio) this.audio.play('scan');
        this._announceCurrent();
        if (!fromTimer) this._startTimer();
    }

    select() {
        if (!this.active) return;
        if (this.index < 0) return;
        const opt = this.options[this.index];
        if (this.audio) this.audio.play('select');
        if (this.onSelect) this.onSelect(opt, this.index);
    }

    setScrollFactor(f) {
        this.gfx.setScrollFactor(f);
        this.labels.forEach(t => { t.setScrollFactor(f); if (t._zoneTxt) t._zoneTxt.setScrollFactor(f); });
        if (this.titleTxt) this.titleTxt.setScrollFactor(f);
        this.zones.forEach(z => z.setScrollFactor(f));
        return this;
    }

    destroy() {
        this.active = false;
        this._stopTimer();
        if (this.popTween) { this.popTween.stop(); this.popTween = null; }
        if (this.glowTween) { this.glowTween.stop(); this.glowTween = null; }
        this.zones.forEach(z => z.destroy());
        this.gfx.destroy();
        this.labels.forEach(t => { if (t._zoneTxt) t._zoneTxt.destroy(); t.destroy(); });
        if (this.titleTxt) this.titleTxt.destroy();
        this.container.destroy();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ScanInput — the single, shared switch-input controller used by every scene.
// Ported VERBATIM from BENNYSFOOTBALL/js/ui.js — the canonical Benny's Hub
// scheme so all games behave identically:
//   • SPACE tap (press + quick release)  → scan FORWARD
//   • SPACE held ≥ longPress (3s)        → scan BACKWARD, repeating every
//                                          NarbeScanManager scan interval
//   • ENTER tap                          → select / confirm
// Hold-to-charge gestures (the swing charge here) go through the optional
// isChargePhase / chargeStart / chargeRelease handlers on ENTER, plus
// pointer/touch. All commits happen on key UP; OS key-repeat is ignored.
// ═══════════════════════════════════════════════════════════════════════════════
class ScanInput {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} h handlers: forward, backward, select, escape,
     *        isChargePhase, chargeStart, chargeRelease
     */
    constructor(scene, h) {
        this.scene = scene;
        this.h = h || {};
        this.longPress = 3000;   // hold SPACE this long → backward scanning
        this.s = {
            spaceDown: false, spaceTimer: null, backTimer: null, spaceLong: false,
            enterDown: false, aiming: false,
            awaitingSpaceRelease: false
        };
        this._kd = (e) => this._down(e);
        this._ku = (e) => this._up(e);
        window.addEventListener('keydown', this._kd);
        window.addEventListener('keyup', this._ku);

        // If the window loses focus while Space is held the keyup never arrives.
        // Reset everything on blur or page-hide so stuck-autoscan can't happen.
        this._onBlur = () => this._clearSpaceState();
        window.addEventListener('blur', this._onBlur);
        this._onHidden = () => { if (document.visibilityState === 'hidden') this._clearSpaceState(); };
        document.addEventListener('visibilitychange', this._onHidden);

        this._spaceKey = (scene.input && scene.input.keyboard)
            ? scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
            : null;

        this._isPointerCharge = () => this._isCharge();
        this._pd = () => { if (this._isPointerCharge()) this._chargeStart(); };
        this._pu = () => { if (this._isPointerCharge()) this._chargeRelease(); };
        scene.input.on('pointerdown', this._pd);
        scene.input.on('pointerup', this._pu);

        scene.events.once('shutdown', () => this.destroy());
        scene.events.once('destroy', () => this.destroy());
    }

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

    _down(e) {
        if (e.repeat) return;
        if (e.code === 'Space') {
            e.preventDefault();
            if (this.s.awaitingSpaceRelease) return;
            if (this.s.spaceDown || this.s.spaceTimer || this.s.backTimer) return;
            this.s.spaceDown = true; this.s.spaceLong = false;
            this.s.spaceTimer = setTimeout(() => {
                this.s.spaceLong = true;
                if (this.h.backward) this.h.backward();
                this.s.backTimer = setInterval(() => {
                    const physicallyDown = !!(this._spaceKey && this._spaceKey.isDown);
                    if (this.s.spaceDown && physicallyDown) { if (this.h.backward) this.h.backward(); }
                    else { this.s.spaceDown = false; clearInterval(this.s.backTimer); this.s.backTimer = null; }
                }, this._interval());
                this.s.spaceTimer = null;
            }, this.longPress);
        } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            e.preventDefault();
            if (this.s.enterDown) return;
            this.s.enterDown = true;
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
            this.s.awaitingSpaceRelease = false;
            const wasShortNav = this.s.spaceDown && !this.s.spaceLong;
            this.s.aiming    = false;
            this.s.spaceDown = false;
            this.s.spaceLong = false;
            if (this.s.spaceTimer) { clearTimeout(this.s.spaceTimer); this.s.spaceTimer = null; }
            if (this.s.backTimer)  { clearInterval(this.s.backTimer);  this.s.backTimer  = null; }
            if (wasShortNav && this.h.forward) this.h.forward();
            return;
        }
        if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.s.enterDown) {
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
// BaseTargetSelector — the throw-target picker, drawn ON the field: instead of
// a text menu, the covering base PLAYERS light up (1B / 2B / 3B / catcher at
// home / the pitcher = end the play). Scan between them, ENTER throws.
// Rings track the fielders live and pulse gently. Only legal targets appear.
// Same contract as ScanList (options/next/prev/select/destroy/active).
// ═══════════════════════════════════════════════════════════════════════════════
class BaseTargetSelector {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} cfg { targets: [{value,label,hint,fielder,chip,...}],
     *                       audio, onSelect, title }
     */
    constructor(scene, cfg) {
        this.scene = scene;
        this.audio = cfg.audio;
        this.options = cfg.targets;
        this.onSelect = cfg.onSelect;
        this.zoomOnScan = !!cfg.zoomOnScan;
        this.index = -1;
        this.active = true;
        this.autoScan = (window.NarbeScanManager && window.NarbeScanManager.getSettings)
            ? !!window.NarbeScanManager.getSettings().autoScan
            : false;

        this.gfx = scene.add.graphics().setDepth(45);
        this.titleTxt = scene.add.text(W / 2, 86, cfg.title || 'Where do you throw?', {
            fontSize: '30px', fontFamily: 'Arial Black', color: '#FFD700',
            stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5).setDepth(46);

        this.chips = this.options.map(o =>
            scene.add.text(o.fielder.x, o.fielder.y - 40, o.chip, {
                fontSize: '17px', fontFamily: 'Arial Black', color: '#ffffff',
                stroke: '#000', strokeThickness: 5
            }).setOrigin(0.5).setDepth(46));

        this.zones = this.options.map((o, i) => {
            const z = scene.add.zone(o.fielder.x, o.fielder.y, 72, 72)
                .setOrigin(0.5).setDepth(47).setInteractive({ useHandCursor: true });
            z.on('pointerover', () => {
                if (!this.active) return;
                if (this.index !== i) {
                    this.index = i;
                    if (this.audio) this.audio.play('scan');
                    this._announceCurrent();
                }
                this._scanZoom(true);
            });
            z.on('pointerdown', () => {
                if (!this.active) return;
                this.index = i; this.select();
            });
            return z;
        });

        this._pulse = 0;
        this._tick = scene.time.addEvent({
            delay: 50, loop: true,
            callback: () => { this._pulse += 0.22; this._draw(); }
        });
        this._draw();
        this._startTimer();
    }

    _draw() {
        const g = this.gfx;
        g.clear();
        // Keep the title pinned to the top of whatever the camera shows
        const cam = this.scene.cameras.main;
        const wv = cam.worldView;
        if (wv.width > 0) {
            this.titleTxt.setPosition(wv.centerX, wv.y + 86 / (cam.zoom / (this.scene._renderScale || 1))).setScale((this.scene._renderScale || 1) / cam.zoom);
        }
        this.options.forEach((o, i) => {
            const f = o.fielder;
            if (!f || f.active === false) return;   // plain {x,y} spots are fine
            const sel = i === this.index;
            this.chips[i].setPosition(f.x, f.y - 40);
            this.zones[i].setPosition(f.x, f.y);
            if (sel) {
                // Big, bright, pulsing ring — designed for low vision
                const r = 32 + Math.sin(this._pulse * 2) * 4;
                g.fillStyle(0xFFD54A, 0.28);
                g.fillCircle(f.x, f.y, r);
                g.lineStyle(7, 0xFFD54A, 1);
                g.strokeCircle(f.x, f.y, r);
                g.lineStyle(3, 0x000000, 0.6);
                g.strokeCircle(f.x, f.y, r + 5);
                this.chips[i].setColor('#FFD54A').setScale(1.2);
            } else {
                const a = 0.5 + 0.25 * Math.sin(this._pulse + i * 1.3);
                g.lineStyle(4, 0xffffff, a);
                g.strokeCircle(f.x, f.y, 27);
                this.chips[i].setColor('#ffffff').setScale(1);
            }
            // Classic pause emblem (two bars) inside the pause ring
            if (o.value === 'pause') {
                g.fillStyle(sel ? 0xFFD54A : 0xffffff, sel ? 1 : 0.85);
                g.fillRect(f.x - 9, f.y - 10, 6, 20);
                g.fillRect(f.x + 3, f.y - 10, 6, 20);
            }
        });
    }

    getScanInterval() {
        if (window.NarbeScanManager && typeof window.NarbeScanManager.getScanInterval === 'function') {
            return window.NarbeScanManager.getScanInterval();
        }
        return 2200;
    }

    _announceCurrent() {
        if (this.index < 0) return;
        const o = this.options[this.index];
        if (o && this.audio) this.audio.speak(typeof o.speakText==='function'?o.speakText():o.hint ? `${o.label}. ${o.hint}` : o.label, true);
    }

    _startTimer() {
        this._stopTimer();
        if (window.NarbeScanManager && window.NarbeScanManager.getSettings) {
            this.autoScan = !!window.NarbeScanManager.getSettings().autoScan;
        }
        if (!this.autoScan) return;
        this.timer = this.scene.time.addEvent({
            delay: this.getScanInterval(),
            loop: true,
            callback: () => {
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
        if (this.audio) this.audio.play('scan');
        this._announceCurrent();
        this._scanZoom();
        if (!fromTimer) this._startTimer();
    }

    prev(fromTimer) {
        if (!this.active) return;
        this.index = this.index < 0 ? this.options.length - 1 : (this.index - 1 + this.options.length) % this.options.length;
        if (this.audio) this.audio.play('scan');
        this._announceCurrent();
        this._scanZoom();
        if (!fromTimer) this._startTimer();
    }

    // Ride the camera onto whoever is being scanned (throw menus): zoom in on
    // each base player, and back out wide when the pitcher (end play) is up.
    _scanZoom(fromPointer = false) {
        if (!this.zoomOnScan || this.index < 0 || !this.scene._zoomOnPoint) return;
        const o = this.options[this.index];
        // Pointer targets must stay put while hovering/tapping. Switch scanning
        // may focus bases, but Ready and Pause always restore the whole field.
        if (fromPointer || ['hold', 'bat', 'pause'].includes(o.value)) this.scene._zoomOut(340);
        else this.scene._zoomOnPoint(o.fielder.x, o.fielder.y, 1.55, 340);
    }

    select() {
        if (!this.active) return;
        if (this.index < 0) return;
        const opt = this.options[this.index];
        if (this.audio) this.audio.play('select');
        if (this.onSelect) this.onSelect(opt, this.index);
    }

    // World-space by design — rings live on the field, so this is a no-op
    setScrollFactor() { return this; }

    destroy() {
        this.active = false;
        this._stopTimer();
        if (this._tick) { this._tick.remove(); this._tick = null; }
        this.zones.forEach(z => z.destroy());
        this.chips.forEach(t => t.destroy());
        this.titleTxt.destroy();
        this.gfx.destroy();
    }
}
