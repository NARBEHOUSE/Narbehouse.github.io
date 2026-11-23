/**
 * NARBE Space Explorer - planets, moons and stars as Three.js meshes.
 *
 * Every world's look comes from its seed (js/universe.js). Its maps are painted from 3D noise,
 * so there is never a seam:
 *   - land: a few continents with crinkly, warped coasts, island chains and mountain spines;
 *     coloured by latitude, rain and height from the world's own palette (forest, grassland,
 *     desert belts, tundra, snow), with rivers on the wetter worlds; craters, lava plates,
 *     crystal facets, dune seas, sulphur patches by world type;
 *   - seas: deep water, lighter shelves along the coasts, a second tint in some seas, reefs and
 *     atolls on ocean worlds, sea ice towards the poles;
 *   - a civilisation's world: cities along the coasts with roads and farm fields by day, and
 *     their lights following the coasts by night;
 *   - a height map turned into a normal map (the ground's relief catches the light), a sea
 *     mask for the sun's glint, swirling clouds with storms, and a thin glowing atmosphere,
 *     bright on the day side, warm at sunset, dark at night.
 * Rare sights: rainbow gas giants, a second ring set, glowing seas, auroras, ringed moons.
 *
 * Textures are painted a few rows at a time (pump(ms) each frame) so arriving
 * at a system never freezes the game: a tiny preview first, then full detail,
 * then extra detail for the world you orbit. Painted maps are cached by seed.
 * Smaller maps use fewer noise layers (they could not show the finest ones anyway).
 *
 * The surface is an ordinary Phong material (clouds and rings Lambert) lit by the
 * system's star (a point light). Only the atmosphere, city lights and aurora are small
 * custom shaders, each on its own see-through shell: if a graphics card refused one,
 * the planet itself would still draw.
 */

window.NSE = window.NSE || {};

