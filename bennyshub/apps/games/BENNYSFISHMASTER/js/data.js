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
  // `color` is the species' identity colour. It paints the shape you see under
  // the water and the edge glow that points you at it, so a shoal can be told
  // apart at a glance. Colour is never the ONLY cue — the silhouettes are also
  // sized by species, and every spot is named aloud on arrival — so this reads
  // as help rather than as a requirement to see colour.
  // difficultyTier (2-5) sets the catch-sequence length. lengthRange/weightRange
  // are inches/lbs; a catch's actual roll is a percentile into these ranges,
  // picked by the catch sequence's quality score (see game.js rollFishCatch).
  const FISH = [
    { id: 'sunfish',      name: 'Sunfish',              biomeIds: ['shallows'],                       color: '#f4bf3a', difficultyTier: 2, lengthRange: [4, 9],    weightRange: [0.2, 1.2],  baseValuePerWeight: 2, unlockLakeId: 'lake1' },
    { id: 'bass',         name: 'Largemouth Bass',      biomeIds: ['shallows', 'weedbed'],             color: '#4f9c3f', difficultyTier: 3, lengthRange: [10, 24],  weightRange: [1, 8],      baseValuePerWeight: 3, unlockLakeId: 'lake1' },
    { id: 'pike',         name: 'Northern Pike',        biomeIds: ['weedbed'],                         color: '#8fae3c', difficultyTier: 4, lengthRange: [18, 44],  weightRange: [2, 20],     baseValuePerWeight: 4, unlockLakeId: 'lake1' },
    { id: 'perch',        name: 'Yellow Perch',         biomeIds: ['dropoff', 'rockyshore'],           color: '#e8892b', difficultyTier: 2, lengthRange: [5, 12],   weightRange: [0.2, 1.5],  baseValuePerWeight: 2, unlockLakeId: 'lake1' },
    { id: 'rockbass',     name: 'Rock Bass',            biomeIds: ['rockyshore'],                      color: '#9c6f45', difficultyTier: 2, lengthRange: [6, 10],   weightRange: [0.3, 1.5],  baseValuePerWeight: 2, unlockLakeId: 'lake1' },
    { id: 'crappie',      name: 'Black Crappie',        biomeIds: ['shallows', 'weedbed'],             color: '#7f97b3', difficultyTier: 2, lengthRange: [8, 15],   weightRange: [0.5, 3],    baseValuePerWeight: 3, unlockLakeId: 'lake1' },
    { id: 'walleye',      name: 'Walleye',              biomeIds: ['dropoff'],                         color: '#c9ad42', difficultyTier: 3, lengthRange: [12, 30],  weightRange: [1, 10],     baseValuePerWeight: 5, unlockLakeId: 'lake2' },
    { id: 'smallmouth',   name: 'Smallmouth Bass',      biomeIds: ['rockyshore'],                      color: '#b0713a', difficultyTier: 3, lengthRange: [9, 20],   weightRange: [1, 6],      baseValuePerWeight: 4, unlockLakeId: 'lake2' },
    { id: 'catfish',      name: 'Channel Catfish',      biomeIds: ['deepchannel'],                     color: '#7d7166', difficultyTier: 4, lengthRange: [14, 36],  weightRange: [2, 25],     baseValuePerWeight: 3, unlockLakeId: 'lake2' },
    { id: 'carp',         name: 'Common Carp',          biomeIds: ['shallows', 'dropoff'],             color: '#d1913f', difficultyTier: 3, lengthRange: [16, 34],  weightRange: [4, 30],     baseValuePerWeight: 2, unlockLakeId: 'lake2' },
    { id: 'burbot',       name: 'Burbot',               biomeIds: ['deepchannel'],                     color: '#8c7a52', difficultyTier: 4, lengthRange: [15, 30],  weightRange: [1, 8],      baseValuePerWeight: 5, unlockLakeId: 'lake2' },
    { id: 'sturgeon',     name: 'Lake Sturgeon',        biomeIds: ['deepchannel'],                     color: '#5b7490', difficultyTier: 5, lengthRange: [36, 84],  weightRange: [10, 120],   baseValuePerWeight: 6, unlockLakeId: 'lake3' },
    { id: 'muskie',       name: 'Muskellunge',          biomeIds: ['weedbed', 'deepchannel'],          color: '#3f7f63', difficultyTier: 5, lengthRange: [30, 60],  weightRange: [8, 40],     baseValuePerWeight: 7, unlockLakeId: 'lake3' },
    { id: 'gar',          name: 'Longnose Gar',         biomeIds: ['weedbed', 'deepchannel'],          color: '#6f8452', difficultyTier: 4, lengthRange: [24, 48],  weightRange: [3, 18],     baseValuePerWeight: 4, unlockLakeId: 'lake3' },
    // Secret bonus fish — see the "Vitamin T" secret bait below. Lives in
    // every biome so any lake can turn it up once the bait is equipped.
    { id: 'largemouth_dingus', name: 'Largemouth Dingus', biomeIds: ['shallows', 'weedbed', 'dropoff', 'rockyshore', 'deepchannel'], color: '#e0503f', difficultyTier: 3, lengthRange: [12, 12], weightRange: [5, 5], baseValuePerWeight: 0, unlockLakeId: 'lake1', secret: true }
  ];

  // ── Rods (permanent gear, handed over — never bought) ─────────────────────
  // Reach is no longer player-controlled — it decides which RINGS of the lake
  // are open at which mission. One lake at LAKE.maxRadiusFt = 500, band edges
  // at BAND_FRAC .28/.52/.78/1.0, one rod per ring:
  //   reachFrac = reachFt / 500
  //   starter    175/500 = .35  -> near + mid
  //   castmaster 325/500 = .65  -> + far
  //   longshot   425/500 = .85  -> + deep
  //   titanium   500/500 = 1.00 -> whole lake
  // All values are multiples of 25 ft. `cost` is flavour on the reveal card
  // only; nothing is purchased in this game.
  /* `look` is how the rod is built in 3D, taken straight off its own artwork
     in images/rods/ so the thing in your hands matches the thing on the card:
     a tan cane starter with a cork grip and red whippings, the blue
     CastMaster on black foam, the slate Longshot with orange wraps, and the
     silver-and-gold Titanium. */
  const RODS = [
    { id:'starter', look:{ blank:'#c2925c', grip:'#cfae82', wrap:'#b0342c', reel:'#4a5568', cork:true },    name:'Starter Rod',     cost:0,    reachFt:175, reachNote:'Casts up to 175 feet.', description:"Comes standard. Nothing wrong with it, exactly." },
    { id:'castmaster', look:{ blank:'#2f74d8', grip:'#26262a', wrap:'#c8ccd2', reel:'#c2c7cf', cork:false }, name:'CastMaster 3000', cost:150,  reachFt:325, reachNote:'Casts up to 325 feet.', description:"A stiffer blank and a longer cast." },
    { id:'longshot', look:{ blank:'#5c5568', grip:'#6b4a33', wrap:'#e07a1f', reel:'#b4b8c2', cork:true },   name:'Longshot Pro',    cost:500,  reachFt:425, reachNote:'Casts up to 425 feet.', description:"Built to reach water the CastMaster can only look at." },
    { id:'titanium', look:{ blank:'#c6c9d2', grip:'#3a3a40', wrap:'#d4a63c', reel:'#cfd3da', cork:false },   name:'Titanium Ace',    cost:1400, reachFt:500, reachNote:'Casts up to 500 feet.', description:"The last rod you'll need. After this, it's the lake that's the limit." }
  ];
  /* -- The tackle shop's own stock ------------------------------------------
     Rods and lures are the mission ladder: they are HANDED to you when the job
     is done, and money only decides when they show up. That left eighteen of
     the thirty-one missions with nothing to buy at all, and a late game where
     one sturgeon pays more than everything in the game costs put together.

     This is the other half: four lines of gear, three tiers each, on the shelf
     every single visit. Nothing here is needed to finish the game - every one
     of them makes the fishing KINDER, which is the right sort of thing to sell
     to somebody playing on one switch:

       finder  more warning, longer to steer in, and fewer empty hooks
       line    longer before a run parts the line
       alarm   the fish stays on the hook longer before it spits it
       cooler  the shop pays more for what is in the hold

     Prices climb about 4x a tier, so the last ones still mean something once
     sturgeon money is coming in. `effect` is read by game.js - none of these
     numbers are flavour.
     ---------------------------------------------------------------------- */
  const SHOP_STOCK = [
    { id: 'finder', name: 'Fish Finder', icon: String.fromCodePoint(0x1F4E1),
      blurb: 'Spots the fish sooner, and gives you longer to reach them.',
      tiers: [
        { name: 'Flasher',       cost: 120,  effect: { window: 1.25, lead: 2, junk: 0.78 },
          note: 'More warning before a spot, and about a fifth fewer empty hooks.' },
        { name: 'Sonar Unit',    cost: 500,  effect: { window: 1.55, lead: 4, junk: 0.55 },
          note: 'Half again as long to turn in, and nearly half the empty hooks gone.' },
        { name: 'Down-Scan Pro', cost: 1900, effect: { window: 2.00, lead: 7, junk: 0.30 },
          note: 'Every spot seen a long way off, and seven in ten empty hooks gone.' }
      ] },
    { id: 'line', name: 'Line', icon: String.fromCodePoint(0x1F9F5),
      blurb: 'Holds on longer when a fish runs.',
      tiers: [
        { name: 'Copolymer',     cost: 90,   effect: { snap: 2.6 },
          note: 'A little more give before it parts.' },
        { name: 'Braided',       cost: 420,  effect: { snap: 3.4 },
          note: 'You can hold through most of a run.' },
        { name: 'Fluorocarbon',  cost: 1600, effect: { snap: 4.5 },
          note: 'Very hard to break.' }
      ] },
    { id: 'alarm', name: 'Bite Alarm', icon: String.fromCodePoint(0x1F514),
      blurb: 'The fish stays on longer, so there is more time to hook it.',
      tiers: [
        /* These have to stay ABOVE CFG.HOOK_MIN/HOOK_MAX, which are already
           long: hookMin/hookMax take the larger of the two, so an alarm that
           asked for less than the base window would simply do nothing. */
        { name: 'Bell Clip',     cost: 110,  effect: { hookMin: 10, hookMax: 16 },
          note: 'No more snatched takes.' },
        { name: 'Electronic',    cost: 460,  effect: { hookMin: 14, hookMax: 21 },
          note: 'Plenty of time on every bite.' },
        { name: 'Twin Sensor',   cost: 1750, effect: { hookMin: 19, hookMax: 27 },
          note: 'It will wait for you.' }
      ] },
    { id: 'cooler', name: 'Cooler', icon: String.fromCodePoint(0x1F9CA),
      blurb: 'Keeps the catch fresh, so the shop pays more for it.',
      tiers: [
        { name: 'Cool Box',      cost: 150,  effect: { sell: 1.15 },
          note: 'Fifteen per cent more for everything you sell.' },
        { name: 'Iced Hold',     cost: 600,  effect: { sell: 1.35 },
          note: 'Thirty-five per cent more.' },
        { name: 'Chiller',       cost: 2200, effect: { sell: 1.60 },
          note: 'Sixty per cent more.' }
      ] }
  ];

  // ── Bait & lures ─────────────────────────────────────────────────────────
  // biasTable multiplies a species' odds in the bite roll (see game.js
  // rollBite). A missing entry means "no effect" (multiplier of 1).
  //
  // Bait is the FREQUENT half of the upgrade curve: a rod arrives roughly
  // every eight missions, a new lure every two or three, so there is always
  // something new in the tacklebox even while the rod stays the same. Each
  // one biases species that are actually reachable at the point it is handed
  // over — a lure for deep-channel fish would be a dead gift on a rod that
  // cannot reach the deep channel.
  /* `look` is what goes on the hook in 3D. Only the secret bait has artwork,
     so the rest are described here as a shape and two colours and built from
     primitives - which is what a lure is anyway: a body and a highlight. */
  const BAIT = [
    { id: 'plainworm', look: { kind:'worm',    color:'#c4677a', color2:'#9c4356' },     name: 'Plain Worm',      costPerUnit: 0,    free: true, biasTable: {} },
    { id: 'nightcrawler', look: { kind:'worm',    color:'#8a5340', color2:'#5f3729' },  name: 'Nightcrawler',    costPerUnit: 3,    biasTable: { bass: 1.6, sunfish: 1.3 } },
    { id: 'waxworm', look: { kind:'grub',    color:'#efe0c0', color2:'#cbb489' },       name: 'Wax Worm',        costPerUnit: 4,    biasTable: { sunfish: 1.8, crappie: 1.5, rockbass: 1.4 } },
    { id: 'bobberrig', look: { kind:'beadrig', color:'#e34b3f', color2:'#f4f1e8' },     name: 'Bobber Rig',      costPerUnit: 6,    biasTable: { crappie: 1.8, sunfish: 1.3, perch: 1.3 } },
    { id: 'minnowlure', look: { kind:'minnow',  color:'#c9d4dc', color2:'#4d7fa8' },    name: 'Minnow Lure',     costPerUnit: 8,    biasTable: { walleye: 1.8, perch: 1.4, smallmouth: 1.3 } },
    { id: 'jitterbug', look: { kind:'plug',    color:'#2f2b28', color2:'#d63b2c' },     name: 'Jitterbug',       costPerUnit: 11,   biasTable: { bass: 2.0, pike: 1.5, gar: 1.4 } },
    { id: 'spinnerbait', look: { kind:'spinner', color:'#d8dce2', color2:'#c9e04a' },   name: 'Spinnerbait',     costPerUnit: 14,   biasTable: { pike: 1.9, muskie: 1.5 } },
    { id: 'leechrig', look: { kind:'leech',   color:'#3b4436', color2:'#22281f' },      name: 'Leech Rig',       costPerUnit: 17,   biasTable: { walleye: 1.7, burbot: 1.5, catfish: 1.4 } },
    { id: 'stinkbait', look: { kind:'dough',   color:'#7a6244', color2:'#5c4832' },     name: 'Stink Bait',      costPerUnit: 21,   biasTable: { catfish: 2.0, sturgeon: 1.4 } },
    { id: 'deepjig', look: { kind:'jig',     color:'#57506b', color2:'#8e4fa8' },       name: 'Deep Jig',        costPerUnit: 26,   biasTable: { sturgeon: 1.8, burbot: 1.8, muskie: 1.4 } },
    // Secret bonus bait. Priced deliberately absurd. Handed over after the
    // last ordinary mission — setting it as a mission's baitId IS the entire
    // Largemouth Dingus unlock (see game.js biteWeightedFishPool).
    { id: 'secret_t_pill', look: { kind:'pill',    color:'#f4f1e8', color2:'#d8342b' }, name: 'Vitamin T', costPerUnit: 5000, biasTable: { largemouth_dingus: 60 }, secret: true }
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

  // ── The lake ──────────────────────────────────────────────────────────────
  // One lake, not a ladder of them. What changes between missions is the rod
  // (which rings are in reach) and the target species — not the water.
  const BAND_FRAC = { near: 0.28, mid: 0.52, far: 0.78, deep: 1.0 };  // was lakegen.js

  const LAKE = {
    id: 'thelake', name: 'The Lake',
    maxRadiusFt: 500,
    // Every biome exists in the lake. Which ones the TRACK runs through is set
    // per mission (see MISSIONS.biomes), not here.
    biomeIds: ['shallows', 'weedbed', 'rockyshore', 'dropoff', 'deepchannel']
  };

  // ── Which depth ring each biome occupies ──────────────────────────────────
  // Ring -> the rod that first reaches it:
  //   near  (.28)  starter
  //   mid   (.52)  starter     (reachFrac .35)
  //   far   (.78)  castmaster  (reachFrac .65)
  //   deep  (1.0)  longshot    (reachFrac .85)  / titanium (1.00)
  const BIOME_RING = {
    shallows:    'near',
    weedbed:     'mid',
    rockyshore:  'far',
    dropoff:     'far',
    deepchannel: 'deep'
  };

  // The BAND_FRAC values are a ring's OUTER edge, so "does this rod reach this
  // ring" is a test against the ring's INNER edge, not its own band value.
  const RING_INNER = { near: 0, mid: BAND_FRAC.near, far: BAND_FRAC.mid, deep: BAND_FRAC.far };

  function biomeFishable(biomeId, rodId) {
    const rod = RODS.find(r => r.id === rodId);
    if (!rod) return false;
    const ring = BIOME_RING[biomeId];
    if (ring === undefined) return false;
    return (rod.reachFt / LAKE.maxRadiusFt) > RING_INNER[ring];
  }

  // ── Missions — the whole progression ──────────────────────────────────────
  // Played in order. `rodId` is what the player holds DURING that mission;
  // `grantsRodId` / `grantsBaitId` is what the tackle shop hands over when the
  // mission is turned in. `biomes` is which biomes a fishing spot may be drawn
  // from.
  //
  // Two invariants, both asserted at boot (game.js auditMissions):
  //   1. every biome listed is inside `rodId`'s reach, and
  //   2. the target species lives in one of that mission's own biomes.
  // Break either and the player is handed a mission they cannot finish, with
  // no way to hurry an upgrade along.
  //
  // The curve: the starter rod stays for eight missions and earns four
  // different lures in that time, so early progress is felt in the tacklebox
  // rather than the rod. A rod then arrives every eight missions, each one
  // opening a depth ring — and with it a whole set of species that were
  // simply unreachable before.
  const MISSIONS = [

    /* ── Starter Rod: the shallows and the weed beds (missions 1-8) ──────── */

    { n:1,  rodId:'starter', baitId:'plainworm',
      biomes:['shallows','weedbed'],
      target:{ type:'catchCount', speciesId:'sunfish', amount:3 },
      text:'Catch 3 Sunfish',
      grantsBaitId:'nightcrawler' },

    { n:2,  rodId:'starter', baitId:'nightcrawler',
      biomes:['shallows','weedbed'],
      target:{ type:'catchCount', speciesId:'bass', amount:2 },
      text:'Catch 2 Largemouth Bass' },

    { n:3,  rodId:'starter', baitId:'nightcrawler',
      biomes:['shallows','weedbed'],
      target:{ type:'catchCount', speciesId:'crappie', amount:3 },
      text:'Catch 3 Black Crappie',
      grantsBaitId:'waxworm' },

    { n:4,  rodId:'starter', baitId:'waxworm',
      biomes:['shallows','weedbed'],
      target:{ type:'catchWeight', amount:12 },
      text:'Land 12 lbs of fish in one trip' },

    { n:5,  rodId:'starter', baitId:'waxworm',
      biomes:['shallows','weedbed'],
      target:{ type:'catchCount', speciesId:'sunfish', amount:6 },
      text:'Catch 6 Sunfish',
      grantsBaitId:'bobberrig' },

    { n:6,  rodId:'starter', baitId:'bobberrig',
      biomes:['shallows','weedbed'],
      target:{ type:'catchCount', speciesId:'crappie', amount:5 },
      text:'Catch 5 Black Crappie' },

    { n:7,  rodId:'starter', baitId:'bobberrig',
      biomes:['shallows','weedbed'],
      target:{ type:'catchLength', speciesId:'bass', amount:18 },
      text:'Catch a Largemouth Bass 18 inches or longer',
      grantsBaitId:'jitterbug' },

    { n:8,  rodId:'starter', baitId:'jitterbug',
      biomes:['weedbed','shallows'],
      target:{ type:'catchCount', speciesId:'pike', amount:1 },
      text:'Catch a Northern Pike',
      grantsRodId:'castmaster' },

    /* ── CastMaster 3000: the rocky shore and the drop-off (9-16) ────────── */

    { n:9,  rodId:'castmaster', baitId:'jitterbug',
      biomes:['shallows','rockyshore','dropoff'],
      target:{ type:'catchCount', speciesId:'perch', amount:3 },
      text:'Catch 3 Yellow Perch',
      grantsBaitId:'minnowlure' },

    { n:10, rodId:'castmaster', baitId:'minnowlure',
      biomes:['rockyshore','shallows'],
      target:{ type:'catchCount', speciesId:'rockbass', amount:3 },
      text:'Catch 3 Rock Bass' },

    { n:11, rodId:'castmaster', baitId:'minnowlure',
      biomes:['rockyshore','dropoff','weedbed'],
      target:{ type:'catchCount', speciesId:'smallmouth', amount:3 },
      text:'Catch 3 Smallmouth Bass' },

    { n:12, rodId:'castmaster', baitId:'minnowlure',
      biomes:['dropoff','rockyshore'],
      target:{ type:'catchCount', speciesId:'walleye', amount:2 },
      text:'Catch 2 Walleye',
      grantsBaitId:'spinnerbait' },

    { n:13, rodId:'castmaster', baitId:'spinnerbait',
      biomes:['weedbed','rockyshore','dropoff'],
      target:{ type:'catchWeight', amount:30 },
      text:'Land 30 lbs of fish in one trip' },

    { n:14, rodId:'castmaster', baitId:'spinnerbait',
      biomes:['weedbed','rockyshore','dropoff'],
      target:{ type:'catchLength', speciesId:'pike', amount:30 },
      text:'Catch a Northern Pike 30 inches or longer' },

    { n:15, rodId:'castmaster', baitId:'spinnerbait',
      biomes:['shallows','weedbed','rockyshore'],
      target:{ type:'catchCount', speciesId:'carp', amount:2 },
      text:'Catch 2 Common Carp',
      grantsBaitId:'leechrig' },

    { n:16, rodId:'castmaster', baitId:'leechrig',
      biomes:['dropoff','rockyshore'],
      target:{ type:'catchLength', speciesId:'walleye', amount:24 },
      text:'Catch a Walleye 24 inches or longer',
      grantsRodId:'longshot' },

    /* ── Longshot Pro: the deep channel (17-24) ──────────────────────────── */

    { n:17, rodId:'longshot', baitId:'leechrig',
      biomes:['deepchannel','dropoff'],
      target:{ type:'catchCount', speciesId:'catfish', amount:2 },
      text:'Catch 2 Channel Catfish',
      grantsBaitId:'stinkbait' },

    { n:18, rodId:'longshot', baitId:'stinkbait',
      biomes:['deepchannel','dropoff'],
      target:{ type:'catchCount', speciesId:'burbot', amount:2 },
      text:'Catch 2 Burbot' },

    { n:19, rodId:'longshot', baitId:'stinkbait',
      biomes:['weedbed','deepchannel'],
      target:{ type:'catchCount', speciesId:'muskie', amount:1 },
      text:'Catch a Muskellunge' },

    { n:20, rodId:'longshot', baitId:'stinkbait',
      biomes:['weedbed','deepchannel','dropoff'],
      target:{ type:'catchCount', speciesId:'gar', amount:2 },
      text:'Catch 2 Longnose Gar',
      grantsBaitId:'deepjig' },

    { n:21, rodId:'longshot', baitId:'deepjig',
      biomes:['deepchannel','dropoff','rockyshore'],
      target:{ type:'catchWeight', amount:60 },
      text:'Land 60 lbs of fish in one trip' },

    { n:22, rodId:'longshot', baitId:'deepjig',
      biomes:['deepchannel','dropoff'],
      target:{ type:'catchLength', speciesId:'catfish', amount:30 },
      text:'Catch a Channel Catfish 30 inches or longer' },

    { n:23, rodId:'longshot', baitId:'minnowlure',
      biomes:['rockyshore','dropoff','deepchannel'],
      target:{ type:'catchCount', speciesId:'smallmouth', amount:5 },
      text:'Catch 5 Smallmouth Bass' },

    { n:24, rodId:'longshot', baitId:'deepjig',
      biomes:['weedbed','deepchannel','dropoff'],
      target:{ type:'catchLength', speciesId:'muskie', amount:45 },
      text:'Catch a Muskellunge 45 inches or longer',
      grantsRodId:'titanium' },

    /* ── Titanium Ace: the whole lake (25-30) ────────────────────────────── */

    { n:25, rodId:'titanium', baitId:'deepjig',
      biomes:['deepchannel','dropoff'],
      target:{ type:'catchCount', speciesId:'sturgeon', amount:1 },
      text:'Catch a Lake Sturgeon' },

    { n:26, rodId:'titanium', baitId:'spinnerbait',
      biomes:['weedbed','deepchannel','dropoff'],
      target:{ type:'catchCount', speciesId:'muskie', amount:2 },
      text:'Catch 2 Muskellunge' },

    { n:27, rodId:'titanium', baitId:'stinkbait',
      biomes:['deepchannel','dropoff','rockyshore'],
      target:{ type:'catchWeight', amount:120 },
      text:'Land 120 lbs of fish in one trip' },

    { n:28, rodId:'titanium', baitId:'minnowlure',
      biomes:['dropoff','rockyshore','deepchannel'],
      target:{ type:'catchCount', speciesId:'walleye', amount:5 },
      text:'Catch 5 Walleye' },

    { n:29, rodId:'titanium', baitId:'deepjig',
      biomes:['deepchannel','dropoff'],
      target:{ type:'catchLength', speciesId:'sturgeon', amount:60 },
      text:'Catch a Lake Sturgeon 60 inches or longer' },

    { n:30, rodId:'titanium', baitId:'deepjig',
      biomes:['deepchannel','dropoff','rockyshore'],
      target:{ type:'catchCount', speciesId:'sturgeon', amount:2 },
      text:'Catch 2 Lake Sturgeon',
      // Turning this in hands over Vitamin T and reveals there is one more.
      grantsBaitId:'secret_t_pill', revealsSecret:true },

    /* ── The real last fish ──────────────────────────────────────────────── */
    // Hidden until mission 30 is turned in. The Dingus is gated by BAIT, not
    // by biome or rod: biteWeightedFishPool() only puts it in a pool when
    // Vitamin T is equipped, and bait is set per mission, so this baitId IS
    // the whole unlock. It lives in all five biomes, so every spot on this
    // mission holds it.
    { n:31, rodId:'titanium', baitId:'secret_t_pill',
      biomes:['shallows','weedbed','rockyshore','dropoff','deepchannel'],
      target:{ type:'catchCount', speciesId:'largemouth_dingus', amount:1 },
      text:'Catch the Largemouth Dingus',
      hidden:true, allGreen:true, finale:true }
  ];

  return { BIOMES, FISH, RODS, BAIT, SHOP_STOCK, ITEM_TABLE, ITEM_QUIPS,
           LAKE, BAND_FRAC, BIOME_RING, RING_INNER, biomeFishable, MISSIONS };
})();
