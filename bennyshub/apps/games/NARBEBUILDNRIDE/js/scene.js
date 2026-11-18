/**
 * NARBE Build n Ride - the scene: one world, one track, one train, riding.
 *
 * Owns the three.js scene graph (sky, terrain, track, stations, events, train,
 * effects) and steps it in update(dt). It draws nothing itself: in the browser
 * js/stage.js renders it with WebGL, and the Node tools render the very same
 * scene on the CPU (tools/shot.cjs), so everything here runs headless.
 *
 *   BNR.Scene.init(THREE)
 *   BNR.Scene.load({ route: 'countryside' }, { speed })   or  load({ world, track })
 *   BNR.Scene.update(dt)          drives the train (BNR.Ride), stations, events, steam
 *   BNR.Scene.horn()              toot: a big puff, the lamp flares, birds fly up
 *   BNR.Scene.setSpeed(i)         Slow / Medium / Fast
 *   BNR.Scene.diorama(routeId)    a separate little scene for the route's picture tile
 *   BNR.Scene.setViewer(camera)   the camera rain and snow fall round (js/weather.js)
 *   BNR.Scene.loadBuild(session)  Build or Quick Build (js/build.js): the track grows,
 *                                 the train waits at the start station; buildChanged()
 *                                 after each change, buildGhost / buildDrop for the looks
 *
 * Events (on(name, fn)): loaded, arrive, depart, event, chuff, clack, tunnel, horn, sound.
 */

window.BNR = window.BNR || {};

