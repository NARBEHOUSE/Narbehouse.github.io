# Benny's P3GL

A 3D peg shooter for Benny's Hub, played with one or two switches. Aim the
launcher, fire a ball down through the pegs, light them up, and meet each
level's goal before you run out of balls.

The folder is still called `BENNYSPEGGLE` and saves still use `bennys-peggle-*`
keys. Older v1 and v2 campaign files still open; the rebuilt game stores its
progress separately under `bennys-peggle-v3-*`. Everything players see says
**P3GL**.

## Three moods, nine campaigns, 180 levels

| Mode | Feel | Rules |
| --- | --- | --- |
| **Cozy** | Warm, slow, soothing worlds and music | You never run out of balls (five more arrive when you do). Wide catch plates, a long aim guide, no ball‑popping hazards. Difficulty stays gentle; the goals keep changing. |
| **Vivid** | Bright, colourful and lively | The classic game. Run out of balls and you try again. Each campaign climbs steadily from easy to challenging. |
| **Hyper** | Synthwave and deep space, lots of movement | Faster, bouncier, short aim guide, moving pegs everywhere, black holes and spikes. Gets tough by the end. |

Each mode has three campaigns of 20 levels, each with its own world
(animated 3D backdrop) and music:

- Cozy: Lantern Garden, Moonlit Lake, Snowglobe Hollow
- Vivid: Sugar Rush, Carnival Skies, Coral Groove
- Hyper: Neon Highway, Starlight Warp, Quasar Core

**Benny's Original** (the first P3GL's 20 levels, moved onto the new board)
and **My Campaigns** (made in the editor or opened from a file) are on the
mode screen.

### Goals

Clear the board · Break all the pegs of one colour (they carry a star) ·
Collect the gems · Light the lanterns · Break the bricks · Reach a score ·
Break enough pegs · Hit a big chain in one shot.

Anything the goal still needs has a pulsing ring. **Shot Fever** starts at ×1
each shot: lighting or breaking 5, 10 or 15 new pieces raises it to ×2, ×3 or ×5.
Repeated hits on the same piece do not build Fever. Meeting the goal mid‑shot turns
the bottom of the board into bonus slots, and balls left over add a bonus.

### The board

- **Pegs** light when hit and clear away in a popping run once the ball is
  gone. A ball that stalls among lit pegs gets them cleared early.
- **Powers** (power pegs): Multiball, Extra ball, Double points, Lightning
  happen at once; Spray shot, Safety net, Blast ball, Fireball and Super guide
  are saved for your next shot (one of each kind fires together).
- **Hazards**: Thief (steals a saved power), Shrinker, Sludge, Spike (pops the
  ball), Black hole (pulls and swallows).
- **Bricks**: barrier bricks (1–4 hits; colour and dots show hits left),
  armour (only blasts, fireballs and lightning crack it), glass (shatters,
  the ball flies through), steel walls, and gates opened by the key of the same
  colour. Also bumpers, steel posts, portals, lanterns and gems.
- **The base plate** moves along the bottom and is set per level: **Bounce**
  (sends the ball back up), **Catch** (catch the ball, keep it), or **Timed**
  (switches between the two; a bar on the plate shows when). Its state is shown
  by shape as well as colour: a cup for Catch, springs for Bounce.

## Controls

The original P3GL controls, kept on purpose.

| | Two switches (Auto Scan off) | One switch (Auto Scan on) |
| --- | --- | --- |
| Aim | Hold **Space** to sweep the aim. Each new press turns the other way. | The aim sweeps back and forth by itself. |
| Shoot | Release **Enter**. | Press **Enter** to freeze the aim, release to shoot. |
| Pause | Hold **Enter** (a ring fills and beeps rise). | Hold **Enter** (a shorter hold). |

**Before Each Shot: Choose Play or Pause** (Settings, in the main menu and in
the pause menu) puts a two‑stop choice in front of every shot for players who
cannot hold a switch: the board lights up for **Play**, the **Pause** button in
the bottom‑left corner lights up for Pause, and Space / Auto Scan moves between
them like any menu. Off by default ("Aim right away").
When this choice is enabled, holding Enter does not pause or show the hold ring.
Releasing Enter still selects the highlighted choice or fires the shot, however
long the press lasts. Choose Pause or use the corner Pause button to pause.

Selected buttons have a solid yellow fill, dark text and a thick outline in all
three modes. One button is highlighted at a time, with a solid outline.
Highlights stay visible without enlarging or pulsing the button.
The game fills the hub's viewport; fullscreen is handled by the hub.

