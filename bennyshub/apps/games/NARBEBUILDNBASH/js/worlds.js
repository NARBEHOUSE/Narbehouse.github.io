/**
 * NARBE Build n Bash - the worlds around each build.
 *
 * Every build stands on a clear, blank patch of ground (the PLOT) in the
 * middle of a themed little world. The build is always the star: the world
 * sets the mood from the edges and the distance, and nothing tall ever stands
 * between the camera and the plot.
 *
 * Look: a toy diorama. Rounded, chunky, low-poly shapes, soft warm light,
 * gentle fog that melts the far distance into the sky. No text, no logos,
 * nothing that flashes.
 *
 * Register a world:
 *   BNB.Worlds.register('id', {
 *     name: 'Neighborhood',
 *     sky: [top, middle, horizon],            CSS colours of the sky dome
 *     fog: { color, near, far },              optional
 *     light: { sky, ground, hemi, sun, sunIntensity, dir: [x,y,z] },
 *     dust: '#colour',                        landing dust (optional)
 *     ground: 'plane' | 'none' | [{ half, pos }],   physics floor (default 'plane', top at y=0)
 *     water: y,                               blocks that fall below it splash and sink (optional)
 *     zeroG: true,                            space: no gravity, no ground (optional)
 *     camera: { az, el, dist },               view override (optional)
 *     build: function (kit) { ...add meshes with kit...; return { update(dt, t) } }
 *   });
 *
 * kit (see makeKit): THREE, rand, group, plot (clear radius), view (camera),
 * detail (1 / 0.7 / 0.45 for High / Standard / Low), mat(), add(), free(), ...
 */

window.BNB = window.BNB || {};

BNB.Worlds = (function () {
    'use strict';

    const REG = {};

    function register(id, def) { def.id = id; REG[id] = def; }
    function info(id) { return REG[id] || null; }

    function makeKit(THREE, o, group, owned) {
        const rand = o.rand || Math.random;
        const matCache = new Map();
        const detail = o.quality === 'low' ? 0.45 : o.quality === 'standard' ? 0.7 : 1;
        const view = o.view || { az: -24, el: 17, dist: 9, center: new THREE.Vector3(0, 1, 0) };

        function own(x) { owned.push(x); return x; }

        const kit = {
            THREE: THREE,
            rand: rand,
            group: group,
            plot: o.plot || 4,
            view: view,
            detail: detail,
            quality: o.quality || 'high',
            /** Random number in [a, b). */
            range: function (a, b) { return a + rand() * (b - a); },
            pick: function (list) { return list[Math.floor(rand() * list.length)]; },
            /**
             * A shared standard material. opts: rough, metal, emissive, emissiveIntensity,
             * flat, transparent, opacity, side, map, vertexColors, fog.
             */
            mat: function (color, opts) {
                opts = opts || {};
                const key = color + JSON.stringify(opts, (k, v) => (k === 'map' ? (v && v.uuid) : v));
                let m = matCache.get(key);
                if (m) return m;
                m = own(new THREE.MeshStandardMaterial({
                    color: new THREE.Color(color), roughness: opts.rough === undefined ? 0.85 : opts.rough,
                    metalness: opts.metal || 0, flatShading: !!opts.flat,
                    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0),
                    emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity,
                    transparent: !!opts.transparent, opacity: opts.opacity === undefined ? 1 : opts.opacity,
                    side: opts.side || THREE.FrontSide, map: opts.map || null, vertexColors: !!opts.vertexColors,
                    fog: opts.fog !== false, depthWrite: opts.depthWrite !== false
                }));
                matCache.set(key, m);
                return m;
            },
            /** An unlit material (glows, distant silhouettes, sky things). */
            basic: function (color, opts) {
                opts = opts || {};
                return own(new THREE.MeshBasicMaterial({
                    color: new THREE.Color(color), transparent: !!opts.transparent, opacity: opts.opacity === undefined ? 1 : opts.opacity,
                    side: opts.side || THREE.FrontSide, fog: opts.fog !== false, depthWrite: opts.depthWrite !== false,
                    map: opts.map || null, vertexColors: !!opts.vertexColors, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending
                }));
            },
            /** Register a geometry for disposal and return it. */
            geo: function (g) { return own(g); },
            /**
             * Add a mesh. at: { x, y, z, rx, ry, rz, s (uniform) | sx, sy, sz, cast, receive, parent }.
             * Returns the mesh.
             */
            add: function (geometry, material, at) {
                at = at || {};
                const m = new THREE.Mesh(geometry, material);
                m.position.set(at.x || 0, at.y || 0, at.z || 0);
                m.rotation.set(at.rx || 0, at.ry || 0, at.rz || 0);
                const s = at.s === undefined ? 1 : at.s;
                m.scale.set(at.sx === undefined ? s : at.sx, at.sy === undefined ? s : at.sy, at.sz === undefined ? s : at.sz);
                m.castShadow = !!at.cast;
                m.receiveShadow = at.receive !== false;
                (at.parent || group).add(m);
                return m;
            },
            /** Many copies of one mesh in one draw call. list: [{ x, y, z, rx, ry, rz, s|sx,sy,sz, color }]. */
            instanced: function (geometry, material, list, at) {
                at = at || {};
                const im = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
                const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
                list.forEach((t, i) => {
                    const u = t.s === undefined ? 1 : t.s;
                    m.compose(p.set(t.x || 0, t.y || 0, t.z || 0), q.setFromEuler(e.set(t.rx || 0, t.ry || 0, t.rz || 0)),
                        s.set(t.sx === undefined ? u : t.sx, t.sy === undefined ? u : t.sy, t.sz === undefined ? u : t.sz));
                    im.setMatrixAt(i, m);
                    if (t.color) im.setColorAt(i, new THREE.Color(t.color));
                });
                im.count = list.length;
                im.castShadow = !!at.cast;
                im.receiveShadow = at.receive !== false;
                (at.parent || group).add(im);
                return im;
            },
            /** A canvas texture painted by draw(ctx, w, h). */
            canvasTexture: function (w, h, draw, repeat) {
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                draw(c.getContext('2d'), w, h);
                const t = own(new THREE.CanvasTexture(c));
                t.colorSpace = THREE.SRGBColorSpace;
                if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
                return t;
            },
            /** Angle (radians, around Y) from the plot centre toward the camera. */
            cameraAngle: function () { return Math.atan2(Math.sin(view.az * Math.PI / 180), Math.cos(view.az * Math.PI / 180)); },
            /**
             * Is (x, z) a fair spot for a prop of radius r and height h? False inside
             * the plot (plus a margin), or anywhere a tall prop would block the
             * camera's view of the plot. Low props (h < 0.35) may sit nearer the camera.
             */
            free: function (x, z, r, h) {
                r = r || 0.5; h = h === undefined ? 2 : h;
                const cx = view.center.x, cz = view.center.z;
                const d = Math.hypot(x - cx, z - cz);
                if (d < kit.plot + 0.8 + r) return false;
                if (h < 0.35) return true;
                // The corridor from the plot to the camera, and a little past it.
                const az = view.az * Math.PI / 180, dx = Math.sin(az), dz = Math.cos(az);
                const along = (x - cx) * dx + (z - cz) * dz, across = Math.abs(-(x - cx) * dz + (z - cz) * dx);
                if (along > 0 && along < view.dist + 6 && across < kit.plot + 2.5 + along * 0.55 + r) return false;
                return true;
            },
            /** Big ground disc with soft colour variation; returns the mesh. */
            groundDisc: function (color, radius, opts) {
                opts = opts || {};
                const R = radius || 160;
                const g = own(new THREE.PlaneGeometry(R * 2, R * 2, 72, 72));
                g.rotateX(-Math.PI / 2);
                const pos = g.attributes.position, cols = new Float32Array(pos.count * 3), base = new THREE.Color(color), c = new THREE.Color();
                const vary = opts.vary === undefined ? 0.06 : opts.vary;
                for (let i = 0; i < pos.count; i++) {
                    const x = pos.getX(i), z = pos.getZ(i);
                    const n = Math.sin(x * 0.21 + Math.cos(z * 0.13) * 2) * 0.5 + Math.sin(z * 0.17 - x * 0.07) * 0.5;
                    c.copy(base).offsetHSL(0, 0, n * vary);
                    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
                }
                g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
                return kit.add(g, kit.mat('#ffffff', { vertexColors: true, rough: 0.95 }), { y: opts.y || 0 });
            },
            /**
             * The clear patch the build stands on: a soft-edged disc a hair above
             * the ground, in its own colour, with an optional rim colour.
             */
            plotPatch: function (color, opts) {
                opts = opts || {};
                const R = kit.plot + (opts.extra || 0.4);
                const g = own(new THREE.CircleGeometry(R, 64));
                g.rotateX(-Math.PI / 2);
                const rim = own(new THREE.RingGeometry(R, R + (opts.rimWidth || 0.35), 64));
                rim.rotateX(-Math.PI / 2);
                kit.add(g, kit.mat(color, { rough: 0.95 }), { x: view.center.x, y: 0.004, z: view.center.z });
                if (opts.rim) kit.add(rim, kit.mat(opts.rim, { rough: 0.95 }), { x: view.center.x, y: 0.006, z: view.center.z });
            },
            // --- shared props ---------------------------------------------------------------
            /** A round cartoon tree. */
            tree: function (x, z, s, opts) {
                opts = opts || {};
                s = s || 1;
                const trunk = kit.geo(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 8));
                const crown = kit.geo(new THREE.IcosahedronGeometry(0.9, 1));
                const t = new THREE.Group();
                t.position.set(x, 0, z);
                t.scale.setScalar(s);
                kit.add(trunk, kit.mat(opts.trunk || '#8a5a33'), { y: 0.6, parent: t, cast: true });
                const leaf = kit.mat(opts.leaf || kit.pick(['#4caf50', '#5cb85c', '#3e9b4f', '#6cc04a']), { flat: true });
                kit.add(crown, leaf, { y: 1.75, parent: t, cast: true });
                kit.add(crown, leaf, { x: 0.45, y: 1.45, z: 0.2, s: 0.62, parent: t, cast: true });
                kit.add(crown, leaf, { x: -0.4, y: 1.5, z: -0.15, s: 0.66, parent: t, cast: true });
                group.add(t);
                return t;
            },
            /** A pointy pine tree. */
            pine: function (x, z, s, color) {
                s = s || 1;
                const t = new THREE.Group();
                t.position.set(x, 0, z);
                t.scale.setScalar(s);
                kit.add(kit.geo(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6)), kit.mat('#7a4f2c'), { y: 0.4, parent: t, cast: true });
                const leaf = kit.mat(color || '#2f7d4a', { flat: true });
                [[1.0, 1.4, 0.9], [0.8, 1.2, 1.6], [0.55, 1.0, 2.25]].forEach(l => {
                    kit.add(kit.geo(new THREE.ConeGeometry(l[0], l[1], 7)), leaf, { y: l[2], parent: t, cast: true });
                });
                group.add(t);
                return t;
            },
            /** A puffy cloud made of balls; returns its group (drift it in update). */
            cloud: function (x, y, z, s) {
                const c = new THREE.Group();
                c.position.set(x, y, z);
                c.scale.setScalar(s || 1);
                const g = kit.geo(new THREE.IcosahedronGeometry(1, 1)), m = kit.mat('#ffffff', { rough: 1, flat: true, emissive: '#dfe9f5', emissiveIntensity: 0.35 });
                [[0, 0, 0, 1.3], [1.3, -0.2, 0.1, 1], [-1.3, -0.25, 0, 0.95], [0.5, 0.55, -0.1, 0.9], [-0.6, 0.4, 0.2, 0.8]].forEach(b => {
                    kit.add(g, m, { x: b[0], y: b[1], z: b[2], s: b[3], parent: c, receive: false });
                });
                group.add(c);
                return c;
            },
            /** A simple house silhouette for the distance. */
            house: function (x, z, ry, s, wall, roof) {
                const h = new THREE.Group();
                h.position.set(x, 0, z);
                h.rotation.y = ry || 0;
                h.scale.setScalar(s || 1);
                kit.add(kit.geo(new THREE.BoxGeometry(2, 1.5, 1.7)), kit.mat(wall || '#f3e2c0'), { y: 0.75, parent: h, cast: true });
                const r = kit.geo(new THREE.CylinderGeometry(0.01, 1.45, 1.1, 4, 1));
                r.rotateY(Math.PI / 4);
                kit.add(r, kit.mat(roof || '#c8553d', { flat: true }), { y: 2.05, sx: 1.06, sz: 0.92, parent: h, cast: true });
                const win = kit.mat('#3c5a80', { rough: 0.4, emissive: '#22344d', emissiveIntensity: 0.25 });
                kit.add(kit.geo(new THREE.BoxGeometry(0.4, 0.4, 0.05)), win, { x: -0.5, y: 0.95, z: 0.86, parent: h });
                kit.add(kit.geo(new THREE.BoxGeometry(0.4, 0.4, 0.05)), win, { x: 0.5, y: 0.95, z: 0.86, parent: h });
                kit.add(kit.geo(new THREE.BoxGeometry(0.42, 0.75, 0.05)), kit.mat('#7b4a2a'), { y: 0.38, z: 0.86, parent: h });
                group.add(h);
                return h;
            },
            /** A flock of little V birds circling a point; returns { update(dt, t) }. */
            birds: function (cx, cy, cz, count, radius) {
                const list = [];
                const wing = kit.geo(new THREE.PlaneGeometry(0.34, 0.12));
                const m = kit.mat('#3a3f4a', { side: THREE.DoubleSide, rough: 1 });
                for (let i = 0; i < count; i++) {
                    const b = new THREE.Group();
                    const l = kit.add(wing, m, { x: -0.16, parent: b, receive: false });
                    const r = kit.add(wing, m, { x: 0.16, parent: b, receive: false });
                    group.add(b);
                    list.push({ b: b, l: l, r: r, ph: rand() * 6.28, rad: radius * (0.7 + rand() * 0.5), h: cy + rand() * 1.5, sp: 0.25 + rand() * 0.15 });
                }
                return {
                    update: function (dt, t) {
                        list.forEach(o => {
                            const a = o.ph + t * o.sp;
                            o.b.position.set(cx + Math.cos(a) * o.rad, o.h + Math.sin(t * 0.7 + o.ph) * 0.3, cz + Math.sin(a) * o.rad);
                            o.b.rotation.y = -a;
                            const f = Math.sin(t * 9 + o.ph) * 0.6;
                            o.l.rotation.z = f; o.r.rotation.z = -f;
                        });
                    }
                };
            }
        };
        addHelpers(kit, THREE, own, group, rand);
        return kit;
    }

    // --- more kit helpers (used by the worlds after the neighborhood) ----------------------

    function hash2(i, j) {
        let h = (i * 374761393 + j * 668265263) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }
    /** Smooth value noise in [0, 1]. */
    function vnoise(x, z) {
        const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
        const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
        const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, z, oct) {
        let s = 0, a = 0.5, f = 1, n = 0;
        for (let o = 0; o < (oct || 4); o++) { s += vnoise(x * f + o * 17.3, z * f - o * 9.1) * a; n += a; a *= 0.5; f *= 2.03; }
        return s / n;
    }

    function addHelpers(kit, THREE, own, group, rand) {
        const tmpC = new THREE.Color();
        /** Raw geometry makers for kit.merge parts (not registered: merge copies them). */
        const G = {
            box: function (w, h, d) { return new THREE.BoxGeometry(w, h, d); },
            cyl: function (rt, rb, h, n) { return new THREE.CylinderGeometry(rt, rb, h, n || 8); },
            cone: function (r, h, n) { return new THREE.ConeGeometry(r, h, n || 8); },
            ball: function (r, d) { return new THREE.IcosahedronGeometry(r, d === undefined ? 1 : d); },
            sphere: function (r, w, h) { return new THREE.SphereGeometry(r, w || 10, h || 7); },
            torus: function (r, t, a, b) { return new THREE.TorusGeometry(r, t, a || 6, b || 14); },
            /** A flat shape (list of [x, y]) extruded by depth along +y; the shape's y becomes -z. */
            slab: function (pts, depth) {
                const s = new THREE.Shape();
                pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
                const g = new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: false });
                g.rotateX(-Math.PI / 2);
                return g;
            },
            /** A side profile (list of [x, y]) extruded along z, centred (roofs, barns). */
            prism: function (pts, depth) {
                const s = new THREE.Shape();
                pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
                const g = new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: false });
                g.translate(0, 0, -depth / 2);
                return g;
            },
            /** A drooping leaf along +z (palm frond, grass blade). */
            leaf: function (L, W, droop, segs) {
                segs = segs || 5;
                const rows = [], v = [];
                for (let j = 0; j <= segs; j++) {
                    const t = j / segs, z = t * L, y = -droop * t * t, w = W * Math.sin(Math.PI * (0.12 + 0.88 * t));
                    rows.push([[-w, y - w * 0.15, z], [0, y + w * 0.25, z], [w, y - w * 0.15, z]]);
                }
                for (let j = 0; j < segs; j++) {
                    const a = rows[j], b = rows[j + 1];
                    v.push(...a[0], ...a[1], ...b[0], ...a[1], ...b[1], ...b[0], ...a[1], ...a[2], ...b[2], ...a[1], ...b[2], ...b[1]);
                }
                const g = new THREE.BufferGeometry();
                g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
                return g;
            }
        };
        kit.G = G;
        kit.noise = vnoise;
        kit.fbm = fbm;
        kit.hash = hash2;
        /** Smoothstep from a to b. */
        kit.smooth = function (a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        kit.color = function (c) { return new THREE.Color(c); };
        /** Angle a (x = cos a, z = sin a) from the plot centre toward the camera; + PI is straight behind. */
        kit.toCamera = function () { const az = kit.view.az * Math.PI / 180; return Math.atan2(Math.cos(az), Math.sin(az)); };

        /**
         * Merge parts into ONE vertex-coloured, flat-shaded geometry (one draw call).
         * parts: [{ g, c, x, y, z, rx, ry, rz, order, q (Quaternion), s | sx, sy, sz, cf(v, out), uv: [su, sv, ou, ov] }].
         * cf, when given, colours each vertex from its merged position. When any part has
         * `uv`, the result carries UVs (scaled and offset per part; parts without get 0, 0).
         */
        kit.merge = function (parts) {
            let n = 0;
            const flat = parts.map(p => { const g = p.g.index ? p.g.toNonIndexed() : p.g; n += g.attributes.position.count; return g; });
            const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
            const wantUV = parts.some(p => p.uv), uvs = wantUV ? new Float32Array(n * 2) : null;
            const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color();
            let o = 0;
            parts.forEach((p, i) => {
                const a = flat[i].attributes.position, u = p.s === undefined ? 1 : p.s;
                if (p.q) q.copy(p.q); else q.setFromEuler(e.set(p.rx || 0, p.ry || 0, p.rz || 0, p.order || 'XYZ'));
                m.compose(p3.set(p.x || 0, p.y || 0, p.z || 0), q, s3.set(p.sx === undefined ? u : p.sx, p.sy === undefined ? u : p.sy, p.sz === undefined ? u : p.sz));
                c.set(p.c || '#ffffff');
                const ua = p.uv ? flat[i].attributes.uv : null;
                for (let j = 0; j < a.count; j++, o++) {
                    v.fromBufferAttribute(a, j).applyMatrix4(m);
                    pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
                    if (ua) { uvs[o * 2] = ua.getX(j) * p.uv[0] + (p.uv[2] || 0); uvs[o * 2 + 1] = ua.getY(j) * p.uv[1] + (p.uv[3] || 0); }
                    if (p.cf) p.cf(v, c);
                    col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
                }
                if (flat[i] !== p.g) flat[i].dispose();
            });
            const out = own(new THREE.BufferGeometry());
            out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            out.setAttribute('color', new THREE.BufferAttribute(col, 3));
            if (uvs) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            out.computeVertexNormals();
            return out;
        };
        /**
         * kit.free, and also clear of the sight lines from the other cameras that look at
         * the plot (menu orbit and side views, from 36 degrees left to 94 degrees right of
         * the game camera) out to the wide shot's distance. Use it for anything tall.
         */
        kit.freeWide = function (x, z, r, h) {
            if (!kit.free(x, z, r, h)) return false;
            if (h !== undefined && h < 0.35) return true;
            const cx = kit.view.center.x, cz = kit.view.center.z;
            return [-36, 0, 46, 64, 94].every(function (off) {
                const az = (kit.view.az + off) * Math.PI / 180, dx = Math.sin(az), dz = Math.cos(az);
                const along = (x - cx) * dx + (z - cz) * dz, across = Math.abs(-(x - cx) * dz + (z - cz) * dx);
                return !(along > 0 && along < kit.view.dist * 2.7 + 6 && across < kit.plot + 2 + along * 0.5 + (r || 0.5));
            });
        };
        /**
         * A textured standard material (kit.mat would serialise the canvas for its cache key).
         * opts: rough, metal, emissive, emissiveIntensity, emissiveMap, color, transparent, opacity, side, depthWrite.
         */
        kit.tmat = function (map, opts) {
            opts = opts || {};
            return own(new THREE.MeshStandardMaterial({
                map: map, color: new THREE.Color(opts.color || '#ffffff'), roughness: opts.rough === undefined ? 0.85 : opts.rough, metalness: opts.metal || 0,
                emissive: new THREE.Color(opts.emissive || 0), emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity,
                emissiveMap: opts.emissiveMap || null, transparent: !!opts.transparent, opacity: opts.opacity === undefined ? 1 : opts.opacity,
                side: opts.side || THREE.FrontSide, depthWrite: opts.depthWrite !== false, flatShading: !!opts.flat
            }));
        };
        /** The shared material for merged, vertex-coloured props. */
        kit.vmat = function (opts) { return kit.mat('#ffffff', Object.assign({ vertexColors: true, flat: true }, opts || {})); };
        /** Merge parts and add them as one mesh. */
        kit.prop = function (parts, at, matOpts) { return kit.add(kit.merge(parts), kit.vmat(matOpts), at); };
        /** kit.instanced, one draw call per colour (instance colours stay exact). */
        kit.instancedColors = function (geometry, opts, list, at) {
            const by = new Map();
            list.forEach(t => { const key = t.color || '#ffffff'; if (!by.has(key)) by.set(key, []); by.get(key).push(Object.assign({}, t, { color: undefined })); });
            const out = [];
            by.forEach((items, color) => out.push(kit.instanced(geometry, kit.mat(color, opts), items, at)));
            return out;
        };
        /**
         * Instances whose transforms change every frame. fn(item, t, o, i) edits
         * o = { x, y, z, rx, ry, rz, s, sx, sy, sz } (preset from the item). Returns { mesh, update(t) }.
         */
        kit.animInstanced = function (geometry, material, list, fn, at) {
            const im = kit.instanced(geometry, material, list, at);
            im.frustumCulled = false;
            const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), o = {};
            function update(t) {
                list.forEach((it, i) => {
                    o.x = it.x || 0; o.y = it.y || 0; o.z = it.z || 0; o.rx = it.rx || 0; o.ry = it.ry || 0; o.rz = it.rz || 0;
                    o.s = it.s === undefined ? 1 : it.s; o.sx = it.sx; o.sy = it.sy; o.sz = it.sz;
                    fn(it, t, o, i);
                    m.compose(p.set(o.x, o.y, o.z), q.setFromEuler(e.set(o.rx, o.ry, o.rz, 'YXZ')),
                        s.set(o.sx === undefined ? o.s : o.sx, o.sy === undefined ? o.s : o.sy, o.sz === undefined ? o.s : o.sz));
                    im.setMatrixAt(i, m);
                });
                im.instanceMatrix.needsUpdate = true;
            }
            update(0);
            return { mesh: im, update: update };
        };
        /** Up to `count` spots in a ring where kit.free(r, h) allows a prop and test(x, z) agrees. */
        kit.spots = function (count, rMin, rMax, r, h, test, tries) {
            const out = [], cx = kit.view.center.x, cz = kit.view.center.z;
            for (let i = 0; i < (tries || count * 12) && out.length < count; i++) {
                const a = rand() * Math.PI * 2, d = rMin + Math.sqrt(rand()) * (rMax - rMin);
                const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
                if (!kit.free(x, z, r, h)) continue;
                if (test && !test(x, z)) continue;
                if (out.some(p => Math.hypot(p.x - x, p.z - z) < r * 1.6)) continue;
                out.push({ x: x, z: z });
            }
            return out;
        };
        /**
         * A big ground mesh shaped by height(x, z) and coloured by color(x, z, y, out)
         * (set `out`, a THREE.Color, or return a colour). Vertices crowd near the
         * centre (warp > 1) so near ground is fine and far ground is cheap.
         * o: { R, segs, warp, cx, cz, height, color, rough, flat }
         */
        kit.terrain = function (o) {
            const R = o.R || 220, n = o.segs || 96, w = o.warp || 1.7, cx = o.cx || 0, cz = o.cz || 0;
            const g = own(new THREE.PlaneGeometry(2, 2, n, n));
            g.rotateX(-Math.PI / 2);
            const pos = g.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
            for (let i = 0; i < pos.count; i++) {
                const u = pos.getX(i), v = pos.getZ(i);
                const x = cx + Math.sign(u) * Math.pow(Math.abs(u), w) * R, z = cz + Math.sign(v) * Math.pow(Math.abs(v), w) * R;
                const y = o.height ? o.height(x, z) : 0;
                pos.setXYZ(i, x, y, z);
                c.set('#ffffff');
                const r = o.color ? o.color(x, z, y, c) : null;
                if (r) c.set(r);
                cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
            }
            g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
            g.computeVertexNormals();
            g.computeBoundingSphere();
            return kit.add(g, kit.mat('#ffffff', { vertexColors: true, flat: o.flat !== false, rough: o.rough || 0.95 }), { y: o.y || 0 });
        };
        /**
         * A gently heaving low-poly sea. o: { y, R, segs, near, far, fade, amp, animR, tint(x, z, out), rough, cx, cz }.
         * Returns { mesh, update(t) }.
         */
        kit.sea = function (o) {
            o = o || {};
            const R = o.R || 300, n = o.segs || 92, w = 2.1, cx = o.cx || 0, cz = o.cz || 0;
            const g = own(new THREE.PlaneGeometry(2, 2, n, n));
            g.rotateX(-Math.PI / 2);
            const pos = g.attributes.position, arr = pos.array, cols = new Float32Array(pos.count * 3);
            const cN = new THREE.Color(o.near || '#2a86b5'), cF = new THREE.Color(o.far || '#7cbad6'), c = new THREE.Color();
            const animR = o.animR || 40, amp = o.amp === undefined ? 0.12 : o.amp, fade = o.fade || 110;
            const idx = [], ax = [], az = [], aw = [];
            const vx = kit.view.center.x, vz = kit.view.center.z;
            for (let i = 0; i < pos.count; i++) {
                const u = pos.getX(i), v = pos.getZ(i);
                const x = cx + Math.sign(u) * Math.pow(Math.abs(u), w) * R, z = cz + Math.sign(v) * Math.pow(Math.abs(v), w) * R;
                pos.setXYZ(i, x, 0, z);
                const r = Math.hypot(x - vx, z - vz);
                c.copy(cN).lerp(cF, Math.min(1, r / fade));
                if (o.tint) o.tint(x, z, c);
                cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
                const k = 1 - kit.smooth(animR * 0.5, animR, r);
                if (k > 0) { idx.push(i); ax.push(x); az.push(z); aw.push(k * amp); }
            }
            g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
            g.computeBoundingSphere();
            const mesh = kit.add(g, kit.mat('#ffffff', { vertexColors: true, flat: true, rough: o.rough === undefined ? 0.32 : o.rough, metal: 0.05 }), { y: o.y || 0 });
            mesh.receiveShadow = false;
            function update(t) {
                for (let j = 0; j < idx.length; j++) {
                    const x = ax[j], z = az[j];
                    arr[idx[j] * 3 + 1] = aw[j] * (Math.sin(x * 0.42 + t * 0.9) * 0.55 + Math.sin(z * 0.57 - t * 1.1 + x * 0.21) * 0.45 + Math.sin((x - z) * 1.1 + t * 1.7) * 0.2);
                }
                pos.needsUpdate = true;
            }
            update(0);
            return { mesh: mesh, update: update };
        };
        /**
         * Birds (or butterflies) on lazy circles, two instanced draw calls for the
         * whole flock. o: { cx, cy, cz, count, radius, color, size, speed, spread,
         * bob, flap, shape: 'bird' | 'butterfly', spots: [[x, y, z]], squash }. Returns { update(dt, t) }.
         */
        kit.flock = function (o) {
            const n = o.count || 5, but = o.shape === 'butterfly';
            const v = but ? [0, 0, 0.03, -0.17, 0, 0.17, -0.21, 0, -0.02, 0, 0, 0.03, -0.21, 0, -0.02, -0.13, 0, -0.15]
                : [0, 0, 0.09, -0.42, 0, -0.07, 0, 0, -0.07, 0, 0, 0.09, -0.2, 0, 0.02, -0.42, 0, -0.07];
            const gl = own(new THREE.BufferGeometry());
            gl.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
            gl.computeVertexNormals();
            const gr = own(gl.clone());
            gr.scale(-1, 1, 1);
            const mat = kit.mat(o.color || '#3a3f4a', { side: THREE.DoubleSide, rough: 1 });
            const L = new THREE.InstancedMesh(gl, mat, n), R = new THREE.InstancedMesh(gr, mat, n);
            [L, R].forEach(m => { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; group.add(m); });
            const list = [];
            for (let i = 0; i < n; i++) {
                const sp = o.spots ? o.spots[i % o.spots.length] : [o.cx || 0, o.cy || 8, o.cz || 0];
                list.push({ sp: sp, ph: rand() * 6.28, rad: (o.radius || 6) * (0.65 + rand() * 0.55), h: sp[1] + rand() * (o.spread === undefined ? 1.5 : o.spread),
                    v: (o.speed || 0.28) * (0.8 + rand() * 0.4) * (but && rand() < 0.5 ? -1 : 1) });
            }
            const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
            const size = o.size || 1, flapRate = o.flap || (but ? 16 : 7), bob = o.bob === undefined ? (but ? 0.35 : 0.3) : o.bob, sq = o.squash || 1;
            function update(dt, t) {
                list.forEach((b, i) => {
                    const a = b.ph + t * b.v;
                    p.set(b.sp[0] + Math.cos(a) * b.rad, b.h + Math.sin(t * (but ? 2.1 : 0.7) + b.ph) * bob, b.sp[2] + Math.sin(a) * b.rad * sq);
                    const ry = b.v > 0 ? -a : Math.PI - a;
                    // Birds glide now and then; butterflies never stop.
                    const glide = but ? 1 : 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.5 + b.ph * 3));
                    const f = (but ? 0.2 + Math.sin(t * flapRate + b.ph) * 0.9 : 0.12 + Math.sin(t * flapRate + b.ph) * 0.55 * glide);
                    s.set(size, size, size);
                    m.compose(p, q.setFromEuler(e.set(0, ry, -f, 'YZX')), s); L.setMatrixAt(i, m);
                    m.compose(p, q.setFromEuler(e.set(0, ry, f, 'YZX')), s); R.setMatrixAt(i, m);
                });
                L.instanceMatrix.needsUpdate = true; R.instanceMatrix.needsUpdate = true;
            }
            update(0, 0);
            return { update: update };
        };
        let puffGeo = null;
        /** One puffy cloud as a single mesh (move it in update). tint: cloud colour. */
        kit.puff = function (x, y, z, s, tint, glow) {
            if (!puffGeo) {
                puffGeo = kit.merge([[0, 0, 0, 1.3], [1.3, -0.2, 0.1, 1], [-1.3, -0.25, 0, 0.95], [0.5, 0.55, -0.1, 0.9], [-0.6, 0.4, 0.2, 0.8], [2.1, -0.45, 0, 0.6]]
                    .map(b => ({ g: G.ball(1, 1), x: b[0], y: b[1], z: b[2], s: b[3] })));
            }
            return kit.add(puffGeo, kit.mat(tint || '#ffffff', { rough: 1, flat: true, emissive: glow || '#dfe9f5', emissiveIntensity: 0.35 }),
                { x: x, y: y, z: z, s: s || 1, sy: (s || 1) * 0.8, receive: false });
        };
        /** Clouds spread over an arc of the sky; returns { update(dt) } that drifts them along x. */
        kit.cloudBank = function (count, o) {
            o = o || {};
            const list = [];
            for (let i = 0; i < count; i++) {
                const x = kit.range(-(o.w || 90), o.w || 90), z = kit.range(o.z0 === undefined ? -130 : o.z0, o.z1 === undefined ? -55 : o.z1);
                list.push({ c: kit.puff(x, kit.range(o.y0 || 16, o.y1 || 26), z, kit.range(o.s0 || 2, o.s1 || 3.4), o.tint, o.glow), v: kit.range(0.2, 0.5) * (o.speed || 1) });
            }
            const W = (o.w || 90) + 20;
            return { update: function (dt) { list.forEach(c => { c.c.position.x += c.v * dt; if (c.c.position.x > W) c.c.position.x = -W; }); } };
        };
        // --- reusable prop geometries ------------------------------------------------------------
        /** A round cartoon tree (one geometry, instance it). */
        kit.treeGeo = function (leaf, trunk) {
            return kit.merge([
                { g: G.cyl(0.16, 0.22, 1.2, 6), y: 0.6, c: trunk || '#8a5a33' },
                { g: G.ball(0.9, 1), y: 1.75, c: leaf || '#4caf50' },
                { g: G.ball(0.9, 1), x: 0.45, y: 1.45, z: 0.2, s: 0.62, c: leaf || '#4caf50' },
                { g: G.ball(0.9, 1), x: -0.4, y: 1.5, z: -0.15, s: 0.66, c: leaf || '#4caf50' }
            ]);
        };
        /** A pointy pine (one geometry). */
        kit.pineGeo = function (leaf, snow) {
            const parts = [{ g: G.cyl(0.12, 0.16, 0.8, 6), y: 0.4, c: '#7a4f2c' }];
            [[1.0, 1.4, 0.9], [0.8, 1.2, 1.6], [0.55, 1.0, 2.25]].forEach((l, i) => {
                parts.push({ g: G.cone(l[0], l[1], 7), y: l[2], c: leaf || '#2f7d4a' });
                if (snow) parts.push({ g: G.cone(l[0] * 0.55, l[1] * 0.45, 7), y: l[2] + l[1] * 0.3, c: snow });
            });
            return kit.merge(parts);
        };
        /** A palm: ringed curving trunk, coconuts, drooping fronds. lean > 0 bends toward +x. */
        kit.palmGeo = function (lean, height) {
            const H = height || 4.6, parts = [], N = 6, up = new THREE.Vector3(0, 1, 0);
            const at = t => new THREE.Vector3(lean * t * t * H, t * H, 0);
            for (let i = 0; i < N; i++) {
                const a = at(i / N), b = at((i + 1) / N), d = b.clone().sub(a), L = d.length();
                const mid = a.clone().add(b).multiplyScalar(0.5);
                parts.push({ g: G.cyl(0.16 - i * 0.012, 0.2 - i * 0.012, L * 1.04, 7), x: mid.x, y: mid.y, z: mid.z,
                    q: new THREE.Quaternion().setFromUnitVectors(up, d.normalize()), c: i % 2 ? '#8e6b45' : '#a8835a' });
            }
            const top = at(1);
            [[0.16, 0.05, 0.1], [-0.12, 0.02, 0.13], [0.02, -0.04, -0.16]].forEach(c => parts.push({ g: G.ball(0.15, 0), x: top.x + c[0], y: top.y - 0.12 + c[1], z: top.z + c[2], c: '#6b4a2a' }));
            for (let i = 0; i < 8; i++) {
                parts.push({ g: G.leaf(2.3 + (i % 3) * 0.25, 0.32, 1.25, 6), x: top.x, y: top.y + 0.05, z: top.z,
                    rx: -0.55 + (i % 2) * 0.3, ry: i * Math.PI * 2 / 8 + 0.2, order: 'YXZ', c: i % 2 ? '#3f9a3c' : '#5cb349' });
            }
            return kit.merge(parts);
        };
        /** A lumpy rock (white vertex colour: tint it with the material). */
        kit.rockGeo = function (detail, jitter, seed) {
            const g = new THREE.IcosahedronGeometry(1, detail || 0);
            const p = g.attributes.position, j = jitter === undefined ? 0.28 : jitter, s = seed || 1;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
                const k = 1 + (hash2(Math.round(x * 50) + s * 31, Math.round(y * 50) * 7 + Math.round(z * 50) * 13) - 0.5) * 2 * j;
                p.setXYZ(i, x * k, y * k * 0.8, z * k);
            }
            return kit.merge([{ g: g }]);
        };
        /** A little house (one geometry, for distant villages). */
        kit.houseGeo = function (wall, roof) {
            const r = G.cyl(0.01, 1.45, 1.1, 4, 1);
            r.rotateY(Math.PI / 4);
            return kit.merge([
                { g: G.box(2, 1.5, 1.7), y: 0.75, c: wall || '#f3e2c0' },
                { g: r, y: 2.05, sx: 1.06, sz: 0.92, c: roof || '#c8553d' },
                { g: G.box(0.4, 0.4, 0.05), x: -0.5, y: 0.95, z: 0.86, c: '#3c5a80' },
                { g: G.box(0.4, 0.4, 0.05), x: 0.5, y: 0.95, z: 0.86, c: '#3c5a80' },
                { g: G.box(0.42, 0.75, 0.05), y: 0.38, z: 0.86, c: '#7b4a2a' }
            ]);
        };
        /** A glowing soft disc texture (nebulae, lamp halos). */
        kit.glowTexture = function (inner, outer) {
            return kit.canvasTexture(64, 64, function (c, w, h) {
                const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
                g.addColorStop(0, inner || 'rgba(255,255,255,1)');
                g.addColorStop(1, outer || 'rgba(255,255,255,0)');
                c.fillStyle = g;
                c.fillRect(0, 0, w, h);
            });
        };
        /** Points of light on a sphere (stars). o: { count, radius, size, colors, minY } */
        kit.stars = function (o) {
            const n = o.count || 800, R = o.radius || 300, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
            const cs = (o.colors || ['#ffffff']).map(c => new THREE.Color(c));
            for (let i = 0; i < n; i++) {
                let y = rand() * 2 - 1;
                if (o.minY !== undefined) y = o.minY + rand() * (1 - o.minY);
                const a = rand() * Math.PI * 2, r = Math.sqrt(1 - y * y);
                pos[i * 3] = Math.cos(a) * r * R; pos[i * 3 + 1] = y * R; pos[i * 3 + 2] = Math.sin(a) * r * R;
                const c = cs[Math.floor(rand() * cs.length)], b = 0.55 + rand() * 0.45;
                col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
            }
            const g = own(new THREE.BufferGeometry());
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            const m = own(new THREE.PointsMaterial({ size: o.size || 1.5, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: o.opacity || 1, depthWrite: false }));
            const pts = new THREE.Points(g, m);
            pts.frustumCulled = false;
            pts.renderOrder = -9;
            group.add(pts);
            return pts;
        };
    }

    /**
     * Build a world instance: { group, sky, fog, light, dust, ground, water,
     * zeroG, gravity, camera, update(dt, t), dispose() }.
     */
    function create(id, o) {
        const THREE = o.THREE;
        const def = REG[id] || REG.neighborhood;
        const group = new THREE.Group();
        group.name = 'world:' + def.id;
        const owned = [];
        const kit = makeKit(THREE, o, group, owned);
        let res = {};
        try { res = def.build(kit) || {}; } catch (e) { console.warn('[BNB] world ' + id + ' failed to build', e); }
        return {
            id: def.id, name: def.name, group: group,
            sky: def.sky || ['#3d8fe0', '#8cc8f2', '#e6f4fb'],
            fog: def.fog || null,
            light: def.light || {},
            dust: def.dust,
            ground: def.ground || 'plane',
            water: def.water === undefined ? null : def.water,
            zeroG: !!def.zeroG,
            gravity: def.gravity,
            camera: def.camera,
            noSky: !!def.noSky,
            update: res.update || null,
            dispose: function () {
                owned.forEach(x => { try { x.dispose(); } catch (e) { /* ignore */ } });
                group.traverse(m => { if (m.isInstancedMesh) m.dispose(); });
            }
        };
    }

    return { register: register, info: info, create: create, list: function () { return Object.keys(REG); } };
})();

