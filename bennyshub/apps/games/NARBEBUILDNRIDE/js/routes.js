/**
 * NARBE Build n Ride - the preset routes, as data.
 *
 * Six routes, each longer and more tangled than the one before (more pieces, more
 * stations, at least as many overpasses), each in a world of its own: tests/routes.test.cjs.
 *
 * A route is a closed loop traced through corner cells (see
 * BNR.Track.fromCorners): the first cell is the start, heading toward the
 * second corner, and the loop must come back into it the same way. Crossing
 * itself is fine: the later track goes over on an overpass.
 *
 *   world    the zones and features the loop runs through (BNR.World.create), plus
 *            datums (the route's own track level per biome) and propScale (its own
 *            prop density per biome: a forest thicker, an open snowfield sparser)
 *   lines    decorative straight tracks for other trains: { start: { cx, cz, h }, length (pieces) }
 *   events   things that happen as the train passes (js/events.js):
 *            { type, piece (anchor), side (1 right of travel, -1 left), lead (units before the anchor),
 *              when (only then: { night, season, weather }), kind ('gull' birds), reverse (freight) }
 *            Keep a station stop from falling between an event's trigger and its anchor
 *            (tests/ride.test.cjs checks), or it plays while the train is standing round a corner;
 *            and keep events after the first station (where a ride starts), so they play on lap one.
 *   thumb    the picture on the route's tile: the train's head at `piece`, the camera
 *            `back` behind it, `side` (+ right) across and `up` above
 *   prefer   the time of day or season the route looks best in: { time: 'night' }, { season: 'winter' }
 *
 * One grid cell is 14 units: cell (cx, cz) is centred on ((cx + 0.5) * 14, (cz + 0.5) * 14).
 * Stations are placed automatically, one per zone (BNR.Track.stationSites): design the zones
 * so stations come out at least 180 units apart and never on a crossing.
 */

window.BNR = window.BNR || {};

