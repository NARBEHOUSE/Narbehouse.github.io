/**
 * NARBE Build n Ride - the toy steam train.
 *
 * A locomotive, its tender and three coaches, each a merged low-poly body
 * plus separate axles that really turn (with a bright spoke bar so you can
 * see them go round) and coupling rods that circle with the drivers.
 *
 * Every car rides on two bogie points on the track, so it turns and tilts
 * exactly with the rails. Local axes per car: +z forward, +y up, origin on
 * the rails under the car's middle.
 *
 * Car kinds are data (KINDS), so other train styles can be added later
 * (v1 has the one steam train). The freight kinds (diesel, boxcar, tanker,
 * hopper, flatcar, caboose) run on the routes' distant lines; o.simple merges
 * their wheels into the bodies (fewer meshes; nothing spins at that distance).
 */

window.BNR = window.BNR || {};

BNR.Train = (function () {
    'use strict';

    const GAP = 0.7;   // coupler gap between cars

    const PAINT = {
        loco: { body: '#d83a2e', dark: '#2b2b33', trim: '#e8b53a', wheel: '#c62f24' },
        coaches: ['#2f6fd0', '#3fa84f', '#f2a630']
    };

    /** Car kinds: length, bogie offsets (front, rear), axles [z, radius], body(b, paint). */
    const KINDS = {
        loco: {
            len: 7.8, bf: 2.6, br: 2.2,
            axles: [[3.0, 0.4], [1.55, 0.64], [0, 0.64], [-1.55, 0.64]],
            rods: true,
            body: function (b, p) {
                b.box(0, 1.15, 0.2, 2.15, 0.32, 7.3, p.dark);                       // running board
                b.box(0, 1.0, 3.75, 2.5, 0.6, 0.32, p.body);                        // buffer beam
                [0.85, -0.85].forEach(x => b.shape('cyl:0.14,0.14,8', x, 1.0, 4.0, 1, 0.35, 1, p.dark, { rx: Math.PI / 2 }));
                b.shape('cyl:0.86,0.86,12', 0, 2.15, 0.85, 1, 4.3, 1, p.body, { rx: Math.PI / 2 });   // boiler
                b.shape('cyl:0.9,0.9,12', 0, 2.15, 3.25, 1, 0.95, 1, p.dark, { rx: Math.PI / 2 });    // smokebox
                b.shape('cyl:0.68,0.68,12', 0, 2.15, 3.75, 1, 0.08, 1, '#4a4a52', { rx: Math.PI / 2 });
                [-0.45, 0.75, 1.95].forEach(z => b.shape('cyl:0.885,0.885,12', 0, 2.15, z, 1, 0.14, 1, p.trim, { rx: Math.PI / 2 }));
                b.shape('cyl:0.4,0.3,10', 0, 3.4, 3.05, 1, 1.15, 1, p.dark);         // chimney
                b.shape('cyl:0.48,0.42,10', 0, 4.0, 3.05, 1, 0.22, 1, p.dark);
                b.shape('sphere:10,6', 0, 2.98, 1.35, 0.95, 0.8, 0.95, p.trim);      // dome
                b.shape('cyl:0.12,0.12,8', 0, 3.12, -0.35, 1, 0.5, 1, p.trim);       // whistle
                [1.17, -1.17].forEach(x => b.box(x, 0.95, 2.65, 0.5, 0.62, 1.15, p.dark));   // cylinders
                // Cab: side walls, a back wall and a front wall framed round two big
                // windows (made of separate boxes, so the Conductor sees out of them).
                // The window tops (4.25) are above the Conductor's eye (3.95).
                [1.18, -1.18].forEach(function (x) {
                    b.box(x, 2.05, -2.75, 0.12, 1.3, 2.1, p.body);                   // lower side wall
                    b.box(x, 4.375, -2.75, 0.12, 0.25, 2.1, p.body);                 // above the side opening
                    b.box(x, 3.475, -3.72, 0.12, 1.55, 0.16, p.body);                // rear corner post
                    b.box(x, 3.475, -1.78, 0.12, 1.55, 0.16, p.body);                // front corner post
                    b.box(x * 0.82, 2.9, -2.75, 0.06, 0.08, 1.9, p.trim);            // grab rail
                });
                b.box(0, 2.5, -3.8, 2.48, 2.2, 0.12, p.body);                         // back wall (low)
                b.box(0, 1.85, -1.72, 2.48, 0.9, 0.12, p.body);                       // front wall under the windows
                b.box(0, 4.375, -1.72, 2.48, 0.25, 0.12, p.body);                     // over the windows
                b.box(0, 4.61, -2.75, 2.85, 0.22, 2.55, p.dark);                      // roof
                b.box(0, 1.36, -2.75, 2.5, 0.12, 2.15, p.trim);
                // Cowcatcher: a V pointing forward
                b.shape('prism', 0, 0.42, 4.3, 2.3, 0.75, 0.6, p.body, { rx: Math.PI / 2 });
                b.box(0, 0.75, 4.05, 2.4, 0.12, 0.15, p.trim);
                // Headlamp body
                b.box(0, 3.08, 3.55, 0.6, 0.5, 0.45, p.dark);
            }
        },
        tender: {
            len: 4.6, bf: 1.35, br: 1.35,
            axles: [[1.35, 0.5], [-1.35, 0.5]],
            body: function (b, p) {
                b.box(0, 1.05, 0, 2.2, 0.35, 4.4, p.dark);
                b.box(0, 1.95, 0, 2.35, 1.5, 4.3, p.body);
                b.box(0, 2.74, 0, 2.45, 0.12, 4.4, p.dark);
                b.box(0, 2.85, 0.35, 2.0, 0.4, 3.2, '#26262b');
                b.shape('ico', 0.3, 3.05, 0.6, 0.9, 0.45, 0.9, '#1f1f24');
                b.shape('ico', -0.4, 3.0, -0.4, 0.8, 0.4, 0.8, '#1f1f24');
                b.box(0, 1.95, 0, 2.37, 0.12, 4.32, p.trim);
            }
        },
        coach: {
            len: 7.6, bf: 2.7, br: 2.7,
            axles: [[3.3, 0.42], [2.1, 0.42], [-2.1, 0.42], [-3.3, 0.42]],
            windows: true,
            body: function (b, p, color) {
                b.box(0, 1.0, 0, 2.05, 0.3, 7.1, '#3a3a40');
                [2.7, -2.7].forEach(z => b.box(0, 0.75, z, 1.9, 0.35, 1.8, '#2e2e33'));
                b.box(0, 2.2, 0, 2.4, 2.05, 7.4, color);
                b.box(0, 2.62, 0, 2.42, 0.82, 6.9, '#fbf6e9');
                b.box(0, 1.28, 0, 2.43, 0.14, 7.42, p.trim);
                b.shape('cyl:1.3,1.3,10', 0, 3.2, 0, 1, 7.6, 0.5, shade(color, 0.72), { rx: Math.PI / 2 });
                [3.75, -3.75].forEach(z => b.box(0, 2.0, z, 1.0, 1.75, 0.08, '#6b4a33'));
            }
        },
        // Freight (the train on the distant line).
        diesel: {
            len: 8.8, bf: 3.0, br: 3.0,
            axles: [[3.6, 0.42], [2.4, 0.42], [-2.4, 0.42], [-3.6, 0.42]],
            body: function (b) {
                const blue = '#2f5f9e', yel = '#f2c230', dark = '#2b2b33';
                b.box(0, 1.05, 0, 2.3, 0.35, 8.6, dark);
                b.box(0, 2.05, -0.9, 1.9, 1.7, 6.0, blue);                       // long hood
                b.box(0, 1.55, -0.9, 1.92, 0.22, 6.02, yel);
                b.box(0, 2.45, 3.0, 2.35, 2.5, 2.2, blue);                       // cab at the front
                b.box(0, 3.75, 3.0, 2.45, 0.14, 2.3, dark);
                [0.55, -0.55].forEach(x => b.box(x, 2.95, 4.11, 0.75, 0.6, 0.04, '#33445e'));
                [1.18, -1.18].forEach(x => b.box(x, 2.95, 3.1, 0.04, 0.6, 1.0, '#33445e'));
                b.box(0, 1.7, 4.12, 2.36, 0.25, 0.04, yel);
                b.box(0, 3.45, 4.12, 0.36, 0.2, 0.06, '#fff4c8');
                for (let z = -3.4; z <= 1.6; z += 1.0) [0.96, -0.96].forEach(x => b.box(x, 2.25, z, 0.03, 0.7, 0.55, '#24486f'));
            }
        },
        boxcar: {
            len: 7.4, bf: 2.6, br: 2.6,
            axles: [[3.2, 0.4], [2.0, 0.4], [-2.0, 0.4], [-3.2, 0.4]],
            body: function (b) {
                b.box(0, 1.0, 0, 2.1, 0.3, 7.2, '#2b2b33');
                b.box(0, 2.3, 0, 2.4, 2.3, 7.3, '#9e3b25', { shade: 0.06 });
                b.box(0, 3.5, 0, 2.5, 0.12, 7.4, '#7d2e1d');
                b.box(0, 3.6, 0, 0.5, 0.06, 7.2, '#5a4a44');
                [1.21, -1.21].forEach(x => { b.box(x, 2.25, 0, 0.04, 2.0, 2.0, '#86311f'); b.box(x, 3.25, 0, 0.05, 0.08, 2.6, '#2b2b33'); });
            }
        },
        tanker: {
            len: 7.0, bf: 2.5, br: 2.5,
            axles: [[3.0, 0.4], [1.8, 0.4], [-1.8, 0.4], [-3.0, 0.4]],
            body: function (b) {
                b.box(0, 1.05, 0, 2.0, 0.3, 6.8, '#2b2b33');
                b.shape('cyl:1.15,1.15,14', 0, 2.3, 0, 1, 6.4, 1, '#e8e4dc', { rx: Math.PI / 2 });
                [3.2, -3.2].forEach(z => b.shape('sphere:12,6', 0, 2.3, z, 2.3, 2.3, 0.6, '#e8e4dc'));
                b.shape('cyl:0.4,0.4,10', 0, 3.5, 0, 1, 0.4, 1, '#c9c4ba');
                b.box(0, 2.3, 0, 2.34, 0.25, 6.2, '#2f6fd0');
            }
        },
        hopper: {
            len: 6.8, bf: 2.4, br: 2.4,
            axles: [[2.9, 0.4], [1.7, 0.4], [-1.7, 0.4], [-2.9, 0.4]],
            body: function (b) {
                b.box(0, 1.0, 0, 2.0, 0.3, 6.6, '#2b2b33');
                b.box(0, 2.55, 0, 2.4, 1.7, 6.4, '#5a6b4a', { shade: 0.08 });
                [-1.6, 1.6].forEach(z => b.shape('prism', 0, 1.35, z, 2.3, 0.8, 2.2, '#4a5a3c', { rz: Math.PI }));
                b.blob(0, 3.45, 0, 2.1, 0.6, 5.8, '#26262b', { round: 0.7, segs: 3, shade: 0.2 });
            }
        },
        flatcar: {
            len: 7.4, bf: 2.6, br: 2.6,
            axles: [[3.2, 0.4], [2.0, 0.4], [-2.0, 0.4], [-3.2, 0.4]],
            body: function (b) {
                b.box(0, 1.1, 0, 2.4, 0.35, 7.3, '#6b4a33');
                [[-0.6, 1.62], [0.6, 1.62], [0, 2.32], [-1.15, 1.62], [1.15, 1.62]].forEach(l => b.shape('cyl:0.36,0.36,8', l[0] * 0.95, l[1] - 0.1, 0, 1, 6.6, 1, '#9a6b3c', { rx: Math.PI / 2, shade: 0.1 }));
                [-3.0, -1.0, 1.0, 3.0].forEach(z => [1.3, -1.3].forEach(x => b.box(x, 2.0, z, 0.12, 1.6, 0.12, '#4a3524')));
            }
        },
        caboose: {
            len: 6.2, bf: 2.0, br: 2.0,
            axles: [[2.6, 0.4], [1.4, 0.4], [-1.4, 0.4], [-2.6, 0.4]],
            body: function (b) {
                b.box(0, 1.0, 0, 2.1, 0.3, 6.0, '#2b2b33');
                b.box(0, 2.2, 0, 2.3, 2.1, 4.6, '#d2452f');
                b.box(0, 3.3, 0, 2.5, 0.12, 4.8, '#2b2b33');
                b.box(0, 3.85, 0, 1.5, 1.0, 1.6, '#d2452f');                   // cupola
                b.box(0, 4.4, 0, 1.7, 0.1, 1.8, '#2b2b33');
                [1.16, -1.16].forEach(x => [-1.2, 0, 1.2].forEach(z => b.box(x, 2.45, z, 0.04, 0.6, 0.6, '#33445e')));
                [2.75, -2.75].forEach(z => b.box(0, 1.65, z, 2.0, 0.08, 0.7, '#2b2b33'));
            }
        }
    };

    /** A hex colour scaled toward black (k < 1). */
    function shade(hex, k) {
        const c = BNR.Util.hexRGB(hex).map(v => Math.round(v * k * 255));
        return '#' + c.map(v => ('0' + v.toString(16)).slice(-2)).join('');
    }

    function create(THREE, o) {
        o = o || {};
        const group = new THREE.Group();
        group.name = 'train';
        (o.parent || o.scene).add(group);
        const order = o.cars || ['loco', 'tender', 'coach', 'coach', 'coach'];
        const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        const windowMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#2d4466'), emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0 });
        const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4c8') });
        const xrayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe066'), transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, fog: false });
        // The headlight beam: an open cone, bright at the lamp and fading to nothing ahead
        // (additive, so black adds nothing). Seen at night and in tunnels (setHeadlight).
        const BEAM = 26;
        const beamGeo = new THREE.ConeGeometry(4.2, BEAM, 18, 6, true);
        beamGeo.rotateX(-Math.PI / 2);
        beamGeo.translate(0, 0, BEAM / 2);
        (function () {
            const pos = beamGeo.attributes.position, col = new Float32Array(pos.count * 3);
            for (let i = 0; i < pos.count; i++) {
                const t = Math.max(0, 1 - pos.getZ(i) / BEAM), v = Math.pow(t, 1.6);
                col[i * 3] = v; col[i * 3 + 1] = v * 0.9; col[i * 3 + 2] = v * 0.68;
            }
            beamGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        })();
        const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        let spot = null, beam = null;
        const cars = [];
        const wheelGeo = {};
        let offset = 0, coachNo = 0;

        /** A pair of wheels on an axle, at height y and position z (0, 0 for a spinning axle mesh). */
        function axleParts(b, r, loco, y, z) {
            const col = loco && r > 0.5 ? PAINT.loco.wheel : '#3a3a40';
            [0.86, -0.86].forEach(function (x) {
                b.shape('cyl:1,1,14', x, y, z, r, 0.2, r, col, { rz: Math.PI / 2 });
                b.shape('cyl:1,1,10', x + Math.sign(x) * 0.02, y, z, r * 0.32, 0.22, r * 0.32, PAINT.loco.trim, { rz: Math.PI / 2 });
                b.box(x + Math.sign(x) * 0.115, y, z, 0.04, r * 1.7, r * 0.26, '#f4efe2');   // spoke bar: shows the turn
            });
            b.box(0, y, z, 1.55, 0.14, 0.14, '#2b2b33');
        }

        function axleGeometry(r, loco) {
            const k = r + (loco ? 'L' : 'C');
            if (wheelGeo[k]) return wheelGeo[k];
            const b = BNR.Geo.builder();
            axleParts(b, r, loco, 0, 0);
            wheelGeo[k] = b.geometry();
            return wheelGeo[k];
        }

        order.forEach(function (kind) {
            const def = KINDS[kind];
            const obj = new THREE.Group();
            obj.name = kind;
            const b = BNR.Geo.builder();
            const color = kind === 'coach' ? PAINT.coaches[coachNo++ % PAINT.coaches.length] : null;
            def.body(b, PAINT.loco, color);
            // A simple (distant) train has its wheels in the body: fewer meshes, nothing spins.
            if (o.simple) def.axles.forEach(a => axleParts(b, a[1], kind === 'loco', a[1], a[0]));
            const bodyGeo = b.geometry();
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.castShadow = true;
            obj.add(body);
            // X-ray outline: shows the train through the hill when it is in a tunnel (Bird's Eye).
            const xray = new THREE.Mesh(bodyGeo, xrayMat);
            xray.renderOrder = 20;
            xray.visible = false;
            obj.add(xray);
            if (def.windows) {
                const w = BNR.Geo.builder();
                for (let k = 0; k < 6; k++) {
                    const z = -2.75 + k * 1.1;
                    [1.215, -1.215].forEach(x => w.box(x, 2.62, z, 0.04, 0.55, 0.78, '#ffffff'));
                }
                obj.add(new THREE.Mesh(w.geometry(), windowMat));
            }
            const axles = o.simple ? [] : def.axles.map(function (a) {
                const m = new THREE.Mesh(axleGeometry(a[1], kind === 'loco'), bodyMat);
                m.position.set(0, a[1], a[0]);
                m.castShadow = false;
                obj.add(m);
                return { mesh: m, r: a[1] };
            });
            let rods = null, lens = null;
            if (def.rods && !o.simple) {
                rods = [1, -1].map(function (side) {
                    const rb = BNR.Geo.builder();
                    rb.box(0, 0, 0, 0.1, 0.18, 3.4, '#b9bcc4');
                    const m = new THREE.Mesh(rb.geometry(), bodyMat);
                    obj.add(m);
                    return { mesh: m, side: side };
                });
                const lb = BNR.Geo.builder();
                lb.shape('cyl:1,1,12', 0, 0, 0, 0.2, 0.06, 0.2, '#ffffff', { rx: Math.PI / 2 });
                lens = new THREE.Mesh(lb.geometry(), lensMat);
                lens.position.set(0, 3.08, 3.79);
                obj.add(lens);
                if (o.headlight !== false) {
                    // Always in the scene (intensity 0 by day), so turning it on never recompiles shaders.
                    spot = new THREE.SpotLight(0xffe7b0, 0, 95, 0.42, 0.6, 2);
                    spot.position.set(0, 3.08, 3.9);
                    spot.target.position.set(0, 0.2, 34);
                    obj.add(spot, spot.target);
                    beam = new THREE.Mesh(beamGeo, beamMat);
                    beam.position.set(0, 3.08, 3.86);
                    beam.rotation.x = 0.07;
                    beam.renderOrder = 6;
                    beam.visible = false;
                    beam.name = 'headlight beam';
                    obj.add(beam);
                }
            }
            group.add(obj);
            cars.push({ kind: kind, def: def, obj: obj, axles: axles, rods: rods, xray: xray, offset: offset + def.len / 2 });
            offset += def.len + GAP;
        });

        const length = offset - GAP;
        const A = {}, B = {};
        const f = new THREE.Vector3(), x = new THREE.Vector3(), y = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4();
        let wheelAngle = 0;

        /**
         * Put the train on the track with its front at sHead (distance along
         * the sampler). ds: how far it moved this frame (turns the wheels).
         */
        function place(sampler, sHead, ds) {
            wheelAngle += (ds || 0);
            cars.forEach(function (car) {
                const sc = sHead - car.offset;
                sampler.at(sc + car.def.bf, A);
                sampler.at(sc - car.def.br, B);
                f.set(A.x - B.x, A.y - B.y, A.z - B.z);
                const len = f.length() || 1;
                f.divideScalar(len);
                x.crossVectors(up, f).normalize();
                y.crossVectors(f, x);
                m.makeBasis(x, y, f);
                car.obj.quaternion.setFromRotationMatrix(m);
                // The car's middle sits between its bogies, scaled for a bogie spacing that isn't centred.
                const k = car.def.br / (car.def.bf + car.def.br);
                car.obj.position.set(B.x + (A.x - B.x) * k, B.y + (A.y - B.y) * k, B.z + (A.z - B.z) * k);
                car.axles.forEach(a => { a.mesh.rotation.x = wheelAngle / a.r; });
                if (car.rods) {
                    const th = wheelAngle / 0.64;
                    car.rods.forEach(function (r) {
                        const ph = th + (r.side > 0 ? 0 : Math.PI / 2);
                        r.mesh.position.set(r.side * 1.08, 0.64 + Math.sin(ph) * 0.3, Math.cos(ph) * 0.3);
                    });
                }
            });
        }

        const tmp = new THREE.Vector3();
        /** A point on the locomotive (local coordinates) in the world. */
        function locoPoint(lx, ly, lz, out) {
            out = out || new THREE.Vector3();
            const loco = cars[0].obj;
            loco.updateMatrixWorld(true);
            return out.set(lx, ly, lz).applyMatrix4(loco.matrixWorld);
        }

        return {
            group: group,
            cars: cars,
            length: length,
            place: place,
            /** The top of the chimney, the whistle and the lamp, in world space. */
            chimney: function (out) { return locoPoint(0, 4.15, 3.05, out); },
            whistle: function (out) { return locoPoint(0, 3.45, -0.35, out); },
            lamp: function (out) { return locoPoint(0, 3.08, 3.9, out); },
            /** The Conductor's eye: in the cab, just high enough to see over the boiler. */
            cab: function (out) { return locoPoint(0, 3.95, -2.05, out); },
            forward: function (out) {
                out = out || new THREE.Vector3();
                cars[0].obj.updateMatrixWorld(true);
                return out.set(0, 0, 1).transformDirection(cars[0].obj.matrixWorld);
            },
            position: function (out) { return (out || tmp).copy(cars[0].obj.position); },
            /** Night: the coach windows glow. */
            setNight: function (k) { windowMat.emissiveIntensity = 0.9 * k; },
            /** The headlight: k 0 (off, by day) .. 1 (on: night, or in a tunnel). */
            setHeadlight: function (k) {
                if (spot) spot.intensity = 520 * k;
                if (beam) { beamMat.opacity = 0.13 * k; beam.visible = k > 0.02; }
            },
            /** The headlamp flares (the horn): k 0..1, eased by the caller. */
            flash: function (k) { lensMat.color.setRGB(1 + 2.5 * k, 0.96 + 2.2 * k, 0.78 + 1.6 * k); },
            /** Show the train through the hill (Bird's Eye in a tunnel). */
            setXray: function (on) { cars.forEach(c => { c.xray.visible = !!on; }); },
            /** Underground: the whole train dims (the sun can't reach it in a tunnel). k: 0 out .. 1 in. */
            setShade: function (k) {
                const v = 1 - 0.68 * k;
                bodyMat.color.setRGB(v, v, v);
                windowMat.color.set('#2d4466').multiplyScalar(v);
            },
            materials: { body: bodyMat, windows: windowMat, lens: lensMat },
            dispose: function () {
                (o.parent || o.scene).remove(group);
                group.traverse(function (n) { if (n.isMesh && n.geometry && !Object.values(wheelGeo).includes(n.geometry)) n.geometry.dispose(); });
                Object.values(wheelGeo).forEach(g => g.dispose());
                bodyMat.dispose(); windowMat.dispose(); lensMat.dispose(); xrayMat.dispose(); beamGeo.dispose(); beamMat.dispose();
            }
        };
    }

    return { create: create, KINDS: KINDS, PAINT: PAINT };
})();
