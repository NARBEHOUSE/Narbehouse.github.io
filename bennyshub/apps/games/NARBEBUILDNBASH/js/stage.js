/**
 * NARBE Build n Bash - the WebGL stage: renderer, camera and render loop.
 *
 * Draws BNB.Sim's scene. Graphics quality comes from the hub's shared
 * NarbeGraphics manager (Use Hub setting / High / Standard / Low): Low drops
 * shadows and antialiasing and bounds the pixel count. Quality never changes
 * gameplay, timing or physics.
 *
 * The camera director:
 *   menu   a slow, wide sway around the showcase build
 *   play   the whole finished build framed, drifting very gently (Full motion)
 *   bash   leans toward the destroyer, pulls back a little, shakes on hits
 * Everything eases; nothing cuts or spins. Calm motion keeps it nearly still.
 */

window.BNB = window.BNB || {};

BNB.Stage = (function () {
    'use strict';

    const GAME_ID = 'buildnbash';
    let THREE = null, renderer = null, camera = null, host = null, quality = null;
    let mode = 'menu', paused = false, last = 0, t = 0, started = false;
    const cur = { pos: null, look: null, ready: false };
    let celebrate = 0;
    let onFrame = null;

    function calm() { return BNB.Settings.get('motion') === 'calm'; }

    async function init(hostEl) {
        THREE = window.THREE;
        host = hostEl;
        if (!THREE) throw new Error('three.js did not load');
        try {
            if (window.NarbeGraphics) {
                quality = window.NarbeGraphics.openGame(GAME_ID);
                await quality.ready;
            }
        } catch (e) { console.warn('[BNB] graphics settings unavailable', e); quality = null; }
        const opts = { antialias: true, alpha: false, powerPreference: 'high-performance' };
        renderer = new THREE.WebGLRenderer(quality ? quality.rendererOptions(opts) : opts);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.02;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.shadowMap.enabled = true;
        renderer.domElement.className = 'bnb-gl';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        host.appendChild(renderer.domElement);
        camera = new THREE.PerspectiveCamera(40, 1, 0.1, 900);
        cur.pos = new THREE.Vector3(); cur.look = new THREE.Vector3();
        BNB.Sim.init(THREE, {});
        applyQuality();
        if (quality) quality.subscribe(applyQuality);
        if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
        window.addEventListener('resize', resize);
        resize();
        started = true;
        requestAnimationFrame(loop);
    }

    function applyQuality() {
        if (!renderer) return;
        if (quality) quality.shadows(renderer, BNB.Sim.scene(), true);
        resize();
    }

    function qualityLevel() {
        try { return quality ? quality.get().quality : 'high'; } catch (e) { return 'high'; }
    }

    function resize() {
        if (!renderer || !host) return;
        const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
        const base = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(quality ? quality.pixelRatio(base, w, h) : base);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        viewOffset(w, h);
        BNB.FX.setViewport(h * renderer.getPixelRatio(), camera.fov);
    }

    /**
     * The build sits a little below centre so the world's sky and skyline show
     * above it; on the main menu of a wide window it also sits right of centre,
     * clear of the menu card.
     */
    function viewOffset(w, h) {
        w = w || Math.max(1, host.clientWidth); h = h || Math.max(1, host.clientHeight);
        const sx = mode === 'menu' && w / h > 1.25 ? -Math.round(w * 0.17) : 0;
        camera.setViewOffset(w, h, sx, -Math.round(h * BNB.Sim.VIEW_SHIFT_Y), w, h);
        camera.updateProjectionMatrix();
    }

    // --- the camera director -------------------------------------------------------------

    function target() {
        const f = BNB.Sim.frame();
        if (!f) return null;
        const still = calm();
        let dAz = 0, dEl = 0, dist = 1;
        if (mode === 'menu') {
            dAz = still ? 10 : 10 + 16 * Math.sin(t * 0.07);
            dEl = still ? 2 : 2 + 2 * Math.sin(t * 0.05);
            dist = 1.04;
        } else {
            if (!still) { dAz = 2.2 * Math.sin(t * 0.11); dEl = 0.8 * Math.sin(t * 0.07); }
            if (celebrate > 0 && !still) dAz += 7 * Math.sin(Math.min(1, celebrate / 4) * Math.PI);
        }
        const look = f.center.clone();
        const focus = BNB.Sim.focus();
        if (focus && mode !== 'menu') {
            const k = still ? 0.3 : 0.5;
            look.lerp(focus.point, k);
            look.y = Math.max(look.y, f.center.y * 0.7);
            dist *= still ? 1 + (focus.dist - 1) * 0.5 : focus.dist;
        }
        const pos = BNB.Sim.cameraPos(f, dAz, dEl, dist);
        pos.add(look).sub(f.center);
        if (!BNB.Sim.world() || !BNB.Sim.world().zeroG) pos.y = Math.max(pos.y, 0.6);
        return { pos: pos, look: look, f: f };
    }

    function updateCamera(dt) {
        const tg = target();
        if (!tg) return;
        if (!cur.ready) { cur.pos.copy(tg.pos); cur.look.copy(tg.look); cur.ready = true; }
        const k = 1 - Math.exp(-(mode === 'menu' ? 1.6 : 2.6) * dt);
        cur.pos.lerp(tg.pos, k);
        cur.look.lerp(tg.look, k);
        camera.position.copy(cur.pos);
        const s = BNB.Sim.shake();
        if (s > 0.001 && !calm()) {
            const a = s * Math.min(0.35, tg.f.radius * 0.05);
            camera.position.x += (Math.sin(t * 61) + Math.sin(t * 37)) * 0.5 * a;
            camera.position.y += (Math.sin(t * 53) + Math.sin(t * 29)) * 0.5 * a;
        }
        camera.lookAt(cur.look);
    }

    /** Jump the camera straight to its framing (a new build, a new screen). */
    function snap() { cur.ready = false; }

    // --- the loop -----------------------------------------------------------------------

    function loop(now) {
        requestAnimationFrame(loop);
        if (!renderer) return;
        const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000));
        last = now;
        if (!paused) {
            t += dt;
            if (celebrate > 0) celebrate -= dt;
            BNB.Sim.update(dt);
            if (onFrame) onFrame(dt);
        }
        updateCamera(paused ? 0 : dt);
        if (quality) quality.frame(now, 60);
        renderer.render(BNB.Sim.scene(), camera);
    }

    // --- Build Select pictures ------------------------------------------------------------

    /**
     * Render each build, finished, in its world, as a JPEG data URL, one per
     * animation frame, on a small offscreen renderer that is thrown away after.
     * onEach(id, url) is called as each one is ready.
     */
    function thumbnails(ids, onEach) {
        return new Promise(function (resolve) {
            let r = null;
            try {
                const canvas = document.createElement('canvas');
                r = new THREE.WebGLRenderer({ canvas: canvas, antialias: qualityLevel() !== 'low', preserveDrawingBuffer: true, alpha: false });
            } catch (e) { console.warn('[BNB] no thumbnail renderer', e); resolve(); return; }
            r.setPixelRatio(1);
            r.setSize(480, 360, false);
            r.outputColorSpace = THREE.SRGBColorSpace;
            r.toneMapping = THREE.ACESFilmicToneMapping;
            r.toneMappingExposure = 1.02;
            r.shadowMap.enabled = qualityLevel() !== 'low';
            r.shadowMap.type = THREE.PCFSoftShadowMap;
            const cam = new THREE.PerspectiveCamera(40, 480 / 360, 0.1, 900);
            cam.setViewOffset(480, 360, 0, -Math.round(360 * BNB.Sim.VIEW_SHIFT_Y), 480, 360);
            const list = ids.slice();
            function next() {
                const id = list.shift();
                if (!id) {
                    r.dispose();
                    try { r.forceContextLoss(); } catch (e) { /* ignore */ }
                    resolve();
                    return;
                }
                let d = null;
                try {
                    d = BNB.Sim.diorama(id, { quality: qualityLevel() });
                    const f = d.frame;
                    cam.position.copy(BNB.Sim.cameraPos(f, 6, 3, 0.98));
                    cam.lookAt(f.center);
                    r.render(d.scene, cam);
                    onEach(id, r.domElement.toDataURL('image/jpeg', 0.86));
                } catch (e) {
                    console.warn('[BNB] thumbnail failed for ' + id, e);
                } finally {
                    if (d) d.dispose();
                }
                setTimeout(function () { requestAnimationFrame(next); }, 30);
            }
            requestAnimationFrame(next);
        });
    }

    return {
        init: init,
        started: function () { return started; },
        setMode: function (m) { if (m !== mode) { mode = m; if (camera) viewOffset(); } },
        mode: function () { return mode; },
        setPaused: function (p) { paused = !!p; },
        paused: function () { return paused; },
        snap: snap,
        celebrate: function () { celebrate = 4; },
        quality: function () { return quality; },
        qualityLevel: qualityLevel,
        thumbnails: thumbnails,
        onFrame: function (fn) { onFrame = fn; },
        resize: resize
    };
})();
