# Benny's FishMaster

A fishing-trip sim for one or two switches. Pick a direction, charge the cast,
work a self-paced catch sequence to land whatever bites, and sell your catch to
buy rods that reach deeper water. Nothing here is timed and nothing fails you
for being slow — see [`AGENTS.md`](../../../../AGENTS.md) for the rules every
game in this hub is built to.

## How to play

| Input | What it does |
|---|---|
| **Space**, short press | Move the highlight to the next choice |
| **Space**, held 3 seconds | Scan backwards by itself until you let go |
| **Space**, press and hold *on the power meter* | Charge the cast; letting go only stops it |
| **Return**, short press | Pick what's highlighted, or cast at the charged power |
| **Return**, held 1.5 seconds | Go back one step, or open the pause menu |
| Mouse / touch | Optional. Click to pick, press-and-hold the meter to charge. Never a drag. |

## Casting — a scan list, then a charge meter

The boat is always fixed at the bottom of the screen. A cast is a direction and
a power:

1. **Direction** — a scan list of lake sectors (Far Left through Far Right).
   Space steps through them, Return locks one in. Each chip names the water a
   cast would land in, and the narration lists everything that direction can
   reach.
2. **Power** — a charge meter, the same arrangement
   [`BENNYSBALLISTA`](../BENNYSBALLISTA/) uses. **Hold Space to charge, let go
   to stop, press Return to cast.** Releasing never throws the line, so a
   switch slipping out of a hand costs nothing: you can stop, hear where the
   cast would land, and hold again to add more.

The meter fills 0 → 100% in ten seconds and then **stops dead at the top**.
Holding too long is never worse than letting go at the right moment, because
there is no right moment — there is no sweet spot, no timer, and no penalty for
a slow release. A dotted line and the meter's own readout name the exact biome
the lure will land in the whole time you are charging.

With auto-scan on, the direction list scans itself and the meter fills itself,
so Return alone plays the entire game: Return locks the direction, Return stops
the meter, Return casts.

