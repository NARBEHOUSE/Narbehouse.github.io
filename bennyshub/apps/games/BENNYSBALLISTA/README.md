# Benny's Ballista

A siege game for one or two switches. You fire a giant crossbow at castles and
bring the crowns down.

The game itself is one file, [`index.html`](index.html), same as the rest of
the hub — but the castles now run on real physics (see "Physics" below), which
means a real physics engine: [`js/`](js/) vendors
[Box2D compiled to WebAssembly](https://github.com/Birch-san/box2d-wasm).
[Benny's Bowling](../BENNYSBOWLING/) made the same call with Ammo.js, for the
same reason — hand-rolled collision math only gets you so far before a real
engine is the more honest trade. **This means the game needs to be served over
`http(s)://`, not opened as a `file://` page** — the WASM binary loads with
`fetch`, which most browsers block from a bare local file. It's marked
`"needsServer": true` in `games.json` for exactly this reason, same as
`TRIVIAMASTER`.

## Why this game exists

Artillery games normally ask you to hold a button and let go at the right
moment — a sweeping aimer, a filling power bar. [`AGENTS.md`](../../../../AGENTS.md)
bans exactly that ("no hold-to-aim precision, no reaction tests"), and for good
reason: it locks out the person this hub is built for.

So this game takes the timing out completely. A shot is assembled from named
choices you scan through with the spacebar — an angle, a power, and once you
have unlocked more than one, an ammunition type. While you scan, a dotted line
shows the exact path the bolt will take, and the game says out loud what it is
about to hit: *"45 degrees. Hits the left wood beam."* Nothing is hidden and
nothing is rushed. You can sit on a choice for an hour.

## How to play

| Input | What it does |
|---|---|
| **Space**, short press | Move the highlight to the next choice |
| **Space**, held 3 seconds | Scan backwards by itself until you let go |
| **Return**, short press | Pick whatever is highlighted |
| **Return**, held 3 seconds | Go back one step, or open the pause menu |
| Mouse / touch | Optional. Click to pick. Never needed, never a drag. |

Pick an **angle**, then a **power**, and the bolt fires. Destroy every crown to
finish the level. Between each list the highlight passes through a blank
"deadzone" step, so a list never wraps round without warning.

The scan lists only ever contain legal choices, so a selection can never fail.

## What is in a castle

| Letter | Piece | Behaviour |
|---|---|---|
| `W` | Wood beam | Breaks easily. Fire Bolts burn straight through it. |
| `S` | Stone block | Needs a hard hit. Boulders are best against it. |
| `I` | Glass pane | Shatters at a touch, but holds almost nothing up. |
| `T` | Powder keg | Explodes and takes its neighbours with it. |
| `K` | Crown | The target. Destroy them all to win. |
| `X` | Steel girder | Never breaks. Go around it. |

Knocking the legs out from under a structure is usually cheaper than hitting a
crown directly — anything left with no path down to the ground falls, and lands
hard enough to damage whatever is beneath it.

## Physics

Every piece of every castle is a real Box2D rigid body from the moment the
level loads — not a special case for "loose" pieces. That is deliberate: it
means there is no hand-written "is this block held up?" check anywhere in the
game. A well-built castle stands because Box2D's own contact solver is
distributing weight through it via friction and normal force, exactly the way
a real stack of blocks does. Knock the right piece out and the same solver is
what makes everything that depended on it topple, slide down its neighbours'
faces, and crash into whatever is next to it — a chain reaction, not one block
quietly vanishing.

A bolt striking a piece doesn't just deal damage, either — it hands the piece
some of its own velocity, so a hit that doesn't destroy something still knocks
it loose to go tumbling. Impact damage (from a hard landing, or one piece
crashing into another) works by watching for a sudden drop in a piece's own
speed — the physics engine doesn't need to be told when that happens, the game
just notices it.

Two piece sizes come out of this:

- **Long rectangles.** A run of the same wall/floor letter side by side in a row
  (`WWWWW`, `SSSSSSS`, …) is built as one wide rigid body, not N separate cells —
  so a wall topples and lands as a single beam. Heavier (wider) pieces resist
  being knocked around more; a bolt that sends a single stone chunk flying will
  barely nudge a five-wide wall.
- **Small rubble squares** (`w`/`s`/`i` — see the level letters above) are half
  the size of a normal block, much lighter, and never weld to their neighbours.
  A light hit sends them flying rather than just damaging them in place, which
  is what makes them fun to place as loose debris on top of a solid structure.
  They are *not* reliable load-bearing supports: because they only fill the
  bottom half of their map cell, anything drawn directly above one will have a
  visible gap and fall — good for "a wobbly cap that flies off when clipped,"
  bad for "the leg holding up a lintel."

"The Rubble Yard" (the last level) is built specifically to show both off.

The actual Box2D wiring lives in [`js/ballista-physics.js`](js/ballista-physics.js)
— a small adapter so the main script only ever deals in plain pixel
coordinates and never touches Box2D's raw API (which works in metres, and
whose objects need to be explicitly destroyed — there's no garbage collection
on the WASM side). If you're changing how something moves, that file and
`stepWorld()` in `index.html` are the two places to look.

## Ammunition

You start with the Stone Bolt. Clearing levels 3, 6 and 9 unlocks the rest. Each
one is better at something rather than simply stronger:

- **Stone Bolt** — all-round.
- **Boulder** — heavy, so it arcs shorter, but it smashes stone.
- **Fire Bolt** — triple damage against wood.
- **Splitter** — breaks into three at the top of its arc, covering width.

## No fail states

Running out of bolts is not a loss. You are offered the level again, or the
option to switch on **Endless Bolts**, which is **on by default** — with it on
the bolt count only affects your star rating, never your ability to finish.
Nothing in this game can be failed by being slow, and nothing is on a timer.

## Adding a level

Levels are ASCII pictures in the `LEVELS` array near the top of the script. Copy
one and draw a castle with the letters in the table above, plus the lowercase
rubble letters (`w`, `s`, `i` — half-size, never merge, easily knocked flying)
from the Physics section. The bottom row sits on the ground. A run of the same
uppercase letter side by side in one row becomes a single wide rigid body — see
Physics above.

```js
{ name:'The Watchtower', dist:700, par:1, bolts:6, map:[
  '..K..',
  '.WWW.',
  '.W.W.',
  '.W.W.'
]},
```

- `dist` — how far away the castle stands. Keep it roughly **700–780**; much
  further and the far side drifts off screen, much closer and the low-power
  shots overshoot.
- `par` — the bolt count worth three stars.
- `bolts` — the limit when Endless Bolts is switched off.

Two things to check after drawing one:

1. **It must stand up.** There's no hand-written rule to satisfy any more —
   it's real physics, so a well-drawn castle just stands, the same way stacked
   blocks would in real life. If it collapses the moment the level loads, that
   means it genuinely wasn't standing on its own: check that every piece
   either sits on the ground or on something wide enough underneath it. A long
   lintel needs legs that are actually load-bearing (see the small-rubble
   caveat under Physics above) — a beam spanning a wide gap with only
   corner support can sag and fall, exactly like the real thing would.
2. **It must be reachable.** Angles and powers are tuned so every option
   connects with something. If you move a castle a long way out, check that the
   weaker powers can still reach its near face — otherwise those scan steps
   become dead options that only waste the player's presses.

## Settings

Speech, voice, sound, auto-scan, scan speed, colour profile (Ben Default, Dark,
Light, High Contrast), text size (100–200%) and Endless Bolts. Auto-scan and
scan speed are shared hub-wide through `scan-manager.js`, so changing them here
changes them everywhere. Progress, stars and settings are saved automatically
under the `bennysballista_` keys in `localStorage`.

"Reset Progress" needs to be selected twice — a single mis-scan should not be
able to wipe a save.

## Notes for whoever edits this next

- Sound goes through `SafeAudio`, never `AudioContext` — the latter can take
  down the renderer in the Electron desktop build.
- Do not add input debouncing. `scan-manager.js` already installs a global 250 ms
  cooldown; a second one fights it.
- `CFG` at the top holds the hold durations and the scan-on-hold direction, in
  case the hub's conventions change. It also holds the Box2D tuning (`PPM`,
  solver iteration counts, friction/restitution, the impact-damage thresholds)
  — see `js/ballista-physics.js` and `stepWorld()`.
