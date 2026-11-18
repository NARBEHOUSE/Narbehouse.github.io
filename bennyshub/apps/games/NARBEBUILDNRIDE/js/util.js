/**
 * NARBE Build n Ride - small shared helpers: seeded random numbers, smooth
 * noise and maths. No three.js and no DOM, so it runs in Node too.
 */

window.BNR = window.BNR || {};

BNR.Util = (function () {
    'use strict';

    const TAU = Math.PI * 2;

    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function smoothstep(a, b, x) {
        const t = clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    }
    /** Frame-rate independent easing toward a target: rate is "per second". */
    function damp(current, target, rate, dt) { return current + (target - current) * (1 - Math.exp(-rate * dt)); }
    /** Shortest signed difference b - a between two angles (radians). */
    function angleDiff(a, b) {
        let d = (b - a) % TAU;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        return d;
    }
    function dampAngle(current, target, rate, dt) { return current + angleDiff(current, target) * (1 - Math.exp(-rate * dt)); }

    /** A small fast seeded random number generator: returns a function giving [0, 1). */
    function mulberry(seed) {
        let a = seed | 0;
        return function () {
            a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    /** A repeatable hash of two integers and a seed, in [0, 1). */
    function hash2(x, z, seed) {
        let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul((seed | 0) + 0x3c6ef372, 0x9e3779b1);
        h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }

    /** Smooth value noise in [-1, 1] on a unit grid (quintic fade, so no creases). */
    function noise(x, z, seed) {
        const xi = Math.floor(x), zi = Math.floor(z);
        const xf = x - xi, zf = z - zi;
        const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
        const v = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
        const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
        const c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
        return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
    }

    /** Fractal noise: several octaves of noise(), in roughly [-1, 1]. */
    function fbm(x, z, seed, octaves) {
        octaves = octaves || 4;
        let sum = 0, amp = 1, freq = 1, norm = 0;
        for (let i = 0; i < octaves; i++) {
            sum += amp * noise(x * freq + i * 17.13, z * freq - i * 9.71, seed + i * 101);
            norm += amp;
            amp *= 0.5;
            freq *= 2.03;
        }
        return sum / norm;
    }

    /** Ridged noise for mountains: sharp crests, in [0, 1]. */
    function ridged(x, z, seed, octaves) {
        octaves = octaves || 4;
        let sum = 0, amp = 1, freq = 1, norm = 0, weight = 1;
        for (let i = 0; i < octaves; i++) {
            let n = 1 - Math.abs(noise(x * freq + i * 31.7, z * freq + i * 11.3, seed + i * 211));
            n *= n;
            n *= weight;
            weight = clamp(n * 1.6, 0, 1);
            sum += n * amp;
            norm += amp;
            amp *= 0.5;
            freq *= 2.1;
        }
        return sum / norm;
    }

    /** Distance from point p to segment ab in 2D; also returns t along ab. */
    function segDist(px, pz, ax, az, bx, bz) {
        const dx = bx - ax, dz = bz - az;
        const L2 = dx * dx + dz * dz || 1e-9;
        const t = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1);
        const qx = ax + dx * t, qz = az + dz * t;
        return { d: Math.hypot(px - qx, pz - qz), t: t };
    }

    /** Distance from a point to a polyline [[x, z], ...]; returns { d, i, t }. */
    function polyDist(px, pz, pts) {
        let best = { d: Infinity, i: 0, t: 0 };
        for (let i = 0; i + 1 < pts.length; i++) {
            const r = segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
            if (r.d < best.d) best = { d: r.d, i: i, t: r.t };
        }
        return best;
    }

    function pick(rand, list) { return list[Math.floor(rand() * list.length) % list.length]; }

    /** Parse '#rrggbb' to [r, g, b] in 0..1 (sRGB). */
    function hexRGB(hex) {
        const h = String(hex).replace('#', '');
        return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
    }
    function mixRGB(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

    return {
        TAU: TAU,
        clamp: clamp,
        lerp: lerp,
        smoothstep: smoothstep,
        damp: damp,
        angleDiff: angleDiff,
        dampAngle: dampAngle,
        mulberry: mulberry,
        hash2: hash2,
        noise: noise,
        fbm: fbm,
        ridged: ridged,
        segDist: segDist,
        polyDist: polyDist,
        pick: pick,
        hexRGB: hexRGB,
        mixRGB: mixRGB
    };
})();
