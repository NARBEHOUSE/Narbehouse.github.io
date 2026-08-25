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
    { id: 'rockbass',     name: 'Rock Bass',            biomeIds: ['rockyshore'],                      difficultyTier: 2, lengthRange: [6, 10],   weightRange: [0.3, 1.5],  baseValuePerWeight: 2, unlockLakeId: 'lake1' },
    { id: 'crappie',      name: 'Black Crappie',        biomeIds: ['shallows', 'weedbed'],             difficultyTier: 2, lengthRange: [8, 15],   weightRange: [0.5, 3],    baseValuePerWeight: 3, unlockLakeId: 'lake1' },
    { id: 'walleye',      name: 'Walleye',              biomeIds: ['dropoff'],                         difficultyTier: 3, lengthRange: [12, 30],  weightRange: [1, 10],     baseValuePerWeight: 5, unlockLakeId: 'lake2' },
    { id: 'smallmouth',   name: 'Smallmouth Bass',      biomeIds: ['rockyshore'],                      difficultyTier: 3, lengthRange: [9, 20],   weightRange: [1, 6],      baseValuePerWeight: 4, unlockLakeId: 'lake2' },
    { id: 'catfish',      name: 'Channel Catfish',      biomeIds: ['deepchannel'],                     difficultyTier: 4, lengthRange: [14, 36],  weightRange: [2, 25],     baseValuePerWeight: 3, unlockLakeId: 'lake2' },
    { id: 'carp',         name: 'Common Carp',          biomeIds: ['shallows', 'dropoff'],             difficultyTier: 3, lengthRange: [16, 34],  weightRange: [4, 30],     baseValuePerWeight: 2, unlockLakeId: 'lake2' },
    { id: 'burbot',       name: 'Burbot',               biomeIds: ['deepchannel'],                     difficultyTier: 4, lengthRange: [15, 30],  weightRange: [1, 8],      baseValuePerWeight: 5, unlockLakeId: 'lake2' },
    { id: 'sturgeon',     name: 'Lake Sturgeon',        biomeIds: ['deepchannel'],                     difficultyTier: 5, lengthRange: [36, 84],  weightRange: [10, 120],   baseValuePerWeight: 6, unlockLakeId: 'lake3' },
    { id: 'muskie',       name: 'Muskellunge',          biomeIds: ['weedbed', 'deepchannel'],          difficultyTier: 5, lengthRange: [30, 60],  weightRange: [8, 40],     baseValuePerWeight: 7, unlockLakeId: 'lake3' },
    { id: 'gar',          name: 'Longnose Gar',         biomeIds: ['weedbed', 'deepchannel'],          difficultyTier: 4, lengthRange: [24, 48],  weightRange: [3, 18],     baseValuePerWeight: 4, unlockLakeId: 'lake3' },
    // Secret bonus fish — see the "Vitamin T" secret bait below. Lives in
    // every biome so any lake can turn it up once the bait is equipped.
    { id: 'largemouth_dingus', name: 'Largemouth Dingus', biomeIds: ['shallows', 'weedbed', 'dropoff', 'rockyshore', 'deepchannel'], difficultyTier: 3, lengthRange: [12, 12], weightRange: [5, 5], baseValuePerWeight: 0, unlockLakeId: 'lake1', secret: true }
  ];

  // ── Rods (permanent gear) ─────────────────────────────────────────────────
  // `reachFt` is how far a rod throws at full charge, in real feet — the same
  // unit each lake's `maxRadiusFt` (below) is measured in. At runtime a rod's
  // actual reachFrac (fraction of CFG.LAKE_MAX_R, what every band/landing
  // calculation in game.js actually uses) is reachFt divided by the CURRENT
  // lake's maxRadiusFt, computed fresh by game.js's reachFracOf() rather than
  // stored here — the same rod throws a smaller fraction of a bigger lake.
  // That division is the whole progression: a rod bought on a small lake goes
  // slack on a bigger one, which is what makes the next rod worth buying
  // instead of a number going up for its own sake. Every value below is a
  // multiple of 25 feet, the standard unit this game measures both rods and
  // lakes against.
  //
  // The depth bands (LG.BAND_FRAC) are fractions of the FISHABLE WATER in a
  // direction, which with art.js loaded is the painted shoreline inset by
  // WATER_INSET — so reach and the pond's shape interact: the same rod reaches
  // the deep channel where the pond runs short and falls into the drop-off
  // where it runs long.
  //
  // Each reachFt is DERIVED, not chosen by feel, against its own HOME lake
  // (the lake named in unlockLakeId — where it is first sold). Two passes go
  // into that derivation:
  //
  // 1. A coarse worst-case bound: the painted bank runs 0.666-1.123 of a
  //    lake's maxRadiusFt (radiusMul 0.85-1.15 times art.js's own seeded
  //    shoreline noise of +/-0.11, times WATER_INSET 0.88), so with band edges
  //    at .28/.52/.78/1.0, reachFt / homeLake.maxRadiusFt has to clear:
  //
  //      starter     > .28x1.123 = .315  (mid everywhere)   < .52x0.666 = .346  (never far)
  //      castmaster  > .346  (far somewhere)                < .78x0.666 = .519  (never deep)
  //      longshot    > .52x1.123 = .584  (far everywhere)   < .78x1.123 = .876  (not deep everywhere)
  //      titanium    > .876  (deep everywhere)
  //
  //    That bound uses the worst 5-sector alignment the noise could produce,
  //    which real generated lakes rarely land on — a rod sitting right above
  //    a band's floor by this measure can still miss that band on 4 of 5
  //    sectors in practice (confirmed by simulating LG.generateLake against
  //    real seeds: at the floor, castmaster reached "far" on only 1-3 of 5).
  //
  // 2. A Monte Carlo check against thousands of actual generateLake() rolls,
  //    counting how many of the 5 sectors actually land in the intended band.
  //    castmaster's 125ft clears "far" on all 5 sectors ~96% of the time (and
  //    the rest, 4 of 5), with an incidental "deep" sector in only ~4% of
  //    lakes — a bonus in the shortest direction, not a break in the design.
  //    longshot and titanium already hit their bands on 5/5 sectors at the
  //    coarse-bound numbers, so only castmaster needed the second pass.
  //
  // Carried to a LATER (bigger) lake, the same reachFt divides by a larger
  // maxRadiusFt and slides into a weaker window there — e.g. castmaster's
  // 125ft, which clears "far" everywhere at Cedar Hollow Pond (225ft), only
  // reaches "mid" at Blackwater Reservoir (350ft: 125/350 = .357). That
  // relegation is intentional; it's what makes the rod sold at the bigger
  // lake worth buying.
  //
  // Widen radiusMul, art.js's shoreline noise, or move a band edge, and both
  // passes need re-running — the coarse bound as a sanity floor, the
  // simulation as the actual target.
  // `description` is flavor text for the rod-reveal card (game.js's
  // rodreveal overlay, shown the moment a rod is bought) — reachNote covers
  // the mechanical fact, description is the one line of character alongside it.
  const RODS = [
    { id: 'starter',    name: 'Starter Rod',      cost: 0,    reachFt: 75,  reachNote: 'Casts up to 75 feet at full charge.',  unlockLakeId: 'lake1', description: "Comes standard. Nothing wrong with it, exactly." },
    { id: 'castmaster', name: 'CastMaster 3000',  cost: 150,  reachFt: 125, reachNote: 'Casts up to 125 feet at full charge.', unlockLakeId: 'lake1', description: "A stiffer blank and a longer cast, for the price of an afternoon's earnings." },
    { id: 'longshot',   name: 'Longshot Pro',     cost: 500,  reachFt: 225, reachNote: 'Casts up to 225 feet at full charge.', unlockLakeId: 'lake2', description: "Built to reach water the CastMaster can only look at." },
    { id: 'titanium',   name: 'Titanium Ace',     cost: 1400, reachFt: 500, reachNote: 'Casts up to 500 feet at full charge.', unlockLakeId: 'lake3', description: "The last rod you'll need. After this, it's the lake that's the limit." }
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
    // Secret bonus bait — shown as "?????" in the shop until every lake's
    // objectives are cleared (see game.js secretBaitRow), then revealed under
    // its real name below and made purchasable. Priced deliberately absurd.
    { id: 'secret_t_pill', name: 'Vitamin T', costPerUnit: 5000, biasTable: { largemouth_dingus: 60 }, unlockLakeId: 'lake1', secret: true }
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
      { id: 'watch',  name: 'Old Wristwatch',      value: 60 },
      { id: 'ring',   name: 'Gold Ring',           value: 80 }
    ]
  };

  // ── Catch-reveal quips ──────────────────────────────────────────────────────
  // A few lines per non-fish item so the reveal card (game.js's catchreveal
  // overlay) doesn't repeat itself catch after catch — pickQuip() rotates
  // through these and skips whichever ran last. Fish don't get an entry: their
  // card shows length/weight/quality instead of a quip.
  const ITEM_QUIPS = {
    boot:   ["Somebody's missing this.", "No sign of the other one.", "At least it's not on your foot.", "A boot. The lake's most reliable catch.", "Not worth anything, but fun to keep."],
    tire:   ["Not exactly a keeper.", "Someone's spare, once.", "It'll never hold air again.", "The lake's tackle box, apparently.", "Not worth anything, but fun to keep."],
    tincan: ["Vintage, if nothing else.", "Empty. Has been for a while.", "A can. A very old one.", "Recycling this feels optimistic.", "Not worth anything, but fun to keep."],
    weeds:  ["Pond salad.", "You've caught... plants.", "The lake fought back with vegetation.", "Free of charge, unfortunately.", "Not worth anything, but fun to keep."],
    wallet: ["No ID inside — just receipts.", "Someone's having a rough week.", "Still smells like the lake.", "Cash is fine. Cards, less so."],
    phone:  ["Still has 4% battery. Somehow.", "The screen's had better days.", "Hope they had cloud backup.", "Definitely not waterproof."],
    watch:  ["Stopped at 3:15. Forever.", "Still ticking, somehow.", "The strap didn't survive the lake.", "Someone's very confused about the time."],
    ring:   ["No engraving. No story. Just gold.", "Someone's going to be upset about this.", "Shinier than anything else in the creel.", "Worth checking your own hand, honestly."]
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
  //
  // `maxRadiusFt` is how far this lake's fishable water reaches, in the same
  // feet a rod's `reachFt` (see the RODS comment) is measured in — the two
  // divide at runtime (game.js reachFracOf()) into the reachFrac every band
  // and landing calculation actually uses. Each lake is 125 feet bigger than
  // the last: the water isn't harder to fish as you progress, it's bigger,
  // which is what a rod upgrade is actually buying back.
  const LAKE_TEMPLATES = [
    {
      id: 'lake1', name: 'Cedar Hollow Pond',
      maxRadiusFt: 225,
      biomeIds: ['shallows', 'weedbed', 'dropoff', 'rockyshore'],
      objectiveCount: 2,
      objectivePool: [
        { id: 'l1_bass3',    type: 'catchCount',  speciesId: 'bass',    amount: 3,  description: 'Catch 3 Largemouth Bass' },
        { id: 'l1_weight15', type: 'catchWeight',                       amount: 15, description: 'Catch a cumulative 15 lbs of fish' },
        { id: 'l1_pike1',    type: 'catchCount',  speciesId: 'pike',    amount: 1,  description: 'Catch a Northern Pike' },
        { id: 'l1_sunfish4', type: 'catchCount',  speciesId: 'sunfish', amount: 4,  description: 'Catch 4 Sunfish' },
        { id: 'l1_rockbass3',type: 'catchCount',  speciesId: 'rockbass',amount: 3,  description: 'Catch 3 Rock Bass' },
        { id: 'l1_crappie3', type: 'catchCount',  speciesId: 'crappie', amount: 3,  description: 'Catch 3 Black Crappie' },
        { id: 'l1_any6',     type: 'catchCount',                        amount: 6,  description: 'Catch any 6 fish' }
      ],
      unlocks: { nextLakeId: 'lake2', speciesIds: ['walleye', 'smallmouth', 'catfish', 'carp', 'burbot'], baitIds: ['spinnerbait', 'stinkbait'], rodIds: ['longshot'] }
    },
    {
      id: 'lake2', name: 'Blackwater Reservoir',
      maxRadiusFt: 350,
      biomeIds: ['shallows', 'rockyshore', 'dropoff', 'deepchannel'],
      objectiveCount: 2,
      objectivePool: [
        { id: 'l2_walleye24',    type: 'catchLength', speciesId: 'walleye',    amount: 24, description: 'Catch a Walleye 24 inches or longer' },
        { id: 'l2_catfish2',     type: 'catchCount',  speciesId: 'catfish',    amount: 2,  description: 'Catch 2 Channel Catfish' },
        { id: 'l2_smallmouth3',  type: 'catchCount',  speciesId: 'smallmouth', amount: 3,  description: 'Catch 3 Smallmouth Bass' },
        { id: 'l2_carp24',       type: 'catchLength', speciesId: 'carp',       amount: 24, description: 'Catch a Common Carp 24 inches or longer' },
        { id: 'l2_burbot2',      type: 'catchCount',  speciesId: 'burbot',     amount: 2,  description: 'Catch 2 Burbot' },
        { id: 'l2_weight60',     type: 'catchWeight',                          amount: 60, description: 'Catch a cumulative 60 lbs of fish' },
        { id: 'l2_any8',         type: 'catchCount',                           amount: 8,  description: 'Catch any 8 fish' }
      ],
      unlocks: { nextLakeId: 'lake3', speciesIds: ['sturgeon', 'muskie', 'gar'], baitIds: [], rodIds: ['titanium'] }
    },
    {
      id: 'lake3', name: 'Old Sawmill Lake',
      maxRadiusFt: 475,
      biomeIds: ['shallows', 'weedbed', 'dropoff', 'deepchannel'],
      objectiveCount: 2,
      objectivePool: [
        { id: 'l3_sturgeon1',  type: 'catchCount',  speciesId: 'sturgeon', amount: 1,   description: 'Catch a Lake Sturgeon' },
        { id: 'l3_muskie2',    type: 'catchCount',  speciesId: 'muskie',   amount: 2,   description: 'Catch 2 Muskellunge' },
        { id: 'l3_gar1',       type: 'catchCount',  speciesId: 'gar',      amount: 1,   description: 'Catch a Longnose Gar' },
        { id: 'l3_weight150',  type: 'catchWeight',                        amount: 150, description: 'Catch a cumulative 150 lbs of fish' },
        { id: 'l3_any10',      type: 'catchCount',                         amount: 10,  description: 'Catch any 10 fish' }
      ],
      unlocks: { nextLakeId: null, speciesIds: [], baitIds: [], rodIds: [] }
    }
  ];

  return { BIOMES, FISH, RODS, BAIT, ITEM_TABLE, ITEM_QUIPS, LAKE_TEMPLATES };
})();
