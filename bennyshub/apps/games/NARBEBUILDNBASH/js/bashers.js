/**
 * NARBE Build n Bash - the destroyers.
 *
 * Each Destroy press picks one at random (a shuffled bag, never the same one
 * twice in a row) and sends it at the next CHUNK of the build. A destroyer is
 * a short, silly animation (about 2.5 to 4.5 seconds) that sweeps through the
 * chunk a few times, knocks its blocks loose, and leaves.
 *
 * Register one:
 *   BNB.Bashers.register({
 *     id: 'wreck', name: 'Wrecking Ball', say: 'Wrecking ball!',
 *     ground: false,    // true = needs a floor (left out in space)
 *     sky: false,       // true = falls from the sky (left out indoors)
 *     create: function (ctx) { ...; return { update(dt) { return stillRunning; }, dispose() {} }; }
 *   });
 *
 * ctx (built fresh for every press by js/sim.js):
 *   THREE, root (add meshes here; removed for you afterwards), rand(), calm, zeroG, water, groundY (0), plot
 *   chunk: { ids, side (-1 came from the left / 1 from the right), final,
 *            min, max, center, size (THREE.Vector3 world bounds),
 *            enter (x of the chunk's outer edge), stop (x the destroyer must not
 *            pass while blocks still stand beyond it; past the far edge when final) }
 *   rest: bounds of the blocks that stay standing (null on the final chunk)
 *   release(ids?)          loosen chunk blocks (all of them when no list is given)
 *   releaseWhere(test)     loosen chunk blocks where test(centre, id, min, max) is true
 *                          (anything resting on them comes loose too)
 *   isLoose(id), push(id, vx, vy, vz, sx, sy, sz), mass(id)
 *   pushNear(point, radius, fn(id, pos, dist, dir) -> [vx, vy, vz, sx, sy, sz] | null)
 *   eachLoose(fn(id, pos, isThisChunk)), chunkBlocks() -> [{ id, pos, loose }]
 *   mover({ type: 'sphere', r } | { type: 'box', half: [x,y,z] }, pos, quat) -> { set(pos, quat), remove() }
 *   fx: dust/smoke/sparks/fire/splash/twinkle/ring (see js/fx.js)
 *   shake(0..1, seconds), sound(name, gain), focus(point, distMul) / focus(null)
 *
 * Shared helpers (BNB.Bashers.*): ease, clamp, place(ctx) (which way is in,
 * where the floor is, how far a destroyer may go, front/back lanes), kit(ctx)
 * (toy materials and shapes, disposed together), track(keys) (keyframes),
 * tracker() (a point's velocity), knocker(ctx) (hit: loosen + shove + tip what a
 * moving thing touches; clear: plow loose blocks out of a vehicle's path),
 * blast(ctx, p) and releaseAll(ctx) (explosions, gusts), topple() (tip a standing
 * block over its bottom edge), flow(ctx) (loose block velocities, for steering),
 * sweep(ctx) (the final release, toppled), gravity/liftScale/velScale (low
 * gravity and zero-G), puffs() and fireball() (cartoon fire and smoke as meshes).
 *
 * Fast limbs and vehicles use the knocker, not ctx.mover: a kinematic collider
 * moving at 20+ units/s hands that speed to whatever it touches and launches it.
 *
 * Rules every destroyer keeps:
 *  - Every block of the chunk is loose by the end (the sim double-checks).
 *  - Blocks fly in the direction the thing hit them, a little upward, spinning.
 *  - Never travel past ctx.chunk.stop at block height unless chunk.final.
 *  - Speeds stay readable: big, clear, slightly slow motions, then a fast hit.
 *  - Sound names come from the list in js/sound.js.
 *  - Toy look: chunky rounded shapes, smooth shading, under ~3000 triangles,
 *    charming and silly, never scary. Nothing flashes the whole screen.
 */

window.BNB = window.BNB || {};

