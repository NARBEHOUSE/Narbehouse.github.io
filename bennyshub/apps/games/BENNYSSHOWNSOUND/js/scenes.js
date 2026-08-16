// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND — Scenes
//   Boot -> Title -> CategorySelect -> Wheel
// ═══════════════════════════════════════════════════════════════════════════════

const HELP_TEXT =
    "Show n Sound. First pick a category. Under the wheel there are three " +
    "buttons: Spin, New Game, and Main Menu. Press your switch to move between " +
    "them and press Enter to choose one. Choose Spin to spin the wheel — you " +
    "can press Enter or your switch again at any time to stop it right where " +
    "it is. When it stops, the picture grows big in the middle and you hear " +
    "its sound. Press Enter or your switch to go back to the wheel and spin again.";

/**
 * Leave the game and hand control back to the hub.
 *
 * The hub runs apps in an iframe and listens for a `focusBackButton` message to
 * close it (index.html ~2611). Outside the hub there is no parent to tell, so we
 * navigate to the hub page directly. Same pattern as Football, Dice and Bowling.
 */
function exitToHub() {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ action: 'focusBackButton' }, '*');
    } else {
        window.location.href = '../../../index.html';
    }
}

/**
 * Open the pack editor.
 *
 * Inside the hub's Electron shell this hands off to the main process, which
 * serves the editor over localhost and opens it in Chrome — editors need real
 * mouse and keyboard, which an Electron iframe handles badly. Outside the hub
 * (or if that fails) it falls back to a plain window.open. Same pattern as
 * BENNYSMINIGOLF/js/menu.js and BENNYSPEGGLE.
 */
function openShowNSoundEditor() {
    const fallback = () => {
        try { window.open('editor.html', '_blank'); }
        catch (e) { console.warn('[Editor] could not open editor.html', e); }
    };
    const api = (typeof window !== 'undefined') ? window.electronAPI : null;
    if (api && api.editor && typeof api.editor.open === 'function') {
        api.editor.open('shownsound').then(result => {
            if (result && result.success) {
                console.log('[Editor] opened in Chrome:', result.url);
            } else {
                console.warn('[Editor] launch failed:', result && result.error);
                fallback();
            }
        }).catch(err => { console.warn('[Editor] launch error:', err); fallback(); });
    } else {
        fallback();
    }
}

// Shown before leaving the switch-accessible game for a mouse-driven tool.
const EDITOR_WARN = [
    { label: 'Continue (mouse needed)', value: 'editor-go',
      speakText: 'Continue. The editor needs a mouse and keyboard.' },
    { label: 'Cancel', value: 'editor-cancel' }
];

// ═══════════════════════════════════════════════════════════════════════════════
// Settings
//
// One definition, two surfaces: the Settings screen off the main menu and the
// Settings page of the pause menu. Laid out in TWO COLUMNS — a single column of
// eight toggles is a long scan for a switch user and looks like a wall of text.
// ═══════════════════════════════════════════════════════════════════════════════

const SETTINGS_LAYOUT = {
    columns: 2, itemW: 330, itemH: 54, gap: 14, fontSize: '20px'
};

function settingsOptions(audio) {
    const sm = window.NarbeScanManager;
    const vm = window.NarbeVoiceManager;
    const a = audio.settings;
    const ttsOn = vm && vm.getSettings ? vm.getSettings().ttsEnabled !== false : true;
    return [
        { label: `Auto Scan: ${sm && sm.getSettings().autoScan ? 'On' : 'Off'}`, value: 'autoscan' },
        { label: `Scan Speed: ${sm ? (sm.getScanInterval() / 1000) + 's' : 'n/a'}`, value: 'speed' },
        { label: `Panel Sounds: ${a.panelEnabled ? 'On' : 'Off'}`, value: 'panelsound' },
        { label: `Game Sounds: ${a.soundEnabled ? 'On' : 'Off'}`, value: 'sfx' },
        { label: `Speak Name: ${a.speakOnLand ? 'On' : 'Off'}`, value: 'speak' },
        { label: `Speech: ${ttsOn ? 'On' : 'Off'}`, value: 'tts' },
        { label: 'How to Play', value: 'help' },
        { label: 'Make a Wheel', value: 'editor',
          speakText: 'Make a wheel. Opens the editor, which needs a mouse.' },
        { label: '← Back', value: 'back', speakText: 'Back' }
    ];
}

/**
 * Apply a settings choice.
 * @returns {'refresh'|'back'|null} what the caller should do next
 */
function applySetting(value, audio) {
    const sm = window.NarbeScanManager;
    const vm = window.NarbeVoiceManager;
    switch (value) {
        case 'autoscan':
            if (sm) sm.updateSettings({ autoScan: !sm.getSettings().autoScan });
            return 'refresh';
        case 'speed':
            if (sm) sm.cycleScanSpeed();
            return 'refresh';
        case 'panelsound': audio.togglePanelSound(); return 'refresh';
        case 'sfx':        audio.toggleSound();      return 'refresh';
        case 'speak':      audio.toggleSpeakOnLand(); return 'refresh';
        case 'tts':
            if (vm && vm.updateSettings && vm.getSettings) {
                vm.updateSettings({ ttsEnabled: vm.getSettings().ttsEnabled === false });
            }
            return 'refresh';
        case 'help':       audio.speak(HELP_TEXT, true); return null;
        // The caller owns the confirm dialog, because each surface shows it
        // differently (own scene vs a page of the pause menu).
        case 'editor':     return 'editor';
        case 'back':       return 'back';
    }
    return null;
}

/** Fisher-Yates, in place. Used to randomize the category carousel's picture
 *  order (and re-randomize it, since a fresh shuffle happens every time the
 *  scene is (re)created). */
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Stable texture key for an image URL, so switching categories reuses textures. */
function textureKeyFor(url) {
    let h = 0;
    for (let i = 0; i < url.length; i++) {
        h = ((h << 5) - h + url.charCodeAt(i)) | 0;
    }
    return 'ss_img_' + (h >>> 0).toString(36);
}

/**
 * Build a cleanly downscaled copy of a texture.
 *
 * Contributor art is typically 512–1024px and lands on the wheel at 37–79px.
 * Handing the GPU a 1024px texture for a 37px quad gives you shimmering,
 * aliased edges — the classic "low res" look, caused by too MUCH source detail
 * rather than too little. WebGL1 cannot mipmap non-power-of-two textures, and
 * user art is never conveniently 512x512, so we resample on the CPU instead.
 *
 * Halving repeatedly before the final draw matters: a single 1024->111 canvas
 * downscale point-samples and drops detail, whereas successive halving averages
 * every source pixel in.
 *
 * @returns {string} key of the resampled texture (or the original if it was
 *                   already an appropriate size)
 */
