/**
 * NARBE Space Explorer - seeded randomness, noise and small maths.
 *
 * Everything in the universe comes from a seed, so nothing has to be stored:
 * the same seed always gives the same galaxy, star, planet, moon or creature.
 * Headless (no DOM, no THREE): also runs in Node for the tests.
 */

window.NSE = window.NSE || {};

NSE.Util = (function () {
    'use strict';

    /** A 32-bit hash of any number of integers or strings (FNV-1a over their text, then mixed). */
    function hash() {
        let h = 2166136261 >>> 0;
        for (let a = 0; a < arguments.length; a++) {
            const s = String(arguments[a]);
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619) >>> 0;
            }
            h ^= 0x9e; h = Math.imul(h, 16777619) >>> 0;   // separator, so (1,23) != (12,3)
        }
        h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
        h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
        h ^= h >>> 16;
        return h >>> 0;
    }

    /**
     * A seeded random stream (mulberry32). rng() gives 0..1; the helpers give ranges,
     * integers, picks and weighted picks. Always the same sequence for the same seed.
     */
    function rng(seed) {
        let a = (seed >>> 0) || 0x1234567;
        const next = function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        next.range = (lo, hi) => lo + next() * (hi - lo);
        next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));      // inclusive
        next.pick = (list) => list[Math.floor(next() * list.length)];
        next.chance = (p) => next() < p;
        /** weighted([[value, weight], ...]) */
        next.weighted = function (pairs) {
            let total = 0;
            for (const p of pairs) total += p[1];
            let r = next() * total;
            for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
            return pairs[pairs.length - 1][0];
        };
        next.sign = () => (next() < 0.5 ? -1 : 1);
        return next;
    }

    // --- smooth value noise in 3D (seeded), for planet maps and terrain ----------------------

    function noise3(seed) {
        const perm = new Uint8Array(512);
        const r = rng(seed);
        const p = [];
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
        for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
        const val = new Float32Array(256);
        for (let i = 0; i < 256; i++) val[i] = r() * 2 - 1;
        const fade = t => t * t * (3 - 2 * t);
        const at = (x, y, z) => val[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
        function n(x, y, z) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            const xf = x - xi, yf = y - yi, zf = z - zi;
            const u = fade(xf), v = fade(yf), w = fade(zf);
            const l = (a, b, t) => a + (b - a) * t;
            return l(
                l(l(at(xi, yi, zi), at(xi + 1, yi, zi), u), l(at(xi, yi + 1, zi), at(xi + 1, yi + 1, zi), u), v),
                l(l(at(xi, yi, zi + 1), at(xi + 1, yi, zi + 1), u), l(at(xi, yi + 1, zi + 1), at(xi + 1, yi + 1, zi + 1), u), v),
                w);
        }
        /** Fractal sum, about -1..1. */
        n.fbm = function (x, y, z, octaves, lacunarity, gain) {
            octaves = octaves || 4; lacunarity = lacunarity || 2; gain = gain || 0.5;
            let sum = 0, amp = 1, norm = 0, f = 1;
            for (let o = 0; o < octaves; o++) {
                sum += n(x * f + o * 17.3, y * f - o * 9.1, z * f + o * 5.7) * amp;
                norm += amp; amp *= gain; f *= lacunarity;
            }
            return sum / norm;
        };
        /** Ridged fractal, 0..1 (mountain ridges, crystal veins). */
        n.ridged = function (x, y, z, octaves) {
            octaves = octaves || 4;
            let sum = 0, amp = 0.5, f = 1, norm = 0;
            for (let o = 0; o < octaves; o++) {
                const v = 1 - Math.abs(n(x * f, y * f, z * f));
                sum += v * v * amp; norm += amp; amp *= 0.5; f *= 2.03;
            }
            return sum / norm;
        };
        return n;
    }

    // --- maths --------------------------------------------------------------------------------

    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const ease = t => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    /** Frame-rate independent approach: k per second. */
    const approach = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

    /** "#rrggbb" <-> [r,g,b] 0..1, and mixing. */
    function hex(c) {
        const h = c.replace('#', '');
        return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
    }
    function toHex(rgb) {
        return '#' + rgb.map(v => ('0' + Math.round(clamp(v, 0, 1) * 255).toString(16)).slice(-2)).join('');
    }
    function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
    /** HSL (h 0..360, s, l 0..1) to [r,g,b]. */
    function hsl(h, s, l) {
        h = ((h % 360) + 360) % 360 / 360;
        const f = k => { const n = (k + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(n - 3, 9 - n, 1)); };
        return [f(0), f(8), f(4)];
    }

    /** [r,g,b] 0..1 to [h 0..360, s, l]. */
    function toHsl(c) {
        const r = c[0], g = c[1], b = c[2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        if (mx === mn) return [0, 0, l];
        const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [h * 60, s, l];
    }
    /** A colour turned round the colour wheel by dh degrees, saturation and lightness scaled. */
    function shiftHex(hexc, dh, ks, kl) {
        const h = toHsl(hex(hexc));
        return toHex(hsl(h[0] + dh, clamp(h[1] * ks, 0, 1), clamp(h[2] * kl, 0.03, 0.97)));
    }

    function roman(n) {
        const R = [['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
        let s = '';
        for (const [sym, v] of R) while (n >= v) { s += sym; n -= v; }
        return s;
    }

    /** Spoken numbers read better rounded: 0.84 -> "0.8", 12.3 -> "12". */
    function nice(v) { return Math.abs(v) >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10); }

    function plural(n, word, many) { return n + ' ' + (n === 1 ? word : (many || word + 's')); }

    return {
        hash: hash, rng: rng, noise3: noise3,
        clamp: clamp, lerp: lerp, smooth: smooth, ease: ease, approach: approach,
        hex: hex, toHex: toHex, mix: mix, hsl: hsl, toHsl: toHsl, shiftHex: shiftHex, roman: roman, nice: nice, plural: plural
    };
})();
