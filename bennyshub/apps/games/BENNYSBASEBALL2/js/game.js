// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S BASEBALL 2 - Main game scenes (Phaser 3)
//
// TitleScene  → simple accessible start menu
// GameScene   → the whole 9-inning game as a phase state machine:
//               pitch → bat menu → charge swing → contact → fielding →
//               throw menu (NEW) → resolve → next batter
// ResultScene → final score + play again
//
// Rules, probabilities, and the hold-to-charge batting mechanic are ported
// from BENNYSBASEBALL v1 (GameLogic.js) so the game balance carries over.
// Visual style (vector players, tween movement, camera zooms) follows
// BENNYSFOOTBALL/js/game.js. The throw-to-base fielding menu is new.
// ═══════════════════════════════════════════════════════════════════════════════


// ─── Game ────────────────────────────────────────────────────────────────────
class GameScene extends BaseballScene {
    constructor() { super('GameScene'); }

    preload() {
        // The field needs no image assets: show it as soon as Start is accepted.
        this.drawFieldBackground();
        this._loadingLabel = this.add.text(W / 2, H / 2, 'Loading game...', {
            fontFamily: 'Arial', fontSize: '28px', color: '#ffffff', align: 'center'
        }).setOrigin(.5).setDepth(100);
        const progress = value => this._loadingLabel.setText('Loading game... ' + Math.round(value * 100) + '%');
        this.load.on('progress', progress);
        this.load.once('complete', () => this.load.off('progress', progress));
        if (typeof bb2LoadSprites === 'function') bb2LoadSprites(this);
    }

    create(data) {
        if (this._loadingLabel) { this._loadingLabel.destroy();this._loadingLabel = null; }
        this.audio = audioSys();
        this.season = seasonMgr();
        this._playerMotion = new BaseballPlayerMotion(this);
        this.cameras.main.setBounds(0, 0, W, H);
        this.isSeason = !!(data && data.isSeason);

        // ── Resolve teams (opponent decided by ColorSelect/SeasonScene) ──
        const playerOpt = COLOR_OPTIONS.find(c => c.name === (data && data.playerColorName)) || COLOR_OPTIONS[0];
        let cpuOpt = COLOR_OPTIONS.find(c => c.name === (data && data.opponentColorName));
        if (!cpuOpt) {
            const pool = COLOR_OPTIONS.filter(c => c.name !== playerOpt.name);
            cpuOpt = pool[Math.floor(Math.random() * pool.length)];
        }
        let resumeData = null;
        if (this.isSeason && data && data.resume && this.season.hasGameInProgress()) {
            resumeData = this.season.loadGameState().gs;
        }
        setTeamColors(playerOpt, cpuOpt);
        this.opponentName = cpuOpt.name;
        this.playerColorName = playerOpt.name;

        // Home/away: consistent within a playoff/championship series
        let playerIsAway;
        if (resumeData) {
            playerIsAway = resumeData.playerIsAway;
        } else if (this.isSeason && this.season.isInSeries()) {
            playerIsAway = !this.season.data.seriesHomeIsPlayer;
        } else {
            playerIsAway = Math.random() < 0.5;
        }

        // ── Core game state (shape ported from v1 GameState) ──
        this.gs = {
            inning: 1,
            half: 'top',
            outs: 0,
            balls: 0,
            strikes: 0,
            score: { Red: 0, Blue: 0 },      // Red = away team, Blue = home team (v1 convention)
            bases: { first: null, second: null, third: null },  // 'user' | 'comp' | null
            playerIsAway,
            firstPitch: true,
            gameOver: false,
            samePitchCount: 0,
            lastPitchType: null,
            selectedPitch: null,
            selectedPitchLocation: null,
            selectedPitchEffectiveness: 0.5,
            pitchRisk: false,
            pitchMissedSpot: false,
            pendingBaseUpdate: null
        };
        if (resumeData) {
            Object.assign(this.gs, {
                inning: resumeData.inning, half: resumeData.half, outs: resumeData.outs,
                score: { ...resumeData.score }, bases: { ...resumeData.bases },
                balls: resumeData.balls, strikes: resumeData.strikes,
                samePitchCount: resumeData.samePitchCount || 0,
                lastPitchType: resumeData.lastPitchType || null
            });
        }
        this.resetInteractiveBatting();

        this.menu = null;
        this.chargeMonitor = null;
        this.pitchTween = null;
        this._receivingPitch = false;

        this._preparingLabel = this.add.text(W / 2, H / 2, 'Preparing players...', {
            fontFamily: 'Arial', fontSize: '28px', color: '#ffffff',
            backgroundColor: '#102a16', padding: {x:24,y:16}, align: 'center'
        }).setOrigin(.5).setDepth(100);
        const roster = Object.keys(FIELD.FIELDER_HOMES).map(position => ({position,color:this.fieldingColor()}));
        roster.push({position:'B',color:this.battingColor()});
        if (Object.values(this.gs.bases).some(Boolean)) roster.push({position:'R',color:this.battingColor()});
        if (!bb2SpritesReady(this)) {
            this._finishSetup(resumeData);return;
        }
        bb2PreparePlayers(this, roster, progress => {
            this._preparingLabel.setText('Preparing players... ' + Math.round(progress*100) + '%');
        }, () => this._finishSetup(resumeData));
    }

    _finishSetup(resumeData) {
        if (this._preparingLabel) {this._preparingLabel.destroy();this._preparingLabel = null;}
        this.ball = this.makeBall();
        this.createTeams(true); // both teams run onto the field
        this.runnerDots = { first: null, second: null, third: null };
        this.createHUD();
        this.createSwingMeter();
        this.createPowerMeter();
        this.syncRunners();

        this.wireInput();

        // Random little repositioning shuffles keep the defense looking alive
        // between plays (nothing big — a step or two and back)
        this.time.addEvent({
            delay: 2400, loop: true,
            callback: () => {
                if (this.gs.gameOver || !this.fielders) return;
                // Ambient shifts belong only to pre-pitch menu time. Never
                // move a planted receiver while a live ball approaches.
                if (!this.menu || (this.ball && this.ball.visible) || (this.ib && this.ib.active)) return;
                const keys = Object.keys(this.fielders);
                const f = this.fielders[keys[Math.floor(Math.random() * keys.length)]];
                if (!f || !f.active || this.tweens.isTweening(f)) return;
                if (f._bb2 && f._busy) return;   // never interrupt a delivery
                if (this.playerMotion().moves.has(f)) return;
                // A shuffle uses the same footprint checks as a running play.
                const home = {x:f.x,y:f.y};
                this.movePlayer({targets:f,x:f.x+Phaser.Math.Between(-4,4),y:f.y+Phaser.Math.Between(-3,3),duration:420,
                    onComplete:()=>this.movePlayer({targets:f,x:home.x,y:home.y,duration:420})});
            }
        });

        // Opening announcement (with series context)
        const you = TEAM_COLORS.player.name, cpu = TEAM_COLORS.cpu.name;
        let announcement = `${you} versus ${cpu}.`;
        if (this.isSeason) {
            const s = this.season.seriesInfo();
            if (s) {
                announcement = `${s.label} series, game ${s.gameNum} of a best of ${s.bestOf}. The series is ${s.wins} to ${s.losses}. ${announcement}`;
            } else {
                announcement = `Season game ${this.season.data.gamesPlayed + 1} of ${SEASON.REGULAR_GAMES}. ${announcement}`;
            }
        }
        if (resumeData) {
            announcement = `Resuming. ${announcement}`;
        } else {
            announcement += this.gs.playerIsAway ? ' You bat first.' : ' They bat first.';
        }
        this.audio.speak(announcement);
        this.bigMessage('PLAY BALL!', 1800);
        this.time.delayedCall(3000, () => this.nextPlay());
    }

    playerMotion() {
        if (!this._playerMotion) this._playerMotion = new BaseballPlayerMotion(this);
        return this._playerMotion;
    }

    update(time, delta) {
        if(this._playerMotion)this._playerMotion.update(delta);
        if(this._updateScuffle)this._updateScuffle();
    }

    stopPlayerMovement(p) {
        if (this._playerMotion) this._playerMotion.stop(p);
        this.tweens.killTweensOf(p);
    }

    movePlayer(config) {
        // A short ball-flight or animation timer must never accelerate a defender.
        const defender=Object.values(this.fielders || {}).includes(config.targets);
        const travel=Math.hypot(config.x-config.targets.x,config.y-config.targets.y);
        const duration=defender?Math.max(config.duration || 0,travel/130*1000):config.duration;
        return this.playerMotion().move(config.targets,config.x,config.y,duration,config.onComplete,config.onUpdate,config.gait);
    }

    resetInteractiveBatting() {
        this.ib = {
            active: false,
            waitingForSwing: false,
            swingPressed: false,
            swingReleased: false,
            swingPressStart: 0,
            announcedSwingType: null,
            pitchProgress: 0,
            ballInStrikeZone: false,
            lastSwingTone: 0,
            isSwinging: false,
            outcomeProcessed: false,
            swingType: null,
            swingPowerLevel: 0,
            timingScore: 0
        };
    }

    // ─── Field & sprites ─────────────────────────────────────────────────────
    drawFieldBackground() {
        bb2DrawBallpark(this);
    }
    // Separate leather lighting from the moving stitches. The highlight stays
    // toward the stadium lights instead of orbiting with a flat spinning disc.
    ensureBallTexture() {
        if (this.textures.exists('ball-tex')) return;
        const size = 128, center = 64, radius = 57;
        const leather = this.textures.createCanvas('ball-tex', size, size);
        const ctx = leather.getContext();
        const light = ctx.createRadialGradient(44, 39, 4, 59, 60, 64);
        light.addColorStop(0, '#fffef8');
        light.addColorStop(.43, '#f5f1e5');
        light.addColorStop(.76, '#ddd9cc');
        light.addColorStop(1, '#8c969b');
        ctx.fillStyle = light;
        ctx.beginPath();ctx.arc(center, center, radius, 0, Math.PI * 2);ctx.fill();
        ctx.strokeStyle = 'rgba(66,77,81,.32)';ctx.lineWidth = 1;
        ctx.stroke();
        leather.refresh();

        const seams = this.textures.createCanvas('ball-seams', size, size);
        const stitch = seams.getContext();
        stitch.save();stitch.beginPath();stitch.arc(center, center, radius - .5, 0, Math.PI * 2);stitch.clip();
        stitch.lineCap = 'round';stitch.lineJoin = 'round';
        // Two curved panel joins, with paired diagonal stitches sunk into the leather.
        for (const side of [-1, 1]) {
            const point = t => ({x: center + side * (9 + 25 * Math.pow(2*t-1, 2)), y: 11 + 106*t});
            stitch.beginPath();
            for (let i = 0; i <= 64; i++) {
                const p = point(i / 64);
                if (i === 0) stitch.moveTo(p.x, p.y);else stitch.lineTo(p.x, p.y);
            }
            stitch.strokeStyle = 'rgba(103,55,41,.25)';stitch.lineWidth = 3;stitch.stroke();
            stitch.strokeStyle = '#a64435';stitch.lineWidth = 1.15;stitch.stroke();
            for (let i = 1; i < 17; i++) {
                const t = i / 17, p = point(t), dx = side * 100 * (2*t-1), dy = 106;
                const length = Math.hypot(dx, dy), nx = dy / length, ny = -dx / length;
                const tx = dx / length, ty = dy / length;
                stitch.beginPath();
                stitch.moveTo(p.x - nx*3.2 - tx*1.4, p.y - ny*3.2 - ty*1.4);
                stitch.lineTo(p.x + tx*.7, p.y + ty*.7);
                stitch.lineTo(p.x + nx*3.2 - tx*1.4, p.y + ny*3.2 - ty*1.4);
                stitch.strokeStyle = '#b43c32';stitch.lineWidth = 1.8;stitch.stroke();
            }
        }
        stitch.restore();seams.refresh();

        const shadow = this.textures.createCanvas('ball-shadow', 64, 32), shade = shadow.getContext();
        shade.scale(1, .5);
        const fade = shade.createRadialGradient(32, 32, 2, 32, 32, 30);
        fade.addColorStop(0, 'rgba(0,0,0,.4)');fade.addColorStop(1, 'rgba(0,0,0,0)');
        shade.fillStyle = fade;shade.fillRect(0, 0, 64, 64);shadow.refresh();
    }

    makeBall() {
        this.ensureBallTexture();
        const c = this.add.container(FIELD.MOUND.x, FIELD.MOUND.y).setDepth(8);
        // The rig's hands are roughly 2-3 world pixels wide at BB2_DISPLAY.
        // Include the texture's transparent margin when matching that scale.
        const diameter = 3;
        const shadow = this.add.image(.5, 1.5, 'ball-shadow').setDisplaySize(3.5, 1.75);
        const body = this.add.image(0, 0, 'ball-tex').setDisplaySize(diameter, diameter);
        const seams = this.add.image(0, 0, 'ball-seams').setDisplaySize(diameter, diameter);
        // Spin only while in motion — resumed by ballArc/the pitch, paused
        // the moment the ball settles in a glove
        c.spin = this.tweens.add({ targets: seams, angle: 360, duration: 800, repeat: -1, ease: 'Linear', paused: true });
        // Location/type cue shown near contact, with matching plain-language text.
        const glow = this.add.circle(0, 0, 12).setStrokeStyle(3.5, 0xffe14d, 1).setVisible(false);
        c.add([shadow, body, seams, glow]);
        c.body = body;
        c.seams = seams;
        c.glow = glow;
        c.setVisible(false);
        return c;
    }

    // ─── Swing timing indicator ──────────────────────────────────────────────
    // The ball carries a location/type highlight during the contact window.
    createSwingMeter() {
        const T = GAME_CONSTANTS.TIMING;
        const win = T.SWING_TIMING_WINDOW / T.INTERACTIVE_PITCH_DURATION; // ~0.21 (widened for slower reflexes)
        this.meterBands = {
            hitLo: 0.75, hitHi: 1.0,                          // any contact possible
            okLo: 0.90 - win * 0.8, okHi: 0.90 + win * 0.8,   // decent timing
            goodLo: 0.90 - win * 0.4, goodHi: 0.90 + win * 0.4 // good→perfect (ring!)
        };

        // Only the instruction line remains on screen (v1-style); the meter
        // bar/marker are gone — watch the ball instead.
        this.meter = this.add.container(0, 0).setDepth(55).setScrollFactor(0).setVisible(false);
        this.meterTitle = this.add.text(W / 2, H - 30, 'Hold to charge; release at the cue, or keep holding to take.', {
            fontSize: '15px', fontFamily: 'Arial Black', color: '#ffffff',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5);
        this.meter.add(this.meterTitle);
    }

    pitchProfile() {
        if (!this.ib.profile) {
            this.ib.profile=bb2PitchProfile(this.gs.selectedPitch,this.gs.selectedPitchLocation);
            this.ib.hitByPitch=this.ib.profile.x < -1 && Math.random()<.08;
        }
        return this.ib.profile;
    }

    pitchReadPoint() {
        if(!this.ib.readPoint){
            const point=this.swingContactPoint('normal'),profile=this.pitchProfile();
            this.ib.readPoint={x:point.x+profile.x*18,y:point.y+profile.y*15};
        }
        return this.ib.readPoint;
    }

    interactivePitchPoint(progress) {
        const {from,to,pitch}=this.ib.pitchFlight;
        const off=this.pitchOffset(pitch,progress),bend=Math.sin(Math.PI*progress);
        return {x:Phaser.Math.Linear(from.x,to.x,progress)+off.dx*bend,
            y:Phaser.Math.Linear(from.y,to.y,progress)-bend*14+off.dy*bend};
    }

    paintPitchCue(inWindow) {
        const profile=this.pitchProfile();
        this.ball.glow.setVisible(true).setStrokeStyle(inWindow?4:2,inWindow?profile.color:0xd1dee4,1).setAlpha(inWindow?.9:.35);
        if (inWindow) this.meterTitle.setText(`${profile.spoken} | ${profile.pitch} | ${profile.display}`);
    }

    updateSwingMeter(p) {
        if (!this.ib.active) return;
        const T=GAME_CONSTANTS.TIMING;
        this.paintPitchCue(p>=T.GREEN_ZONE_LO && p<=T.GREEN_ZONE_HI);
    }

    hideSwingMeter() {
        if (this.meter) this.meter.setVisible(false);
        if (this.ball && this.ball.glow) this.ball.glow.setVisible(false);
    }

    // Close-up on the batter/pitcher duel for the at-bat; zooms back out at
    // the swing (or when the pitch goes by). Screen-pinned UI scales with
    // camera zoom in Phaser, so while zoomed the meter + instruction line are
    // remapped into the visible world rect, and the HUD takes a breather.
    setBattingCamera(on) {
        if (on && this._battingCam) return;
        this._battingCam = !!on;
        const z = 1.9, cx = 492, cy = 462;
        const hud = this.hudAll || [];
        if (on) {
            this._zoomOnPoint(cx, cy, z, 650);
            const ox = cx - (W / 2) / z, oy = cy - (H / 2) / z;
            [this.meter, this.powerMeter].forEach(c => {
                c.setScrollFactor(1);
                c.setScale(1 / z);
                c.setPosition(ox, oy);
            });
            hud.forEach(o => o.setVisible(false));
        } else {
            this.resetFieldCamera();
        }
    }

    // ─── Charge power meter (ported from v1 UIRenderer.drawPowerMeter) ──────
    // Vertical meter on the left, shown ONLY while the swing button is held:
    // BUNT (orange, 0-2s) → NORMAL (green, 2-4s) → POWER (red, 4-6s), with a
    // filling bar, the current swing type on top, and the hold time below.
    createPowerMeter() {
        const mx = 50, my = H / 2 - 100, mw = 60, mh = 200;
        const T = GAME_CONSTANTS.TIMING;
        this._power = { mx, my, mw, mh,
            buntH: (T.SWING_BUNT_MAX / T.SWING_POWER_MAX) * mh,
            normalH: ((T.SWING_POWER_MIN - T.SWING_BUNT_MAX) / T.SWING_POWER_MAX) * mh,
            powerH: ((T.SWING_POWER_MAX - T.SWING_POWER_MIN) / T.SWING_POWER_MAX) * mh
        };

        this.powerMeter = this.add.container(0, 0).setDepth(56).setScrollFactor(0).setVisible(false);

        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.85);
        bg.fillRect(mx - 10, my - 40, mw + 92, mh + 80);
        bg.lineStyle(2, 0xffffff, 1);
        bg.strokeRect(mx - 10, my - 40, mw + 92, mh + 80);
        // Meter track
        bg.fillStyle(0x646464, 0.3);
        bg.fillRect(mx, my, mw, mh);
        // Zones bottom→top: BUNT orange / NORMAL green / POWER red (v1 colors)
        const p = this._power;
        bg.fillStyle(0xffaa00, 0.38);
        bg.fillRect(mx, my + mh - p.buntH, mw, p.buntH);
        bg.fillStyle(0x00ff00, 0.38);
        bg.fillRect(mx, my + mh - p.buntH - p.normalH, mw, p.normalH);
        bg.fillStyle(0xff4444, 0.38);
        bg.fillRect(mx, my, mw, p.powerH);
        this.powerMeter.add(bg);

        const zoneStyle = { fontSize: '11px', fontFamily: 'Courier New', fontStyle: 'bold' };
        this.powerMeter.add(this.add.text(mx + mw + 6, my + mh - p.buntH / 2, 'BUNT', { ...zoneStyle, color: '#ffaa00' }).setOrigin(0, 0.5));
        this.powerMeter.add(this.add.text(mx + mw + 6, my + mh - p.buntH - p.normalH / 2, 'NORMAL', { ...zoneStyle, color: '#00ff00' }).setOrigin(0, 0.5));
        this.powerMeter.add(this.add.text(mx + mw + 6, my + p.powerH / 2, 'POWER', { ...zoneStyle, color: '#ff4444' }).setOrigin(0, 0.5));

        this.powerTypeTxt = this.add.text(mx + mw / 2, my - 20, 'BUNT', {
            fontSize: '15px', fontFamily: 'Courier New', fontStyle: 'bold', color: '#ffaa00'
        }).setOrigin(0.5);
        this.powerMeter.add(this.powerTypeTxt);

        this.powerTimeTxt = this.add.text(mx + mw / 2, my + mh + 25, '0.0s', {
            fontSize: '16px', fontFamily: 'Courier New', fontStyle: 'bold', color: '#ffffff'
        }).setOrigin(0.5);
        this.powerMeter.add(this.powerTimeTxt);

        // Fill bar + position line, redrawn every charge tick
        this.powerFill = this.add.graphics();
        this.powerMeter.add(this.powerFill);
    }

    updatePowerMeter(holdDuration) {
        const T = GAME_CONSTANTS.TIMING;
        const p = this._power;
        const progress = Math.min(holdDuration / T.SWING_POWER_MAX, 1);

        let type, color;
        if (holdDuration < T.SWING_BUNT_MAX) { type = 'BUNT'; color = 0xffaa00; }
        else if (holdDuration < T.SWING_POWER_MIN) { type = 'NORMAL'; color = 0x00ff00; }
        else { type = 'POWER'; color = 0xff4444; }

        this.powerTypeTxt.setText(type).setColor(type === 'BUNT' ? '#ffaa00' : type === 'NORMAL' ? '#00ff00' : '#ff4444');
        this.powerTimeTxt.setText(`${(holdDuration / 1000).toFixed(1)}s`);
        // v1-style live instruction: show the swing you'd get if you let go now
        const label = type === 'BUNT' ? 'BUNT' : type === 'NORMAL' ? 'NORMAL SWING' : 'POWER SWING';
        const read=this.pitchProfile();
        this.meterTitle.setText(this.ib.ballInStrikeZone
            ? `${read.spoken} | ${read.pitch} | ${read.display}`
            : `Current: ${label}. Release at the cue, or keep holding to take.`).setColor('#ffffff');

        const filled = progress * p.mh;
        const g = this.powerFill;
        g.clear();
        g.fillStyle(color, 0.85);
        g.fillRect(p.mx, p.my + p.mh - filled, p.mw, filled);
        g.lineStyle(3, 0xffffff, 1);
        g.lineBetween(p.mx - 5, p.my + p.mh - filled, p.mx + p.mw + 5, p.my + p.mh - filled);
    }

    hidePowerMeter() {
        if (this.powerMeter) this.powerMeter.setVisible(false);
    }