Menus follow the hub contract: tap Space = next, hold Space = back, Enter =
choose, all on release. Every menu scans individual choices in order, including
modes, campaigns, custom campaigns and unlocked levels. Enter opens the highlighted
choice directly, with no row or section selection first. Mouse and touch work
everywhere: move the mouse to aim and click to shoot; on a touch screen tap
where you want the ball to go and it shoots. Dragging a finger only moves the
aim, and a tap held through a shot does not fire the next ball. The Pause
button is always in the bottom‑left corner during play.

Settings: Text to Speech, Voice, Before Each Shot, Aim & Guide (aim speed —
Super slow by default — guide length, colour and size), Display & Sound (music,
board backdrop for contrast, reduced motion, graphics quality), Auto Scan, Scan
Speed, Sound Effects, Reset Progress (two‑step).

Progress saves between shots. Continue restores the latest playable checkpoint;
closing during a shot lets you replay that shot. After three failed tries at a
level, the results screen offers **Skip This Level**, including the last level.
If too few pieces remain to achieve a chain goal, the pieces return for another
attempt. A ball trapped bouncing for too long is returned without costing a ball.

## Campaign Editor

`editor.html`, a mouse‑and‑keyboard tool for caregivers, teachers and
therapists, behind a spoken warning in the game. Campaign settings (title,
mode, world), a level list, every piece on a palette, pattern tools (line, arc,
grid, spiral, shape stamps), symmetry, motion (rotate, slide, orbit) with a live
preview, the base plate (width, speed, Bounce/Catch/Timed), goal settings, live
problem checks, a bot difficulty estimate with suggested star scores, test
play inside the editor, "My Campaigns" library, and JSON import/export. Old v1
and v2 P3GL files open too.
The editor opens in the game's current window so its library is shared in both
the web hub and the desktop hub. Use **Back to Game** to return.

## How it is built

Plain `<script>` tags, one `window.P3` namespace, three.js r155 (the same
vendored build as the hub's other 3D games), no build step. Sound and music
are synthesised in code and played through `<audio>` (no `AudioContext`, which
can crash the desktop app).

| File | Owns |
| --- | --- |
| `js/catalog.js` | Every piece, power, hazard, goal and the three modes' tuning |
| `js/levels.js` | Campaign format v3, validation, v1/v2 import, the editor library |
| `js/physics.js` | Deterministic 240 Hz board physics. The aim guide runs the same code ahead of time, so the line you aim with is the path the ball really takes |
| `js/match.js` | The rules of a level; emits events, knows nothing about drawing or sound |
| `js/game.js` | Level flow, controls, feedback, saving |
| `js/ui.js` | Menus, HUD, scanning, the Play / Pause choice, pause |
| `js/board.js`, `js/art.js`, `js/fx.js`, `js/post.js` | Rendering: instanced glossy pegs, effects, bloom and tone mapping |
| `js/backdrops*.js`, `js/themes.js` | The nine animated worlds |
| `js/audio.js` | Music, sound effects, speech queue |
| `js/layout.js` | Where the board and HUD go on any screen, portrait or landscape |

Campaigns are generated: `tools/campaigns/<mode>.cjs` describe the levels with
`tools/levelkit.cjs`, and `node tools/build-campaigns.cjs <mode> --bot` checks
every level, plays each one with the bot (`tools/bot.cjs`) to set the star
scores, and writes `campaigns/*.json`.

## Tests (run from this folder)

```
node tools/test/rules.cjs         every mechanic on a purpose-built board
node tools/test/guide.cjs         the aim guide matches the real shot
node tools/test/determinism.cjs   bot trial shots replay exactly
node tools/test/ui-flow.cjs       switch-only flow in a real browser (Playwright)
node tools/test/pause-mode.cjs    Play/Pause choice disables hold-to-pause in both switch modes
node tools/test/selection.cjs     visible selection in all modes, grids and Play/Pause
node tools/test/navigation.cjs    nested Back paths, settings, help, cancel and resume
node tools/test/navigation.cjs --hub --repro-only  Aim & Guide roundtrip inside the hub
node tools/test/navigation-loading.cjs  Back and Continue during delayed campaign loads
node tools/test/integration.cjs   mobile layouts, touch, save/reload, retries and all worlds
node tools/test/editor.cjs        editor tools, library, imports, export and live test play
node tools/test/audio.cjs --quiet music, effects, loudness and clean loop checks
node tools/build-campaigns.cjs all --bot      rebuild and re-measure every campaign
node tools/make-covers.cjs        campaign card screenshots (covers/*.jpg)
node tools/make-hub-shot.cjs      live game screenshot for images/games/bennyspeggle.png
```

Playwright comes from the website's `node_modules`. Screenshots go to the
website's `tmp/` folder. For local play, run `node tools/serve.cjs 8765` and open
`http://127.0.0.1:8765/apps/games/BENNYSPEGGLE/index.html`.
