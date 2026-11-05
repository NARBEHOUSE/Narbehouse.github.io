/**
 * NARBE Build n Bash - Ammo.js (Bullet) physics adapter.
 *
 * Modelled on Benny's Ballista's js/physics.js (the same vendored ammo.js
 * build). Nothing outside this file touches Ammo's raw API.
 *
 * Blocks live in two states:
 *   FROZEN   a kinematic body. It never moves by itself, it is never knocked
 *            by debris, and it never needs to balance: a finished build stands
 *            exactly as designed, however top-heavy. Debris bounces off it.
 *   LOOSE    a dynamic body with mass, after a destroyer has hit its chunk.
 *            Bullet's own solver tumbles it from there.
 *
 * Destroyers may add kinematic "movers" (a wrecking ball, a bowling ball) that
 * shove loose blocks around physically. Kinematic bodies never collide with
 * each other, so a mover passing a frozen block does nothing to it.
 *
 * Memory: Ammo objects are compiled C++ and are not garbage collected. Shapes
 * are cached for the session; bodies and motion states are destroyed the
 * moment they are removed. Scratch vectors are reused, never held across frames.
 *
 * Loading: window.Ammo is an Emscripten factory whose .then() is not a real
 * promise (await on it can hang), so init() wraps it, as Ballista does.
 */

window.BNB = window.BNB || {};

