/**
 * NARBE Build n Ride - time of day, seasons and weather.
 *
 * Three gentle cycles, each of which a setting can lock:
 *   time     Auto Cycle (a whole day in DAY seconds) | Morning | Day | Sunset | Night
 *   season   Auto Cycle (each season SEASON seconds)  | Spring | Summer | Fall | Winter
 *   weather  Auto (changes every minute or two)       | Clear | Rain | Snow | Fog
 * Snow only falls in winter or in a snowy biome; otherwise the sky just clouds over.
 * After rain stops a rainbow shows for a while (env.afterRain).
 *
 * Seasons change slowly, and their weather comes first (startChange): winter
 * starts snowing, then the land whitens patch by patch over a minute or so;
 * spring brings rain that thaws it green; fall brings drifting leaves while the
 * trees turn one by one; summer clears the sky. Choosing a season in Settings
 * plays the same change, a little quicker. Loading a ride starts settled (settle).
 *
 * Each frame it blends the sky palette (BNR.Sky.setPalette) from the hour and the
 * weather, lights the night (station lamps and windows, house windows, the
 * train's headlight and coach windows), drifts rain or snow round the camera,
 * recolours the land when the season turns, and keeps BNR.Scene.env up to date
 * for events (fireworks only at night, northern lights on winter nights).
 * Runs in Node (the tools step it like the browser does).
 */

window.BNR = window.BNR || {};

