/**
 * NARBE Animal Friends - the scene's own artwork, drawn to canvases.
 *
 * Everything here is tier 0 for the SETTING rather than for the animals: the
 * sky, the ground, the building, its doors and what stands around it, drawn with
 * 2D canvas calls from a zone's palette. Split out of stage3d.js because it is
 * the whole of what changes between the barn, the aquarium and the safari, and
 * because it has no business knowing about Three.js - every function here takes
 * a theme and returns a canvas, and it is the renderer's job to decide what to
 * do with one. That also means the 2D renderer can use exactly the same art.
 *
 * A canvas returned from here is the same size and framing whatever the zone, so
 * swapping zones is uploading new pixels to an existing texture rather than
 * rebuilding the scene.
 *
 * Replacing any of this with painted PNGs is a matter of returning an Image
 * instead of a canvas - the callers only ever hand the result to a texture.
 */

window.NAF = window.NAF || {};

NAF.Scenery = (function () {
    'use strict';

    function canvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c;
    }

    function blurred(c, px) {
        // ctx.filter is unavailable in a few older engines. Sharper is fine there.
        const out = canvas(c.width, c.height);
        const ctx = out.getContext('2d');
        if ('filter' in ctx) ctx.filter = 'blur(' + px + 'px)';
        ctx.drawImage(c, 0, 0);
        return out;
    }

    /**
     * The same colour at zero alpha, for the far end of a glow. Every colour in
     * a theme that fades is written as rgba(), so this only has to handle that
     * form - but it falls back to transparent rather than to garbage if one is
     * ever written as a hex.
     */
    function fade(colour) {
        const m = /^rgba?\(([^)]+)\)$/i.exec(String(colour).trim());
        if (!m) return 'rgba(0,0,0,0)';
        const parts = m[1].split(',').slice(0, 3).map(function (p) { return p.trim(); });
        return 'rgba(' + parts.join(',') + ',0)';
    }

    /** A three- or four-stop vertical gradient from an array of colours. */
    function ramp(ctx, x0, y0, x1, y1, stops) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        for (let i = 0; i < stops.length; i++) {
            g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), stops[i]);
        }
        return g;
    }

    // --- sky, hills, clouds -----------------------------------------------------

    function sky(theme, flat) {
        const c = canvas(256, 512);
        const ctx = c.getContext('2d');
        ctx.fillStyle = flat
            ? ramp(ctx, 0, 0, 0, 512, theme.skyFlat)
            : ramp(ctx, 0, 0, 0, 512, theme.sky);
        ctx.fillRect(0, 0, 256, 512);
        if (!flat) {
            // The sun, or the patch of surface light above a tank.
            const glow = ctx.createRadialGradient(60, 150, 4, 60, 150, 130);
            glow.addColorStop(0, theme.sunGlow);
            glow.addColorStop(1, fade(theme.sunGlow));
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, 256, 512);
        }
        return c;
    }

    function hills(theme) {
        const c = canvas(1024, 256);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 1024, 256);
        function band(color, base, amp, step) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(0, 256);
            for (let x = 0; x <= 1024; x += 8) {
                const y = base - Math.sin(x / step) * amp - Math.sin(x / (step * 2.7)) * amp * 0.6;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(1024, 256);
            ctx.closePath();
            ctx.fill();
        }
        band(theme.hills[0], 150, 26, 190);
        band(theme.hills[1], 196, 18, 130);
        return c;
    }

    function cloud(theme) {
        const c = canvas(256, 128);
        const ctx = c.getContext('2d');
        ctx.fillStyle = theme.cloud;
        [[80, 74, 40], [130, 62, 50], [180, 76, 34], [110, 86, 34]].forEach(function (p) {
            ctx.beginPath();
            ctx.arc(p[0], p[1], p[2], 0, Math.PI * 2);
            ctx.fill();
        });
        return blurred(c, 3);
    }

    // --- the building -----------------------------------------------------------

    /**
     * The facade: the building's silhouette on a transparent plane with the door
     * opening cut out. Sky shows around it; the interior shows through it.
     *
     * Each zone has its OWN silhouette - a gambrel barn, a glass tank under an
     * overhanging hood, a thatched lodge - because a blue barn is still a barn.
     * What all three share is the ENVELOPE they are drawn inside:
     *
     *     0 <= y <= g.TOP        and        |x| <= g.WIDTH / 2
     *
     * That envelope, not the outline, is what the camera framing solve in
     * stage3d.js fits to the free band of screen (BARN_TOP and BARN_W there). Any
     * new shape may look like anything at all as long as it stays inside it; go
     * outside and the building will be clipped on a narrow screen in one zone and
     * not another, which is a miserable bug to track down.
     *
     * The door opening is common too: x +/- g.OPENING_HALF, y 0..g.DOOR_H. Every
     * shape has to leave that rectangle drawable, because that is where the doors
     * are and where the animal walks out.
     */
    function facade(theme, g) {
        const SIZE = 1024;
        const c = canvas(SIZE, SIZE);
        const ctx = c.getContext('2d');
        // Plane is 26 x 16 world units, showing world y from -5 to 11.
        const px = SIZE / 26, py = SIZE / 16;
        function X(x) { return (x + 13) * px; }
        function Y(y) { return SIZE - (y + 5) * py; }

        const P = {
            ctx: ctx, X: X, Y: Y, px: px, py: py, size: SIZE,
            g: g, theme: theme
        };

        ctx.lineJoin = 'round';
        ctx.lineCap = 'butt';

        if (theme.shape === 'tank') tankFacade(P);
        else if (theme.shape === 'thatch') thatchFacade(P);
        else barnFacade(P);

        // The opening, punched out so the dark interior shows through it - the
        // aquarium is the one exception. It has no door at all: the animal
        // swims into view across the glass instead of stepping out of a hole,
        // so the "doorway" here would just be a patch of dark nothing sitting
        // in the middle of a tank that is otherwise full of water. Leaving the
        // glass solid is what makes that read as one continuous tank rather
        // than a barn with the wrong paint job.
        if (!g.NO_DOOR) {
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillRect(X(-g.OPENING_HALF), Y(g.DOOR_H), g.OPENING_HALF * 2 * px, g.DOOR_H * py);
            ctx.restore();

            // The door frame, drawn back over the hole's edge.
            ctx.strokeStyle = theme.trim;
            ctx.lineWidth = 14;
            ctx.beginPath();
            ctx.moveTo(X(-g.OPENING_HALF), Y(0)); ctx.lineTo(X(-g.OPENING_HALF), Y(g.DOOR_H));
            ctx.lineTo(X(g.OPENING_HALF), Y(g.DOOR_H)); ctx.lineTo(X(g.OPENING_HALF), Y(0));
            ctx.stroke();
        }

        return c;
    }

    // --- the barn ---------------------------------------------------------------

    /** A gambrel barn: board-and-batten walls, vertical roof boards, loft window. */
    function barnFacade(P) {
        const ctx = P.ctx, X = P.X, Y = P.Y, g = P.g, theme = P.theme;

        ctx.fillStyle = theme.wall;
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 7;

        // Body and roof drawn as ONE outline, so the barn is a single shape with
        // no seam across it - the same silhouette as the menu's card.
        ctx.beginPath();
        ctx.moveTo(X(-6), Y(0));
        ctx.lineTo(X(-6), Y(g.EAVE_Y));
        ctx.lineTo(X(-g.EAVE_X), Y(g.EAVE_Y));   // left eave
        ctx.lineTo(X(-g.KNEE_X), Y(g.KNEE_Y));   // knee: steep lower slope
        ctx.lineTo(X(0), Y(g.TOP));              // apex: shallow upper slope
        ctx.lineTo(X(g.KNEE_X), Y(g.KNEE_Y));
        ctx.lineTo(X(g.EAVE_X), Y(g.EAVE_Y));    // right eave
        ctx.lineTo(X(6), Y(g.EAVE_Y));
        ctx.lineTo(X(6), Y(0));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // The roof, clipped to the gambrel so its detail stops at the edges.
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(X(-g.EAVE_X), Y(g.EAVE_Y));
        ctx.lineTo(X(-g.KNEE_X), Y(g.KNEE_Y));
        ctx.lineTo(X(0), Y(g.TOP));
        ctx.lineTo(X(g.KNEE_X), Y(g.KNEE_Y));
        ctx.lineTo(X(g.EAVE_X), Y(g.EAVE_Y));
        ctx.closePath();
        ctx.clip();

        ctx.fillStyle = theme.roof;
        ctx.fillRect(0, 0, P.size, P.size);

        // Vertical roof boards running down the slope, as a barn's do.
        ctx.strokeStyle = theme.roofDetail;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = -g.EAVE_X; x < g.EAVE_X; x += 0.52) {
            ctx.moveTo(X(x), Y(g.EAVE_Y - 0.2));
            ctx.lineTo(X(x), Y(g.TOP + 0.2));
        }
        ctx.stroke();

        // The ridge where the two slopes meet.
        ctx.strokeStyle = theme.roofDetail;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(X(-g.EAVE_X), Y(g.KNEE_Y));
        ctx.lineTo(X(g.EAVE_X), Y(g.KNEE_Y));
        ctx.stroke();
        ctx.restore();

        // Board-and-batten siding. The battens stop short of where the trim
        // boards go, so none pokes out past them and leaves a row of nicks.
        ctx.strokeStyle = theme.batten;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = -5.4; x < 6; x += 0.6) {
            ctx.moveTo(X(x), Y(0.44)); ctx.lineTo(X(x), Y(g.EAVE_Y - 0.46));
        }
        ctx.stroke();

        // Cream trim boards along the top and bottom of the wall. The top one
        // sits close under the eave, clear of the doors below it - at the old
        // -0.34 offset it was only a hair above the door frame's own stroke
        // width, so the two visually touched. The bottom one is dropped a
        // little too, for the same clearance against the doors' bottom corners.
        ctx.strokeStyle = theme.trim;
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.moveTo(X(-5.7), Y(g.EAVE_Y - 0.15)); ctx.lineTo(X(5.7), Y(g.EAVE_Y - 0.15));
        ctx.moveTo(X(-5.7), Y(0.20)); ctx.lineTo(X(5.7), Y(0.20));
        ctx.stroke();

        gableFeature(P, 7.9);
    }

    // --- the aquarium -----------------------------------------------------------

    /**
     * A fish tank: a chunky glass box on a low plinth, under a hood that
     * overhangs it on both sides and domes over at the top.
     *
     * The overhang and the dome are what carry the read at a glance. A tank drawn
     * as a plain rectangle is the one shape a child is most likely to see as a
     * box, a door or a screen; the stepped-out hood is what says "this is a tank"
     * before any of the water, bubbles or glass detail is even visible.
     */
    function tankFacade(P) {
        const ctx = P.ctx, X = P.X, Y = P.Y, px = P.px, py = P.py, g = P.g, theme = P.theme;

        // All inside the shared envelope: the dome reaches g.TOP exactly and the
        // hood stops just inside half of g.WIDTH.
        const HOOD_X = g.WIDTH / 2 - 0.05;
        const HOOD_TOP = g.TOP - 0.95;      // the dome's shoulders; its crown is g.TOP
        const SHELF = 7.85;                 // where the hood sits on the glass
        const GLASS_X = HOOD_X - 0.8;
        const PLINTH_X = GLASS_X + 0.6;
        const PLINTH_H = 0.45;
        const WATER_Y = 7.05;

        // Glass tones. A tank is the only shape that needs them, so they default
        // here rather than every theme carrying a field two zones never read.
        const pane = theme.pane || ['#9ee4f2', '#2f88ab'];

        ctx.fillStyle = theme.wall;
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 7;

        // One closed outline, plinth through hood, so the silhouette is one shape.
        ctx.beginPath();
        ctx.moveTo(X(-PLINTH_X), Y(0));
        ctx.lineTo(X(-PLINTH_X), Y(PLINTH_H));
        ctx.lineTo(X(-GLASS_X), Y(PLINTH_H));
        ctx.lineTo(X(-GLASS_X), Y(SHELF));
        ctx.lineTo(X(-HOOD_X), Y(SHELF));
        ctx.lineTo(X(-HOOD_X), Y(HOOD_TOP));
        ctx.quadraticCurveTo(X(-HOOD_X * 0.52), Y(g.TOP), X(0), Y(g.TOP));
        ctx.quadraticCurveTo(X(HOOD_X * 0.52), Y(g.TOP), X(HOOD_X), Y(HOOD_TOP));
        ctx.lineTo(X(HOOD_X), Y(SHELF));
        ctx.lineTo(X(GLASS_X), Y(SHELF));
        ctx.lineTo(X(GLASS_X), Y(PLINTH_H));
        ctx.lineTo(X(PLINTH_X), Y(PLINTH_H));
        ctx.lineTo(X(PLINTH_X), Y(0));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // --- the hood ---
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(X(-HOOD_X), Y(SHELF));
        ctx.lineTo(X(-HOOD_X), Y(HOOD_TOP));
        ctx.quadraticCurveTo(X(-HOOD_X * 0.52), Y(g.TOP), X(0), Y(g.TOP));
        ctx.quadraticCurveTo(X(HOOD_X * 0.52), Y(g.TOP), X(HOOD_X), Y(HOOD_TOP));
        ctx.lineTo(X(HOOD_X), Y(SHELF));
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = theme.roof;
        ctx.fillRect(0, 0, P.size, P.size);
        // A soft sheen across the top of the dome.
        const sheen = ctx.createLinearGradient(0, Y(g.TOP), 0, Y(SHELF));
        sheen.addColorStop(0, 'rgba(255,255,255,0.26)');
        sheen.addColorStop(0.55, 'rgba(255,255,255,0.04)');
        sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, P.size, P.size);
        // Vent slots on the crown, rounded, well clear of the dome's edge.
        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        for (let i = -2; i <= 2; i++) {
            const vx = i * 1.15;
            ctx.beginPath();
            ctx.ellipse(X(vx), Y(HOOD_TOP + 0.62), 0.30 * px, 0.10 * py, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // The lamp under the hood's front lip, which is what lights the water.
        ctx.fillStyle = theme.lamp;
        ctx.fillRect(X(-HOOD_X + 0.28), Y(SHELF), (HOOD_X - 0.28) * 2 * px, 0.26 * py);

        // --- the water ---
        const gx = GLASS_X - 0.52;
        const gy0 = PLINTH_H + 0.30;
        const gy1 = SHELF - 0.34;
        ctx.save();
        ctx.beginPath();
        ctx.rect(X(-gx), Y(gy1), gx * 2 * px, (gy1 - gy0) * py);
        ctx.clip();

        const water = ctx.createLinearGradient(0, Y(WATER_Y), 0, Y(gy0));
        water.addColorStop(0, pane[0]);
        water.addColorStop(1, pane[1]);
        ctx.fillStyle = water;
        ctx.fillRect(X(-gx), Y(WATER_Y), gx * 2 * px, (WATER_Y - gy0) * py);

        // The air above the water line, paler than the water below it.
        ctx.fillStyle = 'rgba(232,250,255,0.55)';
        ctx.fillRect(X(-gx), Y(gy1), gx * 2 * px, (gy1 - WATER_Y) * py);

        // The water line itself, with a gentle wave along it.
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        for (let x = -gx; x <= gx; x += 0.08) {
            const y = WATER_Y + Math.sin(x * 1.9) * 0.09;
            if (x === -gx) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
        }
        ctx.stroke();

        // Broad vertical highlights down the glass, well away from the doorway so
        // they never read as part of the hatch.
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 26;
        ctx.beginPath();
        [-4.9, -3.5, 3.5, 4.9].forEach(function (x) {
            ctx.moveTo(X(x), Y(gy0 + 0.1)); ctx.lineTo(X(x), Y(gy1 - 0.1));
        });
        ctx.stroke();

        // --- what lives in the tank ---
        // Gravel, planting and a couple of little fish, either side of where a
        // doorway would be. The reveal's animal swims in on top of this, not
        // through a hole in it, so none of this can be mistaken for the animal -
        // and without it the glass is a plain blue rectangle, which is the
        // least interesting thing a fish tank could possibly be. With no
        // opening to split around, the two clusters just divide the full width
        // between them instead of flanking a gap.
        [-1, 1].forEach(function (side) {
            const x0 = side < 0 ? -gx : (g.NO_DOOR ? 0.35 : g.OPENING_HALF + 0.35);
            const x1 = side < 0 ? (g.NO_DOOR ? -0.35 : -g.OPENING_HALF - 0.35) : gx;
            const mid = (x0 + x1) / 2;

            // Plants first, so the gravel buries their stems.
            ctx.strokeStyle = 'rgba(30,120,96,0.85)';
            ctx.lineCap = 'round';
            for (let p = 0; p < 5; p++) {
                const bx = x0 + 0.35 + (p / 4) * (x1 - x0 - 0.7);
                const hgt = 1.5 + ((p * 7) % 5) * 0.34;
                ctx.lineWidth = 12;
                ctx.beginPath();
                ctx.moveTo(X(bx), Y(gy0 + 0.25));
                ctx.quadraticCurveTo(X(bx + side * 0.42), Y(gy0 + hgt * 0.6),
                                     X(bx + side * 0.16), Y(gy0 + hgt));
                ctx.stroke();
            }
            ctx.lineCap = 'butt';

            // Gravel: a low mound of pebbles along the floor of the glass.
            ctx.fillStyle = '#c9b184';
            ctx.beginPath();
            ctx.moveTo(X(x0), Y(gy0));
            for (let x = x0; x <= x1; x += 0.22) {
                ctx.lineTo(X(x), Y(gy0 + 0.34 + Math.sin(x * 5.1) * 0.10));
            }
            ctx.lineTo(X(x1), Y(gy0));
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            for (let k = 0; k < 14; k++) {
                const kx = x0 + ((k * 0.37) % (x1 - x0));
                ctx.beginPath();
                ctx.arc(X(kx), Y(gy0 + 0.16 + (k % 3) * 0.07), 0.075 * px, 0, Math.PI * 2);
                ctx.fill();
            }

            // One little fish, mid-water, facing the doorway.
            const fy = gy0 + 2.5;
            ctx.fillStyle = side < 0 ? '#ffb347' : '#ff8fa8';
            ctx.beginPath();
            ctx.ellipse(X(mid), Y(fy), 0.52 * px, 0.30 * py, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();                                  // tail, on the outside
            ctx.moveTo(X(mid - side * 0.44), Y(fy));
            ctx.lineTo(X(mid - side * 0.86), Y(fy + 0.30));
            ctx.lineTo(X(mid - side * 0.86), Y(fy - 0.30));
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.75)';               // eye, facing in
            ctx.beginPath();
            ctx.arc(X(mid + side * 0.24), Y(fy + 0.07), 0.075 * px, 0, Math.PI * 2);
            ctx.fill();
        });

        // Bubbles rising from the gravel. Few and large: at nine small dots a
        // column they read as a dotted line rather than as bubbles.
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        [-5.0, 5.0].forEach(function (bx, col) {
            for (let i = 0; i < 5; i++) {
                const t = i / 4;
                const by = gy0 + 0.5 + t * (WATER_Y - gy0 - 0.9);
                const r = (0.13 + t * 0.16) * px;
                const wob = Math.sin(t * 4.2 + col * 2.1) * 0.30;
                ctx.beginPath();
                ctx.arc(X(bx + wob), Y(by), r, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.restore();

        // --- the frame ---
        // A thick band right around the glass, plus chunky corner brackets. The
        // brackets are what make it read as a built tank rather than a window.
        ctx.strokeStyle = theme.trim;
        ctx.lineWidth = 20;
        ctx.strokeRect(X(-gx - 0.18), Y(gy1 + 0.18),
                       (gx + 0.18) * 2 * px, (gy1 - gy0 + 0.36) * py);

        ctx.lineWidth = 26;
        ctx.lineCap = 'round';
        const bl = 1.15;
        [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (s) {
            const cx = s[0] * (gx + 0.18);
            const cy = s[1] > 0 ? (gy1 + 0.18) : (gy0 - 0.18);
            ctx.beginPath();
            ctx.moveTo(X(cx), Y(cy - s[1] * bl));
            ctx.lineTo(X(cx), Y(cy));
            ctx.lineTo(X(cx - s[0] * bl), Y(cy));
            ctx.stroke();
        });
        ctx.lineCap = 'butt';

        // --- the plinth ---
        ctx.fillStyle = theme.wallEdge;
        ctx.fillRect(X(-PLINTH_X), Y(PLINTH_H), PLINTH_X * 2 * px, PLINTH_H * py);
        ctx.fillStyle = 'rgba(255,255,255,0.20)';
        ctx.fillRect(X(-PLINTH_X), Y(PLINTH_H), PLINTH_X * 2 * px, 0.10 * py);

        // The round port sits between the head of the hatch and the water line,
        // where the barn's loft window sits relative to its doors.
        gableFeature(P, 6.18);
    }

    // --- the safari -------------------------------------------------------------

    /**
     * A thatched lodge: a timber stockade under a deep straw roof.
     *
     * The roof is a POINT, not a ridge, and its edges bow outward rather than
     * running straight - both are what separate a thatch from the pitched roof of
     * a barn at a glance. The bottom edge is ragged, and that raggedness is part
     * of the silhouette rather than painted on: the facade's alpha is what the
     * player sees against the sky, so a straight-edged roof with drawn-on straw
     * still reads as a tiled roof.
     *
     * Wall and roof are two shapes here, not one as the barn's are. A thatch
     * visibly SITS ON its walls and overhangs them, so the seam between the two
     * is correct rather than something to hide.
     */
    function thatchFacade(P) {
        const ctx = P.ctx, X = P.X, Y = P.Y, px = P.px, py = P.py, g = P.g, theme = P.theme;

        const WALL_X = 6.0;
        const WALL_TOP = g.EAVE_Y;
        const EAVE_X = g.WIDTH / 2 - 0.05;
        const EAVE_Y = WALL_TOP - 0.35;      // the roof laps down over the wall top
        // Few and wide. At 34 the fringe came out as an even saw edge; a thatch
        // hangs in uneven clumps, and the clumps have to be big enough to read.
        const TUFTS = 15;

        // --- the stockade ---
        ctx.fillStyle = theme.wall;
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.rect(X(-WALL_X), Y(WALL_TOP), WALL_X * 2 * px, WALL_TOP * py);
        ctx.fill();
        ctx.stroke();

        // Upright poles lashed to two horizontal rails.
        ctx.save();
        ctx.beginPath();
        ctx.rect(X(-WALL_X), Y(WALL_TOP), WALL_X * 2 * px, WALL_TOP * py);
        ctx.clip();
        ctx.strokeStyle = theme.batten;
        ctx.lineWidth = 7;
        ctx.beginPath();
        for (let x = -5.6; x < 6; x += 0.78) {
            ctx.moveTo(X(x), Y(0.44)); ctx.lineTo(X(x), Y(WALL_TOP));
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(58,42,20,0.5)';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(X(-WALL_X), Y(1.5)); ctx.lineTo(X(WALL_X), Y(1.5));
        ctx.moveTo(X(-WALL_X), Y(4.4)); ctx.lineTo(X(WALL_X), Y(4.4));
        ctx.stroke();
        ctx.restore();

        // A sill board along the bottom. No board along the top: the thatch laps
        // over it, and a trim line under a thatch is a tiled-roof detail.
        ctx.strokeStyle = theme.trim;
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.moveTo(X(-5.7), Y(0.32)); ctx.lineTo(X(5.7), Y(0.32));
        ctx.stroke();

        // --- the thatch ---
        // Built once as a path and reused for the fill, the outline and the clip.
        function roofPath() {
            ctx.beginPath();
            ctx.moveTo(X(0), Y(g.TOP));
            // Left edge, bowing outward.
            ctx.quadraticCurveTo(X(-EAVE_X * 0.60), Y(EAVE_Y + (g.TOP - EAVE_Y) * 0.40),
                                 X(-EAVE_X), Y(EAVE_Y));
            // The ragged fringe along the bottom, left to right.
            const step = EAVE_X * 2 / TUFTS;
            for (let i = 1; i <= TUFTS; i++) {
                const x = -EAVE_X + i * step;
                // Each clump hangs by an uneven amount, and the row sags toward
                // the middle the way a real eave does. Rounded rather than
                // pointed: a curve down to the clump's tip and back up reads as
                // hanging straw, where two straight lines read as a tooth.
                const dip = 0.30 + 0.34 * Math.abs(Math.sin(i * 2.399));
                const sag = 0.18 * Math.cos((x / EAVE_X) * Math.PI / 2);
                ctx.quadraticCurveTo(
                    X(x - step * 0.72), Y(EAVE_Y - dip - sag),
                    X(x - step * 0.34), Y(EAVE_Y - dip - sag)
                );
                ctx.quadraticCurveTo(
                    X(x - step * 0.06), Y(EAVE_Y - dip - sag),
                    X(x), Y(EAVE_Y - sag * 0.35)
                );
            }
            // Right edge, back up to the point.
            ctx.quadraticCurveTo(X(EAVE_X * 0.60), Y(EAVE_Y + (g.TOP - EAVE_Y) * 0.40),
                                 X(0), Y(g.TOP));
            ctx.closePath();
        }

        ctx.fillStyle = theme.roof;
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 5;
        roofPath();
        ctx.fill();
        ctx.stroke();

        // Straw. Fine strokes fanning from the point down past the eave, in three
        // tones so the roof reads as bundled stalks rather than a flat triangle.
        ctx.save();
        roofPath();
        ctx.clip();
        const tones = ['rgba(226,190,110,0.42)', 'rgba(255,232,158,0.24)',
                       'rgba(52,36,14,0.30)'];
        ctx.lineCap = 'round';
        for (let i = 0; i < 190; i++) {
            // Spread the fan across the full width at the eave; every stalk runs
            // back to a point near the apex, which is what gives the sheaf look.
            const t = i / 190;
            const ex = -EAVE_X - 0.4 + t * (EAVE_X + 0.4) * 2;
            const jitter = (Math.sin(i * 12.9898) * 43758.5453) % 1;
            ctx.strokeStyle = tones[i % 3];
            ctx.lineWidth = 2.5 + (jitter > 0 ? jitter : -jitter) * 3.5;
            ctx.beginPath();
            ctx.moveTo(X(ex * 0.10), Y(g.TOP - 0.35));
            ctx.quadraticCurveTo(X(ex * 0.62), Y(EAVE_Y + (g.TOP - EAVE_Y) * 0.42),
                                 X(ex), Y(EAVE_Y - 0.55));
            ctx.stroke();
        }
        // Two binding lines where the bundles are tied down.
        ctx.strokeStyle = 'rgba(52,36,14,0.34)';
        ctx.lineWidth = 9;
        [0.30, 0.62].forEach(function (f) {
            const y = EAVE_Y + (g.TOP - EAVE_Y) * f;
            ctx.beginPath();
            for (let x = -EAVE_X; x <= EAVE_X; x += 0.15) {
                const yy = y + Math.sin(x * 0.9) * 0.05;
                if (x === -EAVE_X) ctx.moveTo(X(x), Y(yy)); else ctx.lineTo(X(x), Y(yy));
            }
            ctx.stroke();
        });
        ctx.lineCap = 'butt';
        ctx.restore();

        // The bound peak: a thatch comes to a point and is tied off there, and
        // without this cap the point looks like an unfinished corner.
        ctx.fillStyle = theme.roof;
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(X(0), Y(g.TOP - 0.42), 0.62 * px, 0.52 * py, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(52,36,14,0.45)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(X(-0.5), Y(g.TOP - 0.30)); ctx.lineTo(X(0.5), Y(g.TOP - 0.54));
        ctx.moveTo(X(-0.5), Y(g.TOP - 0.54)); ctx.lineTo(X(0.5), Y(g.TOP - 0.30));
        ctx.stroke();

        // The sign hangs on the face of the thatch. There is nowhere on the wall
        // for it: the doorway takes all of it up to within half a unit of the eave.
        gableFeature(P, 6.95);
    }

    /**
     * Whatever sits above the doors: a paned window, a round port, a hung sign.
     * `cy` is the world height of its centre, because each shape has a different
     * clear space to put it in.
     */
    function gableFeature(P, cy) {
        const ctx = P.ctx, X = P.X, Y = P.Y, px = P.px, py = P.py, theme = P.theme;
        const w = 0.85;

        // Some buildings carry nothing up there. The tank is one: a riveted
        // port in the middle of the glass was one more round, detailed thing
        // to look at directly above the animal, and the animal is the thing
        // worth looking at.
        if (theme.gable === 'none') return;

        if (theme.gable === 'porthole') {
            const r = w * 0.92;
            const cx = X(0), y = Y(cy);
            // Bright glass, a thick pale rim, and a thin dark line only on the
            // OUTSIDE of that rim. Drawing the dark ring at the glass's edge -
            // where it was - swallowed the rim and left a dark hole in the water.
            ctx.beginPath();
            ctx.arc(cx, y, r * px, 0, Math.PI * 2);
            ctx.fillStyle = theme.gableGlass;
            ctx.fill();
            // A highlight across the top of the glass, so it reads as a lens.
            ctx.save();
            ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath();
            ctx.ellipse(cx - r * px * 0.22, y - r * px * 0.34,
                        r * px * 0.52, r * px * 0.26, -0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = theme.trim;
            ctx.lineWidth = 20;
            ctx.beginPath();
            ctx.arc(cx, y, r * px + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = theme.wallEdge;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(cx, y, r * px + 19, 0, Math.PI * 2);
            ctx.stroke();
            // Rivets in the rim, in the DARK colour - cream rivets on a cream
            // rim are invisible, which is what they were.
            ctx.fillStyle = theme.wallEdge;
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI * 2 / 8) * i + Math.PI / 8;
                ctx.beginPath();
                ctx.arc(cx + Math.cos(a) * (r * px + 8), y + Math.sin(a) * (r * px + 8),
                        4.5, 0, Math.PI * 2);
                ctx.fill();
            }
            return;
        }

        if (theme.gable === 'sign') {
            // A carved board on two short chains. Kept close to the window's
            // footprint - drawn any bigger it fills the whole gable and stops
            // reading as a sign hung on the building.
            const bw = w * 1.35, bh = w * 0.62;
            ctx.strokeStyle = theme.wallEdge;
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(X(-bw * 0.55), Y(cy + bh + 0.55)); ctx.lineTo(X(-bw * 0.55), Y(cy + bh));
            ctx.moveTo(X(bw * 0.55), Y(cy + bh + 0.55)); ctx.lineTo(X(bw * 0.55), Y(cy + bh));
            ctx.stroke();
            ctx.fillStyle = theme.gableGlass;
            ctx.fillRect(X(-bw), Y(cy + bh), bw * 2 * px, bh * 2 * py);
            ctx.strokeStyle = theme.wallEdge;
            ctx.lineWidth = 7;
            ctx.strokeRect(X(-bw), Y(cy + bh), bw * 2 * px, bh * 2 * py);
            // Three cut lines standing in for lettering. Nothing readable, so
            // there is no text to translate or to mis-scale.
            ctx.strokeStyle = 'rgba(58,42,20,0.55)';
            ctx.lineWidth = 8;
            ctx.beginPath();
            for (let i = -1; i <= 1; i++) {
                ctx.moveTo(X(-bw * 0.6), Y(cy - i * bh * 0.5));
                ctx.lineTo(X(bw * 0.6), Y(cy - i * bh * 0.5));
            }
            ctx.stroke();
            return;
        }

        // A paned loft window, panes and all.
        ctx.fillStyle = theme.gableGlass;
        ctx.fillRect(X(-w), Y(cy + w), w * 2 * px, w * 2 * py);
        ctx.strokeStyle = theme.trim;
        ctx.lineWidth = 9;
        ctx.strokeRect(X(-w), Y(cy + w), w * 2 * px, w * 2 * py);
        ctx.beginPath();
        ctx.moveTo(X(-w), Y(cy)); ctx.lineTo(X(w), Y(cy));
        ctx.moveTo(X(0), Y(cy - w)); ctx.lineTo(X(0), Y(cy + w));
        ctx.stroke();
        ctx.strokeStyle = theme.wallEdge;
        ctx.lineWidth = 5;
        ctx.strokeRect(X(-w) - 4, Y(cy + w) - 4, w * 2 * px + 8, w * 2 * py + 8);
    }

    /** High contrast doors: a flat fill and a hard white edge, no texture. */
    function plainDoor() {
        const c = canvas(128, 256);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(0, 0, 128, 256);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 14;
        ctx.strokeRect(7, 7, 114, 242);
        return c;
    }

    /**
     * A door leaf. Order matters: the dark plank lines go down FIRST and the
     * brace and frame over the top of them. Drawn the other way round the planks
     * cut across the brace, which is what made the doors look scratched.
     *
     * The barn's leaf is planked with a cross brace. A tank's hatch is glass, so
     * it gets a sheen and a single handle bar instead - a saltire across a pane
     * of glass would read as a window frame, not as something that lifts.
     */
    function door(theme, kind) {
        const c = canvas(256, 512);
        const ctx = c.getContext('2d');

        ctx.fillStyle = theme.door;
        ctx.fillRect(0, 0, 256, 512);

        if (kind === 'lift') {
            // Glass: a diagonal sheen, then a horizontal grab bar across the
            // middle so it is obvious which way the thing moves.
            const sheen = ctx.createLinearGradient(0, 512, 256, 0);
            sheen.addColorStop(0, 'rgba(255,255,255,0.04)');
            sheen.addColorStop(0.45, 'rgba(255,255,255,0.28)');
            sheen.addColorStop(0.55, 'rgba(255,255,255,0.28)');
            sheen.addColorStop(1, 'rgba(255,255,255,0.04)');
            ctx.fillStyle = sheen;
            ctx.fillRect(0, 0, 256, 512);

            ctx.strokeStyle = theme.doorPlank;
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (let y = 64; y < 512; y += 64) { ctx.moveTo(0, y); ctx.lineTo(256, y); }
            ctx.stroke();

            ctx.fillStyle = theme.doorBrace;
            ctx.fillRect(40, 236, 176, 26);
            ctx.strokeStyle = theme.doorBrace;
            ctx.lineWidth = 16;
            ctx.strokeRect(8, 8, 240, 496);
            return c;
        }

        // Plank lines, under everything else.
        ctx.strokeStyle = theme.doorPlank;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = 32; x < 256; x += 32) {
            ctx.moveTo(x, 0); ctx.lineTo(x, 512);
        }
        ctx.stroke();

        // The cross brace and the frame, over the planks.
        ctx.strokeStyle = theme.doorBrace;
        ctx.lineWidth = 18;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(24, 492); ctx.lineTo(232, 24);
        ctx.moveTo(24, 24); ctx.lineTo(232, 492);
        ctx.stroke();

        ctx.lineCap = 'butt';
        ctx.lineWidth = 16;
        ctx.strokeRect(8, 8, 240, 496);

        return c;
    }

    /** What is inside, before anyone steps out of it. Shipped pre-blurred. */
    function interior(theme) {
        const c = canvas(512, 512);
        const ctx = c.getContext('2d');
        ctx.fillStyle = ramp(ctx, 0, 0, 0, 512, theme.interior);
        ctx.fillRect(0, 0, 512, 512);

        ctx.strokeStyle = theme.interiorBand;
        ctx.lineWidth = 6;
        for (let y = 40; y < 512; y += 56) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
        }

        // Bulky shapes on the ground at the back: hay bales, weed clumps, rocks.
        // Blurred to nothing recognisable, so their only job is to stop the
        // interior reading as a flat hole.
        ctx.fillStyle = theme.clutter;
        [[60, 400, 110, 70], [180, 420, 96, 62], [330, 396, 120, 76]].forEach(function (b) {
            ctx.fillRect(b[0], b[1], b[2], b[3]);
        });

        const lamp = ctx.createRadialGradient(430, 150, 3, 430, 150, 90);
        lamp.addColorStop(0, theme.lamp);
        lamp.addColorStop(1, fade(theme.lamp));
        ctx.fillStyle = lamp;
        ctx.fillRect(330, 50, 200, 200);

        return blurred(c, 6);
    }

    /**
     * One plane running from inside the building out into the open.
     *
     * The dark inside floor is confined to the building's own footprint. It used
     * to be a full-width gradient, which painted a brown band right across the
     * landscape either side of the barn where there should only ever be ground.
     */
    function floor(theme) {
        const W = 256, H = 512;
        const c = canvas(W, H);
        const ctx = c.getContext('2d');

        // The plane is 44 wide (x -22..22) and 40 deep (z -24..+16).
        // u follows x; v = 0 is the far edge, inside the building.
        function U(x) { return ((x + 22) / 44) * W; }
        function V(z) { return ((z + 24) / 40) * H; }

        ctx.fillStyle = ramp(ctx, 0, 0, 0, H, theme.ground);
        ctx.fillRect(0, 0, W, H);

        // Strictly INSIDE the footprint, and stopping just BEHIND the facade
        // plane at z = -8. It used to run to z = -7.6 and out to x = 6.2, both of
        // which put dark floor in front of and beside the building.
        const x0 = U(-5.9), x1 = U(5.9), y0 = V(-24), y1 = V(-8.1);
        ctx.fillStyle = ramp(ctx, 0, y0, 0, y1, theme.floor);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

        // Scuffs out in the open: trodden grass, ripples in sand, dry patches.
        ctx.fillStyle = theme.scuff;
        for (let i = 0; i < 220; i++) {
            const y = V(-6) + Math.random() * (H - V(-6));
            ctx.fillRect(Math.random() * W, y, 2 + Math.random() * 5, 2);
        }
        return c;
    }

    /** The fringe of growth along the very bottom of the frame. */
    function fringe(theme) {
        const c = canvas(512, 128);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = theme.fringe[0];
        ctx.fillRect(0, 46, 512, 82);
        ctx.strokeStyle = theme.fringe[1];
        ctx.lineWidth = 5;
        for (let x = 0; x < 512; x += 9) {
            const h = 20 + Math.random() * 34;
            ctx.beginPath();
            ctx.moveTo(x, 128);
            ctx.quadraticCurveTo(x + 6, 128 - h * 0.6, x + (Math.random() * 10 - 5), 128 - h);
            ctx.stroke();
        }
        return blurred(c, 5);
    }

    // --- the shaft of light in the doorway --------------------------------------

    function shaftFloor(theme) {
        const c = canvas(256, 256);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 256, 256);
        ctx.fillStyle = ramp(ctx, 0, 256, 0, 0, theme.shaft);
        // A trapezoid: wide at the doorway, narrowing as it runs into the dark.
        ctx.beginPath();
        ctx.moveTo(10, 256); ctx.lineTo(246, 256);
        ctx.lineTo(184, 0); ctx.lineTo(72, 0);
        ctx.closePath();
        ctx.fill();
        return blurred(c, 10);
    }

    function shaftHaze(theme) {
        const c = canvas(256, 256);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 256, 256);
        ctx.fillStyle = ramp(ctx, 0, 0, 0, 256, theme.haze);
        ctx.beginPath();
        ctx.moveTo(58, 0); ctx.lineTo(198, 0);
        ctx.lineTo(238, 256); ctx.lineTo(18, 256);
        ctx.closePath();
        ctx.fill();
        return blurred(c, 14);
    }

    function glow(theme) {
        const c = canvas(256, 256);
        const ctx = c.getContext('2d');
        ctx.fillStyle = (function () {
            const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
            g.addColorStop(0, theme.glow[0]);
            g.addColorStop(0.42, theme.glow[1]);
            g.addColorStop(1, theme.glow[2]);
            return g;
        })();
        ctx.fillRect(0, 0, 256, 256);
        return c;
    }

    function dot(theme) {
        const c = canvas(64, 64);
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, theme.dust);
        g.addColorStop(1, fade(theme.dust));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        return c;
    }

    // --- dressing: what stands behind the building ------------------------------

    /**
     * A white picket fence, drawn wide so it can run right across the field. The
     * barn stands in front of it and hides the middle; what shows is the stretch
     * either side, which is what gives the yard a boundary.
     */
    function fence() {
        const W = 1400, H = 96;
        const c = canvas(W, H);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, W, H);

        const cream = '#fff8ec', edge = 'rgba(58,40,26,0.55)';
        const pitch = 30, wide = 15;

        ctx.fillStyle = cream;
        ctx.fillRect(0, 40, W, 9);
        ctx.fillRect(0, 66, W, 9);
        ctx.fillStyle = edge;
        ctx.fillRect(0, 48, W, 2);
        ctx.fillRect(0, 74, W, 2);

        for (let x = 6; x < W - wide; x += pitch) {
            ctx.fillStyle = cream;
            ctx.beginPath();
            ctx.moveTo(x, 22);
            ctx.lineTo(x + wide / 2, 8);
            ctx.lineTo(x + wide, 22);
            ctx.lineTo(x + wide, H);
            ctx.lineTo(x, H);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = edge;
            ctx.fillRect(x + wide - 2, 20, 2, H - 20);
        }
        return c;
    }

    /** A reef wall: fans, tubes and brain coral, in the same band the fence fills. */
    function coral() {
        const W = 1400, H = 96;
        const c = canvas(W, H);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, W, H);

        const fans = ['#e57b8f', '#f0a05a', '#c98ad6', '#5fd0c0', '#e8c25a'];

        for (let x = 4; x < W; x += 26 + Math.random() * 16) {
            const colour = fans[Math.floor(Math.random() * fans.length)];
            const h = 34 + Math.random() * 52;
            const kind = Math.random();

            if (kind < 0.4) {
                // A fan: a fat stem branching into three.
                ctx.strokeStyle = colour;
                ctx.lineCap = 'round';
                ctx.lineWidth = 7;
                ctx.beginPath();
                ctx.moveTo(x, H);
                ctx.lineTo(x, H - h * 0.45);
                ctx.stroke();
                ctx.lineWidth = 5;
                for (let b = -1; b <= 1; b++) {
                    ctx.beginPath();
                    ctx.moveTo(x, H - h * 0.45);
                    ctx.quadraticCurveTo(x + b * 12, H - h * 0.8, x + b * 17, H - h);
                    ctx.stroke();
                }
            } else if (kind < 0.75) {
                // Tube coral: a bundle of uprights of uneven height.
                ctx.strokeStyle = colour;
                ctx.lineCap = 'round';
                ctx.lineWidth = 8;
                for (let t = 0; t < 4; t++) {
                    const tx = x + t * 6 - 9;
                    ctx.beginPath();
                    ctx.moveTo(tx, H);
                    ctx.lineTo(tx, H - h * (0.5 + Math.random() * 0.5));
                    ctx.stroke();
                }
            } else {
                // Brain coral: a low dome with grooves across it.
                ctx.fillStyle = colour;
                ctx.beginPath();
                ctx.ellipse(x, H, 18 + Math.random() * 10, h * 0.5, 0, Math.PI, 0);
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.22)';
                ctx.lineWidth = 3;
                for (let gy = 0; gy < 3; gy++) {
                    ctx.beginPath();
                    ctx.moveTo(x - 16, H - 8 - gy * 9);
                    ctx.lineTo(x + 16, H - 8 - gy * 9);
                    ctx.stroke();
                }
            }
        }
        return c;
    }

    /**
     * A line of acacias and scrub. Flat-topped crowns on bare trunks is the one
     * silhouette that reads as savanna at any size, so that is what this draws.
     */
    function acacia() {
        const W = 1400, H = 96;
        const c = canvas(W, H);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, W, H);

        for (let x = 20; x < W; x += 44 + Math.random() * 40) {
            if (Math.random() < 0.42) {
                // Low thorn scrub between the trees.
                ctx.fillStyle = '#6f6b33';
                ctx.beginPath();
                ctx.ellipse(x, H, 16 + Math.random() * 12, 12 + Math.random() * 9, 0, Math.PI, 0);
                ctx.fill();
                continue;
            }
            const h = 56 + Math.random() * 34;
            const spread = 22 + Math.random() * 16;

            ctx.strokeStyle = '#4a3a1c';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(x, H);
            ctx.lineTo(x + 2, H - h * 0.62);
            ctx.stroke();
            // Two boughs up to the crown.
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(x + 2, H - h * 0.62);
            ctx.lineTo(x - spread * 0.5, H - h * 0.85);
            ctx.moveTo(x + 2, H - h * 0.62);
            ctx.lineTo(x + spread * 0.6, H - h * 0.82);
            ctx.stroke();

            // The crown: a flat slab, wider than it is tall.
            ctx.fillStyle = '#5f7a34';
            ctx.beginPath();
            ctx.ellipse(x + 1, H - h * 0.88, spread, h * 0.13, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.16)';
            ctx.beginPath();
            ctx.ellipse(x + 1, H - h * 0.84, spread * 0.86, h * 0.06, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        return c;
    }

    function dressing(theme) {
        if (theme.dressing === 'coral') return coral();
        if (theme.dressing === 'acacia') return acacia();
        return fence();
    }

    // --- beds: what grows out in front, either side of the doorway --------------

    /**
     * A cluster of growth standing upright as a cutout - the same technique as
     * everything else on this stage. Two of these sit out either side of the
     * building. The three variants share one structure (a back row of blades and
     * a front row of stems with something on top) and differ in palette and in
     * what that something is.
     */
    function bed(theme) {
        const W = 1024, H = 220;
        const c = canvas(W, H);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, W, H);

        const kind = theme.bed || 'flowers';
        const look = {
            flowers: {
                head: 'flower', blade: '#4f8130', stem: '#417026',
                heads: ['#fff4f7', '#ffd9e6', '#fff0b8', '#e8d6ff', '#ffe3c4'],
                centre: '#ffc94a', blades: 90, count: 34
            },
            anemones: {
                head: 'tentacles', blade: '#2f9a7c', stem: '#1c6b5c',
                heads: ['#ff9db5', '#ffc47a', '#8fd8ff', '#7ee0d0', '#d9a0ec'],
                centre: '#fff0c4', blades: 110, count: 26
            },
            scrub: {
                head: 'seed', blade: '#93803a', stem: '#6b5a24',
                heads: ['#c9b768', '#b8a253', '#d8c98a', '#a8944a', '#e0d29c'],
                centre: '#8a7530', blades: 150, count: 30
            }
        }[kind];
        // A typo in a palette must not take the scene down with it.
        look.heads = look.heads.filter(function (h) { return /^#[0-9a-f]{3,8}$/i.test(h); });
        if (!look.heads.length) look.heads = ['#ffffff'];

        // Blades first, so what stands in front of them reads as in front.
        ctx.strokeStyle = look.blade;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        for (let i = 0; i < look.blades; i++) {
            const x = Math.random() * W;
            const h = 26 + Math.random() * 46;
            ctx.beginPath();
            ctx.moveTo(x, H);
            ctx.quadraticCurveTo(x + (Math.random() * 16 - 8), H - h * 0.6,
                                 x + (Math.random() * 26 - 13), H - h);
            ctx.stroke();
        }

        for (let i = 0; i < look.count; i++) {
            const x = 18 + Math.random() * (W - 36);
            const stem = 52 + Math.random() * 74;
            const r = 9 + Math.random() * 5;
            const colour = look.heads[Math.floor(Math.random() * look.heads.length)];

            ctx.strokeStyle = look.stem;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(x, H);
            ctx.quadraticCurveTo(x + 5, H - stem * 0.6, x, H - stem);
            ctx.stroke();

            if (look.head === 'tentacles') {
                // An anemone: a short column with a crown of fine tentacles
                // waving off it. Nothing that could be mistaken for a petal.
                ctx.strokeStyle = colour;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                for (let p = 0; p < 11; p++) {
                    const a = -Math.PI / 2 + (p - 5) * 0.26;
                    const len = r * (1.5 + Math.random() * 0.9);
                    ctx.beginPath();
                    ctx.moveTo(x, H - stem);
                    ctx.quadraticCurveTo(
                        x + Math.cos(a) * len * 0.6, H - stem + Math.sin(a) * len * 0.6,
                        x + Math.cos(a) * len + (Math.random() * 6 - 3),
                        H - stem + Math.sin(a) * len
                    );
                    ctx.stroke();
                }
                ctx.fillStyle = look.centre;
                ctx.beginPath();
                ctx.arc(x, H - stem + 2, r * 0.42, 0, Math.PI * 2);
                ctx.fill();
            } else if (look.head === 'seed') {
                // A dry seed head: a narrow spike of grains up the top of the
                // stalk. Read as grass gone over, not as a flower in bloom.
                ctx.fillStyle = colour;
                const grains = 7;
                for (let p = 0; p < grains; p++) {
                    const gy = H - stem - p * (r * 0.42) + r * 1.2;
                    const gw = r * (0.34 - p * 0.02);
                    ctx.beginPath();
                    ctx.ellipse(x + (p % 2 ? 1.6 : -1.6), gy, Math.max(1.4, gw),
                                r * 0.30, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                // A flower: five petals and a centre.
                ctx.fillStyle = colour;
                for (let p = 0; p < 5; p++) {
                    const a = (Math.PI * 2 / 5) * p - Math.PI / 2;
                    ctx.beginPath();
                    ctx.arc(x + Math.cos(a) * r * 0.92, (H - stem) + Math.sin(a) * r * 0.92,
                            r * 0.72, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = look.centre;
                ctx.beginPath();
                ctx.arc(x, H - stem, r * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        return c;
    }

    return {
        sky: sky,
        hills: hills,
        cloud: cloud,
        facade: facade,
        door: door,
        plainDoor: plainDoor,
        interior: interior,
        floor: floor,
        fringe: fringe,
        shaftFloor: shaftFloor,
        shaftHaze: shaftHaze,
        glow: glow,
        dot: dot,
        dressing: dressing,
        bed: bed
    };
})();
