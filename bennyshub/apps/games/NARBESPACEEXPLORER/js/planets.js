/**
 * NARBE Space Explorer - planets, moons and stars as Three.js meshes.
 *
 * Every world's look comes from its seed (js/universe.js): an equirectangular
 * colour map painted from 3D noise (so there is never a seam), a cloud layer,
 * a glowing atmosphere rim, rings, and city lights on the night side when a
 * civilisation lives there. Stars get a hot surface and soft glows; black
 * holes a dark heart with a spinning glowing disk; nebulae big soft clouds.
 *
 * Textures are painted a few rows at a time (pump(ms) each frame) so arriving
 * at a system never freezes the game: a tiny preview first, then full detail,
 * then extra detail for the world you orbit. Painted maps are cached by seed.
 *
 * The surface and clouds use ordinary Lambert materials lit by the system's
 * star (a point light). Only the atmosphere rim and the night-side city lights
 * are small custom shaders, each on its own see-through shell: if a graphics
 * card refused one, the planet itself would still draw.
 */

window.NSE = window.NSE || {};

NSE.Planets = (function () {
    'use strict';

    const U = NSE.Util;
    let THREE = null;
    let quality = 'high';

    /** Map sizes: [preview, normal, orbit] widths (height is half). */
    const RES = { high: [64, 512, 1024], standard: [64, 256, 512], low: [32, 128, 256] };
    const SEGMENTS = { high: 72, standard: 48, low: 28 };

    function init(three, q) { THREE = three; quality = q || 'high'; }
    function setQuality(q) { quality = q || 'high'; }

    // --- painting jobs (a few rows per frame) ----------------------------------------------------

    const jobs = [];

    /** Run queued painting for about `ms` milliseconds. */
    function pump(ms) {
        const until = now() + (ms || 6);
        while (jobs.length && now() < until) {
            const j = jobs[0];
            if (j.cancelled) { jobs.shift(); continue; }
            const rows = Math.max(1, Math.floor(4096 / j.w));
            j.paint(j.row, Math.min(j.h, j.row + rows));
            j.row += rows;
            if (j.row >= j.h) { jobs.shift(); j.done(); }
        }
        return jobs.length;
    }
    function now() { return (typeof performance !== 'undefined' ? performance : Date).now(); }

    /** Paint everything at once (tests, snapshots). */
    function flush() { while (jobs.length) pump(1000); }

    function dataTexture(w, h, data) {
        const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.anisotropy = 4;
        t.needsUpdate = true;
        return t;
    }

    // --- the painter for one world ---------------------------------------------------------------------

    /**
     * A function (dir x,y,z) -> fills out[] with: surface rgb, height, glow rgb,
     * city light strength, cloud alpha. Built once per world, shared by every size.
     */
    function painterFor(w) {
        const N = U.noise3(U.hash('surface', w.seed));
        const C = U.noise3(U.hash('cloud', w.seed));
        const r = U.rng(U.hash('paint', w.seed));
        const P = {
            low: U.hex(w.palette.low), mid: U.hex(w.palette.mid), high: U.hex(w.palette.high), peak: U.hex(w.palette.peak),
            sea: U.hex(w.palette.sea)
        };
        const T = w.terrain;
        const sea = w.seaLevel;
        const gas = w.type === 'gas';
        const craters = [];
        const nc = Math.round(T.craters * 26);
        for (let i = 0; i < nc; i++) {
            const z = r.range(-1, 1), a = r.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z);
            craters.push({ x: s * Math.cos(a), y: z, z: s * Math.sin(a), r: r.range(0.05, 0.22), d: r.range(0.15, 0.35) });
        }
        const capLat = w.type === 'ice' ? 0.55 : (w.type === 'earth' || w.type === 'ocean') && w.temperature < 26 ? 0.82 : w.type === 'rock' && r.chance(0.3) ? 0.85 : 2;
        // Gas giants: band colours in order, and a storm.
        const bandCols = [P.low, P.mid, P.high, P.peak, P.mid, P.low];
        const storm = gas && T.storm ? { lat: r.range(-0.5, 0.5), lon: r.range(0, Math.PI * 2), w: r.range(0.22, 0.4), h: r.range(0.09, 0.15), col: r.pick([P.peak, P.high, U.hex('#d8704a'), U.hex('#f0e0c0')]) } : null;
        const cityCol = w.civ ? U.hex(w.civ.lights) : null;
        const cloudCover = w.clouds ? w.clouds.cover : 0;
        const glowSea = w.palette.seaGlow;
        const crystal = w.type === 'crystal', lava = w.type === 'lava', desert = w.type === 'desert';
        const style = T.style || '';
        // Storm style: a scatter of smaller storms too.
        const spots = [];
        if (gas && style === 'storms') {
            const ns = r.int(3, 7);
            for (let i = 0; i < ns; i++) spots.push({ lat: r.range(-1.1, 1.1), lon: r.range(0, Math.PI * 2), w: r.range(0.06, 0.13), h: r.range(0.03, 0.06), col: r.pick([P.peak, P.low, U.hex('#f4ecd8'), U.hex('#c86a48')]) });
        }
        const bandContrast = style === 'calm' ? 0.82 : style === 'bands' ? 1.25 : 1;
        const LAVA = U.hex('#ff7a2a');

        function grad(t) {
            if (t < 0.35) return U.mix(P.low, P.mid, t / 0.35);
            if (t < 0.7) return U.mix(P.mid, P.high, (t - 0.35) / 0.35);
            return U.mix(P.high, P.peak, (t - 0.7) / 0.3);
        }

        return function (x, y, z, out) {
            // out: [r,g,b, h, gr,gg,gb, city, cloud]
            const lat = Math.asin(U.clamp(y, -1, 1));
            let col, h = 0, glow = [0, 0, 0], city = 0;
            if (gas) {
                const turb = N.fbm(x * 2.2, y * 6, z * 2.2, 4) * 0.22 + N.fbm(x * 7, y * 14, z * 7, 2) * 0.05;
                const b = (lat / (Math.PI / 2) + 1) * 0.5 * T.bands + turb * T.bands * 0.35;
                const i = Math.floor(b), f = b - i;
                const c0 = bandCols[((i % bandCols.length) + bandCols.length) % bandCols.length];
                const c1 = bandCols[(((i + 1) % bandCols.length) + bandCols.length) % bandCols.length];
                col = U.mix(c0, c1, U.smooth((f - 0.65) / 0.35));
                if (bandContrast !== 1) { const mid = U.mix(P.mid, P.high, 0.5); col = U.mix(mid, col, bandContrast); col = [U.clamp(col[0], 0, 1), U.clamp(col[1], 0, 1), U.clamp(col[2], 0, 1)]; }
                const shade = 0.92 + N(x * 9, y * 30, z * 9) * 0.08;
                col = [col[0] * shade, col[1] * shade, col[2] * shade];
                if (storm) {
                    const lon = Math.atan2(z, -x);
                    let dl = lon - storm.lon; dl = Math.atan2(Math.sin(dl), Math.cos(dl));
                    const e = (dl / storm.w) * (dl / storm.w) + ((lat - storm.lat) / storm.h) * ((lat - storm.lat) / storm.h);
                    if (e < 1.4) {
                        const swirl = 0.5 + 0.5 * Math.sin(Math.sqrt(e) * 14 - Math.atan2(lat - storm.lat, dl) * 2);
                        const k = U.smooth((1.4 - e) / 0.6);
                        col = U.mix(col, U.mix(storm.col, P.peak, swirl * 0.4), k * 0.9);
                    }
                }
                for (let k = 0; k < spots.length; k++) {
                    const sp = spots[k];
                    const lon = Math.atan2(z, -x);
                    let dl = lon - sp.lon; dl = Math.atan2(Math.sin(dl), Math.cos(dl));
                    const e = (dl / sp.w) * (dl / sp.w) + ((lat - sp.lat) / sp.h) * ((lat - sp.lat) / sp.h);
                    if (e < 1.2) col = U.mix(col, sp.col, U.smooth((1.2 - e) / 0.5) * 0.85);
                }
                h = 0.5;
            } else {
                const s = T.scale;
                let n = N.fbm(x * s, y * s, z * s, 5, 2.05, T.roughness) * 0.62 + 0.5;
                if (T.ridges > 0) n += (N.ridged(x * s * 1.6 + 3, y * s * 1.6, z * s * 1.6, 4) - 0.45) * T.ridges * 0.35;
                let floor = 0, rim = 0;
                for (let k = 0; k < craters.length; k++) {
                    const c = craters[k];
                    const d = Math.acos(U.clamp(x * c.x + y * c.y + z * c.z, -1, 1));
                    if (d < c.r * 1.25) {
                        const u = d / c.r;
                        n -= u < 1 ? c.d * (1 - u * u) * 0.6 : 0;
                        const rr = u >= 0.85 && u < 1.25 ? (1 - Math.abs(u - 1.05) / 0.2) : 0;
                        n += c.d * 0.25 * rr;   // the rim
                        if (u < 1) floor = Math.max(floor, 1 - u * u);
                        rim = Math.max(rim, rr);
                    }
                }
                h = U.clamp(n, 0, 1);
                if (sea >= 0 && h < sea) {
                    const depth = h / Math.max(0.01, sea);
                    col = U.mix([P.sea[0] * 0.55, P.sea[1] * 0.55, P.sea[2] * 0.6], P.sea, Math.pow(depth, 1.6));
                    if (glowSea) {
                        const flick = 0.65 + 0.35 * N(x * 12, y * 12, z * 12);
                        const g = lava ? flick * (0.55 + 0.45 * depth) : flick * 0.35;
                        glow = [P.sea[0] * g, P.sea[1] * g, P.sea[2] * g];
                    }
                    // Shallow water near the shore is lighter.
                    if (!glowSea && depth > 0.88) col = U.mix(col, U.mix(P.sea, [0.8, 0.9, 0.95], 0.35), (depth - 0.88) / 0.12);
                } else {
                    const t = sea >= 0 ? (h - sea) / Math.max(0.01, 1 - sea) : h;
                    col = grad(U.clamp(t * 1.15, 0, 1));
                    const v = 0.9 + N(x * 18, y * 18, z * 18) * 0.12;
                    col = [col[0] * v, col[1] * v, col[2] * v];
                    if (desert) {
                        const dune = 0.5 + 0.5 * Math.sin(Math.atan2(z, -x) * 60 + N.fbm(x * 4, y * 4, z * 4, 3) * 9 + lat * 20);
                        col = U.mix(col, P.high, dune * 0.15);
                    }
                    if (crystal) {
                        const vein = N.ridged(x * 6, y * 6, z * 6, 3);
                        if (vein > 0.62) {
                            const k = U.smooth((vein - 0.62) / 0.2);
                            col = U.mix(col, P.peak, k * 0.7);
                            glow = [P.high[0] * k * 0.55, P.high[1] * k * 0.55, P.high[2] * k * 0.55];
                        }
                    }
                    if (lava) {
                        const crack = N.ridged(x * 5 + 1, y * 5, z * 5, 3);
                        if (crack > 0.7) {
                            const k = U.smooth((crack - 0.7) / 0.15);
                            const lc = U.hex('#ff7a2a');
                            glow = [lc[0] * k * 0.8, lc[1] * k * 0.8, lc[2] * k * 0.8];
                            col = U.mix(col, lc, k * 0.5);
                        }
                    }
                    if (cityCol) {
                        const area = N.fbm(x * 3 + 7, y * 3, z * 3, 3);
                        if (area > 0.05) {
                            const dots = N(x * 90, y * 90, z * 90);
                            if (dots > 0.35) city = U.clamp((dots - 0.35) * 3 * U.smooth((area - 0.05) / 0.2), 0, 1);
                        }
                    }
                }
                // Each terrain style's own look.
                if (!(sea >= 0 && h < sea)) {
                    if (floor > 0) col = U.mix(col, [col[0] * 0.6, col[1] * 0.6, col[2] * 0.62], floor * 0.75);
                    if (rim > 0) col = U.mix(col, U.mix(col, [1, 1, 1], 0.35), rim * 0.6);
                    if (style === 'volcanoes' && floor > 0.55) {
                        const k = U.smooth((floor - 0.55) / 0.3);
                        col = U.mix(col, LAVA, k * 0.8);
                        glow = [Math.max(glow[0], LAVA[0] * k), Math.max(glow[1], LAVA[1] * k * 0.9), Math.max(glow[2], LAVA[2] * k * 0.8)];
                    }
                    if (style === 'geodes' && floor > 0.25) {
                        const k = U.smooth((floor - 0.25) / 0.4);
                        col = U.mix(col, P.peak, k * 0.8);
                        glow = [P.high[0] * k * 0.6, P.high[1] * k * 0.6, P.high[2] * k * 0.6];
                    }
                    if (style === 'canyons') {
                        const cv = N.ridged(x * 3.4 + 5, y * 3.4, z * 3.4, 3);
                        if (cv > 0.78) {
                            const k = U.smooth((cv - 0.78) / 0.14);
                            col = U.mix(col, [col[0] * 0.38, col[1] * 0.3, col[2] * 0.28], k * 0.9);
                        }
                    }
                    if (style === 'mesas') {
                        const tt = U.clamp(h * 6, 0, 6), fr = tt - Math.floor(tt);
                        col = fr < 0.14 ? [col[0] * 0.66, col[1] * 0.6, col[2] * 0.56] : U.mix(col, P.peak, Math.floor(tt) * 0.05);
                    }
                    if (style === 'salt') {
                        const sn = N(x * 4 + 11, y * 4, z * 4);
                        if (sn > 0.05) col = U.mix(col, [0.96, 0.96, 0.93], U.smooth((sn - 0.05) / 0.2) * 0.9);
                    }
                    if (style === 'cracked' && !lava) {
                        const cr = N.ridged(x * 7 + 2, y * 7, z * 7, 3);
                        if (cr > 0.8) col = U.mix(col, [P.low[0] * 0.55, P.low[1] * 0.6, P.low[2] * 0.75], U.smooth((cr - 0.8) / 0.12) * 0.85);
                    }
                    if (style === 'glaciers') {
                        const st2 = 0.5 + 0.5 * Math.sin(lat * 40 + N.fbm(x * 3, y * 3, z * 3, 3) * 6);
                        col = U.mix(col, [0.92, 0.96, 1], st2 * 0.3);
                    }
                    if (style === 'swamp' || style === 'bubbles') {
                        const b = N(x * (style === 'bubbles' ? 22 : 9), y * (style === 'bubbles' ? 22 : 9), z * (style === 'bubbles' ? 22 : 9));
                        if (b > 0.42) {
                            const k = U.smooth((b - 0.42) / 0.15);
                            col = U.mix(col, P.sea, k * 0.8);
                            glow = [P.sea[0] * k * 0.45, P.sea[1] * k * 0.45, P.sea[2] * k * 0.45];
                        }
                    }
                    if (style === 'jungle') col = U.mix(col, [col[0] * 0.7, col[1] * 0.85, col[2] * 0.7], 0.4);
                }
                // Polar ice.
                const pl = Math.abs(lat) / (Math.PI / 2) + N(x * 5, y * 5, z * 5) * 0.06;
                if (pl > capLat) col = U.mix(col, [0.94, 0.97, 1], U.smooth((pl - capLat) / 0.06));
            }
            // Clouds: swirly, stretched along the latitudes.
            let cloud = 0;
            if (cloudCover > 0) {
                const cn = C.fbm(x * 2.4, y * 4.2, z * 2.4, 5) * 0.5 + 0.5 + C(x * 9, y * 16, z * 9) * 0.06;
                cloud = U.smooth((cn - (1 - cloudCover) * 0.75 - 0.18) / 0.18);
            }
            out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; out[3] = h;
            out[4] = glow[0]; out[5] = glow[1]; out[6] = glow[2]; out[7] = city; out[8] = cloud;
        };
    }

    // --- texture sets, cached by seed and size ----------------------------------------------------------

    const cache = new Map();   // key -> { tex: {map, glow, city, cloud}, refs, ready, waiters }

    function texKey(w, size) { return w.seed + '@' + size; }

    /**
     * The textures for a world at one size: { map, glow|null, city|null, cloud|null }.
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
        const city = w.civ ? new Uint8Array(W * H * 4) : null;
        const cloud = w.clouds ? new Uint8Array(W * H * 4) : null;
        e = {
            key: key, refs: 1, ready: false, waiters: onReady ? [onReady] : [],
            tex: {
                map: dataTexture(W, H, map),
                glow: glow ? dataTexture(W, H, glow) : null,
                city: city ? dataTexture(W, H, city) : null,
                cloud: cloud ? dataTexture(W, H, cloud) : null
            }
        };
        cache.set(key, e);
        const paint = painterFor(w);
        const out = new Float32Array(9);
        const cc = w.clouds ? U.hex(w.clouds.color) : [1, 1, 1];
        const lc = w.civ ? U.hex(w.civ.lights) : [1, 1, 1];
        const g8 = v => Math.round(Math.pow(U.clamp(v, 0, 1), 1 / 1.0) * 255);
        const job = {
            w: W, h: H, row: 0,
            paint: function (y0, y1) {
                for (let y = y0; y < y1; y++) {
                    const lat = ((y + 0.5) / H - 0.5) * Math.PI;
                    const cl = Math.cos(lat), sl = Math.sin(lat);
                    for (let x = 0; x < W; x++) {
                        const lon = (x / W) * Math.PI * 2;
                        paint(-Math.cos(lon) * cl, sl, Math.sin(lon) * cl, out);
                        const o = (y * W + x) * 4;
                        map[o] = g8(out[0]); map[o + 1] = g8(out[1]); map[o + 2] = g8(out[2]); map[o + 3] = 255;
                        if (glow) { glow[o] = g8(out[4]); glow[o + 1] = g8(out[5]); glow[o + 2] = g8(out[6]); glow[o + 3] = 255; }
                        if (city) { const c = out[7]; city[o] = g8(lc[0] * c); city[o + 1] = g8(lc[1] * c); city[o + 2] = g8(lc[2] * c); city[o + 3] = g8(c); }
                        if (cloud) { cloud[o] = g8(cc[0]); cloud[o + 1] = g8(cc[1]); cloud[o + 2] = g8(cc[2]); cloud[o + 3] = g8(out[8]); }
                    }
                }
            },
            done: function () {
                e.ready = true;
                ['map', 'glow', 'city', 'cloud'].forEach(k => { if (e.tex[k]) e.tex[k].needsUpdate = true; });
                const ws = e.waiters; e.waiters = [];
                ws.forEach(f => { try { f(e.tex); } catch (err) { console.warn('[NSE] texture ready', err); } });
            }
        };
        e.job = job;
        if (urgent) jobs.unshift(job); else jobs.push(job);
        return e;
    }

    function release(e) {
        if (!e) return;
        e.refs--;
        if (e.refs > 0) return;
        // Keep a few spare painted sets around for a quick return; drop the oldest unused ones.
        let unused = 0;
        cache.forEach(x => { if (x.refs <= 0) unused++; });
        if (unused <= 24) return;
        for (const [k, x] of cache) {
            if (x.refs > 0) continue;
            if (x.job) x.job.cancelled = true;
            ['map', 'glow', 'city', 'cloud'].forEach(t => { if (x.tex[t]) x.tex[t].dispose(); });
            cache.delete(k);
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

    // --- custom shells: atmosphere rim and city lights ------------------------------------------------

    const ATMO_VERT = [
        'varying vec3 vN;',
        'varying vec3 vV;',
        'varying vec3 vW;',
        'void main() {',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vW = wp.xyz;',
        '  vN = normalize(mat3(modelMatrix) * normal);',
        '  vV = normalize(cameraPosition - wp.xyz);',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
    ].join('\n');

    const ATMO_FRAG = [
        'uniform vec3 uColor;',
        'uniform vec3 uSun;',
        'uniform float uEdge;',
        'uniform float uStrength;',
        'varying vec3 vN;',
        'varying vec3 vV;',
        'varying vec3 vW;',
        'void main() {',
        '  float d = -dot(normalize(vN), normalize(vV));',
        '  float rim = smoothstep(0.0, uEdge, d) * (1.0 - smoothstep(uEdge, 1.0, d) * 0.85);',
        '  float day = clamp(dot(normalize(vN), normalize(uSun - vW)) * 0.8 + 0.45, 0.12, 1.0);',
        '  gl_FragColor = vec4(uColor * rim * day * uStrength, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}'
    ].join('\n');

    const CITY_FRAG = [
        'uniform sampler2D uMap;',
        'uniform vec3 uSun;',
        'varying vec3 vN;',
        'varying vec3 vW;',
        'varying vec2 vUv;',
        'void main() {',
        '  vec4 c = texture2D(uMap, vUv);',
        '  float night = smoothstep(0.12, -0.22, dot(normalize(vN), normalize(uSun - vW)));',
        '  gl_FragColor = vec4(c.rgb * night * 1.6, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}'
    ].join('\n');

    const CITY_VERT = [
        'varying vec3 vN;',
        'varying vec3 vW;',
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vW = wp.xyz;',
        '  vN = normalize(mat3(modelMatrix) * normal);',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
    ].join('\n');

    function atmosphereShell(radius, w) {
        const k = 1 + Math.max(0.06, w.atmosphere.thickness) * 1.6;
        const edge = Math.sqrt(1 - 1 / (k * k));
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(w.atmosphere.color) },
                uSun: { value: new THREE.Vector3() },
                uEdge: { value: edge },
                uStrength: { value: w.type === 'gas' ? 1.0 : 1.25 }
            },
            vertexShader: ATMO_VERT,
            fragmentShader: ATMO_FRAG,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const seg = Math.max(24, SEGMENTS[quality] >> 1);
        const m = new THREE.Mesh(new THREE.SphereGeometry(radius * k, seg, seg >> 1), mat);
        m.renderOrder = 2;
        return m;
    }

    function cityShell(radius, tex) {
        const mat = new THREE.ShaderMaterial({
            uniforms: { uMap: { value: tex }, uSun: { value: new THREE.Vector3() } },
            vertexShader: CITY_VERT,
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

    function ringMesh(w) {
        const R = w.rings, seg = quality === 'low' ? 64 : 128;
        const g = new THREE.RingGeometry(R.inner, R.outer, seg, 1);
        // Radial texture coordinate: u runs from the inner edge to the outer edge.
        const pos = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
            const rr = Math.hypot(pos.getX(i), pos.getY(i));
            uv.setXY(i, (rr - R.inner) / (R.outer - R.inner), 0.5);
        }
        const S = 256, d = new Uint8Array(S * 4 * 4);
        const N = U.noise3(U.hash('rings', w.seed));
        const base = U.hex(R.color);
        for (let x = 0; x < S; x++) {
            const t = x / (S - 1);
            const band = 0.55 + 0.45 * N(t * 40, 0.3, 0.7) + 0.25 * N(t * 140, 1.1, 0.2);
            const gap = Math.abs(t - 0.62) < 0.035 ? 0.12 : 1;   // a dark gap, like Saturn's
            const edge = U.smooth(t / 0.08) * U.smooth((1 - t) / 0.1);
            const a = U.clamp(band * gap * edge, 0, 1);
            const shade = 0.75 + 0.35 * N(t * 25, 2.2, 0.1);
            for (let row = 0; row < 4; row++) {
                const o = (row * S + x) * 4;
                d[o] = Math.round(U.clamp(base[0] * shade, 0, 1) * 255);
                d[o + 1] = Math.round(U.clamp(base[1] * shade, 0, 1) * 255);
                d[o + 2] = Math.round(U.clamp(base[2] * shade, 0, 1) * 255);
                d[o + 3] = Math.round(a * 220);
            }
        }
        const tex = new THREE.DataTexture(d, S, 4, THREE.RGBAFormat);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: new THREE.Color(R.color), emissiveIntensity: 0.18, emissiveMap: tex });
        const m = new THREE.Mesh(g, mat);
        m.rotation.x = -Math.PI / 2 + R.tilt;
        m.renderOrder = 3;
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
        const geo = new THREE.SphereGeometry(w.radius, seg, seg >> 1);
        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const surface = new THREE.Mesh(geo, mat);
        surface.name = 'surface';
        tiltGroup.add(surface);
        let cloudMesh = null, cityMesh = null, atmo = null, rings = null;
        const held = [];
        let disposed = false;
        let level = -1;

        function apply(tex, lv) {
            if (disposed || lv < level) return;
            level = lv;
            mat.map = tex.map;
            mat.color.set(0xffffff);
            if (tex.glow) { mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = tex.glow; mat.emissiveIntensity = 1; }
            mat.needsUpdate = true;
            if (tex.cloud) {
                if (!cloudMesh) {
                    const cm = new THREE.MeshLambertMaterial({ map: tex.cloud, transparent: true, depthWrite: false });
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
        held.push(textures(w, sizes[0], t => apply(t, 0), true));
        held.push(textures(w, sizes[1], t => apply(t, 1), !!o.orbit));
        if (o.orbit && sizes[2] > sizes[1]) held.push(textures(w, sizes[2], t => apply(t, 2), false));

        if (w.atmosphere) { atmo = atmosphereShell(w.radius, w); atmo.name = 'atmosphere'; group.add(atmo); }
        if (w.rings) { rings = ringMesh(w); rings.name = 'rings'; tiltGroup.add(rings); }

        const sunWorld = new THREE.Vector3();
        return {
            group: group,
            world: w,
            surface: surface,
            /** Paint the extra-detailed map too (when this world becomes the one orbited). */
            detail: function () {
                if (disposed || held.length > 2 || !(sizes[2] > sizes[1])) return;
                held.push(textures(w, sizes[2], t => apply(t, 2), true));
            },
            update: function (dt, sun) {
                surface.rotation.y += w.spin * dt;
                if (cloudMesh) cloudMesh.rotation.y += w.spin * dt * 1.25;
                if (cityMesh) cityMesh.rotation.y = surface.rotation.y;
                if (sun) {
                    sunWorld.set(sun.x, sun.y, sun.z);
                    if (atmo) atmo.material.uniforms.uSun.value.copy(sunWorld);
                    if (cityMesh) cityMesh.material.uniforms.uSun.value.copy(sunWorld);
                }
            },
            dispose: function () {
                disposed = true;
                group.traverse(function (n) {
                    if (n.geometry) n.geometry.dispose();
                    if (n.material) {
                        // Painted maps belong to the cache; the ring texture is ours.
                        if (n === rings && n.material.map) n.material.map.dispose();
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
        _cacheSize: function () { return cache.size; }
    };
})();
