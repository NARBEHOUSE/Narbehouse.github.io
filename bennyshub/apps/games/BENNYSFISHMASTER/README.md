# Benny's FishMaster

A fishing-trip sim for one or two switches. Cast into a procedurally shaped
lake, work a self-paced catch sequence to land whatever bites, and sell your
catch to buy better rods and bait. Nothing here is timed and nothing fails you
for being slow — see [`AGENTS.md`](../../../../AGENTS.md) for the rules every
game in this hub is built to.

## How to play

| Input | What it does |
|---|---|
| **Space**, short press | Move the highlight to the next choice |
| **Space**, held 3 seconds | Scan backwards by itself until you let go |
| **Return**, short press | Pick whatever is highlighted |
| **Return**, held 1.5 seconds | Go back one step, or open the pause menu |
| Mouse / touch | Optional. Click to pick. Never needed, never a drag. |

## Casting — no hold-to-aim

The boat is always fixed at the bottom of the screen. Casting is two scan
lists, the same trick [`BENNYSBALLISTA`](../BENNYSBALLISTA/) uses for aiming
without reflexes:

1. **Direction** — pick a pie-slice of the lake (Far Left through Far Right).
2. **Power** — pick a distance tier (Light, Medium, Far, Max — more tiers
   unlock with better rods).

While you scan either list, a dotted line previews exactly where the lure
will land, and the game speaks what biome it's in, what fish live there, and
whether your current bait favors any of them. Nothing about where the cast
lands is guessed or reacted to — you always know before you commit.

## Landing a bite — self-paced, no fail state

When something bites, a row of 2–5 Red/Blue steps appears (more steps for
tougher fish). Match them at your own pace — **Space for Red, Return for
Blue** — with no clock and no timeout. A wrong press never ends the attempt;
it only lowers the catch's *quality*:

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

## Gear & progression

Sell your catch in the **Creel**, then spend the money in the **Bait &
Tackle Shop**:

- **Bait/lures** are consumable and shift the odds toward specific species —
  check what's biased in a biome while you're scanning the casting lists, or
  ask the **Fish Finder**.
- **Rods** are permanent and add longer power tiers, reaching biomes farther
  from the boat.

Each lake has its own catch objectives (species counts, cumulative weight,
minimum length). Clearing them unlocks the next lake along with new fish,
bait, and rods.

## Notes for whoever edits this next

- Data (fish, rods, bait, lakes, objectives) lives in `js/data.js`; lake
  geometry/biome placement is in `js/lakegen.js`; everything else — state,
  scanning, the catch sequence, menus, rendering — is in `js/game.js`.
- Biome colours are theme CSS variables (`--biome-shallows` etc., set per
  colour profile in `index.html`), read at draw time via `css()`, the same
  pattern Ballista uses for its block materials — so switching profile
  repaints the lake, not just the UI chrome.
- A lake's shape is a deterministic function of its stored seed
  (`lakeProgress[lakeId].seed`, picked once on first visit) — nothing about
  the geometry itself is saved, only the seed, so reloading always
  reproduces the same layout.
- The secret `??? Pill Bottle` bait and `Largemouth Dingus` fish are a small
  easter egg: the fish only enters a biome's bite pool once that exact bait
  is equipped (see `biteWeightedFishPool`). Its reveal screen is a
  placeholder — a real photo is meant to replace it later, and it's built to
  degrade gracefully in the meantime, the same way `tutorial-modal.js`
  placeholders a missing video.
- No `fetch()` of local JSON/WASM happens anywhere in this game, so
  `"needsServer"` is `false` in `games.json` — unlike `BENNYSBALLISTA` and
  `TRIVIAMASTER`, which genuinely need to fetch local assets.
