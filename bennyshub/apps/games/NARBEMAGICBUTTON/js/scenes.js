/**
 * NARBE Magic Button - the three magic scenes, drawn on one canvas.
 *
 *   Fireworks  a moonlit city. Each press launches a rocket. Classic styles
 *              (round bursts, rings, double rings, willows, rainbow bursts,
 *              crossettes, palms, spirals, strobes, chrysanthemums, ghosts)
 *              and recognizable shapes (heart, star, smiley, paw print,
 *              flower, butterfly, planet, crescent moon, snowflake, rainbow,
 *              balloon) take turns, and a Sky Word can be spelled in sparks.
 *   Bubbles    under the sea. Each press makes a friendly whale puff and blow
 *              a cluster of shimmery bubbles - some heart or star shaped, some
 *              wobbly. Every few presses a bubble carries a fish, starfish or
 *              duck that swims off when it pops, and now and then a giant
 *              bubble rises and bursts into a shower. Bubbles nudge apart and
 *              sometimes merge; fish and a jellyfish drift by.
 *   Flowers    a sunny garden. Each press grows a tulip, sunflower, daisy,
 *              lollipop or smiley flower, each with its own instrument, and the
 *              notes climb a scale. Filling the garden starts a big finish; the
 *              next press clears it with a breeze, a bunny, butterflies or rain.
 *              Every third garden is a night garden with fireflies.
 *
 * press({ silent: true }) runs the same effect with no sound, for the menu's
 * preview when the highlight rests on a magic.
 */

window.NMB = window.NMB || {};

