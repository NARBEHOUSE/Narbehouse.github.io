# Benny's FishMaster II — Build Spec

Implementation spec. Everything needed to build the game is in this file; the
design doc (`switchedgames-fishmaster2-design-doc.md`) explains *why* and is
optional reading.

**Source folders you will copy from:**
- `../BENNYSRACETRACKS/` — the engine. Three.js, papercraft art kit, scan engine,
  switch input, level ladder, renderer.
- `../BENNYSFISHMASTER/` — the content. Fish data, catch/rod reveal cards, card
  artwork.

**Do not modify either source folder.** Both games stay playable.

---

## 1. What you are building

A fishing game for players with one switch. The boat drives itself along a track
across a lake. Fish zones come past on the left and the right. The player pulls
over at a zone, then chooses to cast or keep going. Landing a fish is one hold
gesture with an ease-off prompt.

Eleven missions, each with one target species. Rods and bait upgrade automatically
between missions — there is no shop and no money to spend.

**The player's entire input is three gestures on one key (Return):**

| Gesture | On the track | On a card | On a hooked fish |
|---|---|---|---|
| tap | flip which side is armed | select the highlighted row | hook it |
| hold | pull over to the armed side | — | reel |
| nothing | let the zone go past | let auto-scan cycle | fish waits |

Doing nothing is safe in every context.

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
BENNYSFISHMASTER2/
  index.html      shell, all overlays, HUD, all CSS
  images/         copied verbatim from ../BENNYSFISHMASTER/images/
  js/three.min.js copied verbatim from ../BENNYSRACETRACKS/js/
  js/util.js      copied verbatim from ../BENNYSRACETRACKS/js/
  js/main.js      copied verbatim from ../BENNYSRACETRACKS/js/
  js/audio.js     from RACETRACKS, add water/motor/reel/bite sounds
  js/art.js       from RACETRACKS, add boat, dock, rod, water, zone rings
  js/world.js     from RACETRACKS, adapt: water track instead of road
  js/ui.js        from RACETRACKS, add edge panels, HUD, new overlays
  js/data.js      from FISHMASTER, edits in §4
  js/game.js      NEW — written from scratch, see §5–§9
```

Load order in `index.html`: `three.min.js`, `util.js`, `audio.js`, `art.js`,
`world.js`, `data.js`, `game.js`, `ui.js`, `main.js`.

FishMaster I's `lakegen.js` is **not** copied. The only thing needed from it is
one constant, which moves into `data.js` (§4).

---

## 4. `js/data.js` — exact changes

Start from `../BENNYSFISHMASTER/js/data.js`. Keep `BIOMES`, `FISH`, `BAIT`,
`ITEM_TABLE` and `ITEM_QUIPS` exactly as they are. Make these four changes.

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
// All values are multiples of 25 ft. `cost` is flavour on the reveal card only;
// nothing is purchased in this game.
const RODS = [
  { id:'starter',    name:'Starter Rod',     cost:0,    reachFt:175, reachNote:'Casts up to 175 feet.', description:"Comes standard. Nothing wrong with it, exactly." },
  { id:'castmaster', name:'CastMaster 3000', cost:150,  reachFt:325, reachNote:'Casts up to 325 feet.', description:"A stiffer blank and a longer cast." },
  { id:'longshot',   name:'Longshot Pro',    cost:500,  reachFt:425, reachNote:'Casts up to 425 feet.', description:"Built to reach water the CastMaster can only look at." },
  { id:'titanium',   name:'Titanium Ace',    cost:1400, reachFt:500, reachNote:'Casts up to 500 feet.', description:"The last rod you'll need. After this, it's the lake that's the limit." }
];
```

`unlockLakeId` is removed from `RODS`. Nothing reads it.

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

### 4.3 Add `MISSIONS` — the whole difficulty curve

Ten entries, played in order. `rodId` is what the player holds *during* that
mission. `biomes` is which biomes zones may be drawn from. A mission's target
species must live in one of its own `biomes`, and every biome listed must be
inside `rodId`'s reach — both are asserted at boot (§10.2).

