/**
 * NARBE Build n Ride - the biomes, as data.
 *
 * A biome says how its ground looks in each season, how lumpy it is, how
 * high the track runs through it (datum: added to the world's smooth track
 * level), what grows or stands there, what kind of bridge it builds, what
 * its stations are called and what it sounds like.
 *
 *   relief: { type: 'rolling' | 'mountain' | 'dunes' | 'flat', amp, wave }
 *   ground: { spring, summer, fall, winter }    main ground colour
 *   ground2: { ... }                            the colour patches blend toward
 *   props: [{ kind, density }]                  density = props per square unit
 *   snowy: true                                 snow in every season
 *
 * Add a biome by adding an entry here; js/props.js must know each prop kind.
 * Flags: snowy (snow all year), town (houses on lots), city (a street grid
 * in the ground colour), fields (patchwork farm fields).
 */

window.BNR = window.BNR || {};

BNR.Biomes = (function () {
    'use strict';

    const SEASONS = ['spring', 'summer', 'fall', 'winter'];
    const SNOW = '#eef3f7';

    const LIST = {
        meadow: {
            name: 'Meadow',
            stationNames: ['Green Meadow', 'Buttercup Fields', 'Daisy Hill', 'Clover Field', 'Sunny Meadow'],
            relief: { type: 'rolling', amp: 2.4, wave: 85 },
            datum: 0,
            ground: { spring: '#8bd065', summer: '#7cc15a', fall: '#b9b45c', winter: SNOW },
            ground2: { spring: '#a7dc72', summer: '#96cc5e', fall: '#cfa957', winter: '#e3eaef' },
            props: [
                { kind: 'oak', density: 0.0007 }, { kind: 'bush', density: 0.0012 },
                { kind: 'flowers', density: 0.0035 }, { kind: 'rock', density: 0.0003 }
            ],
            bridge: 'stone', ambient: 'birds'
        },
        farm: {
            name: 'Farmland',
            stationNames: ['Haystack Farm', 'Barnyard', 'Cornfield Corner', 'Apple Orchard', 'Windmill Way'],
            relief: { type: 'rolling', amp: 1.3, wave: 120 },
            datum: 0,
            fields: true,
            ground: { spring: '#94cf63', summer: '#86c35b', fall: '#c6a85a', winter: SNOW },
            ground2: { spring: '#a9d873', summer: '#9acb62', fall: '#d0b06a', winter: '#e3eaef' },
            props: [
                { kind: 'oak', density: 0.00035 }, { kind: 'haybale', density: 0.0006 },
                { kind: 'cow', density: 0.00026 }, { kind: 'sheep', density: 0.00026 }, { kind: 'bush', density: 0.0004 }
            ],
            bridge: 'stone', ambient: 'birds'
        },
        forest: {
            name: 'Forest',
            stationNames: ['Pine Forest', 'Whispering Woods', 'Maple Grove', 'Owl Hollow', 'Deep Woods'],
            relief: { type: 'rolling', amp: 3.4, wave: 60 },
            datum: 1,
            ground: { spring: '#6aac4f', summer: '#5b9b44', fall: '#a8783f', winter: SNOW },
            ground2: { spring: '#7cb85a', summer: '#6aa74c', fall: '#c08a46', winter: '#e3eaef' },
            props: [
                { kind: 'pine', density: 0.0065 }, { kind: 'oak', density: 0.002 },
                { kind: 'bush', density: 0.0012 }, { kind: 'rock', density: 0.0005 }, { kind: 'deer', density: 0.00007 }
            ],
            bridge: 'wood', ambient: 'forest'
        },
        lake: {
            name: 'Lakeside',
            stationNames: ['Lakeside', 'Willow Shore', 'Duck Pond', 'Blue Lake', 'Reed Bay'],
            relief: { type: 'rolling', amp: 1.8, wave: 80 },
            datum: -1,
            lake: true,
            ground: { spring: '#8ccd6a', summer: '#7fc35e', fall: '#b8b060', winter: SNOW },
            ground2: { spring: '#a0d677', summer: '#93cb66', fall: '#c9a95e', winter: '#e3eaef' },
            props: [
                { kind: 'oak', density: 0.0009 }, { kind: 'reeds', density: 0.002 },
                { kind: 'bush', density: 0.001 }, { kind: 'rock', density: 0.0003 }
            ],
            bridge: 'steel', ambient: 'water'
        },
        mountains: {
            name: 'Mountains',
            stationNames: ['Eagle Peak', 'Rocky Ridge', 'High Pass', 'Summit', 'Boulder Gap'],
            relief: { type: 'mountain', amp: 40, wave: 150 },
            datum: 10,
            snowline: 24,
            ground: { spring: '#7fa862', summer: '#76a05a', fall: '#a3965c', winter: SNOW },
            ground2: { spring: '#8db56c', summer: '#86ad63', fall: '#b0a067', winter: '#e3eaef' },
            rock: '#8c8780',
            props: [
                { kind: 'pine', density: 0.0026 }, { kind: 'rock', density: 0.0016 }, { kind: 'boulder', density: 0.0005 }
            ],
            bridge: 'steel', ambient: 'wind'
        },
        desert: {
            name: 'Desert',
            stationNames: ['Sandy Canyon', 'Cactus Flats', 'Dusty Gulch', 'Red Rock', 'Sunset Mesa'],
            relief: { type: 'dunes', amp: 2.8, wave: 46 },
            datum: 2,
            ground: { spring: '#ecca8c', summer: '#e8c486', fall: '#e4bd80', winter: '#e9d5ad' },
            ground2: { spring: '#e2b878', summer: '#ddb172', fall: '#d9a96c', winter: '#dcc7a0' },
            rock: '#c47e55',
            props: [
                { kind: 'cactus', density: 0.0014 }, { kind: 'desertrock', density: 0.0008 }, { kind: 'scrub', density: 0.0012 }
            ],
            bridge: 'wood', ambient: 'desert'
        },
        snowfield: {
            name: 'Snowfield',
            stationNames: ['Snowy Hollow', 'Frosty Flats', 'Polar Point', 'Icicle Hill', 'Winter Wood'],
            relief: { type: 'rolling', amp: 4.2, wave: 75 },
            datum: 4,
            snowy: true,
            ground: { spring: '#eef3f6', summer: '#edf2f5', fall: '#eef3f6', winter: '#f3f7fa' },
            ground2: { spring: '#dfe8ee', summer: '#dde6ec', fall: '#dfe8ee', winter: '#e6eef3' },
            rock: '#9aa3ab',
            props: [
                { kind: 'snowpine', density: 0.0035 }, { kind: 'rock', density: 0.0005 }, { kind: 'snowman', density: 0.00004 }
            ],
            bridge: 'steel', ambient: 'snow'
        },
        town: {
            name: 'Town',
            stationNames: ['Main Street', 'Market Square', 'Old Town', 'Clock Tower', 'Village Green'],
            relief: { type: 'flat', amp: 0.45, wave: 70 },
            datum: 0,
            town: true,
            ground: { spring: '#8ecb66', summer: '#83c25d', fall: '#b8b061', winter: SNOW },
            ground2: { spring: '#9dd472', summer: '#92ca66', fall: '#c7a861', winter: '#e3eaef' },
            props: [
                { kind: 'house', density: 0.0011 }, { kind: 'oak', density: 0.0005 }, { kind: 'bush', density: 0.0008 }
            ],
            bridge: 'stone', ambient: 'town'
        },
        // --- route biomes --------------------------------------------------------------------
        coast: {
            name: 'Coast',
            stationNames: ['Seagull Point', 'Sandy Cove', 'Lighthouse Bay', 'Cliff Top', 'Shell Beach'],
            relief: { type: 'rolling', amp: 2.0, wave: 90 },
            datum: 6,
            ground: { spring: '#93cf6a', summer: '#88c35d', fall: '#b5b25f', winter: SNOW },
            ground2: { spring: '#a9d97a', summer: '#9dcc69', fall: '#c7aa5f', winter: '#e3eaef' },
            rock: '#a39b8f',
            props: [
                { kind: 'bush', density: 0.0009 }, { kind: 'flowers', density: 0.0022 }, { kind: 'rock', density: 0.0007 },
                { kind: 'pine', density: 0.0005 }, { kind: 'sheep', density: 0.00016 }
            ],
            bridge: 'stone', ambient: 'sea'
        },
        city: {
            name: 'City',
            stationNames: ['Central Station', 'City Hall', 'Clock Square', 'Union Street', 'Riverside'],
            relief: { type: 'flat', amp: 0.25, wave: 80 },
            datum: 0,
            city: true,
            ground: { spring: '#a3a8ae', summer: '#a1a6ac', fall: '#a3a3a0', winter: '#e4e9ee' },
            ground2: { spring: '#959aa1', summer: '#93989f', fall: '#979893', winter: '#d9e0e6' },
            props: [
                { kind: 'building', density: 0.0026 }, { kind: 'oak', density: 0.0003 }, { kind: 'bush', density: 0.0003 }
            ],
            bridge: 'steel', ambient: 'city'
        },
        snowforest: {
            name: 'Snowy Forest',
            stationNames: ['Pine Hollow', 'Frosty Woods', 'Snowdrift', 'Fir Grove', 'Silver Birch'],
            relief: { type: 'rolling', amp: 3.6, wave: 62 },
            datum: 3,
            snowy: true,
            ground: { spring: '#eaf0f4', summer: '#e8eff3', fall: '#eaf0f4', winter: '#f2f6f9' },
            ground2: { spring: '#dbe5ec', summer: '#d9e3ea', fall: '#dbe5ec', winter: '#e4edf2' },
            rock: '#9aa3ab',
            props: [
                { kind: 'snowpine', density: 0.0062 }, { kind: 'rock', density: 0.0004 }, { kind: 'deer', density: 0.00006 }, { kind: 'snowman', density: 0.00003 }
            ],
            bridge: 'wood', ambient: 'snow'
        },
        snowvillage: {
            name: 'Snowy Village',
            stationNames: ['Chalet Green', 'Mistletoe Lane', 'Lantern Square', 'Sleigh Bell', 'Cosy Corner'],
            relief: { type: 'flat', amp: 0.5, wave: 70 },
            datum: 2,
            snowy: true,
            town: true,
            ground: { spring: '#eef3f6', summer: '#edf2f5', fall: '#eef3f6', winter: '#f3f7fa' },
            ground2: { spring: '#e2eaef', summer: '#e0e8ee', fall: '#e2eaef', winter: '#e8eff4' },
            props: [
                { kind: 'chalet', density: 0.0012 }, { kind: 'snowpine', density: 0.0012 }, { kind: 'snowman', density: 0.0001 }
            ],
            bridge: 'stone', ambient: 'town'
        },
        oasis: {
            name: 'Oasis',
            stationNames: ['Palm Springs', 'Oasis Well', 'Date Grove', 'Green Pool', 'Mirage'],
            relief: { type: 'flat', amp: 0.7, wave: 60 },
            datum: 1,
            town: true,
            ground: { spring: '#c9cf8a', summer: '#c4c784', fall: '#cfc286', winter: '#d8d0aa' },
            ground2: { spring: '#9cc06a', summer: '#95b864', fall: '#b5b26a', winter: '#c9c49e' },
            rock: '#c47e55',
            props: [
                { kind: 'palm', density: 0.0018 }, { kind: 'adobe', density: 0.0009 }, { kind: 'reeds', density: 0.0012 }, { kind: 'cactus', density: 0.0002 }
            ],
            bridge: 'wood', ambient: 'water'
        },
        redrock: {
            name: 'Red Rock',
            stationNames: ['Red Rock', 'Arch View', 'Canyon Rim', 'Painted Cliffs', 'Copper Butte'],
            relief: { type: 'rolling', amp: 3.0, wave: 58 },
            datum: 3,
            ground: { spring: '#dc9a66', summer: '#d8915c', fall: '#d38955', winter: '#e4c3a6' },
            ground2: { spring: '#c97d4e', summer: '#c47447', fall: '#be6d42', winter: '#d8b293' },
            rock: '#b4603c',
            props: [
                { kind: 'desertrock', density: 0.0016 }, { kind: 'scrub', density: 0.0009 }, { kind: 'cactus', density: 0.0005 }
            ],
            bridge: 'wood', ambient: 'desert'
        },
        dunes: {
            name: 'Sand Dunes',
            stationNames: ['Golden Dunes', 'Sandy Ridge', 'Camel Hump', 'Sunny Sands', 'Windy Dunes'],
            relief: { type: 'dunes', amp: 5.2, wave: 64 },
            datum: 2,
            ground: { spring: '#f2dba2', summer: '#f0d697', fall: '#ecd08f', winter: '#f1e3c1' },
            ground2: { spring: '#e8c886', summer: '#e5c27c', fall: '#dfba74', winter: '#e8d6b0' },
            rock: '#d1a36c',
            props: [
                { kind: 'scrub', density: 0.0004 }, { kind: 'cactus', density: 0.0002 }
            ],
            bridge: 'wood', ambient: 'desert'
        },
        alpine: {
            name: 'Alpine Meadow',
            stationNames: ['Edelweiss', 'Cowbell Meadow', 'High Pasture', 'Summit View', 'Gentian Field'],
            relief: { type: 'rolling', amp: 3.2, wave: 70 },
            datum: 12,
            snowline: 30,
            ground: { spring: '#8fd46a', summer: '#82c65c', fall: '#b7ae5c', winter: SNOW },
            ground2: { spring: '#a4dc7a', summer: '#96cf66', fall: '#c9a85e', winter: '#e3eaef' },
            rock: '#8c8780',
            props: [
                { kind: 'flowers', density: 0.004 }, { kind: 'rock', density: 0.0012 }, { kind: 'pine', density: 0.0012 }, { kind: 'cow', density: 0.00022 }
            ],
            bridge: 'steel', ambient: 'wind'
        }
    };

    /**
     * Leaf colours for each season. Each prop instance picks one variant, so a
     * fall forest is a mix of oranges, reds and yellows. 'snowy' foliage stays
     * the same all year.
     */
    const FOLIAGE = {
        leaf: {
            spring: ['#7fcf66', '#8fd870', '#f2a9c8', '#f7c6da', '#76c35e'],
            summer: ['#4caf50', '#3e9b4f', '#5cb85c', '#6cc04a'],
            fall: ['#e07b2a', '#d2452f', '#e8b53a', '#c96a2b', '#e39b35'],
            winter: ['#e6edf1', '#dfe7ec', '#eef3f6']
        },
        pine: {
            spring: ['#2f7d4a', '#357f4c', '#2b744a'],
            summer: ['#2c7546', '#2f7d4a', '#276b43'],
            fall: ['#2c6e45', '#31704a', '#29663f'],
            winter: ['#2a5e40', '#2c6142', '#285a3d']
        },
        bush: {
            spring: ['#79c25c', '#86cb64', '#e9a3c4'],
            summer: ['#4e9f45', '#5aa84c', '#468f40'],
            fall: ['#c9782f', '#b8552d', '#d7a33a'],
            winter: ['#dfe7ec', '#e8eef2']
        },
        grass: {
            spring: ['#8fd06a'], summer: ['#7fbf55'], fall: ['#c2a85a'], winter: ['#e3eaef']
        },
        flowers: {
            spring: ['#ffd84a', '#ff7aa8', '#ffffff', '#b98cff'],
            summer: ['#ffd84a', '#ff6b5e', '#ffffff', '#ff9f43'],
            fall: ['#e8b53a', '#d2452f', '#c96a2b'],
            winter: ['#e6edf1']
        }
    };

    function get(id) { return LIST[id] || LIST.meadow; }
    function ids() { return Object.keys(LIST); }

    /** Colour of a biome's ground in a season (blend: 0 = ground, 1 = ground2). */
    function groundRGB(id, season, blend) {
        const b = get(id);
        const a = BNR.Util.hexRGB(b.ground[season] || b.ground.summer);
        const c = BNR.Util.hexRGB((b.ground2 || b.ground)[season] || b.ground.summer);
        return BNR.Util.mixRGB(a, c, blend || 0);
    }

    return {
        SEASONS: SEASONS,
        LIST: LIST,
        FOLIAGE: FOLIAGE,
        SNOW: SNOW,
        get: get,
        ids: ids,
        groundRGB: groundRGB
    };
})();