// =====================================================================================
// Neighborhood - Tiny House. A sunny little street, houses and trees in the distance.
// =====================================================================================
BNB.Worlds.register('neighborhood', {
    name: 'Neighborhood',
    sky: ['#3f8fe2', '#8fcaf3', '#e8f5fb'],
    fog: { color: '#d9eef8', near: 26, far: 80 },
    light: { sky: '#e4f2ff', ground: '#7d9a5a', hemi: 1.25, sun: '#fff1d6', sunIntensity: 2.7, dir: [-0.5, 1, 0.55] },
    dust: '#cdb998',
    build: function (k) {
        const T = k.THREE;
        k.groundDisc('#7cc25a', 160, { vary: 0.05 });
        k.plotPatch('#c9a978', { rim: '#b28f5e', extra: 0.5 });

        // A road across the back, with a dashed centre line and pavements.
        const roadZ = -k.plot - 6;
        k.add(k.geo(new T.BoxGeometry(140, 0.04, 4.2)), k.mat('#5d6168', { rough: 0.9 }), { y: 0.02, z: roadZ });
        k.add(k.geo(new T.BoxGeometry(140, 0.08, 1.1)), k.mat('#c9c5bc'), { y: 0.04, z: roadZ + 2.65 });
        k.add(k.geo(new T.BoxGeometry(140, 0.08, 1.1)), k.mat('#c9c5bc'), { y: 0.04, z: roadZ - 2.65 });
        const dashes = [];
        for (let x = -60; x <= 60; x += 3) dashes.push({ x: x, y: 0.045, z: roadZ });
        k.instanced(k.geo(new T.BoxGeometry(1.4, 0.02, 0.16)), k.mat('#f4f0e2'), dashes);

        // Houses across the road and further back.
        const walls = ['#f3e2c0', '#e9b8a6', '#bfe0e8', '#f6d78b', '#d8e8c2', '#f1c6d8'];
        const roofs = ['#c8553d', '#4f6d9a', '#7a4b8c', '#d0812e', '#3f8a63'];
        for (let i = 0; i < 9 * k.detail + 3; i++) {
            const x = -26 + i * 6.2 + k.range(-1, 1), z = roadZ - 6 - k.range(0, 2);
            if (!k.free(x, z, 1.5)) continue;
            k.house(x, z, k.range(-0.15, 0.15), k.range(1.1, 1.45), k.pick(walls), k.pick(roofs));
        }
        for (let i = 0; i < 8 * k.detail + 2; i++) {
            const x = -34 + i * 9 + k.range(-2, 2), z = roadZ - 17 - k.range(0, 6);
            k.house(x, z, k.range(-0.3, 0.3), k.range(1.2, 1.6), k.pick(walls), k.pick(roofs));
        }

        // Picket fence along the near side of the road.
        const pickets = [];
        for (let x = -30; x <= 30; x += 0.45) {
            if (Math.abs(x) < 1.2) continue;
            pickets.push({ x: x, y: 0.4, z: roadZ + 3.6 });
        }
        k.instanced(k.geo(new T.BoxGeometry(0.14, 0.8, 0.06)), k.mat('#fbfaf5'), pickets, { cast: true });
        k.add(k.geo(new T.BoxGeometry(60, 0.08, 0.05)), k.mat('#fbfaf5'), { y: 0.55, z: roadZ + 3.57 });

        // Trees and bushes around, never in front of the camera or on the plot.
        let placedTrees = 0;
        for (let tries = 0; tries < 200 && placedTrees < 26 * k.detail + 6; tries++) {
            const a = k.range(0, Math.PI * 2), r = k.range(k.plot + 3, 30);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            if (!k.free(x, z, 1.2, 3)) continue;
            if (Math.abs(z - roadZ) < 4.5) continue;
            k.tree(x, z, k.range(0.9, 1.5));
            placedTrees++;
        }
        const bush = k.geo(new T.IcosahedronGeometry(0.5, 1));
        const bushes = [];
        for (let tries = 0; tries < 160 && bushes.length < 30; tries++) {
            const a = k.range(0, Math.PI * 2), r = k.range(k.plot + 1.2, 16);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            if (!k.free(x, z, 0.5, 0.6) || Math.abs(z - roadZ) < 3.6) continue;
            bushes.push({ x: x, y: 0.25, z: z, s: k.range(0.6, 1.1), sy: k.range(0.5, 0.8) });
        }
        k.instanced(bush, k.mat('#4a9e45', { flat: true }), bushes, { cast: true });

        // Flowers dotted in the grass near the plot (low, so they may sit near the camera).
        const flower = k.geo(new T.IcosahedronGeometry(0.09, 0));
        const flowers = [];
        const fc = ['#ffffff', '#ffd23f', '#ff7aa8', '#b78cff'];
        for (let i = 0; i < 140 * k.detail; i++) {
            const a = k.range(0, Math.PI * 2), r = k.range(k.plot + 1, 13);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            if (!k.free(x, z, 0.1, 0.1)) continue;
            flowers.push({ x: x, y: 0.09, z: z, color: k.pick(fc) });
        }
        k.instanced(flower, k.mat('#ffffff', { rough: 0.8 }), flowers);

        // Clouds drifting slowly, birds circling high over the houses.
        const clouds = [];
        for (let i = 0; i < 7; i++) {
            clouds.push({ c: k.cloud(k.range(-50, 50), k.range(14, 22), k.range(-70, -35), k.range(1.6, 2.8)), v: k.range(0.25, 0.6) });
        }
        const flock = k.birds(4, 9, roadZ - 12, 5, 7);
        return {
            update: function (dt, t) {
                clouds.forEach(o => { o.c.position.x += o.v * dt; if (o.c.position.x > 60) o.c.position.x = -60; });
                flock.update(dt, t);
            }
        };
    }
});

