# Benny's FishMaster II — Build Spec

Implementation spec. The design doc (`switchedgames-fishmaster2-design-doc.md`)
explains *why* and is optional reading.

> **Status: BUILT AND SHIPPED.** This started as a spec to build from and is now
> a description of a game that exists. Where the two disagreed, the code won and
> this document was corrected to match (reconciled 2026-08-29). Sections marked
> **‡** record a deliberate departure from the original plan — those are settled
> decisions, not bugs, and should not be "fixed" back.
>
> **`js/data.js` is authoritative** for the mission ladder, rods, bait and shop
> stock. This file describes their *shape and rules*; it no longer duplicates the
> tables, because duplicating them is what let this document drift in the first
> place.

**It shipped in place of FishMaster I**, in the folder `BENNYSFISHMASTER/`. The
2D canvas game that used to live there — its pond, `lakegen.js` and README — is
gone from `main`. Its **art and reveal cards were carried over verbatim** and are
still what the game uses: fish, junk, valuables, rods, bait, card backgrounds and
the Dingus photo.

**Built from:**
- `../BENNYSRACETRACKS/` — the engine. Three.js, papercraft art kit, scan engine,
  switch input, level ladder, renderer. **Do not modify it**; Race Tracks stays
  playable.
- FishMaster I — the content, taken from git history now that the folder itself
  has been replaced.

---

## 1. What you are building

A fishing game for players with one switch. The boat drives itself along a track
across a lake. Fish zones come past on the left and the right. The player pulls
over at a zone, then chooses to cast or keep going. Landing a fish is one hold
gesture with an ease-off prompt.

**Thirty-one missions ‡** (thirty ordinary, plus a hidden finale), each with one
target species or a weight to land.

**Money is real and gear is priced ‡** — the original plan had no shop and
nothing to spend on. What has not changed is the rule underneath it: **money
never blocks progress.** A job is handed in the moment the fish are caught, whether
or not its gear was bought, and gear only ever shifts the odds. See §8.4.

**The player's entire input is three gestures on one key (Return):**

| Gesture | On the track | On a card | On a hooked fish |
|---|---|---|---|
| press | flip which side is armed | select the highlighted row | hook it |
| hold | pull over to the armed side | — | reel |
| nothing | let the zone go past | let auto-scan cycle | fish waits |

Doing nothing is safe in every context.

**Nothing in play may require a SHORT press.** Hooking a fish and casting both
happen on the way DOWN, the instant the switch closes, and a switch held for a
minute does exactly what one held for a second does. A gesture that only counts
under 400 ms is a gesture this game's players cannot make.

---

## 2. Ground rules — do not break these

1. **Nothing can fail.** No hearts, no damage, no timers, no timeouts, no game
   over, no "too slow", no losing a fish through inaction. A player who never
   presses anything must be able to sit in any state forever.
2. **No countdowns are ever displayed.** Forgiveness is built into level geometry
   (a zone is long), never into a clock the player can see.
3. **Every cue is delivered four ways at once:** spoken, tone (stereo-panned for
   anything with a left/right meaning), large on-screen text/arrow, screen-edge
   colour glow. A player using only one of those channels can play the game.
4. **Colour is never the only signal.** Green/amber zone rings must also differ in
   shape and be named in words.
5. **All settings come from the hub.** Use `NarbeScanManager` and
   `NarbeVoiceManager` for scan speed, auto-scan, sensitivity, TTS and voice. Do
   not add duplicate options.
6. **Everything runs offline.** No CDN, no `fetch()`. Three.js is vendored. The
   only asset files are the catch-card PNGs.
7. **Timed things advance from the frame loop's `dt`, never from `setTimeout` or
   `setInterval`.** Pausing must freeze the bite wait, the reel, and the track.

---

## 3. Files

```
BENNYSFISHMASTER/          the folder FishMaster I used to occupy
  index.html      shell, all overlays, HUD, all CSS
  images/         FishMaster I's images, carried over verbatim
  js/three.min.js copied verbatim from ../BENNYSRACETRACKS/js/
  js/util.js      copied verbatim from ../BENNYSRACETRACKS/js/
  js/main.js      copied verbatim from ../BENNYSRACETRACKS/js/
  js/audio.js     from RACETRACKS, add water/motor/reel/bite sounds
  js/art.js       from RACETRACKS, add boat, dock, rod, water, zone rings
  js/world.js     from RACETRACKS, adapt: water track instead of road
  js/ui.js        from RACETRACKS, add edge panels, HUD, new overlays
  js/data.js      from FISHMASTER, changes in §4
  js/game.js      NEW — written from scratch, see §5–§9
```

FishMaster I's `README.md` is gone; this file replaces it.

Load order in `index.html`: `three.min.js`, `util.js`, `audio.js`, `art.js`,
`world.js`, `data.js`, `game.js`, `ui.js`, `main.js`.

FishMaster I's `lakegen.js` is **not** copied. The only thing needed from it is
one constant, which moves into `data.js` (§4).

---

## 4. `js/data.js`

Built from FishMaster I's `data.js`. `BIOMES`, `FISH`, `ITEM_TABLE` and
`ITEM_QUIPS` carried over unchanged. What differs from FishMaster I:

- `RODS` replaced (§4.1) and `LAKE_TEMPLATES` collapsed to one `LAKE` (§4.2).
- `BIOME_RING` added (§4.2b), `MISSIONS` added (§4.3).
- **`BAIT` expanded to eleven entries ‡** — ten ordinary lures plus Vitamin T.
  Bait is the frequent half of the upgrade curve: a rod arrives about every
  eight missions, a new lure every two or three, so the tacklebox keeps changing
  even while the rod does not. Each lure biases species actually reachable when
  it is handed over. The ladder is
  `plainworm → nightcrawler → waxworm → bobberrig → jitterbug → minnowlure →
  spinnerbait → leechrig → stinkbait → deepjig → secret_t_pill`.
- **`SHOP_STOCK` added ‡** — the tackle shop's four lines of comfort gear
  (§8.4). None of it is required to finish the game.
