/**
 * NARBE Build n Ride - the world: which biome is where, how high the ground
 * is, where the water is, and the track datum.
 *
 * The DATUM is the level the track wants to run at: a very smooth function of
 * position whose slope stays gentle everywhere (under about 9 percent). The
 * track's height is datum + overpass lift, so any loop closes at the height it
 * started, and the world adapts to the track rather than the other way round:
 * ground far above the datum becomes a tunnel, ground far below (or water)
 * becomes a bridge, anything in between is flattened under the rails.
 *
 * Two kinds of world:
 *   routes      explicit zones (circles or wide lines of a biome) and features
 *               (hills, mountains, lakes, ponds, coves, rivers, canyons, mesas,
 *               plateaus with cliff edges, rocky outcrops, the sea; orchards,
 *               groves and landmarks place fixed props)
 *   procedural  Build mode: endless soft-edged regions on a jittered grid, each
 *               a biome with one to three features of its own, picked per region
 *               (hills, ponds, rivers, mesas, canyons, plateaus, outcrops,
 *               orchards, groves, a windmill, a rock arch, a waterfall ...)
 *
 *   const w = BNR.World.create({ seed, base, zones, features, datums? } | { seed, procedural: true });
 *   (datums: a route's own track level per biome, e.g. { mountains: 5 }, in place of the biome's;
 *    propScale: a route's own prop density per biome, e.g. { snowforest: 0.5 }, read by js/terrain.js)
 *   w.height(x, z)   natural ground height (before the track flattens it)
 *   w.datum(x, z)    the track's preferred level
 *   w.water(x, z)    water surface level here, or null
 *   w.zoneAt(x, z)   { key, biome, name } for stations
 *   w.colorAt(x, z, h, slope, season)   ground colour [r, g, b]
 * Runs in Node (no three.js).
 */

window.BNR = window.BNR || {};