BNB.Bashers = (function () {
    'use strict';

    const TYPES = [];
    function register(def) { TYPES.push(def); }
    function get(id) { return TYPES.find(t => t.id === id) || null; }

    // --- helpers shared by destroyers ----------------------------------------------------

    const ease = {
        inOut: u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
        out: u => 1 - Math.pow(1 - u, 3),
        in: u => u * u * u,
        in2: u => u * u,
        out2: u => 1 - (1 - u) * (1 - u),
        back: u => { const c = 1.7; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },
        sine: u => 0.5 - 0.5 * Math.cos(Math.PI * u),
        linear: u => u,
        clamp: u => Math.max(0, Math.min(1, u))
    };

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    /**
     * How much a block moves when shoved: heavy blocks move less than light ones,
     * but even the biggest block still clearly goes over (a loose block that just
     * stands there reads as "nothing happened").
     */
    function heft(ctx, id) { return Math.max(0.62, Math.min(1.15, 1.25 / Math.pow(ctx.mass(id), 0.25))); }

    /** The world's gravity (ctx.gravity when the sim gives it; 0 in zero-G; 22 by default). */
    function gravity(ctx) {
        if (ctx.zeroG) return 0;
        if (typeof ctx.gravity === 'number') return ctx.gravity;
        const w = BNB.Sim && BNB.Sim.world ? BNB.Sim.world() : null;
        return w && typeof w.gravity === 'number' ? w.gravity : 22;
    }

    /** Lift is scaled so a hop reaches the same height under any gravity (and is mostly dropped in zero-G). */
    function liftScale(ctx) { return ctx.zeroG ? 0.3 : Math.sqrt(Math.max(1, gravity(ctx)) / 22); }

    /**
     * Shove speeds scale the same way, so under low gravity rubble follows the same
     * arcs and slides as far, just floatier (1 at normal gravity and in zero-G).
     */
    function velScale(ctx) { return ctx.zeroG ? 1 : clamp(Math.sqrt(Math.max(1, gravity(ctx)) / 22), 0.5, 1.2); }

    /**
     * Tip a loose, standing block over toward horizontal direction hd (unit).
     * A real tip pivots on the block's bottom edge, so besides spinning, its
     * middle must move sideways (spin x half its height) and a little up (spin x
     * half its width); spin alone just grinds a block into the floor. Blocks
     * standing higher than `baseY` (on top of what was hit) also slide off faster.
     * mn/mx: the block's world bounds as built (optional).
     */
    function topple(ctx, id, pos, hd, baseY, liftK, mn, mx) {
        const v = toppleVel(ctx, pos, hd, baseY, liftK, mn, mx);
        ctx.push(id, v[0], v[1], v[2], v[3], v[4], v[5]);
    }

    /** The velocity and spin topple() gives: [vx, vy, vz, sx, sy, sz]. */
    function toppleVel(ctx, pos, hd, baseY, liftK, mn, mx) {
        const c = ctx.chunk;
        if (!c.final && hd.x * c.side < 0.2) {
            // Tipping in would only lean it on what still stands (and it bounces back upright):
            // tip it out to the open front or back instead, a little away from the rest.
            const fz = (mn ? (mn[2] + mx[2]) / 2 : pos.z) >= c.center.z ? 1 : -1;
            hd = new ctx.THREE.Vector3(c.side * 0.4, 0, fz).normalize();
        }
        const hh = mn ? (mx[1] - mn[1]) / 2 : 0.5;
        const hw = mn ? (Math.abs(hd.x) * (mx[0] - mn[0]) + Math.abs(hd.z) * (mx[2] - mn[2])) / 2 : 0.5;
        const above = Math.max(0, (mn ? mn[1] : pos.y - hh) - baseY);
        const w = clamp(2.3 + 0.35 * hh, 2.3, 3.6) * (0.9 + ctx.rand() * 0.25);
        const vk = velScale(ctx);
        const vh = Math.min(5.5, w * hh + 0.45 * above + 0.3) * vk;
        const vu = (w * Math.min(hw, hh) * 0.55 + 0.4) * (liftK === undefined ? 1 : liftK);
        const jx = (ctx.rand() - 0.5) * 0.6, jz = (ctx.rand() - 0.5) * 0.6;
        return [hd.x * vh + jx, vu, hd.z * vh + jz, (hd.z * w + (ctx.rand() - 0.5) * 0.6) * vk, (ctx.rand() - 0.5) * 1.5, (-hd.x * w + (ctx.rand() - 0.5) * 0.6) * vk];
    }

    /**
     * Knock helper: loosen chunk blocks within `reach` of point p, and give
     * every loose block in reach (once per `cooldown` s) a shove along `dir`
     * (a THREE.Vector3, its length is the speed) plus lift and spin.
     * Shoves are capped (opts.max, default 6.5 units/s) and heavy blocks move
     * less than light ones, so a build tumbles over instead of flying away.
     * A shove only tops a block up to the wanted speed: one already flying that
     * way is left alone, so repeated hits never add up into a launch.
     * In zero-G shoves are gentler and lift is mostly dropped (nothing pulls them back).
     * Call tick(dt) every frame (it also measures how the loose blocks move).
     */
    function knocker(ctx, opts) {
        opts = opts || {};
        const T = ctx.THREE, last = new Map(), seen = new Set();
        const tmp = new T.Vector3(), cur = new T.Vector3(), hd = new T.Vector3();
        const fl = flow(ctx);
        const vk = velScale(ctx), max = (opts.max || 6.5) * (ctx.zeroG ? 0.5 : vk);
        const liftK = liftScale(ctx);
        const posOf = new Map(), frozen = new Set(), bnd = new Map();
        ctx.chunkBlocks().forEach(b => { posOf.set(b.id, b.pos); if (!b.loose) frozen.add(b.id); });
        let t = 0;
        return {
            tick: function (dt) {
                t += dt;
                fl.tick(dt);
                frozen.forEach(id => { if (ctx.isLoose(id)) frozen.delete(id); });
            },
            hit: function (p, reach, dir, lift) {
                const n = ctx.releaseWhere(function (c, id, mn, mx) {
                    if (!bnd.has(id)) bnd.set(id, [mn, mx]);
                    // Distance from p to the block's box.
                    const dx = Math.max(mn[0] - p.x, 0, p.x - mx[0]);
                    const dy = Math.max(mn[1] - p.y, 0, p.y - mx[1]);
                    const dz = Math.max(mn[2] - p.z, 0, p.z - mx[2]);
                    return Math.hypot(dx, dy, dz) < reach;
                });
                const fresh = [];
                if (n > 0) frozen.forEach(id => { if (ctx.isLoose(id)) { frozen.delete(id); fresh.push(id); } });
                const freshSet = new Set(fresh);
                hd.copy(dir).setY(0);
                if (hd.lengthSq() < 1e-4) hd.set(-ctx.chunk.side, 0, 0);
                hd.normalize();
                let shoved = 0;
                ctx.pushNear(p, reach + 0.6, function (id, pos, d, away) {
                    const prev = last.get(id);
                    if (prev !== undefined && t - prev < (opts.cooldown || 0.35)) return null;
                    const k = heft(ctx, id), first = !seen.has(id);
                    tmp.copy(dir);
                    if (tmp.length() > max) tmp.setLength(max);
                    tmp.multiplyScalar((0.75 + ctx.rand() * 0.45) * k).addScaledVector(away, (opts.spread || 1.6) * ctx.rand() * k * vk);
                    tmp.y += (lift === undefined ? 2.5 : lift) * liftK * (0.6 + ctx.rand() * 0.5) * k * (first ? 1 : 0.5);
                    // Top up only what the block lacks along the wanted direction.
                    const want = tmp.length();
                    if (want < 1e-3) return null;
                    tmp.divideScalar(want);
                    const w = fl.v(id);
                    const add = want - Math.max(0, cur.set(w[0], w[1], w[2]).dot(tmp));
                    if (add < 0.25) return null;
                    last.set(id, t);
                    seen.add(id);
                    shoved++;
                    if (freshSet.has(id)) {
                        // It was standing a moment ago: tip it over its bottom edge as well as shoving
                        // it, or a tall block hit gently just slides (or stands there).
                        last.set(id, t);
                        seen.add(id);
                        shoved++;
                        const b = bnd.get(id), tv = toppleVel(ctx, pos, hd, p.y, liftK, b && b[0], b && b[1]);
                        return [tmp.x * add * 0.6 + tv[0], tmp.y * add * 0.6 + tv[1], tmp.z * add * 0.6 + tv[2], tv[3], tv[4], tv[5]];
                    }
                    const s = (opts.spin || 8) * k * (first ? 1 : 0.35), r = () => (ctx.rand() - 0.5) * s;
                    let sx = r(), sy = r(), sz = r();
                    // First hit: also tip it over the way it is going, so even a big block topples.
                    const hl = Math.hypot(tmp.x, tmp.z);
                    if (first && hl > 0.2) {
                        const tip = (opts.tip === undefined ? 4.5 : opts.tip) * (ctx.zeroG ? 0.4 : 1);
                        sx += tmp.z / hl * tip; sz -= tmp.x / hl * tip;
                    }
                    return [tmp.x * add, tmp.y * add, tmp.z * add, sx, sy, sz];
                });
                // What came loose out of reach (a tower standing on what was hit) still topples
                // over the way the hit went: the higher up, the faster, tipping as it goes.
                if (fresh.length) {
                    fresh.forEach(id => {
                        if (last.get(id) === t || !posOf.has(id)) return;
                        last.set(id, t);
                        seen.add(id);
                        const b = bnd.get(id);
                        topple(ctx, id, posOf.get(id), hd, p.y, liftK, b && b[0], b && b[1]);
                    });
                }
                return { released: n, shoved: shoved };
            },
            /**
             * Plow: loose blocks inside the box (centre c0, half sizes hx, hy, hz) around
             * something driving or rolling through are carried forward at its speed and
             * pushed out to the side and up, so it never drives through them. Only loose
             * blocks (it releases nothing). Returns how many it moved.
             */
            clear: function (c0, hx, hy, hz, vel) {
                const sp = Math.min(9, vel.length());
                if (sp < 0.5) return 0;
                let moved = 0;
                ctx.pushNear(c0, Math.hypot(hx, hy, hz) + 0.6, function (id, pos) {
                    const dx = pos.x - c0.x, dy = pos.y - c0.y, dz = pos.z - c0.z;
                    if (Math.abs(dx) > hx + 0.35 || Math.abs(dy) > hy + 0.35 || Math.abs(dz) > hz + 0.35) return null;
                    const prev = last.get(id);
                    if (prev !== undefined && t - prev < 0.12) return null;
                    const w = fl.v(id), k = heft(ctx, id);
                    const fx = vel.x / sp, fz = vel.z / sp;
                    // Forward: keep up with the plow. Sideways: out of its path. Up: a hop.
                    const hl = Math.hypot(fx, fz) || 1, px = -fz / hl, pz = fx / hl;   // across the path
                    const side = dx * px + dz * pz >= 0 ? 1 : -1;
                    const along = w[0] * fx + w[2] * fz, across = (w[0] * px + w[2] * pz) * side;
                    const addF = Math.max(0, Math.min(sp * 1.05, 7 * vk) - along);
                    const addS = Math.max(0, (2.5 + 2 * k) * vk - across);
                    const addU = ctx.zeroG ? 0 : Math.max(0, 2.2 * liftK - w[1]);
                    if (addF + addS + addU < 0.3) return null;
                    last.set(id, t);
                    seen.add(id);
                    moved++;
                    return [fx * addF + px * side * addS, addU, fz * addF + pz * side * addS, (ctx.rand() - 0.5) * 4, (ctx.rand() - 0.5) * 4, (ctx.rand() - 0.5) * 4];
                });
                return moved;
            }
        };
    }

    /**
     * Blow loose blocks away from point p (explosions, sneezes, flings).
     * o: { radius, speed, lift, max, falloff, spin, bias: Vector3 (added to every shove),
     *      dir: Vector3 + dirSpeed (a push along an axis), chunkOnly,
     *      fresh: the Map releaseAll() returned (blocks that were standing get tipped over too) }
     */
    function blast(ctx, p, o) {
        o = o || {};
        const v = new ctx.THREE.Vector3(), hd = new ctx.THREE.Vector3(), liftK = liftScale(ctx);
        const zk = ctx.zeroG ? 0.45 : velScale(ctx);   // in space things drift off slowly, nothing brings them back
        const R = o.radius || 3, sp = (o.speed || 7) * zk, max = (o.max || 8.5) * zk;
        const lift = ctx.zeroG ? 0 : (o.lift === undefined ? 3 : o.lift) * liftScale(ctx);
        const only = o.chunkOnly ? new Set(ctx.chunk.ids) : null;
        return ctx.pushNear(p, R, function (id, pos, d, away) {
            if (only && !only.has(id)) return null;
            const k = heft(ctx, id);
            const fall = 1 - Math.min(1, d / R) * (o.falloff === undefined ? 0.55 : o.falloff);
            v.copy(away).multiplyScalar(sp * fall);
            if (o.dir) v.addScaledVector(o.dir, o.dirSpeed || 0);
            if (o.bias) v.add(o.bias);
            v.y += lift * (0.7 + ctx.rand() * 0.5);
            if (v.length() > max) v.setLength(max);
            v.multiplyScalar(k * (0.8 + ctx.rand() * 0.35));
            const b = o.fresh && o.fresh.get(id);
            if (b && !ctx.zeroG) {
                // It was standing: tip it over its bottom edge too (see topple).
                hd.set(v.x, 0, v.z);
                if (hd.lengthSq() < 1e-4) hd.set(away.x, 0, away.z);
                if (hd.lengthSq() < 1e-4) hd.set(-ctx.chunk.side, 0, 0);
                hd.normalize();
                const tv = toppleVel(ctx, pos, hd, ctx.chunk.min.y, liftK, b[0], b[1]);
                return [v.x * 0.7 + tv[0], v.y * 0.7 + tv[1], v.z * 0.7 + tv[2], tv[3], tv[4], tv[5]];
            }
            const s = (o.spin || 9) * k, r = () => (ctx.rand() - 0.5) * s;
            return [v.x, v.y, v.z, r(), r(), r()];
        });
    }

    /** Loosen every block of the chunk still standing; returns Map(id -> [min, max] bounds) of them. */
    function releaseAll(ctx) {
        const bnd = new Map();
        ctx.releaseWhere(function (cen, id, mn, mx) { bnd.set(id, [mn, mx]); return true; });
        return bnd;
    }

    /**
     * Loosen whatever of the chunk still stands (the final sweep) and topple it, so
     * nothing is left standing loose as if nothing happened. `from` is where the
     * destroyer hit (zero-G: blocks drift away from it), `dir` the way to topple
     * (default: on into the chunk when it's the last one, else forward and outward,
     * away from what still stands).
     */
    function sweep(ctx, from, dir) {
        const bnd = new Map();
        ctx.releaseWhere(function (cen, id, mn, mx) { bnd.set(id, [mn, mx]); return true; });
        const ids = Array.from(bnd.keys()).filter(id => ctx.isLoose(id));
        if (!ids.length) return 0;
        const c = ctx.chunk, d = new ctx.THREE.Vector3(), set = new Set(ids);
        if (ctx.zeroG) {
            const o = from || c.center;
            ctx.chunkBlocks().forEach(b => {
                if (!set.has(b.id)) return;
                d.copy(b.pos).sub(o);
                if (d.lengthSq() < 1e-6) d.set(ctx.rand() - 0.5, ctx.rand() - 0.5, ctx.rand() - 0.5);
                d.setLength(1 + ctx.rand() * 1.2);
                ctx.push(b.id, d.x, d.y, d.z, ctx.rand() * 2, ctx.rand() * 2, ctx.rand() * 2);
            });
            return ids.length;
        }
        if (dir) d.copy(dir).setY(0);
        else if (c.final) d.set(-c.side, 0, 0.5);
        else d.set(c.side * 0.5, 0, 1);
        d.normalize();
        const base = c.min.y, liftK = liftScale(ctx);
        ctx.chunkBlocks().forEach(b => {
            if (!set.has(b.id)) return;
            const bb = bnd.get(b.id);
            topple(ctx, b.id, b.pos, d, base, liftK, bb[0], bb[1]);
        });
        return ids.length;
    }

    /**
     * Where things are for this run: which way is in, the floor (y = 0, or the
     * chunk's bottom in zero-G), and how far a destroyer may go.
     *   out(d)        x at distance d outside the chunk's outer edge
     *   depth(x)      how far x lies past the outer edge, going in
     *   clampIn(x, h) keep a thing of half-width h centred at x short of chunk.stop
     *   off           a distance from the outer edge that is safely off screen
     */
    function place(ctx) {
        const c = ctx.chunk, side = c.side;
        const floor = ctx.zeroG ? c.min.y : ctx.groundY;
        return {
            side: side, inward: -side, floor: floor,
            far: side < 0 ? c.max.x : c.min.x,
            h: Math.max(0.6, c.max.y - floor),
            off: 3 + (ctx.plot || 3) * 1.5,
            out: function (d) { return c.enter + side * d; },
            depth: function (x) { return (x - c.enter) * -side; },
            clampIn: function (x, half) {
                if (c.final) return x;
                const lim = c.stop + side * (half || 0);
                return side < 0 ? Math.min(x, lim) : Math.max(x, lim);
            },
            /**
             * Two lanes (front z, back z) for something `half` wide passing through a deep
             * chunk twice, so it hits the front and the back (a castle's corner towers);
             * both are the middle when the chunk is shallow.
             */
            lanes: function (half) {
                const off = clamp(c.size.z / 2 - half * 0.7, 0, 1.8);
                return off < 0.35 ? [c.center.z, c.center.z] : [c.center.z + off, c.center.z - off];
            }
        };
    }

    /** A rounded box (bevelled on every edge), w x h x d, centred. */
    function roundBox(T, w, h, d, r) {
        r = Math.max(0.005, Math.min(r, w / 2 - 0.004, h / 2 - 0.004, d / 2 - 0.004));
        const iw = w - 2 * r, ih = h - 2 * r, rc = Math.max(0.002, Math.min(r * 0.35, iw / 2 - 0.001, ih / 2 - 0.001));
        const x0 = -iw / 2, x1 = iw / 2, y0 = -ih / 2, y1 = ih / 2;
        const s = new T.Shape();
        s.moveTo(x0 + rc, y0);
        s.lineTo(x1 - rc, y0); s.absarc(x1 - rc, y0 + rc, rc, -Math.PI / 2, 0, false);
        s.lineTo(x1, y1 - rc); s.absarc(x1 - rc, y1 - rc, rc, 0, Math.PI / 2, false);
        s.lineTo(x0 + rc, y1); s.absarc(x0 + rc, y1 - rc, rc, Math.PI / 2, Math.PI, false);
        s.lineTo(x0, y0 + rc); s.absarc(x0 + rc, y0 + rc, rc, Math.PI, Math.PI * 1.5, false);
        const g = new T.ExtrudeGeometry(s, { depth: Math.max(0.002, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 3 });
        g.translate(0, 0, -Math.max(0.002, d - 2 * r) / 2);
        g.computeVertexNormals();
        return g;
    }

    /**
     * A model kit: toy-paint materials and shapes that are all disposed together.
     *   K.mat(color, { rough, metal, flat, glow, glowI, opacity, double, vc })   lit paint
     *   K.basic(color, { opacity, double, add })                                 unlit (glow, mist)
     *   K.sphere/cyl/capsule/cone/box/rbox(...) geometry; K.add(parent, geo, mat, x, y, z, { s, r, shadow })
     */
    function kit(ctx) {
        const T = ctx.THREE, geos = [], mats = [];
        function prep(m, o) {
            if (o.opacity !== undefined) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
            if (o.double) m.side = T.DoubleSide;
            if (o.vc) m.vertexColors = true;
            if (o.add) { m.blending = T.AdditiveBlending; m.transparent = true; m.depthWrite = false; }
            mats.push(m);
            return m;
        }
        const K = {
            mat: function (color, o) {
                o = o || {};
                const m = new T.MeshStandardMaterial({ color: color, roughness: o.rough === undefined ? 0.55 : o.rough, metalness: o.metal || 0, flatShading: !!o.flat });
                if (o.glow) { m.emissive = new T.Color(o.glow); m.emissiveIntensity = o.glowI === undefined ? 1 : o.glowI; }
                return prep(m, o);
            },
            basic: function (color, o) { o = o || {}; return prep(new T.MeshBasicMaterial({ color: color }), o); },
            geo: function (g) { geos.push(g); return g; },
            sphere: function (r, w, h) { return K.geo(new T.SphereGeometry(r, w || 16, h || 12)); },
            cyl: function (rt, rb, h, seg, open) { return K.geo(new T.CylinderGeometry(rt, rb, h, seg || 14, 1, !!open)); },
            capsule: function (r, len, seg, cap) { return K.geo(new T.CapsuleGeometry(r, len, cap || 3, seg || 10)); },
            cone: function (r, h, seg) { return K.geo(new T.ConeGeometry(r, h, seg || 10)); },
            box: function (w, h, d) { return K.geo(new T.BoxGeometry(w, h, d)); },
            rbox: function (w, h, d, r) { return K.geo(roundBox(T, w, h, d, r)); },
            group: function (parent, x, y, z) { const g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; },
            add: function (parent, geo, mat, x, y, z, o) {
                const m = new T.Mesh(geo, mat);
                m.position.set(x || 0, y || 0, z || 0);
                if (o && o.s !== undefined) { if (typeof o.s === 'number') m.scale.setScalar(o.s); else m.scale.set(o.s[0], o.s[1], o.s[2]); }
                if (o && o.r) m.rotation.set(o.r[0] || 0, o.r[1] || 0, o.r[2] || 0);
                m.castShadow = !(o && o.shadow === false) && !mat.transparent;
                parent.add(m);
                return m;
            },
            dispose: function () {
                geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose());
                geos.length = 0; mats.length = 0;
            }
        };
        return K;
    }

    /**
     * Keyframes: track([[t, [a, b, ...], ease?], ...]) returns fn(t) -> the values
     * at time t, easing INTO each key with that key's ease (default inOut).
     * The returned array is reused: read it straight away.
     */
    function track(keys) {
        const out = keys[0][1].slice();
        return function (t) {
            let i = 1;
            while (i < keys.length - 1 && t > keys[i][0]) i++;
            const a = keys[i - 1], b = keys[i];
            const u = clamp((t - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
            const e = (typeof b[2] === 'function' ? b[2] : ease[b[2] || 'inOut'])(u);
            for (let k = 0; k < out.length; k++) out[k] = a[1][k] + (b[1][k] - a[1][k]) * e;
            return out;
        };
    }

    /** Follows a moving point and knows its velocity. */
    function tracker(T) {
        const prev = new T.Vector3();
        let has = false;
        const o = {
            pos: new T.Vector3(), vel: new T.Vector3(),
            set: function (p, dt) {
                o.pos.copy(p);
                if (has && dt > 0) o.vel.copy(p).sub(prev).divideScalar(dt);
                prev.copy(p);
                has = true;
                return o;
            }
        };
        return o;
    }

    /**
     * Loose block velocities, measured from their movement, so a destroyer can
     * steer blocks toward a target velocity (a vortex, a gust) without overshooting.
     */
    function flow(ctx) {
        const prev = new Map(), vel = new Map();
        return {
            tick: function (dt) {
                if (dt <= 0) return;
                ctx.eachLoose(function (id, p) {
                    const q = prev.get(id);
                    if (q) vel.set(id, [(p.x - q[0]) / dt, (p.y - q[1]) / dt, (p.z - q[2]) / dt]);
                    prev.set(id, [p.x, p.y, p.z]);
                });
            },
            v: function (id) { return vel.get(id) || [0, 0, 0]; }
        };
    }

    /**
     * Cartoon puffs made of meshes (fireballs, smoke balls, sneeze mist), pooled.
     * spawn({ p, v, r0, r1, life, c0, c1, a, rise, drag, delay, sy })
     */
    function puffs(ctx, K, n, lit) {
        const T = ctx.THREE;
        const geo = K.geo(new T.SphereGeometry(1, 14, 10));
        const list = [];
        for (let i = 0; i < n; i++) {
            const m = lit ? K.mat('#ffffff', { opacity: 0, rough: 1 }) : K.basic('#ffffff', { opacity: 0 });
            const mesh = new T.Mesh(geo, m);
            mesh.visible = false;
            mesh.renderOrder = 4;
            ctx.root.add(mesh);
            list.push({ mesh: mesh, mat: m, on: false, age: 0, life: 1, p: new T.Vector3(), v: new T.Vector3(), c0: new T.Color(), c1: new T.Color() });
        }
        function draw(s) {
            if (s.age < 0) { s.mesh.visible = false; return; }
            const u = Math.min(1, s.age / s.life);
            const r = s.r0 + (s.r1 - s.r0) * ease.out(u);
            s.mesh.visible = true;
            s.mesh.position.copy(s.p);
            s.mesh.scale.set(r, r * s.sy, r);
            s.mat.color.copy(s.c0).lerp(s.c1, u);
            s.mat.opacity = s.a * (u < 0.08 ? u / 0.08 : Math.pow(1 - (u - 0.08) / 0.92, 1.4));
        }
        return {
            spawn: function (o) {
                let s = null;
                for (let i = 0; i < list.length; i++) if (!list[i].on) { s = list[i]; break; }
                if (!s) s = list.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
                s.on = true; s.age = -(o.delay || 0); s.life = o.life || 0.6;
                s.p.copy(o.p); if (o.v) s.v.copy(o.v); else s.v.set(0, 0, 0);
                s.r0 = o.r0 || 0.3; s.r1 = o.r1 || 1; s.a = o.a === undefined ? 0.9 : o.a;
                s.rise = o.rise || 0; s.drag = o.drag === undefined ? 2 : o.drag; s.sy = o.sy || 1;
                s.c0.set(o.c0 || '#ffffff'); s.c1.set(o.c1 || o.c0 || '#ffffff');
                draw(s);
            },
            update: function (dt) {
                list.forEach(s => {
                    if (!s.on) return;
                    s.age += dt;
                    if (s.age >= 0) {
                        s.p.addScaledVector(s.v, dt);
                        s.v.multiplyScalar(Math.exp(-s.drag * dt));
                        s.v.y += s.rise * dt;
                    }
                    if (s.age >= s.life) { s.on = false; s.mesh.visible = false; return; }
                    draw(s);
                });
            }
        };
    }

    /** A cartoon explosion at p: fire puffs, smoke puffs, particles, a ground ring. */
    function fireball(ctx, fire, smoke, p, size, o) {
        o = o || {};
        const T = ctx.THREE, r = ctx.rand, q = new T.Vector3(), v = new T.Vector3();
        const zg = ctx.zeroG;
        fire.spawn({ p: p, r0: 0.3 * size, r1: 0.95 * size, life: 0.3, c0: '#fff6cf', c1: '#ffb238', a: 1 });
        for (let i = 0; i < (o.lobes || 4); i++) {
            v.set(r() - 0.5, zg ? r() - 0.5 : 0.15 + r() * 0.7, r() - 0.5).normalize();
            q.copy(p).addScaledVector(v, 0.42 * size);
            fire.spawn({ p: q, v: v.clone().multiplyScalar(2.0 * size), r0: 0.25 * size, r1: 0.7 * size, life: 0.4 + r() * 0.15, c0: '#ffd166', c1: '#e8461f', a: 0.95, drag: 4 });
        }
        if (smoke) {
            for (let i = 0; i < (o.smoke || 4); i++) {
                v.set(r() - 0.5, zg ? r() - 0.5 : 0.55 + r() * 0.6, r() - 0.5);
                q.copy(p).addScaledVector(v, 0.5 * size);
                smoke.spawn({ p: q, v: v.clone().multiplyScalar(0.9 * size), r0: 0.3 * size, r1: 0.7 * size, life: 0.95 + r() * 0.4,
                    c0: '#6f6862', c1: '#d3cec7', a: 0.6, rise: zg ? 0 : 0.7, drag: 2.2, delay: 0.1 + r() * 0.08 });
            }
        }
        const k = o.particles || 26;
        ctx.fx.fire(p.x, p.y, p.z, 0.4 * size, k);
        ctx.fx.smoke(p.x, p.y, p.z, Math.round(k * 0.45), 0.9 * size);
        if (zg) ctx.fx.twinkle(p.x, p.y, p.z, Math.round(k * 0.6), '#ffd27a');
        else ctx.fx.sparks(p.x, p.y, p.z, Math.round(k * 0.7), 7 * size);
        if (!zg && o.ring !== false) ctx.fx.ring(p.x, ctx.groundY, p.z, 2.1 * size, '#fff1d0', 0.5);
    }

    /** A plain timeline: steps = [{ at: seconds, fn }]; returns run(t) that fires each once. */
    function cues(steps) {
        const done = new Set();
        return function (t) {
            steps.forEach((s, i) => { if (!done.has(i) && t >= s.at) { done.add(i); s.fn(); } });
        };
    }

    /** Dispose every geometry and material under an object (the sim also clears root). */
    function disposeTree(obj) {
        obj.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        });
        if (obj.parent) obj.parent.remove(obj);
    }

    return {
        TYPES: TYPES, register: register, get: get, ease: ease, clamp: clamp, heft: heft,
        gravity: gravity, liftScale: liftScale, velScale: velScale, topple: topple, toppleVel: toppleVel, releaseAll: releaseAll,
        knocker: knocker, blast: blast, sweep: sweep, place: place, kit: kit, roundBox: roundBox,
        track: track, tracker: tracker, flow: flow, puffs: puffs, fireball: fireball,
        cues: cues, disposeTree: disposeTree
    };
})();

