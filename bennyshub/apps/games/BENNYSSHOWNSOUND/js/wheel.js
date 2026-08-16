// ═══════════════════════════════════════════════════════════════════════════════
// BENNY'S SHOW N SOUND — Wheel geometry and spin
//
// WheelGeom is PURE — no Phaser, no DOM. The editor's live preview draws with
// canvas 2D using these exact functions, so the preview cannot drift from the
// game. If you change the layout, change it here and both follow.
//
// The pointer is fixed at 12 o'clock (WHEEL.POINTER = -PI/2). Sector i occupies
// wheel-local angles [i*theta, (i+1)*theta); rotating the wheel by phi puts
// sector i's midpoint at world angle mid_i + phi.
// ═══════════════════════════════════════════════════════════════════════════════

window.WheelGeom = (function () {
    'use strict';

    /** Angular width of one sector, radians. */
    function sectorAngle(n) {
        return (Math.PI * 2) / Math.max(1, n);
    }

    /** Wheel-local angle of sector i's midpoint. */
    function sectorMid(i, n) {
        return (i + 0.5) * sectorAngle(n);
    }

    /**
     * How big a panel image may be, in px.
     *
     *   theta = 2*PI / n                       sector angle
     *   w     = 2 * r_img * sin(theta/2)       tangential room at the anchor
     *   d     = IMG_RADIAL * R                 radial room
     *   size  = clamp(min(w,d) * FILL, MIN*R, MAX*R)
     *
     * The clamp is what makes dynamic panel counts work: a 2-panel wheel does
     * not get a comically huge image, and a 20-panel wheel does not get an
     * invisible one.
     */
    function imageSize(n, R) {
        const theta = sectorAngle(n);
        const rImg = WHEEL.IMG_RADIUS * R;   // where the art is centred
        const half = theta / 2;

        // A square centred at radius rImg and aligned to the wedge midline is
        // pinched at its INNER corners, because the wedge narrows towards the
        // hub. Sizing from the chord at rImg (the obvious thing, and what this
        // did originally) lets those corners cross the divider into the next
        // panel. The binding constraint is the inner edge:
        //
        //   a point at radial d, tangential t is inside iff |t| <= d*tan(half)
        //   worst corner: d = rImg - s/2, t = s/2
        //   => s/2 <= (rImg - s/2)*tan(half)
        //   => s   <= 2*rImg*tan(half) / (1 + tan(half))
        //
        // tan blows up as the wedge approaches a half-circle, which is correct:
        // at that point the radial limits below take over.
        const t = Math.tan(Math.min(half, Math.PI / 2 - 1e-6));
        const tangential = (2 * rImg * t) / (1 + t);

        // Stay inside the rim, and off the hub cap.
        const outer = 2 * (R - WHEEL.RIM - rImg);
        const inner = 2 * (rImg - WHEEL.HUB_R * R);

        const raw = Math.min(tangential, outer, inner, WHEEL.IMG_RADIAL * R) * WHEEL.IMG_FILL;
        return Math.max(WHEEL.IMG_MIN * R, Math.min(WHEEL.IMG_MAX * R, raw));
    }

    /**
     * Where sector i's artwork sits, relative to the wheel centre, and how it
     * must be rotated.
     *
     * Rotating the art by (mid + PI/2) means that when the wheel brings that
     * sector to the pointer, the art's world rotation resolves to 0 — upright
     * at the pointer, which is the whole point for a low-vision player.
     */
    function anchor(i, n, R) {
        const mid = sectorMid(i, n);
        const r = WHEEL.IMG_RADIUS * R;
        return {
            x: Math.cos(mid) * r,
            y: Math.sin(mid) * r,
            rot: mid + Math.PI / 2,
            mid: mid
        };
    }

    /**
     * Which palette colour sector i gets. Cycles, but fixes the wrap-around
     * collision so the last sector never matches the first.
     *
     * Known limit: a 2-colour palette on an odd panel count cannot avoid one
     * adjacent repeat. The editor's contrast guard warns about that case.
     */
    function paletteIndex(i, n, len) {
        if (len < 2) return 0;
        let idx = i % len;
        if (i === n - 1 && n > 2) {
            const first = 0;
            const prev = (n - 2) % len;
            if (idx === first || idx === prev) {
                for (let k = 0; k < len; k++) {
                    if (k !== first && k !== prev) { idx = k; break; }
                }
            }
        }
        return idx;
    }

    /** Which sector is under the pointer at wheel rotation phi. */
    function sectorAtPointer(phi, n) {
        const theta = sectorAngle(n);
        // We want the i where norm(mid_i + phi - POINTER) is smallest, which
        // reduces to a direct index computation.
        const a = norm2pi(WHEEL.POINTER - phi);
        return Math.floor(a / theta) % n;
    }

    /**
     * Draw the wheel face — sectors, dividers, rim, hub — into a canvas 2D
     * context, centred on (0,0) in the context's current transform.
     *
     * Canvas 2D rather than Phaser Graphics on purpose: Phaser's WebGL Graphics
     * fills have hard, unantialiased polygon edges, which is what makes a
     * radial shape like this look jagged and cheap. Canvas 2D antialiases arcs
     * properly, so we draw once at supersampled resolution and hand the result
     * to the GPU as a texture.
     *
     * It is also the same function the editor's live preview calls, so the
     * preview cannot drift from the game.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} cfg { n, R, palette, rim, hubR }
     */
    function drawFace(ctx, cfg) {
        const n = Math.max(1, cfg.n);
        const R = cfg.R;
        const palette = (cfg.palette && cfg.palette.length) ? cfg.palette : ['#888888'];
        const rim = cfg.rim != null ? cfg.rim : WHEEL.RIM;
        const hubR = (cfg.hubR != null ? cfg.hubR : WHEEL.HUB_R) * R;
        const theta = sectorAngle(n);

        // Sectors. In FILL mode each wedge also gets its artwork drawn edge to
        // edge and clipped to the wedge, so the slice itself becomes the
        // picture rather than holding a small icon.
        for (let i = 0; i < n; i++) {
            const a0 = i * theta, a1 = (i + 1) * theta;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, R, a0, a1, false);
            ctx.closePath();
            ctx.clip();

            ctx.fillStyle = palette[paletteIndex(i, n, palette.length)];
            ctx.fill();

            const art = cfg.fill && cfg.art ? cfg.art[i] : null;
            if (art && (art.src || art.emoji)) {
                const mid = (a0 + a1) / 2;
                // Cover the wedge's widest chord by its full radial depth. The
                // clip does the shaping, so overspill is free.
                const boxW = 2 * R * Math.sin(theta / 2);
                const boxH = R;
                ctx.translate(Math.cos(mid) * R * 0.55, Math.sin(mid) * R * 0.55);
                ctx.rotate(mid + Math.PI / 2);
                if (art.src) drawCover(ctx, art.src, boxW, boxH, art.art);
                else drawEmojiInBox(ctx, art.emoji, 0, 0, Math.max(boxW, boxH) * 0.92, art.art);
            }
            ctx.restore();
        }

        // Outline each wedge fully — both straight edges AND the arc — rather
        // than drawing a single hairline between them. Stroked outside the clip
        // so the full width shows (a stroke inside a clip loses half of itself).
        if (n > 1) {
            let bw = Math.min(WHEEL.BORDER_MAX,
                     Math.max(WHEEL.BORDER_MIN, R * WHEEL.BORDER));
            if (n > 14) bw *= 0.7;      // thin wedges cannot spare the width
            ctx.strokeStyle = cfg.borderColor || WHEEL.BORDER_COLOR;
            ctx.lineWidth = bw;
            ctx.lineJoin = 'round';
            for (let i = 0; i < n; i++) {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, R - bw / 2, i * theta, (i + 1) * theta, false);
                ctx.closePath();
                ctx.stroke();
            }
        }

        // Chunky double rim — a fat gold band with a pink inner keyline. Reads
        // like a toy rather than a chart.
        ctx.beginPath();
        ctx.arc(0, 0, R + rim / 2, 0, Math.PI * 2);
        ctx.strokeStyle = cfg.rimColor || '#ffd54a';
        ctx.lineWidth = rim;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, R - rim * 0.18, 0, Math.PI * 2);
        ctx.strokeStyle = cfg.rimInner || '#ff8fab';
        ctx.lineWidth = Math.max(2, rim * 0.34);
        ctx.stroke();

        // Evenly spaced studs around the rim, like a fairground wheel.
        const studs = Math.min(24, Math.max(8, n * 2));
        for (let i = 0; i < studs; i++) {
            const a = (i / studs) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * (R + rim / 2), Math.sin(a) * (R + rim / 2),
                    Math.max(1.5, rim * 0.17), 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fill();
        }

        // Hub: a glossy cap rather than a flat disc.
        ctx.beginPath();
        ctx.arc(0, 0, hubR, 0, Math.PI * 2);
        ctx.fillStyle = cfg.hubColor || '#2a2160';
        ctx.fill();
        ctx.strokeStyle = cfg.rimColor || '#ffd54a';
        ctx.lineWidth = Math.max(3, R * 0.026);
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(-hubR * 0.26, -hubR * 0.34, hubR * 0.34, hubR * 0.22,
                    -0.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.34)';
        ctx.fill();
    }

    /**
     * Draw an image centred on the current origin, scaled to COVER a w x h box
     * — the canvas equivalent of CSS `object-fit: cover`. Aspect ratio is kept
     * and the overflow is cropped, which is what makes a wedge read as a solid
     * picture instead of a letterboxed thumbnail.
     */
    function drawCover(ctx, img, w, h, art) {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) return;

        const zoom = (art && art.zoom > 0) ? art.zoom : 1;
        const s = Math.max(w / iw, h / ih) * zoom;
        const dw = iw * s, dh = ih * s;

        // Focal point, 0..1 across the SOURCE image: which part of the picture
        // should land in the middle of the wedge. Unclamped on purpose — one of
        // the two axes almost always exactly covers the box with zero slack
        // (that's what "cover" means), so clamping to keep every edge hidden
        // used to pin that axis dead centre no matter how far you dragged. Any
        // gap this reveals is filled by the palette colour already painted
        // behind it, the same as the letterboxing a sub-1x zoom produces.
        let fx = (art && typeof art.x === 'number') ? art.x : 0.5;
        let fy = (art && typeof art.y === 'number') ? art.y : 0.5;
        fx = Math.min(1, Math.max(0, fx));
        fy = Math.min(1, Math.max(0, fy));

        // Optional extra tilt on TOP of the wedge's own base rotation — for a
        // picture that's sideways, or just for effect. Stored in DEGREES
        // (readable in an exported pack), converted to radians here. Rotating
        // the context around the box's local origin before drawing turns the
        // whole already-scaled-and-positioned image in place, so it composes
        // cleanly with pan/zoom rather than fighting them.
        const rot = (art && typeof art.rot === 'number') ? art.rot * Math.PI / 180 : 0;
        if (rot) {
            ctx.save();
            ctx.rotate(rot);
            ctx.drawImage(img, -fx * dw, -fy * dh, dw, dh);
            ctx.restore();
        } else {
            ctx.drawImage(img, -fx * dw, -fy * dh, dw, dh);
        }
    }

    return {
        sectorAngle, sectorMid, imageSize, anchor, paletteIndex, sectorAtPointer,
        drawFace, drawCover
    };
})();


