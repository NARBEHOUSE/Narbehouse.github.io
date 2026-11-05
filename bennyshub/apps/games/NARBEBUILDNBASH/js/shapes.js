/**
 * NARBE Build n Bash - the block set.
 *
 * Every block in every build is one of these wooden shapes, painted one of the
 * palette colours. This file is the single place that knows what a shape looks
 * like (a bevelled Three.js mesh), how it collides (an Ammo/Bullet shape) and
 * how big it is (its local bounding box and volume).
 *
 * A block spec (see js/builds.js) is plain data:
 *   { s: 'box', d: [w, h, d], p: [x, y, z], r: [rx, ry, rz], c: 'red', t: 'grain' }
 *   s  shape name (below)          d  the shape's dimensions, in block units
 *   p  CENTRE of the shape's own bounding box, in world units (y = 0 is the ground)
 *   r  rotation in degrees, applied X then Y then Z (Three.js 'XYZ' order)
 *   c  palette colour key           t  surface pattern (optional, default 'grain')
 *
 * Shapes and their dimensions (all centred on their own bounding box):
 *   box    [w, h, d]          a cuboid: cubes, planks, pillars, slabs
 *   cyl    [r, h]             a cylinder standing on its end (Y axis)
 *   cone   [r, h]             a cone, point up
 *   pyr    [w, h]             a square pyramid, w by w base
 *   tri    [w, h, d]          a triangular prism (roof): triangle in X/Y, depth along Z
 *   wedge  [w, h, d]          a ramp: tall edge on the left (-x), sloping down to the right
 *   arch   [w, h, d, a, leg]  a block with a round opening cut from the bottom:
 *                            opening radius a (default 0.3 w), straight legs `leg` tall (default 0)
 *   half   [w, d]             a half-moon: half a cylinder lying flat side down, w wide, w/2 tall
 *   ball   [r]                a sphere
 *   wheels [r, w]             a wheel set: two wheels on an axle along Z, w wide overall
 *   star   [r, t]             a five-point star, t thick (Z)
 *
 * Units: one block unit is the size of the basic cube. Nothing here touches
 * the DOM except canvas textures, which the Node test harness stubs.
 */

window.BNB = window.BNB || {};

