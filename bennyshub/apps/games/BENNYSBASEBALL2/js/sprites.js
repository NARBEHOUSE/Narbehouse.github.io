// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S BASEBALL 2 - Animated player sprites
//
// Sheets are drawn by Projects\Assets\tools\bb2_sprites.py on a 32x32 design
// grid and exported at a hard 2x into 64x64 cells. Every frame uses ONLY the
// index palette below; this module remaps those exact RGB values at runtime to
// produce a team colour, a skin tone, and a High Contrast variant, the same
// trick capTextureFor() uses for the caps in scenes.js.
//
// The public entry point is bb2MakePlayer(), which returns a CONTAINER with the
// same shape makePlayer() has always returned, so every existing tween, jog(),
// and destroy() call in game.js keeps working untouched.
// ═══════════════════════════════════════════════════════════════════════════════

const BB2_CELL = 64;
// Design row 26 of 32 is the feet baseline; at 2x that is export row 52, which
// sits 20px below the 64px cell's centre. Offsetting the sprite by -20 puts the
// container's own (x, y) on the player's FEET rather than his middle, so he
// stands on a base instead of straddling it.
const BB2_FOOT_OFFSET = -20;

const BB2_SHEETS = {
    'player-base': {
        file: 'images/sprites/player-base.png',
        anims: {
            idle_front: { start: 0,  count: 2, rate: 2,  repeat: -1 },
            idle_back:  { start: 2,  count: 2, rate: 2,  repeat: -1 },
            run_front:  { start: 4,  count: 6, rate: 12, repeat: -1 },
            run_back:   { start: 10, count: 6, rate: 12, repeat: -1 },
            run_side:   { start: 16, count: 6, rate: 12, repeat: -1 },
            celebrate:  { start: 22, count: 4, rate: 8,  repeat: -1 },
            dejected:   { start: 26, count: 3, rate: 4,  repeat: -1 }
        }
    },
    'catcher': {
        file: 'images/sprites/catcher.png',
        // Self-contained: gear changes his silhouette in every pose, so he
        // shares no frames with player-base. The aliases let generic calls
        // like setAnim('idle_front') resolve to his equivalent pose.
        defaultFacing: 'back',
        labelY: -29,   // he is crouched; -40 lands the label on home plate
        aliases: { idle_front: 'crouch_idle', idle_back: 'crouch_idle',
                   run_front: 'run_back', celebrate: 'rise_throw',
                   dejected: 'crouch_idle' },
        anims: {
            crouch_idle: { start: 0,  count: 2, rate: 2,  repeat: -1 },
            receive:     { start: 2,  count: 3, rate: 14, repeat: 0 },
            rise_throw:  { start: 5,  count: 4, rate: 10, repeat: 0 },
            block:       { start: 9,  count: 2, rate: 6,  repeat: 0 },
            tag_home:    { start: 11, count: 3, rate: 10, repeat: 0 },
            run_back:    { start: 14, count: 4, rate: 10, repeat: -1 },
            run_side:    { start: 18, count: 4, rate: 10, repeat: -1 }
        }
    },
    'pitcher-actions': {
        file: 'images/sprites/pitcher-actions.png',
        anims: {
            set:             { start: 0,  count: 2, rate: 2,  repeat: -1 },
            windup:          { start: 2,  count: 6, rate: 10, repeat: 0 },
            release:         { start: 8,  count: 3, rate: 14, repeat: 0 },
            follow_through:  { start: 11, count: 3, rate: 10, repeat: 0 },
            fielding_stance: { start: 14, count: 2, rate: 2,  repeat: -1 }
        }
    },
    'firstbase-actions': {
        file: 'images/sprites/firstbase-actions.png',
        anims: {
            stretch_catch:  { start: 0,  count: 4, rate: 12, repeat: 0 },
            ready_at_bag:   { start: 4,  count: 2, rate: 2,  repeat: -1 },
            field_grounder: { start: 6,  count: 4, rate: 10, repeat: 0 },
            throw:          { start: 10, count: 2, rate: 12, repeat: 0 }
        }
    },
    'infield-actions': {
        file: 'images/sprites/infield-actions.png',
        anims: {
            ready:          { start: 0,  count: 2, rate: 2,  repeat: -1 },
            field_grounder: { start: 2,  count: 4, rate: 10, repeat: 0 },
            throw:          { start: 6,  count: 4, rate: 12, repeat: 0 },
            receive_at_bag: { start: 10, count: 3, rate: 10, repeat: 0 },
            tag:            { start: 13, count: 3, rate: 10, repeat: 0 },
            dive:           { start: 16, count: 2, rate: 8,  repeat: 0 }
        }
    },
    'outfield-actions': {
        file: 'images/sprites/outfield-actions.png',
        anims: {
            ready:        { start: 0,  count: 2, rate: 2,  repeat: -1 },
            catch_fly:    { start: 2,  count: 4, rate: 10, repeat: 0 },
            field_bounce: { start: 6,  count: 3, rate: 10, repeat: 0 },
            throw_relay:  { start: 9,  count: 4, rate: 12, repeat: 0 },
            wall_watch:   { start: 13, count: 2, rate: 2,  repeat: -1 }
        }
    },
    'batter-actions': {
        file: 'images/sprites/batter-actions.png',
        // The bat is baked into every frame here, replacing the separate
        // rotating bat-shape image the circle-era batter used. defaultFacing
        // and the idle/celebrate/dejected aliases below make sure the
        // generic idleAnim() call (fired whenever a jog/stopBob settles the
        // batter, e.g. stepping in from the dugout) shows 'stance' — WITH
        // the bat — instead of falling through to player-base's bare-handed
        // idle_front, which it shares for run/celebrate/dejected otherwise.
        defaultFacing: 'back',
        aliases: { idle_front: 'stance', idle_back: 'stance', celebrate: 'stance', dejected: 'hit_by_pitch' },
        anims: {
            stance:       { start: 0,  count: 2, rate: 2,  repeat: -1 },
            load_bunt:    { start: 2,  count: 2, rate: 3,  repeat: -1 },
            load_normal:  { start: 4,  count: 2, rate: 3,  repeat: -1 },
            load_power:   { start: 6,  count: 2, rate: 4,  repeat: -1 },
            // Same 5 frames for both swing keys — only the playback rate
            // differs. That is the "just an animation speed difference"
            // simplification for normal vs. power: a slower, weightier
            // sweep for power rather than a second authored pose set.
            swing_normal: { start: 8,  count: 5, rate: 16, repeat: 0 },
            swing_power:  { start: 8,  count: 5, rate: 11, repeat: 0 },
            bunt:         { start: 13, count: 3, rate: 9,  repeat: 0 },
            hit_by_pitch: { start: 16, count: 2, rate: 6,  repeat: 0 },
            take_off:     { start: 18, count: 2, rate: 10, repeat: 0 }
        }
    },
    'runner-actions': {
        file: 'images/sprites/runner-actions.png',
        anims: {
            lead_off:    { start: 0, count: 2, rate: 3,  repeat: -1 },
            slide:       { start: 2, count: 4, rate: 14, repeat: 0 },
            safe_stand:  { start: 6, count: 3, rate: 6,  repeat: 0 },
            out_walkoff: { start: 9, count: 4, rate: 4,  repeat: 0 }
        }
    }
};