// =====================================================================================
// Launch Barge - Rocket Ship. A drone-ship deck out on the open sea: blocks knocked
// over the side splash into the water.
// =====================================================================================
BNB.Worlds.register('barge', {
    name: 'Launch Barge',
    sky: ['#2b7bd5', '#86c3ef', '#e2f0f6'],
    fog: { color: '#e2f0f6', near: 34, far: 170 },
    light: { sky: '#e3f1ff', ground: '#4a86a2', hemi: 1.2, sun: '#fff0d6', sunIntensity: 2.7, dir: [-0.45, 1, 0.55] },
    dust: '#d5dade',
    ground: [{ half: [8.6, 0.5, 5.6], pos: [0, -0.5, 0] }],
    water: -0.7,
    build: function (k) {
        const T = k.THREE, G = k.G, P = k.plot;
        const HX = 8.6, HZ = 5.6, SEA = -0.7;
        const sea = k.sea({ y: SEA, near: '#2581b3', far: '#80bdd8', amp: 0.14, animR: 44, fade: 120 });

        // The hull: dark steel, a red boot-top at the waterline, a white sheer line.
        k.prop([
            { g: G.box(HX * 2, 2.4, HZ * 2), y: -1.24, c: '#33435a' },
            { g: G.box(HX * 2 + 0.05, 0.34, HZ * 2 + 0.05), y: SEA + 0.03, c: '#c0452f' },
            { g: G.box(HX * 2 + 0.08, 0.14, HZ * 2 + 0.08), y: -0.13, c: '#e4e7ea' }
        ]);
        // Steel deck plates.
        const plates = k.canvasTexture(128, 128, function (c, w, h) {
            c.fillStyle = '#88919b'; c.fillRect(0, 0, w, h);
            c.fillStyle = '#929ba5'; c.fillRect(0, 0, 64, 64); c.fillRect(64, 64, 64, 64);
            c.fillStyle = '#6a737d'; c.fillRect(0, 0, w, 2); c.fillRect(0, 0, 2, h); c.fillRect(0, 63, w, 2); c.fillRect(63, 0, 2, h);
        }, [HX * 2 / 4, HZ * 2 / 4]);
        k.add(k.geo(new T.BoxGeometry(HX * 2, 0.04, HZ * 2)), k.tmat(plates, { rough: 0.75, metal: 0.15 }), { y: -0.02 });
        // Yellow-and-black hazard stripes round the deck edge.
        const hazard = function (rx, ry) {
            return k.canvasTexture(64, 64, function (c, w, h) {
                c.fillStyle = '#f2c230'; c.fillRect(0, 0, w, h);
                c.fillStyle = '#2d2d2f';
                for (let i = -3; i < 3; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32 + 16, 0); c.lineTo(i * 32 + 80, h); c.lineTo(i * 32 + 64, h); c.closePath(); c.fill(); }
            }, [rx, ry]);
        };
        const SW = 0.44;
        const hzX = k.tmat(hazard(HX * 2 / 0.88, 1), { rough: 0.8 });
        const hzZ = k.tmat(hazard(1, (HZ * 2 - SW * 2) / 0.88), { rough: 0.8 });
        const stX = k.geo(new T.BoxGeometry(HX * 2, 0.012, SW)), stZ = k.geo(new T.BoxGeometry(SW, 0.012, HZ * 2 - SW * 2));
        k.add(stX, hzX, { y: 0.006, z: HZ - SW / 2 }); k.add(stX, hzX, { y: 0.006, z: -HZ + SW / 2 });
        k.add(stZ, hzZ, { y: 0.006, x: HX - SW / 2 }); k.add(stZ, hzZ, { y: 0.006, x: -HX + SW / 2 });

        // The landing mark: dark pad, yellow rim, a white ring and four ticks.
        k.plotPatch('#4b5562', { rim: '#f2c230', extra: 0.2, rimWidth: 0.26 });
        const cx = k.view.center.x, cz = k.view.center.z;
        const white = k.mat('#f4f4f0', { rough: 0.8 });
        const ringG = k.geo(new T.RingGeometry(P * 0.66, P * 0.66 + 0.14, 48));
        ringG.rotateX(-Math.PI / 2);
        k.add(ringG, white, { x: cx, y: 0.009, z: cz });
        const tick = k.geo(new T.BoxGeometry(0.16, 0.006, P * 0.3));
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + Math.PI / 4, r = P * 0.81 + 0.19;
            k.add(tick, white, { x: cx + Math.sin(a) * r, y: 0.009, z: cz + Math.cos(a) * r, ry: a });
        }

        // Yellow safety railings along the back and the back half of the sides, with lifebuoys.
        const posts = [];
        for (let x = -HX + 0.25; x <= HX - 0.2; x += 1.15) posts.push({ x: x, y: 0.4, z: -HZ + 0.12 });
        for (let z = -HZ + 1.3; z <= 0.5; z += 1.15) { posts.push({ x: -HX + 0.12, y: 0.4, z: z }); posts.push({ x: HX - 0.12, y: 0.4, z: z }); }
        k.instanced(k.geo(new T.CylinderGeometry(0.045, 0.045, 0.8, 6)), k.mat('#f0bf2c', { rough: 0.6, metal: 0.2 }), posts, { cast: true });
        const rl = HZ + 0.5;
        const railParts = [];
        [0.42, 0.78].forEach(y => {
            railParts.push({ g: G.box(HX * 2 - 0.3, 0.06, 0.06), y: y, z: -HZ + 0.12, c: '#f0bf2c' });
            railParts.push({ g: G.box(0.06, 0.06, rl), x: -HX + 0.12, y: y, z: -HZ + rl / 2, c: '#f0bf2c' });
            railParts.push({ g: G.box(0.06, 0.06, rl), x: HX - 0.12, y: y, z: -HZ + rl / 2, c: '#f0bf2c' });
        });
        [-4.6, 3.9].forEach(x => {
            railParts.push({ g: G.torus(0.24, 0.07, 6, 14), x: x, y: 0.52, z: -HZ + 0.2, c: '#f26b2a' });
            [0, 1, 2, 3].forEach(i => railParts.push({ g: G.box(0.1, 0.17, 0.17), x: x + Math.cos(i * Math.PI / 2 + 0.78) * 0.24, y: 0.52 + Math.sin(i * Math.PI / 2 + 0.78) * 0.24, z: -HZ + 0.2, rz: i * Math.PI / 2 + 0.78, c: '#f4f4f0' }));
        });
        k.prop(railParts, { cast: true });
        // Mooring bollards along the front edge (low: they may sit in front of the camera).
        const bollard = k.merge([{ g: G.cyl(0.15, 0.18, 0.22, 8), y: 0.11, c: '#2f3640' }, { g: G.cyl(0.21, 0.21, 0.06, 8), y: 0.25, c: '#2f3640' }]);
        k.instanced(bollard, k.vmat(), [-6.6, -2.8, 2.8, 6.6].map(x => ({ x: x, z: HZ - 0.75 })), { cast: true });

        // A control cabin with a turning radar on the back-right corner.
        k.prop([
            { g: G.box(2.4, 1.7, 2.0), y: 0.85, c: '#eef1f3' },
            { g: G.box(2.46, 0.42, 2.06), y: 1.22, c: '#2d4a66' },
            { g: G.box(2.6, 0.12, 2.2), y: 1.76, c: '#9aa3ad' },
            { g: G.box(0.5, 0.95, 0.06), x: -0.6, y: 0.48, z: 1.02, c: '#5d6773' },
            { g: G.cyl(0.04, 0.04, 1.6, 5), x: 0.8, y: 2.6, z: -0.6, c: '#c9ced4' },
            { g: G.box(0.7, 0.05, 0.05), x: 0.8, y: 3.0, z: -0.6, c: '#c9ced4' },
            { g: G.ball(0.08, 0), x: 0.8, y: 3.42, z: -0.6, c: '#ff5a4a' }
        ], { x: 6.4, z: -3.7, cast: true });
        const radar = k.prop([
            { g: G.cyl(0.12, 0.16, 0.3, 8), y: 0.15, c: '#9aa3ad' },
            { g: G.box(1.2, 0.1, 0.22), y: 0.36, c: '#e9edf0' }
        ], { x: 5.9, y: 1.82, z: -3.4, cast: true });
        // Two white fuel tanks on cradles, back-left.
        const tankParts = [];
        [-0.62, 0.62].forEach(z => {
            tankParts.push({ g: G.cyl(0.55, 0.55, 2.8, 12), rz: Math.PI / 2, y: 0.85, z: z, c: '#f2f4f5' });
            tankParts.push({ g: G.cyl(0.565, 0.565, 0.32, 12), rz: Math.PI / 2, y: 0.85, z: z, c: '#2f6fd0' });
            [-1.4, 1.4].forEach(x => tankParts.push({ g: G.sphere(0.55, 10, 6), sx: 0.45, x: x, y: 0.85, z: z, c: '#f2f4f5' }));
        });
        [-0.9, 0.9].forEach(x => tankParts.push({ g: G.box(0.3, 0.42, 2.6), x: x, y: 0.21, c: '#4a535e' }));
        k.prop(tankParts, { x: -6.3, z: -3.8, cast: true });

        // A support ship standing by, and a little tug further off.
        const shipGeo = k.merge([
            { g: G.slab([[-7, -1.8], [4.2, -1.8], [7.2, 0], [4.2, 1.8], [-7, 1.8]], 1.3), y: -1.1, c: '#c0452f' },
            { g: G.slab([[-7, -1.85], [4.25, -1.85], [7.3, 0], [4.25, 1.85], [-7, 1.85]], 1.2), y: 0.2, c: '#2c4f86' },
            { g: G.box(3.6, 2.0, 3.2), x: 1.6, y: 2.4, c: '#f1f3f5' },
            { g: G.box(3.66, 0.5, 3.26), x: 1.6, y: 2.95, c: '#26384d' },
            { g: G.box(2.6, 0.9, 2.6), x: 1.9, y: 3.85, c: '#f1f3f5' },
            { g: G.cyl(0.45, 0.5, 1.6, 10), x: -1.2, y: 2.9, c: '#e2453c' },
            { g: G.cyl(0.47, 0.47, 0.3, 10), x: -1.2, y: 3.75, c: '#2b2b2b' },
            { g: G.cyl(0.06, 0.06, 3.2, 5), x: 2.4, y: 5.6, c: '#dfe3e6' },
            { g: G.box(1.2, 0.06, 0.06), x: 2.4, y: 6.4, c: '#dfe3e6' },
            { g: G.box(0.25, 2.6, 0.25), x: -5.6, y: 2.6, z: 1.2, rz: 0.25, c: '#f28c28' },
            { g: G.box(0.25, 2.6, 0.25), x: -5.6, y: 2.6, z: -1.2, rz: 0.25, c: '#f28c28' },
            { g: G.box(0.25, 0.25, 2.6), x: -5.3, y: 3.85, c: '#f28c28' }
        ]);
        const ship = k.add(shipGeo, k.vmat(), { x: 26, y: SEA, z: -34, ry: Math.PI + 0.35 });
        const tug = k.add(shipGeo, k.vmat(), { x: -40, y: SEA, z: -62, ry: 0.5, s: 0.6 });

        // Buoys bobbing about, red and green.
        const buoy = function (c) {
            return k.merge([
                { g: G.cyl(0.36, 0.44, 0.55, 10), y: 0.15, c: c },
                { g: G.cyl(0.46, 0.46, 0.12, 10), y: 0.38, c: '#f4f4f0' },
                { g: G.cyl(0.08, 0.3, 0.9, 6), y: 0.88, c: c },
                { g: G.ball(0.12, 0), y: 1.4, c: '#ffe27a' }
            ]);
        };
        const bs = k.spots(Math.round(6 * k.detail) + 2, 13, 34, 0.7, 1.5, (x, z) => Math.abs(x) > HX + 3 || Math.abs(z) > HZ + 3);
        const bob = function (it, t, o) { o.y = SEA + Math.sin(t * 1.1 + it.ph) * 0.08; o.rz = Math.sin(t * 0.9 + it.ph) * 0.09; o.rx = Math.cos(t * 0.8 + it.ph * 2) * 0.07; };
        const buoysR = k.animInstanced(buoy('#d9432f'), k.vmat(), bs.filter((p, i) => i % 2 === 0).map(p => ({ x: p.x, z: p.z, ph: k.range(0, 6) })), bob);
        const buoysG = k.animInstanced(buoy('#2f9a55'), k.vmat(), bs.filter((p, i) => i % 2 === 1).map(p => ({ x: p.x, z: p.z, ph: k.range(0, 6) })), bob);

        // A hazy coastline far away, with a lighthouse.
        const coast = [];
        for (let i = 0; i < 15; i++) {
            coast.push({ g: G.ball(1, 1), x: -230 + i * 33 + k.range(-8, 8), y: SEA - 1, z: -122 - k.range(0, 22), sx: k.range(22, 40), sy: k.range(5, 14), sz: 16, c: k.pick(['#6c977f', '#628c74', '#78a487']) });
        }
        coast.push({ g: G.cyl(0.9, 1.3, 9, 10), x: 52, y: SEA + 9, z: -116, c: '#f4f4f0' });
        coast.push({ g: G.cyl(1.0, 1.15, 1.5, 10), x: 52, y: SEA + 9.5, z: -116, c: '#d9432f' });
        coast.push({ g: G.cyl(1.0, 1.2, 1.5, 10), x: 52, y: SEA + 6.5, z: -116, c: '#d9432f' });
        coast.push({ g: G.cone(1.1, 1.2, 10), x: 52, y: SEA + 14.3, z: -116, c: '#d9432f' });
        coast.push({ g: G.cyl(0.7, 0.7, 0.9, 10), x: 52, y: SEA + 13.3, z: -116, c: '#fff1b0' });
        k.prop(coast, { receive: false });

        // Two dolphins leaping now and then off the port bow.
        const dolphin = k.merge([
            { g: G.ball(1, 1), sx: 0.42, sy: 0.42, sz: 1.3, c: '#6f8fa8' }, { g: G.ball(1, 1), y: -0.12, sx: 0.32, sy: 0.3, sz: 1.0, c: '#dfe7ee' },
            { g: G.cone(0.16, 0.6, 6), z: 1.5, rx: Math.PI / 2, c: '#6f8fa8' }, { g: G.box(0.06, 0.55, 0.45), y: 0.5, z: -0.1, rx: -0.6, c: '#5f7f98' },
            { g: G.box(0.9, 0.06, 0.32), z: -1.35, c: '#5f7f98' }
        ]);
        const pod = k.animInstanced(dolphin, k.vmat(), [{ off: 0, lane: 0 }, { off: 0.7, lane: 1.4 }], (it, t, o) => {
            const u = ((t + it.off) % 11) / 11, s = Math.min(1, u / 0.22);
            o.ry = Math.PI / 2; o.s = 0.85;
            o.x = -10 + s * 7; o.z = -25 + it.lane; o.y = u < 0.22 ? SEA - 0.9 + Math.sin(s * Math.PI) * 2.4 : SEA - 4;
            o.rx = -Math.cos(s * Math.PI) * 0.9;
        });
        const clouds = k.cloudBank(7, { z0: -150, z1: -70, y0: 18, y1: 30, s0: 2.6, s1: 4.2 });
        const gulls = k.flock({ cx: 2, cy: 7.5, cz: -7, count: Math.round(4 * k.detail) + 2, radius: 10, color: '#f7f7f4', speed: 0.22 });

        return {
            update: function (dt, t) {
                sea.update(t);
                ship.position.y = SEA + Math.sin(t * 0.62) * 0.06; ship.rotation.z = Math.sin(t * 0.5) * 0.015; ship.rotation.x = Math.sin(t * 0.43) * 0.01;
                tug.position.y = SEA + Math.sin(t * 0.8 + 1) * 0.05; tug.rotation.z = Math.sin(t * 0.7 + 2) * 0.02;
                buoysR.update(t); buoysG.update(t);
                radar.rotation.y = t * 0.8;
                pod.update(t);
                clouds.update(dt);
                gulls.update(dt, t);
            }
        };
    }
});