    // posKey selects the BB2_POSITION_SHEETS entry and defaults to label —
    // every real call site passes a position ('P', '1B', 'B', 'R', ...) as
    // both. The on-deck batter is the one exception: it wants the 'B' sheet
    // (stance, with the bat) but no on-screen text, so it passes them
    // separately. Falls back to the plain numbered circle whenever a sheet
    // is missing, so the game stays playable at every commit.
    makePlayer(colorObj, label, posKey) {
        if (typeof bb2MakePlayer === 'function') {
            const sprite = bb2MakePlayer(this, colorObj, label, posKey || label);
            if (sprite) return this.playerMotion().register(sprite);
        }
        const c = this.add.container(0, 0).setDepth(3);
        const shadow = this.add.ellipse(3, 7, 34, 11, 0x000000, 0.52);
        const body = this.add.circle(0, 0, 13, colorObj.hex).setStrokeStyle(2.5, 0x000000);
        const shine = this.add.circle(-4, -4, 4, colorObj.light, 0.6);
        const num = this.add.text(0, 0, label, {
            fontSize: '9px', fontFamily: 'Arial Black', color: '#ffffff',
            stroke: '#000', strokeThickness: 2
        }).setOrigin(0.5);
        c.add([shadow, body, shine, num]);
        // Subtle idle breathing on the body (children only, so it never
        // fights the container's movement tweens) — keeps players alive
        this.tweens.add({
            targets: [body, shine, num], y: '+=1.6',
            duration: Phaser.Math.Between(700, 1100),
            delay: Phaser.Math.Between(0, 600),
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
        return this.playerMotion().register(c);
    }

    isPlayerBatting() {
        return (this.gs.half === 'top') === this.gs.playerIsAway;
    }

    battingColor()  { return this.isPlayerBatting() ? TEAM_COLORS.player : TEAM_COLORS.cpu; }
    fieldingColor() { return this.isPlayerBatting() ? TEAM_COLORS.cpu : TEAM_COLORS.player; }
    battingTeamKey() { return this.isPlayerBatting() ? 'user' : 'comp'; }
    // Which score bucket the batting team fills (v1: away=Red, home=Blue)
    battingScoreKey() { return this.gs.half === 'top' ? 'Red' : 'Blue'; }

    // Build the defense + batter. With fromDugout=true, everyone spawns at
    // their team's dugout and jogs out to their spot (game start / half swap).
    createTeams(fromDugout, onReady) {
        const entry = fromDugout ? {remaining: Object.keys(FIELD.FIELDER_HOMES).length + 1} : null;
        this._teamEntry = entry;
        const arrived = () => {
            if (this._teamEntry !== entry || !entry || --entry.remaining > 0) return;
            this._teamEntry = null;
            if (onReady) onReady();
        };
        this._lineupBusy = false;
        if (this._departingPlayers) for (const p of this._departingPlayers) { this.stopPlayerMovement(p);p.destroy(); }
        this._departingPlayers = new Set();
        if (this.fielders) Object.values(this.fielders).forEach(p => { this.stopPlayerMovement(p); p.destroy(); });
        if (this.batter) { this.stopPlayerMovement(this.batter); this.batter.destroy(); }

        const fieldingIsPlayer = !this.isPlayerBatting();
        const fieldDug = fieldingIsPlayer ? FIELD.DUGOUT.player : FIELD.DUGOUT.cpu;
        const batDug = fieldingIsPlayer ? FIELD.DUGOUT.cpu : FIELD.DUGOUT.player;

        this.fielders = {};
        const fc = this.fieldingColor();
        const positions = Object.keys(FIELD.FIELDER_HOMES).sort((a,b) => {
            const pa=FIELD.FIELDER_HOMES[a],pb=FIELD.FIELDER_HOMES[b];
            return Math.hypot(pb.x-fieldDug.x,pb.y-fieldDug.y)-Math.hypot(pa.x-fieldDug.x,pa.y-fieldDug.y);
        });
        positions.forEach((pos, i) => {
            const home = FIELD.FIELDER_HOMES[pos];
            const p = this.makePlayer(fc, pos);
            p._fieldPosition = pos;
            if (fromDugout) {
                // One spaced queue; distant positions depart first so close
                // fielders do not park across their teammates' running lanes.
                p.setPosition(fieldDug.x+(fieldDug.x<0?-1:1)*i*28,fieldDug.y+(pos==='C'?84:0));
                this.time.delayedCall(i*180,() => {
                    if (p.active && this._teamEntry === entry) this.travelDugout(p,fieldDug,home,pos,true,125,arrived);
                });
            } else {
                p.setPosition(home.x, home.y);
            }
            this.fielders[pos] = p;
        });

        this.createBatter(fromDugout ? batDug : null, fromDugout ? arrived : null);
        if (!fromDugout && onReady) onReady();
    }

    // Build (or rebuild) the batter with a fresh bat. Pass a dugout point to
    // have him jog in from there — used at half-inning swaps AND whenever the
    // previous batter took off running (the next batter steps in).
    createBatter(fromPoint, onReady) {
        // Both hitters enter from the dugout; finish setup only after each arrives.
        let remaining = 2;
        const arrived = () => { if (--remaining === 0 && onReady) onReady(); };
        if (this.bat && this.bat.active) { this.stopPlayerMovement(this.bat); this.bat.destroy(); }
        if (this.batter && this.batter.active) { this.stopPlayerMovement(this.batter); this.batter.destroy(); }
        this._batterRunning = false;

        const bc = this.battingColor();
        this.batter = this.makePlayer(bc, 'B');
        this.bat = null;
        if (!this.batter._bb2) {
            // Circle fallback only — the sprite batter has the bat baked
            // into its own frames (batter-actions.png).
            // Bat: v1-exact placement — knob pivots at the batter's center
            // (4px up), resting at -135° (up-back over the shoulder)
            this.ensureBatTexture();
            this.bat = this.add.image(0, -4, 'bat-shape').setOrigin(0.07, 0.5).setAngle(-135);
            this.batter.add(this.bat);
            this.startBatWaggle();
        }
        if (fromPoint) {
            this.batter.setPosition(fromPoint.x, fromPoint.y);
            const batter = this.batter;
            this.time.delayedCall(200, () => {
                if (batter.active) this.travelDugout(batter,fromPoint,FIELD.BATTER_BOX,'B',true,110,arrived,'walk');
            });
        } else {
            this.batter.setPosition(FIELD.BATTER_BOX.x, FIELD.BATTER_BOX.y);
        }
        this.updateOnDeckBatter(!!fromPoint, fromPoint ? arrived : null);
    }

    // The waiting hitter is promoted into the box after a plate appearance.
    updateOnDeckBatter(walkIn = false, onReady) {
        this.clearOnDeckBatter();
        const sprite = this.makePlayer(this.battingColor(), '', 'B');
        if (!sprite._bb2) {
            // Circle fallback has an infinite breathing tween on its
            // children (see makePlayer()) — kill it before destroying, the
            // same as every other teardown site in this file does.
            this.stopPlayerMovement(sprite.list);
            sprite.destroy();
            if (onReady) onReady();
            return;
        }
        const x = this.isPlayerBatting() ? FIELD.HOME.x - 155 : FIELD.HOME.x + 155;
        sprite._onDeck = true;
        const dug = this.isPlayerBatting() ? FIELD.DUGOUT.player : FIELD.DUGOUT.cpu;
        sprite.setPosition(walkIn ? dug.x : x, walkIn ? dug.y+32 : FIELD.HOME.y+28);
        sprite.idleAnim();
        this.onDeckBatter = sprite;
        if (walkIn) this.travelDugout(sprite,dug,{x,y:FIELD.HOME.y+28},'on_deck',true,105,onReady,'walk');
        else if (onReady) onReady();
    }

    clearOnDeckBatter() {
        if (this.onDeckBatter && this.onDeckBatter.active) { this.stopPlayerMovement(this.onDeckBatter);this.onDeckBatter.destroy(); }
        this.onDeckBatter = null;
    }

    // On contact the batter DROPS THE BAT at the plate and becomes the runner.
    // Returns the batter container to use as the batter-runner sprite.
    batterTakesOff() {
        if (this._batterRunning) return this.batter;
        this._batterRunning = true;
        if (this.batter) this.batter._baseRunner = true;
        this.bb2Anim(this.batter, 'take_off');
        if (this.bat && this.bat.active) {
            this.stopPlayerMovement(this.bat);
            // Re-anchor the bat to the world at its current spot, then let it
            // drop to the ground and fade
            const wx = this.batter.x + this.bat.x, wy = this.batter.y + this.bat.y;
            this.batter.remove(this.bat);
            this.bat.setPosition(wx, wy);
            this.tweens.add({ targets: this.bat, angle: 14, x: wx - 8, y: wy + 20, duration: 200, ease: 'Quad.easeIn' });
            this.tweens.add({
                targets: this.bat, alpha: 0, delay: 380, duration: 280,
                onComplete: () => { if (this.bat) { this.bat.destroy(); this.bat = null; } }
            });
        }
        return this.batter;
    }

    // The next batter steps in from the dugout side — unless that was the
    // third out, in which case nobody steps in (the sides are swapping)
    resetBatter(outcome) {
        if (['Ball','Strike','Foul','Steal','Caught Stealing'].includes(outcome)) return;
        if (this._swingRevertCall) { this._swingRevertCall.remove(false);this._swingRevertCall = null; }
        if (this.gs.outs >= GAME_CONSTANTS.GAME_RULES.MAX_OUTS || this.gs.gameOver) {
            this.departPlayer(this.batter);
            this.departPlayer(this.onDeckBatter);
            this._batterRunning = false;
            this.batter = null;this.onDeckBatter = null;this.bat = null;
            return;
        }
        const dug = this.isPlayerBatting() ? FIELD.DUGOUT.player : FIELD.DUGOUT.cpu;
        const previous = this.batter, next = this.onDeckBatter;
        if (!next || !next.active) {
            if (!Object.values(this.runnerDots || {}).includes(previous)) this.departPlayer(previous);
            this.batter = null;this.createBatter(dug);return;
        }
        // A safe batter becomes the persistent runner at the bag. An out or
        // scoring batter leaves from his current position, without replacement.
        if (previous && previous.active && !Object.values(this.runnerDots || {}).includes(previous)) {
            this.departPlayer(previous);
        }
        this.batter = next;this.onDeckBatter = null;this.bat = null;
        next._onDeck = false;next._baseRunner = false;this._batterRunning = false;
        if (next._label) next._label.setText('B');
        this._lineupBusy = true;
        this.jog(next,FIELD.BATTER_BOX.x,FIELD.BATTER_BOX.y,
            Math.hypot(next.x-FIELD.BATTER_BOX.x,next.y-FIELD.BATTER_BOX.y)/105*1000/1.5,'Linear',()=>{
                next.setAnim('stance',true);this._lineupBusy = false;
            },'walk');
        this.updateOnDeckBatter(true);
    }

    departPlayer(p) {
        if (!p || !p.active || p._leavingField) return;
        p._leavingField = true;
        p._exitDug = p._exitDug || (this.isPlayerBatting() ? FIELD.DUGOUT.player : FIELD.DUGOUT.cpu);
        this._departingPlayers = this._departingPlayers || new Set();
        this._departingPlayers.add(p);
        this.stopPlayerMovement(p);
        if (!p._baseRunner) p._onDeck = true;
        if (p._label) p._label.setText('');
        const slot = (this._exitSlot = (this._exitSlot || 0) + 1) % 9;
        const dug = p._exitDug;
        const exit={x:dug.x+(dug.x<0?-1:1)*(slot%3)*24,y:dug.y+(p._baseRunner?140:0)+Math.floor(slot/3)*24};
        this.travelDugout(p,exit,{x:p.x,y:p.y},p._baseRunner?'runner':'B',false,110,() => {
            this._departingPlayers.delete(p);p.destroy();
            if (p._afterFieldExit) { const done=p._afterFieldExit;p._afterFieldExit=null;done(); }
        },p._baseRunner?'run':'walk');
    }

    // Travel time follows distance: outfielders need longer than infielders.
    // Arrival callbacks, rather than a timer, decide when the next team enters.
    swapSides(cb) {
        if (this._sidesChanging) return;
        this._sidesChanging = true;
        this.setMenu(null);
        const newBattingIsPlayer = this.isPlayerBatting();
        const fieldDug = newBattingIsPlayer ? FIELD.DUGOUT.player : FIELD.DUGOUT.cpu;
        const batDug = newBattingIsPlayer ? FIELD.DUGOUT.cpu : FIELD.DUGOUT.player;
        const outgoing = Object.values(this.fielders).sort((a,b)=>Math.hypot(a.x-fieldDug.x,a.y-fieldDug.y)-Math.hypot(b.x-fieldDug.x,b.y-fieldDug.y)).map((p,i) => ({p,dug:fieldDug,slot:i,speed:125,gait:'run',role:p._fieldPosition}));
        const hitters = new Set([this.batter,this.onDeckBatter,...(this._departingPlayers || [])]);
        let slot = 0;
        for (const p of hitters) if (p && p.active) outgoing.push({p,dug:p._exitDug || batDug,slot:slot++,speed:110,gait:p._baseRunner?'run':'walk',role:p._baseRunner?'runner':p._onDeck?'on_deck':'B'});
        const active = outgoing.filter(({p}) => p && p.active);
        let remaining = active.length;
        const enter = () => this.createTeams(true, () => {
            this._sidesChanging = false;
            if (cb) cb();
        });
        if (!remaining) { enter();return; }
        active.forEach(({p,dug,slot,speed,gait,role},i) => {
            if (p._leavingField) {
                // A retired runner is already on a smooth exit route. Subscribe
                // to that arrival instead of stopping and sending him backwards.
                p._afterFieldExit=()=>{if (--remaining===0) enter();};
                return;
            }
            this.stopPlayerMovement(p);
            this.time.delayedCall(i * 180, () => {
                const arrived = () => {
                    if (this._departingPlayers) this._departingPlayers.delete(p);
                    p.destroy();
                    if (--remaining === 0) enter();
                };
                if (!p.active) { arrived();return; }
                const exit={x:dug.x+(dug.x<0?-1:1)*(slot%3)*24,y:dug.y+(p._baseRunner?140:0)+Math.floor(slot/3)*24};
                this.travelDugout(p,exit,{x:p.x,y:p.y},role,false,speed,arrived,gait);
            });
        });
    }

    travelDugout(p,dug,home,role,entering,speed,cb,gait='run') {
        const left=dug.x<0,side=left?180:820;
        let guides=[];
        if (role==='C') {
            // Catcher goes behind home plate, clear of the batter and mound.
            guides=[{x:side,y:590},{x:500,y:590}];
        } else if (['LF','CF','RF'].includes(role)) {
            const across=left?(home.x-260)/480:(740-home.x)/480;
            guides=[{x:left?140:860,y:310-60*Phaser.Math.Clamp(across,0,1)}];
        } else if (role==='on_deck') guides=[{x:side,y:565}];
        else if (role==='B') guides=[{x:side,y:510}];
        else if (role==='runner' && !entering) {
            // Retired runners peel into foul territory, rather than cut
            // through the mound and players waiting on the infield.
            guides=[{x:side,y:600},{x:home.x>520?720:home.x<480?280:left?280:720,y:600}];
        }
        const points=entering?[...guides,home]:[...guides.reverse(),dug];
        this.followTransitionPath(p,points,speed,cb,gait);
    }

    followTransitionPath(p,points,speed,cb,gait) {
        // Round guide corners while retaining collision checks on every leg.
        const path=[{x:p.x,y:p.y},...points],smooth=[];
        for(let i=1;i<path.length-1;i++) {
            const a=path[i-1],b=path[i],c=path[i+1];
            const ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y);
            const cut=Math.min(30,ab*.25,bc*.25);
            if(cut<1){smooth.push(b);continue;}
            const before={x:b.x+(a.x-b.x)*cut/ab,y:b.y+(a.y-b.y)*cut/ab};
            const after={x:b.x+(c.x-b.x)*cut/bc,y:b.y+(c.y-b.y)*cut/bc};
            smooth.push(before);
            for(let j=1;j<=5;j++) {
                const t=j/5,u=1-t;
                smooth.push({x:u*u*before.x+2*u*t*b.x+t*t*after.x,y:u*u*before.y+2*u*t*b.y+t*t*after.y});
            }
        }
        smooth.push(path[path.length-1]);
        p._transitionPath=smooth;
        let i=0;
        const next=()=>{
            if(!p.active)return;
            if(i===smooth.length){p._transitionPath=null;this.stopBob(p);if(cb)cb();return;}
            const point=smooth[i++];this.jogToPosition(p,point.x,point.y,speed,next,gait);
        };
        next();
    }

    jogToPosition(p, x, y, speed, cb, gait = 'run') {
        const duration = Math.hypot(x-p.x,y-p.y) / speed * 1000;
        return this.jog(p,x,y,duration/1.5,'Linear',cb,gait);
    }

    // Reconcile game-state bases with the actors that actually ran there.
    // Retain identity and position; nobody is deleted/recreated at a base.
    syncRunners() {
        const old = this.runnerDots || {};
        const candidates = new Set(this._settledRunners || []);
        for (const [key,p] of Object.entries(old)) if (p && p.active) {
            if (!p._runnerBase) p._runnerBase = key;
            candidates.add(p);
        }
        if (this._batterRunning && this.batter) candidates.add(this.batter);
        this.runnerDots = {first:null,second:null,third:null};
        const inningOver = this.gs.outs >= GAME_CONSTANTS.GAME_RULES.MAX_OUTS || this.gs.gameOver;
        for (const key of ['first','second','third']) {
            const occupant = !inningOver && this.gs.bases[key];
            if (!occupant) continue;
            let runner = [...candidates].find(p => p && p.active && !p._leavingField && !p._runnerOut && p._runnerBase === key);
            const base = BASE_COORDS[key];
            if (!runner) {
                // Saved games may start with occupied bases but no live actor.
                const col = occupant === 'user' ? TEAM_COLORS.player : TEAM_COLORS.cpu;
                runner = this.makePlayer(col,'R');
                const dug = occupant === 'user' ? FIELD.DUGOUT.player : FIELD.DUGOUT.cpu;
                runner.setPosition(dug.x,dug.y+72+['first','second','third'].indexOf(key)*24);
            }
            candidates.delete(runner);
            runner._baseRunner = true;runner._onDeck = false;runner._runnerBase = key;
            if (runner._label) runner._label.setText('R');
            this.runnerDots[key] = runner;
            if (Math.hypot(runner.x-base.x-16,runner.y-base.y+14)>.5) {
                this.jogToPosition(runner,base.x+16,base.y-14,95,null,'run');
            } else this.stopBob(runner);
        }
        for (const runner of candidates) {
            if (runner && runner.active && !runner._leavingField && !runner._runnerOut && !inningOver && runner._runnerBase === 'home') {
                // A scoring runner still finishes crossing home before exiting.
                this._departingPlayers = this._departingPlayers || new Set();
                this._departingPlayers.add(runner);
                runner._exitDug = this.isPlayerBatting() ? FIELD.DUGOUT.player : FIELD.DUGOUT.cpu;
                this.jogToPosition(runner,FIELD.HOME.x+16,FIELD.HOME.y-14,95,()=>this.departPlayer(runner));
            } else this.departPlayer(runner);
        }
        this._settledRunners = null;
        this.updateHUD();
    }

    startBob(p) {
        if (p && p._bb2) { p.runAnim(); return; }
        if (p._bob) return;
        p._bob = this.tweens.add({
            targets: p, scaleY: 0.84, scaleX: 1.12,
            duration: 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
    }

    stopBob(p) {
        if (p && p._bb2) { p.idleAnim(); return; }
        if (p._bob) { p._bob.stop(); p._bob = null; }
        p.setScale(1);
    }

    // One-shot action animation, silently ignored on circle-fallback players,
    // positions whose sheet doesn't define that anim, or a sprite that has
    // since been destroyed — several of these calls fire from a
    // delayedCall scheduled earlier in a play, and the sprite it targets
    // can be destroyed (a new batter, a cleared runner) before that timer
    // fires.
    bb2Anim(p, name) {
        if (p && p._bb2 && p.active) p.setAnim(name, true);
    }

    // All player movement is slowed ~50% so the game reads better visually
    // (same rule as the football game)
    jog(p, x, y, duration, ease, cb, gait = 'run') {
        if (p && p._bb2) p.faceFrom(x - p.x, y - p.y);
        if (gait === 'walk' && p.walkAnim) p.walkAnim(); else this.startBob(p);
        // A redirected player owns just one route. Only an actual arrival
        // completes this leg and starts any chained fielding action.
        return this.movePlayer({
            targets: p, x, y, duration: duration * 1.5, gait,
            onComplete: () => {
                if (!p._transitionPath) this.stopBob(p);
                if (cb) cb();
            }
        });
    }

    // Possession release: when the last flight/chase ends, the spin stops —
    // a held ball is a still ball
    releaseBall() {
        this._ballBusy = Math.max(0, (this._ballBusy || 0) - 1);
        if (this._ballBusy === 0) this.setBallSpin(false);
    }

    // Visually tucks the ball away the instant it's secured in a glove —
    // separate from this.ball.visible, which has to stay true for the
    // nextPlay()/returnBallToPitcher() "is this play still resolving" gate.
    // Alpha snaps back to 1 the next time ballArc()/cpuPitchFlight() sends it
    // anywhere, so callers never need to pair this with an un-hide.
    hideHeldBall(holder = null) {
        this.ball.setAlpha(0);
        if (holder) this._ballHolder = holder;
    }

    defensiveAction(p, name, contact, done, hold = false) {
        if (p._spr && p.playFieldAction && p.playFieldAction(name, contact, done, hold)) return;
        // Circle fallback and non-rendering simulations use the same clip timing.
        const {clip} = this.fieldingClip(p, name);
        p._busy = true;this.bb2Anim(p, name);
        this.time.delayedCall((clip.contactFrame || 0) / clip.rate * 1000, () => {
            const finish = () => this.time.delayedCall(Math.max(80, ((clip.count || 8) - (clip.contactFrame || 0)) / clip.rate * 1000), () => {
                p._busy = false;if (p.active && p.idleAnim) p.idleAnim();if (done) done();
            });
            if (!hold) finish();
            if (contact) contact(hold ? finish : () => {});
        });
    }

    throwAction(p) {
        return p === this.fielders.C ? 'rise_throw'
            : ['LF','CF','RF'].some(pos => this.fielders[pos] === p) ? 'throw_relay' : 'throw';
    }

    receiveAction(p) {
        return p === this.fielders.C ? 'receive'
            : p === this.fielders['1B'] ? 'stretch_catch' : 'receive_at_bag';
    }

    // Secure -> transfer -> step/throw -> release -> receive -> recover.
    // Own the ball during the windup too, so a reset cannot steal it early.
    throwToPlayer(thrower, receiver, options = {}, cb) {
        const begin=()=>{
            const action = this.throwAction(thrower);
            const receive = this.receiveAction(receiver);
            this.stopPlayerMovement(thrower);this.stopBob(thrower);
            if (thrower._spr) thrower._spr.setFlipX(receiver.x < thrower.x - 12);
            this.hideHeldBall(thrower);this.ball.setVisible(true);
            this._ballBusy = (this._ballBusy || 0) + 1;
            if(options.onWindup)options.onWindup();
            this.defensiveAction(thrower, action, () => {
                const from = thrower.ballPoint ? thrower.ballPoint('hand') : {x:thrower.x,y:thrower.y-14};
                const target = () => receiver.actionPoint ? receiver.actionPoint(receive,'glove') : {x:receiver.x,y:receiver.y-12};
                const to = target();
                const requested = typeof options.duration === 'function' ? options.duration(from,to)
                    : options.duration || Math.max(360, Math.hypot(to.x-from.x,to.y-from.y)/.5);
                const {clip} = this.fieldingClip(receiver, receive);
                // Short relays are soft tosses: allow the glove to open before arrival.
                const duration = Math.max(requested, (clip.contactFrame || 0)/clip.rate*1000 + 120);
                let landed = false, gloveReady = false, resumeReceive = null, caught = false;
                const settle = () => {
                    if (!landed || !gloveReady || caught) return;
                    caught = true;
                    const glove = receiver.ballPoint ? receiver.ballPoint('glove') : target();
                    this.ball.setPosition(glove.x,glove.y);this.hideHeldBall(receiver);
                    this.audio.play('catch');this.releaseBall();resumeReceive();
                    if (cb) cb();
                };
                this.time.delayedCall(Math.max(0, duration - (clip.contactFrame || 0)/clip.rate*1000 - 100), () => {
                    this.stopPlayerMovement(receiver);this.stopBob(receiver);
                    if (receiver._spr) receiver._spr.setFlipX(thrower.x < receiver.x - 12);
                    this.defensiveAction(receiver, receive, resume => {
                        resumeReceive = resume;gloveReady = true;settle();
                    }, options.onReceiveDone, true);
                });
                this.audio.play('throw');
                this.ballArc(from, target, duration, options.arc == null ? 28 : options.arc, () => {
                    landed = true;settle();
                });
                if (options.onRelease) options.onRelease(duration);
            });
        };
        // Let a covering/cutoff fielder finish his real route before asking
        // him to plant and receive. The catch pose must not cancel coverage.
        if(this.playerMotion().moves.has(receiver)) {
            this.stopPlayerMovement(thrower);this.stopBob(thrower);this.hideHeldBall(thrower);
            this._ballBusy=(this._ballBusy || 0)+1;
            const wait=()=>{
                if(!thrower.active || !receiver.active){this.releaseBall();return;}
                if(this.playerMotion().moves.has(receiver)){this.time.delayedCall(60,wait);return;}
                this.releaseBall();begin();
            };
            wait();
        } else begin();
    }

    // Spin control that can never crash even if the tween was killed
    setBallSpin(on) {
        const s = this.ball && this.ball.spin;
        if (!s) return;
        try { if (on) s.resume(); else s.pause(); }
        catch (e) { this.ball.spin = null; }
    }

    // v1's exact per-pitch movement (AnimationSystem.calculatePitchMovement):
    // curveball bends, slider breaks late, knuckleball wobbles, changeup
    // drops at the end, fastball is straight.
    pitchOffset(pitchType, t) {
        switch (pitchType) {
            case 'Curveball':
                return { dx: Math.sin(t * Math.PI) * 25, dy: Math.sin(t * Math.PI * 0.5) * 15 };
            case 'Slider':
                return { dx: t > 0.7 ? (t - 0.7) * 40 : 0, dy: 0 };
            case 'Knuckleball':
                return { dx: Math.sin(t * Math.PI * 6) * 8, dy: Math.cos(t * Math.PI * 4) * 6 };
            case 'Changeup':
                return { dx: 0, dy: t > 0.8 ? (t - 0.8) * 30 : 0 };
            default:
                return { dx: 0, dy: 0 };
        }
    }

    // CPU pitch flight with v1's per-type speed and movement. Returns the
    // flight duration so the batter's swing can be timed to it.
    cpuPitchFlight(pitchType, cb, hitBatter=false) {
        const from = this.pitchReleasePoint(), to = hitBatter?this.batterHitPoint():this.swingContactPoint('normal');
        const durations = { Fastball: 600, Changeup: 900, Curveball: 800, Slider: 700, Knuckleball: 1000 };
        const duration = durations[pitchType] || 700;
        if (this._ballFlight && this._ballFlight.isPlaying()) this._ballFlight.stop();
        this._ballHolder = null;
        this.ball.setVisible(true).setAlpha(1);
        this.ball.setPosition(from.x, from.y);
        this.setBallSpin(true);
        this._ballBusy = (this._ballBusy || 0) + 1;
        let settled = false;
        const settle = () => {
            if (!settled) {
                settled = true;
                this.releaseBall();
            }
        };
        const proxy = { t: 0 };
        this._ballFlight = this.tweens.add({
            targets: proxy, t: 1, duration, ease: 'Linear',
            onUpdate: () => {
                const off = this.pitchOffset(pitchType, proxy.t);
                const bend = Math.sin(Math.PI * proxy.t);
                this.ball.x = Phaser.Math.Linear(from.x, to.x, proxy.t) + off.dx*bend;
                this.ball.y = Phaser.Math.Linear(from.y, to.y, proxy.t) - bend*10 + off.dy*bend;
            },
            onStop: settle,
            onComplete: () => { settle(); if (cb) cb(); }
        });
        return duration;
    }

    // Ball travels from → to in an arc. Only ONE ball flight can exist at a
    // time (a new arc cancels the previous), and _ballBusy tracks whether the
    // ball is still in the air / being chased so nothing else (like the
    // end-of-play toss to the pitcher) can grab it mid-flight.
    ballArc(from, to, duration, arcHeight, cb, sample = null) {
        if (this._ballFlight && this._ballFlight.isPlaying()) this._ballFlight.stop();
        this._ballHolder = null;
        this.ball.setVisible(true).setAlpha(1);
        this.ball.setPosition(from.x, from.y);
        this.setBallSpin(true);
        this._ballBusy = (this._ballBusy || 0) + 1;
        let settled = false;
        const settle = () => {
            if (!settled) {
                settled = true;
                this.releaseBall();
            }
        };
        const proxy = { t: 0 };
        this._ballFlight = this.tweens.add({
            targets: proxy, t: 1, duration, ease: 'Linear',
            onUpdate: () => {
                const t = proxy.t;
                const end = typeof to === 'function' ? to() : to;
                const point=sample?sample(t):{x:Phaser.Math.Linear(from.x,end.x,t),
                    y:Phaser.Math.Linear(from.y,end.y,t)-Math.sin(Math.PI*t)*arcHeight};
                this.ball.x=point.x;this.ball.y=point.y;
            },
            onStop: settle,
            onComplete: () => { settle(); if (cb) cb(); }
        });
        return this._ballFlight;
    }

    // Camera helpers — ported verbatim in behavior from football's game.js
    _zoomOnPoint(wx, wy, zoom, duration) {
        this._viewRequest = {x:wx,y:wy,zoom};
        // Match the batting close-up: give fielding action the full view,
        // instead of magnifying screen-pinned scores over the receiver.
        (this.hudAll || []).forEach(o => o.setVisible(zoom === 1 && !this._battingCam));
        const cam = this.cameras.main, scale = this._renderScale || 1;
        if (this._cameraMove) this._cameraMove.stop();
        this._cameraMove = null;
        const targetX = Math.max(0, Math.min(W-W/zoom, wx-W/(2*zoom)));
        const targetY = Math.max(0, Math.min(H-H/zoom, wy-H/(2*zoom)));
        if (duration === 0) {
            cam.setScroll(targetX, targetY).setZoom(zoom * scale);
            return;
        }
        this._cameraMove = this.tweens.add({targets:cam,scrollX:targetX,scrollY:targetY,zoom:zoom*scale,
            duration, ease:'Sine.easeOut'});
    }

    _zoomOut(duration = 340) {
        this._zoomOnPoint(W/2,H/2,1,duration);
    }

    resetFieldCamera(duration = 380) {
        // Fielding and base-selection close-ups can be active even when the
        // batting camera flag is off. Reset the actual view and all pinned UI.
        this._battingCam = false;
        this._zoomOut(duration);
        [this.meter, this.powerMeter].filter(Boolean).forEach(c => {
            c.setScrollFactor(0);
            c.setScale(1);
            c.setPosition(0, 0);
        });
    }

    // ─── HUD — replicated 1:1 from the ORIGINAL game's scoreboard ──────────
    // Top-center black bar: "INNING: TOP 3    OUTS: 1/3" (white monospace).
    // Big scores on gray translucent blocks left (away) and right (home),
    // colored by team. Bottom-right count panel: STRIKES (3 red diamonds)
    // and BALLS (4 white circles) with centered labels — v1's exact offsets.
    createHUD() {
        this.hudAll = [];
        const add = (o) => { this.hudAll.push(o); return o; };

        this.topBarGfx = add(this.add.graphics().setDepth(50).setScrollFactor(0));
        this.topText = add(this.add.text(W / 2, 32, '', {
            fontSize: '20px', fontFamily: 'Courier New', fontStyle: 'bold', color: '#ffffff',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(51).setScrollFactor(0));

        this.scoreBg = add(this.add.graphics().setDepth(50).setScrollFactor(0));
        const scoreStyle = {
            fontSize: '60px', fontFamily: 'Arial', fontStyle: 'bold', color: '#ffffff',
            stroke: '#10252b', strokeThickness: 2
        };
        this.scoreAwayTxt = add(this.add.text(196, 62, '0', scoreStyle).setOrigin(0.5).setDepth(51).setScrollFactor(0));
        this.scoreHomeTxt = add(this.add.text(W-54, 62, '0', scoreStyle).setOrigin(0.5).setDepth(51).setScrollFactor(0));

        const teamStyle = {fontSize:'17px',fontFamily:'Arial',fontStyle:'bold',color:'#f3f5e9'};
        this.awayLabel = add(this.add.text(38,36,'',teamStyle).setDepth(51).setScrollFactor(0));
        this.homeLabel = add(this.add.text(W-232,36,'',teamStyle).setDepth(51).setScrollFactor(0));

        // Count panel (bottom-right, v1 dimensions 120x80)
        this.hudGfx = add(this.add.graphics().setDepth(50).setScrollFactor(0));
        const cx = W - 80, top = H - 104;
        this.hudAll.push(this.add.text(cx, top + 14, 'STRIKES', {
            fontSize: '12px', fontFamily: 'Courier New', fontStyle: 'bold', color: '#ffffff'
        }).setOrigin(0.5).setDepth(51).setScrollFactor(0));
        this.hudAll.push(this.add.text(cx, top + 50, 'BALLS', {
            fontSize: '12px', fontFamily: 'Courier New', fontStyle: 'bold', color: '#ffffff'
        }).setOrigin(0.5).setDepth(51).setScrollFactor(0));

        // Keep result messages centered at a fixed screen size. Scroll factor
        // alone does not cancel camera zoom; compensate on the parent so the
        // text's pop-in animation can keep using its own scale.
        this.messageOverlay = this.add.container(0, 0).setDepth(60).setScrollFactor(0);
        this.msgText = this.add.text(W / 2, H / 2, '', {
            fontSize: '52px', fontFamily: 'Arial Black', color: '#ffe14d',
            stroke: '#000', strokeThickness: 8
        }).setOrigin(0.5).setDepth(60).setScrollFactor(0).setVisible(false);
        this.messageOverlay.add(this.msgText);
        this.events.on('prerender', this.layoutMessageOverlay, this);
        this.events.once('shutdown', () => {
            this.events.off('prerender', this.layoutMessageOverlay, this);
            if(this._menuLayout)this.events.off('prerender',this._menuLayout);
            this.resetInteractiveBatting();
        });
        this.layoutMessageOverlay();

        this.updateHUD();
    }

    updateHUD() {
        const gs = this.gs;
        const awayName = gs.playerIsAway ? TEAM_COLORS.player.name : TEAM_COLORS.cpu.name;
        const homeName = gs.playerIsAway ? TEAM_COLORS.cpu.name : TEAM_COLORS.player.name;

        // Top bar (v1: "INNING: TOP 3       OUTS: 1/3")
        this.topText.setText(`INNING: ${gs.half.toUpperCase()} ${gs.inning}       OUTS: ${gs.outs}/3`);
        const tb = this.topBarGfx;
        tb.clear();
        tb.fillStyle(0x000000, 0.7);
        const barW = this.topText.width + 40;
        tb.fillRect(W / 2 - barW / 2, 14, barW, 36);

        const bg = this.scoreBg;bg.clear();
        for (const [x,name,score,label,number] of [[20,awayName,gs.score.Red,this.awayLabel,this.scoreAwayTxt],
            [W-250,homeName,gs.score.Blue,this.homeLabel,this.scoreHomeTxt]]) {
            const color=getColorByName(name),black=name==='Black';
            bg.fillStyle(0x10252b,1);bg.fillRoundedRect(x,20,230,86,10);
            if(black){bg.lineStyle(7,0xaaaaaa,1);bg.strokeRoundedRect(x,20,230,86,10);}
            bg.lineStyle(4,color.hex,1);bg.strokeRoundedRect(x,20,230,86,10);
            bg.fillStyle(color.hex,1);bg.fillRect(x+4,90,222,12);
            label.setText((x===20?'AWAY':'HOME')+'\n'+name.toUpperCase()).setColor('#ffffff');
            number.setText(String(score)).setColor('#ffffff').setStroke('#07151a',2)
                .setFontSize(String(score).length>2?'48px':'60px');
        }

        // Count panel — v1's exact drawing and offsets
        const g = this.hudGfx;
        g.clear();
        const cx = W - 80, top = H - 104;
        g.fillStyle(0x000000, 0.8);
        g.fillRect(cx - 60, top, 120, 84);
        g.lineStyle(2, 0xffffff, 1);
        g.strokeRect(cx - 60, top, 120, 84);

        const drawDiamond = (x, y, r) => {
            g.beginPath();
            g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y);
            g.closePath(); g.fillPath();
            g.strokePath();
        };
        // STRIKES: 3 red diamonds at v1's offsets (-24, +4, +32)
        for (let i = 0; i < 3; i++) {
            const on = i < gs.strikes;
            g.fillStyle(0xff4444, on ? 1 : 0.2);
            g.lineStyle(1, on ? 0xff0000 : 0x666666, 1);
            drawDiamond(cx - 24 + i * 28, top + 32, 8);
        }
        // BALLS: 4 white circles at v1's offsets (-36, -8, +20, +48)
        for (let i = 0; i < 4; i++) {
            const on = i < gs.balls;
            g.fillStyle(0xffffff, on ? 1 : 0.2);
            g.lineStyle(1, on ? 0xcccccc : 0x666666, 1);
            g.fillCircle(cx - 36 + i * 28, top + 68, 8);
            g.strokeCircle(cx - 36 + i * 28, top + 68, 8);
        }
    }

    layoutMessageOverlay() {
        this.messageOverlay.setScale((this._renderScale || 1) / this.cameras.main.zoom);
    }

    showPitchCall(outcome) {
        const labels = {Ball:'BALL',Strike:'STRIKE',Foul:'FOUL BALL',
            Walk:'BALL FOUR - WALK','Strike Out':'STRIKE OUT','Hit By Pitch':'HIT BY PITCH'};
        const label=labels[outcome];
        if (!label) return;
        this.bigMessage(label,2200);
    }

    bigMessage(text, ms, cb) {
        if (this._messageHideCall) this._messageHideCall.remove(false);
        this.tweens.killTweensOf(this.msgText);
        this.msgText.setAlign('center').setText(text).setVisible(true).setScale(0.4).setAlpha(1);
        this.tweens.add({
            targets: this.msgText, scale: 1, duration: 240, ease: 'Back.easeOut'
        });
        this._messageHideCall = this.time.delayedCall(ms || 1400, () => {
            this.tweens.add({
                targets: this.msgText, alpha: 0, duration: 260,
                onComplete: () => { this.msgText.setVisible(false); if (cb) cb(); }
            });
        });
    }

    // ─── Input — the canonical hub ScanInput scheme (same as football) ───────
    // SPACE tap = scan forward, SPACE 3s hold = scan backward, ENTER = select.
    // During the pitch, holding ENTER (or touch-and-hold) charges the swing.
    wireInput() {
        this.scanInput = new ScanInput(this, {
            forward: () => { if (this.menu && this.menu.active) this.menu.next(false); },
            backward: () => { if (this.menu && this.menu.active) this.menu.prev(false); },
            select: () => { if (this.menu && this.menu.active) this.menu.select(); },
            isChargePhase: () => this.ib.active && (this.ib.waitingForSwing || this.ib.swingPressed),
            chargeStart: () => this.onSwingStart(),
            chargeRelease: () => this.onSwingRelease()
        });
        // Arrow keys as extra conveniences (mouse users)
        this.input.keyboard.on('keydown-RIGHT', (e) => {
            if (e.repeat || this.ib.active) return;
            if (this.menu && this.menu.active) this.menu.next(false);
        });
        this.input.keyboard.on('keydown-LEFT', (e) => {
            if (e.repeat || this.ib.active) return;
            if (this.menu && this.menu.active) this.menu.prev(false);
        });
    }

    setMenu(menu) {
        if (this.menu) { this.menu.destroy(); }
        this.menu = menu;
        if (menu) menu.setScrollFactor(0);
        if (this._menuLayout) this.events.off('prerender', this._menuLayout);
        this._menuLayout = null;
        if (menu && menu.container) {
            const zones = (menu.zones || []).map(z => ({z,x:z.x,y:z.y}));
            this._menuLayout = () => {
                const factor = (this._renderScale || 1) / this.cameras.main.zoom;
                menu.container.setScale(factor);
                for (const {z,x,y} of zones) z.setPosition(x*factor,y*factor).setScale(factor);
            };
            this.events.on('prerender', this._menuLayout);
            this._menuLayout();
        }
    }

    // ─── Game flow ───────────────────────────────────────────────────────────
    nextPlay() {
        if (this.gs.gameOver) return;
        if (this._lineupBusy || this._teamEntry || this._sidesChanging || Object.values(this.runnerDots || {}).some(p => p && this.playerMotion().moves.has(p))) { this.time.delayedCall(200,()=>this.nextPlay());return; }
        this.setDefenseReady(false);
        // The ball must be back with the pitcher before the next play can
        // start — no pitching while an outfielder is still holding it or the
        // throw-in is mid-flight.
        if (this.ball.visible || this._returnPending || (this._ballBusy || 0) > 0) {
            this.time.delayedCall(200, () => this.nextPlay());
            return;
        }
        // Controls must start at full-field scale, even if a previous close-up
        // or resize interrupted the end-of-play transition.
        this.resetFieldCamera(0);
        if (this.gs.firstPitch) { this.announceHalfInning(); return; }
        if (this.gs.outs >= GAME_CONSTANTS.GAME_RULES.MAX_OUTS) {
            this.endHalfInning();
        } else if (this.isPlayerBatting()) {
            this.startBattingPhase();
        } else {
            this.startPitchingPhase();
        }
    }

    announceHalfInning() {
        this.gs.firstPitch = false;
        const inn = ORDINALS[this.gs.inning] || `inning ${this.gs.inning}`;
        const halfText = this.gs.half === 'top' ? 'Top' : 'Bottom';
        const battingTeam = this.isPlayerBatting() ? TEAM_COLORS.player.name : TEAM_COLORS.cpu.name;
        this.audio.speak(`${halfText} of the ${inn}. ${battingTeam} batting.`);
        this.updateHUD();
        this.time.delayedCall(3800, () => this.nextPlay());
    }

    // ══════════════════════════════════════════════════════════════════════
    // PLAYER BATTING (charge mechanic ported from v1)
    // ══════════════════════════════════════════════════════════════════════
    startBattingPhase() {
        this.resetInteractiveBatting();
        // CPU picks its pitch secretly (v1 simulateComputerPitch)
        this.gs.selectedPitch = PITCH_TYPES[Math.floor(Math.random() * PITCH_TYPES.length)];
        this.gs.selectedPitchLocation = BATTING_PITCH_LOCATIONS[Math.floor(Math.random() * BATTING_PITCH_LOCATIONS.length)];
        this.showBattingMenu();
    }

    showBattingMenu() {
        if (this.ib.awaitingChoice) { this.showSwingChoices(); return; }
        this.setBattingCamera(false);
        const bases = this.gs.bases;
        // On-field selection, like the throw menu: the BATTER is highlighted
        // for "Ready to Bat" and each stealable BASE gets a big circled
        // highlight (same guards as v1 showStealMenu).
        const targets = [
            { value: 'bat', label: 'Ready to Swing', chip: 'READY TO SWING',
              hint: bb2BattingMode() === 'pick' ? 'Hear the pitch, then choose your swing when the ball stops' : 'Hold the button to charge your swing, let go to swing',
              fielder: this.batter }
        ];
        if (bases.first && !bases.second) {
            targets.push({ value: 'steal2', label: 'Steal 2nd Base', chip: 'STEAL 2ND',
                fielder: { x: BASE_COORDS.second.x, y: BASE_COORDS.second.y } });
        }
        if (bases.second && !bases.third) {
            targets.push({ value: 'steal3', label: 'Steal 3rd Base', chip: 'STEAL 3RD',
                fielder: { x: BASE_COORDS.third.x, y: BASE_COORDS.third.y } });
        }
        targets.push({ value: 'pause', label: 'Pause', chip: 'PAUSE',
            hint: 'Game options', fielder: { x: 74, y: H - 46 } });

        targets.forEach(opt=>{opt.speakText=()=>this.briefChoiceSpeech('setup:'+opt.value,opt.label,opt.hint);});
        this.setMenu(new BaseTargetSelector(this, {
            targets, audio: this.audio, title: 'Batter Up!', zoomOnScan: true,
            onSelect: (opt) => this.onBattingMenuSelect(opt)
        }));
    }

    onBattingMenuSelect(opt) {
        if (opt.value === 'pause') { this.showPauseMenu(() => this.showBattingMenu()); return; }
        this.setMenu(null);
        if (opt.value === 'bat') {
            if (bb2BattingMode() === 'pick') this.beginChoicePitch();
            else this.beginInteractivePitch();
            return;
        }
        if (opt.value === 'steal2') this.processStealAttempt('second');
        if (opt.value === 'steal3') this.processStealAttempt('third');
    }

    briefChoiceSpeech(key,label,explanation) {
        const heard=this.gs.heardChoiceHelp || (this.gs.heardChoiceHelp={});
        if(heard[key] || !explanation)return label;
        heard[key]=true;
        return label+'. '+explanation;
    }

    showSwingChoices() {
        if (!this.ib.awaitingChoice) return;
        this.setBattingCamera(true);
        const choices = [
            { value: 'normal', label: 'Normal', hint: 'Balanced contact and distance' },
            { value: 'power', label: 'Power', hint: 'Swing for extra bases, with more risk of a miss' },
            { value: 'bunt', label: 'Bunt', hint: 'Try a short bunt to advance runners' },
            { value: 'take', label: 'Take Pitch', hint: 'Let the pitch pass for a ball or called strike' }
        ];
        choices.push({ value: 'pause', label: 'Pause' });
        choices.forEach(opt=>{opt.speakText=()=>this.briefChoiceSpeech('swing:'+opt.value,opt.label,opt.hint);});
        // The delivered pitch is frozen at the sweet spot, with no choice deadline.
        // Compact panel beside home plate, clear of the batter and basepaths.
        // Keep the shared scanning, speech and pointer behavior unchanged.
        const menu = new ScanList(this, { x: 700, y: 480,
            columns: 2, itemW: 112, itemH: 44, gap: 8, fontSize: '16px', audio: this.audio,
            title: this.pitchProfile().spoken+'\n'+this.gs.selectedPitch+' | '+this.pitchProfile().display,
            options: choices, onSelect: opt => {
                if (opt.value === 'pause') { this.showPauseMenu(() => this.showSwingChoices()); return; }
                this.setMenu(null);
                this.beginSelectedPitch(opt.value);
            }
        });
        // Pitch information belongs below this small panel, away from the
        // first baseman above it. The shared widget keeps its default styling.
        menu.titleTxt.setFontSize('14px').setStroke('#000000', 3)
            .setWordWrapWidth(232).setAlign('center').setPosition(menu.x, 579);
        this.setMenu(menu);
        if(!this.ib.choiceAnnounced){
            this.ib.choiceAnnounced=true;
            this.audio.speak(this.briefChoiceSpeech('swingPrompt',this.pitchProfile().spoken,'Choose your swing, or take the pitch.'),true);
        }
    }

    beginChoicePitch() {
        if (this.ib.active || this.ib.awaitingChoice) return;
        this.setMenu(null);
        this.resetInteractiveBatting();
        const atBat = this.ib;
        atBat.active = true;
        this.hideSwingMeter();
        this.bb2Anim(this.batter, 'stance');
        const call = `${this.gs.selectedPitch}, ${this.pitchProfile().display}.`;
        this.meterTitle.setText(call).setColor('#ffffff');
        this.meter.setVisible(true);
        // The audible call finishes before delivery. TTS-off/error uses the
        // same completion callback, so speech availability never blocks play.
        this.audio.speak(call, true, () => {
            if (this.ib !== atBat || !atBat.active || (this.sys && !this.sys.isActive())) return;
            this.time.delayedCall(0, () => {
                if (this.ib !== atBat || !atBat.active) return;
                this.setBattingCamera(true);
                this.deliverPitch(650, () => {
                    if (this.ib !== atBat || !atBat.active) return;
                    this.audio.play('throw');
                    this.ballArc(this.pitchReleasePoint(), this.pitchReadPoint(), 1300, 12, () => {
                        if (this.ib !== atBat || !atBat.active) return;
                        atBat.active = false;
                        atBat.awaitingChoice = true;
                        atBat.pitchProgress = .9;
                        this.setBallSpin(false);
                        this.hideSwingMeter();
                        this.paintPitchCue(true);
                        this.audio.play('swingZone'+this.pitchProfile().tier);
                        this.showSwingChoices();
                    });
                });
            });
        });
    }

    beginSelectedPitch(choice) {
        if (this.ib.active || !this.ib.awaitingChoice || !['bunt','normal','power','take'].includes(choice)) return;
        this.ib.awaitingChoice = false;
        this.ib.active = true;
        this.ib.selectedSwing = choice;
        this.ib.waitingForSwing = false;
        this.ib.swingType = choice;
        this.ib.swingPowerLevel = choice === 'power' ? 0.9 : choice === 'bunt' ? 0.1 : 0.5;
        this.ib.timingScore = bb2SwingQuality(choice, this.gs.selectedPitch, this.gs.selectedPitchLocation);
        this.setBattingCamera(true);
        this.hideSwingMeter();
        this.bb2Anim(this.batter, choice === 'take' ? 'stance' : 'load_' + choice);
        this.audio.speak(choice === 'take' ? 'Taking the pitch.' : choice + ' swing.', true);
        const atBat = this.ib;
        // Resume this ball; selecting a swing must never deliver a second pitch.
        this.time.delayedCall(220, () => {
            if (this.ib !== atBat || !atBat.active) return;
            const lead = this.swingContactDelay(choice), flight = Math.max(180, lead);
            // The swing is judged against this frozen pitch, never a new bat-specific target.
            const from = {x:this.ball.x,y:this.ball.y}, to = {...from};
            this.setBallSpin(true);
            if (choice !== 'take') this.time.delayedCall(flight - lead, () => {
                if (this.ib !== atBat || !atBat.active) return;
                atBat.isSwinging = true;
                this.audio.play('swing');
                this.animateBatterSwing(choice);
            });
            this.ballArc(from, to, flight, 0, () => {
                if (this.ib !== atBat || !atBat.active) return;
                atBat.pitchProgress = 0.9;
                if (choice === 'take' && this.ib.hitByPitch) {
                    this.processNoSwing();
                } else if (choice === 'take') {
                    this.catchAtPlate(() => {
                        if (this.ib !== atBat || !atBat.active) return;
                        this.setBattingCamera(false);this.processNoSwing();
                    });
                } else { this.setBattingCamera(false);atBat.swingReleased = true;this.processInteractiveSwingOutcome(); }
            });
        });
    }

    swingContactDelay(type) {
        const name = type === 'bunt' ? 'bunt' : type === 'power' ? 'swing_power' : 'swing_normal';
        const clip = BB2_SHEETS['batter-actions'].anims[name];
        return (clip.contactFrame == null ? 2 : clip.contactFrame) / clip.rate * 1000;
    }

    swingContactPoint(type) {
        if (type === 'take') return { x: FIELD.HOME.x, y: FIELD.HOME.y - 9 };
        const name = type === 'bunt' ? 'bunt' : type === 'power' ? 'swing_power' : 'swing_normal';
        return this.batter && this.batter.actionPoint ? this.batter.actionPoint(name, 'bat')
            : { x: FIELD.HOME.x, y: FIELD.HOME.y - 6 };
    }

    pitchReleasePoint() {
        const p = this.fielders.P;
        return p && p.ballPoint ? p.ballPoint('hand') : FIELD.MOUND;
    }

    processStealAttempt(targetBase) {
        // v1 odds: 70% to steal 2nd, 50% to steal 3rd
        const fromBase = targetBase === 'second' ? 'first' : 'second';
        let success = Math.random() < (targetBase === 'second' ? 0.7 : 0.5),runnerAtBag=false;
        const runner = this.runnerDots[fromBase];
        if (runner) { runner._runnerBase=targetBase;runner._runnerOut=!success;runner._baseRunner=true; }
        const target = BASE_COORDS[targetBase];

        this.audio.speak(`He's stealing ${targetBase === 'second' ? 'second' : 'third'}!`);
        // Catcher fires to the bag while the runner sprints — and the
        // covering infielder breaks to the bag to take the throw. The
        // runner's travel time is set RELATIVE to the throw's arrival so the
        // visuals always agree with the roll: safe means he beats the ball
        // to the bag, caught means the ball gets there first.
        this._zoomOnPoint(target.x, target.y, 1.7, 420);
        const coverPos = this.coveringFielder(targetBase, 'C');
        this.jogToPosition(this.fielders[coverPos],target.x+9,target.y+9,115);
        const throwPreDelay = 250, throwFlightMs = 620;
        const clip = BB2_SHEETS.catcher.anims.rise_throw;
        const cover=this.fielders[coverPos];
        const coverMs=Math.hypot(target.x+9-cover.x,target.y+9-cover.y)/115*1000;
        const ballArriveMs = Math.max(throwPreDelay,coverMs) + clip.contactFrame/clip.rate*1000 + throwFlightMs;
        const runnerArriveMs = success ? Math.max(500, ballArriveMs - 200) : ballArriveMs + 260;
        if (runner) {
            // Not routed through jog() — its own onComplete always calls
            // stopBob/idleAnim, which on a caught-stealing runner would fire
            // AFTER the ballArc callback below sets 'out_walkoff' (the throw
            // can arrive before the runner does) and silently revert it back
            // to a plain idle. Driving the tween directly here, the same way
            // sendRunner() does for a contested base, keeps this sprite's
            // final pose under this function's control.
            this.stopPlayerMovement(runner);
            if (runner._bb2) runner.faceFrom(target.x - runner.x, target.y - runner.y);
            this.startBob(runner);
            if (runner._bb2) {
                this.time.delayedCall(Math.max(0, runnerArriveMs - 260), () => this.bb2Anim(runner, 'slide'));
            }
            this.movePlayer({
                targets: runner, x: target.x + 16, y: target.y - 14,
                duration: runnerArriveMs, ease: 'Quad.easeIn',
                onUpdate: () => { if (runner._bb2) runner.syncDepth(); },
                onComplete: () => {
                    runnerAtBag=true;
                    if (runner._bb2) this.bb2Anim(runner, success ? 'safe_stand' : 'out_walkoff');
                    else this.stopBob(runner);
                }
            });
        }
        this.time.delayedCall(throwPreDelay, () => {
            this.throwToPlayer(this.fielders.C, this.fielders[coverPos], {duration:throwFlightMs,arc:46}, () => {
                if(runnerAtBag){success=true;if(runner){runner._runnerOut=false;this.bb2Anim(runner,'safe_stand');}}
                if (!success) this.audio.play('tag');
                this.cameras.main.shake(120, 0.005);
                if (success) {
                    this.gs.bases[targetBase] = this.gs.bases[fromBase];
                    this.gs.bases[fromBase] = null;
                    this.bigMessage('SAFE!', 1300);
                    this.audio.speak('Safe!');
                    this.audio.play('crowd');
                } else {
                    this.gs.bases[fromBase] = null;
                    this.gs.outs++;
                    this.bigMessage('OUT!', 1300);
                    this.audio.speak('Caught stealing!');
                    this.audio.play('fail');
                }
                this.time.delayedCall(1200, () => {
                    this._zoomOut(380);
                    this.finishPlay(success ? 'Steal' : 'Caught Stealing');
                });
            });
        });
    }

    // Outfielders soften their knees for the pitch, then stand tall between
    // plays. Let active catches, throws and travel finish before changing pose.
    setDefenseReady(on) {
        for (const pos of ['LF','CF','RF']) {
            const f = this.fielders && this.fielders[pos];
            if (!f || !f.active || !f._bb2) continue;
            f._fieldReady = on;
            if (!f._busy && !this.playerMotion().moves.has(f) && ['ready','pitch_ready'].includes(f._anim)) f.idleAnim();
        }
    }

    // Spawn the ball at the pitcher's release frame, aligned with the hand.
    deliverPitch(fallbackDelay, cb) {
        this.setDefenseReady(true);
        const pitcher = this.fielders.P;
        if (pitcher && pitcher._bb2 && pitcher.playPitch) {
            pitcher.playPitch(cb);
            return;
        }
        this.tweens.add({ targets: pitcher, scaleY: 1.2, duration: 240, yoyo: true, ease: 'Sine.easeInOut' });
        this.time.delayedCall(fallbackDelay, cb);
    }

    beginInteractivePitch() {
        const gs = this.gs;
        this.resetInteractiveBatting();
        this.ib.active = true;
        this.ib.waitingForSwing = true;

        // Close-up on the duel: batter, pitcher, and the incoming pitch
        this.setBattingCamera(true);

        // Announce type/location before the player judges the delivery.
        this.audio.speak(`${gs.selectedPitch}, ${this.pitchProfile().display}!`, true);

        // Pitcher windup, then the deliberately slow pitch (7.5s — v1 accessibility pacing)
        this.deliverPitch(650, () => {
            if (!this.ib.active) return;
            const from = this.pitchReleasePoint();
            const to = this.pitchReadPoint();
            this.ib.pitchFlight={from,to,pitch:gs.selectedPitch};
            this.ball.setVisible(true).setAlpha(1).setPosition(from.x, from.y);
            this.setBallSpin(true);
            this.meterTitle.setText('Hold to charge; release at the cue to swing, or keep holding to take.').setColor('#ffffff');
            this.meter.setVisible(true);
            this.updateSwingMeter(0);
            if(this.ib.pendingSwing){this.ib.pendingSwing=false;this.executeSwing();return;}
            const proxy = { t: 0 };
            this.pitchTween = this.tweens.add({
                targets: proxy, t: 1,
                duration: GAME_CONSTANTS.TIMING.INTERACTIVE_PITCH_DURATION,
                ease: t=>t<.65?t/.65*.78:.78+(t-.65)/.35*.22,
                onUpdate: () => {
                    this.ib.pitchProgress = proxy.t;
                    // v1's per-pitch movement: curve, late break, wobble, drop
                    const point=this.interactivePitchPoint(proxy.t);
                    this.ball.setPosition(point.x,point.y);
                    this.updateSwingMeter(proxy.t);
                    this.ib.ballInStrikeZone = proxy.t >= GAME_CONSTANTS.TIMING.GREEN_ZONE_LO
                                            && proxy.t <= GAME_CONSTANTS.TIMING.GREEN_ZONE_HI;
                    // Distinct chirps repeat in the slowed contact window.
                    if (this.ib.ballInStrikeZone) {
                        if (!this.ib.cueSpoken) { this.ib.cueSpoken=true;this.audio.speak(this.pitchProfile().spoken,false); }
                        const now = Date.now();
                        if (!this.ib.lastSwingTone || now - this.ib.lastSwingTone > 150) {
                            this.audio.play('swingZone'+this.pitchProfile().tier);
                            this.ib.lastSwingTone = now;
                        }
                    }
                },
                onComplete: () => this.onPitchComplete()
            });
        });
    }

    // Hold began (Enter/Space/touch down) — port of v1 onSwingStart
    onSwingStart() {
        if (!this.ib.active || !this.ib.waitingForSwing || this.ib.swingPressed) return;
        this.ib.swingPressed = true;
        this.ib.swingPressStart = Date.now();
        this.ib.announcedSwingType = 'bunt';
        this.audio.speak('Bunt', true);
        this.audio.startChargeSound();
        this.powerMeter.setVisible(true);
        this.updatePowerMeter(0);
        this.bb2Anim(this.batter, 'load_bunt');
        if (this.batter.setChargePose) this.batter.setChargePose(0);

        this.chargeMonitor = this.time.addEvent({
            delay: 50, loop: true,
            callback: () => {
                if (!this.ib.swingPressed) { this.stopChargeMonitor(); return; }
                const hold = Date.now() - this.ib.swingPressStart;
                const pct = Math.min(hold / GAME_CONSTANTS.TIMING.SWING_POWER_MAX, 1.0);
                this.audio.updateChargeSound(pct);
                this.updatePowerMeter(hold);
                if (this.batter.setChargePose) this.batter.setChargePose(pct);
                // The coil deepens bunt -> normal -> power so the charge
                // tier reads on the batter's body, not just the meter.
                if (hold >= GAME_CONSTANTS.TIMING.SWING_BUNT_MAX && this.ib.announcedSwingType === 'bunt') {
                    this.audio.speak('Normal swing', true);
                    this.ib.announcedSwingType = 'normal';
                }
                if (hold >= GAME_CONSTANTS.TIMING.SWING_POWER_MIN && this.ib.announcedSwingType === 'normal') {
                    this.audio.speak('Power swing', true);
                    this.ib.announcedSwingType = 'power';
                }
            }
        });
    }

    stopChargeMonitor() {
        if (this.chargeMonitor) { this.chargeMonitor.remove(); this.chargeMonitor = null; }
        this.audio.stopChargeSound();
        this.hidePowerMeter();
        // Covers the "missed the pitch entirely" path (onPitchComplete),
        // where nothing else ever reverts the load_bunt/normal/power pose
        // the charge hold left him in. Harmless on the normal release path
        // too — executeSwing() overwrites it with the real swing/bunt anim
        // in the same tick, before a frame renders.
        this.bb2Anim(this.batter, 'stance');
    }

    // Hold released — port of v1 onSwingRelease (hold time → swing type,
    // release moment vs pitch progress → timing score)
    onSwingRelease() {
        if (!this.ib.active || !this.ib.swingPressed || this.ib.swingReleased) return;
        this.ib.swingPressed = false;
        this.ib.swingReleased = true;
        this.ib.waitingForSwing = false;
        this.stopChargeMonitor();

        const T = GAME_CONSTANTS.TIMING;
        const hold = Date.now() - this.ib.swingPressStart;
        if (hold < T.SWING_BUNT_MAX) {
            this.ib.swingType = 'bunt';
            this.ib.swingPowerLevel = 0.1;
        } else if (hold < T.SWING_POWER_MIN) {
            this.ib.swingType = 'normal';
            this.ib.swingPowerLevel = 0.5;
        } else {
            this.ib.swingType = 'power';
            const powerRange = T.SWING_POWER_MAX - T.SWING_POWER_MIN;
            const powerProgress = Math.min(hold - T.SWING_POWER_MIN, powerRange) / powerRange;
            this.ib.swingPowerLevel = 0.7 + powerProgress * 0.3;
        }

        const perfectTiming = 0.90;
        const timingWindow = T.SWING_TIMING_WINDOW / T.INTERACTIVE_PITCH_DURATION;
        this.ib.timingScore = Math.max(Math.abs((this.ib.pitchProgress-perfectTiming)/timingWindow),
            bb2SwingQuality(this.ib.swingType,this.gs.selectedPitch,this.gs.selectedPitchLocation));

        this.executeSwing();
    }

    executeSwing() {
        // An early release during the windup still waits for the actual delivery.
        if(!this.ib.pitchFlight){this.ib.pendingSwing=true;return;}
        this.ib.isSwinging = true;
        if (this.pitchTween) { this.pitchTween.stop(); this.pitchTween = null; }
        if (this.meter) this.meter.setVisible(false);
        this.audio.play('swing');
        this.animateBatterSwing(this.ib.swingType);
        // Continue along the delivered pitch's curve to its original location.
        // Swing type changes timing/power, never the ball's destination.
        const atBat = this.ib,progress=atBat.pitchProgress;
        this.ballArc({ x: this.ball.x, y: this.ball.y }, atBat.pitchFlight.to,
            this.swingContactDelay(this.ib.swingType), 0, () => {
                if (this.ib !== atBat || !atBat.active) return;
                this.setBattingCamera(false);
                this.processInteractiveSwingOutcome();
            }, t=>this.interactivePitchPoint(Phaser.Math.Linear(progress,1,t)));
    }

    // Draw a proper wooden bat once and cache it as a texture: round knob,
    // slim handle, barrel that tapers out to a rounded tip.
    ensureBatTexture() {
        if (this.textures.exists('bat-shape')) return;
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        const wood = 0xd8b46a, woodDark = 0xa8813f;
        // Knob (left end — the pivot)
        g.fillStyle(woodDark, 1);
        g.fillCircle(3.5, 6, 3);
        // Handle
        g.fillStyle(wood, 1);
        g.fillRect(4, 4.6, 13, 2.8);
        // Barrel: tapers from the handle out to a fat rounded tip
        g.beginPath();
        g.moveTo(17, 4.6);
        g.lineTo(33, 2.4);
        g.lineTo(33, 9.6);
        g.lineTo(17, 7.4);
        g.closePath();
        g.fillPath();
        g.fillCircle(33, 6, 3.6);
        // Grain stripe near the tip
        g.fillStyle(woodDark, 1);
        g.fillRect(28, 3.1, 1.6, 5.8);
        g.generateTexture('bat-shape', 38, 12);
        g.destroy();
    }

    // Slow waggle around the v1 rest pose — a batter is never statue-still
    startBatWaggle() {
        if (!this.bat || !this.bat.active) return;
        this.stopPlayerMovement(this.bat);
        this.bat.setAngle(-135);
        this.tweens.add({
            targets: this.bat, angle: -128, duration: 620,
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
    }

    // Used for BOTH the player's swing and the CPU batter's. swingType is
    // 'bunt' | 'normal' | 'power'; the sprite batter plays a distinct 'bunt'
    // pose but shares one 'swing' frame set for normal/power, distinguished
    // only by playback rate (see the comment on swing_normal/swing_power in
    // sprites.js). Falls through to the v1-exact bat-rotation tween below
    // for the circle-fallback batter.
    animateBatterSwing(swingType) {
        const isBunt = swingType === 'bunt';
        if (this.batter && this.batter._bb2) {
            const batterRef = this.batter;
            const animName = isBunt ? 'bunt' : (swingType === 'power' ? 'swing_power' : 'swing_normal');
            batterRef.setAnim(animName, true);
            const clip = BB2_SHEETS['batter-actions'].anims[animName];
            const durMs = clip.count / clip.rate * 1000 + 16;
            // Cancel-and-reschedule, same pattern as sendRunner()'s
            // _slideCall — a second swing on the same batter before the
            // first's revert fires would otherwise leave a stale timer that
            // stomps the newer swing's in-progress pose back to 'stance'.
            if (this._swingRevertCall) { this._swingRevertCall.remove(false); this._swingRevertCall = null; }
            this._swingRevertCall = this.time.delayedCall(durMs, () => {
                // Only settle back to the stance if this is still the same
                // at-bat AND he hasn't taken off running in the meantime —
                // forcing 'stance' back on a runner would fight run_<dir>.
                if (this.batter === batterRef && batterRef.active && !this._batterRunning) {
                    batterRef.setAnim('stance', true);
                }
            });
        }
        // v1-EXACT swing, straight from the original Player.js/AnimationSystem:
        // start -135° (up-left back stance), rotate counter-clockwise to -405°
        // (up-right follow-through) — linear, 300ms — hold 200ms, snap back to
        // the stance. Bunt: -135° → 0° (bat squared at the pitcher).
        // Circle fallback only.
        if (!this.bat || !this.bat.active) return;
        this.stopPlayerMovement(this.bat);
        if (isBunt) {
            this.bat.setRotation(-Math.PI * 0.75);
            this.tweens.add({
                targets: this.bat, rotation: 0, duration: 300, ease: 'Linear',
                yoyo: true, hold: 200,
                onComplete: () => this.startBatWaggle()
            });
        } else {
            this.bat.setRotation(-Math.PI * 0.75);
            this.tweens.add({
                targets: this.bat, rotation: -Math.PI * 2.25, duration: 180, ease: 'Linear',
                onComplete: () => {
                    this.time.delayedCall(200, () => {
                        if (!this.bat || !this.bat.active) return;
                        this.startBatWaggle(); // snap back to stance (v1 behavior)
                    });
                }
            });
        }
    }

    // Quick white burst right where bat meets ball
    contactFlash() {
        const f = this.add.circle(this.ball.x, this.ball.y, 6, 0xffffff, 0.65).setDepth(9);
        this.tweens.add({ targets: f, scale: 2.4, alpha: 0, duration: 160, onComplete: () => f.destroy() });
    }

    // The catcher receives any pitch that isn't hit, then tosses it back to
    // the pitcher — the ball never just vanishes at the plate. Possession is
    // held for the whole catch-and-return so nothing can interrupt it.
    // Play a catcher animation if he is a sprite; a no-op for the circle.
    catcherAnim(name) {
        const c = this.fielders && this.fielders.C;
        if (c && c._bb2) c.setAnim(name);
    }

    catchAtPlate(onCaught) {
        if (this._receivingPitch) return;
        this._receivingPitch = true;
        if (this.pitchTween) { this.pitchTween.stop(); this.pitchTween = null; }
        const catcher = this.fielders.C;
        const glove = catcher.actionPoint ? catcher.actionPoint('receive','glove')
            : { x: FIELD.FIELDER_HOMES.C.x, y: FIELD.FIELDER_HOMES.C.y - 6 };
        const clips = BB2_SHEETS.catcher.anims;
        this.catcherAnim('receive');
        // Hold the receive frame until the ball reaches it, even on slow frames.
        const hold = (anim,frame) => {
            if (catcher._anim === 'receive' && frame.index === clips.receive.contactFrame+1) {
                catcher._spr.anims.pause();catcher._spr.off('animationupdate',hold);
            }
        };
        if (catcher._spr) catcher._spr.on('animationupdate',hold);
        this._ballBusy = (this._ballBusy || 0) + 1;
        this.ballArc({ x: this.ball.x, y: this.ball.y }, glove, clips.receive.contactFrame / clips.receive.rate * 1000 + 80, 2, () => {
            if (catcher._spr) catcher._spr.off('animationupdate',hold);
            this.ball.setPosition(glove.x,glove.y);
            this.setBallSpin(false);
            this.audio.play('catch');
            this.hideHeldBall(catcher);
            if (onCaught) onCaught();
            this.time.delayedCall(320, () => {
                if (catcher._spr) catcher._spr.anims.resume();
                this.throwToPlayer(catcher, this.fielders.P, {duration:480,arc:30}, () => {
                    this.ball.setVisible(false);
                    this._receivingPitch = false;this.releaseBall();
                });
            });
        });
    }

    // Pitch arrived without a swing — port of v1 onPitchComplete/processNoSwing
    onPitchComplete() {
        this.pitchTween = null;
        if (!this.ib.hitByPitch) this.catchAtPlate();
        if (!this.ib.hitByPitch) this.setBattingCamera(false);
        this.hideSwingMeter();
        if (this.ib.isSwinging) return;
        if (this.ib.swingPressed && !this.ib.swingReleased) {
            // Still charging — missed the pitch entirely
            this.stopChargeMonitor();
            this.ib.swingPressed = false;
            this.ib.waitingForSwing = false;
            this.processNoSwing();
            return;
        }
        if (!this.ib.swingReleased && !this.ib.swingPressed) {
            this.ib.waitingForSwing = false;
            this.processNoSwing();
        }
    }

    batterHitPoint() { return {x:this.batter.x,y:this.batter.y-29}; }

    animateHitBatter(done) {
        const hit=()=>{
            this.ball.setVisible(false);this.setBallSpin(false);this.hideSwingMeter();
            this.audio.play('tag');this.bb2Anim(this.batter,'hit_by_pitch');
            this.time.delayedCall(700,done);
        };
        const target=this.batterHitPoint();
        if(Math.hypot(this.ball.x-target.x,this.ball.y-target.y)>2)
            this.ballArc({x:this.ball.x,y:this.ball.y},target,140,0,hit);
        else hit();
    }

    awardHitByPitch(team) {
        const gs=this.gs;gs.balls=0;gs.strikes=0;
        gs.pendingBaseUpdate=()=>this.updateBases('Walk',team);
        gs.hitBatters=(gs.hitBatters||0)+1;
        gs.hbpEscalation=(gs.hbpEscalation||0)+1;
        this.audio.speak('Hit by pitch. Take first base.',true);this.showPitchCall('Hit By Pitch');
        const advance=()=>this.animateAdvances('Walk',()=>this.finishPlay('Hit By Pitch'));
        if(gs.hbpEscalation>=3)this.benchesConfrontation(advance);
        else {
            if(gs.hbpEscalation===2)this.time.delayedCall(500,()=>this.audio.speak('The umpire warns both teams.',false));
            advance();
        }
    }

    benchesConfrontation(done) {
        this.setBattingCamera(false);this.setMenu(null);this._confrontation=true;
        this.audio.speak('Benches clear!',true);this.bigMessage('BENCHES CLEAR!',2200);
        const defenders=Object.values(this.fielders);
        const offense=[this.batter,this.onDeckBatter,...Object.values(this.runnerDots||{})]
            .filter(p=>p&&p.active&&!p._leavingField);
        const dug=this.isPlayerBatting()?FIELD.DUGOUT.player:FIELD.DUGOUT.cpu;
        const extras=[];
        for(let i=0;i<5;i++) {
            const p=this.makePlayer(this.battingColor(),'','R');
            const origin={x:dug.x+(dug.x<0?-1:1)*(i+1)*28,y:dug.y+95+i*23};
            p.setPosition(origin.x,origin.y);extras.push({p,...origin,extra:true});offense.push(p);
        }
        // Mix both rosters; no assigned opponents, rows or mirrored poses.
        const actors=[];for(let i=0;i<Math.max(defenders.length,offense.length);i++){
            if(defenders[i])actors.push(defenders[i]);if(offense[i])actors.push(offense[i]);
        }
        const home=[...new Set(actors)].map(p=>extras.find(e=>e.p===p)||{p,x:p.x,y:p.y});
        const center={x:FIELD.MOUND.x,y:(FIELD.MOUND.y+FIELD.SECOND.y)/2+10};
        const arrival=[];
        // Irregular entry spots leave enough room to reach the scrum without
        // trapping late arrivals behind a row of stationary players.
        for(let i=0;i<home.length;i++){
            let point;
            for(let attempt=0;attempt<2000;attempt++){
                const angle=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*(105+Math.floor(attempt/500)*12);
                point={x:center.x+Math.cos(angle)*r,y:center.y+Math.sin(angle)*r*.9};
                if(arrival.every(q=>Math.hypot(q.x-point.x,q.y-point.y)>=38))break;
            }
            arrival.push(point);
        }
        const joined=new Set();let mix;
        const join=actor=>{
            if(this._scufflePhase!=='fighting'||joined.has(actor)||!actor.p.active)return;
            joined.add(actor);mix(actor);
        };
        const returnHome=()=>{
            this._zoomOut(400);this.audio.speak('Dust off. Back to baseball.',true);
            let returning=home.length;
            for(const {p,x,y,extra} of home)this.jogToPosition(p,x,y,110,()=>{
                this.stopBob(p);if(extra)p.destroy();
                if(--returning===0){this._confrontation=false;this._scufflePhase=null;done();}
            });
        };
        const scuffle=()=>{
            this._scuffleStartedAt=this.time.now;this._scufflePhase='fighting';
            this._zoomOnPoint(center.x,center.y,1.35,450);
            const defense=new Set(defenders);
            const inReach=(p,r)=>r&&r.active&&defense.has(p)!==defense.has(r)&&
                Math.hypot(r.x-p.x,r.y-p.y)<=30&&Math.abs(r.y-p.y)<=10&&Math.abs(r.x-p.x)>=17;
            const face=(p,r)=>{
                if(p.faceFrom)p.faceFrom(r.x-p.x,0);
                if(p._spr)p._spr.setFlipX(r.x<p.x);
            };
            const stopSwing=p=>{
                p._scuffleOpponent=null;
                if(p._spr)p._spr.anims.timeScale=1;
                if(p._anim==='scuffle')this.bb2Anim(p,'idle_side');
            };
            mix=actor=>{
                const {p}=actor;if(this._scufflePhase!=='fighting'||!p.active)return;
                actor.nextDecision=this.time.now+100;
                const rivals=[...joined].map(q=>q.p).filter(q=>q!==p&&q.active&&defense.has(q)!==defense.has(p))
                    .sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
                if(actor.boutEnd&&this.time.now>=actor.boutEnd){
                    actor.boutEnd=0;actor.restUntil=this.time.now+450+Math.random()*450;
                    actor.retargetAt=0;stopSwing(p);
                }
                const close=rivals.find(r=>inReach(p,r));
                if(close&&this.time.now>=(actor.restUntil||0)){
                    this.stopPlayerMovement(p);p._scuffleOpponent=close;
                    if(!actor.boutEnd)actor.boutEnd=this.time.now+600+Math.random()*650;
                    if(p._anim!=='scuffle'){
                        this.bb2Anim(p,'scuffle');if(p._spr)p._spr.anims.timeScale=.8+Math.random()*.45;
                    }
                    face(p,close);return;
                }
                stopSwing(p);
                if(!actor.target?.active||this.time.now>=(actor.retargetAt||0)){
                    // Prefer nearby opponents, with occasional changes to keep
                    // the crowd mixing instead of becoming fixed pairs.
                    actor.target=rivals[Math.floor(Math.random()*Math.min(2,rivals.length))];
                    actor.retargetAt=this.time.now+650+Math.random()*450;
                }
                const rival=actor.target;
                if(!rival)return;
                const side=p.x<=rival.x?-1:1;
                const x=Phaser.Math.Clamp(rival.x+side*24,center.x-100,center.x+100);
                const y=Phaser.Math.Clamp(rival.y+Phaser.Math.Clamp(center.y-rival.y,-18,18),center.y-80,center.y+80);
                const move=this.playerMotion().moves.get(p);
                if(!move||Math.hypot(move.goal.x-x,move.goal.y-y)>10){
                    this.jogToPosition(p,x,y,110);
                }else this.startBob(p);
            };
            // Check range and facing after movement on EVERY frame. A departing
            // opponent must stop a punch immediately, not at the next AI timer.
            this._updateScuffle=()=>{
                if(this._scufflePhase!=='fighting')return;
                for(const actor of joined){
                    const {p}=actor,rival=p._scuffleOpponent;
                    if(rival&&!inReach(p,rival)){stopSwing(p);actor.nextDecision=0;}
                    if(this.time.now>=(actor.nextDecision||0))mix(actor);
                }
                // Later actors may have changed pose/route; face the actual
                // opponent after all decisions, with no movement overriding it.
                for(const {p} of joined)if(p._scuffleOpponent)face(p,p._scuffleOpponent);
            };
            // The batter and catcher react immediately at the plate. Everyone
            // else keeps running in and joins the moving scrum on contact.
            for(const p of [this.batter,this.fielders.C]){
                const actor=home.find(a=>a.p===p);if(actor)join(actor);
            }
            const dust=this.add.graphics().setDepth(35);let beat=0;
            const comic=this.add.text(center.x,center.y-80,'?!',{fontFamily:'Arial Black',fontSize:'24px',color:'#ffe066',stroke:'#10252b',strokeThickness:4}).setOrigin(.5).setDepth(36);
            const commotion=this.time.addEvent({delay:180,loop:true,callback:()=>{
                dust.clear();
                for(const actor of home){
                    if(joined.has(actor))continue;
                    const nearFight=[...joined].some(({p})=>defense.has(p)!==defense.has(actor.p)&&Math.hypot(p.x-actor.p.x,p.y-actor.p.y)<65);
                    if(nearFight)join(actor);
                }
                const crowd=[...joined];
                const cx=crowd.reduce((n,{p})=>n+p.x,0)/crowd.length;
                const cy=crowd.reduce((n,{p})=>n+p.y,0)/crowd.length;
                const build=Phaser.Math.Clamp((this.time.now-this._scuffleStartedAt-350)/1800,0,1);
                for(let i=0;i<Math.ceil(13*build);i++){
                    const a=i*2.39996+beat*.12,r=(15+(i%4)*13)*(.4+.6*build);
                    dust.fillStyle(i%2?0xc4ad86:0xe4d2ae,.22*build);
                    dust.fillEllipse(cx+Math.cos(a)*r,cy-14+Math.sin(a)*r*.7,(40+(i%3)*9)*(.4+.6*build),(24+(i%2)*8)*(.4+.6*build));
                }
                if(beat++%4===0){
                    this.audio.play('scuffle');comic.setText(['?!','HEY!','POOF!','?!'][Math.floor(beat/4)%4]);
                    comic.setPosition(cx+(Math.random()-.5)*110,cy-65-Math.random()*25);
                }
            }});
            this.time.delayedCall(10000,()=>{
                commotion.remove();dust.destroy();comic.destroy();this._scufflePhase='dusting';this._updateScuffle=null;
                home.forEach(({p})=>{p._scuffleOpponent=null;this.stopPlayerMovement(p);if(p._spr)p._spr.anims.timeScale=1;this.bb2Anim(p,'dust_off');});
                this.time.delayedCall(1200,()=>{this._scufflePhase='returning';returnHome();});
            });
        };
        home.forEach(({p},i)=>{
            this.stopPlayerMovement(p);
            const target=arrival[i];
            this.jogToPosition(p,target.x,target.y,110,()=>{
                this.stopBob(p);join(home[i]);
            });
        });
        scuffle();
    }

    processNoSwing() {
        const gs = this.gs;
        if (this.ib.outcomeProcessed) return;
        this.ib.outcomeProcessed = true;
        this.ib.active = false;
        const R = GAME_CONSTANTS.GAME_RULES;

        if (this.ib.hitByPitch) {
            this.animateHitBatter(()=>this.awardHitByPitch('user'));
            return;
        }

        const isBall = !this.pitchProfile().strike;
        if (isBall) {
            gs.balls++;
            if (gs.balls >= R.MAX_BALLS) {
                gs.pendingBaseUpdate = () => this.updateBases('Walk', 'user');
                gs.balls = 0; gs.strikes = 0;
                this.audio.speak('Ball four. Walk.');
                this.showPitchCall('Walk');
                this.animateAdvances('Walk', () => this.finishPlay('Walk'));
            } else {
                this.audio.speak(`Ball. ${gs.balls} and ${gs.strikes}.`);
                this.showPitchCall('Ball');
                this.finishPlay('Ball');
            }
        } else {
            gs.strikes++;
            if (gs.strikes >= R.MAX_STRIKES) {
                gs.outs++;
                gs.balls = 0; gs.strikes = 0;
                this.audio.speak('Strike three!');
                this.showPitchCall('Strike Out');
                this.finishPlay('Strike Out');
            } else {
                this.audio.speak(`Strike. ${gs.balls} and ${gs.strikes}.`);
                this.showPitchCall('Strike');
                this.finishPlay('Strike');
            }
        }
    }

    // Contact resolution — outcome tables ported verbatim from v1
    processInteractiveSwingOutcome() {
        const gs = this.gs;
        if (this.ib.outcomeProcessed) return;
        this.ib.outcomeProcessed = true;
        this.ib.active = false;

        const swingType = this.ib.swingType;
        const timingScore = Math.abs(this.ib.timingScore);
        const wasInStrikeZone = this.ib.pitchProgress >= 0.75 && this.ib.pitchProgress <= 1.0;
        const location = gs.selectedPitchLocation.includes('Inside')?'Inside':gs.selectedPitchLocation==='Middle'?'Middle':'Outside';

        let outcome;
        if (timingScore > 1.5) {
            outcome = 'Strike'; // way off — swing and miss
        } else if (swingType === 'bunt') {
            outcome = this.calculateBuntOutcome(timingScore, wasInStrikeZone);
        } else if (timingScore > 0.8) {
            if (wasInStrikeZone) {
                const rand = Math.random();
                if (rand < 0.6) outcome = 'Foul';
                else if (rand < 0.85) outcome = 'Ground Out';
                else outcome = 'Single';
            } else {
                outcome = Math.random() < 0.3 ? 'Foul' : 'Strike';
            }
        } else if (timingScore > 0.4) {
            outcome = this.calculateDecentTimingOutcome(swingType === 'power' ? 0.9 : 0.5, wasInStrikeZone, location, swingType);
        } else {
            outcome = this.calculateGoodTimingOutcome(swingType === 'power' ? 0.9 : 0.5, wasInStrikeZone, location, swingType);
        }

        this.hideSwingMeter();
        if (outcome !== 'Strike') {
            this.audio.play(outcome === 'Home Run' ? 'bigHit' : 'hit');
            this.contactFlash();
        }

        this.processBattingOutcome(outcome);
    }

    calculateBuntOutcome(timingScore, wasInStrikeZone) {
        const rand = Math.random();
        if (timingScore > 0.8) {
            if (rand < 0.5) return 'Strike';
            if (rand < 0.85) return 'Foul';
            return 'Ground Out';
        }
        if (!wasInStrikeZone) {
            if (rand < 0.5) return 'Strike';
            if (rand < 0.9) return 'Foul';
            return 'Ground Out';
        }
        if (timingScore <= 0.3) {
            if (rand < 0.30) return 'Single';
            if (rand < 0.65) return 'Ground Out';
            return 'Foul';
        } else {
            if (rand < 0.25) return 'Single';
            if (rand < 0.60) return 'Ground Out';
            return 'Foul';
        }
    }

    calculateDecentTimingOutcome(powerLevel, wasInStrikeZone, location, swingType) {
        const rand = Math.random();
        if (!wasInStrikeZone) return rand < 0.7 ? 'Foul' : 'Strike';

        let hitBonus = 0, strikeBonus = 0;
        if (location === 'Inside') {
            if (swingType === 'power') hitBonus = 0.08;
            else strikeBonus = 0.05;
        }

        if (powerLevel >= 0.8) {
            if (rand < 0.32 + hitBonus) return 'Pop Fly Out';
            if (rand < 0.45 + hitBonus) return 'Single';
            if (rand < 0.52) return 'Double';
            if (rand < 0.67 - strikeBonus) return 'Foul';
            return 'Ground Out';
        } else {
            if (rand < 0.16 + hitBonus) return 'Single';
            if (rand < 0.40 - strikeBonus) return 'Ground Out';
            if (rand < 0.62) return 'Foul';
            if (rand < 0.90) return 'Pop Fly Out';
            return 'Double';
        }
    }

    calculateGoodTimingOutcome(powerLevel, wasInStrikeZone, location, swingType) {
        const rand = Math.random();
        if (!wasInStrikeZone) {
            if (rand < 0.55) return 'Foul';
            if (rand < 0.72) return 'Single';
            return 'Ground Out';
        }

        let hitBonus = 0, strikeBonus = 0;
        if (location === 'Inside') {
            if (swingType === 'power') hitBonus = 0.08;
            else strikeBonus = 0.05;
        } else if (location === 'Middle') {
            hitBonus = 0.03;
        }

        if (powerLevel >= 0.9) {
            if (rand < 0.04 + hitBonus) return 'Home Run';
            if (rand < 0.08 + hitBonus) return 'Triple';
            if (rand < 0.16) return 'Double';
            if (rand < 0.28 - strikeBonus) return 'Single';
            if (rand < 0.62) return 'Pop Fly Out';
            return 'Foul';
        } else if (powerLevel >= 0.7) {
            if (rand < 0.03 + hitBonus) return 'Home Run';
            if (rand < 0.06 + hitBonus) return 'Triple';
            if (rand < 0.13) return 'Double';
            if (rand < 0.24 - strikeBonus) return 'Single';
            if (rand < 0.58) return 'Pop Fly Out';
            return 'Foul';
        } else if (powerLevel >= 0.4) {
            if (rand < 0.005) return 'Home Run';
            if (rand < 0.02) return 'Triple';
            if (rand < 0.09 + hitBonus) return 'Double';
            if (rand < 0.28 + hitBonus - strikeBonus) return 'Single';
            if (rand < 0.68) return 'Ground Out';
            return 'Pop Fly Out';
        } else {
            if (rand < 0.20 + hitBonus - strikeBonus) return 'Single';
            if (rand < 0.28 + hitBonus) return 'Double';
            if (rand < 0.55) return 'Ground Out';
            if (rand < 0.80) return 'Foul';
            return 'Pop Fly Out';
        }
    }

    // Count/out/base bookkeeping — ported from v1 processBattingOutcome,
    // including the double play / triple play rolls on ground outs.
    processBattingOutcome(outcome) {
        const gs = this.gs;
        if (!gs.bases.first && !gs.bases.second && !gs.bases.third &&
            (outcome === 'Ground Out' || (outcome === 'Single' && this.ib.swingType !== 'power'))) {
            this.playGrounderToFirst();
            return;
        }
        const R = GAME_CONSTANTS.GAME_RULES;
        let terminal = ['Single', 'Double', 'Triple', 'Home Run'].includes(outcome);

        if (outcome === 'Strike') {
            gs.strikes++;
            if (gs.strikes >= R.MAX_STRIKES) {
                outcome = 'Strike Out';
                gs.outs++;
                terminal = true;
            }
        } else if (outcome === 'Foul') {
            if (gs.strikes < 2) gs.strikes++;
        } else if (outcome === 'Pop Fly Out') {
            gs.outs++;
            terminal = true;
        } else if (outcome === 'Ground Out') {
            terminal = true;
            if (gs.outs === 2) {
                gs.outs++;
            } else if (gs.outs === 0 && gs.bases.first && gs.bases.second && Math.random() < 0.5) {
                outcome = 'Triple Play';
                gs.outs = 3;
                gs.pendingBaseUpdate = () => {
                    gs.bases.first = null; gs.bases.second = null; gs.bases.third = null;
                };
            } else if (gs.outs <= 1 && gs.bases.first) {
                if (Math.random() < 0.5) {
                    outcome = 'Double Play';
                    gs.outs += 2;
                    gs.pendingBaseUpdate = () => {
                        if (gs.bases.second) {
                            // A run can't score on the same play as a force out that ends the inning.
                            if (gs.bases.third && gs.outs < R.MAX_OUTS) gs.score[this.battingScoreKey()]++;
                            gs.bases.third = gs.bases.second;
                        }
                        gs.bases.second = null;
                        gs.bases.first = null;
                    };
                } else {
                    gs.outs++;
                    gs.pendingBaseUpdate = () => {
                        if (gs.bases.second) {
                            if (gs.bases.third && gs.outs < R.MAX_OUTS) gs.score[this.battingScoreKey()]++;
                            gs.bases.third = gs.bases.second;
                        }
                        gs.bases.second = gs.bases.first;
                        gs.bases.first = null;
                    };
                }
            } else {
                gs.outs++;
            }
        } else if (['Single', 'Double', 'Triple', 'Home Run'].includes(outcome)) {
            gs.pendingBaseUpdate = () => this.updateBases(outcome, 'user');
        }

        if (terminal || outcome === 'Strike Out') {
            gs.balls = 0;
            gs.strikes = 0;
        }

        // Result narration follows the visible catch/throw/advance, so an out
        // is not called while the ball is still in the air.
        const grandSlam = outcome === 'Home Run' && gs.bases.first && gs.bases.second && gs.bases.third;
        this.animatePlayerContact(outcome, () => {
            if (['Strike','Strike Out'].includes(outcome)) this.showPitchCall(outcome);
            else if (['Single','Double','Triple'].includes(outcome)) this.bigMessage(outcome.toUpperCase(),1800);
            this.audio.speak(grandSlam ? 'Grand Slam!' : outcome);
            this.finishPlay(outcome);
        });
    }

    // Bases-empty grounders are a physical race, not a preselected out with
    // runner speed changed to fit it. Other occupied-base plays retain their
    // existing force/relay rules while this sequence establishes the model.
    playGrounderToFirst() {
        const gs = this.gs, runner = this.batter;
        const pos = Phaser.Utils.Array.GetRandom(['SS','2B','3B','P']);
        const fielder = this.fielders[pos], first = this.fielders['1B'];
        const start = { x: this.ball.x, y: this.ball.y };
        const home = FIELD.FIELDER_HOMES[pos];
        const spot = { x: home.x + (Math.random()-.5)*62, y: home.y + 28 + Math.random()*38 };
        const reaction = 140 + Math.random()*220;
        const ballMs = Math.hypot(spot.x-start.x,spot.y-start.y)/(115+Math.random()*75)*1000;
        const runnerSpeed = 88 + Math.random()*12;
        const armSpeed = 220 + (FIELDER_RATINGS[pos].arm * 20);
        let runnerAtBag=false, coverAtBag=false, ballAtSpot=false, fielderAtSpot=false, ballAtBag=false, finished=false, gathered=false;
        const move = (p,to,speed,done) => {
            this.stopPlayerMovement(p);
            const ms = Math.max(80,Math.hypot(to.x-p.x,to.y-p.y)/speed*1000);
            return this.jog(p,to.x,to.y,ms/1.5,'Linear',done);
        };
        const finishRace = () => {
            if (finished || !ballAtBag || !coverAtBag) return;
            finished=true;
            const out=!runnerAtBag;
            runner._runnerBase='first';runner._runnerOut=out;
            gs.balls=0;gs.strikes=0;
            if (out) gs.outs++;
            else gs.pendingBaseUpdate=()=>this.updateBases('Single','user');
            this._lastGrounderRace={out,runnerAtBag,coverAtBag,ballAtBag};
            this.bb2Anim(first,'stretch_catch');
            this.bigMessage(out?'OUT AT FIRST':'SAFE AT FIRST',1100);
            this.audio.speak(out?'Out at first.':'Safe at first. Single.',true);
            // Let the runner touch and run through first before resetting.
            const waitForRunner=()=>{
                if (!runnerAtBag) { this.time.delayedCall(80,waitForRunner); return; }
                this.time.delayedCall(650,()=>this.finishPlay(out?'Ground Out':'Single'));
            };
            waitForRunner();
        };
        const gather = () => {
            if (gathered || !ballAtSpot || !fielderAtSpot) return;
            gathered=true;
            this.audio.play('catch');this.hideHeldBall(fielder);
            this.bb2Anim(fielder,'field_grounder');
            this.time.delayedCall(340,()=>{
                this.throwToPlayer(fielder, first, {
                    duration:(from,to)=>Math.hypot(to.x-from.x,to.y-from.y)/armSpeed*1000,arc:20
                },()=>{ballAtBag=true;finishRace();});
            });
        };
        this._zoomOnPoint(555,410,1.25,420);
        this.time.delayedCall(280,()=>{
            this.batterTakesOff();
            this.time.delayedCall(150,()=>move(runner,FIELD.FIRST,runnerSpeed,()=>{
                runnerAtBag=true;
                // First base is run through; no needless slide on a force.
                move(runner,{x:FIELD.FIRST.x+27,y:FIELD.FIRST.y-20},runnerSpeed);
                finishRace();
            }));
        });
        move(first,{x:FIELD.FIRST.x-12,y:FIELD.FIRST.y-13},94,()=>{coverAtBag=true;this.bb2Anim(first,'ready_at_bag');finishRace();});
        // Second baseman backs up the throw, right fielder backs up first.
        if (pos!=='2B') move(this.fielders['2B'],{x:FIELD.SECOND.x+65,y:FIELD.SECOND.y+30},72);
        move(this.fielders.RF,{x:FIELD.FIRST.x+54,y:FIELD.FIRST.y-38},86);
        this.time.delayedCall(reaction,()=>move(fielder,spot,86,()=>{
            fielderAtSpot=true;this.bb2Anim(fielder,'ready');gather();
        }));
        this.ballArc(start,spot,ballMs,6,()=>{ballAtSpot=true;gather();});
    }

    fieldingClip(fielder, preferred) {
        const sheets = fielder._sheets || [];
        const name = sheets.some(key => BB2_SHEETS[key].anims[preferred]) ? preferred
            : preferred === 'catch_fly' ? 'receive_at_bag' : 'fielding_stance';
        const sheet = sheets.find(key => BB2_SHEETS[key].anims[name]);
        return {name, clip: sheet ? BB2_SHEETS[sheet].anims[name] : {contactFrame: 2, rate: 12}};
    }

    // Pursuit and ball travel start together. A pickup requires both arrivals,
    // then the gather frame; collision avoidance may lengthen the player's route.
    chaseGroundBall(fielder, from, spot, flightMs, arcHeight, cb, bounce = null) {
        let arrived = false, landed = false, gathered = false;
        const action = this.fieldingClip(fielder, ['LF','CF','RF'].some(p => this.fielders[p] === fielder) ? 'field_bounce' : 'field_grounder');
        const gather = () => {
            if (!arrived || !landed || gathered || !fielder.active) return;
            gathered = true;
            this.bb2Anim(fielder, action.name);
            this.time.delayedCall(action.clip.contactFrame / action.clip.rate * 1000, () => {
                if (fielder.active) { this._ballHolder = fielder;cb(); }
            });
        };
        // Align the gather frame's glove with the resting ball.
        if (fielder._spr) fielder._spr.setFlipX(false);
        const glove = fielder.actionPoint ? fielder.actionPoint(action.name, 'glove') : {x:fielder.x-4,y:fielder.y+4};
        const target = {x:spot.x-(glove.x-fielder.x),y:spot.y-(glove.y-fielder.y)};
        const distance = Math.hypot(target.x-fielder.x,target.y-fielder.y);
        this.time.delayedCall(100, () => this.jog(fielder,target.x,target.y,Math.max(160,distance/90*1000)/1.5,'Linear',() => {
            if (fielder._spr) fielder._spr.setFlipX(false);
            arrived = true;gather();
        }));
        const land = () => {landed = true;gather();};
        if (bounce) this.ballArc(from,bounce,flightMs-300,arcHeight,()=>this.ballArc(bounce,spot,300,4,land));
        else this.ballArc(from,spot,flightMs,arcHeight,land);
    }

    chaseFlyBall(from, fielderPos, cb) {
        const fielder = this.fielders[fielderPos], motion = this.playerMotion();
        const action = this.fieldingClip(fielder, 'catch_fly');
        const angle = Math.random()*Math.PI*2, distance = Phaser.Math.Between(32,58);
        let spot = {x:fielder.x,y:fielder.y}, route = [];
        for (let i=0;i<8;i++) {
            const a=angle+i*Math.PI/4;
            const candidate={x:Phaser.Math.Clamp(fielder.x+Math.cos(a)*distance,55,945),
                y:Phaser.Math.Clamp(fielder.y+Math.sin(a)*distance,110,435)};
            const path=motion.route(fielder,candidate,motion.obstacles(fielder,motion.players()));
            const end=path[path.length-1];
            if (end && Math.hypot(end.x-candidate.x,end.y-candidate.y)<.1) {spot=candidate;route=path;break;}
        }
        let previous=fielder, travel=0;
        for(const point of route){travel+=Math.hypot(point.x-previous.x,point.y-previous.y);previous=point;}
        const flight=Math.max(1700,travel/85*1000+850);
        const contactMs=action.clip.contactFrame/action.clip.rate*1000;
        if(fielder._spr)fielder._spr.setFlipX(false);
        const glove=fielder.actionPoint ? fielder.actionPoint(action.name,'glove') : {x:fielder.x,y:fielder.y-24};
        const target={x:spot.x+glove.x-fielder.x,y:spot.y+glove.y-fielder.y};
        let arrived=false, catchDue=false, landed=false, catching=false, completed=false;
        let holdingGlove=false;
        const holdContact=(anim,frame)=>{
            if(anim.key===fielder._animKey && frame.index===action.clip.contactFrame+1) {
                holdingGlove=true;fielder._spr.anims.pause();
                fielder._spr.off('animationupdate',holdContact);
                settle();
            }
        };
        const settle=()=>{
            if(!arrived || !landed || completed || (fielder._spr && !holdingGlove))return;
            if(fielder._spr) {
                fielder._spr.off('animationupdate',holdContact);
                if(holdingGlove)fielder._spr.anims.resume();
            }
            completed=true;this.audio.play('catch');this.hideHeldBall(fielder);cb(spot,fielderPos);
        };
        const raiseGlove=()=>{
            if(!arrived || !catchDue || catching)return;
            catching=true;if(fielder._spr)fielder._spr.setFlipX(false);
            if(fielder._spr)fielder._spr.on('animationupdate',holdContact);
            this.bb2Anim(fielder,action.name);
        };
        this.time.delayedCall(100,()=>this.jog(fielder,spot.x,spot.y,
            Math.max(100,Math.hypot(spot.x-fielder.x,spot.y-fielder.y)/85*1000)/1.5,'Linear',()=>{
                arrived=true;raiseGlove();settle();
            }));
        // Set the glove early and hold the actual contact frame until arrival;
        // timer/animation updates can otherwise drift apart on slower frames.
        this.time.delayedCall(flight-contactMs-150,()=>{catchDue=true;raiseGlove();});
        this.ballArc(from,target,flight,165,()=>{landed=true;settle();});
        return {fielder,spot,flight};
    }

    animateFoulBall(cb) {
        const home = {x:this.ball.x,y:this.ball.y};
        const direction = Math.random() < .5 ? -1 : 1;
        // A distinct path into foul territory; never a tiny dribble hidden
        // behind the catcher or an endpoint below the canvas.
        const foul = {x:Phaser.Math.Clamp(home.x+direction*Phaser.Math.Between(180,250),45,W-45),
            y:Math.min(H-30,home.y+45)};
        this._zoomOnPoint((home.x+foul.x)/2,home.y-30,1.35,250);
        this.ballArc(home,foul,1150,80,() => {
            this.showPitchCall('Foul');
            this.time.delayedCall(250,() => {
                this.ball.setVisible(false);
                this.time.delayedCall(350,cb);
            });
        });
    }

    // Visuals for the player's contact — the CPU defense fields automatically
    // (the result is already decided by the ported tables; this is choreography).
    animatePlayerContact(outcome, cb) {
        const home = { x: this.ball.x, y: this.ball.y };

        if (outcome === 'Strike' || outcome === 'Strike Out') {
            // Swing and a miss — the ball carries on into the catcher's glove
            if (this.ball.visible) this.catchAtPlate();
            this.time.delayedCall(1100, cb);
            return;
        }

        if (outcome === 'Foul') { this.animateFoulBall(cb);return; }

        if (outcome === 'Home Run') {
            const over = { x: FIELD.WALL.CF.x + Phaser.Math.Between(-160, 160), y: FIELD.WALL.CF.y - 30 };
            this._zoomOnPoint((home.x + over.x) / 2, (home.y + over.y) / 2, 1.25, 500);
            this.ballArc(home, over, 1700, 150, () => {
                this.ball.setVisible(false);
                this.audio.play('homer');
                this.bb2Anim(this.fielders.CF, 'wall_watch');
                this.cameras.main.shake(240, 0.012);
                this.bigMessage('HOME RUN!', 2200);
                // Full view for the trot: the batter (and everyone aboard)
                // rounds the bases and crosses home
                this.time.delayedCall(700, () => {
                    this._zoomOut(400);
                    this.time.delayedCall(420, () => {
                        this.animateAdvances('Home Run', () => {
                            this.time.delayedCall(400, cb);
                        });
                    });
                });
            });
            return;
        }

        if (outcome === 'Pop Fly Out') {
            const catcherPos = Phaser.Utils.Array.GetRandom(['CF', 'LF', 'RF', 'SS', '2B']);
            this.chaseFlyBall(home, catcherPos, spot => {
                this._zoomOnPoint(spot.x, spot.y, 1.7, 300);
                this.bigMessage('CAUGHT!', 1200);
                this.time.delayedCall(1300, () => { this._zoomOut(350); this.time.delayedCall(400, cb); });
            });
            return;
        }

        if (['Ground Out', 'Double Play', 'Triple Play'].includes(outcome)) {
            const fielderPos = Phaser.Utils.Array.GetRandom(['SS', '2B', '3B', '1B']);
            const fielder = this.fielders[fielderPos];
            this.startGroundCoverage(fielderPos);
            const spot = {
                x: Phaser.Math.Linear(home.x, FIELD.FIELDER_HOMES[fielderPos].x, 0.72),
                y: Phaser.Math.Linear(home.y, FIELD.FIELDER_HOMES[fielderPos].y, 0.72)
            };
            // Your runners take off; the CPU defense turns the play for real —
            // cover men take the bags and the throws beat the runners there.
            this.startContactRunners();
            this._ballBusy = (this._ballBusy || 0) + 1;
            this.chaseGroundBall(fielder, home, spot, 520, 22, () => {
                this.audio.play('catch');
                this.releaseBall();
                this.hideHeldBall();
                const seq = outcome === 'Triple Play' ? ['third', 'second', 'first']
                          : outcome === 'Double Play' ? ['second', 'first']
                          : ['first'];
                const runnerForBase = { first: 'batter', second: 'first', third: 'second', home: 'third' };
                const arm = (FIELDER_RATINGS[fielderPos] || { arm: 3 }).arm;
                const throwNext = (fromXY, throwerPos, chain) => {
                    if (!chain.length) {
                        // Runners not involved in the outs finish their advance
                        Object.keys(runnerForBase).forEach(b => {
                            if (!seq.includes(b)) this.sendRunner(runnerForBase[b], 1000);
                        });
                        const label = outcome === 'Triple Play' ? 'TRIPLE PLAY!'
                                    : outcome === 'Double Play' ? 'DOUBLE PLAY!'
                                    : 'OUT!';
                        this.bigMessage(label, 1400);
                        if (outcome !== 'Ground Out') this.cameras.main.shake(200, 0.008);
                        this.time.delayedCall(1400, () => { this._zoomOut(380); this.time.delayedCall(420, cb); });
                        return;
                    }
                    const base = chain[0];
                    const t = this.throwFlightMs(fromXY, base, arm);
                    this._zoomOnPoint(BASE_COORDS[base].x, BASE_COORDS[base].y, 1.5, Math.max(260, t));
                    this.animateThrowRace({
                        fromXY, throwerPos, targetBase: base,
                        out: true, throwTimeMs: t, runnerKey: runnerForBase[base]
                    }, () => {
                        // Same beat: on a double/triple play the cover man
                        // pivots to throw the next leg — give his catch a
                        // moment to read before he winds up again.
                        const nextThrower = this.coveringFielder(base, throwerPos);
                        const nextBase = BASE_COORDS[base];
                        this.time.delayedCall(180, () => throwNext(nextBase, nextThrower, chain.slice(1)));
                    });
                };
                // A beat so field_grounder is actually visible before the
                // throw animation takes the sprite over — otherwise the
                // two setAnim calls land in the same tick and the fielding
                // pose never renders a frame.
                this.time.delayedCall(220, () => throwNext(spot, fielderPos, seq));
            });
            return;
        }

        if (outcome === 'Single') {
            // A single is a GROUND BALL: it scoots past the infield spot, an
            // infielder chases it down and still tries to make a play — the
            // force at 2nd (double-play try) if a runner is on 1st, otherwise
            // first base — but on a single the runner beats the throw. SAFE.
            const fielderPos = weightedChoice({ SS: 30, '2B': 28, '3B': 22, '1B': 20 });
            const fielder = this.fielders[fielderPos];
            const fhome = FIELD.FIELDER_HOMES[fielderPos];
            const spot = {
                x: Phaser.Math.Linear(home.x, fhome.x, 0.9) + Phaser.Math.Between(-10, 10),
                y: Phaser.Math.Linear(home.y, fhome.y, 0.9) + Phaser.Math.Between(-6, 6)
            };
            this.startContactRunners();
            this.startGroundCoverage(fielderPos);
            this._ballBusy = (this._ballBusy || 0) + 1;
            this.chaseGroundBall(fielder, home, spot, 620, 16, () => {
                this.audio.play('catch');
                this.releaseBall();
                this.hideHeldBall();
                const target = this.gs.bases.first ? 'second' : 'first';
                const runnerKey = target === 'second' ? 'first' : 'batter';
                const arm = (FIELDER_RATINGS[fielderPos] || { arm: 3 }).arm;
                const t = this.throwFlightMs(spot, target, arm);
                this._zoomOnPoint(BASE_COORDS[target].x, BASE_COORDS[target].y, 1.5, Math.max(260, t));
                // Same beat as the Ground Out path — let field_grounder
                // actually render before the throw takes the sprite over.
                this.time.delayedCall(220, () => this.animateThrowRace({
                    fromXY: spot, throwerPos: fielderPos, targetBase: target,
                    out: false, throwTimeMs: t, runnerKey
                }, () => {
                    this.bigMessage('SAFE!', 1100);
                    this.audio.play('crowd');
                    // Everyone else completes their advance
                    ['batter', 'first', 'second', 'third'].forEach(k => {
                        if (k !== runnerKey) this.sendRunner(k, 550);
                    });
                    this.time.delayedCall(1200, () => {
                        this._zoomOut(360);
                        this.time.delayedCall(380, cb);
                    });
                }));
            });
            return;
        }

        // Doubles/triples: driven into the outfield gap while every runner
        // takes off — a couple of fielders chase it down and fire it in to
        // the extra base for a real, timed relay instead of freezing the
        // instant it's fielded. Runners and the throw-in run concurrently;
        // cb() fires once both are done.
        let pending = 2;
        const done = () => { if (--pending === 0) cb(); };
        this.animateAdvances(outcome, done, true);
        this.chaseDownExtraBaseHit(outcome, done);
    }

    // Every runner visibly runs the basepaths to where the play sends them,
    // scoring runners cross home plate (and the batter tours all four bags on
    // a home run). Purely visual — state changes stay in updateBases so the
    // ported v1 rules remain the single source of truth.
    animateAdvances(outcome, cb, raceThrow=false) {
        const b = this.gs.bases;
        const col = this.battingColor();

        // {fromIdx, toIdx} on the base path: 0=batter's box, 1..3=bases, 4=home
        const moves = [];
        const push = (fromIdx, toIdx) => moves.push({ fromIdx, toIdx });
        if (outcome === 'Walk') {
            push(0, 1);
            if (b.first) push(1, 2);
            if (b.first && b.second) push(2, 3);
            if (b.first && b.second && b.third) push(3, 4);
        } else if (outcome === 'Single') {
            push(0, 1);
            if (b.first) push(1, 2);
            if (b.first && b.second) push(2, 3);
            if (b.first && b.second && b.third) push(3, 4);
        } else if (outcome === 'Double') {
            push(0, 2);
            if (b.first) push(1, 3);
            if (b.second) push(2, 4);
            if (b.third) push(3, 4);
        } else if (outcome === 'Triple') {
            push(0, 3);
            if (b.first) push(1, 4);
            if (b.second) push(2, 4);
            if (b.third) push(3, 4);
        } else if (outcome === 'Home Run') {
            push(0, 4);
            if (b.first) push(1, 4);
            if (b.second) push(2, 4);
            if (b.third) push(3, 4);
        }

        if (!moves.length) { cb(); return; }

        const PATH = [
            { x: FIELD.BATTER_BOX.x, y: FIELD.BATTER_BOX.y },
            BASE_COORDS.first, BASE_COORDS.second, BASE_COORDS.third, BASE_COORDS.home
        ];
        const runSpeed=110;
        const closePlay=raceThrow&&(outcome==='Double'||outcome==='Triple');
        this._extraBaseRun=closePlay?{ready:false,arrivedAt:null}:null;
        let pending = moves.length;
        this._advanceSprites = this._advanceSprites || [];
        moves.forEach(m => {
            const isBatter = m.fromIdx === 0;
            const fromKey = ['batter','first','second','third'][m.fromIdx];
            const existing = this.runnerDots && this.runnerDots[fromKey];
            const sprite = isBatter ? this.batterTakesOff() : existing || this.makePlayer(col,'R');
            if (!isBatter && !existing) {
                const start = PATH[m.fromIdx];sprite.setPosition(start.x+16,start.y-14);
            }
            if (existing) this.runnerDots[fromKey] = null;
            sprite._baseRunner = true;sprite._runnerOut = false;
            sprite._runnerBase = ['home','first','second','third','home'][m.toIdx];
            this._advanceSprites.push(sprite);
            this.startBob(sprite);
            const runLeg = (idx) => {
                if (idx > m.toIdx) {
                    this.stopBob(sprite);
                    if (m.toIdx === 4) this.departPlayer(sprite);
                    if (--pending === 0) cb();
                    return;
                }
                const p = PATH[idx],finalLeg=isBatter&&closePlay&&idx===m.toIdx;
                const run=()=>{
                    this.startBob(sprite);let sliding=false;
                    const move=this.movePlayer({
                        targets:sprite,x:p.x+16,y:p.y-14,
                        duration:Math.hypot(p.x+16-sprite.x,p.y-14-sprite.y)/runSpeed*1000,
                        onUpdate:()=>{
                            if(finalLeg&&!sliding&&Math.hypot(p.x+16-sprite.x,p.y-14-sprite.y)<24){
                                sliding=true;this.bb2Anim(sprite,'slide');
                            }
                        },
                        onComplete:()=>{
                            if(finalLeg)this._extraBaseRun.arrivedAt=this.time.now;
                            runLeg(idx+1);if(finalLeg)this.bb2Anim(sprite,'safe_stand');
                        }
                    });
                    if(finalLeg)this._extraBaseRun.move=move;
                };
                if(finalLeg){
                    Object.assign(this._extraBaseRun,{ready:true,sprite,go:run});
                    run();
                } else run();
            };
            runLeg(m.fromIdx + 1);
        });
    }

    // ─── Real-baseball throw choreography ────────────────────────────────────
    // Who covers a bag when a throw goes there. Middle infield trades coverage
    // of second; if the primary cover man made the play himself, his backup
    // takes the bag.
    startGroundCoverage(throwerPos) {
        const bases=this.gs.bases;
        const targets=['first'];
        if(bases.first)targets.push('second');
        if(bases.first&&bases.second)targets.push('third');
        if(bases.first&&bases.second&&bases.third)targets.push('home');
        const assigned=new Set([this.fielders[throwerPos]]);
        for(const base of targets){
            const cover=this.fielders[this.coveringFielder(base,throwerPos)],bag=BASE_COORDS[base];
            if(!cover || assigned.has(cover))continue;
            assigned.add(cover);this.jogToPosition(cover,bag.x+9,bag.y+9,115);
        }
    }

    coveringFielder(base, throwerPos) {
        // Keep a backup who already owns the bag through the relay. Otherwise
        // the returning starter can get blocked forever by his own teammate.
        const bag=BASE_COORDS[base];
        const ready=Object.entries(this.fielders).find(([pos,p])=>pos!==throwerPos&&
            Math.hypot(p.x-bag.x-9,p.y-bag.y-9)<2);
        if(ready)return ready[0];
        if (base === 'second') return throwerPos === '2B' ? 'SS' : '2B';
        const primary = { first: '1B', third: '3B', home: 'C' };
        const backup  = { first: 'P',  third: 'SS', home: 'P' };
        const cover = primary[base];
        return cover === throwerPos ? (backup[base] || 'P') : cover;
    }

    // Animation-time for a throw over a real distance (same speed model as
    // computeThrowOutcome so visuals and odds agree)
    throwFlightMs(fromXY, base, arm) {
        const target = BASE_COORDS[base];
        const dist = Phaser.Math.Distance.Between(fromXY.x, fromXY.y, target.x, target.y);
        const speed = THROW_TUNING.THROW_SPEED_BASE + (arm || 3) * THROW_TUNING.THROW_SPEED_PER_ARM;
        return Math.max(220, dist / speed);
    }

    // On contact, the batter takes off for first and every runner breaks for
    // the next base — they run partway and hold while the ball is fielded
    // (the decision freeze-frame). The same actors remain on their bases
    // when safe and visibly leave when retired.
    startContactRunners() {
        this.clearContactRunners();
        const col = this.battingColor();
        this.playRunners = {};
        // Only runners who are actually FORCED run on a ground ball — a
        // runner with no force stays planted on his bag (no run-and-reset).
        const b = this.gs.bases;
        const legs = [
            { key: 'batter', from: { x: FIELD.BATTER_BOX.x, y: FIELD.BATTER_BOX.y }, to: BASE_COORDS.first, when: true },
            { key: 'first',  from: BASE_COORDS.first,  to: BASE_COORDS.second, when: !!b.first },
            { key: 'second', from: BASE_COORDS.second, to: BASE_COORDS.third,  when: !!(b.first && b.second) },
            { key: 'third',  from: BASE_COORDS.third,  to: BASE_COORDS.home,   when: !!(b.first && b.second && b.third) }
        ];
        legs.forEach(leg => {
            if (!leg.when) return;
            // The batter-runner IS the batter — he drops the bat and takes
            // off. Existing base runners keep their identity as they move.
            const isBatter = leg.key === 'batter';
            const existing = this.runnerDots && this.runnerDots[leg.key];
            const sprite = isBatter ? this.batterTakesOff() : existing || this.makePlayer(col,'R');
            if (!isBatter && !existing) sprite.setPosition(leg.from.x+16,leg.from.y-14);
            if (existing) this.runnerDots[leg.key] = null;
            sprite._baseRunner = true;sprite._runnerOut = false;
            sprite._runnerBase = {batter:'first',first:'second',second:'third',third:'home'}[leg.key];
            const hold = {
                x: Phaser.Math.Linear(leg.from.x, leg.to.x, 0.42) + 16,
                y: Phaser.Math.Linear(leg.from.y, leg.to.y, 0.42) - 14
            };
            this.playRunners[leg.key] = { sprite, to: leg.to, from: leg.from, isBatter };
            const begin = () => {
                if (!sprite.active) return;
                if (sprite._bb2) sprite.faceFrom(hold.x - sprite.x, hold.y - sprite.y);
                this.startBob(sprite);
                this.movePlayer({
                    targets: sprite, x: hold.x, y: hold.y, duration: 950, ease: 'Quad.easeOut',
                    onComplete: () => this.stopBob(sprite)
                });
            };
            // The batter's take_off pose (bat dropping, first step) needs a
            // beat on screen before startBob()'s runAnim() takes the sprite
            // over — the same same-tick clobber the fielder batch found
            // between field_grounder and throw. The timer is stashed on the
            // playRunners record so sendRunner() can cancel it if it sends
            // this same runner on before it fires (a force at first thrown
            // faster than 180ms would otherwise start a second, competing
            // tween on top of this one).
            if (isBatter && sprite._bb2) {
                this.playRunners[leg.key]._beginCall = this.time.delayedCall(180, begin);
            } else {
                begin();
            }
        });
    }

    clearContactRunners() {
        this._settledRunners = this._settledRunners || new Set();
        for (const r of Object.values(this.playRunners || {})) {
            if (r._beginCall) r._beginCall.remove(false);
            if (r._slideCall) r._slideCall.remove(false);
            this._settledRunners.add(r.sprite);
        }
        for (const p of this._advanceSprites || []) this._settledRunners.add(p);
        this.playRunners = null;this._advanceSprites = null;
    }

    // Send a play-runner the rest of the way to a base over `ms`. Pass
    // { slide: true, out } for the one runner actually racing a throw (a
    // "contested" base per SPRITE-PLAN.md) — he slides in just before
    // arrival and settles into safe_stand/out_walkoff instead of the plain
    // idle every other, uncontested advance uses.
    sendRunner(key, ms, targetBase, opts) {
        const r = this.playRunners && this.playRunners[key];
        if (!r) return;
        const to = targetBase ? BASE_COORDS[targetBase] : r.to;
        r.sprite._runnerBase = targetBase || Object.keys(BASE_COORDS).find(k => BASE_COORDS[k] === to);
        r.sprite._runnerOut = !!(opts && opts.out);r.arrivedAt=null;
        this.stopPlayerMovement(r.sprite);
        // Cancel the batter's still-pending take_off->run handoff (see
        // startContactRunners()) if this runner is being sent on before it
        // fired — otherwise it would start a second tween on top of this
        // one a moment later.
        if (r._beginCall) { r._beginCall.remove(false); r._beginCall = null; }
        if (r._slideCall) { r._slideCall.remove(false); r._slideCall = null; }
        if (r.sprite._bb2) r.sprite.faceFrom(to.x - r.sprite.x, to.y - r.sprite.y);
        this.startBob(r.sprite);
        const contested = opts && opts.slide && r.sprite._bb2;
        if (contested) {
            const slideAt = Math.max(0, ms - 260);
            r._slideCall = this.time.delayedCall(slideAt, () => this.bb2Anim(r.sprite, 'slide'));
        }
        this.movePlayer({
            targets: r.sprite, x: to.x + 16, y: to.y - 14, duration: ms, ease: 'Linear',
            onComplete: () => {
                r.arrivedAt=this.time.now;
                if (contested) this.bb2Anim(r.sprite, opts.out ? 'out_walkoff' : 'safe_stand');
                else this.stopBob(r.sprite);
            }
        });
    }

    // The heart of the new mechanic's presentation: a throw is a RACE.
    // The covering fielder breaks for the bag, the runner sprints, the ball
    // flies — whoever wins the race is what the roll already decided.
    animateThrowRace({ fromXY, throwerPos, targetBase, out, throwTimeMs, runnerKey }, cb) {
        const bag = BASE_COORDS[targetBase];
        const coverPos = this.coveringFielder(targetBase, throwerPos);
        const cover = this.fielders[coverPos];

        // Cover man sprints to receive at the bag
        this.stopPlayerMovement(cover);
        this.jogToPosition(cover,bag.x+9,bag.y+9,115);

        const thrower = this.fielders[throwerPos];
        const {clip} = this.fieldingClip(thrower, this.throwAction(thrower));
        const sendContestedRunner=()=>{
            if (runnerKey) {
                const transfer = (clip.contactFrame || 0)/clip.rate*1000;
                const receiveClip = this.fieldingClip(cover, this.receiveAction(cover)).clip;
                const flight = Math.max(throwTimeMs, (receiveClip.contactFrame || 0)/receiveClip.rate*1000 + 120);
                const arriveMs = transfer + (out ? flight + 420 : Math.max(320, flight - 120));
                this.sendRunner(runnerKey, arriveMs, targetBase, { slide: true, out });
            }
        };
        this.throwToPlayer(thrower, cover, {duration:throwTimeMs,arc:Math.min(60,throwTimeMs*.09),onWindup:sendContestedRunner,
            onReceiveDone:()=>{if (out && targetBase !== 'first') this.bb2Anim(cover,coverPos==='C'?'tag_home':'tag');}
        }, () => {
            this._lastThrowRace={base:targetBase,out,runnerAt:this.playRunners?.[runnerKey]?.arrivedAt,ballAt:this.time.now};
            if (out && coverPos !== '1B') this.audio.play('tag');
            if (cb) cb();
        });
    }

    // A gap hit doesn't die the instant a fielder reaches it — it skips/rolls
    // a few more feet, a couple of fielders (the chaser + a relay/cutoff man)
    // converge on it, and it gets fired in to the extra base the batter is
    // stretching for. The extra base is already locked in by the outcome
    // tables (this never turns a real Double/Triple into an out), but it now
    // takes real, timed motion to get there instead of freezing dead the
    // moment it's fielded. Runner movement is handled separately by
    // animateAdvances(); this only choreographs the ball/fielders and calls
    // cb() once the throw-in and "Safe!" call finish.
    chaseDownExtraBaseHit(outcome, cb) {
        const home = {x:this.ball.x,y:this.ball.y};
        const isTriple = outcome === 'Triple';
        const targetBase = isTriple ? 'third' : 'second';
        const gapX = isTriple ? Phaser.Math.Between(620, 780) : Phaser.Math.Between(220, 380);
        const landSpot = { x: gapX, y: Phaser.Math.Between(150, 230) };
        const chaserPos = gapX < 380 ? 'LF' : gapX > 620 ? 'RF' : 'CF';
        const cutoffPos = chaserPos === 'LF' ? 'SS' : chaserPos === 'RF' ? '2B' : (isTriple ? '3B' : 'SS');

        // Cover the destination at contact, not after the pickup. The thrower
        // must not wait while a teammate makes an entire run to the bag.
        const coverPos=this.coveringFielder(targetBase,isTriple?cutoffPos:chaserPos);
        const cover=this.fielders[coverPos],bag=BASE_COORDS[targetBase];
        this.jogToPosition(cover,bag.x+9,bag.y+9,115);
        const finalThrow = (fromXY, throwerPos) => {
            const thrower=this.fielders[throwerPos];
            const arm=(FIELDER_RATINGS[throwerPos]||{arm:3}).arm;
            const t=this.throwFlightMs(fromXY,targetBase,arm);
            const throwClip=this.fieldingClip(thrower,this.throwAction(thrower)).clip;
            const receiveClip=this.fieldingClip(cover,this.receiveAction(cover)).clip;
            const flight=Math.max(t,(receiveClip.contactFrame||0)/receiveClip.rate*1000+120);
            const transfer=(throwClip.contactFrame||0)/throwClip.rate*1000;
            const race=this._extraBaseRun,deadline=this.time.now+650;
            const send=()=>{
                this._zoomOnPoint(bag.x,bag.y,1.5,350);
                this.throwToPlayer(thrower,cover,{duration:t,arc:Math.min(50,t*.09)},()=>{
                    const ballAt=this.time.now;
                    // These are awarded extra-base hits. An early throw still
                    // requires a tag; show the swipe as the runner slides past.
                    let tagged=false;
                    const finish=()=>{
                        if(race&&race.arrivedAt==null){
                            if(!tagged&&race.sprite&&Math.hypot(race.sprite.x-cover.x,race.sprite.y-cover.y)<55){
                                // A tag takes ownership from the catch and completes it cleanly.
                                tagged=true;this.defensiveAction(cover,'tag');
                            }
                            this.time.delayedCall(30,finish);return;
                        }
                        this._lastExtraBaseRace={base:targetBase,runnerAt:race?.arrivedAt,ballAt,calledAt:this.time.now};
                        this.bigMessage('SAFE!',1200);this.audio.speak(`Safe at ${BASE_NAMES[targetBase]}.`);this.audio.play('crowd');
                        this.time.delayedCall(1000,()=>{this._zoomOut(360);this.time.delayedCall(380,cb);});
                    };
                    finish();
                });
            };
            const ready=()=>{
                // A short gather can sharpen a close play, but never hold the
                // ball for seconds just to manufacture a close finish.
                const m=race?.move;
                if(m&&m.active&&this.time.now<deadline){
                    let distance=0,last=race.sprite;
                    for(const point of m.path.length?m.path:[m.goal]){distance+=Math.hypot(point.x-last.x,point.y-last.y);last=point;}
                    if(distance/m.speed*1000>transfer+flight-200){this.time.delayedCall(20,ready);return;}
                }
                send();
            };
            this.time.delayedCall(180,ready);
        };

        // Continue the drive away from the plate after its first bounce.
        // Shorten the roll at the fence rather than reversing toward home or
        // sending the ball through the wall.
        const dx=landSpot.x-home.x,dy=landSpot.y-home.y,length=Math.hypot(dx,dy);
        const ux=dx/length,uy=dy/length,wall=FIELD.WALL_ARC;
        const wx=landSpot.x-wall.cx,wy=landSpot.y-wall.cy,dot=wx*ux+wy*uy;
        const toWall=-dot+Math.sqrt(Math.max(0,dot*dot-(wx*wx+wy*wy-(wall.r-18)**2)));
        const roll=Math.min(Phaser.Math.Between(35,65),Math.max(0,toWall));
        const rollSpot = {x:landSpot.x+ux*roll,y:landSpot.y+uy*roll};
        const relaySpot = {
            x: Phaser.Math.Linear(rollSpot.x, BASE_COORDS[targetBase].x, 0.5),
            y: Phaser.Math.Linear(rollSpot.y, BASE_COORDS[targetBase].y, 0.5)
        };
        // A cutoff must not park on a runner's base-touch point. Keep the
        // relay on the outfield side so runners can continue around the bags.
        for(const base of Object.values(BASE_COORDS)){
            if(Math.hypot(relaySpot.x-base.x-16,relaySpot.y-base.y+14)<45)relaySpot.y-=60;
        }
        // Both outfielder and cutoff man break at contact, while the ball
        // travels to the gap and skips toward the eventual pickup point.
        const cutoff=this.fielders[cutoffPos];
        this.jog(cutoff,relaySpot.x,relaySpot.y,Math.hypot(relaySpot.x-cutoff.x,relaySpot.y-cutoff.y)/85*1000/1.5,'Linear');
        this._ballBusy = (this._ballBusy || 0) + 1;
        // Give the deep drive and its skip time to travel while runners round
        // the bases; the delay belongs to the live ball, never the thrower's glove.
        this.chaseGroundBall(this.fielders[chaserPos], home, rollSpot, isTriple?3000:2200, 90, () => {
            this.audio.play('catch');
            this.releaseBall();
            this.hideHeldBall();
            if (isTriple) {
                // Classic outfield-to-third relay through the cutoff man
                this._ballBusy = (this._ballBusy || 0) + 1;
                const armChaser = (FIELDER_RATINGS[chaserPos] || { arm: 3 }).arm;
                const t1 = Math.max(240, this.throwFlightMs(rollSpot, targetBase, armChaser) * 0.5);
                // Let field_bounce render before throw_relay takes over.
                this.time.delayedCall(220, () => {
                    this.throwToPlayer(this.fielders[chaserPos], cutoff, {duration:t1,arc:24}, () => {
                        this.releaseBall();
                        this.time.delayedCall(320, () => finalThrow(relaySpot, cutoffPos));
                    });
                });
            } else {
                // A plain double is a direct throw from the gap to 2nd
                finalThrow(rollSpot, chaserPos);
            }
        }, landSpot);
    }

    // Everyone jogs back to their positions once the play is dead
    returnFielders() {
        Object.keys(this.fielders).forEach(pos => {
            const home = FIELD.FIELDER_HOMES[pos];
            const f = this.fielders[pos];
            if (f._fieldAction) {
                if (!f._returnAfterAction) {
                    f._returnAfterAction = true;
                    const wait = () => {
                        if (!f.active) return;
                        if (f._fieldAction) { this.time.delayedCall(80, wait);return; }
                        f._returnAfterAction = false;this.returnFielders();
                    };
                    this.time.delayedCall(80, wait);
                }
                return;
            }
            if (Math.abs(f.x - home.x) > 2 || Math.abs(f.y - home.y) > 2) {
                this.stopPlayerMovement(f);
                const distance = Math.hypot(f.x - home.x, f.y - home.y);
                this.jog(f, home.x, home.y, Math.max(180, distance / 100 * 1000) / 1.5, 'Linear', null, 'walk');
            } else {
                this.stopPlayerMovement(f);
                this.stopBob(f);
            }
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // PLAYER PITCHING / FIELDING (CPU bats) — with the NEW throw-to-base menu
    // ══════════════════════════════════════════════════════════════════════
    startPitchingPhase() {
        this.pitchGrid = null;
        this.showPitchMenu();
    }

    // Five changing matchups, with exactly two high-variance pitch choices.
    showPitchMenu() {
        // Preserve the same five choices through pause/resume.
        if (!this.pitchGrid) this.pitchGrid=bb2PitchChoices();

        const menu = new PitchZoneGrid(this, {
            x: 146, y: 304, size: 250,
            audio: this.audio, grid: this.pitchGrid,
            onSelect: (opt) => {
                if (opt.value === 'pause') { this.showPauseMenu(() => this.showPitchMenu()); return; }
                this.setMenu(null);
                this.processPitchSelection(this.pitchGrid[opt.value]);
            }
        });
        this.setMenu(menu);
        this.audio.speak('Choose your pitch.');
    }

    // Where the pitch actually goes — ported from v1 getPitchOutcome
    getPitchOutcome(cell) {
        const controlled = Math.random() < (cell.risk ? .60 : .86);
        return {location:controlled?cell.zone:'Center',drifted:!controlled};
    }

    processPitchSelection(cell) {
        const gs = this.gs;
        const pitchOutcome = this.getPitchOutcome(cell);
        const actual = pitchOutcome.location;
        gs.selectedPitch = cell.pitch;
        gs.selectedPitchLocation = actual.includes('Inside') ? 'Inside'
                                 : actual.includes('Outside') ? 'Outside' : 'Middle';
        gs.selectedPitchEffectiveness = cell.effectiveness;
        gs.pitchRisk = !!cell.risk;
        gs.pitchMissedSpot = pitchOutcome.drifted;

        if (gs.lastPitchType === cell.pitch) gs.samePitchCount++;
        else gs.samePitchCount = 1;
        gs.lastPitchType = cell.pitch;

        // Decide the outcome NOW so the choreography can match it: the CPU
        // batter visibly swings as the ball arrives (except on called balls).
        // Inside pitches can hit the batter; aggressive pitches carry more risk.
        const streaks=gs.riskyPitchStreaks || (gs.riskyPitchStreaks={});
        const team=this.isPlayerBatting()?'cpu':'player';
        streaks[team]=cell.risk?(streaks[team]||0)+1:0;
        if(!cell.risk)gs.hbpEscalation=0;
        const hbp=Math.random()<bb2HitBatterChance(cell.risk,streaks[team],gs.selectedPitchLocation==='Inside');
        const outcome = hbp ? 'Hit By Pitch' : this.computeCpuPitchOutcome(cell.pitch);
        const cpuSwings = outcome !== 'Ball' && outcome !== 'Hit By Pitch';

        // Close-up on the duel for the pitch and the CPU's swing
        this.setBattingCamera(true);

        // Unhurried beats so the announcer finishes each line before the next
        this.deliverPitch(800, () => {
            const dur = this.cpuPitchFlight(cell.pitch, () => {
                if (outcome === 'Hit By Pitch') {
                    this.animateHitBatter(()=>this.processCpuOutcome(outcome));
                } else if (outcome === 'Ball' || outcome === 'Strike') {
                    // Into the catcher's glove, small breather for the call
                    this.catchAtPlate();
                    this.time.delayedCall(700, () => this.processCpuOutcome(outcome));
                } else {
                    // CRACK — the hit launches the instant the ball arrives
                    this.contactFlash();
                    this.processCpuOutcome(outcome);
                }
            }, hbp);
            if (cpuSwings) {
                // Swing timed so the whip crosses the zone as the ball arrives
                this.time.delayedCall(Math.max(0, dur - 190), () => {
                    this.animateBatterSwing('normal');
                    this.audio.play('swing');
                });
            }
        });
    }

    // CPU outcome weights include location, command risk and repetition.
    computeCpuPitchOutcome(pitchType) {
        const gs = this.gs;
        const probs = PITCH_PROBABILITIES[pitchType] || PITCH_PROBABILITIES.Fastball;

        let strikeRate = probs.strike;
        let ballRate = probs.ball;
        let foulRate = probs.foul;
        const hitOutcomes = { ...probs.outcomes };

        const effectiveness = gs.selectedPitchEffectiveness || 0.5;
        const effectivenessModifier = (effectiveness - 0.5) * 0.3;
        strikeRate = strikeRate * (1 + effectivenessModifier);

        const hitModifier = 1 - effectivenessModifier;
        Object.keys(hitOutcomes).forEach(key => { hitOutcomes[key] *= hitModifier; });
        if (gs.pitchRisk) {
            // Hit the spot: extra swing-and-miss. Miss it: a hittable hanger.
            strikeRate *= gs.pitchMissedSpot ? .55 : 1.55;
            ballRate *= gs.pitchMissedSpot ? 1.2 : 1;
            for (const key of ['Single','Double','Triple','Home Run']) {
                hitOutcomes[key] *= gs.pitchMissedSpot ? (key==='Single'?1.6:2.8) : .60;
            }
        }

        if (gs.samePitchCount > 2) {
            const penalty = (gs.samePitchCount - 2) * 5;
            strikeRate = Math.max(20, strikeRate - penalty);
            const penaltyReduction = 1;
            const hitBoost = (penalty * penaltyReduction) / Object.keys(hitOutcomes).length;
            Object.keys(hitOutcomes).forEach(key => {
                if (key !== 'Home Run') hitOutcomes[key] += hitBoost;
            });
        }

        const loc = gs.selectedPitchLocation;
        if (loc === 'Middle') {
            strikeRate += ballRate; ballRate = 0;
        } else if (loc === 'Inside') {
            const ballReduction = ballRate * 0.5;
            strikeRate += ballReduction; ballRate = ballRate * 0.5;
        }

        const foulTotal = strikeRate + ballRate + foulRate;
        const hitTotal = Object.values(hitOutcomes).reduce((a, b) => a + b, 0);
        const rand = Math.random() * (foulTotal + hitTotal);

        let outcome;
        if (rand < strikeRate) outcome = 'Strike';
        else if (rand < strikeRate + ballRate) outcome = 'Ball';
        else if (rand < foulTotal) outcome = 'Foul';
        else outcome = weightedChoice(hitOutcomes);

        return outcome;
    }

    processCpuOutcome(outcome) {
        // Pull back out to the full field to watch the play develop
        this.setBattingCamera(false);
        const gs = this.gs;
        const R = GAME_CONSTANTS.GAME_RULES;

        if (outcome === 'Hit By Pitch') {
            this.awardHitByPitch('comp');
            return;
        }

        if (outcome === 'Strike') {
            gs.strikes++;
            if (gs.strikes >= R.MAX_STRIKES) {
                gs.outs++; gs.balls = 0; gs.strikes = 0;
                this.audio.speak('Strike out!');
                this.showPitchCall('Strike Out');
                this.finishPlay('Strike Out');
            } else {
                this.audio.speak(`Strike. ${gs.balls} and ${gs.strikes}.`);
                this.showPitchCall('Strike');
                this.finishPlay('Strike');
            }
            return;
        }

        if (outcome === 'Ball') {
            gs.balls++;
            if (gs.balls >= R.MAX_BALLS) {
                gs.pendingBaseUpdate = () => this.updateBases('Walk', 'comp');
                gs.balls = 0; gs.strikes = 0;
                this.audio.speak('Ball four. Walk.');
                this.showPitchCall('Walk');
                this.animateAdvances('Walk', () => this.finishPlay('Walk'));
            } else {
                this.audio.speak(`Ball. ${gs.balls} and ${gs.strikes}.`);
                this.showPitchCall('Ball');
                this.finishPlay('Ball');
            }
            return;
        }

        if (outcome === 'Foul') {
            this.audio.play('hit');
            if (gs.strikes < 2) gs.strikes++;
            this.animateFoulBall(() => { this.audio.speak('Foul ball.');this.finishPlay('Foul'); });
            return;
        }

        if (outcome === 'Pop Fly Out') {
            this.audio.play('hit');
            gs.outs++; gs.balls = 0; gs.strikes = 0;
            const catcherPos = Phaser.Utils.Array.GetRandom(['CF', 'LF', 'RF', 'SS', '2B']);
            this.chaseFlyBall(FIELD.HOME, catcherPos, spot => {
                this._zoomOnPoint(spot.x, spot.y, 1.7, 300);
                this.bigMessage('CAUGHT!', 1200);
                this.audio.speak('Pop fly. Out!');
                this.time.delayedCall(1300, () => {
                    this._zoomOut(350);
                    this.time.delayedCall(400, () => this.finishPlay('Pop Fly Out'));
                });
            });
            return;
        }

        if (outcome === 'Ground Out') {
            // ★ THE NEW MECHANIC — you decide the throw
            this.audio.play('hit');
            gs.balls = 0; gs.strikes = 0;
            this.startGroundballPlay();
            return;
        }

        if (outcome === 'Single') {
            this.audio.play('hit');
            gs.balls = 0; gs.strikes = 0;
            this.startCpuSingle();
            return;
        }

        // Extra-base hits: ported v1 resolution, cinematic visuals
        this.audio.play(outcome === 'Home Run' ? 'bigHit' : 'hit');
        gs.balls = 0; gs.strikes = 0;
        gs.pendingBaseUpdate = () => this.updateBases(outcome, 'comp');

        if (outcome === 'Home Run') {
            const over = { x: FIELD.WALL.CF.x + Phaser.Math.Between(-160, 160), y: FIELD.WALL.CF.y - 30 };
            this.ballArc(FIELD.HOME, over, 1600, 150, () => {
                this.ball.setVisible(false);
                this.cameras.main.shake(200, 0.008);
                this.bigMessage('CPU HOME RUN', 1800);
                this.audio.speak('Home run.');
                this.audio.play('fail');
                // CPU trots the bases too — it's a real ballgame both ways
                this.animateAdvances('Home Run', () => this.finishPlay(outcome));
            });
        } else {
            this.audio.speak(`${outcome}.`);
            // Runners move while the throw-in plays out for real, same
            // relay choreography as when the player hits an extra-base hit
            let pending = 2;
            const done = () => { if (--pending === 0) this.finishPlay(outcome); };
            this.animateAdvances(outcome, done, true);
            this.chaseDownExtraBaseHit(outcome, done);
        }
    }

    // ─── NEW: interactive ground ball fielding ──────────────────────────────
    startGroundballPlay() {
        const gs = this.gs;
        // Which infielder gets it (weighted toward the middle infield)
        const fielderPos = weightedChoice({ SS: 26, '2B': 24, '3B': 20, '1B': 18, P: 12 });
        const fielder = this.fielders[fielderPos];
        const fhome = FIELD.FIELDER_HOMES[fielderPos];
        const spot = {
            x: Phaser.Math.Linear(FIELD.HOME.x, fhome.x, 0.70) + Phaser.Math.Between(-14, 14),
            y: Phaser.Math.Linear(FIELD.HOME.y, fhome.y, 0.70) + Phaser.Math.Between(-8, 8)
        };

        // On contact the batter and every runner take off (they hold partway
        // while you decide). Quick zoom punch on the pickup, then FULLY zoom
        // out before the menu — UI scales with camera zoom, so menus must
        // only ever appear at zoom 1.
        this.startContactRunners();
        this.startGroundCoverage(fielderPos);
        this._ballBusy = (this._ballBusy || 0) + 1;
        this.chaseGroundBall(fielder, FIELD.HOME, spot, 540, 20, () => {
            this.audio.play('catch');
            this.releaseBall();
            this.hideHeldBall();
            this._zoomOnPoint(spot.x, spot.y, 1.4, 280);
            this.audio.speak(`Ground ball to ${FIELDER_NAMES[fielderPos]}!`);
            this.time.delayedCall(700, () => {
                this._zoomOut(300);
                this.time.delayedCall(320, () => this.showThrowMenu(fielderPos, spot));
            });
        });
    }

    showThrowMenu(fielderPos, spot, outfield = false) {
        const options = getGroundballThrowOptions(this.gs.bases, this.gs.outs).map(o=>
            outfield&&o.value!=='hold'?{...o,context:'cutdown',dpChance:false,hint:'Try to beat the runner with a long throw'}:o);
        // Highlight the base PLAYER covering each legal target (pitcher = end
        // the play) instead of a text list — you throw to a person, not a menu.
        // If the fielder who has the ball covers that bag HIMSELF (1B on a
        // grounder to first, middle infield at second, 3B at third), it's an
        // unassisted play: he races the runner to the bag.
        const chips = { first: '1ST', second: '2ND', third: '3RD', home: 'HOME', hold: 'PITCHER' };
        const UNASSISTED = { first: ['1B'], second: ['2B', 'SS'], third: ['3B'], home: ['C'] };
        const targets = options.map(o => {
            if (o.value === 'hold') return { ...o, chip: chips[o.value], fielder: this.fielders.P };
            const unassisted = (UNASSISTED[o.value] || []).includes(fielderPos);
            if (unassisted) {
                return {
                    ...o, unassisted: true, chip: chips[o.value],
                    label: `Take it to ${BASE_NAMES[o.value]}`,
                    hint: 'Race the runner to the bag yourself',
                    fielder: { x: BASE_COORDS[o.value].x, y: BASE_COORDS[o.value].y }
                };
            }
            return {
                ...o,
                chip: chips[o.value],
                fielder: this.fielders[this.coveringFielder(o.value, fielderPos)]
            };
        });
        this.setMenu(new BaseTargetSelector(this, {
            targets, audio: this.audio, title: 'Make the Throw!', zoomOnScan: true,
            onSelect: (opt) => {
                this.setMenu(null);
                this.resolveGroundThrow(fielderPos, spot, opt);
            }
        }));
    }

    resolveGroundThrow(fielderPos, spot, opt) {
        const gs = this.gs;

        if (opt.value === 'hold') {
            this.audio.speak('Single.');
            ['batter', 'first', 'second', 'third'].forEach(k => this.sendRunner(k, 1100));
            gs.pendingBaseUpdate = () => this.updateBases('Single', 'comp');
            let pending=2;
            const done=()=>{if(--pending===0){this._zoomOut(360);this.finishPlay('Single');}};
            this.time.delayedCall(1200,done);
            const holder=this.fielders[fielderPos],pitcher=this.fielders.P;
            if(holder===pitcher)done();
            else this.throwToPlayer(holder,pitcher,{arc:30},done);
            return;
        }

        const targetBase = opt.value;
        const bag = BASE_COORDS[targetBase];
        const runnerForBase = { first: 'batter', second: 'first', third: 'second', home: 'third' };

        if (opt.unassisted) {
            // Unassisted: he takes it to the bag himself. Same odds model as a
            // force throw, small bonus for the short run, distance penalized.
            const fielder = this.fielders[fielderPos];
            const dist = Phaser.Math.Distance.Between(spot.x, spot.y, bag.x, bag.y);
            const runMs = Math.max(420, (dist / 0.22) * 1.5);
            const chance = Phaser.Math.Clamp(
                THROW_TUNING.BASE_CHANCE.force + 0.03 - Math.max(0, dist - 120) * 0.0008,
                THROW_TUNING.MIN, THROW_TUNING.MAX);
            const out = Math.random() < chance;
            const runnerKey = runnerForBase[targetBase];

            this.audio.speak(`Taking it to ${BASE_NAMES[targetBase]}!`);
            this._zoomOnPoint(bag.x, bag.y, 1.6, Math.max(300, runMs));
            this.stopPlayerMovement(fielder);
            // The ball rides in his glove — visible again for the carry, since
            // startGroundballPlay's fielding hid it a moment ago.
            this.ball.setAlpha(1);
            this._ballBusy = (this._ballBusy || 0) + 1;
            if (runnerKey) this.sendRunner(runnerKey, out ? runMs + 280 : Math.max(180, runMs - 220), targetBase, { slide: true, out });

            this.startBob(fielder);
            this.movePlayer({targets:fielder,x:bag.x+7,y:bag.y+7,duration:runMs,
                onUpdate:()=>{
                    const hand=fielder.ballPoint ? fielder.ballPoint('glove') : {x:fielder.x,y:fielder.y-8};
                    this.ball.setPosition(hand.x,hand.y);
                },onComplete:()=>{
                this.stopBob(fielder);this.releaseBall();
                this.audio.play(out ? 'tag' : 'catch');
                // He carried the ball in himself rather than receiving a
                // throw, so 'stretch_catch' (which reads as catching
                // something arcing in) would be wrong even at first base —
                // just the plain secure-the-ball / tag poses.
                this.bb2Anim(fielder, out ? 'tag' : 'receive_at_bag');
                this.hideHeldBall();
                if (out) {
                    this.cameras.main.shake(140, 0.006);
                    this.applyThrowOut(targetBase, fielderPos, opt.dpChance !== false);
                } else {
                    this.bigMessage('SAFE!', 1300);
                    this.audio.speak(`Safe at ${BASE_NAMES[targetBase]}!`);
                    Object.keys(runnerForBase).forEach(b => {
                        if (runnerForBase[b] !== runnerKey) this.sendRunner(runnerForBase[b], 1000);
                    });
                    gs.pendingBaseUpdate = () => this.updateBases('Single', 'comp');
                    this.time.delayedCall(1300, () => {
                        this._zoomOut(380);
                        this.finishPlay('Single');
                    });
                }
            }});
            return;
        }

        const result = computeThrowOutcome(fielderPos, spot, targetBase, opt.context);

        this.audio.speak(`Throw to ${BASE_NAMES[targetBase]}!`);
        // Camera rides the throw to the bag while the cover man and runner race in
        this._zoomOnPoint(bag.x, bag.y, 1.6, Math.max(280, result.throwTimeMs));

        this.animateThrowRace({
            fromXY: spot, throwerPos: fielderPos, targetBase,
            out: result.out, throwTimeMs: result.throwTimeMs,
            runnerKey: runnerForBase[targetBase]
        }, () => {
            if (result.out) {
                this.cameras.main.shake(140, 0.006);
                this.applyThrowOut(targetBase, fielderPos, opt.dpChance !== false);
            } else {
                this.bigMessage('SAFE!', 1300);
                this.audio.speak(`Safe at ${BASE_NAMES[targetBase]}!`);
                // Everyone else completes their advance
                Object.keys(runnerForBase).forEach(b => {
                    if (runnerForBase[b] !== runnerForBase[targetBase]) this.sendRunner(runnerForBase[b], 1000);
                });
                gs.pendingBaseUpdate = () => this.updateBases('Single', 'comp');
                this.time.delayedCall(1300, () => {
                    this._zoomOut(380);
                    this.finishPlay('Single');
                });
            }
        });
    }

    // Successful throw: record the out, then handle the double-play relay
    applyThrowOut(targetBase, fielderPos, allowRelay = true) {
        const gs = this.gs;
        // A play at the plate is the catcher's tag
        if (targetBase === 'home') this.catcherAnim('tag_home');
        gs.outs++;

        if (targetBase === 'first') {
            this.bigMessage('OUT!', 1200);
            this.audio.speak('Out at first!');
            // Batter is out; the other runners finish their advance
            ['first', 'second', 'third'].forEach(k => this.sendRunner(k, 1000));
            gs.pendingBaseUpdate = () => {
                if (gs.bases.first) {
                    if (gs.bases.second) {
                        // A run can't score on the same play as a force out that ends the inning.
                        if (gs.bases.third && gs.outs < GAME_CONSTANTS.GAME_RULES.MAX_OUTS) gs.score[this.battingScoreKey()]++;
                        gs.bases.third = gs.bases.second;
                    }
                    gs.bases.second = gs.bases.first;
                    gs.bases.first = null;
                }
            };
            this.time.delayedCall(1200, () => { this._zoomOut(380); this.finishPlay('Ground Out'); });
            return;
        }

        if (targetBase === 'second') {
            // Force at second succeeded. Try to turn two?
            gs.bases.first = null; // that runner is out at 2nd
            if(!allowRelay){
                this.bigMessage('OUT AT 2ND',1300);this.audio.speak('Out at second!');
                ['batter','second','third'].forEach(k=>this.sendRunner(k,1000));
                gs.pendingBaseUpdate=()=>{
                    if(gs.bases.second){
                        if(gs.bases.third&&gs.outs<GAME_CONSTANTS.GAME_RULES.MAX_OUTS)gs.score[this.battingScoreKey()]++;
                        gs.bases.third=gs.bases.second;
                    }
                    gs.bases.second=null;gs.bases.first='comp';
                };
                this.time.delayedCall(1300,()=>{this._zoomOut(380);this.finishPlay('Ground Out');});
                return;
            }
            if (gs.outs < GAME_CONSTANTS.GAME_RULES.MAX_OUTS) {
                this.audio.speak('Out at second!');
                // The cover man who took the throw at 2nd turns the pivot
                const pivot = this.coveringFielder('second', fielderPos);
                const relay = computeThrowOutcome(pivot, FIELD.SECOND, 'first', 'dpRelay');
                this.time.delayedCall(240, () => {
                    this._zoomOnPoint(FIELD.FIRST.x, FIELD.FIRST.y, 1.7, Math.max(260, relay.throwTimeMs));
                    this.animateThrowRace({
                        fromXY: FIELD.SECOND, throwerPos: pivot, targetBase: 'first',
                        out: relay.out, throwTimeMs: relay.throwTimeMs, runnerKey: 'batter'
                    }, () => {
                        if (relay.out) {
                            gs.outs++;
                            this.cameras.main.shake(220, 0.009);
                            this.bigMessage('DOUBLE PLAY!', 1600);
                            this.audio.speak('Double play!');
                            this.audio.play('crowd_big');
                            ['second', 'third'].forEach(k => this.sendRunner(k, 1000));
                            gs.pendingBaseUpdate = () => {
                                if (gs.bases.second) {
                                    // A run can't score on the same play as a force out that ends the inning.
                                    if (gs.bases.third && gs.outs < GAME_CONSTANTS.GAME_RULES.MAX_OUTS) gs.score[this.battingScoreKey()]++;
                                    gs.bases.third = gs.bases.second;
                                }
                                gs.bases.second = null;
                            };
                            this.time.delayedCall(1600, () => { this._zoomOut(380); this.finishPlay('Double Play'); });
                        } else {
                            this.bigMessage('OUT AT 2ND', 1300);
                            this.audio.speak(`Safe at first. ${gs.outs} ${gs.outs === 1 ? 'out' : 'outs'}.`);
                            ['second', 'third'].forEach(k => this.sendRunner(k, 1000));
                            gs.pendingBaseUpdate = () => {
                                if (gs.bases.second) {
                                    if (gs.bases.third) gs.score[this.battingScoreKey()]++;
                                    gs.bases.third = gs.bases.second;
                                }
                                gs.bases.second = null;
                                gs.bases.first = 'comp'; // batter reaches
                            };
                            this.time.delayedCall(1300, () => { this._zoomOut(380); this.finishPlay('Ground Out'); });
                        }
                    });
                });
            } else {
                this.bigMessage('OUT!', 1300);
                this.audio.speak('Out at second!');
                this.time.delayedCall(1300, () => { this._zoomOut(380); this.finishPlay('Ground Out'); });
            }
            return;
        }

        if (targetBase === 'third') {
            this.bigMessage('OUT AT 3RD!', 1400);
            this.audio.speak('Out at third!');
            ['batter', 'first', 'third'].forEach(k => this.sendRunner(k, 1000));
            gs.pendingBaseUpdate = () => {
                // Forced home, throw went to 3rd instead — but no run counts if this force out is the 3rd out.
                if (gs.bases.third && gs.outs < GAME_CONSTANTS.GAME_RULES.MAX_OUTS) gs.score[this.battingScoreKey()]++;
                gs.bases.third = null;
                gs.bases.second = null;              // lead runner out at 3rd
                if (gs.bases.first) { gs.bases.second = gs.bases.first; }
                gs.bases.first = 'comp';             // batter reaches
            };
            this.time.delayedCall(1400, () => { this._zoomOut(380); this.finishPlay('Ground Out'); });
            return;
        }

        if (targetBase === 'home') {
            this.bigMessage('OUT AT HOME!', 1500);
            this.audio.speak('Out at home!');
            this.audio.play('crowd');
            ['batter', 'first', 'second'].forEach(k => this.sendRunner(k, 1000));
            gs.pendingBaseUpdate = () => {
                gs.bases.third = null;               // runner out at home
                if (gs.bases.second && gs.bases.first) { gs.bases.third = gs.bases.second; gs.bases.second = null; }
                if (gs.bases.first) { gs.bases.second = gs.bases.first; }
                gs.bases.first = 'comp';             // batter reaches
            };
            this.time.delayedCall(1500, () => { this._zoomOut(380); this.finishPlay('Ground Out'); });
        }
    }

    // CPU single to the outfield — offer a cutdown throw when a lead runner
    // is trying for an extra base (the other half of the new mechanic)
    startCpuSingle() {
        const gs = this.gs;
        const outfielderPos = Phaser.Utils.Array.GetRandom(['LF', 'CF', 'RF']);
        const fielder = this.fielders[outfielderPos];
        const fhome = FIELD.FIELDER_HOMES[outfielderPos];
        const spot = { x: fhome.x + Phaser.Math.Between(-30, 30), y: fhome.y + Phaser.Math.Between(20, 60) };

        this.startContactRunners();
        this.startGroundCoverage(outfielderPos);
        this._ballBusy = (this._ballBusy || 0) + 1;
        this.chaseGroundBall(fielder, FIELD.HOME, spot, 700, 14, () => {
            this.audio.play('catch');this.releaseBall();this.hideHeldBall(fielder);
            this.audio.speak('Base hit. Choose your throw.');
            // Choice time is unlimited; only automatic fielding has a deadline.
            this.time.delayedCall(220,()=>this.showThrowMenu(outfielderPos,spot,true));
        });
    }

    resolveCutdownThrow(outfielderPos, spot, contested, opt) {
        const gs = this.gs;
        const runnerKey = contested === 'home' ? 'third' : 'second';

        if (opt.value === 'hold') {
            this.audio.speak('The play stands.');
            ['batter', 'first', 'second', 'third'].forEach(k => this.sendRunner(k, 1100));
            gs.pendingBaseUpdate = () => this.updateBases('Single', 'comp');
            this.time.delayedCall(1100, () => { this._zoomOut(360); this.finishPlay('Single'); });
            return;
        }

        const target = BASE_COORDS[contested];
        const result = computeThrowOutcome(outfielderPos, spot, contested, 'cutdown');
        this.audio.speak('The throw...');
        this._zoomOnPoint(target.x, target.y, 1.7, Math.max(300, result.throwTimeMs));

        this.animateThrowRace({
            fromXY: spot, throwerPos: outfielderPos, targetBase: contested,
            out: result.out, throwTimeMs: result.throwTimeMs, runnerKey
        }, () => {
            // The other runners finish their advance either way
            ['batter', 'first', 'second', 'third'].forEach(k => {
                if (k !== runnerKey) this.sendRunner(k, 1000);
            });

            if (result.out) {
                gs.outs++;
                this.cameras.main.shake(220, 0.009);
                this.bigMessage(contested === 'home' ? 'OUT AT THE PLATE!' : 'CUT DOWN!', 1700);
                this.audio.speak(contested === 'home' ? 'Out at the plate!' : 'Out at third!');
                this.audio.play('crowd_big');
                gs.pendingBaseUpdate = () => {
                    if (contested === 'home') {
                        // Runner from 3rd erased; everyone else force-advances on the single
                        gs.bases.third = null;
                        if (gs.bases.second) { gs.bases.third = gs.bases.second; gs.bases.second = null; }
                        if (gs.bases.first) { gs.bases.second = gs.bases.first; }
                        gs.bases.first = 'comp';
                    } else {
                        // Runner from 2nd erased at 3rd
                        gs.bases.second = null;
                        if (gs.bases.first) { gs.bases.second = gs.bases.first; }
                        gs.bases.first = 'comp';
                    }
                };
                this.time.delayedCall(1700, () => { this._zoomOut(380); this.finishPlay('Ground Out'); });
            } else {
                this.bigMessage('SAFE!', 1400);
                this.audio.speak(contested === 'home' ? 'Safe. Run scores.' : 'Safe at third.');
                gs.pendingBaseUpdate = () => this.updateBases('Single', 'comp');
                this.time.delayedCall(1400, () => { this._zoomOut(380); this.finishPlay('Single'); });
            }
        });
    }

    // ─── Base advancement (ported verbatim from v1 updateBases) ─────────────
    updateBases(outcome, batter) {
        const gs = this.gs;
        const team = this.battingScoreKey();

        if (outcome === 'Single') {
            // Only forced runners must advance (a continuous chain from first,
            // since the batter needs first). A runner not part of that chain
            // (e.g. alone on 2nd/3rd with first open) is free to hold.
            if (gs.bases.first) {
                if (gs.bases.second) {
                    if (gs.bases.third) gs.score[team]++;
                    gs.bases.third = gs.bases.second;
                }
                gs.bases.second = gs.bases.first;
            }
            gs.bases.first = batter;

        } else if (outcome === 'Walk') {
            if (gs.bases.first) {
                if (gs.bases.second) {
                    if (gs.bases.third) gs.score[team]++;
                    gs.bases.third = gs.bases.second;
                }
                gs.bases.second = gs.bases.first;
            }
            gs.bases.first = batter;

        } else if (outcome === 'Double') {
            if (gs.bases.third) gs.score[team]++;
            if (gs.bases.second) gs.score[team]++;
            gs.bases.third = gs.bases.first;
            gs.bases.first = null;
            gs.bases.second = batter;

        } else if (outcome === 'Triple') {
            ['first', 'second', 'third'].forEach(base => {
                if (gs.bases[base]) gs.score[team]++;
                gs.bases[base] = null;
            });
            gs.bases.third = batter;

        } else if (outcome === 'Home Run') {
            let runs = 1;
            ['first', 'second', 'third'].forEach(base => {
                if (gs.bases[base]) { runs++; gs.bases[base] = null; }
            });
            gs.score[team] += runs;
        }
    }

    // Every live ball ends its play thrown back to the pitcher — it reads as
    // the play being called dead, and guarantees the ball is never stranded
    // somewhere on the field. Dead-ball outcomes just put the ball away.
    returnBallToPitcher(outcome) {
        const deadBall = ['Home Run','Foul','Strike','Ball','Strike Out','Walk','Hit By Pitch'];
        if (this._returnPending) return;
        this._returnPending = true;
        const attempt = () => {
            if ((this._ballBusy || 0) > 0 || this._receivingPitch) {
                this.time.delayedCall(120, attempt);return;
            }
            if (!this.ball.visible || this.gs.gameOver || deadBall.includes(outcome)) {
                this._returnPending = false;this.ball.setVisible(false);this.returnFielders();return;
            }
            const pitcher = this.fielders.P;
            const holder = this._ballHolder && this._ballHolder.active ? this._ballHolder
                : Object.values(this.fielders).filter(p=>p.active).sort((a,b)=>
                    Math.hypot(a.x-this.ball.x,a.y-this.ball.y)-Math.hypot(b.x-this.ball.x,b.y-this.ball.y))[0];
            if (!holder || holder === pitcher) {
                this._returnPending = false;this.ball.setVisible(false);this.returnFielders();return;
            }
            if (holder._fieldAction || pitcher._busy) { this.time.delayedCall(80,attempt);return; }
            this.stopPlayerMovement(pitcher);
            this.throwToPlayer(holder, pitcher, {arc:30,onReceiveDone:()=>this.returnFielders()}, () => {
                this.ball.setVisible(false);this._returnPending = false;this.returnFielders();
            });
        };
        attempt();
    }

    // ─── End-of-play / inning / game (ported from v1 finishPlay etc.) ───────
    finishPlay(outcome) {
        const gs = this.gs;
        this.setDefenseReady(false);
        this.setMenu(null);
        this.resetFieldCamera();
        if (gs.pendingBaseUpdate) {
            gs.pendingBaseUpdate();
            gs.pendingBaseUpdate = null;
        }
        this.returnBallToPitcher(outcome);
        this.clearContactRunners();
        this.syncRunners();

        // Season games save after every play so they can be resumed
        if (this.isSeason && this.season.isActive() && !gs.gameOver) {
            this.season.saveGameState({
                inning: gs.inning, half: gs.half, outs: gs.outs,
                score: { ...gs.score }, bases: { ...gs.bases },
                balls: gs.balls, strikes: gs.strikes,
                playerIsAway: gs.playerIsAway,
                samePitchCount: gs.samePitchCount, lastPitchType: gs.lastPitchType
            }, this.opponentName);
        }

        // Walk-off: home team takes the lead in the bottom of the 9th or later
        if (gs.inning >= GAME_CONSTANTS.GAME_RULES.INNINGS_PER_GAME &&
            gs.half === 'bottom' &&
            gs.score.Blue > gs.score.Red) {
            this.time.delayedCall(1500, () => this.endGame());
            return;
        }

        this.resetBatter(outcome);
        this.time.delayedCall(2200, () => {
            if (gs.outs >= GAME_CONSTANTS.GAME_RULES.MAX_OUTS) {
                this.endHalfInning();
            } else {
                this.time.delayedCall(300, () => this.nextPlay());
            }
        });
    }

    endHalfInning() {
        const gs = this.gs;
        this.resetFieldCamera();
        this.audio.speak('That retires the side.');
        gs.outs = 0;
        gs.bases = { first: null, second: null, third: null };
        gs.balls = 0;
        gs.strikes = 0;

        if (gs.half === 'top') {
            // Home team ahead after the visitors bat in the 9th+ → game over
            if (gs.inning >= GAME_CONSTANTS.GAME_RULES.INNINGS_PER_GAME &&
                gs.score.Blue > gs.score.Red) {
                this.endGame();
                return;
            }
            gs.half = 'bottom';
        } else {
            if (gs.inning >= GAME_CONSTANTS.GAME_RULES.INNINGS_PER_GAME) {
                if (gs.score.Red !== gs.score.Blue) {
                    this.endGame();
                    return;
                } else if (gs.inning === GAME_CONSTANTS.GAME_RULES.INNINGS_PER_GAME) {
                    this.audio.speak('The game is tied. We go to extra innings!');
                }
            }
            gs.inning++;
            gs.half = 'top';
        }

        gs.firstPitch = true;
        this.syncRunners();
        // The teams visibly trade places on the field
        this.swapSides(() => this.nextPlay());
    }

    endGame() {
        const gs = this.gs;
        this.resetFieldCamera();
        gs.gameOver = true;
        const youKey = gs.playerIsAway ? 'Red' : 'Blue';
        const cpuKey = gs.playerIsAway ? 'Blue' : 'Red';
        const playerWon = gs.score[youKey] > gs.score[cpuKey];
        this.setMenu(null);
        this.stopChargeMonitor();

        // Season bookkeeping (record the result, advance stage/series)
        let seasonOutcome = null;
        if (this.isSeason && this.season.isActive()) {
            seasonOutcome = this.season.recordResult(gs.score[youKey], gs.score[cpuKey]);
            this.season.clearGameState();
        }

        this.time.delayedCall(600, () => {
            this.scene.start('ResultScene', {
                playerWon,
                you: gs.score[youKey],
                cpu: gs.score[cpuKey],
                isSeason: this.isSeason,
                playerColorName: this.playerColorName,
                opponentColorName: this.opponentName,
                seasonOutcome
            });
        });
    }

    // ─── Pause ───────────────────────────────────────────────────────────────
    showPauseMenu(resumeCb) {
        this.resetFieldCamera(0);
        const vm = window.NarbeVoiceManager;
        const soundOn = this.audio.settings.soundEnabled;
        const musicOn = this.audio.settings.musicEnabled;
        const ttsOn = vm && vm.getSettings ? vm.getSettings().ttsEnabled !== false : true;
        const voiceName = (vm && vm.getCurrentVoice && vm.getVoiceDisplayName)
            ? vm.getVoiceDisplayName(vm.getCurrentVoice()) : 'Default';
        this.setMenu(new ScanList(this, {
            x: W / 2, y: H / 2, itemW: 340, itemH: 40, gap: 8,
            audio: this.audio, title: 'Paused',
            options: [
                { value: 'resume', label: 'Resume Game' },
                { value: 'batting', label: bb2BattingLabel(), hint: 'Change how you swing' },
                { value: 'music', label: `Music: ${musicOn ? 'ON' : 'OFF'}` },
                { value: 'sound', label: `Sound Effects: ${soundOn ? 'ON' : 'OFF'}` },
                { value: 'tts', label: `Text-to-Speech: ${ttsOn ? 'ON' : 'OFF'}` },
                { value: 'voice', label: `Voice: ${voiceName}` },
                { value: 'nexttrack', label: 'Next Track' },
                { value: 'help', label: 'Help' },
                { value: 'quit', label: 'Quit to Title' }
            ],
            onSelect: (opt) => {
                if (opt.value === 'resume') { this.setMenu(null); resumeCb(); }
                else if (opt.value === 'batting') { this.audio.speak(bb2ToggleBatting(), true); this.showPauseMenu(resumeCb); }
                else if (opt.value === 'sound') { this.audio.toggleSound(); this.showPauseMenu(resumeCb); }
                else if (opt.value === 'music') { this.audio.toggleMusic(); this.showPauseMenu(resumeCb); }
                else if (opt.value === 'tts') {
                    if (vm && typeof vm.toggleTTS === 'function') vm.toggleTTS();
                    this.showPauseMenu(resumeCb);
                }
                else if (opt.value === 'voice') {
                    if (vm && typeof vm.cycleVoice === 'function') {
                        vm.cycleVoice();
                        const nv = (vm.getCurrentVoice && vm.getVoiceDisplayName)
                            ? vm.getVoiceDisplayName(vm.getCurrentVoice()) : 'voice';
                        this.audio.speak(`Voice: ${nv}.`, true);
                    }
                    this.showPauseMenu(resumeCb);
                }
                else if (opt.value === 'nexttrack') { this.audio.nextTrack(); this.showPauseMenu(resumeCb); }
                else if (opt.value === 'help') { this.audio.speak('I need help', true); }
                else if (opt.value === 'quit') { this.setMenu(null); this.scene.start('TitleScene'); }
            }
        }));
    }
}

// ─── Result ──────────────────────────────────────────────────────────────────
// Post-game screen. In season mode the message reflects the football-style
// stage transition (series progress, made playoffs, champions, ...) and
// CONTINUE returns to the SeasonScene standings table.
class ResultScene extends BaseballScene {
    constructor() { super('ResultScene'); }

    create(data) {
        this.audio = audioSys();
        this.season = seasonMgr();
        this._playerMotion = new BaseballPlayerMotion(this);
        const o = data.seasonOutcome;
        const isChamp = o === 'champions';

        this.add.rectangle(W / 2, H / 2, W, H, isChamp ? 0x2a230a : data.playerWon ? 0x123a18 : 0x2a1414);

        const headline = isChamp ? 'CHAMPIONS!' : data.playerWon ? 'YOU WON!' : 'YOU LOST';
        const head = this.add.text(W / 2, 130, headline, {
            fontSize: isChamp ? '80px' : '72px', fontFamily: 'Arial Black',
            color: isChamp ? '#ffd700' : data.playerWon ? '#ffe14d' : '#ff8888',
            stroke: '#000', strokeThickness: 10
        }).setOrigin(0.5);
        this.add.text(W / 2, 216, `Final Score:  YOU ${data.you}  —  CPU ${data.cpu}`, {
            fontSize: '28px', fontFamily: 'Arial Black', color: '#ffffff',
            stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5);

        // Season transition messaging
        let sub = '', speech = data.playerWon
            ? `You won, ${data.you} to ${data.cpu}!`
            : `You lost, ${data.cpu} to ${data.you}.`;
        if (o) {
            const d = this.season.data || {};
            const s = this.season.isActive() ? this.season.seriesInfo() : null;
            if (o === 'champions') {
                sub = 'YOU WON THE CHAMPIONSHIP SERIES!';
                speech += ' You won the championship series! You are the champions! What a season!';
            } else if (o === 'perfect_to_championship') {
                sub = 'PERFECT SEASON! Straight to the Championship Series!';
                speech += ' A perfect sixteen and oh season! You go straight to the best of five championship series!';
            } else if (o === 'made_playoffs') {
                sub = 'You made the playoffs! Quarterfinal series is next.';
                speech += ' You made the playoffs! The best of three quarterfinal series is next.';
            } else if (o === 'advanced_semifinal') {
                sub = 'Series won! On to the Semifinals!';
                speech += ' You won the series! On to the best of three semifinal series!';
            } else if (o === 'advanced_championship') {
                sub = 'Series won! On to the CHAMPIONSHIP!';
                speech += ' You won the series! On to the best of five championship series!';
            } else if (o === 'series_next') {
                sub = s ? `${s.label} series: ${s.wins}-${s.losses}` : 'The series continues.';
                speech += s ? ` The series is now ${s.wins} to ${s.losses}.` : '';
            } else if (o === 'eliminated') {
                sub = 'You lost the series. Season over.';
                speech += ' You lost the series. Your season is over.';
            } else if (o === 'lost_championship') {
                sub = 'You lost the championship series.';
                speech += ' You lost the championship series. So close! Great season.';
            } else if (o === 'missed_playoffs') {
                sub = 'Season over — missed the playoffs.';
                speech += ` Your final record is ${d.wins} and ${d.losses}. Not enough wins for the playoffs.`;
            } else {
                sub = `Record: ${d.wins} - ${d.losses}`;
                speech += ` Your record is ${d.wins} and ${d.losses}.`;
            }
        } else {
            speech += data.playerWon ? ' Great game!' : ' Better luck next time.';
        }
        if (sub) {
            this.add.text(W / 2, 272, sub, {
                fontSize: '23px', fontFamily: 'Arial Black', color: '#ffe14d',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5);
        }
        this.audio.speak(speech);
        this.audio.play(isChamp ? 'homer' : data.playerWon ? 'crowd_big' : 'fail');

        if (isChamp) {
            this.tweens.add({ targets: head, scale: 1.12, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            this.time.addEvent({ delay: 900, repeat: 8, callback: () => this.audio.play('crowd') });
        }

        const options = [];
        if (data.isSeason) {
            options.push({ value: 'season', label: 'CONTINUE', hint: 'back to the season screen' });
        } else {
            options.push({ value: 'again', label: 'PLAY AGAIN' });
        }
        options.push({ value: 'title', label: 'MAIN MENU' });

        this.menu = new ScanList(this, {
            x: W / 2, y: 430, itemW: 340,
            audio: this.audio, options,
            onSelect: (opt) => {
                this.menu.destroy(); this.menu = null;
                if (opt.value === 'season') this.scene.start('SeasonScene');
                else if (opt.value === 'again') {
                    this.scene.start('GameScene', {
                        isSeason: false,
                        playerColorName: data.playerColorName
                    });
                }
                else this.scene.start('TitleScene');
            }
        });
        this.scanInput = new ScanInput(this, {
            forward:  () => this.menu && this.menu.next(false),
            backward: () => this.menu && this.menu.prev(false),
            select:   () => this.menu && this.menu.select()
        });
    }
}

// ─── Shared helper (ported from v1 GameLogic.weightedChoice) ─────────────────
function weightedChoice(weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (const [outcome, weight] of Object.entries(weights)) {
        rand -= weight;
        if (rand <= 0) return outcome;
    }
    return Object.keys(weights)[0];
}
