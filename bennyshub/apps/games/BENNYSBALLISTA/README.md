# Benny's Ballista

A siege game for one or two switches. You fire a giant crossbow at castles and
bring the crowns down.

Everything is one self-contained file: [`index.html`](index.html).

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
one and draw a castle with the letters in the table above. The bottom row sits
on the ground.

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

1. **It must stand up.** A block is held up if it can reach the ground through
   other blocks; stepping sideways costs one unit of "span" and only two are
   allowed. That is what lets an archway hold — the lintel over a doorway is
   carried by the legs at either end. A span of three or more sags and falls, so
   a beam wider than five with legs only at its ends will drop its middle. If a
   castle collapses the moment the level loads, that is why.
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
  case the hub's conventions change.