// =====================================================================================
// Grassy Hill - Tree. A flowery hilltop meadow with a wooden fence; the land falls
// away to patchwork fields and far hills.
// =====================================================================================
BNB.Worlds.register('hill', {
    name: 'Grassy Hill',
    sky: ['#3f8ee0', '#99cdf1', '#eef6ee'],
    fog: { color: '#eef6ee', near: 48, far: 300 },
    light: { sky: '#e6f3ff', ground: '#7aa05a', hemi: 1.25, sun: '#fff2d8', sunIntensity: 2.7, dir: [-0.5, 1, 0.5] },
    dust: '#b9a07a',
    build: function (k) {
        const T = k.THREE, G = k.G, P = k.plot;
        const F = P + 10.5;   // the flat hilltop
        const rimAt = a => F + 1 + 3.5 * k.noise(Math.cos(a) * 1.6 + 4, Math.sin(a) * 1.6 + 4);
        function hh(x, z) {
            const r = Math.hypot(x, z), rim = rimAt(Math.atan2(z, x));
            if (r <= rim) return 0;
            const fall = k.smooth(rim, rim + 30, r);
            let h = -19 * fall + fall * (k.fbm(x * 0.035, z * 0.035, 3) - 0.5) * 7;
            h += k.smooth(70, 165, r) * (8 + 28 * k.fbm(x * 0.011 + 3, z * 0.011 - 2, 4));
            return h;
        }
        const cTop = new T.Color('#79c158'), cTop2 = new T.Color('#92d064'), cSlope = new T.Color('#62a64a'), hedge = new T.Color('#4a8a3c'), tmp = new T.Color();
        const fields = ['#9ccc5e', '#77b553', '#dcc76c', '#a9c65c', '#5d9d48', '#c9ad6c', '#86c06a', '#b2d36e'].map(c => new T.Color(c));
        k.terrain({
            R: 240, segs: 104, warp: 1.75, height: hh, color: function (x, z, y, out) {
                out.copy(cTop).lerp(cTop2, k.noise(x * 0.22, z * 0.22) * 0.85);
                if (y < -0.1) {
                    const a = 0.35, u = (x * Math.cos(a) - z * Math.sin(a)) / 17, v = (x * Math.sin(a) + z * Math.cos(a)) / 13;
                    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
                    tmp.copy(fields[Math.floor(k.hash(i, j) * fields.length)]).lerp(hedge, 1 - k.smooth(0, 0.09, Math.min(fu, 1 - fu, fv, 1 - fv)));
                    out.lerp(cSlope, k.smooth(-0.1, -3, y)).lerp(tmp, k.smooth(-4, -12, y) * 0.9 + k.smooth(-14, 0, y) * k.smooth(90, 140, Math.hypot(x, z)) * 0.9);
                }
            }
        });
        k.plotPatch('#ab8b5f', { rim: '#8f744d', extra: 0.4, rimWidth: 0.3 });

        // A post-and-rail fence round the back of the hilltop, open straight behind the plot.
        const back = k.toCamera() + Math.PI, fr = F - 1.4;
        const posts = [], rails = [];
        let prev = null;
        for (let a = back - 1.3; a <= back + 1.3 + 1e-6; a += 1.75 / fr) {
            const x = Math.cos(a) * fr, z = Math.sin(a) * fr;
            if (Math.abs(a - back) < 0.12) { prev = null; continue; }
            posts.push({ x: x, y: 0.5, z: z, ry: -a + k.range(-0.1, 0.1), rz: k.range(-0.04, 0.04) });
            if (prev) {
                const L = Math.hypot(x - prev.x, z - prev.z), ang = Math.atan2(z - prev.z, x - prev.x);
                rails.push({ x: (x + prev.x) / 2, y: 0.45, z: (z + prev.z) / 2, ry: -ang, sx: L });
                rails.push({ x: (x + prev.x) / 2, y: 0.8, z: (z + prev.z) / 2, ry: -ang, sx: L, rz: k.range(-0.03, 0.03) });
            }
            prev = { x: x, z: z };
        }
        k.instanced(k.geo(new T.BoxGeometry(0.17, 1.0, 0.17)), k.mat('#9a744e', { flat: true }), posts, { cast: true });
        k.instanced(k.geo(new T.BoxGeometry(1, 0.1, 0.07)), k.mat('#b48b5c', { flat: true }), rails, { cast: true });

        // Wildflowers in patches, grass tufts, a few mossy rocks and round bushes.
        const fcol = ['#ffffff', '#ffd23f', '#ff7aa8', '#b78cff', '#7fb6ff', '#ff9a4a'];
        const fl = [];
        const patches = k.spots(Math.round(14 * k.detail) + 5, P + 1.4, F - 2, 1.6, 0.1);
        patches.forEach(p => {
            const col = k.pick(fcol), n = 12 + Math.floor(k.rand() * 14);
            for (let i = 0; i < n; i++) {
                const a = k.range(0, 6.28), d = Math.sqrt(k.rand()) * 1.7, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
                if (!k.free(x, z, 0.1, 0.1)) continue;
                fl.push({ x: x, y: k.range(0.13, 0.2), z: z, s: k.range(0.8, 1.3), color: k.rand() < 0.8 ? col : k.pick(fcol) });
            }
        });
        for (let i = 0; i < 70 * k.detail; i++) {
            const a = k.range(0, 6.28), d = k.range(P + 1, F + 2), x = Math.cos(a) * d, z = Math.sin(a) * d;
            if (k.free(x, z, 0.1, 0.1)) fl.push({ x: x, y: 0.15, z: z, color: k.pick(fcol) });
        }
        k.instancedColors(k.geo(new T.IcosahedronGeometry(0.085, 0)), { rough: 0.8, flat: true }, fl);
        k.instanced(k.geo(new T.CylinderGeometry(0.012, 0.012, 0.18, 3)), k.mat('#4f9a3a'), fl.map(f => ({ x: f.x, y: f.y - 0.09, z: f.z })));
        const tuft = k.merge([
            { g: G.cone(0.06, 0.42, 3), y: 0.2, rz: 0.25, c: '#5aa443' }, { g: G.cone(0.06, 0.5, 3), y: 0.24, rz: -0.18, x: 0.05, c: '#6cb64e' },
            { g: G.cone(0.05, 0.36, 3), y: 0.17, rx: 0.3, z: 0.05, c: '#4f9a3c' }
        ]);
        const tufts = [];
        for (let i = 0; i < 220 * k.detail; i++) {
            const a = k.range(0, 6.28), d = k.range(P + 0.9, F + 3), x = Math.cos(a) * d, z = Math.sin(a) * d;
            if (k.free(x, z, 0.1, 0.1)) tufts.push({ x: x, z: z, ry: k.range(0, 6.28), s: k.range(0.7, 1.3) });
        }
        k.instanced(tuft, k.vmat(), tufts);
        const rocks = k.spots(6, F - 3, F + 2, 0.8, 0.6).map(p => ({ x: p.x, y: 0.15, z: p.z, s: k.range(0.45, 0.8), ry: k.range(0, 6) }));
        k.instanced(k.rockGeo(1, 0.25, 3), k.mat('#a3a297', { flat: true }), rocks, { cast: true });
        const bushes = k.spots(Math.round(10 * k.detail) + 3, F - 4, F + 1.5, 0.9, 1.2).map(p => ({ x: p.x, y: 0.3, z: p.z, s: k.range(0.7, 1.1), sy: k.range(0.55, 0.8) }));
        k.instanced(k.geo(new T.IcosahedronGeometry(0.75, 1)), k.mat('#4f9e45', { flat: true }), bushes, { cast: true });

        // Trees down the hillside (their crowns peep over the edge) and on the far hills.
        const treeA = k.treeGeo('#4caf50'), treeB = k.treeGeo('#3e9b4f'), treeC = k.treeGeo('#6cbf4a');
        const near = [[], [], []], far = [[], [], []];
        for (let i = 0, n = 0; i < 300 && n < 22 * k.detail + 6; i++) {
            const a = k.range(0, 6.28), d = k.range(F + 3, F + 26), x = Math.cos(a) * d, z = Math.sin(a) * d;
            if (!k.freeWide(x, z, 1.5, 4)) continue;
            near[n++ % 3].push({ x: x, y: hh(x, z) - 0.2, z: z, s: k.range(1.3, 2.1), ry: k.range(0, 6.28) });
        }
        // Far trees grow in groves, not in a row along the skyline.
        for (let g = 0, n = 0; g < 12 && n < 64 * k.detail + 10; g++) {
            const a = k.range(0, 6.28), d = k.range(70, 170), gx = Math.cos(a) * d, gz = Math.sin(a) * d;
            if (!k.free(gx, gz, 6, 8)) continue;
            for (let i = 0, m = 5 + Math.floor(k.rand() * 7); i < m; i++) {
                const x = gx + k.range(-9, 9), z = gz + k.range(-6, 6);
                far[n++ % 3].push({ x: x, y: hh(x, z) - 0.3, z: z, s: k.range(2.2, 3.4), ry: k.range(0, 6.28) });
            }
        }
        [treeA, treeB, treeC].forEach((g, i) => { k.instanced(g, k.vmat(), near[i], { cast: true }); k.instanced(g, k.vmat(), far[i]); });

        // A little village with a church on a far hill.
        const va = back + 0.55, vx = Math.cos(va) * 128, vz = Math.sin(va) * 128;
        const homes = [[], []], hg = [k.houseGeo('#f3e2c0', '#c8553d'), k.houseGeo('#f1d7c4', '#7a4b3a')];
        for (let i = 0; i < 9; i++) {
            const x = vx + k.range(-16, 16), z = vz + k.range(-9, 9);
            homes[i % 2].push({ x: x, y: hh(x, z) - 0.2, z: z, s: 2.3, ry: k.range(-0.5, 0.5) + Math.PI * 0.1 });
        }
        hg.forEach((g, i) => k.instanced(g, k.vmat(), homes[i]));
        k.prop([
            { g: G.box(3.4, 3.2, 6), y: 1.6, c: '#efe6d4' }, { g: G.prism([[-1.95, 3.2], [1.95, 3.2], [0, 5.0]], 6.2), c: '#8a5a44' },
            { g: G.box(1.8, 6.5, 1.8), y: 3.25, z: 3.4, c: '#efe6d4' }, { g: G.cone(1.35, 3.8, 4), y: 8.4, z: 3.4, ry: Math.PI / 4, c: '#5f6f8a' }
        ], { x: vx + 4, y: hh(vx + 4, vz) - 0.2, z: vz, ry: 0.4, s: 2.2 });

        // Hot-air balloons drifting over the valley, level with the hilltop.
        const balloonGeo = function (a, b) {
            return k.merge([
                { g: G.ball(2.2, 2), y: 3.2, sy: 1.15, cf: function (v, out) { const ang = Math.atan2(v.z, v.x); out.set(Math.floor((ang + Math.PI) / (Math.PI / 5)) % 2 ? a : b); } },
                { g: G.cyl(0.95, 0.55, 0.7, 10), y: 0.75, c: b },
                ...[[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].map(p => ({ g: G.cyl(0.02, 0.02, 0.9, 3), x: p[0], y: 0.05, z: p[1], c: '#5a4a3a' })),
                { g: G.box(0.75, 0.5, 0.75), y: -0.6, c: '#8a5a33' }
            ]);
        };
        const balloons = [
            { m: k.add(balloonGeo('#e2453c', '#f6c833'), k.vmat(), { receive: false }), x: -6, z: -46, y: 3.2, ph: 0.6, w: 26 },
            { m: k.add(balloonGeo('#2f6fd0', '#f5f0e6'), k.vmat(), { receive: false, s: 0.8 }), x: 30, z: -105, y: 9, ph: 2.4, w: 40 }
        ];
        const clouds = k.cloudBank(8, { z0: -150, z1: -60, y0: 16, y1: 28, s0: 2.4, s1: 4 });
        const birds = k.flock({ cx: 0, cy: 10, cz: -16, count: Math.round(4 * k.detail) + 2, radius: 12 });
        const fly = patches.slice(0, 4).map(p => [p.x, 0.55, p.z]);
        const bfA = k.flock({ spots: fly.length ? fly : [[P + 3, 0.6, 0]], count: 3, radius: 1.3, color: '#ffd23f', shape: 'butterfly', speed: 0.9, size: 0.9, spread: 0.6 });
        const bfB = k.flock({ spots: fly.length ? fly.slice().reverse() : [[-P - 3, 0.6, -2]], count: 3, radius: 1.1, color: '#ff9ec6', shape: 'butterfly', speed: 0.8, size: 0.85, spread: 0.6 });
        return {
            update: function (dt, t) {
                clouds.update(dt); birds.update(dt, t); bfA.update(dt, t); bfB.update(dt, t);
                balloons.forEach(b => {
                    b.m.position.set(b.x + Math.sin(t * 0.012 + b.ph) * b.w, b.y + Math.sin(t * 0.21 + b.ph) * 0.7, b.z + Math.cos(t * 0.009 + b.ph) * 5);
                    b.m.rotation.y = t * 0.05;
                });
            }
        };
    }
});

// =====================================================================================
// Countryside - Train. A railway line through rolling farmland: patchwork fields,
// a red barn, a turning windmill, sheep and cows.
// =====================================================================================
BNB.Worlds.register('countryside', {
    name: 'Countryside',
    sky: ['#3a89df', '#94caf1', '#f0f6ea'],
    fog: { color: '#f0f6ea', near: 36, far: 170 },
    light: { sky: '#e8f4ff', ground: '#86a35c', hemi: 1.25, sun: '#fff0d4', sunIntensity: 2.75, dir: [-0.5, 1, 0.45] },
    dust: '#c2ad86',
    build: function (k) {
        const T = k.THREE, G = k.G, P = k.plot;
        const LANE = -26;   // x of the farm lane that crosses the line
        function flatDist(x, z) {
            return Math.min(Math.max(0, Math.abs(z) - 3.4), Math.max(0, Math.hypot(x, z) - (P + 7)), Math.max(0, Math.abs(x - LANE) - 2.6));
        }
        function hh(x, z) {
            const d = flatDist(x, z);
            if (d <= 0) return 0;
            let h = Math.max(-0.5, (k.fbm(x * 0.017 + 7, z * 0.02 - 3, 4) - 0.36) * 15);
            h += k.smooth(50, 140, -z) * 14 * k.fbm(x * 0.01 - 4, z * 0.01, 3);
            return k.smooth(0, 16, d) * h * (1 - 0.85 * k.smooth(-6, 6, z));
        }
        const grass = new T.Color('#86c35c'), grass2 = new T.Color('#9ad06a'), hedgeC = new T.Color('#4f8a3c'), tmp = new T.Color();
        const fields = ['#e3c868', '#8ccb5a', '#a9845a', '#bcd96e', '#5f9f45', '#d9b04e', '#a6d47a', '#e8d27e'].map(c => new T.Color(c));
        k.terrain({
            R: 240, segs: 104, warp: 1.75, height: hh, color: function (x, z, y, out) {
                out.copy(grass).lerp(grass2, k.noise(x * 0.2, z * 0.2) * 0.8);
                const d = flatDist(x, z);
                if (d > 2) {
                    const a = 0.12, u = (x * Math.cos(a) - z * Math.sin(a)) / 22, v = (x * Math.sin(a) + z * Math.cos(a)) / 15;
                    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
                    tmp.copy(fields[Math.floor(k.hash(i + 40, j) * fields.length)]).lerp(hedgeC, 1 - k.smooth(0, 0.1, Math.min(fu, 1 - fu, fv, 1 - fv)));
                    out.lerp(tmp, k.smooth(2, 9, d) * 0.95);
                }
            }
        });
        k.plotPatch('#bdae8f', { rim: '#a3946f', extra: 0.4, rimWidth: 0.3 });

        // The railway: a gravel bed, sleepers and two steel rails, far out both ways.
        const L = 240;
        const gravel = k.canvasTexture(64, 64, function (c, w, h) {
            c.fillStyle = '#a2978a'; c.fillRect(0, 0, w, h);
            for (let i = 0; i < 160; i++) { c.fillStyle = k.pick(['#8c8276', '#b8ae9f', '#958a7d', '#c4bbad']); c.fillRect(Math.floor(k.rand() * w), Math.floor(k.rand() * h), 3, 3); }
        }, [L / 2.4, 1]);
        k.add(k.geo(new T.BoxGeometry(L, 0.03, 2.4)), k.tmat(gravel, { rough: 1 }), { y: 0.015 });
        const sleepers = [];
        for (let x = -L / 2 + 1; x < L / 2 - 1; x += 0.72) sleepers.push({ x: x, y: 0.045, z: 0 });
        k.instanced(k.geo(new T.BoxGeometry(0.3, 0.04, 1.8)), k.mat('#6e5238', { flat: true }), sleepers);
        const steel = k.mat('#9a9da3', { rough: 0.35, metal: 0.7 });
        const rail = k.geo(new T.BoxGeometry(L, 0.05, 0.08));
        k.add(rail, steel, { y: 0.065, z: 0.62 }); k.add(rail, steel, { y: 0.065, z: -0.62 });

        // A farm lane crossing the line, with crossing signs; a signal by the track.
        k.add(k.geo(new T.BoxGeometry(4.4, 0.02, 120)), k.mat('#c4a97b', { rough: 1 }), { x: LANE, y: 0.008, z: -20 });
        k.add(k.geo(new T.BoxGeometry(4.4, 0.03, 2.6)), k.mat('#8a6a48'), { x: LANE, y: 0.05 });
        const xbuck = k.merge([
            { g: G.cyl(0.06, 0.06, 2.6, 6), y: 1.3, c: '#f4f4f0' },
            { g: G.box(1.3, 0.2, 0.04), y: 2.3, rz: 0.6, c: '#f4f4f0' }, { g: G.box(1.3, 0.2, 0.04), y: 2.3, rz: -0.6, c: '#f4f4f0' },
            { g: G.box(1.0, 0.07, 0.05), y: 2.3, rz: 0.6, c: '#d9432f' }, { g: G.box(1.0, 0.07, 0.05), y: 2.3, rz: -0.6, c: '#d9432f' }
        ]);
        k.instanced(xbuck, k.vmat(), [{ x: LANE + 2.8, z: 2.6, ry: 0.3 }, { x: LANE - 2.8, z: -2.6, ry: Math.PI + 0.3 }], { cast: true });
        k.prop([
            { g: G.box(0.9, 0.3, 0.9), y: 0.15, c: '#8c8f94' }, { g: G.cyl(0.13, 0.16, 4.0, 8), y: 2.2, c: '#3e444d' },
            { g: G.box(1.5, 0.34, 0.08), x: 0.75, y: 3.6, z: 0.16, rz: -0.35, c: '#d9432f' }, { g: G.box(0.26, 0.36, 0.09), x: 1.1, y: 3.47, z: 0.17, rz: -0.35, c: '#f4f4f0' },
            { g: G.box(0.4, 0.4, 0.3), y: 3.0, z: 0.2, c: '#2b2b2b' }, { g: G.ball(0.12, 1), y: 3.0, z: 0.38, c: '#ff5a4a' },
            { g: G.cone(0.22, 0.3, 8), y: 4.35, c: '#3e444d' }
        ], { x: P + 10, z: -2.5, cast: true });

        // The farm: a red barn and silo, a farmhouse.
        const barnShape = new T.Shape();
        [[-3, 0], [3, 0], [3, 3], [2, 4.3], [0, 5.1], [-2, 4.3], [-3, 3]].forEach((p, i) => (i ? barnShape.lineTo(p[0], p[1]) : barnShape.moveTo(p[0], p[1])));
        const barnBody = new T.ExtrudeGeometry(barnShape, { depth: 4.6, bevelEnabled: false });
        barnBody.translate(0, 0, -2.3);
        const roofShape = new T.Shape();
        [[-3.35, 2.85], [-2.15, 4.55], [0, 5.42], [2.15, 4.55], [3.35, 2.85], [3.05, 2.85], [2.0, 4.3], [0, 5.1], [-2.0, 4.3], [-3.05, 2.85]].forEach((p, i) => (i ? roofShape.lineTo(p[0], p[1]) : roofShape.moveTo(p[0], p[1])));
        const barnRoof = new T.ExtrudeGeometry(roofShape, { depth: 5.0, bevelEnabled: false });
        barnRoof.translate(0, 0, -2.5);
        const trim = '#f4f1e8';
        k.prop([
            { g: barnBody, c: '#b8412f' }, { g: barnRoof, c: '#4d4f57' },
            { g: G.box(2.2, 2.6, 0.06), y: 1.3, z: 2.32, c: '#8f2f22' },
            { g: G.box(2.4, 0.14, 0.08), y: 2.62, z: 2.34, c: trim }, { g: G.box(0.14, 2.6, 0.08), x: -1.13, y: 1.3, z: 2.34, c: trim }, { g: G.box(0.14, 2.6, 0.08), x: 1.13, y: 1.3, z: 2.34, c: trim },
            { g: G.box(3.2, 0.12, 0.08), y: 1.3, z: 2.36, rz: 0.86, c: trim }, { g: G.box(3.2, 0.12, 0.08), y: 1.3, z: 2.36, rz: -0.86, c: trim },
            { g: G.box(1.0, 0.9, 0.06), y: 3.7, z: 2.32, c: trim }, { g: G.box(0.8, 0.7, 0.07), y: 3.7, z: 2.33, c: '#6b2a20' },
            { g: G.cyl(1.25, 1.25, 7.2, 12), x: 4.7, y: 3.6, z: -0.8, c: '#c9ced2' }, { g: G.sphere(1.27, 12, 6), x: 4.7, y: 7.2, z: -0.8, sy: 0.75, c: '#8b97a3' },
            { g: G.cyl(1.27, 1.27, 0.15, 12), x: 4.7, y: 2.4, z: -0.8, c: '#9aa4ae' }, { g: G.cyl(1.27, 1.27, 0.15, 12), x: 4.7, y: 4.8, z: -0.8, c: '#9aa4ae' }
        ], { x: -8, y: hh(-8, -29) - 0.1, z: -29, ry: 0.12, cast: true });
        k.add(k.houseGeo('#f6f1e4', '#5d6f8a'), k.vmat(), { x: -20, y: hh(-20, -33) - 0.1, z: -33, ry: 0.3, s: 1.6, cast: true });

        // A windmill on a rise, sails turning slowly.
        const wmX = 17, wmZ = -36, wmY = hh(wmX, wmZ) - 0.2;
        k.prop([
            { g: G.cyl(1.15, 1.9, 8, 8), y: 4, c: '#efe6d6' }, { g: G.cone(1.6, 2.2, 8), y: 9.1, c: '#6e4b33' },
            { g: G.box(0.8, 1.4, 0.1), y: 0.7, z: 1.82, rx: -0.09, c: '#6e4b33' }, { g: G.box(0.5, 0.5, 0.1), y: 4.5, z: 1.45, rx: -0.09, c: '#4a6a8a' },
            { g: G.cyl(1.95, 1.95, 0.25, 8), y: 6.2, c: '#8a6a4a' }
        ], { x: wmX, y: wmY, z: wmZ, ry: -0.3, s: 1.25, cast: true });
        const sailParts = [{ g: G.cyl(0.25, 0.25, 0.5, 8), rx: Math.PI / 2, c: '#5a3d28' }];
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
            sailParts.push({ g: G.box(0.14, 4.6, 0.1), x: -sa * 2.3, y: ca * 2.3, rz: a, c: '#7a5434' });
            sailParts.push({ g: G.box(0.85, 3.6, 0.04), x: -sa * 2.6 + ca * 0.5, y: ca * 2.6 + sa * 0.5, z: 0.04, rz: a, c: '#f2ece0' });
        }
        const sails = k.prop(sailParts, { x: wmX + Math.sin(-0.3) * 2.2, y: wmY + 10.25, z: wmZ + Math.cos(-0.3) * 2.2, ry: -0.3, s: 1.35 }, { side: T.DoubleSide });
        sails.rotation.order = 'YXZ';

        // Sheep in one meadow, cows in another.
        const sheepGeo = k.merge([
            { g: G.ball(0.5, 1), y: 0.72, sx: 0.95, sy: 0.85, sz: 1.3, c: '#f4f2ea' },
            { g: G.ball(0.3, 1), y: 0.98, z: 0.35, c: '#f4f2ea' },
            { g: G.box(0.26, 0.32, 0.36), y: 0.82, z: 0.72, c: '#2f2c2a' },
            { g: G.box(0.22, 0.07, 0.09), y: 0.92, z: 0.66, c: '#2f2c2a' },
            ...[[-0.2, -0.35], [0.2, -0.35], [-0.2, 0.35], [0.2, 0.35]].map(p => ({ g: G.box(0.1, 0.42, 0.1), x: p[0], y: 0.21, z: p[1], c: '#2f2c2a' }))
        ]);
        const cowGeo = k.merge([
            { g: G.box(1.0, 0.95, 1.8), y: 1.1, c: '#f6f4ee' },
            { g: G.box(1.04, 0.62, 0.7), y: 1.22, z: -0.35, c: '#2f2c2a' }, { g: G.box(1.04, 0.5, 0.45), y: 1.3, z: 0.5, c: '#2f2c2a' },
            { g: G.box(0.62, 0.62, 0.7), y: 1.5, z: 1.15, c: '#f6f4ee' }, { g: G.box(0.64, 0.32, 0.26), y: 1.3, z: 1.52, c: '#f2a7a8' },
            { g: G.box(0.64, 0.24, 0.5), y: 1.7, z: 1.12, c: '#2f2c2a' },
            { g: G.box(0.3, 0.12, 0.12), x: -0.42, y: 1.62, z: 1.0, c: '#2f2c2a' }, { g: G.box(0.3, 0.12, 0.12), x: 0.42, y: 1.62, z: 1.0, c: '#2f2c2a' },
            { g: G.cone(0.06, 0.26, 4), x: -0.2, y: 1.92, z: 1.05, rz: 0.4, c: '#efe6c8' }, { g: G.cone(0.06, 0.26, 4), x: 0.2, y: 1.92, z: 1.05, rz: -0.4, c: '#efe6c8' },
            ...[[-0.33, -0.65], [0.33, -0.65], [-0.33, 0.65], [0.33, 0.65]].map(p => ({ g: G.box(0.2, 0.66, 0.2), x: p[0], y: 0.33, z: p[1], c: '#f6f4ee' })),
            { g: G.box(0.3, 0.16, 0.3), y: 0.6, z: -0.1, c: '#f2a7a8' },
            { g: G.box(0.08, 0.7, 0.08), y: 0.95, z: -0.93, rx: 0.2, c: '#2f2c2a' }
        ]);
        const herd = function (cx, cz, n, rad) {
            const out = [];
            for (let i = 0, tries = 0; out.length < n && tries < 80; tries++) {
                const x = cx + k.range(-rad, rad), z = cz + k.range(-rad, rad);
                if (!k.free(x, z, 1, 1.5) || flatDist(x, z) <= 1 || out.some(o => Math.hypot(o.x - x, o.z - z) < 1.8)) continue;
                out.push({ x: x, y: hh(x, z), z: z, ry: k.range(0, 6.28), ph: k.range(0, 6.28), s: k.range(0.9, 1.1) });
            }
            return out;
        };
        const sheep = k.animInstanced(sheepGeo, k.vmat(), herd(15, -13, Math.round(5 * k.detail) + 3, 6), (it, t, o) => { o.ry = it.ry + Math.sin(t * 0.25 + it.ph) * 0.5; o.rx = Math.max(0, Math.sin(t * 0.6 + it.ph)) * 0.12; }, { cast: true });
        const cows = k.animInstanced(cowGeo, k.vmat(), herd(-13, -12, Math.round(2 * k.detail) + 2, 4), (it, t, o) => { o.ry = it.ry + Math.sin(t * 0.18 + it.ph) * 0.35; }, { cast: true });

        // Hay bales on a stubble field, hedgerows, trees.
        const bales = [];
        for (let i = 0; i < 8; i++) { const x = 30 + k.range(-12, 12), z = -44 + k.range(-8, 8); bales.push({ x: x, y: hh(x, z) + 0.55, z: z, rx: Math.PI / 2, rz: k.range(0, 3) }); }
        k.instanced(k.geo(new T.CylinderGeometry(0.6, 0.6, 1.1, 10)), k.mat('#e2c45a', { flat: true }), bales);
        const hedge = [];
        const hedgeLine = (x0, z0, x1, z1) => {
            const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.25);
            for (let i = 0; i <= n; i++) {
                const x = x0 + (x1 - x0) * i / n + k.range(-0.2, 0.2), z = z0 + (z1 - z0) * i / n + k.range(-0.2, 0.2);
                if (!k.free(x, z, 0.8, 1.2) || flatDist(x, z) <= 0.5) continue;
                hedge.push({ x: x, y: hh(x, z) + 0.35, z: z, s: k.range(0.85, 1.2), sy: k.range(0.6, 0.85), ry: k.range(0, 6) });
            }
        };
        hedgeLine(-70, -11, -12, -11); hedgeLine(12, -9, 70, -9); hedgeLine(36, -9, 40, -70); hedgeLine(-40, -11, -46, -70);
        k.instanced(k.geo(new T.IcosahedronGeometry(0.9, 1)), k.mat('#4a8f3e', { flat: true }), hedge, { cast: true });
        const tA = k.treeGeo('#4caf50'), tB = k.treeGeo('#3e9b4f'), tC = k.treeGeo('#6cbf4a');
        const trees = [[], [], []];
        for (let i = 0, n = 0; i < 400 && n < 34 * k.detail + 8; i++) {
            const a = k.range(0, 6.28), d = k.range(P + 12, 110), x = Math.cos(a) * d, z = Math.sin(a) * d;
            if (!k.freeWide(x, z, 1.6, 4) || flatDist(x, z) < 3 || Math.hypot(x + 8, z + 29) < 10 || Math.hypot(x + 20, z + 33) < 5 || Math.hypot(x - wmX, z - wmZ) < 5) continue;
            trees[n++ % 3].push({ x: x, y: hh(x, z) - 0.15, z: z, s: k.range(1.3, 2.2) * (d > 50 ? 1.5 : 1), ry: k.range(0, 6.28) });
        }
        [tA, tB, tC].forEach((g, i) => k.instanced(g, k.vmat(), trees[i], { cast: true }));

        // Wildflowers along the near meadow.
        const fl = [];
        for (let i = 0; i < 160 * k.detail; i++) {
            const a = k.range(0, 6.28), d = k.range(P + 1, 22), x = Math.cos(a) * d, z = Math.sin(a) * d;
            if (Math.abs(z) < 1.6 || Math.abs(x - LANE) < 2.4 || !k.free(x, z, 0.1, 0.1)) continue;
            fl.push({ x: x, y: hh(x, z) + 0.09, z: z, color: k.pick(['#ffffff', '#ffd23f', '#ff7aa8', '#ffffff', '#b78cff']) });
        }
        k.instancedColors(k.geo(new T.IcosahedronGeometry(0.085, 0)), { rough: 0.8, flat: true }, fl);

        // A red tractor trundling along a far field.
        const tractor = k.prop([
            { g: G.box(1.0, 0.7, 1.6), y: 0.9, c: '#d6362c' },
            // the cab: red lower body, a glass band with slim corner posts, a red roof (glass on all four sides)
            { g: G.box(0.9, 0.45, 0.8), y: 1.475, z: -0.35, c: '#d6362c' }, { g: G.box(0.84, 0.5, 0.74), y: 1.95, z: -0.35, c: '#bfe0f0' },
            ...[[-0.42, -0.72], [0.42, -0.72], [-0.42, 0.02], [0.42, 0.02]].map(p => ({ g: G.box(0.08, 0.5, 0.08), x: p[0], y: 1.95, z: p[1], c: '#d6362c' })),
            { g: G.box(1.0, 0.1, 0.9), y: 2.25, z: -0.35, c: '#d6362c' },
            { g: G.cyl(0.06, 0.06, 0.7, 5), x: 0.3, y: 1.6, z: 0.5, c: '#3a3f4a' },
            { g: G.cyl(0.62, 0.62, 0.35, 12), x: -0.6, y: 0.62, z: -0.45, rz: Math.PI / 2, c: '#2b2b2b' }, { g: G.cyl(0.62, 0.62, 0.35, 12), x: 0.6, y: 0.62, z: -0.45, rz: Math.PI / 2, c: '#2b2b2b' },
            { g: G.cyl(0.36, 0.36, 0.25, 10), x: -0.55, y: 0.36, z: 0.6, rz: Math.PI / 2, c: '#2b2b2b' }, { g: G.cyl(0.36, 0.36, 0.25, 10), x: 0.55, y: 0.36, z: 0.6, rz: Math.PI / 2, c: '#2b2b2b' }
        ], { s: 1.6 });
        const clouds = k.cloudBank(8, { z0: -150, z1: -60, y0: 18, y1: 30, s0: 2.4, s1: 4 });
        const birds = k.flock({ cx: 6, cy: 11, cz: -20, count: Math.round(4 * k.detail) + 2, radius: 11 });
        return {
            update: function (dt, t) {
                sails.rotation.z = -t * 0.55;
                const tx = 2 + Math.sin(t * 0.045) * 30, tz = -40;
                tractor.position.set(tx, hh(tx, tz), tz);
                tractor.rotation.y = Math.cos(t * 0.045) > 0 ? Math.PI / 2 : -Math.PI / 2;
                sheep.update(t); cows.update(t);
                clouds.update(dt); birds.update(dt, t);
            }
        };
    }
});

