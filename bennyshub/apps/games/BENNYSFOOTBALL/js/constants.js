// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S FOOTBALL - Constants & Configuration
// ═══════════════════════════════════════════════════════════════════════════════

// Canvas size
const W = 1000, H = 600;

// Field geometry (pixels). The playing field sits between the two goal lines.
const FIELD = {
    LEFT: 80,
    RIGHT: 920,
    TOP: 120,
    BOTTOM: 500,
    WIDTH: 840,
    HEIGHT: 380,
    END_ZONE: 70
};
FIELD.PLAY_W = FIELD.WIDTH - FIELD.END_ZONE * 2; // 700px = 100 yards
FIELD.GOAL_L = FIELD.LEFT + FIELD.END_ZONE;      // own goal line (0 yd, player drives right)
FIELD.GOAL_R = FIELD.RIGHT - FIELD.END_ZONE;     // opponent goal line (100 yd)
FIELD.MID_Y = (FIELD.TOP + FIELD.BOTTOM) / 2;

// Convert a yard line (0-100, 0 = own goal) to an x pixel.
function ydToX(yd) {
    return FIELD.GOAL_L + (yd / 100) * FIELD.PLAY_W;
}

// ─── Team colour palette (player chooses one, opponent gets a random other one) ───
// Each entry: hex (Phaser int), css string, name, and a lighter shade for shine.
const TEAM_COLORS = [
    { name: 'Red',    hex: 0xd32f2f, css: '#d32f2f', light: 0xff6659, lightCss: '#ff6659' },
    { name: 'Blue',   hex: 0x1565c0, css: '#1565c0', light: 0x5e92f3, lightCss: '#5e92f3' },
    { name: 'Green',  hex: 0x2e7d32, css: '#2e7d32', light: 0x60ad5e, lightCss: '#60ad5e' },
    { name: 'Gold',   hex: 0xf9a825, css: '#f9a825', light: 0xffd95a, lightCss: '#ffd95a' },
    { name: 'Purple', hex: 0x6a1b9a, css: '#6a1b9a', light: 0x9c4dcc, lightCss: '#9c4dcc' },
    { name: 'Orange', hex: 0xef6c00, css: '#ef6c00', light: 0xff9d3f, lightCss: '#ff9d3f' },
    { name: 'Teal',   hex: 0x00838f, css: '#00838f', light: 0x4fb3bf, lightCss: '#4fb3bf' },
    { name: 'Pink',   hex: 0xc2185b, css: '#c2185b', light: 0xfa5788, lightCss: '#fa5788' },
    { name: 'Navy',   hex: 0x283593, css: '#283593', light: 0x5f5fc4, lightCss: '#5f5fc4' },
    { name: 'Black',  hex: 0x37474f, css: '#37474f', light: 0x62727b, lightCss: '#62727b' }
];

function getColorByName(name) {
    return TEAM_COLORS.find(c => c.name === name) || TEAM_COLORS[0];
}

// ─── Play definitions the player can call on offense ───
// kind: how it resolves. base/variance feed the yardage / success maths.
const PLAYS = {
    INSIDE_RUN:  { id: 'INSIDE_RUN',  label: 'Inside Run',  kind: 'run',  base: 4,  variance: 4,  big: 0.10 },
    OUTSIDE_RUN: { id: 'OUTSIDE_RUN', label: 'Outside Run', kind: 'run',  base: 3,  variance: 8,  big: 0.18 },
    SHORT_PASS:  { id: 'SHORT_PASS',  label: 'Short Pass',  kind: 'pass', depth: 'short' },
    LONG_PASS:   { id: 'LONG_PASS',   label: 'Long Pass',   kind: 'pass', depth: 'long' },
    FIELD_GOAL:  { id: 'FIELD_GOAL',  label: 'Field Goal',  kind: 'fg' },
    PUNT:        { id: 'PUNT',        label: 'Punt',        kind: 'punt' }
};

// ─── Defensive plays the player calls when the opponent has the ball ───
// Each tilts the matchup: runMod/passMod adjust yards allowed vs a run/pass,
// sack is the chance to drop the QB for a loss (blitz risk/reward).
const DEF_PLAYS = {
    // runMod/passMod are added to the base yard gain — negative = fewer yards allowed.
    // Larger magnitudes make each call feel decisive: calling the wrong defense
    // vs the opponent's play type gives up noticeably more yards.
    STOP_RUN:  { id: 'STOP_RUN',  label: 'Stop the Run', runMod: -5.0, passMod: +4.0, sack: 0.07 },
    DEFEND_PASS:{ id: 'DEFEND_PASS', label: 'Defend Pass', runMod: +4.0, passMod: -5.0, sack: 0.04 },
    BLITZ:     { id: 'BLITZ',     label: 'Blitz',        runMod: +1.5, passMod: -2.0, sack: 0.30 },
    BALANCED:  { id: 'BALANCED',  label: 'Balanced D',   runMod: 0.0,  passMod: 0.0,  sack: 0.08 }
};