// Which sheets each position needs. Positions absent from this map fall back to
// the plain circle in makePlayer() — that is what keeps the pilot to one player.
const BB2_POSITION_SHEETS = {
    P:  ['player-base', 'pitcher-actions'],
    C:  ['catcher'],
    '1B': ['player-base', 'firstbase-actions'],
    '2B': ['player-base', 'infield-actions'],
    SS: ['player-base', 'infield-actions'],
    '3B': ['player-base', 'infield-actions'],
    LF: ['player-base', 'outfield-actions'],
    CF: ['player-base', 'outfield-actions'],
    RF: ['player-base', 'outfield-actions'],
    B:  ['batter-actions', 'player-base'],
    R:  ['runner-actions', 'player-base']
};

// ─── Index palette (must match bb2_sprites.py exactly) ─────────────────────
const BB2_PAL = {
    outline: [0x3a, 0x3a, 0x3a],
    rim:     [0x4a, 0x4a, 0x4a],   // ring outside the outline
    jersey:  [0x80, 0x80, 0x80],
    jshade:  [0x5a, 0x5a, 0x5a],
    jlight:  [0xa8, 0xa8, 0xa8],
    skin:    [0xe8, 0xb9, 0x8a],
    skinsh:  [0xc0, 0x8a, 0x5a],
    glove:   [0x6b, 0x4a, 0x2a],
    bat:     [0xf5, 0xde, 0x8c],
    white:   [0xf2, 0xf2, 0xf2],
    dark:    [0x1a, 0x1a, 0x1a]
};

