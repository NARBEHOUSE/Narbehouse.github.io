/**
 * NARBE Build n Ride - things that happen along the ride.
 *
 * Data-driven: a route lists events, each { type, piece, side, lead, ... }.
 * The event's ANCHOR is the middle of that track piece; it starts when the
 * train's head is `lead` units before the anchor (so it is in view ahead),
 * and runs on every lap. side: 1 = to the right of travel, -1 = to the left.
 *
 * Register a new kind:
 *   BNR.Events.register('kind', {
 *     say: 'Short line to speak',          optional: spoken and shown when it starts
 *     lead: 90,                            default lead
 *     start: function (ctx) { ...; return { update(dt, info) -> alive, dispose() }; }
 *   });
 * ctx: { THREE, root, anchor { x, y, z, tx, tz, rx, rz, s }, side, def, rand,
 *        ground(x, z), lines (decorative tracks: { track, sampler }), fx, emit(name, data),
 *        passed(info, by) -> how far (along the track) the train's head is past the anchor, minus `by` }
 * info (each frame): { train: { s, x, y, z, v, length }, env } - the main train's head (s grows
 * lap after lap), its speed and length; the time of day, season and weather.
 *
 * Kinds: deer, balloons, birds (gulls too), freight, sheep, tractor, eagle, whale,
 * boats, tumbleweed, waterfall (mist at a route's waterfall landmark), blimp, and,
 * gated by the route data's `when`, fireworks (night) and aurora (winter nights).
 *
 * Safety: anything that walks across the line (deer, the tractor) checks the
 * train before it steps within 5 units of the rails, at every crossing on its way
 * (any stretch of the loop), and waits at the edge until the train has gone by
 * unless the train is far enough away for its speed (clearToCross, advance).
 * Nothing is ever run over, whatever the speed (tests/routes.test.cjs).
 * Tumbleweeds roll right across with the wind, never stopping; one the train
 * reaches is bumped up and off the line, never run through.
 */

window.BNR = window.BNR || {};

