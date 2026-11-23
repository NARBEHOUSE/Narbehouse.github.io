/**
 * NARBE Space Explorer - the WebGL stage: renderer, cameras, render loop.
 *
 * Graphics quality comes from the hub's shared NarbeGraphics manager
 * (GRAPHICS-QUALITY.md): Use Hub setting / High / Standard / Low. It never
 * changes speed, timing or what happens, only detail:
 *   High      full-size planet maps (extra detail for the world orbited),
 *             detailed sky, antialiasing
 *   Standard  half-size maps, simpler sky
 *   Low       small maps, fewer stars and dust, no antialiasing, bounded pixels
 *
 * Views (Switch View): Cockpit (from the pilot's seat, with the dashboard
 * frame drawn by the page), Chase (behind the ship) and Wide (a panoramic
 * sightseeing view). Changing view, or going into or out of orbit, glides the
 * camera over instead of cutting. Explore System rises up and over the whole
 * system (setSurvey), framed to fit above the bottom panel, and comes back down
 * to the ship when a world is picked.
 *
 * Also here: the scanner's viewer window (a second little scene drawn into a
 * box on the page), and logbook snapshots (a nicely lit portrait of the place,
 * drawn and copied in the same frame, so nothing flashes on screen).
 */

window.NSE = window.NSE || {};

