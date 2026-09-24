// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S BASEBALL 2 - Animated player sprites
//
// Shared 3D source: art/build_players.py. Shipped sheets use 256px cells,
// continuous jersey/skin material channels and generated contact anchors.
// The game keeps the same player-container interface as the original sprites.

const BB2_CELL = typeof BASEBALL_ART_CELL === 'number' ? BASEBALL_ART_CELL : 128;
const BB2_DISPLAY = 84;
// Seat the rig's projected ground point on the player container origin.
const BB2_FOOT_OFFSET = typeof BASEBALL_ART_FOOT === 'number' ? BB2_DISPLAY * (.5 - BASEBALL_ART_FOOT / BB2_CELL) : -20;

const BB2_SHEETS = {
    'player-base': {
        file: 'images/sprites/player-base.png',
        anims: {
            scuffle: { start: 0, count: 8, rate: 8, repeat: -1 },
            dust_off: { start: 0, count: 8, rate: 8, repeat: 0 },
            idle_front: { start: 0,  count: 2, rate: 2,  repeat: -1 },
            idle_back:  { start: 2,  count: 2, rate: 2,  repeat: -1 },
            run_front:  { start: 4,  count: 6, rate: 12, repeat: -1 },
            run_back:   { start: 10, count: 6, rate: 12, repeat: -1 },
            run_side:   { start: 16, count: 6, rate: 12, repeat: -1 },
            walk_front: { start: 0, count: 12, rate: 12, repeat: -1 },
            walk_back:  { start: 0, count: 12, rate: 12, repeat: -1 },
            walk_side:  { start: 0, count: 12, rate: 12, repeat: -1 },
            celebrate:  { start: 22, count: 4, rate: 8,  repeat: -1 },
            dejected:   { start: 26, count: 3, rate: 4,  repeat: -1 }
        }
    },
    'batter-walk': {
        file: 'images/sprites/batter-walk.png',
        anims: {
            scuffle: { start: 0, count: 8, rate: 8, repeat: -1 },
            dust_off: { start: 0, count: 8, rate: 8, repeat: 0 },
            walk_front: { start: 0, count: 12, rate: 12, repeat: -1 },
            walk_back:  { start: 0, count: 12, rate: 12, repeat: -1 },
            walk_side:  { start: 0, count: 12, rate: 12, repeat: -1 }
        }
    },
    'catcher': {
        file: 'images/sprites/catcher.png',
        // Self-contained: gear changes his silhouette in every pose, so he
        // shares no frames with player-base. The aliases let generic calls
        // like setAnim('idle_front') resolve to his equivalent pose.
        defaultFacing: 'back',
        labelY: -36,   // Keep the label above the crouched helmet.
        aliases: { idle_front: 'crouch_idle', idle_back: 'crouch_idle',
                   run_front: 'run_back', celebrate: 'rise_throw',
                   dejected: 'crouch_idle' },
        anims: {
            scuffle: { start: 0, count: 8, rate: 8, repeat: -1 },
            dust_off: { start: 0, count: 8, rate: 8, repeat: 0 },
            crouch_idle: { start: 0,  count: 2, rate: 2,  repeat: -1 },
            receive:     { start: 2,  count: 3, rate: 14, repeat: 0 },
            rise_throw:  { start: 5,  count: 4, rate: 10, repeat: 0 },
            block:       { start: 9,  count: 2, rate: 6,  repeat: 0 },
            tag_home:    { start: 11, count: 3, rate: 10, repeat: 0 },
            run_back:    { start: 14, count: 4, rate: 10, repeat: -1 },
            run_side:    { start: 18, count: 4, rate: 10, repeat: -1 },
            walk_front:  { start: 0, count: 12, rate: 12, repeat: -1 },
            walk_back:   { start: 0, count: 12, rate: 12, repeat: -1 },
            walk_side:   { start: 0, count: 12, rate: 12, repeat: -1 }
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
            ready_left:   { start: 0, count: 6, rate: 5, repeat: -1 },
            ready_right:  { start: 0, count: 6, rate: 5, repeat: -1 },
            pitch_ready:  { start: 0, count: 6, rate: 5, repeat: -1 },
            pitch_ready_left:  { start: 0, count: 6, rate: 5, repeat: -1 },
            pitch_ready_right: { start: 0, count: 6, rate: 5, repeat: -1 },
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
            on_deck:      { start: 0,  count: 2, rate: 1,  repeat: -1 },
            load_bunt:    { start: 2,  count: 2, rate: 3,  repeat: -1 },
            load_normal:  { start: 4,  count: 2, rate: 3,  repeat: -1 },
            load_power:   { start: 6,  count: 2, rate: 4,  repeat: -1 },
            load_charge:  { start: 0,  count: 33, rate: 6, repeat: 0 },
            // Generated art supplies separate normal/power swing sequences
            // with different starting coils and a shared fixed-length bat.
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
            scuffle: { start: 0, count: 8, rate: 8, repeat: -1 },
            dust_off: { start: 0, count: 8, rate: 8, repeat: 0 },
            lead_off:    { start: 0, count: 2, rate: 3,  repeat: -1 },
            slide:       { start: 2, count: 4, rate: 14, repeat: 0 },
            safe_stand:  { start: 6, count: 3, rate: 6,  repeat: 0 },
            out_walkoff: { start: 9, count: 4, rate: 4,  repeat: 0 }
        }
    }
};

