// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND — Constants & Configuration
// Spinning-wheel See 'n Say. Pick a category, spin the wheel, hear the panel.
// ═══════════════════════════════════════════════════════════════════════════════

// Canvas size (same virtual resolution as Football / Baseball 2)
const W = 1000, H = 600;

// ─── Wheel geometry ───────────────────────────────────────────────────────────
// The pointer is fixed at 12 o'clock. In Phaser's screen space (+y down),
// 12 o'clock is -PI/2.
// Layout budget, top to bottom:
//   header strip   0..66
//   pointer        71..119   (its tip bites 22px into the rim)
//   wheel rim      97..527
//   button row     537..583
// The pointer is the easy thing to forget: it lives ABOVE the wheel, so the
// wheel's own top edge is not the top of what has to fit. Raising RIM without
// redoing this budget is what pushed the pointer into the header text.
const HEADER_H = 66;
const WHEEL = {
    CX: W / 2,
    CY: 312,
    R: 201,

    // Where a panel image sits, as a fraction of R, and how much room it gets.
    // Pushed outward and enlarged for a chunkier, more kid-readable wheel: the
    // tangential room a sector gives grows with radius, so sitting the art
    // further out is what buys size at high panel counts.
    IMG_RADIUS: 0.70,      // anchor distance from hub
    IMG_RADIAL: 0.50,      // usable radial depth
    IMG_FILL: 0.88,        // margin inside the sector; a square in a wedge needs it
    IMG_MIN: 0.10,         // clamp: never smaller than this fraction of R
    IMG_MAX: 0.42,         // clamp: never larger (stops 2-panel wheels looking absurd)

    // Fraction of the art box an emoji's INK should fill. Slightly under 1 so
    // a square glyph still sits inside a wedge, whose corners cut in.
    EMOJI_FIT: 0.92,

    HUB_R: 0.15,           // centre hub, fraction of R
    RIM: 14,               // rim thickness in px

    // Every wedge is outlined, not just separated by a hairline. Without this
    // neighbouring panels bleed into each other — especially in fill mode where
    // two photographs meet with nothing between them.
    BORDER: 0.020,         // fraction of R; clamped below
    BORDER_MIN: 2,
    BORDER_MAX: 5,
    BORDER_COLOR: '#fff6da',

    POINTER: -Math.PI / 2  // 12 o'clock
};

// ─── Panel count limits ───────────────────────────────────────────────────────
// Hard cap at 20: at n=20 each sector is 18 degrees and an image lands around
// 46px on a 1000x600 canvas, which is the floor of usable for low vision.
// Categories with more panels than this are randomly sampled per visit, so a
// big category stays playable and varies between plays.
const PANEL_MIN = 2;
const PANEL_MAX = 20;
const PANEL_WARN = 12;     // the editor warns above this

// ─── Spin tuning ──────────────────────────────────────────────────────────────
const SPIN = {
    MS: 3800,              // default duration; a category can override via spinMs
    SPINS_MIN: 4,          // full rotations before landing
    SPINS_MAX: 6,
    JITTER: 0.7,           // land off-centre by up to +/- (theta * JITTER / 2)
    EASE: 'Cubic.easeOut',
    TICK_MIN_MS: 45,       // rate-limit ticks so the fast opening doesn't machine-gun
    SETTLE_MS: 260,        // little bounce after the tween lands
    EARLY_STOP_MS: 700     // wrap-up duration when press-to-stop cuts a spin short
};

// ─── Reveal (the centre-pop) ──────────────────────────────────────────────────
// On landing the winning image tweens out to screen centre at REVEAL_SCALE * R.
// Reading a 46px image inside a thin sector is hard; a large centred one is not.
// This is the single highest-value accessibility behaviour in the game.
const REVEAL = {
    MS: 420,
    SIZE: 1.05,            // fraction of R for the revealed image's max dimension
    DIM: 0.80,             // how far to dim the wheel behind it
    CARD_Y: 310            // centre of the reveal card; it sizes itself to fit
};

// ─── Category carousel ─────────────────────────────────────────────────────────
// The "pick a category" screen: one focused card per category, sliding through
// ALL of that category's own pictures (shuffled) while parked on it.
const CAROUSEL = {
    SLIDE_MS: 3600,          // how long a picture sits before sliding to the next
    TRANSITION_MS: 550,      // slide-transition duration
    SOUND_CHANCE: 0.45,      // odds a freshly-shown picture ALSO offers to play its sound
    SOUND_COOLDOWN_MS: 8000, // minimum gap between two preview sounds, so they never overlap
    EMOJI_SIZE: 190          // font size for an emoji shown on a card
};

