/**
 * NARBE Build n Ride - the ground, the water and the scenery, in chunks.
 *
 * The world is cut into CHUNK x CHUNK squares (8 track tiles). Each chunk is
 * one flat-shaded, vertex-coloured terrain mesh, a water mesh where the ground
 * dips below a lake, river or the sea, and one InstancedMesh per prop kind and
 * layer. The track flattens the ground under itself (BNR.Track.shapeGround)
 * and props keep clear of it.
 *
 * Chunks are built a few at a time near the camera (update), hidden when far
 * away, and rebuilt when the track changes near them (trackChanged). A
 * season change only recolours: terrain vertex colours and prop instance
 * colours, a couple of chunks a frame (setSeason).
 * Fixed props (route landmarks, orchards, groves) come from world.propSpotsIn.
 */

window.BNR = window.BNR || {};

BNR.Terrain = (function () {
    'use strict';

    const U = BNR.Util;
    const CHUNK = 112;
    const SEGS = { high: 36, standard: 28, low: 18 };
    const PROP_STEP = { high: 4.2, standard: 4.8, low: 6.4 };
    /** How much scenery each graphics level keeps, and how far the world is drawn (fog hides the edge). */
    const PROP_DENSITY = BNR.World.DETAIL;
    const VIEW = { high: 440, standard: 370, low: 300 };
    /** A season change repaints the land in this many steps (each a gentle shade further). */
    const LOOK_STEPS = 24;

    function create(THREE, o) {
        const world = o.world;
        let track = o.track || null;
        let quality = o.quality || 'high';
        let season = o.season || 'summer';
        let look = null;               // between seasons: { a, b, k } (setLook)
        const root = new THREE.Group();
        root.name = 'terrain';
        (o.parent || o.scene).add(root);

        const mats = {
            ground: new THREE.MeshLambertMaterial({ vertexColors: true }),
            water: new THREE.MeshLambertMaterial({ color: new THREE.Color('#3e8fcf'), transparent: true, opacity: 0.84, depthWrite: false }),
            roles: {}
        };
        ['fixed', 'leaf', 'pine', 'bush', 'grass', 'flowers', 'snowcap'].forEach(function (r) {
            mats.roles[r] = new THREE.MeshLambertMaterial({ vertexColors: true });
        });
        // Windows (houses, city buildings): dark glass by day, warm light at night (setNight).
        mats.roles.glass = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0 });

        const chunks = new Map();
        let wanted = [];               // chunk keys to build, nearest first
        let bounds = null;             // ride mode: build every chunk in this box
        const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
        const waterSummer = new THREE.Color('#3e8fcf'), waterIce = new THREE.Color('#cfe6f3');
        paintWater();                  // a ride that starts in winter starts frozen

        function key(i, j) { return i + ',' + j; }
        function segs() { return SEGS[quality] || SEGS.high; }

        // --- one chunk ----------------------------------------------------------------------

        function build(i, j) {
            const N = segs(), step = CHUNK / N;
            const x0 = i * CHUNK, z0 = j * CHUNK;
            const H = new Float32Array((N + 1) * (N + 1));
            const S = new Array((N + 1) * (N + 1));
            const info = {};
            for (let b = 0; b <= N; b++) for (let a = 0; a <= N; a++) {
                const x = x0 + a * step, z = z0 + b * step;
                const smp = world.sample(x, z);
                const h = track ? track.shapeGround(x, z, smp.h, info) : smp.h;
                H[b * (N + 1) + a] = h;
                S[b * (N + 1) + a] = smp;
            }
            const ch = { i: i, j: j, N: N, step: step, x0: x0, z0: z0, H: H, S: S, group: new THREE.Group(), props: [] };
            ch.group.name = 'chunk ' + key(i, j);
            ch.ground = new THREE.Mesh(groundGeometry(ch), mats.ground);
            ch.ground.receiveShadow = true;
            ch.group.add(ch.ground);
            const wg = waterGeometry(ch);
            if (wg) { ch.water = new THREE.Mesh(wg, mats.water); ch.water.renderOrder = 2; ch.group.add(ch.water); }
            scatter(ch);
            root.add(ch.group);
            return ch;
        }

        function hAt(ch, a, b) { return ch.H[b * (ch.N + 1) + a]; }

        /** The rendered ground height inside a chunk (exactly on its triangles). */
        function surface(ch, x, z) {
            const N = ch.N, st = ch.step;
            let fx = (x - ch.x0) / st, fz = (z - ch.z0) / st;
            const a = U.clamp(Math.floor(fx), 0, N - 1), b = U.clamp(Math.floor(fz), 0, N - 1);
            fx -= a; fz -= b;
            const h00 = hAt(ch, a, b), h10 = hAt(ch, a + 1, b), h01 = hAt(ch, a, b + 1), h11 = hAt(ch, a + 1, b + 1);
            if ((a + b) % 2 === 0) {
                // diagonal 00-11
                return fx >= fz ? h00 + (h10 - h00) * fx + (h11 - h10) * fz : h00 + (h11 - h01) * fx + (h01 - h00) * fz;
            }
            // diagonal 10-01
            return fx + fz <= 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
        }

        function vertexColor(ch, a, b) {
            const N = ch.N, st = ch.step, idx = b * (N + 1) + a;
            const h = ch.H[idx];
            const hx = (hAt(ch, Math.min(N, a + 1), b) - hAt(ch, Math.max(0, a - 1), b)) / ((Math.min(N, a + 1) - Math.max(0, a - 1)) * st);
            const hz = (hAt(ch, a, Math.min(N, b + 1)) - hAt(ch, a, Math.max(0, b - 1))) / ((Math.min(N, b + 1) - Math.max(0, b - 1)) * st);
            const smp = ch.S[idx];
            const view = { h: h, datum: smp.datum, water: smp.water, mix: smp.mix };
            const x = ch.x0 + a * st, z = ch.z0 + b * st, slope = Math.hypot(hx, hz);
            if (!look) return world.colorAt(x, z, view, slope, season);
            // Between seasons: each spot turns in its own time, so snow settles (and melts,
            // and green comes through) in patches.
            const k = localK(x, z, look.k);
            if (k <= 0) return world.colorAt(x, z, view, slope, look.a);
            if (k >= 1) return world.colorAt(x, z, view, slope, look.b);
            return U.mixRGB(world.colorAt(x, z, view, slope, look.a), world.colorAt(x, z, view, slope, look.b), k);
        }

        /**
         * How far a spot has turned when the whole change is k along (0..1). Spots start at
         * different times (soft noise patches, ~40 m across) and each takes about half the change.
         */
        function localK(x, z, k) {
            const n = U.smoothstep(-0.45, 0.45, U.fbm(x / 41, z / 41, 0x5ea5, 2));
            const s = n * 0.55;
            return U.smoothstep(s, s + 0.45, k);
        }

        /** The corner indices of every terrain triangle, in draw order (the same for every chunk of a size). */
        function triOrder(N) {
            const out = [];
            for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
                const k = (aa, bb) => bb * (N + 1) + aa;
                if ((a + b) % 2 === 0) out.push(k(a, b), k(a + 1, b + 1), k(a + 1, b), k(a, b), k(a, b + 1), k(a + 1, b + 1));
                else out.push(k(a, b), k(a, b + 1), k(a + 1, b), k(a + 1, b), k(a, b + 1), k(a + 1, b + 1));
            }
            return out;
        }

        /** Flat colour per triangle (the average of its corners) into col, for the current season. */
        function paintGround(ch, col) {
            const N = ch.N;
            const vc = new Array((N + 1) * (N + 1));
            for (let b = 0; b <= N; b++) for (let a = 0; a <= N; a++) vc[b * (N + 1) + a] = vertexColor(ch, a, b);
            const order = ch.order || (ch.order = triOrder(N));
            for (let t = 0, p = 0; t < order.length; t += 3) {
                const ca = vc[order[t]], cb = vc[order[t + 1]], cc = vc[order[t + 2]];
                const r = BNR.Geo.lin([(ca[0] + cb[0] + cc[0]) / 3, (ca[1] + cb[1] + cc[1]) / 3, (ca[2] + cb[2] + cc[2]) / 3]);
                for (let q = 0; q < 3; q++) { col[p] = r[0]; col[p + 1] = r[1]; col[p + 2] = r[2]; p += 3; }
            }
        }

        function groundGeometry(ch) {
            const N = ch.N, st = ch.step;
            const order = ch.order || (ch.order = triOrder(N));
            const pos = new Float32Array(order.length * 3), col = new Float32Array(order.length * 3);
            for (let t = 0; t < order.length; t++) {
                const k = order[t], a = k % (N + 1), b = Math.floor(k / (N + 1));
                pos[t * 3] = ch.x0 + a * st; pos[t * 3 + 1] = ch.H[k]; pos[t * 3 + 2] = ch.z0 + b * st;
            }
            paintGround(ch, col);
            return finish(pos, col);
        }

        /** A new season: repaint this chunk's ground and props in place. */
        function recolour(ch) {
            const col = ch.ground.geometry.attributes.color;
            paintGround(ch, col.array);
            col.needsUpdate = true;
            ch.props.forEach(paintProps);
            ch.recolour = false;
        }

        function finish(pos, col) {
            const nor = new Float32Array(pos.length);
            for (let i = 0; i < pos.length; i += 9) {
                const e1x = pos[i + 3] - pos[i], e1y = pos[i + 4] - pos[i + 1], e1z = pos[i + 5] - pos[i + 2];
                const e2x = pos[i + 6] - pos[i], e2y = pos[i + 7] - pos[i + 1], e2z = pos[i + 8] - pos[i + 2];
                let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
                const l = Math.hypot(nx, ny, nz) || 1;
                for (let j = 0; j < 9; j += 3) { nor[i + j] = nx / l; nor[i + j + 1] = ny / l; nor[i + j + 2] = nz / l; }
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
            if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            g.computeBoundingSphere();
            return g;
        }

        /** Water: a flat quad on every grid cell whose ground dips below a water surface. */
        function waterGeometry(ch) {
            const N = ch.N, st = ch.step;
            const out = [];
            for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
                let level = null, low = Infinity;
                [[a, b], [a + 1, b], [a, b + 1], [a + 1, b + 1]].forEach(function (q) {
                    const k = q[1] * (N + 1) + q[0];
                    const w = ch.S[k].water;
                    if (w !== null && (level === null || w > level)) level = w;
                    low = Math.min(low, ch.H[k]);
                });
                if (level === null || low >= level) continue;
                const x = ch.x0 + a * st, z = ch.z0 + b * st;
                out.push(x, level, z, x, level, z + st, x + st, level, z + st, x, level, z, x + st, level, z + st, x + st, level, z);
            }
            if (!out.length) return null;
            return finish(new Float32Array(out), null);
        }

        // --- scenery ------------------------------------------------------------------------

        const propScale = (world.def && world.def.propScale) || {};

        function scatter(ch) {
            const rnd = U.mulberry((Math.imul(ch.i, 73856093) ^ Math.imul(ch.j, 19349663) ^ world.seed) | 0);
            const STEP = PROP_STEP[quality] || PROP_STEP.high;
            const placed = {};
            const info = {};
            const herd = {};
            // Fixed props first (route landmarks, orchards, groves); random props keep clear of landmarks.
            const keepOut = [];
            world.propSpotsIn(ch.x0, ch.z0, ch.x0 + CHUNK, ch.z0 + CHUNK).forEach(function (sp) {
                const d = BNR.Props.def(sp.kind);
                if (!d) return;
                const smp = world.sample(sp.x, sp.z);
                if (track) {
                    track.shapeGround(sp.x, sp.z, smp.h, info);
                    if (info.near < 3.4 + (sp.landmark ? 2 : d.radius)) return;
                }
                if (!sp.landmark && smp.water !== null && smp.h < smp.water + 0.3) return;
                const h = surface(ch, sp.x, sp.z);
                (placed[sp.kind] = placed[sp.kind] || []).push({ x: sp.x, y: h - (sp.landmark ? 0.3 : 0.05), z: sp.z, ry: sp.ry || 0, s: sp.s || 1, v: rnd(), tilt: 0 });
                if (sp.landmark) keepOut.push([sp.x, sp.z, d.radius + 4]);
            });
            // Buildings belong to the world (BNR.World buildingsIn): the same lots on every visit and
            // at every level of detail's share, so track is built between them, never through them.
            // (One standing too near track - a route's, laid before this rule - stays away.)
            const detail = PROP_DENSITY[quality] || 1;
            world.buildingsIn(ch.x0, ch.z0, ch.x0 + CHUNK, ch.z0 + CHUNK, detail).forEach(function (b) {
                if (track) {
                    track.shapeGround(b.x, b.z, world.sample(b.x, b.z).h, info);
                    if (info.near < 3.4 + b.radius) return;
                }
                const h = surface(ch, b.x, b.z);
                (placed[b.kind] = placed[b.kind] || []).push({ x: b.x, y: h - 0.05, z: b.z, ry: b.ry, s: b.s, v: b.v, tilt: 0 });
            });
            // Trees and the like keep out of them (neighbouring chunks' buildings too).
            const others = world.buildingsIn(ch.x0 - 14, ch.z0 - 14, ch.x0 + CHUNK + 14, ch.z0 + CHUNK + 14, detail);
            for (let z = ch.z0 + STEP / 2; z < ch.z0 + CHUNK; z += STEP) {
                for (let x = ch.x0 + STEP / 2; x < ch.x0 + CHUNK; x += STEP) {
                    let px = x + (rnd() - 0.5) * STEP * 0.9, pz = z + (rnd() - 0.5) * STEP * 0.9;
                    const r0 = rnd(), r1 = rnd();
                    let smp = world.sample(px, pz);
                    // Pick the biome by its weight here, so borders mingle.
                    let acc = 0, biome = null;
                    for (const id in smp.mix.color) { acc += smp.mix.color[id]; if (r0 * 0.999 <= acc) { biome = id; break; } }
                    if (!biome) continue;
                    const rules = BNR.Biomes.get(biome).props;
                    // A route may thin a biome's props (its own look, and the triangle budget).
                    const dens = (PROP_DENSITY[quality] || 1) * (propScale[biome] === undefined ? 1 : propScale[biome]);
                    let roll = r1, kind = null;
                    for (let k = 0; k < rules.length; k++) {
                        const p = rules[k].density * STEP * STEP * dens;
                        if (roll < p) { kind = rules[k].kind; break; }
                        roll -= p;
                    }
                    if (!kind) continue;
                    if (herd[kind] === undefined) herd[kind] = rnd();
                    const vk = BNR.Props.pick(kind, herd[kind], rnd());
                    const d = BNR.Props.def(vk);
                    if (d.landmark || d.house) continue;             // buildings come from the world (above)
                    if (others.length && others.some(b => Math.hypot(px - b.x, pz - b.z) < b.radius + d.radius * 0.6)) continue;
                    // City props keep off the streets; buildings stand on their block's tidy lots.
                    let face = null;
                    if (BNR.Biomes.get(biome).city) {
                        const cp = world.cityPlace(px, pz, d.radius, !!d.house);
                        if (!cp) continue;
                        if (cp.x !== px || cp.z !== pz) {
                            if (cp.x < ch.x0 || cp.z < ch.z0 || cp.x >= ch.x0 + CHUNK || cp.z >= ch.z0 + CHUNK) continue;
                            px = cp.x; pz = cp.z;
                            smp = world.sample(px, pz);
                        }
                        face = cp.ry;
                    }
                    if (keepOut.length && keepOut.some(k => Math.hypot(px - k[0], pz - k[1]) < k[2] + d.radius)) continue;
                    if (track) {
                        track.shapeGround(px, pz, smp.h, info);
                        if (info.near < 3.4 + d.radius) continue;
                    }
                    const h = surface(ch, px, pz);
                    if (kind === 'reeds') {
                        if (smp.water === null || h < smp.water - 0.4 || h > smp.water + 1.0) continue;
                    } else if (smp.water !== null && h < smp.water + 0.3) continue;
                    const sl = Math.hypot(surface(ch, px + 0.8, pz) - h, surface(ch, px, pz + 0.8) - h) / 0.8;
                    if (sl > (d.tilt ? 1.3 : d.house ? 0.25 : 0.75)) continue;
                    const s = d.scale[0] + rnd() * (d.scale[1] - d.scale[0]);
                    let ry = d.house ? Math.round(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.1 : rnd() * Math.PI * 2;
                    if (face !== null) ry = face;
                    (placed[vk] = placed[vk] || []).push({ x: px, y: h - (d.tilt ? 0.25 * s : 0.05), z: pz, ry: ry, s: s, v: rnd(), tilt: d.tilt ? (rnd() - 0.5) * 0.35 : 0 });
                }
            }
            Object.keys(placed).forEach(function (vk) {
                const list = placed[vk];
                BNR.Props.layers(vk).forEach(function (layer) {
                    const im = new THREE.InstancedMesh(layer.geometry, mats.roles[layer.role], list.length);
                    im.name = vk + ':' + layer.role;
                    list.forEach(function (t, n) {
                        tmpQ.setFromEuler(tmpE.set(t.tilt, t.ry, t.tilt * 0.6));
                        tmpM.compose(tmpP.set(t.x, t.y, t.z), tmpQ, tmpS.set(t.s, t.s, t.s));
                        im.setMatrixAt(n, tmpM);
                    });
                    im.castShadow = layer.role !== 'flowers' && layer.role !== 'grass' && quality !== 'low';
                    im.receiveShadow = false;
                    im.computeBoundingSphere();
                    const rec = { mesh: im, role: layer.role, list: list };
                    paintProps(rec);
                    ch.props.push(rec);
                    ch.group.add(im);
                });
            });
        }

        /**
         * Instance colours: foliage from the season's palette, everything else nearly white.
         * Between seasons each plant turns with the ground it stands on, give or take a little,
         * so trees change one by one rather than all at once.
         */
        function paintProps(rec) {
            const fam = BNR.Biomes.FOLIAGE[rec.role];
            const pal = fam && fam[look ? look.a : season];
            const pal2 = fam && look ? fam[look.b] : null;
            rec.list.forEach(function (t, n) {
                if (pal) {
                    const c = pal[Math.floor(t.v * pal.length) % pal.length];
                    tmpC.set(c);
                    if (pal2) {
                        const k = localK(t.x, t.z, U.clamp(look.k + 0.12 * (((t.v * 13.37) % 1) - 0.5), 0, 1));
                        if (k > 0) tmpC.lerp(tmpC2.set(pal2[Math.floor(t.v * pal2.length) % pal2.length]), k);
                    }
                    const k = 0.92 + 0.16 * ((t.v * 7.3) % 1);
                    tmpC.r *= k; tmpC.g *= k; tmpC.b *= k;
                } else {
                    const k = 0.94 + 0.12 * ((t.v * 5.1) % 1);
                    tmpC.setRGB(k, k, k);
                }
                rec.mesh.setColorAt(n, tmpC);
            });
            if (rec.mesh.instanceColor) rec.mesh.instanceColor.needsUpdate = true;
            if (rec.role === 'snowcap') rec.mesh.visible = winterness() >= 0.5;
            if (rec.role === 'glass') rec.mesh.castShadow = false;
        }

        function dispose(ch) {
            root.remove(ch.group);
            ch.ground.geometry.dispose();
            if (ch.water) ch.water.geometry.dispose();
            ch.props.forEach(r => r.mesh.dispose());
        }

        // --- which chunks exist ----------------------------------------------------------------

        /** Ride mode: every chunk in this world box gets built (nearest the focus first). */
        function setBounds(x0, z0, x1, z1) {
            bounds = [Math.floor(x0 / CHUNK), Math.floor(z0 / CHUNK), Math.floor(x1 / CHUNK), Math.floor(z1 / CHUNK)];
        }

        /**
         * Build what is missing near (fx, fz), within a time budget (ms), and show
         * only what the camera can reach. radius: in world units.
         */
        function update(fx, fz, o2) {
            o2 = o2 || {};
            const budget = o2.budget === undefined ? 6 : o2.budget;
            const radius = o2.radius || VIEW[quality] || 420;
            const R = Math.ceil(radius / CHUNK);
            const ci = Math.floor(fx / CHUNK), cj = Math.floor(fz / CHUNK);
            wanted = [];
            for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
                const i = ci + di, j = cj + dj;
                if (bounds && (i < bounds[0] || j < bounds[1] || i > bounds[2] || j > bounds[3])) continue;
                const d = nearest(i, j, fx, fz);
                if (d > radius) continue;
                wanted.push({ k: key(i, j), i: i, j: j, d: d });
            }
            wanted.sort((a, b) => a.d - b.d);
            const t0 = now();
            for (const w of wanted) {
                const ch = chunks.get(w.k);
                if (ch && !ch.dirty) continue;
                if (ch) dispose(ch);
                chunks.set(w.k, build(w.i, w.j));
                if (budget >= 0 && now() - t0 > budget) break;
            }
            // Seasons: repaint a couple of chunks a frame, nearest first.
            let painted = 0;
            for (const w of wanted) {
                if (painted >= (o2.recolour === undefined ? 2 : o2.recolour)) break;
                const ch = chunks.get(w.k);
                if (ch && ch.recolour && !ch.dirty) { recolour(ch); painted++; }
            }
            const keep = new Set(wanted.map(w => w.k));
            chunks.forEach(function (ch, k) {
                const d = nearest(ch.i, ch.j, fx, fz);
                ch.group.visible = d < radius;
                // Chunks far behind are let go, a ride's too (they rebuild the same when the train
                // comes round again), so a long loop holds no more land than a short one.
                if (!keep.has(k) && d > radius + CHUNK * 3) { dispose(ch); chunks.delete(k); }
            });
        }

        /** Distance from (fx, fz) to the nearest point of chunk (i, j). */
        function nearest(i, j, fx, fz) {
            const dx = Math.max(i * CHUNK - fx, 0, fx - (i + 1) * CHUNK);
            const dz = Math.max(j * CHUNK - fz, 0, fz - (j + 1) * CHUNK);
            return Math.hypot(dx, dz);
        }

        /** Build every chunk in bounds now (Node pictures, thumbnails). */
        function buildAll(fx, fz, radius) { update(fx, fz, { budget: -1, radius: radius || 2000 }); }

        /** The track changed between these pieces: rebuild the chunks it touches. */
        function trackChanged(t, fromPiece) {
            track = t || track;
            if (!track) return;
            const c = track.centerline();
            const from = Math.max(0, fromPiece || 0);
            const touched = new Set();
            const pad = 22;
            for (let n = 0; n < c.n; n++) {
                if (c.piece[n] < from) continue;
                for (const dz of [-pad, 0, pad]) for (const dx of [-pad, 0, pad]) touched.add(key(Math.floor((c.x[n] + dx) / CHUNK), Math.floor((c.z[n] + dz) / CHUNK)));
            }
            touched.forEach(k => { const ch = chunks.get(k); if (ch) ch.dirty = true; });
            return touched.size;
        }

        /** Rebuild the chunks round these points ({ x, z }), e.g. where track was taken away. */
        function dirtyAt(points, pad) {
            pad = pad === undefined ? 22 : pad;
            (points || []).forEach(function (p) {
                for (const dz of [-pad, 0, pad]) for (const dx of [-pad, 0, pad]) {
                    const ch = chunks.get(key(Math.floor((p.x + dx) / CHUNK), Math.floor((p.z + dz) / CHUNK)));
                    if (ch) ch.dirty = true;
                }
            });
        }

        /** Night: windows glow warm (k 0 day .. 1 night). */
        function setNight(k) { mats.roles.glass.emissiveIntensity = 0.95 * k; }

        /** Graphics quality changed: rebuild every chunk at the new detail (a few per frame). */
        function setQuality(q) {
            if (q === quality) return;
            quality = q;
            chunks.forEach(ch => { ch.dirty = true; });
        }

        /** How wintry the land looks, 0..1 (water ice, snow on the roofs and peaks). */
        function winterness() {
            if (!look) return season === 'winter' ? 1 : 0;
            return (look.a === 'winter' ? 1 - look.k : 0) + (look.b === 'winter' ? look.k : 0);
        }

        function paintWater() {
            const w = winterness();
            mats.water.color.copy(waterSummer).lerp(waterIce, w);
            mats.water.opacity = 0.84 + 0.12 * w;
        }

        /**
         * The land part-way between two seasons: k 0 = all a .. 1 = all b (js/weather.js moves k
         * along slowly). k goes in LOOK_STEPS steps; each step repaints the chunks a couple per
         * frame inside update() (nearest the camera first), so a change never stalls a frame and
         * the land turns a little at a time. The water freezes or thaws along with it.
         */
        function setLook(a, b, k) {
            const kq = a === b ? 1 : U.clamp(Math.round(k * LOOK_STEPS) / LOOK_STEPS, 0, 1);
            let next = null, s = season;
            if (kq >= 1) s = b;
            else if (kq <= 0) s = a;
            else next = { a: a, b: b, k: kq };
            const same = next ? !!(look && look.a === a && look.b === b && look.k === kq) : (!look && s === season);
            if (same) return;
            look = next;
            season = next ? a : s;
            chunks.forEach(function (ch) { ch.recolour = true; });
            paintWater();
        }

        /** A new season, all at once (loading, pictures). */
        function setSeason(s) { setLook(s, s, 1); }

        /** Repaint everything now (Node pictures). */
        function recolourAll() { chunks.forEach(ch => { if (ch.recolour) recolour(ch); }); }

        /** Ground height as drawn (falls back to the world where nothing is built yet). */
        function heightAt(x, z) {
            const ch = chunks.get(key(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
            if (ch && !ch.dirty) return surface(ch, x, z);
            const smp = world.sample(x, z);
            return track ? track.shapeGround(x, z, smp.h) : smp.h;
        }

        function now() { return (typeof performance !== 'undefined' ? performance : Date).now(); }

        return {
            root: root,
            update: update,
            buildAll: buildAll,
            setBounds: setBounds,
            trackChanged: trackChanged,
            dirtyAt: dirtyAt,
            setSeason: setSeason,
            setLook: setLook,
            recolourAll: recolourAll,
            setNight: setNight,
            season: function () { return season; },
            setQuality: setQuality,
            heightAt: heightAt,
            setTrack: function (t) { track = t; },
            /**
             * The world's buildings standing in a box at this graphics level: the ones drawn
             * (not the few a route's track passes through, which never stand).
             */
            buildingsIn: function (x0, z0, x1, z1) {
                const out = [];
                const inf = {};
                world.buildingsIn(x0, z0, x1, z1, PROP_DENSITY[quality] || 1).forEach(function (b) {
                    if (track) { track.shapeGround(b.x, b.z, world.sample(b.x, b.z).h, inf); if (inf.near < 3.4 + b.radius) return; }
                    out.push(b);
                });
                return out;
            },
            viewDistance: function () { return VIEW[quality] || 420; },
            pending: function () { let n = 0; wanted.forEach(w => { const ch = chunks.get(w.k); if (!ch || ch.dirty) n++; }); return n; },
            count: function () { return chunks.size; },
            materials: mats,
            dispose: function () {
                chunks.forEach(dispose);
                chunks.clear();
                (o.parent || o.scene).remove(root);
                mats.ground.dispose(); mats.water.dispose();
                Object.values(mats.roles).forEach(m => m.dispose());
            }
        };
    }

    return { create: create, CHUNK: CHUNK };
})();
