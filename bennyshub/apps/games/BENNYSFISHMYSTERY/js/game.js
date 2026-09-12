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

  /* Painted icons, shared with ui.js — see js/icons.js. Aliased locally so the
     text that builds cards and mission notes reads the same here as it does
     over there. */
  const ic = (n) => RT.icons.ic(n);
  const itemIc = (n) => RT.icons.item(n);

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
    /* ...while TROLLING. Pulled over, the boat sits right on the shoal, which
       can be a hundred units out in the deep channel: you steer in a lane, but
       you fish where the fish are. Everything the lake generates is inside
       this, so a pull-over can always finish on the fish itself. */
    FISH_LAT_MAX: 120,
    /* Steering turns the boat and then it travels the way it is pointing,
       rather than sliding sideways down a rail. YAW_MAX is how far over the
       helm goes; YAW_RATE is how fast it gets there and how fast it comes
       back to straight when you let go. */
    YAW_MAX:      0.55,
    YAW_RATE:     1.8,
    /* How fast a full helm brings the head round: radians per second per
       unit of helm. */
    TURN_RATE:    1.25,

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
    /* HOW LONG YOU MUST HOLD TO PULL IN.
       Steering is holding the helm over, so pulling over has to take clearly
       longer than steering does or the boat stops every time you turn. Five
       seconds all told: two before the offer even appears, three more to
       take it - and letting go at any point in that is simply steering. */
    /* Three seconds, end to end, to pull over onto a shoal that has been
       called: long enough that nobody stops by accident, short enough that
       nobody is holding a switch down wondering whether it is working. It was
       two plus three, and five seconds of holding is a long time when you are
       counting. */
    LEAN_ARM:     0.6,
    PULL_OVER:    2.4,
    /* Stopping where nothing has been called is a different act, and keeps the
       old, deliberate hold. Steering across the lane means holding the helm
       over for two or three seconds at a stretch, and at the short timings
       that would stop the boat every time somebody simply wanted to be on the
       other side of the lake. */
    /* Stopping where nothing has been called is a deliberate act and stays
       longer - but not five seconds longer. */
    LEAN_ARM_OPEN:  1.0,
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
    /* How often something takes the whole rig. About one cast in seventy: often
       enough to be a thing that happens to you, rare enough that it is a story
       rather than a tax. */
    SNAP_CHANCE:  0.014,
    PAIR_CHANCE:  0.55,    // chance a spot has a shoal on both sides
    /* At least one shoal of the mission's own fish every OTHER spot. At one
       in three you could troll a long way past water that had nothing you
       needed, which is a dull stretch with nothing to steer for. */
    TARGET_WINDOW: 2,      // at least one shoal of the target every 2 spots
    /* Twenty seconds of warning. A fishing spot has to be announced far
       enough ahead that somebody who needs time to react still has plenty
       of it left after they have read the card. */
    CUE_LEAD:     20.0,    // seconds of warning before a spot comes up
    /* HOW NEAR A SHOAL HAS TO BE to be talked about, carded and pulled over
       onto. Forty yards - a hundred and twenty feet. It used to be worked out
       from CUE_LEAD, twenty seconds of trolling, which put it two hundred and
       thirty-five yards out: the card was an offer to drive somewhere rather
       than an offer to fish where you are. */
    SPOT_OFFER:   73,
    /* And how near before the game MENTIONS it - a little further than the
       offer, so the call arrives just before the card and not a moment later.
       It was two hundred and thirty-five yards, and a spoken "catfish to your
       right" at that range is, to somebody who cannot see the lake, an
       instruction to fish where there is nothing. Finding the far ones is
       what the quest helper's arrow is for. */
    SPOT_CALL:    88,
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
    /* How much the meter eases off while the cast is predicted to land on
       fish, and how often it chimes while it is there. A third speed is a
       window three times as wide without the meter ever stopping - stopping
       would turn the throw into a puzzle instead of a cast. */
    ZONE_SLOW: 0.34,
    ZONE_PULSE: 0.42,
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
    /* The wait before a take, in the shallows. What is actually down there
       multiplies it (biteWait) - a trout at a hundred feet is a long sit and a
       sunfish off the boards is not - and the cap is what a long sit means. */
    BITE_WAIT_MIN: 3,
    BITE_WAIT_MAX: 7,
    BITE_WAIT_CAP: 34,
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
    /* How far under a magnet is allowed to go. It has to be plainly UNDER the
       water - it is dragging the bottom, not floating like the bobber it
       replaced - without going so deep the water swallows it: measured, three
       units down and it is a smudge, which is the fault this whole thing was
       written to fix. */
    MAG_SINK_MAX:  0.8,
    /* And how far a lure with no float goes down. A spoon works a ledge, a
       deep rig is bought precisely because it gets past the thermocline: they
       sat on the surface with the bobber's tackle hidden, which is the one
       thing they are not. Deeper than the magnet, which is being dragged. */
    LURE_SINK_MAX: 1.15,

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
    /* HOW WILD A FISH FIGHTS, by how far up the ladder you are.
       Nothing changes until job WILD_FROM: the even, learnable fight is how
       somebody finds out what a run is and that letting go is what saves the
       line. From there it ramps in over WILD_OVER jobs to the full spread
       below - which is a change of rhythm, never a change of reflex. The
       warning before a run does not shorten and the way to lose a fish does
       not change. */
    WILD_FROM:      8,     // jobs 1-8 fight exactly as they always did
    WILD_OVER:      14,    // and it comes in over the dozen after that
    WILD_MARK:      0.11,  // how far a run can wander along the bar
    WILD_SHORTER:   0.35,  // how much shorter the shortest run can get
    /* A run TAKES LINE while it lasts, so a very long one is a fight that
       goes on for a minute - dramatic once, tiring on the tenth fish of a
       job. Six-second runs came out of the first numbers here; four is the
       cap now, which still reads as "this one is not giving up" without
       turning a ten-fish job into ten minutes of holding a switch. */
    WILD_LONGER:    0.60,  // and how much longer the longest
    WILD_SURGE:     0.30,  // odds of a second wind just as it was tiring
    WILD_SURGE_S:   1.1,   // and how long that can last
    WILD_EXTRA:     0.45,  // odds of one more run than the tier calls for
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
    /* EVERY TIER IN THE ROSTER HAS A LINE HERE. Tiers one and six had none, so
       both fell through to the tier-three default - which had a four-inch
       sunfish fighting harder than a yellow perch, and a two-hundred-pound
       sturgeon fighting exactly like a largemouth bass. The roster uses one
       to six; so does this.

       AND THE PANFISH PULL. Tier two was commented "sunfish, no fuss" and
       given no runs at all - but the sunfish is tier ONE, and what tier two
       actually holds is the yellow perch, the black crappie and the cisco.
       Reported: "crappie and perch don't fight at all when we are fishing for
       them, maybe they should?" They should: one short run each. It lands
       early in the ladder, where fightWildness is still nought and every run
       comes at the same predictable point - which is exactly where a player
       is meant to learn what the warning means and that letting go is what
       saves the line.

       The money is untouched. Tier one keeps the pay and rate it was already
       getting from the tier-three fallback, so the first hour earns what it
       has always earned. */
    1: { lineSeconds: 3,  runs: 0, pay: 8,  rate: 0.50 },  // minnows, shiners, sunfish
    2: { lineSeconds: 5,  runs: 1, pay: 6,  rate: 2.00 },  // perch, crappie, cisco
    3: { lineSeconds: 7,  runs: 1, pay: 8,  rate: 0.50 },
    4: { lineSeconds: 11, runs: 2, pay: 12, rate: 0.25 },
    5: { lineSeconds: 16, runs: 3, pay: 20, rate: 0.12 },  // a lake trout is a fight
    6: { lineSeconds: 22, runs: 4, pay: 80, rate: 0.00 }   // a sturgeon is an event
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
    '--keeper-shirt', '--keeper-cap', '--trophy', '--shop-beam', '--shop-wood'
  ];
  /* Anything NOT in that list comes back as #888 from css(), which is how a
     new colour quietly turns the shop's furniture grey. If you add a variable
     to index.html for the 3D world to use, it goes in here too. */
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

  /**
   * What a piece of treasure is called.
   *
   * Scans every table rather than taking one, because a job can name junk, a
   * valuable or a story piece and they live in separate lists. Falls back to
   * the id, which at least says something, rather than to "undefined".
   */
  function itemNameById(id) {
    if (!id) return 'it';
    const tables = D.ITEM_TABLE || {};
    for (const k of Object.keys(tables)) {
      const list = tables[k];
      if (!Array.isArray(list)) continue;
      const hit = list.find(it => (it.id || it) === id);
      if (hit) return hit.name || id;
    }
    return id;
  }
  function baitById(id) { return D.BAIT.find(b => b.id === id) || D.BAIT[0]; }
  function rodById(id)  { return D.RODS.find(r => r.id === id) || D.RODS[0]; }
  function biomeName(id) { return D.BIOMES[id] ? D.BIOMES[id].name : id; }
  /* ══════════════════════════════════════════════════════════════════════
     WHICH GAME THIS IS

     Two ladders exist. js/data.js has 31 hand-written jobs, all of them in
     Cattail Creek, which is what the engine used to run. content/quests.json
     has the game that was actually WRITTEN: ninety jobs down six zones, with
     a keeper for each, a story about the Marigold, and an authored place on
     the map for every one. js/quests.js translates the second into the shape
     of the first.

     The written one wins when it is there. data.js stays as the fallback for
     a checkout with no built content, because "the game quietly becomes a
     different, shorter game" is the worst way for that to fail - so the
     choice is made once, out loud, at load.
     ══════════════════════════════════════════════════════════════════════ */
  const LADDER = (function () {
    try {
      const built = RT.quests && RT.quests.build();
      if (built && built.missions && built.missions.length) {
        return { missions: built.missions, secrets: built.secrets || [],
                 source: 'content/quests.json' };
      }
    } catch (e) {
      console.warn('FishMaster: the written quests did not translate:', e);
    }
    console.error('FishMaster: no quests in RT.content - run tools/build_content.py');
    return { missions: [], secrets: [], source: 'none' };
  })();
  const MISSIONS = LADDER.missions;
  /* The eighteen you FIND. Off the ladder on purpose: stumbling on one must
     not advance the story, and missing one must not block it. */
  const SECRETS = LADDER.secrets;

  function missionByN(n) { return MISSIONS.find(m => m.n === n) || MISSIONS[0]; }
  const round1 = (v) => Math.round(v * 10) / 10;

  /** How far this rod throws, in world units. */
  function castRange(rodId) {
    /* Off the roster: how far the rod THROWS, in world units, converted from
       the distance in feet printed on the rod itself. A net does not throw at
       all - it scoops a few feet off the boards. */
    return rodById(rodId).castUnits || 2.5;
  }

  /**
   * How far off the route a shoal of this biome sits.
   *
   * The biome sets the ballpark — the shallows are near, the deep channel is
   * far — but a single fixed number per biome meant every shoal in a given
   * water sat at precisely the same distance, and so every cast there was the
   * same cast. `r` varies it, and one shoal in six is pushed to an extreme:
   * either right off the gunwale, or out near the limit of the throw.
   *
   * Called without an rng it returns the plain biome distance, which is what
   * the mission audit and the range checks want.
   */
  function shoalOffset() { return CFG.SHOAL_BASE; }

  /**
   * What kind of cast this distance is, for the rod in your hands.
   *
   * Relative, not absolute: 40 units is most of the starter rod's reach and a
   * gentle lob on the Lightkeeper, and the cue should say what it will feel
   * like rather than quote a number.
   */
  function castBand(dist) {
    const reach = (run && run.range) || castRange(bestRodId());
    const f = reach > 0 ? dist / reach : 0;
    if (f <= 0.30) return 'drop';
    if (f <= 0.72) return 'short';
    return 'long';
  }

  /**
   * Where the waterline is at a point on the route — the world's own answer.
   *
   * Uses the same shoreEdge() the bank geometry is swept from, so "this is dry
   * land" here means exactly the sand you can see. Returns Infinity if there
   * is no lake yet, which reads as "all water" and cannot produce a false
   * beach.
   */
  /** The roster: the fish, the items, the vessels, the gear. */
  function roster() {
    if (!roster._r) {
      roster._r = (RT.content && RT.content.roster) || { fish: [], vessels: [], rods: [] };
    }
    return roster._r;
  }

  /** The lake's chart. Everything about where things are comes through this. */
  function chart() {
    const lake = Scene && Scene.lake;
    /* BARNABY CLEARED THE JAM. One list, emptied here, and the log jam stops
       existing for the hull, the helm, the arrow, the minimap and the art
       together - they all read barriers off this one chart. Done at the door
       rather than in six places, and it is idempotent, so it does not matter
       how often this is called. */
    const L0 = (lake && lake.chart) || chart._c;
    if (L0 && L0.barriers && L0.barriers.length && isSolved()) L0.barriers.length = 0;
    if (lake && lake.chart) return lake.chart;
    /* Before the world is built - at the dock, in the shop - the chart is
       still wanted, so it is read straight from the content. */
    try {
      if (!chart._c && RT.content && RT.content.lake) {
        chart._c = RT.lake.chart(RT.content.lake);
      }
      return chart._c || null;
    } catch (e) { return null; }
  }

  /* FISHING OFF THE BOARDS is a choice made at the dock, for one trip. It was
     kept in the save, so a player who fished off the dock once had a game that
     believed they were standing on the planks for ever: no boat at the dock,
     no way to take one out, and a canoe in the save they could not reach. It
     is not a fact about the player, so it is not in the save. */
  let tripOnFoot = false;
  /* Whether the reason for the smaller boat has been said this session. */
  let towedSaid = false;

  /** Which vessel is being used, as a roster record. */
  function vessel() {
    const R = roster();
    const id = bestVesselId();
    return (R.vessels || []).find(v => v.id === id) ||
           (R.vessels || [])[0] || { id: 'foot', reach: 40, speed: 0 };
  }

  /** How far from the dock this vessel will go. */
  function reach() { return vessel().reach || 40; }

  function ownsVessel(id) { return (save.vessels || ['foot']).indexOf(id) >= 0; }

  /**
   * The water this vessel is FOR, both ends of it.
   *
   * Straight off the chart's own stages: the canoe is the shallow bay, the
   * kayak the drop-off, the motorboat the trench and everything short of it.
   * Only the deep end used to be enforced, so a canoe could paddle back into
   * two feet of weed and a kayak could sit in the lily pads - which made the
   * ladder a matter of range rather than of water. Both ends hold now.
   */
  function vesselBand() {
    const v = vessel();
    const stages = (RT.content && RT.content.lake && RT.content.lake.stages) || [];
    const st = stages.find(s => (s.vessel || 'foot') === v.id);
    const lo = st ? st.depthFt[0] : 0;
    const hi = v.maxDepthFt || (st ? st.depthFt[1] : 999);
    return { minFt: lo, maxFt: hi, name: v.name };
  }
  /* Round the dock every hull is welcome, whatever it draws: you have to be
     able to launch, and you have to be able to come home. */
  const HOME_WATER = 240;
  /**
   * The biggest thing you own - there is no reason to take a smaller one out.
   * Except when the job says so: the kayak recon happens while the motorboat
   * is on Walt's trailer.
   */
  /**
   * Is this boat in the water, or on Walt's trailer with the stern open?
   *
   * Owning a boat and being able to take it out stopped being the same thing
   * the moment the drive pin went. Reported: "after we drive the boat into
   * the fog and need a tow, I can immediately take the boat out again" - the
   * engine is dead in the words Walt says and fine in the game's arithmetic,
   * and the next job hands over a kayak precisely BECAUSE the motorboat is in
   * pieces.
   */
  function boatUsable(id) { return !!id && id !== save.towedBoat; }

  function bestVesselId() {
    /* On the boards on purpose. Picking the jetty rather than the boat means
       fishing on foot for this trip, whatever is tied up beside it - which is
       how you earn the price of a tank when the tin is empty. */
    if (tripOnFoot) return 'foot';
    const m = currentMission();
    if (m && m.target && m.target.vesselId && m.target.type === 'recoverItem' &&
        ownsVessel(m.target.vesselId) && boatUsable(m.target.vesselId)) {
      return m.target.vesselId;
    }
    let best = 'foot', far = -1;
    (roster().vessels || []).forEach(function (v) {
      /* A towed boat is skipped rather than refused, so the ladder simply
         drops a rung: the kayak, then the canoe, then the boards. Refusing
         outright would strand a player at the dock with nothing to press. */
      if (ownsVessel(v.id) && boatUsable(v.id) && (v.reach || 0) > far) {
        best = v.id; far = v.reach || 0;
      }
    });
    return best;
  }
  function ownsTool(id) {
    return (save.tools || []).indexOf(id) >= 0 || !!(save.gear && save.gear[id] > 0);
  }
  /**
   * Is there a magnet on the line?
   *
   * ON THE LINE, not in the box. A magnet job cannot be done with a lure tied
   * on, which is the whole reason the tackle box is a choice - and the reason
   * the brief says which one to take. Owning one used to be enough, so the
   * choice never mattered.
   */
  function hasMagnet() {
    const t = equippedTool();
    return !!(t && t.kind === 'magnet');
  }
  /** What this job needs on the line, if it needs anything in particular. */
  function jobWants() {
    const m = currentMission();
    const t = m && m.target;
    if (!t) return null;
    /* SCRAP COMES UP ON A MAGNET. "Trade five pieces of scrap to Walt" is
       handed in at the counter, so nothing here used to say what it needs -
       and a player who set out without a magnet on the line could fish all
       afternoon and bring back nothing that counted. It was finishable only
       by luck: the odd valuable comes up on a hook, and enough casts would
       eventually turn five of them over. */
    if (t.type === 'tradeScrap') return { kind: 'magnet', what: 'a magnet, to bring scrap up' };
    /* THE HEAVY MAGNET, for the ten unique finds - nothing lighter lifts
       them, and a player who set out with a lure on would fish for hours
       against odds of nil. The fish collection wants no particular thing,
       which is the whole game of it. */
    if (t.type === 'collectSet' && t.set === 'relics')
      return { kind: 'magnet', toolId: 'heavy_magnet', what: 'the Heavy Magnet' };
    if (t.type === 'recoverItem') {
      const rec = (D.ITEMS || []).find(i => i.id === t.itemId) || {};
      if (rec.netOnly) return { kind: 'net', what: 'the hand net' };
      return { kind: 'magnet', what: 'a magnet' };
    }
    /* Scrap to trade is scrap to FIND first, and nothing comes off the bottom
       without a magnet. */
    if (t.type === 'tradeScrap') return { kind: 'magnet', what: 'a magnet' };
    if (t.netOnly || m.kind === 'net') return { kind: 'net', what: 'the hand net' };
    if (t.speciesId || t.minDepthFt) {
      const f = t.speciesId ? fishById(t.speciesId) : null;
      /* THE DEEPER OF THE TWO. This asked only where the FISH starts, and a
         job can ask for the same fish out of deeper water than that: job 33
         wants lake trout from eighty feet, and a lake trout starts at fifty.
         So the check passed the Carbon Rod, which fishes seventy-five - a rod
         that physically cannot reach the water the job counts. Every trout it
         landed came from shallower than eighty and none of them counted, with
         no warning at any point. Reported: "I should be using the pro rod and
         it says the carbon rod is right for the job", and before that, "I
         caught a lake trout but it didn't count toward my 0/3". */
      const need = Math.max(f ? f.depthFt[0] : 0, t.minDepthFt || 0);
      if (need > 0) {
        return { kind: 'rod',
                 what: 'a rod that fishes ' + Math.round(need) + ' feet down',
                 minFt: need };
      }
    }
    return null;
  }
  /** Is the kit in the boat right for the job? Said plainly, never enforced. */
  /**
   * How much of what bites in this job's water would be the fish it asks for,
   * on a given lure. The best of the job's biomes, because that is the water
   * a player would fish.
   */
  function targetShareOn(m, baitId) {
    const t = m && m.target;
    if (!t || !t.speciesId) return 0;
    /* The rod IN THE BOAT, not the best one owned: rodOdds weights the pool
       by what the rod can hold, so asking with a different rod answers about
       a trip nobody is taking. */
    const rod = equippedRod().id;
    let best = 0;
    (targetBiomes(m) || []).forEach(function (b) {
      const pool = biteWeightedFishPool(b, baitId, rod) || [];
      let tot = 0, mine = 0;
      pool.forEach(function (x) { tot += x.w; if (x.f.id === t.speciesId) mine += x.w; });
      if (tot > 0 && mine / tot > best) best = mine / tot;
    });
    return best;
  }

  function kitCheck() {
    const rod0 = equippedRod();
    /* A NET CATCHES MINNOWS AND SHINERS. Nothing else, ever - the pool is
       filtered on it - so carrying one on a job about anything bigger is not
       a slow afternoon, it is an impossible one, and the check said nothing
       unless the job happened to name a net itself. */
    const netJob = (function () {
      const m = currentMission();
      const t = m && m.target;
      return !!(t && (t.netOnly || m.kind === 'net' ||
                      (t.type === 'recoverItem' &&
                       ((D.ITEMS || []).find(i => i.id === t.itemId) || {}).netOnly)));
    })();
    if (rod0.isNet && !netJob) {
      return { ok: false, need: 'a rod',
               why: 'A net only ever brings up minnows and shiners.' };
    }
    /* A MAGNET FIRST OF ALL. No fish in this lake will take one - the bite
       pool filters it out - so a magnet on a job about fish is not a slow
       afternoon, it is a guaranteed blank. Reported on the pike job, where
       the check said nothing because I had written it to skip the whole
       question whenever a magnet was on. */
    const m0 = currentMission();
    const t0 = (m0 && m0.target) || {};
    const wantsFish = !!(t0.speciesId ||
                         t0.type === 'catchCount' || t0.type === 'catchWeight' ||
                         t0.type === 'catchWeightOne' || t0.type === 'catchLength');
    if (hasMagnet() && wantsFish && !t0.netOnly) {
      return { ok: false, need: 'a lure',
               why: 'Nothing with fins will take a magnet.' };
    }
    /* THEN THE LURE. A rod one class light still lands fish now and then; a
       lure the fish will not take lands nothing at all, so this is the thing
       most worth being told before you row out. */
    const wantLure = m0 && m0.target && lureFor(m0.target.speciesId);
    if (wantLure && !hasMagnet()) {
      const on = equippedBait();
      if (!(on && on.biasTable && on.biasTable[m0.target.speciesId])) {
        const f0 = fishById(m0.target.speciesId);
        return { ok: false, need: 'the ' + wantLure.name,
                 why: withArticle((f0 && f0.name) || 'fish') + ' will not take ' +
                      ((on && on.name) ? 'the ' + on.name : 'that') + '.' };
      }
    }
    /* A LURE THAT WORKS AGAINST THE JOB.
       The panfish - sunfish, perch, crappie, walleye - have no lure of their
       own on purpose: they take whatever is on the hook, which is what keeps
       the free worms worth having. But a lure with a bias for something ELSE
       in the same water does not leave them alone, it buries them. On job 7
       crappie are a third of what bites on a worm and a twelfth of it on live
       shiners - which are made for the bass in that same bay - and the box
       said "what you are carrying will do it". Reported: "black crappie on
       mission 7 should be using worms... it says shiners are ready for the
       job... I didn't catch a single crappie with shiners."
       Every other test above asks whether the box CAN do the job. This one
       asks whether it is quietly costing you the afternoon, which is the
       thing a player cannot see. Doubling, not any improvement at all -
       nagging over a few percent would make the warning worthless. */
    if (m0 && m0.target && m0.target.speciesId && !hasMagnet() && !rod0.isNet) {
      const onNow = targetShareOn(m0, equippedBaitId());
      let betterId = null, betterShare = onNow;
      (save.baits || []).forEach(function (id) {
        const sh = targetShareOn(m0, id);
        if (sh > betterShare * 2) { betterShare = sh; betterId = id; }
      });
      if (betterId) {
        const b2 = baitById(betterId), f2 = fishById(m0.target.speciesId);
        return { ok: false, need: 'the ' + b2.name,
                 why: withArticle((f2 && f2.name) || 'that fish') + ' mostly ignores the ' +
                      equippedBait().name + ' - it is made for something else in that water.' };
      }
    }

    const want = jobWants();
    if (!want) return null;
    const rod = rod0, tool = equippedTool();
    if (want.kind === 'net' && !rod.isNet)
      return { ok: false, need: 'the hand net', why: 'This one is netted, not hooked.' };
    if (want.kind === 'magnet' && !(tool && tool.kind === 'magnet'))
      return { ok: false, need: 'a magnet', why: 'Nothing comes up off the bottom without one.' };
    /* AND THE RIGHT MAGNET. The ten unique finds come up on the heavy one and
       on nothing else - rollRelicBite() asks for that tool by name - so going
       out on a lighter magnet is an afternoon that cannot produce a single
       one of them, with the check waving you off the dock. The same shape of
       dead end as a rod that cannot reach the depth the job counts. */
    if (want.kind === 'magnet' && want.toolId && (!tool || tool.id !== want.toolId)) {
      const need = (roster().tools || []).find(function (x) { return x.id === want.toolId; });
      return { ok: false, need: 'the ' + ((need && need.name) || want.toolId),
               why: 'Nothing lighter will lift those off the bottom.' };
    }
    /* AND THE LINE HAS TO REACH THE BOTTOM.
       A salvage job happens at ONE marked place with a known depth, and a
       magnet that cannot be lowered to the bottom cannot drag it. jobWants()
       returns early for recoverItem - "a magnet", and nothing about depth -
       so the box was passed as fine on job 19 with a rod that fishes
       thirty-five feet over fifty-five feet of water, and the game then
       flashed LINE TOO SHORT on every cast. Reported: "Mission 19 says the
       rod won't go deep enough but it says it's the right one for the job...
       we are stuck at Mission 19 with no rod to be able to do the job."
       The ladder was always built for this: the deepest salvage place is
       seventy-four feet, the Carbon Rod fishes seventy-five, it goes on the
       shelf at job 16 - the job before the first deep one - and by job 19 the
       jobs have paid out well over its seventy-five dollars. Nobody has to be
       stuck; they only had to be told. Now they are told at the slip, and
       kitFix offers the rod from the locker.
       Only where the job HAS a place: "trade five scrap" and the ten relics
       come up off any bottom, so they get no depth to meet. Netted litter
       floats and is exempt by being want.kind 'net'. */
    if (want.kind === 'magnet') {
      const pl = placeShoal();
      if (pl && pl.ft > rod.reachFt) {
        return { ok: false,
                 need: 'a rod that fishes ' + Math.round(pl.ft) + ' ft down',
                 why: 'The ' + rod.name + ' only fishes ' + rod.reachFt +
                      ' feet and that lot is lying in ' + Math.round(pl.ft) + '.' };
      }
    }
    if (want.kind === 'rod' && rod.isNet)
      return { ok: false, need: 'a rod', why: 'A net will not take a fish this size.' };
    if (want.kind === 'rod' && want.minFt && rod.reachFt < want.minFt)
      return { ok: false, need: 'a rod that fishes ' + Math.round(want.minFt) + ' ft down',
               why: 'The ' + rod.name + ' only fishes ' + rod.reachFt + ' feet.' };
    return { ok: true };
  }

  /**
   * The kit already in the locker that would answer the check.
   *
   * kitCheck() says what is WRONG. This says whether anything you already OWN
   * would put it right, and what would have to move - so the warning at the
   * slip can offer to do it there and then, instead of sending somebody back
   * through the shop to find the tackle box on the wall. That round trip is
   * four cards deep and it is where the job gets lost: asked for on behalf of
   * players who set out, are told the lure is wrong, and cannot hold on to
   * why they went inside by the time they get there.
   *
   * Owning is the whole test. Where the answer is a lure that has not been
   * bought, the shop really is the only place to get it, this returns null,
   * and the warning goes on saying so.
   *
   * Returns null when nothing is wrong, or when nothing owned would fix it.
   */
  function kitFix() {
    const bad = kitCheck();
    if (!bad || bad.ok) return null;

    const rod0 = save.kitRodId || '', bait0 = save.kitBaitId || '', tool0 = save.kitToolId || '';
    const wasRod = equippedRod(), wasBait = equippedBait(), wasTool = equippedTool();

    const baits = (save.baits || []).slice();
    const magnets = (roster().tools || []).filter(function (t) {
      return ownsTool(t.id) && t.kind === 'magnet';
    });

    /* THE SMALLEST CHANGE THAT WORKS, and then the BEST one.
       The rod already in the boat is tried first, so a lure problem is never
       answered by swapping the rod as well. When that rod is itself the
       problem, the rest go longest-reaching first: kitCheck() only asks for a
       minimum, so taking the first that scrapes past it meant standing on job
       40 with a Pro Rod in the locker and being told to fit the bamboo. Nets
       last, because a net is only ever right for a job that asks for one, and
       the check will say so. */
    const rodIds = (D.RODS || []).filter(function (r) { return ownsRod(r.id); })
                                 .map(function (r) { return r.id; });
    rodIds.sort(function (a, b2) {
      if (a === rod0 || b2 === rod0) return (b2 === rod0 ? 1 : 0) - (a === rod0 ? 1 : 0);
      const ra = rodById(a), rb = rodById(b2);
      if (!!ra.isNet !== !!rb.isNet) return ra.isNet ? 1 : -1;
      return (rb.reachFt || 0) - (ra.reachFt || 0);
    });

    /* And on the line, the game's OWN best answer first: an empty kitBaitId
       means equippedBait() picks the best lure it owns for this job, which is
       a better choice than whichever line happens to sort first. The explicit
       ones follow for the jobs that empty cannot satisfy, and the magnets
       after those, because a magnet takes the lure off. */
    const lines = [];
    const seen = {};
    const addBait = function (id) {
      if (!id || seen['b' + id]) return;
      seen['b' + id] = 1; lines.push({ baitId: id });
    };
    const addTool = function (id) {
      if (!id || seen['t' + id]) return;
      seen['t' + id] = 1; lines.push({ toolId: id });
    };
    /* THIS JOB'S OWN LURE, FIRST OF ALL. The check is a MINIMUM - it asks
       whether the box can do the job at all, not whether it is the right box -
       so anything that merely passes it was being fitted and called done.
       Reported after the card packed a Deep Rig for the cisco job: legal, and
       nothing a cisco would look at. Where the fish has a lure made for it,
       that lure is the answer and nothing else is. */
    const mLure = currentMission();
    const wantLure = mLure && mLure.target && lureFor(mLure.target.speciesId);
    if (wantLure && ownsBait(wantLure.id)) addBait(wantLure.id);
    /* Then the game's own pick - an empty kitBaitId means equippedBait()
       chooses the best lure owned for this job, which is the same answer by a
       different route on every job that has one. */
    lines.push({ none: true });
    addBait(bait0);
    baits.forEach(addBait);
    addTool(tool0);
    magnets.forEach(function (t) { addTool(t.id); });

    let hit = null;
    for (let i = 0; i < rodIds.length && !hit; i++) {
      for (let j = 0; j < lines.length && !hit; j++) {
        save.kitRodId = rodIds[i];
        save.kitBaitId = lines[j].baitId || '';
        save.kitToolId = lines[j].toolId || '';
        /* NULL IS A PASS. kitCheck() returns null when the job asks nothing
           of the box at all - castOff() reads it that way, warning only on a
           definite `!ok` - and testing for `c.ok` alone threw away every
           good answer on the jobs that name no gear. It made the offer
           vanish on exactly the workshop and hand-in jobs where somebody had
           rowed back in with a magnet still on. */
        const c = kitCheck();
        if (!c || c.ok) {
          hit = { rodId: rodIds[i], baitId: lines[j].baitId, toolId: lines[j].toolId,
                  rod: equippedRod(), bait: equippedBait(), tool: equippedTool() };
        }
      }
    }
    /* Put the box back exactly as it was. Nothing above is a decision, it is
       a search, and a search must not change the thing it searches. */
    save.kitRodId = rod0; save.kitBaitId = bait0; save.kitToolId = tool0;
    if (!hit) return null;

    /* Name only what actually MOVES. Offering to fit a rod that is already in
       the boat reads as the game not knowing what you are carrying. */
    const lineOf = function (tool, bait) {
      return tool ? tool.name : ((bait && bait.id !== 'none') ? bait.name : null);
    };
    const lineWas = lineOf(wasTool, wasBait), lineNow = lineOf(hit.tool, hit.bait);
    const rodMoves = hit.rod.id !== wasRod.id;
    const lineMoves = lineNow !== lineWas;
    if (!rodMoves && !lineMoves) return null;

    const bits = [];
    if (rodMoves) bits.push('the ' + hit.rod.name);
    if (lineMoves && lineNow) bits.push('the ' + lineNow);
    const what = bits.join(' and ');

    return {
      rodId: hit.rodId, baitId: hit.baitId, toolId: hit.toolId,
      rodName: hit.rod.name, lineName: lineNow,
      rodMoves: rodMoves, lineMoves: lineMoves,
      what: what, why: bad.why,
      label: 'Put ' + what + ' on',
      speech: 'Put ' + what + ' on and go. ' + bad.why +
              ' It changes here, so there is no trip back to the shop.'
    };
  }

  /**
   * Fit what kitFix() found.
   *
   * Here rather than on the screen, because equipKit() takes a lure OR a
   * magnet and quietly takes the other off - passing both would set one and
   * then undo it, and nothing on a card should have to know that.
   */
  function applyKitFix(fix) {
    if (!fix) return null;
    if (fix.toolId) return equipKit(fix.rodId, undefined, fix.toolId);
    if (fix.baitId) return equipKit(fix.rodId, fix.baitId, undefined);
    /* Nothing named on the line: clear BOTH, and equippedBait() goes back to
       picking the best lure owned for the job. */
    return equipKit(fix.rodId, '', '');
  }

  /**
   * Is this gear on Walt's shelf yet?
   *
   * The ladder decides, not the wallet. Each quest lists what it puts out on
   * the counter (`sells` in content/quests.json), so the canoe appears with
   * the job about saving for a canoe and the heavy magnet with the job that
   * needs one. Before that it is not for sale at any price - being able to buy
   * the motorboat on the first morning is not a shortcut, it is the game's
   * whole shape gone. What a quest HANDS you (the net, the magnets, the pro
   * rod) is never on the shelf at all.
   */
  /** Is this shop line a boat? Boats are earned, everything else is stocked. */
  function vesselSold(id) {
    return (roster().vessels || []).some(function (v) { return v.id === id; });
  }
  function unlockedIds() {
    const upto = Math.max(save.currentMission || 1, save.highestMission || 1);
    if (unlockedIds._n === upto && unlockedIds._c) return unlockedIds._c;
    const out = {};
    for (const m of MISSIONS) {
      if (m.n > upto) break;
      (m.sells || []).forEach(id => {
        /* A BOAT IS THE REWARD FOR THE JOB, not stock to browse during it.
           The three that sell one are all named for saving up for it - The
           Canoe Fund, The Kayak Goal, Motorboat Savings - and every one of
           them had its boat on the counter before a stroke of the work was
           done. The canoe costs twenty dollars against the ninety-five you
           have by then, so it was simply handed over as the job began.
           A rod is the opposite: job two sells the bamboo rod and job two is
           catching sunfish with it, so that has to be there from the start. */
        if (m.n >= upto && vesselSold(id)) return;
        out[id] = 1;
      });
    }
    unlockedIds._n = upto;
    unlockedIds._c = out;
    return out;
  }
  function isUnlocked(id) { return !!unlockedIds()[id]; }

  /**
   * What the job in hand has put on Walt's counter, if you can afford it.
   *
   * The jobs called The Canoe Fund and Motorboat Savings are ABOUT affording
   * a thing, so the moment it is affordable the man who set the job should be
   * the one to offer it - across his own counter, in his own words. The
   * tackle wall stays a shelf to browse; this is the one purchase the story
   * just asked for, and it is one press instead of three.
   */
  function nextOffer() {
    const upto = Math.max(save.currentMission || 1, save.highestMission || 1);
    for (const m of MISSIONS) {
      if (m.n > upto) break;
      for (const id of (m.sells || [])) {
        const v = (roster().vessels || []).find(x => x.id === id);
        /* Not while the job that earns her is still open - see unlockedIds. */
        if (v && m.n >= upto) continue;
        if (v && !ownsVessel(id)) {
          return { kind: 'vessel', id: id, name: v.name, cost: v.price || 0,
                   rental: !!v.rental, note: v.note || '',
                   affordable: save.money >= (v.price || 0) };
        }
        const r = D.RODS.find(x => x.id === id);
        if (r && !ownsRod(id)) {
          return { kind: 'rod', id: id, name: r.name, cost: r.cost || 0,
                   rental: false, note: r.reachNote || '',
                   affordable: save.money >= (r.cost || 0) };
        }
        const t = (roster().tools || []).find(x => x.id === id);
        if (t && !ownsTool(id)) {
          return { kind: 'tool', id: id, name: t.name, cost: t.price || 0,
                   rental: false, note: t.note || '',
                   affordable: save.money >= (t.price || 0) };
        }
      }
    }
    return null;
  }

  /** Take Walt up on it. */
  function takeOffer() {
    const o = nextOffer();
    if (!o || !o.affordable) return null;
    const got = o.kind === 'vessel' ? buyVessel(o.id)
              : o.kind === 'rod' ? buyRod(o.id) : buyTool(o.id);
    return got ? Object.assign({}, got, { rental: o.rental }) : null;
  }

  /** The next vessel up the ladder, for the counter. */
  function nextVessel() {
    const cur = vessel();
    const v = (roster().vessels || []).find(x => !ownsVessel(x.id) && isUnlocked(x.id) &&
                                                 (x.reach || 0) > (cur.reach || 0));
    if (!v) return null;
    return { id: v.id, name: v.name, cost: v.price || 0, note: v.note || '', rental: !!v.rental };
  }
  function buyVessel(id) {
    const v = (roster().vessels || []).find(x => x.id === id);
    if (!v || ownsVessel(id) || !isUnlocked(id) || save.money < (v.price || 0)) return null;
    save.money -= v.price || 0;
    save.vessels = (save.vessels || ['foot']).concat([id]);
    save.vessel = id;
    /* A NEW BOAT IS A NEW BOAT. Wear is one number for whatever you are
       sitting in, so the scuffs a kayak collected over a thousand units were
       still on the meter the moment the motorboat came off the shelf -
       reported as "it still shows the HP from the kayak". Buying one resets
       it, which is also the only sensible reading of a thousand dollars.
       (One number, so going back to the old boat finds it sound as well.
       Walt has had it on the bench all this time - that is the fiction, and
       it is a kinder one than a hull that repairs itself while you paddle.) */
    if (v.durability && RT.economy && RT.economy.newHull) RT.economy.newHull();
    persist();
    pushHud();
    return { kind: 'vessel', id: v.id, name: v.name, cost: v.price || 0, note: v.note || '' };
  }
  /** The next tool on the shelf you do not have. Never the sonar - that is built. */
  function nextTool() {
    const t = (roster().tools || []).find(x => !x.owned && !x.crafted && !ownsTool(x.id) && isUnlocked(x.id));
    if (!t) return null;
    return { id: t.id, name: t.name, cost: t.price || 0, note: t.note || '' };
  }
  function buyTool(id) {
    const t = (roster().tools || []).find(x => x.id === id);
    if (!t || t.crafted || ownsTool(id) || !isUnlocked(id) || save.money < (t.price || 0)) return null;
    save.money -= t.price || 0;
    save.tools = (save.tools || []).concat([id]);
    persist();
    pushHud();
    return { kind: 'tool', id: t.id, name: t.name, cost: t.price || 0, note: t.note || '' };
  }

  /** How fast it travels. Nought means you are standing on the boards. */
  function boatSpeed() { return vessel().speed || 0; }

  /**
   * How shallow this vessel can go before it grounds.
   *
   * A canoe draws almost nothing and a motorboat wants a couple of feet under
   * it, which is a real difference on a lake with a shelf all round it - and
   * it is why you can take a canoe into the lily pads and not the motorboat.
   */
  function draughtFt() {
    const v = vessel();
    if (v.id === 'foot') return 0;
    if (v.id === 'motorboat') return 2.2;
    return 0.9;
  }

  /**
   * Is this a place a cast could catch anything?
   *
   * On the rail this asked how far the waterline was; on a lake it asks how
   * deep it is, which is the same question asked of the thing that actually
   * knows. Fish need water: past the waterline is the beach, and a foot of
   * water over a shelf is not fishable either.
   */
  const MIN_FISHABLE_FT = 0.8;
  function fishableAt(x, z) {
    const L = chart();
    if (!L) return true;                  // no chart yet: never a false beach
    return L.depthAt(x, z) >= MIN_FISHABLE_FT;
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
    const KNOWN = ['catchCount', 'catchWeight', 'catchWeightOne', 'catchLength',
                   'recoverItem', 'reachSpot', 'ringBell', 'tradeScrap', 'ownVessel',
                   'ownTool', 'repairVessel', 'clearDebt', 'freeRoam',
                   /* The two after the end: ten fish in no book, ten things
                      somebody lost. */
                   'collectSet'];
    if (!MISSIONS.length) problems.push('no quests - is js/content.generated.js built?');
    for (const m of MISSIONS) {
      const t = m.target || {};
      if (KNOWN.indexOf(t.type) < 0) problems.push(m.id + ': unknown need ' + t.type);
      if (t.speciesId && !D.FISH.find(f => f.id === t.speciesId))
        problems.push(m.id + ': unknown species ' + t.speciesId);
      if (t.itemId && !(D.ITEMS || []).find(i => i.id === t.itemId))
        problems.push(m.id + ': unknown item ' + t.itemId);
      /* A COLLECTION HAS TO BE COLLECTABLE. Ten is written in the job and the
         ten things are written in the roster, in two different files - so a
         job asking for ten of a set with nine in it would be a job that can
         never be handed in, which is exactly what this audit is for. */
      if (t.type === 'collectSet') {
        const pool = t.set === 'relics'
          ? ((D.ITEM_TABLE || {}).relic || [])
          : D.FISH.filter(f => f.mystery);
        if (pool.length < (t.amount || 1))
          problems.push(m.id + ': asks for ' + t.amount + ' of set "' + t.set +
                        '" and the roster holds ' + pool.length);
      }
      if (t.vesselId && !(roster().vessels || []).find(v => v.id === t.vesselId))
        problems.push(m.id + ': unknown vessel ' + t.vesselId);
      if (t.toolId && !(roster().tools || []).find(v => v.id === t.toolId))
        problems.push(m.id + ': unknown tool ' + t.toolId);
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
  /* 3: Whispering Lake. A version-2 save is the six-zone game's and does not
     carry over - the money and gear mean different things now. */
  const SAVE_VERSION = 3;

  function defaultSave() {
    return {
      version: SAVE_VERSION,
      /* Which zone you are in. Only Cattail Creek is reachable so far, but the
         map, the loop, the keeper, the chart and the dock name are all read
         per zone already, so travel is a matter of changing this and rebuilding
         rather than of adding a concept. An older save simply gets the default
         back from Object.assign, so no version bump. */
      currentMission: 1,
      highestMission: 1,
      progressValue: 0,      // persists across trips, so going in is never a loss
      /* Which items this job has already had up on the magnet. Only used by
         `distinct` retrievals, and cleared with the job. */
      recovered: [],
      /* What has been DONE, as opposed to caught: rescues made, story beats
         heard, secrets found. A flag is set once and kept, because a rescue
         you made is a rescue you made - it must survive going in to the dock,
         and it must not be undone by starting the next job. */
      flags: {},
      grantTaken: 0,         // mission whose gear has been collected
      hold: [],              // caught but not yet sold — see sellCatch()
      money: 5,
      lifetimeEarned: 0,
      /* What you go out IN, and everything you have bought to go out in: the
         ladder from the boards to the motorboat. */
      vessel: 'foot',
      vessels: ['foot'],
      /* Tools off Walt's shelf: the magnets, and the sonar once it is built. */
      tools: ['tagging_tool'],
      /* Story pieces on the workbench. Never sold. */
      items: [],
      /* The logbook. Tags clipped this trip and not yet uploaded, then every
         tag ever - a fish that went back is still a fish you can point to. */
      pendingTags: [],
      tags: [],
      /* Something took the hook and the float. Until Walt sets you up again
         there is nothing on the end of the line to fish with. */
      tackleBroken: false,
      tackleBreaks: 0,
      /* THE BOAT WALT TOWED IN. Set to a vessel id when a job ends with the
         engine dead at the end of his line, and cleared when he takes the job
         in - which is the moment he has actually looked at it. While it is
         set that boat is not in the water, so the ladder drops back to the
         one below it: the trench is out of reach, and the next job hands you
         a kayak because the motorboat is in pieces on the hard. An old save
         has never seen this field, gets '' from Object.assign, and behaves
         exactly as it did. */
      towedBoat: '',
      /* Walt's map of the lake, handed over in the first conversation. Until
         then Options has no map on it, because you have not got one. */
      hasMap: false,
      /* Never written any more - see tripOnFoot. Named here so an old save
         carrying a stuck `true` is overwritten rather than believed. */
      onFoot: false,
      /* WHAT YOU TOOK OUT. One rod (or the net), one lure, one tool. Empty
         means "whatever is best", which is what a new player gets until they
         have a reason to choose. */
      kitRodId: '', kitBaitId: '', kitToolId: '',
      scrapTraded: 0,
      repairs: 0,
      title: '',
      /* Tier owned in each shop line, 0 for none. An older save simply gets
         the default object back from Object.assign, so nothing needs a save
         version bump. */
      gear: {},
      /* The rods actually owned, oldest first. Everyone starts with the one
         that came with the boat; the rest are bought. What you FISH with is
         the best of these (bestRod), not whatever rod the mission happens to
         name - a mission names the rod it was balanced around, and that is a
         target to reach, not a loan. */
      rods: [],                // Walt lends the net with the first job
      /* And the lures. The plain worm comes in the box and is free forever;
         every other one is bought. What is ON THE HOOK is the best of these
         for the job in hand - never a lure the shop has not sold you. */
      baits: [],               // the worms come with the bamboo rod
      /* The job whose brief you have heard from Walt. A job you have not been
         told about is not a job yet - the HUD says to go and see him. */
      briefed: 0,
      /* THE MYSTERY IS SOLVED - the bell is rung, the fog is off the water
         and Barnaby has pulled the jam apart. Not the same thing as having
         finished every job: there are two left after this, and they are the
         reason the lake is worth having open. */
      solved: false,
      /* WHAT IS FOUND ONCE AND NEVER AGAIN. Ten fish that are in no book and
         ten things somebody lost, both kept for good - "once we get the
         unique fish or the unique items then we shouldn't be able to catch
         them again". */
      mysteryFish: [],
      relics: [],
      completed: false,      // the Dingus is caught; the lake is open
      creel: [],
      best: {},
      /* The arrow that points at the job. On, because a lake with no
         landmarks is a lot to hold in your head. */
      helper: true,
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
    /* Empty is a real state now: you start with nothing and Walt hands you the
       net. Only a broken save gets repaired, and it is repaired to nothing. */
    if (!Array.isArray(save.rods)) save.rods = [];
    if (!Array.isArray(save.baits)) save.baits = [];
    const m = missionByN(save.currentMission) || {};
    if (m.rodId && save.rods.indexOf(m.rodId) < 0) save.rods.push(m.rodId);
    if (m.baitId && save.baits.indexOf(m.baitId) < 0) save.baits.push(m.baitId);
    /* THE MAP, FOR A GAME ALREADY IN PROGRESS. Walt hands it over at the end
       of the first conversation - which somebody twelve jobs deep has already
       had, and will never have again. Without this they would never get a map
       at all, and Options would be missing a row for the rest of the game. */
    if (!save.hasMap && (save.briefed || 0) >= 1) save.hasMap = true;
    /* A BOAT LEFT ON THE TRAILER FOREVER.
       The fog job takes the motorboat off you and the counter gives it back -
       but only if the job is handed in while that code is running. A save that
       got the flag and then moved on some other way keeps it for good, and a
       kayak cannot reach the water job 33 is about: the helper finds no shoal
       out there, falls back to open water, and the trout card never appears
       again. Reported exactly that way, and it is a dead end - the ladder
       cannot be finished from inside it.
       So: once the job that took the boat is behind you, you have it back.
       Nothing else can clear it and nothing else needs to. */
    if (save.towedBoat) {
      let inc = 0;
      for (let n = 1; n <= 90; n++) {
        const q = missionByN(n);
        if (q && q.kind === 'incident') { inc = q.n; break; }
      }
      if (inc && (save.currentMission || 1) > inc) save.towedBoat = '';
    }
    return save;
  }
  function persist() { U.save(SAVE_KEY, save); }
  function resetProgress() { save = defaultSave(); persist(); }
  function getSave() { return save; }

  /**
   * The board. The main line, and the finale only once it is due.
   *
   * `hidden` is what keeps the last job off the board until the one before it
   * is handed in - the Dingus is a rumour until it is a job. Secrets are never
   * on the board at all: they are found, not given.
   */
  function visibleMissions() {
    return MISSIONS.filter(m => !m.hidden || save.highestMission >= MISSIONS.length);
  }
  /* Once the Dingus is caught there is no next mission - and being parked
     forever on a job already finished is a sour way to end a fishing game. So
     the ladder is replaced by open water: the best gear, the whole lake, and
     nothing to complete. Everything else in the game (spots, bites, the shop,
     the hold) carries on working exactly as it did. */
  /* FREE FISHING, after the last job. Its gear and its water were written
     against a roster that no longer exists - a 'titanium' rod, a secret pill
     for bait, and five biomes that were replaced by depth bands - so the one
     mode you unlock by finishing the game was pointing at nothing at all. */
  const FREE_ROAM = {
    n: 0,
    rodId: 'pro_rod',
    baitId: 'deep_rig',
    biomes: ['shoreline', 'bay', 'dropoff', 'trench'],
    target: { type: 'freeRoam', amount: Infinity },
    text: 'Fish wherever you like',
    free: true
  };

  function isFinished() { return !!save.completed; }
  /**
   * Is the mystery solved - is this the quiet lake?
   *
   * The bell rung, the fog off the water, the jam pulled apart by the thing
   * that put half of it there. Read by the weather, the chart, the hull and
   * the bite roll, so all four agree about which lake this is.
   */
  function isSolved() { return !!save.solved; }
  /** The set a collection job is counting: ten fish, or ten unique finds. */
  function setHeld(which) {
    if (which === 'relics') return save.relics || (save.relics = []);
    return save.mysteryFish || (save.mysteryFish = []);
  }

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
      return { kind: 'bait', id: b.id, name: b.name,
               cost: Math.round(b.costPerUnit * BAIT_GRANT_MULT),
               note: 'A better lure for the water ahead.',
               description: baitBlurb(b), art: baitArtSrc(b) };
    }
    return null;
  }

  /** Everything the shop needs to know about turning the trip in. */
  /**
   * What you are actually putting on the counter, when a job wants THINGS.
   *
   * Reported on the sonar build: the hand-in went straight from "bring me
   * three heavy pieces of scrap" to the next job, with nothing in between
   * saying the iron was in the boat - so the one moment the player's own
   * work should have been acknowledged read as the game skipping a step.
   *
   * Returns a sentence to say before he takes them, or null when the job is
   * not about carrying something in.
   */
  function haveTheParts(m) {
    const t = (m && m.target) || {};
    if (t.type === 'tradeScrap') {
      const held = (save.hold || []).filter(function (x) {
        return x.type === 'valuable' || x.type === 'scrap';
      }).length;
      const traded = save.scrapTraded || 0;
      const want = t.amount || 1;
      if (held > 0)
        return 'You lift ' + (held === 1 ? 'the piece' : 'all ' + held + ' pieces') +
               ' of iron out of the boat and set them on the counter.';
      if (traded >= want)
        return 'The iron he wants is already on his bench - ' + want +
               ' pieces of it, off the bottom of this lake.';
      return null;
    }
    if (t.type === 'recoverItem' && t.itemId && save.progressValue >= (t.amount || 1))
      return 'You have the ' + itemNameById(t.itemId) + ' with you.';
    if (t.type === 'collectSet') {
      const got = setHeld(t.set).length;
      if (got < (t.amount || 1)) return null;
      return t.set === 'relics'
        ? 'You set all ten of them out along the counter.'
        : 'All ten are in the logbook, tagged and back in the water.';
    }
    return null;
  }

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
      canTurnIn: done && isBriefed(),
      briefed: isBriefed(),
      /* Money in the tin and the thing on the shelf: that is the whole test.
       *
       * It used to need the JOB finished as well, which produced the worst
       * kind of shop - "CastMaster 3000, $150" on the wall, $200 in your
       * pocket, and no way to buy it and no plain statement of why. The gate
       * was there to stop anyone starting the next mission without its gear,
       * and canTurnIn already does that job on its own: the job cannot be
       * handed in until the gear is bought, whenever it was bought. */
      canTakeGrant: !!grant && affordable && !grantTaken,
      isLast: m.n >= MISSIONS.length
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
    /* The sonar is the one tool that changes the fishing itself: it calls
       shoals sooner and cuts the empty hooks. A magnet changes what comes up,
       not how often. */
    if (id === 'finder' && ownsTool('acoustic_sonar')) return { window: 1.6, lead: 4, junk: 0.55 };
    return {};
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
    /* NO ADVICE ABOUT A JOB YOU HAVE NOT BEEN GIVEN. This is where to fish
       and what to fish with FOR THE JOB IN HAND, and on a brand new save
       there is no job in hand - so the note read "go and see Walt" and then
       told you how to scoop minnows for the tank he has not mentioned yet. */
    if (!isBriefed()) return null;
    const m = run ? run.mission : currentMission();
    const want = m.target && m.target.speciesId ? fishById(m.target.speciesId) : null;
    const rod = equippedRod();

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
              'Jobs are what pay for it — hand the next one in and you are most of the way there.',
        speech: 'The ' + st.grant.name + ' is ' + st.short + ' dollars away. Catch a few ' +
                'Jobs are what pay for it. Hand the next one in.'
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
      const cls = rodClassOf(rod.id);
      if ((want.difficultyTier || 3) > cls) {
        const better = D.RODS.find(r => rodClassOf(r.id) >= (want.difficultyTier || 3));
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
    const raw = save.hold.reduce((n, x) => n + (x.value || 0), 0) +
                (save.pendingTags || []).reduce((n, t) => n + (t.bounty || 0), 0);
    return Math.round(raw * sellRate());
  }
  function holdCount() { return save.hold.length + (save.pendingTags || []).length; }
  function tagCount() { return (save.pendingTags || []).length; }

  /** The shop buys the lot. */
  /**
   * The counter: upload the logbook, hand over the scrap, put the artifacts on
   * the workbench. No money changes hands here - that comes with the job.
   */
  function sellCatch() {
    const total = holdValue();          // zero, and kept so the cards can say so
    const count = holdCount();
    if (!count) return null;
    // The best of the bunch, so the shopkeeper has something to remark on.
    const tags = (save.pendingTags || []).slice();
    const best = save.hold
      .concat(tags.map(t => ({ id: t.id, name: (fishById(t.id) || {}).name || t.id, value: t.bounty })))
      .sort((a, b) => b.value - a.value)[0];
    /* Scrap is traded, story pieces go on the workbench, the logbook is
       uploaded. One press, because it is one conversation at the counter. */
    save.items = save.items || [];
    save.hold.forEach(function (x) {
      if (x.storyPiece) { if (save.items.indexOf(x.id) < 0) save.items.push(x.id); }
      else if (x.type === 'valuable' || x.type === 'scrap') save.scrapTraded = (save.scrapTraded || 0) + 1;
    });
    save.tags = (save.tags || []).concat(tags);
    save.pendingTags = [];
    save.hold = [];
    /* The tab first. All of it, before a dollar reaches the tin. */
    const settled = RT.economy ? RT.economy.settle(total) : { kept: total, paid: 0 };
    save.money += settled.kept;
    save.lifetimeEarned += total;
    persist();
    return { total, count, best, tags: tags.length, paidDebt: settled.paid, kept: settled.kept };
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
  /** Money in, the tab first. Every dollar earned clears debt before it is yours. */
  function earn(n) {
    if (!(n > 0)) return 0;
    const settled = RT.economy ? RT.economy.settle(n) : { kept: n, paid: 0 };
    save.money += settled.kept;
    save.lifetimeEarned += n;
    return settled.kept;
  }

  /** What Walt hands over with a finished job, besides the words. */
  function grantRewards(m) {
    if (m.payout) earn(m.payout);
    if (m.grantsToolId && !ownsTool(m.grantsToolId)) save.tools = (save.tools || []).concat([m.grantsToolId]);
    if (m.grantsItemId && (save.items || []).indexOf(m.grantsItemId) < 0) save.items = (save.items || []).concat([m.grantsItemId]);
    if (m.addsDebt && RT.economy) { RT.economy.addDebt(m.addsDebt); save.flags = save.flags || {}; save.flags.hadDebt = 1; }
    /* AND HE FIXES THE BOAT. Handing the job in at the counter IS the
       conversation about the boat - it is where he says what is broken and
       what the tab will be - so the repair belongs here and nowhere else.
       The tab the job already carries is what it costs; there is no second
       bill for the same drive pin. */
    if (save.towedBoat) {
      const fixed = (roster().vessels || []).find(v => v.id === save.towedBoat);
      save.towedBoat = '';
      say('He puts a new drive pin in the ' + ((fixed && fixed.name) || 'boat') +
          ' while you stand there. She is yours again.');
    }
    /* ON THE HOUSE. Both of these have to be told out loud: a number in the
       corner of the screen quietly not going down is not a gift anybody
       notices. */
    if (m.freeRepair && RT.economy && RT.economy.repairPrice() > 0) {
      const paid = RT.economy.repairPrice();
      RT.economy.buyRepair(paid);
      /* AND IT COUNTS AS A REPAIR. buyRepair at the counter records one
         (save.repairs); this path went straight to the economy and did not,
         so a hull Walt patched on the house had never officially been
         repaired. "Kayak Care" then rested on the hull merely BEING sound -
         so scuff it again on the next trip and the job asked for a repair all
         over again, with the shop still showing a Repairs tile. Reported:
         "mission 20 was repair the kayak but I did that through Walt and the
         tackle shop still said I have repairs to do." Who paid for it is not
         the question the job is asking. */
      save.repairs = (save.repairs || 0) + 1;
      say('And he patches the hull while he is at it - ' + paid +
          ' dollars of work, on the house.');
    }
    if (m.freeFuel && RT.economy && RT.economy.gasPrice() > 0) {
      const tank = RT.economy.gasPrice();
      RT.economy.buyGas(tank);
      say('He fills the tank too. ' + tank + ' dollars, and he will not hear of it.');
    }
    if (m.awardsTitle) save.title = m.awardsTitle;
  }

  function turnInMission() {
    const st = turnInState();
    if (!st.canTurnIn) return null;
    const m = st.mission;
    save.progressValue = 0;
    /* Clear the magnet's memory with the job. "Bring me three different
       things" has to mean three different things on the NEXT job too. */
    save.recovered = [];
    save.grantTaken = 0;
    if (save.highestMission <= m.n) save.highestMission = m.n + 1;
    save.currentMission = Math.min(m.n + 1, MISSIONS.length);
    grantRewards(m);
    /* THE BELL OPENS THE LAKE. It used to end the game outright - completed,
       free roam, nothing further - which left the two jobs after it
       unreachable. Ringing the bell is the moment the fog lifts and the jam
       goes; the game is over when the LADDER is, two jobs later. */
    if (m.finale) save.solved = true;
    if (m.n >= MISSIONS.length) save.completed = true;
    persist();
    return { mission: m, grant: st.grant, finale: !!m.finale,
             /* WHAT YOU PUT ON THE COUNTER, so the hand-in acknowledges the
                work rather than jumping to the next job. */
             parts: haveTheParts(m),
             revealsSecret: !!m.revealsSecret, next: missionByN(save.currentMission) };
  }


  /* ── The dock's scannable things ──────────────────────────────────────── */

  const DOCK_LABELS = {
    shop: { label: 'Tackle Shop', speech: 'Tackle shop' },
    boat: { label: 'Take the Boat Out', speech: 'Take the boat out' },
    /* On foot the same pick means fishing off the boards. */
    fish: { label: 'Fish off the Dock', speech: 'Fish off the dock' },
    boards: { label: 'Fish off the Dock', speech: 'Fish off the dock, on foot' },
    /* The board is painted MAIN MENU, but a painted sign twenty units off is
       not readable and every other thing you can pick here says its name in
       type. So it gets a plate like the rest of them. */
    // The board is painted MAIN MENU, so it needs no floating plate.
    home: { label: 'Main Menu', speech: 'Main menu' }
  };

  /** The plate for a dock target - the boat's names the vessel you own. */
  function dockLabel(key) {
    if (key === 'boat') {
      const v = vessel();
      if (v.id === 'foot') return DOCK_LABELS.fish;
      return { label: 'Take the ' + (v.id === 'motorboat' ? 'Motorboat' : v.id === 'kayak' ? 'Kayak' : 'Canoe') + ' Out',
               speech: 'Take the ' + v.id + ' out' };
    }
    return DOCK_LABELS[key] || { label: key, speech: key };
  }

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
    /* THROUGH missionBrief, not the raw job. This read currentMission().text
       - the job itself - so on a brand new save the board said "go and see
       Walt" while the scan read the whole job out loud. There is one place
       that knows whether you have been told about a job and this is not it. */
    const note = missionBrief();
    const items = [{
      key: 'note', label: note.briefed ? 'Mission' : 'Go and See Walt',
      domId: 'dockHud', sub: '',
      speech: note.briefed ? ('Your mission note. ' + note.text)
                           : 'You have no job yet. Go and see Walt in the tackle shop.'
    }];
    /* `sceneIndex` is the item's place in the SCENE's target list, which is not
       its place in this one — the note comes first here and has no object out
       there at all. Without it the plates and the glow land one target off, so
       the sign ends up captioned "Tackle Shop". */
    RT.scene.dockTargets.forEach((t, k) => {
      const meta = dockLabel(t.key);
      items.push({ key: t.key, label: meta.label, sub: '', sceneIndex: k,
                   speech: meta.speech, quiet: !!meta.quiet, below: !!t.below });
    });
    items.push(optionsTarget());
    return items;
  }


  /** Step inside the tackle shop. */
  function enterShop() {
    run = null;
    paused = false;
    fire('onGuide', null);
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
    /* NO TIP ABOUT A JOB YOU HAVE NOT BEEN GIVEN. This is how to fish the job
       in hand - where the fish sit, what they take - and on a brand new save
       the note read "go and see Walt" and then told you how to scoop minnows
       for a survey tank nobody has mentioned. */
    if (!isBriefed()) return 'Walt is in the shop. He is the one with the jobs.';
    if (m && m.target && m.target.netOnly)
      return 'Scoop along the shoreline - minnows under the boards, shiners in the weed. A netful at a time.';
    const sp = m.target.speciesId ? fishById(m.target.speciesId) : null;
    if (!sp) return 'Anything counts for this one. Tag whatever takes it.';
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
    const rows = RT.scene.dockTargets.map((t, k) => {
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
                     (st.hold ? ' and take your record' : '') +
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
    rows.push(optionsTarget());
    return rows;
  }


  /** Everything the mission note shows, and the briefing behind it. */
  function missionBrief() {
    const st = turnInState();
    const m = st.mission;
    return {
      n: m.n, text: isBriefed() ? m.text : 'Go and see Walt in the tackle shop',
      briefed: isBriefed(),
      progress: st.progressText,
      done: st.done,
      /* WHAT IS PACKED, not what the job would like. This asked
         bestBaitFor(m) - the lure the JOB wants - and called it the
         inventory, so the note said "Live Shiners" while the rod was rigged
         with a magnet. equippedBait already knows that a magnet on the line
         means no lure on it; this simply asks it. */
      rod: equippedRod(), bait: equippedBait(),
      /* And the tool, which the note never carried at all - so the magnet on
         the line could not have appeared there even in principle. */
      tool: equippedTool(),
      /* Whether the box suits the job, so the note can say so without the
         player opening anything. */
      kitFit: kitCheck(),
      /* What the mission was balanced around, when that is not what you are
         carrying: the honest version of "this one is going to be hard". */
      wantedRod: rodClassOf(m.rodId) > rodClassOf(bestRodId())
                   ? rodById(m.rodId) : null,
      nextRod: nextRod(),
      gear: ownedGear(),
      rodArt: rodIconSrc(equippedRod()), baitArt: baitArt(bestBaitFor(m)),
      /* The lure this job was built around, when it is not the one on the
         hook: the honest "this is going to be slower than it should be". */
      /* THE LURE ITS FISH TAKES, from the roster - not something written on
         the job. A species that has a lure made for it is caught on that lure
         and on nothing else, so this is the difference between a trip and a
         wasted afternoon. */
      wantedBait: (function () {
        const w = m.target && lureFor(m.target.speciesId);
        return (w && !ownsBait(w.id)) ? w : null;
      })(),
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
        const dd = Math.hypot(sh.x - run.x, sh.z - run.z);
        /* The FISH's name, and called that. It was filed under `biome`, and
           every sentence built from it then read as though the fish were a
           place: "your fish are here, in the Black Crappie". */
        return { fish: sh.fishName || 'Fish', isTarget: sh.isTarget,
                 inRange: dd <= run.range, cooled: sh.caught >= CFG.SPOT_COOLOFF };
      });
    }
    const good = reach ? reach.filter(x => x.inRange && !x.cooled) : [];
    const mine = good.filter(x => x.isTarget);

    if (equippedRod().isNet) {
      const ft = chart() ? chart().depthAt(run.x, run.z) : 0;
      const shallow = ft > 0.3 && ft <= NET_MAX_FT;
      items.push({
        key: 'cast', label: 'Scoop the Net', sceneIndex: 0,
        sub: shallow ? 'Minnows in the shallows' : 'Too deep for a net',
        speech: shallow ? 'Scoop the net. Minnows and shiners in the shallows here.'
                        : 'Scoop the net. It is too deep for a net here - nothing will come up.'
      });
    } else {
      /* What is in reach, named as fish. */
      const names = (list) => list.map(x => x.fish).join(' and ');
      items.push({
        key: 'cast', label: 'Cast', sceneIndex: 0,
        sub: good.length
          ? (mine.length ? 'Your fish: ' + names(mine) : names(good))
          : 'Nothing in reach',
        speech: good.length
          ? ('Cast. ' + (mine.length
              ? names(mine) + ' \u2014 the ones you want \u2014 right here.'
              : names(good) + ' in reach.'))
          : 'Cast. Nothing in reach from here, but you can always try.'
      });
    }
    /* NOTHING ON THE LINE. Casting is not a choice with no hook on it, and
       from a boat the only way to Walt is to go back - so it is a row of its
       own rather than something to find inside Options. */
    if (save.tackleBroken) {
      items.length = 0;
      items.push({
        key: 'dock', label: 'Back to the Dock', domId: 'tcDock',
        sub: 'Walt will set the line up again',
        speech: 'Back to the dock. The line is bare - no hook, no float - and ' +
                'Walt will set you up again for nothing.'
      });
      if (vessel().id !== 'foot') {
        items.push({
          key: 'troll', label: 'Troll On', domId: 'tcTroll',
          sub: 'Look round, but you cannot fish',
          speech: 'Troll on. You can look round, but there is nothing on the line to fish with.'
        });
      }
      items.push(optionsTarget());
      return items;
    }
    if (vessel().id === 'foot') {
      /* Off the boards there is nowhere to troll TO, so the second choice is
         the one that was missing: put the net down and go back up the jetty.
         Without it the only way off the dock was the pause menu. */
      items.push({
        key: 'troll', label: equippedRod().isNet ? 'Scoop Again' : 'Cast Again', domId: 'tcTroll',
        sub: 'Have another go from here',
        speech: equippedRod().isNet ? 'Scoop again, from here.' : 'Cast again, from here.'
      });
      items.push({
        key: 'dock', label: 'Back to the Dock', domId: 'tcDock',
        sub: 'The shop, and Walt',
        speech: 'Back to the dock, for the shop and Walt.'
      });
    } else {
      items.push({
        key: 'troll', label: 'Troll On', domId: 'tcTroll',
        sub: 'Find another spot',
        speech: 'Troll on, and find another spot.'
      });
    }
    items.push(optionsTarget());
    return items;
  }

  /**
   * Options, as a thing in the scan.
   *
   * It used to be Pause, and it only existed out on the water - so the one
   * choice that holds the settings, the log, the map and the way home was
   * missing from the two places a player spends most of their time. It is the
   * last stop on every scene's scan now, on the same button in the same
   * corner, so it is always exactly one more press away.
   */
  function optionsTarget() {
    return {
      key: 'options', label: 'Options', domId: 'pauseBtn',
      sub: '',
      speech: hasMap() ? 'Options. Settings, the map of the lake, and the way back.'
                       : 'Options. Settings, the mission log, and the way back.'
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     MISSION TARGETS
     ══════════════════════════════════════════════════════════════════════ */

  function targetComplete(m, value) {
    // Free roam is never "done" - there is nothing to hand in, so no card
    // fires and the trip simply keeps going for as long as you want it to.
    if (m.target.type === 'freeRoam') return false;
    if (STATE_NEEDS[m.target.type]) return stateValue(m.target) >= (m.target.amount || 1);
    return value >= m.target.amount;
  }

  /* ── Needs that are a fact about the save, not a count of catches ────────
     "Own the kayak", "clear the tab": true or not, read off the save when the
     card asks, so buying the thing at the counter finishes the job on the
     spot. */
  const STATE_NEEDS = {
    tradeScrap:   (t) => save.scrapTraded || 0,
    ownVessel:    (t) => ownsVessel(t.vesselId) ? 1 : 0,
    ownTool:      (t) => ownsTool(t.toolId) ? 1 : 0,
    /* A paid patch - or a hull that turns out not to need one. "Bring her in
       for a look" is satisfied by the look. */
    repairVessel: (t) => (save.repairs || 0) ||
                         ((RT.economy && RT.economy.status().repairPrice === 0 && ownsVessel('kayak')) ? 1 : 0),
    clearDebt:    (t) => (save.flags && save.flags.hadDebt &&
                          !(RT.economy && RT.economy.status().debt > 0)) ? 1 : 0,
    /* THE TWO AFTER THE END. Ten fish, ten finds - counted off the save
       rather than out of the trip, because they are the work of a great many
       trips and a count that resets at the dock would be no use at all. */
    collectSet:   (t) => setHeld(t.set).length
  };
  function stateValue(t) { return STATE_NEEDS[t.type] ? STATE_NEEDS[t.type](t) : 0; }
  const STATE_WORDS = {
    tradeScrap:   (t, v) => v >= t.amount ? 'Scrap traded ' + ic('done') : 'Scrap traded ' + v + ' / ' + t.amount,
    ownVessel:    (t, v) => v ? 'Bought ' + ic('done') : 'Buy the ' + vesselNameById(t.vesselId),
    ownTool:      (t, v) => v ? 'Bought ' + ic('done') : 'Buy the ' + toolNameById(t.toolId),
    repairVessel: (t, v) => v ? 'Patched ' + ic('done') : 'Pay for a repair',
    clearDebt:    (t, v) => v ? 'Tab cleared ' + ic('done') : 'Clear the tab',
    collectSet:   (t, v) => v >= t.amount ? 'All ' + t.amount + ' found ' + ic('done')
                                          : v + ' / ' + t.amount + ' found'
  };
  function vesselNameById(id) { const v = (roster().vessels || []).find(x => x.id === id); return v ? v.name : id; }
  function toolNameById(id) { const t = (roster().tools || []).find(x => x.id === id); return t ? t.name : id; }

  /**
   * Is this a job that must not name what it is looking for?
   *
   * Reported: "the quest I'm on is called find the sound comb - do we know
   * it's a sound creating device at this point in the game?" It does not.
   * At that point a magnet has come back heavy out of a log jam; that the
   * thing is a music-box comb tuned below human hearing is what Walt says
   * when he turns it over, and it is the entire content of that hand-in.
   *
   * A CLUE job is one where finding out what is down there IS the job - the
   * kind is already in the content, so nothing new had to be written down.
   * Every other kind still names what it wants, because Walt named it first:
   * five pieces of litter, three pieces of iron.
   */
  function blindItem(m) {
    return !!(m && m.kind === 'clue');
  }

  function targetProgressText(m, value) {
    const t = m.target;
    if (t.type === 'freeRoam') return 'Free fishing';
    if (STATE_WORDS[t.type]) return STATE_WORDS[t.type](t, stateValue(t));
    if (t.type === 'catchWeight') return round1(value) + ' / ' + t.amount + ' lbs';

    /* Everything that is not a fishing count needs its own words. Without
       these the fall-through at the bottom renders "Fish 0 / 1" on a job about
       a bicycle frame, because it assumes a species and there is not one. */
    if (t.type === 'recoverItem') {
      const done = value >= t.amount;
      if (t.itemId) {
        /* NOT BEFORE YOU HAVE IT, on a job whose whole content is finding out
           what is down there. See blindItem(). */
        if (done) return itemNameById(t.itemId) + ' ' + ic('done');
        if (blindItem(m)) return 'Something down there';
        /* AND HOW MANY OF THEM, when it wants more than one. "Find the
           Floating Litter" is the right words for a propeller and no use at
           all on a job that wants five: the count is the whole state of it. */
        if ((t.amount || 1) > 1)
          return Math.floor(value) + ' / ' + t.amount + ' ' + itemNameById(t.itemId);
        return 'Find the ' + itemNameById(t.itemId);
      }
      const what = t.distinct ? ' different finds' : ' finds';
      return Math.floor(value) + ' / ' + t.amount + what;
    }
    if (t.type === 'reachSpot')
      return value >= t.amount ? 'Done ' + ic('done') : 'Go and see';
    if (t.type === 'ringBell')
      return value >= t.amount ? 'Rung ' + ic('done') : 'Ring the bell';
    if (t.type === 'catchWeightOne') {
      const sp1 = t.speciesId ? fishById(t.speciesId) : null;
      const nm = sp1 ? sp1.name : 'Fish';
      return value >= t.amount ? nm + ' ' + t.amount + ' lbs ' + ic('done')
                               : nm + ' ' + t.amount + ' lbs+';
    }
    const sp = t.speciesId ? fishById(t.speciesId) : null;
    /* The net's haul has names: minnows and golden shiners. "Tiny fish" was
       the game being vague about two fish it has paintings of. */
    const name = sp ? sp.name : (t.netOnly ? 'Minnows & shiners' : 'Fish');
    if (t.type === 'catchLength') {
      return value >= t.amount ? name + ' ' + t.amount + '" ' + ic('done') + '' : name + ' ' + t.amount + '"+';
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
    const name = sp ? sp.name : (t.netOnly ? 'minnows and shiners for the tank' : 'fish');

    if (STATE_WORDS[t.type]) {
      const w = STATE_WORDS[t.type](t, stateValue(t)).replace(/<[^>]*>/g, '').trim();
      /* EXCEPT THE COLLECTIONS. Every other state job is finished by handing
         money or a boat over at the counter; these two are finished out on
         the water over many trips, and "at the counter" would be telling a
         player to go and stand in a shop for ten hours. */
      if (t.type === 'collectSet') {
        const left = Math.max(0, t.amount - stateValue(t));
        return w + '. ' + (left <= 0 ? 'Go and tell Walt.'
               : left === 1 ? 'One more, somewhere out there.'
               : left + ' still out there somewhere.');
      }
      return w + '. At the counter.';
    }
    if (t.type === 'recoverItem') {
      const done = value >= t.amount;
      if (t.itemId) {
        if (done) return 'You have the ' + itemNameById(t.itemId) + '.';
        if (blindItem(m))
          return 'Something is down there. Work the marked place with the magnet.';
        if ((t.amount || 1) > 1) {
          const got = Math.floor(value), left = Math.max(0, t.amount - got);
          const net = ((D.ITEMS || []).find(i => i.id === t.itemId) || {}).netOnly;
          return 'You have ' + got + ' of ' + t.amount + ' ' + itemNameById(t.itemId) +
                 '. ' + (left === 1 ? 'One more.' : left + ' more to go.') +
                 (net ? ' A netful at a time.' : '');
        }
        return 'You need to find the ' + itemNameById(t.itemId) + ', on the magnet.';
      }
      const left = Math.max(0, t.amount - Math.floor(value));
      const kind = t.distinct ? ' different things' : ' things';
      if (left <= 0) return 'You have everything that was asked for.';
      return 'You have ' + Math.floor(value) + ' of ' + t.amount + kind +
             '. ' + (left === 1 ? 'One more.' : left + ' more to go.');
    }
    if (t.type === 'reachSpot')
      return value >= t.amount ? 'That is done.' : 'Somewhere to go, not something to catch.';
    if (t.type === 'ringBell')
      return value >= t.amount ? 'The bell is rung.' : 'Ring the bell at the shack.';
    if (t.type === 'catchWeightOne')
      return value >= t.amount
        ? 'You have your ' + name + '.'
        : 'You need one ' + name + ' of at least ' + t.amount + ' pounds.';

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

  /**
   * Score one catch against the current job.
   *
   * Fish and magnet hauls both count now, depending on what the job asked
   * for. The old first line rejected anything that was not a fish, which is
   * why every retrieval quest in the written content was unscoreable.
   */
  function applyToTarget(m, outcome) {
    const t = m.target;

    /* ── Magnet work ──────────────────────────────────────────────────────
       Three shapes, and the content uses all three: a NAMED item, N DISTINCT
       items, or N of anything at all. Fish never count toward these — you
       cannot fill a retrieval job by catching perch. */
    if (t.type === 'recoverItem') {
      if (outcome.type === 'fish') return false;
      if (t.itemId) {
        if (outcome.id !== t.itemId) return false;
        /* ONE AT A TIME. This used to write the job's whole amount on the
           first find, which is invisible on the clue jobs - there is one
           propeller and one lockbox - and wrong on the two that ask for
           several: "scoop out five pieces of litter" was finished by the
           first tin can out of the water. Counting up behaves exactly as it
           always did wherever the amount is one. */
        const want = t.amount || 1;
        save.progressValue = Math.min(want, (save.progressValue || 0) + 1);
        return true;
      }
      if (t.distinct) {
        /* Remembered per job, so "three different things" means three
           different things on THIS job rather than three you have ever seen. */
        save.recovered = save.recovered || [];
        if (save.recovered.indexOf(outcome.id) >= 0) return false;
        save.recovered.push(outcome.id);
        save.progressValue = save.recovered.length;
        return true;
      }
      save.progressValue++;
      return true;
    }

    /* The finale. One press, no timing, and it cannot be failed — so it is
       scored the moment it happens rather than accumulated. */
    if (t.type === 'ringBell') {
      save.progressValue = t.amount || 1;
      return true;
    }

    /* GOING SOMEWHERE IS NOT CATCHING SOMETHING.
       This has to say so explicitly, because the bottom of this function is a
       fishing count that accepts anything without a speciesId - so reachSpot
       fell straight through it and every rescue in the game completed itself
       on the first fish landed. Scored by reachFlag(), not from here. */
    if (t.type === 'reachSpot') return false;

    /* SCORED OFF THE SAVE, NOT OFF THE LINE.
       The collections - ten fish in no book, ten things somebody lost - are
       counted by what is HELD (see STATE_NEEDS and setHeld), because each one
       is one to a lake and must still count when it turns up on the way to
       something else. The bottom of this function is a plain fishing counter
       that credits anything with no speciesId on it, so a sunfish on "catch
       all ten fish that are in no book" came back with a green tick and "that
       one counts" - while the count itself stayed at 0 of 10, because the
       count is read from the set and a sunfish is in every book there is.
       Reported exactly that way. Landing one of the ten still records it, up
       at the top of finishLanding, where it belongs. */
    if (STATE_NEEDS[t.type]) return false;

    if (outcome.type !== 'fish') return false;
    /* Cumulative, and species-agnostic: "land 12 lbs of fish, all told". Quest
       one is netted bait for the tank, and a sunfish on a hook is not that. */
    if (t.type === 'catchWeight') {
      if (t.netOnly && !outcome.tank) return false;
      save.progressValue += outcome.weight; return true;
    }
    /* Tagging jobs count TAGS. A bait-tank minnow is not a tagged fish, and a
       job about deep water wants the depth the line actually went into. */
    if (t.netOnly) {
      // The survey count: every tiny fish in the net is one.
      if (!outcome.tank) return false;
      save.progressValue += outcome.count || 1;
      return true;
    }
    if (outcome.tank) return false;
    if (t.minDepthFt && (outcome.depthFt || 0) < t.minDepthFt) return false;
    /* NOT that. One fish, one species, over a threshold - "catch a Northern
       Pike over 6 lbs". Every written weight job means this one, and letting
       them share a name would have allowed six sunfish to finish a job about a
       pike. */
    if (t.type === 'catchWeightOne') {
      if (outcome.id === t.speciesId && outcome.weight >= t.amount) {
        save.progressValue = t.amount;
        return true;
      }
      return false;
    }
    if (t.type === 'catchLength') {
      if (outcome.id === t.speciesId && outcome.length >= t.amount) {
        save.progressValue = t.amount; return true;
      }
      return false;
    }
    if (!t.speciesId || outcome.id === t.speciesId) { save.progressValue++; return true; }
    return false;
  }

  /**
   * Something got DONE. Remember it, and score it if the job asked for it.
   *
   * Separate from applyToTarget because nothing here comes up on a line: a
   * rescue is a place reached and a tow completed, not an outcome rolled.
   */
  /**
   * The job the keeper can finish, if this is one of those.
   *
   * Two of the written kinds never leave the dock: a story beat is being told
   * something, and the bell is the last act of the game. Both belong on the
   * keeper's menu rather than out on the water, which is also where the
   * player will look for them - they were told to come and talk.
   */
  /**
   * The brief, in turns.
   *
   * Walt's briefing is written as three or four cue lines (`lines.brief` in
   * content/quests.json - the same ids his recordings are filed under), and it
   * used to arrive as one wall of text. This gives it back its shape: he says
   * a bit, you answer, he says the next bit, you answer, and the last thing he
   * says is the job. Your first answer is the line the script gives you; the
   * rest are short things anybody would say, because the script only writes
   * one line for you per job.
   */
  /* Your short answers between his lines. They have cue ids of their own so
     they can be recorded once and reused everywhere, like any other line. */
  const SMALL_TALK = [
    { text: 'What do you need?', cue: 'you_whatdoyouneed' },
    { text: "I'm listening.",    cue: 'you_listening' },
    { text: 'Go on.',            cue: 'you_goon' },
    { text: 'Right.',            cue: 'you_right' }
  ];
  function briefSteps(m) {
    if (!m) return [];
    const cues = (m.lines && m.lines.brief) || [];
    let walt = cues.map(c => (RT.quests && RT.quests.line(c)) || '').filter(Boolean);
    if (!walt.length) walt = [(m.say && m.say.brief) || m.text];
    const steps = [];
    walt.forEach(function (text, i) {
      const last = i === walt.length - 1;
      const small = SMALL_TALK[Math.min(i, SMALL_TALK.length - 1)];
      /* Your side, written where it matters. A quest can script every answer
         (`replies`); otherwise the first one is the line the script gives you
         and the rest are short things anybody would say. */
      const scripted = (m.replies && m.replies[i]) || null;
      const first = i === 0 && m.player;
      steps.push({
        who: 'walt', text: text, cue: cues[i] || null,
        reply: scripted || (last ? (m.kind === 'finale' ? "I'll go and meet him." : 'Deal')
                          : first ? m.player : small.text),
        replyCue: scripted ? (m.id + '_you' + (i + 1))
                : last ? (m.kind === 'finale' ? 'you_ringit' : 'you_deal')
                : first ? (m.id + '_you') : small.cue,
        last: last
      });
    });
    return steps;
  }

  /**
   * What Walt says when you come back without the job done.
   *
   * Written for all thirty-five jobs, recorded for all thirty-five, and
   * documented in content/quests.json - "`nudge` is what Walt says when you
   * come back without the job done" - and no line of code had ever read the
   * field. Returns the words and the cue, so it is his voice and not the
   * system's.
   */
  function nudgeLine() {
    const m = currentMission();
    if (!m || !isBriefed()) return null;
    if (turnInState().done) return null;          // it IS done: he has better to say
    const text = (m.say && m.say.nudge) || '';
    if (!text) return null;
    return { text: text, cue: m.id + '_nudge' };
  }

  /**
   * What Walt says when a job is handed in - all of it.
   *
   * A reaction can be three lines long: he turns the propeller over, reads
   * the Warden's journal out, works out what it means. Each has its own cue
   * and its own recording, so the card plays them in order.
   */
  /** The cues of a job's BRIEF, in order, with their words - see doneLines. */
  function briefLines(m) {
    const cues = (m && m.lines && m.lines.brief) || [];
    return cues.map(function (c) {
      return { cue: c, text: (RT.quests && RT.quests.line(c)) || '' };
    }).filter(function (x) { return x.text; });
  }

  function doneLines(m) {
    const cues = (m && m.lines && m.lines.done) || [];
    return cues.map(function (c) {
      return { cue: c, text: (RT.quests && RT.quests.line(c)) || '' };
    }).filter(function (x) { return x.text; });
  }

  /**
   * One of the things Walt says at this moment, picked at random.
   *
   * Handing the logbook in happens at the end of every trip - it is the line
   * a player hears more than any other - so it cannot be one line, and it
   * cannot be the system voice reading out arithmetic. Which pool depends on
   * what was actually brought in: one tag, an armful, or one worth a remark.
   *
   * Never the same line twice running. With five in a pool that costs nothing
   * and it is the difference between a person and a recording.
   */
  const _lastPool = {};
  function waltLine(pool) {
    const pools = (RT.content && RT.content.quests && RT.content.quests.waltPools) || {};
    const cues = pools[pool] || [];
    if (!cues.length) return null;
    let pick = cues[Math.floor(Math.random() * cues.length)];
    if (cues.length > 1) {
      let guard = 0;
      while (pick === _lastPool[pool] && guard++ < 8) {
        pick = cues[Math.floor(Math.random() * cues.length)];
      }
    }
    _lastPool[pool] = pick;
    const text = (RT.quests && RT.quests.line(pick)) || '';
    return text ? { cue: pick, text: text } : null;
  }

  /**
   * What he says as the logbook goes in, for what you actually brought.
   *
   * `sale` is what sellCatch() handed back: how many entries, and the best of
   * them if there was one worth naming.
   */
  function logLine(sale) {
    const n = (sale && sale.count) || 0;
    const best = sale && sale.best;
    /* A fish worth remarking on: something that is not a tiddler and not a
       boot. Its own bounty is the game's own measure of that. */
    /* `best` is whatever was worth most, tag or find - the sale sorts on
       `value` - so that is the measure of "worth a remark". Six dollars is a
       bass or better, or a tyre off the bottom, either of which he would look
       at twice. */
    const notable = !!(best && (best.value || 0) >= 6);
    if (notable) return waltLine('logBig') || waltLine('log');
    if (n >= 5) return waltLine('logMany') || waltLine('log');
    if (n === 1) return waltLine('logOne') || waltLine('log');
    return waltLine('log');
  }

  /**
   * The fish a lure is made for, in words.
   *
   * The fish decides the lure, so this is the most useful thing that can be
   * said about one - more useful than what it is made of or how it is worked.
   * Read off the roster's own bias table, biggest bias first, so it cannot
   * promise a fish the game will not actually give.
   */
  function lureIsFor(baitId) {
    const b = baitById(baitId);
    if (!b) return '';
    /* A LURE THAT NAMES NO FISH is the one for the fish nobody makes a lure
       for - the panfish - and saying so is more use than saying nothing.
       Worked out from which species have no lure of their own, so it stays
       true if one ever gets one. */
    if (!b.biasTable || !Object.keys(b.biasTable).length) {
      const plain = (D.FISH || []).filter(function (f) {
        return !f.secret && !f.netOnly && !lureFor(f.id);
      }).map(function (f) { return f.name.toLowerCase(); });
      if (!plain.length) return '';
      return 'For ' + plain.slice(0, -1).join(', ') +
             (plain.length > 1 ? ' and ' + plain[plain.length - 1] : plain[0]) + '.';
    }
    const ids = Object.keys(b.biasTable).sort(function (x, y) {
      return b.biasTable[y] - b.biasTable[x];
    });
    const names = ids.map(function (id) {
      const f = fishById(id);
      return f && !f.secret ? f.name.toLowerCase() : null;
    }).filter(Boolean);
    if (!names.length) return '';
    if (names.length === 1) return 'For ' + names[0] + '.';
    return 'For ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + '.';
  }

  /** Has Walt told you about the current job yet? */
  function isBriefed() { const m = currentMission(); return !!m && (save.briefed || 0) >= m.n; }

  function counterBeat() {
    const m = currentMission();
    if (!m || !m.target) return null;
    /* Every job starts with Walt. Nothing counts, and the HUD says nothing but
       "see Walt", until you have heard him out - and the first brief is where
       the net changes hands. */
    if (!isBriefed()) {
      return { kind: 'brief', label: 'Talk to Walt', speech: 'Talk to Walt', done: false,
               text: (m.say && m.say.brief) || m.text, player: m.player || '' };
    }
    /* A bare line comes before anything else: there is no fishing at all
       until it is sorted, and it costs nothing. */
    if (save.tackleBroken) {
      const cue = (save.tackleBreaks || 1) > 1 ? 'tackle_lost_again' : 'tackle_lost_1';
      return { kind: 'tackle', label: 'A new hook and float', speech: 'Get a new hook and float',
               done: false, cue: cue,
               text: (RT.quests && RT.quests.line(cue)) || 'Here. New hook, new float, on me.' };
    }
    const t = m.target;
    /* A BELL IS RUNG WHERE THE BELL IS. This used to claim any ringBell job
       for the counter, so the last moment of the story - a sturgeon surfacing
       with the old Warden's bell in his mouth - was a row on a shop card with
       Walt describing water he could not see. It happens out there now; see
       openSpotCard, which offers it at the place like any other beat. The
       counter still handles a bell job that is explicitly AT the counter, of
       which there are none. */
    if (t.type === 'ringBell' && m.at === 'counter') {
      return { kind: 'bell', label: 'Ring the bell',
               speech: 'Ring the bell', done: save.progressValue >= (t.amount || 1) };
    }
    if (t.type === 'reachSpot' && m.at === 'counter') {
      return { kind: 'story', label: 'Hear them out',
               speech: 'Hear them out', flag: t.flag, done: hasFlag(t.flag) };
    }
    return null;
  }

  /** Take the counter beat: hear the story, or ring the bell. */
  function takeCounterBeat() {
    const b = counterBeat();
    if (!b || b.done) return null;
    const m = currentMission();
    if (b.kind === 'brief') {
      save.briefed = m.n;
      const gave = [];
      if (m.gives && m.gives.rodId && !ownsRod(m.gives.rodId)) { save.rods = (save.rods || []).concat([m.gives.rodId]); gave.push(rodById(m.gives.rodId).name); }
      if (m.gives && m.gives.baitId && !ownsBait(m.gives.baitId)) { save.baits = (save.baits || []).concat([m.gives.baitId]); gave.push(baitById(m.gives.baitId).name); }
      if (m.gives && m.gives.toolId && !ownsTool(m.gives.toolId)) { save.tools = (save.tools || []).concat([m.gives.toolId]); gave.push(toolNameById(m.gives.toolId)); }
      /* The map. It is not tackle - it goes in Options, not in the box - so
         it is its own flag rather than another owned thing. */
      /* Named without its article: the card that lists what he handed over
         writes "the" in front of each one, and "the a map of the lake" is what
         came out. */
      if (m.gives && m.gives.map && !save.hasMap) { save.hasMap = true; gave.push('map of the lake'); }
      persist();
      pushHud();
      return { kind: 'brief', text: b.text, player: b.player, gave: gave };
    }
    if (b.kind === 'tackle') {
      save.tackleBroken = false;
      persist();
      pushHud();
      return { kind: 'tackle', text: b.text, cue: b.cue, gave: ['hook and float'] };
    }
    if (b.kind === 'bell') {
      save.progressValue = (m.target.amount || 1);
      persist();
      return { kind: 'bell', text: (m.say && m.say.done) || 'Rung.',
               seq: doneLines(m) };
    }
    reachFlag(b.flag);
    /* WITH THE CUES, so it is his voice. This handed back the words and
       nothing else, so every story beat at the counter - the sonar being
       built, the debt cleared, the blueprint - was read out by the system
       voice while the recording of it sat on the disk. The text is the
       joined lines, so the cues are the lines: hand them over in order and
       the card plays them one after another. */
    const seq = doneLines(m).length ? doneLines(m) : briefLines(m);
    return { kind: 'story', text: (m.say && m.say.done) || (m.say && m.say.brief) || '',
             seq: seq };
  }

  function reachFlag(flag) {
    if (!flag) return false;
    save.flags = save.flags || {};
    if (save.flags[flag]) return false;          // already done; not again
    save.flags[flag] = 1;
    const m = currentMission();
    if (m && m.target && m.target.type === 'reachSpot' && m.target.flag === flag) {
      save.progressValue = m.target.amount || 1;
      persist();
      return true;
    }
    persist();
    return false;
  }

  /** Has this been done? Used by the board and by the log. */
  function hasFlag(flag) { return !!(save.flags && save.flags[flag]); }

  /* ══════════════════════════════════════════════════════════════════════
     WHAT IS DOWN THERE

     One shoal per cell of the lake, derived from the cell's own coordinates
     and the depth at it. The same water always holds the same shoal, and no
     shoal exists anywhere its species could not live - which is what makes
     the depth the progression rather than a list of unlocks.
     ══════════════════════════════════════════════════════════════════════ */

  const SHOAL_CELL = 115;        // one shoal per cell of lake, at most
  /* Which of art.js's four patch dressings each water gets. */
  const PATCH_STYLE = { shoreline: 'shallows', bay: 'weedbed', dropoff: 'dropoff', trench: 'deepchannel' };
  const SHOAL_CHANCE = 0.46;     // ...and not every cell has one

  /** Which species could be in this much water, biggest first. */
  function speciesAtDepth(ft) {
    return roster().fish.filter(function (f) {
      return !f.secret && ft >= f.depthFt[0] && ft < f.depthFt[1];
    }).sort(function (a, b) { return b.weightLb[1] - a.weightLb[1]; });
  }

  /**
   * The shoal in a cell, or null.
   *
   * Cached, because the cue, the aimer, the chart and the scene all ask about
   * the same handful of cells many times a frame, and the answer never
   * changes.
   */
  const _shoalCache = new Map();
  /* How much of the water in front of the jetty belongs to the DOCK's own
     shoal. The lake makes a shoal per cell as well, so without this a boat a
     hundred units off the boards was offered a different spot with a different
     fish in the same water somebody had just been fishing off the dock. */
  const DOCK_WATER = 190;
  function shoalInCell(ci, cj) {
    const key = ci + ',' + cj;
    if (_shoalCache.has(key)) return _shoalCache.get(key);

    const L = chart();
    let out = null;
    const dk = L && L.dock;
    if (dk) {
      /* The middle of this cell, against the dock's own water. */
      const mx = (ci + 0.5) * SHOAL_CELL, mz = (cj + 0.5) * SHOAL_CELL;
      if (Math.hypot(mx - dk.x, mz - dk.z) < DOCK_WATER) {
        _shoalCache.set(key, null);
        return null;
      }
    }
    if (L) {
      const r = U.rng(U.hash('shoal:' + key));
      if (r.chance(SHOAL_CHANCE)) {
        // Somewhere in the cell, not in the middle of it.
        const x = (ci + r.range(0.18, 0.82)) * SHOAL_CELL;
        const z = (cj + r.range(0.18, 0.82)) * SHOAL_CELL;
        const ft = L.depthAt(x, z);
        const pool = speciesAtDepth(ft);
        if (ft >= MIN_FISHABLE_FT && pool.length) {
          /* Which fish this shoal is CALLED after. Weighted toward the
             biggest thing that lives at this depth, because that is what you
             would notice - but not always it, or every shoal in a depth band
             would have the same name. */
          /* Weighted toward the biggest thing that lives at this depth,
             because that is what you would notice - but only weighted. At
             better than half, the largest fish in a band took nearly every
             shoal in it and the others became rumours: a lake with pike and
             catfish in the same water showed catfish almost everywhere, and
             a job about pike had nowhere to send you. */
          /* NAMED AFTER SOMETHING A ROD CAN CATCH. The bait fish live here
             too - and are in the pool below, because a net dipped in this
             water really would come up with them - but a shoal cued to a boat
             is a shoal you are being invited to cast at, and "Golden Shiner
             on the right" is a lie to anybody holding a rod. */
          const hookable = pool.filter(function (f) { return !f.netOnly; });
          const names = hookable.length ? hookable : pool;
          const named = r.chance(0.35) ? names[0] : r.pick(names);
          /* Water so shallow that nothing but bait lives in it. The shoal is
             real - a net dipped here comes up full - but it is not something
             to cue a boat with a rod towards. */
          const baitOnly = !hookable.length;
          out = {
            key: key, x: x, z: z, ft: ft,
            fishId: named.id, fishName: named.name, bait: baitOnly,
            biome: D.waterAt(ft).id,
            fishColor: named.colour || null,
            fishLength: Math.max(0.85, named.lengthIn[1] * 0.048),
            radius: CFG.SPOT_RADIUS,
            count: r.int(8, 14),
            seed: U.hash('sh:' + key),
            pool: pool.map(function (f) { return f.id; })
          };
        }
      }
    }
    _shoalCache.set(key, out);
    return out;
  }

  /**
   * The current job's PLACE, as a shoal: the reed beds, the scrap markers, the
   * log jam, the centre fog. Authored on the chart (content/lake.json places)
   * and cued, pulled over onto and fished like any shoal - it is simply the
   * one shoal that is where the job said it would be. Null when the job has
   * no place, or the place is done with.
   */
  function placeShoal() {
    const m = currentMission();
    if (!m || m.at === 'counter') return null;
    const L = RT.content && RT.content.lake;
    const p = L && L.places && L.places.find(function (q) { return q.quest === m.id; });
    if (!p) return null;
    if (m.target.type === 'reachSpot' && hasFlag(m.target.flag)) return null;
    if (m.target.type === 'recoverItem' && save.progressValue >= (m.target.amount || 1)) return null;
    /* AND ONCE THE JOB IS DONE, WHATEVER SHAPE IT IS.
       reachSpot has its flag and recoverItem has its count, and the two lines
       above turn those places off. The bell has neither - it is a ringBell
       target - so its place stayed on the water and the whole scene played
       again every time the boat came back over the trench. Reported: "it
       keeps replaying the quest TTS when I go back to the abyssal trench."
       A place is where a job happens, and a finished job does not happen
       twice. Ordinary shoals are untouched; this is only the gold ring. */
    if (targetComplete(m, save.progressValue)) return null;
    /* A PLACE COMES BACK. "Trolling on" means not now, not never - but it
       marks the water behind you as spent, and that is right for a patch of
       perch and wrong for the one spot the whole job is about. Reported on
       the log jam: steered there, magnet-fished it, trolled on, and the card
       never appeared again although the sound comb was still down there.
       So a place un-spends itself once you have drawn off it, or after a
       breather - and it stops existing on its own the moment the job no
       longer wants it, a few lines above. */
    if (run && placeShoal._c && placeShoal._c.id === p.id && run.taken[placeShoal._c.key]) {
      const away = Math.hypot(placeShoal._c.x - run.x, placeShoal._c.z - run.z) > offerRange() + 30;
      if (away || clockSeconds() - (run.placeOff || 0) > 12) {
        delete run.taken[placeShoal._c.key];
        /* AND IT IS WORTH SAYING AGAIN. A shoal is announced once a trip -
           `said` - so the place came back onto the card in silence, and a
           card nobody is told about is a card that did not come back. With
           the arrow on, its own "here it is, holding you over it" covered
           this up; with the arrow OFF, which is free driving, the second
           approach to the one spot the job is about said nothing at all.
           Reported on job 9: "when I troll on, if I don't complete the quest
           then the magnet fishing card doesn't pop up again."
           Only the job's place forgets, and only when it un-spends - the
           same narrow door `taken` uses. Every ordinary patch of perch is
           still called once, because a lake that re-announces every shoal
           you circle is a lake that will not stop talking. */
        delete run.said[placeShoal._c.key];
      }
    }
    if (!placeShoal._c || placeShoal._c.id !== p.id) {
      /* FISHED FROM THE EDGE OF IT. A place that is also a barrier - the log
         jam - marks where the timber RUNS, and a boat cannot sit in the
         middle of the timber. So the water you work it from is the near
         side of the pile, which is where anybody would fish a jam from
         anyway: up against the logs, dropping the magnet into them. */
      let px0 = p.x, pz0 = p.z;
      const L0 = chart();
      const bar = L0 && (L0.barriers || []).find(function (q) { return q.id === p.id; });
      if (bar) {
        const near = (L0.dock.z > bar.z) ? 1 : -1;      // the side the dock is on
        pz0 = bar.z + near * (bar.half + 16);
      }
      const p2 = { x: px0, z: pz0 };
      const ft = chart() ? chart().depthAt(p2.x, p2.z) : (p.depthFt || 0);
      const label = p.label ? p.label.charAt(0).toUpperCase() + p.label.slice(1) : 'The place';
      /* WHAT YOU ARE FISHING WITH, NOT WHAT YOU WILL GET. A salvage place was
         drawn with a fish picture, because the card only knew fish; it was
         given the ITEM's own painting instead - and that hands the player the
         answer to the job before they have dropped the magnet in. Job 22 is
         called "Something in the Log Jam" and the card showed them the sound
         comb. Reported: "for all of these magnet fishing missions just use the
         magnet icon, we don't wanna spoil what we are going to get."

         So a magnet spot is drawn with the magnet - the one actually on the
         line where possible, and the little one otherwise. A NET place keeps
         the item, because the litter job names its litter out loud anyway and
         there is nothing there to spoil. */
      const t2 = m.target || {};
      const rec = t2.itemId ? (D.ITEMS || []).find(function (i) { return i.id === t2.itemId; }) : null;
      const onMagnet = !!(rec && !rec.netOnly);
      const placeArt = onMagnet
        ? (toolIconSrc(equippedTool()) || 'images/tools/magnet_1-icon.png')
        : (rec ? 'images/items/' + rec.id + '.png' : null);
      placeShoal._c = {
        id: p.id, key: 'place:' + p.id, x: p2.x, z: p2.z, ft: ft, biome: D.waterAt(ft).id,
        magnetSpot: onMagnet,
        art: placeArt,
        fishId: null, fishName: label, fishColor: null, fishLength: 1,
        radius: CFG.SPOT_RADIUS * 1.4, count: 0, seed: U.hash(p.id), pool: [],
        isPlace: true, place: p, job: m
      };
    }
    return placeShoal._c;
  }

  /**
   * The panfish under the dock.
   *
   * Written into the roster - sunfish are "thick under the dock all summer"
   * and the perch sit "right up against the wooden dock pilings" - and now
   * actually there, as a shoal that never moves and never runs out. Without
   * it the boards depended on the cell lottery, and standing on the jetty
   * with a rod was regularly answered with "nothing in reach", which is both
   * wrong and the worst thing the first hour of the game could say.
   */
  function dockShoal() {
    const L = chart();
    if (!L) return null;
    if (!dockShoal._c) {
      /* Straight off the end of the boards, on the dock's own centreline -
         which is where the cast marker is and where somebody standing on the
         jetty is looking. A short cast: 28 feet, inside a bamboo rod's
         thirty, because this is the shoal the first hour is fished on. */
      const x = L.dock.x;
      const z = shoreZAtChart(x) - DOCK_STAND - DOCK_CAST;
      const ft = L.depthAt(x, z);
      dockShoal._c = {
        key: 'dock', x: x, z: z, ft: ft, biome: D.waterAt(ft).id,
        radius: CFG.SPOT_RADIUS, count: 12, seed: U.hash('dockshoal'),
        pool: speciesAtDepth(ft).map(f => f.id)
      };
    }
    /* AND WHAT IT IS CALLED, every time it is asked - not once and for ever.
       "Off the dock fishing for sunfish the spot says Largemouth Bass." It was
       always meant to be named after the job's fish where that fish lives
       here, but the whole shoal was cached on first use, so it kept whichever
       name the objective happened to be then - or the bass, which is only the
       biggest thing under the boards. The water does not change; the job
       does. */
    const c = dockShoal._c;
    const here = speciesAtDepth(c.ft);
    const pool = here.filter(f => !f.netOnly);
    /* AND ONLY WHEN THE DOCK COULD ACTUALLY FINISH THE JOB. Naming it after
       the fish you were sent for is right when that fish counts from here;
       on a job that also names a depth the boards are four feet of water and
       nothing caught off them counts, so calling the dock shoal after it
       would be pointing at the wrong place in the friendliest possible way. */
    const t0 = (currentMission() || {}).target || {};
    const deepEnough = !t0.minDepthFt || c.ft >= t0.minDepthFt;
    const want = deepEnough ? objectiveSpecies() : null;
    const named = pool.find(f => f.id === want) || pool[0] || here[0];
    if (!named) return null;
    c.fishId = named.id;
    c.fishName = named.name;
    c.fishColor = named.colour || null;
    c.fishLength = Math.max(0.85, named.lengthIn[1] * 0.048);
    return c;
  }

  /** Every shoal within `rad` of a point, nearest first. */
  function shoalsNear(x, z, rad) {
    const out = [];
    const dk = dockShoal();
    if (dk) {
      const d = Math.hypot(dk.x - x, dk.z - z);
      if (d <= rad) out.push({ sh: dk, d: d });
    }
    const pl = placeShoal();
    if (pl) {
      const d = Math.hypot(pl.x - x, pl.z - z);
      if (d <= rad) out.push({ sh: pl, d: d });
    }
    const c0 = Math.floor((x - rad) / SHOAL_CELL), c1 = Math.floor((x + rad) / SHOAL_CELL);
    const d0 = Math.floor((z - rad) / SHOAL_CELL), d1 = Math.floor((z + rad) / SHOAL_CELL);
    for (let ci = c0; ci <= c1; ci++) {
      for (let cj = d0; cj <= d1; cj++) {
        const sh = shoalInCell(ci, cj);
        if (!sh) continue;
        const d = Math.hypot(sh.x - x, sh.z - z);
        if (d <= rad) out.push({ sh: sh, d: d });
      }
    }
    out.sort(function (a, b) { return a.d - b.d; });
    return out.map(function (q) { return q.sh; });
  }

  /** The shoal a cast has landed on, if any. */
  function shoalAt(x, z) {
    const near = shoalsNear(x, z, SHOAL_CELL * 1.5);
    for (let i = 0; i < near.length; i++) {
      const sh = near[i];
      if (Math.hypot(sh.x - x, sh.z - z) < sh.radius) return sh;
    }
    return null;
  }

  /**
   * Can this boat, with this rod, actually fish that shoal?
   *
   * The hull has a depth rating (a canoe may not sit over the drop-off) and
   * the rod has a reach (a bamboo rod does not fish thirty-five feet down).
   * A shoal past either is not a spot for today, so nothing offers it: not
   * the cue, not the pull-over, not the chart. Being called out to water the
   * boat then refuses to enter is the game arguing with itself.
   */
  function fishableShoal(sh) {
    if (!sh) return false;
    if (sh.isPlace) return true;              // the job's own place is always on
    const band = vesselBand();
    const L = chart();
    const home = L && L.fromDock(sh.x, sh.z) <= HOME_WATER;
    /* HOW DEEP THE HULL IS RATED FOR is not negotiable - a canoe in a hundred
       and twenty feet of water is the thing Walt spends the first hour warning
       about, and canFloat will not let the boat sit there anyway. */
    if (band.maxFt && sh.ft > band.maxFt) return false;
    /* ── AND THEN THERE IS CHOOSING FOR YOURSELF ──────────────────────
       With the arrow off - or once the lake has gone quiet - the rest of
       this stops being a filter. Every shoal in range is offered, right
       gear or wrong, and finding out is the game: cast a bamboo rod into
       ninety feet and it says the rod cannot reach and starts losing rigs.
       "Forcing you to use your brain to find the right spots."
       The arrow itself is unaffected. When it is ON it still only points at
       water the kit in the boat can work, because a helper that steers you
       somewhere useless is worse than none. */
    /* AND WHEN THERE IS NO JOB LEFT TO KEEP YOU ON.
       The test below holds each boat to its own water, and the only exception
       it can make is for the job's OWN fish - so a job that names no fish at
       all, or one already finished and sitting in your pocket waiting to be
       handed in, had no exception to make and every shoal shallower than the
       boat's band disappeared. In the motorboat that is nearly all the water
       between the dock and the deep.
       That is not just a dull trip. The pull-over only exists when a shoal
       has been called on the side you are holding - see the helm code - so a
       player with two switches and no card has no way to stop the boat, no
       way to reach Options, and no way home. Reported on job 27: "when I have
       a mission complete and then I take the boat out, fish cards don't show
       up... I just get stuck trolling with only the ability to turn left or
       right."
       So the filter lifts the moment there is nothing to protect. Every fish
       job still keeps its boat honest, which is what the rule was for. */
    const m0 = currentMission();
    const t0 = m0 && m0.target;
    const noJobToHold = !t0 || !t0.speciesId || targetComplete(m0, save.progressValue);
    const yourCall = save.helper === false || isSolved() || noJobToHold;
    if (yourCall) return true;
    if (!home && band.minFt && sh.ft < band.minFt - 3) {
      /* EXCEPT FOR THE FISH THE JOB ASKS FOR.
         Each boat keeps to its own water, which is what makes buying the next
         one mean something - but a job has to be possible in the boat it is
         given to. Northern pike live from six feet to forty-five and the
         kayak's water starts at thirty-five, so of everything a kayak may
         fish, under four per cent held pike: both pike jobs stalled a
         playthrough one run in two. A kayak on the pike job may work the weed
         edge for pike. It still may not go back to the shallows to catch
         anything else, and a job that names a depth (minDepthFt) still holds
         you to it. */
      const t = currentMission() && currentMission().target;
      const wants = t && t.speciesId;
      const holds = wants && (sh.fishId === wants ||
                              (sh.pool && sh.pool.indexOf(wants) >= 0));
      if (!holds) return false;
    }
    const rod = equippedRod();
    if (rod.reachFt && sh.ft > rod.reachFt + 2) return false;
    /* A shoal of bait fish is a shoal for a NET. Cueing a boat with a rod
       towards one is telling somebody to cast at minnows: they were being
       sent to golden shiners in two feet of water and catching bass. */
    if (sh.bait && !rod.isNet) return false;
    return true;
  }

  /** Which side of the bow a shoal is on. */
  function sideOf(sh) {
    // Right of the bow is +(cos h, sin h); the sign of that dot is the side.
    const dx = sh.x - run.x, dz = sh.z - run.z;
    const rx = Math.cos(run.head), rz = Math.sin(run.head);
    return (dx * rx + dz * rz) >= 0 ? 'right' : 'left';
  }

  /**
   * Which way something is, in words that are true at a tiller.
   *
   * Left or right off the sign of one number has no word for "you are
   * already pointed at it" - so a channel dead ahead, with the bow on it,
   * was announced as "off to your left". Reported: "it says steer for the
   * channel 85 yards off to your left but it's right in front of me."
   *
   * One arc, used by the spoken line and by the badge, so the two can never
   * say different things about the same bearing.
   */
  const AHEAD_DEG = 20;
  function bearingWords(off) {
    const deg = Math.abs(off) * 180 / Math.PI;
    if (deg > 150) return 'behind you';
    if (deg <= AHEAD_DEG) return 'straight ahead';
    return off < 0 ? 'off to your left' : 'off to your right';
  }

  /** How far ahead of the bow, in units. Negative is astern. */
  function aheadOf(sh) {
    const dx = sh.x - run.x, dz = sh.z - run.z;
    return dx * Math.sin(run.head) + dz * -Math.cos(run.head);
  }

  /* ══════════════════════════════════════════════════════════════════════
     STEERING, AND STOPPING SOMEWHERE

     The rail is gone: the boat goes where it is pointed, and where it ends up
     is a consequence of where it has been pointing. Two things stop it - the
     shore, and how far this vessel will take you from the dock - and both
     stop it by SLIDING along the boundary rather than halting, because a boat
     that stops dead when you nose into something feels broken and a player on
     one switch cannot easily back off.
     ══════════════════════════════════════════════════════════════════════ */

  /** How far off the bow a shoal gets called out. */
  /* A DISTANCE, not a time. This was BOAT_SPEED * cueLead() + 90 - four
     hundred and thirty units, two hundred and thirty-five yards - so the game
     called a shoal, drew its card and offered the pull-over while it was a
     quarter of a mile off, and taking the offer drove you all the way there.
     A fish finder still buys you a longer look, because that is what it is
     for; it just starts from somewhere sane. */
  function cueRange() {
    return CFG.SPOT_CALL + (gearEffect('finder').lead || 0) * CFG.BOAT_SPEED;
  }
  /* And how near before it is OFFERED - the card, and the pull-over that
     drives the boat onto it. Hearing about a shoal a hundred yards off is
     useful; being handed a card that motors you a hundred yards is a bus
     ride, and on the salvage markers, sat alone in open water, it was two
     hundred yards. */
  function offerRange() {
    return CFG.SPOT_OFFER + (gearEffect('finder').lead || 0) * CFG.BOAT_SPEED * 0.4;
  }
  /* HOW FAR THE GAME LOOKS for the shoal it is going to talk about. One
     number, used by the search, by what counts as known and by what gets a
     card - they were three different numbers, and a shoal in the gap between
     them became the thing the game was about while being too far away to be
     drawn. The card vanished and the player was left holding an announcement
     about a fish that was not on screen. */
  function spotSearchRange() { return cueRange() + 40; }

  /**
   * Can the boat be here?
   *
   * Deep enough for this vessel's draught, and inside its reach of the dock.
   * The reach is the whole progression - the deep water is not fenced off, it
   * is simply further than a canoe will take you.
   */
  function canFloat(x, z) {
    const L = chart();
    if (!L) return true;
    const ft = L.depthAt(x, z);
    if (ft < draughtFt() + 0.4) return false;
    const dock = L.fromDock(x, z);
    if (dock > reach()) return false;
    /* Its own water, both ends. A canoe over the drop-off is the thing Walt
       warns about; a kayak in the lily pads is the same mistake the other way
       round. The boundary is soft - the hull slides along it rather than
       stopping dead - but it is a boundary. */
    /* Only the DEEP end stops a hull. A boat has to cross the shallows to
       reach its own water - the drop-off is eight hundred units out past the
       bay - so a hard shallow limit trapped the kayak in the home water and
       made job sixteen impossible. Where a boat may FISH is its band
       (fishableShoal); where it may float is anything it does not ground on
       and nothing deeper than it is rated for. */
    const band = vesselBand();
    if (band.maxFt && ft > band.maxFt) return false;
    /* AND NOT INTO THE TIMBER. The log jam runs bank to bank across the
       narrows and a boat goes through the channel or not at all.
       Only ENTERING is refused. If a hull ever ends up inside the pile -
       set down there by a pull-over, or by a chart edit that moves the jam
       under a boat - it can still drive out, because a boat that cannot
       move in any direction is the one failure this game must not have. */
    if (L.inBarrier && L.inBarrier(x, z) && !(run && L.inBarrier(run.x, run.z))) return false;
    return true;
  }

  /**
   * Does this leg of a course go through the timber?
   *
   * A LEG, not a point. The helper looks ninety-five units ahead in three
   * samples; a forty-unit bar fits between two of them, so a point test
   * reports clear water right up until the bow is in the logs.
   */
  function barred(x0, z0, x1, z1) {
    const L = chart();
    if (!L || !L.crossesBarrier) return null;
    if (L.inBarrier(x0, z0)) return null;         // getting out is always allowed
    return L.crossesBarrier(x0, z0, x1, z1);
  }

  /**
   * The way through, when the jam is between the boat and where it is going.
   *
   * Two waypoints, not one: the mouth of the channel on this side, and then
   * the far side of it. With a single waypoint at the mouth, a boat that
   * arrived there and still had the pile between it and a target off to one
   * side would be sent back to the mouth it was already sitting in, and
   * would hold there. Aiming THROUGH commits it.
   */
  function viaChannel(toX, toZ) {
    if (!run) return null;
    let b = barred(run.x, run.z, toX, toZ);
    /* THE JAM IS THERE WHETHER OR NOT THIS PARTICULAR LINE CLIPS IT.
       crossesBarrier() answers about one straight line, and a diagonal at
       something across the water often passes the END of the timber - so the
       boat set off on it, ran most of the way over, discovered the pile and
       turned to follow it. Reported: "it goes to the far right or left and
       then realises there's a jam and then tries to go around it."
       If where you are going is on the other SIDE of the jam, the channel is
       the way there from the first stroke, not a correction made on arrival. */
    if (!b) {
      const L = chart();
      const bars = (L && L.barriers) || [];
      if (!(L && L.inBarrier && L.inBarrier(run.x, run.z))) {
        for (let i = 0; i < bars.length; i++) {
          const c = bars[i];
          /* Opposite sides of the timber's own line, and far enough off it
             that this is a crossing rather than sitting in the mouth. */
          if ((run.z > c.z) === (toZ > c.z)) continue;
          if (Math.abs(run.z - c.z) <= c.half && Math.abs(toZ - c.z) <= c.half) continue;
          b = c; break;
        }
      }
    }
    if (!b) return null;
    const side = run.z > b.z ? 1 : -1;            // which side of the jam we are on
    const clear = b.half + 30;
    const dz = Math.abs(run.z - b.z);
    return {
      x: b.gapX, z: b.z + (dz > clear + 4 ? side : -side) * clear,
      label: 'the channel through ' + (b.label || 'the log jam'),
      bar: b, channel: true
    };
  }

  function updateSteer(dt) {
    /* Put the helm over and the boat turns; let go and it comes back to
       straight. */
    let want = 0;
    if (run.steerDir) want = run.steerDir * CFG.YAW_MAX;
    else if (run.rudder !== null && run.rudder !== undefined) want = run.rudder * CFG.YAW_MAX;

    /* Once you have asked to pull over, the helm STAYS over until you say
       otherwise - a pull-over is a sustained lean, and a helm that centred
       itself the moment the boat got where it was going could never finish
       one on a pointer. */
    if (run.enterSide) want = (run.enterSide === 'left' ? -1 : 1) * CFG.YAW_MAX;

    /* THE HELPER DRIVES, unless a hand is actually on a switch.
       For a player who never touches the helm this IS the boat driving itself
       - which is what was asked for - and it leaves a way out of anywhere the
       assist gets wedged. Overriding the player outright was tried and it
       cost the game: with nothing able to overrule the assist the boat
       oscillated past its target, two hundred units out and three hundred and
       seventy and two hundred and fifty, and never got inside the range where
       the shoal is offered. The playthrough fell from thirty-five jobs to six.

       What made this look manual was never this rule. A mouse crossing the
       window was being counted as steering - see onPointerMove in js/ui.js -
       so the helper stood down, and the click that appeared to start it was
       letting go of the rudder. */
    if (!run.steerDir && (run.rudder === null || run.rudder === undefined) &&
        save.helper !== false && !run.enterSide) {
      /* The spot itself, not the way to it: clearHeading routes round the
         timber, and the helper lets go when the boat is on the FISH. */
      const g = helperTarget();
      /* AND IT LETS GO WHEN YOU ARE THERE. A hand that keeps steering once the
         boat is on the fish is a hand pulling you off them while you read the
         card. */
      /* IT LETS GO WHERE THE OFFER STARTS. Releasing at a spot radius meant
         driving on through the whole stretch where the game will hand you the
         shoal - and a boat that cannot stop itself simply circled it, at
         thirty-one degrees a second, forever. Inside the offer the card is up
         and stopping is the player's call. */
      /* ALL THE WAY TO THE OFFER. Letting go early - with room to coast -
         cured the orbit and broke the arrival: the game does not call a shoal
         until eighty-eight units or offer it until seventy-three, so a helper
         that released at a hundred and four delivered the boat into a gap
         where nothing is announced and nothing is offered, and left it there.
         Measured on the crappie job: it got to a hundred and two and the card
         never came. */
      const _tight = boatSpeed() / Math.max(0.05, CFG.YAW_MAX * CFG.TURN_RATE);
      const _gap = g ? Math.hypot(g.x - run.x, g.z - run.z) : 0;
      /* CIRCLING IS ARRIVING.
         The helper used to let go of the tiller inside the offer - and the
         throttle stayed on. The boat ran through the spot in about ten
         seconds at motorboat speed, the helper picked the same goal up on the
         way out, turned round and came back: ten laps in five minutes on job
         33, never once stopping. Reported as "it never settles on a spot -
         says stuff is 50 yards away and then steers to another spot 400 yards
         away over and over again", which is one shoal and a very wide lap.

         So it does not let go. It keeps the helm over and holds the shoal,
         which at a turning circle of speed / (YAW_MAX * TURN_RATE) is 32
         units for the motorboat and less for everything smaller - well inside
         the seventy-three the card is offered on. The boat circles the fish
         with the offer up, and waits to be told. Stopping stays the player's
         call, made with the same press as everywhere else. */
      const _here = !!g && _gap <= offerRange() * 0.95;
      if (g) {
        /* Round the bar, not across it. */
        let off = clearHeading(g.x, g.z) - run.head;
        while (off > Math.PI) off -= Math.PI * 2;
        while (off < -Math.PI) off += Math.PI * 2;
        /* AND IT STOPS SAWING WHEN SAWING CANNOT HELP. Inside its own turning
           circle with the target off the bow, no amount of helm points at it -
           hauling over just walks the boat round it, which is the orbit a
           player saw as an arrow spinning. It holds its course instead: the
           boat runs past, gets its room back, and comes round on a line that
           works. Each pass is a straighter one, so it converges. */
        /* Holding course when the target is inside the turning circle is what
           lets a long approach converge instead of walking round the fish.
           Once the boat is ON the spot, walking round the fish is the whole
           point, so the guard lifts. */
        const pointless = !_here && _gap < _tight * 1.05 && Math.abs(off) > 1.05;
        /* Small enough to actually null. At 0.06 the assist sat on the edge
           of its own dead band - the boat ran straight while the arrow held a
           steady three and a half degrees off, which reads as the helper
           lying about steering. */
        if (!pointless && Math.abs(off) > 0.015) {
          want = U.clamp(off * 1.4, -CFG.YAW_MAX, CFG.YAW_MAX) * 0.8;
          /* SAYING SO. Steering somebody's boat for them without a word is
             not help, it is a haunting - and this game is played by people
             who may be listening rather than watching. */
          if (!run.helperHand) {
            run.helperHand = true;
            say('Quest helper steering you to ' + (g.label || 'the spot') + '.');
          }
        }
        /* Said once, as the boat comes onto it. Somebody going on the words
           alone has to be told that the circling is deliberate and that the
           next press is theirs. */
        if (_here && run.helperCircling !== g.key) {
          run.helperCircling = g.key;
          say('Here it is — ' + (g.label || 'the spot') +
              '. Holding you over it. Press to fish it.');
        }
        if (!_here && run.helperCircling === g.key) run.helperCircling = null;
      } else if (run.helperHand) {
        run.helperHand = false;
      }
    }
    run.yaw = U.damp(run.yaw, want, CFG.YAW_RATE, dt);

    // The helm turns the boat; the boat goes where it is pointed.
    const speed = boatSpeed() * (RT.economy ? RT.economy.speedFactor() : 1);
    run.head += run.yaw * CFG.TURN_RATE * dt;
    const step = speed * dt;
    const nx = run.x + Math.sin(run.head) * step;
    const nz = run.z - Math.cos(run.head) * step;

    /* Nose into the shore or the end of your reach and the boat runs ALONG it
       rather than stopping: try the whole step, then each axis on its own. A
       boat that halts dead is a boat that feels broken. */
    const bar = barred(run.x, run.z, nx, nz);
    if (canFloat(nx, nz) && !bar) {
      run.x = nx; run.z = nz;
      run.dist += step;
    } else if (canFloat(nx, run.z) && !barred(run.x, run.z, nx, run.z)) {
      run.x = nx;
      run.dist += Math.abs(nx - run.x) || step * 0.5;
    } else if (canFloat(run.x, nz) && !barred(run.x, run.z, run.x, nz)) {
      run.z = nz;
      run.dist += step * 0.5;
    } else if (!run.grounded) {
      /* Properly stuck: say why once, rather than leaving the player pressing
         a switch at a wall. Which of the two it is matters - one is "turn
         round" and the other is "you need a better boat". */
      run.grounded = true;
      const L = chart();
      const tooFar = L && L.fromDock(run.x, run.z) > reach() * 0.94;
      const v = vessel();
      const band = vesselBand();
      const ftAhead = L ? L.depthAt(nx, nz) : 0;
      const tooDeep = !!(L && band.maxFt && ftAhead > band.maxFt);
      const tooThin = false;      // shallow water is never a wall; you have to cross it
      /* THE LOGS ARE NOT THE BANK, and "come about" is no use against them:
         there is a way through and the player needs to be told where it is,
         in the only terms that help at a tiller - which side, how far. */
      if (bar) {
        /* The bearing to the gap, not the sign of a dot product - see
           bearingWords. Nosed into the timber with the channel dead ahead,
           this used to send you sideways along the pile. */
        const gdx = bar.gapX - run.x, gdz = bar.z - run.z;
        let goff = Math.atan2(gdx, -gdz) - run.head;
        while (goff > Math.PI) goff -= Math.PI * 2;
        while (goff < -Math.PI) goff += Math.PI * 2;
        say('The log jam is right across the water here. The channel through it is ' +
            yards(Math.hypot(gdx, gdz)) + ' yards ' + bearingWords(goff) + '.');
        return;
      }
      say(tooDeep
        ? 'Deep water ahead. The ' + (v.name || 'boat') + ' is not rated for it \u2014 come about.'
        : tooThin
        ? 'That is the shallows. The ' + (v.name || 'boat') + "'s water is further out."
        : tooFar
        ? 'That is as far out as ' + (v.name || 'this') + ' will take you.'
        : 'Shallow. Come about.');
      fire('onFlash', tooDeep ? 'TOO DEEP FOR THIS BOAT'
                    : tooThin ? 'TOO SHALLOW FOR THIS BOAT'
                    : tooFar ? 'END OF YOUR REACH' : 'SHALLOW');
      RT.audio.menuBlocked();
    }
    if (canFloat(nx, nz)) run.grounded = false;

    /* PULLING OVER. Hold the helm toward a side and, after LEAN_ARM, the game
       offers to pull in there; keep holding through PULL_OVER and it does.
       Let go, or steer the other way, and both meters empty - nothing is
       decided for you and nothing has to be decided quickly. pullOverTo()
       (a tap on the fish card) fills both meters at once. */
    /* ONLY A SWITCH HOLD COUNTS TOWARD PULLING IN.
       A mouse or a finger steers by holding the boat over to one side, which
       is the same gesture - so dragging across the lake kept committing to
       fishing spots. A pointer player has the fish card to press instead
       (pullOverTo), which is one tap and needs no timing at all. */
    const held = run.steerDir ? (run.steerDir < 0 ? 'left' : 'right') : null;
    const pull = run.pullLock || held;
    /* HOLDING THE HELM IS STEERING, NOT STOPPING.
       A long hold used to pull the boat over onto open water after four and a
       half seconds, so anybody who steers the way this game is steered - hold
       it over until the bow comes round - was stopped for a fish every time
       they crossed the lake. Now the offer only exists when there is
       something to pull over ONTO: a shoal called on that side, or a fish
       card the player has actually pressed (pullLock). Otherwise the hold
       just steers, for as long as you like. */
    /* The hold is latched to the SHOAL, not to the side. Turning toward fish
       on your right swings them across the bow and, for a moment, onto your
       left - and checking the side every frame meant the meter emptied
       halfway through the turn and the boat never pulled in at all. */
    const called = pull ? activeSpot() : null;
    if (pull && !run.leanKey && called && run.cued[called.key] && sideOf(called) === pull) {
      run.leanKey = called.key;
    }
    /* IS THE SHOAL I LATCHED ONTO STILL THERE - not "is it still the one the
       announcer would pick". activeSpot() names whatever is most worth
       talking about at this instant, and three seconds of turning changes
       that, so the hold reset one frame before it would have fired. Traced
       frame by frame: leanT full, enterT full, then null. */
    const stillThere = !!run.leanKey && !run.taken[run.leanKey] &&
      ((called && called.key === run.leanKey) ||
       shoalsNear(run.x, run.z, spotSearchRange() + 160)
         .some(function (q) { return q.key === run.leanKey; }));
    const offered = !!run.pullLock || stillThere;
    if (pull && offered) {
      if (run.leanSide !== pull) { run.leanSide = pull; run.leanT = 0; }
      /* Which side the card was offered on, held for as long as the hold is -
         the boat turns toward the fish while you hold, so the fish crosses
         the bow and the card would hop from one side of the screen to the
         other halfway through. To somebody holding a switch and watching it,
         that is the same as losing it. */
      /* THE SIDE IT WAS ANNOUNCED ON, not the side the helm happens to be
         over. Pin it to the hold and a player who leans the wrong way sends
         the card hopping to a side the voice never said - measured, seven
         seconds of the card and the voice disagreeing about a sunfish. */
      if (!run.leanCardSide) {
        run.leanCardSide = (run.leanKey && run.cuedSide[run.leanKey]) || pull;
      }
      run.leanT += dt;
      if (run.leanT >= leanArm(pull)) {
        if (run.enterSide !== pull) { run.enterSide = pull; run.enterT = 0; announcePullOver(pull); }
        run.enterT += dt;
        if (run.enterT >= pullOverTime(pull)) {
          /* Into the shoal the hold was for, not whatever is on that side by
             the time the meter fills. */
          const target = (called && called.key === run.leanKey) ? asSpot(called, pull) : spotToEnter(pull);
          run.leanKey = null;
          enterSpot(target, pull);
          pushSpots();
          return;
        }
      }
    } else {
      run.leanSide = null; run.leanT = 0;
      run.enterSide = null; run.enterT = 0;
      run.leanKey = null;
      run.leanCardSide = null;
    }

    /* WHAT IS OUT HERE - and, separately, what has been SAID about it.
       These are two different things and merging them cost a playthrough.
       `cued` means the shoal is known: the pull-over will accept it, the card
       can show it, the chart marks it. Everything in range earns that.
       `said` means the voice has mentioned it, and only ONE shoal is ever
       spoken about - activeSpot(), the same one the card is showing. The
       announcer used to walk its own list with the job's place pushed to the
       front, so the voice could be talking about one shoal while the card
       showed another, and the two named different fish on different sides. */
    const near = shoalsNear(run.x, run.z, spotSearchRange());
    for (let i = 0; i < near.length; i++) {
      const sh = near[i];
      if (aheadOf(sh) < -20) continue;          // astern; you have passed it
      if (!fishableShoal(sh)) continue;         // not for this boat, or this rod
      run.cued[sh.key] = 1;
    }
    const call = activeSpot();
    if (call && !run.said[call.key] && aheadOf(call) >= -20 &&
        Math.hypot(call.x - run.x, call.z - run.z) <= cueRange()) {
      run.said[call.key] = 1;
      run.cued[call.key] = 1;
      announceShoal(call);
    } else if (call && run.said[call.key]) {
      /* IT MOVED. Called several hundred units ahead and then never mentioned
         again, a shoal ends up on the other side of the boat the moment you
         steer - which is the whole activity. The card works the side out every
         frame; now the voice does too. */
      const now = sideOf(call);
      /* Not oftener than every five seconds, and not for something half a
         lake away: a correction is worth hearing, a running commentary on a
         zig-zag is not. */
      /* Abeam counts. Wanting the shoal twenty units AHEAD meant the one
         moment the side is most likely to have just changed - the boat coming
         level with it - was the one moment the game could not say so, and a
         wrong side stood for half a minute. */
      /* NOT WHILE YOU ARE HOLDING FOR IT. The card is pinned to the side the
         shoal was offered on for the length of the hold, and the boat is
         turning onto it - so "on your right now" over a card on the left is
         the game arguing with itself at the one moment the player is
         committing. Its side stops being news the moment the hold latches. */
      /* ONLY ABOUT THE FISH ON SCREEN. A hold pins the card to the shoal
         being held for, which during a hold is not always the one the
         announcer would pick - and correcting the side of a shoal the card is
         not showing is the game naming a fish the player has nothing on
         screen for. It stood for fifty seconds on one trip. Both now read
         cardShoal(), so they cannot be discussing different fish. */
      const shown = cardShoal();
      const offScreen = !shown || shown.key !== call.key;
      /* AND NOT WHILE THE CARD'S SIDE IS FROZEN. A hold pins the card to the
         side the shoal was offered on, on purpose - the boat is turning onto
         it and the card must not hop across the screen mid-commitment. So
         that is the one moment the geometric side is not news: saying it
         would contradict the card by design. */
      const pinned = !!heldShoal();
      /* THE CLOCK STARTS WHEN THE PIN LIFTS. Corrections are rate-limited to
         one every five seconds so a zig-zag does not become a commentary, but
         a hold that swallows three seconds and then lets go would leave the
         wrong side standing for eight. If the side went stale while the card
         was frozen, the correction is owed the moment the card is free. */
      /* WHAT THE EAR HAS, which is a NAME and a SIDE - not a shoal. Two
         pike shoals within a hundred units of each other are two different
         keys to the game and one sentence to the player: it said "Northern
         Pike on your left" about the first, the card quietly moved on to the
         second on the right, and because that one's own side had never
         changed there was nothing to correct. Per shoal, both statements were
         true; in the player's ear the game had a pike on the wrong side for
         eight seconds. So the test is against the words last spoken. */
      const spoke = run.spoke || null;
      const misleading = !spoke || spoke.name !== (call.fishName || 'They') ||
                         spoke.side !== now;
      if (!offScreen && pinned && misleading) run.sideSaid = 0;
      /* NO RANGE OF ITS OWN. The correction used to insist the shoal be
         inside cueRange() and still ahead of the beam, which are the rules
         for making a FIRST call. The card keeps a shoal up further out than
         that and after the boat has drawn level with it, so between the two
         ranges sat a band where the card showed a fish and the voice was
         forbidden from saying it had swapped sides - a wrong side standing
         for eight seconds. Whether the card is showing it is the only
         question that matters, and `offScreen` is that question. */
      if (!offScreen && !pinned && misleading &&
          clockSeconds() - (run.sideSaid || 0) > 5) {
        run.sideSaid = clockSeconds();
        run.cuedSide[call.key] = now;
        run.spoke = { name: call.fishName || 'They', side: now };
        run.armed = now;
        say((call.fishName || 'They') + ' on your ' + now + ' now.');
        if (cueLevel >= 1) RT.audio.panTone(now);
        fire('onCue', {
          left: now === 'left', right: now === 'right',
          leftTarget: now === 'left' && wantsShoal(call),
          rightTarget: now === 'right' && wantsShoal(call),
          text: now === 'left' ? 'FISH LEFT' : 'FISH RIGHT'
        });
        fire('onEdgeGlow', {
          left: now === 'left' ? (wantsShoal(call) ? 'target' : 'other') : null,
          right: now === 'right' ? (wantsShoal(call) ? 'target' : 'other') : null
        });
      }
    }

    pushSpots();
  }

  /** What the chart should mark: the shoals around the boat. */
  function pendingForMap() {
    const out = [];
    shoalsNear(run.x, run.z, 620).forEach(function (sh) {
      out.push({
        x: sh.x, z: sh.z, spent: !!run.taken[sh.key], cued: !!run.cued[sh.key],
        shoals: [{
          x: sh.x, z: sh.z, fishName: sh.fishName, fishColor: sh.fishColor,
          isTarget: wantsShoal(sh), fishId: sh.fishId,
          isPlace: !!sh.isPlace, biome: sh.biome || null
        }]
      });
    });
    return out;
  }

  /** Is this the fish the job wants? */
  function isWanted(fishId) {
    const m = currentMission();
    const t = m && m.target;
    return !!(t && t.speciesId && t.speciesId === fishId);
  }

  /**
   * The job's fish, in the water the job actually asked for.
   *
   * "That is your fish, pull over" was said of ANY shoal of the right
   * species, and a job can name a depth as well: job 33 counts lake trout
   * only from eighty feet down. So the game called a sixty-foot trout shoal
   * "yours", sent the boat to it, and then refused to credit what came up.
   * Reported: "mission 33 says that is your fish, though I need to be in
   * water more than 75 feet for that mission, so it might be confusing."
   *
   * The species alone still answers isWanted(), which is what the tackle box
   * and the lure rules are about. This is the question the VOICE and the
   * cards should be asking.
   */
  function wantsShoal(sh) {
    if (!sh) return false;
    if (sh.isPlace) return true;
    if (!isWanted(sh.fishId)) return false;
    const t = (currentMission() || {}).target;
    if (t && t.minDepthFt && (sh.ft || 0) < t.minDepthFt) return false;
    return true;
  }

  /** Say what is down there, and which way to steer for it. */
  function announceShoal(sh) {
    const side = sideOf(sh);
    const wanted = wantsShoal(sh);
    run.armed = side;
    /* Which side this was called on, so the claim can be corrected when the
       boat turns rather than left standing. */
    run.cuedSide[sh.key] = side;
    run.sideSaid = clockSeconds();
    /* The words the player now has in their ear, which is what any later
       correction is measured against. */
    run.spoke = { name: sh.fishName || 'They', side: side };
    /* A MAGNET SPOT SAYS SO. It used to be announced in exactly the words a
       shoal of perch gets - "the shallow scrap markers on the left" - which
       tells a player nothing about what to do when they get there. */
    if (sh.magnetSpot) {
      say('Coming up on ' + sh.fishName + ', ' + side +
          '. That is the magnet spot - pull over, and make sure the magnet is on the line.');
    } else {
      say(sh.fishName + ' on the ' + side +
          (wanted ? (sh.isPlace ? ' \u2014 that is the place, pull over'
                            : ' \u2014 that is your fish, pull over') : '') + '.');
    }
    if (cueLevel >= 1) RT.audio.panTone(side);
    fire('onCue', {
      left: side === 'left', right: side === 'right',
      leftTarget: side === 'left' && wanted,
      rightTarget: side === 'right' && wanted,
      text: side === 'left' ? 'FISH LEFT' : 'FISH RIGHT'
    });
    fire('onEdgeGlow', {
      left: side === 'left' ? (wanted ? 'target' : 'other') : null,
      right: side === 'right' ? (wanted ? 'target' : 'other') : null
    });
  }

  /**
   * The shoal the game is currently talking about: nearest, ahead, unfished.
   *
   * Asked for several times a frame - by the cue, the card, the pull-over and
   * the banner - and it sweeps a wide circle of the lake, so the answer is
   * kept for the frame it was worked out in.
   */
  /**
   * The shoal a running hold is latched to, if there is one.
   *
   * A hold pins the card: three seconds is fifty units of water and the shoal
   * you are pulling in on must not drop off the screen underneath you. That
   * pinning is why the voice needs to ask the same question - the card is not
   * showing activeSpot() during a hold, so a correction about activeSpot() is
   * a correction about a fish nobody can see.
   */
  function heldShoal() {
    if (!run || !run.leanKey || run.taken[run.leanKey]) return null;
    if (heldShoal._f === frameNo) return heldShoal._c;
    heldShoal._f = frameNo;
    heldShoal._c = shoalsNear(run.x, run.z, spotSearchRange() + 120)
      .find(function (q) { return q.key === run.leanKey; }) || null;
    return heldShoal._c;
  }

  /** The one shoal on screen right now - what the card is showing. */
  function cardShoal() {
    return heldShoal() || activeSpot();
  }

  function activeSpot() {
    if (activeSpot._f === frameNo) return activeSpot._c;
    activeSpot._f = frameNo;
    activeSpot._c = activeSpotNow();
    return activeSpot._c;
  }
  /**
   * How near you have to be before a card is offered for this.
   *
   * Further out for the job's own place. Reported on the log jam: "it only
   * shows fishing spots, so it's hard to know if the magnet will get the
   * item we need" - the jam and a shoal of perch were offered on the same
   * seventy-three units, so a perch that happened to be nearer took the card
   * off the one thing the trip was for. The place is why you are out here;
   * it gets a wider door.
   */
  function offerFor(sh) {
    return sh && sh.isPlace ? offerRange() * 1.5 : offerRange();
  }

  /**
   * With the helper on, ONE spot is on offer: the one it is steering to.
   *
   * Steering somebody to a lake trout shoal while handing them a cisco card
   * on the way is two instructions at once, and the card is the one they can
   * press - so the trip becomes a run of wrong stops and the target appears
   * to wander. Reported, more than once: "it goes from one shoal to another
   * instead of targeting the singular spot, which is what I continue to ask
   * for."
   *
   * Free driving is exactly what it was. Turn the helper off in Options and
   * every shoal is on offer again - that is the mode it is for.
   */
  function helperOnlyKey() {
    if (!run || save.helper === false) return null;
    const h = run.helperAt;
    if (!h || h.water || !h.key) return null;
    if (run.taken[h.key]) return null;
    return h.key;
  }

  function activeSpotNow() {
    /* THE OFFER, not the call. A card is an invitation to fish HERE. */
    const near = shoalsNear(run.x, run.z, offerRange() * 1.5);
    const only = helperOnlyKey();
    const usable = near.filter(function (sh) {
      if (run.taken[sh.key]) return false;
      if (!fishableShoal(sh)) return false;
      if (Math.hypot(sh.x - run.x, sh.z - run.z) > offerFor(sh)) return false;
      /* The shoal the helper is holding stays on offer the whole way round
         the circle. Astern for half of every lap is not "you have passed it",
         and dropping the card there is what made it flicker on and off while
         the boat held station. */
      if (only && sh.key === only) return true;
      return aheadOf(sh) >= -40;
    });
    if (only) {
      return usable.find(function (sh) { return sh.key === only; }) || null;
    }
    if (!usable.length) return null;
    /* The job's own place outranks a closer shoal of something else - it is
       the reason the trip is happening. This preference used to live in the
       announcer instead, which is how the voice and the card came to be
       talking about two different shoals. */
    return usable.find(function (sh) { return sh.isPlace; }) || usable[0];
  }

  /**
   * What pulling over onto this side would put you on.
   *
   * A shoal if there is one that way, and open water if not - because you can
   * stop and fish ANYWHERE, and a pull-over that refused unless the game had
   * laid something there would be a pull-over that mostly refused.
   */
  function spotToEnter(side) {
    const near = shoalsNear(run.x, run.z, offerRange() * 1.5);
    /* One spot at a time while the helper is steering - see helperOnlyKey.
       Its shoal is taken on whichever side it happens to be, because the
       boat is going round it and the side changes every few seconds. */
    const only = helperOnlyKey();
    if (only) {
      const mine = near.find(function (sh) {
        return sh.key === only && !run.taken[sh.key] && fishableShoal(sh) &&
               Math.hypot(sh.x - run.x, sh.z - run.z) <= offerFor(sh);
      });
      return mine ? asSpot(mine, side) : openWaterSpot();
    }
    const ok = near.filter(sh => !run.taken[sh.key] && aheadOf(sh) >= -40 &&
                                 sideOf(sh) === side && fishableShoal(sh) &&
                                 Math.hypot(sh.x - run.x, sh.z - run.z) <= offerFor(sh));
    if (!ok.length) return openWaterSpot();
    /* The job's place first, then the job's fish, then whatever is nearest -
       pulling over beside the thing you came out for must never land you on
       a perch shoal that happened to be closer. */
    const pick = ok.find(sh => sh.isPlace) || ok.find(sh => wantsShoal(sh)) || ok[0];
    return asSpot(pick, side);
  }

  /** A shoal, in the shape the cards and the scene expect of a spot. */
  function asSpot(sh, side) {
    return {
      key: sh.key, x: sh.x, z: sh.z, open: false, spent: false,
      shoals: [{
        side: side || sideOf(sh), x: sh.x, z: sh.z, ft: sh.ft,
        /* A COPY, so anything the card needs has to be copied. The picture of
           what is down there and the "this is a magnet spot" flag were both
           left behind here, which is why a salvage marker went on being drawn
           as a fish long after the shoal itself knew better. */
        magnetSpot: !!sh.magnetSpot, art: sh.art || null,
        fishId: sh.fishId, fishName: sh.fishName, fishColor: sh.fishColor,
        fishLength: sh.fishLength, isTarget: wantsShoal(sh),
        biome: sh.biome || null, isPlace: !!sh.isPlace,
        radius: sh.radius, count: sh.count, seed: sh.seed, pool: sh.pool
      }],
      job: sh.job || null, isPlace: !!sh.isPlace
    };
  }

  /** Stopping where you are, on nothing in particular. */
  function openWaterSpot() {
    return { key: null, x: run.x, z: run.z, open: true, spent: false, shoals: [] };
  }

  /**
   * Commit to stopping. The boat runs up onto the shoal and halts there.
   *
   * It goes TO the fish rather than stopping level with them, because the
   * alternative is committing to a shoal and then being told there is nothing
   * in reach - which is what happens when the boat halts a couple of hundred
   * units short of the thing it just agreed to fish.
   */
  function enterSpot(spot, side) {
    run.current = spot;
    run.fishSide = side || 'right';
    run.state = S.ARRIVE;
    run.timer = 0;
    run.fromX = run.x;
    run.fromZ = run.z;
    /* Stop just short of the shoal, on the near side of it, so the cast has
       somewhere to go. Right on top of it and every cast is a drop. */
    if (spot.open) {
      run.toX = run.x; run.toZ = run.z;
    } else {
      const dx = spot.x - run.x, dz = spot.z - run.z;
      const d = Math.hypot(dx, dz) || 1;
      /* Stop within a cast of the fish. The stand-off used to be a fixed
         twenty-seven units, which was fine when every rod threw a hundred and
         fifty feet; a thirty-foot bamboo rod pulled over onto a shoal it
         could not then reach. */
      const rodCast = run.range || castRange(bestRodId());
      const stand = Math.max(0, d - Math.max(CFG.SPOT_RADIUS * 0.9,
                                             Math.min(CFG.SPOT_RADIUS * 1.6, rodCast * 0.72)));
      run.toX = run.x + dx / d * stand;
      run.toZ = run.z + dz / d * stand;
      if (!canFloat(run.toX, run.toZ) || barred(run.x, run.z, run.toX, run.toZ)) {
        run.toX = run.x; run.toZ = run.z;
      }
    }
    const gap = Math.hypot(run.toX - run.x, run.toZ - run.z);
    run.arriveTime = Math.min(CFG.ARRIVE_MAX,
                              CFG.STOP_TIME + CFG.RUN_UP_TIME * (gap / 260));
    run.steerDir = 0;
    run.rudder = null;
    run.enterT = 0;
    run.enterSide = null;
    run.leanSide = null;
    run.leanT = 0;
    run.pullLock = null;
    if (gap > 12) RT.audio.motorUp(); else RT.audio.motorIdle();
  }

  function updateArrive(dt) {
    run.timer += dt;
    const T = run.arriveTime || CFG.STOP_TIME;
    const k = U.smoothstep(Math.min(1, run.timer / T));
    run.x = U.lerp(run.fromX, run.toX, k);
    run.z = U.lerp(run.fromZ, run.toZ, k);
    /* Come round to face the shoal on the way in, so the rod is pointing at
       the thing you stopped for. */
    if (run.current && !run.current.open) {
      /* Come ALONGSIDE, not bow-on: the rod is cast over the beam on the
         fishing side, so that is the side that has to face the fish. Bow-on
         put every shoal dead ahead of a rod pointing sideways. */
      const fside = run.fishSide === 'left' ? -1 : 1;
      const want = Math.atan2(run.current.x - run.x, -(run.current.z - run.z)) - fside * Math.PI / 2;
      let d = want - run.head;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      run.head += d * Math.min(1, dt * 3.0);
    }
    run.yaw = U.damp(run.yaw, 0, 3.5, dt);
    run.steerDir = 0;
    run.rudder = null;
    if (run.timer >= T) {
      /* Square up. The turn was eased into over the run-up and often did not
         finish, which left the shoal off the bow while the rod pointed over
         the beam - so every cast sailed past it into open water. Ending the
         arrival ON the heading means the fish are where the rod is pointed. */
      if (run.current && !run.current.open) {
        const fside = run.fishSide === 'left' ? -1 : 1;
        run.head = Math.atan2(run.current.x - run.x, -(run.current.z - run.z)) - fside * Math.PI / 2;
      }
      run.yaw = 0;
      RT.audio.motorIdle();
      openSpotCard(false);
    }
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
  /**
   * How much fish a rod can hold, against the fish's own tier.
   *
   * This was a table in this file, keyed by rod id: starter, castmaster,
   * longshot, titanium, coverunner, lightkeeper. The rods in this game are
   * bamboo_rod, fiber_rod, carbon_rod and pro_rod, and have been for a while -
   * so every lookup missed, every rod fell back to class three, and the whole
   * ladder stopped meaning anything. A channel catfish is tier four, which is
   * one class over three, which is a fish you land eighteen times in a
   * hundred - on the two-hundred-dollar pro rod exactly as on the cane pole
   * you start with. Reported as "I keep getting 'something big took that
   * one'", and quite right.
   *
   * It lives on the rod's own record now (content/roster.json), so it is
   * renamed with the rod and cannot be orphaned again.
   */
  function rodClassOf(rodId) {
    const r = rodById(rodId);
    return (r && r.rodClass) || 3;
  }

  /**
   * How much this rod hurts your chances with this species, 0..1.
   *
   * One tier above the rod's class is a long shot; two or more is a story you
   * tell afterwards. Nothing is ever impossible - it is a fishing game, and a
   * flat refusal would just read as the game being broken - but wanting the
   * next rod for the next fish is the whole shape of the progression.
   */
  function rodOdds(f, rodId, isObjective) {
    const cls = rodClassOf(rodId);
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
    const cls = rodClassOf(rodId);
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

  /**
   * The lure a species is caught on, if it has one.
   *
   * Read off the roster rather than written down anywhere: a lure carries the
   * fish it is made for, so adding a fish later is a roster edit and nothing
   * else. Panfish have no lure named after them, and take what is on the
   * hook - which is what the free worms are for.
   */
  const _lureBy = {};
  function lureFor(speciesId) {
    if (!speciesId) return null;
    if (_lureBy[speciesId] !== undefined) return _lureBy[speciesId];
    let best = null, bestW = 0;
    for (const b of (D.BAIT || [])) {
      const w = (b.biasTable && b.biasTable[speciesId]) || 0;
      if (w > bestW) { bestW = w; best = b; }
    }
    _lureBy[speciesId] = best;
    return best;
  }
  /** Is this lure one the fish will take? */
  function lureTakes(bait, speciesId) {
    const want = lureFor(speciesId);
    if (!want) return true;                    // no lure made for it: anything
    return !!(bait && bait.biasTable && bait.biasTable[speciesId]);
  }

  function biteWeightedFishPool(biomeId, baitId, rodId) {
    const bait = baitById(baitId);
    const rod = rodId || bestRodId();
    const held = rodById(rod) || {};
    return D.FISH.filter(f => {
      if (!f.biomeIds.includes(biomeId)) return false;
      /* A net nets and a hook hooks. Minnows and shiners are netOnly - two
         inches of fish that are not going to take a worm on a hook - and
         everything else needs one. Without this the rod off the dock kept
         pulling up bait minnows, which is wrong twice over: it is not how
         they are caught, and it is the one job the net exists for. */
      if (f.netOnly && !held.isNet) return false;
      if (!f.netOnly && held.isNet) return false;
      // The secret fish only enters a pool when its own bait is equipped.
      if (f.secret) return !!(bait.biasTable && bait.biasTable[f.id]);
      /* AND THE FISH DECIDES THE LURE. A species somebody makes a lure for is
         caught on that lure: a channel catfish wants stink bait on the bottom
         and will not come up for a worm under a float. The panfish the first
         hour is about have no lure named after them and take whatever is on
         the hook, which is what keeps the free worms worth having. */
      if (!lureTakes(bait, f.id)) return false;
      return true;
    }).map(f => {
      const bias = (bait.biasTable && bait.biasTable[f.id]) || 0;
      /* Bait tips the odds TOWARD a species. It used to tip them away from the
         one the job was about whenever the lure did not name it - a weight of
         0.45 against everything else's 1.0 - which made the fish you had been
         sent for the least likely thing in the water. The right lure is a
         bonus now; not having it is simply no bonus. */
      const baitW = bias || 1;
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
    /* THE RIG GOES. Rare, and only on a hook - a net has nothing to lose and a
       magnet is tied on. Whatever does it is never seen: the line simply comes
       back bare, and that is the whole of what anybody on this lake knows. */
    const rodNow = rodById(rodId || bestRodId()) || {};
    /* A rod worked past its rating loses rigs. Fishing ninety feet on a
       thirty-foot cane pole is not forbidden - you can take anything
       anywhere - it simply goes badly, which is what makes choosing the kit
       a decision rather than a formality. */
    let snap = CFG.SNAP_CHANCE;
    if (run && run.landing && rodNow.reachFt) {
      const over = (run.landing.depthFt || 0) - rodNow.reachFt;
      if (over > 0) snap *= over > 25 ? 7 : 3.5;
    }
    if (!rodNow.isNet && rand() < snap) return { category: 'snap' };
    if (r < odds.NOTHING) return { category: 'nothing' };
    if (r < odds.NOTHING + odds.VALUABLE) return { category: 'valuable' };
    if (r < odds.NOTHING + odds.VALUABLE + odds.JUNK) return { category: 'junk' };

    /* ── THE TWO THINGS THAT ONLY EXIST ON THE QUIET LAKE ──────────────
       Rolled before the ordinary tables and never mentioned to anybody: one
       cast in two hundred, and only ever the right lure in the right water,
       or the heavy magnet on the bottom. Whatever is already in the logbook
       is out of the draw, so the tenth is no harder to find than the first. */
    const relic = rollRelicBite(biomeId, rand);
    if (relic) return relic;
    const odd = rollMysteryBite(biomeId, baitId, rodId, rand);
    if (odd) return odd;

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
    let namedShare = CFG.SHOAL_NAMED_SHARE * (lureSuits ? 1 : CFG.WRONG_BAIT_SHARE);
    /* ...but not while the job's fish is in the same water. A shoal named
       after the biggest thing at that depth took three bites in four, so a
       job about sunfish fished over a perch shoal - which is every shoal
       under the dock - caught perch all morning. */
    const obj = objectiveSpecies();
    if (obj && namedId !== obj && pool.some(x => x.f.id === obj)) {
      namedShare = Math.min(namedShare, 0.3);
    }
    if (onShoal && namedId && pool.some(x => x.f.id === namedId) &&
        rand() < namedShare) {
      return taken(namedId);
    }
    const total = pool.reduce((s, x) => s + x.w, 0);
    let pick = rand() * total;
    for (const x of pool) { pick -= x.w; if (pick <= 0) return taken(x.f.id); }
    return taken(pool[pool.length - 1].f.id);
  }

  /* ── TEN FISH THAT ARE IN NO BOOK ────────────────────────────────────
     Each wants ONE lure in ONE of the four waters, and comes up about once in
     two hundred casts that fit. None of it is written anywhere a player can
     read: they are marked `secret`, so no shoal names them, no depth list
     holds them, the tackle box does not hint at them and no card shows one
     until it is on the line. "It's a complete experiment for the player to
     try to catch a new fish."

     The rod still has to be able to fish the water - a cane pole is not going
     to bring a tiger muskie up off a weedbed - but the rare roll is not then
     thrown away on a gear miss, because a one-in-two-hundred event that
     silently fails is indistinguishable from the game being broken. */
  function mysteryFish() {
    return D.FISH.filter(function (f) { return f.mystery; });
  }
  function rollMysteryBite(biomeId, baitId, rodId, rnd) {
    const rand = rnd || Math.random;
    if (!isSolved()) return null;
    const bait = baitId || equippedBaitId();
    const held = rodById(rodId || bestRodId()) || {};
    if (held.isNet) return null;
    const got = setHeld('mystery');
    const up = mysteryFish().filter(function (f) {
      if (got.indexOf(f.id) >= 0) return false;          // one each, for good
      if (f.mystery.biomeId !== biomeId) return false;
      if (f.mystery.baitId !== bait) return false;
      /* Rated for the depth it lives at, or it never takes. */
      return !held.reachFt || held.reachFt >= f.depthFt[0];
    });
    if (!up.length) return null;
    const each = up[0].mystery.chance || 0.005;
    if (rand() >= each * up.length) return null;
    const f = up[Math.floor(rand() * up.length)];
    return { category: 'fish', speciesId: f.id, mystery: true };
  }

  /* ── AND TEN THINGS SOMEBODY LOST ────────────────────────────────────
     "You need the heavy magnet to get the rare after-gameplay items." So you
     do: nothing else lifts them, they are one to a lake, and each is lying in
     one of the four waters with nothing to say which. */
  function relicTable() { return (D.ITEM_TABLE || {}).relic || []; }
  function hasHeavyMagnet() {
    const t = equippedTool();
    return !!(t && t.id === 'heavy_magnet');
  }
  function rollRelicBite(biomeId, rnd) {
    const rand = rnd || Math.random;
    if (!isSolved() || !hasHeavyMagnet()) return null;
    const got = setHeld('relics');
    const up = relicTable().filter(function (it) {
      return got.indexOf(it.id) < 0 && it.biomeId === biomeId;
    });
    if (!up.length) return null;
    const each = up[0].chance || 0.005;
    if (rand() >= each * up.length) return null;
    const it = up[Math.floor(rand() * up.length)];
    return { category: 'relic', itemId: it.id };
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
    return { type: 'fish', id: f.id, name: f.name, length, weight, value,
             qualityLabel: b.label, quality, secret: !!f.secret, tier: f.difficultyTier,
             /* NOTHING IS TOO SMALL. This game tags and releases every fish it
                catches - Walt says so in his first breath, "nothing gets kept
                on my dock" - and a size limit is a rule about what you may
                KEEP. A short perch was tagged, logged, and then not counted,
                paid nothing and apologised for. The switch that turned this
                off left Settings a while ago as useless; the rule should have
                gone with it. */
             released: false };
  }
  /* Boot, tyre, tin can, weeds - all four still come up, as they always have.
     They are the lake's own joke and they are nothing to do with gear. */
  /**
   * One of these, by how likely each of them is.
   *
   * A lake has more weed in it than wallets. Picking with one call to random
   * over the length of a list says otherwise - reported as "we keep getting
   * soggy wallets" - so the weights on the items decide, and this is the only
   * place that reads them.
   */
  function pickWeighted(list) {
    if (!list || !list.length) return null;
    let total = 0;
    for (let i = 0; i < list.length; i++) total += list[i].weight == null ? 1 : list[i].weight;
    let r = Math.random() * total;
    for (let i = 0; i < list.length; i++) {
      r -= list[i].weight == null ? 1 : list[i].weight;
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  function rollJunkItem() {
    /* EXCEPT WITH A MAGNET ON THE LINE, when about half of what comes up off
       the bottom is iron, because that is what a magnet does. It is also the
       only way scrap can be gathered at all outside a salvage job's own
       marked place - which left "trade five pieces of scrap to Walt" with no
       source but the occasional lucky valuable, and a playthrough stalled on
       it one run in three. Put the magnet on and you gather scrap; leave it
       off and you catch fish. That is the tackle box doing its job. */
    if (hasMagnet() && Math.random() < 0.55) {
      const it = pickWeighted(D.ITEM_TABLE.scrap);
      if (it) return { type: 'valuable', id: it.id, name: it.name, value: it.value || 0 };
    }
    /* What a HOOK can snag. The surface litter Walt has you netting off the
       reed beds is netOnly - a rod does not pick a floating bag off the top of
       the water - so it stays out of this table unless there is a net in your
       hands. */
    /* AND THE THINGS WORTH SOMETHING SNAG ON A HOOK TOO. A ring in the mud
       does not care what you dragged past it, and `valuable` was a category
       with nothing in it - so the one bite in twenty that is meant to be a
       lucky find has only ever handed back scrap iron. */
    const held = equippedRod();
    const table = (D.ITEM_TABLE.junk || []).concat(D.ITEM_TABLE.valuable || [])
      .filter(function (it) {
        const rec = (D.ITEMS || []).find(function (x) { return x.id === it.id; }) || {};
        return held && held.isNet ? true : !rec.netOnly;
      });
    const i = pickWeighted(table);
    if (!i) return { type: 'junk', id: 'weeds', name: 'Tangle of Weeds', value: 0 };
    const rec = (D.ITEMS || []).find(function (x) { return x.id === i.id; }) || {};
    return { type: rec.kind === 'valuable' ? 'valuable' : 'junk',
             id: i.id, name: i.name, value: i.value || 0 };
  }
  function rollValuableItem() {
    /* Nothing comes off the bottom without a magnet on the line. With one, it
       is scrap - money against the tab, and the raw material of the sonar. */
    if (!hasMagnet()) return rollJunkItem();
    const list = (D.ITEM_TABLE.scrap || []).concat(D.ITEM_TABLE.valuable || []);
    const i = pickWeighted(list);
    if (!i) return rollJunkItem();
    return { type: 'valuable', id: i.id, name: i.name, value: i.value || 0 };
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
    boot: '' + itemIc('boot') + '', tire: '' + itemIc('tire') + '', tincan: '' + itemIc('tincan') + '', weeds: '' + itemIc('weeds') + '',
    wallet: '' + itemIc('wallet') + '', phone: '' + itemIc('phone') + '', watch: '' + itemIc('watch') + '', ring: '' + itemIc('ring') + ''
  };
  function catchArtSrc(o) {
    if (o.type === 'fish') return 'images/fish/' + o.id + '.png';
    if (o.type === 'empty') return null;      // nothing came up; nothing to show
    if (o.type === 'junk' || o.type === 'valuable') {
      /* MORE THAN ONE PAINTING, where an item has more than one. Scrap is
         what a magnet brings up most - forty hauls in a session - and one
         picture for all of them reads as catching the same lump over and
         over. What an object can look like is a fact about the object, so
         the list is on the item in the roster. */
      const rec = (D.ITEMS || []).find(function (i) { return i.id === o.id; });
      const art = rec && rec.art;
      if (art && art.length) return 'images/items/' + art[Math.floor(Math.random() * art.length)] + '.png';
      return 'images/items/' + o.id + '.png';
    }
    return null;
  }
  /* The hand net has no painting and does not need one: it is a thing built in
     three dimensions and held in front of you, not a rod on a card. */
  /* THE NET IS PAINTED NOW TOO. It was excluded here because nobody had ever
     drawn it, so it fell through to the generic 'creel' icon - a woven wicker
     basket, which is what a creel is, standing in for the one piece of tackle
     the whole first hour is played with. Reported: "the mesh hand net is a
     bamboo basket." */
  function rodHasArt(r) { return !!r && r.id !== 'none'; }
  function rodArtSrc(r)  { return rodHasArt(r) ? 'images/rods/' + r.id + '.png' : ''; }
  function rodIconSrc(r) { return rodHasArt(r) ? 'images/rods/' + r.id + '-icon.png' : ''; }
  /* AND THE MAGNETS ARE PAINTED. They were shown as an ANCHOR - the nearest
     thing in the icon set to a lump of iron on a rope - which is not what a
     magnet looks like. Reported: "the magnet lure #1 looks like an anchor, it
     should look like an arch magnet." Horseshoe magnets, one per tool, and
     anything else on the shelf keeps its icon. */
  function toolIconSrc(t) {
    return (t && t.kind === 'magnet') ? 'images/tools/' + t.id + '-icon.png' : '';
  }
  /* No lure has ever been painted - each shows an icon instead (BAIT_EMOJI) -
     so this returns nothing rather than a path to a file that is not there.
     The one painting that did exist was for a secret bait from a puzzle that
     is no longer in the game. */
  function baitArtSrc() { return ''; }

  /* No lure was ever painted, so each shows an icon instead of a missing
     image. These were keyed to the OLD lure list - plainworm, jitterbug,
     leechrig - none of which exists any more, so every lure in the game fell
     through to nothing. */
  const BAIT_EMOJI = {
    earthworm: '' + ic('bait') + '',
    shiner_bait: '' + ic('fish') + '',
    spoon: '' + ic('sparkle') + '',
    stinkbait: '' + ic('flask') + '',
    /* The deep rig was an ANCHOR - the nearest thing in the icon set to
       "heavy thing that goes down", and not what a rig looks like. Reported:
       "deep rig is also an anchor icon, it should be something that represents
       a lure that's a deep rig lure." It is painted now: a lead weight and a
       minnow lure, which is what the roster says it is - "gets a bait down
       past the thermocline and keeps it there". */
    deep_rig: '' + ic('anchor') + ''
  };
  /* WHICH LURES ARE PAINTED. Only the ones actually drawn: everything else
     shows its icon, which is the intended state rather than a fault. */
  const BAIT_ART = { deep_rig: 1 };
  function baitIconSrc(id) {
    return BAIT_ART[id] ? 'images/bait/' + id + '-icon.png' : '';
  }
  /* No lure is painted, so each shows an icon. There used to be one exception,
     a secret bait from a puzzle that is no longer in the game. */
  function baitArt(b) {
    const src = baitIconSrc(b && b.id);
    /* A painting where there is one, with the icon behind it if the file is
       missing - the same fallback the rods and the magnets use. */
    const emoji = src
      ? '<img class="hudKitArt" src="' + src + '" alt="" ' +
        'onerror="this.outerHTML=this.dataset.fb||&quot;&quot;" data-fb="' +
        (BAIT_EMOJI[b.id] || '' + ic('bait') + '').replace(/"/g, '&quot;') + '">'
      : (BAIT_EMOJI[b && b.id] || '' + ic('bait') + '');
    return { src: src || null, emoji: emoji };
  }

  /** Quality never loses the fish. The only way one does not land is the
      junk/valuable roll made at bite time, unrelated to how it was reeled. */
  /**
   * The thing this job sent you here for, if you are standing over it.
   *
   * A named retrieval is not a lottery: the job says which plank, the map says
   * where it is, and casting there brings it up. Everything else about the
   * spot is ordinary - you can still hook a fish on the way past.
   *
   * It is also the only route by which ITEM_TABLE.story can appear at all.
   * Nothing rolls from that table, so the six pieces of the Marigold were
   * unobtainable and the story could not be finished.
   */
  /**
   * Is the line in the water the job is about?
   *
   * The boat stops where the spot it entered is, which is near the job's
   * marker and hardly ever on it - so asking "have you stopped on the marker"
   * meant the propeller the job wanted could not come up at all, and the job
   * could not be finished. A magnet fishes the whole line home; what counts
   * is whether the drag passes through the job's water.
   */
  function jobWaterHere() {
    const spot = run && run.current;
    if (spot && spot.job) return spot.job;
    const pl = placeShoal();
    if (!pl || !run) return null;
    /* THE BOAT, or the line. Anchored over the wreck is fishing the wreck
       even when the throw went wide, and a drag that passes over it counts
       wherever the boat happens to be sitting. Measured off the landing
       point alone, only the last two units of a retrieve were ever in the
       job's water and the rate barely moved. */
    const r = (pl.radius || CFG.SPOT_RADIUS) * 1.2;
    if (Math.hypot(run.x - pl.x, run.z - pl.z) <= r) return pl.job;
    const l = run.landing;
    if (l && Math.hypot(l.x - pl.x, l.z - pl.z) <= r) return pl.job;
    return null;
  }

  /**
   * How much of the bottom has been worked over for the job in hand.
   *
   * Kept per job and persisted, so a job half worked is still half worked
   * after a trip back to the dock - and reset the moment the job changes,
   * because the count is about THIS piece of water and nothing else.
   */
  function magHunt(add) {
    const m = currentMission();
    const id = m ? m.id : null;
    if (!save.magHunt || save.magHunt.id !== id) save.magHunt = { id: id, finds: 0 };
    if (add) { save.magHunt.finds++; persist(); }
    return save.magHunt.finds;
  }

  /* How many other things the lake gives up before the thing the job is about
     is among them, and how often it is after that. Four other things first,
     then better than even odds - a bottom that hands you the exact brass
     frame on the first drag is a vending machine, not a lake, and about half
     a dozen finds is a stretch of water worked over rather than a chore. */
  const MAG_HUNT_FIRST = 4;
  const MAG_HUNT_CHANCE = 0.55;

  function jobItemHere() {
    const job = jobWaterHere();
    if (!job) return null;
    /* WORKED OVER FIRST. The cans and the old anchors come up before the
       thing you came for does. */
    const worked = magHunt(false);
    if (hasMagnet()) {
      if (worked < MAG_HUNT_FIRST) return null;
      if (Math.random() > MAG_HUNT_CHANCE) return null;
    }
    const t = job.target || {};
    if (t.type !== 'recoverItem' || !t.itemId) return null;
    if (save.progressValue >= (t.amount || 1)) return null;
    /* Litter is netted off the surface; everything else is iron on the bottom
       and needs a magnet to come up at all. */
    const rec = (D.ITEMS || []).find(i => i.id === t.itemId) || {};
    if (!rec.netOnly && !hasMagnet()) return null;
    if (rec.netOnly && !(equippedRod() && equippedRod().isNet)) return null;
    const tables = D.ITEM_TABLE || {};
    for (const k of Object.keys(tables)) {
      const list = tables[k];
      if (!Array.isArray(list)) continue;
      const hit = list.find(it => (it.id || it) === t.itemId);
      if (hit) {
        return { type: k === 'junk' ? 'junk' : 'valuable',
                 id: hit.id, name: hit.name || hit.id, value: hit.value || 0,
                 storyPiece: k === 'story' };
      }
    }
    return null;
  }

  function resolveCatch(category, speciesId, quality, bite) {
    /* Standing over the thing the job named: that is what comes up, whatever
       the roll said. Only when the roll was NOT a fish, so the water round it
       still fishes normally. */
    if (category !== 'fish') {
      const named = jobItemHere();
      if (named) return named;
    }
    if (category === 'snap') {
      return { type: 'snap', id: 'snap', name: 'The line came back bare', value: 0 };
    }
    if (category === 'fish')     return rollFishCatch(speciesId, quality);
    /* One of the ten. Worth nothing at the counter and worth the whole job:
       Walt has a line for every one of them. */
    if (category === 'relic') {
      const it = relicTable().find(function (x) { return x.id === (bite && bite.itemId); });
      if (it) return { type: 'valuable', id: it.id, name: it.name, value: 0, relic: true };
    }
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
    return D.RODS.find(r => rodClassOf(r.id) >= (f.difficultyTier || 3)) || null;
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
  /**
   * Tell the player their boat wants looking at, while there is still time.
   *
   * The condition of a hull lives on a card in a shop, which is no use to
   * somebody out on the water who is listening rather than reading - and a
   * repair is only a decision if you hear about it before it is a problem.
   * Twice on the way down, once each per trip: never a nag, and never a fail
   * state, because a worn hull is a slower boat and nothing worse.
   */
  const HULL_WORRY = 0.45, HULL_BAD = 0.75;
  /**
   * How hard this water is on a hull, as a multiple.
   *
   * One past the channel through the log jam, five beyond it. The bay is a
   * sheltered pond and the far side is deep, cold and full of sunk timber -
   * and a repair tab that never grows is a repair tab nobody plans for.
   */
  const DEEP_WEAR = 5;
  function deepWearFactor(r) {
    /* NOT ANY MORE. The five-times wear was the cold, the dark and the sunk
       timber; with the jam gone and the fog off the water there is nothing
       out there to punish a hull, and the post-game asks a player to spend
       hours in exactly that water. */
    if (isSolved()) return 1;
    const L = chart();
    if (!r || !L) return 1;
    const bar = (L.barriers || [])[0];
    if (!bar) return 1;
    /* North of the timber is the deep half. Eased in over the last few units
       so crossing the channel is not a step change in the meter. */
    const past = (bar.z - r.z) / 60;
    return 1 + (DEEP_WEAR - 1) * U.clamp(past, 0, 1);
  }

  function hullWatch(v) {
    if (!run || !RT.economy || !v || !v.durability) return;
    const w = RT.economy.status().wear;
    if (w >= HULL_BAD && !run.hullSaid2) {
      run.hullSaid2 = run.hullSaid = true;
      say('The ' + (v.name || 'boat') + ' is in a bad way. Get her to Walt before your next long trip \u2014 he patches a hull for cash or scrap.');
    } else if (w >= HULL_WORRY && !run.hullSaid) {
      run.hullSaid = true;
      say('The ' + (v.name || 'boat') + ' is starting to feel it. Walt should look at that hull soon.');
    }
  }

  function say(text) {
    /* THE WORLD WAITS ITS TURN. Everything in here is something that
       happened on the lake rather than something you pressed, and two of them
       a second apart used to be half of one sentence and half of another. */
    if (cueLevel >= 2) U.speakEvent(text);
    fire('onSpeak', text);
  }

  /**
   * Where a trip starts: off the end of the dock, pointing out.
   *
   * The dock is the origin of the lake and the shore runs east-west through
   * it, so "out" is north - which is -Z, the engine's forward.
   */
  /* How far out along the boards you stand, and how far past you the fish
     are. The jetty reaches 22 units past the waterline, so standing at 16
     leaves six units of decking in front of you; the shoal at 33 is eleven
     units beyond the end of it and 28 feet from the rod tip, which is inside
     the thirty a bamboo rod throws. Both are here, together, because the one
     is measured from the other. */
  /* WHERE YOU STAND ON THE BOARDS, AND WHERE THE FISH ARE.
     The jetty runs 22 units out past the waterline. You stand at 19, near the
     end and on the centreline, looking straight down the boards; the shoal is
     17 further out, past the last plank - 28 feet, inside what a bamboo rod
     throws, because this is the water the first hour of the game is fished
     on. The rail is 6, so a fish is lifted three units beyond the decking
     rather than up through it.

     This was rebuilt once round casting off the SIDE instead, on my own idea
     of how the jetty ought to look in shot. It moved the player, swung the
     aim ninety degrees away from where the camera pointed, and put the target
     square out at the edge of the frame. Casting straight down the boards is
     what was asked for and what works. */
  const DOCK_STAND = 19;
  /* WITH A NET, ON THE LAST PLANK. The jetty reaches 22 and a net reaches
     under three units, so from the rod's stand at 19 the hoop came down on
     the last yard of decking - the handle went through the boards on the way
     into the water. Reported twice. Half a unit in from the end, the dip
     lands two and a half units past the last plank, in open water, with the
     hoop still in frame. Rods keep the stand at 19: their cast goes seventeen
     units past the end whichever plank you throw it from. */
  const DOCK_STAND_NET = 21.5;
  const DOCK_CAST = 17;
  const DOCK_RAIL = 6.0;

  function launchPoint() {
    const L = chart();
    const d = (L && L.dock) || { x: 0, z: 0 };
    /* On foot you stand at the end of the jetty, which is where the boat is
       tied - Scene.showDock puts it sixteen units off the waterline. */
    if (vessel().id === 'foot') {
      /* ON THE BOARDS, LOOKING OUT ALONG THEM.
         The quarter turn is deliberate: the camera looks down the CASTING
         side rather than down the bow, so at this heading you are looking
         straight out along the jetty at the water you are about to cast into,
         with the decking running away beneath you. */
      const x = d.x;
      const stand = equippedRod().isNet ? DOCK_STAND_NET : DOCK_STAND;
      return { x: x, z: shoreZAtChart(x) - stand, head: -Math.PI / 2 };
    }
    /* Afloat, in water this hull can actually float in: the motorboat draws
       over two feet and the dock shallows are not always that. Walk out from
       the mooring until there is water enough under the keel. */
    let z = d.z - 34;
    if (L) {
      const need = draughtFt() + 1.0;
      for (let i = 0; i < 60 && L.depthAt(d.x, z) < need; i++) z -= 5;
    }
    return { x: d.x, z: z, head: 0 };
  }

  /** Where the town shore is at an x, scanning out from the dock. */
  function shoreZAtChart(x) {
    const L = chart();
    if (!L) return 0;
    let z = L.dock.z - 90;
    for (let i = 0; i < 260; i++) {
      if (!L.inWater(x, z + 1)) return z;
      z += 1;
    }
    return L.dock.z;
  }

  /** Standing on the boards: whatever is within a cast is the spot. */
  function footSpot() {
    const near = shoalsNear(run.x, run.z, Math.max(run.range, 30));
    /* On the side you are actually fishing from. It was hardcoded to
       starboard, so once the boards were fished off the PORT side the spot
       and the rod pointed opposite ways and the cast card said there was
       nothing in reach of a shoal seventeen units away. */
    if (near.length) return asSpot(near[0], run.fishSide || 'right');
    return openWaterSpot();
  }
  function standOnDock(afterCatch) {
    /* Out along the boards. At this heading the starboard beam IS the length
       of the jetty, so the cast goes straight ahead past the last plank.
       Set before the spot is built, because the spot is built on this side. */
    run.fishSide = 'right';
    run.current = footSpot();
    run.state = S.SPOT;
    RT.scene.setSpotTargets();
    fire('onCard', { which: 'spot', afterCatch: !!afterCatch,
                     missionDone: targetComplete(run.mission, save.progressValue) });
  }

  function newRun(missionN) {
    /* currentMission(), not missionByN() - once the game is finished there is
       no numbered mission to go out on, and looking one up by number put the
       player back on the finale they had already beaten. */
    const m = currentMission();
    return {
      mission: m,
      rod: equippedRod(),
      bait: equippedBait(),
      /* How far THE ROD IN THE BOAT throws, not the best one owned. With a
         tackle box to pack, those are different numbers - and the trip was
         being measured against a rod that had been left on the shelf. */
      range: castRange(equippedRod().id),
      state: S.STEER,
      /* The odometer, not a coordinate. It was a distance along the rail;
         the fuel burn and the hull wear are both measured against it, so it
         keeps its name and its meaning while the rail goes. */
      dist: 0,
      // Where the boat is, and where it is pointing.
      x: launchPoint().x, z: launchPoint().z, head: launchPoint().head,
      steerDir: 0,
      armed: 'right',        // one-switch: which way the next hold goes
      /* The HELM - how far the wheel is over, not a heading. It used to be a
         swing relative to the rail; now it is what turns `head`. */
      yaw: 0,
      enterT: 0, enterSide: null, fishSide: 'right',
      leanCardSide: null,       // the side the pull-over card was offered on
      leanSide: null, leanT: 0,   // how long the helm has been held over
      pullLock: null,             // a tapped fish card we are committed to

      spotIndex: 0,
      sinceTarget: 0,
      /* Which shoals have been SPOKEN about (as against merely known), which
         side each was last said to be on, and when a side was last corrected
         out loud. */
      said: {}, cuedSide: {}, sideSaid: 0, spoke: null,
      /* What the quest helper is steering for, held rather than re-chosen -
         and whether its hand is on the tiller this moment. */
      helperAt: null, helperHand: false,
      /* The spot it has settled over and is holding, so the arrival is
         announced once rather than every lap. */
      helperCircling: null,
      /* Which way round an obstacle the helm committed to, so it does not
         change its mind every frame. */
      dodge: 0,
      pending: [],
      jobPlaced: false,      // the job's own place goes in once per trip
      towing: null,          // who is on the line behind us, for a rescue
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
      zoneOn: false, zoneT: 0,      // over the fish, and how long since the last chime
      landing: null,
      bite: null,
      reel: null,
      lastCatch: null,
      tripCatch: [],
      tripMoney: 0,
      taken: {}, cued: {},
      leanKey: null,        // the shoal a sustained hold is for
    };
  }

  /* What the cue calls a job's place. Not a fish, so not a fish's name. */
  const JOB_SPOT_NAME = {
    rescue: 'Somebody in trouble',
    secret: 'Something odd in the water',
    retrieval: 'Something on the bottom',
    magnet: 'Something on the bottom',
    story: 'Something on the bottom',
    finale: 'Something on the bottom'
  };

  /* ── The spot stream. Spots keep coming forever, so the player can never be
       stranded on empty water and can never run out of chances. ─────────── */

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
    if (!bestRod()) { say('You have nothing to fish with yet. Walt has a net.'); RT.audio.menuBlocked(); return false; }
    if (!isBriefed()) { say('See Walt first. He has a job for you.'); RT.audio.menuBlocked(); return false; }
    /* WHY YOU ARE IN THE SMALL BOAT. Said once a trip rather than every time:
       a boat quietly changing under somebody who cannot see the dock reads as
       the game losing track of what they own. */
    if (save.towedBoat && !towedSaid) {
      towedSaid = true;
      const b = (roster().vessels || []).find(v => v.id === save.towedBoat);
      say('The ' + ((b && b.name) || 'boat') + ' is still on Walt\u2019s trailer with the ' +
          'stern open. Go and see him when you are ready \u2014 until then you are in the ' +
          (vessel().name || 'one below it') + '.');
    }
    run = newRun(save.currentMission);
    paused = false;
    RT.scene.startTrip(run);
    /* On foot there is nowhere to go: the trip opens straight onto the end
       of the jetty, and "trolling on" is casting again from where you stand. */
    if (vessel().id === 'foot') standOnDock(false);
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
  /** What stands in for a rod when you own none: nothing casts, nothing reaches. */
  const NO_ROD = { id: 'none', name: 'Nothing to fish with', reachFt: 0, castUnits: 0,
                   isNet: false, canHook: false, look: null, reachNote: 'Walt has a net.', description: '' };
  function bestRod() {
    const owned = D.RODS.filter(r => ownsRod(r.id));
    if (!owned.length) return null;
    /* A net job is fished with the net, however good the rod on the rack is -
       minnows and litter do not take a hook. Otherwise the deepest-rated rod
       you own. */
    const m = currentMission();
    const net = owned.find(r => r.isNet);
    if (net && m && m.kind === 'net' && vessel().id === 'foot') return net;   // the net is for the boards and the beach
    const rods = owned.filter(r => !r.isNet);
    if (!rods.length) return net || owned[0];
    return rods.reduce((a, b) => (b.reachFt > a.reachFt ? b : a));
  }
  function bestRodId() { const r = bestRod(); return r ? r.id : null; }
  function ownsRod(id) { return (save.rods || []).indexOf(id) >= 0; }
  /** The next rod up from the one being used, and what it costs. */
  /**
   * The lure this job wants and you have not got, with what it costs.
   *
   * Only ever the CURRENT job's lure - the shelf is not a catalogue of every
   * lure in the game, it is the one thing that would make today's fishing go
   * better. */
  /**
   * What lure Walt has on the shelf for you.
   *
   * The job's own first - the fish it names will not take anything else - and
   * then anything the ladder has unlocked that you have not got. It used to
   * be the job's `baitId` alone, and no job in the ladder set one, so the
   * shelf was empty for thirty-five jobs and four of the five lures in the
   * game could not be bought at all.
   */
  function nextBait() {
    const m = currentMission();
    const want = m && m.target && lureFor(m.target.speciesId);
    const pick = (b) => ({ id: b.id, name: b.name,
                           cost: Math.round(b.costPerUnit * BAIT_GRANT_MULT),
                           note: baitBlurb(b),
                           forJob: !!(want && b.id === want.id) });
    if (want && !ownsBait(want.id)) return pick(want);
    const shelf = (D.BAIT || []).filter(b => !b.free && !ownsBait(b.id) && isUnlocked(b.id));
    return shelf.length ? pick(shelf[0]) : null;
  }

  function nextRod() {
    const held = bestRod();
    return D.RODS.find(r => !ownsRod(r.id) && isUnlocked(r.id) &&
                            (!held || r.reachFt > held.reachFt)) || null;
  }
  function buyRod(id) {
    const r = rodById(id);
    if (!r || ownsRod(id) || !isUnlocked(id) || save.money < r.cost) return null;
    save.money -= r.cost;
    save.rods.push(id);
    if (r.bundlesBait && !ownsBait(r.bundlesBait)) save.baits = (save.baits || []).concat([r.bundlesBait]);
    /* AND IT GOES IN YOUR HANDS. `kitRodId` is only written by the tackle
       box, so anybody who had ever picked a rod in there kept it for ever -
       buy a seventy-five dollar carbon rod, walk out with the fiber rod still
       on your shoulder, and nothing anywhere would mention it. Reported as
       "not sure I knew I had the carbon rod". The net is left alone: it is
       the one thing you choose on purpose and the netting jobs need it. */
    const held = equippedRod();
    if (!held.isNet && (r.reachFt || 0) >= (held.reachFt || 0)) save.kitRodId = r.id;
    persist();
    pushHud();
    return { kind: 'rod', id: r.id, name: r.name, cost: r.cost, inHand: save.kitRodId === r.id,
             note: r.reachNote, description: r.description, art: rodArtSrc(r) };
  }

  /**
   * Fuel and repairs. Partial payment is allowed on both — you put in what you
   * can afford rather than being told no, because being unable to buy fuel is
   * exactly the corner this game refuses to put anyone in.
   */
  function buyFuel(spend) {
    const E = RT.economy;
    if (!E) return null;
    spend = Math.min(Math.max(0, spend | 0), save.money, E.gasPrice());
    if (spend <= 0) return null;
    save.money -= E.buyGas(spend);
    persist();
    pushHud();
    const e = E.status();
    return { kind: 'fuel', name: 'Fuel', cost: spend,
             note: 'Tank is ' + e.fuelWord.toLowerCase() + '.' };
  }

  function buyRepair(spend) {
    const E = RT.economy;
    if (!E) return null;
    spend = Math.min(Math.max(0, spend | 0), save.money, E.repairPrice());
    if (spend <= 0) return null;
    save.money -= E.buyRepair(spend);
    save.repairs = (save.repairs || 0) + 1;
    persist();
    pushHud();
    const e = E.status();
    return { kind: 'repair', name: 'Repairs', cost: spend,
             note: 'Hull is ' + e.wearWord.toLowerCase() + '.' };
  }

  /**
   * Everything the mission log shows.
   *
   * Only jobs up to and including the current one — a list of what you have
   * not been given yet is both a spoiler and a much longer thing to scan. The
   * story beats come from RT.content, which carries the Marigold spine, and
   * are gated on progress the same way, so the recap says only what the player
   * has actually been told.
   */
  function missionLog() {
    const cur = save.currentMission || 1;
    const rows = MISSIONS
      .filter(function (m) { return m.n <= cur; })
      .map(function (m) {
        const done = m.n < cur;
        /* ONLY IF THE JOB NAMES ONE. rodById() falls back to the first rod
           in the list so that the game always has something to fish with -
           and the first rod is the Mesh Hand Net. None of the forty written
           jobs carries a rodId, so every line of the log claimed the net.
           Reported: "my mission log is wrong too, it says all my rods are
           the mesh handnet." A job that names no rod shows no rod, which is
           what the bait beside it has always done. */
        const rod = m.rodId ? rodById(m.rodId) : null;
        const bait = D.BAIT.find(function (b) { return b.id === m.baitId; });
        return {
          n: m.n,
          text: m.text,
          done: done,
          current: m.n === cur,
          rod: rod ? rod.name : null,
          bait: bait ? bait.name : null,
          where: (m.biomes || []).map(biomeName).join(' and '),
          grant: m.grantsRodId
                   ? (rodById(m.grantsRodId) || {}).name
                   : (m.grantsBaitId
                        ? (D.BAIT.find(function (b) { return b.id === m.grantsBaitId; }) || {}).name
                        : null)
        };
      })
      .reverse();                     // newest first: where you are, then how you got here

    /* The story so far. Gated on progress rather than dumped whole — the log
       should never tell you something a keeper has not. */
    const story = [];
    try {
      const c = RT.content;
      if (c && c.story) {
        story.push({ kind: 'spine', text: c.story.logline });
        const pieces = c.story.the_six_pieces || [];
        // One piece per zone, and zones open every fifteen jobs.
        const reached = Math.min(pieces.length, Math.ceil(cur / 15));
        for (let i = 0; i < reached; i++) {
          story.push({ kind: 'piece', text: pieces[i] });
        }
      }
    } catch (e) { /* no content file: the log still works, just without the recap */ }

    return {
      current: cur,
      highest: save.highestMission || cur,
      total: MISSIONS.length,
      completed: Math.max(0, cur - 1),
      earned: save.lifetimeEarned || 0,
      rows: rows,
      story: story
    };
  }

  /**
   * How many chunks make this zone's lap, from content/map.json via
   * RT.content. Falls back to world.js's own default when there is no map,
   * so a checkout without one still builds a playable lake.
   */
  /**
   * Which zone the game is in.
   *
   * One, for now: only Cattail Creek is reachable. It is a function rather
   * than a literal so that travel has one place to change, and so the half
   * dozen call sites that need it stop hardcoding a 1 each.
   */
  /** The one lake, dressed the same way every time you go out. */
  function lakeSeed() { return U.hash('whispering'); }

  /**
   * The rod in the boat.
   *
   * What you PICKED, if you picked one - the whole point of a tackle box is
   * choosing wrong sometimes. Nothing picked falls back to the best rod for
   * the job, which is what somebody who has never opened the box gets.
   */
  function equippedRod() {
    const chosen = save.kitRodId && ownsRod(save.kitRodId) ? rodById(save.kitRodId) : null;
    return chosen || bestRod() || NO_ROD;
  }
  /** The tool on the line: a magnet, the sonar, or nothing. */
  function equippedTool() {
    const id = save.kitToolId;
    if (!id || !ownsTool(id)) return null;
    return (roster().tools || []).find(t => t.id === id) || null;
  }
  /**
   * Pack the box: a rod, and ONE thing on the end of the line.
   *
   * A lure and a magnet are the same slot - a hook with something on it, or a
   * horseshoe magnet - and the box used to let you pick both, then draw the
   * magnet with a worm still on the hook. Whichever you choose takes the
   * other off, and it happens here rather than on the screen so that nothing
   * in the game can end up holding two.
   */
  function equipKit(rodId, baitId, toolId) {
    if (rodId !== undefined) save.kitRodId = (rodId && ownsRod(rodId)) ? rodId : '';
    if (baitId !== undefined) {
      save.kitBaitId = (baitId && ownsBait(baitId)) ? baitId : '';
      if (save.kitBaitId) save.kitToolId = '';          // a lure takes the magnet off
    }
    if (toolId !== undefined) {
      save.kitToolId = (toolId && ownsTool(toolId)) ? toolId : '';
      if (save.kitToolId) save.kitBaitId = '';          // and a magnet takes the lure off
    }
    /* A trip already under way is fishing with whatever was just picked, so
       its reach - and the rod every prediction is measured against - changes
       with it. */
    if (run) { run.range = castRange(equippedRod().id); run.rod = equippedRod(); }
    persist();
    pushHud();
    return { rod: equippedRod(), bait: equippedBait(), tool: equippedTool() };
  }
  function ownsBait(id) { return (save.baits || []).indexOf(id) >= 0; }

  /**
   * The lure on the hook: whichever one you own that this job's fish actually
   * go for. Failing that the job's own named lure, and failing that the plain
   * worm that came with the boat.
   *
   * The suitability test USED to come second, after "the job's own lure if it
   * has been bought". That branch is unreachable in practice — loadSave()
   * hands you the current mission's lure if you are missing it — so the lure
   * was always the one the mission was named after, and the rule described
   * here never ran.
   *
   * That mattered because ten of the twenty-seven species missions name a lure
   * with no bias for their own target, and biteWeightedFishPool() reads a
   * missing bias as 0.45 — it tips the odds AWAY from the fish you were asked
   * to catch. Mission 3 is the plain case: catch three crappie, on the
   * nightcrawler, which does not list crappie; the crappie lure (wax worm) is
   * sold in the shop that same visit and could not get onto the hook.
   *
   * A lure you own and paid for is now used when it suits the job better,
   * which is the whole reason the shop sells it. Where the named lure IS the
   * best for the target it still wins, unchanged.
   */
  function bestBaitFor(m) {
    const target = m && m.target && m.target.speciesId;
    const owned = (save.baits || []).map(baitById).filter(Boolean);
    if (target && owned.length) {
      /* THE ONE WITH THE BEST CHANCE, measured rather than assumed.
         This used to sort on the bias table, which answers "which lure NAMES
         this fish" - and the panfish have no lure of their own on purpose, so
         it answered nothing for them and fell through to the last lure in the
         tray. That is how a crappie job went out with a Deep Rig on, and how
         live shiners - made for the bass in that same bay, where they bury a
         crappie four to one - could be called ready for it.
         Asked properly instead: of everything that bites in that water, how
         much of it would be the fish you were sent for? Ties go to the
         cheapest, which is the free worm - the panfish all tie at a third of
         the water, and a worm is what anybody would put on. */
      let best = null, bestShare = -1;
      owned.forEach(function (b) {
        const sh = targetShareOn(m, b.id);
        const cheaper = best && (b.costPerUnit || 0) < (best.costPerUnit || 0);
        if (sh > bestShare + 1e-9 || (Math.abs(sh - bestShare) < 1e-9 && cheaper)) {
          bestShare = sh; best = b;
        }
      });
      if (best && bestShare > 0) return best;
    }
    /* No owned lure names this fish — or the job has no one species to name
       (a weight target). The lure the job was built around is the best guess
       left. */
    const want = m && m.baitId;
    if (want && ownsBait(want)) return baitById(want);
    return owned[owned.length - 1] || D.BAIT[0];
  }

  const NO_BAIT = { id: 'none', name: 'No bait yet', costPerUnit: 0, free: true, look: null, biasTable: {}, description: '' };
  function equippedBait() {
    if (!(save.baits || []).length) return NO_BAIT;
    /* With a magnet on the line there is no lure on it. Falling back to "the
       best lure for the job" here is what put a worm on the hook of a rod
       that was rigged with a magnet. */
    if (save.kitToolId && ownsTool(save.kitToolId)) {
      const t = (roster().tools || []).find(x => x.id === save.kitToolId);
      if (t && t.kind === 'magnet') return NO_BAIT;
    }
    const chosen = save.kitBaitId && ownsBait(save.kitBaitId) ? baitById(save.kitBaitId) : null;
    return chosen || bestBaitFor(run ? run.mission : currentMission());
  }
  function equippedBaitId() { return equippedBait().id; }
  function buyBait(id) {
    const b = baitById(id);
    if (!b || ownsBait(id)) return null;
    const cost = Math.round(b.costPerUnit * BAIT_GRANT_MULT);
    if (save.money < cost) return null;
    save.money -= cost;
    save.baits.push(id);
    /* ON THE LINE, not in the box. The fish decides the lure, so a stink bait
       bought and left in the tray means the catfish job still cannot be done
       and the game has taken the money for it. Buying one ties it on - and
       takes a magnet off, the way the box does. */
    save.kitBaitId = id;
    save.kitToolId = '';
    persist();
    pushHud();
    return { kind: 'bait', id: b.id, name: b.name, cost: cost,
             note: baitBlurb(b), description: '', art: baitArtSrc(b) };
  }

  function pushHud() {
    const m = run ? run.mission : currentMission();
    const done = targetComplete(m, save.progressValue);
    const briefed = isBriefed();
    fire('onHud', {
      missionN: m.n, missionText: briefed ? m.text : 'Go and see Walt in the tackle shop', free: !!m.free,
      target: briefed ? targetProgressText(m, save.progressValue) : 'See Walt at the shop',
      briefed: briefed,
      targetDone: done,
      /* The rod in your hands, not the one the job is named after.
         `m.rodId` is what the mission was BALANCED around — a target to reach,
         not proof you own it. A job can be handed in without buying its rod
         (turnInState.canTurnIn), so a player who could not afford the
         CastMaster started mission 9 being told they were holding one while
         they fished with the starter. The dock card has always used bestRod();
         this is the same answer, on the water. */
      rodName: equippedRod().name,
      rodIsNet: !!equippedRod().isNet,
      rodArt: rodIconSrc(equippedRod()),
      baitName: equippedBait().name,
      /* WHAT IS ON THE END OF THE LINE, which the helm never said. A lure and
         a magnet are the same slot, and which of the two is rigged decides
         what the whole trip can catch - so it belongs beside the rod. */
      lineName: (function () {
        const t = equippedTool();
        if (t) return t.name;
        const b = equippedBait();
        return (b && b.id !== 'none') ? b.name : '';
      })(),
      lineIsTool: !!equippedTool(),
      lineToolId: (equippedTool() || {}).id || '',
      lineBaitId: (equippedBait() || {}).id || '',
      gear: ownedGear(),
      money: save.money,
      tags: tagCount(),
      vesselName: vessel().name,
      /* WHAT THE BOAT UNDER YOU IS DOING. Only what applies: a kayak has a
         hull and no tank, the canoe is a rental with neither, and on foot
         there is no boat at all. */
      boat: (function () {
        const v = vessel();
        if (!RT.economy || v.id === 'foot') return null;
        const e = RT.economy.status();
        const fuel = !!v.burnsFuel, hull = !!v.durability;
        if (!fuel && !hull) return null;
        return {
          fuel: fuel ? e.fuel : null, fuelWord: fuel ? e.fuelWord : null,
          hull: hull ? 1 - e.wear : null, hullWord: hull ? e.wearWord : null,
        };
      })(),
      debt: RT.economy ? RT.economy.status().debt : 0,
      finale: !!m.finale,
      hint: done ? 'Head back to the dock' : ''
    });
  }

  function pushSpots() {
    if (!run) return;
    /* The shoal the game is talking about - nearest, ahead, unfished - and
       whether we are level with it. The card stays up for as long as the spot
       can still be turned into, and never before it has been called, so
       between one spot going quiet and the next being announced there is open
       water with no card on screen at all. */
    /* THE SHOAL YOU ARE HOLDING FOR, whatever the range says. The boat keeps
       moving while the meter fills - three seconds is fifty units of water -
       so a shoal offered at seventy-three can drop out of range or slip
       behind the beam before the hold completes, and the card would vanish
       while the hold went on working. The hold is latched to the shoal
       (leanKey); so is the card now. */
    const holdingFor = heldShoal();
    const sh = holdingFor || activeSpot();
    const cued = !!(sh && run.cued[sh.key]);
    const dist = sh ? Math.hypot(sh.x - run.x, sh.z - run.z) : Infinity;
    const along = sh && dist < CFG.SPOT_WINDOW ? sh : null;
    /* On the side it was offered on while a hold is running. */
    const shownOn = (holdingFor && run.leanCardSide) || (sh ? sideOf(sh) : null);
    const spot = sh ? asSpot(sh, shownOn) : null;
    const near = !!holdingFor || !!along || cued;
    const side = spot ? spot.shoals[0].side : null;
    pushGuide();
    fire('onSpots', {
      left:  near && side === 'left'  ? shoalInfo(spot, 'left')  : null,
      right: near && side === 'right' ? shoalInfo(spot, 'right') : null,
      alongside: !!along,
      // The helm, -1..1, for the steering pip.
      lateral: U.clamp((run.yaw || 0) / CFG.YAW_MAX, -1, 1),
      entering: run.enterSide,
      enterFrac: U.clamp((run.enterT || 0) / pullOverTime(run.enterSide), 0, 1),
      /* Past the window the decision is made and the boat is simply running up
         to the fish. The UI needs to know, or it goes on asking you to keep
         holding - and ticking at you - long after you have committed. */
      committed: (run.enterT || 0) >= pullOverTime(run.enterSide),
      // What you are pulling in ON, so the banner can name it.
      enteringFish: (function () {
        if (!run.enterSide || !spot || !cued) return null;
        const x = spot.shoals.find(q => q.side === run.enterSide);
        if (!x) return null;
        return { name: x.fishName, isTarget: x.isTarget, waiting: !along };
      })(),
      /* How far out you are, as a fraction of what this vessel will do - the
         thing worth watching on open water. */
      outFrac: (function () {
        const L = chart();
        return L ? U.clamp(L.fromDock(run.x, run.z) / Math.max(1, reach()), 0, 1) : 0;
      })(),
      depthFt: (function () {
        const L = chart();
        return L ? Math.round(L.depthAt(run.x, run.z)) : 0;
      })()
    });
  }

  /**
   * Which way the job is, when the bow is not pointed at it.
   *
   * The arrow is off if the setting is off, if the job has nowhere in
   * particular to be, or if you are already heading within a few degrees of
   * it - so a player on course never sees it, and one going the wrong way
   * across a featureless lake is told, in words as well as in pixels.
   */
  let guideSaid = 0;
  /* Units to yards. A unit is 0.61 of a foot, so a yard is 1.83 units - and
     every distance the game announced was `units / 3`, which reads a unit as a
     foot and reports every range short by a factor of one and two thirds. The
     "184 yards" a player was told about was three hundred. */
  function yards(units) { return Math.round(units / (0.61 * 3)); }
  function pushGuide() {
    if (!run || save.helper === false) { fire('onGuide', null); return; }
    /* WHILE YOU ARE STEERING, and not otherwise. A bearing to steer on is
       worth having when you are driving the lake; standing on the dock or
       stopped over a shoal with a rod in your hands it is a badge across the
       top of the screen pointing somewhere you are not going. */
    if (run.state !== S.STEER && run.state !== S.ARRIVE) { fire('onGuide', null); return; }
    const g1 = helperTarget();
    if (!g1) { fire('onGuide', null); return; }
    /* POINTING AT THE SPOT IS WRONG WHEN THE SPOT IS BEHIND THE LOGS. The
       arrow names a destination rather than the next turn - deliberately, so
       it cannot spin - and the channel is a destination too. It is the one
       the boat has to reach first, so while the pile is in the way that is
       what it points at, and says. */
    const g = viaChannel(g1.x, g1.z) || g1;
    const dx = g.x - run.x, dz = g.z - run.z;
    const dist = Math.hypot(dx, dz);
    /* AT THE PLACE. Pointed along the heading that STEERS there - swept aside
       to miss shallow water - it swung from one side of an obstacle to the
       other as the boat moved, and an indicator that reports the next turn
       instead of the destination is an indicator that spins. Going round
       things is the tiller's problem. */
    let off = Math.atan2(dx, -dz) - run.head;
    while (off > Math.PI) off -= Math.PI * 2;
    while (off < -Math.PI) off += Math.PI * 2;
    const deg = Math.abs(off) * 180 / Math.PI;
    /* IT STAYS UP. It used to be hidden whenever the heading was within twelve
       degrees - that is, whenever you were doing what it asked - so steering
       toward the spot made the one thing confirming the spot disappear, and
       every wobble flicked it back on. It goes out when you are THERE, which
       is when the shoal is close enough for the game to offer it and the card
       takes over. */
    /* The same door the card comes through: a place is offered from further
       out, so the arrow has to stand down further out too, or it points at
       something the game has already handed you. */
    if (dist < offerFor({ isPlace: !!(g1 && g1.key && String(g1.key).indexOf('place:') === 0) })) {
      fire('onGuide', null); return;
    }
    /* AND IT ONLY SPEAKS WHEN THERE IS SOMETHING TO FISH. An arrow pointing
       across the lake is an invitation to steer; a spoken "catfish to your
       right, three hundred yards" is an instruction to fish, and there is
       nothing out there. Inside the call range, it says so out loud. */
    const now = clockSeconds();
    if (dist <= cueRange() && now - guideSaid > 14) {
      guideSaid = now;
      const way = bearingWords(off);
      say(g.channel
        ? ('The log jam is across the water. Steer for the channel, ' + way + ', ' +
           yards(dist) + ' yards.')
        : ((g.label || 'Your fish') + ' ' + way + ', ' + yards(dist) + ' yards.'));
    }
    fire('onGuide', { angle: off, deg: deg, dist: Math.round(dist), yards: yards(dist),
                      label: g.label || 'Your fish',
                      side: off < 0 ? 'left' : 'right', behind: deg > 150,
                      /* Dead ahead is worth SAYING rather than worth hiding. */
                      ahead: deg <= AHEAD_DEG,
                      /* Whether the helper is actually steering right now, so
                         the arrow can say so rather than leaving the player
                         wondering why the boat is turning on its own. */
                      steering: !!run.helperHand });
  }
  let clockT = 0;
  function clockSeconds() { return clockT; }

  /* ── WHERE THE HELPER IS STEERING ─────────────────────────────────────
     One answer, held on to. The arrow and the hand on the tiller both read
     this, so they can never disagree, and it does not change under the boat
     while it is being steered towards.

     The job's own marked place if it has one; otherwise a shoal of the fish
     it wants, CHOSEN ONCE and kept until it is fished out or arrived at;
     and failing both, the water that fish lives in. */
  let jwAt = -1e9, jwCache = null;

  /** The nearest water of the depth this job's fish lives in. */
  function jobWater() {
    if (!run) return null;
    const m = currentMission();
    const t = m && m.target;
    if (!t) return null;
    const f = t.speciesId ? fishById(t.speciesId) : null;
    const wantFt = f ? (f.depthFt[0] + f.depthFt[1]) / 2
                     : (t.minDepthFt ? t.minDepthFt + 10 : 0);
    if (!wantFt) return null;
    if (jwCache && clockSeconds() - jwAt < 2) return jwCache;
    jwAt = clockSeconds();
    const L = chart();
    if (!L) return null;
    let best = null, bestScore = 1e9;
    for (let a = 0; a < 16; a++) {
      const ang = a / 16 * Math.PI * 2;
      for (const d of [260, 520, 900, 1400]) {
        const x = run.x + Math.sin(ang) * d, z = run.z - Math.cos(ang) * d;
        if (!canFloat(x, z)) continue;
        /* The right depth, and near rather than far - a hint, not a voyage. */
        const score = Math.abs(L.depthAt(x, z) - wantFt) + d * 0.004;
        if (score < bestScore) { bestScore = score; best = { x: x, z: z, key: 'water', water: true }; }
      }
    }
    jwCache = best;
    return best;
  }

  function helperTarget() {
    if (!run) return null;
    /* ALREADY THERE. Stopped on a shoal that will do the job, there is
       nothing to steer to - and pointing at another one like it across the
       lake, with the tiller pulling that way, is the helper hauling you off
       the fish you came for. Reported as "I'm on channel catfish and it says
       channel catfish are 142 yards away". */
    /* ALREADY THERE, OR ALREADY GOING THERE. Stopped on a shoal that will do
       the job there is nothing to steer to - and pointing at another one like
       it across the lake, with the tiller pulling that way, is the helper
       hauling you off the fish you came for.

       ARRIVE counts as being there. It was excluded, and it is the second and
       a bit while the boat coasts onto the spot it has just committed to - so
       the arrow sat there counting down "quest helper steering, 21 yards... 15
       ... 10" at water the player was already pulling into. Reported on the
       catfish job: "I'm at the fishing spot and the steering indicator is
       still visible even though I'm already there." run.current is the spot
       being entered by then, so if that spot answers the job the helper's work
       is done. STEER is still excluded: out there, current is whatever was
       last offered rather than anywhere the boat is committed to. */
    const on = run.state !== S.STEER ? run.current : null;
    if (on && !on.open && spotSuitsJob(on)) return null;
    const place = placeShoal();
    if (place) return { x: place.x, z: place.z, key: place.key, label: place.fishName };
    /* THE SAME SHOAL AS LAST FRAME, until it is FISHED - not merely until it
       is reached. Dropping it on arrival was the other half of a helper that
       felt random: you got there, the card came up, and while you were
       deciding the tiller quietly started hauling you off towards the next
       shoal. It is the fish you need; it stays the target until you have had
       it. A patch of water, having nothing to fish out of it, is dropped once
       you are on it. */
    const held = run.helperAt;
    if (held && !run.taken[held.key]) {
      const near = Math.hypot(held.x - run.x, held.z - run.z);
      if (!(held.water && near < 140)) return held;
    }
    const g = RT.game.jobFish ? RT.game.jobFish() : null;
    if (g) { run.helperAt = { x: g.x, z: g.z, key: g.key, label: g.label }; return run.helperAt; }
    const w = jobWater();
    if (w) { run.helperAt = w; return w; }
    run.helperAt = null;
    return null;
  }

  /**
   * Would fishing this spot get the job done?
   *
   * The job's own place always; otherwise the species it names, or - for a
   * job that asks only for depth - water deep enough. The same question the
   * chart's gold marks answer, asked of one spot.
   */
  function spotSuitsJob(spot) {
    const m = currentMission();
    const t = m && m.target;
    if (!t || !spot) return false;
    if (spot.isPlace || spot.job) return true;
    const sh = (spot.shoals && spot.shoals[0]) || spot;
    if (t.speciesId) {
      /* BOTH, when the job says both. This checked the species or the depth
         and never the two together, so "two largemouth bass out in fifteen
         feet" was satisfied by the water under the jetty - largemouth live
         from four feet down, so the dock holds them and the arrow steered
         you there. Reported: "for mission 6 it drives me to the front of the
         dock, it should bring me further out." */
      if (t.minDepthFt && (sh.ft || 0) < t.minDepthFt) return false;
      if (sh.fishId === t.speciesId) return true;
      if (sh.pool && sh.pool.indexOf(t.speciesId) >= 0) return true;
      return false;
    }
    if (t.minDepthFt) return (sh.ft || 0) >= t.minDepthFt;
    return false;
  }

  /**
   * A heading that gets you there without running aground.
   *
   * The straight line to a shoal often crosses water this boat cannot cross,
   * and driving it is how the quest helper parked people on a sand bar with
   * the arrow still pointing across it. The bearing is probed a boat-length
   * or two ahead; if it will not float, the heading is swept out to either
   * side until one does, and the nearest such heading to the bearing wins.
   *
   * Returns the heading to steer, which is the bearing itself in open water.
   */
  const CLEAR_LOOK = 95;          // how far ahead the water is checked
  function clearHeading(toX, toZ) {
    if (!run) return 0;
    /* THROUGH THE CHANNEL FIRST. This is the engine's answer to "which way do
       I steer to get there", and everything that steers asks it - the quest
       helper, and the harness that plays the ladder. Dodging by heading alone
       cannot solve the log jam: it is seven hundred units of timber with one
       gap in it, so a boat that tries to go round the obstacle in front of it
       hugs the pile and never finds the way through. The channel is a place
       to steer for, not an obstacle to avoid. */
    const via = viaChannel(toX, toZ);
    if (via) { toX = via.x; toZ = via.z; }
    const want = Math.atan2(toX - run.x, -(toZ - run.z));
    const gap = Math.hypot(toX - run.x, toZ - run.z);
    const look = Math.min(CLEAR_LOOK, Math.max(30, gap));
    const floats = (h, d) => {
      /* Three points along the heading, so a bar is caught rather than
         stepped over. */
      for (let f = 0.34; f <= 1.001; f += 0.33) {
        const x = run.x + Math.sin(h) * d * f;
        const z = run.z - Math.cos(h) * d * f;
        if (!canFloat(x, z)) return false;
      }
      /* And the timber, asked about the whole leg - which is what three
         samples thirty units apart cannot tell you. */
      if (barred(run.x, run.z, run.x + Math.sin(h) * d, run.z - Math.cos(h) * d)) return false;
      return true;
    };
    if (floats(want, look)) { run.dodge = 0; return want; }
    /* THE SAME WAY ROUND AS LAST TIME. Trying each side from scratch every
       frame let a boat beside an obstacle flip between going round it left and
       going round it right - the helm sawing back and forth and getting
       nowhere. Whichever way it committed to is tried first, and kept while it
       still works. */
    const first = run.dodge < 0 ? [-1, 1] : [1, -1];
    for (let off = 0.2; off <= Math.PI * 0.85; off += 0.2) {
      for (const sgn of first) {
        const h = want + sgn * off;
        if (floats(h, look)) { run.dodge = sgn; return h; }
      }
    }
    return want;                  // boxed in: hold the bearing and creep
  }

  /** Has Walt handed the map over yet? */
  function hasMap() { return !!save.hasMap; }

  /**
   * What the map needs: the chart, and where the player is on it.
   *
   * The chart is the one the boat actually drives on - read through chart(),
   * which falls back to the content when no world is built, so the map opens
   * in the shop as readily as it does mid-lake.
   */
  /**
   * Where the job is, for drawing on a chart.
   *
   * The same answer the arrow points at and the tiller steers for - the job's
   * own marked place if it has one, otherwise the shoal of the fish it wants
   * - so the ring on the map, the arrow on the screen and the hand on the
   * helm can never be pointing at three different things.
   */
  function questSpot() {
    const pl = placeShoal();
    if (pl) return { x: pl.x, z: pl.z, label: pl.fishName || 'Your job' };
    /* WHAT THE TILLER IS STEERING FOR, not what a fresh search would pick.
       jobFish() searches outward in rings FROM THE BOAT, so its answer moves
       with the boat: the gold ring on the chart hopped from one shoal to the
       next every few seconds while the helper quietly held a single one.
       Reported: "I watched the spot change on the map, it keeps ping ponging
       me around the map in all directions" - the mark and the tiller were
       two different opinions. The held goal comes first now, and the search
       is only asked when nothing is holding one: at the dock, or before the
       first goal is chosen. */
    const held = run && run.helperAt;
    if (held) return { x: held.x, z: held.z, label: held.label || 'Your fish' };
    const g = RT.game.jobFish ? RT.game.jobFish() : null;
    return g ? { x: g.x, z: g.z, label: g.label || 'Your fish' } : null;
  }

  function mapState() {
    const c = chart();
    if (!c) return null;
    const dk = c.dock || { x: 0, z: 0 };
    if (run) {
      return { chart: c, x: run.x, z: run.z, head: run.head,
               quest: questSpot(),
               label: vessel().id === 'foot' ? 'You (on the dock)'
                                             : 'You (in the ' + vessel().name.toLowerCase() + ')' };
    }
    return { chart: c, x: dk.x, z: dk.z, head: 0, quest: questSpot(),
             label: 'You (at the dock)' };
  }

  function shoalInfo(spot, side) {
    const sh = spot.shoals.find(x => x.side === side);
    if (!sh) return null;
    // How far the boat would have to throw from where it is now.
    const closest = Math.max(0, Math.hypot(sh.x - run.x, sh.z - run.z)
                                - CFG.SPOT_RADIUS);
    const fish = biomeFish(sh.biome);
    return {
      biome: biomeName(sh.biome), biomeId: sh.biome,
      /* A marked salvage spot, and the picture of the thing in it. */
      magnetSpot: !!sh.magnetSpot, art: sh.art || null,
      /* Straight off the shoal, NOT worked out again from the biome. Deriving
         it twice is how the card and the spoken line came to disagree about
         what was down there. */
      color: sh.fishColor || (fish[0] && fish[0].color) || '#8fd2f0',
      /* A place has no species, and inventing one for it is how a job about a
         snapped propeller came to be illustrated with a pike. */
      fishId: sh.fishId || (sh.isPlace ? null : (fish[0] ? fish[0].id : null)),
      fishName: sh.fishName || (fish[0] ? fish[0].name : 'Fish'),
      species: fish.slice(0, 3).map(f => ({ name: f.name, color: f.color })),
      isTarget: sh.isTarget,
      fish: sh.fishName,
      inRange: run.range >= closest,
      distance: Math.round(Math.hypot(sh.x - run.x, sh.z - run.z)),
      depthFt: Math.round(sh.ft || 0)
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
    if (dir) run.rudder = null;
  }

  /**
   * Absolute pointer steering: whichever fraction of the screen the pointer is
   * over is where across the lake the boat heads for, the same way the racer
   * places its car. Touch and drag anywhere, or just move the mouse.
   * @param {number} frac 0 = hard left, 1 = hard right
   */
  /** Pointer lifted: stop asking for a side, so the lean ends with the touch. */
  function clearPointerSteer() {
    if (run) run.rudder = null;
  }

  /**
   * Pointer steering: where the pointer sits across the screen is how far the
   * wheel is over.
   *
   * On the rail this named a PLACE across the lane, because there was only one
   * axis to name one. Open water has no across, so it names the rudder - which
   * is what a switch has always named. One vocabulary for both inputs rather
   * than two that need reconciling.
   */
  function setLateralTarget(frac) {
    if (!run || run.state !== S.STEER) return;
    run.rudder = U.clamp(frac, 0, 1) * 2 - 1;
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
    if (equippedRod().isNet) { scoopNet(); return; }
    if (save.tackleBroken) {
      say('The line is bare - no hook, no float. Walt will set you up again.');
      RT.audio.menuBlocked();
      fire('onFlash', 'NOTHING ON THE LINE');
      return;
    }
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
    run.zoneOn = false; run.zoneT = 0;
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
    // Whatever is on the line has to sink again on the next throw.
    run.sinkT = 0;
    /* A fresh drag can find something. This says "this cast has already
       picked something up", so it belongs to the cast and is cleared here -
       cleared only on an empty retrieve, it latched on the first find and the
       magnet came up bare for the rest of the trip. */
    run.magFound = false;
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
    const BAND_SAID = { drop: vessel().id === 'foot' ? 'Dropped in beside the dock'
                                                     : 'Dropped in beside the boat',
                        short: 'Short cast', long: 'Long cast' };
    /* WHAT IT LANDED ON, not which band of depth that water belongs to.
       "Long cast into the Shoreline" is true - the shoreline is a depth band,
       nought to ten feet - and reads as nonsense in the middle of a lake. The
       fish that live there is the thing worth saying. */
    const onto = sh ? (sh.isPlace ? sh.fishName : 'the ' + sh.fishName)
                    : 'open water';
    if (run.landing.tooDeep) fire('onFlash', 'LINE TOO SHORT');
    say(run.landing.tooDeep
          ? 'Line too short! That is ' + Math.round(run.landing.depthFt) + ' feet of water and the ' +
            run.rod.name + ' fishes to ' + run.rod.reachFt + '. ' +
            /* A magnet is not ignored by fish down there - it never gets down
               there at all. Same fault, two different pictures. */
            (hasMagnet() ? 'The magnet never touches the bottom.'
                         : 'Nothing down there will see it.')
          : (run.landing.onShore || run.landing.tooDeep)
          ? 'That one is on the beach. Nothing bites on sand \u2014 wind it back in.'
          : (BAND_SAID[run.landing.band] || 'Cast') +
            (sh ? ' onto ' + onto + ', in ' + Math.round(run.landing.depthFt) + ' feet.'
                : ', into open water, ' + Math.round(run.landing.depthFt) + ' feet down.'));
  }

    /**
   * Where a cast at this angle and power comes down, in track space, and which
   * shoal (if any) it lands on. Angle 0 is straight over the bow, positive to
   * starboard.
   */
  /**
   * Where a cast at this angle and power comes down, and what is under it.
   *
   * The angle is relative to the bow, so the cast goes where the boat is
   * pointing plus wherever the aimer has swung to. Forward is (sin h, -cos h),
   * which is the engine's convention throughout.
   */
  function predictLanding(angle, frac) {
    const d = run.range * U.clamp(frac, 0, 1);
    const h = run.head + angle;
    const x = run.x + Math.sin(h) * d;
    const z = run.z - Math.cos(h) * d;
    /* Onto the beach is a mistake the player can SEE coming, because this is
       computed while aiming as well as on release. No fish live on sand, so
       the shoal is dropped rather than merely made unlikely. */
    const onShore = !fishableAt(x, z);
    const depthFt = chart() ? chart().depthAt(x, z) : 0;
    /* LINE TOO SHORT. A rod is rated to a depth, and a cast into deeper water
       than that hangs the bait in the dark above the fish. Worked out while
       aiming, like the beach, so it can be steered off before the throw. */
    const tooDeep = !onShore && depthFt > ((run.rod && run.rod.reachFt) || 999);
    return {
      x: x, z: z, d: d, angle: angle,
      depthFt: depthFt,
      onShore: onShore,
      tooDeep: tooDeep,
      band: castBand(d),
      shoal: (onShore || tooDeep) ? null : shoalAt(x, z)
    };
  }

  function pushAim() {
    if (!run) return;
    const l = predictLanding(run.aim, 1);
    fire('onAim', {
      angle: run.aim, centre: aimCentre(), maxDist: run.range,
      onSpot: !!(l.shoal && run.current && !run.current.open &&
                 l.shoal.key === run.current.key),
      onShoal: !!l.shoal,
      onShore: l.onShore,
      tooDeep: !!l.tooDeep,
      band: l.band,
      /* The FISH there, not the water it is in. This said biomeName, so a
         cast at a shoal of crappie in eight feet of water was announced as
         "the Shoreline" - which is a depth band, and nonsense as a thing to
         aim at. */
      shoalName: l.shoal ? l.shoal.fishName : null,
      /* A cell's shoal has no `isTarget` of its own - that is added when it
         becomes a spot - so ask the job directly. Without this the aimer never
         said "that is your fish" about anything. */
      isTarget: wantsShoal(l.shoal)
    });
  }

  function pushCharge() {
    if (!run) return;
    const frac = Math.max(CFG.MIN_CAST_FRAC, run.power / 100);
    const l = predictLanding(run.aim, frac);
    fire('onCharge', {
      power: run.power,
      /* THE WATER YOU STOPPED FOR. The boat halts a cast short of a shoal on
         purpose, so landing the throw back on that shoal is the whole skill
         being asked for - and it was the one thing the meter never marked.
         Green was the job's own species only, which meant pulling over onto a
         perfect shoal of something else gave a meter that eased off without
         ever changing colour. */
      onSpot: !!(l.shoal && run.current && !run.current.open &&
                 l.shoal.key === run.current.key),
      onShoal: !!l.shoal,
      onShore: l.onShore,
      tooDeep: !!l.tooDeep,
      band: l.band,
      /* The FISH there, not the water it is in. This said biomeName, so a
         cast at a shoal of crappie in eight feet of water was announced as
         "the Shoreline" - which is a depth band, and nonsense as a thing to
         aim at. */
      shoalName: l.shoal ? l.shoal.fishName : null,
      /* A cell's shoal has no `isTarget` of its own - that is added when it
         becomes a spot - so ask the job directly. Without this the aimer never
         said "that is your fish" about anything. */
      isTarget: wantsShoal(l.shoal),
      /* In FEET. It was passing world units into a meter that prints "ft"
         after them, so a thirty-foot cast was labelled eighteen. */
      distance: Math.round(l.d / 0.61)
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
    /* NOTHING BUT A FISH FIGHTS. A boot, a tyre, a tangle of weeds: you reel
       them in and they come, and that is the whole of it.

       This used to borrow TIER 2 for everything that was not a fish, on the
       grounds that tier 2 had no runs in it. Then tier 2 was given a run -
       the yellow perch and the black crappie, which really do pull - and the
       weeds started fighting back. Reported: "the tangle of weeds ran, which
       it shouldn't." So the not-a-fish case says what it means instead of
       borrowing a fish's tier, and the tier table can be tuned without ever
       teaching a boot to run again. */
    const NO_FIGHT = { lineSeconds: 4, runs: 0 };
    const t = run.bite.category === 'fish'
      ? (TIERS[fishById(run.bite.speciesId).difficultyTier] || TIERS[3])
      : NO_FIGHT;
    /* WHERE THE RUNS COME.
       Early on, evenly through the fight: every fish of a size fights the same
       shape and the player learns it, which is the whole point of the first
       hours. Later the marks wander, so a fish can go early or hang on and go
       late - and a big one can have a run nobody scheduled. */
    const wild = fightWildness();
    run.fightNo = (run.fightNo || 0) + 1;
    const seed = U.hash('fight' + run.mission.n + ':' + Math.floor(run.dist) +
                        ':' + run.fightNo);
    const marks = fightRunMarks(t.runs, wild, U.rng(seed));
    run.reel = {
      progress: 0, held: 0, total: 0, lineSeconds: t.lineSeconds,
      wasHolding: false, strain: 0,
      runs: marks, runIx: 0,
      wild: wild,
      phase: 'reel',        // 'reel' | 'warn' | 'run'
      phaseT: 0, runLen: 0, seed: seed
    };
    fire('onBiteWash', false);
    fire('onBig', null);
    say('Got it! Hold to reel it in.');
    return true;
  }

  /**
   * How unpredictably a fish fights, 0 to 1, by where you are in the ladder.
   *
   * Zero for the first eight jobs, because a fight you cannot learn teaches
   * nothing - the even rhythm is how a player finds out what the warning
   * means and that letting go is what saves the line. It ramps in over the
   * dozen jobs after that and sits at full for the deep water.
   *
   * It is read off the JOB, not off the fish: a sunfish on job thirty is
   * fought on a lake that has stopped being polite, and a fish behaving
   * differently in the same water on the same afternoon would read as a bug.
   */
  function fightWildness() {
    const n = (currentMission() || {}).n || 1;
    return U.clamp((n - CFG.WILD_FROM) / CFG.WILD_OVER, 0, 1);
  }

  /**
   * Where the runs come, along the bar.
   *
   * Evenly, early on, and wandering later. A big fish late can also have one
   * more run than its tier calls for, which is the difference between "three
   * runs, as always" and "how many has this one got in it".
   */
  function fightRunMarks(nRuns, wild, rw) {
    if (nRuns > 0 && wild > 0 && rw.next() < wild * CFG.WILD_EXTRA) nRuns++;
    const marks = [];
    for (let i = 1; i <= nRuns; i++) {
      const even = i / (nRuns + 1);
      const drift = wild ? (rw.next() * 2 - 1) * CFG.WILD_MARK * wild : 0;
      marks.push(U.clamp(even + drift, 0.08, 0.92));
    }
    return marks.sort(function (a, b) { return a - b; });
  }

  /** How long one run lasts: steady early, anything from a second to nearly
      five once the lake has stopped being polite. */
  function runLengthFor(seed, runIx, wild) {
    const rr = U.rng(U.hash('runlen' + seed + ':' + runIx));
    return rr.range(CFG.RUN_MIN_S * (1 - CFG.WILD_SHORTER * wild),
                    CFG.RUN_MAX_S * (1 + CFG.WILD_LONGER * wild));
  }

  /** A second wind, or none: seconds to add to a run that was ending. */
  function surgeFor(seed, runIx, wild) {
    if (!wild) return 0;
    const sr = U.rng(U.hash('surge' + seed + ':' + runIx));
    /* At least a second and a half. A four-tenths-of-a-second second wind is
       over before "she is not done yet" has finished being said - the next
       line lands on top of it and the player hears half of each. */
    return sr.next() < wild * CFG.WILD_SURGE ? sr.range(1.5, CFG.WILD_SURGE_S) : 0;
  }

  /**
   * One whole fight, worked out without playing it - for tools/fightcheck.js,
   * which measures how predictable fish are job by job. It calls the same
   * three functions the fight itself calls, so a test that passes here is a
   * statement about the game rather than about a copy of it.
   */
  /**
   * The reel plan for one bite, without playing it.
   *
   * Whether a thing FIGHTS is decided from its tier, and everything that is
   * not a fish used to borrow a tier that happened to have no runs in it -
   * so tuning the tier table taught a tangle of weeds to fight back. This is
   * how a check asks the question directly.
   */
  function debugReelPlan(category, speciesId) {
    const NO_FIGHT = { lineSeconds: 4, runs: 0 };
    const t = category === 'fish'
      ? (TIERS[(fishById(speciesId) || {}).difficultyTier] || TIERS[3])
      : NO_FIGHT;
    const wild = fightWildness();
    const marks = fightRunMarks(t.runs, wild, U.rng(U.hash('probe' + category + speciesId)));
    return { runs: marks.length, lineSeconds: t.lineSeconds, wildness: wild };
  }

  function debugFight(missionN, tier, fightNo) {
    const was = save.currentMission;
    save.currentMission = missionN;
    const wild = fightWildness();
    const t = TIERS[tier] || TIERS[3];
    const seed = U.hash('fight' + missionN + ':' + (400 + fightNo * 37) + ':' + fightNo);
    const marks = fightRunMarks(t.runs, wild, U.rng(seed));
    const lengths = marks.map(function (_m, i) {
      return runLengthFor(seed, i, wild) + surgeFor(seed, i, wild);
    });
    save.currentMission = was;
    return { runs: marks, lengths: lengths, wild: wild, lost: false };
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
    /* Where the line comes home to: just off the rail on the side the fish
       is, in front of whoever is holding the rod. */
    const side = run.fishSide === 'left' ? -1 : 1;
    const rx = Math.cos(run.head), rz = Math.sin(run.head);
    const homeX = run.x + rx * side * CFG.RAIL_OFF + Math.sin(run.head) * 0.6;
    const homeZ = run.z + rz * side * CFG.RAIL_OFF - Math.cos(run.head) * 0.6;
    const dA = homeX - run.landing.x;
    const dL = homeZ - run.landing.z;
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
      run.magFound = false;
      if (hasMagnet()) {
        /* WHETHER ANY OF THIS IS WORKING. A drag that comes up empty used to
           say the single word "nothing", which is the same thing a broken
           game would say - and a player casting into the right water for the
           tenth time has no way to tell the two apart. So: the drags are
           counted, and it says whether the water under the boat is the water
           the job is about, which is the whole difference between working at
           it and wasting an afternoon. */
        run.magDrags = (run.magDrags || 0) + 1;
        const here = !!jobWaterHere();
        const n = run.magDrags;
        let line;
        if (here) {
          /* AND MOST OF THEM ARE SHORT. Magnet work is a dozen drags in a
             row and two of every three of them used to be the same
             thirty-six character sentence - which is the noise a player
             stops hearing, and then the third one, the one carrying the
             count, goes unheard with it. The reassurance is worth saying
             every third drag; in between, three words will do. */
          line = n === 1 ? 'Nothing yet. This is the right water, though - keep dragging it.'
               : n % 3 === 0 ? 'Nothing that time. ' + n + ' drags over the right water now.'
               /* Short, but every one of them SAYS that nothing came up.
                  "Right water - go again" implies it and does not say it,
                  and a player who cannot see the hook needs telling. */
               : n % 3 === 1 ? 'Nothing on that one.'
               : 'Nothing there. Go again.';
        } else {
          line = n % 3 === 0 ? 'Still nothing. This is open bottom - the water the job names is worth finding.'
               : 'Nothing on it.';
        }
        /* Handed to the card rather than said here. Said here it was cut off
           half a word in by the card announcing its first row. */
        run.spotNote = line;
      }
      if (!hasMagnet()) say('Line in. Cast again, or troll on.');
      openSpotCard(false);
      return true;
    }

    /* A MAGNET COMES BACK SLOWLY. Eleven units a second is a lure swimming
       through open water; this is a lump of iron being dragged over the
       bottom, and at full speed it was back at the rail before the player had
       seen it move. What it finds is rolled per unit dragged rather than per
       second, so the slow drag finds exactly as much - it just lets you watch
       it, and lets you walk it home in bursts on the switch. */
    const speed = CFG.REEL_IN_SPEED * (hasMagnet() ? 0.4 : 1);
    const step = Math.min(gap, speed * dt);
    /* WHAT THE MAGNET FINDS, it finds while it is being dragged. The job's
       own scrap where the job is; iron and litter anywhere else; and mostly
       nothing at all, which is what dragging a magnet over a lake bottom is
       actually like. Rolled per unit dragged rather than per frame, so it
       does not depend on the frame rate. */
    /* NOT IF THE LINE NEVER GOT THERE. The cast already says LINE TOO SHORT
       when the water is deeper than the rod fishes, and then the magnet was
       dragged along an imaginary bottom and brought scrap up anyway - the
       game contradicting its own warning. Reported: "the TTS says line too
       short but I'm able to pull up scrap metal still... or the line is too
       short and I'm going to pull up stuff and it's not supposed to."
       It is not supposed to. The warning is the true one - see the depth test
       in kitCheck(), which now stops you at the slip rather than out here. */
    if (hasMagnet() && !run.magFound && !(run.landing && run.landing.tooDeep)) {
      /* Per unit dragged, so a long throw is worth more than a short one and
         the frame rate has nothing to do with it. Over the job's own water it
         is worth doing - that is where the thing the job is about lies - and
         everywhere else it is the odd bit of iron off the bottom. At a
         hundredth a unit, measured, a drag found something four times in a
         hundred casts and a salvage job was an afternoon of nothing. */
      /* Open water was a hundredth of this per unit and a player reported
         casting and casting with nothing coming up and no way to tell a dry
         spell from a broken game. It is still mostly nothing out there - that
         is what open bottom is - but a dry spell is shorter now. */
      const perUnit = jobWaterHere() ? 0.055 : 0.020;
      if (Math.random() < perUnit * step) {
        run.magFound = true;
        /* AND THE HANDLE STOPS TURNING. The reel loop is started when the
           switch goes down and stopped where the retrieve ends - at the rail,
           or when the switch comes up. Something coming up on the magnet is a
           third way for it to end, and this returned straight past both, so
           the clicking carried on for the rest of the trip. */
        RT.audio.stopReelLoop();
        RT.audio.reelStop();
        run.reelSound = false;
        /* Counted before it is asked what came up, so the first thing the
           lake gives up counts as the first thing the lake gave up. */
        magHunt(true);
        const job = jobItemHere();
        const got = job || rollValuableItem();
        run.bite = { category: 'valuable' };
        say('Something on the magnet!');
        RT.audio.splash();
        finishLanding(got);
        return true;
      }
    }
    run.landing.x += (dA / gap) * step;
    run.landing.z += (dL / gap) * step;
    run.landing.depthFt = chart() ? chart().depthAt(run.landing.x, run.landing.z) : run.landing.depthFt;
    /* Whatever water it is over NOW is the water it is fishing. Drag a lure
       off a weed bed and the weed bed's fish stop being the ones on offer -
       which is the honest version of a retrieve, and it makes where you stop
       reeling a real decision rather than a cosmetic one. */
    const sh = shoalAt(run.landing.x, run.landing.z);
    run.landing.shoal = sh;
    run.onShoal = !!sh;
    run.biteBiome = sh ? sh.biome : run.biteBiome;
    run.biteNamed = sh ? (sh.fishId || null) : null;
    return false;
  }

  /* ── Choices on the spot card ─────────────────────────────────────────── */

  function chooseTroll() {
    if (!run) return;
    if (vessel().id === 'foot') { standOnDock(true); return; }
    /* Trolling on means this patch is behind you. Without saying so the cue
       kept calling the shoal you had just left, the pull-over kept offering
       it, and a trip could be spent going round one patch of water. */
    if (run.current && run.current.key) run.taken[run.current.key] = 1;
    /* When it was the job's own place, note the moment: it is spent for the
       next few minutes of water, not for the trip. */
    if (run.current && run.current.isPlace) run.placeOff = clockSeconds();
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
    /* WHOSE TRIP THAT WAS. Fishing off the boards is a choice made at the
       dock, for one trip - not a state the player is left in. Left set, it
       made vessel() answer 'foot' for ever after, which hid the moored boat
       and took "take the canoe out" off the dock entirely. */
    tripOnFoot = false;
    /* Anyone on the line behind us gets in, and that is the rescue done. Read
       before `run` is cleared, for obvious reasons. */
    const towed = run.towing;
    const trip = { caught: run.tripCatch.slice(), money: run.tripMoney };
    /* Leaving takes the fight with it. The reel meter, the FISH ON banner and
       the bite wash all belong to a run that is about to stop existing, and
       "KEEP HOLDING" sitting over the dock is the game talking about
       something that is no longer happening. */
    fire('onReel', null);
    fire('onBig', null);
    fire('onBiteWash', false);
    fire('onSpots', { left: null, right: null, alongside: false, entering: null,
                      enterFrac: 0, committed: false, enteringFish: null,
                      outFrac: 0, depthFt: 0, lateral: 0 });
    if (towed) {
      reachFlag(towed);
      say('There we are. Tied up and dry.');
    }
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

  let frameNo = 0;
  /* The last answer jobFish gave, the frame it gave it on, AND THE JOB IT WAS
     ABOUT. It is asked several times a frame and the search sweeps a wide
     circle of the lake, so it is worth caching - but the answer depends on
     the job as much as on the moment, and keying it on the frame alone was a
     real bug: `frameNo` only advances inside update(), so between the last
     frame of one trip and the first helperTarget() of the next - which
     happens during castOff, before any frame has run - the cache still held
     the PREVIOUS job's shoal. The arrow latched onto it (it is sticky until
     the shoal is fished) and spent the next trip pointing at the fish you
     were sent for last time. */
  let jfFrame = -1, jfFor = null, jfCache = null;
  function update(dt) {
    frameNo++;
    clockT += dt;
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
    if (run.rudder !== null && run.rudder !== undefined &&
        Math.abs(run.rudder) > 0.45) {
      return run.rudder < 0 ? 'left' : 'right';
    }
    return null;
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
    /* A hold that has latched onto a shoal is a hold onto a called shoal, and
       stays one - the boat turns toward the fish while you hold, the fish
       crosses the bow, and asking "is it on that side right now" flipped the
       answer mid-hold and swapped the three second timing for the four
       second one. */
    if (run && run.leanKey && run.leanSide === side && !run.taken[run.leanKey]) return true;
    const s = activeSpot();
    return !!(s && run.cued[s.key] && sideOf(s) === side);
  }
  function leanArm(side)      { return calledOn(side) ? CFG.LEAN_ARM  : CFG.LEAN_ARM_OPEN; }
  function pullOverTime(side) { return calledOn(side) ? CFG.PULL_OVER : CFG.PULL_OVER_OPEN; }

    /** Turn in and settle, then show what is down there. */
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
    const sh0 = activeSpot();
    const sh = (sh0 && run.cued[sh0.key] && sideOf(sh0) === side) ? sh0 : null;
    if (cueLevel >= 1) RT.audio.panTone(side);
    if (sh) {
      say('Pulling over for ' + (sh.fishName || 'fish') +
          (sh.isTarget ? (hasMagnet() ? '. That is the one you want.'
                                      : '. That is your fish.') : '.'));
    } else {
      say(hasMagnet() ? 'Pulling over to drag the bottom here.'
                      : 'Pulling over to fish here.');
    }
  }
  /**
   * Arriving somewhere a job sent you.
   *
   * Not a fishing card: there is nothing here to cast at. What is offered is
   * the one thing the job is about, in the keeper's own words - `say.brief` is
   * what they told you at the counter, so it is what belongs on the card when
   * you finally get here.
   */
  function openBeatCard() {
    run.state = S.CARD;
    const j = run.current.job;
    const m = run.mission;
    const incident = j.kind === 'incident';
    const bell = !!(j.target && j.target.type === 'ringBell');
    const sonar = !!(j.target && j.target.flag === 'sonar_played');
    fire('onCard', {
      which: 'beat',
      kind: j.kind,
      bell: bell, sonar: sonar,
      title: incident ? 'The Motor Coughs'
           : bell ? 'He Is Right Alongside'
           : sonar ? 'Cut The Engine' : 'The Place',
      /* THE CARD'S OWN WORDS, not Walt's. This showed his briefing, so the
         system voice read his speech out at you a second time - standing at
         the place, in a voice that is not his. Nothing of his should ever be
         TTS. What belongs on a card you are stood in front of is what to do
         HERE, which is what the job's own line already says: "motor into the
         120 ft trench, cut the engine and play the sonar". */
      text: m.text || (m.say && m.say.brief) || '',
      action: incident ? 'Wait for the tow'
            /* NOT THE BELL, NOT YET. Barnaby brings it up and puts it in
               your hand inside the scene this card starts - "there is
               something in his mouth... the old Warden's bell" - so naming it
               here gave the ending away seconds early, and implied the player
               already knew about a thing nobody has ever seen. Reported:
               "Walt says take the bell, he's offering it to you, but he
               wouldn't know Barnaby has a bell." What you came out here to do
               is meet him. */
            : bell ? 'Cut the engine and meet him'
            : sonar ? 'Play the sonar' : (m.action || 'Do it'),
      label: (run.current.shoals[0] && run.current.shoals[0].fishName) || null
    });
  }

  /**
   * Take the beat. The one thing the card offered.
   *
   * A rescue is not finished by arriving - "find the stranded boat and bring
   * it back to the dock" is two halves, and a job that completed on sight
   * would be a job about looking rather than about helping. So it goes on the
   * line behind the boat and scores when the boat ties up.
   */
  /**
   * The last two beats are scenes, not button presses.
   *
   * Narrated in the player's own voice - the system voice - because it is
   * the person in the boat who is watching it happen. Walt is a voice on the
   * radio for the sonar and gets the rest when they come home, which is what
   * "it can be me figuring out what's going on, then I report back" asks
   * for. Each line is one beat of the scene; the interface plays them in
   * order and waits for each.
   */
  function beatScript(j) {
    const t = (j && j.target) || {};
    if (t.flag === 'sonar_played') {
      return {
        sonar: true,
        lines: [
          'The engine goes quiet. You lower the sonar over the side and let it hang.',
          'The rings go down into the dark. Forty feet. Eighty. A hundred.',
          'Something down there is answering. It is coming up.',
        ],
        /* HIS OWN RECORDINGS, over the shop radio. Both of them: the first
           used to be the briefing for this job, said across a counter about
           chimes he could not yet be hearing - "I hear the sonar chimes
           echoing through my shop radio, kid". Out here he can, and does. */
        radio: ['q34a', 'q34b'],
      };
    }
    if (t.type === 'ringBell') {
      return {
        bell: true,
        lines: [
          'He comes up alongside without a sound. Six feet of him, silver down the flank, ' +
            'one eye level with yours.',
          'There is something in his mouth. Brass, green with the lake, on a loop of rotten cord: ' +
            'the old Warden\'s bell.',
          'He holds still while you reach out and take it. Then he waits.',
          /* THE LINE THE BELL ACTUALLY RINGS ON - see sfxAt below. */
          'So you ring it. Twice, out over the water, the way a warden would.',
          'He goes down slowly, the way something goes when it is not being chased. ' +
            'Time to go and tell Walt.',
        ],
        /* Struck brass, on the fourth line, where you ring it. */
        sfx: 'bellToll', sfxAt: 3,
      };
    }
    return null;
  }

  function takeBeat() {
    if (!run || !run.current || !run.current.job) return null;
    const j = run.current.job;
    const flag = (j.target && j.target.flag) || null;
    reachFlag(flag);
    /* A BELL HAS NO FLAG - it has a count, and ringing it once is the whole
       job. Scored here because the bell is rung on the water now. */
    if (j.target && j.target.type === 'ringBell') {
      save.progressValue = j.target.amount || 1;
      persist();
    }
    run.current.spent = true;
    if (run.current.key) run.taken[run.current.key] = 1;
    if (j.kind === 'incident') {
      /* The motor stalls at the edge of the fog. Walt comes out and tows you
         in, and the tow goes on the tab - which is the next few jobs. */
      /* AND THE BOAT STAYS IN. It came back on the end of his line with the
         drive pin snapped; it does not go out again until he has had it,
         which is when this job is handed in at the counter. The vessel is
         read BEFORE returnToDock(), because that is the boat the trip was
         made in. */
      save.towedBoat = vessel().id;
      run.towing = flag;
      /* WHAT HAPPENS HERE, NOT WHAT WALT SAYS LATER.
         `say.done` is his speech at the counter - "I told you, kid! I warned
         ya!... Barnaby stopped your boat!" - and it is recorded in his own
         voice as q26a and q26b for the hand-in. Reading it out HERE meant the
         system voice delivered his telling-off the instant the motor died,
         out in the fog, and then he said the same thing again properly when
         you got back. Reported: "when we break down seeing the abyssal spot
         the TTS says 'I told ya kid' but that's walts line when we turn in
         the mission... it should just say get a tow and then I hear it at the
         shop."
         So out here the lake describes what just happened to the boat, and
         Walt keeps his line for the counter. */
      say('The motor coughs once and stops. Sit tight, kid - Walt is on his ' +
          'way out to tow you in.');
      fire('onFlash', 'UNDER TOW');
      RT.audio.stopMotor();
      return { towing: true, trip: returnToDock() };
    }
    /* A SCENE RATHER THAN A LINE. The sonar and the bell are the two moments
       this whole game is built towards; the interface plays them out and
       calls back when they are done. */
    const scene = beatScript(j);
    if (scene) return { towing: false, scene: scene };
    say((j.say && j.say.done) || 'Well. Nobody mentioned that.');
    chooseTroll();
    return { towing: false };
  }

  function openSpotCard(afterCatch) {
    /* A job's place is not a fishing spot, unless the job is about fishing:
       a rescue and a secret each have their own beat, and a named retrieval
       fishes normally because the thing comes up on the line. */
    /* A place with a BEAT on it rather than fish: somewhere to go and see,
       or - at the very end - a bell to ring while a sturgeon watches you do
       it. Both are one thing to do, so both get the beat card. */
    const bt = run.current && run.current.job && run.current.job.target;
    if (!afterCatch && bt && (bt.type === 'reachSpot' || bt.type === 'ringBell')) {
      openBeatCard();
      return;
    }
    run.state = S.SPOT;
    // The rod is in frame from the moment you stop, so it can be the target.
    RT.scene.setSpotTargets();
    const m = run.mission;
    /* Anything the last drag has to report, spoken as ONE utterance with the
       card's own announcement - two in a row and the second cancels the
       first, which is how "nothing on it" became the word "cast". */
    const note = run.spotNote || null;
    run.spotNote = null;
    fire('onCard', {
      which: 'spot',
      afterCatch,
      note: note,
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
      /* IN THE ZONE, THE METER EASES OFF.
         While the throw is predicted to land on fish the power climbs at a
         third of its normal rate, so the moment to let go is three times as
         wide - and a chime rides along with it, so that moment can be heard
         as well as seen. Everything else is unchanged: the meter still fills,
         a full one still throws itself, and any cast is legal. */
      const l = predictLanding(run.aim, Math.max(CFG.MIN_CAST_FRAC, run.power / 100));
      const inZone = !!l.shoal && !l.onShore && !l.tooDeep;
      const rate = CFG.CHARGE_PCT_PER_S * (inZone ? CFG.ZONE_SLOW : 1);
      run.power = Math.min(100, run.power + rate * dt);
      const step = Math.floor(run.power / CFG.CHARGE_TICK_PCT);
      if (step > run.powTick) { run.powTick = step; RT.audio.chargeTick(run.power / 100); }

      /* Arriving over fish is a rising two-note chime and a word; staying
         there is a quiet pulse; leaving is one low note. Somebody who cannot
         read the meter can play the whole cast by ear. */
      if (inZone && !run.zoneOn) {
        run.zoneOn = true;
        run.zoneT = 0;
        RT.audio.tone(880, 0.09, { vol: 0.15 });
        RT.audio.tone(1320, 0.11, { vol: 0.13, delay: 0.07 });
        /* NOT FISH, with a magnet on. What the job wants is a lump of iron
           in the mud, and calling it "your fish" is the game reading out a
           variable rather than saying what is going on. */
        /* And the words match the colour: the water you came for is "yours",
           anything else in the way is just "the fish". */
        const yours = wantsShoal(l.shoal) ||
                      !!(run.current && !run.current.open && l.shoal.key === run.current.key);
        say(hasMagnet() ? (l.shoal.isPlace ? 'Over the salvage - let go.'
                                           : 'Over the bottom you want - let go.')
            : l.shoal.isPlace ? 'On the spot - let go.'
            : yours ? 'On your fish - let go.' : 'On the fish - let go.');
      } else if (!inZone && run.zoneOn) {
        run.zoneOn = false;
        RT.audio.tone(520, 0.07, { vol: 0.08 });
      }
      if (run.zoneOn) {
        run.zoneT = (run.zoneT || 0) + dt;
        if (run.zoneT >= CFG.ZONE_PULSE) { run.zoneT = 0; RT.audio.tone(1180, 0.05, { vol: 0.09 }); }
      }
    }
    pushCharge();
    // A full charge throws by itself — the farthest cast, no timing needed.
    if (run.power >= 100) releaseCast();
  }

  function updateFlying(dt) {
    run.timer += dt;
    /* A scoop takes longer than a cast's flight, because the whole of it is on
       screen: the net goes down, under, and comes back up with what it caught
       in the bag. */
    if (run.netScoop) { if (run.timer >= NET_SCOOP_TIME) landNetHaul(); return; }
    if (run.timer < 0.75) return;
    run.state = S.WAITING;
    run.timer = 0;
    const sh = run.landing.shoal;
    /* WHAT IS DOWN THERE IS WHAT IS DOWN THERE.
       Off a shoal, the water the bait is sitting in decides what takes it -
       the depth under the float, not the stage the job belongs to. Taking it
       from the job's waters meant a line dropped into ninety feet of trench
       could hand back a sunfish, and a boat parked over the drop-off caught
       the shallow bay all afternoon. */
    run.biteBiome = sh ? sh.biome
      : D.waterAt(run.landing.depthFt || 0).id;
    run.onShoal = !!sh;
    // The species the shoal was announced as, so the bites match the card.
    run.biteNamed = sh ? (sh.fishId || null) : null;
    const r = U.rng(U.hash('bite' + run.mission.n + ':' + Math.floor(run.dist) + ':' + Math.round(run.power)));
    run.biteAt = biteWait(r);
    run.teaseT = 0;
    run.bite = rollBite(run.biteBiome, equippedBaitId(), run.onShoal,
                        null, null, run.biteNamed);
  }

  /**
   * How long before something takes it.
   *
   * A few seconds for panfish off the boards; the better part of half a minute
   * for a trout at a hundred feet. What is down there sets it - the biggest
   * tier in the water you are fishing - with a gentle ramp across the game so
   * the last jobs ask for more patience than the first. Nothing here is a
   * reaction test: the float dips and teases the whole time, the take is
   * announced on four channels, and the window to strike is unchanged.
   */
  function biteWait(r) {
    const pool = biteWeightedFishPool(run.biteBiome, equippedBaitId(), bestRodId());
    let tier = 1;
    pool.forEach(function (x) { tier = Math.max(tier, x.f.difficultyTier || 1); });
    const byTier = [1, 1, 1.15, 1.9, 2.9, 3.8][Math.min(5, tier)] || 1;
    const byLadder = 1 + (run.mission.n || 1) / 90;      // job 35 waits about a third longer
    const lo = CFG.BITE_WAIT_MIN * byTier * byLadder;
    const hi = Math.min(CFG.BITE_WAIT_CAP, CFG.BITE_WAIT_MAX * byTier * byLadder);
    return r.range(Math.min(lo, hi), hi);
  }

  function rebite() {
    if (run.landing && !run.landing.shoal) run.biteBiome = D.waterAt(run.landing.depthFt || 0).id;
    const r = U.rng(U.hash('rebite' + run.mission.n + ':' + Math.floor(run.dist * 7 + run.timer * 13)));
    /* A second look comes quicker than the first - it is already interested -
       but in deep water it is still a wait. */
    run.biteAt = Math.max(CFG.REBITE_MIN, biteWait(r) * 0.6);
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

    /* NOTHING BITES A MAGNET. Magnet fishing is a cast and a retrieve: you
       throw it as far as it will go, drag it back along the bottom, and
       something comes up or nothing does. Sitting over it waiting for a take
       is a minute of nothing happening for the best of reasons. */
    if (hasMagnet()) {
      run.magNag = (run.magNag || 0) + dt;
      /* ONCE, WHEN THE MAGNET FIRST GOES IN. Every line cancels the one before
         it, and this one takes longer to say than the four seconds it used to
         be repeated on: it cut itself off every time, forever. After the first
         throw of a trip the player knows, and a reminder only comes if they
         have genuinely stopped - by which time silence is the confusing thing,
         not the words. */
      /* ONCE, EVER. Kept in the save rather than the trip: it is worth
         hearing the first time a magnet goes on the line and it is not worth
         hearing on every cast for the rest of the game, which is what a
         player heard and rightly called annoying. */
      if (!save.magToldHow) {
        save.magToldHow = true;
        persist();
        run.magNag = 0;
        say('Nothing bites a magnet. Hold the reel and drag it back along the ' +
            'bottom - the further you threw it, the more bottom it covers.');
      } else if (run.magNag > 16 && (run.magNags || 0) < 2) {
        /* And at most twice a trip after that, for somebody who has genuinely
           stopped rather than somebody who is getting on with it. */
        run.magNag = 0;
        run.magNags = (run.magNags || 0) + 1;
        say('Hold the reel to drag it back.');
      }
      return;
    }

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
      sayFight(run.bite.category === 'fish' ? "She's running!" : "It's away!", true);
      fire('onBig', 'GET READY');
    } else if (r.phase === 'warn') {
      r.phaseT += dt;
      if (r.phaseT >= CFG.RUN_WARN_S) {
        r.phase = 'run';
        r.phaseT = 0;
        /* HOW LONG IT RUNS. A steady second and a half to two and a half at
           the start of the game; by the end, anything from a second to nearly
           five, so "it will tire in a moment" stops being a thing you can
           count on. */
        r.runLen = runLengthFor(r.seed, r.runIx, r.wild || 0);
        r.surged = false;
        RT.audio.lineCreak();
        fire('onBig', 'LET IT RUN!');
      }
    } else if (r.phase === 'run') {
      r.phaseT += dt;
      if (r.phaseT >= r.runLen && r.strain < 0.5) {
        /* A SECOND WIND. Out on the deep water a fish that was giving up
           sometimes finds another yard just as the line starts coming in.
           Once per run only - a fish that could surge forever would be a fish
           nobody could land. */
        if (!r.surged) {
          const extra = surgeFor(r.seed, r.runIx, r.wild || 0);
          if (extra > 0) {
            r.surged = true;
            r.runLen += extra;
            RT.audio.lineCreak();
            sayFight('She is not done yet!');
            return;
          }
        }
        r.phase = 'reel';
        r.runIx++;
        fire('onBig', null);
        RT.audio.reelClick(run.fightSize);
        sayFight('She\'s tiring — reel!');
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
  /**
   * A line about the fight, said the moment the fight turns.
   *
   * These deliberately do NOT go through say(). The lake's queue waits for
   * the voice to go quiet, and what it waits behind while you are reeling
   * is "press and hold to reel it in" - three seconds of it, and a beat
   * after. The warning before a run is RUN_WARN_S: seven tenths of a
   * second. So the queue delivered "she's running" several seconds after
   * the line had already been hauled tight, and somebody going on the
   * words alone had no way to know to let go. Reported in those words.
   *
   * So the fight barges in. Whatever is talking stops, the lake's backlog
   * is dropped, and the news about the fish is said now.
   *
   * The 1.25s gap stays, so two fight lines close together are not heard
   * as half of each - but `always` overrides it, because the start of a
   * run is the one line that must never be the one that got swallowed.
   */
  let fightSaidAt = -99;
  function sayFight(text, always) {
    const now = clockSeconds();
    if (!always && now - fightSaidAt < 1.25) return false;
    fightSaidAt = now;
    if (cueLevel >= 2) U.speakUrgent(text);
    fire('onSpeak', text);
    return true;
  }

  function loseFish() {
    RT.audio.stopReelLoop();
    RT.audio.lineSnap();
    fire('onReel', null);
    fire('onBig', null);
    fire('onBiteWash', false);
    const name = run.bite.category === 'fish'
      ? (fishById(run.bite.speciesId) || {}).name : 'It';
    run.reel = null;
    /* THE LINE COMES IN, AND THE CARD COMES BACK. This used to put the state
       back to WAITING - waiting for a bite, on a line with no hook on it - and
       fire a card the interface treats as a screen flash and nothing else. So
       there was no card, no scan and no way to reach even Options: reported as
       "it just sits at the fishing spot and I can't press spacebar". A player
       with two switches and nothing to press has to reload the game. */
    run.bite = null;
    run.biteAt = 0;
    run.timer = 0;
    run.landing = null;
    RT.audio.stopReelLoop();
    RT.audio.reelStop();
    run.reelSound = false;
    say('The line parted — ' + (name ? name + ' is gone.' : 'it is gone.') +
        ' Get another one on.');
    fire('onCard', { which: 'lost', name: name || 'It' });
    openSpotCard(false);
  }

  function landFish() {
    const r = run.reel;
    const q = r.total > 0 ? Math.round(100 * U.clamp(r.held / r.total, 0, 1)) : 100;
    const outcome = resolveCatch(run.bite.category, run.bite.speciesId, q, run.bite);
    outcome.quality = q;
    RT.audio.stopReelLoop();
    RT.audio.splash();
    fire('onReel', null);
    finishLanding(outcome);
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE NET
     A different act from fishing. No aim, no meter, no bite, no fight: you
     dip the hoop into knee-deep water and lift, and three to eight tiny fish
     come up in it for Walt's survey tank. It is what the first morning is
     made of, and it never asks for timing.
     ══════════════════════════════════════════════════════════════════════ */

  const NET_MAX_FT = 12;      // deeper than this and the net comes up empty

  const NET_SCOOP_TIME = 1.25;   // down, under, and back up

  /**
   * How far into the dip the net is, 0 at the top and 1 with the hoop under.
   * Read by the rig (which reaches to the water) and by the camera (which
   * crouches with it), so the two can never disagree about where the scoop is.
   */
  function netDip(r) {
    if (!r || r.state !== S.FLYING || !r.netScoop) return 0;
    const t = U.clamp(r.timer / NET_SCOOP_TIME, 0, 1);
    return t < 0.34 ? U.smoothstep(t / 0.34)
         : t < 0.56 ? 1
         : 1 - U.smoothstep((t - 0.56) / 0.44);
  }

  function scoopNet() {
    if (!run || run.state !== S.SPOT) return;
    /* OVER THE SIDE, WHERE THE WATER IS. This said "straight out over the
       casting side" and then aimed straight AHEAD, which on the jetty is down
       the length of the boards - so a net that reaches four feet went into
       the decking three units in front of your boots. Reported as "when I
       scoop, I'm going through the dock. I should be at the edge of the dock."
       aimCentre() is the casting rail, the same quarter turn every cast from
       the boards uses, and 2.9 units of it clears the 2.3-unit half-width of
       the jetty - so the hoop goes in just past the edge, which is what
       somebody kneeling on a jetty with a net actually does. */
    /* AND AT THE NET'S FULL REACH. At six tenths the hoop cleared the edge
       of the boards by half a unit, and the handle from your hands to it did
       not: it went through the plank edge on the way down. Reported: "the
       net handle still goes through the dock." The reach stays at six
       tenths - at the full four feet the hoop left the frame entirely - and
       the clearance comes from standing on the last plank instead
       (DOCK_STAND_NET), which puts the dip two and a half units past the end
       of the jetty. */
    run.landing = predictLanding(aimCentre(), 0.6);
    /* What is in it is decided NOW, as the net goes in - not when it comes
       out. The scene shows the catch wriggling in the bag on the way up, and
       it can only show what has already been rolled. */
    run.netHaul = rollNetHaul();
    run.netScoop = true;
    run.state = S.FLYING;
    run.timer = 0;
    run.power = 0;
    RT.audio.cast();
    say('Scoop.');
    fire('onCharge', null);
  }

  /** What this dip picks up: nothing, the job's litter, or three to eight fish. */
  function rollNetHaul() {
    const ft = run.landing ? run.landing.depthFt : 0;
    if (ft < 0.3 || ft > NET_MAX_FT || (run.landing && run.landing.onShore)) {
      return { kind: 'empty', n: 0, tooDeep: ft > NET_MAX_FT };
    }
    const litter = netLitterHere();
    if (litter && Math.random() < 0.6) return { kind: 'litter', n: 1, item: litter };
    // Every dip is its own luck: three to eight, mostly minnows.
    const n = 3 + Math.floor(Math.random() * 6);
    let minnows = 0, shiners = 0;
    for (let i = 0; i < n; i++) { if (Math.random() < 0.72) minnows++; else shiners++; }
    return { kind: 'fish', n: n, minnows: minnows, shiners: shiners };
  }

  /** The job's netted item, if the current job is about netting one and it is not done. */
  function netLitterHere() {
    const m = run && run.mission; const t = m && m.target;
    if (!t || t.type !== 'recoverItem' || !t.itemId) return null;
    if (save.progressValue >= (t.amount || 1)) return null;
    const rec = (D.ITEMS || []).find(i => i.id === t.itemId);
    return rec && rec.netOnly ? rec : null;
  }

  function landNetHaul() {
    const h = run.netHaul || { kind: 'empty', n: 0 };
    run.netScoop = false;
    let outcome;
    if (h.kind === 'empty') {
      outcome = { type: 'empty', id: 'empty', name: 'An empty net', value: 0, netMiss: true,
                  tooDeep: !!h.tooDeep, rodName: 'hand net', betterRod: null };
    } else if (h.kind === 'litter') {
      /* The clean-up: litter comes up in the net along the shore, wherever
         you dip it - a job about the shoreline, not about one square yard. */
      outcome = { type: 'junk', id: h.item.id, name: h.item.name, value: 0, litter: true };
    } else {
      const weight = round1(h.minnows * 0.06 + h.shiners * 0.08);
      // Logged as minnows whatever the mix - the card carries the breakdown.
      outcome = { type: 'fish', id: 'minnow',
                  name: h.n + ' tiny fish', count: h.n, haul: { minnow: h.minnows, shiner: h.shiners },
                  length: null, weight: weight, value: 0, qualityLabel: 'Netful', quality: 100,
                  secret: false, tier: 1, keeper: 0, released: false, netHaul: true };
    }
    RT.audio.splash();
    finishLanding(outcome);
  }

  function finishLanding(outcome) {

    if (run.landing && run.landing.shoal) run.landing.shoal.caught++;
    /* Nothing is paid out here. What you land goes in the hold and is worth
       something only once the shop buys it — which is what makes coming back
       in with a full boat feel like anything. */
    /* A short fish never comes aboard: no hold, no money, no creel, no
       personal best, and no progress on the job. It cost nothing but the cast,
       and the game says so out loud on the way past. */
    if (outcome.type === 'snap') {
      save.tackleBroken = true;
      save.tackleBreaks = (save.tackleBreaks || 0) + 1;
      persist();
    }
    if (outcome.released) outcome.value = 0;
    if (outcome.type === 'fish') {
      /* TAG AND RELEASE. Nothing with fins goes in the hold: a keeper gets a
         numbered tag on the fin and a line in the logbook, and Walt's Warden
         Bounty for the tag is paid when the logbook is uploaded at the
         counter. The survey-tank fish - netted minnows and shiners - are the
         one exception, and they are worth the job and nothing else. */
      const f = fishById(outcome.id) || {};
      /* How deep the FISH was, which is the shoal it came out of - not where
         the float happened to touch down. A shoal sits in fifty feet of water
         and a cast lands a few units short of its middle; crediting the
         landing point failed "three catfish from fifty feet" while the angler
         stood over a fifty-foot hole catching catfish. */
      outcome.depthFt = run.landing
        ? Math.round(run.landing.shoal ? run.landing.shoal.ft : (run.landing.depthFt || 0)) : 0;
      if (f.netOnly) {
        outcome.tank = true;
        outcome.value = 0;
      } else if (!outcome.released) {
        /* WHAT THE RECORD IS WORTH. This was hard-zeroed - "the job pays, not
           the fish" - so every tag in the game was worth nothing whatever the
           roster said, and the counter offered to take a morning's logbook
           for no dollars at all. The jobs are still the wage; a tag is a
           dollar or two on top, which is the tank of petrol. */
        outcome.tagged = true;
        outcome.bounty = f.tagBounty || 0;
        outcome.value = outcome.bounty;
        save.pendingTags = save.pendingTags || [];
        save.pendingTags.push({ id: outcome.id, length: outcome.length, weight: outcome.weight,
                                depthFt: outcome.depthFt, m: run.mission.n, bounty: outcome.bounty });
      }
    } else if (outcome.type === 'junk' && (outcome.value || 0) > 0) {
      /* LITTER RIDES HOME. Anything you take out of the lake is worth a
         couple of dollars to a man running a research station on it - not a
         living, but the difference between a wasted cast and a small good
         deed. It used to go over the side unpaid on the way in. Weeds are
         worth nothing and go straight back, because weeds are not litter. */
      save.hold.push({ id: outcome.id, name: outcome.name, value: outcome.value || 0,
                       type: 'junk' });
    } else if (outcome.type === 'valuable' || outcome.storyPiece) {
      /* Everything the magnet brings up goes in the boat, priced or not. It
         used to be kept only if it was worth something, and the day scrap
         stopped being worth anything was the day "trade five pieces of scrap"
         became impossible - the scrap was going over the side. */
      save.hold.push({ id: outcome.id, name: outcome.name, value: outcome.value || 0,
                       type: outcome.type, storyPiece: !!outcome.storyPiece });
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
      /* NOT FOR A NETFUL. Six minnows outweigh five, so every other scoop
         was "your biggest 6 tiny fish yet", which is not a thing. */
      if (!outcome.netHaul && (!b || outcome.weight > b.weight)) {
        outcome.isBest = true;
        outcome.beat = b ? b.weight : 0;
        save.best[outcome.id] = { length: outcome.length, weight: outcome.weight };
      }
    }
    /* ── KEPT FOR GOOD ────────────────────────────────────────────────
       A fish in no book and a thing somebody lost are both one to a lake, and
       both are remembered here rather than in the job - so they still count
       if they come up on the way to something else, and so neither can ever
       be caught twice. */
    if (outcome.type === 'fish' && (fishById(outcome.id) || {}).mystery) {
      const got = setHeld('mystery');
      if (got.indexOf(outcome.id) < 0) { got.push(outcome.id); persist(); }
      outcome.firstEver = true;
    }
    if (outcome.relic) {
      const got = setHeld('relics');
      if (got.indexOf(outcome.id) < 0) { got.push(outcome.id); persist(); }
      outcome.firstEver = true;
    }

    const wasDone = targetComplete(run.mission, save.progressValue);
    const advanced = outcome.released ? false : applyToTarget(run.mission, outcome);
    const nowDone = targetComplete(run.mission, save.progressValue);
    /* AND WHY IT DID NOT COUNT.
       A job with a depth on it turns away a fish of exactly the right species
       without a word: the card prints the length, the weight and the quality,
       and simply has no badge on it. Reported on job 33 - "I used manual mode
       and caught a lake trout but it didn't count toward my 0/3, so something
       is wrong" - and from where the player sits that is indistinguishable
       from the game being broken.

       The depth the fish came up from is the one thing they cannot see, so
       that is the thing to say. Only for the RIGHT fish: a perch on a lake
       trout job is its own explanation. */
    const missedDepth = (function () {
      if (advanced || outcome.released || outcome.type !== 'fish') return null;
      const t0 = run.mission && run.mission.target;
      if (!t0 || !t0.minDepthFt) return null;
      if (t0.speciesId && outcome.id !== t0.speciesId) return null;
      const at = Math.round(outcome.depthFt || 0);
      if (at >= t0.minDepthFt) return null;   // turned away for some other reason
      return { at: at, need: t0.minDepthFt };
    })();
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
      placeholder: CATCH_PLACEHOLDER_EMOJI[outcome.id] || '' + ic('fish') + '',
      advanced,
      missedDepth,
      justCompleted: !wasDone && nowDone,
      targetText: targetProgressText(run.mission, save.progressValue),
      targetSpoken: targetSpeech(run.mission, save.progressValue),
      /* Pips for a job counted in whole fish, so the progress can be READ at a
         glance rather than parsed: three circles, two of them filled. */
      pips: (function () {
        const t = run.mission.target;
        if (!t || t.type === 'freeRoam' || t.type === 'catchLength') return null;
        /* And not for one fish over a weight. Ten pips for "a pike over
           ten pounds" reads as ten fish wanted; it is one. */
        if (t.type === 'catchWeight' || t.type === 'catchWeightOne' || t.netOnly) return null;
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
     * So the moment the fish is out of the water there is a rising figure
     * that means "that was one of yours", and a flash - and then the CARD
     * says the whole thing in words, with the count in large type and pips
     * beside it.
     *
     * IT USED TO SAY THE WORDS HERE TOO, a second before the card said them
     * again, and the card - being the interface, which interrupts on purpose
     * so that a scan answers the switch - cut it off mid-sentence every time.
     * Reported as "it starts to say 'that' and gets cut off". Two voices
     * announcing one fish is not twice the information.
     */
    if (outcome.gearMiss) {
      /* The one moment the shop's whole purpose is legible: something too big
         took it, the rod was not enough, and here is the rod that would be.
         SAID BY THE CARD, not here - see the note above. */
      RT.audio.spitHook();
    /* NOTHING IS PUT BACK UNCOUNTED. `released` is false for every fish now:
       the game is catch, tag, log and release from the first minute, so there
       is no such thing as one too small to count. */
    } else if (advanced) {
      /* The rising figure that means "that one counted", and the flash. Both
         of them are instant and neither of them is words, which is the point:
         the card is a beat behind and says the whole thing properly. */
      RT.audio.missionTick(save.progressValue, run.mission.target.amount);
      fire('onFlash', 'count');
    }
  }

  /**
   * A name with the right word in front of it.
   *
   * Everything the game hauls out of the water gets announced as "A " plus
   * its name, which is right for a fish and wrong for the two things that are
   * not one fish: a net haul is called "5 tiny fish" and came out as "A 5
   * tiny fish", and Old Boot came out as "A Old Boot".
   *
   * A leading one- or two-digit number is a COUNT of whatever follows, so it
   * takes no article at all. Four digits is a year - the 1994 Warden's
   * Lockbox - and keeps one. And a name that opens on a vowel takes "An".
   */
  /* THE THINGS THAT ARE STUFF RATHER THAN OBJECTS. You pull up scrap metal,
     not a scrap metal - reported - and whether a thing is countable is a fact
     about the thing, not about the spelling of its name, so the roster says
     so and this reads it. Built once, on first use, because D.ITEMS is not
     loaded when this file is. */
  let _massNames = null;
  function isMass(s) {
    if (!_massNames) {
      _massNames = {};
      ((D && D.ITEMS) || []).forEach(function (i) {
        if (i && i.mass && i.name) _massNames[i.name.toLowerCase()] = 1;
      });
    }
    return !!_massNames[s.toLowerCase()];
  }

  function articleFor(name) {
    const s = String(name || '').trim();
    if (/^\d{1,2}\b/.test(s)) return '';
    /* A name that opens on a determiner has brought its own: The Warden's
       Bell is not "a The Warden's Bell". */
    if (/^(the|a|an)\s/i.test(s)) return '';
    if (isMass(s)) return '';
    return /^[aeiou]/i.test(s) ? 'an' : 'a';
  }
  function withArticle(name) {
    const s = String(name || '').trim();
    const a = articleFor(s);
    if (!a) return s;
    return a.charAt(0).toUpperCase() + a.slice(1) + ' ' + s;
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
    /* Come round toward the next thing worth fishing rather than carrying on
       out. Near the edge of what a hull is rated for, "straight ahead" is the
       boundary; this turns the boat back into its own water over the leaving
       beat - the job's fish if the chart has any in mind, otherwise the way
       home. */
    if (run.timer < CFG.LEAVE_TIME) {
      const g = RT.game.jobFish ? RT.game.jobFish() : null;
      const L = chart();
      let tx = null, tz = null;
      if (g) { tx = g.x; tz = g.z; }
      else if (L) { tx = L.dock.x; tz = L.dock.z; }
      if (tx !== null) {
        const want = Math.atan2(tx - run.x, -(tz - run.z));
        let d = want - run.head;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        run.head += d * Math.min(1, dt * 1.6);
      }
    }
    /* Under way again, along the heading. There is no lane to get back into:
       wherever the boat stopped is simply where it is starting from. */
    const step = boatSpeed() * U.smoothstep(Math.min(1, run.timer / CFG.LEAVE_TIME)) * dt;
    const nx = run.x + Math.sin(run.head) * step;
    const nz = run.z - Math.cos(run.head) * step;
    /* AND NOT THROUGH THE TIMBER, which the steering already knows but this
       did not: pulling away from a spot is its own bit of movement, so a boat
       that left a shoal pointing at the log jam sailed straight through it.
       Two ways for a hull to move meant two places to say what stops it. */
    if (canFloat(nx, nz) && !barred(run.x, run.z, nx, nz)) {
      run.x = nx; run.z = nz; run.dist += step;
    }
    if (run.timer >= CFG.LEAVE_TIME) {
      run.state = S.STEER;
      run.timer = 0;
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
    /**
     * How deep the boat floats, in hull-local units.
     *
     * It used to be placed 0.30 ABOVE the water, which put the whole hull in
     * the air: the keel sits at local y≈0.02, so the boat rested on the
     * surface like a toy in a bath rather than displacing anything.
     *
     * The hull's boot stripe (station fractions 0.40–0.53) says where the
     * waterline is meant to be, which would be about 1.0. What stops her going
     * that deep is the inside of the boat, not the outside: the bilge floor in
     * art.js closes the hull at local y 0.93 at its lowest station, and the
     * bob swings ±0.10 either way. Float her deeper than 0.83 and the lake
     * comes up through her own floor.
     *
     * 0.75 is as deep as she goes with that margin kept — the waterline sits
     * on the boot stripe, everything below it is under an opaque surface, and
     * the cockpit stays dry at the top of every bob.
     */
    /* How deep each hull sits. The motorboat's waterline is set by its
       station table; the small boats ride high. On foot there is no hull. */
    function boatDraught() {
      const id = vessel().id;
      /* How deep each hull sits. A motorboat is heavy and sits into the water;
         a canoe and a kayak draw a couple of inches. These are also what keeps
         the floors dry: the lake ripples nearly two tenths of a unit and the
         hull bobs, so a boat that sat where these used to sit took water in.
         tools/floatcheck.js asserts the clearance. */
      /* The motorboat used to draw 0.75, which put its bilge floor four
         hundredths of a unit above the crest of the ripple - so it shipped
         water too, in the slots down either side of the sole. At 0.55 the
         keel is still well under, the boot stripe sits just above the
         waterline where a boot stripe belongs, and the floor is dry. */
      return id === 'motorboat' ? 0.55 : id === 'foot' ? 0 : id === 'kayak' ? 0.08 : 0.16;
    }
    /* How much the hull rides the swell. A small boat moves less than a
       motorboat, and every tenth of a unit of bob is a tenth less clearance
       between the floor and the water. */
    function boatBob() { return vessel().id === 'motorboat' ? 0.10 : 0.045; }

    let lake = null, boatObj = null, rodObj = null, bobberObj = null;

    /* ── Where things are, now that there is no rail ──────────────────────
       The rail's pointAt(along, across) and frameAt(along) are gone. Every
       caller of them wanted one of two things - a direction, or a point near
       the boat - and the rail was only the notation they were written in. */
    // Named apart from the Scene's own _fwd, which is a different scratch.
    const _hf = new THREE.Vector3();
    const _hr = new THREE.Vector3();

    /**
     * Forward, right, and the yaw a mesh needs, for a heading.
     *
     * Models face -Z, so a mesh pointing along heading h has rotation.y of
     * MINUS h. Getting that sign wrong turns the boat one way while it travels
     * the other, which is exactly what "I steer left and it goes right" is.
     */
    function headFrame(head) {
      _hf.set(Math.sin(head), 0, -Math.cos(head));
      _hr.set(Math.cos(head), 0, Math.sin(head));
      return { forward: _hf, right: _hr, yaw: -head, bank: 0, heading: head };
    }

    /** A point `fwd` ahead of (x, z) and `side` to starboard of it. */
    function atBoat(x, z, head, fwd, side, out) {
      out = out || new THREE.Vector3();
      out.set(x + Math.sin(head) * fwd + Math.cos(head) * side,
              0,
              z - Math.cos(head) * fwd + Math.sin(head) * side);
      return out;
    }

    /**
     * Where the waterline is on the town shore, at this point along it.
     *
     * The dock sits at the lake's origin with the shore running east and west
     * through it, so "along the shore" is x and "in from the water" is +z.
     * Marched rather than solved: the shoreline is a spline and the answer is
     * only wanted to about a foot.
     */
    function shoreZAt(x) {
      const L = lake && lake.chart;
      if (!L) return 0;
      let z = L.dock.z - 90;
      for (let i = 0; i < 260; i++) {
        if (!L.inWater(x, z + 1)) return z;
        z += 1;
      }
      return L.dock.z;
    }
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
        dark: css('--boat-dark'),
        /* Whose painted portrait stands in the shop: this zone's keeper. */
        keeperId: 'walt',
        /* The shop wall shows the rod ladder as a progress board, so it needs
           to know which rods have actually been earned - and which one is in
           your hands, because that one is not hanging on the rack. */
        ownedRods: (save.rods || []).slice(),
        /* The rods this game HAS, for the board on the shop wall - the net is
           not one of them, it is a net. */
        rodLadder: D.RODS.filter(r => !r.isNet).map(r => ({ id: r.id, look: r.look })),
        equippedRodId: bestRodId(),
        /* How big this zone's lap is, from the map. Cattail Creek is a
           four-minute millpond; building it at the default 24 chunks made it
           the same size as the open water at the edge of the chart. */
        shirt: css('--shirt'), jeans: css('--jeans'), cap: css('--cap'), vest: css('--vest'),
        dock: css('--dock'), shack: css('--shack'), roof: css('--roof'),
        shopWall: css('--shop-wall'), shopFloor: css('--shop-floor'),
        pegboard: css('--pegboard'), glass: css('--glass'),
        keeperShirt: css('--keeper-shirt'), keeperCap: css('--keeper-cap'),
        trophy: css('--trophy'), shopBeam: css('--shop-beam'),
        /* The shop's own joinery. It used to be handed the BOAT's dark trim
           (--boat-dark, a charcoal) because both were called "dark", so the
           counter, the shelves and the plaque on the wall were painted
           #33302c - a colour with a luminance of six per cent, which under
           the shop's lights is black. The mounted fish on that plaque was a
           dark green silhouette on a black board, which is what a player saw
           and reported as "just a black frame". */
        shopWood: css('--shop-wood'),
        /* What you can see out of the shop window: the same sky, timber and
           sand as the world outside it. */
        skyHigh: css('--sky-high'), skyLow: css('--sky-low'),
        foliageDark: css('--foliage-dark'), foliageLight: css('--foliage-light'),
        sand: css('--sand'),
        rod: css('--rod'), line: css('--line-mono'), bobber: css('--bobber'),
        cork: css('--cork'), reelBody: css('--reel-body'), hook: css('--hook'),
        /* The gear for the mission being played, so the rod in your hands and
           the bait on the hook are the ones the note says you are carrying. */
        rodLook: equippedRod().look || null,
        net: !!equippedRod().isNet,
        baitLook: equippedBait().look || null,
        // A float only when the bait is fished under one.
        float: equippedBait().usesFloat !== false
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
      /* One chart, read by the world, the cue and the minimap alike. */
      lake = RT.world.buildLake(sc, {
        chart: chart(), seed, colors: C,
        flat: isFlat(), reducedMotion: reducedMotion()
      });
      if (RT.minimap && RT.minimap.setChart) RT.minimap.setChart(lake.chart);
      /* The vessel you own - canoe, kayak, motorboat - or nothing on foot. */
      boatObj = RT.art.vesselModel(vessel().id, C);
      sc.add(boatObj);

      rodObj = C.net ? RT.art.netRig(C) : RT.art.rodRig(C);
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
      buildWorld(lakeSeed());
      attractDist = 60;
    }

    /**
     * The dock. There is no menu here: the tackle shop, the boat and the
     * signpost are themselves the scan targets, so choosing where to go is
     * choosing a thing you can see rather than a row of words about it.
     */
    function showDock() {
      mode = 'dock';
      /* Standing at the dock, you are not on a trip at all - so whatever the
         last one was, the boat tied up here is yours again. */
      RT.game.setOnFoot(false);
      /* The helper arrow belongs to a trip. It used to be left hanging at the
         top of the screen after coming in, pointing across dry land at a
         fishing spot you are no longer anywhere near. */
      fire('onGuide', null);
      buildWorld(lakeSeed());
      // The world's own copy is the view from the water; this is the real one.
      if (lake.showTownDock) lake.showTownDock(false);
      const C = colors();
      dockGroup = new THREE.Group();
      dockTargets = [];

      /* The dock is the lake's origin, with the town shore running east and
         west through it. So a piece of the dock is placed by how far ALONG the
         shore it is and how far IN from the water - which is how you would
         describe a dock to somebody, and it means each piece asks where the
         waterline is at its own position rather than reusing one reading. */
      const D0 = 0;                         // along the shore, from the dock
      const fr = headFrame(0);              // the dock faces north, out to sea

      /** Put `obj` `inland` units in from the waterline (negative goes out). */
      function placeAshore(obj, along, inland) {
        const L = lake.chart;
        /* `along` runs to the RIGHT as seen from the water, which is how the
           original dock was laid out (sign and drying rack right of the shop).
           From the lake looking south, right is west, so along is -X. */
        const x = L.dock.x - along;
        const zw = shoreZAt(x);
        const z = zw + inland;
        /* On the bank, ON the ground - never under it. Sampled round a small
           footprint as well as at the centre, because a shop set on one
           reading with the bank rolling under it had a corner buried and the
           door in the air. */
        let y = 0;
        if (inland > 0) {
          const f = 3;
          y = Math.max(lake.groundAt(x, z), lake.groundAt(x - f, z), lake.groundAt(x + f, z),
                       lake.groundAt(x, z - f), lake.groundAt(x, z + f), 0) + 0.04;
        }
        obj.position.set(x, y, z);
        obj.rotation.y = fr.yaw + Math.PI / 2;
        return { lat: -inland, y: obj.position.y, x: x, z: z };
      }

      /* Long enough to reach from the shop's door right down into the water.
         It used to stop a unit past the waterline while the shop stood 22
         units inland, leaving the two connected by nothing at all. */
      /* Long enough to run from the shop's own doorstep out into the water.
         The shop stands twelve units in from the waterline and its front wall
         is two and a half units forward of that, so the boards have to start
         at nine and a half - they used to start at six, which left a yard of
         open sand between the porch and the head of the jetty. */
      const JETTY = 31;
      // The jetty runs from the bank out into the water, so it is placed at
      // its own midpoint and yawed a quarter turn.
      const jet = RT.art.jetty(JETTY, C);
      /* The model runs from its origin out along -Z, so its origin is the
         HEAD on the bank - nine units inland - and it reaches eighteen units
         out over the water. No quarter turn: placeAshore's turn is for props
         that face the water, and it laid the whole jetty along the beach. */
      placeAshore(jet, D0, 9.5);             // at the porch, and mostly over water
      jet.rotation.y = fr.yaw;
      /* Decking above the water AND above the bank it lands on. */
      const headZ = shoreZAt(lake.chart.dock.x + D0) + 9;
      jet.position.y = Math.max(0.55, lake.groundAt(lake.chart.dock.x + D0, headZ) + 0.35);               // decking rides above the surface
      dockGroup.add(jet);

      // The shop sits properly ashore now, back from the waterline on dry bank
      // rather than paddling at the water's edge.
      const shop = RT.art.tackleShop(C);
      // Set so the shop's front porch meets the head of the jetty.
      const shopAt = placeAshore(shop, D0, 12);
      /* Door and sign to the water. The model's front is +Z; placeAshore's
         quarter turn showed the gable end to the lake. */
      shop.rotation.y = fr.yaw + Math.PI;
      dockShopLat = shopAt.lat;
      dockGroup.add(shop);
      dockTargets.push({ key: 'shop', obj: shop, radius: 7,
                         pos: shop.position.clone(), labelY: 8.2 });

      // A painted board further along the bank — the way home. The text is ON
      // the sign, so it needs no floating caption of its own.
      const sign = RT.art.signBoard('MAIN MENU', C);
      // Beside the shop's porch, not 17 units further up the bank — strung out
      // along the shore the three targets stopped reading as one place.
      placeAshore(sign, D0 + 17, 7);          // where it always stood: right of the shop, up the beach
      dockGroup.add(sign);
      /* The plate rides ABOVE the board, clear of it.
         The board is a metre and a bit tall, centred three and a half units
         up its post - so it spans 2.9 to 4.1, and a plate at 1.6 sat on the
         post while one at 3.4 sat squarely across the painted lettering it
         was naming. This clears the top of the board with room to spare. */
      dockTargets.push({ key: 'home', obj: sign, radius: 3.2,
                        pos: sign.position.clone(), labelY: 5.0 });

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
      /* The bench looks at the lake, which is the only reason to put a bench
         on a beach. placeAshore turns a prop a quarter turn along the shore,
         so this is the other quarter - and a couple of degrees off square,
         because nobody sets a bench with a protractor. */
      prop(RT.art.benchSeat(C), D0 + 10, 10, Math.PI / 2 - 0.06);
      prop(RT.art.dryingRack(C), D0 + 24, 10, 0.15);
      /* A barrel, not a heap. The tackle-clutter prop read as three unnamed
         boxes stacked on the boards, and the life ring beside it as a
         floating doughnut - neither said "working dock" to anybody. */
      prop(RT.art.barrel(C), D0 - 10, 9, 0);

      // Where the boards meet the bank, at the head of the jetty.
      prop(RT.art.barrel(C), D0 + 5.0, 5.5, 0.2);
      prop(RT.art.dockLamp(C), D0 - 5.5, 4.5, 0);
      prop(RT.art.crate(0.9, C), D0 + 2.4, 8.0, 0.9);

      sc.add(dockGroup);

      /* The boat, tied alongside the outer end of the jetty - sixteen units
         out from the waterline, which is about where the decking ends. */
      const boatAlong = D0 + 4.5;
      const boatX = lake.chart.dock.x + boatAlong;
      const boatZ = shoreZAt(boatX) - 16;
      dockBoat = { x: boatX, z: boatZ, head: 0 };
      if (RT.minimap && RT.minimap.show) RT.minimap.show(false);
      boatObj.position.set(boatX, -boatDraught(), boatZ);
      boatObj.rotation.y = fr.yaw;
      /* The boards are a place to fish from whatever is tied up beside them.
         Owning a canoe used to REPLACE the jetty as somewhere to fish, so the
         dock quietly stopped being an option the moment you had a boat - and
         dock fishing is how a skint player earns the price of a tank. */
      /**
       * Somewhere to fish from, ON the boards.
       *
       * The thing being chosen is the DOCK - so the highlight is the outer end
       * of the decking, drawn round a slab of nothing laid over the planks,
       * rather than round the bait bucket that happens to be standing there.
       * A bracket round a barrel says "the barrel"; this says "the dock".
       *
       * And it is on the far side from the moored boat, so the two choices are
       * two different places on the jetty rather than one crowded corner: the
       * boat to starboard, the fishing to port.
       */
      function boardsSpot() {
        /* The far side from the moored boat - but still ON the boards. The
           decking is 4.6 units wide, so its edge is 2.3 out from the
           centreline and anything past that is standing in the air. */
        const side = Math.sign(boatX - lake.chart.dock.x) || 1;
        const bx = lake.chart.dock.x - side * 1.3;
        // The bait bucket you fish beside, on the far side from the boat.
        const bucket = RT.art.barrel(C);
        bucket.position.set(bx, jet.position.y + 0.02, boatZ + 1.5);
        bucket.rotation.y = fr.yaw + 0.4;
        dockGroup.add(bucket);
        /* The highlight: the outer end of the boards, deck-width. Invisible,
           but a bounding box all the same, which is what the scan frame is
           measured from - so the bracket says "the dock" rather than "that
           barrel". Kept short and kept low: a long slab drew a frame across
           half the jetty, and a tall one is something a ray aimed at the boat
           moored alongside can clip on its way past. */
        const mark = new THREE.Mesh(
          new THREE.BoxGeometry(4.4, 0.5, 8),
          new THREE.MeshBasicMaterial({ visible: false }));
        mark.position.set(lake.chart.dock.x, jet.position.y + 0.2, boatZ + 1.5);
        mark.rotation.y = fr.yaw;
        dockGroup.add(mark);
        return { mark: mark, x: bx, y: jet.position.y };
      }

      /* THE BAIT BUCKET IS PART OF THE DOCK. It was built inside boardsSpot,
         which is only called once there is something to fish with - so on a
         brand new save the end of the jetty was bare, and the barrel popped
         into existence the moment Walt handed over the net. Reported: "the
         barrel randomly shows up after we see Walt and go outside; it should
         probably just be there when we start the game." It is a barrel on a
         jetty. It has been there for years.

         Built ONCE, here, and the invisible mark it comes with is handed to
         whichever branch below wants it as a scan target - the mark does
         nothing at all unless it is pushed into dockTargets. */
      const boards = boardsSpot();
      if (vessel().id !== 'foot' && bestRod()) {
        dockTargets.push({ key: 'boards', obj: boards.mark, radius: 3.4,
                           pos: boards.mark.position.clone(), labelY: 2.4 });
      }
      if (vessel().id === 'foot' && !bestRod()) {
        /* Nothing to fish with yet: the boards are just boards. The shop and
           the sign are all there is to pick. */
        boatObj.visible = false;
      } else if (vessel().id === 'foot') {
        /* Nothing tied up yet. The way out is the end of the boards: a bait
           bucket and a net there are what you pick to go fishing. */
        boatObj.visible = false;
        /* Nothing tied up: fishing off the boards is the only way out, and it
           is the same place on the same planks it will be once there is a
           canoe beside it. */
        dockTargets.push({ key: 'boat', obj: boards.mark, radius: 3.4,
                           pos: boards.mark.position.clone(), labelY: 2.4 });
      } else {
        boatObj.visible = true;
        /* ABOVE THE HIGHLIGHT, not across it.
           A fixed height guessed at the hull was wrong for every boat in turn:
           over the canoe it sat down in the gunwales, under the motorboat it
           hung in the water. So it is measured - the top of the boat's own
           bounding box, which is the top of the bracket the scan draws, plus a
           hand's width of air - and it is anchored to the middle of that box
           rather than to the model's origin, which on a hull is somewhere
           round the keel. */
        /* The plate is lifted by a MEASURED amount - the top of the hull's
           own bounding box, which is the top of the bracket the scan draws,
           plus a hand's width of air. A guessed height was wrong for every
           boat in turn: over the canoe it sat down in the gunwales, under the
           motorboat it hung in the water.

           The target stays the BOAT, though. Handing it a bare anchor point
           instead cost it its place in pickTarget, which only considers
           targets that own an object - so the canoe kept its bracket and its
           caption and could no longer be clicked at all. */
        const bb = new THREE.Box3().setFromObject(boatObj);
        const lift = (bb.max.y - boatObj.position.y) + 1.6;
        dockTargets.push({ key: 'boat', obj: boatObj,
                           radius: Math.max(3.6, (bb.max.x - bb.min.x) * 0.8),
                           pos: boatObj.position.clone(), labelY: lift });
      }

      setDockFocus(dockFocus);
      /* Arrive framed, not gliding in from wherever the attract camera was -
         that glide took four seconds and the first thing a player saw was
         open water with the dock in a corner. */
      dockCamera(10); dockCamera(10);
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
      /* The caption is lifted clear of the bracket in the UI layer, where the
         bracket's box is known in pixels - see positionWorldLabels. Lifted
         here instead, in world units, it read correctly from the canoe and
         sat seven hundred pixels above the top of the screen from the
         boards. */
      dockTargets.push({ key: 'cast', obj: null, water: true,
                         pos: new THREE.Vector3(), labelY: 0.9 });
      updateCastTarget();
    }

    /** Where that square of water is, from where the boat is right now. */
    function updateCastTarget() {
      const t = dockTargets.find(x => x && x.water);
      if (!t || !lake || !run) return;
      const side = run.fishSide === 'left' ? -1 : 1;
      /* Off the beam of a boat, but straight OUT from a dock. The six units
         of forward offset is there to put the square level with the middle of
         a hull; on the boards it only pushed the target sideways off the end
         of the jetty, where the player is not looking. */
      const afoot = vessel().id === 'foot';
      /* AS FAR OUT AS THE GEAR THROWS. Seventeen units is 28 feet, inside a
         bamboo rod's thirty - but a hand net does not throw at all. It scoops
         a few feet off the boards, so its square stays at the RAIL, which is
         where a net can actually reach. Getting that square into the picture
         is the camera's job rather than the arithmetic's: see shoulderCamera,
         which drops its gaze when there is a net in your hands. Measured at
         the boots and photographed from a standing eye, it had been landing a
         frame and a half below the bottom of the screen. */
      const reach = afoot ? Math.max(2.4, Math.min(DOCK_CAST, castRange(equippedRod().id) * 0.92))
                          : CAST_MARK_OFF;
      atBoat(run.x, run.z, run.head, afoot ? 0 : 6, side * reach, t.pos);
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
    /* A target may name a different object for the BRACKET than the one its
       plate is anchored to - a boat is bracketed whole and captioned above its
       middle - so the frame asks for focusObj first. */
    /**
     * What the scan frame is drawn round, and what the name plate hangs over.
     *
     * They are usually the same object, but need not be: a moored boat is
     * bracketed whole while its plate is anchored above the middle of that
     * bracket, so the caption sits over the highlight instead of across the
     * hull. A target says so by naming a `focusObj` of its own.
     */
    function setDockFocus(i) {
      dockFocus = i;
      const t = dockTargets[i];
      focusTarget = t || null;
      const o = (t && (t.focusObj || t.obj)) || null;
      focusObj = (o && o.parent) ? o : null;
    }

    /* Where the magnet actually is in the world, for hanging what it picked
       up off its poles. */
    const _magP = new THREE.Vector3();
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
      const fr = headFrame(run.head);
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

    /**
     * Where a hooked fish would break the surface, from where the player is
     * standing right now.
     *
     * The same arithmetic bobberTrack uses when it lands one, exposed so
     * tools/dockcheck.js can check the point is over open water rather than
     * over the planks - which is a thing you only see by playing, or by
     * measuring it.
     */
    function landingPoint() {
      if (!run) return null;
      const side = run.fishSide === 'left' ? -1 : 1;
      const rail = vessel().id === 'foot' ? DOCK_RAIL : CFG.RAIL_OFF;
      const p = new THREE.Vector3();
      atBoat(run.x, run.z, run.head, 0.6, side * rail, p);
      return p;
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
          /* Well clear of his head. He is a five-unit billboard set down
             behind the counter; at 4.35 the plate still landed across his
             cap, so it hangs above him instead. */
          pos: anchorOf(shopRoom.userData.keeper, 0), labelY: 5.3 },
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
      /* Seeded by ZONE. Per mission meant the same water rearranged itself
         between one job and the next. */
      buildWorld(lakeSeed());
      if (lake.showTownDock) lake.showTownDock(true);
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
      /* NOTHING THAT CAME UP IN THE NET IS HUNG IN THE AIR. A netful of
         minnows is told on the card rather than a fish at a time - and now
         that there is rubbish modelled in the bag, a scooped can is the same:
         it is already in your hands, in the hoop, where you can see it.
         Hanging the painting over the water as well showed the same can
         twice, once floating out of the lake on nothing. Reported: "it keeps
         bringing the rusty can up with the net like it's coming out of the
         water - we don't need that any more since the net has trash in it."
         `litter` is set only by the net's own haul, so a can dragged up on a
         hook or a magnet still gets its moment. */
      if (o.netHaul || o.netMiss || o.litter) return null;
      const art = catchArtSrc(o);
      if (!art) return null;
      if (o.type === 'fish') {
        /* Its real length against the rod, in world units: a sunfish comes up
           the size of a hand and a sturgeon is longer than the angler is tall,
           because that is what the numbers on the card say and the two should
           never disagree. */
        /* Its real length, in world units. The floor used to be 0.3 - six
           inches - so every small fish came up the same size as a keeper. */
        catchLen = U.clamp((o.length || 10) * CFG.UNITS_PER_IN, 0.1, 3.2);
        catchObj = RT.art.fishCard(art, catchLen,
                    { hang: 'mouth', head: (fishById(o.id) || {}).headFacing || 'right' });
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
      atBoat(r.x, r.z, r.head, 0.6, side * CFG.RAIL_OFF, _v3);
      ring.position.copy(_v3);
      ring.userData.t = 0;
      rings.push(ring);
      sc.add(ring);
      return catchObj;
    }

    /** One shoal object per shoal near the boat; the rest are culled. */
    function syncShoals(r) {
      const want = new Set();
      /* What the chart shows is what the water shows: the shoals round the
         boat, from the same cells the cue reads. */
      const near = shoalsNear(r.x, r.z, 620);
      for (const sh of near) {
        const key = sh.key;
        want.add(key);
        if (patchObjs.has(key)) continue;
        const style = PATCH_STYLE[sh.biome] || 'dropoff';
        const isTarget = wantsShoal(sh);
        /* The water over it, dressed for what lives there. */
        const patch = RT.art.biomePatch({
          biome: style, seed: sh.seed ^ 0x5f3a, radius: sh.radius * 1.15,
          colors: {
            sand: css('--sand'), lily: css('--lily'), reed: css('--reed'),
            deep: css('--water-deep'), glint: css('--glint'), rock: css('--rock-mid'),
            biome: css('--biome-' + style)
          }
        });
        _v.set(sh.x, 0, sh.z);
        patch.position.copy(_v);
        sc.add(patch);
        patchObjs.set(key, patch);
        if (sh.count > 0) {
          const g = RT.art.fishShoal({
            seed: sh.seed, count: sh.count, radius: sh.radius, length: sh.fishLength,
            /* Its OWN species colour, so a shoal can be told apart at a glance
               and matches the fish named on the approach card. */
            color: new THREE.Color(sh.fishColor ||
                     css(isTarget ? '--fish-target' : '--fish-dark')).getHex()
          });
          g.position.copy(_v);
          // Just under the surface, below whatever the patch lays on it.
          g.position.y += 0.06;
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

      /* NOTHING DRAWN THROUGH THE HULL.
         Lily pads, rocks and the shoals themselves lie flat on the water, and
         the boat sits IN the water - so driving over one put pads and stones
         through the deck and fish swimming across the thwarts. Anything the
         boat is on top of is hidden while it is: you are over it, and from
         inside a boat you would not see it anyway. */
      const HIDE_UNDER = 6.5;
      /* EXCEPT THE ONE YOU ARE FISHING. Pulling over takes the boat TO the
         shoal, so on arrival the thing you came for was inside that radius
         and switched off - the card said "your fish are here" over empty
         water. For the spot you are stopped at, the hole is the boat's own
         footprint instead: the ring of fish and weed around the hull shows,
         and still nothing draws through the deck. */
      const hereKey = (r.current && r.current.key) || null;
      const hideNear = (map) => {
        for (const [k, g] of map) {
          const d = Math.hypot(g.position.x - r.x, g.position.z - r.z);
          g.visible = d > (k === hereKey ? 2.9 : HIDE_UNDER);
        }
      };
      hideNear(patchObjs);
      hideNear(shoalObjs);

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
      /* The minimap belongs to trolling and nothing else. Hide it for every
         mode that is not the trip; the trip decides for itself below, once it
         knows whether you are steering or casting. Guarding on mode matters:
         hiding unconditionally here and re-showing there would toggle display
         twice a frame and force two layouts for nothing. */
      if (RT.minimap && mode !== 'trip') RT.minimap.show(false);

      if (mode === 'shop') {
        shopCamera();
        return;
      }
      if (!lake) return;

      if (mode !== 'trip') setFov(58);

      if (mode === 'attract') {
        attractDist += 9 * dt;
        /* The attract screen drifts across the lake rather than trolling a
           route, because there is no route. Slow, and out from the dock, so
           the title sits over open water. */
        const L = lake.chart;
        const ax = L.dock.x + Math.sin(attractDist * 0.0016) * 300;
        const az = L.dock.z - 260 - (attractDist % 900) * 0.35;
        placeBoat(ax, az, Math.PI * 0.08, dt);
        chaseCamera(dt);
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
      /* Burn fuel and wear the hull off the DISTANCE TRAVELLED THIS FRAME.
         Not off r.dist — that keeps climbing across laps, and the meters must
         not care how many times you have been round. */
      if (RT.economy) {
        const moved = r.dist - (r._ecoDist == null ? r.dist : r._ecoDist);
        r._ecoDist = r.dist;
        const v = vessel();
        /* THE DEEP HALF IS HARD ON A HULL. Past the channel through the log
           jam the water is deeper, colder and full of the timber that took
           Big Mac's propeller off - so being out there costs five times the
           wear, on the clock and the distance both. The bay is untouched:
           the first twenty jobs should not get harder for a rule written
           about the last ten. Same line the weather turns on. */
        const harsh = (v.wearRate == null ? 1 : v.wearRate) * deepWearFactor(r);
        if (moved > 0 && v.id !== 'foot')
          RT.economy.travel(moved, harsh, !!v.burnsFuel);
        /* AND THE TIME, not just the distance. A hull sat over a shoal for
           twenty minutes with a magnet down is twenty minutes in the lake. */
        if (v.id !== 'foot' && v.durability && RT.economy.soak && !isPaused)
          RT.economy.soak(dt, harsh);
        hullWatch(v);
      }
      /* HOW CLOSED-IN IT IS. Two things describe the middle of this lake -
         the water is deeper and it is further north than the channel through
         the log jam - so the weather is worked out from both, and it starts
         to turn about where a player crosses into the deep half. */
      if (lake && lake.setGloom && isSolved()) {
        /* AND THEN IT LIFTS. "Somehow the fog lifted up and now you can fish
           the waters" - so the deep half is as clear as the bay, which is
           most of what makes it feel like a different lake. */
        lake.setGloom(0);
      } else if (lake && lake.setGloom) {
        const ft = lake.depthAt(r.x, r.z);
        const byDepth = U.clamp((ft - 45) / 75, 0, 1);
        const bar = (lake.chart.barriers || [])[0];
        const byNorth = bar ? U.clamp((bar.z - r.z) / 700, 0, 1) : 0;
        lake.setGloom(Math.max(byDepth, byNorth * 0.85));
      }
      syncShoals(r);
      placeBoat(r.x, r.z, r.head, isPaused ? 0 : dt);
      boatObj.visible = vessel().id !== 'foot';
      /* The centre fog. Past seventy-five feet the world closes in, which is
         the trench telling you where you are. */
      if (sc.fog && lake) {
        const ftHere = lake.depthAt(r.x, r.z);
        const k = U.clamp((ftHere - 75) / 45, 0, 1);
        sc.fog.near = U.lerp(140, 45, k);
        sc.fog.far = U.lerp(1250, 300, k);
      }

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

      /* Open water has no landmarks, so between spots nothing on screen says
         the boat is moving. Show it while trolling; hide it once casting,
         where the water in front of you IS the information and a second view
         only competes with it. */
      if (RT.minimap) {
        const showMap = !fishing && !isPaused;
        RT.minimap.show(showMap);
        if (showMap) {
          /* Hand over the real upcoming spots. nextSpotDist is only the
             scheduler's cursor for where to GENERATE the next one, so drawing
             it showed a marker with no fish under it. */
          RT.minimap.update(lake, r.x, r.z, r.head, pendingForMap(), reach(),
                            questSpot());
        }
      }

      if (aimLine.visible) updateAimLine(r);
      lake.update(dt, camPos, boatObj.position);
    }

    function placeBoat(x, z, head, dt) {
      const fr = headFrame(head);
      bob += dt;
      boatObj.position.set(x, 0, z);
      boatObj.position.y += Math.sin(bob * 1.1) * boatBob() - boatDraught();
      /* The hull points where it is going. `head` is absolute now, so this is
         simply minus it - the helm is already in the heading rather than being
         a swing on top of a route. Models face -Z, so the sign matters: adding
         it turns the boat one way while it travels the other, which is exactly
         what "I steer left and it goes right" is. */
      boatObj.rotation.y = fr.yaw;
      // Heels the way the helm is put over. Gently — you are riding in this,
      // so the horizon moves with it.
      /* Heels into the turn. +X is starboard, and a positive Z rotation lifts
         +X, so leaning starboard-down in a starboard turn is negative. */
      boatObj.rotation.z = Math.sin(bob * 0.8) * 0.02
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
      const fr = headFrame(r ? r.head : 0);
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
      /* Where you sit. A motorboat has a wheel in front of you and the eye
         belongs behind it; a canoe is a thing you sit IN, and a first-person
         view three units above its gunwale showed no boat at all. So the
         smaller the hull, the further back and the lower the camera - enough
         to have the thwarts, the paddle and the bow in frame. */
      /* IN the kayak, not behind it. Its hull runs from z -2.45 to 2.45 and
         this said 3.1 - two thirds of a unit off the back of the boat, so the
         view hovered behind the stern looking forward at the cockpit you are
         supposed to be sitting in. Over the cockpit now (it is at z 0.15), a
         hand's width behind its middle and a head above the deck, which is
         where a person's eyes are in a kayak. The canoe's 3.6 is inside its
         own 3.90 hull and stays as it is. */
      const seat = { canoe: [0, 2.15, 3.6], kayak: [0, 1.30, 0.55] }[vessel().id]
                 || [0, 3.05, 1.05];
      _camOff.set(seat[0], seat[1], seat[2]).applyMatrix4(boatObj.matrixWorld);
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
    function chaseCamera(dt) {
      const fr = headFrame(run ? run.head : 0);
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
      /* Closer than it was. At 15 astern / 17 abeam / 10 up this read as a
         wide establishing shot of a big lake, with the boat and the shop as
         small objects in it. In tighter the three places you can go fill the
         frame, which is what the dock is for. */
      /* Out over the water, off the starboard bow, looking back along the
         jetty to the shop: the mooring, the boards and the door all in one
         frame, which is the three things you can pick. */
      /* The original framing, in this world's terms: fifteen along the shore,
         seventeen out over the water, ten up - looking back past the mooring
         to the shop door. */
      atBoat(dockBoat.x, dockBoat.z, 0, 12, 3, _v);
      _v.y += 5.8;
      camPos.lerp(_v, 1 - Math.exp(-3.0 * dt));
      atBoat(dockBoat.x, dockBoat.z, 0, -19, -1, _v2);
      _v2.y += 3.0;
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
      /* NOT FROM SOMETHING AT YOUR FEET. This is the angle from the boat to
         whatever is on the line, which is a sound way to point a camera at a
         float thirty feet out and nonsense for a net, which is dipped at your
         boots: two nearly identical points, so a hand's width of movement
         swings the angle through ninety degrees and the view whips round to
         the shop and back. Close in, the fishing side is the answer. */
      /* Anything on the line this close is at your feet rather than out on
         the water, and two nearly identical points make an angle that swings
         through ninety degrees on a hand's width of movement. Four units, not
         two and a half: a net reaches 2.9 and used to fall just outside this,
         which swung the view off the lake and down the boards every time
         somebody scooped. Reported as turning around 180 degrees. */
      if (Math.hypot(b.lat, b.along) < 4.0) return 0;
      return Math.atan2(b.lat, b.along);
    }

    /**
     * Fishing: the same eye, turned to the side the line is on, so you see one
     * gunwale, the rod, and the water you are casting into.
     */
    function shoulderCamera(r, dt) {
      boatForward(r, _fwd);
      const fr = headFrame(r.head);
      const side = r.fishSide === 'left' ? -1 : 1;
      // Stand at the rail on the fishing side.
      _v.copy(boatObj.position)
        .addScaledVector(_fwd, 0.4)
        .addScaledVector(fr.right, side * 0.55);
      _v.y += 3.2;
      /* Crouching to scoop. The water is three feet below the eye, so a net
         reached down to it from a standing view simply leaves the frame -
         which is what the first version did. You go down with it: the eye
         drops most of the way and comes back up, so the hoop stays in shot
         going in and coming out. */
      /* CROUCHING TO SCOOP, and not through the floor. Two and a third units
         down is right in a boat, where what is under the eye is water. On a
         jetty it is planking, and the camera went through the deck to look at
         the underside of the boards. A third of the crouch on foot; the gaze
         already drops while a net is in hand and that does the rest. */
      const dip = netDip(r);
      if (dip > 0) _v.y -= (vessel().id === 'foot' ? 0.75 : 2.3) * dip;
      camPos.lerp(_v, 1 - Math.exp(-6.0 * dt));

      /* Look where the line is, or straight over the side before it is out.

         ON THE BOARDS, half-way between that and the bow. The camera looking
         squarely down the casting side is right in a boat, where the hull is
         under you and the lake is over the rail - but on a jetty it turns
         your back on the one thing worth seeing. Splitting the difference
         puts the boards down one side of the picture and the water you are
         casting into down the other. */
      const a = lineAngle(r);
      const look = (a === 0) ? side * Math.PI / 2 : a;
      const afoot = vessel().id === 'foot';
      _v2.copy(boatObj.position)
        .addScaledVector(_fwd, Math.cos(look) * 26)
        .addScaledVector(fr.right, Math.sin(look) * 26);
      _v2.y -= 1.4;
      /* A NET IS USED LOOKING DOWN. It reaches four feet, so the water it
         works is at your boots - and from a standing eye looking out over the
         lake, that water is well below the bottom of the picture. The gaze
         drops while there is a net in hand, which is what somebody scooping
         actually does and what puts the patch of water being scanned on
         screen. */
      if (afoot && equippedRod().isNet) _v2.y -= 8.5;
      // ...and further still while the net is in the water.
      if (dip > 0) _v2.y -= 5.5 * dip;
      /* Landing: look AT the fish, not out across the lake. The eye going up
         with it is most of what makes it feel like something being lifted -
         and it saves hoisting the fish over the treeline to get it in shot. */
      if (r.state === S.LANDING) {
        if (rodObj.userData.net && rodObj.userData.head) {
          /* THE NET IS IN YOUR HANDS. This used to point the camera AT the
             hoop - and the hoop, lifted, is a foot from the eye, so lookAt
             swung the whole view round to wherever the handle happened to be:
             on the jetty that is a half turn, straight at the shop, every
             single scoop. Reported as "I turn around 180 degrees after
             scooping." The view stays where it was, over the water you just
             dipped into; the rig is raised into frame by its own lift, and
             the bag hangs in front of you where you can see what came up. A
             touch higher than the dip gaze, because the hoop comes up to
             chest height. */
          _v2.y += 6.0;
        } else {
          _v2.copy(bobberObj.position);
          _v2.y -= catchLenOf();
        }
        camLook.lerp(_v2, 1 - Math.exp(-6.5 * dt));
        cam.position.copy(camPos);
        cam.lookAt(camLook);
        return;
      }
      camLook.lerp(_v2, 1 - Math.exp(-4.0 * dt));
      cam.position.copy(camPos);
      cam.lookAt(camLook);
    }

    /** A world point in the boat's frame: how far ahead, how far to starboard. */
    function boatFrameOf(r, x, z) {
      const dx = x - r.x, dz = z - r.z;
      return { along: dx * Math.sin(r.head) - dz * Math.cos(r.head),
               lat:   dx * Math.cos(r.head) + dz * Math.sin(r.head) };
    }

    /**
     * Where the bobber is, for both the rod and the camera: a world point
     * (x, z) with its boat-frame coordinates (along, lat) beside it, because
     * the camera wants an angle off the bow and the rod wants a place.
     */
    function bobberTrack(r) {
      const S2 = S;
      const side = r.fishSide === 'left' ? -1 : 1;
      const out = (along, lat) => {
        atBoat(r.x, r.z, r.head, along, lat, _v3);
        return { x: _v3.x, z: _v3.z, along: along, lat: lat };
      };
      /* Landing first, and WITHOUT asking where the cast came down: the fish
         is alongside now, on the rail it was played from, and the lift in
         updateRod hangs off this one point. */
      /* Off a boat the fish comes up at the rail, a couple of units off the
         hull. Off the dock it comes up at the ROD TIP, which reaches past the
         end of the boards - land it at the rail and it rises through the
         planks you are standing on. */
      const rail = vessel().id === 'foot' ? DOCK_RAIL : CFG.RAIL_OFF;
      if (r.state === S2.LANDING) return out(0.6, side * rail);
      if (!r.landing) return null;
      const L = boatFrameOf(r, r.landing.x, r.landing.z);
      if (r.state === S2.FLYING) {
        /* It leaves from the ROD TIP, off the side being fished, not from the
           boat's centreline through the hull. */
        const t = U.clamp(r.timer / 0.75, 0, 1);
        return out(U.lerp(2.2, L.along, t), U.lerp(side * rail, L.lat, t));
      }
      if (r.state === S2.REELING && r.reel) {
        const k = U.clamp(r.reel.progress, 0, 1);
        /* A run swings the fish about, but only ever OUTBOARD - half-rectified
           and signed by the rail, so it can never cross through the hull. */
        const sway = r.reel.phase === 'run'
          ? (0.5 + 0.5 * Math.sin(r.reel.phaseT * 2.2)) * 7 : 0;
        let lat = U.lerp(L.lat, side * rail, k) + side * sway;
        // And whatever the arithmetic came to, it stays outboard of the rail.
        if (lat * side < rail) lat = side * rail;
        return out(U.lerp(L.along, 0.6, k), lat);
      }
      if (r.state === S2.WAITING || r.state === S2.HOOKING) return out(L.along, L.lat);
      return null;
    }

    const _rodQ = new THREE.Quaternion();
    const _tipQ = new THREE.Quaternion();
    const _tipUp = new THREE.Vector3();
    const _rodOff = new THREE.Vector3();
    const _netV = new THREE.Vector3();
    const _netF = new THREE.Vector3();
    /* How deep the hoop goes: just under the surface, so the rim breaks it. */
    const NET_UNDER = -0.3;

    /* Where the line ends this frame: the float, or the jaw of whatever is
       hanging off it. */
    const lineEnd = new THREE.Vector3();
    let hasCatchOnLine = false;

    function updateRod(r, dt) {
      hasCatchOnLine = false;
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

      /* The net is carried, not cast: no wind-up, no flick, no swinging it in
         over the shoulder. The scoop is a reach down to the water and back up,
         and the handle tips with it (updateRodRig). */
      const isNet = !!rodObj.userData.net;
      /* How far through the dip we are: down for the first third, under for a
         moment, and back up. None of it is quick - the whole point is that you
         can watch the net go in and see what comes out. */
      let dip = 0;
      if (isNet) {
        bend = 0;
        // Held up to look at, not hoisted overhead.
        lift = (r.state === S.LANDING) ? 0.12 : 0;
        dip = netDip(r);
      }

      rodObj.quaternion.copy(_rodQ);
      rodObj.rotateX(-0.92 + lift);
      rodObj.rotateZ(hand * -0.26);    // and raked outboard

      if (isNet) {
        /* Reach it to the WATER, and not by a guessed number of units: place
           the rig, ask where the hoop ended up, and move the whole thing down
           by exactly the gap to the surface. The camera height at the rail and
           the rake of the handle can then both change without anybody having
           to retune a dip. */
        if (dip > 0) {
          rodObj.updateMatrixWorld(true);
          rodObj.userData.head.getWorldPosition(_netV);
          const drop = Math.max(0, _netV.y - NET_UNDER);
          _netF.set(0, 0, -1).applyQuaternion(_rodQ);
          _netF.y = 0;
          if (_netF.lengthSq() > 0.0001) _netF.normalize();
          rodObj.position.y -= drop * dip;
          rodObj.position.addScaledVector(_netF, 0.5 * dip);
        }
        rodObj.userData.dip = dip;
        rodObj.userData.t = clock;
        /* What is in the bag. On the way up it is this scoop's haul, so the
           catch is visible before any card says so; once it is landed it is
           what was landed, held up while the card comes over. */
        const h = r.netHaul;
        const upPhase = r.state === S.FLYING && r.netScoop && (r.timer / NET_SCOOP_TIME) > 0.5;
        rodObj.userData.fish =
          (r.state === S.LANDING && r.lastCatch && r.lastCatch.netHaul) ? (r.lastCatch.count || 0)
          : (upPhase && h && h.kind === 'fish') ? h.n : 0;
        /* AND THE RUBBISH. A litter scoop showed an empty hoop - on the one
           job in the game that is about pulling rubbish out of the water. */
        rodObj.userData.litter =
          (r.state === S.LANDING && r.lastCatch && r.lastCatch.litter) ? 1
          : (upPhase && h && h.kind === 'litter') ? (h.n || 1) : 0;
      }

      /* Hook and bait go away while something is hanging off them.
         The hook is inside the fish's mouth once it is caught, so drawing it
         over the top of the card - which is what a billboard at the same point
         does - reads as a hook floating in front of the fish. */
      /* Hidden only when something is hanging off it. When the fish came off,
         the empty hook IS the news. */
      const onLine = (r.state === S.LANDING && !!catchObj);
      /* A bare line is bare: no float, no hook, no bait, just line. */
      const bare = !!(RT.game.tackleBroken && RT.game.tackleBroken());
      bobberObj.visible = bobberObj.visible && !bare;
      /* A MAGNET INSTEAD OF THE TACKLE. If there is one on the line, that is
         what is on the line: the horseshoe shows and the float, the hook and
         the bait go away. It used to go out with all three still hanging
         there, so the one job that turns on your choice of gear looked
         exactly like every other cast. */
      const mag = hasMagnet() && !bare;
      /* AND IT STAYS THERE WITH SOMETHING ON IT. The hook goes away when a
         fish is on, because the hook is inside the fish's mouth and drawing
         it in front of the fish looks like a hook floating in mid-air. A
         magnet is the other way round: what comes up is stuck TO it, and
         hiding it left a rusty can rising out of the lake on a bare line. */
      if (rodObj.userData.magnet) {
        rodObj.userData.magnet.visible = mag;
        /* Which magnet, not just whether. See setHeavy in js/art.js. */
        if (rodObj.userData.magnet.userData.setHeavy) {
          const t0 = equippedTool();
          rodObj.userData.magnet.userData.setHeavy(!!(t0 && t0.id === 'heavy_magnet'));
        }
      }
      lastRigCalc = { mag: mag, onLine: onLine, bare: bare, state: r.state };
      /* And the float comes off with them. Nobody hangs a magnet under a
         bobber - it goes to the bottom and gets dragged back. */
      if (rodObj.userData.floatBody) rodObj.userData.floatBody.visible = !mag;
      if (rodObj.userData.hook) rodObj.userData.hook.visible = !onLine && !bare && !mag;
      if (rodObj.userData.baitHold) rodObj.userData.baitHold.visible = !onLine && !mag;
      if (rodObj.userData.dropper) rodObj.userData.dropper.visible = !bare && !mag;

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
        _v2.set(bt.x, 0, bt.z);
        if (r.state === S.FLYING) _v2.y += Math.sin(U.clamp(r.timer / 0.75, 0, 1) * Math.PI) * 6;
        /* A MAGNET GOES DOWN. It rode the surface like the float it replaces,
           which is exactly backwards: you throw it out, it sinks, and you drag
           it along the bottom. It takes about a second to get there, goes as
           deep as the water is - within reason, so it does not disappear into
           forty feet of dark - and comes back up the last of the way as it
           reaches the rail, which is what being lifted out looks like. */
        /* WHAT SINKS: a magnet, and any lure rigged without a float. The
           float is the only thing on this line that is meant to stay on top
           of the water. */
        const sinks = mag || equippedBait().usesFloat === false;
        if (sinks && (r.state === S.WAITING || r.state === S.HOOKING)) {
          const ft = (r.landing && r.landing.depthFt) || 0;
          const cap = mag ? CFG.MAG_SINK_MAX
                          : CFG.LURE_SINK_MAX * ((equippedBait().id === 'deep_rig') ? 1.35 : 1);
          const deep = Math.min(ft * 0.61 * 0.85, cap);
          r.sinkT = Math.min(1, (r.sinkT || 0) + dt / 1.1);
          /* Up again at the rail: the last few units of a retrieve are the
             thing on the end coming out of the water into your hand. */
          let lift = 1;
          if (r.landing) {
            const home = Math.hypot(r.landing.x - r.x, r.landing.z - r.z);
            lift = U.clamp((home - CFG.REEL_IN_DONE) / 6, 0, 1);
          }
          const under = deep * U.smoothstep(r.sinkT) * lift;
          _v2.y -= under;
          /* AND ONCE IT IS UNDER, IT IS NOT DRAWN. Something meant to be
             deeper that you can see plainly is not deeper - it is floating in
             front of the water. The line still runs down to it, which is all
             anybody can see of a bait that has gone down; it comes back into
             view as it is lifted out at the rail, or when a fish brings it up. */
          if (under > 0.12) {
            if (rodObj.userData.magnet) rodObj.userData.magnet.visible = false;
            if (rodObj.userData.hook) rodObj.userData.hook.visible = false;
            if (rodObj.userData.baitHold) rodObj.userData.baitHold.visible = false;
            if (rodObj.userData.floatBody) rodObj.userData.floatBody.visible = false;
            if (rodObj.userData.dropper) rodObj.userData.dropper.visible = false;
          }
        }
        /* A nibble pulls the float under for a moment. run.teaseAt is set to
           zero the instant it happens and counted up here, so the dip is a
           short curve and then it bobs back - the same shape a real one has. */
        if (r.state === S.WAITING && r.teaseAt !== undefined && r.teaseAt !== null) {
          r.teaseAt += dt;
          const k = U.clamp(r.teaseAt / 0.85, 0, 1);
          if (k < 1) {
            /* A nibble. Under a float it is the float going under; on a lure
               with no float there is nothing on the surface to dip, so it is
               a knock on the rod tip instead - the same tell, told the way
               that tackle would tell it. */
            if (equippedBait().usesFloat !== false) _v2.y -= Math.sin(k * Math.PI) * 0.55;
            /* A KNOCK, NOT A FIGHT. This peaked at 0.68 - more bend than the
               0.5 the rod holds with a fish actually on it - so a fish
               THINKING about a spoon hooped the blank harder than one fighting
               on the end of it, and it happens over and over while you wait.
               Reported as the rod bending a lot for no reason. A fifth of it:
               enough to see the tip twitch, nowhere near a fish. */
            else bend = Math.max(bend, 0.10 + Math.sin(k * Math.PI) * 0.10);
          } else r.teaseAt = null;
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
          /* And IN, to where you would hold it to look at it.
             A fish is lifted out at the end of a line two units from the eye,
             and at that distance an eight-inch sunfish is ninety pixels of a
             seven-hundred-pixel rod - true to scale and unreadable. So the
             hang point comes in toward the lens as it rises, which is what
             anybody does with a fish they have just landed: the size against
             the rod and the hand stays honest, the fish is simply held up. */
          const near = U.smoothstep(U.clamp(t / 0.6, 0, 1));
          _netF.copy(_v2).sub(cam.position);
          const gap = _netF.length();
          const want = Math.min(gap, U.lerp(gap, 1.15, near));
          if (gap > 0.01) _v2.copy(cam.position).addScaledVector(_netF.divideScalar(gap), want);
          bend = 0.62 - 0.2 * t;         // the rod stays loaded: it is holding a fish

          const fish = ensureCatch(r);
          if (fish) {
            /* Hung from the hook in its jaw. Head up, tail down, side-on to
               whoever is looking - so what you see is the fish on the card,
               the size the card says it is. */
            /* The fish hangs BELOW the float, on the bit of line the rig
               shows between them. */
            /* CLOSE UNDER THE FLOAT, and on the line. It hung a third of a
               unit down with nothing drawn between, because the line stops at
               the float - so the fish read as flying alongside the rig rather
               than hanging off it. Nearer, and the line is run on down to it
               below (lineEnd). */
            fish.position.copy(_v2);
            fish.position.y -= 0.2;
            /* STUCK TO THE MAGNET, when there is one. Hung off the end of the
               line it floated beside the horseshoe rather than on it, which
               is not how a magnet works. Taken from the magnet's own world
               position so it holds however the rig is scaled. */
            if (mag && rodObj.userData.magnet) {
              const m = rodObj.userData.magnet;
              m.updateWorldMatrix(true, false);
              m.getWorldPosition(_magP);
              /* TOUCHING THE POLES. Hung a fixed distance under the magnet it
                 dangled below it with a length of line showing between the
                 two, which is a thing on a hook and not a thing on a magnet.
                 Measured off what came up, so a boot and a bottle top both
                 sit against the poles rather than one of them floating. */
              /* Off the magnet's own size, which is no longer the float
                 group's: the haul is stuck to the iron, so where it sits is
                 measured in magnets, not in floats. */
              const magK = (rodObj.userData.magnet && rodObj.userData.magnet.userData.k) || 1;
              const sc = (bobberObj.scale.x || 1) * magK;
              fish.updateMatrixWorld(true);
              _fBox.setFromObject(fish);
              const half = _fBox.isEmpty() ? 0.4 : (_fBox.max.y - _fBox.min.y) * 0.5;
              fish.position.copy(_magP);
              /* Measured off two hauls, a wrench and an anchor: a billboard's
                 box is a good deal taller than the paint on it, so hanging it
                 by the full half-height leaves it swinging a foot under the
                 iron. It rides UP into the poles instead - a little overlap
                 reads as stuck to the magnet, a gap never does. */
              fish.position.y -= 0.34 * sc + half * 0.25;
              /* And the line stops at the magnet, because that is where it
                 stops: what comes up is stuck to the iron, not tied on below
                 it on six inches of nylon. */
              lineEnd.copy(_magP);
              lineEnd.y += 0.58 * sc;      // the eye at the crown of the arch
            } else {
              lineEnd.copy(fish.position);
            }
            hasCatchOnLine = true;
            const swing = Math.sin(clock * 3.1) * 0.05 * (1 - t * 0.5);
            const kick = Math.sin(clock * 12) * 0.06 * Math.max(0, 1 - t * 1.6);
            // A fish hangs head-up from its jaw; junk just dangles and turns.
            /* A quarter turn, the way that puts the HEAD up: the other way
               round for a fish painted facing left. Junk has no jaw and just
               dangles. */
            const hang = (r.lastCatch && r.lastCatch.type === 'fish')
              ? (fish.userData.headLeft ? -Math.PI / 2 : Math.PI / 2) : 0;
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
        /* On the water the float rides proud of the pads and the stains. On a
           LANDED fish it sits a hand's length ABOVE the fish - which is what a
           lifted rig looks like: float, a few inches of line, then the hook in
           the jaw. Putting it exactly at the mouth welded the two together;
           putting it a third of a unit up with nothing between left the fish
           hanging in mid-air. */
        _v2.y += (r.state === S.LANDING) ? 0.2 : 0.3;
        bobberObj.position.copy(_v2);
        /* THE FLOAT IS A MARKER AT RANGE AND A FLOAT UP CLOSE.
           It is built oversized on purpose: forty units out, a real
           inch-and-a-half float is two pixels and there is nothing to watch.
           But at the landing the camera is a couple of units away and that
           same float sat next to a seven-inch sunfish looking bigger than
           it - which made every fish in the game look like a minnow. So it
           shrinks toward its true size as the camera closes on it. */
        /* AND IT IS THE FLOAT'S TRICK, not the magnet's. A magnet rig has no
           float - and the magnet is a real object at a real size now, so
           growing it with distance would undo that. */
        const bd = cam.position.distanceTo(bobberObj.position);
        bobberObj.scale.setScalar(hasMagnet() ? 1 : U.clamp(bd / 24, 0.3, 1));
      }
      // The net's scoop: down into the water and back over the flight beat.
      rodObj.userData.dip = (r.state === S.FLYING && r.netScoop) ? Math.sin(U.clamp(r.timer / 0.75, 0, 1) * Math.PI) : 0;
      /* ROD, LINE, FLOAT, LEADER, FISH - in that order, all on one string.
         The line used to stop at the float, so a landed fish hung under it
         attached to nothing; running it to the fish instead left the FLOAT
         hanging in the air beside the line. It takes both points now. */
      RT.art.updateRodRig(rodObj, bend, bobberObj.position,
                          hasCatchOnLine ? lineEnd : null);
    }

    /** A dashed arc from the boat out to the predicted landing point. */
    function updateAimLine(r) {
      const frac = r.state === S.CHARGE ? Math.max(CFG.MIN_CAST_FRAC, r.power / 100) : 1;
      const d = r.range * frac;
      const pos = aimLine.geometry.attributes.position;
      const N = 22;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        atBoat(r.x, r.z, r.head + r.aim, d * t, 0, _v);
        _v.y += 1.6 + Math.sin(t * Math.PI) * (r.state === S.CHARGE ? 3.5 * frac : 2.0);
        pos.setXYZ(i, _v.x, _v.y, _v.z);
      }
      pos.needsUpdate = true;
      aimLine.computeLineDistances();

      atBoat(r.x, r.z, r.head + r.aim, d, 0, _v);
      landMark.position.copy(_v);
      /* Above the shoals. The fish shadows sit just under the surface, and the
         arrow marking where the cast will land has to be readable ON TOP of
         the very fish it is pointing into - being hidden by them is the one
         place it must not be. */
      landMark.position.y += 0.75;
      // Lay the arrow along the line, so it points where the cast is going.
      landMark.rotation.y = -(r.head + r.aim);
    }

    function perf() {
      if (!rend) return null;
      const i = rend.info;
      return { calls: i.render.calls, tris: i.render.triangles,
               shoals: shoalObjs.size };
    }

    /**
     * Should report 0 degrees. A chase camera hides small yaw errors.
     *
     * Worth keeping through the move off the rail, because it checks the one
     * sign that has caused trouble twice: a -Z-facing model rotated by
     * frame.yaw must end up pointing along frame.forward. Get it wrong and the
     * boat travels one way while facing another.
     */
    function debugAlignment(head) {
      if (!boatObj) return null;
      const h = head === undefined ? (run ? run.head : 0) : head;
      const fr = headFrame(h);
      const f = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, fr.yaw, 0));
      return Math.round(THREE.MathUtils.radToDeg(f.angleTo(fr.forward)) * 100) / 100;
    }

    /* Where a hooked fish would be for a given fight state. Exposed so the
       fight can be swept exhaustively — every phase, every point of the
       retrieve, both rails — rather than hoping one live fight happens to
       swing the fish through the hull. */
    function debugBobberTrack(fakeRun) { return bobberTrack(fakeRun); }

    /**
     * What is actually on the end of the line right now.
     *
     * Because "the magnet is not showing" has three possible answers - it was
     * never built, it was built and left invisible, or it is visible and two
     * pixels wide - and only the scene knows which.
     */
    let lastRigCalc = null;

    /** How high the thing on the end of the line is riding, in world units.
        Zero is the surface: a float sits on it, a sinking lure hangs under. */
    function rigHeight() { return bobberObj ? bobberObj.position.y : null; }

    function debugRig() {
      if (!rodObj) return { rig: false };
      const u = rodObj.userData;
      return {
        rig: true,
        magnetExists: !!u.magnet,
        magnetVisible: !!(u.magnet && u.magnet.visible),
        hookVisible: !!(u.hook && u.hook.visible),
        floatVisible: !!(bobberObj && bobberObj.visible),
        floatScale: bobberObj ? Number(bobberObj.scale.x.toFixed(2)) : null,
        onTheLine: hasMagnet() ? 'magnet' : (equippedBait().id || 'nothing'),
        /* What updateRod last worked out - so "the magnet is invisible" can be
           told apart from "updateRod never ran". */
        lastCalc: lastRigCalc,
      };
    }
    /** Every piece of the dock and where it stands, against the ground under it - for tools/dockcheck.js. */
    function dockLayout() {
      if (!dockGroup || !lake) return [];
      const rows = [];
      dockGroup.children.forEach(function (o, i) {
        const x = o.position.x, z = o.position.z;
        rows.push({ name: o.name || o.userData.kind || ('prop' + i), x: x, y: o.position.y, z: z,
                    ground: lake.groundAt(x, z), inWater: lake.inWater(x, z), depthFt: lake.depthAt(x, z) });
      });
      if (dockBoat) rows.push({ name: 'boat', visible: boatObj.visible, vessel: vessel().id, x: dockBoat.x, y: boatObj.position.y, z: dockBoat.z,
                                ground: lake.groundAt(dockBoat.x, dockBoat.z), inWater: lake.inWater(dockBoat.x, dockBoat.z),
                                depthFt: lake.depthAt(dockBoat.x, dockBoat.z) });
      rows.push({ name: 'camera', x: camPos.x, y: camPos.y, z: camPos.z, ground: lake.groundAt(camPos.x, camPos.z),
                  inWater: lake.inWater(camPos.x, camPos.z), depthFt: lake.depthAt(camPos.x, camPos.z) });
      return rows;
    }

    return { init, showAttract, showDock, showShop, startTrip, update, repaint, teardown,
             perf, debugAlignment, debugBobberTrack, debugRig, rigHeight, dockLayout, landingPoint,
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
    isSolved, haveTheParts,
    /* The word that goes in front of a name. A net haul is called "5 tiny
       fish" and everything landed is announced as "A " plus its name, so this
       is the difference between "A 5 tiny fish" and "5 tiny fish" - and it
       cannot be checked from the outside, because a suite that trolls for
       nine jobs never scoops a net. */
    withArticle, articleFor,
    /* Whether a magnet is on the line, which changes what fishing IS: cast and
       retrieve rather than cast and wait. The harness has to fish it the way a
       player does or it sits over a magnet waiting for a bite that cannot come. */
    magnetOn: hasMagnet,
    /* How near a shoal has to be before the game will talk about it or offer
       it. The interface and the test harness both have to agree with the
       engine about this, or one of them is steering to a rule the other does
       not follow. */
    spotOffer: offerRange,
    /* What the game would put a card up for right now. The card itself
       is built in ui.js, which no headless check can run, so this is
       how one asks WHICH spot is being offered. */
    debugActiveSpot: function () { return run ? activeSpot() : null; },
    /* Which painting a haul would be shown with - so a check can see that
       scrap is not the same lump every time. */
    debugCatchArt: function (o) { return catchArtSrc(o); },
    /* How hard the water at a point is on a hull, as a multiple. */
    debugWearFactor: function (x, z) { return deepWearFactor({ x: x, z: z }); },
    /* ── THE QUIET LAKE, FROM THE OUTSIDE ────────────────────────────────
       The two rolls that only exist after the story - one fish in two hundred
       casts that fit, one find in two hundred drags - happen deep inside the
       bite pipeline behind a landing, a shoal and a rod. A check has to be
       able to ask them directly or the only way to test a half-per-cent event
       is to play for eleven hours. `debugSolve` is the same door: the flag is
       set by handing the bell in, which is thirty-eight jobs away. */
    debugReelPlan: debugReelPlan,
    /* The job's own marked place, so a check can see what the card is drawn
       with - a magnet spot must never be drawn with the thing it hides. */
    debugPlaceShoal: function () { placeShoal._c = null; return placeShoal(); },
    debugSolve: function (on) { save.solved = on !== false; persist(); return isSolved(); },
    debugMysteryRoll: function (biomeId, baitId, rodId) {
      return rollMysteryBite(biomeId, baitId, rodId, Math.random);
    },
    debugRelicRoll: function (biomeId) { return rollRelicBite(biomeId, Math.random); },
    /* The chart the boat actually drives on, so a check can see the timber
       come off it. */
    debugChart: function () { return chart(); },
    /* WHERE THE ARROW IS POINTING, and whether a given patch of water counts
       as the job's. A job that names a fish AND a depth has to mean both, and
       that could not be asked from outside the engine at all. */
    debugHelperTarget: function () { return run ? helperTarget() : null; },
    /* Every shoal in a radius, so a check can ask how far it really is to
       water NAMED after the job's fish as against water that merely holds
       some - the difference between an arrow that makes sense and one that
       sends you to a pike. */
    debugShoalsNear: function (x, z, rad) { return shoalsNear(x, z, rad); },
    debugSpotSuitsJob: function (spot) { return !!spotSuitsJob(spot); },
    /* SCORE ONE THING AGAINST A JOB, from the outside. "Five pieces of
       litter" was finished by the first one out of the water, and there was
       no way to ask the question without playing the job - so a check can
       hand a job a find and see what the count does. */
    debugApply: function (m, outcome) { return applyToTarget(m, outcome); },
    /* What a job's line in the corner of the screen reads, which for a
       collection is the only place the count is shown. */
    debugTargetWords: function (m) {
      return m ? targetProgressText(m, save.progressValue) : null;
    },
    /* What has been found for good, and the two tables it is drawn from. */
    debugSets: function () {
      return { mystery: setHeld('mystery').slice(), relics: setHeld('relics').slice(),
               fishPool: mysteryFish().map(function (f) { return f.id; }),
               relicPool: relicTable().map(function (i) { return i.id; }) };
    },
    /* Every fish the water will OFFER at a depth, and every name a shoal can
       be called - the two lists a mystery fish must never appear in. */
    debugWaterNames: function (biomeId, ft) {
      return { biome: biomeFish(biomeId).map(function (f) { return f.name; }),
               atDepth: speciesAtDepth(ft).map(function (f) { return f.name; }) };
    },
    /* Break the line on purpose. The one way a trip can end with nothing on
       screen to press, so it is worth being able to reach it from a check
       rather than fishing until the lake does it for you. */
    debugSnapLine: () => {
      if (!run || !run.bite) run && (run.bite = { category: 'fish', speciesId: 'perch' });
      if (!run) return null;
      save.tackleBroken = true;
      loseFish();
      return true;
    },
    /* The heading that actually gets you there - round whatever will not
       float you. The interface, the helper and the test harness all have to
       steer the same course or they are testing different games. */
    clearHeading: (x, z) => clearHeading(x, z),
    callbacks,
    css, refreshPalette, PALETTE_VARS,
    getCueLevel, cycleCueLevel,
    /* The quest helper: the arrow that points at the job. */
    getHelper: () => save.helper !== false,
    toggleHelper: () => { save.helper = save.helper === false; persist(); return save.helper !== false; },
    keeperLength, keepersOn, setKeepers,
    bestRod, bestRodId, ownsRod, nextRod, buyRod,
    ownsBait, equippedBait, buyBait, nextBait,
    /* The lure the job's fish will take, whether or not it is owned yet. The
       shop, the brief, the check at the slip and the test harness all have to
       agree about this or they are playing different games. */
    jobLure: () => { const m = currentMission(); return (m && m.target) ? lureFor(m.target.speciesId) : null; },
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
    nudgeLine, doneLines: (m) => doneLines(m || currentMission()), lureIsFor,
    waltLine, logLine,
    /* The written game's three new verbs: take the beat out on the water,
       hear the keeper out, ring the bell. */
    takeBeat, counterBeat, takeCounterBeat, hasFlag, isBriefed, briefSteps,
    /* How unpredictably fish are fighting at this point in the ladder, and
       one whole fight worked out on paper for tools/fightcheck.js. */
    fightWildness, debugFight,
    /* Where the quest helper is pointing, for tools/helpercheck.js. */
    helperTarget: () => helperTarget(),
    /* One snag, rolled by hand - so tools/littercheck.js can see what a
       hundred of them actually bring up rather than trusting the table. */
    __rollJunk: () => rollJunkItem(),
    /* The map of the lake: whether you have one, and what it should draw. */
    hasMap, mapState,
    /* The tackle box: what is in the boat, and whether it suits the job. */
    equipKit, equippedRod, equippedBait, equippedTool, kitCheck, jobWants,
    /* Where a rod's own painting lives, for the dock's kit panel and the
       tackle box. Empty for a rod nobody has painted yet, which both fall
       back on an icon for. */
    rodArtFor: rodIconSrc,
    /* And the icon each lure is shown with - one per lure, from the roster's
       own ids. The tackle box was showing every one of them as a line of
       words. */
    baitIconFor: function (id) { return baitArt({ id: id }).emoji; },
    /* A magnet's own painting, for the note, the helm and the tackle box. */
    toolArtFor: function (id) {
      const t = (roster().tools || []).find(function (x) { return x.id === id; });
      return toolIconSrc(t);
    },
    ownsRod, ownsBait,
    /* What would put the box right without a trip to the shop, and the way
       to fit it. Null whenever the shop is genuinely the only answer. */
    kitFix, applyKitFix,
    /* What you own, for the box to lay out. Ladder order, nets first, so the
       list reads the way the game was learned. */
    shopRods: () => D.RODS.filter(r => ownsRod(r.id))
      .map(r => ({ id: r.id, name: r.name, isNet: !!r.isNet, castFt: r.castFt || 0, reachFt: r.reachFt || 0 })),
    shopBaits: () => (save.baits || []).map(baitById).filter(Boolean)
      .map(b => ({ id: b.id, name: b.name, note: b.description || '' })),
    /* What can go ON THE LINE: magnets. The tagging tool is always in your
       pocket and the sonar is screwed to the boat - neither is a choice, and
       listing them in the tackle box implied they were. */
    shopTools: () => (roster().tools || []).filter(t => ownsTool(t.id) && t.kind === 'magnet')
      .map(t => ({ id: t.id, name: t.name, kind: t.kind, note: t.note || '' })),
    tackleBroken: () => !!save.tackleBroken,
    /* Which water, and what it is called. The dock plate, the chart and the
       log all want to say where you are. */
    buyVessel, buyTool, nextVessel, nextTool, nextOffer, takeOffer, ownsVessel, ownsTool, vessel, tagCount,
    /* Which way you are going out: the boards, or the boat. */
    setOnFoot: (on) => { tripOnFoot = !!on; pushHud(); },
    isOnFoot: () => tripOnFoot,
    /* A hull you own can be scuffed, and only a motor burns fuel - so the
       counter has nothing to say about either until you have the boat. */
    hasHull: () => (roster().vessels || []).some(v => ownsVessel(v.id) && v.durability),
    burnsFuel: () => (roster().vessels || []).some(v => ownsVessel(v.id) && v.burnsFuel),
    /* Where the current job's place is, if it has one - what the chart rings. */
    jobPlace: () => { const p = placeShoal(); return p ? { x: p.x, z: p.z, key: p.key, label: p.fishName } : null; },
    /* And where the job's own fish are, which is what the gold marks on the
       chart point at. Wider than the chart's own crop, because "there are none
       anywhere near you" is a thing worth being able to answer. */
    jobFish: (rad) => {
      const m2 = currentMission(); const t = m2 && m2.target;
      /* Either the fish the job names, or - for a job that only asks for
         depth ("eight from the deep hole") - any shoal in water deep enough
         to count. Both are what the gold marks on the chart point at. */
      if (!t || !run || (!t.speciesId && !t.minDepthFt)) return null;
      const jobKey = (m2.id || m2.n) + ':' + (t.speciesId || '') + ':' + (t.minDepthFt || 0);
      if (jfFrame === frameNo && jfFor === jobKey) return jfCache;
      const far = rad || Math.max(600, reach());
      let out = null;
      /* Outward in rings. The whole of a motorboat's water is nine thousand
         cells; sweeping all of it several times a second to find fish that
         are usually a few hundred units away is how a two-minute playthrough
         became a ten-minute one. The first ring that has them wins. */
      /* NAMED FIRST, ACROSS THE WHOLE LAKE - then holders. A pike shoal in
         crappie water really does have crappie in it, so it is a fair place
         to send somebody, but only once there is no CRAPPIE shoal to send
         them to. This preference has always been here; it was inside the ring
         search, which asked it only of the four hundred units nearest the
         boat - so on job seven a pike shoal at 216 units beat a crappie shoal
         at 512, and the arrow sent you to a card with the wrong fish on it.
         Reported: "it might be confusing if it doesn't take you to the
         location with the right fish name." The rings are the inner loop now.

         WATER THIS ROD CAN FISH, first, within each of those. A rod worked
         past its rating loses rigs, so pointing somebody at forty feet with a
         thirty-five foot rod is pointing them at a snapped line. Deeper water
         is still offered if there is nothing else: being sent somewhere hard
         beats being sent nowhere. */
      const rodFt = (rodById(bestRodId()) || {}).reachFt || 0;
      for (const wantNamed of [true, false]) {
      for (const withinRod of [true, false]) {
        for (let r0 = 400; !out && r0 < far * 2; r0 *= 2) {
          const near = shoalsNear(run.x, run.z, Math.min(r0, far));
          for (let i = 0; i < near.length && !out; i++) {
            const sh = near[i];
            if (run.taken[sh.key]) continue;
            if (withinRod && rodFt && sh.ft > rodFt) continue;
            if (t.speciesId) {
              const named = sh.fishId === t.speciesId;
              const holds = !!(sh.pool && sh.pool.indexOf(t.speciesId) >= 0);
              if (wantNamed ? !named : !(named || holds)) continue;
            }
            /* Deep enough to count. "Three catfish from fifty feet" is not
               three catfish: a shoal of them in twenty feet of water is the
               wrong water, and pointing the boat at it is pointing nowhere. */
            if (t.minDepthFt && sh.ft < t.minDepthFt) continue;
            // It also has to be somewhere this boat can actually get to AND fish.
            if (!fishableShoal(sh)) continue;
            const L2 = chart();
            if (L2 && L2.fromDock(sh.x, sh.z) > reach()) continue;
            out = { x: sh.x, z: sh.z, key: sh.key, label: sh.fishName, depthFt: sh.ft,
                    named: sh.fishId === t.speciesId };
          }
        }
        if (out) break;
      }
      if (out) break;
      }
      jfFrame = frameNo;
      jfFor = jobKey;
      jfCache = out;
      return out;
    },
    shopStock, buyStock, ownedTier, ownedGear, gearAdvice, fishLog, missionLog,
    buyFuel, buyRepair,
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
      targetBiomes, otherBiomes, isAllTarget, rollBite, biteWeightedFishPool,
      rollFishCatch, resolveCatch, applyToTarget, targetProgressText, targetComplete, biteWait,
      auditMissions, newRun, castRange, shoalOffset, grantFor,
      CFG, TIERS
    }
  };
})();
