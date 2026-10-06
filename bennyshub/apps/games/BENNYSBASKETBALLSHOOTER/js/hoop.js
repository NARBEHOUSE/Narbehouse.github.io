// Hoop: stanchion, glass backboard with LED edge, rim, shot clock and a cloth-simulated net.
// Physics colliders keep the original sizes and positions so shooting feels the same.
(function () {
    const START_Z = -10;
    const BOARD = { w: 6, h: 4, d: 0.2, y: 11.5, z: -0.5 };
    const RIM = { r: 1.3, tube: 0.05, y: 10, z: 0.8 };

    function beam(a, b, radius, mat) {
        const dir = new THREE.Vector3().subVectors(b, a);
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 16), mat);
        mesh.position.copy(a).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        mesh.castShadow = true;
        return mesh;
    }

    function buildNet(scene) {
        const N = 16, M = 8, LEN = 1.8, TOP = RIM.r - 0.02, BOTTOM = 0.72;
        const cx = 0, cy = RIM.y, cz = START_Z + RIM.z;
        const pos = [], prev = [], rest = [];
        const idx = (i, j) => j * N + ((i % N) + N) % N;
        for (let j = 0; j < M; j++) {
            const r = TOP + (BOTTOM - TOP) * (j / (M - 1));
            for (let i = 0; i < N; i++) {
                const a = (i + 0.5 * (j % 2)) / N * Math.PI * 2;
                const p = new THREE.Vector3(cx + Math.cos(a) * r, cy - j * LEN / (M - 1), cz + Math.sin(a) * r);
                pos.push(p); prev.push(p.clone()); rest.push(p.clone());
            }
        }
        const links = [], drawn = [];
        const link = (a, b, draw) => { links.push([a, b, pos[a].distanceTo(pos[b])]); if (draw) drawn.push(links.length - 1); };
        for (let j = 0; j < M - 1; j++) {
            for (let i = 0; i < N; i++) {
                const a = idx(i, j);
                if (j % 2 === 0) { link(a, idx(i, j + 1), true); link(a, idx(i - 1, j + 1), true); }
                else { link(a, idx(i, j + 1), true); link(a, idx(i + 1, j + 1), true); }
            }
        }
        for (let j = 1; j < M; j++) for (let i = 0; i < N; i++) link(idx(i, j), idx(i + 1, j), false); // keeps it round

        const geo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5, 1, true);
        const mat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.85 });
        const strands = new THREE.InstancedMesh(geo, mat, drawn.length);
        strands.castShadow = true;
        strands.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(strands);

        const gravity = new THREE.Vector3(0, -24, 0);
        const tmp = new THREE.Vector3(), mid = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
        const q = new THREE.Quaternion(), m = new THREE.Matrix4(), s = new THREE.Vector3();
        let time = 0, relaxFor = 0;

        function update(dt, ball, ballR) {
            dt = Math.min(dt, 1 / 30);
            time += dt;
            for (let k = N; k < pos.length; k++) { // verlet integrate free nodes
                const p = pos[k], o = prev[k];
                tmp.copy(p).sub(o).multiplyScalar(0.96);
                o.copy(p);
                p.add(tmp).addScaledVector(gravity, dt * dt);
                p.x += Math.sin(time * 1.3 + k) * 0.00015; // faint air movement
            }
            for (let it = 0; it < 5; it++) {
                for (const [a, b, len] of links) {
                    const pa = pos[a], pb = pos[b];
                    tmp.subVectors(pb, pa);
                    const d = tmp.length() || 1e-6;
                    const diff = (d - len) / d;
                    if (a < N) pb.addScaledVector(tmp, -diff);
                    else if (b < N) pa.addScaledVector(tmp, diff);
                    else { pa.addScaledVector(tmp, diff * 0.5); pb.addScaledVector(tmp, -diff * 0.5); }
                }
                for (let k = 0; k < N; k++) pos[k].copy(rest[k]);
                if (ball) {
                    const R = ballR + 0.05;
                    for (let k = N; k < pos.length; k++) {
                        tmp.subVectors(pos[k], ball);
                        const d = tmp.length();
                        if (d < R && d > 1e-6) pos[k].copy(ball).addScaledVector(tmp, R / d);
                    }
                }
            }
            // Drift back toward the hanging shape so a knotted net always untangles. Applied after the
            // constraints so a knot can't undo it; moving the previous position by the same amount
            // keeps this from adding any velocity (no bounce).
            relaxFor = Math.max(0, relaxFor - dt);
            const pull = 1 - Math.exp(-dt * (relaxFor > 0 ? 9 : (ball ? 0.4 : 1.2)));
            for (let k = N; k < pos.length; k++) { pos[k].lerp(rest[k], pull); prev[k].lerp(rest[k], pull); }
            drawn.forEach((li, n) => {
                const [a, b] = links[li];
                tmp.subVectors(pos[b], pos[a]);
                const len = tmp.length();
                mid.copy(pos[a]).addScaledVector(tmp, 0.5);
                q.setFromUnitVectors(up, tmp.divideScalar(len || 1));
                m.compose(mid, q, s.set(1, len, 1));
                strands.setMatrixAt(n, m);
            });
            strands.instanceMatrix.needsUpdate = true;
        }
        function shake(amount) {
            for (let k = N; k < pos.length; k++) {
                prev[k].x -= (Math.random() - 0.5) * amount;
                prev[k].z -= (Math.random() - 0.5) * amount;
                prev[k].y += Math.random() * amount * 0.5;
            }
        }
        // Snap the rest shape to the settled hang, then use it as the shape the net returns to
        for (let i = 0; i < 90; i++) update(1 / 60, null, 0);
        for (let k = 0; k < pos.length; k++) { rest[k].copy(pos[k]); prev[k].copy(pos[k]); }
        function relax(seconds = 0.6) { relaxFor = seconds; }
        function drift() { let d = 0; for (let k = N; k < pos.length; k++) d = Math.max(d, pos[k].distanceTo(rest[k])); return d; }
        return { update, shake, relax, drift, mesh: strands };
    }

    function build(scene, world, { rimMaterial, backboardMaterial, envMap }) {
        const group = new THREE.Group();
        group.position.set(0, 0, START_Z);
        scene.add(group);

        const metal = new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.8, roughness: 0.35, envMap });
        const pad = new THREE.MeshStandardMaterial({ color: 0x123c8c, roughness: 0.6 });
        // Stanchion: padded base behind the baseline, slanted post, vertical strut, arm to the board
        const base = new THREE.Mesh(new THREE.BoxGeometry(5, 2.8, 3.4), pad);
        base.position.set(0, 1.4, -6.2);
        base.castShadow = base.receiveShadow = true;
        group.add(base);
        const baseTrim = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.3, 3.5), new THREE.MeshStandardMaterial({ color: 0xf2a900, roughness: 0.5 }));
        baseTrim.position.set(0, 2.7, -6.2);
        group.add(baseTrim);
        group.add(beam(new THREE.Vector3(0, 2.6, -6.0), new THREE.Vector3(0, 12.2, -1.3), 0.32, metal));
        group.add(beam(new THREE.Vector3(0, 0, -2), new THREE.Vector3(0, 10, -2), 0.22, metal));
        group.add(beam(new THREE.Vector3(0, 12.2, -1.3), new THREE.Vector3(0, 11.5, -0.62), 0.18, metal));
        const padLower = beam(new THREE.Vector3(0, 2.6, -6.0), new THREE.Vector3(0, 7.5, -3.6), 0.5, pad);
        group.add(padLower);

        // Physics: pole and backboard exactly as before
        const poleBody = new CANNON.Body({ mass: 0, material: backboardMaterial });
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        poleBody.addShape(new CANNON.Cylinder(0.3, 0.3, 10, 8), new CANNON.Vec3(0, 5, START_Z - 2), q);
        world.addBody(poleBody);
        const boardBody = new CANNON.Body({ mass: 0, material: backboardMaterial });
        boardBody.addShape(new CANNON.Box(new CANNON.Vec3(BOARD.w / 2, BOARD.h / 2, BOARD.d / 2)), new CANNON.Vec3(0, BOARD.y, START_Z + BOARD.z));
        world.addBody(boardBody);

        // Glass backboard
        const glass = new THREE.MeshPhysicalMaterial({
            color: 0xc9dcef, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.16,
            envMap, envMapIntensity: 0.45, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false
        });
        const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w, BOARD.h, BOARD.d), glass);
        boardMesh.position.set(0, BOARD.y, BOARD.z);
        boardMesh.renderOrder = 2;
        group.add(boardMesh);
        const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.55 });
        const edge = (w, h, x, y) => { const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.24), white); e.position.set(x, y, BOARD.z); group.add(e); return e; };
        edge(BOARD.w + 0.1, 0.12, 0, BOARD.y + BOARD.h / 2);
        edge(BOARD.w + 0.1, 0.12, 0, BOARD.y - BOARD.h / 2);
        edge(0.12, BOARD.h, -BOARD.w / 2, BOARD.y);
        edge(0.12, BOARD.h, BOARD.w / 2, BOARD.y);
        const bottomPad = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w + 0.2, 0.35, 0.5), pad);
        bottomPad.position.set(0, BOARD.y - BOARD.h / 2 - 0.15, BOARD.z);
        group.add(bottomPad);
        // Shooter's square
        const sq = { w: 2.0, h: 1.5, y: 11.0, z: BOARD.z + 0.12 };
        const sqLines = [
            [sq.w, 0.08, 0, sq.y + sq.h / 2], [sq.w, 0.08, 0, sq.y - sq.h / 2],
            [0.08, sq.h, -sq.w / 2, sq.y], [0.08, sq.h, sq.w / 2, sq.y]
        ].map(([w, h, x, y]) => { const l = new THREE.Mesh(new THREE.PlaneGeometry(w, h), white); l.position.set(x, y, sq.z); group.add(l); return l; });
        const innerSquare = sqLines[0];

        // LED edge: aim-assist glow (green/yellow) and red flash on a make
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
        const led = new THREE.Group();
        [[BOARD.w + 0.3, 0.12, 0, BOARD.h / 2 + 0.08], [BOARD.w + 0.3, 0.12, 0, -BOARD.h / 2 - 0.08],
         [0.12, BOARD.h + 0.3, -BOARD.w / 2 - 0.08, 0], [0.12, BOARD.h + 0.3, BOARD.w / 2 + 0.08, 0]].forEach(([w, h, x, y]) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ledMat);
            m.position.set(x, BOARD.y + y, BOARD.z + 0.13);
            led.add(m);
        });
        group.add(led);
        let flashUntil = 0;
        function setBoardGlow(color, intensity) {
            if (performance.now() < flashUntil) return;
            ledMat.color.setHex(color);
            ledMat.opacity = Math.max(0, Math.min(1, intensity));
        }
        function flashBoard(color = 0xff2a2a) {
            flashUntil = performance.now() + 1600;
            ledMat.color.setHex(color);
        }

        // Shot clock above the board
        const clockCanvas = document.createElement('canvas');
        clockCanvas.width = 256; clockCanvas.height = 128;
        const clockTex = new THREE.CanvasTexture(clockCanvas);
        const clock = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.6), [metal, metal, metal, metal, new THREE.MeshBasicMaterial({ map: clockTex, toneMapped: false }), metal]);
        clock.position.set(0, BOARD.y + BOARD.h / 2 + 0.75, BOARD.z - 0.1);
        group.add(clock);
        function setClock(text) {
            const c = clockCanvas.getContext('2d');
            c.fillStyle = '#080808'; c.fillRect(0, 0, 256, 128);
            c.fillStyle = '#ff2a2a'; c.font = 'bold 104px "Courier New", monospace';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(String(text), 128, 70);
            clockTex.needsUpdate = true;
        }
        setClock('24');

        // Rim
        const rimMat = new THREE.MeshStandardMaterial({ color: 0xff4d00, metalness: 0.55, roughness: 0.32, envMap, emissive: 0x000000 });
        const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(RIM.r, 0.065, 16, 48), rimMat);
        rimMesh.rotation.x = Math.PI / 2;
        rimMesh.position.set(0, RIM.y, RIM.z);
        rimMesh.castShadow = true;
        group.add(rimMesh);
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, RIM.z - BOARD.z - RIM.r + 0.2), new THREE.MeshStandardMaterial({ color: 0xff4d00, metalness: 0.5, roughness: 0.4 }));
        mount.position.set(0, RIM.y - 0.05, BOARD.z + (RIM.z - BOARD.z - RIM.r) / 2 + 0.05);
        group.add(mount);
        const rimHalo = new THREE.Mesh(new THREE.TorusGeometry(RIM.r + 0.18, 0.1, 12, 48),
            new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, toneMapped: false, depthWrite: false }));
        rimHalo.rotation.x = Math.PI / 2;
        rimHalo.position.copy(rimMesh.position);
        rimHalo.visible = false;
        group.add(rimHalo);

        const rimBody = new CANNON.Body({ mass: 0, material: rimMaterial });
        const SEG = 16;
        for (let i = 0; i < SEG; i++) {
            const a = (i / SEG) * Math.PI * 2;
            rimBody.addShape(new CANNON.Sphere(RIM.tube), new CANNON.Vec3(Math.cos(a) * RIM.r, RIM.y, START_Z + RIM.z + Math.sin(a) * RIM.r));
        }
        world.addBody(rimBody);

        const net = buildNet(scene);

        function update(dt, now) {
            if (now < flashUntil) {
                ledMat.opacity = 0.55 + 0.45 * Math.abs(Math.sin(now / 70));
            } else if (flashUntil && now >= flashUntil) {
                flashUntil = 0; ledMat.opacity = 0;
            }
        }

        return { group, boardMesh, boardBody, poleBody, rimMesh, rimHalo, rimBody, innerSquare, net, setBoardGlow, flashBoard, setClock, update,
                 RIM_CENTER: new THREE.Vector3(0, RIM.y, START_Z + RIM.z), RIM_RADIUS: RIM.r };
    }

    window.BB = window.BB || {};
    window.BB.Hoop = { build, START_Z };
})();
