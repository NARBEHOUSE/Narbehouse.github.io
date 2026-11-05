/**
 * NARBE Build n Bash - the builds, as data.
 *
 * A build is an ordered list of block specs (see js/shapes.js). One Build
 * press places the next block, so the list length IS the number of presses.
 * Builds are listed smallest to biggest; bigger means more presses, never
 * harder play.
 *
 * Add a build: append to LIST with the helpers below, then run
 *   node tests/builds.test.cjs        (counts, overlaps, floating blocks)
 *   node tools/shot.cjs build <id>    (pictures of it going up, no browser)
 *
 * Authoring rules the checker enforces:
 *  - Every block rests on the ground (y = 0) or touches a block placed
 *    BEFORE it. Builds go up in the order a person would stack them.
 *  - Blocks never overlap each other (a hair of contact is fine).
 *  - Space builds (zeroG worlds) float: the first block may hang in the air,
 *    every later block touches an earlier one.
 *  - `n` names a piece worth saying aloud as it lands ("Door", "Roof").
 *    Leave ordinary blocks unnamed so speech never becomes a drone.
 *
 * Authoring tips learned the hard way:
 *  - No build-wide base slab under a big build: everything would rest on it,
 *    so chunked destruction could only take the whole build in one go.
 *  - t: 'windows' lines up only on EVEN-sized faces (2 x 2, 2 x 4): the
 *    pattern tiles from each block's centre, so odd sizes cut windows in half.
 *  - Touching blocks may overlap by a hair at most: the physics pushes
 *    overlapping pieces apart violently once they are knocked loose.
 *  - spin: [{ ids, upright, axis, center, speed }] turns finished parts
 *    (see js/sim.js). Blocks keep their spun pose when knocking starts, so
 *    spin round an axis that keeps them inside their own slice of the build.
 */

window.BNB = window.BNB || {};