function resampleTexture(scene, key, targetPx) {
    if (!scene.textures.exists(key)) return key;
    const src = scene.textures.get(key).getSourceImage();
    if (!src || !src.width || !src.height) return key;

    const longest = Math.max(src.width, src.height);
    if (longest <= targetPx * 1.5) return key;   // already close enough

    const outKey = key + '_r' + targetPx;
    if (scene.textures.exists(outKey)) return outKey;

    const scale = targetPx / longest;
    const outW = Math.max(1, Math.round(src.width * scale));
    const outH = Math.max(1, Math.round(src.height * scale));

    // Step down by halves until one more halving would undershoot the target.
    let curW = src.width, curH = src.height;
    let cur = src;
    const step = document.createElement('canvas');
    const sctx = step.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';

    while (curW / 2 > outW && curH / 2 > outH) {
        const nw = Math.max(1, Math.floor(curW / 2));
        const nh = Math.max(1, Math.floor(curH / 2));
        const tmp = document.createElement('canvas');
        tmp.width = nw; tmp.height = nh;
        const tctx = tmp.getContext('2d');
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = 'high';
        tctx.drawImage(cur, 0, 0, nw, nh);
        cur = tmp; curW = nw; curH = nh;
    }

    const tex = scene.textures.createCanvas(outKey, outW, outH);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, outW, outH);
    ctx.drawImage(cur, 0, 0, outW, outH);
    tex.refresh();
    return outKey;
}

/**
 * Add a data: URI as a texture.
 *
 * Phaser's file loader REFUSES data: URIs outright ("Local data URIs are not
 * supported"), and editor-authored packs are entirely data URIs — every picture
 * and sound is embedded so a pack is one self-contained, shareable file. So we
 * decode through an Image element and hand Phaser the finished element, which
 * it accepts. Doing it this way rather than via textures.addBase64 also gives a
 * direct onerror instead of event plumbing.
 */
function addDataUriTexture(scene, key, dataUri) {
    return new Promise((resolve) => {
        if (scene.textures.exists(key)) { resolve(true); return; }
        const im = new Image();
        im.onload = () => {
            try { scene.textures.addImage(key, im); resolve(true); }
            catch (e) { console.warn('[ShownSound] Could not add texture', key, e); resolve(false); }
        };
        im.onerror = () => resolve(false);
        im.src = dataUri;
    });
}

/** Run the normal Phaser loader for the http/relative files in the queue. */
function loadViaLoader(scene, queue) {
    return new Promise((resolve) => {
        if (!queue.length) { resolve(); return; }

        const onError = (file) => {
            const hit = queue.find(q => q.key === file.key);
            if (hit) {
                console.warn('[ShownSound] Image failed to load:', hit.url);
                hit.ok = false;
            }
        };
        scene.load.on('loaderror', onError);
        scene.load.once('complete', () => {
            scene.load.off('loaderror', onError);
            resolve();
        });
        queue.forEach(q => scene.load.image(q.key, q.url));
        scene.load.start();
    });
}

/**
 * Load every panel image for a category, then call done().
 *
 * Phaser wants textures preloaded by key, but our images are discovered at
 * runtime from user-authored packs, so we drive the loader manually. Failures
 * are non-fatal: the panel falls back to its title text on the wheel.
 */
function loadPanelImages(scene, panels, done) {
    const fileQueue = [];
    const dataJobs = [];

    panels.forEach(panel => {
        panel._textureKey = null;
        if (!panel.image) return;
        const key = textureKeyFor(panel.image);
        if (scene.textures.exists(key)) { panel._textureKey = key; return; }

        if (panel.image.startsWith('data:')) {
            dataJobs.push(
                addDataUriTexture(scene, key, panel.image)
                    .then(ok => { panel._textureKey = ok ? key : null; })
            );
        } else {
            const entry = { key, url: panel.image, panel, ok: true };
            fileQueue.push(entry);
        }
    });

    Promise.all(dataJobs)
        .then(() => loadViaLoader(scene, fileQueue))
        .then(() => {
            // A file can "load" but be unusable if the server returned HTML.
            fileQueue.forEach(q => {
                q.panel._textureKey = (q.ok && scene.textures.exists(q.key)) ? q.key : null;
            });
            done();
        })
        .catch(err => {
            console.warn('[ShownSound] Image loading failed', err);
            done();   // never leave the scene stuck on "Loading pictures…"
        });
}

/**
 * A soft radial wash behind the wheel so it sits in a pool of light instead of
 * floating on flat black. Built once as a texture — a Graphics gradient would
 * mean hundreds of stacked circles.
 */