// =====================================================================================
// Desert - Pyramid. Golden dunes, great pyramids looming in the haze, a palm oasis,
// obelisks, ruins and a camel caravan.
// =====================================================================================
BNB.Worlds.register('desert', {
    name: 'Desert',
    sky: ['#3f83cc', '#9cc6e3', '#f5e2bf'],
    fog: { color: '#f5e2bf', near: 40, far: 230 },
    light: { sky: '#fff2da', ground: '#c99a5c', hemi: 1.1, sun: '#ffe2b2', sunIntensity: 3.0, dir: [-0.6, 0.8, 0.45] },
    dust: '#e2c48e',
    build: function (k) {
        const T = k.THREE, G = k.G, P = k.plot;
        const OAS = { x: -4, z: -30, r: 4.4 };
        function hh(x, z) {
            const r = Math.hypot(x, z);
            const ramp = k.smooth(P + 8, P + 34, r);
            if (ramp <= 0) return 0;
            // Dunes: long gentle windward slopes, steeper slip faces, wandering crests.
            const a = 0.45, u = x * Math.cos(a) + z * Math.sin(a), v = -x * Math.sin(a) + z * Math.cos(a);
            const ph = u / 34 + k.fbm(x * 0.018, z * 0.018, 3) * 1.6, s = ph - Math.floor(ph);
            const prof = s < 0.72 ? k.smooth(0, 0.72, s) : 1 - k.smooth(0.72, 1, s);
            let h = prof * (2 + 7 * k.fbm(v * 0.018 + 9, u * 0.01, 3)) + k.fbm(x * 0.06, z * 0.06, 2) * 0.8;
            h *= ramp * (0.55 + 0.45 * k.smooth(30, 90, r));
            h *= k.smooth(OAS.r + 4, OAS.r + 13, Math.hypot(x - OAS.x, z - OAS.z));
            return h * (1 - 0.7 * k.smooth(0, 14, z));
        }
        const sand = new T.Color('#e8c387'), crest = new T.Color('#f6dfae'), trough = new T.Color('#d4a464'), green = new T.Color('#aeb463');
        k.terrain({
            R: 240, segs: 104, warp: 1.75, height: hh, color: function (x, z, y, out) {
                out.copy(sand).lerp(trough, k.noise(x * 0.15, z * 0.15) * 0.45).lerp(crest, k.smooth(1.5, 7, y));
                out.lerp(green, (1 - k.smooth(OAS.r + 1.5, OAS.r + 6, Math.hypot(x - OAS.x, z - OAS.z))) * 0.75);
            }
        });
        k.plotPatch('#e8d3a4', { rim: '#cdae78', extra: 0.4, rimWidth: 0.32 });

        // Three great pyramids looming in the haze.
        const pyr = (x, z, base, h, c) => ({ g: G.cone(base * 0.7071, h, 4), x: x, y: h / 2 - 1, z: z, ry: Math.PI / 4, c: c });
        k.prop([
            pyr(-6, -80, 56, 38, '#e0b676'), pyr(70, -110, 50, 33, '#dcb172'), pyr(90, -62, 26, 17, '#e4bc7f'),
            { g: G.cone(2.2, 2.2, 4), x: -6, y: 37 - 1.65, z: -80, ry: Math.PI / 4, c: '#f2cf6a' }
        ], { receive: false }, { rough: 0.95 });
        // An old processional way, half buried, from the plot toward the great pyramid.
        const slabs = [];
        for (let d = P + 2.5; d < 70; d += 1.5) {
            const t = d / 70, x = 6.5 * Math.sin(Math.PI * Math.min(1, d / 55)) - 6 * k.smooth(45, 75, d) + Math.sin(d * 0.4) * 0.2, z = -d;
            [-0.8, 0.8].forEach(o => { if (k.rand() < 0.8 - t * 0.5) slabs.push({ x: x + o + k.range(-0.1, 0.1), y: hh(x + o, z) + 0.02, z: z, ry: k.range(-0.15, 0.15), sx: k.range(0.8, 1.1), color: k.pick(['#d8c29a', '#cdb48a', '#e2cfa8']) }); });
        }
        k.instancedColors(k.geo(new T.BoxGeometry(1.4, 0.08, 1.3)), { flat: true, rough: 0.95 }, slabs);

        // A pair of obelisks off to the right, like an old gateway.
        const obelisk = k.merge([
            { g: G.box(1.5, 0.5, 1.5), y: 0.25, c: '#cfae7a' }, { g: G.cyl(0.33, 0.55, 6.6, 4), y: 3.8, ry: Math.PI / 4, c: '#dcbd88' },
            { g: G.cone(0.33, 0.6, 4), y: 7.4, ry: Math.PI / 4, c: '#f0c95e' }
        ]);
        k.instanced(obelisk, k.vmat(), [{ x: 24, y: hh(24, -27) - 0.1, z: -27 }, { x: 31, y: hh(31, -22) - 0.1, z: -22 }], { cast: true });

        // The oasis: a pool ringed with grass, palms, reeds and rocks.
        const pool = k.geo(new T.CircleGeometry(OAS.r, 28)); pool.rotateX(-Math.PI / 2);
        k.add(pool, k.mat('#3ea0c5', { rough: 0.2, metal: 0.1 }), { x: OAS.x, y: 0.035, z: OAS.z });
        const ring = k.geo(new T.CircleGeometry(OAS.r + 2.4, 28)); ring.rotateX(-Math.PI / 2);
        k.add(ring, k.mat('#9db35c', { rough: 1 }), { x: OAS.x, y: 0.02, z: OAS.z });
        const palms = [k.palmGeo(0.35), k.palmGeo(0.7, 4.2), k.palmGeo(0.15, 5.2)], pl = [[], [], []];
        for (let i = 0; i < 8; i++) {
            const a = i / 8 * 6.28 + k.range(-0.25, 0.25), d = OAS.r + k.range(1.0, 2.6);
            pl[i % 3].push({ x: OAS.x + Math.cos(a) * d, z: OAS.z + Math.sin(a) * d, ry: -a + Math.PI, s: k.range(0.95, 1.3) });
        }
        palms.forEach((g, i) => k.instanced(g, k.vmat({ side: T.DoubleSide }), pl[i], { cast: true }));
        const reeds = [];
        for (let i = 0; i < 44 * k.detail; i++) { const a = k.range(0, 6.28), d = OAS.r + k.range(-0.2, 0.5); reeds.push({ x: OAS.x + Math.cos(a) * d, y: 0.35, z: OAS.z + Math.sin(a) * d, rz: k.range(-0.2, 0.2), s: k.range(0.7, 1.2) }); }
        k.instanced(k.geo(new T.ConeGeometry(0.05, 0.8, 3)), k.mat('#6f9a3f', { flat: true }), reeds);

        // Ruins near the plot: a standing column, a broken one, fallen drums and blocks.
        const col = (h) => [{ g: G.box(1.1, 0.3, 1.1), y: 0.15, c: '#cfb282' }, { g: G.cyl(0.38, 0.42, h, 10), y: 0.3 + h / 2, c: '#dcc296' }];
        k.prop(col(3.2).concat([{ g: G.box(1.0, 0.3, 1.0), y: 3.65, c: '#cfb282' }]), { x: -10.5, z: -5, cast: true });
        k.prop(col(1.3).map(p => Object.assign(p, { x: 1.6, z: -1.2 })).concat([
            { g: G.cyl(0.4, 0.4, 1.1, 10), x: 0.2, y: 0.4, z: 1.3, rz: Math.PI / 2, ry: 0.4, c: '#dcc296' },
            { g: G.box(1.2, 0.6, 0.8), x: -1.0, y: 0.3, z: 0.2, ry: 0.3, c: '#d2b688' }
        ]), { x: -10.5, z: -5, cast: true });
        k.prop([
            { g: G.box(1.3, 0.7, 0.9), y: 0.35, ry: 0.2, c: '#d2b688' }, { g: G.box(0.9, 0.5, 0.7), x: 0.5, y: 0.95, ry: 0.5, c: '#dcc296' },
            { g: G.cyl(0.4, 0.4, 1.0, 10), x: -1.4, y: 0.4, z: 1.2, rx: Math.PI / 2, ry: 0.9, c: '#dcc296' }
        ], { x: 11.5, z: -2, cast: true });

        // Dry shrubs in little clumps, and rocks.
        const shrubs = [];
        k.spots(Math.round(16 * k.detail) + 4, P + 2, 36, 1.2, 0.5).forEach(c => {
            for (let i = 0, n = 1 + Math.floor(k.rand() * 4); i < n; i++) {
                const x = c.x + k.range(-1, 1), z = c.z + k.range(-1, 1);
                shrubs.push({ x: x, y: hh(x, z) + 0.12, z: z, s: k.range(0.25, 0.5), sy: k.range(0.4, 0.6), color: k.pick(['#b0a35a', '#8f9650', '#a6905a']) });
            }
        });
        k.instancedColors(k.geo(new T.IcosahedronGeometry(1, 0)), { flat: true }, shrubs);
        const rocks = [];
        for (let i = 0; i < 16 * k.detail; i++) {
            const a = k.range(0, 6.28), d = k.range(P + 2, 30), x = Math.cos(a) * d, z = Math.sin(a) * d;
            if (!k.free(x, z, 0.6, 0.6)) continue;
            rocks.push({ x: x, y: hh(x, z) + 0.05, z: z, s: k.range(0.25, 0.6), ry: k.range(0, 6) });
        }
        k.instanced(k.rockGeo(0, 0.3, 5), k.mat('#c8996a', { flat: true }), rocks, { cast: true });

        // A camel caravan plodding along between the dunes.
        const camel = k.merge([
            { g: G.box(0.75, 0.7, 1.7), y: 1.55, c: '#c79b63' }, { g: G.ball(0.48, 1), y: 2.0, sy: 0.9, c: '#c79b63' },
            { g: G.box(0.3, 1.0, 0.32), y: 2.05, z: 1.0, rx: 0.5, c: '#c79b63' }, { g: G.box(0.32, 0.32, 0.62), y: 2.55, z: 1.38, c: '#c79b63' },
            ...[[-0.25, -0.6], [0.25, -0.6], [-0.25, 0.6], [0.25, 0.6]].map(p => ({ g: G.box(0.15, 1.25, 0.15), x: p[0], y: 0.62, z: p[1], c: '#b88c56' })),
            { g: G.box(0.8, 0.12, 0.9), y: 2.38, z: -0.05, c: '#c0392b' }, { g: G.box(0.82, 0.3, 0.5), y: 1.6, z: -0.05, c: '#2f6fd0' }
        ]);
        const caravan = [0, 1, 2, 3].map(i => ({ i: i }));
        const camels = k.animInstanced(camel, k.vmat(), caravan, (it, t, o) => {
            const x = ((t * 1.1 + it.i * 3.4) % 180) - 90;
            o.x = x; o.z = -46 + Math.sin(x * 0.05) * 3;
            o.y = hh(o.x, o.z) + Math.abs(Math.sin(t * 2.6 + it.i)) * 0.08;
            o.ry = Math.PI / 2; o.s = 1.25;
        });

        const clouds = k.cloudBank(4, { z0: -160, z1: -90, y0: 26, y1: 36, s0: 2.5, s1: 4, glow: '#f6e6d0' });
        const hawks = k.flock({ cx: -4, cy: 13, cz: -18, count: 2, radius: 13, speed: 0.18 });
        return {
            update: function (dt, t) { camels.update(t); clouds.update(dt); hawks.update(dt, t); }
        };
    }
});