BNB.Builds = (function () {
    'use strict';

    const TIERS = { 1: 'Small', 2: 'Medium', 3: 'Large', 4: 'Huge' };

    // --- authoring kit -------------------------------------------------------------------

    /**
     * kit.add(shape, dims, x, y, z, colour, opts) places a block with its
     * BOTTOM at y (the lowest point of its rotated bounding box) and its
     * centre at x/z. kit.at(...) is the same but y is the centre. opts:
     *   r: [rx, ry, rz] degrees   t: pattern   n: spoken name
     * Both return the block's index; kit.top(i) is that block's highest y.
     */
    function author(fn) {
        const blocks = [];
        function finish(spec, y, bottom) {
            if (bottom) {
                const b = BNB.Shapes.bounds(Object.assign({}, spec, { p: [spec.p[0], 0, spec.p[2]] }));
                spec.p[1] = y - b.min[1];
            }
            blocks.push(spec);
            return blocks.length - 1;
        }
        function make(s, d, x, y, z, c, o) {
            o = o || {};
            const spec = { s: s, d: d.slice(), p: [x, y, z], c: c || 'wood' };
            if (o.r) spec.r = o.r.slice();
            if (o.t) spec.t = o.t;
            if (o.n) spec.n = o.n;
            if (o.sink) spec.sink = true;   // allowed to sink into what it stands on (a chimney in a roof)
            return spec;
        }
        const kit = {
            add: function (s, d, x, y, z, c, o) { return finish(make(s, d, x, y, z, c, o), y, true); },
            at: function (s, d, x, y, z, c, o) { return finish(make(s, d, x, y, z, c, o), y, false); },
            top: function (i) { return BNB.Shapes.bounds(blocks[i]).max[1]; },
            bottom: function (i) { return BNB.Shapes.bounds(blocks[i]).min[1]; },
            spec: function (i) { return blocks[i]; },
            count: function () { return blocks.length; }
        };
        fn(kit);
        return blocks;
    }

    // --- the builds ------------------------------------------------------------------------

    const LIST = [
        {
            id: 'house', name: 'Tiny House', tier: 1, world: 'neighborhood',
            blocks: author(function (k) {
                k.add('box', [2.4, 1.6, 1.8], 0, 0, 0, 'yellow', { n: 'Walls' });
                k.add('box', [0.62, 1.0, 0.14], 0.5, 0, 0.97, 'blue', { n: 'Door' });
                k.add('box', [0.62, 0.56, 0.12], -0.55, 0.62, 0.96, 'sky', { n: 'Window' });
                k.add('box', [0.8, 0.22, 0.3], -0.55, 0.38, 1.05, 'green', { n: 'Flower box' });
                const roof = k.add('tri', [2.9, 1.25, 2.1], 0, 1.6, 0, 'red', { n: 'Roof' });
                k.at('cyl', [0.24, 0.08], 0, 2.05, 1.07, 'white', { r: [90, 0, 0] });
                // The chimney stands on the right slope; its foot sinks into the roof.
                k.add('box', [0.38, 0.75, 0.38], -0.78, k.top(roof) - 0.74, 0.35, 'orange', { n: 'Chimney', sink: true });
            })
        },
        {
            id: 'rocket', name: 'Rocket Ship', tier: 1, world: 'barge',
            blocks: author(function (k) {
                k.add('cyl', [0.62, 1.15], 0, 0, 0, 'white');
                k.add('cyl', [0.62, 1.1], 0, 1.15, 0, 'sky', { t: 'stripes' });
                k.add('cyl', [0.62, 1.0], 0, 2.25, 0, 'white');
                k.add('wedge', [0.85, 1.35, 0.16], 1.045, 0, 0, 'red', { n: 'Fin' });
                k.add('wedge', [0.85, 1.35, 0.16], -1.045, 0, 0, 'red', { r: [0, 180, 0], n: 'Fin' });
                k.add('wedge', [0.85, 1.35, 0.16], 0, 0, 1.045, 'red', { r: [0, -90, 0], n: 'Fin' });
                k.at('cyl', [0.22, 0.1], 0, 1.7, 0.63, 'yellow', { r: [90, 0, 0], n: 'Window' });
                k.add('cone', [0.62, 1.35], 0, 3.25, 0, 'red', { n: 'Nose cone' });
            })
        },
        {
            id: 'tree', name: 'Tree', tier: 1, world: 'hill',
            blocks: author(function (k) {
                const trunk = k.add('cyl', [0.34, 1.6], 0, 0, 0, 'oak', { n: 'Trunk' });
                // A big round top over the trunk's tip, then smaller leaf balls
                // nested against its front and top (barely touching, so they
                // never fight in the physics), which reads as one leafy cloud.
                const R = 1.2, C = [0, k.top(trunk) + R - 0.32, -0.1];
                const nest = (r, dir, gap) => {
                    const l = Math.hypot(dir[0], dir[1], dir[2]), d = R + r - (gap || 0.16);
                    return [C[0] + dir[0] / l * d, C[1] + dir[1] / l * d, C[2] + dir[2] / l * d];
                };
                k.at('ball', [R], C[0], C[1], C[2], 'green', { n: 'Leaves' });
                let p = nest(0.66, [-0.75, 0.12, 0.62]);
                k.at('ball', [0.66], p[0], p[1], p[2], 'lime');
                p = nest(0.62, [0.78, 0.22, 0.56]);
                k.at('ball', [0.62], p[0], p[1], p[2], 'lime');
                p = nest(0.7, [-0.3, 0.88, 0.36]);
                k.at('ball', [0.7], p[0], p[1], p[2], 'green');
                p = nest(0.2, [0.12, -0.3, 0.95], 0.06);
                k.at('ball', [0.2], p[0], p[1], p[2], 'red', { n: 'Apple' });
            })
        },
        {
            id: 'train', name: 'Train', tier: 2, world: 'countryside',
            blocks: author(function (k) {
                // Laid along X on the track (z = 0); the engine leads at -x.
                const X = 0.45;
                // Engine
                k.add('wheels', [0.34, 1.15], X - 3.35, 0, 0, 'black', { n: 'Wheels' });
                k.add('wheels', [0.34, 1.15], X - 1.9, 0, 0, 'black');
                const chassis = k.add('box', [2.9, 0.28, 1.0], X - 2.6, 0.68, 0, 'dark');
                const deck = k.top(chassis);
                const boiler = k.add('cyl', [0.47, 1.75], X - 3.15, deck, 0, 'red', { r: [0, 0, 90], n: 'Engine' });
                const cab = k.add('box', [1.1, 1.3, 1.0], X - 1.7, deck, 0, 'red', { n: 'Cab' });
                k.add('box', [1.35, 0.16, 1.2], X - 1.7, k.top(cab), 0, 'black');
                k.add('wedge', [0.55, 0.84, 1.0], X - 4.325, 0.12, 0, 'yellow', { r: [0, 180, 0] });
                // Coal car
                k.add('wheels', [0.3, 1.15], X - 0.45, 0, 0, 'black');
                k.add('wheels', [0.3, 1.15], X + 0.55, 0, 0, 'black');
                const tender = k.add('box', [2.0, 0.75, 1.0], X + 0.05, 0.6, 0, 'yellow');
                k.add('half', [1.6, 0.8], X + 0.05, k.top(tender), 0, 'black', { n: 'Coal' });
                // Passenger car
                k.add('wheels', [0.3, 1.15], X + 1.85, 0, 0, 'black');
                k.add('wheels', [0.3, 1.15], X + 3.15, 0, 0, 'black');
                const car = k.add('box', [2.4, 0.95, 1.0], X + 2.5, 0.6, 0, 'blue');
                k.add('half', [1.25, 2.6], X + 2.5, k.top(car), 0, 'sky', { r: [0, 90, 0] });
                // Last: the smokestack, its foot sunk into the round boiler.
                k.add('cyl', [0.2, 0.75], X - 3.62, k.top(boiler) - 0.1, 0, 'black', { n: 'Smokestack', sink: true });
            })
        },
        {
            id: 'pyramid', name: 'Pyramid', tier: 2, world: 'desert', camera: { dist: 1.02 },
            blocks: author(function (k) {
                // A smooth pyramid like the ones in Egypt, every side flat and
                // made of triangles: a big square pyramid of edge 2a is four
                // small pyramids on the corners, four tetrahedra in the gaps,
                // one upside-down pyramid dropped into the middle hole, and a
                // gold capstone. It stands on a low stone platform.
                // Warm sandstone (darker than the pale dunes, so it stands out).
                const a = 2.2, h = a / Math.SQRT2, P = 0.3;
                [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(q =>
                    k.add('box', [2.7, P, 2.7], q[0] * 1.35, 0, q[1] * 1.35, 'adobe', { n: q[0] < 0 && q[1] < 0 ? 'Platform' : undefined }));
                k.add('box', [1.6, 0.15, 0.5], 0, 0, 2.95, 'adobe');
                [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(q =>
                    k.add('pyr', [a, h], q[0] * a / 2, P, q[1] * a / 2, 'tan', { n: q[0] < 0 && q[1] < 0 ? 'Pyramid' : undefined }));
                k.add('tet', [a], 0, P, -a / 2, 'limestone');
                k.add('tet', [a], -a / 2, P, 0, 'limestone', { r: [0, 90, 0] });
                k.add('tet', [a], a / 2, P, 0, 'limestone', { r: [0, 90, 0] });
                k.add('tet', [a], 0, P, a / 2, 'limestone');
                k.add('pyr', [a, h], 0, P, 0, 'tan', { r: [180, 0, 0] });
                k.add('pyr', [a, h], 0, P + h, 0, 'gold', { n: 'Capstone' });
            })
        },
        {
            id: 'bridge', name: 'Bridge', tier: 2, world: 'canyon',
            blocks: author(function (k) {
                // The river runs along Z under the middle: nothing stands at |x| < 1.6.
                k.add('box', [1.0, 1.0, 1.5], -2.1, 0, 0, 'stone', { t: 'brick', n: 'Pillar' });
                k.add('box', [1.0, 1.0, 1.5], 2.1, 0, 0, 'stone', { t: 'brick' });
                const arch = k.add('arch', [5.2, 2.0, 1.5, 1.6], 0, 1.0, 0, 'red', { n: 'Arch' });
                const road = k.add('box', [5.2, 0.22, 1.8], 0, k.top(arch), 0, 'dark', { n: 'Road' });
                const top = k.top(road);
                // Ramps down to the canyon floor at both ends.
                k.add('wedge', [1.8, top, 1.5], 3.5, 0, 0, 'oak');
                k.add('wedge', [1.8, top, 1.5], -3.5, 0, 0, 'oak', { r: [0, 180, 0] });
                const rail = k.add('box', [5.2, 0.28, 0.14], 0, top, 0.83, 'yellow');
                k.add('box', [5.2, 0.28, 0.14], 0, top, -0.83, 'yellow');
                const post = k.add('cyl', [0.08, 0.8], -2.45, k.top(rail), 0.83, 'black');
                k.add('cyl', [0.08, 0.8], 2.45, k.top(rail), 0.83, 'black');
                k.at('ball', [0.19], -2.45, k.top(post) + 0.15, 0.83, 'gold');
                k.at('ball', [0.19], 2.45, k.top(post) + 0.15, 0.83, 'gold', { n: 'Lamp' });
            })
        },
        {
            id: 'robot', name: 'Robot', tier: 3, world: 'planet',
            blocks: author(function (k) {
                k.add('box', [0.75, 0.3, 1.0], -0.5, 0, 0.1, 'navy');
                k.add('box', [0.75, 0.3, 1.0], 0.5, 0, 0.1, 'navy');
                const leg = k.add('cyl', [0.22, 1.1], -0.5, 0.3, 0, 'silver', { n: 'Legs' });
                k.add('cyl', [0.22, 1.1], 0.5, 0.3, 0, 'silver');
                const hips = k.add('box', [1.6, 0.35, 0.9], 0, k.top(leg), 0, 'dark');
                const body = k.add('box', [2.0, 1.7, 1.2], 0, k.top(hips), 0, 'blue', { n: 'Body' });
                const by = k.bottom(body), bt = k.top(body);
                // Chest panel with two buttons.
                k.at('box', [1.0, 0.7, 0.1], 0, by + 0.95, 0.65, 'yellow');
                k.at('cyl', [0.11, 0.08], -0.22, by + 0.85, 0.74, 'red', { r: [90, 0, 0] });
                k.at('cyl', [0.11, 0.08], 0.22, by + 0.85, 0.74, 'lime', { r: [90, 0, 0] });
                // Shoulders, a hanging left arm, a waving right arm.
                const sy = bt - 0.35, sx = 1.0 + 0.32 - 0.05;
                k.at('ball', [0.32], -sx, sy, 0, 'red');
                k.at('ball', [0.32], sx, sy, 0, 'red');
                const armL = k.add('cyl', [0.17, 1.1], -sx - 0.06, sy - 0.3 - 1.1, 0, 'silver');
                k.at('ball', [0.25], -sx - 0.06, k.bottom(armL) - 0.21, 0, 'red');
                const a = 30 * Math.PI / 180, ux = Math.sin(a), uy = Math.cos(a);
                k.at('cyl', [0.17, 1.1], sx + ux * 0.82, sy + uy * 0.82, 0, 'silver', { r: [0, 0, -30], n: 'Waving arm' });
                k.at('ball', [0.25], sx + ux * 1.6, sy + uy * 1.6, 0, 'red');
                const neck = k.add('cyl', [0.25, 0.2], 0, bt, 0, 'dark');
                const head = k.add('box', [1.4, 1.0, 1.05], 0, k.top(neck), 0, 'silver', { n: 'Head' });
                const hy = k.bottom(head);
                k.at('cyl', [0.17, 0.1], -0.32, hy + 0.6, 0.575, 'yellow', { r: [90, 0, 0], n: 'Eyes' });
                k.at('cyl', [0.17, 0.1], 0.32, hy + 0.6, 0.575, 'yellow', { r: [90, 0, 0] });
                k.at('box', [0.6, 0.12, 0.08], 0, hy + 0.27, 0.565, 'dark');
                k.at('cyl', [0.18, 0.16], -0.78, hy + 0.5, 0, 'red', { r: [0, 0, 90] });
                k.at('cyl', [0.18, 0.16], 0.78, hy + 0.5, 0, 'red', { r: [0, 0, 90] });
                const rod = k.add('cyl', [0.06, 0.55], 0, k.top(head), 0, 'dark');
                k.at('ball', [0.2], 0, k.top(rod) + 0.16, 0, 'red', { n: 'Antenna' });
            })
        },
        {
            id: 'pirate', name: 'Pirate Ship', tier: 3, world: 'cove',
            blocks: author(function (k) {
                // Beached on the sand along X, bow at +x. X centres it, bowsprit included.
                const X = -0.7;
                // Hull: a keel block with raked ends. The ends are lifted a hair so
                // they hang from the keel (and fall with it) instead of standing alone.
                k.add('box', [3.2, 0.7, 1.5], X, 0, 0, 'brown', { n: 'Hull' });
                k.add('wedge', [1.0, 0.64, 1.5], X + 2.1, 0.06, 0, 'brown', { r: [180, 0, 0] });
                k.add('wedge', [0.8, 0.64, 1.5], X - 2.0, 0.06, 0, 'brown', { r: [0, 0, 180] });
                const upper = k.add('box', [5.0, 0.5, 1.6], X + 0.1, 0.7, 0, 'oak');
                const deck = k.top(upper);
                // Raised bow, and the captain's cabin at the stern.
                k.add('wedge', [1.2, 0.55, 1.6], X + 2.0, deck, 0, 'brown', { r: [0, 180, 0] });
                const cabin = k.add('box', [1.5, 0.75, 1.6], X - 1.65, deck, 0, 'red');
                const roof = k.add('box', [1.7, 0.14, 1.72], X - 1.65, k.top(cabin), 0, 'gold');
                [-0.9, 0, 0.9].forEach(x => k.at('cyl', [0.13, 0.08], X + x, 0.36, 0.79, 'gold', { r: [90, 0, 0] }));
                k.at('cyl', [0.12, 0.4], X - 0.25, 0.95, 1.0, 'black', { r: [90, 0, 0], n: 'Cannon' });
                k.at('cyl', [0.12, 0.4], X + 0.85, 0.95, 1.0, 'black', { r: [90, 0, 0] });
                k.add('box', [0.32, 0.1, 0.9], X + 0.3, deck - 0.1, 1.25, 'wood', { n: 'Plank' });
                k.at('cyl', [0.14, 0.08], X - 2.0, deck + 0.4, 0.84, 'yellow', { r: [90, 0, 0] });
                k.at('cyl', [0.14, 0.08], X - 1.3, deck + 0.4, 0.84, 'yellow', { r: [90, 0, 0] });
                // Bowsprit, pointing up and out from the bow.
                const a = 65 * Math.PI / 180;
                k.at('cyl', [0.08, 1.5], X + 2.6 + Math.sin(a) * 0.75, deck + 0.38 + Math.cos(a) * 0.75, 0, 'oak', { r: [0, 0, -65] });
                const chest = k.add('box', [0.62, 0.4, 0.44], X - 0.45, deck, 0.3, 'brown', { n: 'Treasure' });
                k.add('half', [0.62, 0.44], X - 0.45, k.top(chest), 0.3, 'gold');
                // Main mast, sails hung in front of it, crow's nest.
                const MX = X + 0.45;
                const mast = k.add('cyl', [0.13, 3.0], MX, deck, 0, 'oak', { n: 'Mast' });
                k.add('box', [2.2, 1.15, 0.1], MX, deck + 0.8, 0.18, 'red', { t: 'stripes', n: 'Sail' });
                k.add('box', [1.7, 0.85, 0.1], MX, deck + 2.05, 0.18, 'red', { t: 'stripes' });
                const nest = k.add('cyl', [0.3, 0.28], MX, k.top(mast), 0, 'brown');
                // Little mast on the cabin, and a lantern at the stern.
                const miz = k.add('cyl', [0.09, 1.5], X - 1.95, k.top(roof), 0, 'oak');
                k.add('box', [1.0, 0.8, 0.1], X - 1.95, k.top(roof) + 0.45, 0.14, 'white');
                const post = k.add('cyl', [0.06, 0.42], X - 2.3, k.top(roof), 0.62, 'black');
                k.at('ball', [0.15], X - 2.3, k.top(post) + 0.11, 0.62, 'yellow');
                // Top mast and the pirate flag.
                const top = k.add('cyl', [0.08, 0.85], MX, k.top(nest), 0, 'oak');
                k.at('box', [0.8, 0.5, 0.1], MX + 0.08 + 0.4, k.top(top) - 0.3, 0, 'black', { n: 'Flag' });
            })
        },
        {
            id: 'city', name: 'City Block', tier: 3, world: 'city',
            blocks: author(function (k) {
                // No base slab: everything resting on one slab would make the
                // whole block fall as a single chunk.
                const g = 0;
                // Towers are stacks of 2-unit cubes, so the windows line up.
                // Short (left), tall (middle, set back), medium (right) rise together.
                const T = [{ x: -3.3, z: -0.2, c: 'yellow', n: 1 }, { x: 0, z: -0.7, c: 'sky', n: 3 }, { x: 3.3, z: -0.2, c: 'orange', n: 2 }];
                T.forEach(t => { t.y = g; });
                for (let floor = 0; floor < 3; floor++) {
                    T.forEach(t => {
                        if (floor >= t.n) return;
                        const i = k.add('box', [2, 2, 2], t.x, t.y, t.z, t.c, { t: 'windows', n: floor === 0 && t.n === 3 ? 'Skyscraper' : undefined });
                        t.y = k.top(i);
                    });
                }
                // Flat roofs (they also cover the windows on the top faces).
                T.forEach(t => { t.roof = k.add('box', [2.2, 0.25, 2.2], t.x, t.y, t.z, t.n === 3 ? 'silver' : 'dark'); });
                const crown = k.add('box', [1.2, 0.7, 1.2], 0, k.top(T[1].roof), -0.7, 'sky');
                // Doors, and striped shop awnings on the two smaller buildings.
                T.forEach((t, i) => k.add('box', [0.6, 0.9, 0.1], t.x, g, t.z + 1.05, 'brown', { n: i === 0 ? 'Door' : undefined }));
                k.add('wedge', [0.6, 0.3, 1.2], -3.3, g + 0.95, 1.1, 'red', { t: 'stripes', r: [0, -90, 0] });
                k.add('wedge', [0.6, 0.3, 1.2], 3.3, g + 0.95, 1.1, 'blue', { t: 'stripes', r: [0, -90, 0] });
                // Rooftops: a bush garden on the left, a water tower on the right.
                k.at('ball', [0.45], -3.5, k.top(T[0].roof) + 0.41, -0.4, 'green');
                const tank = k.add('cyl', [0.42, 0.62], 3.6, k.top(T[2].roof), -0.5, 'oak', { n: 'Water tower' });
                k.add('cone', [0.5, 0.42], 3.6, k.top(tank), -0.5, 'dark');
                // Street: two trees, a car, a lamp.
                [-1.65, 1.65].forEach((x, i) => {
                    const trunk = k.add('cyl', [0.12, 0.6], x, g, 1.4, 'brown');
                    k.at('ball', [0.44], x, k.top(trunk) + 0.38, 1.4, 'green', { n: i === 0 ? 'Tree' : undefined });
                });
                k.add('wheels', [0.2, 0.75], -0.42, g, 1.55, 'black');
                k.add('wheels', [0.2, 0.75], 0.42, g, 1.55, 'black');
                const car = k.add('box', [1.4, 0.32, 0.7], 0, g + 0.4, 1.55, 'red', { n: 'Car' });
                k.add('box', [0.75, 0.3, 0.62], -0.05, k.top(car), 1.55, 'sky');
                const lamp = k.add('cyl', [0.06, 1.3], -4.45, g, 1.7, 'black');
                k.at('ball', [0.15], -4.45, k.top(lamp) + 0.12, 1.7, 'yellow');
                // The spire, and a gold star on its tip (the star's notch sits on the point).
                const spire = k.add('cone', [0.42, 1.4], 0, k.top(crown), -0.7, 'silver', { n: 'Spire' });
                const R = 0.32;
                k.add('star', [R, 0.12], 0, k.top(spire) - 0.359 * R - 0.05, -0.7, 'gold', { n: 'Star', sink: true });
            })
        },
        {
            id: 'castle', name: 'Big Castle', tier: 4, world: 'kingdom',
            blocks: author(function (k) {
                // Four round towers on the corners, brick walls between them,
                // a gate in the front wall and a tall keep in the courtyard.
                const TX = 3.5, TZ = 1.9, TR = 0.8, WH = 1.9, WT = 0.5;
                const towers = [[-TX, TZ, 2.8], [TX, TZ, 2.8], [-TX, -TZ, 3.4], [TX, -TZ, 3.4]].map((t, i) =>
                    k.add('cyl', [TR, t[2]], t[0], 0, t[1], 'stone', { n: i === 0 ? 'Tower' : undefined }));
                // Walls end where they meet a tower's round side.
                const reach = Math.sqrt(TR * TR - WT * WT / 4);
                const endX = TX - reach, sideLen = 2 * (TZ - reach), fw = endX - 0.8;
                k.add('box', [fw, WH, WT], -(0.8 + fw / 2), 0, TZ, 'stone', { t: 'brick', n: 'Wall' });
                k.add('box', [fw, WH, WT], 0.8 + fw / 2, 0, TZ, 'stone', { t: 'brick' });
                k.add('arch', [1.6, 2.4, 0.7, 0.48, 1.0], 0, 0, TZ, 'stone', { t: 'brick', n: 'Gate' });
                const door = k.add('box', [0.9, 1.0, 0.14], 0, 0, TZ, 'oak', { n: 'Door' });
                k.add('half', [0.9, 0.14], 0, k.top(door), TZ, 'oak');
                k.add('box', [2 * endX, WH, WT], 0, 0, -TZ, 'stone', { t: 'brick' });
                k.add('box', [WT, WH, sideLen], -TX, 0, 0, 'stone', { t: 'brick' });
                k.add('box', [WT, WH, sideLen], TX, 0, 0, 'stone', { t: 'brick' });
                const keep = k.add('box', [2.4, 3.0, 1.8], 0, 0, -0.55, 'stone', { t: 'brick', n: 'Keep' });
                // Battlements along the walls, the gate and the keep.
                const merlon = (x, y, z, w, d, n) => k.add('box', [w, 0.36, d], x, y, z, 'stone', { n: n });
                [-1, 1].forEach(s => [2.5, 1.77, 1.04].forEach((x, i) => merlon(s * x, WH, TZ, 0.36, WT, s < 0 && i === 0 ? 'Battlements' : undefined)));
                [-0.58, 0.58].forEach(x => merlon(x, 2.4, TZ, 0.36, 0.7));
                [-1, 1].forEach(s => [-0.75, 0, 0.75].forEach(z => merlon(s * TX, WH, z, WT, 0.36)));
                [-2.0, 2.0].forEach(x => merlon(x, WH, -TZ, 0.36, WT));
                [-1.0, 0, 1.0].forEach(x => merlon(x, k.top(keep), 0.15, 0.4, 0.4));
                // Red banners hanging on the front wall.
                [-1, 1].forEach(s => k.at('box', [0.5, 0.8, 0.1], s * (0.8 + fw / 2), 1.1, TZ + WT / 2 + 0.05, 'red', { n: s < 0 ? 'Banner' : undefined }));
                // Pointed roofs, the keep's own little tower, then flags on every point.
                const roofs = towers.map((t, i) => k.add('cone', [0.98, 1.5], k.spec(t).p[0], k.top(t), k.spec(t).p[2], 'blue', { n: i === 0 ? 'Roof' : undefined }));
                const kt = k.add('cyl', [0.55, 1.2], 0, k.top(keep), -0.75, 'stone');
                const kr = k.add('cone', [0.72, 1.3], 0, k.top(kt), -0.75, 'red');
                const flag = (roof, len, w, h, c, n) => {
                    const p = k.spec(roof).p, pole = k.add('cyl', [0.06, len], p[0], k.top(roof) - 0.12, p[2], 'dark', { sink: true });
                    k.at('box', [w, h, 0.1], p[0] + 0.06 + w / 2, k.top(pole) - h / 2 - 0.04, p[2], c, { n: n });
                };
                roofs.forEach((r, i) => flag(r, 0.75, 0.66, 0.42, i % 2 ? 'red' : 'yellow', i === 0 ? 'Flag' : undefined));
                flag(kr, 0.95, 0.9, 0.55, 'yellow', 'Top flag');
            })
        },
        (function () {
            // Moving parts, filled in while authoring (see `spin` in js/sim.js).
            const wheel = [], seats = [], merry = [];
            const D = Math.PI / 180;
            const FX = 0.5, FZ = -1.2, HY = 3.5, R = 2.2, HR = 0.3;   // Ferris wheel
            const CX = -3.4, CZ = 1.0;                                 // carousel
            const blocks = author(function (k) {
                // Ferris wheel frame first: base, A-frame legs, hub, spokes, rim.
                const base = k.add('box', [3.4, 0.3, 0.9], FX, 0, FZ - 0.45, 'white', { n: 'Ferris wheel' });
                const bt = k.top(base), LZ = FZ - 0.45;
                [-1, 1].forEach(s => {
                    // Each leg runs from the base to the hub's round side.
                    const fx = FX + s * 1.4, dx = FX - fx, dy = HY - bt, l = Math.hypot(dx, dy);
                    const tx = FX - dx / l * HR, ty = HY - dy / l * HR;
                    const len = Math.hypot(tx - fx, ty - bt), ang = Math.atan2(tx - fx, ty - bt) / D;
                    k.at('box', [0.22, len, 0.22], (fx + tx) / 2, (bt + ty) / 2, LZ, 'blue', { r: [0, 0, -ang] });
                });
                wheel.push(k.at('cyl', [HR, 0.8], FX, HY, FZ - 0.2, 'red', { r: [90, 0, 0] }));
                const tip = a => [FX + R * Math.cos(a * D), HY + R * Math.sin(a * D)];
                for (let i = 0; i < 8; i++) {
                    const a = i * 45, r0 = HR, r1 = R - 0.08, rm = (r0 + r1) / 2;
                    wheel.push(k.at('box', [r1 - r0, 0.14, 0.14], FX + rm * Math.cos(a * D), HY + rm * Math.sin(a * D), FZ, 'white', { r: [0, 0, a], n: i === 0 ? 'Spokes' : undefined }));
                }
                const chord = 2 * R * Math.sin(22.5 * D) - 0.06, rc = R * Math.cos(22.5 * D);
                for (let i = 0; i < 8; i++) {
                    const a = i * 45 + 22.5;
                    wheel.push(k.at('box', [chord, 0.14, 0.14], FX + rc * Math.cos(a * D), HY + rc * Math.sin(a * D), FZ, 'blue', { r: [0, 0, a + 90], n: i === 0 ? 'Wheel' : undefined }));
                }
                // Carousel: platform, centre post, horses on gold poles, striped roof.
                const plat = k.add('cyl', [1.15, 0.22], CX, 0, CZ, 'white', { n: 'Carousel' });
                const py = k.top(plat), post = k.add('cyl', [0.2, 1.5], CX, py, CZ, 'gold');
                merry.push(plat, post);
                [-60, 0, 60].forEach((a, i) => {
                    const px = CX + 0.85 * Math.sin(a * D), pz = CZ + 0.85 * Math.cos(a * D);
                    merry.push(k.add('cyl', [0.06, 1.5], px, py, pz, 'gold'));
                    const hr = 0.85 + 0.06 + 0.09;
                    merry.push(k.at('box', [0.48, 0.26, 0.18], CX + hr * Math.sin(a * D), py + 0.62, CZ + hr * Math.cos(a * D),
                        ['pink', 'sky', 'yellow'][i], { r: [0, a, 0], n: i === 0 ? 'Horse' : undefined }));
                });
                const croof = k.add('cone', [1.3, 0.85], CX, k.top(post), CZ, 'red', { t: 'stripes' });
                merry.push(croof, k.at('ball', [0.17], CX, k.top(croof) + 0.13, CZ, 'gold'));
                // Ice cream stand with a giant cone on the roof.
                const IX = 3.5, IZ = 1.3;
                const stand = k.add('box', [1.4, 0.95, 0.9], IX, 0, IZ, 'white');
                const iroof = k.add('tri', [1.7, 0.55, 1.1], IX, k.top(stand), IZ, 'teal');
                const icone = k.add('cone', [0.26, 0.55], IX, k.top(iroof) - 0.03, IZ, 'sand', { r: [180, 0, 0], sink: true });
                k.at('ball', [0.3], IX, k.top(icone) + 0.25, IZ, 'pink', { n: 'Ice cream' });
                // Prize booth with a gold star sign.
                const BX = 3.9, BZ = -1.5;
                const booth = k.add('box', [1.2, 0.9, 0.9], BX, 0, BZ, 'yellow');
                const broof = k.add('tri', [1.5, 0.5, 1.1], BX, k.top(booth), BZ, 'red');
                k.add('star', [0.36, 0.12], BX, k.top(broof) - 0.359 * 0.36 - 0.04, BZ, 'gold', { n: 'Prize', sink: true });
                // Balloon stand.
                const stick = k.add('cyl', [0.06, 1.45], -1.15, 0, 1.9, 'white');
                const st = k.top(stick);
                k.at('ball', [0.27], -1.15, st + 0.22, 1.9, 'red', { n: 'Balloons' });
                k.at('ball', [0.25], -1.15 - 0.4, st + 0.02, 1.95, 'yellow');
                k.at('ball', [0.25], -1.15 + 0.4, st + 0.04, 1.95, 'blue');
                // Ferris wheel seats, in front of the rim and centred on each rim
                // point, so they stay on their pivot while the wheel turns.
                const colours = ['red', 'orange', 'yellow', 'lime', 'teal', 'sky', 'purple', 'pink'];
                [270, 315, 0, 45, 90, 135, 180, 225].forEach((a, i) => {
                    const p = tip(a);
                    seats.push(k.at('cyl', [0.3, 0.42], p[0], p[1], FZ + 0.07 + 0.3, colours[i], { n: i === 0 ? 'Seat' : undefined }));
                });
                wheel.push(k.at('star', [0.45, 0.12], FX, HY, FZ + 0.2 + 0.06, 'gold', { n: 'Star' }));
            });
            return {
                id: 'park', name: 'Amusement Park', tier: 4, world: 'boardwalk', blocks: blocks, camera: { dist: 0.98 },
                spin: [
                    { ids: wheel, upright: seats, axis: 'z', center: [FX, HY, FZ], speed: 0.25 },
                    { ids: merry, axis: 'y', center: [CX, 0, CZ], speed: 0.5 }
                ]
            };
        })(),
        (function () {
            // The solar wings turn slowly on their trusses (round x, so every
            // block keeps its x and the left/right knock-down slices still fit).
            const wings = [], CY = 3.5;
            const blocks = author(function (k) {
                // Zero gravity: the hub floats, everything else clips onto what is there.
                k.at('ball', [0.6], 0, CY, 0, 'white', { n: 'Hub' });
                // Modules out to the sides, a node on each end, then the trusses.
                [-1, 1].forEach(s => k.at('cyl', [0.45, 1.7], s * 1.4, CY, 0, 'white', { r: [0, 0, 90], n: s < 0 ? 'Module' : undefined }));
                const NX = 2.25 + 0.42 - 0.04;
                [-1, 1].forEach(s => k.at('ball', [0.42], s * NX, CY, 0, 'silver'));
                const T0 = NX + 0.42 - 0.04, TL = 2.1;
                [-1, 1].forEach(s => wings.push(k.at('box', [TL, 0.28, 0.28], s * (T0 + TL / 2), CY, 0, 'grey')));
                // Solar wings: three panels above and three below each truss.
                let first = true;
                [-1, 1].forEach(s => [1, -1].forEach(v => [0, 1, 2].forEach(j => {
                    const x = s * (T0 + 0.05 + 0.33 + j * 0.7), y = CY + v * (0.14 + 0.9);
                    wings.push(k.at('box', [0.66, 1.8, 0.1], x, y, 0, 'blue', { t: 'solar', n: first ? 'Solar panel' : undefined }));
                    first = false;
                })));
                // Cupola with a big window, portholes, a module out the back.
                k.at('cyl', [0.34, 0.4], 0, CY, 0.75, 'silver', { r: [90, 0, 0] });
                k.at('cyl', [0.24, 0.1], 0, CY, 1.0, 'sky', { r: [90, 0, 0], n: 'Window' });
                [-1.8, -1.0, 1.0, 1.8].forEach(x => k.at('cyl', [0.12, 0.1], x, CY, 0.5, 'sky', { r: [90, 0, 0] }));
                k.at('cyl', [0.4, 1.0], 0, CY, -1.05, 'white', { r: [90, 0, 0] });
                // Underneath: a module, a node and a dish, with two radiator fins.
                const low = k.add('cyl', [0.4, 0.9], 0, CY - 0.55 - 0.9, 0, 'white');
                const lb = k.bottom(low);
                k.at('ball', [0.32], 0, lb - 0.28, 0, 'silver');
                const dish = k.add('cone', [0.6, 0.3], 0, lb - 0.56 - 0.3, 0, 'white', { n: 'Dish' });
                k.at('ball', [0.1], 0, k.bottom(dish) - 0.08, 0, 'gold');
                [-1, 1].forEach(s => k.at('box', [0.7, 0.75, 0.1], s * 0.75, lb + 0.45, 0, 'white'));
                // A robot arm on the left module: base, upper arm, elbow, forearm, claw.
                const ax = -1.55, ay = CY + 0.45 - 0.03;
                const abase = k.add('cyl', [0.16, 0.18], ax, ay, 0, 'dark');
                const up = [-Math.sin(35 * Math.PI / 180), Math.cos(35 * Math.PI / 180)], b0 = [ax, k.top(abase)];
                k.at('box', [0.16, 1.0, 0.16], b0[0] + up[0] * 0.5, b0[1] + up[1] * 0.5, 0, 'white', { r: [0, 0, 35], n: 'Robot arm' });
                const el = [b0[0] + up[0] * 1.1, b0[1] + up[1] * 1.1];
                k.at('ball', [0.13], el[0], el[1], 0, 'dark');
                const fa = [Math.sin(20 * Math.PI / 180), Math.cos(20 * Math.PI / 180)];
                k.at('box', [0.14, 0.75, 0.14], el[0] + fa[0] * 0.475, el[1] + fa[1] * 0.475, 0, 'white', { r: [0, 0, -20] });
                k.at('arch', [0.36, 0.28, 0.16, 0.11], el[0] + fa[0] * 0.98, el[1] + fa[1] * 0.98, 0, 'red', { r: [0, 0, 160] });
                // Lights on the truss tips, antennas hanging under the end nodes.
                const tipX = T0 + TL + 0.08;
                wings.push(k.at('ball', [0.1], -tipX, CY, 0, 'red', { n: 'Light' }));
                wings.push(k.at('ball', [0.1], tipX, CY, 0, 'lime'));
                [-1, 1].forEach(s => {
                    const rod = k.add('cyl', [0.05, 0.55], s * NX, CY - 0.42 - 0.55 + 0.03, 0, 'silver', { n: s < 0 ? 'Antenna' : undefined });
                    k.at('ball', [0.1], s * NX, k.bottom(rod) - 0.08, 0, 'orange');
                });
                // On top: a module, a gold docking ring and a docked rocket.
                const topm = k.add('cyl', [0.4, 1.0], 0, CY + 0.55, 0, 'white');
                const ring = k.add('cyl', [0.28, 0.16], 0, k.top(topm), 0, 'gold');
                const cap = k.add('cyl', [0.36, 0.55], 0, k.top(ring), 0, 'white', { n: 'Rocket' });
                const cy = (k.top(cap) + k.bottom(cap)) / 2;
                [-1, 1].forEach(s => k.at('box', [0.7, 0.3, 0.1], s * (0.36 + 0.35), cy, 0, 'blue', { t: 'solar' }));
                k.at('cyl', [0.1, 0.1], 0, cy + 0.05, 0.41, 'sky', { r: [90, 0, 0] });
                k.add('cone', [0.36, 0.7], 0, k.top(cap), 0, 'red', { n: 'Nose cone' });
            });
            return {
                id: 'station', name: 'Space Station', tier: 4, world: 'space', float: true, blocks: blocks, camera: { dist: 1.05 },
                spin: [{ ids: wings, axis: 'x', center: [0, CY, 0], speed: 0.15 }]
            };
        })()
    ];

    // --- relations: who rests on whom --------------------------------------------------------

    const relCache = new WeakMap();

    /**
     * For each block i, `on[i]` lists the earlier blocks it depends on: the
     * ones it rests on, or, for a block attached to a side (a window, a fin),
     * the ones it touches. `ground[i]` is true when it stands on y = 0.
     * Knocking a block loose must also loosen everything that depends on it,
     * or a block would be left hanging in the air.
     */
    function relations(blocks) {
        if (relCache.has(blocks)) return relCache.get(blocks);
        const S = BNB.Shapes, n = blocks.length;
        const bounds = blocks.map(S.bounds);
        const shells = blocks.map(b => S.shell(b, 0.06, 9));
        const on = [], ground = [];
        for (let i = 0; i < n; i++) {
            const bi = bounds[i];
            ground[i] = bi.min[1] < 0.05;
            const rests = [], touches = [];
            for (let j = 0; j < i; j++) {
                const bj = bounds[j];
                if (bj.min[0] > bi.max[0] + 0.1 || bj.max[0] < bi.min[0] - 0.1 || bj.min[1] > bi.max[1] + 0.1 ||
                    bj.max[1] < bi.min[1] - 0.1 || bj.min[2] > bi.max[2] + 0.1 || bj.max[2] < bi.min[2] - 0.1) continue;
                let hit = 0, below = 0;
                for (const p of shells[i]) {
                    if (S.inside(blocks[j], p[0], p[1], p[2], 0)) { hit++; if (p[1] < bi.min[1] + 0.25) below++; }
                }
                if (!hit) continue;
                touches.push(j);
                // Rests on j when the contact is low on i and j sits lower than i.
                if (below > 0 && bj.min[1] < bi.min[1] - 0.02) rests.push(j);
            }
            on[i] = ground[i] ? rests : (rests.length ? rests : touches);
            on[i].touches = touches;
        }
        const out = { on: on, ground: ground, bounds: bounds };
        relCache.set(blocks, out);
        return out;
    }

    /** Every block that depends, directly or not, on any block in `ids`. */
    function dependents(blocks, ids, placedCount) {
        const rel = relations(blocks), set = new Set(ids);
        const n = placedCount === undefined ? blocks.length : placedCount;
        let grew = true;
        while (grew) {
            grew = false;
            for (let i = 0; i < n; i++) {
                if (set.has(i)) continue;
                if (rel.on[i].some(j => set.has(j))) { set.add(i); grew = true; }
            }
        }
        return set;
    }

    // --- the checker ---------------------------------------------------------------------------

    /** Problems with a build: { errors: [...], warnings: [...] }. */
    function check(build, opts) {
        opts = opts || {};
        const S = BNB.Shapes, errors = [], warnings = [], blocks = build.blocks;
        const floats = !!opts.zeroG;
        const PRESSES = { house: 7, rocket: 8, tree: 6, train: 16, pyramid: 15, bridge: 12, robot: 24, pirate: 28, city: 30, castle: 50, park: 50, station: 50 };
        if (PRESSES[build.id] && blocks.length !== PRESSES[build.id]) errors.push(build.id + ': ' + blocks.length + ' blocks, expected ' + PRESSES[build.id]);
        if (!TIERS[build.tier]) errors.push(build.id + ': bad tier ' + build.tier);
        const rel = relations(blocks);
        const samples = blocks.map(b => S.samples(b, 8));
        blocks.forEach(function (b, i) {
            const tag = build.id + ' #' + (i + 1) + ' (' + b.s + (b.n ? ' ' + b.n : '') + ')';
            if (!S.PALETTE[b.c]) errors.push(tag + ': unknown colour ' + b.c);
            const bb = rel.bounds[i];
            if (!floats && bb.min[1] < -0.03) errors.push(tag + ': below the ground (' + bb.min[1].toFixed(2) + ')');
            if (floats ? i > 0 && !rel.on[i].touches.length : !rel.ground[i] && !rel.on[i].touches.length) {
                errors.push(tag + ': floating - touches nothing placed before it');
            }
            for (let j = 0; j < i; j++) {
                const bj = rel.bounds[j];
                if (bj.min[0] > bb.max[0] || bj.max[0] < bb.min[0] || bj.min[1] > bb.max[1] || bj.max[1] < bb.min[1] ||
                    bj.min[2] > bb.max[2] || bj.max[2] < bb.min[2]) continue;
                let inside = 0;
                for (const p of samples[i]) if (S.inside(blocks[j], p[0], p[1], p[2], -0.04)) inside++;
                const frac = inside / Math.max(1, samples[i].length);
                const allowed = b.sink ? 0.35 : 0.04;
                if (frac > allowed) errors.push(tag + ': overlaps #' + (j + 1) + ' (' + Math.round(frac * 100) + '% of it)');
            }
        });
        const all = rel.bounds.reduce((a, b) => ({
            min: a.min.map((v, k) => Math.min(v, b.min[k])), max: a.max.map((v, k) => Math.max(v, b.max[k]))
        }), { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
        const span = Math.max(all.max[0] - all.min[0], all.max[2] - all.min[2]);
        if (span > 11) warnings.push(build.id + ': footprint ' + span.toFixed(1) + ' units wide (plot fits about 11)');
        if (all.max[1] > 9.5) warnings.push(build.id + ': ' + all.max[1].toFixed(1) + ' units tall');
        return { errors: errors, warnings: warnings, bounds: all };
    }

    /** World bounding box of the first `count` blocks (all by default). */
    function extent(build, count) {
        const rel = relations(build.blocks), n = count === undefined ? build.blocks.length : count;
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], rel.bounds[i].min[k]);
            max[k] = Math.max(max[k], rel.bounds[i].max[k]);
        }
        return { min: min, max: max };
    }

    /** How far from the centre the build reaches, for the world's clear plot. */
    function plotRadius(build) {
        const e = extent(build);
        return Math.max(2.5, Math.hypot(Math.max(-e.min[0], e.max[0]), Math.max(-e.min[2], e.max[2])) + 1.2);
    }

    function get(id) { return LIST.find(b => b.id === id) || null; }

    return {
        TIERS: TIERS,
        LIST: LIST,
        author: author,
        get: get,
        relations: relations,
        dependents: dependents,
        check: check,
        extent: extent,
        plotRadius: plotRadius,
        tierName: function (b) { return TIERS[b.tier]; }
    };
})();
