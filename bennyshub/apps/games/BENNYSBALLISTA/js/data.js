/**
 * Benny's Ballista — tunables, materials and ammunition.
 *
 * Everything a designer might want to move lives here, in one object, so the
 * rest of the game can be read without hunting for magic numbers.
 *
 * ── Coordinate system ──────────────────────────────────────────────────────
 * One block is ONE world unit, which is also what keeps Bullet happy (it is
 * tuned for objects roughly 0.1–10 units across).
 *
 *   +X  lateral, right as the player sees it   (the aim sweep moves along this)
 *   +Y  up
 *   -Z  downrange, away from the ballista      (the range meter moves along this)
 *
 * "Range" is always stored as a POSITIVE distance downrange, and only the
 * scene placement negates it into a Z coordinate. That way every piece of
 * ballistics maths below reads in plain positive numbers.
 *
 * ── The one rule that shapes the whole game ────────────────────────────────
 * POWER SETS RANGE, NOT FORCE. The muzzle speed of a given ammunition never
 * changes; the range meter picks a distance and the launch elevation is
 * *solved* to land there. So impact damage cannot depend on how long the
 * player held the switch, and an early release costs accuracy but never
 * effect. There is no such thing as an undercharged dud.
 */
RT.data = (function () {
  'use strict';

  const U = RT.util;

  /* ── Tunables ─────────────────────────────────────────────────────────── */
  const CFG = {
    /* Input, matching the rest of the hub. See ../../../../AGENTS.md. */
    SPACE_HOLD_MS   : 3000,   // hold Space this long in a list to scan by itself
    RETURN_HOLD_MS  : 3000,   // hold Return this long to back out / open Pause
    SCAN_DIR_ON_HOLD: -1,     // -1 = backward, matching every other hub game

    /* ── The two meters ───────────────────────────────────────────────────
     * Both crawl on purpose: the player has to be able to watch one approach
     * the value they want and let go, not catch it. Neither has a deadline,
     * the sweep bounces at its ends instead of stopping, and the range meter
     * clamps at full instead of wrapping, so there is no moment to miss.
     *
     * Both limits are derived per level (see rangeWindow / yawLimit below)
     * rather than being absolute, so a meter never has dead travel at one end
     * just because a castle happens to sit close in or far out.
     */
    YAW_DEG_PER_S   : 4.2,    // keyboard sweep, 30% slower for comfortable timing
    YAW_TICK_DEG    : 3,      // soft tick every this many degrees while sweeping
    YAW_PAD_CELLS   : 2.0,    // sweep this far past each side of the castle
    YAW_MIN_HALF_DEG: 7,      // ...but never a sweep narrower than this
    YAW_EXTRA_DEG   : 2,      // flat bonus added to every level's half-angle, on top of the above

    RANGE_PCT_PER_S : 12,     // 0 -> 100% in 8.3s
    RANGE_TICK_PCT  : 10,     // beep every this much
    RANGE_PAD_NEAR  : 7.0,    // meter starts this far short of the castle front
    RANGE_PAD_FAR   : 7.0,    // ...and ends this far past its back
    DEFAULT_RANGE_PCT: 50,    // what the very first shot of a session aims at

    METER_PREVIEW_MS: 60,     // re-run the arc at most this often while moving

    /* ── Physics ──────────────────────────────────────────────────────────
     * GRAVITY is well above real-world for a 1-unit block, which is what makes
     * a collapse read as chunky and toy-like rather than floaty. It is also
     * the single number every ballistics result depends on, so changing it
     * means re-checking every level's ballistics — run auditLevels() (every
     * castle still stands) and auditAmmoOffers() (every offered ammo can
     * still physically reach) from the console, or just reboot the game.
     */
    GRAVITY         : 14,     // units/s^2, downward
    DT              : 1 / 120,  // physics substep
    MAX_SUBSTEPS    : 8,

    BLOCK_FRICTION    : 0.62,
    BLOCK_RESTITUTION : 0.04,
    GROUND_FRICTION   : 0.9,
    GROUND_RESTITUTION: 0.05,
    /* Lowered (from 0.02/0.06) so debris keeps moving/tumbling longer instead
       of settling fast — this is what actually makes a collapse read as
       throwing debris FURTHER, not just launching it harder. Re-verify
       auditLevels() (every castle still stands unaided) after touching
       these — a resting castle relies on the same damping to actually come
       to rest. */
    LINEAR_DAMPING    : 0.01,
    ANGULAR_DAMPING   : 0.03,
    /* Bullet puts a body to sleep below these for half a second. Sleep is what
       tells the camera a collapse has finished, so these matter to pacing as
       well as to cost. */
    SLEEP_LINEAR      : 0.28,
    SLEEP_ANGULAR     : 0.35,

    /* How hard a LATERAL board bond can be pushed before it lets go, in
       Bullet impulse (mass * velocity, and a 1-cell block masses 1). Only
       side-by-side/front-to-back bonds get this; a board resting ON a post
       stays rigid, since that is what stops a crown tipping off it. See
       js/levels.js's contactAxis() and js/physics.js's addWeld().

       The window is bounded at both ends and both ends are measured, not
       guessed. Sweeping the threshold against all sixteen castles standing,
       and against a realistic bolt knock (ammo speed ~24 * KNOCK_SCALE, so
       about 30 units/s) into The Warehouse's board frame:

         0.25  The Warehouse no longer STANDS — a frame sags apart under its
               own weight (worst piece 2.8 units).
         0.5   ) every castle stands, and a hit scatters 21-33 pieces up to
         1.0   ) 7 units — the span actually comes apart and tumbles.
         1.5   )
         3     a hit on a rail only frees 2 pieces.
         5     a hit on a rail frees NOTHING, and the lintel nudges 0.49 as
               one unit: the immovable-lump feel this constant exists to fix.

       1.0 sits four times above where frames stop standing and squarely in
       the responsive band. Re-measure both ends before moving it — the
       failure at the bottom is abrupt, not gradual. */
    LATERAL_WELD_BREAK: 1,

    /* The crown's and a guard's own bond to whatever they're standing on
       (js/levels.js's weldBreak()). Far weaker than a structural bond on
       purpose: it exists only to stop a figure sliding off a narrow perch
       while the castle stands, and a figure that stays stuck to its board
       through a collapse looks nailed down. Above the roughly
       mass * GRAVITY * DT (~0.12 for a one-cell figure) it takes just to
       hold one still, and well below what any real hit delivers. */
    PROP_WELD_BREAK   : 0.4,

    /* Physical rubble uses a few cached timber-splinter / masonry-chunk
       sizes, capped at 24 per broken piece and DEBRIS_MAX in the scene.
       Scatter adds to inherited linear and angular motion. */
    DEBRIS_SCATTER    : 3.2,
    DEBRIS_MAX        : 160,

    /* Legacy peak-speed fallback for long falls. In addition, settle.js
       measures actual contact-point closing speed (including rotation)
       for immediate material-specific fracture and collateral damage. */
    IMPACT_THRESHOLD  : 7.5,   // units/s of lost speed before damage starts
    /* Raised 5.0 -> 20.0 on 2026-09-11, together with CRUSH_DMG_SCALE below
       and a matching cut to the figures' fallDmgMult (see MAT.K), so that a
       COLLAPSE actually wrecks masonry. It was not doing that. Measured
       across six real collapse scenarios in five castles (a shot into the
       Cloister balk, a Cloister hall post, a Bridge pillar, a Warehouse
       frame, a Citadel pillar, a Siege Tower pillar, three trials each), the
       old numbers broke an average of 2.3 stone blocks per collapse; these
       break 8.0. Timber went 8.7 -> 12.7.

       Why the SCALES and not IMPACT_THRESHOLD: damage is
       `(drop - THRESHOLD) * SCALE`, and in a real castle collapse `drop`
       lands between about 8 and 13, so the bracket is a small number and
       multiplying it is the honest lever. Lowering the threshold instead
       was measured and rejected — at 5.0 it turns near-stationary jostling
       into damage, and a stone bolt into the Cloister's GATE JAMB killed the
       crown standing on the gallery at the far end of the castle, in both
       trials. A level stops being a puzzle when any hit anywhere wins it.
       The threshold also has to stay well clear of an ordinary settle: the
       worst legitimate settle peak across all seventeen castles is The
       Watchtower at 1.73 units/s (everything else is under 0.6), and 7.5
       keeps a 4.3x margin. Anything at or under about 4 starts eating into
       that AND makes auditLevels() a coin toss.

       What this deliberately does NOT change is how easily a crown or a
       guard dies, because that was already right and because making figures
       more fragile is what causes the far-end one-shot above. Their
       fallDmgMult is cut by the same factor these scales rise by, so the
       product — the only thing the damage formula actually uses — is
       identical to what it was. Verified rather than asserted: every
       designed kill route in the game (both Cloister routes, the Bridge,
       the Siege Tower, the Grand Citadel) kills exactly the same crowns,
       3/3 trials, before and after; and the rate at which a deliberately
       unrelated shot kills a crown went DOWN, 4 of 12 runs to 2 of 12.
       All seventeen castles still pass auditLevels(). */
    IMPACT_DMG_SCALE  : 20.0,
    /* Crush damage: a hard-landing block (same drop check as IMPACT_DMG_SCALE
       above) also hurts whatever it's now resting directly on top of, using
       the same drop speed but its own scale — "getting crushed" reads as
       worse than "you personally hit something hard", and tuning one must not
       force-tune the other. See js/settle.js's applyCrush().

       Raised 8.0 -> 32.0 with IMPACT_DMG_SCALE above, same 4x, same reason.
       What it buys, in free-fall heights (a fall of h units arrives at
       sqrt(28h), and the bracket is that minus 7.5):
         2 units  nothing at all, at any scale — 7.48 is under the threshold.
                  This is unchanged and worth keeping: it is what stops an
                  ordinary one-row resettle chipping a castle to bits.
         3 units  53 crush. A 90 hp stone block survives one, not two.
         4 units  98 crush — a stone block breaks outright. It used to take
                  24, i.e. four such falls, which no castle here ever
                  delivers, which is why stone simply never broke.
         6 units  175.
       A 40 hp wood beam now also breaks ITSELF falling 4 units (62 self
       damage, was 15), and a 24 hp board breaks itself falling 3. Timber
       shattering when it comes down a long way is the point. */
    CRUSH_DMG_SCALE   : 32.0,
    KNOCK_SCALE       : 1.3,   // how much of a bolt's velocity goes to what it hits (was 0.75 — debris flies harder)

    /* ── Seam hit: a shot lands where two parts meet ──────────────────────
     * Independent of any ammo's own splashRadius — this is "the bolt is
     * physically touching the block right next to the one findHitBlock()
     * picked", not a blast. Applies to EVERY ammo, not just splash ones. See
     * js/game.js's applySeamHit(). */
    SEAM_RADIUS       : 0.55,
    /* First pass was 0.85 — playtesting found that against a WIDE merged
       wall run (much higher hp than any single cell, absorbing the hit right
       at its own edge, worst-case falloff) 0.85 alone did ~72% of its hp,
       which combined with this same session's bigger KNOCK_SCALE/lower
       damping reliably finished it off via the ensuing fall's own collapse
       damage — one flanking shot on a guard standing next to a wall could
       bring down the whole adjacent wall run practically for free. Confirmed
       in-browser (Cliffside Fort, guard Q): dropped to 0.45 so a seam hit
       meaningfully damages a neighbour without near-guaranteeing its death
       outright just for touching it. */
    SEAM_DMG_SCALE    : 0.45,

    /* ── Bolt linger: keeps acting on the world for a bit after its first
     * hit instead of vanishing. Still the deterministic step-and-trace style
     * traceShot() already uses, not a real Ammo.js body. See js/game.js's
     * updateShots(). */
    LINGER_MS         : 2000,
    LINGER_RESTITUTION: 0.45,  // fraction of speed kept after deflecting off a hit surface
    LINGER_DMG_DECAY  : 0.6,   // each successive linger hit does DECAY^n as much damage/knock

    /* ── Guard/Tyrant efficiency + combo scoring, see js/game.js's
     * destroyBlockRec()/fire()/updateShots(). First-pass numbers, tune by
     * feel like everything else here. */
    KEY_BUDGET          : 6,    // bolts; a key kill this early or earlier gets the full bonus
    KEY_BONUS_PER_BOLT  : 40,   // * bolts UNDER budget, per guard/tyrant kill
    COMBO_BONUS_PER_KILL: 200,  // * (key kills beyond the first) in the same shot

    /* ── Level geometry ───────────────────────────────────────────────────── */
    MUZZLE_Y        : 2.35,   // height the bolt leaves the ballista at
    GROUND_Y        : 0,

    /* ── Pacing ───────────────────────────────────────────────────────────── */
    SETTLE_MIN      : 0.55,   // hold after the last body sleeps
    SETTLE_MAX      : 9.0,    // safety net, in case something never sleeps
    WIN_PAUSE       : 1.9,    // beat on the wreckage before the results panel

    /* ── Cinematic framing ────────────────────────────────────────────────
     * The impact/settle camera sits on a ring around the point that was hit
     * (js/game.js's pickImpactSeat) — these say how far back and how high,
     * via cinematicSeat() below. Turn PULLBACK up to see more of the castle
     * and less of the individual block; it is the one number to reach for. */
    SEAT_RADIUS     : 4.5,    // distance from the impact point, at REFERENCE size
    SEAT_HEIGHT     : 2.4,    // how far above it, at REFERENCE size
    SEAT_PULLBACK   : 1.6,    // flat multiplier on both, every castle
    SEAT_REFERENCE  : 7,      // castle extent the two numbers above were tuned at
    SEAT_MAX_SCALE  : 2.2,    // ceiling, so a huge castle can't push the camera
                              // so far out that the wreckage turns into confetti
    /* How far the camera's aim slides off the point that was hit and toward
       the middle of the castle. 0 aims dead at the impact — right for a
       camera close enough that everything around the hit is masonry. 1 frames
       the castle itself, which is what a pulled-back camera is FOR: at 0.55
       the tower still sat against one edge with a third of the frame given to
       empty ground, because the aim point is what lands in the middle of the
       shot. The impact stays in frame regardless (it is inside the castle),
       still decides which side the camera watches from, and still has to be
       unobstructed from the seat — see game.js's pickImpactSeat. */
    SEAT_LOOK_BIAS  : 1.0
  };

  /* ── Ammunition ─────────────────────────────────────────────────────────
   * Each one is better at something rather than simply stronger, and — new in
   * the 3D version — each one carries its own TRAJECTORY. `lob: true` takes
   * the high solution of the ballistics equation instead of the low one, so
   * it drops onto a target from above rather than driving into its front
   * face. That folds the choice of elevation into a list that is already
   * scannable, instead of spending a third meter on it.
   *
   *   speed  muzzle velocity, units/s. FIXED — never touched by the meter.
   *   dmg    damage multiplier on impact. Also fixed.
   *   r      collision radius of the projectile.
   *   limit  max uses PER LEVEL (resets on loadLevel()/retryLevel()).
   *          Omitted (undefined) means unlimited — every ammo below except
   *          the bomb. See js/game.js's ammoLeft/ammoRemaining().
   *   splash, splashRadius, splashDmgScale — area damage on top of the
   *          direct hit, see js/game.js's applySplash(). Falls off linearly
   *          to zero at splashRadius; splashDmgScale scales the whole thing
   *          down relative to a direct hit so splash is a bonus, not a second
   *          direct hit for every neighbour.
   */
  const AMMO = [
    { id:'stone',    name:'Stone Bolt', sub:'Flat and true',   speed:23.0, dmg:1.00, r:0.22, lob:false, unlockAt:0 },
    /* speed bumped 21.5->24.5: at the old speed, boulder's own max range sat
       within ~10% of several levels' range window (even slightly UNDER it on
       the tightest, "The Siege Tower") — a shot charged near the top of the
       meter silently capped short of the requested distance, and its high
       arc (already collapsing toward 45 degrees as requested distance nears
       max range, see solveElevation's header) collapsed hardest exactly
       there. The new speed keeps ~20% of headroom over every level's window
       on the worst case, so the "lobs" arc stays a real arc across the whole
       meter instead of flattening out toward the far end of it. */
    { id:'boulder',  name:'Boulder',    sub:'Smashes, lands and rolls', speed:24.5, dmg:2.75, r:0.38, lob:true, unlockAt:0, splash:true, splashRadius:1.65, splashDmgScale:0.35, rollSeconds:6 },
    { id:'fire',     name:'Fire Bolt',  sub:'Ignites an area; burns over time', speed:24.0, dmg:1.00, r:0.20, lob:false, unlockAt:0 },
    { id:'splitter', name:'Splitter',   sub:'Lobs, splits in 3', speed:25.0, dmg:0.62, r:0.20, lob:true,  unlockAt:3 },   // same reach fix as boulder above
    /* speed bumped 19.0->21.0: at the old speed its own max range (28.0) fell
       half a unit SHORT of "The Cantilever" 's castle front (28.5) — the one
       level, of the six this unlocks for, where it's a genuine problem-tier
       auditAmmoOffers() failure (a scarce, one-per-level ammo that can't
       even reach the castle at all). The new speed clears every level's
       castle front with room to spare (and its back face too, on every
       level currently offering it) without chasing the full range meter the
       way boulder/splitter above do — it's meant to stay the shorter-reach,
       big-splash specialist of the two lob ammo, just no longer one that
       can whiff an entire castle. */
    { id:'bomb',     name:'Powder Bomb', sub:'Explodes on impact with a wide blast',
      speed:21.0, dmg:1.40, r:0.34, lob:true, unlockAt:4, limit:1, splash:true, splashRadius:3.2, splashDmgScale:0.6 }
  ];

  /* A powder keg's own death-explosion, fed through the same applySplash()
   * the Powder Bomb uses (js/game.js) rather than separate blast physics.
   * Not a real AMMO entry (never fired, never listed) — just enough of the
   * shape applySplash()/damageFor() expect: id (won't match either ammo-
   * specific damage bonus above, which is correct — a keg isn't a fire bolt
   * or a boulder), dmg/speed for damageFor()'s base and the outward kick,
   * splashRadius/splashDmgScale for the falloff. Deliberately more modest
   * than the bomb's own blast — this is a bonus chain-reaction, not a second
   * bomb hiding in every level. */
  const KEG_BLAST = { id:'keg', speed:18.0, dmg:1.4, splashRadius:3.2, splashDmgScale:1.0 };

  /* ── Materials ──────────────────────────────────────────────────────────
   * `family` is what ammo bonuses check (fire vs wood, boulder vs stone) and
   * is shared between a material and its small-rubble version, so a Fire Bolt
   * still triples damage on a small wood chunk.
   *
   * `mergeable` lets the level builder weld a run of the same letter into one
   * rigid body — along a row, and now also through consecutive depth layers,
   * so a wall is one slab rather than a stack of thin plates.
   *
   * `static` replaces the old `hp: Infinity` special case: steel is simply a
   * zero-mass Bullet body, which is both cheaper and less surprising.
   *
   * Colours are CSS custom-property names, read back through the palette so
   * all four colour profiles repaint the 3D world. Anything added here MUST
   * also appear in PALETTE_VARS (see game.js) or it silently comes out grey.
   *
   * `rubble` names the small material this one BREAKS INTO when it dies, so
   * a killed building block leaves real physics debris on the ground instead
   * of blinking out of existence — see game.js's spawnDebris(). Only ordinary
   * building materials carry it. Deliberately absent from:
   *   - glass (`I`), which shatters: nothing left to fall.
   *   - the powder keg (`T`), whose death IS its explosion.
   *   - the crown and guards, which are characters and targets, not masonry.
   *   - the small chunks below, which ARE the rubble — no `rubble` on them is
   *     what stops debris breaking into more debris forever.
   *   - steel (`X`), which is static and never dies anyway.
   */
  const MAT = {
    L:{id:'L',name:'Stone Bolt ammo crate',hp:10,css:'--crown',family:'wood',shape:'ammo-crate',pickup:'stone',rubble:'w'},
    D:{id:'D',name:'Fire Bolt ammo crate',hp:10,css:'--barrel',family:'wood',shape:'ammo-crate',pickup:'fire',rubble:'w'},
    Y:{id:'Y',name:'Splitter ammo crate',hp:10,css:'--glass',family:'wood',shape:'ammo-crate',pickup:'splitter',rubble:'w'},
    Z:{id:'Z',name:'Powder Bomb ammo crate',hp:10,css:'--steel',family:'wood',shape:'ammo-crate',pickup:'bomb',rubble:'w'},
    A:{id:'A',name:'princess',hp:1,css:'--glass',princess:true,protected:true,shape:'princess',fallDmgMult:1},
    v:{id:'v',name:'villager to protect',hp:1,css:'--glass',protected:true,shape:'friendly',fallDmgMult:1},
    f:{id:'f',name:'fisher to protect',hp:1,css:'--glass',protected:true,shape:'friendly',fallDmgMult:1},
    h:{id:'h',name:'healer to protect',hp:1,css:'--glass',protected:true,shape:'friendly',fallDmgMult:1},
    m:{id:'m',name:'merchant to protect',hp:1,css:'--glass',protected:true,shape:'friendly',fallDmgMult:1},
    N:{id:'N',name:'prison bars',hp:30,css:'--wood',family:'wood',prison:true,shape:'prison',rubble:'w'},
    M:{id:'M',name:'terracotta brick',hp:65,css:'--barrel',family:'stone',mergeable:true,rubble:'s'},
    C:{id:'C',name:'mossy cobblestone',hp:110,css:'--guard',family:'stone',mergeable:true,rubble:'s'},
    P:{id:'P',name:'plaster wall',hp:30,css:'--stone',family:'stone',mergeable:true,rubble:'s'},
    O:{id:'O',name:'oak beam',hp:65,css:'--wood',family:'wood',mergeable:true,rubble:'w'},
    R:{id:'R',name:'slate roof',hp:30,css:'--steel',family:'wood',mergeable:true,shape:'roof',rubble:'w'},
    E:{id:'E',name:'round stone column',hp:85,css:'--stone',family:'stone',shape:'column',rubble:'s'},
    V:{id:'V',name:'clear crystal',hp:16,css:'--glass',family:'glass',glass:true,shape:'crystal'},
    U:{id:'U',name:'supply crate',hp:25,css:'--wood',family:'wood',shape:'crate',rubble:'w'},
    J:{id:'J',name:'jester imp',hp:12,css:'--barrel',guard:true,shape:'jester',fallDmgMult:1},
    F:{id:'F',name:'frost goblin',hp:12,css:'--glass',guard:true,shape:'frost',fallDmgMult:1},
    W:{ id:'W', name:'wood beam',         hp: 40,  css:'--wood',   family:'wood',  mergeable:true, rubble:'w' },
    S:{ id:'S', name:'stone block',       hp: 90,  css:'--stone',  family:'stone', mergeable:true, rubble:'s' },
    I:{ id:'I', name:'clear glass window',        hp: 12,  css:'--glass',  family:'glass', mergeable:true, glass:true },
    /* `shape` gives a material its own silhouette instead of the default box.
       Only ever set on non-mergeable materials — a run of those is always a
       single cell, so a shaped mesh can never be asked to stretch across a
       merged wall (see js/art.js's blockGeometry). Two things the player must
       tell apart have to differ in SHAPE, not just colour. A material that
       only needs a different PROPORTION (a thin board vs a full cube) does
       NOT need `shape` — the plain `new THREE.BoxGeometry(w,h,d)` fallthrough
       already stretches to whatever w/h/d js/levels.js hands it, so `B` below
       stays mergeable with a plain box, never `shape:'board'`. */
    T:{ id:'T', name:'powder keg',        hp: 20,  css:'--barrel', explodes:true, shape:'barrel' },
    /* fallDmgMult: the crown model is a person (the tyrant), not a slab of
       stone — a fall that only chips a stone block should kill him. Scales
       ONLY the impact/crush damage he takes (see js/game.js's
       stepPhysicsWithImpacts/applyCrush), not IMPACT_THRESHOLD itself, so
       what counts as "a real fall" — and every other material's collapse
       survivability, already covered by auditLevels()'s standing-castle
       check — stays exactly as tuned.
       Re-tuned 2026-08-31: the crown never has to be directly hittable, only
       destroyable (direct hit, collateral splash, or a fall) — but the OLD
       hp:25/3x pairing made "fall" a razor's edge rather than a real option:
       a full castle-layer's worth of drop (~3 units, ~9.16 units/s of lost
       speed at this file's GRAVITY) did (9.16-7.5)*5*3 = 24.9 damage against
       25 hp — under by a hair, not "reliably lethal" at all, just lucky
       every time it got checked. hp:15/5x instead needs only a ~2.3-unit
       drop to cross 15, with real margin at a full layer (41.6 vs 15), AND
       gives every direct-hit ammo comfortable headroom too (previously
       Splitter's 21.08 direct-hit damage was actually UNDER 25 hp — it
       could not one-shot a crown at all; now well over 15). This also means
       a near-miss splash (bomb/keg) or ordinary collateral jostle from a
       neighbour's death is a far more reliable second/third path to a kill,
       not just a slightly-more-possible one — the intent the whole time,
       per this file's own header design rule. Re-verified: auditLevels()
       still passes clean across every level. */
    /* 5.0 -> 1.25 on 2026-09-11. NOT a decision about how fragile a crown is
       - that is unchanged. IMPACT_DMG_SCALE/CRUSH_DMG_SCALE rose 4x so that
       collapses break masonry (see their note in CFG above), and damage is
       `bracket * SCALE * fallDmgMult`, so cutting this by the same 4x leaves
       the product - the only thing the formula uses - exactly where the
       paragraph below tuned it. Every number in that paragraph still holds,
       including the ~2.3-unit lethal drop; re-verified 3/3 trials on every
       designed kill route in the game after the change. If a playtest wants
       the tyrant genuinely easier to squash, THIS is the knob (raise it) -
       not the two scales, which also govern every wall in the game. */
    K:{ id:'K', name:'crowned rascal',             hp: 12,  css:'--crown',  crown:true, shape:'crown', fallDmgMult: 1.25 },
    /* Guards: real, placed, destructible targets (not the decorative
       guardDecor/guardDecor2 standing beside the ballista, js/game.js) —
       reuse the same two baked models those already use. Same "a person, not
       a slab" fallDmgMult reasoning as the crown, just a touch less fragile
       to a stray fall since a guard isn't the win condition. Two letters
       (not one + a random-variant pick) so a level author can deliberately
       choose a pose per placement, same as any other material choice. */
    /* 4.0 -> 1.0, the same 4x cut as the crown above and for the same reason -
       the scales rose 4x, so a guard takes exactly the damage from a fall
       that he always did. Left explicit at 1.0 rather than deleted (it is
       also the `|| 1` default) so the pairing with the crown stays visible:
       these two numbers only mean anything relative to the two scales. */
    Q:{ id:'Q', name:'moss goblin',     hp: 12,  css:'--guard',  guard:true, shape:'guard-spear',   fallDmgMult: 1.0  },
    H:{ id:'H', name:'pumpkin knight',   hp: 12,  css:'--guard',  guard:true, shape:'guard-halberd', fallDmgMult: 1.0  },
    X:{ id:'X', name:'steel girder',      hp: Infinity, css:'--steel', mergeable:true, static:true },
    /* `plank` is read only by js/levels.js's parser (matches the existing
       small/static/glass/explodes pattern) — it thins the block to
       PLANK_FRAC of a cell and sits it flush on its own row's floor instead
       of filling the cell, for ceilings/floors/bridges. See js/levels.js and
       the board authoring rule in README.md.

       `weld` is what makes those spans structural: two touching bodies of a
       welding material bond into one assembly (js/levels.js's weldPairs(),
       realised as real Bullet constraints by js/physics.js's addWeld()), so a
       run of boards carries load across the joint the way nailed timber does
       — otherwise a span that turns a corner has nothing under the corner and
       drops out on load. Deliberately NOT the same idea as `mergeable`: a
       merge fuses cells into ONE body with one hp, which only works for a
       straight run of a single box; a weld joins SEPARATE bodies that each
       keep their own hp, so a struck board still breaks on its own and frees
       its neighbours to tumble. Set on `B` alone: boards are the only
       material whose job is to span open air between supports. */
    B:{ id:'B', name:'timber board',      hp: 24,  css:'--wood',   family:'wood',  mergeable:true, plank:true, weld:true, rubble:'w' },
    w:{ id:'w', name:'small wood chunk',  hp: 14,  css:'--wood',   family:'wood',  small:true },
    s:{ id:'s', name:'small stone chunk', hp: 30,  css:'--stone',  family:'stone', small:true },
    i:{ id:'i', name:'small glass shard', hp: 5,   css:'--glass',  family:'glass', small:true, glass:true }
  };

  /* ── Ballistics ─────────────────────────────────────────────────────────
   * Given a muzzle speed and a target distance, what elevation lands there?
   *
   * The target sits `h` BELOW the muzzle (the ground), so the flat-ground
   * formula would be wrong by a little at every range. The exact solution for
   * hitting a point (d, -h) relative to the launch point is:
   *
   *   tan(phi) = ( v^2 +/- sqrt( v^4 - g*(g*d^2 - 2*h*v^2) ) ) / (g*d)
   *
   * The minus root is the flat, direct shot; the plus root is the lob. Both
   * land in the same place by different paths, which is the whole tactical
   * point of the ammunition list.
   *
   * Returns null when the range is genuinely out of reach, so callers have to
   * deal with it rather than silently firing at NaN degrees. This includes the
   * direct-fire (non-lob) root going negative: a flat shot fired dead level
   * from muzzle height already lands at minRange() below, so nothing closer
   * than that is reachable without pointing the ballista downward, which we
   * don't do. Flooring that case to phi=0 used to fire anyway and land at
   * minRange() regardless of the requested distance — silently desyncing the
   * shot from the range meter. Returning null instead makes that an honest
   * "can't reach this with this ammo", same as the too-far case.
   */
  function solveElevation(speed, dist, lob, height) {
    const g = CFG.GRAVITY;
    const h = height === undefined ? CFG.MUZZLE_Y : height;
    const d = dist;
    if (!(d > 0) || !(speed > 0)) return null;

    const v2 = speed * speed;
    const disc = v2 * v2 - g * (g * d * d - 2 * h * v2);
    if (disc < 0) return null;                 // out of reach at this speed

    const root = Math.sqrt(disc);
    const tan = ((lob ? v2 + root : v2 - root)) / (g * d);
    const phi = Math.atan(tan);
    if (!isFinite(phi) || phi < 0) return null;
    return phi;
  }

  /** The furthest this speed can reach at all, from muzzle height to ground. */
  function maxRange(speed, height) {
    const g = CFG.GRAVITY;
    const h = height === undefined ? CFG.MUZZLE_Y : height;
    const v2 = speed * speed;
    return Math.sqrt(v2 * v2 + 2 * g * h * v2) / g;
  }

  /**
   * The nearest a dead-level direct shot can land — a flat trajectory fired at
   * phi=0 still carries forward this far before gravity brings it down from
   * muzzle height. Only meaningful for non-lob ammo; a lob shot can drop
   * almost straight down, so it has no comparable floor.
   */
  function minRange(speed, height) {
    const g = CFG.GRAVITY;
    const h = height === undefined ? CFG.MUZZLE_Y : height;
    return speed * Math.sqrt(2 * h / g);
  }

  /**
   * Where a shot actually ends up, integrated rather than solved, so this can
   * be compared against solveElevation() as a check on the algebra. Used by
   * the audit, not by the game loop.
   */
  function flatRangeOf(speed, phi, height) {
    const g = CFG.GRAVITY;
    const h = height === undefined ? CFG.MUZZLE_Y : height;
    const vy = speed * Math.sin(phi);
    const vh = speed * Math.cos(phi);
    // Time to fall from h with initial upward vy: solve h + vy*t - g/2 t^2 = 0
    const t = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
    return vh * t;
  }

  /* ── Per-level meter windows ────────────────────────────────────────────
   * Both meters are scaled to the castle in front of the player rather than
   * being fixed, which is what stops either one having dead travel at an end.
   * The README's old "check a part-charged shot can still reach the near face"
   * authoring rule is satisfied by construction now.
   */
  function castleBounds(level) {
    const cols = level._cols || 1;
    const deep = level._depth || 1;
    return {
      halfWidth: cols / 2,
      near: level.dist - deep / 2,     // downrange distance to the front face
      far : level.dist + deep / 2,
      centre: level.dist
    };
  }

  /**
   * How far back and how high the impact/settle camera should sit for THIS
   * castle — see CFG.SEAT_* above.
   *
   * A single fixed distance can't work now that a castle's size varies as
   * much as it does: 4.5 units back was framed for the early single-layer
   * castles (~7 cells across), and pointed at a 13-row tower it fills the
   * screen with one board and shows nothing of what that board just fell
   * off. So the distance scales with the castle's largest authored extent —
   * width, height, or depth, whichever dominates — around the size the
   * original numbers were tuned at, and never scales BELOW it (a small
   * castle keeps the framing it already had, it does not get pushed closer).
   *
   * Deliberately the castle's AUTHORED size rather than the live bounding box
   * of what's left standing: a shrinking box would zoom the camera in further
   * with every shot, so the same castle would be framed differently on bolt 1
   * and bolt 5, and the last shot of a level — the one worth watching — would
   * be the tightest of all.
   */
  function cinematicSeat(level) {
    /* _extent is the castle's real occupied size (js/levels.js), NOT its grid
       dimensions — a level that keeps blank margin around its castle must not
       be framed as though that margin were masonry. */
    const extent = level._extent || (level._cols || 1);
    const scale = Math.min(CFG.SEAT_MAX_SCALE, Math.max(1, extent / CFG.SEAT_REFERENCE));
    const k = scale * CFG.SEAT_PULLBACK;
    return { radius: CFG.SEAT_RADIUS * k, height: CFG.SEAT_HEIGHT * k, scale: scale };
  }

  /** Furthest of every non-lob ammo's minRange() — the closest distance ANY
   *  unlocked ammo can be relied on to hit. Lob ammo has no such floor, so
   *  only flat ammo constrains this. */
  function flatMinReach() {
    let worst = 0;
    for (const a of AMMO) {
      if (a.lob) continue;
      worst = Math.max(worst, minRange(a.speed));
    }
    return worst;
  }

  function rangeWindow(level) {
    const b = castleBounds(level);
    const min = Math.max(3, b.near - CFG.RANGE_PAD_NEAR, flatMinReach());
    return {
      min: min,
      max: Math.max(min, b.far + CFG.RANGE_PAD_FAR)
    };
  }

  /** Half-angle of the lateral sweep, in radians. */
  function yawLimit(level) {
    const b = castleBounds(level);
    const reach = b.halfWidth + CFG.YAW_PAD_CELLS;
    const deg = Math.max(CFG.YAW_MIN_HALF_DEG,
                         Math.atan2(reach, Math.max(1, b.centre)) * 180 / Math.PI)
                + CFG.YAW_EXTRA_DEG;
    return deg * Math.PI / 180;
  }

  /**
   * Can each of these ammo physically reach this castle at all? Pure
   * arithmetic against maxRange()/minRange() and castleBounds()/
   * rangeWindow() — no physics, no sampling, order-independent, instant.
   * This is the deterministic replacement for the removed auditReach(): it
   * does NOT ask whether a crown is solvable (a level is free to need a
   * sequence of shots — see js/game.js's header), only whether the ammo a
   * level actually offers can cross the distance to it. That is the one
   * authoring bug the old audit genuinely caught (a castle placed beyond an
   * ammo's own physical max range — see commit 64b1aca) and the one thing
   * pure maths can prove outright.
   *
   * `ammoList` is a list of AMMO entries, not ids — every caller already has
   * them (js/game.js's availableAmmo()/availableAmmoAt(), or the editor's own
   * doc.ammo selection), and this file must not know about save state or
   * per-level narrowing.
   */
  function ammoReachReport(level, ammoList) {
    const bounds = castleBounds(level);
    const window = rangeWindow(level);
    const problems = [], warnings = [], notes = [];
    const entries = ammoList.map((a) => {
      const mr = maxRange(a.speed);
      const reachesFront = mr >= bounds.near;
      const reachesBack = mr >= bounds.far;
      const coversMeterTop = mr >= window.max;
      const flatMin = a.lob ? 0 : minRange(a.speed);
      const overshootsCastle = !a.lob && flatMin > bounds.far;
      const entry = {
        id: a.id, name: a.name, lob: !!a.lob, splash: !!a.splash,
        maxRange: mr, minRange: flatMin,
        reachesFront: reachesFront, reachesBack: reachesBack,
        coversMeterTop: coversMeterTop, overshootsCastle: overshootsCastle
      };
      if (!reachesFront) problems.push(a.name + ' cannot reach this castle at all (max range ' + mr.toFixed(1) + ', castle front at ' + bounds.near.toFixed(1) + ')');
      if (overshootsCastle) problems.push(a.name + ' cannot land short of ' + flatMin.toFixed(1) + ', which overshoots the whole castle (far face at ' + bounds.far.toFixed(1) + ')');
      if (!reachesBack) notes.push(a.name + ' cannot reach the castle\'s back face — fine for a single-layer level, a real limitation for a deep one');
      if (!coversMeterTop) notes.push(a.name + ' cannot reach the top of the range meter — every shot past a point on the meter silently maxes out at its own true range');
      return entry;
    });
    if (ammoList.length && entries.every((e) => !e.reachesFront)) {
      problems.push('no offered ammo can reach this castle at all');
    } else if (ammoList.some((a) => a.splash) && !entries.some((e) => e.splash && e.reachesFront)) {
      warnings.push('splash-capable ammo is offered but none of it can reach — fine if the level does not rely on splash, worth a second look if it does');
    }
    return { name: level.name, bounds: bounds, window: window, entries: entries, problems: problems, warnings: warnings, notes: notes };
  }

  /** Meter percentage -> downrange distance, and back. */
  function pctToRange(level, pct) {
    const w = rangeWindow(level);
    return w.min + (U.clamp(pct, 0, 100) / 100) * (w.max - w.min);
  }
  function rangeToPct(level, dist) {
    const w = rangeWindow(level);
    const span = w.max - w.min;
    return span <= 0 ? 0 : U.clamp((dist - w.min) / span * 100, 0, 100);
  }

  /**
   * Select-target aim mode's whole solver: given a block's world x/z, what
   * yaw and range meter reading points the ballista straight at it? The
   * muzzle sits at the world origin (see launchFor() above), so this is
   * just the inverse of the polar coordinates the sweep/charge meters
   * already work in — `withinYaw` tells the caller whether the sweep could
   * physically reach that far around without the yaw meter clamping it.
   */
  function solveTarget(level, x, z) {
    const yawRad = Math.atan2(x, -z);
    const dist = Math.sqrt(x * x + z * z);
    return { yawRad: yawRad, dist: dist, rangePct: rangeToPct(level, dist),
             withinYaw: Math.abs(yawRad) <= yawLimit(level) };
  }

  /**
   * Full launch state for a shot. `yaw` is radians, + to the player's right.
   * Returns null if the requested range is unreachable, which the caller must
   * handle — though rangeWindow() is built so it never should be.
   *
   * That invariant only held for the NEAR end (rangeWindow.min already backs
   * off for flatMinReach()) — the far end had no equivalent check, so any
   * ammo whose own maxRange() falls short of rangeWindow.max (the Powder
   * Bomb, on literally every level: its 19-speed maxRange is ~28 units, and
   * every level's window stretches at least a little past that) went from
   * "fires and lands somewhere" to a true, silent dud somewhere in roughly
   * the top quarter to half of its own charge meter — the exact mirror image
   * of the "no undercharged dud" rule this file's header describes, just
   * never symmetrically enforced. Clamping the DISTANCE fed to
   * solveElevation (not rangeWindow itself, which every ammo shares — moving
   * the window would tighten the near-castle-reaching padding for every
   * OTHER ammo too, a much bigger behaviour change than this bug needs) means
   * an overcharged shot still fires, landing at this ammo's own true limit
   * instead of nowhere. 0.05 keeps solveElevation's discriminant strictly
   * positive right at that ceiling.
   */
  function launchFor(ammo, level, yaw, rangePct) {
    const requested = pctToRange(level, rangePct);
    const dist = Math.min(requested, maxRange(ammo.speed) - 0.05);
    const phi = solveElevation(ammo.speed, dist, ammo.lob);
    if (phi === null) return null;
    const vh = ammo.speed * Math.cos(phi);
    return {
      ammo: ammo,
      dist: dist,
      yaw: yaw,
      elevation: phi,
      pos: { x: 0, y: CFG.MUZZLE_Y, z: 0 },
      vel: {
        x: vh * Math.sin(yaw),
        y: ammo.speed * Math.sin(phi),
        z: -vh * Math.cos(yaw)
      }
    };
  }

  /**
   * Damage a bolt does to a block. Deliberately takes NO velocity or meter
   * value — this is the "always powerful enough" rule expressed as code. The
   * audit asserts the result is identical at every range.
   */
  function damageFor(ammo, mat) {
    let d = 34 * ammo.dmg;
    if (ammo.id === 'fire') d *= .32; // Most fire damage arrives gradually from the burning area.
    if (ammo.id === 'boulder' && mat.family === 'stone') d *= 1.6;
    return d;
  }

  return {
    CFG, AMMO, MAT, KEG_BLAST,
    solveElevation, maxRange, minRange, flatRangeOf,
    castleBounds, cinematicSeat, rangeWindow, yawLimit, ammoReachReport,
    pctToRange, rangeToPct, launchFor, damageFor, solveTarget
  };
})();
