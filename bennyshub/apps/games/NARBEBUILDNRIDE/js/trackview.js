/**
 * NARBE Build n Ride - the track as the player sees it.
 *
 * Swept along the centre line (BNR.Track.centerline): rails, sleepers and a
 * ballast bed on the ground; a deck on bridges; a stone bore in tunnels.
 * The structure under each stretch follows what the world needs:
 *   bridge  stone arches, a wooden trestle or a steel truss (by biome)
 *   ramp    the low part of an overpass ramp: a walled stone embankment
 *   girder  the overpass itself: a painted girder span on steel legs; over
 *           other track, a portal frame with a leg either side of it
 * Nothing stands where other track runs: piers, legs and abutments keep
 * their own spread plus another track's half width (OTHER) from it.
 *   tunnel  a stone portal at each end and a lamp-lit bore inside
 *
 * Built per terrain chunk into ONE vertex-coloured mesh (plus one glowing
 * mesh for lamps), so a long track is still only a few draw calls. In the game
 * (o.lazy + update(x, z, radius)) only the chunks near the camera are built, so
 * a long loop costs no more to draw or hold than a short one.
 * rebuild(true) (Build mode, after each piece) remakes only the chunks whose
 * stretch of track changed: every sample's position, height, kind and run are
 * compared with the last build, and only chunks near a difference are redrawn.
 *
 * Vertical stack, from the centre line's y (the top of the ballast):
 *   sleepers y .. y+0.22, rails y+0.22 .. y+0.46 (the train rides at RAIL),
 *   ballast down to y-0.55 (where the ground is flattened), decks to y-0.7.
 */

window.BNR = window.BNR || {};