// ═══════════════════════════════════════════════════════════════════════════════
// Emoji helper
//
// Emoji are a first-class panel type: a pack can say `"emoji": "🦁"` instead of
// carrying a picture. That keeps packs tiny, stays perfectly crisp at any size,
// and gives the whole game the cartoony look it wants without sourcing art.
// The font stack falls through the platform colour-emoji fonts.
// ═══════════════════════════════════════════════════════════════════════════════

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",'
                 + '"Twemoji Mozilla","EmojiOne Color",sans-serif';

const _emojiMetricCache = new Map();
let _emojiMeasureCtx = null;

/**
 * Measure a glyph's actual INK box, not its layout box.
 *
 * These differ a lot for emoji: at 100px, Segoe UI Emoji reports an advance
 * width of ~138 but only paints ~101 of it, and the paint extends above the
 * font's nominal ascent. Sizing from the advance (or from fontSize alone) is
 * what makes emoji spill out of their wedge and get clipped.
 */
function measureEmoji(glyph) {
    if (_emojiMetricCache.has(glyph)) return _emojiMetricCache.get(glyph);

    const REF = 100;
    if (!_emojiMeasureCtx) {
        _emojiMeasureCtx = document.createElement('canvas').getContext('2d');
    }
    const ctx = _emojiMeasureCtx;
    ctx.font = REF + 'px ' + EMOJI_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const m = ctx.measureText(glyph);
    let left = m.actualBoundingBoxLeft, right = m.actualBoundingBoxRight;
    let asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;

    // Older engines omit the actualBoundingBox* family; fall back to a square
    // roughly matching typical emoji proportions.
    if (![left, right, asc, desc].every(v => typeof v === 'number' && isFinite(v))) {
        left = 0; right = REF; asc = REF * 0.85; desc = REF * 0.15;
    }

    const info = {
        ref: REF,
        inkW: Math.max(1, right + left),
        inkH: Math.max(1, asc + desc),
        left, right, asc, desc
    };
    _emojiMetricCache.set(glyph, info);
    return info;
}

