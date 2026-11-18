/**
 * NARBE Build n Ride - sky, sun, light, fog and clouds.
 *
 * A vertex-coloured gradient dome that follows the camera, a hemisphere
 * light, one sun (the only shadow caster, following the train), soft fog that
 * melts the far world into the horizon, a sun disc and a few puffy low-poly
 * clouds drifting overhead.
 *
 * setPalette() takes the whole look at once; js/weather.js blends palettes
 * by the time of day and the weather every frame. At night there are stars
 * and a moon (palette.stars 0..1); after rain, a rainbow (setRainbow).
 */

window.BNR = window.BNR || {};

BNR.Sky = (function () {
    'use strict';

    const PALETTES = {
        day: {
            top: '#3a86d8', mid: '#86c4ef', horizon: '#dcf0f9', fog: '#cfe6f2', fogNear: 150, fogFar: 430,
            hemiSky: '#d8ecff', hemiGround: '#8a7d5c', hemi: 1.35, sun: '#fff2d8', sunI: 2.7, sunDir: [-0.45, 0.78, 0.42],
            cloud: '#ffffff', sunDisc: '#fff6d6'
        }
    };

    function create(THREE, scene, o) {
        o = o || {};
        const group = new THREE.Group();
        group.name = 'sky';
        scene.add(group);

        // --- dome ---------------------------------------------------------------------------
        const R = 900;
        const domeGeo = new THREE.SphereGeometry(R, 32, 16);
        domeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(domeGeo.attributes.position.count * 3), 3));
        const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
        dome.renderOrder = -10;
        dome.frustumCulled = false;
        group.add(dome);

        // --- lights -------------------------------------------------------------------------
        const hemi = new THREE.HemisphereLight(0xd8ecff, 0x8a7d5c, 1.35);
        const sun = new THREE.DirectionalLight(0xfff2d8, 2.7);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.bias = -0.0005;
        sun.shadow.normalBias = 0.04;
        const SH = 75;
        Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 400 });
        sun.shadow.camera.updateProjectionMatrix();
        scene.add(hemi, sun, sun.target);

        // --- sun disc and clouds ------------------------------------------------------------
        const disc = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6d6'), fog: false, transparent: true, opacity: 0.95, depthWrite: false }));
        disc.renderOrder = -9;
        group.add(disc);

        const cloudB = BNR.Geo.builder();
        [[0, 0, 0, 1.3], [1.4, -0.25, 0.1, 1.0], [-1.35, -0.3, 0, 0.95], [0.55, 0.55, -0.1, 0.9], [-0.6, 0.42, 0.2, 0.8], [2.4, -0.45, 0, 0.7]].forEach(function (p) {
            cloudB.shape('ico', p[0], p[1], p[2], p[3] * 2, p[3] * 1.7, p[3] * 2, '#ffffff', { shade: 0.08 });
        });
        const cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#dfe9f5'), emissiveIntensity: 0.45, fog: false });
        const CLOUDS = 18;
        const clouds = new THREE.InstancedMesh(cloudB.geometry(), cloudMat, CLOUDS);
        clouds.frustumCulled = false;
        group.add(clouds);
        const rnd = BNR.Util.mulberry(o.seed || 9);
        const cl = [];
        for (let i = 0; i < CLOUDS; i++) cl.push({ x: (rnd() - 0.5) * 900, z: (rnd() - 0.5) * 900, y: 95 + rnd() * 45, s: 6 + rnd() * 6, ry: rnd() * 6, sp: 1.2 + rnd() * 1.4 });
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();

        // --- stars, moon and rainbow ---------------------------------------------------------
        const starGeo = new THREE.BufferGeometry();
        (function () {
            const n = 900, pos = new Float32Array(n * 3), r = BNR.Util.mulberry(77);
            for (let i = 0; i < n; i++) {
                const a = r() * Math.PI * 2, y = 0.05 + Math.pow(r(), 0.8) * 0.95, rr = Math.sqrt(1 - y * y);
                pos[i * 3] = Math.cos(a) * rr * 820; pos[i * 3 + 1] = y * 820; pos[i * 3 + 2] = Math.sin(a) * rr * 820;
            }
            starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        })();
        const starMat = new THREE.PointsMaterial({ color: new THREE.Color('#ffffff'), size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
        const stars = new THREE.Points(starGeo, starMat);
        stars.frustumCulled = false;
        stars.renderOrder = -9;
        group.add(stars);
        const moon = new THREE.Mesh(new THREE.CircleGeometry(18, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#eef2ff'), fog: false, transparent: true, opacity: 0, depthWrite: false }));
        moon.renderOrder = -9;
        group.add(moon);
        const rainbow = new THREE.Group();
        const bowMats = [];
        ['#ff4d4d', '#ff9f43', '#ffe14d', '#5fd36b', '#4da6ff', '#6a5cff', '#b06cff'].forEach(function (c, i) {
            const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c), transparent: true, opacity: 0, fog: false, depthWrite: false, side: THREE.DoubleSide });
            bowMats.push(m);
            rainbow.add(new THREE.Mesh(new THREE.TorusGeometry(300 - i * 7, 3.6, 4, 64, Math.PI), m));
        });
        rainbow.visible = false;
        group.add(rainbow);
        let bowK = 0;

        let pal = null;
        const focus = new THREE.Vector3();
        const sunDir = new THREE.Vector3(-0.45, 0.78, 0.42).normalize();
        let cloudsOn = true, time = 0;

        function paintDome(top, mid, hor) {
            const c0 = new THREE.Color(top), c1 = new THREE.Color(mid), c2 = new THREE.Color(hor), c = new THREE.Color();
            const pos = domeGeo.attributes.position, col = domeGeo.attributes.color;
            for (let i = 0; i < pos.count; i++) {
                let y = pos.getY(i) / R;
                y = y < 0 ? 0 : y;
                const t = 1 - Math.pow(y, 0.62);
                if (t < 0.55) c.copy(c0).lerp(c1, t / 0.55); else c.copy(c1).lerp(c2, (t - 0.55) / 0.45);
                col.setXYZ(i, c.r, c.g, c.b);
            }
            col.needsUpdate = true;
        }

        /** Set the whole look: dome colours, fog, lights, sun direction, clouds. */
        function setPalette(p) {
            pal = Object.assign({}, PALETTES.day, p || {});
            paintDome(pal.top, pal.mid, pal.horizon);
            if (!scene.fog) scene.fog = new THREE.Fog(pal.fog, pal.fogNear, pal.fogFar);
            scene.fog.color.set(pal.fog); scene.fog.near = pal.fogNear; scene.fog.far = pal.fogFar;
            scene.background = new THREE.Color(pal.horizon);
            hemi.color.set(pal.hemiSky); hemi.groundColor.set(pal.hemiGround); hemi.intensity = pal.hemi;
            sun.color.set(pal.sun); sun.intensity = pal.sunI;
            sunDir.fromArray(pal.sunDir).normalize();
            disc.material.color.set(pal.sunDisc);
            disc.visible = sunDir.y > -0.05 && (pal.discK === undefined || pal.discK > 0.02);
            disc.material.opacity = 0.95 * (pal.discK === undefined ? 1 : pal.discK);
            cloudMat.color.set(pal.cloud);
            cloudMat.emissive.set(pal.cloud).multiplyScalar(0.5);
            starMat.opacity = pal.stars || 0;
            stars.visible = starMat.opacity > 0.01;
            moon.material.opacity = pal.stars || 0;
            moon.visible = moon.material.opacity > 0.01;
            place();
        }

        function place() {
            dome.position.set(focus.x, 0, focus.z);
            sun.target.position.copy(focus);
            sun.position.copy(focus).addScaledVector(sunDir, 160);
            // Snap the shadow camera to its texels so shadows don't shimmer as the train moves.
            const texel = (2 * SH) / sun.shadow.mapSize.x;
            sun.target.position.x = Math.round(sun.target.position.x / texel) * texel;
            sun.target.position.z = Math.round(sun.target.position.z / texel) * texel;
            sun.position.copy(sun.target.position).addScaledVector(sunDir, 160);
            disc.position.copy(focus).addScaledVector(sunDir, R * 0.82);
            disc.lookAt(focus);
            stars.position.set(focus.x, 0, focus.z);
            // The moon rides high on the far side from where the sun set.
            moon.position.set(focus.x - 380, 430, focus.z - 320);
            moon.lookAt(focus);
            if (rainbow.visible) {
                // Opposite the sun, standing on the horizon, facing us.
                const ax = -sunDir.x, az = -sunDir.z, l = Math.hypot(ax, az) || 1;
                rainbow.position.set(focus.x + ax / l * 560, -70, focus.z + az / l * 560);
                rainbow.lookAt(focus.x, -70, focus.z);
            }
        }

        function update(dt, fx, fy, fz) {
            time += dt;
            focus.set(fx, fy || 0, fz);
            place();
            if (!cloudsOn) { clouds.visible = false; return; }
            clouds.visible = true;
            for (let i = 0; i < cl.length; i++) {
                const c = cl[i];
                c.x += c.sp * dt;
                // Wrap clouds round the focus so the sky never empties.
                if (c.x - fx > 450) c.x -= 900; if (c.x - fx < -450) c.x += 900;
                if (c.z - fz > 450) c.z -= 900; if (c.z - fz < -450) c.z += 900;
                q.setFromEuler(e.set(0, c.ry, 0));
                m4.compose(p3.set(c.x, c.y, c.z), q, s3.set(c.s, c.s * 0.8, c.s));
                clouds.setMatrixAt(i, m4);
            }
            clouds.instanceMatrix.needsUpdate = true;
        }

        setPalette(PALETTES.day);

        return {
            group: group,
            dome: dome,
            hemi: hemi,
            sun: sun,
            setPalette: setPalette,
            palette: function () { return pal; },
            update: update,
            setClouds: function (on) { cloudsOn = !!on; },
            /** A rainbow after rain: k 0 (gone) .. 1 (bright). */
            setRainbow: function (k) {
                bowK = k;
                rainbow.visible = k > 0.01;
                bowMats.forEach(m => { m.opacity = 0.32 * k; });
            },
            setShadows: function (on, size) {
                sun.castShadow = !!on;
                if (size && sun.shadow.mapSize.x !== size) {
                    sun.shadow.mapSize.set(size, size);
                    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
                }
            },
            dispose: function () {
                scene.remove(group, hemi, sun, sun.target);
                domeGeo.dispose(); dome.material.dispose(); disc.geometry.dispose(); disc.material.dispose();
                clouds.geometry.dispose(); cloudMat.dispose();
            }
        };
    }

    return { create: create, PALETTES: PALETTES };
})();