NSE.Planets = (function () {
    'use strict';

    const U = NSE.Util;
    let THREE = null;
    let quality = 'high';

    /** Map sizes: [preview, normal, orbit] widths (height is half). Moons use half the normal size until orbited. */
    const RES = { high: [64, 512, 1024], standard: [64, 256, 512], low: [32, 128, 256] };
    const SEGMENTS = { high: 72, standard: 48, low: 28 };

    function init(three, q) { THREE = three; quality = q || 'high'; }
    function setQuality(q) { quality = q || 'high'; }

    function calmNow() {
        try { return !!(NSE.Settings && NSE.Settings.calm && NSE.Settings.calm()); } catch (e) { return false; }
    }

    // --- painting jobs (a few rows per frame) ----------------------------------------------------

    const jobs = [];

    /** Run queued painting for about `ms` milliseconds. */
    function pump(ms) {
        const until = now() + (ms || 6);
        while (jobs.length && now() < until) {
            const j = jobs[0];
            if (j.cancelled) { jobs.shift(); continue; }
            if (j.step()) { jobs.shift(); j.done(); }
        }
        return jobs.length;
    }
    function now() { return (typeof performance !== 'undefined' ? performance : Date).now(); }

    /** Paint everything at once (tests, snapshots). */
    function flush() { while (jobs.length) pump(1000); }

    function dataTexture(w, h, data, linear) {
        const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
        if (!linear) t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.anisotropy = 4;
        t.needsUpdate = true;
        return t;
    }

    // --- small noise tools ------------------------------------------------------------------------

    /** A fast integer hash of a grid cell to 0..1. */
    function ih(x, y, z, s) {
        let h = (s | 0) ^ 0x9e3779b9;
        h = Math.imul(h ^ (x | 0), 0x85ebca6b); h ^= h >>> 13;
        h = Math.imul(h ^ (y | 0), 0xc2b2ae35); h ^= h >>> 16;
        h = Math.imul(h ^ (z | 0), 0x27d4eb2f); h ^= h >>> 15;
        h = Math.imul(h, 0x165667b1); h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }

    const cellOut = { f1: 0, f2: 0, id: 0 };
    /** Cellular noise: distances to the nearest and second-nearest points, and the nearest cell's id (0..1). */
    function cellular(x, y, z, seed) {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        let f1 = 9, f2 = 9, id = 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
            const a = xi + i, b = yi + j, c = zi + k;
            const dx = a + ih(a, b, c, seed) - x, dy = b + ih(a, b, c, seed + 1) - y, dz = c + ih(a, b, c, seed + 2) - z;
            const d = dx * dx + dy * dy + dz * dz;
            if (d < f1) { f2 = f1; f1 = d; id = ih(a, b, c, seed + 3); } else if (d < f2) f2 = d;
        }
        cellOut.f1 = Math.sqrt(f1); cellOut.f2 = Math.sqrt(f2); cellOut.id = id;
        return cellOut;
    }

    const crOut = { dh: 0, floor: 0, rim: 0 };
    /** Small craters, maybe one per grid cell (x, y, z already scaled): height change in cell units, floor and rim. */
    function craterCells(x, y, z, seed, density) {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        let dh = 0, floor = 0, rim = 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
            const a = xi + i, b = yi + j, c = zi + k;
            if (ih(a, b, c, seed + 4) > density) continue;
            const r = 0.16 + 0.26 * ih(a, b, c, seed + 5);
            const dx = a + 0.25 + 0.5 * ih(a, b, c, seed) - x, dy = b + 0.25 + 0.5 * ih(a, b, c, seed + 1) - y, dz = c + 0.25 + 0.5 * ih(a, b, c, seed + 2) - z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > r * r * 2.1) continue;
            const u = Math.sqrt(d2) / r;
            if (u < 1) { const f = 1 - u * u; dh -= f * r * 0.5; if (f > floor) floor = f; }
            const e = (u - 1) / 0.2, rr = Math.exp(-e * e);
            dh += rr * r * 0.16;
            if (rr > rim) rim = rr;
        }
        crOut.dh = dh; crOut.floor = floor; crOut.rim = rim;
        return crOut;
    }

    /** The i-th of n evenly spread points on the sphere. */
    function fib(n, i) {
        const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = i * 2.399963229728653;
        return [Math.cos(a) * r, y, Math.sin(a) * r];
    }
    function unitAt(lat, lon) { return { x: -Math.cos(lon) * Math.cos(lat), y: Math.sin(lat), z: Math.sin(lon) * Math.cos(lat) }; }
    const sc3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

    // --- a world's plan (worked out once per world, shared by every map size) -----------------------

    const plans = new Map();
    function planFor(w) {
        const key = w.seed + ':' + (w.rare || '');
        let p = plans.get(key);
        if (p) return p;
        p = makePlan(w);
        plans.set(key, p);
        if (plans.size > 48) plans.delete(plans.keys().next().value);
        return p;
    }

    /**
     * Land height before the sea is poured in: a few continents (soft caps on the sphere, their
     * edges pushed about by warp noise so coasts wander) plus fractal detail. o gets the warped
     * point and the continent amount.
     */
    function rawField(PL, x, y, z, oct, o) {
        const Wn = PL.Wn, A = PL.warpAmp, f = 1.3;
        const qx = x + Wn.fbm(x * f + 3.1, y * f, z * f, 2) * A;
        const qy = y + Wn.fbm(x * f, y * f + 7.7, z * f, 2) * A;
        const qz = z + Wn.fbm(x * f, y * f, z * f + 5.3, 2) * A;
        let c = 0;
        const cs = PL.conts;
        if (cs.length) {
            const il = 1 / Math.sqrt(qx * qx + qy * qy + qz * qz);
            let keep = 1;
            for (let i = 0; i < cs.length; i++) {
                const k = cs[i];
                const cd = (qx * k.x + qy * k.y + qz * k.z) * il;
                if (cd > k.cosR) { const t = (cd - k.cosR) / (1 - k.cosR); keep *= 1 - t * t * (3 - 2 * t) * k.s; }
            }
            c = 1 - keep;
        }
        const s = PL.T.scale;
        const det = PL.N.fbm(qx * s, qy * s, qz * s, oct, 2.05, PL.T.roughness);
        o.qx = qx; o.qy = qy; o.qz = qz; o.c = c;
        return c * PL.contK + det * PL.detK;
    }

    function makePlan(w) {
        const type = w.type, T = w.terrain, style = T.style || '';
        const gas = type === 'gas';
        const r = U.rng(U.hash('paint', w.seed));
        const rc = U.rng(U.hash('paint-2', w.seed));
        const P = { low: U.hex(w.palette.low), mid: U.hex(w.palette.mid), high: U.hex(w.palette.high), peak: U.hex(w.palette.peak), sea: U.hex(w.palette.sea) };
        const PL = {
            w: w, type: type, style: style, gas: gas, T: T, P: P,
            N: U.noise3(U.hash('surface', w.seed)),
            C: U.noise3(U.hash('cloud', w.seed)),
            Wn: U.noise3(U.hash('warp', w.seed)),
            M: U.noise3(U.hash('moist', w.seed)),
            K: U.noise3(U.hash('cities', w.seed)),
            R2: U.noise3(U.hash('rivers', w.seed)),
            cellSeed: U.hash('cells', w.seed) & 0xffff,
            hasSea: !gas && w.seaLevel >= 0,
            glowSea: !!w.palette.seaGlow,
            lava: type === 'lava', crystal: type === 'crystal', desert: type === 'desert', rock: type === 'rock', ice: type === 'ice', toxic: type === 'toxic',
            green: type === 'earth' || type === 'ocean',
            cloudCover: w.clouds ? w.clouds.cover : 0,
            cyclones: [], cities: [], arcs: [], floaters: [], atolls: [], rays: [], craters: [], conts: []
        };
        if (gas) return gasPlan(PL, r, rc);

        // Big craters (old 'paint' stream).
        const nc = Math.round(T.craters * 26);
        for (let i = 0; i < nc; i++) {
            const z = r.range(-1, 1), a = r.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z);
            const cr = r.range(0.05, 0.22);
            PL.craters.push({ x: s * Math.cos(a), y: z, z: s * Math.sin(a), r: cr, d: r.range(0.15, 0.35), cosReach: Math.cos(cr * 1.3) });
        }
        PL.capLat = type === 'ice' ? 0.55 : PL.green && w.temperature < 26 ? 0.82 : type === 'rock' && r.chance(0.3) ? 0.85 : 2;
        PL.craterDensity = type === 'rock' ? T.craters * 0.55 : T.craters * 0.35;

        // Continents: how many and how big, by the kind of world.
        let nC, rad;
        switch (type) {
            case 'earth': nC = rc.int(2, 5); rad = [0.45, 0.95]; break;
            case 'ocean':
                if (style === 'open') { nC = 0; rad = [0, 0]; }
                else if (style === 'archipelago') { nC = rc.int(9, 15); rad = [0.08, 0.2]; }
                else if (style === 'islands') { nC = rc.int(4, 8); rad = [0.12, 0.3]; }
                else if (style === 'reefs') { nC = rc.int(3, 6); rad = [0.1, 0.25]; }
                else { nC = rc.int(3, 6); rad = [0.18, 0.42]; }
                break;
            case 'ice': nC = rc.int(2, 4); rad = [0.4, 0.85]; break;
            case 'desert': case 'rock': nC = rc.int(2, 5); rad = [0.3, 0.75]; break;
            default: nC = rc.int(2, 5); rad = [0.35, 0.8];
        }
        if (style === 'lakes') { nC = rc.int(1, 3); rad = [1.0, 1.5]; }
        for (let i = 0; i < nC; i++) {
            const z = rc.range(-0.85, 0.85), a = rc.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z);
            PL.conts.push({ x: s * Math.cos(a), y: z, z: s * Math.sin(a), cosR: Math.cos(rc.range(rad[0], rad[1])), s: rc.range(0.75, 1) });
        }
        PL.contK = nC ? 0.62 : 0;
        PL.detK = 0.55;
        PL.warpAmp = type === 'ocean' && nC > 6 ? 0.25 : 0.42;
        // How much of the world is sea (from its sea level), then find the shore height that floods that much.
        PL.water = PL.hasSea ? U.clamp(0.5 + (w.seaLevel - 0.5) * 1.6, 0.04, 0.96) : 0;
        const vals = [], tmp = {};
        for (let i = 0; i < 1000; i++) { const p = fib(1000, i); vals.push(rawField(PL, p[0], p[1], p[2], 4, tmp)); }
        vals.sort((a, b) => a - b);
        const q = f => vals[Math.min(vals.length - 1, Math.max(0, Math.floor(f * vals.length)))];
        PL.qLo = q(0.01); PL.qHi = q(0.995);
        PL.q0 = PL.hasSea ? q(PL.water) : PL.qLo - 1e-3;
        PL.landSpan = Math.max(0.02, PL.qHi - PL.q0);
        PL.seaSpan = Math.max(0.02, PL.q0 - PL.qLo);

        // Seas: deep and shallow colours, a second tint in some seas, how wide the shelves are.
        if (PL.hasSea) {
            PL.deep = [P.sea[0] * 0.36, P.sea[1] * 0.42, P.sea[2] * 0.52];
            PL.sea2 = U.hex(U.shiftHex(w.palette.sea, rc.range(18, 42) * rc.sign(), rc.range(0.9, 1.2), rc.range(0.85, 1.25)));
            PL.sea2K = rc.chance(PL.green ? 0.75 : 0.5) ? rc.range(0.35, 0.7) : 0;
            PL.shelf = U.hex(U.shiftHex(w.palette.sea, PL.green || PL.ice ? -18 : 0, PL.green ? 0.9 : 1, 1.55));
            PL.shelfK = PL.glowSea ? 0.3 : style === 'reefs' || style === 'islands' || style === 'archipelago' ? 1 : rc.range(0.5, 0.9);
            PL.iceStart = PL.ice ? rc.range(0.12, 0.38) : PL.green ? U.clamp(0.66 + (w.temperature - 12) * 0.014, 0.55, 0.97) : PL.crystal ? 0.8 : 2;
            PL.iceCol = PL.ice ? U.mix([0.9, 0.94, 0.98], P.high, 0.3) : [0.9, 0.95, 0.99];
            if (w.glowSea) PL.glowSeaCol = U.hex(w.glowSea);
        }
        if (PL.green) {
            PL.forest = U.hex(U.shiftHex(w.palette.mid, 0, 1.12, 0.66));
            PL.grass = U.mix(U.hex(U.shiftHex(w.palette.mid, 0, 0.9, 1.12)), P.low, 0.22);
            PL.dry = U.mix(P.low, P.high, 0.22);
            PL.tundra = U.mix(P.high, [0.66, 0.67, 0.63], 0.45);
        }
        PL.rivers = (PL.green || (PL.toxic && PL.hasSea)) && style !== 'open';
        // Reefs and atolls in the warm middle of ocean worlds.
        if (PL.hasSea && !PL.glowSea && (type === 'ocean' || (type === 'earth' && rc.chance(0.5)))) {
            // In the warm shallows near land.
            const shallow = [];
            for (let i = 0; i < 1600; i++) {
                const p = fib(1600, i);
                if (Math.abs(p[1]) > 0.5) continue;
                const e = rawField(PL, p[0], p[1], p[2], 3, tmp) - PL.q0;
                if (e < -0.03 * PL.seaSpan && e > -0.3 * PL.seaSpan) shallow.push(p);
            }
            const na = Math.min(shallow.length, type === 'ocean' ? rc.int(8, 22) : rc.int(3, 8));
            for (let i = 0; i < na; i++) {
                const p = shallow[Math.floor(rc() * shallow.length)], ar = rc.range(0.006, 0.016);
                const j = [p[0] + rc.range(-0.01, 0.01), p[1] + rc.range(-0.01, 0.01), p[2] + rc.range(-0.01, 0.01)], jl = Math.hypot(j[0], j[1], j[2]);
                PL.atolls.push({ x: j[0] / jl, y: j[1] / jl, z: j[2] / jl, r: ar, cosReach: Math.cos(ar * 1.8) });
            }
        }
        // Fresh craters on rocky moons throw bright rays.
        if ((type === 'rock' || type === 'ice') && PL.craters.length) {
            PL.craters.slice().sort((a, b) => b.r - a.r).slice(0, rc.int(0, 2)).forEach(c => {
                const up = Math.abs(c.y) < 0.9 ? [0, 1, 0] : [1, 0, 0];
                let a = [up[1] * c.z - up[2] * c.y, up[2] * c.x - up[0] * c.z, up[0] * c.y - up[1] * c.x];
                const al = Math.hypot(a[0], a[1], a[2]); a = [a[0] / al, a[1] / al, a[2] / al];
                const b = [c.y * a[2] - c.z * a[1], c.z * a[0] - c.x * a[2], c.x * a[1] - c.y * a[0]];
                PL.rays.push({ c: c, a: a, b: b, k1: rc.int(9, 16), k2: rc.int(3, 6), ph: rc.range(0, 6.28) });
            });
        }
        // Storms that twist the clouds.
        if (w.clouds) {
            const n = PL.green || PL.toxic ? rc.int(2, 5) : rc.int(0, 2);
            for (let i = 0; i < n; i++) {
                const lat = rc.range(0.18, 0.7) * rc.sign(), u = unitAt(lat, rc.range(0, Math.PI * 2)), s = rc.range(0.12, 0.26);
                PL.cyclones.push({ x: u.x, y: u.y, z: u.z, s: s, cosReach: Math.cos(s * 2.2), twist: rc.range(1.5, 2.6) * (lat > 0 ? 1 : -1) });
            }
        }
        PL.relief = { earth: 1, ocean: 1, ice: 0.9, desert: 1, lava: 1, crystal: 1.1, toxic: 0.85, rock: 1.25 }[type] || 1;
        if (w.civ) cityPlan(PL, rc, tmp);
        return PL;
    }

    /** A civilisation's cities: the best spots along the coasts (or near them at sea, for floating cities), and roads between. */
    function cityPlan(PL, rc, tmp) {
        const civ = PL.w.civ;
        const floating = civ.style === 'floating';
        const count = Math.round((civ.cities || 5) * rc.range(2.4, 3.6));
        const cand = [];
        const n = 2400;
        for (let i = 0; i < n; i++) {
            const p = fib(n, i);
            const lat = Math.abs(Math.asin(p[1])) / (Math.PI / 2);
            if (lat > 0.78) continue;
            const e = rawField(PL, p[0], p[1], p[2], 3, tmp) - PL.q0;
            let s;
            if (PL.hasSea) {
                if (floating) s = e < 0 && e > -0.08 ? 1 - Math.abs(e + 0.03) / 0.05 : e > 0 && e < 0.03 ? 0.4 : -1;
                else s = e > 0 ? Math.exp(-e / 0.06) : -1;
            } else s = e / PL.landSpan < 0.4 ? 0.6 : 0.3;
            if (s < 0) continue;
            s += 0.35 * (PL.M.fbm(p[0] * 1.7, p[1] * 1.7, p[2] * 1.7, 2) + 0.5) - lat * 0.4 + rc() * 0.35;
            cand.push({ x: p[0], y: p[1], z: p[2], s: s });
        }
        cand.sort((a, b) => b.s - a.s);
        const minCos = Math.cos(0.16);
        for (let i = 0; i < cand.length && PL.cities.length < count; i++) {
            const c = cand[i];
            if (PL.cities.some(o => o.x * c.x + o.y * c.y + o.z * c.z > minCos)) continue;
            const rho = PL.cities.length < 3 ? rc.range(0.07, 0.12) : rc.range(0.035, 0.07);
            PL.cities.push({ x: c.x, y: c.y, z: c.z, rho: rho, cosReach: Math.cos(rho * 3.6) });
        }
        const cs = PL.cities, seen = {};
        cs.forEach((a, i) => {
            cs.map((b, j) => ({ j: j, d: a.x * b.x + a.y * b.y + a.z * b.z })).filter(o => o.j !== i).sort((p, q) => q.d - p.d).slice(0, 2).forEach(o => {
                if (o.d < Math.cos(0.75)) return;
                const key = Math.min(i, o.j) + '-' + Math.max(i, o.j);
                if (seen[key]) return;
                seen[key] = 1;
                const b = cs[o.j];
                let nx = a.y * b.z - a.z * b.y, ny = a.z * b.x - a.x * b.z, nz = a.x * b.y - a.y * b.x;
                const l = Math.hypot(nx, ny, nz) || 1;
                PL.arcs.push({ a: a, b: b, nx: nx / l, ny: ny / l, nz: nz / l });
            });
        });
        const tech = civ.tech || [];
        PL.maglev = tech.indexOf('maglev') >= 0;
        PL.farms = tech.indexOf('farms') >= 0 || PL.green;
        PL.solar = tech.indexOf('solar') >= 0;
        PL.cityTint = U.hex({ spires: '#b4bcc8', domes: '#e6eaee', arcology: '#9c928a', floating: '#d0dce8', organic: '#7f9a6a', crystal: '#cfe6ff' }[civ.style] || '#b0b4ba');
        PL.cityShine = civ.style === 'crystal' ? 0.5 : civ.style === 'spires' ? 0.28 : 0.16;
        PL.lights = U.hex(civ.lights);
        PL.floating = floating;
        const P = PL.P;
        PL.plots = PL.green ? [U.mix(P.mid, P.low, 0.6), U.hex(U.shiftHex(PL.w.palette.mid, 0, 1, 1.15)), U.mix(P.mid, P.high, 0.5), sc3(P.low, 0.85)]
            : [U.mix(P.mid, P.low, 0.5), U.mix(P.mid, P.high, 0.4), sc3(P.mid, 1.1), sc3(P.low, 0.9)];
    }

    const cityOut = { urban: 0, farm: 0, road: 0 };
    function cityAt(PL, x, y, z, roadW) {
        let keep = 1, farm = 0, road = 0;
        const cs = PL.cities;
        for (let i = 0; i < cs.length; i++) {
            const c = cs[i];
            const cd = x * c.x + y * c.y + z * c.z;
            if (cd < c.cosReach) continue;
            const u = Math.sqrt(Math.max(0, 2 - 2 * cd)) / c.rho;
            keep *= 1 - Math.exp(-u * u * 1.05);
            const band = U.smooth((u - 0.7) / 0.4) * (1 - U.smooth((u - 2.4) / 0.9));
            if (band > farm) farm = band;
        }
        if (roadW > 0) {
            const as = PL.arcs;
            for (let i = 0; i < as.length; i++) {
                const a = as[i];
                const s = x * a.nx + y * a.ny + z * a.nz;
                if (s > roadW || s < -roadW) continue;
                const A = a.a, B = a.b;
                const c1 = (A.y * z - A.z * y) * a.nx + (A.z * x - A.x * z) * a.ny + (A.x * y - A.y * x) * a.nz;
                const c2 = (y * B.z - z * B.y) * a.nx + (z * B.x - x * B.z) * a.ny + (x * B.y - y * B.x) * a.nz;
                if (c1 < 0 || c2 < 0) continue;
                const v = 1 - Math.abs(s) / roadW;
                if (v > road) road = v;
            }
        }
        cityOut.urban = 1 - keep; cityOut.farm = farm; cityOut.road = road;
        return cityOut;
    }

    function gasPlan(PL, r, rc) {
        const w = PL.w, P = PL.P, T = PL.T, style = PL.style;
        PL.bands = T.bands;
        const rainbow = w.rare === 'rainbow';
        const h0 = rc.range(0, 360);
        const cols = [];
        for (let i = 0; i < 12; i++) {
            let c;
            if (rainbow) c = U.hsl(h0 + i * 41, 0.6, i % 2 ? 0.68 : 0.57);
            else {
                c = i % 2 === 0 ? U.mix(P.mid, P.peak, rc.range(0, 0.6)) : U.mix(U.mix(P.low, P.high, rc.range(0, 1)), P.mid, 0.25);
                c = sc3(c, rc.range(0.8, 0.92));
            }
            cols.push(c);
        }
        PL.bandCols = cols;
        PL.bandTurb = cols.map(() => rc.range(0.3, 1.2));
        PL.bw = [rc.range(0, 6.28), rc.range(0, 6.28)];
        PL.bandContrast = rainbow ? 1 : style === 'calm' ? 0.75 : style === 'bands' ? 1.2 : 1;
        PL.bandMid = U.mix(P.mid, P.high, 0.5);
        PL.storm = T.storm ? { lat: r.range(-0.5, 0.5), lon: r.range(0, Math.PI * 2), w: r.range(0.22, 0.4), h: r.range(0.09, 0.15), col: r.pick([P.peak, P.high, U.hex('#d8704a'), U.hex('#f0e0c0')]) } : null;
        const ns = style === 'storms' ? r.int(5, 10) : r.int(1, 4);
        PL.spots = [];
        for (let i = 0; i < ns; i++) PL.spots.push({ lat: r.range(-1.1, 1.1), lon: r.range(0, Math.PI * 2), w: r.range(0.05, 0.12), h: r.range(0.025, 0.055), col: r.pick([P.peak, U.hex('#f4ecd8'), P.low, U.hex('#c86a48')]) });
        // Little white ovals strung along the belts.
        for (let i = rc.int(6, 16); i > 0; i--) PL.spots.push({ lat: rc.range(-0.9, 0.9), lon: rc.range(0, Math.PI * 2), w: rc.range(0.025, 0.05), h: rc.range(0.012, 0.024), col: U.mix(P.peak, [1, 1, 1], 0.5) });
        PL.poleCol = U.mix(P.low, [0.35, 0.36, 0.42], 0.35);
        PL.poleK = rainbow ? 0.25 : 0.55;
        // Floating cities: their lights scattered in the bands.
        if (w.civ) {
            PL.lights = U.hex(w.civ.lights);
            for (let i = (w.civ.cities || 5) * 4; i > 0; i--) {
                const u = unitAt(rc.range(-0.9, 0.9), rc.range(0, Math.PI * 2)), fr = rc.range(0.008, 0.02);
                PL.floaters.push({ x: u.x, y: u.y, z: u.z, r: fr, cosReach: Math.cos(fr * 2) });
            }
        }
        return PL;
    }

    // --- the painters ------------------------------------------------------------------------------------

    /**
     * A function (dir x,y,z) -> fills out[] with: surface rgb (0-2), relief height (3), glow rgb (4-6),
     * night light rgb (7-9), cloud alpha (10) and shine (11). `size` is the map width: smaller maps
     * use fewer noise layers.
     */
    function painterFor(w, size) {
        const PL = planFor(w);
        const oct = U.clamp(Math.round(Math.log2((size || 512) / 64)) + 3, 3, 8);
        return PL.gas ? gasPainter(PL, oct, size || 512) : rockyPainter(PL, oct, size || 512);
    }

    function rockyPainter(PL, oct, size) {
        const P = PL.P, T = PL.T, w = PL.w, style = PL.style;
        const N = PL.N, M = PL.M, C = PL.C, K = PL.K, Wn = PL.Wn;
        const o = {};
        const fine = size >= 384;
        const roadW = size >= 384 ? Math.max(0.004, 0.75 * Math.PI * 2 / size) : 0;
        const townF = U.clamp(size / 14, 12, 80);
        const LAVA = U.hex('#ff7a2a');
        const HALF_PI = Math.PI / 2;
        const ridgeOct = Math.max(3, oct - 2);

        return function (x, y, z, out) {
            const lat = Math.asin(y < -1 ? -1 : y > 1 ? 1 : y);
            const lat01 = Math.abs(lat) / HALF_PI;
            const raw = rawField(PL, x, y, z, oct, o);
            const qx = o.qx, qy = o.qy, qz = o.qz, cont = o.c;
            const e = raw - PL.q0;
            const mN = M.fbm(qx * 1.7, qy * 1.7, qz * 1.7, 3);
            let col, hgt = 0, gr = 0, gg = 0, gb = 0, lr = 0, lg = 0, lb = 0, spec = 0.03, coastT = 1, riv = 0;
            const isSea = PL.hasSea && e < 0;

            if (isSea) {
                const dd = U.clamp(-e / PL.seaSpan, 0, 1);
                const deepK = Math.pow(1 - dd, 1.8);
                let c = U.mix(PL.deep, P.sea, deepK);
                if (PL.sea2K) c = U.mix(c, U.mix(PL.deep, PL.sea2, deepK), U.smooth((mN + 0.08) / 0.3) * PL.sea2K);
                const shelf = U.smooth((0.16 - dd + N(x * 9, y * 9, z * 9) * 0.04) / 0.13) * PL.shelfK;
                if (shelf > 0) c = U.mix(c, PL.shelf, shelf * 0.72);
                const cur = 1 + Wn(qx * 5, qy * 9, qz * 5) * 0.06;
                col = sc3(c, cur);
                spec = PL.lava ? 0.25 : PL.toxic ? 0.8 : 1;
                for (let i = 0; i < PL.atolls.length; i++) {
                    const a = PL.atolls[i];
                    const cd = x * a.x + y * a.y + z * a.z;
                    if (cd < a.cosReach) continue;
                    const u = Math.sqrt(Math.max(0, 2 - 2 * cd)) / a.r;
                    const lag = u < 1 ? 1 : Math.max(0, 1 - (u - 1) / 0.6);
                    col = U.mix(col, PL.shelf, lag * 0.85);
                    const ring = Math.exp(-Math.pow((u - 1) / 0.1, 2)) * (0.6 + 0.4 * N(x * 90, y * 90, z * 90));
                    if (ring > 0.45) { col = U.mix(col, U.mix(P.mid, [0.9, 0.87, 0.76], 0.5), (ring - 0.45) * 1.6); spec *= 0.4; }
                }
                if (PL.glowSea) {
                    const flick = 0.65 + 0.35 * N(x * 12, y * 12, z * 12);
                    const g = PL.lava ? flick * (0.6 + 0.4 * (1 - dd)) : flick * 0.35;
                    gr = P.sea[0] * g; gg = P.sea[1] * g; gb = P.sea[2] * g;
                    if (PL.lava) {
                        // Crust floating on the lava sea, cracked, away from the shore.
                        const cc = cellular(qx * 9, qy * 9, qz * 9, PL.cellSeed);
                        const crust = U.smooth((cc.f2 - cc.f1 - 0.05) / 0.12) * U.smooth((dd - 0.12) / 0.3) * 0.85;
                        col = U.mix(col, sc3(P.low, 0.9), crust);
                        gr *= 1 - crust; gg *= 1 - crust; gb *= 1 - crust;
                    }
                }
                let iceK = 0;
                if (PL.iceStart < 1.5) {
                    const ie = lat01 + N(qx * 4, qy * 4, qz * 4) * 0.1 + N(x * 18, y * 18, z * 18) * 0.03 - PL.iceStart;
                    if (ie > 0) {
                        iceK = U.smooth(ie / 0.05);
                        let ic = U.mix(PL.iceCol, [0.98, 0.99, 1], N(x * 7, y * 7, z * 7) * 0.5 + 0.5);
                        const crack = N.ridged(x * 11 + 4, y * 11, z * 11, 2);
                        if (crack > 0.82) ic = U.mix(ic, U.mix(P.sea, [0.6, 0.75, 0.9], 0.4), U.smooth((crack - 0.82) / 0.1) * 0.6);
                        col = U.mix(col, ic, iceK);
                        spec = spec * (1 - iceK) + 0.3 * iceK;
                        gr *= 1 - iceK; gg *= 1 - iceK; gb *= 1 - iceK;
                    }
                }
                if (PL.glowSeaCol) {
                    // Glowing sea life (shown at night only): along the coasts and in drifting threads.
                    const coastal = U.smooth((0.22 - dd) / 0.18);
                    const thread = U.smooth((C.ridged(qx * 4 + 3, qy * 7, qz * 4, 3) - 0.72) / 0.16);
                    const bloom = 0.45 + 0.55 * U.smooth((C(qx * 6 + 3, qy * 6, qz * 6) + 0.1) / 0.35);
                    const k = Math.max(coastal * 0.65, thread * 0.5) * bloom * (1 - iceK);
                    lr += PL.glowSeaCol[0] * k; lg += PL.glowSeaCol[1] * k; lb += PL.glowSeaCol[2] * k;
                }
            } else {
                const t0 = U.clamp(e / PL.landSpan, 0, 1);
                coastT = t0;
                // Mountain spines, strongest in the hearts of the continents.
                let mtn = 0;
                const rd = N.ridged(qx * T.scale * 1.7 + 3, qy * T.scale * 1.7, qz * T.scale * 1.7, ridgeOct);
                const mask = (PL.contK ? U.smooth((cont - 0.3) / 0.45) : 0.6) * (0.6 + 0.4 * Wn(qx * 2.1 + 5, qy * 2.1, qz * 2.1));
                mtn = Math.max(0, rd - 0.5) * 2 * (0.3 + T.ridges) * mask;
                const t = U.clamp(t0 + mtn * 0.45, 0, 1);
                hgt = (t0 * 0.02 + mtn * 0.035) * PL.relief;
                let m = 0.5;

                if (PL.green) {
                    m = 0.5 + mN * 0.9 + (1 - U.smooth(t0 / 0.25)) * 0.12;
                    m -= Math.exp(-Math.pow((lat01 - 0.3) / 0.11, 2)) * 0.32;   // the dry belts
                    m += Math.exp(-Math.pow(lat01 / 0.12, 2)) * 0.14;            // the rainy middle
                    const tC = w.temperature + 8 - Math.pow(lat01, 1.5) * 52 - t * 34;
                    col = U.mix(PL.dry, PL.grass, U.smooth((m - 0.32) / 0.18));
                    col = U.mix(col, PL.forest, U.smooth((m - 0.56) / 0.18));
                    col = U.mix(col, PL.tundra, U.smooth((5 - tC) / 14));
                    // Bare rock on the mountain spines, snow only on the highest peaks (and where it is cold).
                    col = U.mix(col, P.high, U.clamp(U.smooth((t - 0.6) / 0.3) * 0.5 + U.smooth((mtn - 0.12) / 0.25) * 0.6, 0, 0.85));
                    const peaks = U.smooth((mtn - 0.32 + N(x * 13, y * 13, z * 13) * 0.1) / 0.14) * U.smooth((t - 0.55) / 0.2);
                    const snow = U.clamp(U.smooth((-5 - tC) / 9) + peaks, 0, 1);
                    col = U.mix(col, P.peak, snow);
                    if (t0 < 0.006 && tC > 2) col = U.mix(P.low, col, t0 / 0.006);
                    spec = 0.04 + snow * 0.2;
                } else if (PL.ice) {
                    col = U.mix(P.mid, P.high, U.smooth(t * 1.3));
                    col = U.mix(col, P.peak, U.smooth((mN + 0.1) / 0.35) * 0.45);
                    col = U.mix(col, [P.low[0] * 0.55, P.low[1] * 0.58, P.low[2] * 0.65], U.smooth((mtn - 0.2) / 0.3) * 0.8);
                    col = sc3(col, 0.92);
                    spec = 0.25;
                } else if (PL.desert) {
                    col = U.mix(P.mid, P.high, U.smooth((mN + 0.12) / 0.4));
                    const erg = U.smooth((0.45 - t) / 0.2);
                    if (erg > 0) {
                        const dune = 0.5 + 0.5 * Math.sin(Math.atan2(z, -x) * 70 + N.fbm(x * 4, y * 4, z * 4, 3) * 10 + lat * 26);
                        col = U.mix(col, U.mix(P.high, P.peak, 0.3), dune * 0.22 * erg);
                    }
                    col = U.mix(col, U.mix(P.low, P.mid, 0.35), U.smooth((t - 0.55) / 0.15) * 0.75);
                    const rk = N(qx * 7, qy * 7, qz * 7);
                    if (rk > 0.28) col = U.mix(col, P.low, U.smooth((rk - 0.28) / 0.2) * 0.55);
                } else if (PL.lava) {
                    col = U.mix(P.low, P.mid, U.smooth((mN + 0.2) / 0.5));
                    col = U.mix(col, P.high, U.smooth((t - 0.5) / 0.3) * 0.8);
                    const cc = cellular(qx * 6, qy * 6, qz * 6, PL.cellSeed);
                    col = sc3(col, 0.82 + cc.id * 0.32);
                    const crack = 1 - U.smooth((cc.f2 - cc.f1) / 0.07);
                    if (crack > 0) {
                        col = U.mix(col, LAVA, crack * 0.65);
                        gr = LAVA[0] * crack * 0.85; gg = LAVA[1] * crack * 0.85; gb = LAVA[2] * crack * 0.8;
                        hgt -= crack * 0.004;
                    }
                } else if (PL.crystal) {
                    const cc = cellular(qx * 5, qy * 5, qz * 5, PL.cellSeed);
                    const id = cc.id;
                    col = id < 0.4 ? U.mix(P.mid, P.high, id / 0.4) : U.mix(P.high, P.peak, (id - 0.4) / 0.6 * 0.6);
                    col = U.mix(P.low, col, 0.55 + 0.45 * U.smooth(t * 1.5));
                    const edge = (1 - U.smooth((cc.f2 - cc.f1) / 0.04)) * (0.4 + 0.6 * U.smooth((N(qx * 3, qy * 3, qz * 3) + 0.1) / 0.3));
                    if (edge > 0) {
                        col = U.mix(col, P.peak, edge * 0.3);
                        gr = P.high[0] * edge * 0.25; gg = P.high[1] * edge * 0.25; gb = P.high[2] * edge * 0.25;
                    }
                    hgt += id * 0.012;
                    spec = 0.35;
                } else if (PL.toxic) {
                    col = U.mix(P.low, P.mid, U.smooth((mN + 0.2) / 0.4));
                    col = U.mix(col, P.high, U.smooth((t - 0.45) / 0.3) * 0.8);
                    const sul = N(qx * 5 + 2, qy * 5, qz * 5);
                    if (sul > 0.3) col = U.mix(col, P.peak, U.smooth((sul - 0.3) / 0.2) * 0.55);
                } else {
                    // Rocky moons: dark low plains, bright highlands.
                    col = U.mix(P.low, P.high, U.smooth((t - 0.25) / 0.45));
                    col = U.mix(col, P.mid, 0.3 + 0.2 * mN);
                }

                // Craters: the big ones, then fields of small ones on maps that can show them.
                let floor = 0, rim = 0;
                for (let k = 0; k < PL.craters.length; k++) {
                    const c = PL.craters[k];
                    const cd = x * c.x + y * c.y + z * c.z;
                    if (cd < c.cosReach) continue;
                    const u = Math.acos(cd > 1 ? 1 : cd) / c.r;
                    if (u < 1) { hgt -= c.d * (1 - u * u) * c.r * 0.35; floor = Math.max(floor, 1 - u * u); }
                    const re = (u - 1.02) / 0.12, rr = Math.exp(-re * re);
                    hgt += c.d * c.r * 0.12 * rr;
                    rim = Math.max(rim, rr);
                }
                if (PL.craterDensity > 0) {
                    let cr = craterCells(x * 7, y * 7, z * 7, PL.cellSeed + 11, PL.craterDensity);
                    hgt += cr.dh / 7 * 0.6; floor = Math.max(floor, cr.floor * 0.8); rim = Math.max(rim, cr.rim * 0.8);
                    if (fine) {
                        cr = craterCells(x * 17, y * 17, z * 17, PL.cellSeed + 23, Math.min(0.8, PL.craterDensity * 1.3));
                        hgt += cr.dh / 17 * 0.6; floor = Math.max(floor, cr.floor * 0.6); rim = Math.max(rim, cr.rim * 0.6);
                    }
                }
                if (floor > 0) col = U.mix(col, [col[0] * 0.66, col[1] * 0.66, col[2] * 0.68], floor * 0.6);
                if (rim > 0) col = U.mix(col, U.mix(col, [1, 1, 1], 0.3), rim * 0.5);
                for (let k = 0; k < PL.rays.length; k++) {
                    const ry = PL.rays[k], c = ry.c;
                    const cd = x * c.x + y * c.y + z * c.z;
                    if (cd < 0.5) continue;
                    const u = Math.acos(cd > 1 ? 1 : cd) / c.r;
                    if (u < 0.9 || u > 6) continue;
                    const ang = Math.atan2(x * ry.b[0] + y * ry.b[1] + z * ry.b[2], x * ry.a[0] + y * ry.a[1] + z * ry.a[2]);
                    const s = Math.pow(0.5 + 0.5 * Math.sin(ang * ry.k1 + Math.sin(ang * ry.k2 + ry.ph) * 2), 5);
                    col = U.mix(col, U.mix(P.peak, [1, 1, 1], 0.3), s * Math.exp(-(u - 1) / 1.6) * 0.5);
                }

                // Each terrain style's own touch.
                if (style === 'volcanoes' && floor > 0.55) {
                    const k = U.smooth((floor - 0.55) / 0.3);
                    col = U.mix(col, LAVA, k * 0.8);
                    gr = Math.max(gr, LAVA[0] * k); gg = Math.max(gg, LAVA[1] * k * 0.9); gb = Math.max(gb, LAVA[2] * k * 0.8);
                }
                if (style === 'geodes' && floor > 0.25) {
                    const k = U.smooth((floor - 0.25) / 0.4);
                    col = U.mix(col, P.peak, k * 0.8);
                    gr = Math.max(gr, P.high[0] * k * 0.6); gg = Math.max(gg, P.high[1] * k * 0.6); gb = Math.max(gb, P.high[2] * k * 0.6);
                }
                if (style === 'canyons') {
                    const cv = N.ridged(qx * 3.4 + 5, qy * 3.4, qz * 3.4, 3);
                    if (cv > 0.78) { const k = U.smooth((cv - 0.78) / 0.14); col = U.mix(col, [col[0] * 0.38, col[1] * 0.3, col[2] * 0.28], k * 0.9); hgt -= k * 0.006; }
                }
                if (style === 'mesas') {
                    // Stepped plateaus in the highlands, their cliff edges a little darker.
                    const tt = U.clamp((t - 0.35) * 8, 0, 5), fr = tt - Math.floor(tt);
                    if (tt > 0) col = fr < 0.12 ? U.mix(col, [col[0] * 0.7, col[1] * 0.64, col[2] * 0.6], 0.6) : U.mix(col, P.peak, Math.floor(tt) * 0.04);
                    hgt += Math.floor(tt) * 0.004;
                }
                if (style === 'salt') {
                    const sn = N(qx * 4 + 11, qy * 4, qz * 4);
                    if (sn > 0.05 && t < 0.5) { col = U.mix(col, [0.96, 0.96, 0.93], U.smooth((sn - 0.05) / 0.2) * 0.9); spec = 0.2; }
                }
                if (style === 'cracked' && !PL.lava) {
                    const cr = N.ridged(x * 7 + 2, y * 7, z * 7, 3);
                    if (cr > 0.8) col = U.mix(col, [P.low[0] * 0.55, P.low[1] * 0.6, P.low[2] * 0.75], U.smooth((cr - 0.8) / 0.12) * 0.85);
                }
                if (style === 'glaciers') {
                    const st2 = 0.5 + 0.5 * Math.sin(lat * 40 + N.fbm(x * 3, y * 3, z * 3, 3) * 6);
                    col = U.mix(col, [0.92, 0.96, 1], st2 * 0.3);
                }
                if (style === 'swamp' || style === 'bubbles') {
                    const f = style === 'bubbles' ? 22 : 9;
                    const b = N(x * f, y * f, z * f);
                    if (b > 0.42) {
                        const k = U.smooth((b - 0.42) / 0.15);
                        col = U.mix(col, P.sea, k * 0.8);
                        gr = Math.max(gr, P.sea[0] * k * 0.45); gg = Math.max(gg, P.sea[1] * k * 0.45); gb = Math.max(gb, P.sea[2] * k * 0.45);
                        spec = Math.max(spec, k * 0.6);
                    }
                }
                if (style === 'jungle') col = U.mix(col, [col[0] * 0.7, col[1] * 0.85, col[2] * 0.7], 0.4);

                // Rivers winding down the wetter lowlands.
                if (PL.rivers && fine && t0 < 0.5 && m > 0.3) {
                    const rv = 1 - Math.abs(PL.R2.fbm(qx * 3.4, qy * 3.4, qz * 3.4, 3));
                    const k = U.smooth((rv - 0.955) / 0.03) * U.smooth((0.5 - t0) / 0.25) * U.smooth((m - 0.3) / 0.2);
                    if (k > 0) { col = U.mix(col, U.mix(P.sea, PL.deep || P.sea, 0.3), k * 0.7); spec = Math.max(spec, k * 0.6); hgt -= k * 0.002; riv = k; }
                }
                // Polar ice on the land.
                const pl = lat01 + N(x * 5, y * 5, z * 5) * 0.06;
                if (pl > PL.capLat) { const k = U.smooth((pl - PL.capLat) / 0.06); col = U.mix(col, [0.94, 0.97, 1], k); spec = Math.max(spec, k * 0.25); }
                // Fine variation so nothing looks smeared.
                const v = 0.9 + 0.12 * N(x * 24, y * 24, z * 24) + (fine ? 0.06 * N(x * 70, y * 70, z * 70) : 0);
                col = sc3(col, v);
            }

            // A civilisation: cities, roads and fields by day; their lights at night.
            if (PL.cities.length) {
                const ci = cityAt(PL, x, y, z, roadW);
                const land = !isSea;
                // Towns strung along the coasts and rivers wherever the people live (in the low basins on dry worlds).
                let settle = 0;
                if (land) {
                    const base = PL.hasSea ? Math.exp(-coastT / 0.07) * 0.8 + riv * 0.6 : U.smooth((0.3 - coastT) / 0.2) * 0.6;
                    if (base > 0.02) settle = U.clamp(base, 0, 1) * U.smooth((K(x * 7 + 3, y * 7, z * 7) + 0.15) / 0.4);
                }
                if ((land || PL.floating) && (ci.urban > 0.005 || ci.farm > 0.005 || ci.road > 0 || settle > 0.02)) {
                    const sprawl = 0.55 + 0.6 * U.smooth((K(x * 18, y * 18, z * 18) + 0.25) / 0.5);
                    let urban = U.clamp(ci.urban * sprawl, 0, 1);
                    if (!land && PL.floating) urban *= 0.85;
                    const blk = K(x * 60, y * 60, z * 60);
                    let farm = land && PL.farms ? ci.farm * (1 - urban) : 0;
                    if (farm > 0.01 && fine) {
                        const gx = Math.floor((Math.atan2(z, -x) + Math.PI) * 95), gy = Math.floor((lat + 2) * 95);
                        const pid = ih(gx, gy, 7, PL.cellSeed);
                        if (PL.solar && PL.desert && pid < 0.3) { col = U.mix(col, [0.16, 0.2, 0.3], farm * 0.85); spec = Math.max(spec, farm * 0.7); }
                        else col = U.mix(col, PL.plots[Math.floor(pid * 4) % 4], farm * 0.5);
                    }
                    if (urban > 0.02) {
                        const sh = 0.75 + 0.35 * blk;
                        col = U.mix(col, [PL.cityTint[0] * sh, PL.cityTint[1] * sh, PL.cityTint[2] * sh], Math.min(0.92, urban * 1.15));
                        spec = Math.max(spec, urban * PL.cityShine);
                        hgt += urban * 0.002;
                    }
                    if (ci.road > 0 && land) col = U.mix(col, U.mix(PL.cityTint, [0.5, 0.5, 0.52], 0.5), ci.road * 0.45);
                    const speck = U.smooth((blk + 0.05) / 0.35);
                    // Towns: soft round dots, one maybe in each little cell.
                    let townN = 0;
                    if (land && (settle > 0.02 || ci.farm > 0.02)) {
                        const tc = cellular(x * townF, y * townF, z * townF, PL.cellSeed + 41);
                        townN = tc.id < 0.7 ? Math.exp(-tc.f1 * tc.f1 / 0.06) * (0.5 + 0.5 * tc.id / 0.7) : 0;
                    }
                    const towns = townN * Math.max(ci.farm * 0.65, settle);
                    if (settle > 0.05) col = U.mix(col, PL.cityTint, settle * townN * 0.3);
                    const L = Math.min(1, Math.pow(urban, 1.1) * (0.5 + 0.5 * speck) + towns + (land ? ci.road * (PL.maglev ? 0.6 : 0.35) : 0));
                    lr += PL.lights[0] * L; lg += PL.lights[1] * L; lb += PL.lights[2] * L;
                }
            }

            // Clouds: swirled round storms, stretched along the latitudes, wispy at the edges.
            let cloud = 0;
            if (PL.cloudCover > 0) {
                let px = x, py = y, pz = z, eye = 1, arms = 0;
                for (let i = 0; i < PL.cyclones.length; i++) {
                    const k = PL.cyclones[i];
                    const cd = px * k.x + py * k.y + pz * k.z;
                    if (cd < k.cosReach) continue;
                    const d = Math.sqrt(Math.max(0, 2 - 2 * cd)) / k.s;
                    const th = k.twist * Math.exp(-d * d);
                    const cs = Math.cos(th), sn = Math.sin(th);
                    const ax = k.y * pz - k.z * py, ay = k.z * px - k.x * pz, az = k.x * py - k.y * px;
                    const nx = px * cs + ax * sn + k.x * cd * (1 - cs), ny = py * cs + ay * sn + k.y * cd * (1 - cs), nz = pz * cs + az * sn + k.z * cd * (1 - cs);
                    px = nx; py = ny; pz = nz;
                    eye = Math.min(eye, U.smooth((d - 0.05) / 0.1));
                    arms += Math.exp(-d * d) * 0.12;
                }
                const wq = C.fbm(px * 1.6 + 9, py * 1.6, pz * 1.6, 2) * 0.6;
                const cn = C.fbm(px * 2.3 + wq, py * 4.4, pz * 2.3 - wq, Math.max(3, oct - 1)) * 0.5 + 0.5;
                let band = 0;
                if (PL.green || PL.toxic) band = Math.exp(-Math.pow(lat01 / 0.1, 2)) * 0.06 - Math.exp(-Math.pow((lat01 - 0.3) / 0.1, 2)) * 0.07 + Math.exp(-Math.pow((lat01 - 0.62) / 0.14, 2)) * 0.05;
                const thr = (1 - PL.cloudCover) * 0.75 + 0.18 - band - arms;
                const ero = fine ? (C(px * 16, py * 22, pz * 16) * 0.5 + 0.5) * 0.08 : 0.04;
                cloud = U.smooth((cn - ero - thr) / 0.15) * eye;
                if (PL.toxic) cloud *= 0.55 + 0.3 * (0.5 + 0.5 * Math.sin(lat * 18 + cn * 6));
            }

            out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; out[3] = hgt;
            out[4] = gr; out[5] = gg; out[6] = gb;
            out[7] = lr; out[8] = lg; out[9] = lb;
            out[10] = cloud; out[11] = spec;
        };
    }

    function gasPainter(PL, oct, size) {
        const N = PL.N, Wn = PL.Wn, P = PL.P, cols = PL.bandCols, nb = cols.length;
        const fine = size >= 384;
        const turbOct = Math.max(3, oct - 2);
        const HALF_PI = Math.PI / 2;
        return function (x, y, z, out) {
            const lat = Math.asin(y < -1 ? -1 : y > 1 ? 1 : y);
            const ln = lat / HALF_PI;
            // Flowing turbulence: noise stretched along the bands and warped.
            const wv = Wn.fbm(x * 1.4, y * 5, z * 1.4, 3);
            const turb = N.fbm(x * 1.8 + wv, y * 8, z * 1.8 - wv, turbOct);
            const b0 = (ln * 0.5 + 0.5) * PL.bands + (Math.sin(ln * 5.1 + PL.bw[0]) * 0.55 + Math.sin(ln * 9.7 + PL.bw[1]) * 0.3) * PL.bands / 12;
            const i0 = Math.floor(b0);
            const ta = PL.bandTurb[((i0 % nb) + nb) % nb];
            const b = b0 + turb * 0.9 * ta + (fine ? N.fbm(x * 6, y * 30, z * 6, 2) * 0.1 : 0);
            const i = Math.floor(b), f = b - i;
            const c0 = cols[((i % nb) + nb) % nb], c1 = cols[(((i + 1) % nb) + nb) % nb];
            let col = U.mix(c0, c1, U.smooth((f - 0.72) / 0.28));
            if (PL.bandContrast !== 1) { col = U.mix(PL.bandMid, col, PL.bandContrast); col = [U.clamp(col[0], 0, 1), U.clamp(col[1], 0, 1), U.clamp(col[2], 0, 1)]; }
            // Eddies curling along the band edges.
            const edge = Math.exp(-Math.pow((f - 0.86) / 0.08, 2));
            if (edge > 0.05) { const ed = N(x * 14 + wv * 3, y * 30, z * 14); col = U.mix(col, ed > 0 ? c0 : c1, Math.min(1, edge * Math.abs(ed) * 1.4)); }
            // Bands within the bands, and fine streaks.
            const st = (0.96 + 0.04 * N(x * 3, y * (fine ? 110 : 60), z * 3)) * (0.95 + 0.08 * (0.5 + 0.5 * Math.sin(b * Math.PI * 2 + turb * 4)));
            col = sc3(col, st);
            const pk = U.smooth((Math.abs(ln) - 0.72) / 0.22);
            if (pk > 0) col = U.mix(col, PL.poleCol, pk * PL.poleK);
            const lon = Math.atan2(z, -x);
            let hgt = turb * 0.004;
            const sm = PL.storm;
            if (sm) {
                let dl = lon - sm.lon; dl = Math.atan2(Math.sin(dl), Math.cos(dl));
                const ee = (dl / sm.w) * (dl / sm.w) + ((lat - sm.lat) / sm.h) * ((lat - sm.lat) / sm.h);
                if (ee < 1.4) {
                    const swirl = 0.5 + 0.5 * Math.sin(Math.sqrt(ee) * 14 - Math.atan2(lat - sm.lat, dl) * 2);
                    const k = U.smooth((1.4 - ee) / 0.6);
                    col = U.mix(col, U.mix(sm.col, P.peak, swirl * 0.4), k * 0.9);
                    hgt += k * 0.006 * swirl;
                }
            }
            for (let k = 0; k < PL.spots.length; k++) {
                const sp = PL.spots[k];
                let dl = lon - sp.lon; dl = Math.atan2(Math.sin(dl), Math.cos(dl));
                const ee = (dl / sp.w) * (dl / sp.w) + ((lat - sp.lat) / sp.h) * ((lat - sp.lat) / sp.h);
                if (ee < 1.2) col = U.mix(col, sp.col, U.smooth((1.2 - ee) / 0.5) * 0.85);
            }
            let lr = 0, lg = 0, lb = 0;
            for (let k = 0; k < PL.floaters.length; k++) {
                const fl = PL.floaters[k];
                const cd = x * fl.x + y * fl.y + z * fl.z;
                if (cd < fl.cosReach) continue;
                const u = Math.sqrt(Math.max(0, 2 - 2 * cd)) / fl.r;
                const L = Math.exp(-u * u * 2) * (0.6 + 0.4 * N(x * 120, y * 120, z * 120));
                lr += PL.lights[0] * L; lg += PL.lights[1] * L; lb += PL.lights[2] * L;
                col = U.mix(col, [0.9, 0.92, 0.95], Math.exp(-u * u * 3) * 0.6);
            }
            out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; out[3] = hgt;
            out[4] = 0; out[5] = 0; out[6] = 0;
            out[7] = lr; out[8] = lg; out[9] = lb;
            out[10] = 0; out[11] = 0;
        };
    }

    // --- texture sets, cached by seed and size ----------------------------------------------------------

    const cache = new Map();   // key -> { tex: {map, glow, city, cloud, normal, spec}, refs, ready, waiters, size }

    function texKey(w, size) { return w.seed + ':' + (w.rare || '') + '@' + size; }

    /**
     * The textures for a world at one size: { map, glow|null, city|null, cloud|null, normal|null, spec|null }.
     * Returned at once (blank until painted); onReady fires when painted.
     */
    function textures(w, size, onReady, urgent) {
        const key = texKey(w, size);
        let e = cache.get(key);
        if (e) {
            e.refs++;
            if (e.ready) { if (onReady) onReady(e.tex); }
            else if (onReady) e.waiters.push(onReady);
            return e;
        }
        const W = size, H = Math.max(2, size / 2);
        const map = new Uint8Array(W * H * 4);
        const st = w.terrain && w.terrain.style;
        const wantGlow = w.palette.seaGlow || w.type === 'crystal' || w.type === 'lava' || st === 'volcanoes' || st === 'geodes' || st === 'swamp' || st === 'bubbles';
        const glow = wantGlow ? new Uint8Array(W * H * 4) : null;
        const city = w.civ || w.glowSea ? new Uint8Array(W * H * 4) : null;
        const cloud = w.clouds ? new Uint8Array(W * H * 4) : null;
        const relief = size >= 128;
        const normal = relief ? new Uint8Array(W * H * 4) : null;
        const SW = W >> 1, SH = Math.max(1, H >> 1);
        const wantSpec = relief && w.type !== 'gas' && (w.seaLevel >= 0 || w.type === 'ice' || w.type === 'crystal' || !!w.civ);
        const spec = wantSpec ? new Uint8Array(SW * SH * 4) : null;
        let hts = relief ? new Float32Array(W * H) : null;
        e = {
            key: key, refs: 1, ready: false, waiters: onReady ? [onReady] : [], size: size,
            tex: {
                map: dataTexture(W, H, map),
                glow: glow ? dataTexture(W, H, glow) : null,
                city: city ? dataTexture(W, H, city) : null,
                cloud: cloud ? dataTexture(W, H, cloud) : null,
                normal: normal ? dataTexture(W, H, normal, true) : null,
                spec: spec ? dataTexture(SW, SH, spec, true) : null
            }
        };
        cache.set(key, e);
        let paint = null;   // made in the first step, so building a world's plan never stalls the frame that asks for it
        const out = new Float32Array(12);
        const cc = w.clouds ? U.hex(w.clouds.color) : [1, 1, 1];
        const g8 = v => Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
        const rowsPer = Math.max(1, Math.floor(2048 / W));
        const normRows = Math.max(1, Math.floor(32768 / W));
        let row = 0, nrow = 0;

        function paintRows(y0, y1) {
            for (let y = y0; y < y1; y++) {
                const lat = ((y + 0.5) / H - 0.5) * Math.PI;
                const cl = Math.cos(lat), sl = Math.sin(lat);
                for (let x = 0; x < W; x++) {
                    const lon = (x / W) * Math.PI * 2;
                    paint(-Math.cos(lon) * cl, sl, Math.sin(lon) * cl, out);
                    const o = (y * W + x) * 4;
                    map[o] = g8(out[0]); map[o + 1] = g8(out[1]); map[o + 2] = g8(out[2]); map[o + 3] = 255;
                    if (glow) { glow[o] = g8(out[4]); glow[o + 1] = g8(out[5]); glow[o + 2] = g8(out[6]); glow[o + 3] = 255; }
                    if (city) { city[o] = g8(out[7]); city[o + 1] = g8(out[8]); city[o + 2] = g8(out[9]); city[o + 3] = g8(Math.max(out[7], out[8], out[9])); }
                    if (cloud) { cloud[o] = g8(cc[0]); cloud[o + 1] = g8(cc[1]); cloud[o + 2] = g8(cc[2]); cloud[o + 3] = g8(out[10]); }
                    if (hts) hts[y * W + x] = out[3];
                    if (spec && !(x & 1) && !(y & 1)) { const so = ((y >> 1) * SW + (x >> 1)) * 4; spec[so] = spec[so + 1] = spec[so + 2] = g8(out[11]); spec[so + 3] = 255; }
                }
            }
        }
        // The relief: slopes of the height map, turned into a tangent-space normal map (seas stay flat).
        function normalRows(y0, y1) {
            const k = W / (4 * Math.PI);
            for (let y = y0; y < y1; y++) {
                const lat = ((y + 0.5) / H - 0.5) * Math.PI;
                const cl = Math.max(0.12, Math.cos(lat));
                const fade = U.smooth((Math.cos(lat) - 0.05) / 0.25);
                const ym = y > 0 ? y - 1 : y, yp = y < H - 1 ? y + 1 : y;
                const ky = k * 2 / Math.max(1, yp - ym) * fade;
                const kx = k / cl * fade;
                for (let x = 0; x < W; x++) {
                    const xm = x > 0 ? x - 1 : W - 1, xp = x < W - 1 ? x + 1 : 0;
                    const sx = (hts[y * W + xp] - hts[y * W + xm]) * kx;
                    const sy = (hts[yp * W + x] - hts[ym * W + x]) * ky;
                    const il = 1 / Math.sqrt(sx * sx + sy * sy + 1);
                    const o = (y * W + x) * 4;
                    normal[o] = Math.round((-sx * il * 0.5 + 0.5) * 255);
                    normal[o + 1] = Math.round((-sy * il * 0.5 + 0.5) * 255);
                    normal[o + 2] = Math.round((il * 0.5 + 0.5) * 255);
                    normal[o + 3] = 255;
                }
            }
        }
        const job = {
            step: function () {
                if (!paint) { paint = painterFor(w, size); return false; }
                if (row < H) {
                    const y1 = Math.min(H, row + rowsPer);
                    paintRows(row, y1);
                    row = y1;
                    return row >= H && !hts;
                }
                if (hts) {
                    const y1 = Math.min(H, nrow + normRows);
                    normalRows(nrow, y1);
                    nrow = y1;
                    if (nrow >= H) { hts = null; return true; }
                    return false;
                }
                return true;
            },
            done: function () {
                e.ready = true;
                ['map', 'glow', 'city', 'cloud', 'normal', 'spec'].forEach(k => { if (e.tex[k]) e.tex[k].needsUpdate = true; });
                const ws = e.waiters; e.waiters = [];
                ws.forEach(f => { try { f(e.tex); } catch (err) { console.warn('[NSE] texture ready', err); } });
            }
        };
        e.job = job;
        if (urgent) jobs.unshift(job); else jobs.push(job);
        return e;
    }

    function disposeSet(k, x) {
        if (x.job) x.job.cancelled = true;
        ['map', 'glow', 'city', 'cloud', 'normal', 'spec'].forEach(t => { if (x.tex[t]) x.tex[t].dispose(); });
        cache.delete(k);
    }

    function release(e) {
        if (!e) return;
        e.refs--;
        if (e.refs > 0) return;
        e.freed = now();
        // The big orbit maps are heavy: keep only the newest spare one.
        if (e.size >= 1024) {
            const big = [];
            cache.forEach((x, k) => { if (x.refs <= 0 && x.size >= 1024) big.push([k, x]); });
            big.sort((a, b) => b[1].freed - a[1].freed);
            big.slice(1).forEach(p => disposeSet(p[0], p[1]));
        }
        // Keep a few spare painted sets around for a quick return; drop the oldest unused ones.
        let unused = 0;
        cache.forEach(x => { if (x.refs <= 0) unused++; });
        if (unused <= 24) return;
        for (const [k, x] of cache) {
            if (x.refs > 0) continue;
            disposeSet(k, x);
            unused--;
            if (unused <= 16) break;
        }
    }

    // --- shared bits -------------------------------------------------------------------------------------

    let glowTex = null, ringTex = null, softTex = null;

    /** A round soft glow (stars, engine flames, distant suns). */
    function glowTexture() {
        if (glowTex) return glowTex;
        const S = 128, d = new Uint8Array(S * S * 4);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
            const r = Math.sqrt(dx * dx + dy * dy);
            const a = Math.max(0, 1 - r);
            const v = Math.pow(a, 2.2) * 0.85 + Math.pow(a, 9) * 0.6;
            const o = (y * S + x) * 4;
            d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(U.clamp(v, 0, 1) * 255);
        }
        glowTex = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
        glowTex.magFilter = THREE.LinearFilter; glowTex.minFilter = THREE.LinearFilter;
        glowTex.needsUpdate = true;
        return glowTex;
    }

    /** A thin bright ring (the black hole's light ring). */
    function ringTexture() {
        if (ringTex) return ringTex;
        const S = 128, d = new Uint8Array(S * S * 4);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
            const r = Math.sqrt(dx * dx + dy * dy);
            const v = Math.exp(-Math.pow((r - 0.72) / 0.05, 2)) + Math.exp(-Math.pow((r - 0.72) / 0.16, 2)) * 0.3;
            const o = (y * S + x) * 4;
            d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(U.clamp(v, 0, 1) * 255);
        }
        ringTex = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
        ringTex.magFilter = THREE.LinearFilter; ringTex.minFilter = THREE.LinearFilter;
        ringTex.needsUpdate = true;
        return ringTex;
    }

    /** A soft lumpy cloud puff (nebulae). */
    function softTexture() {
        if (softTex) return softTex;
        const S = 128, d = new Uint8Array(S * S * 4);
        const N = U.noise3(77);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
            const r = Math.sqrt(dx * dx + dy * dy);
            const n = N.fbm(dx * 2.5, dy * 2.5, 0.5, 4) * 0.5 + 0.5;
            const v = Math.max(0, 1 - r) * (0.4 + n * 0.9);
            const o = (y * S + x) * 4;
            d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(U.clamp(Math.pow(v, 1.6), 0, 1) * 255);
        }
        softTex = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
        softTex.magFilter = THREE.LinearFilter; softTex.minFilter = THREE.LinearFilter;
        softTex.needsUpdate = true;
        return softTex;
    }

    function glowSprite(color, size, opacity) {
        const m = new THREE.SpriteMaterial({ map: glowTexture(), color: color, transparent: true, opacity: opacity === undefined ? 1 : opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
        const s = new THREE.Sprite(m);
        s.scale.set(size, size, 1);
        return s;
    }

    let dimTex = null;
    /** A 1x1 grey texture: as an aoMap it turns the ambient light down on a world (night sides stay dark). */
    function dimTexture() {
        if (dimTex) return dimTex;
        dimTex = new THREE.DataTexture(new Uint8Array([46, 46, 46, 255]), 1, 1, THREE.RGBAFormat);
        dimTex.needsUpdate = true;
        return dimTex;
    }

    // --- custom shells: atmosphere, city lights, aurora --------------------------------------------------

    /**
     * The atmosphere: one shell a little bigger than the world. Each pixel follows the view ray
     * through the air (to the ground, or past the edge) and glows by how much air it crosses,
     * lit where the sun reaches, warm round the sunset line, a soft ring when the sun is behind.
     */
    const ATMO_VERT = [
        'varying vec3 vW;',
        'varying vec3 vC;',
        'varying float vS;',
        'void main() {',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vW = wp.xyz;',
        '  vC = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
        '  vS = length(modelMatrix[0].xyz);',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
    ].join('\n');

    const ATMO_FRAG = [
        'uniform vec3 uColor;',
        'uniform vec3 uSunset;',
        'uniform vec3 uSun;',
        'uniform float uR;',
        'uniform float uRa;',
        'uniform float uStrength;',
        'varying vec3 vW;',
        'varying vec3 vC;',
        'varying float vS;',
        'void main() {',
        '  float r = uR * vS, ra = uRa * vS;',
        '  vec3 dir = normalize(vW - cameraPosition);',
        '  bool outside = length(cameraPosition - vC) > ra;',
        '  if (outside != gl_FrontFacing) discard;',
        '  vec3 o = (outside ? vW : cameraPosition) - vC;',
        '  float b = dot(o, dir);',
        '  float tEnd = -b + sqrt(max(b * b - (dot(o, o) - ra * ra), 0.0));',
        '  float disc = b * b - (dot(o, o) - r * r);',
        '  float hit = 0.0;',
        '  if (disc > 0.0) { float th = -b - sqrt(disc); if (th > 0.0 && th < tEnd) { tEnd = th; hit = 1.0; } }',
        '  float L = max(tEnd, 0.0);',
        '  vec3 pc = o + dir * clamp(-b, 0.0, L);',
        '  float hgt = clamp((length(pc) - r) / (ra - r), 0.0, 1.0);',
        '  float dens = exp(-hgt * 4.0) * (1.0 - hgt);',
        '  float opt = L / (2.0 * sqrt(ra * ra - r * r));',
        '  float glow = hit > 0.5 ? pow(opt, 1.6) * 0.55 : dens * min(opt * 1.3, 1.0);',
        '  vec3 sd = normalize(uSun - vC);',
        '  vec3 mp = normalize(hit > 0.5 ? o + dir * L : pc);',
        '  float mu = dot(mp, sd);',
        '  float day = smoothstep(-0.3, 0.3, mu);',
        '  float dusk = exp(-mu * mu / 0.03);',
        '  float fwd = pow(max(dot(dir, sd), 0.0), 6.0) * (1.0 - hit) * smoothstep(-0.7, 0.1, mu);',
        '  vec3 col = uColor * glow * (day + fwd * 1.2) + uSunset * glow * dusk * (0.6 - 0.4 * hit);',
        '  gl_FragColor = vec4(col * uStrength, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}'
    ].join('\n');

    const SHELL_VERT = [
        'varying vec3 vN;',
        'varying vec3 vW;',
        'varying vec3 vP;',
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  vP = normalize(position);',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vW = wp.xyz;',
        '  vN = normalize(mat3(modelMatrix) * normal);',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
    ].join('\n');

    const CITY_FRAG = [
        'uniform sampler2D uMap;',
        'uniform vec3 uSun;',
        'varying vec3 vN;',
        'varying vec3 vW;',
        'varying vec3 vP;',
        'varying vec2 vUv;',
        'void main() {',
        '  vec4 c = texture2D(uMap, vUv);',
        '  float night = smoothstep(0.12, -0.22, dot(normalize(vN), normalize(uSun - vW)));',
        '  gl_FragColor = vec4(c.rgb * night * 1.6, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}'
    ].join('\n');

    /** Aurora: soft curtains round both poles, gently moving; strongest on the night side and at the edge. */
    const AURORA_FRAG = [
        'uniform vec3 uSun;',
        'uniform vec3 uC1;',
        'uniform vec3 uC2;',
        'uniform float uTime;',
        'varying vec3 vN;',
        'varying vec3 vW;',
        'varying vec3 vP;',
        'varying vec2 vUv;',
        'void main() {',
        '  float lat = asin(clamp(vP.y, -1.0, 1.0));',
        '  float lon = atan(vP.z, vP.x);',
        '  float al = abs(lat);',
        '  float wob = 0.05 * sin(lon * 3.0 + uTime * 0.25) + 0.03 * sin(lon * 7.0 - uTime * 0.4);',
        '  float band = exp(-pow((al - 1.12 - wob) / 0.085, 2.0));',
        '  float rays = 0.55 + 0.45 * sin(lon * 38.0 + sin(lon * 9.0 + uTime * 0.6) * 2.5 + uTime * 0.3);',
        '  vec3 n = normalize(vN);',
        '  float night = smoothstep(0.25, -0.2, dot(n, normalize(uSun - vW)));',
        '  float limb = 1.0 - abs(dot(n, normalize(cameraPosition - vW)));',
        '  float k = band * (0.35 + 0.65 * rays) * (0.2 + 0.8 * night) * (0.7 + 1.5 * limb * limb);',
        '  vec3 col = mix(uC1, uC2, smoothstep(1.06, 1.22, al + wob));',
        '  gl_FragColor = vec4(col * k * 1.5, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}'
    ].join('\n');

    function atmosphereShell(radius, w) {
        const k = 1 + U.clamp(w.atmosphere.thickness, 0.04, 0.1) * 0.8;
        const ac = new THREE.Color(w.atmosphere.color);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: ac },
                uSunset: { value: ac.clone().lerp(new THREE.Color('#ff8a4a'), 0.6) },
                uSun: { value: new THREE.Vector3(1e5, 0, 0) },
                uR: { value: radius },
                uRa: { value: radius * k },
                uStrength: { value: w.type === 'gas' ? 0.9 : 1.2 }
            },
            vertexShader: ATMO_VERT,
            fragmentShader: ATMO_FRAG,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const seg = Math.max(32, SEGMENTS[quality]);
        const m = new THREE.Mesh(new THREE.SphereGeometry(radius * k, seg, seg >> 1), mat);
        m.renderOrder = 2;
        return m;
    }

    function cityShell(radius, tex) {
        const mat = new THREE.ShaderMaterial({
            uniforms: { uMap: { value: tex }, uSun: { value: new THREE.Vector3() } },
            vertexShader: SHELL_VERT,
            fragmentShader: CITY_FRAG,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const seg = SEGMENTS[quality];
        const m = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.002, seg, seg >> 1), mat);
        m.renderOrder = 1;
        return m;
    }

    function auroraShell(radius, a) {
        const mat = new THREE.ShaderMaterial({
            uniforms: { uSun: { value: new THREE.Vector3() }, uC1: { value: new THREE.Color(a.color) }, uC2: { value: new THREE.Color(a.color2 || a.color) }, uTime: { value: 0 } },
            vertexShader: SHELL_VERT,
            fragmentShader: AURORA_FRAG,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const seg = SEGMENTS[quality];
        const m = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.022, seg, seg >> 1), mat);
        m.renderOrder = 2;
        return m;
    }

    // --- rings ---------------------------------------------------------------------------------------------

    /** Ringlets, a few dark gaps, a faint inner ring, a dense middle and a lighter outer ring. */
    function ringBandTexture(w, R, tag) {
        const S = 1024, rows = 4, d = new Uint8Array(S * rows * 4);
        const N = U.noise3(U.hash(tag, w.seed));
        const rr = U.rng(U.hash(tag + '-gaps', w.seed));
        const base = U.hex(R.color);
        const dark = [base[0] * 0.55, base[1] * 0.52, base[2] * 0.5];
        const light = U.mix(base, [1, 0.98, 0.94], 0.3);
        const gaps = [{ t: 0.62, w: 0.03 }];
        for (let i = rr.int(1, 3); i > 0; i--) gaps.push({ t: rr.range(0.2, 0.92), w: rr.range(0.004, 0.018) });
        const inner = rr.range(0.1, 0.25);
        for (let x = 0; x < S; x++) {
            const t = x / (S - 1);
            let dens = 0.3 + 0.7 * U.smooth((t - inner) / 0.08);
            dens *= 1 - 0.3 * U.smooth((t - 0.66) / 0.04);
            const lets = 0.5 + 0.28 * N(t * 50, 0.3, 0.7) + 0.16 * N(t * 190, 1.1, 0.2) + 0.1 * N(t * 520, 2.3, 0.9);
            let gap = 1;
            for (let g = 0; g < gaps.length; g++) gap *= 1 - 0.92 * (1 - U.smooth(Math.abs(t - gaps[g].t) / gaps[g].w));
            const edge = U.smooth(t / 0.04) * U.smooth((1 - t) / 0.05);
            const a = U.clamp(dens * lets * gap * edge * 1.15, 0, 1);
            const c = U.mix(U.mix(dark, base, U.smooth((t - inner) / 0.15)), light, (N(t * 22, 2.2, 0.1) * 0.5 + 0.5) * 0.5);
            for (let row = 0; row < rows; row++) {
                const o = (row * S + x) * 4;
                d[o] = Math.round(U.clamp(c[0], 0, 1) * 255);
                d[o + 1] = Math.round(U.clamp(c[1], 0, 1) * 255);
                d[o + 2] = Math.round(U.clamp(c[2], 0, 1) * 255);
                d[o + 3] = Math.round(a * 235);
            }
        }
        const tex = new THREE.DataTexture(d, S, rows, THREE.RGBAFormat);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
        return tex;
    }

    /** A ring set, darkened where the planet's shadow falls across it. */
    function ringMesh(w, R, tag) {
        const seg = quality === 'low' ? 64 : 160;
        const g = new THREE.RingGeometry(R.inner, R.outer, seg, 1);
        // Radial texture coordinate: u runs from the inner edge to the outer edge.
        const pos = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - R.inner) / (R.outer - R.inner), 0.5);
        const tex = ringBandTexture(w, R, tag);
        const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: new THREE.Color(R.color), emissiveIntensity: 0.32, emissiveMap: tex });
        const sh = { uSunPos: { value: new THREE.Vector3(1e5, 0, 0) }, uCentre: { value: new THREE.Vector3() }, uR: { value: w.radius } };
        mat.onBeforeCompile = function (s) {
            s.uniforms.uSunPos = sh.uSunPos; s.uniforms.uCentre = sh.uCentre; s.uniforms.uR = sh.uR;
            s.vertexShader = 'varying vec3 vShW;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvShW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
            s.fragmentShader = 'uniform vec3 uSunPos;\nuniform vec3 uCentre;\nuniform float uR;\nvarying vec3 vShW;\n' + s.fragmentShader.replace('#include <opaque_fragment>', [
                '{',
                '  vec3 Ls = normalize(uSunPos - vShW);',
                '  vec3 oc = vShW - uCentre;',
                '  float bb = dot(oc, Ls);',
                '  float dperp = sqrt(max(dot(oc, oc) - bb * bb, 0.0));',
                '  float shade = bb < 0.0 ? 1.0 - smoothstep(uR * 0.96, uR * 1.03, dperp) : 0.0;',
                '  outgoingLight *= 1.0 - shade * 0.85;',
                '}',
                '#include <opaque_fragment>'
            ].join('\n'));
        };
        mat.customProgramCacheKey = function () { return 'nse-ring-shadow'; };
        const m = new THREE.Mesh(g, mat);
        m.rotation.x = -Math.PI / 2 + R.tilt;
        m.renderOrder = 3;
        m.userData.shadow = sh;
        return m;
    }

    // --- a world (planet or moon) ------------------------------------------------------------------------

    /**
     * Meshes for one world, centred on the group's origin. The caller places the group.
     * o.orbit true: also paint an extra-detailed map (the world being orbited).
     */
    function worldMesh(w, o) {
        o = o || {};
        const group = new THREE.Group();
        group.name = 'world:' + w.name;
        const tiltGroup = new THREE.Group();
        tiltGroup.rotation.z = w.tilt;
        group.add(tiltGroup);
        const seg = SEGMENTS[quality];
        const gas = w.type === 'gas';
        const geo = new THREE.SphereGeometry(w.radius, seg, seg >> 1);
        const SPEC = gas ? 0x000000 : 0x2a2a2a;
        // Night sides get less of the scene's ambient light (a plain grey aoMap), so city lights show.
        const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x000000, shininess: w.type === 'ice' ? 50 : 160, aoMap: dimTexture(), aoMapIntensity: 1 });
        const surface = new THREE.Mesh(geo, mat);
        surface.name = 'surface';
        tiltGroup.add(surface);
        let cloudMesh = null, cityMesh = null, atmo = null, aurora = null;
        const rings = [];
        const held = [];
        let disposed = false;
        let level = -1;

        function apply(tex, lv) {
            if (disposed || lv < level) return;
            level = lv;
            mat.map = tex.map;
            mat.color.set(0xffffff);
            if (tex.glow) { mat.emissive.set(0xffffff); mat.emissiveMap = tex.glow; mat.emissiveIntensity = 1; }
            if (tex.normal) mat.normalMap = tex.normal;
            mat.specularMap = tex.spec || null;
            mat.specular.setHex(tex.spec ? SPEC : gas ? 0x000000 : 0x080808);
            mat.needsUpdate = true;
            if (tex.cloud) {
                if (!cloudMesh) {
                    const cm = new THREE.MeshLambertMaterial({ map: tex.cloud, transparent: true, depthWrite: false, aoMap: dimTexture(), aoMapIntensity: 1 });
                    cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(w.radius * 1.014, seg, seg >> 1), cm);
                    cloudMesh.name = 'clouds';
                    cloudMesh.renderOrder = 1;
                    tiltGroup.add(cloudMesh);
                } else { cloudMesh.material.map = tex.cloud; cloudMesh.material.needsUpdate = true; }
            }
            if (tex.city) {
                if (!cityMesh) { cityMesh = cityShell(w.radius, tex.city); cityMesh.name = 'city'; tiltGroup.add(cityMesh); }
                else cityMesh.material.uniforms.uMap.value = tex.city;
            }
        }

        // A flat colour straight away, then the painted maps as they finish.
        mat.color.set(w.palette.mid);
        const sizes = RES[quality];
        const mid = w.kind === 'moon' ? Math.max(sizes[0] * 2, sizes[1] >> 1) : sizes[1];
        held.push(textures(w, sizes[0], t => apply(t, 0), true));
        held.push(textures(w, mid, t => apply(t, 1), !!o.orbit));
        if (o.orbit && sizes[2] > mid) held.push(textures(w, sizes[2], t => apply(t, 2), false));

        if (w.atmosphere) { atmo = atmosphereShell(w.radius, w); atmo.name = 'atmosphere'; group.add(atmo); }
        if (w.aurora && w.atmosphere) { aurora = auroraShell(w.radius, w.aurora); aurora.name = 'aurora'; tiltGroup.add(aurora); }
        if (w.rings) { const rm = ringMesh(w, w.rings, 'rings'); rm.name = 'rings'; tiltGroup.add(rm); rings.push(rm); }
        if (w.rings2) {
            // A second ring set, tipped another way.
            const yaw = new THREE.Group();
            yaw.rotation.y = 0.9;
            const rm = ringMesh(w, w.rings2, 'rings2');
            rm.name = 'rings2';
            yaw.add(rm);
            tiltGroup.add(yaw);
            rings.push(rm);
        }

        const sunWorld = new THREE.Vector3();
        return {
            group: group,
            world: w,
            surface: surface,
            /** Paint the extra-detailed map too (when this world becomes the one orbited). */
            detail: function () {
                if (disposed || held.length > 2 || !(sizes[2] > mid)) return;
                held.push(textures(w, sizes[2], t => apply(t, 2), true));
            },
            update: function (dt, sun) {
                surface.rotation.y += w.spin * dt;
                if (cloudMesh) cloudMesh.rotation.y += w.spin * dt * 1.25;
                if (cityMesh) cityMesh.rotation.y = surface.rotation.y;
                if (aurora) aurora.material.uniforms.uTime.value += dt * (calmNow() ? 0.3 : 1);
                if (sun) {
                    sunWorld.set(sun.x, sun.y, sun.z);
                    if (atmo) atmo.material.uniforms.uSun.value.copy(sunWorld);
                    if (cityMesh) cityMesh.material.uniforms.uSun.value.copy(sunWorld);
                    if (aurora) aurora.material.uniforms.uSun.value.copy(sunWorld);
                    if (rings.length) {
                        const m = group.matrixWorld.elements;
                        const s = Math.hypot(m[0], m[1], m[2]) || 1;
                        rings.forEach(function (rm) {
                            const sh = rm.userData.shadow;
                            sh.uSunPos.value.copy(sunWorld);
                            sh.uCentre.value.set(m[12], m[13], m[14]);
                            sh.uR.value = w.radius * s;
                        });
                    }
                }
            },
            dispose: function () {
                disposed = true;
                group.traverse(function (n) {
                    if (n.geometry) n.geometry.dispose();
                    if (n.material) {
                        // Painted maps belong to the cache; the ring textures are ours.
                        if (rings.indexOf(n) >= 0 && n.material.map) n.material.map.dispose();
                        n.material.dispose();
                    }
                });
                held.forEach(release);
                held.length = 0;
            }
        };
    }

    // --- stars --------------------------------------------------------------------------------------------

    function starSurfaceTexture(star) {
        const W = 128, H = 64, d = new Uint8Array(W * H * 4);
        const N = U.noise3(U.hash('star', star.name));
        const c = U.hex(star.color);
        for (let y = 0; y < H; y++) {
            const lat = ((y + 0.5) / H - 0.5) * Math.PI;
            for (let x = 0; x < W; x++) {
                const lon = x / W * Math.PI * 2;
                const px = -Math.cos(lon) * Math.cos(lat), py = Math.sin(lat), pz = Math.sin(lon) * Math.cos(lat);
                const n = N.fbm(px * 6, py * 6, pz * 6, 4) * 0.5 + 0.5;
                const v = 0.8 + n * 0.35;
                const o = (y * W + x) * 4;
                d[o] = Math.round(U.clamp(c[0] * v + 0.1, 0, 1) * 255);
                d[o + 1] = Math.round(U.clamp(c[1] * v + 0.05, 0, 1) * 255);
                d[o + 2] = Math.round(U.clamp(c[2] * v, 0, 1) * 255);
                d[o + 3] = 255;
            }
        }
        return dataTexture(W, H, d);
    }

    function starMesh(star) {
        const group = new THREE.Group();
        group.name = 'star:' + star.name;
        const tex = starSurfaceTexture(star);
        const body = new THREE.Mesh(new THREE.SphereGeometry(star.radius, 48, 24), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        body.name = 'body';
        group.add(body);
        const g1 = glowSprite(star.color, star.radius * 4.2, 0.9);
        const g2 = glowSprite(star.light, star.radius * 11, 0.28);
        g1.name = 'glow'; g2.name = 'halo';
        group.add(g1, g2);
        let t = 0;
        return {
            group: group,
            update: function (dt, calm) {
                t += dt;
                body.rotation.y += dt * 0.02;
                if (!calm) {
                    const p = 1 + Math.sin(t * 0.9) * 0.025 + Math.sin(t * 2.3) * 0.012;
                    g1.scale.set(star.radius * 4.2 * p, star.radius * 4.2 * p, 1);
                }
            },
            dispose: function () { tex.dispose(); group.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); }); }
        };
    }

    function blackHoleMesh(sys) {
        const star = sys.stars[0], D = sys.disk;
        const group = new THREE.Group();
        group.name = 'blackhole:' + star.name;
        const core = new THREE.Mesh(new THREE.SphereGeometry(star.radius, 40, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        core.name = 'core';
        group.add(core);
        // The glowing disk: hot and bright at the inside, fading and streaky outwards.
        const S = 256, d = new Uint8Array(S * 4 * 4);
        const N = U.noise3(U.hash('disk', sys.seed));
        const c = U.hex(D.color);
        for (let x = 0; x < S; x++) {
            const t = x / (S - 1);
            const heat = Math.pow(1 - t, 1.6);
            const streak = 0.6 + 0.4 * N(t * 30, 0.5, 0.5);
            const a = U.smooth(t / 0.04) * (1 - U.smooth((t - 0.75) / 0.25)) * streak;
            for (let row = 0; row < 4; row++) {
                const o = (row * S + x) * 4;
                d[o] = Math.round(U.clamp(c[0] + heat * 0.6, 0, 1) * 255);
                d[o + 1] = Math.round(U.clamp(c[1] * (0.6 + heat * 0.6), 0, 1) * 255);
                d[o + 2] = Math.round(U.clamp(c[2] * (0.4 + heat * 0.8), 0, 1) * 255);
                d[o + 3] = Math.round(U.clamp(a, 0, 1) * 255);
            }
        }
        const tex = new THREE.DataTexture(d, S, 4, THREE.RGBAFormat);
        tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
        const g = new THREE.RingGeometry(D.inner, D.outer, 128, 1);
        const pos = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - D.inner) / (D.outer - D.inner), 0.5);
        const disk = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        disk.name = 'disk';
        disk.rotation.x = -Math.PI / 2 + 0.25;
        group.add(disk);
        const ringMat = new THREE.SpriteMaterial({ map: ringTexture(), color: D.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
        const halo = new THREE.Sprite(ringMat);
        halo.scale.set(star.radius * 2.9, star.radius * 2.9, 1);
        halo.name = 'lightring';
        group.add(halo);
        group.add(glowSprite(D.color, D.outer * 3.2, 0.22));
        return {
            group: group,
            update: function (dt, calm) { disk.rotation.z += dt * (calm ? 0.05 : 0.12); },
            dispose: function () { tex.dispose(); group.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); }); }
        };
    }

    function nebulaMesh(sys) {
        const group = new THREE.Group();
        group.name = 'nebula:' + sys.name;
        const r = U.rng(U.hash('nebula', sys.seed));
        const n = quality === 'low' ? 18 : quality === 'standard' ? 30 : 44;
        const a = new THREE.Color(sys.nebula.a), b = new THREE.Color(sys.nebula.b);
        const sprites = [];
        for (let i = 0; i < n; i++) {
            const m = new THREE.SpriteMaterial({ map: softTexture(), color: a.clone().lerp(b, r()), transparent: true, opacity: r.range(0.1, 0.24), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
            m.rotation = r.range(0, Math.PI * 2);
            const s = new THREE.Sprite(m);
            const rad = sys.nebula.size * Math.pow(r(), 0.6);
            const th = r.range(0, Math.PI * 2), ph = r.range(-0.5, 0.5);
            s.position.set(Math.cos(th) * rad, Math.sin(ph) * rad * 0.5, Math.sin(th) * rad);
            const size = r.range(260, 720);
            s.scale.set(size, size, 1);
            s.userData.spin = r.range(-0.02, 0.02);
            sprites.push(s);
            group.add(s);
        }
        return {
            group: group,
            update: function (dt, calm) { if (calm) return; sprites.forEach(s => { s.material.rotation += s.userData.spin * dt; }); },
            dispose: function () { group.traverse(n => { if (n.material) n.material.dispose(); }); }
        };
    }

    return {
        init: init,
        setQuality: setQuality,
        quality: function () { return quality; },
        pump: pump,
        flush: flush,
        pending: function () { return jobs.length; },
        worldMesh: worldMesh,
        starMesh: starMesh,
        blackHoleMesh: blackHoleMesh,
        nebulaMesh: nebulaMesh,
        glowTexture: glowTexture,
        glowSprite: glowSprite,
        softTexture: softTexture,
        _painter: painterFor,
        _plan: planFor,
        _cacheSize: function () { return cache.size; }
    };
})();