const BB2_SKIN_TONES = [
    [[0xf2, 0xd3, 0xb0], [0xd4, 0xa8, 0x7e]],
    [[0xe8, 0xb9, 0x8a], [0xc0, 0x8a, 0x5a]],
    [[0xc9, 0x8a, 0x5b], [0x9c, 0x63, 0x38]],
    [[0x96, 0x60, 0x3a], [0x6d, 0x42, 0x23]],
    [[0x5f, 0x3a, 0x22], [0x42, 0x26, 0x15]]
];

function bb2LoadSprites(scene) {
    Object.keys(BB2_SHEETS).forEach(key => {
        if (scene.textures.exists(key)) return;
        scene.load.spritesheet(key, BB2_SHEETS[key].file,
            { frameWidth: BB2_CELL, frameHeight: BB2_CELL });
    });
}

function bb2SpritesReady(scene) {
    return Object.keys(BB2_SHEETS).every(k => scene.textures.exists(k));
}

function bb2HighContrast() {
    try {
        const p = JSON.parse(localStorage.getItem(GAME_CONSTANTS.STORAGE_KEYS.PREFERENCES) || '{}');
        return !!p.highContrast;
    } catch (e) { return false; }
}

// Written from SettingsScene's "High Contrast" toggle. Read fresh by every
// bb2VariantTexture() build, so the very next game created after the toggle
// picks it up — there is no in-game access point to this setting today, so
// no live sprite re-key is needed.
function bb2SetHighContrast(on) {
    try {
        const key = GAME_CONSTANTS.STORAGE_KEYS.PREFERENCES;
        const p = JSON.parse(localStorage.getItem(key) || '{}');
        p.highContrast = !!on;
        localStorage.setItem(key, JSON.stringify(p));
    } catch (e) { /* localStorage unavailable — setting just won't persist */ }
}

// Deterministic, NOT random: createTeams(true) rebuilds every fielder at each
// half-inning swap, so a random tone would reshuffle the whole roster every
// inning. Hashing (team, position) keeps the shortstop the same person all game.
function bb2SkinIndex(teamName, posKey) {
    const s = String(teamName) + '|' + String(posKey);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h % BB2_SKIN_TONES.length;
}

function bb2Shade(hex, f) {
    return [
        Math.min(255, Math.round(((hex >> 16) & 0xff) * f)),
        Math.min(255, Math.round(((hex >> 8) & 0xff) * f)),
        Math.min(255, Math.round((hex & 0xff) * f)),
        255
    ];
}

function bb2BuildMap(teamHex, teamLight, skinIdx, hc) {
    const m = {};
    const put = (pal, rgba) => { m[(pal[0] << 16) | (pal[1] << 8) | pal[2]] = rgba; };
    const tone = BB2_SKIN_TONES[skinIdx % BB2_SKIN_TONES.length];

    if (!hc) {
        put(BB2_PAL.jersey, bb2Shade(teamHex, 1.00));
        put(BB2_PAL.jshade, bb2Shade(teamHex, 0.72));
        put(BB2_PAL.jlight, bb2Shade(teamHex, 1.30));
        // The rim ring is drawn into every frame but is invisible normally —
        // a palette swap CAN change alpha, which is what makes the High
        // Contrast halo possible without a second set of frames.
        put(BB2_PAL.rim, [0, 0, 0, 0]);
    } else {
        put(BB2_PAL.jersey, bb2Shade(teamLight, 1.00));
        put(BB2_PAL.jshade, bb2Shade(teamHex, 0.55));
        put(BB2_PAL.jlight, bb2Shade(teamLight, 1.40));
        put(BB2_PAL.rim,     [255, 255, 255, 255]);   // the halo
        put(BB2_PAL.outline, [0, 0, 0, 255]);
        put(BB2_PAL.glove,   [0x4a, 0x2f, 0x14, 255]);
        put(BB2_PAL.bat,     [0xff, 0xd2, 0x7f, 255]);
        put(BB2_PAL.white,   [255, 255, 255, 255]);
        put(BB2_PAL.dark,    [0, 0, 0, 255]);
    }
    put(BB2_PAL.skin,   [tone[0][0], tone[0][1], tone[0][2], 255]);
    put(BB2_PAL.skinsh, [tone[1][0], tone[1][1], tone[1][2], 255]);
    return m;
}