// ─── The scannable button row ─────────────────────────────────────────────────
// Spin / New Game / Main Menu, sitting under the wheel. Spin is FIRST because
// ScanList starts at index -1 and the first press lands on index 0 — putting
// the most-used action there means one press reaches it, and because the
// highlight is left where it was after a reveal, repeat spins cost a single
// Enter. Reordering is a one-line change in scenes.js if that's not wanted.
const BUTTONS = {
    Y: 560,
    W: 236,
    H: 46,
    GAP: 14
};

// Pause is deliberately NOT part of the scan row: it is a caregiver control,
// not one of Ben's three choices. It sits in the bottom-left corner and is
// reachable by mouse/touch (or Escape), leaving the scan cycle at three items.
// Shape follows the hub convention (Matchy Match's circular corner button,
// Baseball2's icon-only two-bar pause emblem) rather than a labelled pill.
const PAUSE_BTN = { X: 62, Y: 560, R: 34 };

// ─── Colour palettes ──────────────────────────────────────────────────────────
// Contributors pick one of these per category, or build a custom list in the
// editor. Palettes cycle around the wheel; adjacent sectors always differ.
const PALETTES = {
    'Bright':      ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#8e44ad', '#f1c40f'],
    'High Contrast': ['#000000', '#ffffff', '#ffd400', '#0057b8'],
    'Warm':        ['#c1121f', '#e85d04', '#faa307', '#dc2f02', '#9d0208'],
    'Cool':        ['#023e8a', '#0077b6', '#0096c7', '#48cae4', '#90e0ef'],
    'Pastel':      ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#bdb2ff'],
    'Forest':      ['#1b4332', '#2d6a4f', '#40916c', '#52b788', '#74c69d'],
    'Candy':       ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff'],
    'Mono Dark':   ['#212529', '#343a40', '#495057', '#6c757d']
};
const DEFAULT_PALETTE = 'Bright';

// Background / chrome colours.
// Deep background on purpose — it keeps contrast high for low vision — but the
// chrome on top of it is bright and rounded so the whole thing reads playful
// rather than clinical.
const THEME = {
    BG: '#1b1440',
    BG_HEX: 0x1b1440,
    BG_GLOW: 0x3a2a80,     // soft radial wash behind the wheel
    HUB: 0x2a2160,
    RIM: 0xffd54a,
    RIM_INNER: 0xff8fab,
    POINTER: 0xffd54a,
    POINTER_EDGE: 0x2b2450,
    TEXT: '#ffffff',
    TITLE: '#ffe066',

    // Candy button palette (see FunScanList in ui.js)
    BTN_FILL: 0x3b2f7a,
    BTN_EDGE: 0x6f5fd0,
    BTN_TEXT: '#ffffff',
    BTN_SEL_FILL: 0xffd54a,
    BTN_SEL_EDGE: 0xff8fab,
    BTN_SEL_TEXT: '#2b1a00'
};

// Confetti / sparkle colours for the landing celebration.
const PARTY = [0xff4d6d, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xb388ff, 0xff8fab, 0xfff275];

// Rounded, friendly type. Falls back through the widest-installed rounded faces
// before landing on Verdana, which is still soft-edged and very legible.
const FONT_FUN = '"Arial Rounded MT Bold","Nunito","Comic Sans MS",Verdana,Arial,sans-serif';

// ─── localStorage keys ────────────────────────────────────────────────────────
// Panel art mode ('fit' vs 'fill') USED to live here as a global player
// setting — it's now a per-category property saved in the pack itself
// (category.fill, authored in the editor), since whether Fill mode looks
// right depends on whether that category's art was actually framed for
// cropping, which is a per-pack authoring decision, not a player preference.
const LS_AUDIO    = 'shownsound_audio';
const LS_SETTINGS = 'shownsound_settings';
const LS_REGISTRY = 'shownsound_local_registry';
const LS_PACK     = 'shownsound_pack_';      // + filename
const LS_ASSET    = 'shownsound_asset_';     // + filename

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** '#rrggbb' -> 0xrrggbb. Tolerates missing '#' and 3-digit shorthand. */
function cssToHex(css) {
    if (typeof css !== 'string') return 0x888888;
    let s = css.trim().replace(/^#/, '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16);
    return Number.isFinite(n) ? n : 0x888888;
}

/** Relative luminance (WCAG) of a '#rrggbb' string, 0..1. */
function luminance(css) {
    const hex = cssToHex(css);
    const chan = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const r = chan((hex >> 16) & 0xff);
    const g = chan((hex >> 8) & 0xff);
    const b = chan(hex & 0xff);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two css colours, 1..21. */
function contrastRatio(a, b) {
    const la = luminance(a), lb = luminance(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
}

/** Pick black or white text for legibility on the given background. */
function textOn(bgCss) {
    return luminance(bgCss) > 0.42 ? '#101010' : '#ffffff';
}

/** Normalise an angle to [0, 2*PI). */
function norm2pi(a) {
    const t = Math.PI * 2;
    return ((a % t) + t) % t;
}

/** Fisher-Yates, returns a new array. */
function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