- `boot()` is `async` and `await`s `Box2D()` before the first `buildLevel()`
  call — the WASM module has to finish loading first. Nothing before that
  point in `boot()` may depend on physics being ready.
- Box2D bodies aren't garbage-collected: `buildLevel()` explicitly
  `destroyBlock()`s every body from the outgoing level before building the
  next one, and `damageBlock()`'s "destroyed" branch does the same the instant
  a piece dies, rather than waiting for the next physics step. If you add a
  new way for a block to leave the game, make sure it destroys the body too.
- The one `b2World` (and its static ground body) is created once in `boot()`
  and reused for the whole session — levels only ever add/remove their own
  block bodies, never the world itself.

## Third-party code

`js/Box2D.js` / `js/Box2D.wasm` / `js/Box2D.simd.js` / `js/Box2D.simd.wasm` /
`js/box2d-entry.js` are vendored unmodified from
[`box2d-wasm`](https://github.com/Birch-san/box2d-wasm) (zlib licence — see
`js/box2d-LICENSE.zlib.txt`) and bundle Google's
[wasm-feature-detect](https://github.com/GoogleChromeLabs/wasm-feature-detect)
(Apache 2.0 — see `js/box2d-LICENSE.wasm-feature-detect.txt`). Don't hand-edit
these; pull a fresh copy from the npm package if Box2D itself needs updating.
