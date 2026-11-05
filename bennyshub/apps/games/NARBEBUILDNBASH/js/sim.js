/**
 * NARBE Build n Bash - the simulation: one build in one world.
 *
 * Owns the Three.js scene graph (world, blocks, destroyers, effects) and the
 * physics, and advances them in update(dt). It draws nothing itself: the
 * browser's js/stage.js renders it with WebGL, and the Node tools render the
 * very same scene on the CPU, so everything here runs headless.
 *
 * Life of a build:
 *   load(id)        an empty plot in the build's world
 *   addBlock()      one Build press: the next block flies in and lands
 *   destroy()       one Destroy press: a destroyer knocks the next chunk loose
 *   (all chunks)    'allDown' fires once the rubble settles
 *   clearRubble()   rubble poofs away, ready to build again
 *
 * Events (on(name, fn)): place, land, complete, bashStart, bashEnd, allDown,
 * tok (a block clattering), sound (a named effect), cleared.
 */

window.BNB = window.BNB || {};

BNB.Sim = (function () {
    'use strict';

    let THREE = null, scene = null, blockRoot = null, bashRoot = null;
    let skyDome = null, sun = null, hemi = null, worldInst = null, build = null;
    let recs = [], placed = 0, state = 'empty', plan = null, chunkNo = 0;
    let basher = null, basherInfo = null, queued = 0, bag = [], lastType = null;
    let time = 0, settleT = 0, lastTokAt = -1, clearing = null;
    let ghost = null, ghostOn = false, frame = null, seed = 1;
    let spinT = 0, spinAngle = [];
    let SPIN_AXES = null;
    let rand = Math.random;
    const handlers = {};
    const shakeState = { amt: 0, left: 0 };
    let focusHint = null;
    const opts = { chunked: true, calm: false, pieceNames: true };

    function on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); }
    function emit(name, data) { (handlers[name] || []).forEach(fn => { try { fn(data); } catch (e) { console.warn('[BNB] ' + name + ' handler', e); } }); }

    function mulberry(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // --- setup ------------------------------------------------------------------------

    function init(three, o) {
        THREE = three;
        o = o || {};
        seed = o.seed || ((Math.random() * 1e9) | 0);
        rand = mulberry(seed);
        SPIN_AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
        scene = new THREE.Scene();
        blockRoot = new THREE.Group(); blockRoot.name = 'blocks';
        bashRoot = new THREE.Group(); bashRoot.name = 'bashers';
        scene.add(blockRoot, bashRoot);
        const lights = makeLights();
        hemi = lights.hemi;
        sun = lights.sun;
        scene.add(hemi, sun, sun.target);
        BNB.FX.init(THREE, scene, { rand: rand });
        return scene;
    }

    function setOptions(o) {
        Object.assign(opts, o || {});
        BNB.FX.setCalm(!!opts.calm);
    }

    function makeSky(colors) {
        const g = new THREE.SphereGeometry(400, 32, 16);
        const c0 = new THREE.Color(colors[0]), c1 = new THREE.Color(colors[1]), c2 = new THREE.Color(colors[2]);
        const pos = g.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
            let e = pos.getY(i) / 400;
            e = e < 0 ? 0 : e;
            const t = 1 - Math.pow(e, 0.72);
            if (t < 0.55) c.copy(c0).lerp(c1, t / 0.55); else c.copy(c1).lerp(c2, (t - 0.55) / 0.45);
            cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
        m.renderOrder = -10;
        m.frustumCulled = false;
        return m;
    }

    /**
     * Frame the whole finished build: centre, radius, and the view direction.
     * The camera sits at centre + camDist * (sin az cos el, sin el, cos az cos el),
     * az/el in degrees (az -24 = a little to the left of straight on).
     */
    const FOV = 40;
    function computeFrame(winfo, b) {
        b = b || build;
        const e = BNB.Builds.extent(b);
        const cx = (e.min[0] + e.max[0]) / 2, cz = (e.min[2] + e.max[2]) / 2;
        const hgt = e.max[1] - Math.min(0, e.min[1]);
        const cy = winfo.zeroG ? (e.min[1] + e.max[1]) / 2 : Math.max(0.6, hgt * 0.42);
        const radius = Math.max(2.2, Math.hypot(e.max[0] - e.min[0], e.max[2] - e.min[2]) * 0.5, hgt * 0.62);
        // A low camera (11 degrees) so each world's sky and skyline show above the build.
        const cam = Object.assign({ az: -24, el: 11, dist: 1.2 }, winfo.camera || {}, b.camera || {});
        const camDist = radius / Math.sin(FOV / 2 * Math.PI / 180) * 1.02 * cam.dist;
        return { center: new THREE.Vector3(cx, cy, cz), radius: radius, az: cam.az, el: cam.el, dist: cam.dist, camDist: camDist, fov: FOV, height: hgt };
    }

    /** Light, sky and fog a scene for a world instance (shared by the game and the thumbnails). */
    function dress(sc, w, f, b, lights) {
        sc.fog = w.fog ? new THREE.Fog(w.fog.color, w.fog.near, w.fog.far) : null;
        sc.background = new THREE.Color(w.sky[2]);
        const L = w.light || {};
        lights.hemi.color.set(L.sky || '#dfefff'); lights.hemi.groundColor.set(L.ground || '#8a7a5a');
        lights.hemi.intensity = L.hemi === undefined ? 1.2 : L.hemi;
        lights.sun.color.set(L.sun || '#fff2d8'); lights.sun.intensity = L.sunIntensity === undefined ? 2.6 : L.sunIntensity;
        const dir = new THREE.Vector3().fromArray(L.dir || [-0.55, 1, 0.45]).normalize();
        lights.sun.target.position.copy(f.center).setY(0);
        lights.sun.position.copy(lights.sun.target.position).addScaledVector(dir, 30);
        const R = Math.max(8, BNB.Builds.plotRadius(b) + 5);
        Object.assign(lights.sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 70 });
        lights.sun.shadow.camera.updateProjectionMatrix();
    }

    function makeLights() {
        const h = new THREE.HemisphereLight(0xdfefff, 0x8a7a5a, 1.2);
        const s = new THREE.DirectionalLight(0xfff2d8, 2.6);
        s.castShadow = true;
        s.shadow.mapSize.set(2048, 2048);
        s.shadow.bias = -0.0004;
        s.shadow.normalBias = 0.02;
        return { hemi: h, sun: s };
    }

    /**
     * A separate, finished, frozen copy of a build in its world: a scene of its
     * own for Build Select pictures. No physics, no effects. Call dispose() after.
     */
    function diorama(id, o) {
        o = o || {};
        const b = BNB.Builds.get(id);
        const winfo = BNB.Worlds.info(b.world) || {};
        const f = computeFrame(winfo, b);
        const sc = new THREE.Scene();
        const w = BNB.Worlds.create(b.world, {
            THREE: THREE, rand: mulberry(seed ^ 0x51ed), plot: BNB.Builds.plotRadius(b), quality: o.quality || 'high',
            view: { az: f.az, el: f.el, dist: f.camDist, center: f.center.clone() }
        });
        const lights = makeLights();
        sc.add(lights.hemi, lights.sun, lights.sun.target, w.group);
        const sky = makeSky(w.sky);
        sc.add(sky);
        dress(sc, w, f, b, lights);
        b.blocks.forEach(spec => sc.add(BNB.Shapes.mesh(THREE, spec)));
        if (w.update) w.update(0.016, 3);
        return {
            scene: sc, frame: f, world: w,
            dispose: function () { w.dispose(); sky.geometry.dispose(); sky.material.dispose(); lights.sun.dispose(); }
        };
    }

    /** Where the camera sits for a frame (az/el offsets in degrees, distance multiplier). */
    function cameraPos(f, dAz, dEl, dMul) {
        const az = (f.az + (dAz || 0)) * Math.PI / 180, el = (f.el + (dEl || 0)) * Math.PI / 180, d = f.camDist * (dMul || 1);
        return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d).add(f.center);
    }

    /** Load a build's world with an empty plot. */
    function load(id, o) {
        o = o || {};
        disposeBuild();
        build = BNB.Builds.get(id);
        if (!build) throw new Error('No build ' + id);
        if (worldInst) { scene.remove(worldInst.group); worldInst.dispose(); }
        if (skyDome) { scene.remove(skyDome); skyDome.geometry.dispose(); skyDome.material.dispose(); }
        const worldId = o.world || build.world;   // o.world: preview a build in another world (dev tools)
        frame = computeFrame(BNB.Worlds.info(worldId) || {});
        worldInst = BNB.Worlds.create(worldId, {
            THREE: THREE, rand: mulberry(seed ^ 0x51ed), plot: BNB.Builds.plotRadius(build), quality: o.quality || 'high',
            view: { az: frame.az, el: frame.el, dist: frame.camDist, center: frame.center.clone() }
        });
        scene.add(worldInst.group);
        skyDome = makeSky(worldInst.sky);
        scene.add(skyDome);
        dress(scene, worldInst, frame, build, { hemi: hemi, sun: sun });
        if (BNB.Physics.ready()) {
            BNB.Physics.setGravity(worldInst.zeroG ? 0 : (worldInst.gravity || 22));
            BNB.Physics.setGround(worldInst.zeroG ? 'none' : (worldInst.ground || 'plane'));
        }
        state = 'empty';
        emit('loaded', { id: id });
    }

    function disposeBuild() {
        if (basher) { try { basher.dispose(); } catch (e) { /* ignore */ } basher = null; }
        clearBashRoot();
        recs.forEach(r => { if (r.body) BNB.Physics.remove(r.body); blockRoot.remove(r.mesh); });
        recs = []; placed = 0; plan = null; chunkNo = 0; queued = 0; clearing = null; basherInfo = null;
        focusHint = null; shakeState.amt = 0; shakeState.left = 0;
        spinT = 0; spinAngle = [];
        if (ghost) { blockRoot.remove(ghost); ghost = null; }
        if (BNB.Physics.ready()) BNB.Physics.clear();
        BNB.FX.clear();
        state = 'empty';
    }

    function clearBashRoot() {
        if (!bashRoot) return;
        for (let i = bashRoot.children.length - 1; i >= 0; i--) {
            const c = bashRoot.children[i];
            bashRoot.remove(c);
            c.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
        }
    }

    // --- building ---------------------------------------------------------------------

    function total() { return build ? build.blocks.length : 0; }
    function canBuild() { return !!build && placed < total() && (state === 'empty' || state === 'building'); }

    function makeRec(i) {
        const spec = build.blocks[i];
        const mesh = BNB.Shapes.mesh(THREE, spec);
        mesh.userData.block = i;
        const rec = {
            i: i, spec: spec, mesh: mesh, body: null, state: 'flying', t: 0,
            toPos: mesh.position.clone(), toQuat: mesh.quaternion.clone(),
            halfY: (BNB.Builds.relations(build.blocks).bounds[i].max[1] - BNB.Builds.relations(build.blocks).bounds[i].min[1]) / 2,
            squash: -1, prevV: null, lastTok: -1, fade: -1, wet: false
        };
        return rec;
    }

    /** One Build press. Returns the block index, or -1 if nothing more can be built. */
    function addBlock(o) {
        if (!canBuild()) return -1;
        const i = placed++;
        const rec = makeRec(i);
        const instant = o && o.instant;
        if (instant) {
            land(rec, true);
        } else {
            const zeroG = !!worldInst.zeroG;
            if (zeroG) {
                const a = rand() * Math.PI * 2, e = (rand() - 0.5) * 1.2;
                rec.from = rec.toPos.clone().add(new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(7 + rand() * 3));
                rec.dur = 0.7;
            } else {
                rec.from = rec.toPos.clone().add(new THREE.Vector3((rand() - 0.5) * 2.6, 4.2 + rec.halfY + rand() * 1.2, (rand() - 0.5) * 1.6));
                rec.dur = 0.52;
            }
            const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
            rec.fromQuat = rec.toQuat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, (0.7 + rand() * 0.9) * (rand() < 0.5 ? -1 : 1)));
            rec.mesh.position.copy(rec.from);
            rec.mesh.quaternion.copy(rec.fromQuat);
        }
        blockRoot.add(rec.mesh);
        recs.push(rec);
        if (state === 'empty') state = 'building';
        updateGhost();
        emit('place', { i: i, spec: rec.spec, last: placed === total() });
        return i;
    }

    function easeOutCubic(u) { return 1 - Math.pow(1 - u, 3); }

    function land(rec, quiet) {
        rec.state = 'frozen';
        rec.mesh.position.copy(rec.toPos);
        rec.mesh.quaternion.copy(rec.toQuat);
        rec.mesh.scale.set(1, 1, 1);
        if (BNB.Physics.ready()) rec.body = BNB.Physics.addFrozen(rec.spec, rec.toPos, rec.toQuat);
        if (!quiet) {
            rec.squash = 0;
            const b = BNB.Builds.relations(build.blocks).bounds[rec.i];
            const size = Math.cbrt(BNB.Shapes.volume(rec.spec.s, rec.spec.d));
            if (worldInst.zeroG) BNB.FX.twinkle(rec.toPos.x, rec.toPos.y, rec.toPos.z, 8, '#bfe3ff');
            else BNB.FX.dust((b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2, 5 + Math.round(size * 4), 0.35 + size * 0.25, worldInst.dust);
            emit('land', { i: rec.i, spec: rec.spec, size: size, zeroG: !!worldInst.zeroG });
        }
        if (placed === total() && recs.every(r => r.state !== 'flying') && (state === 'building' || state === 'empty')) {
            state = 'complete';
            updateGhost();
            if (!quiet) {
                const e = BNB.Builds.extent(build);
                BNB.FX.party((e.min[0] + e.max[0]) / 2, e.max[1] + 1.5, (e.min[2] + e.max[2]) / 2, Math.max(2, frame.radius), 150);
                emit('complete', { id: build.id, name: build.name });
            }
        }
    }

    /** Place every block at once, silently (menus, thumbnails, tests). */
    function showFinished() {
        while (canBuild()) addBlock({ instant: true });
    }

    function setGhost(on) { ghostOn = !!on; updateGhost(); }

    function updateGhost() {
        const show = ghostOn && canBuild();
        if (!show) { if (ghost) ghost.visible = false; return; }
        const spec = build.blocks[placed];
        if (!ghost || ghost.userData.forBlock !== placed) {
            if (ghost) blockRoot.remove(ghost);
            ghost = new THREE.Mesh(BNB.Shapes.geometry(THREE, spec.s, spec.d), BNB.Shapes.ghostMaterial(THREE));
            BNB.Shapes.place(ghost, spec);
            ghost.userData.forBlock = placed;
            ghost.renderOrder = 3;
            blockRoot.add(ghost);
        }
        ghost.visible = true;
    }

    // --- destroying ----------------------------------------------------------------------

    function eligibleTypes() {
        return BNB.Bashers.TYPES.filter(t => !(worldInst.zeroG && t.ground) && !(worldInst.noSky && t.sky));
    }

    function pickBasher(force) {
        if (force) return force;
        if (!bag.length) {
            bag = eligibleTypes().map(t => t.id);
            for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
            if (bag.length > 1 && bag[bag.length - 1] === lastType) { const t = bag[0]; bag[0] = bag[bag.length - 1]; bag[bag.length - 1] = t; }
        }
        return bag.pop();
    }

    /** One Destroy press. Returns { type, name, say, index, count, final } or null. */
    function destroy(o) {
        o = o || {};
        if (!build || placed === 0) return null;
        if (state === 'settling' || state === 'down' || state === 'clearing') return null;
        if (basher) {
            if (plan && chunkNo + queued < plan.length && queued < 1) { queued++; return { queued: true }; }
            return null;
        }
        if (!plan) {
            recs.forEach(r => { if (r.state === 'flying') land(r, true); });
            plan = BNB.Chunks.plan(build.blocks, placed, { chunked: opts.chunked, seed: (rand() * 1e9) | 0 });
            chunkNo = 0;
            state = 'bashing';
            updateGhost();
        }
        if (chunkNo >= plan.length) return null;
        return startChunk(o.type);
    }

    function boundsOf(ids) {
        const rel = BNB.Builds.relations(build.blocks);
        const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        ids.forEach(i => {
            const b = rel.bounds[i];
            min.min(new THREE.Vector3().fromArray(b.min));
            max.max(new THREE.Vector3().fromArray(b.max));
        });
        const center = min.clone().add(max).multiplyScalar(0.5), size = max.clone().sub(min);
        return { min: min, max: max, center: center, size: size };
    }

    function startChunk(forceType) {
        const chunk = plan[chunkNo++];
        const frozenIds = recs.filter(r => r.state === 'frozen').map(r => r.i);
        const type = pickBasher(forceType);
        lastType = type;
        const def = BNB.Bashers.get(type);
        const ctx = makeCtx(chunk, frozenIds);
        basher = def.create(ctx);
        basherInfo = { type: type, name: def.name, say: def.say, index: chunkNo, count: plan.length, final: !!chunk.final, chunk: chunk, ctx: ctx, t: 0 };
        emit('bashStart', basherInfo);
        return basherInfo;
    }

    function releaseRec(rec) {
        if (rec.state !== 'frozen') return false;
        rec.state = 'loose';
        if (BNB.Physics.ready()) rec.body = BNB.Physics.release(rec.body, rec.spec, rec.mesh.position, rec.mesh.quaternion);
        else rec.fb = { v: new THREE.Vector3(), w: new THREE.Vector3() };   // no physics engine: simple fallback motion
        rec.prevV = null;
        return true;
    }

    /** Add velocity and spin to a loose block, real physics or fallback. */
    function addVel(r, vx, vy, vz, sx, sy, sz) {
        if (r.body) BNB.Physics.addVelocity(r.body, vx, vy, vz, sx || 0, sy || 0, sz || 0);
        else if (r.fb) { r.fb.v.x += vx; r.fb.v.y += vy; r.fb.v.z += vz; r.fb.w.x += sx || 0; r.fb.w.y += sy || 0; r.fb.w.z += sz || 0; }
    }

    function speedOf(r) { return r.body ? BNB.Physics.speed(r.body) : r.fb ? r.fb.v.length() : 0; }

    /**
     * Without ammo.js (it failed to load), loose blocks still fly, fall,
     * bounce on the ground and settle: no block-to-block collisions, but the
     * knock-down still reads and the game never sticks.
     */
    const fbAxis = { v: null };
    function fallback(r, dt) {
        const f = r.fb, p = r.mesh.position;
        if (!worldInst.zeroG) f.v.y -= (worldInst.gravity || 22) * dt;
        p.addScaledVector(f.v, dt);
        const w = f.w.length();
        if (w > 1e-4) {
            fbAxis.v = fbAxis.v || new THREE.Vector3();
            r.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(fbAxis.v.copy(f.w).divideScalar(w), w * dt));
        }
        if (!worldInst.zeroG && p.y < r.halfY) {
            p.y = r.halfY;
            if (f.v.y < 0) f.v.y = -f.v.y * 0.25;
            f.v.x *= 0.7; f.v.z *= 0.7; f.w.multiplyScalar(0.6);
            if (Math.abs(f.v.y) < 0.5) f.v.y = 0;
        }
        f.v.multiplyScalar(Math.exp(-0.15 * dt));
    }

    /** What a destroyer can see and do. See js/bashers.js for the contract. */
    function makeCtx(chunk, frozenIds) {
        const inChunk = new Set(chunk.ids);
        const cb = boundsOf(chunk.ids), sb = boundsOf(frozenIds);
        const restIds = frozenIds.filter(i => !inChunk.has(i));
        const rest = restIds.length ? boundsOf(restIds) : null;
        // How far a destroyer coming from the chunk's side may travel before it
        // would run into blocks that must stay standing.
        const rel = BNB.Builds.relations(build.blocks);
        let stop;
        if (!rest) stop = chunk.side < 0 ? cb.max.x + 1.5 : cb.min.x - 1.5;
        else if (chunk.side < 0) stop = Math.min.apply(null, restIds.map(i => rel.bounds[i].min[0]));
        else stop = Math.max.apply(null, restIds.map(i => rel.bounds[i].max[0]));
        const enter = chunk.side < 0 ? cb.min.x : cb.max.x;
        const movers = [];
        const tmp = new THREE.Vector3();
        const ctx = {
            THREE: THREE,
            root: bashRoot,
            rand: rand,
            zeroG: !!worldInst.zeroG,
            /** This world's gravity (units/s²): 22 normally, lower on the planet, 0 in space. */
            gravity: worldInst.zeroG ? 0 : (worldInst.gravity || 22),
            water: worldInst.water === undefined ? null : worldInst.water,
            groundY: 0,
            plot: BNB.Builds.plotRadius(build),
            chunk: { ids: chunk.ids.slice(), side: chunk.side, final: !!chunk.final, min: cb.min, max: cb.max, center: cb.center, size: cb.size, enter: enter, stop: stop },
            structure: sb,
            rest: rest,
            fx: BNB.FX,
            calm: !!opts.calm,
            /** Loosen chunk blocks: all still frozen (no argument), or a list of block ids. */
            release: function (ids) {
                let n = 0;
                (ids || chunk.ids).forEach(i => { const r = recs[i]; if (r && inChunk.has(i) && releaseRec(r)) n++; });
                if (n) emit('released', { count: n });
                return n;
            },
            /** Loosen the chunk blocks for which test(centre, id, min, max) is true. */
            releaseWhere: function (test) {
                const rel = BNB.Builds.relations(build.blocks), ids = [];
                chunk.ids.forEach(i => {
                    const r = recs[i];
                    if (r && r.state === 'frozen') {
                        const b = rel.bounds[i];
                        if (test(r.mesh.position, i, b.min, b.max)) ids.push(i);
                    }
                });
                // Anything resting on a released block goes with it.
                if (ids.length) {
                    const more = BNB.Builds.dependents(build.blocks, ids, placed);
                    more.forEach(i => { if (inChunk.has(i) && ids.indexOf(i) < 0 && recs[i].state === 'frozen') ids.push(i); });
                }
                return ctx.release(ids);
            },
            /** A block's mass (heavier blocks should be shoved less). */
            mass: function (id) { return recs[id] ? BNB.Physics.massOf(recs[id].spec) : 1; },
            /** Is this block loose (knocked, tumbling)? */
            isLoose: function (id) { return !!recs[id] && recs[id].state === 'loose'; },
            /** Add velocity (and spin) to a loose block. */
            push: function (id, vx, vy, vz, sx, sy, sz) {
                const r = recs[id];
                if (!r || r.state !== 'loose') return;
                addVel(r, vx, vy, vz, sx, sy, sz);
            },
            /**
             * For every loose block within `radius` of `point`, fn(id, pos, dist, dir)
             * may return [vx, vy, vz, sx?, sy?, sz?] to add. dir points from `point` to the block.
             */
            pushNear: function (point, radius, fn) {
                let n = 0;
                recs.forEach(r => {
                    if (r.state !== 'loose' || (!r.body && !r.fb)) return;
                    tmp.copy(r.mesh.position).sub(point);
                    const d = tmp.length();
                    if (d > radius) return;
                    const dir = d > 1e-4 ? tmp.clone().divideScalar(d) : new THREE.Vector3(0, 1, 0);
                    const v = fn(r.i, r.mesh.position, d, dir);
                    if (v) { addVel(r, v[0], v[1], v[2], v[3], v[4], v[5]); n++; }
                });
                return n;
            },
            /** Call fn(id, pos, isChunk) for every loose block. */
            eachLoose: function (fn) { recs.forEach(r => { if (r.state === 'loose') fn(r.i, r.mesh.position, inChunk.has(r.i)); }); },
            /** Current positions of this chunk's blocks (frozen or loose). */
            chunkBlocks: function () { return chunk.ids.map(i => ({ id: i, pos: recs[i].mesh.position, loose: recs[i].state === 'loose' })); },
            /** A kinematic collider that shoves loose blocks: desc like { type: 'sphere', r }. */
            mover: function (desc, pos, quat) {
                if (!BNB.Physics.ready()) return { set: function () {}, remove: function () {} };
                const body = BNB.Physics.addMover(desc, pos, quat);
                const m = {
                    set: function (p, q) { BNB.Physics.moveKinematic(body, p, q || { x: 0, y: 0, z: 0, w: 1 }); },
                    remove: function () { const k = movers.indexOf(m); if (k >= 0) movers.splice(k, 1); BNB.Physics.remove(body); }
                };
                movers.push(m);
                return m;
            },
            /** Camera shake, 0..1 strength (ignored with Calm motion). */
            shake: function (amount, seconds) {
                if (opts.calm) return;
                shakeState.amt = Math.max(shakeState.amt, Math.min(1, amount));
                shakeState.left = Math.max(shakeState.left, seconds || 0.35);
            },
            /** Play one of the named effects in js/sound.js. */
            sound: function (name, gain) { emit('sound', { name: name, gain: gain === undefined ? 1 : gain }); },
            /** Ask the camera to look toward a point (null to let go). distMul > 1 pulls back. */
            focus: function (point, distMul) { focusHint = point ? { point: point.clone(), dist: distMul || 1 } : null; },
            _movers: movers
        };
        return ctx;
    }

    function endBash() {
        const info = basherInfo;
        try { basher.dispose(); } catch (e) { console.warn('[BNB] basher dispose', e); }
        if (info && info.ctx) info.ctx._movers.slice().forEach(m => m.remove());
        basher = null;
        clearBashRoot();
        focusHint = null;
        // Safety: nothing in a finished chunk may stay frozen.
        if (info) {
            info.chunk.ids.forEach(i => {
                const r = recs[i];
                if (r && releaseRec(r)) addVel(r, (rand() - 0.5) * 3, 2 + rand() * 2, (rand() - 0.5) * 3, rand() * 4, rand() * 4, rand() * 4);
            });
        }
        emit('bashEnd', info);
        if (info && info.final) { state = 'settling'; settleT = 0; }
        else if (queued > 0) { queued--; startChunk(); }
    }

    // --- rubble --------------------------------------------------------------------------

    /** Poof every block away (Build Again). Fires 'cleared' when done. */
    function clearRubble() {
        if (state === 'clearing') return;
        if (basher) { basher.dispose(); basher = null; clearBashRoot(); }
        state = 'clearing';
        clearing = { t: 0 };
        const ordered = recs.slice().sort((a, b) => a.mesh.position.y - b.mesh.position.y);
        ordered.forEach((r, k) => { r.poofAt = Math.min(0.9, k * 0.025); });
        emit('sound', { name: 'poof', gain: 0.8 });
    }

    // --- per frame -----------------------------------------------------------------------------

    function update(dt) {
        if (!scene) return;
        dt = Math.min(dt, 1 / 20);
        time += dt;

        // Flying blocks.
        recs.forEach(r => {
            if (r.state === 'flying') {
                r.t += dt;
                const u = Math.min(1, r.t / r.dur);
                if (worldInst.zeroG) {
                    r.mesh.position.lerpVectors(r.from, r.toPos, easeOutCubic(u));
                } else {
                    const h = easeOutCubic(u), v = u * u;
                    r.mesh.position.set(r.from.x + (r.toPos.x - r.from.x) * h, r.from.y + (r.toPos.y - r.from.y) * v, r.from.z + (r.toPos.z - r.from.z) * h);
                }
                r.mesh.quaternion.slerpQuaternions(r.fromQuat, r.toQuat, easeOutCubic(Math.min(1, u * 1.15)));
                if (u >= 1) land(r);
            } else if (r.squash >= 0) {
                r.squash += dt;
                const u = Math.min(1, r.squash / 0.3), k = Math.sin(u * Math.PI * 2) * (1 - u);
                const sy = 1 - 0.16 * k, sx = 1 + 0.08 * k;
                if (r.state === 'frozen') {
                    r.mesh.scale.set(sx, sy, sx);
                    r.mesh.position.y = r.toPos.y + (sy - 1) * r.halfY;
                }
                if (u >= 1) { r.squash = -1; r.mesh.scale.set(1, 1, 1); if (r.state === 'frozen') r.mesh.position.copy(r.toPos); }
            }
        });

        if (ghost && ghost.visible) ghost.material.opacity = 0.16 + 0.14 * (0.5 + 0.5 * Math.sin(time * 4));

        // A finished build's moving parts (a Ferris wheel, a carousel) turn gently.
        if (state === 'complete' && build.spin) {
            spinT += dt;
            const ease = Math.min(1, spinT / 2.5);
            build.spin.forEach(function (g, k) {
                spinAngle[k] = (spinAngle[k] || 0) + g.speed * ease * ease * dt;
                const axis = SPIN_AXES[g.axis || 'y'], centre = new THREE.Vector3().fromArray(g.center);
                const q = new THREE.Quaternion().setFromAxisAngle(axis, spinAngle[k]);
                const level = g.upright || [];
                g.ids.concat(level).forEach(function (i) {
                    const r = recs[i];
                    if (!r || r.state !== 'frozen' || r.squash >= 0) return;
                    r.mesh.position.copy(r.toPos).sub(centre).applyQuaternion(q).add(centre);
                    // Cabins ride round but stay level; everything else turns with the wheel.
                    if (level.indexOf(i) >= 0) r.mesh.quaternion.copy(r.toQuat);
                    else r.mesh.quaternion.copy(q).multiply(r.toQuat);
                    if (r.body) BNB.Physics.moveKinematic(r.body, r.mesh.position, r.mesh.quaternion);
                });
            });
        }

        // Destroyer.
        if (basher) {
            basherInfo.t += dt;
            let running = true;
            try { running = basher.update(dt) !== false; } catch (e) { console.warn('[BNB] basher update', e); running = false; }
            if (basherInfo.t > 12) running = false;   // a stuck destroyer never strands the player
            if (!running) endBash();
        }

        if (BNB.Physics.ready()) BNB.Physics.step(dt);

        // Loose blocks follow their bodies.
        const water = worldInst && worldInst.water !== undefined && worldInst.water !== null ? worldInst.water : null;
        recs.forEach(r => {
            if (r.state !== 'loose' || (!r.body && !r.fb)) return;
            let v;
            if (r.body) { BNB.Physics.sync(r.mesh, r.body); v = BNB.Physics.velocity(r.body); }
            else { fallback(r, dt); v = { x: r.fb.v.x, y: r.fb.v.y, z: r.fb.v.z }; }
            if (r.prevV) {
                const dv = Math.hypot(v.x - r.prevV.x, v.y - r.prevV.y, v.z - r.prevV.z);
                if (dv > 2.6 && time - r.lastTok > 0.14 && time - lastTokAt > 0.035) {
                    r.lastTok = time; lastTokAt = time;
                    emit('tok', { gain: Math.min(1, dv / 14), size: Math.cbrt(BNB.Shapes.volume(r.spec.s, r.spec.d)) });
                }
            }
            r.prevV = v;
            // Round pieces: brake their rolling once they are on the ground, spin freely in the air.
            if (r.body && !r.wet && BNB.Physics.isRound(r.spec) && !worldInst.zeroG) {
                const grounded = Math.abs(v.y) < 1.2 && time - (r.airAt || 0) > 0.25;
                if (Math.abs(v.y) >= 1.2) r.airAt = time;
                if (grounded !== !!r.rolling) { r.rolling = grounded; BNB.Physics.rolling(r.body, grounded); }
            }
            const p = r.mesh.position;
            if (water !== null && !r.wet && p.y < water - 0.1) {
                r.wet = true;
                BNB.FX.splash(p.x, water, p.z, 0.8);
                emit('sound', { name: 'splash', gain: 0.6 });
                if (r.body) BNB.Physics.setDamping(r.body, 0.92, 0.85);
                r.fade = 1.8;
            }
            const far = worldInst.zeroG ? p.length() > 30 : (Math.abs(p.x) > 48 || Math.abs(p.z) > 48 || p.y < -12);
            if (far && r.fade < 0) r.fade = 0.01;
        });

        // Fading blocks (fallen in the sea, flown far away).
        recs.forEach(r => {
            if (r.fade < 0 || r.state === 'gone') return;
            r.fade -= dt;
            if (r.fade <= 0.4) {
                const s = Math.max(0.001, r.fade / 0.4);
                r.mesh.scale.set(s, s, s);
            }
            if (r.fade <= 0) { r.state = 'gone'; r.mesh.visible = false; if (r.body) { BNB.Physics.remove(r.body); r.body = null; } }
        });

        // Settling after the last chunk.
        if (state === 'settling') {
            settleT += dt;
            const moving = recs.some(r => r.state === 'loose' && speedOf(r) > 0.6);
            if (settleT > (worldInst.zeroG ? 2.4 : 3.6) || (settleT > 1.4 && !moving)) {
                state = 'down';
                emit('allDown', { id: build.id });
            }
        }

        // Poofing rubble away.
        if (clearing) {
            clearing.t += dt;
            let left = 0;
            recs.forEach(r => {
                if (r.state === 'gone') return;
                const u = (clearing.t - r.poofAt) / 0.28;
                if (u < 0) { left++; return; }
                if (!r.poofed) {
                    r.poofed = true;
                    if (r.body) { BNB.Physics.remove(r.body); r.body = null; }
                    BNB.FX.dust(r.mesh.position.x, r.mesh.position.y - 0.2, r.mesh.position.z, 4, 0.6, '#ffffff');
                }
                const s = Math.max(0.001, 1 - u);
                r.mesh.scale.set(s, s, s);
                if (u >= 1) { r.state = 'gone'; r.mesh.visible = false; } else left++;
            });
            if (!left) {
                const id = build.id;
                clearing = null;
                recs.forEach(r => blockRoot.remove(r.mesh));
                recs = []; placed = 0; plan = null; chunkNo = 0; queued = 0;
                spinT = 0; spinAngle = [];
                state = 'empty';
                updateGhost();
                emit('cleared', { id: id });
            }
        }

        // Camera shake decays.
        if (shakeState.left > 0) { shakeState.left -= dt; if (shakeState.left <= 0) shakeState.amt = 0; }
        else shakeState.amt *= Math.exp(-6 * dt);

        if (worldInst && worldInst.update) worldInst.update(dt, time);
        BNB.FX.update(dt);
    }

    return {
        init: init,
        setOptions: setOptions,
        on: on,
        load: load,
        addBlock: addBlock,
        showFinished: showFinished,
        destroy: destroy,
        clearRubble: clearRubble,
        setGhost: setGhost,
        update: update,
        dispose: disposeBuild,
        scene: function () { return scene; },
        world: function () { return worldInst; },
        build: function () { return build; },
        frame: function () { return frame; },
        cameraPos: cameraPos,
        diorama: diorama,
        /** The picture is shifted so the build sits this far (of the height) below centre: more sky shows. */
        VIEW_SHIFT_Y: 0.09,
        state: function () { return state; },
        placed: function () { return placed; },
        total: total,
        canBuild: canBuild,
        canDestroy: function () { return !!build && placed > 0 && (state === 'building' || state === 'complete' || state === 'bashing') && (!plan || chunkNo + queued < plan.length); },
        busy: function () { return !!basher; },
        chunksLeft: function () { return plan ? plan.length - chunkNo : BNB.Chunks.presses(placed, opts.chunked); },
        shake: function () { return shakeState.amt; },
        focus: function () { return focusHint; },
        sun: function () { return sun; },
        time: function () { return time; },
        blocks: function () { return recs; },
        basher: function () { return basherInfo; }
    };
})();
