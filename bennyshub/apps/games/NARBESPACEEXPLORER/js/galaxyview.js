/**
 * NARBE Space Explorer - a whole galaxy seen from outside.
 *
 * After warping to a new galaxy, the camera rushes backwards out of it and the
 * whole galaxy is revealed. Every galaxy looks different (the user: "they all
 * look the same"): its shape (arms, bar, ring, ellipse or clumps), its colour
 * scheme, bright star clusters, glowing nebulae along the arms, and small
 * companion galaxies nearby all come from its seed through
 * NSE.Universe.galaxyPoints, the same layout the galaxy map draws. It turns
 * slowly while the player is asked "Do you want to fly in and explore?". Fly
 * In dives the camera down into one of the arms.
 *
 * A separate little scene, drawn by js/stage.js in its 'galaxy' mode.
 */

window.NSE = window.NSE || {};

NSE.GalaxyView = (function () {
    'use strict';

    const U = NSE.Util;
    const R = 400;          // galaxy radius in this scene's units

    function pointsFrom(THREE, pts, scale, size) {
        const pos = new Float32Array(pts.n * 3);
        for (let i = 0; i < pts.n * 3; i++) pos[i] = pts.pos[i] * scale;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(pts.col, 3));
        return new THREE.Points(geo, new THREE.PointsMaterial({ size: size, sizeAttenuation: true, vertexColors: true, map: NSE.Planets.glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    }

    function create(THREE, g, quality) {
        const UV = NSE.Universe;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x01020a);
        const r = U.rng(U.hash('galaxyview', g.seed));
        const n = quality === 'low' ? 7000 : quality === 'standard' ? 12000 : 18000;
        const pts = UV.galaxyPoints(g, n);
        const disk = new THREE.Group();
        disk.add(pointsFrom(THREE, pts, R, 3.2));
        // The glowing core (big or small with the galaxy's bulge), and a soft haze over the disk.
        disk.add(NSE.Planets.glowSprite(g.core, R * (0.4 + g.bulge * 1.4), 0.95));
        disk.add(NSE.Planets.glowSprite(g.arm, R * 2.4, g.kind === 'elliptical' ? 0.35 : 0.2));
        // Bright star clusters, and glowing nebulae in the arms.
        pts.clusters.forEach(c => {
            const s = NSE.Planets.glowSprite('#e8f0ff', R * c.size * 1.6, 0.85);
            s.position.set(c.x * R, c.y * R, c.z * R);
            disk.add(s);
        });
        pts.nebulae.forEach(nb => {
            const m = new THREE.SpriteMaterial({ map: NSE.Planets.softTexture(), color: nb.color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
            const s = new THREE.Sprite(m);
            s.position.set(nb.x * R, nb.y * R, nb.z * R);
            s.scale.set(R * nb.size * 2.2, R * nb.size * 2.2, 1);
            disk.add(s);
        });
        disk.rotation.x = 0.18 + g.tilt * 0.3;
        disk.rotation.z = g.tilt * 0.4;
        scene.add(disk);
        // Companion galaxies: small fuzzy ellipses nearby.
        g.companions.forEach(function (c, i) {
            const cg = Object.assign({}, g, { seed: U.hash(g.seed, 'companion', i), kind: 'elliptical', bulge: 0.5, flat: 0.6, core: c.color, arm: c.color, clumps: 2, nebulae: 0 });
            const cp = UV.galaxyPoints(cg, quality === 'low' ? 500 : 1200);
            const p = pointsFrom(THREE, cp, R * c.size, 2.6);
            const grp = new THREE.Group();
            grp.add(p);
            grp.add(NSE.Planets.glowSprite(c.color, R * c.size * 1.2, 0.6));
            grp.position.set(Math.cos(c.a) * R * c.dist, Math.sin(c.a * 1.7) * R * 0.35, Math.sin(c.a) * R * c.dist);
            grp.rotation.set(c.tilt, c.a, c.tilt * 0.5);
            scene.add(grp);
        });
        // Far-off stars all round, tinted to this galaxy, and a few distant galaxies.
        const bg = new Float32Array(2400 * 3);
        for (let i = 0; i < 2400; i++) {
            const zz = r.range(-1, 1), a = r.range(0, Math.PI * 2), s = Math.sqrt(1 - zz * zz);
            bg[i * 3] = s * Math.cos(a) * 6000; bg[i * 3 + 1] = zz * 6000; bg[i * 3 + 2] = s * Math.sin(a) * 6000;
        }
        const bgGeo = new THREE.BufferGeometry();
        bgGeo.setAttribute('position', new THREE.BufferAttribute(bg, 3));
        const tint = new THREE.Color(g.tint[0] * 0.65, g.tint[1] * 0.68, g.tint[2] * 0.78);
        scene.add(new THREE.Points(bgGeo, new THREE.PointsMaterial({ color: tint, size: 1.6, sizeAttenuation: false, map: NSE.Planets.glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
        for (let i = 0; i < 5; i++) {
            const s = NSE.Planets.glowSprite(U.toHex(U.hsl(r.range(0, 360), 0.4, 0.7)), r.range(60, 140), 0.35);
            const a = r.range(0, Math.PI * 2), e = r.range(-0.5, 0.5);
            s.position.set(Math.cos(a) * 3000, Math.sin(e) * 3000, Math.sin(a) * 3000);
            scene.add(s);
        }
        // Somewhere out in an arm (or on the ring, or in a clump) to fly down into.
        const tc = pts.clusters[0] || { x: 0.6, y: 0, z: 0 };
        const target = new THREE.Vector3(tc.x * R, tc.y * R, tc.z * R);
        // Each galaxy is seen from its own angle.
        const view = { yaw: r.range(0, Math.PI * 2), elev: r.range(0.35, 0.9) };

        let t = 0, spin = 0;
        const reveal = { from: 60, to: 1050 };
        const worldTarget = new THREE.Vector3();
        return {
            scene: scene,
            /**
             * phase 'reveal' (k 0..1: rush back out), 'look' (turn slowly), 'dive' (k 0..1: fly down into an arm).
             */
            update: function (dt, camera, phase, k, calm) {
                t += dt;
                spin += dt * (calm ? 0.015 : 0.04);
                disk.rotation.y = spin;
                disk.updateMatrixWorld();
                let dist = reveal.to;
                if (phase === 'reveal') dist = U.lerp(reveal.from, reveal.to, 1 - Math.pow(1 - k, 3));
                const base = new THREE.Vector3(Math.sin(view.yaw) * Math.cos(view.elev), Math.sin(view.elev), Math.cos(view.yaw) * Math.cos(view.elev)).multiplyScalar(dist);
                if (phase === 'dive') {
                    worldTarget.copy(target).applyMatrix4(disk.matrixWorld);
                    const e = U.ease(k);
                    camera.position.copy(base).lerp(worldTarget, e * 0.985);
                    camera.lookAt(new THREE.Vector3().lerp(worldTarget, Math.min(1, e * 1.4)));
                    camera.fov = 55 + e * (calm ? 15 : 35);
                } else {
                    camera.position.copy(base);
                    camera.lookAt(0, -R * 0.12, 0);
                    camera.fov = 55;
                }
                camera.near = 0.5; camera.far = 20000;
                camera.updateProjectionMatrix();
            },
            dispose: function () {
                scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
            }
        };
    }

    return { create: create };
})();