```js
const MISSIONS = [
  { n:1,  rodId:'starter',    baitId:'plainworm',
    biomes:['shallows','weedbed'],
    target:{ type:'catchCount', speciesId:'sunfish', amount:4 },
    text:'Catch 4 Sunfish' },

  { n:2,  rodId:'starter',    baitId:'nightcrawler',
    biomes:['shallows','weedbed'],
    target:{ type:'catchCount', speciesId:'bass', amount:3 },
    text:'Catch 3 Largemouth Bass',
    grantsRodId:'castmaster' },          // handed over AFTER this mission

  { n:3,  rodId:'castmaster', baitId:'nightcrawler',
    biomes:['shallows','weedbed','rockyshore'],
    target:{ type:'catchCount', speciesId:'crappie', amount:3 },
    text:'Catch 3 Black Crappie' },

  { n:4,  rodId:'castmaster', baitId:'spinnerbait',
    biomes:['weedbed','rockyshore','dropoff'],
    target:{ type:'catchCount', speciesId:'pike', amount:1 },
    text:'Catch a Northern Pike' },

  { n:5,  rodId:'castmaster', baitId:'minnowlure',
    biomes:['shallows','rockyshore','dropoff'],
    target:{ type:'catchCount', speciesId:'perch', amount:3 },
    text:'Catch 3 Yellow Perch',
    grantsRodId:'longshot' },

  { n:6,  rodId:'longshot',   baitId:'minnowlure',
    biomes:['rockyshore','dropoff','weedbed'],
    target:{ type:'catchCount', speciesId:'smallmouth', amount:3 },
    text:'Catch 3 Smallmouth Bass' },

  { n:7,  rodId:'longshot',   baitId:'minnowlure',
    biomes:['dropoff','rockyshore','deepchannel'],
    target:{ type:'catchLength', speciesId:'walleye', amount:24 },
    text:'Catch a Walleye 24 inches or longer' },

  { n:8,  rodId:'longshot',   baitId:'stinkbait',
    biomes:['dropoff','deepchannel','weedbed'],
    target:{ type:'catchCount', speciesId:'catfish', amount:2 },
    text:'Catch 2 Channel Catfish',
    grantsRodId:'titanium' },

  { n:9,  rodId:'titanium',   baitId:'spinnerbait',
    biomes:['weedbed','deepchannel','dropoff'],
    target:{ type:'catchCount', speciesId:'muskie', amount:2 },
    text:'Catch 2 Muskellunge' },

  { n:10, rodId:'titanium',   baitId:'stinkbait',
    biomes:['deepchannel','dropoff','rockyshore'],
    target:{ type:'catchCount', speciesId:'sturgeon', amount:1 },
    text:'Catch a Lake Sturgeon' },

  // ── The real last fish ────────────────────────────────────────────────────
  // Hidden until mission 10 clears. The Dingus is gated by BAIT, not by biome
  // or rod: FishMaster I's biteWeightedFishPool() only puts it in a pool when
  // 'secret_t_pill' (Vitamin T) is the equipped bait. Since bait is now set per
  // mission, setting baitId here IS the entire unlock — no new gating code.
  // It lives in all five biomes, so every zone on this mission is a target zone.
  { n:11, rodId:'titanium',   baitId:'secret_t_pill',
    biomes:['shallows','weedbed','rockyshore','dropoff','deepchannel'],
    target:{ type:'catchCount', speciesId:'largemouth_dingus', amount:1 },
    text:'Catch the Largemouth Dingus',
    hidden:true, allGreen:true, finale:true }
];
```

Mission 11 is **hidden until mission 10 is cleared** — it must not appear in the
ladder, the save UI, or any "missions remaining" count before then. Clearing
mission 10 reveals it.

Species never used as a target (carp, rock bass, burbot, gar) still appear as
bycatch and still sell. That is intended.

### 4.4 `unlockLakeId` on `FISH` and `BAIT` becomes dead

Leave the fields in place. **Nothing may read them** — mission number is the only
gate now. A species is catchable when a mission's `biomes` include a biome it
lives in.

### 4.5 Export

```js
return { BIOMES, FISH, RODS, BAIT, ITEM_TABLE, ITEM_QUIPS, LAKE, BAND_FRAC, BIOME_RING, MISSIONS };
```

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

| Constant | Value | Notes |
|---|---|---|
| `BOAT_SPEED` | `14` units/s | Race Tracks' cars run 26–46. A boat trolls. Constant — never varies by mission. |
| `ZONE_LENGTH` | `180` units | ≈ **12.9 s** alongside at `BOAT_SPEED`. This is the whole pull-over window. |
| `ZONE_GAP` | `250`–`450` units, seeded | ≈ 18–32 s between zones |
| `ZONE_OFFSET` | `26` units | how far off the centre line a zone sits |
| `CUE_LEAD` | `3.5` s | fixed; never tightens by mission |
| `PULLOVER_TIME` | `1.2` s | ease across, motor to idle, come to rest |
| `TRACK_LENGTH` | endless | regenerate chunks ahead; the track never runs out |

The track has no finish line. A mission ends when its target is caught (§8.3).

### 6.2 Generating a zone

