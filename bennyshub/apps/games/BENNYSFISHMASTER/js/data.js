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
  // `reachFrac` is how far a rod throws at full charge, as a fraction of
  // CFG.LAKE_MAX_R. The depth bands (LG.BAND_FRAC) are fractions of the
  // FISHABLE WATER in a direction, which with art.js loaded is the painted
  // shoreline inset by WATER_INSET — so reach and the pond's shape interact:
  // the same rod reaches the deep channel where the pond runs short and falls
  // into the drop-off where it runs long. That is what makes both a rod
  // upgrade and a choice of direction matter, instead of the old named power
  // tiers where two of the four rods reached exactly the same water.
  //
  // These four numbers are DERIVED, not chosen by feel. The painted bank runs
  // 0.666-1.123 of LAKE_MAX_R (radiusMul 0.85-1.15 times art.js's own seeded
  // shoreline noise of +/-0.11, times WATER_INSET 0.88), so with band edges at
  // .28/.52/.78/1.0 each rod has a window it must sit inside:
  //
  //   starter     > .28x1.123 = .315  (mid everywhere)   < .52x0.666 = .346  (never far)
  //   castmaster  > .346  (far somewhere)                < .78x0.666 = .519  (never deep)
  //   longshot    > .52x1.123 = .584  (far everywhere)   < .78x1.123 = .876  (not deep everywhere)
  //   titanium    > .876  (deep everywhere)
  //
  // Widen radiusMul, or art.js's shoreline noise, or move a band edge, and
  // these windows move with them — the values below stop being correct and the
  // progression quietly breaks. Re-derive from the bounds above if any of that
  // changes; `starter` in particular has only a .03 window to sit in.
  const RODS = [
    { id: 'starter',    name: 'Starter Rod',      cost: 0,    reachFrac: 0.330, reachNote: 'Reaches the mid-range water in any direction.',                   unlockLakeId: 'lake1' },
    { id: 'castmaster', name: 'CastMaster 3000',  cost: 150,  reachFrac: 0.470, reachNote: 'Reaches the far water where the pond runs short.',                unlockLakeId: 'lake1' },
    { id: 'longshot',   name: 'Longshot Pro',     cost: 500,  reachFrac: 0.660, reachNote: 'Reaches the far water anywhere, and the deep water where short.', unlockLakeId: 'lake2' },
    { id: 'titanium',   name: 'Titanium Ace',     cost: 1400, reachFrac: 1.050, reachNote: 'Reaches the deep water in every direction.',                      unlockLakeId: 'lake3' }
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
  // `biomeIds` is FOUR archetypes in depth order, read as two pairs: the first
  // pair fills the near and mid bands, the second the far and deep bands. Each
  // sector flips each pair on a seeded coin toss (lakegen.js), so which of the
  // two shallow biomes sits closest to the boat — and which deep one sits at
  // the back — changes with the direction you cast. Depth order itself never
  // shuffles, so "further out" always means "deeper", and a rod upgrade always
  // opens water that was genuinely out of reach before.
  //
  // `objectivePool` is a PREFERENCE ORDER, not a fixed list. On the first visit
  // to a lake, game.js picks the first `objectiveCount` entries that this lake
  // can actually deliver — the species has to live in a biome the lake owns,
  // has to be unlocked by then, and has to be reachable with the best rod the
  // player is able to buy at that point — re-rolling the lake's seed a few
  // times to try to satisfy the preferred ones (see pickLakeSetup). Every pool
  // ends with a species-agnostic objective that any lake with fish in it can
  // satisfy, so the filter can never come up empty and hand out an objective
  // that cannot be completed on the level it belongs to.
  //
  // unlocks: what becomes available once every objective is complete.
  const LAKE_TEMPLATES = [
    {
      id: 'lake1', name: 'Cedar Hollow Pond',
      biomeIds: ['shallows', 'weedbed', 'dropoff', 'rockyshore'],
      objectiveCount: 2,
      objectivePool: [
        { id: 'l1_bass3',    type: 'catchCount',  speciesId: 'bass',    amount: 3,  description: 'Catch 3 Largemouth Bass' },
        { id: 'l1_weight15', type: 'catchWeight',                       amount: 15, description: 'Catch a cumulative 15 lbs of fish' },
        { id: 'l1_pike1',    type: 'catchCount',  speciesId: 'pike',    amount: 1,  description: 'Catch a Northern Pike' },
        { id: 'l1_sunfish4', type: 'catchCount',  speciesId: 'sunfish', amount: 4,  description: 'Catch 4 Sunfish' },
        { id: 'l1_any6',     type: 'catchCount',                        amount: 6,  description: 'Catch any 6 fish' }
      ],
      unlocks: { nextLakeId: 'lake2', speciesIds: ['walleye', 'smallmouth', 'catfish'], baitIds: ['spinnerbait', 'stinkbait'], rodIds: ['longshot'] }
    },
    {
      id: 'lake2', name: 'Blackwater Reservoir',
      biomeIds: ['shallows', 'rockyshore', 'dropoff', 'deepchannel'],
      objectiveCount: 2,
      objectivePool: [
        { id: 'l2_walleye24',    type: 'catchLength', speciesId: 'walleye',    amount: 24, description: 'Catch a Walleye 24 inches or longer' },
        { id: 'l2_catfish2',     type: 'catchCount',  speciesId: 'catfish',    amount: 2,  description: 'Catch 2 Channel Catfish' },
        { id: 'l2_smallmouth3',  type: 'catchCount',  speciesId: 'smallmouth', amount: 3,  description: 'Catch 3 Smallmouth Bass' },
        { id: 'l2_weight60',     type: 'catchWeight',                          amount: 60, description: 'Catch a cumulative 60 lbs of fish' },
        { id: 'l2_any8',         type: 'catchCount',                           amount: 8,  description: 'Catch any 8 fish' }
      ],
      unlocks: { nextLakeId: 'lake3', speciesIds: ['sturgeon', 'muskie'], baitIds: [], rodIds: ['titanium'] }
    },
    {
      id: 'lake3', name: 'Old Sawmill Lake',
      biomeIds: ['shallows', 'weedbed', 'dropoff', 'deepchannel'],
      objectiveCount: 2,
      objectivePool: [
        { id: 'l3_sturgeon1',  type: 'catchCount',  speciesId: 'sturgeon', amount: 1,   description: 'Catch a Lake Sturgeon' },
        { id: 'l3_muskie2',    type: 'catchCount',  speciesId: 'muskie',   amount: 2,   description: 'Catch 2 Muskellunge' },
        { id: 'l3_weight150',  type: 'catchWeight',                        amount: 150, description: 'Catch a cumulative 150 lbs of fish' },
        { id: 'l3_any10',      type: 'catchCount',                         amount: 10,  description: 'Catch any 10 fish' }
      ],
      unlocks: { nextLakeId: null, speciesIds: [], baitIds: [], rodIds: [] }
    }
  ];

  return { BIOMES, FISH, RODS, BAIT, ITEM_TABLE, LAKE_TEMPLATES };
})();