BNR.Weather = (function () {
    'use strict';

    const U = BNR.Util;
    const DAY = 600;               // seconds for a whole day on Auto Cycle
    const SEASON = 240;            // seconds each season holds on Auto Cycle (before the change to the next)
    const SEASONS = ['spring', 'summer', 'fall', 'winter'];
    /**
     * A season change: `lead` seconds of the new season's weather before the land starts to
     * change, then `dur` seconds of the land changing; its weather keeps on for AFTER more.
     */
    const CHANGE = { auto: { lead: 15, dur: 80 }, chosen: { lead: 8, dur: 40 } };
    const AFTER = 40;
    /** The weather that brings each season in: snow, thawing rain, drifting leaves, sunshine. */
    const ARRIVAL = { winter: 'snow', spring: 'rain', fall: 'leaves', summer: 'clear' };
    const TIMES = { morning: 7.5, day: 12.5, sunset: 18.4, night: 22.5 };

    const PAL = {
        night: { top: '#0a1430', mid: '#15234a', horizon: '#273864', fog: '#1b2746', fogNear: 90, fogFar: 330,
            hemiSky: '#3d4f80', hemiGround: '#151b2b', hemi: 0.62, sun: '#a8bbff', sunI: 0.42, cloud: '#3a4566', sunDisc: '#e8eeff', stars: 1 },
        morning: { top: '#5a8fd8', mid: '#f2b8a2', horizon: '#ffd9aa', fog: '#efd3bb', fogNear: 130, fogFar: 400,
            hemiSky: '#ffe2c8', hemiGround: '#7a6a5a', hemi: 1.15, sun: '#ffd8a6', sunI: 2.1, cloud: '#ffe6d6', sunDisc: '#ffe2b4', stars: 0 },
        day: { top: '#3a86d8', mid: '#86c4ef', horizon: '#dcf0f9', fog: '#cfe6f2', fogNear: 150, fogFar: 430,
            hemiSky: '#d8ecff', hemiGround: '#8a7d5c', hemi: 1.35, sun: '#fff2d8', sunI: 2.7, cloud: '#ffffff', sunDisc: '#fff6d6', stars: 0 },
        sunset: { top: '#3b4f9a', mid: '#e98a6a', horizon: '#ffb46c', fog: '#e9a27c', fogNear: 120, fogFar: 380,
            hemiSky: '#ffc49a', hemiGround: '#6a4a3a', hemi: 1.05, sun: '#ff9d5c', sunI: 2.0, cloud: '#ffb48c', sunDisc: '#ffb070', stars: 0 }
    };
    const OVERCAST = { top: '#7a8492', mid: '#97a0aa', horizon: '#b6bdc5', fog: '#a7afb8', cloud: '#c9ced4', hemiSky: '#c4ccd6' };
    // Hour -> palette blend: [hour, palette name], interpolated between neighbours.
    const KEYS = [[0, 'night'], [5, 'night'], [6.6, 'morning'], [8.6, 'day'], [16.4, 'day'], [18.2, 'sunset'], [19.6, 'night'], [24, 'night']];

    const state = {
        modes: { time: 'auto', season: 'auto', weather: 'auto' },
        hour: 9, seasonIndex: 1, seasonT: 0,
        weather: 'clear', nextWeatherIn: 75, wet: 0, snowy: 0, fogK: 0, overcast: 0,
        afterRain: 0, wasRaining: false, appliedSeason: null, night: 0, bow: 0,
        lights: 0,                  // how much the lamps are on, 0..1 (js/scene.js lights the headlight with it)
        trans: null,                // a season change: { from, to, lead, dur, t, k (land 0..1) }
        arrival: null,              // the weather bringing a season in: { kind, left (seconds) }
        leaves: 0                   // falling leaves, 0..1
    };
    let precip = null;

    function lerpHex(a, b, t) {
        const A = U.hexRGB(a), B = U.hexRGB(b);
        const c = A.map((v, i) => Math.round((v + (B[i] - v) * t) * 255));
        return '#' + c.map(v => ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2)).join('');
    }

    function mixPal(a, b, t) {
        const out = {};
        for (const k in a) out[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * t : lerpHex(a[k], b[k], t);
        return out;
    }

    /** The clear-sky palette for an hour. */
    function paletteAt(hour) {
        hour = ((hour % 24) + 24) % 24;
        for (let i = 0; i + 1 < KEYS.length; i++) {
            const a = KEYS[i], b = KEYS[i + 1];
            if (hour >= a[0] && hour <= b[0]) {
                const t = b[0] > a[0] ? (hour - a[0]) / (b[0] - a[0]) : 0;
                return mixPal(PAL[a[1]], PAL[b[1]], t * t * (3 - 2 * t));
            }
        }
        return Object.assign({}, PAL.night);
    }

    /** How dark it is: 0 day .. 1 night (from the palette's stars). */
    function nightAt(hour) { return paletteAt(hour).stars; }

    /** Where the sun is: rises in the east at 6, high at noon, sets in the west at 18; the moon at night. */
    function sunDirAt(hour) {
        const th = (hour - 6) / 12 * Math.PI;
        const up = Math.sin(th);
        if (up < -0.05) return [0.35, 0.8, -0.45];   // moonlight from high in the south-west
        return [-Math.cos(th) * 0.85, Math.max(0.08, up) * 0.95 + 0.06, 0.38];
    }

    // --- rain and snow round the camera ---------------------------------------------------------

    function makePrecip(THREE, scene) {
        // Sized to be seen: streaks and flakes a camera a few metres back can make out.
        const rainGeo = new THREE.PlaneGeometry(0.07, 2.0);
        const snowGeo = new THREE.CircleGeometry(0.24, 6);         // six-sided flakes
        const leafGeo = new THREE.PlaneGeometry(0.34, 0.22);
        const rainMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfe0f2'), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
        const snowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff'), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
        const leafMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#ffffff'), side: THREE.DoubleSide });
        const N = 900, NL = 260;
        const rain = new THREE.InstancedMesh(rainGeo, rainMat, N), snow = new THREE.InstancedMesh(snowGeo, snowMat, N);
        const leaves = new THREE.InstancedMesh(leafGeo, leafMat, NL);
        [rain, snow, leaves].forEach(m => { m.frustumCulled = false; m.count = 0; m.renderOrder = 8; scene.add(m); });
        const rnd = U.mulberry(31);
        // Most drops close round the camera (where they show), thinning out to 42 m.
        function spot() {
            const r = 2 + Math.pow(rnd(), 1.4) * 40, a = rnd() * Math.PI * 2;
            return { x: Math.cos(a) * r, y: rnd() * 42 - 6, z: Math.sin(a) * r, ph: rnd() * 6, s: 0.7 + rnd() * 0.6 };
        }
        const drops = [], fall = [];
        for (let i = 0; i < N; i++) drops.push(spot());
        const LEAF = ['#e07b2a', '#d2452f', '#e8b53a', '#c96a2b', '#e39b35'];
        const lc = new THREE.Color();
        for (let i = 0; i < NL; i++) {
            fall.push(spot());
            leaves.setColorAt(i, lc.set(LEAF[i % LEAF.length]));
        }
        if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
        let t = 0;
        return {
            update: function (dt, cam, rainK, snowK, leafK, max, hidden) {
                t += dt;
                const nr = hidden ? 0 : Math.round(max * rainK), ns = hidden ? 0 : Math.round(max * snowK);
                const nl = hidden ? 0 : Math.min(NL, Math.round(NL * leafK * (max / 900)));
                rain.count = nr; snow.count = ns; leaves.count = nl;
                const cx0 = cam.x, cy0 = cam.y, cz0 = cam.z;
                // Leaves drift down, swaying and turning over.
                for (let i = 0; i < nl; i++) {
                    const d = fall[i];
                    d.y -= 1.3 * dt * d.s;
                    if (d.y < -8) d.y += 48;
                    q.setFromEuler(e.set(t * 1.7 + d.ph, t * 0.9 + d.ph * 2, Math.sin(t * 1.3 + d.ph) * 1.2));
                    m4.compose(p.set(cx0 + d.x + Math.sin(t * 0.8 + d.ph) * 2.2, cy0 + d.y, cz0 + d.z + Math.cos(t * 0.6 + d.ph) * 1.6), q, sc.set(d.s, d.s, d.s));
                    leaves.setMatrixAt(i, m4);
                }
                if (nl) leaves.instanceMatrix.needsUpdate = true;
                if (!nr && !ns) return;
                const cx = cam.x, cy = cam.y, cz = cam.z;
                const yaw = cam.yaw || 0;
                for (let i = 0; i < Math.max(nr, ns); i++) {
                    const d = drops[i];
                    if (i < nr) {
                        d.y -= 26 * dt * d.s;
                        if (d.y < -8) d.y += 48;
                        q.setFromEuler(e.set(0, yaw, 0.12));
                        m4.compose(p.set(cx + d.x + d.y * 0.1, cy + d.y, cz + d.z), q, sc.set(1, d.s, 1));
                        rain.setMatrixAt(i, m4);
                    }
                    if (i < ns) {
                        d.y -= 2.2 * dt * d.s;
                        if (d.y < -8) d.y += 48;
                        q.setFromEuler(e.set(t * 0.7 + d.ph, yaw + d.ph, 0));
                        m4.compose(p.set(cx + d.x + Math.sin(t * 0.6 + d.ph) * 1.6, cy + d.y, cz + d.z + Math.cos(t * 0.5 + d.ph) * 1.2), q, sc.set(d.s, d.s, d.s));
                        snow.setMatrixAt(i, m4);
                    }
                }
                rain.instanceMatrix.needsUpdate = true;
                snow.instanceMatrix.needsUpdate = true;
            },
            dispose: function () {
                [rain, snow, leaves].forEach(m => { scene.remove(m); m.dispose(); });
                [rainGeo, snowGeo, leafGeo, rainMat, snowMat, leafMat].forEach(x => x.dispose());
            }
        };
    }

    // --- the cycles ---------------------------------------------------------------------------------

    /** The season the land shows most of (during a change: the old one until halfway). */
    function season() {
        const tr = state.trans;
        if (tr) return tr.k >= 0.5 ? tr.to : tr.from;
        return SEASONS[state.seasonIndex];
    }

    /** The season on its way (or the one settled). */
    function target() { return state.trans ? state.trans.to : SEASONS[state.seasonIndex]; }

    /** The land's look: { from, to, k } (k 0 = all `from` .. 1 = all `to`). */
    function look() {
        const tr = state.trans;
        if (tr) return { from: tr.from, to: tr.to, k: tr.k };
        const s = SEASONS[state.seasonIndex];
        return { from: s, to: s, k: 1 };
    }

    /**
     * Begin a slow change to season `to`. how: 'auto' (the cycle) or 'chosen' (Settings, a
     * little quicker). Its weather arrives first; the land follows.
     */
    function startChange(to, how) {
        if (SEASONS.indexOf(to) < 0 || to === target()) return;
        const from = season();
        if (from === to) { state.trans = null; state.seasonIndex = SEASONS.indexOf(to); return; }
        const c = CHANGE[how] || CHANGE.auto;
        state.trans = { from: from, to: to, lead: c.lead, dur: c.dur, t: 0, k: 0 };
        state.arrival = { kind: ARRIVAL[to], left: c.lead + c.dur + AFTER };
    }

    /** Finish any season change at once (a ride or a build loading starts settled). */
    function settle() {
        if (state.trans) state.seasonIndex = SEASONS.indexOf(state.trans.to);
        state.trans = null;
        state.arrival = null;
        state.leaves = 0;
        state.seasonT = 0;
    }

    /** Pick the next weather on Auto (snow only where it can snow; snowier in winter). */
    function nextWeather(canSnow, winter) {
        const r = Math.random();
        if (winter) return r < 0.4 ? 'clear' : r < 0.85 ? 'snow' : 'fog';
        if (r < 0.55) return 'clear';
        if (r < 0.75) return canSnow ? 'snow' : 'rain';
        if (r < 0.87) return 'fog';
        return canSnow ? 'snow' : 'rain';
    }

    /** Land with trees whose leaves can fall (not snowfields, desert, sea or city). */
    function leafy(biome) {
        if (!biome) return true;
        const b = BNR.Biomes.get(biome);
        return !b.snowy && !b.city && b.ambient !== 'desert' && b.ambient !== 'sea';
    }

    /**
     * Step the cycles. ctx: { THREE, scene, sky, terrain, train, stations, camera ({x, y, z, yaw}),
     * biome (the biome id under the train), hideFall (camera inside a tunnel), quality }.
     */
    function update(dt, ctx) {
        const m = state.modes;
        // Time.
        if (m.time === 'auto') state.hour = (state.hour + dt * 24 / DAY) % 24;
        else state.hour = U.damp(state.hour, TIMES[m.time], 0.8, dt);
        // Season: hold, then change slowly to the next (or to the one chosen in Settings).
        if (state.trans) {
            const tr = state.trans;
            tr.t += dt;
            tr.k = U.clamp((tr.t - tr.lead) / tr.dur, 0, 1);
            if (tr.t >= tr.lead + tr.dur) { state.seasonIndex = SEASONS.indexOf(tr.to); state.seasonT = 0; state.trans = null; }
        } else if (m.season === 'auto') {
            state.seasonT += dt;
            if (state.seasonT > SEASON) startChange(SEASONS[(state.seasonIndex + 1) % 4], 'auto');
        } else if (m.season !== SEASONS[state.seasonIndex]) startChange(m.season, 'chosen');
        const sea = season(), coming = target();
        // Snow only in winter (or when winter is on its way) or in snowy country.
        const snowyHere = !!(ctx.biome && BNR.Biomes.get(ctx.biome).snowy);
        const canSnow = coming === 'winter' || snowyHere;
        // Weather. A season's own weather brings it in (on Auto).
        const arr = state.arrival;
        if (arr) { arr.left -= dt; if (arr.left <= 0) state.arrival = null; }
        if (m.weather === 'auto') {
            state.nextWeatherIn -= dt;
            if (state.arrival && state.arrival.kind !== 'leaves') { state.weather = state.arrival.kind; state.nextWeatherIn = Math.max(state.nextWeatherIn, 20); }
            else if (state.nextWeatherIn <= 0) { state.weather = nextWeather(canSnow, coming === 'winter'); state.nextWeatherIn = 70 + Math.random() * 60; }
        } else state.weather = m.weather;
        let w = state.weather;
        if (w === 'snow' && !canSnow) w = m.weather === 'snow' ? 'cloudy' : 'rain';
        const raining = w === 'rain', snowing = w === 'snow';
        state.wet = U.damp(state.wet, raining ? 1 : 0, 0.5, dt);
        state.snowy = U.damp(state.snowy, snowing ? 1 : 0, 0.5, dt);
        state.fogK = U.damp(state.fogK, w === 'fog' ? 1 : 0, 0.4, dt);
        state.overcast = U.damp(state.overcast, raining || snowing || w === 'cloudy' ? 1 : w === 'fog' ? 0.7 : 0, 0.4, dt);
        // Leaves drift down as fall comes in, and now and then all through fall (where trees grow).
        const leafTo = !leafy(ctx.biome) || raining || snowing ? 0 : state.arrival && state.arrival.kind === 'leaves' ? 1 : sea === 'fall' ? 0.3 : 0;
        state.leaves = U.damp(state.leaves, leafTo, 0.4, dt);
        // A rainbow when rain stops (by day).
        if (state.wasRaining && !raining) state.afterRain = 55;
        state.wasRaining = raining;
        if (state.afterRain > 0) state.afterRain -= dt;
        const dayK = 1 - nightAt(state.hour);
        state.bow = U.damp(state.bow, state.afterRain > 3 && state.wet < 0.4 && dayK > 0.5 ? 1 : 0, 0.6, dt);

        // The sky.
        let pal = paletteAt(state.hour);
        pal.sunDir = sunDirAt(state.hour);
        pal.discK = 1 - state.overcast;
        if (state.overcast > 0.01) {
            const k = state.overcast * (1 - 0.6 * pal.stars);
            pal = Object.assign(pal, mixPal({ top: pal.top, mid: pal.mid, horizon: pal.horizon, fog: pal.fog, cloud: pal.cloud, hemiSky: pal.hemiSky }, OVERCAST, k));
            pal.sunI *= 1 - 0.65 * state.overcast;
            pal.stars *= 1 - state.overcast;
            pal.fogFar *= 1 - 0.3 * state.overcast;
        }
        if (state.fogK > 0.01) {
            pal.fogNear = U.lerp(pal.fogNear, 18, state.fogK);
            pal.fogFar = U.lerp(pal.fogFar, 150, state.fogK);
        }
        state.night = nightAt(state.hour);
        if (ctx.sky) { ctx.sky.setPalette(pal); ctx.sky.setRainbow(state.bow); }
        // Night lights.
        const nk = U.smoothstep(0.25, 0.85, state.night + 0.25 * state.overcast * state.night);
        if (ctx.terrain && ctx.terrain.setNight) ctx.terrain.setNight(nk);
        if (ctx.train) ctx.train.setNight(nk);
        state.lights = nk;
        if (ctx.stations && ctx.stations.setNight) ctx.stations.setNight(nk);
        // The season shows on the land, a little more every few seconds, patch by patch
        // (the terrain repaints a couple of chunks a frame).
        if (ctx.terrain) {
            const L = look();
            if (ctx.terrain.setLook) ctx.terrain.setLook(L.from, L.to, L.k);
            else if (state.appliedSeason !== sea) ctx.terrain.setSeason(sea);
            state.appliedSeason = sea;
        }
        // Rain, snow and leaves.
        if (ctx.THREE && ctx.scene) {
            if (!precip) precip = makePrecip(ctx.THREE, ctx.scene);
            const max = ctx.quality === 'low' ? 300 : ctx.quality === 'standard' ? 600 : 900;
            if (ctx.camera) precip.update(dt, ctx.camera, state.wet, state.snowy, state.leaves, max, !!ctx.hideFall);
        }
        // What events see.
        const env = BNR.Scene && BNR.Scene.env;
        if (env) {
            env.hour = state.hour; env.night = state.night; env.season = sea;
            env.weather = w === 'cloudy' ? 'clear' : w; env.wet = state.wet; env.afterRain = state.afterRain > 0;
        }
        return state;
    }

    /**
     * Lock or free each cycle: { time, season, weather } (values as in the settings). A season
     * chosen here comes in slowly, with its weather, the next time the world runs.
     */
    function setModes(modes) {
        Object.assign(state.modes, modes || {});
        if (state.modes.season !== 'auto') startChange(state.modes.season, 'chosen');
    }

    /** A route's preferred start (applied where the setting is on Auto). */
    function prefer(p) {
        if (!p) return;
        if (p.time && state.modes.time === 'auto') state.hour = TIMES[p.time] || state.hour;
        if (p.season && state.modes.season === 'auto') { state.trans = null; state.seasonIndex = Math.max(0, SEASONS.indexOf(p.season)); state.seasonT = 0; }
    }

    /** Jump straight to a look (tools and tests): { hour, season, weather }. */
    function jump(o) {
        if (o.hour !== undefined) state.hour = o.hour;
        if (o.season) { state.trans = null; state.arrival = null; state.seasonIndex = Math.max(0, SEASONS.indexOf(o.season)); }
        if (o.weather) {
            state.weather = o.weather;
            state.wet = o.weather === 'rain' ? 1 : 0; state.snowy = o.weather === 'snow' ? 1 : 0;
            state.fogK = o.weather === 'fog' ? 1 : 0; state.overcast = o.weather === 'rain' || o.weather === 'snow' ? 1 : o.weather === 'fog' ? 0.7 : 0;
        }
        if (o.afterRain) { state.afterRain = 40; state.bow = 1; }
    }

    function reset() {
        if (precip) { precip.dispose(); precip = null; }
        state.leaves = 0;
        state.appliedSeason = null;
    }

    return {
        update: update,
        setModes: setModes,
        settle: settle,
        look: look,
        target: target,
        prefer: prefer,
        jump: jump,
        reset: reset,
        state: state,
        season: season,
        paletteAt: paletteAt,
        sunDirAt: sunDirAt,
        SEASONS: SEASONS,
        TIMES: TIMES,
        DAY: DAY,
        SEASON: SEASON
    };
})();