// ─── Season structure ───
const SEASON = {
    REGULAR_GAMES: 16,
    PLAYOFF_WIN_THRESHOLD: 10,   // 10+ wins -> playoffs
    PERFECT_WINS: 16,            // 16-0 -> straight to championship
    // Single-elimination playoff rounds (in order). Reaching past the last = champions.
    PLAYOFF_ROUNDS: ['WILD CARD', 'CONFERENCE', 'CHAMPIONSHIP']
};

// Per-quarter clock (seconds). Two minutes keeps scoring tight and every
// possession meaningful — fewer drives, more tension.
const QUARTER_SECONDS = 120;

// localStorage keys
const LS_SEASON     = 'bennyFootball_season';
const LS_AUDIO      = 'bennyFootball_audio';
const LS_GAME_STATE = 'bennyFootball_gameState';
const LS_EASY_THROW = 'bennyFootball_easyThrow';

// Returns true when the "no-charge" accessibility mode is enabled.
// When on, passing auto-throws at ideal power right after receiver selection,
// and field goals auto-kick at ideal power right after aim lock.
function easyThrowOn() {
    try { return localStorage.getItem(LS_EASY_THROW) === '1'; } catch(e) { return false; }
}
function setEasyThrow(on) {
    try { localStorage.setItem(LS_EASY_THROW, on ? '1' : '0'); } catch(e) {}
}

// ─── Shared helmet drawing helper ────────────────────────────────────────────
// Draws a SIDE-PROFILE football helmet onto a Phaser.Graphics object, facing
// right. cx,cy = center, r = radius (overall size), hexColor = shell color.
// The silhouette is built from an explicit point list (unit space scaled by r)
// so it reads clearly as a helmet at any size.
function _drawHelmet(g, cx, cy, r, hexColor) {
    const P = (ux, uy) => ({ x: cx + ux * r, y: cy + uy * r });

    const dark = (typeof Phaser !== 'undefined' && Phaser.Display && Phaser.Display.Color)
        ? Phaser.Display.Color.IntegerToColor(hexColor).darken(30).color
        : hexColor;

    // Side-profile shell outline (clockwise from back-top). Helmet faces RIGHT.
    // Rounded dome on top, sloping forehead on the front-right, a jaw/chin that
    // juts forward, then sweeps back under to a thick back edge.
    const shell = [
        [-0.78, -0.62],  // back of crown
        [-0.45, -0.86],  // crown rising
        [ 0.05, -0.98],  // top of dome
        [ 0.50, -0.86],  // dome -> forehead
        [ 0.82, -0.55],  // forehead
        [ 0.96, -0.18],  // brow (front-most upper)
        [ 0.92,  0.12],  // front edge down to face opening
        [ 0.70,  0.18],  // tuck in under brow (top of face opening)
        [ 0.66,  0.50],  // cheek
        [ 0.80,  0.72],  // jaw juts forward
        [ 0.60,  0.92],  // chin
        [ 0.10,  0.98],  // chin -> under jaw
        [-0.40,  0.90],  // under jaw back
        [-0.78,  0.62],  // back-bottom of shell
        [-0.92,  0.18],  // thick back edge
        [-0.92, -0.24]   // back edge up to crown
    ];
    const poly = (close) => {
        g.beginPath();
        g.moveTo(P(shell[0][0], shell[0][1]).x, P(shell[0][0], shell[0][1]).y);
        for (let i = 1; i < shell.length; i++) g.lineTo(P(shell[i][0], shell[i][1]).x, P(shell[i][0], shell[i][1]).y);
        if (close) g.closePath();
    };

    // ── Drop shadow ───────────────────────────────────────────────────────────
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(cx + r * 0.05, cy + r * 1.16, r * 2.0, r * 0.42);

    // ── Shell fill ──────────────────────────────────────────────────────────--
    g.fillStyle(hexColor, 1);
    poly(true); g.fillPath();

    // ── Lower jaw / chin guard (darker band) ──────────────────────────────────
    g.fillStyle(dark, 1);
    g.beginPath();
    g.moveTo(P(0.66, 0.50).x, P(0.66, 0.50).y);
    g.lineTo(P(0.80, 0.72).x, P(0.80, 0.72).y);
    g.lineTo(P(0.60, 0.92).x, P(0.60, 0.92).y);
    g.lineTo(P(0.10, 0.98).x, P(0.10, 0.98).y);
    g.lineTo(P(-0.40, 0.90).x, P(-0.40, 0.90).y);
    g.lineTo(P(-0.78, 0.62).x, P(-0.78, 0.62).y);
    g.lineTo(P(-0.55, 0.50).x, P(-0.55, 0.50).y);
    g.lineTo(P(0.30, 0.55).x, P(0.30, 0.55).y);
    g.closePath();
    g.fillPath();

    // ── Ear hole (round vent on the side) ─────────────────────────────────────
    g.fillStyle(dark, 1);
    g.fillCircle(cx - r * 0.18, cy + r * 0.20, r * 0.30);
    g.fillStyle(0x111111, 0.85);
    g.fillCircle(cx - r * 0.18, cy + r * 0.20, r * 0.13);

    // ── Crown highlight gleam ─────────────────────────────────────────────────
    g.fillStyle(0xffffff, 0.22);
    g.fillEllipse(cx - r * 0.05, cy - r * 0.58, r * 0.85, r * 0.30);

    // ── Face mask cage (front opening, projecting right) ──────────────────────
    const bar = Math.max(1.4, r * 0.09);
    g.lineStyle(bar, 0xeeeeee, 0.96);
    // Vertical front bar joining the brow tip to the jaw tip
    g.beginPath();
    g.moveTo(P(0.96, -0.10).x, P(0.96, -0.10).y);
    g.lineTo(P(0.92, 0.42).x, P(0.92, 0.42).y);
    g.lineTo(P(0.80, 0.72).x, P(0.80, 0.72).y);
    g.strokePath();
    // Upper bar (eye level)
    g.beginPath();
    g.moveTo(P(0.66, 0.16).x, P(0.66, 0.16).y);
    g.lineTo(P(0.95, 0.10).x, P(0.95, 0.10).y);
    g.strokePath();
    // Lower bar (mouth level)
    g.beginPath();
    g.moveTo(P(0.62, 0.46).x, P(0.62, 0.46).y);
    g.lineTo(P(0.90, 0.40).x, P(0.90, 0.40).y);
    g.strokePath();

    // ── Outline around the shell ──────────────────────────────────────────────
    g.lineStyle(Math.max(1, r * 0.06), 0x000000, 0.55);
    poly(true); g.strokePath();
}

