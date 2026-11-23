/**
 * NARBE Space Explorer - rare sights out in space: comets and star whales.
 *
 * Both come from the system's seed (NSE.Universe makeSystem: sys.comet, sys.whales), so the
 * same system always has the same comet or the same pod, and both are drawn in the space scene
 * (NSE.Space.scene()).
 *
 *   A comet sweeps slowly round its star on a long oval: an icy nucleus in a glowing coma, a
 *   straight blue ion tail and a broad curved dust tail, both always pointing away from the
 *   star (as real comet tails do). Found when it is on screen and not too far away.
 *
 *   Star whales (most often in glowing nebulae) swim up beside the ship a little while after it
 *   flies into their system, keep it company for half a minute, singing, and swim on. A soft
 *   glowing pod of three to five, a calf among them, with starry speckles on their backs and slow
 *   up-and-down tail strokes. Found when they are on screen.
 *
 * Calm and friendly: no fast movement, nothing comes straight at the camera, and with Motion:
 * Calm the whales swim more slowly still. Lambert/Basic materials only; a few draw calls each.
 */

window.NSE = window.NSE || {};

NSE.Sights = (function () {
    'use strict';

    const U = NSE.Util;
    let THREE = null, scene = null;
    let sys = null, comet = null, pod = null;
    let inSysT = 0, podDone = false, checkT = 0, songT = 0, t = 0;
    let onFound = null;
    const told = {};

    function ready() {
        if (THREE && scene) return true;
        THREE = window.THREE || null;
        scene = NSE.Space && NSE.Space.scene ? NSE.Space.scene() : null;
        return !!(THREE && scene);
    }

    function quality() { try { return NSE.Stage.qualityLevel(); } catch (e) { return 'standard'; } }

    // --- shared pieces ----------------------------------------------------------------------------

    /**
     * A soft see-through ribbon (two crossed strips, so it reads from any side) along +Z:
     * width w(s), sideways bend c(s), colour fading to nothing at its edges and its far end.
     */
    function ribbon(len, segs, widthAt, bendAt, col, alphaAt) {
        const pos = [], cols = [], idx = [];
        for (let pass = 0; pass < 2; pass++) {
            const base = pos.length / 3;
            for (let i = 0; i <= segs; i++) {
                const s = i / segs, w = widthAt(s), c = bendAt(s), a = alphaAt(s), z = s * len;
                const pts = pass === 0 ? [[c - w, 0], [c, 0], [c + w, 0]] : [[c, -w], [c, 0], [c, w]];
                pts.forEach(function (p, k) {
                    pos.push(p[0], p[1], z);
                    const e = k === 1 ? a : 0;
                    cols.push(col[0] * e, col[1] * e, col[2] * e, e);
                });
            }
            for (let i = 0; i < segs; i++) {
                const r0 = base + i * 3, r1 = r0 + 3;
                idx.push(r0, r1, r0 + 1, r1, r1 + 1, r0 + 1, r0 + 1, r1 + 1, r0 + 2, r1 + 1, r1 + 2, r0 + 2);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4));
        g.setIndex(idx);
        const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
        const mesh = new THREE.Mesh(g, m);
        mesh.frustumCulled = false;
        return mesh;
    }

    function glow(color, size, opacity) {
        return NSE.Planets && NSE.Planets.glowSprite ? NSE.Planets.glowSprite(color, size, opacity) : new THREE.Group();
    }

    function disposeTree(g) {
        if (!g) return;
        if (g.parent) g.parent.remove(g);
        g.traverse(function (n) { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
    }

    // --- the comet --------------------------------------------------------------------------------

    function makeComet(s) {
        const C = s.comet, r = U.rng(C.seed), q = quality();
        const segs = q === 'low' ? 14 : 28;
        const group = new THREE.Group();
        group.name = 'comet';
        // The nucleus: a lumpy ball of ice and rock.
        const ng = new THREE.IcosahedronGeometry(3.4, 1);
        const p = ng.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const k = 0.75 + r() * 0.45;
            p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k);
        }
        ng.computeVertexNormals();
        const nucleus = new THREE.Mesh(ng, new THREE.MeshLambertMaterial({ color: 0x9aa2ae, emissive: new THREE.Color(C.color), emissiveIntensity: 0.25 }));
        group.add(nucleus);
        const col = U.hex(C.color), ion = U.hex('#7cc8ff');
        // Both tails point away from the star; the dust tail curves back along the path.
        const tails = new THREE.Group();
        // (Long: a comet's tails stretch across a good part of the sky, seen from anywhere nearby.)
        const ionTail = ribbon(1500, segs, s2 => 6 + s2 * 110, () => 0, ion, s2 => 0.62 * Math.pow(1 - s2, 1.2) * U.smooth(s2 / 0.03));
        const dustTail = ribbon(1100, segs, s2 => 14 + s2 * 260, s2 => s2 * s2 * 430, col, s2 => 0.95 * Math.pow(1 - s2, 1.35) * U.smooth(s2 / 0.04));
        tails.add(ionTail, dustTail);
        group.add(tails);
        const coma = glow(C.color, 170, 0.75), heart = glow('#ffffff', 34, 0.95);
        group.add(coma, heart);
        scene.add(group);
        return {
            group: group, tails: tails, nucleus: nucleus,
            angle: C.angle, a: C.dist * s.radius, b: C.dist * s.radius * 0.5, tilt: r.range(-0.25, 0.25),
            speed: (Math.PI * 2) / r.range(900, 1400), pos: new THREE.Vector3(), prev: new THREE.Vector3(), first: true
        };
    }

    const tmpX = { v: null }, tmpY = { v: null }, tmpZ = { v: null }, tmpM = { m: null };
    function stepComet(dt) {
        const c = comet, s = sys;
        c.angle += c.speed * dt;
        const x = Math.cos(c.angle) * c.a, z = Math.sin(c.angle) * c.b;
        c.prev.copy(c.pos);
        c.pos.set(s.pos.x + x * Math.cos(c.tilt) - z * Math.sin(c.tilt) * 0.3, s.pos.y + x * s.plane.x + z * s.plane.z + z * 0.12, s.pos.z + z);
        if (c.first) { c.prev.copy(c.pos); c.first = false; }
        c.group.position.copy(c.pos);
        c.nucleus.rotation.y += dt * 0.08;
        // Tail frame: +Z away from the star, +X back along the path (the dust tail's bend).
        if (!tmpZ.v) { tmpX.v = new THREE.Vector3(); tmpY.v = new THREE.Vector3(); tmpZ.v = new THREE.Vector3(); tmpM.m = new THREE.Matrix4(); }
        const Z = tmpZ.v.set(c.pos.x - s.pos.x, c.pos.y - s.pos.y, c.pos.z - s.pos.z).normalize();
        const X = tmpX.v.subVectors(c.prev, c.pos);
        if (X.lengthSq() < 1e-8) X.set(1, 0, 0);
        X.addScaledVector(Z, -X.dot(Z));
        if (X.lengthSq() < 1e-8) X.set(0, 1, 0).cross(Z);
        X.normalize();
        const Y = tmpY.v.crossVectors(Z, X);
        tmpM.m.makeBasis(X, Y, Z);
        c.tails.quaternion.setFromRotationMatrix(tmpM.m);
    }

    // --- star whales ------------------------------------------------------------------------------

    /**
     * A body of revolution along +Z: profile = [[z, radius], ...] from tail to nose (z in units),
     * squashed a little top to bottom. Lathe turns round Y, so it is built on Y and laid along Z.
     */
    function lathe(profile, seg, squash) {
        const pts = profile.map(p => new THREE.Vector2(Math.max(0.001, p[1]), p[0]));
        const g = new THREE.LatheGeometry(pts, seg);
        g.rotateX(Math.PI / 2);          // Y (the profile's length) becomes +Z: the nose forward
        g.scale(1, squash, 1);           // a little flatter top to bottom
        g.computeVertexNormals();
        return g;
    }

    /** A flat, gently thick wing shape (flukes, fins) in the XZ plane from a 2D outline. */
    function flatShape(outline, thick) {
        const s = new THREE.Shape();
        outline.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
        const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.6, bevelSize: thick * 0.8, bevelSegments: 2, curveSegments: 6 });
        g.translate(0, 0, -thick / 2);
        g.rotateX(Math.PI / 2);           // lies flat: the outline's y becomes z (negative y sweeps back)
        g.computeVertexNormals();
        return g;
    }

    function whaleModel(colHex, r, q) {
        const g = new THREE.Group();
        const glowC = new THREE.Color(colHex);
        // Deep night-blue skin with the pod's glow in it, a pale grooved belly, starry speckles.
        const skinC = new THREE.Color(0x10183a).lerp(glowC, 0.22);
        const skin = new THREE.MeshLambertMaterial({ color: skinC, emissive: glowC, emissiveIntensity: 0.16 });
        const belly = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xc8d8f0).lerp(glowC, 0.3), emissive: glowC, emissiveIntensity: 0.22 });
        const seg = q === 'low' ? 14 : 24;
        const body = new THREE.Group();
        g.add(body);
        // The body, nose forward (+Z): a rounded head, the widest part a third of the way back,
        // tapering smoothly to the tail.
        const front = lathe([[-8, 2.9], [-4, 4.1], [0, 4.8], [4, 4.9], [8, 4.4], [11, 3.4], [13, 2.1], [14.2, 0.8], [14.6, 0.05]], seg, 0.86);
        body.add(new THREE.Mesh(front, skin));
        // The pale belly with grooves (a slightly smaller lathe, lower down, striped by its segments).
        const under = lathe([[-6, 1.8], [-2, 3.4], [3, 4.0], [8, 3.6], [11.5, 2.4], [13.2, 0.9], [13.6, 0.05]], seg, 0.62);
        const um = new THREE.Mesh(under, belly);
        um.position.set(0, -1.25, 0.25);
        body.add(um);
        // Little friendly eyes.
        const eyeM = new THREE.MeshBasicMaterial({ color: 0x060a1c });
        // Long wing-like flippers, a little back from the head.
        const finGeo = flatShape([[0, 0.8], [2.2, 1.2], [6, 0.6], [9.5, -0.8], [10.4, -1.6], [8.5, -1.9], [4, -1.4], [0, -1.1]], 0.32);
        [-1, 1].forEach(function (sd) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), eyeM);
            e.position.set(sd * 3.55, 0.1, 10.2);
            body.add(e);
            const fin = new THREE.Mesh(finGeo, skin);
            fin.scale.set(sd, 1, 1);
            fin.position.set(sd * 3.9, -2.2, 5.2);
            fin.rotation.set(0, sd * -0.35, sd * -0.5);
            fin.userData.side = sd;
            fin.name = 'fin';
            body.add(fin);
        });
        // The tail: a tapering stock on a pivot (it strokes up and down), with wide flat flukes.
        const tail = new THREE.Group();
        tail.position.set(0, 0.1, -7.6);
        body.add(tail);
        tail.add(new THREE.Mesh(lathe([[-11.5, 0.7], [-9, 1.15], [-5, 2.0], [-1.5, 2.8], [0.6, 3.0]], seg, 0.82), skin));
        const flukes = new THREE.Group();
        flukes.position.z = -11.4;
        tail.add(flukes);
        const fluke = flatShape([[0, 0.6], [2.5, 0.4], [6, -0.6], [8.6, -2.6], [8.2, -3.4], [5.5, -2.6], [2.6, -2.4], [0.8, -1.6], [0, -1.1]], 0.36);
        [-1, 1].forEach(function (sd) {
            const f = new THREE.Mesh(fluke, skin);
            f.scale.set(sd, 1, 1);
            flukes.add(f);
        });
        // Starry speckles over the back and sides, like the night sky on their skin.
        const n = q === 'low' ? 26 : 54, pts = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const a = r.range(-1.35, 1.35), zz = r.range(-7.5, 12);
            const rad = zz < 0 ? 2.9 + (zz + 8) * 0.24 : zz < 8 ? 4.6 + Math.sin(zz / 8 * 1.6) * 0.3 : 4.4 - (zz - 8) * 0.55;
            pts[i * 3] = Math.sin(a) * rad * 1.02; pts[i * 3 + 1] = Math.cos(a) * rad * 0.88; pts[i * 3 + 2] = zz;
        }
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
        const speck = new THREE.Points(pg, new THREE.PointsMaterial({ color: new THREE.Color(0xffffff).lerp(glowC, 0.35), size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, map: NSE.Planets && NSE.Planets.glowTexture ? NSE.Planets.glowTexture() : null }));
        body.add(speck);
        const halo = glow(colHex, 52, 0.16);
        g.add(halo);
        return { group: g, body: body, tail: tail, flukes: flukes, fins: body.children.filter(c => c.name === 'fin') };
    }

    function makePod(s) {
        const W = s.whales, r = U.rng(W.seed), q = quality();
        const group = new THREE.Group();
        group.name = 'star-whales';
        const whales = [];
        for (let i = 0; i < W.count; i++) {
            const calf = i === W.count - 1 && W.count > 3;
            const m = whaleModel(W.color, r, q);
            const k = calf ? r.range(0.5, 0.6) : r.range(1, 1.45);
            m.group.scale.setScalar(k);
            // A loose, gently staggered formation (no two in one place, the calf close to its mother).
            // (x is away from the ship's side only, so none ever swims closer than the pod's line.)
            // (Spread more front to back and up and down than sideways, so the whole pod stays in view.)
            m.slot = calf ? { x: whales[0] ? whales[0].slot.x + 12 : 12, y: (whales[0] ? whales[0].slot.y : 0) - 9, z: (whales[0] ? whales[0].slot.z : 0) - 4 }
                : { x: (i % 2) * r.range(22, 30) + i * 5, y: (i % 2 ? -1 : 1) * r.range(5, 14) - i * 3, z: -i * r.range(28, 38) };
            m.phase = r.range(0, 6.28);
            m.rate = r.range(0.45, 0.6);
            group.add(m.group);
            whales.push(m);
        }
        group.visible = false;
        scene.add(group);
        const mats = [];
        group.traverse(function (n) {
            if (!n.material || mats.some(x => x.m === n.material)) return;
            n.material.transparent = true;
            mats.push({ m: n.material, o: n.material.opacity === undefined ? 1 : n.material.opacity });
        });
        return { group: group, whales: whales, mats: mats, fade: -1, t: -1, dur: 44, side: r.sign(), lift: r.range(-30, -16) };
    }

    const V = { fwd: null, side: null, up: null, at: null };
    function stepPod(dt, ctx) {
        const p = pod;
        if (p.t < 0) return;
        p.t += dt;
        const k = p.t / p.dur;
        if (k >= 1) { p.t = -1; p.group.visible = false; podDone = true; return; }
        if (!V.fwd) { V.fwd = new THREE.Vector3(); V.side = new THREE.Vector3(); V.up = new THREE.Vector3(0, 1, 0); V.at = new THREE.Vector3(); }
        const f = ctx.shipFwd;
        V.fwd.set(f.x, 0, f.z);
        if (V.fwd.lengthSq() < 1e-6) V.fwd.set(0, 0, -1);
        V.fwd.normalize();
        V.side.crossVectors(V.fwd, V.up).normalize();
        // In from far ahead, alongside for a while (a little ahead of the ship, where the camera
        // looks), then on and away behind: eased, never quick, never close enough to touch.
        // (In: from 700 ahead to about 200; alongside: drifting from 200 to 140 for a good while,
        // big in the picture; out: away behind.)
        const along = k < 0.3 ? 700 - 500 * U.smooth(k / 0.3) : k < 0.7 ? 200 - 60 * (k - 0.3) / 0.4 : 140 - 520 * U.smooth((k - 0.7) / 0.3);
        const out = 70 + 150 * Math.pow(Math.abs(k - 0.5) * 2, 3);
        const sp = ctx.shipPos;
        V.at.set(sp.x, sp.y + p.lift, sp.z).addScaledVector(V.fwd, along).addScaledVector(V.side, out * p.side);
        p.group.position.copy(V.at);
        // Swim the way the ship is heading (head +Z toward ahead).
        p.group.lookAt(V.at.x + V.fwd.x * 10, V.at.y, V.at.z + V.fwd.z * 10);
        const fade = U.smooth(k / 0.08) * U.smooth((1 - k) / 0.08);
        const calm = ctx.calm ? 0.6 : 1;
        p.whales.forEach(function (w, i) {
            const ph = w.phase + t * w.rate * Math.PI * 2 * 0.35 * calm;
            // (The pod faces ahead, so its own +X is the ship's left: slots go outward on either side.)
            w.group.position.set(-p.side * w.slot.x, w.slot.y + Math.sin(ph * 0.5) * 3, w.slot.z + Math.sin(ph * 0.3 + i) * 4);
            w.body.rotation.x = Math.sin(ph) * 0.05;
            w.tail.rotation.x = Math.sin(ph - 0.6) * 0.28;
            w.flukes.rotation.x = Math.sin(ph - 1.2) * 0.32;
            w.fins.forEach(fn => { fn.rotation.z = fn.userData.side * (-0.45 + Math.sin(ph * 0.5) * 0.12); });
        });
        // Fade in far ahead and out far behind (materials are see-through from the start, so
        // nothing recompiles as they fade).
        if (p.fade !== fade) { p.fade = fade; p.mats.forEach(m => { m.m.opacity = m.o * fade; }); }
    }

    // --- the system ---------------------------------------------------------------------------------

    function clear() {
        if (comet) disposeTree(comet.group);
        if (pod) disposeTree(pod.group);
        comet = null; pod = null;
    }

    function setSystem(s) {
        if (s === sys) return;
        clear();
        sys = s || null;
        inSysT = 0; podDone = false; checkT = 0;
        if (!sys || !ready()) return;
        try {
            if (sys.comet) comet = makeComet(sys);
            if (sys.whales) pod = makePod(sys);
        } catch (e) { console.warn('[NSE] rare sights', e); clear(); }
    }

    /**
     * Every frame. ctx = { shipPos, shipFwd, free (flying or gliding on the HUD, not in orbit,
     * Explore or a menu), calm, project(pos) -> { on, x, y } }.
     */
    function update(dt, ctx) {
        if (!sys || !ctx) return;
        t += dt;
        if (comet) stepComet(dt);
        if (pod) {
            inSysT += dt;
            // A while after arriving, while flying freely: the pod swims up alongside.
            if (pod.t < 0 && !podDone && ctx.free && inSysT > 6) {
                pod.t = 0; pod.group.visible = true; songT = 3;
            }
            if (pod.t >= 0) {
                stepPod(dt, ctx);
                songT -= dt;
                if (songT <= 0 && pod.t >= 0) { songT = 9 + Math.random() * 6; try { NSE.Sound.play('whale', 0.55); } catch (e) { /* no sound */ } }
            }
        }
        checkT -= dt;
        if (checkT > 0 || !onFound || !ctx.project) return;
        checkT = 0.5;
        if (comet && !told[sys.id + ':c'] && ctx.looking) {
            const d = U.clamp(Math.hypot(comet.pos.x - ctx.shipPos.x, comet.pos.y - ctx.shipPos.y, comet.pos.z - ctx.shipPos.z), 0, 1e9);
            const pr = ctx.project(comet.pos);
            if (d < 5000 && pr && pr.on) { told[sys.id + ':c'] = true; onFound('rare:comet', sys); }
        }
        if (pod && pod.t > 2 && !told[sys.id + ':w'] && ctx.looking) {
            const pr = ctx.project(pod.group.position);
            if (pr && pr.on) { told[sys.id + ':w'] = true; onFound('rare:whales', sys); }
        }
    }

    return {
        setSystem: setSystem,
        update: update,
        clear: function () { clear(); sys = null; },
        onFound: function (fn) { onFound = fn; },
        /** For checks: where the comet is, and whether the whales are out. */
        state: function () { return { comet: comet ? { x: comet.pos.x, y: comet.pos.y, z: comet.pos.z } : null, whales: !!(pod && pod.t >= 0), podDone: podDone }; }
    };
})();
