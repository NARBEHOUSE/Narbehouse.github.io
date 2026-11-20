/**
 * NARBE Space Explorer - the player's ship, built from simple shapes.
 *
 * A friendly rounded shuttle about 6 units long, nose toward -Z: white hull
 * with orange and navy trim, a glass bubble cockpit, swept wings with
 * blinking tip lights, and two engines whose glow grows with speed.
 * Lambert/Basic materials only (the Node test renderer can draw it).
 */

window.NSE = window.NSE || {};

NSE.Ship = (function () {
    'use strict';

    function build(THREE) {
        const group = new THREE.Group();
        group.name = 'ship';
        const body = new THREE.Group();      // banks and bobs inside the group
        group.add(body);

        const white = new THREE.MeshLambertMaterial({ color: 0xf2f4f8 });
        const orange = new THREE.MeshLambertMaterial({ color: 0xff8a1f });
        const navy = new THREE.MeshLambertMaterial({ color: 0x1f3a6e });
        const grey = new THREE.MeshLambertMaterial({ color: 0x6a7488 });
        const glass = new THREE.MeshLambertMaterial({ color: 0x7fd8ff, emissive: 0x1a5a80, transparent: true, opacity: 0.82 });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x8fe8ff, toneMapped: false });

        // Hull: a lathed teardrop, nose forward.
        const prof = [];
        const L = 6;
        for (let i = 0; i <= 16; i++) {
            const t = i / 16;
            const r = Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.95 * (t < 0.85 ? 1 : 1 - (t - 0.85) * 2.2);
            prof.push(new THREE.Vector2(Math.max(0.02, r), t * L - L / 2));
        }
        const hullGeo = new THREE.LatheGeometry(prof, 20);
        hullGeo.rotateX(-Math.PI / 2);    // lathe axis Y -> Z (nose at -Z)
        const hull = new THREE.Mesh(hullGeo, white);
        hull.scale.set(1, 0.72, 1);
        body.add(hull);

        // An orange stripe band and a navy belly.
        const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.09, 6, 24), orange);
        stripe.scale.set(1, 0.72, 1);
        stripe.position.z = 0.4;
        body.add(stripe);
        const belly = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), navy);
        belly.scale.set(1, 0.45, 2.6);
        belly.position.set(0, -0.1, 0.3);
        body.add(belly);

        // Cockpit bubble.
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
        dome.scale.set(1, 0.8, 1.6);
        dome.position.set(0, 0.42, -1.1);
        body.add(dome);

        // Wings: flat swept shapes.
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, -0.6);
        wingShape.lineTo(2.7, 0.7);
        wingShape.lineTo(2.9, 1.25);
        wingShape.lineTo(0, 1.4);
        wingShape.closePath();
        const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 1 });
        wingGeo.rotateX(Math.PI / 2);
        const lights = [];
        [-1, 1].forEach(function (side) {
            const wing = new THREE.Mesh(wingGeo, white);
            wing.scale.x = side;
            wing.position.set(side * 0.55, -0.05, 0.3);
            body.add(wing);
            const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.7), orange);
            tip.position.set(side * 3.42, -0.05, 1.25);
            body.add(tip);
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff5050 : 0x50ff7a, toneMapped: false }));
            lamp.position.set(side * 3.5, 0.08, 1.55);
            body.add(lamp);
            lights.push(lamp);
        });

        // Tail fin: a swept triangle, upright at the back with a sloping front edge.
        const finShape = new THREE.Shape();
        finShape.moveTo(-1.0, 0);       // back, at the hull
        finShape.lineTo(0.65, 0);       // front, at the hull
        finShape.lineTo(-1.0, 1.4);     // the tip, above the back
        finShape.closePath();
        const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
        finGeo.rotateY(Math.PI / 2);    // shape across -> along the ship (back toward +Z), depth -> thickness across
        finGeo.translate(-0.06, 0, 0);
        const fin = new THREE.Mesh(finGeo, orange);
        fin.position.set(0, 0.28, 1.55);
        body.add(fin);

        // Engines: two pods with glowing nozzles and soft flame sprites.
        const flames = [];
        [-1, 1].forEach(function (side) {
            const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.8, 12), grey);
            pod.rotation.x = Math.PI / 2;
            pod.position.set(side * 0.95, -0.12, 2.0);
            body.add(pod);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 6, 16), navy);
            ring.position.set(side * 0.95, -0.12, 2.9);
            body.add(ring);
            const nozzle = new THREE.Mesh(new THREE.CircleGeometry(0.33, 16), glowMat);
            nozzle.position.set(side * 0.95, -0.12, 2.92);
            body.add(nozzle);
            if (NSE.Planets && NSE.Planets.glowSprite) {
                const f = NSE.Planets.glowSprite(0x7fdcff, 1.6, 0.9);
                f.position.set(side * 0.95, -0.12, 3.3);
                body.add(f);
                flames.push(f);
            }
        });

        let t = 0, thrust = 0.5;
        return {
            group: group,
            body: body,
            length: L,
            /** thrust 0..1 sizes the engine glow; bank (radians) leans into turns. */
            update: function (dt, o) {
                o = o || {};
                t += dt;
                thrust += ((o.thrust === undefined ? 0.5 : o.thrust) - thrust) * Math.min(1, dt * 3);
                body.rotation.z += ((o.bank || 0) - body.rotation.z) * Math.min(1, dt * 2.5);
                body.rotation.x += ((o.pitch || 0) - body.rotation.x) * Math.min(1, dt * 2.5);
                body.position.y = o.calm ? 0 : Math.sin(t * 1.3) * 0.08;
                flames.forEach(function (f, i) {
                    const s = 1.1 + thrust * 2.4 + (o.calm ? 0 : Math.sin(t * 17 + i * 2) * 0.12);
                    f.scale.set(s, s, 1);
                    f.position.z = 3.1 + thrust * 0.7;
                });
                const blink = (t % 1.6) < 0.18;
                lights.forEach(l => { l.visible = blink || !!o.calm; });
            },
            setVisible: function (v) { group.visible = v; },
            dispose: function () { group.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); }); }
        };
    }

    return { build: build };
})();
