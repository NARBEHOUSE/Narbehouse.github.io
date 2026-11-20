/**
 * NARBE Space Explorer - the space scene.
 *
 *   backdrop   the galaxy's glowing band across the sky, painted from its seed
 *              (a few rows a frame), plus thousands of crisp background stars
 *   systems    every star system within a few sectors as a bright point, with
 *              real parallax as the ship flies; the system the ship is in gets
 *              full meshes (stars, planets, moons, rings, faint orbit lines)
 *   dust       faint specks streaming past, so speed can be felt
 *   streaks    the warp jump's lines of light
 *   greeters   little saucers that fly up from an inhabited planet to say hello
 *
 * The ship mesh lives here too; js/stage.js owns the camera and the renderer.
 */

window.NSE = window.NSE || {};

NSE.Space = (function () {
    'use strict';

    const U = NSE.Util;
    const UV = NSE.Universe;
    let THREE = null;
    let scene = null, ship = null, quality = 'high', calm = false;
    let ambient = null, lights = [];
    let sky = null, skyStars = null, skyTex = null, skyJob = null, skyGalaxy = null;
    let points = null, pointsKey = '';
    let dust = null, streaks = null, warpK = 0;
    let current = null;          // { sys, parts: [{kind, mesh, ...}], orbits }
    let greeters = null;

    const SKY_R = 9000;

    function init(three, q) {
        THREE = three;
        quality = q || 'high';
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x02030a);
        // Light intensities are in physical units (three r155's default): pi times the old legacy values.
        ambient = new THREE.AmbientLight(0x8090b0, 0.32 * Math.PI);
        scene.add(ambient);
        // A faint fill from "behind you" so night sides are never pitch black.
        const fill = new THREE.DirectionalLight(0x6070a0, 0.18 * Math.PI);
        fill.position.set(-1, 0.6, 1);
        scene.add(fill);
        ship = NSE.Ship.build(THREE);
        scene.add(ship.group);
        makeDust();
        makeStreaks();
        return scene;
    }

    function setQuality(q) {
        quality = q || 'high';
        if (skyGalaxy) setGalaxy(skyGalaxy, true);
    }

    // --- the galaxy backdrop ---------------------------------------------------------------------

    function setGalaxy(g, force) {
        if (!force && skyGalaxy && skyGalaxy.seed === g.seed) return;
        skyGalaxy = g;
        const W = quality === 'high' ? 1024 : 512, H = W / 2;
        const data = new Uint8Array(W * H * 4);
        const N = U.noise3(U.hash('sky', g.seed));
        const r = U.rng(U.hash('skyr', g.seed));
        const core = U.hex(g.core), arm = U.hex(g.arm), dustC = U.hex(g.dust);
        const tilt = g.tilt, ct = Math.cos(tilt), st = Math.sin(tilt);
        const nrm = [0, ct, st];                         // the band's pole
        const coreDir = [Math.cos(r.range(0, 6.28)), 0, 0]; coreDir[2] = Math.sqrt(1 - coreDir[0] * coreDir[0]);
        // tilt the core direction into the band's plane
        const cd = [coreDir[0], -coreDir[2] * st, coreDir[2] * ct];
        // Every galaxy's sky is its own: band width and brightness, colours, big nebula clouds
        // and companion galaxies hanging in the sky, all from its seed.
        const wide = (g.skyBand || 0.17) * (g.kind === 'elliptical' ? 2.2 : g.kind === 'irregular' ? 1.6 : 1);
        const lanes = g.kind !== 'elliptical';
        const bright = g.skyBright || 1;
        const bgTint = U.mix(U.hsl(g.hue + 200, 0.5, 0.035), U.hex(g.dust || '#101018').map(v => v * 0.35), 0.5);
        const nebs = [];
        for (let i = 0; i < (g.skyNebulae || 0); i++) {
            // Mostly near the band, like real nebulae along the Milky Way.
            let d = [r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)];
            const k = d[0] * nrm[0] + d[1] * nrm[1] + d[2] * nrm[2];
            const pull = r.range(0.5, 0.95);
            d = [d[0] - nrm[0] * k * pull, d[1] - nrm[1] * k * pull, d[2] - nrm[2] * k * pull];
            const L = Math.hypot(d[0], d[1], d[2]) || 1;
            nebs.push({ d: [d[0] / L, d[1] / L, d[2] / L], size: r.range(0.2, 0.5), c: U.hex(r.pick(g.neb || [g.arm])), salt: r.range(0, 50) });
        }
        const comps = (g.companions || []).map(function (c) {
            // Off the band: a small fuzzy oval galaxy in the sky.
            const lon = c.a, el = (c.dist - 1.2) * 0.6 + 0.25;
            const v0 = [Math.cos(lon) * Math.cos(el), Math.sin(el), Math.sin(lon) * Math.cos(el)];
            const yy = v0[1] * ct - v0[2] * st, zz = v0[1] * st + v0[2] * ct;
            return { d: [v0[0], yy, zz], size: c.size * 0.6, c: U.hex(c.color), tilt: c.tilt };
        });
        function paint(y0, y1) {
            for (let y = y0; y < y1; y++) {
                const lat = ((y + 0.5) / H - 0.5) * Math.PI;
                const cl = Math.cos(lat), sl = Math.sin(lat);
                for (let x = 0; x < W; x++) {
                    const lon = x / W * Math.PI * 2;
                    const dx = -Math.cos(lon) * cl, dy = sl, dz = Math.sin(lon) * cl;
                    const b = Math.asin(U.clamp(dx * nrm[0] + dy * nrm[1] + dz * nrm[2], -1, 1));
                    const n = N.fbm(dx * 3, dy * 3, dz * 3, 4) * 0.5 + 0.5;
                    let band = Math.exp(-Math.pow(b / (wide * (0.75 + n * 0.6)), 2)) * (0.35 + n * 0.75);
                    if (g.kind === 'irregular') band *= U.smooth((N.fbm(dx * 1.5 + 4, dy * 1.5, dz * 1.5, 3) + 0.1) * 3);
                    const toCore = Math.acos(U.clamp(dx * cd[0] + dy * cd[1] + dz * cd[2], -1, 1));
                    const bulge = Math.exp(-Math.pow(toCore / 0.55, 2)) * Math.exp(-Math.pow(b / (wide * 2.2), 2));
                    let c = U.mix(arm, core, U.clamp(bulge * 1.4, 0, 1));
                    let v = band * 0.55 + bulge * 0.9;
                    if (lanes) {
                        // Soft dark dust clouds along the middle of the band.
                        const lane = N.fbm(dx * 4 + 2, dy * 4, dz * 4, 3) * 0.5 + 0.5;
                        const dark = U.smooth((lane - 0.5) / 0.22) * Math.exp(-Math.pow(b / (wide * 0.45), 2));
                        c = U.mix(c, dustC, dark * 0.55);
                        v *= 1 - dark * 0.45;
                    }
                    v *= bright;
                    // Faint coloured haze all over, so the sky is never flat black.
                    const haze = (N(dx * 1.2 + 9, dy * 1.2, dz * 1.2) * 0.5 + 0.5) * 0.6;
                    let rr = bgTint[0] * haze + c[0] * v * 0.6, gg = bgTint[1] * haze + c[1] * v * 0.6, bb = bgTint[2] * haze + c[2] * v * 0.6;
                    // Big glowing nebula clouds.
                    for (let k = 0; k < nebs.length; k++) {
                        const nb = nebs[k];
                        const ang = Math.acos(U.clamp(dx * nb.d[0] + dy * nb.d[1] + dz * nb.d[2], -1, 1));
                        if (ang < nb.size * 1.6) {
                            const f = Math.pow(1 - ang / (nb.size * 1.6), 1.6) * (0.35 + 0.8 * (N.fbm(dx * 5 + nb.salt, dy * 5, dz * 5, 4) * 0.5 + 0.5));
                            rr += nb.c[0] * f * 0.42; gg += nb.c[1] * f * 0.42; bb += nb.c[2] * f * 0.42;
                        }
                    }
                    // Companion galaxies: small fuzzy ovals with a bright middle.
                    for (let k = 0; k < comps.length; k++) {
                        const cp = comps[k];
                        const dd = dx * cp.d[0] + dy * cp.d[1] + dz * cp.d[2];
                        if (dd < 0.9) continue;
                        const ang = Math.acos(U.clamp(dd, -1, 1));
                        if (ang < cp.size * 1.4) {
                            // stretch one way, by the companion's tilt
                            const sx = dx - cp.d[0] * dd, sy = dy - cp.d[1] * dd;
                            const ax = Math.abs(Math.cos(cp.tilt) * sx + Math.sin(cp.tilt) * sy) / Math.max(1e-6, Math.hypot(sx, sy));
                            const e2 = ang / (cp.size * (0.55 + 0.45 * ax));
                            if (e2 < 1) {
                                const f = Math.pow(1 - e2, 2) * 0.55 + Math.pow(Math.max(0, 1 - e2 * 3), 2) * 0.6;
                                rr += cp.c[0] * f; gg += cp.c[1] * f; bb += cp.c[2] * f;
                            }
                        }
                    }
                    const o = (y * W + x) * 4;
                    data[o] = Math.round(U.clamp(rr, 0, 1) * 255);
                    data[o + 1] = Math.round(U.clamp(gg, 0, 1) * 255);
                    data[o + 2] = Math.round(U.clamp(bb, 0, 1) * 255);
                    data[o + 3] = 255;
                }
            }
        }
        const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
        if (skyJob) skyJob.cancelled = true;
        const job = skyJob = { row: 0, cancelled: false, H: H, rows: Math.max(1, Math.floor(16384 / W)), paint: paint, tex: tex };
        // Paint the first strip now so something shows; the rest a few rows a frame (pumpSky).
        if (!sky) {
            sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 48, 24), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false }));
            sky.renderOrder = -10;
            sky.name = 'sky';
            scene.add(sky);
        }
        job.ready = function () {
            const old = sky.material.map;
            sky.material.map = tex;
            sky.material.needsUpdate = true;
            tex.needsUpdate = true;
            if (old && old !== tex) old.dispose();
            skyTex = tex;
        };
        if (!skyTex) { paint(0, H); job.row = H; job.ready(); skyJob = null; }
        makeSkyStars(g);
    }

    function pumpSky(ms) {
        const j = skyJob;
        if (!j || j.cancelled) return;
        const until = now() + ms;
        while (j.row < j.H && now() < until) { j.paint(j.row, Math.min(j.H, j.row + j.rows)); j.row += j.rows; }
        if (j.row >= j.H) { j.ready(); skyJob = null; }
    }
    function now() { return (typeof performance !== 'undefined' ? performance : Date).now(); }
    /** Finish painting the sky at once (warp hides the moment it takes). */
    function finishSky() { if (skyJob) pumpSky(100000); }

    function makeSkyStars(g) {
        if (skyStars) { scene.remove(skyStars); skyStars.geometry.dispose(); skyStars.material.dispose(); }
        const r = U.rng(U.hash('stars', g.seed));
        const n = quality === 'low' ? 1800 : quality === 'standard' ? 3200 : 5000;
        const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
        const tilt = g.tilt, ct = Math.cos(tilt), st = Math.sin(tilt);
        for (let i = 0; i < n; i++) {
            let x, y, z;
            // Half the stars crowd toward the band.
            if (i % 2) { const a = r.range(0, Math.PI * 2), b = r.range(-0.25, 0.25) * r(); x = Math.cos(a) * Math.cos(b); const yy = Math.sin(b), zz = Math.sin(a) * Math.cos(b); y = yy * ct - zz * st; z = yy * st + zz * ct; }
            else { z = r.range(-1, 1); const a = r.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z); x = s * Math.cos(a); y = s * Math.sin(a); }
            const R = SKY_R * 0.92;
            pos[i * 3] = x * R; pos[i * 3 + 1] = y * R; pos[i * 3 + 2] = z * R;
            const gt = g.tint || [1, 1, 1];
            const t0 = r.pick([[1, 1, 1], [0.8, 0.88, 1], [1, 0.92, 0.8], [1, 0.85, 0.7], [0.85, 0.9, 1]]);
            const tint = [t0[0] * gt[0], t0[1] * gt[1], t0[2] * gt[2]];
            const b = Math.pow(r(), 2.2) * 0.9 + 0.12;
            col[i * 3] = tint[0] * b; col[i * 3 + 1] = tint[1] * b; col[i * 3 + 2] = tint[2] * b;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const mat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, map: NSE.Planets.glowTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
        skyStars = new THREE.Points(geo, mat);
        skyStars.renderOrder = -9;
        skyStars.name = 'skystars';
        scene.add(skyStars);
    }

    // --- nearby systems as points -------------------------------------------------------------------

    function refreshPoints(galaxy, pos) {
        const sec = UV.sectorOf(pos);
        const key = galaxy + ':' + sec.join(',');
        if (key === pointsKey) return;
        pointsKey = key;
        const R = quality === 'low' ? 2 : 3;
        const list = UV.systemsNear(galaxy, pos, R);
        const n = list.length;
        const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
        list.forEach(function (s, i) {
            p[i * 3] = s.pos.x; p[i * 3 + 1] = s.pos.y; p[i * 3 + 2] = s.pos.z;
            const col = U.hex(s.kind === 'blackhole' ? s.disk.color : s.kind === 'nebula' ? s.nebula.a : s.stars[0].color);
            c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2];
        });
        if (points) { scene.remove(points); points.geometry.dispose(); points.material.dispose(); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        const mat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, map: NSE.Planets.glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
        points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        points.name = 'systems';
        scene.add(points);
    }

    // --- the system the ship is in ----------------------------------------------------------------------

    function setSystem(sys) {
        if (current && sys && current.sys.id === sys.id) return;
        clearSystem();
        if (!sys) return;
        const parts = [];
        const add = function (part) { parts.push(part); scene.add(part.mesh.group); return part; };
        if (sys.kind === 'blackhole') {
            add({ kind: 'star', mesh: NSE.Planets.blackHoleMesh(sys), star: 0 });
        } else {
            sys.stars.forEach(function (s, i) { add({ kind: 'star', mesh: NSE.Planets.starMesh(s), star: i }); });
        }
        if (sys.nebula) add({ kind: 'nebula', mesh: NSE.Planets.nebulaMesh(sys) });
        sys.planets.forEach(function (p) {
            const part = add({ kind: 'planet', mesh: NSE.Planets.worldMesh(p), world: p });
            part.mesh.group.position.set(p.pos.x, p.pos.y, p.pos.z);
            p.moons.forEach(function (m) { add({ kind: 'moon', mesh: NSE.Planets.worldMesh(m), world: m, planet: p }); });
            // An advanced civilisation: space stations and satellites circling its world.
            if (p.civ) {
                const civ = add({ kind: 'civ', mesh: civOrbitals(p), planetId: p.id, planet: p });
                civ.mesh.group.position.set(p.pos.x, p.pos.y, p.pos.z);
            }
        });
        // Lights: each star lights its planets (a black hole's glowing disk lights them warm).
        lights.forEach(l => scene.remove(l));
        lights = sys.stars.map(function (s) {
            const l = new THREE.PointLight(sys.kind === 'blackhole' ? sys.disk.color : s.light, (sys.stars.length > 1 ? 1.15 : 1.6) * Math.PI, 0, 0);
            scene.add(l);
            return l;
        });
        // Faint orbit lines, so the system's shape can be seen.
        const orbits = new THREE.Group();
        orbits.name = 'orbits';
        sys.planets.forEach(function (p) {
            const pts = [];
            for (let k = 0; k <= 128; k++) {
                const a = k / 128 * Math.PI * 2;
                const q = UV.planetPos(sys, p.orbit, a);
                pts.push(new THREE.Vector3(q.x - sys.pos.x, q.y - sys.pos.y, q.z - sys.pos.z));
            }
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0.16, depthWrite: false }));
            orbits.add(line);
        });
        orbits.position.set(sys.pos.x, sys.pos.y, sys.pos.z);
        scene.add(orbits);
        current = { sys: sys, parts: parts, orbits: orbits };
    }

    function clearSystem() {
        if (!current) return;
        current.parts.forEach(function (p) { scene.remove(p.mesh.group); p.mesh.dispose(); });
        scene.remove(current.orbits);
        current.orbits.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
        lights.forEach(l => scene.remove(l));
        lights = [];
        endGreeters();
        surveyScale = {};
        surveySpread = {};
        current = null;
    }

    /** The mesh part for a world id (for the extra-detail map, scanning, snapshots). */
    function partFor(id) {
        if (!current) return null;
        return current.parts.find(p => p.world && p.world.id === id) || null;
    }

    // --- Explore System: worlds drawn bigger in the shot over the system ----------------------------

    let surveyK = 0, surveyScale = {}, surveySpread = {};

    /**
     * From high over a system, worlds a few ship-lengths across would be specks, and inner ones
     * huddle round the star. So in that shot the orbits spread out a little like a diagram
     * (NSE.Universe.surveySpread) and each planet is drawn up to eight times bigger (a small star a
     * little bigger too), never so big that it could touch a neighbour, the star or the ship; moons
     * and space stations tuck away meanwhile. Everything slides back as the camera comes down.
     * want = the radius a world should be drawn at, at least. Called by the stage once it has framed
     * the shot.
     */
    function planSurvey(want, shipPos) {
        surveyScale = {};
        surveySpread = {};
        if (!current) return;
        const lay = UV.surveyLayout(current.sys, want, shipPos);
        surveySpread = lay.spread;
        surveyScale = lay.scale;
    }

    /** A planet's place with its orbit drawn f times further out. */
    function spreadPos(p, f) {
        const c = current.sys.pos;
        return { x: c.x + (p.pos.x - c.x) * f, y: c.y + (p.pos.y - c.y) * f, z: c.z + (p.pos.z - c.z) * f };
    }
    function spreadNow(id) { return 1 + ((surveySpread[id] || 1) - 1) * surveyK; }

    /** How far into the shot over the system (0..1, eased): worlds spread, grow, and moons tuck away. */
    function setSurveyK(k) { surveyK = U.clamp(k || 0, 0, 1); }

    /** How much bigger a planet (by id, or 'star') is drawn right now. */
    function shownScale(id) { return 1 + ((surveyScale[id] || 1) - 1) * surveyK; }

    /** Where a planet is drawn right now (moved out while Explore System's shot is up), or null. */
    function shownPos(id) {
        if (!current) return null;
        const p = current.sys.planets.find(q => q.id === id);
        return p ? spreadPos(p, spreadNow(id)) : null;
    }

    // --- an inhabited world's space stations and satellites ----------------------------------------

    /**
     * Ring stations (hub, spokes, solar panels, lit windows in the people's colour) and little
     * satellites, circling just above the clouds, inside the ship's own orbit. From the
     * civilisation's seed, so the same people always have the same stations.
     */
    function civOrbitals(w) {
        const r = U.rng(U.hash('orbitals', w.civ.seed));
        const group = new THREE.Group();
        group.name = 'orbitals:' + w.name;
        const hull = new THREE.MeshLambertMaterial({ color: 0xe4e8f0 });
        const dark = new THREE.MeshLambertMaterial({ color: 0x5a6478 });
        const panel = new THREE.MeshLambertMaterial({ color: 0x2f5aa8, emissive: 0x0c1c40 });
        const lit = new THREE.MeshBasicMaterial({ color: w.civ.lights, toneMapped: false });
        const movers = [];
        const S = Math.max(1, w.radius / 12);
        const nStations = r.int(1, 2);
        for (let i = 0; i < nStations; i++) {
            const st = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2 * S, 0.32 * S, 8, 28), hull);
            const glowRing = new THREE.Mesh(new THREE.TorusGeometry(2.2 * S, 0.12 * S, 6, 28), lit);
            glowRing.scale.setScalar(1.001);
            glowRing.position.y = 0.2 * S;
            const hub = new THREE.Mesh(new THREE.SphereGeometry(0.7 * S, 12, 8), hull);
            const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * S, 0.12 * S, 3.4 * S, 6), dark);
            st.add(ring, glowRing, hub, mast);
            for (let k = 0; k < 4; k++) {
                const sp = new THREE.Mesh(new THREE.BoxGeometry(2.2 * S, 0.12 * S, 0.12 * S), dark);
                sp.rotation.y = k * Math.PI / 4;
                st.add(sp);
            }
            [-1, 1].forEach(function (s) {
                const pn = new THREE.Mesh(new THREE.BoxGeometry(2.6 * S, 0.05 * S, 1.1 * S), panel);
                pn.position.y = s * 1.7 * S;
                st.add(pn);
            });
            st.rotation.x = r.range(-0.5, 0.5);
            group.add(st);
            movers.push({ obj: st, R: w.radius * r.range(1.45, 1.75), a: r.range(0, Math.PI * 2), speed: r.range(0.05, 0.09) * r.sign(), tilt: r.range(-0.5, 0.5), spin: r.range(0.2, 0.4) });
        }
        const nSats = r.int(5, 10);
        for (let i = 0; i < nSats; i++) {
            const sat = new THREE.Group();
            sat.add(new THREE.Mesh(new THREE.BoxGeometry(0.5 * S, 0.5 * S, 0.7 * S), hull));
            [-1, 1].forEach(function (s) {
                const pn = new THREE.Mesh(new THREE.BoxGeometry(1.2 * S, 0.04 * S, 0.45 * S), panel);
                pn.position.x = s * 0.85 * S;
                sat.add(pn);
            });
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12 * S, 6, 4), lit);
            lamp.position.y = 0.32 * S;
            sat.add(lamp);
            group.add(sat);
            movers.push({ obj: sat, R: w.radius * r.range(1.25, 1.9), a: r.range(0, Math.PI * 2), speed: r.range(0.08, 0.18) * r.sign(), tilt: r.range(-1.2, 1.2), spin: r.range(0.3, 0.9), lamp: lamp });
        }
        let t = 0;
        function place(m) {
            const x = Math.cos(m.a) * m.R, z = Math.sin(m.a) * m.R;
            m.obj.position.set(x, z * Math.sin(m.tilt), z * Math.cos(m.tilt));
        }
        movers.forEach(place);
        return {
            group: group,
            update: function (dt) {
                t += dt;
                movers.forEach(function (m) {
                    m.a += m.speed * dt * (calm ? 0.6 : 1);
                    place(m);
                    m.obj.rotation.y += m.spin * dt;
                    if (m.lamp) m.lamp.visible = calm || (t + m.a) % 2 < 1.4;
                });
            },
            dispose: function () { group.traverse(n => { if (n.geometry) n.geometry.dispose(); }); [hull, dark, panel, lit].forEach(m => m.dispose()); }
        };
    }

    // --- dust and warp streaks ------------------------------------------------------------------------------

    const DUST_BOX = 260;
    function makeDust() {
        const n = 500;
        const p = new Float32Array(n * 3);
        const r = U.rng(42);
        for (let i = 0; i < n * 3; i++) p[i] = r.range(-DUST_BOX / 2, DUST_BOX / 2);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
        dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9fb4d8, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, map: NSE.Planets.glowTexture(), blending: THREE.AdditiveBlending }));
        dust.frustumCulled = false;
        dust.name = 'dust';
        dust.userData.offset = new THREE.Vector3();
        scene.add(dust);
    }

    /** Keep the dust in a box round the camera, wrapping, so it streams past as the ship moves. */
    function stepDust(cam) {
        const a = dust.geometry.attributes.position;
        const B = DUST_BOX, h = B / 2;
        dust.position.set(0, 0, 0);
        for (let i = 0; i < a.count; i++) {
            let x = a.getX(i), y = a.getY(i), z = a.getZ(i);
            x = cam.x + (((x - cam.x + h) % B) + B) % B - h;
            y = cam.y + (((y - cam.y + h) % B) + B) % B - h;
            z = cam.z + (((z - cam.z + h) % B) + B) % B - h;
            a.setXYZ(i, x, y, z);
        }
        a.needsUpdate = true;
        dust.material.opacity = calm ? 0.25 : 0.55;
    }

    function makeStreaks() {
        const n = 420;
        const p = new Float32Array(n * 6), c = new Float32Array(n * 6);
        const r = U.rng(7);
        for (let i = 0; i < n; i++) {
            const a = r.range(0, Math.PI * 2), rad = r.range(8, 70), z = r.range(-400, 40);
            const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
            p.set([x, y, z, x, y, z - 1], i * 6);
            const col = r.pick([[0.7, 0.85, 1], [1, 1, 1], [0.8, 0.7, 1], [0.6, 0.9, 1]]);
            c.set([col[0], col[1], col[2], col[0] * 0.2, col[1] * 0.2, col[2] * 0.4], i * 6);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        streaks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        streaks.frustumCulled = false;
        streaks.visible = false;
        streaks.name = 'streaks';
        streaks.userData.base = p.slice();
        scene.add(streaks);
    }

    /** k 0..1: how hard the warp is pulling (lines stretch and rush past). */
    function setWarp(k) { warpK = k; }

    function stepStreaks(dt, camera) {
        streaks.visible = warpK > 0.01;
        if (!streaks.visible) return;
        streaks.position.copy(camera.position);
        streaks.quaternion.copy(camera.quaternion);
        const a = streaks.geometry.attributes.position, base = streaks.userData.base;
        const L = 2 + warpK * warpK * (calm ? 40 : 160);
        const speed = (calm ? 120 : 400) * warpK;
        for (let i = 0; i < a.count; i += 2) {
            let z = a.getZ(i) + speed * dt;
            if (z > 40) z -= 440;
            const x = base[i * 3], y = base[i * 3 + 1];
            a.setXYZ(i, x, y, z);
            a.setXYZ(i + 1, x, y, z - L);
        }
        a.needsUpdate = true;
        streaks.material.opacity = Math.min(1, warpK * 1.4) * (calm ? 0.5 : 0.9);
    }

    // --- greeters: saucers from an inhabited planet ---------------------------------------------------

    function saucer(color) {
        const g = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8), new THREE.MeshLambertMaterial({ color: 0xd8dde8 }));
        hull.scale.set(1, 0.32, 1);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x9fe8ff, emissive: 0x2a6a88 }));
        dome.position.y = 0.25;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 6, 20), new THREE.MeshBasicMaterial({ color: color, toneMapped: false }));
        ring.rotation.x = Math.PI / 2;
        g.add(hull, dome, ring);
        return g;
    }

    /** Little ships rise from the planet, come over to the player's ship, circle it, then go home. */
    function startGreeters(world, count) {
        endGreeters();
        const r = U.rng(U.hash('greet', world.seed, Date.now() & 0xffff));
        const list = [];
        for (let i = 0; i < count; i++) {
            const m = saucer(world.civ.lights);
            scene.add(m);
            const dir = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
            list.push({ mesh: m, dir: dir, phase: r.range(0, Math.PI * 2), radius: r.range(9, 15), delay: i * 0.8, t: 0 });
        }
        greeters = { world: world, list: list, t: 0, life: 26 };
        return list.length;
    }

    function stepGreeters(dt, shipPos) {
        if (!greeters) return;
        greeters.t += dt;
        const W = greeters.world;
        const c = new THREE.Vector3(W.pos.x, W.pos.y, W.pos.z);
        const sp = new THREE.Vector3(shipPos.x, shipPos.y, shipPos.z);
        greeters.list.forEach(function (g) {
            const t = greeters.t - g.delay;
            g.mesh.visible = t > 0;
            if (t <= 0) return;
            const start = c.clone().add(g.dir.clone().multiplyScalar(W.radius * 1.02));
            const circle = sp.clone().add(new THREE.Vector3(Math.cos(t * 0.9 + g.phase) * g.radius, Math.sin(t * 1.3 + g.phase) * 3, Math.sin(t * 0.9 + g.phase) * g.radius));
            let p;
            const out = U.smooth(t / 6), home = U.smooth((greeters.t - (greeters.life - 6)) / 6);
            p = start.clone().lerp(circle, out);
            if (home > 0) p.lerp(start, home);
            g.mesh.position.copy(p);
            g.mesh.rotation.y += dt * 2.5;
        });
        if (greeters.t > greeters.life) endGreeters();
    }

    function endGreeters() {
        if (!greeters) return;
        greeters.list.forEach(g => { scene.remove(g.mesh); g.mesh.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); }); });
        greeters = null;
    }

    // --- every frame ------------------------------------------------------------------------------------

    /**
     * o = { flight state, camera, dt, t, shipOpts }
     */
    function update(dt, camera, flight) {
        const s = flight.state;
        if (sky) sky.position.copy(camera.position);
        if (skyStars) skyStars.position.copy(camera.position);
        refreshPoints(s.galaxy, s.pos);
        // The far-off systems glow a little bigger in Explore's shot from high up (Nearby Stars).
        if (points) points.material.size = 9 * (1 + 0.8 * surveyK);
        // During a warp, paint the new galaxy's sky quickly (in slices, so the jump never stutters).
        pumpSky(warpK > 0.05 ? 14 : 3);
        if (current) {
            const sys = current.sys;
            current.parts.forEach(function (p) {
                if (p.kind === 'star') {
                    const sp = UV.starPos(sys, p.star, s.time);
                    p.mesh.group.position.set(sp.x, sp.y, sp.z);
                    p.mesh.group.scale.setScalar(shownScale('star'));
                    if (lights[p.star]) lights[p.star].position.set(sp.x, sp.y, sp.z);
                    p.mesh.update(dt, calm);
                } else if (p.kind === 'nebula') {
                    p.mesh.group.position.set(sys.pos.x, sys.pos.y, sys.pos.z);
                    p.mesh.update(dt, calm);
                } else {
                    // Planets (with their moons and stations) sit on orbits spread out in the shot over the system.
                    const pl = p.kind === 'planet' ? p.world : p.planet;
                    const f = pl ? spreadNow(pl.id) : 1;
                    const dx = pl ? (pl.pos.x - sys.pos.x) * (f - 1) : 0, dy = pl ? (pl.pos.y - sys.pos.y) * (f - 1) : 0, dz = pl ? (pl.pos.z - sys.pos.z) * (f - 1) : 0;
                    if (p.kind === 'moon') {
                        const m = UV.moonPos(p.planet, p.world, s.time);
                        p.mesh.group.position.set(m.x + dx, m.y + dy, m.z + dz);
                    } else if (pl) p.mesh.group.position.set(pl.pos.x + dx, pl.pos.y + dy, pl.pos.z + dz);
                    if (p.kind === 'planet') p.mesh.group.scale.setScalar(shownScale(p.world.id));
                    else {
                        // Moons and space stations tuck away in the shot over the system (specks there).
                        const k = 1 - surveyK;
                        p.mesh.group.visible = k > 0.02;
                        p.mesh.group.scale.setScalar(Math.max(0.02, k));
                    }
                    p.mesh.update(dt, sys.pos);
                }
            });
            // The orbit lines (one per planet, in order) spread with them, and show brighter from above.
            const op = 0.16 + 0.26 * surveyK;
            current.orbits.children.forEach(function (l, i) {
                const pl = sys.planets[i];
                l.scale.setScalar(pl ? spreadNow(pl.id) : 1);
                l.material.opacity = op;
            });
        }
        stepDust(camera.position);
        stepStreaks(dt, camera);
        stepGreeters(dt, s.pos);
    }

    return {
        init: init,
        setQuality: setQuality,
        setCalm: function (c) { calm = !!c; },
        scene: function () { return scene; },
        ship: function () { return ship; },
        setGalaxy: setGalaxy,
        finishSky: finishSky,
        setSystem: setSystem,
        system: function () { return current ? current.sys : null; },
        partFor: partFor,
        planSurvey: planSurvey,
        setSurveyK: setSurveyK,
        shownScale: shownScale,
        shownPos: shownPos,
        setWarp: setWarp,
        startGreeters: startGreeters,
        endGreeters: endGreeters,
        greeting: function () { return !!greeters; },
        update: update,
        /** Hide the faint orbit lines (orbit and surface views look cleaner without them). */
        showOrbits: function (on) { if (current) current.orbits.visible = !!on; },
        resetPoints: function () { pointsKey = ''; }
    };
})();
