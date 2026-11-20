/**
 * NARBE Space Explorer - the ship's flight (headless, Node-testable).
 *
 * Modes:
 *   fly     free roam: the ship flies forward by itself. Steering choices turn
 *           it smoothly by a fixed step (no holding, no timing). Far from
 *           anything it speeds up a lot (an accelerated, not-to-scale pace)
 *           and eases back near stars and planets so the "Do you want to go
 *           here?" prompt comes in good time.
 *   travel  an automatic glide along a smooth curve (into orbit, out of
 *           orbit, over to a moon). Nothing to press.
 *   orbit   circling a planet, moon or star.
 * The game pauses the clock (setHeld) while a menu or prompt is open in a way
 * that should stop the world; the discovery prompt only slows the ship down.
 *
 * Events (on(name, fn)): discover(obj), arrive(obj) when orbit is reached,
 * left(obj) after leaving orbit, system(sys|null) on entering/leaving a
 * system's space.
 */

window.NSE = window.NSE || {};

NSE.Flight = (function () {
    'use strict';

    const U = NSE.Util;
    const UV = NSE.Universe;

    const BASE_SPEED = 34;               // units a second at Medium, near things
    const TURN_STEP = Math.PI / 6;       // 30 degrees a press
    const PITCH_STEP = Math.PI / 9;      // 20 degrees a press
    const PITCH_MAX = Math.PI * 0.32;
    const ORBIT_LAP = 75;                // seconds for one lap

    function v(x, y, z) { return { x: x, y: y, z: z }; }
    function add(a, b) { return v(a.x + b.x, a.y + b.y, a.z + b.z); }
    function sub(a, b) { return v(a.x - b.x, a.y - b.y, a.z - b.z); }
    function mul(a, k) { return v(a.x * k, a.y * k, a.z * k); }
    function len(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
    function norm(a) { const l = len(a) || 1; return v(a.x / l, a.y / l, a.z / l); }
    function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    function cross(a, b) { return v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
    function forwardOf(yaw, pitch) { return v(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }
    function anglesOf(d) { d = norm(d); return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(U.clamp(d.y, -1, 1)) }; }
    function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

    function create() {
        const listeners = {};
        function emit(name, arg) { (listeners[name] || []).forEach(f => { try { f(arg); } catch (e) { console.warn('[NSE] flight event ' + name, e); } }); }

        const s = {
            galaxy: UV.HOME_GALAXY,
            pos: v(0, 0, 0),
            yaw: 0, pitch: 0, yawTarget: 0, pitchTarget: 0,
            bank: 0,
            mode: 'fly',
            time: 0,
            speedK: 1,            // from Settings (Very Slow .. Very Fast)
            boost: 1,             // deep-space speed-up
            slow: 1,              // eases to a crawl while the prompt is up
            prompting: null,      // the object being asked about
            autopilot: null,      // object being flown to by Next Stop
            cooling: new Map(),   // id -> { pos, trigger } not to ask about again until far away
            visited: new Set(),   // ids visited this session (Next Stop prefers new places)
            orbit: null,
            travel: null,
            system: null,         // the system whose space the ship is in
            held: false,
            calm: false,
            checkT: 0,
            near: []              // nearby systems (refreshed now and then)
        };

        function forward() { return forwardOf(s.yaw, s.pitch); }

        // --- placing ----------------------------------------------------------------------------

        function place(galaxy, pos, yaw, pitch) {
            s.galaxy = galaxy;
            s.pos = v(pos.x, pos.y, pos.z);
            s.yaw = s.yawTarget = yaw || 0;
            s.pitch = s.pitchTarget = pitch || 0;
            s.mode = 'fly';
            s.orbit = null; s.travel = null; s.prompting = null; s.autopilot = null;
            s.cooling.clear();
            s.boost = 1; s.slow = 1;
            s.near = UV.systemsNear(s.galaxy, s.pos, 1);
            const was = s.system;
            s.system = null;
            refreshSystem(true);            // tells everyone when the new place is in a system
            if (was && !s.system) emit('system', null);   // ...and when it is out in deep space
        }

        // --- steering (one press = one smooth step) --------------------------------------------------

        function turn(dir) {          // +1 left, -1 right
            if (s.mode !== 'fly') return false;
            s.autopilot = null;
            s.yawTarget += dir * TURN_STEP;
            return true;
        }
        function climb(dir) {         // +1 up, -1 down
            if (s.mode !== 'fly') return false;
            s.autopilot = null;
            const before = s.pitchTarget;
            s.pitchTarget = U.clamp(s.pitchTarget + dir * PITCH_STEP, -PITCH_MAX, PITCH_MAX);
            return Math.abs(s.pitchTarget - before) > 0.01;
        }

        /** Next Stop: fly toward the nearest place not yet visited (or the nearest at all). */
        function nextStop() {
            if (s.mode !== 'fly') return null;
            const here = s.pos, fwd = forward();
            const cands = [];
            const near = UV.systemsNear(s.galaxy, here, 2).slice(0, 12);
            near.forEach(function (sys) {
                UV.objectsOf(sys).forEach(function (o) {
                    if (s.cooling.has(o.id)) return;
                    const d = UV.dist(o.pos, here);
                    if (d < o.trigger * 0.9) return;
                    const ahead = dot(norm(sub(o.pos, here)), fwd);
                    // New places first; then nearer; a little preference for what is ahead.
                    const score = d * (s.visited.has(o.id) ? 6 : 1) * (1.25 - ahead * 0.25) * (o.kind === 'star' && sys === s.system ? 1.6 : 1);
                    cands.push({ o: o, score: score });
                });
            });
            cands.sort((a, b) => a.score - b.score);
            s.autopilot = cands.length ? cands[0].o : null;
            return s.autopilot;
        }

        // --- the discovery prompt ----------------------------------------------------------------------

        function answer(yes) {
            const o = s.prompting;
            s.prompting = null;
            if (!o) return null;
            if (yes) { enterOrbit(o); return o; }
            cool(o);
            return null;
        }
        function cool(o) { s.cooling.set(o.id, { pos: o.pos, trigger: o.trigger }); }

        function checkDiscovery() {
            if (s.mode !== 'fly' || s.prompting) return;
            // Forget cool-downs once far away again.
            s.cooling.forEach(function (c, id) { if (UV.dist(c.pos, s.pos) > c.trigger * 1.6 + 60) s.cooling.delete(id); });
            let best = null, bestD = Infinity;
            s.near.slice(0, 3).forEach(function (sys) {
                UV.objectsOf(sys).forEach(function (o) {
                    if (s.cooling.has(o.id)) return;
                    const d = UV.dist(o.pos, s.pos);
                    if (d < o.trigger && d < bestD) { best = o; bestD = d; }
                });
            });
            if (best) {
                s.prompting = best;
                s.autopilot = null;
                emit('discover', best);
            }
        }

        function refreshSystem(force) {
            if (force || (s.time * 2 | 0) !== (s.lastNearT | 0)) {
                s.lastNearT = s.time * 2;
                s.near = UV.systemsNear(s.galaxy, s.pos, 1);
            }
            const sys = s.near[0] && UV.dist(s.near[0].pos, s.pos) < s.near[0].radius + 900 ? s.near[0] : null;
            if (sys !== s.system) { s.system = sys; emit('system', sys); }
        }

        /** Distance from the ship to the nearest star or planet surface nearby. */
        function clearance() {
            let m = Infinity;
            s.near.slice(0, 2).forEach(function (sys) {
                UV.objectsOf(sys).forEach(function (o) { m = Math.min(m, UV.dist(o.pos, s.pos) - o.radius); });
                if (sys.nebula) m = Math.min(m, Math.max(0, UV.dist(sys.pos, s.pos) - sys.nebula.size));
            });
            return m;
        }

        /** The stars, planets and (near a planet) moons the ship must keep out of. */
        function obstacles() {
            const out = [];
            const sys = s.near[0];
            if (!sys) return out;
            UV.objectsOf(sys).forEach(function (o) {
                out.push({ pos: o.pos, radius: o.radius });
                if (o.kind === 'planet' && o.world.moons.length && UV.dist(o.pos, s.pos) < o.world.reach + 80) {
                    o.world.moons.forEach(m => out.push({ pos: UV.moonPos(o.world, m, s.time), radius: m.radius }));
                }
            });
            return out;
        }

        /** Never fly through a star, planet or moon: slide round it. */
        function pushOut(steer) {
            obstacles().forEach(function (o) {
                const R = o.radius * 1.7 + 6;
                const d = sub(s.pos, o.pos), L = len(d);
                if (L < R && L > 0.001) {
                    const n = mul(d, 1 / L);
                    s.pos = add(o.pos, mul(n, R));
                    if (!steer) return;
                    // Bend the heading along the surface.
                    const f = forward();
                    const t = norm(sub(f, mul(n, dot(f, n))));
                    const a = anglesOf(add(t, mul(n, 0.15)));
                    s.yawTarget = s.yaw + wrap(a.yaw - s.yaw);
                    s.pitchTarget = U.clamp(a.pitch, -PITCH_MAX, PITCH_MAX);
                }
            });
        }

        // --- orbit ---------------------------------------------------------------------------------

        function orbitRadius(o) {
            if (o.kind === 'star') {
                if (o.sys.kind === 'blackhole') return o.sys.disk.outer * 1.45;
                if (o.pair) return o.radius * 2.2 + 70;
                return o.radius * 3 + 60;
            }
            const w = o.world;
            let R = w.radius * (w.kind === 'moon' ? 3.4 : 2.5) + (w.kind === 'moon' ? 8 : 12);
            if (w.rings) R = Math.max(R, w.rings.outer * 1.25);
            return R;
        }

        /** The centre of an orbit target now (moons move). */
        function centreOf(o) {
            if (o.kind === 'moon') return UV.moonPos(o.parentWorld, o.world, s.time);
            return o.pos;
        }

        function orbitPoint(orb, theta) {
            const c = centreOf(orb.obj);
            const inc = orb.incline;
            return add(c, v(Math.cos(theta) * orb.R, Math.sin(theta) * Math.sin(inc) * orb.R, Math.sin(theta) * Math.cos(inc) * orb.R));
        }
        function orbitTangent(orb, theta) {
            const inc = orb.incline;
            return mul(norm(v(-Math.sin(theta), Math.cos(theta) * Math.sin(inc), Math.cos(theta) * Math.cos(inc))), orb.dir);
        }

        function makeOrbit(o, from) {
            const R = orbitRadius(o);
            const c = centreOf(o);
            const rel = sub(from, c);
            const inc = 0.18;
            // Start where the ship is (projected onto the orbit), going round the way it is heading.
            const theta = Math.atan2(rel.z * Math.cos(inc) + rel.y * Math.sin(inc), rel.x);
            const orb = { obj: o, R: R, incline: inc, theta: theta, dir: 1 };
            const tan = orbitTangent(orb, theta);
            if (dot(tan, forward()) < 0) orb.dir = -1;
            return orb;
        }

        function enterOrbit(o) {
            const orb = makeOrbit(o, s.pos);
            const dur = U.clamp(UV.dist(s.pos, orbitPoint(orb, orb.theta)) / 70, 3.2, 7);
            startTravel(dur, function () { return orbitPoint(orb, orb.theta); }, function () { return orbitTangent(orb, orb.theta); }, function () {
                s.mode = 'orbit';
                s.orbit = orb;
                s.visited.add(o.id);
                emit('arrive', o);
            });
            s.target = o;
        }

        /** Go from orbiting a planet to orbiting one of its moons (or back). */
        function visit(o) {
            if (s.mode !== 'orbit') return false;
            const orb = makeOrbit(o, s.pos);
            const dur = U.clamp(UV.dist(s.pos, orbitPoint(orb, orb.theta)) / 45, 3, 6);
            s.orbit = null;
            startTravel(dur, function () { return orbitPoint(orb, orb.theta); }, function () { return orbitTangent(orb, orb.theta); }, function () {
                s.mode = 'orbit';
                s.orbit = orb;
                s.visited.add(o.id);
                emit('arrive', o);
            });
            s.target = o;
            return true;
        }

        function leaveOrbit() {
            if (s.mode !== 'orbit' || !s.orbit) return false;
            const orb = s.orbit, o = orb.obj;
            const c = centreOf(o);
            const out = norm(sub(s.pos, c));
            const tan = orbitTangent(orb, orb.theta);
            const end = add(add(s.pos, mul(out, orb.R * 1.2 + 140)), mul(tan, 160));
            const endDir = norm(add(mul(out, 0.6), tan));
            s.orbit = null;
            // Leaving a moon also leaves its planet: don't ask about the planet straight away.
            cool(o.kind === 'moon' ? { id: o.parentWorld.id, pos: o.parentWorld.pos, trigger: o.parentWorld.radius * 4 + 60 } : o);
            if (o.kind === 'moon') cool(o);
            startTravel(4, function () { return end; }, function () { return endDir; }, function () {
                const a = anglesOf(endDir);
                s.yaw = s.yawTarget = a.yaw;
                s.pitch = s.pitchTarget = U.clamp(a.pitch, -PITCH_MAX, PITCH_MAX);
                s.mode = 'fly';
                s.target = null;
                emit('left', o);
            });
            return true;
        }

        /**
         * Explore System / Nearby Stars: glide by itself to a point, arriving heading `dir`,
         * then fly on from there. done() is called on arrival.
         */
        function flyTo(point, dir, dur, done) {
            if (s.mode !== 'fly') return false;
            const end = v(point.x, point.y, point.z), d = norm(v(dir.x, dir.y, dir.z));
            startTravel(dur, function () { return end; }, function () { return d; }, function () {
                const a = anglesOf(d);
                s.yaw = s.yawTarget = a.yaw;
                s.pitch = s.pitchTarget = U.clamp(a.pitch, -PITCH_MAX, PITCH_MAX);
                s.mode = 'fly';
                s.target = null;
                if (done) done();
            });
            s.target = null;
            return true;
        }

        /** A smooth glide: Hermite curve from here (going forward) to a moving end point. */
        function startTravel(dur, endPos, endDir, done) {
            s.mode = 'travel';
            s.prompting = null;
            s.autopilot = null;
            const p0 = s.pos, d0 = forward();
            s.travel = { t: 0, dur: dur, p0: p0, d0: d0, endPos: endPos, endDir: endDir, done: done };
        }

        function stepTravel(dt) {
            const tr = s.travel;
            tr.t += dt;
            const u = U.clamp(tr.t / tr.dur, 0, 1);
            const e = U.smooth(u) * 0.5 + u * 0.5;     // gentle start, steady glide, gentle end
            const p1 = tr.endPos(), d1 = tr.endDir();
            const L = UV.dist(tr.p0, p1);
            const m0 = mul(tr.d0, L * 0.9), m1 = mul(d1, L * 0.7);
            const h00 = 2 * e * e * e - 3 * e * e + 1, h10 = e * e * e - 2 * e * e + e, h01 = -2 * e * e * e + 3 * e * e, h11 = e * e * e - e * e;
            const prev = s.pos;
            s.pos = add(add(mul(tr.p0, h00), mul(m0, h10)), add(mul(p1, h01), mul(m1, h11)));
            if (u < 1) pushOut(false);
            const mv = sub(s.pos, prev);
            if (len(mv) > 1e-4) {
                const a = anglesOf(mv);
                s.yaw = s.yaw + wrap(a.yaw - s.yaw) * Math.min(1, dt * 6);
                s.pitch = s.pitch + (a.pitch - s.pitch) * Math.min(1, dt * 6);
                s.yawTarget = s.yaw; s.pitchTarget = s.pitch;
            }
            s.speedNow = len(mv) / Math.max(dt, 1e-4);
            if (u >= 1) { s.travel = null; tr.done(); }
        }

        function stepOrbit(dt) {
            const orb = s.orbit;
            orb.theta += orb.dir * (Math.PI * 2 / ORBIT_LAP) * dt * (orb.obj.kind === 'moon' ? 1.3 : 1);
            s.pos = orbitPoint(orb, orb.theta);
            const a = anglesOf(orbitTangent(orb, orb.theta));
            s.yaw = s.yaw + wrap(a.yaw - s.yaw) * Math.min(1, dt * 4);
            s.pitch = s.pitch + (a.pitch - s.pitch) * Math.min(1, dt * 4);
            s.yawTarget = s.yaw; s.pitchTarget = s.pitch;
            s.speedNow = orb.R * Math.PI * 2 / ORBIT_LAP;
        }

        function stepFly(dt) {
            if (s.autopilot) {
                const a = anglesOf(sub(s.autopilot.pos, s.pos));
                s.yawTarget = s.yaw + wrap(a.yaw - s.yaw);
                s.pitchTarget = U.clamp(a.pitch, -PITCH_MAX, PITCH_MAX);
            }
            const k = s.calm ? 1.0 : 1.6;
            const dy = s.yawTarget - s.yaw;
            s.yaw += dy * (1 - Math.exp(-k * dt));
            s.pitch += (s.pitchTarget - s.pitch) * (1 - Math.exp(-k * dt));
            s.bank = s.calm ? 0 : U.clamp(dy * 0.9, -0.55, 0.55);
            // Accelerated travel between systems; easing back near things.
            const clr = clearance();
            const want = U.clamp((clr - 160) / 200, 1, 16);
            s.boost = U.approach(s.boost, want, want > s.boost ? 0.6 : 2.4, dt);
            s.slow = U.approach(s.slow, s.prompting ? 0.1 : 1, 2.5, dt);
            const speed = BASE_SPEED * s.speedK * s.boost * s.slow;
            s.speedNow = speed;
            s.pos = add(s.pos, mul(forward(), speed * dt));
            pushOut(true);
        }

        function step(dt) {
            if (s.held) return;
            dt = Math.min(dt, 0.1);
            s.time += dt;
            if (s.mode === 'fly') stepFly(dt);
            else if (s.mode === 'travel') stepTravel(dt);
            else if (s.mode === 'orbit') stepOrbit(dt);
            if (s.mode !== 'fly') s.bank = U.approach(s.bank, 0, 3, dt);
            refreshSystem(false);
            s.checkT -= dt;
            if (s.checkT <= 0) { s.checkT = 0.25; checkDiscovery(); }
        }

        return {
            state: s,
            on: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
            place: place,
            step: step,
            turn: turn,
            climb: climb,
            nextStop: nextStop,
            answer: answer,
            enterOrbit: enterOrbit,
            flyTo: flyTo,
            visit: visit,
            leaveOrbit: leaveOrbit,
            orbitRadius: orbitRadius,
            centreOf: centreOf,
            forward: forward,
            setHeld: function (h) { s.held = !!h; },
            setSpeed: function (k) { s.speedK = k; },
            setCalm: function (c) { s.calm = !!c; },
            /** A target object for a moon, in the same shape objectsOf() gives. */
            moonObject: function (planet, moon) {
                return { id: moon.id, kind: 'moon', name: moon.name, sys: null, world: moon, parentWorld: planet, radius: moon.radius, get pos() { return UV.moonPos(planet, moon, s.time); }, trigger: 0, label: moon.label, short: moon.short };
            },
            pitchLimit: function () { return Math.abs(s.pitchTarget) >= PITCH_MAX - 0.01; },
            _vec: { add: add, sub: sub, mul: mul, len: len, norm: norm, dot: dot, cross: cross, forwardOf: forwardOf, anglesOf: anglesOf }
        };
    }

    return { create: create, forwardOf: forwardOf, anglesOf: anglesOf };
})();