// =====================================================================================
// River Canyon - Bridge. A real little river runs in its own channel right under the
// bridge: stony banks slope down to flowing water (knocked blocks splash and sink).
// Layered red-rock walls, a natural stone arch and hoodoos rise around it.
// =====================================================================================
BNB.Worlds.register('canyon', {
    name: 'River Canyon',
    sky: ['#3a83d2', '#8ec3ea', '#f3dcc0'],
    fog: { color: '#f3dcc0', near: 38, far: 210 },
    light: { sky: '#fdeedd', ground: '#b8734a', hemi: 1.15, sun: '#ffe7c4', sunIntensity: 2.8, dir: [-0.5, 0.9, 0.5] },
    dust: '#d9a877',
    // Two banks with tops at y = 0, and a riverbed 1.2 down between them.
    ground: [{ half: [40, 1, 60], pos: [-41.45, -1, 0] }, { half: [40, 1, 60], pos: [41.45, -1, 0] }, { half: [1.45, 1, 60], pos: [0, -2.2, 0] }],
    water: -0.45,
    build: function (k) {
        const T = k.THREE, G = k.G, P = k.plot;
        const cx = k.view.center.x, cz = k.view.center.z;
        const RX = 1.45, BED = -1.2, WL = -0.45, TOE = 0.8, LIP = 2.05;   // bank edge, bed, water, slope foot, stony lip
        const bend = -40;
        const riverX = z => (z >= bend ? 0 : 9 * Math.sin((z - bend) * 0.03) * k.smooth(0, 30, bend - z));
        const floorW = z => (z > 0 ? 13 + z * 0.6 : 12 + 5 * k.noise(z * 0.03 + 5, 1.7));
        function hh(x, z) {
            const rd = Math.abs(x - riverX(z));
            let h = -1.6 * (1 - k.smooth(1.0, 1.75, rd));   // the channel (the stony banks drawn below cover its edges)
            const d = rd - floorW(z);
            if (d > 0) {
                const H = 20 + 12 * k.fbm(x * 0.02, z * 0.02, 3), hr = H * k.smooth(0, 11, d);
                const step = 3.4, q = hr / step, fl = Math.floor(q);
                h = (fl + k.smooth(0.55, 1, q - fl)) * step + k.fbm(x * 0.08, z * 0.08, 2) * 0.7 * k.smooth(0, 3, d);
            }
            h += k.smooth(0.56, 0.63, k.fbm(x * 0.014 + 11, z * 0.014 - 3, 3)) * k.smooth(70, 110, Math.hypot(x, z)) * 26;
            return h;
        }
        const bands = ['#c8774a', '#da9a63', '#b65f3b', '#e4b47d', '#c56b43', '#d58a57', '#aa5639'].map(c => new T.Color(c));
        const sandC = new T.Color('#dcae7a'), sand2 = new T.Color('#e8c290'), greenC = new T.Color('#9fa65c'), bedC = new T.Color('#6f6a5e');
        k.terrain({
            R: 240, segs: 110, warp: 1.7, height: hh, color: function (x, z, y, out) {
                if (y < -0.3) { out.copy(bedC); return; }
                if (y < 0.25) {
                    out.copy(sandC).lerp(sand2, k.noise(x * 0.2, z * 0.2) * 0.8);
                    out.lerp(greenC, (1 - k.smooth(2.5, 6.5, Math.abs(x - riverX(z)))) * 0.6);
                    return;
                }
                const b = y / 3.4, i = Math.floor(b), n = bands.length;
                out.copy(bands[((i % n) + n) % n]).lerp(bands[(((i + 1) % n) + n) % n], k.smooth(0.75, 1, b - i) * 0.5);
            }
        });

        // The plot patch on the two banks only (never across the water).
        const segment = function (R, side, y, color) {
            const ax = side * RX - cx;   // the bank edge, relative to the plot centre
            if (Math.abs(ax) >= R) return;
            const th = Math.acos(Math.max(-1, Math.min(1, side * ax / R))), v = [], pts = [];
            for (let i = 0; i <= 36; i++) { const a = -th + 2 * th * i / 36; pts.push([side * Math.cos(a) * R, Math.sin(a) * R]); }
            let mx = 0, mz = 0;
            pts.forEach(p => { mx += p[0]; mz += p[1]; });
            mx /= pts.length; mz /= pts.length;
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i], b = pts[(i + 1) % pts.length];
                v.push(mx, 0, mz, b[0], 0, b[1], a[0], 0, a[1]);
            }
            const g = k.geo(new T.BufferGeometry());
            g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
            g.computeVertexNormals();
            k.add(g, k.mat(color, { rough: 0.95, side: T.DoubleSide }), { x: cx, y: y, z: cz });
        };
        [-1, 1].forEach(s => { segment(P + 0.72, s, 0.003, '#c08d5c'); segment(P + 0.4, s, 0.005, '#d8ab79'); });

        // Stony banks: a pebbled lip along each edge and slopes down to the water.
        const bv = [], bc = [], c = new T.Color(), stoneA = new T.Color('#a39486'), stoneB = new T.Color('#8a7d72'), lipA = new T.Color('#c4a581'), lipB = new T.Color('#d6b98f');
        let prev = null;
        for (let z = 70; z > -230; z -= (z > -30 ? 0.7 : 3)) {
            const rc = riverX(z);
            const rowL = [[rc - LIP, 0.007], [rc - RX, 0.007], [rc - TOE, BED]], rowR = [[rc + TOE, BED], [rc + RX, 0.007], [rc + LIP, 0.007]];
            const row = { z: z, L: rowL, R: rowR, n: [k.noise(z * 0.9, 1), k.noise(z * 0.9, 7), k.noise(z * 0.9, 13)] };
            if (prev) {
                [['L', 0], ['L', 1], ['R', 0], ['R', 1]].forEach(q => {
                    const A = prev[q[0]], Bq = row[q[0]], i = q[1];
                    const quad = [[A[i], prev.z], [A[i + 1], prev.z], [Bq[i + 1], z], [Bq[i], z]];
                    [[0, 1, 2], [0, 2, 3]].forEach(t => t.forEach(j => {
                        const p = quad[j];
                        bv.push(p[0][0], p[0][1], p[1]);
                        const lip = (q[0] === 'L' && i === 0) || (q[0] === 'R' && i === 1);
                        c.copy(lip ? lipA : stoneA).lerp(lip ? lipB : stoneB, k.noise(p[0][0] * 3.1 + 2, p[1] * 2.3));
                        bc.push(c.r, c.g, c.b);
                    }));
                });
            }
            prev = row;
        }
        const bg = k.geo(new T.BufferGeometry());
        bg.setAttribute('position', new T.Float32BufferAttribute(bv, 3));
        bg.setAttribute('color', new T.Float32BufferAttribute(bc, 3));
        bg.computeVertexNormals();
        k.add(bg, k.vmat({ side: T.DoubleSide, rough: 0.95 }));

        // The water: a rippling ribbon that flows toward the camera.
        const rv = [], ru = [], ri = [];
        let row = 0;
        const ww = RX - (RX - TOE) * (0 - WL) / (0 - BED) + 0.06;
        for (let z = 70; z > -230; z -= (z > -30 ? 0.8 : 3)) {
            const rc = riverX(z);
            rv.push(rc - ww, WL, z, rc + ww, WL, z);
            ru.push(0, z / 3, 1, z / 3);
            if (row > 0) { const a = (row - 1) * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
            row++;
        }
        const rg = k.geo(new T.BufferGeometry());
        rg.setAttribute('position', new T.Float32BufferAttribute(rv, 3));
        rg.setAttribute('uv', new T.Float32BufferAttribute(ru, 2));
        rg.setIndex(ri);
        rg.computeVertexNormals();
        const flow = k.canvasTexture(64, 64, function (cv, w, h) {
            cv.fillStyle = '#3f9cc0'; cv.fillRect(0, 0, w, h);
            for (let i = 0; i < 30; i++) { cv.fillStyle = k.pick(['#79c6df', '#a6def0', '#348cb0', '#5ab4d4']); cv.fillRect(Math.floor(k.rand() * w), Math.floor(k.rand() * h), 2 + Math.floor(k.rand() * 2), 6 + Math.floor(k.rand() * 12)); }
        }, [1, 1]);
        k.add(rg, k.tmat(flow, { rough: 0.2, metal: 0.1, emissive: '#0d3a4a', emissiveIntensity: 0.4 }));

        // Rocks in the stream with little foam collars, reeds on the banks.
        const stream = [], foam = [];
        [[-0.35, P + 3.2, 0.42], [0.45, P + 6.5, 0.34], [-0.2, -P - 2.6, 0.38], [0.5, -P - 6, 0.46], [-0.4, -P - 11, 0.4], [0.3, P + 11, 0.36], [-0.5, -P - 17, 0.5]].forEach(r => {
            const z = cz + r[1], x = riverX(z) + r[0];
            stream.push({ x: x, y: WL + 0.05, z: z, s: r[2], sy: r[2] * 0.9, ry: k.range(0, 6), color: k.pick(['#8f857a', '#9d9284']) });
            foam.push({ x: x, y: WL + 0.02, z: z + r[2] * 0.9, sx: r[2] * 1.6, sy: 0.15, sz: r[2] * 1.3 });
        });
        k.instancedColors(k.rockGeo(1, 0.25, 11), { flat: true }, stream, { cast: true });
        const foamMat = k.mat('#ffffff', { transparent: true, opacity: 0.7, rough: 1, depthWrite: false });
        k.instanced(k.geo(new T.IcosahedronGeometry(1, 1)), foamMat, foam, { receive: false });
        const tuft = k.merge([
            { g: G.cone(0.06, 0.7, 3), y: 0.35, rz: 0.2, c: '#6f9a45' }, { g: G.cone(0.06, 0.8, 3), y: 0.4, rz: -0.15, x: 0.06, c: '#86ad52' },
            { g: G.cone(0.05, 0.55, 3), y: 0.27, rx: 0.3, z: 0.06, c: '#5e8a3c' }
        ]);
        const reeds = [];
        for (let z = 40; z > -70; z -= 0.5) {
            [-1, 1].forEach(sd => {
                if (k.rand() > 0.35) return;
                const t = k.rand(), x = riverX(z) + sd * (TOE + 0.05 + t * 0.45), y = BED + (0 - BED) * ((Math.abs(x - riverX(z)) - TOE) / (RX - TOE));
                if (Math.hypot(x - cx, z - cz) < P + 1.2 || y < WL - 0.1) return;
                reeds.push({ x: x, y: y, z: z, ry: k.range(0, 6), s: k.range(0.8, 1.3) });
            });
            [-1, 1].forEach(sd => {
                if (k.rand() > 0.18) return;
                const x = riverX(z) + sd * k.range(LIP, LIP + 2);
                if (k.free(x, z, 0.2, 0.1)) reeds.push({ x: x, y: 0, z: z, ry: k.range(0, 6), s: k.range(0.7, 1.1) });
            });
        }
        k.instanced(tuft, k.vmat(), reeds);

        // Saguaro cacti, barrel cacti, boulders and dry shrubs on the canyon floor.
        const sag = (two) => {
            const cc = '#5c9150', parts = [{ g: G.cyl(0.3, 0.34, 3.4, 8), y: 1.7, c: cc }, { g: G.sphere(0.3, 8, 5), y: 3.4, c: cc },
                { g: G.cyl(0.17, 0.17, 0.75, 7), x: 0.5, y: 1.5, rz: Math.PI / 2, c: cc }, { g: G.cyl(0.19, 0.19, 1.3, 7), x: 0.84, y: 2.1, c: cc }, { g: G.sphere(0.19, 7, 4), x: 0.84, y: 2.75, c: cc }];
            if (two) parts.push({ g: G.cyl(0.17, 0.17, 0.75, 7), x: -0.5, y: 2.1, rz: Math.PI / 2, c: cc }, { g: G.cyl(0.19, 0.19, 1.0, 7), x: -0.84, y: 2.55, c: cc }, { g: G.sphere(0.19, 7, 4), x: -0.84, y: 3.05, c: cc });
            return k.merge(parts);
        };
        const cact = [[], []];
        for (let i = 0, n = 0; i < 300 && n < 14 * k.detail + 5; i++) {
            const z = k.range(-60, 30), x = riverX(z) + (k.rand() < 0.5 ? -1 : 1) * k.range(4, floorW(z) + 1);
            if (!k.freeWide(x, z, 0.9, 3.5) || Math.abs(hh(x, z)) > 0.2) continue;
            cact[n++ % 2].push({ x: x, z: z, ry: k.range(0, 6.28), s: k.range(0.8, 1.25) });
        }
        k.instanced(sag(false), k.vmat(), cact[0], { cast: true });
        k.instanced(sag(true), k.vmat(), cact[1], { cast: true });
        const barrels = [];
        for (let i = 0; i < 26 * k.detail; i++) {
            const z = k.range(-40, 24), x = riverX(z) + (k.rand() < 0.5 ? -1 : 1) * k.range(LIP + 0.4, floorW(z));
            if (k.free(x, z, 0.4, 0.5) && Math.abs(hh(x, z)) < 0.2) barrels.push({ x: x, y: 0.2, z: z, s: k.range(0.6, 1.1), ry: k.range(0, 6) });
        }
        k.instanced(k.merge([{ g: G.ball(0.32, 1), sy: 0.85, c: '#5f944c' }, { g: G.ball(0.08, 0), y: 0.28, c: '#ff7aa8' }, { g: G.ball(0.07, 0), x: 0.1, y: 0.26, c: '#ffd23f' }]), k.vmat(), barrels, { cast: true });
        const boulders = [];
        for (let i = 0; i < 40 * k.detail; i++) {
            const z = k.range(-90, 40), sd = k.rand() < 0.5 ? -1 : 1, x = riverX(z) + sd * (floorW(z) + k.range(-2.5, 1.5));
            if (k.freeWide(x, z, 1.2, 1.5)) boulders.push({ x: x, y: hh(x, z) + 0.2, z: z, s: k.range(0.5, 1.6), ry: k.range(0, 6), color: k.pick(['#b5653f', '#c98a5c', '#a75a3a']) });
        }
        k.instancedColors(k.rockGeo(1, 0.3, 9), { flat: true }, boulders, { cast: true });
        const shrubs = [];
        for (let i = 0; i < 40 * k.detail; i++) {
            const z = k.range(-50, 30), x = riverX(z) + (k.rand() < 0.5 ? -1 : 1) * k.range(LIP + 0.3, floorW(z) + 3);
            if (k.free(x, z, 0.3, 0.3)) shrubs.push({ x: x, y: hh(x, z) + 0.1, z: z, s: k.range(0.22, 0.42), sy: k.range(0.45, 0.7), color: k.pick(['#a39a5a', '#8d9450', '#b0a066']) });
        }
        k.instancedColors(k.geo(new T.IcosahedronGeometry(1, 0)), { flat: true }, shrubs);

        // A natural stone arch and two balanced-rock hoodoos.
        const archX = 18, archZ = -34;
        k.prop([
            { g: G.cyl(1.6, 2.4, 9, 7), x: -5, y: 4.5, c: '#bf6a40' }, { g: G.cyl(1.4, 2.2, 9, 7), x: 5, y: 4.5, c: '#b9643c' },
            { g: new T.TorusGeometry(5, 1.5, 7, 14, Math.PI), y: 8.6, c: '#c8774a' },
            { g: G.box(3.4, 0.5, 3.2), x: -5, y: 0.25, c: '#a85a37' }, { g: G.box(3.0, 0.5, 3.0), x: 5, y: 0.25, c: '#a85a37' }
        ], { x: archX, y: hh(archX, archZ) - 0.3, z: archZ, ry: -0.5, cast: true });
        const hoodoo = k.merge([
            { g: G.cyl(0.9, 1.4, 3.2, 7), y: 1.6, c: '#c47a4c' }, { g: G.cyl(0.7, 0.95, 2.6, 7), y: 4.4, c: '#d9925c' },
            { g: G.cyl(0.45, 0.7, 1.8, 7), y: 6.6, c: '#c47a4c' }, { g: G.ball(1.3, 1), y: 8.1, sy: 0.6, c: '#9a5034' }
        ]);
        k.instanced(hoodoo, k.vmat(), [{ x: -17, z: -26 }, { x: -21, z: -21, s: 0.7, ry: 1 }].filter(p => k.freeWide(p.x, p.z, 1.5, 8)).map(p => Object.assign(p, { y: hh(p.x, p.z) - 0.1 })), { cast: true });

        // A tumbleweed bowls across the floor now and then, behind the plot.
        const twParts = [{ g: G.ball(0.42, 1), c: '#b8995e' }];
        for (let i = 0; i < 7; i++) twParts.push({ g: G.box(1.05, 0.05, 0.05), rx: i * 0.9, ry: i * 1.3, rz: i * 0.7, c: '#a8874f' });
        const tumble = k.prop(twParts, { y: 0.5, z: -(P + 6), cast: true });

        const clouds = k.cloudBank(6, { z0: -160, z1: -70, y0: 30, y1: 40, s0: 2.6, s1: 4.2 });
        const hawks = k.flock({ cx: 0, cy: 22, cz: -24, count: 3, radius: 12, speed: 0.16 });
        return {
            update: function (dt, t) {
                flow.offset.y = -t * 0.22;
                foamMat.opacity = 0.55 + 0.15 * Math.sin(t * 2.1);
                // The tumbleweed hops over the river on its way across.
                const u = (t % 36) / 36, x = -40 + u * 80, over = 1 - k.smooth(RX, LIP + 1, Math.abs(x));
                tumble.position.set(x, 0.42 + Math.abs(Math.sin(t * 2.4)) * 0.35 + over * 1.0, -(P + 6) + Math.sin(t * 0.3) * 1.5);
                tumble.rotation.z = -x / 0.45;
                tumble.visible = u < 0.98;
                clouds.update(dt); hawks.update(dt, t);
            }
        };
    }
});

// =====================================================================================
// Alien Planet - Robot. Rusty red dust, craters and rock spires, a landed lander,
// habitat domes with glowing windows, a pottering rover, dishes and glowing crystals.
// A ringed planet and two moons hang in an indigo sky. Low gravity: pieces float down.
// =====================================================================================
BNB.Worlds.register('planet', {
    name: 'Alien Planet',
    sky: ['#0a0720', '#3e2252', '#f0a184'],
    fog: { color: '#f0a184', near: 40, far: 210 },
    light: { sky: '#f6cbb8', ground: '#6e3420', hemi: 1.1, sun: '#ffe6d2', sunIntensity: 2.7, dir: [-0.6, 0.78, 0.45] },
    dust: '#c8734a',
    gravity: 11,   // low gravity: knocked pieces drift down (half of Earth-like 22), but mostly land in view
    build: function (k) {
        const T = k.THREE, G = k.G, P = k.plot;
        const cx = k.view.center.x, cz = k.view.center.z;
        const CR = [[-34, -40, 11, 2.2], [30, -54, 15, 2.8], [-62, -18, 9, 1.8], [56, -12, 8, 1.6], [-12, -80, 18, 3.2], [72, -92, 22, 3.5], [-26, 30, 8, 1.5], [36, 22, 7, 1.3]];
        function crater(x, z) {
            let h = 0;
            CR.forEach(c => { const d = Math.hypot(x - c[0], z - c[1]) / c[2]; if (d < 1.7) h += (d < 1 ? -c[3] * (1 - d * d) : 0) + c[3] * 0.55 * Math.exp(-Math.pow((d - 1) / 0.22, 2)); });
            return h;
        }
        function hh(x, z) {
            const r = Math.hypot(x - cx, z - cz);
            let h = k.smooth(P + 8, P + 24, r) * (k.fbm(x * 0.03, z * 0.03, 4) - 0.42) * 5;
            h += crater(x, z);
            h += k.smooth(0.56, 0.62, k.fbm(x * 0.012 - 7, z * 0.012 + 3, 3)) * k.smooth(80, 120, r) * 30;
            return h;
        }
        const base = new T.Color('#b9592f'), light = new T.Color('#d47c49'), dark = new T.Color('#8a3b20'), dust = new T.Color('#e09a6c');
        k.terrain({
            R: 240, segs: 104, warp: 1.75, height: hh, color: function (x, z, y, out) {
                out.copy(base).lerp(light, k.noise(x * 0.18, z * 0.18) * 0.7).lerp(dust, k.smooth(0.55, 0.8, k.fbm(x * 0.05 + 3, z * 0.05, 2)) * 0.6);
                out.lerp(dark, k.smooth(-0.3, -2.5, crater(x, z)) * 0.6 + k.smooth(3, 20, y) * 0.35);
            }
        });
        // The landing pad: smooth dark regolith, an orange rim and soft blue guide lights.
        k.plotPatch('#a04d2b', { rim: '#e08a52', extra: 0.4, rimWidth: 0.25 });
        const guide = [], NG = Math.round((P + 1.0) * 2 * Math.PI / 1.6);
        for (let i = 0; i < NG; i++) { const a = i / NG * Math.PI * 2; guide.push({ x: cx + Math.cos(a) * (P + 0.95), y: 0.05, z: cz + Math.sin(a) * (P + 0.95) }); }
        k.instanced(k.geo(new T.CylinderGeometry(0.09, 0.11, 0.1, 8)), k.basic('#7fe0ff'), guide);

        // Scattered rocks and pebbles.
        const rocks = [];
        for (let i = 0; i < 70 * k.detail; i++) {
            const a = k.range(0, 6.28), d = k.range(P + 1.5, 50), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
            const big = d > 14 && k.rand() < 0.35;
            if (!k.freeWide(x, z, big ? 1.2 : 0.3, big ? 1.4 : 0.3)) continue;
            rocks.push({ x: x, y: hh(x, z) + 0.05, z: z, s: big ? k.range(0.7, 1.6) : k.range(0.15, 0.4), ry: k.range(0, 6), color: k.pick(['#7a3520', '#9a4a2a', '#5e2a1c']) });
        }
        k.instancedColors(k.rockGeo(1, 0.32, 13), { flat: true }, rocks, { cast: true });
        // Tall rock spires off in the dust.
        const spire = k.merge([
            { g: G.cyl(1.2, 2.0, 5, 7), y: 2.5, c: '#9a4528' }, { g: G.cyl(0.8, 1.25, 5, 7), y: 7.4, ry: 0.4, c: '#b25632' },
            { g: G.cyl(0.4, 0.85, 4, 7), y: 11.8, ry: 0.9, c: '#9a4528' }, { g: G.ball(0.9, 0), y: 14, sy: 0.7, c: '#7a3520' }
        ]);
        const spires = [[-30, -24, 1.2], [-40, -30, 0.8], [34, -36, 1.4], [42, -28, 0.9], [-6, -62, 1.6], [12, -70, 1.1]].filter(s => k.freeWide(s[0], s[1], 2, 14));
        k.instanced(spire, k.vmat(), spires.map(s => ({ x: s[0], y: hh(s[0], s[1]) - 0.3, z: s[1], s: s[2], ry: s[0] })), { cast: true });

        // Glowing crystal clusters, cyan and violet.
        const cluster = k.merge([[0, 0, 1.2, 0, 0], [0.35, 0.1, 0.8, 0.4, 0.2], [-0.3, -0.15, 0.9, -0.35, 0.1], [0.1, -0.35, 0.65, 0.1, -0.4], [-0.2, 0.3, 0.55, -0.2, 0.35]].map(c => ({
            g: G.cone(0.22, 1, 5), x: c[0], y: c[2] * 0.5, z: c[1], sy: c[2], rx: c[4], rz: -c[3]
        })));
        const crys = [[], []];
        k.spots(Math.round(12 * k.detail) + 5, P + 2.5, 34, 1.2, 1.8).forEach((p, i) => crys[i % 2].push({ x: p.x, y: hh(p.x, p.z) - 0.05, z: p.z, s: k.range(1.0, 1.9), ry: k.range(0, 6) }));
        const crysA = k.mat('#8ff0ff', { flat: true, rough: 0.25, emissive: '#2bb8d8', emissiveIntensity: 0.7 });
        const crysB = k.mat('#d6a2ff', { flat: true, rough: 0.25, emissive: '#8a4ad8', emissiveIntensity: 0.7 });
        k.instanced(cluster, crysA, crys[0], { cast: true });
        k.instanced(cluster, crysB, crys[1], { cast: true });

        // The lander, back left: legs, a gold-foil skirt, a ring of glowing windows all round.
        const LX = cx - 6.5, LZ = cz - 15.5, ly = hh(LX, LZ);
        const scorch = k.geo(new T.CircleGeometry(3.2, 24)); scorch.rotateX(-Math.PI / 2);
        k.add(scorch, k.mat('#6a2d1a', { rough: 1 }), { x: LX, y: ly + 0.02, z: LZ });
        const lander = [
            { g: G.cyl(1.4, 1.4, 1.5, 10), y: 2.35, c: '#e3e7ec' }, { g: G.cyl(1.44, 1.44, 0.42, 10), y: 2.5, c: '#3a4150' },
            { g: G.cyl(1.6, 1.45, 0.35, 10), y: 1.45, c: '#d9a441' }, { g: G.cone(1.42, 1.0, 10), y: 3.6, c: '#f2f4f6' },
            { g: G.cyl(0.45, 0.8, 0.6, 10), y: 1.0, c: '#3a3f48' }, { g: G.cyl(0.05, 0.05, 1.4, 5), y: 4.6, c: '#c9ced4' },
            { g: G.ball(0.1, 0), y: 5.3, c: '#ff5a4a' }, { g: G.box(0.7, 0.9, 0.08), y: 2.2, z: 1.4, c: '#9aa3ad' }
        ];
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
            lander.push({ g: G.box(0.14, 2.2, 0.14), x: ca * 1.75, y: 1.0, z: sa * 1.75, rx: sa * 0.42, rz: -ca * 0.42, c: '#c9ced4' });
            lander.push({ g: G.cyl(0.38, 0.42, 0.12, 10), x: ca * 2.2, y: 0.06, z: sa * 2.2, c: '#9aa3ad' });
        }
        k.prop(lander, { x: LX, y: ly, z: LZ, ry: 0.6, cast: true });
        const panes = [];
        for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10 * Math.PI * 2; panes.push({ g: G.box(0.52, 0.28, 0.04), x: Math.sin(a) * 1.45, y: 2.5, z: Math.cos(a) * 1.45, ry: a, c: '#9fe8ff' }); }
        k.add(k.merge(panes), k.basic('#ffffff', { vertexColors: true }), { x: LX, y: ly, z: LZ, ry: 0.6 });

        // The base, back right: three domes joined by tubes, glowing windows, solar panels.
        const domes = [[cx + 13, cz - 15, 3.3], [cx + 19.5, cz - 10, 2.3], [cx + 19, cz - 21, 2.6]];
        const habitat = [], win = [];
        domes.forEach((d, di) => {
            const y = hh(d[0], d[1]) - 0.05, r = d[2];
            habitat.push({ g: new T.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), x: d[0], y: y + 0.35, z: d[1], c: '#eef0f2' });
            habitat.push({ g: G.cyl(r + 0.12, r + 0.2, 0.4, 18), x: d[0], y: y + 0.18, z: d[1], c: '#8f97a3' });
            habitat.push({ g: G.cyl(0.35, 0.35, 0.3, 10), x: d[0], y: y + 0.35 + r, z: d[1], c: '#9aa3ad' });
            for (let i = 0; i < 8; i++) {
                const a = i / 8 * Math.PI * 2 + di, e = 0.42, rr = r * Math.cos(e) + 0.02;
                win.push({ g: G.box(0.5, 0.36, 0.05), x: d[0] + Math.sin(a) * rr, y: y + 0.35 + r * Math.sin(e), z: d[1] + Math.cos(a) * rr, ry: a, rx: -e, order: 'YXZ', c: '#ffd890' });
            }
            habitat.push({ g: G.box(1.0, 1.3, 1.2), x: d[0] + Math.sin(-0.9) * r, y: y + 0.65, z: d[1] + Math.cos(-0.9) * r, ry: -0.9, c: '#d9dde2' });
        });
        const tube = (a, b) => {
            const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), y = (hh(a[0], a[1]) + hh(b[0], b[1])) / 2 + 0.75;
            habitat.push({ g: G.cyl(0.5, 0.5, L, 10), x: (a[0] + b[0]) / 2, y: y, z: (a[1] + b[1]) / 2, rx: Math.PI / 2, ry: Math.atan2(dx, dz), order: 'YXZ', c: '#cfd4da' });
            for (let s = 1; s < 4; s++) habitat.push({ g: G.cyl(0.56, 0.56, 0.12, 10), x: a[0] + dx * s / 4, y: y, z: a[1] + dz * s / 4, rx: Math.PI / 2, ry: Math.atan2(dx, dz), order: 'YXZ', c: '#9aa3ad' });
        };
        tube(domes[0], domes[1]); tube(domes[0], domes[2]);
        k.prop(habitat, { cast: true }, { rough: 0.6 });
        k.add(k.merge(win), k.basic('#ffffff', { vertexColors: true }));
        const beaconMat = k.basic('#ff4a3a');
        k.add(k.geo(new T.IcosahedronGeometry(0.18, 1)), beaconMat, { x: domes[0][0], y: hh(domes[0][0], domes[0][1]) + 0.35 + domes[0][2] + 0.3, z: domes[0][1] });
        const panel = k.merge([{ g: G.cyl(0.06, 0.06, 1.0, 5), y: 0.5, c: '#8f97a3' }, { g: G.box(1.7, 0.06, 1.1), y: 1.05, rx: -0.5, c: '#2c4f9a' }, { g: G.box(1.76, 0.04, 0.06), y: 1.06, z: 0.53, rx: -0.5, c: '#c9ced4' }]);
        const panels = [];
        for (let i = 0; i < 6; i++) { const x = cx + 23 + (i % 3) * 2.0, z = cz - 15 + Math.floor(i / 3) * 1.8; if (k.freeWide(x, z, 1, 1.4)) panels.push({ x: x, y: hh(x, z), z: z, ry: 0.5 }); }
        k.instanced(panel, k.vmat({ rough: 0.35, metal: 0.3 }), panels, { cast: true });

        // Two antenna dishes slowly sweeping the sky.
        const dishes = [];
        [[cx - 18, cz - 21, 1.0], [cx + 27, cz - 32, 0.8]].forEach(d => {
            if (!k.freeWide(d[0], d[1], 2, 5)) return;
            const y = hh(d[0], d[1]);
            k.prop([
                ...[0, 1, 2].map(i => ({ g: G.box(0.12, 2.4, 0.12), x: Math.cos(i * 2.09) * 0.6, y: 1.1, z: Math.sin(i * 2.09) * 0.6, rx: Math.sin(i * 2.09) * 0.25, rz: -Math.cos(i * 2.09) * 0.25, c: '#9aa3ad' })),
                { g: G.cyl(0.25, 0.3, 0.5, 8), y: 2.3, c: '#c9ced4' }
            ], { x: d[0], y: y, z: d[1], s: d[2], cast: true });
            const head = k.prop([
                { g: new T.SphereGeometry(1.8, 16, 5, 0, Math.PI * 2, 0, 0.75), y: 0, rx: Math.PI, c: '#eef0f2' },
                { g: G.cyl(0.04, 0.04, 1.4, 5), y: 0.75, c: '#c9ced4' }, { g: G.ball(0.14, 0), y: 1.45, c: '#ff5a4a' },
                { g: G.box(0.4, 0.4, 0.4), y: -0.35, c: '#8f97a3' }
            ], { x: d[0], y: y + 2.8 * d[2], z: d[1], s: d[2], cast: true }, { side: T.DoubleSide });
            head.rotation.order = 'YXZ';
            head.rotation.x = -0.6;
            dishes.push({ m: head, ph: d[0] });
        });

        // A little six-wheeled rover pottering about, leaving tracks.
        const rover = k.prop([
            { g: G.box(1.3, 0.45, 1.9), y: 0.75, c: '#eef0f2' }, { g: G.box(1.6, 0.06, 2.1), y: 1.02, c: '#2c4f9a' },
            { g: G.box(1.32, 0.12, 1.92), y: 0.56, c: '#f28c28' },
            { g: G.cyl(0.05, 0.05, 1.0, 5), x: 0.4, y: 1.5, z: 0.7, c: '#c9ced4' }, { g: G.box(0.36, 0.22, 0.22), x: 0.4, y: 2.05, z: 0.7, c: '#e3e7ec' },
            { g: G.box(0.2, 0.1, 0.04), x: 0.4, y: 2.05, z: 0.82, c: '#3a4150' },
            ...[-0.75, 0, 0.75].flatMap(z => [-0.78, 0.78].map(x => ({ g: G.cyl(0.3, 0.3, 0.24, 10), x: x, y: 0.3, z: z, rz: Math.PI / 2, c: '#3a3f48' })))
        ], { cast: true });
        const RC = { x: cx + 11, z: cz - 2.5, a: 4.2, b: 2.4 };
        const tracks = [];
        for (let i = 0; i < 90; i++) {
            const a = i / 90 * Math.PI * 2, x = RC.x + Math.cos(a) * RC.a, z = RC.z + Math.sin(a) * RC.b, ry = Math.atan2(-Math.sin(a) * RC.a, Math.cos(a) * RC.b);
            [-0.78, 0.78].forEach(o => tracks.push({ x: x + Math.cos(ry) * o, y: hh(x, z) + 0.012, z: z - Math.sin(ry) * o, ry: ry }));
        }
        k.instanced(k.geo(new T.BoxGeometry(0.24, 0.01, 0.22)), k.mat('#7e3720', { rough: 1 }), tracks.filter(t => Math.hypot(t.x - cx, t.z - cz) > P + 0.9));

        // The sky: stars, a big ringed planet and two moons (beyond the fog).
        k.stars({ count: Math.round(700 * k.detail) + 200, radius: 330, size: 1.6, minY: 0.12, colors: ['#ffffff', '#ffe9d6', '#d6e4ff'] });
        const bandTex = k.canvasTexture(16, 128, function (c, w, h) {
            const cols = ['#e9c49a', '#d79a6a', '#f1dcb8', '#c7845a', '#e8b98a', '#9fb5b8', '#efd3a8', '#cf8f62'];
            for (let y = 0; y < h; y += 8) { c.fillStyle = cols[(y / 8) % cols.length]; c.fillRect(0, y, w, 8 + (y % 3)); }
        });
        const planetMat = k.tmat(bandTex, { rough: 0.9, emissive: '#3a1e2e', emissiveIntensity: 0.6 });
        planetMat.fog = false;
        const PL = new T.Vector3(55, 40, -250);
        const planet = k.add(k.geo(new T.SphereGeometry(58, 40, 24)), planetMat, { x: PL.x, y: PL.y, z: PL.z, rz: 0.35, receive: false });
        const ringTex = k.canvasTexture(128, 128, function (c, w, h) {
            const cols = ['rgba(240,214,176,0.85)', 'rgba(214,170,128,0.6)', 'rgba(250,230,200,0.9)', 'rgba(190,150,120,0.35)', 'rgba(236,206,170,0.75)'];
            for (let r = 64; r > 40; r -= 3) { c.fillStyle = cols[r % cols.length]; c.beginPath(); c.arc(64, 64, r, 0, Math.PI * 2); c.arc(64, 64, r - 3, 0, Math.PI * 2, true); c.fill(); }
        });
        const ringMat = k.tmat(ringTex, { transparent: true, side: T.DoubleSide, rough: 1, depthWrite: false, emissive: '#3a2a22', emissiveIntensity: 0.5 });
        ringMat.fog = false;
        k.add(k.geo(new T.RingGeometry(72, 112, 64)), ringMat, { x: PL.x, y: PL.y, z: PL.z, rx: -1.12, ry: 0.15, rz: 0.3, receive: false });
        const moonMat = k.mat('#c9c2d6', { flat: true, rough: 1, fog: false, emissive: '#2a2438', emissiveIntensity: 0.6 });
        const moonMat2 = k.mat('#e8d8b8', { flat: true, rough: 1, fog: false, emissive: '#3a2e22', emissiveIntensity: 0.6 });
        const cratered = function (a, b) {
            const ca = new T.Color(a), cb = new T.Color(b);
            return k.merge([{ g: G.ball(1, 2), cf: function (v, out) { const n = k.noise(v.x * 3 + 5, v.y * 3 + v.z * 2); out.copy(ca).lerp(cb, k.smooth(0.55, 0.7, n)); } }]);
        };
        moonMat.vertexColors = true; moonMat2.vertexColors = true;
        const moonA = k.add(cratered('#ffffff', '#9a93b0'), moonMat, { x: 150, y: 55, z: -200, s: 12, receive: false });
        const moonB = k.add(cratered('#ffffff', '#b8a07a'), moonMat2, { x: -40, y: 72, z: -220, s: 6, receive: false });

        return {
            update: function (dt, t) {
                const x = RC.x + Math.cos(t * 0.09) * RC.a, z = RC.z + Math.sin(t * 0.09) * RC.b;
                rover.position.set(x, hh(x, z), z);
                rover.rotation.y = Math.atan2(-Math.sin(t * 0.09) * RC.a, Math.cos(t * 0.09) * RC.b);
                dishes.forEach(d => { d.m.rotation.y = d.ph + Math.sin(t * 0.08 + d.ph) * 1.2; });
                beaconMat.color.setRGB(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.5)), 0.2, 0.15);
                const g = 0.6 + 0.2 * Math.sin(t * 0.9);
                crysA.emissiveIntensity = g; crysB.emissiveIntensity = 1.2 - g;
                planet.rotation.y = t * 0.01;
                moonA.position.set(150 + Math.sin(t * 0.01) * 14, 55 + Math.sin(t * 0.013) * 3, -200);
                moonB.rotation.y = t * 0.02;
            }
        };
    }
});

