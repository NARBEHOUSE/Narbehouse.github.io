/**
 * Benny's FishMaster — rules, state and progression.
 *
 * A trip: leave the dock, steer the lake looking for fish, stop where they
 * are, aim a cast, charge it, and hold to reel in whatever takes it. Bring the
 * catch back to the tackle shop, turn the mission in, take the upgrade.
 *
 * The ground rule that shapes everything here: NOTHING CAN FAIL. No timers the
 * player can lose to, no damage, no game over, no way to lose a fish through
 * inaction. Every wait in this file is a wait the player may sit in forever.
 * A poor cast costs likelihood, never the trip.
 *
 * Everything timed advances from the frame loop's `dt`, never from setTimeout
 * or setInterval, so pausing genuinely freezes the bite wait, the reel, the
 * charge meter and the boat.
 */
RT.game = (function () {
  'use strict';

  const U = RT.util;
  const D = window.FishMasterData;

  /* ══════════════════════════════════════════════════════════════════════
     TUNING
     ══════════════════════════════════════════════════════════════════════ */

  const CFG = {
    /* How far outboard of the boat's centreline a hooked fish is held.
       The hull's widest half-beam is 2.32, so this keeps it just clear
       of the gunwale rather than inside the boat. */
    RAIL_OFF: 2.6,
    /* Steering. The boat drives itself forward; the player only steers. */
    BOAT_SPEED:   17,      // units/s forward. A boat trolls.
    STEER_SPEED:  26,      // units/s sideways while a switch is held
    LANE_HALF:    46,      // how far either side of the route the boat may go
    /* Steering turns the boat and then it travels the way it is pointing,
       rather than sliding sideways down a rail. YAW_MAX is how far over the
       helm goes; YAW_RATE is how fast it gets there and how fast it comes
       back to straight when you let go. */
    YAW_MAX:      0.55,
    YAW_RATE:     1.8,

    /* Holding toward a shoal while alongside it is how you pull in to fish.
       Nothing stops the boat on its own — you can troll all day. */
    /* Pulling over happens in two beats, and you can back out of both.
       LEAN_ARM   how long you must hold the helm over before the game offers
                  to pull in at all - short enough to feel responsive, long
                  enough that ordinary steering never triggers it.
       PULL_OVER  the offer itself. A long, unhurried window: let go, or steer
                  the other way, and nothing happens. Keep holding and you go
                  in. This is the whole point - the decision is never taken
                  away from the player, and never has to be made quickly. */
    /* Both of these were more than twice as long. Between them and a run-up
       at trolling speed, asking to fish where the card said there were fish
       was the better part of half a minute of holding a switch over. The
       meter still has to fill - you can always change your mind, and it still
       says so on screen - it just fills in about the time it takes to read
       the card, and the boat is at the fish straight after. */
    LEAN_ARM:     0.7,
    PULL_OVER:    1.5,
    /* Stopping where nothing has been called is a different act, and keeps the
       old, deliberate hold. Steering across the lane means holding the helm
       over for two or three seconds at a stretch, and at the short timings
       that would stop the boat every time somebody simply wanted to be on the
       other side of the lake. */
    LEAN_ARM_OPEN:  1.6,
    PULL_OVER_OPEN: 3.0,

    /* Fishing spots */
    /* Room to breathe: a long approach, a long window to turn in, and a
       gap after it — nobody should be hurried into a fishing spot. */
    /* Room between spots.
       A spot is "live" from CUE_LEAD before it (20s x 17 = 340 units) until
       SPOT_WINDOW past it - about 600 units all told. The gaps used to be
       340-520, SHORTER than that, so one spot was always still live when the
       next was announced: the card never cleared, and the spoken line was
       about a spot the card on screen was not showing.

       These leave a few hundred units of genuinely open water between one
       spot going quiet and the next being called. */
    SPOT_GAP_MIN: 840,
    SPOT_GAP_MAX: 1200,
    SPOT_RADIUS:  17,      // how big a shoal is
    PAIR_CHANCE:  0.55,    // chance a spot has a shoal on both sides
    /* At least one shoal of the mission's own fish every OTHER spot. At one
       in three you could troll a long way past water that had nothing you
       needed, which is a dull stretch with nothing to steer for. */
    TARGET_WINDOW: 2,      // at least one shoal of the target every 2 spots
    /* Twenty seconds of warning. A fishing spot has to be announced far
       enough ahead that somebody who needs time to react still has plenty
       of it left after they have read the card. */
    CUE_LEAD:     20.0,    // seconds of warning before a spot comes up
    /* Open water at the start of every trip.
       The first spot used to sit 260 units out, and a spot is called from
       CUE_LEAD ahead of itself - 340 units - so the first one was already
       being announced before the boat had left the dock. You were fishing
       before you had finished setting off. This is the stretch of nothing
       that comes first: time to get under way, look at the lake, and settle
       before the game asks for a decision. */
    TROLL_GRACE:  10.0,    // seconds of open water before the first spot is called
    SPOT_WINDOW:  260,     // how far either side of a spot you may turn in
    STOP_TIME:    1.1,     // easing to a halt at a spot
    /* Getting there once you have committed.
       The pull-over meter IS the wait, and it is the only one. The moment it
       fills, the boat takes you to the fish: it opens up, runs the last of the
       way and settles, all of it inside ARRIVE_MAX. It used to hold the helm
       over and TROLL the rest of the way at seventeen units a second, so
       committing the moment a card appeared - which is exactly what somebody
       who needs time to decide does - bought fifteen seconds of watching the
       water go by with nothing to press. */
    RUN_UP_TIME:  0.45,    // extra time for a full SPOT_WINDOW run-up
    ARRIVE_MAX:   1.5,     // and never longer than this, however far it was
    LEAVE_TIME:   1.1,
    /* The fish comes up on the line, head first, and hangs there long enough
       to be looked at. It does NOT come aboard: swinging it in put a fish the
       size of a door across the lens, and the card that follows is where you
       read what you caught anyway. */
    LAND_TIME:    1.6,
    LAND_LIFT:    3.5,     // how high the hook comes up: the angler's eye line
    /* Inches per world unit, measured off the rod in the angler's hands: the
       blank is 4.1 units for a seven-foot rod. Everything the player can
       compare the fish to is in this frame, so it has to be honest. */
    UNITS_PER_IN: 0.0488,

    /* Casting.
       A rod's reach maps onto how far it can throw across the water, and the
       shoals sit at distances set by their depth ring — so the rod really is
       what decides which water is open. Asserted at boot by auditMissions(). */
    MAX_CAST_UNITS: 75,    // what a reachFrac of 1.0 (Titanium Ace) throws
    MIN_CAST_FRAC:  0.06,  // even a nothing cast plops in beside the boat
    /* You fish over the side you pulled in on, so the arc is measured about
       the beam — a quarter turn off the bow — and is deliberately narrow.
       There is no swinging round to cast over the bow. */
    AIM_ARC: 0.62,         // radians either side of straight out (~36 deg)
    /* Deliberately slow - a quarter of what it was. The aimer is the one
       thing in the game you have to STOP on rather than simply react to,
       and at the old speed it was overshot every time. */
    AIM_SWEEP: 0.155,      // rad/s the aimer sweeps while held
    CHARGE_PCT_PER_S: 22,  // ~4.5s to a full charge; stops dead at 100%
    CHARGE_TICK_PCT: 10,   // click every this much, so the ear tracks it too

    /* Shoal placement: distance off the route by depth ring. Deeper water
       sits further out than the boat can steer, so it has to be cast to. */
    SHOAL_BASE: 12,
    SHOAL_SPAN: 95,

    /* The bite. How long it stays on the hook varies every time: a long take
       is a gift, a short one you have to be ready for. Missing costs nothing
       but the wait — it bites again. */
    /* The wait for a bite. Twelve seconds of a float on flat water was the
       longest stretch in the game with nothing to look at and nothing to do,
       which is exactly the kind of dead air this game cannot afford. It is
       shorter now, and it is no longer empty: the shoal comes over and circles
       the bait (Scene.syncShoals), and the float dips a couple of times before
       the real take. None of that is a cue to press anything - the take, when
       it comes, is still announced on its own four channels. */
    BITE_WAIT_MIN: 3,
    BITE_WAIT_MAX: 7,
    /* A nibble: the float dips, a small sound, and nothing else happens. It
       exists so the take has something to be the payoff OF. */
    TEASE_EVERY:   2.2,
    /* How long a take stays on before the fish spits the hook.
       Nothing here is a reaction test. The banner stays up for the whole
       window, the take is called again while it waits, and missing one costs
       only the pause before the next bite — so this is set long enough that
       somebody with no reflexes at all still lands fish, and the Bite Alarm
       lengthens it from there (it can only ever add — see hookMin/hookMax). */
    HOOK_MIN:      7.0,    // the shortest take in the game
    HOOK_MAX:     12.0,    // a proper sit-down take
    HOOK_NUDGE:    3.5,    // "fish on" said again while the take waits
    REBITE_MIN:    3,
    REBITE_MAX:    5,
    NUDGE_EVERY:   5,      // "press and hold to reel it in", repeated forever
    /* Winding an empty line back in. Hold and it comes; let go and it stops
       where it is and goes on fishing from there. It is a retrieve, not an
       escape hatch: the bait is still in the water the whole way in, and a
       fish can take it at any point. */
    REEL_IN_SPEED: 11,     // units/s the lure travels back toward the boat
    REEL_IN_DONE:  3.5,    // this close to the rail and the line is in

    /* The fight. A hooked fish makes runs: the line goes tight and you have to
       LET GO until it tires. Keep hauling through a run and the strain builds
       until the line parts and the fish is gone. Losing one costs nothing that
       cannot be won back — the next cast is right there — so there is jeopardy
       without any dead end. */
    STRAIN_SNAP_S:  1.9,   // holding through a run this long parts the line
    STRAIN_EASE_S:  0.75,  // and it falls away this fast once you let go
    RUN_MIN_S:      1.3,
    RUN_MAX_S:      2.5,
    RUN_WARN_S:     0.7,   // warning before the line goes tight
    /* What a run costs, as a fraction of the bar per second.
       A running fish TAKES LINE - that is what a run is - and the bar sat
       frozen through it, so the fish appeared to teleport back out and then
       back in again when it tired. Deliberately small: a two-second run costs
       about a seventh of the bar, which is enough to feel and never enough to
       make a fish unlandable. Nothing here can be failed by waiting. */
    RUN_TAKE:       0.07,

    /* Bite-category odds, cumulative. Whatever is left over is a fish.
       A cast that lands on open water instead of a shoal uses OPEN instead —
       still fish, just thinner. That is the whole cost of a poor cast. */
    BITE:      { NOTHING: 0.08, VALUABLE: 0.05, JUNK: 0.12 },
    BITE_OPEN: { NOTHING: 0.30, VALUABLE: 0.05, JUNK: 0.22 },

    /* What share of the fish caught on a named shoal are the species the
       card named. The card is a promise - "Largemouth Bass on the left" - and
       it was being kept only in the sense that bass were somewhere in the
       biome's table: pull in on your own fish and the biome would hand you
       three of everything else first. The rest of the roll still comes off
       the biome, so other species do turn up, just not instead of the fish
       you steered across the lake for. */
    SHOAL_NAMED_SHARE: 0.75,
    /* ...and how much of that promise survives the wrong lure. The card says
       Largemouth Bass and bass is what mostly takes it - IF the thing on your
       hook is something a bass wants. On a plain worm they are still there,
       still catchable, and noticeably slower to come. */
    WRONG_BAIT_SHARE: 0.4,

    SPOT_COOLOFF: 4,       // fish from one shoal before they move on
    CULL_DIST: 620
  };

  /* How long a species takes to bring in, keyed by the existing
     `difficultyTier` field. There is no tension band any more: holding brings
     it in, letting go stops it, and a bigger fish simply takes longer. */
  /* How long a species takes to bring in, and what it pays.
   *
   * `pay` is a flat amount for landing one at all; `rate` scales the species'
   * own per-pound price. Paying purely by the pound was badly broken at both
   * ends: a sunfish weighs a pound and paid TWO DOLLARS, so the first mission's
   * lure cost eighteen fish, while a 120lb sturgeon paid $720 - more than
   * every rod in the game put together - and the late game had nothing left
   * to want. A flat catch fee plus a flattened rate keeps small fish worth
   * catching and stops big ones ending the economy.
   */
  const TIERS = {
    /* LOW on purpose. A trip is a dozen casts or so, and the bite pool for
       any water holds that water's big residents as well as the little ones
       the mission sent you for - so paying generously per fish had mission one
       funding half the shop. As set, a trip is worth a couple of hundred: the
       ladder is comfortably affordable, the shop is not affordable all at
       once, and what to buy stays a real decision. */
    2: { lineSeconds: 4,  runs: 0, pay: 6,  rate: 2.00 },  // sunfish, no fuss
    3: { lineSeconds: 7,  runs: 1, pay: 8,  rate: 0.50 },
    4: { lineSeconds: 11, runs: 2, pay: 12, rate: 0.25 },
    5: { lineSeconds: 16, runs: 3, pay: 20, rate: 0.12 }   // a sturgeon is an event
  };

  /* Quality → percentile into the species' length/weight range. With a plain
     hold there is no band to sit in, so quality is simply how steadily it was
     reeled: hold right through and it is a hundred percent. Dawdling costs
     size, never the fish. */
  const QUALITY_BUCKETS = [
    { min: 75, max: 100, pMin: 0.85, pMax: 1.00, label: 'Excellent' },
    { min: 50, max: 74,  pMin: 0.40, pMax: 0.85, label: 'Good' },
    { min: 25, max: 49,  pMin: 0.10, pMax: 0.40, label: 'Fair' },
    { min: 0,  max: 24,  pMin: 0.00, pMax: 0.10, label: 'Poor' }
  ];

  /* What an upgrade costs to accept. Rods use their own price; a lure costs a
     multiple of its unit price. Money is a pacing gate, not a shop — the
     upgrade is given, the money only decides when it shows up. */
  const BAIT_GRANT_MULT = 12;

  /* ══════════════════════════════════════════════════════════════════════
     PALETTE — read once per theme change, not per frame. Anything the 3D
     layer reads must be listed here or css() silently returns grey.
     ══════════════════════════════════════════════════════════════════════ */

  const PALETTE_VARS = [
    '--paper', '--paper2', '--ink', '--ink2',
    '--bg', '--panel', '--panel2', '--line', '--text', '--dim',
    '--accent', '--accent2', '--violet', '--focus', '--good', '--bad',
    '--zone-target', '--zone-other', '--zone-none',
    '--reel-good', '--reel-high', '--reel-low',
    '--biome-shallows', '--biome-weedbed', '--biome-dropoff',
    '--biome-rockyshore', '--biome-deepchannel',
    '--water-shallow', '--water-mid', '--water-deep', '--glint',
    '--water-near', '--water-far', '--fish-dark', '--fish-target',
    '--sky-low', '--sky-mid', '--sky-high', '--fogcol',
    '--bank-grass', '--bank-soil', '--foliage-dark', '--foliage-light',
    '--rock-light', '--rock-mid', '--rock-dark', '--sand',
    '--lily', '--reed', '--log',
    '--boat', '--boat-trim', '--boat-deck', '--boat-dark', '--angler',
    '--shirt', '--jeans', '--cap', '--vest',
    '--dock', '--shack', '--roof', '--rod', '--line-mono', '--bobber',
    '--shop-wall', '--shop-floor', '--pegboard', '--glass',
    '--keeper-shirt', '--keeper-cap', '--trophy', '--shop-beam'
  ];
  let PAL = {};
  function refreshPalette() {
    if (typeof getComputedStyle !== 'function') return;
    const cs = getComputedStyle(document.body);
    PAL = {};
    for (const v of PALETTE_VARS) PAL[v] = cs.getPropertyValue(v).trim() || '#888';
  }
  function css(name) { return PAL[name] || '#888'; }

  /* ══════════════════════════════════════════════════════════════════════
     HELPERS OVER THE DATA
     ══════════════════════════════════════════════════════════════════════ */

  function fishById(id) { return D.FISH.find(f => f.id === id); }
  function baitById(id) { return D.BAIT.find(b => b.id === id) || D.BAIT[0]; }
  function rodById(id)  { return D.RODS.find(r => r.id === id) || D.RODS[0]; }
  function biomeName(id) { return D.BIOMES[id] ? D.BIOMES[id].name : id; }
  function missionByN(n) { return D.MISSIONS.find(m => m.n === n) || D.MISSIONS[0]; }
  const round1 = (v) => Math.round(v * 10) / 10;

  /** How far this rod throws, in world units. */
  function castRange(rodId) {
    return (rodById(rodId).reachFt / D.LAKE.maxRadiusFt) * CFG.MAX_CAST_UNITS;
  }

  /** How far off the route a shoal of this biome sits. */
  function shoalOffset(biomeId) {
    return CFG.SHOAL_BASE + CFG.SHOAL_SPAN * D.BAND_FRAC[D.BIOME_RING[biomeId]];
  }

  /** Species that live in a biome, biggest first — what the shoal looks like. */
  function biomeFish(biomeId) {
    return D.FISH.filter(f => !f.secret && f.biomeIds.includes(biomeId))
                 .sort((a, b) => b.lengthRange[1] - a.lengthRange[1]);
  }
  function biomeFishNames(biomeId) { return biomeFish(biomeId).map(f => f.name); }

  /* ══════════════════════════════════════════════════════════════════════
     BOOT AUDIT
     Asserted at boot, not just in tests. A failure here would hand the player
     a mission they cannot finish, which is unrecoverable.
     ══════════════════════════════════════════════════════════════════════ */

  function auditMissions() {
    const problems = [];
    for (const m of D.MISSIONS) {
      if (!D.RODS.find(r => r.id === m.rodId)) { problems.push('m' + m.n + ': unknown rod'); continue; }
      for (const b of m.biomes) {
        if (!D.biomeFishable(b, m.rodId)) {
          problems.push('m' + m.n + ': ' + b + ' is outside ' + m.rodId + "'s reach");
        }
        // The rod must also physically be able to throw that far from the
        // closest the boat can steer, or the water is open on paper only.
        const gap = Math.max(0, shoalOffset(b) - CFG.LANE_HALF);
        if (castRange(m.rodId) < gap) {
          problems.push('m' + m.n + ': ' + b + ' sits ' + Math.round(gap) +
                        ' units past the lane but ' + m.rodId + ' throws only ' +
                        Math.round(castRange(m.rodId)));
        }
      }
      if (!D.BAIT.find(x => x.id === m.baitId)) problems.push('m' + m.n + ': unknown bait');
      if (m.target.speciesId) {
        const sp = fishById(m.target.speciesId);
        if (!sp) problems.push('m' + m.n + ': unknown species');
        else if (!sp.biomeIds.some(b => m.biomes.includes(b))) {
          problems.push('m' + m.n + ': target ' + m.target.speciesId + ' lives nowhere this mission fishes');
        }
      }
    }
    if (problems.length) {
      const msg = 'FishMaster mission audit FAILED:\n  ' + problems.join('\n  ');
      console.error(msg);
      throw new Error(msg);
    }
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════
     SAVE
     Gear is derived from the mission number rather than stored: a mission
     cannot be turned in until its upgrade has been accepted, so the two can
     never drift apart.
     ══════════════════════════════════════════════════════════════════════ */

  const SAVE_KEY = 'fishmaster';
  const SAVE_VERSION = 2;

  function defaultSave() {
    return {
      version: SAVE_VERSION,
      currentMission: 1,
      highestMission: 1,
      progressValue: 0,      // persists across trips, so going in is never a loss
      grantTaken: 0,         // mission whose gear has been collected
      hold: [],              // caught but not yet sold — see sellCatch()
      money: 0,
      lifetimeEarned: 0,
      /* Tier owned in each shop line, 0 for none. An older save simply gets
         the default object back from Object.assign, so nothing needs a save
         version bump. */
      gear: { finder: 0, line: 0, alarm: 0, cooler: 0 },
      /* The rods actually owned, oldest first. Everyone starts with the one
         that came with the boat; the rest are bought. What you FISH with is
         the best of these (bestRod), not whatever rod the mission happens to
         name - a mission names the rod it was balanced around, and that is a
         target to reach, not a loan. */
      rods: ['starter'],
      /* And the lures. The plain worm comes in the box and is free forever;
         every other one is bought. What is ON THE HOOK is the best of these
         for the job in hand - never a lure the shop has not sold you. */
      baits: ['plainworm'],
      completed: false,      // the Dingus is caught; the lake is open
      creel: [],
      best: {},
      cardStyle: 'plaque',
      theme: 'ben',
      cueLevel: 2
    };
  }

  let save = defaultSave();
  function loadSave() {
    const raw = U.load(SAVE_KEY, null);
    save = (raw && raw.version === SAVE_VERSION) ? Object.assign(defaultSave(), raw) : defaultSave();
    /* A save from before rods were owned rather than assumed. Whatever rod the
       mission they are on was balanced around, they have been fishing with it
       for hours - so they own it. Nobody gets demoted by an update. */
    if (!Array.isArray(save.rods) || !save.rods.length) save.rods = ['starter'];
    if (!Array.isArray(save.baits) || !save.baits.length) save.baits = ['plainworm'];
    const m = missionByN(save.currentMission) || {};
    if (m.rodId && save.rods.indexOf(m.rodId) < 0) save.rods.push(m.rodId);
    if (m.baitId && save.baits.indexOf(m.baitId) < 0) save.baits.push(m.baitId);
    return save;
  }
  function persist() { U.save(SAVE_KEY, save); }
  function resetProgress() { save = defaultSave(); persist(); }
  function getSave() { return save; }

  /** Mission 31 stays invisible until 30 is turned in. */
  function visibleMissions() {
    return D.MISSIONS.filter(m => !m.hidden || save.highestMission > 30);
  }
  /* Once the Dingus is caught there is no next mission - and being parked
     forever on a job already finished is a sour way to end a fishing game. So
     the ladder is replaced by open water: the best gear, the whole lake, and
     nothing to complete. Everything else in the game (spots, bites, the shop,
     the hold) carries on working exactly as it did. */
  const FREE_ROAM = {
    n: 0,
    rodId: 'titanium',
    baitId: 'secret_t_pill',
    biomes: ['shallows', 'weedbed', 'rockyshore', 'dropoff', 'deepchannel'],
    target: { type: 'freeRoam', amount: Infinity },
    text: 'Fish wherever you like',
    free: true
  };

  function isFinished() { return !!save.completed; }

  function currentMission() {
    if (save.completed) return FREE_ROAM;
    return missionByN(save.currentMission);
  }

  /* ── The upgrade a mission hands over, and what it costs to take ──────── */

  function baitBlurb(b) {
    const ids = Object.keys(b.biasTable || {});
    if (!ids.length) return 'Reliable, if unexciting.';
    const names = ids.map(id => { const f = fishById(id); return f ? f.name : id; });
    return 'Fish that go for it: ' + names.slice(0, 3).join(', ') + '.';
  }

  function grantFor(m) {
    if (m.grantsRodId) {
      /* Bought off the wall already? Then there is nothing to hand over. The
         wall sells rods outright now, so the same rod must not be sold twice
         or stand between anybody and their finished job. */
      if (ownsRod(m.grantsRodId)) return null;
      const rod = rodById(m.grantsRodId);
      return { kind: 'rod', id: rod.id, name: rod.name, cost: rod.cost,
               note: rod.reachNote, description: rod.description, art: rodArtSrc(rod) };
    }
    if (m.grantsBaitId) {
      const b = baitById(m.grantsBaitId);
      const secret = b.id === 'secret_t_pill';
      return { kind: 'bait', id: b.id, name: b.name,
               cost: secret ? 0 : Math.round(b.costPerUnit * BAIT_GRANT_MULT),
               note: secret ? 'Nobody has ever explained what is in it.'
                            : 'A better lure for the water ahead.',
               description: baitBlurb(b), art: baitArtSrc(b) };
    }
    return null;
  }

  /** Everything the shop needs to know about turning the trip in. */
  function turnInState() {
    const m = currentMission();
    const done = targetComplete(m, save.progressValue);
    const grant = grantFor(m);
    const affordable = !grant || save.money >= grant.cost;
    const grantTaken = !grant || save.grantTaken === m.n;
    return {
      mission: m, done, grant, affordable, grantTaken,
      money: save.money,
      short: grant ? Math.max(0, grant.cost - save.money) : 0,
      progressText: targetProgressText(m, save.progressValue),
      tip: missionTip(m),
      targetSpeech: targetSpeech(m, save.progressValue),
      hold: holdCount(), holdValue: holdValue(),
      /* The fish is the job.
       *
       * This used to be `done && grantTaken` - catch the pike, then buy the
       * next rod, THEN you may hand it in - which turned a receipt into a
       * requirement and left people who had done the hard part being told no.
       * What gear does now is decide the odds out on the water (rodHolds), and
       * that is the honest place for it: the rod is why the fish was hard to
       * land, not a form to be countersigned afterwards. */
      canTurnIn: done,
      /* Money in the tin and the thing on the shelf: that is the whole test.
       *
       * It used to need the JOB finished as well, which produced the worst
       * kind of shop - "CastMaster 3000, $150" on the wall, $200 in your
       * pocket, and no way to buy it and no plain statement of why. The gate
       * was there to stop anyone starting the next mission without its gear,
       * and canTurnIn already does that job on its own: the job cannot be
       * handed in until the gear is bought, whenever it was bought. */
      canTakeGrant: !!grant && affordable && !grantTaken,
      isLast: m.n >= D.MISSIONS.length
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     SHOP GEAR
     Everything bought off the shelf works by moving one number. Each knob is
     read through the accessor below rather than straight off CFG, so a tier
     bought at the counter is felt on the very next cast without anything
     having to be told about it.
     ══════════════════════════════════════════════════════════════════════ */

  function stockLine(id) { return D.SHOP_STOCK.find(l => l.id === id) || null; }
  function ownedTier(id) { return (save.gear && save.gear[id]) || 0; }

  /** The effect of the highest tier owned in a line, or {} if none. */
  function gearEffect(id) {
    const line = stockLine(id), t = ownedTier(id);
    if (!line || t < 1) return {};
    return line.tiers[Math.min(t, line.tiers.length) - 1].effect || {};
  }

  // The knobs. Each falls back to its CFG value when nothing is owned.
  function spotWindow()  { return CFG.SPOT_WINDOW * (gearEffect('finder').window || 1); }
  function cueLead()     { return CFG.CUE_LEAD + (gearEffect('finder').lead || 0); }
  function strainSnap()  { return gearEffect('line').snap || CFG.STRAIN_SNAP_S; }
  /* Math.max, not `||`: the base window is already generous, so a bite alarm
     is only ever allowed to make a take LONGER. Taking the gear's own number
     outright is how buying one could have shortened the wait it sells. */
  function hookMin()     { return Math.max(CFG.HOOK_MIN, gearEffect('alarm').hookMin || 0); }
  function hookMax()     { return Math.max(CFG.HOOK_MAX, gearEffect('alarm').hookMax || 0); }
  function sellRate()    { return gearEffect('cooler').sell || 1; }
  /* How much of the empty-hook rate survives. A fish finder is pointed at
     actual fish, so it should mean fewer casts that come back with a boot or
     with nothing at all - not just an earlier warning. 1 = no help. */
  function junkRate()    { return gearEffect('finder').junk || 1; }

  /** What the shop has on the shelf right now, and what you could take home. */
  /**
   * Every fish in the lake, and what you have done about it.
   *
   * The creel was six lines of text about the biggest six. This is the whole
   * table: what you have caught, how big the best one was, and - for the ones
   * you have not - which water they live in, so an empty row is a place to go
   * rather than a blank. It is built from data the game already had; the only
   * thing missing was somewhere to look at it.
   */
  function fishLog() {
    const rows = [];
    for (const f of D.FISH) {
      const best = save.best[f.id] || null;
      /* The secret fish stays a secret until it is caught. Listing it as a
         gap to fill would give away that there is one. */
      if (f.secret && !best) continue;
      const caught = save.creel.filter(c => c.id === f.id).length;
      rows.push({
        id: f.id, name: f.name, art: 'images/fish/' + f.id + '.png',
        color: f.color, keeper: keeperLength(f),
        waters: (f.biomeIds || []).map(biomeName),
        caught, best,
        tier: f.difficultyTier || 3
      });
    }
    return rows;
  }

  /**
   * The gear on the boat right now, in the order the shop lists it.
   *
   * Buying something used to change nothing you could see: the shelf went on
   * showing the NEXT tier up, and the only trace of a purchase was a number
   * quietly moving somewhere in the rules. This is what the HUD, the dock and
   * the shop all read to say "you own this".
   */
  function ownedGear() {
    const out = [];
    for (const line of D.SHOP_STOCK) {
      const t = ownedTier(line.id);
      if (!t) continue;
      out.push({ id: line.id, icon: line.icon, line: line.name,
                 name: line.tiers[t - 1].name, tier: t,
                 note: line.tiers[t - 1].note,
                 maxed: t >= line.tiers.length });
    }
    return out;
  }

  function shopStock() {
    return D.SHOP_STOCK.map(line => {
      const owned = ownedTier(line.id);
      const next = line.tiers[owned] || null;      // null once it is maxed
      return {
        id: line.id, name: line.name, icon: line.icon, blurb: line.blurb,
        owned, maxed: !next,
        ownedName: owned ? line.tiers[owned - 1].name : null,
        next: next ? { name: next.name, cost: next.cost, note: next.note } : null,
        affordable: !!next && save.money >= next.cost,
        short: next ? Math.max(0, next.cost - save.money) : 0
      };
    });
  }

  /** Buy the next tier in a line. Returns what was bought, or null. */
  function buyStock(id) {
    const line = stockLine(id);
    if (!line) return null;
    const owned = ownedTier(id);
    const next = line.tiers[owned];
    if (!next || save.money < next.cost) return null;
    save.money -= next.cost;
    save.gear[id] = owned + 1;
    persist();
    pushHud();
    return { line: line.name, icon: line.icon, name: next.name,
             cost: next.cost, note: next.note, tier: owned + 1,
             maxed: owned + 1 >= line.tiers.length };
  }

  /**
   * What to buy next, and the reason, in terms of the fish you are after.
   *
   * Progression only feels like progression if the player can see the next
   * rung. This looks at the job in hand and the money in the tin and says one
   * concrete thing - "the CastMaster 3000 would give you a much better chance
   * at Northern Pike" - rather than leaving somebody to work out for
   * themselves why the big ones keep getting away.
   *
   * Returns null when there is genuinely nothing worth saying.
   */
  function gearAdvice() {
    const m = run ? run.mission : currentMission();
    const want = m.target && m.target.speciesId ? fishById(m.target.speciesId) : null;
    const rod = bestRod();

    /* 1. The next job's gear, when money is the only thing in the way.
     *
     * First, on purpose. "A better rod would help" is a fact; "it is forty
     * dollars away, and fish are what pay for it" is a thing to go and do -
     * which is the only kind of advice worth giving somebody who is asking
     * what to do next. */
    const st = turnInState();
    if (st.grant && !st.grantTaken && !st.affordable) {
      return {
        kind: 'grant',
        text: 'The <b>' + st.grant.name + '</b> is <b>$' + st.short + '</b> away. ' +
              'Catch a few more and sell them to the shopkeeper — that is what pays for it.',
        speech: 'The ' + st.grant.name + ' is ' + st.short + ' dollars away. Catch a few ' +
                'more fish and sell them to the shopkeeper. That is what pays for it.'
      };
    }
    if (st.canTakeGrant) {
      return {
        kind: 'grant',
        text: 'You can afford the <b>' + st.grant.name + '</b> — <b>$' + st.grant.cost +
              '</b>. The next job is built around it.',
        speech: 'You can afford the ' + st.grant.name + ', ' + st.grant.cost +
                ' dollars. The next job is built around it.'
      };
    }

    // 2. Is the rod the thing holding this mission back?
    if (want) {
      const cls = ROD_CLASS[rod.id] || 3;
      if ((want.difficultyTier || 3) > cls) {
        const better = D.RODS.find(r => (ROD_CLASS[r.id] || 3) >= (want.difficultyTier || 3));
        if (better) {
          return {
            kind: 'rod',
            /* A rod comes up the ladder: it is a job's grant, bought at the
               counter once the money is there. The shelf beside this advice
               sells finders, line, alarms and coolers, so the wording has to
               point at the ladder and not at the shelf. */
            text: 'A better rod would help with <b>' + want.name + '</b> — ' +
                  'the <b>' + better.name + '</b> is built for fish that size. ' +
                  'It comes up the ladder, one job at a time.',
            speech: 'A better rod would help with ' + want.name + '. The ' +
                    better.name + ' is built for fish that size, and it comes up ' +
                    'the ladder one job at a time.'
          };
        }
      }
    }

    // 3. Otherwise, the best thing on the shelf you can already afford.
    const affordable = shopStock().filter(g => !g.maxed && g.affordable);
    if (affordable.length) {
      // Cheapest first, so the advice is always the next step rather than a
      // distant one - and so taking it leaves money for the next.
      affordable.sort((a, b) => a.next.cost - b.next.cost);
      const g = affordable[0];
      return {
        kind: 'stock', id: g.id,
        text: 'You can afford the <b>' + g.next.name + '</b> — ' + g.next.note,
        speech: 'You can afford the ' + g.next.name + '. ' + g.next.note
      };
    }

    // 3. Nothing affordable: name what to save for.
    const next = shopStock().filter(g => !g.maxed).sort((a, b) => a.short - b.short)[0];
    if (next) {
      return {
        kind: 'save', id: next.id,
        text: 'Another <b>$' + next.short + '</b> buys the <b>' + next.next.name + '</b>.',
        speech: 'Another ' + next.short + ' dollars buys the ' + next.next.name + '.'
      };
    }
    return null;
  }

  /** What is sitting in the hold, and what it is worth. */
  function holdValue() {
    // A cooler is worth what it pays, so its bonus has to be in every figure
    // the shop quotes — not just in the money that lands at the end.
    const raw = save.hold.reduce((n, x) => n + (x.value || 0), 0);
    return Math.round(raw * sellRate());
  }
  function holdCount() { return save.hold.length; }

  /** The shop buys the lot. */
  function sellCatch() {
    const total = holdValue();
    const count = holdCount();
    if (!count) return null;
    // The best of the bunch, so the shopkeeper has something to remark on.
    const best = save.hold.slice().sort((a, b) => b.value - a.value)[0];
    save.money += total;
    save.lifetimeEarned += total;
    save.hold = [];
    persist();
    return { total, count, best };
  }

  /** Take the upgrade off the wall and pay for it. */
  function takeGrant() {
    const st = turnInState();
    if (!st.canTakeGrant) return null;
    save.money = Math.max(0, save.money - st.grant.cost);
    save.grantTaken = st.mission.n;
    // Handed over is owned, and it stays owned.
    if (st.grant.kind === 'rod' && !ownsRod(st.grant.id)) save.rods.push(st.grant.id);
    if (st.grant.kind === 'bait' && !ownsBait(st.grant.id)) save.baits.push(st.grant.id);
    persist();
    pushHud();
    return st.grant;
  }

  /**
   * Everything the counter owes you, in one press.
   *
   * Coming in with a job finished used to be three separate conversations
   * with the same man: sell the fish, then go to the tackle wall for the gear
   * the next job needs, then come back and hand the job in - in that order,
   * and only that order, because the gear is paid for out of the fish money
   * and the job cannot be handed in without it. Every one of those steps was
   * a menu to find, and getting them out of order left you stuck with no way
   * of knowing why.
   *
   * So it is one action now. Sell what is in the hold, buy the gear the next
   * job needs (it still costs what it costs - nothing here is free), hand the
   * job in, and say what happened on one card. If the money still is not
   * enough after selling, nothing is bought and nothing is handed in: the
   * card says how much more is needed, which is the one thing the player
   * actually has to know.
   */
  function handInJob() {
    const st = turnInState();
    if (!st.done) return null;
    const sold = sellCatch();                    // null if the hold was empty
    const after = turnInState();                 // the sale may have paid for the gear
    /* A grant that costs nothing is never left behind: Vitamin T is free, and
       the last mission cannot be fished without it. */
    const grant = after.canTakeGrant ? takeGrant() : null;
    const result = turnInMission();
    return {
      sold, grant, result,
      short: result ? 0 : turnInState().short,
      gearName: after.grant ? after.grant.name : null
    };
  }

  /** Take the upgrade, bank the mission, move to the next one. */
  function turnInMission() {
    const st = turnInState();
    if (!st.canTurnIn) return null;
    const m = st.mission;
    save.progressValue = 0;
    save.grantTaken = 0;
    if (save.highestMission <= m.n) save.highestMission = m.n + 1;
    save.currentMission = Math.min(m.n + 1, D.MISSIONS.length);
    // Handing in the last one opens the lake up for good.
    if (m.finale) save.completed = true;
    persist();
    return { mission: m, grant: st.grant, finale: !!m.finale,
             revealsSecret: !!m.revealsSecret, next: missionByN(save.currentMission) };
  }


  /* ── The dock's scannable things ──────────────────────────────────────── */

  const DOCK_LABELS = {
    shop: { label: 'Tackle Shop', speech: 'Tackle shop' },
    boat: { label: 'Take the Boat Out', speech: 'Take the boat out' },
    // The board is painted MAIN MENU, so it needs no floating plate.
    home: { label: 'Main Menu', speech: 'Main menu', quiet: true }
  };

  /**
   * What you can pick at the dock, in scan order.
   *
   * The note pinned up top-left comes first and carries everything you need to
   * know — the job, the gear, the money. Because it does, the things in the
   * world are labelled with nothing but their own names: a boat that says
   * "Take the Boat Out" and, underneath, a running total of sunfish is a boat
   * doing two jobs badly.
   */
  function dockTargets() {
    const items = [{
      key: 'note', label: 'Mission', domId: 'dockHud',
      sub: '', speech: 'Your mission note. ' + currentMission().text
    }];
    /* `sceneIndex` is the item's place in the SCENE's target list, which is not
       its place in this one — the note comes first here and has no object out
       there at all. Without it the plates and the glow land one target off, so
       the sign ends up captioned "Tackle Shop". */
    RT.scene.dockTargets.forEach((t, k) => {
      const meta = DOCK_LABELS[t.key] || { label: t.key, speech: t.key };
      items.push({ key: t.key, label: meta.label, sub: '', sceneIndex: k,
                   speech: meta.speech, quiet: !!meta.quiet, below: !!t.below });
    });
    return items;
  }


  /** Step inside the tackle shop. */
  function enterShop() {
    run = null;
    paused = false;
    RT.scene.showShop();
  }

  const SHOP_LABELS = {
    tackle: { label: 'Tackle', speech: 'Tackle' },
    keeper: { label: 'Shopkeeper', speech: 'The shopkeeper' },
    door:   { label: 'Leave the Shop', speech: 'Leave the shop, back to the dock' }
  };

  /**
   * A tip for the current mission, built from the mission's own data so it can
   * never contradict it: where the fish are, whether the bait suits them, and
   * whether any of that water is near the end of the line.
   */
  function missionTip(m) {
    const sp = m.target.speciesId ? fishById(m.target.speciesId) : null;
    if (!sp) return 'Anything counts for this one. Just fill the boat.';
    const bits = [];
    const where = m.biomes.filter(b => sp.biomeIds.includes(b)).map(biomeName);
    if (where.length) bits.push(sp.name + ' hang about the ' + where.join(' and the ') + '.');
    const bait = baitById(m.baitId);
    if (bait.biasTable && bait.biasTable[sp.id]) {
      bits.push('That ' + bait.name + ' is just the thing for them.');
    }
    const far = m.biomes.filter(b => shoalOffset(b) - CFG.LANE_HALF > castRange(m.rodId) * 0.75);
    if (far.length) {
      bits.push('Steer right up close for the ' + far.map(biomeName).join(' and the ') +
                " — that's near the end of your line.");
    }
    return bits.join(' ');
  }

  /** What is worth picking inside the shop, with live sub-labels. */
  function shopTargets() {
    const st = turnInState();
    return RT.scene.dockTargets.map((t, k) => {
      const meta = SHOP_LABELS[t.key] || { label: t.key, speech: t.key };
      let sub = '', speech = meta.speech;
      if (t.key === 'tackle') {
        if (!st.grant)            { sub = 'Nothing new in'; speech = 'Tackle. Nothing new in just now.'; }
        else if (st.grantTaken)   { sub = st.grant.name + ' — got it'; speech = 'Tackle. You already have the ' + st.grant.name + '.'; }
        else if (!st.affordable)  { sub = 'Short by $' + st.short; speech = 'Tackle. The ' + st.grant.name + ' needs another ' + st.short + ' dollars.'; }
        else                      { sub = 'Buy the ' + st.grant.name + ' — $' + st.grant.cost;
                                    speech = 'Tackle. The ' + st.grant.name + ' is yours for ' + st.grant.cost + ' dollars. The next job needs it.'; }
      } else if (t.key === 'keeper') {
        /* The finished job first, whatever else is going on, because he now
           settles the whole visit in one press - the fish, the gear the next
           job needs, and the job itself. "Gear up first" is gone with the
           trip to the tackle wall that used to come before this. */
        if (st.done) {
          const g = st.grantTaken ? null : st.grant;
          const after = st.money + st.holdValue;
          if (g && after < g.cost) {
            sub = 'Short by $' + (g.cost - after);
            speech = 'The shopkeeper. The job is done, but the ' + g.name +
                     ' for the next one needs another ' + (g.cost - after) +
                     ' dollars, even after the fish.';
          } else {
            sub = 'Hand the job in' + (st.hold ? ' — and sell $' + st.holdValue : '');
            speech = 'The shopkeeper, ready to take your job in' +
                     (st.hold ? ' and buy your catch' : '') +
                     (g ? ', and to sell you the ' + g.name + ' for the next one.' : '.');
          }
        } else if (st.canTakeGrant) {
          // He will sell you the next job's gear across the counter, too.
          sub = 'Buy the ' + st.grant.name + ' — $' + st.grant.cost;
          speech = 'The shopkeeper. He has the ' + st.grant.name + ' for ' + st.grant.cost +
                   ' dollars, and the next job needs it.';
        } else if (st.hold) {
          sub = 'Sell your catch — $' + st.holdValue;
          speech = 'The shopkeeper. Great catch! He will buy those ' + st.hold + ' for ' + st.holdValue + ' dollars.';
        } else {
          sub = st.progressText;
          speech = 'The shopkeeper. ' + st.progressText + ' so far.';
        }
      } else {
        sub = 'Back to the dock';
      }
      return { key: t.key, label: meta.label, sub, speech, sceneIndex: k };
    });
  }


  /** Everything the mission note shows, and the briefing behind it. */
  function missionBrief() {
    const st = turnInState();
    const m = st.mission;
    return {
      n: m.n, text: m.text,
      progress: st.progressText,
      done: st.done,
      rod: bestRod(), bait: bestBaitFor(m),
      /* What the mission was balanced around, when that is not what you are
         carrying: the honest version of "this one is going to be hard". */
      wantedRod: (ROD_CLASS[m.rodId] || 3) > (ROD_CLASS[bestRodId()] || 3)
                   ? rodById(m.rodId) : null,
      nextRod: nextRod(),
      gear: ownedGear(),
      rodArt: rodIconSrc(bestRod()), baitArt: baitArt(bestBaitFor(m)),
      /* The lure this job was built around, when it is not the one on the
         hook: the honest "this is going to be slower than it should be". */
      wantedBait: (m.baitId && !ownsBait(m.baitId)) ? baitById(m.baitId) : null,
      money: st.money,
      grant: st.grant, short: st.short, affordable: st.affordable,
      grantTaken: st.grantTaken,
      tip: missionTip(m),
      /* What the next job needs and what it costs, said while there is still
         time to save up for it rather than only at the counter. */
      nextGear: (function () {
        const g = grantFor(m);
        if (!g || save.grantTaken === m.n) return null;
        /* `ready` is the whole point: the gear is handed over when the JOB is
           done, so telling somebody to go and get it before then sends them to
           a shelf that will refuse them. The note can say what is coming and
           what it costs; it may only offer the way there once it is actually
           on sale. */
        return { name: g.name, kind: g.kind, cost: g.cost,
                 short: Math.max(0, g.cost - save.money),
                 ready: st.canTakeGrant };
      })(),
      caught: save.creel.length,
      earned: save.lifetimeEarned,
      hold: holdCount(), holdValue: holdValue()
    };
  }

  /* ── The choices at a fishing spot ────────────────────────────────────── */

  /**
   * The man casts, the boat moves on, and the pause button is the third stop
   * so a switch can always reach it. The pause entry names a DOM element
   * instead of an object in the world — it lives in the corner like every
   * other game's pause button rather than floating in the lake.
   */
  function spotTargets() {
    const spot = run && run.current;
    const items = [];
    let reach = null;
    if (spot) {
      reach = spot.shoals.map(sh => {
        const dd = Math.hypot(sh.lateral - run.lateral, (spot.dist + sh.along) - run.dist);
        return { biome: biomeName(sh.biome), isTarget: sh.isTarget,
                 inRange: dd <= run.range, cooled: sh.caught >= CFG.SPOT_COOLOFF };
      });
    }
    const good = reach ? reach.filter(x => x.inRange && !x.cooled) : [];
    const mine = good.filter(x => x.isTarget);

    items.push({
      key: 'cast', label: 'Cast', sceneIndex: 0,
      sub: good.length
        ? (mine.length ? 'Your fish are here' : good.map(x => x.biome).join(' & '))
        : 'Nothing in reach',
      speech: good.length
        ? ('Cast. ' + (mine.length ? 'Your fish are here, in the ' + mine.map(x => x.biome).join(' and the ') + '.'
                                   : 'The ' + good.map(x => x.biome).join(' and the ') + ' are in reach.'))
        : 'Cast. Nothing in reach from here, but you can always try.'
    });
    items.push({
      key: 'troll', label: 'Troll On', domId: 'tcTroll',
      sub: 'Find another spot',
      speech: 'Troll on, and find another spot.'
    });
    items.push({
      key: 'pause', label: 'Pause', domId: 'pauseBtn',
      sub: '', speech: 'Pause'
    });
    return items;
  }

  /* ══════════════════════════════════════════════════════════════════════
     MISSION TARGETS
     ══════════════════════════════════════════════════════════════════════ */

  function targetComplete(m, value) {
    // Free roam is never "done" - there is nothing to hand in, so no card
    // fires and the trip simply keeps going for as long as you want it to.
    if (m.target.type === 'freeRoam') return false;
    return value >= m.target.amount;
  }

  function targetProgressText(m, value) {
    const t = m.target;
    if (t.type === 'freeRoam') return 'Free fishing';
    if (t.type === 'catchWeight') return round1(value) + ' / ' + t.amount + ' lbs';
    const sp = t.speciesId ? fishById(t.speciesId) : null;
    const name = sp ? sp.name : 'Fish';
    if (t.type === 'catchLength') {
      return value >= t.amount ? name + ' ' + t.amount + '" ✓' : name + ' ' + t.amount + '"+';
    }
    return name + ' ' + Math.floor(value) + ' / ' + t.amount;
  }

  /**
   * The target said out loud, in the shape someone would actually say it:
   * what you have, out of what is wanted, and how many more that leaves.
   * The card shows "2 / 3 Sunfish"; this is what gets spoken.
   */
  function targetSpeech(m, value) {
    const t = m.target;
    const sp = t.speciesId ? fishById(t.speciesId) : null;
    const name = sp ? sp.name : 'fish';
    if (t.type === 'catchWeight') {
      const left = Math.max(0, t.amount - value);
      return left <= 0
        ? 'You have the full ' + t.amount + ' pounds.'
        : 'You have ' + round1(value) + ' of ' + t.amount + ' pounds. ' +
          round1(left) + ' more to go.';
    }
    if (t.type === 'catchLength') {
      return value >= t.amount
        ? 'You have your ' + name + '.'
        : 'You need one ' + name + ' at least ' + t.amount + ' inches long.';
    }
    const have = Math.floor(value), need = t.amount;
    const left = Math.max(0, need - have);
    /* No 's'. Fish species do not take one - three Sunfish, two Bass, a dozen
       Pike - and the voice saying "one of three Sunfishs" is the kind of thing
       that makes a game sound like a spreadsheet reading itself out. */
    if (left <= 0) return 'You have all ' + need + ' ' + name + '.';
    return 'You have ' + have + ' of ' + need + ' ' + name + '. ' +
           (left === 1 ? 'One more.' : left + ' more to go.');
  }

  /** A junk or valuable catch never counts toward a target. */
  function applyToTarget(m, outcome) {
    const t = m.target;
    if (outcome.type !== 'fish') return false;
    if (t.type === 'catchWeight') { save.progressValue += outcome.weight; return true; }
    if (t.type === 'catchLength') {
      if (outcome.id === t.speciesId && outcome.length >= t.amount) {
        save.progressValue = t.amount; return true;
      }
      return false;
    }
    if (!t.speciesId || outcome.id === t.speciesId) { save.progressValue++; return true; }
    return false;
  }

  /* ══════════════════════════════════════════════════════════════════════
     FISHING SPOTS
     ══════════════════════════════════════════════════════════════════════ */

  function targetBiomes(m) {
    if (!m.target.speciesId) return m.biomes.slice();
    const sp = fishById(m.target.speciesId);
    return sp ? m.biomes.filter(b => sp.biomeIds.includes(b)) : [];
  }
  function otherBiomes(m) {
    const t = targetBiomes(m);
    return m.biomes.filter(b => !t.includes(b));
  }
  /** Every biome this mission fishes holds the target, so no spot is wrong. */
  function isAllTarget(m) { return !!m.allGreen || otherBiomes(m).length === 0; }

  /**
   * One spot along the route: one or two shoals, on opposite sides.
   *
   * Deterministic in (mission, index, sinceTarget). The rule that a shoal of
   * the target species turns up at least every three spots is enforced with a
   * counter rather than left to luck — it is what makes holding out for better
   * water a strategy instead of a gamble.
   */
  function generateSpot(missionN, index, sinceTarget) {
    const m = missionByN(missionN);
    const r = U.rng(U.hash('m' + missionN + ':spot' + index));
    const tgt = targetBiomes(m), oth = otherBiomes(m);
    const allTarget = isAllTarget(m);
    const force = !allTarget && sinceTarget >= CFG.TARGET_WINDOW - 1;

    function shoal(side, wantTarget) {
      const pool = wantTarget ? tgt : oth;
      const biome = r.pick(pool.length ? pool : m.biomes);
      const fish = biomeFish(biome);
      const isTarget = tgt.includes(biome);

      /* WHICH fish this shoal is called after.
       *
       * `isTarget` is a property of the BIOME - it means "the fish you are
       * after lives in this water". But biomeFish() sorts biggest-first, so
       * naming the shoal after fish[0] named it after the biggest thing in
       * that water instead. On a Sunfish mission in a biome that also holds
       * carp, the game cheerfully announced "Common Carp - that is your fish".
       *
       * So: a shoal of yours is named after YOUR fish. Anything else is named
       * after the biggest thing living there, which is what you would notice.
       */
      const want = m.target && m.target.speciesId ? fishById(m.target.speciesId) : null;
      const named = (isTarget && want && want.biomeIds.includes(biome))
        ? want
        : (fish.length ? fish[0] : null);

      return {
        side, biome,
        // The species actually down there, so it can be named aloud on the
        // approach and painted in its own colour under the water.
        fishId: named ? named.id : null,
        fishName: named ? named.name : 'Fish',
        fishColor: named && named.color ? named.color : null,
        isTarget,
        lateral: (side === 'left' ? -1 : 1) * shoalOffset(biome),
        along: r.range(-24, 24),
        radius: CFG.SPOT_RADIUS,
        // The silhouettes: how big the fish here look on the water.
        /* Fish-sized. The boat is 9.4 units long, so a bass at 0.9 and a
           sturgeon at 2.0 sit right against it - which is what a fish looks
           like next to a boat. Blown up to read from the helm they stopped
           looking like fish and started looking like other boats. */
        fishLength: named ? Math.max(0.85, named.lengthRange[1] * 0.048) : 1.1,
        count: r.int(9, 14),
        seed: U.hash('shoal' + missionN + ':' + index + ':' + side),
        caught: 0
      };
    }

    const pair = r.chance(CFG.PAIR_CHANCE);
    const first = r.chance(0.5) ? 'left' : 'right';
    const other = first === 'left' ? 'right' : 'left';
    const shoals = [];

    if (allTarget) {
      shoals.push(shoal(first, true));
      if (pair) shoals.push(shoal(other, true));
    } else if (pair) {
      // Never two target shoals at once — that is a choice with no content.
      shoals.push(shoal(first, force || r.chance(0.55)));
      shoals.push(shoal(other, false));
    } else {
      shoals.push(shoal(first, force || r.chance(0.45)));
    }

    const hit = shoals.some(s => s.isTarget);
    return { shoals, sinceTarget: hit ? 0 : sinceTarget + 1 };
  }

  /* ══════════════════════════════════════════════════════════════════════
     BITE AND CATCH
     Ported from FishMaster I. Two deliberate changes: no `unlockedSpecies`
     filter (mission biomes are the only gate, so unlockLakeId stays dead),
     and no quality gate on landing.
     ══════════════════════════════════════════════════════════════════════ */

  /* How big a fish each rod is really up to.
     Reach already decides which WATER a rod can put a bait into. This decides
     what it can expect to hook once it is there: a starter rod will very
     occasionally get a muskie interested, but it is not the tool for it, and
     the game should say so by making it rare rather than by refusing. */
  const ROD_CLASS = { starter: 3, castmaster: 4, longshot: 5, titanium: 5 };

  /**
   * How much this rod hurts your chances with this species, 0..1.
   *
   * One tier above the rod's class is a long shot; two or more is a story you
   * tell afterwards. Nothing is ever impossible - it is a fishing game, and a
   * flat refusal would just read as the game being broken - but wanting the
   * next rod for the next fish is the whole shape of the progression.
   */
  function rodOdds(f, rodId, isObjective) {
    const cls = ROD_CLASS[rodId] || 3;
    const over = (f.difficultyTier || 3) - cls;
    if (over <= 0) return 1;
    const k = over === 1 ? 0.22 : 0.06;
    /* Except the fish the mission actually sent you for.
       Mission 8 asks for pike on the starter rod on purpose - that stretch is
       what makes the CastMaster feel earned. But at the full penalty it stops
       being a stretch and becomes a wall, and the ladder has to stay
       completable. So the objective gets a floor: distinctly harder without
       the right rod, never hopeless. */
    return isObjective ? Math.max(k, 0.55) : k;
  }

  /**
   * Whether this rod can HOLD a fish this size, once one has taken the bait.
   *
   * rodOdds() only weights the pool, and a weight is relative: in water that
   * holds nothing but muskellunge, the pool normalises and a starter rod
   * landed them all day. That is how the whole ladder could be walked on the
   * gear you began with, and why the shop had nothing to sell that mattered.
   *
   * So there is a second, ABSOLUTE test at the moment of the take. Fail it and
   * the line comes back with weed on it: the fish was there, it took the bait,
   * and the rod was not enough for it. Nothing is lost - no bait, no money, no
   * progress, and the next bite is seconds away - but you are told plainly
   * what happened and what would fix it.
   *
   * The fish the mission actually asks for keeps a floor: mission 8 wants a
   * pike on the starter rod on purpose, and that stretch is what makes the
   * CastMaster feel earned. A wall is not a stretch.
   */
  function rodHolds(f, rodId, isObjective) {
    const cls = ROD_CLASS[rodId] || 3;
    const over = (f.difficultyTier || 3) - cls;
    if (over <= 0) return 1;
    /* One class over is a fish that mostly wins; two or more is a fish that
       almost always does. Measured on a shoal the card named: a pike on the
       starter rod comes to hand on about one bite in seven, and on the
       CastMaster on three in four. That five-fold difference IS the reason to
       buy the rod - it was 36% either way before, which is why the shop had
       nothing to sell that mattered. */
    const k = over === 1 ? 0.18 : 0.05;
    /* The mission's own fish keeps a floor, but a low one: the ladder must not
       become a wall for somebody who cannot yet afford the rod, and fishing
       easier water for the money is always an option. */
    return isObjective ? Math.max(k, 0.15) : k;
  }

  /** The species this mission is actually asking for, if it names one. */
  function objectiveSpecies() {
    const m = run ? run.mission : currentMission();
    return (m && m.target && m.target.speciesId) || null;
  }

  function biteWeightedFishPool(biomeId, baitId, rodId) {
    const bait = baitById(baitId);
    const rod = rodId || bestRodId();
    return D.FISH.filter(f => {
      if (!f.biomeIds.includes(biomeId)) return false;
      // The secret fish only enters a pool when its own bait is equipped, and
      // bait is set per mission — so that baitId IS the whole Dingus unlock.
      if (f.secret) return !!(bait.biasTable && bait.biasTable[f.id]);
      return true;
    }).map(f => {
      const bias = (bait.biasTable && bait.biasTable[f.id]) || 0;
      /* Bait tips the odds toward a species, and the ABSENCE of the right bait
         tips them away from the one the job is about. A lure that names your
         fish is worth about four times one that does not - which is the whole
         reason to buy the lure the job was built around, and small enough that
         the wrong lure is a slog and never a wall. */
      const baitW = bias || (f.id === objectiveSpecies() ? 0.45 : 1);
      return { f, w: baitW * rodOdds(f, rod, f.id === objectiveSpecies()) };
    }).filter(x => x.w > 0);
  }

  /**
   * What is on the end of the line this time.
   *
   * `namedId` is the species the shoal was announced as - the one on the card
   * and in the spoken cue. On a shoal, most bites are that fish; everything
   * else comes off the biome's own table as before.
   */
  function rollBite(biomeId, baitId, onShoal, rnd, rodId, namedId) {
    const rand = rnd || Math.random;
    const base = onShoal ? CFG.BITE : CFG.BITE_OPEN;
    /* A finder shrinks the two outcomes nobody wants. Whatever it takes off
       them becomes fish, because the four cases have to add up to one. */
    const k = junkRate();
    const odds = { NOTHING: base.NOTHING * k, VALUABLE: base.VALUABLE, JUNK: base.JUNK * k };
    const r = rand();
    if (r < odds.NOTHING) return { category: 'nothing' };
    if (r < odds.NOTHING + odds.VALUABLE) return { category: 'valuable' };
    if (r < odds.NOTHING + odds.VALUABLE + odds.JUNK) return { category: 'junk' };

    const pool = biteWeightedFishPool(biomeId, baitId, rodId);
    if (!pool.length) return { category: 'nothing' };
    const heldRod = rodId || bestRodId();
    /* Every fish that takes the bait goes through the same gate: is this rod
       enough for it? Weed if not, and it is the same answer whether the fish
       came from the shoal's own promise or from the biome's table. */
    const taken = (id) => {
      const f = fishById(id);
      if (!f) return { category: 'nothing' };
      if (rand() < rodHolds(f, heldRod, id === objectiveSpecies())) {
        return { category: 'fish', speciesId: id };
      }
      return { category: 'empty', gearMiss: true, tooBig: f.name };
    };

    /* Keep the card's promise - as far as the lure on the hook can keep it.
       Only when the cast is actually ON the shoal, and only for a fish the rod
       and bait could have produced anyway (it is in the pool, so its weight is
       above zero). */
    const lure = baitById(baitId || equippedBaitId());
    const lureSuits = !!(lure && lure.biasTable && namedId && lure.biasTable[namedId]);
    const namedShare = CFG.SHOAL_NAMED_SHARE * (lureSuits ? 1 : CFG.WRONG_BAIT_SHARE);
    if (onShoal && namedId && pool.some(x => x.f.id === namedId) &&
        rand() < namedShare) {
      return taken(namedId);
    }
    const total = pool.reduce((s, x) => s + x.w, 0);
    let pick = rand() * total;
    for (const x of pool) { pick -= x.w; if (pick <= 0) return taken(x.f.id); }
    return taken(pool[pool.length - 1].f.id);
  }

  function bucketFor(q) {
    return QUALITY_BUCKETS.find(b => q >= b.min && q <= b.max) || QUALITY_BUCKETS[QUALITY_BUCKETS.length - 1];
  }
  /**
   * The smallest one of these you are allowed to keep.
   *
   * Taken off the species' own length range rather than written down sixteen
   * times: the bottom fifth of the range is a short fish. So most of what you
   * land is a keeper, a poor scrap of a reel-in sometimes is not, and the
   * inches printed on the card suddenly mean something.
   *
   * Nothing about this can be failed. An undersized fish goes back, the game
   * says why, and the next bite is along in a few seconds.
   */
  function keeperLength(f) {
    if (!f || !f.lengthRange) return 0;
    const lo = f.lengthRange[0], hi = f.lengthRange[1];
    return Math.max(1, Math.round(lo + (hi - lo) * 0.2));
  }

  /** Is the size limit being enforced at all? A setting, and off is fine. */
  function keepersOn() { return save.keepers !== false; }
  function setKeepers(on) { save.keepers = !!on; persist(); }

  function rollFishCatch(speciesId, quality) {
    const f = fishById(speciesId);
    const b = bucketFor(quality);
    const p = b.pMin + Math.random() * (b.pMax - b.pMin);
    const length = round1(f.lengthRange[0] + p * (f.lengthRange[1] - f.lengthRange[0]));
    const weight = round1(f.weightRange[0] + p * (f.weightRange[1] - f.weightRange[0]));
    const t = TIERS[f.difficultyTier] || TIERS[3];
    /* A fish with no per-pound price is not a fish anybody buys - that is how
       the Largemouth Dingus is marked - so it stays worth nothing. */
    const value = f.baseValuePerWeight > 0
      ? Math.max(1, Math.round(t.pay + weight * f.baseValuePerWeight * t.rate))
      : 0;
    const keeper = keeperLength(f);
    return { type: 'fish', id: f.id, name: f.name, length, weight, value,
             qualityLabel: b.label, quality, secret: !!f.secret, tier: f.difficultyTier,
             keeper,
             /* A short fish. The secret one is never short - it is the end of
                the game and it is not going back in the water. */
             released: keepersOn() && !f.secret && length < keeper };
  }
  /* Boot, tyre, tin can, weeds - all four still come up, as they always have.
     They are the lake's own joke and they are nothing to do with gear. */
  function rollJunkItem() {
    const table = D.ITEM_TABLE.junk;
    const i = table[Math.floor(Math.random() * table.length)];
    return { type: 'junk', id: i.id, name: i.name, value: 0 };
  }
  function rollValuableItem() {
    const i = D.ITEM_TABLE.valuable[Math.floor(Math.random() * D.ITEM_TABLE.valuable.length)];
    return { type: 'valuable', id: i.id, name: i.name, value: i.value };
  }

  const lastQuipIx = {};
  function pickQuip(itemId) {
    const q = D.ITEM_QUIPS[itemId];
    if (!q || !q.length) return null;
    if (q.length === 1) return q[0];
    let ix;
    do { ix = Math.floor(Math.random() * q.length); } while (ix === lastQuipIx[itemId]);
    lastQuipIx[itemId] = ix;
    return q[ix];
  }

  const CATCH_PLACEHOLDER_EMOJI = {
    boot: '👞', tire: '🛞', tincan: '🥫', weeds: '🌿',
    wallet: '👛', phone: '📱', watch: '⌚', ring: '💍'
  };
  function catchArtSrc(o) {
    if (o.type === 'fish') return 'images/fish/' + o.id + '.png';
    if (o.type === 'empty') return null;      // nothing came up; nothing to show
    if (o.type === 'junk' || o.type === 'valuable') return 'images/items/' + o.id + '.png';
    return null;
  }
  function rodArtSrc(r)  { return 'images/rods/' + r.id + '.png'; }
  function rodIconSrc(r) { return 'images/rods/' + r.id + '-icon.png'; }
  function baitArtSrc(b) { return 'images/bait/' + b.id + '.png'; }

  /* Only the secret bait was ever painted, so every other lure shows an emoji
     instead of a missing image. */
  const BAIT_EMOJI = {
    plainworm: '🪱', nightcrawler: '🪱', waxworm: '🐛', bobberrig: '🎣',
    minnowlure: '🐟', jitterbug: '🦗', spinnerbait: '✨', leechrig: '🪱',
    stinkbait: '🧪', deepjig: '⚓', secret_t_pill: '💊'
  };
  function baitArt(b) {
    return b.id === 'secret_t_pill'
      ? { src: baitArtSrc(b), emoji: '💊' }
      : { src: null, emoji: BAIT_EMOJI[b.id] || '🪱' };
  }

  /** Quality never loses the fish. The only way one does not land is the
      junk/valuable roll made at bite time, unrelated to how it was reeled. */
  function resolveCatch(category, speciesId, quality, bite) {
    if (category === 'fish')     return rollFishCatch(speciesId, quality);
    if (category === 'valuable') return rollValuableItem();
    /* Something took it and came off: the hook comes up bare.
     *
     * This used to hand back a tangle of weeds, which meant the card carried a
     * weed, a weed's joke, and a lecture about rods all at once - three
     * different stories about one event. An empty hook is the one thing that
     * is actually true, and the only thing that needs saying with it is what
     * would have held the fish. */
    if (category === 'empty' || (bite && bite.gearMiss)) {
      const rod = equippedRod();
      const better = betterRodFor(bite && bite.tooBig);
      return { type: 'empty', id: 'empty', name: 'It got away', value: 0,
               gearMiss: true, tooBig: bite && bite.tooBig,
               rodName: rod ? rod.name : 'this rod',
               betterRod: better ? better.name : null };
    }
    return rollJunkItem();
  }

  /** The first rod in the list that could hold this species. */
  function betterRodFor(speciesName) {
    const f = D.FISH.find(x => x.name === speciesName);
    if (!f) return null;
    return D.RODS.find(r => (ROD_CLASS[r.id] || 3) >= (f.difficultyTier || 3)) || null;
  }

  /* ══════════════════════════════════════════════════════════════════════
     RUN STATE
     ══════════════════════════════════════════════════════════════════════ */

  const S = {
    ATTRACT: 'attract',
    DOCK:    'dock',       // tied up; the overlay owns the screen
    STEER:   'steer',      // driving the lake
    ARRIVE:  'arrive',     // easing to a halt at a spot
    SPOT:    'spot',       // the Cast / Troll / Pause card
    AIM:     'aim',        // sweeping the cast direction
    CHARGE:  'charge',     // holding to build power
    FLYING:  'flying',     // the line is in the air
    WAITING: 'waiting',    // waiting for a bite — sit here forever if you like
    HOOKING: 'hooking',    // fish on, waiting to be hooked — also forever
    REELING: 'reeling',
    /* The fish leaves the water, swings over the rail and drops into the boat.
       No input, no choice, about a second and a half - the payoff the whole
       trip is for, which until now was a screen transition. */
    LANDING: 'landing',
    CARD:    'card',
    LEAVING: 'leaving'
  };

  let run = null;
  let paused = false;
  let cueLevel = 2;

  const callbacks = {
    onHud: null, onSpots: null, onCue: null, onBig: null, onAim: null,
    onCharge: null, onReel: null, onCard: null, onSpeak: null, onEdgeGlow: null,
    onBiteWash: null, onSteer: null
  };
  function fire(name, a, b) {
    const fn = callbacks[name];
    if (typeof fn === 'function') fn(a, b);
  }
  function say(text) {
    if (cueLevel >= 2) U.speak(text);
    fire('onSpeak', text);
  }

  function newRun(missionN) {
    /* currentMission(), not missionByN() - once the game is finished there is
       no numbered mission to go out on, and looking one up by number put the
       player back on the finale they had already beaten. */
    const m = currentMission();
    return {
      mission: m,
      rod: bestRod(),
      bait: equippedBait(),
      range: castRange(bestRodId()),
      state: S.STEER,
      dist: 0,
      lateral: 0,
      steerDir: 0,
      armed: 'right',        // one-switch: which way the next hold goes
      yaw: 0,                // how far the nose is swung off the route
      enterT: 0, enterSide: null, fishSide: 'right',
      leanSide: null, leanT: 0,   // how long the helm has been held over
      pullLock: null,             // a tapped fish card we are committed to

      spotIndex: 0,
      sinceTarget: 0,
      pending: [],
      /* Far enough out that TROLL_GRACE seconds pass before it is called -
         measured against the CURRENT cue lead, so a fish finder (which calls
         spots from further off) lengthens the warning without eating into
         the quiet start. */
      nextSpotDist: CFG.BOAT_SPEED * (CFG.TROLL_GRACE + cueLead()),
      current: null,         // the spot we stopped at
      timer: 0,
      lateralTarget: null,   // set by mouse/touch; null while switches are driving
      aim: 0, aimDir: 1, aimSweeping: false,
      power: 0, powTick: 0, charging: false,
      landing: null,
      bite: null,
      reel: null,
      lastCatch: null,
      tripCatch: [],
      tripMoney: 0
    };
  }

  /* ── The spot stream. Spots keep coming forever, so the player can never be
       stranded on empty water and can never run out of chances. ─────────── */

  function ensureSpots() {
    while (run.pending.length < 4) {
      const g = generateSpot(run.mission.n, run.spotIndex, run.sinceTarget);
      const r = U.rng(U.hash('gap' + run.mission.n + ':' + run.spotIndex));
      run.pending.push({
        index: run.spotIndex, dist: run.nextSpotDist,
        shoals: g.shoals, cued: false, spent: false
      });
      run.sinceTarget = g.sinceTarget;
      run.nextSpotDist += r.range(CFG.SPOT_GAP_MIN, CFG.SPOT_GAP_MAX);
      run.spotIndex++;
    }
  }

  function upcomingSpot() {
    for (const s of run.pending) if (!s.spent && run.dist < s.dist + 40) return s;
    return null;
  }

  /**
   * The one spot the game is currently talking about.
   *
   * The spot you are level with wins, because that is the one you can actually
   * turn into; otherwise it is the next one coming up. Both the spoken cue and
   * the card on screen go through here, so they can no longer end up naming
   * different spots - which is what made the card show the last lot of fish
   * while the voice announced the next.
   */
  function activeSpot() { return alongsideSpot() || upcomingSpot(); }

  /* ══════════════════════════════════════════════════════════════════════
     LIFECYCLE
     ══════════════════════════════════════════════════════════════════════ */

  let scene = null, camera = null, renderer = null;

  function init(ctxIn) {
    scene = ctxIn.scene; camera = ctxIn.camera; renderer = ctxIn.renderer;
    refreshPalette();
    auditMissions();
    loadSave();
    cueLevel = save.cueLevel === undefined ? 2 : save.cueLevel;
    if (save.theme) document.body.setAttribute('data-theme', save.theme);
    refreshPalette();
    RT.scene.init(scene, camera, renderer);
  }

  function loadAttract() { run = null; RT.scene.showAttract(); }

  /** Sitting at the dock. The overlay is what the player interacts with. */
  function goToDock() {
    run = null;
    paused = false;
    RT.scene.showDock();
  }

  function castOff() {
    run = newRun(save.currentMission);
    ensureSpots();
    paused = false;
    RT.scene.startTrip(run);
    pushHud();
    pushSpots();
  }

  function isPlaying() { return !!run && !paused; }
  function isSteering() { return !!run && (run.state === S.STEER || run.state === S.LEAVING); }
  function isFishing() { return !!run && !isSteering() && run.state !== S.ARRIVE; }
  function isFighting() { return !!run && (run.state === S.HOOKING || run.state === S.REELING); }

  function pause()  { paused = true; }
  function resume() { paused = false; }
  function quitToMenu() { run = null; paused = false; RT.scene.showAttract(); }

  /** The rod and bait for whatever mission is being played right now. */
  /**
   * The best rod owned. This is the rod in the angler's hands, everywhere:
   * how far a cast goes, what it can hold, what the HUD says, what is drawn.
   */
  function bestRod() {
    const owned = (save.rods || ['starter']).filter(id => rodById(id));
    if (!owned.length) return rodById('starter');
    return owned.map(rodById)
                .sort((a, b) => (ROD_CLASS[b.id] || 3) - (ROD_CLASS[a.id] || 3) ||
                                b.reachFt - a.reachFt)[0];
  }
  function bestRodId() { return bestRod().id; }
  function ownsRod(id) { return (save.rods || []).indexOf(id) >= 0; }
  /** The next rod up from the one being used, and what it costs. */
  /**
   * The lure this job wants and you have not got, with what it costs.
   *
   * Only ever the CURRENT job's lure - the shelf is not a catalogue of every
   * lure in the game, it is the one thing that would make today's fishing go
   * better. */
  function nextBait() {
    const m = currentMission();
    if (!m || !m.baitId || ownsBait(m.baitId)) return null;
    const b = baitById(m.baitId);
    if (!b) return null;
    return { id: b.id, name: b.name,
             cost: b.id === 'secret_t_pill' ? 0 : Math.round(b.costPerUnit * BAIT_GRANT_MULT),
             note: baitBlurb(b) };
  }

  function nextRod() {
    const cls = ROD_CLASS[bestRodId()] || 3;
    return D.RODS.find(r => !ownsRod(r.id) &&
                            ((ROD_CLASS[r.id] || 3) > cls || r.reachFt > bestRod().reachFt)) || null;
  }
  function buyRod(id) {
    const r = rodById(id);
    if (!r || ownsRod(id) || save.money < r.cost) return null;
    save.money -= r.cost;
    save.rods.push(id);
    persist();
    pushHud();
    return { kind: 'rod', id: r.id, name: r.name, cost: r.cost,
             note: r.reachNote, description: r.description, art: rodArtSrc(r) };
  }

  function equippedRod()  { return bestRod(); }
  function ownsBait(id) { return (save.baits || []).indexOf(id) >= 0; }

  /**
   * The lure on the hook.
   *
   * The job's own lure if it has been bought; failing that, whichever owned
   * lure this job's fish actually go for; failing that, the plain worm that
   * came with the boat. A mission NAMES the lure it was built around - that
   * is a thing to go and buy, not a thing to be handed.
   */
  function bestBaitFor(m) {
    const want = m && m.baitId;
    if (want && ownsBait(want)) return baitById(want);
    const target = m && m.target && m.target.speciesId;
    const owned = (save.baits || ['plainworm']).map(baitById).filter(Boolean);
    if (target) {
      const suited = owned.filter(b => b.biasTable && b.biasTable[target]);
      if (suited.length) {
        return suited.sort((a, b) => b.biasTable[target] - a.biasTable[target])[0];
      }
    }
    return owned[owned.length - 1] || baitById('plainworm');
  }

  function equippedBait() { return bestBaitFor(run ? run.mission : currentMission()); }
  function equippedBaitId() { return equippedBait().id; }
  function buyBait(id) {
    const b = baitById(id);
    if (!b || ownsBait(id)) return null;
    const cost = b.id === 'secret_t_pill' ? 0 : Math.round(b.costPerUnit * BAIT_GRANT_MULT);
    if (save.money < cost) return null;
    save.money -= cost;
    save.baits.push(id);
    persist();
    pushHud();
    return { kind: 'bait', id: b.id, name: b.name, cost: cost,
             note: baitBlurb(b), description: '', art: baitArtSrc(b) };
  }

  function pushHud() {
    const m = run ? run.mission : currentMission();
    const done = targetComplete(m, save.progressValue);
    fire('onHud', {
      missionN: m.n, missionText: m.text, free: !!m.free,
      target: targetProgressText(m, save.progressValue),
      targetDone: done,
      rodName: rodById(m.rodId).name,
      baitName: equippedBait().name,
      gear: ownedGear(),
      money: save.money,
      finale: !!m.finale,
      hint: done ? 'Head back to the dock' : ''
    });
  }

  function pushSpots() {
    if (!run) return;
    /* The card stays up for as long as the spot can still be turned into, not
       just on the run-up to it. Twenty seconds of warning is no use if the
       card vanishes the moment you draw level - that is exactly when somebody
       who needs a moment is still deciding. */
    const along = alongsideSpot();
    const s = activeSpot();
    /* Shown while it can still be reached, and NOT before it has been called -
       so between one spot going quiet and the next being announced there is
       open water with no card on screen at all. */
    const near = !!along || (s && s.cued);
    fire('onSpots', {
      left:  near ? shoalInfo(s, 'left')  : null,
      right: near ? shoalInfo(s, 'right') : null,
      alongside: !!along,
      entering: run.enterSide,
      enterFrac: U.clamp((run.enterT || 0) / pullOverTime(run.enterSide), 0, 1),
      /* Past the window the decision is made and the boat is simply running up
         to the fish. The UI needs to know, or it goes on asking you to keep
         holding - and ticking at you - long after you have committed. */
      committed: (run.enterT || 0) >= pullOverTime(run.enterSide),
      // What you are pulling in ON, so the banner can name it.
      /* What is over there, if anything, and whether we have got there yet.
         Read off the spot the CARD is showing, not just the one we are level
         with, so the banner names the same fish the card does. */
      enteringFish: (function () {
        if (!run.enterSide) return null;
        const spot = s;
        if (!spot || !spot.cued) return null;
        const sh = spot.shoals.find(x => x.side === run.enterSide);
        if (!sh) return null;
        return { name: sh.fishName, isTarget: sh.isTarget,
                 waiting: !(along && along === spot) };
      })(),
      lateral: run.lateral / CFG.LANE_HALF
    });
  }

  function shoalInfo(spot, side) {
    const sh = spot.shoals.find(x => x.side === side);
    if (!sh) return null;
    // How far the boat would still have to throw if it steered fully this way.
    const closest = Math.max(0, Math.abs(sh.lateral) - CFG.LANE_HALF);
    const fish = biomeFish(sh.biome);
    return {
      biome: biomeName(sh.biome), biomeId: sh.biome,
      /* Straight off the shoal, NOT worked out again from the biome. Deriving
         it twice is how the card and the spoken line came to disagree about
         what was down there. */
      color: sh.fishColor || (fish[0] && fish[0].color) || '#8fd2f0',
      fishId: sh.fishId || (fish[0] ? fish[0].id : null),
      fishName: sh.fishName || (fish[0] ? fish[0].name : 'Fish'),
      species: fish.slice(0, 3).map(f => ({ name: f.name, color: f.color })),
      isTarget: sh.isTarget,
      fish: biomeFishNames(sh.biome).slice(0, 3).join(', '),
      inRange: run.range >= closest,
      distance: Math.round(Math.abs(sh.lateral - run.lateral))
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     INPUT
     ══════════════════════════════════════════════════════════════════════ */

  /** Steering, exactly like the racer: -1 left, +1 right, 0 coast. */
  function setSteer(dir) {
    if (!run || run.state !== S.STEER) { if (run) run.steerDir = 0; return; }
    run.steerDir = dir;
    // A switch takes control back from a resting mouse.
    if (dir) run.lateralTarget = null;
  }

  /**
   * Absolute pointer steering: whichever fraction of the screen the pointer is
   * over is where across the lake the boat heads for, the same way the racer
   * places its car. Touch and drag anywhere, or just move the mouse.
   * @param {number} frac 0 = hard left, 1 = hard right
   */
  /** Pointer lifted: stop asking for a side, so the lean ends with the touch. */
  function clearPointerSteer() {
    if (run) run.lateralTarget = null;
  }

  function setLateralTarget(frac) {
    if (!run || run.state !== S.STEER) return;
    run.lateralTarget = (U.clamp(frac, 0, 1) * 2 - 1) * CFG.LANE_HALF;
    run.steerDir = 0;
  }

  /** Absolute pointer aiming: screen position picks the cast angle outright. */
  function setAimFrac(frac) {
    // Allowed while charging too, so a finger can slide to re-point a cast
    // it has already started winding up.
    if (!run || (run.state !== S.AIM && run.state !== S.CHARGE)) return;
    run.aim = U.lerp(aimMin(), aimMax(), U.clamp(frac, 0, 1));
    run.aimSweeping = false;
    pushAim();
  }

  /**
   * One switch: every release arms the other way.
   *
   * The same scheme Race Tracks uses, and for the same reason - with one
   * switch there is no way to say "left" or "right", so the two take turns:
   * press and hold to go the armed way, let go, and the next press goes the
   * other way. It flips on the RELEASE of any press, long or short, because
   * asking for a quick tap to change sides asks for the one gesture this
   * game's players cannot make.
   */
  function flipArmed() {
    if (!run) return;
    run.armed = run.armed === 'left' ? 'right' : 'left';
    if (cueLevel >= 1) RT.audio.panTone(run.armed);
    if (cueLevel >= 2) say(run.armed === 'left' ? 'Left' : 'Right');
    fire('onSteer', { armed: run.armed });
  }
  function getArmed() { return run ? run.armed : 'right'; }

  /* ── Aiming. Hold to sweep, release to stop, and each fresh hold reverses
       the sweep. Taking the aim is not a beat of its own any more: the press
       that takes it is the press that starts the cast (beginCharge). ───── */

  /** Straight out over the fishing side: -90 degrees to port, +90 to starboard. */
  function aimCentre() { return (run && run.fishSide === 'left') ? -Math.PI / 2 : Math.PI / 2; }
  function aimMin() { return aimCentre() - CFG.AIM_ARC; }
  function aimMax() { return aimCentre() + CFG.AIM_ARC; }

  function startAim() {
    if (!run || run.state !== S.SPOT) return;
    run.state = S.AIM;
    run.aim = aimCentre();
    run.aimDir = 1;
    run.aimSweeping = false;
    run.power = 0;
    run.powTick = 0;
    say('Aim your cast. Hold to swing it round. Press and hold to push the ' +
        'cast out, then let go to throw it.');
    pushAim();
  }

  function setAimSweep(on, dir) {
    if (!run || run.state !== S.AIM) return;
    if (on && !run.aimSweeping) run.aimDir = (dir !== undefined) ? dir : -run.aimDir;
    run.aimSweeping = !!on;
  }

  /**
   * Take the direction and move to the meter.
   *
   * `quiet` is for beginCharge, where the meter is already running and being
   * told the aim is "locked" first is a beat that no longer exists.
   */
  function lockAim(quiet) {
    if (!run || run.state !== S.AIM) return;
    run.state = S.CHARGE;
    run.aimSweeping = false;
    run.charging = false;
    if (!quiet) say('Locked. Now hold to push the cast out.');
    fire('onAim', null);
    pushCharge();
  }

  /**
   * One press does the whole cast: taking the aim and starting the meter are
   * the same act, and letting go throws it.
   *
   * There used to be a lock-in step between them, and it could only be worked
   * by a TAP - a press under 400ms. A switch held the way switches are
   * actually held simply never locked anything in, so the aimer sat there and
   * the cast never happened. Nothing in this game may require a short press.
   */
  function beginCharge() {
    if (!run) return;
    if (run.state === S.AIM) {
      lockAim(true);
      say('Let go to cast.');
    }
    setCharging(true);
  }

  function setCharging(on) {
    if (!run || run.state !== S.CHARGE) return;
    run.charging = !!on;
  }

  /** Cast at whatever is on the meter. A full meter does this by itself. */
  function releaseCast() {
    if (!run || run.state !== S.CHARGE) return;
    const frac = Math.max(CFG.MIN_CAST_FRAC, run.power / 100);
    run.landing = predictLanding(run.aim, frac);
    /* How far back the rod was drawn at the moment of release. The throw
       sweeps forward FROM here, so a big cast whips further than a little one.
       Without it the rod simply blinked back to its rest pose. */
    run.castFrom = (run.power / 100) * 1.45;
    run.state = S.FLYING;
    run.timer = 0;
    run.charging = false;
    fire('onCharge', null);
    RT.audio.cast();
    const sh = run.landing.shoal;
    say(sh ? 'Cast into the ' + biomeName(sh.biome) + '.' : 'Cast landed in open water.');
  }

  /**
   * The shoal under a point on the water, if any.
   *
   * Used by the cast to decide where it landed and by the retrieve to keep
   * asking on the way back, so both answer the question the same way.
   */
  function shoalAt(along, lateral) {
    let shoal = null, best = Infinity;
    const spot = run.current;
    if (!spot) return null;
    for (const sh of spot.shoals) {
      const d = Math.hypot(spot.dist + sh.along - along, sh.lateral - lateral);
      if (d < sh.radius && d < best) { best = d; shoal = sh; }
    }
    return shoal;
  }

  /**
   * Where a cast at this angle and power comes down, in track space, and which
   * shoal (if any) it lands on. Angle 0 is straight over the bow, positive to
   * starboard.
   */
  function predictLanding(angle, frac) {
    const d = run.range * U.clamp(frac, 0, 1);
    const along = run.dist + Math.cos(angle) * d;
    const lateral = run.lateral + Math.sin(angle) * d;
    return { along, lateral, d, angle, shoal: shoalAt(along, lateral) };
  }

  function pushAim() {
    if (!run) return;
    const l = predictLanding(run.aim, 1);
    fire('onAim', {
      angle: run.aim, centre: aimCentre(), maxDist: run.range,
      onShoal: !!l.shoal,
      shoalName: l.shoal ? biomeName(l.shoal.biome) : null,
      isTarget: l.shoal ? l.shoal.isTarget : false
    });
  }

  function pushCharge() {
    if (!run) return;
    const frac = Math.max(CFG.MIN_CAST_FRAC, run.power / 100);
    const l = predictLanding(run.aim, frac);
    fire('onCharge', {
      power: run.power,
      onShoal: !!l.shoal,
      shoalName: l.shoal ? biomeName(l.shoal.biome) : null,
      isTarget: l.shoal ? l.shoal.isTarget : false,
      distance: Math.round(l.d)
    });
  }

  /** A press - any press, however long it is held - while a fish is on. */
  function hookFish() {
    if (!run || run.state !== S.HOOKING) return false;
    run.state = S.REELING;
    run.timer = 0;
    /* How big it is, 0..1, taken from the top of the species' weight range.
     * A sturgeon and a sunfish used to differ only in how long the bar took to
     * fill. Everything that CAN carry weight now does: how far the rod hoops
     * over, how the boat heels, and how low the reel sounds. None of it asks
     * anything of the player - it is the difference between being told you
     * have hooked something big and being able to feel it.
     */
    run.fightSize = (function () {
      if (run.bite.category !== 'fish') return 0.15;
      const f = fishById(run.bite.speciesId);
      const top = (f && f.weightRange && f.weightRange[1]) || 4;
      return U.clamp(Math.pow(top / 60, 0.5), 0.1, 1);
    })();
    const tier = run.bite.category === 'fish'
      ? (fishById(run.bite.speciesId).difficultyTier || 3) : 2;
    const t = TIERS[tier] || TIERS[3];
    /* Runs are spaced evenly through the fight rather than rolled at random,
       so every fish of a size fights roughly the same shape and the player can
       learn it — the randomness is in how long each run lasts. */
    const marks = [];
    for (let i = 1; i <= t.runs; i++) marks.push(i / (t.runs + 1));
    run.reel = {
      progress: 0, held: 0, total: 0, lineSeconds: t.lineSeconds,
      wasHolding: false, strain: 0,
      runs: marks, runIx: 0,
      phase: 'reel',        // 'reel' | 'warn' | 'run'
      phaseT: 0, runLen: 0, seed: U.hash('fight' + run.mission.n + ':' + Math.floor(run.dist))
    };
    fire('onBiteWash', false);
    fire('onBig', null);
    say('Got it! Hold to reel it in.');
    return true;
  }

  let reelHolding = false;
  function setReelHold(on) { reelHolding = !!on; }

  /**
   * Winding an empty line back in.
   *
   * Waiting for a bite used to be a room with one door: the only way off the
   * water was to hook something. Now the switch retrieves - hold it and the
   * lure comes back toward the boat, let go and it stops there and carries on
   * fishing. It is not a cancel button and it is not instant, because the
   * cast is still in the water: a fish can take it halfway back, which is
   * exactly what a retrieve is FOR.
   *
   * Reel it all the way to the rail and the line is in; then you cast again,
   * or troll on. Called every frame from updateWaiting while the switch is
   * down. Returns true when the line has come all the way in.
   */
  function reelInLine(dt) {
    if (!run || !run.landing) return false;
    const side = run.fishSide === 'left' ? -1 : 1;
    const homeAlong = run.dist + 0.6;
    const homeLat = run.lateral + side * CFG.RAIL_OFF;
    const dA = homeAlong - run.landing.along;
    const dL = homeLat - run.landing.lateral;
    const gap = Math.hypot(dA, dL);

    if (gap <= CFG.REEL_IN_DONE) {
      RT.audio.stopReelLoop();
      RT.audio.reelStop();
      run.reelSound = false;
      run.bite = null;
      run.biteAt = 0;
      run.timer = 0;
      // The float and hook go back to the rod tip: that is what "in" looks like.
      run.landing = null;
      fire('onBig', null);
      fire('onBiteWash', false);
      say('Line in. Cast again, or troll on.');
      openSpotCard(false);
      return true;
    }

    const step = Math.min(gap, CFG.REEL_IN_SPEED * dt);
    run.landing.along += (dA / gap) * step;
    run.landing.lateral += (dL / gap) * step;
    /* Whatever water it is over NOW is the water it is fishing. Drag a lure
       off a weed bed and the weed bed's fish stop being the ones on offer -
       which is the honest version of a retrieve, and it makes where you stop
       reeling a real decision rather than a cosmetic one. */
    const sh = shoalAt(run.landing.along, run.landing.lateral);
    run.landing.shoal = sh;
    run.onShoal = !!sh;
    run.biteBiome = sh ? sh.biome : run.biteBiome;
    run.biteNamed = sh ? (sh.fishId || null) : null;
    return false;
  }

  /* ── Choices on the spot card ─────────────────────────────────────────── */

  function chooseTroll() {
    if (!run) return;
    run.state = S.LEAVING;
    run.timer = 0;
    run.current = null;
    RT.audio.motorUp();
    say('Trolling on.');
  }

  function afterCatchCard() {
    if (!run) return;
    if (run.current) openSpotCard(true);
    else chooseTroll();
  }

  /** Straight back to the dock — always available, not just when finished. */
  function returnToDock() {
    if (!run) return null;
    const trip = { caught: run.tripCatch.slice(), money: run.tripMoney };
    run = null;
    RT.audio.stopReelLoop();
    RT.audio.stopMotor();
    RT.audio.stopWater();
    persist();
    goToDock();
    return trip;
  }

  /* ══════════════════════════════════════════════════════════════════════
     FRAME
     ══════════════════════════════════════════════════════════════════════ */

  function update(dt) {
    RT.scene.update(dt, run, paused);
    if (!run || paused) return;

    switch (run.state) {
      case S.STEER:   updateSteer(dt);   break;
      case S.ARRIVE:  updateArrive(dt);  break;
      case S.AIM:     updateAim(dt);     break;
      case S.CHARGE:  updateCharge(dt);  break;
      case S.FLYING:  updateFlying(dt);  break;
      case S.WAITING: updateWaiting(dt); break;
      case S.HOOKING: updateHooking(dt); break;
      case S.REELING: updateReeling(dt); break;
      case S.LANDING: updateLanding(dt); break;
      case S.LEAVING: updateLeaving(dt); break;
      default: break;
    }
  }

  /**
   * Which way the player is asking to go - whatever they are steering with.
   *
   * This used to be read off run.yaw, which works for a switch (held = turned)
   * but not for a pointer: pointer steering names a DESTINATION, so the yaw
   * falls back to zero the instant the boat arrives there. Holding the pointer
   * out to the side therefore never registered as a sustained lean, and the
   * pull-over could not be completed by mouse or touch at all.
   *
   * Asking the INPUT instead of the hull makes both control schemes behave
   * identically: hold a switch over, or hold the pointer out to the side, and
   * the game reads the same intent from either.
   */
  function steerIntent() {
    if (!run) return null;
    if (run.steerDir) return run.steerDir < 0 ? 'left' : 'right';
    // Far enough out to be a decision rather than a course correction.
    if (run.lateralTarget !== null &&
        Math.abs(run.lateralTarget) > CFG.LANE_HALF * 0.45) {
      return run.lateralTarget < 0 ? 'left' : 'right';
    }
    return null;
  }

  function updateSteer(dt) {
    /* Put the helm over, and the boat turns; let go and it comes back to
       straight. Where it ends up across the lake is then just a consequence of
       where it has been pointing — which is what makes it feel like steering a
       boat rather than sliding a piece along a rail. */
    let want = 0;
    if (run.steerDir) {
      want = run.steerDir * CFG.YAW_MAX;
      run.lateralTarget = null;
    } else if (run.lateralTarget !== null) {
      // Mouse and touch name a place to be; the boat still steers its way there.
      want = U.clamp((run.lateralTarget - run.lateral) / 14, -1, 1) * CFG.YAW_MAX;
    }

    /* Once you have asked to pull over, the helm STAYS over until you say
       otherwise.

       Pointer steering names a destination, so the moment the boat reached it
       the helm centred and the boat quietly straightened up - out from under a
       player who was still holding the pointer out to the side asking to stop.
       It looked like the game steering itself, and it reset the lean every
       time so a pull-over could never finish on a mouse. */
    if (run.enterSide) want = (run.enterSide === 'left' ? -1 : 1) * CFG.YAW_MAX;

    run.yaw = U.damp(run.yaw, want, CFG.YAW_RATE, dt);

    // Travel along the heading. Turned hard over, you make less ground up the
    // lake and more of it across — exactly as a boat does.
    const step = CFG.BOAT_SPEED * dt;
    run.dist += Math.cos(run.yaw) * step;
    const nextLat = run.lateral + Math.sin(run.yaw) * step * 2.4;
    // The lane edge stops the boat drifting off the map; nose into it and it
    // simply runs along the edge rather than jamming.
    run.lateral = U.clamp(nextLat, -CFG.LANE_HALF, CFG.LANE_HALF);

    ensureSpots();
    run.pending = run.pending.filter(s => run.dist < s.dist + 220);

    const next = activeSpot();
    if (next && !next.cued && run.dist >= next.dist - CFG.BOAT_SPEED * cueLead()) {
      next.cued = true;
      announceSpot(next);
    }

    /* ── Pulling over ────────────────────────────────────────────────────
       You can stop and fish ANYWHERE, not only where the game has laid a
       shoal. Hold the helm over to one side; after a moment the game offers to
       pull in, and that offer stands for five whole seconds. Let go, or steer
       the other way, and it goes away and nothing happens. Keep holding and
       you go in.

       Two beats, both cancellable, neither of them quick. The decision of
       where to fish stays with the player at all times, and never has to be
       made faster than they can make it.

       Judged on where the boat is POINTING, not on which control turned it, so
       a switch held over and a finger dragged to the side behave the same. */
    /* ── Tapped the fish ─────────────────────────────────────────────────
       A mouse or a finger can name the side outright by tapping the "fish
       spotted" card, instead of holding a lean for four and a half seconds and
       hoping. It is the same commitment the hold produces - the helm goes over
       and stays over until the boat reaches the fish - it just skips the part
       that is awkward without a switch. Steering the other way calls it off,
       so it can never trap anybody. */
    if (run.pullLock) {
      const override = steerIntent();
      if (override && override !== run.pullLock) {
        run.pullLock = null;
        run.enterSide = null; run.enterT = 0; run.leanSide = null; run.leanT = 0;
      } else {
        run.enterSide = run.pullLock;
        run.enterT = pullOverTime(run.pullLock);   // already decided
        const t = spotToEnter(run.pullLock);
        if (t) enterSpot(t, run.pullLock);
        pushSpots();
        return;
      }
    }

    const lean = steerIntent();

    if (lean !== run.leanSide) {
      // Changed your mind, or straightened up: the whole thing resets.
      run.leanSide = lean;
      run.leanT = 0;
      run.enterT = 0;
      run.enterSide = null;
    } else if (lean) {
      run.leanT += dt;
      if (run.leanT >= leanArm(lean)) {
        if (!run.enterSide) {
          // The offer opens. Say what is over there, if anything is.
          run.enterSide = lean;
          run.enterT = 0;
          announcePullOver(lean);
        }
        run.enterT += dt;
        if (run.enterT >= pullOverTime(lean)) {
          /* The meter is full, so we go NOW - even if the shoal it named is
             still up ahead. Closing that gap is the arrival's job (enterSpot
             sets arriveDist and updateArrive runs the boat up to it), not
             another wait at trolling speed. */
          const target = spotToEnter(lean);
          if (target) enterSpot(target, lean);
        }
      }
    }

    pushSpots();
  }

  /**
   * How long the two beats of a pull-over take on this side.
   *
   * Fish that have been CALLED get the short version: the card is up, the
   * player has been told what is over there by name, and making them hold the
   * helm over for another four and a half seconds is a queue, not a decision.
   * Open water keeps the long hold - see LEAN_ARM_OPEN.
   */
  function calledOn(side) {
    const s = activeSpot();
    return !!(s && s.cued && s.shoals.some(x => x.side === side));
  }
  function leanArm(side)      { return calledOn(side) ? CFG.LEAN_ARM  : CFG.LEAN_ARM_OPEN; }
  function pullOverTime(side) { return calledOn(side) ? CFG.PULL_OVER : CFG.PULL_OVER_OPEN; }

  /** The spot the boat is level with right now, if any. */
  function alongsideSpot() {
    for (const s of run.pending) {
      if (s.spent) continue;
      const w = spotWindow();
      if (run.dist >= s.dist - w && run.dist <= s.dist + w) return s;
    }
    return null;
  }

  /** Turn in and settle, then show what is down there. */
  /**
   * The spot a pull-over on this side lands in.
   *
   * If there is a real shoal alongside, that is the one. Otherwise the player
   * has chosen to stop on open water, which is allowed - it just holds no
   * shoal, so the bite table thins out (CFG.BITE_OPEN) and the fish are
   * whatever happens to be passing. Nowhere on the lake is off limits.
   */
  function spotToEnter(side) {
    /* If there is a card up on this side, that card is a promise: turn this
       way and you are going to THOSE fish. Honour it - and only stop once the
       boat is somewhere the rod can actually reach them.

       A spot is announced 340 units out and can be turned into from 260 away,
       but a rod throws 50-75. Stopping anywhere in that window was how you
       could pull over for a muskellunge and be told there was nothing in
       reach: the boat had halted a couple of hundred units short of the fish
       it had just committed to. The answer is not to make the player wait
       until they draw level - it is to go to the fish, which is what
       enterSpot's arriveDist does.

       Two answers, and both of them are immediate:
         a spot   - the card's fish, wherever along the route they are
         open     - no card on this side (or no rod for it), so this is a
                    deliberate stop on open water, which is always allowed
    */
    const openWater = { index: -1, dist: run.dist, shoals: [],
                        cued: true, spent: false, open: true };
    const spot = activeSpot();
    const sh = spot && spot.cued && spot.shoals.find(x => x.side === side);
    if (!sh) return openWater;

    const bestLat = U.clamp(sh.lateral, -CFG.LANE_HALF, CFG.LANE_HALF);

    /* Only the ACROSS-the-lake gap has to be inside the rod, because the boat
       now finishes its turn level with the shoal (see enterSpot / arriveDist).
       Judging it from wherever the boat happened to halt was the bug: a shoal
       sits up to 24 units along the route and the boat coasts another nine, so
       a perfectly reachable weedbed shoal could measure 36 away on a rod that
       throws 26 - and you pulled over for a fish and were told there was
       nothing in reach. */
    const lateralGap = Math.abs(sh.lateral - bestLat);
    if (lateralGap > run.range * 0.92) return openWater;  // no rod for it here
    /* Ahead of us or behind us, it does not matter: if the CARD is up, the
       card is a promise, and putting the helm over honours it.
       This used to give up on a shoal seventy units astern - while the card
       for it stayed on screen for another two hundred - so pulling over for
       the pike the game was still showing dropped you in open water and told
       you there was nothing in reach. The card's own window (alongsideSpot,
       one spotWindow either side) is now the only window there is. */
    return spot;

  }

  /**
   * Go and fish that side - the pointer's way of pulling over.
   *
   * Only ever called from a tap on a "fish spotted" card, so there is always
   * something over there worth going to. Switch players do not get this: they
   * have the hold, which does the same job with the one control they have.
   */
  function pullOverTo(side) {
    if (!run || run.state !== S.STEER) return false;
    if (side !== 'left' && side !== 'right') return false;
    run.pullLock = side;
    run.leanSide = side;
    run.leanT = leanArm(side);
    if (run.enterSide !== side) { run.enterSide = side; announcePullOver(side); }
    run.enterT = pullOverTime(side);
    return true;
  }

  /** Said once, when the offer to pull over opens. */
  function announcePullOver(side) {
    /* The spot the CARD is showing, not just one we are already level with.
       Pulling over the moment the fish are called - which is the whole point
       of calling them early - was answered with "pulling over to fish here",
       as though there were nothing over there at all. */
    const spot = activeSpot();
    const sh = spot && spot.cued && spot.shoals.find(x => x.side === side);
    if (cueLevel >= 1) RT.audio.panTone(side);
    if (sh) {
      say('Pulling over for ' + (sh.fishName || 'fish') +
          (sh.isTarget ? '. That is your fish.' : '.'));
    } else {
      say('Pulling over to fish here.');
    }
  }

  function enterSpot(spot, side) {
    spot.spent = true;
    run.current = spot;
    run.fishSide = side;
    run.state = S.ARRIVE;
    run.timer = 0;
    /* Where to settle: right alongside the shoal, as close across the lake as
       the boat is allowed to get. Coasting to a halt wherever the boat
       happened to be left the fish off the beam and out of range. */
    const sh = spot.shoals.find(x => x.side === side);
    run.arriveLat = sh ? U.clamp(sh.lateral, -CFG.LANE_HALF, CFG.LANE_HALF) : run.lateral;
    // ...and level with it along the route, so the fish end up on the beam.
    run.arriveDist = sh ? spot.dist + sh.along : null;
    /* The run-up. Committing early - the moment the card appears - can leave
       most of SPOT_WINDOW still to cover, so the arrival gets a little longer
       for a longer gap and the boat opens up to cover it. Capped, because
       "and then we get there" has to stay a beat and not a journey. */
    run.arriveFrom = run.dist;
    // Distance either way: the fish can be astern, and dropping back to them
    // is the same move as running up to them.
    const gap = (run.arriveDist === null) ? 0 : Math.abs(run.arriveDist - run.dist);
    run.arriveTime = Math.min(CFG.ARRIVE_MAX,
                              CFG.STOP_TIME + CFG.RUN_UP_TIME * (gap / CFG.SPOT_WINDOW));
    run.steerDir = 0;
    run.lateralTarget = null;
    run.enterT = 0;
    run.enterSide = null;
    run.leanSide = null;
    run.leanT = 0;
    run.pullLock = null;
    // Opening up to get there, then dropping to idle once we have (updateArrive).
    if (gap > 12) RT.audio.motorUp(); else RT.audio.motorIdle();
  }

  function announceSpot(spot) {
    const l = spot.shoals.find(s => s.side === 'left');
    const r = spot.shoals.find(s => s.side === 'right');
    const parts = [];
    for (const sh of [l, r]) {
      if (!sh) continue;
      const closest = Math.max(0, Math.abs(sh.lateral) - CFG.LANE_HALF);
      const reachable = run.range >= closest;
      /* Say WHAT is down there, by name. "Weedbed on the left" tells you
         nothing about whether it is worth stopping for; "Largemouth Bass on
         the left, your fish" tells you everything. */
      parts.push((sh.fishName || biomeName(sh.biome)) + ' on the ' + sh.side +
                 (sh.isTarget ? ' — that is your fish, pull over' : '') +
                 (reachable ? '' : ', too far for this rod'));
    }
    if (!parts.length) return;
    // Point the player at the side worth steering to.
    run.armed = (l && l.isTarget) ? 'left' : (r && r.isTarget) ? 'right' : (l ? 'left' : 'right');
    say(parts.join('. ') + '.');
    if (cueLevel >= 1) RT.audio.panTone(l && r ? 'both' : (l ? 'left' : 'right'));
    fire('onCue', {
      left: !!l, right: !!r,
      leftTarget: !!(l && l.isTarget), rightTarget: !!(r && r.isTarget),
      text: l && r ? 'FISH BOTH SIDES' : (l ? 'FISH LEFT' : 'FISH RIGHT')
    });
    fire('onEdgeGlow', {
      left: l ? (l.isTarget ? 'target' : 'other') : null,
      right: r ? (r.isTarget ? 'target' : 'other') : null
    });
  }

  function updateArrive(dt) {
    run.timer += dt;
    // Way comes off, the helm centres, and the boat settles — then the rod
    // comes out. Nothing else happens until it has actually stopped.
    const T = run.arriveTime || CFG.STOP_TIME;
    const k = U.smoothstep(Math.min(1, run.timer / T));
    /* Run up onto the shoal's own mark and stop there, on a schedule that
       always finishes: a plain ease from where we committed to where the fish
       are. It used to DAMP toward the mark, which never quite arrives - so on
       a long gap the boat was still short of the fish when the card opened,
       and the only fix on offer was trolling the distance first. */
    if (run.arriveDist !== undefined && run.arriveDist !== null) {
      run.dist = U.lerp(run.arriveFrom !== undefined ? run.arriveFrom : run.dist,
                        run.arriveDist, k);
    } else {
      run.dist += CFG.BOAT_SPEED * (1 - k) * dt;
    }
    if (run.arriveLat !== undefined && run.arriveLat !== null) {
      run.lateral = U.damp(run.lateral, run.arriveLat, 3.0, dt);
    }
    run.yaw = U.damp(run.yaw, 0, 3.5, dt);
    run.steerDir = 0;
    run.lateralTarget = null;
    if (run.timer >= T) {
      run.yaw = 0;
      RT.audio.motorIdle();
      openSpotCard(false);
    }
  }

  function openSpotCard(afterCatch) {
    run.state = S.SPOT;
    // The rod is in frame from the moment you stop, so it can be the target.
    RT.scene.setSpotTargets();
    const m = run.mission;
    fire('onCard', {
      which: 'spot',
      afterCatch,
      missionDone: targetComplete(m, save.progressValue)
    });
  }

  function updateAim(dt) {
    if (run.aimSweeping) {
      run.aim += run.aimDir * CFG.AIM_SWEEP * dt;
      if (run.aim > aimMax()) { run.aim = aimMax(); run.aimDir = -1; }
      if (run.aim < aimMin()) { run.aim = aimMin(); run.aimDir = 1; }
    }
    pushAim();
  }

  function updateCharge(dt) {
    if (run.charging && run.power < 100) {
      run.power = Math.min(100, run.power + CFG.CHARGE_PCT_PER_S * dt);
      const step = Math.floor(run.power / CFG.CHARGE_TICK_PCT);
      if (step > run.powTick) { run.powTick = step; RT.audio.chargeTick(run.power / 100); }
    }
    pushCharge();
    // A full charge throws by itself — the farthest cast, no timing needed.
    if (run.power >= 100) releaseCast();
  }

  function updateFlying(dt) {
    run.timer += dt;
    if (run.timer < 0.75) return;
    run.state = S.WAITING;
    run.timer = 0;
    const sh = run.landing.shoal;
    run.biteBiome = sh ? sh.biome
      : U.rng(U.hash('open' + Math.floor(run.dist))).pick(run.mission.biomes);
    run.onShoal = !!sh;
    // The species the shoal was announced as, so the bites match the card.
    run.biteNamed = sh ? (sh.fishId || null) : null;
    const r = U.rng(U.hash('bite' + run.mission.n + ':' + Math.floor(run.dist) + ':' + Math.round(run.power)));
    run.biteAt = r.range(CFG.BITE_WAIT_MIN, CFG.BITE_WAIT_MAX);
    run.teaseT = 0;
    run.bite = rollBite(run.biteBiome, equippedBaitId(), run.onShoal,
                        null, null, run.biteNamed);
  }

  function rebite() {
    const r = U.rng(U.hash('rebite' + run.mission.n + ':' + Math.floor(run.dist * 7 + run.timer * 13)));
    run.biteAt = r.range(CFG.REBITE_MIN, CFG.REBITE_MAX);
    run.teaseT = 0;
    run.bite = rollBite(run.biteBiome, equippedBaitId(), run.onShoal,
                        null, null, run.biteNamed);
    run.timer = 0;
  }

  function updateWaiting(dt) {
    /* The retrieve, while the switch is down. It runs BEFORE the bite clock,
       so a fish that takes this frame takes it wherever the lure has just got
       to - and reaching the rail ends the wait outright. */
    /* The handle turning, as a LOOP - the same one a fish gets, at the same
       speed. It was a click per frame, sixty a second, which is not a reel:
       it is a scream. Started once when the retrieve begins and stopped the
       moment the switch comes up. */
    if (reelHolding && run.landing) {
      if (!run.reelSound) { RT.audio.reelStart(0.2); run.reelSound = true; }
      if (reelInLine(dt)) return;
    } else if (run.reelSound) {
      RT.audio.stopReelLoop();
      RT.audio.reelStop();
      run.reelSound = false;
    }
    run.timer += dt;

    /* Nibbles on the way to the take. Small, quiet, and deliberately NOT the
       thing you press on - the take is loud, spoken, and washes the screen.
       A nibble is the float twitching while the fish makes its mind up. */
    run.teaseT = (run.teaseT || 0) + dt;
    if (run.teaseT >= CFG.TEASE_EVERY && run.timer < run.biteAt - 0.6) {
      run.teaseT = 0;
      run.teaseAt = 0;                 // Scene reads this to dip the float
      RT.audio.nibble();
    }
    if (run.timer < run.biteAt) return;
    if (run.bite.category === 'nothing') { say('Nothing yet. Still out there.'); rebite(); return; }
    run.state = S.HOOKING;
    run.timer = 0;
    run.hookNudge = 0;
    run.teaseT = 0;
    // How long it holds on is different every time, so a bite is something to
    // watch for rather than a formality.
    const hr = U.rng(U.hash('hook' + run.mission.n + ':' + Math.floor(run.dist * 31 + run.biteAt * 97)));
    run.hookWindow = hr.range(hookMin(), hookMax());
    say('Fish on!');
    RT.audio.biteAlert();
    fire('onBig', 'HOOK IT!');
    fire('onBiteWash', true);
    fire('onFlash', 'bite');
  }

  function updateHooking(dt) {
    run.timer += dt;
    /* Said again while the take waits. The banner and the wash are already up
       the whole time; this is for somebody who was looking somewhere else when
       it landed, and it is a reminder, never a countdown. */
    run.hookNudge = (run.hookNudge || 0) + dt;
    if (run.hookNudge >= CFG.HOOK_NUDGE) {
      run.hookNudge = 0;
      say('Fish on. Press to hook it.');
    }
    // Miss the window and it spits the hook. Then it bites again, and again,
    // for as long as you care to sit there — a missed take costs only time.
    if (run.timer >= run.hookWindow) {
      run.state = S.WAITING;
      fire('onBig', null);
      fire('onBiteWash', false);
      RT.audio.spitHook();
      say("Missed it — it spat the hook. Bait's still on.");
      rebite();
    }
  }

  /**
   * The reel: hold and it comes in, let go and it stops. Nothing to get wrong.
   * Quality is simply how steadily it was reeled, so holding right through
   * lands the best fish — and never holding leaves it on the line forever.
   */
  function updateReeling(dt) {
    const r = run.reel;
    r.total += dt;

    /* ── Runs ───────────────────────────────────────────────────────────────
     * Hitting the next mark starts a warning, then the fish goes. While it is
     * running, hauling on it builds strain; letting go bleeds it away. The
     * line parts only if you hold right through — which the warning, the
     * shout, the red wash and the strain bar all tell you not to do.
     */
    if (r.phase === 'reel' && r.runIx < r.runs.length && r.progress >= r.runs[r.runIx]) {
      r.phase = 'warn';
      r.phaseT = 0;
      RT.audio.runWarn();
      say(run.bite.category === 'fish' ? "She's running!" : "It's away!");
      fire('onBig', 'GET READY');
    } else if (r.phase === 'warn') {
      r.phaseT += dt;
      if (r.phaseT >= CFG.RUN_WARN_S) {
        const rr = U.rng(U.hash('runlen' + r.seed + ':' + r.runIx));
        r.phase = 'run';
        r.phaseT = 0;
        r.runLen = rr.range(CFG.RUN_MIN_S, CFG.RUN_MAX_S);
        RT.audio.lineCreak();
        fire('onBig', 'LET IT RUN!');
      }
    } else if (r.phase === 'run') {
      r.phaseT += dt;
      if (r.phaseT >= r.runLen && r.strain < 0.5) {
        r.phase = 'reel';
        r.runIx++;
        fire('onBig', null);
        RT.audio.reelClick(run.fightSize);
        say('She\'s tiring — reel!');
      }
    }

    const running = (r.phase === 'run');

    if (running) {
      // A run takes line back: the bar goes with it, and so does the float.
      r.progress = Math.max(0, r.progress - CFG.RUN_TAKE * dt);
      // Hauling against a running fish is the only way to lose one.
      if (reelHolding) r.strain = Math.min(1, r.strain + dt / strainSnap());
      else             r.strain = Math.max(0, r.strain - dt / CFG.STRAIN_EASE_S);
      if (r.strain >= 1) { loseFish(); return; }
    } else {
      r.strain = Math.max(0, r.strain - dt / CFG.STRAIN_EASE_S);
      if (reelHolding) {
        r.held += dt;
        r.progress = Math.min(1, r.progress + dt / r.lineSeconds);
      }
    }

    if (reelHolding !== r.wasHolding) {
      r.wasHolding = reelHolding;
      if (reelHolding && !running) RT.audio.reelStart(run.fightSize); else RT.audio.stopReelLoop();
    }

    // A reminder, never a countdown.
    run.timer += dt;
    if (!reelHolding && !running && run.timer >= CFG.NUDGE_EVERY) {
      run.timer = 0;
      say('Press and hold to reel it in.');
    }
    if (reelHolding || running) run.timer = 0;

    fire('onReel', {
      progress: r.progress, holding: reelHolding,
      strain: r.strain, running, warning: r.phase === 'warn'
    });
    if (r.progress >= 1) landFish();
  }

  /** The line parts. The fish is gone — and another one is already down there. */
  function loseFish() {
    RT.audio.stopReelLoop();
    RT.audio.lineSnap();
    fire('onReel', null);
    fire('onBig', null);
    fire('onBiteWash', false);
    const name = run.bite.category === 'fish'
      ? (fishById(run.bite.speciesId) || {}).name : 'It';
    run.state = S.WAITING;
    run.reel = null;
    say('The line parted — ' + (name ? name + ' is gone.' : 'it is gone.') +
        ' Get another one on.');
    fire('onCard', { which: 'lost', name: name || 'It' });
  }

  function landFish() {
    const r = run.reel;
    const q = r.total > 0 ? Math.round(100 * U.clamp(r.held / r.total, 0, 1)) : 100;
    const outcome = resolveCatch(run.bite.category, run.bite.speciesId, q, run.bite);
    outcome.quality = q;
    RT.audio.stopReelLoop();
    RT.audio.splash();
    fire('onReel', null);

    if (run.landing && run.landing.shoal) run.landing.shoal.caught++;
    /* Nothing is paid out here. What you land goes in the hold and is worth
       something only once the shop buys it — which is what makes coming back
       in with a full boat feel like anything. */
    /* A short fish never comes aboard: no hold, no money, no creel, no
       personal best, and no progress on the job. It cost nothing but the cast,
       and the game says so out loud on the way past. */
    if (outcome.released) outcome.value = 0;
    if (outcome.value) {
      save.hold.push({ id: outcome.id, name: outcome.name, value: outcome.value,
                       type: outcome.type });
    }
    run.tripMoney += outcome.value || 0;
    if (outcome.type === 'fish' && !outcome.released) {
      run.tripCatch.push({ id: outcome.id, name: outcome.name,
                           length: outcome.length, weight: outcome.weight });
      save.creel.push({ id: outcome.id, length: outcome.length,
                        weight: outcome.weight, m: run.mission.n });
      /* A personal best is the cheapest pride in any fishing game: the data
         was already here, nothing ever said so. */
      const b = save.best[outcome.id];
      if (!b || outcome.weight > b.weight) {
        outcome.isBest = true;
        outcome.beat = b ? b.weight : 0;
        save.best[outcome.id] = { length: outcome.length, weight: outcome.weight };
      }
    }
    const wasDone = targetComplete(run.mission, save.progressValue);
    const advanced = outcome.released ? false : applyToTarget(run.mission, outcome);
    const nowDone = targetComplete(run.mission, save.progressValue);
    run.lastCatch = outcome;
    /* Everything is decided here - the fish is caught, the hold is heavier,
       the mission has moved - but the CARD waits for the landing beat, so the
       first thing that happens is the fish coming out of the water and not a
       sheet of paper sliding over the top of it. */
    run.cardPending = {
      which: (outcome.type === 'fish' && outcome.id === 'largemouth_dingus')
               ? 'dingusreveal' : 'catchreveal',
      outcome,
      // No quip on an empty hook: there is nothing there to be funny about.
      quip: (outcome.type === 'fish' || outcome.type === 'empty')
              ? null : pickQuip(outcome.id),
      art: catchArtSrc(outcome),
      placeholder: CATCH_PLACEHOLDER_EMOJI[outcome.id] || '\ud83d\udc1f',
      advanced,
      justCompleted: !wasDone && nowDone,
      targetText: targetProgressText(run.mission, save.progressValue),
      targetSpoken: targetSpeech(run.mission, save.progressValue),
      /* Pips for a job counted in whole fish, so the progress can be READ at a
         glance rather than parsed: three circles, two of them filled. */
      pips: (function () {
        const t = run.mission.target;
        if (!t || t.type === 'freeRoam' || t.type === 'catchLength') return null;
        if (t.type === 'catchWeight') return null;
        return { have: Math.floor(save.progressValue), need: t.amount };
      })()
    };
    run.state = S.LANDING;
    run.timer = 0;
    persist();
    pushHud();

    /* Did that one count?
     *
     * The mission counter lives in the corner of the screen in small text,
     * which is no use to somebody who cannot read small text across a room.
     * So the game says so, out loud, the moment the fish is out of the water:
     * a rising figure that means "that was one of yours", and then the count
     * spoken in words. The card that follows repeats it in large type with
     * pips, because being told once is not the same as being able to check.
     */
    if (outcome.gearMiss) {
      /* The one moment the shop's whole purpose is legible: something too big
         took it, the rod was not enough, and here is the rod that would be. */
      RT.audio.spitHook();
      say('Something big took that one and came off \u2014 too much for the ' +
          outcome.rodName + '. The hook came back empty. ' +
          (outcome.betterRod ? 'A ' + outcome.betterRod + ' would hold it.'
                             : 'You need a stronger rod.'));
    } else if (outcome.released) {
      RT.audio.release();
      say('A ' + outcome.name + ', but it is under ' + outcome.keeper +
          ' inches. Back it goes.');
    } else if (advanced) {
      RT.audio.missionTick(save.progressValue, run.mission.target.amount);
      fire('onFlash', 'count');
      say(('A ' + outcome.name + '. ') +
          (nowDone ? 'That is the job done!'
                   : targetSpeech(run.mission, save.progressValue)));
    } else if (outcome.type === 'fish') {
      say(outcome.isBest ? ('A ' + outcome.name + '. Your biggest yet.')
                         : ('A ' + outcome.name + '.'));
    }
  }

  /**
   * Out of the water, over the rail, into the boat.
   *
   * Nothing is asked for and nothing can go wrong here - it is a beat, not a
   * step. The scene does the lifting (updateRod reads LANDING off the run);
   * this only decides when the card is allowed to arrive.
   */
  function updateLanding(dt) {
    run.timer += dt;
    if (run.timer < CFG.LAND_TIME) return;
    RT.audio.splash();
    run.state = S.CARD;
    fire('onCard', run.cardPending);
    run.cardPending = null;
  }

  function updateLeaving(dt) {
    run.timer += dt;
    run.dist += CFG.BOAT_SPEED * U.smoothstep(Math.min(1, run.timer / CFG.LEAVE_TIME)) * dt;
    if (run.timer >= CFG.LEAVE_TIME) {
      run.state = S.STEER;
      run.timer = 0;
      ensureSpots();
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     SETTINGS
     ══════════════════════════════════════════════════════════════════════ */

  function getCueLevel() { return cueLevel; }
  function cycleCueLevel() {
    cueLevel = (cueLevel + 1) % 3;
    save.cueLevel = cueLevel; persist();
    return cueLevel;
  }
  function getTheme() { return save.theme; }
  function setTheme(t) {
    save.theme = t;
    document.body.setAttribute('data-theme', t);
    refreshPalette();
    RT.scene.repaint();
    persist();
  }
  function getCardStyle() { return save.cardStyle; }
  function setCardStyle(s) { save.cardStyle = s; persist(); }

  /* ══════════════════════════════════════════════════════════════════════
     THE SCENE — everything that touches three.js
     ══════════════════════════════════════════════════════════════════════ */

  const Scene = (function () {
    let sc = null, cam = null, rend = null;
    let lake = null, boatObj = null, rodObj = null, bobberObj = null;
    let dockGroup = null, dockBoat = null, dockShopLat = 0;
    let shopRoom = null, shopLights = [];
    let dockTargets = [], dockFocus = 0, focusObj = null;
    const shoalObjs = new Map();
    // The water's own dressing for each shoal - pads, rocks, a shelf edge.
    const patchObjs = new Map();

    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    const _v = new THREE.Vector3();
    const _v2 = new THREE.Vector3();
    const _v3 = new THREE.Vector3();
    const _lo = new THREE.Vector3();      // label anchor offset
    // The fish being landed, and the rings it leaves on the water.
    let catchObj = null, catchFor = null, catchLen = 1;
    const rings = [];
    const _lq = new THREE.Quaternion();
    let bob = 0, clock = 0, mode = 'attract', attractDist = 60;
    let aimLine = null, landMark = null;
    let focusTarget = null;

    function reducedMotion() {
      return typeof matchMedia === 'function' &&
             matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    function isFlat() { return save.theme === 'contrast'; }

    function colors() {
      return {
        waterShallow: css('--water-shallow'), waterMid: css('--water-mid'),
        waterDeep: css('--water-deep'), glint: css('--glint'),
        bankGrass: css('--bank-grass'), bankSoil: css('--bank-soil'),
        foliageDark: css('--foliage-dark'), foliageLight: css('--foliage-light'),
        sand: css('--sand'), lily: css('--lily'), reed: css('--reed'), log: css('--log'),
        skyLow: css('--sky-low'), skyMid: css('--sky-mid'), skyHigh: css('--sky-high'),
        fog: css('--fogcol'),
        hull: css('--boat'), hullTrim: css('--boat-trim'), deck: css('--boat-deck'),
        dark: css('--boat-dark'), angler: css('--angler'),
        shirt: css('--shirt'), jeans: css('--jeans'), cap: css('--cap'), vest: css('--vest'),
        dock: css('--dock'), shack: css('--shack'), roof: css('--roof'),
        shopWall: css('--shop-wall'), shopFloor: css('--shop-floor'),
        pegboard: css('--pegboard'), glass: css('--glass'),
        keeperShirt: css('--keeper-shirt'), keeperCap: css('--keeper-cap'),
        trophy: css('--trophy'), shopBeam: css('--shop-beam'),
        rod: css('--rod'), line: css('--line-mono'), bobber: css('--bobber'),
        cork: css('--cork'), reelBody: css('--reel-body'), hook: css('--hook'),
        /* The gear for the mission being played, so the rod in your hands and
           the bait on the hook are the ones the note says you are carrying. */
        rodLook: equippedRod().look || null,
        baitLook: equippedBait().look || null
      };
    }

    function init(s, c, r) { sc = s; cam = c; rend = r; }

    /** Change the lens only when it actually changes — it rebuilds a matrix. */
    function setFov(f) {
      if (!cam || Math.abs(cam.fov - f) < 0.01) return;
      cam.fov = f;
      cam.updateProjectionMatrix();
    }

    function teardown() {
      if (lake) { lake.dispose(); lake = null; }
      focusObj = null;
      for (const o of [boatObj, rodObj, bobberObj, dockGroup, aimLine, landMark, shopRoom]) {
        if (o) sc.remove(o);
      }
      shopLights.forEach(l => sc.remove(l));
      shopLights = [];
      shopRoom = null;
      boatObj = rodObj = bobberObj = dockGroup = aimLine = landMark = null;
      dockTargets = [];
      for (const g of shoalObjs.values()) sc.remove(g);
      shoalObjs.clear();
      for (const g of patchObjs.values()) sc.remove(g);
      patchObjs.clear();
      clearCatch();
    }

    function buildWorld(seed) {
      teardown();
      const C = colors();
      lake = RT.world.buildLake(sc, { seed, colors: C, flat: isFlat(), reducedMotion: reducedMotion() });
      boatObj = RT.art.boat(C);
      sc.add(boatObj);

      rodObj = RT.art.rodRig(C);
      rodObj.visible = false;
      sc.add(rodObj);
      bobberObj = rodObj.userData.bobber;
      bobberObj.visible = false;
      sc.add(bobberObj);

      // The cast preview: a dashed arc out to where the line would come down.
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(22 * 3), 3));
      aimLine = new THREE.Line(g, new THREE.LineDashedMaterial({
        color: new THREE.Color(css('--focus')).getHex(), dashSize: 1.6, gapSize: 1.1
      }));
      aimLine.frustumCulled = false;
      aimLine.visible = false;
      sc.add(aimLine);

      landMark = RT.art.castMarker(new THREE.Color(css('--focus')).getHex());
      landMark.visible = false;
      sc.add(landMark);
    }

    function showAttract() {
      mode = 'attract';
      buildWorld(U.hash('attract'));
      attractDist = 60;
    }

    /**
     * The dock. There is no menu here: the tackle shop, the boat and the
     * signpost are themselves the scan targets, so choosing where to go is
     * choosing a thing you can see rather than a row of words about it.
     */
    function showDock() {
      mode = 'dock';
      buildWorld(U.hash('thedock'));
      const C = colors();
      dockGroup = new THREE.Group();
      dockTargets = [];

      const D0 = 150;                       // where along the route the dock sits
      const fr = lake.frameAt(D0);

      /* The shoreline wanders along the route, so every piece of the dock has
         to ask where the bank is at ITS OWN distance. Taking one edge at the
         dock's centre and reusing it left the signpost paddling and the boat
         moored nowhere near the jetty. */
      function nodeAt(d) {
        return lake.nodes[Math.min(lake.nodes.length - 1, Math.max(0, Math.floor(d / RT.world.SEG)))];
      }
      function bankAt(d) { return lake.shoreEdge(nodeAt(d), -1); }

      /** Put `obj` on the port bank `inland` units past the waterline
          (negative `inland` puts it that far out into the water). */
      function placeAshore(obj, d, inland) {
        const lat = -(bankAt(d) + inland);
        lake.pointAt(d, lat, _v);
        obj.position.copy(_v);
        if (inland > 0) obj.position.y += RT.world.shoreRise(nodeAt(d), lat);
        obj.rotation.y = fr.yaw + Math.PI / 2;
        return { lat, y: obj.position.y };
      }

      /* Long enough to reach from the shop's door right down into the water.
         It used to stop a unit past the waterline while the shop stood 22
         units inland, leaving the two connected by nothing at all. */
      const JETTY = 27;
      // The jetty runs from the bank out into the water, so it is placed at
      // its own midpoint and yawed a quarter turn.
      const jet = RT.art.jetty(JETTY, C);
      // Centred so it spans from about 9 units inland out to 18 in the water.
      placeAshore(jet, D0, -4.5);
      jet.position.y += 0.55;               // decking rides above the surface
      dockGroup.add(jet);

      // The shop sits properly ashore now, back from the waterline on dry bank
      // rather than paddling at the water's edge.
      const shop = RT.art.tackleShop(C);
      // Set so the shop's front porch meets the head of the jetty.
      const shopAt = placeAshore(shop, D0, 12);
      dockShopLat = shopAt.lat;
      dockGroup.add(shop);
      dockTargets.push({ key: 'shop', obj: shop, radius: 7,
                         pos: shop.position.clone(), labelY: 8.2 });

      // A painted board further along the bank — the way home. The text is ON
      // the sign, so it needs no floating caption of its own.
      const sign = RT.art.signBoard('MAIN MENU', C);
      placeAshore(sign, D0 + 17, 7);
      dockGroup.add(sign);
      dockTargets.push({ key: 'home', obj: sign, radius: 3.2,
                        pos: sign.position.clone(), labelY: 1.6 });

      /* ── Clutter ────────────────────────────────────────────────────────
       * Scenery only. It exists so the three places you can actually go feel
       * like part of a lake somebody works, rather than three objects sitting
       * on empty water.
       */
      const prop = (obj, d, inland, yaw) => {
        placeAshore(obj, d, inland);
        obj.rotation.y += (yaw || 0);
        dockGroup.add(obj);
      };

      // Around the shop door.
      prop(RT.art.crate(1.3, C), D0 - 6.5, 9.5, 0.4);
      prop(RT.art.crate(1.0, C), D0 - 7.8, 11.0, -0.7);
      prop(RT.art.barrel(C), D0 - 4.8, 11.5, 0);
      prop(RT.art.barrel(C), D0 - 3.6, 12.4, 0.3);
      prop(RT.art.benchSeat(C), D0 + 10, 10, -0.25);
      prop(RT.art.dryingRack(C), D0 + 24, 10, 0.15);
      prop(RT.art.tackleClutter(C), D0 - 10, 9, 0);

      // Where the boards meet the bank, at the head of the jetty.
      prop(RT.art.lifeRing(C), D0 + 5.0, 5.5, 0);
      prop(RT.art.dockLamp(C), D0 - 5.5, 4.5, 0);
      prop(RT.art.crate(0.9, C), D0 + 2.4, 8.0, 0.9);

      sc.add(dockGroup);

      // The boat, tied alongside the outer end of the jetty.
      const boatDist = D0 + 4.5;
      dockBoat = { dist: boatDist, lateral: -(bankAt(boatDist) - 16) };
      lake.pointAt(dockBoat.dist, dockBoat.lateral, _v);
      boatObj.position.copy(_v);
      boatObj.position.y += 0.30;
      boatObj.rotation.y = fr.yaw;
      // Hung UNDER the boat: a plate above it sat right across the hull.
      dockTargets.push({ key: 'boat', obj: boatObj, radius: 5.5,
                         pos: boatObj.position.clone(), labelY: -1.4, below: true });

      setDockFocus(dockFocus);
      lake.ensureAround(D0);
    }

    /**
     * At a fishing spot the two things worth picking are already in front of
     * the camera: the man (who casts) and the boat (which moves on). No card
     * needed — the same trick as the dock and the shop.
     */
    /**
     * At a spot there is one thing to pick in the world: the rod.
     *
     * It used to be the angler — but in first person you are looking out of
     * his eyes, so he is hidden, and a hidden target is one nobody can click,
     * hover or even see a label for. The rod is right there in frame and is
     * the thing you would reach for anyway. Trolling on is a button.
     */
    function setSpotTargets() {
      dockTargets = [];
      /* The thing being chosen here is a CAST, and a cast goes in the water.
       *
       * The target used to be the rod, and a scan marker round the rod is a
       * marker round whatever the rod happens to be doing: the blank bends,
       * the line runs out to wherever the last cast landed, the float rides
       * on the end of it. The bracket went from a patch of water to most of
       * the screen and back again, and none of it meant anything.
       *
       * So it is a fixed square of water off the fishing side - the same
       * square every time, at the same place, whatever the rod is up to. */
      dockTargets.push({ key: 'cast', obj: null, water: true,
                         pos: new THREE.Vector3(), labelY: 0.9 });
      updateCastTarget();
    }

    /** Where that square of water is, from where the boat is right now. */
    function updateCastTarget() {
      const t = dockTargets.find(x => x && x.water);
      if (!t || !lake || !run) return;
      const side = run.fishSide === 'left' ? -1 : 1;
      lake.pointAt(run.dist + 6, run.lateral + side * CAST_MARK_OFF, t.pos);
    }


    /**
     * Put the outline glow on target `i`. -1 clears it.
     *
     * The halo joins the target's OWN parent, so it inherits whatever
     * transform put the object there and needs no world-space maths.
     */
    /* Nothing is added to the scene for focus any more. The marker is drawn
       in the UI layer, over the top, so all the scene has to do is remember
       which thing is focused and say where it lands on screen. */
    function setDockFocus(i) {
      dockFocus = i;
      const t = dockTargets[i];
      focusTarget = t || null;
      focusObj = (t && t.obj && t.obj.parent) ? t.obj : null;
    }

    const _fBox = new THREE.Box3();
    const _fL = new THREE.Vector3(), _fR = new THREE.Vector3();
    /* How far off the rail the cast marker sits, and how wide it is drawn.
       Both in world units, so the bracket keeps its size against the lake and
       shrinks with distance the way everything else does. */
    const CAST_MARK_OFF = 17;
    const CAST_MARK_R = 7;

    /**
     * The bracket for a square of open water.
     *
     * Measured across the boat's own beam and drawn square, so it is the same
     * shape wherever the route has turned to.
     */
    function waterFocusRect(t) {
      if (!cam || !lake || !run) return null;
      updateCastTarget();
      const fr = lake.frameAt(run.dist);
      _fL.copy(t.pos).addScaledVector(fr.right, -CAST_MARK_R);
      _fR.copy(t.pos).addScaledVector(fr.right, CAST_MARK_R);
      _fL.project(cam);
      _fR.project(cam);
      if (_fL.z > 1 || _fR.z > 1) return null;
      const W = window.innerWidth, H = window.innerHeight;
      const x0 = (Math.min(_fL.x, _fR.x) * 0.5 + 0.5) * W;
      const x1 = (Math.max(_fL.x, _fR.x) * 0.5 + 0.5) * W;
      const cy = (0.5 - ((_fL.y + _fR.y) * 0.5) * 0.5) * H;
      // Never so small it cannot be seen, never so big it is a border.
      const half = U.clamp((x1 - x0) * 0.5, 46, W * 0.24);
      return { x: (x0 + x1) * 0.5 - half, y: cy - half * 0.7, w: half * 2, h: half * 1.4 };
    }
    const _fPt = new THREE.Vector3();

    /**
     * Where the focused object sits on screen, as {x, y, w, h} in CSS pixels,
     * or null if there is nothing focused or it is not in front of the eye.
     *
     * Corners behind the near plane are dropped rather than projected: a point
     * behind the camera comes back through project() with its x and y negated,
     * which would stretch the box across the whole screen. The rod while
     * fishing is close enough to the eye to do exactly that.
     */
    function focusScreenRect() {
      // A patch of water has no object to measure, so it is framed by hand.
      if (focusTarget && focusTarget.water) return waterFocusRect(focusTarget);
      if (!focusObj || !cam) return null;
      _fBox.setFromObject(focusObj);
      if (_fBox.isEmpty()) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, seen = 0;
      for (let i = 0; i < 8; i++) {
        _fPt.set(i & 1 ? _fBox.max.x : _fBox.min.x,
                 i & 2 ? _fBox.max.y : _fBox.min.y,
                 i & 4 ? _fBox.max.z : _fBox.min.z);
        _fPt.project(cam);
        if (_fPt.z > 1) continue;               // behind the eye
        seen++;
        if (_fPt.x < minX) minX = _fPt.x;
        if (_fPt.x > maxX) maxX = _fPt.x;
        if (_fPt.y < minY) minY = _fPt.y;
        if (_fPt.y > maxY) maxY = _fPt.y;
      }
      if (seen < 2) return null;
      const W = window.innerWidth, H = window.innerHeight;
      // Clamped to the viewport so a target half off-screen still gets a
      // marker on the part of it you can actually see.
      const x0 = Math.max(0, (minX * 0.5 + 0.5) * W);
      const x1 = Math.min(W, (maxX * 0.5 + 0.5) * W);
      const y0 = Math.max(0, (0.5 - maxY * 0.5) * H);
      const y1 = Math.min(H, (0.5 - minY * 0.5) * H);
      if (x1 - x0 < 8 || y1 - y0 < 8) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    const _ray = new THREE.Raycaster();
    const _ndc = new THREE.Vector2();

    /**
     * Which scan target is under a point on screen, or -1.
     *
     * Walks up from whatever the ray actually hit to the first ancestor that
     * is a target, so clicking the man in the boat picks the man and clicking
     * the hull picks the boat — even though one is inside the other.
     */
    function pickTarget(clientX, clientY) {
      if (!dockTargets.length || !cam) return -1;
      const objs = [];
      for (const t of dockTargets) if (t.obj) objs.push(t.obj);
      if (!objs.length) return -1;
      _ndc.x = (clientX / (window.innerWidth || 1)) * 2 - 1;
      _ndc.y = -(clientY / (window.innerHeight || 1)) * 2 + 1;
      _ray.setFromCamera(_ndc, cam);
      const hits = _ray.intersectObjects(objs, true);
      if (!hits.length) return -1;
      let o = hits[0].object;
      while (o) {
        for (let i = 0; i < dockTargets.length; i++) if (dockTargets[i].obj === o) return i;
        o = o.parent;
      }
      return -1;
    }

    /** Screen positions for the floating name plates, projected each frame.
        Both places that are scanned as scenes use this. */
    function dockLabelPositions() {
      // Any place that is scanned as a scene needs these — the dock, the shop,
      // and a fishing spot, where the targets are the man and his boat.
      if (!dockTargets.length) return null;
      const w = window.innerWidth, h = window.innerHeight;
      return dockTargets.map((t, i) => {
        // Read the object's position now rather than where it was when the
        // target was made: the boat bobs, and a plate pinned to a stale spot
        // drifts off it.
        if (t.obj) {
          t.obj.getWorldPosition(_v);
          // Anchor to a point ON the object where asked: the man and his boat
          // share a screen position otherwise, and their plates land on top of
          // each other.
          if (t.localOff) {
            _lo.copy(t.localOff).applyQuaternion(t.obj.getWorldQuaternion(_lq));
            _v.add(_lo);
          }
        } else {
          _v.copy(t.pos);
        }
        _v.y += t.labelY;
        _v.project(cam);
        return {
          key: t.key, focused: i === dockFocus,
          x: (_v.x * 0.5 + 0.5) * w,
          y: (-_v.y * 0.5 + 0.5) * h,
          visible: _v.z < 1
        };
      });
    }


    /**
     * Inside the shop. The lake is torn down for this — it is a room, and the
     * only thing behind the walls would be water the player cannot see.
     */
    function showShop() {
      mode = 'shop';
      teardown();
      dockTargets = [];
      const C = colors();

      scene.background = new THREE.Color(css('--fogcol'));
      scene.fog = null;
      shopLights = [
        new THREE.HemisphereLight(0xffe9c4, 0x4a3a28, 1.5),
        new THREE.AmbientLight(0xfff0d0, 0.85)
      ];
      const key = new THREE.DirectionalLight(0xfff3d8, 1.5);
      key.position.set(5, 9, 8);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      shopLights.push(key);
      shopLights.forEach(l => scene.add(l));

      shopRoom = RT.art.shopInterior(C);
      scene.add(shopRoom);

      // The three things you can pick in here.
      const anchorOf = (o, dy) => {
        const v = new THREE.Vector3();
        o.getWorldPosition(v);
        v.y += dy || 0;
        return v;
      };
      /* Two things to do business with — the gear on the wall and the man
         behind the counter — and the door you came in by, which is how you
         leave. Everything in here is a thing in the room; nothing floats. */
      dockTargets = [
        { key: 'tackle', obj: shopRoom.userData.stock, radius: 3.4,
          pos: anchorOf(shopRoom.userData.stock, -1.9), labelY: 2.4 },
        { key: 'keeper', obj: shopRoom.userData.keeper, radius: 2.2,
          pos: anchorOf(shopRoom.userData.keeper, 0), labelY: 2.6 },
        { key: 'door', obj: shopRoom.userData.mat, radius: 2.4,
          pos: anchorOf(shopRoom.userData.mat, 0), labelY: 1.1 }
      ];

      setDockFocus(0);

      // Parked just inside the door, looking across the counter.
      camPos.set(0.4, 2.9, 8.9);
      camLook.set(-0.8, 2.25, -3.2);
      cam.position.copy(camPos);
      cam.lookAt(camLook);
    }

    function shopCamera() {
      // Dead still. You are standing on a shop floor, not bobbing in a boat —
      // drifting the camera here made the whole room sway.
      cam.position.copy(camPos);
      cam.lookAt(camLook);
    }

    function startTrip(r) {
      mode = 'trip';
      buildWorld(U.hash('mission:' + r.mission.n));
      bob = 0;
    }

    function repaint() {
      if (mode === 'attract') showAttract();
      else if (mode === 'dock') showDock();
      else if (mode === 'shop') showShop();
      else if (run) startTrip(run);
    }

    /** How long the fish on the line is, in world units. Zero when there is none. */
    function catchLenOf() { return catchObj ? catchLen * 0.55 : 0; }

    function clearCatch() {
      if (catchObj) { sc.remove(catchObj); catchObj = null; catchFor = null; }
      while (rings.length) sc.remove(rings.pop());
    }

    /**
     * The fish that is being lifted, built once per catch.
     *
     * Junk and lost tackle get no model - a boot does not leap - but the beat
     * still plays, so the line comes up empty-handed and the card follows.
     */
    function ensureCatch(r) {
      const o = r.lastCatch;
      if (!o) return null;
      if (catchObj && catchFor === o) return catchObj;
      clearCatch();
      const art = catchArtSrc(o);
      if (!art) return null;
      if (o.type === 'fish') {
        /* Its real length against the rod, in world units: a sunfish comes up
           the size of a hand and a sturgeon is longer than the angler is tall,
           because that is what the numbers on the card say and the two should
           never disagree. */
        catchLen = U.clamp((o.length || 10) * CFG.UNITS_PER_IN, 0.3, 3.2);
        catchObj = RT.art.fishCard(art, catchLen, { hang: 'mouth' });
      } else {
        /* A boot, a tin can, a phone, a wristwatch. They came up on the same
           line and they get the same moment - it is half the joke of the game,
           and a trip that only ever showed you the fish would be hiding the
           funniest thing in it. Hung from the top, because a boot has no jaw
           to be hooked by. */
        catchLen = 0.55;
        catchObj = RT.art.fishCard(art, catchLen, { hang: 'top' });
      }
      catchFor = o;
      sc.add(catchObj);

      // The hole it came out of.
      const side = r.fishSide === 'left' ? -1 : 1;
      const ring = RT.art.splashRing(new THREE.Color(css('--glint')).getHex());
      lake.pointAt(r.dist + 0.6, r.lateral + side * CFG.RAIL_OFF, _v3);
      ring.position.copy(_v3);
      ring.userData.t = 0;
      rings.push(ring);
      sc.add(ring);
      return catchObj;
    }

    /** One shoal object per shoal near the boat; the rest are culled. */
    function syncShoals(r) {
      const want = new Set();
      for (const spot of r.pending) {
        if (Math.abs(spot.dist - r.dist) > CFG.CULL_DIST) continue;
        for (const sh of spot.shoals) {
          const key = spot.index + ':' + sh.side;
          want.add(key);
          if (shoalObjs.has(key)) continue;
          const g = RT.art.fishShoal({
            seed: sh.seed, count: sh.count, radius: sh.radius,
            length: sh.fishLength,
            /* Its OWN species colour, so a shoal can be told apart at a
               glance and matches the fish named on the approach card. The
               theme colour is only the fallback for a shoal with no species
               behind it. */
            color: new THREE.Color(sh.fishColor ||
                     css(sh.isTarget ? '--fish-target' : '--fish-dark')).getHex()
          });
          /* The water over it, dressed for what lives there. Same place,
             same yaw, same bank as the shoal - it IS the shoal, seen from
             above - so it is built and culled on exactly the same terms. */
          const patch = RT.art.biomePatch({
            biome: sh.biome, seed: sh.seed ^ 0x5f3a, radius: sh.radius * 1.15,
            colors: {
              sand: css('--sand'), lily: css('--lily'), reed: css('--reed'),
              deep: css('--water-deep'), glint: css('--glint'), rock: css('--rock-mid'),
              biome: css('--biome-' + sh.biome)
            }
          });
          lake.pointAt(spot.dist + sh.along, sh.lateral, _v);
          patch.position.copy(_v);
          const pfr = lake.frameAt(spot.dist + sh.along);
          patch.rotation.y = pfr.yaw;
          patch.rotation.z = -pfr.bank;
          sc.add(patch);
          patchObjs.set(key, patch);

          g.position.copy(_v);
          /* Just under the surface rather than down in the dark, so the fish
             are visible from the helm on the way past - but BELOW everything
             the biome patch lays on the water (art.js, PATCH_Y), because a
             fish swims under a lily pad and not over it. */
          g.position.y += 0.06;
          const fr = lake.frameAt(spot.dist + sh.along);
          g.rotation.y = fr.yaw;
          // Anything flat on the water follows the banking, or its outer edge
          // sinks through the surface wherever the route banks. (Trap 2.)
          g.rotation.z = -fr.bank;
          sc.add(g);
          shoalObjs.set(key, g);
        }
      }
      for (const [k, g] of Array.from(shoalObjs.entries())) {
        if (!want.has(k)) { sc.remove(g); shoalObjs.delete(k); }
      }
      for (const [k, g] of Array.from(patchObjs.entries())) {
        if (!want.has(k)) { sc.remove(g); patchObjs.delete(k); }
      }
      const still = reducedMotion();
      for (const g of patchObjs.values()) RT.art.updateBiomePatch(g, clock, still);

      if (r.state !== S.LANDING && catchObj) clearCatch();
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].userData.t += lastDt;
        if (!RT.art.updateSplashRing(rings[i], rings[i].userData.t)) {
          sc.remove(rings[i]);
          rings.splice(i, 1);
        }
      }

      /* Fish that know the bait is there.
       *
       * The wait for a bite was the one stretch of this game with nothing to
       * watch: a float sitting on flat water for up to twelve seconds. Now the
       * shoal you cast into notices - a couple of them break off and circle
       * the float, closer the longer it has been down. It carries no deadline
       * and asks for nothing; it is just the difference between waiting and
       * watching something about to happen. */
      const bobberAt = (r.state === S.WAITING || r.state === S.HOOKING) ? bobberObj : null;
      const nearShoal = bobberAt && r.landing && r.landing.shoal ? r.landing.shoal : null;
      if (nearShoal) {
        for (const [k, g] of patchObjs.entries()) {
          if (!shoalObjs.has(k)) continue;
          const sg = shoalObjs.get(k);
          const isOurs = Math.abs(sg.position.x - bobberObj.position.x) < 60 &&
                         Math.abs(sg.position.z - bobberObj.position.z) < 60;
          RT.art.drawShoalTo(sg, isOurs ? bobberObj.position : null,
                             r.state === S.HOOKING ? 1 : U.clamp(r.timer / 6, 0, 1), still);
        }
      } else {
        for (const sg of shoalObjs.values()) RT.art.drawShoalTo(sg, null, 0, still);
      }
      for (const g of shoalObjs.values()) RT.art.updateShoal(g, clock);
    }

    let lastDt = 0;

    function update(dt, r, isPaused) {
      lastDt = isPaused ? 0 : dt;
      if (!isPaused) clock += dt;
      // The shop is a room with no lake behind it, so it is handled before
      // the lake guard below.
      if (mode === 'shop') {
        shopCamera();
        return;
      }
      if (!lake) return;

      if (mode !== 'trip') setFov(58);

      if (mode === 'attract' || mode === 'dock') {
        if (boatObj.userData.angler) boatObj.userData.angler.visible = true;
      }

      if (mode === 'attract') {
        attractDist += 9 * dt;
        lake.ensureAround(attractDist);
        placeBoat(attractDist, 0, dt);
        chaseCamera(attractDist, dt);
        lake.update(dt, camPos, boatObj.position);
        return;
      }

      if (mode === 'dock') {
        bob += dt;
        dockCamera(dt);
        lake.update(dt, camPos, boatObj.position);
        return;
      }

      if (!r) return;
      // The glow marks a scan target. Leaving the spot ends that scan, so
      // clear it here too rather than trusting every exit path to do it.
      if (focusObj && r.state !== S.SPOT) setDockFocus(-1);
      lake.ensureAround(r.dist);
      syncShoals(r);
      placeBoat(r.dist, r.lateral, isPaused ? 0 : dt);

      const fishing = isFishing();
      rodObj.visible = fishing;
      // Also while choosing and aiming, so the tackle hangs off the tip
      // instead of appearing out of nowhere at the moment of the cast.
      bobberObj.visible = fishing;
      aimLine.visible = (r.state === S.AIM || r.state === S.CHARGE);
      landMark.visible = aimLine.visible;

      // First person throughout: at the helm under way, at the rail fishing.
      // Wider while fishing: the arc you can cast through, the rod and the
      // water it lands in all have to sit in one fixed frame.
      setFov(fishing ? 78 : 58);
      if (fishing) { shoulderCamera(r, dt); updateRod(r, dt); }
      else helmCamera(r);
      // We are looking out of his eyes, so he is not in front of them.
      if (boatObj.userData.angler) boatObj.userData.angler.visible = false;

      if (aimLine.visible) updateAimLine(r);
      lake.update(dt, camPos, boatObj.position);
    }

    function placeBoat(dist, off, dt) {
      const fr = lake.frameAt(dist);
      lake.pointAt(dist, off, _v);
      bob += dt;
      boatObj.position.copy(_v);
      boatObj.position.y += Math.sin(bob * 1.1) * 0.10 + 0.30;
      // Y rotation is frame.yaw, never frame.heading. (Trap 1.)
      // frame.yaw keeps it pointing down the route; run.yaw is the steering
      // swing on top of that. (Trap 1: never frame.heading.)
      /* The hull points where it is actually going.
       *
       * Note the MINUS. Rotating about +Y by a negative angle swings a
       * -Z-facing model toward +X, which is starboard — so a starboard turn
       * (run.yaw positive, lateral increasing) needs the mesh yaw to go down,
       * not up. Adding it turned the boat one way while it travelled the
       * other, which is exactly what "I steer left and it goes right" is. */
      boatObj.rotation.y = fr.yaw - (run ? (run.yaw || 0) : 0);
      // Heels the way the helm is put over. Gently — you are riding in this,
      // so the horizon moves with it.
      /* Heels into the turn. +X is starboard, and a positive Z rotation lifts
         +X, so leaning starboard-down in a starboard turn is negative. */
      boatObj.rotation.z = -fr.bank + Math.sin(bob * 0.8) * 0.02
                        - (run ? (run.yaw || 0) : 0) * 0.20
                        + heelFromFish();
      boatObj.rotation.x = Math.sin(bob * 1.4) * 0.015;
      // The wheel turns further than the boat does — it is geared, and it is
      // the one thing in view that shows the helm answering.
      if (boatObj.userData.wheel) {
        boatObj.userData.wheel.rotation.z = -(run ? (run.yaw || 0) : 0) * 2.4;
      }
    }

    /**
     * A fish heavy enough to pull the boat over does.
     *
     * Toward the rail it is being played off, more of it while it runs, and
     * nothing at all for a sunfish. Small numbers on purpose: the horizon
     * moving a degree reads as weight, and moving five reads as a shipwreck.
     */
    function heelFromFish() {
      if (!run || (run.state !== S.REELING && run.state !== S.LANDING)) return 0;
      const size = run.fightSize || 0;
      if (size < 0.25) return 0;
      const side = run.fishSide === 'left' ? -1 : 1;
      const running = run.reel && run.reel.phase === 'run';
      const k = size * (running ? 0.055 : 0.03) * (run.state === S.LANDING ? 0.7 : 1);
      return side * k * (0.85 + Math.sin(clock * 1.7) * 0.15);
    }

    const _fwd = new THREE.Vector3();

    /** The boat's own heading: the route's forward, swung by the helm. */
    function boatForward(r, out) {
      const fr = lake.frameAt(r ? r.dist : 0);
      const y = r ? (r.yaw || 0) : 0;
      // Positive yaw is a turn to starboard, so it leans on `right`.
      return (out || _fwd).set(0, 0, 0)
        .addScaledVector(fr.forward, Math.cos(y))
        .addScaledVector(fr.right, Math.sin(y));
    }

    const _camOff = new THREE.Vector3();
    const _camFwd = new THREE.Vector3();

    /**
     * Bolted to the boat.
     *
     * The camera sits at a fixed point in the BOAT's own frame and looks along
     * the boat's own axis, with no smoothing of its own. So the boat never
     * moves on screen — put the helm over and the whole lake swings past
     * instead, which is what turning a boat looks like from in it. Any easing
     * here would read as the camera drifting around a boat that is standing
     * still, which is exactly what it used to look like.
     */
    const _camQ = new THREE.Quaternion();
    const _pitchQ = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.075);  // barely down

    function helmCamera(r) {
      boatObj.updateMatrixWorld(true);
      // Up close behind the wheel and a little higher, with less of a
      // downward tilt — so the frame is mostly lake rather than deck.
      _camOff.set(0, 3.05, 1.05).applyMatrix4(boatObj.matrixWorld);
      cam.position.copy(_camOff);
      camPos.copy(_camOff);
      /* Take the boat's whole orientation, heel and all, rather than aiming at
         a point with a world-up. A camera that keeps itself level while the
         boat leans reads as the boat tilting away from you; sharing the
         orientation is simply sitting in it. Cameras look down their own -Z
         and the models face -Z too, so the boat's rotation is the camera's. */
      cam.quaternion.copy(boatObj.getWorldQuaternion(_camQ)).multiply(_pitchQ);
      camLook.copy(cam.position).addScaledVector(
        _camFwd.set(0, 0, -1).applyQuaternion(cam.quaternion), 40);
    }

    /** The attract loop still wants a look at the boat from outside. */
    function chaseCamera(dist, dt) {
      const fr = lake.frameAt(dist);
      _v.copy(boatObj.position).addScaledVector(fr.forward, -27);
      _v.y += 13;
      camPos.lerp(_v, 1 - Math.exp(-4.5 * dt));
      _v2.copy(boatObj.position).addScaledVector(fr.forward, 26);
      _v2.y += 2.0;
      camLook.lerp(_v2, 1 - Math.exp(-5.5 * dt));
      cam.position.copy(camPos);
      cam.lookAt(camLook);
    }

    /** Looking along the jetty, with the shop and the boat both in frame. */
    function dockCamera(dt) {
      if (!dockBoat) return;
      // Close in on the working end of the dock, so the boat and the shop read
      // large and centred rather than as distant objects on a big lake.
      // Framed off the boat rather than off a midpoint with the shop: the shop
      // sits well inland now, and averaging the two pulled the aim so far up
      // the bank that the boat fell out of the bottom of the frame.
      lake.pointAt(dockBoat.dist + 15, dockBoat.lateral + 17, _v);
      _v.y += 10.0;
      camPos.lerp(_v, 1 - Math.exp(-3.0 * dt));
      lake.pointAt(dockBoat.dist + 1, dockBoat.lateral - 12, _v2);
      _v2.y += 2.4;
      camLook.lerp(_v2, 1 - Math.exp(-3.0 * dt));
      cam.position.copy(camPos);
      cam.lookAt(camLook);
    }

    /**
     * Over the angler's shoulder, looking down the line rather than over the
     * bow — while aiming it follows the aimer, and once the line is out it
     * follows the bobber, swinging round as a hooked fish runs and coming
     * back in with it. Snapping to centre on the boat threw away the one thing
     * the player is actually watching.
     */
    function lineAngle(r) {
      if (r.state === S.AIM || r.state === S.CHARGE) return r.aim;
      const b = bobberTrack(r);
      if (!b) return 0;
      return Math.atan2(b.lat - r.lateral, b.along - r.dist);
    }

    /**
     * Fishing: the same eye, turned to the side the line is on, so you see one
     * gunwale, the rod, and the water you are casting into.
     */
    function shoulderCamera(r, dt) {
      boatForward(r, _fwd);
      const fr = lake.frameAt(r.dist);
      const side = r.fishSide === 'left' ? -1 : 1;
      // Stand at the rail on the fishing side.
      _v.copy(boatObj.position)
        .addScaledVector(_fwd, 0.4)
        .addScaledVector(fr.right, side * 0.55);
      _v.y += 3.2;
      camPos.lerp(_v, 1 - Math.exp(-6.0 * dt));

      // Look where the line is, or straight over the side before it is out.
      const a = lineAngle(r);
      const look = (a === 0) ? side * Math.PI / 2 : a;
      _v2.copy(boatObj.position)
        .addScaledVector(_fwd, Math.cos(look) * 26)
        .addScaledVector(fr.right, Math.sin(look) * 26);
      _v2.y -= 1.4;
      /* Landing: look AT the fish, not out across the lake. The eye going up
         with it is most of what makes it feel like something being lifted -
         and it saves hoisting the fish over the treeline to get it in shot. */
      if (r.state === S.LANDING) {
        _v2.copy(bobberObj.position);
        _v2.y -= catchLenOf();
        camLook.lerp(_v2, 1 - Math.exp(-6.5 * dt));
        cam.position.copy(camPos);
        cam.lookAt(camLook);
        return;
      }
      camLook.lerp(_v2, 1 - Math.exp(-4.0 * dt));
      cam.position.copy(camPos);
      cam.lookAt(camLook);
    }

    /** Where the bobber is in track space, for both the rod and the camera. */
    function bobberTrack(r) {
      const S2 = S;
      /* Landing first, and WITHOUT asking where the cast came down: the fish
         is alongside now, on the rail it was played from, and the lift in
         updateRod hangs off this one point. Behind the r.landing guard, a
         beat that ran with no cast on record put the line - and the camera
         looking at it - up at the rod tip pointing at the sky. */
      if (r.state === S2.LANDING) {
        const lside = r.fishSide === 'left' ? -1 : 1;
        return { along: r.dist + 0.6, lat: r.lateral + lside * CFG.RAIL_OFF };
      }
      if (!r.landing) return null;
      if (r.state === S2.FLYING) {
        const t = U.clamp(r.timer / 0.75, 0, 1);
        /* It leaves from the ROD TIP. Starting the flight on the boat's own
           centreline sent the line out through the hull beside you - out to
           the left, if the left rail was the one you were fishing - rather
           than off the end of the rod you had just swung. */
        const side = r.fishSide === 'left' ? -1 : 1;
        return { along: U.lerp(r.dist + 2.2, r.landing.along, t),
                 lat: U.lerp(r.lateral + side * CFG.RAIL_OFF, r.landing.lateral, t) };
      }
      if (r.state === S2.REELING && r.reel) {
        const p = r.reel.progress;
        // A running fish takes line back out and swings off to the side.
        /* No fudge factor here any more. The float used to be shoved 22% of
           the way back out the instant a run started and snapped forward
           again when it ended, because the PROGRESS was frozen and something
           had to show the run. The progress moves for real now (RUN_TAKE), so
           the float simply follows it. */
        const k = U.clamp(p, 0, 1);
        /* It comes in to the rail you are standing at — beside you — not to a
           point off the bow. The angler is amidships on the fishing side, so
           that is where a landed fish ends up. */
        const side = r.fishSide === 'left' ? -1 : 1;
        /* A run swings the fish about, but only ever OUTBOARD.
           This used to be a plain `sin() * 8` added to the lateral — a SIGNED
           number, with no idea which rail you were fishing from. Off the port
           side its positive half was easily enough to carry the fish across
           the centreline and out through the starboard hull. Half-rectified
           to 0..1 and multiplied by `side`, it can only push away from the
           boat, never across it. */
        const sway = r.reel.phase === 'run'
          ? (0.5 + 0.5 * Math.sin(r.reel.phaseT * 2.2)) * 7 : 0;
        const lat = U.lerp(r.landing.lateral, r.lateral + side * CFG.RAIL_OFF, k)
                  + side * sway;
        /* And whatever the arithmetic came to, the fish stays outboard of the
           rail it is about to be lifted over. bobberTrack also feeds
           lineAngle(), so a fish that strays inboard drags the line and the
           camera through the hull with it. */
        const outboard = (lat - r.lateral) * side;
        return { along: U.lerp(r.landing.along, r.dist + 0.6, k),
                 lat: outboard < CFG.RAIL_OFF
                        ? r.lateral + side * CFG.RAIL_OFF : lat };
      }
      if (r.state === S2.WAITING || r.state === S2.HOOKING) {
        return { along: r.landing.along, lat: r.landing.lateral };
      }
      return null;
    }

    const _rodQ = new THREE.Quaternion();
    const _tipQ = new THREE.Quaternion();
    const _tipUp = new THREE.Vector3();
    const _rodOff = new THREE.Vector3();

    function updateRod(r, dt) {
      /* Held in view rather than parked in the world.
       *
       * It used to sit at a fixed offset to STARBOARD of the boat, so fishing
       * the port side put the rod behind the player's head. Hanging it off the
       * camera puts it in the near hand on whichever side is being fished, and
       * keeps it steady in frame the way a rod you are actually holding is.
       */
      const hand = r.fishSide === 'left' ? -1 : 1;
      cam.updateMatrixWorld(true);
      _rodQ.copy(cam.quaternion);
      // Butt low and to the near hand, just in front of the eye.
      _rodOff.set(hand * 0.52, -0.56, -0.58).applyQuaternion(_rodQ);
      rodObj.position.copy(cam.position).add(_rodOff);
      /* The rod is built along +Y. Square to the view it would point straight
         up out of frame, so it is laid over about the view's X until its
         length runs mostly AWAY from the eye and a little up — a rod held out
         over the water. Rotating the other way lays it back over your
         shoulder. */
      /* How the rod is CARRIED, decided before it is placed:
       *   lift  swings it back up over the shoulder, on top of the base rake
       *   bend  is the blank flexing under load
       * Winding up a cast is a lift with no bend — you are drawing the rod
       * back, not pulling against anything. Playing a fish is the opposite:
       * the rod is held high and most of what you see is the blank hooped
       * over. Bending it while it is being drawn back read as the rod fighting
       * a fish that had not bitten yet.
       */
      let bend = 0.08, lift = 0;
      if (r.state === S.CHARGE) {
        lift = (r.power / 100) * 1.45;   // up and back over the shoulder
        bend = 0.02;                     // an unloaded blank is straight
      } else if (r.state === S.FLYING) {
        /* THE THROW. The rod whips forward out of the wind-up, follows through
           a little past straight, then settles back to how it is carried. It
           used to jump straight to the rest pose the instant the line left,
           which read as the rod resetting rather than casting. */
        const t = U.clamp(r.timer / 0.45, 0, 1);
        const from = r.castFrom || 0;
        lift = t < 0.45
          ? U.lerp(from, -0.30, 1 - Math.pow(1 - t / 0.45, 3))   // the flick
          : U.lerp(-0.30, 0, (t - 0.45) / 0.55);                 // and settle
        bend = 0.02;
      } else if (r.state === S.HOOKING) {
        lift = 0.22;
      } else if (r.state === S.REELING) {
        lift = 0.55;                     // rod held high while playing it
      } else if (r.state === S.LANDING) {
        lift = 0.66;                     // held higher still, swinging it in
      }

      rodObj.quaternion.copy(_rodQ);
      rodObj.rotateX(-0.92 + lift);
      rodObj.rotateZ(hand * -0.26);    // and raked outboard

      /* Hook and bait go away while something is hanging off them.
         The hook is inside the fish's mouth once it is caught, so drawing it
         over the top of the card - which is what a billboard at the same point
         does - reads as a hook floating in front of the fish. */
      /* Hidden only when something is hanging off it. When the fish came off,
         the empty hook IS the news. */
      const onLine = (r.state === S.LANDING && !!catchObj);
      if (rodObj.userData.hook) rodObj.userData.hook.visible = !onLine;
      if (rodObj.userData.baitHold) rodObj.userData.baitHold.visible = !onLine;

      const bt = bobberTrack(r);
      if (!bt) {
        /* Nothing cast yet, so the float and hook dangle off the rod tip where
           they would really be. Left at its last landing point the line simply
           stretched away off the side of the screen. */
        const segs = rodObj.userData.segs;
        const tip = segs[segs.length - 1];
        tip.updateWorldMatrix(true, false);
        tip.getWorldPosition(_v2);
        _v2.addScaledVector(_tipUp.set(0, 1, 0).applyQuaternion(tip.getWorldQuaternion(_tipQ)), 0.62);
        _v2.y -= 0.85;
        bobberObj.position.copy(_v2);
      }
      if (bt) {
        lake.pointAt(bt.along, bt.lat, _v2);
        if (r.state === S.FLYING) _v2.y += Math.sin(U.clamp(r.timer / 0.75, 0, 1) * Math.PI) * 6;
        /* A nibble pulls the float under for a moment. run.teaseAt is set to
           zero the instant it happens and counted up here, so the dip is a
           short curve and then it bobs back - the same shape a real one has. */
        if (r.state === S.WAITING && r.teaseAt !== undefined && r.teaseAt !== null) {
          r.teaseAt += dt;
          const k = U.clamp(r.teaseAt / 0.85, 0, 1);
          if (k < 1) _v2.y -= Math.sin(k * Math.PI) * 0.55;
          else r.teaseAt = null;
        }
        if (r.state === S.HOOKING) { _v2.y -= 0.5 + Math.sin(r.timer * 7) * 0.12; bend = 0.5; }
        if (r.state === S.LANDING) {
          /* Straight up, out of the water, and there it hangs.
             The lift is the fish's own length plus a little, so a small one
             clears the surface and a big one is not hauled into the sky. */
          const t = U.clamp(r.timer / CFG.LAND_TIME, 0, 1);
          /* Up to eye level, always.
           *
           * This used to be the catch's own length plus a bit, which is fine
           * for a pike and useless for a sunfish: four inches of fish lifted
           * four inches out of the water hangs behind the hull, and all the
           * player sees is a line going over the side. The camera stands at
           * the rail about 3.2 above the water, so the hook comes up to just
           * above that and everything on it is in shot - a small one at eye
           * level, a big one hanging down from it. */
          const top = CFG.LAND_LIFT;
          _v2.y += U.smoothstep(U.clamp(t / 0.55, 0, 1)) * top;
          bend = 0.62 - 0.2 * t;         // the rod stays loaded: it is holding a fish

          const fish = ensureCatch(r);
          if (fish) {
            /* Hung from the hook in its jaw. Head up, tail down, side-on to
               whoever is looking - so what you see is the fish on the card,
               the size the card says it is. */
            fish.position.copy(_v2);
            const swing = Math.sin(clock * 3.1) * 0.05 * (1 - t * 0.5);
            const kick = Math.sin(clock * 12) * 0.06 * Math.max(0, 1 - t * 1.6);
            // A fish hangs head-up from its jaw; junk just dangles and turns.
            const hang = (r.lastCatch && r.lastCatch.type === 'fish') ? Math.PI / 2 : 0;
            RT.art.faceFishCard(fish, cam.position, hang + swing + kick);
          }
        }
        if (r.state === S.REELING) {
          _v2.y -= 0.35;
          /* With the rod already held high there is less of it left to bend,
             so these are gentler than they were. A run still hoops it over —
             that is the one moment the blank should look loaded. */
          const rl = r.reel;
          // Weight on the line, in the only unit a rod has: how far it bends.
          const big = 0.75 + (r.fightSize || 0.3) * 0.9;
          bend = (rl && rl.phase === 'run'
            ? 0.55 + (rl.strain || 0) * 0.22
            : 0.16 + (reelHolding ? 0.20 : 0.04)) * big;
        }
        /* Proud of the pads, the stains and the fish. See PATCH_Y in art.js:
           the float is top of that stack, always. */
        _v2.y += 0.3;
        bobberObj.position.copy(_v2);
      }
      RT.art.updateRodRig(rodObj, bend, bobberObj.position);
    }

    /** A dashed arc from the boat out to the predicted landing point. */
    function updateAimLine(r) {
      const frac = r.state === S.CHARGE ? Math.max(CFG.MIN_CAST_FRAC, r.power / 100) : 1;
      const d = r.range * frac;
      const pos = aimLine.geometry.attributes.position;
      const N = 22;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        lake.pointAt(r.dist + Math.cos(r.aim) * d * t,
                     r.lateral + Math.sin(r.aim) * d * t, _v);
        _v.y += 1.6 + Math.sin(t * Math.PI) * (r.state === S.CHARGE ? 3.5 * frac : 2.0);
        pos.setXYZ(i, _v.x, _v.y, _v.z);
      }
      pos.needsUpdate = true;
      aimLine.computeLineDistances();

      lake.pointAt(r.dist + Math.cos(r.aim) * d, r.lateral + Math.sin(r.aim) * d, _v);
      landMark.position.copy(_v);
      /* Above the shoals. The fish shadows sit just under the surface, and the
         arrow marking where the cast will land has to be readable ON TOP of
         the very fish it is pointing into - being hidden by them is the one
         place it must not be. */
      landMark.position.y += 0.75;
      // Lay the arrow along the line, so it points where the cast is going.
      landMark.rotation.y = lake.frameAt(r.dist).yaw - r.aim;
    }

    function perf() {
      if (!rend) return null;
      const i = rend.info;
      return { calls: i.render.calls, tris: i.render.triangles,
               chunks: lake ? lake.built : 0, shoals: shoalObjs.size };
    }

    /** Should report 0 degrees. A chase camera hides small yaw errors. */
    function debugAlignment(dist) {
      if (!lake || !boatObj) return null;
      const d = dist === undefined ? (run ? run.dist : 100) : dist;
      const fr = lake.frameAt(d);
      const f = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, fr.yaw, 0));
      return Math.round(THREE.MathUtils.radToDeg(f.angleTo(fr.forward)) * 100) / 100;
    }

    /* Where a hooked fish would be for a given fight state. Exposed so the
       fight can be swept exhaustively — every phase, every point of the
       retrieve, both rails — rather than hoping one live fight happens to
       swing the fish through the hull. */
    function debugBobberTrack(fakeRun) { return bobberTrack(fakeRun); }

    return { init, showAttract, showDock, showShop, startTrip, update, repaint, teardown,
             perf, debugAlignment, debugBobberTrack,
             setDockFocus, focusScreenRect, dockLabelPositions, setSpotTargets,
             pickTarget,
             get dockTargets() { return dockTargets; },
             get lake() { return lake; }, get boat() { return boatObj; } };
  })();

  RT.scene = Scene;

  /* ══════════════════════════════════════════════════════════════════════
     EXPORTS
     ══════════════════════════════════════════════════════════════════════ */

  return {
    CFG, S, TIERS, QUALITY_BUCKETS,
    init, loadAttract, update,
    goToDock, enterShop, castOff, returnToDock,
    isPlaying, isSteering, isFishing, isFighting,
    pause, resume, quitToMenu,
    setSteer, setLateralTarget, clearPointerSteer, pullOverTo, setAimFrac, flipArmed, getArmed,
    startAim, setAimSweep, lockAim, beginCharge, setCharging, releaseCast,
    hookFish, setReelHold, chooseTroll, afterCatchCard,
    callbacks,
    css, refreshPalette, PALETTE_VARS,
    getCueLevel, cycleCueLevel,
    keeperLength, keepersOn, setKeepers,
    bestRod, bestRodId, ownsRod, nextRod, buyRod,
    ownsBait, equippedBait, buyBait, nextBait,
    __rodHolds: (f, rod, obj) => rodHolds(f, rod, obj),
    getTheme, setTheme, getCardStyle, setCardStyle,
    getSave, resetProgress, visibleMissions, missionByN, currentMission, isFinished,
    dockTargets, shopTargets, spotTargets, missionBrief, setDockFocus: (i) => RT.scene.setDockFocus(i),
    __debugBobberTrack: (r) => RT.scene.debugBobberTrack(r),
    __land: () => landFish(),   // drive a landing through the real path
    // Balance probes: the real roll functions, so a simulation cannot drift
    // from what the game actually does.
    __rollBite: (b, bait, onShoal, rod, named) => rollBite(b, bait, onShoal, null, rod, named),
    __rollFish: (id, q) => rollFishCatch(id, q),
    __spotToEnter: (side) => spotToEnter(side),
    dockLabelPositions: () => RT.scene.dockLabelPositions(),
    focusScreenRect: () => RT.scene.focusScreenRect(),
    pickTarget: (x, y) => RT.scene.pickTarget(x, y),
    turnInState, turnInMission, handInJob, takeGrant, grantFor, missionTip, targetSpeech,
    shopStock, buyStock, ownedTier, ownedGear, gearAdvice, fishLog,
    /* The five knobs the shop moves, so a test can watch a purchase land
       rather than trusting that it did. */
    __knobs: () => ({ window: spotWindow(), lead: cueLead(), snap: strainSnap(),
                      hookMin: hookMin(), hookMax: hookMax(), sell: sellRate(),
                      junk: junkRate() }),
    sellCatch, holdValue, holdCount,
    rodById, baitById, fishById, biomeName, biomeFishNames,
    rodArtSrc, rodIconSrc, baitArtSrc, castRange, shoalOffset,
    perf: () => Scene.perf(), debugAlignment: (d) => Scene.debugAlignment(d),
    get state() { return run ? run.state : S.ATTRACT; },
    get run() { return run; },

    /* Pure rules, exposed for the acceptance harness. */
    __test: {
      generateSpot, targetBiomes, otherBiomes, isAllTarget,
      rollBite, biteWeightedFishPool, rollFishCatch, resolveCatch,
      applyToTarget, targetProgressText, targetComplete,
      auditMissions, newRun, castRange, shoalOffset, grantFor,
      CFG, TIERS
    }
  };
})();