/**
 * Draw a glyph scaled and centred so its ink exactly fits a box×box square
 * centred on (cx, cy). Pure canvas 2D — shared by the game's texture builder
 * and the editor's live preview so the two cannot disagree.
 *
 * `art` is optional per-panel framing ({ x, y, zoom }) — only the fill-mode
 * wedge call site passes it (the Fit-mode texture builder never does, and
 * always wants a plain centred glyph). There's no cropping to do for a single
 * glyph, but the contributor can still want it shifted off-centre within the
 * wedge the same way a picture can be panned, so `x`/`y` translate it same
 * 0..1-around-0.5 convention as an image's focal point — 0.5 is centred,
 * unclamped in either direction like the image case.
 */
function drawEmojiInBox(ctx, glyph, cx, cy, box, art) {
    const zoom = (art && art.zoom > 0) ? art.zoom : 1;
    const fx = (art && typeof art.x === 'number') ? art.x : 0.5;
    const fy = (art && typeof art.y === 'number') ? art.y : 0.5;
    const m = measureEmoji(glyph);
    const fit = box * WHEEL.EMOJI_FIT * zoom;
    const size = m.ref * (fit / Math.max(m.inkW, m.inkH));

    ctx.save();
    ctx.font = size + 'px ' + EMOJI_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const k = size / m.ref;
    const offX = (fx - 0.5) * box;
    const offY = (fy - 0.5) * box;
    // Place the pen so the INK box lands centred (plus the focal offset),
    // not the advance box.
    const dx = cx + offX - ((m.right - m.left) * k) / 2;
    const dy = cy + offY + ((m.asc - m.desc) * k) / 2;

    const rot = (art && typeof art.rot === 'number') ? art.rot * Math.PI / 180 : 0;
    if (rot) {
        // Spin in place around the glyph's own centre, not the box's —
        // rotating around (0,0) would swing an off-centre glyph in an orbit.
        ctx.translate(cx + offX, cy + offY);
        ctx.rotate(rot);
        ctx.translate(-(cx + offX), -(cy + offY));
    }
    ctx.fillText(glyph, dx, dy);
    ctx.restore();
}

