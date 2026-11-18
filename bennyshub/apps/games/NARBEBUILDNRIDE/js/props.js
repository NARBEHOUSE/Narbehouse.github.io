/**
 * NARBE Build n Ride - the scenery props: trees, bushes, rocks, animals, houses.
 *
 * Each kind is a few LAYERS, each one merged geometry (base at y = 0, about
 * life size at scale 1) with a ROLE that says how it is coloured:
 *   fixed     its own vertex colours (trunks, rocks, cows, houses)
 *   leaf, pine, bush, grass, flowers
 *             white-ish geometry tinted per instance from BNR.Biomes.FOLIAGE,
 *             so a season change only rewrites instance colours
 *   snowcap   white, shown only in winter
 *   glass     windows: dark by day, lit warm at night
 * js/terrain.js instances them per chunk: one InstancedMesh per kind and layer.
 *
 * radius: how far the prop keeps from the track centre line (plus the track's own clearance).
 * Cows, sheep and deer come from js/animals.js.
 * landmark: placed only where a route's world lists it (world.def.landmarks), never scattered.
 * lot: houses and buildings stand one per lot of this size (default 13).
 */

window.BNR = window.BNR || {};

BNR.Props = (function () {
    'use strict';

    const cache = {};

    function B() { return BNR.Geo.builder(); }

    const DEFS = {
        oak: {
            radius: 2.6, scale: [0.85, 1.35],
            layers: [
                ['fixed', b => { b.shape('cyl:0.2,0.3,6', 0, 1.1, 0, 1, 2.2, 1, '#86562f'); }],
                ['leaf', b => {
                    b.shape('ico', 0, 3.3, 0, 3.2, 2.7, 3.2, '#ffffff', { shade: 0.16 });
                    b.shape('ico', 1.0, 2.75, 0.45, 2.1, 1.8, 2.1, '#f1f1f1', { shade: 0.16 });
                    b.shape('ico', -0.9, 2.85, -0.35, 2.2, 1.9, 2.2, '#e9e9e9', { shade: 0.16 });
                }]
            ]
        },
        pine: {
            radius: 2.2, scale: [0.8, 1.45],
            layers: [
                ['fixed', b => { b.shape('cyl:0.16,0.22,6', 0, 0.55, 0, 1, 1.1, 1, '#7a4f2c'); }],
                ['pine', b => {
                    b.shape('cone:7', 0, 1.9, 0, 3.2, 2.4, 3.2, '#ffffff', { shade: 0.14 });
                    b.shape('cone:7', 0, 3.4, 0, 2.5, 2.1, 2.5, '#f2f2f2', { shade: 0.14 });
                    b.shape('cone:7', 0, 4.8, 0, 1.7, 1.9, 1.7, '#e8e8e8', { shade: 0.14 });
                }],
                ['snowcap', b => {
                    b.shape('cone:7', 0, 2.75, 0, 1.6, 0.75, 1.6, '#f4f8fb');
                    b.shape('cone:7', 0, 4.15, 0, 1.15, 0.7, 1.15, '#f4f8fb');
                    b.shape('cone:7', 0, 5.5, 0, 0.75, 0.65, 0.75, '#ffffff');
                }]
            ]
        },
        snowpine: {
            radius: 2.2, scale: [0.8, 1.5],
            layers: [
                ['fixed', b => {
                    b.shape('cyl:0.16,0.22,6', 0, 0.55, 0, 1, 1.1, 1, '#6e4a2c');
                    b.shape('cone:7', 0, 2.75, 0, 1.6, 0.75, 1.6, '#f4f8fb');
                    b.shape('cone:7', 0, 4.15, 0, 1.15, 0.7, 1.15, '#f4f8fb');
                    b.shape('cone:7', 0, 5.5, 0, 0.75, 0.65, 0.75, '#ffffff');
                }],
                ['pine', b => {
                    b.shape('cone:7', 0, 1.9, 0, 3.2, 2.4, 3.2, '#ffffff', { shade: 0.14 });
                    b.shape('cone:7', 0, 3.4, 0, 2.5, 2.1, 2.5, '#f2f2f2', { shade: 0.14 });
                    b.shape('cone:7', 0, 4.8, 0, 1.7, 1.9, 1.7, '#e8e8e8', { shade: 0.14 });
                }]
            ]
        },
        bush: {
            radius: 1.4, scale: [0.7, 1.3],
            layers: [['bush', b => {
                b.shape('ico', 0, 0.55, 0, 1.6, 1.15, 1.6, '#ffffff', { shade: 0.15 });
                b.shape('ico', 0.6, 0.45, 0.3, 1.1, 0.85, 1.1, '#eeeeee', { shade: 0.15 });
            }]]
        },
        flowers: {
            radius: 0.8, scale: [0.8, 1.3],
            layers: [
                ['grass', b => {
                    for (let k = 0; k < 5; k++) { const a = k * 1.3; b.shape('cone:4', Math.cos(a) * 0.35, 0.22, Math.sin(a) * 0.35, 0.18, 0.45, 0.18, '#ffffff'); }
                }],
                ['flowers', b => {
                    for (let k = 0; k < 5; k++) { const a = k * 1.3 + 0.4; b.shape('octa', Math.cos(a) * 0.38, 0.5, Math.sin(a) * 0.38, 0.3, 0.22, 0.3, '#ffffff'); }
                }]
            ]
        },
        rock: {
            radius: 1.3, scale: [0.6, 1.4], tilt: true,
            layers: [['fixed', b => {
                b.shape('dodeca', 0, 0.35, 0, 1.6, 1.0, 1.3, '#9a958d', { shade: 0.22 });
                b.shape('dodeca', 0.6, 0.2, 0.35, 0.8, 0.55, 0.7, '#8b867f', { shade: 0.22 });
            }]]
        },
        boulder: {
            radius: 2.6, scale: [0.8, 1.5], tilt: true,
            layers: [['fixed', b => {
                b.shape('dodeca', 0, 0.9, 0, 3.4, 2.4, 2.9, '#8f8a83', { shade: 0.22 });
                b.shape('dodeca', 1.3, 0.5, 0.8, 1.6, 1.2, 1.4, '#7f7a73', { shade: 0.22 });
            }]]
        },
        desertrock: {
            radius: 1.6, scale: [0.7, 1.6], tilt: true,
            layers: [['fixed', b => {
                b.shape('dodeca', 0, 0.5, 0, 2.0, 1.4, 1.6, '#c98a5d', { shade: 0.2 });
                b.shape('dodeca', 0.7, 0.3, -0.4, 1.0, 0.8, 0.9, '#b8774c', { shade: 0.2 });
            }]]
        },
        cactus: {
            radius: 1.2, scale: [0.8, 1.4],
            layers: [['fixed', b => {
                b.shape('cyl:0.32,0.36,7', 0, 1.6, 0, 1, 3.2, 1, '#4f9a4a', { shade: 0.12 });
                b.shape('sphere:7,4', 0, 3.2, 0, 0.64, 0.5, 0.64, '#5aa653');
                b.shape('cyl:0.22,0.22,6', 0.62, 1.55, 0, 1, 0.42, 1, '#4f9a4a', { rz: Math.PI / 2 });
                b.shape('cyl:0.22,0.24,6', 0.85, 2.15, 0, 1, 1.2, 1, '#4f9a4a');
                b.shape('cyl:0.2,0.2,6', -0.55, 2.0, 0, 1, 0.36, 1, '#4f9a4a', { rz: Math.PI / 2 });
                b.shape('cyl:0.2,0.22,6', -0.74, 2.45, 0, 1, 0.9, 1, '#4f9a4a');
            }]]
        },
        scrub: {
            radius: 1.0, scale: [0.6, 1.2],
            layers: [['fixed', b => {
                b.shape('ico', 0, 0.35, 0, 1.3, 0.7, 1.3, '#a19a5a', { shade: 0.2 });
                b.shape('ico', 0.4, 0.3, 0.3, 0.8, 0.55, 0.8, '#8e8a4f', { shade: 0.2 });
            }]]
        },
        reeds: {
            radius: 0.9, scale: [0.8, 1.3],
            layers: [['fixed', b => {
                for (let k = 0; k < 7; k++) {
                    const a = k * 0.9, r = 0.25 + (k % 3) * 0.12;
                    b.shape('cone:4', Math.cos(a) * r, 0.75 + (k % 2) * 0.2, Math.sin(a) * r, 0.14, 1.5 + (k % 3) * 0.3, 0.14, k % 3 ? '#6f9e45' : '#9b8b52');
                }
                b.shape('cyl:0.07,0.07,5', 0.1, 1.85, 0.05, 1, 0.45, 1, '#6b4a2e');
            }]]
        },
        haybale: {
            radius: 1.4, scale: [0.9, 1.15],
            layers: [['fixed', b => {
                b.shape('cyl:0.75,0.75,10', 0, 0.75, 0, 1, 1.5, 1, '#e3c25b', { rx: Math.PI / 2, shade: 0.1 });
            }]]
        },
        snowman: {
            radius: 1.2, scale: [0.9, 1.1], ground: true,
            layers: [['fixed', b => {
                b.shape('sphere:9,6', 0, 0.7, 0, 1.5, 1.4, 1.5, '#f7fafc');
                b.shape('sphere:9,6', 0, 1.75, 0, 1.05, 1.0, 1.05, '#f7fafc');
                b.shape('sphere:9,6', 0, 2.55, 0, 0.72, 0.7, 0.72, '#f7fafc');
                b.shape('cone:6', 0, 2.55, 0.45, 0.14, 0.45, 0.14, '#ff8a3d', { rx: Math.PI / 2 });
                b.shape('cyl:0.32,0.32,8', 0, 3.05, 0, 1, 0.42, 1, '#2b2b33');
                b.shape('cyl:0.5,0.5,8', 0, 2.85, 0, 1, 0.06, 1, '#2b2b33');
                b.box(0, 2.15, 0, 1.0, 0.18, 1.0, '#d2452f');
            }]]
        }
    };

    // Farm animals and deer (js/animals.js): each breed standing and grazing.
    [['cowH', 'holstein', false, 1], ['cowHg', 'holstein', true, 2], ['cowJ', 'jersey', false, 3], ['cowJg', 'jersey', true, 4],
        ['cowR', 'hereford', false, 5], ['cowRg', 'hereford', true, 6]].forEach(function (c) {
        DEFS[c[0]] = { radius: 3.4, scale: [0.95, 1.08], ground: true, animal: true, lite: true,
            layers: [['fixed', b => BNR.Animals.cow(b, { breed: c[1], graze: c[2], seed: c[3] })]] };
    });
    [['sheepB', 'black', false], ['sheepBg', 'black', true], ['sheepW', 'white', false], ['sheepWg', 'white', true]].forEach(function (c) {
        DEFS[c[0]] = { radius: 3.0, scale: [0.9, 1.08], ground: true, animal: true, lite: true,
            layers: [['fixed', b => BNR.Animals.sheep(b, { face: c[1], graze: c[2] })]] };
    });
    DEFS.deerB = { radius: 4, scale: [0.95, 1.05], ground: true, animal: true, lite: true, layers: [['fixed', b => BNR.Animals.deer(b, { buck: true })]] };
    DEFS.deerD = { radius: 4, scale: [0.88, 0.98], ground: true, animal: true, lite: true, layers: [['fixed', b => BNR.Animals.deer(b, { buck: false })]] };

    /** A field holds one breed (a herd), standing and grazing: the chunk picks the herd, each animal its pose. */
    const HERDS = {
        cow: [['cowH', 'cowH', 'cowHg'], ['cowJ', 'cowJg', 'cowJg'], ['cowR', 'cowRg', 'cowRg']],
        sheep: [['sheepB', 'sheepBg', 'sheepBg'], ['sheepW', 'sheepWg', 'sheepWg']],
        deer: [['deerD', 'deerD', 'deerB']]
    };

    // Houses: a few colour schemes of one cottage (walls, roof, door), facing +z.
    const HOUSES = [
        ['#f3e2c0', '#c8553d', '#7b4a2a'], ['#cfe3f5', '#5c6f87', '#3f5a7a'], ['#f6d87a', '#8a5a33', '#5d3b22'],
        ['#f2c4c0', '#7a4f72', '#7b4a2a'], ['#d9ecc9', '#3f7d5a', '#5d3b22'], ['#ffffff', '#2f5f9e', '#9e2f2f']
    ];
    HOUSES.forEach(function (h, i) {
        DEFS['house' + i] = {
            radius: 5.2, scale: [0.95, 1.15], ground: true, house: true,
            layers: [['fixed', b => {
                b.box(0, 1.6, 0, 4.4, 3.2, 3.8, h[0]);
                b.shape('prism', 0, 4.1, 0, 4.4, 1.9, 5.0, h[1], { ry: Math.PI / 2 });
                b.box(0, 0.95, 1.92, 0.95, 1.9, 0.1, h[2]);
                b.box(1.25, 4.6, -0.6, 0.55, 1.5, 0.55, '#9a6a4a');
            }], ['glass', b => {
                // Windows: their own layer, so they light up at night (terrain setNight).
                [[-1.35, 1.93], [1.35, 1.93], [-1.35, -1.93], [1.35, -1.93]].forEach(w => b.box(w[0], 1.95, w[1], 0.85, 0.8, 0.1, '#3c5a80'));
                [[-2.21, 0.6], [2.21, -0.6]].forEach(w => b.box(w[0], 1.95, w[1], 0.1, 0.8, 0.85, '#3c5a80'));
            }]]
        };
    });

    // --- city buildings ----------------------------------------------------------------------
    // A wall box, then one glass band per floor that wraps all four sides at once (cheap), with
    // corner pillars framing it, a roof edge and something on the roof. Windows glow at night.
    const BUILDINGS = [
        { w: 9, d: 9, floors: 9, wall: '#c9ced6', trim: '#8a96a8', top: 'tank' },
        { w: 10, d: 8, floors: 6, wall: '#b5583c', trim: '#7a3b2b', top: 'ac' },
        { w: 11, d: 10, floors: 4, wall: '#f1e3c4', trim: '#b9a27a', top: 'garden' },
        { w: 8, d: 10, floors: 12, wall: '#7f9db8', trim: '#4f6f8f', top: 'antenna' },
        { w: 12, d: 9, floors: 2, wall: '#e8d6b0', trim: '#c8553d', top: 'ac', shop: true },
        { w: 9, d: 11, floors: 7, wall: '#d9a35a', trim: '#8a5a33', top: 'tank' }
    ];
    BUILDINGS.forEach(function (B, i) {
        const FH = 3.1, H = B.floors * FH + 0.6;
        DEFS['building' + i] = {
            radius: Math.hypot(B.w, B.d) / 2 + 1.6, scale: [0.95, 1.06], ground: true, house: true, lot: 17,
            layers: [['fixed', b => {
                b.box(0, H / 2, 0, B.w, H, B.d, B.wall);
                [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(c => b.box(c[0] * B.w / 2, H / 2, c[1] * B.d / 2, 0.7, H + 0.1, 0.7, B.trim));
                b.box(0, H + 0.25, 0, B.w + 0.3, 0.5, B.d + 0.3, B.trim);
                b.box(0, 1.15, B.d / 2 + 0.07, 1.8, 2.3, 0.14, '#3a3a40');
                if (B.top === 'tank') {
                    b.shape('cyl:1.1,1.1,8', B.w * 0.2, H + 1.9, -B.d * 0.15, 1, 2.0, 1, '#8a6a4a');
                    b.shape('cone:8', B.w * 0.2, H + 3.3, -B.d * 0.15, 2.4, 0.8, 2.4, '#5d4030');
                    [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].forEach(l => b.box(B.w * 0.2 + l[0], H + 0.6, -B.d * 0.15 + l[1], 0.14, 0.9, 0.14, '#2b2b33'));
                } else if (B.top === 'ac') {
                    [[-0.25, 0.2], [0.2, -0.25]].forEach(a => b.box(B.w * a[0], H + 0.95, B.d * a[1], 1.6, 0.9, 1.2, '#b9bcc4'));
                } else if (B.top === 'garden') {
                    b.box(0, H + 0.62, 0, B.w - 1.2, 0.25, B.d - 1.2, '#6aa84f');
                    b.blob(-B.w * 0.2, H + 1.3, B.d * 0.15, 1.6, 1.3, 1.6, '#4caf50', { round: 0.8, segs: 1 });
                } else if (B.top === 'antenna') {
                    b.shape('cyl:0.08,0.12,5', 0, H + 3.2, 0, 1, 5.4, 1, '#d5d9df');
                    b.shape('sphere:6,4', 0, H + 6.0, 0, 0.4, 0.4, 0.4, '#e2453c');
                }
                if (B.shop) {
                    // Striped awnings over the shop windows, front and back.
                    [1, -1].forEach(sd => b.box(0, 3.0, sd * (B.d / 2 + 0.75), B.w - 1.2, 0.18, 1.5, '#e2453c', { rx: sd * 0.25 }));
                }
            }], ['glass', b => {
                for (let f = 0; f < B.floors; f++) {
                    const y = B.shop && f === 0 ? 1.4 : f * FH + 1.9;
                    const hh = B.shop && f === 0 ? 1.9 : 1.25;
                    b.box(0, y, 0, B.w + 0.14, hh, B.d + 0.14, '#3c5a80');
                }
            }]]
        };
    });

    // --- landmarks and regional buildings --------------------------------------------------
    DEFS.lighthouse = {
        radius: 7, scale: [1, 1], ground: true, landmark: true,
        layers: [['fixed', b => {
            for (let k = 0; k < 6; k++) {
                const r0 = 2.3 - k * 0.2, r1 = 2.3 - (k + 1) * 0.2;
                b.shape('cyl:' + r1.toFixed(2) + ',' + r0.toFixed(2) + ',12', 0, k * 3 + 1.5, 0, 1, 3, 1, k % 2 ? '#d2452f' : '#f6f3ec');
            }
            b.shape('cyl:2.1,2.1,12', 0, 18.2, 0, 1, 0.4, 1, '#2b2b33');
            for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; b.box(Math.cos(a) * 1.95, 18.9, Math.sin(a) * 1.95, 0.08, 1.0, 0.08, '#2b2b33'); }
            b.shape('cyl:1.25,1.25,10', 0, 21.0, 0, 1, 0.3, 1, '#2b2b33');
            b.shape('cone:12', 0, 21.95, 0, 2.6, 1.6, 2.6, '#d2452f');
            b.shape('sphere:6,4', 0, 22.9, 0, 0.45, 0.45, 0.45, '#2b2b33');
            b.box(4.2, 1.5, 0.5, 4.2, 3.0, 3.4, '#f6f3ec');
            b.shape('prism', 4.2, 3.6, 0.5, 3.8, 1.3, 4.6, '#d2452f', { ry: Math.PI / 2 });
            b.box(4.2, 1.0, 2.25, 0.9, 1.9, 0.1, '#5d3b22');
        }], ['glass', b => {
            b.shape('cyl:1.15,1.15,10', 0, 19.75, 0, 1, 2.2, 1, '#ffe9a6');
            b.box(3.0, 1.9, 2.24, 0.8, 0.8, 0.1, '#3c5a80');
        }]]
    };
    DEFS.waterfall = {
        radius: 12, scale: [1, 1], ground: true, landmark: true,
        layers: [['fixed', b => {
            // A rocky cliff, about 24 high, with water pouring down its face into a pool.
            [[-6, 6, -3, 9, 14, 8], [6, 7, -3, 9, 16, 8], [0, 15, -5, 15, 13, 9], [-3, 22, -6, 11, 7, 8], [5, 21, -6, 8, 8, 7], [-9, 3, 0, 6, 6, 6], [9, 3, 0, 6, 7, 6]].forEach(r => b.shape('dodeca', r[0], r[1], r[2], r[3], r[4], r[5], '#8f8a83', { shade: 0.2 }));
            const W = [[0, 24.5, -1.2], [0.1, 18, 0.2], [0.25, 11, 1.0], [0.3, 4, 1.7], [0.3, 0.4, 2.4]];
            for (let k = 0; k + 1 < W.length; k++) {
                const a = W[k], c = W[k + 1], wa = 1.8 + k * 0.25, wc = 1.8 + (k + 1) * 0.25;
                const col = k % 2 ? '#cfeafb' : '#e6f5fd';
                b.quad([a[0] - wa, a[1], a[2]], [c[0] - wc, c[1], c[2]], [c[0] + wc, c[1], c[2]], [a[0] + wa, a[1], a[2]], col);
                b.quad([a[0] + wa, a[1], a[2]], [c[0] + wc, c[1], c[2]], [c[0] - wc, c[1], c[2]], [a[0] - wa, a[1], a[2]], col);
            }
            b.shape('cyl:1,1,12', 0, 0.15, 4.5, 6.5, 0.3, 4.5, '#4aa3dd');
            [[-1.5, 2.4], [1.2, 2.9], [0, 3.6], [-0.4, 2.2]].forEach(f => b.blob(f[0], 0.55, f[1], 1.6, 0.8, 1.2, '#f4fafd', { round: 0.8, segs: 1 }));
        }]]
    };
    DEFS.palm = {
        radius: 2.2, scale: [0.85, 1.3],
        layers: [['fixed', b => {
            let x = 0, y = 0;
            for (let k = 0; k < 5; k++) {
                const nx = x + 0.1 + k * 0.05, ny = y + 1.15;
                b.beam([x, y, 0], [nx, ny, 0], 0.34 - k * 0.03, 0.34 - k * 0.03, k % 2 ? '#8a6a44' : '#7a5a38');
                x = nx; y = ny;
            }
            for (let k = 0; k < 6; k++) {
                const a = k / 6 * Math.PI * 2 + 0.3, ca = Math.cos(a), sa = Math.sin(a);
                const mid = [x + ca * 1.4, y + 0.55, sa * 1.4], tip = [x + ca * 2.6, y - 0.5, sa * 2.6];
                b.beam([x, y + 0.1, 0], mid, 0.55, 0.08, k % 2 ? '#3f9a4a' : '#4caf50', { roll: a });
                b.beam(mid, tip, 0.45, 0.07, k % 2 ? '#3f9a4a' : '#4caf50', { roll: a });
            }
            [[0.25, 0.1], [-0.2, 0.2], [0.05, -0.25]].forEach(c => b.shape('sphere:6,4', x + c[0], y - 0.25, c[1], 0.36, 0.36, 0.36, '#6b4a2e'));
        }]]
    };
    DEFS.adobe = {
        radius: 5, scale: [0.9, 1.15], ground: true, house: true,
        layers: [['fixed', b => {
            b.box(0, 1.5, 0, 5, 3, 4.2, '#d9a56b');
            b.box(0, 3.15, 0, 5.2, 0.3, 4.4, '#c99359');
            b.box(-1.2, 3.8, -0.8, 2.2, 1.4, 2.2, '#d9a56b');
            [-1.7, -0.6, 0.5, 1.6].forEach(x => b.box(x, 2.7, 2.3, 0.18, 0.18, 0.5, '#6b4a33'));
            b.box(0.9, 1.0, 2.12, 0.9, 2.0, 0.1, '#7a4a2a');
        }], ['glass', b => {
            b.box(-1.2, 1.6, 2.12, 0.9, 0.8, 0.1, '#3c5a80');
            b.box(-1.2, 3.85, 0.32, 0.7, 0.6, 0.1, '#3c5a80');
        }]]
    };
    DEFS.chalet = {
        radius: 5, scale: [0.9, 1.15], ground: true, house: true,
        layers: [['fixed', b => {
            b.box(0, 0.35, 0, 4.8, 0.7, 4.2, '#9aa3ab');
            b.box(0, 1.9, 0, 4.6, 2.6, 4.0, '#8a5a33');
            [0.9, 1.7, 2.5].forEach(y => b.box(0, y, 0, 4.66, 0.08, 4.06, '#6e4628'));
            b.shape('prism', 0, 4.35, 0, 4.9, 2.3, 5.6, '#f4f8fb', { ry: Math.PI / 2 });
            b.box(1.3, 4.7, -0.7, 0.6, 1.6, 0.6, '#9a6a4a');
            b.box(1.3, 5.55, -0.7, 0.75, 0.2, 0.75, '#f4f8fb');
            b.box(0, 1.05, 2.02, 0.95, 1.7, 0.1, '#5d3b22');
        }], ['glass', b => {
            [[-1.4, 2.03], [1.4, 2.03], [-1.4, -2.03], [1.4, -2.03]].forEach(w => b.box(w[0], 2.0, w[1], 0.8, 0.75, 0.1, '#3c5a80'));
            b.box(0, 3.55, 2.06, 0.7, 0.6, 0.1, '#3c5a80');
        }]]
    };

    DEFS.windmill = {
        radius: 7, scale: [1, 1], ground: true, landmark: true,
        layers: [['fixed', b => {
            b.shape('cyl:2.0,2.8,8', 0, 4.5, 0, 1, 9, 1, '#f1e3c4');
            b.shape('cone:8', 0, 10.4, 0, 4.8, 3.0, 4.8, '#8a3b2b');
            b.box(0, 1.1, 2.55, 1.0, 2.2, 0.2, '#6b4a33');
            [[0, 5.5, 2.3], [0, 3.5, -2.4]].forEach(w => b.box(w[0], w[1], w[2], 0.7, 0.7, 0.2, '#33445e'));
            // The sails, on a hub over the door (still).
            b.box(0, 8.6, 2.6, 0.5, 0.5, 0.8, '#5d4030');
            for (let k = 0; k < 4; k++) {
                const a = k * Math.PI / 2 + 0.35;
                const tip = [Math.cos(a) * 6.2, 8.6 + Math.sin(a) * 6.2, 2.95];
                b.beam([0, 8.6, 2.95], tip, 0.18, 0.18, '#5d4030');
                const mid = [Math.cos(a) * 3.6, 8.6 + Math.sin(a) * 3.6, 3.0];
                b.box(mid[0], mid[1], mid[2], 1.3, 4.6, 0.08, '#f6f3ec', { rz: a - Math.PI / 2 });
            }
        }]]
    };
    DEFS.rockarch = {
        radius: 10, scale: [1, 1], ground: true, landmark: true,
        layers: [['fixed', b => {
            // A red sandstone arch: two solid legs and a span, joined and lumpy.
            const C = '#c47e55';
            [[-6.2, 5.5, 4.6, 11.5], [6.2, 6, 4.6, 12.5]].forEach(l => b.blob(l[0], l[1], 0, l[2], l[3], 4.4, C, { round: 0.45, segs: 2, shade: 0.2 }));
            b.blob(0, 12.4, 0, 17.5, 3.8, 4.2, C, { round: 0.5, segs: 2, shade: 0.2 });
            b.blob(-1, 14.3, 0.2, 10, 1.8, 3.4, '#b8774c', { round: 0.6, segs: 1, shade: 0.2 });
            [[-9, 1, 2], [9, 1.2, -1.5], [3, 0.8, 3]].forEach(r => b.shape('dodeca', r[0], r[1], r[2], 3, 2.2, 2.6, '#b8774c', { shade: 0.2 }));
        }]]
    };
    DEFS.appletree = {
        radius: 2.4, scale: [0.85, 1.05],
        layers: [
            ['fixed', b => { b.shape('cyl:0.18,0.24,6', 0, 0.9, 0, 1, 1.8, 1, '#7a4f2c'); [[0.6, 2.6, 0.4], [-0.5, 2.9, -0.3], [0.1, 3.3, 0.6], [-0.3, 2.4, 0.7]].forEach(a => b.shape('sphere:5,4', a[0], a[1], a[2], 0.28, 0.28, 0.28, '#d2452f')); }],
            ['leaf', b => { b.shape('ico', 0, 2.8, 0, 2.7, 2.2, 2.7, '#ffffff', { shade: 0.16 }); }]
        ]
    };

    /** What a biome's prop entry actually places (houses pick a colour scheme). */
    function variants(kind) {
        if (kind === 'house') return HOUSES.map((h, i) => 'house' + i);
        if (kind === 'building') return BUILDINGS.map((h, i) => 'building' + i);
        if (HERDS[kind]) return [].concat.apply([], HERDS[kind]);
        return [kind];
    }

    /**
     * A street of houses or city blocks mixes three of the six schemes (each chunk its own
     * three, so the whole town has all six): half the draw calls of all six in every chunk.
     */
    const STREETS = [[0, 1, 3], [2, 4, 5], [0, 3, 5], [1, 2, 4]];

    /** One placement: herdRoll is fixed per chunk (one breed per field), roll per animal. */
    function pick(kind, herdRoll, roll) {
        if (kind === 'house' || kind === 'building') {
            const st = STREETS[Math.floor(herdRoll * STREETS.length) % STREETS.length];
            return kind + st[Math.floor(roll * st.length) % st.length];
        }
        const H = HERDS[kind];
        if (H) { const g = H[Math.floor(herdRoll * H.length) % H.length]; return g[Math.floor(roll * g.length) % g.length]; }
        const v = variants(kind);
        return v[Math.floor(roll * v.length) % v.length];
    }

    /** The layers of a kind, built once: [{ role, geometry }]. */
    function layers(kind) {
        if (cache[kind]) return cache[kind];
        const def = DEFS[kind];
        if (!def) throw new Error('No prop ' + kind);
        cache[kind] = def.layers.map(function (l) {
            const b = B();
            b.lite = !!def.lite;   // scenery animals: lighter, as seen from the train
            l[1](b);
            return { role: l[0], geometry: b.geometry() };
        });
        return cache[kind];
    }

    function def(kind) { return DEFS[kind]; }

    return { layers: layers, def: def, variants: variants, pick: pick, KINDS: Object.keys(DEFS) };
})();