// One recoloured copy of a sheet. Cache key covers every axis that changes
// pixels, so only the combinations actually on screen are ever built.
function bb2VariantTexture(scene, sheetKey, teamHex, teamLight, skinIdx, hc) {
    const key = sheetKey + '|' + teamHex + '|' + skinIdx + '|' + (hc ? 'hc' : 'n');
    if (scene.textures.exists(key)) return key;
    if (!scene.textures.exists(sheetKey)) return null;

    const src = scene.textures.get(sheetKey).getSourceImage();
    const w = src.width, h = src.height;
    const tex = scene.textures.createCanvas(key, w, h);
    if (!tex) return null;

    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    const map = bb2BuildMap(teamHex, teamLight, skinIdx, hc);
    for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        const t = map[(px[i] << 16) | (px[i + 1] << 8) | px[i + 2]];
        if (!t) continue;
        px[i] = t[0]; px[i + 1] = t[1]; px[i + 2] = t[2]; px[i + 3] = t[3];
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();

    // A canvas texture has no grid frames of its own — lay them out by hand.
    const cols = Math.floor(w / BB2_CELL), rows = Math.floor(h / BB2_CELL);
    let n = 0;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            tex.add(n++, 0, x * BB2_CELL, y * BB2_CELL, BB2_CELL, BB2_CELL);
        }
    }
    return key;
}

function bb2EnsureAnims(scene, sheetKey, texKey) {
    const defs = BB2_SHEETS[sheetKey].anims;
    Object.keys(defs).forEach(name => {
        const animKey = texKey + '|' + name;
        if (scene.anims.exists(animKey)) return;
        const d = defs[name];
        const frames = [];
        for (let i = 0; i < d.count; i++) frames.push({ key: texKey, frame: d.start + i });
        scene.anims.create({ key: animKey, frames, frameRate: d.rate, repeat: d.repeat });
    });
}