NMB.Scene = (function () {
    'use strict';

    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

    let canvas, ctx;
    const fx = document.createElement('canvas'), fctx = fx.getContext('2d');      // spark trails
    const glow = document.createElement('canvas'), gctx = glow.getContext('2d');  // cheap bloom
    const city = document.createElement('canvas'), cctx = city.getContext('2d');  // skyline
    let W = 0, H = 0, S = 0, DPR = 1;
    let mode = 'fireworks';
    let time = 0;

    function Sound() { return NMB.Sound; }

    // --- layout ------------------------------------------------------------------

    let stars = [];
    function makeStars() {
        stars = [];
        const n = Math.round(W * H / 7000);
        for (let i = 0; i < n; i++) {
            stars.push({ x: Math.random() * W, y: Math.random() * H * 0.7, r: rand(0.5, 1.8), p: Math.random() * TAU, s: rand(0.5, 2) });
        }
    }

    function makeCity() {
        city.width = Math.round(W * DPR); city.height = Math.round(H * 0.3 * DPR);
        cctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const ch = H * 0.3;
        cctx.clearRect(0, 0, W, ch);
        // Back row: taller, paler; front row: shorter, darker.
        [['#1d1850', 0.95, 0.55], ['#120e35', 0.6, 1]].forEach(([color, hMax, litChance]) => {
            let x = -10;
            while (x < W + 10) {
                const bw = rand(0.05, 0.11) * Math.max(W, 600) * 0.6;
                const bh = rand(0.25, hMax) * ch;
                cctx.fillStyle = color;
                cctx.fillRect(x, ch - bh, bw, bh);
                if (Math.random() < 0.25) cctx.fillRect(x + bw * 0.4, ch - bh - ch * 0.06, bw * 0.08, ch * 0.06);
                const win = Math.max(3, S * 0.008), gap = win * 2.2;
                for (let wy = ch - bh + gap; wy < ch - gap; wy += gap) {
                    for (let wx = x + gap * 0.6; wx < x + bw - win; wx += gap) {
                        if (Math.random() < 0.32 * litChance) {
                            cctx.fillStyle = pick(['rgba(255,214,130,.85)', 'rgba(255,236,180,.7)', 'rgba(160,220,255,.6)']);
                            cctx.fillRect(wx, wy, win, win * 1.2);
                        }
                    }
                }
                x += bw + rand(0, 6);
            }
        });
    }

    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth; H = window.innerHeight; S = Math.min(W, H);
        for (const [c, cx] of [[canvas, ctx], [fx, fctx]]) {
            c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
            cx.setTransform(DPR, 0, 0, DPR, 0, 0);
        }
        glow.width = Math.max(1, Math.round(W / 4)); glow.height = Math.max(1, Math.round(H / 4));
        makeStars();
        makeCity();
        makeSeaFloor();
    }

    // --- state -------------------------------------------------------------------

    let rockets = [], sparks = [], parts = [], bubbles = [], flowers = [], fish = [], butterflies = [], clouds = [];
    let slotN = 7, slotOrder = [], planted = 0;
    let kindBag = [];

    function newRound() {
        slotN = clamp(Math.round(W / 140), 5, 9);
        slotOrder = [...Array(slotN).keys()].sort(() => Math.random() - 0.5);
        planted = 0;
    }

    function resetScene() {
        rockets = []; sparks = []; parts = []; bubbles = []; flowers = []; butterflies = [];
        fctx.clearRect(0, 0, W, H);
        clouds = [0, 1, 2, 3].map(() => ({ x: rand(-0.1, 1), y: rand(0.08, 0.3), s: rand(0.7, 1.3), v: rand(0.005, 0.012) }));
        fish = [0, 1, 2].map(i => newFish(i));
        critters = []; jellies = [newJelly(true)]; bubblePresses = 0; mergeCooldown = 0;
        resetGarden();
        Object.assign(whale, { x: 0.5, dir: Math.random() < 0.5 ? 1 : -1, turning: false, turnT: 0, puff: 0, surge: 0 });
        newRound();
    }

    // --- fireworks ---------------------------------------------------------------

    const PALETTE = ['#ff4d6d', '#ffd23f', '#3bceac', '#5aa9ff', '#c77dff', '#ff8c42', '#7bf1a8', '#ff7ad9'];

    /** Classic firework styles. */
    const CLASSIC = ['peony', 'ring', 'double', 'willow', 'multi', 'crossette', 'palm', 'spiral', 'strobe', 'chrys', 'ghost'];
    /** Recognizable shapes, good for early learners. */
    const SHAPES = ['heart', 'star', 'smiley', 'paw', 'flower', 'butterfly', 'planet', 'crescent', 'snowflake', 'rainbow', 'balloon'];
    const WORD_EVERY = 4;   // with a Sky Word set, every fourth firework spells it

    /**
     * Every kind - classic styles and shapes alike - comes round once before
     * any repeats, never twice in a row.
     */
    let lastKind = null, launches = 0;
    function nextKind() {
        launches++;
        if (NMB.Settings.get('skyWord').trim() && launches % WORD_EVERY === 0) return 'word';
        if (!kindBag.length) {
            kindBag = CLASSIC.concat(SHAPES).sort(() => Math.random() - 0.5);
            if (kindBag[0] === lastKind) kindBag.push(kindBag.shift());
        }
        lastKind = kindBag.shift();
        return lastKind;
    }

    function launchFirework(silent, forceKind) {
        const kind = forceKind || nextKind();
        const formed = kind === 'word' || SHAPES.indexOf(kind) >= 0;
        // Shapes and words burst lower and nearer the middle, so the whole
        // picture has room to form inside the sky.
        const tx = kind === 'word' ? rand(0.47, 0.53) * W : formed ? rand(0.28, 0.72) * W : rand(0.15, 0.85) * W;
        const ty = kind === 'word' ? rand(0.3, 0.34) * H : formed ? rand(0.32, 0.42) * H : rand(0.13, 0.4) * H;
        const x0 = tx + rand(-0.06, 0.06) * W;
        rockets.push({ x0, y0: H + 10, tx, ty, t: 0, dur: 0.55, x: x0, y: H + 10, color: pick(PALETTE), kind, silent });
        if (!silent) Sound().launch(kind);
    }

    function addSpark(r, vx, vy, color, life, o) {
        sparks.push(Object.assign({ x: r.x, y: r.y, vx, vy, color, life, max: life, size: S * 0.0065, g: S * 0.12, drag: 0.28, flick: false }, o || {}));
    }

    // --- shapes: points that the sparks fly out to and hold ------------------------
    //
    // A spark with drag d per second, launched at v, comes to rest v / ln(1/d)
    // away. So launching each spark at its point times ln(1/d) makes the
    // picture snap into shape in under a second, and very low gravity keeps it
    // together long enough to read before it drifts down.

    const FORM_DRAG = 0.06, FORM_K = Math.log(1 / FORM_DRAG);

    function pt(x, y, c, o) { return { x, y, c, o }; }
    function arc(cx, cy, rx, ry, n, c, a0, a1, o) {
        const out = [];
        a0 = a0 || 0; a1 = a1 === undefined ? TAU : a1;
        const closed = Math.abs(a1 - a0 - TAU) < 1e-6;
        for (let i = 0; i < n; i++) {
            const a = a0 + (a1 - a0) * i / (closed ? n : n - 1);
            out.push(pt(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, typeof c === 'function' ? c(i, n) : c, o));
        }
        return out;
    }
    function line(x0, y0, x1, y1, n, c, o) {
        const out = [];
        for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) : 0; out.push(pt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c, o)); }
        return out;
    }
    function rotate(points, a) {
        const c = Math.cos(a), s = Math.sin(a);
        return points.map(p => pt(p.x * c - p.y * s, p.x * s + p.y * c, p.c, p.o));
    }

    /**
     * Fly sparks out to `points` (in units of R) and hold them there.
     *
     * `soft` dims each spark: once the shape has formed its sparks stand
     * still, and the glowing trail canvas stacks them on the same spot every
     * frame - at full strength that washes every colour out to white.
     */
    function form(r, points, R, o) {
        R = R || S * 0.24;
        for (const p of points) {
            addSpark(r, p.x * R * FORM_K, p.y * R * FORM_K, p.c, rand(1.9, 2.4),
                Object.assign({ g: S * 0.035, drag: FORM_DRAG, size: S * 0.0075, soft: 0.36 }, o, p.o));
        }
    }

    const SHAPE_POINTS = {
        star(r) {
            const out = [], v = [];
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.42 : 1;
                v.push([Math.cos(a) * rr, Math.sin(a) * rr]);
            }
            for (let i = 0; i < 10; i++) {
                const [x0, y0] = v[i], [x1, y1] = v[(i + 1) % 10];
                out.push(...line(x0, y0, x1, y1, 10, i % 2 ? '#fff3b0' : '#ffd23f').slice(0, 9));
            }
            return out;
        },
        smiley() {
            return [
                ...arc(0, 0, 1, 1, 60, '#ffd23f'),
                ...arc(-0.36, -0.3, 0.09, 0.12, 7, '#ffffff'),
                ...arc(0.36, -0.3, 0.09, 0.12, 7, '#ffffff'),
                ...arc(0, 0.02, 0.56, 0.56, 22, '#ff9ec4', 0.15 * Math.PI, 0.85 * Math.PI)
            ];
        },
        paw(r) {
            const c = pick(['#ff8c42', '#ffb347', '#ff7ad9', '#7bf1a8']);
            return [
                ...arc(0, 0.32, 0.46, 0.36, 42, c),
                ...[[-0.66, -0.2], [-0.25, -0.58], [0.25, -0.58], [0.66, -0.2]].flatMap(([x, y]) => arc(x, y, 0.17, 0.2, 14, c))
            ];
        },
        flower() {
            const c = pick(['#ff5d8f', '#ff7ad9', '#c77dff', '#5aa9ff', '#ff8c42']);
            const out = [];
            for (let i = 0; i < 120; i++) {
                const a = i / 120 * TAU, rr = 0.34 + 0.66 * Math.abs(Math.cos(2.5 * a));
                out.push(pt(Math.cos(a - Math.PI / 2) * rr, Math.sin(a - Math.PI / 2) * rr, c));
            }
            return out.concat(arc(0, 0, 0.2, 0.2, 16, '#ffd23f'));
        },
        butterfly() {
            // The butterfly curve: wings left and right of a vertical body.
            const c1 = pick(['#c77dff', '#5aa9ff', '#ff7ad9']), c2 = pick(['#ffd23f', '#7bf1a8', '#ff8c42']);
            const raw = [];
            for (let i = 0; i < 150; i++) {
                const t = i / 150 * TAU;
                const f = Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t) + Math.pow(Math.sin(t / 12), 5);
                raw.push([Math.sin(t) * f, -Math.cos(t) * f]);
            }
            const ys = raw.map(p => p[1]), cy = (Math.max(...ys) + Math.min(...ys)) / 2;
            const k = 1 / Math.max(...raw.map(p => Math.max(Math.abs(p[0]), Math.abs(p[1] - cy))));
            return raw.map(([x, y]) => pt(x * k, (y - cy) * k, Math.abs(y - cy) * k < 0.12 ? '#ffffff' : (y < cy ? c1 : c2)));
        },
        planet() {
            const out = [];
            for (let i = 0; i < 70; i++) {
                const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * 0.48;
                out.push(pt(Math.cos(a) * rr, Math.sin(a) * rr, i % 3 ? '#ffb347' : '#ff8c42'));
            }
            const ring = arc(0, 0, 1.05, 0.26, 64, (i) => i % 2 ? '#c77dff' : '#5aa9ff');
            return out.concat(rotate(ring, -0.35));
        },
        crescent() {
            const out = [], ix = 0.42, iy = -0.2, ir = 0.82;
            arc(0, 0, 1, 1, 90, '#fff4b0').forEach(p => { if (Math.hypot(p.x - ix, p.y - iy) > ir) out.push(p); });
            arc(ix, iy, ir, ir, 80, '#ffe28a').forEach(p => { if (Math.hypot(p.x, p.y) < 1) out.push(p); });
            return rotate(out, -0.3);
        },
        snowflake() {
            const out = [];
            for (let k = 0; k < 6; k++) {
                const a = k * Math.PI / 3 - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
                out.push(...line(ca * 0.08, sa * 0.08, ca, sa, 12, '#e8f7ff'));
                for (const d of [0.45, 0.72]) {
                    const bx = ca * d, by = sa * d;
                    for (const side of [-1, 1]) {
                        const b = a + side * Math.PI / 3;
                        out.push(...line(bx, by, bx + Math.cos(b) * 0.26, by + Math.sin(b) * 0.26, 5, '#9fdcff').slice(1));
                    }
                }
            }
            return out;
        },
        rainbow() {
            const cols = ['#ff4d6d', '#ff8c42', '#ffd23f', '#7bf1a8', '#5aa9ff', '#c77dff'];
            // Arcs drift down a little faster, so the colours fade downward.
            return cols.flatMap((c, i) => arc(0, 0.38, 1 - i * 0.1, 1 - i * 0.1, 30 - i * 2, c, Math.PI, TAU, { g: S * 0.06 }));
        },
        balloon() {
            const c = pick(['#ff4d6d', '#5aa9ff', '#ffd23f', '#7bf1a8', '#c77dff']);
            const out = arc(0, -0.25, 0.6, 0.76, 50, c);
            out.push(pt(-0.06, 0.56, c), pt(0.06, 0.56, c), pt(0, 0.6, c));
            for (let i = 0; i < 14; i++) {
                const t = i / 13;
                out.push(pt(Math.sin(t * Math.PI * 3) * 0.08, 0.62 + t * 0.7, '#f4f4ff', { size: S * 0.005 }));
            }
            return out;
        }
    };

    /** Sample a word, drawn in bold type, into spark points (in pixels). */
    const wordCache = {};
    function wordPoints(word) {
        const key = word + '|' + W + 'x' + H;
        if (wordCache[key]) return wordCache[key];
        const fs = 120, c = document.createElement('canvas'), x = c.getContext('2d');
        const font = '800 ' + fs + 'px "Baloo 2", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
        x.font = font;
        const w = Math.ceil(x.measureText(word).width) + 20, h = Math.ceil(fs * 1.25);
        c.width = w; c.height = h;
        x.font = font; x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left';
        x.fillText(word, 10, h / 2);
        const data = x.getImageData(0, 0, w, h).data, step = 7, raw = [];
        for (let yy = 0; yy < h; yy += step) {
            for (let xx = (yy / step) % 2 ? step / 2 : 0; xx < w; xx += step) {
                if (data[(Math.floor(yy) * w + Math.floor(xx)) * 4 + 3] > 140) raw.push([xx - w / 2, yy - h / 2]);
            }
        }
        const k = Math.min(0.84 * W / w, 0.26 * H / h, 3);
        const out = raw.map(([px, py]) => pt(px * k, py * k, 'hsl(' + Math.round((px / w + 0.5) * 300) + ',95%,65%)'));
        wordCache[key] = out;
        return out;
    }

    function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }

    function explode(r) {
        const c2 = pick(PALETTE);
        const add = (vx, vy, color, life, o) => addSpark(r, vx, vy, color, life, o);
        const ring = (n, sp, color, tilt, squash, o) => {
            for (let i = 0; i < n; i++) {
                const a = i / n * TAU, x = Math.cos(a) * sp, y = Math.sin(a) * sp * squash;
                add(x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt), color, rand(1.4, 1.8), Object.assign({ g: S * 0.07 }, o));
            }
        };
        const k = r.kind;
        if (k === 'peony' || k === 'multi') {
            for (let i = 0; i < 140; i++) {
                const a = Math.random() * TAU, sp = (0.55 + 0.45 * Math.random()) * 0.4 * S;
                add(Math.cos(a) * sp, Math.sin(a) * sp, k === 'multi' ? pick(PALETTE) : (i % 4 ? r.color : c2), rand(1.3, 1.9),
                    k === 'multi' ? { flick: Math.random() < 0.3 } : null);
            }
        } else if (k === 'ring') {
            // Tilted, so it reads as a ring in the sky rather than a flat circle.
            const tilt = rand(-0.8, 0.8), squash = rand(0.45, 0.8);
            ring(80, 0.42 * S, r.color, tilt, squash);
            ring(44, 0.22 * S, c2, tilt, squash);
        } else if (k === 'double') {
            // Two rings at right angles, like a gyroscope.
            const tilt = rand(-0.6, 0.6);
            ring(76, 0.4 * S, r.color, tilt, 0.3);
            ring(76, 0.4 * S, c2 === r.color ? '#ffffff' : c2, tilt + Math.PI / 2, 0.3);
        } else if (k === 'willow') {
            for (let i = 0; i < 120; i++) {
                const a = Math.random() * TAU, sp = rand(0.4, 1) * 0.32 * S;
                add(Math.cos(a) * sp, Math.sin(a) * sp, pick(['#ffcf6b', '#ffe3a3', '#ffb347']), rand(2.6, 3.2), { g: S * 0.09, drag: 0.35, flick: true });
            }
        } else if (k === 'heart') {
            const hk = 0.021 * S;
            for (let i = 0; i < 100; i++) {
                const t = i / 100 * TAU;
                const hx = 16 * Math.pow(Math.sin(t), 3);
                const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
                add(hx * hk, hy * hk, i % 3 ? '#ff4d6d' : '#ff9ec4', rand(1.5, 1.9), { g: S * 0.04 });
            }
        } else if (k === 'crossette') {
            // Each spark splits into smaller sparks partway through.
            for (let i = 0; i < 14; i++) {
                const a = i / 14 * TAU + rand(-0.1, 0.1), sp = 0.3 * S;
                add(Math.cos(a) * sp, Math.sin(a) * sp, r.color, 0.5, { g: S * 0.06, drag: 0.5, size: S * 0.009, split: c2 });
            }
        } else if (k === 'palm') {
            const fronds = 7;
            for (let f = 0; f < fronds; f++) {
                const a = -Math.PI / 2 + (f - (fronds - 1) / 2) * 0.45 + rand(-0.08, 0.08);
                for (let j = 0; j < 16; j++) {
                    const sp = (0.2 + j / 16 * 0.32) * S;
                    add(Math.cos(a) * sp, Math.sin(a) * sp, j % 3 ? '#ffc457' : '#9cff6e', rand(1.6, 2.2), { g: S * 0.16, drag: 0.4, size: S * 0.008 });
                }
            }
        } else if (k === 'spiral') {
            // A pinwheel: every spark's path keeps turning as it flies out.
            const arms = 5, spin = rand(2.4, 3) * (Math.random() < 0.5 ? 1 : -1);
            for (let a = 0; a < arms; a++) {
                const col = a % 2 ? r.color : c2;
                for (let j = 0; j < 22; j++) {
                    const ang = a * TAU / arms + j * 0.05 * Math.sign(spin), sp = (0.1 + j / 22 * 0.34) * S;
                    add(Math.cos(ang) * sp, Math.sin(ang) * sp, col, rand(1.4, 1.8), { spin, drag: 0.35, g: S * 0.05, size: S * 0.007 });
                }
            }
        } else if (k === 'strobe') {
            // Slow-falling glitter that twinkles on and off.
            for (let i = 0; i < 120; i++) {
                const a = Math.random() * TAU, sp = rand(0.08, 0.32) * S;
                add(Math.cos(a) * sp, Math.sin(a) * sp, pick(['#fff6d0', '#e8f0ff', '#ffe28a']), rand(2.4, 3.2),
                    { drag: 0.3, g: S * 0.05, strobe: Math.random() * TAU, size: S * 0.0065 });
            }
        } else if (k === 'chrys') {
            // Chrysanthemum: a dense ball of sparks with long trailing tails.
            for (let i = 0; i < 150; i++) {
                const a = Math.random() * TAU, sp = (0.75 + 0.25 * Math.random()) * 0.42 * S;
                add(Math.cos(a) * sp, Math.sin(a) * sp, i % 5 ? r.color : '#ffffff', rand(1.5, 2), { trail: true });
            }
        } else if (k === 'ghost') {
            // Sparks change colour as they fall.
            const [from, to] = pick([['#5aa9ff', '#ff7ad9'], ['#7bf1a8', '#c77dff'], ['#ffd23f', '#ff4d6d'], ['#9fdcff', '#7bf1a8']]);
            const c1 = hexRgb(from), cc2 = hexRgb(to);
            for (let i = 0; i < 130; i++) {
                const a = Math.random() * TAU, sp = (0.55 + 0.45 * Math.random()) * 0.38 * S;
                add(Math.cos(a) * sp, Math.sin(a) * sp, from, rand(1.6, 2.1), { fade: [c1, cc2], g: S * 0.09 });
            }
        } else if (k === 'word') {
            const word = NMB.Settings.get('skyWord').trim();
            if (word) form(r, wordPoints(word), 1, { size: S * 0.0068, g: S * 0.025 });
        } else if (SHAPE_POINTS[k]) {
            form(r, SHAPE_POINTS[k](r));
        }
        sparks.push({ x: r.x, y: r.y, vx: 0, vy: 0, color: '#fff6e0', life: 0.25, max: 0.25, size: S * 0.05, g: 0, drag: 1, core: true });
        if (sparks.length > 3400) sparks.splice(0, sparks.length - 3400);
        if (!r.silent) Sound().burst(k);
    }

    function updateFireworks(dt) {
        for (const r of rockets) {
            r.t += dt;
            const u = Math.min(1, r.t / r.dur), e = easeOut(u);
            r.x = r.x0 + (r.tx - r.x0) * e; r.y = r.y0 + (r.ty - r.y0) * e;
            for (let i = 0; i < 2; i++) {
                sparks.push({ x: r.x, y: r.y, vx: rand(-20, 20), vy: rand(20, 60), color: '#ffd9a0', life: rand(0.2, 0.4), max: 0.4, size: S * 0.004, g: S * 0.05, drag: 0.5 });
            }
            if (u >= 1) { r.done = true; explode(r); }
        }
        rockets = rockets.filter(r => !r.done);
        const born = [];
        for (const p of sparks) {
            const d = Math.pow(p.drag, dt);
            p.vx *= d; p.vy *= d;
            if (p.spin) {
                const a = p.spin * dt, c = Math.cos(a), s = Math.sin(a), vx = p.vx;
                p.vx = vx * c - p.vy * s; p.vy = vx * s + p.vy * c;
            }
            p.vy += p.g * dt;
            p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
            if (p.trail && Math.random() < 0.5) {
                born.push({ x: p.x, y: p.y, vx: 0, vy: 0, color: p.color, life: 0.35, max: 0.6, size: p.size * 0.6, g: S * 0.02, drag: 1 });
            }
            if (p.split && p.life <= 0) {
                for (let i = 0; i < 4; i++) {
                    const a = i / 4 * TAU + rand(0, 1), sp = 0.16 * S;
                    born.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: p.split, life: rand(0.8, 1.1), max: 1.1, size: S * 0.0055, g: S * 0.1, drag: 0.3 });
                }
            }
        }
        sparks = sparks.filter(p => p.life > 0).concat(born);
    }

    function hill(yFrac, amp, freq, phase, color) {
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, H * yFrac + Math.sin(x / W * freq * TAU + phase) * amp * H);
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }

    function drawFireworks(dt) {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#060924'); g.addColorStop(0.55, '#1a1452'); g.addColorStop(0.85, '#3a2470'); g.addColorStop(1, '#5a2f7c');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#fff';
        for (const s of stars) {
            ctx.globalAlpha = 0.3 + 0.35 * Math.sin(time * s.s + s.p);
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;

        // The moon, with a soft halo.
        const mx = W * 0.14, my = H * 0.16, mr = S * 0.055;
        const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 4);
        halo.addColorStop(0, 'rgba(255,244,214,0.28)'); halo.addColorStop(1, 'rgba(255,244,214,0)');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(mx, my, mr * 4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff4d6'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(214,200,170,0.45)';
        [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [-0.05, 0.4, 0.12]].forEach(([dx, dy, rr]) => {
            ctx.beginPath(); ctx.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, TAU); ctx.fill();
        });


        if (!sparks.length && !rockets.length) fctx.clearRect(0, 0, W, H);
        else {
            fctx.globalCompositeOperation = 'destination-out';
            fctx.fillStyle = `rgba(0,0,0,${1 - Math.pow(0.78, dt * 60)})`;
            fctx.fillRect(0, 0, W, H);
            fctx.globalCompositeOperation = 'lighter';
            for (const p of sparks) {
                let a = clamp(p.life / p.max, 0, 1);
                if (p.flick) a *= 0.5 + 0.5 * Math.random();
                if (p.strobe !== undefined) a *= Math.sin(time * 22 + p.strobe) > 0.1 ? 1 : 0.06;
                if (p.soft) a *= p.soft;
                let color = p.color;
                if (p.fade) {
                    const u = 1 - a, f0 = p.fade[0], f1 = p.fade[1];
                    color = 'rgb(' + Math.round(f0[0] + (f1[0] - f0[0]) * u) + ',' + Math.round(f0[1] + (f1[1] - f0[1]) * u) + ',' + Math.round(f0[2] + (f1[2] - f0[2]) * u) + ')';
                    a = Math.min(1, a * 1.6);
                }
                fctx.globalAlpha = a; fctx.fillStyle = color;
                fctx.beginPath();
                fctx.arc(p.x, p.y, p.core ? p.size * (1.5 - a * 0.5) : p.size * (0.6 + 0.4 * a), 0, TAU);
                fctx.fill();
            }
            fctx.fillStyle = '#fff';
            for (const r of rockets) { fctx.globalAlpha = 1; fctx.beginPath(); fctx.arc(r.x, r.y, S * 0.008, 0, TAU); fctx.fill(); }
            fctx.globalAlpha = 1; fctx.globalCompositeOperation = 'source-over';
        }
        // Bloom: a quarter-size copy drawn back up, soft and glowing.
        gctx.clearRect(0, 0, glow.width, glow.height);
        gctx.drawImage(fx, 0, 0, glow.width, glow.height);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.75;
        ctx.drawImage(glow, 0, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.drawImage(fx, 0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';

        ctx.drawImage(city, 0, H * 0.7, W, H * 0.3);
        hill(0.95, 0.01, 1.4, 0.8, '#0a0820');
    }

    // --- bubbles -----------------------------------------------------------------
    //
    // A friendly whale swims slowly back and forth near the bottom and blows
    // the bubbles. Every press makes it squash, puff out bubbles and surge
    // forward straight away - the biggest, clearest reaction on screen - while
    // the fish, the jellyfish and the light on the sand stay slow and quiet.

    const MAX_BUBBLES = 60, MAX_PARTS = 400, MAX_CRITTERS = 6;
    const CREATURE_EVERY = 5, GIANT_EVERY = 8;

    let shells = [], critters = [], jellies = [];
    let bubblePresses = 0, mergeCooldown = 0;
    const whale = { x: 0.5, dir: 1, turning: false, turnT: 0, puff: 0, surge: 0, blink: 0, nextBlink: 3 };
    const WHALE_MIN = 0.24, WHALE_MAX = 0.76, WHALE_SPEED = 0.03, WHALE_TURN = 0.8;

    function makeSeaFloor() {
        shells = [];
        const n = Math.round(W / 160) + 2;
        for (let i = 0; i < n; i++) {
            const x = rand(0.03, 0.97);
            shells.push({ x, kind: pick(['star', 'shell', 'rock', 'rock']), s: rand(0.7, 1.2), c: pick(['#ff8a65', '#ffb74d', '#f48fb1', '#ce93d8']) });
        }
    }

    function newFish(i) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        return {
            x: i === undefined ? (dir > 0 ? -0.15 : 1.15) : rand(0, 1), y: rand(0.15, 0.6), dir,
            v: rand(0.025, 0.05), s: rand(0.7, 1.2), ph: Math.random() * TAU,
            c: pick([['#ffb300', '#ff7043'], ['#4fc3f7', '#0288d1'], ['#f06292', '#ba68c8'], ['#aed581', '#43a047']])
        };
    }

    function newJelly(start) {
        return { x: rand(0.1, 0.9), y: start ? rand(0.25, 0.75) : 1.15, s: rand(0.8, 1.2), ph: Math.random() * TAU, hue: pick([300, 320, 200, 270]) };
    }

    /**
     * Where the whale is and how it is turned, from the window size. The
     * whale is drawn in units of u, facing right; `fx` flips it to face left
     * (passing through zero mid-turn) and carries the press squash.
     */
    function whalePose() {
        const u = S * 0.095, sq = squash();
        const facing = whale.turning ? -whale.dir * Math.cos(Math.PI * whale.turnT) : whale.dir;
        return {
            u, x: whale.x * W, y: H * 0.9 - u * 1.15 + Math.sin(time * 1.1) * u * 0.06,
            pitch: Math.sin(time * 0.9) * 0.05, fx: facing * sq.sx, sy: sq.sy
        };
    }

    /** A point on the whale (in its own units) in screen coordinates. */
    function whalePoint(lx, ly) {
        const p = whalePose(), X = lx * p.u * p.fx, Y = ly * p.u * p.sy, c = Math.cos(p.pitch), s = Math.sin(p.pitch);
        return { x: p.x + X * c - Y * s, y: p.y + X * s + Y * c };
    }

    /** Just above the blowhole, where new bubbles come out. */
    function bubbleStart() { return whalePoint(0.35, -1.15); }

    function updateWhale(dt) {
        whale.puff = Math.max(0, whale.puff - dt / 0.45);
        whale.surge = Math.max(0, whale.surge - dt / 0.9);
        whale.nextBlink -= dt;
        if (whale.nextBlink <= 0) { whale.blink = 0.15; whale.nextBlink = rand(2.5, 5); }
        whale.blink = Math.max(0, whale.blink - dt);
        if (whale.turning) {
            whale.turnT += dt / WHALE_TURN;
            if (whale.turnT >= 1) { whale.turning = false; whale.turnT = 0; }
            return;
        }
        // Swims slowly, with a little surge forward on every press.
        whale.x += whale.dir * (WHALE_SPEED + 0.09 * whale.surge) * dt;
        if ((whale.dir > 0 && whale.x >= WHALE_MAX) || (whale.dir < 0 && whale.x <= WHALE_MIN)) {
            whale.x = clamp(whale.x, WHALE_MIN, WHALE_MAX);
            whale.dir = -whale.dir;
            whale.turning = true;
            whale.turnT = 0;
        }
    }

    function squash() {
        // A quick stretch up, a little squash down, then back: 0.45 seconds.
        const t = clamp(1 - whale.puff, 0, 1), k = whale.puff > 0 ? Math.sin(t * Math.PI) : 0;
        const bounce = whale.puff > 0 ? Math.sin(t * Math.PI * 2) : 0;
        return { sx: 1 - 0.07 * k + 0.03 * bounce, sy: 1 + 0.16 * k - 0.05 * bounce };
    }

    function newBubble(x, y, o) {
        const shapeRoll = Math.random();
        return Object.assign({
            x, y, r: S * rand(0.03, 0.09), vx: rand(-0.35, 0.35) * S, vy: -rand(0.55, 1.0) * S, rise: rand(0.08, 0.16) * S,
            ph: Math.random() * TAU, hue: rand(0, 360), age: 0, popAt: rand(2.4, 5.2),
            shape: shapeRoll < 0.08 ? 'heart' : shapeRoll < 0.16 ? 'star' : 'round',
            wob: Math.random() < 0.35 ? rand(0.05, 0.09) : 0, squish: 0
        }, o);
    }

    function blowBubbles(silent) {
        bubblePresses++;
        whale.puff = 1;
        whale.surge = 1;
        whale.blink = 0;
        const top = bubbleStart();
        // One giant at a time, however fast the presses come.
        const giant = bubblePresses % GIANT_EVERY === 0 && !bubbles.some(b => b.giant);
        const creature = !giant && bubblePresses % CREATURE_EVERY === 0;
        const n = giant ? Math.floor(rand(3, 5)) : Math.floor(rand(6, 10));
        for (let i = 0; i < n; i++) {
            const big = i === 0 && !giant && Math.random() < 0.4;
            bubbles.push(newBubble(top.x + rand(-0.02, 0.02) * W, top.y, big ? { r: S * rand(0.1, 0.13), wob: 0.06, popAt: rand(4, 5.5), shape: 'round' } : null));
        }
        if (creature) {
            bubbles.push(newBubble(top.x, top.y, {
                r: S * 0.085, shape: 'round', wob: 0.04, vy: -S * 0.45, rise: S * 0.07, popAt: rand(3.2, 4.2),
                critter: pick(['fish', 'starfish', 'duck']), critterFlip: Math.random() < 0.5 ? -1 : 1
            }));
        }
        if (giant) {
            bubbles.push(newBubble(top.x, top.y, {
                r: S * 0.19, shape: 'round', wob: 0.1, vx: rand(-0.08, 0.08) * S, vy: -S * 0.35, rise: S * 0.055,
                popAt: rand(4.6, 5.4), giant: true
            }));
        }
        // Over the cap, the oldest bubbles pop first (never the giant mid-rise).
        const extra = bubbles.length - MAX_BUBBLES;
        for (let i = 0, k = 0; i < bubbles.length && k < extra; i++) if (!bubbles[i].giant) { bubbles[i].popAt = 0; k++; }
        if (!silent) Sound().blow();
        bubbles.forEach(b => { if (b.silent === undefined) b.silent = silent; });
    }

    function popBubble(b) {
        if (b.y < -b.r) return;
        const col = a => `hsla(${Math.round(b.hue)},95%,80%,${a})`;
        parts.push({ type: 'ring', x: b.x, y: b.y, r: b.r, life: 0.3, max: 0.3, color: `hsla(${Math.round(b.hue + 40)},95%,88%,A)` });
        const nDrops = b.giant ? 22 : 9;
        for (let i = 0; i < nDrops; i++) {
            const a = i / nDrops * TAU + rand(-0.2, 0.2), sp = S * rand(0.22, 0.38) * (b.giant ? 1.4 : 1);
            parts.push({ type: 'drop', x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4, max: 0.4, size: Math.max(1.5, S * 0.006), color: `hsla(${Math.round(b.hue + i * 25)},95%,78%,A)` });
        }
        for (let i = 0; i < (b.giant ? 8 : 3); i++) {
            const a = Math.random() * TAU;
            parts.push({ type: 'twinkle', x: b.x + Math.cos(a) * b.r * 0.6, y: b.y + Math.sin(a) * b.r * 0.6, vx: Math.cos(a) * S * 0.15, vy: Math.sin(a) * S * 0.15, life: 0.6, max: 0.6, size: S * 0.012, color: col });
        }
        if (b.critter) releaseCritter(b);
        if (b.giant) {
            // A shower of little bubbles.
            const room = Math.max(0, MAX_BUBBLES - bubbles.length);
            for (let i = 0; i < Math.min(18, room); i++) {
                const a = Math.random() * TAU, sp = S * rand(0.2, 0.55);
                bubbles.push(newBubble(b.x + Math.cos(a) * b.r * 0.5, b.y + Math.sin(a) * b.r * 0.5,
                    { r: S * rand(0.02, 0.045), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, popAt: rand(1.6, 4), silent: b.silent, shape: 'round', wob: 0 }));
            }
        }
        if (b.silent) return;
        if (b.giant) Sound().giantPop();
        else if (b.critter) Sound().splash();
        else Sound().pop(clamp((b.r / S - 0.02) / 0.12, 0, 1));
    }

    function releaseCritter(b) {
        if (critters.length >= MAX_CRITTERS) critters.shift();
        const c = { kind: b.critter, x: b.x, y: b.y, s: b.r * 0.55, t: 0, flip: b.critterFlip, rot: 0, alpha: 1 };
        if (c.kind === 'fish') { c.vx = c.flip * S * 0.22; c.vy = 0; }
        else if (c.kind === 'starfish') {
            // Drifts out to the side as it sinks, so it settles on open sand, not on the whale.
            c.vx = (c.x < W * 0.5 ? -1 : 1) * S * rand(0.06, 0.1); c.vy = S * 0.06;
            c.spin = rand(0.4, 0.8) * (Math.random() < 0.5 ? 1 : -1);
        }
        else { c.vx = c.flip * S * 0.03; c.vy = -S * 0.09; }
        critters.push(c);
    }

    function updateBubbles(dt) {
        updateWhale(dt);
        mergeCooldown -= dt;

        for (const b of bubbles) {
            b.age += dt; b.hue += dt * 40;
            b.vx *= Math.pow(0.3, dt);
            b.vy += (-b.rise - b.vy) * (1 - Math.pow(0.2, dt));
            b.x += (b.vx + Math.sin(time * 1.5 + b.ph) * S * 0.04) * dt;
            b.y += b.vy * dt;
            b.squish = Math.max(0, b.squish - dt * 2.5);
            if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
            if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
            if (b.giant && !b.stretched && b.age >= b.popAt - 0.7) { b.stretched = true; if (!b.silent) Sound().stretch(); }
            // Creature and giant bubbles always pop where they can be seen.
            if ((b.critter || b.giant) && b.y < H * 0.2 + b.r * 0.5) b.popAt = Math.min(b.popAt, b.age + (b.giant && !b.stretched ? 0.7 : 0));
            if (b.age >= b.popAt || b.y < -b.r) { b.gone = true; popBubble(b); }
        }
        touchBubbles();
        bubbles = bubbles.filter(b => !b.gone);

        for (const c of critters) {
            c.t += dt;
            if (c.kind === 'fish') { c.x += c.vx * dt; c.y += Math.sin(c.t * 4) * S * 0.03 * dt; }
            else if (c.kind === 'starfish') {
                if (c.y < H * 0.93) { c.x += c.vx * dt; c.y = Math.min(c.y + c.vy * dt, H * 0.93); c.rot += c.spin * dt; }
                else if (c.t > 7) c.alpha = Math.max(0, c.alpha - dt);   // rests on the sand, then fades
            } else { c.x += c.vx * dt + Math.sin(c.t * 2) * S * 0.02 * dt; c.y += c.vy * dt; }
        }
        critters = critters.filter(c => c.alpha > 0 && c.x > -S * 0.2 && c.x < W + S * 0.2 && c.y > -S * 0.2);

        for (let i = 0; i < fish.length; i++) {
            const f = fish[i];
            f.x += f.dir * f.v * dt;
            if (f.x > 1.2 || f.x < -0.2) fish[i] = newFish();
        }
        for (let i = 0; i < jellies.length; i++) {
            const j = jellies[i];
            // A slow pulse: drift up a little on each squeeze.
            j.y -= (0.006 + 0.012 * Math.max(0, Math.sin(time * 1.4 + j.ph))) * dt;
            j.x += Math.sin(time * 0.2 + j.ph) * 0.004 * dt;
            if (j.y < -0.2) jellies[i] = newJelly(false);
        }
        // A thin stream of tiny bubbles from the seaweed, just for life.
        if (Math.random() < dt * 1.2) {
            parts.push({ type: 'fizz', x: pick([0.07, 0.16, 0.86, 0.94]) * W, y: H * 0.86, vy: -S * rand(0.08, 0.14), life: 4, max: 4, size: S * rand(0.004, 0.008), ph: Math.random() * TAU });
        }
    }

    /**
     * Bubbles nudge each other apart, and now and then two small ones join
     * into one bigger, wobblier bubble. Sixty bubbles is under 1800 pairs.
     */
    function touchBubbles() {
        for (let i = 0; i < bubbles.length; i++) {
            const a = bubbles[i];
            if (a.gone || a.age < 0.3) continue;
            for (let j = i + 1; j < bubbles.length; j++) {
                const b = bubbles[j];
                if (b.gone || b.age < 0.3) continue;
                const dx = b.x - a.x, dy = b.y - a.y, min = (a.r + b.r) * 0.92, d2 = dx * dx + dy * dy;
                if (d2 >= min * min || d2 === 0) continue;
                const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) * 0.25;
                if (mergeCooldown <= 0 && !a.critter && !b.critter && !a.giant && !b.giant &&
                    a.r < S * 0.07 && b.r < S * 0.07 && a.age > 0.8 && b.age > 0.8 && Math.random() < 0.03) {
                    mergeCooldown = rand(3, 6);
                    const big = a.r >= b.r ? a : b, small = big === a ? b : a;
                    big.x = (a.x * a.r + b.x * b.r) / (a.r + b.r); big.y = (a.y * a.r + b.y * b.r) / (a.r + b.r);
                    big.r = Math.sqrt(a.r * a.r + b.r * b.r);
                    big.wob = Math.max(big.wob, 0.07); big.squish = 1; big.shape = 'round';
                    big.popAt = Math.max(big.popAt, big.age + 1.5);
                    small.gone = true;
                    if (!big.silent) Sound().merge();
                    if (a.gone) break;
                    continue;
                }
                a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
                a.vx -= nx * S * 0.04; b.vx += nx * S * 0.04;
                a.squish = Math.min(1, a.squish + 0.25); b.squish = Math.min(1, b.squish + 0.25);
            }
        }
    }

    function bubblePath(shape, r) {
        ctx.beginPath();
        if (shape === 'heart') {
            ctx.moveTo(0, r * 0.95);
            ctx.bezierCurveTo(-r * 1.25, r * 0.05, -r * 0.95, -r * 1.05, 0, -r * 0.42);
            ctx.bezierCurveTo(r * 0.95, -r * 1.05, r * 1.25, r * 0.05, 0, r * 0.95);
        } else if (shape === 'star') {
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.55 : r * 1.08;
                ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath();
        } else ctx.arc(0, 0, r, 0, TAU);
    }

    function drawBubble(b) {
        const r = b.r * easeOut(clamp(b.age / 0.25, 0, 1));
        if (r < 1) return;
        // Wobbly bubbles squish as they float, and every bubble squishes when it bumps another.
        let wob = (b.wob ? Math.sin(time * 6 + b.ph) * b.wob : 0) + Math.sin(time * 14 + b.ph) * 0.06 * b.squish;
        let sy = 1 - wob;
        if (b.giant && b.stretched) sy += 0.12 * clamp((b.age - (b.popAt - 0.7)) / 0.7, 0, 1);  // stretching before it pops
        ctx.save(); ctx.translate(b.x, b.y);
        if (b.critter) drawCritter(b.critter, 0, 0, r * 0.55, b.age, b.critterFlip, 0, 1);
        if (b.shape !== 'round') ctx.rotate(Math.sin(time * 1.2 + b.ph) * 0.2);
        ctx.scale(1 + wob, sy);
        const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        g.addColorStop(0, 'rgba(255,255,255,0.06)');
        g.addColorStop(0.72, `hsla(${b.hue},90%,78%,0.12)`);
        g.addColorStop(0.92, `hsla(${b.hue + 70},95%,82%,0.5)`);
        g.addColorStop(1, `hsla(${b.hue + 140},95%,88%,0.15)`);
        bubblePath(b.shape, r);
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = `hsla(${b.hue + 30},90%,90%,0.7)`; ctx.lineWidth = Math.max(1.5, r * (b.shape === 'round' ? 0.04 : 0.06)); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.beginPath(); ctx.ellipse(-r * 0.36, -r * 0.4, r * 0.22, r * 0.11, -0.7, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.38, r * 0.34, r * 0.06, 0, TAU); ctx.fill();
        ctx.restore();
    }

    /** The little creatures that ride in bubbles: a fish, a starfish or a rubber duck. */
    function drawCritter(kind, x, y, s, t, flip, rot, alpha) {
        ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha;
        if (kind === 'fish') {
            ctx.scale(flip, 1);
            const wag = Math.sin(t * 9) * 0.3;
            ctx.fillStyle = '#ff7043';
            ctx.beginPath(); ctx.moveTo(-s * 0.55, 0); ctx.lineTo(-s, -s * 0.4 + wag * s * 0.3); ctx.lineTo(-s, s * 0.4 + wag * s * 0.3); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s * 0.45, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s * 0.35, -s * 0.08, s * 0.14, 0, TAU); ctx.fill();
            ctx.fillStyle = '#1a1a2e'; ctx.beginPath(); ctx.arc(s * 0.39, -s * 0.07, s * 0.07, 0, TAU); ctx.fill();
        } else if (kind === 'starfish') {
            ctx.rotate(rot);
            ctx.fillStyle = '#ff8a65'; ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.42 : s * 0.95;
                ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#4a2c1a';
            ctx.beginPath(); ctx.arc(-s * 0.15, -s * 0.05, s * 0.07, 0, TAU); ctx.arc(s * 0.15, -s * 0.05, s * 0.07, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#4a2c1a'; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(0, s * 0.05, s * 0.14, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
        } else {
            ctx.scale(flip, 1); ctx.rotate(Math.sin(t * 2) * 0.12);
            ctx.fillStyle = '#ffd23f';
            ctx.beginPath(); ctx.ellipse(-s * 0.05, s * 0.2, s * 0.75, s * 0.45, 0, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc(s * 0.35, -s * 0.3, s * 0.38, 0, TAU); ctx.fill();
            ctx.fillStyle = '#ff8c42';
            ctx.beginPath(); ctx.ellipse(s * 0.78, -s * 0.22, s * 0.22, s * 0.1, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = '#1a1a2e'; ctx.beginPath(); ctx.arc(s * 0.45, -s * 0.4, s * 0.07, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-s * 0.2, s * 0.05, s * 0.3, s * 0.12, -0.2, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }

    /**
     * The whale, in a sticker-cartoon style: a thick dark outline, a big
     * round head tapering to a tail that curls up into flukes, a cream
     * grooved belly, a big glossy eye and a long smile. Drawn facing right in
     * units of u; whalePose() places, flips and squashes it.
     */
    const WHALE_INK = '#13263f';

    /**
     * The whole whale as ONE shape - head, body, tail stalk and both flukes -
     * so the outline runs around it without a seam where the tail meets the
     * body. The flukes are drawn in their own frame (turned by `sway`) and
     * mapped into the body's, which keeps the curves joined as they swing.
     */
    function whaleBodyPath(sway) {
        const a = -0.45 + (sway || 0), c = Math.cos(a) * 1.3, s = Math.sin(a) * 1.3;
        const T = (x, y) => [-1.54 + x * c - y * s, -0.84 + x * s + y * c];
        const curve = (x1, y1, x2, y2, x, y) => {
            const p1 = T(x1, y1), p2 = T(x2, y2), p = T(x, y);
            ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p[0], p[1]);
        };
        const base = T(-0.07, 0.02);
        ctx.beginPath();
        ctx.moveTo(-0.15, -0.98);
        ctx.bezierCurveTo(0.55, -1.08, 1.38, -0.78, 1.42, -0.02);         // over the head
        ctx.bezierCurveTo(1.46, 0.62, 0.92, 0.98, 0.1, 0.92);              // chin and belly
        ctx.bezierCurveTo(-0.62, 0.86, -1.12, 0.55, -1.42, 0.02);          // belly to tail
        ctx.bezierCurveTo(-1.58, -0.24, -1.66, -0.5, base[0], base[1]);    // under the tail, curling up
        curve(-0.2, -0.12, -0.45, -0.22, -0.68, -0.44);                    // out to one fluke tip
        curve(-0.46, -0.48, -0.18, -0.42, 0, -0.27);                       // back in to the notch
        curve(0.18, -0.42, 0.46, -0.48, 0.68, -0.44);                      // out to the other tip
        curve(0.45, -0.22, 0.2, -0.12, 0.07, 0.02);                        // back down to the stalk
        ctx.bezierCurveTo(-1.42, -0.6, -1.25, -0.46, -1.0, -0.62);         // top of the stalk
        ctx.bezierCurveTo(-0.75, -0.86, -0.45, -0.96, -0.15, -0.98);       // the back
        ctx.closePath();
    }

    function finPath() {
        ctx.beginPath();
        ctx.moveTo(0.06, -0.02);
        ctx.bezierCurveTo(0.14, 0.3, -0.1, 0.62, -0.44, 0.68);
        ctx.bezierCurveTo(-0.4, 0.4, -0.24, 0.1, 0.06, -0.02);
        ctx.closePath();
    }

    function inked(fill, width) {
        ctx.fillStyle = fill; ctx.fill();
        ctx.strokeStyle = WHALE_INK; ctx.lineWidth = width || 0.065; ctx.stroke();
    }

    function drawWhale() {
        const p = whalePose(), happy = whale.puff > 0.2, blinking = whale.blink > 0;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.pitch); ctx.scale(p.u * p.fx, p.u * p.sy);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const paddle = Math.sin(time * 2.2) * 0.22 - whale.puff * 0.35;
        const sway = Math.sin(time * 1.8) * 0.16 + whale.surge * Math.sin(time * 14) * 0.12;

        // The far flipper, peeking out from behind.
        ctx.save(); ctx.translate(-0.15, 0.62); ctx.rotate(0.35 - paddle * 0.6); finPath(); inked('#24558f'); ctx.restore();
        // A small fin on the back.
        ctx.beginPath(); ctx.moveTo(-1.0, -0.66); ctx.quadraticCurveTo(-0.86, -1.02, -0.62, -0.84); ctx.lineTo(-0.7, -0.7); ctx.closePath();
        inked('#3b8ad6');

        // Body, tail and flukes in one piece.
        whaleBodyPath(sway);
        const body = ctx.createLinearGradient(0, -1.4, 0, 0.9);
        body.addColorStop(0, '#5db4ef'); body.addColorStop(1, '#2f7fcd');
        ctx.fillStyle = body; ctx.fill();

        // Cream belly with its grooves and the smile line, all clipped to the
        // body so nothing pokes out past the outline.
        ctx.save(); whaleBodyPath(sway); ctx.clip();
        ctx.beginPath();
        ctx.moveTo(1.55, -0.02); ctx.bezierCurveTo(1.0, 0.28, 0.0, 0.42, -1.45, 0.16);
        ctx.lineTo(-1.5, 1.2); ctx.lineTo(1.6, 1.2); ctx.closePath();
        ctx.fillStyle = '#f6f0da'; ctx.fill();
        ctx.strokeStyle = 'rgba(120,108,74,0.55)'; ctx.lineWidth = 0.03;
        for (let k = 1; k <= 4; k++) {
            const d = k * 0.13;
            ctx.beginPath(); ctx.moveTo(1.36 - d * 0.6, 0.1 + d * 0.9);
            ctx.bezierCurveTo(0.9, 0.36 + d, 0.0, 0.48 + d, -1.3, 0.26 + d * 0.8); ctx.stroke();
        }
        // The belly line doubles as the long smile.
        ctx.strokeStyle = WHALE_INK; ctx.lineWidth = 0.055;
        ctx.beginPath(); ctx.moveTo(1.6, -0.06); ctx.bezierCurveTo(1.0, 0.28, 0.0, 0.42, -1.6, 0.14); ctx.stroke();
        ctx.restore();
        // A dimple at the end of the smile.
        ctx.strokeStyle = WHALE_INK; ctx.lineWidth = 0.065;
        ctx.beginPath(); ctx.moveTo(0.66, 0.26); ctx.quadraticCurveTo(0.52, 0.24, 0.47, 0.1); ctx.stroke();
        if (happy) {   // a little open mouth while it blows
            ctx.beginPath(); ctx.moveTo(1.38, 0.05); ctx.quadraticCurveTo(1.12, 0.36, 0.86, 0.22); ctx.quadraticCurveTo(1.1, 0.2, 1.38, 0.05);
            ctx.fillStyle = '#c2405f'; ctx.fill(); ctx.stroke();
        }
        // Outline over everything on the body.
        whaleBodyPath(sway); ctx.strokeStyle = WHALE_INK; ctx.lineWidth = 0.075; ctx.stroke();

        // Shine on the back and spots on the forehead.
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.ellipse(-0.15, -0.78, 0.45, 0.07, -0.08, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff';
        [[0.98, -0.66, 0.05], [1.13, -0.52, 0.04], [0.84, -0.78, 0.035]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); });

        // Blowhole, opening as it blows.
        ctx.fillStyle = WHALE_INK;
        ctx.beginPath(); ctx.ellipse(0.35, -1.0, 0.1, 0.03 + whale.puff * 0.03, 0, 0, TAU); ctx.fill();

        // Face: blush, then a big glossy eye (closed and happy while it blows).
        ctx.fillStyle = 'rgba(255,120,160,0.5)';
        ctx.beginPath(); ctx.ellipse(0.98, 0.02, 0.13, 0.075, 0, 0, TAU); ctx.fill();
        if (happy || blinking) {
            ctx.strokeStyle = WHALE_INK; ctx.lineWidth = 0.065;
            ctx.beginPath(); ctx.arc(0.72, -0.13, 0.13, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.arc(0.72, -0.2, 0.17, 0, TAU); inked('#ffffff', 0.045);
            ctx.fillStyle = WHALE_INK; ctx.beginPath(); ctx.arc(0.76, -0.18, 0.12, 0, TAU); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(0.8, -0.24, 0.045, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc(0.71, -0.13, 0.02, 0, TAU); ctx.fill();
        }

        // Near flipper, paddling.
        ctx.save(); ctx.translate(0.12, 0.42); ctx.rotate(paddle); finPath(); inked('#3d8ad8'); ctx.restore();

        ctx.restore();
    }

    function drawJelly(j) {
        const x = j.x * W, y = j.y * H, s = S * 0.045 * j.s, pulse = Math.sin(time * 1.4 + j.ph);
        ctx.save(); ctx.translate(x, y);
        ctx.strokeStyle = `hsla(${j.hue},80%,85%,0.3)`; ctx.lineWidth = Math.max(1.5, s * 0.08); ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
            const tx = (i - 1.5) * s * 0.35;
            ctx.beginPath(); ctx.moveTo(tx, 0);
            for (let k = 1; k <= 6; k++) ctx.lineTo(tx + Math.sin(time * 2 + i + k * 0.8) * s * 0.12, k * s * 0.32);
            ctx.stroke();
        }
        ctx.fillStyle = `hsla(${j.hue},85%,82%,0.35)`;
        ctx.beginPath(); ctx.ellipse(0, 0, s * (1 + 0.08 * pulse), s * (0.8 - 0.08 * pulse), 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.ellipse(-s * 0.35, -s * 0.45, s * 0.25, s * 0.1, -0.4, 0, TAU); ctx.fill();
        ctx.restore();
    }

    function drawFish(f) {
        const x = f.x * W, y = f.y * H + Math.sin(time * 1.2 + f.ph) * S * 0.015, u = S * 0.035 * f.s;
        ctx.save(); ctx.translate(x, y); ctx.scale(f.dir, 1);
        const wag = Math.sin(time * 7 + f.ph) * 0.35;
        ctx.fillStyle = f.c[1];
        ctx.beginPath(); ctx.moveTo(-u * 0.9, 0);
        ctx.lineTo(-u * 1.7, -u * 0.6 + wag * u * 0.4); ctx.lineTo(-u * 1.7, u * 0.6 + wag * u * 0.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = f.c[0];
        ctx.beginPath(); ctx.ellipse(0, 0, u * 1.1, u * 0.7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(u * 0.1, -u * 0.25, u * 0.6, u * 0.2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(u * 0.55, -u * 0.12, u * 0.2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1a2e'; ctx.beginPath(); ctx.arc(u * 0.6, -u * 0.1, u * 0.11, 0, TAU); ctx.fill();
        ctx.restore();
    }

    function drawSeaFloor() {
        hill(0.92, 0.012, 1.5, 1.0, '#e9d49c');
        hill(0.95, 0.008, 2.3, 2.4, '#dcc184');
        // Soft light rippling over the sand.
        for (let i = 0; i < 7; i++) {
            const x = (((i * 0.163 + time * 0.012 * (i % 2 ? 1 : -1)) % 1) + 1) % 1 * W;
            const a = 0.08 + 0.06 * Math.sin(time * 0.7 + i * 1.7);
            ctx.fillStyle = `rgba(255,255,240,${a.toFixed(3)})`;
            ctx.beginPath(); ctx.ellipse(x, H * (0.945 + (i % 3) * 0.015), S * 0.06 * (1 + 0.3 * Math.sin(time * 0.5 + i)), S * 0.007, 0, 0, TAU); ctx.fill();
        }
        for (const s of shells) {
            const x = s.x * W, y = H * 0.94, u = S * 0.022 * s.s;
            if (s.kind === 'rock') {
                ctx.fillStyle = '#8d8a9c'; ctx.beginPath(); ctx.ellipse(x, y, u * 1.6, u, 0, Math.PI, 0); ctx.fill();
            } else if (s.kind === 'star') {
                ctx.fillStyle = s.c; ctx.beginPath();
                for (let i = 0; i < 10; i++) {
                    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? u * 0.45 : u;
                    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
                }
                ctx.closePath(); ctx.fill();
            } else {
                ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(x, y, u, Math.PI, 0); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(1, u * 0.12);
                for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + i * u * 0.4, y - u * 0.85); ctx.stroke(); }
            }
        }
    }

    function drawBubbleScene() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0d2a7a'); g.addColorStop(0.55, '#2a78c8'); g.addColorStop(1, '#5fc2e8');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        for (let i = 0; i < 4; i++) {
            const x = W * (0.12 + i * 0.26) + Math.sin(time * 0.3 + i) * W * 0.05;
            ctx.beginPath(); ctx.moveTo(x - W * 0.04, 0); ctx.lineTo(x + W * 0.04, 0); ctx.lineTo(x + W * 0.13, H); ctx.lineTo(x - W * 0.02, H); ctx.closePath(); ctx.fill();
        }
        for (const j of jellies) drawJelly(j);
        for (const f of fish) drawFish(f);
        ctx.lineCap = 'round';
        [0.06, 0.15, 0.27, 0.73, 0.85, 0.94].forEach((xf, i) => {
            const bx = xf * W, h = H * (0.14 + (i % 3) * 0.05);
            ctx.strokeStyle = i % 2 ? '#2e9e6b' : '#3dbb7c'; ctx.lineWidth = Math.max(6, S * 0.018);
            ctx.beginPath(); ctx.moveTo(bx, H);
            for (let k = 1; k <= 8; k++) { const y = H - h * k / 8; ctx.lineTo(bx + Math.sin(time * 1.2 + k * 0.7 + i) * S * 0.018 * k / 8 * 3, y); }
            ctx.stroke();
        });
        drawSeaFloor();
        drawWhale();
        for (const c of critters) drawCritter(c.kind, c.x, c.y, c.s, c.t, c.flip, c.rot, c.alpha);
        for (const b of bubbles) drawBubble(b);
    }

    // --- flowers -----------------------------------------------------------------
    //
    // Each press grows a flower - a tulip, sunflower, daisy, tall lollipop
    // flower or a smiley flower, each with its own instrument - and its
    // neighbours wiggle and smile. Every so often a surprise mushroom or giant
    // sunflower pops up. The press that fills the garden starts a big finish
    // (a dance, a rainbow or butterflies), and the next press clears it in one
    // of four ways: the breeze, a bunny hopping through, butterflies carrying
    // the petals off, or a rain cloud. Every third garden is a night garden.

    const FLOWER_COLORS = ['#ff5d8f', '#ff8c42', '#b06cf5', '#4f9dff', '#ff4d6d', '#ffb703', '#f78fb3', '#2ec4b6'];
    const TULIP_COLORS = ['#ff4d6d', '#ff8fb1', '#ffc93c', '#b06cf5', '#ff8c42'];
    const LOLLY_COLORS = [['#ff5d8f', '#ffffff'], ['#4f9dff', '#ffffff'], ['#b06cf5', '#ffd23f'], ['#2ec4b6', '#ffffff'], ['#ff8c42', '#fff3b0']];
    const CLASSIC_STYLES = ['round', 'pointy', 'double', 'heart'];
    const FLOWER_KINDS = ['tulip', 'sunflower', 'daisy', 'lollipop', 'classic'];
    const RESETS = ['breeze', 'bunny', 'carry', 'rain'];
    const FINISHES = ['dance', 'rainbow', 'butterflies'];
    /** At night there is no rainbow and no butterflies: fireflies rise instead. */
    const NIGHT_FINISHES = ['dance', 'fireflies'];
    let risingFlies = [];

    /** A butterfly by day, a soft pale moth once the sky is dark. */
    function addFlyer(o) {
        if (butterflies.length >= MAX_BUTTERFLIES) return;
        butterflies.push(Object.assign({ t: 0, ph: Math.random() * TAU, c: pick(['#ffca28', '#ab47bc', '#29b6f6', '#ff7043', '#7bf1a8']), moth: nightMix > 0.5 }, o));
    }
    const SURPRISE_EVERY = 10, NIGHT_EVERY = 3, MAX_BUTTERFLIES = 14;

    let totalPlanted = 0, gardenNumber = 0, nightMix = 0, cricketIn = 5;
    let finish = null, bunny = null, rain = null, fireflies = [], flowerBag = [], lastReset = null, lastFinish = null;

    function resetGarden() {
        totalPlanted = 0; gardenNumber = 0; nightMix = 0; cricketIn = 5;
        finish = null; bunny = null; rain = null; flowerBag = []; lastReset = null; lastFinish = null; risingFlies = [];
        fireflies = [];
        for (let i = 0; i < 14; i++) fireflies.push({ x: rand(0.05, 0.95), y: rand(0.3, 0.8), ph: Math.random() * TAU, sp: rand(0.6, 1.2) });
    }

    function isNight() { return gardenNumber % NIGHT_EVERY === NIGHT_EVERY - 1; }

    function pickFresh(list, last) {
        let k = pick(list);
        if (k === last && list.length > 1) k = list[(list.indexOf(k) + 1) % list.length];
        return k;
    }

    function nextFlowerKind() {
        if (!flowerBag.length) flowerBag = FLOWER_KINDS.slice().sort(() => Math.random() - 0.5);
        return flowerBag.shift();
    }

    /** Lean, wiggle and dance: everything that tilts a flower head. */
    function headPos(f) {
        const bx = f.xf * W, by = f.yf * H, h = f.hf * H;
        let g = easeOut(clamp(f.age / 0.45, 0, 1));
        const gone = f.leaving && f.lt > 0 ? clamp(f.lt / f.leaveDur, 0, 1) : 0;
        if (gone) g *= 1 - easeOut(gone);
        let ang = Math.sin(time * 1.4 + f.ph) * 0.06 + f.react * Math.sin(time * 14 + f.ph) * 0.16;
        let bob = 0;
        if (finish && finish.kind === 'dance') {
            const env = Math.sin(Math.PI * clamp(finish.t / 3.6, 0, 1));
            ang += Math.sin(time * 6 + f.xf * 5) * 0.3 * env;
            bob = Math.abs(Math.sin(time * 6 + f.xf * 5)) * S * 0.018 * env;
        }
        if (f.leaving && f.lt > 0 && f.leaveKind === 'breeze') ang += 0.6 * f.lt;
        return { bx, by, h, g, gone, ang, hx: bx + Math.sin(ang) * h * g, hy: by - Math.cos(ang) * h * g - bob };
    }

    function plantOrReset(silent) {
        if (planted >= slotN) { startReset(silent); return; }
        const slot = slotOrder[planted]; planted++; totalPlanted++;
        let kind = nextFlowerKind();
        if (totalPlanted % SURPRISE_EVERY === 0) kind = Math.random() < 0.5 ? 'mushroom' : 'giant';
        const f = {
            kind, style: pick(CLASSIC_STYLES), xf: (slot + 0.5) / slotN + rand(-0.015, 0.015), yf: rand(0.84, 0.89),
            hf: rand(0.2, 0.33), r: S * rand(0.05, 0.066), color: pick(FLOWER_COLORS), color2: pick(FLOWER_COLORS),
            petals: Math.floor(rand(5, 9)), age: 0, ph: Math.random() * TAU, bloomed: false, leaving: false, lt: 0, react: 0
        };
        if (kind === 'tulip') f.color = pick(TULIP_COLORS);
        else if (kind === 'lollipop') { f.hf = rand(0.36, 0.44); const c = pick(LOLLY_COLORS); f.color = c[0]; f.color2 = c[1]; f.r *= 0.9; }
        else if (kind === 'giant') { f.hf = rand(0.44, 0.5); f.r *= 1.45; }
        else if (kind === 'mushroom') { f.hf = 0; f.r *= 1.2; f.color = pick(['#ff4d4d', '#ff7a3d', '#c77dff', '#4f9dff']); }
        flowers.push(f);
        if (!silent) Sound().plant(kind, planted - 1);
        // A butterfly comes to visit every few flowers.
        if (planted % 3 === 0 && butterflies.length < 3) {
            const from = Math.random() < 0.5 ? -1 : 1;
            addFlyer({ x: from < 0 ? -0.05 : 1.05, y: rand(0.3, 0.55), vx: -from * 0.06, vy: 0, moth: nightMix > 0.5 || isNight() });
        }
        // The press that fills the garden starts the big finish.
        if (planted >= slotN) {
            lastFinish = pickFresh(isNight() ? NIGHT_FINISHES : FINISHES, lastFinish);
            finish = { kind: lastFinish, t: 0, silent, spawned: false, sounded: false };
        }
    }

    function leave(f, kind, delay, dur) {
        f.leaving = true; f.leaveKind = kind; f.lt = -delay; f.leaveDur = dur; f.leaveStarted = false;
    }

    function startReset(silent, forced) {
        lastReset = RESETS.indexOf(forced) >= 0 ? forced : pickFresh(RESETS, lastReset);
        const kind = lastReset;
        finish = null;
        gardenNumber++;
        const live = flowers.filter(f => !f.leaving);
        if (kind === 'breeze') live.forEach(f => leave(f, 'breeze', 0, 0.6));
        else if (kind === 'carry') live.forEach(f => leave(f, 'carry', rand(0, 0.4), 0.8));
        else if (kind === 'rain') {
            // The cloud drifts across; each flower is washed away as the rain reaches it.
            rain = { t: 0 };
            live.forEach(f => leave(f, 'rain', (f.xf + RAIN_FROM) / RAIN_SPAN * RAIN_TIME + 0.35, 0.9));
        } else {
            const dir = Math.random() < 0.5 ? 1 : -1, speed = 0.3, start = dir > 0 ? -0.08 : 1.08;
            bunny = { x: start, dir, speed, t: 0, hops: 0, silent };
            live.forEach(f => leave(f, 'bunny', Math.max(0, (dir > 0 ? f.xf - start : start - f.xf) / speed - 0.05), 0.35));
        }
        newRound();
        if (!silent) Sound().gardenReset(kind);
    }

    /** What happens to a flower the moment its leaving begins. */
    function onLeave(f) {
        const p = headPos(f);
        if (f.leaveKind === 'breeze') {
            const n = f.kind === 'sunflower' || f.kind === 'giant' ? 14 : f.petals + 3;
            for (let i = 0; i < n; i++) {
                parts.push({
                    type: 'petal', x: p.hx + rand(-0.5, 0.5) * f.r, y: p.hy + rand(-0.5, 0.5) * f.r,
                    vx: rand(0.3, 0.9) * S, vy: -rand(0.1, 0.6) * S, rot: Math.random() * TAU, vr: rand(-6, 6),
                    size: f.r * 0.4, color: petalColor(f, i), life: rand(2, 3), max: 3
                });
            }
        } else if (f.leaveKind === 'carry') {
            addFlyer({ x: p.hx / W, y: p.hy / H, vx: rand(-0.05, 0.05), vy: -rand(0.08, 0.12), carry: petalColor(f, 0) });
        } else if (f.leaveKind === 'bunny') {
            for (let i = 0; i < 6; i++) {
                const a = -Math.PI / 2 + rand(-1, 1);
                parts.push({ type: 'drop', x: f.xf * W, y: f.yf * H, vx: Math.cos(a) * S * 0.2, vy: Math.sin(a) * S * 0.25, life: 0.45, max: 0.45, size: S * 0.006, color: 'rgba(140,100,60,A)' });
            }
        }
    }

    function petalColor(f, i) {
        if (f.kind === 'daisy') return '#ffffff';
        if (f.kind === 'sunflower' || f.kind === 'giant') return '#ffcf33';
        return i % 2 && (f.style === 'double' || f.kind === 'lollipop') ? f.color2 : f.color;
    }

    function updateFlowers(dt) {
        nightMix += ((isNight() ? 1 : 0) - nightMix) * (1 - Math.pow(0.5, dt / 1.1));
        for (const f of flowers) {
            f.age += dt;
            f.react = Math.max(0, f.react - dt / 1.1);
            if (f.leaving) {
                f.lt += dt;
                if (!f.leaveStarted && f.lt >= 0) { f.leaveStarted = true; onLeave(f); }
            }
            if (!f.bloomed && !f.leaving && f.age > 0.35) {
                f.bloomed = true;
                const p = headPos(f);
                for (let i = 0; i < 10; i++) {
                    const a = i / 10 * TAU;
                    parts.push({ type: 'twinkle', x: p.hx, y: p.hy, vx: Math.cos(a) * S * 0.35, vy: Math.sin(a) * S * 0.35, life: 0.7, max: 0.7, size: S * 0.014 });
                }
                // The neighbours notice: they wiggle, wave a leaf and smile bigger.
                for (const o of flowers) {
                    if (o !== f && !o.leaving && Math.abs(o.xf - f.xf) < 1.7 / slotN) o.react = 1;
                }
            }
        }
        flowers = flowers.filter(f => !(f.leaving && f.lt > f.leaveDur));
        for (const c of clouds) { c.x += c.v * dt; if (c.x > 1.2) c.x = -0.25; }
        for (const b of butterflies) {
            b.t += dt; b.x += b.vx * dt; b.y += (b.vy + Math.sin(b.t * 1.7 + b.ph) * 0.05) * dt;
            // Anyone still flying at dusk is a moth by dark, and a butterfly again by morning.
            if (nightMix > 0.6) b.moth = true; else if (nightMix < 0.4) b.moth = false;
        }
        butterflies = butterflies.filter(b => b.x > -0.1 && b.x < 1.1 && b.y > -0.1);

        if (finish) {
            finish.t += dt;
            if (!finish.spawned && finish.t > 0.6) {
                finish.spawned = true;
                if (finish.kind === 'butterflies') {
                    for (const f of flowers) {
                        if (f.leaving) continue;
                        const p = headPos(f);
                        addFlyer({ x: p.hx / W, y: p.hy / H, vx: rand(-0.04, 0.04), vy: -rand(0.07, 0.11), moth: false });
                    }
                } else if (finish.kind === 'fireflies') {
                    // A little cloud of fireflies drifts up out of every flower.
                    for (const f of flowers) {
                        if (f.leaving) continue;
                        const p = headPos(f);
                        for (let i = 0; i < 3; i++) {
                            risingFlies.push({ x: p.hx / W + rand(-0.02, 0.02), y: p.hy / H + rand(-0.02, 0.02), vx: rand(-0.03, 0.03), vy: -rand(0.05, 0.1), ph: Math.random() * TAU, life: rand(3.5, 5) });
                        }
                    }
                    if (risingFlies.length > 60) risingFlies.splice(0, risingFlies.length - 60);
                }
            }
            if (!finish.sounded && finish.t > 0.9) { finish.sounded = true; if (!finish.silent) Sound().gardenFinish(); }
            if (finish.t > 5) finish = null;
        }
        for (const r of risingFlies) {
            r.life -= dt;
            r.x += (r.vx + Math.sin(time * 1.3 + r.ph) * 0.02) * dt;
            r.y += r.vy * dt;
        }
        risingFlies = risingFlies.filter(r => r.life > 0 && r.y > -0.05);
        if (bunny) {
            bunny.t += dt;
            bunny.x += bunny.dir * bunny.speed * dt;
            const hops = Math.floor(bunny.t / 0.42);
            if (hops > bunny.hops) { bunny.hops = hops; if (!bunny.silent) Sound().hop(); }
            if (bunny.x < -0.15 || bunny.x > 1.15) bunny = null;
        }
        if (rain) {
            rain.t += dt;
            if (rain.t > 0.3 && rain.t < RAIN_TIME - 0.3) {
                const cx = rainCloudX() * W, n = Math.floor(dt * 60 + Math.random());
                for (let i = 0; i < n; i++) {
                    parts.push({ type: 'rain', x: cx + rand(-1.6, 1.6) * S * 0.08, y: H * 0.22, vy: S * rand(1.1, 1.4), life: 1.2, max: 1.2, ground: H * rand(0.82, 0.92) });
                }
            }
            if (rain.t > RAIN_TIME + 0.4) rain = null;
        }
        for (const ff of fireflies) {
            ff.x += Math.sin(time * 0.25 * ff.sp + ff.ph) * 0.01 * dt;
            ff.y += Math.cos(time * 0.2 * ff.sp + ff.ph) * 0.01 * dt;
        }
        // Soft crickets in the night garden, now and then, only while playing.
        if (nightMix > 0.7 && NMB.UI && NMB.UI.current() === 'play') {
            cricketIn -= dt;
            if (cricketIn <= 0) { cricketIn = rand(4, 8); Sound().cricket(); }
        }
    }

    const RAIN_FROM = 0.2, RAIN_SPAN = 1.4, RAIN_TIME = 4.4;
    function rainCloudX() {
        return rain ? -RAIN_FROM + RAIN_SPAN * clamp(rain.t / RAIN_TIME, 0, 1) : -1;
    }

    // --- drawing the flowers --------------------------------------------------------

    function face(R, react, y, scale) {
        const s = scale || 1;
        ctx.fillStyle = 'rgba(255,110,140,0.5)';
        ctx.beginPath(); ctx.arc(-R * 0.26 * s, y + R * 0.08 * s, R * 0.065 * s, 0, TAU); ctx.arc(R * 0.26 * s, y + R * 0.08 * s, R * 0.065 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#4a2c1a';
        ctx.beginPath(); ctx.ellipse(-R * 0.14 * s, y - R * 0.08 * s, R * 0.05 * s, R * 0.05 * s, 0, 0, TAU); ctx.ellipse(R * 0.14 * s, y - R * 0.08 * s, R * 0.05 * s, R * 0.05 * s, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#4a2c1a'; ctx.lineWidth = R * 0.05 * s; ctx.lineCap = 'round';
        const sm = R * (0.17 + 0.08 * react) * s, wide = 0.15 - 0.08 * react;
        ctx.beginPath(); ctx.arc(0, y + R * 0.02 * s, sm, wide * Math.PI, (1 - wide) * Math.PI); ctx.stroke();
    }

    function petalRing(R, n, color, len, wide, round, offset) {
        ctx.fillStyle = color;
        for (let i = 0; i < n; i++) {
            ctx.save(); ctx.rotate(i / n * TAU + (offset || 0)); ctx.beginPath();
            if (round) ctx.arc(R * len, 0, R * wide, 0, TAU);
            else ctx.ellipse(R * len, 0, R * len * 0.9, R * wide, 0, 0, TAU);
            ctx.fill(); ctx.restore();
        }
    }

    function centre(R) {
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#f0a500'; ctx.lineWidth = R * 0.05; ctx.stroke();
    }

    function drawHead(f, R) {
        if (f.kind === 'tulip') {
            ctx.translate(0, -R * 0.45);
            const dark = 'rgba(0,0,0,0.12)';
            ctx.fillStyle = f.color;
            ctx.beginPath(); ctx.ellipse(0, -R * 0.2, R * 0.42, R * 0.72, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = dark; ctx.fill();
            for (const side of [-1, 1]) {
                ctx.save(); ctx.translate(side * R * 0.3, 0); ctx.rotate(side * 0.32);
                ctx.fillStyle = f.color; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.4, R * 0.78, 0, 0, TAU); ctx.fill();
                ctx.restore();
            }
            ctx.fillStyle = f.color; ctx.beginPath(); ctx.ellipse(0, R * 0.08, R * 0.4, R * 0.72, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(-R * 0.14, -R * 0.2, R * 0.08, R * 0.32, 0.1, 0, TAU); ctx.fill();
            face(R * 0.9, f.react, R * 0.25);
        } else if (f.kind === 'sunflower' || f.kind === 'giant') {
            petalRing(R, 16, '#f5a623', 0.78, 0.18, false, Math.PI / 16);
            petalRing(R, 16, '#ffcf33', 0.72, 0.17, false);
            ctx.fillStyle = '#7a4a1e'; ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, TAU); ctx.fill();
            ctx.fillStyle = '#5a3412';
            for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, R * 0.035, 0, TAU); ctx.fill(); }
            ctx.fillStyle = '#c98a3e'; ctx.beginPath(); ctx.arc(0, 0, R * 0.34, 0, TAU); ctx.fill();
            face(R, f.react, 0, 0.9);
        } else if (f.kind === 'lollipop') {
            // A swirl of candy on a tall stem.
            ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(0, 0, R * 0.85, 0, TAU); ctx.fill();
            ctx.strokeStyle = f.color2; ctx.lineWidth = R * 0.16; ctx.lineCap = 'round';
            ctx.beginPath();
            for (let a = 0; a < TAU * 2.6; a += 0.15) {
                const rr = R * 0.08 + a / (TAU * 2.6) * R * 0.7;
                const x = Math.cos(a + time * 0.6) * rr, y = Math.sin(a + time * 0.6) * rr;
                if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = R * 0.06;
            ctx.beginPath(); ctx.arc(0, 0, R * 0.85, 0, TAU); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-R * 0.35, -R * 0.4, R * 0.18, R * 0.09, -0.6, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(0, R * 0.05, R * 0.34, 0, TAU); ctx.fill();
            face(R * 0.85, f.react, R * 0.05);
        } else {
            if (f.kind === 'daisy') petalRing(R, 12, '#ffffff', 0.66, 0.16, false);
            else if (f.style === 'round') petalRing(R, f.petals, f.color, 0.62, 0.42, true);
            else if (f.style === 'pointy') petalRing(R, f.petals, f.color, 0.62, 0.26, false);
            else if (f.style === 'double') { petalRing(R, f.petals, f.color2, 0.72, 0.3, false, Math.PI / f.petals); petalRing(R, f.petals, f.color, 0.55, 0.36, true); }
            else {
                ctx.fillStyle = f.color;
                for (let i = 0; i < 5; i++) {
                    ctx.save(); ctx.rotate(i / 5 * TAU);
                    ctx.beginPath(); ctx.arc(R * 0.62, -R * 0.2, R * 0.3, 0, TAU); ctx.arc(R * 0.62, R * 0.2, R * 0.3, 0, TAU); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(R * 0.4, -R * 0.4); ctx.lineTo(R * 1.12, 0); ctx.lineTo(R * 0.4, R * 0.4); ctx.fill();
                    ctx.restore();
                }
            }
            centre(R);
            face(R, f.react, 0);
        }
    }

    function drawMushroom(f, p) {
        const R = f.r * easeOutBack(clamp(f.age / 0.6, 0, 1)) * (1 - easeOut(p.gone));
        if (R < 1) return;
        const sq = 1 + f.react * Math.sin(time * 14) * 0.08;
        ctx.save(); ctx.translate(p.bx, p.by); ctx.scale(1 / sq, sq);
        ctx.fillStyle = '#fff3dc';
        ctx.beginPath(); ctx.ellipse(0, -R * 0.45, R * 0.36, R * 0.5, 0, 0, TAU); ctx.fill();
        face(R * 0.7, f.react, -R * 0.4);
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.ellipse(0, -R * 0.9, R * 0.85, R * 0.6, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        [[-0.45, -1.1, 0.12], [0.1, -1.3, 0.15], [0.5, -1.05, 0.1], [-0.12, -1.02, 0.08]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(R * x, R * y, R * r, 0, TAU); ctx.fill(); });
        ctx.restore();
    }

    function drawFlower(f) {
        const p = headPos(f);
        if (f.kind === 'mushroom') { drawMushroom(f, p); return; }
        if (p.g <= 0.001) return;
        ctx.strokeStyle = '#2f8f3a'; ctx.lineWidth = Math.max(3, S * (f.kind === 'giant' ? 0.016 : 0.012)); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.bx, p.by);
        ctx.quadraticCurveTo(p.bx + Math.sin(p.ang) * p.h * p.g * 0.2, p.by - p.h * p.g * 0.5, p.hx, p.hy); ctx.stroke();
        if (p.g > 0.3) {
            const ls = S * 0.03 * clamp((p.g - 0.3) / 0.4, 0, 1) * (f.kind === 'giant' ? 1.4 : 1);
            const wave = f.react * Math.sin(time * 10 + f.ph) * 0.6;
            ctx.save(); ctx.translate(p.bx + Math.sin(p.ang) * p.h * p.g * 0.3, p.by - p.h * p.g * 0.35); ctx.rotate(-0.6 + p.ang + wave);
            ctx.fillStyle = '#3fae4a'; ctx.beginPath(); ctx.ellipse(ls * 0.9, 0, ls, ls * 0.42, 0, 0, TAU); ctx.fill(); ctx.restore();
        }
        // Breeze and butterflies take the head away whole; bunny and rain shrink it.
        if (f.leaving && f.lt >= 0 && (f.leaveKind === 'breeze' || f.leaveKind === 'carry')) return;
        const b = clamp((f.age - 0.35) / 0.6, 0, 1);
        if (b <= 0) return;
        const R = f.r * easeOutBack(b) * (1 - easeOut(p.gone));
        if (R < 0.5) return;
        if (nightMix > 0.05) {
            // Glowing gently in the night garden.
            const glow = ctx.createRadialGradient(p.hx, p.hy, R * 0.2, p.hx, p.hy, R * 1.9);
            glow.addColorStop(0, `rgba(255,240,200,${(0.35 * nightMix).toFixed(3)})`); glow.addColorStop(1, 'rgba(255,240,200,0)');
            ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.hx, p.hy, R * 1.9, 0, TAU); ctx.fill();
        }
        ctx.save(); ctx.translate(p.hx, p.hy); ctx.rotate(p.ang);
        drawHead(f, R);
        ctx.restore();
    }

    function drawButterfly(b) {
        const x = b.x * W, y = b.y * H, u = S * 0.028;
        const flap = Math.abs(Math.sin(b.t * (b.moth ? 9 : 14) + b.ph));
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(b.t * 2 + b.ph) * 0.2);
        if (b.carry) {
            // Carrying a petal away, hanging just below.
            ctx.fillStyle = b.carry; ctx.beginPath(); ctx.ellipse(0, u * 1.25, u * 0.55, u * 0.28, Math.sin(b.t * 3) * 0.4, 0, TAU); ctx.fill();
        }
        if (b.moth) { drawMothBody(u, flap); ctx.restore(); return; }
        ctx.fillStyle = b.c;
        for (const side of [-1, 1]) {
            ctx.save(); ctx.scale(side * (0.25 + 0.75 * flap), 1);
            ctx.beginPath(); ctx.ellipse(u * 0.7, -u * 0.45, u * 0.75, u * 0.6, -0.4, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.ellipse(u * 0.55, u * 0.45, u * 0.5, u * 0.42, 0.4, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath(); ctx.arc(u * 0.8, -u * 0.5, u * 0.18, 0, TAU); ctx.fill();
            ctx.fillStyle = b.c;
            ctx.restore();
        }
        ctx.fillStyle = '#3b2a1a'; ctx.beginPath(); ctx.ellipse(0, 0, u * 0.14, u * 0.75, 0, 0, TAU); ctx.fill();
        ctx.restore();
    }

    /** A soft, fuzzy night moth: broad pale wings, a little glow, feathery antennae. */
    function drawMothBody(u, flap) {
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, u * 2.2);
        glow.addColorStop(0, 'rgba(255,245,220,0.22)'); glow.addColorStop(1, 'rgba(255,245,220,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, u * 2.2, 0, TAU); ctx.fill();
        for (const side of [-1, 1]) {
            ctx.save(); ctx.scale(side * (0.3 + 0.7 * flap), 1);
            ctx.fillStyle = '#e9dfcc';
            ctx.beginPath(); ctx.moveTo(0, -u * 0.3);
            ctx.quadraticCurveTo(u * 1.3, -u * 1.1, u * 1.35, -u * 0.1);
            ctx.quadraticCurveTo(u * 1.1, u * 0.7, 0, u * 0.45); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(150,120,90,0.45)';
            ctx.beginPath(); ctx.arc(u * 0.75, -u * 0.25, u * 0.2, 0, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(150,120,90,0.35)'; ctx.lineWidth = u * 0.06;
            ctx.beginPath(); ctx.moveTo(u * 0.2, u * 0.25); ctx.quadraticCurveTo(u * 0.7, u * 0.35, u * 1.1, u * 0.1); ctx.stroke();
            ctx.restore();
        }
        ctx.fillStyle = '#b9a88c'; ctx.beginPath(); ctx.ellipse(0, u * 0.05, u * 0.18, u * 0.6, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#b9a88c'; ctx.lineWidth = u * 0.06; ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(0, -u * 0.5); ctx.quadraticCurveTo(side * u * 0.3, -u * 1.0, side * u * 0.55, -u * 1.05); ctx.stroke();
            for (let k = 1; k <= 3; k++) {   // feathery antennae
                const t = k / 4, ax = side * u * 0.55 * t, ay = -u * 0.5 - u * 0.55 * t;
                ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + side * u * 0.1, ay + u * 0.08); ctx.stroke();
            }
        }
    }

    function drawBunny() {
        const u = S * 0.045, hop = (bunny.t / 0.42) % 1, lift = Math.sin(Math.PI * hop) * S * 0.07;
        const x = bunny.x * W, y = H * 0.9 - lift;
        ctx.save(); ctx.translate(x, y); ctx.scale(bunny.dir, 1);
        const stretch = 1 + Math.sin(Math.PI * hop) * 0.12;
        ctx.scale(stretch, 1 / stretch);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath(); ctx.ellipse(0, lift / stretch + u * 0.1, u * 1.1, u * 0.18, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f7f1ea';
        ctx.beginPath(); ctx.ellipse(-u * 1.0, -u * 0.55, u * 0.32, u * 0.3, 0, 0, TAU); ctx.fill();          // tail
        ctx.beginPath(); ctx.ellipse(0, -u * 0.55, u * 0.95, u * 0.62, 0, 0, TAU); ctx.fill();                // body
        ctx.beginPath(); ctx.ellipse(u * 0.25, -u * 0.05, u * 0.32, u * 0.14, 0, 0, TAU); ctx.fill();         // foot
        ctx.beginPath(); ctx.arc(u * 0.85, -u * 1.05, u * 0.48, 0, TAU); ctx.fill();                         // head
        for (const [ex, rot] of [[0.6, -0.35], [0.95, 0.05]]) {                                             // ears
            ctx.save(); ctx.translate(u * ex, -u * 1.45); ctx.rotate(rot - Math.sin(Math.PI * hop) * 0.2);
            ctx.fillStyle = '#f7f1ea'; ctx.beginPath(); ctx.ellipse(0, -u * 0.5, u * 0.17, u * 0.55, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = '#ffb6c8'; ctx.beginPath(); ctx.ellipse(0, -u * 0.48, u * 0.08, u * 0.4, 0, 0, TAU); ctx.fill();
            ctx.restore();
        }
        ctx.fillStyle = '#3a2a2a'; ctx.beginPath(); ctx.arc(u * 1.02, -u * 1.12, u * 0.07, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff8fab'; ctx.beginPath(); ctx.arc(u * 1.3, -u * 0.98, u * 0.07, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,120,150,0.45)'; ctx.beginPath(); ctx.arc(u * 1.05, -u * 0.88, u * 0.1, 0, TAU); ctx.fill();
        ctx.restore();
    }

    function drawRainCloud() {
        const cx = rainCloudX() * W, cy = H * 0.17, u = S * 0.075;
        ctx.fillStyle = 'rgba(150,165,190,0.95)';
        ctx.beginPath(); ctx.arc(cx - u * 1.3, cy + u * 0.2, u * 0.8, 0, TAU); ctx.arc(cx - u * 0.3, cy - u * 0.3, u * 1.1, 0, TAU);
        ctx.arc(cx + u * 0.9, cy, u * 0.95, 0, TAU); ctx.arc(cx, cy + u * 0.4, u * 0.9, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.ellipse(cx - u * 0.5, cy - u * 0.75, u * 0.6, u * 0.18, 0, 0, TAU); ctx.fill();
        // A sleepy little face.
        ctx.strokeStyle = 'rgba(60,70,95,0.8)'; ctx.lineWidth = u * 0.07; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(cx - u * 0.35, cy + u * 0.05, u * 0.12, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx + u * 0.35, cy + u * 0.05, u * 0.12, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy + u * 0.3, u * 0.14, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    }

    function drawRainbow() {
        const t = finish.t, env = t < 0.8 ? t / 0.8 : t < 3.6 ? 1 : Math.max(0, 1 - (t - 3.6) / 1.2);
        if (env <= 0) return;
        const cols = ['#ff4d6d', '#ff8c42', '#ffd23f', '#7bd88f', '#4f9dff', '#b06cf5'], band = S * 0.035;
        ctx.save(); ctx.globalAlpha = 0.7 * env; ctx.lineWidth = band; ctx.lineCap = 'butt';
        cols.forEach((c, i) => {
            ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(W * 0.5, H * 0.82, Math.min(W * 0.46, H * 0.62) - i * band, Math.PI, TAU); ctx.stroke();
        });
        ctx.restore();
    }

    function mixColor(a, b, t) {
        const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
        const ch = s => Math.round(((A >> s) & 255) + (((B >> s) & 255) - ((A >> s) & 255)) * t);
        return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    }

    function drawFlowerScene() {
        const n = nightMix;
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, mixColor('#4fb0ff', '#0b1446', n)); g.addColorStop(1, mixColor('#d4f1ff', '#3a2f7a', n));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        if (n > 0.02) {
            ctx.fillStyle = '#fff';
            for (const s of stars) { ctx.globalAlpha = n * (0.3 + 0.35 * Math.sin(time * s.s + s.p)); ctx.beginPath(); ctx.arc(s.x, s.y * 0.8, s.r, 0, TAU); ctx.fill(); }
            ctx.globalAlpha = 1;
            // The moon, with a sleepy smile.
            const mx = W * 0.16, my = H * 0.17, mr = S * 0.06;
            ctx.save(); ctx.globalAlpha = n;
            const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 3.5);
            halo.addColorStop(0, 'rgba(255,244,214,0.3)'); halo.addColorStop(1, 'rgba(255,244,214,0)');
            ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(mx, my, mr * 3.5, 0, TAU); ctx.fill();
            ctx.fillStyle = '#fff4d6'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#b89a5c'; ctx.lineWidth = mr * 0.07; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.05, mr * 0.12, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
            ctx.beginPath(); ctx.arc(mx + mr * 0.3, my - mr * 0.05, mr * 0.12, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
            ctx.beginPath(); ctx.arc(mx, my + mr * 0.15, mr * 0.25, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
            ctx.restore();
        }
        if (n < 0.98) {
            // The sun, smiling, setting as night comes.
            const sx = W * 0.84, sy = H * 0.17 + n * H * 0.3, sr = S * 0.07;
            ctx.save(); ctx.globalAlpha = 1 - n;
            ctx.save(); ctx.translate(sx, sy); ctx.rotate(time * 0.15);
            ctx.fillStyle = 'rgba(255,196,60,0.9)';
            for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(sr * 1.15, -sr * 0.16); ctx.lineTo(sr * 1.75, 0); ctx.lineTo(sr * 1.15, sr * 0.16); ctx.closePath(); ctx.fill(); }
            ctx.restore();
            ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
            ctx.fillStyle = '#9a5b00';
            ctx.beginPath(); ctx.arc(sx - sr * 0.3, sy - sr * 0.12, sr * 0.08, 0, TAU); ctx.arc(sx + sr * 0.3, sy - sr * 0.12, sr * 0.08, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#9a5b00'; ctx.lineWidth = sr * 0.08; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(sx, sy + sr * 0.05, sr * 0.36, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
            ctx.restore();
        }
        ctx.fillStyle = `rgba(255,255,255,${(0.94 * (1 - 0.6 * n)).toFixed(3)})`;
        for (const c of clouds) {
            const cx = c.x * W, cy = c.y * H, u = S * 0.05 * c.s;
            ctx.beginPath(); ctx.arc(cx, cy, u, 0, TAU); ctx.arc(cx + u * 1.1, cy - u * 0.4, u * 1.2, 0, TAU);
            ctx.arc(cx + u * 2.3, cy, u * 0.95, 0, TAU); ctx.arc(cx + u * 1.2, cy + u * 0.3, u, 0, TAU); ctx.fill();
        }
        if (finish && finish.kind === 'rainbow') drawRainbow();
        if (rain) drawRainCloud();
        hill(0.74, 0.035, 0.9, 1.2, mixColor('#9ee08f', '#2f5e4a', n));
        hill(0.83, 0.015, 1.6, 0.2, mixColor('#5cbf5a', '#244a3a', n));
        for (const f of flowers) drawFlower(f);
        // Grass tufts along the front edge.
        ctx.fillStyle = mixColor('#4aa84a', '#1f4433', n);
        for (let x = 0; x < W; x += S * 0.04) {
            const h = S * (0.02 + 0.012 * Math.sin(x * 0.7));
            ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + S * 0.01, H - h + Math.sin(time * 1.5 + x) * 2); ctx.lineTo(x + S * 0.02, H); ctx.fill();
        }
        if (bunny) drawBunny();
        for (const b of butterflies) drawButterfly(b);
        if (n > 0.05) {
            // Fireflies: a slow, soft glow - never a flash.
            for (const ff of fireflies) {
                const a = n * (0.35 + 0.4 * (0.5 + 0.5 * Math.sin(time * 0.9 * ff.sp + ff.ph)));
                const x = ff.x * W, y = ff.y * H, r = S * 0.022;
                const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
                glow.addColorStop(0, `rgba(255,250,170,${a.toFixed(3)})`); glow.addColorStop(1, 'rgba(255,250,170,0)');
                ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
                ctx.fillStyle = `rgba(255,255,220,${Math.min(1, a * 1.4).toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, S * 0.004, 0, TAU); ctx.fill();
            }
        }
        // The night finish: fireflies rising out of the flowers, fading softly.
        for (const r of risingFlies) {
            const a = Math.min(1, r.life / 1.2) * (0.55 + 0.35 * Math.sin(time * 1.4 + r.ph));
            const x = r.x * W, y = r.y * H, rad = S * 0.026;
            const glow = ctx.createRadialGradient(x, y, 0, x, y, rad);
            glow.addColorStop(0, `rgba(255,250,170,${a.toFixed(3)})`); glow.addColorStop(1, 'rgba(255,250,170,0)');
            ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
            ctx.fillStyle = `rgba(255,255,220,${Math.min(1, a * 1.3).toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, S * 0.0045, 0, TAU); ctx.fill();
        }
    }

    // --- shared particles --------------------------------------------------------

    function updateParts(dt) {
        for (const p of parts) {
            p.life -= dt;
            if (p.type === 'drop') { p.vy += S * 0.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
            else if (p.type === 'petal') {
                p.vx += S * 0.25 * dt; p.vx *= Math.pow(0.75, dt); p.vy += S * 0.12 * dt; p.vy *= Math.pow(0.8, dt);
                p.x += p.vx * dt + Math.sin(time * 3 + p.rot) * S * 0.02 * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
            } else if (p.type === 'twinkle') { p.vx *= Math.pow(0.15, dt); p.vy *= Math.pow(0.15, dt); p.x += p.vx * dt; p.y += p.vy * dt; }
            else if (p.type === 'fizz') { p.y += p.vy * dt; p.x += Math.sin(time * 3 + p.ph) * S * 0.01 * dt; }
            else if (p.type === 'rain') { p.y += p.vy * dt; if (p.y >= p.ground) p.life = 0; }
        }
        parts = parts.filter(p => p.life > 0);
        if (parts.length > MAX_PARTS) parts.splice(0, parts.length - MAX_PARTS);
    }

    /** A particle's colour at alpha `a`: a function, an 'A' template, or white. */
    function tint(p, a) {
        if (typeof p.color === 'function') return p.color(a);
        if (p.color) return p.color.replace('A', a.toFixed(3));
        return `rgba(255,255,255,${a.toFixed(3)})`;
    }

    function star(x, y, r, c) {
        ctx.fillStyle = c; ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.35 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill();
    }

    function drawParts() {
        for (const p of parts) {
            const a = clamp(p.life / p.max, 0, 1);
            if (p.type === 'ring') {
                ctx.strokeStyle = tint(p, a * 0.8); ctx.lineWidth = Math.max(1.5, p.r * 0.08);
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + (1 - a) * 0.6), 0, TAU); ctx.stroke();
            } else if (p.type === 'drop') {
                ctx.fillStyle = tint(p, a); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
            } else if (p.type === 'petal') {
                ctx.save(); ctx.globalAlpha = Math.min(1, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
                ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore();
            } else if (p.type === 'twinkle') {
                star(p.x, p.y, p.size * (0.5 + a * 0.5), p.color ? tint(p, a) : `rgba(255,248,190,${a})`);
            } else if (p.type === 'rain') {
                ctx.strokeStyle = 'rgba(190,225,255,0.75)'; ctx.lineWidth = Math.max(1.5, S * 0.004); ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - S * 0.004, p.y - S * 0.03); ctx.stroke();
            } else if (p.type === 'fizz') {
                ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.6, a)})`; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
            }
        }
    }

    // --- the Simple High Contrast look ------------------------------------------
    //
    // For players with CVI. Kept completely separate from the regular scenes
    // above, which it never changes: plain black, and ONE big bold thing per
    // press in the colour chosen in Settings, slow enough to find and follow.
    // A new press replaces what is there (it fades or pops quickly). Only the
    // game screens use it; the menu backdrop stays the regular scene.

    let simple = null, simpleOld = [], simpleDrops = [], simpleCount = 0;

    function simpleOn() {
        return NMB.Settings.get('look') === 'simple' && !!(NMB.Game && NMB.Game.started());
    }

    const SIMPLE_FIREWORKS = ['burst', 'star', 'heart'];
    const SIMPLE_FLOWERS = ['round', 'pointy', 'tulip'];

    function simplePoints(shape) {
        const pts = [];
        if (shape === 'star') {
            const v = [];
            for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1; v.push([Math.cos(a) * r, Math.sin(a) * r]); }
            for (let i = 0; i < 10; i++) {
                const [x0, y0] = v[i], [x1, y1] = v[(i + 1) % 10];
                for (let k = 0; k < 3; k++) pts.push([x0 + (x1 - x0) * k / 3, y0 + (y1 - y0) * k / 3]);
            }
        } else if (shape === 'heart') {
            for (let i = 0; i < 28; i++) {
                const t = i / 28 * TAU;
                pts.push([16 * Math.pow(Math.sin(t), 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]);
            }
        } else {
            for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; pts.push([Math.cos(a), Math.sin(a)]); }
            for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.2; pts.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5]); }
        }
        return pts;
    }

    function simplePress(silent) {
        // What is already there makes way: a bubble pops, anything else fades quickly.
        if (simple) {
            if (simple.type === 'bubble') { if (!simple.popped) simplePop(simple, silent); }
            else { simple.fade = 0; simpleOld.push(simple); }
        }
        const n = simpleCount++;
        if (mode === 'fireworks') {
            const shape = SIMPLE_FIREWORKS[n % SIMPLE_FIREWORKS.length];
            simple = { type: 'firework', shape, pts: simplePoints(shape), t: 0, silent, burst: false };
            if (!silent) Sound().launch('peony');
        } else if (mode === 'bubbles') {
            simple = { type: 'bubble', t: 0, silent, ph: Math.random() * TAU };
            if (!silent) Sound().blow();
        } else {
            const shape = SIMPLE_FLOWERS[n % SIMPLE_FLOWERS.length];
            simple = { type: 'flower', shape, t: 0 };
            if (!silent) Sound().plant(shape === 'tulip' ? 'tulip' : shape === 'pointy' ? 'daisy' : 'classic', n % 9);
        }
    }

    function bubbleAt(b) {
        return { x: W / 2 + Math.sin(b.t * 1.1 + b.ph) * S * 0.05, y: H * 0.86 - b.t * S * 0.1, r: S * 0.17 * easeOut(clamp(b.t / 0.5, 0, 1)) };
    }

    function simplePop(b, silent) {
        b.popped = true;
        const p = bubbleAt(b);
        for (let i = 0; i < 10; i++) {
            const a = i / 10 * TAU;
            simpleDrops.push({ x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r, vx: Math.cos(a) * S * 0.25, vy: Math.sin(a) * S * 0.25, life: 0.9 });
        }
        if (!silent) Sound().pop(1);
    }

    function updateSimple(dt) {
        if (simple) {
            simple.t += dt;
            if (simple.type === 'firework' && !simple.burst && simple.t >= 0.9) {
                simple.burst = true;
                if (!simple.silent) Sound().burst(simple.shape === 'burst' ? 'peony' : simple.shape);
            }
            if (simple.type === 'firework' && simple.t > 5) simple = null;
            else if (simple && simple.type === 'bubble' && !simple.popped && (simple.t > 4.2 || bubbleAt(simple).y < H * 0.3)) {
                simplePop(simple, simple.silent); simple = null;
            }
        }
        for (const o of simpleOld) o.fade += dt;
        simpleOld = simpleOld.filter(o => o.fade < 0.45);
        for (const d of simpleDrops) { d.life -= dt; d.vx *= Math.pow(0.4, dt); d.vy = d.vy * Math.pow(0.4, dt) + S * 0.15 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
        simpleDrops = simpleDrops.filter(d => d.life > 0);
    }

    function boldDot(x, y, r, color, a) {
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, TAU); ctx.fill();
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawSimpleThing(o, fadeOut) {
        fadeOut = fadeOut || 0;
        const C = NMB.Settings.simpleColor(), a = 1 - clamp(fadeOut / 0.45, 0, 1);
        if (a <= 0) return;
        if (o.type === 'firework') {
            const cx = W / 2, cy = H * 0.42, dot = S * 0.022;
            if (o.t < 0.9) {
                const y = H * 0.95 + (cy - H * 0.95) * easeOut(o.t / 0.9);
                for (let i = 3; i >= 0; i--) boldDot(cx, y + i * S * 0.035, dot * (1 - i * 0.18), C, a * (1 - i * 0.22));
                return;
            }
            const k = easeOut(clamp((o.t - 0.9) / 0.6, 0, 1)), hold = o.t < 3.8 ? 1 : 1 - clamp((o.t - 3.8) / 1.2, 0, 1);
            const R = S * 0.3;
            for (const [px, py] of o.pts) boldDot(cx + px * R * k, cy + py * R * k + (o.t - 0.9) * S * 0.01, dot, C, a * hold);
        } else if (o.type === 'bubble') {
            if (o.popped) return;
            const p = bubbleAt(o);
            if (p.r < 1) return;
            ctx.globalAlpha = a;
            ctx.fillStyle = C; ctx.globalAlpha = a * 0.14; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
            ctx.globalAlpha = a; ctx.strokeStyle = C; ctx.lineWidth = S * 0.024; ctx.stroke();
            ctx.beginPath(); ctx.arc(p.x - p.r * 0.38, p.y - p.r * 0.38, p.r * 0.13, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
        } else {
            const grow = easeOut(clamp(o.t / 0.6, 0, 1)) * (1 - easeOut(clamp(fadeOut / 0.45, 0, 1)));
            const bx = W / 2, by = H * 0.95, h = Math.min(H * 0.45, S * 0.55) * grow;
            const sway = Math.sin(time * 1.2) * 0.04;
            const hx = bx + Math.sin(sway) * h, hy = by - Math.cos(sway) * h;
            ctx.strokeStyle = C; ctx.lineWidth = S * 0.028; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx, hy); ctx.stroke();
            const R = S * 0.16 * easeOutBack(clamp((o.t - 0.35) / 0.6, 0, 1)) * (1 - easeOut(clamp(fadeOut / 0.45, 0, 1)));
            if (R <= 1) return;
            ctx.save(); ctx.translate(hx, hy); ctx.rotate(sway); ctx.fillStyle = C;
            if (o.shape === 'tulip') {
                ctx.beginPath(); ctx.moveTo(-R * 0.8, -R * 0.9); ctx.lineTo(-R * 0.4, -R * 0.4); ctx.lineTo(0, -R * 1.0);
                ctx.lineTo(R * 0.4, -R * 0.4); ctx.lineTo(R * 0.8, -R * 0.9); ctx.quadraticCurveTo(R * 0.9, R * 0.4, 0, R * 0.45);
                ctx.quadraticCurveTo(-R * 0.9, R * 0.4, -R * 0.8, -R * 0.9); ctx.fill();
            } else {
                const n = o.shape === 'round' ? 6 : 8;
                for (let i = 0; i < n; i++) {
                    ctx.save(); ctx.rotate(i / n * TAU); ctx.beginPath();
                    if (o.shape === 'round') ctx.arc(R * 0.62, 0, R * 0.4, 0, TAU);
                    else ctx.ellipse(R * 0.6, 0, R * 0.55, R * 0.2, 0, 0, TAU);
                    ctx.fill(); ctx.restore();
                }
                // A black centre inside a ring of the colour keeps the shape crisp.
                ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, R * 0.32, 0, TAU); ctx.fill();
                ctx.strokeStyle = C; ctx.lineWidth = S * 0.012; ctx.stroke();
            }
            ctx.restore();
        }
    }

    function drawSimple() {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        for (const o of simpleOld) drawSimpleThing(o, o.fade);
        if (simple) drawSimpleThing(simple);
        const C = NMB.Settings.simpleColor();
        for (const d of simpleDrops) boldDot(d.x, d.y, S * 0.016, C, clamp(d.life / 0.9, 0, 1));
    }

    function resetSimple() { simple = null; simpleOld = []; simpleDrops = []; simpleCount = 0; }

    // --- loop ----------------------------------------------------------------------

    let last = 0, wasSimple = false;
    function frame(now) {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; time += dt;
        const useSimple = simpleOn();
        if (useSimple !== wasSimple) { wasSimple = useSimple; resetSimple(); }
        if (useSimple) { updateSimple(dt); drawSimple(); requestAnimationFrame(frame); return; }
        if (mode === 'fireworks') { updateFireworks(dt); updateParts(dt); drawFireworks(dt); }
        else if (mode === 'bubbles') { updateBubbles(dt); updateParts(dt); drawBubbleScene(); }
        else { updateFlowers(dt); updateParts(dt); drawFlowerScene(); }
        drawParts();
        requestAnimationFrame(frame);
    }

    function init(el) {
        canvas = el;
        ctx = canvas.getContext('2d');
        mode = NMB.Settings.get('mode');
        resize();
        resetScene();
        window.addEventListener('resize', resize);
        last = performance.now();
        requestAnimationFrame(frame);
    }

    function setMode(m) {
        if (NMB.Settings.MODES.indexOf(m) === -1 || m === mode) return;
        mode = m;
        resetScene();
    }

    function press(opts) {
        const silent = !!(opts && opts.silent);
        if (simpleOn()) { simplePress(silent); return; }
        if (mode === 'fireworks') launchFirework(silent);
        else if (mode === 'bubbles') blowBubbles(silent);
        else plantOrReset(silent);
    }

    /** What is on screen right now (used by the automated test). */
    function stats() {
        return {
            simpleLook: wasSimple, simpleThing: simple ? simple.type + ':' + (simple.shape || '') : null,
            rockets: rockets.length, sparks: sparks.length, bubbles: bubbles.length, flowers: flowers.length, butterflies: butterflies.length, planted, slotN,
            parts: parts.length, critters: critters.length, bubblePresses, whalePuff: whale.puff, whaleX: whale.x, whaleDir: whale.dir, whaleTurning: whale.turning,
            finish: finish ? finish.kind : null, gardenReset: lastReset, gardenNumber, nightMix, bunny: !!bunny, rain: !!rain,
            flowerKinds: flowers.map(f => f.kind), reacting: flowers.filter(f => f.react > 0).length,
            flyers: butterflies.length, moths: butterflies.filter(b => b.moth).length, risingFlies: risingFlies.length,
            giant: bubbles.some(b => b.giant), giants: bubbles.filter(b => b.giant).length, creature: bubbles.some(b => b.critter), shapes: bubbles.filter(b => b.shape !== 'round').length
        };
    }

    /** Fill the garden and clear it a particular way (used by the automated test). */
    function gardenReset(kind) {
        if (mode !== 'flowers') return;
        while (planted < slotN) plantOrReset(true);
        startReset(true, kind);
    }

    /** Launch one particular firework (used by the automated test). */
    function burst(kind, silent) { if (mode === 'fireworks') launchFirework(!!silent, kind); }

    return { init, setMode, press, stats, burst, gardenReset, reset: resetScene, mode: () => mode, KINDS: CLASSIC.concat(SHAPES, ['word']) };
})();