// Generated frame tables keep art and contact timing together.
if (typeof BASEBALL_ART !== 'undefined') {
    for (const [key, data] of Object.entries(BASEBALL_ART)) BB2_SHEETS[key].anims = data.anims;
}

// Which sheets each position needs. Positions absent from this map fall back to
// the plain circle in makePlayer() — that is what keeps the pilot to one player.
const BB2_POSITION_SHEETS = {
    P:  ['player-base', 'pitcher-actions', 'infield-actions'],
    C:  ['catcher'],
    '1B': ['player-base', 'firstbase-actions'],
    '2B': ['player-base', 'infield-actions'],
    SS: ['player-base', 'infield-actions'],
    '3B': ['player-base', 'infield-actions'],
    LF: ['player-base', 'outfield-actions'],
    CF: ['player-base', 'outfield-actions'],
    RF: ['player-base', 'outfield-actions'],
    B:  ['batter-actions', 'batter-walk', 'runner-actions', 'player-base'],
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

const BB2_PREFETCHED_SPRITES = new Set();
function bb2PrefetchSprites() {
    const version = typeof BASEBALL_ART_VERSION === 'string' ? '?v=' + BASEBALL_ART_VERSION : '';
    for (const [key, sheet] of Object.entries(BB2_SHEETS)) {
        const mask = typeof BASEBALL_ART !== 'undefined' && BASEBALL_ART[key].materialFile;
        for (const file of [sheet.file, mask].filter(Boolean)) {
            const url = file + version;
            if (BB2_PREFETCHED_SPRITES.has(url)) continue;
            BB2_PREFETCHED_SPRITES.add(url);
            const link = document.createElement('link');
            link.rel = 'preload';link.as = 'image';link.href = url;
            document.head.appendChild(link);
        }
    }
}

function bb2LoadSprites(scene) {
    const version = typeof BASEBALL_ART_VERSION === 'string' ? '?v=' + BASEBALL_ART_VERSION : '';
    Object.keys(BB2_SHEETS).forEach(key => {
        if (!scene.textures.exists(key)) scene.load.spritesheet(key, BB2_SHEETS[key].file + version,
            { frameWidth: BB2_CELL, frameHeight: BB2_CELL });
        const material = typeof BASEBALL_ART !== 'undefined' && BASEBALL_ART[key].materialFile;
        if (material && !scene.textures.exists(key + '-materials')) scene.load.image(key + '-materials', material + version);
    });
}

function bb2SpritesReady(scene) {
    return Object.keys(BB2_SHEETS).every(k => scene.textures.exists(k) &&
        (!(typeof BASEBALL_ART !== 'undefined' && BASEBALL_ART[k].materialFile) || scene.textures.exists(k + '-materials')));
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
function bb2ApplyMaterialPixels(px, masks, team, skin, hc) {
    for (let i = 0; i < px.length; i += 4) {
        const coverage = px[i + 3];
        const alpha = hc ? Math.max(coverage, masks[i + 2]) : coverage;
        // Most of an atlas is empty padding. Avoid shading/dividing three
        // channels for those pixels, while still allowing HC halo coverage.
        if (alpha === 0) { px[i] = px[i+1] = px[i+2] = 0; continue; }
        if (alpha === coverage && masks[i] === 0 && masks[i+1] === 0) continue;
        for (let c = 0; c < 3; c++) {
            const color = Math.min(255, px[i + c] + 2 * masks[i] / 255 * team[c] + 2 * masks[i + 1] / 255 * skin[c]);
            // Composite the optional white outline under the covered body.
            px[i + c] = alpha ? Math.round((color * coverage + 255 * (alpha - coverage)) / alpha) : 0;
        }
        px[i + 3] = alpha;
    }
}

function bb2ReadMaterialSource(scene, sheetKey) {
    const src = scene.textures.get(sheetKey).getSourceImage();
    const canvas = document.createElement('canvas');canvas.width = src.width;canvas.height = src.height;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(src, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(scene.textures.get(sheetKey + '-materials').getSourceImage(), 0, 0);
    const masks = context.getImageData(0, 0, canvas.width, canvas.height).data;
    canvas.width = canvas.height = 1;
    return {pixels, masks};
}

// Group by source sheet, retain just one decoded pair, and yield after each
// variant so the field/progress can paint while team uniforms are prepared.
function bb2PreparePlayers(scene, roster, progress, complete) {
    const jobs = new Map(), hc = bb2HighContrast();
    for (const {color, position} of roster) {
        const skin = bb2SkinIndex(color.name || color.hex, position);
        for (const sheet of BB2_POSITION_SHEETS[position] || []) {
            jobs.set(sheet + '|' + color.hex + '|' + skin, {sheet, color, skin});
        }
    }
    const queue = [...jobs.values()].sort((a,b) => a.sheet.localeCompare(b.sheet));
    let index = 0, currentSheet = null, source = null, cancelled = false;
    const cancel = () => {cancelled = true;source = null;};
    scene.events.once('shutdown', cancel);
    const next = () => {
        if (cancelled) return;
        if (index === queue.length) {
            source = null;scene.events.off('shutdown', cancel);complete();return;
        }
        const job = queue[index++], c = job.color;
        const key = job.sheet + '|' + c.hex + '|' + job.skin + '|' + (hc ? 'hc' + (c.light || c.hex) : 'n');
        if (!scene.textures.exists(key)) {
            if (currentSheet !== job.sheet) {
                source = null;currentSheet = job.sheet;
                if (typeof BASEBALL_ART !== 'undefined' && BASEBALL_ART[job.sheet].materialFile)
                    source = bb2ReadMaterialSource(scene, job.sheet);
            }
            bb2VariantTexture(scene, job.sheet, c.hex, c.light || c.hex, job.skin, hc, source);
        }
        progress(index / queue.length);
        scene.time.delayedCall(0, next);
    };
    scene.time.delayedCall(0, next);
}

function bb2VariantTexture(scene, sheetKey, teamHex, teamLight, skinIdx, hc, prepared = null) {
    const key = sheetKey + '|' + teamHex + '|' + skinIdx + '|' + (hc ? 'hc' + teamLight : 'n');
    if (scene.textures.exists(key)) return key;
    if (!scene.textures.exists(sheetKey)) return null;

    const src = scene.textures.get(sheetKey).getSourceImage();
    const w = src.width, h = src.height;
    const tex = scene.textures.createCanvas(key, w, h);
    if (!tex) return null;

    const ctx = tex.getContext();
    ctx.clearRect(0, 0, w, h);
    let img;
    if (prepared) {img = ctx.createImageData(w, h);img.data.set(prepared.pixels);}
    else {ctx.drawImage(src, 0, 0);img = ctx.getImageData(0, 0, w, h);}
    const px = img.data;
    const map = bb2BuildMap(teamHex, teamLight, skinIdx, hc);
    const generated = typeof BASEBALL_ART !== 'undefined' && !!BASEBALL_ART[sheetKey];
    if (generated && BASEBALL_ART[sheetKey].materialFile) {
        if (prepared) bb2ApplyMaterialPixels(px, prepared.masks,
            bb2Shade(hc ? teamLight : teamHex, 1), BB2_SKIN_TONES[skinIdx % BB2_SKIN_TONES.length][0], hc);
        else {
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const maskContext = canvas.getContext('2d', { willReadFrequently: true });
            maskContext.drawImage(scene.textures.get(sheetKey + '-materials').getSourceImage(), 0, 0);
            bb2ApplyMaterialPixels(px, maskContext.getImageData(0, 0, w, h).data,
                bb2Shade(hc ? teamLight : teamHex, 1), BB2_SKIN_TONES[skinIdx % BB2_SKIN_TONES.length][0], hc);
            canvas.width = canvas.height = 1;
        }
    } else for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        const r = px[i], g = px[i+1], b = px[i+2];
        // Continuous shaded material channels from the 3D bake. Preserve
        // alpha at antialiased edges and use the same stable roster skin tone.
        if (b > g * 1.25 && g > r * 3) {
            const shade = b / 195;
            const rgb = bb2Shade(hc ? teamLight : teamHex, shade);
            px[i]=rgb[0];px[i+1]=rgb[1];px[i+2]=rgb[2];continue;
        }
        if (r > g * 3 && b > g * 3) {
            const tone = BB2_SKIN_TONES[skinIdx % BB2_SKIN_TONES.length][0];
            px[i]=Math.min(255,tone[0]*r/240);px[i+1]=Math.min(255,tone[1]*r/240);px[i+2]=Math.min(255,tone[2]*r/240);continue;
        }
        if (generated) {
            // These sheets encode cloth/skin by hue. Legacy grayscale jersey
            // entries also match pants and low-alpha outline pixels after a
            // canvas round trip, creating opaque team-colored speckles.
            if (r === g && g === b && Math.abs(r - 74) <= 1) {
                if (hc) { px[i] = px[i+1] = px[i+2] = 255; }
                else px[i+3] = 0;
            }
            continue;
        }
        const t = map[(px[i] << 16) | (px[i + 1] << 8) | px[i + 2]];
        if (!t) continue;
        px[i] = t[0]; px[i + 1] = t[1]; px[i + 2] = t[2]; px[i + 3] = Math.round(px[i + 3] * t[3] / 255);
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
    const shadow = scene.add.ellipse(1, 2, 24, 9, 0x000000, 0.45);
    const spr = scene.add.sprite(0, BB2_FOOT_OFFSET, texFor[sheets[0]], 0).setDisplaySize(BB2_DISPLAY, BB2_DISPLAY);
    const labelY = BB2_SHEETS[sheets[0]].labelY;
    const num = scene.add.text(0, labelY == null ? -48 : labelY, label, {
        fontSize: '9px', fontFamily: 'Arial Black', color: '#ffffff',
        stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);
    c.add([shadow, spr, num]);

    c._bb2 = true;
    c._spr = spr;
    c._label = num;
    c._tex = texFor;
    c._sheets = sheets;
    c._facing = (BB2_SHEETS[sheets[0]].defaultFacing) || 'front';
    c._anim = null;
    c._busy = false;      // true while a scripted action owns the sprite

    const anchorPoint = (sheet, frame, part) => {
        const a = typeof BASEBALL_ART !== 'undefined' && BASEBALL_ART[sheet].anchors[frame];
        if (!a || !a[part]) return { x: c.x, y: c.y - 8 };
        return { x: c.x + (a[part][0] - BB2_CELL/2) * BB2_DISPLAY/BB2_CELL * (spr.flipX ? -1 : 1) * c.scaleX,
            y: c.y + (BB2_FOOT_OFFSET + (a[part][1] - BB2_CELL/2) * BB2_DISPLAY/BB2_CELL) * c.scaleY };
    };
    c.actionPoint = (name, part) => {
        const sheet = sheets.find(s => BB2_SHEETS[s].anims[name]);
        if (!sheet) return { x: c.x, y: c.y - 8 };
        const clip = BB2_SHEETS[sheet].anims[name];
        return anchorPoint(sheet, clip.start + Math.min(clip.count-1, clip.contactFrame || 0), part);
    };
    c.ballPoint = part => {
        const sheet = sheets.find(s => texFor[s] === spr.texture.key) || sheets[0];
        return anchorPoint(sheet, Number(spr.frame.name), part);
    };

    // Resolve an animation name to the sheet that actually holds it.
    c._resolve = (name) => {
        const position = posKey || label;
        if (['ready','pitch_ready'].includes(name) && ['LF','RF'].includes(position)) {
            name += position === 'LF' ? '_right' : '_left';
        }
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
        if (!key) return c;
        if (c._animKey === key && spr.anims.isPlaying) { c._anim = name;return c; }
        c._anim = name;
        c._animKey = key;
        if (sheets[0] === 'batter-actions' && !name.startsWith('run') && name !== 'take_off') spr.setFlipX(false);
        spr.play(key, true);
        return c;
    };

    // A defensive action owns its pose through follow-through. The ball
    // handoff follows the rendered contact frame, including on slow devices.
    c.playFieldAction = (name, onContact, onDone, holdContact = false) => {
        const key = c._resolve(name);
        if (!key) return false;
        if (c._fieldAction) c._fieldAction.cancel();
        const sheet = sheets.find(s => key.startsWith(texFor[s] + '|'));
        const clip = BB2_SHEETS[sheet].anims[key.slice(key.lastIndexOf('|') + 1)];
        let contacted = false, finished = false;
        const cleanup = () => {
            spr.off('animationupdate', update);
            spr.off('animationcomplete', complete);
            spr.off('destroy', cancel);
        };
        const cancel = () => {
            if (finished) return;
            finished = true;cleanup();spr.anims?.resume();
            c._fieldAction = null;c._busy = false;
        };
        const resume = () => { if (!finished) spr.anims.resume(); };
        const contact = () => {
            if (contacted || finished) return;
            contacted = true;
            if (holdContact) spr.anims.pause();
            if (onContact) onContact(resume);
        };
        const update = (anim, frame) => {
            if (anim.key === key && frame.index >= (clip.contactFrame || 0) + 1) contact();
        };
        const complete = anim => {
            if (anim.key !== key || finished) return;
            contact();finished = true;cleanup();c._fieldAction = null;c._busy = false;
            const move = scene._playerMotion && scene._playerMotion.moves.get(c);
            if (move) { if (move.gait === 'walk') c.walkAnim(); else c.runAnim(); }
            else c.idleAnim();
            if (onDone) onDone();
        };
        c._busy = true;c._fieldAction = {cancel, resume};
        spr.on('animationupdate', update);spr.on('animationcomplete', complete);spr.once('destroy', cancel);
        // Restart even if a preceding catch/relay used this same clip.
        spr.anims.stop();c.setAnim(name, true);
        if (!clip.contactFrame) contact();
        return true;
    };

    c.setChargePose = progress => {
        const clip = BB2_SHEETS['batter-actions'].anims.load_charge;
        if (!clip || !texFor['batter-actions'] || c._busy) return;
        const held = Math.max(0, Math.min(1, progress));
        // Start at the shoulder, bring the bat forward during the first 1.2s,
        // then draw it back through normal to the deepest power backswing.
        // Reuse the complete pose range in reverse, then forward, so the
        // opening movement stays smooth without adding another large atlas.
        const forward = Math.min(1, held / .2);
        const pose = held < .2 ? .78 * (1 - forward * forward * (3 - 2 * forward)) : (held - .2) / .8;
        const frame = clip.start + Math.round(pose * (clip.count - 1));
        spr.anims.stop();
        spr.setTexture(texFor['batter-actions'], frame).setFlipX(false);
        c._anim = 'load_charge';
        c._animKey = c._resolve('load_charge');
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
    c.walkAnim = () => c.setAnim('walk_' + (c._facing === 'side' ? 'side' : c._facing));
    c.idleAnim = () => {
        if (c._onDeck) return c.setAnim('on_deck');
        if (c._baseRunner) return c.setAnim('lead_off');
        if ((posKey || label) === 'B') return c.setAnim('stance');
        const position = posKey || label;
        const ready = position === 'P' ? 'set' : position === '1B' ? 'ready_at_bag'
            : ['LF','CF','RF'].includes(position) ? (c._fieldReady ? 'pitch_ready' : 'ready')
            : ['2B', '3B', 'SS'].includes(position) ? 'ready' : null;
        if (ready && !c._busy) {
            spr.setFlipX(false);
            return c.setAnim(ready);
        }
        return c.setAnim(c._facing === 'side' ? 'idle_front' : 'idle_' + c._facing);
    };

    // Defensive one-shots release their pose when finished. An interrupted
    // action must never reset a newer run, throw or pitcher delivery.
    const recoverActions = new Set(['catch_fly', 'field_grounder', 'field_bounce',
        'stretch_catch', 'receive_at_bag', 'throw', 'throw_relay', 'tag', 'dive',
        'receive', 'block', 'tag_home', 'rise_throw']);
    spr.on('animationcomplete', anim => {
        if (!c.active || c._busy || anim.key !== c._animKey || !recoverActions.has(c._anim)) return;
        if (scene._playerMotion && scene._playerMotion.moves.has(c)) {
            const move = scene._playerMotion.moves.get(c);
            if (move.gait === 'walk') c.walkAnim(); else c.runAnim();
        }
        else c.idleAnim();
    });

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
            if (anim.key === relKey && frame.index === BB2_SHEETS['pitcher-actions'].anims.release.contactFrame + 1 && c._onRelease) {
                const fn = c._onRelease;
                c._onRelease = null;
                fn();
            }
        });
        spr.on('animationcomplete', (anim) => {
            if (!c._busy) return;
            const base = texFor['pitcher-actions'] + '|';
            if (anim.key === base + 'windup') {
                c.setAnim('release', true);
            } else if (anim.key === base + 'release') {
                c.setAnim('follow_through', true);
            } else if (anim.key === base + 'follow_through') {
                c._busy = false;
                const move = scene._playerMotion && scene._playerMotion.moves.get(c);
                if (move) { if (move.gait === 'walk') c.walkAnim(); else c.runAnim(); }
                else c.setAnim('fielding_stance');
                if (c._onPitchDone) { const fn = c._onPitchDone; c._onPitchDone = null; fn(); }
            }
        });

        c.playPitch = (onRelease, onDone) => {
            if (c._busy) return c;
            spr.setFlipX(false);
            c._busy = true;
            c._onRelease = onRelease || null;
            c._onPitchDone = onDone || null;
            c.setAnim('windup', true);
            return c;
        };
        // Derive release timing from the baked delivery, not a fixed timeout.
        const delivery = BB2_SHEETS['pitcher-actions'].anims;
        c.releaseDelayMs = Math.round((delivery.windup.count / delivery.windup.rate + delivery.release.contactFrame / delivery.release.rate) * 1000);
    }

    c.idleAnim();
    return c;
}
