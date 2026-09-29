/**
 * NARBE Racer — the eight world themes.
 *
 * A theme is everything about a circuit that is not its shape: sky, fog,
 * lighting, road paint, walls, ground, liquid, scenery and hazards. Each one
 * is a single circuit's showcase look, so the eight are deliberately far apart
 * in hue and mood — a player should know which track they are on from one
 * glance at the screen.
 *
 * Pure data, read by world.js (and the menus). Nothing here touches THREE, so
 * tools/validate_tracks.js can load it under node.
 *
 * Conventions (DESIGN.md §10.3, §9.4):
 *   - Every colour is a CSS string '#rrggbb'. They work as canvas styles and
 *     as THREE.Color inputs alike.
 *   - light intensities are physical (renderer.useLegacyLights = false,
 *     NoToneMapping), tuned like Race Tracks: a lit, up-facing surface ends up
 *     about 1.5x its albedo, so albedos stay mid-bright and emissives deep.
 *     Night themes keep strong hemisphere + ambient fill from a cool moon, so
 *     karts and hazards read as clearly as by day.
 *   - light.sunDir points FROM the scene TOWARD the sun or moon; world.js
 *     normalises it.
 *   - props.near / props.far / landmarks / hazards use EXACTLY the prop names
 *     of DESIGN.md §9.4. A name may repeat inside near/far: world.js picks
 *     uniformly from the list, so repeats are how a theme weights its mix
 *     (plenty of trees, the odd toadstool). The first name is the most common.
 *   - props.density scales how thickly the roadside is dressed (1 = Meadow).
 *   - ground.hills is the rolling-terrain amplitude in metres beyond the verge.
 *   - liquid.level is the world height of the liquid surface (the start line
 *     sits at y = 0). Every 'drop' edge on the theme's circuit stands at least
 *     2.5 m above it (tools/validate_tracks.js checks).
 *   - wall.style names the wall kit world.js draws for 'wall' edges:
 *     hedge | rock | wafer | snow | iron | castle | energy. An unknown style
 *     falls back to a plain barrier in wall.color.
 *   - road.style: asphalt | rainbow | ice | candy | stone | sand. road.base is
 *     the surface colour, edge the solid edge lines, lane the dashed lane
 *     dividers, center the bold centre dashes (lane 2 — kept gold on every
 *     track so "gold dashes = middle lane" is learnt once).
 *   - rail.a / rail.b are the No-Fail guardrail stripe colours.
 *   - music is the theme id (NK.audio has one loop per theme).
 */
