/**
 * NARBE Build n Ride - the WebGL stage: renderer, camera and render loop.
 *
 * Draws BNR.Scene's scene. Graphics quality comes from the hub's shared
 * NarbeGraphics manager (Use Hub setting / High / Standard / Low):
 *   High      full terrain detail, 2048 shadows, antialiasing
 *   Standard  less terrain and scenery detail, 1024 shadows
 *   Low       coarse terrain, sparse scenery, no shadows, no antialiasing,
 *             bounded pixel count
 * Quality never changes gameplay, timing or speed.
 *
 * Modes: 'menu' (a slow orbit round the train behind the main menu), 'ride'
 * (the ride camera rig in js/cameras.js) and 'build' (behind and above the end
 * of the track as it grows; a slow orbit round the train once the loop is done).
 */

window.BNR = window.BNR || {};

BNR.Stage = (function () {
    'use strict';

    const GAME_ID = 'buildnride';
    let THREE = null, renderer = null, camera = null, host = null, quality = null, rig = null;
    let mode = 'menu', paused = false, last = 0, t = 0, started = false;
    let onFrame = null;
    let menuAngle = 0;

    function S() { return BNR.Settings; }

    async function init(hostEl) {
        THREE = window.THREE;
        host = hostEl;
        if (!THREE) throw new Error('three.js did not load');
        try {
            if (window.NarbeGraphics) {
                quality = window.NarbeGraphics.openGame(GAME_ID);
                await quality.ready;
            }
        } catch (e) { console.warn('[BNR] graphics settings unavailable', e); quality = null; }
        const opts = { antialias: true, alpha: false, powerPreference: 'high-performance' };
        renderer = new THREE.WebGLRenderer(quality ? quality.rendererOptions(opts) : opts);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.shadowMap.enabled = true;
        renderer.domElement.className = 'bnr-gl';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        host.appendChild(renderer.domElement);
        camera = new THREE.PerspectiveCamera(55, 1, 0.3, 1600);
        BNR.Scene.init(THREE);
        BNR.Scene.setQuality(qualityLevel());
        rig = BNR.Cameras.create(THREE, camera);
        rig.setView(S().get('view'));
        rig.snap();
        applyQuality();
        if (quality) quality.subscribe(applyQuality);
        if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
        window.addEventListener('resize', resize);
        resize();
        started = true;
        requestAnimationFrame(loop);
    }

    function qualityLevel() {
        try { return quality ? quality.get().quality : 'high'; } catch (e) { return 'high'; }
    }

    function applyQuality() {
        if (!renderer) return;
        const q = qualityLevel();
        if (quality) quality.shadows(renderer, BNR.Scene.scene(), true);
        const sky = BNR.Scene.sky();
        if (sky) sky.setShadows(q !== 'low' && renderer.shadowMap.enabled, q === 'high' ? 2048 : 1024);
        BNR.Scene.setQuality(q);
        const terrain = BNR.Scene.terrain();
        if (terrain && terrain.setQuality) terrain.setQuality(q);
        resize();
    }

    function resize() {
        if (!renderer || !host) return;
        const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
        const base = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(quality ? quality.pixelRatio(base, w, h) : base);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        BNR.FX.setViewport(h * renderer.getPixelRatio(), camera.fov);
    }

    // --- cameras ----------------------------------------------------------------------------

    /** Behind the main menu: a slow, wide orbit round the train, offset so it sits right of the card. */
    const menuP = { x: 0, y: 0, z: 0 };
    function menuCamera(dt) {
        const train = BNR.Scene.train();
        if (!train) return;
        const p = train.position();
        menuAngle += dt * (S().get('comfort') ? 0.03 : 0.06);
        const a = menuAngle;
        const tx = p.x - Math.sin(a) * 30, ty = p.y + 11, tz = p.z - Math.cos(a) * 30;
        if (!menuP.ready) { menuP.x = tx; menuP.y = ty; menuP.z = tz; menuP.ready = true; }
        const k = 1 - Math.exp(-2 * dt);
        menuP.x += (tx - menuP.x) * k; menuP.y += (ty - menuP.y) * k; menuP.z += (tz - menuP.z) * k;
        camera.position.set(menuP.x, menuP.y, menuP.z);
        camera.lookAt(p.x, p.y + 2, p.z);
        if (Math.abs(camera.fov - 50) > 0.01) { camera.fov = 50; camera.updateProjectionMatrix(); }
    }

    /**
     * Build: behind the end of the track and well above it, a little to one side, looking a
     * few units past the end (where the next piece goes); it follows each new piece. Once
     * the loop is closed it circles the train at the start station.
     */
    const buildP = { ready: false, x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, a: 0 };

    /** How tall a building kind stands (its tallest part), measured once from its model. */
    const tops = {};
    function topOf(kind) {
        if (tops[kind] === undefined) {
            let t = 0;
            BNR.Props.layers(kind).forEach(function (l) { l.geometry.computeBoundingBox(); t = Math.max(t, l.geometry.boundingBox.max.y); });
            tops[kind] = t;
        }
        return tops[kind];
    }

    /** The buildings standing near the line from (tx, tz) to (lx, lz), with their tops. */
    function buildingsAlong(tx, tz, lx, lz, ter) {
        if (!ter.buildingsIn) return [];
        return ter.buildingsIn(Math.min(tx, lx) - 16, Math.min(tz, lz) - 16, Math.max(tx, lx) + 16, Math.max(tz, lz) + 16)
            .map(b => ({ x: b.x, z: b.z, r: b.radius - 1, top: ter.heightAt(b.x, b.z) + topOf(b.kind) * b.s + 1.5 }));
    }

    /** Is the view from the camera to the point it looks at blocked by a building? */
    function hidden(list, tx, ty, tz, lx, ly, lz) {
        if (!list.length) return false;
        for (let k = 0; k <= 24; k++) {
            const u = k / 24 * 0.92;
            const x = tx + (lx - tx) * u, y = ty + (ly - ty) * u, z = tz + (lz - tz) * u;
            for (const b of list) if (y < b.top && Math.hypot(x - b.x, z - b.z) < b.r) return true;
        }
        return false;
    }

    /**
     * How high the camera at (tx, tz) must be to see over every building between it and the
     * point it looks at: where the sight line leaves a building's footprint it must be above
     * its top (only as far as `most` of the way, so one right beside the look point is let be).
     */
    function overBuildings(list, tx, tz, lx, ly, lz, most) {
        const dx = lx - tx, dz = lz - tz, D2 = dx * dx + dz * dz || 1;
        let need = -Infinity;
        list.forEach(function (b) {
            const ox = tx - b.x, oz = tz - b.z;
            const p = dx * ox + dz * oz, disc = p * p - D2 * (ox * ox + oz * oz - b.r * b.r);
            if (disc < 0) return;
            const u1 = (-p - Math.sqrt(disc)) / D2, u2 = (-p + Math.sqrt(disc)) / D2;
            if (u2 < 0 || u1 > most) return;
            const u = Math.min(u2, most);
            need = Math.max(need, (b.top - ly * u) / (1 - u));
        });
        return need;
    }

    function buildCamera(dt) {
        const f = BNR.Scene.buildFocus();
        if (!f) return;
        const s = BNR.Scene.buildSession();
        const calm = !!S().get('comfort');
        let tx, ty, tz, lx, ly, lz;
        // In a tunnel the end is inside the hill: look at the hill's surface above it.
        const ter0 = BNR.Scene.terrain();
        const fy = Math.max(f.y, ter0 ? ter0.heightAt(f.x, f.z) : f.y);
        // Zoom (Build's button): Close, Far or Very Far, to see more of the land.
        const zk = S().zoomScale ? S().zoomScale() : 1;
        if (s && s.closed()) {
            const p = BNR.Scene.train().position();
            buildP.a += dt * (calm ? 0.05 : 0.09);
            tx = p.x + Math.sin(buildP.a) * 42 * zk; ty = p.y + 22 * zk; tz = p.z + Math.cos(buildP.a) * 42 * zk;
            lx = p.x; ly = p.y + 2; lz = p.z;
        } else {
            const d = BNR.Track.DIRS[f.h];
            const back = 30 * zk, up = 26 * zk, side = 9 * zk;
            tx = f.x - d[0] * back - d[1] * side; ty = fy + up; tz = f.z - d[1] * back + d[0] * side;
            lx = f.x + d[0] * 9; ly = fy; lz = f.z + d[1] * 9;
            buildP.a = Math.atan2(tx - f.x, tz - f.z);
        }
        // Never inside a hill or a mesa, and never looking into one: stay well above the ground
        // all the way from the camera to the end of the track (in a tunnel, that is over the
        // hill; the see-through preview and the arrow show through it).
        const ter = BNR.Scene.terrain();
        const overGround = function () {
            let g = -Infinity;
            for (let k = 0; k <= 6; k++) { const u = k / 6; g = Math.max(g, ter.heightAt(tx + (lx - tx) * u, tz + (lz - tz) * u)); }
            ty = Math.max(ty, g + 9);
        };
        if (ter) {
            overGround();
            // Among tall buildings (a city), a building in the way of the view: the camera hovers
            // over the track just laid, looking along it (track always has a clear way between
            // buildings); if one still stands in the way (beside the end), it looks down on the end
            // from high above, over the rooftops.
            let list = buildingsAlong(tx, tz, lx, lz, ter);
            if (hidden(list, tx, ty, tz, lx, ly, lz)) {
                const sm = BNR.Scene.sampler();
                const d = BNR.Track.DIRS[f.h];
                if (!(s && s.closed()) && sm) {
                    const q = sm.at(Math.max(0, sm.length - 24 * zk));
                    tx = q.x; tz = q.z; ty = Math.max(f.y, q.y) + 30 * zk;
                    lx = f.x + d[0] * 6; lz = f.z + d[1] * 6;
                    overGround();
                    list = buildingsAlong(tx, tz, lx, lz, ter);
                    if (hidden(list, tx, ty, tz, lx, ly, lz)) {
                        const roofs = list.reduce((m, b) => Math.max(m, b.top), -Infinity);
                        tx = f.x - d[0] * 8 * zk; tz = f.z - d[1] * 8 * zk; ty = Math.max(fy + 46 * zk, roofs + 6);
                        lx = f.x + d[0] * 4; lz = f.z + d[1] * 4;
                    }
                } else ty = Math.max(ty, Math.min(fy + 70, overBuildings(list, tx, tz, lx, ly, lz, 0.6)));
            }
        }
        if (!buildP.ready) { Object.assign(buildP, { x: tx, y: ty, z: tz, lx: lx, ly: ly, lz: lz, ready: true }); }
        const k = dt > 0 ? 1 - Math.exp(-(calm ? 1.1 : 2.0) * dt) : 0;
        buildP.x += (tx - buildP.x) * k; buildP.y += (ty - buildP.y) * k; buildP.z += (tz - buildP.z) * k;
        buildP.lx += (lx - buildP.lx) * k; buildP.ly += (ly - buildP.ly) * k; buildP.lz += (lz - buildP.lz) * k;
        camera.position.set(buildP.x, buildP.y, buildP.z);
        camera.lookAt(buildP.lx, buildP.ly, buildP.lz);
        if (Math.abs(camera.fov - 55) > 0.01) { camera.fov = 55; camera.updateProjectionMatrix(); }
    }

    function rideCamera(dt) {
        const st = BNR.Scene.trainState();
        if (!st) return;
        rig.update(dt, {
            sampler: BNR.Scene.sampler(), s: st.s, train: BNR.Scene.train(),
            inTunnel: st.inTunnel, covered: st.covered, comfort: !!S().get('comfort')
        });
        // In a tunnel (or under a corkscrew's loop), Bird's Eye sees the train's outline through it.
        BNR.Scene.train().setXray(rig.view() === 'bird' && (st.inTunnel || st.covered));
    }

    // --- pictures of routes for the Ride tiles ---------------------------------------------------

    const snaps = [];
    /**
     * A picture of a diorama ({ scene, camera }) as a JPEG data URL, w x h. It is
     * drawn on the main canvas inside the next frame and copied off before the
     * main scene is drawn over it, so it is never seen and gets the same tone
     * mapping and colour as the game.
     */
    function snapshot(d, w, h) {
        return new Promise(function (resolve) { snaps.push({ d: d, w: w || 480, h: h || 320, resolve: resolve }); });
    }

    function takeSnapshot(job) {
        let url = null;
        try {
            const cv = renderer.domElement;
            const W = cv.width, H = cv.height;
            job.d.camera.aspect = W / H;
            job.d.camera.updateProjectionMatrix();
            renderer.render(job.d.scene, job.d.camera);
            const out = document.createElement('canvas');
            out.width = job.w; out.height = job.h;
            const g = out.getContext('2d');
            // Centre crop to the tile's shape.
            const want = job.w / job.h;
            let sw = W, sh = H;
            if (W / H > want) sw = H * want; else sh = W / want;
            g.drawImage(cv, (W - sw) / 2, (H - sh) / 2, sw, sh, 0, 0, job.w, job.h);
            url = out.toDataURL('image/jpeg', 0.86);
        } catch (e) { console.warn('[BNR] route picture failed', e); }
        job.resolve(url);
    }

    // --- the loop ----------------------------------------------------------------------------

    function loop(now) {
        requestAnimationFrame(loop);
        if (!renderer) return;
        const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000));
        last = now;
        if (!paused) {
            t += dt;
            BNR.Scene.update(dt);
        }
        if (onFrame) onFrame(paused ? 0 : dt, dt);
        if (mode === 'menu') menuCamera(paused ? 0 : dt);
        else if (mode === 'build') buildCamera(paused ? 0 : dt);
        else rideCamera(paused ? 0 : dt);
        if (quality) quality.frame(now, 60);
        if (snaps.length) takeSnapshot(snaps.shift());
        renderer.render(BNR.Scene.scene(), camera);
    }

    return {
        init: init,
        started: function () { return started; },
        setMode: function (m) {
            if (m === mode) return;
            mode = m;
            if (m === 'ride') rig.snap();
            menuP.ready = false;
            buildP.ready = false;
        },
        mode: function () { return mode; },
        setPaused: function (p) { paused = !!p; },
        paused: function () { return paused; },
        rig: function () { return rig; },
        camera: function () { return camera; },
        quality: function () { return quality; },
        qualityLevel: qualityLevel,
        onFrame: function (fn) { onFrame = fn; },
        snapshot: snapshot,
        resize: resize
    };
})();
