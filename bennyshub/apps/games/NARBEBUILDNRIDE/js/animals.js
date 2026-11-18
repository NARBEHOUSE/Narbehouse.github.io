/**
 * NARBE Build n Ride - the animals, built to real proportions in low-poly.
 *
 * Every animal faces +z with its feet on y = 0, about life size (1 unit is
 * about a metre). Bodies are rounded blobs (BNR.Geo blob) so silhouettes read
 * true: a cow has its deep barrel, square hips and pin bones, a dewlap, an
 * udder and a tasselled tail, and its hind legs bend back at the hock; a sheep
 * is a woolly barrel on thin dark legs; a deer is slim and long-legged with
 * big ears, a white throat and tail flag, and the buck carries antlers.
 *
 *   BNR.Animals.cow(b, { breed: 'holstein' | 'jersey' | 'hereford', graze, seed })
 *   BNR.Animals.sheep(b, { face: 'black' | 'white', graze })
 *   BNR.Animals.deer(b, { buck, part })   part: 'body' or 'leg' (one leg, pivot at its top)
 *   BNR.Animals.LEGS.deer                  where the deer's legs hang from
 *   BNR.Animals.bird(b, part)              'body' | 'wing' (a left wing; mirror it for the right)
 */

window.BNR = window.BNR || {};