- **`RODS` and `BAIT` each gained a `look` field ‡** — a shape and two colours,
  used to build the rod and the lure on the hook from primitives in 3D. Only
  the secret bait has real artwork, so everything else is described rather than
  drawn.

### 4.1 Replace `RODS`

The old `reachFt` values were derived against three lakes of different sizes and
do not work on one lake (75/500 = 0.15, which is inside no depth band — the
starter rod would reach nothing). Replace the array and delete the old derivation
comment block entirely.

```js
// Reach is no longer player-controlled — it decides which RINGS of the lake are
// open at which mission. One lake at LAKE.maxRadiusFt = 500, band edges at
// BAND_FRAC .28/.52/.78/1.0, one rod per ring:
//   reachFrac = reachFt / 500
//   starter    175/500 = .35  -> near + mid
//   castmaster 325/500 = .65  -> + far
//   longshot   425/500 = .85  -> + deep
//   titanium   500/500 = 1.00 -> whole lake
// All values are multiples of 25 ft. `cost` is what the counter charges when
// the rod is handed over (§8.4) — it is not flavour, but it never blocks a job.
const RODS = [
  { id:'starter',    name:'Starter Rod',     cost:0,    reachFt:175, reachNote:'Casts up to 175 feet.', description:"Comes standard. Nothing wrong with it, exactly." },
  { id:'castmaster', name:'CastMaster 3000', cost:150,  reachFt:325, reachNote:'Casts up to 325 feet.', description:"A stiffer blank and a longer cast." },
  { id:'longshot',   name:'Longshot Pro',    cost:500,  reachFt:425, reachNote:'Casts up to 425 feet.', description:"Built to reach water the CastMaster can only look at." },
  { id:'titanium',   name:'Titanium Ace',    cost:1400, reachFt:500, reachNote:'Casts up to 500 feet.', description:"The last rod you'll need. After this, it's the lake that's the limit." }
];
```

`unlockLakeId` is removed from `RODS`. Nothing reads it. As shipped each rod also
carries a `look` (§4), which the block above omits for readability.

### 4.2 Replace `LAKE_TEMPLATES` with one `LAKE`

```js
const BAND_FRAC = { near:0.28, mid:0.52, far:0.78, deep:1.0 };  // was lakegen.js

const LAKE = {
  id: 'thelake', name: 'The Lake',
  maxRadiusFt: 500,
  // Every biome exists in the lake. Which ones the TRACK runs through is set
  // per mission (see MISSIONS.biomes), not here.
  biomeIds: ['shallows','weedbed','rockyshore','dropoff','deepchannel']
};
```

Delete `objectivePool`, `objectiveCount` and `unlocks` — `MISSIONS` replaces all
three.

### 4.2b Add `BIOME_RING` — which ring each biome sits in

This is what makes the reach assert (§6.2 step 3) computable, and it is what ties
each rod to the water it opens.

```js
// Which depth ring each biome occupies. Ring -> the rod that first reaches it:
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
```

A biome is fishable when `rod.reachFt / LAKE.maxRadiusFt >= BAND_FRAC[ring]` is
**not** the test to use — the bands are *upper* edges, so the test is:

```js
function biomeFishable(biomeId, rodId) {
  const ring = BIOME_RING[biomeId];
  const reachFrac = RODS.find(r => r.id === rodId).reachFt / LAKE.maxRadiusFt;
  // a rod reaches a ring if its reach extends past that ring's inner edge
  const inner = { near: 0, mid: BAND_FRAC.near, far: BAND_FRAC.mid, deep: BAND_FRAC.far }[ring];
  return reachFrac > inner;
}
```

Which gives, per rod:

| Rod | reachFrac | Fishable biomes |
|---|---|---|
| starter | .35 | shallows, weedbed |
| castmaster | .65 | + rockyshore, dropoff |
| longshot | .85 | + deepchannel |
| titanium | 1.00 | all five, and deep zones sit further out |

Every mission in `MISSIONS` (§4.3) is consistent with this table — check it if you
change either one.

### 4.3 `MISSIONS` — the whole difficulty curve

**Thirty-one entries ‡**, played in order. The original plan was ten plus a
hidden eleventh; it shipped as thirty plus a hidden thirty-first, because ten
missions did not give the bait ladder room to breathe and reached the last rod
far too quickly.

**The exact table lives in `js/data.js` and is authoritative.** What follows is
its shape and the rules it must keep.

Per entry: `rodId` is what the player holds *during* that mission; `baitId` is
what is on the hook; `biomes` is which biomes zones may be drawn from; `target`
is the job; `text` is the one-line brief. Optional: `grantsRodId` /
`grantsBaitId` (handed over **after** that mission is turned in), plus
`hidden`, `allGreen`, `finale` and `revealsSecret`.

**The rod ladder.** One rod per ring of the lake, each held for a long stretch:

| Rod | Missions | Handed over after |
|---|---|---|
| Starter Rod | 1–8 | — (held from the start) |
| CastMaster 3000 | 9–16 | mission 8 |
| Longshot Pro | 17–24 | mission 16 |
| Titanium Ace | 25–30 | mission 24 |
| Titanium Ace + Vitamin T | 31 (hidden finale) | mission 30 |

**The bait ladder** runs underneath it, a new lure every two or three missions,
handed over after missions 1, 3, 5, 7, 9, 12, 15, 17, 20 and 30 (§4).

**Three target types ‡**, not two:

| `target.type` | Means | Example |
|---|---|---|
| `catchCount` | *n* of one species | *"Catch 3 Sunfish"* |
| `catchLength` | one of a species at or over *n* inches | *"Catch a Walleye 24 inches or longer"* |
| `catchWeight` | *n* lbs of **any** fish in one trip | *"Land 30 lbs of fish in one trip"* |

`catchWeight` has no `speciesId`. It is the ladder's pressure valve: it cannot
be blocked by one uncooperative species, and it makes a trip full of bycatch
count for something.

**Invariants, asserted at boot (§14, test 8):** a mission's target species must live
in one of its own `biomes`, and every biome listed must be inside `rodId`'s
reach. `RT.game.__test.auditMissions()` walks all thirty-one and checks both.