For each zone slot, seeded on `hash('m' + missionN + ':z' + index)`:

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

About **45%** of zone slots place a zone on *both* sides at once. A pair is
**never two greens** — that is a choice with no content. A pair is either
green+amber or amber+amber.

**Exception — mission 11.** The Dingus lives in all five biomes, so every zone on
that mission is a target zone. When `mission.allGreen` is set, skip the
never-two-greens rule and render every zone green. The last mission is a victory
lap and is the one place the player cannot choose wrong.

Across any rolling window of three zone slots, **at least one green zone must
appear.** Enforce this with a counter, not by luck: if two slots pass with no
green, force the next one green. This is what makes "hold out for better water" a
strategy rather than a gamble.

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

1. Wait `4`–`12` s (seeded). Ambient only — water, a loon, the boat rocking.
   Nothing is asked of the player.
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
   glow breathing once every `2.4` s.

The breathing wash is a lamp on a dimmer, not a strobe. Its brightness at any
moment carries **no** information and **no** deadline. Under
`prefers-reduced-motion` it holds at a steady level instead of breathing.

**Tap Return to hook.** If the player does nothing for `6` s, the fish lets go —
*"it let go — bait's still on"* — and a new bite starts in `3`–`5` s. Repeat
forever. Nothing is lost, ever.

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

### 8.3b Mission 10 and mission 11

**Mission 10 (the sturgeon) is not the end.** Its results card is a big one — the
biggest fish in the lake — and it ends by revealing that there is one more:

> *"That's every fish in this lake. Every fish anyone's ever caught here, anyway.
> There's a rumour about one more."*

Then hand over the **Vitamin T** bait with a reveal card in the `rodreveal`
overlay's style, using `images/bait/secret_t_pill.png` and its absurd $5000 price
as the joke it was always meant to be. Mission 11 is now visible and ready.

**Mission 11 (the Dingus)** is the finale:

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

**Nothing is ever purchased and no money threshold gates anything.** Rod and bait
come from `MISSIONS[].rodId` / `.baitId` / `.grantsRodId`. Mission number is the
only gate — a money threshold could be missed by bad luck and would leave the
player holding a rod too short for the mission they were just given.

### 8.5 The dock

Between missions the player sits on the dock: boat tied up, shack standing there
as scenery, lake behind. **The boat is the only interactive thing. One press
launches.**

The dock is where the mission card is read and where a rod upgrade is handed over.
It is not a menu and has no shop. Settings and Exit live on the title screen and
the pause menu.

### 8.6 Saves

New save key (`bennysfishmaster2`), version 1. **No migration from FishMaster I** —
the structures do not correspond.

Save: `highestMission`, `currentMission`, `lifetimeMoney`, `creel`, and per-mission
best fish. **Do not save gear** — derive it from mission number, which removes a
whole class of desync bug.

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

1. **One-switch playthrough.** A bot that only ever presses `Return` — tapping to
   flip, holding to commit — completes all eleven missions, including the hidden
   one. This is Ben's rig. If this fails, nothing else matters.
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
   consecutive slots lacks a green, and no pair is two greens.
8. **Reach audit.** Walk all eleven missions: no mission may generate a zone outside
   its `rodId`'s `reachFrac`, and every mission's target species must live in one
   of that mission's `biomes`. Assert at boot, not just in tests.
9. **Dingus gating.** Across a full playthrough of missions 1–10, the Largemouth
   Dingus must **never** appear in a bite pool, on any seed, in any biome. On
   mission 11 it must be reliably catchable. Also confirm mission 11 is absent
   from every screen until mission 10 clears.
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

| Decision | Where to change it |
|---|---|
| The dock stays, one press to launch, no shop | §8.5 |
| A trip ends when the mission target is caught; the track has no finish line | §6.1, §8.3 |
| Eleven missions (11 hidden), rods handed over after 2 / 5 / 8 | `MISSIONS`, §4.3 |
| One target species per mission | `MISSIONS[].target`, §4.3 |
| Zone cools off after 4 fish | §8.1 |
| Bite wait 4–12 s | §7.2 |
| ~45% of slots are pairs; a green at least every 3 slots | §6.3 |
| Quality never loses the fish | §7.6 |
| Fishing camera is over-the-shoulder from inside the boat | §7 |

| The Largemouth Dingus is the last fish in the game — hidden mission 11 | `MISSIONS`, §4.3 and §8.3b |

**Nothing is left open.** This spec is complete enough to build from.

## 17. Naming

`BENNYSFISHMASTER2` is a working folder name and should not ship. When the name is
chosen, the folder, the `games.json` id, the save key (§8.6) and the thumbnail all
have to agree.