NSE.Stage = (function () {
    'use strict';

    const GAME_ID = 'spaceexplorer';
    const U = NSE.Util;
    let THREE = null, renderer = null, camera = null, host = null, quality = null;
    let flight = null, mode = 'space', view = 'cockpit', menu = false, paused = false;
    let surface = null;
    let last = 0, onFrame = null;
    let warpK = 0;
    let fovBase = 62;
    let menuAngle = 0;
    let viewer = null;
    let snapReq = null;
    // The view is lifted while the bottom button bar shows, so the middle of the picture sits
    // above the buttons instead of behind them (the user: "the buttons are blocking the objects").
    let liftOn = false, liftK = 0;
    // Diving from orbit down into the atmosphere (k 0..1), and Fly Low's descent (0 high .. 1 skimming).
    let dive = null, surfIntro = 1, surfRate = 0;
    // A whole galaxy seen from outside (js/galaxyview.js).
    let galaxyView = null, galaxyPhase = 'look', galaxyK = 0;
    // Explore System: the camera's shot over the whole system (or over the nearby stars), and how
    // far into it the camera is (0 at the ship .. 1 up over the system).
    let survey = null, surveyAmt = 0, surveyDist = 0;

    // Camera glide between poses.
    const blend = { t: 1, dur: 1.4, fromPos: null, fromQuat: null, fromLook: null, fromUp: null, anchored: false };
    let poseFamily = '';
    let lastLook = null;     // where the camera aimed last frame (a glide starts from there)

    async function init(hostEl, fl) {
        THREE = window.THREE;
        host = hostEl;
        flight = fl;
        if (!THREE) throw new Error('three.js did not load');
        try {
            if (window.NarbeGraphics) {
                quality = window.NarbeGraphics.openGame(GAME_ID);
                await quality.ready;
            }
        } catch (e) { console.warn('[NSE] graphics settings unavailable', e); quality = null; }
        const opts = { antialias: true, alpha: false, powerPreference: 'high-performance' };
        renderer = new THREE.WebGLRenderer(quality ? quality.rendererOptions(opts) : opts);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.domElement.className = 'nse-gl';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        host.appendChild(renderer.domElement);
        camera = new THREE.PerspectiveCamera(fovBase, 1, 0.4, 60000);
        NSE.Planets.init(THREE, qualityLevel());
        NSE.Space.init(THREE, qualityLevel());
        blend.fromPos = new THREE.Vector3();
        blend.fromQuat = new THREE.Quaternion();
        blend.fromLook = new THREE.Vector3();
        blend.fromUp = new THREE.Vector3(0, 1, 0);
        lastLook = new THREE.Vector3(0, 0, -1);
        applyQuality();
        if (quality) quality.subscribe(applyQuality);
        if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
        window.addEventListener('resize', resize);
        resize();
        requestAnimationFrame(loop);
    }

    function qualityLevel() {
        try { return quality ? quality.get().quality : 'high'; } catch (e) { return 'high'; }
    }

    function applyQuality() {
        if (!renderer) return;
        const q = qualityLevel();
        NSE.Planets.setQuality(q);
        NSE.Space.setQuality(q);
        if (surface && surface.setQuality) surface.setQuality(q);
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
    }

    // --- poses ------------------------------------------------------------------------------------

    const V = () => new THREE.Vector3();

    /**
     * The ship's drawn size. Planets are not to scale (a small one is only a few ship-lengths
     * across), so near a world the ship (and the camera's distance from it) is drawn smaller,
     * and during the dive into an atmosphere much smaller still: the ship stays the same size
     * on screen while the world grows huge below it (the user: the ship looked as big as the
     * world and seemed to crash into it).
     */
    let shipScale = 1;
    let heat = null;     // a soft re-entry glow on the ship's nose

    function scaleWanted() {
        const s = flight.state;
        if (menu) return 1;
        const o = s.orbit ? s.orbit.obj : (s.mode === 'travel' ? s.target : null);
        // (A little bigger than full size beside a big or ringed giant, so it still shows there.)
        if (o && o.kind !== 'star') return U.clamp(frameRadius(o) / 26, 0.35, 1.7);
        return 1;
    }

    /** Where the camera wants to be right now: { pos, look, up, fov, family }. sc = ship scale. */
    function targetPose(sc) {
        const s = flight.state;
        const p = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z);
        const f = NSE.Flight.forwardOf(s.yaw, s.pitch);
        const fwd = new THREE.Vector3(f.x, f.y, f.z);
        const worldUp = new THREE.Vector3(0, 1, 0);
        let right = V().crossVectors(fwd, worldUp);
        if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
        right.normalize();
        const up = V().crossVectors(right, fwd).normalize();

        if (menu) {
            const a = menuAngle;
            const off = new THREE.Vector3(Math.sin(a) * 22, 6 + Math.sin(a * 0.7) * 2, Math.cos(a) * 22).multiplyScalar(sc);
            return { pos: p.clone().add(off), look: p.clone().add(fwd.clone().multiplyScalar(4 * sc)), up: worldUp, fov: 55, family: 'menu' };
        }

        if (s.mode === 'orbit' && s.orbit) {
            const cc = flight.centreOf(s.orbit.obj);
            const c = new THREE.Vector3(cc.x, cc.y, cc.z);
            const out = p.clone().sub(c).normalize();
            const R = s.orbit.R;
            // The orbit tangent (the ship's nose, kept square to "out").
            const tan = fwd.clone().addScaledVector(out, -fwd.dot(out));
            if (tan.lengthSq() < 1e-6) tan.copy(right);
            tan.normalize();
            const rEff = frameRadius(s.orbit.obj);
            if (view === 'cockpit') return orbitCockpitPose(p, c, out, tan, R, rEff, sc);
            if (view === 'chase') return orbitChasePose(p, c, out, tan, R, rEff, sc);
            const side = V().crossVectors(out, fwd).normalize();
            return { pos: p.clone().addScaledVector(out, R * 0.9).addScaledVector(fwd, -R * 0.75).addScaledVector(side, R * 0.35), look: c.clone().lerp(p, 0.25), up: worldUp, fov: 74, family: 'orbit-wide' };
        }

        // Flying or gliding.
        const bank = s.bank || 0;
        if (view === 'cockpit') {
            const rolledUp = up.clone().applyAxisAngle(fwd, bank * 0.5);
            return { pos: p.clone().addScaledVector(fwd, 1.3 * sc).addScaledVector(up, 0.55 * sc), look: p.clone().addScaledVector(fwd, 120).addScaledVector(up, 0.55 * sc), up: rolledUp, fov: 66, family: 'fly-cockpit' };
        }
        if (view === 'chase') {
            // (Far enough back that the ship leaves room to see where it is going.)
            return { pos: p.clone().addScaledVector(fwd, -19 * sc).addScaledVector(up, 5.4 * sc), look: p.clone().addScaledVector(fwd, 30 * sc), up: up, fov: 62, family: 'fly-chase' };
        }
        return { pos: p.clone().addScaledVector(fwd, -30 * sc).addScaledVector(up, 11 * sc).addScaledVector(right, 15 * sc), look: p.clone().addScaledVector(fwd, 45 * sc), up: up, fov: 76, family: 'fly-wide' };
    }

    // --- orbit framing ------------------------------------------------------------------------------
    //
    // In orbit the world must sit in the open part of the picture, above the button bar, never
    // behind it (the user: "the buttons completely block the planet we are orbiting"). The lift
    // (applyLift) puts the middle of the lens in the middle of that open part, so the framing
    // below only works in angles from the lens's middle: about +-0.32 of the field of view is
    // open while the bar shows.

    const OPEN = 0.32;
    const DEG = Math.PI / 180;

    /** How big the thing orbited looks for framing: rings and a black hole's disk count. */
    function frameRadius(o) {
        if (o.kind === 'star') return o.special === 'blackhole' && o.sys.disk ? o.sys.disk.outer : o.radius * 1.25;
        const w = o.world;
        let r = w && w.rings ? Math.max(o.radius * 1.04, w.rings.outer * 0.92) : o.radius * 1.04;
        // An orbital ring round an inhabited world is part of the picture too (js/space.js civOrbitals).
        if (w && w.civ && (w.civ.tech || []).indexOf('ring') >= 0) r = Math.max(r, w.radius * (w.type === 'gas' ? 1.28 : 1.36));
        return r;
    }

    /** A unit vector turned from a toward b (in their plane) by angle ang, and its "up" (toward b). */
    function turnToward(a, b, ang) {
        const n = b.clone().addScaledVector(a, -b.dot(a));
        if (n.lengthSq() < 1e-9) n.set(0, 1, 0).addScaledVector(a, -a.y);
        n.normalize();
        return {
            dir: a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(n, Math.sin(ang)),
            up: n.clone().multiplyScalar(Math.cos(ang)).addScaledVector(a, -Math.sin(ang))
        };
    }

    /**
     * Chase in orbit: from behind and above the ship, looking down past it at the whole world.
     * The ship sits just above the world's top edge and the world fills the middle of the open
     * part of the picture (like a drone following the ship round the planet).
     */
    function orbitChasePose(p, c, out, tan, R, rEff, sc) {
        const fov = 60, h0 = OPEN * fov * DEG;
        // The world's size on screen; never so close that the camera dips inside the orbit.
        let d = Math.max(rEff / Math.sin(0.6 * h0), R + rEff * 0.45 + 12 * sc);
        // Far enough back that the ship stays small beside a little moon (6 = the ship's length).
        const shipDist = 6 * sc / Math.tan(0.4 * h0);
        let rho = 0, A = 0, atCentre = 0;
        for (let i = 0; i < 6; i++) {
            rho = Math.asin(Math.min(0.95, rEff / d));
            // The angle at the camera between the ship and the world's middle.
            A = Math.min(rho + 0.1 * h0, Math.asin(Math.min(1, R / d)) * 0.985);
            const atShip = Math.PI - Math.asin(Math.min(1, d * Math.sin(A) / R));
            atCentre = Math.max(0.01, Math.PI - A - atShip);
            const toShipLen = R * Math.sin(atCentre) / Math.max(1e-6, Math.sin(A));
            if (toShipLen >= shipDist * 0.97) break;
            d = R + (d - R) * shipDist / Math.max(1e-6, toShipLen);
        }
        const cam = c.clone().addScaledVector(out, d * Math.cos(atCentre)).addScaledVector(tan, -d * Math.sin(atCentre));
        const toShip = p.clone().sub(cam).normalize(), toC = c.clone().sub(cam).normalize();
        // Middle of the lens half way between the ship and the world's bottom edge, then a little
        // toward the ship (the ship's own height sits above that point).
        const t = turnToward(toC, toShip, (A - rho) / 2 + 0.07 * h0);
        return { pos: cam, look: cam.clone().addScaledVector(t.dir, d), up: t.up, fov: fov, family: 'orbit-chase' };
    }

    /**
     * Cockpit in orbit: the nose tipped down at the world, a little ahead of straight down, so it
     * fills the window above the dashboard (it used to sit hidden behind the dashboard).
     */
    function orbitCockpitPose(p, c, out, tan, R, rEff, sc) {
        const rho = Math.asin(Math.min(0.95, rEff / R));
        const fov = U.clamp(rho / DEG / (0.8 * OPEN), 60, 80);
        const pos = p.clone().addScaledVector(out, 0.5 * sc);
        const toC = c.clone().sub(pos).normalize();
        const t = turnToward(toC, tan, 0.1 * OPEN * fov * DEG);
        return { pos: pos, look: pos.clone().addScaledVector(t.dir, R), up: t.up, fov: fov, family: 'orbit-cockpit' };
    }

    /**
     * How far the nose is tipped during the dive (radians, dive.k 0..1): level at the orbit, so
     * nothing snaps, tipping down toward the world, then levelling out over the cloud tops. The
     * climb back up is the same path, nose up.
     */
    function noseTip(k) {
        return 0.62 * U.smooth(k / 0.3) * (1 - 0.88 * U.smooth((k - 0.4) / 0.6));
    }

    /**
     * The dive from orbit into the atmosphere (dive.k 0..1), or the climb back out (dive.climb):
     * the ship flies down (or up) its own path with the camera close behind it the whole way, the
     * world below and ahead in view.
     */
    function divePose(sc) {
        const s = flight.state;
        const cc = dive.centre();
        const c = new THREE.Vector3(cc.x, cc.y, cc.z);
        const sp0 = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z);
        const out = sp0.clone().sub(c).normalize();
        const e = U.ease(dive.k);
        const sp = c.clone().addScaledVector(out, U.lerp(sp0.distanceTo(c), dive.radius * 1.006, e));
        const ff = NSE.Flight.forwardOf(s.yaw, s.pitch);
        const fwd = new THREE.Vector3(ff.x, ff.y, ff.z);
        fwd.addScaledVector(out, -fwd.dot(out)).normalize();
        const climb = !!dive.climb;
        const a = noseTip(dive.k) * (climb ? -0.8 : 1);           // + nose down, - nose up
        const dir = fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(out, -Math.sin(a));
        // The camera looks down far enough that the world's edge stays in the lower part of the
        // picture: steeply from high up (where the orbit view left off), levelling out to the
        // horizon over the cloud tops. Never less than half the nose's tip on the way down.
        const fov = 62 + 6 * e;
        const horizon = Math.PI / 2 - Math.asin(U.clamp(dive.radius / sp.distanceTo(c), 0, 1));
        const la = Math.max(climb ? 0 : a * 0.55, horizon - 0.55 * fov / 2 * DEG);
        const ldir = fwd.clone().multiplyScalar(Math.cos(la)).addScaledVector(out, -Math.sin(la));
        const lup = out.clone().multiplyScalar(Math.cos(la)).addScaledVector(fwd, Math.sin(la));
        let pos, look, up = lup;
        if (view === 'cockpit') {
            // From the pilot's seat the world's edge sits lower still, so the world fills the window.
            const ca = Math.max(climb ? 0 : a, horizon - 0.32 * fov / 2 * DEG);
            const cdir = fwd.clone().multiplyScalar(Math.cos(ca)).addScaledVector(out, -Math.sin(ca));
            up = out.clone().multiplyScalar(Math.cos(ca)).addScaledVector(fwd, Math.sin(ca));
            pos = sp.clone().addScaledVector(dir, 1.3 * sc).addScaledVector(out, 0.55 * sc);
            look = pos.clone().addScaledVector(cdir, 100 * sc);
        } else {
            pos = sp.clone().addScaledVector(ldir, -14 * sc).addScaledVector(lup, 3.8 * sc);
            look = sp.clone().addScaledVector(ldir, 24 * sc);
        }
        return { pos: pos, look: look, up: up, fov: fov, family: 'dive', ship: sp, dir: dir };
    }

    // --- Explore System: the shot over the system ---------------------------------------------------

    /** Seconds to rise over the system (and to come back down to the ship). */
    function surveyDur() { return NSE.Settings.calm() ? 2.8 : 2.3; }

    /**
     * plan = { centre, from (the ship), withShip (fit the ship in too), back (the ship's backward
     * direction), points: [{ x, y, z, r }], pitch (radians looking down), fov }. The camera comes
     * from the ship's side, so the ship is nearest the bottom of the picture with the system spread
     * out ahead and below it.
     */
    function setSurvey(plan) {
        survey = plan ? { plan: plan, key: '' } : null;
    }

    /** Work out where the camera must be for everything to fit between the title and the bottom panel. */
    function fitSurvey(w, h) {
        const pl = survey.plan;
        const up = new THREE.Vector3(0, 1, 0);
        const C = new THREE.Vector3(pl.centre.x, pl.centre.y, pl.centre.z);
        const from = new THREE.Vector3(pl.from.x, pl.from.y, pl.from.z);
        const dir = from.clone().sub(C);
        dir.y = 0;
        if (dir.lengthSq() < 1) dir.set(pl.back.x, 0, pl.back.z);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        const side = new THREE.Vector3().crossVectors(up, dir).normalize();
        const pts = pl.withShip ? pl.points.concat([{ x: from.x, y: from.y, z: from.z, r: 0 }]) : pl.points.slice();
        // Aim at the middle of everything (seen from above), not just the star.
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        const d = new THREE.Vector3();
        pts.forEach(function (p) {
            d.set(p.x - C.x, p.y - C.y, p.z - C.z);
            const a = d.dot(dir), b = d.dot(side), r = p.r || 0;
            a0 = Math.min(a0, a - r); a1 = Math.max(a1, a + r);
            b0 = Math.min(b0, b - r); b1 = Math.max(b1, b + r);
        });
        const look0 = C.clone().addScaledVector(dir, (a0 + a1) / 2).addScaledVector(side, (b0 + b1) / 2);
        const fov = pl.fov || 50, pitch = pl.pitch || 0.65;
        // No lift on this screen: the shot is framed for the space between the title box and the
        // bottom panel instead (wide and short, hence the low angle: a system looks oval).
        const cam = new THREE.PerspectiveCamera(fov, w / h, 1, 1e7);
        const offset = dir.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch));
        const top = h * 0.11, bottom = h * 0.8, left = w * 0.05, right = w * 0.95, mid = (top + bottom) / 2;
        const v = new THREE.Vector3(), rv = new THREE.Vector3();
        /** The picture's extent (rings and names included) from distance D, aimed t along the plane. */
        function extents(D, t) {
            const look = look0.clone().addScaledVector(dir, t);
            cam.position.copy(look).addScaledVector(offset, D);
            cam.up.copy(up);
            cam.lookAt(look);
            cam.updateMatrixWorld();
            cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
            rv.setFromMatrixColumn(cam.matrixWorld, 0);
            const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, look: look };
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                v.set(p.x, p.y, p.z).project(cam);
                if (!(v.z > -1 && v.z < 1)) return null;
                const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
                let rp = 0;
                if (p.r) {
                    v.set(p.x + rv.x * p.r, p.y + rv.y * p.r, p.z + rv.z * p.r).project(cam);
                    rp = Math.abs((v.x + 1) / 2 * w - x);
                }
                const pad = Math.max(rp, 24) + 8;      // at least a highlight ring, plus its name below
                e.x0 = Math.min(e.x0, x - pad); e.x1 = Math.max(e.x1, x + pad);
                e.y0 = Math.min(e.y0, y - pad); e.y1 = Math.max(e.y1, y + pad + 34);
            }
            return e;
        }
        /** From distance D, slide the aim along the plane until the picture sits mid-way up the space. */
        function centred(D) {
            let t0 = 0, e0 = extents(D, 0);
            if (!e0) return null;
            let err0 = (e0.y0 + e0.y1) / 2 - mid;
            let t1 = D * 0.05, e1 = extents(D, t1);
            if (!e1) return e0;
            let err1 = (e1.y0 + e1.y1) / 2 - mid;
            for (let k = 0; k < 8 && Math.abs(err1) > 0.5 && Math.abs(err1 - err0) > 1e-6; k++) {
                const tn = t1 - err1 * (t1 - t0) / (err1 - err0);
                const en = extents(D, tn);
                if (!en) break;
                t0 = t1; err0 = err1; t1 = tn; e1 = en; err1 = (en.y0 + en.y1) / 2 - mid;
            }
            return e1;
        }
        function fits(D) {
            const e = centred(D);
            return !!e && e.x0 >= left && e.x1 <= right && e.y0 >= top && e.y1 <= bottom;
        }
        const span = Math.max(a1 - a0, b1 - b0, 100);
        let lo = span * 0.2, hi = span * 12;
        if (!fits(hi)) hi = span * 40;
        for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
        const best = centred(hi) || { look: look0 };
        survey.pos = best.look.clone().addScaledVector(offset, hi);
        survey.look = best.look;
        survey.up = up;
        survey.fov = fov;
        survey.dist = surveyDist = hi;
        // Worlds are drawn at least this big in the shot (a few percent of the screen), so they show.
        NSE.Space.planSurvey(hi * Math.tan(fov * Math.PI / 360) * 0.07, pl.from);
    }

    function surveyPose() {
        let w = host.clientWidth, h = host.clientHeight;
        if (w < 64 || h < 64) { w = 1280; h = 720; }     // not laid out yet: frame for a usual screen
        // Framed again if the window changes, or once the system's meshes arrive (just got there).
        const sys = NSE.Space.system();
        const key = w + 'x' + h + ':' + (sys ? sys.id : '-');
        if (survey.key !== key) { survey.key = key; fitSurvey(w, h); }
        return { pos: survey.pos, look: survey.look, up: survey.up, fov: survey.fov, family: 'survey' };
    }

    function placeCamera(dt) {
        const s = flight.state;
        shipScale = U.approach(shipScale, scaleWanted(), 1.2, dt);
        const diving = !!(dive && s.mode === 'orbit');
        const de = diving ? U.ease(dive.k) : 0;
        const sc = diving ? U.lerp(shipScale, 0.035, de) : shipScale;
        const surveyOn = !!survey && !diving && !menu;
        surveyAmt = U.clamp(surveyAmt + (surveyOn ? 1 : -1) * dt / surveyDur(), 0, 1);
        NSE.Space.setSurveyK(U.ease(surveyAmt));
        const t = diving ? divePose(sc) : surveyOn ? surveyPose() : targetPose(sc);
        // Glides between poses that follow the ship move with the ship, and keep aiming between
        // the two poses' aim points, so the ship never swings out of the picture on the way.
        const anchor = t.family === 'survey' ? null : diving ? t.ship : V().set(s.pos.x, s.pos.y, s.pos.z);
        if (t.family !== poseFamily) {
            // Glide from wherever the camera is now (rising over a system takes a little longer).
            if (poseFamily) {
                blend.anchored = !!anchor && poseFamily !== 'survey';
                blend.fromPos.copy(camera.position);
                blend.fromLook.copy(lastLook);
                if (blend.anchored) { blend.fromPos.sub(anchor); blend.fromLook.sub(anchor); }
                blend.fromUp.copy(camera.up);
                blend.fromQuat.copy(camera.quaternion);
                blend.t = 0;
                const dives = t.family === 'dive' || poseFamily === 'dive';
                blend.dur = t.family === 'menu' || poseFamily === 'menu' ? 1.8 : t.family === 'survey' || poseFamily === 'survey' ? surveyDur() : dives ? 2 : 1.6;
            }
            poseFamily = t.family;
        }
        camera.position.copy(t.pos);
        camera.up.copy(t.up);
        camera.lookAt(t.look);
        lastLook.copy(t.look);
        if (blend.t < 1) {
            blend.t = Math.min(1, blend.t + dt / blend.dur);
            const k = U.ease(blend.t);
            if (blend.anchored) {
                const pos = blend.fromPos.clone().add(anchor).lerp(t.pos, k);
                const look = blend.fromLook.clone().add(anchor).lerp(t.look, k);
                const up = blend.fromUp.clone().lerp(t.up, k);
                if (up.lengthSq() < 1e-6) up.copy(t.up);
                camera.position.copy(pos);
                camera.up.copy(up.normalize());
                camera.lookAt(look);
                lastLook.copy(look);
            } else {
                const q = camera.quaternion.clone();
                camera.position.lerpVectors(blend.fromPos, t.pos, k);
                camera.quaternion.copy(blend.fromQuat).slerp(q, k);
                camera.up.copy(blend.fromUp).lerp(t.up, k);
                if (camera.up.lengthSq() < 1e-6) camera.up.copy(t.up);
                camera.up.normalize();
                camera.getWorldDirection(lastLook).multiplyScalar(t.pos.distanceTo(t.look)).add(camera.position);
            }
        }
        const fov = t.fov + warpK * warpK * 34;
        if (Math.abs(camera.fov - fov) > 0.05) camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
        // A tiny ship needs the near clipping plane close in (and the far one nearer, for depth precision).
        camera.near = U.clamp(0.4 * sc, 0.012, 0.4);
        camera.far = diving ? 15000 : 60000;
        if (surveyAmt > 0) {
            // High over a system: the near plane moves out with the camera (sharp depth far away),
            // and the far one past the furthest star of a wide shot.
            const dx = camera.position.x - s.pos.x, dy = camera.position.y - s.pos.y, dz = camera.position.z - s.pos.z;
            camera.near = U.clamp(Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.12, camera.near, 150);
            camera.far = Math.max(camera.far, surveyDist * 2.5);
        }
        camera.updateProjectionMatrix();

        // The ship (hidden in the cockpit view: you are in it).
        const ship = NSE.Space.ship();
        const at = diving ? t.ship : new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z);
        const nose = diving ? t.dir : (function () { const f = NSE.Flight.forwardOf(s.yaw, s.pitch); return new THREE.Vector3(f.x, f.y, f.z); })();
        ship.group.position.copy(at);
        ship.group.scale.setScalar(sc);
        ship.group.rotation.set(0, 0, 0);
        if ((s.mode === 'orbit' && s.orbit) || diving) {
            const cc = flight.centreOf(s.orbit.obj);
            ship.group.up.set(at.x - cc.x, at.y - cc.y, at.z - cc.z).normalize();
        } else ship.group.up.set(0, 1, 0);
        // lookAt points an Object3D's +Z at the target: aim +Z backwards so the nose (-Z) leads.
        ship.group.lookAt(at.clone().sub(nose));
        // In the cockpit view the ship shows only while the camera is outside it (gliding in from
        // another view); a glide that starts in the pilot's seat must not show the inside of the hull.
        const outside = camera.position.distanceTo(at) > 4.2 * sc;
        ship.setVisible(menu || view !== 'cockpit' || (blend.t < 0.6 && outside) || surveyAmt > 0);
        ship.update(dt, { thrust: diving ? 1 : U.clamp((s.speedNow || 30) / 300, 0.25, 1), bank: s.mode === 'fly' ? s.bank : 0, calm: NSE.Settings.calm() });

        // Entering the atmosphere: a soft glow on the nose and faint speed lines (never a flash).
        const calm = NSE.Settings.calm();
        const bell = diving && dive.heat ? Math.sin(Math.PI * U.clamp((dive.k - 0.3) / 0.65, 0, 1)) : 0;
        if (!heat && bell > 0) {
            heat = NSE.Planets.glowSprite(0xffa060, 6.5, 0);
            heat.position.set(0, 0, -3.4);
            ship.body.add(heat);
        }
        if (heat) {
            if (diving && dive.heat) heat.material.color.set(dive.heat);
            heat.material.opacity = bell * (calm ? 0.35 : 0.7);
            heat.visible = bell > 0.01;
        }
        // No speed lines or streaming dust on the way down or up: they read as stars rushing past
        // inside the air (the user: "they seem to fly in and i see stars go by"). The air itself
        // (the haze, the glow on the nose, the clouds below) shows the speed instead.
        if (diving) NSE.Space.setWarp(0);
        NSE.Space.setDust(diving || s.mode === 'orbit' ? 0 : 1);
        // The faint orbit lines show while flying round a system and from high over it, but not
        // in orbit or in the dive: there the ship sits on its planet's own line, which then cuts
        // straight up the picture.
        NSE.Space.setOrbitLines(surveyAmt > 0 || (!diving && s.mode === 'fly') ? 1 : 0);
    }

    // --- the scanner's viewer window -------------------------------------------------------------------

    /** Two meshes driven as one (a binary pair, a star in its nebula). */
    function both(a, b) {
        return {
            update: function (dt, x) { a.update(dt, x); b.update(dt, x); },
            dispose: function () { a.dispose(); b.dispose(); }
        };
    }

    /**
     * Show something in the viewer box on the page: kind 'creature' or 'plant' (spec), 'world'
     * (world), 'star' (star; extra.nebula = its system when it sits in a nebula), 'binary' or
     * 'blackhole' (the system). el is the page element the 3D view fills. Everything that can be
     * scanned shows a picture (the user: "this can't happen").
     */
    function showViewer(kind, subject, el, extra) {
        hideViewer();
        const sc = new THREE.Scene();
        // Physical light units (three r155's default): about pi times the old 'legacy' numbers.
        sc.add(new THREE.AmbientLight(0xffffff, 0.75 * Math.PI));
        const key = new THREE.DirectionalLight(0xffffff, 1.3 * Math.PI);
        key.position.set(3, 4, 5);
        sc.add(key);
        const rim = new THREE.DirectionalLight(0x88aaff, 0.6 * Math.PI);
        rim.position.set(-4, 2, -3);
        sc.add(rim);
        const cam = new THREE.PerspectiveCamera(36, 1, 0.05, 2000);
        let obj = null, spin = new THREE.Group();
        sc.add(spin);
        try {
        if ((kind === 'creature' && NSE.Creatures) || (kind === 'plant' && NSE.Flora)) {
            obj = kind === 'plant' ? NSE.Flora.build(THREE, subject, qualityLevel()) : NSE.Creatures.build(THREE, subject, qualityLevel());
            spin.add(obj.group);
            let h = Math.max(0.3, obj.height), r = Math.max(h, (obj.radius || h) * 1.4), floor = -h * 0.45;
            if (kind === 'plant') {
                // Plants come in every shape (a thin kelp stalk, a flat lily pad, a wide bush): frame
                // the plant's own box, from a little above when it is low and wide.
                const box = new THREE.Box3().setFromObject(obj.group), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
                const wide = Math.max(size.x, size.z), big = Math.max(0.2, size.y, wide);
                obj.group.position.set(-mid.x, -mid.y, -mid.z);
                floor = box.min.y - mid.y;
                const up = size.y < wide * 0.45 ? 0.75 : 0.25;
                const d = big * 1.75 + 0.3;
                cam.position.set(0, d * Math.sin(up), d * Math.cos(up));
                r = wide * 0.75 + 0.2;
            } else {
                // (Floaters - jellyfish, balloons, flyers - hover above their feet: lower them into the window.)
                obj.group.position.y = -h * 0.45 - (obj.hover || 0);
                cam.position.set(0, h * 0.25, r * 2.9 + 0.3);
            }
            cam.lookAt(0, 0, 0);
            // A soft round shadow-plate to stand on.
            const plate = new THREE.Mesh(new THREE.CircleGeometry(r * 1.1, 32), new THREE.MeshBasicMaterial({ color: 0x0c1430, transparent: true, opacity: 0.7 }));
            plate.rotation.x = -Math.PI / 2;
            plate.position.y = floor - 0.01;
            spin.add(plate);
        } else if (kind === 'world') {
            obj = NSE.Planets.worldMesh(subject, { orbit: true });
            spin.add(obj.group);
            const R = subject.rings ? subject.rings.outer : subject.radius * 1.15;
            cam.position.set(0, R * 0.5, R * 3.3);
            cam.lookAt(0, 0, 0);
            key.intensity = 1.6 * Math.PI;
        } else if (kind === 'star') {
            obj = NSE.Planets.starMesh(subject);
            spin.add(obj.group);
            let R = subject.radius;
            // A star inside a nebula: the glowing cloud round it, shrunk to fit the window.
            if (extra && extra.nebula && extra.nebula.nebula) {
                const neb = NSE.Planets.nebulaMesh(extra.nebula);
                neb.group.scale.setScalar(subject.radius * 2.4 / extra.nebula.nebula.size);
                spin.add(neb.group);
                obj = both(obj, neb);
                R = subject.radius * 1.5;
            }
            cam.position.set(0, R * 0.3, R * 5.5);
            cam.lookAt(0, 0, 0);
        } else if (kind === 'binary') {
            // Both stars of a pair, side by side.
            const a = subject.stars[0], b = subject.stars[1];
            const ma = NSE.Planets.starMesh(a), mb = NSE.Planets.starMesh(b);
            const gap = (a.radius + b.radius) * 1.25;
            ma.group.position.x = -gap * b.radius / (a.radius + b.radius) - a.radius * 0.35;
            mb.group.position.x = gap * a.radius / (a.radius + b.radius) + b.radius * 0.35;
            spin.add(ma.group, mb.group);
            obj = both(ma, mb);
            const R = gap + Math.max(a.radius, b.radius);
            cam.position.set(0, R * 0.35, R * 3.4);
            cam.lookAt(0, 0, 0);
        } else if (kind === 'blackhole') {
            // A black hole: its dark heart, the light ring and the glowing disk, seen from a little above.
            obj = NSE.Planets.blackHoleMesh(subject);
            spin.add(obj.group);
            const R = subject.disk ? subject.disk.outer : subject.stars[0].radius * 4;
            cam.position.set(0, R * 0.62, R * 2.5);
            cam.lookAt(0, 0, 0);
        }
        } catch (e) {
            console.warn('[NSE] the scanner could not show this', kind, e);
        }
        viewer = { scene: sc, camera: cam, obj: obj, spin: spin, el: el, kind: kind, t: 0 };
    }

    /**
     * A small still picture of a creature or plant for the Field Guide (a PNG data URL, or null):
     * kind 'creature' | 'plant', a spec. opts.silhouette draws it as one flat dark shape (a kind
     * not found yet). Drawn on its own small offscreen canvas, so nothing on screen changes.
     */
    let pRenderer = null;
    function portrait(kind, subject, opts) {
        opts = opts || {};
        if (!THREE || !subject) return null;
        const S = opts.size || 192;
        let obj = null;
        const sc = new THREE.Scene();
        try {
            obj = kind === 'plant' ? (NSE.Flora ? NSE.Flora.build(THREE, subject, 'standard') : null) : (NSE.Creatures ? NSE.Creatures.build(THREE, subject, 'standard') : null);
            if (!obj || !obj.group) return null;
            if (!pRenderer) {
                const o = { antialias: true, alpha: true, preserveDrawingBuffer: true };
                pRenderer = new THREE.WebGLRenderer(o);
                pRenderer.outputColorSpace = THREE.SRGBColorSpace;
                pRenderer.toneMapping = THREE.ACESFilmicToneMapping;
                pRenderer.toneMappingExposure = 1.05;
                pRenderer.setPixelRatio(1);
            }
            pRenderer.setSize(S, S, false);
            sc.add(new THREE.AmbientLight(0xffffff, 0.8 * Math.PI));
            const key = new THREE.DirectionalLight(0xffffff, 1.4 * Math.PI);
            key.position.set(3, 4, 5);
            sc.add(key);
            const rim = new THREE.DirectionalLight(0x88aaff, 0.6 * Math.PI);
            rim.position.set(-4, 2, -3);
            sc.add(rim);
            const turn = new THREE.Group();
            turn.rotation.y = opts.turn === undefined ? -0.65 : opts.turn;      // a three-quarter view
            sc.add(turn);
            turn.add(obj.group);
            if (obj.update) { try { obj.update(0.016, opts.t || 0.6, false); } catch (e) { /* still */ } }
            const h = Math.max(0.3, obj.height || 1), r = Math.max(h, (obj.radius || h) * 1.3);
            const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 4000);
            if (kind === 'plant') {
                // Framed by its own box (thin stalks and flat pads too), from a little above if low and wide.
                // (Measured unturned, so the box is in the plant's own frame.)
                const ry = turn.rotation.y;
                turn.rotation.y = 0;
                turn.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(obj.group), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
                turn.rotation.y = ry;
                const wide = Math.max(size.x, size.z), big = Math.max(0.2, size.y, wide);
                obj.group.position.set(-mid.x, -mid.y, -mid.z);
                const up = size.y < wide * 0.45 ? 0.75 : 0.22, d = big * 1.85 + 0.3;
                cam.position.set(0, d * Math.sin(up), d * Math.cos(up));
            } else {
                obj.group.position.y = -h * 0.5 - (obj.hover || 0);
                cam.position.set(0, h * 0.2, r * 2.7 + 0.3);
            }
            cam.lookAt(0, 0, 0);
            if (opts.silhouette) sc.overrideMaterial = new THREE.MeshBasicMaterial({ color: opts.shade || 0x4a5ca8 });
            pRenderer.setClearColor(0x000000, 0);
            pRenderer.render(sc, cam);
            return pRenderer.domElement.toDataURL('image/png');
        } catch (e) {
            console.warn('[NSE] portrait failed', e);
            return null;
        } finally {
            try { if (obj && obj.dispose) obj.dispose(); } catch (e) { /* ignore */ }
            if (sc.overrideMaterial) sc.overrideMaterial.dispose();
            sc.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && n.material.dispose) n.material.dispose(); });
        }
    }

    function hideViewer() {
        if (!viewer) return;
        try { if (viewer.obj) viewer.obj.dispose(); } catch (e) { /* ignore */ }
        viewer.scene.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && n.material.dispose) n.material.dispose(); });
        viewer = null;
    }

    /**
     * The viewer draws into its own small canvas inside the scanner window, on top of the card.
     * (Drawing it on the main canvas behind the card showed it blurred through the card's
     * frosted glass: the user saw "a blurry thing behind a grid".)
     */
    let vRenderer = null, vSize = '';
    function viewerRenderer(el) {
        if (!vRenderer) {
            const opts = { antialias: true, alpha: false };
            vRenderer = new THREE.WebGLRenderer(quality ? quality.rendererOptions(opts) : opts);
            vRenderer.outputColorSpace = THREE.SRGBColorSpace;
            vRenderer.toneMapping = THREE.ACESFilmicToneMapping;
            vRenderer.toneMappingExposure = 1.05;
            vRenderer.domElement.className = 'nse-viewer-gl';
            vRenderer.domElement.setAttribute('aria-hidden', 'true');
        }
        if (vRenderer.domElement.parentElement !== el) el.prepend(vRenderer.domElement);
        return vRenderer;
    }

    function renderViewer(dt) {
        if (!viewer || !viewer.el) return;
        const r = viewer.el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        const vr = viewerRenderer(viewer.el);
        const w = Math.round(r.width), h = Math.round(r.height);
        const base = Math.min(window.devicePixelRatio || 1, 2);
        const ratio = quality ? quality.pixelRatio(base, w, h) : base;
        const key = w + 'x' + h + '@' + ratio;
        if (key !== vSize) { vSize = key; vr.setPixelRatio(ratio); vr.setSize(w, h, false); }
        viewer.t += dt;
        viewer.spin.rotation.y += dt * (NSE.Settings.calm() ? 0.25 : 0.5);
        if (viewer.obj && viewer.obj.update) {
            // (Creatures and plants animate with time; a world takes the sun's position; stars and
            // black holes take Motion: Calm.) An animation must never stop the picture being drawn.
            try {
                if (viewer.kind === 'creature' || viewer.kind === 'plant') viewer.obj.update(dt, viewer.t, true);
                else if (viewer.kind === 'world') viewer.obj.update(dt, { x: 400, y: 300, z: 600 });
                else viewer.obj.update(dt, NSE.Settings.calm());
            } catch (e) { if (!viewer.warned) { viewer.warned = true; console.warn('[NSE] viewer animation', e); } }
        }
        viewer.camera.aspect = w / h;
        viewer.camera.updateProjectionMatrix();
        vr.setClearColor(0x0a1230, 1);
        vr.render(viewer.scene, viewer.camera);
    }

    // --- logbook snapshots ------------------------------------------------------------------------------

    /** Ask for a picture of a place; cb(dataUrl) after the next frame. target = { center, radius, sun, extent }. */
    function snapshot(target, cb) { snapReq = { target: target, cb: cb }; }

    function takeSnapshot(scene) {
        const req = snapReq;
        snapReq = null;
        try {
            const t = req.target;
            const c = new THREE.Vector3(t.center.x, t.center.y, t.center.z);
            const sun = new THREE.Vector3(t.sun.x, t.sun.y, t.sun.z);
            const sd = sun.clone().sub(c).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const side = new THREE.Vector3().crossVectors(sd, up).normalize();
            const dir = sd.clone().multiplyScalar(0.72).addScaledVector(side, 0.62).addScaledVector(up, 0.28).normalize();
            const cam = new THREE.PerspectiveCamera(40, camera.aspect, 0.4, 60000);
            cam.position.copy(c).addScaledVector(dir, (t.extent || t.radius) * 3.6);
            cam.lookAt(c);
            const ship = NSE.Space.ship();
            const was = ship.group.visible;
            ship.setVisible(false);
            renderer.render(scene, cam);
            ship.setVisible(was);
            const W = 320, H = 200;
            const cv = document.createElement('canvas');
            cv.width = W; cv.height = H;
            const ctx = cv.getContext('2d');
            const sw = renderer.domElement.width, sh = renderer.domElement.height;
            // Crop the middle of the frame to 16:10.
            const ar = W / H;
            let cw = sw, ch = sw / ar;
            if (ch > sh) { ch = sh; cw = sh * ar; }
            ctx.drawImage(renderer.domElement, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);
            req.cb(cv.toDataURL('image/jpeg', 0.72));
        } catch (e) {
            console.warn('[NSE] snapshot failed', e);
            req.cb(null);
        }
    }

    /** Lift the picture above the button bar (an off-centre lens, eased in and out). */
    function applyLift(dt) {
        liftK += ((liftOn ? 1 : 0) - liftK) * Math.min(1, dt * 4);
        const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
        const s = liftK * Math.min(h * 0.11, 110);
        if (s > 0.5) {
            camera.aspect = w / (h + 2 * s);
            camera.setViewOffset(w, h + 2 * s, 0, 2 * s, w, h);
        } else {
            if (camera.view) camera.clearViewOffset();
            camera.aspect = w / h;
        }
        camera.updateProjectionMatrix();
    }

    // --- the loop ----------------------------------------------------------------------------------------

    function loop(now) {
        requestAnimationFrame(loop);
        const rawDt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
        last = now;
        const dt = paused ? 0 : rawDt;
        try {
            if (onFrame) onFrame(dt, rawDt);
            NSE.Planets.pump(mode === 'space' ? 5 : 3);
            if (menu) menuAngle += rawDt * (NSE.Settings.calm() ? 0.04 : 0.08);
            if (mode === 'galaxy' && galaxyView) {
                galaxyView.update(rawDt, camera, galaxyPhase, galaxyK, NSE.Settings.calm());
                applyLift(rawDt);
                renderer.render(galaxyView.scene, camera);
            } else if (mode === 'surface' && surface) {
                // Coming down out of the sky (or climbing away): the ship dives with the camera behind it.
                if (surface.setIntro) surface.setIntro(surfIntro, surfRate);
                surface.update(dt, now / 1000);
                surface.setView(view, camera);
                applyLift(rawDt);
                renderer.render(surface.scene, camera);
            } else {
                placeCamera(rawDt);
                NSE.Space.update(dt, camera, flight);
                const scene = NSE.Space.scene();
                if (snapReq) takeSnapshot(scene);
                applyLift(rawDt);
                renderer.render(scene, camera);
            }
            renderViewer(rawDt);
            if (quality) quality.frame(now, 60);
        } catch (e) {
            console.error('[NSE] frame failed', e);
        }
    }

    /** Project a world point to page pixels: { x, y, on } (on = in front of the camera and on screen). */
    function project(p) {
        if (!camera || !renderer) return { on: false };
        const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
        const r = renderer.domElement.getBoundingClientRect();
        const on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
        return { on: on, x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    }

    /** Project a sphere (centre p, radius r): { x, y, on, r } with r its radius in page pixels. */
    function projectSphere(p, r) {
        const c = project(p);
        c.r = 0;
        if (!c.on || !(r > 0)) return c;
        const rv = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const e = project({ x: p.x + rv.x * r, y: p.y + rv.y * r, z: p.z + rv.z * r });
        c.r = Math.hypot(e.x - c.x, e.y - c.y) || 0;
        return c;
    }

    return {
        init: init,
        quality: function () { return quality; },
        qualityLevel: qualityLevel,
        setMode: function (m) {
            mode = m;
            if (m === 'space' && camera) {
                // Fly Low sets its own lens; put space's back (it glides in from wherever the camera was).
                camera.near = 0.4; camera.far = 60000; camera.fov = fovBase;
                camera.updateProjectionMatrix();
                poseFamily = '';
            }
        },
        mode: function () { return mode; },
        setView: function (v) { view = v; },
        view: function () { return view; },
        setMenu: function (m) { menu = !!m; },
        setPaused: function (p) { paused = !!p; },
        paused: function () { return paused; },
        setSurface: function (s) { surface = s; },
        setWarp: function (k) { warpK = k; NSE.Space.setWarp(k); },
        setLift: function (on) { liftOn = !!on; },
        setDive: function (k, info) {
            const was = !!dive;
            dive = k === null || k === undefined ? null : Object.assign({}, info, { k: k });
            if (was && !dive) { NSE.Space.setWarp(0); if (heat) heat.visible = false; }
        },
        /** Fly Low's way in or out: k 0 high in the sky .. 1 skimming; rate = k per second (+ coming down). */
        setSurfaceIntro: function (k, rate) { surfIntro = U.clamp(k, 0, 1); surfRate = surfIntro >= 1 ? 0 : (+rate || 0); },
        setGalaxyView: function (v) { if (galaxyView && galaxyView !== v) galaxyView.dispose(); galaxyView = v; },
        setGalaxyPhase: function (phase, k) { galaxyPhase = phase; galaxyK = k || 0; },
        onFrame: function (fn) { onFrame = fn; },
        setSurvey: setSurvey,
        surveying: function () { return !!survey; },
        /** 0 at the ship .. 1 when the camera is up over the system (eases both ways). */
        surveyAmount: function () { return U.ease(surveyAmt); },
        showViewer: showViewer,
        hideViewer: hideViewer,
        portrait: portrait,
        snapshot: snapshot,
        project: project,
        projectSphere: projectSphere,
        camera: function () { return camera; }
    };
})();