BNB.Physics = (function () {
    'use strict';

    const CFG = {
        STEP: 1 / 120,
        MAX_SUBSTEPS: 6,
        FRICTION: 0.62,
        RESTITUTION: 0.22,
        LIN_DAMP: 0.04,
        ANG_DAMP: 0.12,
        DENSITY: 1,
        MIN_MASS: 0.08,
        GROUND_FRICTION: 0.8,
        GROUND_RESTITUTION: 0.2
    };
    const CF_KINEMATIC = 2, DISABLE_DEACTIVATION = 4, ACTIVE = 1;

    let A = null, world = null, ready = null;
    let v0, v1, t0, q0;
    const shapeCache = new Map();
    let ground = [];
    const bodies = new Set();

    function init() {
        if (ready) return ready;
        ready = new Promise(function (resolve, reject) {
            try {
                const factory = window.Ammo;
                if (typeof factory !== 'function') throw new Error('ammo.js did not load');
                factory().then(function (lib) {
                    A = lib;
                    v0 = new A.btVector3(0, 0, 0);
                    v1 = new A.btVector3(0, 0, 0);
                    t0 = new A.btTransform();
                    q0 = new A.btQuaternion(0, 0, 0, 1);
                    const config = new A.btDefaultCollisionConfiguration();
                    const dispatcher = new A.btCollisionDispatcher(config);
                    const broadphase = new A.btDbvtBroadphase();
                    const solver = new A.btSequentialImpulseConstraintSolver();
                    world = new A.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, config);
                    setGravity(22);
                    resolve();
                });
            } catch (e) { reject(e); }
        });
        return ready;
    }

    function setGravity(g) {
        v0.setValue(0, -g, 0);
        world.setGravity(v0);
    }

    // --- shapes ---------------------------------------------------------------------

    function makeShape(desc) {
        switch (desc.type) {
            case 'box': v0.setValue(desc.half[0], desc.half[1], desc.half[2]); return new A.btBoxShape(v0);
            case 'cyl': v0.setValue(desc.r, desc.h / 2, desc.r); return new A.btCylinderShape(v0);
            case 'cylZ': v0.setValue(desc.r, desc.r, desc.w / 2); return new A.btCylinderShapeZ(v0);
            case 'cone': return new A.btConeShape(desc.r, desc.h);
            case 'sphere': return new A.btSphereShape(desc.r);
            case 'hull': {
                const s = new A.btConvexHullShape();
                desc.points.forEach(function (p, i) { v0.setValue(p[0], p[1], p[2]); s.addPoint(v0, i === desc.points.length - 1); });
                return s;
            }
            case 'compound': {
                const c = new A.btCompoundShape();
                desc.parts.forEach(function (part) {
                    t0.setIdentity();
                    v0.setValue(part.offset[0], part.offset[1], part.offset[2]);
                    t0.setOrigin(v0);
                    c.addChildShape(t0, makeShape(part.shape));
                });
                return c;
            }
            default: throw new Error('Unknown collider ' + desc.type);
        }
    }

    function shapeFor(key, desc) {
        let s = shapeCache.get(key);
        if (!s) { s = makeShape(desc); s.setMargin(0.025); shapeCache.set(key, s); }
        return s;
    }

    function blockShape(spec) {
        return shapeFor(spec.s + ':' + spec.d.join(','), BNB.Shapes.collider(spec.s, spec.d));
    }

    // --- bodies ------------------------------------------------------------------------

    function setTransform(t, pos, quat) {
        t.setIdentity();
        v0.setValue(pos.x, pos.y, pos.z);
        t.setOrigin(v0);
        q0.setValue(quat.x, quat.y, quat.z, quat.w);
        t.setRotation(q0);
    }

    function makeBody(shape, mass, pos, quat, kinematic) {
        setTransform(t0, pos, quat);
        const ms = new A.btDefaultMotionState(t0);
        v1.setValue(0, 0, 0);
        if (mass > 0) shape.calculateLocalInertia(mass, v1);
        const info = new A.btRigidBodyConstructionInfo(mass, ms, shape, v1);
        const body = new A.btRigidBody(info);
        A.destroy(info);
        body.setFriction(CFG.FRICTION);
        body.setRestitution(CFG.RESTITUTION);
        if (kinematic) {
            body.setCollisionFlags(body.getCollisionFlags() | CF_KINEMATIC);
            body.setActivationState(DISABLE_DEACTIVATION);
        } else {
            body.setDamping(CFG.LIN_DAMP, CFG.ANG_DAMP);
            body.setSleepingThresholds(0.35, 0.5);
            // Fast debris must not tunnel through the ground.
            body.setCcdMotionThreshold(0.25);
            body.setCcdSweptSphereRadius(0.12);
        }
        world.addRigidBody(body);
        bodies.add(body);
        return body;
    }

    function massOf(spec) {
        return Math.max(CFG.MIN_MASS, BNB.Shapes.volume(spec.s, spec.d) * CFG.DENSITY);
    }

    /** A block that stands where it was built and cannot be knocked. */
    function addFrozen(spec, pos, quat) {
        return makeBody(blockShape(spec), 0, pos, quat, true);
    }

    /**
     * Round blocks would otherwise roll on forever (a toppled cylinder crossed
     * 30+ units). This ammo build's rolling friction has no effect, so the sim
     * raises angular damping while a round block rolls along the ground
     * (rolling(body, true)) and drops it again in the air, so flying pieces
     * still spin. Measured: a 6 units/s roll stops in about 8 units.
     */
    const ROUND = { cyl: true, cone: true, ball: true, wheels: true, half: true };
    function isRound(spec) { return !!ROUND[spec.s]; }
    function rolling(body, on) { body.setDamping(CFG.LIN_DAMP, on ? 0.9 : CFG.ANG_DAMP); }

    /** Swap a frozen block for a loose one, in exactly the same place. */
    function release(body, spec, pos, quat) {
        if (body) remove(body);
        const b = makeBody(blockShape(spec), massOf(spec), pos, quat, false);
        b.activate(true);
        return b;
    }

    /**
     * A kinematic shape a destroyer moves by hand (desc as Shapes.collider
     * returns). Loose blocks it sweeps through are shoved out of its way.
     */
    function addMover(desc, pos, quat) {
        const key = 'mover:' + JSON.stringify(desc);
        const b = makeBody(shapeFor(key, desc), 0, pos, quat || { x: 0, y: 0, z: 0, w: 1 }, true);
        b.setFriction(0.5);
        b.setRestitution(0.4);
        return b;
    }

    function moveKinematic(body, pos, quat) {
        setTransform(t0, pos, quat);
        body.getMotionState().setWorldTransform(t0);
        body.setWorldTransform(t0);
    }

    function remove(body) {
        if (!body || !bodies.has(body)) return;
        bodies.delete(body);
        world.removeRigidBody(body);
        const ms = body.getMotionState();
        if (ms) A.destroy(ms);
        A.destroy(body);
    }

    // --- ground ----------------------------------------------------------------------------

    /**
     * The world's solid ground: 'plane' (a wide slab whose top is y = 0),
     * 'none' (space), or a list of { half: [x,y,z], pos: [x,y,z] } boxes,
     * such as a barge deck with open sea all around.
     */
    function setGround(def) {
        ground.forEach(remove);
        ground = [];
        const boxes = def === 'none' ? [] : def === 'plane' || !def ? [{ half: [120, 1, 120], pos: [0, -1, 0] }] : def;
        boxes.forEach(function (bx) {
            const shape = shapeFor('ground:' + bx.half.join(','), { type: 'box', half: bx.half });
            const b = makeBody(shape, 0, { x: bx.pos[0], y: bx.pos[1], z: bx.pos[2] }, { x: 0, y: 0, z: 0, w: 1 }, false);
            b.setFriction(CFG.GROUND_FRICTION);
            b.setRestitution(CFG.GROUND_RESTITUTION);
            ground.push(b);
        });
    }

    // --- motion ------------------------------------------------------------------------------

    function step(dt) { world.stepSimulation(dt, CFG.MAX_SUBSTEPS, CFG.STEP); }

    /** Copy a body's transform onto an Object3D. */
    function sync(obj, body) {
        const t = body.getCenterOfMassTransform(), p = t.getOrigin(), q = t.getRotation();
        obj.position.set(p.x(), p.y(), p.z());
        obj.quaternion.set(q.x(), q.y(), q.z(), q.w());
    }

    function addVelocity(body, vx, vy, vz, sx, sy, sz) {
        body.activate(true);
        const v = body.getLinearVelocity();
        v0.setValue(v.x() + vx, v.y() + vy, v.z() + vz);
        body.setLinearVelocity(v0);
        if (sx || sy || sz) {
            const a = body.getAngularVelocity();
            v0.setValue(a.x() + (sx || 0), a.y() + (sy || 0), a.z() + (sz || 0));
            body.setAngularVelocity(v0);
        }
    }

    function velocity(body) {
        const v = body.getLinearVelocity();
        return { x: v.x(), y: v.y(), z: v.z() };
    }

    function speed(body) {
        const v = body.getLinearVelocity();
        return Math.hypot(v.x(), v.y(), v.z());
    }

    function setDamping(body, lin, ang) { body.setDamping(lin, ang); }
    function awake(body) { return body.isActive(); }
    function wake(body) { body.activate(true); }

    /** Remove every body except the ground (between builds). */
    function clear() {
        Array.from(bodies).forEach(function (b) { if (ground.indexOf(b) < 0) remove(b); });
    }

    return {
        CFG: CFG,
        init: init,
        ready: function () { return !!world; },
        setGravity: setGravity,
        setGround: setGround,
        addFrozen: addFrozen,
        release: release,
        addMover: addMover,
        moveKinematic: moveKinematic,
        remove: remove,
        step: step,
        sync: sync,
        addVelocity: addVelocity,
        velocity: velocity,
        speed: speed,
        setDamping: setDamping,
        isRound: isRound,
        rolling: rolling,
        awake: awake,
        wake: wake,
        clear: clear,
        massOf: massOf,
        count: function () { return bodies.size; }
    };
})();
