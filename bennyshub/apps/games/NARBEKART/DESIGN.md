# NARBE Racer — Design & Build Spec

NARBE Racer is an accessible 3D arcade racing game for Benny's Hub (original characters, names and art — no Nintendo characters, names,
logos or sounds) played with **Space and Enter only**. One player uses one or
two switches; two players share a split screen with **one switch each**.

It is built exactly like its sibling `../BENNYSRACETRACKS/`: plain `<script>`
tags, a single `window.NK` namespace, three.js r155 vendored at
`js/three.min.js`, the hub's shared scan and voice managers, and the same
overlay-card menus. Read Race Tracks' `js/ui.js`, `js/game.js`, `js/world.js`
and `js/main.js` before writing anything — most conventions here are copied
from it on purpose.

This file is the **single source of truth** for the module contracts. If code
and this file disagree, fix one of them; do not let them drift.

---

## 1. Accessibility rules (non-negotiable)

The hub's rulebook is `bennyshub/ACCESSIBILITY.md` (the newest copy lives in
the website checkout on F:). It outranks this file. The points below are the
ones that shape this game; §10 of the rulebook is the shipping checklist.

1. **Two keys.** Everything is reachable with Space and Enter (NumpadEnter =
   Enter), and everything is reachable with **Enter alone when Auto Scan is on**.
   Mouse and touch must also work everywhere (they are the only route in for
   platform switch-control users), and nothing may need a drag.
2. **Menus scan like every hub game.** In a menu: Space released = next item,
   Enter released = select, hold Space 3 s = scan backwards (repeating at the
   scan interval), Auto Scan from `NarbeScanManager`, locked items skipped,
   focus spoken by TTS. Copy Race Tracks' `ui.js` behaviour, including
   `ignoreUntilRelease` (a menu opening under a held switch must swallow that
   switch's release) and the `narbe-input-cancelled` handling.
3. **No taps, no timing in a race.** Ben holds switches; he cannot reliably
   short-tap or time a release. So in play: every discrete action fires on key
   **down**; holds are only ever *continuous* controls (steering); a switch
   held for a minute does the same as one held for a second (the vehicle slides
   to the edge and stays there). Items fire automatically after a random
   **3–6 second countdown** once revealed. Drifts, jumps and tricks are automatic.
4. **Doing nothing is always safe.** Auto-accelerate. The vehicle follows the road
   by itself and can never face the wrong way. Releasing a switch eases the
   vehicle onto the nearest lane centre. Never move a vehicle *because* of a key-up.
5. **No dead ends, no dead time.** No state whose only exit is succeeding. Intro
   and results beats are short. Every waiting state has a menu or ends itself.
6. **Speech.** Menus speak on focus and interrupt. Race chatter only speaks into
   silence (`NK.util.speakIfIdle`) and is dropped otherwise — never queued.
   GO, Final Lap and your finish are the only in-race lines that interrupt.
   In 2-player races the guidance never speaks (two people, one voice).
7. **Guidance** ("Direction Help": Off / Visual / On, as in Race Tracks): arrow,
   edge glow, lane pips, green "match" on the one-switch panel, cue tones, and
   (1-player, On) occasional hazard calls. Visual is the default.
8. **Readable.** Big HUD, strong outlines, colour never the only signal
   (position also has size; items have emoji + name). Targets ≥ 64 px.
9. **Never quote durations** to the player, on screen or aloud: "hold Enter to
   pause", never "hold for 5 seconds".
10. **Sound without AudioContext.** The rulebook's checklist: SafeAudio / HTML5
   `<audio>` only. See §11.
11. **Save as it happens.** The hub can close the iframe at any moment (it blanks
   `src`), so progress and settings are written the moment they change.
12. **Files.** Lowercase file names (the website host is case-sensitive) and no
   absolute paths anywhere in the game folder (the website's release audit
   rejects personal paths in any text file).

---

## 2. Controls

### 2.1 Steering modes (a Setting — rulebook §9)
Steering is the only hold in the game, so it ships with a no-hold route behind
a toggle, **Steering: Hold to Slide / Press to Step**, offered in both the
title and pause Settings. **Hold to Slide is the default** (it is the Race
Tracks mechanism the game was asked to use); Press to Step is the route for
players who cannot sustain a hold.

**Hold to Slide** (Race Tracks):

| Who | In a race |
|---|---|
| 1 player, **Two Switches** (Auto Scan off) | Hold **Space** = slide left, hold **Enter** = slide right, both = hold still. |
| 1 player, **One Switch** (Auto Scan on) | **Enter** only (Space inert in a race). Hold = slide the *armed* way, shown by the LEFT/RIGHT side panel. Every release flips the armed side, so a quick press just swaps direction. Only the armed side shows a compact STEER badge; it turns green when it matches purposeful guidance. |
| 2 players | P1 = **Space**, P2 = **Enter**, whatever Auto Scan says. Each switch works like One Switch above, for that player's vehicle only. |

Releasing always eases the vehicle onto the nearest lane centre. A held switch
slides to the edge and stays there — it never does anything else.

**Press to Step**:

| Who | In a race |
|---|---|
| 1 player, Two Switches | Press **Space** = one lane left, press **Enter** = one lane right, on key **down**. Holding adds nothing. |
| 1 player, One Switch / each 2P player | A **lane scanner**: a highlight walks back and forth across the five lanes at the Steering Speed pace (Slow 1.8 s, Normal 1.3 s, Fast 0.9 s per lane). Press your switch (key down) and the vehicle drives to the highlighted lane. The guidance's lane is marked green in the scanner, so "press when the highlight is on green" always works. |

The steering itself is shared code: Step just sets `targetLane`, and the vehicle
slides there at the normal steering pace.

### 2.2 Steering Speed (a Setting)
Slow / Normal / Fast = 0.95 / 0.75 / 0.58 s to cross one lane (`NK.C.STEER_SPEEDS`),
scaled ±10 % by the racer's handling. Also sets the Press to Step scanner pace.

### 2.3 Rocket start
Pressing a switch (key **down**) any time after the "2" of the countdown gives
that player a rocket start (1.2 s boost at GO). Earlier presses are simply
ignored — nothing is ever punished, and nothing requires it.

### 2.4 Pause
The hub contract (rulebook §4, §7, §10), exactly as Race Tracks does it:
- **Hold Enter** in a race (1 player, either scheme) or **hold your switch**
  (2 players — either switch) → pause. From 2 s a progress ring appears in that
  player's view and a rising beep plays each second; at 5 s the pause menu
  opens (`PAUSE_HOLD_SHOW = 2000`, `PAUSE_HOLD_MS = 5000`). Never quote these.
- An on-screen **Pause** button (bottom-left of the screen) does the same for
  mouse and touch; **Escape** too.
- The race pauses itself when the page is hidden (`visibilitychange`).
- The pause menu opens with nothing focused (`startIndex: -1`), swallows the
  still-held switch (`ignoreUntilRelease`), and its first press only steps.
- Races always end on their own (auto-accelerate, the road steers itself), so
  a player who cannot sustain a hold is never trapped: every race reaches the
  results card, which is a normal scannable menu with Settings and Exit.

### 2.5 Input plumbing (important — two players hold keys at once)
The shared `scan-manager.js` filters Space/Enter with window-capture listeners
and a **single global** release cooldown, and it swallows the key-up of any
press it blocks. With two players holding switches at once that drops presses
and — worse — can eat a real key-up, leaving a vehicle steering forever.

So the game has its own raw layer, **`js/input.js`, loaded before
`../../../shared/scan-manager.js`**. It registers `window` capture listeners
first (same target and phase fire in registration order, so scan-manager's
`stopImmediatePropagation` cannot hide events from it), never stops
propagation itself, and keeps **per-key** physical state:
```
NK.input.state(code) → { down, downAt, upAt }       // code: 'Space' | 'Enter'
NK.input.onRaw(fn)   // fn(type: 'down'|'up', code, event) for every accepted raw edge
NK.input.reset()     // forget held keys (race start/end, blur); also calls
                     // NarbeScanManager.resetInputState() when present
```
- `NumpadEnter` counts as `Enter`; `e.repeat` is ignored.
- Per-key bounce filter only: a key-down arriving within the player's Input
  Sensitivity (`NarbeScanManager.getInputSensitivity()`, fallback 50 ms) of the
  **same key's** last release is ignored together with its key-up. There is no
  cross-key cooldown and press length is never filtered.
- **Races read `NK.input`**; **menus keep the normal document listeners** plus
  `narbe-input-cancelled`, so menus behave exactly like every other hub game.
  Cancellation releases only `normKey(e.detail.code)`, never both keys.
- Keys that were already down when a race (or a menu) begins are ignored until
  released.
- `window` blur: `NK.input.reset()` and release all steering.

### 2.6 Menus with two players
Menus follow the hub contract (Space steps, Enter selects, on release; hold
Space scans back; Auto Scan). Two-player additions:
- On shared screens with **Auto Scan on**, either switch selects (each player
  only has one switch, so both are "one-switch" players).
- On a player's **own pick screens** (racer, vehicle) the highlight always
  auto-scans at the hub scan speed and **only that player's switch selects** —
  "Player 1, press Space when your racer is lit." The other switch is ignored.
- Auto-scan pauses while any switch is held, and a release selects the item
  that was highlighted when that press began.

---

## 3. Game flow & modes

```
Title ─ 1 Player / 2 Players / How to Play / Settings / Exit Game
  └ Rules ─ No-Fail (guardrails, can't lose) / Open (standard racing)
     └ Race type ─ Grand Prix / Single Race / Time Trial (1P only)
        └ Speed ─ Easy 50cc / Medium 100cc / Fast 150cc / Mirror (unlockable)
           └ Racer pick → Kart pick   (2P: Player 1 picks, then Player 2)
              └ Cup (GP) or Track (Single / Time Trial)
                 └ Intro (≈2.5 s) → Countdown → Race → Results
                    └ GP: Standings → next race … → Trophy ceremony
```

Focus always starts on the previous choice (saved in `nk-picks`), so a
returning player can just keep pressing select.

### 3.1 No-Fail vs Open (from `NK.C.MODES`)
| | No-Fail | Open |
|---|---|---|
| Road edges | **Guardrails everywhere**; the vehicle can't leave the road | Per-track walls, grass verges (slow) and open drops (fall → Rescue Drone, ≈2.5 s) |
| Getting hit (humans) | *Wobble*: short slow-down, keep coins | *Spin-out*: 1.1 s, lose 3 coins |
| Power Pads | free boost across all 5 lanes | free boost in the track's 2–3 marked lanes |
| CPU pace | 0.9 × class speed, gentle rubber band | full class speed |
| Leader Zapper | not in the pool | in the pool |
| Unlock next cup | finish the cup | top 3 in the cup |
| Results | always a celebration | standard |

CPUs are always hit with full spin-outs (hitting them is the fun part).

### 3.2 Grand Prix
One race per track in the cup (four in every cup; `gp.of` is the cup's track
count), 12 racers, points `NK.C.POINTS`. Race 1: humans start at the
back. Later races: grid in reverse standings order (the points leader starts at
the back — keeps the humans in the action). Ties
broken by the last race's finish. After race 4: trophy ceremony (gold/silver/
bronze for top 3; everyone else gets "Cup complete!" in No-Fail).