// =====================================================================================
// Wrecking Ball - swings in from the side on a long chain, a few times.
// =====================================================================================
BNB.Bashers.register({
    id: 'wreck', name: 'Wrecking Ball', say: 'Wrecking ball!', ground: false,
    create: function (ctx) {
        const T = ctx.THREE, c = ctx.chunk, side = c.side, E = BNB.Bashers.ease;
        const R = Math.max(0.6, Math.min(1.25, 0.5 + c.size.y * 0.09));
        const hitY = ctx.zeroG ? c.center.y : Math.max(R + 0.05, c.min.y + Math.min(c.size.y * 0.42, 2.6));
        const L = 6.5;
        // Final chunk: swing right through. Otherwise bounce off the part still standing.
        const pivotX = c.final ? c.center.x : c.stop + side * R * 0.9;
        const pivot = new T.Vector3(pivotX, hitY + L, c.center.z);
        const omega = 1.75;   // with the 0.9 rad haul-back: about 10 units/s at the bottom

        // Model: iron ball with a ring on top, a hook, and a chain of links up to the crane.
        const rig = new T.Group();
        ctx.root.add(rig);
        const iron = new T.MeshStandardMaterial({ color: '#2f3338', metalness: 0.75, roughness: 0.35 });
        const ball = new T.Mesh(new T.SphereGeometry(R, 24, 16), iron);
        ball.castShadow = true;
        const ringM = new T.Mesh(new T.TorusGeometry(R * 0.28, R * 0.07, 8, 20), iron);
        ringM.position.y = R * 1.08;
        const holder = new T.Group();
        holder.add(ball, ringM);
        rig.add(holder);
        const linkGeo = new T.TorusGeometry(0.14, 0.04, 4, 8);
        const linkMat = new T.MeshStandardMaterial({ color: '#8a9099', metalness: 0.7, roughness: 0.4 });
        const links = [];
        const nLinks = 26;
        for (let i = 0; i < nLinks; i++) {
            const l = new T.Mesh(linkGeo, linkMat);
            l.castShadow = i > nLinks - 10;
            rig.add(l);
            links.push(l);
        }
        const mover = ctx.mover({ type: 'sphere', r: R }, pivot.clone().setY(hitY), null);
        const knock = BNB.Bashers.knocker(ctx, { spin: 9, spread: 2.5 });

        // Angle over time: haul back, swing in, bounce (or pass through), and away.
        const start = side * 0.9;
        let t = 0, prevTheta = start, hits = 0, lastHitAt = -1, swingingIn = false, releasedAll = false;
        const lift = { y: 0 };
        function theta(time) {
            if (c.final) {
                // A damped pendulum: through, back, through again.
                return start * Math.cos(omega * time) * Math.exp(-0.2 * time);
            }
            // Bouncing off what still stands: |cos| keeps the ball on its own side.
            const amp = start * Math.exp(-0.32 * time);
            return amp * Math.abs(Math.cos(omega * time));
        }
        const duration = c.final ? 4.6 : 4.2;
        const pos = new T.Vector3(), prev = new T.Vector3(), vel = new T.Vector3();

        ctx.sound('creak', 0.7);
        ctx.focus(new T.Vector3((c.center.x + pivot.x) / 2, hitY, c.center.z), 1.12);
        prev.set(pivot.x + Math.sin(start) * L, pivot.y - Math.cos(start) * L, pivot.z);

        return {
            update: function (dt) {
                t += dt;
                knock.tick(dt);
                // In for the first 0.5 s from off screen: the ball drops in on its chain.
                const intro = E.out(E.clamp(t / 0.5));
                const outro = E.in(E.clamp((t - (duration - 0.7)) / 0.7));
                const th = theta(Math.max(0, t - 0.25));
                lift.y = (1 - intro) * 7 + outro * 9;
                pos.set(pivot.x + Math.sin(th) * L, pivot.y - Math.cos(th) * L + lift.y, pivot.z);
                vel.copy(pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
                prev.copy(pos);
                holder.position.copy(pos);
                holder.rotation.z = th;
                mover.set(pos, null);
                // The chain, from the crane down to the ball.
                for (let i = 0; i < nLinks; i++) {
                    const u = (i + 0.5) / nLinks;
                    links[i].position.set(pivot.x + Math.sin(th) * L * u, pivot.y + lift.y - Math.cos(th) * L * u, pivot.z);
                    links[i].rotation.set(i % 2 ? Math.PI / 2 : 0, 0, th);
                }
                // A whoosh as each swing heads in toward the build.
                const inward = (th - prevTheta) * side < 0;
                if (inward && !swingingIn && Math.abs(th) > 0.45) ctx.sound('whoosh', 0.45);
                swingingIn = inward;
                prevTheta = th;
                const speed = vel.length();
                if (speed > 2 && t > 0.3 && outro === 0) {
                    const r = knock.hit(pos, R + 0.15, vel.clone().multiplyScalar(0.85), 3.5);
                    if (r.released + r.shoved > 0 && t - lastHitAt > 0.5) {
                        lastHitAt = t;
                        hits++;
                        ctx.sound(hits === 1 ? 'clang' : 'thud', hits === 1 ? 1 : 0.7);
                        if (hits === 1) ctx.sound('whoosh-big', 0.5);
                        ctx.shake(hits === 1 ? 0.7 : 0.4, 0.35);
                        ctx.fx.dust(pos.x, Math.max(0.05, pos.y - R), pos.z, 10, 0.8);
                    }
                }
                if (t > duration - 0.7 && !releasedAll) { releasedAll = true; BNB.Bashers.sweep(ctx); }
                return t < duration;
            },
            dispose: function () {
                mover.remove();
                linkGeo.dispose(); linkMat.dispose(); iron.dispose();
                ball.geometry.dispose(); ringM.geometry.dispose();
                if (rig.parent) rig.parent.remove(rig);
            }
        };
    }
});

// =====================================================================================
// Kid's Arm - a giant striped sleeve reaches down from the side and swipes the chunk
// away like toys off a table: in low, back out high, then in again along the floor.
// =====================================================================================
BNB.Bashers.register({
    id: 'arm', name: "Kid's Arm", say: 'Swipe!', ground: false,
    create: function (ctx) {
        const B = BNB.Bashers, T = ctx.THREE, c = ctx.chunk, P = B.place(ctx), K = B.kit(ctx);
        const hs = B.clamp(0.82 + P.h * 0.07, 0.95, 1.3);   // hand size
        const cz = c.center.z;
        const yLow = P.floor + B.clamp(P.h * 0.3, 0.55 * hs, 1.05 * hs);
        const yHigh = P.floor + Math.max(P.h * 0.62, yLow - P.floor + 0.9);
        const yLast = P.floor + 0.5 * hs;
        const xOut = P.out(0.95 * hs + 0.35);
        const xIn = P.clampIn(P.far + P.inward * 0.45 * hs, 1.0 * hs);
        // The shoulder is up and behind, off screen: the arm reaches down into the scene.
        const shoulder = new T.Vector3(P.out(4.5 + P.h * 0.3), P.floor + P.h + 7, cz - 4.2);
        const lane = P.lanes(0.9 * hs), za = lane[0], zb = lane[1];   // front, back (deep chunks)
        const path = B.track([
            [0.00, [P.out(4.2), yHigh + 5, cz - 1.6]],
            [0.50, [xOut + P.side * 0.2, yLow + 0.55, za + 0.2], 'out'],
            [0.74, [xOut + P.side * 0.75, yLow + 0.35, za + 0.3]],          // wind up
            [1.10, [xIn, yLow, za - 0.3]],                                   // swipe 1: in, low, front
            [1.30, [xIn + P.side * 0.3, yHigh + 0.4, zb - 0.1], 'out'],
            [1.66, [xOut + P.side * 0.25, yHigh, zb + 0.3]],                 // swipe 2: back out, high, back
            [1.88, [xOut + P.side * 0.75, yLast + 0.45, cz + 0.3]],
            [2.24, [xIn, yLast, cz - 0.2]],                                  // swipe 3: along the floor
            [2.50, [xIn + P.side * 0.5, yLast + 0.8, cz], 'out'],
            [3.20, [P.out(5), yHigh + 6, cz - 1.6], 'in']
        ]);
        const swipeAt = [0.76, 1.32, 1.9];
        const duration = 3.2;

        // Model, built along +x (fingers) with the palm facing +z and the thumb up (+y).
        const rig = K.group(ctx.root);
        const skin = K.mat('#f3c19b', { rough: 0.62 });
        K.add(rig, K.sphere(1, 20, 14), skin, 0.12 * hs, 0, 0, { s: [0.92 * hs, 0.64 * hs, 0.33 * hs] });            // mitten: fingers in one
        K.add(rig, K.sphere(1, 14, 10), skin, -0.42 * hs, -0.04 * hs, 0, { s: [0.55 * hs, 0.56 * hs, 0.37 * hs] });   // palm heel
        K.add(rig, K.capsule(0.19 * hs, 0.36 * hs, 10, 3), skin, -0.22 * hs, 0.58 * hs, 0.05 * hs, { r: [0, 0, -0.7] }); // thumb
        K.add(rig, K.cyl(0.33 * hs, 0.3 * hs, 0.5 * hs, 14), skin, -0.98 * hs, 0, 0, { r: [0, 0, Math.PI / 2] });       // wrist
        const red = K.mat('#e2453c', { rough: 0.85 }), cream = K.mat('#f7f0e1', { rough: 0.85 }), cuffM = K.mat('#2f6fd0', { rough: 0.8 });
        K.add(rig, K.cyl(0.5 * hs, 0.5 * hs, 0.34 * hs, 18), cuffM, -1.3 * hs, 0, 0, { r: [0, 0, Math.PI / 2] });
        const rad = d => (0.46 + Math.min(d, 6) * 0.035) * hs;
        const seg = 0.46 * hs;
        let d = 0;
        for (let i = 0; i < 14; i++) {
            K.add(rig, K.cyl(rad(d + seg), rad(d), seg + 0.01, 16, true), i % 2 ? cream : red, -1.46 * hs - d - seg / 2, 0, 0, { r: [0, 0, Math.PI / 2] });
            d += seg;
        }
        K.add(rig, K.cyl(rad(d + 14), rad(d), 14, 16, true), red, -1.46 * hs - d - 7, 0, 0, { r: [0, 0, Math.PI / 2] });

        const hand = new T.Vector3(), f = new T.Vector3(), n = new T.Vector3(), yv = new T.Vector3(), m4 = new T.Matrix4();
        const face = new T.Vector3(P.inward * 0.5, 0.1, 0.85).normalize();
        function orient() {
            // Fingers point away from the shoulder; the flat of the hand is turned mostly to the
            // camera so it reads as a hand (a mitten seen edge-on is just a sausage); thumb up.
            f.copy(hand).sub(shoulder).normalize();
            n.copy(face).addScaledVector(f, -f.dot(face)).normalize();
            yv.crossVectors(n, f);
            if (yv.y < 0) { n.negate(); yv.negate(); }
            m4.makeBasis(f, yv, n);
            rig.quaternion.setFromRotationMatrix(m4);
            rig.position.copy(hand);
        }

        const knock = B.knocker(ctx, { spin: 9, spread: 1.4, cooldown: 0.3, max: 8 });
        const v0 = path(0);
        hand.set(v0[0], v0[1], v0[2]);
        orient();
        // No physics collider: the hand moves far too fast for one (it would launch blocks);
        // the knocker does the contact, capped.
        const hp = B.tracker(T), wp = B.tracker(T), wrist = new T.Vector3(), push = new T.Vector3();
        let t = 0, si = 0, lastHit = -1, firstHit = true, swept = false;
        ctx.focus(new T.Vector3(c.center.x + P.side * 0.8, P.floor + P.h * 0.45, cz), 1.12);

        return {
            update: function (dt) {
                t += dt;
                knock.tick(dt);
                const v = path(t);
                hand.set(v[0], v[1], v[2]);
                orient();
                wrist.copy(hand).addScaledVector(f, -1.0 * hs);
                hp.set(hand, dt);
                wp.set(wrist, dt);
                if (si < swipeAt.length && t >= swipeAt[si]) { ctx.sound('swish', 0.75); si++; }
                if (t > 0.55 && t < 2.6 && hp.vel.length() > 2) {
                    push.copy(hp.vel).multiplyScalar(0.8);
                    const r = knock.hit(hand, 0.72 * hs, push, 3);
                    knock.hit(wrist, 0.45 * hs, push, 2.5);
                    if (r.released + r.shoved > 0 && t - lastHit > 0.4) {
                        lastHit = t;
                        ctx.sound(firstHit ? 'crunch' : 'thud', firstHit ? 0.9 : 0.6);
                        ctx.shake(firstHit ? 0.45 : 0.25, 0.25);
                        firstHit = false;
                        if (ctx.zeroG) ctx.fx.twinkle(hand.x, hand.y, hand.z, 8);
                        else ctx.fx.dust(hand.x, Math.max(P.floor, hand.y - 0.5 * hs), hand.z, 8, 0.6);
                    }
                }
                if (t > 2.55 && !swept) { swept = true; B.sweep(ctx); }
                return t < duration;
            },
            dispose: function () { K.dispose(); if (rig.parent) rig.parent.remove(rig); }
        };
    }
});

// =====================================================================================
// Giant Leg - a huge leg in a striped sock and a chunky sneaker comes down beside the
// chunk, winds up, kicks through it low and then mid, and plants its foot with a stomp.
// =====================================================================================
BNB.Bashers.register({
    id: 'leg', name: 'Giant Leg', say: 'Big kick!', ground: false,
    create: function (ctx) {
        const B = BNB.Bashers, T = ctx.THREE, c = ctx.chunk, P = B.place(ctx), K = B.kit(ctx);
        const s = B.clamp(0.85 + P.h * 0.06, 0.95, 1.4);
        const Lt = 3.9 * s, Ls = 3.2 * s, ankleH = 0.62 * s, toe = 1.4 * s;
        const hipX = P.out(0.75 * s + 0.2);
        const cz = c.center.z;
        // How far in the toes may reach: through the chunk when it's the last, else up to chunk.stop.
        const avail = c.final ? P.depth(P.far) - P.depth(hipX) + 0.8 : P.depth(c.stop) - P.depth(hipX) - 0.15;
        const reach = Math.max(0.3, avail - toe);
        const th = a => Math.asin(B.clamp(a / (Lt + Ls), -0.3, 0.75));
        const th1 = th(reach), th2 = th(reach * 0.92), thP = th(Math.min(reach * 0.5, 1.3 * s));
        const yLow = P.floor + ankleH + 0.1, yMid = P.floor + Math.max(ankleH + 0.9, P.h * 0.45);
        const ground = P.floor + ankleH;
        // Pose channels: [hip swing (+ = in), knee bend, toes up, ankle height, z (lane)].
        const lane = P.lanes(0.55 * s), za = lane[0], zb = lane[1];
        const pose = B.track([
            [0.00, [-0.05, 0.35, -0.2, yLow + 8, za]],
            [0.50, [-0.05, 0.3, -0.15, yLow + 0.9, za], 'out'],
            [0.88, [-0.3, 0.95, -0.4, yLow + 1.0, za]],          // wind up
            [1.14, [th1, 0.06, 0.1, yLow, za]],                  // kick 1: low, front
            [1.52, [-0.28, 0.9, -0.35, yMid + 0.2, zb]],         // swing back (and over)
            [1.78, [th2, 0.05, 0.15, yMid, zb]],                 // kick 2: mid, back
            [2.12, [thP, 0.5, 0.0, ground + 1.5, cz], 'out'],    // lift...
            [2.32, [thP, 0.12, 0.0, ground, cz], 'in'],          // ...STOMP
            [2.72, [thP, 0.12, 0.0, ground, cz]],
            [3.45, [thP - 0.1, 0.35, -0.2, ground + 9, cz], 'in']
        ]);
        const kicks = [0.9, 1.54], stompAt = 2.32, duration = 3.45;

        // Model: hip -> knee -> ankle joints, each segment hanging down (-y).
        const skin = K.mat('#f1bf98', { rough: 0.6 });
        const rig = K.group(ctx.root);
        const kneeG = K.group(rig, 0, -Lt, 0);
        const ankleG = K.group(kneeG, 0, -Ls, 0);
        const footG = K.group(ankleG);
        footG.rotation.y = P.inward > 0 ? 0 : Math.PI;   // toes point in
        K.add(rig, K.cyl(0.66 * s, 0.52 * s, Lt, 18), skin, 0, -Lt / 2, 0);                       // thigh
        K.add(rig, K.cyl(0.9 * s, 0.86 * s, 3.6 * s, 18), K.mat('#3f6fb5', { rough: 0.85 }), 0, -0.2 * s, 0);   // shorts
        K.add(rig, K.cyl(0.92 * s, 0.92 * s, 0.24 * s, 18), K.mat('#2f5592', { rough: 0.85 }), 0, -2.0 * s, 0);  // hem
        K.add(kneeG, K.sphere(0.54 * s, 16, 12), skin, 0, 0, 0);                                    // knee
        K.add(kneeG, K.cyl(0.5 * s, 0.42 * s, Ls - 1.4 * s, 16), skin, 0, -(Ls - 1.4 * s) / 2, 0);   // shin
        const sock = K.mat('#f8f6f0', { rough: 0.9 });
        K.add(kneeG, K.cyl(0.45 * s, 0.44 * s, 1.55 * s, 16), sock, 0, -Ls + 0.78 * s, 0);
        K.add(kneeG, K.cyl(0.465 * s, 0.465 * s, 0.13 * s, 16), K.mat('#2f6fd0', { rough: 0.9 }), 0, -Ls + 1.38 * s, 0);
        K.add(kneeG, K.cyl(0.462 * s, 0.462 * s, 0.13 * s, 16), K.mat('#e2453c', { rough: 0.9 }), 0, -Ls + 1.16 * s, 0);
        // The sneaker, toes along +x, ankle at the origin, sole underneath.
        const white = K.mat('#fbfaf6', { rough: 0.7 }), shoe = K.mat('#e2453c', { rough: 0.5 }), stripe = K.mat('#f6c833', { rough: 0.5 });
        K.add(footG, K.rbox(2.05 * s, 0.3 * s, 1.02 * s, 0.13 * s), white, 0.38 * s, -ankleH + 0.15 * s, 0);
        K.add(footG, K.sphere(1, 20, 14), shoe, 0.32 * s, -ankleH + 0.36 * s, 0, { s: [0.98 * s, 0.52 * s, 0.5 * s] });
        K.add(footG, K.sphere(1, 14, 10), white, 0.95 * s, -ankleH + 0.3 * s, 0, { s: [0.5 * s, 0.3 * s, 0.5 * s] });
        K.add(footG, K.sphere(1, 16, 8), stripe, 0.22 * s, -ankleH + 0.44 * s, 0, { s: [0.62 * s, 0.1 * s, 0.53 * s], r: [0, 0, -0.18] });
        K.add(footG, K.cyl(0.5 * s, 0.48 * s, 0.36 * s, 16), K.mat('#c23a33', { rough: 0.6 }), -0.05 * s, -0.04 * s, 0);   // collar
        K.add(footG, K.box(0.14 * s, 0.32 * s, 0.3 * s), stripe, -0.6 * s, -0.12 * s, 0);                                  // heel tab
        [[0.42, 0.25], [0.62, 0.23], [0.82, 0.18]].forEach(l => {
            K.add(footG, K.box(0.09 * s, 0.06 * s, 0.46 * s), white, l[0] * s, -ankleH + 0.36 * s + l[1] * s + 0.02 * s, 0, { r: [0, 0, -0.2] });
        });
        const footC = new T.Vector3(0.4 * s, -ankleH * 0.55, 0), toeC = new T.Vector3(1.2 * s, -ankleH * 0.5, 0);

        function apply(v) {
            const a = v[0], k = v[1];
            rig.position.set(hipX, v[3] + Lt * Math.cos(a) + Ls * Math.cos(a - k), v[4]);
            rig.rotation.z = a * P.inward;
            kneeG.rotation.z = -k * P.inward;
            ankleG.rotation.z = v[2] * P.inward;
            rig.updateMatrixWorld(true);
        }
        apply(pose(0));

        const knock = B.knocker(ctx, { spin: 9, spread: 1.8 });
        const fw = new T.Vector3(), tw = new T.Vector3(), aw = new T.Vector3(), kw = new T.Vector3(), sw = new T.Vector3(), push = new T.Vector3();
        const ft = B.tracker(T), tt = B.tracker(T), at = B.tracker(T);
        const shin = [0.3, 0.55, 0.8].map(() => B.tracker(T));
        let t = 0, ki = 0, lastHit = -1, stomped = false, swept = false, hits = 0;
        ctx.focus(new T.Vector3(c.enter + P.side * 1.2, P.floor + P.h * 0.4, cz), 1.18);

        return {
            update: function (dt) {
                t += dt;
                knock.tick(dt);
                apply(pose(t));
                footG.localToWorld(fw.copy(footC));
                footG.localToWorld(tw.copy(toeC));
                ankleG.getWorldPosition(aw);
                ft.set(fw, dt); tt.set(tw, dt); at.set(aw, dt);
                kneeG.getWorldPosition(kw);
                shin.forEach((st, i) => st.set(sw.copy(kw).lerp(aw, [0.3, 0.55, 0.8][i]), dt));
                if (ki < kicks.length && t >= kicks[ki]) { ctx.sound('whoosh-big', 0.6); ki++; }
                if (t > 0.88 && t < 2.45 && ft.vel.length() > 2.5) {
                    push.copy(ft.vel).multiplyScalar(0.8);
                    const r = knock.hit(fw, 0.62 * s, push, 3);
                    const r2 = knock.hit(tw, 0.45 * s, push, 3);
                    knock.hit(aw, 0.5 * s, push, 2.5);
                    // The shin sweeps through too (it comes down at a slant from high up).
                    shin.forEach(st => { if (st.vel.length() > 2) knock.hit(st.pos, 0.5 * s, push.copy(st.vel).multiplyScalar(0.8), 2.5); });
                    if (r.released + r.shoved + r2.released + r2.shoved > 0 && t - lastHit > 0.45) {
                        lastHit = t;
                        hits++;
                        ctx.sound(hits === 1 ? 'crunch' : 'thud', hits === 1 ? 1 : 0.7);
                        ctx.shake(hits === 1 ? 0.55 : 0.35, 0.3);
                        if (!ctx.zeroG) ctx.fx.dust(fw.x, Math.max(P.floor, fw.y - 0.3 * s), fw.z, 10, 0.7);
                    }
                }
                if (t >= stompAt && !stomped) {
                    stomped = true;
                    ctx.sound(ctx.zeroG ? 'thud' : 'stomp', 1);
                    ctx.shake(0.75, 0.4);
                    if (ctx.zeroG) ctx.fx.twinkle(fw.x, fw.y, fw.z, 14);
                    else {
                        ctx.fx.ring(fw.x, P.floor, fw.z, 3.2 * s, '#fff3d6', 0.6);
                        ctx.fx.dust(fw.x, P.floor, fw.z, 18, 1.0);
                    }
                    // The rubble nearby jumps.
                    ctx.pushNear(fw, 2.6 * s, function (id, pos, dist, away) {
                        const k = 1 - dist / (2.6 * s);
                        return [away.x * 1.5 * k, ctx.zeroG ? away.y * 1.5 * k : 3.5 * k * B.liftScale(ctx), away.z * 1.5 * k, (ctx.rand() - 0.5) * 4, (ctx.rand() - 0.5) * 4, (ctx.rand() - 0.5) * 4];
                    });
                    swept = true;
                    B.sweep(ctx);
                }
                if (t > 2.5 && !swept) { swept = true; B.sweep(ctx); }
                return t < duration;
            },
            dispose: function () { K.dispose(); if (rig.parent) rig.parent.remove(rig); }
        };
    }
});

// =====================================================================================
// Explosion - a round cartoon bomb drops in and bounces, its fuse fizzing; it wobbles and
// swells, then KABOOM: fireball, smoke and everything blasted out; two little pops after.
// =====================================================================================
BNB.Bashers.register({
    id: 'boom', name: 'Explosion', say: 'Kaboom!', ground: false,
    create: function (ctx) {
        const B = BNB.Bashers, T = ctx.THREE, c = ctx.chunk, P = B.place(ctx), K = B.kit(ctx), E = B.ease;
        const R = B.clamp(0.45 + P.h * 0.07, 0.62, 0.95);
        const zg = ctx.zeroG;
        // The bomb lands just in front of the chunk, toward its outer side.
        const spot = new T.Vector3(P.clampIn(c.center.x + P.side * c.size.x * 0.12, R * 1.5), zg ? c.center.y : P.floor + R, c.max.z + R + 0.12);
        const landAt = 0.45, boomAt = 2.05, duration = 3.4;

        // Model: glossy black ball, a shine, a metal cap, a rope fuse that burns down.
        const bomb = K.group(ctx.root);
        const inner = K.group(bomb);          // wobbles and swells
        const bodyMat = K.mat('#2b2f36', { rough: 0.28, metal: 0.25, glow: '#ff3b1f', glowI: 0 });
        K.add(inner, K.sphere(R, 26, 18), bodyMat, 0, 0, 0);
        const shineDir = new T.Vector3(-0.45, 0.55, 0.7).normalize();
        const shine = K.add(inner, K.sphere(1, 12, 8), K.basic('#ffffff', { opacity: 0.6 }), 0, 0, 0, { s: [0.2 * R, 0.13 * R, 0.04 * R], shadow: false });
        shine.position.copy(shineDir).multiplyScalar(R * 0.985);
        shine.lookAt(shineDir.clone().multiplyScalar(R * 3));
        const metal = K.mat('#8d96a0', { rough: 0.35, metal: 0.6 });
        K.add(inner, K.cyl(0.3 * R, 0.34 * R, 0.28 * R, 14), metal, 0, R * 0.98, 0);
        K.add(inner, K.geo(new T.TorusGeometry(0.31 * R, 0.05 * R, 6, 16)), metal, 0, R * 1.11, 0, { r: [Math.PI / 2, 0, 0] });
        const curve = new T.CatmullRomCurve3([
            new T.Vector3(0, 1.08 * R, 0), new T.Vector3(0.06 * R, 1.3 * R, 0.03 * R), new T.Vector3(0.24 * R, 1.46 * R, -0.04 * R),
            new T.Vector3(0.34 * R, 1.62 * R, 0.06 * R), new T.Vector3(0.28 * R, 1.8 * R, 0.14 * R)
        ]);
        const fuseSegs = 20, fuseRad = 6;
        const fuseGeo = K.geo(new T.TubeGeometry(curve, fuseSegs, 0.055 * R, fuseRad, false));
        K.add(inner, fuseGeo, K.mat('#d9b77a', { rough: 0.9 }), 0, 0, 0);
        const spark = K.add(inner, K.sphere(0.1 * R, 10, 8), K.basic('#fff2a8'), 0, 0, 0, { shadow: false });
        const starM = K.basic('#ffd23f');
        const star1 = K.add(spark, K.box(0.5 * R, 0.07 * R, 0.07 * R), starM, 0, 0, 0, { s: 1, shadow: false });
        const star2 = K.add(spark, K.box(0.07 * R, 0.5 * R, 0.07 * R), starM, 0, 0, 0, { s: 1, shadow: false });

        const fire = B.puffs(ctx, K, 12, false), smoke = B.puffs(ctx, K, 10, true);
        const from = zg ? new T.Vector3(P.out(P.off), spot.y + 1, spot.z) : spot.clone().setY(spot.y + 7);
        const tip = new T.Vector3(), tipW = new T.Vector3();
        let t = 0, landed = 0, sparkT = 0, boomed = false, pops = 0, swept = false;
        const popAt = [boomAt + 0.45, boomAt + 0.85];
        ctx.focus(new T.Vector3((spot.x + c.center.x) / 2, P.floor + P.h * 0.4, (spot.z + c.center.z) / 2), 1.15);
        ctx.sound('fuse', 0.7);

        function placeBomb() {
            if (zg) {
                const u = E.out(E.clamp(t / 0.8));
                bomb.position.lerpVectors(from, spot, u);
                bomb.rotation.set(0, 0, (1 - u) * 2.5 * P.side);
                return;
            }
            if (t < landAt) {
                const u = t / landAt;
                bomb.position.set(spot.x, from.y + (spot.y - from.y) * u * u, spot.z);
            } else if (t < landAt + 0.3) {
                const u = (t - landAt) / 0.3;   // one small bounce
                bomb.position.set(spot.x, spot.y + 0.55 * R * 4 * u * (1 - u), spot.z);
            } else bomb.position.copy(spot);
            // Squash on each landing.
            const sq = t >= landAt ? Math.exp(-14 * (t - landAt)) * Math.cos(30 * (t - landAt)) * 0.22 : 0;
            const sq2 = t >= landAt + 0.3 ? Math.exp(-16 * (t - landAt - 0.3)) * Math.cos(30 * (t - landAt - 0.3)) * 0.1 : 0;
            bomb.scale.set(1 + (sq + sq2) * 0.6, 1 - (sq + sq2), 1 + (sq + sq2) * 0.6);
        }

        return {
            update: function (dt) {
                t += dt;
                fire.update(dt); smoke.update(dt);
                if (!boomed) {
                    placeBomb();
                    if (!zg && landed === 0 && t >= landAt) { landed = 1; ctx.sound('thud', 0.8); ctx.fx.dust(spot.x, P.floor, spot.z, 10, 0.6); ctx.shake(0.2, 0.2); }
                    if (!zg && landed === 1 && t >= landAt + 0.3) { landed = 2; ctx.sound('thud', 0.4); ctx.fx.dust(spot.x, P.floor, spot.z, 5, 0.4); }
                    // Wobble and swell, faster and faster, glowing hot.
                    const u = E.clamp((t - 0.75) / (boomAt - 0.75));
                    const freq = 7 + 22 * u, w = Math.sin(t * freq);
                    const sw = 1 + 0.32 * Math.pow(u, 1.5);
                    inner.scale.set(sw * (1 + 0.06 * u * w), sw * (1 - 0.06 * u * w), sw * (1 + 0.06 * u * w));
                    inner.rotation.z = 0.14 * u * Math.sin(t * freq * 0.5);
                    inner.rotation.x = 0.08 * u * Math.cos(t * freq * 0.43);
                    bodyMat.emissiveIntensity = 0.55 * Math.pow(u, 3.5) * (0.7 + 0.3 * Math.sin(t * 40));   // black, then hot red at the end
                    // The fuse burns down toward the cap.
                    const left = 1 - E.clamp((t - 0.2) / (boomAt - 0.25)) * 0.92;
                    fuseGeo.setDrawRange(0, Math.max(1, Math.round(left * fuseSegs)) * fuseRad * 6);
                    curve.getPointAt(Math.min(1, left), tip);
                    spark.position.copy(tip);
                    const tw = 0.8 + 0.4 * Math.sin(t * 47);
                    spark.scale.setScalar(tw);
                    star1.rotation.z = t * 9; star2.rotation.z = t * 9;
                    sparkT -= dt;
                    if (sparkT <= 0) {
                        sparkT = 0.08;
                        spark.getWorldPosition(tipW);
                        if (zg) ctx.fx.twinkle(tipW.x, tipW.y, tipW.z, 2, '#ffd27a');
                        else ctx.fx.sparks(tipW.x, tipW.y, tipW.z, 3, 2.2);
                    }
                }
                if (t >= boomAt && !boomed) {
                    boomed = true;
                    bomb.visible = false;
                    const size = 1.15 + R * 0.9;
                    B.fireball(ctx, fire, smoke, spot, size, { particles: 34, smoke: 4, lobes: 5 });
                    if (!zg) ctx.fx.dust(spot.x, P.floor, spot.z, 20, 1.1);
                    ctx.sound('boom', 1);
                    ctx.shake(1, 0.55);
                    const fresh = B.releaseAll(ctx);
                    const o = spot.clone();
                    if (!zg) o.y = P.floor - 0.35;
                    B.blast(ctx, o, {
                        radius: Math.max(c.size.x, c.size.y, c.size.z) * 0.75 + 2.6, speed: 8, lift: 3.6, falloff: 0.5,
                        bias: c.final ? null : new T.Vector3(P.side * 2.2, 0, 0), fresh: fresh
                    });
                }
                if (boomed && pops < popAt.length && t >= popAt[pops]) {
                    // A little pop among the rubble.
                    const list = ctx.chunkBlocks();
                    const b = list[Math.floor(ctx.rand() * list.length)];
                    const p = b ? b.pos.clone() : spot.clone();
                    B.fireball(ctx, fire, null, p, 0.55 + R * 0.25, { particles: 12, lobes: 2, ring: pops === 0 });
                    ctx.sound(pops === 0 ? 'boom-small' : 'pop', 0.7);
                    ctx.shake(0.3, 0.2);
                    B.blast(ctx, p.clone().setY(zg ? p.y : p.y - 0.4), { radius: 1.7, speed: 4.5, lift: 3.2 });
                    pops++;
                }
                if (boomed && !swept) { swept = true; B.sweep(ctx, spot); }
                return t < duration;
            },
            dispose: function () { K.dispose(); if (bomb.parent) bomb.parent.remove(bomb); }
        };
    }
});

// =====================================================================================
// Little Truck - a chunky toy bulldozer drives in along the ground, rams the chunk,
// backs up (beep beep!), rams again; on the last chunk it drives right through and off.
// =====================================================================================
BNB.Bashers.register({
    id: 'truck', name: 'Little Truck', say: 'Beep beep!', ground: true,
    create: function (ctx) {
        const B = BNB.Bashers, T = ctx.THREE, c = ctx.chunk, P = B.place(ctx), K = B.kit(ctx);
        const s = B.clamp(0.8 + P.h * 0.05, 0.9, 1.3);
        const cz = c.center.z, front = 1.55 * s, rw = 0.42 * s;
        const at = d => c.enter + P.inward * d - P.inward * front;   // truck x with its blade d past the outer edge
        const xStart = P.out(P.off + front);
        const xReady = at(-2.3);
        const width = Math.abs(P.far - c.enter);
        const xHit1 = P.clampIn(at(c.final ? Math.min(width * 0.5 + 0.3, 2.5) : width * 0.6 + 0.2), front);
        const xHit2 = P.clampIn(at(width + 0.4), front);
        // A ram speeds up to about 11 units/s at the hit: time = 2 x distance / end speed.
        const ramT = (a, b, vEnd, lo, hi) => B.clamp(2 * Math.abs(b - a) / vEnd, lo, hi);
        const xBack = xReady + P.side * 0.3, xRev = xReady + P.side * 0.75;
        // Ram 1 down the front lane, back up while steering over, ram 2 down the back lane.
        const lane = P.lanes(0.9 * s), z1 = lane[0], z2 = lane[1];
        const keys = [[0, [xStart, z1]], [0.7, [xReady, z1], 'out2'], [0.95, [xBack, z1]]];
        let tt = 0.95;
        tt += ramT(xBack, xHit1, 11, 0.32, 0.75); keys.push([tt, [xHit1, z1], 'in2']);
        const hit1 = tt;
        tt += 0.22; keys.push([tt, [xHit1 + P.side * 0.7, z1], 'out']);
        tt += 0.5; keys.push([tt, [xReady + P.side * 0.6, z2]]);
        const beepAt = tt - 0.48;
        tt += 0.15; keys.push([tt, [xRev, z2]]);
        const revs = [[0.7, 0.95], [tt - 0.15, tt]];
        let hit2;
        if (c.final) {
            // Right through the rubble and off the far side: it keeps its speed, then speeds up.
            const xFar = P.far + P.inward * (front + 0.5), xOff = P.far + P.inward * (P.off + 3);
            const T2 = ramT(xRev, xFar, 11, 0.35, 1.0);
            tt += T2; keys.push([tt, [xFar, z2], 'in2']);
            hit2 = tt - T2 * 0.4;
            const v0 = 2 * Math.abs(xFar - xRev) / T2, d3 = Math.abs(xOff - xFar), T3 = 0.85;
            const a = Math.min(1, v0 * T3 / d3);
            tt += T3; keys.push([tt, [xOff, z2], u => a * u + (1 - a) * u * u]);
        } else {
            tt += ramT(xRev, xHit2, 12, 0.32, 0.75); keys.push([tt, [xHit2, z2], 'in2']);
            hit2 = tt;
            tt += 0.22; keys.push([tt, [xHit2 + P.side * 0.8, z2], 'out']);
            tt += 0.9; keys.push([tt, [xStart, z2], 'in2']);
        }
        const duration = tt;
        const path = B.track(keys);
        const hitTimes = [hit1, hit2];

        // Model, facing +x, origin on the ground.
        const rig = K.group(ctx.root);
        rig.rotation.y = P.inward > 0 ? 0 : Math.PI;
        const body = K.group(rig);           // pitches and bounces on its wheels
        const yellow = K.mat('#f6c833', { rough: 0.45 }), dark = K.mat('#3e444d', { rough: 0.7 });
        const glass = K.mat('#3f6a9a', { rough: 0.2, metal: 0.1 }), tire = K.mat('#2b2d31', { rough: 0.9 });
        const hub = K.mat('#f5f0e6', { rough: 0.5 }), blade = K.mat('#e2453c', { rough: 0.45, double: true }), steel = K.mat('#9aa4ae', { rough: 0.35, metal: 0.5 });
        K.add(body, K.rbox(2.0 * s, 0.32 * s, 1.0 * s, 0.08 * s), dark, 0, 0.62 * s, 0);                // chassis
        K.add(body, K.rbox(1.15 * s, 0.62 * s, 1.12 * s, 0.14 * s), yellow, 0.36 * s, 0.98 * s, 0);    // hood
        K.add(body, K.rbox(0.95 * s, 0.95 * s, 1.12 * s, 0.16 * s), yellow, -0.55 * s, 1.24 * s, 0);   // cab
        K.add(body, K.rbox(1.08 * s, 0.12 * s, 1.22 * s, 0.05 * s), K.mat('#e0a21f', { rough: 0.5 }), -0.55 * s, 1.76 * s, 0);
        K.add(body, K.box(0.05 * s, 0.42 * s, 0.84 * s), glass, -0.06 * s, 1.36 * s, 0);               // windscreen
        K.add(body, K.box(0.6 * s, 0.4 * s, 1.15 * s), glass, -0.55 * s, 1.36 * s, 0);                 // side windows
        K.add(body, K.sphere(0.13 * s, 12, 8), K.mat('#ff8c1a', { glow: '#ff7a00', glowI: 0.6 }), -0.55 * s, 1.84 * s, 0);   // beacon
        K.add(body, K.cyl(0.07 * s, 0.07 * s, 0.6 * s, 8), steel, 0.12 * s, 1.5 * s, -0.36 * s);       // exhaust
        K.add(body, K.cyl(0.095 * s, 0.08 * s, 0.1 * s, 8), dark, 0.12 * s, 1.82 * s, -0.36 * s);
        K.add(body, K.box(0.04 * s, 0.32 * s, 0.6 * s), dark, 0.94 * s, 0.96 * s, 0);                  // grille
        const lamp = K.mat('#fff4c2', { glow: '#ffe9a0', glowI: 0.8 });
        K.add(body, K.sphere(0.09 * s, 10, 8), lamp, 0.93 * s, 1.08 * s, 0.4 * s);
        K.add(body, K.sphere(0.09 * s, 10, 8), lamp, 0.93 * s, 1.08 * s, -0.4 * s);
        K.add(body, K.box(0.75 * s, 0.1 * s, 0.1 * s), steel, 1.0 * s, 0.62 * s, 0.42 * s);           // blade arms
        K.add(body, K.box(0.75 * s, 0.1 * s, 0.1 * s), steel, 1.0 * s, 0.62 * s, -0.42 * s);
        const br = 0.6 * s;   // curved blade: a slice of a cylinder, hollow side forward
        K.add(body, K.geo(new T.CylinderGeometry(br, br, 1.75 * s, 12, 1, true, Math.PI * 1.5 - 0.8, 1.6)), blade, 1.35 * s + br, 0.56 * s, 0, { r: [Math.PI / 2, 0, 0] });
        K.add(body, K.box(0.1 * s, 0.08 * s, 1.75 * s), steel, 1.5 * s, 0.14 * s, 0);
        const wheels = [];
        [[0.72, 0.62], [0.72, -0.62], [-0.72, 0.62], [-0.72, -0.62]].forEach(w => {
            const g = K.group(rig, w[0] * s, rw, w[1] * s);
            K.add(g, K.cyl(rw, rw, 0.34 * s, 18), tire, 0, 0, 0, { r: [Math.PI / 2, 0, 0] });
            K.add(g, K.cyl(0.22 * s, 0.22 * s, 0.36 * s, 12), hub, 0, 0, 0, { r: [Math.PI / 2, 0, 0] });
            K.add(g, K.box(0.34 * s, 0.07 * s, 0.37 * s), dark, 0, 0, 0);
            wheels.push(g);
        });

        const knock = B.knocker(ctx, { spin: 8, spread: 1.5, cooldown: 0.2 });
        const p0 = path(0), psi0 = P.inward > 0 ? 0 : Math.PI;
        rig.position.set(p0[0], P.floor, p0[1]);
        const bladeW = new T.Vector3(), bodyW = new T.Vector3(), endW = new T.Vector3(), push = new T.Vector3();
        const bt = B.tracker(T);
        let t = 0, prevX = p0[0], prevZ = p0[1], roll = 0, steer = 0, puffT = 0, lastHit = -1, hits = 0, swept = false, honked = false, revved = 0;
        const bumpAt = [];
        ctx.sound('engine', 0.7);
        ctx.focus(new T.Vector3(c.enter + P.side * 1.2, P.floor + 0.8, cz), 1.12);

        return {
            update: function (dt) {
                t += dt;
                knock.tick(dt);
                const v = path(t), x = v[0], z = v[1], dx = x - prevX, dz = z - prevZ;
                prevX = x; prevZ = z;
                const fwd = dx * P.inward >= 0 ? 1 : -1;
                roll += fwd * Math.hypot(dx, dz);
                // Steer along the way it's going (backing up across to the other lane swings its tail).
                if (Math.hypot(dx, dz) > 0.3 * dt) {
                    const want = B.clamp(Math.atan2(-dz * fwd * P.inward, dx * fwd * P.inward), -0.6, 0.6);
                    steer += (want - steer) * Math.min(1, 8 * dt);
                }
                rig.position.set(x, P.floor, z);
                rig.rotation.y = psi0 + steer;
                rig.updateMatrixWorld(true);
                wheels.forEach(w => { w.rotation.z = -roll / rw; });
                // Bouncy suspension, a nose-up jolt after each hit, a shiver while revving.
                const speed = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
                let pitch = 0;
                bumpAt.forEach(h => { const a = t - h; if (a > 0) pitch += 0.16 * Math.exp(-5 * a) * Math.sin(13 * a); });
                body.rotation.z = pitch;
                body.position.y = 0.025 * s * Math.sin(roll * 9) * Math.min(1, speed / 3) + Math.max(0, pitch) * 0.4 * s;
                const rev = revs.some(r => t > r[0] && t < r[1]);
                if (rev) body.position.y += 0.02 * s * Math.sin(t * 70);
                if (rev && revved < (t > revs[1][0] ? 2 : 1)) { revved++; ctx.sound('engine', 0.6); }
                if (!honked && t > beepAt) { honked = true; ctx.sound('horn', 0.8); }
                puffT -= dt;
                if (puffT <= 0 && (speed > 0.5 || rev)) {
                    puffT = rev ? 0.07 : 0.14;
                    rig.localToWorld(endW.set(0.12 * s, 1.9 * s, -0.36 * s));
                    ctx.fx.smoke(endW.x, endW.y, endW.z, rev ? 2 : 1, 0.22 * s, '#a3a3a3', 1.2);
                }
                // The blade does the knocking (only while driving in).
                rig.localToWorld(bladeW.set(front - 0.2 * s, 0.55 * s, 0));
                rig.localToWorld(bodyW.set(0.3 * s, 0.9 * s, 0));
                bt.set(bladeW, dt);
                knock.clear(bodyW, 1.3 * s, 0.95 * s, 0.95 * s, bt.vel);   // never drive through rubble
                if (bt.vel.x * P.inward > 1.5) {
                    push.copy(bt.vel).multiplyScalar(0.9);
                    const r = knock.hit(bladeW, 0.7 * s, push, 2.8);
                    knock.hit(rig.localToWorld(endW.set(front - 0.2 * s, 0.55 * s, 0.75 * s)), 0.55 * s, push, 2.8);
                    knock.hit(rig.localToWorld(endW.set(front - 0.2 * s, 0.55 * s, -0.75 * s)), 0.55 * s, push, 2.8);
                    knock.hit(rig.localToWorld(endW.set(front - 0.2 * s, 1.05 * s, 0)), 0.55 * s, push, 3);
                    knock.hit(bodyW, 0.75 * s, push, 2);
                    if (r.released + r.shoved > 0 && t - lastHit > 0.5) {
                        lastHit = t;
                        hits++;
                        bumpAt.push(t);
                        ctx.sound(hits === 1 ? 'crunch' : 'thud', 0.9);
                        ctx.shake(hits === 1 ? 0.5 : 0.35, 0.3);
                        ctx.fx.dust(bladeW.x, P.floor, bladeW.z, 12, 0.8);
                    }
                }
                if (!swept && t > hitTimes[1] + 0.25) { swept = true; B.sweep(ctx); }
                return t < duration;
            },
            dispose: function () { K.dispose(); if (rig.parent) rig.parent.remove(rig); }
        };
    }
});

// =====================================================================================
// Bowling Ball - a giant glossy marbled ball rolls in and crashes through like a strike;
// on a chunk with more build behind it, it rebounds and comes back for a second hit.
// =====================================================================================
BNB.Bashers.register({
    id: 'bowl', name: 'Bowling Ball', say: 'Strike!', ground: false,
    create: function (ctx) {
        const B = BNB.Bashers, T = ctx.THREE, c = ctx.chunk, P = B.place(ctx), K = B.kit(ctx);
        const R = B.clamp(0.6 + P.h * 0.08, 0.8, 1.2);
        const zg = ctx.zeroG, cz = c.center.z;
        const y = zg ? c.center.y : P.floor + R;
        const xStart = P.out(P.off + R), xTouch = P.out(R);
        const sp = Math.max(9, P.off / 1.05);
        const tIn = P.off / sp;
        // A deep chunk gets hit down the front lane, then (after the rebound) down the back lane.
        const lane = P.lanes(R), z1 = c.final ? cz : lane[0], z2 = lane[1];
        let keys, duration;
        if (c.final) {
            const xThrough = P.far + P.inward * (R + 0.5);
            const tThrough = tIn + Math.abs(xThrough - xTouch) / 6.5;
            keys = [[0, [xStart, z1]], [tIn, [xTouch, z1], 'linear'], [tThrough, [xThrough, z1], 'linear'], [tThrough + 1.1, [xThrough + P.inward * 6, z1], 'out2']];
            duration = Math.max(2.6, tThrough + 1.1);
        } else {
            const xMax = P.clampIn(P.far + P.inward * R, R);
            const t1 = tIn + Math.max(0.15, Math.abs(xMax - xTouch)) / 7.5;
            keys = [
                [0, [xStart, z1]], [tIn, [xTouch, z1], 'linear'], [t1, [xMax, z1], 'linear'],
                [t1 + 0.55, [P.out(R + 2.4), (z1 + z2) / 2], 'out'],   // rebound, rolling back out
                [t1 + 0.75, [P.out(R + 2.6), z2], 'out'],
                [t1 + 1.25, [xMax, z2], 'in'],                        // back for a second hit
                [t1 + 1.7, [P.out(R + 1.6), z2], 'out'],
                [t1 + 2.45, [P.out(P.off + R), z2], 'in']             // and away
            ];
            duration = t1 + 2.45;
        }
        const path = B.track(keys);

        // Model: marbled purple sphere (vertex colours), a shine, three finger holes.
        const g = K.geo(new T.SphereGeometry(R, 30, 22));
        const pa = g.attributes.position, col = new Float32Array(pa.count * 3);
        const cA = new T.Color('#2a1a6e'), cB = new T.Color('#7b3fd1'), cC = new T.Color('#d38cf2'), cc = new T.Color();
        for (let i = 0; i < pa.count; i++) {
            const x = pa.getX(i) / R, yy = pa.getY(i) / R, z = pa.getZ(i) / R;
            const w = Math.sin(3.6 * x + 2.2 * Math.sin(3.1 * yy + 1.7 * z) + 1.3 * Math.sin(2.3 * z));
            cc.copy(cA).lerp(cB, 0.5 + 0.5 * w);
            const vein = Math.exp(-Math.pow((w - 0.55) / 0.12, 2));
            cc.lerp(cC, vein * 0.8);
            col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
        }
        g.setAttribute('color', new T.BufferAttribute(col, 3));
        const ball = K.group(ctx.root);
        const spin = K.group(ball);
        K.add(spin, g, K.mat('#ffffff', { rough: 0.16, metal: 0.05, vc: true }), 0, 0, 0);
        const holeM = K.mat('#121016', { rough: 0.9 }), holeG = K.cyl(0.11 * R, 0.11 * R, 0.12 * R, 12);
        const up = new T.Vector3(0, 1, 0);
        [[0.18, 0.34, 0.92], [-0.12, 0.38, 0.92], [0.02, 0.05, 1]].forEach(h => {
            const d = new T.Vector3(h[0], h[1], h[2]).normalize();
            const m = K.add(spin, holeG, holeM, d.x * R * 0.97, d.y * R * 0.97, d.z * R * 0.97, { shadow: false });
            m.quaternion.setFromUnitVectors(up, d);
        });
        const shine = K.add(ball, K.sphere(1, 12, 8), K.basic('#ffffff', { opacity: 0.5 }), 0, 0, 0, { shadow: false });
        const sd = new T.Vector3(-0.4, 0.6, 0.7).normalize();
        shine.position.copy(sd).multiplyScalar(R * 0.99);
        shine.scale.set(0.24 * R, 0.14 * R, 0.04 * R);
        shine.lookAt(sd.clone().multiplyScalar(R * 3));
        const axis = new T.Vector3(), q = new T.Quaternion(), tumble = new T.Vector3(0.3, 0.5, 0.81).normalize();

        const knock = B.knocker(ctx, { spin: 10, spread: 2.6, cooldown: 0.2 });
        const p0 = path(0);
        ball.position.set(p0[0], y, p0[1]);
        const bt = B.tracker(T), push = new T.Vector3(), prev = ball.position.clone();
        let t = 0, hits = 0, lastHit = -1, rolled = false, swept = false;
        ctx.sound(zg ? 'whoosh' : 'roll', 0.75);
        ctx.focus(new T.Vector3(c.enter + P.side * 1.5, P.floor + 0.8, cz), 1.12);

        return {
            update: function (dt) {
                t += dt;
                knock.tick(dt);
                const v = path(t), x = v[0], z = v[1];
                ball.position.set(x, y, z);
                // Roll to match the distance, about the axis across its path (in space it just tumbles).
                const dx = x - prev.x, dz = z - prev.z, dd = Math.hypot(dx, dz);
                prev.copy(ball.position);
                if (dd > 1e-5) {
                    if (zg) q.setFromAxisAngle(tumble, dd / R * 0.6);
                    else q.setFromAxisAngle(axis.set(dz / dd, 0, -dx / dd), dd / R);
                    spin.quaternion.premultiply(q);
                }
                bt.set(ball.position, dt);
                knock.clear(ball.position, R, R, R, bt.vel);
                if (!c.final && !rolled && t > keys[4][0]) { rolled = true; ctx.sound(zg ? 'whoosh' : 'roll', 0.55); }
                if (bt.vel.x * P.inward > 2) {
                    push.copy(bt.vel).multiplyScalar(0.95);
                    const r = knock.hit(ball.position, R + 0.12, push, 2.4);
                    if (r.released + r.shoved > 0 && t - lastHit > 0.5) {
                        lastHit = t;
                        hits++;
                        ctx.sound(hits === 1 ? 'strike' : 'thud', hits === 1 ? 1 : 0.7);
                        ctx.shake(hits === 1 ? 0.6 : 0.35, 0.3);
                        if (zg) ctx.fx.twinkle(x, y, z, 12);
                        else ctx.fx.dust(x, P.floor, z, 12, 0.8);
                    }
                }
                if (!swept && t > duration - 0.6) { swept = true; B.sweep(ctx); }
                return t < duration;
            },
            dispose: function () { K.dispose(); if (ball.parent) ball.parent.remove(ball); }
        };
    }
});

// =====================================================================================
// T. rex - a cartoon T. rex stomps in, roars at the build, turns round and swings its
// long tail through the chunk in two big arcs, then stomps off.
// =====================================================================================
BNB.Bashers.register({
    id: 'trex', name: 'T. rex', say: 'Roar!', ground: true,
    create: function (ctx) {
        const B = BNB.Bashers, T = ctx.THREE, c = ctx.chunk, P = B.place(ctx), K = B.kit(ctx), E = B.ease;
        const s = B.clamp(0.72 + P.h * 0.1, 0.9, 1.45);
        const cz = c.center.z, bodyBack = 1.0 * s;
        // Stand with the snout at the chunk's edge; the tail must reach in but never past chunk.stop.
        let hx = P.out(1.75 * s + 0.15), tailLen;
        if (c.final) tailLen = B.clamp(P.depth(P.far) - P.depth(hx) - bodyBack + 0.2, 3.0 * s, 5.4 * s);
        else {
            const room = P.depth(c.stop) - P.depth(hx) - bodyBack - 0.25;
            tailLen = B.clamp(room, 2.6 * s, 5.4 * s);
            if (room < tailLen) hx = c.stop + P.side * (bodyBack + tailLen + 0.25);
        }

        // ---- model, facing +x, feet on the ground ----
        const green = K.mat('#5dbb4f', { rough: 0.5 }), belly = K.mat('#eae3a8', { rough: 0.55 });
        const spikeM = K.mat('#f28c28', { rough: 0.5 }), white = K.mat('#ffffff', { rough: 0.3 });
        const black = K.mat('#1d1f22', { rough: 0.25 }), mouthM = K.mat('#c0394a', { rough: 0.6 }), claw = K.mat('#fff6e0', { rough: 0.5 });
        const rig = K.group(ctx.root);
        const bodyG = K.group(rig, 0, 1.75 * s, 0);
        K.add(bodyG, K.sphere(1, 14, 10), green, 0, 0, 0, { s: [1.25 * s, 0.95 * s, 0.85 * s], r: [0, 0, 0.3] });
        K.add(bodyG, K.sphere(1, 10, 8), belly, 0.36 * s, -0.16 * s, 0, { s: [0.92 * s, 0.72 * s, 0.7 * s], r: [0, 0, 0.3] });
        [[-0.55, 0.78], [-0.1, 0.95], [0.35, 1.02]].forEach(p => {
            K.add(bodyG, K.cone(0.13 * s, 0.32 * s, 8), spikeM, p[0] * s, p[1] * s, 0, { r: [0, 0, 0.15] });
        });
        const headG = K.group(bodyG, 0.95 * s, 0.72 * s, 0);
        K.add(headG, K.sphere(1, 8, 6), green, 0.05 * s, -0.1 * s, 0, { s: [0.5 * s, 0.6 * s, 0.48 * s] });
        K.add(headG, K.sphere(1, 12, 9), green, 0.55 * s, 0.28 * s, 0, { s: [0.75 * s, 0.55 * s, 0.56 * s] });
        K.add(headG, K.sphere(1, 12, 8), green, 1.05 * s, 0.17 * s, 0, { s: [0.58 * s, 0.38 * s, 0.47 * s] });
        [0.13, -0.13].forEach(z => K.add(headG, K.sphere(0.05 * s, 6, 4), black, 1.52 * s, 0.33 * s, z * s, { shadow: false }));
        [0.36, -0.36].forEach(z => {
            K.add(headG, K.sphere(0.18 * s, 8, 6), white, 0.75 * s, 0.6 * s, z * s);
            K.add(headG, K.sphere(0.09 * s, 8, 5), black, 0.87 * s, 0.63 * s, z * 1.24 * s, { shadow: false });
            K.add(headG, K.sphere(0.03 * s, 4, 3), white, 0.91 * s, 0.68 * s, z * 1.36 * s, { shadow: false });
            K.add(headG, K.capsule(0.04 * s, 0.2 * s, 4, 1), K.mat('#2f7d36'), 0.76 * s, 0.82 * s, z * s, { r: [Math.PI / 2, 0, z > 0 ? 0.3 : -0.3], shadow: false });
        });
        [0.75, 1.0, 1.25].forEach((x, i) => [0.3, -0.3].forEach(z => {
            K.add(headG, K.cone(0.05 * s, 0.14 * s, 4), claw, x * s, -0.05 * s - i * 0.01 * s, z * (1 - i * 0.12) * s, { r: [Math.PI, 0, 0], shadow: false });
        }));
        const jawG = K.group(headG, 0.35 * s, 0.02 * s, 0);
        K.add(jawG, K.sphere(1, 12, 6), green, 0.62 * s, -0.12 * s, 0, { s: [0.8 * s, 0.2 * s, 0.44 * s] });
        K.add(jawG, K.sphere(1, 8, 4), mouthM, 0.6 * s, -0.02 * s, 0, { s: [0.62 * s, 0.07 * s, 0.34 * s], shadow: false });
        [0.42, -0.42].forEach(z => K.add(bodyG, K.capsule(0.08 * s, 0.3 * s, 5, 1), green, 0.86 * s, -0.12 * s, z * s, { r: [0, 0, -1.2] }));
        const legs = [];
        [0.5, -0.5].forEach(z => {
            const legG = K.group(rig, -0.05 * s, 1.42 * s, z * s);
            K.add(legG, K.sphere(1, 8, 6), green, 0, -0.1 * s, 0, { s: [0.6 * s, 0.78 * s, 0.42 * s] });
            K.add(legG, K.capsule(0.2 * s, 0.5 * s, 7, 1), green, 0.05 * s, -0.82 * s, 0);
            K.add(legG, K.sphere(1, 10, 6), green, 0.22 * s, -1.25 * s, 0, { s: [0.52 * s, 0.18 * s, 0.33 * s] });
            [-0.14, 0, 0.14].forEach(cz2 => K.add(legG, K.cone(0.06 * s, 0.16 * s, 4), claw, 0.72 * s, -1.3 * s, cz2 * s, { r: [0, 0, -Math.PI / 2], shadow: false }));
            legs.push(legG);
        });
        // The tail: a chain of chubby segments, drooping toward a curled-up tip.
        const wts = [0.21, 0.19, 0.17, 0.155, 0.14, 0.135], radii = [0.5, 0.42, 0.34, 0.26, 0.19, 0.13];
        const droop = B.clamp(1.3 * s / (0.38 * tailLen), 0.4, 1.3);
        const tail = [];
        let parent = bodyG;
        for (let i = 0; i < wts.length; i++) {
            const L = wts[i] * tailLen, r = radii[i] * s;
            const g = K.group(parent, i === 0 ? -bodyBack : -wts[i - 1] * tailLen, i === 0 ? 0.05 * s : 0, 0);
            g.userData.droop = (i === 0 ? 0.28 : i === wts.length - 1 ? -0.1 : 0.06) * droop;
            g.rotation.z = g.userData.droop;
            K.add(g, K.sphere(1, 8, 6), green, -L * 0.5, 0, 0, { s: [L * 0.78, r, r] });
            if (i < 4) K.add(g, K.cone(0.1 * s * (1 - i * 0.15), 0.26 * s * (1 - i * 0.12), 6), spikeM, -L * 0.5, r * 0.9, 0, { r: [0, 0, 0.35] });
            tail.push({ g: g, L: L, r: r });
            parent = g;
        }
        const tipMark = new T.Object3D();
        tipMark.position.set(-tail[tail.length - 1].L, 0, 0);
        tail[tail.length - 1].g.add(tipMark);

        // ---- motion ----
        const psiIn = P.inward > 0 ? 0 : Math.PI, psiOut = psiIn + Math.PI;
        const xFrom = P.out(P.off + 2.5 * s), xAway = P.out(P.off + 4 * s);
        const roarAt = 1.3, turnAt = 1.95, sw1 = 2.55, sw2 = 3.0, offAt = 3.45, duration = 4.35;
        const move = B.track([
            [0, [xFrom, psiIn, 0]],
            [1.25, [hx, psiIn, 0], 'out2'],
            [turnAt, [hx, psiIn, 0]],
            [turnAt + 0.42, [hx, psiOut, 0.6]],
            [sw1, [hx, psiOut, 1.15], 'out'],       // wind up
            [sw2, [hx, psiOut, -1.2]],              // big swing one way...
            [offAt, [hx, psiOut, 1.1]],             // ...and back
            [offAt + 0.22, [hx, psiOut, 0], 'out'],
            [duration, [xAway, psiOut, 0], 'in2']
        ]);
        const face = B.track([
            [0, [0, 0.06]], [roarAt, [0, 0.06]],
            [roarAt + 0.18, [0.42, 0.85], 'out'],
            [roarAt + 0.55, [0.36, 0.78]],
            [turnAt, [0, 0.08]],
            [offAt, [-0.08, 0.2]], [duration, [0.05, 0.12]]
        ]);
        const stepLen = Math.max(0.8 * s, Math.abs(hx - xFrom) / 5);

        const knock = B.knocker(ctx, { spin: 9, spread: 1.8, cooldown: 0.3 });
        const v0 = move(0);
        rig.position.set(v0[0], P.floor, cz);
        rig.rotation.y = v0[1];
        const tmp = new T.Vector3(), push = new T.Vector3(), walkV = new T.Vector3();
        const pts = tail.map(() => B.tracker(T)).concat([B.tracker(T)]);
        const feet = legs.map(l => { const m = new T.Object3D(); m.position.set(0.22 * s, -1.2 * s, 0); l.add(m); return m; });
        const bodyT = B.tracker(T);
        let t = 0, ph = 0, prevX = v0[0], prevSwing = 0, lastStep = 1, lastHit = -1, hits = 0, roared = false, swept = false;
        ctx.focus(new T.Vector3((hx + c.center.x) / 2, P.floor + 1.4 * s, cz), 1.2);

        return {
            update: function (dt) {
                t += dt;
                knock.tick(dt);
                const v = move(t);
                const x = v[0], swing = v[2];
                const dx = Math.abs(x - prevX);
                prevX = x;
                const turning = t > turnAt && t < turnAt + 0.42;
                ph += dx * Math.PI / stepLen + (turning ? dt * Math.PI / 0.21 : 0);
                const walk = dx / Math.max(dt, 1e-4) > 0.4 || turning ? 1 : 0;
                rig.position.set(x, P.floor, cz);
                // While it roars it turns its head toward the camera (we see its face, not its back).
                const rAmt = E.clamp((t - roarAt + 0.1) / 0.25) * (1 - E.clamp((t - turnAt + 0.2) / 0.25));
                rig.rotation.y = v[1] + swing - 0.6 * P.inward * rAmt;
                const sp = Math.sin(ph), cp = Math.cos(ph);
                const amp = turning ? 0.3 : 0.5;
                legs[0].rotation.z = sp * amp * walk;
                legs[1].rotation.z = -sp * amp * walk;
                legs[0].position.y = 1.42 * s + Math.max(0, cp) * 0.3 * s * walk;
                legs[1].position.y = 1.42 * s + Math.max(0, -cp) * 0.3 * s * walk;
                bodyG.position.y = 1.75 * s + (0.12 * (1 - Math.abs(sp)) - 0.04) * s * walk;
                bodyG.rotation.x = 0.06 * sp * walk;
                // A stomp each time a foot comes down.
                const step = cp >= 0 ? 1 : -1;
                if (walk && step !== lastStep) {
                    lastStep = step;
                    ctx.sound('stomp', 0.45);
                    ctx.shake(0.22, 0.15);
                    legs[step > 0 ? 1 : 0].getWorldPosition(tmp);
                    ctx.fx.dust(tmp.x, P.floor, tmp.z, 6, 0.6);
                }
                // Roar: head up, jaw wide, a little head shake.
                const f = face(t);
                const roaring = t > roarAt && t < turnAt - 0.1;
                headG.rotation.z = f[0];
                headG.rotation.y = roaring ? 0.1 * Math.sin(t * 28) : 0;
                jawG.rotation.z = -f[1];
                bodyG.rotation.z = 0.12 * f[0];
                if (!roared && t >= roarAt) { roared = true; ctx.sound('roar', 1); ctx.shake(0.35, 0.6); }
                // The tail lags behind the swing, curling the other way.
                const sv = (swing - prevSwing) / Math.max(dt, 1e-4);
                prevSwing = swing;
                tail.forEach((seg, i) => {
                    seg.g.rotation.y = B.clamp(-sv * 0.03 * (0.6 + i * 0.35), -0.45, 0.45) + 0.06 * Math.sin(t * 3 + i * 0.7);
                });
                rig.updateMatrixWorld(true);
                tail.forEach((seg, i) => { seg.g.getWorldPosition(tmp); pts[i].set(tmp, dt); });
                tipMark.getWorldPosition(tmp);
                pts[tail.length].set(tmp, dt);
                bodyG.getWorldPosition(tmp);
                bodyT.set(tmp, dt);
                // Walking through rubble kicks it gently aside.
                if (walk && !turning) {
                    walkV.copy(bodyT.vel).setY(0);
                    knock.clear(tmp.setY(P.floor + 1.6 * s), 1.3 * s, 1.6 * s, 0.85 * s, walkV);
                    walkV.multiplyScalar(0.6);
                    bodyG.getWorldPosition(tmp);
                    knock.hit(tmp, 0.9 * s, walkV, 1.2);
                    feet.forEach(fm => { fm.getWorldPosition(tmp); knock.hit(tmp, 0.4 * s, walkV, 1.5); });
                }
                if (t > turnAt && t < offAt + 0.3) {
                    for (let i = 1; i < pts.length; i++) {
                        const pt = pts[i];
                        if (pt.vel.length() < 2) continue;
                        push.copy(pt.vel).multiplyScalar(0.7);
                        const r = knock.hit(pt.pos, (i < tail.length ? tail[i].r : 0.15 * s) + 0.3, push, 2.8);
                        if (r.released + r.shoved > 0 && t - lastHit > 0.4) {
                            lastHit = t;
                            hits++;
                            ctx.sound(hits === 1 ? 'crunch' : 'thud', hits === 1 ? 1 : 0.7);
                            ctx.shake(hits === 1 ? 0.5 : 0.3, 0.25);
                            ctx.fx.dust(pt.pos.x, P.floor, pt.pos.z, 8, 0.7);
                        }
                    }
                }
                if (!swept && t > offAt + 0.2) { swept = true; B.sweep(ctx); }
                return t < duration;
            },
            dispose: function () { K.dispose(); if (rig.parent) rig.parent.remove(rig); }
        };
    }
});

// =====================================================================================
// Tornado - a swirling funnel moves in, parks over the chunk, lifts the blocks and spins
// them round itself, then moves on and flings them out.
// =====================================================================================
BNB.Bashers.register({
    id: 'tornado', name: 'Tornado', say: 'Whoosh!', ground: true,
    create: function (ctx) {
        const B = BNB.Bashers, T = ctx.THREE, c = ctx.chunk, P = B.place(ctx), K = B.kit(ctx), E = B.ease;
        const s = B.clamp(0.8 + P.h * 0.06, 0.9, 1.4);
        const Ht = Math.max(P.h + 2.8, 5.5);
        const rad = y => (0.3 + 2.0 * Math.pow(B.clamp(y / Ht, 0, 1), 1.5)) * s;
        const cz = c.center.z;
        // Park over the chunk, keeping the funnel and its whirl clear of what still stands.
        const restTop = ctx.rest ? Math.min(Ht, ctx.rest.max.y) : 0;
        const parkX = c.final ? c.center.x : P.clampIn(c.center.x, Math.max(rad(restTop) + 0.85 * s, 2.2 * s));
        const orbitMax = c.final ? 2.2 * s : Math.max(0.8, Math.abs(c.stop - parkX) - 0.6);
        const parkAt = 1.05, flingAt = 2.75, duration = 3.95;
        const endX = c.final ? P.far + P.inward * (P.off + 2) : P.out(P.off + 1);
        const move = B.track([
            [0, [P.out(P.off + 2.5 * s), cz + 0.6, 0.55]],
            [parkAt, [parkX, cz, 1], 'out'],
            [flingAt - 0.1, [parkX + P.side * 0.15, cz + 0.1, 1.05], 'sine'],
            [duration, [endX, cz - 5, 0.55], 'in2']
        ]);

        // ---- model: stacked spinning rings with streaks, debris whirling round ----
        const rig = K.group(ctx.root);
        const funnelMat = K.mat('#eef2f6', { opacity: 0.5, double: true, vc: true, rough: 1 });
        const coreMat = K.mat('#a9b3be', { opacity: 0.35, double: true, rough: 1 });
        const rings = [], nR = 9;
        const cA = new T.Color('#ffffff'), cB = new T.Color('#8f9aa6'), cc = new T.Color();
        for (let i = 0; i < nR; i++) {
            const y0 = Ht * i / nR, y1 = Ht * (i + 1) / nR;
            const g = K.geo(new T.CylinderGeometry(rad(y1), rad(y0), (y1 - y0) * 1.12, 22, 1, true));
            const pa = g.attributes.position, col = new Float32Array(pa.count * 3);
            for (let k = 0; k < pa.count; k++) {
                const a = Math.atan2(pa.getZ(k), pa.getX(k));
                const w = 0.5 + 0.5 * Math.sin(a * 3 + i * 0.9 + pa.getY(k) * 2);
                cc.copy(cB).lerp(cA, w * w);
                col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
            }
            g.setAttribute('color', new T.BufferAttribute(col, 3));
            const m = K.add(rig, g, funnelMat, 0, (y0 + y1) / 2, 0, { shadow: false });
            m.renderOrder = 3;
            rings.push({ m: m, w: 6.5 - i * 0.4, y: (y0 + y1) / 2, k: i / (nR - 1) });
        }
        const core = K.add(rig, K.geo(new T.CylinderGeometry(rad(Ht) * 0.5, rad(0) * 0.6, Ht, 14, 1, true)), coreMat, 0, Ht / 2, 0, { shadow: false });
        const skirt = K.add(rig, K.geo(new T.CylinderGeometry(rad(0) * 3.4, rad(0) * 1.3, 0.55 * s, 20, 1, true)), K.mat('#d8c7a6', { opacity: 0.45, double: true, rough: 1 }), 0, 0.27 * s, 0, { shadow: false });
        const debris = [];
        const bitG = K.box(0.2 * s, 0.2 * s, 0.2 * s), leafG = K.geo(new T.TetrahedronGeometry(0.17 * s));
        const bitM = K.mat('#8b5a2b', { rough: 0.8 }), leafM = K.mat('#5aa83f', { rough: 0.7, flat: true });
        for (let i = 0; i < 10; i++) {
            const leaf = i % 2 === 0;
            const m = K.add(rig, leaf ? leafG : bitG, leaf ? leafM : bitM, 0, 0, 0, { s: leaf ? [1, 0.35, 1] : 0.6 + ctx.rand() * 0.6 });
            debris.push({ m: m, a: ctx.rand() * Math.PI * 2, y: (0.12 + 0.8 * ctx.rand()) * Ht, w: 3.5 + ctx.rand() * 2.5, sp: [ctx.rand() * 6, ctx.rand() * 6] });
        }

        // ---- the whirl ----
        const fl = B.flow(ctx), inChunk = new Set(c.ids), start = new Map(), g = B.gravity(ctx), vk = B.velScale(ctx);
        const centre = new T.Vector3();
        let t = 0, dustT = 0, flung = false, swept = false, parked = false, fade = 1;
        ctx.sound('wind', 0.85);
        ctx.focus(new T.Vector3(parkX, P.floor + Math.min(P.h, Ht) * 0.45, cz), 1.15);

        return {
            update: function (dt) {
                t += dt;
                fl.tick(dt);
                const v = move(t);
                const settle = E.clamp((t - 0.6) / 0.6) * (1 - E.clamp((t - flingAt) / 0.4));
                const x = v[0] + 0.18 * s * Math.sin(t * 5.3) * settle, z = v[1] + 0.15 * s * Math.cos(t * 4.1) * settle;
                rig.position.set(x, P.floor, z);
                const sc = v[2] * (1 - 0.6 * E.in(E.clamp((t - (duration - 0.5)) / 0.5)));
                rig.scale.set(sc, Math.min(1, sc * 1.15), sc);
                fade = 1 - E.clamp((t - (duration - 0.5)) / 0.5);
                funnelMat.opacity = 0.5 * fade; coreMat.opacity = 0.35 * fade;
                // Rings spin (fast at the bottom) and snake about.
                rings.forEach((r, i) => {
                    r.m.rotation.y += r.w * dt;
                    r.m.position.x = 0.28 * s * Math.sin(t * 2.6 - i * 0.55) * r.k;
                    r.m.position.z = 0.22 * s * Math.cos(t * 2.2 - i * 0.5) * r.k;
                });
                core.rotation.y -= 3 * dt;
                skirt.rotation.y += 7 * dt;
                debris.forEach(d => {
                    d.a += d.w * dt;
                    const r = rad(d.y) + 0.35 * s, k = d.y / Ht;
                    d.m.position.set(Math.cos(d.a) * r + 0.28 * s * Math.sin(t * 2.6 - k * 4.4) * k, d.y + 0.3 * Math.sin(d.a * 2), -Math.sin(d.a) * r);
                    d.m.rotation.set(t * d.sp[0], t * d.sp[1], 0);
                });
                dustT -= dt;
                if (dustT <= 0 && fade > 0.3) {
                    dustT = 0.09;
                    const a = ctx.rand() * Math.PI * 2;
                    ctx.fx.dust(x + Math.cos(a) * 0.6 * s, P.floor, z + Math.sin(a) * 0.6 * s, 2, 0.5);
                }
                if (!parked && t >= parkAt) { parked = true; ctx.sound('rumble', 0.55); ctx.shake(0.25, 0.4); }
                // Lift the chunk from the top down and whirl it round the funnel.
                centre.set(x, P.floor + 1, z);
                if (t > parkAt - 0.2 && t < flingAt) {
                    const u = E.clamp((t - (parkAt - 0.2)) / 0.8);
                    const cut = c.max.y + 0.1 - (c.max.y - P.floor + 0.3) * u;
                    ctx.releaseWhere(function (cen) { return cen.y >= cut; });
                    const lift = E.clamp((t - parkAt) / 1.1);
                    const f = Math.min(1, 5.5 * dt);
                    ctx.pushNear(centre, 9, function (id, pos) {
                        if (!inChunk.has(id)) return null;
                        let first = false;
                        if (!start.has(id)) { start.set(id, Math.max(pos.y, P.floor + 0.6)); first = true; }
                        const dx = pos.x - x, dz = pos.z - z, r = Math.hypot(dx, dz) || 1e-3;
                        const ux = dx / r, uz = dz / r;
                        const k = B.heft(ctx, id);
                        const rT = Math.min(orbitMax, (0.95 + 0.18 * (id % 4)) * s);
                        const yT = start.get(id) + lift * (0.8 + (id % 5) * 0.35) * k * s;
                        const vt = 5.2 * s * vk;
                        const w = fl.v(id);
                        const tx = uz * vt + ux * (rT - r) * 2.6, ty = (yT - pos.y) * 2.4, tz = -ux * vt + uz * (rT - r) * 2.6;
                        const sp = first ? 5 : 0;
                        return [(tx - w[0]) * f, (ty - w[1]) * f + g * dt, (tz - w[2]) * f, (ctx.rand() - 0.5) * sp, sp, (ctx.rand() - 0.5) * sp];
                    });
                }
                if (!flung && t >= flingAt) {
                    flung = true;
                    swept = true;
                    B.sweep(ctx);
                    ctx.sound('whoosh-big', 0.85);
                    ctx.shake(0.35, 0.3);
                    ctx.pushNear(centre, 9, function (id, pos) {
                        if (!inChunk.has(id)) return null;
                        const dx = pos.x - x, dz = pos.z - z, r = Math.hypot(dx, dz) || 1e-3;
                        const ux = dx / r, uz = dz / r, k = B.heft(ctx, id), w = fl.v(id);
                        let tx = (ux * 5.2 + uz * 2.4) * k * vk, tz = (uz * 5.2 - ux * 2.4) * k * vk;
                        if (!c.final) tx += P.side * 2.2 * k * vk;
                        return [tx - w[0], 2.6 * k * vk - w[1] * 0.5, tz - w[2], (ctx.rand() - 0.5) * 6, (ctx.rand() - 0.5) * 6, (ctx.rand() - 0.5) * 6];
                    });
                }
                if (!swept && t > flingAt) { swept = true; B.sweep(ctx); }
                return t < duration;
            },
            dispose: function () { K.dispose(); if (rig.parent) rig.parent.remove(rig); }
        };
    }
});

// =====================================================================================
// Meteor - a rocky meteor with glowing cracks streaks down from the entry side into the
// chunk: fireball, smoke, a crater, blocks blasted out; two little meteorites follow.
// In space it's an asteroid that comes from far away and breaks apart.
// =====================================================================================
BNB.Bashers.register({
    id: 'meteor', name: 'Meteor', say: 'Look out!', ground: false, sky: true,
    create: function (ctx) {
        const B = BNB.Bashers, T = ctx.THREE, c = ctx.chunk, P = B.place(ctx), K = B.kit(ctx), E = B.ease;
        const Rm = B.clamp(0.6 + P.h * 0.08, 0.75, 1.15);
        const zg = ctx.zeroG, cz = c.center.z;
        const impact = new T.Vector3(P.clampIn(c.center.x + P.side * c.size.x * 0.12, Rm), zg ? c.center.y : P.floor, cz);
        const rest = impact.clone();
        if (!zg) rest.y = P.floor + 0.3 * Rm;          // where the rock ends up, half sunk
        // From high on the entry side and far back, so it is in view for most of its streak.
        const from = zg ? impact.clone().add(new T.Vector3(P.side * 4 + 6, 3, -34)) : rest.clone().add(new T.Vector3(P.side * 12, 7, -16));
        const launch = zg ? 0.1 : 0.15, hitAt = zg ? 1.55 : 1.25, duration = hitAt + (zg ? 1.9 : 1.75);
        const dir = rest.clone().sub(from).normalize();

        // ---- a rock with glowing cracks: one shape split into rock and lava faces ----
        function rockGeos(seed, detail) {
            const base = new T.IcosahedronGeometry(1, detail);
            const pa = base.attributes.position, n = pa.count;
            const q = new T.Vector3(), r = ctx.rand;
            const dirs = [0, 1, 2].map(() => new T.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
            const ph = [r() * 6, r() * 6, r() * 6, r() * 6];
            const crackF = p => Math.sin(p.dot(dirs[0]) * 4.2 + ph[0]) + Math.sin(p.dot(dirs[1]) * 3.6 + ph[1]) + Math.sin(p.dot(dirs[2]) * 5.1 + ph[2]);
            const pos = new Float32Array(n * 3), cr = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                q.fromBufferAttribute(pa, i).normalize();
                const cv = crackF(q);
                const bump = 0.09 * Math.sin(q.x * 6 + ph[3]) * Math.sin(q.z * 5 + seed) + 0.06 * Math.sin(q.y * 7 + seed * 2);
                const rr = 1 + bump - 0.09 * Math.exp(-Math.pow(cv / 0.45, 2));
                pos[i * 3] = q.x * rr; pos[i * 3 + 1] = q.y * rr; pos[i * 3 + 2] = q.z * rr;
                cr[i] = Math.abs(cv);
            }
            base.dispose();
            const rockP = [], lavaP = [];
            for (let i = 0; i < n; i += 3) {
                const crack = (cr[i] + cr[i + 1] + cr[i + 2]) / 3 < (detail > 2 ? 0.3 : 0.5);
                const dst = crack ? lavaP : rockP;
                for (let k = 0; k < 9; k++) dst.push(pos[i * 3 + k]);
            }
            const rg = new T.BufferGeometry();
            rg.setAttribute('position', new T.Float32BufferAttribute(rockP, 3));
            rg.computeVertexNormals();
            const lg = new T.BufferGeometry();
            lg.setAttribute('position', new T.Float32BufferAttribute(lavaP, 3));
            lg.computeVertexNormals();
            return [K.geo(rg), K.geo(lg)];
        }
        const big = rockGeos(1.7, 5), small = rockGeos(4.2, 1);   // 720 and 80 triangles
        const rockM = K.mat('#5e4c43', { rough: 0.95, flat: true }), lavaM = K.basic('#ff8a1f');
        const trailM = K.basic('#ff9a3c', { opacity: 0.45 }), trail2M = K.basic('#ffe08a', { opacity: 0.6 });
        const trailG = K.geo(new T.CylinderGeometry(1, 0.06, 1, 14, 1, true));
        const up = new T.Vector3(0, 1, 0);
        function makeRock(size) {
            const g = K.group(ctx.root), spin = K.group(g), geos = size > Rm * 0.6 ? big : small;
            K.add(spin, geos[0], rockM, 0, 0, 0, { s: size });
            K.add(spin, geos[1], lavaM, 0, 0, 0, { s: size, shadow: false });
            const tr = K.add(ctx.root, trailG, trailM, 0, 0, 0, { shadow: false });
            const tr2 = K.add(ctx.root, trailG, trail2M, 0, 0, 0, { shadow: false });
            [tr, tr2].forEach(m => { m.visible = false; m.renderOrder = 5; });
            return { g: g, spin: spin, tr: tr, tr2: tr2, size: size };
        }
        function trail(rk, d, len) {
            const on = len > 0.05;
            [rk.tr, rk.tr2].forEach((m, i) => {
                m.visible = on;
                if (!on) return;
                const L = len * (i ? 0.55 : 1), w = rk.size * (i ? 0.62 : 0.92);
                m.quaternion.setFromUnitVectors(up, d);
                m.scale.set(w, L, w);
                m.position.copy(rk.g.position).addScaledVector(d, -L / 2 + rk.size * 0.2);
            });
        }
        const main = makeRock(Rm);
        const axis = new T.Vector3(ctx.rand() - 0.5, ctx.rand() - 0.5, ctx.rand() - 0.5).normalize();
        main.g.position.copy(from);
        main.g.visible = false;
        const fire = B.puffs(ctx, K, 14, false), smoke = B.puffs(ctx, K, 10, true);
        // Telegraph: a shadow on the ground that grows darker as it falls. Then a crater.
        let shadow = null, crater = null;
        if (!zg) {
            shadow = K.add(ctx.root, K.geo(new T.CircleGeometry(1, 28)), K.basic('#000000', { opacity: 0 }), impact.x, P.floor + 0.03, impact.z, { r: [-Math.PI / 2, 0, 0], shadow: false });
            crater = K.group(ctx.root, impact.x, P.floor + 0.025, impact.z);
            K.add(crater, K.geo(new T.RingGeometry(0.62, 1, 28)), K.basic('#6b5440', { opacity: 0.7 }), 0, 0.01, 0, { r: [-Math.PI / 2, 0, 0], s: 1, shadow: false });
            K.add(crater, K.geo(new T.CircleGeometry(0.66, 28)), K.basic('#3b2e24', { opacity: 0.55 }), 0, 0, 0, { r: [-Math.PI / 2, 0, 0], shadow: false });
            crater.scale.setScalar(1.9 * Rm);
            crater.visible = false;
        }
        // The two little meteorites.
        const minis = [0, 1].map(i => {
            const rk = makeRock(Rm * 0.36);
            rk.g.visible = false;
            const off = new T.Vector3(P.side * (0.6 + ctx.rand() * 1.0), 0, (ctx.rand() - 0.5) * 2.2);
            const to = zg ? impact.clone().add(new T.Vector3(off.x, (ctx.rand() - 0.5) * 2, off.z)) : impact.clone().add(off).setY(P.floor + 0.12);
            const fr = to.clone().add(zg ? new T.Vector3(P.side * 16, 3, -14) : new T.Vector3(P.side * 8, 6.5, -10 + i * 3));
            return { rk: rk, from: fr, to: to, t0: hitAt + 0.12 + i * 0.35, t1: hitAt + 0.62 + i * 0.35, hit: false, d: to.clone().sub(fr).normalize() };
        });
        const frags = [];
        if (zg) {
            for (let i = 0; i < 5; i++) {
                const rk = makeRock(Rm * (0.3 + ctx.rand() * 0.15));
                rk.g.visible = false;
                const v = new T.Vector3(ctx.rand() - 0.5, ctx.rand() - 0.5, ctx.rand() - 0.5).setLength(1.4 + ctx.rand() * 1.0);
                if (!c.final) v.x = P.side * (Math.abs(v.x) + 0.8);   // never drift into what still stands
                frags.push({ rk: rk, v: v, w: new T.Vector3(ctx.rand() * 4, ctx.rand() * 4, ctx.rand() * 4) });
            }
        }

        const knock = B.knocker(ctx, { spin: 8, spread: 1.5, cooldown: 0.4 });
        const push = dir.clone().multiplyScalar(6);
        const lavaHot = new T.Color('#ff8a1f'), lavaCold = new T.Color('#6d2a14');
        let t = 0, hit = false, whistled = false, smokeT = 0, swept = false;
        ctx.focus(new T.Vector3(impact.x + P.side * 1.2, P.floor + P.h * 0.5, cz), 1.18);

        return {
            update: function (dt) {
                t += dt;
                knock.tick(dt);
                fire.update(dt); smoke.update(dt);
                if (!whistled && t >= launch) { whistled = true; ctx.sound(zg ? 'rumble' : 'whistle', 0.8); }
                if (shadow) {
                    const u = E.clamp(t / hitAt);
                    shadow.material.opacity = hit ? 0 : 0.38 * u;
                    shadow.scale.setScalar((2.8 - 1.5 * u) * Rm);
                }
                if (!hit) {
                    const u = E.clamp((t - launch) / (hitAt - launch));
                    main.g.visible = t >= launch;
                    main.g.position.lerpVectors(from, rest, zg ? E.in(u) : Math.pow(u, 1.5));
                    main.spin.quaternion.setFromAxisAngle(axis, t * 5);
                    trail(main, dir, t >= launch ? Math.min(1, (t - launch) / 0.25) * Rm * (zg ? 4 : 6.5) : 0);
                    // Clip whatever it passes on the way down.
                    if (u > 0.5) knock.hit(main.g.position, Rm + 0.1, push, 0.5);
                    if (zg) ctx.fx.twinkle(main.g.position.x, main.g.position.y, main.g.position.z, 1, '#ffb347');
                    else if (!zg && u > 0.1 && ctx.rand() < 0.5) ctx.fx.smoke(main.g.position.x, main.g.position.y, main.g.position.z, 1, 0.7 * Rm, '#7a6a60', 0.2);
                }
                if (!hit && t >= hitAt) {
                    hit = true;
                    trail(main, dir, 0);
                    main.g.position.copy(rest);
                    const p = zg ? impact.clone() : impact.clone().setY(P.floor + 0.5 * Rm);
                    B.fireball(ctx, fire, smoke, p, 1.0 + Rm * 0.9, { particles: 36, smoke: 5, lobes: 5 });
                    ctx.sound('boom', 1);
                    ctx.shake(0.95, 0.55);
                    const fresh = B.releaseAll(ctx);
                    const o = zg ? impact.clone() : impact.clone().setY(P.floor - 0.45);
                    B.blast(ctx, o, {
                        radius: Math.max(c.size.x, c.size.y, c.size.z) * 0.75 + 2.6, speed: 8, lift: 4, falloff: 0.5,
                        bias: c.final ? null : new T.Vector3(P.side * 2.4, 0, 0), fresh: fresh
                    });
                    if (zg) {
                        main.g.visible = false;
                        frags.forEach(fr => { fr.rk.g.visible = true; fr.rk.g.position.copy(impact); });
                    } else {
                        crater.visible = true;
                        ctx.fx.dust(impact.x, P.floor, impact.z, 24, 1.2);
                    }
                }
                if (hit) {
                    const k = E.clamp((t - hitAt) / 2.4);
                    lavaM.color.copy(lavaHot).lerp(lavaCold, k);
                    if (!zg) {
                        smokeT -= dt;
                        if (smokeT <= 0) { smokeT = 0.3; ctx.fx.smoke(rest.x, rest.y + 0.4 * Rm, rest.z, 2, 0.6 * Rm, '#8a827a', 0.8); }
                    }
                    frags.forEach(fr => {
                        fr.rk.g.position.addScaledVector(fr.v, dt);
                        fr.rk.spin.rotation.x += fr.w.x * dt; fr.rk.spin.rotation.y += fr.w.y * dt;
                        fr.rk.g.scale.setScalar(1 - E.in(E.clamp((t - hitAt - 1) / 0.8)) * 0.999);
                    });
                }
                minis.forEach(mi => {
                    if (mi.hit || t < mi.t0) return;
                    const u = E.clamp((t - mi.t0) / (mi.t1 - mi.t0));
                    mi.rk.g.visible = true;
                    mi.rk.g.position.lerpVectors(mi.from, mi.to, E.in2(u));
                    mi.rk.spin.rotation.x += 9 * dt;
                    trail(mi.rk, mi.d, Math.min(1, u * 4) * Rm * 2.4);
                    if (u >= 1) {
                        mi.hit = true;
                        mi.rk.g.visible = false;
                        trail(mi.rk, mi.d, 0);
                        B.fireball(ctx, fire, null, mi.to, 0.6 + 0.3 * Rm, { particles: 12, lobes: 2 });
                        ctx.sound('boom-small', 0.7);
                        ctx.shake(0.3, 0.2);
                        B.blast(ctx, zg ? mi.to : mi.to.clone().setY(P.floor - 0.4), { radius: 1.8, speed: 4.5, lift: 3.2 });
                    }
                });
                if (hit && !swept) { swept = true; B.sweep(ctx, impact); }
                return t < duration;
            },
            dispose: function () { K.dispose(); }
        };
    }
});

// =====================================================================================
// Big Sneeze - a giant cartoon face rises up beside the build, goes "ah... ah..." and
// then CHOO! A cone of wind and mist blows the chunk away; a little sneeze; it sinks away.
// =====================================================================================
BNB.Bashers.register({
    id: 'sneeze', name: 'Big Sneeze', say: 'Ah... ah... choo!', ground: false,
    create: function (ctx) {
        const B = BNB.Bashers, T = ctx.THREE, c = ctx.chunk, P = B.place(ctx), K = B.kit(ctx), E = B.ease;
        const zg = ctx.zeroG, cz = c.center.z;
        const R = B.clamp(0.6 + P.h * 0.16, 1.0, 1.9);
        const headX = P.out(R + 1.0);
        const headY = zg ? c.center.y : P.floor + Math.max(R * 0.95, P.h * 0.55);
        const pivotDrop = 0.8 * R;            // the head tilts about the neck, below its centre
        // Face the chunk, turned a little toward the camera.
        const fwd = new T.Vector3(P.inward, 0, 0.42).normalize();
        const yaw = Math.atan2(-fwd.z, fwd.x);
        const choo = 2.05, choo2 = 2.95, sinkAt = 3.25, duration = 3.95;
        const rise = zg
            ? B.track([[0, [headX + P.side * 7, headY - 2]], [0.65, [headX, headY], 'back'], [sinkAt, [headX, headY]], [duration, [headX + P.side * 8, headY - 1.5], 'in']])
            : B.track([[0, [headX, headY - 2.3 * R - 1.2]], [0.62, [headX, headY], 'back'], [sinkAt, [headX, headY]], [duration, [headX, headY - 2.5 * R - 1.5], 'in']]);
        // Channels: [tilt back, nose swell, mouth open, brows up]
        const act = B.track([
            [0, [0, 1, 0.2, 0]], [0.62, [0, 1, 0.2, 0]],
            [1.05, [0.28, 1.12, 0.5, 1], 'out'],                // ah...
            [1.25, [0.16, 1.05, 0.35, 0.5]],
            [1.85, [0.5, 1.25, 0.7, 1.2], 'out'],               // ah...!
            [choo, [0.53, 1.28, 0.72, 1.25]],
            [choo + 0.1, [-0.38, 0.9, 1.4, -0.4], 'out'],       // CHOO!
            [choo + 0.45, [-0.3, 0.95, 1.2, -0.3]],
            [choo2 - 0.25, [0.0, 1.02, 0.4, 0.3]],
            [choo2 - 0.05, [0.18, 1.12, 0.5, 0.7], 'out'],      // a little one...
            [choo2 + 0.06, [-0.2, 0.95, 0.9, -0.2], 'out'],     // ...choo
            [sinkAt, [0, 1, 0.3, 0.2]], [duration, [0, 1, 0.3, 0.2]]
        ]);

        // ---- model: round head, closed eyes, big nose, rosy cheeks, hair, shirt below ----
        const skin = K.mat('#f6c9a5', { rough: 0.6 }), pinkM = K.mat('#f4a090', { rough: 0.5 });
        const darkM = K.mat('#3a2a26', { rough: 0.6 }), hairM = K.mat('#7a4a28', { rough: 0.7 }), cheekM = K.mat('#f59ab0', { rough: 0.6 });
        const rig = K.group(ctx.root);
        rig.rotation.y = yaw;
        const shirt = K.mat('#3fa84f', { rough: 0.8 }), shirt2 = K.mat('#f6c833', { rough: 0.8 });
        K.add(rig, K.cyl(0.42 * R, 0.46 * R, 1.0 * R, 14, true), skin, 0, -0.75 * R, 0);                            // neck
        K.add(rig, K.cyl(0.62 * R, 1.05 * R, 0.9 * R, 16, true), shirt, 0, -1.55 * R, 0);                           // shoulders
        K.add(rig, K.cyl(1.05 * R, 1.08 * R, 0.45 * R, 16, true), shirt2, 0, -2.2 * R, 0);
        K.add(rig, K.cyl(1.08 * R, 1.1 * R, 3 * R, 16, true), shirt, 0, -3.9 * R, 0);
        K.add(rig, K.geo(new T.TorusGeometry(0.47 * R, 0.08 * R, 6, 16)), shirt2, 0, -1.12 * R, 0, { r: [Math.PI / 2, 0, 0] });   // collar
        const tilt = K.group(rig, 0, -pivotDrop, 0);
        const head = K.group(tilt, 0, pivotDrop, 0);
        K.add(head, K.sphere(R, 24, 16), skin, 0, 0, 0);
        const nose = K.group(head, 0.95 * R, -0.04 * R, 0);
        K.add(nose, K.sphere(0.3 * R, 14, 10), pinkM, 0.04 * R, 0, 0, { s: [1.15, 0.95, 1] });
        [0.1, -0.1].forEach(z => K.add(nose, K.sphere(0.055 * R, 6, 4), darkM, 0.2 * R, -0.17 * R, z * R, { shadow: false }));
        const surf = (x, y, z) => new T.Vector3(x, y, z).normalize();
        const eyeG = K.geo(new T.TorusGeometry(0.15 * R, 0.032 * R, 5, 12, Math.PI));
        const brows = [];
        [0.36, -0.36].forEach(z => {
            const n = surf(0.84, 0.32, z);
            const e = K.add(head, eyeG, darkM, n.x * R * 1.0, n.y * R * 1.0, n.z * R * 1.0, { shadow: false });
            e.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), n);
            e.rotateZ(Math.PI);                         // a closed, curved eye
            const bn = surf(0.78, 0.55, z * 1.05);
            const b = K.add(head, K.capsule(0.035 * R, 0.2 * R, 5, 2), darkM, bn.x * R, bn.y * R, bn.z * R, { shadow: false });
            b.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(0, 0.25, -Math.sign(z)).normalize());
            brows.push({ m: b, base: b.position.clone() });
            const cn = surf(0.8, -0.18, z * 1.5);
            K.add(head, K.sphere(0.17 * R, 10, 6), cheekM, cn.x * R * 0.9, cn.y * R * 0.9, cn.z * R * 0.9, { s: [1, 0.75, 1], shadow: false });
        });
        const mn = surf(0.92, -0.45, 0);
        const mouth = K.add(head, K.sphere(1, 10, 8), K.mat('#7a2a35', { rough: 0.6 }), mn.x * R * 0.97, mn.y * R * 0.97, 0, { shadow: false });
        mouth.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), mn);
        [1, -1].forEach(z => K.add(head, K.sphere(0.24 * R, 10, 6), skin, -0.05 * R, -0.05 * R, z * 0.97 * R, { s: [0.55, 1, 0.5] }));
        const cap = K.add(head, K.geo(new T.SphereGeometry(R * 1.04, 20, 7, 0, Math.PI * 2, 0, Math.PI * 0.36)), hairM, 0, 0, 0, { r: [0, 0, 0.42] });
        cap.castShadow = true;
        K.add(head, K.geo(new T.ConeGeometry(0.12 * R, 0.42 * R, 8)), hairM, 0.05 * R, 1.08 * R, 0, { r: [0, 0, -0.5] });   // a cowlick

        // ---- the sneeze: a mist cone, puffs and streaks ----
        const coneM = K.basic('#e9f6ff', { opacity: 0, double: true });
        const coneG = K.geo(new T.CylinderGeometry(1, 0.18, 1, 20, 1, true));
        const cone = K.add(ctx.root, coneG, coneM, 0, 0, 0, { shadow: false });
        cone.visible = false;
        cone.renderOrder = 5;
        const mist = B.puffs(ctx, K, 14, false);
        const streakM = K.basic('#ffffff', { opacity: 0.8 }), streakG = K.capsule(0.03, 0.8, 6);
        const streaks = [];
        for (let i = 0; i < 6; i++) {
            const m = K.add(ctx.root, streakG, streakM, 0, 0, 0, { shadow: false });
            m.visible = false;
            streaks.push({ m: m, off: new T.Vector3(), t0: 0, sp: 0 });
        }
        const noseW = new T.Vector3(), aim = new T.Vector3(), tmp = new T.Vector3(), upV = new T.Vector3(0, 1, 0);
        const target = new T.Vector3(c.center.x, P.floor + P.h * 0.42, cz);
        let t = 0, coneT = -1, coneLen = 1, coneScale = 1, sneezes = 0, swept = false, saidAh = 0, gustT = 0;
        const v0 = rise(0);
        rig.position.set(v0[0], v0[1], cz);
        ctx.focus(new T.Vector3((headX + c.center.x) / 2, P.floor + P.h * 0.45, cz), 1.18);

        function sneeze(big) {
            nose.getWorldPosition(noseW);
            aim.copy(target).sub(noseW);
            if (!c.final) aim.z -= 0.35 * aim.length();           // blow a little away from what still stands
            aim.normalize();
            const reach = Math.max(4, noseW.distanceTo(target) + Math.max(c.size.x, c.size.z) * 0.6 + 1.6);
            coneT = 0; coneLen = reach * (big ? 1 : 0.6); coneScale = big ? 1 : 0.55;
            ctx.sound('sneeze-out', big ? 1 : 0.5);
            ctx.shake(big ? 0.55 : 0.2, big ? 0.35 : 0.2);
            for (let i = 0; i < (big ? 12 : 5); i++) {
                const sp = (big ? 9 : 6) * (0.6 + ctx.rand() * 0.6);
                tmp.set(ctx.rand() - 0.5, ctx.rand() - 0.5, ctx.rand() - 0.5).multiplyScalar(big ? 0.5 : 0.3).add(aim).normalize();
                mist.spawn({ p: noseW, v: tmp.clone().multiplyScalar(sp), r0: 0.15 * R, r1: (big ? 0.55 : 0.35) * R, life: 0.55 + ctx.rand() * 0.3,
                    c0: '#ffffff', c1: '#d6ecfa', a: big ? 0.8 : 0.6, drag: 1.6, delay: ctx.rand() * 0.12 });
            }
            if (big) streaks.forEach(st => {
                st.t0 = 0; st.sp = 10 + ctx.rand() * 5;
                st.off.set(ctx.rand() - 0.5, ctx.rand() - 0.5, ctx.rand() - 0.5).multiplyScalar(0.9 * R);
                st.m.visible = true;
            });
            for (let k = 1; k <= 4; k++) {
                tmp.copy(noseW).addScaledVector(aim, reach * k / 4.5);
                ctx.fx.smoke(tmp.x, tmp.y, tmp.z, big ? 4 : 2, 0.5 * R * (0.6 + k * 0.2), '#f3fbff', 0.3);
            }
            if (big) {
                const fresh = B.releaseAll(ctx);
                B.blast(ctx, noseW, { radius: reach + 1, speed: 6.5, lift: 2.6, falloff: 0.35, dir: aim, dirSpeed: 2.5, fresh: fresh });
            } else {
                B.blast(ctx, noseW, { radius: reach, speed: 3, lift: 1.5, falloff: 0.4, dir: aim, dirSpeed: 1 });
            }
        }

        return {
            update: function (dt) {
                t += dt;
                mist.update(dt);
                const p = rise(t);
                rig.position.set(p[0], p[1], cz);
                const a = act(t);
                const tremble = t > 1.75 && t < choo ? 0.02 * Math.sin(t * 60) : 0;
                tilt.rotation.z = a[0] + tremble;
                nose.scale.setScalar(a[1]);
                mouth.scale.set(0.05 * R, 0.07 * R * a[2] + 0.02 * R, 0.16 * R * (0.6 + 0.4 * a[2]));
                brows.forEach(b => { b.m.position.copy(b.base).multiplyScalar(1 + 0.06 * a[3]); });
                if (saidAh === 0 && t >= 0.64) { saidAh = 1; ctx.sound('sneeze-in', 0.7); }
                if (saidAh === 1 && t >= 1.27) { saidAh = 2; ctx.sound('sneeze-in', 0.9); }
                if (saidAh === 2 && t >= choo2 - 0.25) { saidAh = 3; ctx.sound('sneeze-in', 0.35); }
                if (sneezes === 0 && t >= choo) { sneezes = 1; rig.updateMatrixWorld(true); sneeze(true); }
                if (sneezes === 1 && t >= choo2) { sneezes = 2; rig.updateMatrixWorld(true); sneeze(false); }
                // A gust keeps blowing for a moment after the big one.
                if (sneezes >= 1 && t - choo < 0.4) {
                    gustT -= dt;
                    if (gustT <= 0) {
                        gustT = 0.1;
                        ctx.pushNear(noseW, coneLen + 1, function (id, pos, d, away) {
                            if (away.dot(aim) < 0.75) return null;
                            const k = B.heft(ctx, id) * 0.8 * B.velScale(ctx);
                            return [aim.x * k, aim.y * k + (zg ? 0 : 0.4), aim.z * k, 0, 0, 0];
                        });
                    }
                }
                // The mist cone shoots out, widens and fades.
                if (coneT >= 0) {
                    coneT += dt;
                    const u = E.clamp(coneT / 0.55), g = E.out(E.clamp(coneT / 0.18));
                    cone.visible = u < 1;
                    const L = 0.3 + (coneLen - 0.3) * g, w = (0.25 + 0.75 * g) * coneLen * 0.32 * coneScale;
                    cone.quaternion.setFromUnitVectors(upV, aim);
                    cone.scale.set(w, L, w);
                    cone.position.copy(noseW).addScaledVector(aim, L / 2);
                    coneM.opacity = 0.42 * coneScale * (1 - u);
                }
                streaks.forEach(st => {
                    if (!st.m.visible) return;
                    st.t0 += dt;
                    const u = st.t0 / 0.45;
                    if (u >= 1) { st.m.visible = false; return; }
                    st.m.position.copy(noseW).add(st.off).addScaledVector(aim, st.sp * st.t0);
                    st.m.quaternion.setFromUnitVectors(upV, aim);
                    st.m.scale.set(1, 1 + 2 * u, 1);
                });
                streakM.opacity = 0.8;
                if (!swept && t > choo + 0.5) { swept = true; B.sweep(ctx, noseW); }
                return t < duration;
            },
            dispose: function () { K.dispose(); if (rig.parent) rig.parent.remove(rig); }
        };
    }
});
