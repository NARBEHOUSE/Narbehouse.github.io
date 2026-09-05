/**
 * NARBE Animal Friends - the animal registry and the asset tier fallback.
 *
 * The rosters themselves live in zones.js, one per zone. This file is the view
 * onto whichever zone the player is in: everything below reads the CURRENT
 * zone's animals, so the game modes, the choice boards and the reveal need to
 * know nothing about zones at all.
 *
 * Everything about an animal lives in one registry entry. Nothing else in the
 * codebase knows an animal by name. Upgrading a whole zone to real art is
 * dropping PNGs into art/ and filling in that zone's `art` fields - if that ever
 * stops being true, the abstraction is broken and it is worth fixing before
 * adding features.
 *
 * Tier 0  emoji rendered to an offscreen canvas at the same pixel size the real
 *         PNG will be, so the plane, the alpha shadow and the layout are
 *         identical on day one and on shipping day.
 * Tier 1  ComfyUI PNGs.
 * Tier 2  reviewed PNGs plus recorded audio.
 */

window.NAF = window.NAF || {};

NAF.Animals = (function () {
    'use strict';

    /** The pixel size every animal texture is rendered at, real or placeholder. */
    const TEXTURE_SIZE = 512;

    /** The current zone's roster. Read through a function, never cached, so a
     *  zone change is picked up everywhere at once. */
    function list() {
        return NAF.Zones.current().animals;
    }

    /** Look an animal up in the current zone first, then anywhere. */
    function findById(id) {
        const here = list();
        for (let i = 0; i < here.length; i++) {
            if (here[i].id === id) return here[i];
        }
        // Progress saved in another zone still needs to resolve for the friend
        // board, so fall back to a search across every zone.
        const zones = NAF.Zones.list;
        for (let z = 0; z < zones.length; z++) {
            const roster = zones[z].animals;
            for (let i = 0; i < roster.length; i++) {
                if (roster[i].id === id) return roster[i];
            }
        }
        return null;
    }

    // --- emoji placeholder rendering -------------------------------------------

    const emojiCache = {};

    const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", ' +
        '"Twemoji Mozilla", "EmojiOne Color", sans-serif';

    /**
     * Render an emoji to a transparent canvas at TEXTURE_SIZE. Poses are
     * differentiated by framing so the three tier-0 poses are not identical.
     */
    function emojiCanvas(emoji, pose, size) {
        size = size || TEXTURE_SIZE;
        const key = emoji + '|' + pose + '|' + size;
        if (emojiCache[key]) return emojiCache[key];

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Same margin for every animal so a cow and a duck need no different geometry.
        let fontSize = Math.round(size * 0.72);
        let tilt = 0;
        let lift = 0;
        if (pose === 'call') { fontSize = Math.round(size * 0.78); lift = -size * 0.03; }
        if (pose === 'happy') { fontSize = Math.round(size * 0.76); tilt = -0.10; lift = -size * 0.04; }

        ctx.save();
        ctx.translate(size / 2, size / 2 + lift);
        ctx.rotate(tilt);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = fontSize + 'px ' + EMOJI_FONT;
        ctx.fillText(emoji, 0, 0);
        ctx.restore();

        emojiCache[key] = canvas;
        return canvas;
    }

    // --- drawn placeholders -----------------------------------------------------
    //
    // A few animals are drawn here rather than taken from the emoji font,
    // because the font's glyph for them is not recognisable enough to answer a
    // question with. The octopus is the case that forced it: Segoe UI Emoji
    // draws it as a smooth pink dome with the arms tucked underneath, which
    // reads as a cuttlefish - and being asked to pick the octopus out of a row
    // that also contains a squid makes that a real problem, not a cosmetic one.
    //
    // The same test rules out two more. The starfish's glyph is a plain yellow
    // five-pointed star, which is a symbol rather than an animal; and the orca
    // has no glyph at all - the nearest is a small blue cartoon whale, which is
    // a different animal sharing a tank with a Dolphin and a Big Whale.
    //
    // Same contract as emojiCanvas: a transparent square canvas at
    // TEXTURE_SIZE, animal centred, so nothing downstream can tell which of
    // the two drew it. Keyed by animal id, so adding another is one entry.

    const drawnCache = {};

    /** A tapered, curling limb: circles down a curve, shrinking as they go. */
    function limb(ctx, x0, y0, cx, cy, x1, y1, r0, r1) {
        for (let t = 0; t <= 1.0001; t += 0.04) {
            const mt = 1 - t;
            const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
            const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
            ctx.beginPath();
            ctx.arc(x, y, r0 + (r1 - r0) * t, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /** The outline of the sea star, traced into whichever context is given. */
    function starfishPath(c, S) {
        const cx = S * 0.5, cy = S * 0.53;
        const R = S * 0.465;               // centre to arm tip
        const VALLEY = S * 0.140;          // centre to the notch between arms
        const ROT = -Math.PI / 2 + 0.05;   // one arm up, tipped very slightly
        const STRETCH = 1.06;              // a touch wider than tall

        // Arm tips are not perfectly even on a real sea star, and a little
        // unevenness is what keeps this from reading as a geometric star.
        const LEN = [1.0, 0.965, 1.005, 0.95, 0.99];
        const SKEW = [0, 0.03, -0.025, 0.02, -0.015];

        function pt(ang, rad) {
            return [cx + Math.cos(ang) * rad * STRETCH, cy + Math.sin(ang) * rad];
        }

        // Each arm runs notch -> tip -> notch. The tip is rounded off by aiming
        // the curves at a pair of shoulder points just short of it and using the
        // tip itself only as a control point. The notches are left as corners: a
        // sea star's arms meet in a crease, and the heavy outline softens it.
        const step = (Math.PI * 2) / 5;
        const TIP_ROUND = step * 0.055;
        c.beginPath();
        for (let i = 0; i < 5; i++) {
            const mid = ROT + i * step + SKEW[i];
            const rad = R * LEN[i];
            const inA = pt(ROT + (i - 0.5) * step, VALLEY);
            const inB = pt(ROT + (i + 0.5) * step, VALLEY);
            const shA = pt(mid - TIP_ROUND, rad * 0.965);
            const shB = pt(mid + TIP_ROUND, rad * 0.965);
            const apex = pt(mid, rad * 1.03);
            // Pulled in towards the arm's own axis, which tapers the sides
            // instead of letting them bulge out into petals.
            const sideA = pt(mid - step * 0.275, rad * 0.55);
            const sideB = pt(mid + step * 0.275, rad * 0.55);

            if (i === 0) c.moveTo(inA[0], inA[1]);
            c.quadraticCurveTo(sideA[0], sideA[1], shA[0], shA[1]);
            c.quadraticCurveTo(apex[0], apex[1], shB[0], shB[1]);
            c.quadraticCurveTo(sideB[0], sideB[1], inB[0], inB[1]);
        }
        c.closePath();
    }

    /**
     * Where the tube-foot pores sit, as [x, y, radius] triples in FRACTIONS of
     * the animal's size - so the layout does not depend on the size being
     * drawn, and one run of this serves every size and all three poses.
     *
     * Keeping a pore off the thin edges of the arms needs an inside-the-body
     * test. That is done against a small alpha mask rather than with
     * isPointInPath: the path test costs the better part of a second for one
     * starfish, which is a visible stall in the middle of a reveal, while
     * reading a mask is free.
     *
     * The pores sit on a jittered grid rather than being scattered and
     * de-overlapped. A grid needs one test per pore instead of thousands of
     * rejected attempts, and the even spacing is what the real animal looks
     * like - scattering clumps some pores together and leaves bald patches.
     */
    let porePlan = null;
    function starfishPores() {
        if (porePlan) return porePlan;

        // Big enough that the thin arm tips are still several pixels across.
        const REF = 220;
        const mask = document.createElement('canvas');
        mask.width = REF;
        mask.height = REF;
        const mc = mask.getContext('2d');
        starfishPath(mc, REF);
        mc.fillStyle = '#fff';
        mc.fill();
        const alpha = mc.getImageData(0, 0, REF, REF).data;

        function solid(x, y) {
            const px = Math.round(x), py = Math.round(y);
            if (px < 0 || py < 0 || px >= REF || py >= REF) return false;
            return alpha[(py * REF + px) * 4 + 3] > 200;
        }
        // The whole ring, plus a margin for the outline, has to be on the body.
        function fits(x, y, r) {
            const pad = r + REF * 0.017;
            for (let k = 0; k < 8; k++) {
                const t = (k / 8) * Math.PI * 2;
                if (!solid(x + Math.cos(t) * pad, y + Math.sin(t) * pad)) return false;
            }
            return true;
        }

        // Jittered from a fixed seed, so every render gets the same starfish
        // rather than a freshly scattered one.
        let seed = 20260904;
        function rnd() {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        }

        const cx = REF * 0.5, cy = REF * 0.53, R = REF * 0.465;
        const GAP = REF * 0.042;
        const placed = [];
        for (let gy = GAP * 0.5; gy < REF; gy += GAP) {
            for (let gx = GAP * 0.5; gx < REF; gx += GAP) {
                const x = gx + (rnd() - 0.5) * GAP * 0.55;
                const y = gy + (rnd() - 0.5) * GAP * 0.55;
                // Big in the middle, small out at the tips.
                const d = Math.hypot((x - cx) / 1.06, y - cy);
                const near = 1 - Math.min(1, d / R);
                const r = REF * (0.0075 + 0.0075 * near);
                if (fits(x, y, r)) placed.push([x / REF, y / REF, r / REF]);
            }
        }

        porePlan = placed;
        return porePlan;
    }

    /**
     * Leave room for the pose transform, and apply it before drawing.
     *
     * drawnCanvas scales a pose up by as much as 1.06, tilts it, and lifts it -
     * which is fine for an emoji, because a glyph is drawn well inside its own
     * square. A drawing that uses the full width of the texture has no such
     * slack, and the enlarged pose has its extremities cut off by the edge of
     * the canvas: the starfish loses its arm tips and the orca loses its tail.
     *
     * So these two are drawn at 88% and centred, which is the largest that
     * still fits once the widest pose (tilted AND scaled AND lifted) has been
     * applied. Worked out from those transforms rather than guessed: at 0.88
     * the worst corner lands about 4% inside the edge.
     */
    const POSE_FIT = 0.88;
    function fitForPose(ctx, size) {
        ctx.translate(size / 2, size / 2);
        ctx.scale(POSE_FIT, POSE_FIT);
        ctx.translate(-size / 2, -size / 2);
    }

    const DRAWN = {
        /**
         * Eight arms, splayed and curling, under a tall domed head with big
         * eyes. The arms are the whole point - they are what a cuttlefish does
         * not have, so they are drawn long, separated, and clear of the body
         * rather than tucked under it.
         */
        octopus: function (ctx, size, pose) {
            const S = size;
            const BODY = '#a8479b', BODY_DK = '#7d3273', EDGE = '#4a1d45';
            const SUCKER = 'rgba(255,214,240,0.92)';

            const cx = S * 0.5;
            const headY = S * 0.37;
            const headRx = S * 0.225;
            const headRy = S * 0.245;
            // The mouth of the head, where every arm starts.
            const hubY = headY + headRy * 0.72;

            // Arms first, so the head sits in front of where they join it.
            // Outer pairs reach furthest and curl hardest; the middle two hang
            // almost straight down. Alternating tip heights stop the eight
            // reading as one skirt.
            const arms = [
                [-1, 0.98, 0.62], [1, 0.98, 0.62],
                [-1, 0.74, 0.80], [1, 0.74, 0.80],
                [-1, 0.46, 0.90], [1, 0.46, 0.90],
                [-1, 0.17, 0.83], [1, 0.17, 0.83]
            ];
            arms.forEach(function (a, i) {
                const side = a[0], spread = a[1], drop = a[2];
                const x0 = cx + side * headRx * 0.52 * (0.35 + spread * 0.65);
                const tipX = cx + side * S * 0.30 * spread;
                const tipY = S * (0.52 + 0.40 * drop);
                const ctlX = cx + side * S * 0.34 * spread;
                const ctlY = S * (0.52 + 0.16 * drop);
                const r0 = S * 0.050, r1 = S * 0.013;

                // Drawn twice: a slightly fatter dark pass for the outline,
                // then the fill on top. Same trick the scenery uses, and it
                // keeps the silhouette readable against water.
                ctx.fillStyle = EDGE;
                limb(ctx, x0, hubY, ctlX, ctlY, tipX, tipY, r0 + S * 0.012, r1 + S * 0.009);
                ctx.fillStyle = (i % 2) ? BODY : BODY_DK;
                limb(ctx, x0, hubY, ctlX, ctlY, tipX, tipY, r0, r1);

                // Suckers along the two front arms only - on all eight they
                // turned into visual noise at card size.
                if (spread < 0.5) {
                    ctx.fillStyle = SUCKER;
                    for (let t = 0.32; t < 0.95; t += 0.16) {
                        const mt = 1 - t;
                        const x = mt * mt * x0 + 2 * mt * t * ctlX + t * t * tipX;
                        const y = mt * mt * hubY + 2 * mt * t * ctlY + t * t * tipY;
                        ctx.beginPath();
                        ctx.arc(x, y, S * 0.011 * (1 - t * 0.5), 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            });

            // The head: a tall dome, lit from the upper left.
            const g = ctx.createLinearGradient(0, headY - headRy, 0, headY + headRy);
            g.addColorStop(0, '#c163b4');
            g.addColorStop(0.55, BODY);
            g.addColorStop(1, BODY_DK);
            ctx.beginPath();
            ctx.ellipse(cx, headY, headRx, headRy, 0, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
            ctx.lineWidth = S * 0.022;
            ctx.strokeStyle = EDGE;
            ctx.stroke();

            // A soft sheen high on the dome.
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(cx, headY, headRx, headRy, 0, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.beginPath();
            ctx.ellipse(cx - headRx * 0.30, headY - headRy * 0.46,
                        headRx * 0.44, headRy * 0.26, -0.42, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Eyes. Wide and well apart, which is most of what makes it read
            // as an octopus rather than a blob.
            const eyeY = headY + headRy * 0.10;
            const eyeDx = headRx * 0.46;
            const open = pose === 'happy' ? 0.82 : 1;
            [-1, 1].forEach(function (side) {
                const ex = cx + side * eyeDx;
                ctx.beginPath();
                ctx.ellipse(ex, eyeY, headRx * 0.27, headRy * 0.25 * open, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#fffdf6';
                ctx.fill();
                ctx.lineWidth = S * 0.014;
                ctx.strokeStyle = EDGE;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(ex + side * headRx * 0.05, eyeY + headRy * 0.03,
                        headRx * 0.125, 0, Math.PI * 2);
                ctx.fillStyle = '#2a1226';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(ex - side * headRx * 0.04, eyeY - headRy * 0.07,
                        headRx * 0.045, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.fill();
            });

            // Mouth: a small open O when calling, a curve otherwise.
            ctx.strokeStyle = EDGE;
            ctx.lineWidth = S * 0.016;
            ctx.beginPath();
            if (pose === 'call') {
                ctx.ellipse(cx, headY + headRy * 0.52, headRx * 0.12, headRy * 0.10,
                            0, 0, Math.PI * 2);
            } else {
                ctx.arc(cx, headY + headRy * 0.38, headRx * 0.24, 0.30 * Math.PI, 0.70 * Math.PI);
            }
            ctx.stroke();
        },

        /**
         * A five-armed sea star: gold body, heavy dark outline, and the rows of
         * pale tube-foot pores that are what tell it apart from a cartoon star.
         * The emoji here was a plain yellow five-pointed star, which is not a
         * starfish at all - and in Listen and Find that is the difference
         * between a fair question and an unanswerable one.
         *
         * The pose is unused. A sea star has no face to work with and does not
         * change shape when it calls, so the per-pose scale and tilt that
         * drawnCanvas applies is the whole of the difference - which is enough
         * to keep it moving like the rest of the roster.
         */
        starfish: function (ctx, size) {
            const S = size;
            const EDGE = '#241f21';
            const PORE = '#fbf5c9';

            ctx.save();
            fitForPose(ctx, S);
            starfishPath(ctx, S);
            const g = ctx.createLinearGradient(0, S * 0.065, 0, S * 0.995);
            g.addColorStop(0, '#f6d05d');
            g.addColorStop(0.5, '#f0c447');
            g.addColorStop(1, '#e3b032');
            ctx.fillStyle = g;
            ctx.fill();
            ctx.lineJoin = 'round';
            ctx.lineWidth = S * 0.026;
            ctx.strokeStyle = EDGE;
            ctx.stroke();

            starfishPores().forEach(function (p) {
                const r = p[2] * S;
                ctx.beginPath();
                ctx.arc(p[0] * S, p[1] * S, r, 0, Math.PI * 2);
                ctx.fillStyle = PORE;
                ctx.fill();
                ctx.lineWidth = Math.max(S * 0.006, r * 0.55);
                ctx.strokeStyle = EDGE;
                ctx.stroke();
            });
            ctx.restore();
        },

        /**
         * An orca in side view, facing left: a black body with the white eye
         * patch, flank and saddle picked out of it. A silhouette on purpose -
         * the shape of the dorsal fin and the placement of the eye patch are
         * what identify this animal, and both survive being shrunk to a card.
         *
         * Keyed 'whale' because that is still the animal's id, which is what
         * names its recording; only what the player is shown and told changed.
         * The emoji this replaces is a small blue cartoon whale spouting water,
         * a different animal entirely - and with a Dolphin and a Big Whale in
         * the same tank, telling the three apart has to be possible from the
         * picture alone.
         *
         * As with the starfish, the pose is left to drawnCanvas's framing.
         */
        whale: function (ctx, size) {
            const S = size;
            const BLACK = '#141414', SOFT = '#2a2a2a', WHITE = '#fdfdf8';

            // Written in a 0-1 box and scaled, so the proportions read as
            // fractions of the animal rather than as pixel numbers.
            function X(v) { return S * v; }
            function Y(v) { return S * v; }

            ctx.save();
            fitForPose(ctx, S);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            // The silhouette, as one closed path: snout, over the melon, up and
            // around the dorsal fin, down the back to the tail stock, out
            // through both fluke lobes, then back along the belly. A function
            // because the white markings are clipped to this same shape.
            function body(c) {
                c.beginPath();
                c.moveTo(X(0.045), Y(0.520));                                              // snout
                c.bezierCurveTo(X(0.11), Y(0.435), X(0.22), Y(0.360), X(0.36), Y(0.325));  // melon
                c.bezierCurveTo(X(0.43), Y(0.308), X(0.48), Y(0.300), X(0.515), Y(0.298)); // back
                // Dorsal fin. Tall, leaning back, with a concave trailing edge -
                // the one feature nobody mistakes for another whale.
                c.bezierCurveTo(X(0.545), Y(0.205), X(0.585), Y(0.115), X(0.650), Y(0.055));
                c.bezierCurveTo(X(0.660), Y(0.150), X(0.665), Y(0.250), X(0.672), Y(0.330));
                // Down the back to a narrow tail stock.
                c.bezierCurveTo(X(0.745), Y(0.375), X(0.815), Y(0.455), X(0.862), Y(0.550));
                // Upper fluke lobe, sweeping up and back.
                c.bezierCurveTo(X(0.898), Y(0.492), X(0.948), Y(0.442), X(0.992), Y(0.440));
                c.bezierCurveTo(X(0.982), Y(0.528), X(0.945), Y(0.598), X(0.898), Y(0.638));
                // The notch between the lobes, then the lower lobe.
                c.bezierCurveTo(X(0.952), Y(0.686), X(0.972), Y(0.756), X(0.958), Y(0.822));
                c.bezierCurveTo(X(0.898), Y(0.792), X(0.848), Y(0.718), X(0.822), Y(0.645));
                // Belly, running forward and slightly up to the chin.
                c.bezierCurveTo(X(0.720), Y(0.660), X(0.600), Y(0.648), X(0.470), Y(0.622));
                c.bezierCurveTo(X(0.330), Y(0.594), X(0.180), Y(0.570), X(0.088), Y(0.556));
                c.bezierCurveTo(X(0.055), Y(0.551), X(0.038), Y(0.542), X(0.045), Y(0.520));
                c.closePath();
            }

            body(ctx);
            ctx.fillStyle = BLACK;
            ctx.fill();

            // Pectoral flipper: long and narrow, angled down and back from
            // behind the head. Drawn after the body so it reads as being on the
            // near side of the animal.
            ctx.beginPath();
            ctx.moveTo(X(0.300), Y(0.588));
            ctx.bezierCurveTo(X(0.268), Y(0.672), X(0.262), Y(0.768), X(0.292), Y(0.822));
            ctx.bezierCurveTo(X(0.352), Y(0.800), X(0.412), Y(0.712), X(0.438), Y(0.618));
            ctx.closePath();
            ctx.fillStyle = SOFT;
            ctx.fill();

            // The white markings, clipped so none can spill past the outline.
            ctx.save();
            body(ctx);
            ctx.clip();

            // Eye patch: the marking that names the animal. Long, narrow and
            // tilted along the line of the head. Deliberately NOT a round white
            // blob with a pupil in it - at that shape it reads as one big
            // cartoon eye and stops looking like an orca's marking at all.
            ctx.beginPath();
            ctx.ellipse(X(0.222), Y(0.442), X(0.078), Y(0.023), -0.33, 0, Math.PI * 2);
            ctx.fillStyle = WHITE;
            ctx.fill();

            // Chin: a slim wedge under the jaw, not a block.
            ctx.beginPath();
            ctx.moveTo(X(0.055), Y(0.531));
            ctx.bezierCurveTo(X(0.115), Y(0.540), X(0.180), Y(0.552), X(0.235), Y(0.566));
            ctx.bezierCurveTo(X(0.175), Y(0.578), X(0.090), Y(0.568), X(0.055), Y(0.531));
            ctx.closePath();
            ctx.fill();

            // Flank patch, sweeping up behind the flipper.
            ctx.beginPath();
            ctx.moveTo(X(0.430), Y(0.616));
            ctx.bezierCurveTo(X(0.492), Y(0.578), X(0.540), Y(0.548), X(0.572), Y(0.538));
            ctx.bezierCurveTo(X(0.598), Y(0.590), X(0.572), Y(0.632), X(0.515), Y(0.640));
            ctx.closePath();
            ctx.fill();

            // Saddle: the pale hook just behind the dorsal fin. Faint, as it is
            // on the animal - at full strength it competes with the eye patch.
            ctx.beginPath();
            ctx.moveTo(X(0.678), Y(0.340));
            ctx.bezierCurveTo(X(0.728), Y(0.360), X(0.772), Y(0.398), X(0.802), Y(0.438));
            ctx.bezierCurveTo(X(0.760), Y(0.448), X(0.708), Y(0.408), X(0.668), Y(0.372));
            ctx.closePath();
            ctx.fillStyle = 'rgba(253,253,248,0.28)';
            ctx.fill();
            ctx.restore();

            // The eye, set into the FRONT END of the white patch - which is
            // where it sits on the animal, and means the patch itself provides
            // the contrast. On black skin an eye needs a light ring to be seen
            // at all, and a ring that small just reads as a smudge.
            ctx.beginPath();
            ctx.arc(X(0.166), Y(0.461), S * 0.0115, 0, Math.PI * 2);
            ctx.fillStyle = BLACK;
            ctx.fill();

            // The jaw, as one thin line. Kept faint: on a silhouette this size
            // it should read as detail on the head, not a mouth drawn on.
            ctx.beginPath();
            ctx.moveTo(X(0.052), Y(0.537));
            ctx.bezierCurveTo(X(0.105), Y(0.548), X(0.165), Y(0.558), X(0.238), Y(0.570));
            ctx.lineWidth = S * 0.008;
            ctx.strokeStyle = 'rgba(120,120,120,0.45)';
            ctx.stroke();

            ctx.restore();
        }
    };

    /** Render one of the DRAWN animals, cached per id and pose. */
    function drawnCanvas(id, pose, size) {
        size = size || TEXTURE_SIZE;
        const key = id + '|' + pose + '|' + size;
        if (drawnCache[key]) return drawnCache[key];

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // The same per-pose framing emojiCanvas uses, so a drawn animal and an
        // emoji one move identically through the reveal.
        let scale = 1, tilt = 0, lift = 0;
        if (pose === 'call') { scale = 1.06; lift = -size * 0.03; }
        if (pose === 'happy') { scale = 1.04; tilt = -0.10; lift = -size * 0.04; }

        ctx.save();
        ctx.translate(size / 2, size / 2 + lift);
        ctx.rotate(tilt);
        ctx.scale(scale, scale);
        ctx.translate(-size / 2, -size / 2);
        DRAWN[id](ctx, size, pose);
        ctx.restore();

        drawnCache[key] = canvas;
        return canvas;
    }

    // --- tier resolution --------------------------------------------------------

    /**
     * Best available art for a pose. Returns either a URL string (tier 1/2) or a
     * canvas (tier 0). Callers upload whichever they get as a texture - the
     * dimensions match either way.
     */
    function artFor(animal, pose) {
        const url = animal.art && animal.art[pose];
        if (url) return { kind: 'url', src: url };
        // Fall back down the poses before falling out of the tier.
        const idle = animal.art && animal.art.idle;
        if (idle) return { kind: 'url', src: idle };
        // A drawn placeholder beats the emoji font where one exists.
        if (DRAWN[animal.id]) return { kind: 'canvas', src: drawnCanvas(animal.id, pose) };
        return { kind: 'canvas', src: emojiCanvas(animal.emoji, pose) };
    }

    /** True while any pose of this animal is still on emoji. */
    function isPlaceholder(animal) {
        return !(animal.art && animal.art.idle);
    }

    /**
     * Boot-time warning listing which animals are still on tier 0, so nobody
     * ships emoji by accident. Silent once every animal has art.
     */
    function warnPlaceholders() {
        NAF.Zones.list.forEach(function (zone) {
            const roster = zone.animals;
            const missing = roster.filter(isPlaceholder).map(function (a) { return a.id; });
            if (missing.length) {
                console.warn(
                    '[NAF] ' + zone.name + ': ' + missing.length + ' of ' + roster.length +
                    ' animals are still on tier 0 emoji placeholders and must not ship: ' +
                    missing.join(', ')
                );
            }
            // No audio warning here any more. Every animal now HAS a sounds.call
            // path (worked out from its id - see zones.js), so counting paths
            // would always report zero, and whether the file behind one exists
            // is not known yet at boot: tryFile in audio.js is still probing.
            // That probe warns per missing file by name, which is the same
            // information and more useful.
        });
    }

    // --- pools ------------------------------------------------------------------

    /** The animals in play in this zone, per the Animals setting. */
    function pool() {
        const roster = list();
        const mode = NAF.Settings.get('pool');
        if (mode === 'one') {
            return [findById(NAF.Settings.get('justOneIs')) || roster[0]];
        }
        if (mode === 'four') return roster.slice(0, 4);
        return roster.slice();
    }

    /** A random animal from the pool, avoiding an immediate repeat where it can. */
    let lastPicked = null;
    function randomFromPool() {
        const p = pool();
        if (p.length === 1) { lastPicked = p[0]; return p[0]; }
        let pick = p[Math.floor(Math.random() * p.length)];
        let guard = 0;
        while (lastPicked && pick.id === lastPicked.id && guard++ < 8) {
            pick = p[Math.floor(Math.random() * p.length)];
        }
        lastPicked = pick;
        return pick;
    }

    /**
     * How many animals Pick an Animal shows at once. There are more animals than
     * that, so the board shows a handful and swaps in a new face each time one is
     * chosen - the row and column count never changes, only who is standing in
     * each slot.
     */
    const BOARD_SIZE = 8;

    function shuffle(list) {
        const out = list.slice();
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return out;
    }

    /** A fresh board: up to BOARD_SIZE animals from the pool, in random order. */
    function randomBoard() {
        const p = pool();
        return shuffle(p).slice(0, Math.min(BOARD_SIZE, p.length));
    }

    /**
     * Swap one animal out for a face that is not already on the board. Returns a
     * new array; the chosen animal keeps its slot so nothing jumps around.
     */
    function replaceOnBoard(board, animal) {
        const p = pool();
        const onBoard = {};
        board.forEach(function (a) { onBoard[a.id] = true; });
        const bench = p.filter(function (a) { return !onBoard[a.id]; });
        if (!bench.length) return board.slice();          // whole pool is showing

        const next = bench[Math.floor(Math.random() * bench.length)];
        return board.map(function (a) { return a.id === animal.id ? next : a; });
    }

    /** n distinct animals including `must`, shuffled. Used by Listen and Find. */
    function choiceSet(must, n) {
        const p = pool().filter(function (a) { return a.id !== must.id; });
        for (let i = p.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = p[i]; p[i] = p[j]; p[j] = t;
        }
        const out = [must].concat(p.slice(0, Math.max(0, n - 1)));
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return out;
    }

    return {
        TEXTURE_SIZE: TEXTURE_SIZE,
        /** A getter, not a value: the roster changes when the zone does. */
        get list() { return list(); },
        byId: findById,
        emojiCanvas: emojiCanvas,
        artFor: artFor,
        isPlaceholder: isPlaceholder,
        warnPlaceholders: warnPlaceholders,
        pool: pool,
        randomFromPool: randomFromPool,
        choiceSet: choiceSet,
        BOARD_SIZE: BOARD_SIZE,
        randomBoard: randomBoard,
        replaceOnBoard: replaceOnBoard
    };
})();