BNR.Routes = (function () {
    'use strict';

    const LIST = [
        {
            id: 'countryside',
            name: 'Countryside',
            blurb: 'Farms, a river, a windmill, an orchard, a village and a tunnel through the hill.',
            corners: [[0, 0], [20, 0], [20, 10], [30, 10], [30, 22], [2, 22], [2, 14], [14, 14], [14, -8], [-6, -8], [-6, 0]],
            world: {
                seed: 4101,
                base: 'farm',
                baseName: 'Haystack Farm',
                zones: [
                    { biome: 'meadow', name: 'Green Meadow', x: 100, z: -20, r: 100, soft: 30 },
                    { biome: 'forest', name: 'Whispering Woods', pts: [[300, 150], [427, 150], [427, 320]], r: 72, soft: 30 },
                    { biome: 'town', name: 'Market Square', x: 185, z: 300, r: 76, soft: 26 },
                    { biome: 'meadow', name: 'Daisy Hill', x: -30, z: -110, r: 78, soft: 28 }
                ],
                features: [
                    { type: 'river', w: 13, depth: 6, pts: [[360, -260], [355, 0], [350, 120], [372, 230], [365, 330], [380, 460]] },
                    { type: 'hill', x: 125, z: -118, r: 74, h: 22 },
                    { type: 'hill', x: -190, z: 150, r: 80, h: 18 },
                    { type: 'lake', x: 105, z: 100, r: 44, depth: 7 },
                    { type: 'hill', x: 55, z: -55, r: 38, h: 5 },
                    { type: 'landmark', kind: 'windmill', x: 55, z: -55, ry: 0.6 },
                    { type: 'orchard', x: 245, z: 80, w: 40, d: 64, ang: Math.PI / 2, kind: 'appletree' }
                ]
            },
            lines: [{ start: { cx: -30, cz: -17, h: 1 }, length: 82 }],
            events: [
                { type: 'birds', piece: 15, side: 1 },
                { type: 'sheep', piece: 24, side: -1 },
                { type: 'deer', piece: 36, side: 1, lead: 75 },
                { type: 'tractor', piece: 85, side: 1 },
                { type: 'balloons', piece: 112, side: -1, lead: 130 },
                { type: 'freight', line: 0, piece: 126, lead: 0 },
                { type: 'eagle', piece: 128, side: -1 }
            ],
            thumb: { piece: 8, back: 26, side: -15, up: 13 }
        },
        {
            id: 'mountainpass',
            name: 'Mountain Pass',
            blurb: 'Climb from the pine valley past a lake and a waterfall, loop over yourself and cross the snowy pass.',
            corners: [[0, 0], [34, 0], [34, -16], [20, -16], [20, -6], [30, -6], [30, -26], [-8, -26], [-8, -10], [-14, -10], [-14, 4], [-4, 4], [-4, 0]],
            world: {
                seed: 5202,
                base: 'mountains',
                baseName: 'Granite Ridge',
                datumNoise: 1,
                datums: { mountains: 4, forest: 0, lake: -1, alpine: 4, snowfield: 4 },
                propScale: { forest: 0.62, alpine: 0.62, mountains: 0.75 },
                zones: [
                    { biome: 'forest', name: 'Pine Valley', pts: [[-60, 30], [300, 20]], r: 75, soft: 36 },
                    { biome: 'lake', name: 'Crystal Lake', x: 480, z: -60, r: 100, soft: 36 },
                    { biome: 'alpine', name: 'Eagle Peak', pts: [[330, -130], [455, -215], [450, -290]], r: 88, soft: 34 },
                    { biome: 'snowfield', name: 'High Pass', x: 235, z: -372, r: 125, soft: 36 },
                    { biome: 'alpine', name: 'Edelweiss Meadow', x: -25, z: -362, r: 110, soft: 36 },
                    { biome: 'forest', name: 'Timberline', pts: [[-105, -285], [-105, -140], [-189, -133], [-189, 45]], r: 58, soft: 30 }
                ],
                features: [
                    { type: 'rise', x: 210, z: -380, r: 560, h: 15 },
                    { type: 'mountain', x: 100, z: -425, r: 100, h: 62 },
                    { type: 'mountain', x: 357, z: -147, r: 46, h: 36 },
                    { type: 'mountain', x: 205, z: -150, r: 112, h: 72 },
                    { type: 'mountain', x: 600, z: -300, r: 130, h: 80 },
                    { type: 'mountain', x: -130, z: -470, r: 120, h: 75 },
                    { type: 'mountain', x: 200, z: 245, r: 100, h: 55 },
                    { type: 'lake', x: 512, z: -98, r: 70, depth: 9 },
                    { type: 'lake', x: 210, z: -440, r: 42, depth: 7 },
                    { type: 'outcrop', x: 520, z: -302, r: 34, h: 22 },
                    { type: 'flat', x: 490, z: -300, r: 16, dh: 0 },
                    { type: 'landmark', kind: 'waterfall', x: 490, z: -300, ry: -Math.PI / 2 },
                    { type: 'outcrop', x: -40, z: -60, r: 30, h: 12 }
                ]
            },
            lines: [{ start: { cx: -24, cz: 9, h: 1 }, length: 78 }],
            events: [
                { type: 'freight', line: 0, piece: 15, lead: 0, reverse: true },
                { type: 'birds', piece: 20, side: 1 },
                { type: 'balloons', piece: 32, side: -1, lead: 130 },
                { type: 'eagle', piece: 66, side: -1 },
                { type: 'waterfall', piece: 98, side: 1 },
                { type: 'sheep', piece: 134, side: -1 },
                { type: 'deer', piece: 168, side: 1 }
            ],
            thumb: { piece: 43, back: 30, side: -20, up: 13 }
        },
        {
            id: 'desertcanyon',
            name: 'Desert Canyon',
            blurb: 'Wooden trestles over a deep canyon, red mesas, a rock arch, rolling dunes and a palm oasis.',
            corners: [[0, 0], [20, 0], [20, 10], [30, 10], [30, -12], [10, -12], [10, 16], [-10, 16], [-10, -16], [4, -16], [4, 6], [-5, 6], [-5, 0]],
            world: {
                seed: 6303,
                base: 'desert',
                baseName: 'Dusty Gulch',
                propScale: { desert: 0.75, redrock: 0.8 },
                zones: [
                    { biome: 'desert', name: 'Cactus Flats', x: 225, z: 50, r: 80, soft: 28 },
                    { biome: 'oasis', name: 'Oasis Springs', x: 375, z: 175, r: 82, soft: 30 },
                    { biome: 'redrock', name: 'Sunset Mesa', x: 330, z: -115, r: 118, soft: 32 },
                    { biome: 'dunes', name: 'Golden Dunes', x: 5, z: 268, r: 120, soft: 36 },
                    { biome: 'redrock', name: 'Red Rock Arch', x: -110, z: -175, r: 100, soft: 32 }
                ],
                features: [
                    { type: 'rise', x: 330, z: -110, r: 320, h: 9 },
                    { type: 'rise', x: -120, z: -200, r: 260, h: 7 },
                    { type: 'canyon', w: 34, depth: 16, pts: [[-340, -15], [-133, -75], [63, -100], [147, -70], [300, -22], [427, -40], [580, -70]] },
                    { type: 'mesa', x: 300, z: -185, r: 40, h: 24 },
                    { type: 'mesa', x: 300, z: -95, r: 42, h: 28 },
                    { type: 'mesa', x: 215, z: -120, r: 26, h: 18 },
                    { type: 'mesa', x: 540, z: -250, r: 70, h: 34 },
                    { type: 'mesa', x: 200, z: -340, r: 85, h: 40 },
                    { type: 'mesa', x: -310, z: 110, r: 60, h: 30 },
                    { type: 'mesa', x: 600, z: 110, r: 60, h: 26 },
                    { type: 'plateau', x: -60, z: -430, r: 170, h: 24, nx: 0, nz: 1, w: 8 },
                    { type: 'outcrop', x: -205, z: -35, r: 30, h: 14 },
                    { type: 'outcrop', x: 30, z: -265, r: 26, h: 12 },
                    { type: 'lake', x: 362, z: 218, r: 34, depth: 5 },
                    { type: 'grove', x: 362, z: 218, r: 46, ring: 24, count: 16, kind: 'palm' },
                    { type: 'flat', x: -92, z: -140, r: 18, dh: 0 },
                    { type: 'landmark', kind: 'rockarch', x: -92, z: -140, ry: Math.PI / 2 }
                ]
            },
            lines: [{ start: { cx: -30, cz: 22, h: 1 }, length: 82 }],
            events: [
                { type: 'tumbleweed', piece: 24, side: 1 },
                { type: 'birds', piece: 34, side: 1 },
                { type: 'balloons', piece: 56, side: -1, lead: 130 },
                { type: 'eagle', piece: 74, side: 1 },
                { type: 'freight', line: 0, piece: 118, lead: 0 },
                { type: 'tumbleweed', piece: 149, side: -1 },
                { type: 'eagle', piece: 186, side: 1 }
            ],
            thumb: { piece: 66, back: 28, side: -16, up: 14 }
        },
        {
            id: 'snowyforest',
            name: 'Snowy Forest',
            blurb: 'Snowy pines, a frozen lake, a chalet village and two loops that cross over themselves.',
            corners: [[0, 0], [22, 0], [22, -12], [14, -12], [14, -4], [18, -4], [18, -20], [-12, -20], [-12, -6], [-7, -6], [-7, -26], [-18, -26], [-18, 9], [6, 9], [6, -8], [-4, -8], [-4, 0]],
            prefer: { season: 'winter' },
            world: {
                seed: 7404,
                base: 'snowfield',
                baseName: 'Frosty Flats',
                propScale: { snowforest: 0.85, snowfield: 0.22 },
                zones: [
                    { biome: 'snowforest', name: 'Pine Hollow', pts: [[150, 20], [315, 10], [300, -110], [225, -110]], r: 66, soft: 30 },
                    { biome: 'snowfield', name: 'Mirror Lake', pts: [[-20, -235], [140, -240]], r: 55, soft: 28 },
                    { biome: 'snowfield', name: 'Snowdrift Ridge', x: 300, z: -228, r: 70, soft: 26 },
                    { biome: 'snowforest', name: 'Silver Birch', pts: [[-130, -110], [-100, -270]], r: 66, soft: 28 },
                    { biome: 'snowforest', name: 'Fir Grove', pts: [[-245, -380], [-245, -20]], r: 70, soft: 30 },
                    { biome: 'snowvillage', name: 'Chalet Green', x: -75, z: 145, r: 95, soft: 30 }
                ],
                features: [
                    { type: 'rise', x: 40, z: -330, r: 420, h: 10 },
                    { type: 'lake', x: 40, z: -188, r: 55, depth: 7 },
                    { type: 'river', w: 14, depth: 5, pts: [[160, -110], [112, 40], [130, 260]] },
                    { type: 'hill', x: -292, z: -110, r: 82, h: 26 },
                    { type: 'mountain', x: 230, z: -420, r: 120, h: 70 },
                    { type: 'mountain', x: -60, z: -470, r: 130, h: 80 },
                    { type: 'mountain', x: 470, z: -180, r: 110, h: 55 },
                    { type: 'hill', x: 330, z: 160, r: 90, h: 20 },
                    { type: 'hill', x: -380, z: 120, r: 100, h: 24 },
                    { type: 'grove', x: -60, z: 60, r: 30, count: 9, kind: 'snowpine' }
                ]
            },
            lines: [{ start: { cx: -32, cz: 17, h: 1 }, length: 46 }],
            events: [
                { type: 'birds', piece: 19, side: 1 },
                { type: 'deer', piece: 28, side: -1 },
                { type: 'eagle', piece: 64, side: 1 },
                { type: 'balloons', piece: 108, side: 1, lead: 130 },
                { type: 'deer', piece: 175, side: 1 },
                { type: 'aurora', piece: 188, side: 1, when: { night: true, season: 'winter' } },
                { type: 'freight', line: 0, piece: 188, lead: 0, reverse: true },
                { type: 'birds', piece: 232, side: -1 }
            ],
            thumb: { piece: 12, back: 28, side: -16, up: 14 }
        },
        {
            id: 'seasidecliffs',
            name: 'Seaside Cliffs',
            blurb: 'High green cliffs over the sea, a lighthouse, a harbour full of boats, sea stacks and whales.',
            corners: [[0, 0], [26, 0], [26, -16], [10, -16], [10, -6], [18, -6], [18, -24], [-14, -24], [-14, -12], [-8, -12], [-8, -30], [-24, -30], [-24, 8], [12, 8], [12, -4], [-4, -4], [-4, 0]],
            world: {
                seed: 8505,
                base: 'coast',
                baseName: 'Seaview',
                datums: { coast: 15, town: 3, meadow: 12, forest: 11 },
                propScale: { coast: 0.6, meadow: 0.7 },
                zones: [
                    { biome: 'coast', name: 'Seagull Point', pts: [[150, 15], [371, 10], [371, -150]], r: 62, soft: 30 },
                    { biome: 'forest', name: 'Bramble Woods', x: 200, z: -190, r: 95, soft: 32 },
                    { biome: 'meadow', name: 'Heather Moor', x: 20, z: -350, r: 100, soft: 34 },
                    { biome: 'coast', name: 'Puffin Rock', x: -200, z: -360, r: 85, soft: 30 },
                    { biome: 'coast', name: 'Cliff Top', pts: [[-329, -260], [-329, -40]], r: 60, soft: 30 },
                    { biome: 'coast', name: 'Lighthouse Point', x: -290, z: 110, r: 80, soft: 30 },
                    { biome: 'town', name: 'Harbour Town', x: 55, z: 135, r: 88, soft: 30 }
                ],
                features: [
                    { type: 'sea', nx: 0, nz: 1, d: 150, shore: 9, depth: 12, level: 0, wobble: 14 },
                    { type: 'sea', nx: 1, nz: 0, d: 402, shore: 9, depth: 12, level: 0, wobble: 14 },
                    { type: 'sea', nx: -1, nz: 0, d: 360, shore: 9, depth: 12, level: 0, wobble: 14 },
                    { type: 'cove', x: 60, z: 150, r: 54, depth: 6, level: 0 },
                    { type: 'cove', x: 432, z: -150, r: 44, depth: 6, level: 0 },
                    { type: 'hill', x: -120, z: 150, r: 60, h: 28 },
                    { type: 'outcrop', x: -205, z: 188, r: 13, h: 34 },
                    { type: 'outcrop', x: -236, z: 204, r: 10, h: 27 },
                    { type: 'outcrop', x: 446, z: 30, r: 12, h: 30 },
                    { type: 'outcrop', x: -402, z: -180, r: 14, h: 32 },
                    { type: 'outcrop', x: 230, z: 186, r: 11, h: 28 },
                    { type: 'flat', x: -368, z: 150, r: 15, dh: 0 },
                    { type: 'landmark', kind: 'lighthouse', x: -368, z: 150, ry: 0.4 },
                    { type: 'hill', x: 40, z: -470, r: 120, h: 30 },
                    { type: 'hill', x: -330, z: -520, r: 110, h: 26 },
                    { type: 'grove', x: 250, z: -300, r: 40, count: 14, kind: 'oak' }
                ]
            },
            lines: [{ start: { cx: -24, cz: -34, h: 1 }, length: 50 }],
            events: [
                { type: 'birds', kind: 'gull', piece: 19, side: 1 },
                { type: 'whale', piece: 30, side: 1 },
                { type: 'deer', piece: 62, side: 1 },
                { type: 'freight', line: 0, piece: 98, lead: 0 },
                { type: 'balloons', piece: 150, side: -1, lead: 130 },
                { type: 'eagle', piece: 190, side: -1 },
                { type: 'birds', kind: 'gull', piece: 214, side: -1 },
                { type: 'boats', piece: 236, side: 1 },
                { type: 'sheep', piece: 262, side: -1 }
            ],
            thumb: { piece: 210, back: 26, side: -18, up: 13 }
        },
        {
            id: 'nightcity',
            name: 'Night City',
            blurb: 'Bright towers, a river with steel bridges, a park, the harbour and a tangle of overpasses downtown.',
            corners: [[0, 0], [28, 0], [28, -12], [16, -12], [16, 16], [36, 16], [36, -28], [-14, -28], [-14, 6], [20, 6], [20, -8], [-4, -8], [-4, 0]],
            prefer: { time: 'night' },
            world: {
                seed: 9606,
                base: 'city',
                baseName: 'Downtown',
                zones: [
                    { biome: 'city', name: 'Union Street', x: 330, z: 40, r: 70, soft: 26 },
                    { biome: 'city', name: 'Theatre Lane', x: 380, z: 250, r: 80, soft: 26 },
                    { biome: 'city', name: 'Harbour Lights', pts: [[511, 180], [511, -120]], r: 60, soft: 26 },
                    { biome: 'city', name: 'Clock Square', x: 470, z: -330, r: 80, soft: 26 },
                    { biome: 'meadow', name: 'Central Park', x: 110, z: -200, r: 105, soft: 30 },
                    { biome: 'city', name: 'Museum Row', x: -120, z: -330, r: 80, soft: 26 },
                    { biome: 'town', name: 'Old Town', pts: [[-189, -220], [-189, -60]], r: 62, soft: 28 },
                    { biome: 'forest', name: 'Hilltop Park', x: -240, z: 40, r: 70, soft: 28 },
                    { biome: 'city', name: 'Riverside', x: 40, z: 120, r: 75, soft: 26 }
                ],
                features: [
                    { type: 'river', w: 18, depth: 6, pts: [[90, -520], [120, -300], [95, -120], [125, 60], [100, 330]] },
                    { type: 'sea', nx: 1, nz: 0, d: 585, shore: 12, depth: 10, level: -2, wobble: 8 },
                    { type: 'hill', x: -238, z: 40, r: 92, h: 30 },
                    { type: 'lake', x: 160, z: -230, r: 34, depth: 5 },
                    { type: 'grove', x: 60, z: -260, r: 60, count: 22, kind: 'oak' },
                    { type: 'grove', x: 175, z: -300, r: 40, count: 12, kind: 'pine' }
                ]
            },
            lines: [{ start: { cx: 39, cz: -36, h: 2 }, length: 66 }],
            events: [
                { type: 'birds', piece: 27, side: 1 },
                { type: 'blimp', piece: 90, side: -1 },
                { type: 'boats', piece: 112, side: 1 },
                { type: 'freight', line: 0, piece: 120, lead: 0 },
                { type: 'fireworks', piece: 132, side: 1, when: { night: true } },
                { type: 'birds', kind: 'gull', piece: 138, side: 1 },
                { type: 'balloons', piece: 176, side: -1, lead: 130 },
                { type: 'birds', piece: 215, side: 1 }
            ],
            thumb: { piece: 20, back: 28, side: -16, up: 14 }
        }
    ];

    function get(id) { return LIST.find(r => r.id === id) || null; }

    /** Build a route's world, its finished closed track and its decorative lines. */
    function build(id) {
        const r = typeof id === 'string' ? get(id) : id;
        if (!r) throw new Error('No route ' + id);
        const world = BNR.World.create(r.world);
        const plan = BNR.Track.fromCorners(r.corners);
        const track = BNR.Track.create({ world: world, start: plan.start });
        track.add(plan.types);
        const lines = (r.lines || []).map(function (L) {
            const t = BNR.Track.create({ world: world, start: L.start });
            const list = [];
            for (let i = 0; i < L.length; i++) list.push('S');
            t.add(list);
            return t;
        });
        return { route: r, world: world, track: track, lines: lines };
    }

    const factCache = {};
    /**
     * What a route's tile says: about how many minutes a lap takes at Medium (the run plus 7 s
     * a station), how many stations and how many pieces (Quick Build). Worked out once each;
     * facts(id, true) only reads what is ready (the menu never waits for it).
     */
    function facts(id, readyOnly) {
        if (factCache[id] || readyOnly) return factCache[id] || null;
        const b = build(id);
        const c = b.track.centerline();
        const st = b.track.stationSites().length;
        const v = BNR.Ride ? BNR.Ride.SPEEDS[1].v : 9;
        factCache[id] = { minutes: Math.max(1, Math.round((c.length / v + st * 7) / 60)), stations: st, pieces: b.track.pieces.length, length: c.length };
        return factCache[id];
    }

    return { LIST: LIST, get: get, build: build, facts: facts };
})();