BNR.TrackView = (function () {
    'use strict';

    const U = BNR.Util;
    const RAIL = 0.46;
    const GAUGE = 0.75;          // half the distance between the rails
    const C = {
        rail: '#7d8189', railTop: '#d5d9df', sleeper: '#6b4a33', sleeper2: '#5d4030',
        ballast: '#9a948a', ballastSide: '#857f75',
        stone: '#b7aa94', stoneDark: '#9b8f7a', stoneCap: '#cfc4ae',
        wood: '#8a5a33', woodDark: '#6e4628',
        steel: '#c8553d', steelDark: '#a8432f', concrete: '#bdbab3',
        girder: '#3f6fb0', girderDark: '#2f5690',
        bore: '#2f2c29', bore2: '#38342f', tRail: '#3a3c40', tRailTop: '#6a6d72', tBallast: '#2a2826', tSleeper: '#2c231d',
        portal: '#a79c8a', portalDark: '#8a7f6e', key: '#cfc4ae',
        lamp: '#ffd27a'
    };

    function create(THREE, o) {
        let track = o.track;
        const world = o.world;
        const root = new THREE.Group();
        root.name = 'track';
        (o.parent || o.scene).add(root);
        const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
        const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
        let meshes = new Map();
        let plan = null;
        let sigs = null, sigPos = null;     // each sample's signature at the last build (partial rebuilds)
        const NOOP = { quad() {}, tri() {}, box() {}, shape() {}, blob() {}, beam() {}, count() { return 0; } };
        const SKIP = { solid: NOOP, glow: NOOP };

        // --- planning: frames, structure per sample, runs, bridge styles --------------------

        function makePlan() {
            const c = track.centerline();
            const n = c.n;
            const P = { c: c, n: n, kind: new Array(n), runs: [], frames: new Array(n) };
            for (let i = 0; i < n; i++) {
                const ip = c.closed ? (i - 1 + n) % n : Math.max(0, i - 1), inx = c.closed ? (i + 1) % n : Math.min(n - 1, i + 1);
                let ds = c.s[inx] - c.s[ip];
                if (ds <= 0) ds += c.length;
                const dy = (c.y[inx] - c.y[ip]) / (ds || 1);
                const tl = Math.hypot(c.tx[i], dy, c.tz[i]);
                P.frames[i] = { x: c.x[i], y: c.y[i], z: c.z[i], tx: c.tx[i] / tl, ty: dy / tl, tz: c.tz[i] / tl, rx: -c.tz[i], rz: c.tx[i] };
                const st = c.struct[i];
                if (st === 'bridge') {
                    const hg = c.y[i] - Math.max(c.ground[i], c.water[i] === null ? -Infinity : c.water[i]);
                    // A low overpass is a walled ramp, unless other track runs close by (in a
                    // cutting below it, say): then a girder, with nothing walled down onto it.
                    if (c.lift[i] > 0.6) P.kind[i] = hg < 3.2 && !track.nearOther(c.x[i], c.z[i], i, 2.1 + OTHER, 20) ? 'ramp' : 'girder';
                    else P.kind[i] = 'bridge';
                } else P.kind[i] = st;
            }
            // Runs of the same kind (wrapping round a closed loop).
            let i = 0;
            while (i < n) {
                let j = i;
                while (j + 1 < n && P.kind[j + 1] === P.kind[i]) j++;
                P.runs.push({ kind: P.kind[i], a: i, b: j });
                i = j + 1;
            }
            if (c.closed && P.runs.length > 1 && P.runs[0].kind === P.runs[P.runs.length - 1].kind) {
                const last = P.runs.pop();
                P.runs[0].a = last.a - n;
            }
            P.runs.forEach(function (r) {
                const mid = ((Math.round((r.a + r.b) / 2)) % n + n) % n;
                r.style = r.kind === 'bridge' ? BNR.Biomes.get(world.biomeAt(c.x[mid], c.z[mid])).bridge : r.kind;
                r.sa = sAt(P, r.a); r.sb = sAt(P, r.b);
            });
            return P;
        }

        function wrap(P, i) { return ((i % P.n) + P.n) % P.n; }
        /** Distance along the track of sample i, measured the way run r measures it. */
        function sIn(r, i) { const P = plan; let s = sAt(P, i); if (s > r.sb + 1) s -= P.c.length; return s; }
        function sAt(P, i) { const k = wrap(P, i); return P.c.s[k] + (i < 0 ? -P.c.length : i >= P.n ? P.c.length : 0); }

        /** A point offset from frame f: lateral (right +), vertical (up +), along (forward +). */
        function at(f, lat, up, along) {
            along = along || 0;
            return [f.x + f.rx * lat + f.tx * along, f.y + up + f.ty * along, f.z + f.rz * lat + f.tz * along];
        }

        /** Sweep an open/closed cross-section between two frames. prof: [[lat, up], ...]; cols: per edge. */
        function sweep(b, fa, fb, prof, cols, closed) {
            const m = prof.length;
            for (let k = 0; k < (closed ? m : m - 1); k++) {
                const p = prof[k], q = prof[(k + 1) % m];
                const col = Array.isArray(cols) ? cols[k % cols.length] : cols;
                b.quad(at(fa, p[0], p[1]), at(fb, p[0], p[1]), at(fb, q[0], q[1]), at(fa, q[0], q[1]), col);
            }
        }

        // Cross-sections (listed so faces point outward; see sweep()).
        const RAIL_L = [[-GAUGE + 0.11, 0.22], [-GAUGE + 0.11, RAIL], [-GAUGE - 0.11, RAIL], [-GAUGE - 0.11, 0.22]];
        const RAIL_R = [[GAUGE + 0.11, 0.22], [GAUGE + 0.11, RAIL], [GAUGE - 0.11, RAIL], [GAUGE - 0.11, 0.22]];
        const BALLAST = [[2.5, -0.62], [1.65, 0], [-1.65, 0], [-2.5, -0.62]];
        const DECK = [[1.95, -0.7], [1.95, 0.02], [-1.95, 0.02], [-1.95, -0.7]];
        const PARAPET_L = [[-1.7, 0], [-1.7, 0.8], [-2.05, 0.8], [-2.05, -0.7]];
        const PARAPET_R = [[2.05, -0.7], [2.05, 0.8], [1.7, 0.8], [1.7, 0]];
        const PLANKS = [[1.8, -0.45], [1.8, 0.02], [-1.8, 0.02], [-1.8, -0.45]];
        // Girders reach 1.1 below the rails: the train (4.72 tall) fits under one a LEVEL (6.75) up.
        const GIRDER_L = [[-1.75, -1.1], [-1.75, 0.55], [-2.1, 0.55], [-2.1, -1.1]];
        const GIRDER_R = [[2.1, -1.1], [2.1, 0.55], [1.75, 0.55], [1.75, -1.1]];
        const BORE = [[-3.3, -0.7], [-3.3, 3.3], [-2.3, 5.5], [0, 6.2], [2.3, 5.5], [3.3, 3.3], [3.3, -0.7]];

        // --- building -------------------------------------------------------------------------

        function chunkKey(x, z) { const S = BNR.Terrain.CHUNK; return Math.floor(x / S) + ',' + Math.floor(z / S); }

        /** What each sample looks like: where it is, how high, its kind and the run it belongs to. */
        function signatures(P) {
            const runOfSample = new Array(P.n);
            P.runs.forEach(function (r) {
                const tag = r.kind + ':' + r.a + ':' + r.b + ':' + r.style;
                for (let i = r.a; i <= r.b; i++) runOfSample[(i + P.n) % P.n] = tag;
            });
            const out = new Array(P.n), pos = new Array(P.n);
            for (let i = 0; i < P.n; i++) {
                const f = P.frames[i];
                out[i] = Math.round(f.x * 50) + ',' + Math.round(f.z * 50) + ',' + Math.round(f.y * 50) + ',' + Math.round(f.ty * 500) + ',' + P.kind[i] + ',' + runOfSample[i];
                pos[i] = [f.x, f.z];
            }
            return { sig: out, pos: pos };
        }

        /** The chunks near any sample that changed since the last build (old places and new). */
        function changedChunks(P, now) {
            const keys = new Set();
            const mark = function (x, z) {
                for (let dx = -7; dx <= 7; dx += 7) for (let dz = -7; dz <= 7; dz += 7) keys.add(chunkKey(x + dx, z + dz));
            };
            const n = Math.max(sigs.length, now.sig.length);
            for (let i = 0; i < n; i++) {
                if (sigs[i] === now.sig[i]) continue;
                if (i < now.sig.length) mark(now.pos[i][0], now.pos[i][1]);
                if (i < sigs.length) mark(sigPos[i][0], sigPos[i][1]);
            }
            return keys;
        }

        // --- streaming: only the chunks near the camera are built (o.lazy + update()) -----------
        // However long the loop, only the track within sight of the camera is kept as meshes (as
        // the terrain is): far chunks are let go and rebuilt, the same, when the camera comes back.
        // Without update() (Node tests and pictures) every chunk is built, as before.
        let focus = null;                  // { x, z, radius } of the camera (null: build every chunk)
        let trackKeys = new Set();         // the chunks the track runs through
        const built = new Set();           // chunks built for the current plan
        /** How far chunk k is from the camera's spot (its nearest point). */
        function away(k) {
            const S = BNR.Terrain.CHUNK, ij = k.split(','), i = +ij[0], j = +ij[1];
            return Math.hypot(Math.max(i * S - focus.x, 0, focus.x - (i + 1) * S), Math.max(j * S - focus.z, 0, focus.z - (j + 1) * S));
        }
        function wanted(k) { return !focus || away(k) <= focus.radius; }

        function rebuild(partial) {
            plan = makePlan();
            const now = signatures(plan);
            const changed = partial && sigs ? changedChunks(plan, now) : null;
            sigs = now.sig; sigPos = now.pos;
            trackKeys = new Set();
            for (let i = 0; i < plan.n; i++) trackKeys.add(chunkKey(plan.frames[i].x, plan.frames[i].z));
            if (changed && !changed.size) return plan;
            emit(changed);
            return plan;
        }

        function removeChunk(k) {
            [k, k + ':glow'].forEach(function (mk) {
                const m = meshes.get(mk);
                if (m) { root.remove(m); m.geometry.dispose(); meshes.delete(mk); }
            });
            built.delete(k);
        }

        /**
         * Keep built the chunks within `radius` of (x, z) and let the far ones go; build a few
         * missing ones a call (all of them when `all`).
         */
        function update(x, z, radius, all) {
            focus = { x: x, z: z, radius: radius };
            // A margin, so a chunk at the edge isn't remade back and forth.
            Array.from(built).forEach(k => { if (away(k) > radius + BNR.Terrain.CHUNK * 2) removeChunk(k); });
            const missing = [];
            trackKeys.forEach(k => { if (!built.has(k) && away(k) <= radius) missing.push(k); });
            if (!missing.length) return;
            missing.sort((a, b) => away(a) - away(b));
            emit(new Set(all ? missing : missing.slice(0, 4)));
        }

        /** Build these chunks (null: all), as far as they are wanted; the old meshes there go. */
        function emit(keys) {
            const P = plan, c = P.c;
            const only = keys ? new Set(Array.from(keys).filter(wanted)) : (focus ? new Set(Array.from(trackKeys).filter(wanted)) : null);
            standing = [];
            const B = new Map();
            const get = function (x, z) {
                const k = chunkKey(x, z);
                if (only && !only.has(k)) return SKIP;
                let e = B.get(k);
                if (!e) { e = { solid: BNR.Geo.builder(), glow: BNR.Geo.builder() }; B.set(k, e); }
                return e;
            };
            const segs = c.closed ? P.n : P.n - 1;
            for (let i = 0; i < segs; i++) {
                const j = (i + 1) % P.n;
                const fa = P.frames[i], fb = P.frames[j];
                if (Math.hypot(fb.x - fa.x, fb.z - fa.z) > 3) continue;   // never bridge a gap
                const e = get(fa.x, fa.z);
                if (e === SKIP) continue;
                const kind = P.kind[i];
                if (kind === 'tunnel') {
                    // Inside the hill: unlit and dark, so the sun never shines through the mountain.
                    sweep(e.glow, fa, fb, RAIL_L, [C.tRail, C.tRailTop, C.tRail]);
                    sweep(e.glow, fa, fb, RAIL_R, [C.tRail, C.tRailTop, C.tRail]);
                    sweep(e.glow, fa, fb, BALLAST, [C.tBallast, C.tBallast, C.tBallast]);
                    sweep(e.glow, fa, fb, BORE, [C.bore, C.bore2, C.bore, C.bore2, C.bore, C.bore2, C.tBallast], true);   // closed: the bore has a floor
                    continue;
                }
                sweep(e.solid, fa, fb, RAIL_L, [C.rail, C.railTop, C.rail]);
                sweep(e.solid, fa, fb, RAIL_R, [C.rail, C.railTop, C.rail]);
                if (kind === 'ground') sweep(e.solid, fa, fb, BALLAST, [C.ballastSide, C.ballast, C.ballastSide]);
                if (kind === 'bridge' || kind === 'girder' || kind === 'ramp') {
                    const r = runOf(i);
                    if (r && r.style === 'wood') sweep(e.solid, fa, fb, PLANKS, [C.woodDark, C.wood, C.woodDark, C.woodDark], true);
                    else sweep(e.solid, fa, fb, DECK, [C.stoneDark, C.stone, C.stoneDark, C.stoneDark], true);
                    if (kind === 'girder' || (r && r.style === 'steel')) {
                        sweep(e.solid, fa, fb, GIRDER_L, kind === 'girder' ? [C.girderDark, C.girder, C.girderDark] : [C.steelDark, C.steel, C.steelDark]);
                        sweep(e.solid, fa, fb, GIRDER_R, kind === 'girder' ? [C.girderDark, C.girder, C.girderDark] : [C.steelDark, C.steel, C.steelDark]);
                    } else if (!r || r.style !== 'wood') {
                        sweep(e.solid, fa, fb, PARAPET_L, [C.stoneCap, C.stoneCap, C.stoneDark]);
                        sweep(e.solid, fa, fb, PARAPET_R, [C.stoneDark, C.stoneCap, C.stoneCap]);
                    }
                    if (kind === 'ramp') rampWalls(e.solid, i, fa, fb);
                    if (r && r.style === 'stone' && kind === 'bridge') arches(e.solid, r, i, fa, fb);
                }
            }
            sleepers(get);
            P.runs.forEach(function (r) {
                if (r.kind === 'tunnel') { portal(get, r, 'in'); portal(get, r, 'out'); lamps(get, r); }
                else if (r.kind === 'bridge' || r.kind === 'girder') { supports(get, r); abutments(get, r); }
                else if (r.kind === 'ramp') abutments(get, r);
            });
            // Swap in the new meshes: the given chunks' (all of them when none are given).
            if (keys) keys.forEach(removeChunk);
            else {
                meshes.forEach(m => { root.remove(m); m.geometry.dispose(); });
                meshes = new Map();
                built.clear();
            }
            (only || trackKeys).forEach(k => built.add(k));
            B.forEach(function (e, k) {
                if (e.solid.count()) {
                    const m = new THREE.Mesh(e.solid.geometry(), solid);
                    m.castShadow = true; m.receiveShadow = true;
                    m.name = 'track ' + k;
                    root.add(m); meshes.set(k, m);
                }
                if (e.glow.count()) {
                    const g = new THREE.Mesh(e.glow.geometry(), glow);
                    g.name = 'lamps ' + k;
                    root.add(g); meshes.set(k + ':glow', g);
                }
            });
        }

        function runOf(i) {
            const P = plan;
            for (const r of P.runs) {
                if (i >= r.a && i <= r.b) return r;
                if (r.a < 0 && i - P.n >= r.a) return r;
            }
            return null;
        }

        /** Sleepers every 1.15 units, crossways. */
        function sleepers(get) {
            const P = plan, c = P.c;
            const SP = 1.15;
            let next = 0.4;
            for (let i = 0; i < (c.closed ? P.n : P.n - 1); i++) {
                const j = (i + 1) % P.n;
                let s0 = c.s[i], s1 = c.s[j];
                if (s1 <= s0) s1 += c.length;
                while (next < s1) {
                    if (next >= s0) {
                        const u = (next - s0) / (s1 - s0);
                        const fa = P.frames[i], fb = P.frames[j];
                        const f = {
                            x: fa.x + (fb.x - fa.x) * u, y: fa.y + (fb.y - fa.y) * u, z: fa.z + (fb.z - fa.z) * u,
                            tx: fa.tx, ty: fa.ty, tz: fa.tz, rx: fa.rx, rz: fa.rz
                        };
                        const e = get(f.x, f.z);
                        const ang = Math.atan2(f.tx, f.tz);
                        if (P.kind[i] === 'tunnel') e.glow.box(f.x, f.y + 0.11, f.z, 2.55, 0.22, 0.42, C.tSleeper, { ry: ang });
                        else e.solid.box(f.x, f.y + 0.11, f.z, 2.55, 0.22, 0.42, ((next * 7.31) % 1) < 0.5 ? C.sleeper : C.sleeper2, { ry: ang });
                    }
                    next += SP;
                }
            }
        }

        /** Ground under a frame (natural ground or the water bed). */
        function groundAt(i) { const c = plan.c, k = wrap(plan, i); return c.ground[k]; }

        /** The overpass ramp's low end: stone walls down to the ground and a filled top. */
        function rampWalls(b, i, fa, fb) {
            const ga = groundAt(i) - 1.2, gb = groundAt(i + 1) - 1.2;
            const wall = function (lat, col) {
                const A0 = at(fa, lat, -0.7), B0 = at(fb, lat, -0.7);
                const A1 = [A0[0], ga, A0[2]], B1 = [B0[0], gb, B0[2]];
                if (lat > 0) b.quad(A1, B1, B0, A0, col); else b.quad(A0, B0, B1, A1, col);
            };
            wall(2.05, C.stoneDark);
            wall(-2.05, C.stoneDark);
        }

        /** Stone viaduct arches: the wall between piers is cut by a round arch. */
        function arches(b, r, i, fa, fb) {
            const c = plan.c;
            const SP = 9.5;
            const s0 = sIn(r, i), s1 = s0 + Math.hypot(fb.x - fa.x, fb.z - fa.z);
            const span = function (s) {
                const k = Math.floor((s - r.sa) / SP);
                return { a: r.sa + k * SP, b: Math.min(r.sb, r.sa + (k + 1) * SP) };
            };
            const deckBot = -0.7;
            const archUnder = function (s, f) {
                const sp = span(s), len = sp.b - sp.a;
                if (len < 4) return deckBot;
                const R = len / 2 - 0.8;
                const t = (s - sp.a - 0.8) / (2 * R);
                const hgt = f.y - groundAt(i);
                const spring = deckBot - 0.9 - R;
                if (hgt < 3.5 || t <= 0 || t >= 1) return null;   // over a pier, or too low for an arch
                const top = spring + R * Math.sqrt(Math.max(0, 1 - (2 * t - 1) * (2 * t - 1)));
                return Math.min(deckBot, top);
            };
            const ua = archUnder(s0, fa), ub = archUnder(s1, fb);
            if (ua === null || ub === null) return;
            [2.0, -2.0].forEach(function (lat) {
                const A0 = at(fa, lat, deckBot), B0 = at(fb, lat, deckBot), A1 = at(fa, lat, ua), B1 = at(fb, lat, ub);
                if (lat > 0) b.quad(A1, B1, B0, A0, C.stone); else b.quad(A0, B0, B1, A1, C.stone);
            });
            // The arch's underside.
            b.quad(at(fa, 2.0, ua), at(fa, -2.0, ua), at(fb, -2.0, ub), at(fb, 2.0, ub), C.stoneDark);
            void c;
        }

        /**
         * Is another part of the track within reach of something standing at (x, z) beside
         * sample i? reach: how far that thing spreads from (x, z); OTHER: how far the other
         * track's girders or train spread from its centre line.
         */
        const OTHER = 2.2;
        function crowded(x, z, i, reach) { return track.nearOther(x, z, wrap(plan, i), reach + OTHER, 20); }
        /** Everything standing on the ground, for the clearance test: { x, z, reach, top, bottom, what }. */
        let standing = [];
        function stands(x, z, reach, top, bottom, what) { standing.push({ x: x, z: z, reach: reach, top: top, bottom: bottom, what: what }); }

        /**
         * Track right below (or beside) where a leg would go: a portal frame instead, a leg either
         * side of it and a beam under the deck, when both legs have room.
         */
        function straddle(get, f, i, top, bottom) {
            const L = 3.3;
            const A = at(f, L, 0), B = at(f, -L, 0);
            if (crowded(A[0], A[2], i, 0.4) || crowded(B[0], B[2], i, 0.4)) return;
            if (o.avoid && (o.avoid(A[0], A[2]) || o.avoid(B[0], B[2]))) return;
            const e = get(f.x, f.z);
            [A, B].forEach(function (p) {
                e.solid.shape('cyl:0.3,0.34,8', p[0], (top + bottom) / 2, p[2], 1, top - bottom, 1, C.girderDark);
                stands(p[0], p[2], 0.4, top, bottom, 'frame leg');
            });
            e.solid.beam(at(f, L + 0.3, -0.85), at(f, -L - 0.3, -0.85), 0.5, 0.5, C.girder);   // no lower than the girders
        }

        /** Piers, bents or legs along a bridge run, by style. */
        function supports(get, r) {
            const P = plan, c = P.c;
            const style = r.kind === 'girder' ? 'girder' : r.style;
            const SP = { stone: 9.5, wood: 4.4, steel: 22, girder: 10 }[style] || 10;
            const len = r.sb - r.sa;
            if (len < SP * 0.6) return;
            for (let s = r.sa + (style === 'stone' ? SP : SP / 2); s < r.sb - SP * 0.3; s += SP) {
                const i = indexAtS(r, s);
                const f = P.frames[wrap(P, i)];
                const g = groundAt(i);
                const top = f.y - 0.7;
                if (top - g < 0.6) continue;
                if (o.avoid && o.avoid(f.x, f.z)) continue;                        // never on a station platform
                const bottom = g - 1.5;
                // How far each kind spreads from the centre line (a wooden bent splays out as it goes down).
                const reach = { stone: 2.4, steel: 2.5, girder: 1.9, wood: 1.6 + (top - bottom) * 0.11 }[style] || 2.5;
                if (crowded(f.x, f.z, i, reach)) {                                  // never stand on other track
                    if (style === 'girder' || style === 'steel') straddle(get, f, i, top, bottom);
                    continue;
                }
                stands(f.x, f.z, reach, top, bottom, style);
                const e = get(f.x, f.z);
                const ang = Math.atan2(f.tx, f.tz);
                if (style === 'stone') {
                    e.solid.box(f.x, (top + bottom) / 2, f.z, 3.9, top - bottom, 1.7, C.stoneDark, { ry: ang });
                    e.solid.box(f.x, top - 0.2, f.z, 4.3, 0.4, 2.1, C.stoneCap, { ry: ang });
                } else if (style === 'wood') {
                    bent(e.solid, f, top, bottom);
                } else if (style === 'steel') {
                    e.solid.box(f.x, (top - 0.6 + bottom) / 2, f.z, 3.4, top - 0.6 - bottom, 2.2, C.concrete, { ry: ang });
                    e.solid.box(f.x, top - 0.35, f.z, 4.2, 0.7, 2.6, C.concrete, { ry: ang });
                } else {
                    [1.35, -1.35].forEach(function (lat) {
                        const p = at(f, lat, 0);
                        e.solid.shape('cyl:0.3,0.34,8', p[0], (top + bottom) / 2, p[2], 1, top - bottom, 1, C.girderDark);
                    });
                    e.solid.beam(at(f, 1.6, -0.9), at(f, -1.6, -0.9), 0.5, 0.5, C.girder);
                }
            }
            if (style === 'steel') truss(get, r);
        }

        /** A wooden trestle bent: two splayed posts, cross beams and X braces. */
        function bent(b, f, top, bottom) {
            const h = top - bottom;
            const spread = function (y) { return 1.35 + (top - y) * 0.11; };
            const post = function (side) {
                b.beam(at(f, side * spread(top), top - f.y), at(f, side * spread(bottom), bottom - f.y), 0.3, 0.3, C.wood);
            };
            post(1); post(-1);
            const levels = Math.max(1, Math.floor(h / 3));
            for (let k = 0; k <= levels; k++) {
                const y = top - Math.min(h - 0.3, k * 3);
                b.beam(at(f, spread(y) + 0.25, y - f.y), at(f, -spread(y) - 0.25, y - f.y), 0.22, 0.26, C.woodDark);
                if (k < levels) {
                    const y2 = top - Math.min(h - 0.3, (k + 1) * 3);
                    b.beam(at(f, spread(y), y - f.y), at(f, -spread(y2), y2 - f.y), 0.14, 0.14, C.woodDark);
                    b.beam(at(f, -spread(y), y - f.y), at(f, spread(y2), y2 - f.y), 0.14, 0.14, C.woodDark);
                }
            }
        }

        /** Steel truss sides along a steel bridge: verticals, a top chord and diagonals. */
        function truss(get, r) {
            const P = plan;
            const SP = 3.6, H = 3.9;
            let prev = null, k = 0;
            for (let s = r.sa + 0.5; s <= r.sb - 0.5; s += SP, k++) {
                const i = indexAtS(r, s);
                const f = P.frames[wrap(P, i)];
                const e = get(f.x, f.z);
                [2.0, -2.0].forEach(function (lat) {
                    e.solid.beam(at(f, lat, 0.4), at(f, lat, H), 0.24, 0.24, C.steel);
                    if (prev) {
                        e.solid.beam(at(prev, lat, H), at(f, lat, H), 0.3, 0.3, C.steelDark);
                        if (k % 2) e.solid.beam(at(prev, lat, 0.4), at(f, lat, H), 0.18, 0.18, C.steel);
                        else e.solid.beam(at(prev, lat, H), at(f, lat, 0.4), 0.18, 0.18, C.steel);
                    }
                });
                if (k % 2 === 0) e.solid.beam(at(f, 2.0, H), at(f, -2.0, H), 0.2, 0.2, C.steelDark);
                prev = f;
            }
        }

        /** Solid stone blocks where a bridge meets the ground (never where other track runs). */
        function abutments(get, r) {
            const P = plan;
            [r.a, r.b].forEach(function (i) {
                const f = P.frames[wrap(P, i)];
                const g = groundAt(i);
                const top = f.y - 0.6;
                if (top - g < 0.4) return;
                if (crowded(f.x, f.z, i, 2.6)) return;
                stands(f.x, f.z, 2.6, top, g - 2, 'abutment');
                const e = get(f.x, f.z);
                e.solid.box(f.x, (top + g - 2) / 2, f.z, 4.6, top - g + 2, 2.4, C.stoneDark, { ry: Math.atan2(f.tx, f.tz) });
            });
        }

        function indexAtS(r, s) {
            const P = plan, c = P.c;
            // Walk the run's samples (they are about 1 unit apart).
            let best = r.a, bd = Infinity;
            for (let i = r.a; i <= r.b; i++) {
                const d = Math.abs(sAt(P, i) - s);
                if (d < bd) { bd = d; best = i; }
            }
            void c;
            return best;
        }

        /** A stone tunnel portal: a facade with an arched opening, a keystone, a cornice and wing walls. */
        function portal(get, r, which) {
            const P = plan;
            const i = which === 'in' ? r.a : r.b;
            if (!P.c.closed && (wrap(P, i) === 0 || wrap(P, i) === P.n - 1)) return;   // still being dug
            const f = P.frames[wrap(P, i)];
            const e = get(f.x, f.z);
            const b = e.solid;
            const out = which === 'in' ? -1 : 1;   // the facade's outer face looks away from the tunnel
            const ang = Math.atan2(f.tx, f.tz);
            const T = 1.4, base = -3.2, top = 8.8;
            const blk = function (lat, up, w, h, d, col, along) {
                const p = at(f, lat, up, (along || 0) * out);
                b.box(p[0], p[1], p[2], w, h, d, col, { ry: ang });
            };
            blk(-4.95, (base + top) / 2, 3.3, top - base, T, C.portal);
            blk(4.95, (base + top) / 2, 3.3, top - base, T, C.portal);
            blk(0, (6.3 + top) / 2, 6.8, top - 6.3, T, C.portal);
            // The arch: stepped voussoirs rounding the opening's top corners.
            [[-2.95, 4.7], [-2.55, 5.45], [-1.8, 5.95], [1.8, 5.95], [2.55, 5.45], [2.95, 4.7]].forEach(v => blk(v[0], v[1], 0.95, 0.95, T + 0.15, C.portalDark));
            blk(0, 6.45, 1.2, 1.5, T + 0.5, C.key);
            blk(0, top + 0.25, 13.6, 0.55, T + 0.6, C.key);
            // Wing walls angled back into the cutting.
            [-1, 1].forEach(function (side) {
                const p0 = at(f, side * 6.9, 0, 0.2 * out), p1 = at(f, side * 9.8, 0, 4.4 * out);
                const mid = [(p0[0] + p1[0]) / 2, 0, (p0[2] + p1[2]) / 2];
                const wl = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
                const wa = Math.atan2(p1[0] - p0[0], p1[2] - p0[2]);
                b.box(mid[0], f.y + 1.6, mid[2], 1.0, 9.6, wl, C.portalDark, { ry: wa });
            });
        }

        /** Warm lamps along the tunnel wall. */
        function lamps(get, r) {
            const P = plan;
            let k = 0;
            for (let s = r.sa + 6; s < r.sb - 3; s += 12, k++) {
                const f = P.frames[wrap(P, indexAtS(r, s))];
                const p = at(f, (k % 2 ? 1 : -1) * 3.05, 3.7);
                get(f.x, f.z).glow.box(p[0], p[1], p[2], 0.35, 0.55, 0.7, C.lamp, { ry: Math.atan2(f.tx, f.tz) });
            }
        }

        // o.lazy: nothing is built until update() says where the camera is.
        if (o.lazy) focus = { x: Infinity, z: Infinity, radius: 0 };
        rebuild();

        return {
            root: root,
            /** Remake the track's meshes: rebuild() all of them, rebuild(true) only what changed. */
            rebuild: function (partial) { return rebuild(partial === true); },
            /** Keep only the chunks within `radius` of (x, z) built (a few more a call; all: every one now). */
            update: update,
            /** How many chunks are built now (tests: it stays near the camera's few). */
            builtCount: function () { return built.size; },
            setTrack: function (t) { track = t; sigs = null; return rebuild(false); },
            /** The meshes by chunk key (tests compare partial and full rebuilds). */
            meshes: function () { return meshes; },
            plan: function () { return plan; },
            /** Every pier, leg, frame leg and abutment of the last rebuild (tests check they stand clear). */
            standing: function () { return standing; },
            materials: { solid: solid, glow: glow },
            dispose: function () {
                meshes.forEach(m => { root.remove(m); m.geometry.dispose(); });
                meshes.clear();
                (o.parent || o.scene).remove(root);
                solid.dispose(); glow.dispose();
            }
        };
    }

    return { create: create, RAIL: RAIL, GAUGE: GAUGE };
})();