### 3.3 Single Race
Any track from an unlocked cup, 12 racers, humans at the back.

### 3.4 Time Trial (1 player)
No CPUs, no Power Boxes; start holding a **Triple Rocket** (its automatic-use
countdown starts when racing begins). Best time per track × class saved; the best run is replayed as
a translucent **ghost** vehicle (record `[progress, x]` at 10 Hz).

### 3.5 Unlocks & saves (localStorage prefix `nk-`)
- Cup 1 (Sunshine) open from the start; each cup opens the next per §3.1
  (Sunshine → Moonlight → Wonder → Dream).
- Mirror class unlocks after any trophy in the Sunshine and Moonlight cups at
  Fast (Open mode) — the original condition; the Wonder and Dream cups are not
  required.
- `nk-progress` `{ cups: { nofail: 1..4, open: 1..4 }, mirror: bool }`
- `nk-trophies` `{ [mode]: { [classId]: { [cupId]: 'gold'|'silver'|'bronze'|'done' } } }`
- `nk-best` `{ [trackId]: { [classId]: seconds } }`, `nk-ghost-<track>-<class>`
- `nk-picks` `{ p1: {char, kart}, p2: {char, kart}, mode, type, classId, cupId, trackId }`
- `nk-settings` `{ cueLevel, music, sfx, steerMode, steerSpeed, split, shake }`

---

## 4. Track space — the driving model

Everything drives in **track space**: `progress` (metres along the circuit
since the start line; negative on the grid) and `x` (sideways offset, + =
right). `s = mod(progress, L)`. `lap = progress < 0 ? 1 : floor(progress / L) + 1`.
A racer finishes when `progress >= laps * L`. Frame conventions are in
`js/spline.js` (forward `(sin h, 0, -cos h)`, right `(cos h, 0, sin h)`, mesh
`rotation.y = -h`, curvature `k > 0` = right-hand bend).

- 5 lanes, `NK.C.laneX(i)` = −7.2 … +7.2 m; road half-width 9.5 m; verge 4.5 m.
- Vehicle half-width 1.1 m, length 2.8 m.

### 4.1 Steering (humans and CPUs use the same code)
- `laneTime = NK.C.STEER_SPEEDS[setting].laneTime × handlingMul` (0.9–1.1).
- Holding: `x += dir × (LANE_W / laneTime) × dt`; `targetLane = laneOf(x)`.
- Released: `x = damp(x, laneX(targetLane), SETTLE_LAMBDA, dt)`.
- Clamp by the edge rules of §4.5. Hitting a clamp plays a bump (once).
- Visual: vehicle yaw leans into lateral motion (`-latVel × 0.12` rad) plus drift
  slip (§4.3); body rolls with bank and lean.

