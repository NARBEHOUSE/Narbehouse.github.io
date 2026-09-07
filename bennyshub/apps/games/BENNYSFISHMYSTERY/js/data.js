/**
 * Benny's FishMaster — the numbers.
 *
 * Almost nothing is written here any more. The fish, the gear, the vessels and
 * the things on the bottom all live in content/roster.json, where they can be
 * edited without touching code, and this derives what the engine needs from
 * them. What IS written here is tuning: how fast a fight goes, how a value is
 * worked out, what a rod can reach.
 *
 * THE WATERS ARE DEPTHS NOW. The old game had five named biomes - shallows,
 * weedbed, drop-off, rocky shore, deep channel - each assigned to a "ring" a
 * fraction of the way out from the middle of a lake nobody had drawn. On
 * Whispering Lake the chart says how deep it is anywhere, so a water is simply
 * a band of depth, and where a fish lives is a fact about the lake rather than
 * an entry in a table. The names are kept because the game says them out loud
 * and "over the drop-off" is worth more than "sixteen to twenty-four feet".
 *
 * Read only, always. Everything that changes at runtime is in game.js's save.
 */
window.FishMasterData = (function () {
  'use strict';

  const R = (window.RT && RT.content && RT.content.roster) || {};

  /* ── The waters ─────────────────────────────────────────────────────────
     Bands of depth, named after what is actually there. The lake's chart gives
     a depth for any point; this says what to CALL it, which is what the cue,
     the cards and the log all need. */
  const BIOMES = {
    shoreline: { id: 'shoreline', name: 'The Shoreline',      ft: [0, 10],
                 note: 'The dock, the pilings and the reed beds. Bright, shallow, a net and a bamboo rod.' },
    bay:       { id: 'bay',       name: 'The Shallow Bay',    ft: [10, 35],
                 note: 'Lily pads, weedbeds and drowned brush. Canoe water; bass, crappie and sunken scrap.' },
    dropoff:   { id: 'dropoff',   name: 'The Deep Drop-Off',  ft: [35, 75],
                 note: 'Past the buoys the bottom falls like a cliff. Rock ledges, the log jam, pike and catfish.' },
    trench:    { id: 'trench',    name: 'The Abyssal Trench', ft: [75, 999],
                 note: 'The centre fog. Pitch black past a hundred feet, and nobody has been to the bottom.' },
  };
  const BIOME_LIST = Object.keys(BIOMES).map((k) => BIOMES[k]);

  /** Which water a depth is in. */
  function waterAt(ft) {
    for (let i = 0; i < BIOME_LIST.length; i++) {
      const b = BIOME_LIST[i];
      if (ft >= b.ft[0] && ft < b.ft[1]) return b;
    }
    return ft > 0 ? BIOME_LIST[BIOME_LIST.length - 1] : BIOME_LIST[0];
  }

  /** Which waters a depth band overlaps. */
  function watersOver(lo, hi) {
    return BIOME_LIST.filter((b) => hi > b.ft[0] && lo < b.ft[1]).map((b) => b.id);
  }

  /* ── The fish ───────────────────────────────────────────────────────────
     From the roster, in the shape the engine has always wanted. `biomeIds` is
     derived rather than authored: a fish that lives between eight and nineteen
     feet is in Lily Bay and over the Drop-Off because that is where those
     depths are, and saying so twice is how the two get to disagree. */
  const FISH = (R.fish || []).map(function (f) {
    return {
      id: f.id,
      name: f.name,
      note: f.note || '',
      depthFt: f.depthFt,
      biomeIds: watersOver(f.depthFt[0], f.depthFt[1]),
      color: f.colour || '#8fd6ea',
      difficultyTier: f.tier || 2,
      lengthRange: f.lengthIn,
      weightRange: f.weightLb,
      baseValuePerWeight: f.perLb || 0,
      /* A tag is worth nothing at the counter. It is worth a line in the
         logbook, which is what Walt is actually paying for - and he pays for
         the JOB, not the fish. Money used to trickle in per tag, which made
         the ladder something you ground out rather than something you were
         sent up. */
      /* Walt's growth study. Most fish pay nothing - the job is the wage -
         but the three he is tracking are worth a couple of dollars a tag,
         which is the petrol money. */
      tagBounty: f.studyBounty || 0,
      study: !!f.studyBounty,
      /* Which way the artwork faces, so a landed fish can be hung from its
         jaw the right way up. */
      headFacing: f.headFacing === 'left' ? 'left' : 'right',
      netOnly: !!f.netOnly,
      secret: !!f.secret,
      /* WHAT IT TAKES TO FIND ONE, for the ten that are not in any book: one
         lure, one water, and odds of one in two hundred. Straight off the
         roster, because it is a fact about the fish. Nothing reads this but
         the bite roll - and nothing SAYS it anywhere at all, which is the
         point of them. */
      mystery: f.mystery || null,
    };
  });

  /* ── The gear ───────────────────────────────────────────────────────────
     `reachFt` is how DEEP a rod will fish and `castFt` is how FAR it throws.
     One number used to do both jobs, which is why a rod that could reach the
     far bank was also assumed to fish the bottom of it.

     Both are in feet, and the lake is built at UNITS_PER_FT world units to
     the foot (the same constant as js/world.js), so `castUnits` is simply the
     printed distance converted - a thirty-foot rod throws thirty feet. The old
     castUnits were written straight into the roster and read as feet by the
     shop, so a bamboo rod advertised a cast of three hundred and threw a
     hundred and fifty. */
  const UNITS_PER_FT = 0.61;
  const ROD_LOOKS = {
    hand_net:   { blank: '#b08d5c', grip: '#8a6a44', wrap: '#cfd8c2', reel: '#7a8a6a', cork: true },
    bamboo_rod: { blank: '#c2925c', grip: '#cfae82', wrap: '#b0342c', reel: '#4a5568', cork: true },
    fiber_rod:  { blank: '#2f74d8', grip: '#26262a', wrap: '#c8ccd2', reel: '#c2c7cf', cork: false },
    carbon_rod: { blank: '#5c5568', grip: '#6b4a33', wrap: '#e07a1f', reel: '#b4b8c2', cork: true },
    pro_rod:    { blank: '#c6c9d2', grip: '#3a3a40', wrap: '#d4a63c', reel: '#cfd3da', cork: false },
  };
  const RODS = (R.rods || []).map(function (r) {
    return {
      id: r.id, name: r.name, cost: r.price || 0,
      look: ROD_LOOKS[r.id] || ROD_LOOKS.bamboo_rod,
      isNet: !!r.isNet,
      canHook: r.canHook !== false && !r.isNet,
      reachFt: r.rangeFt || 8,                       // how deep it fishes, in feet
      castFt: r.castFt || 0,                         // how far it throws, in feet
      castUnits: Math.round((r.castFt || 0) * UNITS_PER_FT * 10) / 10,
      tier: r.tier || 1,
      /* HOW MUCH FISH IT CAN HOLD, against the fish's own tier. It used to
         live in a table in js/game.js keyed by rod id, and when the rods were
         renamed every lookup missed and every rod in the game silently became
         the same rod. On the record, so it is renamed with it. */
      rodClass: r.rodClass || 3,
      // A lure that comes in the box with the rod (the bamboo rod's earthworms).
      bundlesBait: r.bundlesBait || null,
      reachNote: r.isNet
        ? 'A scoop at your feet, off the boards.'
        : 'Casts ' + (r.castFt || 0) + ' ft \u00b7 fishes ' + (r.rangeFt || 8) + ' ft down',
      description: r.note || '',
    };
  });

  const BAIT_LOOKS = {
    earthworm:     { kind: 'worm',    color: '#8a5340', color2: '#5f3729' },
    shiner_bait:   { kind: 'minnow',  color: '#d9b451', color2: '#8f7330' },
    spoon:         { kind: 'spinner', color: '#d8dce2', color2: '#c9e04a' },
    stinkbait:     { kind: 'plug',    color: '#6b5a34', color2: '#3d3320' },
    deep_rig:      { kind: 'beadrig', color: '#3b4436', color2: '#22281f' },
  };
  const BAIT = (R.baits || []).map(function (b) {
    return {
      id: b.id, name: b.name,
      costPerUnit: b.price || 0,
      free: !!b.free,
      look: BAIT_LOOKS[b.id] || BAIT_LOOKS.earthworm,
      biasTable: b.bias || {},
      /* Is it fished under a float? A worm is; a spoon worked through the
         water and a rig dragged along the bottom are not. */
      usesFloat: b.float !== false,
      description: b.note || '',
    };
  });

  /* ── The vessels ────────────────────────────────────────────────────────
     What you buy to get further out. This is the progression: not a rod that
     casts further, a boat that goes somewhere. */
  const VESSELS = (R.vessels || []).map(function (v) {
    return {
      id: v.id, name: v.name, cost: v.price || 0,
      reach: v.reach || 40, speed: v.speed || 0,
      wearRate: v.wearRate || 1, burnsFuel: !!v.burnsFuel,
      /* A hull of your own, with a hull to look after. A rental has none: it
         is not yours, so there is nothing for the shop to repair. */
      durability: !!v.durability, rental: !!v.rental,
      maxDepthFt: v.maxDepthFt || 0,
      description: v.note || '',
    };
  });

  /* ── The things on the bottom ───────────────────────────────────────────
     Grouped the way the magnet finds them: junk is a joke, scrap is money,
     story is the reason any of it matters. */
  const ITEMS = R.items || [];
  const ITEM_TABLE = {
    /* Litter, with what Walt gives you for taking it out of the water. It
       used to be dropped here, so every piece of rubbish in the lake was
       worth nothing however much trouble it was to land. */
    /* WITH THEIR WEIGHTS. How likely a thing is to come up is a fact about
       the thing - a lake has more weed in it than wallets - so it travels
       with it. Anything that does not say gets a 1, which is what every item
       used to be, so a new item without a weight behaves as it always did. */
    junk: ITEMS.filter((i) => i.kind === 'junk')
               .map((i) => ({ id: i.id, name: i.name, value: i.value || 0,
                              weight: i.weight == null ? 1 : i.weight })),
    scrap: ITEMS.filter((i) => i.kind === 'scrap')
                .map((i) => ({ id: i.id, name: i.name, value: i.value || 0,
                               weight: i.weight == null ? 1 : i.weight })),
    valuable: ITEMS.filter((i) => i.kind === 'valuable')
                   .map((i) => ({ id: i.id, name: i.name, value: i.value || 0,
                                  weight: i.weight == null ? 1 : i.weight })),
    story: ITEMS.filter((i) => i.kind === 'story')
                .map((i) => ({ id: i.id, name: i.name })),
    /* THE TEN UNIQUE THINGS ON THE BOTTOM, after the lake goes quiet. Their
       own table on purpose: a kind of its own is what keeps them out of the
       three tables that roll every cast, so none of them can turn up as a
       lucky find in the first hour of the game. */
    relic: ITEMS.filter((i) => i.kind === 'relic')
                .map((i) => ({ id: i.id, name: i.name, value: i.value || 0,
                               biomeId: (i.relic || {}).biomeId || null,
                               chance: (i.relic || {}).chance || 0.005 })),
  };

  /* What the shopkeeper says when something comes up. Junk earns a joke
     because there is nothing else to say about a boot; scrap and story get
     told straight, because one is money and the other matters. */
  const ITEM_QUIPS = {
    floating_litter: ["Into the bin with it. The fry thank you.", "Somebody's picnic. Not any more.", "One less thing for a sunfish to choke on."],
    /* The lake's own rubbish, with the names the first game gave it. Walt has
       a bin behind the shop, an opinion about every piece, and a dollar or two
       for anybody who takes one out of his water. */
    tincan: ["A rusty can. Out of the water it goes - that helps more than you would think.",
             "Empty. Has been for a while.",
             "Recycling this feels optimistic."],
    boot:   ["Somebody's missing this.", "No sign of the other one.",
             "A boot. The lake's most reliable catch - and one less thing rotting in it."],
    tire:   ["Now THAT is a good morning's work. A tyre leaches for fifty years.",
             "Someone's spare, once.", "It will never hold air again. Straight in the skip."],
    wallet: ["No ID inside - just receipts.", "Still smells like the lake.",
             "Cards are no good to anybody now. The lake is better off without it."],
    phone:  ["The screen has had better days.", "Hope they had a backup.",
             "Definitely not waterproof. And full of things that should not be in a lake."],
    weeds:  ["Pond salad.", "You have caught... plants.",
             "The weed bed telling you where its edge is. Shake it off and cast again."],
    scrap_metal: ["Iron. Walt has a bin for this.", "Heavy, and worth something at the counter.",
                  "Fifty years of people dropping things in a lake."],
    /* AND NOTHING FOR THE STORY PIECES. A quip is printed on the catch card,
       which is what you see in the BOAT the moment the thing breaks the
       surface - and every one of these was Walt's reaction to being handed
       it. "Kid... look at these fine metal tines" over a magnet haul in the
       middle of the lake, with Walt behind his counter half a mile away, and
       then Walt says a fuller version of it to your face when you hand it in.
       The card shows the thing and its name, which is the discovery. The man
       who knows what it is says so when he sees it. */
  };

  /* ── The tools the shop sells ───────────────────────────────────────────
     One-off purchases rather than the old three-tier lines: a magnet either
     turns the rod into a salvage tool or it does not. */
  /* The old shelf of tiered gear lines is gone. The tools - magnets and the
     sonar - are bought and owned outright through game.js (buyTool), and the
     roster is the only list of them. */
  const SHOP_STOCK = [];


  /* ── Tuning ─────────────────────────────────────────────────────────── */

  const LAKE = {
    id: 'whispering', name: 'Whispering Lake',
    // The deepest water in it, which is what every depth fraction is against.
    maxDepthFt: 125,
    biomeIds: BIOME_LIST.map((b) => b.id),
  };

  /**
   * Can this rod fish this water?
   *
   * Depth against depth, which is the honest comparison. The old version
   * divided a CAST distance by the lake's radius and compared the fraction to
   * a made-up ring, so a rod that could throw a long way was assumed to fish
   * deep - and those are not the same thing at all.
   */
  function biomeFishable(biomeId, rodId) {
    const rod = RODS.find((r) => r.id === rodId);
    const b = BIOMES[biomeId];
    if (!rod || !b) return false;
    // It has to reach the top of the band; the whole band is a bonus.
    return rod.reachFt >= b.ft[0];
  }

  /** Which fish live in a water, biggest first. */
  function biomeFish(biomeId) {
    return FISH.filter((f) => !f.secret && f.biomeIds.indexOf(biomeId) >= 0)
               .sort((a, b) => b.lengthRange[1] - a.lengthRange[1]);
  }

  return {
    BIOMES, BIOME_LIST, waterAt, watersOver,
    FISH, RODS, BAIT, VESSELS, SHOP_STOCK,
    ITEMS, ITEM_TABLE, ITEM_QUIPS,
    LAKE, biomeFishable, biomeFish,
    /* No MISSIONS. The ladder is content/quests.json now, read through
       js/quests.js - the old thirty-one were written into this file and could
       not be edited without editing code, which is the whole thing the editor
       is for. */
  };
})();