Mission 31 is **hidden until mission 30 is turned in** — it must not appear in
the ladder, the save UI, or any "missions remaining" count before then. The gate
is `save.highestMission > 30`. Turning in mission 30 sets `revealsSecret` and
hands over Vitamin T, which is the entire unlock (§8.3b).

**Every one of the fifteen species is a target at some point ‡** — including
carp, rock bass, burbot and gar, which the original plan had written off as
bycatch only. Thirty missions turned out to be room enough for all of them.

### 4.4 `unlockLakeId` on `FISH` and `BAIT` becomes dead

Leave the fields in place. **Nothing may read them** — mission number is the only
gate now. A species is catchable when a mission's `biomes` include a biome it
lives in.

### 4.5 Export

```js
return { BIOMES, FISH, RODS, BAIT, SHOP_STOCK, ITEM_TABLE, ITEM_QUIPS,
         LAKE, BAND_FRAC, BIOME_RING, RING_INNER, biomeFishable, MISSIONS };
```

`SHOP_STOCK`, `RING_INNER` and the `biomeFishable` helper are exported too ‡.

---

## 5. Controls — exact bindings

### 5.1 On the track

**Two switches (hub Auto Scan OFF):**

| Key | Action |
|---|---|
| Space | pull over to the **left** zone (ignored if no zone on the left) |
| Return | pull over to the **right** zone (ignored if no zone on the right) |

**One switch (hub Auto Scan ON) — this is Ben's rig and the acceptance case:**

| Input | Action |
|---|---|
| Return, tap (`< 400 ms`) | arm the *other* side. Nothing commits. |
| Return, hold released between `400 ms` and `5000 ms` | pull over to the armed side |
| Return, held past `5000 ms` | open the pause menu; cancel the pull-over |
| nothing | zone goes past |

The pull-over **commits on release**, not at 400 ms. This is what lets the
pull-over and the 5-second pause hold share one key with no mode switch. The
pause discovery ring still appears at 2000 ms and doubles as the signal that this
hold is no longer a pull-over.

Holding when the armed side has no zone does nothing (play a soft "nothing there"
thud on release; do not steer the boat).

### 5.2 The two edge panels

Always visible while on the track. They are the entire driving HUD.

| State | Rendering |
|---|---|
| no zone this side | dark, empty |
| zone holding the **target species** | **green** fill, biome name, doubled outline + arch glyph |
| zone with other fish | **amber** fill, biome name, single plain ring glyph |
| armed side | thick ink outline + inward arrow, on top of whichever of the above applies |