BNR.World = (function () {
    'use strict';

    const U = BNR.Util;
    const TILE = 14;
    const REGION = 380;                 // procedural region spacing
    const TEMP = { color: 14, relief: 40, datum: 95 };   // region blend softness
    /**
     * Build mode's endless world: a slow climate field picks cold, mild or hot country, and
     * each region takes one of its band's landscapes, so neighbours belong together (snowy
     * pines beside an alpine meadow, never beside the dunes) and every landscape turns up.
     */
    const CLIMATE = {
        cold: ['snowforest', 'snowfield', 'alpine', 'mountains', 'snowvillage', 'snowforest', 'lake', 'alpine'],
        mild: ['meadow', 'farm', 'forest', 'lake', 'town', 'coast', 'forest', 'city', 'meadow', 'farm', 'mountains'],
        hot: ['desert', 'dunes', 'redrock', 'oasis', 'desert', 'redrock', 'dunes']
    };

    const SAND = U.hexRGB('#e5d39b');
    const LAKEBED = U.hexRGB('#b4a173');
    const ROCK = U.hexRGB('#8f8a82');
    const SNOWC = U.hexRGB('#f3f7fa');
    const FIELD = {
        spring: ['#9bd36b', '#c9d96a', '#7dbb55', '#a8865a', '#b7dc7a'],
        summer: ['#dcc35c', '#8fc65a', '#6caa4d', '#cfa35d', '#e2cf6e'],
        fall: ['#c98f4a', '#b9a35a', '#8a7a4a', '#d9b860', '#a8865a'],
        winter: ['#eef3f7', '#e6edf2', '#f2f6f9', '#e9eff3', '#edf2f6']
    };

    function create(def) {
        def = def || {};
        const seed = (def.seed | 0) || 1;
        const base = def.base || 'meadow';
        const procedural = !!def.procedural;
        const datumNoise = def.datumNoise === undefined ? 4 : def.datumNoise;
        const datumBase = def.datumBase || 0;
        const datums = def.datums || {};   // per-world biome track levels, e.g. { mountains: 5 }
        const zones = (def.zones || []).map(function (z, i) {
            return Object.assign({ soft: 36, wobble: 14, key: 'z' + i }, z);
        });
        const regionCache = new Map();
        let fieldColors = new Map();       // by field and season (cleared now and then: a long ride sees many)

        // --- features ------------------------------------------------------------------

        function prepFeature(f) {
            f = Object.assign({}, f);
            if (f.pts) {
                let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
                f.pts.forEach(p => { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); });
                const pad = (f.w || 20) + 10;
                f.box = [minx - pad, minz - pad, maxx + pad, maxz + pad];
            } else if (f.type === 'orchard') {
                const r = Math.hypot(f.w || 40, f.d || 30) / 2 + 6;
                f.box = [f.x - r, f.z - r, f.x + r, f.z + r];
            } else if (f.type !== 'sea') {
                const r = (f.r || (f.type === 'landmark' ? 14 : 40)) + 10;
                f.box = [f.x - r, f.z - r, f.x + r, f.z + r];
            }
            return f;
        }

        const explicitFeatures = (def.features || []).map(prepFeature);
        const waters = [];

        function inBox(f, x, z) { return !f.box || (x >= f.box[0] && z >= f.box[1] && x <= f.box[2] && z <= f.box[3]); }

        /** Signed distance into the sea: > 0 seaward of the coast line. */
        function seaS(f, x, z) {
            let s = x * f.nx + z * f.nz - f.d;
            s += (f.wobble || 18) * U.fbm(x / 90, z / 90, seed ^ 0x5ea, 2);
            return s;
        }

        // --- procedural regions ---------------------------------------------------------

        function region(i, j) {
            const key = i + ',' + j;
            let r = regionCache.get(key);
            if (r) return r;
            const h1 = U.hash2(i, j, seed ^ 0x51), h2 = U.hash2(i, j, seed ^ 0x77), h3 = U.hash2(i, j, seed ^ 0x99);
            let cx = (i + (h1 - 0.5) * 0.5) * REGION, cz = (j + (h2 - 0.5) * 0.5) * REGION;
            // Climate: smooth across regions (about four regions from one band to the next).
            const t = U.fbm(i * 0.27 + 3.7, j * 0.27 - 1.9, seed ^ 0xc11, 2);
            const band = t < -0.2 ? CLIMATE.cold : t > 0.2 ? CLIMATE.hot : CLIMATE.mild;
            let biome = band[Math.floor(h3 * band.length) % band.length];
            if (i === 0 && j === 0) { cx = 0; cz = 0; biome = 'meadow'; }
            const names = BNR.Biomes.get(biome).stationNames;
            r = { key: 'r' + key, i: i, j: j, x: cx, z: cz, biome: biome, name: names[Math.floor(h1 * 7919) % names.length], features: [] };
            const h4 = U.hash2(i, j, seed ^ 0x1234), h5 = U.hash2(i, j, seed ^ 0x4321);
            const hs = k => U.hash2(i * 7 + k, j * 13 - k, seed ^ (0x9e37 + k * 101));
            const ang = h4 * Math.PI * 2;
            const at = (a, d) => [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
            const add = f => r.features.push(prepFeature(f));
            const origin = i === 0 && j === 0;
            const river = function (w) {
                const L = REGION * 0.48;
                add({ type: 'river', w: w || 13, depth: 6, pts: [at(ang + Math.PI, L), at(ang + 0.4, 25), at(ang + 0.2, L)] });
            };
            // Each biome has a menu of features; each region takes its own pick from it.
            const MENU = {
                meadow: ['hill', 'pond', 'orchard', 'outcrop', 'windmill', 'river', 'grove'],
                farm: ['orchard', 'windmill', 'pond', 'hill', 'river'],
                forest: ['river', 'pond', 'hill', 'outcrop', 'plateau'],
                lake: ['river', 'grove', 'hill', 'outcrop'],
                mountains: ['tarn', 'waterfall', 'outcrop', 'plateau'],
                alpine: ['tarn', 'waterfall', 'hill', 'grove', 'outcrop'],
                desert: ['canyon', 'arch', 'oasis', 'mesa', 'outcrop'],
                redrock: ['arch', 'mesa', 'canyon', 'outcrop'],
                dunes: ['oasis', 'outcrop', 'mesa'],
                oasis: ['mesa', 'outcrop', 'grove'],
                snowfield: ['pond', 'hill', 'outcrop', 'grove', 'plateau'],
                snowforest: ['pond', 'hill', 'grove', 'river', 'outcrop'],
                snowvillage: ['pond', 'grove', 'hill'],
                town: ['pond', 'orchard', 'river', 'grove'],
                city: ['pond', 'river'],
                coast: ['grove', 'outcrop', 'hill']
            };
            if (biome === 'lake') {
                const p0 = at(ang, 30);
                add({ type: 'lake', x: p0[0], z: p0[1], r: 105 + h5 * 40, depth: 9 });
            } else if (biome === 'desert' || biome === 'redrock') {
                const p0 = at(ang, 70);
                add({ type: 'mesa', x: p0[0], z: p0[1], r: 38 + h5 * 18, h: biome === 'redrock' ? 16 : 13 });
            } else if (biome === 'oasis') {
                const p0 = at(ang, 40);
                add({ type: 'lake', x: p0[0], z: p0[1], r: 36 + h5 * 10, depth: 5 });
                add({ type: 'grove', x: p0[0], z: p0[1], r: 56, ring: 38, count: 16, kind: 'palm' });
            } else if (biome === 'coast' && !(i === 0 && j === 0)) {
                // A bay of the sea, with a lighthouse on the point beside it.
                const p0 = at(ang, 90), r0 = 70 + h5 * 30;
                add({ type: 'cove', x: p0[0], z: p0[1], r: r0, depth: 7, level: 0 });
                const lh = at(ang + 0.55, 90 + r0 * 0.9);
                add({ type: 'hill', x: lh[0], z: lh[1], r: 30, h: 5 });
                add({ type: 'landmark', kind: 'lighthouse', x: lh[0], z: lh[1], ry: ang });
            }
            const menu = MENU[biome] || [];
            const n = origin ? 1 : 1 + Math.floor(hs(1) * 2.4);
            const used = {};
            for (let k = 0; k < n && menu.length; k++) {
                let pickK = menu[Math.floor(hs(2 + k) * menu.length) % menu.length];
                if (used[pickK]) continue;
                used[pickK] = true;
                const a = ang + 1.3 + k * 2.1 + hs(5 + k);
                // Keep the Build mode start (the origin) clear: features there sit well away.
                const d0 = origin ? 170 + hs(8) * 40 : 60 + hs(6 + k) * 90;
                const p0 = at(a, d0);
                switch (pickK) {
                    case 'hill': add({ type: 'hill', x: p0[0], z: p0[1], r: 55 + hs(9) * 30, h: 12 + hs(10) * 10 }); break;
                    case 'pond': add({ type: 'lake', x: p0[0], z: p0[1], r: 34 + hs(11) * 22, depth: 6 }); break;
                    case 'tarn': add({ type: 'lake', x: p0[0], z: p0[1], r: 40 + hs(11) * 25, depth: 8 }); break;
                    case 'orchard': add({ type: 'orchard', x: p0[0], z: p0[1], w: 50 + hs(12) * 30, d: 36 + hs(13) * 20, ang: a, kind: 'appletree' }); break;
                    case 'grove': add({ type: 'grove', x: p0[0], z: p0[1], r: 30 + hs(14) * 25, count: 14,
                        kind: /snow|alpine/.test(biome) ? 'snowpine' : biome === 'lake' || biome === 'town' ? 'oak' : biome === 'oasis' || biome === 'dunes' ? 'palm' : 'pine' }); break;
                    case 'outcrop': add({ type: 'outcrop', x: p0[0], z: p0[1], r: 26 + hs(15) * 18, h: 9 + hs(16) * 8 }); break;
                    case 'plateau': add({ type: 'plateau', x: p0[0], z: p0[1], r: 80 + hs(17) * 40, h: 10 + hs(18) * 6, nx: Math.cos(a), nz: Math.sin(a), w: 7 }); break;
                    case 'river': river(); break;
                    case 'windmill': add({ type: 'hill', x: p0[0], z: p0[1], r: 45, h: 7 }); add({ type: 'landmark', kind: 'windmill', x: p0[0], z: p0[1], ry: a }); break;
                    case 'arch': add({ type: 'landmark', kind: 'rockarch', x: p0[0], z: p0[1], ry: a }); break;
                    case 'waterfall': add({ type: 'outcrop', x: p0[0], z: p0[1] - 8, r: 30, h: 14 }); add({ type: 'landmark', kind: 'waterfall', x: p0[0], z: p0[1], ry: hs(19) * 6 }); break;
                    case 'oasis': add({ type: 'lake', x: p0[0], z: p0[1], r: 30, depth: 5 }); add({ type: 'grove', x: p0[0], z: p0[1], r: 46, ring: 30, count: 12, kind: 'palm' }); break;
                    case 'canyon': {
                        const a2 = a + 1.6, L = REGION * 0.42;
                        add({ type: 'canyon', w: 15, depth: 13, pts: [[cx - Math.cos(a2) * L, cz - Math.sin(a2) * L], [cx + Math.cos(a2 + 0.4) * 10, cz + Math.sin(a2 + 0.4) * 10], [cx + Math.cos(a2) * L, cz + Math.sin(a2) * L]] });
                        break;
                    }
                    case 'mesa': add({ type: 'mesa', x: p0[0], z: p0[1], r: 30 + hs(20) * 14, h: 11 }); break;
                    default: break;
                }
            }
            regionCache.set(key, r);
            return r;
        }

        /** The 9 regions around a point, with distances. */
        function nearRegions(x, z) {
            const i0 = Math.round(x / REGION), j0 = Math.round(z / REGION);
            const out = [];
            for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
                const r = region(i0 + di, j0 + dj);
                out.push({ r: r, d: Math.hypot(x - r.x, z - r.z) });
            }
            return out;
        }

        // --- the biome mix at a point ----------------------------------------------------

        /**
         * Biome weights at three softnesses: colour (crisp), relief (softer) and
         * datum (very soft, so the track's level changes gently), plus the zone.
         */
        function mix(x, z) {
            if (procedural) {
                const rs = nearRegions(x, z);
                let dmin = Infinity, best = null;
                rs.forEach(o => { if (o.d < dmin) { dmin = o.d; best = o.r; } });
                const out = { color: {}, relief: {}, datum: {}, zone: best, regions: rs };
                ['color', 'relief', 'datum'].forEach(function (k) {
                    const T = TEMP[k];
                    let sum = 0;
                    const w = out[k];
                    rs.forEach(o => { const v = Math.exp(-(o.d - dmin) / T); o[k] = v; sum += v; });
                    rs.forEach(o => { if (o[k] / sum > 0.002) w[o.r.biome] = (w[o.r.biome] || 0) + o[k] / sum; });
                });
                return out;
            }
            const baseZone = { key: 'base', biome: base, name: def.baseName || BNR.Biomes.get(base).stationNames[0] };
            const out = { color: {}, relief: {}, datum: {}, zone: baseZone };
            out.color[base] = 1; out.relief[base] = 1; out.datum[base] = 1;
            // Zone weights are painted like the biome weights: a later zone covers earlier ones.
            const zw = [{ z: baseZone, w: 1 }];
            for (let i = 0; i < zones.length; i++) {
                const zn = zones[i];
                let d;
                if (zn.pts) d = U.polyDist(x, z, zn.pts).d - zn.r;
                else d = Math.hypot(x - zn.x, z - zn.z) - zn.r;
                if (d > Math.max(zn.soft, 130) + zn.wobble) continue;
                d += zn.wobble * U.fbm(x / 70, z / 70, seed ^ (0x700 + i), 2);
                const cover = {
                    color: 1 - U.smoothstep(-zn.soft, zn.soft, d),
                    relief: 1 - U.smoothstep(-Math.max(zn.soft, 50), Math.max(zn.soft, 50), d),
                    datum: 1 - U.smoothstep(-Math.max(zn.soft, 130), Math.max(zn.soft, 130), d)
                };
                ['color', 'relief', 'datum'].forEach(function (k) {
                    const c = cover[k];
                    if (c <= 0) return;
                    const w = out[k];
                    for (const id in w) w[id] *= 1 - c;
                    w[zn.biome] = (w[zn.biome] || 0) + c;
                });
                if (cover.color > 0) {
                    zw.forEach(e => { e.w *= 1 - cover.color; });
                    zw.push({ z: { key: zn.key, biome: zn.biome, name: zn.name || BNR.Biomes.get(zn.biome).stationNames[0] }, w: cover.color });
                }
            }
            let best = zw[0];
            zw.forEach(e => { if (e.w > best.w) best = e; });
            out.zone = best.z;
            return out;
        }

        function featuresNear(x, z, m) {
            if (!procedural) return explicitFeatures;
            const list = [];
            (m && m.regions ? m.regions : nearRegions(x, z)).forEach(o => { o.r.features.forEach(f => list.push(f)); });
            return list;
        }

        // --- heights ----------------------------------------------------------------------

        function datumOf(x, z, m) {
            m = m || mix(x, z);
            let d = datumBase + datumNoise * U.fbm(x / 650, z / 650, seed ^ 0x123, 2);
            for (const id in m.datum) d += m.datum[id] * (datums[id] !== undefined ? datums[id] : BNR.Biomes.get(id).datum);
            for (const f of explicitFeatures) {
                if (f.type !== 'rise') continue;
                const dist = Math.hypot(x - f.x, z - f.z);
                d += f.h * (1 - U.smoothstep(f.r * 0.25, f.r, dist));
            }
            return d;
        }

        function biomeRelief(id, x, z) {
            const r = BNR.Biomes.get(id).relief;
            switch (r.type) {
                case 'mountain': {
                    const m = U.ridged(x / r.wave, z / r.wave, seed ^ 0x2d, 4);
                    return r.amp * (Math.pow(m, 1.8) * 1.15 - 0.16);
                }
                case 'dunes': {
                    const n = U.fbm(x / r.wave, z / (r.wave * 2.4), seed ^ 0x2c, 3);
                    return r.amp * (Math.abs(Math.sin(x / r.wave * 1.6 + z / r.wave * 0.4 + n * 3.2)) * 1.1 - 0.55 + n * 0.5);
                }
                case 'flat': return r.amp * U.noise(x / r.wave, z / r.wave, seed ^ 0x2b);
                default: return r.amp * U.fbm(x / r.wave, z / r.wave, seed ^ 0x2a, 3);
            }
        }

        /** Ground height, plus what made it (for colours): { h, datum, water, wet, mix }. */
        function sample(x, z) {
            const m = mix(x, z);
            const dat = datumOf(x, z, m);
            let rel = 0;
            for (const id in m.relief) if (m.relief[id] > 0.002) rel += m.relief[id] * biomeRelief(id, x, z);
            let h = dat + rel;
            let water = null;
            const feats = featuresNear(x, z, m);
            for (let i = 0; i < feats.length; i++) {
                const f = feats[i];
                if (f.type === 'sea') {
                    const s = seaS(f, x, z);
                    const shore = f.shore || 30;
                    if (s > -shore - 20) {
                        const k = U.smoothstep(-shore, shore, s);
                        h = h + ((f.level || 0) - (f.depth || 10) - h) * k;
                        if (s > -shore) water = Math.max(water === null ? -Infinity : water, f.level || 0);
                    }
                    continue;
                }
                if (!inBox(f, x, z)) continue;
                switch (f.type) {
                    case 'hill': {
                        const d = Math.hypot(x - f.x, z - f.z);
                        if (d < f.r) h += f.h * (0.5 + 0.5 * Math.cos(Math.PI * d / f.r));
                        break;
                    }
                    case 'mountain': {
                        const d = Math.hypot(x - f.x, z - f.z);
                        if (d < f.r) {
                            const k = 1 - d / f.r;
                            h += f.h * Math.pow(k, 1.4) * (0.72 + 0.28 * U.ridged(x / 70, z / 70, seed ^ 0x33, 3));
                        }
                        break;
                    }
                    case 'outcrop': {
                        // A rocky knob: steep and craggy (steep ground shows rock).
                        const d = Math.hypot(x - f.x, z - f.z);
                        if (d < f.r) {
                            const k = 1 - d / f.r;
                            h += f.h * Math.pow(k, 1.1) * (0.6 + 0.4 * U.ridged(x / 18, z / 18, seed ^ 0x6c, 2));
                        }
                        break;
                    }
                    case 'plateau': {
                        // Raised land with a cliff edge facing (nx, nz), fading out at its rim.
                        const d = Math.hypot(x - f.x, z - f.z);
                        if (d < f.r) {
                            const sd = (x - f.x) * f.nx + (z - f.z) * f.nz + 4 * U.fbm(x / 30, z / 30, seed ^ 0x7d, 2);
                            h += f.h * (1 - U.smoothstep(-(f.w || 7), f.w || 7, sd - f.r * 0.25)) * (1 - U.smoothstep(f.r * 0.7, f.r, d));
                        }
                        break;
                    }
                    case 'flat': {
                        // Level ground (under a landmark): eases the relief to the datum (+ dh).
                        const d = Math.hypot(x - f.x, z - f.z);
                        if (d < f.r) h += (dat + (f.dh || 0) - h) * (1 - U.smoothstep(f.r * 0.6, f.r, d));
                        break;
                    }
                    case 'cove': {
                        // A bay of the sea with a gentle beach: sea level, sandy shore.
                        const d = Math.hypot(x - f.x, z - f.z) + 10 * U.fbm(x / 70, z / 70, seed ^ 0x1c, 2);
                        const lvl = f.level || 0;
                        const k = 1 - U.smoothstep(f.r * 0.45, f.r, d);
                        h = h + (lvl - (f.depth || 6) - h) * k;
                        if (d < f.r) water = Math.max(water === null ? -Infinity : water, lvl);
                        break;
                    }
                    case 'mesa': {
                        const d = Math.hypot(x - f.x, z - f.z) + 7 * U.fbm(x / 30, z / 30, seed ^ 0x4e, 2);
                        h += f.h * (1 - U.smoothstep(f.r * 0.86, f.r, d));
                        break;
                    }
                    case 'lake': {
                        const d = Math.hypot(x - f.x, z - f.z) + 12 * U.fbm(x / 60, z / 60, seed ^ 0x1a, 2);
                        const k = 1 - U.smoothstep(f.r * 0.42, f.r, d);
                        h -= (f.depth || 9) * k;
                        if (d < f.r) water = Math.max(water === null ? -Infinity : water, levelOf(f));
                        break;
                    }
                    case 'river':
                    case 'canyon': {
                        const pd = U.polyDist(x, z, f.pts).d + (f.type === 'river' ? 3 : 4) * U.fbm(x / 40, z / 40, seed ^ 0x2f, 2);
                        const k = 1 - U.smoothstep(f.w * (f.type === 'canyon' ? 0.55 : 0.32), f.w, pd);
                        h -= (f.depth || 6) * k;
                        if (f.type === 'river' && pd < f.w) water = Math.max(water === null ? -Infinity : water, levelOf(f));
                        break;
                    }
                    default: break;
                }
            }
            return { h: h, datum: dat, water: water, wet: water !== null && water > h, mix: m };
        }

        /** A water body's surface level (fixed per body). */
        function levelOf(f) {
            if (f.level === undefined) {
                const p = f.pts ? f.pts[0] : [f.x, f.z];
                f.level = datumOf(p[0], p[1]) - 2.4;
                if (f.pts) {
                    // A river is level along its whole length: use its lowest datum.
                    f.pts.forEach(q => { f.level = Math.min(f.level, datumOf(q[0], q[1]) - 2.4); });
                }
            }
            return f.level;
        }

        // Explicit water bodies are known up front (the renderer draws them).
        explicitFeatures.forEach(function (f) {
            if (f.type === 'lake' || f.type === 'river' || f.type === 'sea' || f.type === 'cove') { if (f.type === 'cove' && f.level === undefined) f.level = 0; levelOf(f); waters.push(f); }
        });

        /** Every water body that could touch a box (procedural ones come from nearby regions). */
        function watersIn(x0, z0, x1, z1) {
            const list = [];
            const seen = new Set();
            const consider = function (f) {
                if (seen.has(f) || !(f.type === 'lake' || f.type === 'river' || f.type === 'sea' || f.type === 'cove')) return;
                seen.add(f);
                if (f.box && (f.box[2] < x0 || f.box[0] > x1 || f.box[3] < z0 || f.box[1] > z1)) return;
                levelOf(f);
                list.push(f);
            };
            if (procedural) {
                const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]];
                pts.forEach(p => nearRegions(p[0], p[1]).forEach(o => o.r.features.forEach(consider)));
            } else explicitFeatures.forEach(consider);
            return list;
        }

        // --- fixed props -----------------------------------------------------------------------

        /** The props a feature places (cached): orchard rows, a grove, a landmark. */
        function spotsOf(f) {
            if (f._spots) return f._spots;
            const out = [];
            const rnd = U.mulberry((Math.round(f.x * 13) ^ Math.round(f.z * 7) ^ seed) | 0);
            if (f.type === 'orchard') {
                const c = Math.cos(f.ang || 0), sn = Math.sin(f.ang || 0), sp = f.spacing || 7.5;
                for (let a = -(f.w || 40) / 2; a <= (f.w || 40) / 2; a += sp) {
                    for (let b = -(f.d || 30) / 2; b <= (f.d || 30) / 2; b += sp) out.push({ kind: f.kind || 'appletree', x: f.x + a * c - b * sn, z: f.z + a * sn + b * c, ry: rnd() * 6.28, s: 0.9 + rnd() * 0.2 });
                }
            } else if (f.type === 'grove') {
                for (let k = 0; k < (f.count || 12); k++) {
                    const a = rnd() * Math.PI * 2, rr = f.ring ? f.ring + rnd() * (f.r - f.ring) : Math.sqrt(rnd()) * f.r;
                    out.push({ kind: f.kind || 'pine', x: f.x + Math.cos(a) * rr, z: f.z + Math.sin(a) * rr, ry: rnd() * 6.28, s: 0.85 + rnd() * 0.35 });
                }
            } else if (f.type === 'landmark') {
                out.push({ kind: f.kind, x: f.x, z: f.z, ry: f.ry || 0, s: f.s || 1, landmark: true });
            }
            f._spots = out;
            return out;
        }

        /** Fixed props whose spot is inside the box: route landmarks, orchards and groves. */
        function propSpotsIn(x0, z0, x1, z1) {
            const list = [];
            const seen = new Set();
            const consider = function (f) {
                if (seen.has(f) || !(f.type === 'orchard' || f.type === 'grove' || f.type === 'landmark')) return;
                seen.add(f);
                if (f.box && (f.box[2] < x0 || f.box[0] > x1 || f.box[3] < z0 || f.box[1] > z1)) return;
                spotsOf(f).forEach(sp => { if (sp.x >= x0 && sp.x < x1 && sp.z >= z0 && sp.z < z1) list.push(sp); });
            };
            if (procedural) {
                const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]];
                pts.forEach(p => nearRegions(p[0], p[1]).forEach(o => o.r.features.forEach(consider)));
            } else explicitFeatures.forEach(consider);
            return list;
        }

        /** Every landmark of a kind (route worlds), e.g. to find the waterfall an event plays at. */
        function landmarks(kind) {
            return explicitFeatures.filter(f => f.type === 'landmark' && (!kind || f.kind === kind));
        }

        // --- colour --------------------------------------------------------------------------

        function fieldColor(x, z, season) {
            // A patchwork of fields: rotated rectangles about 46 x 30 units.
            const a = 0.35, c = Math.cos(a), s = Math.sin(a);
            const u = x * c + z * s, v = -x * s + z * c;
            const fi = Math.floor(u / 46), fj = Math.floor(v / 30);
            const key = season + fi + ',' + fj;
            let col = fieldColors.get(key);
            if (!col) {
                const list = FIELD[season] || FIELD.summer;
                if (fieldColors.size > 40000) fieldColors = new Map();
                col = U.hexRGB(list[Math.floor(U.hash2(fi, fj, seed ^ 0xf1e1d) * list.length)]);
                fieldColors.set(key, col);
            }
            // Hedgerow edges: a slightly darker rim on each field.
            const eu = Math.min(u / 46 - fi, 1 - (u / 46 - fi)) * 46, ev = Math.min(v / 30 - fj, 1 - (v / 30 - fj)) * 30;
            const edge = Math.min(eu, ev) < 1.6 ? 0.82 : 1;
            return [col[0] * edge, col[1] * edge, col[2] * edge];
        }

        /** City blocks: asphalt streets every CITY_B units with pale pavements, plazas between. */
        const CITY_B = 48, CITY_ROAD = 6, CITY_KERB = 8.5;
        function cityColor(x, z, g, season) {
            const B = CITY_B, u = ((x % B) + B) % B, v = ((z % B) + B) % B;
            const e = Math.min(u, v);
            if (e < CITY_ROAD) return season === 'winter' ? U.hexRGB('#cdd5dc') : U.hexRGB('#6d7279');
            if (e < CITY_KERB) return U.hexRGB('#cfcbc2');
            return g;
        }

        /**
         * Where a city prop may stand: null on a street or pavement (keeping `pad` off them).
         * A building (lot: true) moves to the nearest of its block's 2 x 2 lots, its door to the street.
         */
        function cityPlace(x, z, pad, lot) {
            const B = CITY_B, u = ((x % B) + B) % B, v = ((z % B) + B) % B;
            if (lot) {
                const q = (B - CITY_KERB) / 4;
                const lu = u < CITY_KERB + 2 * q ? CITY_KERB + q : CITY_KERB + 3 * q;
                const lv = v < CITY_KERB + 2 * q ? CITY_KERB + q : CITY_KERB + 3 * q;
                return { x: x - u + lu, z: z - v + lv, ry: lv < B / 2 ? Math.PI : 0 };
            }
            if (u < CITY_KERB + pad || v < CITY_KERB + pad || u > B - pad || v > B - pad) return null;
            return { x: x, z: z, ry: null };
        }

        /**
         * Ground colour at a point. smp: the sample() result there; slope: the
         * ground's steepness (rise per unit run) from the terrain mesh.
         */
        function colorAt(x, z, smp, slope, season) {
            season = season || 'summer';
            const m = smp.mix;
            const patch = U.smoothstep(-0.25, 0.55, U.fbm(x / 38, z / 38, seed ^ 0x9a7, 3));
            let col = [0, 0, 0];
            for (const id in m.color) {
                const w = m.color[id];
                let g = BNR.Biomes.groundRGB(id, season, patch);
                if (BNR.Biomes.get(id).fields) g = U.mixRGB(g, fieldColor(x, z, season), 0.85);
                if (BNR.Biomes.get(id).city) g = cityColor(x, z, g, season);
                col[0] += g[0] * w; col[1] += g[1] * w; col[2] += g[2] * w;
            }
            // Steep ground shows rock; high mountains keep their snow.
            let rockW = 0, rockC = ROCK, snowW = 0;
            for (const id in m.color) {
                const b = BNR.Biomes.get(id);
                if (b.rock) { rockC = U.hexRGB(b.rock); }
                if (b.snowline) {
                    const line = b.snowline - (season === 'winter' ? 8 : season === 'spring' ? 2 : 0);
                    snowW = Math.max(snowW, m.color[id] * U.smoothstep(line, line + 5, smp.h - smp.datum));
                }
            }
            rockW = U.smoothstep(0.62, 1.05, slope);
            if (season === 'winter') rockW *= 0.65;
            col = U.mixRGB(col, rockC, rockW);
            col = U.mixRGB(col, SNOWC, snowW);
            if (smp.water !== null) {
                if (smp.h < smp.water - 0.4) col = U.mixRGB(col, LAKEBED, U.smoothstep(smp.water - 0.4, smp.water - 2.5, smp.h));
                else if (smp.h < smp.water + 1.1) col = U.mixRGB(col, SAND, 0.85 * (season === 'winter' ? 0.5 : 1));
            }
            return col;
        }

        // --- buildings ------------------------------------------------------------------------
        // Houses, chalets, adobes and city buildings stand on lots that belong to the world,
        // each decided from the seed alone: the same on every visit and at every graphics level
        // (a lower level keeps a share of them, always the same share). So Build can keep track
        // out of them, and the terrain draws exactly these (js/terrain.js): track is laid between
        // buildings, never through them. Natural scenery (trees, rocks) still makes way for track.
        const LOT = 13;
        const lotCache = new Map();
        const houseRules = {};
        const scaleOf = (def && def.propScale) || {};

        /** A biome's building rule ({ kind, density }), or null. */
        function houseRule(biome) {
            if (houseRules[biome] !== undefined) return houseRules[biome];
            let rule = null;
            (BNR.Biomes.get(biome).props || []).forEach(function (r) {
                const d = BNR.Props.def(BNR.Props.variants(r.kind)[0]);
                if (!rule && d && d.house) rule = r;
            });
            return (houseRules[biome] = rule);
        }

        /**
         * One lot's building, or null: at (px, pz), when the biome drawn there by its share has
         * buildings. lam: how many it would hold on average; need: the graphics detail (0..1]
         * from which it shows (a building with need > 1 never stands).
         */
        function lotBuilding(key, px, pz, rnd, lam, herd, face, cityOnly) {
            const smp = sample(px, pz);
            const r0 = rnd();
            let acc = 0, biome = null;
            for (const id in smp.mix.color) { acc += smp.mix.color[id]; if (r0 * 0.999 <= acc) { biome = id; break; } }
            if (!biome || !!BNR.Biomes.get(biome).city !== cityOnly) return null;
            const rule = houseRule(biome);
            if (!rule) return null;
            const n = rule.density * lam * (scaleOf[biome] === undefined ? 1 : scaleOf[biome]);
            const roll = rnd();
            const need = n > 0 ? -Math.log(1 - roll) / n : Infinity;
            if (!(need <= 1)) return null;
            const kind = BNR.Props.pick(rule.kind, herd, rnd());
            const d = BNR.Props.def(kind);
            if (!d || !d.house || d.landmark) return null;
            if (smp.water !== null && smp.h < smp.water + 0.3) return null;
            const e = 0.8, sl = Math.hypot(sample(px + e, pz).h - smp.h, sample(px, pz + e).h - smp.h) / e;
            if (sl > 0.25) return null;
            const s = d.scale[0] + rnd() * (d.scale[1] - d.scale[0]);
            // Clear of landmarks (a windmill, a lighthouse) by their size.
            const near = propSpotsIn(px - 40, pz - 40, px + 40, pz + 40);
            for (const sp of near) {
                if (!sp.landmark) continue;
                const ld = BNR.Props.def(sp.kind);
                if (Math.hypot(px - sp.x, pz - sp.z) < (ld ? ld.radius : 8) + 4 + d.radius * s) return null;
            }
            const ry = face !== null ? face : Math.round(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.1;
            return { key: key, kind: kind, x: px, z: pz, ry: ry, s: s, radius: d.radius * s, need: need, v: rnd() };
        }

        function houseLot(i, j) {
            const k = 'h' + i + ',' + j;
            if (lotCache.has(k)) return lotCache.get(k);
            const rnd = U.mulberry((U.hash2(i, j, seed ^ 0x6011) * 2147483647) | 0);
            const px = (i + 0.3 + 0.4 * rnd()) * LOT, pz = (j + 0.3 + 0.4 * rnd()) * LOT;   // near the middle: neighbours never touch
            const herd = U.hash2(Math.floor(i / 4), Math.floor(j / 4), seed ^ 0x51ee7);
            let b = lotBuilding(k, px, pz, rnd, LOT * LOT, herd, null, false);
            // Where a town meets a city, a house gives way to a city building.
            if (b) {
                const B = CITY_B;
                for (let bi = Math.floor((px - 30) / B); bi <= Math.floor((px + 30) / B) && b; bi++) {
                    for (let bj = Math.floor((pz - 30) / B); bj <= Math.floor((pz + 30) / B) && b; bj++) {
                        for (let q = 0; q < 4 && b; q++) {
                            const c = cityLot(bi, bj, q & 1, q >> 1);
                            if (c && Math.hypot(c.x - px, c.z - pz) < c.radius + b.radius) b = null;
                        }
                    }
                }
            }
            if (lotCache.size > 60000) lotCache.clear();     // a long ride passes many lots: they come back the same
            lotCache.set(k, b);
            return b;
        }

        /** A city block's four lots (2 x 2 inside its pavements), doors to the street. */
        function cityLot(bi, bj, qu, qv) {
            const k = 'c' + bi + ',' + bj + ',' + qu + ',' + qv;
            if (lotCache.has(k)) return lotCache.get(k);
            const B = CITY_B, q = (B - CITY_KERB) / 4;
            const lv = CITY_KERB + q * (1 + 2 * qv);
            const px = bi * B + CITY_KERB + q * (1 + 2 * qu), pz = bj * B + lv;
            const rnd = U.mulberry((U.hash2(bi * 2 + qu, bj * 2 + qv, seed ^ 0xc17e) * 2147483647) | 0);
            const herd = U.hash2(bi, bj, seed ^ 0xb10c);
            const b = lotBuilding(k, px, pz, rnd, (B / 2) * (B / 2), herd, lv < B / 2 ? Math.PI : 0, true);
            if (lotCache.size > 60000) lotCache.clear();     // a long ride passes many lots: they come back the same
            lotCache.set(k, b);
            return b;
        }

        /** The buildings whose middles are in the box, at a graphics detail (1: all). */
        function buildingsIn(x0, z0, x1, z1, detail) {
            if (!BNR.Props) return [];
            const dl = detail === undefined ? 1 : detail;
            const out = [];
            const keep = b => b && b.need <= dl && b.x >= x0 && b.x < x1 && b.z >= z0 && b.z < z1;
            for (let i = Math.floor(x0 / LOT); i <= Math.floor(x1 / LOT); i++) {
                for (let j = Math.floor(z0 / LOT); j <= Math.floor(z1 / LOT); j++) { const b = houseLot(i, j); if (keep(b)) out.push(b); }
            }
            const B = CITY_B;
            for (let bi = Math.floor(x0 / B); bi <= Math.floor(x1 / B); bi++) {
                for (let bj = Math.floor(z0 / B); bj <= Math.floor(z1 / B); bj++) {
                    for (let qu = 0; qu < 2; qu++) for (let qv = 0; qv < 2; qv++) { const b = cityLot(bi, bj, qu, qv); if (keep(b)) out.push(b); }
                }
            }
            return out;
        }

        /** A building within `pad` of (x, z) (its edge: radius + pad from its middle), or null. */
        function buildingNear(x, z, pad, detail) {
            const R = pad + 12;
            for (const b of buildingsIn(x - R, z - R, x + R, z + R, detail)) {
                if (Math.hypot(x - b.x, z - b.z) < b.radius + pad) return b;
            }
            return null;
        }

        return {
            def: def,
            seed: seed,
            procedural: procedural,
            TILE: TILE,
            sample: sample,
            buildingsIn: buildingsIn,
            buildingNear: buildingNear,
            height: function (x, z) { return sample(x, z).h; },
            datum: function (x, z) { return datumOf(x, z); },
            water: function (x, z) { return sample(x, z).water; },
            zoneAt: function (x, z) { const z0 = mix(x, z).zone; return { key: z0.key, biome: z0.biome, name: z0.name }; },
            biomeAt: function (x, z) {
                const w = mix(x, z).color;
                let best = base, bw = -1;
                for (const id in w) if (w[id] > bw) { bw = w[id]; best = id; }
                return best;
            },
            mix: mix,
            colorAt: colorAt,
            cityPlace: cityPlace,
            waters: waters,
            watersIn: watersIn,
            propSpotsIn: propSpotsIn,
            landmarks: landmarks,
            /** The regions near a point (procedural worlds): { r: { biome, name, features }, d }. */
            regionsNear: function (x, z) { return procedural ? nearRegions(x, z) : []; }
        };
    }

    /**
     * How much scenery each graphics level keeps (js/terrain.js), and so which share of the
     * world's buildings stands at it (buildingsIn's detail).
     */
    const DETAIL = { high: 1, standard: 0.62, low: 0.38 };

    return { create: create, TILE: TILE, REGION: REGION, DETAIL: DETAIL };
})();