NK.themes = (function () {
  'use strict';

  return {

    /* ── Sunshine Cup ─────────────────────────────────────────────────── */

    // Spring morning on the farm: saturated greens under a deep blue sky,
    // a violet-grey road that stands clear of the grass, red-and-white rails.
    meadow: {
      id: 'meadow',
      name: 'Sunny Meadow',
      night: false,
      sky: ['#2a86dd', '#79c3f1', '#e0f4fb'],
      fog: { color: '#d6eef8', near: 190, far: 760 },
      light: {
        hemiSky: '#d8efff', hemiGround: '#6aa84a', hemiInt: 2.1,
        sunColor: '#fff2d6', sunInt: 3.2, ambInt: 0.6,
        sunDir: [-0.55, 1.0, 0.45]
      },
      road: { style: 'asphalt', base: '#7a7686', edge: '#fffaf0', lane: '#aaa6b6', center: '#ffc233' },
      rail: { a: '#e63946', b: '#fdfdfd' },
      wall: { style: 'hedge', color: '#3d8c38' },
      ground: { type: 'grass', colors: ['#79c258', '#5ead47'], hills: 7 },
      liquid: null,
      props: {
        near: ['tree_round', 'tree_round', 'tree_round', 'tree_pine', 'tree_pine', 'bush', 'bush',
               'flower_patch', 'flower_patch', 'fence_wood', 'hay_bale', 'rock_small', 'toadstool'],
        far: ['tree_cluster', 'tree_cluster', 'hill_round', 'hill_round', 'windmill', 'barn', 'silo'],
        density: 1.0
      },
      landmarks: ['hot_air_balloon', 'water_tower'],
      hazards: { block: 'hay_stack', roller: 'hay_roll', geyser: null, puddle: 'mud_puddle' },
      music: 'meadow',
      ambient: 'petals'
    },

    // Bright seaside afternoon: turquoise water, pale sand, a blue-grey
    // promenade road and blue-and-white rails.
    shores: {
      id: 'shores',
      name: 'Seaside',
      night: false,
      sky: ['#1a7fd4', '#62c2ee', '#e3f7f4'],
      fog: { color: '#d8f1f1', near: 210, far: 800 },
      light: {
        hemiSky: '#dff3ff', hemiGround: '#e6cc8e', hemiInt: 2.2,
        sunColor: '#fff0cc', sunInt: 3.3, ambInt: 0.62,
        sunDir: [0.55, 0.95, -0.35]
      },
      road: { style: 'asphalt', base: '#5f7d8c', edge: '#ffffff', lane: '#9fb9c6', center: '#ffd23f' },
      rail: { a: '#1e88e5', b: '#ffffff' },
      wall: { style: 'rock', color: '#c49a62' },
      ground: { type: 'sand', colors: ['#f4dda2', '#e7c784'], hills: 3 },
      liquid: { kind: 'water', color: '#12a4d9', emissive: '#052c44', level: -3.5 },
      props: {
        near: ['palm_tree', 'palm_tree', 'palm_tree', 'beach_umbrella', 'beach_umbrella', 'rock_sand',
               'rock_sand', 'beach_grass', 'beach_grass', 'sand_castle', 'beach_ball', 'seashell', 'surf_stand'],
        far: ['sailboat', 'sailboat', 'sea_rock', 'sea_rock', 'beach_hut', 'beach_hut', 'lighthouse', 'pier'],
        density: 0.9
      },
      landmarks: ['lighthouse', 'pier'],
      hazards: { block: 'castle_big', roller: 'crab', geyser: null, puddle: 'tide_pool' },
      music: 'shores',
      ambient: null
    },

    // A sugar-land canyon: strawberry-pink road on mint-frosting ground under
    // a blueberry sky, wafer walls, candy-cane rails, a chocolate river.
    candy: {
      id: 'candy',
      name: 'Candy Land',
      night: false,
      sky: ['#4f63e8', '#a4b2ff', '#ffe1f0'],
      fog: { color: '#fbe3f1', near: 180, far: 720 },
      light: {
        hemiSky: '#ffe8f7', hemiGround: '#b27aa8', hemiInt: 2.1,
        sunColor: '#fff1e0', sunInt: 3.1, ambInt: 0.7,
        sunDir: [0.45, 1.0, 0.5]
      },
      road: { style: 'candy', base: '#d9589b', edge: '#fff4fa', lane: '#f2a3cb', center: '#ffe45c' },
      rail: { a: '#e8336b', b: '#ffffff' },
      wall: { style: 'wafer', color: '#d49a55' },
      ground: { type: 'candy', colors: ['#8fe3b8', '#6cd09f'], hills: 10 },
      liquid: { kind: 'chocolate', color: '#6a3a1e', emissive: '#1a0a03', level: -6 },
      props: {
        near: ['lollipop_tree', 'lollipop_tree', 'lollipop_tree', 'candy_cane', 'candy_cane', 'gumdrop',
               'gumdrop', 'cupcake', 'donut', 'ice_cream', 'wafer_fence'],
        far: ['candy_hill', 'candy_hill', 'cake_mountain', 'cake_mountain', 'cookie_house', 'choco_fountain'],
        density: 1.15
      },
      landmarks: ['giant_cake'],
      hazards: { block: 'cupcake_big', roller: 'gumball', geyser: null, puddle: 'choco_puddle' },
      music: 'candy',
      ambient: 'petals'
    },

    // High desert noon: deep blue sky over golden sand, a red-clay road,
    // red sandstone canyon walls and a turquoise river far below the rim.
    dunes: {
      id: 'dunes',
      name: 'Desert',
      night: false,
      sky: ['#1d6ac2', '#7fb4e0', '#f6d8a6'],
      fog: { color: '#f1d4a2', near: 200, far: 780 },
      light: {
        hemiSky: '#ffe4b8', hemiGround: '#c98a4c', hemiInt: 2.2,
        sunColor: '#ffe3b2', sunInt: 3.4, ambInt: 0.6,
        sunDir: [0.6, 0.9, 0.35]
      },
      road: { style: 'sand', base: '#b0683e', edge: '#fff3dc', lane: '#d49a74', center: '#ffd23f' },
      rail: { a: '#ff7a1a', b: '#fff6e6' },
      wall: { style: 'rock', color: '#a95b37' },
      ground: { type: 'sand', colors: ['#f0c47f', '#dfa35f'], hills: 11 },
      liquid: { kind: 'water', color: '#27b2c4', emissive: '#053a40', level: -12 },
      props: {
        near: ['cactus', 'cactus', 'cactus', 'cactus_barrel', 'cactus_barrel', 'rock_desert', 'rock_desert',
               'dry_shrub', 'dry_shrub', 'desert_sign', 'bones'],
        far: ['mesa', 'mesa', 'dune_hill', 'dune_hill', 'oasis_palm', 'oasis_palm', 'pyramid'],
        density: 0.75
      },
      landmarks: ['pyramid', 'cat_statue'],
      hazards: { block: 'boulder_desert', roller: 'tumbleweed', geyser: null, puddle: 'quicksand' },
      music: 'dunes',
      ambient: null
    },

    /* ── Moonlight Cup ────────────────────────────────────────────────── */

    // Alpenglow evening in the mountains: violet sky melting to pink, a low
    // warm sun raking across white snow, a blue ice road, blue-and-white rails.
    frost: {
      id: 'frost',
      name: 'Snowy Mountains',
      night: false,
      sky: ['#3346b0', '#9588de', '#ffc6d6'],
      fog: { color: '#eadcf0', near: 180, far: 720 },
      light: {
        hemiSky: '#e3ecff', hemiGround: '#9cb0d6', hemiInt: 2.0,
        sunColor: '#ffd8c4', sunInt: 3.0, ambInt: 0.75,
        sunDir: [-0.65, 0.62, -0.45]
      },
      road: { style: 'ice', base: '#5f86bd', edge: '#ffffff', lane: '#a3c1e8', center: '#ffd23f' },
      rail: { a: '#2f6fd6', b: '#ffffff' },
      wall: { style: 'snow', color: '#eef4ff' },
      ground: { type: 'snow', colors: ['#f5f9ff', '#dde7f7'], hills: 13 },
      liquid: { kind: 'water', color: '#3aa6d6', emissive: '#0a2c48', level: -12 },
      props: {
        near: ['pine_snowy', 'pine_snowy', 'pine_snowy', 'snow_drift', 'snow_drift', 'snow_rock', 'snow_rock',
               'ice_crystal', 'ice_crystal', 'snowman', 'lamp_snowy'],
        far: ['snowy_mountain', 'snowy_mountain', 'pine_cluster_snowy', 'pine_cluster_snowy', 'cabin', 'ski_tower'],
        density: 0.95
      },
      landmarks: ['igloo', 'ice_arch'],
      hazards: { block: 'snowman_big', roller: 'snowball', geyser: null, puddle: 'ice_patch' },
      music: 'frost',
      ambient: 'snow'
    },

    // A moonlit haunted forest: violet night sky, silver-blue moonlight with
    // strong fill, cobbles edged in pumpkin orange, orange-and-black rails,
    // a murky bog under the old bridge.
    spooky: {
      id: 'spooky',
      name: 'Haunted Forest',
      night: true,
      sky: ['#100828', '#361f64', '#6c4388'],
      fog: { color: '#4a3172', near: 160, far: 640 },
      light: {
        hemiSky: '#a597ff', hemiGround: '#3b2a52', hemiInt: 1.85,
        sunColor: '#d2dcff', sunInt: 2.4, ambInt: 1.0,
        sunDir: [0.4, 0.9, -0.5]
      },
      road: { style: 'stone', base: '#5c536f', edge: '#ffae42', lane: '#8e84a6', center: '#ffd23f' },
      rail: { a: '#ff8a1a', b: '#2a1f3d' },
      wall: { style: 'iron', color: '#2e2744' },
      ground: { type: 'moss', colors: ['#40603c', '#2f4a31'], hills: 6 },
      liquid: { kind: 'water', color: '#2f5f4a', emissive: '#0b2a1d', level: -4 },
      props: {
        near: ['dead_tree', 'dead_tree', 'dead_tree', 'gravestone', 'gravestone', 'pumpkin', 'pumpkin',
               'glow_mushroom', 'glow_mushroom', 'lantern_post', 'iron_fence'],
        far: ['dead_tree_big', 'dead_tree_big', 'spooky_hill', 'spooky_hill', 'haunted_house'],
        density: 1.0
      },
      landmarks: ['haunted_house', 'bell_tower'],
      hazards: { block: 'pumpkin_big', roller: 'ghost', geyser: null, puddle: 'goo_puddle' },
      music: 'spooky',
      ambient: 'leaves'
    },

    // A volcano fortress: ember-red sky, warm key light with an orange lava
    // under-glow, dark basalt flagstones with gold edges, hazard-stripe rails.
    lava: {
      id: 'lava',
      name: 'Volcano Castle',
      night: true,
      sky: ['#1a0508', '#4c1016', '#b3361d'],
      fog: { color: '#6a2117', near: 160, far: 660 },
      light: {
        hemiSky: '#ffb892', hemiGround: '#ff521c', hemiInt: 1.9,
        sunColor: '#ffcf9e', sunInt: 2.6, ambInt: 0.85,
        sunDir: [-0.4, 0.9, 0.5]
      },
      road: { style: 'stone', base: '#4b4452', edge: '#ffcf3f', lane: '#7b7384', center: '#ffd23f' },
      rail: { a: '#ffcf3f', b: '#1d1b2e' },
      wall: { style: 'castle', color: '#6e6675' },
      ground: { type: 'rock', colors: ['#3b3034', '#2a2226'], hills: 8 },
      liquid: { kind: 'lava', color: '#ff6116', emissive: '#a82200', level: -5 },
      props: {
        near: ['lava_rock', 'lava_rock', 'spike_rock', 'spike_rock', 'torch_pillar', 'torch_pillar',
               'chain_post', 'skull_rock'],
        far: ['castle_wall_piece', 'castle_wall_piece', 'rock_spire', 'rock_spire', 'castle_tower',
              'castle_tower', 'volcano'],
        density: 0.9
      },
      landmarks: ['castle_gate', 'volcano'],
      hazards: { block: 'stone_block', roller: 'rolling_boulder', geyser: 'lava_geyser', puddle: 'ash_puddle' },
      music: 'lava',
      ambient: 'embers'
    },

    // Open space: indigo-black sky, starlight fill from everywhere, a rainbow
    // road with cyan-and-magenta rails and glowing energy walls, the void below.
    starlight: {
      id: 'starlight',
      name: 'Outer Space',
      night: true,
      sky: ['#05021a', '#1c0b4a', '#4a1d7a'],
      fog: { color: '#1e1048', near: 280, far: 1050 },
      light: {
        hemiSky: '#bba6ff', hemiGround: '#2a1a5c', hemiInt: 1.8,
        sunColor: '#e6eeff', sunInt: 2.6, ambInt: 1.1,
        sunDir: [0.4, 0.9, -0.5]
      },
      road: { style: 'rainbow', base: '#2a1f5c', edge: '#ffffff', lane: '#9a8ae6', center: '#ffe45c' },
      rail: { a: '#34e0ff', b: '#ff4fd8' },
      wall: { style: 'energy', color: '#2fbfff' },
      ground: { type: 'none', colors: ['#140a33', '#0a0520'], hills: 0 },
      liquid: { kind: 'void', color: '#0b0624', emissive: '#000000', level: -40 },
      props: {
        near: ['star_buoy', 'star_buoy', 'light_pylon', 'light_pylon', 'asteroid_small', 'asteroid_small',
               'crystal_spire', 'ring_gate'],
        far: ['planet', 'planet', 'comet', 'comet', 'planet_ringed', 'space_station'],
        density: 0.6
      },
      landmarks: ['space_station', 'moon_big'],
      hazards: { block: 'space_rock', roller: 'meteor', geyser: 'plasma_vent', puddle: 'gravity_well' },
      music: 'starlight',
      ambient: 'stars'
    }
  };
})();