Flipping the armed side speaks the new side and what is on it (*"left — weed bed,
pike"*) and plays a panned tone: low in the left ear for left, high in the right
ear for right. Same tone vocabulary as every other direction cue.

### 5.3 On any card

Standard hub scan list. `Space` steps, hold `Space` steps backward, `Return`
selects, auto-scan cycles the highlight when enabled. No card has more than three
rows.

### 5.4 Reeling

`Return` held = reeling. See §7.3.

### 5.5 Pause

`Return` held 5000 ms (`PAUSE_HOLD_MS`, ring at 2000 ms), `Escape`, or the
on-screen Pause button (bottom-left, outside the scan order).

Menu: **Continue / Restart Mission / Main Menu / Help.**

Two things copied from Race Tracks that are not optional:
- open with `startIndex: -1` (nothing focused)
- swallow the triggering switch's key-repeat **and** its release

Without both, the release that triggered the pause lands on the menu and
instantly picks the first row.

**The 5-second pause hold is disabled while a fish is hooked.** Holding Return is
how you reel, and a tier-5 fish takes 40+ seconds. `Escape` and the Pause button
still work during a fight.

---

## 6. The track and the zones

### 6.1 Geometry and speed

Reuse Race Tracks' `world.js` track generation. The road ribbon becomes a water
ribbon; curves and hills become the route bending around points and swelling
gently. Keep `terrainRise()` and `bankOffset()`.

All of these live in `CFG` in `game.js`. **The names and several values changed
in the build ‡** — the table below is what shipped.

| `CFG` constant | Value | Notes |
|---|---|---|
| `BOAT_SPEED` | `17` units/s | Race Tracks' cars run 26–46. A boat trolls. Constant — never varies by mission. |
| `SPOT_WINDOW` | `260` units | ≈ **15 s** alongside. This is the whole pull-over window. |
| `SPOT_GAP_MIN` / `MAX` | `840`–`1200` units, seeded | ≈ **49–71 s** between spots |
| `SPOT_RADIUS` | `17` units | the spot's own size |
| `LANE_HALF` | `46` units | half the lane; with `STEER_SPEED` `26` it is ≈1.8 s from centre to edge |
| `CUE_LEAD` | `20` **units**, not seconds | ≈1.2 s of warning; fixed, never tightens by mission |
| `STOP_TIME` / `RUN_UP_TIME` / `ARRIVE_MAX` | `1.1` / `0.45` / `1.5` s | ease across, motor to idle, come to rest |
| `SPOT_COOLOFF` | `4` fish | a spot cools off after four (§8.1) |
| track length | endless | regenerate chunks ahead; the track never runs out |

**The long ride between spots is deliberate ‡.** Roughly a minute of open water
between fishing spots reads as slow on paper; it is the intended pace, and the
ride is part of the experience rather than dead time. Do not "fix" it by raising
`BOAT_SPEED` or shrinking `SPOT_GAP_*`.

A "pull-over" is **continuous steering, not a discrete command**: holding steers
laterally at `STEER_SPEED`, and it takes ≈1.8 s just to cross from the centre
line to the lane edge. A hold shorter than that looks exactly like a dead
control — worth knowing when scripting tests.

The track has no finish line. A mission ends when its target is caught (§8.3).

### 6.2 Generating a zone

For each zone slot, seeded on `U.hash('m' + missionN + ':spot' + index)` — the
whole slot is deterministic in `(mission, index, sinceTarget)`:

1. Pick a `biome` from the current mission's `biomes` array.
2. Pick a `side`: left or right.
3. Read its `ring` from `BIOME_RING[biome]` (§4.2b) and assert
   `biomeFishable(biome, mission.rodId)`. **Every zone offered must be
   fishable** — there are no out-of-reach zones in this game, because the player
   cannot hurry an upgrade along. Place the zone's ring at that radius so the
   water visibly gets deeper further out.
4. Classify: `isTarget = biome is one of the target species' biomeIds`.
   - `isTarget` → **green** ring
   - otherwise → **amber** ring

### 6.3 Pairing

**`PAIR_CHANCE` = 0.55 ‡** — about **55%** of zone slots place a zone on *both*
sides at once. On a mixed mission a pair is **never two greens** — that is a
choice with no content — so a pair is either green+amber or amber+amber.

**Exception — all-target missions ‡.** The rule is skipped whenever
`isAllTarget(m)` is true, which is broader than originally planned:

```js
function isAllTarget(m) { return !!m.allGreen || otherBiomes(m).length === 0; }
```

That is `mission.allGreen` (the hidden finale, where the Dingus lives in all five
biomes) **or any mission whose target species lives in every biome that mission
draws from** — the second case was not anticipated when this was written. It
catches **9 of the 31 missions**, where both sides are always green and the
left/right choice therefore carries no difference.

This is accepted, not a defect. Those missions are early-ladder ones where the
job is simply "catch some of the fish that lives here", and offering a wrong
side would be inventing a mistake for the player to make. The acceptance test in
§14 is scoped to mixed missions accordingly.

Across any rolling window of three zone slots, **at least one green zone must
appear.** Enforce this with a counter, not by luck: if two slots pass with no
green, force the next one green. This is what makes "hold out for better water" a
strategy rather than a gamble. Verified in the shipped build — the longest
target-less run across 1000 slots per mission is 1.

### 6.4 Announcing a zone

At `CUE_LEAD` before the zone comes alongside, all four channels fire:

- spoken: *"Weed bed on the right. Good for pike."* (biome name + the species it
  favours; append *"— your target"* when green)
- panned tone: low in the left ear for a left zone, high in the right for right
- on-screen: large arrow + the biome name
- screen-edge glow on that side, in the zone's colour

The edge panels (§5.2) update at the same moment and stay updated until the zone
is behind the boat.

### 6.5 Missing a zone

A zone the boat passes is **re-seeded further up the track**. Zones keep coming
forever. The player can never be stranded on empty water and can never run out
of chances.

### 6.6 No hazards

Race Tracks' obstacle system is reused for **scenery only** — lily pads, buoys,
deadheads, other boats. Collision is a soft nudge, a wake sound, and nothing
else. No damage, no slowdown that matters, no state change.

---

## 7. Fishing

Pulling over fades to fishing over `0.8` s.

**Camera:** over the angler's shoulder, inside the boat, looking out over the
bow. Boat static, bobbing gently. Rod in frame on the right with a live bending
tip. Line out to a bobber ~15 units ahead. The shore and its landmarks stay
visible behind — the player should be able to see which part of the lake they are
in.

### 7.1 The zone card

A two-row scan list, shown on arrival and again after every catch:

```
  WEED BED
  Good for: Northern Pike, Muskie
  Your target: Northern Pike  ✓

  ▸ Cast
  ▸ Keep trolling
```

- Line 1: biome name.
- Line 2: species that biome favours, from `FISH[].biomeIds`.
- Line 3: the mission target, with `✓` if it lives here, `✗` if it does not.
- **Pre-focus `Cast` when the zone is green, `Keep trolling` when it is amber.**
  One press does the sensible thing; a second press is a deliberate override.

`Keep trolling` eases the boat back onto the track. No cost, no comment.

### 7.2 The bite

The cast is automatic and has no direction or power. Then:

1. Wait `BITE_WAIT_MIN`–`BITE_WAIT_MAX` = **`3`–`7` s ‡** (seeded). Ambient only
   — water, a loon, the boat rocking. Nothing is asked of the player.
2. Roll the bite using FishMaster I's existing `rollBite()` /
   `biteWeightedFishPool()`, restricted to the zone's biome, with the mission's
   auto-equipped bait applied through its `biasTable`. **This is where a wrong
   zone costs the player: the target species is simply weighted lower or absent
   in that biome's pool. No new mechanic.**
3. Roll junk/valuable independently, exactly as FishMaster I does, before the
   fight starts.
4. Announce on four channels: spoken *"Fish on!"*, a rising two-note **centred**
   (not panned — there is no direction here) tone, the bobber going under with
   the rod tip bending, a large **HOOK IT — PRESS** prompt, and a screen-edge
   glow breathing once every `TEASE_EVERY` = `2.2` s.

The breathing wash is a lamp on a dimmer, not a strobe. Its brightness at any
moment carries **no** information and **no** deadline. Under
`prefers-reduced-motion` it holds at a steady level instead of breathing.

**Press Return to hook** — on the way *down*, never a tap (§1). If the player
does nothing for `HOOK_MIN`–`HOOK_MAX` = **`7`–`12` s ‡** (seeded), the fish
spits the hook — *"Missed it — it spat the hook. Bait's still on."* — and a new
bite starts in `REBITE_MIN`–`REBITE_MAX` = `3`–`5` s. Repeat forever. Nothing is
lost, ever.

A **Bite Alarm** from the shop (§8.4) lengthens this window rather than
shortening it: `hookMin`/`hookMax` take the *larger* of the base and the alarm's
value, up to `19`–`27` s at the top tier.

### 7.3 The reel — the model

Two values, one input.

```
tension   0..1     where the line is right now
progress  0..1     how much line is in
```

Each frame:

```js
tension += (holding ? riseRate : -fallRate) * dt;
tension  = clamp(tension, 0, 1);

// safe band centre drifts; the fish also surges
bandCentre = 0.5 + driftAmp * sin(2π * driftHz * t) + surge(t);
bandLo = bandCentre - bandWidth/2;
bandHi = bandCentre + bandWidth/2;

inBand = tension >= bandLo && tension <= bandHi;
progress += (inBand ? 1.0 : OUT_OF_BAND_RATE) * (1 / lineSeconds) * dt;

if (inBand) timeInBand += dt;
totalTime += dt;
```

with `OUT_OF_BAND_RATE = 0.35`.

Per species `difficultyTier` (an existing field in `FISH` — it used to set
Red/Blue sequence length):

| tier | `bandWidth` | `driftAmp` | `driftHz` | `lineSeconds` | `riseRate` | `fallRate` | plays like |
|---|---|---|---|---|---|---|---|
| 2 | 0.42 | 0.06 | 0.05 | 5 | 0.55 | 0.75 | sunfish — hold and you're done |
| 3 | 0.34 | 0.10 | 0.08 | 8 | 0.55 | 0.75 | bass — one or two ease-offs |
| 4 | 0.26 | 0.15 | 0.12 | 12 | 0.60 | 0.80 | pike — a real back-and-forth |
| 5 | 0.18 | 0.22 | 0.18 | 16 | 0.65 | 0.85 | sturgeon — an event |

`surge(t)` is a seeded occasional pull: for tiers 4–5 only, every `4`–`7` s, shift
`bandCentre` by `±0.15` over `0.6` s and hold for `1.5` s. Announce it before it
lands (*"she's running!"*) so it is never a gotcha.

### 7.4 The reel — feedback

Three states, each on all four channels:

| State | Bar + rim | Prompt | Spoken | Sound |
|---|---|---|---|---|
| in band | **green** | `REELING — KEEP GOING` | — | steady reel clicking |
| tension above band | **red** | `LET GO` | *"Ease off!"* | line creaking |
| tension below band | **amber** | `PRESS AND HOLD` | *"Reel!"* | reel free-spooling |

Speak a state change once, on entry. Do not repeat it on a loop.

### 7.5 The reel cannot fail

- Out-of-band time never loses the fish and never ends the fight. It slows
  progress to 35% and costs quality.
- **Holding Return from start to finish always lands the fish.** It takes about
  `lineSeconds / 0.35` ≈ 2.9× as long and yields near-zero quality, i.e. the
  smallest fish of its species. Tier 5 that way is ~46 s. That is correct.
- Never pressing at all leaves the fish on the line indefinitely, with the game
  repeating *"press and hold to reel it in"* every few seconds.
- `progress` reaching 1.0 is the only end condition.

### 7.6 Quality

```js
quality = clamp(timeInBand / totalTime, 0, 1);
```

Feed `quality` into FishMaster I's existing `rollFishCatch()` as the percentile
into the species' `lengthRange` and `weightRange`. Unchanged from FishMaster I.

| quality | result |
|---|---|
| 75–100% | Excellent — top of the range |
| 50–74% | Good |
| 25–49% | Fair |
| 0–24% | Poor — still the real fish, bottom of the range |

**Quality never loses the fish.** FishMaster I's README is self-contradictory here
(it lists "1–24% Poor — still the real fish" and "Below 25% the fish gets away" as
overlapping rows). This game resolves it in favour of never failing: the only way
a fish does not land is the independent junk/valuable roll at bite time (§7.2
step 3), which is FishMaster I's existing `demoted` outcome and is unrelated to
how the player reeled.

**Tune against this specific case:** hold-Return-forever must land every fish, and
must always land it in the 0–24% Poor band. If it comes in at 40%, widen the
bands or lower `OUT_OF_BAND_RATE`.

---

## 8. Catch, mission, progression

### 8.1 The catch card

Reuse FishMaster I's `catchreveal` overlay as-is: full art, then length / weight /
quality for a fish, a value and a quip for a valuable, a quip alone for junk.
Typewriter face (`Special Elite`, via the `panel-catch` class on `#panel`), the
player's Plaque or Certificate background (`CARD_STYLES`), High Contrast handling
intact.

Art paths are unchanged: `images/fish/<id>.png`, `images/items/<id>.png`,
`images/rods/<id>.png` and `-icon.png`, `images/bait/secret_t_pill.png`,
`images/cardbg/{plaque,certificate}.png`. All of them exist. Keep
`CATCH_PLACEHOLDER_EMOJI` as the fallback.

If this catch advances or completes the mission target, add a line saying so.

Dismissing the card returns to the zone card (§7.1) with:
- **`Cast again` pre-focused** if the zone is still holding fish
- **`Keep trolling` pre-focused** after `4` fish from this zone, with the card
  reading *"they've moved on"*

### 8.2 Tracking the target

| `target.type` | Counts when |
|---|---|
| `catchCount` with `speciesId` | a fish of that species lands |
| `catchCount` without `speciesId` | any fish lands |
| `catchLength` | a fish of that species lands at `length >= amount` |
| `catchWeight` | cumulative weight of all fish landed reaches `amount` |

A demoted catch (§7.2) does not count. HUD shows progress as `Northern Pike 1 / 2`.

### 8.3 End of mission

When the target completes:

1. Finish the current catch card.
2. **Results card** — fish caught this trip, money earned, mission ticked off.
   The boat keeps moving under the card rather than freeze-framing; Race Tracks
   does this on a win and it reads much warmer than a still image.
3. If the mission has `grantsRodId`, show FishMaster I's `rodreveal` overlay with
   the new rod's full art, `reachNote` and `description`, framed as earned:
   *"That's a good haul. Enough for a real rod."*
4. If the next mission opens a biome not in this one's `biomes`, announce it:
   *"the channel's open to you now."*
5. Return to the dock with the next mission ready.

### 8.3b Mission 30 and mission 31

*(Originally specified as missions 10 and 11; the ladder grew to 31 ‡ — see §4.3.
The beats are unchanged, only the numbers.)*

**Mission 30 (two sturgeon) is not the end.** Its results card is a big one — the
biggest fish in the lake — and it ends by revealing that there is one more. The
entry carries `grantsBaitId:'secret_t_pill'` and `revealsSecret:true`:

> *"That's every fish in this lake. Every fish anyone's ever caught here, anyway.
> There's a rumour about one more."*

Then hand over the **Vitamin T** bait with a reveal card in the `rodreveal`
overlay's style, using `images/bait/secret_t_pill.png` and its absurd $5000 price
as the joke it was always meant to be. Mission 31 is now visible and ready.

**Mission 31 (the Dingus)** is the finale:

- FishMaster I's **`dingusreveal` overlay pre-empts the ordinary catch card** for
  this catch. It is the one deliberately ceremonial catch in the game and it keeps
  its ceremony. Art is `images/fish/largemouth_dingus.png`.
- Then the **"you beat the whole game"** finale screen.
- Its stats are deliberately anticlimactic — 12 inches, 5 lbs exactly, worth $0,
  `difficultyTier` 3, so the fight is an easy one. **Do not "improve" any of
  this.** The joke is that the hardest fish to find is a completely ordinary fish,
  and the ceremony is carrying the moment, not the mechanics.

A `finale: true` mission gets the distinct "you beat the whole game" screen
instead of the ordinary results card.

### 8.4 Money

Money accrues from the catch (`baseValuePerWeight × weight`, plus valuables'
`value`) and is banked automatically at the end of a trip. It is shown in the HUD
and on the results card because *"you earned this"* is the point of the upgrade.

**No money threshold ever gates progression** — but gear itself is priced ‡, so
be precise about where the line falls.

`MISSIONS[].grantsRodId` / `.grantsBaitId` name the gear offered at the counter
when that mission is turned in, and `takeGrant()` charges `grant.cost` for it
(bait at a discount off `costPerUnit`). Being short means you simply do not take
it yet — the dock reads *"Next job needs Nightcrawler — $36 (need $36 more)"*.

**What matters is that turning the job in does not require it:**

```js
canTurnIn: done,                                   // the fish is the job
canTakeGrant: !!grant && affordable && !grantTaken // money and the shelf, separately
```

This was deliberately loosened during the build. Requiring the gear first
"turned a receipt into a requirement and left people who had done the hard part
being told no". A player who never buys anything keeps fishing with `bestRod()`
— the best rod they own, not the one the mission names — which changes the odds
(`rodHolds`) and never blocks a mission.

**The tackle shop ‡** sells the rest: `SHOP_STOCK` is four lines of comfort gear,
three tiers each, on the shelf every visit. The original plan had nothing to buy
at all, which left eighteen of the thirty-one missions with no use for money and
a late game where one sturgeon paid more than everything in the game cost put
together. **None of it is needed to finish** — every item makes the fishing
*kinder*, which is the right sort of thing to sell to somebody playing on one
switch.

| Line | What it does | `effect` keys |
|---|---|---|
| Fish Finder | more warning, longer to steer in, fewer empty hooks | `window`, `lead`, `junk` |
| Line | longer before a run parts the line | `snap` |
| Bite Alarm | the fish stays on the hook longer before it spits (§7.2) | `hookMin`, `hookMax` |
| Cooler | the shop pays more for what is in the hold | `sell` |

Prices climb about 4× a tier so the top tiers still mean something once sturgeon
money is coming in. `effect` is read by `game.js` — **none of these numbers are
flavour.**

### 8.5 The dock

Between missions the player sits on the dock: boat tied up, shack standing there,
lake behind. It is where the mission card is read and where a rod upgrade is
handed over. Settings and Exit live on the title screen and the pause menu.

**The dock is a scan world with four stops ‡**, not a single button — the shack
became a real tackle shop (§8.4) rather than scenery:

| Stop | Goes to |
|---|---|
| Mission note | the brief card |
| Tackle shop | inside the shack — gear and the keeper list |
| Take the boat out | starts the trip |
| Main menu | the title screen |

It is driven by the same scan rules as any card: with Auto Scan **on**, the
highlight cycles and one press picks; with it **off**, Space steps forward, held
Space steps backward, and Return picks (§5.3).

### 8.6 Saves

Save key is **`fishmaster` ‡** (not the `bennysfishmaster2` planned here) at
`SAVE_VERSION` **2**. Since this build replaced FishMaster I *in place*, it
inherits its predecessor's save key — so **the version check is what does the
migrating**: `loadSave()` keeps a stored save only when
`raw.version === SAVE_VERSION`, and anything older falls back to
`defaultSave()`. A FishMaster I save is therefore discarded rather than
misread, which is the intent the original "new save key" line was reaching for.

Within version 2, new fields are added by `Object.assign(defaultSave(), raw)`,
so adding one does **not** need a version bump.

Saved: `currentMission`, `highestMission`, `progressValue`, `grantTaken`,
`hold`, `money`, `lifetimeEarned`, `gear`, `rods`, `baits`, `completed`,
`creel`, `best`, plus the `cardStyle` / `theme` / `cueLevel` preferences.

**Gear is saved ‡**, contrary to the original "do not save gear, derive it from
mission number". Once rods and lures became things you own and buy (§8.4), the
mission number stopped being able to describe them — a player may be on mission
12 still holding the starter rod. `rods` and `baits` are owned lists, and
`loadSave()` repairs an empty or missing one by granting the current mission's
rod and bait, so nobody is ever demoted by an update.

Missions are fixed and repeatable, seeded on `hash('mission:' + n)`, the way Race
Tracks seeds its levels. Lake geometry is never saved, only its seed.

---

## 9. Overlays

Every one is an ordinary hub scan card. None has more than three rows.

| Overlay | Rows |
|---|---|
| `title` | Play Game / Settings / Exit Game |
| `settings` | colour profile, High Contrast, Direction Help, Catch Card Style |
| `mission` | mission text, then Start |
| `zone` | Cast / Keep trolling |
| `catchreveal` | (from FishMaster I) dismiss |
| `rodreveal` | (from FishMaster I) dismiss |
| `results` | Continue |
| `finale` | Continue |
| `pause` | Continue / Restart Mission / Main Menu / Help |

**Auto-scan rule (from Race Tracks, no new plumbing):** scanning is live exactly
when an overlay is visible. Overlay hidden — driving, waiting for a bite, reeling
— means auto-scan never starts and the switch belongs to the game. The pause menu
opens the overlay, so scanning resumes by itself.

---

## 10. Art

### 10.1 Style

Papercraft / diorama, identical to Race Tracks: chunky flat-shaded primitives over
the shared procedural paper-fibre texture, warm saturated palette, ink outlines on
everything the player must react to. UI is warm cream card stock, sticky-tape
corners, thick ink borders, and a focus state that is unmistakable (fill +
outline + lift + scale).

**Everything in the 3D world is generated at runtime. No asset files.** The only
images in the game are the catch-card PNGs copied from FishMaster I.

New meshes to add to `art.js`: **boat**, **dock + shack**, **rod / line /
bobber**, **zone ring + fish-finder arch**, **water**.

**Water:** layered flat planes, a scrolling paper-grain wash, two or three
sine-driven vertex ripples, ink outline at the shoreline. No reflections, no
transparency stack. Race Tracks' Deep Space map already establishes that a surface
here can be suggested rather than simulated.

### 10.2 Accessibility

- Biome and zone colours are **theme CSS variables read at draw time**. Any new
  variable the 3D layer reads **must also be listed in `PALETTE_VARS`**, or
  `css()` silently returns grey.
- **High Contrast** is a profile, not a skin: solid fills, heavy outlines, no
  gradients or texture. It suppresses the catch-card background photos and keeps
  the catch art's grayscale+contrast filter.
- `prefers-reduced-motion`: no water shimmer, bite ripples become two still rings,
  the bite wash holds at a steady brightness.
- **Zone rings differ in shape as well as colour** — target rings get the
  fish-finder arch and a doubled outline, non-target rings a single plain ring —
  so green/amber survives with no colour at all.
- **Direction Help (Settings): On / Visual / Off.** On speaks and tones; Visual
  keeps the arrows, edge panels and zone rings but drops the voice; Off drops the
  tones too. **Off must not hide the zone rings.** In Race Tracks, hiding the
  green gates made a hard mode; here the rings are the only way to know what a
  zone holds, so hiding them would make the game unplayable rather than harder.

---

## 11. Performance

Targets low-powered hardware — a Surface Pro was visibly sluggish before Race
Tracks' optimisation pass. The scene is **draw-call bound, not vertex bound**:
200k triangles is nothing, thousands of small meshes are fatal, and the shadow
pass submits them all again.

Keep all three of Race Tracks' wins:

1. **Batch static scenery** with `mergeScenery()`, per material per 420-unit chunk
   of track. This took a race from 3904 draw calls to ~390. Chunking rather than
   whole-level merging keeps frustum culling useful.
2. **Distance-cull** zones, rings and scenery past `620` units, where the fog has
   already swallowed them.
3. **Adaptive resolution** — start at pixel ratio `1.25`, measure frame rate, step
   down (disabling shadows at the floor) or up. A Surface Pro reports
   `devicePixelRatio` 2 on integrated graphics; rendering natively costs 4× the
   pixels for no visible gain at this art style.

`RT.perf()` returns live draw-call / triangle / pixel-ratio counts. Check it after
any change that adds objects to the scene.

---

## 12. Traps

Things that will silently break. Each one already bit one of the two source games.

1. **Meshes face −Z.** The boat's Y rotation is `frame.yaw` (= −heading), never
   `frame.heading`. Backwards looks fine at the dock and turns the boat sideways
   as the track curves. Use `debugAlignment()` (should report 0°) rather than
   eyeballing it — a chase camera hides small yaw errors.
2. **Anything flat on the water must follow the banking.** Place zone rings via
   `world.pointAt` and roll them by `-frame.bank`, or their outer edge sinks
   through the surface wherever the route banks.
3. **Ground height is one function used twice.** `terrainRise()` + `bankOffset()`
   define the surface, and both the water ribbon and scenery placement must use
   them, or props hover and sink.
4. **The pause menu must open with `startIndex: -1` and swallow the triggering
   switch's repeat *and* release.** Miss either and the release that opened the
   menu instantly selects the first row. This made Race Tracks' pause menu
   unusable until it was fixed.
5. **The 5-second pause hold must be off while a fish is hooked.** Holding is
   reeling. A tier-5 fish will exceed 5 s every single time.
6. **New CSS colour variables read by the 3D layer must be in `PALETTE_VARS`** or
   `css()` returns grey with no error.
7. **`#panel`'s `background` shorthand is an ID selector** and beats same-property
   class rules regardless of source order. FishMaster I's card-background CSS is
   all `#panel`-prefixed for this reason. Keep it that way.
8. **Never advance the bite wait, reel, or track from `setTimeout`/`setInterval`.**
   Use the frame loop's `dt` so pausing actually freezes them.
9. **Do not read `unlockLakeId`** anywhere. It is a dead field (§4.4); reading it
   will appear to work and then gate the wrong species.
10. **Every zone must be inside the current rod's reach.** Assert it at generation
    time, not just in tests.

---

## 13. Build order

Each phase ends in something runnable. Do not start the next until the checkpoint
passes.

**Phase 1 — shell.** Copy the files in §3. Get a black window with Race Tracks'
title screen, scan engine and switch input working, wired to the hub's managers.
*Checkpoint: Return alone navigates the title screen with auto-scan on.*

**Phase 2 — water and boat.** Water plane, papercraft boat, chase camera, the
track from `world.js` with the boat driving itself at `BOAT_SPEED`. No zones.
*Checkpoint: the boat drives a curving lake forever at a steady frame rate;
`RT.perf()` shows a few hundred draw calls, not thousands.*

**Phase 3 — zones and pull-over.** Zone generation (§6.2–6.3), edge panels, the
four-channel cue, tap-to-flip / hold-to-commit (§5.1), the pull-over manoeuvre.
Fishing mode is a stub that just returns to the track.
*Checkpoint: the gesture-boundary test in §14 passes. This is the riskiest phase
— get it right before building anything on top of it.*

**Phase 4 — fishing.** Camera, rod rig, the zone card, the bite, the reel model
(§7.3–7.5). Catch resolution stubbed to a plain text readout.
*Checkpoint: hold-Return-forever lands every tier and always scores 0–24%.*

**Phase 5 — cards and data.** Port `data.js` (§4), FishMaster I's `catchreveal`
and `rodreveal` overlays, the `images/` tree.
*Checkpoint: a real fish with real art and a real quality score.*

**Phase 6 — missions and progression.** The ladder, the dock, mission/results/
finale cards, automatic gear, saves.
*Checkpoint: mission 1 → mission 2 with a rod handover, surviving a reload.*

**Phase 7 — polish and audit.** All of §14. Accessibility profiles, reduced
motion, High Contrast, Direction Help. Register in `games.json`.

---

## 14. Acceptance tests

Drive the real game in Electron with synthetic switch events and screenshot, the
way Race Tracks was tested.

**Must pass before this ships:**

Much of this runs far faster **in-page than in real time**: the rules are pure
functions over seeds, reachable through `RT.game.__test` (`generateSpot`,
`rollBite`, `biteWeightedFishPool`, `auditMissions`, …). Tests 7, 8 and 9 in
particular are loops in `browser_evaluate`, not hours of driving a boat. Only
*feel* — pacing, readability, whether a gesture is comfortable — needs real play.

1. **One-switch playthrough.** A bot that only ever presses `Return` — tapping to
   flip, holding to commit — completes all thirty-one missions, including the
   hidden one. This is Ben's rig. If this fails, nothing else matters.
   Remember a commit is *continuous steering* (§6.1): hold well past 1.8 s or the
   boat never reaches the zone and the control looks dead.
2. **Gesture boundaries.** On the track, holds of `0.3 / 0.5 / 2.0 / 4.9 / 5.1` s
   produce: nothing / pull-over / pull-over / pull-over / pause-menu-and-no-
   pull-over.
3. **Never-press bot.** Nothing anywhere ends, fails, or times out. It must sit on
   the dock forever, sit on the track with zones cycling past forever, and sit on
   a hooked fish forever.
4. **Hold-forever bot.** Every reel tier lands, and every fish scores 0–24%.
5. **Green-only bot.** Pulls over at green zones only, never amber: completes
   every mission on many seeds. If it stalls, a green zone is too rare or a target
   is not actually catchable at its mission.
6. **Amber-only bot.** Deliberately fishes the wrong water all game: still
   progresses, slowly, and never deadlocks. This is the real test of "a wrong zone
   is less likely, not punished".
7. **Green-density audit.** Over 1000 zone slots per mission, no window of three
   consecutive slots lacks a green. **On mixed missions only**, no pair is two
   greens — the 9 missions where `isAllTarget()` holds are exempt by design
   (§6.3), so scope the assertion or it fails on a correct build.
   *Last run: longest target-less streak across all 31 missions was 1.*
8. **Reach audit.** Walk all thirty-one missions: no mission may generate a zone
   outside its `rodId`'s `reachFrac`, and every mission's target species must live
   in one of that mission's `biomes`. Asserted at boot, and exposed as
   `RT.game.__test.auditMissions()`. *Last run: passes.*
9. **Dingus gating.** Across missions 1–30, the Largemouth Dingus must **never**
   appear in a bite pool, on any seed, in any biome, on any bait. On mission 31 it
   must be reliably catchable. Also confirm mission 31 is absent from every screen
   until mission 30 is turned in (`save.highestMission > 30`).
   *Last run: zero leaks across all mission/biome/bait combinations; 92–95% of the
   pool in every biome on the finale.*
   Note the probe shape — `biteWeightedFishPool()` returns `{f, w}` wrappers, so
   read `x.f.id`. Reading `x.id` yields undefined everywhere and looks exactly
   like perfect gating.
10. **Draw calls.** Under 600 while driving, on every mission.
11. **Profiles.** Play a full mission in each of the four colour profiles and in
    High Contrast, and with `prefers-reduced-motion` forced on. Nothing grey,
    nothing invisible, no strobing.

## 15. `games.json`

No `fetch()` of local JSON or WASM anywhere, so `needsServer` is **false** —
unlike `BENNYSBALLISTA` and `TRIVIAMASTER`. Add a thumbnail at
`images/games/<name>.png` beside `bennysfishmaster.png` and `bennysracetrack.png`.

## 16. Decisions made in this spec

Locked in so the build is not blocked. Each is cheap to change; the location is
given.

Updated to what shipped. **‡ marks a decision the build changed.**

| Decision | Where to change it |
|---|---|
| The dock is a four-stop scan world with a working tackle shop ‡ | §8.5 |
| A trip ends when the mission target is caught; the track has no finish line | §6.1, §8.3 |
| Thirty-one missions (31 hidden), rods handed over after 8 / 16 / 24 ‡ | `MISSIONS`, §4.3 |
| One target species per mission — or a weight, with no species ‡ | `MISSIONS[].target`, §4.3 |
| Zone cools off after 4 fish (`SPOT_COOLOFF`) | §8.1 |
| Bite wait 3–7 s ‡; hook window 7–12 s ‡ | §7.2 |
| ~55% of slots are pairs ‡; a green at least every 3 slots | §6.3 |
| Nine missions are all-green, so the pair rule is scoped to mixed ones ‡ | §6.3, §14.7 |
| Gear is priced and owned, and is saved rather than derived ‡ | §8.4, §8.6 |
| ~50–71 s of open water between spots — deliberately slow ‡ | §6.1 |
| Quality never loses the fish | §7.6 |
| Fishing camera is over-the-shoulder from inside the boat | §7 |
| The Largemouth Dingus is the last fish in the game — hidden mission 31 ‡ | `MISSIONS`, §4.3 and §8.3b |

## 17. Naming

**Settled ‡.** `BENNYSFISHMASTER2` was never used. The game shipped *in place of*
FishMaster I and inherited its identity throughout, so everything already agrees:

| | |
|---|---|
| folder | `BENNYSFISHMASTER/` |
| `games.json` id | `bennysfishmaster` |
| save key (§8.6) | `fishmaster` |
| thumbnail | `images/games/bennysfishmaster.png` |
| title | **Benny's FishMaster** — no "II" in anything player-facing |

The "II" survives only in this document's own heading, as the name of the
rebuild rather than of the game.

**Known stale ‡:** the `games.json` *description* still describes FishMaster I —
it mentions charging the cast, buying rods and *"three lakes"*, none of which
this game has. It is player-facing copy, so it is left for a deliberate rewrite
rather than changed in passing.