/**
 * An emoji as a display object sized to exactly `boxPx`.
 *
 * Rendered into a canvas texture rather than returned as a Phaser Text: Text
 * sizes its backing canvas from font metrics that emoji routinely paint
 * outside, which clipped glyphs along a hard rectangular edge. Owning the
 * canvas means the glyph is measured, fitted and centred deterministically.
 *
 * @param {number} boxPx  the size the glyph's ink should occupy
 */
function makeEmoji(scene, x, y, glyph, boxPx) {
    const box = Math.max(8, Math.round(boxPx));
    const ss = Phaser.Math.Clamp(Math.ceil(window.__GAME_ZOOM || 2), 2, 4);
    // Slack around the square so antialiasing at the ink edges is never cut.
    const pad = Math.ceil(box * 0.10);
    const total = box + pad * 2;

    const key = 'ss_emoji_' + Array.from(glyph).map(c => c.codePointAt(0).toString(16)).join('-')
              + '_' + box + '_' + ss;

    if (!scene.textures.exists(key)) {
        const tex = scene.textures.createCanvas(key, total * ss, total * ss);
        const ctx = tex.getContext();
        ctx.save();
        ctx.scale(ss, ss);
        drawEmojiInBox(ctx, glyph, total / 2, total / 2, box);
        ctx.restore();
        tex.refresh();
    }

    const img = scene.add.image(x, y, key);
    img.setDisplaySize(total, total);
    img._baseScale = img.scaleX;     // the reveal animates relative to this
    return img;
}