BNB.Shapes = (function () {
    'use strict';

    const DEG = Math.PI / 180;

    /**
     * Toy-block paint. Saturated but warm, like a painted beech-wood set,
     * and every colour reads against grass, sand, water and night sky.
     */
    const PALETTE = {
        red: '#e2453c', orange: '#f28c28', yellow: '#f6c833', lime: '#9ccf3f',
        green: '#3fa84f', teal: '#23a99c', sky: '#5fbdf0', blue: '#2f6fd0',
        navy: '#283e86', purple: '#8a58c6', pink: '#f07ab4', white: '#f5f0e6',
        cream: '#f1dfb8', sand: '#e3c27f', wood: '#d6a463', oak: '#b47a42',
        tan: '#c98f4e', limestone: '#e0b872', adobe: '#a8693a',
        brown: '#7a4a28', grey: '#9aa4ae', silver: '#c9d1d8', dark: '#3e444d',
        black: '#25282d', gold: '#f0bd3c', stone: '#b9b2a6', rust: '#b5522e'
    };

    /** Speakable colour names, for anything that says a block's colour. */
    const COLOR_NAMES = { sky: 'light blue', navy: 'dark blue', oak: 'wood', wood: 'wood', cream: 'cream', dark: 'grey', stone: 'grey', rust: 'red' };

    // --- dimensions -----------------------------------------------------------------

    /** Half extents of the shape's own (unrotated) bounding box. */
    function half(s, d) {
        switch (s) {
            case 'box': case 'tri': case 'wedge': case 'arch': return [d[0] / 2, d[1] / 2, d[2] / 2];
            case 'cyl': case 'cone': return [d[0], d[1] / 2, d[0]];
            case 'pyr': return [d[0] / 2, d[1] / 2, d[0] / 2];
            case 'tet': return [d[0] / 2, d[0] / Math.SQRT2 / 2, d[0] / 2];
            case 'half': return [d[0] / 2, d[0] / 4, d[1] / 2];
            case 'ball': return [d[0], d[0], d[0]];
            case 'wheels': return [d[0], d[0], d[1] / 2];
            case 'star': return [d[0], d[0], d[1] / 2];
            default: throw new Error('Unknown shape ' + s);
        }
    }

    function archParts(d) {
        const w = d[0], h = d[1];
        const a = d[3] || w * 0.3, leg = d[4] || 0;
        return { w: w, h: h, a: a, leg: leg, spring: -h / 2 + leg };
    }

    /** Solid volume in cubic block units (for mass). */
    function volume(s, d) {
        switch (s) {
            case 'box': return d[0] * d[1] * d[2];
            case 'cyl': return Math.PI * d[0] * d[0] * d[1];
            case 'cone': return Math.PI * d[0] * d[0] * d[1] / 3;
            case 'pyr': return d[0] * d[0] * d[1] / 3;
            case 'tet': return Math.pow(d[0], 3) / (6 * Math.SQRT2);
            case 'tri': case 'wedge': return d[0] * d[1] * d[2] / 2;
            case 'arch': { const A = archParts(d); return (d[0] * d[1] - 2 * A.a * A.leg - Math.PI * A.a * A.a / 2) * d[2]; }
            case 'half': return Math.PI * d[0] * d[0] / 8 * d[1];
            case 'ball': return 4 / 3 * Math.PI * Math.pow(d[0], 3);
            case 'wheels': return Math.PI * d[0] * d[0] * 0.36 * d[0] * 2 + Math.PI * Math.pow(d[0] * 0.22, 2) * d[1];
            case 'star': return 2.2 * d[0] * d[0] * 0.55 * d[1];
            default: return 1;
        }
    }

    // --- outlines (for extruded prisms) -------------------------------------------------

    function starPoints(r) {
        const pts = [];
        for (let i = 0; i < 10; i++) {
            const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
            pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
        }
        // Centre the star's bounding box on the origin.
        const ys = pts.map(p => p[1]), dy = (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2;
        return pts.map(p => [p[0], p[1] - dy]);
    }

    /** The X/Y outline of an extruded shape, counter-clockwise, bounding box centred. */
    function outline(s, d) {
        if (s === 'box') { const x = d[0] / 2, y = d[1] / 2; return [[-x, -y], [x, -y], [x, y], [-x, y]]; }
        if (s === 'tri') { const x = d[0] / 2, y = d[1] / 2; return [[-x, -y], [x, -y], [0, y]]; }
        if (s === 'wedge') { const x = d[0] / 2, y = d[1] / 2; return [[-x, -y], [x, -y], [-x, y]]; }
        if (s === 'half') {
            const R = d[0] / 2, pts = [];
            for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI; pts.push([Math.cos(a) * R, Math.sin(a) * R - R / 2]); }
            return pts;
        }
        if (s === 'star') return starPoints(d[0]);
        if (s === 'arch') {
            const A = archParts(d), x = A.w / 2, y = A.h / 2, pts = [[-x, -y], [-A.a, -y]];
            if (A.leg > 0.001) pts.push([-A.a, A.spring]);
            for (let i = 1; i < 20; i++) { const t = Math.PI - i / 20 * Math.PI; pts.push([Math.cos(t) * A.a, A.spring + Math.sin(t) * A.a]); }
            if (A.leg > 0.001) pts.push([A.a, A.spring]);
            pts.push([A.a, -y], [x, -y], [x, y], [-x, y]);
            return pts;
        }
        return null;
    }

    /**
     * A regular tetrahedron of edge a, resting on one edge: the bottom edge runs
     * along Z, the top edge along X, h = a / sqrt 2 apart. Four of these fill
     * the gaps when a pyramid is built from smaller pyramids (js/builds.js).
     */
    function tetVerts(a) {
        const h = a / Math.SQRT2;
        return [[0, -h / 2, -a / 2], [0, -h / 2, a / 2], [-a / 2, h / 2, 0], [a / 2, h / 2, 0]];
    }

    /** Is a local point inside the tetrahedron (grown by g)? */
    function inTet(a, x, y, z, g) {
        const V = tetVerts(a);
        const faces = [[0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 3, 1], [1, 2, 3, 0]];
        for (const f of faces) {
            const A = V[f[0]], B = V[f[1]], C = V[f[2]], D = V[f[3]];
            const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
            let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            const len = Math.hypot(n[0], n[1], n[2]);
            n = [n[0] / len, n[1] / len, n[2] / len];
            // Outward: away from the opposite vertex.
            if (n[0] * (D[0] - A[0]) + n[1] * (D[1] - A[1]) + n[2] * (D[2] - A[2]) > 0) n = [-n[0], -n[1], -n[2]];
            if (n[0] * (x - A[0]) + n[1] * (y - A[1]) + n[2] * (z - A[2]) > g) return false;
        }
        return true;
    }

    function signedArea(pts) {
        let a = 0;
        for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
        return a / 2;
    }

    /** Move every edge of a simple polygon inward by `dist` (mitred, clamped). */
    function inset(pts, dist) {
        const ccw = signedArea(pts) > 0, n = pts.length, out = [];
        for (let i = 0; i < n; i++) {
            const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
            const e1 = norm([c[0] - p[0], c[1] - p[1]]), e2 = norm([q[0] - c[0], q[1] - c[1]]);
            // Inward normals: left of the edge for a counter-clockwise polygon.
            const n1 = ccw ? [-e1[1], e1[0]] : [e1[1], -e1[0]], n2 = ccw ? [-e2[1], e2[0]] : [e2[1], -e2[0]];
            let m = [n1[0] + n2[0], n1[1] + n2[1]];
            const len = Math.hypot(m[0], m[1]);
            if (len < 1e-6) { out.push([c[0] + n1[0] * dist, c[1] + n1[1] * dist]); continue; }
            m = [m[0] / len, m[1] / len];
            const k = Math.min(3, 1 / Math.max(0.2, m[0] * n1[0] + m[1] * n1[1]));
            out.push([c[0] + m[0] * dist * k, c[1] + m[1] * dist * k]);
        }
        return out;
    }
    function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

    // --- Three.js geometry ---------------------------------------------------------------

    const geoCache = new Map();

    /**
     * Pattern-friendly UVs: one texture repeat per block unit, the same way up on
     * every face (windows stay upright on all four sides of a tower).
     */
    const UNIT_UV = {
        generateTopUV: function (geometry, v, a, b, c) {
            const V = window.THREE.Vector2;
            return [new V(v[a * 3], v[a * 3 + 1]), new V(v[b * 3], v[b * 3 + 1]), new V(v[c * 3], v[c * 3 + 1])];
        },
        generateSideWallUV: function (geometry, v, a, b, c, d) {
            const V = window.THREE.Vector2;
            const ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2];
            const bx = v[b * 3], by = v[b * 3 + 1], bz = v[b * 3 + 2];
            const cx = v[c * 3], cy = v[c * 3 + 1], cz = v[c * 3 + 2];
            const dx = v[d * 3], dy = v[d * 3 + 1], dz = v[d * 3 + 2];
            if (Math.abs(ay - by) < Math.abs(ax - bx)) {
                return [new V(ax, az), new V(bx, bz), new V(cx, cz), new V(dx, dz)];
            }
            return [new V(az, ay), new V(bz, by), new V(cz, cy), new V(dz, dy)];
        }
    };

    function bevelFor(minDim) { return Math.max(0.008, Math.min(0.05, minDim * 0.16)); }

    function extruded(THREE, pts, depth, bevel) {
        const b = bevel, ins = inset(pts, b);
        const shape = new THREE.Shape(ins.map(p => new THREE.Vector2(p[0], p[1])));
        const inner = Math.max(0.002, depth - 2 * b);
        const g = new THREE.ExtrudeGeometry(shape, {
            depth: inner, bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.92,
            bevelSegments: 2, curveSegments: 8, UVGenerator: UNIT_UV
        });
        g.translate(0, 0, -inner / 2);
        return g;
    }

    /** A chamfered lathe (cylinders, cones, discs). Profile is [radius, y] pairs. */
    function lathe(THREE, profile, segs) {
        return new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), segs || 32);
    }

    function cylProfile(r, h, b) {
        return [[0, -h / 2], [r - b, -h / 2], [r - b * 0.3, -h / 2 + b * 0.3], [r, -h / 2 + b], [r, h / 2 - b], [r - b * 0.3, h / 2 - b * 0.3], [r - b, h / 2], [0, h / 2]];
    }

    /** Join several geometries into one (non-indexed position/normal/uv). */
    function merge(THREE, list) {
        const parts = list.map(g => (g.index ? g.toNonIndexed() : g));
        const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
        const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
        let o = 0;
        parts.forEach(g => {
            const n = g.attributes.position.count;
            pos.set(g.attributes.position.array, o * 3);
            nor.set(g.attributes.normal.array, o * 3);
            if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
            o += n;
        });
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        return out;
    }

    function makeGeometry(THREE, s, d) {
        let g;
        switch (s) {
            case 'box': case 'tri': case 'wedge': case 'arch': {
                const minDim = Math.min(d[0], d[1], d[2]);
                g = extruded(THREE, outline(s, d), d[2], bevelFor(minDim) * (s === 'box' ? 1 : 0.7));
                break;
            }
            case 'half': g = extruded(THREE, outline(s, d), d[1], bevelFor(Math.min(d[0] / 2, d[1])) * 0.7); break;
            case 'star': g = extruded(THREE, outline(s, d), d[1], bevelFor(d[1]) * 0.8); break;
            case 'cyl': g = lathe(THREE, cylProfile(d[0], d[1], bevelFor(Math.min(d[0], d[1]))), d[0] > 0.5 ? 40 : 28); break;
            case 'cone': {
                const r = d[0], h = d[1], b = bevelFor(Math.min(r, h)) * 0.8;
                g = lathe(THREE, [[0, -h / 2], [r - b, -h / 2], [r, -h / 2 + b * 0.8], [b * 0.35, h / 2 - b * 0.4], [0, h / 2]], 36);
                break;
            }
            case 'tet': {
                // Four flat triangles, wound outward, planar UVs in block units.
                const V = tetVerts(d[0]).map(p => new THREE.Vector3(p[0], p[1], p[2]));
                const pos = [], nor = [], uv = [];
                [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]].forEach(f => {
                    let a = V[f[0]], b = V[f[1]], c = V[f[2]];
                    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
                    const mid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
                    if (n.dot(mid) < 0) { const t = b; b = c; c = t; n.negate(); }
                    const e1 = new THREE.Vector3().subVectors(b, a).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1);
                    [a, b, c].forEach(p => {
                        pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
                        uv.push(p.dot(e1), p.dot(e2));
                    });
                });
                g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
                g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
                break;
            }
            case 'pyr': {
                g = new THREE.ConeGeometry(d[0] / Math.SQRT2, d[1], 4, 1);
                g.rotateY(Math.PI / 4);
                g = g.toNonIndexed();
                g.computeVertexNormals();
                break;
            }
            case 'ball': g = new THREE.SphereGeometry(d[0], 30, 20); break;
            case 'wheels': {
                const r = d[0], w = d[1], t = Math.min(w * 0.3, r * 0.36), b = bevelFor(t);
                const disc = () => lathe(THREE, cylProfile(r, t, b), 30);
                const hub = () => lathe(THREE, cylProfile(r * 0.38, t * 1.3, b * 0.6), 18);
                const parts = [];
                [-1, 1].forEach(side => {
                    const a = disc(); a.rotateX(Math.PI / 2); a.translate(0, 0, side * (w / 2 - t / 2)); parts.push(a);
                    const c = hub(); c.rotateX(Math.PI / 2); c.translate(0, 0, side * (w / 2 - t / 2)); parts.push(c);
                });
                const axle = lathe(THREE, cylProfile(r * 0.2, w - t, 0.01), 14);
                axle.rotateX(Math.PI / 2);
                parts.push(axle);
                g = merge(THREE, parts);
                break;
            }
            default: throw new Error('Unknown shape ' + s);
        }
        g.computeBoundingBox();
        g.computeBoundingSphere();
        return g;
    }

    function geometry(THREE, s, d) {
        const key = s + ':' + d.map(v => (+v).toFixed(3)).join(',');
        let g = geoCache.get(key);
        if (!g) { g = makeGeometry(THREE, s, d); geoCache.set(key, g); }
        return g;
    }

    // --- materials ------------------------------------------------------------------------

    const texCache = new Map();
    const matCache = new Map();

    function canvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c;
    }

    function seeded(seed) {
        let s = seed >>> 0 || 1;
        return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    }

    /**
     * Pattern textures, painted once. They are near-white and multiply the
     * paint colour, so one texture serves every colour. One repeat = one
     * block unit (see UNIT_UV), except grain, which stretches over two.
     */
    const PATTERNS = {
        grain: function (ctx, W, H, rnd, strong) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            const lines = strong ? 46 : 26;
            for (let i = 0; i < lines; i++) {
                const y0 = rnd() * H, amp = 2 + rnd() * 6, f = 1 + rnd() * 2.5, ph = rnd() * 6;
                const shade = strong ? 150 + rnd() * 70 : 222 + rnd() * 25;
                ctx.strokeStyle = 'rgba(' + Math.round(shade) + ',' + Math.round(shade * 0.93) + ',' + Math.round(shade * 0.84) + ',' + (strong ? 0.55 : 0.35) + ')';
                ctx.lineWidth = 0.8 + rnd() * (strong ? 2.6 : 1.4);
                ctx.beginPath();
                for (let x = 0; x <= W; x += 8) {
                    const y = y0 + Math.sin(x / W * Math.PI * 2 * f + ph) * amp;
                    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            if (strong) {
                for (let k = 0; k < 3; k++) {
                    const x = rnd() * W, y = rnd() * H;
                    ctx.strokeStyle = 'rgba(140,100,70,0.35)';
                    ctx.lineWidth = 1.4;
                    for (let r = 3; r < 14; r += 3.5) { ctx.beginPath(); ctx.ellipse(x, y, r * 2.2, r, 0, 0, Math.PI * 2); ctx.stroke(); }
                }
            }
        },
        windows: function (ctx, W, H) {
            PATTERNS.grain(ctx, W, H, seeded(7), false);
            // One window per unit square, with a frame. Dark glass, lit sill.
            const m = W * 0.22;
            ctx.fillStyle = 'rgba(40,60,90,0.92)';
            ctx.fillRect(m, m, W - 2 * m, H - 2 * m);
            ctx.fillStyle = 'rgba(160,215,255,0.55)';
            ctx.fillRect(m + 6, m + 6, (W - 2 * m) * 0.38, (H - 2 * m) * 0.42);
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 6;
            ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
            ctx.beginPath(); ctx.moveTo(W / 2, m); ctx.lineTo(W / 2, H - m); ctx.moveTo(m, H / 2); ctx.lineTo(W - m, H / 2); ctx.stroke();
        },
        brick: function (ctx, W, H) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            const rows = 4, rh = H / rows;
            ctx.strokeStyle = 'rgba(120,110,100,0.55)';
            ctx.lineWidth = 3;
            for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * rh); ctx.lineTo(W, r * rh); ctx.stroke(); }
            for (let r = 0; r < rows; r++) {
                const off = r % 2 ? W / 4 : 0;
                for (let x = off; x < W + 1; x += W / 2) { ctx.beginPath(); ctx.moveTo(x, r * rh); ctx.lineTo(x, (r + 1) * rh); ctx.stroke(); }
            }
            const rnd = seeded(11);
            for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(0,0,0,' + (rnd() * 0.06) + ')'; ctx.fillRect(rnd() * W, rnd() * H, 18, 10); }
        },
        stripes: function (ctx, W, H) {
            PATTERNS.grain(ctx, W, H, seeded(5), false);
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            for (let i = 0; i < 4; i += 2) ctx.fillRect(0, i * H / 4, W, H / 4);
        },
        solar: function (ctx, W, H) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(30,50,110,0.9)';
            const n = 4, c = W / n;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) ctx.fillRect(i * c + 3, j * c + 3, c - 6, c - 6);
            ctx.fillStyle = 'rgba(150,200,255,0.35)';
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) ctx.fillRect(i * c + 5, j * c + 5, (c - 10) * 0.45, (c - 10) * 0.3);
        },
        dots: function (ctx, W, H) {
            PATTERNS.grain(ctx, W, H, seeded(3), false);
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(W * (0.25 + i * 0.5), H * (0.25 + j * 0.5), W * 0.09, 0, Math.PI * 2); ctx.fill(); }
        },
        plain: null,
        metal: null
    };

    /**
     * White stripes and white dots cannot come from a multiplying texture
     * (white x paint = paint), so these two bake the paint colour in and draw
     * real white over it; their material colour is then plain white.
     */
    const TWO_TONE = { stripes: true, dots: true };
    function paintTwoTone(ctx, W, H, pattern, paint) {
        ctx.fillStyle = paint;
        ctx.fillRect(0, 0, W, H);
        const rnd = seeded(pattern === 'dots' ? 3 : 5);
        for (let i = 0; i < 22; i++) {
            const y0 = rnd() * H, amp = 2 + rnd() * 5, f = 1 + rnd() * 2, ph = rnd() * 6;
            ctx.strokeStyle = 'rgba(60,35,10,' + (0.05 + rnd() * 0.06).toFixed(3) + ')';
            ctx.lineWidth = 0.8 + rnd() * 1.4;
            ctx.beginPath();
            for (let x = 0; x <= W; x += 8) { const y = y0 + Math.sin(x / W * Math.PI * 2 * f + ph) * amp; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke();
        }
        ctx.fillStyle = '#fbf6ea';
        if (pattern === 'stripes') {
            for (let i = 0; i < 4; i += 2) ctx.fillRect(0, i * H / 4, W, H / 4);
        } else {
            for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(W * (0.25 + i * 0.5), H * (0.25 + j * 0.5), W * 0.11, 0, Math.PI * 2); ctx.fill(); }
        }
    }

    function texture(THREE, pattern, paint) {
        const key = TWO_TONE[pattern] ? pattern + paint : pattern;
        if (texCache.has(key)) return texCache.get(key);
        const fn = TWO_TONE[pattern] ? (c, W, H) => paintTwoTone(c, W, H, pattern, paint)
            : pattern === 'wood' ? (c, W, H) => PATTERNS.grain(c, W, H, seeded(91), true)
            : pattern === 'grain' ? (c, W, H) => PATTERNS.grain(c, W, H, seeded(29), false) : PATTERNS[pattern];
        let tex = null;
        if (fn) {
            const cv = canvas(256, 256);
            fn(cv.getContext('2d'), 256, 256, seeded(41));
            tex = new THREE.CanvasTexture(cv);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            if (pattern === 'grain' || pattern === 'wood') tex.repeat.set(0.5, 0.5);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4;
        }
        texCache.set(key, tex);
        return tex;
    }

    function colorHex(c) { return PALETTE[c] || c || PALETTE.wood; }

    /** One shared material per colour + pattern. Callers must never dispose these. */
    function material(THREE, c, t) {
        const pattern = t || (c === 'wood' || c === 'oak' ? 'wood' : 'grain');
        const key = c + '|' + pattern;
        let m = matCache.get(key);
        if (m) return m;
        const metal = pattern === 'metal' || c === 'gold' || c === 'silver';
        m = new THREE.MeshStandardMaterial({
            color: new THREE.Color(TWO_TONE[pattern] ? '#ffffff' : colorHex(c)),
            map: texture(THREE, pattern === 'metal' ? 'plain' : pattern, colorHex(c)),
            roughness: metal ? 0.38 : pattern === 'solar' ? 0.32 : 0.62,
            metalness: metal ? 0.45 : 0
        });
        matCache.set(key, m);
        return m;
    }

    /** The ghost that shows where the next block will go. */
    let ghostMat = null;
    function ghostMaterial(THREE) {
        if (!ghostMat) {
            ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
        }
        return ghostMat;
    }

    /** A mesh for one block spec, positioned and rotated. */
    function mesh(THREE, spec) {
        const m = new THREE.Mesh(geometry(THREE, spec.s, spec.d), material(THREE, spec.c, spec.t));
        m.castShadow = true;
        m.receiveShadow = true;
        place(m, spec);
        return m;
    }

    function place(obj, spec) {
        obj.position.set(spec.p[0], spec.p[1], spec.p[2]);
        const r = spec.r || [0, 0, 0];
        obj.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ');
    }

    // --- world-space bounds -------------------------------------------------------------------

    /** Rotate a local point by the spec's XYZ Euler angles. */
    function rotate(spec, x, y, z) {
        const r = spec.r || [0, 0, 0];
        if (!r[0] && !r[1] && !r[2]) return [x, y, z];
        // Three.js 'XYZ' order means the matrix is Rx * Ry * Rz: apply Z first.
        const cx = Math.cos(r[0] * DEG), sx = Math.sin(r[0] * DEG);
        const cy = Math.cos(r[1] * DEG), sy = Math.sin(r[1] * DEG);
        const cz = Math.cos(r[2] * DEG), sz = Math.sin(r[2] * DEG);
        let X = x * cz - y * sz, Y = x * sz + y * cz, Z = z;
        let X2 = X * cy + Z * sy, Z2 = -X * sy + Z * cy; X = X2; Z = Z2;
        let Y2 = Y * cx - Z * sx; Z2 = Y * sx + Z * cx; Y = Y2; Z = Z2;
        return [X, Y, Z];
    }

    /**
     * Sample points that cover the shape (corners of its outline, rim points of
     * round shapes). Used for world bounding boxes and the build checker.
     */
    function localPoints(s, d) {
        const pts = [];
        const h = half(s, d);
        if (s === 'cyl' || s === 'cone' || s === 'wheels' || s === 'ball') {
            const r = d[0];
            for (let i = 0; i < 16; i++) {
                const a = i / 16 * Math.PI * 2, c = Math.cos(a) * r, si = Math.sin(a) * r;
                if (s === 'wheels') { pts.push([c, si, -h[2]], [c, si, h[2]]); }
                else if (s === 'ball') { pts.push([c, si, 0], [c, 0, si], [0, c, si]); }
                else { pts.push([c, -h[1], si]); if (s === 'cyl') pts.push([c, h[1], si]); }
            }
            if (s === 'cone') pts.push([0, h[1], 0]);
            return pts;
        }
        if (s === 'tet') return tetVerts(d[0]);
        if (s === 'pyr') {
            [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(q => pts.push([q[0] * h[0], -h[1], q[1] * h[2]]));
            pts.push([0, h[1], 0]);
            return pts;
        }
        if (s === 'box') {
            for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push([x * h[0], y * h[1], z * h[2]]);
            return pts;
        }
        const zz = s === 'half' ? d[1] / 2 : s === 'star' ? d[1] / 2 : d[2] / 2;
        outline(s, d).forEach(p => { pts.push([p[0], p[1], -zz], [p[0], p[1], zz]); });
        return pts;
    }

    /** World-space axis-aligned bounding box of a placed spec: { min: [x,y,z], max: [x,y,z] }. */
    function bounds(spec) {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        localPoints(spec.s, spec.d).forEach(p => {
            const q = rotate(spec, p[0], p[1], p[2]);
            for (let k = 0; k < 3; k++) {
                const v = q[k] + spec.p[k];
                if (v < min[k]) min[k] = v;
                if (v > max[k]) max[k] = v;
            }
        });
        return { min: min, max: max };
    }

    // --- physics shapes ---------------------------------------------------------------------

    /**
     * A plain description of the collision shape, independent of Ammo so the
     * Node tests can read it too:
     *   { type: 'box', half } | { type: 'cyl', r, h } | { type: 'cylZ', r, w } |
     *   { type: 'cone', r, h } | { type: 'sphere', r } | { type: 'hull', points } |
     *   { type: 'compound', parts: [{ shape, offset: [x,y,z] }] }
     */
    function collider(s, d) {
        switch (s) {
            case 'box': return { type: 'box', half: half(s, d) };
            case 'cyl': return { type: 'cyl', r: d[0], h: d[1] };
            case 'cone': return { type: 'cone', r: d[0], h: d[1] };
            case 'ball': return { type: 'sphere', r: d[0] };
            case 'wheels': return { type: 'cylZ', r: d[0], w: d[1] };
            case 'pyr': return { type: 'hull', points: localPoints(s, d) };
            case 'tet': return { type: 'hull', points: tetVerts(d[0]) };
            case 'tri': case 'wedge': case 'half': case 'star': {
                const zz = s === 'half' || s === 'star' ? d[1] / 2 : d[2] / 2;
                let o = outline(s, d);
                if (s === 'star') o = o.filter((p, i) => i % 2 === 0);   // its convex hull is the pentagon
                if (s === 'half') o = o.filter((p, i) => i % 2 === 0);
                const points = [];
                o.forEach(p => points.push([p[0], p[1], -zz], [p[0], p[1], zz]));
                return { type: 'hull', points: points };
            }
            case 'arch': {
                const A = archParts(d), x = A.w / 2, y = A.h / 2, z = d[2] / 2, parts = [];
                const legW = x - A.a;
                if (legW > 0.01) {
                    [-1, 1].forEach(side => parts.push({
                        shape: { type: 'box', half: [legW / 2, y, z] }, offset: [side * (A.a + legW / 2), 0, 0]
                    }));
                }
                const n = 6;
                for (let i = 0; i < n; i++) {
                    const x0 = -A.a + i / n * 2 * A.a, x1 = -A.a + (i + 1) / n * 2 * A.a;
                    const y0 = A.spring + Math.sqrt(Math.max(0, A.a * A.a - x0 * x0));
                    const y1 = A.spring + Math.sqrt(Math.max(0, A.a * A.a - x1 * x1));
                    const pts = [];
                    [[x0, y0], [x1, y1], [x1, y], [x0, y]].forEach(p => pts.push([p[0], p[1], -z], [p[0], p[1], z]));
                    parts.push({ shape: { type: 'hull', points: pts }, offset: [0, 0, 0] });
                }
                return { type: 'compound', parts: parts };
            }
            default: throw new Error('Unknown shape ' + s);
        }
    }

    function speakColor(c) { return COLOR_NAMES[c] || c; }

    // --- point tests (build checker and support graph) ---------------------------------------

    /** World point -> the spec's local frame (undo position, then X, Y, Z rotations). */
    function toLocal(spec, x, y, z) {
        x -= spec.p[0]; y -= spec.p[1]; z -= spec.p[2];
        const r = spec.r || [0, 0, 0];
        if (!r[0] && !r[1] && !r[2]) return [x, y, z];
        const cx = Math.cos(r[0] * DEG), sx = Math.sin(r[0] * DEG);
        const cy = Math.cos(r[1] * DEG), sy = Math.sin(r[1] * DEG);
        const cz = Math.cos(r[2] * DEG), sz = Math.sin(r[2] * DEG);
        let Y = y * cx + z * sx, Z = -y * sx + z * cx; y = Y; z = Z;
        let X = x * cy - z * sy; Z = x * sy + z * cy; x = X; z = Z;
        X = x * cz + y * sz; Y = -x * sz + y * cz;
        return [X, Y, z];
    }

    function inPoly(pts, x, y) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const a = pts[i], b = pts[j];
            if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        return inside;
    }

    const polyCache = new Map();
    function polyFor(s, d, grow) {
        const key = s + d.join(',') + '|' + grow;
        let o = polyCache.get(key);
        if (!o) { o = outline(s, d); if (grow) o = inset(o, -grow); polyCache.set(key, o); }
        return o;
    }

    /**
     * Is the local point inside the shape, grown outward by `grow`? Growing
     * is approximate for curved shapes, which is all the checker needs.
     */
    function insideLocal(s, d, x, y, z, grow) {
        const g = grow || 0;
        const h = half(s, d);
        if (Math.abs(x) > h[0] + g || Math.abs(y) > h[1] + g || Math.abs(z) > h[2] + g) return false;
        switch (s) {
            case 'box': return true;
            case 'cyl': return x * x + z * z <= Math.pow(d[0] + g, 2);
            case 'cone': { const rr = d[0] * (0.5 - y / d[1]) + g; return rr > 0 && x * x + z * z <= rr * rr; }
            case 'pyr': { const hw = d[0] / 2 * (0.5 - y / d[1]) + g; return Math.abs(x) <= hw && Math.abs(z) <= hw; }
            case 'tet': return inTet(d[0], x, y, z, g);
            case 'ball': return x * x + y * y + z * z <= Math.pow(d[0] + g, 2);
            case 'wheels': return x * x + y * y <= Math.pow(d[0] + g, 2);
            default: return inPoly(polyFor(s, d, g), x, y);
        }
    }

    function inside(spec, x, y, z, grow) {
        const l = toLocal(spec, x, y, z);
        return insideLocal(spec.s, spec.d, l[0], l[1], l[2], grow);
    }

    /** Points spread through the shape's solid, in world space (n per axis). */
    function samples(spec, n) {
        n = n || 7;
        const h = half(spec.s, spec.d), out = [];
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
            const x = -h[0] + (i + 0.5) / n * 2 * h[0], y = -h[1] + (j + 0.5) / n * 2 * h[1], z = -h[2] + (k + 0.5) / n * 2 * h[2];
            if (!insideLocal(spec.s, spec.d, x, y, z, 0)) continue;
            const q = rotate(spec, x, y, z);
            out.push([q[0] + spec.p[0], q[1] + spec.p[1], q[2] + spec.p[2]]);
        }
        return out;
    }

    /** Points on and just outside the shape's surface (a shell grown by `grow`). */
    function shell(spec, grow, n) {
        n = n || 9;
        const h = half(spec.s, spec.d), out = [], g = grow, e = grow * 0.75;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
            // Sample a hair inside the grown shape, never exactly on its edge.
            const x = -h[0] - e + i / (n - 1) * 2 * (h[0] + e);
            const y = -h[1] - e + j / (n - 1) * 2 * (h[1] + e);
            const z = -h[2] - e + k / (n - 1) * 2 * (h[2] + e);
            if (!insideLocal(spec.s, spec.d, x, y, z, g) || insideLocal(spec.s, spec.d, x, y, z, -g * 0.5)) continue;
            const q = rotate(spec, x, y, z);
            out.push([q[0] + spec.p[0], q[1] + spec.p[1], q[2] + spec.p[2]]);
        }
        return out;
    }

    return {
        toLocal: toLocal,
        inside: inside,
        insideLocal: insideLocal,
        samples: samples,
        shell: shell,
        PALETTE: PALETTE,
        DEG: DEG,
        half: half,
        volume: volume,
        outline: outline,
        geometry: geometry,
        material: material,
        ghostMaterial: ghostMaterial,
        mesh: mesh,
        place: place,
        rotate: rotate,
        localPoints: localPoints,
        bounds: bounds,
        collider: collider,
        colorHex: colorHex,
        speakColor: speakColor,
        texture: texture
    };
})();
