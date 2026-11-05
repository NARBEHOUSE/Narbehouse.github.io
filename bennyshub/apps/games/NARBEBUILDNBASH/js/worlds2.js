/**
 * NARBE Build n Bash - the huge builds' worlds: kingdom (Big Castle),
 * boardwalk (Amusement Park) and space (Space Station).
 *
 * Same contract and kit as js/worlds.js (read its header); kept in a file of
 * their own so two people can work on worlds at once.
 *
 * These three are laid out in the PICTURE's frame: u runs to the right of the
 * game camera's view, v straight away from the camera (v > 0 is behind the
 * plot). That keeps each world's landmarks where the camera can see them, on
 * either side of the build, and the strip straight behind the build calm.
 */

window.BNB = window.BNB || {};

(function () {
    'use strict';

    // --- local helpers --------------------------------------------------------------------------

    /** The camera-aligned frame: u to the right of the picture, v away from the camera. */
    function camFrame(k) {
        const a = k.toCamera(), bx = -Math.cos(a), bz = -Math.sin(a), rx = -bz, rz = bx;
        const cx = k.view.center.x, cz = k.view.center.z;
        return {
            cx: cx, cz: cz, bx: bx, bz: bz, rx: rx, rz: rz,
            x: function (u, v) { return cx + u * rx + v * bx; },
            z: function (u, v) { return cz + u * rz + v * bz; },
            u: function (x, z) { return (x - cx) * rx + (z - cz) * rz; },
            v: function (x, z) { return (x - cx) * bx + (z - cz) * bz; },
            /** rotation.y that turns a prop's +z face toward the camera side. */
            face: Math.atan2(-bx, -bz)
        };
    }

    /** A smooth path through [[x, z]] points, resampled every `step`; dist(x, z, cap) to it. */
    function trail(k, pts, step) {
        const T = k.THREE;
        const curve = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0], 0, p[1])), false, 'centripetal');
        const n = Math.max(2, Math.ceil(curve.getLength() / (step || 2)));
        const P = curve.getSpacedPoints(n).map(v => [v.x, v.z]);
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        P.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); });
        function near(x, z, cap) {
            cap = cap || 1e9;
            let best = cap * cap, bi = -1;
            if (x < x0 - cap || x > x1 + cap || z < z0 - cap || z > z1 + cap) return { d: cap, i: -1 };
            for (let i = 0; i + 1 < P.length; i++) {
                const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
                let t = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1);
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                const ex = a[0] + dx * t - x, ez = a[1] + dz * t - z, d2 = ex * ex + ez * ez;
                if (d2 < best) { best = d2; bi = i; }
            }
            return { d: Math.sqrt(best), i: bi };
        }
        return { pts: P, near: near, dist: function (x, z, cap) { return near(x, z, cap).d; } };
    }

    /** A flat strip along [[x, z]] points (three vertices across). half(t), y(t, side), color(t, side, out). */
    function ribbon(k, pts, half, y, color) {
        const T = k.THREE, pos = [], col = [], idx = [], c = new T.Color();
        for (let i = 0; i < pts.length; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
            let dx = b[0] - a[0], dz = b[1] - a[1];
            const L = Math.hypot(dx, dz) || 1;
            dx /= L; dz /= L;
            const t = i / (pts.length - 1), h = typeof half === 'function' ? half(t) : half;
            for (let s = -1; s <= 1; s++) {
                pos.push(pts[i][0] - dz * h * s, typeof y === 'function' ? y(t, s) : y, pts[i][1] + dx * h * s);
                c.set('#ffffff');
                if (color) color(t, s, c);
                col.push(c.r, c.g, c.b);
            }
            if (i) { const o = (i - 1) * 3; for (let s = 0; s < 2; s++) idx.push(o + s, o + s + 1, o + s + 3, o + s + 1, o + s + 4, o + s + 3); }
        }
        const g = k.geo(new T.BufferGeometry());
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
    }

    /** A canvas texture painted pixel by pixel: fn(x, y, out[r, g, b, a]) in 0..255. */
    function pixelTex(k, w, h, fn, repeat) {
        return k.canvasTexture(w, h, function (c) {
            const img = c.createImageData ? c.createImageData(w, h) : null;
            if (!img || !img.data) return;   // a stand-in canvas (headless tests): leave it blank
            const d = img.data, o4 = [0, 0, 0, 255];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    o4[3] = 255;
                    fn(x, y, o4);
                    const o = (y * w + x) * 4;
                    d[o] = o4[0]; d[o + 1] = o4[1]; d[o + 2] = o4[2]; d[o + 3] = o4[3];
                }
            }
            c.putImageData(img, 0, 0);
        }, repeat);
    }

    /** A soft white blob texture (mist, glows); alpha falls off toward the edge. */
    function blobTex(k, w, h, power, rgb) {
        rgb = rgb || [255, 255, 255];
        return pixelTex(k, w, h, function (x, y, o) {
            const dx = (x + 0.5) / w * 2 - 1, dy = (y + 0.5) / h * 2 - 1, r = Math.min(1, Math.hypot(dx, dy));
            const a = Math.pow(1 - r, power || 1.6) * (1 - r * r);
            o[0] = rgb[0]; o[1] = rgb[1]; o[2] = rgb[2]; o[3] = Math.round(255 * a);
        });
    }

    /**
     * Waving cloth: a plane that hangs from its top edge (banner) or flies from
     * its left edge (flag, pennant). Its vertices move in update(t); share the
     * geometry between instances. o: { flag, tri, notch, amp, waves, speed }.
     */
    function cloth(k, w, h, nx, ny, o) {
        const T = k.THREE, g = k.geo(new T.PlaneGeometry(w, h, nx, ny));
        g.translate(o.flag ? w / 2 : 0, o.flag ? 0 : -h / 2, 0);
        const p = g.attributes.position, base = Float32Array.from(p.array);
        for (let i = 0; i < p.count; i++) {
            const x = base[i * 3], y = base[i * 3 + 1];
            if (o.tri) base[i * 3 + 1] = y * (1 - x / w * 0.96);
            if (o.notch && y < -h + 1e-4 && Math.abs(x) < w * 0.26) base[i * 3 + 1] = -h + o.notch * (1 - Math.abs(x) / (w * 0.26));
        }
        p.array.set(base);
        g.computeVertexNormals();
        const amp = o.amp || 0.12, waves = o.waves || 2.4, speed = o.speed || 2.2;
        return {
            geo: g,
            update: function (t) {
                for (let i = 0; i < p.count; i++) {
                    const x = base[i * 3], y = base[i * 3 + 1];
                    const along = o.flag ? x / w : -y / h;
                    p.array[i * 3 + 2] = Math.sin(t * speed - (o.flag ? x : -y) * waves) * amp * along;
                    if (o.flag) p.array[i * 3 + 1] = y - along * along * amp * 0.6;
                }
                p.needsUpdate = true;
                g.computeVertexNormals();
            }
        };
    }

    /** Striped round wedges (tent walls and roofs): n alternating colours as separate merge parts. */
    function stripes(k, n, cols, make, at) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const g = make(i * Math.PI * 2 / n, Math.PI * 2 / n);
            out.push(Object.assign({ g: g, c: cols[i % cols.length] }, at || {}));
        }
        return out;
    }

    /** A polar ring of land shaped by height(x, z, r) and coloured by color(x, z, y, r, out). */
    function ringLand(k, o) {
        const T = k.THREE, pos = [], col = [], idx = [], c = new T.Color();
        const nA = o.nA || 200, nR = o.nR || 16;
        for (let j = 0; j <= nR; j++) {
            const r = o.r0 + (o.r1 - o.r0) * Math.pow(j / nR, o.bias || 1.15);
            for (let i = 0; i <= nA; i++) {
                const a = i / nA * Math.PI * 2, x = o.cx + Math.cos(a) * r, z = o.cz + Math.sin(a) * r;
                const y = o.height(x, z, r);
                pos.push(x, y, z);
                c.set('#ffffff');
                o.color(x, z, y, r, c);
                col.push(c.r, c.g, c.b);
            }
        }
        for (let j = 0; j < nR; j++) {
            for (let i = 0; i < nA; i++) {
                const a = j * (nA + 1) + i, b = a + 1, cc = a + nA + 1, d = cc + 1;
                idx.push(a, b, cc, b, d, cc);
            }
        }
        const g = k.geo(new T.BufferGeometry());
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        g.computeBoundingSphere();
        return g;
    }

    // =================================================================================
    // Kingdom - Big Castle. A misty mountain kingdom: the castle's courtyard on a
    // grassy plateau, a tournament camp of striped tents and banners, the land
    // falling away to a river valley with a village and a waterfall, pine forests,
    // and snowy mountains fading into the mist.
    // =================================================================================
    BNB.Worlds.register('kingdom', {
        name: 'Mountain Kingdom',
        sky: ['#6c9bd2', '#b7d1ea', '#e9eff4'],
        fog: { color: '#e9eff4', near: 60, far: 400 },
        light: { sky: '#eaf2ff', ground: '#6f8a5a', hemi: 1.2, sun: '#fff1da', sunIntensity: 2.65, dir: [-0.5, 1, 0.5] },
        dust: '#c9b58f',
        build: function (k) {
            const T = k.THREE, G = k.G, P = k.plot, F = camFrame(k);
            const W = p => [F.x(p[0], p[1]), F.z(p[0], p[1])];
            const RIVER = -11.75;

            // The river winds across the valley from the waterfall; the road leaves the
            // courtyard, drops off the plateau and crosses it to the village.
            const river = trail(k, [[-74, 166], [-62, 146], [-44, 126], [-22, 114], [-2, 108], [18, 114], [40, 103], [64, 97], [90, 105], [118, 93], [150, 100], [178, 95]].map(W), 2.5);
            const road = trail(k, [[P + 0.2, 1.0], [P + 3.6, 4.6], [P + 6.8, 11], [P + 9.2, 20], [20, 34], [24, 56], [28, 78], [31, 100], [35, 118], [42, 134]].map(W), 1.5);
            const VIL = { u: 50, v: 142 };

            let lastR = 99, lastD = 99, lastFall = 0;
            function hh(x, z) {
                const u = F.u(x, z), v = F.v(x, z), r = Math.hypot(u, v), a = Math.atan2(v, u);
                const behind = Math.max(0, v / (r || 1));
                const rim = P + 22 - 10 * behind * behind + 3 * k.noise(Math.cos(a) * 1.7 + 3, Math.sin(a) * 1.7 - 2);
                lastR = river.dist(x, z, 16); lastD = road.dist(x, z, 3);
                if (r <= rim) { lastFall = 0; return 0; }
                const fall = k.smooth(rim, rim + 15, r);
                lastFall = fall;
                let h = -10.4 * fall + fall * (k.fbm(x * 0.03, z * 0.03, 3) - 0.5) * 4;
                h = Math.max(h, -11.1 * fall);
                // The valley floor rolls gently up toward the mountains' feet (kept low so
                // the peaks stay in view over it).
                h += k.smooth(70, 180, r) * (2 + 6 * k.fbm(x * 0.02 + 5, z * 0.02 - 1, 3));
                if (lastR < 16) h += (RIVER - 1.0 - h) * (1 - k.smooth(1.6, 15, lastR)) * fall;
                return h;
            }
            const grassA = new T.Color('#86c45e'), grassB = new T.Color('#9bd06b'), slope = new T.Color('#a59f8b'), meadow = new T.Color('#8bc062'),
                forest = new T.Color('#5c8b4d'), bank = new T.Color('#c9be92'), dirt = new T.Color('#d5be92'), tmp = new T.Color();
            const fields = ['#c9cf6a', '#9cc65c', '#e2cf7a', '#7fb456', '#b7d277'].map(c => new T.Color(c));
            k.terrain({
                R: 230, segs: 112, warp: 1.8, height: hh, color: function (x, z, y, out) {
                    out.copy(grassA).lerp(grassB, k.noise(x * 0.21, z * 0.21) * 0.8);
                    if (lastFall > 0) {
                        tmp.copy(slope).lerp(forest, k.fbm(x * 0.05, z * 0.05, 2));
                        out.lerp(tmp, Math.sin(Math.PI * Math.min(1, lastFall)) * 0.85);
                        if (lastFall > 0.9) {
                            out.copy(meadow).lerp(grassB, k.noise(x * 0.08, z * 0.08) * 0.5);
                            const u = F.u(x, z), v = F.v(x, z);
                            if (Math.hypot(u - VIL.u, v - VIL.v) < 46 && v > 112) {
                                const i = Math.floor(u / 11), j = Math.floor(v / 8);
                                out.lerp(fields[Math.floor(k.hash(i + 7, j - 3) * fields.length)], 0.8);
                            }
                            out.lerp(forest, k.smooth(2, 16, y) * 0.75);
                        }
                    }
                    if (lastR < 4.5) out.lerp(bank, 1 - k.smooth(2.6, 4.5, lastR));
                    if (lastD < 1.5) out.lerp(dirt, 1 - k.smooth(0.9, 1.5, lastD));
                }
            });

            // --- the courtyard: warm flagstones with a ring of kerb stones ----------------------
            const CR = P + 0.45, cx = F.cx, cz = F.cz;
            const flags = pixelTex(k, 256, 256, function (px, py, o) {
                const rows = 18, ry = py / 256 * rows, j = Math.floor(ry), fy = ry - j;
                const off = k.hash(j, 3) * 0.7, rx = px / 256 * rows * 0.75 + off, i = Math.floor(rx + k.hash(j, 11) * 0.3), fx = rx - Math.floor(rx);
                const s = k.hash(i * 3 + 1, j * 7 + 2), edge = Math.min(fx, 1 - fx, fy * 1.15, (1 - fy) * 1.15);
                let r = 210 + s * 26, g = 190 + s * 22, b = 150 + s * 18;
                if (s > 0.82) { r -= 26; g -= 22; b -= 14; }
                const grain = (k.hash(px, py) - 0.5) * 10;
                if (edge < 0.06) { r = 150; g = 136; b = 108; }
                o[0] = r + grain; o[1] = g + grain; o[2] = b + grain;
            });
            const disc = k.geo(new T.CircleGeometry(CR, 64));
            disc.rotateX(-Math.PI / 2);
            k.add(disc, k.tmat(flags, { rough: 0.95 }), { x: cx, y: 0.004, z: cz });
            const kerb = [];
            const nK = Math.round(CR * 2 * Math.PI / 0.7);
            for (let i = 0; i < nK; i++) {
                const a = i / nK * Math.PI * 2;
                kerb.push({ g: G.box(0.62, 0.06, 0.42), x: cx + Math.cos(a) * (CR + 0.2), y: 0.03, z: cz + Math.sin(a) * (CR + 0.2), ry: -a + Math.PI / 2, c: i % 2 ? '#a09684' : '#8f8573' });
            }
            k.prop(kerb);

            // --- the tournament camp: striped pavilions, pennants and hanging banners --------
            const flagParts = [], pennants = [];
            function tent(u, v, s, c1, c2, flagC) {
                if (!k.free(F.x(u, v), F.z(u, v), 1.8 * s, 3.5 * s)) return false;
                const n = 12, parts = [];
                parts.push(...stripes(k, n, [c1, c2], (a0, da) => new T.CylinderGeometry(1.25, 1.32, 1.6, 2, 1, true, a0, da), { y: 0.8 }));
                parts.push(...stripes(k, n, [c1, c2], (a0, da) => new T.ConeGeometry(1.62, 1.5, 2, 1, true, a0, da), { y: 2.34 }));
                parts.push({ g: G.cyl(1.66, 1.66, 0.2, 16), y: 1.56, c: c1 });
                for (let i = 0; i < 16; i++) {
                    const a = i / 16 * Math.PI * 2;
                    parts.push({ g: G.cone(0.2, 0.26, 3), x: Math.cos(a) * 1.64, y: 1.34, z: Math.sin(a) * 1.64, rx: Math.PI, c: i % 2 ? c2 : c1 });
                }
                parts.push({ g: G.box(0.72, 1.25, 0.04), y: 0.62, z: 1.3, c: '#4a3426' });
                parts.push({ g: G.cyl(0.035, 0.035, 1.1, 5), y: 3.55, c: '#7a5a3a' }, { g: G.ball(0.08, 0), y: 4.1, c: '#f2c94c' });
                const x = F.x(u, v), z = F.z(u, v);
                k.prop(parts, { x: x, z: z, s: s, ry: F.face + k.range(-0.4, 0.4), cast: true });
                pennants.push({ x: x, y: 3.95 * s, z: z, s: s, color: flagC });
                return true;
            }
            tent(-12.5, 4.5, 1.15, '#d8423a', '#f6efe0', '#f2c94c');
            tent(-16.5, 11, 0.95, '#3d6fc2', '#f2d36b', '#d8423a');
            tent(13.5, 8.5, 1.1, '#2f8f63', '#f6efe0', '#3d6fc2');
            tent(18.5, 2.5, 0.9, '#8c4fb0', '#f2d36b', '#f6efe0');

            // Tall banner poles: a crossbar and a long swallowtail banner with a crown.
            const crownBanner = function (field) {
                return k.canvasTexture(64, 160, function (c, w, h) {
                    c.fillStyle = '#f2c94c'; c.fillRect(0, 0, w, h);
                    c.fillStyle = field; c.fillRect(5, 5, w - 10, h - 10);
                    c.fillStyle = '#f2c94c';
                    c.beginPath(); [[16, 74], [16, 46], [24, 58], [32, 40], [40, 58], [48, 46], [48, 74]].forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill();
                    c.fillRect(16, 78, 32, 8);
                    c.fillRect(29, 98, 6, 40); c.fillRect(20, 108, 24, 6);
                });
            };
            const bannerCloth = cloth(k, 1.0, 2.5, 4, 10, { notch: 0.5, amp: 0.1, waves: 1.3, speed: 1.4 });
            const banners = { red: [], blue: [] };
            const poleList = [];
            function bannerPole(u, v, which) {
                const x = F.x(u, v), z = F.z(u, v);
                if (!k.free(x, z, 0.6, 4.6)) return;
                poleList.push({ x: x, z: z, ry: F.face });
                const ox = Math.sin(F.face) * 0.08, oz = Math.cos(F.face) * 0.08;
                banners[which].push({ x: x + ox, y: 4.25, z: z + oz, ry: F.face });
                pennants.push({ x: x, y: 4.82, z: z, s: 0.9, color: which === 'red' ? '#3d6fc2' : '#d8423a' });
            }
            bannerPole(-10.5, 1.5, 'red'); bannerPole(10.8, 2.5, 'blue');
            bannerPole(-9.5, 10.5, 'blue'); bannerPole(9.8, 12.5, 'red');
            bannerPole(17.5, 19.5, 'red'); bannerPole(23.6, 21.5, 'blue');
            const pole = k.merge([
                { g: G.cyl(0.07, 0.09, 4.8, 6), y: 2.4, c: '#6e4c30' }, { g: G.box(1.3, 0.08, 0.08), y: 4.3, c: '#6e4c30' },
                { g: G.ball(0.1, 0), x: -0.66, y: 4.3, c: '#f2c94c' }, { g: G.ball(0.1, 0), x: 0.66, y: 4.3, c: '#f2c94c' },
                { g: G.cone(0.1, 0.3, 6), y: 4.95, c: '#f2c94c' }
            ]);
            k.instanced(pole, k.vmat(), poleList, { cast: true });
            const bannerMats = { red: k.tmat(crownBanner('#c23a32'), { side: T.DoubleSide, rough: 0.9 }), blue: k.tmat(crownBanner('#2f5fb0'), { side: T.DoubleSide, rough: 0.9 }) };
            Object.keys(banners).forEach(key => { if (banners[key].length) k.instanced(bannerCloth.geo, bannerMats[key], banners[key], { cast: true }); });

            // Little pennants flying from every tent and pole top (one shared waving cloth).
            const pennant = cloth(k, 0.9, 0.42, 5, 1, { flag: true, tri: true, amp: 0.1, waves: 3, speed: 3.2 });
            const byCol = {};
            pennants.forEach(p => { (byCol[p.color] = byCol[p.color] || []).push({ x: p.x, y: p.y, z: p.z, s: p.s, ry: F.face - Math.PI / 2 - 0.5 }); });
            Object.keys(byCol).forEach(c => k.instanced(pennant.geo, k.mat(c, { side: T.DoubleSide, rough: 0.9 }), byCol[c]));

            // Archery targets with hay bales, a cart and barrels round the camp.
            const target = k.merge([
                { g: G.cyl(0.62, 0.62, 0.22, 16), rx: Math.PI / 2, y: 1.15, c: '#e8d08a' },
                { g: G.cyl(0.5, 0.5, 0.24, 16), rx: Math.PI / 2, y: 1.15, c: '#f6f1e6' },
                { g: G.cyl(0.36, 0.36, 0.26, 16), rx: Math.PI / 2, y: 1.15, c: '#2f5fb0' },
                { g: G.cyl(0.22, 0.22, 0.28, 16), rx: Math.PI / 2, y: 1.15, c: '#d8423a' },
                { g: G.cyl(0.09, 0.09, 0.3, 10), rx: Math.PI / 2, y: 1.15, c: '#f2c94c' },
                { g: G.box(0.08, 1.6, 0.08), x: -0.3, y: 0.7, z: -0.25, rx: -0.25, c: '#7a5434' },
                { g: G.box(0.08, 1.6, 0.08), x: 0.3, y: 0.7, z: -0.25, rx: -0.25, c: '#7a5434' }
            ]);
            const targets = [[-18, -1.5], [-21, 1.5]].map(p => ({ x: F.x(p[0], p[1]), z: F.z(p[0], p[1]), ry: F.face + 0.9 })).filter(p => k.free(p.x, p.z, 0.7, 1.8));
            k.instanced(target, k.vmat(), targets, { cast: true });
            const bale = k.geo(new T.BoxGeometry(1.1, 0.55, 0.65));
            k.instanced(bale, k.mat('#e2c45a', { flat: true }), [[-19.2, 0.6], [-20, 3.2], [-17, 15]].map(p => ({ x: F.x(p[0], p[1]), y: 0.27, z: F.z(p[0], p[1]), ry: k.range(0, 3) })).filter(p => k.free(p.x, p.z, 0.6, 0.6)), { cast: true });
            const barrel = k.merge([{ g: G.cyl(0.32, 0.32, 0.8, 10), y: 0.4, c: '#8a5a33' }, { g: G.cyl(0.36, 0.36, 0.08, 10), y: 0.18, c: '#4a4a4a' }, { g: G.cyl(0.36, 0.36, 0.08, 10), y: 0.62, c: '#4a4a4a' }]);
            k.instanced(barrel, k.vmat(), [[15.6, 5.5], [16.3, 6.1], [15.9, 4.6], [-14.6, 8.3], [-10.6, 6.8]].map(p => ({ x: F.x(p[0], p[1]), z: F.z(p[0], p[1]), ry: k.range(0, 3) })).filter(p => k.free(p.x, p.z, 0.4, 0.9)), { cast: true });
            const cartAt = [20.5, 7];
            if (k.free(F.x(cartAt[0], cartAt[1]), F.z(cartAt[0], cartAt[1]), 1.4, 1.4)) {
                k.prop([
                    { g: G.box(1.6, 0.18, 2.6), y: 0.75, c: '#9a6a3e' }, { g: G.box(1.6, 0.4, 0.08), y: 1.0, z: 1.27, c: '#8a5a33' }, { g: G.box(1.6, 0.4, 0.08), y: 1.0, z: -1.27, c: '#8a5a33' },
                    { g: G.box(0.08, 0.4, 2.6), x: 0.78, y: 1.0, c: '#8a5a33' }, { g: G.box(0.08, 0.4, 2.6), x: -0.78, y: 1.0, c: '#8a5a33' },
                    { g: G.cyl(0.5, 0.5, 0.1, 12), x: 0.88, y: 0.5, z: -0.5, rz: Math.PI / 2, c: '#5a3d26' }, { g: G.cyl(0.5, 0.5, 0.1, 12), x: -0.88, y: 0.5, z: -0.5, rz: Math.PI / 2, c: '#5a3d26' },
                    { g: G.box(0.1, 0.1, 1.8), x: 0.3, y: 0.62, z: 2.0, rx: 0.3, c: '#8a5a33' }, { g: G.box(0.1, 0.1, 1.8), x: -0.3, y: 0.62, z: 2.0, rx: 0.3, c: '#8a5a33' },
                    { g: G.box(1.3, 0.5, 1.6), y: 1.1, z: -0.3, c: '#e2c45a' }, { g: G.ball(0.4, 1), x: 0.3, y: 1.25, z: 0.8, c: '#c45a3a' }, { g: G.ball(0.35, 1), x: -0.35, y: 1.2, z: 0.9, c: '#7aa83e' }
                ], { x: F.x(cartAt[0], cartAt[1]), z: F.z(cartAt[0], cartAt[1]), ry: F.face + 2.2, cast: true });
            }
            // A stone well with a little shingled roof.
            const wellAt = [-15, -4.5];
            if (k.free(F.x(wellAt[0], wellAt[1]), F.z(wellAt[0], wellAt[1]), 1.1, 2.4)) {
                k.prop([
                    { g: G.cyl(0.85, 0.9, 0.8, 12), y: 0.4, c: '#a39b8b' }, { g: G.cyl(0.88, 0.88, 0.1, 12), y: 0.82, c: '#8d8576' },
                    { g: G.cyl(0.7, 0.7, 0.05, 12), y: 0.75, c: '#2c4a63' },
                    { g: G.box(0.1, 1.5, 0.1), x: -0.75, y: 1.5, c: '#6e4c30' }, { g: G.box(0.1, 1.5, 0.1), x: 0.75, y: 1.5, c: '#6e4c30' },
                    { g: G.prism([[-1.1, 0], [1.1, 0], [0, 0.75]], 1.3), y: 2.2, rz: 0, c: '#9a4a3a' },
                    { g: G.cyl(0.06, 0.06, 1.4, 6), y: 1.7, rz: Math.PI / 2, c: '#6e4c30' }, { g: G.cyl(0.14, 0.12, 0.25, 8), y: 1.2, c: '#7a5434' }
                ], { x: F.x(wellAt[0], wellAt[1]), z: F.z(wellAt[0], wellAt[1]), ry: F.face + 0.6, cast: true });
            }

            // --- trees, rocks and flowers --------------------------------------------------------
            const pineA = k.pineGeo('#2f7d4a'), pineB = k.pineGeo('#3d8d55'), pineC = k.pineGeo('#2a6e45', '#f4f7fb');
            const pines = [[], [], []], farPines = [[], [], []];
            // Groves on the plateau's sides and edge (never straight behind the plot).
            for (let i = 0, n = 0; i < 500 && n < 34 * k.detail + 8; i++) {
                const u = k.range(-34, 34), v = k.range(-14, 26);
                const x = F.x(u, v), z = F.z(u, v);
                if (Math.abs(u) < P + 6 + v * 0.25 || !k.free(x, z, 1.3, 4)) continue;
                if (k.fbm(x * 0.09 + 3, z * 0.09, 2) < 0.47 || road.dist(x, z, 3) < 2.4) continue;
                if (pines[0].concat(pines[1]).some(p => Math.hypot(p.x - x, p.z - z) < 1.6)) continue;
                pines[n++ % 2].push({ x: x, y: hh(x, z) - 0.1, z: z, s: k.range(1.1, 1.9), ry: k.range(0, 6.28) });
            }
            // Forests down the slopes, in the valley and over the foothills.
            for (let i = 0, n = 0; i < 2600 && n < 260 * k.detail + 40; i++) {
                const a = k.range(0, Math.PI * 2), d = k.range(26, 215), x = F.cx + Math.cos(a) * d, z = F.cz + Math.sin(a) * d;
                const dens = k.fbm(x * 0.022 + 11, z * 0.022 - 4, 3) + (d > 150 ? 0.08 : 0);
                if (dens < 0.5 || !k.freeWide(x, z, 2, 6)) continue;
                const u = F.u(x, z), v = F.v(x, z);
                if (river.dist(x, z, 8) < 7 || road.dist(x, z, 4) < 3.5 || Math.hypot(u - VIL.u, v - VIL.v) < 40) continue;
                if (v > 0 && v < 80 && Math.abs(u) < 16 + v * 0.2 && k.rand() < 0.8) continue;
                const y = hh(x, z);
                if (y > -0.05 && d < 40) continue;
                const s = k.range(1.6, 2.6) * (d > 90 ? 1.5 : 1);
                farPines[y > 9 ? 2 : n++ % 2].push({ x: x, y: y - 0.3, z: z, s: s, ry: k.range(0, 6.28) });
            }
            [pineA, pineB, pineC].forEach((g, i) => {
                if (pines[i].length) k.instanced(g, k.vmat(), pines[i], { cast: true });
                if (farPines[i].length) k.instanced(g, k.vmat(), farPines[i]);
            });
            const rocks = k.spots(Math.round(10 * k.detail) + 4, P + 3, P + 20, 0.9, 0.7, (x, z) => road.dist(x, z, 3) > 2).map(p => ({ x: p.x, y: 0.12, z: p.z, s: k.range(0.35, 0.8), ry: k.range(0, 6) }));
            k.instanced(k.rockGeo(1, 0.25, 7), k.mat('#a7a397', { flat: true }), rocks, { cast: true });
            const fcol = ['#ffffff', '#ffd23f', '#b58ad8', '#ff8fb1', '#9fc4ff'];
            const fl = [];
            for (let i = 0; i < 200 * k.detail; i++) {
                const a = k.range(0, 6.28), d = k.range(CR + 0.8, P + 18), x = F.cx + Math.cos(a) * d, z = F.cz + Math.sin(a) * d;
                if (!k.free(x, z, 0.1, 0.1) || hh(x, z) < -0.02 || road.dist(x, z, 2) < 1.4) continue;
                fl.push({ x: x, y: 0.1, z: z, s: k.range(0.8, 1.3), color: k.pick(fcol) });
            }
            k.instancedColors(k.geo(new T.IcosahedronGeometry(0.085, 0)), { rough: 0.8, flat: true }, fl);
            const tuft = k.merge([
                { g: G.cone(0.06, 0.42, 3), y: 0.2, rz: 0.25, c: '#5aa443' }, { g: G.cone(0.06, 0.5, 3), y: 0.24, rz: -0.18, x: 0.05, c: '#6cb64e' },
                { g: G.cone(0.05, 0.36, 3), y: 0.17, rx: 0.3, z: 0.05, c: '#4f9a3c' }
            ]);
            const tufts = [];
            for (let i = 0; i < 160 * k.detail; i++) {
                const a = k.range(0, 6.28), d = k.range(CR + 0.6, P + 16), x = F.cx + Math.cos(a) * d, z = F.cz + Math.sin(a) * d;
                if (k.free(x, z, 0.1, 0.1) && hh(x, z) > -0.02 && road.dist(x, z, 2) > 1.2) tufts.push({ x: x, z: z, ry: k.range(0, 6.28), s: k.range(0.7, 1.3) });
            }
            k.instanced(tuft, k.vmat(), tufts);

            // --- the river, a stone bridge where the road crosses, the waterfall ----------------
            const rp = river.pts;
            const water = ribbon(k, rp, t => 2.6 + t * 2.2, RIVER, (t, s, c) => c.set(s === 0 ? '#5aa3cc' : '#8cc3de'));
            k.add(water, k.mat('#ffffff', { vertexColors: true, rough: 0.25, metal: 0.05 }), { receive: false });
            let bi = 0, bd = 1e9;
            road.pts.forEach((p, i) => { const d = river.dist(p[0], p[1]); if (d < bd) { bd = d; bi = i; } });
            const bp = road.pts[bi], bq = road.pts[Math.min(road.pts.length - 1, bi + 1)];
            const bAng = Math.atan2(bq[0] - bp[0], bq[1] - bp[1]);
            k.prop([
                { g: G.box(2.6, 0.5, 12), y: 1.5, c: '#b3a993' },
                { g: G.box(0.3, 0.6, 12), x: 1.25, y: 2.0, c: '#a19781' }, { g: G.box(0.3, 0.6, 12), x: -1.25, y: 2.0, c: '#a19781' },
                { g: G.box(2.6, 2.2, 2.4), y: 0.1, z: 4.6, c: '#a19781' }, { g: G.box(2.6, 2.2, 2.4), y: 0.1, z: -4.6, c: '#a19781' },
                { g: new T.TorusGeometry(2.3, 0.45, 5, 10, Math.PI), y: -1.1, rx: 0, ry: Math.PI / 2, sx: 1, c: '#b3a993' }
            ], { x: bp[0], y: RIVER + 0.2, z: bp[1], ry: bAng, s: 1.15 });
            // The waterfall pours from a cleft in a rocky cliff at the head of the river.
            const head = rp[0], hdx = rp[3][0] - head[0], hdz = rp[3][1] - head[1], hL = Math.hypot(hdx, hdz);
            const cliffRy = Math.atan2(hdx, hdz), CY = RIVER - 1;
            const cliffX = head[0] - hdx / hL * 5, cliffZ = head[1] - hdz / hL * 5;
            const rockG = k.rockGeo(1, 0.16, 5);
            const crag = (x, y, z, sx, sy, sz, c) => ({ g: rockG, x: x, y: y, z: z, sx: sx, sy: sy, sz: sz, c: c });
            k.prop([
                crag(-7, 9, -5, 10, 22, 9, '#76848a'), crag(7, 8.5, -5, 10, 21, 9, '#6e7c84'), crag(0, 8, -11, 14, 24, 9, '#67757d'),
                crag(-19, 6, -4, 13, 17, 11, '#72808a'), crag(19, 5.5, -4, 13, 16, 11, '#76848a'),
                crag(-32, 3, -2, 13, 11, 10, '#6e7c84'), crag(32, 3, -2, 13, 10, 10, '#72808a'),
                crag(-4, 0.6, 3, 4, 3, 3, '#67757d'), crag(4.5, 0.4, 3.5, 3.5, 2.5, 3, '#6e7c84')
            ], { x: cliffX, y: CY, z: cliffZ, ry: cliffRy });
            const topPines = [[-10, 16.5, -6], [-17, 13, -5], [-24, 9.5, -3], [9, 16, -7], [16, 12.6, -5], [26, 8.6, -3], [-2, 17.5, -12], [3, 17.5, -14]].map(p => {
                const c = Math.cos(cliffRy), s = Math.sin(cliffRy);
                return { x: cliffX + p[0] * c + p[2] * s, y: CY + p[1], z: cliffZ - p[0] * s + p[2] * c, s: k.range(2.2, 3), ry: k.range(0, 6) };
            });
            const fallTex = pixelTex(k, 32, 128, function (x, y, o) {
                const s = Math.sin(x * 0.9 + k.hash(x, 1) * 6) * 0.5 + 0.5, n = k.hash(x, Math.floor(y / 6));
                const v = 205 + 50 * Math.min(1, s * 0.6 + n * 0.6);
                o[0] = v - 16; o[1] = v - 5; o[2] = 255; o[3] = 215 + 40 * n;
            }, [1, 2]);
            const fallMat = k.basic('#ffffff', { map: fallTex, transparent: true });
            const fg = k.geo(new T.PlaneGeometry(1, 1, 1, 6));
            fg.translate(0, 0.5, 0);
            // Bow the sheet forward toward its foot, like water leaving a lip.
            const fp = fg.attributes.position;
            for (let i = 0; i < fp.count; i++) { const y = fp.getY(i); fp.setZ(i, (1 - y) * (1 - y) * 0.12); fp.setX(i, fp.getX(i) * (1 + (1 - y) * 0.35)); }
            fg.computeVertexNormals();
            k.add(fg, fallMat, { x: cliffX + hdx / hL * 0.8, y: CY, z: cliffZ + hdz / hL * 0.8, sx: 4.4, sy: 18, sz: 18, ry: cliffRy, receive: false });
            const foam = k.prop([[0, 0, 0, 1.6], [1.6, -0.2, 0.5, 1.1], [-1.5, -0.2, 0.4, 1.2], [0.4, 0.4, 1.2, 0.9], [-0.6, 0.6, -0.6, 1]].map(b => ({ g: G.ball(1, 1), x: b[0], y: b[1], z: b[2], s: b[3], c: '#f4f9fc' })),
                { x: cliffX + hdx / hL * 3.4, y: RIVER + 0.4, z: cliffZ + hdz / hL * 3.4, s: 1.4, sy: 0.6, receive: false }, { emissive: '#dfe9f2', emissiveIntensity: 0.35, rough: 1 });

            // --- the village across the river: cottages, a chapel, chimney smoke ------------------
            const cottages = [k.houseGeo('#f4ead8', '#b5523b'), k.houseGeo('#efe2c9', '#5f6f8c'), k.houseGeo('#f6efe2', '#8a5a3c')];
            const homes = [[], [], []], smokeAt = [];
            for (let i = 0, n = 0; i < 80 && n < 14; i++) {
                const u = VIL.u + k.range(-24, 24), v = VIL.v + k.range(-14, 16), x = F.x(u, v), z = F.z(u, v);
                if (river.dist(x, z, 8) < 7 || road.dist(x, z, 3) < 2.4) continue;
                if (homes.some(l => l.some(h => Math.hypot(h.x - x, h.z - z) < 6.5))) continue;
                const s = k.range(2.2, 2.7);
                homes[n % 3].push({ x: x, y: hh(x, z) - 0.4, z: z, s: s, ry: F.face + k.range(-0.6, 0.6) });
                if (n % 4 === 1) smokeAt.push([x + 0.5 * s, hh(x, z) + 3.1 * s, z]);
                n++;
            }
            cottages.forEach((g, i) => { if (homes[i].length) k.instanced(g, k.vmat(), homes[i]); });
            const chX = F.x(VIL.u + 6, VIL.v + 8), chZ = F.z(VIL.u + 6, VIL.v + 8);
            k.prop([
                { g: G.box(3.4, 3.2, 6), y: 1.6, c: '#efe6d4' }, { g: G.prism([[-1.95, 3.2], [1.95, 3.2], [0, 5.0]], 6.2), c: '#6b5a8a' },
                { g: G.box(1.8, 6.5, 1.8), y: 3.25, z: 3.4, c: '#efe6d4' }, { g: G.cone(1.35, 4.2, 4), y: 8.6, z: 3.4, ry: Math.PI / 4, c: '#3f5e8c' },
                { g: G.cone(0.12, 0.8, 4), y: 11.0, z: 3.4, c: '#f2c94c' }
            ], { x: chX, y: hh(chX, chZ) - 0.3, z: chZ, ry: F.face + 0.5, s: 2.2 });
            k.instanced(pineA, k.vmat(), topPines);
            const smoke = [];
            smokeAt.forEach(p => { for (let i = 0; i < 4; i++) smoke.push({ x: p[0], y: p[1], z: p[2], ph: i / 4 }); });
            const smokeAnim = smoke.length ? k.animInstanced(k.geo(new T.IcosahedronGeometry(1, 1)), k.mat('#f1f3f5', { flat: true, rough: 1, emissive: '#d5dbe0', emissiveIntensity: 0.3, transparent: true, opacity: 0.42, depthWrite: false }), smoke, function (it, t, o) {
                const f = (t * 0.08 + it.ph) % 1;
                o.y = it.y + f * 6; o.x = it.x + f * f * 4; o.s = Math.sin(Math.PI * Math.sqrt(f)) * (0.5 + f * 1.3); o.sy = o.s * 0.75;
            }) : null;
            // The kingdom's far palace on a rocky spur, pale in the haze, to the right.
            const spX = F.x(92, 196), spZ = F.z(92, 196), spY = hh(spX, spZ);
            const spur = [crag(0, 4, 0, 16, 22, 14, '#76848a'), crag(-12, 0, 4, 12, 13, 11, '#6e7c84'), crag(11, -1, 3, 12, 12, 11, '#72808a'), crag(2, -4, 10, 18, 10, 10, '#67757d')];
            const keep = [], st = '#d3cdbf', rf = '#56688c';
            const tower = (x, z, r, h, y0) => {
                keep.push({ g: G.cyl(r, r * 1.05, h, 8), x: x, y: y0 + h / 2, z: z, c: st }, { g: G.cone(r * 1.3, r * 2.4, 8), x: x, y: y0 + h + r * 1.2, z: z, c: rf },
                    { g: G.cyl(0.08, 0.08, 2.2, 4), x: x, y: y0 + h + r * 2.4 + 0.6, z: z, c: '#6b5a48' });
            };
            keep.push({ g: G.box(13, 6, 9), y: 16 + 3, c: st }, { g: G.box(7, 5, 6), y: 16 + 8.5, z: -1, c: '#cbc5b6' }, { g: G.prism([[-4, 0], [4, 0], [0, 3]], 6.4), y: 16 + 11, z: -1, c: rf });
            tower(-6.5, 4.5, 1.6, 10, 16); tower(6.5, 4.5, 1.6, 11, 16); tower(-6.5, -4.5, 1.5, 9, 16); tower(6.5, -4.5, 1.5, 9.5, 16); tower(0, -1, 2.2, 17, 16);
            k.prop(spur.concat(keep), { x: spX, y: spY - 2, z: spZ, ry: F.face + 0.35, s: 1.1 });

            // --- the snowy mountains: one ring, hazed by hand (fog would bleach it flat) --------
            // A darker, forested near ridge in front of a tall, snowy far range; one great
            // peak a little left of the castle and another to the right.
            const peaks = [];
            const behindA = Math.atan2(F.bz, F.bx);
            const far = [[-1.5, 290, 40, 74], [-1.12, 262, 46, 70], [-0.78, 300, 52, 80], [-0.42, 286, 70, 92], [-0.12, 318, 48, 80], [0.12, 270, 40, 66],
                [0.4, 292, 62, 88], [0.7, 268, 44, 70], [0.98, 300, 50, 80], [1.3, 276, 40, 70], [1.7, 290, 36, 76], [-1.9, 290, 36, 76],
                [2.3, 300, 28, 80], [-2.3, 300, 28, 80], [2.8, 300, 22, 80], [-2.8, 300, 22, 80]];
            const near = [];
            for (let a = -1.75; a <= 1.75; a += 0.21) near.push([a + k.range(-0.06, 0.06), k.range(196, 214), k.range(15, 25), k.range(34, 46)]);
            far.concat(near).forEach(p => {
                const a = behindA + p[0];
                peaks.push({ x: F.cx + Math.cos(a) * p[1], z: F.cz + Math.sin(a) * p[1], h: p[2] * k.range(0.94, 1.06), w: p[3] });
            });
            const MB = -16, haze = new T.Color('#d8e2ee'), rock = new T.Color('#6a7ca4'), rock2 = new T.Color('#5a6a90'), snow = new T.Color('#f8fbff'),
                snowShade = new T.Color('#dfe8f5'), ridge = new T.Color('#4a6a66'), ridge2 = new T.Color('#5b7a70'), tmpM = new T.Color();
            const mtnGeo = ringLand(k, {
                cx: F.cx, cz: F.cz, r0: 170, r1: 345, nA: 280, nR: 24,
                height: function (x, z, r) {
                    let m = 0;
                    for (let i = 0; i < peaks.length; i++) {
                        const p = peaks[i], d = Math.hypot(x - p.x, z - p.z) / p.w;
                        if (d < 1) m = Math.max(m, p.h * Math.pow(1 - d, 1.3));
                    }
                    const rid = 1 - Math.abs(2 * k.fbm(x * 0.02 + 3, z * 0.02 - 7, 3) - 1);
                    m += rid * 6 + k.noise(x * 0.09, z * 0.09) * 3;
                    const ramp = k.smooth(170, 200, r);
                    return MB + m * ramp - (1 - ramp) * 6;
                },
                color: function (x, z, y, r, out) {
                    const nearK = 1 - k.smooth(215, 245, r);
                    out.copy(rock).lerp(rock2, k.noise(x * 0.05, z * 0.05));
                    const line = 14 + 9 * k.noise(x * 0.035 + 9, z * 0.035) + nearK * 12;
                    if (y > line) out.copy(snow).lerp(snowShade, k.noise(x * 0.12, z * 0.12) * 0.6);
                    else if (y > line - 4) out.lerp(snow, 0.4);
                    tmpM.copy(ridge).lerp(ridge2, k.noise(x * 0.07 + 2, z * 0.07));
                    out.lerp(tmpM, nearK * (1 - k.smooth(MB + 26, MB + 34, y)) * 0.9 + (1 - k.smooth(MB + 4, MB + 12, y)) * 0.6);
                    out.lerp(haze, 0.12 + 0.4 * k.smooth(185, 335, r));
                }
            });
            const mountains = k.add(mtnGeo, k.mat('#ffffff', { vertexColors: true, flat: true, rough: 1, fog: false }), { receive: false });
            mountains.frustumCulled = false;

            // --- mist banks drifting along the valley and round the mountains' feet -------------
            const mistTex = blobTex(k, 128, 48, 1.3);
            const mistGeo = k.geo(new T.PlaneGeometry(1, 1));
            const mist = [];
            [[-60, 95, RIVER + 3, 70, 7, 0.55], [40, 120, RIVER + 4, 90, 8, 0.5], [130, 110, RIVER + 4, 80, 8, 0.5], [-140, 120, RIVER + 4, 90, 9, 0.5],
                [-40, 205, 2, 130, 15, 0.7], [80, 215, 3, 150, 16, 0.68], [200, 200, 2, 120, 15, 0.6], [-170, 200, 2, 130, 15, 0.6], [10, 175, -2, 100, 10, 0.5]].forEach((m, i) => {
                const mat = k.basic('#ffffff', { map: mistTex, transparent: true, opacity: m[5], depthWrite: false });
                const mesh = k.add(mistGeo, mat, { x: F.x(m[0], m[1]), y: m[2], z: F.z(m[0], m[1]), sx: m[3], sy: m[4], ry: F.face, receive: false });
                mist.push({ m: mesh, u: m[0], v: m[1], sp: k.range(0.35, 0.7) * (i % 2 ? 1 : -1) });
            });

            // --- sky: clouds hugging the peaks, birds over the valley -----------------------------
            const clouds = [];
            for (let i = 0; i < 7; i++) {
                const u = k.range(-260, 260), v = k.range(170, 260);
                clouds.push({ c: k.puff(F.x(u, v), k.range(24, 40), F.z(u, v), k.range(5, 8.5), '#ffffff', '#e4ecf4'), u: u, v: v, sp: k.range(0.6, 1.2) });
            }
            const birds = k.flock({ cx: F.x(-6, 60), cy: 7, cz: F.z(-6, 60), count: Math.round(5 * k.detail) + 2, radius: 18, size: 1.6, speed: 0.16 });

            return {
                update: function (dt, t) {
                    bannerCloth.update(t);
                    pennant.update(t);
                    fallTex.offset.y = -(t * 0.55) % 1;
                    foam.scale.set(1.4 + Math.sin(t * 2.1) * 0.07, 0.6 + Math.sin(t * 2.7) * 0.05, 1.4 + Math.cos(t * 1.9) * 0.07);
                    if (smokeAnim) smokeAnim.update(t);
                    mist.forEach(m => {
                        m.u += m.sp * dt;
                        if (m.u > 300) m.u = -300; else if (m.u < -300) m.u = 300;
                        m.m.position.x = F.x(m.u, m.v); m.m.position.z = F.z(m.u, m.v);
                    });
                    clouds.forEach(c => {
                        c.u += c.sp * dt;
                        if (c.u > 300) c.u = -300;
                        c.c.position.x = F.x(c.u, c.v); c.c.position.z = F.z(c.u, c.v);
                    });
                    birds.update(dt, t);
                }
            };
        }
    });

    // =================================================================================
    // Boardwalk - Amusement Park. A seaside boardwalk at sunset: the park stands on a
    // round plaza of planks; lamp posts and bunting line the rail, then the beach
    // (beach huts, umbrellas, a lifeguard tower), the glittering sea with sailboats,
    // a long pier of lights and a lighthouse on the headland.
    // =================================================================================
    const BW = { DECK_Z: -12.5, SAND: -1.2, WATER_Z: -34.5, SEA: -1.9 };
    BNB.Worlds.register('boardwalk', {
        name: 'Seaside Boardwalk',
        sky: ['#4a5aa8', '#b17fba', '#ffd7a2'],
        fog: { color: '#ffd7a2', near: 90, far: 520 },
        light: { sky: '#f1e3ea', ground: '#7f6f72', hemi: 1.2, sun: '#ffdcb4', sunIntensity: 2.7, dir: [-0.8, 0.78, 0.32] },
        dust: '#d9c3a0',
        // The deck (top at 0) and the beach below it; past the beach, the sea.
        ground: [
            { half: [60, 1, (50 - BW.DECK_Z) / 2], pos: [0, -1, (50 + BW.DECK_Z) / 2] },
            { half: [60, 1, (BW.DECK_Z - BW.WATER_Z) / 2], pos: [0, BW.SAND - 1, (BW.DECK_Z + BW.WATER_Z) / 2] }
        ],
        water: BW.SEA,
        build: function (k) {
            const T = k.THREE, G = k.G, P = k.plot, F = camFrame(k);
            const DZ = BW.DECK_Z, SAND = BW.SAND, WZ = BW.WATER_Z, SEA = BW.SEA;
            const cx = F.cx, cz = F.cz;
            // The setting sun: low on the horizon, left of the park.
            const SUN = { u: -92, v: 310 }, sunX = F.x(SUN.u, SUN.v), sunZ = F.z(SUN.u, SUN.v);
            const sunDir = new T.Vector2(sunX - cx, sunZ - cz).normalize();

            // --- the beach, the headland and the far coast -------------------------------------
            const HL = { u: 100, v: 205 };
            function hh(x, z) {
                const u = F.u(x, z), v = F.v(x, z);
                let h;
                if (z > DZ) h = SAND - 0.4;
                else if (z > WZ) h = SAND + (k.noise(x * 0.3, z * 0.3) - 0.5) * 0.12 * k.smooth(DZ, DZ - 3, z);
                else h = Math.max(SEA - 4, SAND - (WZ - z) * 0.3);
                const dL = Math.hypot(u - HL.u, v - HL.v);
                if (dL < 52) h = Math.max(h, SEA - 1 + 19 * Math.pow(1 - dL / 52, 0.55) * (0.75 + 0.5 * k.fbm(x * 0.05, z * 0.05, 2)));
                if (u < -50 && v > 140) h = Math.max(h, SEA - 2 + k.smooth(-50, -120, u) * k.smooth(140, 185, v) * k.smooth(262, 222, v - (u + 120) * 0.6) * (6 + 14 * k.fbm(x * 0.018, z * 0.018, 3)));
                return h;
            }
            const sandC = new T.Color('#efd5a4'), sand2 = new T.Color('#e6c793'), wet = new T.Color('#c9a874'), deep = new T.Color('#9c8460'),
                grassC = new T.Color('#7f9a5e'), rockC = new T.Color('#9a8a7c'), tmp = new T.Color();
            k.terrain({
                R: 330, segs: 110, warp: 2.0, cx: cx, cz: cz, height: hh, color: function (x, z, y, out) {
                    out.copy(sandC).lerp(sand2, k.noise(x * 0.4, z * 0.4) * 0.6);
                    if (z < WZ + 3) out.lerp(wet, k.smooth(WZ + 3, WZ, z));
                    if (y < SEA) out.lerp(deep, 0.7);
                    if (y > SAND + 0.5) { tmp.copy(rockC).lerp(grassC, k.smooth(4, 9, y) * 0.9); out.lerp(tmp, k.smooth(SAND + 0.5, SAND + 2.5, y)); }
                }
            });
            const sea = k.sea({
                y: SEA, R: 330, cx: cx, cz: cz, near: '#2c7cae', far: '#e7b597', fade: 330, amp: 0.11, animR: 70,
                tint: function (x, z, out) {
                    const dx = x - cx, dz = z - cz, L = Math.hypot(dx, dz) || 1;
                    const al = (dx * sunDir.x + dz * sunDir.y) / L;
                    out.lerp(tmp.set('#ffd08a'), Math.pow(Math.max(0, al), 60) * 0.7);
                }
            });
            // Lazy foam along the waterline.
            const foamG = k.geo(new T.PlaneGeometry(600, 0.9, 1, 1));
            foamG.rotateX(-Math.PI / 2);
            const foamLine = k.add(foamG, k.basic('#fff8ec', { transparent: true, opacity: 0.75 }), { x: cx, y: SEA + 0.05, z: WZ - 1.6, receive: false });

            // --- the boardwalk deck: planks along x, a round plaza of crosswise planks --------
            const planks = function (base, gap, across) {
                return pixelTex(k, 128, 128, function (px, py, o) {
                    const a = across ? px : py, b = across ? py : px;
                    const row = Math.floor(a / 16), f = a % 16, seg = Math.floor((b + k.hash(row, 5) * 128) / 64);
                    const s = k.hash(row * 13 + seg, 7), grain = Math.sin(b * 0.35 + row * 3 + k.hash(row, seg) * 9) * 4 + (k.hash(px, py) - 0.5) * 8;
                    let r = base[0] + (s - 0.5) * 26 + grain, g = base[1] + (s - 0.5) * 20 + grain, bb = base[2] + (s - 0.5) * 14 + grain;
                    if (f < 1 || ((b + k.hash(row, 5) * 128) % 64) < 1) { r = gap[0]; g = gap[1]; bb = gap[2]; }
                    if ((f === 3 || f === 12) && ((b + k.hash(row, 5) * 128) % 64) > 2 && ((b + k.hash(row, 5) * 128) % 64) < 4) { r -= 40; g -= 40; bb -= 40; }
                    o[0] = r; o[1] = g; o[2] = bb;
                }, across ? null : [1, 1]);
            };
            const deckTex = planks([186, 160, 128], [92, 74, 58]);
            const DW = 140, DD = 50 - DZ;
            deckTex.repeat.set(DW / 4, DD / 4); deckTex.wrapS = deckTex.wrapT = T.RepeatWrapping;
            const deckG = k.geo(new T.PlaneGeometry(DW, DD));
            deckG.rotateX(-Math.PI / 2);
            k.add(deckG, k.tmat(deckTex, { rough: 0.85 }), { x: 0, y: 0, z: (50 + DZ) / 2 });
            // The deck's edge, its stringer and pilings down into the sand.
            k.prop([
                { g: G.box(DW, 0.45, 0.3), y: -0.22, z: DZ - 0.12, c: '#8a6544' },
                { g: G.box(DW, 0.12, 0.34), y: -0.02, z: DZ - 0.12, c: '#f2ebdd' }
            ]);
            const pilings = [];
            for (let x = -68; x <= 68; x += 3.2) pilings.push({ x: x, y: (SAND - 0.5) / 2 - 0.2, z: DZ + 0.15 });
            k.instanced(k.geo(new T.CylinderGeometry(0.17, 0.2, -SAND + 0.5, 6)), k.mat('#6b5038', { flat: true }), pilings);
            // The plaza the park stands on.
            const plazaTex = pixelTex(k, 256, 256, function (px, py, o) {
                const row = Math.floor(px / 12), f = px % 12, seg = Math.floor((py + k.hash(row, 2) * 256) / 96);
                const s = k.hash(row * 7 + seg, 9), grain = Math.sin(py * 0.3 + row * 5) * 4 + (k.hash(px, py) - 0.5) * 8;
                let r = 220 + (s - 0.5) * 22 + grain, g = 172 + (s - 0.5) * 18 + grain, b = 112 + (s - 0.5) * 12 + grain;
                if (f < 1 || ((py + k.hash(row, 2) * 256) % 96) < 1) { r = 120; g = 84; b = 52; }
                o[0] = r; o[1] = g; o[2] = b;
            });
            const PR = P + 0.45;
            const plaza = k.geo(new T.CircleGeometry(PR, 64));
            plaza.rotateX(-Math.PI / 2);
            k.add(plaza, k.tmat(plazaTex, { rough: 0.8 }), { x: cx, y: 0.006, z: cz });
            const ring = k.geo(new T.RingGeometry(PR, PR + 0.32, 72));
            ring.rotateX(-Math.PI / 2);
            k.add(ring, k.mat('#2f6f8f', { rough: 0.6 }), { x: cx, y: 0.008, z: cz });
            const ring2 = k.geo(new T.RingGeometry(PR + 0.32, PR + 0.44, 72));
            ring2.rotateX(-Math.PI / 2);
            k.add(ring2, k.mat('#f2ebdd', { rough: 0.6 }), { x: cx, y: 0.008, z: cz });
            // Brass studs round the plaza.
            const studs = [];
            for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; studs.push({ x: cx + Math.cos(a) * (PR + 0.16), y: 0.02, z: cz + Math.sin(a) * (PR + 0.16) }); }
            k.instanced(k.geo(new T.CylinderGeometry(0.07, 0.07, 0.03, 8)), k.mat('#f2c94c', { rough: 0.35, metal: 0.6 }), studs);

            // --- the rail along the back, lamp posts with warm globes, bunting between ---------
            const railZ = DZ + 0.25;
            const rails = [];
            for (let x = -68; x <= 68; x += 1.6) rails.push({ x: x, y: 0.5, z: railZ });
            k.instanced(k.geo(new T.BoxGeometry(0.12, 1.0, 0.12)), k.mat('#f4eee2', { rough: 0.7 }), rails, { cast: true });
            k.prop([
                { g: G.box(DW - 4, 0.12, 0.18), y: 1.02, z: railZ, c: '#f4eee2' },
                { g: G.box(DW - 4, 0.07, 0.08), y: 0.55, z: railZ, c: '#f4eee2' }
            ], { cast: true });
            const lampAt = [];
            for (let x = -56; x <= 64; x += 8) if (Math.abs(x - cx) > 9) lampAt.push([x, railZ + 0.55]);
            // A few lamps along the front of the plaza too, wherever they leave the view clear.
            [[-15, 3], [16, 0], [-18, 13], [20, 11]].forEach(p => { if (k.free(p[0], p[1], 0.5, 4)) lampAt.push(p); });
            const lampG = k.merge([
                { g: G.cyl(0.26, 0.32, 0.3, 8), y: 0.15, c: '#24433a' }, { g: G.cyl(0.07, 0.11, 3.3, 8), y: 1.8, c: '#24433a' },
                { g: G.cyl(0.14, 0.14, 0.12, 8), y: 0.9, c: '#24433a' }, { g: G.cyl(0.12, 0.12, 0.1, 8), y: 3.3, c: '#24433a' },
                { g: G.box(1.3, 0.07, 0.07), y: 3.45, c: '#24433a' },
                { g: G.cone(0.2, 0.2, 8), x: -0.62, y: 3.88, c: '#24433a' }, { g: G.cone(0.2, 0.2, 8), x: 0.62, y: 3.88, c: '#24433a' },
                { g: G.cyl(0.03, 0.03, 0.3, 4), x: -0.62, y: 3.55, c: '#24433a' }, { g: G.cyl(0.03, 0.03, 0.3, 4), x: 0.62, y: 3.55, c: '#24433a' },
                { g: G.ball(0.1, 0), y: 3.62, c: '#f2c94c' }
            ]);
            k.instanced(lampG, k.vmat(), lampAt.map(p => ({ x: p[0], z: p[1] })), { cast: true });
            const bulbs = [];
            lampAt.forEach(p => { bulbs.push({ x: p[0] - 0.62, y: 3.62, z: p[1] }, { x: p[0] + 0.62, y: 3.62, z: p[1] }); });
            const glowTex = k.glowTexture('rgba(255,214,140,1)', 'rgba(255,170,90,0)');

            // Bunting looping from lamp to lamp along the rail.
            const spans = [];
            const railLamps = lampAt.filter(p => Math.abs(p[1] - (railZ + 0.55)) < 0.01).sort((a, b) => a[0] - b[0]);
            for (let i = 0; i + 1 < railLamps.length; i++) {
                const a = railLamps[i], b = railLamps[i + 1];
                if (b[0] - a[0] > 12) continue;
                spans.push([[a[0] + 0.62, 3.4, a[1]], [b[0] - 0.62, 3.4, b[1]], 0.75]);
            }
            const flagsB = bunting(k, spans, ['#e94b4b', '#f6c344', '#46b3e6', '#5cc77a', '#f28bc0', '#ffffff', '#9a7cf0']);

            // Benches facing the sea, between the lamps.
            const bench = k.merge([
                { g: G.box(1.8, 0.08, 0.5), y: 0.48, c: '#b07a48' }, { g: G.box(1.8, 0.4, 0.06), y: 0.82, z: 0.25, rx: -0.15, c: '#b07a48' },
                { g: G.box(0.08, 0.5, 0.5), x: -0.8, y: 0.25, c: '#24433a' }, { g: G.box(0.08, 0.5, 0.5), x: 0.8, y: 0.25, c: '#24433a' },
                { g: G.box(0.08, 0.5, 0.06), x: -0.8, y: 0.75, z: 0.27, c: '#24433a' }, { g: G.box(0.08, 0.5, 0.06), x: 0.8, y: 0.75, z: 0.27, c: '#24433a' }
            ]);
            const benches = [];
            railLamps.forEach((p, i) => { if (i % 2 === 0 && Math.abs(p[0] + 4 - cx) > 10) benches.push({ x: p[0] + 4, z: railZ + 1.0 }); });
            k.instanced(bench, k.vmat(), benches, { cast: true });

            // --- carts on the deck: popcorn on the left, a balloon seller on the right --------
            const popAt = [F.x(-11.5, 4.5), F.z(-11.5, 4.5)];
            if (k.free(popAt[0], popAt[1], 1.0, 2.6)) {
                const parts = [
                    { g: G.box(1.5, 0.9, 1.0), y: 0.85, c: '#d8423a' }, { g: G.box(1.56, 0.12, 1.06), y: 1.34, c: '#f6efe0' },
                    { g: G.box(1.3, 0.9, 0.85), y: 1.85, c: '#fff4c8' }, { g: G.box(1.2, 0.5, 0.75), y: 1.6, c: '#ffe08a' },
                    { g: G.cyl(0.32, 0.32, 0.08, 10), x: -0.55, y: 0.32, z: 0.52, rx: Math.PI / 2, c: '#2b2b2b' }, { g: G.cyl(0.32, 0.32, 0.08, 10), x: 0.55, y: 0.32, z: 0.52, rx: Math.PI / 2, c: '#2b2b2b' },
                    { g: G.cyl(0.04, 0.04, 1.5, 5), x: 0.8, y: 1.2, c: '#9aa3ad' }
                ];
                parts.push(...stripes(k, 8, ['#d8423a', '#f6efe0'], (a0, da) => new T.ConeGeometry(1.05, 0.5, 2, 1, true, a0, da), { y: 2.55 }));
                parts.push({ g: G.ball(0.1, 0), y: 2.85, c: '#f2c94c' });
                k.prop(parts, { x: popAt[0], z: popAt[1], ry: F.face + 0.5, cast: true });
            }
            const balAt = [F.x(11.5, 6), F.z(11.5, 6)];
            const balColors = ['#e94b4b', '#46b3e6', '#f6c344', '#5cc77a', '#f28bc0', '#9a7cf0'];
            let bunch = null;
            if (k.free(balAt[0], balAt[1], 1.0, 3.8)) {
                k.prop([
                    { g: G.box(1.2, 0.7, 0.8), y: 0.6, c: '#3d7fc2' }, { g: G.box(1.26, 0.1, 0.86), y: 0.98, c: '#f6efe0' },
                    { g: G.cyl(0.28, 0.28, 0.08, 10), x: -0.45, y: 0.28, z: 0.42, rx: Math.PI / 2, c: '#2b2b2b' }, { g: G.cyl(0.28, 0.28, 0.08, 10), x: 0.45, y: 0.28, z: 0.42, rx: Math.PI / 2, c: '#2b2b2b' },
                    { g: G.cyl(0.035, 0.035, 1.2, 5), y: 1.6, c: '#9aa3ad' }
                ], { x: balAt[0], z: balAt[1], ry: F.face, cast: true });
                const bp = [];
                for (let i = 0; i < 11; i++) {
                    const a = i * 2.39996, r = 0.18 + Math.sqrt(i / 11) * 0.6, x = Math.cos(a) * r, z = Math.sin(a) * r, y = 1.6 + 0.4 * (1 - i / 11) + k.range(0, 0.25);
                    bp.push({ g: G.sphere(0.27, 10, 8), x: x, y: y + 0.5, z: z, sy: 1.2, c: balColors[i % balColors.length] });
                    bp.push({ g: G.cone(0.05, 0.08, 5), x: x, y: y + 0.17, z: z, rx: Math.PI, c: balColors[i % balColors.length] });
                    const L = Math.hypot(x, y - 1.15, z);
                    bp.push({ g: G.cyl(0.008, 0.008, L, 3), x: x / 2, y: (y + 1.15) / 2 + 0.05, z: z / 2, q: new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(x, y - 1.15, z).normalize()), c: '#f4f4f4' });
                }
                bunch = k.prop(bp, { x: balAt[0], y: 0.6, z: balAt[1], cast: true }, { rough: 0.35 });
            }
            // Now and then a balloon slips away and floats up over the sea.
            const balloonG = k.merge([{ g: G.sphere(0.27, 10, 8), y: 0.5, sy: 1.2, c: '#ffffff' }, { g: G.cone(0.05, 0.08, 5), y: 0.17, rx: Math.PI, c: '#ffffff' }, { g: G.cyl(0.008, 0.008, 0.9, 3), y: -0.3, c: '#f4f4f4' }]);
            const escapes = [];
            const from = bunch ? [balAt[0], 2.4, balAt[1]] : [F.x(10, 8), 2.4, F.z(10, 8)];
            balColors.slice(0, 4).forEach((c, i) => {
                escapes.push(k.animInstanced(balloonG, k.mat(c, { rough: 0.35 }), [{ ph: i / 4, sw: k.range(0, 6) }], function (it, t, o) {
                    const f = (t / 70 + it.ph) % 1, up = f * f * 70 + f * 6;
                    o.x = from[0] + F.bx * f * 120 + Math.sin(t * 0.6 + it.sw) * 1.2 * f + F.rx * f * 25 * Math.sin(it.sw);
                    o.z = from[2] + F.bz * f * 120 + Math.cos(t * 0.5 + it.sw) * 1.2 * f + F.rz * f * 25 * Math.sin(it.sw);
                    o.y = from[1] + up; o.rz = Math.sin(t * 1.3 + it.sw) * 0.15;
                    o.s = Math.min(1, f * 25) * 1.6;
                }));
            });

            // A high-striker bell tower off to the right.
            const hsAt = [F.x(19, 9), F.z(19, 9)];
            if (k.free(hsAt[0], hsAt[1], 0.8, 5)) {
                const hs = [{ g: G.box(1.2, 0.3, 1.0), y: 0.15, c: '#f6efe0' }, { g: G.box(0.4, 0.2, 0.4), y: 0.4, c: '#d8423a' }];
                for (let i = 0; i < 10; i++) hs.push({ g: G.box(0.36, 0.48, 0.2), y: 0.6 + i * 0.48, z: -0.3, c: i % 2 ? '#f6efe0' : '#d8423a' });
                hs.push({ g: G.sphere(0.32, 12, 8), y: 5.6, z: -0.3, sy: 0.7, c: '#f2c94c' }, { g: G.box(0.06, 4.9, 0.06), y: 3.0, z: -0.15, c: '#6b6b6b' });
                k.prop(hs, { x: hsAt[0], z: hsAt[1], ry: F.face - 0.4, cast: true }, { rough: 0.5 });
            }

            // --- down on the beach: huts, umbrellas and towels, a lifeguard tower --------------
            const huts = [], hutCols = [['#f4a7b9', '#ffffff'], ['#a8e0c8', '#ffffff'], ['#a7c8f0', '#ffffff'], ['#f8dc84', '#ffffff'], ['#c9b3ec', '#ffffff'], ['#f6b47e', '#ffffff']];
            for (let i = 0, x = -64; x < -5; x += 3.2, i++) {
                const c = hutCols[i % hutCols.length], z = DZ - 5.5;
                huts.push({ g: G.box(2.4, 2.2, 2.0), x: x, y: SAND + 1.1, z: z, c: c[0] },
                    { g: G.prism([[-1.42, 0], [1.42, 0], [0, 0.95]], 2.3), x: x, y: SAND + 2.2, z: z, c: c[1] },
                    { g: G.box(0.9, 1.6, 0.05), x: x, y: SAND + 0.8, z: z + 1.02, c: i % 2 ? '#ffffff' : '#f4eee2' }, { g: G.box(2.5, 0.16, 0.06), x: x, y: SAND + 2.15, z: z + 1.03, c: '#ffffff' },
                    { g: G.box(2.5, 0.12, 2.1), x: x, y: SAND + 0.06, z: z, c: '#c79c6a' });
            }
            k.prop(huts, { cast: true });
            const beachParts = [];
            const umbCols = [['#e94b4b', '#ffffff'], ['#46b3e6', '#ffffff'], ['#f6c344', '#ffffff'], ['#5cc77a', '#ffffff'], ['#f28bc0', '#ffffff']];
            for (let i = 0, n = 0; i < 80 && n < 11; i++) {
                const x = k.range(4, 62), z = k.range(WZ + 4, DZ - 3.5);
                if (Math.abs(F.u(x, z)) < 11 || beachParts.some(p => p.um && Math.hypot(p.x - x, p.z - z) < 4.2)) continue;
                const c = umbCols[n % umbCols.length], tilt = k.range(-0.18, 0.18);
                const um = stripes(k, 8, c, (a0, da) => new T.ConeGeometry(1.25, 0.45, 2, 1, true, a0, da), { x: x + Math.sin(tilt) * 2, y: SAND + 2.15, z: z, rz: -tilt });
                um[0].um = true;
                beachParts.push(...um, { g: G.cyl(0.04, 0.04, 2.3, 5), x: x + Math.sin(tilt), y: SAND + 1.05, z: z, rz: -tilt, c: '#f4f4f4' });
                const tc = k.pick(['#46b3e6', '#e94b4b', '#f6c344', '#5cc77a', '#f28bc0', '#ffffff']), ta = k.range(-0.5, 0.5);
                beachParts.push({ g: G.box(0.9, 0.03, 1.8), x: x + 0.9, y: SAND + 0.02, z: z + 0.6, ry: ta, c: tc }, { g: G.box(0.9, 0.035, 0.3), x: x + 0.9 + Math.sin(ta) * 0.6, y: SAND + 0.025, z: z + 0.6 + Math.cos(ta) * 0.6, ry: ta, c: '#ffffff' });
                n++;
            }
            // A sandcastle with a little flag, a bucket and spade.
            beachParts.push({ g: G.cyl(0.9, 1.0, 0.5, 10), x: -6, y: SAND + 0.25, z: DZ - 9, c: '#e9c98f' }, { g: G.cyl(0.45, 0.5, 0.55, 8), x: -6, y: SAND + 0.75, z: DZ - 9, c: '#e9c98f' },
                { g: G.cone(0.3, 0.4, 8), x: -6, y: SAND + 1.22, z: DZ - 9, c: '#e2bf82' },
                ...[0, 1, 2, 3].map(i => ({ g: G.cyl(0.22, 0.26, 0.6, 8), x: -6 + Math.cos(i * 1.5708 + 0.78) * 0.85, y: SAND + 0.55, z: DZ - 9 + Math.sin(i * 1.5708 + 0.78) * 0.85, c: '#e9c98f' })),
                { g: G.cyl(0.015, 0.015, 0.5, 3), x: -6, y: SAND + 1.6, z: DZ - 9, c: '#6b4a2a' }, { g: G.box(0.28, 0.16, 0.01), x: -5.86, y: SAND + 1.75, z: DZ - 9, c: '#e94b4b' },
                { g: G.cyl(0.2, 0.15, 0.3, 8), x: -4.5, y: SAND + 0.15, z: DZ - 8.4, c: '#46b3e6' });
            // The lifeguard's hut on stilts, with a red-and-white flag.
            const lgx = 34, lgz = WZ + 4.5;
            beachParts.push(
                ...[[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].map(p => ({ g: G.box(0.15, 2.4, 0.15), x: lgx + p[0], y: SAND + 1.2, z: lgz + p[1], c: '#f4eee2' })),
                { g: G.box(2.4, 0.15, 2.4), x: lgx, y: SAND + 2.45, z: lgz, c: '#c79c6a' }, { g: G.box(2.0, 1.4, 1.8), x: lgx, y: SAND + 3.2, z: lgz + 0.2, c: '#e94b4b' },
                { g: G.box(2.04, 0.5, 1.84), x: lgx, y: SAND + 3.3, z: lgz + 0.2, c: '#ffffff' }, { g: G.box(2.4, 0.12, 2.3), x: lgx, y: SAND + 3.97, z: lgz + 0.2, c: '#f4eee2' },
                { g: G.box(0.8, 0.08, 1.6), x: lgx, y: SAND + 1.2, z: lgz + 1.6, rx: 0.9, c: '#c79c6a' },
                { g: G.cyl(0.03, 0.03, 1.6, 4), x: lgx + 1, y: SAND + 4.8, z: lgz, c: '#9aa3ad' },
                { g: G.box(0.6, 0.4, 0.02), x: lgx + 1.3, y: SAND + 5.35, z: lgz, c: '#e94b4b' }, { g: G.box(0.6, 0.2, 0.025), x: lgx + 1.3, y: SAND + 5.25, z: lgz, c: '#f6c344' });
            k.prop(beachParts, { cast: true });

            // --- the pier: planks on pilings out to a domed pavilion, lamps all the way --------
            const pDir = new T.Vector2(F.bx * 0.95 + F.rx * 0.31, F.bz * 0.95 + F.rz * 0.31).normalize();
            const pS = { x: F.x(24, 0) + 0, z: DZ - 0.2 }, pL = 96, pAng = Math.atan2(pDir.x, pDir.y);
            const pierParts = [], pierBulbs = [];
            const along = (d, side) => ({ x: pS.x + pDir.x * d + pDir.y * side, z: pS.z + pDir.y * d - pDir.x * side });
            pierParts.push({ g: G.box(4.2, 0.3, pL), x: pS.x + pDir.x * pL / 2, y: -0.15, z: pS.z + pDir.y * pL / 2, ry: pAng, c: '#b98c5e' });
            pierParts.push({ g: G.box(0.12, 0.12, pL), x: along(pL / 2, 2.0).x, y: 1.0, z: along(pL / 2, 2.0).z, ry: pAng, c: '#f4eee2' },
                { g: G.box(0.12, 0.12, pL), x: along(pL / 2, -2.0).x, y: 1.0, z: along(pL / 2, -2.0).z, ry: pAng, c: '#f4eee2' });
            for (let d = 2; d < pL; d += 4) {
                [-1.8, 1.8].forEach(s => { const p = along(d, s); pierParts.push({ g: G.cyl(0.18, 0.2, 6, 6), x: p.x, y: -3.2, z: p.z, c: '#6b5038' }); });
                [-2.0, 2.0].forEach(s => { const p = along(d, s); pierParts.push({ g: G.box(0.1, 1.0, 0.1), x: p.x, y: 0.5, z: p.z, c: '#f4eee2' }); });
                if (d % 12 === 10) [-2.0, 2.0].forEach(s => {
                    const p = along(d, s);
                    pierParts.push({ g: G.cyl(0.07, 0.09, 2.6, 6), x: p.x, y: 1.3, z: p.z, c: '#24433a' });
                    pierBulbs.push({ x: p.x, y: 2.75, z: p.z, s: 1.25 });
                });
            }
            const end = along(pL + 4, 0);
            pierParts.push({ g: G.cyl(6.2, 6.2, 0.4, 16), x: end.x, y: -0.2, z: end.z, c: '#b98c5e' },
                { g: G.cyl(4.4, 4.6, 3.4, 16), x: end.x, y: 1.7, z: end.z, c: '#f6efe0' }, { g: G.cyl(4.8, 4.8, 0.4, 16), x: end.x, y: 3.5, z: end.z, c: '#e94b4b' },
                { g: G.sphere(3.6, 16, 10), x: end.x, y: 3.7, z: end.z, sy: 1.15, c: '#4fb3a6' }, { g: G.cone(0.5, 1.6, 8), x: end.x, y: 8.4, z: end.z, c: '#f2c94c' },
                { g: G.cyl(0.04, 0.04, 2, 4), x: end.x, y: 9.8, z: end.z, c: '#9aa3ad' });
            for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pierBulbs.push({ x: end.x + Math.cos(a) * 4.82, y: 3.5, z: end.z + Math.sin(a) * 4.82, s: 0.9 }); }
            for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; pierParts.push({ g: G.box(1.1, 1.4, 0.1), x: end.x + Math.cos(a) * 4.52, y: 1.9, z: end.z + Math.sin(a) * 4.52, ry: -a + Math.PI / 2, c: '#ffd98a' }); }
            k.prop(pierParts);

            // --- a little harbour town on the far coast, trees on both headlands ---------------
            const townG = [k.houseGeo('#f7e6d6', '#d0654a'), k.houseGeo('#e3f0f4', '#5f7fa8'), k.houseGeo('#fbefc8', '#7a9a5a')];
            const town = [[], [], []], trees = [];
            for (let i = 0, n = 0; i < 400 && n < 12; i++) {
                const u = k.range(-125, -62), v = k.range(146, 205), x = F.x(u, v), z = F.z(u, v), y = hh(x, z);
                if (y < SEA + 0.8 || y > SEA + 9 || town.some(l => l.some(h => Math.hypot(h.x - x, h.z - z) < 6))) continue;
                town[n % 3].push({ x: x, y: y - 0.3, z: z, s: k.range(1.9, 2.4), ry: F.face + k.range(-0.5, 0.5) });
                n++;
            }
            for (let i = 0, n = 0; i < 600 && n < 26; i++) {
                const right = i % 2 === 0;
                const u = right ? HL.u + k.range(-40, 40) : k.range(-160, -60), v = right ? HL.v + k.range(-30, 40) : k.range(150, 260);
                const x = F.x(u, v), z = F.z(u, v), y = hh(x, z);
                if (y < SEA + 1.5 || (right && Math.hypot(u - HL.u, v - HL.v) < 9) || town.some(l => l.some(h => Math.hypot(h.x - x, h.z - z) < 4))) continue;
                trees.push({ x: x, y: y - 0.4, z: z, s: k.range(1.8, 2.8), ry: k.range(0, 6) });
                n++;
            }
            townG.forEach((g, i) => { if (town[i].length) k.instanced(g, k.vmat(), town[i]); });
            k.instanced(k.treeGeo('#6f9a4e'), k.vmat(), trees);

            // --- the lighthouse on the headland, its beam sweeping slowly ---------------------
            const lhX = F.x(HL.u, HL.v), lhZ = F.z(HL.u, HL.v), lhY = hh(lhX, lhZ) - 0.5;
            const lh = [];
            for (let i = 0; i < 6; i++) lh.push({ g: G.cyl(2.05 - (i + 1) * 0.16, 2.05 - i * 0.16, 2.6, 14), y: 1.3 + i * 2.6, c: i % 2 ? '#e94b4b' : '#f8f4ec' });
            lh.push({ g: G.cyl(1.8, 1.8, 0.35, 14), y: 15.75, c: '#30343c' },
                { g: G.cone(1.15, 1.4, 12), y: 18.5, c: '#30343c' }, { g: G.ball(0.25, 0), y: 19.3, c: '#f2c94c' },
                { g: G.box(3, 2.4, 3), x: 3.2, y: 1.2, c: '#f8f4ec' }, { g: G.prism([[-1.7, 0], [1.7, 0], [0, 1.4]], 3.2), x: 3.2, y: 2.4, c: '#e94b4b' });
            k.prop(lh, { x: lhX, y: lhY, z: lhZ, ry: F.face, s: 1.3 });
            const lamp = k.add(k.geo(new T.CylinderGeometry(0.9, 0.9, 1.8, 10)), k.mat('#fff2c0', { emissive: '#ffd27a', emissiveIntensity: 1.4 }), { x: lhX, y: lhY + 16.9 * 1.3, z: lhZ, s: 1.3, receive: false });
            const beamG = k.geo(new T.ConeGeometry(4, 46, 16, 1, true));
            beamG.translate(0, -23, 0);
            beamG.rotateZ(Math.PI / 2);
            const beamTex = pixelTex(k, 4, 64, function (x, y, o) { const f = 1 - y / 63; o[0] = 255; o[1] = 236; o[2] = 190; o[3] = Math.round(255 * Math.pow(f, 1.6) * 0.9); });
            const beam = new T.Group();
            beam.position.set(lhX, lhY + 16.9 * 1.3, lhZ);
            k.group.add(beam);
            k.add(beamG, k.basic('#ffffff', { map: beamTex, transparent: true, opacity: 0.32, additive: true, depthWrite: false, side: T.DoubleSide }), { parent: beam, receive: false });

            // --- every warm bulb glows, with a soft halo -------------------------------------------
            const allBulbs = bulbs.concat(pierBulbs);
            k.instanced(k.geo(new T.IcosahedronGeometry(0.15, 1)), k.mat('#fff4d0', { emissive: '#ffd27a', emissiveIntensity: 1.3 }), allBulbs, { receive: false });
            const haloG = k.geo(new T.PlaneGeometry(1.5, 1.5));
            k.instanced(haloG, k.basic('#ffffff', { map: glowTex, transparent: true, opacity: 0.55, additive: true, depthWrite: false }),
                allBulbs.map(b => ({ x: b.x, y: b.y, z: b.z, s: (b.s || 1) * 1.1, ry: F.face })), { receive: false });

            // --- sailboats on the sea ------------------------------------------------------------
            const boat = function (sail, hull) {
                return k.merge([
                    { g: G.slab([[-1.6, -0.5], [1.2, -0.5], [1.9, 0], [1.2, 0.5], [-1.6, 0.5]], 0.5), y: -0.2, c: hull },
                    { g: G.cyl(0.05, 0.05, 3.6, 4), y: 2.0, c: '#f4eee2' },
                    { g: G.prism([[0, 0], [0, 3.1], [1.6, 0]], 0.04), x: 0.1, y: 0.45, c: sail },
                    { g: G.prism([[0, 0.2], [0, 2.8], [-1.3, 0.2]], 0.04), x: -0.1, y: 0.45, c: '#fff8ec' }
                ]);
            };
            const boatList = [[], []];
            [[-70, 120], [-30, 175], [40, 140], [-120, 230], [70, 260]].forEach((p, i) => boatList[i % 2].push({ u: p[0], v: p[1], ph: k.range(0, 6), sp: k.range(0.4, 0.8) * (i % 2 ? -1 : 1), s: k.range(1.3, 1.7) }));
            const sailFn = function (it, t, o) {
                let u = it.u + t * it.sp;
                u = ((u + 200) % 400 + 400) % 400 - 200;
                o.x = F.x(u, it.v); o.z = F.z(u, it.v); o.y = SEA + Math.sin(t * 0.9 + it.ph) * 0.08;
                o.ry = F.face + (it.sp > 0 ? Math.PI / 2 : -Math.PI / 2); o.rz = Math.sin(t * 0.7 + it.ph) * 0.05; o.s = it.s;
            };
            const boatsA = k.animInstanced(boat('#e94b4b', '#f8f4ec'), k.vmat({ side: T.DoubleSide }), boatList[0], sailFn);
            const boatsB = k.animInstanced(boat('#46b3e6', '#2f4f7a'), k.vmat({ side: T.DoubleSide }), boatList[1], sailFn);

            // --- the sun, its glow and the glitter path on the water ----------------------------
            const sunY = SEA + 6;
            const sunG = k.geo(new T.CircleGeometry(15, 32));
            k.add(sunG, k.basic('#fff3cf', { fog: false }), { x: sunX, y: sunY, z: sunZ, ry: Math.atan2(cx - sunX, cz - sunZ), receive: false });
            const sunGlow = k.glowTexture('rgba(255,226,160,1)', 'rgba(255,150,100,0)');
            const glowG = k.geo(new T.PlaneGeometry(1, 1));
            const gry = Math.atan2(cx - sunX, cz - sunZ);
            k.add(glowG, k.basic('#ffffff', { map: sunGlow, transparent: true, opacity: 0.85, additive: true, depthWrite: false, fog: false }), { x: cx + (sunX - cx) * 1.01, y: sunY, z: cz + (sunZ - cz) * 1.01, sx: 90, sy: 70, ry: gry, receive: false });
            k.add(glowG, k.basic('#ffb27a', { map: sunGlow, transparent: true, opacity: 0.35, additive: true, depthWrite: false, fog: false }), { x: cx + (sunX - cx) * 1.02, y: sunY + 8, z: cz + (sunZ - cz) * 1.02, sx: 330, sy: 130, ry: gry, receive: false });
            const glints = [];
            for (let i = 0; i < 90 * k.detail + 20; i++) {
                const f = Math.pow(k.rand(), 0.7), d = 40 + f * 250, w = (2 + d * 0.06) * (k.rand() - 0.5) * 2;
                const x = cx + sunDir.x * d - sunDir.y * w, z = cz + sunDir.y * d + sunDir.x * w;
                if (z > WZ - 3) continue;
                glints.push({ x: x, y: SEA + 0.12, z: z, ph: k.range(0, 6.28), sx: 0.6 + d * 0.012, sz: 0.25 + d * 0.003, ry: Math.atan2(sunDir.x, sunDir.y) });
            }
            const glintG = k.geo(new T.PlaneGeometry(1, 1));
            glintG.rotateX(-Math.PI / 2);
            const glintAnim = k.animInstanced(glintG, k.basic('#ffe6b0', { transparent: true, opacity: 0.85, additive: true, depthWrite: false }), glints, function (it, t, o) {
                const s = 0.4 + 0.6 * Math.max(0, Math.sin(t * 0.8 + it.ph));
                o.sx = it.sx * s; o.sz = it.sz;
            });

            // --- sky: long pink-gold clouds, gulls --------------------------------------------------
            const clouds = [];
            for (let i = 0; i < 9; i++) {
                const u = k.range(-280, 280), v = k.range(190, 300);
                const c = k.puff(F.x(u, v), k.range(20, 42), F.z(u, v), k.range(6, 10), k.pick(['#ffd9cc', '#ffe3c4', '#f9c8c8']), '#ffb48f');
                c.scale.y *= 0.45;
                c.rotation.y = F.face;
                clouds.push({ c: c, u: u, v: v, sp: k.range(0.5, 1.0) });
            }
            const gulls = k.flock({ cx: F.x(-6, 26), cy: 7.5, cz: F.z(-6, 26), count: Math.round(5 * k.detail) + 2, radius: 14, color: '#fbfaf6', speed: 0.2, size: 1.1 });
            const gulls2 = k.flock({ cx: F.x(40, 60), cy: 9, cz: F.z(40, 60), count: 3, radius: 10, color: '#fbfaf6', speed: 0.17, size: 1.1 });

            return {
                update: function (dt, t) {
                    sea.update(t);
                    foamLine.position.z = WZ - 1.6 + Math.sin(t * 0.5) * 0.5;
                    flagsB.update(t);
                    if (bunch) { bunch.rotation.z = Math.sin(t * 0.9) * 0.03; bunch.rotation.x = Math.sin(t * 0.7 + 1) * 0.03; }
                    escapes.forEach(e => e.update(t));
                    boatsA.update(t); boatsB.update(t);
                    beam.rotation.y = t * 0.35;
                    lamp.material.emissiveIntensity = 1.3 + Math.sin(t * 0.7) * 0.1;
                    glintAnim.update(t);
                    clouds.forEach(c => {
                        c.u += c.sp * dt;
                        if (c.u > 320) c.u = -320;
                        c.c.position.x = F.x(c.u, c.v); c.c.position.z = F.z(c.u, c.v);
                    });
                    gulls.update(dt, t); gulls2.update(dt, t);
                }
            };
        }
    });

    // =================================================================================
    // Space - Space Station. Floating among the stars: no ground at all. A big blue
    // planet curves away below with drifting clouds and a glowing rim of air, a
    // ringed giant and a cratered moon hang in the sky, soft nebulae glow behind,
    // a satellite and a comet drift slowly by.
    // =================================================================================
    BNB.Worlds.register('space', {
        name: 'Among the Stars',
        sky: ['#020309', '#070a1f', '#100d2e'],
        light: { sky: '#a9b5ee', ground: '#3f73c8', hemi: 0.85, sun: '#fffaf0', sunIntensity: 3.2, dir: [-0.6, 0.55, 0.62] },
        dust: '#cfe3ff',
        ground: 'none',
        zeroG: true,
        camera: { el: 8 },
        build: function (k) {
            const T = k.THREE, V = k.view, F = camFrame(k);
            const az = V.az * Math.PI / 180, el = V.el * Math.PI / 180;
            const cam = new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(V.dist).add(V.center);
            /** A point `d` away from the camera, `a` degrees right of the view and `e` degrees up. */
            const sky = function (a, e, d) {
                a *= Math.PI / 180; e *= Math.PI / 180;
                const hx = F.bx * Math.cos(a) + F.rx * Math.sin(a), hz = F.bz * Math.cos(a) + F.rz * Math.sin(a);
                return new T.Vector3(hx * Math.cos(e), Math.sin(e), hz * Math.cos(e)).multiplyScalar(d).add(cam);
            };
            const n3 = (x, y, z, o) => (k.fbm(x, y, o) + k.fbm(y + 7.1, z - 3.3, o) + k.fbm(z + 2.7, x + 5.9, o)) / 3;
            const hi = k.detail > 0.8;
            const updates = [];

            // --- the stars, the Milky Way, gentle twinkling ------------------------------------------
            const starPts = function (n, R, size, colors, band, opacity) {
                const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), cs = colors.map(c => new T.Color(c));
                const ax = new T.Vector3(0.35, 0.82, 0.45).normalize(), u = new T.Vector3(1, 0, 0).cross(ax).normalize(), w = ax.clone().cross(u);
                for (let i = 0; i < n; i++) {
                    let p;
                    if (band) {
                        const a = k.rand() * Math.PI * 2, off = (k.rand() + k.rand() + k.rand() - 1.5) * 0.18;
                        p = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).addScaledVector(ax, off).normalize();
                    } else {
                        const y = k.rand() * 2 - 1, a = k.rand() * Math.PI * 2, r = Math.sqrt(1 - y * y);
                        p = new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
                    }
                    pos[i * 3] = p.x * R + cam.x; pos[i * 3 + 1] = p.y * R + cam.y; pos[i * 3 + 2] = p.z * R + cam.z;
                    const c = cs[Math.floor(k.rand() * cs.length)], b = 0.45 + k.rand() * 0.55;
                    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
                }
                const g = k.geo(new T.BufferGeometry());
                g.setAttribute('position', new T.BufferAttribute(pos, 3));
                g.setAttribute('color', new T.BufferAttribute(col, 3));
                const m = k.geo(new T.PointsMaterial({ size: size, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: opacity || 1, depthWrite: false }));
                const pts = new T.Points(g, m);
                pts.frustumCulled = false;
                pts.renderOrder = -9;
                k.group.add(pts);
                return pts;
            };
            const starCols = ['#ffffff', '#ffffff', '#cfe0ff', '#fff1d6', '#ffd6e8', '#d6fff6'];
            starPts(Math.round(2600 * k.detail) + 500, 380, 1.6, starCols, false);
            starPts(Math.round(2200 * k.detail) + 400, 382, 1.4, ['#ffffff', '#dfe8ff', '#f4e6ff'], true, 0.85);
            const bright = starPts(Math.round(160 * k.detail) + 60, 378, 3.0, ['#ffffff', '#e6efff', '#fff3dc'], false);
            const bright2 = starPts(Math.round(120 * k.detail) + 40, 378, 2.6, ['#ffffff', '#ffe9f4', '#e0fbff'], false);
            // The Milky Way's glow: a soft band round a great circle.
            const bandTex = pixelTex(k, 256, 32, function (x, y, o) {
                const f = Math.abs(y / 31 * 2 - 1), n = k.fbm(x * 0.05, y * 0.12, 3);
                const a = Math.pow(1 - f, 1.8) * (0.35 + 0.9 * n);
                o[0] = 200 + 40 * n; o[1] = 196 + 30 * n; o[2] = 255; o[3] = Math.round(255 * Math.min(1, a));
            });
            bandTex.wrapS = T.RepeatWrapping;
            const bandGeo = k.geo(new T.CylinderGeometry(370, 370, 70, 64, 1, true));
            const band = k.add(bandGeo, k.basic('#9fa6e0', { map: bandTex, transparent: true, opacity: 0.32, additive: true, depthWrite: false, fog: false, side: T.DoubleSide }), { x: cam.x, y: cam.y, z: cam.z, receive: false });
            band.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(0.35, 0.82, 0.45).normalize());
            band.renderOrder = -8;
            bandTex.repeat.set(4, 1);

            // --- nebulae: soft clouds of coloured light far behind everything --------------------
            const nebTex = function (c1, c2, seed) {
                return pixelTex(k, 160, 112, function (x, y, o) {
                    const u = (x + 0.5) / 160 * 2 - 1, v = (y + 0.5) / 112 * 2 - 1;
                    const n = k.fbm(x * 0.03 + seed, y * 0.03 - seed, 4), m = k.fbm(x * 0.06 - seed * 2, y * 0.06 + seed, 3);
                    const r = Math.hypot(u * (1 + 0.3 * Math.sin(seed)), v) + (n - 0.5) * 0.6;
                    const edge = k.smooth(1, 0.45, Math.max(Math.abs(u), Math.abs(v))) * k.smooth(1.05, 0.6, Math.hypot(u, v));
                    const a = Math.max(0, 1 - r) * (0.25 + 1.1 * Math.max(0, n - 0.32)) * edge;
                    o[0] = c1[0] + (c2[0] - c1[0]) * m; o[1] = c1[1] + (c2[1] - c1[1]) * m; o[2] = c1[2] + (c2[2] - c1[2]) * m;
                    o[3] = Math.round(255 * Math.min(1, a * 1.3));
                });
            };
            const plane = k.geo(new T.PlaneGeometry(1, 1));
            const facing = function (mesh) { mesh.lookAt(cam); return mesh; };
            [[6, 6, 360, 300, 190, [196, 86, 214], [86, 104, 240], 1.3, 0.7],
                [-30, 0, 350, 230, 150, [60, 170, 220], [110, 90, 230], 4.1, 0.55],
                [34, 12, 365, 220, 140, [255, 110, 190], [255, 180, 150], 7.7, 0.5],
                [-12, 22, 370, 260, 150, [120, 90, 220], [200, 100, 220], 2.6, 0.4]].forEach(nb => {
                const p = sky(nb[0], nb[1], nb[2]);
                facing(k.add(plane, k.basic('#ffffff', { map: nebTex(nb[5], nb[6], nb[7]), transparent: true, opacity: nb[8], additive: true, depthWrite: false, fog: false }), { x: p.x, y: p.y, z: p.z, sx: nb[3], sy: nb[4], receive: false })).renderOrder = -7;
            });

            // --- the blue planet below, its clouds and its glowing rim of air ---------------------
            const ER = 240, ED = 420, limb = -13.5;
            const eAng = limb - Math.asin(ER / ED) * 180 / Math.PI;
            const eC = sky(2, eAng, ED);
            // Only a cap of the planet can ever be seen, so the texture covers just that cap
            // (pole toward the camera, off the bottom of the picture).
            const CAP = 66 * Math.PI / 180;
            const TW = hi ? 1024 : 512, TH = TW / 4;
            const capPt = function (px, py, W, H) {
                const phi = (px + 0.5) / W * Math.PI * 2, th = (py + 0.5) / H * CAP;
                return [-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th)];
            };
            const landTex = pixelTex(k, TW, TH, function (px, py, o) {
                const q = capPt(px, py, TW, TH), x = q[0], y = q[2], z = q[1];
                const n = n3(x * 2.1 + 5, y * 2.1, z * 2.1 - 3, 4), dry = k.fbm(x * 3 + 9, z * 3 - y, 2);
                let r, g, b;
                if (n > 0.535) {
                    const h = k.smooth(0.535, 0.62, n), f = k.fbm(x * 9 - 2, z * 9 + y * 3, 2);
                    r = 104 - 40 * h + 20 * f; g = 182 - 34 * h + 10 * f; b = 92 - 14 * h;
                    const wood = k.smooth(0.5, 0.6, k.fbm(x * 6 + 3, z * 6 - y * 2, 3));
                    r += (58 - r) * wood * 0.8; g += (128 - g) * wood * 0.8; b += (66 - b) * wood * 0.8;
                    if (n > 0.6) { const m = k.smooth(0.6, 0.66, n); r += (150 - r) * m; g += (138 - g) * m; b += (104 - b) * m; }
                    if (dry > 0.57) { const d = k.smooth(0.57, 0.62, dry); r += (222 - r) * d; g += (192 - g) * d; b += (130 - b) * d; }
                    if (n < 0.545) { r = 236; g = 216; b = 160; }
                } else {
                    const s = k.smooth(0.46, 0.535, n);
                    r = 32 + 58 * s; g = 96 + 96 * s; b = 192 + 40 * s;
                }
                o[0] = r; o[1] = g; o[2] = b;
            });
            const cloudTex = pixelTex(k, TW / 2, TH / 2, function (px, py, o) {
                const q = capPt(px, py, TW / 2, TH / 2), x = q[0], y = q[2], z = q[1];
                const n = n3(x * 2.6 - 4, y * 6.5, z * 2.6 + 8, 4);
                o[0] = 255; o[1] = 255; o[2] = 255; o[3] = Math.round(240 * k.smooth(0.47, 0.62, n));
            });
            const earthTilt = new T.Group();
            earthTilt.position.copy(eC);
            earthTilt.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), cam.clone().sub(eC).normalize());
            k.group.add(earthTilt);
            const segW = hi ? 128 : 72, segH = hi ? 36 : 22;
            const earth = k.add(k.geo(new T.SphereGeometry(ER, segW, segH, 0, Math.PI * 2, 0, CAP)), k.tmat(landTex, { rough: 0.85 }), { parent: earthTilt, receive: false });
            const clouds = k.add(k.geo(new T.SphereGeometry(ER * 1.012, segW, segH, 0, Math.PI * 2, 0, CAP)), k.tmat(cloudTex, { transparent: true, rough: 1, depthWrite: false }), { parent: earthTilt, receive: false });
            earth.frustumCulled = false; clouds.frustumCulled = false;
            // The rim of air: a camera-facing disc, brightest just outside the planet's edge.
            const dE = eC.distanceTo(cam), limbR = ER * dE / Math.sqrt(dE * dE - ER * ER), HS = limbR * 1.22;
            const rimTex = pixelTex(k, 256, 256, function (x, y, o) {
                const r = Math.hypot((x + 0.5) / 128 - 1, (y + 0.5) / 128 - 1) * HS / limbR;
                const out = r > 1 ? Math.exp(-(r - 1) * 38) : Math.exp(-(1 - r) * 60) * 0.7;
                o[0] = 120 + 100 * out; o[1] = 190 + 50 * out; o[2] = 255; o[3] = Math.round(255 * Math.min(1, out));
            });
            facing(k.add(plane, k.basic('#ffffff', { map: rimTex, transparent: true, opacity: 0.95, additive: true, depthWrite: false, fog: false }), { x: eC.x, y: eC.y, z: eC.z, sx: HS * 2, sy: HS * 2, receive: false }));
            updates.push(function (dt) { earth.rotation.y += dt * 0.004; clouds.rotation.y += dt * 0.0056; });

            // --- the ringed giant, up and to the left -------------------------------------------
            const gP = sky(-22, 8.5, 340), GR = 21;
            const giantTex = pixelTex(k, 256, 128, function (x, y, o) {
                const v = y / 128, w = k.fbm(x * 0.03, y * 0.08, 3), b = Math.sin((v + (w - 0.5) * 0.08) * 38) * 0.5 + 0.5, b2 = Math.sin(v * 13 + 1) * 0.5 + 0.5;
                const c1 = [244, 226, 186], c2 = [214, 160, 104], c3 = [184, 110, 70];
                const m = b * 0.7 + w * 0.3;
                o[0] = c1[0] + (c2[0] - c1[0]) * m + (c3[0] - c2[0]) * b2 * 0.4; o[1] = c1[1] + (c2[1] - c1[1]) * m + (c3[1] - c2[1]) * b2 * 0.4; o[2] = c1[2] + (c2[2] - c1[2]) * m + (c3[2] - c2[2]) * b2 * 0.4;
            });
            const giant = new T.Group();
            giant.position.copy(gP);
            giant.rotation.set(0.42, 0, 0.32);
            k.group.add(giant);
            const gBall = k.add(k.geo(new T.SphereGeometry(GR, 48, 32)), k.tmat(giantTex, { rough: 0.9 }), { parent: giant, receive: false });
            const ringTex = pixelTex(k, 256, 256, function (x, y, o) {
                const r = Math.hypot((x + 0.5) / 128 - 1, (y + 0.5) / 128 - 1);
                const f = (r - 0.55) / 0.45;
                if (f < 0 || f > 1) { o[3] = 0; return; }
                const bands = 0.55 + 0.45 * Math.sin(f * 40) * Math.sin(f * 9 + 1);
                const gap = f > 0.58 && f < 0.63 ? 0.15 : 1;
                o[0] = 236; o[1] = 214; o[2] = 178; o[3] = Math.round(255 * Math.min(1, bands * gap * Math.sin(Math.PI * f) * 1.2));
            });
            const ringG = k.geo(new T.RingGeometry(GR * 1.4, GR * 2.55, 96, 1));
            const rp = ringG.attributes.position, ruv = ringG.attributes.uv;
            for (let i = 0; i < rp.count; i++) ruv.setXY(i, rp.getX(i) / (GR * 2.55) * 0.5 + 0.5, rp.getY(i) / (GR * 2.55) * 0.5 + 0.5);
            k.add(ringG, k.tmat(ringTex, { transparent: true, side: T.DoubleSide, rough: 1, depthWrite: false }), { parent: giant, rx: -Math.PI / 2, receive: false });
            updates.push(function (dt) { gBall.rotation.y += dt * 0.012; });
            // A little moon of the giant's.
            const gm = k.add(k.geo(new T.IcosahedronGeometry(3.4, 1)), k.mat('#d9cbb0', { flat: true }), { x: gP.x + 50, y: gP.y - 4, z: gP.z + 6, receive: false });

            // --- the cratered moon, up and to the right ---------------------------------------------
            const mP = sky(20, 9.5, 260), MR = 9;
            const moonG = k.geo(new T.IcosahedronGeometry(MR, 3));
            const mpos = moonG.attributes.position, mcol = new Float32Array(mpos.count * 3);
            const craters = [];
            for (let i = 0; i < 26; i++) { const v = new T.Vector3(k.rand() - 0.5, k.rand() - 0.5, k.rand() - 0.5).normalize(); craters.push({ v: v, r: k.range(0.12, 0.42) }); }
            const mv = new T.Vector3(), mc = new T.Color();
            for (let i = 0; i < mpos.count; i++) {
                mv.fromBufferAttribute(mpos, i).normalize();
                let shade = 0.82 + (k.fbm(mv.x * 3 + 4, mv.y * 3 + mv.z, 3) - 0.5) * 0.3, dent = 0;
                craters.forEach(c => { const d = mv.distanceTo(c.v) / c.r; if (d < 1) { shade -= 0.2 * (1 - d * d); dent = Math.max(dent, (1 - d * d) * c.r * 0.12); } else if (d < 1.25) shade += 0.08; });
                mpos.setXYZ(i, mv.x * MR * (1 - dent), mv.y * MR * (1 - dent), mv.z * MR * (1 - dent));
                mc.setRGB(0.74 * shade, 0.73 * shade, 0.72 * shade);
                mcol[i * 3] = mc.r; mcol[i * 3 + 1] = mc.g; mcol[i * 3 + 2] = mc.b;
            }
            moonG.setAttribute('color', new T.BufferAttribute(mcol, 3));
            moonG.computeVertexNormals();
            const moon = k.add(moonG, k.mat('#ffffff', { vertexColors: true, flat: true, rough: 1, fog: false }), { x: mP.x, y: mP.y, z: mP.z, receive: false });
            updates.push(function (dt) { moon.rotation.y += dt * 0.02; });

            // --- a comet far off, its tail streaming away from the sun --------------------------
            const comet = new T.Group();
            k.group.add(comet);
            const tailTex = pixelTex(k, 32, 128, function (x, y, o) {
                const f = y / 127, w = Math.abs((x + 0.5) / 16 - 1);
                const a = Math.pow(1 - f, 1.4) * Math.max(0, 1 - w / (0.25 + 0.75 * f));
                o[0] = 200 + 55 * (1 - f); o[1] = 230; o[2] = 255; o[3] = Math.round(255 * a);
            });
            const tail = k.geo(new T.PlaneGeometry(1, 1));
            tail.translate(0, -0.5, 0);
            k.add(tail, k.basic('#ffffff', { map: tailTex, transparent: true, opacity: 0.85, additive: true, depthWrite: false, fog: false, side: T.DoubleSide }), { parent: comet, sx: 7, sy: 46, rz: 0, receive: false });
            k.add(tail, k.basic('#bfe0ff', { map: tailTex, transparent: true, opacity: 0.4, additive: true, depthWrite: false, fog: false, side: T.DoubleSide }), { parent: comet, sx: 12, sy: 30, rz: 0.22, receive: false });
            const headGlow = k.glowTexture('rgba(235,248,255,1)', 'rgba(140,200,255,0)');
            k.add(plane, k.basic('#ffffff', { map: headGlow, transparent: true, additive: true, depthWrite: false, fog: false }), { parent: comet, sx: 6, sy: 6, z: 0.5, receive: false });
            k.add(k.geo(new T.IcosahedronGeometry(0.9, 1)), k.basic('#f4fbff', { fog: false }), { parent: comet, receive: false });
            updates.push(function (dt, t) {
                const f = ((t / 240) % 1);
                const p = sky(8 + f * 30, 13.5 - f * 4, 300);
                comet.position.copy(p);
                comet.lookAt(cam);
                comet.rotateZ(2.3);
            });

            // --- a satellite drifting by behind the station ------------------------------------------
            const G = k.G;
            const satG = k.merge([
                { g: G.box(1.2, 1.2, 1.6), c: '#e8c35a' }, { g: G.box(1.24, 0.2, 1.64), y: 0.3, c: '#c9a23f' },
                { g: G.cyl(0.05, 0.05, 6.4, 4), rz: Math.PI / 2, c: '#c9ced6' },
                { g: G.box(2.4, 0.06, 1.3), x: -2.1, c: '#2d4f9e' }, { g: G.box(2.4, 0.06, 1.3), x: 2.1, c: '#2d4f9e' },
                { g: G.box(0.06, 0.07, 1.32), x: -2.1, c: '#c9ced6' }, { g: G.box(0.06, 0.07, 1.32), x: 2.1, c: '#c9ced6' },
                { g: G.cone(0.55, 0.5, 10), y: 0.9, rx: Math.PI, c: '#f2f4f6' }, { g: G.cyl(0.03, 0.03, 0.8, 4), y: 1.35, c: '#c9ced6' }
            ]);
            const sat = k.add(satG, k.vmat({ rough: 0.4, metal: 0.3 }), { s: 1.3, receive: false });
            updates.push(function (dt, t) {
                const f = ((t / 150) + 0.35) % 1, u = -95 + f * 190, v = 72;
                sat.position.set(F.x(u, v), V.center.y + 9 + Math.sin(f * 3) * 2, F.z(u, v));
                sat.rotation.set(t * 0.05, t * 0.11, 0.3);
            });

            // --- a few tumbling asteroids, well clear of the view ---------------------------------------
            const ast = [];
            const rockGeo = k.rockGeo(1, 0.3, 13);
            for (let i = 0, n = 0; i < 300 && n < Math.round(6 * k.detail) + 3; i++) {
                const u = k.range(-70, 70), v = k.range(5, 70), y = V.center.y + k.range(-10, 16);
                const x = F.x(u, v), z = F.z(u, v);
                if (!k.free(x, z, 3, 3) && Math.abs(y - V.center.y) < 9) continue;
                const depth = v + V.dist;
                if (Math.abs(u) < depth * 0.36 + 5 && Math.abs(y - V.center.y) < 8) continue;
                if (v < 8 && Math.abs(u) < depth * 0.75) continue;
                ast.push({ x: x, y: y, z: z, s: k.range(0.35, 1.0) * (depth > 40 ? 1.5 : 1), ph: k.range(0, 6.28), sp: k.range(0.05, 0.16) });
                n++;
            }
            const rocks = k.animInstanced(rockGeo, k.mat('#8d8178', { flat: true, rough: 1 }), ast, function (it, t, o) {
                o.rx = it.ph + t * it.sp; o.ry = it.ph * 2 + t * it.sp * 0.7; o.y = it.y + Math.sin(t * 0.2 + it.ph) * 0.4;
            });

            return {
                update: function (dt, t) {
                    updates.forEach(f => f(dt, t));
                    bright.material.opacity = 0.75 + 0.25 * Math.sin(t * 0.9);
                    bright2.material.opacity = 0.75 + 0.25 * Math.sin(t * 0.7 + 2);
                    rocks.update(t);
                    gm.position.set(gP.x + Math.cos(t * 0.02) * 50 * F.rx, gP.y - 4 + Math.sin(t * 0.02) * 6, gP.z + Math.cos(t * 0.02) * 50 * F.rz);
                }
            };
        }
    });

    /**
     * Bunting: little triangle flags hanging along sagging strings. spans: [[from xyz, to xyz, sag]].
     * One mesh for every string; update(t) lets the flags swing a little.
     */
    function bunting(k, spans, colors) {
        const T = k.THREE, pos = [], col = [], tips = [], c = new T.Color();
        let n = 0;
        spans.forEach(sp => {
            const a = sp[0], b = sp[1], sag = sp[2];
            const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
            const m = Math.max(2, Math.round(L / 0.62));
            const nx = -(b[2] - a[2]) / L, nz = (b[0] - a[0]) / L;
            const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
            for (let i = 0; i < m; i++) {
                const t0 = (i + 0.12) / m, t1 = (i + 0.88) / m, p0 = at(t0), p1 = at(t1), mid = at((t0 + t1) / 2);
                c.set(colors[n++ % colors.length]);
                const tipIdx = pos.length / 3 + 2;
                pos.push(...p0, ...p1, mid[0], mid[1] - 0.42, mid[2]);
                for (let j = 0; j < 3; j++) col.push(c.r, c.g, c.b);
                tips.push({ i: tipIdx, x: mid[0], y: mid[1] - 0.42, z: mid[2], nx: nx, nz: nz, ph: t0 * 7 + n });
            }
            // The string: thin quads between sample points.
            const S = 12;
            for (let i = 0; i < S; i++) {
                const p = at(i / S), q = at((i + 1) / S);
                pos.push(...p, ...q, q[0], q[1] - 0.035, q[2], ...p, q[0], q[1] - 0.035, q[2], p[0], p[1] - 0.035, p[2]);
                for (let j = 0; j < 6; j++) col.push(0.96, 0.94, 0.9);
            }
        });
        const g = k.geo(new T.BufferGeometry());
        const pa = new T.Float32BufferAttribute(pos, 3);
        g.setAttribute('position', pa);
        g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
        g.computeVertexNormals();
        k.add(g, k.mat('#ffffff', { vertexColors: true, side: T.DoubleSide, rough: 0.9 }), { receive: false });
        return {
            update: function (t) {
                tips.forEach(p => {
                    const s = Math.sin(t * 1.6 + p.ph) * 0.09;
                    pa.setXYZ(p.i, p.x + p.nx * s, p.y + Math.abs(s) * 0.2, p.z + p.nz * s);
                });
                pa.needsUpdate = true;
            }
        };
    }
})();