BNR.Scene = (function () {
    'use strict';

    const U = BNR.Util;
    const CHUFF_STEP = 2.2;          // one chuff for every 2.2 units the train travels
    let THREE = null, scene = null, sky = null;
    let world = null, track = null, route = null, terrain = null, view = null, train = null, sampler = null;
    let lines = [], lineViews = [], stations = null, ride = null, events = null, ground = null;
    let quality = 'high', season = 'summer';
    const st = { s: 0, speed: 0, ds: 0 };
    const handlers = {};
    /**
     * The world's mood right now, set by the sky and weather (js/weather.js) and handed to
     * events every frame (info.env): hour 0-24, night 0 day .. 1 night, season, weather
     * ('clear' | 'rain' | 'snow' | 'fog'), wet 0..1 (how much it is raining), afterRain
     * (true for a while after rain clears).
     */
    const env = { hour: 12, night: 0, season: 'summer', weather: 'clear', wet: 0, afterRain: false };
    let joints = [], chuffAcc = 0, idleT = 0, inTunnel = false, flashT = 0, lastBirds = -99, clock = 0;
    let viewer = null, biomeHere = null, biomeT = 0, tmpDir = null;
    let build = null;          // Build mode: { session, view (BNR.BuildView), sitesKey }

    function on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); }
    function emit(name, data) { (handlers[name] || []).forEach(fn => { try { fn(data); } catch (e) { console.warn('[BNR] ' + name, e); } }); }

    function init(three) {
        THREE = three;
        BNR.Geo.init(THREE);
        scene = new THREE.Scene();
        sky = BNR.Sky.create(THREE, scene, { seed: 11 });
        BNR.FX.init(THREE, scene, { rand: U.mulberry(5) });
        return scene;
    }

    /**
     * Distance-along-the-track lookups on a centre line. Loops wrap; open
     * tracks clamp at their ends. at(s, out) fills { x, y (rail top), z, i, struct }.
     */
    function makeSampler(c) {
        const n = c.n, L = c.length;
        const last = c.s[n - 1];
        return {
            length: c.closed ? L : last,
            closed: c.closed,
            centerline: c,
            at: function (s, out) {
                out = out || {};
                if (c.closed) s = ((s % L) + L) % L; else s = U.clamp(s, 0, last);
                let lo = 0, hi = n - 1;
                while (lo < hi) {
                    const mid = (lo + hi + 1) >> 1;
                    if (c.s[mid] <= s) lo = mid; else hi = mid - 1;
                }
                const i = lo;
                const j = c.closed ? (i + 1) % n : Math.min(n - 1, i + 1);
                const s0 = c.s[i], s1 = j === 0 ? L : c.s[j];
                const u = j === i || s1 <= s0 ? 0 : (s - s0) / (s1 - s0);
                out.x = c.x[i] + (c.x[j] - c.x[i]) * u;
                out.y = c.y[i] + (c.y[j] - c.y[i]) * u + BNR.TrackView.RAIL;
                out.z = c.z[i] + (c.z[j] - c.z[i]) * u;
                out.i = i;
                out.struct = c.struct[i];
                return out;
            }
        };
    }

    /**
     * The ground as every track and station sees it: each track cuts and fills
     * its own bed (the strongest wins), tunnels keep their roof, and station
     * platforms and houses stand on flat pads. Props keep clear of all of it.
     */
    function makeGround(tracks, pads) {
        const info = {};
        function shapeGround(x, z, gh, out) {
            let bestW = 0, res = gh, near = Infinity, cover = -Infinity;
            for (let k = 0; k < tracks.length; k++) {
                tracks[k].shapeGround(x, z, gh, info);
                if (info.near < near) near = info.near;
                if (info.cover > cover) cover = info.cover;
                if (info.w > bestW) { bestW = info.w; res = info.dh; }
            }
            let h = bestW > 0 ? res : gh;
            if (cover > -Infinity) h = Math.max(h, Math.min(cover, gh + 4));
            for (let k = 0; k < pads.length; k++) {
                const p = pads[k];
                const dx = x - p.x, dz = z - p.z;
                const a = dx * p.ux + dz * p.uz, w = dx * p.wx + dz * p.wz;
                if (w < p.w0 || Math.abs(a) > p.hl + 6 || w > p.w1 + 6) continue;   // never reach across to the track
                const d = Math.hypot(Math.max(Math.abs(a) - p.hl, 0), Math.max(w - p.w1, 0));
                const kk = 1 - U.smoothstep(0, 6, d);
                h += (p.y - h) * kk;
                if (d < 2) near = 0;
            }
            if (out) { out.near = near; out.w = bestW; }
            return h;
        }
        return { shapeGround: shapeGround, centerline: function () { return tracks[0].centerline(); }, tracks: tracks };
    }

    function unload() {
        if (build) { build.view.dispose(); build = null; }
        if (events) { events.dispose(); events = null; }
        if (train) { train.dispose(); train = null; }
        if (stations) { stations.dispose(); stations = null; }
        lineViews.forEach(v => v.dispose());
        lineViews = [];
        if (view) { view.dispose(); view = null; }
        if (terrain) { terrain.dispose(); terrain = null; }
        BNR.FX.clear();
        world = track = route = sampler = ride = ground = null;
        lines = [];
    }

    /** The route's event list with each trigger position worked out. */
    function eventsFor(r, c) {
        if (!r || !r.events) return [];
        return r.events.map(function (def) {
            const K = BNR.Events.info(def.type);
            const piece = Math.max(0, Math.min(track.pieces.length - 1, def.piece | 0));
            const sAnchor = c.s[c.startIndex[piece]] + track.pieces[piece].len / 2;
            const lead = def.lead !== undefined ? def.lead : (K && K.lead !== undefined ? K.lead : 90);
            return { def: def, sAnchor: sAnchor, sTrigger: ((sAnchor - lead) % c.length + c.length) % c.length };
        });
    }

    /**
     * Load a route (spec.route) or a given world and track. o: { quality, season, speed, budget }.
     * Ride worlds are bounded to the track's area (plus a margin of scenery).
     */
    function load(spec, o) {
        o = o || {};
        unload();
        if (o.quality) quality = o.quality;
        let lineTracks = [];
        if (spec.route) {
            const b = BNR.Routes.build(spec.route);
            world = b.world; track = b.track; route = b.route; lineTracks = b.lines;
        } else { world = spec.world; track = spec.track; route = spec.routeDef || null; }
        // The season paints the land. A route may prefer a time or a season (Night City at
        // night); that only applies where the setting is on Auto Cycle.
        if (BNR.Weather) {
            BNR.Weather.settle();          // a ride starts in its season (changes play out while riding)
            if (o.season) BNR.Weather.jump({ season: o.season });
            else if (route && o.prefer !== false) BNR.Weather.prefer(route.prefer);
            season = BNR.Weather.season();
            BNR.Weather.state.appliedSeason = season;
        } else if (o.season) season = o.season;
        biomeHere = null;
        const c = track.centerline();
        lines = lineTracks.map(t => ({ track: t, sampler: makeSampler(t.centerline()) }));
        // Stations first: their pads flatten the ground the terrain is built on.
        stations = BNR.Stations.create(THREE, { track: track, scene: scene, sites: spec.sites || (c.closed ? track.stationSites() : []), seed: world.seed });
        ground = makeGround([track].concat(lineTracks), stations.pads());
        terrain = BNR.Terrain.create(THREE, { world: world, track: ground, scene: scene, quality: quality, season: season });
        if (spec.bounded !== false) {
            let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
            for (let i = 0; i < c.n; i++) { x0 = Math.min(x0, c.x[i]); x1 = Math.max(x1, c.x[i]); z0 = Math.min(z0, c.z[i]); z1 = Math.max(z1, c.z[i]); }
            const M = 300;
            terrain.setBounds(x0 - M, z0 - M, x1 + M, z1 + M);
        }
        view = BNR.TrackView.create(THREE, { world: world, track: track, scene: scene, avoid: onPlatform, lazy: !!viewer });
        lineViews = lineTracks.map(t => BNR.TrackView.create(THREE, { world: world, track: t, scene: scene }));
        train = BNR.Train.create(THREE, { scene: scene });
        sampler = makeSampler(c);
        joints = track.pieces.map((p, i) => c.s[c.startIndex[i]]);
        const L = c.length;
        ride = BNR.Ride.create({
            length: L,
            stations: stations.list.map(s => ({ sStop: ((s.sCenter + train.length / 2) % L + L) % L, index: s.index, name: s.name, biome: s.biome })),
            events: eventsFor(route, c),
            speed: o.speed === undefined ? 1 : o.speed,
            startS: train.length + 4
        });
        if (ride.stations.length) ride.standAt(0, o.dwell === undefined ? 2.5 : o.dwell);
        events = BNR.Events.create(THREE, {
            scene: scene, track: track, world: world, lines: lines, seed: world.seed,
            ground: function (x, z) { return terrain.heightAt(x, z); },
            emit: emit
        });
        st.s = ride.s; st.speed = 0; st.ds = 0;
        chuffAcc = 0; idleT = 0; inTunnel = false; flashT = 0;
        train.place(sampler, st.s, 0);
        const p = train.position();
        if (viewer) view.update(p.x, p.z, trackSight(), true);
        weatherStep(0, p);
        sky.update(0, p.x, p.y, p.z);
        terrain.update(p.x, p.z, { budget: o.budget === undefined ? 30 : o.budget });
        fitFog();
        emit('loaded', { route: route });
    }

    /** How far the track is kept built round the camera: as far as the land is drawn. */
    function trackSight() { return (terrain ? terrain.viewDistance() : 420) + 30; }

    function onPlatform(x, z) { return !!(stations && stations.covers && stations.covers(x, z)); }

    // --- Build mode -------------------------------------------------------------------------------

    /**
     * Build or Quick Build: the session's world and its growing (open) track, the stations
     * it has so far, and the train waiting at the start station. No ride, no events: the
     * camera follows the end of the track (buildFocus). o: { quality }.
     */
    function loadBuild(session, o) {
        o = o || {};
        unload();
        if (o.quality) quality = o.quality;
        world = session.world; track = session.track; route = session.route || null;
        const lineTracks = session.lines || [];
        lines = lineTracks.map(t => ({ track: t, sampler: makeSampler(t.centerline()) }));
        if (BNR.Weather) {
            BNR.Weather.settle();
            if (route) BNR.Weather.prefer(route.prefer);
            season = BNR.Weather.season();
            BNR.Weather.state.appliedSeason = season;
        }
        biomeHere = null;
        stations = BNR.Stations.create(THREE, { track: track, scene: scene, sites: session.sites.slice(), seed: world.seed });
        if (session.fullTrack) {
            // Quick Build: the ground is ready for the whole route and every station from the start
            // (as a Ride's is), so nothing standing beside it vanishes as the track goes down.
            const all = BNR.Stations.create(THREE, { track: session.fullTrack, parent: new THREE.Group(), sites: session.allSites.slice(), seed: world.seed });
            ground = makeGround([session.fullTrack].concat(lineTracks), all.pads());
            all.dispose();
        } else ground = makeGround([track].concat(lineTracks), stations.pads());
        terrain = BNR.Terrain.create(THREE, { world: world, track: ground, scene: scene, quality: quality, season: season });
        if (session.bounds) terrain.setBounds(session.bounds[0], session.bounds[1], session.bounds[2], session.bounds[3]);
        view = BNR.TrackView.create(THREE, { world: world, track: track, scene: scene, avoid: onPlatform, lazy: !!viewer });
        lineViews = lineTracks.map(t => BNR.TrackView.create(THREE, { world: world, track: t, scene: scene }));
        train = BNR.Train.create(THREE, { scene: scene });
        sampler = makeSampler(track.centerline());
        joints = [];
        ride = null; events = null;
        build = { session: session, view: BNR.BuildView.create(THREE, { scene: scene, track: track }), sitesKey: sitesKey(session.sites) };
        // The train waits at the start station, its tail on the platform.
        const st0 = stations.list.find(s => s.index === 0) || stations.list[0];
        st.s = st0 ? st0.sCenter + train.length / 2 : train.length + 4;
        st.speed = 0; st.ds = 0;
        chuffAcc = 0; idleT = 0; inTunnel = false; flashT = 0;
        train.place(sampler, st.s, 0);
        track.clearDirty();
        const f = buildFocus();
        if (viewer) view.update(f.x, f.z, trackSight(), true);
        weatherStep(0, f);
        sky.update(0, f.x, f.y, f.z);
        terrain.update(f.x, f.z, { budget: o.budget === undefined ? 30 : o.budget });
        fitFog();
        emit('loaded', { build: true });
    }

    function sitesKey(list) { return list.map(s => s.zone + '@' + s.piece + ':' + s.side).join('|'); }

    /**
     * The track changed (a piece down, Undo, a step of Connect). Redraws the changed stretch,
     * re-shapes the ground near it (and where track was taken away: o.removed [{ x, z }]),
     * and adds or takes away stations.
     */
    function buildChanged(o) {
        if (!build) return;
        o = o || {};
        const from = Math.max(0, track.dirtyFrom() - 1);
        track.clearDirty();
        const c = track.centerline();
        sampler = makeSampler(c);
        view.rebuild(!o.full);
        const key = sitesKey(build.session.sites);
        const readyGround = !!build.session.fullTrack;     // Quick Build: the ground never changes
        if (key !== build.sitesKey) {
            const old = stations.list.map(s => ({ x: s.frame.x, z: s.frame.z }));
            stations.dispose();
            stations = BNR.Stations.create(THREE, { track: track, scene: scene, sites: build.session.sites.slice(), seed: world.seed });
            if (!readyGround) {
                ground = makeGround([track].concat(lines.map(l => l.track)), stations.pads());
                terrain.setTrack(ground);
                terrain.dirtyAt(old.concat(stations.list.map(s => ({ x: s.frame.x, z: s.frame.z }))), 34);
            }
            build.sitesKey = key;
            view.rebuild(false);     // bridge legs keep off the new platforms
        }
        if (!readyGround) {
            terrain.trackChanged(ground, from);
            if (o.removed) terrain.dirtyAt(o.removed);
        }
        build.view.refresh();
        train.place(sampler, st.s, 0);
    }

    /** Where the camera looks while building: the end of the track (where the next piece goes). */
    function buildFocus() {
        if (!build) return null;
        const e = build.view.end();
        return { x: e.x, y: e.y, z: e.z, h: e.h };
    }

    /** The whole loop, for the finished-loop camera: its middle and how far it reaches. */
    function buildOverview() {
        const c = track.centerline();
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, y = 0;
        for (let i = 0; i < c.n; i++) { x0 = Math.min(x0, c.x[i]); x1 = Math.max(x1, c.x[i]); z0 = Math.min(z0, c.z[i]); z1 = Math.max(z1, c.z[i]); y += c.y[i]; }
        return { x: (x0 + x1) / 2, y: c.n ? y / c.n : 0, z: (z0 + z1) / 2, r: Math.max(x1 - x0, z1 - z0) / 2 };
    }

    /** Confetti at every station and round the loop, and the whistle. */
    function buildCelebrate() {
        if (!build) return;
        const c = track.centerline();
        const pts = stations.list.map(s => ({ x: s.frame.x, y: s.frame.y, z: s.frame.z }));
        for (let k = 0; k < 6; k++) { const i = Math.floor(c.n * k / 6); pts.push({ x: c.x[i], y: c.y[i], z: c.z[i] }); }
        build.view.celebrate(pts);
        horn();
    }

    function updateBuild(dt) {
        // The train waits at the start station, puffing now and then.
        if (!chim) { chim = new THREE.Vector3(); whis = new THREE.Vector3(); }
        train.chimney(chim);
        idleT += dt;
        if (idleT > 1.6) { idleT = 0; BNR.FX.steam(chim.x, chim.y, chim.z, 1, 0.55, 0, 1.2, 0); }
        if (flashT > 0) { flashT = Math.max(0, flashT - dt * 1.4); train.flash(flashT * flashT); }
        stations.update(dt);
        build.view.update(dt);
        const f = buildFocus();
        terrain.update(f.x, f.z, { budget: 6 });
        if (viewer) { view.update(f.x, f.z, trackSight()); stations.cull(f.x, f.z, trackSight()); }
        weatherStep(dt, f);
        fitFog();
        sky.update(dt, f.x, f.y, f.z);
        BNR.FX.update(dt);
    }

    const tmpQ = {}, tmpV = {};
    let chim = null, whis = null;

    /** Step the world: drive the train, wave, run events, puff steam. */
    function update(dt) {
        if (!train) return;
        clock += dt;
        if (build) { updateBuild(dt); return; }
        const s0 = ride.s;
        const happened = ride.update(dt);
        st.ds = ride.s - s0;
        st.s = ride.s;
        st.speed = ride.v;
        train.place(sampler, st.s, st.ds);
        shadeTrain(dt);
        happened.forEach(function (h) {
            if (h.type === 'arrive') { stations.wave(h.station.index, BNR.Ride.DWELL + 2); emit('arrive', h.station); }
            else if (h.type === 'depart') emit('depart', h.station);
            else if (h.type === 'event') {
                const ev = h.event;
                if (!whenOk(ev.def.when)) return;   // e.g. fireworks only at night
                const K = events.start(ev.def, { trainS: st.s, lead: ((ev.sAnchor - ev.sTrigger) % sampler.length + sampler.length) % sampler.length });
                if (K) emit('event', { def: h.event.def, say: K.say });
            }
        });
        // Steam: a chuff per CHUFF_STEP travelled; wisps while standing.
        if (!chim) { chim = new THREE.Vector3(); whis = new THREE.Vector3(); }
        train.chimney(chim);
        if (st.ds > 0) {
            chuffAcc += st.ds;
            if (chuffAcc >= CHUFF_STEP) {
                chuffAcc %= CHUFF_STEP;
                if (!inTunnel) BNR.FX.steam(chim.x, chim.y, chim.z, 2, 0.75 + 0.03 * st.speed, 0, 2.2 + st.speed * 0.08, 0);
                emit('chuff', { speed: st.speed, inTunnel: inTunnel });
            }
        } else {
            idleT += dt;
            if (idleT > 1.3) { idleT = 0; if (!inTunnel) BNR.FX.steam(chim.x, chim.y, chim.z, 1, 0.55, 0, 1.2, 0); }
        }
        // A clack as the front wheels cross each rail joint.
        if (st.ds > 0) {
            const L = sampler.length;
            const a = ((s0 % L) + L) % L, b = a + st.ds;
            for (let k = 0; k < joints.length; k++) {
                const j = joints[k], j2 = j + L;
                if ((j > a && j <= b) || (j2 > a && j2 <= b)) { emit('clack', { inTunnel: inTunnel }); break; }
            }
        }
        if (flashT > 0) { flashT = Math.max(0, flashT - dt * 1.4); train.flash(flashT * flashT); }
        stations.update(dt);
        const p = train.position();
        events.update(dt, { train: { s: st.s, x: p.x, y: p.y, z: p.z, v: st.speed, length: train.length }, env: env });
        terrain.update(p.x, p.z, { budget: 6 });
        if (viewer) { view.update(p.x, p.z, trackSight()); stations.cull(p.x, p.z, trackSight()); }
        weatherStep(dt, p);
        fitFog();
        sky.update(dt, p.x, p.y, p.z);
        BNR.FX.update(dt);
    }

    /**
     * Time of day, season and weather (js/weather.js): the sky, the night lights, rain and
     * snow round the camera, and env for the events. The headlight shines at night and in tunnels.
     */
    const camP = { x: 0, y: 0, z: 0, yaw: 0 };
    function weatherStep(dt, p) {
        if (!BNR.Weather) return;
        biomeT -= dt;
        if (biomeT <= 0 || !biomeHere) {
            biomeT = 0.5;
            const m = world.mix(p.x, p.z).color;
            let best = -1;
            for (const id in m) if (m[id] > best) { best = m[id]; biomeHere = id; }
        }
        let hide = false;
        if (viewer) {
            camP.x = viewer.position.x; camP.y = viewer.position.y; camP.z = viewer.position.z;
            const d = viewer.getWorldDirection(tmpDir || (tmpDir = new THREE.Vector3()));
            camP.yaw = Math.atan2(d.x, d.z);
            // Under the hill (in a tunnel) nothing falls on the camera.
            hide = terrain.heightAt(camP.x, camP.z) > camP.y + 0.5;
        } else { camP.x = p.x; camP.y = p.y + 6; camP.z = p.z; camP.yaw = 0; }
        const W = BNR.Weather.update(dt, {
            THREE: THREE, scene: scene, sky: sky, terrain: terrain, train: train, stations: stations,
            camera: camP, biome: biomeHere, hideFall: hide, quality: quality
        });
        train.setHeadlight(Math.max(W.lights || 0, shade));
    }

    /**
     * Does the world's mood allow an event? when: { night: true | false, season: 'winter' or
     * ['fall', 'winter'], weather: 'clear' or [...], afterRain: true }. No `when`: always.
     */
    function whenOk(when) {
        if (!when) return true;
        if (when.night === true && env.night < 0.5) return false;
        if (when.night === false && env.night >= 0.5) return false;
        const list = v => Array.isArray(v) ? v : [v];
        if (when.season && list(when.season).indexOf(env.season) < 0) return false;
        if (when.weather && list(when.weather).indexOf(env.weather) < 0) return false;
        if (when.afterRain && !env.afterRain) return false;
        return true;
    }

    /** Never draw past the fog: the far fog sits just inside how far the terrain is built. */
    function fitFog() {
        if (!scene.fog || !terrain) return;
        const pal = sky.palette();
        const far = Math.min(pal.fogFar, terrain.viewDistance() - 15);
        scene.fog.far = far;
        scene.fog.near = Math.min(pal.fogNear, far * 0.4);
    }

    /** Dim the train while the loco is in a tunnel (eased, so the portals don't snap). */
    let shade = 0;
    const shadeP = {};
    function shadeTrain(dt) {
        const inside = sampler.at(st.s - 4, shadeP).struct === 'tunnel';
        if (inside !== inTunnel) { inTunnel = inside; emit('tunnel', inside); }
        shade = dt > 0 ? U.damp(shade, inside ? 1 : 0, 3, dt) : (inside ? 1 : 0);
        train.setShade(shade);
    }

    /** A point on the track a little ahead of the train, as an event anchor (the horn's birds). */
    function anchorNearTrain(ahead) {
        const a = sampler.at(st.s + ahead, tmpQ), b = sampler.at(st.s + ahead + 2, tmpV);
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        return { x: a.x, y: a.y, z: a.z, tx: dx / l, tz: dz / l, rx: -dz / l, rz: dx / l, s: st.s + ahead };
    }

    /** The horn: a big white puff from the whistle, the lamp flares, and birds nearby take off. */
    function horn() {
        if (!train) return;
        train.whistle(whis || (whis = new THREE.Vector3()));
        const f = train.forward(new THREE.Vector3());
        BNR.FX.steam(whis.x, whis.y, whis.z, 10, 1.05, f.x * st.speed * 0.6, 3.6, f.z * st.speed * 0.6, '#ffffff');
        BNR.FX.twinkle(whis.x, whis.y + 0.6, whis.z, 8, '#fff6c8');
        flashT = 1;
        if (!inTunnel && events && clock - lastBirds > 5) {
            lastBirds = clock;
            const side = Math.random() < 0.5 ? 1 : -1;
            events.start({ type: 'birds', count: 8, side: side, ahead: 4, away: 11 }, { anchor: anchorNearTrain(14), trainS: st.s, lead: 14 });
        }
        emit('horn', {});
    }

    /**
     * A separate little world for a route's picture tile: the route's land, track,
     * stations and a train at its `thumb` spot, with its own sky and lights.
     * Returns { scene, camera, dispose }.
     */
    function diorama(id, w, h) {
        const b = BNR.Routes.build(id);
        const r = b.route, c = b.track.centerline();
        const sc = new THREE.Scene();
        const sk = BNR.Sky.create(THREE, sc, { seed: 3 });
        const st2 = BNR.Stations.create(THREE, { track: b.track, scene: sc, sites: b.track.stationSites(), seed: b.world.seed });
        const gr = makeGround([b.track].concat(b.lines), st2.pads());
        const pf = r.prefer || {};
        const ter = BNR.Terrain.create(THREE, { world: b.world, track: gr, scene: sc, quality: quality === 'high' ? 'standard' : quality, season: pf.season || 'summer' });
        const tv = BNR.TrackView.create(THREE, { world: b.world, track: b.track, scene: sc });
        const lv = b.lines.map(t => BNR.TrackView.create(THREE, { world: b.world, track: t, scene: sc }));
        const tr = BNR.Train.create(THREE, { scene: sc });
        const smp = makeSampler(c);
        const th = r.thumb || { piece: 4, back: 24, side: -12, up: 12 };
        const s = c.s[c.startIndex[Math.min(b.track.pieces.length - 1, th.piece)]];
        tr.place(smp, s, 0);
        const head = smp.at(s), ahead = smp.at(s + 3);
        const dx = ahead.x - head.x, dz = ahead.z - head.z, l = Math.hypot(dx, dz) || 1;
        const tx = dx / l, tz = dz / l, rx = -tz, rz = tx;
        const cam = new THREE.PerspectiveCamera(48, (w || 480) / (h || 360), 0.3, 1400);
        cam.position.set(head.x - tx * th.back + rx * th.side, head.y + th.up, head.z - tz * th.back + rz * th.side);
        cam.lookAt(head.x + tx * 10, head.y + 1.5, head.z + tz * 10);
        cam.updateMatrixWorld(true);
        ter.update(head.x + tx * 60, head.z + tz * 60, { budget: -1, radius: 300 });
        // The picture shows the route at its best time (Night City at night, lights on).
        if (pf.time && BNR.Weather) {
            const hr = BNR.Weather.TIMES[pf.time];
            const pal = BNR.Weather.paletteAt(hr);
            pal.sunDir = BNR.Weather.sunDirAt(hr);
            sk.setPalette(pal);
            const nk = U.smoothstep(0.25, 0.85, pal.stars);
            ter.setNight(nk); st2.setNight(nk); tr.setNight(nk); tr.setHeadlight(nk);
        }
        sk.update(0, head.x, head.y, head.z);
        sc.fog.far = 330; sc.fog.near = 140;
        return {
            scene: sc, camera: cam, sky: sk,
            dispose: function () { tr.dispose(); lv.forEach(v => v.dispose()); tv.dispose(); ter.dispose(); st2.dispose(); sk.dispose(); }
        };
    }

    /** Put the train's head at s, rolling (tools and tests). */
    function placeAt(s) {
        if (!ride) return;
        ride.s = s; ride.v = 0; ride.phase = 'run'; ride.station = null;
        st.s = s; st.ds = 0;
        train.place(sampler, s, 0);
        shadeTrain(0);
    }

    /** Where the train is: head distance, speed, loco position and heading, in a tunnel or not. */
    /**
     * For each centre-line sample, how far above it another stretch of the track runs (a
     * corkscrew's next loop, an overpass), or Infinity. Worked out once per track shape.
     */
    let overhead = null, overheadFor = null;
    function overheadOf(c) {
        if (overheadFor === c) return overhead;
        const n = c.n, out = new Float32Array(n).fill(Infinity), grid = new Map();
        for (let i = 0; i < n; i++) {
            const k = Math.floor(c.x[i] / 4) + ',' + Math.floor(c.z[i] / 4);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(i);
        }
        for (let i = 0; i < n; i++) {
            const gx = Math.floor(c.x[i] / 4), gz = Math.floor(c.z[i] / 4);
            for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                const list = grid.get((gx + dx) + ',' + (gz + dz));
                if (!list) continue;
                for (const j of list) {
                    let d = Math.abs(i - j);
                    if (c.closed) d = Math.min(d, n - d);
                    if (d <= 20 || c.y[j] < c.y[i] + 2) continue;
                    if (Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]) < 3.6) out[i] = Math.min(out[i], c.y[j] - c.y[i]);
                }
            }
        }
        overhead = out; overheadFor = c;
        return out;
    }
    /** Is there track overhead, too low for the Third Person camera, anywhere from s0 to s1? */
    function coveredBetween(s0, s1) {
        if (!sampler) return false;
        const c = sampler.centerline, over = overheadOf(c), q = {};
        for (let k = 0; k <= 6; k++) { sampler.at(s0 + (s1 - s0) * k / 6, q); if (over[q.i] < 11) return true; }
        return false;
    }

    function trainState() {
        if (!train) return null;
        return {
            s: st.s, speed: st.speed, inTunnel: inTunnel, phase: ride ? ride.phase : 'run', pos: train.position(new THREE.Vector3()), fwd: train.forward(new THREE.Vector3()),
            // Track overhead where the Third Person camera rides (behind the train): it keeps low, as in a tunnel.
            covered: coveredBetween(st.s - 24, st.s - 2)
        };
    }

    return {
        init: init,
        load: load,
        unload: unload,
        update: update,
        on: on,
        horn: horn,
        diorama: diorama,
        placeAt: placeAt,
        setSpeed: function (i) { if (ride) ride.setSpeed(i); },
        setViewer: function (cam) { viewer = cam; },
        loadBuild: loadBuild,
        buildChanged: buildChanged,
        buildFocus: buildFocus,
        buildOverview: buildOverview,
        buildCelebrate: buildCelebrate,
        isBuild: function () { return !!build; },
        buildSession: function () { return build ? build.session : null; },
        /** The see-through preview (BNR.BuildView ghost): list of pieces and 'next' | 'undo' | 'plan'. */
        buildGhost: function (list, style) { if (build) build.view.ghost(list, style); },
        /** New pieces fall into place; onLand runs as they land. */
        buildDrop: function (list, onLand, fall) { if (build) build.view.drop(list, onLand, fall); else if (onLand) onLand(); },
        /** Finish a falling piece now (before the next change). */
        buildLand: function () { if (build) build.view.land(); },
        buildBusy: function () { return !!(build && build.view.busy()); },
        env: env,
        whenOk: whenOk,
        scene: function () { return scene; },
        sky: function () { return sky; },
        world: function () { return world; },
        track: function () { return track; },
        route: function () { return route; },
        terrain: function () { return terrain; },
        view: function () { return view; },
        train: function () { return train; },
        stations: function () { return stations; },
        events: function () { return events; },
        ride: function () { return ride; },
        lines: function () { return lines; },
        sampler: function () { return sampler; },
        state: st,
        trainState: trainState,
        makeSampler: makeSampler,
        setQuality: function (q) { quality = q; },
        quality: function () { return quality; },
        season: function () { return season; }
    };
})();