BNR.Events = (function () {
    'use strict';

    const U = BNR.Util;
    const KINDS = {};
    const geoCache = {};
    let sharedMat = null, glowMat = null;

    function register(kind, def) { def.kind = kind; KINDS[kind] = def; }
    function info(kind) { return KINDS[kind] || null; }

    function geo(key, build) {
        if (!geoCache[key]) { const b = BNR.Geo.builder(); build(b); geoCache[key] = b.geometry(); }
        return geoCache[key];
    }

    function mats(THREE) {
        if (!sharedMat) {
            sharedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
            glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
        }
        return { solid: sharedMat, glow: glowMat };
    }

    /** The events manager for one loaded route. */
    function create(THREE, o) {
        const root = new THREE.Group();
        root.name = 'events';
        o.scene.add(root);
        const live = [];
        const rand = U.mulberry((o.seed || 99) | 0);
        const M = mats(THREE);
        const cl = o.track.centerline();

        /**
         * How a point sits relative to the line: d = distance from the nearest centre line
         * (anywhere on the loop, so a path that meets another stretch of the track sees it),
         * rel = how far along the track from the anchor that nearest point is.
         */
        function nearLine(A, x, z) {
            const n = cl.n, L = cl.length;
            let best = Infinity, bi = 0;
            for (let i = 0; i < n; i += 3) {
                const d = (x - cl.x[i]) * (x - cl.x[i]) + (z - cl.z[i]) * (z - cl.z[i]);
                if (d < best) { best = d; bi = i; }
            }
            const b0 = bi;
            for (let k = -3; k <= 3; k++) {
                let i = b0 + k;
                if (cl.closed) i = (i + n) % n; else if (i < 0 || i >= n) continue;
                const d = (x - cl.x[i]) * (x - cl.x[i]) + (z - cl.z[i]) * (z - cl.z[i]);
                if (d < best) { best = d; bi = i; }
            }
            let rel = cl.s[bi] - A.s;
            if (cl.closed) { if (rel > L / 2) rel -= L; if (rel < -L / 2) rel += L; }
            return { d: Math.sqrt(best), rel: rel, x: cl.x[bi], y: cl.y[bi], z: cl.z[bi], tx: cl.tx[bi], tz: cl.tz[bi] };
        }

        function anchorOf(def) {
            const track = o.track, c = track.centerline();
            const piece = Math.max(0, Math.min(track.pieces.length - 1, def.piece | 0));
            const p = track.pieces[piece];
            const q = BNR.Track.piecePoint(p, 0.5);
            const i = (c.startIndex[piece] + Math.round(Math.max(2, Math.round(p.len)) / 2)) % c.n;
            return { x: q.x, y: c.y[i], z: q.z, tx: q.tx, tz: q.tz, rx: -q.tz, rz: q.tx, s: c.s[c.startIndex[piece]] + p.len / 2 };
        }

        /**
         * Start an event now. extra: { trainS (the train's head when it starts), lead (how far
         * before the anchor that is), anchor (to place it somewhere else: the horn's birds) }.
         */
        function start(def, extra) {
            const K = KINDS[def.type];
            if (!K) return null;
            extra = extra || {};
            const at0 = (extra.trainS || 0) + (extra.lead === undefined ? 0 : extra.lead);
            const ctx = {
                THREE: THREE, root: root, mats: M, def: def, rand: rand,
                anchor: extra.anchor || anchorOf(def), side: def.side || 1,
                ground: o.ground, lines: o.lines || [], fx: BNR.FX,
                emit: function (name, data) { if (o.emit) o.emit(name, data); },
                passed: function (inf, by) { return inf && inf.train ? inf.train.s - at0 - (by || 0) : -Infinity; },
                world: o.world, track: o.track,
                nearLine: function (x, z) { return nearLine(ctx.anchor, x, z); }
            };
            let inst = null;
            try { inst = K.start(ctx); } catch (e) { console.warn('[BNR] event ' + def.type + ' failed to start', e); return null; }
            if (!inst) return null;
            live.push({ def: def, inst: inst, kind: K });
            return K;
        }

        function update(dt, inf) {
            for (let i = live.length - 1; i >= 0; i--) {
                const e = live[i];
                let alive = false;
                try { alive = e.inst.update(dt, inf); } catch (err) { console.warn('[BNR] event ' + e.def.type, err); }
                if (!alive) { try { e.inst.dispose(); } catch (err) { /* ignore */ } live.splice(i, 1); }
            }
        }

        function clear() { live.splice(0).forEach(e => { try { e.inst.dispose(); } catch (err) { /* ignore */ } }); }

        return {
            root: root,
            start: start,
            update: update,
            clear: clear,
            anchorOf: anchorOf,
            count: function () { return live.length; },
            /** Everything that walks or rolls near the line, for tests: [{ kind, x, z }]. */
            actors: function () { const out = []; live.forEach(e => { if (e.inst.actors) e.inst.actors().forEach(a => out.push(a)); }); return out; },
            kinds: function () { return live.map(e => e.def.type); },
            dispose: function () { clear(); o.scene.remove(root); }
        };
    }

    // --- helpers for the kinds ----------------------------------------------------------------

    /** World point: anchor + along * a + across (right) * w. */
    function at(A, a, w) { return { x: A.x + A.tx * a + A.rx * w, z: A.z + A.tz * a + A.rz * w }; }
    function distTrain(x, z, inf) { return inf && inf.train ? Math.hypot(inf.train.x - x, inf.train.z - z) : Infinity; }

    /**
     * A straight path that may cross the line, maybe more than once (a bend, a loop):
     * segs = each stretch where it comes within 5 units of the rails (dIn .. dOut along
     * the path) and where along the track that is from the anchor (rel).
     */
    function crossing(ctx, from, to) {
        const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz);
        const dir = { x: dx / len, z: dz / len };
        const segs = [];
        let cur = null;
        for (let d = 0; d <= len; d += 0.5) {
            const q = ctx.nearLine(from.x + dir.x * d, from.z + dir.z * d);
            if (q.d < 5) {
                if (!cur || Math.abs(q.rel - cur.rel) > 30) { cur = { dIn: d, dOut: d, rel: q.rel, best: q.d, ok: false }; segs.push(cur); }
                cur.dOut = d;
                if (q.d < cur.best) { cur.best = q.d; cur.rel = q.rel; }
            } else cur = null;
        }
        return { from: from, dir: dir, len: len, segs: segs };
    }

    /**
     * May something moving at `speed` step onto the line (one crossing, sg) now? Only if the
     * train's head is further off than it travels while we cross (plus 1.5 s and 15 units),
     * or the whole train has gone by. info.train: { s, v (units/s), length }.
     */
    function clearToCross(ctx, inf, sg, speed) {
        if (!inf || !inf.train) return true;
        const v = inf.train.v === undefined ? 14 : Math.max(0, inf.train.v);
        const length = inf.train.length || 40;
        const headToCross = sg.rel - ctx.passed(inf);
        const tClear = (sg.dOut - sg.dIn + 3) / speed;
        if (headToCross > v * (tClear + 1.5) + 15) return true;
        return -headToCross > length + 8;
    }

    /**
     * Where a walker (w: { dist, cr }) may get to this frame, moving `step` at `speed`: it
     * never steps onto the line in front of the train, but waits at the edge, head up.
     * Once it has stepped on, it keeps going.
     */
    function advance(ctx, inf, w, step, speed) {
        let next = w.dist + step;
        for (const sg of w.cr.segs) {
            if (sg.ok) continue;
            if (next < sg.dIn - 0.5) break;
            if (clearToCross(ctx, inf, sg, speed)) { sg.ok = true; continue; }
            next = Math.max(w.dist, Math.min(next, sg.dIn - 0.5));
            break;
        }
        return next;
    }
    function addMesh(ctx, g, mat, parent) { const m = new ctx.THREE.Mesh(g, mat || ctx.mats.solid); m.castShadow = true; (parent || ctx.root).add(m); return m; }

    // --- deer: a little herd bounds across the line ahead -------------------------------------

    register('deer', {
        say: 'Deer!',
        lead: 110,
        start: function (ctx) {
            const THREE = ctx.THREE, A = ctx.anchor, side = ctx.side;
            const body = { true: geo('deerBuckRun', b => BNR.Animals.deer(b, { buck: true, part: 'body', flag: true })), false: geo('deerDoeRun', b => BNR.Animals.deer(b, { buck: false, part: 'body', flag: true })) };
            const leg = geo('deerLeg', b => BNR.Animals.deer(b, { part: 'leg' })), hind = geo('deerHind', b => BNR.Animals.deer(b, { part: 'hindleg' }));
            const herd = [{ buck: true, delay: 0, off: -2 }, { buck: false, delay: 0.5, off: 2.5 }, { buck: false, delay: 1.0, off: -6 }];
            const SPEED = 7.2, PERIOD = 0.62;
            const deer = herd.map(function (h, i) {
                const g = new THREE.Group();
                addMesh(ctx, body[h.buck], null, g);
                const legs = BNR.Animals.LEGS.deer.map(function (L) {
                    const m = addMesh(ctx, L.hind ? hind : leg, null, g);
                    m.position.set(L.x, L.y, L.z);
                    return { m: m, hind: L.hind };
                });
                ctx.root.add(g);
                const from = at(A, h.off, side * 30), to = at(A, h.off + 6, -side * 46);
                const cr = crossing(ctx, from, to);
                return { g: g, legs: legs, t: -h.delay, dist: 0, cr: cr, len: cr.len, ph: i * 0.37, run: 0, x: from.x, z: from.z };
            });
            let age = 0;
            return {
                update: function (dt, inf) {
                    age += dt;
                    let any = false;
                    deer.forEach(function (d) {
                        d.t += dt;
                        const cr = d.cr;
                        let moving = d.t > 0 && d.dist < d.len;
                        if (moving) {
                            // Never step onto the line in front of the train: wait at the edge.
                            const next = Math.min(d.len, advance(ctx, inf, d, SPEED * dt, SPEED));
                            moving = next > d.dist + 1e-6;
                            d.dist = next;
                        }
                        if (moving) d.run += dt;
                        d.x = cr.from.x + cr.dir.x * d.dist;
                        d.z = cr.from.z + cr.dir.z * d.dist;
                        const u = (d.run / PERIOD + d.ph) % 1;
                        const lift = moving ? 0.9 * Math.max(0, Math.sin(Math.PI * Math.min(1, u / 0.7))) : 0;
                        d.g.position.set(d.x, ctx.ground(d.x, d.z) + lift, d.z);
                        d.g.rotation.set(moving ? -0.32 * Math.cos(Math.PI * Math.min(1, u / 0.7)) : 0, Math.atan2(cr.dir.x, cr.dir.z), 0, 'YXZ');
                        const sw = Math.sin(u * Math.PI * 2);
                        d.legs.forEach(function (L) { L.m.rotation.x = moving ? (L.hind ? 0.75 * sw : -0.85 * Math.sin(u * Math.PI * 2 + 0.9)) : 0; });
                        if (d.dist < d.len) any = true;
                    });
                    return (any || age < 3) && age < 90;
                },
                actors: function () { return deer.map(d => ({ kind: 'deer', x: d.x, z: d.z })); },
                dispose: function () { deer.forEach(d => ctx.root.remove(d.g)); }
            };
        }
    });

    // --- hot air balloons rising out of the fields ---------------------------------------------

    const BALLOON_COLORS = [['#e2453c', '#f2c230', '#2f6fd0'], ['#3fa84f', '#ffffff', '#f28c28'], ['#7a4fc9', '#ffd84a', '#ec6fa6'], ['#1e9c8f', '#f2ead6', '#e2453c']];

    function balloonGeometry(b, cols) {
        const PROF = [[12.4, 0], [12.1, 1.6], [11.4, 3.0], [10.3, 4.0], [8.9, 4.6], [7.4, 4.75], [5.9, 4.4], [4.6, 3.5], [3.5, 2.4], [2.7, 1.45], [2.35, 0.95]];
        const SEG = 12;
        for (let j = 0; j + 1 < PROF.length; j++) {
            for (let g = 0; g < SEG; g++) {
                const a0 = g / SEG * Math.PI * 2, a1 = (g + 1) / SEG * Math.PI * 2;
                const p = (k, a) => [Math.cos(a) * PROF[k][1], PROF[k][0], Math.sin(a) * PROF[k][1]];
                const col = j === 5 ? cols[2] : cols[g % 2];
                b.quad(p(j, a0), p(j, a1), p(j + 1, a1), p(j + 1, a0), col);
            }
        }
        // Basket, burner frame and ropes.
        b.box(0, 0.55, 0, 1.5, 1.1, 1.5, '#9a6b3c', { shade: 0.15 });
        b.box(0, 1.12, 0, 1.6, 0.1, 1.6, '#6e4628');
        [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].forEach(q => b.beam([q[0], 1.15, q[1]], [q[0] * 1.2, 2.4, q[1] * 1.2], 0.05, 0.05, '#5d4030'));
        b.box(0, 1.85, 0, 0.5, 0.3, 0.5, '#4a4a52');
    }

    register('balloons', {
        say: 'Hot air balloons!',
        lead: 170,
        start: function (ctx) {
            const THREE = ctx.THREE, A = ctx.anchor, side = ctx.side;
            const flame = geo('balloonFlame', b => { b.shape('cone:8', 0, 0, 0, 0.5, 1.4, 0.5, '#ffb347'); b.shape('cone:8', 0, -0.15, 0, 0.28, 0.9, 0.28, '#fff3b0'); });
            const list = [0, 1, 2].map(function (i) {
                const cols = BALLOON_COLORS[(i + Math.floor(ctx.rand() * 4)) % BALLOON_COLORS.length];
                const g = new THREE.Group();
                addMesh(ctx, geo('balloon' + cols.join(), b => balloonGeometry(b, cols)), null, g);
                const fl = new THREE.Mesh(flame, ctx.mats.glow);
                fl.position.set(0, 2.55, 0);
                fl.visible = false;
                g.add(fl);
                const p = at(A, -20 + i * 32, side * (60 + i * 26 + ctx.rand() * 10));
                const y0 = ctx.ground(p.x, p.z);
                g.position.set(p.x, y0, p.z);
                g.rotation.y = ctx.rand() * 6;
                ctx.root.add(g);
                return { g: g, fl: fl, x: p.x, z: p.z, y0: y0, alt: 24 + i * 9 + ctx.rand() * 8, rise: 0.9 + ctx.rand() * 0.5, delay: i * 2.2, burn: 0.5 + ctx.rand() * 2, s: 0.9 + ctx.rand() * 0.25 };
            });
            const wind = { x: A.tx * 1.2 + A.rx * 0.4, z: A.tz * 1.2 + A.rz * 0.4 };
            let age = 0;
            return {
                update: function (dt, inf) {
                    age += dt;
                    let near = false;
                    list.forEach(function (b) {
                        const t = Math.max(0, age - b.delay);
                        const h = b.alt * (1 - Math.exp(-t * b.rise / b.alt * 1.6));
                        b.x += wind.x * dt * (t > 0 ? 1 : 0); b.z += wind.z * dt * (t > 0 ? 1 : 0);
                        b.g.position.set(b.x, b.y0 + h, b.z);
                        b.g.scale.setScalar(b.s);
                        b.g.rotation.y += dt * 0.05;
                        b.burn -= dt;
                        if (b.burn <= 0) {
                            b.fl.visible = !b.fl.visible;
                            b.burn = b.fl.visible ? 0.9 + ctx.rand() * 0.6 : 3 + ctx.rand() * 4;
                            if (b.fl.visible && distTrain(b.x, b.z, inf) < 160) ctx.emit('sound', { name: 'burner', gain: 0.5 });
                        }
                        b.fl.scale.set(1, 0.8 + 0.3 * Math.sin(age * 30), 1);
                        if (distTrain(b.x, b.z, inf) < 430) near = true;
                    });
                    return age < 25 || (near && age < 160);
                },
                dispose: function () { list.forEach(b => ctx.root.remove(b.g)); }
            };
        }
    });

    // --- birds: a flock lifts off ------------------------------------------------------------------

    register('birds', {
        lead: 26,
        start: function (ctx) {
            const THREE = ctx.THREE, A = ctx.anchor, side = ctx.side;
            const n = ctx.def.count || 14;
            const gull = ctx.def.kind === 'gull';
            const body = new THREE.InstancedMesh(gull ? geo('gullBody', b => gullPart(b, 'body')) : geo('birdBody', b => BNR.Animals.bird(b, 'body')), ctx.mats.solid, n);
            const wings = new THREE.InstancedMesh(gull ? geo('gullWing', b => gullPart(b, 'wing')) : geo('birdWing', b => BNR.Animals.bird(b, 'wing')), ctx.mats.solid, n * 2);
            [body, wings].forEach(m => { m.frustumCulled = false; ctx.root.add(m); });
            const base = at(A, ctx.def.ahead || 6, side * (ctx.def.away || 16));
            const out = { x: A.rx * side, z: A.rz * side };
            const birds = [];
            for (let i = 0; i < n; i++) {
                const x = base.x + (ctx.rand() - 0.5) * 9, z = base.z + (ctx.rand() - 0.5) * 9;
                birds.push({
                    x: x, y: ctx.ground(x, z) + 0.3 + ctx.rand() * 2.5, z: z,
                    vx: out.x * (2 + ctx.rand() * 3) + A.tx * (2 + ctx.rand() * 3), vy: 3 + ctx.rand() * 2.5, vz: out.z * (2 + ctx.rand() * 3) + A.tz * (2 + ctx.rand() * 3),
                    ph: ctx.rand() * 6, delay: ctx.rand() * 0.6, s: 0.8 + ctx.rand() * 0.5
                });
            }
            ctx.emit('sound', { name: 'flutter', gain: 0.6 });
            const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), w = new THREE.Matrix4(), r = new THREE.Matrix4();
            const mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
            let age = 0;
            return {
                update: function (dt) {
                    age += dt;
                    birds.forEach(function (b, i) {
                        const t = age - b.delay;
                        if (t > 0) {
                            b.vy = Math.max(0.6, b.vy - dt * 0.35);
                            b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
                        }
                        const yaw = Math.atan2(b.vx, b.vz);
                        q.setFromEuler(e.set(-0.25, yaw, 0, 'YXZ'));
                        m.compose(p.set(b.x, b.y, b.z), q, s.set(b.s, b.s, b.s));
                        body.setMatrixAt(i, m);
                        const flap = t > 0 ? Math.sin(age * 15 + b.ph) * 0.95 : 0.1;
                        r.makeRotationZ(flap);
                        w.multiplyMatrices(m, r);
                        wings.setMatrixAt(i * 2, w);
                        r.makeRotationZ(-flap);
                        w.multiplyMatrices(m, r).multiply(mirror);
                        wings.setMatrixAt(i * 2 + 1, w);
                    });
                    body.instanceMatrix.needsUpdate = true;
                    wings.instanceMatrix.needsUpdate = true;
                    return age < 10;
                },
                dispose: function () { ctx.root.remove(body); ctx.root.remove(wings); body.dispose(); wings.dispose(); }
            };
        }
    });

    /** A gull: white with grey wings (scaled a little bigger than a songbird). */
    function gullPart(b, part) {
        if (part === 'wing') {
            b.quad([0, 0, 0.14], [0.62, 0.03, -0.05], [0.52, 0.03, -0.2], [0, 0, -0.1], '#b9c0c8');
            b.quad([0, 0, -0.1], [0.52, 0.03, -0.2], [0.62, 0.03, -0.05], [0, 0, 0.14], '#9aa3ab');
            b.quad([0.62, 0.03, -0.05], [0.72, 0.03, -0.12], [0.6, 0.03, -0.22], [0.52, 0.03, -0.2], '#2b2b33');
            b.quad([0.52, 0.03, -0.2], [0.6, 0.03, -0.22], [0.72, 0.03, -0.12], [0.62, 0.03, -0.05], '#2b2b33');
            return;
        }
        b.blob(0, 0, 0, 0.18, 0.16, 0.42, '#f4f4f2', { round: 0.7 });
        b.shape('cone:4', 0, 0, 0.27, 0.05, 0.12, 0.05, '#f2c230', { rx: Math.PI / 2 });
    }

    // --- another train on a distant line -------------------------------------------------------------

    register('freight', {
        say: 'Another train!',
        lead: 0,
        start: function (ctx) {
            const line = ctx.lines[ctx.def.line || 0];
            if (!line) return null;
            const L = line.sampler.length;
            const rev = !!ctx.def.reverse;
            // Running "backwards" along the line: look positions up from the far end.
            const sampler = rev ? { length: L, at: function (s, out) { return line.sampler.at(L - s, out); } } : line.sampler;
            const train = BNR.Train.create(ctx.THREE, { parent: ctx.root, simple: true, cars: ['diesel', 'boxcar', 'tanker', 'boxcar', 'hopper', 'flatcar', 'boxcar', 'caboose'] });
            let s = train.length + 2;
            const SPEED = ctx.def.speed || 12;
            let honked = 0;
            ctx.emit('sound', { name: 'distant-horn', gain: 0.35 });
            return {
                update: function (dt, inf) {
                    const ds = SPEED * dt;
                    s += ds;
                    train.place(sampler, s, ds);
                    const p = train.position();
                    if (!honked && distTrain(p.x, p.z, inf) < 190) { honked = 1; ctx.emit('sound', { name: 'distant-horn', gain: 0.5 }); }
                    return s < L - 1;
                },
                dispose: function () { train.dispose(); }
            };
        }
    });

    // --- sheep trot away from the line ---------------------------------------------------------------

    register('sheep', {
        lead: 120,
        start: function (ctx) {
            const THREE = ctx.THREE, A = ctx.anchor, side = ctx.side;
            const face = ctx.rand() < 0.5 ? 'B' : 'W';
            const stand = BNR.Props.layers('sheep' + face)[0].geometry, graze = BNR.Props.layers('sheep' + face + 'g')[0].geometry;
            const center = at(A, 0, side * 15);
            const flock = [];
            for (let i = 0; i < 7; i++) {
                const a = ctx.rand() * Math.PI * 2, r = 1.5 + ctx.rand() * 5;
                let x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
                const g = new THREE.Group();
                const ms = addMesh(ctx, stand, null, g), mg = addMesh(ctx, graze, null, g);
                ms.visible = false;
                g.rotation.y = ctx.rand() * 6;
                g.position.set(x, ctx.ground(x, z), z);
                ctx.root.add(g);
                flock.push({ g: g, ms: ms, mg: mg, x: x, z: z, run: 0, t: -1, delay: ctx.rand() * 0.9, dist: 10 + ctx.rand() * 7, ph: ctx.rand() * 6 });
            }
            const out = { x: A.rx * side, z: A.rz * side };
            let started = false, age = 0, baaAgain = 0;
            return {
                update: function (dt, inf) {
                    age += dt;
                    if (!started && ctx.passed(inf, -55) > 0) {
                        started = true;
                        ctx.emit('sound', { name: 'baa', gain: 0.55 });
                        baaAgain = 0.9;
                    }
                    if (baaAgain > 0 && (baaAgain -= dt) <= 0) ctx.emit('sound', { name: 'baa', gain: 0.4 });
                    flock.forEach(function (sh) {
                        if (started && sh.t < 0) sh.t = -sh.delay;
                        if (started) sh.t += dt;
                        const running = sh.t > 0 && sh.run < sh.dist;
                        if (running) {
                            const ds = Math.min(sh.dist - sh.run, 3.3 * dt);
                            sh.run += ds;
                            sh.x += out.x * ds; sh.z += out.z * ds;
                            sh.g.rotation.y = U.dampAngle(sh.g.rotation.y, Math.atan2(out.x, out.z) + (sh.ph - 3) * 0.08, 6, dt);
                        }
                        sh.ms.visible = running;
                        sh.mg.visible = !running;
                        sh.g.position.set(sh.x, ctx.ground(sh.x, sh.z) + (running ? 0.14 * Math.abs(Math.sin(sh.t * 11 + sh.ph)) : 0), sh.z);
                    });
                    return ctx.passed(inf, 260) < 0 && age < 150;
                },
                dispose: function () { flock.forEach(sh => ctx.root.remove(sh.g)); }
            };
        }
    });

    // --- a tractor hauling hay along the field edge --------------------------------------------------

    function tractorBody(b) {
        const red = '#c8312a', dark = '#2b2b33';
        b.box(0, 0.95, 0.75, 0.95, 0.75, 2.0, red);                         // hood
        b.box(0, 0.98, 1.78, 0.9, 0.62, 0.08, dark);                         // grille
        b.box(0, 0.62, 0.3, 0.7, 0.35, 2.6, dark);                           // chassis
        b.shape('cyl:0.07,0.07,6', 0.28, 1.75, 1.15, 1, 1.0, 1, dark);        // exhaust
        b.box(0, 1.05, -0.6, 1.2, 0.9, 1.1, red);                            // body under the cab
        [[0.55, -0.1], [-0.55, -0.1], [0.55, -1.1], [-0.55, -1.1]].forEach(p => b.box(p[0], 2.1, p[1], 0.08, 1.3, 0.08, dark));
        b.box(0, 2.78, -0.6, 1.35, 0.1, 1.35, red);                          // roof
        [-1, 1].forEach(s => b.box(s * 0.85, 1.35, -0.62, 0.5, 0.12, 1.4, red));   // fenders
        b.box(0, 1.5, -0.25, 0.08, 0.35, 0.08, dark);
        b.shape('cyl:0.18,0.18,10', 0, 1.7, -0.2, 1, 0.04, 1, dark, { rx: 0.8 });   // steering wheel
        // The farmer: overalls, check shirt, straw hat.
        b.box(0, 1.55, -0.75, 0.38, 0.5, 0.3, '#2f5f9e');
        b.blob(0, 1.92, -0.72, 0.36, 0.42, 0.26, '#d2452f', { round: 0.5 });
        b.blob(0, 2.3, -0.7, 0.26, 0.3, 0.26, '#e0ac85', { round: 0.85 });
        b.shape('cyl:0.3,0.3,10', 0, 2.47, -0.7, 1, 0.05, 1, '#e8c66a');
        b.shape('cyl:0.15,0.17,10', 0, 2.56, -0.7, 1, 0.16, 1, '#e8c66a');
        // Trailer of hay.
        b.box(0, 0.75, -3.6, 1.9, 0.15, 3.2, '#8a5a33');
        b.beam([0, 0.7, -1.3], [0, 0.7, -2.1], 0.12, 0.12, dark);
        [[-0.48, -2.85], [0.48, -2.85], [-0.48, -4.35], [0.48, -4.35]].forEach(p => b.shape('cyl:0.5,0.5,10', p[0], 1.35, p[1], 1, 0.95, 1, '#e3c25b', { rx: Math.PI / 2, shade: 0.12 }));
        b.shape('cyl:0.5,0.5,10', 0, 2.25, -3.6, 1, 0.95, 1, '#e3c25b', { rx: Math.PI / 2, shade: 0.12 });
    }
    function wheel(b, r, w, hub) {
        b.shape('cyl:1,1,12', 0, 0, 0, r, w, r, '#26262b', { rz: Math.PI / 2 });
        b.shape('cyl:1,1,10', 0, 0, 0, r * 0.5, w + 0.04, r * 0.5, hub, { rz: Math.PI / 2 });
        b.box(0, 0, 0, w + 0.06, r * 1.5, r * 0.22, '#3a3a40');
    }

    register('tractor', {
        say: 'A tractor!',
        lead: 150,
        start: function (ctx) {
            const THREE = ctx.THREE, A = ctx.anchor, side = ctx.side;
            const g = new THREE.Group();
            addMesh(ctx, geo('tractor', tractorBody), null, g);
            const big = geo('tractorBig', b => wheel(b, 0.8, 0.45, '#f2c230')), small = geo('tractorSmall', b => wheel(b, 0.42, 0.28, '#f2c230')), trail = geo('trailerWheel', b => wheel(b, 0.42, 0.22, '#9aa0a8'));
            const wheels = [[0.88, 0.8, -0.6, big, 0.8], [-0.88, 0.8, -0.6, big, 0.8], [0.62, 0.42, 1.3, small, 0.42], [-0.62, 0.42, 1.3, small, 0.42], [1.05, 0.42, -3.6, trail, 0.42], [-1.05, 0.42, -3.6, trail, 0.42]].map(function (wd) {
                const m = addMesh(ctx, wd[3], null, g);
                m.position.set(wd[0], wd[1], wd[2]);
                return { m: m, r: wd[4] };
            });
            ctx.root.add(g);
            const from = at(A, -30, side * 24);
            const SPEED = 3.2;
            // Along the field edge; if the line bends across its way, it waits for the train there.
            const w = { dist: 0, cr: crossing(ctx, from, at(A, 270, side * 24)) };
            const dir = w.cr.dir;
            let age = 0, puff = 0, x = from.x, z = from.z, moving = true;
            ctx.emit('sound', { name: 'engine', gain: 0.35 });
            return {
                update: function (dt, inf) {
                    age += dt;
                    const next = Math.min(w.cr.len, advance(ctx, inf, w, SPEED * dt, SPEED));
                    moving = next > w.dist + 1e-6;
                    const d = w.dist = next;
                    x = from.x + dir.x * d; z = from.z + dir.z * d;
                    const y = ctx.ground(x, z), yf = ctx.ground(x + dir.x * 2, z + dir.z * 2);
                    g.position.set(x, y, z);
                    g.rotation.set(-Math.atan2(yf - y, 2), Math.atan2(dir.x, dir.z), 0, 'YXZ');
                    if (moving) wheels.forEach(wh => { wh.m.rotation.x += SPEED * dt / wh.r; });
                    puff -= dt;
                    if (puff <= 0) {
                        puff = 0.45;
                        const e = new THREE.Vector3(0.28, 2.3, 1.15).applyMatrix4(g.matrixWorld);
                        BNR.FX.smoke(e.x, e.y, e.z, 1, 0.35, '#6b6560', 1.4);
                    }
                    return ctx.passed(inf, 260) < 0 && age < 160;
                },
                actors: function () { return [{ kind: 'tractor', x: x, z: z }]; },
                dispose: function () { ctx.root.remove(g); }
            };
        }
    });

    // --- an eagle soaring in circles ------------------------------------------------------------------

    function eaglePart(b, part) {
        if (part === 'wing') {
            b.quad([0, 0, 0.3], [1.0, 0.06, 0.12], [1.15, 0.06, -0.25], [0, 0, -0.2], '#5a3d26');
            b.quad([0, 0, -0.2], [1.15, 0.06, -0.25], [1.0, 0.06, 0.12], [0, 0, 0.3], '#4a3220');
            b.quad([1.0, 0.06, 0.12], [1.55, 0.1, -0.02], [1.45, 0.1, -0.3], [1.15, 0.06, -0.25], '#3f2a1b');
            b.quad([1.15, 0.06, -0.25], [1.45, 0.1, -0.3], [1.55, 0.1, -0.02], [1.0, 0.06, 0.12], '#3f2a1b');
            return;
        }
        b.blob(0, 0, 0, 0.36, 0.32, 1.0, '#5a3d26', { round: 0.7 });
        b.blob(0, 0.06, 0.55, 0.26, 0.26, 0.3, '#f6f3ec', { round: 0.8 });
        b.shape('cone:4', 0, 0.02, 0.76, 0.08, 0.16, 0.08, '#f2c230', { rx: Math.PI / 2 });
        b.blob(0, 0, -0.58, 0.32, 0.06, 0.36, '#f6f3ec', { round: 0.6 });
    }

    register('eagle', {
        say: 'An eagle!',
        lead: 70,
        start: function (ctx) {
            const THREE = ctx.THREE, A = ctx.anchor, side = ctx.side;
            const g = new THREE.Group();
            addMesh(ctx, geo('eagleBody', b => eaglePart(b, 'body')), null, g);
            const wl = addMesh(ctx, geo('eagleWing', b => eaglePart(b, 'wing')), null, g);
            const wr = addMesh(ctx, geo('eagleWing', b => eaglePart(b, 'wing')), null, g);
            wr.scale.set(-1, 1, 1);
            ctx.root.add(g);
            const c = at(A, 20, side * 34);
            const base = ctx.ground(c.x, c.z) + 26;
            const R = 20, dir = side > 0 ? 1 : -1;
            let a = 0, age = 0, x = c.x, y = base, z = c.z, yaw = 0;
            return {
                update: function (dt, inf) {
                    age += dt;
                    let nx, ny, nz;
                    if (age < 22) {
                        a += dt * 0.32 * dir;
                        nx = c.x + Math.cos(a) * R; nz = c.z + Math.sin(a) * R; ny = base + 3 * Math.sin(age * 0.4);
                    } else {
                        // Off it goes, climbing away from the line.
                        nx = x + A.rx * side * 9 * dt; nz = z + A.rz * side * 9 * dt; ny = y + 2.5 * dt;
                    }
                    const vx = nx - x, vz = nz - z;
                    if (Math.hypot(vx, vz) > 1e-4) yaw = U.dampAngle(yaw, Math.atan2(vx, vz), 4, dt);
                    x = nx; y = ny; z = nz;
                    g.position.set(x, y, z);
                    g.rotation.set(0, yaw, age < 22 ? dir * 0.35 : 0, 'YXZ');
                    // Mostly gliding, with a few slow wingbeats now and then.
                    const flap = (age % 7) < 1.4 ? Math.sin(age * 6) * 0.5 : 0.08;
                    wl.rotation.z = flap; wr.rotation.z = -flap;
                    return age < 40 && distTrain(x, z, inf) < 500;
                },
                dispose: function () { ctx.root.remove(g); }
            };
        }
    });

    /** Find open water to one side of the anchor: the first point from `near` units out that is at least `depth` deep. */
    function findWater(ctx, A, side, near, far, depth) {
        for (let d = near; d <= far; d += 8) {
            const p = at(A, 0, side * d);
            const q = ctx.world.sample(p.x, p.z);
            if (q.wet && q.water - q.h > (depth || 2)) return { x: p.x, z: p.z, level: q.water, d: d };
        }
        return null;
    }

    // --- a whale breaching ------------------------------------------------------------------------------

    function whaleGeo(b) {
        b.blob(0, 0, 0, 2.1, 1.9, 7.2, (cx, cy) => cy < -0.25 ? '#d8dde3' : '#3b4a5a', { segs: 3, round: 0.7, taper: 0.86 });
        b.blob(0, -0.05, -4.3, 0.9, 0.8, 2.4, '#3b4a5a', { round: 0.6, taper: 1.5 });
        [-1, 1].forEach(sd => {
            b.blob(sd * 1.15, -0.05, -5.5, 2.3, 0.16, 1.0, '#33404e', { round: 0.6, ry: sd * 0.35 });
            b.blob(sd * 1.35, -0.55, 1.5, 2.8, 0.13, 0.8, '#e1e6ea', { round: 0.6, rz: sd * 0.4, ry: sd * 0.35 });
        });
        b.box(0, 0.75, -1.8, 0.12, 0.35, 0.6, '#33404e');
    }

    register('whale', {
        say: 'A whale!',
        lead: 120,
        start: function (ctx) {
            const THREE = ctx.THREE, A = ctx.anchor;
            const w = findWater(ctx, A, ctx.side, 50, 260, 4);
            if (!w) return null;
            const spot = at({ x: w.x, z: w.z, tx: A.tx, tz: A.tz, rx: A.rx, rz: A.rz }, 0, ctx.side * 25);
            const g = new THREE.Group();
            addMesh(ctx, geo('whale', whaleGeo), null, g);
            ctx.root.add(g);
            const head = Math.atan2(A.tx, A.tz) + ctx.side * 0.5;
            const fx = Math.sin(head), fz = Math.cos(head);
            const L = w.level;
            let age = 0, splashed = 0;
            g.visible = false;
            return {
                update: function (dt, inf) {
                    age += dt;
                    if (age < 1.6) {
                        if (Math.floor(age * 3) !== Math.floor((age - dt) * 3)) BNR.FX.steam(spot.x, L + 0.3, spot.z, 4, 1.2, 0, 6.5, 0, '#ffffff');
                    } else if (age < 5.6) {
                        // The breach: up out of the water nose first, over, and back in.
                        const u = (age - 1.6) / 4;
                        g.visible = true;
                        const along = (u - 0.5) * 9;
                        g.position.set(spot.x + fx * along, L - 3 + 9.5 * Math.sin(Math.PI * u), spot.z + fz * along);
                        g.rotation.set(-1.0 * Math.cos(Math.PI * u), head, 0.25 * Math.sin(Math.PI * u), 'YXZ');
                        if (u > 0.12 && splashed === 0) { splashed = 1; BNR.FX.splash(spot.x - fx * 3, L, spot.z - fz * 3, 1.6); }
                        if (u > 0.9 && splashed === 1) { splashed = 2; BNR.FX.splash(spot.x + fx * 4, L, spot.z + fz * 4, 2.4); if (distTrain(spot.x, spot.z, inf) < 300) ctx.emit('sound', { name: 'splash', gain: 0.6 }); }
                    } else if (age < 7) {
                        g.visible = false;
                    } else if (age < 10.5) {
                        // Then the tail flukes rise, and slip under.
                        const u = (age - 7) / 3.5;
                        g.visible = true;
                        g.position.set(spot.x + fx * 6, L - 4.2 + 2.6 * Math.sin(Math.PI * u), spot.z + fz * 6);
                        g.rotation.set(1.25, head, 0, 'YXZ');
                        if (u > 0.85 && splashed === 2) { splashed = 3; BNR.FX.splash(spot.x + fx * 1, L, spot.z + fz * 1, 1.2); }
                    } else return false;
                    return true;
                },
                dispose: function () { ctx.root.remove(g); }
            };
        }
    });

    // --- sailboats ------------------------------------------------------------------------------------

    function boatGeo(b, hull, sail) {
        b.blob(0, 0.35, 0, 1.5, 0.75, 4.4, hull, { round: 0.5, taper: 0.45 });
        b.box(0, 0.78, -0.4, 1.15, 0.12, 2.6, '#c9a57a');
        b.shape('cyl:0.06,0.08,6', 0, 3.5, 0.2, 1, 5.6, 1, '#e9e4d8');
        const tri = (p, q, r, c) => { b.tri(p, q, r, c); b.tri(r, q, p, c); };
        tri([0, 1.2, 0.05], [0, 6.1, 0.2], [0, 1.25, -2.1], sail);
        tri([0, 5.4, 0.3], [0, 1.15, 2.0], [0, 1.1, 0.4], '#f6f3ec');
    }

    register('boats', {
        say: 'Sailboats!',
        lead: 160,
        start: function (ctx) {
            const THREE = ctx.THREE, A = ctx.anchor;
            const w = findWater(ctx, A, ctx.side, 30, 220, 2.5);
            if (!w) return null;
            const COLS = [['#ffffff', '#e2453c'], ['#2f6fd0', '#f6f3ec'], ['#d2452f', '#ffd84a']];
            const list = [0, 1, 2].map(function (i) {
                const c = COLS[i];
                const g = new THREE.Group();
                addMesh(ctx, geo('boat' + i, b => boatGeo(b, c[0], c[1])), null, g);
                const p = at({ x: w.x, z: w.z, tx: A.tx, tz: A.tz, rx: A.rx, rz: A.rz }, -30 + i * 32 + ctx.rand() * 10, ctx.side * (10 + i * 16 + ctx.rand() * 8));
                const q = ctx.world.sample(p.x, p.z);
                if (!(q.wet && q.water - q.h > 1.5)) return null;
                g.position.set(p.x, q.water, p.z);
                g.rotation.y = Math.atan2(A.tx, A.tz) + (ctx.rand() - 0.5) * 0.8;
                ctx.root.add(g);
                return { g: g, x: p.x, z: p.z, y: q.water, ph: ctx.rand() * 6 };
            }).filter(Boolean);
            if (!list.length) return null;
            let age = 0;
            return {
                update: function (dt, inf) {
                    age += dt;
                    list.forEach(function (bt) {
                        const f = Math.sin(bt.g.rotation.y), h = Math.cos(bt.g.rotation.y);
                        const nx = bt.x + f * 1.1 * dt, nz = bt.z + h * 1.1 * dt;
                        const q = ctx.world.sample(nx, nz);
                        if (q.wet && q.water - q.h > 1.2) { bt.x = nx; bt.z = nz; } else bt.g.rotation.y += dt * 0.4;
                        bt.g.position.set(bt.x, bt.y + 0.08 * Math.sin(age * 1.3 + bt.ph), bt.z);
                        bt.g.rotation.x = 0.04 * Math.sin(age * 1.1 + bt.ph);
                        bt.g.rotation.z = 0.08 * Math.sin(age * 0.9 + bt.ph * 2);
                    });
                    return ctx.passed(inf, 320) < 0 && age < 180;
                },
                dispose: function () { list.forEach(bt => ctx.root.remove(bt.g)); }
            };
        }
    });

    // --- tumbleweeds rolling across the line (safely) ----------------------------------------------------

    /**
     * A tumbleweed: a see-through ball of thin, wiry twigs, with no solid core and nothing
     * sticking out. Twigs curl round the surface at every tilt, with a looser tangle inside,
     * so it reads as a ball from any side; it stays inside radius 0.5, the radius it rolls on.
     */
    function weedGeo(b, seed) {
        const rnd = U.mulberry(seed);
        const COLS = ['#b39462', '#9f7f4f', '#c2a676', '#8c7350', '#aa8d60'];
        const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
        const unit = (p) => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };
        function twig(radius, span, width, col) {
            // A random axis, evenly over the sphere, and two directions square to it.
            const z = rnd() * 2 - 1, t = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
            const ax = [s * Math.cos(t), z, s * Math.sin(t)];
            const u = unit(cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(ax, u);
            const a0 = rnd() * Math.PI * 2, ph = rnd() * 6.3, ph2 = rnd() * 6.3;
            const n = Math.max(3, Math.round(span / 0.3));
            let prev = null;
            for (let i = 0; i <= n; i++) {
                const a = a0 + span * i / n, c = Math.cos(a), sn = Math.sin(a);
                const wander = 0.2 * Math.sin(a * 2 + ph2);                          // drifts off its circle
                const r = radius * (1 - 0.07 * (0.5 + 0.5 * Math.sin(a * 3 + ph)));  // kinks inward, never out
                const d = unit([u[0] * c + v[0] * sn + ax[0] * wander, u[1] * c + v[1] * sn + ax[1] * wander, u[2] * c + v[2] * sn + ax[2] * wander]);
                const p = [d[0] * r, d[1] * r, d[2] * r];
                if (prev) b.beam(prev, p, width, width, col, { roll: rnd() * 1.5 });
                prev = p;
            }
        }
        for (let k = 0; k < 15; k++) twig(0.465 + rnd() * 0.02, Math.PI * (0.9 + rnd() * 1.1), 0.036, COLS[k % COLS.length]);
        for (let k = 0; k < 6; k++) twig(0.2 + rnd() * 0.15, Math.PI * (0.7 + rnd() * 0.9), 0.03, COLS[(k + 2) % COLS.length]);
    }

    /**
     * Tumbleweeds roll right across the line with the wind (gusting, never stopping). If the
     * train reaches one on the rails, its nose bumps it: up, forward and off to the far side
     * with a puff of dust, bouncing on and rolling away. The train never passes through one.
     */
    register('tumbleweed', {
        say: 'Tumbleweeds!',
        lead: 95,
        start: function (ctx) {
            const A = ctx.anchor, side = ctx.side;
            const SPEED = 6.5;
            const list = [0, 1, 2].map(function (i) {
                const m = addMesh(ctx, geo('weed' + i, b => weedGeo(b, 0x7e3d + i * 977)));
                const sc = 1.5 + ctx.rand() * 0.6;
                m.scale.setScalar(sc);
                const from = at(A, -8 + i * 7, side * 32), to = at(A, -4 + i * 7, -side * 50);
                const cr = crossing(ctx, from, to);
                return { id: i, m: m, sc: sc, cr: cr, t: -i * 0.7, dist: 0, x: from.x, y: 0, z: from.z, spin: 0, gust: ctx.rand() * 6.3, knocked: null };
            });
            const yaw = w => Math.atan2(w.cr.dir.x, w.cr.dir.z);
            /** Is the train's nose (or body) on it? Only where the rails are down at its own level. */
            function caught(inf, w) {
                if (!inf || !inf.train) return null;
                const q = ctx.nearLine(w.x, w.z);
                if (q.d > 2.6 || Math.abs(q.y - (w.y - 0.5 * w.sc)) > 3) return null;
                const past = ctx.passed(inf) - q.rel;           // how far the head has gone beyond it
                return past > -(0.5 * w.sc + 0.9) && past < (inf.train.length || 40) + 1 ? q : null;
            }
            function knock(inf, w, q) {
                const v = Math.max(4, inf.train.v || 9);
                // Off the line on the side it is on (the far side if the nose meets it in the middle).
                let ox = w.x - q.x, oz = w.z - q.z;
                const ol = Math.hypot(ox, oz);
                if (ol > 0.4) { ox /= ol; oz /= ol; } else { ox = w.cr.dir.x; oz = w.cr.dir.z; }
                w.knocked = { t: 0, vx: q.tx * v * 0.95 + ox * 8, vz: q.tz * v * 0.95 + oz * 8, vy: 6.2, spin: 10 };
                if (BNR.FX && BNR.FX.dust) BNR.FX.dust(w.x, w.y - 0.3 * w.sc, w.z, 6, 1.1, '#dcc89c');
            }
            function fly(w, dt) {
                const k = w.knocked;
                k.t += dt;
                k.vy -= 18 * dt;
                w.x += k.vx * dt; w.z += k.vz * dt; w.y += k.vy * dt;
                const g = ctx.ground(w.x, w.z) + 0.5 * w.sc;
                if (w.y < g) {                                   // a bounce, losing speed each time
                    w.y = g;
                    if (k.vy < 0) k.vy = -k.vy * 0.45;
                    const f = Math.pow(0.35, dt * 4);
                    k.vx *= f; k.vz *= f;
                }
                w.spin += dt * (k.spin + Math.hypot(k.vx, k.vz) / (0.5 * w.sc));
                k.spin *= Math.pow(0.5, dt);
                w.m.position.set(w.x, w.y, w.z);
                w.m.rotation.set(w.spin, Math.atan2(k.vx, k.vz), 0, 'YXZ');
            }
            let age = 0;
            return {
                update: function (dt, inf) {
                    age += dt;
                    let any = false;
                    list.forEach(function (w) {
                        w.t += dt;
                        if (w.knocked) { fly(w, dt); if (w.knocked.t < 5) any = true; return; }
                        const cr = w.cr;
                        if (w.t > 0 && w.dist < cr.len) {
                            // Rolling with the wind: gusts speed it up and ease it off, but it never stops.
                            const v = SPEED * (0.8 + 0.3 * Math.sin(age * 1.1 + w.gust) + 0.12 * Math.sin(age * 2.9 + w.gust * 2));
                            const next = Math.min(cr.len, w.dist + v * dt);
                            w.spin += (next - w.dist) / (0.5 * w.sc);
                            w.dist = next;
                        }
                        w.x = cr.from.x + cr.dir.x * w.dist; w.z = cr.from.z + cr.dir.z * w.dist;
                        const bounce = Math.abs(Math.sin(w.dist * 0.45)) * 0.9;
                        w.y = ctx.ground(w.x, w.z) + 0.5 * w.sc + bounce;
                        w.m.position.set(w.x, w.y, w.z);
                        w.m.rotation.set(w.spin, yaw(w), 0, 'YXZ');
                        const q = caught(inf, w);
                        if (q) knock(inf, w, q);
                        if (w.dist < cr.len) any = true;
                    });
                    return (any || age < 2) && age < 90;
                },
                actors: function () { return list.map(w => ({ kind: 'tumbleweed', id: w.id, x: w.x, z: w.z, r: 0.5 * w.sc, knocked: !!w.knocked })); },
                dispose: function () { list.forEach(w => ctx.root.remove(w.m)); }
            };
        }
    });

    // --- a waterfall's mist (at the route's waterfall landmark) ------------------------------------------

    register('waterfall', {
        say: 'A waterfall!',
        lead: 120,
        start: function (ctx) {
            const A = ctx.anchor;
            let best = null, bd = 520;
            (ctx.world.landmarks ? ctx.world.landmarks('waterfall') : []).forEach(function (f) {
                const d = Math.hypot(f.x - A.x, f.z - A.z);
                if (d < bd) { bd = d; best = f; }
            });
            if (!best) return null;
            const ry = best.ry || 0;
            const px = best.x + Math.sin(ry) * 3.5, pz = best.z + Math.cos(ry) * 3.5;
            const py = ctx.ground(best.x, best.z) + 0.6;
            ctx.emit('sound', { name: 'splash', gain: 0.45 });
            let age = 0, t = 0;
            return {
                update: function (dt) {
                    age += dt; t -= dt;
                    if (t <= 0) { t = 0.22; BNR.FX.steam(px + (ctx.rand() - 0.5) * 3, py, pz + (ctx.rand() - 0.5) * 2, 2, 1.5, 0, 1.4, 0, '#f4fafd'); }
                    return age < 24;
                },
                dispose: function () {}
            };
        }
    });

    // --- a blimp drifting over the city ------------------------------------------------------------------

    function blimpGeo(b) {
        b.blob(0, 0, 0, 4.6, 4.6, 16, '#e9edf2', { segs: 3, round: 0.88, shade: 0.06 });
        b.shape('cyl:2.38,2.38,12', 0, 0, 0.5, 1, 1.4, 1, '#2f6fd0', { rx: Math.PI / 2 });
        [[0, 2.0, 0], [0, -2.0, 0], [2.0, 0, Math.PI / 2], [-2.0, 0, Math.PI / 2]].forEach(f => b.box(f[0], f[1], -6.6, 0.12, 2.2, 2.4, '#e2453c', { rz: f[2] }));
        b.box(0, -2.65, 0.8, 1.3, 0.9, 3.2, '#3a3a40');
        b.box(0, -2.62, 0.8, 1.34, 0.4, 2.6, '#ffe9a6');
    }

    register('blimp', {
        say: 'A blimp!',
        lead: 180,
        start: function (ctx) {
            const THREE = ctx.THREE, A = ctx.anchor, side = ctx.side;
            const g = new THREE.Group();
            addMesh(ctx, geo('blimp', blimpGeo), null, g);
            ctx.root.add(g);
            const start = at(A, -60, side * 110);
            const head = Math.atan2(A.tx, A.tz) - side * 0.5;
            const fx = Math.sin(head), fz = Math.cos(head);
            let x = start.x, z = start.z, age = 0;
            const y0 = ctx.ground(x, z) + 55;
            return {
                update: function (dt, inf) {
                    age += dt;
                    x += fx * 4 * dt; z += fz * 4 * dt;
                    g.position.set(x, y0 + Math.sin(age * 0.5) * 1.2, z);
                    g.rotation.set(0.03 * Math.sin(age * 0.4), head, 0, 'YXZ');
                    return age < 110 && distTrain(x, z, inf) < 520;
                },
                dispose: function () { ctx.root.remove(g); }
            };
        }
    });

    // --- fireworks over a park (routes gate this with when: { night: true }) ---------------------------

    register('fireworks', {
        say: 'Fireworks!',
        lead: 140,
        start: function (ctx) {
            const THREE = ctx.THREE, A = ctx.anchor;
            const site = at(A, 20, ctx.side * 85);
            // Launched from the ground, or from the water's surface over a harbour.
            const q = ctx.world ? ctx.world.sample(site.x, site.z) : null;
            const gy = q ? Math.max(q.h, q.water === null ? -Infinity : q.water) : ctx.ground(site.x, site.z);
            const COLS = ['#ff5d73', '#ffd23f', '#5aa9ff', '#3bceac', '#c77dff', '#ff9f43', '#ffffff'].map(c => new THREE.Color(c));
            const TRAIL = new THREE.Color('#ffe7a8');
            const rockets = [];
            for (let k = 0; k < 10; k++) rockets.push({ t0: k * 1.5 + ctx.rand() * 0.6, x: site.x + (ctx.rand() - 0.5) * 30, z: site.z + (ctx.rand() - 0.5) * 30, h: 42 + ctx.rand() * 18, col: COLS[Math.floor(ctx.rand() * COLS.length)], done: false });
            // Big glowing points (world-sized, so they read from far off): one cloud for every spark.
            const MAX = 10 * 60 + 10;
            const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3);
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
            g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
            const mat = new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
            const cloud = new THREE.Points(g, mat);
            cloud.frustumCulled = false;
            cloud.renderOrder = 7;
            ctx.root.add(cloud);
            const sparks = [];
            let age = 0;
            return {
                update: function (dt, inf) {
                    age += dt;
                    let n = 0;
                    const put = function (x, y, z, c, k) {
                        if (n >= MAX) return;
                        pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z;
                        col[n * 3] = c.r * k; col[n * 3 + 1] = c.g * k; col[n * 3 + 2] = c.b * k;
                        n++;
                    };
                    rockets.forEach(function (r) {
                        const u = (age - r.t0) / 1.6;
                        if (u < 0 || r.done) return;
                        if (u < 1) put(r.x, gy + r.h * (1 - Math.pow(1 - u, 2)), r.z, TRAIL, 1);
                        else {
                            r.done = true;
                            // A round burst: sparks fly out, slow, droop and fade.
                            for (let i = 0; i < 56; i++) {
                                const a = ctx.rand() * Math.PI * 2, e = Math.asin(ctx.rand() * 2 - 1), sp = 10 + ctx.rand() * 3;
                                sparks.push({ x: r.x, y: gy + r.h, z: r.z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp, age: 0, life: 1.6 + ctx.rand() * 0.7, c: r.col });
                            }
                            if (distTrain(r.x, r.z, inf) < 320) ctx.emit('sound', { name: 'pop', gain: 0.35 });
                        }
                    });
                    for (let i = sparks.length - 1; i >= 0; i--) {
                        const p = sparks[i];
                        p.age += dt;
                        if (p.age >= p.life) { sparks.splice(i, 1); continue; }
                        const drag = Math.exp(-1.6 * dt);
                        p.vx *= drag; p.vy = p.vy * drag - 4 * dt; p.vz *= drag;
                        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
                        const u = p.age / p.life;
                        put(p.x, p.y, p.z, p.c, Math.pow(1 - u, 1.4));
                    }
                    g.setDrawRange(0, n);
                    g.attributes.position.needsUpdate = true;
                    g.attributes.color.needsUpdate = true;
                    return age < 22 || sparks.length > 0;
                },
                dispose: function () { ctx.root.remove(cloud); g.dispose(); mat.dispose(); }
            };
        }
    });

    // --- the northern lights (routes gate this with when: { night: true, season: 'winter' }) -------------

    register('aurora', {
        say: 'Northern lights!',
        lead: 200,
        start: function (ctx) {
            const THREE = ctx.THREE, A = ctx.anchor;
            const SEG = 28;
            const ribbons = [0, 1, 2].map(function (k) {
                const geo3 = new THREE.BufferGeometry();
                const pos = new Float32Array((SEG + 1) * 2 * 3), col = new Float32Array((SEG + 1) * 2 * 3), idx = [];
                const lo = new THREE.Color(k === 1 ? '#9b7bff' : '#5cffb0'), hi = new THREE.Color('#0d2f4a');
                for (let i = 0; i <= SEG; i++) {
                    col.set([lo.r, lo.g, lo.b], i * 6); col.set([hi.r * 0.4, hi.g * 0.4, hi.b * 0.4], i * 6 + 3);
                    if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
                }
                geo3.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                geo3.setAttribute('color', new THREE.BufferAttribute(col, 3));
                geo3.setIndex(idx);
                const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
                const m = new THREE.Mesh(geo3, mat);
                m.frustumCulled = false;
                m.renderOrder = -5;
                ctx.root.add(m);
                return { m: m, geo: geo3, mat: mat, pos: pos, k: k };
            });
            ctx.emit('sound', { name: 'chime', gain: 0.4 });
            let age = 0;
            const cx = A.x, cz = A.z;
            return {
                update: function (dt) {
                    age += dt;
                    const fade = Math.min(1, age / 6) * Math.max(0, Math.min(1, (52 - age) / 8));
                    ribbons.forEach(function (r) {
                        r.mat.opacity = 0.75 * fade;
                        for (let i = 0; i <= SEG; i++) {
                            const u = i / SEG;
                            const a = -Math.PI / 2 + (u - 0.5) * 1.5 + r.k * 0.18;
                            const R = 250 + r.k * 30 + 14 * Math.sin(age * 0.35 + u * 7 + r.k);
                            const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
                            const y0 = 95 + r.k * 12 + 8 * Math.sin(age * 0.25 + u * 5);
                            r.pos.set([x, y0, z], i * 6);
                            r.pos.set([x, y0 + 55 + 15 * Math.sin(age * 0.3 + u * 9 + r.k), z], i * 6 + 3);
                        }
                        r.geo.attributes.position.needsUpdate = true;
                    });
                    return age < 60;
                },
                dispose: function () { ribbons.forEach(r => { ctx.root.remove(r.m); r.geo.dispose(); r.mat.dispose(); }); }
            };
        }
    });

    return { create: create, register: register, info: info, KINDS: KINDS, clearToCross: clearToCross };
})();