// ─── The player container ───────────────────────────────────────────────────
// Returns null when the sheets are missing or the position has no sprite yet,
// which is the signal for makePlayer() to fall back to the original circle.
function bb2MakePlayer(scene, colorObj, label, posKey) {
    const sheets = BB2_POSITION_SHEETS[posKey || label];
    if (!sheets || !bb2SpritesReady(scene)) return null;

    const hc = bb2HighContrast();
    const skin = bb2SkinIndex(colorObj.name || colorObj.hex, posKey || label);
    const texFor = {};
    for (const s of sheets) {
        const t = bb2VariantTexture(scene, s, colorObj.hex, colorObj.light || colorObj.hex, skin, hc);
        if (!t) return null;
        bb2EnsureAnims(scene, s, t);
        texFor[s] = t;
    }

    const c = scene.add.container(0, 0);
    const shadow = scene.add.ellipse(1, 2, 30, 13, 0x000000, 0.45);
    const spr = scene.add.sprite(0, BB2_FOOT_OFFSET, texFor[sheets[0]], 0);
    const labelY = BB2_SHEETS[sheets[0]].labelY;
    const num = scene.add.text(0, labelY == null ? -40 : labelY, label, {
        fontSize: '9px', fontFamily: 'Arial Black', color: '#ffffff',
        stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);
    c.add([shadow, spr, num]);

    c._bb2 = true;
    c._spr = spr;
    c._tex = texFor;
    c._sheets = sheets;
    c._facing = (BB2_SHEETS[sheets[0]].defaultFacing) || 'front';
    c._anim = null;
    c._busy = false;      // true while a scripted action owns the sprite

    // Resolve an animation name to the sheet that actually holds it.
    c._resolve = (name) => {
        // Sheets are checked in order, and each sheet's OWN alias is
        // consulted before falling through to a later sheet's direct
        // definition. This lets a more specific sheet override a shared one
        // — e.g. the batter's 'idle_front' alias to 'stance' (WITH the bat)
        // must win over player-base's plain 'idle_front', even though
        // player-base defines that name directly and sits later in the list.
        for (const s of sheets) {
            const def = BB2_SHEETS[s];
            const al = def.aliases;
            if (al && al[name] && def.anims[al[name]]) return texFor[s] + '|' + al[name];
            if (def.anims[name]) return texFor[s] + '|' + name;
        }
        return null;
    };

    c.setAnim = (name, force) => {
        if (c._busy && !force) return c;
        const key = c._resolve(name);
        if (!key || (c._animKey === key && spr.anims.isPlaying)) return c;
        c._anim = name;
        c._animKey = key;
        spr.play(key, true);
        return c;
    };

    // Direction from a movement vector. Left is the right-facing art flipped,
    // so only three directions are ever authored.
    c.faceFrom = (dx, dy) => {
        if (Math.abs(dx) > Math.abs(dy) * 1.2) {
            c._facing = 'side';
            spr.setFlipX(dx < 0);
        } else {
            c._facing = dy < 0 ? 'back' : 'front';
            spr.setFlipX(false);
        }
        return c._facing;
    };

    c.runAnim = () => c.setAnim('run_' + (c._facing === 'side' ? 'side' : c._facing));
    c.idleAnim = () => c.setAnim(c._facing === 'side' ? 'idle_front' : 'idle_' + c._facing);

    // Near-to-far sorting inside the existing depth-3 band, so overlapping
    // players stack correctly without disturbing anything else in the scene.
    c.syncDepth = () => c.setDepth(3 + c.y / 1000);
    c.syncDepth();

    // ── Pitcher delivery ──────────────────────────────────────────────────
    // windup -> release -> follow_through -> fielding_stance, with onRelease
    // fired on the exact frame the ball leaves the hand. Driving the ball off
    // the animation instead of a timer means the two can never drift apart.
    if (BB2_POSITION_SHEETS[posKey || label] &&
        BB2_SHEETS['pitcher-actions'] && texFor['pitcher-actions']) {
        const relKey = texFor['pitcher-actions'] + '|release';
        spr.on('animationupdate', (anim, frame) => {
            if (anim.key === relKey && frame.index === 2 && c._onRelease) {
                const fn = c._onRelease;
                c._onRelease = null;
                fn();
            }
        });
        spr.on('animationcomplete', (anim) => {
            if (!c._busy) return;
            const base = texFor['pitcher-actions'] + '|';
            if (anim.key === base + 'windup') {
                c._anim = 'release'; spr.play(base + 'release', true);
            } else if (anim.key === base + 'release') {
                c._anim = 'follow_through'; spr.play(base + 'follow_through', true);
            } else if (anim.key === base + 'follow_through') {
                c._busy = false;
                c.setAnim('fielding_stance');
                if (c._onPitchDone) { const fn = c._onPitchDone; c._onPitchDone = null; fn(); }
            }
        });

        c.playPitch = (onRelease, onDone) => {
            c._busy = true;
            c._onRelease = onRelease || null;
            c._onPitchDone = onDone || null;
            c._anim = 'windup';
            spr.play(texFor['pitcher-actions'] + '|windup', true);
            return c;
        };
        // Time from the first windup frame to the ball leaving the hand —
        // 6 windup frames at 10fps plus one release frame at 14fps.
        c.releaseDelayMs = Math.round(6 / 10 * 1000 + 1 / 14 * 1000);
    }

    c.idleAnim();
    return c;
}