// ─── Helmet sprite helpers ───────────────────────────────────────────────────
// PNG helmet artwork lives in ./images/<color>-helmet.png (238x200, transparent
// bg, faces RIGHT — matching the vector _drawHelmet fallback orientation).
const HELMET_ASPECT = 238 / 200; // width / height

function helmetTextureKey(colorName) {
    return 'helmet_' + String(colorName || '').toLowerCase();
}

// Queue all team helmet PNGs for loading. Call from a scene's preload().
function loadHelmets(scene) {
    TEAM_COLORS.forEach(c => {
        const key = helmetTextureKey(c.name);
        if (!scene.textures.exists(key)) {
            scene.load.image(key, 'images/' + c.name.toLowerCase() + '-helmet.png');
        }
    });
}

// Add a helmet sprite for the given team. `h` is the desired display HEIGHT.
// Falls back to the vector _drawHelmet if the texture isn't loaded.
// Returns the created GameObject (Image or Graphics).
function addHelmetSprite(scene, colorName, cx, cy, h, opts) {
    opts = opts || {};
    const key = helmetTextureKey(colorName);
    if (scene.textures.exists(key)) {
        const img = scene.add.image(cx, cy, key).setOrigin(0.5);
        img.setDisplaySize(h * HELMET_ASPECT, h);
        if (opts.flipX) img.setFlipX(true);
        if (opts.alpha != null) img.setAlpha(opts.alpha);
        if (opts.depth != null) img.setDepth(opts.depth);
        return img;
    }
    // Fallback: vector helmet sized to roughly match height h.
    const g = scene.add.graphics();
    if (opts.alpha != null) g.setAlpha(opts.alpha);
    if (opts.depth != null) g.setDepth(opts.depth);
    const col = getColorByName(colorName).hex;
    _drawHelmet(g, cx, cy, h / 2, col);
    return g;
}

// Player position archetypes (used for visual labels / receiver speeds)
const OFFENSE_SETUP = [
    { role: 'QB', label: 'QB' },
    { role: 'RB', label: 'RB' },
    { role: 'WR', label: 'WR' },
    { role: 'WR', label: 'WR' },
    { role: 'TE', label: 'TE' },
    { role: 'OL', label: 'OL' }
];

// Maps position abbreviations to full spoken names used by TTS.
function positionName(abbr) {
    const map = {
        QB: 'Quarterback', RB: 'Running Back', WR: 'Wide Receiver',
        TE: 'Tight End', OL: 'Lineman', DL: 'Defensive Lineman',
        LB: 'Linebacker', CB: 'Cornerback', S: 'Safety'
    };
    return map[abbr] || abbr;
}