// =====================================================================================
// Beach Cove - Pirate Ship. A sandy beach in a sheltered cove: turquoise water,
// rocky headlands, palms, a little dock and a treasure chest. Rubble rolling past the
// waterline splashes into the sea.
// =====================================================================================
BNB.Worlds.register('cove', {
    name: 'Beach Cove',
    sky: ['#2a86d8', '#7ec6ef', '#e6f6f6'],
    fog: { color: '#e6f6f6', near: 40, far: 210 },
    light: { sky: '#e9f6ff', ground: '#d8c08a', hemi: 1.2, sun: '#fff0d2', sunIntensity: 2.8, dir: [-0.5, 1, 0.5] },
    dust: '#e8d3a0',
    ground: [{ half: [45, 1, 40], pos: [0, -1, -12.5 + 40] }],
    water: -0.45,
    build: function (k) {
        const T = k.THREE, G = k.G, P = k.plot, cxp = k.view.center.x, czp = k.view.center.z;
        const SHORE = -12.5, SEA = -0.45;
        const shoreAt = x => SHORE - 3 * Math.sin(x * 0.07 + 1) * k.smooth(10, 30, Math.abs(x));
        const inL = z => -26 + Math.max(0, -z - 26) * 0.4, inR = z => 27 - Math.max(0, -z - 26) * 0.38;
        function cliff(x, z) {
            const end = k.smooth(-98, -82, z);
            return Math.max(k.smooth(0, 7, inL(z) - x), k.smooth(0, 7, x - inR(z))) * end;
        }
        function hh(x, z) {
            const s = shoreAt(x);
            let h = z > s ? 0 : -2.4 * k.smooth(0, 9, s - z);
            h += k.smooth(15, 25, Math.abs(x)) * k.smooth(SHORE + 2, SHORE + 9, z) * (0.8 + 1.6 * k.fbm(x * 0.08, z * 0.08, 2));
            const m = cliff(x, z);
            if (m > 0) h = Math.max(h, m * (6 + 10 * k.fbm(x * 0.04, z * 0.04, 3)) - (1 - m) * 2.4);
            return h;
        }
        const sandC = new T.Color('#f0dba8'), sand2 = new T.Color('#f7e7bf'), wet = new T.Color('#d6bd86'), grassC = new T.Color('#8fbf5a'), rockC = new T.Color('#9a8e80'), rock2 = new T.Color('#b4a28a');
        k.terrain({
            R: 240, segs: 104, warp: 1.75, height: hh, color: function (x, z, y, out) {
                out.copy(sandC).lerp(sand2, k.noise(x * 0.2, z * 0.2) * 0.7);
                const s = shoreAt(x);
                out.lerp(wet, (1 - k.smooth(0, 2.5, z - s)) * 0.8);
                if (y > 0.9) out.lerp(grassC, k.smooth(0.9, 2.2, y) * 0.75);
                const m = cliff(x, z);
                if (m > 0.05) { out.lerp(rockC, m).lerp(rock2, k.noise(y * 0.6, x * 0.1) * 0.5 * m); if (y > 5 && m > 0.95) out.lerp(grassC, k.smooth(5, 8, y) * 0.8); }
            }
        });
        const sea = k.sea({
            y: SEA, near: '#36bfc8', far: '#2a7db8', fade: 90, amp: 0.1, animR: 55,
            tint: function (x, z, out) { const d = shoreAt(x) - z; out.lerp(k.color('#6fe0d6'), (1 - k.smooth(0, 7, d)) * 0.6); }
        });
        k.plotPatch('#f6e3b4', { rim: '#e4cc94', extra: 0.4, rimWidth: 0.3 });
        // Foam sliding up and down the waterline.
        const foam = k.add(k.geo(new T.BoxGeometry(70, 0.02, 0.9)), k.mat('#ffffff', { transparent: true, opacity: 0.6, rough: 1, depthWrite: false }), { y: SEA + 0.08, z: SHORE - 0.2, receive: false });

        // Palms leaning out over the sand.
        const palms = [k.palmGeo(0.45), k.palmGeo(0.8, 4.3), k.palmGeo(0.2, 5.3)], pl = [[], [], []];
        const pspots = [[-15, -6], [-18, -1], [-12.5, -10], [16, -4], [19.5, 1], [14, -10], [-21, 6], [22, 7], [-30, -40], [33, -46], [-34, -22]];
        pspots.forEach((s, i) => { if (k.freeWide(s[0], s[1], 1, 5)) pl[i % 3].push({ x: s[0], y: hh(s[0], s[1]) - 0.1, z: s[1], ry: s[0] < 0 ? k.range(-0.9, -0.3) : k.range(3.4, 4.0), s: k.range(0.95, 1.3) }); });
        palms.forEach((g, i) => k.instanced(g, k.vmat({ side: T.DoubleSide }), pl[i], { cast: true }));

        // Rocks along the cliff feet and sea stacks out in the bay.
        const rocks = [];
        [[-22, -9, 1.8], [-24, -15, 2.4], [24, -12, 2.0], [26, -20, 2.6], [-17, -28, 2.6], [21, -36, 3.2], [-8, -58, 3.6], [12, -66, 2.8], [-26, -46, 2.2], [9, -40, 1.6], [-13, -12.5, 0.7], [17, -13, 0.9]].forEach(r => {
            if (k.freeWide(r[0], r[1], r[2], r[2])) rocks.push({ x: r[0], y: Math.max(SEA - 0.5, hh(r[0], r[1])) + r[2] * 0.3, z: r[1], s: r[2], sy: r[2] * k.range(0.9, 1.4), ry: k.range(0, 6), color: k.pick(['#8f857a', '#9d9284', '#80776d']) });
        });
        k.instancedColors(k.rockGeo(1, 0.3, 4), { flat: true }, rocks, { cast: true });

        // A little wooden dock with a rowboat tied up.
        const DX = 11.5, d0 = SHORE + 5, d1 = SHORE - 13, dock = [];
        for (let z = d0; z > d1; z -= 0.42) dock.push({ g: G.box(2.4, 0.1, 0.36), x: DX, y: 0.32, z: z, c: k.pick(['#b58a5a', '#a87d50', '#bd9363']) });
        for (let z = d0 - 0.3; z > d1; z -= 2.6) [-1.1, 1.1].forEach(o => dock.push({ g: G.cyl(0.12, 0.12, 3.2, 6), x: DX + o, y: -1.3, z: z, c: '#7a5434' }));
        [-1.1, 1.1].forEach(o => dock.push({ g: G.cyl(0.12, 0.12, 1.0, 6), x: DX + o, y: 0.75, z: d1 + 0.3, c: '#7a5434' }));
        k.prop(dock, { cast: true });
        const boat = k.prop([
            { g: G.slab([[-1.5, -0.55], [0.9, -0.6], [1.6, 0], [0.9, 0.6], [-1.5, 0.55]], 0.55), y: -0.25, c: '#d9432f' },
            { g: G.slab([[-1.35, -0.42], [0.8, -0.45], [1.35, 0], [0.8, 0.45], [-1.35, 0.42]], 0.05), y: 0.05, c: '#8a5a33' },
            { g: G.box(0.2, 0.06, 1.0), x: -0.2, y: 0.25, c: '#c99a63' },
            { g: G.box(1.8, 0.05, 0.08), x: 0.1, y: 0.33, z: 0.2, ry: 0.2, c: '#c99a63' }
        ], { x: DX + 2.6, y: SEA, z: d1 + 2.2, ry: 1.45, cast: true });

        // A treasure chest, open, spilling gold.
        const chest = { x: cxp - P - 0.6, z: czp - P - 4.2 };
        k.prop([
            { g: G.box(1.3, 0.75, 0.85), y: 0.37, c: '#8a5a33' },
            { g: G.box(1.34, 0.12, 0.89), y: 0.3, c: '#d9a93a' }, { g: G.box(0.12, 0.78, 0.89), x: -0.45, y: 0.39, c: '#d9a93a' }, { g: G.box(0.12, 0.78, 0.89), x: 0.45, y: 0.39, c: '#d9a93a' },
            { g: G.prism([[-0.425, 0], [0.425, 0], [0.3, 0.28], [0, 0.36], [-0.3, 0.28]], 1.3), x: 0, y: 0.75, z: -0.45, ry: Math.PI / 2, rx: -1.15, order: 'YXZ', c: '#9a6a3d' }
        ], { x: chest.x, z: chest.z, ry: 0.5, cast: true });
        const gold = [{ g: G.ball(0.42, 1), y: 0.68, sy: 0.45, sx: 1.2, c: '#f0c33c' }];
        for (let i = 0; i < 9; i++) gold.push({ g: G.cyl(0.11, 0.11, 0.03, 10), x: k.range(-1.4, 1.4), y: 0.02, z: k.range(0.5, 1.4), rx: k.range(-0.2, 0.2), c: '#f2c84a' });
        gold.push({ g: G.ball(0.12, 0), x: 0.25, y: 0.86, z: 0.1, c: '#e2453c' }, { g: G.ball(0.1, 0), x: -0.2, y: 0.84, z: -0.05, c: '#5fbdf0' });
        k.prop(gold, { x: chest.x, z: chest.z, ry: 0.5 }, { metal: 0.6, rough: 0.3, emissive: '#5a3c00', emissiveIntensity: 0.5 });

        // A sandcastle, shells and starfish near the front.
        k.prop([
            { g: G.box(1.2, 0.35, 1.2), y: 0.17, c: '#e8cf96' },
            ...[[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(p => ({ g: G.cyl(0.2, 0.24, 0.6, 8), x: p[0], y: 0.3, z: p[1], c: '#e3c88c' })),
            ...[[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(p => ({ g: G.cone(0.24, 0.28, 8), x: p[0], y: 0.74, z: p[1], c: '#dcc084' })),
            { g: G.cyl(0.3, 0.34, 0.5, 8), y: 0.6, c: '#e8cf96' }, { g: G.cyl(0.015, 0.015, 0.5, 4), y: 1.05, c: '#7a5434' }, { g: G.box(0.22, 0.13, 0.01), x: 0.11, y: 1.22, c: '#e2453c' }
        ], { x: P + 3.4, z: 2.6, ry: -0.4, cast: true });
        const star = k.merge([0, 1, 2, 3, 4].map(i => ({ g: G.cone(0.07, 0.3, 4), x: Math.cos(i * 1.2566) * 0.13, y: 0.03, z: Math.sin(i * 1.2566) * 0.13, rx: Math.PI / 2, rz: 0, ry: -i * 1.2566 + Math.PI / 2, sy: 1, order: 'YXZ' })));
        const shellG = k.geo(new T.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2));
        const stars = [], shells = [];
        for (let i = 0; i < 40 * k.detail; i++) {
            const x = k.range(-18, 18), z = k.range(SHORE + 0.5, 14);
            if (!k.free(x, z, 0.2, 0.1)) continue;
            if (i % 3 === 0) stars.push({ x: x, y: 0.01, z: z, ry: k.range(0, 6), s: k.range(0.8, 1.3), color: k.pick(['#ff8a5c', '#ff6f91', '#ffb347']) });
            else shells.push({ x: x, y: 0, z: z, ry: k.range(0, 6), sy: 0.6, s: k.range(0.7, 1.3), color: k.pick(['#fff3e8', '#ffd9c7', '#f7e1b5']) });
        }
        k.instancedColors(star, { flat: true }, stars);
        k.instancedColors(shellG, { flat: true, rough: 0.5 }, shells);
        // Beach grass on the dunes.
        const tuft = k.merge([
            { g: G.cone(0.06, 0.6, 3), y: 0.3, rz: 0.25, c: '#9cba5a' }, { g: G.cone(0.06, 0.7, 3), y: 0.35, rz: -0.2, x: 0.06, c: '#b2c96a' },
            { g: G.cone(0.05, 0.5, 3), y: 0.25, rx: 0.35, z: 0.06, c: '#8aa94c' }
        ]);
        const grass = [];
        for (let i = 0; i < 160 * k.detail; i++) {
            const x = (k.rand() < 0.5 ? -1 : 1) * k.range(14, 34), z = k.range(SHORE + 2, 30), y = hh(x, z);
            if (y > 0.4 && cliff(x, z) < 0.2 && k.free(x, z, 0.3, 0.3)) grass.push({ x: x, y: y - 0.05, z: z, ry: k.range(0, 6), s: k.range(0.8, 1.4) });
        }
        k.instanced(tuft, k.vmat(), grass);

        // A crab scuttling along the waterline.
        const crab = k.prop([
            { g: G.ball(0.22, 1), y: 0.14, sy: 0.55, sx: 1.25, c: '#e2453c' },
            { g: G.ball(0.09, 0), x: 0.3, y: 0.14, z: 0.15, c: '#e2453c' }, { g: G.ball(0.09, 0), x: -0.3, y: 0.14, z: 0.15, c: '#e2453c' },
            { g: G.ball(0.035, 0), x: 0.08, y: 0.27, z: 0.13, c: '#2b2b2b' }, { g: G.ball(0.035, 0), x: -0.08, y: 0.27, z: 0.13, c: '#2b2b2b' },
            ...[-0.18, 0, 0.18].map(o => ({ g: G.box(0.6, 0.03, 0.04), x: 0, y: 0.06, z: o * 0.6, c: '#c8352d' }))
        ], { x: 8, z: SHORE + 1.2, s: 1.3, cast: true });

        // Far off: an island through the mouth of the cove, a sailboat, gulls.
        k.prop([{ g: G.ball(1, 1), y: -1.5, sx: 16, sy: 5, sz: 9, c: '#d9c58f' }, { g: G.ball(1, 1), y: 0, sx: 10, sy: 6, sz: 6, c: '#5f9a4a' }], { x: 4, y: SEA, z: -150, receive: false });
        k.instanced(palms[0], k.vmat({ side: T.DoubleSide }), [{ x: -2, y: 3, z: -148, s: 2.2 }, { x: 6, y: 4, z: -151, s: 2.4, ry: 2 }, { x: 10, y: 2, z: -146, s: 2, ry: 4 }]);
        const sail = k.prop([
            { g: G.slab([[-2, -0.7], [1.6, -0.7], [2.4, 0], [1.6, 0.7], [-2, 0.7]], 0.8), y: -0.4, c: '#f4f4f0' },
            { g: G.cyl(0.07, 0.07, 5.2, 5), y: 2.9, c: '#8a6a4a' },
            { g: G.slab([[0, 0], [0, -0.04], [2.6, -0.02]], 4.4), x: 0.1, y: 0.7, rx: 0, c: '#ffffff' }
        ], { y: SEA, z: -105, s: 1.6 });
        const clouds = k.cloudBank(7, { z0: -170, z1: -80, y0: 20, y1: 32, s0: 2.6, s1: 4.2 });
        const gulls = k.flock({ cx: 0, cy: 10, cz: -14, count: Math.round(4 * k.detail) + 3, radius: 13, color: '#f7f7f4', speed: 0.2 });
        return {
            update: function (dt, t) {
                sea.update(t);
                const sw = Math.sin(t * 0.7);
                foam.position.z = SHORE - 0.25 + sw * 0.35; foam.material.opacity = 0.35 + 0.3 * (0.5 + 0.5 * sw);
                boat.position.y = SEA + Math.sin(t * 1.1) * 0.06; boat.rotation.z = Math.sin(t * 0.9) * 0.05;
                const ph = (t % 14) / 14, go = ph < 0.5 ? ph * 2 : 2 - ph * 2;
                crab.position.x = 6 + k.smooth(0, 1, go) * 5;
                sail.position.x = -90 + ((t * 0.9) % 180);
                clouds.update(dt); gulls.update(dt, t);
            }
        };
    }
});

// =====================================================================================
// City Street - City Block. An empty lot on a city corner at golden hour: pavements,
// crossings, street lights, cars, a little park, and tall towers with lit windows
// in the distance.
// =====================================================================================
BNB.Worlds.register('city', {
    name: 'City Street',
    sky: ['#3d5a93', '#b98aa6', '#f8c48d'],
    fog: { color: '#f8c48d', near: 42, far: 220 },
    light: { sky: '#dcdcff', ground: '#7a6c66', hemi: 1.25, sun: '#ffe0b8', sunIntensity: 2.7, dir: [-0.7, 0.66, 0.45] },
    dust: '#bdb5a8',
    build: function (k) {
        const T = k.THREE, G = k.G, P = k.plot;
        const cx = k.view.center.x, cz = k.view.center.z;
        const B = P + 3, RD = 7, PITCH = 2 * B + RD;   // block half-size, road width, block spacing
        // Asphalt everywhere, pavement blocks on top.
        k.add(k.geo(new T.PlaneGeometry(400, 400).rotateX(-Math.PI / 2)), k.mat('#4a4e57', { rough: 0.95 }), { x: cx, y: -0.002, z: cz });
        const paveTex = k.canvasTexture(64, 64, function (c, w, h) {
            c.fillStyle = '#c4beb2'; c.fillRect(0, 0, w, h);
            c.fillStyle = '#cbc5ba'; c.fillRect(2, 2, 28, 28); c.fillRect(34, 34, 28, 28);
            c.fillStyle = '#a9a397'; c.fillRect(0, 31, w, 2); c.fillRect(31, 0, 2, h);
        }, [1, 1]);
        const pave = [], grassParts = [];
        for (let i = -2; i <= 2; i++) for (let j = -3; j <= 2; j++) {
            const bx = cx + i * PITCH, bz = cz + j * PITCH;
            pave.push({ g: G.box(2 * B, 0.03, 2 * B), x: bx, y: 0.012, z: bz, c: '#ffffff' });
        }
        const paveGeo = k.merge(pave);
        { // pavement tiles in world space (2 x 2 m)
            const p = paveGeo.attributes.position, uv = new Float32Array(p.count * 2);
            for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 2; uv[i * 2 + 1] = p.getZ(i) / 2; }
            paveGeo.setAttribute('uv', new T.BufferAttribute(uv, 2));
            paveTex.wrapS = paveTex.wrapT = T.RepeatWrapping;
        }
        k.add(paveGeo, k.tmat(paveTex, { rough: 0.9 }));
        // Kerbs round every block.
        const kerb = [];
        for (let i = -2; i <= 2; i++) for (let j = -3; j <= 2; j++) {
            const bx = cx + i * PITCH, bz = cz + j * PITCH;
            kerb.push({ g: G.box(2 * B + 0.3, 0.06, 0.15), x: bx, y: 0.03, z: bz - B }, { g: G.box(2 * B + 0.3, 0.06, 0.15), x: bx, y: 0.03, z: bz + B },
                { g: G.box(0.15, 0.06, 2 * B), x: bx - B, y: 0.03, z: bz }, { g: G.box(0.15, 0.06, 2 * B), x: bx + B, y: 0.03, z: bz });
        }
        k.add(k.merge(kerb), k.mat('#ddd8cc', { rough: 0.9 }));
        // The lot itself: packed earth and gravel inside the pavement.
        k.add(k.geo(new T.BoxGeometry(2 * (B - 1.5), 0.03, 2 * (B - 1.5))), k.mat('#a89a84', { rough: 1 }), { x: cx, y: 0.02, z: cz });
        k.plotPatch('#b9b1a2', { rim: '#958a78', extra: 0.4, rimWidth: 0.25 });
        // Weeds poking up round the edges of the lot, and a few traffic cones.
        const weed = k.merge([
            { g: G.cone(0.05, 0.4, 3), y: 0.2, rz: 0.25, c: '#7aa64a' }, { g: G.cone(0.05, 0.5, 3), y: 0.25, rz: -0.2, x: 0.05, c: '#8fbb55' },
            { g: G.cone(0.04, 0.32, 3), y: 0.16, rx: 0.35, z: 0.05, c: '#6a9440' }
        ]);
        const weeds = [];
        for (let i = 0; i < 90 * k.detail; i++) {
            const e = B - 1.5, sd = Math.floor(k.rand() * 4), u = k.range(-e, e), w = e - k.range(0, 1.6);
            const x = cx + (sd < 2 ? u : (sd === 2 ? -w : w)), z = cz + (sd < 2 ? (sd ? -w : w) : u);
            if (k.free(x, z, 0.1, 0.1)) weeds.push({ x: x, y: 0.03, z: z, ry: k.range(0, 6), s: k.range(0.6, 1.3) });
        }
        k.instanced(weed, k.vmat(), weeds);
        const cone = k.merge([{ g: G.box(0.5, 0.05, 0.5), y: 0.025, c: '#e2672c' }, { g: G.cone(0.18, 0.6, 10), y: 0.33, c: '#f07a2c' }, { g: G.cyl(0.11, 0.13, 0.1, 10), y: 0.38, c: '#f4f4f0' }]);
        k.instanced(cone, k.vmat(), [[B - 2.1, B - 2.3], [B - 2.8, B - 2.0], [-B + 2.0, -B + 2.2]].map(p => ({ x: cx + p[0], z: cz + p[1], ry: p[0] })).filter(p => Math.hypot(p.x - cx, p.z - cz) > P + 1), { cast: true });

        // Road markings: dashed centre lines and zebra crossings at the lot's corners.
        const dash = [], zebra = [];
        for (let i = -2; i <= 2; i++) {
            const rx = cx + i * PITCH + PITCH / 2, rz = cz + i * PITCH + PITCH / 2;
            for (let t = -60; t <= 60; t += 3) {
                if (Math.abs(((t + 1000) % PITCH) - PITCH / 2) > B - 1) continue;
                dash.push({ x: rx, y: 0.006, z: cz + t, ry: Math.PI / 2 }, { x: cx + t, y: 0.006, z: rz });
            }
        }
        [-1, 1].forEach(sx => {
            for (let s = 0; s < 6; s++) {
                const off = -B + 1 + s * ((2 * B - 2) / 5);
                zebra.push({ x: cx + sx * (B + RD / 2), y: 0.007, z: cz + off * 0.0 - B + 1 + s * 1.1, ry: Math.PI / 2, sx: 1 });
                zebra.push({ x: cx + sx * (B - 1 - s * 1.1), y: 0.007, z: cz - B - RD / 2 });
            }
        });
        k.instanced(k.geo(new T.BoxGeometry(1.4, 0.01, 0.16)), k.mat('#eeeae0', { rough: 0.8 }), dash);
        k.instanced(k.geo(new T.BoxGeometry(0.6, 0.01, RD - 1.6)), k.mat('#f2efe6', { rough: 0.8 }), zebra);

        // A shared window texture: lit windows glow in the evening light.
        const W8 = 8;
        const lit = [];
        for (let i = 0; i < W8 * W8; i++) lit.push(k.rand() < 0.38);
        const winTex = k.canvasTexture(128, 128, function (c, w, h) {
            c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
            for (let i = 0; i < W8; i++) for (let j = 0; j < W8; j++) { c.fillStyle = lit[i * W8 + j] ? '#ffe9b0' : '#4a5a78'; c.fillRect(i * 16 + 4, j * 16 + 4, 8, 9); }
        }, [1, 1]);
        const glowTex = k.canvasTexture(128, 128, function (c, w, h) {
            c.fillStyle = '#000000'; c.fillRect(0, 0, w, h);
            for (let i = 0; i < W8; i++) for (let j = 0; j < W8; j++) if (lit[i * W8 + j]) { c.fillStyle = '#ffcf7a'; c.fillRect(i * 16 + 4, j * 16 + 4, 8, 9); }
        }, [1, 1]);
        const bldMat = function (glow) {
            const m = k.tmat(winTex, { emissiveMap: glowTex, emissive: '#ffffff', emissiveIntensity: glow, rough: 0.8 });
            m.vertexColors = true;
            return m;
        };
        const building = function (list, x, z, w, d, h, col, roof, opts) {
            opts = opts || {};
            const bay = 2.0, flr = 3.0, su = (w + d) / 2 / bay / W8, sv = h / flr / W8;
            list.push({ g: G.box(w, h, d), x: x, y: h / 2, z: z, c: col, uv: [su, sv, k.range(0, 1), k.range(0, 1)] });
            list.push({ g: G.box(w + 0.3, 0.4, d + 0.3), x: x, y: h + 0.2, z: z, c: roof || '#6b6f78', uv: [0, 0, 0.001, 0.001] });
            if (opts.top) list.push({ g: G.box(w * 0.6, h * 0.18, d * 0.6), x: x, y: h + h * 0.09 + 0.4, z: z, c: col, uv: [su * 0.6, sv * 0.18, 0.5, 0.2] });
            if (opts.awning) list.push({ g: G.box(w * 0.85, 0.12, 1.1), x: x, y: 2.9, z: z + d / 2 + 0.5, rx: 0.25, c: opts.awning, uv: [0, 0, 0.001, 0.001] });
        };
        // Low-rise shops and flats on the neighbouring blocks.
        const near = [];
        const walls = ['#e9d6c1', '#d98f6f', '#c9b8a6', '#9fb4c9', '#e8c37d', '#b98d78', '#d7d0c2', '#a7b89a'];
        const aw = ['#e2453c', '#2f6fd0', '#3fa84f', '#f28c28', '#8a58c6'];
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            if (i === 0 && j === -1) continue;   // the park
            if (j > 0) continue;                 // nothing tall on the camera's side
            const bx = cx + i * PITCH, bz = cz + j * PITCH;
            const n = 3;
            for (let s = 0; s < n; s++) {
                // a row of buildings along the side of the block facing the lot
                const w = (2 * B - 2) / n, h = k.range(5, 11) + Math.abs(i) * 2;
                const facesZ = j !== 0;
                const x = facesZ ? bx - B + 1 + w / 2 + s * w : bx + (i < 0 ? 1 : -1) * (B - 1 - 2.2);
                const z = facesZ ? bz + (j < 0 ? 1 : -1) * (B - 1 - 2.2) : bz - B + 1 + w / 2 + s * w;
                if (z > cz - 3 || !k.freeWide(x, z, w / 2, h)) continue;
                building(near, x, z, facesZ ? w - 0.2 : 4.4, facesZ ? 4.4 : w - 0.2, h, k.pick(walls), '#5d6169', { awning: k.rand() < 0.6 ? k.pick(aw) : null });
            }
        }
        if (near.length) k.add(k.merge(near), bldMat(0.75), { cast: true });
        // Towers with lit windows in the distance.
        const towers = [];
        for (let gx = -150; gx <= 150; gx += 15) for (let gz = -170; gz <= 60; gz += 15) {
            const x = cx + gx + k.range(-4, 4), z = cz + gz + k.range(-4, 4), r = Math.hypot(x - cx, z - cz);
            if (r < 40 || r > 175 || k.rand() < 0.25) continue;
            if (!k.freeWide(x, z, 6, 30)) continue;
            const down = Math.exp(-Math.pow(Math.hypot(x - cx - 10, z - cz + 95) / 55, 2));
            const h = 14 + k.rand() * 18 + down * k.range(25, 60);
            const w = k.range(7, 11), d = k.range(7, 11);
            building(towers, x, z, w, d, h, k.pick(['#c9cbd4', '#a9b6c8', '#d8cbb8', '#8f9db3', '#b8aea4', '#e2dccf']), '#5b5f68', { top: h > 40 });
        }
        k.add(k.merge(towers), bldMat(1.0), { receive: false });

        // The park across the street: grass, trees, a fountain, benches.
        const pk = { x: cx, z: cz - PITCH };
        k.add(k.geo(new T.BoxGeometry(2 * B - 2, 0.04, 2 * B - 2)), k.mat('#79b45a', { rough: 1 }), { x: pk.x, y: 0.03, z: pk.z });
        k.add(k.geo(new T.BoxGeometry(1.6, 0.045, 2 * B - 2)), k.mat('#cfc4ae', { rough: 1 }), { x: pk.x, y: 0.035, z: pk.z });
        k.add(k.geo(new T.BoxGeometry(2 * B - 2, 0.045, 1.6)), k.mat('#cfc4ae', { rough: 1 }), { x: pk.x, y: 0.035, z: pk.z });
        k.prop([
            { g: G.cyl(1.9, 2.0, 0.5, 20), y: 0.25, c: '#c9c4b8' }, { g: G.cyl(1.6, 1.6, 0.06, 20), y: 0.48, c: '#4fa9d6' },
            { g: G.cyl(0.25, 0.35, 1.2, 10), y: 1.0, c: '#c9c4b8' }, { g: G.cyl(0.7, 0.4, 0.25, 12), y: 1.6, c: '#c9c4b8' }, { g: G.cyl(0.5, 0.5, 0.05, 12), y: 1.72, c: '#4fa9d6' }
        ], { x: pk.x, z: pk.z, cast: true });
        const spout = k.add(k.geo(new T.CylinderGeometry(0.05, 0.25, 0.9, 8)), k.mat('#bfe8ff', { transparent: true, opacity: 0.6, rough: 0.2 }), { x: pk.x, y: 2.2, z: pk.z, receive: false });
        const ptA = k.treeGeo('#4caf50'), ptB = k.treeGeo('#5cb85c'), trees = [[], []];
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((q, qi) => {
            for (let t = 0; t < 2; t++) {
                const x = pk.x + q[0] * k.range(3.2, B - 2.2), z = pk.z + q[1] * k.range(3.2, B - 2.2);
                trees[(qi + t) % 2].push({ x: x, z: z, s: k.range(1.1, 1.5), ry: k.range(0, 6) });
            }
        });
        // Street trees in square planters along the lot's back and side pavements.
        [[-B + 0.9, -B + 0.9], [B - 0.9, -B + 0.9], [-B + 0.9, 0], [B - 0.9, 0]].forEach((p, i) => trees[i % 2].push({ x: cx + p[0], z: cz + p[1] - (i < 2 ? 0 : 0), s: 0.95, ry: i }));
        trees.forEach((l, i) => k.instanced(i ? ptB : ptA, k.vmat(), l.filter(t => k.freeWide(t.x, t.z, 1, 3)), { cast: true }));
        const bench = k.merge([{ g: G.box(1.6, 0.08, 0.5), y: 0.45, c: '#8a5a33' }, { g: G.box(1.6, 0.4, 0.08), y: 0.7, z: -0.22, c: '#8a5a33' }, { g: G.box(0.08, 0.45, 0.45), x: -0.7, y: 0.22, c: '#3a3f48' }, { g: G.box(0.08, 0.45, 0.45), x: 0.7, y: 0.22, c: '#3a3f48' }]);
        k.instanced(bench, k.vmat(), [{ x: pk.x - 3.4, z: pk.z + 1.6 }, { x: pk.x + 3.4, z: pk.z + 1.6 }, { x: pk.x, z: pk.z - 3.6, ry: Math.PI }], { cast: true });

        // Street lights, traffic lights, a hydrant and a bin.
        const lamp = k.merge([
            { g: G.box(0.35, 0.3, 0.35), y: 0.15, c: '#2f343c' }, { g: G.cyl(0.07, 0.1, 5.2, 8), y: 2.6, c: '#3a3f48' },
            { g: G.box(1.2, 0.08, 0.08), x: 0.55, y: 5.15, c: '#3a3f48' }, { g: G.box(0.55, 0.16, 0.3), x: 1.1, y: 5.05, c: '#3a3f48' }
        ]);
        const bulbs = [];
        const lamps = [];
        const addLamp = (x, z, ry) => {
            if (!k.freeWide(x, z, 0.5, 5)) return;
            lamps.push({ x: x, z: z, ry: ry });
            bulbs.push({ g: G.box(0.42, 0.06, 0.22), x: x + Math.cos(ry) * 1.1, y: 4.95, z: z - Math.sin(ry) * 1.1, ry: ry, c: '#ffe2a0' });
        };
        for (let i = -2; i <= 2; i++) {
            addLamp(cx + i * PITCH - B + 0.4, cz - B - RD - 0.4 - 0.0, Math.PI / 2 * 0 - Math.PI / 2);
            addLamp(cx + i * PITCH + 2, cz - B + 0.4, -Math.PI / 2 + Math.PI);
            addLamp(cx - B + 0.4, cz + i * PITCH - 3, Math.PI);
            addLamp(cx + B - 0.4, cz + i * PITCH - 3, 0);
        }
        k.instanced(lamp, k.vmat({ rough: 0.5, metal: 0.4 }), lamps, { cast: true });
        k.add(k.merge(bulbs), k.basic('#ffffff', { vertexColors: true }));
        const tl = k.merge([
            { g: G.cyl(0.08, 0.1, 3.6, 8), y: 1.8, c: '#2f343c' }, { g: G.box(0.42, 1.1, 0.36), y: 3.4, z: 0.1, c: '#2f343c' },
            { g: G.ball(0.12, 1), y: 3.75, z: 0.3, c: '#ff4a3a' }, { g: G.ball(0.12, 1), y: 3.4, z: 0.3, c: '#5a4a1a' }, { g: G.ball(0.12, 1), y: 3.05, z: 0.3, c: '#1d4a2a' }
        ]);
        k.instanced(tl, k.vmat(), [{ x: cx - B + 0.4, z: cz - B + 0.4, ry: Math.PI / 4 }, { x: cx + B - 0.4, z: cz - B + 0.4, ry: -Math.PI / 4 }].filter(p => k.free(p.x, p.z, 0.4, 4)), { cast: true });
        k.prop([{ g: G.cyl(0.16, 0.18, 0.55, 10), y: 0.28, c: '#d9432f' }, { g: G.sphere(0.17, 10, 5), y: 0.55, c: '#d9432f' }, { g: G.cyl(0.07, 0.07, 0.45, 6), y: 0.35, rz: Math.PI / 2, c: '#b8352a' }], { x: cx - B + 0.7, z: cz - B + 2.6, cast: true });
        k.prop([{ g: G.cyl(0.3, 0.26, 0.9, 12), y: 0.45, c: '#3f7a4a' }, { g: G.cyl(0.33, 0.33, 0.08, 12), y: 0.92, c: '#2f5a37' }], { x: cx + B - 0.7, z: cz - B + 2.4, cast: true });

        // Cars: parked along the far kerb, and a few driving slowly by.
        const car = function (c) {
            return k.merge([
                // body, then a glass band with slim corner posts and a roof: windows on every side
                { g: G.box(1.8, 0.6, 3.6), y: 0.55, c: c }, { g: G.box(1.56, 0.5, 1.8), y: 1.1, z: -0.2, c: '#8fb0c8' },
                ...[[-0.76, -1.08], [0.76, -1.08], [-0.76, 0.68], [0.76, 0.68]].map(p => ({ g: G.box(0.08, 0.5, 0.08), x: p[0], y: 1.1, z: p[1], c: c })),
                { g: G.box(1.66, 0.1, 1.92), y: 1.4, z: -0.2, c: c },
                { g: G.box(1.82, 0.12, 0.2), y: 0.6, z: 1.8, c: '#fff4d0' }, { g: G.box(1.82, 0.12, 0.2), y: 0.6, z: -1.8, c: '#d9432f' },
                ...[[-0.9, -1.15], [0.9, -1.15], [-0.9, 1.15], [0.9, 1.15]].map(p => ({ g: G.cyl(0.36, 0.36, 0.24, 10), x: p[0], y: 0.36, z: p[1], rz: Math.PI / 2, c: '#25282d' }))
            ]);
        };
        const carCols = ['#e2453c', '#f6c833', '#2f6fd0', '#f5f0e6'], carGeos = carCols.map(car);
        const parked = [[], [], [], []];
        for (let i = 0, x = -40; x < 40; x += k.range(5, 9), i++) {
            const px = cx + x, pz = cz - B - RD + 1.2;
            if (Math.abs(((x + 1000) % PITCH) - PITCH / 2) > B - 2.5) continue;
            if (k.rand() < 0.75) parked[i % 4].push({ x: px, z: pz, ry: Math.PI / 2 });
        }
        const lanes = [];
        for (let i = 0; i < 4; i++) lanes.push({ i: i, lane: i % 2, off: i * 37 + k.range(0, 10) });
        const moving = carGeos.map((g, ci) => k.animInstanced(g, k.vmat({ rough: 0.4, metal: 0.2 }), lanes.filter(l => l.i % 4 === ci), (it, t, o) => {
            const span = 140, u = ((t * 3.2 + it.off) % span) - span / 2;
            o.x = cx + (it.lane ? -u : u); o.z = cz - B - RD / 2 + (it.lane ? -1.6 : 1.6); o.ry = it.lane ? -Math.PI / 2 : Math.PI / 2;
        }));
        parked.forEach((l, i) => k.instanced(carGeos[i], k.vmat({ rough: 0.4, metal: 0.2 }), l, { cast: true }));

        // Red lights on the tallest towers pulse slowly.
        const beacons = [];
        const towerTops = towers.filter(p => p.uv && p.uv[0] > 0 && p.g.parameters && p.g.parameters.height > 40).slice(0, 6);
        towerTops.forEach(p => beacons.push({ g: G.ball(0.5, 0), x: p.x, y: p.g.parameters.height + 4, z: p.z, c: '#ff3a2a' }));
        const beaconMat = k.basic('#ffffff', { vertexColors: true });
        if (beacons.length) k.add(k.merge(beacons), beaconMat);

        const clouds = k.cloudBank(6, { z0: -190, z1: -110, y0: 40, y1: 60, s0: 3, s1: 5, tint: '#ffe6dc', glow: '#ffb38a' });
        const pigeons = k.flock({ cx: pk.x, cy: 8, cz: pk.z, count: Math.round(4 * k.detail) + 3, radius: 7, color: '#6a6f7a', speed: 0.3 });
        return {
            update: function (dt, t) {
                moving.forEach(m => m.update(t));
                spout.scale.y = 1 + Math.sin(t * 3) * 0.08;
                beaconMat.color.setScalar(0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.4)));
                clouds.update(dt); pigeons.update(dt, t);
            }
        };
    }
});