function paintGlow(scene, cx, cy, radius) {
    const key = 'ss_glow';
    if (!scene.textures.exists(key)) {
        const size = 512;
        const tex = scene.textures.createCanvas(key, size, size);
        const ctx = tex.getContext();
        const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grd.addColorStop(0, 'rgba(122, 96, 240, 0.55)');
        grd.addColorStop(0.55, 'rgba(90, 66, 200, 0.22)');
        grd.addColorStop(1, 'rgba(60, 40, 150, 0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, size, size);
        tex.refresh();
    }
    const g = scene.add.image(cx, cy, key).setDepth(-1);
    g.setDisplaySize(radius * 3.1, radius * 3.1);
    return g;
}

/** Shared page furniture: background wash + a title strip. */
function paintBackdrop(scene, titleText, subText) {
    scene.cameras.main.setBackgroundColor(THEME.BG);

    const g = scene.add.graphics().setDepth(0);
    g.fillStyle(0x2a1f63, 1);
    g.fillRect(0, 0, W, HEADER_H - 4);
    g.fillStyle(0xffffff, 0.06);
    g.fillRect(0, 0, W, 28);
    g.lineStyle(4, THEME.RIM, 0.85);
    g.lineBetween(0, HEADER_H - 4, W, HEADER_H - 4);
    g.lineStyle(2, cssToHex('#ff8fab'), 0.7);
    g.lineBetween(0, HEADER_H, W, HEADER_H);

    scene.add.text(W / 2, 24, titleText, {
        fontSize: '30px', fontFamily: FONT_FUN, fontStyle: 'bold',
        color: THEME.TITLE, stroke: '#2b1a60', strokeThickness: 7
    }).setOrigin(0.5).setDepth(1);

    if (subText) {
        // Bold to match the title: the rounded faces in FONT_FUN only ship a
        // bold weight, so a regular-weight run falls through to a different
        // face entirely and the two lines stop looking related.
        scene.add.text(W / 2, 49, subText, {
            fontSize: '15px', fontFamily: FONT_FUN, fontStyle: 'bold', color: '#cfc3ff'
        }).setOrigin(0.5).setDepth(1);
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// BootScene — load the packs before anything else needs them.
// ═══════════════════════════════════════════════════════════════════════════════
class BootScene extends Phaser.Scene {
    constructor() { super({ key: 'BootScene' }); }

    create() {
        setupCamera(this);
        this.cameras.main.setBackgroundColor(THEME.BG);
        const msg = this.add.text(W / 2, H / 2, 'Loading…', {
            fontSize: '28px', fontFamily: 'Arial', color: '#ffffff'
        }).setOrigin(0.5);

        window.__ssAudio = window.__ssAudio || new AudioSystem();

        ShownSoundPacks.load().then(cats => {
            if (!cats.length) {
                msg.setText(
                    'No categories found.\n\n' +
                    'Open editor.html to build one, or drop a pack folder\n' +
                    'into packs/ and add it to assetManifest.json.'
                ).setFontSize(22).setAlign('center').setLineSpacing(8);

                const errs = ShownSoundPacks.getErrors();
                if (errs.length) {
                    this.add.text(W / 2, H - 60, errs.slice(0, 3).join('\n'), {
                        fontSize: '13px', fontFamily: 'monospace', color: '#ff8a8a',
                        align: 'center'
                    }).setOrigin(0.5);
                }
                return;
            }
            this.scene.start('TitleScene');
        });
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// TitleScene
// ═══════════════════════════════════════════════════════════════════════════════
class TitleScene extends Phaser.Scene {
    constructor() { super({ key: 'TitleScene' }); }

    create() {
        setupCamera(this);
        this.audio = window.__ssAudio;
        this.cameras.main.setBackgroundColor(THEME.BG);

        paintGlow(this, W / 2, 200, 210);

        this.add.text(W / 2, 128, "Benny's", {
            fontSize: '40px', fontFamily: FONT_FUN, fontStyle: 'bold',
            color: '#cfc3ff', stroke: '#2b1a60', strokeThickness: 6
        }).setOrigin(0.5);

        const title = this.add.text(W / 2, 194, "Show n Sound", {
            fontSize: '68px', fontFamily: FONT_FUN, fontStyle: 'bold',
            color: THEME.TITLE, stroke: '#2b1a60', strokeThickness: 12
        }).setOrigin(0.5);
        // Slow breathing pulse — enough life to feel inviting, slow enough not
        // to be a distraction for someone scanning the menu underneath it.
        this.tweens.add({
            targets: title, scale: 1.045, duration: 1600,
            ease: 'Sine.easeInOut', yoyo: true, repeat: -1
        });

        // Emoji garland. Purely decorative, and each one drifts on its own
        // offset so the row never pulses in lockstep.
        const deco = ['🎡', '🐮', '🚂', '🎺', '🦁', '🎈', '⭐'];
        deco.forEach((e, i) => {
            const x = 110 + i * ((W - 220) / (deco.length - 1));
            const t = makeEmoji(this, x, 292, e, 46);
            t.setAlpha(0.95);
            this.tweens.add({
                targets: t, y: 282, angle: i % 2 ? 7 : -7,
                duration: 1400 + i * 130, ease: 'Sine.easeInOut',
                yoyo: true, repeat: -1, delay: i * 90
            });
        });

        const nCats = ShownSoundPacks.getCategories().length;
        this.capTxt = this.add.text(W / 2, 340,
            `${nCats} categor${nCats === 1 ? 'y' : 'ies'} ready to play`, {
                fontSize: '18px', fontFamily: FONT_FUN, color: '#b9aee8'
            }).setOrigin(0.5);

        // Two columns: five items stacked would run past the bottom of the
        // screen, and it matches how Settings is laid out.
        this.list = new FunScanList(this, {
            x: W / 2, y: 460, itemW: 400, itemH: 58, gap: 14,
            fontSize: '25px', fontFamily: FONT_FUN,
            audio: this.audio,
            options: [
                { label: 'Play', value: 'play' },
                { label: 'Settings', value: 'settings' },
                { label: 'Exit Game', value: 'exit',
                  speakText: 'Exit game. Goes back to the hub.' }
            ],
            onSelect: (opt) => {
                if (opt.value === 'play') this.scene.start('CategoryScene');
                else if (opt.value === 'settings') this.scene.start('SettingsScene');
                else if (opt.value === 'exit') exitToHub();
            }
        });

        this.input_ = new ScanInput(this, {
            forward:  () => this.list.next(false),
            backward: () => this.list.prev(false),
            select:   () => this.list.select()
        });
    }

}


// ═══════════════════════════════════════════════════════════════════════════════
// SettingsScene — reached from the main menu, like the other hub games.
// ═══════════════════════════════════════════════════════════════════════════════
class SettingsScene extends Phaser.Scene {
    constructor() { super({ key: 'SettingsScene' }); }

    create() {
        setupCamera(this);
        this.audio = window.__ssAudio;
        paintBackdrop(this, 'Settings', 'Press your switch to move, Enter to change');
        this.build();

        this.input_ = new ScanInput(this, {
            forward:  () => this.list.next(false),
            backward: () => this.list.prev(false),
            select:   () => this.list.select(),
            escape:   () => this.scene.start('TitleScene')
        });
    }

    build(keepIndex) {
        const idx = keepIndex && this.list ? this.list.index : -1;
        if (this.list) this.list.destroy();

        this.list = new FunScanList(this, Object.assign({
            x: W / 2, y: 320,
            audio: this.audio,
            fontFamily: FONT_FUN,
            options: settingsOptions(this.audio),
            onSelect: (opt) => {
                const r = applySetting(opt.value, this.audio);
                if (r === 'back') { this.scene.start('TitleScene'); return; }
                if (r === 'editor') { this.showEditorWarning(); return; }
                if (r === 'refresh') this.build(true);
            }
        }, SETTINGS_LAYOUT));

        if (idx >= 0) { this.list.index = idx; this.list._draw(); }
    }

    /** Two-option confirm before handing over to a mouse-driven tool. */
    showEditorWarning() {
        this.list.destroy();
        this.warnTxt = this.add.text(W / 2, 240,
            'The editor needs a mouse and keyboard.\nIt opens in its own window.', {
                fontSize: '20px', fontFamily: FONT_FUN, color: '#ffd6e7',
                align: 'center', lineSpacing: 4,
                stroke: '#2b1a60', strokeThickness: 5
            }).setOrigin(0.5).setDepth(41);

        this.list = new FunScanList(this, {
            x: W / 2, y: 380, itemW: 430, itemH: 58, gap: 14,
            fontSize: '24px', fontFamily: FONT_FUN,
            audio: this.audio,
            options: EDITOR_WARN,
            onSelect: (o) => {
                if (o.value === 'editor-go') openShowNSoundEditor();
                // Restart rather than rebuild: clears the warning text and the
                // confirm list in one step.
                this.scene.restart();
            }
        });
        this.audio.speak('The editor needs a mouse and keyboard.', true);
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// CategoryScene
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * A carousel: one focused card per category (plus a trailing "Back" slide),
 * sliding through ALL of that category's own pictures — shuffled, so it's not
 * the same handful every visit — while parked on it, with an occasional
 * chance to play one of their sounds as a preview.
 *
 * Deliberately NOT built on ScanList/FunScanList — those manage a GRID of
 * always-visible items, and there is nothing to lay out here, just one big
 * focused slide at a time — but the input contract is identical on purpose:
 * SPACE tap = next, SPACE held = previous, ENTER = choose, same as every
 * other scan-driven menu in this game, including respecting the shared
 * Auto Scan setting (see ScanList._startTimer in ui.js, mirrored below).
 */
class CategoryScene extends Phaser.Scene {
    constructor() { super({ key: 'CategoryScene' }); }

    create() {
        setupCamera(this);
        this.audio = window.__ssAudio;
        const cats = ShownSoundPacks.getCategories();

        paintBackdrop(this, 'Pick a Category', 'Press your switch to move, Enter to choose');

        this.entries = cats.map((c, i) => ({
            kind: 'category',
            category: c,
            categoryIndex: i,
            frames: this.pickFrames(c)
        }));
        this.entries.push({ kind: 'back' });

        this.index = 0;
        this.frameIndex = 0;
        this.frameObj = null;
        this.slideTimer = null;
        this.autoScanTimer = null;
        this.previewAudio = null;
        this.lastPreviewAt = 0;

        const cardW = 460, cardH = 300, cardX = W / 2 - cardW / 2, cardY = 118;
        this._card = { x: cardX, y: cardY, w: cardW, h: cardH };

        this.card = this.add.graphics().setDepth(2);

        // The sliding picture strip is clipped to the card's own rounded-rect
        // bounds, so a frame sliding in/out never spills past its edges.
        const clipG = this.add.graphics().setVisible(false);
        clipG.fillRoundedRect(cardX, cardY, cardW, cardH, 20);
        this.frameContainer = this.add.container(0, 0).setDepth(3);
        this.frameContainer.setMask(clipG.createGeometryMask());

        // Title + picture count are a caption overlaid on the card itself —
        // a translucent strip across the bottom of the picture, not floating
        // text underneath it.
        const capH = 76;
        this.captionBg = this.add.graphics().setDepth(4);
        this.captionBg.fillStyle(0x000000, 0.55);
        this.captionBg.fillRect(cardX, cardY + cardH - capH, cardW, capH);
        this.nameTxt = this.add.text(W / 2, cardY + cardH - capH + 24, '', {
            fontSize: '26px', fontFamily: FONT_FUN, fontStyle: 'bold', color: '#ffffff',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setDepth(5);
        this.countTxt = this.add.text(W / 2, cardY + cardH - capH + 54, '', {
            fontSize: '15px', fontFamily: FONT_FUN, color: '#e8e2ff'
        }).setOrigin(0.5).setDepth(5);

        this.leftBtn = this._arrow(cardX - 55, cardY + cardH / 2, '◀', () => this.cycle(-1));
        this.rightBtn = this._arrow(cardX + cardW + 55, cardY + cardH / 2, '▶', () => this.cycle(1));

        // Tap the card itself to choose it — the mouse/touch equivalent of
        // Enter, mirroring "tap the wheel to spin" on the next screen.
        this.add.zone(cardX + cardW / 2, cardY + cardH / 2, cardW, cardH)
            .setOrigin(0.5).setDepth(3.5).setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.selectCurrent());

        this.add.text(W / 2, H - 22,
            'Tap Space = next   ·   hold Space = back   ·   Enter = choose', {
                fontSize: '15px', fontFamily: FONT_FUN, color: '#cfc3ff'
            }).setOrigin(0.5).setDepth(4);

        this.preloadFrames(() => {
            if (!this.scene.isActive()) return;
            this.showEntry(0, true);
            this._startAutoScanTimer();
        });

        this.input_ = new ScanInput(this, {
            forward:  () => this.cycle(1),
            backward: () => this.cycle(-1),
            select:   () => this.selectCurrent(),
            escape:   () => this.leaveScene('TitleScene')
        });
    }

    /** ALL of a category's own panels (that have a picture or emoji), in a
     *  freshly shuffled order — every visit to this screen re-shuffles, since
     *  a new scene instance (and so a new shuffle) is created each time. */
    pickFrames(category) {
        const panels = (category.panels || []).filter(p => p.image || p.emoji);
        return shuffleArray(panels.slice());
    }

    /** Load every image-bearing frame across every category up front, so
     *  cycling the carousel never pops or stalls mid-scan. */
    preloadFrames(done) {
        const allPanels = [];
        this.entries.forEach(e => { if (e.kind === 'category') allPanels.push(...e.frames); });
        if (!allPanels.length) { done(); return; }
        loadPanelImages(this, allPanels, done);
    }

    _arrow(x, y, glyph, onClick) {
        const c = this.add.container(x, y).setDepth(5);
        const bg = this.add.circle(0, 0, 28, THEME.HUB).setStrokeStyle(2, THEME.RIM, 0.8);
        const t = this.add.text(0, 0, glyph, { fontSize: '26px', fontFamily: FONT_FUN, color: THEME.RIM }).setOrigin(0.5);
        c.add([bg, t]);
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', onClick);
        bg.on('pointerover', () => bg.setFillStyle(0x3a2e80));
        bg.on('pointerout', () => bg.setFillStyle(THEME.HUB));
        return c;
    }

    // ─── Auto Scan (mirrors ScanList._startTimer in ui.js) ──────────────────
    // A carousel with one focused slide has no grid for ScanList to drive, so
    // this is reimplemented rather than shared — but the CONTRACT (respect
    // the live Auto Scan setting and interval, reset on manual advance) must
    // match every other menu exactly, or this screen alone stops responding
    // to a setting Ben already relies on elsewhere.
    _startAutoScanTimer() {
        this._stopAutoScanTimer();
        const auto = window.NarbeScanManager && window.NarbeScanManager.getSettings
            ? !!window.NarbeScanManager.getSettings().autoScan : false;
        if (!auto) return;
        const interval = (window.NarbeScanManager && window.NarbeScanManager.getScanInterval)
            ? window.NarbeScanManager.getScanInterval() : 2200;
        this.autoScanTimer = this.time.addEvent({
            delay: interval,
            loop: true,
            callback: () => {
                if (window.NarbeScanManager && window.NarbeScanManager.getSettings) {
                    if (!window.NarbeScanManager.getSettings().autoScan) { this._stopAutoScanTimer(); return; }
                }
                this.cycle(1, true);
            }
        });
    }

    _stopAutoScanTimer() {
        if (this.autoScanTimer) { this.autoScanTimer.remove(); this.autoScanTimer = null; }
    }

    // ─── Carousel ─────────────────────────────────────────────────────────

    cycle(dir, fromTimer) {
        const n = this.entries.length;
        this.index = (this.index + dir + n) % n;
        this.showEntry(this.index, false, dir);
        this.audio.play('scan');
        if (!fromTimer) this._startAutoScanTimer(); // reset interval on a manual move
    }

    showEntry(i, immediate, dir) {
        this.stopSlideTimer();
        this.stopPreviewAudio();
        const entry = this.entries[i];
        this.drawCardShell();

        if (entry.kind === 'back') {
            this.showFrame(null, immediate, dir);
            this.nameTxt.setText('← Back to Main Menu');
            this.countTxt.setText('');
            this.audio.speak('Back to main menu', true);
            return;
        }

        this.frameIndex = 0;
        const n = Math.min(entry.category.panels.length, PANEL_MAX);
        this.nameTxt.setText(entry.category.name);
        this.countTxt.setText(`${n} picture${n === 1 ? '' : 's'}`);
        this.audio.speak(`${entry.category.name}. ${n} picture${n === 1 ? '' : 's'}.`, true);
        this.showFrame(entry.frames[0] || null, immediate, dir);
        this.startSlideTimer(entry);
    }

    /** While parked on a category with more than one picture, slide through
     *  them one at a time and, occasionally (never overlapping, never more
     *  often than SOUND_COOLDOWN_MS apart), play one's sound. */
    startSlideTimer(entry) {
        if (entry.frames.length <= 1) return;
        this.slideTimer = this.time.addEvent({
            delay: CAROUSEL.SLIDE_MS,
            loop: true,
            callback: () => {
                this.frameIndex = (this.frameIndex + 1) % entry.frames.length;
                const panel = entry.frames[this.frameIndex];
                this.showFrame(panel, false, 1);
                const cooledDown = (this.time.now - this.lastPreviewAt) >= CAROUSEL.SOUND_COOLDOWN_MS;
                if (cooledDown && panel.sounds && panel.sounds.length && Math.random() < CAROUSEL.SOUND_CHANCE) {
                    this.playPreviewSound(panel);
                }
            }
        });
    }

    stopSlideTimer() {
        if (this.slideTimer) { this.slideTimer.remove(); this.slideTimer = null; }
    }

    /** Slide the card's picture strip to a new panel (or the back glyph if
     *  panel is null) — one image after another, tightly packed, rather than
     *  crossfading in place. `dir` is which way it travels: +1 (next/forward)
     *  slides everything leftward, -1 (previous/back) slides it rightward.
     *  Handles a real image and an emoji-only panel the same way, since either
     *  can appear among a category's shuffled frames. */
    showFrame(panel, immediate, dir) {
        dir = dir || 1;
        const b = this._card;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const old = this.frameObj;
        const next = this.makeFrameObject(panel, cx, cy, b);
        this.frameContainer.add(next);
        this.frameObj = next;

        if (immediate) {
            if (old) old.destroy();
            next.x = cx;
            return;
        }

        const travel = b.w;
        next.x = cx + dir * travel;
        this.tweens.add({ targets: next, x: cx, duration: CAROUSEL.TRANSITION_MS, ease: 'Cubic.easeOut' });
        if (old) {
            this.tweens.add({
                targets: old, x: old.x - dir * travel, duration: CAROUSEL.TRANSITION_MS, ease: 'Cubic.easeOut',
                onComplete: () => old.destroy()
            });
        }
    }

    /** Build the display object for one card frame — an image, an emoji, a
     *  plain title fallback, or the back-slide's home glyph. */
    makeFrameObject(panel, cx, cy, b) {
        if (!panel) {
            return this.add.text(cx, cy, '🏠', { fontSize: CAROUSEL.EMOJI_SIZE + 'px' }).setOrigin(0.5);
        }
        if (panel._textureKey) {
            const img = this.add.image(cx, cy, panel._textureKey);
            const maxDim = Math.min(b.w, b.h) * 0.74;
            img.setScale(maxDim / Math.max(img.width, img.height));
            return img;
        }
        if (panel.emoji) {
            return this.add.text(cx, cy, panel.emoji, { fontSize: CAROUSEL.EMOJI_SIZE + 'px' }).setOrigin(0.5);
        }
        return this.add.text(cx, cy, panel.title || '', {
            fontSize: '26px', fontFamily: FONT_FUN, fontStyle: 'bold', color: '#fff',
            wordWrap: { width: b.w * 0.8 }, align: 'center'
        }).setOrigin(0.5);
    }

    drawCardShell() {
        const b = this._card;
        this.card.clear();
        this.card.fillStyle(THEME.HUB, 0.95);
        this.card.fillRoundedRect(b.x, b.y, b.w, b.h, 20);
        this.card.lineStyle(3, THEME.RIM, 0.85);
        this.card.strokeRoundedRect(b.x, b.y, b.w, b.h, 20);
    }

    /** A quiet, name-agnostic sound preview — deliberately NOT `audio.playPanel`,
     *  which also speaks the panel's name on completion; that would talk over
     *  the category name already announced and can arrive after the user has
     *  moved on. Always stops any still-playing preview first (so two never
     *  overlap) and stamps `lastPreviewAt` so the NEXT one waits out the
     *  cooldown too, even across a manual category switch. Silently does
     *  nothing if the panel has no sound to offer. */
    playPreviewSound(panel) {
        if (!this.audio.settings.panelEnabled) return;
        const sounds = panel.sounds || [];
        if (!sounds.length) return;
        this.stopPreviewAudio();
        try {
            const idx = Math.floor(Math.random() * sounds.length);
            this.previewAudio = new Audio(sounds[idx]);
            this.previewAudio.volume = 0.85;
            this.previewAudio.play().catch(() => {});
            this.lastPreviewAt = this.time.now;
        } catch (e) { /* ignore */ }
    }

    stopPreviewAudio() {
        if (this.previewAudio) {
            try { this.previewAudio.pause(); } catch (e) { /* ignore */ }
            this.previewAudio = null;
        }
    }

    selectCurrent() {
        const entry = this.entries[this.index];
        if (entry.kind === 'back') { this.leaveScene('TitleScene'); return; }
        this.leaveScene('WheelScene', { categoryIndex: entry.categoryIndex });
    }

    leaveScene(key, data) {
        this.stopSlideTimer();
        this._stopAutoScanTimer();
        this.stopPreviewAudio();
        this.audio.stopSpeech();
        this.scene.start(key, data);
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
// WheelScene — the game.
//
// State machine: 'loading' -> 'idle' -> 'spinning' -> 'revealed' -> 'idle'
// A press in 'revealed' both dismisses the reveal and starts the next spin, so
// one switch press equals one full cycle.
// ═══════════════════════════════════════════════════════════════════════════════
class WheelScene extends Phaser.Scene {
    constructor() { super({ key: 'WheelScene' }); }

    init(data) {
        this.categoryIndex = data.categoryIndex || 0;
        this.state_ = 'loading';
        this.lastPanel = null;
        this.paused = false;
    }

    create() {
        setupCamera(this);
        this.audio = window.__ssAudio;
        this.category = ShownSoundPacks.getCategories()[this.categoryIndex];

        // Defensive: a stale or out-of-range index would otherwise throw inside
        // panelsForPlay and leave the scene wedged on "Loading pictures…" with
        // nothing on screen and no way back.
        if (!this.category) {
            console.warn('[ShownSound] No category at index', this.categoryIndex);
            this.cameras.main.setBackgroundColor(THEME.BG);
            this.add.text(W / 2, H / 2, 'That category is no longer available.', {
                fontSize: '24px', fontFamily: 'Arial', color: '#ffffff'
            }).setOrigin(0.5);
            this.time.delayedCall(1200, () => this.scene.start('CategoryScene'));
            return;
        }

        this.panels = ShownSoundPacks.panelsForPlay(this.category);

        paintBackdrop(this, this.category.name, this.category.packTitle);
        this.cameras.main.setBackgroundColor(THEME.BG);

        // Shares the button row's slot: shown only while the buttons are hidden
        // (loading, and during a reveal), so the two never collide.
        this.hint = this.add.text(W / 2, BUTTONS.Y, 'Loading pictures…', {
            fontSize: '22px', fontFamily: 'Arial', fontStyle: 'bold', color: '#c9c2e8'
        }).setOrigin(0.5).setDepth(30);

        paintGlow(this, WHEEL.CX, WHEEL.CY, WHEEL.R);

        this.reveal = new Reveal(this);
        this.party = new Party(this);
        this.buildButtons();
        this.buildPauseButton();
        this.setButtonsVisible(false);   // nothing scannable until the wheel exists

        this.input_ = new ScanInput(this, {
            forward:  () => this.onForward(),
            backward: () => this.onBackward(),
            select:   () => this.onSelect(),
            escape:   () => this.togglePause()
        });

        // ── Mouse / touch ────────────────────────────────────────────────────
        // Everything reachable by switch is also reachable by tapping:
        //   on the wheel  — tap the wheel = Spin (the row handles its own taps)
        //   on a reveal   — tap ANYWHERE = back to the wheel, same as Enter or
        //                   the switch. There is deliberately no "tap to hear
        //                   it again" — if a panel has more than one sound,
        //                   spinning back onto it is how you hear a different
        //                   one, not replaying the same clip on tap.
        this.input.on('pointerdown', (p) => {
            if (this.paused || this.state_ === 'spinning' || this.state_ === 'loading') return;

            if (this.state_ === 'revealed') { this.dismissReveal(); return; }

            // worldX/worldY, not x/y: the camera is zoomed for supersampling, so
            // pointer.x is in canvas pixels while every layout value is in world
            // units. Using x/y here would misplace every hit test.
            const px = p.worldX, py = p.worldY;

            // Idle: only the wheel face spins. The button row and the corner
            // pause control sit outside this radius and get their taps from
            // their own zones, so nothing fights over the same click.
            const dx = px - WHEEL.CX, dy = py - WHEEL.CY;
            if (Math.sqrt(dx * dx + dy * dy) <= WHEEL.R + WHEEL.RIM) this.doSpin();
        });

        loadPanelImages(this, this.panels, () => {
            if (!this.scene.isActive()) return;

            // Give the wheel a texture sized for the sector it will occupy, at
            // the canvas's pixel density. The full-res original stays in
            // _textureKey for the reveal, which shows it many times larger.
            const ss = Phaser.Math.Clamp(Math.ceil(window.__GAME_ZOOM || 2), 2, 4);
            const targetPx = Math.ceil(WheelGeom.imageSize(this.panels.length, WHEEL.R) * ss);
            this.panels.forEach(p => {
                p._wheelTextureKey = p._textureKey
                    ? resampleTexture(this, p._textureKey, targetPx)
                    : null;
            });

            this.wheel = new Wheel(this, {
                x: WHEEL.CX, y: WHEEL.CY, radius: WHEEL.R,
                panels: this.panels,
                palette: this.category.palette,
                audio: this.audio,
                fill: !!this.category.fill,
                textureKeys: (i) => this.panels[i]._wheelTextureKey
            });
            this.state_ = 'idle';
            this.setHint('');
            this.setButtonsVisible(true);
            this.audio.speak(`${this.category.name}. Choose Spin.`, true);
        });
    }

    /** @param {string} text @param {string} [size] px, for longer messages */
    setHint(text, size) {
        if (!this.hint) return;
        this.hint.setFontSize(size || '22px');
        this.hint.setText(text);
    }

    // ─── The scannable button row ────────────────────────────────────────────

    buildButtons() {
        this.buttons = new FunScanList(this, {
            x: W / 2, y: BUTTONS.Y,
            columns: 3,
            itemW: BUTTONS.W, itemH: BUTTONS.H, gap: BUTTONS.GAP,
            fontSize: '22px',
            audio: this.audio,
            options: [
                { label: 'Spin',      value: 'spin',    speakText: 'Spin the wheel' },
                { label: 'New Game',  value: 'newgame', speakText: 'Choose a new game' },
                { label: 'Main Menu', value: 'title',   speakText: 'Back to the main menu' }
            ],
            onSelect: (opt) => {
                if (opt.value === 'spin') this.doSpin();
                else if (opt.value === 'newgame') {
                    this.cleanup();
                    this.scene.start('CategoryScene');
                } else if (opt.value === 'title') {
                    this.cleanup();
                    this.scene.start('TitleScene');
                }
            }
        });
    }

    /**
     * A plain clickable pause control in the bottom-left corner.
     *
     * Not a ScanList item on purpose: pausing is a caregiver action, so it stays
     * out of Ben's scan cycle, which is left as Spin / New Game / Main Menu.
     * Escape still opens the same menu from a keyboard.
     */
    buildPauseButton() {
        const b = PAUSE_BTN;

        // Circular, bottom-left, icon only \u2014 the shape and position Matchy
        // Match uses for its corner pause control, drawn with the same
        // two-vertical-bar emblem Baseball2's pause pill uses instead of a
        // text label, since an icon reads faster and never needs translating.
        this.pauseBtnGfx = this.add.graphics().setDepth(40);
        this.pauseBtnGfx.fillStyle(0x000000, 0.30);
        this.pauseBtnGfx.fillCircle(b.X + 2, b.Y + 4, b.R);
        this.pauseBtnGfx.fillStyle(THEME.BTN_FILL, 0.92);
        this.pauseBtnGfx.fillCircle(b.X, b.Y, b.R);
        this.pauseBtnGfx.lineStyle(3, THEME.BTN_EDGE, 1);
        this.pauseBtnGfx.strokeCircle(b.X, b.Y, b.R);
        // The two bars.
        const barW = b.R * 0.24, barH = b.R * 0.9, gap = b.R * 0.20;
        this.pauseBtnGfx.fillStyle(0xffffff, 0.95);
        this.pauseBtnGfx.fillRoundedRect(b.X - gap / 2 - barW, b.Y - barH / 2, barW, barH, 2);
        this.pauseBtnGfx.fillRoundedRect(b.X + gap / 2, b.Y - barH / 2, barW, barH, 2);

        this.pauseBtnZone = this.add.zone(b.X, b.Y, b.R * 2, b.R * 2)
            .setOrigin(0.5).setDepth(42).setInteractive({ useHandCursor: true });
        this.pauseBtnZone.on('pointerdown', () => this.togglePause());
    }

    setPauseButtonVisible(v) {
        if (this.pauseBtnGfx) this.pauseBtnGfx.setVisible(v);
        if (this.pauseBtnZone) {
            if (v) this.pauseBtnZone.setInteractive({ useHandCursor: true });
            else this.pauseBtnZone.disableInteractive();
        }
    }

    /**
     * Show or hide the row without destroying it, so the highlight stays where
     * the player left it. That is what makes repeat spins cost one Enter: after
     * a reveal is dismissed, "Spin" is still the highlighted button.
     *
     * Done from outside rather than by adding a method to ScanList — that class
     * is a verbatim port and must stay byte-identical (see ui.js header).
     */
    setButtonsVisible(v) {
        this.setPauseButtonVisible(v);
        if (!this.buttons) return;
        this.buttons.active = v;
        this.buttons.gfx.setVisible(v);
        this.buttons.labels.forEach(l => l.setVisible(v));
        this.buttons.zones.forEach(z => {
            if (v) z.setInteractive({ useHandCursor: true });
            else z.disableInteractive();
        });
    }

    // ─── Input ───────────────────────────────────────────────────────────────
    // Canonical hub scheme on the wheel screen: SPACE moves between the three
    // buttons, ENTER chooses. During a reveal the meaning changes — ENTER
    // replays the sound, SPACE goes back to the wheel.

    onForward() {
        if (this.paused) { this.pauseList.next(false); return; }
        if (this.state_ === 'loading' || this.state_ === 'spinning') return;
        if (this.state_ === 'revealed') { this.dismissReveal(); return; }
        this.buttons.next(false);
    }

    onBackward() {
        if (this.paused) { this.pauseList.prev(false); return; }
        if (this.state_ === 'loading' || this.state_ === 'spinning') return;
        if (this.state_ === 'revealed') { this.dismissReveal(); return; }
        this.buttons.prev(false);
    }

    onSelect() {
        if (this.paused) { this.pauseList.select(); return; }
        // Enter now returns to the wheel (same as Space) instead of replaying
        // the sound — with Auto Scan on, "hear it again" left no way to
        // actually get back to scanning, since nothing else was scannable
        // while revealed. This also means the very next press (Spin is still
        // highlighted) spins again, which is what someone relying entirely on
        // Auto Scan actually wants: press = advance.
        if (this.state_ === 'revealed') { this.dismissReveal(); return; }
        // Press-to-stop, always on: a press during the spin itself lands it
        // sooner. Never changes which panel wins — see Wheel.requestEarlyStop.
        // If nothing is pressed again, it lands on its own at the normal timing.
        if (this.state_ === 'spinning' && this.wheel) {
            this.wheel.requestEarlyStop();
            return;
        }
        if (this.state_ === 'idle') this.buttons.select();
    }

    /** Put the revealed panel away and hand the wheel back. Does not re-spin. */
    dismissReveal() {
        if (this.state_ !== 'revealed') return;
        this.reveal.hide();
        this.audio.stopPanel();
        this.audio.stopSpeech();
        if (this.wheel) this.wheel.setAlpha(1);
        this.state_ = 'idle';
        this.setHint('');
        this.setButtonsVisible(true);
    }

    // ─── Spin ────────────────────────────────────────────────────────────────

    doSpin() {
        if (!this.wheel || this.state_ !== 'idle') return;
        this.state_ = 'spinning';
        this.setHint('Press your switch or Enter to stop the wheel');
        this.setButtonsVisible(false);
        this.audio.stopSpeech();

        const started = this.wheel.spin(this.category.spinMs, (index, panel) => {
            this.state_ = 'revealed';
            this.lastPanel = panel;
            this.audio.play('land');
            this.wheel.setAlpha(1);

            // Confetti fires from where the wheel actually stopped, so the
            // celebration reads as coming out of the winning wedge.
            const at = this.wheel.panelWorldPoint(index);
            this.party.burst(at.x, at.y, 34);

            this.reveal.show(this.wheel, index, panel, () => {
                this.audio.playPanel(panel);
                // Second, bigger burst once the card has fully popped in.
                this.party.burst(W / 2, REVEAL.CARD_Y - 40, 60);
            });
            this.setHint('Tap anywhere, press Enter, or your switch to spin again', '18px');
        });

        if (!started) { this.state_ = 'idle'; this.setButtonsVisible(true); }
    }

    // ─── Pause menu ──────────────────────────────────────────────────────────

    togglePause() {
        if (this.paused) { this.closePause(); return; }
        if (this.state_ === 'spinning') return;   // don't interrupt a spin
        this.openPause();
    }

    openPause() {
        this.paused = true;
        this.pauseMode = 'menu';
        this.audio.stopPanel();
        this.audio.stopSpeech();
        // Park the wheel buttons so the two scan lists can't both take input.
        this._buttonsWereVisible = !!(this.buttons && this.buttons.active);
        this.setButtonsVisible(false);

        this.pauseDim = this.add.graphics().setDepth(50);
        this.pauseDim.fillStyle(0x000000, 0.72);
        this.pauseDim.fillRect(0, 0, W, H);

        this.pauseList = new FunScanList(this, Object.assign({
            x: W / 2, y: H / 2,
            audio: this.audio,
            fontFamily: FONT_FUN,
            options: this.pauseOptions(),
            onSelect: (opt) => this.onPauseSelect(opt)
        }, this.pauseLayout()));
        this.pauseList.container.setDepth(51);
        this.pauseList.gfx.setDepth(51);
        this.pauseList.labels.forEach(l => l.setDepth(52));
        if (this.pauseList.titleTxt) this.pauseList.titleTxt.setDepth(52);
    }

    pauseOptions() {
        if (this.pauseMode === 'editorWarn') return EDITOR_WARN;
        if (this.pauseMode === 'settings') return settingsOptions(this.audio);
        // Help and the editor now live inside Settings (see settingsOptions),
        // so they are not repeated here — one place to find them, matching how
        // Matchy Match folds everything secondary into its Settings menu.
        return [
            { label: 'Resume', value: 'resume' },
            { label: 'Settings', value: 'settings' },
            { label: 'Change Category', value: 'category' },
            { label: 'Main Menu', value: 'title' },
            { label: 'Exit Game', value: 'exit',
              speakText: 'Exit game. Goes back to the hub.' }
        ];
    }

    /** Layout differs per page: settings needs two columns, the rest is short. */
    pauseLayout() {
        if (this.pauseMode === 'settings') {
            return Object.assign({ title: 'Settings' }, SETTINGS_LAYOUT);
        }
        if (this.pauseMode === 'editorWarn') {
            return { title: 'Open Editor', columns: 1, itemW: 430, itemH: 52,
                     gap: 12, fontSize: '21px' };
        }
        return { title: 'Menu', columns: 2, itemW: 320, itemH: 52,
                 gap: 14, fontSize: '21px' };
    }

    /** Rebuild in place so a toggled label updates without closing the menu. */
    refreshPause(resetIndex) {
        const idx = resetIndex ? -1 : (this.pauseList ? this.pauseList.index : -1);
        if (this.pauseList) this.pauseList.destroy();
        this.pauseList = new FunScanList(this, Object.assign({
            x: W / 2, y: H / 2,
            audio: this.audio,
            fontFamily: FONT_FUN,
            options: this.pauseOptions(),
            onSelect: (opt) => this.onPauseSelect(opt)
        }, this.pauseLayout()));
        this.pauseList.index = idx;
        this.pauseList._draw();
        this.pauseList.container.setDepth(51);
        this.pauseList.gfx.setDepth(51);
        this.pauseList.labels.forEach(l => l.setDepth(52));
        if (this.pauseList.titleTxt) this.pauseList.titleTxt.setDepth(52);
    }

    onPauseSelect(opt) {
        // Anything owned by the shared settings model is handled there, so the
        // Settings screen and this page can never drift apart.
        const handled = applySetting(opt.value, this.audio);
        if (handled === 'refresh') {
            this.refreshPause();
            return;
        }
        if (handled === 'back') {
            this.pauseMode = 'menu';
            this.refreshPause(true);
            return;
        }
        if (handled === 'editor') {
            this.pauseMode = 'editorWarn';
            this.refreshPause(true);
            return;
        }

        switch (opt.value) {
            case 'resume':
                this.closePause();
                break;
            case 'settings':
                this.pauseMode = 'settings';
                this.refreshPause(true);
                break;
            case 'editor-go':
                openShowNSoundEditor();
                this.pauseMode = 'menu';
                this.refreshPause(true);
                break;
            case 'editor-cancel':
                this.pauseMode = 'menu';
                this.refreshPause(true);
                break;
            case 'category':
                this.cleanup();
                this.scene.start('CategoryScene');
                break;
            case 'title':
                this.cleanup();
                this.scene.start('TitleScene');
                break;
            case 'exit':
                this.cleanup();
                exitToHub();
                break;
        }
    }

    closePause() {
        this.paused = false;
        if (this.pauseList) { this.pauseList.destroy(); this.pauseList = null; }
        if (this.pauseDim) { this.pauseDim.destroy(); this.pauseDim = null; }
        // Only give the row back if it was up before — pausing mid-reveal must
        // not resurrect it over the revealed card.
        if (this._buttonsWereVisible) this.setButtonsVisible(true);
    }

    /**
     * Tear down everything this scene owns. Every field is guarded because
     * cleanup can run before create() has finished — a category can be swapped
     * from the pause menu while images are still loading.
     */
    cleanup() {
        if (this.audio) { this.audio.stopPanel(); this.audio.stopSpeech(); }
        [this.pauseBtnGfx, this.pauseBtnZone].forEach(o => {
            if (o) o.destroy();
        });
        this.pauseBtnGfx = this.pauseBtnZone = null;
        this._buttonsWereVisible = false;
        this.closePause();
        if (this.reveal) this.reveal.hide();
        if (this.buttons) { this.buttons.destroy(); this.buttons = null; }
        if (this.wheel) { this.wheel.destroy(); this.wheel = null; }
    }
}