### 4.2 Speed
`v` eases toward `vTarget` (accelerating at the racer's `accelRate`, slowing at 1.4/s):
```
vTarget = class.speed × stats.speedMul × surface × effects × pace
```
- surface: 1 on the road; 0.62 on the verge in Open mode (ignored while boosting / star / jet).
- effects (take the largest boost, then apply penalties): boost/turbo/pad/trick ×1.45,
  star ×1.25, mega ×1.12, jet ×1.75; shrunk ×0.72.
- spin: `v *= HIT.spin.speedMul` at the hit, `vTarget = 0` for the spin; wobble: `v *= 0.8`.
- pace: CPUs only (personality × rubber band × `mode.cpuPace`).
- GO: everyone starts at 0; full speed in ≈2.5 s.

### 4.3 Automatic drift & mini-turbo
- A bend is a *drift bend* while `|k| >= DRIFT_K`. All vehicles visibly drift in
  one (tail slides to the outside, wheel smoke, sparks when charging).
- Charge builds while on the **inside half**: `sign(x) === sign(k) && |x| >= 1.0`
  (No-Fail also charges anywhere in the bend at 70 % rate).
- Levels at `DRIFT_LEVELS` = 0.9 / 1.9 / 3.0 s → blue / orange / purple sparks.
- When the bend ends (`|k| < DRIFT_END_K` for 0.15 s) or the vehicle leaves the
  inside for more than 0.4 s, the mini-turbo fires: `MINI_TURBO` 0.6/1.0/1.5 s
  boost. Charge resets. No timing, no button.

### 4.4 Jumps
`C.JUMPS` shares dimensions between the drawn ramp and the driving model:

| Kind | Ramp length | Ramp rise | Flight distance after takeoff | Arc peak height | Landing apron |
|---|---:|---:|---:|---:|---:|
| `jump` | 6 m | 1.1 m | 32 m | 4.5 m | 6 m |
| `leap` | 7.5 m | 1.4 m | 55 m | 7 m | 8 m |
| `glide` | 9 m | 1.8 m | 90 m | 12 m | 12 m |

The vehicle climbs the wedge before taking off. Flight follows a smooth arc based
on distance along the road, with the peak added above the line joining takeoff
and landing heights. This keeps jumps clearable at every speed class and over
sloping terrain. Glide ramps deploy the vehicle's glider. Tricks are automatic;
landing gives a 0.5 s boost ("Trick!"). No jump button or timed release is needed.
Airborne, the chase camera rises with the kart (0.8 × its height) and looks down
past it, so a big jump shows the landscape below.

**Landscape gaps.** Every circuit's signature jump is a full-width ramp
(`ramps[i].gap = <landscape>`) over a gap in the road: the road stops exactly at
the ramp's lip (the lip is snapped to a centreline node) and resumes `apron`
metres before the landing point. A gap ramp launches **every** kart that
reaches it, whatever its lane — finished karts on their cool-down lap too —
so nobody can ever drive onto missing road; walls guard 20 m before the ramp
to 20 m past the landing (validated). On terrain worlds `world.js` cuts a
canyon across the road (holes in the terrain sheet, explicit strata walls,
a rim strip and a bed under the theme's liquid) and dresses it from
`GAP_DRESS`; in space the road just ends in lit lips; on a sky circuit the
islands end in cliffs. Landscapes: `creek` (Meadow), `inlet` (Shores),
`choco` (Candy), `canyon` (Dunes), `crevasse` (Frost), `ravine` (Spooky),
`moat` (Lava), `void` (Starlight: a giant star ring at the apex), `gorge`
(Jungle), `sky` (Isles). Rescues never set a kart down in a gap
(`W.safeProgress`), peels and balls over a gap fall away, and Time Trial
ghosts follow the known gap arc (`W.gapLift`).

**Optional ramps.** A ramp without `gap` spans some lanes and has a themed block
obstacle near its flight apex, in the ramp's lanes; the lanes beside it are a
ground bypass. Pickups are cleared from the ramp through its landing area so the
route reads clearly. Resolved ramps expose `flightLength` and `peakHeight`;
paired hazards expose `rampS` and `jumpObstacle` so the race and guidance can
recognise the clearable obstacle. A racer who stays on the ramp's route passes
above it. (Frosty Peaks keeps one of these beside its crevasse glide.)

### 4.5 Edges, verges and falling
Each track section declares a left and right edge: `'wall'`, `'verge'` or
`'drop'`. In No-Fail every edge is a guardrail (`'rail'`).

| Edge | Open mode limits | No-Fail |
|---|---|---|
| `wall` | clamp `|x| <= ROAD_HALF - KART_HALF` (8.4); scraping slows ×0.97/s | clamp to outer lane centres (±7.2), rail drawn at the road edge |
| `verge` | clamp `|x| <= ROAD_HALF + SHOULDER - 1.6`; off the paving = slow | same rail |
| `drop` | `|x| > ROAD_HALF + 0.3` → **fall** | same rail |

**Falling (Open):** the vehicle keeps its sideways momentum, drops and tumbles for
1.0 s, then the **Rescue Drone** (a friendly propeller drone with a claw)
lifts it back to lane 2 about 10 m back and sets it down (1.4 s). Speed resets
to 0. CPUs can fall too (rarely).

### 4.6 Vehicle contact
Pairs with `|Δprogress| < KART_LEN` and `|Δx| < 2·KART_HALF + 0.1` are pushed
apart sideways, split by weight; the vehicle behind loses a little speed; bump
sound throttled to 0.45 s per pair. A star / mega / jet vehicle instead hits the
other vehicle (§6.3).

### 4.7 Coins & Boost Pads
- Coins sit in **hopping trails**: a run of `COIN_RUN` (3) coins `COIN_GAP` (6 m)
  apart in one lane, then the next run in an adjacent lane, at least `COIN_HOP`
  (24 m) further on so there is time to change lane at any class and steering
  speed. A line's `lane` is its path (`[2, 3]`); collecting a whole trail takes
  steering, and two players cannot both sit in one lane and take it all. +1 per
  coin, max 10, respawn after 10 s. Spin-outs scatter 3.
- Coins are **item luck**, nothing else (no speed). When a player drives through
  a Power Box, each coin held pulls the odds part of the way toward the next band
  up (`NK.items.odds`): `COIN_PULL` = 3 % per coin in first place rising to 10 %
  per coin in last, so ten coins in first is a modest nudge while ten coins in
  last reaches past the back band into the `JACKPOT` odds (Golden Rocket, Star,
  Jet, Triple Rocket, Mega). Getting the item **spends every coin** (the count
  returns to 0; `'coinsSpent'`, and a COIN BONUS! pop for 3 or more). A box hit
  while already holding an item spends nothing. CPUs roll by place alone.
- Boost Pads (chevron arrows): crossing one = 1.0 s boost.

### 4.8 Set pieces: loops, berms, waterfalls, archways, sky islands
None of these changes the controls: lanes, steering, auto-accelerate and the
"doing nothing is safe" promise hold everywhere.

**Loop-de-loops** (`pieces: [{ kind: 'loop', at, side }]`, dimensions
`NK.C.LOOP`). A loop occupies `LOOP.length` metres (88, snapped to whole
nodes) of a level, straight stretch with walls both sides. In track space it
is ordinary road; the world draws it as a vertical loop of radius 16 m that
climbs, turns upside down and comes down beside its own entry (stepped
`LOOP.shift` = 24 m towards `side`), then swings back onto the line.
`NKSpline.loopPath()` (shared by world, race and validator) maps track metres
onto arc metres piecewise: the entry and exit keep their scale, the circle is
stretched about 7.5×. The race advances karts and items by **metres of road as
driven** (`W.shiftS(progress, v·dt)`), so the visible speed round a loop is the
real speed; contact uses `W.arcGap` so karts touch only when truly side by side.
Karts, rings, shadows, items and ghosts take their pose from `W.loopPose()`
(upside down at the top). The chase camera measures its offsets along the road,
tucks in round the circle (`W.loopBlend`) to keep the kart on screen, and rolls
with the road. Loops play the `whoosh` cue and emit `'loop'`. No drifts, ramps,
pickups or hazards within 15 m of a loop.

**Berms** (`opts.banks: [[from, to, maxBank], ...]`). Bends inside a zone bank
up to `maxBank` radians (≤ 0.7; the new circuits use 0.5–0.62, about 30–35°),
easing in over 40 m. The chase camera rolls with banks beyond 0.24 rad (up to
55 % of the excess), so a berm reads as leaning into the turn; with Camera
Shake off the horizon stays level on berms (loops always roll — a level camera
would flip over at the top).

**Waterfalls** (`pieces: [{ kind: 'falls', at, air?, style?, gate? }]`). A
scrolling curtain across the road that every kart bursts through. On the ground
it pours from a rock arch (crags, lintel, vines, plants) standing on walls both
sides; in the air (`air: true`) it falls from a floating island across a gap
jump's flight. `style` swaps the water for `bubbles`, `steam`, `hologram` or
`confetti`, and `gate` names a themed archway prop that frames the curtain in
place of the rock arch (coral gate, bubble machine, balloon gate, holo gate,
steam gate). Crossing it splashes (particles; the `splash` cue for wet styles,
`whoosh` for the others; a gentle HUD wash tinted to the style for that player —
one fade, never a flash) and emits `'splash'`. Purely visual: no slowdown,
nothing to avoid.

**Archways** (`pieces: [{ kind: 'arches', at, prop, count?, spacing? }]`). One
prop repeated `count` times (2–8, default 4) `spacing` metres apart (10–30,
default 14), each square to the road: a fossil ribcage, coral rings, neon hoops,
carnival light arches, toy arches, factory pipes. Every arch prop keeps a clear
opening over the road (nothing where |x| < 12.5 m below 12 m), stands on a bend
no tighter than 45 m, never over a drop, and keeps clear of loops and gap
jumps. Purely scenery: karts, items and the camera pass straight under.

**Sky islands** (theme `ground.type: 'islands'`, track `islands: [[from, to],
...]`). There is no terrain sheet. Island spans (minus jump gaps) get a grassy
top beside the road over a rocky underside that hangs down to a point, cut off
in cliffs at gaps; their width follows the edges (a `drop` edge is the island's
cliff) and never reaches another stretch. Everything else is a bridge: a marble
deck with gold trim and a hanging arch beneath, castle parapets as its walls.
Below is a sea of cloud (liquid `cloud`); a fall drops into it and the Rescue
Drone brings the kart back as usual. The start line and grid sit on an island.

---

## 5. Positions, laps, finish
- Position: finished racers first (by finish time), then by `progress`.
- Lap events on crossing `L`: big "LAP 2" pop; "FINAL LAP!" also speaks and
  speeds the music up ×1.12.
- A human finishing sees "FINISH! 3rd" (spoken), their vehicle hands over to the
  CPU driver for a cool-down lap and the camera orbits it. The race ends when
  every human has finished; CPUs still running are placed by current progress
  (their times estimated). Results appear ≈2.5 s later.

---

## 6. Items — Power Boxes and automatic use

### 6.1 Collecting
Power Boxes (translucent rainbow cubes with a ⚡ badge) sit in rows across
lanes. Driving through one with an empty slot starts a 1.4 s roulette (ticks,
HUD slot spins); the result is spoken ("Rocket!") if the voice is idle. Boxes
respawn 2.2 s after being taken. A racer already holding an item still smashes
the box but gets nothing.

### 6.2 Using — automatic countdown (no button, ever)
When roulette finishes and reveals an item, that racer receives a random delay
of **3–6 seconds**. The item fires automatically when the delay expires.
The timer runs only with the race; pausing, falling and rescue freeze it. Humans and CPUs use the
same rule, and Time Trial's starting Triple Rocket starts counting down when
the race begins. Losing or consuming an item clears its timer.

Each player's HUD displays a steady **USE IN 4s** readout beside the item,
rounded up to whole seconds. It is hidden during roulette, with an empty slot,
and after finishing. This is information, not a timing challenge or an action
the player has to confirm.

Power Pads remain glowing ⚡ road panels and give a free boost. Crossing one
does not fire an item early or change its countdown. No-Fail pads span every
lane; Open uses the lanes listed by the track.

### 6.3 Roster (ids are the contract)
| id | Name | Emoji | Effect |
|---|---|---|---|
| `rocket` | Rocket | 🚀 | boost 1.3 s |
| `rocket3` | Triple Rocket | 🚀 | boost 3.6 s |
| `goldrocket` | Golden Rocket | 🌟🚀 | boost 5.5 s |
| `peel` | Banana Peel | 🍌 | drops a peel 4 m behind, same lane |
| `peel3` | Triple Peel | 🍌 | three peels trailing 5 m apart |
| `ball` | Bumper Ball | 🟢 | fires ahead in its lane at v+28 m/s for 5 s; hits the first vehicle it overlaps |
| `bee` | Homing Bee | 🐝 | chases the racer one place ahead (≤250 m), else flies straight |
| `zapper` | Leader Zapper | ⚡ | (Open only) flies overhead to 1st place and blasts them + anyone within 6 m |
| `star` | Super Star | ⭐ | 6 s invincible, ×1.25, touching others spins them |
| `shrink` | Shrink Ray | 🔻 | every other racer shrinks for 5 s (×0.72, drop items); No-Fail humans 2.5 s |
| `jet` | Jet Mode | ✈️ | 5 s autopilot at ×1.75, invincible, picks the safest lane itself |
| `horn` | Honk Horn | 📯 | shockwave: destroys nearby peels/balls/bees/bombs **and a Zapper**, spins vehicles within 8 m |
| `mega` | Mega Grow | 💪 | 7 s giant, ×1.12, invincible, flattens vehicles it touches |
| `coins` | Coin Bag | 🪙 | +3 coins (luck for the next Power Box) |
| `bomb` | Boom Box | 💣 | lobbed 35 m ahead, bursts after 1.2 s or on touch, 7 m radius |

Odds are weighted by race position (leaders get defensive items, the back of
the pack gets boosts, stars and jets), in `NK.items.ODDS`. A player's coins lift
the odds toward the next band, more per coin the further back they are (§4.7). No-Fail removes the Zapper and nudges humans
toward boosts. Time Trial has no boxes.

### 6.4 Being hit
`R.hitRacer(victim, cause)` is the one place hits are applied:
- invincible (star/mega/jet) or invulnerable → ignored;
- human in No-Fail → `HIT.wobble`; otherwise → `HIT.spin` (drop coins).
Hazards, items and star/mega contact all go through it.

---

## 7. Hazards (track features)
| kind | behaviour |
|---|---|
| `block` | static obstacle filling a lane (hay bale, sand castle, snowman …) |
| `roller` | sweeps side to side across its lanes with `period` (crab, tumbleweed, snowball, ghost …) |
| `geyser` | periodic: active for 40 % of `period` (lava geyser, steam vent); telegraphed by a glow ½ s before |
| `puddle` | slows to ×0.7 while inside (mud, chocolate) — never spins |

Position/state is a **pure function of time**: `W.hazardState(i, t)` →
`{ x, active }`, so the sim, the guidance and the CPUs can all predict it.
Every hazard row leaves at least two adjacent lanes clear.

---

## 8. Guidance & CPU driving (shared lane scoring)
`NK.guide.laneScores(R, racer, horizonSec)` scores the 5 lanes over the next
couple of seconds; the human guidance and the CPUs both use it:
- hazard or peel or ball in the lane at arrival time → −100 (unless invincible)
- drop edge beside an outer lane in Open → −8
- Power Box row (slot empty) → +20; Power Pad → boost reward
- Boost Pad → +12; coins → +2 each; inside line of a coming drift bend → +6
- current lane → +3 (hysteresis); a vehicle just ahead in the lane → −5

**Guidance** keeps a stable target for the approaching feature and names why a move helps. Visual is the default; Off suppresses guidance and On adds occasional hazard calls (one call per danger, with a generous gap). Minor coin, traffic and inside-line changes stay silent. An outlined ring beneath the controlled vehicle identifies it in each view. Guidance points at the best reachable lane: safety first, then boxes,
pads, boost pads, coins, inside line. `danger` = the vehicle's own lane is blocked
within the lead distance (red rim + warning pulse, as in Race Tracks).

**CPUs** pick a target lane every ~0.25 s from the same scores plus
personality noise and a skill-based chance to miss a hazard; they steer with
the same hold/settle code, react after 0.15–0.5 s, and use the same automatic
item countdown as humans. Rubber band: `pace` = personality (0.95–1.0) × gap factor relative to
the leading human (ahead by g m → × (1 − min(0.10, g/2500)); behind → × (1 +
min(0.12, g/1800))) × `mode.cpuPace`.

---

## 9. Content

### 9.1 Characters (12) — `NK.roster.CHARACTERS`
| id | Name | Animal | Weight |
|---|---|---|---|
| `pip` | Pip | bunny | light |
| `mochi` | Mochi | kitten | light |
| `sunny` | Sunny | chick | light |
| `pixel` | Pixel | mouse | light |
| `rusty` | Rusty | fox | medium |
| `biscuit` | Biscuit | puppy | medium |
| `waddles` | Waddles | penguin | medium |
| `hopper` | Hopper | frog | medium |
| `bruno` | Bruno | bear | heavy |
| `bolt` | Bolt | robot | heavy |
| `rex` | Rex | dinosaur | heavy |
| `hattie` | Hattie | hippo | heavy |

Light: quick to steer and speed up, lower top speed, pushed around. Heavy: the
opposite. Medium: balanced.

### 9.2 Vehicles (4) — `NK.roster.VEHICLES`
`kart` Classic Race Car (balanced) · `bike` Zoom Bike (steers quicker, lighter) ·
`buggy` Monster Buggy (heavier, slower to speed up) · `hover` Hover Vehicle (a bit
faster, slower to steer, no wheels).

### 9.3 Cups & tracks — `NK.tracks`
| Cup | Tracks (in order) |
|---|---|
| ☀️ Sunshine Cup | `meadow` Meadow Circuit · `shores` Sandy Shores · `candy` Candy Canyon · `dunes` Dusty Dunes |
| 🌙 Moonlight Cup | `frost` Frosty Peaks · `spooky` Spooky Woods · `lava` Lava Castle · `starlight` Starlight Road |
| 🎢 Wonder Cup | `jungle` Jungle Falls · `isles` Floating Isles · `reef` Coral Reef · `dino` Dino Valley |
| 💫 Dream Cup | `toybox` Toy Room · `carnival` Funfair · `neon` Neon City · `factory` Clockwork Factory |

Laps of 1000–1500 m, 3 laps, difficulty rising through the list; Meadow has no
drops at all, Starlight Road is drops almost everywhere (in Open). No road
crosses itself in this version (no bridges over other stretches).

**Jungle Falls**: through the temple waterfall on the first sweeper, a
loop-de-loop on the west straight, a climb to the river gorge glide, then a
double hairpin of steep berms. **Floating Isles**: a loop-de-loop on a sky
bridge, a leap from island to island, a climb across the big island and a glide
to the next one straight through a waterfall, a banked island hairpin, and a
castle bridge home. **Coral Reef** (underwater: no sun, no clouds): a loop on the
sea floor, a tunnel of five coral rings, banked hairpins, a glide over the deep
glowing trench (jellyfish, anglerfish, bubble columns) and a bubble curtain in a
coral gate on the long sweeper. **Dino Valley**: a leap over the bubbling tar
pit, banked hairpins, a glide over the dinosaur river with long-necks wading
below, and a fossil ribcage to drive through on the sweeper home.

**Toy Room** (indoors: no sun, no clouds): banked S-bends round giant toys, a
loop, a leap over the ball pit, a bubble-machine curtain and toy arches over the
home straight. **Funfair** (a heart-shaped lap): a balloon-gate confetti curtain,
banked sweepers, then a loop and a leap over the bumper-car arena on one long
straight, and carnival light arches home. **Neon City** (night): a glide off a
rooftop over the busy street, a curving tunnel of neon hoops, a hologram gate and
a loop through the skyline. **Clockwork Factory**: steep banked gear hairpins, a
loop, a glide over the molten gear pit, a run of pipe arches and a steam gate.

### 9.4 Prop catalog (names are the contract between themes.js, props and world.js)
Each builder is `NK.art.props[name](rng) → Object3D` (origin on the ground,
facing -Z, sized in metres; a vehicle is 2.8 m long). Hazards are
`NK.art.hazard[name](rng)`. `themes.js` lists these names; `world.js` places
whatever a theme lists and falls back to a plain grey block (with a console
warning) for any name that does not exist yet.

| Theme | near (3–60 m from the road) | far (60–260 m) | landmarks | hazards `{block, roller, geyser, puddle}` |
|---|---|---|---|---|
| `meadow` | tree_round, tree_pine, bush, flower_patch, fence_wood, hay_bale, rock_small, toadstool | windmill, barn, silo, hill_round, tree_cluster | hot_air_balloon, water_tower | hay_stack, hay_roll, —, mud_puddle |
| `shores` | palm_tree, beach_umbrella, sand_castle, beach_ball, rock_sand, seashell, surf_stand, beach_grass | lighthouse, beach_hut, sailboat, sea_rock, pier | lighthouse, pier | castle_big, crab, —, tide_pool |
| `candy` | lollipop_tree, candy_cane, gumdrop, cupcake, donut, ice_cream, wafer_fence | cake_mountain, cookie_house, choco_fountain, candy_hill | giant_cake | cupcake_big, gumball, —, choco_puddle |
| `dunes` | cactus, cactus_barrel, rock_desert, dry_shrub, desert_sign, bones | mesa, pyramid, oasis_palm, dune_hill | pyramid, cat_statue | boulder_desert, tumbleweed, —, quicksand |
| `frost` | pine_snowy, snowman, ice_crystal, snow_rock, snow_drift, lamp_snowy | snowy_mountain, cabin, ski_tower, pine_cluster_snowy | igloo, ice_arch | snowman_big, snowball, —, ice_patch |
| `spooky` | dead_tree, pumpkin, gravestone, lantern_post, glow_mushroom, iron_fence | haunted_house, spooky_hill, dead_tree_big | haunted_house, bell_tower | pumpkin_big, ghost, —, goo_puddle |
| `lava` | lava_rock, torch_pillar, spike_rock, chain_post, skull_rock | volcano, castle_tower, castle_wall_piece, rock_spire | castle_gate, volcano | stone_block, rolling_boulder, lava_geyser, ash_puddle |
| `starlight` | star_buoy, asteroid_small, crystal_spire, ring_gate, light_pylon | planet_ringed, planet, space_station, comet | space_station, moon_big | space_rock, meteor, plasma_vent, gravity_well |
| `jungle` | jungle_tree, giant_fern, jungle_flower, banana_plant, mossy_rock, tiki_torch, bamboo_clump | jungle_hill, giant_tree, temple_ruin, waterfall_cliff | temple_big, stone_head | tiki_block, coconut, water_spout, jungle_mud |
| `isles` | cloud_puff, sky_flower, windmill_small, banner_pole, crystal_small, sky_tree | floating_island, airship, cloud_castle, cloud_bank (all float) | sky_whale, sky_castle (float) | cloud_block, thunder_ball, wind_gust, rain_puddle |
| `reef` | coral_branch, coral_fan, brain_coral, kelp, sea_anemone, giant_clam, starfish_rock | coral_tower, kelp_forest, sunken_temple, fish_school (floats) | giant_turtle (floats), treasure_galleon | clam_block, pufferfish, bubble_vent, seagrass_patch |
| `dino` | cycad, tree_fern, horsetail, egg_nest, mossy_boulder, baby_dino, fossil_rock | volcano_smoking, conifer_tall, mesa_green, pterodactyl_flock (floats) | long_neck, triceratops_big | egg_block, rolling_log, hot_spring, tar_puddle |
| `toybox` | toy_blocks, crayon_bundle, rubber_duck, spinning_top, wind_up_robot, marble_pile, dominoes | book_stack, toy_castle, block_tower, stuffed_bunny | teddy_giant, toy_rocket_big | toy_block, bouncy_ball, jack_in_box, juice_spill |
| `carnival` | balloon_cart, popcorn_stand, lamp_garland, prize_booth, carnival_flag, teacup_ride | ferris_wheel, circus_tent, carousel, coaster_hill | ferris_giant, drop_tower | gift_block, circus_ball, confetti_cannon, soda_spill |
| `neon` | neon_lamp, planter_tree, hydrant, neon_sign, city_bench, vending_machine | skyscraper, skyscraper_slim, billboard_tower, apartment_block | neon_tower, giant_cat_sign | road_barrier, rolling_tire, steam_manhole, oil_slick |
| `factory` | pipe_stack, crate_stack, barrel_group, gear_post, lamp_cage, valve_wheel | smokestack, factory_hall, gasometer, crane_tower | clock_tower, gear_tower | crate_block, oil_drum, steam_pipe, oil_puddle |

Jungle and Isles props live in `js/props-wonder.js` (also `hanging_roots`,
`hanging_crystals`, hung under the sky islands). Floating props set
`userData.floats` and hang at their own height instead of standing on ground.
The landscape-gap dressing lives in `js/props-gaps.js` and is placed by
`world.js` (`GAP_DRESS`), not by the theme lists: lily_pads, duck_family,
reed_clump, stepping_stones, watermill · sea_arch, shipwreck, dolphin_pod,
buoy_bell · choco_falls, rock_candy, marshmallow_stones, candy_raft ·
rope_bridge_dangling, natural_arch_red, canyon_falls, river_rocks · icicle_row,
frozen_falls, ice_floe, ice_spire · broken_bridge_wood, wisp_lights,
lantern_boat, twisted_roots · lava_falls, lava_plume, chain_bridge_broken,
obsidian_spire · ring_gate_big (origin at the ring's centre), black_hole,
asteroid_cluster. Waterfalls' origin is the base of the falling sheet; rim
pieces' origin is the rim edge with their front (-Z) over the drop.

Reef and Dino props live in `js/props-wonder2.js`, Toy Room and Funfair in
`js/props-dream1.js`, Neon City and Factory in `js/props-dream2.js`. Each also
builds its landscapes' gap dressing and its archway / gate set pieces:
glow_jellyfish, angler_light, trench_coral, bubble_column, coral_gate,
coral_ring · sauropod_wading, river_ferns, tar_bubbles, tar_bones, pterodactyl,
rib_arch · giant_ball, toy_slide, beach_bucket, bubble_machine_gate, toy_arch ·
bumper_car, arena_lights, balloon_gate, light_arch · traffic_car, bus_city,
street_light_low, crosswalk, holo_gate, neon_hoop · gear_giant (origin at the
gear's centre), molten_pour, catwalk_broken, steam_gate, pipe_arch. Gate and
arch props are centred on the road, span X and keep the opening clear.

Shared set pieces (in `art.js`, used on every track): `grandstand`,
`billboard` (NARBE Racer signage), `startGantry(width)` with start lights,
`balloon_arch`, `pit_building`, `traffic_cone`.

Hazard sizes: `block` fills one lane (≈ 2.8 m wide, ≤ 2.5 m tall); `roller` is
≈ 2 m across; `geyser` marks one lane (its column is 1.6 m wide, 6 m tall when
active); `puddle` is a flat patch one lane wide and 6 m long.

---

## 10. Module contracts

Load order in `index.html` (`input.js` must precede `scan-manager.js`, §2.5):
```
../../../shared/safe-audio.js → ../../../shared/voice-manager.js →
../../../shared/ios-audio-fix.js → js/input.js → ../../../shared/scan-manager.js →
js/three.min.js → js/spline.js → js/util.js → js/constants.js → js/audio.js →
js/art.js → js/art-items.js → js/props-sunshine.js → js/props-moonlight.js →
js/props-gaps.js → js/props-wonder.js → js/props-wonder2.js →
js/props-dream1.js → js/props-dream2.js → js/roster.js →
js/themes.js → js/tracks.js → js/world.js → js/items.js → js/guide.js →
js/ai.js → js/race.js → js/camera.js → js/item-icons.js → js/hud.js → js/controls.js →
js/game.js → js/ui.js → js/main.js
```
(`input.js` creates `window.NK` itself if needed, since it loads before util.js.)
Every file is an IIFE assigning one `NK.<name>`; nothing runs at load except
definitions (main.js boots on DOMContentLoaded). Shared scripts are loaded with
`onerror="console.warn(...)"` and every use of the managers is null-guarded
(`NK.util.vm()`, `NK.util.sm()`).

### 10.1 `NK.art` — materials, textures, props, item meshes, FX
Style: chunky, toy-like low-poly; big readable silhouettes; saturated colours
that still read under fog; `MeshToonMaterial` (3-step gradient) for vehicles,
characters and items; `MeshLambertMaterial` with `flatShading` for the world;
vertex colours where they save draw calls. Canvas textures set
`colorSpace = THREE.SRGBColorSpace`. Keep Race Tracks' renderer setup
(`useLegacyLights = false`, `NoToneMapping`, physical light intensities) and
its low-vision rule: **a dark outline on everything the player must react to**
(hazards, peels, projectiles, Power Boxes, pads, vehicles) — an inverted-hull
shell or `EdgesGeometry`, merged/instanced so it costs almost nothing. Emissive
colours must be deep (light ones blow out to white under NoToneMapping).
Clone a cached material before animating it per object.
```
NK.art.mat.toon(hex, opts?)    NK.art.mat.lambert(hex, opts?)
NK.art.mat.glow(hex, intensity) NK.art.mat.basic(hex, opts?)   // all cached by key
NK.art.part(geometry, material, { pos, rot, scale, cast, receive, outline }) → Mesh
NK.art.paint(geometry, hex, jitter?) → geometry      // bakes a vertex colour
NK.art.partV(geometry, hex, opts) → Mesh            // painted part on mat.toonV() (opts.lambert → lambertV)
NK.art.mat.toonV() · mat.lambertV()                 // shared vertex-colour materials: 1 draw call per welded object
NK.art.outline(mesh, thickness) · NK.art.ink(root, thickness)   // inverted-hull ink outlines
NK.art.mergeByMaterial(object3d) → Group   // welds child meshes that share a material
NK.art.tex.sky(top, mid, horizon) · tex.road(spec) · tex.rainbow() · tex.checker()
NK.art.tex.blob()  (soft round shadow) · tex.pad('power'|'boost')
NK.art.props[name](rng) → Object3D   // origin on the ground, faces -Z; userData.anim optional
NK.art.hazard[kind + ':' + themeId](rng) → Object3D   // see §9 themes for names
NK.art.items.box() · pad('power'|'boost') · coin() · ramp(lanes, kind)
NK.art.items.peel() · ball() · bee() · zapper() · bomb() · hornWave() · starAura()
NK.art.drone() · startGantry(width) · podium() · trophy('gold'|'silver'|'bronze') · glider()
NK.art.fx.burst(hex, count) → obj; NK.art.fx.update(obj, dt) → alive
NK.art.fx.sparks() / flame() / smoke() / confetti() → emitters with .emit(pos, n), .update(dt)
```

### 10.2 `NK.roster` — characters and vehicles
```
NK.roster.CHARACTERS  [{ id, name, animal, weight, stats:{speed,accel,handling,weight} (1..5),
                         colors:{ primary, secondary, accent, kart }, blurb, emoji }]
NK.roster.VEHICLES    [{ id, name, emoji, blurb, mods:{speed,accel,handling,weight} (-1..+1) }]
NK.roster.statsFor(charId, vehicleId) → { speedMul, accelRate, handlingMul, weight }
NK.roster.build(charId, vehicleId) → THREE.Group   // faces -Z, origin = road contact centre
   userData: { wheels[], steerWheels[], body, driver, exhaust:[Vector3], rearContacts:[Vector3],
               glider (hidden), hoverPads[] (hover only), height, vehicleId, charId }
NK.roster.character(id) · vehicle(id)   // lookups with a safe fallback
NK.roster.bars(charId, vehicleId) → { speed, accel, handling, weight } each 0..1 (menu stat bars)
```
Conventions as built: character colours are CSS strings (`'#rrggbb'`, like
themes.js). `wheels[i].userData.radius` is the contact radius — rolling forward
is `rotation.x -= v·dt / radius`. `steerWheels` yaw positive = wheels turned
left. `exhaust` / `rearContacts` are root-local points with the body at rest.
`height` includes ears and antennas. The bike's wheels hang off `body` (so a
body roll leans the whole bike — keep its bob small); on the other vehicles the
wheels hang off the root. Outlines are baked into the chassis and driver
meshes, so a racer has no separate outline children. Every racer shares
`NK.art.mat.toonV()`: anything that tints one racer (star, ghost, hit flash)
must clone the material for that racer. Racers carry no blob shadow — the race
adds `NK.art.blobShadow`. `NK.art.glider(colorHex)` has its origin at the foot
of the mast (sail ≈ 1.15 m up); the roster mounts and stretches it.
Each built racer should cost ≤ 8 draw calls including outlines: paint parts
with vertex colours (`NK.art.paint`) so a whole chassis or driver welds into
one mesh on one shared material; wheels stay separate (they spin).

### 10.3 `NK.themes` and `NK.tracks` — data
```
NK.themes[id] = { id, name, night, sky:[top,mid,horizon], fog:{color,near,far},
  light:{ hemiSky, hemiGround, hemiInt, sunColor, sunInt, ambInt, sunDir:[x,y,z] },
  road:{ style:'asphalt'|'rainbow'|'ice'|'candy'|'stone'|'sand', base, edge, lane, center },
  rail:{ a, b }, wall:{ style, color }, ground:{ type /* …|'none' space|'islands' sky */, colors:[a,b], hills },
  liquid: null | { kind:'water'|'lava'|'chocolate'|'void'|'cloud', color, emissive, level },
  props:{ near:[names], far:[names], density }, hazards:{ block, roller, geyser, puddle },
  music, ambient:'leaves'|'petals'|'snow'|'embers'|'stars'|null }
NK.tracks.CUPS   = [{ id, name, emoji, tracks:[ids] }]
NK.tracks.TRACKS = { [id]: { id, name, cup, theme, blurb, seed, laps:3,
  points:[[x,z,y]...], opts:{ bankGain, bankMax, scale, banks?:[[from, to, maxBank, gain?]] },
  edges:[{ from, to, left, right }],            // lap fractions; default 'verge'
  features:{ itemRows:[{at, lanes}], padRows:[{at, lanes}], boostPads:[{at, lanes}],
               coins:[{from, to, lane /* or a hop path [a, b] */}], ramps:[{at, kind /* jump|leap|glide */, lanes, gap?, flightLength?, peakHeight?}],
               hazards:[{at, kind, lanes, period, phase, rampAt?, rampOffset?, jumpObstacle?}] },
  pieces?:[{ kind:'loop', at, side } | { kind:'falls', at, air? }],   // §4.8
  islands?:[[from, to], ...],                    // sky circuits only
  landmarks:[{ at, side, off, prop }] } }
NK.tracks.get(id, { mirror }) → resolved copy (lanes mirrored)
```
`tools/validate_tracks.js` (node) builds every loop with `NKSpline` and checks:
radius ≥ 42 m, no self-overlap, start on a straight, sane slopes, features
inside the lap, ≥ 2 adjacent clear lanes at every hazard row, pad rows ≥ 120 m
after a box row, nothing within 40 m of the line except the grid.

### 10.4 `NK.world` — builds a track into the scene
```
NK.world.build(scene, trackId, { mode, mirror, quality }) → W
W.track, W.theme, W.loop, W.L
W.frameAt(s) → { pos, right, forward, heading, yaw, bank, curvature, y }  // REUSED objects; the
                                         // centreline frame (a loop's span reads as its straight)
W.pointAt(s, x, outVec3) → road surface point (banking and loops included)
W.loopPose(s, x, out?) → { pos, quat, up, forward, right } inside a loop, else null
W.upAt(s, out?) → road normal (loop or banked road)
W.pieces → { gaps:[{rampS, takeoff, end, land, scene, kind}], loops:[{s0, len, arc}], falls:[{s, air}] }
W.shiftS(p, metres) → progress `metres` of road as driven from p (≠ p + metres only round loops)
W.warpAt(p) · W.arcGap(a, b) · W.loopBlend(p) · W.inLoop(p)    // loop helpers (§4.8)
W.inGap(p) · W.safeProgress(p) · W.gapLift(p)                   // gap helpers (§4.4)
W.edgeAt(s) → { left, right }            // 'wall'|'verge'|'drop'|'rail'
W.limits(s) → { minX, maxX, fallL, fallR } // steering clamp + fall thresholds for this mode
W.features  // resolved: itemRows[{s,lanes}], padRows, boostPads, coins[{s,lane}],
            // ramps[{s,kind,lanes,len,rampHeight,flightLength,peakHeight}],
            // hazards[{s,kind,lanes,rampS,jumpObstacle,...}]
W.hazardState(i, t) → { x, active }       // pure function of time
W.handles   // meshes the sim toggles: boxes[row][lane], coins[i], pads[row] (material), hazards[i]
W.setPadGlow(bool)                        // per-view highlight
W.startGrid(n) → [{ progress, x }]        // row-by-row, 2 per row, staggered, behind the line
W.minimap → { pts: Float32Array xz, bounds }
W.update(dt, t, cameraPos)                // sky follows camera, animated props, hazards, boxes spin
W.dispose()
```

### 10.5 `NK.race` — the simulation
```
NK.race.create({ world, scene, mode, classId, laps, timeTrial,
                 humans:[{ charId, vehicleId, oneSwitch }],
                 cpus:[{ charId, vehicleId }], grid:[racerIndex...] }) → R
R.racers   // humans first: racers[0] = P1, racers[1] = P2
R.phase    // 'intro'|'countdown'|'racing'|'done'
R.time, R.countdown
R.update(dt)
R.setSteer(humanIdx, dir)        // Hold to Slide: -1 | 0 | 1, the current hold state
R.setTargetLane(humanIdx, lane)  // Press to Step / pointer: slide to this lane and settle
R.pressed(humanIdx)              // key-down notification (rocket start)
R.setAutopilot(humanIdx, on)     // test harness + finished humans: the CPU driver takes over
R.hitRacer(victim, cause)
R.standings() → Racer[]
R.on(event, fn)                  // 'countdown'(n) 'go' 'lap'(r,lap) 'finalLap'(r) 'finish'(r)
                                 // 'itemGet'(r,kind) 'itemUse'(r,kind) 'hit'(r,cause) 'fall'(r)
                                 // 'rescued'(r) 'place'(r,old,new) 'coin'(r) 'boost'(r,src)
                                 // 'turbo'(r,level) 'trick'(r) 'bump'(a,b) 'done'(results)
                                 // 'splash'(r, falls) 'loop'(r, loop)   (§4.8)
R.dispose()
```
Racer:
```
{ idx, isHuman, human (0|1|-1), charId, vehicleId, name, stats,
  progress, s, lap, x, y, vy, v, steer, targetLane, lane, armedDir,
  place, finished, finishTime, coins, item, roulette, rouletteKind, itemUseT, itemUseDelay,
  boostT, starT, megaT, jetT, shrinkT, spinT, wobbleT, invulnT, fallT, rescueT, airT,
  drift:{ dir, charge, level, outT }, mesh, ai }
```

### 10.6 `NK.items`, `NK.guide`, `NK.ai`
```
NK.items.DEFS[id] = { id, name, emoji, speech, type }
NK.items.ODDS, NK.items.JACKPOT, NK.items.odds(R, racer) → { band, pull, weights } (place, then a player's coins), NK.items.roll(R, racer) → id
NK.items.use(R, racer), NK.items.update(R, dt), NK.items.objects(R) → [{ type, s, x, ownerIdx }]
NK.items.clear(R)
NK.guide.laneScores(R, racer, horizonSec) → Float32Array(5)
NK.guide.update(R, racer, dt) → { dir, active, targetLane, danger, reason }
NK.ai.init(R, racer, seed), NK.ai.update(R, racer, dt), NK.ai.pace(R, racer) → multiplier
```

### 10.7 `NK.camera`, `NK.main`
One `WebGLRenderer`; 1 or 2 **views**, each with its own `PerspectiveCamera`,
viewport and scissor. 2-player is side-by-side by default (keeps everything
full-height — objects stay as big as in 1-player), top/bottom as a Setting.
```
NK.main.setViews([{ camera, playerIdx }])   NK.main.renderer / scene
NK.camera.chase(view, racer, dt, snap)      NK.camera.intro(view, W, t)
NK.camera.finish(view, racer, dt)           NK.camera.attract(view, W, t)
NK.camera.podium(view, anchor, t)
```
Per-view hook before each render: `NK.game.beforeView(viewIdx)` (the controlled
vehicle's ring and per-player effects). Adaptive quality exactly like Race Tracks (pixel-ratio
steps; drop shadows first). Vehicle shadows are blob decals, not shadow maps.

### 10.8 `NK.hud` — per-view DOM HUD
```
NK.hud.setup(layout)       // 'single' | 'side' | 'stack'
NK.hud.update(v, d)        // d = { place, of, lap, laps, item, roulette, itemUseT, itemUseDelay, coins, time, best,
                           //       lane, drift, cue:{dir,active,level}, danger, armed, oneSwitch,
                           //       finished, label }
NK.hud.control(v, c)       // c = { scheme:'two'|'one'|'step-two'|'step-scan', armed:-1|1,
                           //       match, scanLane, targetLane, pauseHold:0..1 }
NK.hud.pop(v, text, kind)  // big centre messages; v = -1 for every view
NK.hud.splash(v)           // waterfall: a gentle water wash over that view, one fade
NK.hud.minimap(v, W, racers, focusIdx)
NK.hud.clear()
```
Layout per view: item slot top-left (with its name, USE IN countdown and coin count under it), place
top-right (huge, gold/silver/bronze tint for 1-3), lap under it, minimap
bottom-right, lane pips bottom-centre with the drift meter above them (in
step-scan mode the pips are the lane scanner: the highlighted pip is where a
press goes, the guidance lane is green), cue arrow top-centre, one-switch
LEFT/RIGHT panels on the view's edges, the pause-hold ring in the view's
bottom-right corner. In 2-player each view has a thick frame in its player's
colour and a "P1 · Space" / "P2 · Enter" tag.

### 10.9 `NK.game` and `NK.ui`
`NK.game` owns the session (players, mode, type, class, picks, cup/track, GP
state, standings, unlocks, saves), the attract loop behind the menus (a CPU
demo race on Meadow Circuit), the racer/vehicle preview turntable, the race
lifecycle (build world → create race → views/HUD → results) and the podium.
`NK.ui` owns every screen and all input, calling `NK.game` for everything else.

`NK.game` API (what the menus and controls call):
```
NK.game.init({ renderer, scene })                 // from main.js
NK.game.update(dt) · NK.game.beforeView(viewIdx) // from main.js, every frame / every view
NK.game.settings.get(key) · .set(key, value)      // nk-settings, saved immediately:
     cueLevel 0|1|2 (default 1) · music bool · sfx bool · steerMode 'hold'|'step'
     steerSpeed 'slow'|'normal'|'fast' · split 'side'|'stack' · shake bool
NK.game.session → { players, mode, type, classId, picks:[{charId, vehicleId}], cupId, trackId,
                    gp:{ race, of, standings } | null }          // a read-only snapshot
NK.game.setPlayers(1|2) · setMode(id) · setType('gp'|'single'|'tt') · setClass(id)
NK.game.setPick(playerIdx, { charId?, vehicleId? }) · setCup(id) · setTrack(id)
NK.game.lastPicks() → the saved nk-picks (menus start focus there)
NK.game.unlocked → { cups(mode) → n, mirror: bool }
NK.game.trophy(mode, classId, cupId) → 'gold'|'silver'|'bronze'|'done'|null
NK.game.bestTime(trackId, classId) → seconds | null
NK.game.setPreview({ charId, vehicleId } | null)  // 3D turntable beside the menu card
NK.game.startSession()   // GP race 1, a single race or a time trial, from the session
NK.game.nextRace() · restartRace() · quitToMenu()
NK.game.pause() · resume() · isRacing() · isPaused() · phase()
NK.game.steer(humanIdx, dir) · targetLane(humanIdx, lane) · pressed(humanIdx) · lane(humanIdx)
NK.game.cue(humanIdx) → { dir, active, targetLane, danger, level }   // for the one-switch match
NK.game.results() → { track, mode, classId, type,
     order:[{ place, name, charId, human, time, points, total }],
     humans:[{ human, place, time, newBest }],
     gp:{ race, of, standings:[{ name, charId, human, total }], done, trophies:[...] } | null }
NK.game.resetProgress()
NK.game.on(event, fn)    // 'raceEnd'(results) 'gpEnd'(summary) 'countdown'(n) 'phase'(p)
```

`NK.controls` (`js/controls.js`, owned with the UI) turns raw keys into
steering, per player: it reads `NK.input`, applies the steering mode (§2.1),
flips the armed side on release, runs the Press-to-Step lane scanner, detects
the pause hold (and draws its ring through the HUD), sends rocket-start
presses, and calls `NK.game.steer / targetLane / pressed`. It knows nothing
about menus: `NK.ui` enables it when a race starts and disables it whenever an
overlay is up.
```
NK.controls.start({ players, oneSwitch, steerMode, steerSpeed })  NK.controls.stop()
NK.controls.tick(dt)   NK.controls.state(humanIdx) → { armed, scanLane, holding, pauseHold }
NK.controls.onPause = fn   // set by NK.ui
```

The HUD gets its data from two places, so neither owner has to know the
other's internals: `NK.game` calls `NK.hud.update(v, raceData)` about ten
times a second, and `NK.controls` calls `NK.hud.control(v, { scheme, armed,
match, scanLane, targetLane, pauseHold })` whenever its state changes.

`NK.ui` is Race Tracks' overlay-card engine (`SCREENS[name](opts)` returning
`{art, title, sub, items:[{label, speech, value, enabled, wide, action, onFocus}],
speech, startIndex, stats, hint, announce, listenFirst}`), with Fish Mystery's
fixes: `ignoreUntilRelease` captured in **every** `showOverlay(true)`;
`index = -1` cards whose first press only steps and reads; `activate()` at -1
steps; a time-based ghost-click guard; the hint line follows the scheme
("Tap Space = next · hold Space = back · Enter = choose", or "Enter picks the
highlighted item" with Auto Scan on). Cards that arrive on the back of a press
(results, pause, standings) open with nothing focused.

Screens: `title` (1 Player, 2 Players, How to Play, Settings, Exit Game) ·
`rules` (No-Fail, Open, Back) · `type` (Grand Prix, Single Race, Time Trial
[1P], Back) · `speed` · `racer` (showcase layout: card left, 3D turntable
right; 12 racers in a 3-column grid; first item "Same as last time") · `kart` ·
`cup` · `track` · `howto` · `settings` · `pause` · `results` · `standings` ·
`trophy` · `confirmExit`.

**Phone race layout:** when the shorter viewport edge is at most 600px and
the longer edge is at most 1100px, two-player views use top/bottom in portrait
and side-by-side in landscape. Rotation updates the effective layout without
changing the saved desktop split preference. Portrait chase framing adjusts
to keep the player's vehicle and upcoming road visible.

Each view has a compact HUD with item countdown, lap, place and player label.
Very small split views hide the duplicate keyboard tag and minimap while
retaining P1/P2 identification and the one-switch lane scanner. Pause remains
at least 64px and clear of safe-area insets. A tap chooses one of the five
lanes across that player's view; dragging is optional. Each touch keeps its
original player until it ends or is cancelled, so fingers may cross the
divider without steering the other player. Held switches retain priority.


**Phone and short-window menus:** at widths up to 900px or heights up to
500px, cards use the available safe area and scroll vertically with full-size
controls (at least 64px). Portrait phones show two racer columns, one settings
column and one standings column. Text wraps within each option. The racer or
vehicle preview sits above the card in portrait and beside it in landscape,
and follows orientation changes. Wider desktop screens keep their existing
showcase layout.

Switch focus automatically reveals the selected option inside a scrolling
card, including Back; the hint remains reachable at the bottom. A swipe scrolls
without selecting the touched option, and a tap activates once despite the
following synthetic click. Auto Scan waits while a finger is down and resumes
after the gesture ends or is cancelled. Safe-area insets keep cards clear of
screen cutouts and home indicators.

The `mobile-ui.cjs` harness covers 320x568, 360x640, 390x844, 768x1024,
667x375 and 844x390, with 1024x768 and 1600x900 desktop comparisons. It checks
target sizes, wrapping, horizontal fit, focus scrolling, footer access, native
touch gestures and simulated safe areas. These are Chromium viewport and touch-event simulations; physical iOS and Android devices still need a hands-on check.

**Settings, in the rulebook's order**, reachable from the title and the pause
menu (Back returns to where it came from):
Text to Speech · Voice · Steering (Hold to Slide / Press to Step) · Steering
Speed · Direction Help (Off / Visual / On) · Music · Split Screen (Side by Side
/ Top and Bottom) · Camera Shake (On / Off) · **Auto Scan** (`On — One Switch` /
`Off — Two Switches`) · Scan Speed · Sound Effects · Reset Progress (two-step) ·
← Back. Every change saves immediately and is spoken ("Steering: press to step").

**Pause menu:** Continue · Restart · Settings · Main Menu · Exit Game · Help
(speaks "I need help" and stays open).

**Exit Game** (title and pause): stop every audio loop, speak "Exiting to hub",
wait 700 ms, `window.parent.postMessage({ action: 'focusBackButton' }, '*')`
when framed, otherwise `location.href = '../../../index.html'`.


### 10.10 Race internals shared with items / ai / guide
`race.js` owns racers, physics, features, hits, laps and visuals. `items.js`,
`ai.js` and `guide.js` are called from inside `R.update(dt)` and may only use
what is listed here (plus the Racer fields in 10.5).

```
R.world          // W (10.4)             R.scene        // THREE.Scene
R.mode           // NK.C.MODES[mode]     R.modeId       // 'nofail' | 'open'
R.classDef       // NK.C.CLASSES[classId]  R.laps  R.L (lap metres)  R.time (s since GO)
R.phase          // 'intro'|'countdown'|'racing'|'done'
R.racers         // all racers, humans first      R.humans   // the human racers
R.rng            // NK.util.rng seeded per race (use it, never Math.random, for gameplay)
R.fx             // NK.art.fx system (sparks, burst, smoke …) or a no-op stub
R.timeTrial      // bool
R.hitRacer(victim, cause)      // cause: { kind:'item'|'hazard'|'contact'|'star'|'mega'|'jet'|'zapper'|'bomb'|'horn', by: racer|null, itemId? }
R.boost(racer, seconds, src)   // src: 'rocket'|'pad'|'turbo'|'trick'|'rocketStart'|'item'
R.giveCoins(racer, n)          // clamps to NK.C.COIN_MAX, emits 'coin'
R.placeOf(racer) → 1..n        R.byPlace() → racers sorted by place (1st first)
R.ahead(racer) → the racer one place ahead or null
R.gap(a, b) → metres of progress a is ahead of b (negative = behind)
R.emit(name, ...args)          R.on(name, fn)
R.itemObjects                  // array owned by items.js (projectiles, peels, bombs …)
R.cueOf(humanIdx)              // last guide result for that human
```

Racer fields items/ai/guide may WRITE: `steer` (-1|0|1), `targetLane` (via
`R.setTargetLane` semantics — set `racer.stepTarget = lane` to request a slide
to a lane), `item`, `roulette`, `rouletteKind`, the effect timers `starT megaT
jetT shrinkT`, `ai` (its own scratch object), `cue` (guide output). Everything
else is read-only for them; hits and boosts go through `R.hitRacer` / `R.boost`.

Per-frame order inside `R.update(dt)` while racing:
1. `NK.ai.update(R, r, dt)` for every CPU and every autopiloted human (finished,
   in Jet Mode, or `setAutopilot`), which sets `steer` / `stepTarget`.
2. steering, speed, drift, jumps, falls for every racer (race.js).
3. feature crossings, swept between last and current `progress`: coins, boost
   pads, ramps, Power Boxes (empty slot → `roulette = 1.4`, `rouletteKind =
   NK.items.roll(R, r)`), Power Pads (free boost), hazards via
   `W.hazardState(i, R.time)`. Revealing an item starts its random 3–6 second
   timer; expiry calls `NK.items.use(R, r)` independently of feature crossings.
4. `NK.items.update(R, dt)` — moves item objects, applies their hits.
5. vehicle-to-vehicle contact, star/mega/jet bumps.
6. positions, laps, finishes, events.
7. `NK.guide.update(R, h, dt)` for each human → `h.cue`.
8. visuals (vehicle poses, wheels, effects, blob shadows, drone).

When a module is missing, race.js falls back: no ai → CPUs hold their lane and
dodge nothing; no items → a box always gives `rocket` and a pad boosts; no
guide → `cue = { dir:0, active:false }`.

Items render their own objects with `NK.art.items.*` and add/remove them in
`R.scene`; race.js renders effects that live on a vehicle (star aura, jet shell,
mega/shrink scale, spin, wobble) from the racer's timers.

### 10.11 `NK.main` — renderer, loop and views
```
NK.main.init()                 // renderer + scene, canvas into #canvasWrap (or body), starts the loop
NK.main.renderer · NK.main.scene
NK.main.setViews(views, layout) // views: [{ camera }], layout 'single'|'side'|'stack'
NK.main.onFrame(fn)            // fn(dt) every frame before rendering
NK.main.onBeforeView(fn)       // fn(viewIdx, view) right before that view renders
NK.main.perf() (= NK.perf())   // { calls, tris, geometries, textures, pixelRatio, size, fps }
```
On `DOMContentLoaded` main.js boots the game (`NK.main.init(); NK.game.init(...);
NK.ui.init(); hide #loading`) unless a test page set `window.NK_AUTOBOOT = false`
first, in which case it only defines the API. dt is clamped to 0.05 s; up to 5
frame errors are tolerated (count decays after 4 s) before showing the error
card; `visibilitychange` resets the clock and asks `NK.game.pause()` when
hidden. Adaptive pixel ratio exactly as Race Tracks (PR_STEPS, shadows first
to go). In 2-player, each view is rendered with its own viewport/scissor and a
6 px divider in the page background colour; each camera's aspect follows its
view.

---

## 11. Audio — `NK.audio` (no AudioContext)
The rulebook forbids `AudioContext` in hub games (it has taken the Electron
renderer down). Everything plays through HTML5 `<audio>`:

- **Synthesis in JS, no asset files.** Every sound is rendered at load as PCM
  in plain JavaScript (oscillators, envelopes and noise computed sample by
  sample), wrapped in a 16-bit WAV header, and turned into a `Blob` URL
  (`URL.createObjectURL`). The desktop CSP allows `blob:` for media but **not
  for fetch**, so never fetch these URLs — hand them straight to `<audio>`.
  Rendering is spread over idle slices so boot never stalls.
- **One-shots** go through `SafeAudio.preload(name, blobUrl)` /
  `SafeAudio.play(name, vol)` (3-deep pools); **never** preload a built-in name
  with a URL. Anything that must overlap more than 3 deep gets variants.
- **Loops** use their own `new Audio(url)` elements with `loop = true`:
  - engine hum per human — `preservesPitch = false`, `playbackRate` follows
    speed (0.7–1.9), stereo pre-panned left/right in 2P;
  - music — one looping song per theme plus menu and podium; the final lap sets
    `playbackRate = 1.12` with `preservesPitch = true`;
  - drift crackle and the star loop.
- **Ducking.** While `speechSynthesis.speaking`, music drops to ~25 % and
  one-shots (except critical ones) to ~50 %, easing back after (Ballista's
  approach).
- **Toggles** `nk-settings.music` / `.sfx`, both in Settings; turning SFX back
  on mid-race restarts the engine loop.
- **Direction cues in 2P** keep pitch = direction (low = left, high = right) and
  use timbre per player (P1 bell, P2 marimba) rather than pan.

SFX list: menu move/select/blocked, countdown beeps and GO, box smash, roulette
ticks (slowing), item reveal, rocket whoosh, peel drop, ball/bee launch, zapper
siren, star loop, shrink zap, horn blast, bomb, hit/spin, wobble, coin (rising
pitch run), drift crackle + three level chimes, mini-turbo (by level), boost
pad, bump, rail rub, wall scrape, jump, trick, landing, fall, drone, waterfall
splash, loop whoosh, lap chime,
final-lap stinger, finish jingles (1st / podium / other), place up / down,
cue tones, danger pulse, pause-hold ticks.
Music: composed loops (melody + bass + chords + drums, 30–50 s, seamless) for
the menu and each of the 10 themes (Jungle: "Canopy Chase"; Isles: "Cloud
Hopper"), plus a podium fanfare and a results jingle.

---

## 12. Performance budget
Target 60 fps on a Surface Pro (integrated GPU) in 1P and ≥ 45 fps in 2P.
≤ 250 draw calls per view. Scenery merged per material per 400 m chunk; boxes
and coins are `InstancedMesh`; racers ≤ 8 calls each; no per-prop meshes;
gameplay props culled beyond 600 m. `NK.perf()` reports calls/tris like
Race Tracks' `RT.perf()`.

---

## 13. Test surface — `NK.debug` and the harness

**Node-only checks** (safe on any machine; no browser or GPU): `validate_tracks.js`
(every layout rule, mirrored), `jump_layout_test.cjs` (jumps, landscape gaps,
loops, waterfalls, islands, berms — including malformed layouts it must
reject), `setpiece_test.cjs` (full 12-kart races on the real worlds in both rule
sets: nobody ever drives on missing road, rescues land on road, loop speed is
true, loop lookups agree, the camera keeps the kart in view round a loop),
`race_test.cjs`, `items_ai_test.cjs`, `audio_check.js`. `node_render.cjs` renders
the real scene graph on the CPU to PNG (chase views of a track, prop sheets)
for visual review without a browser.

The Electron harness below is for machines where running a browser is fine.
`tools/harness/run.cjs` runs a scenario in a real Electron 40 window against
an http server rooted at `bennyshub/` (so the shared scripts resolve), with a
fresh profile, silent recorded speech and muted audio:
```
env -u ELECTRON_RUN_AS_NODE <hub>/node_modules/electron/dist/electron.exe \
    bennyshub/apps/games/NARBEKART/tools/harness/run.cjs <scenario.cjs> [--show]
```
It prints `OUT=<dir>` (screenshots + results.json) and exits non-zero on any
failed check or console error. See the helper reference at the end of
`run.cjs`; `smoke-racetracks.cjs` and `art-core.cjs` are small examples.
Offscreen by default (rAF runs at 60 fps); use `--show` to measure real FPS.
Keys are dispatched on `document`, so they travel window-capture → document
exactly like a real switch. Everything under `tools/` is dev-only (the website
build drops it).

Exposed for the harness:
`NK.debug.start({ players, mode, type, classId, trackId, picks })` jumps straight
into a race; `NK.debug.race()` returns R; `NK.debug.skipIntro()`,
`NK.debug.teleport(racerIdx, progress, x)`, `NK.debug.give(racerIdx, itemId)`,
`NK.debug.autopilot(humanIdx, on)` (drives only from the guidance cues — the
check that one-switch play is completable), `NK.debug.stats()`.