Return-hold stays the ordinary 1.5-second back/pause — Space is what charges, so
there is no pause-menu threshold to push out (AGENTS.md, "The pause-menu
conflict"). From the power step, Return-hold goes back to the direction step;
from the direction step, it opens the pause menu.

## Landing a bite — follow the light

When something bites, a row of 2–5 Red/Blue steps appears — and **a whole side
of the screen fades up and back down like a lamp on a dimmer**:

- **Blue on the left** means press **Return**.
- **Red on the right** means press **Space**.

Which side the light is on is the part that says which way to turn your head,
which is why it's a screen-wide wash and not a small square. It breathes once
every 2.4 seconds; that is a lamp, not a strobe, it carries no deadline of any
kind, and how bright it happens to be at any moment means nothing. Under
`prefers-reduced-motion` it holds at a steady brightness instead of breathing.
The row of squares in the bottom bar stays as the *record* of what has been
pressed; the light is the *instruction*.

Match the steps at your own pace, with no clock and no timeout. A wrong press
never ends the attempt; it only lowers the catch's *quality*:

| Quality | Result |
|---|---|
| 75–100% | Excellent — top of the species' size range |
| 50–74%  | Good |
| 25–49%  | Fair |
| 1–24%   | Poor — still the real fish, bottom of its range |
| Below 25% | The fish gets away — junk comes up on the line instead |

A cast can also turn up a valuable (sellable) or plain junk item independently
of the sequence — that roll happens the moment something bites, before the
sequence even starts.

## Depth bands, rod reach, and why direction matters

Every lake is four depth bands running out from the boat — **near, mid, far,
deep** — and each band holds one biome. A lake template names four biomes in
depth order, read as two pairs: the first pair fills near/mid, the second fills
far/deep. Each sector flips each pair on a seeded coin toss, so which of the two
shallow biomes sits closest to the boat, and which deep one sits at the back,
changes with the direction you cast. Depth order itself never breaks, so casting
further always means fishing deeper.

## Lakes get bigger, not just harder

Each lake has its own `maxRadiusFt` — how far its fishable water actually
reaches, in feet — and it grows every level: Cedar Hollow Pond is 225 feet
across, Blackwater Reservoir 350, Old Sawmill Lake 475. A rod's `reachFt` is
how far *it* throws at full charge, also in feet, and is fixed once bought.
What actually decides where a cast lands is the ratio of the two, computed
fresh for whichever lake you're standing on — so the same rod reaches a
smaller slice of a bigger lake. That's the whole point of a rod upgrade: the
water didn't get harder to fish, it got bigger, and the old rod goes slack.

| Rod | Reach | On its home lake |
|---|---|---|
| Starter Rod | 75 ft | Mid-range in every direction; never the far water |
| CastMaster 3000 | 125 ft | The far water in every direction (occasionally deeper, where the lake runs shortest) |
| Longshot Pro | 225 ft | Far everywhere; deep in most directions |
| Titanium Ace | 500 ft | The deep water in every direction, out to the far bank |

Carry a rod to a *later* lake and it slides down a tier — a CastMaster that
reaches "far everywhere" at Cedar Hollow Pond only reaches "mid" at Blackwater
Reservoir, because the same 125 feet is a smaller fraction of 350 feet than it
is of 225. The faint dashed curve on the water is the current rod's limit at
the current lake, and the marks on the power meter are where the water gets
deeper — so "how hard do I have to throw to reach the weeds" is something you
can see rather than memorise. The meter and the cast narration both call out
the actual distance in feet as you charge.

Both the rod numbers and the lake numbers are derived from the shoreline's
measured spread — the derivation is in `data.js`'s `RODS` and `LAKE_TEMPLATES`
comments. A coarse worst-case bound gets each rod in the right neighbourhood,
but that bound is conservative enough that a rod sitting right above it can
still miss its intended band on most sectors of a real generated lake — that's
what undersized CastMaster's original 100ft, reaching "far" on only 1-3 of 5
sectors instead of "everywhere". Rods past that first pass get a Monte Carlo
check against thousands of actual `generateLake()` rolls to confirm they hit
their band on most or all of the 5 sectors in practice, not just on paper.
Widening `radiusMul`, changing art.js's shoreline noise, or moving a band edge
invalidates both passes.

## Objectives are always completable

Each lake carries an `objectivePool` — a *preference order*, not a fixed list.
On the first visit, the game re-rolls the lake's seed up to 32 times looking for
a layout that can deliver the hand-authored objectives, and only hands out ones
this lake can actually satisfy: the species has to be unlocked by then, live in
a biome this lake owns, sit inside the reach of a rod that is buyable here, and
be asked for in a quantity inside its own range (a "24 inches or longer"
objective is only fair if the fish grows that long). Whatever it settles on is
stored by id in the save, so it never changes underfoot.

A lake is still free to *contain* water the rod in hand cannot reach — that is
what a rod upgrade is for, and the Fish Finder labels those biomes "Out of
reach" rather than hiding them. What can't happen is an objective for a fish
that isn't gettable on the level it belongs to. If an objective's fish is out of
the *current* rod's reach, the narration names the rod in the shop that reaches
it.

## Gear & progression

Sell your catch in the **Creel**, then spend the money in the **Bait & Tackle
Shop**:

- **Bait/lures** are consumable and shift the odds toward specific species.
  **Swap Bait** is on the pause menu, one step from Resume, because changing
  bait is the thing you want most often mid-trip and walking through the shop
  for it cost three presses more.
- **Rods** are permanent and throw further, reaching deeper bands.

Clearing a lake's objectives unlocks the next lake along with new fish, bait,
and rods.

## Notes for whoever edits this next

- Data (fish, rods, bait, lakes, objective pools) lives in `js/data.js`; lake
  geometry, depth bands and the band/reach maths are in `js/lakegen.js`; the
  painted pond is `js/art.js`; everything else — state, scanning, the charge
  meter, the catch light, menus — is in `js/game.js`.

### The pond art

- `js/art.js` draws everything procedurally — no image files, no build step.
  Three things about it are load-bearing:
  - Its `project()` is the only place a (bearing, radius) becomes a pixel, and
    `computeLanding()` uses it too. That is what keeps the bobber on the patch
    of water the game just narrated.
  - Landing distances come from the *painted* shoreline (`waterRadius`, inset
    12% inside the bank), not from `LAKE_MAX_R` — otherwise a full-power cast
    lands on the rocks, since `BAND_FRAC.deep` is 1.0. `game.js`'s
    `waterFracFor()` is the single place that conversion happens.
  - Every call into it from `game.js` is guarded by `if (A)`. Delete or break
    `art.js` and the game falls back to the flat wedge lake it shipped with,
    still fully playable. Worth keeping that property — and note the fallback
    then measures reach against `radiusMul` instead of the painted bank, which
    shifts the rod table slightly. Playable, not identical.
- **Any new CSS colour variable art.js reads must also be listed in
  `PALETTE_VARS` in `game.js`**, or `css()` just returns grey for it.
- The pond is painted once into an offscreen bitmap keyed by lake + seed +
  colour profile, and blitted each frame; nothing rebuilds it per frame. The
  key is checked at draw time rather than invalidated by hand, so a new caller
  can't forget to refresh it.
- High Contrast passes `flat: true` into the painters: same shapes, but no
  gradients or texture, solid biome fills, heavy outlines, and the straight
  sector dividers come back. It's an accessibility profile, not a skin.
- The surface shimmer is skipped entirely under `prefers-reduced-motion:
  reduce`, the bite ripples settle into two still rings, and the catch light
  holds at a steady brightness. One `reducedMotion()` serves all three.
- The reach limit is walked in 2° steps through `project()` rather than drawn
  as a canvas arc — the pond is in a squashed perspective, so a true circle
  would sit off the water it describes. It is drawn faint on purpose: the art
  pass removed the hard sector dividers, and a bright fence would put that
  clutter straight back.
- **Still placeholder:** the fish and the non-fish catches have no art yet —
  a catch is text and speech only, and the Dingus reveal is still an emoji.
  Cartoon drawings for those are the next pass, and they belong in `art.js`
  alongside the pond. This is why the game is still not in `games.json`.

### Gameplay

- `LG.BAND_FRAC` (lakegen), each rod's `reachFt`, and each lake's `maxRadiusFt`
  (both data.js) only make sense read together: a rod's actual reachFrac is
  `reachFt / currentLake.maxRadiusFt` (game.js `reachFracOf()`), and that's
  what every band and landing calculation actually uses. The reach table in
  data.js's `RODS` comment is the derivation. Changing any one of the three
  without re-deriving the others is what would quietly break rod progression.
- `computeLanding()` is the single answer to "where does a cast go" — the dotted
  line, the direction chips' sublabels, the meter readout and the spoken
  narration all read it, so they cannot drift into saying four different things.
  The chips' sublabels are refreshed in place by `updateChipSubs()` while the
  meter moves rather than by re-running `renderChips()`, which would rebuild
  five click handlers sixty times a second.
- Both the charge meter and the catch light advance from the frame loop's `dt`,
  not from timers, so opening the pause menu freezes them and closing it picks
  up exactly where they were.
- The catch light's breathing lives on a `.glowWash` layer of its own, not on
  `.glowSide` — opacity on the side would fade the "BLUE / Press Return" label
  along with it, and an instruction that dims to nothing at the bottom of every
  breath defeats the point.
- Biome colours are theme CSS variables (`--biome-shallows` etc., set per
  colour profile in `index.html`), read at draw time via `css()`, the same
  pattern Ballista uses for its block materials — so switching profile
  repaints the lake, not just the UI chrome.
- A lake's shape is a deterministic function of its stored seed
  (`lakeProgress[lakeId].seed`) — nothing about the geometry is saved, only the
  seed, so reloading always reproduces the same layout. Objectives are stored
  alongside it as `objectiveIds`.
- Save version 2. A v1 save keeps its money, gear, creel and cleared lakes; its
  objective counters restart, because v1's objectives were a fixed list that no
  longer describes anything. `ensureLakeProgress` re-picks anything whose ids
  are missing or no longer resolve, so renaming a pool entry in data.js is safe.
- The secret `??? Pill Bottle` bait and `Largemouth Dingus` fish are a small
  easter egg: the fish only enters a biome's bite pool once that exact bait
  is equipped (see `biteWeightedFishPool`), and objectives never count it. Its
  reveal screen is a placeholder — a real photo is meant to replace it later,
  and it's built to degrade gracefully in the meantime, the same way
  `tutorial-modal.js` placeholders a missing video.
- No `fetch()` of local JSON/WASM happens anywhere in this game, so
  `"needsServer"` would be `false` in `games.json` — unlike `BENNYSBALLISTA`
  and `TRIVIAMASTER`, which genuinely need to fetch local assets.
