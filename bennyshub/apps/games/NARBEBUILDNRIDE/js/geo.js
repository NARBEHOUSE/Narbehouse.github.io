/**
 * NARBE Build n Ride - a merged low-poly geometry builder.
 *
 * Everything static (terrain, track, bridges, props, the train's bodies) is
 * built as plain triangles with flat normals and per-vertex colours, then
 * merged into one BufferGeometry, so a whole chunk of world is one draw call.
 *
 *   const b = BNR.Geo.builder();
 *   b.box(x, y, z, sx, sy, sz, '#c8553d', { ry: 0.3 });
 *   b.prim('cyl', matrix, '#8a5a33')            any cached primitive, any matrix
 *   b.quad([x,y,z], [x,y,z], [x,y,z], [x,y,z], colour)
 *   const geometry = b.geometry();
 *
 * Colours are sRGB ('#rrggbb' or [r, g, b] 0..1) and stored linear, as three.js wants.
 */

window.BNR = window.BNR || {};

BNR.Geo = (function () {
    'use strict';

    let THREE = null;
    const prims = {};
    const colorCache = new Map();
    let tmpM = null, tmpV = null;

    function init(three) {
        THREE = three;
        tmpM = new THREE.Matrix4();
        tmpV = new THREE.Vector3();
    }

    function toLinear(c) { return c <= 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4); }

    /** sRGB colour -> linear [r, g, b]. */
    function lin(col) {
        if (Array.isArray(col)) return [toLinear(col[0]), toLinear(col[1]), toLinear(col[2])];
        let c = colorCache.get(col);
        if (!c) {
            const h = String(col).replace('#', '');
            c = [toLinear(parseInt(h.slice(0, 2), 16) / 255), toLinear(parseInt(h.slice(2, 4), 16) / 255), toLinear(parseInt(h.slice(4, 6), 16) / 255)];
            colorCache.set(col, c);
        }
        return c;
    }

    /** A primitive's triangles as a flat position array (cached by key). */
    function primitive(name) {
        if (prims[name]) return prims[name];
        let g;
        const m = /^(\w+)(?::(.*))?$/.exec(name);
        const args = m[2] ? m[2].split(',').map(Number) : [];
        switch (m[1]) {
            case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
            // cyl:top,bottom,segments (height 1, centred)
            case 'cyl': g = new THREE.CylinderGeometry(args[0] === undefined ? 0.5 : args[0], args[1] === undefined ? 0.5 : args[1], 1, args[2] || 8, 1); break;
            case 'cone': g = new THREE.ConeGeometry(0.5, 1, args[0] || 7, 1); break;
            case 'ico': g = new THREE.IcosahedronGeometry(0.5, args[0] || 0); break;
            case 'dodeca': g = new THREE.DodecahedronGeometry(0.5, 0); break;
            case 'octa': g = new THREE.OctahedronGeometry(0.5, 0); break;
            case 'sphere': g = new THREE.SphereGeometry(0.5, args[0] || 8, args[1] || 6); break;
            // prism: a triangular prism along z (a gable roof when its ridge is up)
            case 'prism': {
                g = new THREE.BufferGeometry();
                const v = [
                    -0.5, -0.5, -0.5, 0, 0.5, -0.5, 0.5, -0.5, -0.5,
                    0.5, -0.5, 0.5, 0, 0.5, 0.5, -0.5, -0.5, 0.5,
                    -0.5, -0.5, 0.5, 0, 0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0, 0.5, 0.5, 0, 0.5, -0.5,
                    0.5, -0.5, -0.5, 0, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5,
                    -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5
                ];
                g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
                break;
            }
            default: throw new Error('No primitive ' + name);
        }
        const ng = g.index ? g.toNonIndexed() : g;
        const arr = Float32Array.from(ng.attributes.position.array);
        g.dispose(); if (ng !== g) ng.dispose();
        prims[name] = arr;
        return arr;
    }

    function Builder() { this.p = []; this.c = []; this.lite = false; }

    Builder.prototype.tri = function (a, b, c, col) {
        const k = lin(col);
        this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        this.c.push(k[0], k[1], k[2], k[0], k[1], k[2], k[0], k[1], k[2]);
    };

    /** Two triangles a-b-c, a-c-d (counter-clockwise seen from the front). */
    Builder.prototype.quad = function (a, b, c, d, col) {
        this.tri(a, b, c, col);
        this.tri(a, c, d, col);
    };

    /** Append a primitive transformed by a THREE.Matrix4. shade: optional per-face brightness jitter (0..1). */
    Builder.prototype.prim = function (name, matrix, col, shade) {
        const src = primitive(name);
        const k = lin(col);
        const e = matrix.elements;
        for (let i = 0; i < src.length; i += 9) {
            let f = 1;
            if (shade) f = 1 - shade * (((i * 7919) % 97) / 97);
            for (let j = 0; j < 9; j += 3) {
                const x = src[i + j], y = src[i + j + 1], z = src[i + j + 2];
                this.p.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
                this.c.push(k[0] * f, k[1] * f, k[2] * f);
            }
        }
    };

    /** Compose a matrix from position, rotation (radians, XYZ order) and scale. */
    function matrix(x, y, z, rx, ry, rz, sx, sy, sz) {
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
        m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz));
        return m;
    }

    /** A box centred at (x, y, z). o: { rx, ry, rz, shade, m (parent matrix) }. */
    Builder.prototype.box = function (x, y, z, sx, sy, sz, col, o) {
        o = o || {};
        let m = matrix(x, y, z, o.rx, o.ry, o.rz, sx, sy, sz);
        if (o.m) m = new THREE.Matrix4().multiplyMatrices(o.m, m);
        this.prim('box', m, col, o.shade);
    };

    /** Any primitive by name, centred at (x, y, z), scaled (sx, sy, sz). */
    Builder.prototype.shape = function (name, x, y, z, sx, sy, sz, col, o) {
        o = o || {};
        let m = matrix(x, y, z, o.rx, o.ry, o.rz, sx, sy, sz);
        if (o.m) m = new THREE.Matrix4().multiplyMatrices(o.m, m);
        this.prim(name, m, col, o.shade);
    };

    /** A beam from point a to point b with a square-ish cross-section w x h. */
    Builder.prototype.beam = function (a, b, w, h, col, o) {
        o = o || {};
        const A = new THREE.Vector3(a[0], a[1], a[2]), B = new THREE.Vector3(b[0], b[1], b[2]);
        const len = A.distanceTo(B);
        if (len < 1e-6) return;
        const dir = B.clone().sub(A).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        if (o.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.roll));
        const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(w, len, h));
        this.prim(o.prim || 'box', m, col, o.shade);
    };

    /**
     * A rounded box ("blob") for animal bodies, heads and limbs: a box of size
     * (sx, sy, sz) centred at (x, y, z), each face cut into segs x segs, its
     * corners pulled round by o.round (0 = a box, 1 = an ellipsoid).
     * col: a colour, or fn(cx, cy, cz) -> colour, given the face piece's centre
     * on the unit box ([-1, 1] on each axis), for patches and pale bellies.
     * o: { segs, round, rx, ry, rz, m (parent matrix), taper (size at +z
     * relative to -z), shade (face brightness jitter) }
     */
    Builder.prototype.blob = function (x, y, z, sx, sy, sz, col, o) {
        o = o || {};
        // A lite builder (scenery seen from the train) uses one cut fewer per face, unless told otherwise.
        const segs = this.lite ? (o.liteSegs || Math.max(1, (o.segs || 2) - 1)) : (o.segs || 2);
        const round = o.round === undefined ? 0.6 : o.round, taper = o.taper === undefined ? 1 : o.taper;
        let M = matrix(x, y, z, o.rx, o.ry, o.rz, 1, 1, 1);
        if (o.m) M = new THREE.Matrix4().multiplyMatrices(o.m, M);
        const e = M.elements;
        const shape = function (px, py, pz) {
            const l = Math.hypot(px, py, pz) || 1;
            let vx = px * (1 - round) + px / l * round, vy = py * (1 - round) + py / l * round;
            const vz = pz * (1 - round) + pz / l * round;
            const k = 1 + (taper - 1) * (vz + 1) / 2;
            vx *= k * sx / 2; vy *= k * sy / 2;
            const wz = vz * sz / 2;
            return [e[0] * vx + e[4] * vy + e[8] * wz + e[12], e[1] * vx + e[5] * vy + e[9] * wz + e[13], e[2] * vx + e[6] * vy + e[10] * wz + e[14]];
        };
        const FACES = [
            [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
            [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
            [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]
        ];
        let f = 0;
        for (const F of FACES) {
            const n = F[0], u = F[1], v = F[2];
            for (let i = 0; i < segs; i++) for (let j = 0; j < segs; j++) {
                const a0 = -1 + 2 * i / segs, a1 = -1 + 2 * (i + 1) / segs, b0 = -1 + 2 * j / segs, b1 = -1 + 2 * (j + 1) / segs;
                const P = function (a, b) { return shape(n[0] + a * u[0] + b * v[0], n[1] + a * u[1] + b * v[1], n[2] + a * u[2] + b * v[2]); };
                const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
                let c = typeof col === 'function' ? col(n[0] + am * u[0] + bm * v[0], n[1] + am * u[1] + bm * v[1], n[2] + am * u[2] + bm * v[2]) : col;
                if (o.shade) {
                    const k = 1 - o.shade * (((f * 7919 + i * 31 + j * 17) % 97) / 97);
                    const L = lin(c);
                    c = null;
                    const p00 = P(a0, b0), p10 = P(a1, b0), p11 = P(a1, b1), p01 = P(a0, b1);
                    this.p.push(p00[0], p00[1], p00[2], p10[0], p10[1], p10[2], p11[0], p11[1], p11[2], p00[0], p00[1], p00[2], p11[0], p11[1], p11[2], p01[0], p01[1], p01[2]);
                    for (let q = 0; q < 6; q++) this.c.push(L[0] * k, L[1] * k, L[2] * k);
                    continue;
                }
                this.quad(P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1), c);
            }
            f++;
        }
    };

    Builder.prototype.count = function () { return this.p.length / 9; };

    /** Merge everything into one BufferGeometry with flat normals and colours. */
    Builder.prototype.geometry = function () {
        const pos = new Float32Array(this.p);
        const col = new Float32Array(this.c);
        const nor = new Float32Array(pos.length);
        for (let i = 0; i < pos.length; i += 9) {
            const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
            const e1x = pos[i + 3] - ax, e1y = pos[i + 4] - ay, e1z = pos[i + 5] - az;
            const e2x = pos[i + 6] - ax, e2y = pos[i + 7] - ay, e2z = pos[i + 8] - az;
            let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
            for (let j = 0; j < 9; j += 3) { nor[i + j] = nx; nor[i + j + 1] = ny; nor[i + j + 2] = nz; }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.computeBoundingSphere();
        return g;
    };

    return {
        init: init,
        builder: function () { return new Builder(); },
        matrix: matrix,
        lin: lin
    };
})();
