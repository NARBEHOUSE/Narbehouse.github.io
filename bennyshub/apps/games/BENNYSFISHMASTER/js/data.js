/**
 * Benny's FishMaster — static game data.
 * Geometry and randomness live in lakegen.js; state and rendering live in
 * game.js. This file is only ever read, never written — everything that
 * changes at runtime (money, owned gear, progress) lives in game.js's `save`.
 */
window.FishMasterData = (function () {
  'use strict';

  // ── Biome archetypes ─────────────────────────────────────────────────────
  // Placement of these across a lake is procedural (lakegen.js); the archetypes
  // themselves — which fish live in each — are hand-authored here. `cssVar`
  // names a theme variable (defined per colour profile in index.html's CSS),
  // the same pattern BENNYSBALLISTA uses for its block materials, so a biome's
  // canvas colour stays legible across all four colour profiles.
  const BIOMES = {
    shallows:    { id: 'shallows',    name: 'Shallows',      cssVar: '--biome-shallows' },
    weedbed:     { id: 'weedbed',     name: 'Weed Bed',      cssVar: '--biome-weedbed' },
    dropoff:     { id: 'dropoff',     name: 'Drop-off',      cssVar: '--biome-dropoff' },
    rockyshore:  { id: 'rockyshore',  name: 'Rocky Shore',   cssVar: '--biome-rockyshore' },
    deepchannel: { id: 'deepchannel', name: 'Deep Channel',  cssVar: '--biome-deepchannel' }
  };

  // ── Fish species ──────────────────────────────────────────────────────────
  // difficultyTier (2-5) sets the catch-sequence length. lengthRange/weightRange
  // are inches/lbs; a catch's actual roll is a percentile into these ranges,
  // picked by the catch sequence's quality score (see game.js rollFishCatch).
  const FISH = [
    { id: 'sunfish',      name: 'Sunfish',              biomeIds: ['shallows'],                       difficultyTier: 2, lengthRange: [4, 9],    weightRange: [0.2, 1.2],  baseValuePerWeight: 2, unlockLakeId: 'lake1' },
    { id: 'bass',         name: 'Largemouth Bass',      biomeIds: ['shallows', 'weedbed'],             difficultyTier: 3, lengthRange: [10, 24],  weightRange: [1, 8],      baseValuePerWeight: 3, unlockLakeId: 'lake1' },
    { id: 'pike',         name: 'Northern Pike',        biomeIds: ['weedbed'],                         difficultyTier: 4, lengthRange: [18, 44],  weightRange: [2, 20],     baseValuePerWeight: 4, unlockLakeId: 'lake1' },
    { id: 'perch',        name: 'Yellow Perch',         biomeIds: ['dropoff', 'rockyshore'],           difficultyTier: 2, lengthRange: [5, 12],   weightRange: [0.2, 1.5],  baseValuePerWeight: 2, unlockLakeId: 'lake1' },
    { id: 'walleye',      name: 'Walleye',              biomeIds: ['dropoff'],                         difficultyTier: 3, lengthRange: [12, 30],  weightRange: [1, 10],     baseValuePerWeight: 5, unlockLakeId: 'lake2' },
    { id: 'smallmouth',   name: 'Smallmouth Bass',      biomeIds: ['rockyshore'],                      difficultyTier: 3, lengthRange: [9, 20],   weightRange: [1, 6],      baseValuePerWeight: 4, unlockLakeId: 'lake2' },
    { id: 'catfish',      name: 'Channel Catfish',      biomeIds: ['deepchannel'],                     difficultyTier: 4, lengthRange: [14, 36],  weightRange: [2, 25],     baseValuePerWeight: 3, unlockLakeId: 'lake2' },
    { id: 'sturgeon',     name: 'Lake Sturgeon',        biomeIds: ['deepchannel'],                     difficultyTier: 5, lengthRange: [36, 84],  weightRange: [10, 120],   baseValuePerWeight: 6, unlockLakeId: 'lake3' },
    { id: 'muskie',       name: 'Muskellunge',          biomeIds: ['weedbed', 'deepchannel'],          difficultyTier: 5, lengthRange: [30, 60],  weightRange: [8, 40],     baseValuePerWeight: 7, unlockLakeId: 'lake3' },
    // Secret bonus fish — see the "??? Pill Bottle" bait below. Lives in every
    // biome so any lake can turn it up once the bait is equipped.
    { id: 'largemouth_dingus', name: 'Largemouth Dingus', biomeIds: ['shallows', 'weedbed', 'dropoff', 'rockyshore', 'deepchannel'], difficultyTier: 3, lengthRange: [12, 12], weightRange: [5, 5], baseValuePerWeight: 0, unlockLakeId: 'lake1', secret: true }
  ];

  // ── Rods (permanent gear) ─────────────────────────────────────────────────
  // Each power tier names a distance BAND (near/mid/far) that lakegen.js's
  // biome grid resolves against — a rod that lacks a 'far' tier simply cannot
  // reach the far band of any lake yet, which is what makes a rod upgrade
  // matter strategically rather than just cosmetically.
  const RODS = [
    { id: 'starter',    name: 'Starter Rod',      cost: 0,    powerTiers: [ { name: 'Light', band: 'near' }, { name: 'Medium', band: 'mid' } ],                                                       unlockLakeId: 'lake1' },
    { id: 'castmaster', name: 'CastMaster 3000',  cost: 150,  powerTiers: [ { name: 'Light', band: 'near' }, { name: 'Medium', band: 'mid' }, { name: 'Far', band: 'far' } ],                          unlockLakeId: 'lake1' },
    { id: 'longshot',   name: 'Longshot Pro',     cost: 500,  powerTiers: [ { name: 'Light', band: 'near' }, { name: 'Medium', band: 'mid' }, { name: 'Far', band: 'far' }, { name: 'Max', band: 'far' } ], unlockLakeId: 'lake2' },
    { id: 'titanium',   name: 'Titanium Ace',     cost: 1400, powerTiers: [ { name: 'Light', band: 'near' }, { name: 'Medium', band: 'mid' }, { name: 'Far', band: 'far' }, { name: 'Max', band: 'far' } ], unlockLakeId: 'lake3' }
  ];

  // ── Bait & lures (consumable, repurchasable once unlocked) ───────────────
  // biasTable multiplies a species' odds in the bite roll (see game.js
  // rollBite). A missing entry means "no effect" (multiplier of 1).
  const BAIT = [
    { id: 'plainworm',     name: 'Plain Worm',      costPerUnit: 0,    free: true, biasTable: {},                                     unlockLakeId: 'lake1' },
    { id: 'nightcrawler',  name: 'Nightcrawler',    costPerUnit: 3,    biasTable: { bass: 1.6, sunfish: 1.3 },                          unlockLakeId: 'lake1' },
    { id: 'minnowlure',    name: 'Minnow Lure',     costPerUnit: 5,    biasTable: { walleye: 1.8, perch: 1.4, smallmouth: 1.3 },        unlockLakeId: 'lake1' },
    { id: 'spinnerbait',   name: 'Spinnerbait',     costPerUnit: 8,    biasTable: { pike: 1.9, muskie: 1.5 },                           unlockLakeId: 'lake2' },
    { id: 'stinkbait',     name: 'Stink Bait',      costPerUnit: 6,    biasTable: { catfish: 2.0, sturgeon: 1.4 },                      unlockLakeId: 'lake2' },
    // Secret bonus bait — not shown until it's been unlocked (see game.js
    // shop rendering), priced deliberately absurd.
    { id: 'secret_t_pill', name: '??? Pill Bottle', costPerUnit: 5000, biasTable: { largemouth_dingus: 60 }, unlockLakeId: 'lake1', secret: true }
  ];

  // ── Non-fish catches ──────────────────────────────────────────────────────
  const ITEM_TABLE = {
    junk: [
      { id: 'boot',   name: 'Old Boot' },
      { id: 'tire',   name: 'Waterlogged Tire' },
      { id: 'tincan', name: 'Rusty Can' },
      { id: 'weeds',  name: 'Tangle of Weeds' }
    ],
    valuable: [
      { id: 'wallet', name: 'Soggy Wallet',        value: 25 },
      { id: 'phone',  name: 'Cracked Cell Phone',  value: 40 },
      { id: 'ring',   name: 'Gold Ring',           value: 80 }
    ]
  };

  // ── Lakes & level objectives ──────────────────────────────────────────────
  // biomeIds: which archetypes this lake's procedural grid draws from (2-4).
  // unlocks: what becomes available once every objective is complete.
  const LAKE_TEMPLATES = [
    {
      id: 'lake1', name: 'Cedar Hollow Pond', biomeIds: ['shallows', 'weedbed', 'dropoff'],
      objectives: [
        { type: 'catchCount',  speciesId: 'bass', amount: 3,  description: 'Catch 3 Largemouth Bass' },
        { type: 'catchWeight', amount: 15,                    description: 'Catch a cumulative 15 lbs of fish' }
      ],
      unlocks: { nextLakeId: 'lake2', speciesIds: ['walleye', 'smallmouth', 'catfish'], baitIds: ['spinnerbait', 'stinkbait'], rodIds: ['longshot'] }
    },
    {
      id: 'lake2', name: 'Blackwater Reservoir', biomeIds: ['dropoff', 'rockyshore', 'deepchannel'],
      objectives: [
        { type: 'catchLength', speciesId: 'walleye', amount: 24, description: 'Catch a Walleye 24 inches or longer' },
        { type: 'catchCount',  speciesId: 'catfish', amount: 2,  description: 'Catch 2 Channel Catfish' }
      ],
      unlocks: { nextLakeId: 'lake3', speciesIds: ['sturgeon', 'muskie'], baitIds: [], rodIds: ['titanium'] }
    },
    {
      id: 'lake3', name: 'Old Sawmill Lake', biomeIds: ['weedbed', 'deepchannel', 'shallows'],
      objectives: [
        { type: 'catchCount', speciesId: 'sturgeon', amount: 1, description: 'Catch a Lake Sturgeon' },
        { type: 'catchCount', speciesId: 'muskie',   amount: 2, description: 'Catch 2 Muskellunge' }
      ],
      unlocks: { nextLakeId: null, speciesIds: [], baitIds: [], rodIds: [] }
    }
  ];

  return { BIOMES, FISH, RODS, BAIT, ITEM_TABLE, LAKE_TEMPLATES };
})();