BNR.Animals = (function () {
    'use strict';

    const U = BNR.Util;

    function M(x, y, z, rx, ry, rz) { return BNR.Geo.matrix(x, y, z, rx || 0, ry || 0, rz || 0, 1, 1, 1); }

    // --- cows -------------------------------------------------------------------------------

    const BREEDS = {
        holstein: { coat: '#f3f0e8', patch: '#24211e', legs: '#f3f0e8', muzzle: '#cfa29a', head: 'blaze', tuft: '#f3f0e8' },
        jersey: { coat: '#b8875a', patch: '#9a6b42', legs: '#7e5a3b', muzzle: '#2f2a27', head: 'dark', tuft: '#2f2a27' },
        hereford: { coat: '#8c3b22', patch: '#8c3b22', legs: '#f1ebe0', muzzle: '#e8c7bd', head: 'white', tuft: '#f1ebe0', belly: '#f1ebe0' }
    };

    function cow(b, o) {
        o = o || {};
        const br = BREEDS[o.breed] || BREEDS.holstein;
        const seed = o.seed || 1;
        // Coat: Holstein patches come from smooth noise over the body; others are plain with a pale belly.
        const coat = function (cx, cy, cz) {
            if (br.belly && cy < -0.55) return br.belly;
            if (o.breed === 'hereford' && cz > 0.75) return br.belly;          // white on the chest front
            if (br.patch === br.coat) return br.coat;
            // Patches about half the coat, never one solid side.
            const n = U.noise(cx * 1.7 + seed * 7.1, cz * 2.4 + cy * 1.3 + seed * 3.3, seed) + 0.35 * U.noise(cz * 4.1 + seed, cy * 3.7 - cx * 2.2, seed + 9);
            return n > 0.12 ? br.patch : br.coat;
        };
        const seg = { segs: 3, round: 0.62 };
        b.blob(0, 1.03, -0.1, 0.86, 0.82, 1.95, coat, seg);                                         // barrel
        b.blob(0, 1.1, -0.84, 0.84, 0.72, 0.62, coat, { segs: 2, round: 0.5 });                   // square hips
        b.blob(0, 1.06, 0.62, 0.8, 0.84, 0.62, coat, { segs: 2, round: 0.55 });                   // shoulders
        b.blob(0, 0.8, 0.82, 0.42, 0.44, 0.36, coat, { segs: 2, round: 0.7 });                    // brisket
        [-1, 1].forEach(s => b.blob(s * 0.32, 1.42, -0.72, 0.18, 0.14, 0.24, br.legs === br.coat ? br.coat : coat(s, 1, -1), { round: 0.7 }));  // pin bones
        // Udder and teats.
        b.blob(0, 0.62, -0.44, 0.44, 0.24, 0.42, '#e8b4ad', { round: 0.8 });
        if (!b.lite) [[-0.1, -0.36], [0.1, -0.36], [-0.1, -0.54], [0.1, -0.54]].forEach(t => b.shape('cyl:0.035,0.03,5', t[0], 0.47, t[1], 1, 0.1, 1, '#e3a39b'));
        // Neck and head (lowered to the grass when grazing).
        const g = !!o.graze;
        b.blob(0, g ? 0.86 : 1.16, g ? 1.12 : 1.02, 0.46, 0.56, 0.62, coat, { segs: 2, round: 0.6, rx: g ? 0.95 : 0.35 });
        const H = g ? M(0, 0.42, 1.45, 1.25) : M(0, 1.06, 1.42, 0.78);
        const headCol = function (cx, cy, cz) {
            if (br.head === 'white') return '#f1ebe0';
            if (br.head === 'dark') return '#7e5a3b';
            return (cz > 0.4 && Math.abs(cx) < 0.45) || cy < -0.6 ? '#f3f0e8' : '#24211e';   // Holstein: black head, white blaze
        };
        b.blob(0, 0, 0, 0.36, 0.42, 0.62, headCol, { segs: 2, liteSegs: 2, round: 0.55, taper: 0.88, m: H });
        b.blob(0, -0.03, 0.34, 0.37, 0.3, 0.2, br.muzzle, { round: 0.7, m: H });
        [-1, 1].forEach(function (s) {
            if (!b.lite) {
                b.box(s * 0.08, 0.0, 0.44, 0.05, 0.05, 0.03, '#2b2422', { m: H });                // nostrils
                b.box(s * 0.17, 0.09, 0.02, 0.05, 0.06, 0.06, '#1d1a18', { m: H });               // eyes
            }
            b.blob(s * 0.25, 0.16, -0.14, 0.3, 0.06, 0.15, headCol(s, 0.5, -0.5), { round: 0.6, rz: s * 0.25, m: H });   // ears
            b.shape('cone:6', s * 0.15, 0.27, -0.2, 0.07, 0.2, 0.07, '#e9dcc0', { rz: -s * 0.8, m: H });               // horns
        });
        // Legs: straight in front; behind, the thigh, then back to the hock, then down.
        [-1, 1].forEach(function (s) {
            const fx = s * 0.24, fz = 0.62;
            b.blob(fx, 0.52, fz, 0.2, 0.42, 0.24, coat(s, -0.2, 0.8), { round: 0.5 });
            if (b.lite) b.beam([fx, 0.36, fz + 0.01], [fx, 0.05, fz + 0.01], 0.13, 0.13, br.legs);
            else b.shape('cyl:0.07,0.065,6', fx, 0.2, fz + 0.01, 1, 0.34, 1, br.legs);
            b.blob(fx, 0.05, fz + 0.03, 0.17, 0.1, 0.2, '#3a332e', { round: 0.4 });
            const hx = s * 0.25, hz = -0.74;
            b.blob(hx, 0.8, hz + 0.04, 0.26, 0.5, 0.38, coat(s, -0.3, -0.8), { round: 0.55 });
            b.beam([hx, 0.62, hz - 0.02], [hx, 0.36, hz - 0.12], 0.15, 0.15, br.legs);
            b.beam([hx, 0.38, hz - 0.12], [hx, 0.08, hz - 0.02], 0.12, 0.12, br.legs);
            b.blob(hx, 0.05, hz, 0.17, 0.1, 0.2, '#3a332e', { round: 0.4 });
        });
        // Tail with its tassel.
        b.beam([0, 1.38, -1.12], [0, 0.66, -1.2], 0.06, 0.06, coat(0, 1, -1));
        b.blob(0, 0.58, -1.2, 0.12, 0.26, 0.12, br.tuft, { round: 0.6 });
    }

    // --- sheep ------------------------------------------------------------------------------

    function sheep(b, o) {
        o = o || {};
        const wool = '#efe9dc', face = o.face === 'white' ? '#e6dccb' : '#2a2522', legs = o.face === 'white' ? '#d9cdb9' : '#2a2522';
        b.blob(0, 0.72, -0.05, 0.68, 0.62, 1.06, wool, { segs: 3, round: 0.78, shade: 0.12 });
        [[0, 0.98, 0.18], [0.14, 0.95, -0.24], [-0.15, 0.96, -0.02]].forEach(p => b.blob(p[0], p[1], p[2], 0.4, 0.26, 0.4, wool, { round: 0.9, shade: 0.1 }));
        b.blob(0, 0.8, -0.58, 0.18, 0.2, 0.14, wool, { round: 0.8 });                               // tail
        const g = !!o.graze;
        if (g) b.blob(0, 0.52, 0.52, 0.36, 0.36, 0.46, wool, { round: 0.8, rx: 0.95, shade: 0.1 });   // neck reaching down
        else b.blob(0, 0.86, 0.46, 0.42, 0.44, 0.36, wool, { round: 0.8, rx: 0.2, shade: 0.1 });       // woolly neck
        const H = g ? M(0, 0.27, 0.7, 1.3) : M(0, 0.93, 0.66, 0.55);
        b.blob(0, 0, 0, 0.2, 0.26, 0.38, face, { segs: 2, round: 0.6, taper: 0.7, m: H });
        b.blob(0, 0.1, -0.12, 0.3, 0.12, 0.2, wool, { round: 0.85, m: H });                          // woolly poll
        [-1, 1].forEach(function (s) {
            b.blob(s * 0.17, 0.04, -0.06, 0.2, 0.05, 0.08, face, { round: 0.6, rz: s * 0.15, m: H });  // ears out sideways
            if (!b.lite) b.box(s * 0.09, 0.05, 0.07, 0.04, 0.04, 0.04, '#111111', { m: H });
            [0.32, -0.36].forEach(z => {
                if (b.lite) b.beam([s * 0.17, 0.48, z], [s * 0.17, 0.02, z], 0.08, 0.08, legs);
                else b.shape('cyl:0.045,0.04,5', s * 0.17, 0.24, z, 1, 0.48, 1, legs);
                b.box(s * 0.17, 0.025, z + 0.02, 0.09, 0.05, 0.11, '#1d1a18');
            });
        });
    }

    // --- deer ---------------------------------------------------------------------------------

    const DEER = { coat: '#a46a3c', belly: '#e8d3b0', white: '#f4efe6', dark: '#2b2420', antler: '#d9c7a2' };
    const DEER_LEGS = [
        { x: 0.12, y: 0.92, z: 0.42, hind: false }, { x: -0.12, y: 0.92, z: 0.42, hind: false },
        { x: 0.13, y: 0.98, z: -0.48, hind: true }, { x: -0.13, y: 0.98, z: -0.48, hind: true }
    ];

    function deerLeg(b, hind, at) {
        const m = at ? M(at.x, at.y, at.z) : null;
        const o = m ? { m: m } : {};
        if (!hind) {
            b.blob(0, -0.2, 0, 0.12, 0.4, 0.16, DEER.coat, Object.assign({ round: 0.55 }, o));
            b.beam(tf(m, [0, -0.38, 0]), tf(m, [0, -0.86, 0.01]), 0.05, 0.05, DEER.coat);
            b.blob(0, -0.88, 0.02, 0.06, 0.07, 0.1, DEER.dark, Object.assign({ round: 0.4 }, o));
        } else {
            b.blob(0, -0.18, 0.02, 0.17, 0.44, 0.26, DEER.coat, Object.assign({ round: 0.55 }, o));
            b.beam(tf(m, [0, -0.36, 0]), tf(m, [0, -0.6, -0.12]), 0.07, 0.07, DEER.coat);
            b.beam(tf(m, [0, -0.6, -0.12]), tf(m, [0, -0.94, -0.05]), 0.045, 0.045, DEER.coat);
            b.blob(0, -0.96, -0.03, 0.06, 0.07, 0.1, DEER.dark, Object.assign({ round: 0.4 }, o));
        }
    }

    function tf(m, p) {
        if (!m) return p;
        const e = m.elements;
        return [e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12], e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13], e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14]];
    }

    /** o.part: 'body' (no legs), 'leg' (one front leg) / 'hindleg', or all of it (scenery). o.flag: tail up. */
    function deer(b, o) {
        o = o || {};
        if (o.part === 'leg' || o.part === 'hindleg') { deerLeg(b, o.part === 'hindleg'); return; }
        const coat = function (cx, cy) { return cy < -0.5 ? DEER.belly : DEER.coat; };
        b.blob(0, 1.0, -0.03, 0.44, 0.54, 1.18, coat, { segs: 3, round: 0.6 });
        b.blob(0, 0.98, 0.4, 0.43, 0.6, 0.42, coat, { segs: 2, round: 0.62 });                      // chest
        b.blob(0, 1.04, -0.5, 0.44, 0.48, 0.44, coat, { segs: 2, round: 0.6 });                     // rump
        b.blob(0, 1.28, 0.6, 0.27, 0.32, 0.62, DEER.coat, { segs: 2, round: 0.6, rx: -0.9, taper: 0.7 });   // neck, held high
        const H = M(0, 1.66, 0.82, 0.45);
        b.blob(0, 0, 0, 0.2, 0.24, 0.4, DEER.coat, { segs: 2, liteSegs: 2, round: 0.6, taper: 0.62, m: H });
        b.blob(0, -0.03, 0.2, 0.09, 0.08, 0.06, DEER.dark, { round: 0.6, m: H });                    // nose
        b.blob(0, -0.11, 0.0, 0.13, 0.08, 0.18, DEER.white, { round: 0.6, m: H });                   // white throat and chin
        [-1, 1].forEach(function (s) {
            b.blob(s * 0.15, 0.13, -0.12, 0.26, 0.05, 0.13, DEER.coat, { round: 0.6, rz: s * 0.45, ry: s * 0.3, m: H });   // big ears
            if (!b.lite) b.box(s * 0.09, 0.05, 0.02, 0.04, 0.045, 0.05, '#111111', { m: H });
        });
        // Tail: brown on top, white beneath; up like a flag when running.
        const T = o.flag ? M(0, 1.22, -0.7, -1.0) : M(0, 1.12, -0.72, 0.35);
        b.blob(0, 0, 0, 0.12, 0.26, 0.08, DEER.coat, { round: 0.6, m: T });
        b.blob(0, -0.01, -0.03, 0.13, 0.24, 0.05, DEER.white, { round: 0.6, m: T });
        if (o.buck) {
            [-1, 1].forEach(function (s) {
                const p0 = [s * 0.07, 1.86, 0.74], p1 = [s * 0.2, 2.0, 0.66], p2 = [s * 0.27, 2.08, 0.8], p3 = [s * 0.2, 2.12, 0.98];
                b.beam(p0, p1, 0.04, 0.04, DEER.antler); b.beam(p1, p2, 0.035, 0.035, DEER.antler); b.beam(p2, p3, 0.03, 0.03, DEER.antler);
                [[p1, 0.17], [p2, 0.16], [[(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2, (p2[2] + p3[2]) / 2], 0.12]].forEach(function (t) {
                    b.beam(t[0], [t[0][0] - s * 0.01, t[0][1] + t[1], t[0][2] - 0.02], 0.025, 0.025, DEER.antler);
                });
            });
        }
        if (o.part !== 'body') DEER_LEGS.forEach(L => deerLeg(b, L.hind, L));
    }

    // --- birds ----------------------------------------------------------------------------------

    function bird(b, part) {
        if (part === 'wing') {
            // A swept wing, root at x = 0, tip out at +x.
            b.quad([0, 0, 0.12], [0.5, 0.02, -0.06], [0.42, 0.02, -0.16], [0, 0, -0.08], '#3a3f4a');
            b.quad([0, 0, -0.08], [0.42, 0.02, -0.16], [0.5, 0.02, -0.06], [0, 0, 0.12], '#2c3038');
            return;
        }
        b.blob(0, 0, 0, 0.14, 0.12, 0.34, '#3a3f4a', { round: 0.7 });
        b.shape('cone:4', 0, 0, 0.21, 0.05, 0.1, 0.05, '#d9a441', { rx: Math.PI / 2 });
        b.box(0, 0, -0.22, 0.14, 0.02, 0.12, '#2c3038');
    }

    return { cow: cow, sheep: sheep, deer: deer, bird: bird, BREEDS: BREEDS, LEGS: { deer: DEER_LEGS } };
})();
