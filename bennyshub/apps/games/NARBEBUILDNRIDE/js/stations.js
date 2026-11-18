/**
 * NARBE Build n Ride - stations and the people on them.
 *
 * One station per zone (BNR.Track.stationSites picks the longest level, straight
 * run in each zone). Each has a platform beside the track, a canopy with
 * benches, a little station house in its biome's style, lamps, flower boxes and
 * a sign at each end with the zone's name. A few low-poly people stand on the
 * platform; they wave while a train is in.
 *
 * Station local frame: u along the track (direction of travel), w across it
 * toward the platform side, y up from the rails' formation level.
 *
 * Everything for all stations is one merged mesh, one glowing mesh (lamps), one
 * window mesh, one sign mesh per station and one pool-of-lamplight mesh; all the
 * people are six InstancedMeshes. setNight(k) lights the windows and lamps.
 */

window.BNR = window.BNR || {};

BNR.Stations = (function () {
    'use strict';

    const U = BNR.Util;
    const HALF = 20;                 // half the platform length
    const W0 = 1.75, W1 = 5.4;       // platform from the track edge to its back
    const TOP = 0.95;                // platform top above the formation
    const STYLES = {
        meadow: { wall: '#f1e3c4', roof: '#b5452e', trim: '#5b3b2a', canopy: '#2f5f3a' },
        farm: { wall: '#c7553b', roof: '#5a4a44', trim: '#f2ead6', canopy: '#7a3b2b' },
        forest: { wall: '#9a6a43', roof: '#3f6b45', trim: '#5d3b22', canopy: '#5d3b22' },
        lake: { wall: '#e8f0f4', roof: '#2f5f9e', trim: '#2f4a6b', canopy: '#2f5f9e' },
        mountains: { wall: '#a39c92', roof: '#40464f', trim: '#6b4a33', canopy: '#40464f' },
        desert: { wall: '#e0b77f', roof: '#b0643c', trim: '#7a4a2a', canopy: '#7a4a2a' },
        snowfield: { wall: '#b5583c', roof: '#eef3f7', trim: '#f2ead6', canopy: '#5b3b2a' },
        town: { wall: '#b5583c', roof: '#4d5866', trim: '#f2ead6', canopy: '#2f3f5f' },
        coast: { wall: '#f4f1ea', roof: '#3a6ea5', trim: '#1f3550', canopy: '#3a6ea5' },
        city: { wall: '#8f4a3a', roof: '#3a404a', trim: '#d9d2c3', canopy: '#2b3340' },
        snowforest: { wall: '#7a5236', roof: '#eef3f7', trim: '#4a2f1d', canopy: '#4a2f1d' },
        snowvillage: { wall: '#e9dcc3', roof: '#eef3f7', trim: '#7a4a2a', canopy: '#7a4a2a' },
        oasis: { wall: '#d9a66b', roof: '#a8573a', trim: '#2f7f8a', canopy: '#2f7f8a' },
        redrock: { wall: '#c9875a', roof: '#7a3b22', trim: '#5a3220', canopy: '#5a3220' },
        dunes: { wall: '#ead1a0', roof: '#c07a45', trim: '#7a4a2a', canopy: '#a35f3a' },
        alpine: { wall: '#f2ead6', roof: '#6b3a2a', trim: '#4a5a3a', canopy: '#6b3a2a' }
    };
    const SHIRTS = ['#e2453c', '#2f6fd0', '#3fa84f', '#f2c230', '#7a4fc9', '#f28c28', '#1e9c8f', '#ec6fa6', '#ffffff'];
    const PANTS = ['#2f3a56', '#4a3b30', '#2b2b33', '#5c6b7a', '#3f5f3a', '#7b5a3c'];
    const SKIN = ['#f1c7a5', '#e0ac85', '#c68b62', '#a26a45', '#7a4b2e', '#5a3524'];
    const HAIR = ['#2b2220', '#5a3b22', '#a6743d', '#e2c27a', '#8a8a8a', '#b5462b'];

    function create(THREE, o) {
        const track = o.track;
        const c = track.centerline();
        const root = new THREE.Group();
        root.name = 'stations';
        (o.parent || o.scene).add(root);
        const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
        // Windows: dark glass by day, warm light at night.
        const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0 });
        const lampSpots = [];
        const signMats = [], signGeos = [];
        let boardGeo = null;               // every name board is the same size: one geometry
        const rand = U.mulberry((o.seed || 7) | 0);
        const sites = o.sites || track.stationSites();
        const list = [];

        sites.forEach(function (site, k) {
            const p = track.pieces[site.piece];
            const q = BNR.Track.piecePoint(p, site.at);
            const idx = (c.startIndex[site.piece] + Math.round(site.at * Math.max(2, Math.round(p.len)))) % c.n;
            const y0 = c.y[idx];
            const sCenter = c.s[c.startIndex[site.piece]] + p.len * site.at;
            const side = site.side;
            const f = { x: q.x, y: y0, z: q.z, ux: q.tx, uz: q.tz, wx: -q.tz * side, wz: q.tx * side };
            const st = { index: k, name: site.name, biome: site.biome, zone: site.zone, side: side, frame: f, sCenter: sCenter, people: [], waving: 0 };
            buildStation(st);
            list.push(st);
        });

        /** World point from station coordinates. */
        function P(f, u, w, y) { return [f.x + f.ux * u + f.wx * w, f.y + y, f.z + f.uz * u + f.wz * w]; }
        function ang(f) { return Math.atan2(f.ux, f.uz); }

        /** A box in station coordinates (u along, w across, sizes along those axes). */
        function box(b, f, u, w, y, su, sw, sy, col) {
            const p = P(f, u, w, y);
            // Box local z follows the track; local x lies across it (the box is symmetric).
            b.box(p[0], p[1], p[2], sw, sy, su, col, { ry: ang(f) });
        }

        /** One flat face whose normal must point toward `out` (flipped if wound the other way). */
        function face(b, pts, out, col) {
            const a = pts[0], e1 = [pts[1][0] - a[0], pts[1][1] - a[1], pts[1][2] - a[2]], e2 = [pts[2][0] - a[0], pts[2][1] - a[1], pts[2][2] - a[2]];
            const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
            if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) pts = pts.slice().reverse();
            if (pts.length === 3) b.tri(pts[0], pts[1], pts[2], col); else b.quad(pts[0], pts[1], pts[2], pts[3], col);
        }

        /** The sloping ramp at a platform end: e = -1 (start) or 1 (end). */
        function ramp(b, f, e, col) {
            const u0 = e * HALF, u1 = e * (HALF + 3.4), yb = -0.4;
            const A = (u, w, y) => P(f, u, w, y);
            const up = [0, 1, 0], wv = [f.wx, 0, f.wz], uv = [f.ux * e, 0, f.uz * e];
            face(b, [A(u0, W0, TOP), A(u0, W1, TOP), A(u1, W1, yb + 0.05), A(u1, W0, yb + 0.05)], [up[0] + uv[0] * 0.3, 1, up[2] + uv[2] * 0.3], col);
            face(b, [A(u0, W0, TOP), A(u1, W0, yb + 0.05), A(u0, W0, yb)], [-wv[0], 0, -wv[2]], '#a39b8f');
            face(b, [A(u0, W1, TOP), A(u1, W1, yb + 0.05), A(u0, W1, yb)], wv, '#a39b8f');
        }

        /**
         * One station's own meshes, in its own group: a long loop's many stations are each culled
         * by the camera and hidden when far off (cull()), instead of one mesh drawn everywhere.
         */
        function buildStation(st) {
            const f = st.frame;
            const sty = STYLES[st.biome] || STYLES.meadow;
            const solid = BNR.Geo.builder(), glow = BNR.Geo.builder(), glass = BNR.Geo.builder();
            st.group = new THREE.Group();
            st.group.name = 'station ' + st.name;
            root.add(st.group);
            const wm = (W0 + W1) / 2, ww = W1 - W0;
            // Platform: buried base, stone face, coping and the yellow line.
            box(solid, f, 0, wm, (TOP - 1.6) / 2, HALF * 2, ww, TOP + 1.6, '#b9b2a6');
            box(solid, f, 0, W0 + 0.22, TOP + 0.04, HALF * 2, 0.44, 0.1, '#e4ddcf');
            box(solid, f, 0, W0 + 0.62, TOP + 0.02, HALF * 2, 0.16, 0.06, '#f2c230');
            // Ramps down at both ends.
            [-1, 1].forEach(e => ramp(solid, f, e, '#b0a99c'));
            // Canopy: green iron posts, a sloping roof and a valance.
            for (let u = -7.5; u <= 7.5; u += 5) {
                [2.85, 4.85].forEach(w => box(solid, f, u, w, TOP + 1.7, 0.18, 0.18, 3.4, sty.canopy));
            }
            box(solid, f, 0, 3.85, TOP + 3.55, 17.4, 3.6, 0.22, sty.roof);
            box(solid, f, 0, 2.1, TOP + 3.3, 17.4, 0.08, 0.42, '#f2ead6');
            // Benches.
            [-4, 4].forEach(function (u) {
                box(solid, f, u, 4.55, TOP + 0.45, 2.2, 0.5, 0.1, '#8a5a33');
                box(solid, f, u, 4.8, TOP + 0.75, 2.2, 0.08, 0.5, '#8a5a33');
                [-0.9, 0.9].forEach(d => box(solid, f, u + d, 4.6, TOP + 0.22, 0.1, 0.45, 0.45, '#2b2b33'));
            });
            // The station house behind the platform.
            const hu = 0, hw = W1 + 2.3;
            box(solid, f, hu, hw, TOP + 1.75, 10, 4.6, 3.5, sty.wall);
            const rp = P(f, hu, hw, TOP + 4.25);
            solid.shape('prism', rp[0], rp[1], rp[2], 5.4, 1.6, 11, sty.roof, { ry: ang(f) });
            box(solid, f, 2.6, hw + 0.9, TOP + 4.9, 0.7, 0.7, 1.6, '#8a5a44');
            box(solid, f, 0, W1 - 0.03, TOP + 1.05, 1.4, 0.1, 2.1, sty.trim);                      // door
            [-3.2, -1.7, 1.7, 3.2].forEach(u => box(glass, f, u, W1 - 0.03, TOP + 1.9, 0.9, 0.1, 1.0, '#33445e'));
            box(solid, f, 0, W1 - 0.05, TOP + 2.75, 1.0, 0.1, 1.0, '#ffffff');                    // clock face
            box(solid, f, 0.15, W1 - 0.1, TOP + 2.8, 0.06, 0.08, 0.38, '#2b2b33');
            box(solid, f, -0.12, W1 - 0.1, TOP + 2.75, 0.32, 0.08, 0.06, '#2b2b33');
            // Lamps, with warm glass.
            [-16, -9, 9, 16].forEach(function (u) {
                box(solid, f, u, 4.9, TOP + 1.7, 0.16, 0.16, 3.4, '#2b2b33');
                const g = P(f, u, 4.9, TOP + 3.55);
                glow.box(g[0], g[1], g[2], 0.42, 0.5, 0.42, '#ffe2a0', { ry: ang(f) });
                lampSpots.push(P(f, u, 3.75, TOP + 0.1));
                box(solid, f, u, 4.9, TOP + 3.9, 0.6, 0.6, 0.14, '#2b2b33');
            });
            // Flower boxes along the back.
            [-13, -11, 11, 13].forEach(function (u) {
                box(solid, f, u, 5.0, TOP + 0.25, 1.6, 0.5, 0.5, '#8a5a33');
                const fl = P(f, u, 5.0, TOP + 0.6);
                solid.blob(fl[0], fl[1], fl[2], 1.5, 0.35, 0.45, function (cx, cy, cz) { return ['#ff6b8b', '#ffd84a', '#ffffff', '#b98cff'][Math.abs(Math.round(cx * 3 + cz * 5)) % 4]; }, { round: 0.6, segs: 3, ry: ang(f) });
            });
            // Signs at both ends, facing the track.
            [-12.5, 12.5].forEach(u => sign(st, u, solid));
            // People.
            const n = 4 + Math.floor(rand() * 3);
            for (let i = 0; i < n; i++) {
                const kid = rand() < 0.3;
                st.people.push({
                    u: -14 + rand() * 28, w: 2.9 + rand() * 1.5, yaw: (rand() - 0.5) * 0.7, s: kid ? 0.68 : 0.95 + rand() * 0.12,
                    shirt: SHIRTS[Math.floor(rand() * SHIRTS.length)], pants: PANTS[Math.floor(rand() * PANTS.length)],
                    skin: SKIN[Math.floor(rand() * SKIN.length)], hair: HAIR[Math.floor(rand() * HAIR.length)],
                    phase: rand() * 6, both: kid && rand() < 0.6
                });
            }
            if (solid.count()) { const m = new THREE.Mesh(solid.geometry(), solidMat); m.castShadow = true; m.receiveShadow = true; m.name = 'station buildings'; st.group.add(m); }
            if (glow.count()) { const g = new THREE.Mesh(glow.geometry(), glowMat); g.name = 'station lamps'; st.group.add(g); }
            if (glass.count()) { const g = new THREE.Mesh(glass.geometry(), glassMat); g.name = 'station windows'; st.group.add(g); }
        }

        /**
         * A name board on two posts: the name painted on a canvas texture, unlit so it reads at
         * night too. A station's two boards share one picture.
         */
        function sign(st, u, solid) {
            const f = st.frame;
            const w = 4.3;
            [-1.9, 1.9].forEach(d => box(solid, f, u + d, w, TOP + 1.3, 0.14, 0.14, 2.6, '#2b2b33'));
            box(solid, f, u, w + 0.05, TOP + 2.45, 4.4, 0.12, 1.05, '#1f2f4f');
            if (!st.signMat) st.signMat = signPicture(st.name);
            const mesh = new THREE.Mesh(signGeo(), st.signMat);
            const p = P(f, u, w - 0.03, TOP + 2.45);
            mesh.position.set(p[0], p[1], p[2]);
            // Face the track (toward -w).
            mesh.lookAt(p[0] - f.wx, p[1], p[2] - f.wz);
            st.group.add(mesh);
        }

        function signGeo() { if (!boardGeo) { boardGeo = new THREE.PlaneGeometry(4.2, 0.92); signGeos.push(boardGeo); } return boardGeo; }

        /** A station's name, painted once. */
        function signPicture(name) {
            const cv = document.createElement('canvas');
            cv.width = 512; cv.height = 112;
            const g = cv.getContext('2d');
            g.fillStyle = '#21407a'; g.fillRect(0, 0, 512, 112);
            g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(8, 8, 496, 96);
            g.fillStyle = '#ffffff';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            let size = 64;
            g.font = '800 ' + size + 'px "Baloo 2", "Arial Rounded MT Bold", Arial, sans-serif';
            while (size > 28 && g.measureText && g.measureText(name).width > 470) { size -= 4; g.font = '800 ' + size + 'px "Baloo 2", Arial, sans-serif'; }
            g.fillText(name, 256, 60);
            const tex = new THREE.CanvasTexture(cv);
            tex.colorSpace = THREE.SRGBColorSpace;
            const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
            signMats.push(mat);
            return mat;
        }

        // Pools of warm lamplight on the platform at night (additive: they only ever brighten).
        let pools = null, poolMat = null, poolTex = null;
        if (lampSpots.length) {
            const cv = document.createElement('canvas');
            cv.width = cv.height = 64;
            const g2 = cv.getContext('2d');
            const gr = g2.createRadialGradient(32, 32, 1, 32, 32, 31);
            gr.addColorStop(0, 'rgba(255,214,150,1)');
            gr.addColorStop(0.45, 'rgba(255,200,125,0.5)');
            gr.addColorStop(1, 'rgba(255,190,110,0)');
            g2.fillStyle = gr;
            g2.fillRect(0, 0, 64, 64);
            poolTex = new THREE.CanvasTexture(cv);
            poolTex.colorSpace = THREE.SRGBColorSpace;
            poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
            const pg = new THREE.PlaneGeometry(4.2, 4.2);
            pg.rotateX(-Math.PI / 2);
            pools = new THREE.InstancedMesh(pg, poolMat, lampSpots.length);
            const pm = new THREE.Matrix4();
            lampSpots.forEach(function (p, i) { pools.setMatrixAt(i, pm.makeTranslation(p[0], p[1], p[2])); });
            pools.instanceMatrix.needsUpdate = true;
            pools.computeBoundingSphere();
            pools.name = 'lamplight';
            pools.renderOrder = 2;
            pools.visible = false;
            root.add(pools);
        }

        /** Night: k 0 (day) .. 1 (night). Windows and lamps glow; light pools on the platforms. */
        function setNight(k) {
            glassMat.emissiveIntensity = 0.95 * k;
            glowMat.color.setScalar(0.62 + 0.55 * k);
            if (pools) { poolMat.opacity = 0.5 * k; pools.visible = k > 0.02; }
        }
        setNight(0);

        // --- people ------------------------------------------------------------------------------
        const parts = {
            legs: function (b) {
                [-0.11, 0.11].forEach(x => { b.box(x, 0.42, 0, 0.16, 0.84, 0.2, '#ffffff'); b.box(x, 0.05, 0.04, 0.18, 0.1, 0.28, '#3a3333'); });
            },
            torso: function (b) { b.blob(0, 1.13, 0, 0.48, 0.62, 0.28, '#ffffff', { round: 0.5 }); },
            head: function (b) { b.blob(0, 1.63, 0, 0.3, 0.36, 0.32, '#ffffff', { round: 0.85 }); b.box(0, 1.6, 0.17, 0.06, 0.08, 0.05, '#e9e9e9'); },
            hair: function (b) { b.blob(0, 1.75, -0.04, 0.33, 0.17, 0.34, '#ffffff', { round: 0.8 }); },
            // Arms hang from the shoulder pivot (0, 0, 0) down -y; hands are their own part (skin colour).
            arm: function (b) { b.blob(0, -0.3, 0, 0.15, 0.64, 0.16, '#ffffff', { round: 0.5 }); },
            hand: function (b) { b.blob(0, -0.66, 0.01, 0.12, 0.14, 0.12, '#ffffff', { round: 0.8 }); }
        };
        const crowd = [];
        list.forEach(st => st.people.forEach(pp => { pp.station = st; crowd.push(pp); }));
        const peopleMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        const meshes = {};
        const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
        const armM = new THREE.Matrix4(), rot = new THREE.Matrix4();
        if (crowd.length) {
            Object.keys(parts).forEach(function (k) {
                const b = BNR.Geo.builder();
                parts[k](b);
                const count = k === 'arm' || k === 'hand' ? crowd.length * 2 : crowd.length;
                const im = new THREE.InstancedMesh(b.geometry(), peopleMat, count);
                im.castShadow = true;
                im.name = 'people ' + k;
                root.add(im);
                meshes[k] = im;
            });
            crowd.forEach(function (pp, i) {
                const f = pp.station.frame;
                const p = P(f, pp.u, pp.w, TOP);
                // Face the track: their +z points toward -w, turned a little.
                pp.yaw0 = Math.atan2(-f.wx, -f.wz) + pp.yaw;
                tmpQ.setFromEuler(tmpE.set(0, pp.yaw0, 0));
                pp.matrix = new THREE.Matrix4().compose(tmpP.set(p[0], p[1], p[2]), tmpQ, tmpS.set(pp.s, pp.s, pp.s));
                ['legs', 'torso', 'head', 'hair'].forEach(k => meshes[k].setMatrixAt(i, pp.matrix));
                meshes.legs.setColorAt(i, tmpC.set(pp.pants));
                meshes.torso.setColorAt(i, tmpC.set(pp.shirt));
                meshes.head.setColorAt(i, tmpC.set(pp.skin));
                meshes.hair.setColorAt(i, tmpC.set(pp.hair));
                // Sleeves a shade darker than the shirt, so the arms read against the body.
                [0, 1].forEach(k => {
                    meshes.arm.setColorAt(i * 2 + k, tmpC.set(pp.shirt).multiplyScalar(0.8));
                    meshes.hand.setColorAt(i * 2 + k, tmpC.set(pp.skin));
                });
            });
            // Pose the arms BEFORE the bounds are measured: the renderer culls a whole
            // InstancedMesh by its bounding sphere, and identity matrices would put every arm
            // at the world's origin (arms then vanish whenever the origin is off screen).
            poseArms(0);
            Object.values(meshes).forEach(function (m) {
                m.instanceMatrix.needsUpdate = true;
                if (m.instanceColor) m.instanceColor.needsUpdate = true;
                m.computeBoundingSphere();
                if (m === meshes.arm || m === meshes.hand) m.boundingSphere.radius += 2;   // room to wave
            });
        }

        /** Arms: down at rest; while a train is in, one arm (kids: both) waves high. */
        function poseArms(t) {
            if (!crowd.length) return;
            crowd.forEach(function (pp, i) {
                const wave = pp.station.waving;
                [-1, 1].forEach(function (s, k) {
                    const waving = wave > 0 && (s > 0 || pp.both);
                    let a = s * 0.13;                                   // hanging at the side, just clear of the body
                    if (waving) a = s * 0.13 + s * (2.42 + 0.38 * Math.sin(t * 7.5 + pp.phase)) * Math.min(1, wave);
                    rot.makeRotationZ(a);
                    armM.makeTranslation(s * 0.33, 1.42, 0).multiply(rot);
                    tmpM.multiplyMatrices(pp.matrix, armM);
                    meshes.arm.setMatrixAt(i * 2 + k, tmpM);
                    meshes.hand.setMatrixAt(i * 2 + k, tmpM);
                });
            });
            meshes.arm.instanceMatrix.needsUpdate = true;
            meshes.hand.instanceMatrix.needsUpdate = true;
        }

        let time = 0;
        function update(dt) {
            time += dt;
            let any = false;
            list.forEach(st => { if (st.waveFor > 0) { st.waveFor -= dt; st.waving = Math.min(1, st.waving + dt * 3); any = true; } else if (st.waving > 0) { st.waving = Math.max(0, st.waving - dt * 2); any = true; } });
            if (any || time < 0.1) poseArms(time);
        }

        /** Flat ground for each platform and house (js/scene.js gives these to the terrain). */
        function pads() {
            return list.map(function (st) {
                const f = st.frame;
                return { x: f.x, z: f.z, ux: f.ux, uz: f.uz, wx: f.wx, wz: f.wz, hl: HALF + 3.5, w0: W0 - 0.2, w1: W1 + 5.2, y: f.y + 0.45 };
            });
        }

        /** Only the stations within `radius` of (x, z) are drawn (a long loop has many). */
        function cull(x, z, radius) {
            list.forEach(function (st) { st.group.visible = Math.hypot(st.frame.x - x, st.frame.z - z) < radius + 30; });
        }

        return {
            root: root,
            list: list,
            update: update,
            pads: pads,
            cull: cull,
            /** A train is in at station k: its people wave for `seconds`. */
            wave: function (k, seconds) { const st = list[k]; if (st) st.waveFor = seconds; },
            setNight: setNight,
            /** Is (x, z) on a station's platform or by its house? (Bridge legs stand elsewhere.) */
            covers: function (x, z) {
                for (const st of list) {
                    const f = st.frame, dx = x - f.x, dz = z - f.z;
                    const a = dx * f.ux + dz * f.uz, w = dx * f.wx + dz * f.wz;
                    if (Math.abs(a) < HALF + 4 && w > W0 - 0.5 && w < W1 + 5.5) return true;
                }
                return false;
            },
            dispose: function () {
                (o.parent || o.scene).remove(root);
                root.traverse(n => { if (n.isMesh && n.geometry) n.geometry.dispose(); });
                solidMat.dispose(); glowMat.dispose(); glassMat.dispose(); peopleMat.dispose();
                if (poolMat) { poolTex.dispose(); poolMat.dispose(); }
                signMats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
            }
        };
    }

    return { create: create, HALF: HALF, STYLES: STYLES };
})();