// ═══════════════════════════════════════════════════════════════════════════════
// Wheel — builds the sectors once into a container, then rotates the container.
// Never redraws per frame; a 20-sector redraw at 60fps is wasted budget.
// ═══════════════════════════════════════════════════════════════════════════════

class Wheel {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} cfg  { x, y, radius, panels, palette, audio,
     *                        textureKeys: (i)=>string|null }
     */
    constructor(scene, cfg) {
        this.scene = scene;
        this.audio = cfg.audio;
        this.panels = cfg.panels;
        this.palette = (cfg.palette && cfg.palette.length >= 2)
            ? cfg.palette
            : PALETTES[DEFAULT_PALETTE];
        this.x = cfg.x != null ? cfg.x : WHEEL.CX;
        this.y = cfg.y != null ? cfg.y : WHEEL.CY;
        this.R = cfg.radius != null ? cfg.radius : WHEEL.R;
        this.textureKeys = cfg.textureKeys || (() => null);

        // 'fill' bakes each panel's art across its whole wedge, clipped to the
        // wedge; the default 'fit' places a sized icon inside it.
        this.fill = !!cfg.fill;
        this.n = this.panels.length;
        this.theta = WheelGeom.sectorAngle(this.n);
        this.spinning = false;
        this.lastWinner = -1;

        this.container = scene.add.container(this.x, this.y).setDepth(10);
        this.arts = [];        // one display object per sector (image or text)

        this._buildFace();
        this._buildArt();
        this._buildPointer();
    }

    // ─── Build ───────────────────────────────────────────────────────────────

    /**
     * Render the face once into a supersampled canvas texture and add it as a
     * single Image. Two wins over drawing with Phaser Graphics: canvas 2D
     * antialiases the arcs (Graphics does not, which is what made the edges
     * look jagged), and the whole face becomes one quad instead of N filled
     * polygons re-uploaded on every rotation.
     */
    /**
     * Collect the source bitmap (or emoji) for each panel, for FILL mode.
     * Uses the full-resolution original rather than the wheel-sized resample,
     * because here the art is drawn to cover a whole wedge.
     */
    _artSources() {
        return this.panels.map(p => {
            if (p.emoji) return { emoji: p.emoji, art: p.art };
            const key = p._textureKey;
            if (key && this.scene.textures.exists(key)) {
                return { src: this.scene.textures.get(key).getSourceImage(), art: p.art };
            }
            return null;
        });
    }

    _buildFace() {
        const pad = WHEEL.RIM;
        const world = (this.R + pad) * 2;

        // Match the texture's pixel density to the canvas backing store so a
        // texel lands on roughly a device pixel — no blur, no wasted memory.
        const ss = Phaser.Math.Clamp(Math.ceil(window.__GAME_ZOOM || 2), 2, 4);
        const px = Math.ceil(world * ss);

        const art = this.fill ? this._artSources() : null;
        // In fill mode the artwork is baked into the face, so the cache key has
        // to include which art it was baked from, not just the shape.
        const sig = this.fill
            ? '_fill' + this.panels.map(p => {
                const a = p.art || {};
                return (p.emoji || p._textureKey || 'x')
                     + '@' + (a.x != null ? a.x : 0.5)
                     + ',' + (a.y != null ? a.y : 0.5)
                     + 'z' + (a.zoom != null ? a.zoom : 1);
              }).join('|')
            : '';
        this._faceKey = `ss_face_${this.n}_${ss}_${this.palette.join('')}${sig}`;

        if (!this.scene.textures.exists(this._faceKey)) {
            const tex = this.scene.textures.createCanvas(this._faceKey, px, px);
            const ctx = tex.getContext();
            ctx.save();
            ctx.scale(ss, ss);
            ctx.translate(this.R + pad, this.R + pad);
            WheelGeom.drawFace(ctx, {
                n: this.n,
                R: this.R,
                palette: this.palette,
                rim: WHEEL.RIM,
                rimColor: '#ffd54a',
                rimInner: '#ff8fab',
                hubColor: '#2a2160',
                fill: this.fill,
                art: art
            });
            ctx.restore();
            tex.refresh();
        }

        this.face = this.scene.add.image(0, 0, this._faceKey);
        this.face.setDisplaySize(world, world);
        this.container.add(this.face);
    }

    _buildArt() {
        // In fill mode the artwork is already painted into the face texture,
        // clipped to each wedge — there is nothing to place on top.
        if (this.fill) return;

        const size = WheelGeom.imageSize(this.n, this.R);

        this.panels.forEach((panel, i) => {
            const a = WheelGeom.anchor(i, this.n, this.R);
            const key = this.textureKeys(i);
            const swatch = this.palette[WheelGeom.paletteIndex(i, this.n, this.palette.length)];
            let obj;

            if (panel.emoji) {
                // Emoji panels render as text, not bitmaps — always crisp at any
                // size, and they keep packs tiny since there is no image data.
                obj = makeEmoji(this.scene, a.x, a.y, panel.emoji, size);
            } else if (key && this.scene.textures.exists(key)) {
                obj = this.scene.add.image(a.x, a.y, key);
                // Fit inside the box preserving aspect — setDisplaySize would
                // squash non-square art.
                const src = this.scene.textures.get(key).getSourceImage();
                const longest = Math.max(src.width || 1, src.height || 1);
                obj.setScale(size / longest);
            } else {
                // No picture (missing file, or a sound-only panel): show the
                // title so the sector is still identifiable.
                obj = this.scene.add.text(a.x, a.y, panel.title || '?', {
                    fontSize: Math.max(12, Math.round(size * 0.3)) + 'px',
                    fontFamily: 'Arial Rounded MT Bold, Verdana, Arial',
                    fontStyle: 'bold',
                    color: textOn(swatch),
                    align: 'center',
                    wordWrap: { width: size }
                }).setOrigin(0.5);
            }

            obj.setRotation(a.rot);
            this.arts.push(obj);
            this.container.add(obj);
        });
    }

    /**
     * The pointer lives OUTSIDE the container so it stays fixed at 12 o'clock
     * while everything else rotates underneath it. Drawn to a canvas texture
     * for the same antialiasing reason as the face.
     */
    _buildPointer() {
        const w = 34, h = 42, pad = 5;
        const ss = Phaser.Math.Clamp(Math.ceil(window.__GAME_ZOOM || 2), 2, 4);
        const key = 'ss_pointer2_' + ss;

        if (!this.scene.textures.exists(key)) {
            const tex = this.scene.textures.createCanvas(
                key, Math.ceil((w + pad * 2) * ss), Math.ceil((h + pad * 2) * ss));
            const ctx = tex.getContext();
            ctx.save();
            ctx.scale(ss, ss);
            ctx.translate(pad, pad);

            // Rounded teardrop rather than a hard triangle — friendlier shape.
            ctx.beginPath();
            ctx.moveTo(w / 2, h);                       // tip, into the rim
            ctx.quadraticCurveTo(0, h * 0.42, w * 0.14, h * 0.16);
            ctx.quadraticCurveTo(w / 2, -h * 0.10, w * 0.86, h * 0.16);
            ctx.quadraticCurveTo(w, h * 0.42, w / 2, h);
            ctx.closePath();
            ctx.fillStyle = '#ffd54a';
            ctx.fill();
            ctx.lineJoin = 'round';
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#2b2450';
            ctx.stroke();

            // Highlight blob so it reads as glossy plastic.
            ctx.beginPath();
            ctx.ellipse(w * 0.38, h * 0.28, w * 0.12, h * 0.10, -0.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.fill();
            ctx.restore();
            tex.refresh();
        }

        // Place by the TIP, then work backwards to the anchor. Positioning by
        // the centre (as this first did) makes the overhang above the wheel
        // depend on the pointer's height, which is how it ended up overlapping
        // the header when the rim got thicker.
        const dw = w + pad * 2, dh = h + pad * 2;
        const PIVOT = 0.15;                       // hinge near the top
        // Sits deep enough into the rim that its tail clears the header text
        // below the category title, which it used to overlap.
        const tipY = this.y - this.R - WHEEL.RIM + 30;
        this.pointer = this.scene.add.image(this.x, tipY - dh * (1 - PIVOT), key)
            .setDepth(12);
        this.pointer.setOrigin(0.5, PIVOT);
        this.pointer.setDisplaySize(dw, dh);
    }

    // ─── Spin ────────────────────────────────────────────────────────────────

    /**
     * Pick the winner FIRST, then compute the angle that lands on it.
     *
     * Do not spin with physics and read off where it stopped: floating-point
     * boundary cases put you between two sectors, and you lose all control over
     * fairness and the no-repeat rule.
     */
    _pickWinner() {
        if (this.n <= 2) return Math.floor(Math.random() * this.n);
        let i;
        do { i = Math.floor(Math.random() * this.n); } while (i === this.lastWinner);
        return i;
    }

    /**
     * @param {number} durationMs
     * @param {(index:number, panel:object)=>void} onDone
     */
    spin(durationMs, onDone) {
        if (this.spinning || this.n < 1) return false;
        this.spinning = true;

        // Little anticipation wind-up before it takes off — the wheel rocks
        // backwards, then launches. Costs 200ms and makes the spin feel alive.
        // The launch angle is computed AFTER this settles, so the winner-first
        // maths is unaffected by it.
        this.scene.tweens.add({
            targets: this.container,
            rotation: this.container.rotation - this.theta * 0.22,
            duration: 200,
            ease: 'Sine.easeOut',
            onComplete: () => this._launch(durationMs, onDone)
        });
        return true;
    }

    _launch(durationMs, onDone) {
        const target = this._pickWinner();
        const mid = WheelGeom.sectorMid(target, this.n);
        const from = this.container.rotation;

        // Rotation that puts this sector's midpoint under the pointer.
        const want = WHEEL.POINTER - mid;
        const base = norm2pi(want - from);

        // Land off-centre but comfortably inside: max |jitter| is theta*0.35,
        // against a half-sector of theta*0.5.
        const jitter = (Math.random() - 0.5) * this.theta * SPIN.JITTER;
        const spins = SPIN.SPINS_MIN
            + Math.floor(Math.random() * (SPIN.SPINS_MAX - SPIN.SPINS_MIN + 1));
        const delta = base + jitter + Math.PI * 2 * spins;

        if (this.audio) this.audio.play('whoosh');

        let lastSector = 0;
        let lastTickAt = 0;
        this._flick = 0;

        // Stashed so requestEarlyStop() can replace this tween with a quick
        // wrap-up to the SAME destination — press-to-stop only compresses the
        // wait, it never touches which sector wins.
        this._pendingTarget = target;
        this._pendingOnDone = onDone;
        this._pendingFinalRotation = from + delta;

        this._mainTween = this.scene.tweens.add({
            targets: this.container,
            rotation: from + delta,
            duration: durationMs || SPIN.MS,
            ease: SPIN.EASE,
            onUpdate: () => {
                const travelled = this.container.rotation - from;
                const s = Math.floor(travelled / this.theta);
                if (s !== lastSector) {
                    lastSector = s;
                    const now = this.scene.time.now;
                    // Rate-limit or the fast opening phase machine-guns.
                    if (now - lastTickAt >= SPIN.TICK_MIN_MS) {
                        lastTickAt = now;
                        if (this.audio) this.audio.play('tick');
                        this._flick = 1;      // kick the pointer
                    }
                }
                // The pointer behaves like a real flapper: knocked aside by each
                // peg, springing back between them. Driven by a decaying value
                // here rather than a tween per tick, which would pile up dozens
                // of overlapping tweens during the fast opening.
                if (this.pointer) {
                    this._flick *= 0.80;
                    this.pointer.rotation = -this._flick * 0.30;
                }
            },
            onComplete: () => {
                this._mainTween = null;
                if (this.pointer) this.pointer.rotation = 0;
                this._settle(() => {
                    this.spinning = false;
                    this.lastWinner = target;
                    if (onDone) onDone(target, this.panels[target]);
                });
            }
        });
    }

    /**
     * Press-to-stop: cut a long spin short. The winner and its final rotation
     * were already fixed at launch (see `_pickWinner` above) — this only
     * replaces the remaining wait with a quicker wrap-up to that same
     * destination, so it never changes which panel the wheel lands on.
     */
    requestEarlyStop() {
        if (!this.spinning || !this._mainTween) return;
        const tween = this._mainTween;
        this._mainTween = null;
        const finalRotation = this._pendingFinalRotation;
        const target = this._pendingTarget;
        const onDone = this._pendingOnDone;
        tween.stop();

        if (this.pointer) this.pointer.rotation = 0;
        this.scene.tweens.add({
            targets: this.container,
            rotation: finalRotation,
            duration: SPIN.EARLY_STOP_MS,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                this._settle(() => {
                    this.spinning = false;
                    this.lastWinner = target;
                    if (onDone) onDone(target, this.panels[target]);
                });
            }
        });
    }

    /** Small elastic settle so the stop reads as physical rather than abrupt. */
    _settle(done) {
        const r = this.container.rotation;
        this.scene.tweens.add({
            targets: this.container,
            rotation: r + this.theta * 0.06,
            duration: SPIN.SETTLE_MS * 0.4,
            ease: 'Sine.easeOut',
            yoyo: true,
            onComplete: () => { this.container.rotation = r; if (done) done(); }
        });
    }

    // ─── Queries ─────────────────────────────────────────────────────────────

    /** Screen-space position and current world rotation of sector i's art. */
    panelWorldPoint(i) {
        const a = WheelGeom.anchor(i, this.n, this.R);
        const phi = this.container.rotation;
        return {
            x: this.x + Math.cos(a.mid + phi) * WHEEL.IMG_RADIUS * this.R,
            y: this.y + Math.sin(a.mid + phi) * WHEEL.IMG_RADIUS * this.R,
            rot: a.rot + phi
        };
    }

    artSize() {
        return WheelGeom.imageSize(this.n, this.R);
    }

    setAlpha(a) {
        this.container.setAlpha(a);
        if (this.pointer) this.pointer.setAlpha(a);
        return this;
    }

    destroy() {
        this.scene.tweens.killTweensOf(this.container);
        this.arts.forEach(o => o.destroy());
        if (this.face) this.face.destroy();
        if (this.pointer) this.pointer.destroy();
        this.container.destroy();
        // Free the face texture — it is keyed per (panel count, palette), so
        // browsing many categories would otherwise accumulate large canvases.
        if (this._faceKey && this.scene.textures.exists(this._faceKey)) {
            this.scene.textures.remove(this._faceKey);
        }
    }
}
